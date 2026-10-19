import type { HistoryProperty } from './consumption-history.types';

export const historyKey = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
const chemicalKey = (value: string) => {
  const key = historyKey(value);
  return key === 'liquid' ? 'liquidchlorine' : key === 'defilter' ? 'defilterpowder' : key;
};
const unitKey = (value: string) => value.trim().toLowerCase();
type PropertyIdentity = { id: string; name: string; code: string | null };

export function matchConsumptionHistory(properties: PropertyIdentity[], archive: HistoryProperty[]) {
  const candidates = properties.map((property) => {
    const codes = archive.filter((entry) => property.code && historyKey(entry.code) === historyKey(property.code));
    const matches = codes.length ? codes : archive.filter((entry) => historyKey(entry.name) === historyKey(property.name));
    return { property, history: matches.length === 1 ? matches[0] : undefined };
  });
  const result = new Map<string, HistoryProperty>();
  for (const candidate of candidates) {
    // Never assign the same historical consumption to two CRM properties.
    if (candidate.history && candidates.filter((entry) => entry.history === candidate.history).length === 1) result.set(candidate.property.id, candidate.history);
  }
  return result;
}

export function historicalChemicals(history: HistoryProperty, month: string) {
  if (!month.startsWith('2025-')) return null;
  const number = Number(month.slice(5));
  if (!history.chemicals.some((chemical) => chemical.months.some((entry) => entry[0] === number))) return null;
  return history.chemicals.flatMap((chemical) => {
    const entry = chemical.months.find((item) => item[0] === number);
    return entry && entry[1] > 0 ? [{ name: chemical.name, unit: chemical.unit, quantity: entry[1], cost: entry[2] }] : [];
  });
}

export function historicalRange(history: HistoryProperty | undefined, name: string, unit: string, month: string) {
  const chemical = history?.chemicals.find((entry) => chemicalKey(entry.name) === chemicalKey(name) && unitKey(entry.unit) === unitKey(unit));
  if (!chemical || chemical.months.length < 9 || chemical.months.filter((entry) => entry[1] > 0).length < 9) return null;
  const seasonalFactor = (number: number) => history!.factors.find((entry) => chemicalKey(entry.chemical) === chemicalKey(name) && unitKey(entry.unit) === unitKey(unit) && entry.month === number)?.factor ?? 1;
  const retained = chemical.months.filter((entry) => !entry[3]);
  if (retained.length < 6) return null;
  const normalized = retained.map(([number, value]) => value / new Date(Date.UTC(2025, number, 0)).getUTCDate() / seasonalFactor(number));
  const mean = normalized.reduce((sum, value) => sum + value, 0) / normalized.length;
  const sd = Math.sqrt(normalized.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (normalized.length - 1));
  const number = Number(month.slice(5));
  const days = new Date(Date.UTC(Number(month.slice(0, 4)), number, 0)).getUTCDate();
  const factor = seasonalFactor(number);
  // A review threshold, not a dosage or safety limit. A 3-SD band reduces nuisance alerts.
  return {
    expectedQuantity: mean * factor * days,
    expectedMin: Math.max(0, mean - 3 * sd) * factor * days,
    expectedMax: (mean + 3 * sd) * factor * days,
    historicalMean: retained.reduce((sum, entry) => sum + entry[1], 0) / retained.length,
    historicalMonths: chemical.months.length,
    excludedMonths: chemical.months.filter((entry) => entry[3]).map((entry) => entry[0]),
    historicalFactor: factor,
    seasonal: history!.factors.some((entry) => chemicalKey(entry.chemical) === chemicalKey(name) && unitKey(entry.unit) === unitKey(unit)),
    referenceSource: 'HISTORY_2025' as const,
  };
}
