/**
 * CP-6 B40 §RG — the PURE model of the source registry pages (F-P1-01): the request rules the ports enforce, mirrored so a form says what is
 * missing before it asks the server (the server still decides — a refusal is shown in the server's words); the revocation impact in rows
 * with their owners; the change preview in words for the Command Review (the server's preview — never predicted here); the version binding
 * a rights change carries (server-enforced: the port refuses a stale contract version); the client-side payload binding of the other acts
 * (the review digest of the exact body — a body changed after the review holds the act). No evidence content is ever modelled here (D9).
 */
type Row = Record<string, unknown>;

export const RIGHTS_OPERATIONS = ['withdraw', 'restore', 'narrow'] as const;
export type RightsOperation = (typeof RIGHTS_OPERATIONS)[number];
export const RECOMMENDATIONS = ['approve', 'revise', 'reject'] as const;
export const TEST_OUTCOMES = ['pass', 'fail', 'not_run'] as const;
export const INCIDENT_KINDS = ['outage', 'rights', 'quality', 'access', 'manipulation', 'other'] as const;
export const STEWARDSHIP_STATES = ['assigned', 'under_review', 'lapsed'] as const;

const len = (v: unknown): number => (typeof v === 'string' ? v.trim().length : 0);
const between = (v: unknown, min: number, max: number): boolean => len(v) >= min && len(v) <= max;
/** A list typed one per line (or comma-separated), trimmed, empties dropped, each named once. */
export function listOf(text: string): string[] {
  const seen = new Set<string>(); const out: string[] = [];
  for (const part of text.split(/[\n,]/)) { const t = part.trim(); if (t !== '' && !seen.has(t.toLowerCase())) { seen.add(t.toLowerCase()); out.push(t); } }
  return out;
}

/* ───────────────────────── the request rules (mirrors of the ports' own) ───────────────────────── */

export interface CandidateForm { name: string; publisher: string; howFound: string; termsUrl: string; purposes: string; assessment: string }
export function candidateProblems(f: CandidateForm): string[] {
  const p: string[] = [];
  if (!between(f.name, 2, 256)) p.push('Name the source (2 to 256 characters).');
  if (!between(f.publisher, 2, 256)) p.push('Name the publisher (2 to 256 characters).');
  if (!between(f.howFound, 8, 2000)) p.push('Say how the source was found (8 to 2000 characters).');
  if (f.termsUrl.trim() !== '' && !/^https:\/\/\S{3,}$/.test(f.termsUrl.trim())) p.push('The terms are an https address, or leave it empty when none is published yet.');
  if (listOf(f.purposes).length === 0) p.push('Propose at least one purpose (one per line).');
  if (!between(f.assessment, 8, 4000)) p.push('State your assessment of the source (8 to 4000 characters).');
  return p;
}
export function candidatePayload(f: CandidateForm): Row {
  return { name: f.name.trim(), publisher: f.publisher.trim(), howFound: f.howFound.trim(), termsUrl: f.termsUrl.trim() === '' ? null : f.termsUrl.trim(), purposes: listOf(f.purposes), assessment: f.assessment.trim() };
}

