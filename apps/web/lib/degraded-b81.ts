/**
 * B81 §DG (0119_b81_x_dg; F-P7-E-19: V00-T-106, CMP-071, CMP-072, PAT-20, PAT-22, PAT-29, PAT-30, PAT-32, HX-16, UX-ADR-018, REL-11, REL-12,
 * REL-18, CNT-12) — THE DEGRADED-STATE, FAILURE AND RECOVERY CONTRACT as pure functions. components/recovery.tsx renders what these decide.
 *
 *   THE DEPENDENCY REGISTRY   every kind of dependency, the scope its contract is declared at, the read that evaluates it — or the statement
 *                             that no read does (model, network: `unknown`, never healthy by default).
 *   THE CONTRACT EVALUATION   the server's state (shell.degraded_state — the live signals evaluated in the database by its clock) read into
 *                             words: a contract ACTIVE, AWAITING ITS EXIT (the signal recovered, the owner has not verified it — the contract
 *                             stays in force: persistent until verified recovery), NORMAL, NOT EVALUATED; an UNDECLARED degraded dependency
 *                             is shown with its limitations, owner and exit said to be unknown. An action a contract in force lists as
 *                             unavailable is DISABLED with the contract's reason (PAT-30) — nothing here enables what the server refuses.
 *   STALE, PARTIAL, RESIDUAL  a stale declaration (source revision, watermark, age, refresh path — never current styling, PAT-32); a partial
 *                             result (missing sources, intervals, filters, bounds, withdrawn partitions, impact — never complete styling,
 *                             PAT-29); a cancelled run's residual state (the paths done, the outputs digest — "not rolled back", PAT-22).
 *   FAILURE WORDS             the failure states of V00-T-106 per audience, each naming the read that evaluates it or saying none does.
 *   TIMEOUT, DUPLICATE, RETRY (REL-18, PAT-20) over B80's command lifecycle (feedback-b80.ts): a second submit while pending is refused; a
 *                             timeout is "outcome unknown — check before retrying"; a retry REUSES the command identity where the route takes
 *                             one (the server answers the recorded row), otherwise it is a NEW explicit act after the first attempt's outcome
 *                             is read. The universal idempotency store is F-R0-02 at B100 (the named residue).
 *
 * THREE CLAIMS: construction (this file and degraded-b81.test.ts — every value SYNTHETIC); demonstrated operation (the act on eye_demo);
 * real acceptance (UX-19-006 → the shared recording path at B111, then H3) — never claimed.
 */
import { call, type ApiResult } from './api';
import type { Audience, DegradedContract, DependencyKey, DependencyKind } from './b81-seams';
import { retryAdvice, start, timeout, type CommandState } from './feedback-b80';
import type { ProjectionBlock } from './graph';
import type { Scope } from './observation';
import { t } from './i18n';

type Row = Record<string, unknown>;

/* ───────────────────────── 1 · the dependency registry (REL-12) ───────────────────────── */

export interface DependencySpec {
  kind: DependencyKind; scope: 'PLATFORM' | 'DOMAIN'; label: string; keyHint: string;
  /** the read that evaluates it — null: no read exists here (the state is unknown and says so) */ read: string | null;
  /** who declares its contract */ declaredBy: string;
  /** what returns it to service */ refreshPath: string;
  /** the stage that brings a read, when none exists here */ carrier: string | null;
}
export const DEPENDENCY_REGISTRY: Readonly<Record<DependencyKind, DependencySpec>> = {
  audit: { kind: 'audit', scope: 'PLATFORM', label: 'Audit journal', keyHint: 'journal', read: 'the audit journal (/readyz) and the availability incident ledger',
    declaredBy: 'the operations authority', refreshPath: 'every availability incident reconciled by the platform', carrier: null },
  partition: { kind: 'partition', scope: 'DOMAIN', label: 'Index partition', keyHint: 'a projection (edges_current …)', read: 'the B20 projection partitions',
    declaredBy: 'the operations authority or the domain administrator', refreshPath: 'the operator\'s rebuild — the only way back to service', carrier: null },
  source: { kind: 'source', scope: 'DOMAIN', label: 'Source', keyHint: 'the source key', read: 'the source contract, its health and its freshness by the clock',
    declaredBy: 'the operations authority or the domain administrator', refreshPath: 'a new arrival under the source contract', carrier: null },
  method: { kind: 'method', scope: 'DOMAIN', label: 'Simulation method', keyHint: 'the method ref (discrete-event@1 …)', read: 'the B29 method quarantine',
    declaredBy: 'the operations authority or the domain administrator', refreshPath: 'a passing probe and the method steward\'s reinstatement', carrier: null },
  agent: { kind: 'agent', scope: 'DOMAIN', label: 'Agent', keyHint: 'the agent id', read: 'the agent\'s registration, its latest run and its sessions',
    declaredBy: 'the operations authority or the domain administrator', refreshPath: 'a run that finishes, or a new registration', carrier: null },
  model: { kind: 'model', scope: 'PLATFORM', label: 'Model', keyHint: 'the model name', read: null,
    declaredBy: 'the operations authority', refreshPath: 'not evaluated here', carrier: 'B72/B73 (the model registry)' },
  network: { kind: 'network', scope: 'PLATFORM', label: 'Outbound channel', keyHint: 'the channel name', read: null,
    declaredBy: 'the operations authority', refreshPath: 'not evaluated here', carrier: 'each delivery\'s own receipt (B13/B14)' },
};
export const dependencyLabel = (d: DependencyKey): string => `${DEPENDENCY_REGISTRY[d.kind]?.label ?? d.kind} ${d.key}`;

