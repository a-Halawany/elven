/**
 * SCENARIO SET CAPABILITIES — CP-6 B27 part `sets` (migration 0097 §S; F-P4-08, ADR-012, CAP-DS-01/-02, V03-T-343).
 *
 * The B90 idiom (events.capabilities.ts): one class, three views. Each write is a thin binding to a SECURITY DEFINER port that asserts the
 * route's own action, the scope and the acting principal; each read is an INVOKER read under the caller's RLS (the set, the comparator,
 * the proposals, the relevance); the tick view binds the relevance port under executive.attention.tick. Nothing here decides a rule a
 * port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../../shared/db.js';

type Row = Record<string, unknown>;

abstract class SetsCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  async call<T>(q: ReturnType<typeof sql>): Promise<T[]> {
    const r = await q.execute(this.#tx);
    return r.rows as T[];
  }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  /** The database's clock (every "as of now" read compares against it, never the process's). */
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
}

export interface SetReads {
  readonly action: string;
  now(): Promise<string>;
  /** The sets of the domain under the caller's RLS (the row, its current member count, its last check). */
  list(a: { state: string | null; limit: number }): Promise<Row[]>;
  /** prediction.scenario_set_read: the set, its members, checks, bindings, reviews and ledger tail. */
  set(setId: string): Promise<Row | null>;
  /** prediction.scenario_set_compare: the branches side by side with the plurality verdict. */
  compare(setId: string): Promise<Row | null>;
  /** The newest relevance row of every member scenario of the set, and the signposts notified. */
  relevance(setId: string): Promise<Row[]>;
  /** The proposals of the domain (open first). */
  proposals(a: { state: string | null; limit: number }): Promise<Row[]>;
}

