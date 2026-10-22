import { historyKey } from './consumption-history';
import { productKey, unitKey } from './consumption-products';

export type ConsumptionMaximum = {
  propertyCode: string; propertyName: string; chemicalName: string; unit: string;
  maximum: number; recordedMonths: number; excludedMonths: number; sourceName: string;
};

export function normalizeConsumptionMaximums(rows: ConsumptionMaximum[]) {
  const result = new Map<string, ConsumptionMaximum>();
  for (const row of rows) {
    if (!row.propertyCode?.trim() || !row.propertyName?.trim() || !row.chemicalName?.trim() || !row.unit?.trim() || !row.sourceName?.trim()
      || !Number.isFinite(row.maximum) || row.maximum < 0
      || !Number.isInteger(row.recordedMonths) || row.recordedMonths < 0
      || !Number.isInteger(row.excludedMonths) || row.excludedMonths < 0 || row.excludedMonths > row.recordedMonths) {
      throw new Error('Invalid property chemical maximum.');
    }
    const normalized = { ...row, propertyCode: row.propertyCode.trim(), propertyName: row.propertyName.trim(), chemicalName: productKey(row.chemicalName), unit: unitKey(row.unit) };
    const key = `${historyKey(normalized.propertyCode)}:${normalized.chemicalName}:${normalized.unit}`;
    const previous = result.get(key);
    // Liquid/Liquid Chlorine and DE Filter/DE Filter Powder are the same product,
    // not additional allowances. Retain the largest supplied CLEANED maximum.
    if (!previous || normalized.maximum > previous.maximum) result.set(key, normalized);
  }
  return [...result.values()];
}

export function matchConsumptionMaximums(properties: Array<{ id: string; name: string; code: string | null }>, rows: ConsumptionMaximum[]) {
  const groups = new Map<string, ConsumptionMaximum[]>();
  for (const row of rows) {
    const key = historyKey(row.propertyCode);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(row);
  }
  const identities = [...groups.entries()];
  const claimedByCode = new Set(identities.filter(([code]) => properties.some((property) => property.code && historyKey(property.code) === code)).map(([code]) => code));
  const cleanName = (name: string) => historyKey(name.replace(/\s*\([^)]*\)/g, ''));
  const candidates = properties.map((property) => {
    const byCode = identities.filter(([code]) => property.code && code === historyKey(property.code));
    // A legacy name-only record must not invalidate an unambiguous Skimmer ID.
    const availableNames = identities.filter(([code]) => !claimedByCode.has(code));
    const exactNames = availableNames.filter(([, entries]) => entries.some((row) => historyKey(row.propertyName) === historyKey(property.name)));
    const byName = exactNames.length ? exactNames : availableNames.filter(([, entries]) => entries.some((row) => cleanName(row.propertyName) === cleanName(property.name)));
    const matches = byCode.length ? byCode : byName;
    return { property, group: matches.length === 1 ? matches[0] : undefined };
  });
  const result = new Map<string, ConsumptionMaximum[]>();
  for (const candidate of candidates) {
    if (candidate.group && candidates.filter((entry) => entry.group?.[0] === candidate.group![0]).length === 1) {
      result.set(candidate.property.id, candidate.group[1]);
    }
  }
  return result;
}
