import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { MicrosoftGraphService } from '../microsoft-graph/microsoft-graph.service';
import { PrismaService } from '../prisma/prisma.service';
import { buildPropertyMatches, normalizeOpportunity, propertyKey } from './opportunity-data';
import { emailIdentity, estimateSender, opportunityMailbox, parseEstimateEmail, type EstimateMessage } from './opportunity-email';
import { OpportunityInputDto } from './opportunities.dto';

type MessagePage = { value: EstimateMessage[]; '@odata.nextLink'?: string };
const connectionId = 'estimates';
const identity = (messageId: string) => ({ mailbox: opportunityMailbox, messageId });
const safeError = (error: unknown) => {
  const message = error instanceof Error ? error.message : '';
  if (/Missing Microsoft integration/.test(message)) return 'Microsoft 365 credentials are not configured on the server.';
  if (/authentication failed/.test(message)) return 'Microsoft 365 authentication failed. Check the application credentials.';
  if (/Graph request failed \((401|403)\)/.test(message)) return 'Microsoft 365 denied mailbox access. Check application Mail.Read permission and mailbox access.';
  if (/Graph request failed \(429\)/.test(message)) return 'Microsoft 365 is limiting requests. The next sync will retry this page.';
  return 'Email sync could not finish. Saved records are retained and the next sync resumes safely.';
};

@Injectable()
export class OpportunitiesMailService {
  constructor(private readonly prisma: PrismaService, private readonly graph: MicrosoftGraphService, private readonly config: ConfigService) {}

