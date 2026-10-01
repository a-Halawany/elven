/**
 * SIMULATION VALIDITY — CP-6 B31 part `validity` (migration 0099 §V; F-P5-09: FEX-13, L8-I05, PR-35-005, AI-28-005, V03-T-156/-353, OBJ-29;
 * the B31 pieces of F-P4-07 (V00-T-055, AI-49-002, V03-T-332) and F-P4-09 (ES-37-008, PR-33-005, AI-49-004)).
 *
 *   THE DECISION USE   every run reads decision | diagnostic | refused with its reasons (a partial or unpromoted result is DIAGNOSTIC, an
 *                      invalidated, failed or unfinished one REFUSED) — on this part's run read, comparison and package read.
 *   THE GATE           a domain's decision-use POLICY, set by a named human: while it requires a decision-grade result, a package version is
 *                      neither proposed nor committed when its recommended option cites a run that is not (the port's trigger).
 *   THE REACH          an invalidated run reaches the packages citing it (the option marked, refused at the next derivation); a corrected
 *                      twin version reaches the commitments and evaluation results resting on its runs, and their owners are tasked.
 *   THE BRANCH         bound to its baseline twin state, initial conditions, constraint set and the factors its assumptions move; a run on it
 *                      starts from that state; the sensitivity to its material assumptions is read against the run's factors.
 *   This service validates what a route hands in, in plain words, and summarises reads; the ports decide every rule.
 */
import { HttpException } from '@nestjs/common';
import { errorBody } from '@eye/contracts';

type Row = Record<string, unknown>;

export const DECISION_USES = ['decision', 'diagnostic', 'refused'] as const;
export type DecisionUse = (typeof DECISION_USES)[number];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const refuse = (correlationId: string, text: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, text), 422); };
const isObject = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, min: number, max: number): v is string => typeof v === 'string' && v.trim().length >= min && v.trim().length <= max;

export function assertUuid(v: unknown, what: string, correlationId: string, noun = 'run use'): string {
  if (typeof v !== 'string' || !UUID.test(v)) refuse(correlationId, `${noun} rejected (${what}): a uuid is required`);
  return v as string;
}

const optionalVersion = (v: unknown, noun: string, correlationId: string): number | null => {
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) refuse(correlationId, `${noun} rejected (expected_version): the version read is a positive integer`);
  return v as number;
};

export interface PolicyCommand { require: boolean; rationale: string; expectedVersion: number | null }
/** The policy's SHAPE: require (boolean), the rationale (16–2048), the version read (none for the first). */
export function validatePolicy(p: Row, correlationId: string): PolicyCommand {
  if (typeof p['require'] !== 'boolean') refuse(correlationId, 'run use rejected (require): the policy says whether a decision-grade result is required (require: true|false)');
  if (!text(p['rationale'], 16, 2048)) refuse(correlationId, 'run use rejected (rationale): the policy states why (16-2048 characters)');
  return { require: p['require'] as boolean, rationale: (p['rationale'] as string).trim(), expectedVersion: optionalVersion(p['expectedVersion'], 'run use', correlationId) };
}

export interface ReachCommand { twinId: string; version: number }
export function validateReach(p: Row, correlationId: string): ReachCommand {
  const twinId = assertUuid(p['twinId'], 'twin', correlationId);
  const v = p['version'];
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) refuse(correlationId, 'run use rejected (version): the twin version is a positive integer');
  return { twinId, version: v as number };
}

export interface BindingCommand { twinId: string; twinVersion: number; conditions: Row[]; constraintSetId: string | null; assumptionFactors: Row[]; rationale: string; expectedVersion: number | null }
/** The binding's SHAPE: the twin and its version, 1–50 initial conditions [{key, value?}], an optional constraint set, the assumption → factor
 *  map [{assumptionId, factorKey, note?}], the rationale (8–2048), the version read for a rebind. The port judges the rest. */
