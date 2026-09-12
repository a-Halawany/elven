/**
 * PHASE 4 — the forecasters, the scores and the parsers, at the service level.
 *
 * Deterministic arithmetic on synthetic series, and the two parsers on the
 * frozen replay bytes of the publishers they read. No database, no network.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { seasonalNaive, seasonalNaivePoint, holtWinters, pinballMean, covered, pinball,
  type Point } from '../../src/prediction/models/models.js';
import { PARSERS } from '../../src/prediction/series/parsers.js';
import { cadenceOf, stepsFor } from '../../src/prediction/series/series.service.js';

const ROOT = join(import.meta.dirname, '..', '..', '..', '..');

function daily(n: number, f: (i: number) => number, start = '2022-01-01'): Point[] {
  const out: Point[] = [];
  const d = new Date(`${start}T00:00:00Z`);
  for (let i = 0; i < n; i += 1) {
    out.push({ date: d.toISOString().slice(0, 10), value: f(i) });
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/** A deterministic pseudo-random sequence so the tests are reproducible. */
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => { s = (1664525 * s + 1013904223) >>> 0; return s / 2 ** 32 - 0.5; };
}

describe('seasonal naive', () => {
  it('repeats the value one season back, for every step of the horizon', () => {
    const y = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14];
    expect(seasonalNaivePoint(y, 1, 7)).toBe(8);
    expect(seasonalNaivePoint(y, 7, 7)).toBe(14);
    expect(seasonalNaivePoint(y, 8, 7)).toBe(8);
    expect(seasonalNaivePoint(y, 1, 1)).toBe(14);
  });

  it('produces ordered quantiles from empirical errors, never a point alone', () => {
    const rnd = lcg(7);
    const pts = daily(200, (i) => 40 + 10 * Math.sin((2 * Math.PI * i) / 7) + 3 * rnd());
    const f = seasonalNaive(pts, 30, 7);
    expect(f.quantiles.q10).toBeLessThanOrEqual(f.quantiles.q50);
    expect(f.quantiles.q50).toBeLessThanOrEqual(f.quantiles.q90);
    expect(f.errorsUsed).toBeGreaterThan(50);
    expect(f.path.length).toBe(30);
  });
});

describe('holt-winters additive', () => {
  it('beats seasonal naive on a series with a trend, and both are scored the same way', () => {
    const rnd = lcg(11);
    const pts = daily(400, (i) => 100 + 0.2 * i + 8 * Math.sin((2 * Math.PI * i) / 7) + 2 * rnd());
    // Averaged over several origins: one origin is an anecdote, not a comparison.
    let hwLoss = 0; let snLoss = 0;
    for (const o of [300, 310, 320, 330, 340, 350, 360, 370]) {
      const train = pts.slice(0, o);
      const actual = pts[o + 29] as Point;
      hwLoss += pinballMean(actual.value, holtWinters(train, 30, 7).quantiles);
      snLoss += pinballMean(actual.value, seasonalNaive(train, 30, 7).quantiles);
    }
    expect(hwLoss).toBeLessThan(snLoss);
    expect(holtWinters(pts.slice(0, 370), 30, 7).parameters['alpha']).toBeDefined();
  });

  it('degrades to a level-only fit on a series too short for a season', () => {
    const f = holtWinters(daily(9, (i) => 5 + i), 3, 7);
    expect(Number.isFinite(f.quantiles.q50)).toBe(true);
  });
});

describe('scores', () => {
  it('pinball loss penalises the side the quantile was supposed to cover', () => {
    expect(pinball(10, 8, 0.9)).toBeCloseTo(1.8);
    expect(pinball(6, 8, 0.9)).toBeCloseTo(0.2);
    expect(pinball(10, 8, 0.1)).toBeCloseTo(0.2);
  });
  it('coverage is the 10–90 band, inclusive', () => {
    expect(covered(5, { q10: 5, q50: 6, q90: 7 })).toBe(true);
    expect(covered(7.01, { q10: 5, q50: 6, q90: 7 })).toBe(false);
  });
});

describe('cadence', () => {
  it('tells a business-day series from a daily one and sizes the horizon in observations', () => {
    const business = daily(40, (i) => i).filter((p) => ![0, 6].includes(new Date(`${p.date}T00:00:00Z`).getUTCDay()));
    expect(cadenceOf(business)).toBe('business');
    expect(cadenceOf(daily(40, (i) => i))).toBe('daily');
    expect(stepsFor(30, 'business')).toBe(21);
    expect(stepsFor(30, 'daily')).toBe(30);
  });
});

describe('parsers read the publishers\' own bytes', () => {
  it('sdmx-json-observations@1 reads the ECB replay set', () => {
    const bytes = readFileSync(join(ROOT, 'fixtures', 'phase1', 'replay', 'ecb-eurusd', 'eurusd.json'));
    const rows = PARSERS['sdmx-json-observations@1']?.(bytes, 'OBS_VALUE', null) ?? [];
    expect(rows.length).toBeGreaterThan(10);
    expect(rows[0]).toEqual({ date: '2024-01-02', value: 1.0956 });
  });

  it('arcgis-feature-attribute@1 reads a PortWatch page and honours the selector', () => {
    const dir = join(ROOT, 'fixtures', 'phase1', 'replay', 'imf-portwatch-chokepoints');
    const manifest = JSON.parse(readFileSync(join(dir, 'MANIFEST.json'), 'utf8')) as { entries: Array<{ file: string }> };
    const bytes = readFileSync(join(dir, manifest.entries[0]?.file as string));
    const all = PARSERS['arcgis-feature-attribute@1']?.(bytes, 'n_total', null) ?? [];
    const mine = PARSERS['arcgis-feature-attribute@1']?.(bytes, 'n_total', 'chokepoint4') ?? [];
    const other = PARSERS['arcgis-feature-attribute@1']?.(bytes, 'n_total', 'chokepoint1') ?? [];
    expect(all.length).toBeGreaterThan(5);
    expect(mine.length).toBe(all.length);
    expect(other.length).toBe(0);
    expect(mine.every((r) => /^\d{4}-\d{2}-\d{2}$/.test(r.date) && Number.isFinite(r.value))).toBe(true);
  });

  it('a single framed feature parses as one observation', () => {
    const one = Buffer.from(JSON.stringify({ attributes: { portid: 'chokepoint4', date: '2024-01-14', n_total: 17 } }));
    expect(PARSERS['arcgis-feature-attribute@1']?.(one, 'n_total', 'chokepoint4')).toEqual([{ date: '2024-01-14', value: 17 }]);
  });

  it('bytes that are not the declared shape yield nothing rather than a guess', () => {
    expect(PARSERS['sdmx-json-observations@1']?.(Buffer.from('not json'), 'x', null)).toEqual([]);
    expect(PARSERS['arcgis-feature-attribute@1']?.(Buffer.from('{"features":"nope"}'), 'n_total', null)).toEqual([]);
  });
});
