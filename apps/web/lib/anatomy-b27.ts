/**
 * The scenario anatomy client — CP-6 B27 part `anatomy` (0097 §A; F-P4-07).
 *
 * Every response is returned VERBATIM: the elements (drivers, actors, mechanisms, interventions, impacts) with their versions, the
 * intervention → mechanism → impact map the server composed, the assumption register with each ASU's verification state as the Knowledge
 * Graph records it, the records, a suspended branch's cause, who suspended it and when. The acts are a person's own: a strategy or forecast
 * owner declares, revises and retires elements, links and unlinks assumptions and adds records; a person suspends a live branch with a
 * reason; the branch's owner (or the scenario's) reinstates it with a note. The helpers below only word what the record says.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;

export const ELEMENT_KINDS = ['driver', 'actor', 'mechanism', 'intervention', 'impact'] as const;
export type ElementKind = (typeof ELEMENT_KINDS)[number];
export const ELEMENT_KIND_LABEL: Record<ElementKind, string> = {
  driver: 'Drivers', actor: 'Actors', mechanism: 'Mechanisms', intervention: 'Interventions', impact: 'Impacts',
};
export const RECORD_KINDS = ['narrative', 'implication', 'option'] as const;
export type RecordKind = (typeof RECORD_KINDS)[number];

export interface AnatomyElement {
  element_id: string; scenario_id: string; branch_id: string | null; kind: ElementKind; name: string; description: string; attributes: Row; graph_refs: Array<{ kind: string; id: string; label?: string }>;
  version: number; state: 'active' | 'retired'; declared_by: string; declared_at: string; updated_by: string; updated_at: string; retired_by: string | null; retired_at: string | null; retirement_reason: string | null;
}
export interface InterventionPath {
  intervention: { element_id: string; name: string; by: string; expected_effect: string };
  targets: Array<{ element_id: string; kind: string; name: string }>;
  mechanisms: Array<{ element_id: string; name: string; cause: string; effect: string }>;
  impacts: Array<{ element_id: string; name: string; on: { kind: string; id: string; label?: string } | null; direction: string; magnitude: string; horizon: string }>;
  unmapped: boolean;
}
export interface SuspensionView {
  suspended_at: string; suspended_by: string; suspended_by_name: string | null; reason: string; cause: { kind: 'assumption' | 'element' | 'operator'; id: string; title?: string; name?: string; [k: string]: unknown };
  suspended_from: 'open' | 'flipped'; current: boolean; reinstated_at: string | null; reinstated_by: string | null; reinstated_by_name: string | null; reinstatement_note: string | null;
}
export interface AnatomyBranch {
  branch_id: string; name: string; kind: string; kind_label: string | null; statement: string; state: 'open' | 'flipped' | 'closed' | 'suspended'; live: boolean; decision_active: boolean;
  owner_principal_id: string; owner_name: string | null; indicator_id: string | null; consequence_class: string | null; suspension: SuspensionView | null;
  open_items: Array<{ item_id: string; state: string; owner_principal_id: string; due_at: string | null; title: string }>;
  elements_by_kind: Record<ElementKind, AnatomyElement[]>; map: InterventionPath[];
}
export interface AssumptionLink {
  link_id: string; scenario_id: string; branch_id: string | null; assumption_id: string; critical: boolean;
  invalidation_condition: { kind: 'state' | 'claim' | 'indicator'; text: string; claim_id?: string; indicator_id?: string };
  rationale: string; version: number; state: 'linked' | 'unlinked'; linked_by: string; linked_at: string; unlinked_by: string | null; unlinked_at: string | null; unlink_reason: string | null;
  assumption: { title: string; statement: string; status: string; verification_state: 'verified' | 'unverified' | 'invalidated' | 'not_applicable'; verification_reason: string | null; verified_at: string | null } | null;
  condition_met: boolean; invalidated: boolean; note: string | null;
}
export interface ScenarioRecord {
  record_id: string; scenario_id: string; branch_id: string | null; kind: RecordKind; title: string; body: string; cites: Array<{ kind: string; id: string }>; version: number;
  supersedes: string | null; author_principal_id: string; author_name: string | null; recorded_at: string; latest: boolean;
}
export interface Anatomy {
  scenario: { scenario_id: string; title: string; statement: string; state: string; owner_principal_id: string; owner_name: string | null; current_version: number; coherence_state: string };
  branches: AnatomyBranch[]; elements: AnatomyElement[]; assumptions: AssumptionLink[]; records: ScenarioRecord[];
  scenario_wide: { elements_by_kind: Record<ElementKind, AnatomyElement[]>; map: InterventionPath[] };
}

/* ───────────── the words ───────────── */
/** A branch's state as a glyph, a token and words — never colour alone; a suspended branch says it is not live. */
export function branchStateMark(state: string): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'open': return { glyph: '○', token: '--eye-color-ink-muted', text: 'OPEN — live' };
    case 'flipped': return { glyph: '⚑', token: '--eye-color-critical', text: 'FLIPPED — live' };
    case 'suspended': return { glyph: '⏸', token: '--eye-color-warning', text: 'SUSPENDED — not live: no flip, no simulation, not decision-active' };
    case 'closed': return { glyph: '—', token: '--eye-color-ink-muted', text: 'CLOSED' };
    default: return { glyph: '·', token: '--eye-color-ink-muted', text: String(state).toUpperCase() };
  }
}
/** The suspension's cause in words (the server's cause object, named). */
export function causeLine(s: Pick<SuspensionView, 'cause'>): string {
  switch (s.cause.kind) {
    case 'assumption': return `the critical assumption "${String(s.cause.title ?? s.cause.id)}" was invalidated`;
    case 'element': return `suspended by a person on the ${String(s.cause['element_kind'] ?? 'element')} "${String(s.cause.name ?? s.cause.id)}"`;
    default: return 'suspended by a person';
  }
}
/** The banner of a suspended branch: the cause, when, by whom, the state a reinstatement returns to. */
export function suspensionBanner(s: SuspensionView): string {
  const who = s.suspended_by_name ?? `${s.suspended_by.slice(0, 8)}…`;
  return `Suspended ${s.suspended_at} by ${who} — ${causeLine(s)}. Reason: ${s.reason}. A reinstatement returns it to ${s.suspended_from}.`;
}
/** A reinstatement in words (only once there was one). */
export function reinstatementLine(s: SuspensionView): string | null {
  if (s.reinstated_at === null) return null;
  return `Reinstated ${s.reinstated_at} by ${s.reinstated_by_name ?? `${String(s.reinstated_by).slice(0, 8)}…`}: ${s.reinstatement_note ?? ''}`;
}
/** An element's attributes in words, by kind. */
export function attributesLine(e: Pick<AnatomyElement, 'kind' | 'attributes'>): string {
  const a = e.attributes;
  const parts: string[] = [];
  switch (e.kind) {
    case 'driver': parts.push(a['exogenous'] === true ? 'exogenous (a shock from outside)' : 'endogenous'); break;
    case 'actor': parts.push(`agency ${String(a['agency'] ?? '—')}`); if (typeof a['interest'] === 'string') parts.push(`interest: ${a['interest']}`); break;
    case 'mechanism': parts.push(`${String(a['cause'] ?? '?')} → ${String(a['effect'] ?? '?')}`); break;
    case 'intervention': parts.push(`by ${String(a['by'] ?? '?')}`, `expected: ${String(a['expected_effect'] ?? '?')}`); break;
    case 'impact': {
      const on = (a['on'] ?? null) as { kind?: string; label?: string; id?: string } | null;
      parts.push(`on ${on === null ? '?' : (on.label ?? `${on.kind} ${String(on.id).slice(0, 8)}…`)}`, `${String(a['direction'] ?? '?')}`, `magnitude ${String(a['magnitude'] ?? '?')}`, `horizon ${String(a['horizon'] ?? '?')}`);
      break;
    }
  }
  const t = (a['timing'] ?? null) as { start?: string; end?: string; lag_days?: number } | null;
  if (t !== null) parts.push(`timing ${t.start ?? '…'} – ${t.end ?? '…'}${t.lag_days !== undefined ? ` (lag ${t.lag_days} d)` : ''}`);
  return parts.join(' · ');
}
/** An invalidation condition in words. */
export function conditionLine(c: AssumptionLink['invalidation_condition']): string {
  const what = c.kind === 'state' ? 'the assumption is invalidated in the Knowledge Graph'
    : c.kind === 'claim' ? `claim ${String(c.claim_id).slice(0, 8)}… is disputed or withdrawn`
    : `indicator ${String(c.indicator_id).slice(0, 8)}… is breached`;
  return `${what} — “${c.text}”`;
}
/** A register row's standing in words: critical or not, the ASU's state, the condition met, the note the server attached. */
export function linkStanding(l: Pick<AssumptionLink, 'critical' | 'state' | 'assumption' | 'condition_met' | 'note'>): string {
  if (l.state === 'unlinked') return 'UNLINKED';
  const v = l.assumption?.verification_state ?? 'unknown';
  return `${l.critical ? 'CRITICAL' : 'non-critical'} · assumption ${v}${l.condition_met ? ' · condition MET' : ''}${l.note ? ` — ${l.note}` : ''}`;
}
/** One map path in words: intervention → targets → mechanisms → impacts (an unmapped intervention says so). */
export function pathLine(p: InterventionPath): string {
  const t = p.targets.map((x) => x.name).join(', ') || '—';
  const m = p.mechanisms.map((x) => x.name).join(', ') || '—';
  const i = p.impacts.map((x) => `${x.name} (${x.direction}, ${x.magnitude}, ${x.horizon})`).join('; ');
  return `${p.intervention.name} → ${t} → ${m} → ${p.unmapped ? 'no impact mapped yet' : i}`;
}

