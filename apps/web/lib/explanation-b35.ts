/**
 * The explanation and appeal client — CP-6 B35 part `explanation` (0101 §E; F-P6-03).
 *
 * Every response is returned VERBATIM: the governed explanation the SERVER generated from a subject's preserved state (its items separated
 * by category, counter-evidence, competing hypotheses, likelihood vs impact, confidence vs evidence quality, the App. L contract, the digest
 * and the read-time state — current, stale or superseded; contested or corrected), its renderings with their faithfulness, and the contest
 * and appeal cases (standing, scope, deadline, adjudicator, outcome, effect, closure). The acts are a named person's own (generate, render,
 * open, assign, adjudicate, close); the server refuses anyone else. `checkFaithfulness` is a PREVIEW of the server's faithfulness check v1
 * — the render port runs the same rule and decides.
 */
import { call, type ApiResult } from './api';
import type { Receipt, Scope } from './observation';

type Row = Record<string, unknown>;
export const ITEM_CATEGORIES = ['source_evidence', 'deterministic_transformation', 'model_inference', 'agent_judgment', 'human_assessment'] as const;
export type ItemCategory = (typeof ITEM_CATEGORIES)[number];
export const EXPLANATION_SUBJECT_KINDS = ['package_version', 'option', 'forecast', 'run', 'recommendation', 'analysis'] as const;
export type ExplanationSubjectKind = (typeof EXPLANATION_SUBJECT_KINDS)[number];
export const APPEAL_SUBJECT_KINDS = ['package', 'forecast', 'source', 'claim', 'recommendation', 'explanation'] as const;
export type AppealSubjectKind = (typeof APPEAL_SUBJECT_KINDS)[number];

export interface ExplanationItem { id: string; category: ItemCategory; role: string; ref: Row; field: string | null; statement: string; material: boolean; withheld: boolean }
export interface ExplanationStatus {
  state: 'current' | 'stale' | 'superseded'; faithfulness_state: string; superseded_by: string | null; stale: boolean; stale_reason: string | null;
  subject_digest_now: string | null; contested_by: string[]; corrected_by: string[];
}
export interface Rendering {
  rendering_id: string; explanation_id: string; audience: { role: string; language: string; accessibility: string | null }; sentences: Array<{ text: string; cites: string[] }>;
  renderer_principal_id: string; renderer_kind: 'human' | 'agent'; faithfulness: 'faithful' | 'unfaithful'; check_result: Row; state: 'standing' | 'withdrawn'; withdrawal: Row | null; rendered_at: string;
}
export interface AppealCase {
  case_id: string; subject_kind: AppealSubjectKind; subject_id: string; subject_version: number | null; subject_title: string; subject_owners: string[]; decided: boolean; package_id: string | null;
  explanation_id: string | null; appellant_principal_id: string; standing: { rule: string; basis: string }; contest_scope: Row & { statement: string }; grounds: string; evidence: Row[];
  deadline_at: string; state: 'opened' | 'under_review' | 'adjudicated' | 'closed'; adjudicator_principal_id: string | null; outcome: 'upheld' | 'dismissed' | 'partly_upheld' | null;
  rationale: string | null; correction: string | null; impact: Row | null; effect: (Row & { kind: string }) | null; adjudicated_at: string | null; closure: 'resolved' | 'withdrawn' | null;
  closed_at: string | null; closure_note: string | null; overdue_flagged_at: string | null; opened_at: string; overdue: boolean; events?: Row[]; subject_now?: Row | null;
}
export interface Explanation {
  explanation_id: string; subject_kind: ExplanationSubjectKind; subject_id: string; subject_version: number | null; explanation_version: number; supersedes: string | null;
  subject_digest: string; subject_title: string; generator: string; conclusion: Row; items: ExplanationItem[]; counter_evidence: string[]; competing_hypotheses: string[]; limitations: string[];
  uncertainty: { likelihood: Row; impact: Row; confidence: Row; evidence_quality: Row; disagreement: Row }; contract: Row; faithfulness_state: string; integrity_digest: string;
  generated_by: string; generated_at: string; status: ExplanationStatus; renderings?: Rendering[]; cases?: AppealCase[]; by_category?: Record<ItemCategory, number>; unchanged?: boolean;
}
export interface Surface { subject: Row | null; explanation: Explanation | null; versions: Row[]; cases: AppealCase[]; as_of: string }

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Row = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'decision', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const explanationB35 = {
  generate: (s: Scope, subjectKind: ExplanationSubjectKind, subjectId: string, subjectVersion: number | null) =>
    p<{ explanation: Explanation; receipt: Receipt }>(s, '/decisions/explanations/generate', 'decision.explanation.generate', 'XPL', { subjectKind, subjectId, subjectVersion }),
  surface: (s: Scope, subjectKind: ExplanationSubjectKind, subjectId: string, subjectVersion: number | null) =>
    p<{ at: string; surface: Surface; receipt: Receipt }>(s, '/decisions/explanations/surface', 'decision.explanation.read', 'XPL', { subjectKind, subjectId, subjectVersion }, subjectId),
  read: (s: Scope, explanationId: string) => p<{ explanation: Explanation; receipt: Receipt }>(s, `/decisions/explanations/${explanationId}/read`, 'decision.explanation.read', 'XPL', {}, explanationId),
  check: (s: Scope, explanationId: string, sentences: Array<{ text: string; cites: string[] }>) =>
    p<{ check: Row; receipt: Receipt }>(s, `/decisions/explanations/${explanationId}/check`, 'decision.explanation.read', 'XPL', { sentences }, explanationId),
  render: (s: Scope, explanationId: string, audience: { role: string; language: string; accessibility?: string }, sentences: Array<{ text: string; cites: string[] }>) =>
    p<{ rendering: Rendering; receipt: Receipt }>(s, `/decisions/explanations/${explanationId}/render`, 'decision.explanation.render', 'XPL', { audience, sentences }, explanationId),
  openAppeal: (s: Scope, payload: { subjectKind: AppealSubjectKind; subjectId: string; subjectVersion?: number | null; explanationId?: string | null; scope: Row; grounds: string; evidence?: Row[]; deadlineAt?: string | null }) =>
    p<{ case: AppealCase; receipt: Receipt }>(s, '/decisions/appeals/open', 'decision.appeal.open', 'APL', payload),
  appeals: (s: Scope, filter: { state?: string; subjectKind?: string } = {}) => p<{ at: string; cases: AppealCase[]; receipt: Receipt }>(s, '/decisions/appeals/list', 'decision.appeal.read', 'APL', filter),
  appealCase: (s: Scope, caseId: string) => p<{ case: AppealCase; receipt: Receipt }>(s, `/decisions/appeals/${caseId}/read`, 'decision.appeal.read', 'APL', {}, caseId),
  assign: (s: Scope, caseId: string, adjudicator: string) => p<{ case: AppealCase; receipt: Receipt }>(s, `/decisions/appeals/${caseId}/assign`, 'decision.appeal.adjudicate', 'APL', { adjudicator }, caseId),
  adjudicate: (s: Scope, caseId: string, outcome: 'upheld' | 'dismissed' | 'partly_upheld', rationale: string, correction: string | null) =>
    p<{ case: AppealCase; receipt: Receipt }>(s, `/decisions/appeals/${caseId}/adjudicate`, 'decision.appeal.adjudicate', 'APL', { outcome, rationale, correction }, caseId),
  close: (s: Scope, caseId: string, note: string) => p<{ case: AppealCase; receipt: Receipt }>(s, `/decisions/appeals/${caseId}/close`, 'decision.appeal.close', 'APL', { note }, caseId),
};

