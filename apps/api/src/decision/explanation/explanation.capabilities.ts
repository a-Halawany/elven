/**
 * EXPLANATION AND APPEAL CAPABILITIES — CP-6 B35 part `explanation` (migration 0101 §E; F-P6-03).
 *
 * The events idiom (products/events/events.capabilities.ts): one class per port group, narrow views. Each write is a thin binding to a
 * SECURITY DEFINER port that asserts the route's own action, the scope and the acting principal:
 *
 *   generate    decision.generate_explanation (`decision.explanation.generate`): the server builds the explanation from the subject's state;
 *   render      decision.render_explanation (`decision.explanation.render`): a rendering admitted through the faithfulness check v1;
 *   open        decision.open_appeal (`decision.appeal.open`): a contest with standing, scope, grounds, evidence and a deadline;
 *   adjudicate  decision.assign_appeal_adjudicator and decision.adjudicate_appeal (`decision.appeal.adjudicate`);
 *   close       decision.close_appeal (`decision.appeal.close`);
 *   tick        decision.flag_overdue_appeals (`executive.attention.tick`: the tick step `appeal-deadlines`).
 *
 * Each read is an invoker read under the caller's RLS (explanation_read, explanation_surface, appeal_case_read, appeals_list,
 * dse_faithfulness). Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class Core {
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
  protected async maybe(q: ReturnType<typeof sql>): Promise<Row | null> {
    const r = await q.execute(this.#tx);
    return (r.rows as Array<{ r: Row | null }>)[0]?.r ?? null;
  }
  /** The database's clock (every "as of now" read compares against it, never the process's). */
  async now(): Promise<string> {
    const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.#tx);
    return (r.rows[0]?.now ?? new Date()).toISOString();
  }
}

export type ExplanationSubjectKind = 'package_version' | 'recommendation' | 'analysis' | 'forecast' | 'run' | 'option';
export type AppealSubjectKind = 'package' | 'forecast' | 'source' | 'claim' | 'recommendation' | 'explanation';

export interface ExplanationReads {
  readonly action: string;
  now(): Promise<string>;
  /** decision.explanation_read: the object with its read-time state, renderings and cases (null: not visible). */
  explanation(explanationId: string): Promise<Row | null>;
  /** decision.explanation_surface: the subject now, its current explanation, every version, every case (null: nothing visible). */
  surface(a: { subjectKind: ExplanationSubjectKind; subjectId: string; subjectVersion: number | null }): Promise<Row | null>;
  /** decision.dse_faithfulness against a stored explanation's items (a dry check: nothing is written). */
  check(a: { explanationId: string; sentences: Row[] }): Promise<Row | null>;
  /** decision.appeal_case_read: the case, its ledger, overdue, the subject now (null: not visible). */
  appealCase(caseId: string): Promise<Row | null>;
  /** decision.appeals_list: the cases of the domain, newest first. */
  appeals(a: { state: string | null; subjectKind: string | null; limit: number }): Promise<Row[]>;
}

