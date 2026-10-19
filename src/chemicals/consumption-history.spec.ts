import type { HistoryProperty } from './consumption-history.types';
import { historicalChemicals, historicalRange, matchConsumptionHistory } from './consumption-history';
import { ChemicalConsumptionService } from './chemical-consumption.service';

// Synthetic data only. Customer history lives exclusively in the CRM database.
const parkway: HistoryProperty = {
  code: 'SYNTHETIC-001', name: 'Example Pool',
  factors: [{ chemical: 'Liquid Chlorine', unit: 'gal', month: 1, factor: .6 }, { chemical: 'Liquid Chlorine', unit: 'gal', month: 7, factor: 1.4 }],
  chemicals: [
    { name: 'Liquid Chlorine', unit: 'gal', months: Array.from({ length: 12 }, (_, i) => [i + 1, 100 + i * 5, 200, false] as [number, number, number, boolean]) },
    { name: 'Shock', unit: 'scoop', months: [[1, 1, 2, false], [5, 2, 4, false], [7, 1, 2, false]] },
  ],
};
const archive = [parkway];
describe('historical chemical overconsumption', () => {
  it('matches a unique code and never shares a historical property between CRM properties', () => {
    const first = { id: 'a', code: parkway.code, name: 'Renamed property' };
    expect(matchConsumptionHistory([first], archive).get('a')).toBe(parkway);
    expect(matchConsumptionHistory([first, { ...first, id: 'b' }], archive).size).toBe(0);
  });
  it('matches only unique normalized names when a code is unavailable', () => {
    expect(matchConsumptionHistory([{ id: 'a', code: null, name: 'example pool' }], archive).get('a')).toBe(parkway);
    expect(matchConsumptionHistory([{ id: 'a', code: null, name: 'Example' }], archive).size).toBe(0);
  });
  it('adjusts the expectation for summer and recognizes the existing Liquid name alias', () => {
    const winter = historicalRange(parkway, 'Liquid', 'GAL', '2026-01')!;
    const summer = historicalRange(parkway, 'Liquid Chlorine', 'gal', '2026-07')!;
    expect(summer.expectedQuantity).toBeGreaterThan(winter.expectedQuantity);
    expect(summer.expectedMax).toBeGreaterThan(summer.expectedQuantity);
    expect(summer.referenceSource).toBe('HISTORY_2025');
    expect(historicalRange(parkway, 'Liquid', 'oz', '2026-07')).toBeNull();
  });
  it('handles leap years and leaves intermittent chemicals unclassified', () => {
    const ordinary = historicalRange(parkway, 'Liquid', 'GAL', '2027-02')!;
    const leap = historicalRange(parkway, 'Liquid', 'GAL', '2028-02')!;
    expect(leap.expectedQuantity / ordinary.expectedQuantity).toBeCloseTo(29 / 28);
    expect(historicalRange(parkway, 'Shock', 'scoop', '2026-07')).toBeNull();
  });
  it('uses the excluded flags without deleting the historical observation', () => {
    const history: HistoryProperty = { code: 'test', name: 'Test', factors: [], chemicals: [{ name: 'Example', unit: 'gal', months: Array.from({ length: 12 }, (_, i) => [i + 1, i === 5 ? 9999 : 30, 0, i === 5] as [number, number, number, boolean]) }] };
    const range = historicalRange(history, 'Example', 'gal', '2026-06')!;
    expect(range.excludedMonths).toEqual([6]);
    expect(range.expectedMax).toBeLessThan(40);
    expect(historicalChemicals(history, '2025-06')![0].quantity).toBe(9999);
    expect(historicalChemicals(history, '2026-06')).toBeNull();
  });
  it('flags excess quantity automatically and preserves a manual maximum', () => {
    const service = new ChemicalConsumptionService({} as never);
    const period = { month: '2026-07', chemicals: [{ name: 'Liquid', unit: 'GAL', quantity: 1000, cost: 2000 }], references: [], seasonFactor: 1, monthlyFee: null, budgetPercent: null, property: { waterBodies: [] } };
    const automatic = (service as any).present(period, parkway).chemicals[0];
    expect(automatic.status).toBe('HIGH');
    expect(automatic.excessQuantity).toBeCloseTo(1000 - automatic.expectedMax);
    const manual = (service as any).present({ ...period, references: [{ name: 'Liquid', unit: 'GAL', max: 1200 }] }, parkway).chemicals[0];
    expect(manual.status).toBe('IN_RANGE');
    expect(manual.expectedMax).toBe(1200);
    expect(manual.referenceSource).toBe('MANUAL');
  });
  it('does not infer a normal result when the historical identity is unmatched', () => {
    const service = new ChemicalConsumptionService({} as never);
    const period = { month: '2026-07', chemicals: [{ name: 'Liquid', unit: 'GAL', quantity: 1000, cost: 2000 }], references: [], seasonFactor: 1, monthlyFee: null, budgetPercent: null, property: { waterBodies: [] } };
    expect((service as any).present(period).chemicals[0].status).toBe('NO_REFERENCE');
  });
  it('shows archived 2025 consumption without replacing existing fee or imported consumption', async () => {
    const property = { id: 'a', name: parkway.name, code: parkway.code, waterBodies: [] };
    const period = { propertyId: 'a', property, month: '2025-07', chemicals: [], sourceName: null, references: [], seasonFactor: 1, monthlyFee: 1600, budgetPercent: null };
    const prisma = { property: { findMany: jest.fn().mockResolvedValue([property]) }, chemicalConsumptionPeriod: { findMany: jest.fn().mockResolvedValue([period]) }, chemicalConsumptionHistory: { findMany: jest.fn().mockResolvedValue(archive) } };
    const service = new ChemicalConsumptionService(prisma as never);
    const response = await service.list('2025-07');
    expect(response.periods[0].monthlyFee).toBe(1600);
    expect(response.periods[0].historicalOnly).toBe(true);
    expect(response.periods[0].chemicals.length).toBeGreaterThan(0);
    prisma.chemicalConsumptionPeriod.findMany.mockResolvedValue([{ ...period, sourceName: 'new-upload.pdf', chemicals: [{ name: 'Liquid', unit: 'GAL', quantity: 7, cost: 14 }] }]);
    const imported = await service.list('2025-07');
    expect(imported.periods[0].sourceName).toBe('new-upload.pdf');
    expect(imported.periods[0].chemicals[0].quantity).toBe(7);
  });
  it('does not create fictional consumption in a month outside the archive', async () => {
    const property = { id: 'a', name: parkway.name, code: parkway.code, waterBodies: [] };
    const service = new ChemicalConsumptionService({ property: { findMany: jest.fn().mockResolvedValue([property]) }, chemicalConsumptionPeriod: { findMany: jest.fn().mockResolvedValue([]) }, chemicalConsumptionHistory: { findMany: jest.fn().mockResolvedValue(archive) } } as never);
    expect((await service.list('2026-10')).periods).toEqual([]);
  });
});
