/**
 * B82 §PX — THE PROVENANCE TRAIL, THE LAYERED EXPLANATION, DISSENT AND THE TRUST INDICATOR as pure functions (F-P7-E-07 ch27 + ch57:
 * V00-T-077, V00-T-104, V01-T-035, UX-27-001…005, UX-57-001…005, CMP-022, CMP-029, HX-04/05/06, WS-18; F-P7-E-01: C-047).
 * components/trust.tsx only renders what these decide; the pages /graph/trust, /graph/explain, /graph/trace, /decisions/explanations,
 * /intelligence/assessments/[id], /decisions/recommendations and /decisions/packages/[id] compose them.
 *
 *   THE TRUST INDICATOR  the envelope's FACETS side by side, each a glyph AND a word (never colour alone), NEVER A SCORE: no view here carries
 *                        a number about trust — the accessible summary names facets by outcome, it does not count them. TRUST INDETERMINATE
 *                        when a facet failed or could not be verified, with the constrained use. An attestation is a person's statement of
 *                        inspection, shown with its facets and its state — never an approval, never "trusted".
 *   THE STRENGTH         strong | partial | weak | broken | unknown in words with every reason (graph.provenance_strength); B81's
 *                        `weak_provenance` failure state reads it.
 *   THE TRAIL            backward (B50's explainPath) AND forward (what names this version today — a preview, never a recorded walk).
 *   THE LAYERS           executive → analyst → auditor over B35's App. L contract keys (no new table — DESIGN D12), each entry present / none
 *                        / inapplicable / MISSING in words; a recommendation's own fields the same way.
 *   ALTERNATIVES, DISSENT  competing hypotheses and counter-evidence with their review state ("independent review required" when none);
 *                        dissent with status, evidence and disposition; decision-ready withheld while recorded dissent is hidden.
 *   METHOD               method, model (weights digest, prompt, runtime), policy artifact, assumptions, evaluation — an unresolved method or an
 *                        undigested model CONSTRAINS decision use (INDETERMINATE), said so.
 *   THE CONSERVATIVE STATE  conflicting labels, uncalibrated confidence, omitted uncertainty, hidden dissent → INDETERMINATE with reasons, never
 *                        a promotion (UX-27-005); confidence, consensus or rank never make a command eligible (UX-27-004).
 *   THE COMMANDS         verify / attest / investigate: a named person holding the PDP rule's roles; attest never by the producer or owner;
 *                        eligibility reads WHO acts, never a facet, a strength, a confidence or a rank.
 *
 * THREE CLAIMS: construction (this file and trust-b82.test.ts — every value SYNTHETIC); demonstrated operation (the act); real acceptance
 * (UX-27-006 / UX-57-006: B111's shared recording path, then H3) — never claimed.
 */
import type { CitationRef, DisplayTruthState, ProvenanceReasonCode, ProvenanceStrength, ProvenanceStrengthValue, TrustFacet, VerificationOutcome } from './b82-seams';
import { explainPath, KIND_WORDS, OUTCOME_WORDS as NODE_OUTCOME_WORDS, type ExplainView, type PathRow } from './provenance-b50';
import { eligibility, type ConsequenceView, type Eligibility } from './authority-b81';

type Row = Record<string, unknown>;
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const words = (s: string): string => s.replace(/_/g, ' ');

/* ───────────────────────── THE FACETS AND THE OUTCOMES IN WORDS ───────────────────────── */
export const TRUST_FACETS: readonly TrustFacet[] = ['signature', 'lineage', 'custody', 'policy', 'evaluation', 'correction', 'rights', 'freshness'];
export type FacetOutcome = VerificationOutcome | 'not_checked';
export const FACET_LABELS: Readonly<Record<TrustFacet, { label: string; question: string }>> = {
  signature: { label: 'Signature', question: 'Is it signed, and does the signature verify with the key on file?' },
  lineage: { label: 'Lineage', question: 'Does every input on the backward path resolve?' },
  custody: { label: 'Custody', question: 'Is the custody of each evidence version established and intact?' },
  policy: { label: 'Policy', question: 'Were the policy decisions on its production path allowed, and are they still in force?' },
  evaluation: { label: 'Evaluation', question: 'Has it been evaluated, and was it found fit?' },
  correction: { label: 'Correction', question: 'Is this version and its inputs uncorrected and not withdrawn?' },
  rights: { label: 'Rights', question: 'Are the rights terms of its evidence in force?' },
  freshness: { label: 'Freshness', question: 'Is it current under its freshness assessment?' },
};
export const FACET_OUTCOME_WORDS: Readonly<Record<FacetOutcome, { glyph: string; word: string; sentence: string }>> = {
  verified: { glyph: '✓', word: 'VERIFIED', sentence: 'checked and it holds' },
  failed: { glyph: '✕', word: 'FAILED', sentence: 'checked and it does not hold' },
  unavailable: { glyph: '◌', word: 'UNAVAILABLE', sentence: 'could not be checked — neither verified nor refuted' },
  not_checked: { glyph: '—', word: 'NOT CHECKED', sentence: 'nothing recorded to check, or not checked yet' },
};
export const STRENGTH_WORDS: Readonly<Record<ProvenanceStrengthValue, { glyph: string; word: string; sentence: string }>> = {
  strong: { glyph: '●', word: 'STRONG', sentence: 'every input on the backward path resolves; no gap, withdrawal, correction or unsigned step is recorded' },
  partial: { glyph: '◐', word: 'PARTIAL', sentence: 'the path resolves, but an input changed since, a step is unsigned or undigested, or the walk was cut at its bounds' },
  weak: { glyph: '◔', word: 'WEAK', sentence: 'an input does not resolve, a gap is recorded, or the product or an input is marked unfit' },
  broken: { glyph: '○', word: 'BROKEN', sentence: 'an integrity gap: broken custody or an unverifiable artifact on the backward path' },
  unknown: { glyph: '?', word: 'UNKNOWN', sentence: 'the strength was not computed on this read' },
};
export const STRENGTH_REASON_WORDS: Readonly<Record<ProvenanceReasonCode, string>> = {
  not_computed: 'not computed', gap: 'gap on the path', truncated: 'walk cut at its bounds', unresolved_citation: 'an input does not resolve',
  unsigned_human_step: 'an approval no signature binds', undigested_model_call: 'a model call without its weights digest', withdrawn_input: 'an input withdrawn since',
  corrected_input: 'an input corrected since', unfit: 'marked unfit',
};