/* ───────────────────────── 2 · the server's shapes (shell.degraded_state) ───────────────────────── */

export type SignalState = 'degraded' | 'healthy' | 'unknown';
export interface Signal { state: SignalState; reason: string; since: string | null; last_degraded_at: string | null; basis: string; details: Row }
export type ContractMode = 'active' | 'awaiting_exit' | 'normal' | 'unknown';
export interface FunctionEntry { action: string; label: string }
export interface PersonRef { principal_id: string; name: string | null }
export interface ContractState {
  contract_id: string; version: number; scope: 'PLATFORM' | 'DOMAIN'; dependency: DependencyKey;
  available: FunctionEntry[]; unavailable: FunctionEntry[]; limitations: string[]; max_duration_seconds: number;
  owner: PersonRef; exit_evidence: string; reason: string; declared_by: PersonRef; declared_at: string; first_declared_at: string;
  signal: Signal; mode: ContractMode; in_force: boolean; elapsed_seconds: number | null; overdue: boolean;
  last_exit: { exit_id: string; contract_version: number; evidence: string; evidence_refs: string[]; recorded_by: PersonRef; recorded_at: string; degraded_at: string | null } | null;
}
export interface UndeclaredState { dependency: DependencyKey; scope: 'PLATFORM' | 'DOMAIN'; signal: Signal }
export interface DegradedState {
  read_at: string; tenant_id: string | null; domain_id: string | null; contracts: ContractState[]; undeclared: UndeclaredState[];
  unavailable_functions: Array<FunctionEntry & { dependency: DependencyKey; contract_id: string; mode: ContractMode }>;
  degraded: boolean; unknown: number;
}
/** The seam's contract (b81-seams.ts) of one evaluated contract. */
export function toSeamContract(c: ContractState): DegradedContract {
  return { dependency: c.dependency, available: c.available.map((f) => f.label), unavailable: c.unavailable.map((f) => f.label), limitations: c.limitations,
    maxDuration: formatDuration(c.max_duration_seconds), owner: c.owner.name ?? c.owner.principal_id, exitEvidence: c.exit_evidence, version: c.version };
}

/* ───────────────────────── 3 · the contract evaluation (HX-16, PAT-30, UX-ADR-018) ───────────────────────── */

export function formatDuration(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return 'not known';
  const d = Math.floor(seconds / 86_400); const h = Math.floor((seconds % 86_400) / 3_600); const m = Math.floor((seconds % 3_600) / 60);
  if (d > 0) return h > 0 ? `${d} d ${h} h` : `${d} d`;
  if (h > 0) return m > 0 ? `${h} h ${m} min` : `${h} h`;
  return m > 0 ? `${m} min` : `${Math.floor(seconds)} s`;
}

/** An action named by a contract: exact, or a prefix written `x.y.*` (every action under it). */
export function actionMatches(pattern: string, action: string): boolean {
  if (pattern.endsWith('.*')) return action.startsWith(pattern.slice(0, -1));
  return pattern === action;
}

/** Is a governed action unavailable under the contracts in force? With the contract's own words (PAT-30: disabled with the reason). */
export function unavailableBecause(s: DegradedState | null, action: string): { unavailable: boolean; reason: string | null; dependency: DependencyKey | null } {
  if (s === null) return { unavailable: false, reason: null, dependency: null };
  const hit = s.unavailable_functions.find((f) => actionMatches(f.action, action));
  if (hit === undefined) return { unavailable: false, reason: null, dependency: null };
  const c = s.contracts.find((x) => x.contract_id === hit.contract_id);
  const why = hit.mode === 'awaiting_exit'
    ? `${dependencyLabel(hit.dependency)} reads recovered, but its owner${c?.owner.name ? ` (${c.owner.name})` : ''} has not verified the recovery yet`
    : `${dependencyLabel(hit.dependency)} is degraded`;
  return { unavailable: true, reason: `${hit.label} is unavailable: ${why} (degraded contract v${c?.version ?? '?'}).`, dependency: hit.dependency };
}

