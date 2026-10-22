import { matchConsumptionMaximums, normalizeConsumptionMaximums, type ConsumptionMaximum } from './consumption-maximums';
import { companyConsumptionReport, globalCompanyConsumptionReport } from './consumption-company-report';

const property = (id: string) => ({ id, code: id, name: `Property ${id}` });
const maximum = (code: string, chemicalName = 'Liquid', unit = 'GAL', value = 10): ConsumptionMaximum => ({ propertyCode: code, propertyName: `Property ${code}`, chemicalName, unit, maximum: value, recordedMonths: 3, excludedMonths: 0, sourceName: 'maximums.xlsx' });
const upload = (propertyId: string, quantity = 12) => ({ propertyId, sourceName: 'skimmer.pdf', chemicals: [{ name: 'Liquid Chlorine', unit: 'gal', quantity }] });
const population = { basePropertyCount: 253 };

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

  it('uses workbook maxima even for sparse history, with no population, seasonal or day multiplier', () => {
    for (const month of ['2026-02', '2026-07', '2028-02']) {
      const report = companyConsumptionReport(month, [property('a')], [upload('a')], [], population, [maximum('a')]);
      const chlorine = report.chemicals.find((row) => row.id === 'liquidchlorine:gal')!;
      expect(chlorine).toMatchObject({ maximum: 10, baseMaximum: 10, updatedMaximum: 10, recordedQuantity: 12, percent: 120, excessQuantity: 2, populationAdjusted: false, adjustmentFactor: null, maximumSource: 'WORKBOOK_PROPERTY', referenceProperties: 1 });
      expect(chlorine.properties[0].maximum).toBe(10);
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

  it('sums only the unique uploaded properties for each month, retaining usage without a reference', () => {
    const report = companyConsumptionReport('2026-09', [property('a'), property('b'), property('c')], [upload('a'), upload('c', 5)], [], population, [maximum('a'), maximum('b', 'Liquid', 'GAL', 50)]);
    const chlorine = report.chemicals.find((row) => row.id === 'liquidchlorine:gal')!;
    expect(chlorine).toMatchObject({ maximum: 10, recordedQuantity: 17, percent: 170, referenceProperties: 1, unreferencedProperties: 1, unreferencedQuantity: 5, coverageComplete: false });
    expect(chlorine.properties.some((row) => row.propertyId === 'b')).toBe(false);
  });

  it('replaces prior manual limits for products in the workbook, preserving units and other products', () => {
    const supplied = [maximum('a', 'Estabilizador', 'scoop', 8), maximum('a', 'Salt', 'bag', 2), maximum('a', 'Bicarbonate', 'scoop', 4), maximum('a', 'Phosphates', 'oz', 3)];
    const report = companyConsumptionReport('2026-09', [property('a')], [upload('a')], [], population, supplied);
    for (const [id, value] of [['stabilizer:scoop', 8], ['salt:bag', 2], ['bicarbonate:scoop', 4], ['phosphates:oz', 3]] as const) {
      expect(report.chemicals.find((row) => row.id === id)).toMatchObject({ maximum: value, maximumSource: 'WORKBOOK_PROPERTY', manualMonthlyMaximum: null, populationAdjusted: false });
    }
    expect(report.chemicals.find((row) => row.id === 'chlorinepowder:scoop')).toMatchObject({ maximumSource: 'MANUAL_COMPANY', manualMonthlyMaximum: 190 });
  });

  it('sums individually matched monthly caps in Global rather than repeating the current population', () => {
    const properties = [property('a'), property('b')];
    const maxima = [maximum('a'), maximum('b', 'Liquid', 'GAL', 20)];
    const report = globalCompanyConsumptionReport(properties, [
      { ...upload('a', 12), month: '2026-01' },
      { ...upload('a', 10), month: '2026-02' },
      { ...upload('b', 22), month: '2026-02' },
    ], [], population, maxima);
    const chlorine = report.chemicals.find((row) => row.id === 'liquidchlorine:gal')!;
    expect(chlorine).toMatchObject({ maximum: 40, recordedQuantity: 44, maximumSource: 'WORKBOOK_PROPERTY', populationAdjusted: false, adjustmentFactor: null });
    expect(chlorine.percent).toBeCloseTo(110);
  });

  it('does not fabricate actual consumption or a monthly allowance without uploads', () => {
    const monthly = companyConsumptionReport('2026-09', [property('a')], [], [], population, [maximum('a')]);
    expect(monthly.chemicals.find((row) => row.id === 'liquidchlorine:gal')).toMatchObject({ maximum: null, recordedQuantity: null, percent: null });
    const global = globalCompanyConsumptionReport([property('a')], [], [], population, [maximum('a')]);
    expect(global.chemicals.find((row) => row.id === 'liquidchlorine:gal')).toMatchObject({ maximum: null, recordedQuantity: null, percent: null });
  });
});