export function validateBinding(p: Row, correlationId: string): BindingCommand {
  const twinId = assertUuid(p['twinId'], 'twin', correlationId, 'branch binding');
  const tv = p['twinVersion'];
  if (typeof tv !== 'number' || !Number.isInteger(tv) || tv < 1) refuse(correlationId, 'branch binding rejected (twin_version): the twin version is a positive integer');
  const conds = p['initialConditions'];
  if (!Array.isArray(conds) || conds.length === 0 || conds.length > 50) refuse(correlationId, 'branch binding rejected (initial_conditions): a binding names 1 to 50 initial conditions [{key, value?}] of the bound state');
  const conditions = (conds as unknown[]).map((c, i) => {
    if (!isObject(c) || !text(c['key'], 1, 256)) refuse(correlationId, `branch binding rejected (initial_conditions): condition ${i + 1} names an element key`);
    const r = c as Row;
    return Object.prototype.hasOwnProperty.call(r, 'value') ? { key: (r['key'] as string).trim(), value: r['value'] } : { key: (r['key'] as string).trim() };
  });
  const cs = p['constraintSetId'] === undefined || p['constraintSetId'] === null ? null : assertUuid(p['constraintSetId'], 'constraint_set', correlationId, 'branch binding');
  const af = p['assumptionFactors'] ?? [];
  if (!Array.isArray(af) || af.length > 50) refuse(correlationId, 'branch binding rejected (assumption_factors): [{assumptionId, factorKey, note?}], at most 50');
  const assumptionFactors = (af as unknown[]).map((f, i) => {
    if (!isObject(f) || !text(f['factorKey'], 1, 128)) refuse(correlationId, `branch binding rejected (assumption_factors): entry ${i + 1} names an assumptionId and a factorKey`);
    const r = f as Row;
    return { assumption_id: assertUuid(r['assumptionId'], 'assumption_factors', correlationId, 'branch binding'), factor_key: (r['factorKey'] as string).trim(), note: typeof r['note'] === 'string' ? r['note'] : null };
  });
  if (!text(p['rationale'], 8, 2048)) refuse(correlationId, 'branch binding rejected (rationale): a binding states why the branch starts from this state (8-2048 characters)');
  return { twinId, twinVersion: tv as number, conditions, constraintSetId: cs, assumptionFactors, rationale: (p['rationale'] as string).trim(),
           expectedVersion: optionalVersion(p['expectedVersion'], 'branch binding', correlationId) };
}

export function validateRetirement(p: Row, correlationId: string): string {
  if (!text(p['reason'], 16, 2000)) refuse(correlationId, 'branch binding rejected (reason): a retirement states why the branch no longer starts from the bound state (16+ characters)');
  return (p['reason'] as string).trim();
}

export function validateRunIds(p: Row, correlationId: string): string[] {
  const ids = p['runIds'];
  if (!Array.isArray(ids) || ids.length < 1 || ids.length > 20) refuse(correlationId, 'run use rejected (run_ids): name 1 to 20 runs');
  const out = (ids as unknown[]).map((x) => assertUuid(x, 'run', correlationId));
  if (new Set(out).size !== out.length) refuse(correlationId, 'run use rejected (run_ids): a run is named once');
  return out;
}

/** A comparison's verdict over the runs' decision uses: a comparison rests on a decision only when EVERY run is decision-grade; a refused
 *  run is shown, never compared as current; the diagnostic ones are labelled. */
export function comparisonVerdict(uses: Array<{ run_id: string; use: DecisionUse; label?: string }>): { decision_grade: boolean; counts: Record<DecisionUse, number>; diagnostic: string[]; refused: string[]; label: string } {
  const counts: Record<DecisionUse, number> = { decision: 0, diagnostic: 0, refused: 0 };
  for (const u of uses) counts[u.use] += 1;
  const diagnostic = uses.filter((u) => u.use === 'diagnostic').map((u) => u.run_id);
  const refused = uses.filter((u) => u.use === 'refused').map((u) => u.run_id);
  const decisionGrade = uses.length > 0 && counts.decision === uses.length;
  const label = decisionGrade ? 'DECISION-GRADE comparison: every run is promoted and valid'
    : refused.length > 0 ? `NOT FOR DECISION: ${refused.length} run(s) refused (invalidated, failed or unfinished); ${diagnostic.length} diagnostic only`
    : `DIAGNOSTIC ONLY: ${diagnostic.length} of ${uses.length} run(s) are partial, unpromoted, challenged or rest on a suspended or failing scenario`;
  return { decision_grade: decisionGrade, counts, diagnostic, refused, label };
}