/** An action's control state: the page's own eligibility first, then the degraded contracts. A disabled control always carries its reason. */
export function gateAction(s: DegradedState | null, action: string, own: { can: boolean; reason: string | null }): { disabled: boolean; reason: string | null } {
  if (!own.can) return { disabled: true, reason: own.reason ?? 'You cannot take this action here.' };
  const u = unavailableBecause(s, action);
  return u.unavailable ? { disabled: true, reason: u.reason } : { disabled: false, reason: null };
}

export type Tone = 'critical' | 'warning' | 'unknown' | 'info';
/** The mode in words — glyph, UPPERCASE word, tone; `persistent` while the contract is in force (shown until the owner's exit). */
export function modeView(c: Pick<ContractState, 'mode' | 'overdue' | 'dependency' | 'owner'>): { tone: Tone; glyph: string; word: string; headline: string; persistent: boolean } {
  const dep = dependencyLabel(c.dependency);
  switch (c.mode) {
    case 'active': return { tone: 'critical', glyph: '⚠', word: c.overdue ? 'DEGRADED — PAST ITS MAXIMUM DURATION' : 'DEGRADED', headline: `${dep} is degraded`, persistent: true };
    case 'awaiting_exit': return { tone: 'warning', glyph: '◐', word: 'RECOVERY NOT VERIFIED', headline: `${dep} reads recovered; the contract stays in force until ${c.owner.name ?? 'its owner'} records the exit evidence`, persistent: true };
    case 'unknown': return { tone: 'unknown', glyph: '◍', word: 'NOT EVALUATED', headline: `No read evaluates ${dep} here — its state is unknown, not healthy`, persistent: false };
    case 'normal': return { tone: 'info', glyph: 'ℹ', word: 'NORMAL', headline: `${dep} is not degraded`, persistent: false };
  }
}

/** The contract's lines (CNT-12: available / unavailable / limitations / owner / duration / exit — each always said, "none" when empty). */
export function contractLines(c: ContractState): { available: string[]; unavailable: string[]; limitations: string[]; owner: string; duration: string; exit: string; since: string | null } {
  const none = (xs: string[]) => (xs.length === 0 ? ['none'] : xs);
  const elapsed = c.elapsed_seconds === null ? null : formatDuration(c.elapsed_seconds);
  return {
    available: none(c.available.map((f) => f.label)), unavailable: none(c.unavailable.map((f) => f.label)), limitations: none(c.limitations),
    owner: c.owner.name ?? c.owner.principal_id,
    duration: `at most ${formatDuration(c.max_duration_seconds)}${elapsed === null ? '' : ` — degraded for ${elapsed}${c.overdue ? ', PAST the maximum: escalate to the owner' : ''}`}`,
    exit: c.mode === 'awaiting_exit' ? `Awaiting the owner's exit evidence: ${c.exit_evidence}` : `Exit when: ${c.exit_evidence}`,
    since: c.signal.since,
  };
}

/** The undeclared degraded dependency: shown, with what is NOT known said (never hidden for lack of a contract). */
export function undeclaredLines(u: UndeclaredState): { headline: string; reason: string; unknowns: string } {
  return { headline: `${dependencyLabel(u.dependency)} is degraded — no degraded contract is declared`, reason: u.signal.reason,
    unknowns: 'What still works, who owns it, how long it may last and what ends it are NOT declared; treat dependent actions with care and ask the operations authority.' };
}

/** What the shell's DegradedBanner (a B107 key — wrapped, never edited) shows: visible while anything is in force or undeclared, or /readyz reports degraded. */
export function bannerOf(s: DegradedState | null, readyzDegraded: boolean): { visible: boolean; detail: string } {
  const active = (s?.contracts ?? []).filter((c) => c.in_force);
  const undecl = s?.undeclared ?? [];
  const parts = [
    ...active.map((c) => `${dependencyLabel(c.dependency)} ${c.mode === 'awaiting_exit' ? '(recovery not verified)' : ''}`.trim()),
    ...undecl.map((u) => `${dependencyLabel(u.dependency)} (no contract)`),
  ];
  if (parts.length === 0) return { visible: readyzDegraded, detail: readyzDegraded ? 'the API reports degraded audit availability' : '' };
  return { visible: true, detail: parts.join('; ') };
}

