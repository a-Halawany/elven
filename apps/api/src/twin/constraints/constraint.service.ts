/**
 * CP-6 B29 §D (0092) — THE CONSTRAINT ENGINE: the declared sets, the evaluator and the ConstraintGate (../methods/types.ts) the method
 * runtime (§C) calls at run opening and completion (F-P5-05 clause 3).
 *
 * DECLARATION: a constraint STEWARD declares a set (a key unique in the domain, a title, the constraints — topology, conservation,
 * business rules — validated and normalised by evaluator.ts before the port, which digests them) and versions or retires it; the set's
 * own steward (or a domain administrator) does — another steward is refused at the port. Versions are immutable.
 *
 * SATISFACTION: `checkWith(cap, …)` loads the CURRENT version of the named sets (every LIVE set of the domain when none is named),
 * evaluates the subject, and records a PLAN's check in simulation.plan_checks — the subject as checked, the set versions PINNED (id,
 * key, version, digest), the outcome and every violation. That record is the only side effect. Two callers:
 *   · the PLAN CHECK route (simulation.plan.check, a person, inside the pipeline's write — the capability is the route's);
 *   · THE GATE, `check(scope, subject, setKeys?)` — the frozen interface §C calls OUTSIDE any write with a scope and no principal: it
 *     opens its own transaction on the commit pool and mints the DOMAIN-scoped machine capability bound to simulation.constraint.gate
 *     (0092 §D.4) — its READ PATH to the domain's sets under their row security. A run's inputs and outputs are NOT recorded here (§C
 *     records the verdict on the run, simulation.run_constraint_checks — the integrator's rule of 2026-09-29); a plan handed to the gate
 *     is (checked_by NULL). A failure of the engine answers INDETERMINATE with the reason (never a pass, never a throw into §C's opening).
 * NOTHING DECLARED: checking every live set of a domain that declares nothing for the subject is VACUOUSLY satisfied (setId null — an
 * ordinary run in a domain without constraints is not held); checking NAMED sets of which none applies, or one that is unknown or
 * retired, is indeterminate.
 * A check is REPRODUCIBLE: `reproduce(cap, checkId)` re-evaluates the recorded subject against the pinned versions (never the current
 * ones), so a set re-versioned since does not change what the check said.
 */
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { COMMIT_DB } from '../../shared/shared.module.js';
import type { Db } from '../../shared/db.js';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { ConstraintGate, ConstraintSubject, ConstraintVerdict } from '../methods/types.js';
import { ConstraintCapability, type CheckWrites, type ConstraintReads, type SetWrites } from './constraint.capabilities.js';
import { evaluate, toVerdict, validateConstraints, type Constraint, type Evaluation, type SetVersion } from './evaluator.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SET_KEY = /^[a-z][a-z0-9-]{2,60}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const REF = /^[A-Za-z0-9][A-Za-z0-9_.:/ -]{0,199}$/;
const MAX_QUANTITIES = 20_000;
const MAX_EDGES = 20_000;

/** The engine's time budget per check (ms). The route may TIGHTEN it (budgetMs ≤ this), never loosen it. */
export const DEFAULT_BUDGET_MS = (() => {
  const v = Number(process.env['EYE_CONSTRAINT_BUDGET_MS']);
  return Number.isInteger(v) && v >= 1 && v <= 30_000 ? v : 2000;
})();

export interface SetIntake { setKey: string; title: string; steward: string | null; constraints: Constraint[]; note: string }
export interface VersionIntake { expectedVersion: number; constraints: Constraint[]; note: string }
export interface PlanIntake { subject: ConstraintSubject; setKeys: string[] | undefined; budgetMs: number }
export type EngineVerdict = ConstraintVerdict & { checkId: string | null };

const bad = (correlationId: string) => (msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };

