/**
 * B107 §AR (0115_b107_x_ar) — THE ACCEPTANCE CAPABILITY: one class over the pipeline's transaction. Each write is a thin binding to a SECURITY
 * DEFINER port of governance.ar_* that asserts the route's own action, the scope and the acting principal and re-checks every human, role and
 * separation-of-duties rule (governance.assert_approver); each read is a plain select under the caller's RLS (the domain's own rows; the
 * vendor's PLATFORM registry rows) or a definer read guarded by observation.assert_read_scope. Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);

export class AcceptanceCapability {
  readonly #tx: Tx; readonly #action: string;
  private constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  static of(tx: Tx, action: string): AcceptanceCapability { return new AcceptanceCapability(tx, action); }
  get action(): string { return this.#action; }
  private async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.#tx)).rows as T[]; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (r === undefined || r === null) throw new Error(`${what} returned no row`);
    return r;
  }
  /** One SQL statement under the pipeline's bound action (the signer's capability — executive.record_signature asserts the action). */
  async call<T>(q: ReturnType<typeof sql>): Promise<T[]> { return this.rows<T>(q); }
  async now(): Promise<string> { const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx); return (r.rows[0]?.now ?? new Date()).toISOString(); }

  // ───────────────────────── the ports ─────────────────────────
  recordEvidence(a: { evidenceId: string; t: string; d: string; kind: string; title: string; subjectKind: string; subjectId: string | null; subjectVersion: number | null; digest: string | null;
                      pointer: string | null; covers: Row; outcome: string; capturedAt: string; validUntil: string; renews: string | null; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql`select governance.ar_record_evidence(${a.evidenceId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.kind}, ${a.title}, ${a.subjectKind}, ${a.subjectId}::uuid,
      ${a.subjectVersion}::int, ${a.digest}, ${a.pointer}, ${j(a.covers)}::jsonb, ${a.outcome}, ${a.capturedAt}::timestamptz, ${a.validUntil}::timestamptz, ${a.renews}::uuid,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ar_record_evidence');
  }
  propose(a: { recordId: string; t: string; d: string; kind: string; title: string; subjectKey: string; scope: Row; obligations: string[]; evidence: string[]; conditions: Row[];
               exceptions: string[]; operational: Row | null; builders: string[]; expectedVersion: number; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql`select governance.ar_propose(${a.recordId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.kind}, ${a.title}, ${a.subjectKey}, ${j(a.scope)}::jsonb, ${a.obligations}::text[],
      ${a.evidence}::uuid[], ${j(a.conditions)}::jsonb, ${a.exceptions}::uuid[], ${a.operational === null ? null : j(a.operational)}::jsonb, ${a.builders}::uuid[], ${a.expectedVersion}::int,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ar_propose');
  }
  verify(a: { recordId: string; version: number; t: string; d: string; digest: string; outcome: string; findings: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql`select governance.ar_verify(${a.recordId}::uuid, ${a.version}::int, ${a.t}::uuid, ${a.d}::uuid, ${a.digest}, ${a.outcome}, ${a.findings}, ${a.actor}::uuid,
      ${a.correlationId}::uuid) as r`, 'ar_verify');
  }
  attest(a: { recordId: string; version: number; t: string; d: string; obligation: string; decision: string; digest: string; reason: string; signatureId: string | null; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql`select governance.ar_attest(${a.recordId}::uuid, ${a.version}::int, ${a.t}::uuid, ${a.d}::uuid, ${a.obligation}, ${a.decision}, ${a.digest}, ${a.reason},
      ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ar_attest');
  }
  trigger(a: { recordId: string; t: string; d: string; kind: string; policy: string; detail: Row; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql`select governance.ar_trigger(${a.recordId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.kind}, ${a.policy}, ${j(a.detail)}::jsonb, ${a.reason}, ${a.actor}::uuid,
      ${a.correlationId}::uuid) as r`, 'ar_trigger');
  }
  conditionMet(a: { recordId: string; version: number; t: string; d: string; key: string; evidenceId: string; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql`select governance.ar_condition_met(${a.recordId}::uuid, ${a.version}::int, ${a.t}::uuid, ${a.d}::uuid, ${a.key}, ${a.evidenceId}::uuid, ${a.reason}, ${a.actor}::uuid,
      ${a.correlationId}::uuid) as r`, 'ar_condition_met');
  }
  withdraw(a: { recordId: string; t: string; d: string; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql`select governance.ar_withdraw(${a.recordId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ar_withdraw');
  }
  sweep(a: { t: string; d: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql`select governance.ar_sweep(${a.t}::uuid, ${a.d}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ar_sweep');
  }
  timer(a: { timerId: string; t: string; d: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql`select governance.ar_timer(${a.timerId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ar_timer');
  }
  enforce(a: { capabilityKey: string; enforced: boolean; prefixes: string[]; reason: string; actor: string; correlationId: string }): Promise<Row> {
    return this.one(sql`select governance.ar_enforce(${a.capabilityKey}, ${a.enforced}, ${a.prefixes}::text[], ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'ar_enforce');
  }

  // ───────────────────────── reads (RLS) ─────────────────────────
  /** Every version of the domain's records, newest first per record (the workspace groups them). */
  async records(limit: number): Promise<Row[]> {
    return this.rows(sql`select r.record_id::text, r.version, r.kind, r.title, r.subject_artifact::text, r.subject_key, r.subject_digest, r.scope_tuple, r.obligations, r.evidence, r.conditions,
        r.exceptions, r.operational, r.digest, r.state, r.effective_scope, r.constrained_reasons, r.claim, r.real_acceptance, r.proposed_by::text,
        governance.ar_principal_name(r.proposed_by) as proposed_by_name, r.proposed_at, r.accepted_at, r.constrained_at, r.ended_by::text, r.ended_at, r.end_reason,
        r.expiry_timer_id::text, r.builders,
        (select coalesce(jsonb_agg(jsonb_build_object('obligation', a.obligation, 'decision', a.decision, 'attester', a.attester, 'name', governance.ar_principal_name(a.attester),
             'role', a.attester_role, 'signature_id', a.signature_id, 'reason', a.reason, 'at', a.attested_at) order by a.attested_at), '[]'::jsonb)
           from governance.acceptance_attestations a where a.record_id = r.record_id and a.version = r.version) as attestations,
        (select jsonb_build_object('outcome', v.outcome, 'findings', v.findings, 'verifier', v.verifier, 'name', governance.ar_principal_name(v.verifier), 'at', v.verified_at)
           from governance.acceptance_verifications v where v.record_id = r.record_id and v.version = r.version) as verification,
        (select coalesce(jsonb_agg(jsonb_build_object('key', c.condition_key, 'evidence_id', c.evidence_id, 'by', c.met_by, 'at', c.met_at, 'reason', c.reason)), '[]'::jsonb)
           from governance.acceptance_condition_events c where c.record_id = r.record_id and c.version = r.version) as conditions_met,
        executive.signature_of('acceptance_attestation', r.record_id, r.version) as signatures
      from governance.acceptance_records r order by r.proposed_at desc, r.version desc limit ${limit}`);
  }
  /** Has this principal already attested an obligation of the version? (then nothing is signed — the port refuses in its own words) */
  async attestedBy(recordId: string, version: number, principal: string): Promise<boolean> {
    return (await this.rows(sql`select 1 from governance.acceptance_attestations a where a.record_id = ${recordId}::uuid and a.version = ${version}::int and a.attester = ${principal}::uuid`)).length > 0;
  }
  async recordVersion(recordId: string, version: number): Promise<Row | null> {
    return (await this.rows(sql`select r.record_id::text, r.version, r.state, r.digest, r.kind, r.obligations from governance.acceptance_records r
      where r.record_id = ${recordId}::uuid and r.version = ${version}::int`))[0] ?? null;
  }
  async evidence(limit: number): Promise<Row[]> {
    return this.rows(sql`select e.evidence_id::text, e.kind, e.title, e.subject_kind, e.subject_id::text, e.subject_version, e.subject_digest, e.pointer, e.covers, e.outcome,
        e.captured_at, e.valid_until, e.renews::text, e.digest, e.claim, e.recorded_by::text, governance.ar_principal_name(e.recorded_by) as recorded_by_name, e.recorded_at,
        e.valid_until > clock_timestamp() and e.outcome <> 'failed' and not exists (select 1 from governance.acceptance_evidence f where f.renews = e.evidence_id) as current,
        (select f.evidence_id::text from governance.acceptance_evidence f where f.renews = e.evidence_id limit 1) as renewed_by
      from governance.acceptance_evidence e order by e.recorded_at desc limit ${limit}`);
  }
  async triggers(limit: number): Promise<Row[]> {
    return this.rows(sql`select t.trigger_id::text, t.record_id::text, t.version, t.kind, t.policy, t.detail, t.source, t.raised_by::text, t.raised_at
      from governance.acceptance_triggers t order by t.raised_at desc limit ${limit}`);
  }
  /** The open and lifted holds this domain's records opened (the expansion holds) — the prelude's table under its own RLS. */
  async holds(): Promise<Row[]> {
    return this.rows(sql`select h.hold_id::text, h.subject_artifact::text, h.source_artifact::text, h.reason_kind, h.reason, h.opened_at, h.lifted_at, h.lift_reason
      from governance.holds h where h.reason_kind = 'acceptance_constrained' and h.domain_id = public.eye_domain() order by h.opened_at desc limit 100`);
  }
  /** The vendor's enforcement register (current row per capability) and the capability / release-candidate / design artifacts a record may name. */
  async enforcement(): Promise<Row[]> {
    return this.rows(sql`select e.capability_key, e.version, e.enforced, e.action_prefixes, e.reason, e.digest, e.set_by::text, governance.ar_principal_name(e.set_by) as set_by_name, e.set_at
      from governance.acceptance_enforcement e where e.version = (select max(x.version) from governance.acceptance_enforcement x where x.capability_key = e.capability_key) order by e.capability_key`);
  }
  async subjects(): Promise<Row[]> {
    return this.rows(sql`select a.artifact_id::text, a.kind, a.external_key, a.title, a.version, a.digest, a.lifecycle, a.attributes,
        (select count(*)::int from governance.holds h where h.subject_artifact = a.artifact_id and h.lifted_at is null) as open_holds
      from governance.artifacts a where a.superseded_at is null and a.scope = 'PLATFORM' and a.kind in ('capability', 'release_candidate', 'design_component', 'pattern', 'design_asset')
      order by a.kind, a.external_key limit 500`);
  }
  async exceptions(): Promise<Row[]> {
    return this.rows(sql`select a.artifact_id::text, a.external_key, a.title, a.lifecycle, a.attributes ->> 'expires_at' as expires_at, a.digest
      from governance.artifacts a where a.superseded_at is null and a.kind = 'exception' order by a.external_key limit 200`);
  }
  async journey(recordId: string, version: number): Promise<Row | null> {
    return ((await this.rows<{ r: Row | null }>(sql`select governance.ar_journey(${recordId}::uuid, ${version}::int) as r`))[0]?.r) ?? null;
  }
  async scope(t: string, d: string, key: string): Promise<Row> {
    return this.one(sql`select governance.ar_scope(${t}::uuid, ${d}::uuid, ${key}) as r`, 'ar_scope');
  }
  async eligibility(recordId: string, version: number, principal: string): Promise<Row | null> {
    return ((await this.rows<{ r: Row | null }>(sql`select governance.ar_eligibility(${recordId}::uuid, ${version}::int, ${principal}::uuid) as r`))[0]?.r) ?? null;
  }
  async findings(recordId: string, version: number): Promise<Row[]> {
    return (((await this.rows<{ r: Row[] }>(sql`select governance.ar_findings(${recordId}::uuid, ${version}::int) as r`))[0]?.r) ?? []);
  }
  async items(): Promise<Row[]> {
    return this.rows(sql`select i.item_id::text, i.signal_class, i.subject_id::text, i.title, i.state, i.outcome, i.created_at from executive.attention_items i
      where i.signal_class = 'governance.acceptance' and i.state <> 'closed' order by i.created_at desc limit 50`);
  }
  async tasks(): Promise<Row[]> {
    return this.rows(sql`select t.task_id::text, t.kind, t.subject, t.title, t.state, t.candidate_roles, t.opened_at from executive.human_tasks t
      where t.kind = 'governance.attest' and t.state in ('open', 'escalated') order by t.opened_at desc limit 100`);
  }
  async ledger(limit: number): Promise<Row[]> {
    return this.rows(sql`select e.event_id::text, e.subject_kind, e.subject_id::text, e.version, e.event, e.actor_principal_id::text, governance.ar_principal_name(e.actor_principal_id) as actor_name,
        e.details, e.occurred_at from governance.events e where e.subject_kind in ('acceptance_record', 'acceptance_evidence') and e.domain_id = public.eye_domain()
      order by e.occurred_at desc limit ${limit}`);
  }
  /** The ledger of one record, oldest first (the REPLAY: the record's history reconstructed from its events). */
  async history(recordId: string): Promise<Row[]> {
    return this.rows(sql`select e.event, e.version, e.actor_principal_id::text, e.details, e.occurred_at from governance.events e
      where e.subject_id = ${recordId}::uuid order by e.occurred_at, e.event_id`);
  }
}
export const AcceptanceCap = (tx: Tx, action: string): AcceptanceCapability => AcceptanceCapability.of(tx, action);
