/**
 * B82 §TS — the number grammar (NUM-01/02/03/09/11, CNT-09, HX-03): the precision policy, probability, confidence, range, estimate and
 * uncertainty as pure functions; and THE RATCHET on raw `toFixed(` in the app's pages (NUM-09 — a page formats numbers through the policy;
 * the pages B82 §TS owns carry none; every other page may only shrink its count). CONSTRUCTION evidence only.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CERTAINTY_WORDS } from './content-b81';
import {
  CONFIDENCE_CLASSES, EVIDENCE_CLASSES, HORIZONS, MEASURE_KINDS, NUMBER_POLICY_VERSION, UNCERTAINTY_CLASSES, confidenceView, estimateView, horizonClassOf, horizonDays,
  preciseNumber, precisionFor, probabilityView, rangeView, roundSignificant, uncertaintyView, uncertaintyWords,
} from './numbers-b82';

describe('NUM-09 · the precision policy (D17: in code, versioned)', () => {
  it('every measure × horizon × evidence cell resolves; a longer horizon or weaker evidence never supports MORE precision', () => {
    const order = (e: string) => EVIDENCE_CLASSES.indexOf(e as never);
    for (const m of MEASURE_KINDS) for (const hz of HORIZONS) for (const e of EVIDENCE_CLASSES) {
      const r = precisionFor({ measure: m, horizon: hz, evidence: e });
      expect(r.key).toBe(`${m}:${hz}:${e}`); expect(r.version).toBe(NUMBER_POLICY_VERSION);
      expect(r.significant).toBeGreaterThanOrEqual(1); expect([1, 5, 10]).toContain(r.percentStep);
      const i = HORIZONS.indexOf(hz);
      if (i > 0) expect(r.significant).toBeLessThanOrEqual(precisionFor({ measure: m, horizon: HORIZONS[i - 1]!, evidence: e }).significant);
      if (order(e) > 0 && order(e) <= 1) expect(r.significant).toBeLessThanOrEqual(precisionFor({ measure: m, horizon: hz, evidence: EVIDENCE_CLASSES[0]! }).significant);
    }
  });
  it('significant-digit rounding is exact for the usual magnitudes', () => {
    expect(roundSignificant(0.34312, 2)).toBe(0.34); expect(roundSignificant(1234.5, 2)).toBe(1200); expect(roundSignificant(-0.0456, 1)).toBe(-0.05); expect(roundSignificant(0, 3)).toBe(0);
  });
  it('unsupported precision is rounded for display, SAID, and the exact value kept for copying (never lost)', () => {
    const n = preciseNumber(0.343217, { measure: 'quantity', horizon: 'short', evidence: 'uncalibrated_model' });
    expect(n.text).toBe('0.34'); expect(n.shown).toBe(0.34); expect(n.unsupportedPrecision).toBe(true); expect(n.canonical).toBe('0.343217');
    expect(n.note).toMatch(/^shown to 2 significant digits \(an uncalibrated model output supports two significant digits/);
    const o = preciseNumber(12.5, { measure: 'quantity', horizon: 'observed', evidence: 'observed', unit: 'days' });
    expect(o).toMatchObject({ text: '12.5', unit: 'days', unsupportedPrecision: false, note: null });
    expect(preciseNumber(18394, { measure: 'count', horizon: 'observed', evidence: 'observed' }).text).toBe('18,394');   // a count keeps every digit
    expect(preciseNumber(null, { measure: 'quantity', horizon: 'short', evidence: 'derived' })).toMatchObject({ text: '—', shown: null, state: 'not_a_number' });
    expect(preciseNumber(4200, { measure: 'currency', horizon: 'long', evidence: 'elicited', unit: 'EUR' }).text).toBe('4,000');
  });
  it('the horizon classes', () => {
    expect([horizonClassOf(null), horizonClassOf(5), horizonClassOf(30), horizonClassOf(365), horizonClassOf(1825)]).toEqual(['observed', 'nowcast', 'short', 'medium', 'long']);
    expect([horizonDays('30d'), horizonDays('12w'), horizonDays('6m'), horizonDays('5y'), horizonDays('soon')]).toEqual([30, 84, 180, 1825, null]);
  });
});

describe('NUM-01 · probability — on the contract\'s scale with its definition, calibration, horizon, cutoff and uncertainty', () => {
  const base = { value: 0.343, definition: 'a transit delay above 48 h at Bab el-Mandeb', horizon: '30 days', horizonClass: 'short' as const, cutoff: '2026-10-18T00:00:00Z',
    uncertainty: 'q10–q90 0.282–0.406', evidence: 'uncalibrated_model' as const };
  it('0–100 % by the contract; an uncalibrated value to the nearest 5 % — the rounding said', () => {
    const p = probabilityView({ ...base, scale: 'percent', calibration: { state: 'uncalibrated', basis: 'no backtest recorded' } });
    expect(p.text).toBe('35 %'); expect(p.exact).toBe('0.343'); expect(p.unsupportedPrecision).toBe(true); expect(p.problems).toEqual([]);
    expect(p.lines.map((l) => l.term)).toEqual(['Probability of', 'Precision', 'Calibration', 'Horizon', 'Cutoff', 'Uncertainty']);
    expect(p.lines.find((l) => l.term === 'Calibration')!.value).toMatch(/^NOT calibrated — no backtest recorded/);
  });
  it('0–1 by the contract; a calibrated value to the whole percent', () => {
    const p = probabilityView({ ...base, scale: 'unit', evidence: 'calibrated_model', calibration: { state: 'calibrated', basis: 'rolling backtest', score: { name: 'Brier', value: 0.12 } } });
    expect(p.text).toBe('0.34'); expect(p.lines.find((l) => l.term === 'Calibration')!.value).toBe('calibrated — rolling backtest (Brier 0.12)');
  });
  it('every missing declaration is STATED, never blank; an out-of-range value is not re-scaled', () => {
    const p = probabilityView({ value: null, scale: 'percent', definition: null, horizon: null, horizonClass: 'short', cutoff: null, uncertainty: null, evidence: 'derived', calibration: { state: 'unknown' } });
    expect(p.text).toBe('unknown');
    expect(p.problems).toEqual(['no probability is recorded', 'the probability has no definition (what it is the probability of)', 'the horizon is not stated', 'the cutoff is not stated']);
    expect(probabilityView({ ...base, value: 34.3, scale: 'percent', calibration: { state: 'unknown' } }).problems[0]).toMatch(/is not a probability \(outside 0–1\) — shown as recorded, not re-scaled/);
  });
});

describe('NUM-02 · confidence — a named class or an interval, never a bare number, never authority', () => {
  it('a calibrated class reads its words and definition; a calibrated interval its level', () => {
    expect(confidenceView({ class: 'moderate', calibrated: true })).toMatchObject({ text: 'moderate confidence', calibrated: true });
    expect(confidenceView({ interval: { lower: 0.62, upper: 0.78, level: 0.8 }, calibrated: true }).text).toBe('0.62–0.78 (80 % interval)');
  });
  it('an uncalibrated score reads "confidence not calibrated" — the score as what it is', () => {
    const c = confidenceView({ score: 0.91, calibrated: false, source: 'extraction model' });
    expect(c.text).toBe('confidence not calibrated — the extraction model reported a score of 0.91, which is not a probability');
    expect(c.note).toMatch(/never authority to act and never a guarantee/);
    expect(confidenceView({ calibrated: true, score: 0.9 }).problems).toEqual(['a calibrated confidence names its class or its interval']);
  });
  it('the class words carry no certainty or authority word (content-b81 CERTAINTY_WORDS)', () => {
    for (const c of CONFIDENCE_CLASSES) for (const w of CERTAINTY_WORDS) expect(`${c.label} ${c.definition}`.toLowerCase()).not.toMatch(new RegExp(`\\b${w}\\b`));
    for (const c of UNCERTAINTY_CLASSES) for (const w of CERTAINTY_WORDS) expect(c.words).not.toMatch(new RegExp(`\\b${w}\\b`));
  });
});

describe('NUM-03 · range and NUM-11 · estimate', () => {
  it('a range reads lower–upper with the unit and its basis; a gap is stated', () => {
    expect(rangeView({ lower: 12, upper: 19.5, unit: 'line-stop days', basis: { kind: 'scenario', text: 'Downside branch, p10–p90 of 5,000 paths' } }))
      .toMatchObject({ text: '12–19.5 line-stop days', basis: 'scenario: Downside branch, p10–p90 of 5,000 paths', problems: [] });
    expect(rangeView({ lower: 3, upper: 1, unit: null, basis: null }).problems).toEqual(['the lower bound is above the upper bound — shown as recorded', 'a range states its unit', 'a range states its method, confidence or scenario basis']);
  });
  it('an estimate is marked "~" or "Estimated" with its basis and revision state', () => {
    expect(estimateView({ value: 14.27, unit: 'days', mark: 'tilde', basis: 'twin v14 estimate', revision: { state: 'revised', version: 3 } }))
      .toMatchObject({ text: '~14 days', marker: '~', basis: 'twin v14 estimate', revision: 'revised (v3)', unsupportedPrecision: true });
    expect(estimateView({ value: 0.55, unit: null, mark: 'label', basis: null, revision: { state: 'unknown' } }))
      .toMatchObject({ text: 'Estimated 0.55', revision: 'revision state not recorded', problems: ['an estimate states its basis'] });
  });
});

describe('HX-03 / CNT-09 / REL-09 · the uncertainty statement', () => {
  it('a band: the plain-language class with the quantitative form, drivers, calibration, unsupported precision, alternatives and dissent', () => {
    const u = uncertaintyView({ form: 'band', magnitude: 'q10–q90 0.282–0.406', interval: { lower: 0.282, upper: 0.406, level: 0.8 }, drivers: ['the PortWatch chokepoint-4 series'],
      calibration: { state: 'uncalibrated', basis: 'unvalidated' }, unsupportedPrecision: ['q50 0.343 shown as 35 %'], alternatives: ['the Cape route steady state'], dissent: ['C. Brenner: the band is too narrow'] });
    expect(u.headline).toBe('moderate uncertainty — q10–q90 0.282–0.406');
    expect(u.lines.map((l) => l.term)).toEqual(['Form', 'Magnitude', 'In plain words', 'Drivers', 'Calibration', 'Unsupported precision', 'Alternatives', 'Dissent']);
    expect(u.lines[0]!.value).toBe('band (80 % level)');
    expect(u.problems).toEqual([]);
  });
  it('not quantified, abstained and partial are SAID with their reasons', () => {
    expect(uncertaintyView({ form: 'abstained', reason: 'the gateway abstained (below the confidence floor)' }).headline).toMatch(/^the source abstained — the gateway abstained/);
    expect(uncertaintyView({ form: 'partial', reason: '2 of 3 sources answered' }).headline).toMatch(/^a partial answer — 2 of 3 sources answered/);
    expect(uncertaintyView({ form: 'not_quantified' }).problems).toEqual(['a not quantified uncertainty states its reason']);
    expect(uncertaintyView({ form: 'interval' }).problems).toEqual(['a quantified uncertainty states its magnitude']);
  });
  it('the classes of spread', () => {
    expect(uncertaintyWords(95, 105)!.key).toBe('narrow'); expect(uncertaintyWords(0.282, 0.406)!.key).toBe('moderate');
    expect(uncertaintyWords(10, 40)!.key).toBe('wide'); expect(uncertaintyWords(1, 100)!.key).toBe('very_wide'); expect(uncertaintyWords(-1, 1)).toBeNull();
  });
});

/* ── THE toFixed RATCHET (NUM-09): raw `toFixed(` in the app's sources — §TS's pages carry none; every other file may only shrink ── */
const WEB = join(__dirname, '..');
/** The counts at B82 §TS (2026-10-19); each entry names the stage that next builds the page (Q15) — a count may only fall. */
const TOFIXED_BASELINE: Readonly<Record<string, { count: number; carrier: string }>> = {
  'app/admin/commercial/ledger/page.tsx': { count: 1, carrier: 'the stage that next builds the page; B111 sweeps the remainder' },
  'app/admin/governance/design/themes/themes-view.tsx': { count: 1, carrier: 'the stage that next builds the page; B111 sweeps the remainder' },
  'app/admin/governance/design/tokens/page.tsx': { count: 2, carrier: 'the stage that next builds the page; B111 sweeps the remainder' },
  'app/decisions/attention/evaluation-panel.tsx': { count: 1, carrier: 'B82 §SC (decisions/attention)' },
  'app/graph/entities/page.tsx': { count: 1, carrier: 'B83 (F-P7-E-13, the entity workspace)' },
  'app/graph/explore/page.tsx': { count: 1, carrier: 'B82 §GM (graph/explore)' },
  'app/intelligence/methods/page.tsx': { count: 2, carrier: 'B83 (F-P7-E-13)' },
  'app/intelligence/review/page.tsx': { count: 1, carrier: 'B83 (F-P7-E-13)' },
  'app/prediction/calibration/page.tsx': { count: 2, carrier: 'B82 §CF (prediction/calibration)' },
  'app/prediction/forecasts/[forecastId]/page.tsx': { count: 1, carrier: 'B82 §CF (prediction/forecasts)' },
  'app/prediction/forecasts/page.tsx': { count: 2, carrier: 'B82 §CF (prediction/forecasts)' },
  'app/prediction/signals/page.tsx': { count: 1, carrier: 'B83 (F-P7-E-14, the foresight workspaces)' },
};
/** §TS's own pages: zero, always. */
const TS_PAGES = ['app/admin/objects/page.tsx', 'app/observation/evidence/page.tsx', 'app/intelligence/claims/page.tsx', 'app/intelligence/contradictions/page.tsx',
  'app/prediction/warnings/page.tsx', 'app/prediction/warnings/[id]/page.tsx', 'app/decisions/recommendations/page.tsx', 'app/graph/resolutions/page.tsx', 'app/home/page.tsx'];
const walk = (dir: string): string[] => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : /\.tsx$/.test(n) ? [p] : []; });

describe('NUM-09 · the toFixed ratchet over the app', () => {
  const counts = new Map(walk(join(WEB, 'app')).map((p) => [relative(WEB, p).split('\\').join('/'), (readFileSync(p, 'utf8').match(/\.toFixed\(/g) ?? []).length] as const));
  it('§TS\'s pages format every number through the policy — no raw toFixed(', () => {
    for (const p of TS_PAGES) expect(counts.get(p), p).toBe(0);
  });
  it('no other file gains one; a listed file may only shrink', () => {
    const grown = [...counts].filter(([p, n]) => n > (TOFIXED_BASELINE[p]?.count ?? 0)).map(([p, n]) => `${p}: ${n} > ${TOFIXED_BASELINE[p]?.count ?? 0}`);
    expect(grown).toEqual([]);
  });
});