function constraintsOf(raw: unknown, correlationId: string): Constraint[] {
  const v = validateConstraints(raw);
  if (v.problems.length > 0) bad(correlationId)(`constraints refused: ${v.problems.slice(0, 8).join('; ')}`.slice(0, 2000));
  return v.constraints;
}
function note(m: Record<string, unknown>, correlationId: string): string {
  if (typeof m['note'] !== 'string' || m['note'].trim().length < 3 || m['note'].length > 2000) bad(correlationId)('note must say why this version is declared (3–2000 characters)');
  return (m['note'] as string).trim();
}
function setKeysOf(v: unknown, correlationId: string): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.length === 0 || v.length > 50 || !v.every((k) => typeof k === 'string' && SET_KEY.test(k))) bad(correlationId)('setKeys must list 1–50 set keys (omit it to check every live set)');
  return [...new Set(v as string[])].sort();
}

export function validateSetIntake(m: Record<string, unknown>, correlationId: string): SetIntake {
  const no = bad(correlationId);
  if (typeof m['setKey'] !== 'string' || !SET_KEY.test(m['setKey'])) no('setKey must be 3–61 lower-case letters, digits and dashes, starting with a letter');
  if (typeof m['title'] !== 'string' || m['title'].trim().length < 3 || m['title'].length > 200) no('title must be 3–200 characters');
  const steward = m['steward'] ?? null;
  if (steward !== null && (typeof steward !== 'string' || !UUID.test(steward))) no('steward must be a principal id (omit it to steward the set yourself)');
  return { setKey: m['setKey'] as string, title: (m['title'] as string).trim(), steward: steward as string | null, constraints: constraintsOf(m['constraints'], correlationId), note: note(m, correlationId) };
}
export function validateVersionIntake(m: Record<string, unknown>, correlationId: string): VersionIntake {
  if (!Number.isInteger(m['expectedVersion']) || (m['expectedVersion'] as number) < 1) bad(correlationId)('expectedVersion must name the version this one follows (the set\'s current version)');
  return { expectedVersion: m['expectedVersion'] as number, constraints: constraintsOf(m['constraints'], correlationId), note: note(m, correlationId) };
}
export function validateReason(m: Record<string, unknown>, correlationId: string): string {
  if (typeof m['reason'] !== 'string' || m['reason'].trim().length < 8 || m['reason'].length > 2000) bad(correlationId)('reason must say why (8–2000 characters)');
  return (m['reason'] as string).trim();
}

/** A PLAN: quantities per key per day, each in a stated unit (+ edges for the topology rules). */
export function validatePlanIntake(m: Record<string, unknown>, correlationId: string): PlanIntake {
  const no = bad(correlationId);
  const ref = m['planKey'];
  if (typeof ref !== 'string' || !REF.test(ref)) no('planKey must name the plan (1–200 characters)');
  const qs = m['quantities'];
  if (!Array.isArray(qs) || qs.length === 0 || qs.length > MAX_QUANTITIES) no(`quantities must list 1–${MAX_QUANTITIES} { key, date, value, unit }`);
  const quantities: ConstraintSubject['quantities'] = [];
  (qs as unknown[]).forEach((q, i) => {
    const r = q as Record<string, unknown>;
    if (typeof r !== 'object' || r === null || typeof r['key'] !== 'string' || r['key'].length < 1 || r['key'].length > 160) no(`quantities[${i}].key must name the quantity`);
    if (typeof r['date'] !== 'string' || !DAY.test(r['date']) || Number.isNaN(Date.parse(`${r['date']}T00:00:00Z`))) no(`quantities[${i}].date must be a day (YYYY-MM-DD) — a plan is quantities per key per day`);
    if (typeof r['value'] !== 'number' || !Number.isFinite(r['value'])) no(`quantities[${i}].value must be a number`);
    if (typeof r['unit'] !== 'string' || r['unit'].trim() === '' || r['unit'].length > 40) no(`quantities[${i}].unit must be stated — a plan states its units`);
    quantities.push({ key: r['key'] as string, date: r['date'] as string, value: r['value'] as number, unit: r['unit'] as string });
  });
  let edges: ConstraintSubject['edges'];
  if (m['edges'] !== undefined) {
    const es = m['edges'];
    if (!Array.isArray(es) || es.length > MAX_EDGES) no(`edges must list at most ${MAX_EDGES} { from, to, kind }`);
    edges = (es as unknown[]).map((e, i) => {
      const r = e as Record<string, unknown>;
      if (typeof r !== 'object' || r === null || typeof r['from'] !== 'string' || typeof r['to'] !== 'string' || r['from'] === '' || r['to'] === '') no(`edges[${i}] must be { from, to, kind }`);
      return { from: r['from'] as string, to: r['to'] as string, kind: typeof r['kind'] === 'string' ? r['kind'] : 'route' };
    });
  }
  const b = m['budgetMs'];
  if (b !== undefined && (!Number.isInteger(b) || (b as number) < 0 || (b as number) > DEFAULT_BUDGET_MS)) no(`budgetMs may tighten the engine's budget (0–${DEFAULT_BUDGET_MS} ms), never loosen it`);
  return { subject: { kind: 'plan', ref: ref as string, quantities, ...(edges === undefined ? {} : { edges }) }, setKeys: setKeysOf(m['setKeys'], correlationId), budgetMs: (b as number | undefined) ?? DEFAULT_BUDGET_MS };
}

