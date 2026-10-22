import { BadRequestException } from '@nestjs/common';
import { ChemicalConsumptionService } from './chemical-consumption.service';
import { companyConsumptionReport, globalCompanyConsumptionReport, companyMaximumBaseProperties } from './consumption-company-report';
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
    expect(chlorine.percent).toBeCloseTo(30 / 62 * 100);
    expect(chlorine).toMatchObject({ coverageComplete: false, referenceProperties: 2, reportedReferenceProperties: 1, unreferencedProperties: 1, unreferencedQuantity: 10 });
    expect(chlorine.properties.find((row) => row.propertyId === 'b')!.recordedQuantity).toBeNull();
  });

  it('preserves explicit zero and reports excess without fabricating sparse references', () => {
    const sparse = history('b');
    sparse.chemicals[0].months = [[1, 10, 0, false]];
    const report = companyConsumptionReport('2026-01', [property('a'), property('b')], [upload('a', 0), upload('b', 100)], [history('a'), sparse]);
    const chlorine = report.chemicals.find((chemical) => chemical.id === 'liquidchlorine:gal')!;
    expect(chlorine.recordedQuantity).toBe(100);
    expect(chlorine.excessQuantity).toBeCloseTo(69);
    expect(chlorine.percent).toBeCloseTo(100 / 31 * 100);
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
      chemicalConsumptionMaximum: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const service = new ChemicalConsumptionService(prisma as never);
    const result = await service.companyReport('2026-01');
    const active = { deletedAt: null, lifecycleStatus: { not: 'INACTIVE' } };
    expect(prisma.property.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: active }));
    expect(prisma.chemicalConsumptionPeriod.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { month: '2026-01', sourceName: { not: null }, property: active } }));
    expect(result.thresholds).toEqual({ warning: 80, attention: 90, maximum: 100 });
    expect(result.availableMonths).toEqual(['2026-01']);
    expect(result.basePropertyCount).toBe(253);
    expect(result.chemicals.find((chemical) => chemical.id === 'stabilizer:scoop')!.maximum).toBeCloseTo(412 / 253);
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

  it('keeps global percentages aligned with displayed company totals while retaining coverage metadata', () => {
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
    expect(chlorine.excessQuantity).toBeCloseTo(3);
    expect(chlorine.percent).toBeCloseTo(121 / 118 * 100);
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
      chemicalConsumptionMaximum: { findMany: jest.fn().mockResolvedValue([]) },
    };
    const report = await new ChemicalConsumptionService(prisma as never).companyReport('global');
    expect(report.scope).toBe('global');
    expect(report.availableMonths).toEqual(['2026-07', '2026-01']);
    expect(prisma.chemicalConsumptionPeriod.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { sourceName: { not: null }, property: { deletedAt: null, lifecycleStatus: { not: 'INACTIVE' } } }, select: { propertyId: true, month: true, sourceName: true, chemicals: true } }));
  });

  it('uses the five user-supplied monthly company maxima without multiplying by properties or adjusting for season', () => {
    for (const month of ['2026-02', '2026-07', '2028-02']) {
      const report = companyConsumptionReport(month, [property('a'), property('b')], [
        { propertyId: 'a', sourceName: 'skimmer.pdf', chemicals: [
          { name: 'Cloro en polvo', unit: 'Scoops', quantity: 200 },
          { name: 'Bicarbonato', unit: 'Scoop', quantity: 95 },
          { name: 'Estabilizador', unit: 'Scoops', quantity: 450 },
          { name: 'Sal', unit: 'Bags', quantity: 14 },
          { name: 'Fosfato', unit: 'oz', quantity: 35 },
        ] },
        { propertyId: 'b', sourceName: 'skimmer.pdf', chemicals: [
          { name: 'Bicarbonate', unit: 'scoop', quantity: 85 },
          { name: 'Phosphates ↓', unit: 'oz', quantity: 45 },
        ] },
      ], []);
      for (const [id, limit, actual] of [['stabilizer:scoop', 412, 450], ['chlorinepowder:scoop', 190, 200], ['bicarbonate:scoop', 170, 180], ['salt:bag', 13, 14], ['phosphates:oz', 70, 80]] as const) {
        const chemical = report.chemicals.find((entry) => entry.id === id)!;
        expect(chemical).toMatchObject({ maximumSource: 'MANUAL_COMPANY', manualMonthlyMaximum: limit, maximum: limit, comparisonMaximum: limit, recordedQuantity: actual, comparableQuantity: actual, unreferencedQuantity: 0 });
        expect(chemical.percent).toBeCloseTo(actual / limit * 100);
        expect(chemical.excessQuantity).toBe(actual - limit);
        expect(chemical.properties.every((row) => row.maximum === null)).toBe(true);
      }
    }
  });

  it('keeps fixed company limits when some history exists, preserving other historical chemical calculations', () => {
    const report = companyConsumptionReport('2026-01', [property('a')], [{ propertyId: 'a', sourceName: 'skimmer.pdf', chemicals: [
      { name: 'Bicarbonate', unit: 'scoop', quantity: 200 }, { name: 'Liquid', unit: 'GAL', quantity: 40 },
    ] }], [history('a', [{ name: 'Bicarbonate', unit: 'scoop' }, { name: 'Liquid Chlorine', unit: 'gal' }])]);
    expect(report.chemicals.find((chemical) => chemical.id === 'bicarbonate:scoop')).toMatchObject({ maximum: 170, maximumSource: 'MANUAL_COMPANY' });
    const liquid = report.chemicals.find((chemical) => chemical.id === 'liquidchlorine:gal')!;
    expect(liquid.maximumSource).toBe('HISTORY_2025');
    expect(liquid.maximum).toBeCloseTo(31);
    expect(liquid.excessQuantity).toBeCloseTo(9);
  });

  it('shows manual maxima without fabricating Skimmer consumption or converting different units', () => {
    const empty = companyConsumptionReport('2026-01', [property('a')], [], []);
    expect(empty.chemicals.find((chemical) => chemical.id === 'chlorinepowder:scoop')).toMatchObject({ maximum: 190, recordedQuantity: null, percent: null });
    const mismatch = companyConsumptionReport('2026-01', [property('a')], [upload('a', 10, 'Bicarbonate', 'bag')], []);
    expect(mismatch.chemicals.find((chemical) => chemical.id === 'bicarbonate:bag')).toMatchObject({ maximum: null, percent: null, maximumSource: 'HISTORY_2025' });
    expect(mismatch.chemicals.find((chemical) => chemical.id === 'bicarbonate:scoop')).toMatchObject({ maximum: 170, recordedQuantity: null });
  });

  it('adds each fixed limit once per uploaded month in Global, including months without use of that chemical', () => {
    const report = globalCompanyConsumptionReport([property('a'), property('b')], [
      { ...upload('a', 180, 'Bicarbonate', 'Scoop'), month: '2026-01' },
      { ...upload('b', 1, 'Liquid', 'GAL'), month: '2026-02' },
      { ...upload('a', 160, 'Bicarbonate', 'scoop'), month: '2027-07' },
      { ...upload('a', 999, 'Bicarbonate', 'scoop'), sourceName: null, month: '2026-12' },
    ], []);
    const bicarbonate = report.chemicals.find((chemical) => chemical.id === 'bicarbonate:scoop')!;
    expect(report.months).toEqual(['2026-01', '2026-02', '2027-07']);
    expect(bicarbonate).toMatchObject({ maximum: 510, comparisonMaximum: 510, recordedQuantity: 340, comparableQuantity: 340, maximumSource: 'MANUAL_COMPANY', manualMonthlyMaximum: 170 });
    expect(bicarbonate.percent).toBeCloseTo(340 / 510 * 100);
    expect(report.chemicals.find((chemical) => chemical.id === 'salt:bag')).toMatchObject({ maximum: 39, recordedQuantity: null, percent: null });
    expect(report.chemicals.find((chemical) => chemical.id === 'stabilizer:scoop')).toMatchObject({ maximum: 1236, recordedQuantity: null, percent: null });
    expect(bicarbonate.properties.every((row) => row.maximum === null && row.comparisonMaximum === null)).toBe(true);
  });

  it('regresses the January acid case: 685.25 / 643.667 is 106.5%, never the subset percentage of 74.3%', () => {
    const archive = [
      history('a', [{ name: 'Muriatic Acid', unit: 'gal' }], 599.3778879406699 / 31),
      history('b', [{ name: 'Muriatic Acid', unit: 'gal' }], (643.6674910612855 - 599.3778879406699) / 31),
    ];
    const report = companyConsumptionReport('2026-01', [property('a'), property('b'), property('c')], [
      upload('a', 445.5, 'Muriatic', 'GAL'), upload('c', 239.75, 'Muriatic', 'GAL'),
    ], archive);
    const acid = report.chemicals.find((chemical) => chemical.id === 'muriaticacid:gal')!;
    expect(acid.recordedQuantity).toBe(685.25);
    expect(acid.maximum).toBeCloseTo(643.6674910612855);
    expect(acid.percent!.toFixed(1)).toBe('106.5');
    expect(acid.excessQuantity).toBeCloseTo(41.5825089387145);
    expect(acid.comparableQuantity! / acid.comparisonMaximum! * 100).toBeCloseTo(74.32706627377257);
  });

  it('uses the displayed numerator and denominator for every chemical in monthly and global reports', () => {
    const periods = [
      { propertyId: 'a', month: '2026-01', sourceName: 'one.pdf', chemicals: [
        { name: 'Muriatic', unit: 'Gal', quantity: 90 }, { name: 'Liquid', unit: 'GAL', quantity: 5 },
        { name: 'Bicarbonate', unit: 'Scoop', quantity: 185 }, { name: 'Salt', unit: 'bag', quantity: 6 },
      ] },
      { propertyId: 'b', month: '2026-02', sourceName: 'two.pdf', chemicals: [
        { name: 'Muriatic Acid', unit: 'gal', quantity: 90 }, { name: 'Phosphates', unit: 'oz', quantity: 80 },
      ] },
    ];
    const properties = [property('a'), property('b')];
    const archive = [history('a', [{ name: 'Muriatic Acid', unit: 'gal' }, { name: 'Liquid Chlorine', unit: 'gal' }])];
    const reports = [companyConsumptionReport('2026-01', properties, periods.filter((row) => row.month === '2026-01'), archive), globalCompanyConsumptionReport(properties, periods, archive)];
    for (const report of reports) for (const chemical of report.chemicals) {
      if (chemical.recordedQuantity === null || chemical.maximum === null) {
        expect(chemical.percent).toBeNull();
      } else {
        expect(chemical.percent).toBeCloseTo(chemical.recordedQuantity / chemical.maximum * 100);
        expect(chemical.excessQuantity).toBeCloseTo(Math.max(0, chemical.recordedQuantity - chemical.maximum));
        expect(chemical.remainingQuantity).toBeCloseTo(Math.max(0, chemical.maximum - chemical.recordedQuantity));
        if (chemical.recordedQuantity > chemical.maximum) expect(chemical.percent).toBeGreaterThan(100);
      }
    }
  });

  describe('automatic population adjustment from the 253-property 2025 base', () => {
    const population = { basePropertyCount: companyMaximumBaseProperties };
    const properties = Array.from({ length: 275 }, (_, index) => property(String(index)));
    const uploads = (count: number) => properties.slice(0, count).map((entry) => upload(entry.id, 1));

    it('preserves the base at 253 and adjusts every manual maximum once at 275', () => {
      expect(companyMaximumBaseProperties).toBe(253);
      for (const count of [253, 275]) {
        const report = companyConsumptionReport('2026-07', properties, uploads(count), [], population);
        expect(report.uploadedProperties).toBe(count);
        expect(report.basePropertyCount).toBe(253);
        expect(report.monthlyPropertyCounts).toEqual([{ month: '2026-07', properties: count }]);
        for (const [id, base] of [['stabilizer:scoop', 412], ['salt:bag', 13], ['chlorinepowder:scoop', 190], ['bicarbonate:scoop', 170], ['phosphates:oz', 70]] as const) {
          const chemical = report.chemicals.find((item) => item.id === id)!;
          expect(chemical).toMatchObject({ baseMaximum: base, manualMonthlyMaximum: base, populationAdjusted: true });
          expect(chemical.maximum).toBeCloseTo(base * count / 253);
          expect(chemical.updatedMaximum).toBe(chemical.maximum);
          expect(chemical.adjustmentFactor).toBeCloseTo(count / 253);
        }
      }
    });

    it('uses unique uploaded properties, not chemical lines, fee-only records or unknown properties', () => {
      const report = companyConsumptionReport('2026-01', properties, [
        ...uploads(253), upload('0', 50, 'Salt', 'bag'),
        upload('unknown', 1000), { ...upload('253', 0), sourceName: null },
      ], [], population);
      expect(report.uploadedProperties).toBe(253);
      expect(report.chemicals.find((item) => item.id === 'salt:bag')).toMatchObject({ maximum: 13, recordedQuantity: 50, percent: 50 / 13 * 100 });
    });

    it('adjusts historical totals too while preserving original per-property references', () => {
      const archive = [history('0')];
      const report = companyConsumptionReport('2026-01', properties, uploads(275), archive, population);
      const chlorine = report.chemicals.find((item) => item.id === 'liquidchlorine:gal')!;
      expect(chlorine.baseMaximum).toBeCloseTo(31);
      expect(chlorine.maximum).toBeCloseTo(31 * 275 / 253);
      expect(chlorine.properties.find((item) => item.propertyId === '0')!.maximum).toBeCloseTo(31);
      expect(chlorine.percent).toBeCloseTo(275 / chlorine.maximum! * 100);
      expect(chlorine.excessQuantity).toBeCloseTo(275 - chlorine.maximum!);
    });

    it('sums independently adjusted months in Global instead of using its distinct property count', () => {
      const report = globalCompanyConsumptionReport(properties, [
        ...uploads(253).map((entry) => ({ ...entry, month: '2026-01' })),
        ...uploads(275).map((entry) => ({ ...entry, month: '2026-02' })),
      ], [], population);
      expect(report.uploadedProperties).toBe(275);
      expect(report.monthlyPropertyCounts).toEqual([{ month: '2026-01', properties: 253 }, { month: '2026-02', properties: 275 }]);
      for (const [id, base] of [['stabilizer:scoop', 412], ['salt:bag', 13]] as const) {
        const chemical = report.chemicals.find((entry) => entry.id === id)!;
        expect(chemical.baseMaximum).toBe(base * 2);
        expect(chemical.maximum).toBeCloseTo(base + base * 275 / 253);
        expect(chemical.updatedMaximum).toBe(chemical.maximum);
      }
      const chlorine = report.chemicals.find((entry) => entry.id === 'liquidchlorine:gal')!;
      expect(chlorine.recordedQuantity).toBe(528);
      expect(chlorine.maximum).toBeNull();
    });

    it('does not grow past months just because new unreferenced properties are created', () => {
      const existing = companyConsumptionReport('2026-01', properties.slice(0, 253), uploads(253), [history('0')], population);
      const later = companyConsumptionReport('2026-01', properties, uploads(253), [history('0')], population);
      for (const chemical of later.chemicals) {
        const before = existing.chemicals.find((entry) => entry.id === chemical.id)!;
        expect(chemical.maximum).toBe(before.maximum);
        expect(chemical.baseMaximum).toBe(before.baseMaximum);
        expect(chemical.recordedQuantity).toBe(before.recordedQuantity);
      }
    });

    it('keeps missing monthly and global data unknown instead of inventing zero usage or an allowance', () => {
      const monthly = companyConsumptionReport('2026-01', properties, [], [], population);
      const stabilizer = monthly.chemicals.find((entry) => entry.id === 'stabilizer:scoop')!;
      expect(stabilizer).toMatchObject({ baseMaximum: 412, updatedMaximum: null, maximum: null, adjustmentFactor: null, recordedQuantity: null, percent: null });
      const global = globalCompanyConsumptionReport(properties, [], [], population);
      expect(global.monthlyPropertyCounts).toEqual([]);
      expect(global.chemicals.every((entry) => entry.maximum === null && entry.updatedMaximum === null && entry.recordedQuantity === null)).toBe(true);
    });

    it('rejects invalid population bases', () => {
      for (const basePropertyCount of [0, -1, 1.5, NaN, Infinity]) {
        expect(() => companyConsumptionReport('2026-01', properties, [], [], { basePropertyCount })).toThrow('positive integer');
      }
    });
  });
});
