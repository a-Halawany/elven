/**
 * B33 §PK (0111) — THE PACKAGE CAPABILITIES: one class, a view per port group (the constraint.capabilities idiom). Each write is a thin
 * binding to a SECURITY DEFINER port that asserts the route's own action, the scope and the acting principal; each read is a plain select
 * (or an INVOKER function) under the caller's RLS. Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class PackagesCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  get tx(): Tx { return this.#tx; }
  protected async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.#tx)).rows as T[]; }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const row = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  /** The database's clock (every "as of now" is the database's instant). */
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
}

export interface PackageReads {
  readonly action: string; readonly tx: Tx;
  now(): Promise<string>;
  list(): Promise<Row[]>;
  package(packageId: string): Promise<Row | null>;
  packageByKey(key: string): Promise<Row | null>;
  versions(packageId: string): Promise<Row[]>;
  version(packageId: string, version: number): Promise<Row | null>;
  sectionState(packageId: string, version: number): Promise<Row>;
  runs(packageId: string, limit: number): Promise<Row[]>;
  migrations(packageId: string): Promise<Row[]>;
  ledger(packageId: string, limit: number): Promise<Row[]>;
  facts(packageId: string, version: number): Promise<Row | null>;
  acceptanceFacts(packageId: string, version: number): Promise<Row | null>;
  latestObjectVersion(objectType: 'DPG' | 'DAS', objectId: string): Promise<number | null>;
  diversity(tenantId: string, domainId: string, evidence: unknown[], min: number): Promise<Row>;
  assessments(packageId: string | null, limit: number): Promise<Row[]>;
  assessment(assessmentId: string): Promise<Row[]>;
  assessmentAsOf(assessmentId: string, at: string): Promise<Row | null>;
  watchlists(packageId: string | null): Promise<Row[]>;
  alerts(packageId: string | null, watchlistId: string | null, limit: number): Promise<Row[]>;
  events(packageId: string | null, limit: number): Promise<Row[]>;
  links(packageId: string): Promise<Row[]>;
  items(subjectIds: string[]): Promise<Row[]>;
  activeVersions(): Promise<Array<{ package_id: string; package_key: string; version: number }>>;
}