export interface EvaluationForm { authority: string; rightsEvidence: string; coverageFit: string; cost: string; risks: string; tests: Array<{ name: string; outcome: string; note: string }>; recommendation: string; reason: string }
export function evaluationProblems(f: EvaluationForm): string[] {
  const p: string[] = [];
  if (!between(f.authority, 8, 2000)) p.push('Assess the publisher\'s authority (8 to 2000 characters).');
  if (!between(f.rightsEvidence, 8, 2000)) p.push('State the rights and purpose evidence (8 to 2000 characters).');
  if (!between(f.coverageFit, 8, 2000)) p.push('State the coverage fit against the declared universe (8 to 2000 characters).');
  if (!between(f.cost, 2, 1000)) p.push('State the cost (2 to 1000 characters).');
  const tests = f.tests.filter((t) => t.name.trim() !== '');
  if (tests.some((t) => !(TEST_OUTCOMES as readonly string[]).includes(t.outcome))) p.push('Each contract test is pass, fail or not run.');
  if (!(RECOMMENDATIONS as readonly string[]).includes(f.recommendation)) p.push('Recommend approve, revise or reject.');
  if (f.recommendation === 'approve' && tests.some((t) => t.outcome === 'fail')) p.push('An evaluation recommending approval records no failed contract test — recommend revise, or fix the contract.');
  if (!between(f.reason, 8, 2000)) p.push('State the reason for the recommendation (8 to 2000 characters).');
  return p;
}
export function evaluationPayload(f: EvaluationForm, contractVersion: number): Row {
  return { contractVersion, authority: f.authority.trim(), rightsEvidence: f.rightsEvidence.trim(), coverageFit: f.coverageFit.trim(), cost: f.cost.trim(), risks: listOf(f.risks),
    contractTests: f.tests.filter((t) => t.name.trim() !== '').map((t) => ({ name: t.name.trim(), outcome: t.outcome, note: t.note.trim() === '' ? null : t.note.trim() })),
    recommendation: f.recommendation, reason: f.reason.trim() };
}

export interface RightsForm { operation: RightsOperation; reason: string; evidence: string; deletionObligation: string; purposes: string }
/** The rights change's own rules: a reason always; evidence for a withdrawal and a restoration; a strict, non-empty subset for a narrowing. */
export function rightsProblems(f: RightsForm, current: { purposes: string[]; withdrawn: boolean }): string[] {
  const p: string[] = [];
  if (!between(f.reason, 8, 2000)) p.push('State the reason (8 to 2000 characters) — it is recorded with your name.');
  if ((f.operation === 'withdraw' || f.operation === 'restore') && !between(f.evidence, 8, 4000)) {
    p.push(f.operation === 'withdraw' ? 'Cite the evidence of the withdrawal — the publisher\'s notice, the ended agreement (8 to 4000 characters).'
      : 'Cite the evidence of the restoration — the renewed licence, the publisher\'s confirmation (8 to 4000 characters).');
  }
  if (f.operation === 'withdraw' && current.withdrawn) p.push('The rights already stand withdrawn; a restoration lifts the withdrawal.');
  if (f.operation === 'restore' && !current.withdrawn) p.push('The rights stand no withdrawal; there is nothing to restore.');
  if (f.operation === 'withdraw' && f.deletionObligation.trim() !== '' && !between(f.deletionObligation, 8, 1000)) p.push('A deletion obligation says what must be deleted and by when (8 to 1000 characters), or leave it empty for none.');
  if (f.operation === 'narrow') {
    const kept = listOf(f.purposes);
    if (kept.length === 0) p.push('Keep at least one purpose.');
    else if (kept.some((x) => !current.purposes.includes(x)) || kept.length >= current.purposes.length) p.push(`Narrowing keeps a strict subset of the purposes in force (${current.purposes.join(', ')}); a wider purpose is a new contract version.`);
  }
  return p;
}
export function rightsPayload(f: RightsForm, contractVersion: number): Row {
  return { contractVersion, operation: f.operation, reason: f.reason.trim(), evidence: f.evidence.trim() === '' ? null : f.evidence.trim(),
    deletionObligation: f.operation === 'withdraw' && f.deletionObligation.trim() !== '' ? f.deletionObligation.trim() : null,
    purposes: f.operation === 'narrow' ? listOf(f.purposes) : null };
}

/* ───────────────────────── the binding a review carries ───────────────────────── */

/** A rights change binds the contract version it read — SERVER-ENFORCED (the port refuses a stale version); the binding shown in the review. */
export function versionBinding(latest: number | null | undefined): string | null {
  return typeof latest === 'number' && Number.isInteger(latest) && latest >= 1 ? `contract-v${latest}` : null;
}

/* ───────────────────────── the impact, in rows with their owners ───────────────────────── */