/* ───────────────────────── THE SERVER'S ROWS → VIEWS ───────────────────────── */
export interface StrengthView extends ProvenanceStrength { basis: string | null }
export function toStrength(row: Row | null | undefined): StrengthView | null {
  if (row === null || row === undefined || typeof row['strength'] !== 'string') return null;
  const s = String(row['strength']);
  return {
    ref: String(row['ref'] ?? ''), strength: (s in STRENGTH_WORDS ? s : 'unknown') as ProvenanceStrengthValue,
    reasons: arr(row['reasons']).map((r) => { const x = (r ?? {}) as Row; return { code: String(x['code']) as ProvenanceReasonCode, detail: String(x['detail'] ?? ''), nodeId: str(x['node_id']) }; }),
    ruleVersion: String(row['rule_version'] ?? ''), asOf: String(row['as_of'] ?? ''), basis: str(row['basis']),
  };
}
export interface FacetView {
  facet: TrustFacet; outcome: FacetOutcome; detail: string; checkedAt: string | null; checkedBy: string | null;
  /** computed by the read now, or the latest RECORDED verification (the signature always) */ basis: 'computed' | 'recorded';
  recorded: { outcome: VerificationOutcome; detail: string; verifiedAt: string; verifier: string } | null;
}
export interface AttestationView {
  attestationId: string; subject: string; facets: TrustFacet[]; statement: string; attestedBy: string; attestedAt: string;
  withdrawnAt: string | null; withdrawnBy: string | null; withdrawReason: string | null; state: 'standing' | 'withdrawn'; envelopeDigest: string | null;
}
export interface EnvelopeView {
  subject: string; subjectDigest: string | null; title: string; owner: string | null; facets: FacetView[]; provenance: StrengthView | null;
  attestations: AttestationView[]; verifications: Array<{ id: string; facet: string; outcome: VerificationOutcome; detail: string; verifier: string; verifiedAt: string }>;
  investigations: Array<{ itemId: string; state: string; title: string; facet: string | null; openedAt: string | null }>;
  indeterminate: boolean; reasons: Array<{ facet: string; outcome: string; detail: string }>; constrainedUse: string | null;
  ruleVersion: string; digest: string; asOf: string;
}
const facetOf = (v: unknown): TrustFacet | null => ((TRUST_FACETS as readonly string[]).includes(String(v)) ? (v as TrustFacet) : null);
const outcomeOf = (v: unknown): FacetOutcome => (['verified', 'failed', 'unavailable', 'not_checked'].includes(String(v)) ? (v as FacetOutcome) : 'not_checked');
export function toAttestation(r: Row): AttestationView {
  return {
    attestationId: String(r['attestation_id']), subject: String(r['subject'] ?? ''), facets: arr(r['facets']).map(facetOf).filter((f): f is TrustFacet => f !== null),
    statement: String(r['statement'] ?? ''), attestedBy: String(r['attested_by'] ?? ''), attestedAt: String(r['attested_at'] ?? ''),
    withdrawnAt: str(r['withdrawn_at']), withdrawnBy: str(r['withdrawn_by']), withdrawReason: str(r['withdraw_reason']),
    state: r['state'] === 'withdrawn' || str(r['withdrawn_at']) !== null ? 'withdrawn' : 'standing', envelopeDigest: str(r['envelope_digest']),
  };
}
export function toEnvelope(row: Row): EnvelopeView {
  const facets: FacetView[] = arr(row['facets']).map((f) => {
    const x = (f ?? {}) as Row; const rec = (x['recorded'] ?? null) as Row | null;
    return {
      facet: facetOf(x['facet']) ?? 'lineage', outcome: outcomeOf(x['outcome']), detail: String(x['detail'] ?? ''), checkedAt: str(x['checked_at']), checkedBy: str(x['checked_by']),
      basis: x['basis'] === 'recorded' ? 'recorded' : 'computed',
      recorded: rec === null ? null : { outcome: outcomeOf(rec['outcome']) as VerificationOutcome, detail: String(rec['detail'] ?? ''), verifiedAt: String(rec['verified_at'] ?? ''), verifier: String(rec['verifier'] ?? '') },
    };
  });
  return {
    subject: String(row['subject'] ?? ''), subjectDigest: str(row['subject_digest']), title: String(row['title'] ?? row['subject'] ?? ''), owner: str(row['owner']),
    facets, provenance: toStrength((row['provenance'] ?? null) as Row | null), attestations: arr(row['attestations']).map((a) => toAttestation((a ?? {}) as Row)),
    verifications: arr(row['verifications']).map((v) => { const x = (v ?? {}) as Row; return { id: String(x['verification_id']), facet: String(x['facet']), outcome: outcomeOf(x['outcome']) as VerificationOutcome, detail: String(x['detail'] ?? ''), verifier: String(x['verifier'] ?? ''), verifiedAt: String(x['verified_at'] ?? '') }; }),
    investigations: arr(row['investigations']).map((v) => { const x = (v ?? {}) as Row; return { itemId: String(x['item_id']), state: String(x['state'] ?? ''), title: String(x['title'] ?? ''), facet: str(x['facet']), openedAt: str(x['opened_at']) }; }),
    indeterminate: row['indeterminate'] === true,
    reasons: arr(row['reasons']).map((r) => { const x = (r ?? {}) as Row; return { facet: String(x['facet']), outcome: String(x['outcome']), detail: String(x['detail'] ?? '') }; }),
    constrainedUse: str(row['constrained_use']), ruleVersion: String(row['rule_version'] ?? ''), digest: String(row['digest'] ?? ''), asOf: String(row['as_of'] ?? ''),
  };
}