/** The gate's defensive reading of a subject §C built: what is malformed is left out, and a subject that is not one answers null. */
function sanitize(s: ConstraintSubject): ConstraintSubject | null {
  if (s === null || typeof s !== 'object' || !['plan', 'run_input', 'run_output'].includes(s.kind) || typeof s.ref !== 'string' || s.ref.length < 1 || s.ref.length > 200 || !Array.isArray(s.quantities)) return null;
  const quantities = s.quantities.filter((q) => q !== null && typeof q === 'object' && typeof q.key === 'string' && typeof q.value === 'number' && Number.isFinite(q.value))
    .slice(0, MAX_QUANTITIES).map((q) => ({ key: q.key, date: typeof q.date === 'string' ? q.date : null, value: q.value, unit: typeof q.unit === 'string' ? q.unit : null }));
  const edges = Array.isArray(s.edges) ? s.edges.filter((e) => e !== null && typeof e === 'object' && typeof e.from === 'string' && typeof e.to === 'string')
    .slice(0, MAX_EDGES).map((e) => ({ from: e.from, to: e.to, kind: typeof e.kind === 'string' ? e.kind : 'route' })) : undefined;
  return { kind: s.kind, ref: s.ref, quantities, ...(edges === undefined ? {} : { edges }) };
}

/** A value's text with its object keys sorted — jsonb reorders keys, so a record and a re-derivation are compared in this form. */
function canon(v: unknown): string {
  const norm = (x: unknown): unknown => Array.isArray(x) ? x.map(norm)
    : x !== null && typeof x === 'object' ? Object.fromEntries(Object.keys(x as Row).sort().map((k) => [k, norm((x as Row)[k])])) : x;
  return JSON.stringify(norm(v));
}

function setVersionOf(set: Row, version: Row): SetVersion | string {
  const v = validateConstraints(version['constraints']);
  if (v.problems.length > 0) return `set ${String(set['set_key'])} v${String(version['version'])} no longer validates (${v.problems[0]})`;
  return { setId: String(set['set_id']), setKey: String(set['set_key']), version: Number(version['version']), digest: String(version['digest']), constraints: v.constraints };
}

@Injectable()
export class ConstraintService implements ConstraintGate {
  constructor(@Inject(COMMIT_DB) private readonly commitDb: Db) {}

