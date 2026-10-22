import { matchConsumptionMaximums, normalizeConsumptionMaximums, type ConsumptionMaximum } from './consumption-maximums';
import { companyConsumptionReport, globalCompanyConsumptionReport } from './consumption-company-report';
import type { HistoryProperty } from './consumption-history.types';

const property = (id: string) => ({ id, code: id, name: `Property ${id}` });
const maximum = (code: string, chemicalName = 'Liquid', unit = 'GAL', value = 10): ConsumptionMaximum => ({ propertyCode: code, propertyName: `Property ${code}`, chemicalName, unit, maximum: value, recordedMonths: 3, excludedMonths: 0, sourceName: 'maximums.xlsx' });
const upload = (propertyId: string, quantity = 12) => ({ propertyId, sourceName: 'skimmer.pdf', chemicals: [{ name: 'Liquid Chlorine', unit: 'gal', quantity }] });
const population = { basePropertyCount: 253 };
const companyTotals = (report: ReturnType<typeof companyConsumptionReport> | ReturnType<typeof globalCompanyConsumptionReport>) => report.chemicals.map(({ properties: _properties, ...company }) => company);
const history = (id: string): HistoryProperty => ({ code: id, name: `Property ${id}`, factors: [], chemicals: [{ name: 'Liquid Chlorine', unit: 'gal', months: Array.from({ length: 12 }, (_, index) => [index + 1, new Date(Date.UTC(2025, index + 1, 0)).getUTCDate(), 0, false]) }] });

