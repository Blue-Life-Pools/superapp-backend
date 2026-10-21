import { historicalRange, historyKey, matchConsumptionHistory } from './consumption-history';
import type { HistoryProperty } from './consumption-history.types';

type Property = { id: string; name: string; code: string | null };
type Chemical = { name: string; unit: string; quantity: number; technicians?: Array<{ name: string; quantity: number }> };
type Period = { propertyId: string; chemicals: Chemical[]; sourceName: string | null };
type PropertyTotal = {
  propertyId: string; propertyName: string; recordedQuantity: number | null;
  expectedQuantity: number | null; maximum: number | null;
};

const catalog = [
  ['liquidchlorine', 'Liquid Chlorine', 'gal'],
  ['muriaticacid', 'Muriatic Acid', 'gal'],
  ['tabs', 'Chlorine Tablets', 'qty'],
  ['stabilizer', 'Stabilizer', 'scoop'],
  ['defilterpowder', 'D.E. Filter Powder', 'bag'],
  ['chlorinepowder', 'Chlorine Powder', 'scoop'],
  ['bicarbonate', 'Bicarbonate', 'scoop'],
  ['salt', 'Salt', 'bag'],
  ['phosphates', 'Phosphates', 'oz'],
  ['shock', 'Shock', 'scoop'],
] as const;

function productKey(name: string) {
  const key = historyKey(name);
  const aliases: Record<string, string> = {
    liquid: 'liquidchlorine', cloroliquido: 'liquidchlorine',
    muriatic: 'muriaticacid', acidomuriatico: 'muriaticacid',
    tablets: 'tabs', chlorinetablets: 'tabs', cloroentabletas: 'tabs',
    estabilizador: 'stabilizer', defilter: 'defilterpowder', depowder: 'defilterpowder',
    cloroenpolvo: 'chlorinepowder', bicarbonato: 'bicarbonate', sal: 'salt',
  };
  return aliases[key] || key;
}

function unitKey(unit: string) {
  const key = unit.trim().toLowerCase();
  const aliases: Record<string, string> = {
    gallon: 'gal', gallons: 'gal', gals: 'gal', bags: 'bag', scoops: 'scoop',
    units: 'qty', unit: 'qty', quantity: 'qty', ounces: 'oz', ounce: 'oz',
  };
  return aliases[key] || key;
}

