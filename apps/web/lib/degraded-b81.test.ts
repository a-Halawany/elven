import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { LIBRARY_B81 } from './b81-seams';
import { IDLE, settle, start } from './feedback-b80';
import type { ProjectionBlock } from './graph';
import {
  DEGRADED_COPY_KEYS, DEPENDENCY_REGISTRY, FAILURE_VOCABULARY, ROUTE_IDENTITY, actionMatches, bannerOf, contractLines, failureOf, formatDuration, gateAction,
  guardSubmit, mergePartial, modeView, partialFromProjection, partialFromSearch, partialOf, partialText, recoveryOfCommand, residualOf, retryRule,
  staleOfProjection, staleOfSource, timeoutView, toSeamContract, unavailableBecause, undeclaredLines,
  type ContractState, type DegradedState, type FailureKind, type Signal,
} from './degraded-b81';

/** CP-6 B81 §DG — the degraded-state, failure and recovery contract (F-P7-E-19). Every value here is SYNTHETIC. */
const root = join(__dirname, '..');
const NOW = Date.parse('2026-10-19T12:00:00Z');

const staleSignal: Signal = {
  state: 'degraded', basis: 'the source contract, its health and its freshness by the clock', since: '2026-10-07T13:15:36Z', last_degraded_at: '2026-10-19T12:00:00Z',
  reason: 'source red-sea-ais-positions: it is STALE by the clock: the last activation (no arrival since) was 2026-09-30 13:15:36+00, 19 days ago — beyond its 604800 s freshness threshold',
  details: { source_key: 'red-sea-ais-positions', source_revision: 1, connector_kind: 'upload', threshold_seconds: 604_800, watermark: null, reference_at: '2026-09-30T13:15:36Z',
    reference_basis: 'activation (no arrival since)', age_seconds: 19 * 86_400, stale: true, refresh_path: 'a new upload under source contract v1 (its registrar or a collection manager)' },
};
const contract = (over: Partial<ContractState> = {}): ContractState => ({
  contract_id: 'c-1', version: 2, scope: 'DOMAIN', dependency: { kind: 'source', key: 'red-sea-ais-positions' },
  available: [{ action: 'prediction.read', label: 'Read the corridor warnings already made' }],
  unavailable: [{ action: 'prediction.forecast.run', label: 'Run a new corridor forecast' }, { action: 'decision.package.*', label: 'Act on a decision package citing fresh positions' }],
  limitations: ['Positions are as old as the watermark says'], max_duration_seconds: 86_400,
  owner: { principal_id: 'p-owner', name: 'A. Hoffmann (SYNTHETIC)' }, exit_evidence: 'A fresh upload admitted within the threshold', reason: 'the corridor views depend on it',
  declared_by: { principal_id: 'p-ops', name: 'Operations authority (SYNTHETIC)' }, declared_at: '2026-10-19T10:00:00Z', first_declared_at: '2026-10-18T10:00:00Z',
  signal: staleSignal, mode: 'active', in_force: true, elapsed_seconds: 12 * 86_400, overdue: true, last_exit: null, ...over,
});
const stateOf = (cs: ContractState[], undeclared: DegradedState['undeclared'] = []): DegradedState => ({
  read_at: '2026-10-19T12:00:00Z', tenant_id: 't', domain_id: 'd', contracts: cs, undeclared, degraded: cs.some((c) => c.in_force) || undeclared.length > 0, unknown: 0,
  unavailable_functions: cs.filter((c) => c.in_force).flatMap((c) => c.unavailable.map((f) => ({ ...f, dependency: c.dependency, contract_id: c.contract_id, mode: c.mode }))),
});

describe('the dependency registry (REL-12): every kind, its scope, its read — or the statement that none exists', () => {
  it('seven kinds; the platform\'s three; model and network have NO read and name their carrier', () => {
    expect(Object.keys(DEPENDENCY_REGISTRY).sort()).toEqual(['agent', 'audit', 'method', 'model', 'network', 'partition', 'source']);
    expect(Object.values(DEPENDENCY_REGISTRY).filter((d) => d.scope === 'PLATFORM').map((d) => d.kind).sort()).toEqual(['audit', 'model', 'network']);
    for (const k of ['model', 'network'] as const) expect(DEPENDENCY_REGISTRY[k]).toMatchObject({ read: null, carrier: expect.any(String) });
    for (const k of ['audit', 'partition', 'source', 'method', 'agent'] as const) expect(DEPENDENCY_REGISTRY[k].read).toEqual(expect.any(String));
  });
});

