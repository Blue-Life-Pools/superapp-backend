type Period = { month: string; monthlyFee: unknown; sourceName: string | null; chemicals: unknown };

export function proposalHistoryWindow(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Bogota', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const year = Number(parts.find(part => part.type === 'year')!.value);
  const month = parts.find(part => part.type === 'month')!.value;
  return { from: `${year - 1}-${month}`, before: `${year}-${month}` };
}

export function summarizeProposalHistory(periods: Period[]) {
  const recorded = periods.flatMap(period => {
    if (!period.sourceName || !Array.isArray(period.chemicals) || !period.chemicals.length) return [];
    const costs = period.chemicals.map((chemical: unknown) => chemical && typeof chemical === 'object' ? (chemical as { cost?: unknown }).cost : null);
    if (!costs.every(cost => typeof cost === 'number' && Number.isFinite(cost) && cost >= 0)) return [];
    return [{ month: period.month, cost: (costs as number[]).reduce((sum, cost) => sum + cost, 0) }];
  }).sort((a, b) => a.month.localeCompare(b.month));
  const latestFee = [...periods].sort((a, b) => b.month.localeCompare(a.month)).find(period => period.monthlyFee != null && Number.isFinite(Number(period.monthlyFee)) && Number(period.monthlyFee) >= 0);
  return {
    chemicalHistory: {
      averageMonthlyCost: recorded.length ? Math.round(recorded.reduce((sum, period) => sum + period.cost, 0) / recorded.length * 100) / 100 : null,
      months: recorded.length,
      from: recorded[0]?.month ?? null,
      to: recorded.at(-1)?.month ?? null,
    },
    latestFee: latestFee ? { month: latestFee.month, monthlyFee: Number(latestFee.monthlyFee) } : null,
  };
}
