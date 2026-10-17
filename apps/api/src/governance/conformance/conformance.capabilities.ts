/**
 * B107 §CM (0115_b107_x_cm) — THE CONFORMANCE CAPABILITY: one class over the pipeline's transaction. Each write is a thin binding to a SECURITY
 * DEFINER port of governance.cm_* that asserts the route's own action, the PLATFORM scope (the monitor: the tick's domain or PLATFORM) and the
 * acting principal, and re-checks every human, role and separation-of-duties rule; each read is a plain select under the caller's RLS (the
 * vendor's registries are readable by every authenticated context). Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);
const CM_SUBJECTS = ['conformance_manifest', 'release_candidate', 'conformance_finding'];

export class ConformanceCapability {
  readonly #tx: Tx; readonly #action: string;
  private constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  static of(tx: Tx, action: string): ConformanceCapability { return new ConformanceCapability(tx, action); }
  get tx(): Tx { return this.#tx; }
  get action(): string { return this.#action; }
  private async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.#tx)).rows as T[]; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (r === undefined || r === null) throw new Error(`${what} returned no row`);
    return r;
  }
  async now(): Promise<string> { const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx); return (r.rows[0]?.now ?? new Date()).toISOString(); }

  // ───────────────────────── reads (RLS) ─────────────────────────
  async migrationHead(): Promise<string | null> {
    return ((await sql<{ h: string | null }>`select governance.cm_migration_head() as h`.execute(this.#tx)).rows[0]?.h) ?? null;
  }
  async currentManifest(): Promise<Row | null> {
    return (await this.rows(sql`select m.manifest_id::text, m.version, m.path, m.schema, m.generator, m.file_digest, m.index_digest, m.summary, m.link_report, m.state,
        m.registered_by::text, governance.cm_principal_name(m.registered_by) as registered_by_name, m.registered_at
      from governance.cm_manifests m where m.state = 'current'`))[0] ?? null;
  }
  async currentIndex(): Promise<Row | null> {
    return (await this.rows(sql`select m.index from governance.cm_manifests m where m.state = 'current'`))[0] ?? null;
  }
  async manifests(limit: number): Promise<Row[]> {
    return this.rows(sql`select m.manifest_id::text, m.version, m.file_digest, m.summary, m.link_report, m.state, m.registered_by::text,
        governance.cm_principal_name(m.registered_by) as registered_by_name, m.registered_at, m.superseded_at
      from governance.cm_manifests m order by m.version desc limit ${limit}`);
  }
  async candidates(limit: number): Promise<Row[]> {
    return this.rows(sql`select c.candidate_id::text, c.version, c.label, c.head_sha, c.migration_head, c.policy_bundle, c.manifest_id::text, c.manifest_version, c.manifest_digest,
        c.config_digest, c.deployment_profile, c.customer_scope, c.topology, c.period_from::text, c.period_to::text, c.evidence, c.evidence_digest,
        (select coalesce(jsonb_agg(b::text), '[]'::jsonb) from unnest(c.builders) b) as builders, c.digest, c.state, c.check_result, c.checked_by::text, c.checked_at,
        c.attested_by::text, governance.cm_principal_name(c.attested_by) as attested_by_name, c.attested_at, c.attestation_reason, c.signature_id::text,
        c.withdrawn_by::text, c.withdrawn_at, c.withdraw_reason, c.proposed_by::text, governance.cm_principal_name(c.proposed_by) as proposed_by_name, c.proposed_at,
        c.claim, c.release, c.production_admission,
        (select coalesce(jsonb_agg(jsonb_build_object('hold_id', h.hold_id, 'reason_kind', h.reason_kind, 'reason', h.reason, 'opened_at', h.opened_at) order by h.opened_at), '[]'::jsonb)
           from governance.holds h where h.subject_artifact = c.candidate_id and h.lifted_at is null) as open_holds,
        (select coalesce(jsonb_agg(jsonb_build_object('signature_id', s.signature_id, 'signer', s.signer, 'signer_role', s.signer_role, 'key_id', s.key_id, 'signature', s.signature,
             'subject_digest', s.subject_digest, 'signed_at', s.signed_at, 'subject_kind', s.subject_kind)), '[]'::jsonb)
           from governance.signatures s where s.subject_kind = 'manifest_attestation' and s.subject_id = c.candidate_id and s.subject_version = c.version) as signatures
      from governance.cm_release_candidates c order by c.proposed_at desc, c.version desc limit ${limit}`);
  }
  async candidate(id: string, version: number | null): Promise<Row | null> {
    return (await this.rows(sql`select c.candidate_id::text, c.version, c.label, c.state, c.digest, c.head_sha, c.manifest_digest, c.check_result, c.proposed_by::text,
        (select coalesce(jsonb_agg(b::text), '[]'::jsonb) from unnest(c.builders) b) as builders, c.evidence, c.policy_bundle, c.migration_head,
        (select count(*)::int from governance.holds h where h.subject_artifact = c.candidate_id and h.lifted_at is null) as open_holds
      from governance.cm_release_candidates c where c.candidate_id = ${id}::uuid and (${version}::int is null and c.state <> 'superseded' or c.version = ${version}::int)`))[0] ?? null;
  }
  async findings(limit: number): Promise<Row[]> {
    return this.rows(sql`select f.finding_id::text, f.kind, f.fingerprint, f.subject_artifact::text, f.summary, f.observed, f.expected, f.state, f.opened_by::text, f.opened_at,
        f.resolved_at, f.resolution from governance.cm_findings f order by (f.state = 'open') desc, f.opened_at desc limit ${limit}`);
  }
  async runs(limit: number): Promise<Row[]> {
    return this.rows(sql`select r.run_id::text, r.via, r.ticked_tenant::text, r.ticked_domain::text, r.observed, r.observation_digest, r.opened, r.resolved, r.holds_opened, r.holds_lifted,
        r.open_after, r.actor_principal_id::text, r.recorded_at from governance.cm_monitor_runs r order by r.recorded_at desc limit ${limit}`);
  }
  /** The open holds on candidates (any part's) — the monitor reports §PG's expired-exception holds. */
  async candidateHolds(): Promise<Row[]> {
    return this.rows(sql`select h.hold_id::text, h.subject_artifact::text, h.reason_kind, h.reason, h.opened_at from governance.holds h
      where h.lifted_at is null and exists (select 1 from governance.cm_release_candidates c where c.candidate_id = h.subject_artifact) order by h.opened_at`);
  }
  /** The exception artifacts (§PG's registry, read through the shared core) that carry an expiry. */
  async exceptionArtifacts(): Promise<Row[]> {
    return this.rows(sql`select a.artifact_id::text, a.external_key, a.title, a.attributes ->> 'expires_at' as expires_at from governance.artifacts a
      where a.kind = 'exception' and a.superseded_at is null and a.lifecycle not in ('retired', 'superseded') and a.attributes ? 'expires_at'
        and (a.attributes ->> 'expires_at') ~ '^\\d{4}-\\d{2}-\\d{2}' order by a.external_key`);
  }
  async artifactCounts(): Promise<Row[]> {
    return this.rows(sql`select a.kind, a.lifecycle, count(*)::int as n from governance.artifacts a where a.superseded_at is null and a.source ->> 'part' = 'cm' group by 1, 2 order by 1, 2`);
  }
  async ledger(limit: number): Promise<Row[]> {
    return this.rows(sql`select e.event_id::text, e.subject_kind, e.subject_id::text, e.version, e.event, e.actor_principal_id::text,
        governance.cm_principal_name(e.actor_principal_id) as actor_name, e.details, e.occurred_at
      from governance.events e where e.subject_kind = any(${CM_SUBJECTS}::text[]) order by e.occurred_at desc limit ${limit}`);
  }
  async principalKind(p: string): Promise<string | null> {
    return ((await sql<{ k: string | null }>`select onboarding.principal_kind(${p}::uuid) as k`.execute(this.#tx)).rows[0]?.k) ?? null;
  }
  async holdsRole(p: string, roles: string[]): Promise<boolean> {
    return ((await sql<{ ok: boolean }>`select governance.holds_role(${p}::uuid, null, null, ${roles}::text[]) as ok`.execute(this.#tx)).rows[0]?.ok) === true;
  }

  // ───────────────────────── the ports ─────────────────────────
  registerManifest(a: { path: string; schema: string; generator: string; fileDigest: string; index: Row; summary: Row; actor: string; correlationId: string }) {
    return this.one(sql`select governance.cm_register_manifest(${a.path}, ${a.schema}, ${a.generator}, ${a.fileDigest}, ${j(a.index)}::jsonb, ${j(a.summary)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'cm_register_manifest');
  }
  assemble(a: { candidateId: string | null; expectedVersion: number; label: string; headSha: string; policy: Row; configDigest: string; profile: string; scope: Row;
                from: string; to: string; evidence: Row[]; builders: string[]; actor: string; correlationId: string }) {
    return this.one(sql`select governance.cm_assemble_candidate(${a.candidateId}::uuid, ${a.expectedVersion}::int, ${a.label}, ${a.headSha}, ${j(a.policy)}::jsonb, ${a.configDigest},
      ${a.profile}, ${j(a.scope)}::jsonb, ${a.from}::date, ${a.to}::date, ${j(a.evidence)}::jsonb, ${a.builders}::uuid[], ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'cm_assemble_candidate');
  }
  check(a: { candidateId: string; version: number; actor: string; correlationId: string }) {
    return this.one(sql`select governance.cm_check_candidate(${a.candidateId}::uuid, ${a.version}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'cm_check_candidate');
  }
  attest(a: { candidateId: string; version: number; digest: string; reason: string; keyId: string; signature: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.cm_attest_candidate(${a.candidateId}::uuid, ${a.version}::int, ${a.digest}, ${a.reason}, ${a.keyId}, ${a.signature},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'cm_attest_candidate');
  }
  withdraw(a: { candidateId: string; version: number; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.cm_withdraw_candidate(${a.candidateId}::uuid, ${a.version}::int, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'cm_withdraw_candidate');
  }
  recordMonitor(a: { observed: Row; findings: unknown[]; via: 'tick' | 'steward'; actor: string; correlationId: string }) {
    return this.one(sql`select governance.cm_record_monitor(${j(a.observed)}::jsonb, ${j(a.findings)}::jsonb, ${a.via}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'cm_record_monitor');
  }
}

export const ConformanceCap = (tx: Tx, action: string): ConformanceCapability => ConformanceCapability.of(tx, action);
