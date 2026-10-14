/**
 * B107 §RG (0115_b107_x_rg) — THE REGISTRIES CAPABILITY: one class over the pipeline's transaction. Each write is a thin binding to a SECURITY
 * DEFINER port of governance.rg_* that asserts the route's own action, the PLATFORM scope and the acting principal (and re-checks every
 * human, role and separation-of-duties rule); each read is a plain select or an INVOKER function under the caller's RLS. Nothing here
 * decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';
import type { SourcePlan } from './importers.js';
import type { VerificationReport } from './reports.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);

export class RegistriesCapability {
  readonly #tx: Tx; readonly #action: string;
  private constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  static of(tx: Tx, action: string): RegistriesCapability { return new RegistriesCapability(tx, action); }
  get action(): string { return this.#action; }
  private async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.#tx)).rows as T[]; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (r === undefined || r === null) throw new Error(`${what} returned no row`);
    return r;
  }
  async now(): Promise<string> { const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx); return (r.rows[0]?.now ?? new Date()).toISOString(); }
  async today(): Promise<string> { const r = await sql<{ d: string }>`select to_char(current_date, 'YYYY-MM-DD') as d`.execute(this.#tx); return r.rows[0]?.d ?? new Date().toISOString().slice(0, 10); }

  // ───────────────────────── reads ─────────────────────────
  dbIdentity() { return this.one(sql`select governance.rg_build_identity() as r`, 'rg_build_identity'); }
  /** The latest import of every source (what was imported, when, by whom, with which digest). */
  async latestImports(): Promise<Row[]> {
    return this.rows(sql`select distinct on (i.source_path) i.import_id::text, i.source_kind, i.source_path, i.source_digest, i.parser_version, i.row_count, i.counts, i.unresolved,
        i.build_identity, i.imported_by::text, governance.rg_principal_name(i.imported_by) as imported_by_name, i.imported_at, i.detail
      from governance.rg_imports i order by i.source_path, i.imported_at desc, i.import_id desc`);
  }
  async counts(): Promise<Row[]> {
    return this.rows(sql`select a.kind, a.lifecycle, count(*)::int as n from governance.artifacts a where a.superseded_at is null and a.scope = 'PLATFORM' group by 1, 2 order by 1, 2`);
  }
  orphans(rule: string | null, limit: number, offset: number) { return this.one(sql`select governance.rg_orphans(${rule}, ${limit}::int, ${offset}::int) as r`, 'rg_orphans'); }
  lint(limit: number) { return this.one(sql`select governance.rg_lint(${limit}::int) as r`, 'rg_lint'); }
  trace(id: string, depth: number, asOf: string | null) { return this.one(sql`select governance.rg_trace(${id}::uuid, ${depth}::int, ${asOf}::timestamptz) as r`, 'rg_trace'); }
  impact(changes: Row[], depth: number) { return this.one(sql`select governance.rg_impact(${j(changes)}::jsonb, ${depth}::int) as r`, 'rg_impact'); }
  inheritance(id: string) { return this.one(sql`select governance.rg_inheritance(${id}::uuid) as r`, 'rg_inheritance'); }
  admission(id: string) { return this.one(sql`select governance.rg_admission_check(${id}::uuid) as r`, 'rg_admission_check'); }
  snapshot(kinds: string[]) { return this.one(sql`select governance.rg_snapshot(${kinds}::text[]) as r`, 'rg_snapshot'); }
  /** Every version of an identity, and the one in force at an instant (ES-03-004: a superseded requirement stays resolvable). */
  async resolve(kind: string, key: string, asOf: string | null): Promise<Row> {
    const versions = await this.rows(sql`select a.artifact_id::text, a.version, a.kind, a.external_key, a.title, a.lifecycle, a.authority_class, a.controlling_volume, a.owner_role,
        a.owner_principal_id::text, a.attributes, a.source, a.digest, a.effective_from, a.superseded_at
      from governance.artifacts a where a.kind = ${kind} and a.external_key = ${key} and a.scope = 'PLATFORM' order by a.version`);
    const at = asOf === null ? versions.find((v) => v['superseded_at'] === null) ?? null
      : (await this.rows(sql`select a.version from governance.artifacts a where a.kind = ${kind} and a.external_key = ${key} and a.scope = 'PLATFORM'
           and a.effective_from <= ${asOf}::timestamptz and (a.superseded_at is null or a.superseded_at > ${asOf}::timestamptz) order by a.version desc limit 1`))[0] ?? null;
    const version = at === null ? null : Number(at['version']);
    return { kind, key, as_of: asOf, versions, in_force: version === null ? null : versions.find((v) => Number(v['version']) === version) ?? null,
             dependents: versions.length === 0 ? [] : await this.rows(sql`select l.from_artifact::text, f.kind, f.external_key, l.relation from governance.links_live l
               join governance.artifacts f on f.artifact_id = l.from_artifact and f.superseded_at is null where l.to_artifact = ${String(versions[0]!['artifact_id'])}::uuid
               order by f.kind, f.external_key limit 200`) };
  }
  async search(q: string, kind: string | null, limit: number): Promise<Row[]> {
    const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    return this.rows(sql`select a.artifact_id::text, a.kind, a.external_key, a.title, a.version, a.lifecycle, a.authority_class, a.controlling_volume
      from governance.artifacts a where a.superseded_at is null and (${kind}::text is null or a.kind = ${kind})
        and (a.external_key ilike ${like} or a.title ilike ${like}) order by (a.external_key = ${q}) desc, a.kind, a.external_key limit ${limit}::int`);
  }
  async artifactId(kind: string, key: string): Promise<string | null> {
    return (await this.rows<{ id: string }>(sql`select a.artifact_id::text as id from governance.artifacts a where a.kind = ${kind} and a.external_key = ${key} and a.superseded_at is null limit 1`))[0]?.id ?? null;
  }
  async impacts(limit: number): Promise<Row[]> {
    return this.rows(sql`select i.impact_id::text, i.trigger, i.trigger_ref::text, i.input, i.counts, jsonb_array_length(i.dependents) as dependents, jsonb_array_length(i.stale_verifications) as stale,
        i.held, i.digest, i.truncated, i.recorded_by::text, governance.rg_principal_name(i.recorded_by) as recorded_by_name, i.recorded_at, governance.rg_impact_open(i.impact_id) as still_stale
      from governance.rg_impacts i order by i.recorded_at desc limit ${limit}::int`);
  }
  async impactRecord(id: string): Promise<Row | null> {
    return (await this.rows(sql`select i.*, governance.rg_impact_open(i.impact_id) as still_stale from governance.rg_impacts i where i.impact_id = ${id}::uuid`))[0] ?? null;
  }
  /** The holds §RG opened (and every open hold on an artifact, whoever opened it), each with its origin. */
  async holds(limit: number): Promise<Row[]> {
    return this.rows(sql`select h.hold_id::text, h.subject_artifact::text, a.kind, a.external_key, h.reason_kind, h.reason, h.opened_at, h.lifted_at, h.lift_reason,
        governance.rg_principal_name(h.opened_by) as opened_by_name, o.origin, o.origin_artifact::text, o.impact_id::text
      from governance.holds h left join governance.rg_hold_origins o on o.hold_id = h.hold_id
      left join governance.artifacts a on a.artifact_id = h.subject_artifact and a.superseded_at is null
      where h.lifted_at is null or o.hold_id is not null order by (h.lifted_at is null) desc, h.opened_at desc limit ${limit}::int`);
  }
  async verificationRecords(limit: number): Promise<Row[]> {
    return this.rows(sql`select r.record_id::text, r.source_kind, r.source_name, r.source_digest, r.result, r.totals, r.valid_until, r.claim, r.identity, r.execution, r.validity, r.build_identity,
        r.ingested_at, governance.rg_principal_name(r.ingested_by) as ingested_by_name, r.ingested_by::text,
        r.valid_until <= clock_timestamp() as expired,
        exists (select 1 from governance.rg_invalidations i where i.record_id = r.record_id) as invalidated,
        (select count(*)::int from governance.rg_verification_cases c join governance.artifacts t on t.artifact_id = c.test_artifact and t.superseded_at is null where c.record_id = r.record_id and c.test_version <> t.version) as cases_on_moved_tests,
        (select coalesce(jsonb_agg(jsonb_build_object('decision', v.decision, 'reviewer', governance.rg_principal_name(v.reviewer), 'reason', v.reason, 'reviewed_at', v.reviewed_at) order by v.reviewed_at), '[]'::jsonb)
           from governance.rg_verification_reviews v where v.record_id = r.record_id) as reviews
      from governance.rg_verification_records r order by r.ingested_at desc limit ${limit}::int`);
  }
  async verificationCases(recordId: string): Promise<Row[]> {
    return this.rows(sql`select c.case_no, c.status, c.duration_ms, c.cited, t.external_key as test_key, t.title as test_title, c.test_version, t.version as test_current_version,
        (select coalesce(jsonb_agg(a.external_key order by a.external_key), '[]'::jsonb) from governance.artifacts a where a.artifact_id = any (c.resolved) and a.superseded_at is null) as verifies,
        (select coalesce(jsonb_agg(jsonb_build_object('key', a.external_key, 'lifecycle', a.lifecycle) order by a.external_key), '[]'::jsonb) from governance.artifacts a where a.artifact_id = any (c.fixtures) and a.superseded_at is null) as fixtures
      from governance.rg_verification_cases c join governance.artifacts t on t.artifact_id = c.test_artifact and t.superseded_at is null where c.record_id = ${recordId}::uuid order by c.case_no`);
  }
  async verificationRecord(recordId: string): Promise<Row | null> {
    return (await this.rows(sql`select r.record_id::text, r.source_digest, r.ingested_by::text, r.result from governance.rg_verification_records r where r.record_id = ${recordId}::uuid`))[0] ?? null;
  }
  async fixtures(): Promise<Row[]> {
    return this.rows(sql`select a.artifact_id::text, a.external_key, a.title, a.version, a.lifecycle, a.attributes, a.digest, a.effective_from,
        (a.attributes->>'valid_until')::timestamptz <= clock_timestamp() as expired,
        (select count(*)::int from governance.links_live l where l.to_artifact = a.artifact_id and l.relation = 'consumes') as consumers,
        (select coalesce(jsonb_agg(jsonb_build_object('decision', d.decision, 'version', d.fixture_version, 'reason_class', d.reason_class, 'reason', d.reason,
                  'actor', governance.rg_principal_name(d.actor), 'at', d.decided_at) order by d.decided_at), '[]'::jsonb) from governance.rg_fixture_decisions d where d.fixture_artifact = a.artifact_id) as decisions,
        (select coalesce(jsonb_agg(distinct v.recorded_by), '[]'::jsonb) from governance.artifacts v where v.artifact_id = a.artifact_id) as registered_by
      from governance.artifacts a where a.kind = 'fixture' and a.superseded_at is null order by a.external_key`);
  }
  async fixture(id: string): Promise<Row | null> {
    return (await this.rows(sql`select a.artifact_id::text, a.external_key, a.version, a.lifecycle, a.digest, a.attributes from governance.artifacts a where a.artifact_id = ${id}::uuid and a.kind = 'fixture' and a.superseded_at is null`))[0] ?? null;
  }
  async expiredFixtures(): Promise<Row[]> {
    return this.rows(sql`select a.artifact_id::text, a.external_key, a.attributes->>'valid_until' as valid_until from governance.artifacts a where a.kind = 'fixture' and a.superseded_at is null
      and a.lifecycle in ('active', 'proposed') and (a.attributes->>'valid_until')::timestamptz <= clock_timestamp() order by a.external_key`);
  }
  /** The engineering exceptions imported from EXCEPTIONS.md (read only), for the expiry REPORT (non-blocking; renewal is the owner's). */
  async engineeringExceptions(): Promise<Row[]> {
    return this.rows(sql`select a.external_key, a.title, a.lifecycle, a.attributes->>'status' as status, a.attributes->>'expiry_date' as expiry_date, a.attributes->>'owner_declared' as owner_declared
      from governance.artifacts a where a.kind = 'exception' and a.superseded_at is null and a.attributes->>'class' = 'engineering' order by a.external_key`);
  }
  async interfaceRows(): Promise<Row[]> {
    return this.rows(sql`select interface_id, layer, layer_name, name, style, contract, transport, reliability, failure, binding_state, bound_to, schema_version, requirement from objects.interface_register order by interface_id`);
  }
  async schemaRows(): Promise<Row[]> {
    return this.rows(sql`select object_type, schema_version, json_schema, compatibility from objects.schema_registry order by object_type, schema_version`);
  }
  async ledger(limit: number): Promise<Row[]> {
    return this.rows(sql`select e.event_id::text, e.subject_kind, e.subject_id::text, e.version, e.event, governance.rg_principal_name(e.actor_principal_id) as actor_name, e.details, e.occurred_at
      from governance.events e where e.scope = 'PLATFORM' and e.event in ('registry.imported', 'registry.registered', 'trace.linked', 'trace.link_retired', 'impact.recorded', 'inheritance.held',
        'inheritance.restored', 'verification.ingested', 'verification.reviewed', 'fixture.registered', 'fixture.rebuilt', 'fixture.approved', 'fixture.quarantined')
      order by e.occurred_at desc limit ${limit}::int`);
  }

  // ───────────────────────── writes (the ports) ─────────────────────────
  import(a: { plan: SourcePlan; build: Row; actor: string; importId: string; correlationId: string }) {
    const p = a.plan;
    return this.one(sql`select governance.rg_import(${p.source_kind}, ${p.source_path}, ${p.source_digest}, ${p.parser}, ${j(p.detail)}::jsonb, ${j(p.items)}::jsonb, ${j(p.links)}::jsonb,
      ${j(a.build)}::jsonb, ${a.actor}::uuid, ${a.importId}::uuid, ${a.correlationId}::uuid) as r`, 'rg_import');
  }
  register(a: { kind: string; key: string; expectedVersion: number; title: string; authorityClass: string; volume: string | null; lifecycle: string; attributes: Row; supersedes: string | null;
                parent: string | null; owner: string | null; ownerRole: string | null; actor: string; correlationId: string }) {
    return this.one(sql`select governance.rg_register(${a.kind}, ${a.key}, ${a.expectedVersion}::int, ${a.title}, ${a.authorityClass}, ${a.volume}, ${a.lifecycle}, ${j(a.attributes)}::jsonb,
      ${a.supersedes}::uuid, ${a.parent}::uuid, ${a.owner}::uuid, ${a.ownerRole}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'rg_register');
  }
  link(a: { from: string; to: string; relation: string; attributes: Row; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.rg_link(${a.from}::uuid, ${a.to}::uuid, ${a.relation}, ${j(a.attributes)}::jsonb, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'rg_link');
  }
  retireLink(a: { linkId: string; reason: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.rg_retire_link(${a.linkId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'rg_retire_link');
  }
  recordImpact(a: { impactId: string; changes: Row[]; depth: number; expectedDigest: string | null; trigger: string; triggerRef: string | null; build: Row; actor: string; correlationId: string }) {
    return this.one(sql`select governance.rg_record_impact(${a.impactId}::uuid, ${j(a.changes)}::jsonb, ${a.depth}::int, ${a.expectedDigest}, ${a.trigger}, ${a.triggerRef}::uuid, ${j(a.build)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'rg_record_impact');
  }
  reconcile(a: { ids: string[]; actor: string; correlationId: string }) {
    return this.one(sql`select governance.rg_reconcile_inheritance(${a.ids}::uuid[], ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'rg_reconcile_inheritance');
  }
  ingest(a: { recordId: string; report: VerificationReport & { valid_until: string; claim: string }; build: Row; actor: string; correlationId: string }) {
    return this.one(sql`select governance.rg_ingest_verification(${a.recordId}::uuid, ${j(a.report)}::jsonb, ${j(a.build)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'rg_ingest_verification');
  }
  review(a: { recordId: string; decision: string; digest: string; reason: string; reviewId: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.rg_review_verification(${a.recordId}::uuid, ${a.decision}, ${a.digest}, ${a.reason}, ${a.reviewId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'rg_review_verification');
  }
  registerFixture(a: { key: string; expectedVersion: number; title: string; attributes: Row; reason: string; decisionId: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.rg_register_fixture(${a.key}, ${a.expectedVersion}::int, ${a.title}, ${j(a.attributes)}::jsonb, ${a.reason}, ${a.decisionId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'rg_register_fixture');
  }
  approveFixture(a: { fixtureId: string; version: number; digest: string; reason: string; decisionId: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.rg_approve_fixture(${a.fixtureId}::uuid, ${a.version}::int, ${a.digest}, ${a.reason}, ${a.decisionId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'rg_approve_fixture');
  }
  quarantineFixture(a: { fixtureId: string; reasonClass: string; reason: string; decisionId: string; actor: string; correlationId: string }) {
    return this.one(sql`select governance.rg_quarantine_fixture(${a.fixtureId}::uuid, ${a.reasonClass}, ${a.reason}, ${a.decisionId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'rg_quarantine_fixture');
  }
}

export const RegistriesCap = (tx: Tx, action: string): RegistriesCapability => RegistriesCapability.of(tx, action);