/* ───────────────────────── 4 · the stale declaration (PAT-32) ───────────────────────── */

export interface StaleView { stale: boolean; current: false; revision: string | null; watermark: string | null; watermarkBasis: string; age: string; threshold: string | null; refreshPath: string; reason: string }
/** From a source signal's details (the server's: revision, watermark, age, threshold, refresh path). A stale view is NEVER current styled. */
export function staleOfSource(sig: Signal): StaleView | null {
  const d = sig.details;
  if (d === undefined || d === null || !('reference_basis' in d)) return null;
  const age = typeof d['age_seconds'] === 'number' ? formatDuration(d['age_seconds'] as number) : 'not known';
  return {
    stale: d['stale'] === true || sig.state === 'degraded', current: false,
    revision: d['source_revision'] === undefined || d['source_revision'] === null ? null : `source contract v${String(d['source_revision'])}`,
    watermark: (d['watermark'] as string | null) ?? (d['reference_at'] as string | null) ?? null,
    watermarkBasis: String(d['reference_basis'] ?? 'no arrival and no activation recorded'),
    age, threshold: typeof d['threshold_seconds'] === 'number' ? formatDuration(d['threshold_seconds'] as number) : null,
    refreshPath: String(d['refresh_path'] ?? DEPENDENCY_REGISTRY.source.refreshPath), reason: sig.reason,
  };
}
/** From a B20 projection block: the verified watermark, the lag, the rebuild as the refresh path. Null when current. */
export function staleOfProjection(p: ProjectionBlock | null | undefined, now: number): StaleView | null {
  if (p === null || p === undefined || p.condition === 'current') return null;
  const at = p.verified_at === null ? null : Date.parse(p.verified_at);
  return {
    stale: true, current: false, revision: p.revision === null ? null : `revision ${p.revision}`, watermark: p.verified_at,
    watermarkBasis: p.verified_seq === null ? 'never verified' : `verified through sequence ${p.verified_seq}`,
    age: at === null || Number.isNaN(at) ? 'not known' : formatDuration(Math.max(0, Math.floor((now - at) / 1000))),
    threshold: null,
    refreshPath: p.condition === 'withdrawn' ? DEPENDENCY_REGISTRY.partition.refreshPath : 'the retrieval subscriber\'s next applied check',
    reason: p.label ?? `the projection is ${p.condition}${p.lag_events > 0 ? ` (${p.lag_events} event(s) behind)` : ''}`,
  };
}

/* ───────────────────────── 5 · the partial result (PAT-29) ───────────────────────── */

export interface PartialDeclaration {
  complete: boolean; missingSources: string[]; missingIntervals: Array<{ from: string; to: string }>; filters: string[]; bounds: string | null; withdrawn: string[]; impact: string | null;
}
export const COMPLETE: PartialDeclaration = { complete: true, missingSources: [], missingIntervals: [], filters: [], bounds: null, withdrawn: [], impact: null };
const isPartial = (d: Omit<PartialDeclaration, 'complete'>) => d.missingSources.length > 0 || d.missingIntervals.length > 0 || d.filters.length > 0 || d.bounds !== null || d.withdrawn.length > 0;
export function partialOf(d: Partial<Omit<PartialDeclaration, 'complete'>>): PartialDeclaration {
  const x = { missingSources: d.missingSources ?? [], missingIntervals: d.missingIntervals ?? [], filters: d.filters ?? [], bounds: d.bounds ?? null, withdrawn: d.withdrawn ?? [], impact: d.impact ?? null };
  return { ...x, complete: !isPartial(x) };
}
/** A B20 projection block: the withdrawn partitions (served from the log) and a lag are partial. */
export function partialFromProjection(p: ProjectionBlock | null | undefined): PartialDeclaration {
  if (p === null || p === undefined || p.condition === 'current') return COMPLETE;
  return partialOf({ withdrawn: p.withdrawn, bounds: p.lag_events > 0 ? `${p.lag_events} change(s) not yet verified` : p.condition === 'unverified' ? 'not yet verified by a retrieval check' : null,
    impact: p.label ?? `results are served ${p.condition === 'withdrawn' ? 'from the event log' : `while the projection is ${p.condition}`}` });
}
/** The governed search: a bounded scan is partial even when the server sent no note. */
export function partialFromSearch(r: { complete?: { entities: boolean; objects: boolean } | null; note?: string | null; bounds?: { entities: number; objects: number } | null } | null | undefined): PartialDeclaration {
  const c = r?.complete;
  if (c === null || c === undefined || (c.entities && c.objects)) return COMPLETE;
  const b = r?.bounds ?? { entities: 1_000, objects: 2_000 };
  return partialOf({ bounds: r?.note ?? `the entity scan is bounded at ${b.entities} rows and the object scan at the ${b.objects} newest`, impact: 'a match beyond a bound is not returned' });
}
export function mergePartial(...ds: PartialDeclaration[]): PartialDeclaration {
  return partialOf({
    missingSources: [...new Set(ds.flatMap((d) => d.missingSources))], missingIntervals: ds.flatMap((d) => d.missingIntervals), filters: [...new Set(ds.flatMap((d) => d.filters))],
    bounds: ds.map((d) => d.bounds).filter((x): x is string => x !== null).join('; ') || null, withdrawn: [...new Set(ds.flatMap((d) => d.withdrawn))],
    impact: ds.map((d) => d.impact).filter((x): x is string => x !== null).join('; ') || null,
  });
}
/** The declaration in words. Never "complete" styling for a partial result; a complete one says nothing. */
export function partialText(d: PartialDeclaration): { title: string; lines: string[] } | null {
  if (d.complete) return null;
  const lines = [
    ...(d.missingSources.length > 0 ? [`Missing sources: ${d.missingSources.join(', ')}`] : []),
    ...d.missingIntervals.map((i) => `Missing interval: ${i.from} – ${i.to}`),
    ...(d.filters.length > 0 ? [`Filters applied: ${d.filters.join(', ')}`] : []),
    ...(d.bounds !== null ? [`Bounded: ${d.bounds}`] : []),
    ...(d.withdrawn.length > 0 ? [`Withdrawn partitions (served from the event log): ${d.withdrawn.join(', ')}`] : []),
    `Impact: ${d.impact ?? 'what is missing may change the answer'}`,
  ];
  return { title: 'PARTIAL RESULT — not complete', lines };
}

