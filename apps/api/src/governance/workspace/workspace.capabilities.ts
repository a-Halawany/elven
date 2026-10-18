/**
 * B107 §PG (0115_b107_x_pg) — THE WORKSPACE CAPABILITY: one class over the pipeline's transaction. Each write is a thin binding to a SECURITY
 * DEFINER port of governance.ws_* that asserts the route's own action, PLATFORM scope and the acting principal and re-checks every human,
 * role, separation-of-duties, expiry, hold and evidence rule; each read is a plain select under the caller's RLS (PLATFORM registry rows are
 * readable by every authenticated context) or a read function of the migration. Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);

export class WorkspaceCapability {
  readonly #tx: Tx; readonly #action: string;
  private constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  static of(tx: Tx, action: string): WorkspaceCapability { return new WorkspaceCapability(tx, action); }
  get tx(): Tx { return this.#tx; }
  get action(): string { return this.#action; }
  private async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.#tx)).rows as T[]; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (r === undefined || r === null) throw new Error(`${what} returned no row`);
    return r;
  }
  /** One SQL statement under the pipeline's bound action (the platform signer's capability — the port asserts the action). */
  async call<T>(q: ReturnType<typeof sql>): Promise<T[]> { return this.rows<T>(q); }
  async now(): Promise<string> { const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx); return (r.rows[0]?.now ?? new Date()).toISOString(); }

  // ───────────────────────── the caller ─────────────────────────
  /** Is the principal an ACTIVE HUMAN in the database (the session's claim is not the truth — the port reads the same)? */
  async isHuman(p: string): Promise<boolean> {
    return ((await sql<{ ok: boolean }>`select governance.ws_is_human(${p}::uuid) as ok`.execute(this.#tx)).rows[0]?.ok) === true;
  }
  /** The roles the principal holds LIVE at PLATFORM. */
  async platformRoles(p: string): Promise<string[]> {
    const r = await this.rows<{ code: string }>(sql`select distinct r.code from unnest(${['product_authority', 'design_system_authority', 'independent_assurance', 'operations_authority',
        'conformance_steward', 'platform_admin']}::text[]) r(code) where governance.holds_role(${p}::uuid, null, null, array[r.code]) order by 1`);
    return r.map((x) => x.code);
  }

  // ───────────────────────── reads ─────────────────────────
  inventory(): Promise<Row> { return this.one(sql`select governance.ws_inventory() as r`, 'ws_inventory'); }
  ageing(): Promise<Row> { return this.one(sql`select governance.ws_exception_ageing() as r`, 'ws_exception_ageing'); }
  posture(): Promise<Row> { return this.one(sql`select governance.ws_posture() as r`, 'ws_posture'); }
  trend(): Promise<Row> { return this.one(sql`select governance.ws_trend() as r`, 'ws_trend'); }
  impact(subjects: string[]): Promise<Row> { return this.one(sql`select governance.ws_impact(${subjects}::uuid[]) as r`, 'ws_impact'); }
  rightsResolve(subject: string, duty: string): Promise<Row> { return this.one(sql`select governance.ws_rights_resolve(${subject}, ${duty}) as r`, 'ws_rights_resolve'); }
  async rightsAllows(subject: string, duty: string, actor: string): Promise<{ governed: boolean; allowed: boolean; reason?: string }> {
    const r = await this.rightsResolve(subject, duty);
    if (r['governed'] !== true) return { governed: false, allowed: true };
    for (const x of (r['rows'] ?? []) as Row[]) {
      const role = String(x['role']);
      const holds = (await this.platformRoles(actor)).includes(role);
      if (typeof x['principal'] === 'string') {
        if (x['principal'] === actor && holds) return { governed: true, allowed: true };
        if (x['delegate_live'] === true && (x['delegate'] as Row)['to'] === actor && holds) return { governed: true, allowed: true };
      } else if (holds) return { governed: true, allowed: true };
    }
    return { governed: true, allowed: false, reason: `the approved decision-rights matrix ${String((r['matrix'] as Row)['ref'] ?? '')} v${String((r['matrix'] as Row)['version'] ?? '')} assigns ${duty} of ${subject} to someone else` };
  }
  async baselines(): Promise<Row[]> {
    return this.rows(sql`select b.baseline_id::text, b.version, b.ref, b.title, b.state, b.digest, b.gaps, b.scope_tuple, b.rights, b.exceptions, b.conflicts, b.holds, b.trend, b.domains,
        b.inventory -> 'count' as capabilities, b.proposed_by::text, governance.ws_principal_name(b.proposed_by) as proposed_by_name, b.proposed_at, b.decided_by::text,
        governance.ws_principal_name(b.decided_by) as decided_by_name, b.decided_at, b.decision_reason, b.signature_id::text, b.claim,
        governance.platform_signature_of('baseline_decision', b.baseline_id, b.version) as signatures
      from governance.ws_baselines b order by b.proposed_at desc, b.version desc limit 50`);
  }
  async baselineVersion(id: string, version: number): Promise<Row | null> {
    return (await this.rows(sql`select b.baseline_id::text, b.version, b.ref, b.title, b.state, b.digest, b.gaps, b.proposed_by::text, b.inventory -> 'count' as capabilities
      from governance.ws_baselines b where b.baseline_id = ${id}::uuid and b.version = ${version}::int`))[0] ?? null;
  }
  async owners(): Promise<Row[]> {
    return this.rows(sql`select o.capability_id::text, o.version, o.capability_key, o.owner_principal_id::text, governance.ws_principal_name(o.owner_principal_id) as owner_name, o.owner_role,
        o.domain_boundary, o.reason, o.assigned_by::text, governance.ws_principal_name(o.assigned_by) as assigned_by_name, o.assigned_at, o.superseded_at
      from governance.ws_capability_owners o order by o.capability_key, o.version desc limit 500`);
  }
  async rights(): Promise<Row[]> {
    return this.rows(sql`select r.matrix_id::text, r.version, r.ref, r.rows, r.digest, r.state, r.proposed_by::text, governance.ws_principal_name(r.proposed_by) as proposed_by_name, r.proposed_at,
        r.decided_by::text, governance.ws_principal_name(r.decided_by) as decided_by_name, r.decided_at, r.decision_reason, r.signature_id::text, r.claim,
        governance.platform_signature_of('decision_rights', r.matrix_id, r.version) as signatures
      from governance.ws_decision_rights r order by r.proposed_at desc, r.version desc limit 50`);
  }
  async rightsVersion(id: string, version: number): Promise<Row | null> {
    return (await this.rows(sql`select r.matrix_id::text, r.version, r.ref, r.state, r.digest, r.proposed_by::text from governance.ws_decision_rights r where r.matrix_id = ${id}::uuid and r.version = ${version}::int`))[0] ?? null;
  }
  async exceptions(): Promise<Row[]> {
    return this.rows(sql`select e.exception_id::text, e.version, e.ref, e.renewal_of, e.class, e.title, e.requirement_ref, e.requirement_artifact::text, e.contract_key, e.system_scope::text[],
        e.customer_scope, e.reason, e.evidence, e.risk, e.affected_invariants, e.compensating_controls, e.owner_principal_id::text, governance.ws_principal_name(e.owner_principal_id) as owner_name,
        e.expands_authority, e.removes_control, e.approver_roles, e.starts_at, e.expires_at, e.monitoring, e.exit_criteria, e.remediation_plan, e.affected_artifacts::text[], e.state,
        case when e.state = 'approved' and e.expires_at <= clock_timestamp() then 'expired (sweep pending)' else e.state end as effective_state,
        e.digest, e.proposed_by::text, governance.ws_principal_name(e.proposed_by) as proposed_by_name, e.proposed_at, e.decided_by::text, governance.ws_principal_name(e.decided_by) as decided_by_name,
        e.decided_role, e.decided_at, e.decision_reason, e.signature_id::text, e.expired_at, e.closed_by::text, e.closed_at, e.close_reason, e.claim,
        governance.platform_signature_of('exception_approval', e.exception_id, e.version) as signatures,
        (select coalesce(jsonb_agg(jsonb_build_object('hold_id', h.hold_id, 'subject', h.subject_artifact, 'subject_key', a.external_key, 'opened_at', h.opened_at, 'lifted_at', h.lifted_at,
                 'lift_reason', h.lift_reason) order by h.opened_at), '[]'::jsonb)
           from governance.holds h left join governance.artifacts a on a.artifact_id = h.subject_artifact and a.superseded_at is null
          where h.source_artifact = e.exception_id and h.reason_kind = 'exception_expired') as holds
      from governance.ws_exceptions e order by e.proposed_at desc, e.version desc limit 300`);
  }
  async exceptionVersion(id: string, version: number): Promise<Row | null> {
    return (await this.rows(sql`select e.exception_id::text, e.version, e.ref, e.state, e.digest, e.proposed_by::text, e.owner_principal_id::text, e.approver_roles, e.expires_at, e.contract_key,
        e.expands_authority, e.removes_control, e.renewal_of, e.affected_artifacts::text[], governance.ws_scope_owners(e.system_scope)::text[] as component_owners,
        (select r.ref from governance.ws_exception_reviews r where r.contract_key = e.contract_key and r.state = 'open') as open_review
      from governance.ws_exceptions e where e.exception_id = ${id}::uuid and e.version = ${version}::int`))[0] ?? null;
  }
  async reviews(): Promise<Row[]> {
    return this.rows(sql`select r.review_id::text, r.ref, r.contract_key, r.trigger, r.exceptions::text[], r.state, r.opened_by::text, r.opened_at, r.decided_by::text,
        governance.ws_principal_name(r.decided_by) as decided_by_name, r.decided_at, r.decision_reason, r.remediation, r.change_proposal::text
      from governance.ws_exception_reviews r order by r.opened_at desc limit 100`);
  }
  async conflicts(): Promise<Row[]> {
    return this.rows(sql`select c.conflict_id::text, c.ref, c.kind, c.title, c.description, c.conflicting::text[], c.ranking, c.highest_authority::text, c.impacted::text[], c.affected_releases::text[],
        c.last_conformant::text, (select a.external_key from governance.artifacts a where a.artifact_id = c.last_conformant and a.superseded_at is null) as last_conformant_key,
        c.holds, c.digest, c.state, c.raised_by::text, governance.ws_principal_name(c.raised_by) as raised_by_name, c.raised_at, c.resolved_by::text,
        governance.ws_principal_name(c.resolved_by) as resolved_by_name, c.resolved_at, c.resolution, c.signature_id::text, c.claim,
        governance.platform_signature_of('conflict_resolution', c.conflict_id, 1) as signatures
      from governance.ws_conflicts c order by c.raised_at desc limit 100`);
  }
  async conflict(id: string): Promise<Row | null> {
    return (await this.rows(sql`select c.conflict_id::text, c.ref, c.state, c.digest, c.raised_by::text, c.highest_authority::text, c.conflicting::text[] from governance.ws_conflicts c where c.conflict_id = ${id}::uuid`))[0] ?? null;
  }
  async changes(): Promise<Row[]> {
    return this.rows(sql`select c.proposal_id::text, c.version, c.ref, c.title, c.change_class, c.subjects::text[], c.description, c.plans, c.missing_plans, c.builders::text[], c.alters_identity,
        c.cross_volume, c.constitutional, c.required_roles, c.impact, c.impact_digest, c.digest, c.state, c.proposed_by::text, governance.ws_principal_name(c.proposed_by) as proposed_by_name,
        c.proposed_at, c.decided_at, c.decision_reason, c.claim,
        (select coalesce(jsonb_agg(jsonb_build_object('approver', a.approver, 'approver_name', governance.ws_principal_name(a.approver), 'role', a.role, 'decision', a.decision, 'reason', a.reason,
                 'signature_id', a.signature_id, 'decided_at', a.decided_at) order by a.decided_at), '[]'::jsonb)
           from governance.ws_change_approvals a where a.proposal_id = c.proposal_id and a.version = c.version) as approvals
      from governance.ws_change_proposals c order by c.proposed_at desc, c.version desc limit 100`);
  }
  async changeVersion(id: string, version: number): Promise<Row | null> {
    return (await this.rows(sql`select c.proposal_id::text, c.version, c.ref, c.state, c.digest, c.proposed_by::text, c.builders::text[], c.required_roles, c.missing_plans, c.subjects::text[], c.impact_digest,
        (select coalesce(array_agg(a.role), '{}') from governance.ws_change_approvals a where a.proposal_id = c.proposal_id and a.version = c.version and a.decision = 'approve') as approved_roles,
        (select coalesce(array_agg(a.approver::text), '{}') from governance.ws_change_approvals a where a.proposal_id = c.proposal_id and a.version = c.version) as deciders
      from governance.ws_change_proposals c where c.proposal_id = ${id}::uuid and c.version = ${version}::int`))[0] ?? null;
  }
  async records(): Promise<Row[]> {
    return this.rows(sql`select r.record_id::text, r.version, r.ref, r.kind, r.title, r.statement, r.owner_principal_id::text, governance.ws_principal_name(r.owner_principal_id) as owner_name,
        r.approving_role, r.dependencies::text[], r.review_cadence_days, r.supersedes_record::text, r.details, r.state, r.effective_from, r.next_review_due::text, r.last_reviewed_at, r.reviews,
        (r.state = 'active' and r.next_review_due < (clock_timestamp() at time zone 'UTC')::date) as review_overdue,
        r.digest, r.proposed_by::text, governance.ws_principal_name(r.proposed_by) as proposed_by_name, r.proposed_at, r.decided_by::text, governance.ws_principal_name(r.decided_by) as decided_by_name,
        r.decided_at, r.decision_reason, r.closure, r.closed_by::text, r.closed_at, r.claim
      from governance.ws_records r order by r.proposed_at desc, r.version desc limit 300`);
  }
  async recordVersion(id: string, version: number): Promise<Row | null> {
    return (await this.rows(sql`select r.record_id::text, r.version, r.ref, r.kind, r.state, r.digest, r.proposed_by::text, r.owner_principal_id::text, r.approving_role from governance.ws_records r
      where r.record_id = ${id}::uuid and r.version = ${version}::int`))[0] ?? null;
  }
  async holds(): Promise<Row[]> {
    return this.rows(sql`select h.hold_id::text, h.subject_artifact::text, a.kind as subject_kind, a.external_key as subject_key, a.title as subject_title, h.reason_kind, h.source_artifact::text,
        s.kind as source_kind, s.external_key as source_key, h.reason, h.opened_by::text, h.opened_at, h.lifted_at, h.lifted_by::text, governance.ws_principal_name(h.lifted_by) as lifted_by_name, h.lift_reason
      from governance.holds h left join governance.artifacts a on a.artifact_id = h.subject_artifact and a.superseded_at is null
        left join governance.artifacts s on s.artifact_id = h.source_artifact and s.superseded_at is null
      where h.scope = 'PLATFORM' order by (h.lifted_at is null) desc, h.opened_at desc limit 200`);
  }
  async releaseCandidates(): Promise<Row[]> {
    return this.rows(sql`select a.artifact_id::text, a.version, a.external_key, a.title, a.lifecycle, a.digest, a.effective_from, a.attributes,
        (select coalesce(jsonb_agg(jsonb_build_object('hold_id', h.hold_id, 'reason_kind', h.reason_kind, 'reason', h.reason, 'opened_at', h.opened_at) order by h.opened_at), '[]'::jsonb)
           from governance.holds h where h.subject_artifact = a.artifact_id and h.lifted_at is null) as open_holds
      from governance.artifacts a where a.kind = 'release_candidate' and a.superseded_at is null order by a.effective_from desc limit 50`);
  }
  async snapshots(): Promise<Row[]> {
    return this.rows(sql`select s.snapshot_id::text, s.seq, s.digest, s.posture -> 'summary' as summary, s.recorded_by::text, s.recorded_at from governance.ws_posture_snapshots s order by s.seq desc limit 20`);
  }
  async ledger(limit: number): Promise<Row[]> {
    return this.rows(sql`select e.event_id::text, e.subject_kind, e.subject_id::text, e.version, e.event, e.actor_principal_id::text, governance.ws_principal_name(e.actor_principal_id) as actor_name,
        e.details, e.occurred_at from governance.events e
      where e.scope = 'PLATFORM' and split_part(e.event, '.', 1) in ('baseline', 'rights', 'exception', 'conflict', 'change', 'record', 'posture') order by e.occurred_at desc limit ${limit}`);
  }
  async artifacts(ids: string[]): Promise<Row[]> {
    if (ids.length === 0) return [];
    return this.rows(sql`select a.artifact_id::text, a.version, a.kind, a.external_key, a.title, a.authority_class, a.controlling_volume, a.lifecycle from governance.artifacts a
      where a.artifact_id = any(${ids}::uuid[]) and a.superseded_at is null order by a.kind, a.external_key`);
  }

  // ───────────────────────── the ports ─────────────────────────
  assignOwner(a: { capabilityId: string; owner: string; ownerRole: string; domainBoundary: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_assign_owner(${a.capabilityId}::uuid, ${a.owner}::uuid, ${a.ownerRole}, ${a.domainBoundary}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_assign_owner');
  }
  proposeRights(a: { matrixId: string; rows: unknown[]; expectedVersion: number; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_propose_rights(${a.matrixId}::uuid, ${j(a.rows)}::jsonb, ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_propose_rights');
  }
  decideRights(a: { matrixId: string; version: number; decision: string; digest: string; reason: string; signatureId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_decide_rights(${a.matrixId}::uuid, ${a.version}::int, ${a.decision}, ${a.digest}, ${a.reason}, ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_decide_rights');
  }
  proposeBaseline(a: { baselineId: string; title: string; scope: Row; expectedVersion: number; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_propose_baseline(${a.baselineId}::uuid, ${a.title}, ${j(a.scope)}::jsonb, ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_propose_baseline');
  }
  decideBaseline(a: { baselineId: string; version: number; decision: string; digest: string; reason: string; signatureId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_decide_baseline(${a.baselineId}::uuid, ${a.version}::int, ${a.decision}, ${a.digest}, ${a.reason}, ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_decide_baseline');
  }
  proposeException(a: { exceptionId: string; body: Row; expectedVersion: number; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_propose_exception(${a.exceptionId}::uuid, ${j(a.body)}::jsonb, ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_propose_exception');
  }
  decideException(a: { exceptionId: string; version: number; decision: string; digest: string; reason: string; signatureId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_decide_exception(${a.exceptionId}::uuid, ${a.version}::int, ${a.decision}, ${a.digest}, ${a.reason}, ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_decide_exception');
  }
  withdrawException(a: { exceptionId: string; version: number; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_withdraw_exception(${a.exceptionId}::uuid, ${a.version}::int, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_withdraw_exception');
  }
  closeException(a: { exceptionId: string; version: number; evidence: unknown[]; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_close_exception(${a.exceptionId}::uuid, ${a.version}::int, ${j(a.evidence)}::jsonb, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_close_exception');
  }
  sweep(a: { action: string; t: string | null; d: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_sweep_exceptions(${a.action}, ${a.t}::uuid, ${a.d}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_sweep_exceptions');
  }
  decideReview(a: { reviewId: string; decision: string; body: Row; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_decide_review(${a.reviewId}::uuid, ${a.decision}, ${j(a.body)}::jsonb, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_decide_review');
  }
  raiseConflict(a: { conflictId: string; body: Row; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_raise_conflict(${a.conflictId}::uuid, ${j(a.body)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_raise_conflict');
  }
  resolveConflict(a: { conflictId: string; body: Row; digest: string; signatureId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_resolve_conflict(${a.conflictId}::uuid, ${j(a.body)}::jsonb, ${a.digest}, ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_resolve_conflict');
  }
  proposeChange(a: { proposalId: string; body: Row; expectedVersion: number; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_propose_change(${a.proposalId}::uuid, ${j(a.body)}::jsonb, ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_propose_change');
  }
  decideChange(a: { proposalId: string; version: number; decision: string; digest: string; reason: string; signatureId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_decide_change(${a.proposalId}::uuid, ${a.version}::int, ${a.decision}, ${a.digest}, ${a.reason}, ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_decide_change');
  }
  proposeRecord(a: { recordId: string; body: Row; expectedVersion: number; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_propose_record(${a.recordId}::uuid, ${j(a.body)}::jsonb, ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_propose_record');
  }
  decideRecord(a: { recordId: string; version: number; decision: string; digest: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_decide_record(${a.recordId}::uuid, ${a.version}::int, ${a.decision}, ${a.digest}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_decide_record');
  }
  reviewRecord(a: { recordId: string; version: number; note: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_review_record(${a.recordId}::uuid, ${a.version}::int, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_review_record');
  }
  closeRecord(a: { recordId: string; version: number; mode: string; evidence: unknown[]; successor: string | null; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_close_record(${a.recordId}::uuid, ${a.version}::int, ${a.mode}, ${j(a.evidence)}::jsonb, ${a.successor}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_close_record');
  }
  recordPosture(a: { actor: string; correlationId: string }) {
    return this.one(sql`select governance.ws_record_posture(${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ws_record_posture');
  }
}

export const WorkspaceCap = (tx: Tx, action: string): WorkspaceCapability => WorkspaceCapability.of(tx, action);
