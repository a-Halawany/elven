/**
 * EXECUTIVE HOME CAPABILITIES — CP-6 B36 part `home` (0094 §H; F-P6-11: WS-01, JRN-19, PER-03, CAP-EO-01/-02/-04).
 *
 * One narrow shape per port group, every write a SECURITY DEFINER port asserting the caller's own bound action; every read an
 * invoker-bound SQL function under the reader's own RLS:
 *
 *   home        executive.home (ONE read: priorities, intelligence, warnings, decisions, commitments, outcomes, the cadence — each with its
 *               as-of, count, limitations, under the reader's §0 context), executive.command_view / command_views_for (the role × moment
 *               views composed from the same read), executive.context_choices (the switcher's objectives and scenarios with their staleness),
 *               executive.current_context (§0), executive.cadence_of, executive.metrics (computed on read; nothing stored);
 *   context     executive.set_context (§0's port; `executive.context.set` — this part owns its only route);
 *   cadence     executive.open_cadence / executive.reset_cadence (`executive.cadence.open` / `.reset`: the loop reset closes the cycle
 *               with its closing record and opens the next);
 *   room        executive.open_subject_room (`executive.room.open`: a scenario room or an objective review with a deadline; the SoD);
 *   agenda      executive.set_agenda (`executive.agenda.set`), executive.escalate_gap (`executive.escalation.raise`),
 *               executive.answer_escalation (`executive.escalation.answer`);
 *   search      executive.record_search (`executive.search`: the read and its access-ledger row in one write);
 *   tick        executive.raise_overdue_rooms (`executive.attention.tick`: the step room-deadlines, order 58).
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class Core {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  async call<T>(q: ReturnType<typeof sql>): Promise<T[]> { const r = await q.execute(this.#tx); return r.rows as T[]; }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined) throw new Error(`${what} returned no row`);
    return row ?? {};
  }
  protected async maybe(q: ReturnType<typeof sql>): Promise<Row | null> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    return row === undefined || row === null ? null : row;
  }
}

export interface HomeReads {
  readonly action: string;
  /** ONE read: the seven sections under the reader's context (the ceiling is the reader's clearance; the context may lower it). */
  home(a: { tenantId: string; domainId: string; principalId: string; ceiling: string; limit: number }): Promise<Row>;
  /** A role × moment view composed from the same read; the port refuses an unknown view (404) and a role the reader does not hold (403). */
  commandView(a: { tenantId: string; domainId: string; principalId: string; ceiling: string; viewKey: string; limit: number }): Promise<Row>;
  commandViewsFor(a: { tenantId: string; domainId: string; principalId: string }): Promise<Row[]>;
  contextChoices(a: { tenantId: string; domainId: string }): Promise<Row>;
  /** §0's executive.current_context of a principal (null when none was set). */
  currentContext(a: { principalId: string }): Promise<Row | null>;
  cadenceOf(a: { tenantId: string; domainId: string; period: string | null }): Promise<Row>;
  metrics(a: { tenantId: string; domainId: string; from: string; to: string }): Promise<Row>;
  /** The subject's liveness for the switcher's staleness rule: an objective's status / a scenario's state, or null when unknown. */
  subjectStatus(a: { tenantId: string; domainId: string; kind: 'objective' | 'scenario'; id: string }): Promise<string | null>;
  now(): Promise<string>;
}
export interface HomeWrites extends HomeReads {
  setContext(a: { contextId: string; tenantId: string; domainId: string; objectiveId: string | null; horizon: string; scenarioId: string | null; classification: string; effectiveAt: string | null; actor: string; correlationId: string }): Promise<Row>;
  openCadence(a: { cadenceId: string; tenantId: string; domainId: string; period: string; actor: string; correlationId: string }): Promise<Row>;
  resetCadence(a: { nextId: string; tenantId: string; domainId: string; period: string; confirmReason: string | null; actor: string; correlationId: string }): Promise<Row>;
  openSubjectRoom(a: { roomId: string; tenantId: string; domainId: string; kind: string; subjectId: string; title: string; deadline: string; reviewEveryDays: number | null; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  setAgenda(a: { tenantId: string; domainId: string; cadenceId: string; items: unknown[]; actor: string; correlationId: string }): Promise<Row>;
  escalateGap(a: { escalationId: string; tenantId: string; domainId: string; cadenceId: string; subjectKind: string; subjectId: string; reason: string; to: string; actor: string; correlationId: string }): Promise<Row>;
  answerEscalation(a: { escalationId: string; tenantId: string; domainId: string; answer: string; actor: string; correlationId: string }): Promise<Row>;
  recordSearch(a: { searchId: string; tenantId: string; domainId: string; q: string; limit: number; actor: string; correlationId: string }): Promise<Row>;
  raiseOverdueRooms(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
}

class HomeCapabilityImpl extends Core implements HomeWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  async home(a: Parameters<HomeReads['home']>[0]) {
    return this.one(sql`select executive.home(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.principalId}::uuid, ${a.ceiling}, ${a.limit}::int) as r`, 'home');
  }
  async commandView(a: Parameters<HomeReads['commandView']>[0]) {
    return this.one(sql`select executive.command_view(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.principalId}::uuid, ${a.ceiling}, ${a.viewKey}, ${a.limit}::int) as r`, 'command_view');
  }
  async commandViewsFor(a: Parameters<HomeReads['commandViewsFor']>[0]): Promise<Row[]> {
    const r = await this.one(sql`select executive.command_views_for(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.principalId}::uuid) as r`, 'command_views_for');
    return Array.isArray(r) ? (r as unknown as Row[]) : [];
  }
  async contextChoices(a: Parameters<HomeReads['contextChoices']>[0]) {
    return this.one(sql`select executive.context_choices(${a.tenantId}::uuid, ${a.domainId}::uuid) as r`, 'context_choices');
  }
  async currentContext(a: { principalId: string }): Promise<Row | null> {
    return this.maybe(sql`select executive.current_context(${a.principalId}::uuid) as r`);
  }
  async cadenceOf(a: Parameters<HomeReads['cadenceOf']>[0]) {
    return this.one(sql`select executive.cadence_of(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.period}) as r`, 'cadence_of');
  }
  async metrics(a: Parameters<HomeReads['metrics']>[0]) {
    return this.one(sql`select executive.metrics(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.from}::timestamptz, ${a.to}::timestamptz) as r`, 'metrics');
  }
  async subjectStatus(a: Parameters<HomeReads['subjectStatus']>[0]): Promise<string | null> {
    const rows = a.kind === 'objective'
      ? await this.call<{ s: string }>(sql`select s.status as s from graph.strategy_current s where s.strategy_object_id = ${a.id}::uuid and s.tenant_id = ${a.tenantId}::uuid and s.domain_id = ${a.domainId}::uuid and s.object_type = 'OBJ'`)
      : await this.call<{ s: string }>(sql`select x.state as s from prediction.scenarios_current x where x.scenario_id = ${a.id}::uuid and x.tenant_id = ${a.tenantId}::uuid and x.domain_id = ${a.domainId}::uuid`);
    return rows[0]?.s ?? null;
  }
  async now(): Promise<string> {
    const rows = await this.call<{ t: string }>(sql`select decision.iso(clock_timestamp()) as t`);
    return String(rows[0]?.t);
  }
  async setContext(a: Parameters<HomeWrites['setContext']>[0]) {
    return this.one(sql`select executive.set_context(${a.contextId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.objectiveId}::uuid, ${a.horizon}, ${a.scenarioId}::uuid, ${a.classification}, ${a.effectiveAt}::timestamptz, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'set_context');
  }
  async openCadence(a: Parameters<HomeWrites['openCadence']>[0]) {
    return this.one(sql`select executive.open_cadence(${a.cadenceId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.period}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'open_cadence');
  }
  async resetCadence(a: Parameters<HomeWrites['resetCadence']>[0]) {
    return this.one(sql`select executive.reset_cadence(${a.nextId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.period}, ${a.confirmReason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'reset_cadence');
  }
  async openSubjectRoom(a: Parameters<HomeWrites['openSubjectRoom']>[0]) {
    return this.one(sql`select executive.open_subject_room(${a.roomId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.subjectId}::uuid, ${a.title}, ${a.deadline}::timestamptz, ${a.reviewEveryDays}::int, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'open_subject_room');
  }
  async setAgenda(a: Parameters<HomeWrites['setAgenda']>[0]) {
    return this.one(sql`select executive.set_agenda(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.cadenceId}::uuid, ${JSON.stringify(a.items)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'set_agenda');
  }
  async escalateGap(a: Parameters<HomeWrites['escalateGap']>[0]) {
    return this.one(sql`select executive.escalate_gap(${a.escalationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.cadenceId}::uuid, ${a.subjectKind}, ${a.subjectId}::uuid, ${a.reason}, ${a.to}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'escalate_gap');
  }
  async answerEscalation(a: Parameters<HomeWrites['answerEscalation']>[0]) {
    return this.one(sql`select executive.answer_escalation(${a.escalationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.answer}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'answer_escalation');
  }
  async recordSearch(a: Parameters<HomeWrites['recordSearch']>[0]) {
    return this.one(sql`select executive.record_search(${a.searchId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.q}, ${a.limit}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_search');
  }
  async raiseOverdueRooms(a: Parameters<HomeWrites['raiseOverdueRooms']>[0]) {
    return this.one(sql`select executive.raise_overdue_rooms(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'raise_overdue_rooms');
  }
}

export const HomeCapability = {
  read(tx: Tx, action: string): HomeReads { return new HomeCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): HomeWrites { return new HomeCapabilityImpl(tx, action); },
};
