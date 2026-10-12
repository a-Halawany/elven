/**
 * B94 §SV (0114_b94_x_sv) — THE SERVICE PORTAL'S CAPABILITIES: one class, a read view and a write view. Each write is a thin binding to a
 * SECURITY DEFINER port that asserts the route's own action, the scope and the acting principal (and, for a support engineer, the live grant
 * FIRST); each read is a plain select under the caller's RLS (or a guarded definer read). Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);
const lim = (n: number, max = 500) => Math.min(Math.max(Math.trunc(n), 1), max);

class ServiceCore {
  readonly #tx: Tx; readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  get tx(): Tx { return this.#tx; }
  protected async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.#tx)).rows as T[]; }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const row = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
}

export interface ServiceReads {
  readonly action: string; readonly tx: Tx;
  now(): Promise<string>;
  cases(filter: { state: string | null; limit: number }): Promise<Row[]>;
  caseRow(caseId: string): Promise<Row | null>;
  firstGrantAt(caseId: string): Promise<string | null>;
  notes(caseId: string): Promise<Row[]>;
  bundles(caseId: string): Promise<Row[]>;
  commitments(caseId: string | null): Promise<Row[]>;
  breaches(caseId: string | null, limit: number): Promise<Row[]>;
  drills(caseId: string): Promise<Row[]>;
  timers(caseId: string): Promise<Row[]>;
  ledger(subjectIds: string[], limit: number): Promise<Row[]>;
  items(subjectId: string): Promise<Row[]>;
  tasks(caseId: string): Promise<Row[]>;
  grants(caseId: string): Promise<Row[]>;
  accessLog(caseId: string, limit: number): Promise<Row[]>;
  problems(): Promise<Row[]>;
  problemCases(): Promise<Row[]>;
  knownErrors(): Promise<Row[]>;
  knownErrorUses(): Promise<Row[]>;
  changes(): Promise<Row[]>;
  policies(): Promise<Row[]>;
  routingPreview(tenantId: string, domainId: string): Promise<Row>;
  sweepCandidates(tenantId: string, domainId: string): Promise<{ commitments: string[]; objectives: Row[] }>;
  health(): Promise<Row[]>;
  metricResults(prefix: 'ADP-' | null, excludePrefixes: string[]): Promise<Row[]>;
  valueStatus(tenantId: string, domainId: string): Promise<Row>;
  entitlement(tenantId: string): Promise<Row | null>;
  valueReviews(): Promise<Row[]>;
  valueReview(reviewId: string): Promise<Row | null>;
  /** onboarding.digest over a value (the database computes every digest). */
  digest(v: unknown): Promise<string>;
}

