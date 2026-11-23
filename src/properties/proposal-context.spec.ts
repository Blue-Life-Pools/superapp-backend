import { NotFoundException } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { PropertiesController } from './properties.controller';
import { proposalHistoryWindow, summarizeProposalHistory } from './proposal-context';
import { estimateProposalChemicals } from './proposal-chemical-estimate';

const waterBody = (gallons: number | null, type = 'SWIMMING_POOL', size: string | null = 'SMALL') => ({ type, size, gallons });
const comparable = (waterBodies: ReturnType<typeof waterBody>[], ...costs: number[]) => ({
  waterBodies,
  chemicalConsumptionPeriods: costs.map(cost => ({ sourceName: 'uploaded.pdf', chemicals: [{ cost }] })),
});

describe('Commercial proposal context', () => {
  afterEach(() => jest.useRealTimers());
  it('uses complete months in the business timezone, including at a UTC year boundary', () => {
    expect(proposalHistoryWindow(new Date('2026-11-13T12:00:00Z'))).toEqual({ from: '2025-11', before: '2026-11' });
    expect(proposalHistoryWindow(new Date('2027-01-01T02:00:00Z'))).toEqual({ from: '2025-12', before: '2026-12' });
  });
  it('averages property totals over recorded months only and preserves a valid zero', () => {
    const period = { month: '2026-01', monthlyFee: null, sourceName: 'uploaded.pdf', chemicals: [{ cost: 50 }, { cost: 30 }] };
    expect(summarizeProposalHistory([
      period, { ...period, month: '2026-02', chemicals: [{ cost: 0 }] },
      { ...period, month: '2026-03', chemicals: [], monthlyFee: '630' },
      { ...period, month: '2026-04', sourceName: null },
      { ...period, month: '2026-05', chemicals: [{ cost: -5 }] },
    ])).toEqual({ chemicalHistory: { averageMonthlyCost: 40, months: 2, from: '2026-01', to: '2026-02' }, latestFee: { month: '2026-03', monthlyFee: 630 } });
    expect(summarizeProposalHistory([]).chemicalHistory.averageMonthlyCost).toBeNull();
    expect(summarizeProposalHistory([{ ...period, chemicals: [{ cost: 0 }] }]).chemicalHistory.averageMonthlyCost).toBe(0);
  });
  it('queries only the selected property and excludes the current partial month', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-13T12:00:00Z'));
    const prisma = { property: { findFirst: jest.fn().mockResolvedValue({ id: 'selected' }) }, chemicalConsumptionPeriod: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new PropertiesService(prisma as never, {} as never, {} as never);
    await service.proposalContext('selected');
    expect(prisma.chemicalConsumptionPeriod.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { propertyId: 'selected', month: { gte: '2025-11', lt: '2026-11' } } }));
    prisma.property.findFirst.mockResolvedValue(null);
    await expect(service.proposalContext('deleted')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.chemicalConsumptionPeriod.findMany).toHaveBeenCalledTimes(1);
    expect(Reflect.getMetadata('appRoles', PropertiesController.prototype.proposalContext)).toEqual(['COMMERCIAL']);
  });

  it('prefers comparable volumes, counts each property once, and excludes different configurations', () => {
    const target = [waterBody(20_000), waterBody(2_000, 'SPA', null)];
    const sameScope = [waterBody(1_700, 'SPA', null), waterBody(22_000, 'POOL', 'MEDIUM')];
    const peers = [
      comparable(sameScope, 0, 100),
      ...[75, 100, 125, 150].map(cost => comparable(sameScope, cost)),
      comparable([waterBody(20_000)], 20),
      comparable([waterBody(20_000), waterBody(4_000, 'SPA', null)], 999),
      comparable(sameScope, -1),
    ];
    expect(estimateProposalChemicals(target, peers)).toEqual({
      monthlyCost: 100, basis: 'GALLONS', propertyCount: 5, recordedMonths: 6,
    });
  });

  it('falls back to the size and type configuration and requires five properties, even with many months', () => {
    const target = [waterBody(null), waterBody(null, 'SPA', null)];
    const peers = [70, 90, 100, 125, 140, 160].map(cost => comparable(target, cost, cost, cost));
    expect(estimateProposalChemicals(target, peers.slice(0, 4))).toBeNull();
    expect(estimateProposalChemicals([waterBody(null, 'POOL', null)], peers)).toBeNull();
    expect(estimateProposalChemicals([waterBody(20_000)], Array.from({ length: 5 }, () => comparable([waterBody(5_000)], 100)))).toBeNull();
    expect(estimateProposalChemicals(target, peers)).toEqual({
      monthlyCost: 112.5, basis: 'SIZE', propertyCount: 6, recordedMonths: 18,
    });
  });

  it('queries only other properties with a full-month record and returns aggregate data', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-11-13T12:00:00Z'));
    const target = [waterBody(20_000)];
    const prisma = { property: {
      findFirst: jest.fn().mockResolvedValue({ id: 'selected' }),
      findMany: jest.fn().mockResolvedValue(Array.from({ length: 5 }, () => comparable(target, 125))),
    } };
    const service = new PropertiesService(prisma as never, {} as never, {} as never);
    await expect(service.proposalChemicalEstimate('selected', { waterBodies: target })).resolves.toEqual({
      estimate: { monthlyCost: 125, basis: 'GALLONS', propertyCount: 5, recordedMonths: 5 },
      window: { from: '2025-11', before: '2026-11' },
    });
    expect(prisma.property.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        id: { not: 'selected' }, deletedAt: null,
        chemicalConsumptionPeriods: { some: { month: { gte: '2025-11', lt: '2026-11' }, sourceName: { not: null } } },
      },
    }));
    expect(Reflect.getMetadata('appRoles', PropertiesController.prototype.proposalChemicalEstimate)).toEqual(['COMMERCIAL']);
  });
});