  // ── the gate ────────────────────────────────────────────────────────────────────
  /** §C's gate (frozen interface): its own transaction, the machine capability, the check recorded; a failure is INDETERMINATE. */
  async check(scope: { tenantId: string; domainId: string }, subject: ConstraintSubject, setKeys?: string[]): Promise<EngineVerdict> {
    const indeterminate = (reason: string): EngineVerdict => ({ outcome: 'indeterminate', setId: null, setVersion: null, violations: [], indeterminateReason: reason, checkId: null });
    const s = sanitize(subject);
    if (s === null) return indeterminate('the subject is malformed (a plan, run_input or run_output with a ref and a list of quantities)');
    if (typeof scope?.tenantId !== 'string' || !UUID.test(scope.tenantId) || typeof scope.domainId !== 'string' || !UUID.test(scope.domainId)) return indeterminate('the gate needs a tenant and a domain');
    const keys = setKeys === undefined ? undefined : [...new Set(setKeys.filter((k) => typeof k === 'string' && SET_KEY.test(k)))].sort();
    try {
      return await this.commitDb.transaction().execute(async (tx) => {
        const cap = await ConstraintCapability.gate(tx, scope, `constraint gate: ${s.kind} ${s.ref}`.slice(0, 200));
        const r = await this.checkWith(cap, scope, s, { setKeys: keys, budgetMs: DEFAULT_BUDGET_MS, actor: null, correlationId: newId(), record: s.kind === 'plan' });
        return { ...r.verdict, checkId: r.record === null ? null : String(r.record['check_id']) };
      });
    } catch (e) {
      return indeterminate(`the constraint engine failed: ${e instanceof Error ? e.message : String(e)}`.slice(0, 500));
    }
  }

  /** The CURRENT versions of the named sets, or of every live set — and why any named set cannot be checked (never silently skipped). */
  async currentSets(cap: ConstraintReads, setKeys: string[] | undefined): Promise<{ sets: SetVersion[]; missing: string[] }> {
    let q = cap.readSets().selectAll();
    q = setKeys === undefined ? q.where('state', '=', 'live') : q.where('set_key', 'in', setKeys);
    const rows = (await q.orderBy('set_key').execute()) as Row[];
    const missing: string[] = [];
    for (const k of setKeys ?? []) {
      const r = rows.find((x) => x['set_key'] === k);
      if (r === undefined) missing.push(`set ${k} is not declared in this domain`);
      else if (r['state'] === 'retired') missing.push(`set ${k} is retired`);
    }
    const live = rows.filter((r) => r['state'] === 'live');
    if (live.length === 0) return { sets: [], missing };
    const versions = (await cap.readVersions().selectAll().where('set_id', 'in', live.map((r) => r['set_id'])).execute()) as Row[];
    const sets: SetVersion[] = [];
    for (const r of live) {
      const v = versions.find((x) => x['set_id'] === r['set_id'] && Number(x['version']) === Number(r['current_version']));
      if (v === undefined) { missing.push(`set ${String(r['set_key'])} has no current version visible`); continue; }
      const sv = setVersionOf(r, v);
      if (typeof sv === 'string') missing.push(sv); else sets.push(sv);
    }
    return { sets, missing };
  }

