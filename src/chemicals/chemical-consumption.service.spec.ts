import { ChemicalConsumptionService } from './chemical-consumption.service';
import { PrismaService } from '../prisma/prisma.service';

describe('Home consumption history periods', () => {
  const property = { id: 'property', name: 'Example Pool', code: 'EXAMPLE', waterBodies: [], chemicalFollowUpResolvedAt: null };
  const period = (month: string, quantity = 12, maximum = 10, sourceName: string | null = 'skimmer.pdf') => ({
    propertyId: property.id, property, month, sourceName, feeSource: null,
    chemicals: [{ name: 'Liquid Chlorine', unit: 'gal', quantity, cost: 24 }],
    references: [{ name: 'Liquid Chlorine', unit: 'gal', max: maximum }],
    monthlyFee: null as number | null, seasonFactor: 1, budgetPercent: null,
  });
  function setup(periods = [period('2026-09'), period('2026-10', 12, 20)], history: unknown[] = []) {
    const prisma = {
      property: { findMany: jest.fn().mockResolvedValue([property]) },
      chemicalConsumptionHistory: { findMany: jest.fn().mockResolvedValue(history) },
      chemicalConsumptionPeriod: { findMany: jest.fn().mockImplementation(async ({ where }) => periods.filter((row) => {
        const matchesMonth = !where.month || (typeof where.month === 'string' ? row.month === where.month : row.month.startsWith(where.month.startsWith));
        return matchesMonth && (!where.sourceName || row.sourceName !== null);
      })) },
    };
    return { prisma, service: new ChemicalConsumptionService(prisma as unknown as PrismaService) };
  }

  it('includes all stored months and keeps each monthly reference and alert', async () => {
    const { service, prisma } = setup([period('2024-01'), period('2026-09'), period('2026-10', 12, 20)]);
    const result = await service.list('all');
    expect(result.periods.map((row) => row.month)).toEqual(['2026-10', '2026-09', '2024-01']);
    expect(result.periods.map((row) => [row.chemicals[0].quantity, row.chemicals[0].expectedMax, row.chemicals[0].status])).toEqual([[12, 20, 'IN_RANGE'], [12, 10, 'HIGH'], [12, 10, 'HIGH']]);
    expect(prisma.chemicalConsumptionPeriod.findMany.mock.calls.every(([query]) => !query.where.month)).toBe(true);
  });

  it('still restricts a specific month and its recurring alert history to the selected year', async () => {
    const { service, prisma } = setup([period('2024-01'), period('2026-09'), period('2026-10')]);
    const result = await service.list('2026-09');
    expect(result.periods.map((row) => row.month)).toEqual(['2026-09']);
    expect(prisma.chemicalConsumptionPeriod.findMany.mock.calls[0][0].where.month).toBe('2026-09');
    expect(prisma.chemicalConsumptionPeriod.findMany.mock.calls[1][0].where.month).toEqual({ startsWith: '2026-' });
  });

  it('includes archived months once and preserves uploaded data and saved fees', async () => {
    const archive = [{ code: property.code, name: property.name, chemicals: [{ name: 'Liquid Chlorine', unit: 'gal', months: [[9, 1, 2, false], [10, 3, 6, false], [11, 5, 10, false]] }], factors: [] }];
    const savedFees = { ...period('2025-10', 0, 10, null), chemicals: [], monthlyFee: 100 };
    const { service } = setup([period('2025-09', 20), savedFees, period('2026-09')], archive);
    const result = await service.list('all');
    expect(result.periods.map((row) => row.month)).toEqual(['2026-09', '2025-11', '2025-10', '2025-09']);
    const september = result.periods.find((row) => row.month === '2025-09')!;
    expect(september.sourceName).toBe('skimmer.pdf');
    expect(september.chemicals[0].quantity).toBe(20);
    const october = result.periods.find((row) => row.month === '2025-10')!;
    expect(october.sourceName).toBe('Skimmer history 2025');
    expect(october.chemicals[0].quantity).toBe(3);
    expect(october.monthlyFee).toBe(100);
    expect(new Set(result.periods.map((row) => `${row.propertyId}|${row.month}`)).size).toBe(result.periods.length);
  });

  it('rejects invalid filters and does not permit importing into all months', async () => {
    const { service, prisma } = setup();
    for (const month of ['', '2026-13', 'global']) await expect(service.list(month)).rejects.toThrow('Choose a valid month.');
    await expect(service.preview({ month: 'all', sourceName: 'skimmer.pdf', rows: [] })).rejects.toThrow('Choose a valid month.');
    expect(prisma.chemicalConsumptionPeriod.findMany).not.toHaveBeenCalled();
  });
});

describe('Skimmer properties without codes', () => {
  const properties = [
    { id: 'lafoy', name: 'NV PROPERTY 10380', code: null, addressLine1: '10380 Lafoy Rd' },
    { id: 'old-nv', name: 'NV PROPERTY 10380', code: 'OLD-CODE', addressLine1: '4623 w Browning ave' },
    { id: 'browning', name: 'NV PROPERTY 4623', code: 'OTHER-CODE', addressLine1: '4623 w Browning ave' },
  ];
  function setup() {
    const prisma = { property: { findMany: jest.fn().mockResolvedValue(properties) }, chemicalConsumptionPeriod: { findMany: jest.fn().mockResolvedValue([]) } };
    const service = new ChemicalConsumptionService(prisma as unknown as PrismaService);
    return service;
  }
  it('matches a PDF property by its unique exact address when the code is absent', async () => {
    const [result] = await setup().preview({ month: '2026-10', sourceName: 'skimmer.pdf', rows: [{ propertyName: 'NV PROPERTY HOLDINGS', addressLine1: '10380 Lafoy Rd.' }] });
    expect(result.status).toBe('MATCHED');
    expect(result.matchedProperty?.id).toBe('lafoy');
  });
  it('does not assign a shared address to an arbitrary property', async () => {
    const [result] = await setup().preview({ month: '2026-10', sourceName: 'skimmer.pdf', rows: [{ propertyName: 'NV PROPERTY HOLDINGS', addressLine1: '4623 w Browning ave' }] });
    expect(result.status).toBe('AMBIGUOUS');
    expect(result.matchedProperty).toBeNull();
  });
  it('uses the name to disambiguate multiple properties at the same exact address', async () => {
    const [result] = await setup().preview({ month: '2026-10', sourceName: 'skimmer.pdf', rows: [{ propertyName: 'NV PROPERTY 4623', addressLine1: '4623 w Browning ave' }] });
    expect(result.matchedProperty?.id).toBe('browning');
  });
  it('does not fall back to a name when the supplied address does not match', async () => {
    const [result] = await setup().preview({ month: '2026-10', sourceName: 'skimmer.pdf', rows: [{ propertyName: 'NV PROPERTY 4623', addressLine1: '999 Unknown St' }] });
    expect(result.status).toBe('UNMATCHED');
  });
  it('preserves code matching and imports that only supply a property name', async () => {
    const rows = await setup().preview({ month: '2026-10', sourceName: 'skimmer.pdf', rows: [{ propertyName: 'Source label', code: 'OTHER-CODE' }, { propertyName: 'NV PROPERTY 4623' }] });
    expect(rows.map(row => row.matchedProperty?.id)).toEqual(['browning', 'browning']);
  });
});