export interface ImpactRow { group: 'product' | 'claim' | 'option' | 'briefing' | 'publication' | 'dependency' | 'constructed'; kind: string; ref: string; title: string; owner: string; via: string }
const KIND_LABEL: Readonly<Record<string, string>> = { forecast: 'Forecast', warning: 'Warning', scenario: 'Scenario', run: 'Simulation run', assumption: 'Assumption', package: 'Decision package', claim: 'Claim' };
export const kindLabel = (k: string): string => KIND_LABEL[k] ?? k.replace(/_/g, ' ');
/** A principal as the read names it: the display name, or a short id; nobody named → "no named owner (routed to the class's roles)". */
export function ownerName(who: unknown): string {
  if (who === null || who === undefined || typeof who !== 'object') return 'no named owner (routed to the class\'s roles)';
  const w = who as Row;
  if (typeof w['name'] === 'string' && w['name'] !== '') return String(w['name']);
  return typeof w['id'] === 'string' ? `${String(w['id']).slice(0, 8)}…` : 'no named owner (routed to the class\'s roles)';
}
const rowsOf = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
export function impactRows(impact: Row | null | undefined): ImpactRow[] {
  if (impact === null || impact === undefined) return [];
  const out: ImpactRow[] = [];
  for (const p of rowsOf(impact['products'])) out.push({ group: 'product', kind: kindLabel(String(p['kind'])), ref: String(p['id']), title: String(p['title'] ?? p['id']), owner: ownerName(p['owner']), via: String(p['via'] ?? '') });
  for (const c of rowsOf(impact['claims'])) out.push({ group: 'claim', kind: 'Claim', ref: String(c['ref'] ?? c['id']), title: String(c['ref'] ?? c['id']), owner: ownerName(c['owner']), via: `rests on evidence ${String(c['evidence_id'] ?? '').slice(0, 8)}…` });
  const f = (impact['forward'] ?? {}) as Row;
  for (const o of rowsOf((f['options'] as Row | undefined)?.['items'])) out.push({ group: 'option', kind: 'Package option', ref: String(o['ref']), title: `${String(o['title'] ?? o['ref'])} — option ${String(o['option'])}`, owner: ownerName(o['owner']), via: 'the option cites the evidence' });
  for (const b of rowsOf((f['briefings'] as Row | undefined)?.['items'])) out.push({ group: 'briefing', kind: 'Briefing', ref: String(b['ref']), title: String(b['ref']), owner: ownerName(null), via: 'sourced on the evidence' });
  for (const b of rowsOf((f['publications'] as Row | undefined)?.['items'])) out.push({ group: 'publication', kind: 'Publication', ref: String(b['ref']), title: `${String(b['ref'])} (${String(b['state'] ?? '')})`, owner: ownerName(null), via: 'sourced on the evidence' });
  for (const d of rowsOf((f['strategy'] as Row | undefined)?.['items'])) out.push({ group: 'dependency', kind: 'Strategy dependency', ref: String(d['ref']), title: String(d['ref']), owner: ownerName(null), via: String(d['rationale'] ?? '') });
  for (const e of rowsOf((f['constructed'] as Row | undefined)?.['items'])) out.push({ group: 'constructed', kind: 'Constructed lineage', ref: String(e['ref']), title: String(e['ref']), owner: ownerName(null), via: String(e['basis'] ?? '') });
  return out;
}
/** The counts in one sentence (the server's statement first; the products and claims beyond the bound are counted, never dropped). */
export function impactSummary(impact: Row | null | undefined): string {
  if (impact === null || impact === undefined) return 'The impact has not been read.';
  const ev = (impact['evidence'] ?? {}) as Row;
  const shown = rowsOf(impact['products']).length + rowsOf(impact['claims']).length;
  const total = Number(impact['products_count'] ?? 0) + Number(impact['claims_count'] ?? 0);
  return `${String(impact['statement'] ?? '')}. Evidence held: ${String(ev['objects'] ?? 0)} object(s), ${String(ev['versions'] ?? 0)} version(s).${total > shown ? ` ${shown} of ${total} products and claims are listed; the rest are counted.` : ''}`;
}

