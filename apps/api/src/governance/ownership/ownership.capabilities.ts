/**
 * B107 §DR (0115_b107_x_dr) — THE OWNERSHIP CAPABILITY: one class over the pipeline's transaction. Each write is a thin binding to a SECURITY
 * DEFINER port of governance.dr_* (or products.* for the carried B90 residuals) that asserts the route's own action, the scope and the acting
 * principal, and re-checks every human, role and separation-of-duties rule; each read is a guarded definer read (N-01) or a plain select under
 * the caller's RLS. Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);

export class OwnershipCapability {
  readonly #tx: Tx; readonly #action: string;
  private constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  static of(tx: Tx, action: string): OwnershipCapability { return new OwnershipCapability(tx, action); }
  get tx(): Tx { return this.#tx; }
  get action(): string { return this.#action; }
  private async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.#tx)).rows as T[]; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (r === undefined || r === null) throw new Error(`${what} returned no row`);
    return r;
  }
  private async maybe(q: ReturnType<typeof sql>): Promise<Row | null> {
    return ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r ?? null;
  }
  /** One SQL statement under the pipeline's bound action (the signers' capability — the port asserts the action). */
  async call<T>(q: ReturnType<typeof sql>): Promise<T[]> { return this.rows<T>(q); }
  async now(): Promise<string> { const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx); return (r.rows[0]?.now ?? new Date()).toISOString(); }

  // ───────────────────────── DOMAIN reads ─────────────────────────
  async portal(t: string, d: string, profile: string): Promise<Row> { return this.one(sql`select governance.dr_portal(${t}::uuid, ${d}::uuid, ${profile}) as r`, 'dr_portal'); }
  async resolve(t: string, d: string, assetId: string): Promise<Row | null> { return this.maybe(sql`select governance.dr_resolve(${t}::uuid, ${d}::uuid, ${assetId}::uuid) as r`); }
  async products(t: string, d: string): Promise<Row[]> { return (await this.one(sql`select jsonb_build_object('p', governance.dr_products(${t}::uuid, ${d}::uuid)) as r`, 'dr_products'))['p'] as Row[]; }
  async authorityVersion(id: string, version: number): Promise<Row | null> {
    return (await this.rows(sql`select a.authority_id::text, a.version, a.state, a.digest, a.proposed_by::text, a.owner_principal_id::text, a.owner_accepted_at from governance.data_authorities a
      where a.authority_id = ${id}::uuid and a.version = ${version}::int`))[0] ?? null;
  }
  async authorityVersions(id: string): Promise<Row[]> {
    return this.rows(sql`select governance.dr_authority_json(a) as a from governance.data_authorities a where a.authority_id = ${id}::uuid order by a.version desc`).then((r) => r.map((x) => x['a'] as Row));
  }
  async domainEntries(d: string): Promise<Row[]> {
    return this.rows(sql`select (to_jsonb(r) - 'scope' - 'correlation_id') || jsonb_build_object('leader_name', governance.dr_name(r.accountable_leader), 'proposed_by_name', governance.dr_name(r.proposed_by),
        'decided_by_name', governance.dr_name(r.decided_by)) as r from governance.domain_registry r where r.domain_id = ${d}::uuid order by r.version desc`).then((x) => x.map((y) => y['r'] as Row));
  }
  async cases(limit: number): Promise<Row[]> {
    return this.rows(sql`select governance.dr_case_json(c) as c from governance.stewardship_cases c order by (c.state in ('open', 'in_review')) desc, c.due_at, c.opened_at desc limit ${limit}`).then((r) => r.map((x) => x['c'] as Row));
  }
  async case(id: string): Promise<Row | null> {
    return (await this.rows(sql`select governance.dr_case_json(c) as c from governance.stewardship_cases c where c.case_id = ${id}::uuid`))[0]?.['c'] as Row ?? null;
  }
  async gaps(limit: number): Promise<Row[]> {
    return this.rows(sql`select (to_jsonb(g) - 'correlation_id') || jsonb_build_object('accepted_by_name', governance.dr_name(g.accepted_by)) as g from governance.ownership_gaps g
      order by (g.state in ('open', 'escalated')) desc, g.opened_at desc limit ${limit}`).then((r) => r.map((x) => x['g'] as Row));
  }
  async evidence(limit: number): Promise<Row[]> {
    return this.rows(sql`select (to_jsonb(r) - 'scope' - 'correlation_id') || jsonb_build_object('assembled_by_name', governance.dr_name(r.assembled_by), 'decided_by_name', governance.dr_name(r.decided_by)) as r
      from governance.responsibility_evidence r order by r.assembled_at desc limit ${limit}`).then((x) => x.map((y) => y['r'] as Row));
  }
  async evidenceRecord(id: string): Promise<Row | null> {
    return (await this.rows(sql`select r.record_id::text, r.state, r.digest, r.assembled_by::text from governance.responsibility_evidence r where r.record_id = ${id}::uuid`))[0] ?? null;
  }
  async ledger(subject: string | null, limit: number): Promise<Row[]> {
    return this.rows(sql`select e.event_id::text, e.subject_kind, e.subject_id::text, e.version, e.event, e.actor_principal_id::text, governance.dr_name(e.actor_principal_id) as actor_name, e.details, e.occurred_at
      from governance.events e where (${subject}::uuid is null or e.subject_id = ${subject}::uuid)
        and e.subject_kind in ('data_authority', 'domain', 'ownership_gap', 'ownership_run', 'stewardship_case', 'responsibility_evidence', 'data_capability', 'component_transfer')
      order by e.occurred_at desc limit ${limit}`);
  }
  async holdsOf(subject: string): Promise<Row[]> {
    return this.rows(sql`select h.hold_id::text, h.reason_kind, h.reason, h.source_artifact::text, h.opened_at, h.lifted_at, h.lift_reason from governance.holds h where h.subject_artifact = ${subject}::uuid order by h.opened_at`);
  }
  async holdsRole(p: string, t: string | null, d: string | null, roles: string[]): Promise<boolean> {
    return Boolean((await sql<{ ok: boolean }>`select governance.holds_role(${p}::uuid, ${t}::uuid, ${d}::uuid, ${roles}::text[]) as ok`.execute(this.#tx)).rows[0]?.ok);
  }
  async lineageEdge(id: string): Promise<Row | null> {
    return (await this.rows(sql`select e.edge_id::text, e.kind, e.from_asset_id::text, e.to_asset_id::text, e.retired_at, e.retirement_reason from products.lineage_edges e where e.edge_id = ${id}::uuid`))[0] ?? null;
  }

  // ───────────────────────── PLATFORM reads ─────────────────────────
  async capabilities(): Promise<Row[]> {
    return this.rows(sql`select (to_jsonb(c) - 'scope' - 'correlation_id') || jsonb_build_object('owner_name', governance.dr_name(c.owner_principal_id), 'declared_by_name', governance.dr_name(c.declared_by),
        'admitted_by_name', governance.dr_name(c.admitted_by),
        'holds', (select coalesce(jsonb_agg(jsonb_build_object('reason_kind', h.reason_kind, 'reason', h.reason, 'opened_at', h.opened_at)), '[]'::jsonb) from governance.holds h where h.subject_artifact = c.capability_id and h.lifted_at is null)) as c
      from governance.data_capabilities c where c.superseded_at is null order by c.dat_key`).then((r) => r.map((x) => x['c'] as Row));
  }
  async capability(id: string): Promise<Row | null> {
    return (await this.rows(sql`select c.capability_id::text, c.version, c.digest, c.dat_key, c.owner_principal_id::text, c.declared_by::text, c.conformance, c.admission from governance.data_capabilities c
      where c.capability_id = ${id}::uuid and c.superseded_at is null`))[0] ?? null;
  }
  async capabilityByKey(key: string): Promise<Row | null> {
    return (await this.rows(sql`select c.capability_id::text, c.version, c.digest from governance.data_capabilities c where c.dat_key = ${key} and c.superseded_at is null`))[0] ?? null;
  }
  async components(): Promise<Row[]> {
    return this.rows(sql`select a.artifact_id::text as component_artifact, a.external_key, a.title, a.kind, a.lifecycle,
        (select (to_jsonb(o) - 'scope' - 'correlation_id') || jsonb_build_object('accountable_name', governance.dr_name(o.accountable_principal_id), 'primary_name', governance.dr_name(o.primary_contact),
                 'secondary_name', governance.dr_name(o.secondary_contact), 'ratified_by_name', governance.dr_name(o.ratified_by))
           from governance.component_ownerships o where o.component_artifact = a.artifact_id and o.superseded_at is null) as ownership,
        (select (to_jsonb(t) - 'scope' - 'correlation_id') || jsonb_build_object('proposed_by_name', governance.dr_name(t.proposed_by), 'to_name', governance.dr_name((t.proposal ->> 'accountable')::uuid))
           from governance.component_transfers t where t.component_artifact = a.artifact_id and t.state in ('proposed', 'accepted')) as transfer,
        (select coalesce(jsonb_agg(jsonb_build_object('gap_id', g.gap_id, 'gap_kind', g.gap_kind, 'state', g.state)), '[]'::jsonb) from governance.ownership_gaps g where g.subject_id = a.artifact_id and g.state <> 'resolved') as gaps
      from governance.artifacts a where a.scope = 'PLATFORM' and a.superseded_at is null and a.kind in ('component', 'deployable_unit') order by a.external_key`);
  }
  async transfer(id: string): Promise<Row | null> {
    return (await this.rows(sql`select (to_jsonb(t) - 'scope' - 'correlation_id') as t from governance.component_transfers t where t.transfer_id = ${id}::uuid`))[0]?.['t'] as Row ?? null;
  }
  async transfers(limit: number): Promise<Row[]> {
    return this.rows(sql`select (to_jsonb(t) - 'scope' - 'correlation_id') || jsonb_build_object('proposed_by_name', governance.dr_name(t.proposed_by), 'to_name', governance.dr_name((t.proposal ->> 'accountable')::uuid),
        'decided_by_name', governance.dr_name(t.decided_by)) as t from governance.component_transfers t order by t.proposed_at desc limit ${limit}`).then((r) => r.map((x) => x['t'] as Row));
  }
  async ownedContracts(): Promise<Array<{ component: string; contracts: string[] }>> {
    return this.rows<{ component: string; contracts: string[] }>(sql`select o.component_key as component, o.owned_contracts as contracts from governance.component_ownerships o where o.superseded_at is null order by o.component_key`);
  }
  async platformGaps(limit: number): Promise<Row[]> {
    return this.rows(sql`select (to_jsonb(g) - 'correlation_id') || jsonb_build_object('accepted_by_name', governance.dr_name(g.accepted_by)) as g from governance.ownership_gaps g where g.scope = 'PLATFORM'
      order by (g.state in ('open', 'escalated')) desc, g.opened_at desc limit ${limit}`).then((r) => r.map((x) => x['g'] as Row));
  }
  async platformSignatures(subject: string): Promise<Row[]> {
    return this.rows(sql`select s.signature_id::text, s.subject_kind, s.subject_id::text, s.subject_version, s.subject_digest, s.signer::text, s.signer_role, s.key_id, s.algorithm, s.signature, s.bound_action, s.signed_at
      from governance.signatures s where s.subject_id = ${subject}::uuid order by s.signed_at`);
  }

  // ───────────────────────── DOMAIN ports ─────────────────────────
  proposeAuthority(a: { authorityId: string; t: string; d: string; expected: number; duties: Row; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_propose_authority(${a.authorityId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.expected}::int, ${j(a.duties)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_propose_authority');
  }
  acceptAuthority(a: { authorityId: string; t: string; d: string; version: number; digest: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_accept_authority(${a.authorityId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.version}::int, ${a.digest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_accept_authority');
  }
  decideAuthority(a: { authorityId: string; t: string; d: string; version: number; digest: string; decision: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_decide_authority(${a.authorityId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.version}::int, ${a.digest}, ${a.decision}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_decide_authority');
  }
  recertifyAuthority(a: { authorityId: string; t: string; d: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_recertify_authority(${a.authorityId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_recertify_authority');
  }
  proposeDomain(a: { t: string; d: string; expected: number; leader: string; boundary: string; contract: Row; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_propose_domain(${a.t}::uuid, ${a.d}::uuid, ${a.expected}::int, ${a.leader}::uuid, ${a.boundary}, ${j(a.contract)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_propose_domain');
  }
  decideDomain(a: { t: string; d: string; version: number; digest: string; decision: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_decide_domain(${a.t}::uuid, ${a.d}::uuid, ${a.version}::int, ${a.digest}, ${a.decision}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_decide_domain');
  }
  reconcileDomain(a: { runId: string; t: string; d: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_reconcile_domain(${a.runId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_reconcile_domain');
  }
  reconcileDue(t: string, d: string) { return this.one(sql`select governance.dr_reconcile_due(${t}::uuid, ${d}::uuid) as r`, 'dr_reconcile_due'); }
  acceptGap(a: { gapId: string; t: string | null; d: string | null; until: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_accept_gap(${a.gapId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.until}::timestamptz, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_accept_gap');
  }
  openCase(a: { caseId: string; t: string; d: string; kind: string; subjectKind: string; subjectId: string; title: string; action: string; evidence: unknown[]; consequence: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_open_case(${a.caseId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.kind}, ${a.subjectKind}, ${a.subjectId}::uuid, ${a.title}, ${a.action}, ${j(a.evidence)}::jsonb,
      ${a.consequence}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_open_case');
  }
  reviewCase(a: { caseId: string; t: string; d: string; digest: string; outcome: string; note: string; conditions: string[] | null; expiresAt: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_review_case(${a.caseId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.digest}, ${a.outcome}, ${a.note}, ${a.conditions === null ? null : j(a.conditions)}::jsonb,
      ${a.expiresAt}::timestamptz, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_review_case');
  }
  closeCase(a: { caseId: string; t: string; d: string; note: string; evidence: unknown[]; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_close_case(${a.caseId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.note}, ${j(a.evidence)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_close_case');
  }
  withdrawCase(a: { caseId: string; t: string; d: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_withdraw_case(${a.caseId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_withdraw_case');
  }
  sweepCases(a: { t: string; d: string; caseId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_sweep_cases(${a.t}::uuid, ${a.d}::uuid, ${a.caseId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_sweep_cases');
  }
  assembleEvidence(a: { recordId: string; t: string; d: string; profile: string; from: string; to: string; bound: Row; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_assemble_evidence(${a.recordId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.profile}, ${a.from}::timestamptz, ${a.to}::timestamptz, ${j(a.bound)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_assemble_evidence');
  }
  attestEvidence(a: { recordId: string; t: string; d: string; digest: string; decision: string; reason: string; signatureId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_attest_evidence(${a.recordId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.digest}, ${a.decision}, ${a.reason}, ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_attest_evidence');
  }
  retireLineage(a: { edgeId: string; t: string; d: string; reason: string; evidence: Row | null; actor: string; correlationId: string }) {
    return this.one(sql`select products.retire_lineage(${a.edgeId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.reason}, ${a.evidence === null ? null : j(a.evidence)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'retire_lineage');
  }
  /** DP-41-005: the tick's degradation of a product whose owner is lost or whose policy violation is recorded (products.degrade_product under
   *  executive.attention.tick — its own statement, never from inside another port). */
  degradeProduct(a: { productId: string; t: string; d: string; reason: string; actor: string; eventId: string; correlationId: string }) {
    return this.one(sql`select products.degrade_product(${a.productId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'degrade_product');
  }

  // ───────────────────────── PLATFORM ports ─────────────────────────
  declareCapability(a: { capabilityId: string | null; key: string; title: string; group: string; layer: string; authorityClass: string; purpose: string | null; lifecycle: string; deploymentScope: string;
                         owner: string | null; ownerRole: string | null; realization: Row; source: Row; expected: number; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_declare_capability(${a.capabilityId}::uuid, ${a.key}, ${a.title}, ${a.group}, ${a.layer}, ${a.authorityClass}, ${a.purpose}, ${a.lifecycle}, ${a.deploymentScope},
      ${a.owner}::uuid, ${a.ownerRole}, ${j(a.realization)}::jsonb, ${j(a.source)}::jsonb, ${a.expected}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_declare_capability');
  }
  reconcileCapability(a: { capabilityId: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_reconcile_capability(${a.capabilityId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_reconcile_capability');
  }
  acceptCapability(a: { capabilityId: string; version: number; digest: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_accept_capability(${a.capabilityId}::uuid, ${a.version}::int, ${a.digest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_accept_capability');
  }
  admitCapability(a: { capabilityId: string; version: number; digest: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_admit_capability(${a.capabilityId}::uuid, ${a.version}::int, ${a.digest}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_admit_capability');
  }
  proposeTransfer(a: { transferId: string; componentId: string; expected: number; proposal: Row; checklist: Row; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_propose_transfer(${a.transferId}::uuid, ${a.componentId}::uuid, ${a.expected}::int, ${j(a.proposal)}::jsonb, ${j(a.checklist)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_propose_transfer');
  }
  acceptTransfer(a: { transferId: string; digest: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_accept_transfer(${a.transferId}::uuid, ${a.digest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_accept_transfer');
  }
  decideTransfer(a: { transferId: string; digest: string; decision: string; reason: string; signatureId: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_decide_transfer(${a.transferId}::uuid, ${a.digest}, ${a.decision}, ${a.reason}, ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_decide_transfer');
  }
  withdrawTransfer(a: { transferId: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_withdraw_transfer(${a.transferId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_withdraw_transfer');
  }
  reconcileComponents(a: { runId: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.dr_reconcile_components(${a.runId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'dr_reconcile_components');
  }
}
export const OwnershipCap = (tx: Tx, action: string): OwnershipCapability => OwnershipCapability.of(tx, action);