  private configured() { return ['MICROSOFT_TENANT_ID', 'MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'].every(key => Boolean(this.config.get<string>(key)?.trim())); }
  async status() {
    const [connection, counts, latest] = await Promise.all([
      this.prisma.opportunityMailConnection.findUnique({ where: { id: connectionId } }),
      this.prisma.opportunityEmailReceipt.groupBy({ by: ['status'], where: { mailbox: opportunityMailbox }, _count: { _all: true } }),
      this.prisma.opportunityEmailReceipt.findFirst({ where: { mailbox: opportunityMailbox }, orderBy: { receivedAt: 'desc' }, select: { receivedAt: true } }),
    ]);
    const count = (status: string) => counts.find(row => row.status === status)?._count._all || 0;
    return {
      provider: 'Microsoft 365', configured: this.configured(), mailbox: opportunityMailbox,
      enabled: connection?.enabled || false, automatic: Boolean(connection?.enabled && connection.lastScheduledSyncAt),
      lastSyncAt: connection?.lastSyncAt || null, lastScheduledSyncAt: connection?.lastScheduledSyncAt || null,
      lastReceivedAt: latest?.receivedAt || null, lastError: connection?.lastError || null,
      hasMore: Boolean(connection?.nextLink), imported: count('IMPORTED'), linked: count('LINKED'), review: count('NEEDS_REVIEW'),
      schedule: 'Every 15 minutes',
    };
  }
  async setEnabled(enabled: boolean) {
    if (enabled) {
      if (!this.configured()) throw new ServiceUnavailableException('Microsoft 365 credentials are not configured on the server.');
      try { await this.graph.request(`/users/${encodeURIComponent(opportunityMailbox)}/messages?$top=1&$select=id`, { signal: AbortSignal.timeout(20000) }); }
      catch (error) { throw new ServiceUnavailableException(safeError(error)); }
    }
    await this.prisma.opportunityMailConnection.upsert({ where: { id: connectionId }, create: { id: connectionId, mailbox: opportunityMailbox, enabled }, update: { enabled, lastError: null } });
    return this.status();
  }
  async reviewMessages() {
    const messages = await this.prisma.opportunityEmailReceipt.findMany({ where: { mailbox: opportunityMailbox, status: 'NEEDS_REVIEW' }, orderBy: { receivedAt: 'desc' }, take: 50, select: { id: true, subject: true, receivedAt: true, reason: true, parsedFields: true, estimateNumber: true, propertyName: true } });
    if (!messages.length) return [];
    const [rows, properties] = await Promise.all([
      this.prisma.opportunity.findMany({ where: { deletedAt: null, estimateNumber: { in: messages.flatMap(row => row.estimateNumber ? [row.estimateNumber] : []) } }, select: { id: true, propertyId: true, propertyName: true, linkedPropertyName: true, estimateNumber: true, estimateAmount: true, creationDate: true, status: true } }),
      this.prisma.property.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }),
    ]);
    const match = buildPropertyMatches(properties);
    return messages.map(message => ({ ...message, candidates: rows.filter(row => row.estimateNumber === message.estimateNumber && this.sameProperty(row, message.propertyName, match(message.propertyName ? [message.propertyName] : []))) }));
  }
  private sameProperty(row: { propertyId: string | null; propertyName: string; linkedPropertyName: string | null }, name: string | null, propertyId: string | null) {
    return Boolean((propertyId && row.propertyId === propertyId) || (name && [row.propertyName, row.linkedPropertyName].some(value => value && propertyKey(value) === propertyKey(name))));
  }
  async linkReview(id: string, opportunityId: string) {
    const review = (await this.reviewMessages()).find(row => row.id === id);
    if (!review || !review.candidates.some(row => row.id === opportunityId)) throw new BadRequestException('Choose an existing record for this estimate and property.');
    const changed = await this.prisma.opportunityEmailReceipt.updateMany({ where: { id, status: 'NEEDS_REVIEW' }, data: { status: 'LINKED', reason: null, opportunityId } });
    if (!changed.count) throw new NotFoundException('This email no longer needs review.');
    return { id: opportunityId };
  }
  async resolveReview(id: string, input: OpportunityInputDto) {
    let fields: Record<string, unknown>;
    try { fields = normalizeOpportunity(input); } catch (error) { throw new BadRequestException((error as Error).message); }
    const properties = await this.prisma.property.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
    return this.prisma.$transaction(async tx => {
      const receipt = await tx.opportunityEmailReceipt.findUnique({ where: { id } });
      if (!receipt || receipt.status !== 'NEEDS_REVIEW') throw new NotFoundException('This email no longer needs review.');
      const claim = await tx.opportunityEmailReceipt.updateMany({ where: { id, status: 'NEEDS_REVIEW' }, data: { status: 'PROCESSING' } });
      if (!claim.count) throw new NotFoundException('This email no longer needs review.');
      const message = { id: receipt.messageId, receivedDateTime: receipt.receivedAt.toISOString() };
      const created = await tx.opportunity.create({ data: { ...fields, propertyName: fields.propertyName as string, propertyId: buildPropertyMatches(properties)([fields.propertyName as string]), source: 'MICROSOFT_365', sourceRecordId: emailIdentity(message), sourceMailbox: opportunityMailbox, receivedAt: receipt.receivedAt, sourceMetadata: { subject: receipt.subject, reviewed: true } } as Prisma.OpportunityUncheckedCreateInput });
      await tx.opportunityEmailReceipt.update({ where: { id }, data: { status: 'IMPORTED', reason: null, opportunityId: created.id } });
      return { id: created.id };
    });
  }
  private graphPath(nextLink: string) {
    const url = new URL(nextLink);
    if (url.origin !== 'https://graph.microsoft.com' || decodeURIComponent(url.pathname).toLowerCase() !== `/v1.0/users/${opportunityMailbox}/messages`) throw new Error('Invalid Microsoft Graph pagination link.');
    return url.pathname.slice('/v1.0'.length) + url.search;
  }
  private async firstScanDate(now: Date) {
    const explicit = this.config.get<string>('OPPORTUNITIES_MAIL_START_DATE')?.trim();
    if (explicit) { const date = new Date(explicit); if (Number.isFinite(date.getTime()) && date <= now) return date; throw new Error('Invalid mail start date.'); }
    const latest = await this.prisma.opportunity.findFirst({ where: { source: 'CSV', creationDate: { lte: now } }, orderBy: { creationDate: { sort: 'desc', nulls: 'last' } }, select: { creationDate: true } });
    return new Date(latest?.creationDate ? latest.creationDate.getTime() - 2 * 86400000 : now.getTime() - 7 * 86400000);
  }
  async sync(kind: 'manual' | 'scheduled' = 'manual', maxPages = 2, now = new Date()) {
    const connection = await this.prisma.opportunityMailConnection.findUnique({ where: { id: connectionId } });
    if (!connection?.enabled) return { paused: true, created: 0, linked: 0, review: 0, scanned: 0, hasMore: false };
    if (!this.configured()) throw new ServiceUnavailableException('Microsoft 365 credentials are not configured on the server.');
    const lockOwner = randomUUID();
    const claimed = await this.prisma.opportunityMailConnection.updateMany({ where: { id: connectionId, enabled: true, OR: [{ lockUntil: null }, { lockUntil: { lt: now } }] }, data: { lockOwner, lockUntil: new Date(now.getTime() + 10 * 60000) } });
    if (!claimed.count) return { busy: true, created: 0, linked: 0, review: 0, scanned: 0, hasMore: Boolean(connection.nextLink) };
    const totals = { created: 0, linked: 0, review: 0, scanned: 0 };
    let hasMore = false;
    try {
      const from = connection.lastScannedAt ? new Date(connection.lastScannedAt.getTime() - 5 * 60000) : await this.firstScanDate(now);
      const through = connection.scanThrough || now;
      const params = new URLSearchParams({ '$filter': `receivedDateTime ge ${from.toISOString()} and receivedDateTime le ${through.toISOString()} and from/emailAddress/address eq '${estimateSender}'`, '$orderby': 'receivedDateTime asc', '$top': '25', '$select': 'id,internetMessageId,subject,receivedDateTime,from,body' });
      let pagePath: string | null = connection.nextLink ? this.graphPath(connection.nextLink) : `/users/${encodeURIComponent(opportunityMailbox)}/messages?${params}`;
      const properties = await this.prisma.property.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
      const match = buildPropertyMatches(properties);
      for (let page = 0; page < maxPages && pagePath; page++) {
        const result: MessagePage = await this.graph.request<MessagePage>(pagePath, { headers: { Prefer: 'IdType="ImmutableId", outlook.body-content-type="text"' }, signal: AbortSignal.timeout(20000) });
        for (const message of result.value || []) {
          const type = await this.receive(message, match);
          totals.scanned++;
          if (type === 'IMPORTED') totals.created++;
          if (type === 'LINKED') totals.linked++;
          if (type === 'NEEDS_REVIEW') totals.review++;
        }
        const next = result['@odata.nextLink'] || null;
        pagePath = next ? this.graphPath(next) : null;
        const saved = await this.prisma.opportunityMailConnection.updateMany({ where: { id: connectionId, lockOwner }, data: { nextLink: next, scanThrough: next ? through : null, ...(next ? {} : { lastScannedAt: through }) } });
        if (!saved.count) throw new Error('Email sync lease expired.');
        hasMore = Boolean(next);
      }
      await this.prisma.opportunityMailConnection.updateMany({ where: { id: connectionId, lockOwner }, data: { lastSyncAt: now, ...(kind === 'scheduled' ? { lastScheduledSyncAt: now } : {}), lastError: null, lastCreated: totals.created, lastLinked: totals.linked, lastReview: totals.review } });
      return { ...totals, hasMore };
    } catch (error) {
      const message = safeError(error);
      // Expired Graph paging tokens may be retried from the last completed window.
      const reset = error instanceof Error && /Graph request failed \((400|404|410)\)/.test(error.message);
      await this.prisma.opportunityMailConnection.updateMany({ where: { id: connectionId, lockOwner }, data: { lastError: message, ...(reset ? { nextLink: null, scanThrough: null } : {}) } });
      throw new ServiceUnavailableException(message);
    } finally {
      await this.prisma.opportunityMailConnection.updateMany({ where: { id: connectionId, lockOwner }, data: { lockOwner: null, lockUntil: null } });
    }
  }
  private async receive(message: EstimateMessage, match: ReturnType<typeof buildPropertyMatches>) {
    if (!message.id || !message.receivedDateTime) throw new Error('Missing Microsoft message identity.');
    const parsed = parseEstimateEmail(message);
    if (!parsed) return 'IGNORED';
    return this.prisma.$transaction(async tx => {
      const key = identity(message.id);
      if (await tx.opportunityEmailReceipt.findUnique({ where: { mailbox_messageId: key } })) return 'EXISTING';
      const { fields } = parsed;
      const propertyId = fields.propertyName ? match([fields.propertyName]) : null;
      const candidates = fields.propertyName ? (await tx.opportunity.findMany({ where: { estimateNumber: fields.estimateNumber }, select: { id: true, propertyId: true, propertyName: true, linkedPropertyName: true, deletedAt: true } })).filter(row => this.sameProperty(row, fields.propertyName!, propertyId)) : [];
      let reason = parsed.reason;
      if (!reason && candidates.length > 1) reason = 'Several existing opportunities match this estimate and property. Review before linking.';
      const status = reason ? 'NEEDS_REVIEW' : candidates[0]?.deletedAt ? 'IGNORED_DELETED' : candidates.length === 1 ? 'LINKED' : 'IMPORTED';
      let opportunityId = candidates.length === 1 ? candidates[0].id : null;
      if (status === 'IMPORTED') {
        const created = await tx.opportunity.create({ data: { ...normalizeOpportunity(fields), propertyName: fields.propertyName!, propertyId, source: 'MICROSOFT_365', sourceRecordId: emailIdentity(message), sourceMailbox: opportunityMailbox, receivedAt: new Date(message.receivedDateTime), sourceMetadata: { subject: message.subject || '', internetMessageId: message.internetMessageId || null } } as Prisma.OpportunityUncheckedCreateInput, select: { id: true } });
        opportunityId = created.id;
      }
      await tx.opportunityEmailReceipt.create({ data: { ...key, subject: (message.subject || '').slice(0, 1000), receivedAt: new Date(message.receivedDateTime), estimateNumber: fields.estimateNumber, propertyName: fields.propertyName || null, status, reason, parsedFields: fields, bodyText: parsed.text.slice(0, 30000), opportunityId } });
      return status;
    });
  }
}
