/**
 * CP-6 B81 §HA-R (F-P7-E-20, wave 2) — the human-authority RE-POINTS wave 1 left, as pure data and functions over the wave-1 library
 * (lib/authority-b81.ts decides; components/authority.tsx renders; nothing here re-implements either):
 *
 *   HAR_ACT_ROLES        the PDP rules' own roles for the acts these pages now put through a Command Review (the test reads pdp.service.ts
 *                        and compares — first match wins), and READ_ROLES for the two reads the contest path needs (so a page never fires a
 *                        read the PDP would refuse: courtesy, not security — the server decides every read).
 *   statedConsequence    CMP-045 / PAT-17: the catalogue's STATED effect (wave 1's COMMAND_EFFECTS first, then these acts') — said as
 *                        stated, never as computed; no server preview exists for any of these acts.
 *   *Record              PAT-06: an outcome assessment, a recommendation review, an extraction review decision as a ReviewRecord —
 *                        reviewer, version, evidence, findings — "not decision authority".
 *   INTELLIGENCE_REVIEW_AUTHORITY  PAT-06: what the intelligence review decision IS (from its PDP rule): extraction review authority over
 *                        the claim record — never decision authority.
 *   appealsOn / contestHref   HX-14: the B35 appeal cases on ONE subject, and the deep link that opens the appeal form on that subject.
 *   CONTEST_COMPOSED / CONTEST_NOT_COMPOSED   HX-14: the decision-active pages that compose the contest path (the test reads each file),
 *                        and the ones that do not yet, each with its carrier.
 *   TYPED_ACTS           PAT-16: the irreversible acts these pages confirm by a typed phrase (the test reads each file).
 *
 * CONSTRUCTION only. The walk (demonstration; SYNTHETIC personas) and H3 (real acceptance) are other claims.
 */
import { consequenceStated, shortDigest, shortId, type ConsequenceView, type ReviewRecordModel } from './authority-b81';

type Row = Record<string, unknown>;

/* ───────────────────────── the PDP roles of the acts and reads ───────────────────────── */

/** The roles (any of) the PDP rule of each act admits — apps/api/src/policy/pdp.service.ts (the test compares, first match wins). */
export const HAR_ACT_ROLES: Readonly<Record<string, readonly string[]>> = {
  'decision.package.reopen': ['decision_owner'],
  'decision.review.outcome': ['decision_owner', 'decision_authority', 'executive', 'domain_analyst'],
  'decision.recommendation.review': ['decision_owner', 'decision_approver', 'decision_authority', 'executive', 'domain_analyst'],
  'executive.request': ['platform_admin', 'domain_admin', 'executive', 'decision_owner', 'decision_authority', 'strategy_owner'],
  'prediction.warning.close': ['platform_admin', 'domain_admin', 'executive', 'strategy_owner', 'forecast_owner'],
  'simulation.experiment.cancel': ['platform_admin', 'domain_admin', 'twin_owner', 'simulation_operator'],
  'intelligence.review.decide': ['platform_admin', 'domain_admin', 'extraction_manager'],
};
/** The reads the contest path makes: the gate record (B36 challenges) and the appeal cases (B35). */
export const READ_ROLES: Readonly<Record<'decision.read' | 'decision.appeal.read', readonly string[]>> = {
  'decision.read': ['platform_admin', 'tenant_admin', 'auditor', 'domain_admin', 'domain_analyst', 'strategy_owner', 'decision_owner', 'decision_approver', 'decision_authority',
    'executive', 'decision_agent', 'briefing_agent', 'reporting_agent'],
  'decision.appeal.read': ['platform_admin', 'tenant_admin', 'auditor', 'domain_admin', 'domain_analyst', 'strategy_owner', 'forecast_owner', 'twin_owner', 'simulation_operator',
    'decision_owner', 'decision_approver', 'decision_authority', 'executive', 'decision_agent'],
};
export const mayRead = (read: keyof typeof READ_ROLES, roles: readonly string[]): boolean => READ_ROLES[read].some((r) => roles.includes(r));

/* ───────────────────────── CMP-045 / PAT-17: the stated consequences ───────────────────────── */

/** The effect STATED for the acts these pages review (no server preview exists for any of them). Keys are the PDP action, or
 *  `<action>:<variant>` where one action carries distinct acts (HX-12: approve, correct and reject stay distinct). */
