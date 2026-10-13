export type ConsumptionBody = { id: string; name: string; type: string; size: string | null; gallons: number | null; active: boolean };
export const commercialPoolReferences: Record<string, number> = { SMALL: 600, MEDIUM: 700, LARGE: 900, EXTRA_LARGE: 1300 };
export const commercialBodyReferences: Record<string, number> = { SPA: 250, KIDDIE_POOL: 400, SPLASH_PAD: 400, DECORATIVE_WATER_FEATURE: 150 };

export function commercialWeight(body: ConsumptionBody) {
  return commercialBodyReferences[body.type] ?? commercialPoolReferences[body.size || ''] ?? 700;
}

// Largest remainders preserve the original total, including cents and fractional doses.
export function distributeInteger(total: number, weights: number[]) {
  if (!weights.length) return [];
  const sum = weights.reduce((a, b) => a + b, 0);
  const exact = weights.map((weight) => total * weight / sum);
  const result = exact.map(Math.floor);
  let remainder = total - result.reduce((a, b) => a + b, 0);
  const order = exact.map((value, index) => ({ index, fraction: value - result[index] })).sort((a, b) => b.fraction - a.fraction || a.index - b.index);
  for (const entry of order) { if (remainder-- <= 0) break; result[entry.index]++; }
  return result;
}

export function allocateConsumption(bodies: ConsumptionBody[], monthlyFee: number | null, cost: number) {
  const active = bodies.filter((body) => body.active);
  const volumeComplete = active.length > 0 && active.every((body) => body.gallons !== null && body.gallons > 0);
  const weights = active.map((body) => volumeComplete ? body.gallons! : commercialWeight(body));
  const costCents = Math.round(cost * 100);
  const assignedCosts = distributeInteger(costCents, weights);
  const totalFeeCents = monthlyFee === null ? 0 : Math.round(monthlyFee * 100);
  const assignedFees = active.map(() => 0);
  let pending = active.map((_, index) => index);
  let remainingFee = totalFeeCents;
  while (pending.length) {
    const shares = distributeInteger(remainingFee, pending.map((index) => weights[index]));
    const capped = pending.filter((index, i) => active[index].type === 'SPA' && shares[i] > 25000);
    if (!capped.length) { pending.forEach((index, i) => assignedFees[index] = shares[i]); remainingFee = 0; break; }
    for (const index of capped) { assignedFees[index] = 25000; remainingFee -= 25000; }
    pending = pending.filter((index) => !capped.includes(index));
  }
  const weightSum = weights.reduce((a, b) => a + b, 0);
  return {
    basis: volumeComplete ? 'GALLONS' : 'COMMERCIAL_SIZE',
    totalGallons: volumeComplete ? active.reduce((sum, body) => sum + body.gallons!, 0) : null,
    unallocatedFee: remainingFee / 100,
    unallocatedCost: active.length ? 0 : cost,
    bodies: active.map((body, index) => ({ ...body, share: weights[index] / weightSum, monthlyFee: monthlyFee === null ? null : assignedFees[index] / 100, chemicalCost: assignedCosts[index] / 100, costPercent: monthlyFee !== null && assignedFees[index] > 0 ? assignedCosts[index] / assignedFees[index] * 100 : null })),
  };
}