/* ───────────────────────── CMP-022: THE TRUST INDICATOR (facets, never a score) ───────────────────────── */
export interface TrustIndicatorView {
  subject: string;
  state: 'consistent' | 'indeterminate';
  headline: string;
  facets: Array<{ facet: TrustFacet; label: string; question: string; glyph: string; word: string; detail: string; basis: string; checked: string }>;
  strength: { glyph: string; word: string; sentence: string; reasons: string[] } ;
  attestations: Array<{ by: string; at: string; facets: string; state: string; statement: string }>;
  /** the accessible trust summary a screen reader hears first — facets NAMED by outcome, never counted */
  summary: string;
  constrainedUse: string | null;
}
export function trustIndicatorView(e: EnvelopeView, nameOf: (principal: string) => string = (p) => p): TrustIndicatorView {
  const facets = TRUST_FACETS.map((f) => {
    const v = e.facets.find((x) => x.facet === f) ?? { facet: f, outcome: 'not_checked' as FacetOutcome, detail: 'not answered by this read', checkedAt: null, checkedBy: null, basis: 'computed' as const, recorded: null };
    const w = FACET_OUTCOME_WORDS[v.outcome];
    return {
      facet: f, label: FACET_LABELS[f].label, question: FACET_LABELS[f].question, glyph: w.glyph, word: w.word, detail: v.detail,
      basis: v.basis === 'recorded' ? (v.checkedBy === null ? 'no verification recorded' : `recorded by ${nameOf(v.checkedBy)}`) : 'computed by this read',
      checked: v.checkedAt ?? 'not checked',
    };
  });
  const s = e.provenance === null ? STRENGTH_WORDS.unknown : STRENGTH_WORDS[e.provenance.strength];
  const group = (o: FacetOutcome) => facets.filter((f) => FACET_OUTCOME_WORDS[o].word === f.word).map((f) => f.label.toLowerCase());
  const parts = (['failed', 'unavailable', 'verified', 'not_checked'] as const).filter((o) => group(o).length > 0).map((o) => `${FACET_OUTCOME_WORDS[o].word.toLowerCase()}: ${group(o).join(', ')}`);
  const state = e.indeterminate ? 'indeterminate' : 'consistent';
  return {
    subject: e.subject, state,
    headline: state === 'indeterminate' ? 'TRUST INDETERMINATE — a facet failed or could not be verified' : 'No facet failed on this read — each facet below says what was checked',
    facets,
    strength: { glyph: s.glyph, word: s.word, sentence: s.sentence, reasons: (e.provenance?.reasons ?? []).map((r) => `${STRENGTH_REASON_WORDS[r.code] ?? words(r.code)} — ${r.detail}`) },
    attestations: e.attestations.map((a) => ({ by: nameOf(a.attestedBy), at: a.attestedAt, facets: a.facets.map((f) => FACET_LABELS[f].label.toLowerCase()).join(', '), statement: a.statement,
      state: a.state === 'withdrawn' ? `withdrawn ${a.withdrawnAt ?? ''}${a.withdrawReason === null ? '' : ` — ${a.withdrawReason}`}`.trim() : 'standing — a statement of inspection, not an approval' })),
    summary: `Trust of ${e.subject}: ${state === 'indeterminate' ? 'INDETERMINATE' : 'no facet failed'}. ${parts.join('; ')}. Provenance ${s.word.toLowerCase()}. Attestations: ${e.attestations.filter((a) => a.state === 'standing').length === 0 ? 'none standing' : e.attestations.filter((a) => a.state === 'standing').map((a) => nameOf(a.attestedBy)).join(', ')}.`,
    constrainedUse: e.constrainedUse,
  };
}
/** CMP-022's guard: a trust view carries NO number (no score, no count, no percentage) — every value is words. Returns the offending paths. */
export function scalarTrustFindings(v: unknown, path = '$'): string[] {
  if (typeof v === 'number' || typeof v === 'bigint') return [path];
  if (Array.isArray(v)) return v.flatMap((x, i) => scalarTrustFindings(x, `${path}[${i}]`));
  if (v !== null && typeof v === 'object') return Object.entries(v as Row).flatMap(([k, x]) => (/score|rating|percent|trust_?level/i.test(k) ? [`${path}.${k}`] : []).concat(scalarTrustFindings(x, `${path}.${k}`)));
  return [];
}

/* ───────────────────────── B81's weak_provenance failure state now has its read ───────────────────────── */
/** The failure state a strength calls for (B81 FailureState `weak_provenance`), or null — strong, partial and unknown add none. */
export function strengthFailure(s: StrengthView | null): { kind: 'weak_provenance'; detail: string } | null {
  if (s === null || (s.strength !== 'weak' && s.strength !== 'broken')) return null;
  return { kind: 'weak_provenance', detail: `Provenance ${STRENGTH_WORDS[s.strength].word}: ${s.reasons.map((r) => r.detail).join('; ') || STRENGTH_WORDS[s.strength].sentence}.` };
}

