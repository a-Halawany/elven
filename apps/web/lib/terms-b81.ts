/**
 * The product-terminology client — CP-6 B81 §CT (0119_b81_x_ct; F-P7-E-18). Every response is returned VERBATIM; the server decides the
 * state, the checks and who may act (the ports re-check every rule). Nothing here shows a term approved or current by inference. On a
 * demonstration every persona and term is SYNTHETIC; audience comprehension evidence is B111 → H3 and never claimed.
 */
import { call, type ApiResult } from './api';

type Row = Record<string, unknown>;
export interface Receipt { policyDecisionId: string; auditSeq: number }
export interface Registry {
  terms: Row[]; catalogue: { locale: string; rules_version: string; terms: Row[]; content_digest: string }; ledger: Row[]; read_at: string;
  content_version: { value: string; terms_digest: string; messages_digest: string | null }; boundary: string; receipt: Receipt;
}
export interface TermPreview {
  preview: Row & { checks: Row; eligibility: Record<'review' | 'approve' | 'publish' | 'correct' | 'retire', string[]>; consequence: Record<string, string[]>; artifact: Row | null };
  boundary: string; receipt: Receipt;
}
export interface Catalogue { locale: string; rules_version: string; terms: Row[]; content_digest: string; content_version: { value: string }; glossary_note: string; read_at: string; receipt: Receipt }
export interface LintRun { evaluation: Row; ratchet: { holds: boolean; baseline: number; current: number; regressions: Row[]; resolved: number; rule: string }; receipt: Receipt }

const P = (action: string, objectId: string | null = null, objectType = 'TRM') => ({ scope: 'PLATFORM' as const, purpose_id: 'governance', action, object_type: objectType, object_id: objectId,
  side_effect_class: action.endsWith('.read') ? 'none' as const : 'reversible' as const, consequence_class: action.endsWith('.read') ? 'C1' as const : 'C2' as const });
const base = '/v1/governance/design/terms';
type R<T> = Promise<ApiResult<T & { receipt: Receipt }>>;

export const terms = {
  registry: (): Promise<ApiResult<Registry>> => call(`${base}/read`, P('governance.design.term.read')),
  preview: (id: string, version: number): Promise<ApiResult<TermPreview>> => call(`${base}/${id}/preview`, P('governance.design.term.read', id), { version }),
  catalogue: (locale = 'en'): Promise<ApiResult<Catalogue>> => call(`${base}/catalogue/read`, P('governance.design.term.catalogue.read'), { locale }),
  domainCatalogue: (t: string, d: string, locale = 'en'): Promise<ApiResult<Catalogue>> => call(`/v1/tenants/${t}/domains/${d}/governance/design/terms/catalogue/read`,
    { scope: 'DOMAIN' as const, tenant_id: t, domain_id: d, purpose_id: 'governance', action: 'governance.design.term.catalogue.read', object_type: 'TRM', side_effect_class: 'none' as const }, { locale }),
  propose: (p: { termId?: string | null; key: string; locale?: string; expectedVersion: number; entry: Row }): R<{ term: Row }> => call(`${base}/propose`, P('governance.design.term.propose', p.termId ?? null), p),
  correct: (id: string, p: { expectedVersion: number; entry: Row; impact: string; action: string }): R<{ term: Row }> => call(`${base}/${id}/correct`, P('governance.design.term.correct', id), p),
  review: (id: string, p: { version: number; digest: string; outcome: 'ready' | 'changes_requested'; notes: string }): R<{ review: Row }> => call(`${base}/${id}/review`, P('governance.design.term.review', id), p),
  approve: (id: string, p: { version: number; digest: string; reason: string }): R<{ term: Row }> => call(`${base}/${id}/approve`, P('governance.design.term.approve', id), p),
  publish: (id: string, p: { version: number; digest: string; reason: string }): R<{ term: Row }> => call(`${base}/${id}/publish`, P('governance.design.term.publish', id), p),
  retire: (id: string, p: { version: number; reason: string }): R<{ term: Row }> => call(`${base}/${id}/retire`, P('governance.design.term.retire', id), p),
  lint: (): R<LintRun> => call(`${base}/content-lint`, P('governance.design.evaluate', null, 'DSE')),
};

/** The words of a term version's state (the server's state; never inferred). */
export function termStateText(state: string): string {
  switch (state) {
    case 'proposed': return 'Proposed — awaiting review';
    case 'reviewed': return 'Reviewed ready — awaiting the Design System Authority\'s approval';
    case 'returned': return 'Returned — changes requested; a new version is proposed';
    case 'approved': return 'Approved — awaiting publication';
    case 'published': return 'Published — the canonical term in force';
    case 'superseded': return 'Superseded — kept for history';
    case 'retired': return 'Retired — kept for history, no longer offered';
    default: return `State ${state} (as the server states it)`;
  }
}
/** An entry from the page's form fields (nothing defaulted the server would decide; empty lists are empty). */
export function entryFromForm(f: { category: string; label: string; definition: string; executive: string; analyst: string; operator: string; example: string; protectedWords: string;
                                  synonyms: string; conditions: string; cites: string; glossaryKeys: string }): Row {
  const list = (s: string) => s.split('\n').map((x) => x.trim()).filter((x) => x !== '');
  return { category: f.category, label: f.label.trim(), definition: f.definition.trim(), explanations: { executive: f.executive.trim(), analyst: f.analyst.trim(), operator: f.operator.trim() },
           example: f.example.trim(), protected: list(f.protectedWords), synonyms: list(f.synonyms), conditions: list(f.conditions), cites: list(f.cites), glossary_keys: list(f.glossaryKeys).map((x) => x.toLowerCase()) };
}
