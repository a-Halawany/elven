'use client';
/**
 * CP-6 B82 §TS — the catalogue's fixtures for components/truth.tsx (CMP-021, CMP-023, HX-02/03/11/15, NUM-01/02/03/11, TS-01…TS-10): the
 * truth-state label in EVERY display state (the nine stored, the three derived) with its definition on hover and focus, a correction and its
 * preserved original, an INDETERMINATE state with its reasons and an unread one; the uncertainty statement in each form; the probability on
 * both contract scales; the confidence classes and the uncalibrated score; a range; an estimate both ways; the AI notice with and without
 * its producer; the freshness watermark current, stale, partial and not verified. Every value is a SYNTHETIC fixture; nothing here calls a
 * server; nothing is a record or an approval. Construction evidence only (the walk reads these through the accessibility tree).
 */
import { Panel } from '../../../../../components/layers';
import {
  AiNotice, ConfidenceClass, EstimateValue, FreshnessWatermark, ProbabilityValue, RangeValue, TruthStateLabel, UncertaintyStatement,
} from '../../../../../components/truth';
import { DISPLAY_STATES, STORED_STATES, type DisplayTruthRead } from '../../../../../lib/truth-b82';
import { CONFIDENCE_CLASSES } from '../../../../../lib/numbers-b82';
import { LIBRARY_B82 } from '../../../../../lib/b82-seams';

/** The library exports this section renders (the catalogue's RENDERED set at the fold). */
export const TS_RENDERED: readonly string[] = LIBRARY_B82.truth.exports;
const ID = '01a0f7df-0000-7000-8000-00000000c0de';   // a SYNTHETIC fixture identifier
const truthOf = (display: DisplayTruthRead['display'], over: Partial<DisplayTruthRead> = {}): DisplayTruthRead => ({
  ref: `CLM:${ID}@2`, stored: (STORED_STATES as readonly string[]).includes(display) ? (display as DisplayTruthRead['stored']) : 'asserted', display,
  basis: (STORED_STATES as readonly string[]).includes(display) ? 'as stored' : `stored ASSERTED; shown ${display.toUpperCase()} (SYNTHETIC fixture)`, ruleVersion: 'b82-ts-display-1',
  reasons: [], constrainedUse: null, correctionOf: null, correctedBy: null, lifecycle: 'active', agentAuthored: false, ...over,
});
const PROJECTION = { revision: 42, verified_seq: 40, verified_at: '2026-10-19T08:00:00Z', verified_check_id: null, checkpoint_seq: 40, lag_events: 0, unresolved_deliveries: 0,
  subscription: { subscription_id: null, status: null }, partitions: [], condition: 'current' as const, degraded: false, code: null, label: null, withdrawn: [], domain_withdrawn: [] };