/* ───────────────────────── 6 · the residual state of a cancellation (PAT-22) ───────────────────────── */

export interface ResidualView { cancelled: boolean; runState: 'partial' | 'failed' | 'none'; completedPaths: number | null; declaredPaths: number | null; outputsDigest: string | null;
  reason: string | null; rolledBack: false; summary: string; effects: string[] }
/** B31's cancelled experiment (simulation.cancel_experiment's answer): the paths done stay done; nothing is rolled back. */
export function residualOf(e: Row | null | undefined): ResidualView | null {
  if (e === null || e === undefined || e['state'] !== 'cancelled') return null;
  const o = (e['outcome'] ?? {}) as Row; const m = (e['manifest'] ?? null) as Row | null;
  const runState = o['run_state'] === 'partial' ? 'partial' : o['run_state'] === 'failed' ? 'failed' : 'none';
  const done = typeof o['completed_paths'] === 'number' ? (o['completed_paths'] as number) : null;
  const declared = typeof o['declared_paths'] === 'number' ? (o['declared_paths'] as number) : (typeof e['paths'] === 'number' ? (e['paths'] as number) : null);
  const digest = m !== null && typeof m['outputs_digest'] === 'string' ? (m['outputs_digest'] as string) : null;
  const effects = runState === 'partial'
    ? [`${done ?? '?'} of ${declared ?? '?'} paths completed and recorded — they stay recorded`, `the run is PARTIAL${digest ? `; its outputs digest ${digest.slice(0, 12)}…` : ''}`, 'no new path starts']
    : runState === 'failed' ? ['no path completed before the cancellation; the run is recorded FAILED', 'no new path starts'] : ['the experiment never started a run; nothing was computed'];
  return { cancelled: true, runState, completedPaths: done, declaredPaths: declared, outputsDigest: digest, reason: typeof o['reason'] === 'string' ? (o['reason'] as string) : null, rolledBack: false,
    summary: 'CANCELLED — new work stopped; completed effects are NOT rolled back', effects };
}

/* ───────────────────────── 7 · the failure states (V00-T-106) ───────────────────────── */

