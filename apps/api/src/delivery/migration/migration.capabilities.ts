/**
 * B94 §MG (0114 §MG) — THE MIGRATION CAPABILITIES: one class, a read view and a write view (the packages.capabilities idiom). Each write is a
 * thin binding to a SECURITY DEFINER port that asserts the route's own action, the scope and the acting principal; each read is a plain select
 * under the caller's RLS or a guarded definer read (observation.assert_read_scope). Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);

abstract class MigrationCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  protected async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.#tx)).rows as T[]; }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const row = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  protected async value<T>(q: ReturnType<typeof sql>): Promise<T | null> {
    const row = ((await q.execute(this.#tx)).rows as Array<{ r: T | null }>)[0]?.r;
    return row ?? null;
  }
  /** The signer's statement runner (SignatureService.sign — executive.record_signature asserts the bound action). */
  async call<T>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.#tx)).rows as T[]; }
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
}

export interface MigrationReads {
  readonly action: string;
  now(): Promise<string>;
  programmes(): Promise<Row[]>;
  waves(domainId: string | null): Promise<Row[]>;
  wave(waveId: string): Promise<Row | null>;
  mappings(waveId: string): Promise<Row[]>;
  rehearsals(waveId: string): Promise<Row[]>;
  rehearsal(rehearsalId: string): Promise<Row | null>;
  staging(rehearsalId: string): Promise<Row[]>;
  cutovers(waveId: string): Promise<Row[]>;
  cutover(cutoverId: string): Promise<Row | null>;
  executed(cutoverId: string): Promise<Row[]>;
  rollbacks(waveId: string): Promise<Row[]>;
  acceptances(waveId: string): Promise<Row[]>;
  ledger(subjectIds: string[], limit: number): Promise<Row[]>;
  items(subjectIds: string[]): Promise<Row[]>;
  signatures(kind: string, subjectId: string, version: number): Promise<Row[]>;
  ownerResolution(t: string, d: string, key: string): Promise<Row | null>;
  blocking(t: string, d: string, waveId: string, rehearsalId: string): Promise<Row[]>;
  postObserved(cutoverId: string): Promise<Row | null>;
  rollbackPlan(cutoverId: string): Promise<Row | null>;
  acceptanceCandidate(t: string, d: string, waveId: string, journeys: string[], roles: string[], baselineDigest: string | null): Promise<{ candidate: Row; digest: string }>;
  evidence(t: string, d: string, sourceId: string, evidenceId: string): Promise<Row>;
  evidencesOfSource(sourceId: string): Promise<Row[]>;
  domainLifecycle(t: string, d: string): Promise<Row | null>;
  digestOf(v: unknown): Promise<string>;
}

