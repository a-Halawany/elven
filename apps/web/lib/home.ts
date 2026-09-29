/**
 * CP-6 B36 (0094 §H) — THE EXECUTIVE HOME (F-P6-11): the seven sections in one cadence (WS-01), the loop reset (JRN-19), the context
 * switcher and the role × moment command views (CAP-EO-02/-04), the scenario rooms and objective reviews with deadlines, the executive
 * search with explanation, the executive operator's cadence tooling (PER-03) and the executive metrics. Every act is a separate governed
 * write with its own PDP action; the server composes every section under the reader's own scope and context and SAYS each section's
 * as-of, count and limitations. The helpers below only word what the server said and shape what is sent; nothing here filters, ranks,
 * decides staleness or authorises — the port does, and the page renders its refusal as stated.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };
type Row = Record<string, unknown>;

export const HOME_SECTIONS = ['priorities', 'intelligence', 'warnings', 'decisions', 'commitments', 'outcomes', 'cadence'] as const;
export type HomeSectionName = (typeof HOME_SECTIONS)[number];
export const HORIZONS = ['30d', '90d', '12m', '36m'] as const;
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export const CADENCE_PERIODS = ['weekly', 'monthly', 'quarterly'] as const;
export const SUBJECT_ROOM_KINDS = ['scenario', 'objective_review'] as const;
export const AGENDA_KINDS = ['attention_item', 'room', 'package', 'commitment_item', 'review', 'warning', 'briefing'] as const;
/** The roles that open / reset the cadence, curate the agenda and escalate a gap (executive.cadence_roles, 0094 §H3). */
export const CADENCE_ROLES = ['executive', 'executive_operator', 'domain_admin', 'platform_admin'] as const;

export interface HomeSection { as_of: string | null; count: number; items: Row[]; limitations: string[] | null; context: string | null }
export interface HomeContextRef { digest: string | null; context_id: string | null; objective_id: string | null; scenario_id: string | null; horizon: string; classification: string; effective_at: string | null; set: boolean }
export interface HomeRead {
  read_at: string; as_of: string; context: HomeContextRef; ceiling: { reader: string; context: string | null; effective: string }; limit: number;
  sections: { priorities: HomeSection; intelligence: HomeSection; warnings: HomeSection; decisions: HomeSection; commitments: HomeSection; outcomes: HomeSection & { since?: string | null };
              cadence: HomeSection & { open: Row | null; last_closed: Row | null; agenda: Row[]; escalations: Row[]; closed_since: Row | null } };
}
export interface CommandView { view_key: string; role_code: string; moment: string; title: string; description: string; sections: string[]; actions: string[] }
export interface CommandViewRead extends Omit<CommandView, 'sections'> { sections_order: string[]; read_at: string; as_of: string; context: HomeContextRef; ceiling: HomeRead['ceiling']; sections: Partial<HomeRead['sections']> }
export interface ContextChoice { id: string; title: string; status?: string; state?: string; owner: string; stale: boolean }
export interface ContextChoices { objectives: ContextChoice[]; scenarios: ContextChoice[]; horizons: string[]; classifications: string[]; as_of: string; current: Row | null }
export interface SearchHit { kind: string; id: string; title: string; state: string | null; gate: Row | null; as_of: string; package_id: string | null;
  explanation: { field: string; terms: string[]; query: string; as_of: string; read_at: string; context_filter: string; context_digest: string | null; why: string } }
export interface SearchRead { search_id: string; query: string; as_of: string; context: { digest: string | null; objective_id: string | null }; count: number; kinds: Record<string, number>; hits: SearchHit[]; limit: number; limitations: string[] }
export interface Metric { name: string; unit: string; population: string; n: number; basis: string; as_of: string; median?: number | null; p90?: number | null; n_acted?: number; n_without_act?: number; within_deadline?: number; overdue_open?: number; ratio?: number | null; rooms?: Row }
export interface MetricsRead { as_of: string; window: { from: string; to: string }; metrics: Metric[]; stored: boolean }