// Totals always retain their unit: a bucket and a scoop are never combined.
export function companyConsumptionReport(month: string, properties: Property[], periods: Period[], archive: HistoryProperty[]) {
  const matched = matchConsumptionHistory(properties, archive);
  const uploaded = new Map(periods.filter((period) => period.sourceName).map((period) => [period.propertyId, period]));
  const groups = new Map<string, {
    id: string; name: string; unit: string; rows: Map<string, PropertyTotal>;
    hasRecordedProduct: boolean; georkyRefillQuantity: number;
  }>();

  function group(name: string, unit: string) {
    const product = productKey(name);
    const normalizedUnit = unitKey(unit);
    const id = `${product}:${normalizedUnit}`;
    if (!groups.has(id)) groups.set(id, {
      id, name: catalog.find(([key]) => key === product)?.[1] || name, unit: normalizedUnit,
      rows: new Map(), hasRecordedProduct: false, georkyRefillQuantity: 0,
    });
    return groups.get(id)!;
  }

  for (const [, name, unit] of catalog) group(name, unit);

  for (const property of properties) {
    const history = matched.get(property.id);
    const period = uploaded.get(property.id);
    const rowFor = (target: ReturnType<typeof group>) => {
      if (!target.rows.has(property.id)) target.rows.set(property.id, {
        propertyId: property.id, propertyName: property.name,
        recordedQuantity: period ? 0 : null, expectedQuantity: null, maximum: null,
      });
      return target.rows.get(property.id)!;
    };

    for (const chemical of history?.chemicals || []) {
      const range = historicalRange(history, chemical.name, chemical.unit, month);
      if (!range) continue;
      const row = rowFor(group(chemical.name, chemical.unit));
      // An alias in the archive must not allocate a property's maximum twice.
      row.maximum = Math.max(row.maximum ?? 0, range.expectedMax);
      row.expectedQuantity = Math.max(row.expectedQuantity ?? 0, range.expectedQuantity);
    }

    for (const chemical of period?.chemicals || []) {
      const target = group(chemical.name, chemical.unit);
      const row = rowFor(target);
      row.recordedQuantity = (row.recordedQuantity ?? 0) + chemical.quantity;
      target.hasRecordedProduct = true;
      if (productKey(chemical.name) === 'liquidchlorine') {
        target.georkyRefillQuantity += (chemical.technicians || [])
          .filter((technician) => technician.name.toLowerCase().includes('georky'))
          .reduce((sum, technician) => sum + technician.quantity, 0);
      }
    }
  }

  const chemicals = [...groups.values()].map((target) => {
    const rows = [...target.rows.values()].sort((a, b) => a.propertyName.localeCompare(b.propertyName));
    const referenced = rows.filter((row) => row.maximum !== null);
    const maximum = referenced.length ? referenced.reduce((sum, row) => sum + row.maximum!, 0) : null;
    const recordedQuantity = target.hasRecordedProduct ? rows.reduce((sum, row) => sum + (row.recordedQuantity ?? 0), 0) : null;
    const unreferenced = rows.filter((row) => row.maximum === null && row.recordedQuantity !== null);
    const unreferencedQuantity = unreferenced.reduce((sum, row) => sum + (row.recordedQuantity ?? 0), 0);
    const comparable = referenced.filter((row) => row.recordedQuantity !== null);
    const reportedReferenceProperties = comparable.length;
    const comparableQuantity = comparable.length && recordedQuantity !== null ? comparable.reduce((sum, row) => sum + row.recordedQuantity!, 0) : null;
    const comparisonMaximum = comparable.length ? comparable.reduce((sum, row) => sum + row.maximum!, 0) : null;
    const coverageComplete = referenced.length > 0 && reportedReferenceProperties === referenced.length && unreferencedQuantity === 0;
    return {
      id: target.id, name: target.name, unit: target.unit, recordedQuantity, maximum,
      comparableQuantity, comparisonMaximum,
      expectedQuantity: referenced.length ? referenced.reduce((sum, row) => sum + row.expectedQuantity!, 0) : null,
      percent: comparableQuantity !== null && comparisonMaximum !== null && comparisonMaximum > 0 ? comparableQuantity / comparisonMaximum * 100 : null,
      excessQuantity: comparableQuantity !== null && comparisonMaximum !== null ? Math.max(0, comparableQuantity - comparisonMaximum) : null,
      remainingQuantity: comparableQuantity !== null && comparisonMaximum !== null ? Math.max(0, comparisonMaximum - comparableQuantity) : null,
      referenceProperties: referenced.length, reportedReferenceProperties,
      unreferencedProperties: unreferenced.length, unreferencedQuantity, coverageComplete,
      georkyRefillQuantity: target.georkyRefillQuantity, properties: rows,
    };
  });

  return {
    month, scope: 'month' as const, months: [month], baselineYear: 2025,
    thresholds: { warning: 80, attention: 90, maximum: 100 },
    activeProperties: properties.length, uploadedProperties: properties.filter((property) => uploaded.has(property.id)).length,
    matchedHistoryProperties: matched.size,
    sources: [...new Set(periods.filter((period) => period.sourceName).map((period) => period.sourceName!))],
    chemicals,
  };
}