  /** Evaluate and (for a plan) record — the record is the only side effect. A named set that cannot be checked makes a pass indeterminate. */
  async checkWith(cap: CheckWrites, scope: { tenantId: string; domainId: string }, subject: ConstraintSubject,
                  o: { setKeys: string[] | undefined; budgetMs: number; actor: string | null; correlationId: string; record: boolean }): Promise<{ evaluation: Evaluation; verdict: ConstraintVerdict; record: Row | null }> {
    const { sets, missing } = await this.currentSets(cap, o.setKeys);
    const evaluation = evaluate(subject, sets, { budgetMs: o.budgetMs, vacuousWhenUndeclared: o.setKeys === undefined });
    if (missing.length > 0) {
      evaluation.indeterminate.unshift(...missing);
      if (evaluation.outcome === 'satisfied') evaluation.outcome = 'indeterminate';
    }
    const verdict = toVerdict(evaluation);
    if (!o.record) return { evaluation, verdict, record: null };
    const record = await cap.recordCheck({
      checkId: newId(), tenantId: scope.tenantId, domainId: scope.domainId, subjectKind: subject.kind, subjectRef: subject.ref,
      subject: { quantities: subject.quantities, ...(subject.edges === undefined ? {} : { edges: subject.edges }), ...(o.setKeys === undefined ? {} : { set_keys: o.setKeys }) },
      sets: evaluation.pins, outcome: evaluation.outcome, violations: evaluation.violations,
      reason: evaluation.outcome === 'indeterminate' ? evaluation.indeterminate.join('; ').slice(0, 2000) : null,
      budgetMs: o.budgetMs, elapsedMs: evaluation.elapsedMs, actor: o.actor, correlationId: o.correlationId,
    });
    return { evaluation, verdict, record };
  }

  // ── the plan check (the route) ──────────────────────────────────────────────────
  async checkPlan(cap: CheckWrites, scope: ScopeContext, intake: PlanIntake, actor: string, correlationId: string) {
    const r = await this.checkWith(cap, { tenantId: scope.tenantId as string, domainId: scope.domainId as string }, intake.subject,
      { setKeys: intake.setKeys, budgetMs: intake.budgetMs, actor, correlationId, record: true });
    return { check: r.record as Row, verdict: r.verdict };
  }

  // ── declaration ─────────────────────────────────────────────────────────────────
  async declare(cap: SetWrites, scope: ScopeContext, intake: SetIntake, actor: string, correlationId: string, setId: string) {
    return cap.declareSet({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor, eventId: newId(), correlationId,
      setId, setKey: intake.setKey, title: intake.title, steward: intake.steward, constraints: intake.constraints, note: intake.note });
  }
  async version(cap: SetWrites, scope: ScopeContext, setId: string, intake: VersionIntake, actor: string, correlationId: string) {
    return cap.versionSet({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor, eventId: newId(), correlationId,
      setId, expectedVersion: intake.expectedVersion, constraints: intake.constraints, note: intake.note });
  }
  async retire(cap: SetWrites, scope: ScopeContext, setId: string, reason: string, actor: string, correlationId: string) {
    return cap.retireSet({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor, eventId: newId(), correlationId, setId, reason });
  }

  // ── reads ───────────────────────────────────────────────────────────────────────
  async listSets(cap: ConstraintReads, state: 'live' | 'retired' | null) {
    let q = cap.readSets().selectAll();
    if (state !== null) q = q.where('state', '=', state);
    const sets = (await q.orderBy('set_key').execute()) as Row[];
    if (sets.length === 0) return [];
    const versions = (await cap.readVersions().selectAll().where('set_id', 'in', sets.map((s) => s['set_id'])).execute()) as Row[];
    return sets.map((s) => {
      const v = versions.find((x) => x['set_id'] === s['set_id'] && Number(x['version']) === Number(s['current_version']));
      return { ...s, current: v === undefined ? null : { version: v['version'], digest: v['digest'], constraints: v['constraints'], note: v['note'], declared_by: v['declared_by'], declared_at: v['declared_at'] } };
    });
  }
  async getSet(cap: ConstraintReads, setId: string): Promise<Row | null> {
    const s = (await cap.readSets().selectAll().where('set_id', '=', setId).executeTakeFirst()) as Row | undefined;
    if (s === undefined) return null;
    const versions = (await cap.readVersions().selectAll().where('set_id', '=', setId).orderBy('version', 'desc').execute()) as Row[];
    const events = (await cap.readEvents().selectAll().where('set_id', '=', setId).orderBy('occurred_at').execute()) as Row[];
    return { ...s, versions, events };
  }
  async listChecks(cap: ConstraintReads, f: { subjectKind: string | null; subjectRef: string | null; outcome: string | null; limit: number }) {
    let q = cap.readChecks().select(['check_id', 'subject_kind', 'subject_ref', 'subject_digest', 'sets', 'outcome', 'violations', 'indeterminate_reason', 'budget_ms', 'elapsed_ms', 'checked_via', 'checked_by', 'checked_at']);
    if (f.subjectKind !== null) q = q.where('subject_kind', '=', f.subjectKind);
    if (f.subjectRef !== null) q = q.where('subject_ref', '=', f.subjectRef);
    if (f.outcome !== null) q = q.where('outcome', '=', f.outcome);
    return (await q.orderBy('checked_at', 'desc').limit(f.limit).execute()) as Row[];
  }
  async getCheck(cap: ConstraintReads, checkId: string): Promise<Row | null> {
    return ((await cap.readChecks().selectAll().where('check_id', '=', checkId).executeTakeFirst()) as Row | undefined) ?? null;
  }