export interface GenerateWrites extends ExplanationReads {
  generate(a: { explanationId: string; tenantId: string; domainId: string; subjectKind: ExplanationSubjectKind; subjectId: string; subjectVersion: number | null; actor: string; correlationId: string }): Promise<Row>;
}
export interface RenderWrites extends ExplanationReads {
  render(a: { renderingId: string; tenantId: string; domainId: string; explanationId: string; audience: Row; sentences: Row[]; actor: string; correlationId: string }): Promise<Row>;
}
export interface OpenWrites extends ExplanationReads {
  open(a: { caseId: string; tenantId: string; domainId: string; subjectKind: AppealSubjectKind; subjectId: string; subjectVersion: number | null; explanationId: string | null; scope: Row;
    grounds: string; evidence: Row[]; deadlineAt: string | null; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}
export interface AdjudicateWrites extends ExplanationReads {
  assign(a: { tenantId: string; domainId: string; caseId: string; adjudicator: string; actor: string; correlationId: string }): Promise<Row>;
  adjudicate(a: { tenantId: string; domainId: string; caseId: string; outcome: 'upheld' | 'dismissed' | 'partly_upheld'; rationale: string; correction: string | null; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}
export interface CloseWrites extends ExplanationReads {
  close(a: { tenantId: string; domainId: string; caseId: string; note: string; actor: string; correlationId: string }): Promise<Row>;
}
export interface DeadlineTick {
  readonly action: string;
  flagOverdue(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
}

class ExplanationImpl extends Core implements GenerateWrites, RenderWrites, OpenWrites, AdjudicateWrites, CloseWrites, DeadlineTick {
  constructor(tx: Tx, action: string) { super(tx, action); }
  explanation(explanationId: string): Promise<Row | null> {
    return this.maybe(sql`select decision.explanation_read(${explanationId}::uuid) as r`);
  }
  surface(a: Parameters<ExplanationReads['surface']>[0]): Promise<Row | null> {
    return this.maybe(sql`select decision.explanation_surface(${a.subjectKind}, ${a.subjectId}::uuid, ${a.subjectVersion}::int) as r`);
  }
  check(a: Parameters<ExplanationReads['check']>[0]): Promise<Row | null> {
    return this.maybe(sql`select decision.dse_faithfulness(x.items, ${JSON.stringify(a.sentences)}::jsonb) as r from decision.explanations x where x.explanation_id = ${a.explanationId}::uuid`);
  }
  appealCase(caseId: string): Promise<Row | null> {
    return this.maybe(sql`select decision.appeal_case_read(${caseId}::uuid) as r`);
  }
  async appeals(a: Parameters<ExplanationReads['appeals']>[0]): Promise<Row[]> {
    const r = await this.maybe(sql`select jsonb_build_object('l', decision.appeals_list(${a.state}, ${a.subjectKind}, ${a.limit}::int)) as r`);
    return ((r ?? {})['l'] ?? []) as Row[];
  }
  generate(a: Parameters<GenerateWrites['generate']>[0]): Promise<Row> {
    return this.one(sql`select decision.generate_explanation(${a.explanationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.subjectKind}, ${a.subjectId}::uuid, ${a.subjectVersion}::int,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'generate_explanation');
  }
  render(a: Parameters<RenderWrites['render']>[0]): Promise<Row> {
    return this.one(sql`select decision.render_explanation(${a.renderingId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.explanationId}::uuid, ${JSON.stringify(a.audience)}::jsonb,
      ${JSON.stringify(a.sentences)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'render_explanation');
  }
  open(a: Parameters<OpenWrites['open']>[0]): Promise<Row> {
    return this.one(sql`select decision.open_appeal(${a.caseId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.subjectKind}, ${a.subjectId}::uuid, ${a.subjectVersion}::int, ${a.explanationId}::uuid,
      ${JSON.stringify(a.scope)}::jsonb, ${a.grounds}, ${JSON.stringify(a.evidence)}::jsonb, ${a.deadlineAt}::timestamptz, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'open_appeal');
  }
  assign(a: Parameters<AdjudicateWrites['assign']>[0]): Promise<Row> {
    return this.one(sql`select decision.assign_appeal_adjudicator(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.caseId}::uuid, ${a.adjudicator}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'assign_appeal_adjudicator');
  }
  adjudicate(a: Parameters<AdjudicateWrites['adjudicate']>[0]): Promise<Row> {
    return this.one(sql`select decision.adjudicate_appeal(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.caseId}::uuid, ${a.outcome}, ${a.rationale}, ${a.correction}, ${a.actor}::uuid, ${a.eventId}::uuid,
      ${a.correlationId}::uuid) as r`, 'adjudicate_appeal');
  }
  close(a: Parameters<CloseWrites['close']>[0]): Promise<Row> {
    return this.one(sql`select decision.close_appeal(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.caseId}::uuid, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'close_appeal');
  }
  flagOverdue(a: Parameters<DeadlineTick['flagOverdue']>[0]): Promise<Row> {
    return this.one(sql`select decision.flag_overdue_appeals(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'flag_overdue_appeals');
  }
}

export const ExplanationCapability = {
  read(tx: Tx, action: string): ExplanationReads { return new ExplanationImpl(tx, action); },
  generate(tx: Tx, action: string): GenerateWrites { return new ExplanationImpl(tx, action); },
  render(tx: Tx, action: string): RenderWrites { return new ExplanationImpl(tx, action); },
  open(tx: Tx, action: string): OpenWrites { return new ExplanationImpl(tx, action); },
  adjudicate(tx: Tx, action: string): AdjudicateWrites { return new ExplanationImpl(tx, action); },
  close(tx: Tx, action: string): CloseWrites { return new ExplanationImpl(tx, action); },
  tick(tx: Tx, action: string): DeadlineTick { return new ExplanationImpl(tx, action); },
};
