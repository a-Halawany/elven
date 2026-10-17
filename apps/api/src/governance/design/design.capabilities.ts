/**
 * B107 §DG (0115_b107_x_dg) — THE DESIGN-GOVERNANCE CAPABILITY: one class over the pipeline's transaction. Each write is a thin binding to a
 * SECURITY DEFINER port of governance.dg_* that asserts the route's own action, the scope and the acting principal (and re-checks every
 * human, role and separation-of-duties rule); each read is a plain select under the caller's RLS (PLATFORM rows: the vendor's design system,
 * readable by every authenticated context; DOMAIN rows: the domain's design acceptances, intakes and packages) or a guarded definer read.
 * Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);

export class DesignCapability {
  readonly #tx: Tx; readonly #action: string;
  private constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  static of(tx: Tx, action: string): DesignCapability { return new DesignCapability(tx, action); }
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

  // ───────────────────────── PLATFORM reads (the vendor's design system) ─────────────────────────
  async authority(): Promise<Row[]> {
    return this.rows(sql`select b.principal_id::text, governance.dg_principal_name(b.principal_id) as name, p.kind from identity.role_bindings b join identity.principals p on p.id = b.principal_id
      where b.role_code = 'design_system_authority' and b.scope = 'PLATFORM' and b.revoked_at is null and p.status = 'active' order by 2`);
  }
  async baselines(): Promise<Row[]> {
    return this.rows(sql`select b.baseline_id::text, b.version, b.title, b.design_system_version, b.controlling_volume, b.refines, b.constitutional_change, b.conformance_scope, b.members, b.principles,
        b.exceptions, b.state, b.digest, b.proposed_by::text, governance.dg_principal_name(b.proposed_by) as proposed_by_name, b.proposed_at, b.decided_by::text,
        governance.dg_principal_name(b.decided_by) as decided_by_name, b.decided_at, b.decision_reason, b.signature_id::text,
        case when b.state = 'proposed' then governance.dg_baseline_blockers(b.baseline_id, b.version) else '[]'::jsonb end as blockers,
        (select to_jsonb(s) - 'scope' - 'tenant_id' - 'domain_id' from governance.signatures s where s.signature_id = b.signature_id) as signature
      from governance.design_baselines b order by b.baseline_id, b.version desc`);
  }
  async baselineVersion(id: string, version: number): Promise<Row | null> {
    return (await this.rows(sql`select b.baseline_id::text, b.version, b.state, b.digest, b.proposed_by::text, b.members, b.principles, b.exceptions, b.conformance_scope, b.design_system_version
      from governance.design_baselines b where b.baseline_id = ${id}::uuid and b.version = ${version}::int`))[0] ?? null;
  }
  async assets(): Promise<Row[]> {
    return this.rows(sql`select a.asset_id::text, a.version, a.kind, a.asset_key, a.title, a.source_ref, a.package_version, a.source_digest, a.consumers, a.owner_principal_id::text,
        governance.dg_principal_name(a.owner_principal_id) as owner_name, a.status, a.contribution_id::text, a.digest, a.registered_by::text, a.registered_at, a.approved_by::text,
        governance.dg_principal_name(a.approved_by) as approved_by_name, a.approved_at, a.approval_reason,
        (select count(*)::int from governance.design_assets h where h.asset_id = a.asset_id) as versions,
        (select coalesce(jsonb_agg(jsonb_build_object('hold_id', h.hold_id, 'reason_kind', h.reason_kind, 'reason', h.reason, 'opened_at', h.opened_at)), '[]'::jsonb)
           from governance.holds h where h.subject_artifact = a.asset_id and h.lifted_at is null) as holds
      from governance.design_assets a where a.superseded_at is null order by a.kind, a.asset_key`);
  }
  async asset(id: string): Promise<Row | null> {
    return (await this.rows(sql`select a.asset_id::text, a.version, a.asset_key, a.status, a.digest, a.registered_by::text, a.owner_principal_id::text from governance.design_assets a
      where a.asset_id = ${id}::uuid and a.superseded_at is null`))[0] ?? null;
  }
  async principles(): Promise<Row[]> {
    return this.rows(sql`select p.principle_id::text, p.version, p.principle_key, p.kind, p.statement, p.prohibited, p.affected_patterns, p.remediation, p.lint_rule, p.unwaivable, p.source, p.state,
        p.digest, p.declared_by::text, p.declared_at, p.reason from governance.design_principles p where p.state <> 'superseded' order by p.unwaivable desc, p.principle_key`);
  }
  async evaluations(limit: number): Promise<Row[]> {
    return this.rows(sql`select e.evaluation_id::text, e.source, e.target_asset_id::text, e.target_version, e.input_digest, e.rules_version, e.findings, e.verdict, e.counts, e.digest,
        e.evaluated_by::text, governance.dg_principal_name(e.evaluated_by) as evaluated_by_name, e.evaluated_by_kind, e.evaluated_at from governance.design_evaluations e order by e.evaluated_at desc limit ${limit}`);
  }
  async exceptions(): Promise<Row[]> {
    return this.rows(sql`select x.exception_id::text, x.principle_key, x.asset_id::text, a.asset_key, x.asset_version, x.reason, x.compensating, x.expires_at, x.renews::text, x.state,
        case when x.state = 'approved' and x.expires_at <= clock_timestamp() then 'expired' else x.state end as effective_state, x.digest, x.requested_by::text,
        governance.dg_principal_name(x.requested_by) as requested_by_name, x.requested_at, x.decided_by::text, governance.dg_principal_name(x.decided_by) as decided_by_name, x.decided_at,
        x.decision_reason, x.signature_id::text, (select a2.owner_principal_id::text from governance.design_assets a2 where a2.asset_id = x.asset_id and a2.version = x.asset_version) as asset_owner
      from governance.design_exceptions x left join governance.design_assets a on a.asset_id = x.asset_id and a.superseded_at is null order by x.requested_at desc`);
  }
  async exception(id: string): Promise<Row | null> {
    return (await this.rows(sql`select x.exception_id::text, x.state, x.digest, x.requested_by::text, x.expires_at,
        (select a.owner_principal_id::text from governance.design_assets a where a.asset_id = x.asset_id and a.version = x.asset_version) as asset_owner
      from governance.design_exceptions x where x.exception_id = ${id}::uuid`))[0] ?? null;
  }
  async contributions(): Promise<Row[]> {
    return this.rows(sql`select c.contribution_id::text, c.revision, c.kind, c.target_asset_id::text, c.target_version, (select a.asset_key from governance.design_assets a where a.asset_id = c.target_asset_id
        and a.superseded_at is null) as target_key, c.proposal, c.summary, c.plans, c.constitutional, c.origin, c.intake_id::text, c.stage, c.hold_reasons, c.review, c.evidence, c.digest,
        c.proposed_by::text, governance.dg_principal_name(c.proposed_by) as proposed_by_name, c.proposed_by_kind, c.proposed_at, c.builders::text[] as builders, c.reviewed_by::text,
        c.accepted_by::text, governance.dg_principal_name(c.accepted_by) as accepted_by_name, c.accepted_at, c.signature_id::text, c.published_version, c.closed_reason, c.updated_at,
        case when c.stage in ('proposed', 'held', 'in_review') then governance.dg_contribution_blockers(c) else '[]'::jsonb end as blockers,
        (select coalesce(jsonb_agg(jsonb_build_object('hold_id', h.hold_id, 'reason_kind', h.reason_kind, 'reason', h.reason, 'opened_at', h.opened_at)), '[]'::jsonb)
           from governance.holds h where h.subject_artifact = c.contribution_id and h.lifted_at is null) as holds
      from governance.design_contributions c order by c.updated_at desc`);
  }
  async contribution(id: string): Promise<Row | null> {
    return (await this.rows(sql`select c.contribution_id::text, c.revision, c.kind, c.stage, c.digest, c.proposed_by::text, c.builders::text[] as builders, c.constitutional,
        governance.dg_contribution_blockers(c) as blockers from governance.design_contributions c where c.contribution_id = ${id}::uuid`))[0] ?? null;
  }
  async holdsRole(principal: string, roles: string[], t: string | null = null, d: string | null = null): Promise<boolean> {
    const r = await sql<{ ok: boolean }>`select exists (select 1 from identity.role_bindings b where b.principal_id = ${principal}::uuid and b.revoked_at is null and b.role_code = any(${roles}::text[])
        and (b.scope = 'PLATFORM' or (b.scope = 'TENANT' and b.tenant_id = ${t}::uuid) or (b.scope = 'DOMAIN' and b.domain_id = ${d}::uuid))) as ok`.execute(this.#tx);
    return r.rows[0]?.ok === true;
  }
  async conformance(): Promise<Row> { return this.one(sql`select governance.dg_conformance() as r`, 'dg_conformance'); }
  async orphans(): Promise<Row> { return this.one(sql`select governance.dg_orphans() as r`, 'dg_orphans'); }
  async trace(artifactId: string, depth: number): Promise<Row> { return this.one(sql`select governance.dg_trace(${artifactId}::uuid, ${depth}::int) as r`, 'dg_trace'); }
  async artifact(id: string): Promise<Row | null> {
    return (await this.rows(sql`select a.artifact_id::text, a.kind, a.external_key, a.title, a.lifecycle, a.version, a.scope from governance.artifacts a where a.artifact_id = ${id}::uuid and a.superseded_at is null`))[0] ?? null;
  }
  async findArtifacts(q: string, limit: number): Promise<Row[]> {
    return this.rows(sql`select a.artifact_id::text, a.kind, a.external_key, a.title, a.lifecycle from governance.artifacts a where a.superseded_at is null
      and (a.external_key ilike ${'%' + q + '%'} or a.title ilike ${'%' + q + '%'}) order by a.kind, a.external_key limit ${limit}`);
  }
  async ledger(limit: number): Promise<Row[]> {
    return this.rows(sql`select e.event_id::text, e.scope, e.subject_kind, e.subject_id::text, e.version, e.event, e.actor_principal_id::text, governance.dg_principal_name(e.actor_principal_id) as actor_name,
        e.details, e.occurred_at from governance.events e where e.event like 'design.%' order by e.occurred_at desc limit ${limit}`);
  }

  // ───────────────────────── DOMAIN reads (the domain's design acceptances, intakes and packages) ─────────────────────────
  async acceptances(): Promise<Row[]> {
    return this.rows(sql`select r.acceptance_id::text, r.version, r.baseline_id::text, r.baseline_version, r.baseline_digest, r.components, r.tuple, r.evidence, r.findings, r.conditions, r.accessibility,
        r.obligations, r.attestations, r.builders::text[] as builders, r.valid_until, r.state, r.withheld_reason, r.withheld_at, r.claim, r.digest, r.proposed_by::text,
        governance.dg_principal_name(r.proposed_by) as proposed_by_name, r.proposed_at, r.accepted_at,
        executive.signature_of('design_acceptance', r.acceptance_id, r.version) as signatures
      from governance.design_acceptances r order by r.acceptance_id, r.version desc`);
  }
  async acceptanceVersion(id: string, version: number): Promise<Row | null> {
    return (await this.rows(sql`select r.acceptance_id::text, r.version, r.state, r.digest, r.proposed_by::text, r.builders::text[] as builders, r.obligations, r.attestations, r.valid_until, r.evidence
      from governance.design_acceptances r where r.acceptance_id = ${id}::uuid and r.version = ${version}::int`))[0] ?? null;
  }
  async intakes(): Promise<Row[]> {
    return this.rows(sql`select i.intake_id::text, i.action_id::text, i.finding_id::text, i.journey_key, i.statement, i.preview_digest, i.decided_by::text, governance.dg_principal_name(i.decided_by) as decided_by_name,
        i.decided_at, i.contribution_id::text, (select c.stage from governance.design_contributions c where c.contribution_id = i.contribution_id) as contribution_stage,
        i.intaken_by::text, i.intaken_by_kind, i.intaken_at from governance.design_experience_intakes i order by i.intaken_at desc`);
  }
  async pendingActions(): Promise<Row[]> {
    return this.rows(sql`select a.action_id::text, a.finding_id::text, a.kind, a.decided_at, f.journey_key from analytics.experience_actions a join analytics.experience_findings f on f.finding_id = a.finding_id
      where a.decision = 'act' and a.kind = 'design_change_proposal' and not exists (select 1 from governance.design_experience_intakes i where i.action_id = a.action_id) order by a.decided_at`);
  }
  async packages(limit: number): Promise<Row[]> {
    return this.rows(sql`select k.package_id::text, k.target, k.acceptance_id::text, k.acceptance_version, k.digest, k.signed, k.signature_required, k.claim, k.generated_by::text,
        governance.dg_principal_name(k.generated_by) as generated_by_name, k.generated_by_kind, k.generated_at, jsonb_array_length(k.content -> 'evidence') as evidence_count,
        jsonb_array_length(k.content -> 'findings') as findings_count from governance.design_conformance_packages k order by k.generated_at desc limit ${limit}`);
  }
  async package(id: string): Promise<Row | null> {
    return (await this.rows(sql`select k.package_id::text, k.target, k.acceptance_id::text, k.acceptance_version, k.content, k.digest, k.signed, k.signature_required, k.claim, k.generated_by::text,
        k.generated_at from governance.design_conformance_packages k where k.package_id = ${id}::uuid`))[0] ?? null;
  }
  async telemetryEvidence(t: string, d: string): Promise<Row> { return this.one(sql`select governance.dg_telemetry_evidence(${t}::uuid, ${d}::uuid) as r`, 'dg_telemetry_evidence'); }
  async attestedBaseline(): Promise<Row | null> {
    return (await this.rows(sql`select b.baseline_id::text, b.version, b.title, b.digest, b.design_system_version, b.members, b.conformance_scope, b.decided_at from governance.design_baselines b
      where b.state = 'attested' order by b.decided_at desc limit 1`))[0] ?? null;
  }
  async accessibilitySlots(): Promise<Row> { return this.one(sql`select governance.dg_accessibility_slots() as r`, 'dg_accessibility_slots'); }

  // ───────────────────────── the ports ─────────────────────────
  registerAssets(a: { importId: string; assets: Row[]; source: Row; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_register_assets(${a.importId}::uuid, ${j(a.assets)}::jsonb, ${j(a.source)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dg_register_assets');
  }
  approveAsset(a: { assetId: string; version: number; owner: string; digest: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_approve_asset(${a.assetId}::uuid, ${a.version}::int, ${a.owner}::uuid, ${a.digest}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dg_approve_asset');
  }
  declarePrinciple(a: { key: string; expectedVersion: number; kind: string; statement: string; prohibited: string | null; patterns: string[]; remediation: string; lintRule: string | null;
                        unwaivable: boolean; state: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_declare_principle(${a.key}, ${a.expectedVersion}::int, ${a.kind}, ${a.statement}, ${a.prohibited}, ${a.patterns}::text[], ${a.remediation}, ${a.lintRule},
      ${a.unwaivable}, ${a.state}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dg_declare_principle');
  }
  recordEvaluation(a: { evaluationId: string; source: string; assetId: string | null; assetVersion: number | null; inputDigest: string; rulesVersion: string; findings: unknown[]; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_record_evaluation(${a.evaluationId}::uuid, ${a.source}, ${a.assetId}::uuid, ${a.assetVersion}::int, ${a.inputDigest}, ${a.rulesVersion}, ${j(a.findings)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dg_record_evaluation');
  }
  requestException(a: { exceptionId: string; principle: string; assetId: string; reason: string; compensating: string; expiresAt: string; renews: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_request_exception(${a.exceptionId}::uuid, ${a.principle}, ${a.assetId}::uuid, ${a.reason}, ${a.compensating}, ${a.expiresAt}::timestamptz, ${a.renews}::uuid,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dg_request_exception');
  }
  decideException(a: { exceptionId: string; decision: string; digest: string; reason: string; signatureId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_decide_exception(${a.exceptionId}::uuid, ${a.decision}, ${a.digest}, ${a.reason}, ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dg_decide_exception');
  }
  proposeContribution(a: { id: string; kind: string; target: string | null; proposal: Row; summary: string; plans: Row; constitutional: boolean; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_propose_contribution(${a.id}::uuid, ${a.kind}, ${a.target}::uuid, ${j(a.proposal)}::jsonb, ${a.summary}, ${j(a.plans)}::jsonb, ${a.constitutional},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dg_propose_contribution');
  }
  amendContribution(a: { id: string; revision: number; target: string | null; proposal: Row; summary: string; plans: Row; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_amend_contribution(${a.id}::uuid, ${a.revision}::int, ${a.target}::uuid, ${j(a.proposal)}::jsonb, ${a.summary}, ${j(a.plans)}::jsonb, ${a.actor}::uuid,
      ${a.correlationId}::uuid) as r`, 'dg_amend_contribution');
  }
  advanceContribution(a: { id: string; step: string; revision: number; digest: string | null; reason: string; evidence: Row; signatureId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_advance_contribution(${a.id}::uuid, ${a.step}, ${a.revision}::int, ${a.digest}, ${a.reason}, ${j(a.evidence)}::jsonb, ${a.signatureId}::uuid,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dg_advance_contribution');
  }
  proposeBaseline(a: { baselineId: string; expectedVersion: number; title: string; dsv: string; scope: Row; members: string[]; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_propose_baseline(${a.baselineId}::uuid, ${a.expectedVersion}::int, ${a.title}, ${a.dsv}, ${j(a.scope)}::jsonb, ${a.members}::uuid[], ${a.actor}::uuid,
      ${a.correlationId}::uuid) as r`, 'dg_propose_baseline');
  }
  decideBaseline(a: { baselineId: string; version: number; decision: string; digest: string; reason: string; signatureId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_decide_baseline(${a.baselineId}::uuid, ${a.version}::int, ${a.decision}, ${a.digest}, ${a.reason}, ${a.signatureId}::uuid, ${a.actor}::uuid,
      ${a.correlationId}::uuid) as r`, 'dg_decide_baseline');
  }
  recordLink(a: { from: string | null; to: string | null; relation: string | null; retire: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_record_link(${a.from}::uuid, ${a.to}::uuid, ${a.relation}, ${a.retire}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dg_record_link');
  }
  intake(a: { t: string; d: string; actionId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_intake_experience(${a.t}::uuid, ${a.d}::uuid, ${a.actionId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dg_intake_experience');
  }
  proposeAcceptance(a: { id: string; t: string; d: string; expectedVersion: number; baselineId: string; components: string[]; tuple: Row; evidence: unknown[]; findings: unknown[]; conditions: unknown[];
                         obligations: string[]; builders: string[]; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_propose_acceptance(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.expectedVersion}::int, ${a.baselineId}::uuid, ${a.components}::uuid[], ${j(a.tuple)}::jsonb,
      ${j(a.evidence)}::jsonb, ${j(a.findings)}::jsonb, ${j(a.conditions)}::jsonb, ${a.obligations}::text[], ${a.builders}::uuid[], ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dg_propose_acceptance');
  }
  attestAcceptance(a: { id: string; version: number; t: string; d: string; obligation: string; digest: string; reason: string; signatureId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_attest_acceptance(${a.id}::uuid, ${a.version}::int, ${a.t}::uuid, ${a.d}::uuid, ${a.obligation}, ${a.digest}, ${a.reason}, ${a.signatureId}::uuid,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dg_attest_acceptance');
  }
  sweepAcceptances(a: { t: string; d: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_sweep_acceptances(${a.t}::uuid, ${a.d}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dg_sweep_acceptances');
  }
  generatePackage(a: { id: string; t: string; d: string; target: string; acceptanceId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dg_generate_package(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.target}, ${a.acceptanceId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dg_generate_package');
  }
}

export const DesignCap = (tx: Tx, action: string): DesignCapability => DesignCapability.of(tx, action);
