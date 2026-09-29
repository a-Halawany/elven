/**
 * THE EXECUTIVE HOME — CP-6 B36 part `home` (0094 §H; F-P6-11: WS-01 the home, JRN-19 the loop reset, PER-03 the executive
 * operator, CAP-EO-01/-02/-04 the cadence tooling, the context switcher and the command views).
 *
 * The home is ONE SQL read (executive.home) — one snapshot, one as-of — under the reader's §0 context; this service shapes the intake
 * of every act and the one rule the port cannot state before it is reached: a STALE choice of the switcher (a closed objective, a closed
 * scenario) is refused here with the port's own family (`context rejected (stale)`), because §0's set_context refuses a retired or
 * withdrawn objective and an unknown scenario, not a closed one. The service decides nothing else: the ports compare the acting
 * principal, the roles, the record's state and the rule; the PDP admits the roles (the operator is admitted to none of approve / decide /
 * commit / publish — the harness proves each).
 *
 * The attention tick's step `room-deadlines` (order 58, after the strategy detections 50 and the plan variance 55) runs
 * executive.raise_overdue_rooms under the tick's own action: an overdue scenario room / objective review raises ONE attention item of
 * class review.convened with the overdue marker; nobody reads a page for it.
 */
import { HttpException, Injectable, type OnModuleInit } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { AttentionTickRegistry, type AttentionTickContext, type AttentionTickStep } from '../attention/tick.js';
import { HomeCapability, type HomeReads, type HomeWrites } from './home.capabilities.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const HORIZONS = ['30d', '90d', '12m', '36m'] as const;
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export const CADENCE_PERIODS = ['weekly', 'monthly', 'quarterly'] as const;
export const SUBJECT_ROOM_KINDS = ['scenario', 'objective_review'] as const;
export const AGENDA_KINDS = ['attention_item', 'room', 'package', 'commitment_item', 'review', 'warning', 'briefing'] as const;
export const ESCALATION_KINDS = [...AGENDA_KINDS, 'cadence'] as const;
export const ROOM_DEADLINES_STEP = 'room-deadlines';

const bad = (correlationId: string, m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, m), 422); };
const instantOrNull = (v: unknown, name: string, correlationId: string): string | null => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) bad(correlationId, `${name} must be an instant`);
  return new Date(v as string).toISOString();
};
const uuidOrNull = (v: unknown, name: string, correlationId: string): string | null => {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !UUID.test(v)) bad(correlationId, `${name} must be an id`);
  return v as string;
};
const limitOf = (v: unknown, dflt: number, max: number): number => Math.min(Math.max(Number(v ?? dflt) || dflt, 1), max);