export interface PackageWrites extends PackageReads {
  declare(a: { packageId: string; tenantId: string; domainId: string; key: string; kind: string; title: string; owner: string; actor: string; correlationId: string }): Promise<Row>;
  propose(a: { packageId: string; tenantId: string; domainId: string; semver: string; manifest: Row; objectVersion: number; actor: string; correlationId: string }): Promise<Row>;
  approveSection(a: { approvalId: string; packageId: string; tenantId: string; domainId: string; version: number; section: string; digest: string; decision: string; reason: string; validDays: number; actor: string; correlationId: string }): Promise<Row>;
  recordRun(a: { runId: string; packageId: string; tenantId: string; domainId: string; version: number; mode: string; suiteVersion: string; checks: unknown[]; factsDigest: string; factsReadAt: string; actor: string; correlationId: string }): Promise<Row>;
  certify(a: { packageId: string; tenantId: string; domainId: string; version: number; reason: string; actor: string; correlationId: string }): Promise<Row>;
  activate(a: { packageId: string; tenantId: string; domainId: string; version: number; objectVersion: number; actor: string; correlationId: string }): Promise<Row>;
  retire(a: { packageId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  recordHealth(a: { runId: string; packageId: string; tenantId: string; domainId: string; version: number; checks: unknown[]; disable: Row; conflict: Row | null; factsDigest: string; factsReadAt: string; actor: string; correlationId: string }): Promise<Row>;
  enable(a: { packageId: string; tenantId: string; domainId: string; version: number; functions: string[]; clearConflict: boolean; reason: string; actor: string; correlationId: string }): Promise<Row>;
  proposeAssessment(a: { assessmentId: string; tenantId: string; domainId: string; key: string; template: string; subjects: string[]; statement: string; confidence: number; evidence: unknown[]; material: boolean | null; actor: string; correlationId: string }): Promise<Row>;
  decideAssessment(a: { assessmentId: string; tenantId: string; domainId: string; version: number; decision: string; note: string; objectVersion: number | null; actor: string; correlationId: string }): Promise<Row>;
  limitAssessment(a: { assessmentId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  declareWatchlist(a: { watchlistId: string; tenantId: string; domainId: string; key: string; title: string; entities: string[]; indicators: string[]; rules: unknown[]; freshnessDays: number; expectedVersion: number; actor: string; correlationId: string }): Promise<Row>;
  retireWatchlist(a: { watchlistId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  recordEvent(a: { eventId: string; tenantId: string; domainId: string; key: string; kind: string; title: string; subjects: string[]; occurredOn: string; evidence: unknown[]; actor: string; correlationId: string }): Promise<Row>;
  confirmEvent(a: { eventId: string; tenantId: string; domainId: string; decision: string; note: string; actor: string; correlationId: string }): Promise<Row>;
  adjudicateAlert(a: { alertId: string; tenantId: string; domainId: string; adjudication: string; note: string; actor: string; correlationId: string }): Promise<Row>;
  resolveAlerts(a: { watchlistId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  declareLink(a: { linkId: string; tenantId: string; domainId: string; key: string; kind: string; targetId: string; assessmentId: string | null; note: string; actor: string; correlationId: string }): Promise<Row>;
  withdrawLink(a: { linkId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  /** objects.admit_version under the bound action (DPG on domain.package.version / .activate; DAS on domain.assessment.approve). */
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
}

const j = (v: unknown) => JSON.stringify(v ?? null);

class PackagesCapabilityImpl extends PackagesCore implements PackageWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }

  async list(): Promise<Row[]> {
    return this.rows(sql`select k.package_id::text, k.package_key, k.domain_kind, k.title, k.owner_principal_id::text, k.state, k.created_at, k.retired_at, k.retire_reason,
        (select p.display_name from identity.principals p where p.id = k.owner_principal_id) as owner_name,
        (select to_jsonb(v) - 'manifest' from domain.package_versions v where v.package_id = k.package_id and v.state = 'active') as active,
        (select to_jsonb(v) - 'manifest' from domain.package_versions v where v.package_id = k.package_id order by v.version desc limit 1) as latest,
        (select jsonb_build_object('run_id', r.run_id, 'mode', r.mode, 'passed', r.passed, 'ran_at', r.ran_at, 'version', r.version) from domain.package_conformance_runs r
          where r.package_id = k.package_id and r.mode in ('certification', 'diagnostic') order by r.ran_at desc limit 1) as conformance,
        (select jsonb_build_object('run_id', r.run_id, 'passed', r.passed, 'ran_at', r.ran_at, 'version', r.version) from domain.package_conformance_runs r
          where r.package_id = k.package_id and r.mode = 'health' order by r.ran_at desc limit 1) as health,
        (select count(*)::int from domain.package_migrations m where m.package_id = k.package_id and m.state = 'open') as open_migrations
      from domain.packages k order by k.state, k.package_key`);
  }
  async package(packageId: string): Promise<Row | null> {
    const r = await this.rows<{ r: Row }>(sql`select to_jsonb(k) || jsonb_build_object('owner_name', (select p.display_name from identity.principals p where p.id = k.owner_principal_id)) as r
      from domain.packages k where k.package_id = ${packageId}::uuid`);
    return r[0]?.r ?? null;
  }
  async packageByKey(key: string): Promise<Row | null> {
    const r = await this.rows<{ r: Row }>(sql`select to_jsonb(k) as r from domain.packages k where k.package_key = ${key}`);
    return r[0]?.r ?? null;
  }
  async versions(packageId: string): Promise<Row[]> {
    return this.rows(sql`select v.package_id::text, v.version, v.semver, v.state, v.manifest, v.manifest_digest, v.disabled_functions, v.conflict, v.object_version,
        v.proposed_by::text, v.proposed_at, v.certified_by::text, v.certified_at, v.activated_by::text, v.activated_at, v.superseded_at, v.retired_at,
        (select p.display_name from identity.principals p where p.id = v.proposed_by) as proposed_by_name,
        (select p.display_name from identity.principals p where p.id = v.certified_by) as certified_by_name
      from domain.package_versions v where v.package_id = ${packageId}::uuid order by v.version desc`);
  }
  async version(packageId: string, version: number): Promise<Row | null> {
    const r = await this.rows<{ r: Row }>(sql`select to_jsonb(v) as r from domain.package_versions v where v.package_id = ${packageId}::uuid and v.version = ${version}::int`);
    return r[0]?.r ?? null;
  }
  async sectionState(packageId: string, version: number): Promise<Row> {
    const r = await this.rows<{ r: Row }>(sql`select domain.dpk_section_state(${packageId}::uuid, ${version}::int) as r`);
    return r[0]?.r ?? {};
  }
  async runs(packageId: string, limit: number): Promise<Row[]> {
    return this.rows(sql`select r.run_id::text, r.version, r.mode, r.suite_version, r.checks, r.passed, r.facts_digest, r.facts_read_at, r.run_by::text, r.run_by_kind, r.ran_at,
        (select p.display_name from identity.principals p where p.id = r.run_by) as run_by_name
      from domain.package_conformance_runs r where r.package_id = ${packageId}::uuid order by r.ran_at desc, r.run_id desc limit ${Math.min(Math.max(limit, 1), 200)}`);
  }
  async migrations(packageId: string): Promise<Row[]> {
    return this.rows(sql`select m.migration_id::text, m.from_version, m.reason, m.functions, m.conflict, m.plan, m.state, m.item_id::text, m.opened_by::text, m.opened_at, m.to_version,
        m.closed_by::text, m.closed_at, m.close_reason
      from domain.package_migrations m where m.package_id = ${packageId}::uuid order by m.opened_at desc`);
  }
  async ledger(packageId: string, limit: number): Promise<Row[]> {
    return this.rows(sql`select e.event_id::text, e.subject_kind, e.subject_id::text, e.version, e.event, e.actor_principal_id::text, e.details, e.occurred_at,
        (select p.display_name from identity.principals p where p.id = e.actor_principal_id) as actor_name
      from domain.package_events e where e.package_id = ${packageId}::uuid order by e.occurred_at desc, e.event_id desc limit ${Math.min(Math.max(limit, 1), 500)}`);
  }
  async facts(packageId: string, version: number): Promise<Row | null> {
    const r = await this.rows<{ r: Row | null }>(sql`select domain.package_facts(${packageId}::uuid, ${version}::int) as r`);
    return r[0]?.r ?? null;
  }
  async acceptanceFacts(packageId: string, version: number): Promise<Row | null> {
    const r = await this.rows<{ r: Row | null }>(sql`select domain.package_acceptance_facts(${packageId}::uuid, ${version}::int) as r`);
    return r[0]?.r ?? null;
  }
  async latestObjectVersion(objectType: 'DPG' | 'DAS', objectId: string): Promise<number | null> {
    const r = await this.rows<{ v: number | null }>(sql`select max(object_version)::int as v from objects.canonical_objects where object_id = ${objectId}::uuid and object_type = ${objectType}`);
    const v = r[0]?.v; return v === undefined || v === null ? null : Number(v);
  }
  async diversity(tenantId: string, domainId: string, evidence: unknown[], min: number): Promise<Row> {
    const r = await this.rows<{ r: Row }>(sql`select domain.dpk_source_diversity(${tenantId}::uuid, ${domainId}::uuid, ${j(evidence)}::jsonb, ${min}::int) as r`);
    return r[0]?.r ?? {};
  }
  async assessments(packageId: string | null, limit: number): Promise<Row[]> {
    return this.rows(sql`select a.assessment_id::text, a.version, a.package_key, a.package_version, a.template, a.subject_entities::text[] as subject_entities, a.statement, a.confidence::float8 as confidence,
        a.evidence, a.source_diversity, a.material, a.state, a.limited_reason, a.proposed_by::text, a.proposed_by_kind, a.proposed_at, a.decided_by::text, a.decided_at, a.decision_note,
        a.limited_at, a.superseded_at, a.object_version,
        (select p.display_name from identity.principals p where p.id = a.proposed_by) as proposed_by_name,
        (select p.display_name from identity.principals p where p.id = a.decided_by) as decided_by_name,
        (select coalesce(jsonb_agg(jsonb_build_object('entity_id', e.entity_id, 'name', e.canonical_name, 'type', e.entity_type)), '[]'::jsonb) from graph.entities_current e where e.entity_id = any(a.subject_entities)) as subjects
      from domain.assessments a where (${packageId}::uuid is null or a.package_id = ${packageId}::uuid)
      order by a.proposed_at desc, a.version desc limit ${Math.min(Math.max(limit, 1), 500)}`);
  }
  async assessment(assessmentId: string): Promise<Row[]> {
    return this.rows(sql`select to_jsonb(a) as r from domain.assessments a where a.assessment_id = ${assessmentId}::uuid order by a.version desc`).then((rows) => rows.map((x) => x['r'] as Row));
  }
  async assessmentAsOf(assessmentId: string, at: string): Promise<Row | null> {
    const r = await this.rows<{ r: Row | null }>(sql`select domain.assessment_as_of(${assessmentId}::uuid, ${at}::timestamptz) as r`);
    return r[0]?.r ?? null;
  }
  async watchlists(packageId: string | null): Promise<Row[]> {
    return this.rows(sql`select w.watchlist_id::text, w.version, w.package_id::text, w.package_key, w.title, w.owner_principal_id::text, w.entities::text[] as entities, w.indicators, w.rules,
        w.freshness_days, w.state, w.declared_at, w.retired_at, w.retire_reason,
        (select p.display_name from identity.principals p where p.id = w.owner_principal_id) as owner_name,
        (select max(x.t) from (select a.decided_at as t from domain.assessments a where a.package_id = w.package_id and a.state in ('approved', 'limited')
                                  and (cardinality(w.entities) = 0 or a.subject_entities && w.entities)
                               union all select e.decided_at from domain.events e where e.package_id = w.package_id and e.state = 'confirmed'
                                  and (cardinality(w.entities) = 0 or e.subject_entities && w.entities)) x) as last_covered_at,
        clock_timestamp() as read_at
      from domain.watchlists w where w.state in ('active', 'retired') and (${packageId}::uuid is null or w.package_id = ${packageId}::uuid)
      order by w.state, w.declared_at desc`);
  }
  async alerts(packageId: string | null, watchlistId: string | null, limit: number): Promise<Row[]> {
    return this.rows(sql`select a.alert_id::text, a.package_key, a.watchlist_id::text, a.watchlist_version, a.rule_key, a.cause_kind, a.cause_id::text, a.cause_version, a.title,
        a.subject_entities::text[] as subject_entities, a.state, a.withheld_reason, a.item_id::text, a.owner_principal_id::text, a.adjudication, a.adjudicated_by::text, a.adjudicated_at,
        a.adjudication_note, a.resolved_by::text, a.resolved_at, a.resolve_reason, a.raised_at,
        (select i.state from executive.attention_items i where i.item_id = a.item_id) as item_state_now,
        (select i.route_roles from executive.attention_items i where i.item_id = a.item_id) as item_route_roles,
        (select p.display_name from identity.principals p where p.id = a.owner_principal_id) as owner_name
      from domain.alerts a where (${packageId}::uuid is null or a.package_id = ${packageId}::uuid) and (${watchlistId}::uuid is null or a.watchlist_id = ${watchlistId}::uuid)
      order by a.raised_at desc limit ${Math.min(Math.max(limit, 1), 500)}`);
  }
  async events(packageId: string | null, limit: number): Promise<Row[]> {
    return this.rows(sql`select e.event_id::text, e.package_key, e.package_version, e.kind, e.title, e.subject_entities::text[] as subject_entities, e.occurred_on::text as occurred_on, e.evidence,
        e.state, e.proposed_by::text, e.proposed_by_kind, e.proposed_at, e.decided_by::text, e.decided_at, e.decision_note
      from domain.events e where (${packageId}::uuid is null or e.package_id = ${packageId}::uuid) order by e.proposed_at desc limit ${Math.min(Math.max(limit, 1), 500)}`);
  }
  async links(packageId: string): Promise<Row[]> {
    return this.rows(sql`select l.link_id::text, l.link_kind, l.target_id::text, l.assessment_id::text, l.note, l.state, l.linked_by::text, l.linked_at, l.withdrawn_at, l.withdraw_reason
      from domain.package_links l where l.package_id = ${packageId}::uuid order by l.state, l.linked_at desc`);
  }
  async items(subjectIds: string[]): Promise<Row[]> {
    if (subjectIds.length === 0) return [];
    return this.rows(sql`select i.item_id::text, i.signal_class, i.subject_kind, i.subject_id::text, i.title, i.outcome, i.state, i.owner_principal_id::text, i.route_roles, i.policy_version, i.created_at, i.closed_at
      from executive.attention_items i where i.subject_id = any(${subjectIds}::uuid[]) and i.signal_class in ('domain.package', 'domain.alert') order by i.created_at desc`);
  }
  async activeVersions(): Promise<Array<{ package_id: string; package_key: string; version: number }>> {
    return this.rows(sql`select k.package_id::text, k.package_key, v.version from domain.packages k join domain.package_versions v on v.package_id = k.package_id and v.state = 'active'
      where k.state = 'declared' order by k.package_key`);
  }

  async declare(a: Parameters<PackageWrites['declare']>[0]): Promise<Row> {
    return this.one(sql`select domain.declare_package(${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.key}, ${a.kind}, ${a.title}, ${a.owner}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_package');
  }
  async propose(a: Parameters<PackageWrites['propose']>[0]): Promise<Row> {
    return this.one(sql`select domain.propose_package_version(${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.semver}, ${j(a.manifest)}::jsonb, ${a.objectVersion}::int,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_package_version');
  }
  async approveSection(a: Parameters<PackageWrites['approveSection']>[0]): Promise<Row> {
    return this.one(sql`select domain.approve_package_section(${a.approvalId}::uuid, ${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.section}, ${a.digest},
      ${a.decision}, ${a.reason}, ${a.validDays}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'approve_package_section');
  }
  async recordRun(a: Parameters<PackageWrites['recordRun']>[0]): Promise<Row> {
    return this.one(sql`select domain.record_package_run(${a.runId}::uuid, ${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.mode}, ${a.suiteVersion},
      ${j(a.checks)}::jsonb, ${a.factsDigest}, ${a.factsReadAt}::timestamptz, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_package_run');
  }
  async certify(a: Parameters<PackageWrites['certify']>[0]): Promise<Row> {
    return this.one(sql`select domain.certify_package_version(${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'certify_package_version');
  }
  async activate(a: Parameters<PackageWrites['activate']>[0]): Promise<Row> {
    return this.one(sql`select domain.activate_package_version(${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.objectVersion}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'activate_package_version');
  }
  async retire(a: Parameters<PackageWrites['retire']>[0]): Promise<Row> {
    return this.one(sql`select domain.retire_package(${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'retire_package');
  }
  async recordHealth(a: Parameters<PackageWrites['recordHealth']>[0]): Promise<Row> {
    return this.one(sql`select domain.record_package_health(${a.runId}::uuid, ${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${j(a.checks)}::jsonb, ${j(a.disable)}::jsonb,
      ${a.conflict === null ? null : j(a.conflict)}::jsonb, ${a.factsDigest}, ${a.factsReadAt}::timestamptz, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_package_health');
  }
  async enable(a: Parameters<PackageWrites['enable']>[0]): Promise<Row> {
    return this.one(sql`select domain.enable_package_function(${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.functions}::text[], ${a.clearConflict}, ${a.reason},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'enable_package_function');
  }
  async proposeAssessment(a: Parameters<PackageWrites['proposeAssessment']>[0]): Promise<Row> {
    return this.one(sql`select domain.propose_assessment(${a.assessmentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.key}, ${a.template}, ${a.subjects}::uuid[], ${a.statement},
      ${a.confidence}::numeric, ${j(a.evidence)}::jsonb, ${a.material}::boolean, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_assessment');
  }
  async decideAssessment(a: Parameters<PackageWrites['decideAssessment']>[0]): Promise<Row> {
    return this.one(sql`select domain.decide_assessment(${a.assessmentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.decision}, ${a.note}, ${a.objectVersion}::int,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_assessment');
  }
  async limitAssessment(a: Parameters<PackageWrites['limitAssessment']>[0]): Promise<Row> {
    return this.one(sql`select domain.limit_assessment(${a.assessmentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'limit_assessment');
  }
  async declareWatchlist(a: Parameters<PackageWrites['declareWatchlist']>[0]): Promise<Row> {
    return this.one(sql`select domain.declare_watchlist(${a.watchlistId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.key}, ${a.title}, ${a.entities}::uuid[], ${a.indicators}::text[],
      ${j(a.rules)}::jsonb, ${a.freshnessDays}::int, ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_watchlist');
  }
  async retireWatchlist(a: Parameters<PackageWrites['retireWatchlist']>[0]): Promise<Row> {
    return this.one(sql`select domain.retire_watchlist(${a.watchlistId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'retire_watchlist');
  }
  async recordEvent(a: Parameters<PackageWrites['recordEvent']>[0]): Promise<Row> {
    return this.one(sql`select domain.record_domain_event(${a.eventId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.key}, ${a.kind}, ${a.title}, ${a.subjects}::uuid[], ${a.occurredOn}::date,
      ${j(a.evidence)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_domain_event');
  }
  async confirmEvent(a: Parameters<PackageWrites['confirmEvent']>[0]): Promise<Row> {
    return this.one(sql`select domain.confirm_domain_event(${a.eventId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'confirm_domain_event');
  }
  async adjudicateAlert(a: Parameters<PackageWrites['adjudicateAlert']>[0]): Promise<Row> {
    return this.one(sql`select domain.adjudicate_alert(${a.alertId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.adjudication}, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'adjudicate_alert');
  }
  async resolveAlerts(a: Parameters<PackageWrites['resolveAlerts']>[0]): Promise<Row> {
    return this.one(sql`select domain.resolve_alerts(${a.watchlistId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'resolve_alerts');
  }
  async declareLink(a: Parameters<PackageWrites['declareLink']>[0]): Promise<Row> {
    return this.one(sql`select domain.declare_package_link(${a.linkId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.key}, ${a.kind}, ${a.targetId}::uuid, ${a.assessmentId}::uuid, ${a.note},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_package_link');
  }
  async withdrawLink(a: Parameters<PackageWrites['withdrawLink']>[0]): Promise<Row> {
    return this.one(sql`select domain.withdraw_package_link(${a.linkId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'withdraw_package_link');
  }
  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.rows<{ content_digest: string }>(sql`select content_digest from objects.admit_version(${j(header)}::jsonb, ${j(payload)}::jsonb, ${digest})`);
    const r = rows[0]; if (r === undefined) throw new Error('admission returned no row'); return { contentDigest: r.content_digest };
  }
}

export const PackageCapability = {
  read(tx: Tx, action: string): PackageReads { return new PackagesCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): PackageWrites { return new PackagesCapabilityImpl(tx, action); },
};