describe('the contract evaluation (HX-16, PAT-30, UX-ADR-018)', () => {
  it('an action a contract in force lists is DISABLED with the contract\'s reason; a prefix covers every action under it; the page\'s own refusal first', () => {
    const s = stateOf([contract()]);
    expect(actionMatches('decision.package.*', 'decision.package.commit')).toBe(true);
    expect(actionMatches('decision.package.*', 'decision.packages')).toBe(false);
    expect(actionMatches('prediction.forecast.run', 'prediction.forecast.run.x')).toBe(false);
    expect(unavailableBecause(s, 'decision.package.commit')).toMatchObject({ unavailable: true, dependency: { kind: 'source' } });
    expect(gateAction(s, 'prediction.forecast.run', { can: true, reason: null })).toEqual({ disabled: true, reason: 'Run a new corridor forecast is unavailable: Source red-sea-ais-positions is degraded (degraded contract v2).' });
    expect(gateAction(s, 'prediction.read', { can: true, reason: null })).toEqual({ disabled: false, reason: null });
    expect(gateAction(s, 'prediction.read', { can: false, reason: 'You are not the forecast owner.' })).toEqual({ disabled: true, reason: 'You are not the forecast owner.' });
    expect(gateAction(null, 'prediction.forecast.run', { can: true, reason: null }).disabled).toBe(false);
  });
  it('AWAITING_EXIT stays in force and says the owner has not verified the recovery (persistent until verified recovery)', () => {
    const c = contract({ mode: 'awaiting_exit', overdue: false, elapsed_seconds: null, signal: { ...staleSignal, state: 'healthy', since: null } });
    const s = stateOf([c]);
    expect(unavailableBecause(s, 'prediction.forecast.run').reason).toMatch(/reads recovered, but its owner \(A\. Hoffmann \(SYNTHETIC\)\) has not verified the recovery yet/);
    expect(modeView(c)).toMatchObject({ tone: 'warning', word: 'RECOVERY NOT VERIFIED', persistent: true });
    expect(contractLines(c).exit).toBe('Awaiting the owner\'s exit evidence: A fresh upload admitted within the threshold');
    // NORMAL: nothing in force, nothing disabled
    const n = contract({ mode: 'normal', in_force: false, overdue: false, elapsed_seconds: null });
    expect(gateAction(stateOf([n]), 'prediction.forecast.run', { can: true, reason: null }).disabled).toBe(false);
    expect(modeView(n)).toMatchObject({ word: 'NORMAL', persistent: false });
    // NOT EVALUATED is never healthy
    expect(modeView(contract({ mode: 'unknown', dependency: { kind: 'model', key: 'forecast-ensemble' } })).headline).toBe('No read evaluates Model forecast-ensemble here — its state is unknown, not healthy');
  });
  it('the contract\'s lines (CNT-12): every part said, "none" when empty; the duration with the elapsed time and the overdue escalation', () => {
    const l = contractLines(contract({ available: [] }));
    expect(l.available).toEqual(['none']);
    expect(l.unavailable).toEqual(['Run a new corridor forecast', 'Act on a decision package citing fresh positions']);
    expect(l.owner).toBe('A. Hoffmann (SYNTHETIC)');
    expect(l.duration).toBe('at most 1 d — degraded for 12 d, PAST the maximum: escalate to the owner');
    expect(modeView(contract()).word).toBe('DEGRADED — PAST ITS MAXIMUM DURATION');
    expect(toSeamContract(contract())).toEqual({ dependency: { kind: 'source', key: 'red-sea-ais-positions' }, available: ['Read the corridor warnings already made'],
      unavailable: ['Run a new corridor forecast', 'Act on a decision package citing fresh positions'], limitations: ['Positions are as old as the watermark says'], maxDuration: '1 d',
      owner: 'A. Hoffmann (SYNTHETIC)', exitEvidence: 'A fresh upload admitted within the threshold', version: 2 });
    expect([formatDuration(59), formatDuration(3_660), formatDuration(90_000), formatDuration(null)]).toEqual(['59 s', '1 h 1 min', '1 d 1 h', 'not known']);
  });
  it('the banner (DegradedBanner, wrapped): visible while anything is in force or undeclared, or /readyz says degraded; an undeclared dependency is never hidden', () => {
    expect(bannerOf(null, false)).toEqual({ visible: false, detail: '' });
    expect(bannerOf(null, true)).toEqual({ visible: true, detail: 'the API reports degraded audit availability' });
    const u = { dependency: { kind: 'method' as const, key: 'discrete-event@1' }, scope: 'DOMAIN' as const, signal: { ...staleSignal, reason: 'method discrete-event@1 is QUARANTINED' } };
    expect(bannerOf(stateOf([contract()], [u]), false)).toEqual({ visible: true, detail: 'Source red-sea-ais-positions; Simulation method discrete-event@1 (no contract)' });
    expect(undeclaredLines(u).unknowns).toMatch(/are NOT declared/);
  });
});

