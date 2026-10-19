export type HistoryChemical = { name: string; unit: string; months: [number, number, number, boolean][] };
export type HistoryFactor = { chemical: string; unit: string; month: number; factor: number };
export type HistoryProperty = { code: string; name: string; chemicals: HistoryChemical[]; factors: HistoryFactor[] };