/* ───────────── the intakes (pure; unit-tested) ───────────── */
export interface ContextIntake { objectiveId: string | null; horizon: string; scenarioId: string | null; classification: string; effectiveAt: string | null }
export function validateContext(p: Row, correlationId: string): ContextIntake {
  const horizon = typeof p['horizon'] === 'string' ? p['horizon'] : '90d';
  if (!(HORIZONS as readonly string[]).includes(horizon)) bad(correlationId, `horizon is one of ${HORIZONS.join(', ')}`);
  const classification = typeof p['classification'] === 'string' ? p['classification'] : 'internal';
  if (!(CLASSIFICATIONS as readonly string[]).includes(classification)) bad(correlationId, `classification is one of ${CLASSIFICATIONS.join(', ')}`);
  return { objectiveId: uuidOrNull(p['objectiveId'], 'objectiveId', correlationId), horizon, scenarioId: uuidOrNull(p['scenarioId'], 'scenarioId', correlationId), classification,
           effectiveAt: instantOrNull(p['effectiveAt'], 'effectiveAt', correlationId) };
}
/** The switcher's staleness rule, in words: null when the choice may be set, else the refusal (the port's family). */
export function staleContextReason(kind: 'objective' | 'scenario', id: string, status: string | null): string | null {
  if (status === null) return null; // unknown to the reader: the port answers (`context rejected (stale)`)
  if (kind === 'objective') return status === 'active' ? null : `context rejected (stale): objective ${id} is ${status}; a stale objective cannot be set`;
  return status === 'active' ? null : `context rejected (stale): scenario ${id} is ${status}; a stale scenario cannot be set`;
}
export function validatePeriod(p: Row, correlationId: string): string {
  const period = typeof p['period'] === 'string' ? p['period'] : 'weekly';
  if (!(CADENCE_PERIODS as readonly string[]).includes(period)) bad(correlationId, `period is one of ${CADENCE_PERIODS.join(', ')}`);
  return period;
}
export interface SubjectRoomIntake { kind: string; subjectId: string; title: string; deadline: string; reviewEveryDays: number | null }
export function validateSubjectRoom(p: Row, correlationId: string): SubjectRoomIntake {
  const kind = String(p['kind'] ?? '');
  if (!(SUBJECT_ROOM_KINDS as readonly string[]).includes(kind)) bad(correlationId, `kind is one of ${SUBJECT_ROOM_KINDS.join(', ')}`);
  if (typeof p['subjectId'] !== 'string' || !UUID.test(p['subjectId'])) bad(correlationId, 'subjectId is the scenario or objective id the room is bound to');
  const title = typeof p['title'] === 'string' ? p['title'].trim() : '';
  if (title.length < 2 || title.length > 256) bad(correlationId, 'title is 2–256 characters');
  const deadline = instantOrNull(p['deadline'], 'deadline', correlationId);
  if (deadline === null) bad(correlationId, 'deadline is the instant the room must have reviewed by');
  const every = p['reviewEveryDays'] === undefined || p['reviewEveryDays'] === null ? null : Number(p['reviewEveryDays']);
  if (every !== null && (!Number.isInteger(every) || every < 1 || every > 365)) bad(correlationId, 'reviewEveryDays is an integer between 1 and 365');
  return { kind, subjectId: p['subjectId'] as string, title, deadline: deadline as string, reviewEveryDays: every };
}
export interface AgendaItem { kind: string; id: string; note: string | null }
export function validateAgenda(p: Row, correlationId: string): { cadenceId: string; items: AgendaItem[] } {
  if (typeof p['cadenceId'] !== 'string' || !UUID.test(p['cadenceId'])) bad(correlationId, 'cadenceId is the open cadence the agenda belongs to');
  const items = p['items'];
  if (!Array.isArray(items) || items.length > 50) bad(correlationId, 'items is a list of at most 50 agenda items');
  const out: AgendaItem[] = [];
  (items as unknown[]).forEach((it, i) => {
    const r = (it !== null && typeof it === 'object' && !Array.isArray(it) ? it : {}) as Row;
    if (!(AGENDA_KINDS as readonly string[]).includes(String(r['kind']))) bad(correlationId, `items[${i}].kind is one of ${AGENDA_KINDS.join(', ')}`);
    if (typeof r['id'] !== 'string' || !UUID.test(r['id'])) bad(correlationId, `items[${i}].id is the object's id`);
    const note = typeof r['note'] === 'string' && r['note'].trim() !== '' ? r['note'].trim() : null;
    if (note !== null && note.length > 400) bad(correlationId, `items[${i}].note is at most 400 characters`);
    out.push({ kind: String(r['kind']), id: r['id'] as string, note });
  });
  return { cadenceId: p['cadenceId'] as string, items: out };
}
export interface EscalateIntake { cadenceId: string; subjectKind: string; subjectId: string; reason: string; to: string }
export function validateEscalate(p: Row, correlationId: string): EscalateIntake {
  if (typeof p['cadenceId'] !== 'string' || !UUID.test(p['cadenceId'])) bad(correlationId, 'cadenceId is the open cadence the gap belongs to');
  if (!(ESCALATION_KINDS as readonly string[]).includes(String(p['subjectKind']))) bad(correlationId, `subjectKind is one of ${ESCALATION_KINDS.join(', ')}`);
  if (typeof p['subjectId'] !== 'string' || !UUID.test(p['subjectId'])) bad(correlationId, 'subjectId is the subject\'s id');
  const reason = typeof p['reason'] === 'string' ? p['reason'].trim() : '';
  if (reason.length < 8 || reason.length > 2000) bad(correlationId, 'reason states the gap (8–2000 characters)');
  if (typeof p['to'] !== 'string' || !UUID.test(p['to'])) bad(correlationId, 'to is the principal id of the executive the gap goes to');
  return { cadenceId: p['cadenceId'] as string, subjectKind: String(p['subjectKind']), subjectId: p['subjectId'] as string, reason, to: p['to'] as string };
}
export function validateSearch(p: Row, correlationId: string): { q: string; limit: number } {
  const q = typeof p['q'] === 'string' ? p['q'].trim() : '';
  if (q.length < 2 || q.length > 200) bad(correlationId, 'q is 2–200 characters');
  return { q, limit: limitOf(p['limit'], 20, 100) };
}
/** The metrics window: [from, to) — to defaults to now (the DATABASE's instant, given by the caller), from to 90 days before it. */
export function validateWindow(p: Row, now: string, correlationId: string): { from: string; to: string } {
  const to = instantOrNull(p['to'], 'to', correlationId) ?? now;
  const from = instantOrNull(p['from'], 'from', correlationId) ?? new Date(new Date(to).getTime() - 90 * 86_400_000).toISOString();
  if (from >= to) bad(correlationId, 'from is before to');
  return { from, to };
}