describe('stale, partial and residual declarations (PAT-32, PAT-29, PAT-22)', () => {
  it('a stale source: revision, watermark (the activation when no arrival), age, threshold, refresh path — never current', () => {
    expect(staleOfSource(staleSignal)).toEqual({ stale: true, current: false, revision: 'source contract v1', watermark: '2026-09-30T13:15:36Z', watermarkBasis: 'activation (no arrival since)',
      age: '19 d', threshold: '7 d', refreshPath: 'a new upload under source contract v1 (its registrar or a collection manager)', reason: staleSignal.reason });
    expect(staleOfSource({ ...staleSignal, details: {} })).toBeNull();
  });
  const block = (over: Partial<ProjectionBlock>): ProjectionBlock => ({ revision: 41, verified_seq: 39, verified_at: '2026-10-19T11:00:00Z', verified_check_id: null, checkpoint_seq: 39, lag_events: 2,
    unresolved_deliveries: 0, subscription: { subscription_id: null, status: null }, partitions: [], condition: 'lagging', degraded: false, code: null, label: null, withdrawn: [], domain_withdrawn: [], ...over });
  it('a projection block: stale and partial while not current; nothing when current', () => {
    expect(staleOfProjection(block({}), NOW)).toMatchObject({ stale: true, current: false, revision: 'revision 41', age: '1 h', watermarkBasis: 'verified through sequence 39' });
    expect(staleOfProjection(block({ condition: 'current' }), NOW)).toBeNull();
    const w = partialFromProjection(block({ condition: 'withdrawn', withdrawn: ['edges_current'], lag_events: 0, label: 'the edges are served from the event log' }));
    expect(w).toMatchObject({ complete: false, withdrawn: ['edges_current'], impact: 'the edges are served from the event log' });
    expect(partialFromProjection(block({ condition: 'current' })).complete).toBe(true);
  });
  it('a bounded search is partial even without a note; partial results merge; the words never say complete', () => {
    const s = partialFromSearch({ complete: { entities: false, objects: true }, note: null, bounds: { entities: 1000, objects: 2000 } });
    expect(s).toMatchObject({ complete: false, bounds: 'the entity scan is bounded at 1000 rows and the object scan at the 2000 newest' });
    expect(partialFromSearch({ complete: { entities: true, objects: true } }).complete).toBe(true);
    const m = mergePartial(s, partialOf({ missingSources: ['red-sea-ais-positions'], missingIntervals: [{ from: '2026-09-30', to: '2026-10-19' }], filters: ['domain = Supply Corridor Intelligence'] }));
    const txt = partialText(m)!;
    expect(txt.title).toBe('PARTIAL RESULT — not complete');
    expect(txt.lines).toEqual(['Missing sources: red-sea-ais-positions', 'Missing interval: 2026-09-30 – 2026-10-19', 'Filters applied: domain = Supply Corridor Intelligence',
      'Bounded: the entity scan is bounded at 1000 rows and the object scan at the 2000 newest', 'Impact: a match beyond a bound is not returned']);
    expect(partialText(partialOf({}))).toBeNull();
  });
  it('a cancellation\'s residual state (B31\'s answer): the paths done stay recorded; NOT rolled back; failed and never-run said', () => {
    const partial = { state: 'cancelled', paths: 500, manifest: { outputs_digest: 'f'.repeat(64) },
      outcome: { outcome: 'cancelled', reason: 'superseded by a wider experiment', run_state: 'partial', completed_paths: 250, declared_paths: 500 } };
    expect(residualOf(partial)).toMatchObject({ runState: 'partial', completedPaths: 250, declaredPaths: 500, outputsDigest: 'f'.repeat(64), rolledBack: false,
      summary: 'CANCELLED — new work stopped; completed effects are NOT rolled back', effects: ['250 of 500 paths completed and recorded — they stay recorded', `the run is PARTIAL; its outputs digest ${'f'.repeat(12)}…`, 'no new path starts'] });
    expect(residualOf({ state: 'cancelled', manifest: null, outcome: { run_state: 'failed', completed_paths: 0, declared_paths: 500 } })!.effects[0]).toMatch(/no path completed/);
    expect(residualOf({ state: 'cancelled', run_id: null, manifest: null, outcome: { outcome: 'cancelled', run_state: null } })!.runState).toBe('none');
    expect(residualOf({ state: 'running' })).toBeNull();
  });
});