// Global compares property-month pairs, so a missing report never contributes
// an unmatched monthly allowance to the alert denominator.
export function globalCompanyConsumptionReport(properties: Property[], periods: Array<Period & { month: string }>, archive: HistoryProperty[]) {
  const propertyIds = new Set(properties.map((property) => property.id));
  const uploaded = periods.filter((period) => period.sourceName && propertyIds.has(period.propertyId));
  const months = [...new Set(uploaded.map((period) => period.month))].sort();
  const monthly = months.map((month) => companyConsumptionReport(month, properties, uploaded.filter((period) => period.month === month), archive));
  const empty = companyConsumptionReport('2025-01', properties, [], []);
  type ChemicalTotal = typeof empty.chemicals[number];
  type GlobalRow = PropertyTotal & { comparableQuantity: number | null; comparisonMaximum: number | null; referenceMonths: number; reportedMonths: number };
  const groups = new Map<string, {
    total: ChemicalTotal; rows: Map<string, GlobalRow>;
    references: Set<string>; reported: Set<string>; unreferenced: Set<string>;
    referencePropertyMonths: number; reportedReferencePropertyMonths: number;
  }>();
  const sum = (a: number | null, b: number | null) => a === null && b === null ? null : (a ?? 0) + (b ?? 0);
  const group = (chemical: ChemicalTotal) => {
    if (!groups.has(chemical.id)) groups.set(chemical.id, {
      total: { ...chemical, recordedQuantity: null, maximum: null, expectedQuantity: null, comparableQuantity: null, comparisonMaximum: null, georkyRefillQuantity: 0, unreferencedQuantity: 0 },
      rows: new Map(), references: new Set(), reported: new Set(), unreferenced: new Set(),
      referencePropertyMonths: 0, reportedReferencePropertyMonths: 0,
    });
    return groups.get(chemical.id)!;
  };
  for (const chemical of empty.chemicals) group(chemical);

  for (const report of monthly) for (const chemical of report.chemicals) {
    const target = group(chemical);
    for (const key of ['recordedQuantity', 'maximum', 'expectedQuantity', 'comparableQuantity', 'comparisonMaximum'] as const) {
      target.total[key] = sum(target.total[key], chemical[key]);
    }
    target.total.georkyRefillQuantity += chemical.georkyRefillQuantity;
    target.total.unreferencedQuantity += chemical.unreferencedQuantity;
    target.referencePropertyMonths += chemical.referenceProperties;
    target.reportedReferencePropertyMonths += chemical.reportedReferenceProperties;

    for (const row of chemical.properties) {
      if (!target.rows.has(row.propertyId)) target.rows.set(row.propertyId, {
        ...row, recordedQuantity: null, maximum: null, expectedQuantity: null,
        comparableQuantity: null, comparisonMaximum: null, referenceMonths: 0, reportedMonths: 0,
      });
      const combined = target.rows.get(row.propertyId)!;
      combined.recordedQuantity = sum(combined.recordedQuantity, row.recordedQuantity);
      combined.maximum = sum(combined.maximum, row.maximum);
      combined.expectedQuantity = sum(combined.expectedQuantity, row.expectedQuantity);
      if (row.maximum !== null) {
        target.references.add(row.propertyId);
        combined.referenceMonths += 1;
        if (row.recordedQuantity !== null) {
          target.reported.add(row.propertyId);
          combined.comparableQuantity = sum(combined.comparableQuantity, row.recordedQuantity);
          combined.comparisonMaximum = sum(combined.comparisonMaximum, row.maximum);
        }
      } else if (row.recordedQuantity !== null) target.unreferenced.add(row.propertyId);
      if (row.recordedQuantity !== null) combined.reportedMonths += 1;
    }
  }

  const chemicals = [...groups.values()].map(({ total, rows, references, reported, unreferenced, referencePropertyMonths, reportedReferencePropertyMonths }) => ({
    ...total,
    percent: total.comparableQuantity !== null && total.comparisonMaximum !== null && total.comparisonMaximum > 0 ? total.comparableQuantity / total.comparisonMaximum * 100 : null,
    excessQuantity: total.comparableQuantity !== null && total.comparisonMaximum !== null ? Math.max(0, total.comparableQuantity - total.comparisonMaximum) : null,
    remainingQuantity: total.comparableQuantity !== null && total.comparisonMaximum !== null ? Math.max(0, total.comparisonMaximum - total.comparableQuantity) : null,
    referenceProperties: references.size, reportedReferenceProperties: reported.size,
    referencePropertyMonths, reportedReferencePropertyMonths,
    unreferencedProperties: unreferenced.size,
    coverageComplete: referencePropertyMonths > 0 && referencePropertyMonths === reportedReferencePropertyMonths && total.unreferencedQuantity === 0,
    properties: [...rows.values()].sort((a, b) => a.propertyName.localeCompare(b.propertyName)),
  }));

  return {
    ...empty, month: 'global', scope: 'global' as const, months,
    uploadedProperties: new Set(uploaded.map((period) => period.propertyId)).size,
    matchedHistoryProperties: matchConsumptionHistory(properties, archive).size,
    sources: [...new Set(uploaded.map((period) => period.sourceName!))], chemicals,
  };
}