export type FailureKind = 'missing' | 'stale' | 'failed_agent' | 'unavailable_method' | 'incomplete_twin' | 'weak_provenance' | 'policy_denial' | 'evaluation_gap' | 'simulation_limit' | 'unknown_outcome';
export interface FailureSpec { label: string; read: string | null; carrier: string | null; words: Record<Audience, string>; next: string }
export const FAILURE_VOCABULARY: Readonly<Record<FailureKind, FailureSpec>> = {
  missing: { label: 'MISSING DATA', read: 'the read\'s own empty-state evidence (none recorded, not collected, not permitted, unavailable)', carrier: null,
    words: { executive: 'The information this needs is not there.', analyst: 'No record answers this in the scope you can read; that is not evidence of absence.', operator: 'The read returned nothing for this scope.' },
    next: 'Check the scope and the filters, or ask who collects it.' },
  stale: { label: 'STALE DATA', read: 'a source\'s freshness by the clock; a twin\'s observed-through; a projection\'s watermark', carrier: null,
    words: { executive: 'This is out of date — it shows how things were, not how they are.', analyst: 'The data is older than its freshness threshold; see the watermark and age.', operator: 'The last arrival is past the threshold; the refresh path is named.' },
    next: 'Use it as of its watermark, or refresh it by the named path.' },
  failed_agent: { label: 'FAILED AGENT', read: 'the agent\'s registration and its latest run', carrier: null,
    words: { executive: 'An automated helper stopped working; its work since then is not done.', analyst: 'The agent\'s latest run faulted or stopped; outputs after it are absent.', operator: 'The agent run faulted or stopped and was escalated to its named human.' },
    next: 'The agent\'s owner reviews the escalation.' },
  unavailable_method: { label: 'METHOD UNAVAILABLE', read: 'the B29 method quarantine', carrier: null,
    words: { executive: 'A calculation method is switched off after repeated faults.', analyst: 'The method is quarantined in this domain; new runs of it are refused.', operator: 'Quarantined after its fault threshold; a passing probe and a steward\'s reinstatement return it.' },
    next: 'A method steward probes and reinstates it.' },
  incomplete_twin: { label: 'INCOMPLETE TWIN', read: 'the twin version\'s grounding completeness (0035)', carrier: null,
    words: { executive: 'The model of the operation is missing parts; results may be off.', analyst: 'The twin version is not grounded complete; its runs carry the gap.', operator: 'Grounding is incomplete for the named elements.' },
    next: 'Ground the missing elements, then admit a new version.' },
  /* B82 px: the read B81 left without one — graph.provenance_strength (0121 §PX), shown on the provenance trail and /graph/trust */
  weak_provenance: { label: 'WEAK PROVENANCE', read: 'the provenance strength (graph.provenance_strength — weak or broken, with its reasons)', carrier: null,
    words: { executive: 'Where this came from is not well established.', analyst: 'The provenance chain has a gap, an unresolved input or an unfit mark; the trail names each.', operator: 'graph.provenance_strength reads weak or broken; its reasons name the nodes.' },
    next: 'Treat it as unverified until its trail is shown.' },
  policy_denial: { label: 'NOT PERMITTED', read: 'the server\'s refusal, in its own words', carrier: null,
    words: { executive: 'You are not permitted to do or see this.', analyst: 'The policy refused the request; the server\'s words say why.', operator: 'Denied at the policy decision point; the correlation id identifies it.' },
    next: 'Ask an administrator of this scope if you need it.' },
  evaluation_gap: { label: 'NOT EVALUATED', read: 'the forecast\'s fitness and validation state', carrier: null,
    words: { executive: 'This has not been checked against what really happened.', analyst: 'No validation covers this use; treat the result as unvalidated.', operator: 'The validation record is absent or does not cover this horizon.' },
    next: 'Use it as diagnostic only, or validate it first.' },
  simulation_limit: { label: 'OUTSIDE THE OPERATING ENVELOPE', read: 'the B30 operating envelope', carrier: null,
    words: { executive: 'This scenario is beyond what the model is built to answer.', analyst: 'The inputs fall outside the method\'s declared envelope; the result is not decision-grade.', operator: 'Envelope check failed on the named inputs.' },
    next: 'Narrow the scenario, or choose a method whose envelope covers it.' },
  unknown_outcome: { label: 'OUTCOME UNKNOWN', read: 'the command\'s own status read', carrier: null,
    words: { executive: 'We do not know whether that went through.', analyst: 'No answer arrived; the request may have been recorded.', operator: 'Timeout or lost connection; the command id is kept.' },
    next: 'Check its status before trying again.' },
};
/** A failure in the reader's words, naming the read that evaluates it — or that none does here (and its carrier). */
export function failureOf(kind: FailureKind, audience: Audience, detail?: string | null): { title: string; body: string; next: string; read: string } {
  const f = FAILURE_VOCABULARY[kind];
  return { title: f.label, body: `${f.words[audience]}${detail ? ` ${detail}` : ''}`, next: f.next,
    read: f.read === null ? `No read evaluates this here${f.carrier ? ` — ${f.carrier}` : ''}.` : `Evaluated from ${f.read}.` };
}

/* ───────────────────────── 8 · timeout and duplicate submission (REL-18) ───────────────────────── */