describe('the failure states (V00-T-106): per audience, each naming its read — or that none exists here', () => {
  it('every kind has three audiences\' words and a next step; weak provenance is evaluated from the provenance strength (B82 §PX)', () => {
    const kinds = Object.keys(FAILURE_VOCABULARY) as FailureKind[];
    expect(kinds.sort()).toEqual(['evaluation_gap', 'failed_agent', 'incomplete_twin', 'missing', 'policy_denial', 'simulation_limit', 'stale', 'unavailable_method', 'unknown_outcome', 'weak_provenance']);
    for (const k of kinds) for (const a of ['executive', 'analyst', 'operator'] as const) expect(FAILURE_VOCABULARY[k].words[a].length).toBeGreaterThan(10);
    expect(failureOf('weak_provenance', 'executive').read).toBe('Evaluated from the provenance strength (graph.provenance_strength — weak or broken, with its reasons).');   // B82 px: the read exists now
    expect(failureOf('unavailable_method', 'operator', 'discrete-event@1 after 3 faults.')).toMatchObject({ title: 'METHOD UNAVAILABLE', read: 'Evaluated from the B29 method quarantine.' });
    expect(failureOf('stale', 'executive').body).not.toMatch(/watermark/);
  });
});

describe('timeout, duplicate, retry (REL-18, PAT-20)', () => {
  it('a second submit while pending is refused with its reason; a timeout is UNKNOWN — check before retrying', () => {
    const a = guardSubmit(IDLE, 'cmd-1aaaaaaa', 0);
    expect(a).toMatchObject({ sent: true, reason: null, state: { phase: 'pending' } });
    expect(guardSubmit(a.state, 'cmd-2', 5)).toMatchObject({ sent: false, reason: 'Already submitted (command cmd-1aaa…) — waiting for the server\'s answer.' });
    expect(timeoutView(a.state, 10_000).timedOut).toBe(false);
    const t = timeoutView(a.state, 31_000);
    expect(t).toMatchObject({ timedOut: true, state: { phase: 'unknown', unknownBecause: 'timeout' } });
    expect(t.text).toBe('Outcome unknown — no answer in time. Check before retrying; the request may have been recorded.');
  });
  it('a retry REUSES the command identity where the route takes one; otherwise the first outcome is read, then a NEW explicit act; a refusal is corrected or reloaded', () => {
    const u = timeoutView(start(IDLE, 'req-77', 0).state, 40_000).state;
    expect(retryRule(u, 'shell.degraded.exit')).toMatchObject({ offer: 'reuse_identity', reuseCommandId: 'req-77' });
    expect(retryRule(u, 'prediction.scenario.branch').text).toMatch(/same idempotency key/);
    expect(retryRule(u, 'simulation.experiment.cancel')).toMatchObject({ offer: 'check_then_new_act', reuseCommandId: null });
    expect(retryRule(u, 'simulation.experiment.cancel').text).toMatch(/\(B100\)/);
    const refusedS = settle(start(IDLE, 'c', 0).state, 'c', { ok: false, status: 409, error: { code: 'EYE_STA_002', message: 'degraded contract rejected (stale): the contract is at version 3', correlationId: 'x', retry: 'no' } }, 1, null);
    expect(retryRule(refusedS, 'shell.degraded.exit').offer).toBe('reload');
    expect(Object.keys(ROUTE_IDENTITY).sort()).toEqual(['graph.revision.commit', 'prediction.scenario.branch', 'shell.degraded.contract.declare', 'shell.degraded.exit']);
  });
  it('the recovery panel\'s model (CMP-072): what happened, what is preserved, residual effects, safe next steps — nothing for a confirmed command', () => {
    const u = timeoutView(start({ ...IDLE, lastConfirmed: 'contract v2 declared' }, 'req-9', 0).state, 40_000).state;
    const m = recoveryOfCommand(u, 'shell.degraded.contract.declare', { lastVerified: '/observation/sources' })!;
    expect(m.happened).toBe('No answer arrived — the outcome is unknown.');
    expect(m.preserved).toEqual(['the last confirmed state: contract v2 declared']);
    expect(m.residual[0]).toBe('the request may have been recorded by the server');
    expect(m.steps.map((s) => s.kind)).toEqual(['retry', 'route']);
    const n = recoveryOfCommand(u, 'simulation.experiment.cancel', { statusHref: '/twins/simulations/e-1' })!;
    expect(n.steps).toEqual([{ kind: 'check', label: 'Check whether it was recorded', href: '/twins/simulations/e-1' }]);
    const r = settle(start(IDLE, 'c', 0).state, 'c', { ok: false, status: 422, error: { code: 'EYE_REQ_001', message: 'degraded contract rejected (evidence): the exit evidence says what verified the recovery', correlationId: 'x', retry: 'no' } }, 1, null);
    expect(recoveryOfCommand(r, 'shell.degraded.exit', {})).toMatchObject({ happened: 'Refused by the server: degraded contract rejected (evidence): the exit evidence says what verified the recovery', residual: ['none — a refusal records nothing'] });
    expect(recoveryOfCommand(settle(start(IDLE, 'c', 0).state, 'c', { ok: true, status: 200 }, 1, 'ok'), 'shell.degraded.exit', {})).toBeNull();
  });
});

