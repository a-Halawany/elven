/**
 * B94 §SA (0114_b94_x_sa) — THE SUPPORT CAPABILITY: one class over the pipeline's transaction. Each write is a thin binding to a SECURITY
 * DEFINER port of service.* that asserts the route's own action, the scope and the acting principal (and re-checks every human, role and
 * separation-of-duties rule); each read is a plain select under the caller's RLS (or a guarded definer read). Nothing here decides a rule a
 * port decides.
 */
/* B94 act-found (2026-10-13): every actor name below is read through products.catalog_principal_name (0095 §K.3: SECURITY DEFINER, this tenant's
   principals only). A DOMAIN-scoped read cannot see a TENANT-homed principal under identity.principals' RLS, so the implementation lead's,
   the onboarding authority's and the sponsor's names read blank on the domain pages ("approved by  at …"). */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);

export class SupportCapability {
  readonly #tx: Tx; readonly #action: string;
  private constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  static of(tx: Tx, action: string): SupportCapability { return new SupportCapability(tx, action); }
  get tx(): Tx { return this.#tx; }
  get action(): string { return this.#action; }
  private async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.#tx)).rows as T[]; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (r === undefined || r === null) throw new Error(`${what} returned no row`);
    return r;
  }
  /** One SQL statement under the pipeline's bound action (the signer's capability — the port asserts the action). */
  async call<T>(q: ReturnType<typeof sql>): Promise<T[]> { return this.rows<T>(q); }
  async now(): Promise<string> { const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx); return (r.rows[0]?.now ?? new Date()).toISOString(); }