export const DEFAULT_TIMEOUT_MS = 30_000;
/** One submission at a time: a second submit while the first is pending is refused, with its reason (never sent). */
export function guardSubmit(s: CommandState, commandId: string, now: number): { state: CommandState; sent: boolean; reason: string | null } {
  const r = start(s, commandId, now);
  return r.started ? { state: r.state, sent: true, reason: null }
    : { state: s, sent: false, reason: `Already submitted${s.commandId ? ` (command ${s.commandId.slice(0, 8)}…)` : ''} — waiting for the server's answer.` };
}
/** The wait exceeded the timeout: UNKNOWN (never failed, never done) — the words say to check before retrying. */
export function timeoutView(s: CommandState, now: number, timeoutMs = DEFAULT_TIMEOUT_MS): { state: CommandState; timedOut: boolean; text: string | null } {
  const next = timeout(s, now, timeoutMs);
  const timedOut = next !== s && next.phase === 'unknown';
  return { state: next, timedOut, text: timedOut ? 'Outcome unknown — no answer in time. Check before retrying; the request may have been recorded.' : null };
}

/* ───────────────────────── 9 · the retry rule (PAT-20) ───────────────────────── */

export type CommandIdentity = 'request_id' | 'idempotency_key' | 'none';
/** The routes that take a command identity today (the server answers a replay with the recorded row). Every other route: none — until B100. */
export const ROUTE_IDENTITY: Readonly<Record<string, CommandIdentity>> = {
  'shell.degraded.contract.declare': 'request_id', 'shell.degraded.exit': 'request_id',
  'prediction.scenario.branch': 'idempotency_key', 'graph.revision.commit': 'idempotency_key',
};
export const identityOf = (action: string): CommandIdentity => ROUTE_IDENTITY[action] ?? 'none';
/** Retry idempotently: reuse the command identity where the route takes one; otherwise read the first attempt's outcome, then a NEW explicit act. */
export function retryRule(s: CommandState, action: string): { offer: 'reuse_identity' | 'check_then_new_act' | 'correct' | 'reload' | 'none'; reuseCommandId: string | null; text: string } {
  const id = identityOf(action);
  if (s.phase === 'unknown' || s.phase === 'abandoned') {
    if (id !== 'none') return { offer: 'reuse_identity', reuseCommandId: s.commandId, text: `Retry with the same ${id === 'request_id' ? 'request id' : 'idempotency key'}: the server answers the recorded result if the first attempt was recorded — no duplicate effect.` };
    return { offer: 'check_then_new_act', reuseCommandId: null, text: 'This action has no command identity yet (B100): read whether the first attempt was recorded, and only then act again as a new, explicit act.' };
  }
  const a = retryAdvice(s, { idempotentKey: id !== 'none' });
  return { offer: a.offer === 'correct' ? 'correct' : a.offer === 'reload' ? 'reload' : 'none', reuseCommandId: null, text: a.text };
}

/* ───────────────────────── 10 · the recovery panel (CMP-072, REL-11) ───────────────────────── */

export interface RecoveryStep { kind: 'retry' | 'check' | 'cancel' | 'route' | 'reload' | 'correct'; label: string; href?: string; disabled?: boolean; reason?: string | null }
export interface RecoveryModel { happened: string; preserved: string[]; residual: string[]; steps: RecoveryStep[] }
/** After a command that did not confirm: what happened, what is preserved, what residual effects there may be, the safe next steps. */
/** B81 integration (UX-11-005): the shell's last verified location appended to a model's safe next steps (never a second route; null stays null). */
export function withShellRecovery(model: RecoveryModel | null, lastVerified: { route: string; title: string } | null): RecoveryModel | null {
  if (model === null || lastVerified === null || model.steps.some((s) => s.kind === 'route')) return model;
  return { ...model, steps: [...model.steps, { kind: 'route', label: `Return to the last verified location (${lastVerified.title || lastVerified.route})`, href: lastVerified.route }] };
}
/** B81 integration (UX-11-005): a deep link the server refused or could not answer — opening a link never acts, so nothing changed. */
export function recoveryOfRefusedLink(what: string): RecoveryModel {
  return { happened: `The ${what} this link names was not opened — the server refused it or could not answer.`, preserved: ['Nothing was changed: opening a link never acts.'], residual: [], steps: [] };
}

