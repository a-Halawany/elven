/**
 * B82 §0 — THE CHART GRAMMAR (assertGrammar, lib/b82-seams.ts) and the seams' library contract. A spec with every declaration passes; each
 * missing or malformed declaration is named in words; the problems are deterministic and the function never throws. Every figure here is
 * SYNTHETIC fixture data.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { assertGrammar, CHART_KINDS, LIBRARY_B82, type ChartSpec } from './b82-seams';

const WEB = join(__dirname, '..');
const GOOD: ChartSpec = {
  kind: 'probability_band',
  title: 'Bab el-Mandeb transit delay, next 30 days (SYNTHETIC)',
  basis: 'model forecast — quantiles of an unvalidated event forecast',
  time: { basis: 'horizon', cutoff: '2026-10-18T00:00:00Z', asOf: '2026-10-19T08:00:00Z' },
  units: [{ measure: 'probability of a delay', unit: 'probability (0–1)' }],
  sources: [{ citation: { kind: 'forecast', id: '01a0f7df-0000-7000-8000-000000000001', version: 1, digest: 'a'.repeat(64) }, label: 'corridor transit-delay forecast' }],
  uncertainty: { kind: 'band', statement: 'q10–q90 of the forecast distribution; the forecast is unvalidated', level: 0.8 },
  legend: [
    { key: 'q50', label: 'median (q50)', dash: 'solid', marker: 'circle' },
    { key: 'band', label: 'q10–q90 band', dash: 'dashed', marker: 'none', token: 'color.uncertain' },
  ],
  alternative: {
    summary: 'The median probability is 0.343, between 0.282 and 0.406 (q10–q90).',
    columns: [{ key: 'day', label: 'Day', kind: 'date' }, { key: 'q50', label: 'Median', kind: 'number', unit: 'probability (0–1)' }],
  },
};
const without = <K extends keyof ChartSpec>(k: K): ChartSpec => { const s = { ...GOOD } as Partial<ChartSpec>; delete s[k]; return s as ChartSpec; };

describe('assertGrammar — a complete spec passes; every declaration is required', () => {
  it('the complete spec has no problem', () => { expect(assertGrammar(GOOD)).toEqual([]); });
  it('each missing top-level declaration is named, field first', () => {
    for (const k of ['kind', 'title', 'basis', 'time', 'units', 'sources', 'uncertainty', 'legend', 'alternative'] as const) {
      const p = assertGrammar(without(k));
      expect(p.length, k).toBeGreaterThan(0);
      expect(p.some((x) => x.startsWith(`${k}:`)), `${k}: ${JSON.stringify(p)}`).toBe(true);
    }
  });
  it('never throws on any shape, and answers the same problems in the same order', () => {
    for (const bad of [null, undefined, {}, [], 'x', { title: 1, time: 'now', legend: [null], units: [null], sources: [null], alternative: { columns: [null] } }]) {
      expect(() => assertGrammar(bad as unknown as ChartSpec)).not.toThrow();
      expect(assertGrammar(bad as unknown as ChartSpec)).toEqual(assertGrammar(bad as unknown as ChartSpec));
    }
    expect(assertGrammar({} as ChartSpec).map((p) => p.split(':')[0])).toEqual(['kind', 'title', 'basis', 'time', 'units', 'sources', 'uncertainty', 'legend', 'alternative']);
  });
  it('the kind is one of the library\'s', () => {
    expect(CHART_KINDS.length).toBe(36);
    expect(assertGrammar({ ...GOOD, kind: 'pie' as ChartSpec['kind'] })).toEqual(['kind: "pie" is not a library chart kind']);
    expect(assertGrammar({ ...GOOD, title: '  ' })).toEqual(['title: missing — a chart states what it shows']);
  });
});

describe('assertGrammar — time: basis, cutoff, as-of', () => {
  it('as-of is an ISO instant; the cutoff an instant not after it, or a declared absence with its reason; a DATE is an instant of its day', () => {
    expect(assertGrammar({ ...GOOD, time: { ...GOOD.time, asOf: 'yesterday' } })).toEqual(['time: the as-of instant is missing or not an ISO instant']);
    expect(assertGrammar({ ...GOOD, time: { ...GOOD.time, cutoff: '2026-10-20T00:00:00Z' } })).toEqual(['time: the cutoff is after the as-of instant']);
    expect(assertGrammar({ ...GOOD, time: { ...GOOD.time, cutoff: { absent: '' } } })).toEqual(['time: the cutoff is missing — an instant, or a declared absence with its reason']);
    expect(assertGrammar({ ...GOOD, time: { ...GOOD.time, cutoff: { absent: 'a catalogue specimen has no data cutoff' } } })).toEqual([]);
    expect(assertGrammar({ ...GOOD, time: { basis: 'event', cutoff: '2026-10-18', asOf: '2026-10-19' } })).toEqual([]);
    expect(assertGrammar({ ...GOOD, time: { ...GOOD.time, basis: 'wall' as 'event' } })[0]).toMatch(/^time: the basis "wall"/);
  });
});

describe('assertGrammar — units, sources, uncertainty', () => {
  it('units: each names a measure and a unit, no measure twice', () => {
    expect(assertGrammar({ ...GOOD, units: [{ measure: 'x', unit: '' }], alternative: { ...GOOD.alternative, columns: [GOOD.alternative.columns[0]!] } })).toEqual(['units: entry 1 names no measure or no unit']);
    expect(assertGrammar({ ...GOOD, units: [...GOOD.units, { ...GOOD.units[0]!, unit: 'percent' }] })).toEqual(['units: the measure "probability of a delay" is declared twice']);
  });
  it('sources: a citation names an exact version; a named read is labelled; a SYNTHETIC specimen is never mixed with real sources', () => {
    expect(assertGrammar({ ...GOOD, sources: [{ citation: { kind: 'forecast', id: 'x', version: 0, digest: null }, label: 'f' }] }))
      .toEqual(['sources: entry 1 cites no exact version (kind, id, version ≥ 1)']);
    expect(assertGrammar({ ...GOOD, sources: [{ read: '/prediction/forecasts/x', label: '' }] })).toEqual(['sources: entry 1 has no label']);
    expect(assertGrammar({ ...GOOD, sources: [{ specimen: 'a catalogue specimen (SYNTHETIC)' }] })).toEqual([]);
    expect(assertGrammar({ ...GOOD, sources: [...GOOD.sources, { specimen: 'a catalogue specimen (SYNTHETIC)' }] })).toEqual(['sources: a SYNTHETIC specimen is mixed with real sources']);
  });
  it('uncertainty: a statement always; a band or interval states its level in (0, 1); "not quantified" passes with its reason', () => {
    expect(assertGrammar({ ...GOOD, uncertainty: { kind: 'band', statement: 'q10–q90' } })).toEqual(['uncertainty: a band or interval states its level in (0, 1)']);
    expect(assertGrammar({ ...GOOD, uncertainty: { kind: 'band', statement: 'q10–q90', level: 80 } })).toEqual(['uncertainty: a band or interval states its level in (0, 1)']);
    expect(assertGrammar({ ...GOOD, uncertainty: { kind: 'not_quantified', statement: '' } })).toEqual(['uncertainty: the statement is missing']);
    expect(assertGrammar({ ...GOOD, uncertainty: { kind: 'not_quantified', statement: 'the source states no error for these counts' } })).toEqual([]);
  });
});

describe('assertGrammar — the legend: never colour alone, colour only as a token name (D5)', () => {
  it('two entries with the same dash and marker are told apart by colour alone — refused unless both are labelled in place', () => {
    const same = [{ key: 'a', label: 'Suez', dash: 'solid', marker: 'circle', token: 'color.accent-default' }, { key: 'b', label: 'Cape', dash: 'solid', marker: 'circle', token: 'color.warning' }] as ChartSpec['legend'];
    expect(assertGrammar({ ...GOOD, legend: same })).toEqual(['legend: two entries share solid with marker circle — told apart by colour alone']);
    expect(assertGrammar({ ...GOOD, legend: same.map((e) => ({ ...e, directLabel: true })) })).toEqual([]);
  });
  it('a raw colour is refused; keys and labels are unique; a dash and a marker are declared', () => {
    expect(assertGrammar({ ...GOOD, legend: [{ ...GOOD.legend[0]!, token: '#0B6674' }] })).toEqual(['legend: entry 1\'s colour is not a token name (color.*)']);
    expect(assertGrammar({ ...GOOD, legend: [{ ...GOOD.legend[0]!, token: 'rgba(1, 2, 3, 0.5)' }] })).toEqual(['legend: entry 1\'s colour is not a token name (color.*)']);
    expect(assertGrammar({ ...GOOD, legend: [GOOD.legend[0]!, { ...GOOD.legend[1]!, key: 'q50' }] })).toEqual(['legend: the key "q50" is used twice']);
    expect(assertGrammar({ ...GOOD, legend: [{ ...GOOD.legend[0]!, dash: 'wavy' as 'solid', marker: 'star' as 'circle' }] }))
      .toEqual(['legend: entry 1 declares no dash pattern', 'legend: entry 1 declares no marker shape']);
  });
});

describe('assertGrammar — the table alternative is mandatory', () => {
  it('a summary and at least one column; keys unique; a number column names a unit that units declares', () => {
    expect(assertGrammar({ ...GOOD, alternative: { ...GOOD.alternative, summary: '' } })).toEqual(['alternative: the text summary is missing']);
    expect(assertGrammar({ ...GOOD, alternative: { ...GOOD.alternative, columns: [] } })).toEqual(['alternative: no columns — the table alternative carries the values']);
    expect(assertGrammar({ ...GOOD, alternative: { ...GOOD.alternative, columns: [{ key: 'q50', label: 'Median', kind: 'number' }] } })).toEqual(['alternative: the number column "q50" names no unit']);
    expect(assertGrammar({ ...GOOD, alternative: { ...GOOD.alternative, columns: [{ key: 'q50', label: 'Median', kind: 'number', unit: 'days' }] } }))
      .toEqual(['alternative: the number column "q50" uses the unit "days", which units does not declare']);
    expect(assertGrammar({ ...GOOD, alternative: { ...GOOD.alternative, columns: [GOOD.alternative.columns[0]!, GOOD.alternative.columns[0]!] } })).toEqual(['alternative: the column key "day" is used twice']);
  });
});

describe('LIBRARY_B82 — one top-level component file per part; no name taken twice; §0\'s frame exported', () => {
  it('every file is a top-level components/*.tsx (B107\'s inventory) and no export is named twice across the parts', () => {
    const all = Object.values(LIBRARY_B82).flatMap((l) => l.exports as readonly string[]);
    expect(new Set(all).size).toBe(all.length);
    for (const l of Object.values(LIBRARY_B82)) for (const f of l.files) expect(f).toMatch(/^components\/[^/]+\.tsx$/);
    expect(Object.values(LIBRARY_B82).map((l) => l.part)).toEqual(['§0 → §CF', '§TS', '§EV', '§CF', '§GM', '§SC', '§PX']);
  });
  it('components/chart-frame.tsx exports exactly ChartFrame, composes the grammar and declares no heading', () => {
    const src = readFileSync(join(WEB, 'components/chart-frame.tsx'), 'utf8');
    expect([...src.matchAll(/^export function ([A-Z][A-Za-z0-9]*)/gm)].map((m) => m[1])).toEqual([...LIBRARY_B82.frame.exports]);
    expect(src).toMatch(/assertGrammar\(spec\)/);
    expect(src).not.toMatch(/<h[1-6]\b/);
  });
});