export const HAR_EFFECTS: Readonly<Record<string, Omit<ConsequenceView, 'source' | 'blockers'>>> = {
  'decision.package.reopen': { effect: 'reopens the committed decision on the recorded cause you name — the server checks the cause was recorded after the commitment; the scenarios it rests on are asked to re-version', affected: ['this package', 'its committed version', 'the scenarios it cites'], users: ['you (the package owner)', 'the approvers and the authority of the next version', 'the scenario owners'], reversibility: 'not undone — the reopen stays recorded with its cause; the commitment and its record are kept; a new version is decided through the gate again', residualRisk: 'the decision is open again until a new version is committed', audit: 'the reopen with its cause, the reversion requests, the package events and the audit chain' },
  'decision.review.outcome': { effect: 'records the outcome assessment of the committed version in four separate fields — observed result, inferred contribution, counterfactual claim, changed conditions', affected: ['the committed version', 'a new assessment version'], users: ['the decision owner', 'the readers of the decision metrics'], reversibility: 'superseded by a later assessment; this one stays recorded', residualRisk: 'an inferred contribution is a judgment with its stated method and confidence, not an observation', audit: 'the assessment with its digest, the review ledger and the audit chain' },
  'decision.recommendation.review:accept_for_consideration': { effect: 'accepts THIS recommendation (its digest) FOR CONSIDERATION — never a decision; the decision stays at the package\'s gate', affected: ['this recommendation'], users: ['the package owner', 'the approvers and the authority, who see it beside the others'], reversibility: 'the review stays recorded; the recommendation can still be withdrawn or superseded', residualRisk: 'a flag that stands is overridden only with your stated override', audit: 'the review with your rationale, the recommendation events and the audit chain' },
  'decision.recommendation.review:decline': { effect: 'declines THIS recommendation (its digest) with your rationale — it decides nothing about the package', affected: ['this recommendation'], users: ['its author', 'the package owner'], reversibility: 'the review stays recorded; a new recommendation may be recorded instead', residualRisk: 'none added', audit: 'the review with your rationale, the recommendation events and the audit chain' },
  'decision.recommendation.review:request_changes': { effect: 'asks the author to change THIS recommendation (its digest) — it stays proposed', affected: ['this recommendation'], users: ['its author'], reversibility: 'the review stays recorded; the author records a new version', residualRisk: 'none added', audit: 'the review with your rationale, the recommendation events and the audit chain' },
  'executive.request:decision': { effect: 'records a typed DECISION request under your request key and routes it to the decision owner — it decides nothing; the owner\'s own package declaration or review names it and fulfils it', affected: ['a new request (routed)', 'the package it names, if any (checked, not changed)'], users: ['you (the requester)', 'the decision owner'], reversibility: 'withdrawn by you while it is routed; the request and its events stay recorded', residualRisk: 'a package already committed, monitoring or closed is refused (stale_approval); a version other than the current one is refused (stale_version)', audit: 'the request with its digest, ExecutiveActionRequested and the audit chain' },
  'prediction.warning.close': { effect: 'closes the warning on the criterion you name ("no longer relevant" is the warning\'s withdrawal) — it leaves the open warnings', affected: ['this warning', 'the reports folded into it'], users: ['you (its owner)', 'the people it was routed to'], reversibility: 'cannot be undone — a closed warning is not reopened; the warning, its cluster, its context and its feedback stay recorded', residualRisk: 'a recurrence raises a new warning; this one keeps its closure', audit: 'the closure with its criterion and reason, the warning events and the audit chain' },
  'simulation.experiment.cancel': { effect: 'cancels the experiment: no new chunk starts; the paths already completed stay recorded (a partial run, diagnostic only)', affected: ['this experiment', 'the run it produced, if any'], users: ['the twin owner', 'the readers of its run'], reversibility: 'cannot be undone — completed effects are not rolled back; declare a new experiment instead', residualRisk: 'a partial run is diagnostic only — never decision-grade', audit: 'the cancellation with your reason, the experiment ledger and the audit chain' },
  'intelligence.review.decide:approve': { effect: 'admits the extracted claim as extracted — your decision on the case, with your reason', affected: ['this review case', 'the claim version it holds'], users: ['the readers of the claim'], reversibility: 'a later correction admits a new version; this decision stays recorded', residualRisk: 'the claim rests on the method and the evidence as extracted', audit: 'the review decision, the claim events and the audit chain' },
  'intelligence.review.decide:correct': { effect: 'admits a NEW version of the claim with your corrected value — the prior version is unchanged and stays retrievable', affected: ['this review case', 'a new claim version'], users: ['the readers of the claim'], reversibility: 'the prior version is kept; a further correction is another new version', residualRisk: 'a corrected value that contradicts a standing assertion opens a contradiction', audit: 'the review decision, the new claim version and the audit chain' },
  'intelligence.review.decide:reject': { effect: 'rejects the extraction: the case is closed rejected and the output is not admitted as a claim', affected: ['this review case'], users: ['the method\'s steward', 'the readers of the claims'], reversibility: 'the case and the output stay recorded; a new extraction is the way back', residualRisk: 'the information it carried is absent from the claims', audit: 'the review decision and the audit chain' },
};
/** The stated consequence of an act (wave 1's catalogue first, then these), or null. */
export function statedConsequence(key: string): ConsequenceView | null {
  const base = consequenceStated(key);
  if (base !== null) return base;
  const c = HAR_EFFECTS[key];
  return c === undefined ? null : { ...c, source: 'stated', blockers: [] };
}