/* ───────────────────────── CMP-029: THE PROVENANCE TRAIL (both directions) ───────────────────────── */
export const FORWARD_BUCKETS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'claims', label: 'Claims whose lineage reads it' }, { key: 'constructed', label: 'Constructed provenance edges' },
  { key: 'options', label: 'Decision options citing it' }, { key: 'briefings', label: 'Briefings sourced on it' },
  { key: 'publications', label: 'Publications sourced on it' }, { key: 'strategy', label: 'Strategy dependencies on it' },
  { key: 'invalidations', label: 'Impact already recorded' },
];
export interface TrailView {
  ref: string; method: string; asOf: string;
  backward: PathRow[]; unreached: number;
  forward: Array<{ key: string; label: string; refs: Array<{ ref: string; note: string }> }>;
  lines: string[];
  /** what the trail cannot say, in words (gaps, truncation, carried boundaries) */ limits: string[];
}
export function provenanceTrailView(view: ExplainView, strength: StrengthView | null): TrailView {
  const p = explainPath(view);
  const fwd = view.forward ?? {};
  const forward = FORWARD_BUCKETS.map((b) => ({
    ...b,
    refs: arr((fwd as Row)[b.key]).map((x) => { const r = (x ?? {}) as Row; return { ref: String(r['ref'] ?? r['invalidation_id'] ?? ''), note: String(r['basis'] ?? r['option'] ?? r['state'] ?? r['rationale'] ?? r['trigger_kind'] ?? '') }; }),
  }));
  const s = strength === null ? STRENGTH_WORDS.unknown : STRENGTH_WORDS[strength.strength];
  const n = view.nodes.length;
  return {
    ref: view.ref, method: view.method, asOf: view.asOf, backward: p.rows, unreached: p.unreached.length, forward,
    lines: [
      `Provenance strength: ${s.glyph} ${s.word} — ${s.sentence}`,
      `Backward: ${n === 1 ? 'one node' : `${n} nodes`} from the product to its evidence and sources (method ${view.method})`,
      `Forward: ${forward.some((b) => b.refs.length > 0) ? forward.filter((b) => b.refs.length > 0).map((b) => b.label.toLowerCase()).join('; ') : 'nothing names this version today'} — a preview, never a recorded walk`,
    ],
    limits: [
      ...view.gaps.map((g) => `${words(g.kind)} at ${g.at}: ${g.reason}`),
      ...(view.truncated ? [`the walk was cut at its bounds (depth ${view.bounds.max_depth}, ${view.bounds.max_nodes} nodes) — nothing beyond them is shown`] : []),
      ...view.carried.map((c) => `${c.what}: ${c.state} — ${c.carrier}`),
    ],
  };
}
export const trailNodeWords = (kind: string, outcome: keyof typeof NODE_OUTCOME_WORDS): string => `${KIND_WORDS[kind] ?? words(kind)} · ${NODE_OUTCOME_WORDS[outcome]?.word ?? outcome}`;