/* ───────────────────────── the server's change preview, in words ───────────────────────── */

export interface ConsequenceWords { effect: string; affected: string[]; users: string[]; reversibility: string; residualRisk: string; audit: string; source: 'server' | 'stated'; blockers: string[] }
/** The preview (observation.source_change_impact) in the Command Review's words — computed and recorded by the server, never predicted here. */
export function rightsConsequence(preview: Row | null | undefined, op: RightsOperation): ConsequenceWords | null {
  if (preview === null || preview === undefined) return null;
  const impact = (preview['impact'] ?? {}) as Row;
  const versions = rowsOf(preview['versions']).map((v) => `v${String(v['contract_version'])} ${String(v['rights_state'])}/${String(v['lifecycle'])} → ${String((v['after'] as Row | undefined)?.['rights_state'] ?? '')}/${String((v['after'] as Row | undefined)?.['lifecycle'] ?? '')}`);
  const owners = rowsOf(impact['owners']).map((o) => ownerName(o));
  const resting = Number(impact['resting'] ?? 0);
  const effect = op === 'withdraw'
    ? 'withdraws the source\'s rights on every contract version: collection stops and its schedule is removed, every resting product is marked (cause rights) and its owner routed an item, and the decision-active use of its evidence is refused until the rights are restored — reading stays as it was'
    : op === 'restore'
      ? 'restores the rights each version had before the withdrawal; the version the withdrawal suspended resumes when nothing moved on it since; a rights-terms record withdrawn separately stays withdrawn'
      : 'narrows the purposes of the latest contract version: collection under a dropped purpose is refused from the next revalidation';
  return {
    effect, affected: versions.length > 0 ? versions : ['no contract version'], users: owners.length > 0 ? owners : ['nobody named — nothing rests on it yet'],
    reversibility: op === 'withdraw' ? 'reversed only by a restoration with its evidence (history kept — nothing is rewritten)' : op === 'restore' ? 'withdrawn again by a new withdrawal (history kept)' : 'a wider purpose needs a new contract version (history kept)',
    residualRisk: resting === 0 ? 'nothing rests on the source\'s evidence yet' : `${resting} product(s), claim(s) and reference(s) rest on the source's evidence`,
    audit: 'the rights change ledger, contract.rights_changed on each version, the audit chain',
    source: 'server', blockers: preview['possible'] === false ? [String(preview['statement'] ?? 'the change is not possible now')] : [],
  };
}

/* ───────────────────────── the registry record, in words ───────────────────────── */

export function registryNote(v: Row): string {
  if (v['v4'] === true) return 'SRC@v4: approved only on its latest evaluation recommending approval';
  return 'SRC@v1–v3: its recorded path (registrar ≠ approver); evaluation, customer approval and economics not recorded before B40';
}
export function economicsLine(e: Row | null | undefined): string {
  if (e === null || e === undefined || e['declared'] !== true) return String(e?.['statement'] ?? 'No economics declared (not recorded before B40).');
  return `${String(e['runs'])} run(s) this ${String(e['period'])} × ${String(e['cost_per_run'])} ${String(e['currency'])} = ${String(e['cost'])} ${String(e['currency'])} of a ${String(e['budget_per_period'])} ${String(e['currency'])} budget${e['over_budget'] === true ? ' — OVER BUDGET' : ''} (owner ${String(e['owner'])}).`;
}
export function markerCauseLabel(cause: unknown): string {
  return cause === 'rights' ? 'rights withdrawn' : 'source health';
}
/** The one sentence a reader needs about decision-active use (from the impact read's `use`), never inferred from a badge. */
export function useStatement(impact: Row | null | undefined): string {
  return String(impact?.['use'] ?? 'The decision-active use of this source\'s evidence has not been read.');
}