@Injectable()
export class HomeService implements AttentionTickStep, OnModuleInit {
  readonly name = ROOM_DEADLINES_STEP;
  readonly order = 58;
  constructor(private readonly registry: AttentionTickRegistry) {}
  onModuleInit(): void { this.registry.register(this); }
  /** The tick step: every overdue scenario room / objective review raises its attention item once (the port dedupes on the deadline). */
  async run(ctx: AttentionTickContext): Promise<Row> {
    const r = await HomeCapability.write(ctx.tx, 'executive.attention.tick').raiseOverdueRooms({ tenantId: ctx.tenantId, domainId: ctx.domainId, actor: ctx.agentPrincipalId, correlationId: ctx.correlationId });
    const raised = Array.isArray(r['raised']) ? (r['raised'] as Row[]) : [];
    return { raised: raised.length, rooms: raised.slice(0, 50).map((x) => ({ room_id: x['room_id'], kind: x['kind'], item_id: x['item_id'], state: x['state'] })), at: r['raised_at'] ?? null };
  }

  /* ───────────── the reads ───────────── */
  home(cap: HomeReads, a: { tenantId: string; domainId: string; principalId: string; ceiling: string; limit: unknown }): Promise<Row> {
    return cap.home({ tenantId: a.tenantId, domainId: a.domainId, principalId: a.principalId, ceiling: a.ceiling, limit: limitOf(a.limit, 10, 50) });
  }
  async commandView(cap: HomeReads, a: { tenantId: string; domainId: string; principalId: string; ceiling: string; viewKey: unknown; limit: unknown }, correlationId: string): Promise<Row> {
    const key = typeof a.viewKey === 'string' ? a.viewKey.trim() : '';
    if (!/^[a-z_]+\/[a-z-]+$/.test(key)) bad(correlationId, 'viewKey is role/moment (executive/morning, executive/board-day, executive_operator/cadence-prep, decision_owner/review)');
    return cap.commandView({ tenantId: a.tenantId, domainId: a.domainId, principalId: a.principalId, ceiling: a.ceiling, viewKey: key, limit: limitOf(a.limit, 10, 50) });
  }
  async views(cap: HomeReads, a: { tenantId: string; domainId: string; principalId: string }): Promise<{ views: Row[]; context: Row | null }> {
    return { views: await cap.commandViewsFor(a), context: await cap.currentContext({ principalId: a.principalId }) };
  }
  async choices(cap: HomeReads, a: { tenantId: string; domainId: string; principalId: string }): Promise<Row> {
    const c = await cap.contextChoices({ tenantId: a.tenantId, domainId: a.domainId });
    return { ...c, current: await cap.currentContext({ principalId: a.principalId }) };
  }
  cadence(cap: HomeReads, a: { tenantId: string; domainId: string; period: unknown }): Promise<Row> {
    const period = typeof a.period === 'string' && (CADENCE_PERIODS as readonly string[]).includes(a.period) ? a.period : null;
    return cap.cadenceOf({ tenantId: a.tenantId, domainId: a.domainId, period });
  }
  async metrics(cap: HomeReads, a: { tenantId: string; domainId: string; payload: Row }, correlationId: string): Promise<Row> {
    const w = validateWindow(a.payload, await cap.now(), correlationId);
    return cap.metrics({ tenantId: a.tenantId, domainId: a.domainId, from: w.from, to: w.to });
  }