/* ───────────────────────── V00-T-104: THE LAYERED EXPLANATION (B35's contract keys; no new table) ───────────────────────── */
export type LayerAudience = 'executive' | 'analyst' | 'auditor';
export type EntryState = 'present' | 'none' | 'inapplicable' | 'missing';
export interface LayerEntry { key: string; label: string; state: EntryState; text: string; items: Array<{ id: string; statement: string }> }
export interface Layer { audience: LayerAudience; title: string; lead: string; entries: LayerEntry[] }
export const LAYER_KEYS: Readonly<Record<LayerAudience, ReadonlyArray<[string, string]>>> = {
  executive: [['conclusion', 'Conclusion'], ['uncertainty', 'Material uncertainty'], ['decision_use', 'What it may be used for']],
  analyst: [['claim_map', 'Claims'], ['evidence_map', 'Evidence'], ['method', 'Method'], ['model_and_agent_roles', 'Models and agents'], ['assumptions', 'Assumptions'],
    ['alternatives', 'Competing hypotheses'], ['counter_evidence', 'Counter-evidence'], ['sensitivity', 'Sensitivity'], ['counterfactuals', 'What would change it'],
    ['calibration_basis', 'Calibration'], ['limitations', 'Limitations'], ['dissent', 'Dissent']],
  auditor: [['product_and_version', 'Product and version'], ['provenance_ref', 'Provenance'], ['policy_and_authority', 'Policy and authority'], ['information_boundary', 'Information boundary'],
    ['withheld_scope', 'Withheld scope'], ['contest_path', 'Contest path']],
};
const LAYER_TITLES: Readonly<Record<LayerAudience, { title: string; lead: string }>> = {
  executive: { title: 'Executive — the basis', lead: 'The conclusion, the uncertainty that matters and what the product may be used for.' },
  analyst: { title: 'Analyst — the reasoning', lead: 'The claims and evidence, the method, the models and agents, the alternatives and what would change it.' },
  auditor: { title: 'Auditor — the record', lead: 'The exact version, its provenance, the policy and authority it ran under, what is withheld and how to contest it.' },
};
/** One contract value in words: its items (resolved to their statements), the stated absence, or the value. */
export function contractEntry(key: string, label: string, v: unknown, items: ReadonlyArray<{ id: string; statement: string }>): LayerEntry {
  const byId = new Map(items.map((i) => [i.id, i] as const));
  if (v === undefined || v === null) return { key, label, state: 'missing', text: 'MISSING — the contract states nothing for this key', items: [] };
  if (typeof v !== 'object' || Array.isArray(v)) return { key, label, state: 'present', text: typeof v === 'string' ? v : JSON.stringify(v), items: [] };
  const o = v as Row;
  const ids = arr(o['items']).map(String);
  const resolved = ids.map((id) => byId.get(id) ?? { id, statement: 'not in this explanation' });
  for (const k of ['missing', 'none', 'inapplicable'] as const) {
    if (typeof o[k] === 'string') return { key, label, state: k, text: `${k === 'missing' ? 'MISSING' : k === 'none' ? 'None recorded' : 'Not applicable'} — ${String(o[k])}`, items: [] };
  }
  if (ids.length > 0) return { key, label, state: 'present', text: str(o['note']) ?? (o['value'] === undefined ? `${ids.length === 1 ? 'one item' : `${ids.length} items`}` : JSON.stringify(o['value']).slice(0, 400)), items: resolved };
  if ('value' in o) return { key, label, state: 'present', text: typeof o['value'] === 'string' ? (o['value'] as string) : JSON.stringify(o['value']).slice(0, 400), items: [] };
  return { key, label, state: 'present', text: Object.entries(o).map(([k, x]) => `${words(k)}: ${typeof x === 'string' ? x : JSON.stringify(x)}`).join(' · ').slice(0, 400), items: [] };
}
export interface ExplanationLike {
  conclusion: Row; contract: Row; items: ReadonlyArray<{ id: string; statement: string }>;
  uncertainty: { likelihood: Row; impact: Row; confidence: Row; evidence_quality: Row; disagreement: Row };
  faithfulness_state?: string; integrity_digest?: string; subject_digest?: string;
}
const uncertaintyLine = (u: ExplanationLike['uncertainty']): string => {
  const one = (n: string, v: Row) => `${n}: ${words(String(v['kind'] ?? v['level'] ?? v['grade'] ?? 'not stated'))}${typeof v['statement'] === 'string' ? ` (${String(v['statement'])})` : ''}`;
  return [one('likelihood', u.likelihood), one('impact', u.impact), one('confidence', u.confidence), one('evidence quality', u.evidence_quality)].join(' · ');
};
/** The three layers of a B35 explanation, every key of the App. L contract placed in exactly one layer (none dropped, none repeated). */
export function explanationLayers(x: ExplanationLike): Layer[] {
  const c = x.contract ?? {};
  return (['executive', 'analyst', 'auditor'] as const).map((audience) => ({
    audience, ...LAYER_TITLES[audience],
    entries: LAYER_KEYS[audience].map(([key, label]) => {
      if (key === 'conclusion') return { key, label, state: str(x.conclusion?.['statement']) === null ? 'missing' : 'present', text: str(x.conclusion?.['statement']) ?? 'MISSING — no conclusion is stated', items: contractEntry(key, label, c[key], x.items).items } as LayerEntry;
      if (key === 'uncertainty') return { key, label, state: 'present', text: uncertaintyLine(x.uncertainty), items: [] } as LayerEntry;
      return contractEntry(key, label, c[key], x.items);
    }).concat(audience === 'auditor' ? [{ key: 'faithfulness', label: 'Faithfulness and integrity', state: 'present' as EntryState,
      text: `faithfulness ${x.faithfulness_state ?? String(c['faithfulness_state'] ?? 'not stated')}${x.integrity_digest === undefined ? '' : ` · integrity ${x.integrity_digest.slice(0, 16)}…`}${x.subject_digest === undefined ? '' : ` · subject ${x.subject_digest.slice(0, 16)}…`}`, items: [] }] : []),
  }));
}
/** The contract keys no layer places — must be empty (the rest are folded into the auditor's faithfulness line or the audience profile). */
export function unplacedContractKeys(contract: Row): string[] {
  const placed = new Set(Object.values(LAYER_KEYS).flatMap((ks) => ks.map(([k]) => k)));
  return Object.keys(contract).filter((k) => !placed.has(k) && !['audience_profile', 'faithfulness_state', 'expected_effects'].includes(k));
}
/** A recommendation's own fields in three layers (B35 decision.recommendations; no explanation generated yet — said so in the auditor layer). */
export function recommendationLayers(r: Row): Layer[] {
  const list = (v: unknown, none: string): LayerEntry['text'] => { const xs = arr(v).map((x) => (typeof x === 'string' ? x : String(((x ?? {}) as Row)['statement'] ?? JSON.stringify(x)))); return xs.length === 0 ? none : xs.join('; '); };
  const e = (key: string, label: string, text: string, none: boolean): LayerEntry => ({ key, label, state: none ? 'none' : 'present', text, items: [] });
  const agent = r['author_kind'] === 'agent';
  return [
    { audience: 'executive', ...LAYER_TITLES.executive, entries: [
      e('what', 'Recommended', String(r['what'] ?? '—'), false), e('for_whom', 'For whom', String(r['for_whom'] ?? '—'), false), e('by_when', 'By when (the day it names)', String(r['by_when'] ?? '—'), false),
      e('authority', 'What it is', `advisory, not a decision — recorded by ${agent ? 'the Decision Agent (AI)' : 'a named person'}; the decision is the package's own record`, false)] },
    { audience: 'analyst', ...LAYER_TITLES.analyst, entries: [
      e('what_could_make_it_wrong', 'What could make it wrong', list(r['what_could_make_it_wrong'], 'none stated'), arr(r['what_could_make_it_wrong']).length === 0),
      e('missing_evidence', 'Missing evidence', list(r['missing_evidence'], 'none declared'), arr(r['missing_evidence']).length === 0),
      e('assumptions', 'Assumptions', list(r['analytical_assumptions'] ?? r['assumptions'], 'none recorded'), arr(r['analytical_assumptions'] ?? r['assumptions']).length === 0),
      e('model_outputs', 'Model outputs relied on', list(r['model_outputs'], 'none'), arr(r['model_outputs']).length === 0),
      e('value_judgments', 'Value judgements', list(r['value_judgments'], 'none recorded'), arr(r['value_judgments']).length === 0),
      e('policy_constraints', 'Policy constraints', list(r['policy_constraints'], 'none recorded'), arr(r['policy_constraints']).length === 0)] },
    { audience: 'auditor', ...LAYER_TITLES.auditor, entries: [
      e('subject', 'Package, version, option', `DPK ${String(r['package_id'] ?? '—')} v${String(r['version'] ?? '—')} · option ${String(r['option_key'] ?? '—')}`, false),
      e('digest', 'Recorded digest', String(r['digest'] ?? 'not recorded'), r['digest'] === undefined),
      e('author', 'Author', `${agent ? 'agent' : 'person'} ${String(r['author_principal_id'] ?? '—')}`, false),
      e('explanation', 'Generated explanation', 'the governed explanation of a recommendation is read on /decisions/explanations (kind recommendation)', false)] },
  ];
}

