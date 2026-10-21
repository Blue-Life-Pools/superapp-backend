import { BadRequestException } from '@nestjs/common';
import { ChemicalConsumptionService } from './chemical-consumption.service';
import { companyConsumptionReport, globalCompanyConsumptionReport } from './consumption-company-report';
import type { HistoryProperty } from './consumption-history.types';

const property = (id: string) => ({ id, name: `Property ${id}`, code: id });
function history(id: string, products = [{ name: 'Liquid Chlorine', unit: 'gal' }], daily = 1): HistoryProperty {
  return {
    code: id, name: `Property ${id}`,
    factors: products.map((product) => ({ chemical: product.name, unit: product.unit, month: 7, factor: 1.5 })),
    chemicals: products.map((product) => ({ ...product, months: Array.from({ length: 12 }, (_, index) => {
      const month = index + 1;
      return [month, daily * new Date(Date.UTC(2025, month, 0)).getUTCDate() * (month === 7 ? 1.5 : 1), 0, false] as [number, number, number, boolean];
    }) })),
  };
}
const upload = (propertyId: string, quantity: number, name = 'Liquid', unit = 'GAL') => ({ propertyId, sourceName: 'skimmer.pdf', chemicals: [{ name, unit, quantity }] });

describe('company chemical consumption report', () => {
  it('sums each property maximum and changes it by month and season', () => {
    const properties = [property('a'), property('b')];
    const archive = [history('a'), history('b', undefined, 2)];
    const january = companyConsumptionReport('2026-01', properties, [upload('a', 30), upload('b', 60)], archive);
    const july = companyConsumptionReport('2026-07', properties, [upload('a', 30), upload('b', 60)], archive);
    const winter = january.chemicals.find((chemical) => chemical.id === 'liquidchlorine:gal')!;
    const summer = july.chemicals.find((chemical) => chemical.id === winter.id)!;
    expect(winter.maximum).toBeCloseTo(93);
    expect(summer.maximum).toBeCloseTo(139.5);
    expect(winter.recordedQuantity).toBe(90);
    expect(winter.percent).toBeCloseTo(90 / 93 * 100);
    expect(winter.coverageComplete).toBe(true);
    expect(winter.properties).toHaveLength(2);
  });

  it('reconciles Skimmer aliases and case without losing usage or duplicating baselines', () => {
    const products = [{ name: 'Muriatic Acid', unit: 'gal' }, { name: 'DE Filter Powder', unit: 'bag' }, { name: 'Tabs', unit: 'qty' }, { name: 'Estabilizador', unit: 'scoop' }, { name: 'Phosphates', unit: 'oz' }];
    const report = companyConsumptionReport('2026-01', [property('a')], [{ propertyId: 'a', sourceName: 'skimmer.pdf', chemicals: [
      { name: 'Muriatic', unit: 'Gal', quantity: 5 }, { name: 'Muriatic Acid', unit: 'gallons', quantity: 7 },
      { name: 'DE Filter', unit: 'BAG', quantity: 4 }, { name: 'Chlorine Tablets', unit: 'units', quantity: 10 },
      { name: 'Stabilizer', unit: 'Scoop', quantity: 3 }, { name: 'Phosphates ↓', unit: 'oz', quantity: 8 },
    ] }], [history('a', products)]);
    for (const [id, recorded] of [['muriaticacid:gal', 12], ['defilterpowder:bag', 4], ['tabs:qty', 10], ['stabilizer:scoop', 3], ['phosphates:oz', 8]] as const) {
      expect(report.chemicals.find((chemical) => chemical.id === id)).toMatchObject({ recordedQuantity: recorded, referenceProperties: 1, coverageComplete: true });
    }
    expect(report.chemicals.find((chemical) => chemical.id === 'muriaticacid:gal')!.maximum).toBeCloseTo(31);
  });

  it('keeps buckets, scoops, powder and shock separate instead of converting them', () => {
    const report = companyConsumptionReport('2026-01', [property('a')], [{ propertyId: 'a', sourceName: 'skimmer.pdf', chemicals: [
      { name: 'Stabilizer', unit: 'bucket', quantity: 2 }, { name: 'Shock', unit: 'scoop', quantity: 4 },
    ] }], [history('a', [{ name: 'Estabilizador', unit: 'scoop' }])]);
    expect(report.chemicals.find((chemical) => chemical.id === 'stabilizer:bucket')).toMatchObject({ recordedQuantity: 2, maximum: null, percent: null });
    expect(report.chemicals.find((chemical) => chemical.id === 'stabilizer:scoop')).toMatchObject({ recordedQuantity: null });
    expect(report.chemicals.find((chemical) => chemical.id === 'shock:scoop')!.recordedQuantity).toBe(4);
    expect(report.chemicals.find((chemical) => chemical.id === 'chlorinepowder:scoop')!.recordedQuantity).toBeNull();
  });

  it('does not replace missing Skimmer uploads with archive data, even for 2025', () => {
    const report = companyConsumptionReport('2025-01', [property('a')], [{ propertyId: 'a', sourceName: null, chemicals: [] }], [history('a')]);
    const chlorine = report.chemicals.find((chemical) => chemical.id === 'liquidchlorine:gal')!;
    expect(chlorine.maximum).toBeCloseTo(31);
    expect(chlorine.recordedQuantity).toBeNull();
    expect(chlorine.percent).toBeNull();
    expect(report.uploadedProperties).toBe(0);
    expect(report.sources).toEqual([]);
  });

  it('retains all available maxima but flags missing reports and usage without history', () => {
    const report = companyConsumptionReport('2026-01', [property('a'), property('b'), property('c')], [upload('a', 20), upload('c', 10)], [history('a'), history('b')]);
    const chlorine = report.chemicals.find((chemical) => chemical.id === 'liquidchlorine:gal')!;
    expect(chlorine.maximum).toBeCloseTo(62);
    expect(chlorine.recordedQuantity).toBe(30);
    expect(chlorine.comparableQuantity).toBe(20);
    expect(chlorine.comparisonMaximum).toBeCloseTo(31);
    expect(chlorine.percent).toBeCloseTo(20 / 31 * 100);
    expect(chlorine).toMatchObject({ coverageComplete: false, referenceProperties: 2, reportedReferenceProperties: 1, unreferencedProperties: 1, unreferencedQuantity: 10 });
    expect(chlorine.properties.find((row) => row.propertyId === 'b')!.recordedQuantity).toBeNull();
  });

  it('preserves explicit zero and reports excess without fabricating sparse references', () => {
    const sparse = history('b');
    sparse.chemicals[0].months = [[1, 10, 0, false]];
    const report = companyConsumptionReport('2026-01', [property('a'), property('b')], [upload('a', 0), upload('b', 100)], [history('a'), sparse]);
    const chlorine = report.chemicals.find((chemical) => chemical.id === 'liquidchlorine:gal')!;
    expect(chlorine.recordedQuantity).toBe(100);
    expect(chlorine.excessQuantity).toBe(0);
    expect(chlorine.percent).toBe(0);
    expect(chlorine.comparableQuantity).toBe(0);
    expect(chlorine.properties.find((row) => row.propertyId === 'a')!.recordedQuantity).toBe(0);
    expect(chlorine.properties.find((row) => row.propertyId === 'b')!.maximum).toBeNull();
  });

  it('includes and identifies Georky liquid refills without treating shock as liquid chlorine', () => {
    const report = companyConsumptionReport('2026-01', [property('a')], [{ propertyId: 'a', sourceName: 'skimmer.pdf', chemicals: [
      { name: 'Liquid', unit: 'GAL', quantity: 40, technicians: [{ name: '05 Georky Quiñonez', quantity: 30 }, { name: 'Adrian', quantity: 10 }] },
      { name: 'Shock', unit: 'scoop', quantity: 2, technicians: [{ name: 'Georky', quantity: 2 }] },
    ] }], [history('a')]);
    expect(report.chemicals.find((chemical) => chemical.id === 'liquidchlorine:gal')).toMatchObject({ recordedQuantity: 40, georkyRefillQuantity: 30 });
    expect(report.chemicals.find((chemical) => chemical.id === 'shock:scoop')!.georkyRefillQuantity).toBe(0);
  });

  it('uses historical outlier flags and never shares one archive between properties', () => {
    const archive = history('a');
    archive.chemicals[0].months[5] = [6, 9999, 0, true];
    const report = companyConsumptionReport('2026-01', [property('a')], [upload('a', 40)], [archive]);
    expect(report.chemicals.find((chemical) => chemical.id === 'liquidchlorine:gal')!.maximum).toBeCloseTo(31);
    const duplicate = companyConsumptionReport('2026-01', [property('a'), { ...property('a'), id: 'b' }], [], [archive]);
    expect(duplicate.matchedHistoryProperties).toBe(0);
    expect(duplicate.chemicals.find((chemical) => chemical.id === 'liquidchlorine:gal')!.maximum).toBeNull();
  });

  it('restricts report queries to the chosen month and non-deleted, non-inactive properties', async () => {
    const prisma = {
      property: { findMany: jest.fn().mockResolvedValue([property('a')]) },
      chemicalConsumptionPeriod: { findMany: jest.fn().mockImplementation((args) => Promise.resolve(args.distinct ? [{ month: '2026-01' }] : [{ ...upload('a', 40), month: '2026-01' }])) },
      chemicalConsumptionHistory: { findMany: jest.fn().mockResolvedValue([history('a')]) },
    };
    const service = new ChemicalConsumptionService(prisma as never);
    const result = await service.companyReport('2026-01');
    const active = { deletedAt: null, lifecycleStatus: { not: 'INACTIVE' } };
    expect(prisma.property.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: active }));
    expect(prisma.chemicalConsumptionPeriod.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { month: '2026-01', sourceName: { not: null }, property: active } }));
    expect(result.thresholds).toEqual({ warning: 80, attention: 90, maximum: 100 });
    expect(result.availableMonths).toEqual(['2026-01']);
    await expect(service.companyReport('2026-13')).rejects.toThrow(BadRequestException);
  });

  it('sums monthly maxima across years and computes a weighted global percentage', () => {
    const report = globalCompanyConsumptionReport([property('a')], [
      { ...upload('a', 31), month: '2026-01' },
      { ...upload('a', 93), month: '2027-07' },
    ], [history('a')]);
    const chlorine = report.chemicals.find((chemical) => chemical.id === 'liquidchlorine:gal')!;
    expect(report.scope).toBe('global');
    expect(report.months).toEqual(['2026-01', '2027-07']);
    expect(report.uploadedProperties).toBe(1);
    expect(chlorine.maximum).toBeCloseTo(31 + 46.5);
    expect(chlorine.recordedQuantity).toBe(124);
    expect(chlorine.percent).toBeCloseTo(160);
    expect(chlorine.percent).not.toBeCloseTo(150);
    expect(chlorine.referenceProperties).toBe(1);
    expect(chlorine.referencePropertyMonths).toBe(2);
    expect(chlorine.coverageComplete).toBe(true);
    expect(chlorine.properties[0]).toMatchObject({ referenceMonths: 2, reportedMonths: 2, recordedQuantity: 124 });
  });

  it('excludes missing property-months from the comparable maximum and preserves global partial coverage', () => {
    const report = globalCompanyConsumptionReport([property('a'), property('b')], [
      { ...upload('a', 93), month: '2026-01' },
      { ...upload('b', 28), month: '2026-02' },
      { ...upload('a', 999), sourceName: null, month: '2026-12' },
    ], [history('a'), history('b')]);
    const chlorine = report.chemicals.find((chemical) => chemical.id === 'liquidchlorine:gal')!;
    expect(report.months).toEqual(['2026-01', '2026-02']);
    expect(chlorine.maximum).toBeCloseTo(118);
    expect(chlorine.comparisonMaximum).toBeCloseTo(59);
    expect(chlorine.comparableQuantity).toBe(121);
    expect(chlorine.excessQuantity).toBeCloseTo(62);
    expect(chlorine.coverageComplete).toBe(false);
    expect(chlorine.referenceProperties).toBe(2);
    expect(chlorine.reportedReferenceProperties).toBe(2);
    expect(chlorine.referencePropertyMonths).toBe(4);
    expect(chlorine.reportedReferencePropertyMonths).toBe(2);
    expect(chlorine.properties.find((row) => row.propertyId === 'a')!.comparisonMaximum).toBeCloseTo(31);
    expect(chlorine.properties.find((row) => row.propertyId === 'a')!.maximum).toBeCloseTo(59);
  });

  it('does not fabricate a global annual allowance when no Skimmer months were uploaded', () => {
    const report = globalCompanyConsumptionReport([property('a')], [], [history('a')]);
    expect(report.months).toEqual([]);
    expect(report.uploadedProperties).toBe(0);
    expect(report.matchedHistoryProperties).toBe(1);
    expect(report.chemicals.every((chemical) => chemical.maximum === null && chemical.recordedQuantity === null && chemical.percent === null)).toBe(true);
  });

  it('loads global uploads without a month constraint and returns the available monthly options', async () => {
    const prisma = {
      property: { findMany: jest.fn().mockResolvedValue([property('a')]) },
      chemicalConsumptionPeriod: { findMany: jest.fn().mockImplementation((args) => Promise.resolve(args.distinct ? [{ month: '2026-07' }, { month: '2026-01' }] : [
        { ...upload('a', 31), month: '2026-01' }, { ...upload('a', 31), month: '2026-07' },
      ])) },
      chemicalConsumptionHistory: { findMany: jest.fn().mockResolvedValue([history('a')]) },
    };
    const report = await new ChemicalConsumptionService(prisma as never).companyReport('global');
    expect(report.scope).toBe('global');
    expect(report.availableMonths).toEqual(['2026-07', '2026-01']);
    expect(prisma.chemicalConsumptionPeriod.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { sourceName: { not: null }, property: { deletedAt: null, lifecycleStatus: { not: 'INACTIVE' } } }, select: { propertyId: true, month: true, sourceName: true, chemicals: true } }));
  });
});
