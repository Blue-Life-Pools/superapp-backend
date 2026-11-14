import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { MicrosoftGraphService } from '../microsoft-graph/microsoft-graph.service';
import { PrismaService } from '../prisma/prisma.service';
import { OpportunitiesMailService } from './opportunities-mail.service';
import { estimateNumberFromMessage, opportunityMailbox, type EstimateMessage } from './opportunity-email';

const connectionId = 'estimates';
const prefer = { Prefer: 'IdType="ImmutableId", outlook.body-content-type="text"' };
const lifecycleEvents = new Set(['reauthorizationRequired', 'subscriptionRemoved', 'missed']);
const record = (value: unknown): value is Record<string, unknown> => Boolean(value && typeof value === 'object' && !Array.isArray(value));
const digest = (value: string) => createHash('sha256').update(value).digest();
type Subscription = { id: string; expirationDateTime: string; resource?: string; notificationUrl?: string; clientState?: string };
const notFound = (error: unknown) => error instanceof Error && /Graph request failed \((404|410)\)/.test(error.message);
const subscriptionError = (error: unknown) => {
  const text = error instanceof Error ? error.message : '';
  if (text === 'CALLBACK_NOT_READY') return 'Live email intake is waiting for the notification endpoint to be published.';
  if (/Graph request failed \((401|403)\)|authentication failed/.test(text)) return 'Microsoft 365 could not authorize live email notifications. Check the application connection.';
  if (/Graph request failed \(409\)/.test(text)) return 'An existing Microsoft 365 subscription must be reviewed before live intake can be connected.';
  return 'Live email notifications could not be activated or renewed. Existing opportunities are retained.';
};

@Injectable()
export class OpportunitiesMailEventsService {
  constructor(private readonly prisma: PrismaService, private readonly graph: MicrosoftGraphService, private readonly mail: OpportunitiesMailService, private readonly config: ConfigService) {}

