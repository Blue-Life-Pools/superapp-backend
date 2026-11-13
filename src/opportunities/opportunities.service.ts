import { BadRequestException, Injectable, NotFoundException, ServiceUnavailableException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { createHash, timingSafeEqual } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { AutomationOpportunityDto, OpportunityInputDto, OpportunityQueryDto, UpdateOpportunityDto } from './opportunities.dto';
import { buildPropertyMatches, dateValue, normalizeOpportunity, opportunityFields, parseOpportunityCsv } from './opportunity-data';

const select = { id: true, propertyId: true, propertyName: true, linkedPropertyName: true, estimateNumber: true, estimateAmount: true, status: true, categories: true, contractor: true, name: true, creationDate: true, requestedBy: true, approvalDate: true, approvedBy: true, estimatedRepairDate: true, inSkimmer: true, assignedTechnician: true, actualRepairDate: true, invoiceNumber: true, invoiceAmount: true, invoiceDate: true, approvalTime: true, repairTime: true, invoiceTime: true, source: true, sourceMailbox: true, receivedAt: true, updatedAt: true } satisfies Prisma.OpportunitySelect;
const missing = '__NOT_RECORDED__';
const filterText = (value?: string) => value === missing ? null : value;
const csvLabels = ['Property', 'Linked property', 'Estimate number', 'Estimate amount', 'Status', 'Categories', 'Contractor', 'Opportunity name', 'Created / received date', 'Requested by', 'Approval date', 'Approved by', 'Estimated repair date', 'Skimmer', 'Assigned technician', 'Actual repair date', 'Invoice number', 'Invoice amount', 'Invoice date', 'Time to approve', 'Time to repair', 'Time to invoice'];

@Injectable()
export class OpportunitiesService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}
  private normalize(input: OpportunityInputDto | UpdateOpportunityDto) {
    try { return normalizeOpportunity(input); } catch (error) { throw new BadRequestException((error as Error).message); }
  }
  private where(query: OpportunityQueryDto, withStatus = true): Prisma.OpportunityWhereInput {
    const where: Prisma.OpportunityWhereInput = { deletedAt: null };
    if (query.search?.trim()) where.OR = ['propertyName', 'linkedPropertyName', 'estimateNumber', 'name', 'invoiceNumber', 'assignedTechnician', 'contractor'].map((field) => ({ [field]: { contains: query.search!.trim(), mode: 'insensitive' } }));
    if (withStatus && query.status) where.status = filterText(query.status);
    if (query.property) where.propertyName = query.property;
    if (query.category) where.categories = { has: query.category };
    if (query.contractor) where.contractor = filterText(query.contractor);
    if (query.technician) where.assignedTechnician = filterText(query.technician);
    try {
      if (query.from || query.to) {
        const from = dateValue(query.from), to = dateValue(query.to);
        if (from && to && from > to) throw new Error('From must be on or before To.');
        where.creationDate = { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
      }
    } catch (error) { throw new BadRequestException((error as Error).message); }
    return where;
  }
  private order(query: OpportunityQueryDto): Prisma.OpportunityOrderByWithRelationInput[] {
    const field = query.sort || 'creationDate', direction = query.direction || 'desc';
    return [{ [field]: ['propertyName'].includes(field) ? direction : { sort: direction, nulls: 'last' } }, { id: 'asc' }];
  }
  async list(query: OpportunityQueryDto) {
    const where = this.where(query), baseWhere = this.where(query, false), limit = query.limit || 25;
    const total = await this.prisma.opportunity.count({ where });
    const page = Math.min(query.page || 1, Math.max(1, Math.ceil(total / limit)));
    const [items, counts, options] = await Promise.all([
      this.prisma.opportunity.findMany({ where, select, orderBy: this.order(query), skip: (page - 1) * limit, take: limit }),
      this.prisma.opportunity.groupBy({ by: ['status'], where: baseWhere, _count: { _all: true } }),
      this.prisma.opportunity.findMany({ where: { deletedAt: null }, select: { status: true, propertyName: true, categories: true, contractor: true, assignedTechnician: true } }),
    ]);
    const values = (field: 'status' | 'propertyName' | 'contractor' | 'assignedTechnician') => [...new Set(options.map((row) => row[field]).filter((value): value is string => value !== null))].sort((a, b) => a.localeCompare(b));
    const count = (status: string) => counts.filter((row) => row.status?.toLowerCase() === status).reduce((sum, row) => sum + row._count._all, 0);
    return { items, total, page, limit, stats: { all: counts.reduce((sum, row) => sum + row._count._all, 0), pending: count('pending'), accepted: count('accepted'), converted: count('converted') }, facets: { statuses: values('status'), properties: values('propertyName'), categories: [...new Set(options.flatMap((row) => row.categories))].sort(), contractors: values('contractor'), technicians: values('assignedTechnician'), hasUnspecifiedStatus: options.some((row) => row.status === null) } };
  }
  async detail(id: string) {
    const item = await this.prisma.opportunity.findFirst({ where: { id, deletedAt: null }, select });
    if (!item) throw new NotFoundException('Opportunity not found.');
    return item;
  }
  private async matchProperty(data: Record<string, unknown>) {
    const properties = await this.prisma.property.findMany({ where: { deletedAt: null }, select: { id: true, name: true } });
    return buildPropertyMatches(properties)([data.propertyName as string, data.linkedPropertyName as string]);
  }
  async create(input: OpportunityInputDto) {
    const data = this.normalize(input);
    return this.prisma.opportunity.create({ data: { ...data, propertyId: await this.matchProperty(data) } as Prisma.OpportunityUncheckedCreateInput, select });
  }
  async update(id: string, input: UpdateOpportunityDto) {
    const previous = await this.detail(id), data = this.normalize(input);
    if ('propertyName' in data || 'linkedPropertyName' in data) data.propertyId = await this.matchProperty({ ...previous, ...data });
    return this.prisma.opportunity.update({ where: { id }, data: data as Prisma.OpportunityUncheckedUpdateInput, select });
  }
  async remove(id: string) { await this.detail(id); return this.prisma.opportunity.update({ where: { id }, data: { deletedAt: new Date() }, select: { id: true } }); }
  async importCsv(buffer: Buffer, fileName: string) {
    let rows: ReturnType<typeof parseOpportunityCsv>;
    try { rows = parseOpportunityCsv(buffer, fileName); } catch (error) { throw new BadRequestException((error as Error).message); }
    const properties = await this.prisma.property.findMany({ where: { deletedAt: null }, select: { id: true, name: true } }), match = buildPropertyMatches(properties);
    const data = rows.map((row) => ({ ...row, propertyId: match([row.propertyName as string, row.linkedPropertyName as string]) })) as Prisma.OpportunityCreateManyInput[];
    const inserted = await this.prisma.$transaction(async (tx) => {
      let created = 0;
      for (let index = 0; index < data.length; index += 200) created += (await tx.opportunity.createMany({ data: data.slice(index, index + 200), skipDuplicates: true })).count;
      return created;
    }, { timeout: 60000 });
    return { rows: rows.length, inserted, skipped: rows.length - inserted, matchedProperties: data.filter((row) => row.propertyId).length, fileName };
  }
  async exportCsv(query: OpportunityQueryDto) {
    const items = await this.prisma.opportunity.findMany({ where: this.where(query), select, orderBy: this.order(query) });
    const csvCell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`;
    const rows = items.map((item) => opportunityFields.map((field) => { const value = item[field]; return value instanceof Date ? value.toISOString().slice(0, 10) : Array.isArray(value) ? value.join(',') : typeof value === 'boolean' ? value ? 'True' : 'False' : value; }));
    return '\uFEFF' + [csvLabels, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  }
  async integrationStatus() {
    const last = await this.prisma.opportunity.findFirst({ where: { source: 'POWER_AUTOMATE', deletedAt: null }, orderBy: { receivedAt: 'desc' }, select: { receivedAt: true } });
    return { configured: Boolean(this.config.get<string>('OPPORTUNITIES_INGEST_KEY')?.trim()), mailbox: 'ximena.velosa@bluelifepools.com', lastReceivedAt: last?.receivedAt || null };
  }
  async ingest(input: AutomationOpportunityDto, key?: string) {
    const expected = this.config.get<string>('OPPORTUNITIES_INGEST_KEY')?.trim();
    if (!expected) throw new ServiceUnavailableException('Automatic intake is not configured.');
    const hash = (value: string) => createHash('sha256').update(value).digest();
    if (!key || !timingSafeEqual(hash(key), hash(expected))) throw new UnauthorizedException('Invalid intake credentials.');
    if (input.mailbox.trim().toLowerCase() !== 'ximena.velosa@bluelifepools.com') throw new BadRequestException('The mailbox is not configured for this intake.');
    if (!input.estimateNumber?.trim()) throw new BadRequestException('Estimate number is required for automatic intake.');
    if (!input.externalId.trim()) throw new BadRequestException('External record ID is required for automatic intake.');
    const { externalId, mailbox, receivedAt, ...fields } = input;
    const parts = new Intl.DateTimeFormat('en', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(receivedAt));
    const day = ['year', 'month', 'day'].map((type) => parts.find((part) => part.type === type)!.value).join('-');
    const data = this.normalize({ ...fields, creationDate: day });
    const identity = { source: 'POWER_AUTOMATE', sourceRecordId: externalId.trim() };
    const existing = await this.prisma.opportunity.findUnique({ where: { source_sourceRecordId: identity } });
    if (existing?.deletedAt) return { id: existing.id, skipped: true };
    const common = { ...data, propertyId: await this.matchProperty(data), sourceMailbox: mailbox.toLowerCase(), receivedAt: new Date(receivedAt) };
    return this.prisma.opportunity.upsert({ where: { source_sourceRecordId: identity }, create: { ...common, ...identity, status: data.status ?? 'Pending' } as Prisma.OpportunityUncheckedCreateInput, update: common as Prisma.OpportunityUncheckedUpdateInput, select });
  }
}