/* ───────────────────────── eligibility from the person's own bindings (the server still decides) ───────────────────────── */

export interface Binding { roleCode: string; scope: string; tenantId: string | null; domainId: string | null }
export interface EligibilityWords { can: boolean; reason: string | null; role: string | null; basis: string }
/** Whether the signed-in person holds one of the act's roles at the scope the PDP rule names — a hint for the controls; the pipeline decides. */
export function roleEligibility(bindings: readonly Binding[], roles: readonly string[], where: { domainId: string | null; tenantScope?: boolean }, act: string): EligibilityWords {
  const hit = bindings.find((b) => roles.includes(b.roleCode) && (where.tenantScope === true ? b.scope === 'TENANT' : (b.scope === 'DOMAIN' && b.domainId === where.domainId) || b.scope === 'TENANT'));
  if (hit === undefined) return { can: false, reason: `${act} is the act of a ${roles.join(' or ')}${where.tenantScope === true ? ' (a tenant binding)' : ' in this domain'} — you hold none; the server would refuse it`, role: null, basis: '' };
  return { can: true, reason: null, role: hit.roleCode, basis: `you hold ${hit.roleCode}${hit.scope === 'TENANT' ? ' for the tenant' : ' in this domain'}` };
}

/** The effect STATED for a registry act no server preview exists for (said as stated, never as computed). */
export const REGISTRY_EFFECTS: Readonly<Record<string, Omit<ConsequenceWords, 'source' | 'blockers'>>> = {
  'observation.source.discover': { effect: 'records a proposed source — it registers and collects nothing; a promotion registers a draft contract from it', affected: ['a new source candidate'], users: ['the collection managers who evaluate it'], reversibility: 'declined by you or a collection manager; the record stays', residualRisk: 'none until a contract is registered, evaluated and approved', audit: 'candidate.proposed and the audit chain' },
  'observation.source.register': { effect: 'registers the completed draft as an SRC@v4 contract in DRAFT and promotes the candidate — it collects nothing until evaluated and approved by a collection manager who is not you', affected: ['a new source contract (draft)', 'the candidate'], users: ['a collection manager who is not you'], reversibility: 'the draft is rejected or superseded; the record stays', residualRisk: 'none until approved', audit: 'the contract, candidate.promoted and the audit chain' },
  'observation.source.evaluate': { effect: 'records your evaluation of this version — the approval of an SRC@v4 contract reads the latest one; it approves nothing', affected: ['this contract version'], users: ['the approving collection manager'], reversibility: 'a later evaluation supersedes it; the record stays', residualRisk: 'none from the evaluation', audit: 'contract.evaluated and the audit chain' },
  'observation.source.customer_approve': { effect: 'records the customer\'s approval (or decline) of this source\'s use for the tenant — a record the admission cites, not a gate', affected: ['this contract version'], users: ['the tenant\'s users of the source'], reversibility: 'a later decision is recorded beside it; the record stays', residualRisk: 'none added; real acceptance is recorded elsewhere (B111)', audit: 'contract.customer_approved and the audit chain' },
  'observation.source.stewardship': { effect: 'records who stewards the source, in what state, and when it is next reviewed', affected: ['the source'], users: ['the named steward'], reversibility: 'a later version supersedes it; the record stays', residualRisk: 'none', audit: 'contract.stewardship_changed and the audit chain' },
  'observation.source.incident': { effect: 'opens (or resolves) an incident on the source, owned by a collection manager', affected: ['the source'], users: ['the owning collection manager'], reversibility: 'an open incident is resolved by its owner or another collection manager; the record stays', residualRisk: 'none', audit: 'incident.opened / incident.resolved and the audit chain' },
};
export function registryEffect(action: string): ConsequenceWords | null {
  const c = REGISTRY_EFFECTS[action];
  return c === undefined ? null : { ...c, source: 'stated' as const, blockers: [] };
}