export function TsCatalogue() {
  return (
    <>
      <Panel title="Truth-state label — every display state (CMP-021, TS-01…TS-10)">
        <p className="eye-dt-counts">SYNTHETIC fixtures. Each label wraps the truth badge (the symbol set) and gives the state&apos;s definition on hover and keyboard focus.</p>
        <ul aria-label="Every display truth state">
          {DISPLAY_STATES.map((s) => (
            <li key={s} data-state={s}>
              <TruthStateLabel detail="full" truth={truthOf(s, s === 'indeterminate'
                ? { reasons: [{ code: 'contradiction', detail: 'contradiction 01a0…c0de is open — contradicted by another claim (SYNTHETIC)', ref: null }], constrainedUse: 'not for a decision-active use until resolved' }
                : s === 'recommended' ? { constrainedUse: 'advisory, not a decision' } : s === 'corrected' ? { correctionOf: `CLM:${ID}@1` } : {})} />
            </li>
          ))}
        </ul>
      </Panel>
      <Panel title="Truth-state label — a correction, its original, an unread read (TS-08)">
        <p><TruthStateLabel truth={truthOf('extracted', { ref: `CLM:${ID}@1`, correctedBy: `CLM:${ID}@2`, constrainedUse: 'superseded by correction v2 — the preserved original' })} /></p>
        <p><TruthStateLabel truth={{ stored: 'asserted', unread: 'HTTP 403 EYE_AUT_001 — no qualifying role binding (SYNTHETIC)' }} /></p>
      </Panel>
      <Panel title="Uncertainty statement (HX-03, CNT-09)">
        <UncertaintyStatement uncertainty={{ form: 'band', magnitude: 'q10–q90 0.282–0.406 (SYNTHETIC)', interval: { lower: 0.282, upper: 0.406, level: 0.8 },
          drivers: ['the chokepoint transit series (SYNTHETIC)'], calibration: { state: 'uncalibrated', basis: 'unvalidated' }, unsupportedPrecision: ['q50 0.343 shown as 35 %'],
          alternatives: ['the Cape route steady state'], dissent: ['a named reviewer: the band is too narrow (SYNTHETIC)'] }} />
        <UncertaintyStatement uncertainty={{ form: 'abstained', reason: 'the gateway abstained below its confidence floor (SYNTHETIC)' }} />
        <UncertaintyStatement uncertainty={{ form: 'not_quantified', reason: 'no interval is recorded for this estimate (SYNTHETIC)' }} />
      </Panel>
      <Panel title="Probability (NUM-01) — both contract scales">
        <p><ProbabilityValue probability={{ value: 0.343, scale: 'percent', definition: 'a transit delay above 48 h (SYNTHETIC)', calibration: { state: 'uncalibrated', basis: 'no backtest recorded' },
          horizon: '30 days', horizonClass: 'short', cutoff: '2026-10-18T00:00:00Z', uncertainty: 'q10–q90 28–41 %', evidence: 'uncalibrated_model' }} /></p>
        <p><ProbabilityValue detail="compact" probability={{ value: 0.62, scale: 'unit', definition: 'the line keeps running through Q1 (SYNTHETIC)', calibration: { state: 'calibrated', basis: 'rolling backtest' },
          horizon: '90 days', horizonClass: 'short', cutoff: null, uncertainty: null, evidence: 'calibrated_model' }} /></p>
      </Panel>
      <Panel title="Confidence (NUM-02), range (NUM-03), estimate (NUM-11)">
        <ul aria-label="Confidence classes">{CONFIDENCE_CLASSES.map((c) => <li key={c.key}><ConfidenceClass confidence={{ class: c.key, calibrated: true }} /></li>)}</ul>
        <p><ConfidenceClass confidence={{ score: 0.91, calibrated: false, source: 'extraction model' }} /></p>
        <p><RangeValue range={{ lower: 12, upper: 19.5, unit: 'line-stop days', basis: { kind: 'scenario', text: 'Downside branch, p10–p90 (SYNTHETIC)' } }} /></p>
        <p><EstimateValue estimate={{ value: 14.27, unit: 'days', mark: 'tilde', basis: 'a twin estimate (SYNTHETIC)', revision: { state: 'revised', version: 3 } }} /></p>
        <p><EstimateValue estimate={{ value: 0.55, unit: null, mark: 'label', basis: 'an elicited band (SYNTHETIC)', revision: { state: 'initial' } }} /></p>
      </Panel>
      <Panel title="AI notice (HX-11, CNT-08)">
        <AiNotice output="recommended" producer={{ kind: 'agent', name: 'Decision Agent', version: '1.0.0 (SYNTHETIC)' }} />
        <AiNotice output="synthetic" producer={null} />
      </Panel>
      <Panel title="Freshness watermark (CMP-023, HX-15)">
        <FreshnessWatermark label="Freshness fixture: current" freshness={{ cutoff: '2026-10-18T00:00:00Z', asOf: '2026-10-19T09:00:00Z', sources: [{ label: 'Source chokepoints (SYNTHETIC)', state: 'healthy', lastSeen: '2026-10-18T06:00:00Z' }], projection: PROJECTION }} />
        <FreshnessWatermark label="Freshness fixture: stale" freshness={{ cutoff: null, asOf: '2026-10-19T09:00:00Z', sources: [{ label: 'Source ais-positions (SYNTHETIC)', state: 'stale', lastSeen: null }] }} />
        <FreshnessWatermark label="Freshness fixture: partial" freshness={{ cutoff: '2026-10-18T00:00:00Z', asOf: '2026-10-19T09:00:00Z', projection: { ...PROJECTION, condition: 'lagging', lag_events: 3 } as never, missingIntervals: [{ from: '2026-10-01', to: '2026-10-03' }] }} />
        <FreshnessWatermark label="Freshness fixture: not verified" freshness={{ cutoff: '2026-10-18T00:00:00Z', asOf: '2026-10-19T09:00:00Z', live: true, sourcesNote: 'not read (SYNTHETIC fixture)' }} />
      </Panel>
    </>
  );
}
