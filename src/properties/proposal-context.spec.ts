import { NotFoundException } from '@nestjs/common';
import { PropertiesService } from './properties.service';
import { PropertiesController } from './properties.controller';
import { proposalHistoryWindow, summarizeProposalHistory } from './proposal-context';

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
});
