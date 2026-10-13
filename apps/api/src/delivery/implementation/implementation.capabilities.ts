/**
 * B94 §IM+§AD (0114 §IM) — THE IMPLEMENTATION CAPABILITIES: one class, a read view and a write view (the packages.capabilities idiom). Each
 * write is a thin binding to a SECURITY DEFINER port that asserts the route's own action, the scope and the acting principal; each read is a
 * plain select (or a guarded definer read) under the caller's RLS — a person's training and competence records are filtered PER PERSON by RLS
 * (the subject, the recorder, the authorities). Nothing here decides a rule a port decides.
 */
/* B94 act-found (2026-10-13): every actor name below is read through products.catalog_principal_name (0095 §K.3: SECURITY DEFINER, this tenant's
   principals only). A DOMAIN-scoped read cannot see a TENANT-homed principal under identity.principals' RLS, so the implementation lead's,
   the onboarding authority's and the sponsor's names read blank on the domain pages ("approved by  at …"). */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);
const lim = (n: number, max: number) => Math.min(Math.max(Math.trunc(n), 1), max);

abstract class ImplementationCore {
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
  /** The signer's statement runner (SignatureService.sign): one statement under the pipeline's bound action. */
  async call<T>(q: ReturnType<typeof sql>): Promise<T[]> { return this.rows<T>(q); }
  /** The database's clock. */
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
}

export interface ImplementationReads {
  readonly action: string;
  now(): Promise<string>;
  programmes(domainId: string | null): Promise<Row[]>;
  programme(programmeId: string): Promise<Row | null>;
  versions(programmeId: string): Promise<Row[]>;
  items(programmeId: string): Promise<Row[]>;
  changes(programmeId: string): Promise<Row[]>;
  readiness(programmeId: string): Promise<Row[]>;
  gate(tenantId: string, domainId: string, programmeId: string): Promise<Row>;
  coverage(tenantId: string, domainId: string): Promise<Row>;
  paths(domainId: string): Promise<Row[]>;
  cohorts(programmeId: string): Promise<Row[]>;
  shadow(domainId: string, programmeId: string): Promise<{ findings: Row[]; reviews: Row[] }>;
  decisions(programmeId: string): Promise<Row[]>;
  evaluations(programmeId: string, limit: number): Promise<Row[]>;
  residuals(programmeId: string): Promise<Row[]>;
  ledger(subjectIds: string[], limit: number): Promise<Row[]>;
  attention(programmeId: string): Promise<Row[]>;
  tasks(programmeId: string): Promise<Row[]>;
  /** the person records the caller may read (RLS: the subject, the recorder / assessor, the authorities) */
  personRecords(domainId: string): Promise<{ training: Row[]; competence: Row[] }>;
  /** the caller's OWN records (implementation.self.read) */
  ownRecords(principalId: string, domainId: string): Promise<{ training: Row[]; competence: Row[] }>;
  cadences(domainId: string): Promise<Row[]>;
  measures(domainId: string, keys: string[]): Promise<Row[]>;
}