const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : v === null || v === undefined || v === '' ? '—' : String(v));

/** A section's header in words: the count, the as-of, the context it was read under (by its digest). */
export function sectionLine(name: string, s: Pick<HomeSection, 'count' | 'as_of' | 'context'> | null | undefined): string {
  if (s === null || s === undefined) return `${name}: not composed`;
  const ctx = typeof s.context === 'string' && s.context !== '' ? `under context ${s.context.slice(0, 12)}…` : 'under no context (the whole domain)';
  return `${name}: ${s.count} as of ${s.as_of ?? 'now'} · ${ctx}`;
}
/** The limitations a section declared, joined; "none declared" when the server declared none. */
export function limitationsLine(s: Pick<HomeSection, 'limitations'> | null | undefined): string {
  const l = s?.limitations;
  return Array.isArray(l) && l.length > 0 ? l.join(' · ') : 'no limitation declared';
}
/** The active context in words — the same line the health page uses, with the effective ceiling the home composed under. */
export function contextLine(c: HomeContextRef | null | undefined, ceiling?: HomeRead['ceiling'] | null): string {
  if (c === null || c === undefined || c.set !== true) return `no context set — the whole domain, horizon ${c?.horizon ?? '90d'}, the reader's own ceiling${ceiling ? ` (${ceiling.effective})` : ''}, effective now`;
  return `objective ${c.objective_id === null ? 'the whole domain' : short(c.objective_id)} · horizon ${c.horizon} · scenario ${c.scenario_id === null ? 'none' : short(c.scenario_id)} · ceiling ${ceiling?.effective ?? c.classification}${ceiling && ceiling.context !== null && ceiling.context !== ceiling.effective ? ` (the context asked ${ceiling.context}; the reader's is ${ceiling.reader})` : ''} · effective ${c.effective_at ?? 'now'} · digest ${c.digest === null ? '—' : `${c.digest.slice(0, 12)}…`}`;
}
/** A switcher choice, with STALE said in words (the server judged it; a stale choice is offered disabled and refused by the port anyway). */
export function choiceLabel(c: ContextChoice): string {
  const lifecycle = c.status ?? c.state ?? 'unknown';
  return `${c.title} (${lifecycle})${c.stale ? ' — STALE, cannot be set' : ''}`;
}
/** The cadence in words: the open cycle, or the absence, and the last closed one. */
export function cadenceLine(open: Row | null | undefined, lastClosed: Row | null | undefined): string {
  if (open === null || open === undefined) return `no cadence is open${lastClosed ? ` (the last ${String(lastClosed['period'])} cycle #${String(lastClosed['sequence'])} closed ${String(lastClosed['closed_at'])})` : ''} — the executive or the operator opens one`;
  return `${String(open['period'])} cycle #${String(open['sequence'])} open since ${String(open['opened_at'])} by ${short(open['opened_by'])}${lastClosed ? ` · the previous (#${String(lastClosed['sequence'])}) closed ${String(lastClosed['closed_at'])}` : ''}`;
}
/** The closing record in words — what the reset would close (or closed): reviewed, decided, committed, left open. */
export function closingRecordLine(r: Row | null | undefined): string {
  if (r === null || r === undefined) return 'no closing record';
  const g = (k: string): Row => ((r[k] ?? {}) as Row);
  const decided = g('decided'); const committed = Array.isArray(decided['committed']) ? (decided['committed'] as unknown[]).length : 0;
  const left = g('left_open'); const board = Array.isArray(left['board_decisions_open']) ? (left['board_decisions_open'] as unknown[]).length : 0;
  return `reviewed ${String(g('reviewed')['room_reviews'] ?? 0)} room review(s) + ${String(g('reviewed')['reviews_concluded'] ?? 0)} concluded · decided ${committed} committed, ${String(decided['rejected'] ?? 0)} rejected, ${String(decided['withdrawn'] ?? 0)} withdrawn · committed ${String(g('committed')['items_opened'] ?? 0)} item(s) opened, ${String(g('committed')['items_done'] ?? 0)} done · left open ${String(left['attention_items'] ?? 0)} queue item(s), ${String(left['rooms_overdue'] ?? 0)} room(s) overdue, ${String(left['packages_in_flight'] ?? 0)} package(s) in flight, ${String(left['commitment_items_overdue'] ?? 0)} commitment item(s) overdue, ${board} board-class decision(s) open`;
}
/** Whether the reset needs the executive's confirmation: the server refuses it otherwise (the page asks for the reason up front). */
export function resetNeedsConfirmation(r: Row | null | undefined): number {
  const left = ((r?.['left_open'] ?? {}) as Row)['board_decisions_open'];
  return Array.isArray(left) ? left.length : 0;
}
/** A search hit's explanation in one line: the kind, the state, why it matched, the context filter. */
export function hitLine(h: SearchHit): string {
  const gate = h.gate !== null && h.gate !== undefined && typeof h.gate['state'] === 'string' ? ` · gate ${String(h.gate['state']).toUpperCase()}` : '';
  return `${h.kind} "${h.title}" (${h.state ?? 'no state'}${gate}) — ${h.explanation.why} · as of ${h.explanation.as_of} · ${h.explanation.context_filter}`;
}
/** A metric in words: its value(s), its population and its basis; "not measured" when the population is empty. */
export function metricLine(m: Metric): string {
  const n = Number(m.n ?? 0);
  if (m.name === 'review_completion') {
    const rooms = (m.rooms ?? null) as Row | null;
    return `${m.name}: ${m.ratio === null || m.ratio === undefined ? 'not measured' : `${(Number(m.ratio) * 100).toFixed(1)} %`} of ${n} review(s) concluded by their due instant (${m.overdue_open ?? 0} still open past it)${rooms ? `; rooms: ${rooms['ratio'] === null || rooms['ratio'] === undefined ? 'not measured' : `${(Number(rooms['ratio']) * 100).toFixed(1)} %`} of ${String(rooms['with_deadline'] ?? 0)} reviewed before their deadline` : ''} — ${m.population} · as of ${m.as_of}`;
  }
  const secs = (v: number | null | undefined) => (v === null || v === undefined ? 'not measured' : Number(v) >= 3600 ? `${(Number(v) / 3600).toFixed(1)} h` : Number(v) >= 60 ? `${(Number(v) / 60).toFixed(1)} min` : `${Number(v).toFixed(1)} s`);
  const acted = m.name === 'time_to_understanding' ? ` (${m.n_acted ?? 0} acted on, ${m.n_without_act ?? 0} without an act)` : '';
  return `${m.name}: median ${secs(m.median)}, p90 ${secs(m.p90)} over ${n}${acted} — ${m.population} · as of ${m.as_of}`;
}
/** The views a person may open, from what the server listed: the page offers only these. */
export function viewsByRole(views: CommandView[]): Array<{ role: string; views: CommandView[] }> {
  const by = new Map<string, CommandView[]>();
  for (const v of views) by.set(v.role_code, [...(by.get(v.role_code) ?? []), v]);
  return [...by.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([role, vs]) => ({ role, views: vs.sort((a, b) => a.moment.localeCompare(b.moment)) }));
}
/** The agenda intake from the page's rows: only complete rows are sent; the server validates and refuses naming the item. */
export function buildAgenda(rows: Array<{ kind: string; id: string; note: string }>): Array<{ kind: string; id: string; note?: string }> {
  return rows.filter((r) => (AGENDA_KINDS as readonly string[]).includes(r.kind) && /^[0-9a-f-]{36}$/i.test(r.id)).map((r) => (r.note.trim() === '' ? { kind: r.kind, id: r.id } : { kind: r.kind, id: r.id, note: r.note.trim() }));
}
/** Which safe actions the view offers, worded (the view offers; the server authorises each act on its own). */
export function actionLabel(a: string): string {
  switch (a) {
    case 'acknowledge_item': return 'Acknowledge a queue item (on the Attention page)';
    case 'open_room': return 'Open a scenario room / objective review';
    case 'set_context': return 'Switch the context';
    case 'read_board': return 'Read the board surface';
    case 'reset_cadence': return 'Reset the loop';
    case 'set_agenda': return 'Curate the agenda';
    case 'route_work': return 'Route work (delegate an item, reassign a task — the existing acts)';
    case 'escalate_gap': return 'Escalate a gap to the executive';
    case 'record_review': return 'Record a room review (on the Decisions page)';
    default: return a;
  }
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/home`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Row = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'executive', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const home = {
  read: (s: Scope, limit = 10) => p<{ home: HomeRead; receipt: Receipt }>(s, '/read', 'executive.home.read', 'HOM', { limit }),
  choices: (s: Scope) => p<{ choices: ContextChoices; receipt: Receipt }>(s, '/context/choices', 'executive.home.read', 'CTX'),
  /** §0's set_context through this part's route: a stale objective / scenario is refused (409 `context rejected (stale)`). */
  setContext: (s: Scope, c: { objectiveId: string | null; horizon: string; scenarioId: string | null; classification: string; effectiveAt: string | null }) =>
    p<{ context: Row; receipt: Receipt }>(s, '/context/set', 'executive.context.set', 'CTX', c),
  cadence: (s: Scope, period?: string) => p<{ cadence: Row; receipt: Receipt }>(s, '/cadence/get', 'executive.home.read', 'CAD', period === undefined ? {} : { period }),
  openCadence: (s: Scope, period: string) => p<{ cadence: Row; receipt: Receipt }>(s, '/cadence/open', 'executive.cadence.open', 'CAD', { period }),
  resetCadence: (s: Scope, period: string, confirmReason: string | null) =>
    p<{ reset: Row; receipt: Receipt }>(s, '/cadence/reset', 'executive.cadence.reset', 'CAD', confirmReason === null ? { period } : { period, confirmReason }),
  openRoom: (s: Scope, r: { kind: string; subjectId: string; title: string; deadline: string; reviewEveryDays?: number }) => p<{ room: Row; receipt: Receipt }>(s, '/rooms/open', 'executive.room.open', 'DRM', r),
  views: (s: Scope) => p<{ views: CommandView[]; context: Row | null; receipt: Receipt }>(s, '/views/list', 'executive.home.read', 'CVW'),
  view: (s: Scope, viewKey: string, limit = 10) => p<{ view: CommandViewRead; receipt: Receipt }>(s, '/views/read', 'executive.home.read', 'CVW', { viewKey, limit }),
  /** A governed act: the hits AND the access-ledger row. */
  search: (s: Scope, q: string, limit = 20) => p<{ search: SearchRead; receipt: Receipt }>(s, '/search', 'executive.search', 'SCH', { q, limit }),
  setAgenda: (s: Scope, cadenceId: string, items: Array<{ kind: string; id: string; note?: string }>) => p<{ agenda: Row; receipt: Receipt }>(s, '/agenda/set', 'executive.agenda.set', 'AGD', { cadenceId, items }, cadenceId),
  escalate: (s: Scope, e: { cadenceId: string; subjectKind: string; subjectId: string; reason: string; to: string }) => p<{ escalation: Row; receipt: Receipt }>(s, '/escalate', 'executive.escalation.raise', 'ESC', e),
  answerEscalation: (s: Scope, escalationId: string, answer: string) => p<{ escalation: Row; receipt: Receipt }>(s, `/escalations/${escalationId}/answer`, 'executive.escalation.answer', 'ESC', { answer }, escalationId),
  metrics: (s: Scope, w: { from?: string; to?: string } = {}) => p<{ metrics: MetricsRead; receipt: Receipt }>(s, '/metrics', 'executive.metrics.read', 'MET', w),
};
