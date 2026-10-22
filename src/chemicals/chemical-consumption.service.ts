import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { allocateConsumption, distributeInteger } from './consumption-allocation';
import { ConsumptionChemicalDto, ConsumptionImportDto, ConsumptionReferenceDto, CreateChemicalFollowUpCommentDto, SolveChemicalFollowUpDto, UpdateConsumptionPeriodDto } from './dto/chemical-consumption.dto';
import type { AuthenticatedUser } from '../auth/auth.service';
import { historicalChemicals, historicalRange, matchConsumptionHistory } from './consumption-history';
import type { HistoryProperty } from './consumption-history.types';
import { companyConsumptionReport, globalCompanyConsumptionReport, companyMaximumBaseProperties } from './consumption-company-report';

const propertySelect = { id: true, name: true, code: true, waterBodies: true, chemicalFollowUpResolvedAt: true, chemicalFollowUpResolution: true } as const;
const nameKey = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
@Injectable()
export class ChemicalConsumptionService {
  constructor(private readonly prisma: PrismaService) {}
  private historyCache?: { expiresAt: number; data: HistoryProperty[] };
  private async readHistory() {
    if (this.historyCache && this.historyCache.expiresAt > Date.now()) return this.historyCache.data;
    const rows = await this.prisma.chemicalConsumptionHistory.findMany({ where: { sourceYear: 2025 }, select: { code: true, name: true, chemicals: true, factors: true } });
    const data = rows as unknown as HistoryProperty[];
    this.historyCache = { expiresAt: Date.now() + 300000, data };
    return data;
  }
  private validMonth(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Choose a valid month.');
  }
  async companyReport(month: string) {
    const global = month === 'global';
    if (!global) this.validMonth(month);
    const active = { deletedAt: null, lifecycleStatus: { not: 'INACTIVE' } };
    const [properties, periods, archive, available, maximums] = await Promise.all([
      this.prisma.property.findMany({ where: active, select: { id: true, name: true, code: true }, orderBy: { name: 'asc' } }),
      this.prisma.chemicalConsumptionPeriod.findMany({ where: { ...(global ? {} : { month }), sourceName: { not: null }, property: active }, select: { propertyId: true, month: true, sourceName: true, chemicals: true } }),
      this.readHistory(),
      this.prisma.chemicalConsumptionPeriod.findMany({ where: { sourceName: { not: null }, property: active }, select: { month: true }, distinct: ['month'], orderBy: { month: 'desc' } }),
      this.prisma.chemicalConsumptionMaximum.findMany({ select: { propertyCode: true, propertyName: true, chemicalName: true, unit: true, maximum: true, recordedMonths: true, excludedMonths: true, sourceName: true } }),
    ]);
    const report = global
      ? globalCompanyConsumptionReport(properties, periods as unknown as Parameters<typeof globalCompanyConsumptionReport>[1], archive, { basePropertyCount: companyMaximumBaseProperties }, maximums)
      : companyConsumptionReport(month, properties, periods as unknown as Parameters<typeof companyConsumptionReport>[2], archive, { basePropertyCount: companyMaximumBaseProperties }, maximums);
    return { ...report, availableMonths: available.map((period) => period.month) };
  }
  async list(month: string) {
    this.validMonth(month);
    const year = month.slice(0, 4);
    const [properties, periods, allPeriods, archive] = await Promise.all([
      this.prisma.property.findMany({ where: { deletedAt: null }, select: propertySelect, orderBy: { name: 'asc' } }),
      this.prisma.chemicalConsumptionPeriod.findMany({ where: { month, property: { deletedAt: null } }, include: { property: { select: propertySelect } } }),
      this.prisma.chemicalConsumptionPeriod.findMany({ where: { month: { startsWith: `${year}-` }, sourceName: { not: null }, property: { deletedAt: null } }, include: { property: { select: propertySelect } }, orderBy: [{ propertyId: 'asc' }, { month: 'asc' }] }),
      this.readHistory(),
    ]);
    const history = matchConsumptionHistory(properties, archive as unknown as HistoryProperty[]);
    const combined: any[] = periods.map((period) => {
      const archived = history.get(period.propertyId);
      return !period.sourceName && archived && historicalChemicals(archived, month)
        ? { ...period, chemicals: historicalChemicals(archived, month), sourceName: 'Skimmer history 2025', historicalOnly: true }
        : period;
    });
    for (const property of properties) {
      if (combined.some((period) => period.propertyId === property.id)) continue;
      const archived = history.get(property.id);
      const chemicals = archived && historicalChemicals(archived, month);
      if (chemicals) combined.push({ propertyId: property.id, property, month, chemicals, sourceName: 'Skimmer history 2025', historicalOnly: true, monthlyFee: null, feeSource: null, budgetPercent: null, references: [], seasonFactor: 1 });
    }
    const recurring = new Map<string, { propertyId: string; propertyName: string; entries: Array<{ month: string; chemicalName: string; unit: string; quantity: number; threshold: number; excessPercent: number }> }>();
    for (const period of allPeriods) {
      const presented = this.present(period, history.get(period.propertyId));
      for (const chemical of presented.chemicals.filter((item: any) => item.status === 'HIGH' && item.expectedMax != null)) {
        const item = recurring.get(period.propertyId) || { propertyId: period.propertyId, propertyName: period.property.name, entries: [] };
        item.entries.push({ month: period.month, chemicalName: chemical.name, unit: chemical.unit, quantity: chemical.quantity, threshold: chemical.expectedMax, excessPercent: chemical.excessPercent ?? 0 });
        recurring.set(period.propertyId, item);
      }
    }
    const resolved = Object.fromEntries(properties.map((property) => [property.id, Boolean(property.chemicalFollowUpResolvedAt)]));
    const recurringOverconsumption = [...recurring.values()].map((item) => ({ ...item, months: new Set(item.entries.map((entry) => entry.month)).size, resolved: resolved[item.propertyId] || false })).filter((item) => item.months > 1).sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.months - a.months || b.entries.length - a.entries.length || a.propertyName.localeCompare(b.propertyName));
    const followUpModel = (this.prisma as any).chemicalFollowUpComment;
    const followUps = followUpModel?.groupBy ? await followUpModel.groupBy({ by: ['propertyId'], _count: { _all: true } }) : [];
    const followUpCounts = Object.fromEntries(followUps.map((item) => [item.propertyId, item._count._all]));
    return { properties, periods: combined.map((period) => this.present(period, history.get(period.propertyId))), recurringOverconsumption: recurringOverconsumption.map((item) => ({ ...item, followUpCount: followUpCounts[item.propertyId] || 0 })), followUpCounts, history: { year: 2025, matchedProperties: history.size, unmatchedProperties: properties.length - history.size, preliminary: true } };
  }

  async listFollowUp(propertyId: string) {
    await this.prisma.property.findUniqueOrThrow({ where: { id: propertyId, deletedAt: null }, select: { id: true } });
    return this.prisma.chemicalFollowUpComment.findMany({ where: { propertyId }, orderBy: [{ occurredAt: 'desc' }, { createdAt: 'desc' }] });
  }

  async createFollowUp(propertyId: string, data: CreateChemicalFollowUpCommentDto, user?: AuthenticatedUser) {
    await this.prisma.property.findUniqueOrThrow({ where: { id: propertyId, deletedAt: null }, select: { id: true } });
    const body = data.body.trim();
    if (!body) throw new BadRequestException('Write a follow-up comment.');
    const tags = [...new Set((data.tags || []).map((tag) => tag.trim().replace(/^@/, '')).filter(Boolean))];
    return this.prisma.chemicalFollowUpComment.create({ data: { propertyId, authorId: user?.id || null, authorName: user?.name || 'Unknown user', body, tags, occurredAt: data.occurredAt ? new Date(`${data.occurredAt}T12:00:00`) : undefined } });
  }

  async solveFollowUp(propertyId: string, data: SolveChemicalFollowUpDto, user?: AuthenticatedUser) {
    const solution = data.solution.trim();
    if (!solution) throw new BadRequestException('Write the solution before marking this property as solved.');
    await this.prisma.property.findUniqueOrThrow({ where: { id: propertyId, deletedAt: null }, select: { id: true } });
    const now = new Date();
    return this.prisma.$transaction(async (transaction) => {
      await transaction.property.update({ where: { id: propertyId }, data: { chemicalFollowUpResolvedAt: now, chemicalFollowUpResolvedById: user?.id || null, chemicalFollowUpResolution: solution } });
      return transaction.chemicalFollowUpComment.create({ data: { propertyId, authorId: user?.id || null, authorName: user?.name || 'Unknown user', body: solution, tags: ['solved'], occurredAt: now } });
    });
  }
  private present(period: any, history?: HistoryProperty) {
    const chemicals = period.chemicals as ConsumptionChemicalDto[];
    const references = period.references as ConsumptionReferenceDto[];
    const totalCost = chemicals.reduce((sum, chemical) => sum + chemical.cost, 0);
    const monthlyFee = period.monthlyFee === null ? null : Number(period.monthlyFee);
    const allocation = allocateConsumption(period.property.waterBodies, monthlyFee, totalCost);
    const alerts = chemicals.map((chemical) => {
      const reference = references.find((item) => nameKey(item.name) === nameKey(chemical.name) && item.unit.toLowerCase() === chemical.unit.toLowerCase());
      const manual = reference && (reference.min !== undefined || reference.max !== undefined);
      const historical = manual ? null : historicalRange(history, chemical.name, chemical.unit, period.month);
      const min = manual ? reference.min === undefined ? null : reference.min * period.seasonFactor : historical?.expectedMin ?? null;
      const max = manual ? reference.max === undefined ? null : reference.max * period.seasonFactor : historical?.expectedMax ?? null;
      return { ...chemical, ...historical, referenceSource: manual ? 'MANUAL' : historical ? 'HISTORY_2025' : null, expectedMin: min, expectedMax: max, excessQuantity: max !== null ? Math.max(0, chemical.quantity - max) : null, excessPercent: max !== null && max > 0 ? Math.max(0, (chemical.quantity / max - 1) * 100) : null, status: min === null && max === null ? 'NO_REFERENCE' : max !== null && chemical.quantity > max ? 'HIGH' : min !== null && chemical.quantity < min ? 'LOW' : 'IN_RANGE' };
    });
    const budget = monthlyFee === null || period.budgetPercent === null ? null : monthlyFee * period.budgetPercent / 100;
    const allocatedBodies = allocation.bodies.map((body, index) => {
      const assigned = chemicals.map((chemical) => ({ ...chemical, quantity: distributeInteger(Math.round(chemical.quantity * 10000), allocation.bodies.map((item) => item.share))[index] / 10000, cost: distributeInteger(Math.round(chemical.cost * 100), allocation.bodies.map((item) => item.share))[index] / 100 }));
      const chemicalCost = Math.round(assigned.reduce((sum, item) => sum + item.cost, 0) * 100) / 100;
      return { ...body, chemicals: assigned, chemicalCost, costPercent: body.monthlyFee && body.monthlyFee > 0 ? chemicalCost / body.monthlyFee * 100 : null };
    });
    return { ...period, property: undefined, monthlyFee, totalCost: Math.round(totalCost * 100) / 100, costPercent: monthlyFee && monthlyFee > 0 ? totalCost / monthlyFee * 100 : null, budget, overBudget: budget !== null && totalCost > budget, chemicals: alerts, allocation: { ...allocation, bodies: allocatedBodies } };
  }
  async preview(data: ConsumptionImportDto) {
    this.validMonth(data.month);
    const properties = await this.prisma.property.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true } });
    const periods = await this.prisma.chemicalConsumptionPeriod.findMany({ where: { month: data.month }, select: { propertyId: true, sourceName: true, feeSource: true } });
    return data.rows.map((row) => {
      const codeMatches = row.code ? properties.filter((property) => property.code === row.code) : [];
      const matches = row.propertyId ? properties.filter((property) => property.id === row.propertyId) : codeMatches.length ? codeMatches : properties.filter((property) => nameKey(property.name) === nameKey(row.propertyName));
      const property = matches.length === 1 ? matches[0] : null;
      const previous = periods.find((period) => period.propertyId === property?.id);
      return { ...row, matchedProperty: property, status: !property ? matches.length > 1 ? 'AMBIGUOUS' : 'UNMATCHED' : 'MATCHED', existing: Boolean(previous && ((row.chemicals !== undefined && previous.sourceName) || (row.monthlyFee !== undefined && previous.feeSource))) };
    });
  }
  async import(data: ConsumptionImportDto) {
    const preview = await this.preview(data);
    const accepted = preview.filter((row) => row.matchedProperty && (!row.existing || data.replace));
    if (new Set(accepted.map((row) => row.matchedProperty!.id)).size !== accepted.length) throw new BadRequestException('The import contains more than one total for the same property. Combine those rows before importing.');
    await this.prisma.$transaction(async (tx) => {
      for (const row of accepted) {
        const propertyId = row.matchedProperty!.id;
        const values = { ...(row.monthlyFee === undefined ? {} : { monthlyFee: row.monthlyFee, feeSource: data.sourceName }), ...(row.chemicals === undefined ? {} : { chemicals: row.chemicals as unknown as Prisma.InputJsonValue, sourceName: data.sourceName }) };
        await tx.chemicalConsumptionPeriod.upsert({ where: { propertyId_month: { propertyId, month: data.month } }, update: values, create: { propertyId, month: data.month, ...values } });
      }
    }, { timeout: 60000, maxWait: 10000 });
    return { imported: accepted.length, skipped: preview.length - accepted.length };
  }
  async update(propertyId: string, month: string, data: UpdateConsumptionPeriodDto) {
    this.validMonth(month);
    if (data.references.some((reference) => reference.min !== undefined && reference.max !== undefined && reference.min > reference.max)) throw new BadRequestException('Minimum consumption cannot exceed maximum consumption.');
    const property = await this.prisma.property.findFirst({ where: { id: propertyId, deletedAt: null }, select: propertySelect });
    if (!property) throw new NotFoundException('Property not found.');
    const values = { monthlyFee: data.monthlyFee, feeSource: 'MANUAL', budgetPercent: data.budgetPercent ?? null, seasonFactor: data.seasonFactor, references: data.references as unknown as Prisma.InputJsonValue };
    const period = await this.prisma.chemicalConsumptionPeriod.upsert({ where: { propertyId_month: { propertyId, month } }, create: { propertyId, month, ...values }, update: values, include: { property: { select: propertySelect } } });
    const [properties, archive] = await Promise.all([
      this.prisma.property.findMany({ where: { deletedAt: null }, select: { id: true, name: true, code: true } }),
      this.readHistory(),
    ]);
    const history = matchConsumptionHistory(properties, archive as unknown as HistoryProperty[]).get(propertyId);
    const archived = history && !period.sourceName && historicalChemicals(history, month);
    return this.present(archived ? { ...period, chemicals: archived, sourceName: 'Skimmer history 2025', historicalOnly: true } : period, history);
  }
}
