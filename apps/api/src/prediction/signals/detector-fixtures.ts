/**
 * THE DETECTORS' FALSE-POSITIVE CONTROLS — CP-6 B28 (0088 §S1; F-P4-10 "seeded-signal / null / drift / source-gap fixtures and false-positive
 * controls"; PR-25-005 "signals driven by source artifacts, correlated feeds, model drift, seasonal noise, or insufficient evidence").
 *
 * Four SYNTHETIC series (data_provenance 'synthetic' — generated here, never an observation of anything, never presented as a feed), each
 * with the answer every series detector must give on it:
 *   seeded     a stationary weekly-seasonal series whose last five days drop by 30 → novelty and change point FIRE
 *   null       the same series without the drop → nothing fires (seasonal noise is not a signal)
 *   drift      a series whose level climbs 1 a day → novelty and acceleration HOLD it (baseline_drift): a deviation from a drifting
 *              baseline is the drift, not a novelty
 *   source_gap the seeded series with ten days missing before the as-of day → every detector HOLDS it (source_gap): a silent source is not
 *              read as a quiet world
 * The workbench runs each available series detector on each fixture through the SAME SQL functions the scan uses (nothing recorded) and
 * shows whether the detector's answer is the expected one — a detector that fires on `null`, or reads `drift` / `source_gap` without
 * holding, fails its control.
 */
export type SeriesDetectorKey = 'novelty' | 'acceleration' | 'change_point';
export interface FixturePoint { d: string; v: number }
export interface DetectorFixture {
  key: 'seeded' | 'null' | 'drift' | 'source_gap';
  data_provenance: 'synthetic';
  description: string;
  asOf: string;
  points: FixturePoint[];
  /** What each series detector must answer: fire | quiet | held:<reason>. */
  expect: Record<SeriesDetectorKey, 'fire' | 'quiet' | `held:${string}`>;
}

const START = Date.UTC(2024, 0, 1);
const day = (i: number): string => new Date(START + i * 86_400_000).toISOString().slice(0, 10);
/** Deterministic weekly seasonality and a small fixed pattern of noise (no randomness: the control is reproducible). */
const base = (i: number): number => Number((60 + 9 * Math.sin((2 * Math.PI * i) / 7) + ((i * 7919) % 13) / 13 - 0.5).toFixed(4));
const series = (n: number, f: (i: number) => number | null): FixturePoint[] =>
  Array.from({ length: n }, (_, i) => ({ i, v: f(i) })).filter((x) => x.v !== null).map((x) => ({ d: day(x.i), v: x.v as number }));

export const DETECTOR_FIXTURES: readonly DetectorFixture[] = Object.freeze([
  { key: 'seeded', data_provenance: 'synthetic', description: 'SYNTHETIC — a weekly-seasonal series whose last five days drop by 30', asOf: day(99),
    points: series(100, (i) => base(i) - (i >= 95 ? 30 : 0)), expect: { novelty: 'fire', acceleration: 'quiet', change_point: 'fire' } },
  { key: 'null', data_provenance: 'synthetic', description: 'SYNTHETIC — the same weekly-seasonal series with no drop (seasonal noise only)', asOf: day(99),
    points: series(100, (i) => base(i)), expect: { novelty: 'quiet', acceleration: 'quiet', change_point: 'quiet' } },
  { key: 'drift', data_provenance: 'synthetic', description: 'SYNTHETIC — a series whose level climbs by 1 a day (a drifting baseline)', asOf: day(99),
    points: series(100, (i) => base(i) + i), expect: { novelty: 'held:baseline_drift', acceleration: 'held:baseline_drift', change_point: 'quiet' } },
  { key: 'source_gap', data_provenance: 'synthetic', description: 'SYNTHETIC — the seeded series with the ten days before the as-of day missing', asOf: day(99),
    points: series(100, (i) => (i >= 89 && i <= 98 ? null : base(i) - (i >= 95 ? 30 : 0))), expect: { novelty: 'held:source_gap', acceleration: 'held:source_gap', change_point: 'held:source_gap' } },
] as DetectorFixture[]);

/** The answer a reading gives, in the fixtures' vocabulary. */
export function answerOf(reading: Record<string, unknown>): 'fire' | 'quiet' | `held:${string}` {
  if (typeof reading['held'] === 'string') return `held:${reading['held']}`;
  return reading['fired'] === true ? 'fire' : 'quiet';
}
