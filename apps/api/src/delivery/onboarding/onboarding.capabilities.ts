/**
 * B94 §ON (0114_b94_x_on) — THE ONBOARDING CAPABILITY: one class, a view per port group (the B33 §PK idiom). Each write is a thin binding to a
 * SECURITY DEFINER port that asserts the route's own action, the scope, the acting principal and the roles; each read is a plain select under
 * the caller's RLS, or a guarded definer read (the observed configuration, the drift). Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);

export interface OnboardingReads {
  readonly action: string; readonly tx: Tx;
  now(): Promise<string>;
  programmes(): Promise<Row[]>;
  programmeVersions(programmeId: string): Promise<Row[]>;
  intents(programmeId: string): Promise<Row[]>;
  steps(programmeId: string): Promise<Row[]>;
  ledger(subjectIds: string[], limit: number): Promise<Row[]>;
  domain(domainId: string): Promise<Row | null>;
  lifecycle(domainId: string): Promise<Row[]>;
  baselines(domainId: string): Promise<Row[]>;
  drift(tenantId: string, domainId: string): Promise<Row>;
  driftEvents(domainId: string, limit: number): Promise<Row[]>;
  items(subjectIds: string[]): Promise<Row[]>;
  signatures(kind: string, subjectId: string, version: number): Promise<Row[]>;
}
export interface OnboardingWrites extends OnboardingReads {
  open(a: { programmeId: string; tenantId: string; key: string; title: string; profile: string | null; plan: Row | null; owner: string | null; actor: string; correlationId: string }): Promise<Row>;
  revise(a: { programmeId: string; tenantId: string; expectedVersion: number; title: string | null; plan: Row | null; profile: string | null; reason: string; actor: string; correlationId: string }): Promise<Row>;
  hold(a: { programmeId: string; tenantId: string; expectedVersion: number; reason: string; actor: string; correlationId: string }): Promise<Row>;
  resume(a: { programmeId: string; tenantId: string; expectedVersion: number; reason: string; actor: string; correlationId: string }): Promise<Row>;
  withdraw(a: { programmeId: string; tenantId: string; expectedVersion: number; reason: string; actor: string; correlationId: string }): Promise<Row>;
  recordIntent(a: { tenantId: string; programmeId: string; expectedVersion: number; objectives: string[]; scopeStatement: string; successMeasures: string[]; constraints: string[];
                    targetDomainName: string; deploymentProfile: string; actor: string; correlationId: string }): Promise<Row>;
  planStep(a: { stepId: string; tenantId: string; programmeId: string; stepKey: string; compensation: Row | null; actor: string; correlationId: string }): Promise<Row>;
  recordStep(a: { stepId: string; tenantId: string; expectedVersion: number; state: string; realizedBy: Row | null; evidence: Row[] | null; compensation: Row | null; actor: string; correlationId: string }): Promise<Row>;
  holdStep(a: { stepId: string; tenantId: string; expectedVersion: number; reason: string; actor: string; correlationId: string }): Promise<Row>;
  revertStep(a: { stepId: string; tenantId: string; expectedVersion: number; compensating: Row; reason: string; actor: string; correlationId: string }): Promise<Row>;
  draftDomain(a: { domainId: string; tenantId: string; name: string; programmeId: string; correlationId: string }): Promise<Row>;
  capture(a: { baselineId: string; tenantId: string; domainId: string; programmeId: string | null; actor: string; correlationId: string }): Promise<Row>;
  promote(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  propose(a: { baselineId: string; tenantId: string; domainId: string; version: number; digest: string; actor: string; correlationId: string }): Promise<Row>;
  decide(a: { baselineId: string; tenantId: string; domainId: string; version: number; decision: string; digest: string; reason: string; signatureId: string | null; actor: string; correlationId: string }): Promise<Row>;
  recordDrift(a: { eventId: string; tenantId: string; domainId: string; observedDigest: string; actor: string; correlationId: string }): Promise<Row>;
  /** SignatureService's binding: one statement under the pipeline's bound action (record_signature asserts it). */
  call<T>(q: ReturnType<typeof sql>): Promise<T[]>;
}