export interface MigrationWrites extends MigrationReads {
  /** The signer's statement runner (executive.record_signature under the bound action). */
  call<T>(q: ReturnType<typeof sql>): Promise<T[]>;
  openWave(a: { waveId: string; t: string; d: string; programmeId: string; key: string; title: string; sourceId: string; system: string; authority: string; actor: string; correlationId: string }): Promise<Row>;
  withdrawWave(a: { waveId: string; t: string; d: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  proposeMapping(a: { waveId: string; t: string; d: string; spec: unknown; basis: string; rationale: string; expectedVersion: number | null; actor: string; correlationId: string }): Promise<Row>;
  decideMapping(a: { waveId: string; t: string; d: string; version: number; digest: string; decision: string; reason: string; signatureId: string | null; actor: string; correlationId: string }): Promise<Row>;
  recordRehearsal(a: { rehearsalId: string; waveId: string; t: string; d: string; evidenceId: string; bytesDigest: string; mappingVersion: number; columns: string[]; rows: unknown[]; formulaCells: string[]; actor: string; correlationId: string }): Promise<Row>;
  requestCutover(a: { cutoverId: string; waveId: string; t: string; d: string; rehearsalId: string; actor: string; correlationId: string }): Promise<Row>;
  recheckCutover(a: { cutoverId: string; t: string; d: string; actor: string; correlationId: string }): Promise<Row>;
  approveCutover(a: { cutoverId: string; t: string; d: string; digest: string; reason: string; signatureId: string | null; actor: string; correlationId: string }): Promise<Row>;
  beginExecution(a: { cutoverId: string; t: string; d: string; bytesDigest: string; columns: string[]; rows: unknown[]; actor: string; correlationId: string }): Promise<Row>;
  executeRow(a: { cutoverId: string; t: string; d: string; rowNo: number; entityId: string; identifierId: string; actor: string; correlationId: string }): Promise<Row>;
  recordFailedRow(a: { cutoverId: string; t: string; d: string; rowNo: number; reason: string; actor: string; correlationId: string }): Promise<void>;
  completeExecution(a: { cutoverId: string; t: string; d: string; actor: string; correlationId: string }): Promise<Row>;
  reconcile(a: { rehearsalId: string; cutoverId: string; t: string; d: string; actor: string; correlationId: string }): Promise<Row>;
  activate(a: { domainId: string; t: string; cutoverId: string; actor: string; correlationId: string }): Promise<Row>;
  rehearseRollback(a: { rollbackId: string; cutoverId: string; t: string; d: string; actor: string; correlationId: string }): Promise<Row>;
  executeRollback(a: { rollbackId: string; rehearsalId: string; cutoverId: string; t: string; d: string; digest: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  decideAcceptance(a: { acceptanceId: string; waveId: string; t: string; d: string; decision: string; journeys: string[]; roles: string[]; baselineDigest: string | null; digest: string; reason: string; signatureId: string | null; actor: string; correlationId: string }): Promise<Row>;
  /** A refused row must not abort the execution's transaction: each row runs under its own savepoint (the B16 admit idiom). */
  savepoint(name: string): Promise<void>;
  rollbackToSavepoint(name: string): Promise<void>;
  releaseSavepoint(name: string): Promise<void>;
}

class MigrationCapabilityImpl extends MigrationCore implements MigrationWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }

  // ── reads ──────────────────────────────────────────────────────────────────────────────────────
  async programmes(): Promise<Row[]> {
    return this.rows(sql`select p.programme_id::text, p.version, p.programme_key, p.title, p.target_domain_id::text, p.deployment_profile, p.state, p.held_reasons, p.digest, p.effective_from,
        (select d.name from tenancy.domains d where d.id = p.target_domain_id) as target_domain_name,
        (select count(*)::int from onboarding.migration_waves w where w.programme_id = p.programme_id) as waves
      from onboarding.programmes p where p.superseded_at is null order by p.effective_from desc`);
  }
  async waves(domainId: string | null): Promise<Row[]> {
    return this.rows(sql`select w.wave_id::text, w.domain_id::text, w.programme_id::text, w.wave_key, w.title, w.source_id::text, w.identifier_system, w.state, w.held, w.held_reasons, w.created_at, w.updated_at,
        (select p.programme_key from onboarding.programmes p where p.programme_id = w.programme_id and p.superseded_at is null) as programme_key
      from onboarding.migration_waves w where (${domainId}::uuid is null or w.domain_id = ${domainId}::uuid) order by w.created_at desc`);
  }
  async wave(waveId: string): Promise<Row | null> {
    return this.value(sql`select to_jsonb(w) || jsonb_build_object('created_by_name', (select p.display_name from identity.principals p where p.id = w.created_by)) as r
      from onboarding.migration_waves w where w.wave_id = ${waveId}::uuid`);
  }
  async mappings(waveId: string): Promise<Row[]> {
    return this.rows(sql`select m.version, m.spec, m.digest, m.basis, m.rationale, m.state, m.proposed_by::text, m.proposed_by_kind, m.proposed_at, m.decided_by::text, m.decided_at, m.decision_reason, m.signature_id::text,
        (select p.display_name from identity.principals p where p.id = m.proposed_by) as proposed_by_name,
        (select p.display_name from identity.principals p where p.id = m.decided_by) as decided_by_name
      from onboarding.migration_mappings m where m.wave_id = ${waveId}::uuid order by m.version desc`);
  }
  async rehearsals(waveId: string): Promise<Row[]> {
    return this.rows(sql`select r.rehearsal_id::text, r.seq, r.kind, r.mapping_version, r.mapping_digest, r.mapping_state, r.input, r.columns, r.unmapped_columns, r.missing_columns, r.counts, r.blocking,
        r.input_digest, r.plan_digest, r.cutover_id::text, r.compared_to::text, r.equal, r.ran_by::text, r.ran_by_kind, r.ran_at,
        (select p.display_name from identity.principals p where p.id = r.ran_by) as ran_by_name
      from onboarding.migration_rehearsals r where r.wave_id = ${waveId}::uuid order by r.seq desc`);
  }
  async rehearsal(rehearsalId: string): Promise<Row | null> {
    return this.value(sql`select to_jsonb(r) as r from onboarding.migration_rehearsals r where r.rehearsal_id = ${rehearsalId}::uuid`);
  }
  async staging(rehearsalId: string): Promise<Row[]> {
    return this.rows(sql`select s.row_no, s.legacy_id, s.name, s."values", s.disposition, s.reasons, s.formula_cells, s.match_entity_id::text,
        (select e.canonical_name from graph.entities_current e where e.entity_id = s.match_entity_id) as match_name
      from onboarding.migration_staging s where s.rehearsal_id = ${rehearsalId}::uuid order by s.row_no`);
  }
  async cutovers(waveId: string): Promise<Row[]> {
    return this.rows(sql`select c.cutover_id::text, c.rehearsal_id::text, c.plan_digest, c.mapping_version, c.state, c.held, c.held_reasons, c.requested_by::text, c.requested_at, c.approved_by::text, c.approved_at,
        c.approval_reason, c.signature_id::text, c.executed_by::text, c.executed_by_kind, c.executed_at, c.execution, c.verified_at, c.post_rehearsal_id::text, c.activated_at, c.rolled_back_at, c.updated_at,
        (select p.display_name from identity.principals p where p.id = c.requested_by) as requested_by_name,
        (select p.display_name from identity.principals p where p.id = c.approved_by) as approved_by_name
      from onboarding.migration_cutovers c where c.wave_id = ${waveId}::uuid order by c.requested_at desc`);
  }
  async cutover(cutoverId: string): Promise<Row | null> {
    return this.value(sql`select to_jsonb(c) as r from onboarding.migration_cutovers c where c.cutover_id = ${cutoverId}::uuid`);
  }
  async executed(cutoverId: string): Promise<Row[]> {
    return this.rows(sql`select x.row_no, x.legacy_id, x.outcome, x.entity_id::text, x.identifier_id::text, x.reason, x.executed_at,
        (select e.lifecycle_state from graph.entities_current e where e.entity_id = x.entity_id) as entity_state
      from onboarding.migration_executed_rows x where x.cutover_id = ${cutoverId}::uuid order by x.row_no`);
  }
  async rollbacks(waveId: string): Promise<Row[]> {
    return this.rows(sql`select b.rollback_id::text, b.cutover_id::text, b.kind, b.plan, b.digest, b.rehearsal_of::text, b.reason, b.recorded_by::text, b.recorded_at,
        (select p.display_name from identity.principals p where p.id = b.recorded_by) as recorded_by_name
      from onboarding.migration_rollbacks b join onboarding.migration_cutovers c on c.cutover_id = b.cutover_id where c.wave_id = ${waveId}::uuid order by b.recorded_at desc`);
  }
  async acceptances(waveId: string): Promise<Row[]> {
    return this.rows(sql`select a.acceptance_id::text, a.cutover_id::text, a.decision, a.claim, a.bound, a.digest, a.reason, a.decided_by::text, a.decided_at, a.signature_id::text,
        (select p.display_name from identity.principals p where p.id = a.decided_by) as decided_by_name
      from onboarding.migration_acceptances a where a.wave_id = ${waveId}::uuid order by a.decided_at desc`);
  }
  async ledger(subjectIds: string[], limit: number): Promise<Row[]> {
    if (subjectIds.length === 0) return [];
    return this.rows(sql`select e.event_id::text, e.subject_kind, e.subject_id::text, e.version, e.event, e.actor_principal_id::text, e.details, e.occurred_at, e.correlation_id::text,
        (select p.display_name from identity.principals p where p.id = e.actor_principal_id) as actor_name
      from onboarding.events e where e.subject_id = any(${subjectIds}::uuid[]) or (e.details ->> 'wave_id') = any(${subjectIds}::text[])
      order by e.occurred_at, e.event_id limit ${limit}::int`);
  }
  async items(subjectIds: string[]): Promise<Row[]> {
    if (subjectIds.length === 0) return [];
    return this.rows(sql`select i.item_id::text, i.signal_class, i.subject_kind, i.subject_id::text, i.title, i.state, i.outcome, i.route_roles, i.owner_principal_id::text, i.created_at, i.closed_at
      from executive.attention_items i where i.subject_id = any(${subjectIds}::uuid[]) order by i.created_at desc`);
  }
  async signatures(kind: string, subjectId: string, version: number): Promise<Row[]> {
    const r = await this.value<Row[]>(sql`select executive.signature_of(${kind}, ${subjectId}::uuid, ${version}::int) as r`);
    return Array.isArray(r) ? r : [];
  }
  async ownerResolution(t: string, d: string, key: string): Promise<Row | null> {
    return this.value(sql`select service.owner_resolution(${t}::uuid, ${d}::uuid, ${key}) as r`);
  }
  async blocking(t: string, d: string, waveId: string, rehearsalId: string): Promise<Row[]> {
    const r = await this.value<Row[]>(sql`select onboarding.mg_cutover_blocking(${t}::uuid, ${d}::uuid, ${waveId}::uuid, ${rehearsalId}::uuid) as r`);
    return Array.isArray(r) ? r : [];
  }
  async postObserved(cutoverId: string): Promise<Row | null> {
    return this.value(sql`select onboarding.mg_post_observed(${cutoverId}::uuid) as r`);
  }
  async rollbackPlan(cutoverId: string): Promise<Row | null> {
    return this.value(sql`select onboarding.mg_rollback_plan(${cutoverId}::uuid) as r`);
  }
  async acceptanceCandidate(t: string, d: string, waveId: string, journeys: string[], roles: string[], baselineDigest: string | null): Promise<{ candidate: Row; digest: string }> {
    const r = (await this.rows<{ c: Row; g: string }>(sql`select x.c, onboarding.digest(x.c) as g from (select onboarding.mg_acceptance_candidate(${t}::uuid, ${d}::uuid, ${waveId}::uuid, ${journeys}::text[],
        ${roles}::text[], ${baselineDigest}) as c) x`))[0];
    if (r === undefined) throw new Error('acceptance candidate returned no row');
    return { candidate: r.c, digest: r.g };
  }
  async evidence(t: string, d: string, sourceId: string, evidenceId: string): Promise<Row> {
    return this.one(sql`select onboarding.mg_evidence('migration rehearsal', ${t}::uuid, ${d}::uuid, ${sourceId}::uuid, ${evidenceId}::uuid) as r`, 'mg_evidence');
  }
  async evidencesOfSource(sourceId: string): Promise<Row[]> {
    return this.rows(sql`select distinct on (o.object_id) o.object_id::text as evidence_id, o.object_version, m.content_digest as bytes_digest, m.byte_length, m.media_type_declared, m.created_at,
        (select ob.payload ->> 'item_key' from objects.canonical_objects ob where ob.object_type = 'OBS' and ob.object_id = (o.payload ->> 'obs_object_id')::uuid order by ob.object_version desc limit 1) as item_key
      from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid
      where o.object_type = 'EVD' and m.source_id = ${sourceId}::uuid order by o.object_id, o.object_version desc`);
  }
  async domainLifecycle(t: string, d: string): Promise<Row | null> {
    return this.value(sql`select onboarding.mg_domain_lifecycle(${t}::uuid, ${d}::uuid) as r`);
  }
  async digestOf(v: unknown): Promise<string> {
    return String(await this.value<string>(sql`select onboarding.digest(${j(v)}::jsonb) as r`));
  }

  // ── writes (each a port asserting its own action) ─────────────────────────────────────────────
  async openWave(a: Parameters<MigrationWrites['openWave']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.open_wave(${a.waveId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.programmeId}::uuid, ${a.key}, ${a.title}, ${a.sourceId}::uuid, ${a.system}, ${a.authority},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'open_wave');
  }
  async withdrawWave(a: Parameters<MigrationWrites['withdrawWave']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.withdraw_wave(${a.waveId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'withdraw_wave');
  }
  async proposeMapping(a: Parameters<MigrationWrites['proposeMapping']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.propose_mapping(${a.waveId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${j(a.spec)}::jsonb, ${a.basis}, ${a.rationale}, ${a.expectedVersion}::int,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_mapping');
  }
  async decideMapping(a: Parameters<MigrationWrites['decideMapping']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.decide_mapping(${a.waveId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.version}::int, ${a.digest}, ${a.decision}, ${a.reason}, ${a.signatureId}::uuid,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_mapping');
  }
  async recordRehearsal(a: Parameters<MigrationWrites['recordRehearsal']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.record_rehearsal(${a.rehearsalId}::uuid, ${a.waveId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.evidenceId}::uuid, ${a.bytesDigest}, ${a.mappingVersion}::int,
      ${a.columns}::text[], ${j(a.rows)}::jsonb, ${a.formulaCells}::text[], ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_rehearsal');
  }
  async requestCutover(a: Parameters<MigrationWrites['requestCutover']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.request_cutover(${a.cutoverId}::uuid, ${a.waveId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.rehearsalId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'request_cutover');
  }
  async recheckCutover(a: Parameters<MigrationWrites['recheckCutover']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.recheck_cutover(${a.cutoverId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'recheck_cutover');
  }
  async approveCutover(a: Parameters<MigrationWrites['approveCutover']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.approve_cutover(${a.cutoverId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.digest}, ${a.reason}, ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'approve_cutover');
  }
  async beginExecution(a: Parameters<MigrationWrites['beginExecution']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.begin_execution(${a.cutoverId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.bytesDigest}, ${a.columns}::text[], ${j(a.rows)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'begin_execution');
  }
  async executeRow(a: Parameters<MigrationWrites['executeRow']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.execute_row(${a.cutoverId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.rowNo}::int, ${a.entityId}::uuid, ${a.identifierId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'execute_row');
  }
  async recordFailedRow(a: Parameters<MigrationWrites['recordFailedRow']>[0]): Promise<void> {
    await this.rows(sql`select onboarding.record_failed_row(${a.cutoverId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.rowNo}::int, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }
  async completeExecution(a: Parameters<MigrationWrites['completeExecution']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.complete_execution(${a.cutoverId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'complete_execution');
  }
  async reconcile(a: Parameters<MigrationWrites['reconcile']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.reconcile_cutover(${a.rehearsalId}::uuid, ${a.cutoverId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'reconcile_cutover');
  }
  async activate(a: Parameters<MigrationWrites['activate']>[0]): Promise<Row> {
    return this.one(sql`select tenancy.activate_domain(${a.domainId}::uuid, ${a.t}::uuid, ${a.cutoverId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'activate_domain');
  }
  async rehearseRollback(a: Parameters<MigrationWrites['rehearseRollback']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.rehearse_rollback(${a.rollbackId}::uuid, ${a.cutoverId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'rehearse_rollback');
  }
  async executeRollback(a: Parameters<MigrationWrites['executeRollback']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.execute_rollback(${a.rollbackId}::uuid, ${a.rehearsalId}::uuid, ${a.cutoverId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.digest}, ${a.reason}, ${a.actor}::uuid,
      ${a.correlationId}::uuid) as r`, 'execute_rollback');
  }
  async decideAcceptance(a: Parameters<MigrationWrites['decideAcceptance']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.decide_acceptance(${a.acceptanceId}::uuid, ${a.waveId}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.decision}, ${a.journeys}::text[], ${a.roles}::text[], ${a.baselineDigest},
      ${a.digest}, ${a.reason}, ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_acceptance');
  }
  async savepoint(name: string): Promise<void> { await this.rows(sql.raw(`savepoint ${name.replace(/[^a-z0-9_]/gi, '')}`)); }
  async rollbackToSavepoint(name: string): Promise<void> { await this.rows(sql.raw(`rollback to savepoint ${name.replace(/[^a-z0-9_]/gi, '')}`)); }
  async releaseSavepoint(name: string): Promise<void> { await this.rows(sql.raw(`release savepoint ${name.replace(/[^a-z0-9_]/gi, '')}`)); }
}

export const MigrationCapability = {
  read(tx: Tx, action: string): MigrationReads { return new MigrationCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): MigrationWrites { return new MigrationCapabilityImpl(tx, action); },
};