describe('supplied property maximums', () => {
  it('merges aliases using the largest cleaned maximum, not their sum or excluded observations', () => {
    const normalized = normalizeConsumptionMaximums([
      maximum('a', 'Liquid', 'GAL', 16.25), maximum('a', 'Liquid Chlorine', 'gallons', 12.5),
      maximum('a', 'De Filter', 'BAG', 4), maximum('a', 'DE Filter Powder', 'bags', 3),
      maximum('a', 'Phosphates ↓', 'OZ', 2), maximum('a', 'Phosphates', 'ounces', 1),
    ]);
    expect(normalized).toHaveLength(3);
    expect(normalized.map((row) => [row.chemicalName, row.maximum])).toEqual([['liquidchlorine', 16.25], ['defilterpowder', 4], ['phosphates', 2]]);
  });

  it('keeps different properties and units separate', () => {
    expect(normalizeConsumptionMaximums([maximum('a', 'Stabilizer', 'scoop'), maximum('a', 'Stabilizer', 'bucket'), maximum('b', 'Stabilizer', 'scoop')])).toHaveLength(3);
  });

  it('rejects invalid maxima and month counts instead of silently importing them', () => {
    for (const patch of [{ maximum: -1 }, { maximum: NaN }, { maximum: Infinity }, { propertyCode: '' }, { recordedMonths: 1.5 }, { excludedMonths: 4 }, { excludedMonths: -1 }, { sourceName: '' }]) {
      expect(() => normalizeConsumptionMaximums([{ ...maximum('a'), ...patch }])).toThrow('Invalid');
    }
    expect(normalizeConsumptionMaximums([maximum('a', 'Liquid', 'GAL', 0)])[0].maximum).toBe(0);
  });

  it('matches exact codes and unique names with appended source identifiers, never a shared reference', () => {
    const rows = [maximum('a'), { ...maximum('source-b'), propertyName: 'Property b (source-b) (5009)' }];
    const matched = matchConsumptionMaximums([property('a'), property('b')], rows);
    expect(matched.size).toBe(2);
    expect(matched.get('b')![0].propertyCode).toBe('source-b');
    expect(matchConsumptionMaximums([property('b'), { ...property('b'), id: 'duplicate', code: null }], rows).size).toBe(0);
    expect(matchConsumptionMaximums([property('a')], [maximum('x'), { ...maximum('y'), propertyName: 'Property a' }, { ...maximum('z'), propertyName: 'Property a' }]).size).toBe(0);
  });

  it('updates only individual cells, preserving company totals and their existing population/month adjustments', () => {
    for (const month of ['2026-02', '2026-07', '2028-02']) {
      const baseline = companyConsumptionReport(month, [property('a')], [upload('a')], [history('a')], population);
      const report = companyConsumptionReport(month, [property('a')], [upload('a')], [history('a')], population, [maximum('a')]);
      expect(companyTotals(report)).toEqual(companyTotals(baseline));
      const chlorine = report.chemicals.find((row) => row.id === 'liquidchlorine:gal')!;
      expect(chlorine.properties[0].maximum).toBe(10);
      expect(chlorine.properties[0].maximumSource).toBe('WORKBOOK_PROPERTY');
      expect(chlorine.properties[0].referenceMaximum).toBe(baseline.chemicals.find((row) => row.id === chlorine.id)!.properties[0].maximum);
      expect(report.maximumReferenceSources).toEqual(['maximums.xlsx']);
    }
  });

  it('gives a unique exact Skimmer code priority over a legacy name-only duplicate', () => {
    const current = { id: 'current', name: 'Property a Holdings LLC', code: 'a' };
    const legacy = { id: 'legacy', name: 'Property a', code: null };
    const result = matchConsumptionMaximums([current, legacy], [maximum('a')]);
    expect(result.size).toBe(1);
    expect(result.has('current')).toBe(true);
    expect(result.has('legacy')).toBe(false);
  });

  it('fills missing individual references without using them as a new company allowance', () => {
    const report = companyConsumptionReport('2026-09', [property('a'), property('b'), property('c')], [upload('a'), upload('c', 5)], [], population, [maximum('a'), maximum('b', 'Liquid', 'GAL', 50)]);
    const chlorine = report.chemicals.find((row) => row.id === 'liquidchlorine:gal')!;
    expect(chlorine).toMatchObject({ maximum: null, recordedQuantity: 17, percent: null, referenceProperties: 0, unreferencedProperties: 2, unreferencedQuantity: 17, coverageComplete: false });
    expect(chlorine.properties.find((row) => row.propertyId === 'a')).toMatchObject({ maximum: 10, maximumSource: 'WORKBOOK_PROPERTY' });
    expect(chlorine.properties.find((row) => row.propertyId === 'c')!.maximum).toBeNull();
    expect(chlorine.properties.some((row) => row.propertyId === 'b')).toBe(false);
  });

  it('preserves all fixed company limits while updating their individual property columns', () => {
    const supplied = [maximum('a', 'Estabilizador', 'scoop', 8), maximum('a', 'Salt', 'bag', 2), maximum('a', 'Bicarbonate', 'scoop', 4), maximum('a', 'Phosphates', 'oz', 3)];
    const periods = [{ ...upload('a'), chemicals: supplied.map((row) => ({ name: row.chemicalName, unit: row.unit, quantity: 1 })) }];
    const baseline = companyConsumptionReport('2026-09', [property('a')], periods, [], population);
    const report = companyConsumptionReport('2026-09', [property('a')], periods, [], population, supplied);
    expect(companyTotals(report)).toEqual(companyTotals(baseline));
    for (const [id, value] of [['stabilizer:scoop', 8], ['salt:bag', 2], ['bicarbonate:scoop', 4], ['phosphates:oz', 3]] as const) {
      const chemical = report.chemicals.find((row) => row.id === id)!;
      expect(chemical.maximumSource).toBe('MANUAL_COMPANY');
      expect(chemical.populationAdjusted).toBe(true);
      expect(chemical.properties[0]).toMatchObject({ maximum: value, maximumSource: 'WORKBOOK_PROPERTY', referenceMaximum: null });
    }
    expect(report.chemicals.find((row) => row.id === 'chlorinepowder:scoop')).toMatchObject({ maximumSource: 'MANUAL_COMPANY', manualMonthlyMaximum: 190 });
  });

  it('keeps Global company caps and coverage identical while summing individual workbook cells separately', () => {
    const properties = [property('a'), property('b')];
    const maxima = [maximum('a'), maximum('b', 'Liquid', 'GAL', 20)];
    const periods = [
      { ...upload('a', 12), month: '2026-01' },
      { ...upload('a', 10), month: '2026-02' },
      { ...upload('b', 22), month: '2026-02' },
    ];
    const archive = [history('a'), history('b')];
    const baseline = globalCompanyConsumptionReport(properties, periods, archive, population);
    const report = globalCompanyConsumptionReport(properties, periods, archive, population, maxima);
    expect(companyTotals(report)).toEqual(companyTotals(baseline));
    const chlorine = report.chemicals.find((row) => row.id === 'liquidchlorine:gal')!;
    expect(chlorine).toMatchObject({ recordedQuantity: 44, maximumSource: 'HISTORY_2025', populationAdjusted: true });
    expect(chlorine.properties.find((row) => row.propertyId === 'a')!.maximum).toBe(20);
    expect(chlorine.properties.find((row) => row.propertyId === 'b')!.maximum).toBe(40);
  });

  it('does not fabricate actual consumption or a monthly allowance without uploads', () => {
    const monthly = companyConsumptionReport('2026-09', [property('a')], [], [], population, [maximum('a')]);
    expect(monthly.chemicals.find((row) => row.id === 'liquidchlorine:gal')).toMatchObject({ maximum: null, recordedQuantity: null, percent: null });
    const global = globalCompanyConsumptionReport([property('a')], [], [], population, [maximum('a')]);
    expect(global.chemicals.find((row) => row.id === 'liquidchlorine:gal')).toMatchObject({ maximum: null, recordedQuantity: null, percent: null });
  });
});