/* ───────────────────────── HX-04: ALTERNATIVE EXPLANATIONS ───────────────────────── */
export interface AlternativesView { alternatives: Array<{ id: string; statement: string; review: string }>; counter: Array<{ id: string; statement: string }>; note: string | null }
export function alternativesView(x: { items: ReadonlyArray<{ id: string; statement: string }>; competing_hypotheses: readonly string[]; counter_evidence: readonly string[] },
                                 reviewed: ReadonlyMap<string, string> = new Map()): AlternativesView {
  const pick = (ids: readonly string[]) => x.items.filter((i) => ids.includes(i.id));
  const alternatives = pick(x.competing_hypotheses).map((i) => ({ id: i.id, statement: i.statement, review: reviewed.get(i.id) ?? 'independent review required — no review of this alternative is recorded' }));
  const counter = pick(x.counter_evidence).map((i) => ({ id: i.id, statement: i.statement }));
  return { alternatives, counter, note: alternatives.length === 0 ? 'No competing hypothesis is recorded — independent review is required before relying on a single explanation.' : null };
}

/* ───────────────────────── HX-05: DISSENT ───────────────────────── */
export interface DissentRow { id: string; by: string; position: string; rationale: string; citation: CitationRef | null; recordedAt: string; status: string; disposition: string | null }
/** decision.dissent rows (0041) → the list's rows; a package's dissent stands until the package records its disposition. */
export function dissentOfPackage(rows: readonly Row[], disposition: (id: string) => string | null = () => null): DissentRow[] {
  return rows.map((r) => {
    const c = (r['citation'] ?? null) as Row | null;
    const id = String(r['dissent_id'] ?? r['id'] ?? '');
    const d = disposition(id);
    return {
      id, by: String(r['principal_id'] ?? r['by'] ?? ''), position: String(r['position'] ?? ''), rationale: String(r['rationale'] ?? ''), recordedAt: String(r['recorded_at'] ?? ''),
      citation: c === null ? null : { kind: String(c['kind']) as CitationRef['kind'], id: String(c['id']), version: Number(c['version'] ?? 1), digest: str(c['digest']) },
      status: d === null ? 'recorded — stands with the package' : 'addressed', disposition: d,
    };
  });
}
/** B50's knowledge challenges on an assessment (or any product) as its recorded dissent: the grounds, who, the state, the decision note. */
export function dissentOfChallenges(rows: readonly Row[]): DissentRow[] {
  return rows.map((r) => {
    const st = String(r['state'] ?? 'open');
    const disputed = arr(r['disputed']).map(String);
    return {
      id: String(r['challenge_id'] ?? ''), by: String(r['opened_by'] ?? ''), position: `challenge${disputed.length === 0 ? '' : ` — disputes ${disputed.join(', ')}`}`, rationale: String(r['grounds'] ?? ''),
      citation: null, recordedAt: String(r['opened_at'] ?? ''),
      status: st === 'open' || st === 'under_review' ? `${words(st)} — stands until decided` : words(st),
      disposition: st === 'upheld' || st === 'dismissed' ? `${st.toUpperCase()}${str(r['decision_note']) === null ? '' : `: ${String(r['decision_note'])}`}` : st === 'withdrawn' ? `withdrawn by the challenger${str(r['withdrawal_reason']) === null ? '' : `: ${String(r['withdrawal_reason'])}`}` : null,
    };
  });
}
/** HX-05 / UX-27-005: decision-ready is withheld while recorded dissent is HIDDEN (a filter, a summary that drops it). */
export function dissentGate(a: { recorded: number; shown: number }): string | null {
  if (a.recorded > a.shown) return `${a.recorded - a.shown} recorded dissent${a.recorded - a.shown === 1 ? ' is' : 's are'} hidden by the current view — show every dissent before treating this as decision-ready`;
  return null;
}
/** UX-27-006 summarisation: a summary that names none of the recorded dissent drops it (the finding in words), or null. */
export function summaryDropsDissent(summary: string, dissent: readonly DissentRow[]): string | null {
  if (dissent.length === 0) return null;
  const s = summary.toLowerCase();
  const kept = dissent.filter((d) => s.includes(d.position.toLowerCase()) || /\bdissent/.test(s));
  return kept.length === 0 ? `the summary drops the recorded dissent (${dissent.map((d) => d.position).join('; ')})` : null;
}