/* ───────────────────────── PAT-06: the review records ───────────────────────── */

const say = (v: unknown, none: string): string => (v === null || v === undefined || v === '' ? none : String(v));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);

/** An outcome assessment of a committed decision (B35 reopen) as a review record — a review of the decision's outcome, never authority. */
export function assessmentRecord(a: Row): ReviewRecordModel {
  const observed = (a['observed'] ?? {}) as Row; const inferred = (a['inferred'] ?? {}) as Row; const cf = (a['counterfactual'] ?? {}) as Row;
  const basis = (cf['basis'] ?? {}) as Row;
  return {
    reviewer: say(a['assessed_by'], 'unknown'), version: typeof a['version'] === 'number' ? a['version'] : null,
    evidence: `${arr(observed['outcomes']).length} recorded outcome(s); counterfactual basis ${basis['kind'] === 'run' ? `run ${shortId(basis['run_id'])}` : `a stated model`}; assessment digest ${shortDigest(a['digest'])}`,
    findings: `observed: ${say(observed['statement'], 'not stated')} · inferred: ${say(inferred['statement'], 'not stated')} (${say(inferred['method'], 'no method').replace(/_/g, ' ')}, confidence ${say(inferred['confidence'], '—')})`,
    at: typeof a['assessed_at'] === 'string' ? a['assessed_at'] : null,
    act: `assessed the outcome (assessment v${say(a['assessment_version'], '?')})`, authority: 'not decision authority',
  };
}
/** A recommendation's review (B35) as a review record: the verdict is a review of the recommendation, never the decision. */
export function recommendationReviewRecord(v: Row, rec: { version: number; digest: string }): ReviewRecordModel {
  const flags = arr(v['flags_at_review']).length;
  return {
    reviewer: say(v['reviewer_principal_id'], 'unknown'), version: rec.version,
    evidence: `the recommendation as recorded (${shortDigest(rec.digest)}); ${flags} flag(s) standing at the review; compared with ${say(v['compared'], '0')} other recommendation(s)`,
    findings: `${say(v['rationale'], 'no rationale stated')}${v['override'] ? ` · override: ${String(v['override'])}` : ''}`,
    at: typeof v['reviewed_at'] === 'string' ? v['reviewed_at'] : null,
    act: say(v['verdict'], 'reviewed').replace(/_/g, ' '), authority: 'not decision authority',
  };
}

/** PAT-06: what the intelligence review decision IS, from its PDP rule (intelligence.review.decide: extraction_manager, domain_admin,
 *  platform_admin; no agent role, and the database refuses the agent that produced the output). */