export interface ServiceWrites extends ServiceReads {
  openCase(a: { caseId: string; tenantId: string; domainId: string; title: string; severity: string; capability: string; objects: Row[]; description: string; actor: string; correlationId: string }): Promise<Row>;
  triage(a: { caseId: string; tenantId: string; domainId: string; expectedVersion: number; severity: string | null; note: string; actor: string; correlationId: string }): Promise<Row>;
  note(a: { noteId: string; caseId: string; tenantId: string; domainId: string; kind: string; body: string; actor: string; correlationId: string }): Promise<Row>;
  progress(a: { caseId: string; tenantId: string; domainId: string; expectedVersion: number; to: string; statement: string; actor: string; correlationId: string }): Promise<Row>;
  proposeWorkaround(a: { caseId: string; tenantId: string; domainId: string; expectedVersion: number; steps: string; act: Row; risk: string | null; actor: string; correlationId: string }): Promise<Row>;
  executeWorkaround(a: { caseId: string; tenantId: string; domainId: string; expectedVersion: number; policyDecisionId: string; note: string | null; actor: string; correlationId: string }): Promise<Row>;
  reuseKnownError(a: { caseId: string; tenantId: string; domainId: string; expectedVersion: number; knownErrorId: string; actor: string; correlationId: string }): Promise<Row>;
  assembleBundle(a: { bundleId: string; caseId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  confirmClosure(a: { caseId: string; tenantId: string; domainId: string; expectedVersion: number; outcome: string; note: string; actor: string; correlationId: string }): Promise<Row>;
  reopen(a: { caseId: string; tenantId: string; domainId: string; expectedVersion: number; regression: string; actor: string; correlationId: string }): Promise<Row>;
  supportRead(a: { caseId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  recordCommitment(a: { commitmentId: string; caseId: string; tenantId: string; domainId: string; kind: string; statement: string; dueAt: string; actor: string; correlationId: string }): Promise<Row>;
  settleCommitment(a: { commitmentId: string; tenantId: string; domainId: string; outcome: string; note: string; actor: string; correlationId: string }): Promise<Row>;
  openProblem(a: { problemId: string; tenantId: string; domainId: string; title: string; statement: string; cases: string[]; actor: string; correlationId: string }): Promise<Row>;
  linkProblem(a: { problemId: string; caseId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  publishKnownError(a: { knownErrorId: string; problemId: string; tenantId: string; domainId: string; title: string; symptom: string; workaround: string; act: Row; actor: string; correlationId: string }): Promise<Row>;
  closeProblem(a: { problemId: string; tenantId: string; domainId: string; outcome: string; rootCause: string | null; reason: string; actor: string; correlationId: string }): Promise<Row>;
  proposeChange(a: { changeId: string; problemId: string; tenantId: string; domainId: string; title: string; description: string; effect: string; actor: string; correlationId: string }): Promise<Row>;
  decideChange(a: { changeId: string; tenantId: string; domainId: string; expectedVersion: number | null; decision: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  recordChange(a: { changeId: string; tenantId: string; domainId: string; outcome: string; evidence: string; actor: string; correlationId: string }): Promise<Row>;
  drill(a: { drillId: string; caseId: string; tenantId: string; domainId: string; objective: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  sweep(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  recordValueReview(a: { reviewId: string; tenantId: string; domainId: string; from: string; to: string; inputs: Row; inputsDigest: string; outcomes: string; actor: string; correlationId: string }): Promise<Row>;
  decideValueReview(a: { reviewId: string; tenantId: string; domainId: string; digest: string; decision: string; note: string; actor: string; correlationId: string }): Promise<Row>;
}

const CASE_COLS = sql`c.case_id::text, c.case_ref, c.title, c.severity, c.affected_capability, c.object_refs, c.description, c.state, c.routing, c.opened_by::text, c.opened_at, c.updated_at, c.closed_at,
  c.version, c.response_due_at, c.resolution_due_at, c.responded_at, c.response_breached_at, c.resolution_breached_at, c.triaged_by::text, c.triaged_at, c.resolved_by::text, c.resolved_at,
  c.resolution, c.guidance, c.workaround, c.workaround_executed, c.problem_id::text, c.known_error_id::text, c.reopen_count, c.closed_by::text, c.closure,
  (select p.display_name from identity.principals p where p.id = c.opened_by) as opened_by_name,
  (select min(g.requested_at) from service.support_grants g where g.case_id = c.case_id) as first_grant_at`;

class ServiceCapabilityImpl extends ServiceCore implements ServiceWrites {
  // ── reads ──
  async cases(f: { state: string | null; limit: number }): Promise<Row[]> {
    return this.rows(sql`select ${CASE_COLS} from service.cases c where (${f.state}::text is null or c.state = ${f.state}) order by (c.state = 'closed'), c.opened_at desc limit ${lim(f.limit)}`);
  }
  async caseRow(caseId: string): Promise<Row | null> {
    return (await this.rows(sql`select ${CASE_COLS} from service.cases c where c.case_id = ${caseId}::uuid`))[0] ?? null;
  }
  async firstGrantAt(caseId: string): Promise<string | null> {
    const r = await this.rows<{ t: Date | null }>(sql`select min(g.requested_at) as t from service.support_grants g where g.case_id = ${caseId}::uuid`);
    const t = r[0]?.t; return t === null || t === undefined ? null : new Date(t).toISOString();
  }
  async notes(caseId: string): Promise<Row[]> {
    return this.rows(sql`select n.note_id::text, n.side, n.kind, n.body, n.grant_id::text, n.at, n.author_principal_id::text,
        (select p.display_name from identity.principals p where p.id = n.author_principal_id) as author_name
      from service.case_notes n where n.case_id = ${caseId}::uuid order by n.at`);
  }
  async bundles(caseId: string): Promise<Row[]> {
    return this.rows(sql`select b.bundle_id::text, b.case_version, b.side, b.grant_id::text, b.items, b.counts, b.digest, b.assembled_at, b.assembled_by::text
      from service.evidence_bundles b where b.case_id = ${caseId}::uuid order by b.assembled_at desc`);
  }
  async commitments(caseId: string | null): Promise<Row[]> {
    return this.rows(sql`select m.commitment_id::text, m.case_id::text, m.kind, m.statement, m.due_at, m.state, m.side, m.grant_id::text, m.made_at, m.breached_at, m.settled_at, m.settle_note, m.late,
        (select c.case_ref from service.cases c where c.case_id = m.case_id) as case_ref
      from service.commitments m where (${caseId}::uuid is null or m.case_id = ${caseId}::uuid) order by m.due_at`);
  }
  async breaches(caseId: string | null, limit: number): Promise<Row[]> {
    return this.rows(sql`select b.breach_id::text, b.case_id::text, b.objective, b.commitment_id::text, b.severity, b.tier, b.due_at, b.breached_at, b.found_by, b.drill, b.timer_id::text, b.item,
        (select c.case_ref from service.cases c where c.case_id = b.case_id) as case_ref
      from service.sla_breaches b where (${caseId}::uuid is null or b.case_id = ${caseId}::uuid) order by b.breached_at desc limit ${lim(limit)}`);
  }
  async drills(caseId: string): Promise<Row[]> {
    return this.rows(sql`select d.drill_id::text, d.objective, d.timer_id::text, d.requested_at, d.reason,
        (select t.fired_at from executive.workflow_timers t where t.timer_id = d.timer_id) as fired_at
      from service.sla_drills d where d.case_id = ${caseId}::uuid order by d.requested_at desc`);
  }
  async timers(caseId: string): Promise<Row[]> {
    return this.rows(sql`select t.timer_id::text, t.kind, t.due_at, t.payload, t.fired_at, t.cancelled_at, t.drift_seconds,
        (select f.outcome from executive.workflow_timer_firings f where f.timer_id = t.timer_id order by f.tick_key desc limit 1) as outcome
      from executive.workflow_timers t where t.owner_kind = 'service_case' and t.owner_id = ${caseId}::uuid order by t.created_at`);
  }
  async ledger(subjectIds: string[], limit: number): Promise<Row[]> {
    if (subjectIds.length === 0) return [];
    return this.rows(sql`select e.event_id::text, e.subject_kind, e.subject_id::text, e.version, e.event, e.actor_principal_id::text, e.details, e.occurred_at,
        (select p.display_name from identity.principals p where p.id = e.actor_principal_id) as actor_name
      from service.events e where e.subject_id = any(${subjectIds}::uuid[]) order by e.occurred_at, e.event_id limit ${lim(limit, 1000)}`);
  }
  async items(subjectId: string): Promise<Row[]> {
    return this.rows(sql`select i.item_id::text, i.signal_class, i.title, i.outcome, i.state, i.owner_principal_id::text, i.route_roles, i.policy_version, i.cause_event_type, i.details, i.created_at, i.closed_at
      from executive.attention_items i where i.subject_id = ${subjectId}::uuid and i.signal_class = 'service.case' order by i.created_at`);
  }
  async tasks(caseId: string): Promise<Row[]> {
    return this.rows(sql`select t.task_id::text, t.kind, t.title, t.state, t.assignee_principal_id::text, t.candidate_roles, t.outcome, t.opened_at, t.completed_at
      from executive.human_tasks t where t.subject @> ${j({ kind: 'service_case', id: caseId })}::jsonb order by t.opened_at`);
  }
  async grants(caseId: string): Promise<Row[]> {
    return this.rows(sql`select g.grant_id::text, g.engineer_principal_id::text, g.purpose, g.object_scope, g.action_scope, g.duration_minutes, g.state, g.requested_at, g.decided_at,
        g.starts_at, g.expires_at, g.ended_at, g.end_reason, (g.state = 'approved' and g.starts_at <= clock_timestamp() and clock_timestamp() < g.expires_at) as live
      from service.support_grants g where g.case_id = ${caseId}::uuid order by g.requested_at desc`);
  }
  async accessLog(caseId: string, limit: number): Promise<Row[]> {
    return this.rows(sql`select l.log_id::text, l.grant_id::text, l.principal_id::text, l.action, l.object_kind, l.object_id, l.outcome, l.detail, l.at
      from service.access_log l where l.object_id = ${caseId} or l.detail ->> 'case' = (select c.case_ref from service.cases c where c.case_id = ${caseId}::uuid)
      order by l.at desc limit ${lim(limit)}`);
  }
  async problems(): Promise<Row[]> {
    return this.rows(sql`select p.problem_id::text, p.problem_ref, p.title, p.statement, p.state, p.root_cause, p.version, p.opened_by::text, p.opened_at, p.closed_at, p.close_reason
      from service.problems p order by (p.state in ('resolved', 'closed')), p.opened_at desc`);
  }
  async problemCases(): Promise<Row[]> {
    return this.rows(sql`select pc.problem_id::text, pc.case_id::text, pc.reason, pc.linked_at, (select c.case_ref from service.cases c where c.case_id = pc.case_id) as case_ref from service.problem_cases pc order by pc.linked_at`);
  }
  async knownErrors(): Promise<Row[]> {
    return this.rows(sql`select k.known_error_id::text, k.problem_id::text, k.ke_ref, k.title, k.symptom, k.workaround, k.workaround_act, k.state, k.digest, k.published_at, k.retired_at, k.retire_reason,
        (select count(*)::int from service.known_error_uses u where u.known_error_id = k.known_error_id) as uses
      from service.known_errors k order by k.state, k.published_at desc`);
  }
  async knownErrorUses(): Promise<Row[]> {
    return this.rows(sql`select u.use_id::text, u.known_error_id::text, u.case_id::text, u.side, u.used_at, (select c.case_ref from service.cases c where c.case_id = u.case_id) as case_ref
      from service.known_error_uses u order by u.used_at`);
  }
  async changes(): Promise<Row[]> {
    return this.rows(sql`select x.change_id::text, x.problem_id::text, x.change_ref, x.title, x.description, x.expected_effect, x.state, x.version, x.proposed_by::text, x.proposed_at, x.decided_by::text,
        x.decided_at, x.decision_reason, x.implemented_at, x.verified_at, x.evidence
      from service.changes x order by x.proposed_at desc`);
  }
  async policies(): Promise<Row[]> {
    return this.rows(sql`select p.tier, p.severity, p.version, p.response_minutes, p.resolution_minutes, p.update_minutes, p.named_support, p.queue, p.digest, p.provenance
      from service.sla_policies p where p.status = 'active' order by p.tier, p.severity`);
  }
  async routingPreview(tenantId: string, domainId: string): Promise<Row> {
    const r = await this.rows<{ r: Row }>(sql`select service.routing_preview(${tenantId}::uuid, ${domainId}::uuid) as r`);
    return r[0]?.r ?? {};
  }
  async sweepCandidates(tenantId: string, domainId: string): Promise<{ commitments: string[]; objectives: Row[] }> {
    const r = await this.rows<{ r: { commitments: string[]; objectives: Row[] } }>(sql`select service.sla_sweep_candidates(${tenantId}::uuid, ${domainId}::uuid) as r`);
    return r[0]?.r ?? { commitments: [], objectives: [] };
  }
  async health(): Promise<Row[]> {
    return this.rows(sql`select distinct on (s.definition_id) s.snapshot_id::text, s.definition_id::text, s.definition_version, s.status, s.aggregate::float8 as aggregate, s.coverage::float8 as coverage,
        s.at, s.computed_at, s.formula_version
      from executive.health_score_snapshots s join executive.health_score_definitions d on d.definition_id = s.definition_id and d.state = 'active'
      where s.kind = 'current' order by s.definition_id, s.computed_at desc`);
  }
  async metricResults(prefix: 'ADP-' | null, excludePrefixes: string[]): Promise<Row[]> {
    return this.rows(sql`select d.metric_key, d.version, d.title, d.supported, d.k_min, r.result_id::text, r.state, r.value::float8 as value, r.unit, r.n, r.reasons, r.period_key, r.computed_at
      from analytics.metric_definitions d
      left join lateral (select * from analytics.metric_results x where x.definition_id = d.definition_id and not x.preview order by x.computed_at desc limit 1) r on true
      where d.state = 'approved' and (${prefix}::text is null or d.metric_key like ${prefix ?? ''} || '%')
        and not (d.metric_key like any (${excludePrefixes.map((p) => `${p}%`)}::text[]))
      order by d.metric_key limit 50`);
  }
  async valueStatus(tenantId: string, domainId: string): Promise<Row> {
    const r = await this.rows<{ r: Row }>(sql`select service.value_status(${tenantId}::uuid, ${domainId}::uuid) as r`);
    return r[0]?.r ?? {};
  }
  async entitlement(tenantId: string): Promise<Row | null> {
    const r = await this.rows<{ r: Row | null }>(sql`select commercial.entitlement_summary(${tenantId}::uuid) - 'matrix' - 'history' as r`);
    return r[0]?.r ?? null;
  }
  async valueReviews(): Promise<Row[]> {
    return this.rows(sql`select r.review_id::text, r.period_from::text as period_from, r.period_to::text as period_to, r.inputs_digest, r.outcomes, r.value_status, r.state, r.claim, r.digest,
        r.recorded_by::text, r.recorded_at, r.decided_by::text, r.decided_at, r.decision_note,
        (select p.display_name from identity.principals p where p.id = r.recorded_by) as recorded_by_name,
        (select p.display_name from identity.principals p where p.id = r.decided_by) as decided_by_name
      from service.value_reviews r order by r.recorded_at desc`);
  }
  async valueReview(reviewId: string): Promise<Row | null> {
    return (await this.rows<{ r: Row }>(sql`select to_jsonb(r) || jsonb_build_object('period_from', r.period_from::text, 'period_to', r.period_to::text) as r from service.value_reviews r where r.review_id = ${reviewId}::uuid`))[0]?.r ?? null;
  }

  async digest(v: unknown): Promise<string> {
    const r = await this.rows<{ d: string }>(sql`select onboarding.digest(${j(v)}::jsonb) as d`);
    return String(r[0]?.d ?? '');
  }

  // ── writes (ports) ──
  async openCase(a: Parameters<ServiceWrites['openCase']>[0]): Promise<Row> {
    return this.one(sql`select service.open_case(${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.title}, ${a.severity}, ${a.capability}, ${j(a.objects)}::jsonb, ${a.description},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'open_case');
  }
  async triage(a: Parameters<ServiceWrites['triage']>[0]): Promise<Row> {
    return this.one(sql`select service.triage_case(${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.expectedVersion}::int, ${a.severity}, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'triage_case');
  }
  async note(a: Parameters<ServiceWrites['note']>[0]): Promise<Row> {
    return this.one(sql`select service.note_case(${a.noteId}::uuid, ${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.body}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'note_case');
  }
  async progress(a: Parameters<ServiceWrites['progress']>[0]): Promise<Row> {
    return this.one(sql`select service.progress_case(${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.expectedVersion}::int, ${a.to}, ${a.statement}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'progress_case');
  }
  async proposeWorkaround(a: Parameters<ServiceWrites['proposeWorkaround']>[0]): Promise<Row> {
    return this.one(sql`select service.propose_workaround(${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.expectedVersion}::int, ${a.steps}, ${j(a.act)}::jsonb, ${a.risk},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_workaround');
  }
  async executeWorkaround(a: Parameters<ServiceWrites['executeWorkaround']>[0]): Promise<Row> {
    return this.one(sql`select service.record_workaround_execution(${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.expectedVersion}::int, ${a.policyDecisionId}::uuid, ${a.note},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_workaround_execution');
  }
  async reuseKnownError(a: Parameters<ServiceWrites['reuseKnownError']>[0]): Promise<Row> {
    return this.one(sql`select service.reuse_known_error(${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.expectedVersion}::int, ${a.knownErrorId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'reuse_known_error');
  }
  async assembleBundle(a: Parameters<ServiceWrites['assembleBundle']>[0]): Promise<Row> {
    return this.one(sql`select service.assemble_bundle(${a.bundleId}::uuid, ${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'assemble_bundle');
  }
  async confirmClosure(a: Parameters<ServiceWrites['confirmClosure']>[0]): Promise<Row> {
    return this.one(sql`select service.confirm_closure(${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.expectedVersion}::int, ${a.outcome}, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'confirm_closure');
  }
  async reopen(a: Parameters<ServiceWrites['reopen']>[0]): Promise<Row> {
    return this.one(sql`select service.reopen_case(${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.expectedVersion}::int, ${a.regression}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'reopen_case');
  }
  async supportRead(a: Parameters<ServiceWrites['supportRead']>[0]): Promise<Row> {
    return this.one(sql`select service.support_read_case(${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'support_read_case');
  }
  async recordCommitment(a: Parameters<ServiceWrites['recordCommitment']>[0]): Promise<Row> {
    return this.one(sql`select service.record_commitment(${a.commitmentId}::uuid, ${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.statement}, ${a.dueAt}::timestamptz,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_commitment');
  }
  async settleCommitment(a: Parameters<ServiceWrites['settleCommitment']>[0]): Promise<Row> {
    return this.one(sql`select service.settle_commitment(${a.commitmentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.outcome}, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'settle_commitment');
  }
  async openProblem(a: Parameters<ServiceWrites['openProblem']>[0]): Promise<Row> {
    return this.one(sql`select service.open_problem(${a.problemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.title}, ${a.statement}, ${a.cases}::uuid[], ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'open_problem');
  }
  async linkProblem(a: Parameters<ServiceWrites['linkProblem']>[0]): Promise<Row> {
    return this.one(sql`select service.link_problem(${a.problemId}::uuid, ${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'link_problem');
  }
  async publishKnownError(a: Parameters<ServiceWrites['publishKnownError']>[0]): Promise<Row> {
    return this.one(sql`select service.publish_known_error(${a.knownErrorId}::uuid, ${a.problemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.title}, ${a.symptom}, ${a.workaround}, ${j(a.act)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'publish_known_error');
  }
  async closeProblem(a: Parameters<ServiceWrites['closeProblem']>[0]): Promise<Row> {
    return this.one(sql`select service.close_problem(${a.problemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.outcome}, ${a.rootCause}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'close_problem');
  }
  async proposeChange(a: Parameters<ServiceWrites['proposeChange']>[0]): Promise<Row> {
    return this.one(sql`select service.propose_change(${a.changeId}::uuid, ${a.problemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.title}, ${a.description}, ${a.effect}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_change');
  }
  async decideChange(a: Parameters<ServiceWrites['decideChange']>[0]): Promise<Row> {
    return this.one(sql`select service.decide_change(${a.changeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.expectedVersion}::int, ${a.decision}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_change');
  }
  async recordChange(a: Parameters<ServiceWrites['recordChange']>[0]): Promise<Row> {
    return this.one(sql`select service.record_change(${a.changeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.outcome}, ${a.evidence}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_change');
  }
  async drill(a: Parameters<ServiceWrites['drill']>[0]): Promise<Row> {
    return this.one(sql`select service.drill_sla(${a.drillId}::uuid, ${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.objective}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'drill_sla');
  }
  async sweep(a: Parameters<ServiceWrites['sweep']>[0]): Promise<Row> {
    return this.one(sql`select service.sla_sweep(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'sla_sweep');
  }
  async recordValueReview(a: Parameters<ServiceWrites['recordValueReview']>[0]): Promise<Row> {
    return this.one(sql`select service.record_value_review(${a.reviewId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.from}::date, ${a.to}::date, ${j(a.inputs)}::jsonb, ${a.inputsDigest}, ${a.outcomes},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_value_review');
  }
  async decideValueReview(a: Parameters<ServiceWrites['decideValueReview']>[0]): Promise<Row> {
    return this.one(sql`select service.decide_value_review(${a.reviewId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.digest}, ${a.decision}, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_value_review');
  }
}

export const ServiceCapability = {
  read(tx: Tx, action: string): ServiceReads { return new ServiceCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): ServiceWrites { return new ServiceCapabilityImpl(tx, action); },
};

/** The SLA timer handler's call (inside the tick's transaction, bound to executive.attention.tick). */
export async function fireSlaTimer(tx: Tx, a: { timerId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row> {
  const r = await sql<{ r: Row }>`select service.fire_sla_timer(${a.timerId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`.execute(tx);
  return r.rows[0]?.r ?? {};
}