class OnboardingCapabilityImpl implements OnboardingWrites {
  readonly #tx: Tx; readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  get tx(): Tx { return this.#tx; }
  private async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.#tx)).rows as T[]; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = ((await q.execute(this.#tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (r === undefined || r === null) throw new Error(`${what} returned no row`);
    return r;
  }
  async call<T>(q: ReturnType<typeof sql>): Promise<T[]> { return this.rows<T>(q); }
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }

  // ───────────── reads ─────────────
  async programmes(): Promise<Row[]> {
    return this.rows(sql`select p.programme_id::text, p.version, p.programme_key, p.title, p.target_domain_id::text, p.deployment_profile, p.owner_principal_id::text, p.state,
        p.held_reasons, p.plan, p.digest, p.effective_from, p.created_at,
        (select pr.display_name from identity.principals pr where pr.id = p.owner_principal_id) as owner_name,
        (select d.name from tenancy.domains d where d.id = p.target_domain_id) as target_domain_name,
        (select d.status from tenancy.domains d where d.id = p.target_domain_id) as target_domain_status,
        (select i.version from onboarding.sponsor_intents i where i.programme_id = p.programme_id and i.superseded_at is null) as intent_version,
        (select jsonb_object_agg(s.state, s.n) from (select x.state, count(*)::int as n from onboarding.steps x where x.programme_id = p.programme_id group by x.state) s) as step_states
      from onboarding.programmes p where p.superseded_at is null order by p.state = 'withdrawn', p.created_at desc`);
  }
  async programmeVersions(programmeId: string): Promise<Row[]> {
    return this.rows(sql`select p.programme_id::text, p.version, p.programme_key, p.title, p.target_domain_id::text, p.deployment_profile, p.owner_principal_id::text, p.state,
        p.held_reasons, p.plan, p.digest, p.effective_from, p.superseded_at, p.created_by::text, p.created_at, p.correlation_id::text,
        (select pr.display_name from identity.principals pr where pr.id = p.created_by) as created_by_name,
        (select pr.display_name from identity.principals pr where pr.id = p.owner_principal_id) as owner_name
      from onboarding.programmes p where p.programme_id = ${programmeId}::uuid order by p.version desc`);
  }
  async intents(programmeId: string): Promise<Row[]> {
    return this.rows(sql`select i.intent_id::text, i.version, i.programme_id::text, i.sponsor_principal_id::text, i.objectives, i.scope_statement, i.success_measures, i.constraints,
        i.target_domain_name, i.deployment_profile, i.digest, i.recorded_at, i.superseded_at,
        (select pr.display_name from identity.principals pr where pr.id = i.sponsor_principal_id) as sponsor_name
      from onboarding.sponsor_intents i where i.programme_id = ${programmeId}::uuid order by i.version desc`);
  }
  async steps(programmeId: string): Promise<Row[]> {
    return this.rows(sql`select s.step_id::text, s.programme_id::text, s.step_key, s.ordinal, s.version, s.state, s.realized_by, s.evidence, s.compensation, s.held_reason, s.reverted_by,
        s.digest, s.created_at, s.updated_at, s.updated_by::text,
        (select pr.display_name from identity.principals pr where pr.id = s.updated_by) as updated_by_name
      from onboarding.steps s where s.programme_id = ${programmeId}::uuid order by s.ordinal`);
  }
  async ledger(subjectIds: string[], limit: number): Promise<Row[]> {
    if (subjectIds.length === 0) return [];
    return this.rows(sql`select e.event_id::text, e.scope, e.domain_id::text, e.subject_kind, e.subject_id::text, e.version, e.event, e.actor_principal_id::text, e.details, e.occurred_at,
        e.correlation_id::text, (select pr.display_name from identity.principals pr where pr.id = e.actor_principal_id) as actor_name
      from onboarding.events e where e.subject_id = any(${subjectIds}::uuid[]) order by e.occurred_at, e.event_id limit ${Math.min(Math.max(limit, 1), 2000)}`);
  }
  async domain(domainId: string): Promise<Row | null> {
    const r = await this.rows<{ r: Row }>(sql`select jsonb_build_object('id', d.id, 'name', d.name, 'status', d.status, 'created_at', d.created_at, 'activated_at', d.activated_at) as r
      from tenancy.domains d where d.id = ${domainId}::uuid`);
    return r[0]?.r ?? null;
  }
  async lifecycle(domainId: string): Promise<Row[]> {
    return this.rows(sql`select l.event, l.actor, l.occurred_at, l.details from tenancy.lifecycle_events l where l.domain_id = ${domainId}::uuid order by l.occurred_at`);
  }
  async baselines(domainId: string): Promise<Row[]> {
    return this.rows(sql`select b.baseline_id::text, b.version, b.domain_id::text, b.programme_id::text, b.pointers, b.digest, b.basis, b.promoted_from, b.absorbed, b.state,
        b.captured_by::text, b.captured_at, b.proposed_by::text, b.proposed_at, b.decided_by::text, b.decided_at, b.decision_reason, b.signature_id::text, b.effective_from, b.superseded_at,
        (select pr.display_name from identity.principals pr where pr.id = b.captured_by) as captured_by_name,
        (select pr.display_name from identity.principals pr where pr.id = b.proposed_by) as proposed_by_name,
        (select pr.display_name from identity.principals pr where pr.id = b.decided_by) as decided_by_name,
        executive.signature_of('config_baseline', b.baseline_id, b.version) as signatures
      from onboarding.config_baselines b where b.domain_id = ${domainId}::uuid order by b.version desc`);
  }
  async drift(tenantId: string, domainId: string): Promise<Row> {
    return this.one(sql`select onboarding.baseline_drift(${tenantId}::uuid, ${domainId}::uuid) as r`, 'baseline_drift');
  }
  async driftEvents(domainId: string, limit: number): Promise<Row[]> {
    return this.rows(sql`select e.event_id::text, e.baseline_id::text, e.baseline_version, e.baseline_digest, e.observed_digest, e.state, e.changes, e.item, e.recorded_by::text, e.recorded_at
      from onboarding.drift_events e where e.domain_id = ${domainId}::uuid order by e.recorded_at desc limit ${Math.min(Math.max(limit, 1), 500)}`);
  }
  async items(subjectIds: string[]): Promise<Row[]> {
    if (subjectIds.length === 0) return [];
    return this.rows(sql`select i.item_id::text, i.signal_class, i.subject_kind, i.subject_id::text, i.title, i.outcome, i.state, i.owner_principal_id::text, i.route_roles, i.policy_version,
        i.created_at, i.closed_at from executive.attention_items i where i.subject_id = any(${subjectIds}::uuid[]) and i.signal_class = 'onboarding.drift' order by i.created_at desc`);
  }
  async signatures(kind: string, subjectId: string, version: number): Promise<Row[]> {
    const r = await this.rows<{ s: Row[] }>(sql`select executive.signature_of(${kind}, ${subjectId}::uuid, ${version}::int) as s`);
    return r[0]?.s ?? [];
  }

  // ───────────── writes (the ports) ─────────────
  async open(a: Parameters<OnboardingWrites['open']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.open_programme(${a.programmeId}::uuid, ${a.tenantId}::uuid, ${a.key}, ${a.title}, ${a.profile}, ${a.plan === null ? null : j(a.plan)}::jsonb,
      ${a.owner}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'open_programme');
  }
  async revise(a: Parameters<OnboardingWrites['revise']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.revise_programme(${a.programmeId}::uuid, ${a.tenantId}::uuid, ${a.expectedVersion}::int, ${a.title}, ${a.plan === null ? null : j(a.plan)}::jsonb,
      ${a.profile}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'revise_programme');
  }
  async hold(a: Parameters<OnboardingWrites['hold']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.hold_programme(${a.programmeId}::uuid, ${a.tenantId}::uuid, ${a.expectedVersion}::int, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'hold_programme');
  }
  async resume(a: Parameters<OnboardingWrites['resume']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.resume_programme(${a.programmeId}::uuid, ${a.tenantId}::uuid, ${a.expectedVersion}::int, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'resume_programme');
  }
  async withdraw(a: Parameters<OnboardingWrites['withdraw']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.withdraw_programme(${a.programmeId}::uuid, ${a.tenantId}::uuid, ${a.expectedVersion}::int, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'withdraw_programme');
  }
  async recordIntent(a: Parameters<OnboardingWrites['recordIntent']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.record_intent(${a.tenantId}::uuid, ${a.programmeId}::uuid, ${a.expectedVersion}::int, ${j(a.objectives)}::jsonb, ${a.scopeStatement},
      ${j(a.successMeasures)}::jsonb, ${j(a.constraints)}::jsonb, ${a.targetDomainName}, ${a.deploymentProfile}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_intent');
  }
  async planStep(a: Parameters<OnboardingWrites['planStep']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.plan_step(${a.stepId}::uuid, ${a.tenantId}::uuid, ${a.programmeId}::uuid, ${a.stepKey}, ${a.compensation === null ? null : j(a.compensation)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'plan_step');
  }
  async recordStep(a: Parameters<OnboardingWrites['recordStep']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.record_step(${a.stepId}::uuid, ${a.tenantId}::uuid, ${a.expectedVersion}::int, ${a.state}, ${a.realizedBy === null ? null : j(a.realizedBy)}::jsonb,
      ${a.evidence === null ? null : j(a.evidence)}::jsonb, ${a.compensation === null ? null : j(a.compensation)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_step');
  }
  async holdStep(a: Parameters<OnboardingWrites['holdStep']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.hold_step(${a.stepId}::uuid, ${a.tenantId}::uuid, ${a.expectedVersion}::int, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'hold_step');
  }
  async revertStep(a: Parameters<OnboardingWrites['revertStep']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.revert_step(${a.stepId}::uuid, ${a.tenantId}::uuid, ${a.expectedVersion}::int, ${j(a.compensating)}::jsonb, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'revert_step');
  }
  async draftDomain(a: Parameters<OnboardingWrites['draftDomain']>[0]): Promise<Row> {
    return this.one(sql`select tenancy.create_domain_draft(${a.domainId}::uuid, ${a.tenantId}::uuid, ${a.name}, ${a.programmeId}::uuid, ${a.correlationId}::uuid) as r`, 'create_domain_draft');
  }
  async capture(a: Parameters<OnboardingWrites['capture']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.capture_baseline(${a.baselineId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.programmeId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'capture_baseline');
  }
  async promote(a: Parameters<OnboardingWrites['promote']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.promote_baseline(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'promote_baseline');
  }
  async propose(a: Parameters<OnboardingWrites['propose']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.propose_baseline(${a.baselineId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.digest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_baseline');
  }
  async decide(a: Parameters<OnboardingWrites['decide']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.decide_baseline(${a.baselineId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.decision}, ${a.digest}, ${a.reason},
      ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_baseline');
  }
  async recordDrift(a: Parameters<OnboardingWrites['recordDrift']>[0]): Promise<Row> {
    return this.one(sql`select onboarding.record_drift(${a.eventId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.observedDigest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_drift');
  }
}

export const OnboardingCapability = {
  read(tx: Tx, action: string): OnboardingReads { return new OnboardingCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): OnboardingWrites { return new OnboardingCapabilityImpl(tx, action); },
};