export function recoveryOfCommand(s: CommandState, action: string, o: { preserved?: string[]; statusHref?: string | null; lastVerified?: string | null }): RecoveryModel | null {
  if (s.phase !== 'unknown' && s.phase !== 'abandoned' && s.phase !== 'refused') return null;
  const rule = retryRule(s, action);
  const preserved = [...(o.preserved ?? []), ...(s.lastConfirmed !== null ? [`the last confirmed state: ${s.lastConfirmed}`] : [])];
  const steps: RecoveryStep[] = [];
  if (rule.offer === 'reuse_identity') steps.push({ kind: 'retry', label: 'Retry with the same request id' });
  if (rule.offer === 'check_then_new_act' && o.statusHref) steps.push({ kind: 'check', label: 'Check whether it was recorded', href: o.statusHref });
  if (rule.offer === 'reload') steps.push({ kind: 'reload', label: 'Reload the record' });
  if (rule.offer === 'correct') steps.push({ kind: 'correct', label: 'Correct what the server named' });
  if (o.lastVerified) steps.push({ kind: 'route', label: 'Return to the last verified location', href: o.lastVerified });
  return {
    happened: s.phase === 'refused' ? `Refused by the server: ${s.error?.message ?? 'no reason given'}` : s.phase === 'abandoned' ? 'You stopped waiting — the outcome is unknown.' : 'No answer arrived — the outcome is unknown.',
    preserved: preserved.length > 0 ? preserved : ['nothing on this page changed'],
    residual: s.phase === 'refused' ? ['none — a refusal records nothing'] : ['the request may have been recorded by the server', rule.text],
    steps,
  };
}

/* ───────────────────────── 11 · the degraded copy (CNT-12; checked by §CT's content lint) ───────────────────────── */

/** The catalogue entries (messages/en.json, prefix b81.dg.*): available / unavailable / owner / exit, persistent until verified recovery. */
export const DEGRADED_COPY_KEYS = [
  'b81.dg.banner.title', 'b81.dg.contract.available', 'b81.dg.contract.unavailable', 'b81.dg.contract.limitations', 'b81.dg.contract.owner',
  'b81.dg.contract.duration', 'b81.dg.contract.exit', 'b81.dg.contract.persistent', 'b81.dg.undeclared.title', 'b81.dg.undeclared.body',
  'b81.dg.stale.title', 'b81.dg.stale.refresh', 'b81.dg.partial.title', 'b81.dg.residual.title', 'b81.dg.recovery.title', 'b81.dg.recovery.preserved',
  'b81.dg.recovery.residual', 'b81.dg.recovery.next', 'b81.dg.exit.action', 'b81.dg.declare.action',
] as const;
export const copy = (k: (typeof DEGRADED_COPY_KEYS)[number]): string => t(k);

/* ───────────────────────── 12 · the client (every response verbatim) ───────────────────────── */

export interface Receipt { policyDecisionId: string; auditSeq: number }
const base = (s: Scope | null) => (s === null ? '/v1/shell/degraded' : `/v1/tenants/${s.tenantId}/domains/${s.domainId}/shell/degraded`);
const env = (s: Scope | null, action: string, purpose: string, id: string | null = null) => ({
  scope: (s === null ? 'PLATFORM' : 'DOMAIN') as 'PLATFORM' | 'DOMAIN', tenant_id: s?.tenantId ?? null, domain_id: s?.domainId ?? null, action, object_type: 'SDG', object_id: id, purpose_id: purpose,
  side_effect_class: action === 'shell.degraded.read' ? 'none' as const : 'reversible' as const, consequence_class: action === 'shell.degraded.read' ? 'C1' as const : 'C2' as const,
});
export interface DeclareInput { requestId: string; kind: DependencyKind; key: string; expectedVersion: number; available: FunctionEntry[]; unavailable: FunctionEntry[]; limitations: string[];
  maxDurationSeconds: number; ownerPrincipalId: string; exitEvidence: string; reason: string }
export const degraded = {
  state: (s: Scope | null, purpose: string, filter: { kind?: DependencyKind; key?: string } = {}): Promise<ApiResult<{ degraded: DegradedState; receipt: Receipt }>> =>
    call(`${base(s)}/state`, env(s, 'shell.degraded.read', purpose), filter),
  history: (s: Scope | null, purpose: string, contractId: string): Promise<ApiResult<{ contract: Row; receipt: Receipt }>> =>
    call(`${base(s)}/contracts/${contractId}/read`, env(s, 'shell.degraded.read', purpose, contractId), {}),
  declare: (s: Scope | null, purpose: string, a: DeclareInput): Promise<ApiResult<{ contract: Row; receipt: Receipt }>> =>
    call(`${base(s)}/contracts/declare`, env(s, 'shell.degraded.contract.declare', purpose), a),
  exit: (s: Scope | null, purpose: string, contractId: string, a: { requestId: string; contractVersion: number; evidence: string; evidenceRefs?: string[] }): Promise<ApiResult<{ exit: Row; receipt: Receipt }>> =>
    call(`${base(s)}/contracts/${contractId}/exit`, env(s, 'shell.degraded.exit', purpose, contractId), a),
};