  // ───────────────────────── B94-F: the coordination of approval and automatic revocation ─────────────────────────
  /** The per-engineer transaction lock (B94-F): taken by an APPROVAL before the port admits the grant, and by the AUTOMATIC revocation before
   *  it decides — so the revocation decides on the engineer's grants as they stand when it acts: an approval that committed first is seen
   *  (the sessions are kept for it); one that comes later waits until the revocation has committed (its sessions are opened after it). */
  async lockEngineer(engineer: string): Promise<void> {
    await sql`select pg_advisory_xact_lock(hashtextextended(${`service.support.engineer:${engineer}`}, 0))`.execute(this.#tx);
  }
  /** The engineer a grant names (RLS: this domain's grants), or null. */
  async engineerOfGrant(grantId: string): Promise<string | null> {
    return ((await sql<{ e: string }>`select engineer_principal_id::text as e from service.support_grants where grant_id = ${grantId}::uuid`.execute(this.#tx)).rows[0]?.e) ?? null;
  }
  /** The engineer's live grant in the domain (approved, started, unexpired on the database clock), or null. */
  async liveGrantOf(t: string, d: string, engineer: string): Promise<string | null> {
    return ((await sql<{ g: string | null }>`select (select g.grant_id::text from service.support_grants g where g.tenant_id = ${t}::uuid and g.domain_id = ${d}::uuid
        and g.engineer_principal_id = ${engineer}::uuid and g.state = 'approved' and g.starts_at <= clock_timestamp() and clock_timestamp() < g.expires_at
        order by g.expires_at desc limit 1) as g`.execute(this.#tx)).rows[0]?.g) ?? null;
  }

  // ───────────────────────── reads (RLS) ─────────────────────────
  async matrices(profile: string | null): Promise<Row[]> {
    return this.rows(sql`select m.matrix_id::text, m.version, m.tenant_id::text, m.domain_id::text, m.programme_id::text, m.deployment_profile, m.state, m.digest, m.proposed_by::text,
        m.proposed_at, m.decided_by::text, m.decided_at, m.decision_reason, m.signature_id::text, m.support_boundary, m.row_count, m.correlation_id::text,
        products.catalog_principal_name(m.proposed_by) as proposed_by_name,
        products.catalog_principal_name(m.decided_by) as decided_by_name,
        (select coalesce(jsonb_agg(to_jsonb(r) - 'tenant_id' - 'domain_id' - 'matrix_id' - 'version' order by r.responsibility_key), '[]'::jsonb) from service.responsibility_rows r
          where r.matrix_id = m.matrix_id and r.version = m.version) as rows,
        executive.signature_of('responsibility_matrix', m.matrix_id, m.version) as signatures
      from service.responsibility_matrices m where (${profile}::text is null or m.deployment_profile = ${profile}) order by m.deployment_profile, m.version desc`);
  }
  async matrixVersion(matrixId: string, version: number): Promise<Row | null> {
    return (await this.rows(sql`select m.matrix_id::text, m.version, m.state, m.digest, m.proposed_by::text, m.deployment_profile from service.responsibility_matrices m
      where m.matrix_id = ${matrixId}::uuid and m.version = ${version}::int`))[0] ?? null;
  }
  async ownerResolution(t: string, d: string, key: string, profile: string): Promise<Row> {
    return this.one(sql`select service.owner_resolution(${t}::uuid, ${d}::uuid, ${key}, ${profile}) as r`, 'owner_resolution');
  }
  async observe(t: string, d: string, profile: string): Promise<Row> {
    return this.one(sql`select service.observe_responsibility(${t}::uuid, ${d}::uuid, ${profile}) as r`, 'observe_responsibility');
  }
  async reconciliations(limit: number): Promise<Row[]> {
    return this.rows(sql`select e.event_id::text, e.deployment_profile, e.matrix_id::text, e.matrix_version, e.desired_digest, e.observed_digest, e.findings, e.gaps, e.drift, e.items,
        e.recorded_by::text, e.recorded_at from service.reconciliation_events e order by e.recorded_at desc limit ${limit}`);
  }
  async grants(limit: number, engineer: string | null): Promise<Row[]> {
    return this.rows(sql`select g.grant_id::text, g.case_id::text, c.case_ref, c.severity, c.title as case_title, c.state as case_state, g.engineer_principal_id::text,
        products.catalog_principal_name(g.engineer_principal_id) as engineer_name, g.purpose, g.object_scope, g.action_scope, g.duration_minutes,
        g.state, g.requested_at, g.decided_by::text, products.catalog_principal_name(g.decided_by) as decided_by_name, g.decided_at, g.decision_reason,
        g.starts_at, g.expires_at, g.ended_at, g.ended_by::text, g.end_reason, g.request_digest, g.expiry_timer_id::text, g.review_task_id::text, g.preview,
        (select count(*)::int from service.access_log l where l.grant_id = g.grant_id and l.outcome = 'allowed') as reads_allowed,
        (select count(*)::int from service.access_log l where l.grant_id = g.grant_id and l.outcome = 'refused') as reads_refused
      from service.support_grants g join service.cases c on c.case_id = g.case_id
      where (${engineer}::uuid is null or g.engineer_principal_id = ${engineer}::uuid) order by g.requested_at desc limit ${limit}`);
  }
  async grant(grantId: string): Promise<Row | null> {
    return (await this.rows(sql`select g.grant_id::text, g.case_id::text, c.case_ref, c.severity, c.title as case_title, c.state as case_state, g.engineer_principal_id::text,
        products.catalog_principal_name(g.engineer_principal_id) as engineer_name, g.purpose, g.object_scope, g.action_scope, g.duration_minutes, g.state,
        g.requested_at, g.decided_by::text, g.decided_at, g.starts_at, g.expires_at, g.ended_at, g.end_reason, g.request_digest, g.preview,
        (select coalesce(jsonb_agg(jsonb_build_object('source_id', s.source_id, 'name', s.name, 'source_key', s.source_key) order by s.name), '[]'::jsonb)
           from observation.source_contracts_current s where s.source_id in (select x::uuid from jsonb_array_elements_text(g.object_scope -> 'sources') x)) as sources
      from service.support_grants g join service.cases c on c.case_id = g.case_id where g.grant_id = ${grantId}::uuid`))[0] ?? null;
  }
  async holdsRole(principal: string, t: string, d: string, roles: string[]): Promise<boolean> {
    const r = await sql<{ ok: boolean }>`select exists (select 1 from identity.role_bindings b join identity.principals p on p.id = b.principal_id
        where b.principal_id = ${principal}::uuid and p.status = 'active' and b.revoked_at is null and b.role_code = any(${roles}::text[]) and b.tenant_id = ${t}::uuid
          and (b.scope = 'TENANT' or b.domain_id = ${d}::uuid)) as ok`.execute(this.#tx);
    return r.rows[0]?.ok === true;
  }
  async accessLog(limit: number, grantId: string | null): Promise<Row[]> {
    return this.rows(sql`select l.log_id::text, l.grant_id::text, l.principal_id::text, products.catalog_principal_name(l.principal_id) as principal_name,
        l.action, l.object_kind, l.object_id, l.outcome, l.detail, l.at from service.access_log l where (${grantId}::uuid is null or l.grant_id = ${grantId}::uuid) order by l.at desc limit ${limit}`);
  }
  async drills(limit: number): Promise<Row[]> {
    return this.rows(sql`select d.drill_id::text, d.kind, d.grant_id::text, d.reason, d.outcome, d.evidence, d.run_by::text, d.run_at from service.control_drills d order by d.run_at desc limit ${limit}`);
  }
  async exercises(limit: number): Promise<Row[]> {
    return this.rows(sql`select e.exercise_id::text, e.title, e.scenario, e.held_on::text, e.customer_participants, e.vendor_participants, e.outcome, e.findings, e.evidence_refs, e.claim,
        e.recorded_by::text, e.recorded_at from service.joint_exercises e order by e.held_on desc, e.recorded_at desc limit ${limit}`);
  }
  async admissions(limit: number): Promise<Row[]> {
    return this.rows(sql`select a.admission_id::text, a.version, a.deployment_profile, a.period_from::text, a.period_to::text, a.baseline_digest, a.matrix, a.grant_ledger, a.drills, a.exercises,
        a.digest, a.state, a.production_admission, a.proposed_by::text, a.proposed_at, a.decided_by::text, a.decided_at, a.decision_reason, a.signature_id::text,
        executive.signature_of('admission_record', a.admission_id, a.version) as signatures
      from service.admission_records a order by a.proposed_at desc, a.version desc limit ${limit}`);
  }
  async admissionVersion(admissionId: string, version: number): Promise<Row | null> {
    return (await this.rows(sql`select a.admission_id::text, a.version, a.state, a.digest from service.admission_records a where a.admission_id = ${admissionId}::uuid and a.version = ${version}::int`))[0] ?? null;
  }
  async ledger(limit: number): Promise<Row[]> {
    return this.rows(sql`select e.event_id::text, e.subject_kind, e.subject_id::text, e.version, e.event, e.actor_principal_id::text, e.details, e.occurred_at from service.events e
      where e.subject_kind in ('responsibility_matrix', 'support_grant', 'control_drill', 'joint_exercise', 'admission_record', 'reconciliation') order by e.occurred_at desc limit ${limit}`);
  }
  async items(): Promise<Row[]> {
    return this.rows(sql`select i.item_id::text, i.signal_class, i.subject_kind, i.subject_id::text, i.title, i.state, i.outcome, i.owner_principal_id::text, i.route_roles, i.details, i.created_at
      from executive.attention_items i where i.signal_class in ('support.access', 'responsibility.gap') and i.state <> 'closed' order by i.created_at desc limit 100`);
  }
  async residency(t: string, d: string): Promise<Row> {
    return (await this.rows(sql`select (select t0.residency_profile from tenancy.tenants t0 where t0.id = ${t}::uuid) as tenant_residency,
        (select d0.residency_profile from tenancy.domains d0 where d0.id = ${d}::uuid) as domain_residency, (select d0.status from tenancy.domains d0 where d0.id = ${d}::uuid) as domain_status`))[0] ?? {};
  }
  async cases(): Promise<Row[]> {
    return this.rows(sql`select c.case_id::text, c.case_ref, c.title, c.severity, c.state, c.affected_capability, c.object_refs, c.routing ->> 'tier' as tier from service.cases c
      where c.state <> 'closed' order by c.opened_at desc limit 50`);
  }

  // ───────────────────────── the ports ─────────────────────────
  proposeMatrix(a: { matrixId: string | null; t: string; d: string; programmeId: string | null; profile: string; rows: Row[]; expectedVersion: number; actor: string; correlationId: string }) {
    return this.one(sql`select service.propose_matrix(${a.matrixId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.programmeId}::uuid, ${a.profile}, ${j(a.rows)}::jsonb, ${a.expectedVersion}::int,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_matrix');
  }
  decideMatrix(a: { matrixId: string; version: number; t: string; d: string; decision: string; digest: string; reason: string; signatureId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select service.decide_matrix(${a.matrixId}::uuid, ${a.version}::int, ${a.t}::uuid, ${a.d}::uuid, ${a.decision}, ${a.digest}, ${a.reason}, ${a.signatureId}::uuid,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_matrix');
  }
  recordReconciliation(a: { eventId: string; t: string; d: string; profile: string; observed: Row; findings: unknown[]; actor: string; correlationId: string }) {
    return this.one(sql`select service.record_reconciliation(${a.eventId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.profile}, ${j(a.observed)}::jsonb, ${j(a.findings)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_reconciliation');
  }
  requestGrant(a: { grantId: string; t: string; d: string; caseId: string; purpose: string; sources: string[]; actions: string[]; minutes: number; actor: string; correlationId: string }) {
    return this.one(sql`select service.request_support_grant(${a.grantId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.caseId}::uuid, ${a.purpose}, ${j({ sources: a.sources })}::jsonb,
      ${a.actions}::text[], ${a.minutes}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'request_support_grant');
  }
  decideGrant(a: { grantId: string; t: string; d: string; decision: string; digest: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select service.decide_support_grant(${a.grantId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.decision}, ${a.digest}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_support_grant');
  }
  revokeGrant(a: { grantId: string; t: string; d: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select service.revoke_support_grant(${a.grantId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'revoke_support_grant');
  }
  withdrawGrant(a: { grantId: string; t: string; d: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select service.withdraw_support_grant(${a.grantId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'withdraw_support_grant');
  }
  lapseByTimer(a: { timerId: string; t: string; d: string; actor: string; correlationId: string }) {
    return this.one(sql`select service.lapse_support_grant(${a.timerId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'lapse_support_grant');
  }
  sweep(a: { t: string; d: string; actor: string; correlationId: string }) {
    return this.one(sql`select service.sweep_support_grants(${a.t}::uuid, ${a.d}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'sweep_support_grants');
  }
  reconciliationDue(t: string, d: string, profile: string) {
    return this.one(sql`select service.reconciliation_due(${t}::uuid, ${d}::uuid, ${profile}) as r`, 'reconciliation_due');
  }
  async accessPending(t: string, d: string): Promise<Row[]> {
    const r = await sql<{ r: Row[] }>`select service.support_access_pending(${t}::uuid, ${d}::uuid) as r`.execute(this.#tx);
    return r.rows[0]?.r ?? [];
  }
  diagnose(a: { t: string; d: string; caseId: string | null; sourceId: string; actor: string; correlationId: string }) {
    return this.one(sql`select service.diagnose(${a.t}::uuid, ${a.d}::uuid, ${a.caseId}::uuid, ${a.sourceId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'diagnose');
  }
  runDrill(a: { drillId: string; t: string; d: string; kind: string; grantId: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select service.run_control_drill(${a.drillId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.kind}, ${a.grantId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'run_control_drill');
  }
  recordExercise(a: { exerciseId: string; t: string; d: string; title: string; scenario: string; heldOn: string; customer: string[]; vendor: string[]; outcome: string; findings: string | null;
                      evidence: unknown[]; actor: string; correlationId: string }) {
    return this.one(sql`select service.record_joint_exercise(${a.exerciseId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.title}, ${a.scenario}, ${a.heldOn}::date, ${a.customer}::uuid[], ${a.vendor}::uuid[],
      ${a.outcome}, ${a.findings}, ${j(a.evidence)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_joint_exercise');
  }
  proposeAdmission(a: { admissionId: string; t: string; d: string; profile: string; from: string; to: string; baselineDigest: string; exercises: string[]; expectedVersion: number; actor: string; correlationId: string }) {
    return this.one(sql`select service.propose_admission(${a.admissionId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.profile}, ${a.from}::date, ${a.to}::date, ${a.baselineDigest}, ${a.exercises}::uuid[],
      ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_admission');
  }
  decideAdmission(a: { admissionId: string; version: number; t: string; d: string; decision: string; digest: string; reason: string; signatureId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select service.decide_admission(${a.admissionId}::uuid, ${a.version}::int, ${a.t}::uuid, ${a.d}::uuid, ${a.decision}, ${a.digest}, ${a.reason}, ${a.signatureId}::uuid,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_admission');
  }
}

export const SupportCap = (tx: Tx, action: string): SupportCapability => SupportCapability.of(tx, action);