  async setEnabled(enabled: boolean) {
    await this.mail.setEnabled(enabled);
    if (enabled) await this.maintain(2);
    else await this.removeSubscription();
    return this.mail.status();
  }
  private async removeSubscription() {
    const connection = await this.prisma.opportunityMailConnection.findUnique({ where: { id: connectionId } });
    if (connection?.subscriptionId) {
        try {
          await this.graph.request(`/subscriptions/${encodeURIComponent(connection.subscriptionId)}`, { method: 'DELETE', signal: AbortSignal.timeout(15000) });
          await this.prisma.opportunityMailConnection.updateMany({ where: { id: connectionId, subscriptionId: connection.subscriptionId }, data: { subscriptionId: null, subscriptionExpiresAt: null, subscriptionError: null } });
        } catch (error) {
          if (notFound(error)) await this.prisma.opportunityMailConnection.updateMany({ where: { id: connectionId, subscriptionId: connection.subscriptionId }, data: { subscriptionId: null, subscriptionExpiresAt: null, subscriptionError: null } });
          else await this.prisma.opportunityMailConnection.update({ where: { id: connectionId }, data: { subscriptionError: 'Intake is paused. Removing the Microsoft 365 subscription will be retried.' } });
        }
    }
  }
  private callbackUrl() {
    const url = new URL(this.config.get<string>('OPPORTUNITIES_MAIL_WEBHOOK_URL')?.trim() || 'https://superapp-backend-nine.vercel.app/opportunities/mail/notifications');
    if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) throw new Error('Invalid notification endpoint configuration.');
    return url.toString();
  }
  private async verifyEndpoint(url: string) {
    const token = `mail-intake-check-${randomUUID()}`;
    const response = await fetch(`${url}?validationToken=${encodeURIComponent(token)}`, { method: 'POST', headers: { 'Content-Type': 'text/plain; charset=utf-8' }, signal: AbortSignal.timeout(8000), redirect: 'error' });
    if (response.status !== 200 || !response.headers.get('content-type')?.toLowerCase().startsWith('text/plain') || await response.text() !== token) throw new Error('CALLBACK_NOT_READY');
  }
  async ensureSubscription(now = new Date()) {
    const connection = await this.prisma.opportunityMailConnection.findUnique({ where: { id: connectionId } });
    if (!connection?.enabled) { if (connection?.subscriptionId) await this.removeSubscription(); return { active: false, paused: true }; }
    const owner = randomUUID();
    const claim = await this.prisma.opportunityMailConnection.updateMany({ where: { id: connectionId, enabled: true, OR: [{ subscriptionLockUntil: null }, { subscriptionLockUntil: { lt: now } }] }, data: { subscriptionLockOwner: owner, subscriptionLockUntil: new Date(now.getTime() + 120000) } });
    if (!claim.count) return { active: Boolean(connection.subscriptionId && connection.subscriptionExpiresAt && connection.subscriptionExpiresAt > now), busy: true };
    try {
      const notificationUrl = this.callbackUrl();
      await this.verifyEndpoint(notificationUrl);
      const expirationDateTime = new Date(now.getTime() + 6 * 86400000).toISOString();
      let subscription: Subscription | null = null;
      if (connection.subscriptionId) {
        try { subscription = await this.graph.request<Subscription>(`/subscriptions/${encodeURIComponent(connection.subscriptionId)}`, { method: 'PATCH', body: JSON.stringify({ expirationDateTime }), signal: AbortSignal.timeout(15000) }); }
        catch (error) { if (!notFound(error)) throw error; }
      }
      let isNew = false;
      if (!subscription) {
        const clientState = connection.subscriptionClientState || randomBytes(32).toString('base64url');
        await this.prisma.opportunityMailConnection.updateMany({ where: { id: connectionId, subscriptionLockOwner: owner }, data: { subscriptionClientState: clientState } });
        // Recover our own subscription if Graph created it before a previous request timed out.
        const existing = await this.graph.request<{ value: Subscription[] }>('/subscriptions', { signal: AbortSignal.timeout(15000) });
        // Graph may canonicalize the mailbox address to its GUID. The unique
        // clientState and callback identify only the subscription we created.
        const own = existing.value?.find(row => row.clientState === clientState && row.notificationUrl === notificationUrl && row.resource?.toLowerCase().endsWith('/messages'));
        subscription = own ? await this.graph.request<Subscription>(`/subscriptions/${encodeURIComponent(own.id)}`, { method: 'PATCH', body: JSON.stringify({ expirationDateTime }), signal: AbortSignal.timeout(15000) }) : await this.graph.request<Subscription>('/subscriptions', {
          method: 'POST', headers: { Prefer: 'IdType="ImmutableId"' }, signal: AbortSignal.timeout(20000),
          body: JSON.stringify({ changeType: 'created', notificationUrl, lifecycleNotificationUrl: notificationUrl, resource: `users/${opportunityMailbox}/messages`, expirationDateTime, clientState, includeResourceData: false, latestSupportedTlsVersion: 'v1_2' }),
        });
        isNew = true;
      }
      const expires = new Date(subscription.expirationDateTime);
      if (!subscription.id || !Number.isFinite(expires.getTime()) || expires <= now) throw new Error('Invalid subscription response.');
      const saved = await this.prisma.opportunityMailConnection.updateMany({ where: { id: connectionId, subscriptionLockOwner: owner }, data: { subscriptionId: subscription.id, subscriptionExpiresAt: expires, subscriptionError: null, lastMaintenanceAt: now, ...(isNew ? { recoveryRequestedAt: now } : {}) } });
      if (!saved.count) throw new Error('Subscription lease expired.');
      return { active: true, expiresAt: expires, created: isNew };
    } catch (error) {
      const message = subscriptionError(error);
      await this.prisma.opportunityMailConnection.updateMany({ where: { id: connectionId, subscriptionLockOwner: owner }, data: { subscriptionError: message } });
      return { active: false, reason: message };
    } finally {
      await this.prisma.opportunityMailConnection.updateMany({ where: { id: connectionId, subscriptionLockOwner: owner }, data: { subscriptionLockOwner: null, subscriptionLockUntil: null } });
    }
  }
  async accept(payload: unknown, now = new Date()) {
    if (!record(payload) || !Array.isArray(payload.value) || !payload.value.length || payload.value.length > 1000) throw new BadRequestException('Invalid notification batch.');
    const connection = await this.prisma.opportunityMailConnection.findUnique({ where: { id: connectionId } });
    if (!connection?.enabled) return { accepted: 0, wake: false };
    const tenant = this.config.get<string>('MICROSOFT_TENANT_ID')?.trim().toLowerCase();
    const data: Array<{ eventKey: string; subscriptionId: string; messageId?: string; lifecycleEvent?: string }> = [];
    for (const notification of payload.value) {
      if (!record(notification) || typeof notification.clientState !== 'string' || notification.clientState.length > 128 || !connection.subscriptionClientState || notification.subscriptionId !== connection.subscriptionId || !timingSafeEqual(digest(notification.clientState), digest(connection.subscriptionClientState))) continue;
      if (notification.tenantId !== undefined && (typeof notification.tenantId !== 'string' || notification.tenantId.toLowerCase() !== tenant)) continue;
      if (typeof notification.lifecycleEvent === 'string' && lifecycleEvents.has(notification.lifecycleEvent)) {
        data.push({ eventKey: randomUUID(), subscriptionId: connection.subscriptionId!, lifecycleEvent: notification.lifecycleEvent });
      } else if (notification.changeType === 'created' && record(notification.resourceData) && typeof notification.resourceData.id === 'string' && notification.resourceData.id.length > 0 && notification.resourceData.id.length <= 2048 && (!notification.resourceData['@odata.type'] || notification.resourceData['@odata.type'] === '#Microsoft.Graph.Message')) {
        data.push({ eventKey: digest(`${connection.subscriptionId}:created:${notification.resourceData.id}`).toString('hex'), subscriptionId: connection.subscriptionId!, messageId: notification.resourceData.id });
      }
    }
    if (!data.length) throw new UnauthorizedException('Notification could not be verified.');
    // Persist the batch before acknowledging it; Graph may send the same message more than once.
    const count = await this.prisma.$transaction(async tx => {
      const created = await tx.opportunityMailNotification.createMany({ data, skipDuplicates: true });
      await tx.opportunityMailConnection.update({ where: { id: connectionId }, data: { lastNotificationAt: now } });
      return created.count;
    });
    return { accepted: count, wake: true };
  }
  async processPending(limit = 30, budgetMs = 45000) {
    const started = Date.now();
    let processed = 0, failed = 0;
    for (let i = 0; i < limit && Date.now() - started < budgetMs; i++) {
      if (!(await this.prisma.opportunityMailConnection.findUnique({ where: { id: connectionId }, select: { enabled: true } }))?.enabled) break;
      const now = new Date();
      const queued = await this.prisma.opportunityMailNotification.findFirst({ where: { OR: [{ status: { in: ['PENDING', 'FAILED'] }, availableAt: { lte: now } }, { status: 'PROCESSING', lockUntil: { lt: now } }] }, orderBy: { createdAt: 'asc' } });
      if (!queued) break;
      const owner = randomUUID();
      const claim = await this.prisma.opportunityMailNotification.updateMany({ where: { id: queued.id, status: queued.status, attempts: queued.attempts, lockUntil: queued.lockUntil }, data: { status: 'PROCESSING', attempts: { increment: 1 }, lockOwner: owner, lockUntil: new Date(now.getTime() + 120000) } });
      if (!claim.count) continue;
      try {
        if (queued.lifecycleEvent) {
          if (queued.lifecycleEvent === 'subscriptionRemoved') await this.prisma.opportunityMailConnection.updateMany({ where: { id: connectionId, subscriptionId: queued.subscriptionId }, data: { subscriptionId: null, subscriptionExpiresAt: null, recoveryRequestedAt: now } });
          if (queued.lifecycleEvent === 'missed') await this.prisma.opportunityMailConnection.update({ where: { id: connectionId }, data: { recoveryRequestedAt: now } });
          if (queued.lifecycleEvent !== 'missed' && !(await this.ensureSubscription()).active) throw new Error('Subscription maintenance failed.');
          if (queued.lifecycleEvent !== 'reauthorizationRequired') await this.recover(2);
        } else if (queued.messageId) {
          try {
            const url = `/users/${encodeURIComponent(opportunityMailbox)}/messages/${encodeURIComponent(queued.messageId)}`;
            // Check metadata first so unrelated email bodies are not downloaded.
            const metadata = await this.graph.request<EstimateMessage>(`${url}?$select=id,subject,from,receivedDateTime`, { headers: prefer, signal: AbortSignal.timeout(15000) });
            if (estimateNumberFromMessage(metadata)) {
              const message = await this.graph.request<EstimateMessage>(`${url}?$select=id,internetMessageId,subject,from,receivedDateTime,body`, { headers: prefer, signal: AbortSignal.timeout(15000) });
              await this.mail.receiveNotification(message);
            }
          } catch (error) { if (!notFound(error)) throw error; }
        }
        await this.prisma.opportunityMailNotification.updateMany({ where: { id: queued.id, lockOwner: owner }, data: { status: 'DONE', processedAt: new Date(), lockOwner: null, lockUntil: null, lastError: null } });
        await this.prisma.opportunityMailConnection.update({ where: { id: connectionId }, data: { lastNotificationProcessedAt: new Date() } });
        processed++;
      } catch {
        const message = 'A notified email could not be processed. It is saved for retry.';
        await this.prisma.opportunityMailNotification.updateMany({ where: { id: queued.id, lockOwner: owner }, data: { status: 'FAILED', lockOwner: null, lockUntil: null, availableAt: new Date(Date.now() + Math.min(3600, 15 * 2 ** Math.min(queued.attempts, 8)) * 1000), lastError: message } });
        await this.prisma.opportunityMailConnection.update({ where: { id: connectionId }, data: { notificationError: message } });
        failed++;
      }
    }
    if (!await this.prisma.opportunityMailNotification.count({ where: { status: { not: 'DONE' } } })) await this.prisma.opportunityMailConnection.updateMany({ where: { id: connectionId }, data: { notificationError: null } });
    return { processed, failed };
  }
  private async recover(maxPages: number) {
    const connection = await this.prisma.opportunityMailConnection.findUnique({ where: { id: connectionId } });
    if (!connection?.recoveryRequestedAt) return { recovery: false };
    const result = await this.mail.sync('manual', maxPages);
    if (!result.hasMore && !('paused' in result) && !('busy' in result)) await this.prisma.opportunityMailConnection.updateMany({ where: { id: connectionId, recoveryRequestedAt: connection.recoveryRequestedAt }, data: { recoveryRequestedAt: null } });
    return { recovery: true, ...result };
  }
  async maintain(maxRecoveryPages = 12) {
    const subscription = await this.ensureSubscription();
    if (!subscription.active) return subscription;
    const queue = await this.processPending(100, 180000);
    const recovery = await this.recover(maxRecoveryPages);
    return { ...subscription, ...queue, ...recovery };
  }
}