describe('the degraded copy (CNT-12) and the library contract', () => {
  const en = JSON.parse(readFileSync(join(root, 'messages/en.json'), 'utf8')) as Record<string, string>;
  it('every catalogue key exists under b81.dg.*; the copy names available / unavailable / owner / exit and says persistent until verified recovery', () => {
    for (const k of DEGRADED_COPY_KEYS) { expect(k.startsWith('b81.dg.')).toBe(true); expect(en[k], k).toEqual(expect.any(String)); }
    expect(en['b81.dg.contract.available']).toMatch(/still works/);
    expect(en['b81.dg.contract.unavailable']).toMatch(/unavailable until recovery is verified/);
    expect(en['b81.dg.contract.owner']).toMatch(/Owner/);
    expect(en['b81.dg.contract.exit']).toMatch(/Exit evidence/);
    expect(en['b81.dg.contract.persistent']).toMatch(/stays shown until the owner records the exit evidence/);
    // the actions are verb + object; no surface word (B107's dg-lint-1)
    expect(en['b81.dg.exit.action']).toBe('Record the exit evidence');
    expect(en['b81.dg.declare.action']).toBe('Declare a degraded contract');
    for (const k of DEGRADED_COPY_KEYS) expect(en[k]).not.toMatch(/dashboard|copilot|\bchat\b|\bBI\b|reports?\b/i);
  });
  it('components/recovery.tsx exports the seams\' names, composes DegradedBanner (never redefines it) and uses tokens only', () => {
    const src = readFileSync(join(root, 'components/recovery.tsx'), 'utf8');
    expect(LIBRARY_B81.recovery.files).toEqual(['components/recovery.tsx']);
    for (const n of LIBRARY_B81.recovery.exports) expect(src, n).toMatch(new RegExp(`export function ${n}\\(`));
    expect(src).toContain("import { DegradedBanner } from './ui';");
    expect(src).toContain('<DegradedBanner visible={b.visible} detail={b.detail} />');
    expect(src).not.toMatch(/export function DegradedBanner/);
    expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(/);
    const ui = readFileSync(join(root, 'components/ui.tsx'), 'utf8');
    expect(ui).toContain('export function DegradedBanner({ visible, detail }: { visible: boolean; detail: string })');
  });
});

/* B81 integration (UX-11-005): a page's own refusal handed back to the shell's last verified location */
import { recoveryOfRefusedLink, withShellRecovery } from './degraded-b81';
describe('the refusal is handed back to the shell\'s last verified location (UX-11-005)', () => {
  it('appends the last verified location once; never a second route; null stays null', () => {
    const m = recoveryOfRefusedLink('warning');
    expect(m.preserved).toEqual(['Nothing was changed: opening a link never acts.']);
    const w = withShellRecovery(m, { route: '/prediction/warnings', title: 'Warnings' });
    expect(w?.steps).toEqual([{ kind: 'route', label: 'Return to the last verified location (Warnings)', href: '/prediction/warnings' }]);
    expect(withShellRecovery(w, { route: '/home', title: 'Home' })?.steps.length).toBe(1);
    expect(withShellRecovery(m, null)).toBe(m);
    expect(withShellRecovery(null, { route: '/home', title: 'Home' })).toBeNull();
  });
});