/* ───────────────────────── HX-06: METHOD DISCLOSURE ───────────────────────── */
export interface MethodInput {
  method: string | null;
  model: { id: string; weightsDigest: string | null; promptVersion: string | null; runtimeVersion: string | null } | null;
  policyArtifact: string | null; assumptions: readonly string[];
  evaluation: { verdict: string; rule: string; at: string } | null;
}
export interface MethodView { lines: Array<{ term: string; value: string }>; constrained: string | null }
export function methodDisclosureView(m: MethodInput): MethodView {
  const lines = [
    { term: 'Method', value: m.method ?? 'NOT RECORDED' },
    { term: 'Model', value: m.model === null ? 'no model contributed' : `${m.model.id} · weights ${m.model.weightsDigest === null ? 'NOT DIGESTED' : `${m.model.weightsDigest.slice(0, 16)}…`} · prompt ${m.model.promptVersion ?? 'not recorded'} · runtime ${m.model.runtimeVersion ?? 'not recorded'}` },
    { term: 'Policy artifact', value: m.policyArtifact ?? 'none recorded' },
    { term: 'Assumptions', value: m.assumptions.length === 0 ? 'none recorded' : m.assumptions.join('; ') },
    { term: 'Evaluation', value: m.evaluation === null ? 'not evaluated — unvalidated' : `${m.evaluation.verdict} under ${m.evaluation.rule} at ${m.evaluation.at}` },
  ];
  const why = m.method === null ? 'the method is not recorded' : m.model !== null && m.model.weightsDigest === null ? 'the model\'s weights are not digested — the exact model cannot be re-identified' : null;
  return { lines, constrained: why === null ? null : `INDETERMINATE for decision use — ${why}` };
}
/** The method and model nodes an explanation carries (B50's explain: method, model_call nodes), as method inputs (the first of each). */
export function methodOfExplain(view: Pick<ExplainView, 'nodes'>): Pick<MethodInput, 'method'> & { models: string[] } {
  const method = view.nodes.find((n) => n.kind === 'method');
  return { method: method === undefined ? null : method.label, models: view.nodes.filter((n) => n.kind === 'model_call').map((n) => `${n.label} (${NODE_OUTCOME_WORDS[n.outcome]?.word ?? n.outcome})`) };
}

/* ───────────────────────── UX-27-001/005: TRUTH COMPARISON AND THE CONSERVATIVE STATE ───────────────────────── */
export interface TruthRowInput {
  label: string; truth: DisplayTruthState | null; confidence: { text: string; calibrated: boolean } | null; uncertainty: string | null;
  support: { for: number; against: number } | null; alternatives: number; dissent: { recorded: number; shown: number }; permittedUse: string | null;
}
export interface ConservativeState { state: DisplayTruthState | 'indeterminate'; reasons: string[]; decisionReady: boolean }
/** UX-27-005: conflicting labels, uncalibrated confidence, omitted uncertainty, hidden dissent → INDETERMINATE with every reason; decision-ready
 *  only when none applies. Confidence never PROMOTES: a high confidence changes nothing here. */
export function conservativeState(labels: ReadonlyArray<DisplayTruthState | null>, r: Omit<TruthRowInput, 'label' | 'truth'>): ConservativeState {
  const reasons: string[] = [];
  const distinct = [...new Set(labels.filter((l): l is DisplayTruthState => l !== null))];
  if (distinct.length > 1) reasons.push(`the truth labels conflict (${distinct.join(' vs ')})`);
  if (labels.some((l) => l === null)) reasons.push('a truth state is not resolved on this read');
  if (r.confidence !== null && !r.confidence.calibrated) reasons.push('the confidence is not calibrated');
  if (r.uncertainty === null || r.uncertainty.trim() === '') reasons.push('the uncertainty is omitted');
  const hidden = dissentGate(r.dissent);
  if (hidden !== null) reasons.push(hidden);
  const one = distinct.length === 1 ? distinct[0]! : null;
  const state = reasons.length > 0 || one === null ? 'indeterminate' : one;
  return { state, reasons, decisionReady: reasons.length === 0 && state !== 'indeterminate' && state !== 'withdrawn' && state !== 'disputed' };
}
export function truthComparisonRows(rows: readonly TruthRowInput[]): Array<{ label: string; state: string; confidence: string; uncertainty: string; support: string; alternatives: string; dissent: string; permitted: string; reasons: string[] }> {
  return rows.map((r) => {
    const c = conservativeState([r.truth], r);
    return {
      label: r.label, state: c.state.toUpperCase(), confidence: r.confidence === null ? 'not stated' : `${r.confidence.text}${r.confidence.calibrated ? '' : ' (not calibrated)'}`,
      uncertainty: r.uncertainty ?? 'OMITTED', support: r.support === null ? 'not mapped' : `${r.support.for} for · ${r.support.against} against`,
      alternatives: r.alternatives === 0 ? 'none recorded' : `${r.alternatives} recorded`, dissent: r.dissent.recorded === 0 ? 'none recorded' : `${r.dissent.recorded} recorded (${r.dissent.shown} shown)`,
      permitted: c.decisionReady ? (r.permittedUse ?? 'as its fitness allows') : `not decision-ready — ${c.reasons.join('; ')}`, reasons: c.reasons,
    };
  });
}

/* ───────────────────────── UX-27-003: SUPPORT COMPARISON (the act's consequence preview) ───────────────────────── */
export interface SupportSide { label: string; support: number; against: number; drivers: readonly string[]; disagreement: string | null; fitness: string | null }
export function supportComparison(current: SupportSide, proposed: SupportSide, act: string): ConsequenceView {
  const blockers: string[] = [];
  if (proposed.fitness === 'unfit') blockers.push(`${proposed.label} is marked UNFIT — it may not be relied on`);
  if (proposed.against > proposed.support) blockers.push(`${proposed.label} has more evidence against (${proposed.against}) than for (${proposed.support})`);
  return {
    effect: `${act}: rely on ${proposed.label} instead of ${current.label}`,
    affected: [`evidence for: ${current.support} → ${proposed.support}`, `evidence against: ${current.against} → ${proposed.against}`,
      `uncertainty drivers: ${proposed.drivers.length === 0 ? 'none stated' : proposed.drivers.join('; ')}`],
    users: [`disagreement: ${proposed.disagreement ?? 'none recorded'}`, `fitness: ${proposed.fitness ?? 'not evaluated'}`],
    reversibility: 'the act is recorded; a later act may reverse its effect, the record stays', residualRisk: proposed.drivers.length === 0 ? 'not stated' : proposed.drivers.join('; '),
    audit: 'recorded with the acting person, the version and the digest shown', source: 'stated', blockers,
  };
}