/* ───────────── the words ───────────── */
const CATEGORY_WORDS: Record<ItemCategory, { glyph: string; text: string }> = {
  source_evidence: { glyph: '⛁', text: 'Source evidence' },
  deterministic_transformation: { glyph: '⚙', text: 'Deterministic transformation' },
  model_inference: { glyph: '∿', text: 'Model inference' },
  agent_judgment: { glyph: '◇', text: 'Agent judgment' },
  human_assessment: { glyph: '☺', text: 'Human assessment' },
};
/** A category as a glyph and words — never colour alone. */
export function categoryMark(c: string): { glyph: string; text: string } {
  return (CATEGORY_WORDS as Record<string, { glyph: string; text: string }>)[c] ?? { glyph: '?', text: c };
}
/** The items grouped by category, in the five categories' order (an empty category stays, so its absence is visible). */
export function groupByCategory(items: ExplanationItem[]): Array<{ category: ItemCategory; items: ExplanationItem[] }> {
  return ITEM_CATEGORIES.map((category) => ({ category, items: items.filter((i) => i.category === category) }));
}
/** The explanation's read-time state in words. */
export function statusLine(st: ExplanationStatus | undefined): string {
  if (st === undefined) return 'state unknown';
  const head = st.state === 'current' ? 'CURRENT' : st.state === 'stale' ? 'STALE — the subject moved since it was generated' : 'SUPERSEDED by a newer explanation';
  const tail = st.contested_by.length > 0 ? ` · CONTESTED (${st.contested_by.length} open case${st.contested_by.length === 1 ? '' : 's'})` : st.corrected_by.length > 0 ? ' · CORRECTED by an upheld appeal' : '';
  return `${head} · faithfulness ${st.faithfulness_state}${tail}`;
}
/** A case's state in words, with its deadline (overdue said). */
export function caseLine(c: Pick<AppealCase, 'state' | 'outcome' | 'deadline_at' | 'overdue' | 'closure'>): string {
  const outcome = c.outcome === null ? '' : ` — ${c.outcome.replace('_', ' ')}`;
  const due = c.state === 'opened' || c.state === 'under_review' ? ` · response due ${c.deadline_at.slice(0, 16).replace('T', ' ')}${c.overdue ? ' — OVERDUE' : ''}` : '';
  const closed = c.state === 'closed' ? ` (${c.closure ?? 'closed'})` : '';
  return `${c.state.replace('_', ' ')}${closed}${outcome}${due}`;
}
/** An adjudication's effect in words. */
export function effectLine(e: (Row & { kind: string }) | null): string {
  if (e === null) return 'not adjudicated';
  switch (e.kind) {
    case 'reopen_required': return `REOPEN REQUIRED — the commitment (v${String(e['committed_version'])}) stands; the owner reopens on the cause appeal_upheld`;
    case 'reconsideration_required': return 'reconsideration required — nothing is altered';
    case 'correction_required': return `correction required through the ${String(e['owning_layer'])} layer — the original is preserved`;
    case 'rendering_withdrawn': return 'the rendering is withdrawn as unfaithful — the structured explanation stands';
    case 'regeneration_required': return 'the explanation is generated again once its subject is corrected';
    case 'none': return 'dismissed — the subject stands as it was';
    default: return e.kind;
  }
}
/** "text [I1, I3]" per line → sentences (a line without citations cites nothing: the check will say so). */
export function parseSentences(text: string): Array<{ text: string; cites: string[] }> {
  return text.split('\n').map((l) => l.trim()).filter((l) => l.length > 0).map((l) => {
    const m = /\[([^\]]*)\]\s*$/.exec(l);
    const cites = m === null ? [] : (m[1] ?? '').split(/[,\s]+/).map((x) => x.trim()).filter((x) => x.length > 0);
    return { text: (m === null ? l : l.slice(0, m.index)).trim(), cites };
  });
}
/** A datetime-local value (the viewer's wall clock) as an instant, or null when empty. */
export function instantOf(local: string): string | null {
  if (local.trim() === '') return null;
  const t = Date.parse(local);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

export interface FaithfulnessFinding { sentence: number | null; rule: string; detail: string; items?: string[] }
const COGNITION = /\b(model|agent|ai|algorithm|system|machine)\s+(thinks|thought|believes|believed|feels|felt|knows|knew|wants|wanted|intends|intended|understands|understood|realises|realised|realizes|realized)\b/i;
const CERTAINTY = /\b(certainly|definitely|guaranteed|guarantees|undoubtedly|indisputabl[a-z]*|risk-free|no risk|cannot fail|beyond doubt|without (any )?doubt)\b/i;
/** THE PREVIEW of the faithfulness check v1 (the server's dse_faithfulness, the same rules): unsupported, unknown_item, unsupported_figure,
 *  hidden_cognition, false_certainty, omits_material. Faithful when there is no finding. */
export function checkFaithfulness(items: Array<Pick<ExplanationItem, 'id' | 'statement' | 'material'>>, sentences: Array<{ text: string; cites: string[] }>): { faithful: boolean; findings: FaithfulnessFinding[] } {
  const findings: FaithfulnessFinding[] = [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const cited = new Set<string>();
  sentences.forEach((s, k) => {
    const n = k + 1;
    const t = s.text.trim();
    if (t.length < 8 || t.length > 1000) { findings.push({ sentence: n, rule: 'shape', detail: 'a sentence is 8 to 1000 characters with its cited item ids' }); return; }
    if (s.cites.length === 0) findings.push({ sentence: n, rule: 'unsupported', detail: 'the sentence cites no explanation item' });
    let basis = '';
    for (const c of s.cites) {
      const it = byId.get(c);
      if (it === undefined) findings.push({ sentence: n, rule: 'unknown_item', detail: `${c} is not an item of this explanation` });
      else { cited.add(c); basis += ` ${it.statement}`; }
    }
    for (const m of t.replace(/\bI[0-9]+\b/g, '').match(/[0-9]+(?:[.,][0-9]+)*/g) ?? []) {
      if (!basis.includes(m)) findings.push({ sentence: n, rule: 'unsupported_figure', detail: `the figure ${m} is stated by no cited item` });
    }
    if (COGNITION.test(t)) findings.push({ sentence: n, rule: 'hidden_cognition', detail: 'the sentence implies access to a model\'s or an agent\'s inner cognition' });
    if (CERTAINTY.test(t)) findings.push({ sentence: n, rule: 'false_certainty', detail: 'the sentence asserts a certainty no explanation item carries' });
  });
  const missing = items.filter((i) => i.material && !cited.has(i.id)).map((i) => i.id);
  if (missing.length > 0) findings.push({ sentence: null, rule: 'omits_material', detail: `material item(s) ${missing.join(', ')} are cited by no sentence`, items: missing });
  return { faithful: findings.length === 0, findings };
}
/** An App. L contract field in words: its items, or the stated absence. */
export function contractLine(v: unknown): string {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) return v === undefined ? '—' : JSON.stringify(v);
  const o = v as Row;
  if (Array.isArray(o['items']) && (o['items'] as unknown[]).length > 0) return `items ${(o['items'] as string[]).join(', ')}`;
  for (const k of ['none', 'inapplicable', 'missing']) if (typeof o[k] === 'string') return `${k.toUpperCase()}: ${String(o[k])}`;
  if ('value' in o) return JSON.stringify(o['value']).slice(0, 240);
  return JSON.stringify(o).slice(0, 240);
}