  /**
   * REPRODUCE a recorded check: its subject re-evaluated against the set versions it PINNED (their digests verified), never the current
   * ones — under the engine's full budget (a check that ran out of budget is re-derived in full and says so). Nothing is written.
   */
  async reproduce(cap: ConstraintReads, checkId: string): Promise<Row | null> {
    const c = await this.getCheck(cap, checkId);
    if (c === null) return null;
    const pins = c['sets'] as Array<{ set_id: string; set_key: string; version: number; digest: string }>;
    const ids = [...new Set(pins.map((p) => p.set_id))];
    const setRows: Row[] = ids.length === 0 ? [] : (await cap.readSets().selectAll().where('set_id', 'in', ids).execute()) as Row[];
    const versionRows: Row[] = ids.length === 0 ? [] : (await cap.readVersions().selectAll().where('set_id', 'in', ids).execute()) as Row[];
    const sets: SetVersion[] = [];
    for (const p of pins) {
      const s = setRows.find((x) => x['set_id'] === p.set_id);
      const v = versionRows.find((x) => x['set_id'] === p.set_id && Number(x['version']) === p.version);
      if (s === undefined || v === undefined || v['digest'] !== p.digest) return { check_id: checkId, reproducible: false, reason: `pinned set ${p.set_key} v${p.version} is not readable with digest ${p.digest}` };
      const sv = setVersionOf(s, v);
      if (typeof sv === 'string') return { check_id: checkId, reproducible: false, reason: sv };
      sets.push(sv);
    }
    const subj = c['subject'] as { quantities: ConstraintSubject['quantities']; edges?: ConstraintSubject['edges']; set_keys?: string[] };
    const e = evaluate({ kind: c['subject_kind'] as ConstraintSubject['kind'], ref: String(c['subject_ref']), quantities: subj.quantities, ...(subj.edges === undefined ? {} : { edges: subj.edges }) },
      sets, { budgetMs: DEFAULT_BUDGET_MS, vacuousWhenUndeclared: subj.set_keys === undefined });
    const same = e.outcome === c['outcome'] && canon(e.violations) === canon(c['violations']);
    const current = await this.currentSets(cap, [...new Set(pins.map((p) => p.set_key))].sort());
    return {
      check_id: checkId, reproducible: true, matches: same,
      recorded: { outcome: c['outcome'], violations: c['violations'], indeterminate_reason: c['indeterminate_reason'], sets: pins, budget_ms: c['budget_ms'] },
      rederived: { outcome: e.outcome, violations: e.violations, indeterminate: e.indeterminate, sets: e.pins },
      /* what the SAME sets say now — for the reader's comparison only; the reproduction never uses it */
      current_versions: current.sets.map((s) => ({ set_key: s.setKey, version: s.version, digest: s.digest })),
      ...(same ? {} : { note: c['outcome'] === 'indeterminate' ? 'the recorded check was indeterminate; the re-derivation under the full budget answers in full' : 'the re-derivation differs from the record' }),
    };
  }
}
