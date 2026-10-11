/**
 * CP-6 B30 §ES (0103) — TWIN STATE ESTIMATION AND CONTINUOUS RECONCILIATION (F-P5-02). What the routes (estimation.controller.ts), the
 * Reconciliation Agent's scan (reconciliation-agent.ts) and the after-tick hook `twin-estimation` do:
 *
 *   COMPUTE (reads only): the twin's head on `actual`, the active estimators of one key, every series input ASSEMBLED through its cut-offs
 *     (known at the database's instant — the Phase 4 series path, evidence read in custody), the inputs QUALIFIED (twin.tes_qualify: source
 *     health, cadence, unit, truth state), each estimator's CANDIDATE from qualified inputs only (estimators.ts — pure), and the CONSTRAINT
 *     CHECK before publish: the engine (ConstraintService.checkWith under the gate's machine capability, the B29 gate path) on the estimate's
 *     quantities as a run_input subject — never recorded as a plan check, the verdict and its pinned set versions go on the estimate.
 *   PROPOSE (twin.estimate.propose): the computed candidates, facts and verdict handed to the port, which re-qualifies, keeps every
 *     candidate, judges range and materiality, supersedes the open proposal and ROUTES a material or ambiguous change to the twin's owner.
 *     Candidate state only: the active snapshot is never touched.
 *   DECIDE (twin.estimate.decide): the owner's DECLINE (a reason), or APPROVAL — in ONE transaction, through the existing capabilities:
 *     twin.open_version (a draft on `actual` carrying from the head, the key excepted), twin.ground_element (the ESTIMATED element citing
 *     the evidence its qualified inputs read), the TWN admission (TwinService.admit), then twin.decide_estimate, which verifies the snapshot.
 *     The admission announces itself exactly as the admit route does (TwinStateChanged@v1 + GraphChanged/twin.state_changed).
 *   REQUEST OBSERVATIONS (twin.observation.request; V02-T-013) for a missing or stale input.
 *   THE TRIGGERS: after every attention tick (hook `twin-estimation`) the attention agent queues the proposal checks (telemetry, an upstream
 *     twin's change, an ontology revision) and fulfils requests; when anything is pending and the domain has an active Reconciliation Agent,
 *     its reconcile_scan runs (through the bridge the executive registers — the twin module imports nothing of the executive).
 */