  /* ───────────── the acts (each its own governed write; the port decides) ───────────── */
  /** THE CONTEXT SWITCHER: a stale choice refused before the port (the port's family); the port records the context and its digest. */
  async setContext(cap: HomeWrites, a: { contextId: string; tenantId: string; domainId: string; intake: ContextIntake; actor: string; correlationId: string }): Promise<Row> {
    for (const [kind, id] of [['objective', a.intake.objectiveId], ['scenario', a.intake.scenarioId]] as Array<['objective' | 'scenario', string | null]>) {
      if (id === null) continue;
      const reason = staleContextReason(kind, id, await cap.subjectStatus({ tenantId: a.tenantId, domainId: a.domainId, kind, id }));
      if (reason !== null) throw new HttpException(errorBody('EYE_STA_002', a.correlationId, reason), 409);
    }
    return cap.setContext({ contextId: a.contextId, tenantId: a.tenantId, domainId: a.domainId, objectiveId: a.intake.objectiveId, horizon: a.intake.horizon, scenarioId: a.intake.scenarioId,
                            classification: a.intake.classification, effectiveAt: a.intake.effectiveAt, actor: a.actor, correlationId: a.correlationId });
  }
  openCadence(cap: HomeWrites, a: { cadenceId: string; tenantId: string; domainId: string; period: string; actor: string; correlationId: string }): Promise<Row> { return cap.openCadence(a); }
  resetCadence(cap: HomeWrites, a: { nextId: string; tenantId: string; domainId: string; period: string; confirmReason: unknown; actor: string; correlationId: string }): Promise<Row> {
    const reason = typeof a.confirmReason === 'string' && a.confirmReason.trim() !== '' ? a.confirmReason.trim() : null;
    return cap.resetCadence({ nextId: a.nextId, tenantId: a.tenantId, domainId: a.domainId, period: a.period, confirmReason: reason, actor: a.actor, correlationId: a.correlationId });
  }
  openRoom(cap: HomeWrites, a: { roomId: string; tenantId: string; domainId: string; intake: SubjectRoomIntake; actor: string; eventId: string; correlationId: string }): Promise<Row> {
    return cap.openSubjectRoom({ roomId: a.roomId, tenantId: a.tenantId, domainId: a.domainId, kind: a.intake.kind, subjectId: a.intake.subjectId, title: a.intake.title, deadline: a.intake.deadline,
                                 reviewEveryDays: a.intake.reviewEveryDays, actor: a.actor, eventId: a.eventId, correlationId: a.correlationId });
  }
  setAgenda(cap: HomeWrites, a: { tenantId: string; domainId: string; cadenceId: string; items: AgendaItem[]; actor: string; correlationId: string }): Promise<Row> { return cap.setAgenda(a); }
  escalate(cap: HomeWrites, a: { escalationId: string; tenantId: string; domainId: string; intake: EscalateIntake; actor: string; correlationId: string }): Promise<Row> {
    return cap.escalateGap({ escalationId: a.escalationId, tenantId: a.tenantId, domainId: a.domainId, ...a.intake, actor: a.actor, correlationId: a.correlationId });
  }
  answer(cap: HomeWrites, a: { escalationId: string; tenantId: string; domainId: string; answer: unknown; actor: string; correlationId: string }): Promise<Row> {
    return cap.answerEscalation({ escalationId: a.escalationId, tenantId: a.tenantId, domainId: a.domainId, answer: typeof a.answer === 'string' ? a.answer : '', actor: a.actor, correlationId: a.correlationId });
  }
  search(cap: HomeWrites, a: { searchId: string; tenantId: string; domainId: string; q: string; limit: number; actor: string; correlationId: string }): Promise<Row> { return cap.recordSearch(a); }
}