export interface SetWrites extends SetReads {
  declare(a: { setId: string; tenantId: string; domainId: string; title: string; purpose: string; owner: string; policy: Row; packageId: string | null; actor: string; correlationId: string }): Promise<Row>;
  changeMember(a: { setId: string; tenantId: string; domainId: string; memberId: string; scenarioId: string | null; branchId: string | null; remove: boolean; reason: string | null; actor: string; correlationId: string }): Promise<Row>;
  transition(a: { setId: string; tenantId: string; domainId: string; state: 'active' | 'retired'; reason: string | null; actor: string; correlationId: string }): Promise<Row>;
  check(a: { checkId: string; setId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  bind(a: { bindingId: string; setId: string; packageId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
  review(a: { reviewId: string; setId: string; tenantId: string; domainId: string; members: Row[]; options: Row[] | null; payoffs: Row; unit: string; retirements: Row[]; note: string; actor: string; correlationId: string }): Promise<Row>;
  scoreRelevance(a: { tenantId: string; domainId: string; trigger: 'tick' | 'operator'; actor: string; correlationId: string }): Promise<Row>;
  propose(a: { proposalId: string; tenantId: string; domainId: string; kind: string; source: Row; title: string; rationale: string; actor: string; correlationId: string }): Promise<Row>;
  resolve(a: { proposalId: string; tenantId: string; domainId: string; resolution: 'accepted' | 'dismissed'; note: string; actor: string; correlationId: string }): Promise<Row>;
}

/** The tick's view (executive.attention.tick): the relevance of the living portfolio. */
export interface SetTickWrites {
  scoreRelevance(a: { tenantId: string; domainId: string; trigger: 'tick' | 'operator'; actor: string; correlationId: string }): Promise<Row>;
}

class SetsCapabilityImpl extends SetsCore implements SetWrites, SetTickWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async list(a: { state: string | null; limit: number }): Promise<Row[]> {
    return this.call<{ r: Row }>(sql`select prediction.scenario_set_json(s) || jsonb_build_object(
        'members', (select count(*) from prediction.scenario_set_members m where m.set_id = s.set_id and m.removed_at is null),
        'bindings', (select count(*) from decision.package_scenario_sets b where b.set_id = s.set_id)) as r
      from prediction.scenario_sets s where (${a.state}::text is null or s.state = ${a.state}) order by s.declared_at desc limit ${a.limit}`).then((rows) => rows.map((x) => x.r));
  }
  async set(setId: string): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select prediction.scenario_set_read(${setId}::uuid) as r`);
    return rows[0]?.r ?? null;
  }
  async compare(setId: string): Promise<Row | null> {
    const rows = await this.call<{ r: Row | null }>(sql`select prediction.scenario_set_compare(${setId}::uuid) as r`);
    return rows[0]?.r ?? null;
  }
  async relevance(setId: string): Promise<Row[]> {
    return this.call<{ r: Row }>(sql`select jsonb_build_object('scenario_id', sc.scenario_id, 'title', sc.title, 'owner_principal_id', sc.owner_principal_id,
        'latest', (select to_jsonb(r) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope' from prediction.scenario_relevance r where r.scenario_id = sc.scenario_id order by r.scored_at desc limit 1),
        'signposts_notified', (select coalesce(jsonb_agg(jsonb_build_object('branch_id', e.branch_id, 'breached_at', e.details ->> 'breached_at', 'item_id', e.details ->> 'item_id', 'at', e.occurred_at) order by e.occurred_at), '[]'::jsonb)
                                 from prediction.scenario_events e where e.scenario_id = sc.scenario_id and e.event = 'scenario.signpost_notified')) as r
      from prediction.scenarios_current sc where sc.scenario_id in (select m.scenario_id from prediction.scenario_set_members m where m.set_id = ${setId}::uuid and m.removed_at is null)
      order by sc.title`).then((rows) => rows.map((x) => x.r));
  }
  async proposals(a: { state: string | null; limit: number }): Promise<Row[]> {
    return this.call<{ r: Row }>(sql`select to_jsonb(p) - 'tenant_id' - 'domain_id' - 'correlation_id' - 'scope' as r from prediction.scenario_proposals p
      where (${a.state}::text is null or p.state = ${a.state}) order by (p.state = 'open') desc, p.proposed_at desc limit ${a.limit}`).then((rows) => rows.map((x) => x.r));
  }
  async declare(a: Parameters<SetWrites['declare']>[0]): Promise<Row> {
    return this.one(sql`select prediction.declare_scenario_set(${a.setId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.title}, ${a.purpose}, ${a.owner}::uuid, ${JSON.stringify(a.policy)}::jsonb,
      ${a.packageId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_scenario_set');
  }
  async changeMember(a: Parameters<SetWrites['changeMember']>[0]): Promise<Row> {
    return this.one(sql`select prediction.change_scenario_set_member(${a.setId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.memberId}::uuid, ${a.scenarioId}::uuid, ${a.branchId}::uuid,
      ${a.remove}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'change_scenario_set_member');
  }
  async transition(a: Parameters<SetWrites['transition']>[0]): Promise<Row> {
    return this.one(sql`select prediction.transition_scenario_set(${a.setId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.state}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'transition_scenario_set');
  }
  async check(a: Parameters<SetWrites['check']>[0]): Promise<Row> {
    return this.one(sql`select prediction.check_scenario_set_plurality(${a.checkId}::uuid, ${a.setId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'check_scenario_set_plurality');
  }
  async bind(a: Parameters<SetWrites['bind']>[0]): Promise<Row> {
    return this.one(sql`select prediction.bind_scenario_set(${a.bindingId}::uuid, ${a.setId}::uuid, ${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'bind_scenario_set');
  }
  async review(a: Parameters<SetWrites['review']>[0]): Promise<Row> {
    return this.one(sql`select prediction.review_scenario_portfolio(${a.reviewId}::uuid, ${a.setId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.members)}::jsonb,
      ${a.options === null ? null : JSON.stringify(a.options)}::jsonb, ${JSON.stringify(a.payoffs)}::jsonb, ${a.unit}, ${JSON.stringify(a.retirements)}::jsonb, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'review_scenario_portfolio');
  }
  async scoreRelevance(a: Parameters<SetWrites['scoreRelevance']>[0]): Promise<Row> {
    return this.one(sql`select prediction.score_scenario_relevance(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.trigger}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'score_scenario_relevance');
  }
  async propose(a: Parameters<SetWrites['propose']>[0]): Promise<Row> {
    return this.one(sql`select prediction.propose_scenario(${a.proposalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${JSON.stringify(a.source)}::jsonb, ${a.title}, ${a.rationale}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_scenario');
  }
  async resolve(a: Parameters<SetWrites['resolve']>[0]): Promise<Row> {
    return this.one(sql`select prediction.resolve_scenario_proposal(${a.proposalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.resolution}, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'resolve_scenario_proposal');
  }
}

export const SetCapability = {
  read(tx: Tx, action: string): SetReads { return new SetsCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): SetWrites { return new SetsCapabilityImpl(tx, action); },
  tick(tx: Tx, action: string): SetTickWrites { return new SetsCapabilityImpl(tx, action); },
};