export const INTELLIGENCE_REVIEW_AUTHORITY = {
  label: 'extraction review authority',
  rule: 'intelligence.review.decide',
  basis: 'the PDP admits extraction_manager, domain_admin and platform_admin — never an agent; the database also refuses the agent that produced the output',
  scope: 'it decides whether extracted output is admitted, corrected or rejected as a CLAIM (evidence of the record) — it is not decision authority: no decision, approval or commitment follows from it',
} as const;
export const INTELLIGENCE_DECISIONS = ['approve', 'correct', 'reject'] as const;
export type IntelligenceDecision = (typeof INTELLIGENCE_DECISIONS)[number];
export const INTELLIGENCE_LABEL: Readonly<Record<IntelligenceDecision, string>> = { approve: 'Approve as extracted', correct: 'Correct — admits a new version', reject: 'Reject the extraction' };
/** A decided review case (the server's answer: its state and new version; the reviewer is the acting principal the receipt binds). */
export function extractionReviewRecord(c: { case_id: string; claim_version: number | null; queued_reason: string }, answer: { state: string; newVersion: number | null }, reviewer: string, reason: string, caseDigest: string | null): ReviewRecordModel {
  return {
    reviewer, version: answer.newVersion ?? c.claim_version,
    evidence: `review case ${shortId(c.case_id)} as stored (${caseDigest === null ? 'no digest shown' : shortDigest(caseDigest)}), queued because ${c.queued_reason.replace(/_/g, ' ')}`,
    findings: reason, at: null, act: `${answer.state}${answer.newVersion === null ? '' : ` — the claim is now version ${answer.newVersion}`}`, authority: 'not decision authority',
  };
}

/* ───────────────────────── HX-14: the contest path on a subject ───────────────────────── */

/** The B35 appeal cases on ONE subject (the list is per kind; the subject is matched by id, nothing inferred). */
export function appealsOn<T extends { subject_kind: string; subject_id: string }>(cases: readonly T[], kind: string, id: string): T[] {
  return cases.filter((c) => c.subject_kind === kind && c.subject_id === id);
}
/** The deep link that opens the explanations page on the subject (its contest and appeal form) — B35's own route. */
export function contestHref(explanationKind: string, id: string, version: number | null = null): string {
  return `/decisions/explanations?kind=${encodeURIComponent(explanationKind)}&id=${encodeURIComponent(id)}${version === null ? '' : `&version=${version}`}`;
}

/** HX-14: the decision-active pages that compose the contest path (the file is read by the test for ContestPath / SubjectContest). */
export const CONTEST_COMPOSED: ReadonlyArray<{ page: string; type: string; file: string }> = [
  { page: '/decisions', type: 'DPK', file: 'app/decisions/gate-completion.tsx' },
  { page: '/decisions/board', type: 'DPK', file: 'app/decisions/board/page.tsx' },
  { page: '/decisions/packages/[id]', type: 'DPK', file: 'app/decisions/packages/[id]/page.tsx' },
  { page: '/decisions/review', type: 'DPK', file: 'app/decisions/review/page.tsx' },
  { page: '/decisions/recommendations', type: 'recommendation', file: 'app/decisions/recommendations/page.tsx' },
  { page: '/prediction/forecasts/[forecastId]', type: 'forecast', file: 'app/prediction/forecasts/[forecastId]/page.tsx' },
];
/** The decision-active pages that do NOT compose it yet, each with its carrier (never claimed). */
export const CONTEST_NOT_COMPOSED: ReadonlyArray<{ page: string; type: string; carrier: string }> = [
  { page: '/decisions/explanations', type: 'explanation', carrier: 'none needed — the explanations page IS the contest surface: every case on the subject and the appeal form, B35\'s own' },
  { page: '/observation/sources/[sourceId]', type: 'source', carrier: 'the hosted phase1-observation walk reads that page by bare substrings (getByText(\'draft\')); the integrator composes it with that selector scoped — the appeal on a source opens from /decisions/explanations today' },
  { page: '/intelligence/claims', type: 'claim', carrier: 'a claim is contested by B9\'s challenge (intelligence.review.request → a review case on /intelligence/review), already on the claims and contradictions pages; the B35 appeal on a claim opens from /decisions/explanations' },
];

/** PAT-16: the irreversible acts these pages confirm by a typed phrase (the test reads each file for the Command Review of the action). */
export const TYPED_ACTS: ReadonlyArray<{ action: string; file: string; phrase: 'digest' | 'name' }> = [
  { action: 'prediction.warning.close', file: 'app/prediction/warnings/lifecycle-panel.tsx', phrase: 'digest' },
  { action: 'simulation.experiment.cancel', file: 'app/twins/simulations/orchestration/page.tsx', phrase: 'digest' },
];