export interface ImplementationWrites extends ImplementationReads {
  call<T>(q: ReturnType<typeof sql>): Promise<T[]>;
  open(a: { programmeId: string; tenantId: string; key: string; title: string; targetDomainId: string; onboardingProgrammeId: string | null; profile: string; plan: Row; actor: string; correlationId: string }): Promise<Row>;
  revise(a: { programmeId: string; tenantId: string; expectedVersion: number; title: string | null; plan: Row | null; onboardingProgrammeId: string | null; profile: string | null; actor: string; correlationId: string }): Promise<Row>;
  transition(a: { programmeId: string; tenantId: string; act: string; expectedVersion: number; reason: string; actor: string; correlationId: string }): Promise<Row>;
  recordItem(a: { itemId: string; programmeId: string; tenantId: string; kind: string; key: string; title: string | null; attributes: Row; expectedVersion: number; retire: boolean; actor: string; correlationId: string }): Promise<Row>;
  proposeChange(a: { changeId: string; programmeId: string; tenantId: string; title: string; description: string; impact: Row; actor: string; correlationId: string }): Promise<Row>;
  decideChange(a: { changeId: string; tenantId: string; decision: string; digest: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  declareReadiness(a: { itemId: string; programmeId: string; tenantId: string; domainId: string; key: string; kind: string; title: string; spec: Row; blocking: boolean; accountableRole: string | null; expectedVersion: number; actor: string; correlationId: string }): Promise<Row>;
  retireReadiness(a: { itemId: string; tenantId: string; domainId: string; expectedVersion: number; reason: string; actor: string; correlationId: string }): Promise<Row>;
  confirmReadiness(a: { confirmationId: string; itemId: string; tenantId: string; domainId: string; version: number; digest: string; statement: string; actor: string; correlationId: string }): Promise<Row>;
  acceptResidual(a: { acceptanceId: string; itemId: string; tenantId: string; domainId: string; version: number; digest: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  recordGate(a: { evaluationId: string; programmeId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  decideGolive(a: { decisionId: string; programmeId: string; tenantId: string; domainId: string; decision: string; gateDigest: string; cadenceId: string | null; journeys: string[]; reason: string; actor: string; correlationId: string }): Promise<Row>;
  seal(a: { kind: 'golive' | 'residual'; subjectId: string; tenantId: string; domainId: string; signatureId: string; actor: string; correlationId: string }): Promise<Row>;
  declarePath(a: { pathId: string; tenantId: string; domainId: string; programmeId: string | null; key: string; title: string | null; roles: string[]; contentRef: string | null; expectedVersion: number; retire: boolean; actor: string; correlationId: string }): Promise<Row>;
  attestPath(a: { attestationId: string; pathId: string; tenantId: string; domainId: string; version: number; digest: string; verdict: string; statement: string; actor: string; correlationId: string }): Promise<Row>;
  recordTraining(a: { recordId: string; pathId: string; tenantId: string; domainId: string; version: number; subject: string; state: string; purpose: string; note: string | null; retainDays: number | null; actor: string; correlationId: string }): Promise<Row>;
  recordCompetence(a: { recordId: string; tenantId: string; domainId: string; key: string; role: string; subject: string; outcome: string; purpose: string; note: string | null; retainDays: number | null; actor: string; correlationId: string }): Promise<Row>;
  declareCohort(a: { cohortId: string; programmeId: string; tenantId: string; domainId: string; dimensions: Row; from: string | null; to: string | null; actor: string; correlationId: string }): Promise<Row>;
  recordShadow(a: { findingId: string; tenantId: string; domainId: string; sourceId: string; attempt: Row; actor: string; correlationId: string }): Promise<Row>;
  resolveShadow(a: { findingId: string; tenantId: string; domainId: string; remediation: string; actor: string; correlationId: string }): Promise<Row>;
  reviewShadow(a: { reviewId: string; programmeId: string; tenantId: string; domainId: string; statement: string; actor: string; correlationId: string }): Promise<Row>;
}

const NAME = (col: string) => sql.raw(`products.catalog_principal_name(${col})`);

class ImplementationCapabilityImpl extends ImplementationCore implements ImplementationWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }

  // ───────────── reads ─────────────
  async programmes(domainId: string | null): Promise<Row[]> {
    return this.rows(sql`select to_jsonb(x) || jsonb_build_object('owner_name', ${NAME('x.owner_principal_id')},
        'domain_name', (select d.name from tenancy.domains d where d.id = x.target_domain_id), 'domain_status', (select d.status from tenancy.domains d where d.id = x.target_domain_id),
        'opened_at', (select min(v.created_at) from implementation.programmes v where v.programme_id = x.programme_id)) as r
      from implementation.programmes x where x.superseded_at is null and (${domainId}::uuid is null or x.target_domain_id = ${domainId}::uuid)
      order by x.state, x.programme_key`).then((r) => r.map((x) => (x as { r: Row }).r));
  }
  async programme(programmeId: string): Promise<Row | null> {
    const r = await this.rows<{ r: Row }>(sql`select to_jsonb(x) || jsonb_build_object('owner_name', ${NAME('x.owner_principal_id')},
        'domain_name', (select d.name from tenancy.domains d where d.id = x.target_domain_id), 'domain_status', (select d.status from tenancy.domains d where d.id = x.target_domain_id),
        'opened_at', (select min(v.created_at) from implementation.programmes v where v.programme_id = x.programme_id)) as r
      from implementation.programmes x where x.programme_id = ${programmeId}::uuid and x.superseded_at is null`);
    return r[0]?.r ?? null;
  }
  async versions(programmeId: string): Promise<Row[]> {
    return this.rows(sql`select x.version, x.state, x.held_reasons, x.digest, x.effective_from, x.superseded_at, x.created_by::text, ${NAME('x.created_by')} as created_by_name
      from implementation.programmes x where x.programme_id = ${programmeId}::uuid order by x.version desc`);
  }
  async items(programmeId: string): Promise<Row[]> {
    return this.rows(sql`select x.item_id::text, x.version, x.kind, x.item_key, x.title, x.attributes, x.state, x.digest, x.recorded_at, ${NAME('x.recorded_by')} as recorded_by_name
      from implementation.programme_items x where x.programme_id = ${programmeId}::uuid and x.superseded_at is null order by x.kind, x.item_key`);
  }
  async changes(programmeId: string): Promise<Row[]> {
    return this.rows(sql`select x.change_id::text, x.title, x.description, x.impact, x.state, x.digest, x.proposed_by::text, x.proposed_at, x.decided_by::text, x.decided_at, x.decision_reason,
        ${NAME('x.proposed_by')} as proposed_by_name, ${NAME('x.decided_by')} as decided_by_name
      from implementation.changes x where x.programme_id = ${programmeId}::uuid order by x.proposed_at desc`);
  }
  async readiness(programmeId: string): Promise<Row[]> {
    return this.rows(sql`select x.item_id::text, x.version, x.item_key, x.kind, x.title, x.spec, x.blocking, x.accountable_role, x.state, x.digest, x.declared_at, x.retire_reason,
        ${NAME('x.declared_by')} as declared_by_name, x.declared_by::text,
        (select coalesce(jsonb_agg(jsonb_build_object('confirmation_id', c.confirmation_id, 'by', c.confirmed_by, 'by_name', ${NAME('c.confirmed_by')}, 'at', c.confirmed_at, 'statement', c.statement)
                                    order by c.confirmed_at), '[]'::jsonb) from implementation.readiness_confirmations c where c.item_id = x.item_id and c.item_version = x.version) as confirmations
      from implementation.readiness_items x where x.programme_id = ${programmeId}::uuid and x.superseded_at is null order by x.item_key`);
  }
  async gate(tenantId: string, domainId: string, programmeId: string): Promise<Row> {
    return this.one(sql`select implementation.evaluate_gate(${tenantId}::uuid, ${domainId}::uuid, ${programmeId}::uuid) as r`, 'evaluate_gate');
  }
  async coverage(tenantId: string, domainId: string): Promise<Row> {
    return this.one(sql`select implementation.coverage(${tenantId}::uuid, ${domainId}::uuid) as r`, 'coverage');
  }
  async paths(domainId: string): Promise<Row[]> {
    return this.rows(sql`select x.path_id::text, x.version, x.path_key, x.title, x.roles, x.content_ref, x.state, x.digest, x.declared_at, x.declared_by::text, ${NAME('x.declared_by')} as declared_by_name,
        implementation.imp_accessibility(x.path_id, x.version) as accessibility
      from implementation.training_paths x where x.domain_id = ${domainId}::uuid and x.superseded_at is null order by x.path_key`);
  }
  async cohorts(programmeId: string): Promise<Row[]> {
    return this.rows(sql`select x.cohort_id::text, x.role_code, x.wave_key, x.bound_from, x.bound_to, x.declared_at from implementation.cohorts x where x.programme_id = ${programmeId}::uuid order by x.role_code, x.wave_key`);
  }
  async shadow(domainId: string, programmeId: string): Promise<{ findings: Row[]; reviews: Row[] }> {
    const findings = await this.rows(sql`select x.finding_id::text, x.source_id::text, x.source_key, x.attempt, x.state, x.recorded_at, x.resolved_at, x.remediation, ${NAME('x.recorded_by')} as recorded_by_name,
        ${NAME('x.resolved_by')} as resolved_by_name from implementation.shadow_findings x where x.domain_id = ${domainId}::uuid order by x.recorded_at desc`);
    const reviews = await this.rows(sql`select x.review_id::text, x.statement, x.open_findings, x.reviewed_at, ${NAME('x.reviewed_by')} as reviewed_by_name
      from implementation.shadow_reviews x where x.programme_id = ${programmeId}::uuid order by x.reviewed_at desc`);
    return { findings, reviews };
  }
  async decisions(programmeId: string): Promise<Row[]> {
    return this.rows(sql`select to_jsonb(x) || jsonb_build_object('decided_by_name', ${NAME('x.decided_by')}, 'signatures', executive.signature_of('readiness', x.decision_id, 1)) as r
      from implementation.golive_decisions x where x.programme_id = ${programmeId}::uuid order by x.decided_at desc`).then((r) => r.map((x) => (x as { r: Row }).r));
  }
  async evaluations(programmeId: string, limit: number): Promise<Row[]> {
    return this.rows(sql`select x.evaluation_id::text, x.programme_version, x.state, x.gate_digest, x.items_raised, x.evaluated_at, ${NAME('x.evaluated_by')} as evaluated_by_name,
        jsonb_array_length(x.evaluation -> 'blocking') as blocking
      from implementation.gate_evaluations x where x.programme_id = ${programmeId}::uuid order by x.evaluated_at desc limit ${lim(limit, 200)}`);
  }
  async residuals(programmeId: string): Promise<Row[]> {
    return this.rows(sql`select to_jsonb(x) || jsonb_build_object('accepted_by_name', ${NAME('x.accepted_by')}, 'signatures', executive.signature_of('readiness', x.acceptance_id, 1)) as r
      from implementation.residual_acceptances x where x.programme_id = ${programmeId}::uuid order by x.accepted_at desc`).then((r) => r.map((x) => (x as { r: Row }).r));
  }
  async ledger(subjectIds: string[], limit: number): Promise<Row[]> {
    if (subjectIds.length === 0) return [];
    return this.rows(sql`select e.event_id::text, e.scope, e.domain_id::text, e.subject_kind, e.subject_id::text, e.version, e.event, e.details, e.occurred_at, ${NAME('e.actor_principal_id')} as actor_name
      from implementation.events e where e.subject_id = any(${subjectIds}::uuid[]) or (e.details ->> 'programme_id') = any(${subjectIds}::text[])
      order by e.occurred_at desc, e.event_id desc limit ${lim(limit, 1000)}`);
  }
  async attention(programmeId: string): Promise<Row[]> {
    return this.rows(sql`select i.item_id::text, i.signal_class, i.state, i.title, i.outcome, i.route_roles, i.created_at, i.closed_at, i.evaluation -> 'raised_reasons' as reasons
      from executive.attention_items i where i.subject_id = ${programmeId}::uuid and i.signal_class in ('implementation.readiness', 'responsibility.gap') order by i.created_at desc`);
  }
  async tasks(programmeId: string): Promise<Row[]> {
    return this.rows(sql`select t.task_id::text, t.kind, t.state, t.title, t.candidate_roles, t.opened_at, t.completed_at, t.outcome
      from executive.human_tasks t where t.subject @> ${j({ kind: 'readiness_gate', id: programmeId })}::jsonb order by t.opened_at desc`);
  }
  async personRecords(domainId: string): Promise<{ training: Row[]; competence: Row[] }> {
    const training = await this.rows(sql`select x.record_id::text, x.path_id::text, x.path_version, (select t.path_key from implementation.training_paths t where t.path_id = x.path_id and t.version = x.path_version) as path_key,
        x.subject_principal_id::text, ${NAME('x.subject_principal_id')} as subject_name, x.state, x.purpose, x.recorded_at, x.retain_until, ${NAME('x.recorded_by')} as recorded_by_name
      from implementation.training_records x where x.domain_id = ${domainId}::uuid and x.retain_until > clock_timestamp() order by x.recorded_at desc limit 500`);
    const competence = await this.rows(sql`select x.record_id::text, x.competence_key, x.role_code, x.subject_principal_id::text, ${NAME('x.subject_principal_id')} as subject_name, x.outcome, x.purpose,
        x.recorded_at, x.retain_until, ${NAME('x.assessor_principal_id')} as assessor_name
      from implementation.competence_records x where x.domain_id = ${domainId}::uuid and x.retain_until > clock_timestamp() order by x.recorded_at desc limit 500`);
    return { training, competence };
  }
  async ownRecords(principalId: string, domainId: string): Promise<{ training: Row[]; competence: Row[] }> {
    const training = await this.rows(sql`select x.record_id::text, (select t.path_key from implementation.training_paths t where t.path_id = x.path_id and t.version = x.path_version) as path_key, x.path_version,
        x.state, x.purpose, x.recorded_at, x.retain_until, ${NAME('x.recorded_by')} as recorded_by_name
      from implementation.training_records x where x.domain_id = ${domainId}::uuid and x.subject_principal_id = ${principalId}::uuid order by x.recorded_at desc`);
    const competence = await this.rows(sql`select x.record_id::text, x.competence_key, x.role_code, x.outcome, x.purpose, x.evidence_note, x.recorded_at, x.retain_until, ${NAME('x.assessor_principal_id')} as assessor_name
      from implementation.competence_records x where x.domain_id = ${domainId}::uuid and x.subject_principal_id = ${principalId}::uuid order by x.recorded_at desc`);
    return { training, competence };
  }
  async cadences(domainId: string): Promise<Row[]> {
    return this.rows(sql`select c.cadence_id::text, c.period, c.sequence, c.opened_at, c.closed_at from executive.cadences c where c.domain_id = ${domainId}::uuid order by c.opened_at desc limit 20`);
  }
  async measures(domainId: string, keys: string[]): Promise<Row[]> {
    if (keys.length === 0) return [];
    return this.rows(sql`select d.metric_key, d.version, d.state, d.supported, d.k_min, d.title,
        (select jsonb_build_object('result_id', r.result_id, 'state', r.state, 'value', r.value, 'period_key', r.period_key, 'reasons', r.reasons, 'computed_at', r.computed_at)
           from analytics.metric_results r where r.definition_id = d.definition_id and not r.preview and r.replay_of is null order by r.computed_at desc limit 1) as latest
      from analytics.metric_definitions d where d.domain_id = ${domainId}::uuid and d.metric_key = any(${keys}::text[]) and d.state = 'approved' order by d.metric_key`);
  }

  // ───────────── writes (each a definer port) ─────────────
  async open(a: Parameters<ImplementationWrites['open']>[0]): Promise<Row> {
    return this.one(sql`select implementation.open_programme(${a.programmeId}::uuid, ${a.tenantId}::uuid, ${a.key}, ${a.title}, ${a.targetDomainId}::uuid, ${a.onboardingProgrammeId}::uuid, ${a.profile},
      ${j(a.plan)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'open_programme');
  }
  async revise(a: Parameters<ImplementationWrites['revise']>[0]): Promise<Row> {
    return this.one(sql`select implementation.revise_programme(${a.programmeId}::uuid, ${a.tenantId}::uuid, ${a.expectedVersion}::int, ${a.title}, ${a.plan === null ? null : j(a.plan)}::jsonb,
      ${a.onboardingProgrammeId}::uuid, ${a.profile}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'revise_programme');
  }
  async transition(a: Parameters<ImplementationWrites['transition']>[0]): Promise<Row> {
    return this.one(sql`select implementation.transition_programme(${a.programmeId}::uuid, ${a.tenantId}::uuid, ${a.act}, ${a.expectedVersion}::int, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'transition_programme');
  }
  async recordItem(a: Parameters<ImplementationWrites['recordItem']>[0]): Promise<Row> {
    return this.one(sql`select implementation.record_item(${a.itemId}::uuid, ${a.programmeId}::uuid, ${a.tenantId}::uuid, ${a.kind}, ${a.key}, ${a.title}, ${j(a.attributes)}::jsonb, ${a.expectedVersion}::int,
      ${a.retire}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_item');
  }
  async proposeChange(a: Parameters<ImplementationWrites['proposeChange']>[0]): Promise<Row> {
    return this.one(sql`select implementation.propose_change(${a.changeId}::uuid, ${a.programmeId}::uuid, ${a.tenantId}::uuid, ${a.title}, ${a.description}, ${j(a.impact)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_change');
  }
  async decideChange(a: Parameters<ImplementationWrites['decideChange']>[0]): Promise<Row> {
    return this.one(sql`select implementation.decide_change(${a.changeId}::uuid, ${a.tenantId}::uuid, ${a.decision}, ${a.digest}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_change');
  }
  async declareReadiness(a: Parameters<ImplementationWrites['declareReadiness']>[0]): Promise<Row> {
    return this.one(sql`select implementation.declare_readiness(${a.itemId}::uuid, ${a.programmeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.key}, ${a.kind}, ${a.title}, ${j(a.spec)}::jsonb,
      ${a.blocking}, ${a.accountableRole}, ${a.expectedVersion}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_readiness');
  }
  async retireReadiness(a: Parameters<ImplementationWrites['retireReadiness']>[0]): Promise<Row> {
    return this.one(sql`select implementation.retire_readiness(${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.expectedVersion}::int, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'retire_readiness');
  }
  async confirmReadiness(a: Parameters<ImplementationWrites['confirmReadiness']>[0]): Promise<Row> {
    return this.one(sql`select implementation.confirm_readiness(${a.confirmationId}::uuid, ${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.digest}, ${a.statement},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'confirm_readiness');
  }
  async acceptResidual(a: Parameters<ImplementationWrites['acceptResidual']>[0]): Promise<Row> {
    return this.one(sql`select implementation.accept_residual(${a.acceptanceId}::uuid, ${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.digest}, ${a.reason},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'accept_residual');
  }
  async recordGate(a: Parameters<ImplementationWrites['recordGate']>[0]): Promise<Row> {
    return this.one(sql`select implementation.record_gate(${a.evaluationId}::uuid, ${a.programmeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_gate');
  }
  async decideGolive(a: Parameters<ImplementationWrites['decideGolive']>[0]): Promise<Row> {
    return this.one(sql`select implementation.decide_golive(${a.decisionId}::uuid, ${a.programmeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.gateDigest}, ${a.cadenceId}::uuid,
      ${a.journeys}::uuid[], ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_golive');
  }
  async seal(a: Parameters<ImplementationWrites['seal']>[0]): Promise<Row> {
    return this.one(sql`select implementation.seal_signature(${a.kind}, ${a.subjectId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'seal_signature');
  }
  async declarePath(a: Parameters<ImplementationWrites['declarePath']>[0]): Promise<Row> {
    return this.one(sql`select implementation.declare_path(${a.pathId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.programmeId}::uuid, ${a.key}, ${a.title}, ${a.roles}::text[], ${a.contentRef},
      ${a.expectedVersion}::int, ${a.retire}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_path');
  }
  async attestPath(a: Parameters<ImplementationWrites['attestPath']>[0]): Promise<Row> {
    return this.one(sql`select implementation.attest_path(${a.attestationId}::uuid, ${a.pathId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.digest}, ${a.verdict}, ${a.statement},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'attest_path');
  }
  async recordTraining(a: Parameters<ImplementationWrites['recordTraining']>[0]): Promise<Row> {
    return this.one(sql`select implementation.record_training(${a.recordId}::uuid, ${a.pathId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.subject}::uuid, ${a.state}, ${a.purpose},
      ${a.note}, ${a.retainDays}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_training');
  }
  async recordCompetence(a: Parameters<ImplementationWrites['recordCompetence']>[0]): Promise<Row> {
    return this.one(sql`select implementation.record_competence(${a.recordId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.key}, ${a.role}, ${a.subject}::uuid, ${a.outcome}, ${a.purpose},
      ${a.note}, ${a.retainDays}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_competence');
  }
  async declareCohort(a: Parameters<ImplementationWrites['declareCohort']>[0]): Promise<Row> {
    return this.one(sql`select implementation.declare_cohort(${a.cohortId}::uuid, ${a.programmeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${j(a.dimensions)}::jsonb, ${a.from}::timestamptz, ${a.to}::timestamptz,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_cohort');
  }
  async recordShadow(a: Parameters<ImplementationWrites['recordShadow']>[0]): Promise<Row> {
    return this.one(sql`select implementation.record_shadow(${a.findingId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${j(a.attempt)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_shadow');
  }
  async resolveShadow(a: Parameters<ImplementationWrites['resolveShadow']>[0]): Promise<Row> {
    return this.one(sql`select implementation.resolve_shadow(${a.findingId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.remediation}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'resolve_shadow');
  }
  async reviewShadow(a: Parameters<ImplementationWrites['reviewShadow']>[0]): Promise<Row> {
    return this.one(sql`select implementation.review_shadow(${a.reviewId}::uuid, ${a.programmeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.statement}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'review_shadow');
  }
}

export const ImplementationCapability = {
  read(tx: Tx, action: string): ImplementationReads { return new ImplementationCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): ImplementationWrites { return new ImplementationCapabilityImpl(tx, action); },
};