/* ───────────── the routes ───────────── */
const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/prediction/scenarios/anatomy`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Record<string, unknown> = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'prediction',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export interface ElementIntake { kind: ElementKind; name: string; description: string; branchId?: string | null; attributes: Row; graphRefs?: Array<{ kind: string; id: string }>; expectedVersion?: number }
export interface LinkIntake { assumptionId: string; branchId?: string | null; critical: boolean; condition: { kind: 'state' | 'claim' | 'indicator'; text: string; claimId?: string; indicatorId?: string }; rationale: string; expectedVersion?: number }
export interface RecordIntake { kind: RecordKind; title: string; body: string; branchId?: string | null; cites?: Array<{ kind: string; id: string }>; supersedes?: string | null }

export const anatomy = {
  read: (s: Scope, scenarioId: string) => p<{ at: string; anatomy: Anatomy; receipt: Receipt }>(s, `/${scenarioId}/read`, 'prediction.scenario.anatomy.read', 'SCN', {}, scenarioId),
  declareElement: (s: Scope, scenarioId: string, e: ElementIntake) => p<{ element: AnatomyElement; receipt: Receipt }>(s, `/${scenarioId}/elements/declare`, 'prediction.scenario.anatomy.element', 'SCN', { ...e }, scenarioId),
  reviseElement: (s: Scope, scenarioId: string, elementId: string, e: ElementIntake & { expectedVersion: number }) =>
    p<{ element: AnatomyElement; receipt: Receipt }>(s, `/${scenarioId}/elements/${elementId}/revise`, 'prediction.scenario.anatomy.element', 'SCN', { ...e }, scenarioId),
  retireElement: (s: Scope, scenarioId: string, elementId: string, reason: string) =>
    p<{ element: AnatomyElement; receipt: Receipt }>(s, `/${scenarioId}/elements/${elementId}/retire`, 'prediction.scenario.anatomy.retire', 'SCN', { reason }, scenarioId),
  link: (s: Scope, scenarioId: string, l: LinkIntake) => p<{ link: AssumptionLink; receipt: Receipt }>(s, `/${scenarioId}/assumptions/link`, 'prediction.scenario.anatomy.assumption', 'SCN', { ...l }, scenarioId),
  unlink: (s: Scope, scenarioId: string, linkId: string, reason: string) =>
    p<{ link: AssumptionLink; receipt: Receipt }>(s, `/${scenarioId}/assumptions/${linkId}/unlink`, 'prediction.scenario.anatomy.assumption', 'SCN', { reason }, scenarioId),
  addRecord: (s: Scope, scenarioId: string, r: RecordIntake) => p<{ record: ScenarioRecord; receipt: Receipt }>(s, `/${scenarioId}/records/add`, 'prediction.scenario.anatomy.record', 'SCN', { ...r }, scenarioId),
  suspend: (s: Scope, branchId: string, reason: string, elementId?: string | null) =>
    p<{ suspension: Row; receipt: Receipt }>(s, `/branches/${branchId}/suspend`, 'prediction.scenario.anatomy.suspend', 'SCN', { reason, ...(elementId ? { elementId } : {}) }, branchId),
  reinstate: (s: Scope, branchId: string, note: string) =>
    p<{ reinstatement: Row; receipt: Receipt }>(s, `/branches/${branchId}/reinstate`, 'prediction.scenario.anatomy.reinstate', 'SCN', { note }, branchId),
};
