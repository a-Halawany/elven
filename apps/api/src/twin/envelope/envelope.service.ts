/**
 * THE ENVELOPE — CP-6 B30 part `envelope` (migration 0103 §EN; F-P5-04: V00-T-061, V02-T-054/-125, L5-C03/-C08, L5-I05, V03-T-116/-117/-120,
 * ES-35-007/-008/-009, V04-T-027/-028, AI-28-004, AI-C028, PR-36-005, R-08).
 *
 *   DISABLED OUTSIDE   a run whose own contract lies outside its model's operating envelope is REFUSED for decision use (outside_envelope);
 *                      only a twin owner (never the domain administrator) admits it as EXPLORATORY, and it stays refused, `exploratory: true`.
 *   THE RAISED BAR     the acknowledgement at opening is a twin owner's only; a promotion of an outside-envelope run waits for a method
 *                      steward's CONCURRENCE (a second named human, neither the admitter nor the operator).
 *   CALIBRATION        a model on a twin, per key: predicted against LATER observed (reconciliations, observed elements, control runs' own
 *                      quantities), MAE / MAPE / bias over n, the drift state against a declared tolerance — the model-fitness indicators.
 *   STEWARDSHIP        a behaviour model's lifecycle per domain (proposed → approved → deprecated → retired), compatibility per twin kind;
 *                      a run on a retired or incompatible model is refused, a deprecated one marked.
 *   AI CONTEXT         the envelope, the stale variables, the sensitivity and the fitness, exposed to AI consumers of twin state.
 *   This service validates what a route hands in, in plain words; the ports decide every rule.
 */
import { HttpException } from '@nestjs/common';
import { errorBody } from '@eye/contracts';

type Row = Record<string, unknown>;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MODEL_REF = /^[a-z0-9-]+@[0-9]+$/;
const ELEMENT_KEY = /^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$/;
const KIND = /^[a-z][a-z0-9-]{1,63}$/;
export const LIFECYCLE_STATES = ['proposed', 'approved', 'deprecated', 'retired'] as const;
export type LifecycleState = (typeof LIFECYCLE_STATES)[number];

const refuse = (correlationId: string, text: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, text), 422); };
const text = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;

export function assertUuid(v: unknown, what: string, correlationId: string, noun = 'exploratory admission'): string {
  if (typeof v !== 'string' || !UUID.test(v)) refuse(correlationId, `${noun} rejected (${what}): a uuid is required`);
  return v as string;
}
const modelRef = (v: unknown, noun: string, correlationId: string): string => {
  if (typeof v !== 'string' || !MODEL_REF.test(v)) refuse(correlationId, `${noun} rejected (model): a behaviour model reference is name@version`);
  return v as string;
};

/** An admission's reason (8–2048). */
export function validateAdmission(p: Row, correlationId: string): { reason: string } {
  if (!text(p['reason'], 8, 2048)) refuse(correlationId, 'exploratory admission rejected (reason): an admission states its reason (8-2048 characters)');
  return { reason: (p['reason'] as string).trim() };
}
/** A concurrence's note (8–2048). */
export function validateConcurrence(p: Row, correlationId: string): { note: string } {
  if (!text(p['note'], 8, 2048)) refuse(correlationId, 'exploratory admission rejected (note): a concurrence states its note (8-2048 characters)');
  return { note: (p['note'] as string).trim() };
}

export interface CalibrationCommand { twinId: string; modelRef: string; key: string; tolerance: Row }
/**
 * A calibration's SHAPE: the twin, the model, the element key, the tolerance — exactly one of `mape` (a fraction, 0 < x ≤ 10) or `mae`
 * (> 0), optionally `minN` (an integer 2..1000). The port judges the model's binding and computes every number.
 */
