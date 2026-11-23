import { recordedChemicalCost } from './proposal-context';

type WaterBody = { type: string; size: string | null; gallons: number | null };
type ComparableProperty = {
  waterBodies: WaterBody[];
  chemicalConsumptionPeriods: Parameters<typeof recordedChemicalCost>[0][];
};
type MatchBasis = 'GALLONS' | 'SIZE';

const minimumProperties = 5;
const volumeTolerance = 0.25;
const validSizes = new Set(['SMALL', 'MEDIUM', 'LARGE', 'EXTRA_LARGE']);

function bodyType(type: string) {
  return ({ POOL: 'SWIMMING_POOL', FOUNTAIN: 'DECORATIVE_WATER_FEATURE' } as Record<string, string>)[type] ?? type;
}

function comparableScope(bodies: WaterBody[], basis: MatchBasis) {
  const scope = bodies.map(body => ({
    type: bodyType(body.type), size: body.size && validSizes.has(body.size) ? body.size : '', gallons: body.gallons ?? 0,
  }));
  if (!scope.length || scope.some(body => basis === 'GALLONS' ? body.gallons <= 0 : body.type === 'SWIMMING_POOL' && !body.size)) return null;
  return scope.sort((a, b) =>
    a.type.localeCompare(b.type) || (basis === 'GALLONS' ? a.gallons - b.gallons : a.size.localeCompare(b.size)),
  );
}

export function estimateProposalChemicals(target: WaterBody[], properties: ComparableProperty[]) {
  const basis: MatchBasis = target.every(body => (body.gallons ?? 0) > 0) ? 'GALLONS' : 'SIZE';
  const scope = comparableScope(target, basis);
  if (!scope) return null;

  const matches = properties.flatMap(property => {
    if (property.waterBodies.length !== scope.length) return [];
    const candidate = comparableScope(property.waterBodies, basis);
    if (!candidate?.every((body, index) => {
      const reference = scope[index];
      return body.type === reference.type && (basis === 'GALLONS'
        ? Math.abs(body.gallons - reference.gallons) <= reference.gallons * volumeTolerance
        : body.size === reference.size);
    })) return [];
    const costs = property.chemicalConsumptionPeriods.map(recordedChemicalCost).filter(cost => cost !== null);
    if (!costs.length) return [];
    return [{ average: costs.reduce((sum, cost) => sum + cost, 0) / costs.length, months: costs.length }];
  }).sort((a, b) => a.average - b.average);
  if (matches.length < minimumProperties) return null;

  const median = (matches[Math.floor(matches.length / 2)].average + matches[Math.floor((matches.length - 1) / 2)].average) / 2;
  return {
    monthlyCost: Math.round(median * 100) / 100,
    basis,
    propertyCount: matches.length,
    recordedMonths: matches.reduce((sum, match) => sum + match.months, 0),
  };
}