/* ───────────────────────── UX-57-003/004: THE COMMANDS (who acts — never what the indicator says) ───────────────────────── */
/** The PDP rules' roles (apps/api/src/policy/pdp.service.ts `B82 px` — the test reads the file and compares). */
export const TRUST_ACT_ROLES: Readonly<Record<'graph.trust.verify' | 'graph.trust.attest' | 'graph.trust.withdraw' | 'graph.trust.investigate', readonly string[]>> = {
  'graph.trust.verify': ['auditor', 'record_authority', 'data_steward', 'knowledge_owner', 'method_steward', 'domain_analyst', 'domain_admin', 'decision_approver', 'privacy_officer'],
  'graph.trust.attest': ['auditor', 'record_authority', 'data_steward', 'knowledge_owner', 'method_steward', 'domain_analyst', 'decision_approver', 'risk_owner'],
  'graph.trust.withdraw': ['auditor', 'record_authority', 'data_steward', 'knowledge_owner', 'method_steward', 'domain_analyst', 'decision_approver', 'risk_owner'],
  'graph.trust.investigate': ['auditor', 'record_authority', 'data_steward', 'knowledge_owner', 'method_steward', 'domain_analyst', 'decision_approver', 'risk_owner',
    'decision_owner', 'decision_authority', 'executive', 'domain_admin', 'forecast_owner', 'strategy_owner'],
};
export interface TrustActor { principalId: string; isHuman: boolean; roles: readonly string[] }
/** May this person verify, attest or investigate? WHO acts only: the human gate, the rule's roles, and for an attestation the producer and the
 *  owner excluded. The envelope's facets, the strength, a confidence or a rank are NOT inputs (UX-27-004 / UX-57-004). */
export function trustCommand(action: keyof typeof TRUST_ACT_ROLES, me: TrustActor, subject: { owner: string | null; producers: readonly string[] } | null): Eligibility {
  if (subject === null) return { can: false, reason: 'the subject is not read yet', role: null, basis: 'not eligible' };
  const owner = subject.owner === null ? null : subject.owner.replace(/^principal:/, '');
  const excluded = action === 'graph.trust.attest' ? [...(owner === null ? [] : [{ principal: owner, why: 'the owner never attests their own product' }]),
    ...subject.producers.map((p) => ({ principal: p.replace(/^principal:/, ''), why: 'a producer never attests what they produced' }))] : [];
  return eligibility({ action, me: me.principalId, isHuman: me.isHuman, roles: me.roles, requiredRoles: TRUST_ACT_ROLES[action], excluded });
}
export const ATTEST_CONSEQUENCE = (subject: string, facets: readonly string[]): ConsequenceView => ({
  effect: `records your statement that you inspected ${facets.length === 0 ? 'no facet yet' : facets.join(', ')} of ${subject}`,
  affected: [subject], users: ['readers of the trust page and of the product see your attestation beside the facets'],
  reversibility: 'you may withdraw it with a reason; it stays on record, marked withdrawn',
  residualRisk: 'an attestation is a statement of inspection — not an approval, not a release; it enables no command',
  audit: 'recorded with your name, the version, the facets and the envelope digest you read', source: 'stated', blockers: facets.length === 0 ? ['name the facets you inspected'] : [],
});
export const INVESTIGATE_CONSEQUENCE = (subject: string, owner: string): ConsequenceView => ({
  effect: `routes an investigation of ${subject} to ${owner} (an attention item of the class trust_investigation)`,
  affected: [subject], users: [owner], reversibility: 'the item is closed by its owner; nothing in the product changes',
  residualRisk: 'none to the product — it is a request to look', audit: 'recorded with your name, the subject version and your note', source: 'stated', blockers: [],
});
export const VERIFY_CONSEQUENCE = (subject: string, facet: string): ConsequenceView => ({
  effect: `the server checks the ${facet} of ${subject} again and records its outcome (verified, failed or unavailable)`,
  affected: [subject], users: ['readers of the trust page'], reversibility: 'a later verification is recorded beside it; none is erased',
  residualRisk: 'an unavailable check is never shown as failed', audit: 'recorded with your name and what was examined', source: 'stated', blockers: [],
});
/** /graph/trust?type=&id=&version= → the subject it names, or why the link cannot open one. */
export function parseTrustLink(type: string | null, id: string | null, version: string | null): { ok: true; type: string; id: string; version: number } | { ok: false; reason: string } | null {
  if (type === null && id === null && version === null) return null;
  if (type === null || !/^[A-Z]{3}$/.test(type)) return { ok: false, reason: 'the type is three capitals (e.g. DPK, CLM, SIM)' };
  if (id === null || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) return { ok: false, reason: 'the id is not a recorded object id' };
  if (version === null || !/^[1-9][0-9]{0,8}$/.test(version)) return { ok: false, reason: 'the version is a whole number of 1 or more' };
  return { ok: true, type, id: id.toLowerCase(), version: Number(version) };
}
export const trustHref = (type: string, id: string, version: number): string => `/graph/trust?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}&version=${version}`;