import { HttpException, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { errorBody, type Envelope } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import type { ScopeContext } from '../../shared/scope.js';
import { COMMIT_DB } from '../../shared/shared.module.js';
import type { Db } from '../../shared/db.js';
import { PipelineService, type WriteEffect } from '../../pipeline/pipeline.service.js';
import { SeriesService, type Reader } from '../../prediction/series/series.service.js';
import { foldControls, type ControlInput } from '../../prediction/controls.js';
import { AttentionTickRegistry } from '../../executive/attention/tick.js';
import { twinStateChangedGraphEvent } from '../../graph/subscriptions/change-events.js';
import { TwinService } from '../twins/twin.service.js';
import { twinStateChangedEvent } from '../twins/twin-events.js';
import type { Citation } from '../twin.capabilities.js';
import { checkFamilyGround } from '../families/admission.js';
import { ConstraintService, DEFAULT_BUDGET_MS } from '../constraints/constraint.service.js';
import { ConstraintCapability } from '../constraints/constraint.capabilities.js';
import { candidateOf, constraintSubjectOf, unreadableInWindow, widestWindow, type Candidate, type EstimatorDecl, type EstimatorIntake, type Point, type SeriesInput } from './estimators.js';
import { EstimationCapability, type DecideWrites, type EstimationReads, type EstimatorWrites, type RequestWrites } from './estimation.capabilities.js';
import { ReconciliationBridge } from './reconciliation-bridge.js';
import { reconcileScan } from './reconciliation-agent.js';

type Row = Record<string, unknown>;
export const ESTIMATION_HOOK = 'twin-estimation';
const READ = 'twin.estimation.read';
/* B25-R (the demo regression of 2026-10-07): how long the attention tick waits on the reconcile scan it started before it returns — the scan
   goes on, detached, and closes its own run. The tick ran it INLINE: on eye_demo a 15-minute scan held the tick (the queue runs one job at
   a time), both sessions lapsed and neither run could close. A harness may shorten it (EstimationService.scanAwaitMs). */
export const SCAN_AWAIT_MS = 30_000;
/* B25-R: the days a series tail spans beyond its points × cadence — the publisher's lag (PortWatch's counts arrive ~4 days late), gaps */
const TAIL_SLACK_DAYS = 14;

/** A DATE as the day it names (the driver reads a DATE as the local midnight: its local components are the day — twin.service.ts dayOf). */
const day = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
/* B33 twin (0111 §TW4): the estimate's own citation — what the approved, estimated element cites beside its evidence */
export const estimateCitation = (est: Record<string, unknown>): Citation =>
  ({ kind: 'estimate', id: String(est['estimate_id']), version: 1, digest: String(est['inputs_digest']) });
/* end B33 twin */
/** The row with its DATE columns rendered as the days they name. */
const days = (r: Row, cols: readonly string[]): Row => { const o = { ...r }; for (const c of cols) if (c in o) o[c] = day(o[c]); return o; };
const ESTIMATE_DAYS = ['as_of'] as const;
const VERSION_DAYS = ['observed_through'] as const;
const ELEMENT_DAYS = ['valid_from', 'valid_to'] as const;
const textOf = (e: unknown): string => (e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : (e instanceof Error ? e.message : String(e)));

// B30 (the boundaries gate): Computed and RequestIntake live in estimation.types.ts so reconciliation-agent.ts can name them without importing
// this file (which imports reconcileScan from it); re-exported here for the existing imports.
export type { Computed, RequestIntake } from './estimation.types.js';
import type { Computed, RequestIntake } from './estimation.types.js';

export interface DecisionIntake { decision: 'approved' | 'declined'; note: string | null; allowIncomplete: boolean }

@Injectable()
export class EstimationService implements OnModuleInit {
  private readonly log = new Logger('twin.estimation');
  /* B25-R: the reconcile scan in flight per agent (one process runs a domain's timer): a tick never starts a second scan of an agent whose
     scan is live — it says so and the pending checks wait for it — and never waits on one longer than `scanAwaitMs` */
  private readonly inFlight = new Map<string, { since: string; done: Promise<Row> }>();
  scanAwaitMs = SCAN_AWAIT_MS;
  constructor(private readonly moduleRef: ModuleRef, private readonly pipeline: PipelineService, private readonly twins: TwinService, private readonly series: SeriesService,
              private readonly constraints: ConstraintService, @Inject(COMMIT_DB) private readonly commitDb: Db) {}

  /** The after-tick hook (the orchestration precedent) and the Reconciliation Agent's scan, offered to the executive through the bridge. */
  onModuleInit(): void {
    ReconciliationBridge.setScanner((deps, p, a) => reconcileScan({ estimation: this, pipeline: this.pipeline, env: deps.env, route: deps.route }, p, a));
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: estimation triggers are not queued in the background'); return; }
    registry.registerAfter({ name: ESTIMATION_HOOK, run: async (a) => this.afterTick(a) });
  }

  // ───────────────────────── envelopes ─────────────────────────
  /** A server-side envelope (the hook, the agent): never client-supplied. */
  envelopeFor(principal: AuthenticatedPrincipal, tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null, correlationId: string, purpose = 'twin'): Envelope {
    return {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${principal.principalId}`, purpose_id: purpose, action,
      side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C1', object_type: objectType, object_id: objectId,
      schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: correlationId, trace_id: 'twin-estimation',
    } as unknown as Envelope;
  }
  private derive(base: Envelope, action: string, objectType: string, objectId: string | null): Envelope {
    return { ...base, action, object_type: objectType, object_id: objectId, side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', message_id: newId() } as Envelope;
  }
  private route(tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null, writableTargets?: string[]) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId, ...(writableTargets === undefined ? {} : { writableTargets }) };
  }

  // ───────────────────────── reads ─────────────────────────
  async listEstimators(cap: EstimationReads, twinId: string | null, state: string | null): Promise<Row[]> {
    let q = cap.readEstimators().selectAll();
    if (twinId !== null) q = q.where('twin_id' as never, '=', twinId as never);
    if (state !== null) q = q.where('state' as never, '=', state as never);
    return (await q.orderBy('twin_id' as never).orderBy('key' as never).orderBy('name' as never).orderBy('version' as never, 'desc').execute()) as Row[];
  }
  async listEstimates(cap: EstimationReads, f: { twinId: string | null; key: string | null; state: string | null; limit: number }): Promise<Row[]> {
    let q = cap.readEstimates().selectAll();
    if (f.twinId !== null) q = q.where('twin_id' as never, '=', f.twinId as never);
    if (f.key !== null) q = q.where('key' as never, '=', f.key as never);
    if (f.state !== null) q = q.where('state' as never, '=', f.state as never);
    return ((await q.orderBy('proposed_at' as never, 'desc').orderBy('estimate_id' as never).limit(f.limit).execute()) as Row[]).map((r) => days(r, ESTIMATE_DAYS));
  }
  async getEstimate(cap: EstimationReads, estimateId: string): Promise<Row | null> {
    const e = (await cap.readEstimates().selectAll().where('estimate_id' as never, '=', estimateId as never).executeTakeFirst()) as Row | undefined;
    if (e === undefined) return null;
    const qualifications = (await cap.readQualifications().selectAll().where('estimate_id' as never, '=', estimateId as never)
      .orderBy('estimator_id' as never).orderBy('input_index' as never).execute()) as Row[];
    const events = (await cap.readEvents().selectAll().where('estimate_id' as never, '=', estimateId as never).orderBy('occurred_at' as never).execute()) as Row[];
    const item = e['attention_item_id'] === null ? null : ((await cap.readAttention().select(['item_id', 'signal_class', 'state', 'owner_principal_id', 'title', 'due_at'] as never)
      .where('item_id' as never, '=', e['attention_item_id'] as never).executeTakeFirst()) as Row | undefined) ?? null;
    return { ...days(e, ESTIMATE_DAYS), qualifications, events, attention_item: item };
  }
  async listRequests(cap: EstimationReads, twinId: string | null, state: string | null): Promise<Row[]> {
    let q = cap.readRequests().selectAll();
    if (twinId !== null) q = q.where('twin_id' as never, '=', twinId as never);
    if (state !== null) q = q.where('state' as never, '=', state as never);
    return (await q.orderBy('requested_at' as never, 'desc').execute()) as Row[];
  }
  async ledger(cap: EstimationReads, twinId: string | null, limit: number): Promise<Row[]> {
    let q = cap.readEvents().selectAll();
    if (twinId !== null) q = q.where('twin_id' as never, '=', twinId as never);
    return (await q.orderBy('occurred_at' as never, 'desc').orderBy('event_id' as never).limit(limit).execute()) as Row[];
  }
  /** The reconciliation page's view of one twin: its head (the key's values), the estimators, the open and recent estimates, requests, pending checks. */
  async overview(cap: EstimationReads, twinId: string): Promise<Row | null> {
    const twin = (await cap.readTwins().select(['twin_id', 'title', 'kind', 'owner_principal_id'] as never).where('twin_id' as never, '=', twinId as never).executeTakeFirst()) as Row | undefined;
    if (twin === undefined) return null;
    const head = (await cap.readVersions().select(['version', 'observed_through', 'known_at', 'admitted_at', 'completeness'] as never).where('twin_id' as never, '=', twinId as never)
      .where('branch_id' as never, '=', 'actual' as never).where('state' as never, '=', 'admitted' as never).orderBy('version' as never, 'desc').limit(1).executeTakeFirst()) as Row | undefined;
    const estimators = await this.listEstimators(cap, twinId, 'active');
    const keys = [...new Set(estimators.map((e) => String(e['key'])))];
    const headElements = head === undefined || keys.length === 0 ? [] : (await cap.readElements().select(['key', 'kind', 'value', 'unit', 'health', 'valid_from', 'valid_to', 'confidence'] as never)
      .where('twin_id' as never, '=', twinId as never).where('version' as never, '=', head['version'] as never).where('key' as never, 'in', keys as never).execute()) as Row[];
    const estimates = await this.listEstimates(cap, { twinId, key: null, state: null, limit: 20 });
    const requests = await this.listRequests(cap, twinId, null);
    const pending = (await cap.pending()).filter((p) => p['twin_id'] === twinId);
    return { twin, head: head === undefined ? null : days(head, VERSION_DAYS), head_elements: headElements.map((e) => days(e, ELEMENT_DAYS)), estimators, estimates, requests, pending };
  }

  // ───────────────────────── compute (reads only) ─────────────────────────
  async compute(base: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, twinId: string, key: string): Promise<Computed> {
    const corr = base.correlation_id;
    const read = (await this.pipeline.consequentialRead(this.derive(base, READ, 'TWN', twinId), principal, this.route(tenantId, domainId, READ, 'TWN', twinId), EstimationCapability.read,
      async (cap) => {
        const now = await cap.now();
        const twin = (await cap.readTwins().selectAll().where('twin_id' as never, '=', twinId as never).executeTakeFirst()) as Row | undefined;
        if (twin === undefined) return null;
        const head = (await cap.readVersions().selectAll().where('twin_id' as never, '=', twinId as never).where('branch_id' as never, '=', 'actual' as never)
          .where('state' as never, '=', 'admitted' as never).orderBy('version' as never, 'desc').limit(1).executeTakeFirst()) as Row | undefined;
        const headElements = head === undefined ? [] : (await cap.readElements().select(['key', 'kind', 'value', 'unit', 'health', 'valid_from', 'valid_to'] as never)
          .where('twin_id' as never, '=', twinId as never).where('version' as never, '=', head['version'] as never).orderBy('key' as never).execute()) as Row[];
        const estimators = (await cap.readEstimators().selectAll().where('twin_id' as never, '=', twinId as never).where('key' as never, '=', key as never)
          .where('state' as never, '=', 'active' as never).orderBy('role' as never, 'desc').orderBy('name' as never).execute()) as Row[];
        return { now, twin, head: head ?? null, headElements, estimators };
      })).result;
    if (read === null) throw new HttpException(errorBody('EYE_STA_001', corr, `estimate rejected (unknown_twin): ${twinId} is not a twin of this domain`), 404);
    if (read.estimators.length === 0) throw new HttpException(errorBody('EYE_STA_001', corr, `estimate rejected (unknown_estimator): no active estimator is declared for ${key} on twin ${twinId}`), 404);
    const estimators: EstimatorDecl[] = read.estimators.map((e) => ({
      estimator_id: String(e['estimator_id']), version: Number(e['version']), name: String(e['name']), role: e['role'] as 'primary' | 'challenger', method: e['method'] as EstimatorDecl['method'],
      parameters: (e['parameters'] ?? {}) as EstimatorDecl['parameters'], inputs: (e['inputs'] ?? []) as EstimatorDecl['inputs'], unit: String(e['unit']),
      bounds: (e['bounds'] ?? {}) as EstimatorDecl['bounds'], materiality: Number(e['materiality']), ambiguity: Number(e['ambiguity']), constraint_sets: (e['constraint_sets'] ?? []) as string[],
    }));
    // the series inputs, assembled once each through the Phase 4 path (known at the database's instant)
    const reader: Reader = { principal, tenantId, domainId, correlationId: corr, purposeId: base.purpose_id ?? 'twin' };
    const assembled = new Map<string, { points: Point[]; fact: Row; unit: string | null }>();
    for (const e of estimators) for (const inp of e.inputs) {
      if (inp.kind !== 'series' || assembled.has(inp.series_key)) continue;
      try {
        /* B25-R: the TAIL the estimators read — the widest window over this series, at its slowest declared cadence — never the whole history
           (the demo's corridor: ~9,000 governed retrievals per read; the tail, a few hundred). The facts state the points, evidence and
           unreadable versions of what was read, and where the read began (`read_from`). */
        const widest = widestWindow(estimators, inp.series_key);
        const cadence = Math.max(1, ...estimators.flatMap((x) => x.inputs).filter((x): x is SeriesInput => x.kind === 'series' && x.series_key === inp.series_key).map((x) => Number(x.cadence_days) || 1));
        const s = await this.series.assemble(reader, inp.series_key, read.now, null, { points: widest, spanDays: Math.ceil(widest * cadence) + TAIL_SLACK_DAYS });
        const points = s.points.map((x) => ({ date: x.date, value: x.value, evidence: { id: x.evidence_object_id, version: x.evidence_version } }));
        const last = s.points[s.points.length - 1];
        // B30 act: an unreadable evidence version counts only inside the estimators' widest window, or with no day (estimators.ts unreadableInWindow)
        let unreadable = s.unreadable.length; let outside = 0; let windowFrom: string | null = null;
        if (unreadable > 0 && points.length > 0) {
          const refs = s.unreadable.map((u) => ({ id: u.evidence_object_id, version: Number(u.evidence_version) }));
          const daysOf = (await this.pipeline.consequentialRead(this.derive(base, READ, 'TWN', twinId), principal, this.route(tenantId, domainId, READ, 'TWN', twinId), EstimationCapability.read,
            async (cap) => cap.evidenceDays(refs))).result;
          const w = unreadableInWindow(points, estimators, inp.series_key, refs.map((u) => {
            const d = daysOf.find((x) => x['id'] === u.id && Number(x['version']) === u.version)?.['day'];
            return { day: typeof d === 'string' ? d : null };
          }));
          unreadable = w.counted; outside = w.outside; windowFrom = w.windowFrom;
        }
        assembled.set(inp.series_key, { points, unit: s.series.unit, fact: { points: s.points.length, last_date: last?.date ?? null,
          evidence: s.evidence.map((v) => ({ id: v.evidence_object_id, version: v.evidence_version })), unreadable,
          ...(outside > 0 ? { unreadable_outside_window: outside, window_from: windowFrom } : {}),
          ...(s.readFrom === null || s.readFrom === undefined ? {} : { read_from: s.readFrom, versions_left_out: s.versionsLeftOut ?? 0 }) } });
      } catch (err) {
        if (err instanceof HttpException && err.getStatus() === 403) throw err;
        assembled.set(inp.series_key, { points: [], unit: null, fact: { points: 0, last_date: null, evidence: [], unreadable: 0, note: textOf(err).slice(0, 300) } });
      }
    }
    const facts: Record<string, Row[]> = {};
    for (const e of estimators) {
      facts[e.estimator_id] = e.inputs.map((inp, index) => (inp.kind === 'series' ? { index, ...(assembled.get(inp.series_key)?.fact ?? {}) } : { index }));
    }
    const qualification = (await this.pipeline.consequentialRead(this.derive(base, READ, 'TWN', twinId), principal, this.route(tenantId, domainId, READ, 'TWN', twinId), EstimationCapability.read,
      async (cap) => {
        const out: Array<{ estimator_id: string; version: number; inputs: Row[] }> = [];
        for (const e of estimators) out.push({ estimator_id: e.estimator_id, version: e.version, inputs: await cap.qualify({ tenantId, domainId, estimatorId: e.estimator_id, version: e.version, facts: facts[e.estimator_id] ?? [] }) });
        return out;
      })).result;
    const headEl = (k: string) => read.headElements.find((x) => x['key'] === k);
    const candidates: Candidate[] = estimators.map((e) => {
      const q = qualification.find((x) => x.estimator_id === e.estimator_id)?.inputs ?? [];
      const reasons = q.filter((x) => x['verdict'] === 'disqualified').flatMap((x) => (x['reasons'] ?? []) as string[]);
      const first = e.inputs[0];
      if (first?.kind === 'series') return candidateOf(e, assembled.get(first.series_key)?.points ?? [], null, reasons.length === 0 ? null : reasons.join('; '));
      const el = first === undefined ? undefined : headEl(first.key);
      return candidateOf(e, null, el === undefined ? null : { value: el['value'], date: day(el['valid_to']) ?? day(el['valid_from']) }, reasons.length === 0 ? null : reasons.join('; '));
    });
    const primaryDecl = estimators.find((e) => e.role === 'primary') ?? null;
    const primary = primaryDecl === null ? null : candidates.find((c) => c.estimator_id === primaryDecl.estimator_id) ?? null;
    const unqualified: Computed['unqualified'] = [];
    if (primaryDecl !== null) {
      for (const x of qualification.find((q) => q.estimator_id === primaryDecl.estimator_id)?.inputs ?? []) {
        if (x['verdict'] !== 'disqualified') continue;
        const reasons = (x['reasons'] ?? []) as string[];
        const cadence = String(((x['cadence'] ?? {}) as Row)['verdict'] ?? '');
        unqualified.push({ estimator_id: primaryDecl.estimator_id, index: Number(x['index']), input: (x['input'] ?? {}) as Row, reasons,
                           reason_class: cadence === 'missing' || reasons.some((r) => r.includes('(missing)')) ? 'missing' : cadence === 'stale' ? 'stale' : 'disqualified' });
      }
    }
    // the constraint check BEFORE publish (the engine, through the gate's machine capability; a run_input subject — not recorded as a plan check)
    let constraint: Computed['constraint'] = { outcome: 'indeterminate', pins: [], violations: [], applied: [], vacuous: false, reason: 'no qualified primary candidate to check', subject: null };
    if (primaryDecl !== null && primary !== null && primary.value !== null && primary.last_point !== null) {
      const first = primaryDecl.inputs[0];
      const subject = constraintSubjectOf({ ref: `twin:${twinId}:estimate:${key}`.slice(0, 200), key, value: primary.value, unit: primaryDecl.unit, asOf: primary.last_point.date, primary: primaryDecl,
        lastRaw: first?.kind === 'series' ? primary.last_point.value : null, inputUnit: first?.kind === 'series' ? first.unit : null,
        head: read.head === null ? null : { observedThrough: day(read.head['observed_through']), elements: read.headElements.map((x) => ({ key: String(x['key']), value: x['value'], unit: (x['unit'] as string | null) ?? null })) } });
      const setKeys = primaryDecl.constraint_sets.length === 0 ? undefined : [...primaryDecl.constraint_sets].sort();
      try {
        const r = await this.commitDb.transaction().execute(async (tx) => {
          const cap = await ConstraintCapability.gate(tx, { tenantId, domainId }, `estimate check: ${twinId} ${key}`.slice(0, 200));
          return this.constraints.checkWith(cap, { tenantId, domainId }, subject, { setKeys, budgetMs: DEFAULT_BUDGET_MS, actor: null, correlationId: corr, record: false });
        });
        const ev = r.evaluation;
        constraint = { outcome: ev.outcome, pins: ev.pins, violations: ev.violations, applied: ev.applied, vacuous: ev.vacuous, reason: ev.outcome === 'indeterminate' ? ev.indeterminate.join('; ').slice(0, 2000) : null, subject };
      } catch (err) {
        constraint = { outcome: 'indeterminate', pins: [], violations: [], applied: [], vacuous: false, reason: `the constraint engine failed: ${textOf(err)}`.slice(0, 500), subject };
      }
    }
    return { twin: read.twin, head: read.head, headElements: read.headElements, estimators, now: read.now, facts, qualification, candidates, primary,
             asOf: primary?.last_point?.date ?? null, constraint, unqualified };
  }

  // ───────────────────────── writes ─────────────────────────
  async declare(cap: EstimatorWrites, scope: ScopeContext, intake: EstimatorIntake, actor: string, correlationId: string): Promise<Row> {
    return cap.declare({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor, correlationId, estimatorId: newId(), twinId: intake.twinId, key: intake.key,
      name: intake.name, role: intake.role, method: intake.method, parameters: intake.parameters, inputs: intake.inputs, unit: intake.unit, bounds: intake.bounds,
      materiality: intake.materiality, ambiguity: intake.ambiguity, constraintSets: intake.constraintSets, note: intake.note });
  }

  /** PROPOSE: compute (reads), then the one governed write. `agent` names the Reconciliation Agent's run when the agent proposes. */
  async propose(base: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, twinId: string, key: string,
                agent: { agentId: string; runId: string } | null, trigger: Row,
                /* B25-R: the scan's own computation, read ONCE per twin × key — it computed and then proposed, reading the series twice */
                precomputed?: Computed): Promise<{ estimate: Row; computed: Computed; receipt: { policyDecisionId: string; auditSeq: number } }> {
    const computed = precomputed ?? await this.compute(base, principal, tenantId, domainId, twinId, key);
    const estimateId = newId();
    const constraint = { outcome: computed.constraint.outcome, pins: computed.constraint.pins, violations: computed.constraint.violations, applied: computed.constraint.applied,
                         vacuous: computed.constraint.vacuous, reason: computed.constraint.reason, subject_kind: 'run_input', engine: 'B29 constraint engine (the gate path)' };
    const out = await this.pipeline.write(this.derive(base, 'twin.estimate.propose', 'TWE', estimateId), principal, this.route(tenantId, domainId, 'twin.estimate.propose', 'TWE', estimateId),
      EstimationCapability.propose, async (cap, scope) => ({
        result: await cap.propose({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, correlationId: base.correlation_id,
          estimateId, twinId, key, facts: computed.facts as Record<string, unknown[]>, candidates: computed.candidates, constraint, trigger,
          agentId: agent?.agentId ?? null, runId: agent?.runId ?? null }),
        targetType: 'TWE', targetId: estimateId, targetVersion: '1', outboxEvent: null }));
    return { estimate: out.result, computed, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /**
   * DECIDE: a decline is the port alone; an APPROVAL opens, grounds and admits the new snapshot through the existing capabilities and then
   * records the decision — ONE transaction under twin.estimate.decide (a refusal anywhere leaves nothing).
   */
  async decide(base: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, estimateId: string, intake: DecisionIntake) {
    const corr = base.correlation_id;
    const est = (await this.pipeline.consequentialRead(this.derive(base, READ, 'TWE', estimateId), principal, this.route(tenantId, domainId, READ, 'TWE', estimateId), EstimationCapability.read,
      async (cap) => ((await cap.readEstimates().selectAll().where('estimate_id' as never, '=', estimateId as never).executeTakeFirst()) as Row | undefined) ?? null)).result;
    if (est === null) throw new HttpException(errorBody('EYE_STA_001', corr, `estimate rejected (unknown_estimate): ${estimateId} is not an estimate of this domain`), 404);
    const twinId = String(est['twin_id']);
    const out = await this.pipeline.write(this.derive(base, 'twin.estimate.decide', 'TWE', estimateId), principal,
      this.route(tenantId, domainId, 'twin.estimate.decide', 'TWE', estimateId, [estimateId, twinId]), EstimationCapability.decide,
      async (cap, scope): Promise<WriteEffect<{ decision: Row; snapshot: Row | null }>> => {
        const who = { tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, correlationId: corr };
        if (intake.decision === 'declined') {
          return { result: { decision: await cap.decide({ ...who, estimateId, decision: 'declined', note: intake.note, newVersion: null }), snapshot: null },
                   targetType: 'TWE', targetId: estimateId, targetVersion: '1', outboxEvent: null };
        }
        const snapshot = await this.publish(cap, scope, est, intake.allowIncomplete, base.purpose_id ?? 'twin', principal.principalId, corr);
        const decision = await cap.decide({ ...who, estimateId, decision: 'approved', note: intake.note, newVersion: snapshot.version });
        const { runs, ...r } = snapshot.admitted;
        const now = new Date().toISOString();
        return {
          result: { decision, snapshot: { ...r, version: snapshot.version } as Row }, targetType: 'TWE', targetId: estimateId, targetVersion: '1',
          outboxEvent: twinStateChangedEvent({
            twinId, version: snapshot.version, branchId: r.branchId, supersedes: r.supersedes, forkedFromVersion: r.forkedFrom, change: 'version.admitted',
            stateSetDigest: r.stateSetDigest, headerDigest: r.headerDigest, completeness: r.completeness, missingKeys: r.missingKeys, syntheticState: r.syntheticState,
            knownAt: r.knownAt, observedThrough: r.observedThrough, verificationState: 'verified', changedVariables: r.changedVariables, dependencyImpacts: r.dependencyImpacts,
            reason: null, causedBy: null, action: 'twin.estimate.decide', actor: principal.principalId, occurredAt: now,
          }),
          outboxEvents: [twinStateChangedGraphEvent({
            twinId, version: snapshot.version, supersedes: r.supersedes, branchId: r.branchId, changedVariables: r.changedVariables.length, runs,
            subscriptions: await cap.admit.changeSubscriptions({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, changeKind: 'twin.state_changed' }),
            actor: principal.principalId, occurredAt: now,
          })],
        };
      });
    return { decision: out.result.decision, snapshot: out.result.snapshot, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /** The new snapshot: a draft on `actual` carrying from the head (the key excepted), the ESTIMATED element, the admission. */
  private async publish(cap: DecideWrites, scope: ScopeContext, est: Row, allowIncomplete: boolean, purposeId: string, actor: string, corr: string) {
    const twinId = String(est['twin_id']); const key = String(est['key']);
    const now = await cap.now();
    const head = (await cap.readVersions().selectAll().where('twin_id' as never, '=', twinId as never).where('branch_id' as never, '=', 'actual' as never)
      .where('state' as never, '=', 'admitted' as never).orderBy('version' as never, 'desc').limit(1).executeTakeFirst()) as Row | undefined;
    const asOf = day(est['as_of']) as string;
    const headThrough = head === undefined ? null : day(head['observed_through']);
    const observedThrough = headThrough !== null && headThrough > asOf ? headThrough : asOf;
    const headHasKey = head === undefined ? false : (await cap.readElements().select(['key'] as never).where('twin_id' as never, '=', twinId as never)
      .where('version' as never, '=', head['version'] as never).where('key' as never, '=', key as never).executeTakeFirst()) !== undefined;
    const { version } = await this.twins.openVersion(cap.version, scope, twinId, { branchId: 'actual', forkedFromVersion: null, knownAt: now, observedThrough,
      carryFrom: head === undefined ? null : Number(head['version']), except: headHasKey ? [key] : [] }, actor, corr);
    // the ESTIMATED element: the proposed value, citing exactly the evidence the qualified inputs read (record time judged against the draft's known_at)
    const cited = (est['evidence'] ?? []) as Array<{ id: string; version: number }>;
    const citations: Citation[] = []; const controls: ControlInput[] = []; let synthetic = false;
    for (const c of cited) {
      const row = await cap.ground.citedObject({ objectType: 'EVD', id: c.id, version: c.version });
      if (row === undefined) throw new HttpException(errorBody('EYE_STA_001', corr, `estimate rejected (snapshot): evidence ${c.id}@${c.version} is not readable in this domain`), 422);
      if (row.recorded_at > now) throw new HttpException(errorBody('EYE_REQ_001', corr, `estimate rejected (snapshot): evidence ${c.id}@${c.version} was recorded after the snapshot's known_at`), 422);
      citations.push({ kind: 'evidence', id: row.object_id, version: row.object_version, digest: row.content_digest });
      controls.push({ synthetic_state: row.synthetic_state, classification: row.classification, rights_profile: row.rights_profile, residency_profile: row.residency_profile,
                      retention_profile: row.retention_profile, access_policy_ref: row.access_policy_ref } as ControlInput);
      synthetic = synthetic || row.synthetic_state;
    }
    /* B33 twin (0111 §TW4): the ESTIMATE CITATION KIND — the estimated element cites the estimate itself {kind: estimate, id, version 1, digest:
       its inputs_digest} beside the evidence; the decision's port (twin.decide_estimate, re-declared) refuses an element without exactly it */
    citations.push(estimateCitation(est));
    /* end B33 twin */
    const value = Number(est['proposed_value']);
    await checkFamilyGround(cap.ground, twinId, version, [{ key, value, unit: String(est['unit']) }], corr);
    await cap.ground.groundElement({
      elementId: newId(), tenantId: scope.tenantId as string, domainId: scope.domainId as string, twinId, version, key, kind: 'estimated', basisTruthState: null,
      value, unit: String(est['unit']), citations, health: 'complete', validFrom: asOf, validTo: null, confidence: Number(est['confidence']),
      syntheticState: synthetic, controls: citations.length === 0 ? {} : foldControls(controls), inheritedValidation: null, actor, eventId: newId(), correlationId: corr,
    });
    const admitted = await this.twins.admit(cap.admit, scope, twinId, version, allowIncomplete, purposeId, actor, corr);
    return { version, admitted };
  }

  async request(cap: RequestWrites, scope: ScopeContext, intake: RequestIntake, agent: { agentId: string; runId: string } | null, actor: string, correlationId: string): Promise<Row> {
    return cap.request({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor, correlationId, requestId: newId(), twinId: intake.twinId, key: intake.key,
      estimatorId: intake.estimatorId, input: intake.input, reasonClass: intake.reasonClass, note: intake.note, agentId: agent?.agentId ?? null, runId: agent?.runId ?? null });
  }

  /** QUEUE the triggers (the attention agent, after its tick): one governed write under twin.estimation.trigger. */
  async queue(principal: AuthenticatedPrincipal, tenantId: string, domainId: string, correlationId: string): Promise<Row> {
    const out = await this.pipeline.write(this.envelopeFor(principal, tenantId, domainId, 'twin.estimation.trigger', 'TWE', null, correlationId), principal,
      this.route(tenantId, domainId, 'twin.estimation.trigger', 'TWE', null), EstimationCapability.trigger,
      async (cap, scope) => ({ result: await cap.queueTriggers({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, correlationId }),
                               targetType: 'TWE', targetId: null, targetVersion: null, outboxEvent: null }));
    return out.result;
  }

  /** THE HOOK: queue the triggers; when a check is pending and the domain has an active Reconciliation Agent, its scan runs (the bridge). */
  async afterTick(a: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string; correlationId: string }): Promise<Row> {
    const q = await this.queue(a.principal, a.tenantId, a.domainId, a.correlationId);
    const pending = (q['pending'] ?? []) as Row[]; const agents = (q['reconciliation_agents'] ?? []) as string[];
    let scan: Row | null = null;
    if (pending.length > 0 && agents.length > 0) {
      const runner = ReconciliationBridge.runner();
      const agentId = agents[0] as string;
      const live = this.inFlight.get(agentId);
      if (runner === null) scan = { skipped: 'no agent runner in this application' };
      // B25-R: one scan per agent at a time — the checks stay pending for the scan in flight (or the next tick's)
      else if (live !== undefined) scan = { skipped: `a reconcile scan of agent ${agentId} is in flight since ${live.since}; the pending checks wait for it`, agent_id: agentId, in_flight_since: live.since };
      else {
        // B25-R: the scan is STARTED, not awaited past `scanAwaitMs` — its run opens, works and closes under the agent's own session whatever
        // the tick does; a scan done within the bound is reported as before
        const since = new Date().toISOString();
        const done: Promise<Row> = runner({ agentId, tenantId: a.tenantId, domainId: a.domainId, task: 'reconcile_scan',
                                            trigger: { kind: 'scheduler', principalId: a.principal.principalId, ref: ESTIMATION_HOOK }, roomId: null, packageId: null, version: null, correlationId: a.correlationId })
          .then((r): Row => ({ run_id: r.runId, agent_id: r.agentId, outcome: r.outcome, stop_reason: r.stopReason }), (err: unknown): Row => ({ error: textOf(err).slice(0, 500) }))
          .finally(() => { this.inFlight.delete(agentId); });
        this.inFlight.set(agentId, { since, done });
        let timer: NodeJS.Timeout | undefined;
        const first = await Promise.race([done, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), this.scanAwaitMs); })]);
        clearTimeout(timer);
        if (first !== null) scan = first;
        else {
          scan = { in_flight: true, agent_id: agentId, since, note: `the scan goes on after the tick (waited ${this.scanAwaitMs} ms); its run closes itself` };
          void done.then((r) => { this.log.log(`reconcile scan of agent ${agentId} (started ${since}) ended after the tick: ${JSON.stringify(r).slice(0, 300)}`); });
        }
      }
    }
    return { queued: q['queued'] ?? [], fulfilled: q['fulfilled'] ?? [], pending, scan };
  }
}
