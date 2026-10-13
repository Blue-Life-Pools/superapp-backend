import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { allocateConsumption, distributeInteger } from './consumption-allocation';
import { ConsumptionChemicalDto, ConsumptionImportDto, ConsumptionReferenceDto, UpdateConsumptionPeriodDto } from './dto/chemical-consumption.dto';

const propertySelect = { id: true, name: true, code: true, waterBodies: true } as const;
const nameKey = (name: string) => name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
@Injectable()
export class ChemicalConsumptionService {
  constructor(private readonly prisma: PrismaService) {}
  private validMonth(month: string) {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new BadRequestException('Choose a valid month.');
  }
  async list(month: string) {
    this.validMonth(month);
    const [properties, periods] = await Promise.all([
      this.prisma.property.findMany({ where: { deletedAt: null }, select: propertySelect, orderBy: { name: 'asc' } }),
      this.prisma.chemicalConsumptionPeriod.findMany({ where: { month, property: { deletedAt: null } }, include: { property: { select: propertySelect } } }),
    ]);
    return { properties, periods: periods.map((period) => this.present(period)) };
  }
  private present(period: any) {
    const chemicals = period.chemicals as ConsumptionChemicalDto[];
    const references = period.references as ConsumptionReferenceDto[];
    const totalCost = chemicals.reduce((sum, chemical) => sum + chemical.cost, 0);
    const monthlyFee = period.monthlyFee === null ? null : Number(period.monthlyFee);
    const allocation = allocateConsumption(period.property.waterBodies, monthlyFee, totalCost);
    const alerts = chemicals.map((chemical) => {
      const reference = references.find((item) => nameKey(item.name) === nameKey(chemical.name) && item.unit.toLowerCase() === chemical.unit.toLowerCase());
      const min = reference?.min === undefined ? null : reference.min * period.seasonFactor;
      const max = reference?.max === undefined ? null : reference.max * period.seasonFactor;
      return { ...chemical, expectedMin: min, expectedMax: max, status: !reference || (min === null && max === null) ? 'NO_REFERENCE' : max !== null && chemical.quantity > max ? 'HIGH' : min !== null && chemical.quantity < min ? 'LOW' : 'IN_RANGE' };
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
    return this.present(period);
  }
}