export function validateCalibration(p: Row, correlationId: string): CalibrationCommand {
  const twinId = assertUuid(p['twinId'], 'twin', correlationId, 'calibration');
  const ref = modelRef(p['modelRef'], 'calibration', correlationId);
  if (typeof p['key'] !== 'string' || !ELEMENT_KEY.test(p['key'])) refuse(correlationId, 'calibration rejected (key): the key is a twin element key (e.g. outcome.line_stop_days:SYN-LINE-A1)');
  const t = p['tolerance'];
  if (t === null || typeof t !== 'object' || Array.isArray(t)) refuse(correlationId, 'calibration rejected (tolerance): a tolerance declares exactly one of mape or mae, and optionally minN');
  const tol = t as Row;
  const hasMape = tol['mape'] !== undefined; const hasMae = tol['mae'] !== undefined;
  if (hasMape === hasMae) refuse(correlationId, 'calibration rejected (tolerance): a tolerance declares exactly one of mape or mae, and optionally minN');
  const extra = Object.keys(tol).filter((k) => !['mape', 'mae', 'minN'].includes(k));
  if (extra.length > 0) refuse(correlationId, `calibration rejected (tolerance): unknown tolerance field(s) ${extra.join(', ')}`);
  const metric = hasMape ? 'mape' : 'mae';
  const v = tol[metric];
  if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || (metric === 'mape' && v > 10)) {
    refuse(correlationId, `calibration rejected (tolerance): the ${metric} tolerance is a positive number${metric === 'mape' ? ' no greater than 10 (a fraction: 0.2 is 20 %)' : ''}`);
  }
  const out: Row = { [metric]: v };
  if (tol['minN'] !== undefined) {
    const n = tol['minN'];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 2 || n > 1000) refuse(correlationId, 'calibration rejected (tolerance): minN is an integer from 2 to 1000');
    out['min_n'] = n;
  }
  return { twinId, modelRef: ref, key: p['key'] as string, tolerance: out };
}

export interface ModelStateCommand { modelRef: string; state: LifecycleState; reason: string }
export function validateModelState(p: Row, correlationId: string): ModelStateCommand {
  const ref = modelRef(p['modelRef'], 'behaviour model', correlationId);
  if (typeof p['state'] !== 'string' || !(LIFECYCLE_STATES as readonly string[]).includes(p['state'])) {
    refuse(correlationId, 'behaviour model rejected (lifecycle_state): a state is proposed, approved, deprecated or retired');
  }
  if (!text(p['reason'], 8, 2048)) refuse(correlationId, 'behaviour model rejected (reason): a lifecycle change states its reason (8-2048 characters)');
  return { modelRef: ref, state: p['state'] as LifecycleState, reason: (p['reason'] as string).trim() };
}

export interface CompatibilityCommand { modelRef: string; kind: string; compatible: boolean; note: string }
export function validateCompatibility(p: Row, correlationId: string): CompatibilityCommand {
  const ref = modelRef(p['modelRef'], 'behaviour model', correlationId);
  if (typeof p['kind'] !== 'string' || !KIND.test(p['kind'])) refuse(correlationId, 'behaviour model rejected (kind): a twin kind is named (e.g. supply-chain)');
  if (typeof p['compatible'] !== 'boolean') refuse(correlationId, 'behaviour model rejected (compatible): a declaration says compatible true or false');
  if (!text(p['note'], 8, 2048)) refuse(correlationId, 'behaviour model rejected (note): a compatibility declaration states its note (8-2048 characters)');
  return { modelRef: ref, kind: p['kind'] as string, compatible: p['compatible'] as boolean, note: (p['note'] as string).trim() };
}

export interface ContextCommand { twinId: string; version: number | null }
export function validateContext(p: Row, correlationId: string): ContextCommand {
  const twinId = assertUuid(p['twinId'], 'twin', correlationId, 'twin context');
  const v = p['version'];
  if (v !== undefined && v !== null && (typeof v !== 'number' || !Number.isInteger(v) || v < 1)) refuse(correlationId, 'twin context rejected (version): the version is a positive integer');
  return { twinId, version: (v as number | null | undefined) ?? null };
}

/** The drift state a calibration's numbers read under its tolerance — the port's rule, restated for the unit test and the page's words. */
export function driftOf(m: { n: number; mae: number | null; mape: number | null; nonZeroObserved?: number }, tol: { mape?: number; mae?: number; min_n?: number }): 'stable' | 'drifting' | 'insufficient' {
  const minN = tol.min_n ?? 3;
  if (m.n < minN) return 'insufficient';
  if (tol.mape !== undefined) {
    if (m.mape === null || (m.nonZeroObserved ?? m.n) < minN) return 'insufficient';
    return m.mape > tol.mape ? 'drifting' : 'stable';
  }
  return m.mae !== null && m.mae > (tol.mae ?? Infinity) ? 'drifting' : 'stable';
}
