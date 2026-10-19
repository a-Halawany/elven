import { describe, expect, it } from 'vitest';
import { WORKSPACE_NAV_NAMES, type WorkspaceKey } from './b80-seams';
import {
  affectedLines, barStatus, changedLines, commitGate, commitPayload, consequentialAllowed, contextKeyOf, createContextChannel, createPreviewRegistry,
  diffDimensions, dimensionLines, dimensionsOf, instantWords, localToInstant, materialDimensions, proposalFrom, sameProposal, staleChoice,
  type BarRead, type ImpactRead,
} from './context-b80';

const T = '01900000-0000-7000-8000-00000000000a'; const D = '01900000-0000-7000-8000-00000000000b';
const OBJ = '01900000-0000-7000-8000-0000000000a1'; const OBJ2 = '01900000-0000-7000-8000-0000000000a2';
const SCN = '01900000-0000-7000-8000-0000000000b1'; const SCN2 = '01900000-0000-7000-8000-0000000000b2';
const DIG = 'd'.repeat(64);
const choices = {
  objectives: [{ id: OBJ, title: 'Keep the Regensburg line supplied through Q1', status: 'active', stale: false }, { id: OBJ2, title: 'Hold the Hamburg buffer', status: 'closed', stale: true }],
  scenarios: [{ id: SCN, title: 'Bab el-Mandeb closure (SYNTHETIC)', state: 'active', stale: false }, { id: SCN2, title: 'An old scenario', state: 'closed', stale: true }],
  horizons: ['30d', '90d', '12m', '36m'], classifications: ['public', 'internal', 'confidential', 'restricted'], as_of: '2026-10-17T10:00:00Z',
};
const none: BarRead = { as_of: '2026-10-17T10:00:00Z', tenant_id: T, domain_id: D, principal_id: 'p', current: null, version: 0, unresolved: [], may_set: true, choices, policy: { bundle: 'bundle-v1' } };
const set: BarRead = { ...none, version: 2, current: { context_id: 'c2', version: 2, digest: DIG, set_at: '2026-10-17T09:00:00Z', objective: { id: OBJ, title: 'Keep the Regensburg line supplied through Q1', status: 'active', stale: false },
  horizon: '90d', scenario: null, classification: 'internal', effective_at: null } };
const unresolved: BarRead = { ...set, current: { ...set.current!, objective: { id: OBJ2, title: 'Hold the Hamburg buffer', status: 'closed', stale: true } },
  unresolved: [{ dimension: 'objective', id: OBJ2, status: 'closed', reason: `context rejected (stale): objective ${OBJ2} is closed; a stale objective cannot be set` }] };
const preview = (over: Partial<ImpactRead> = {}): ImpactRead => ({
  as_of: '2026-10-17T10:00:00Z', basis: { context_id: 'c2', digest: DIG, set_at: '2026-10-17T09:00:00Z' },
  current: { objective_id: OBJ, horizon: '90d', scenario_id: null, classification: 'internal', effective_at: null, digest: DIG, set: true },
  proposed: { objective: null, objective_id: null, horizon: '90d', scenario: { id: SCN, title: 'Bab el-Mandeb closure (SYNTHETIC)', status: 'active', stale: false }, scenario_id: SCN, classification: 'internal', effective_at: null, digest: 'e'.repeat(64) },
  changed: [{ dimension: 'objective', from: { id: OBJ, title: 'Keep the Regensburg line supplied through Q1', status: 'active', stale: false }, to: null, from_id: OBJ, to_id: null },
            { dimension: 'scenario', from: null, to: { id: SCN, title: 'Bab el-Mandeb closure (SYNTHETIC)', status: 'active', stale: false }, from_id: null, to_id: SCN }],
  unchanged: false, stale: [], committable: true,
  affected: { drafts: { count: 1, items: [] }, tasks: { count: 2, items: [] }, requests: { count: 1, items: [] }, workspaces: { count: 0, items: [] }, rooms: { count: 0, items: [] },
              home: { sections: ['priorities', 'intelligence', 'warnings', 'decisions', 'commitments', 'outcomes', 'cadence', 'attention queue'], effect: 'recomposed under the new context' } },
  approvals: { count: 1, items: [{ approval_id: 'a1', version_digest: 'f'.repeat(64) }], effect: 'unaffected' },
  previews: { held_by: 'client', effect: 'invalidated where bound to the old context digest', note: '' }, limit: 50, impact_digest: '9'.repeat(64), ...over,
});
const switchTo = { objectiveId: null, horizon: '90d', scenarioId: SCN, classification: 'internal', effectiveAt: null };

describe('the dimensions (UX-10-001/-002, UX-ADR-003, REL-03)', () => {
  it('every workspace states its material dimensions; every DOMAIN workspace all nine, the PLATFORM workspace its scope and deployment', () => {
    for (const ws of Object.keys(WORKSPACE_NAV_NAMES) as WorkspaceKey[]) {
      const material = materialDimensions(ws);
      const lines = dimensionLines({ workspace: ws, bar: ws === 'admin' ? null : set, roles: ['decision_authority'] });
      for (const k of material.filter((m) => m !== 'policy' || ws !== 'admin')) expect(lines.map((l) => l.key), `${ws}: ${k}`).toContain(k);
      if (ws !== 'admin') expect(material).toEqual(['tenant', 'domain', 'role', 'objective', 'horizon', 'scenario', 'classification', 'effective_time', 'policy']);
    }
    const admin = dimensionLines({ workspace: 'admin', bar: null, roles: ['platform_admin'], deployment: 'local-dev' });
    expect(admin.map((l) => `${l.label}=${l.value}`)).toEqual(['Scope=PLATFORM — no tenant or domain context', 'Deployment=local-dev', 'Role=platform_admin']);
  });
  it('no context set: every dimension in its stated default — never blank, never "none" alone (a hosted selector reads that word exactly)', () => {
    const lines = dimensionLines({ workspace: 'decisions', bar: none, roles: ['decision_owner'] });
    expect(Object.fromEntries(lines.map((l) => [l.key, [l.value, l.state]]))).toMatchObject({
      objective: ['the whole domain', 'default'], horizon: ['90d', 'default'], scenario: ['no scenario', 'default'], classification: ['your own clearance', 'default'],
      effective_time: ['live (now)', 'default'], policy: ['bundle-v1', 'set'], version: ['none set', 'default'] });
    expect(lines.every((l) => l.value.trim() !== '' && l.value !== 'none')).toBe(true);
  });
  it('a set context: titles, horizon, ceiling, version and digest; the seam\'s dimensions and the preview key', () => {
    const lines = dimensionLines({ workspace: 'observation', bar: set, roles: ['collection_manager'] });
    expect(lines.find((l) => l.key === 'objective')).toMatchObject({ value: 'Keep the Regensburg line supplied through Q1', state: 'set' });
    expect(lines.find((l) => l.key === 'version')!.value).toBe(`v2 · ${'d'.repeat(12)}…`);
    expect(dimensionsOf(set, ['collection_manager'])).toEqual({ tenantId: T, domainId: D, roles: ['collection_manager'], objective: { id: OBJ, title: 'Keep the Regensburg line supplied through Q1' },
      horizon: '90d', scenario: null, classification: 'internal', effectiveAt: null, policyVersion: 'bundle-v1', version: 2 });
    expect(contextKeyOf(set)).toBe(DIG);
    expect(contextKeyOf(none)).toBe(`default:${T}:${D}`);
  });
  it('RECONCILED ON READ: an objective since closed is UNRESOLVED with the server\'s reason — never shown as current', () => {
    const o = dimensionLines({ workspace: 'graph', bar: unresolved, roles: [] }).find((l) => l.key === 'objective')!;
    expect(o).toMatchObject({ state: 'unresolved', value: 'Hold the Hamburg buffer — UNRESOLVED (closed)' });
    expect(o.note).toMatch(/^context rejected \(stale\)/);
  });
  it('Q11: a page reading live data only DECLARES the effective time not applied; an honouring page shows the instant in UTC, named', () => {
    const at = { ...set, current: { ...set.current!, effective_at: '2026-10-01T06:30:00.000Z' } };
    expect(dimensionLines({ workspace: 'prediction', bar: at, roles: [], effectiveTime: 'live_only' }).find((l) => l.key === 'effective_time'))
      .toMatchObject({ state: 'not_applied', value: '2026-10-01 06:30:00Z (UTC) — not applied on this page (live)' });
    expect(dimensionLines({ workspace: 'prediction', bar: at, roles: [], effectiveTime: 'honoured' }).find((l) => l.key === 'effective_time'))
      .toMatchObject({ state: 'set', value: '2026-10-01 06:30:00Z (UTC)' });
    expect(instantWords(null)).toBe('live (now)');
  });
});

describe('the bar\'s states (CMP-010, UX-10-005)', () => {
  it('platform · loading · ready · degraded (held) · unavailable (refused) · error — consequential commands held whenever the scope is not resolved', () => {
    expect(barStatus({ workspace: 'admin', bar: null, loading: false, failure: null })).toMatchObject({ state: 'platform', consequentialFrozen: false, maySwitch: false });
    expect(barStatus({ workspace: 'home', bar: null, loading: true, failure: null })).toMatchObject({ state: 'loading', consequentialFrozen: true });
    expect(barStatus({ workspace: 'home', bar: set, loading: false, failure: null })).toMatchObject({ state: 'ready', consequentialFrozen: false, maySwitch: true });
    const deg = barStatus({ workspace: 'home', bar: unresolved, loading: false, failure: null });
    expect(deg).toMatchObject({ state: 'degraded', consequentialFrozen: true, maySwitch: true });
    expect(consequentialAllowed(deg)).toEqual({ allowed: false, reason: expect.stringMatching(/1 dimension\(s\) unresolved: objective closed/) });
    expect(barStatus({ workspace: 'home', bar: set, loading: false, failure: { status: 403, message: 'HTTP 403 EYE-AUT-001 — no qualifying role' } })).toMatchObject({ state: 'unavailable', consequentialFrozen: true, maySwitch: false });
    expect(barStatus({ workspace: 'home', bar: null, loading: false, failure: { status: 503, message: 'HTTP 503' } })).toMatchObject({ state: 'error', consequentialFrozen: true });
    expect(consequentialAllowed(barStatus({ workspace: 'home', bar: set, loading: false, failure: null }))).toEqual({ allowed: true, reason: null });
    expect(barStatus({ workspace: 'home', bar: { ...set, may_set: false }, loading: false, failure: null }).maySwitch).toBe(false);
  });
});

describe('the switch: preview, then the deliberate commit (PAT-02, UX-10-003)', () => {
  it('the proposal starts from the current context; the diff names what the person changed; the same switch is recognised', () => {
    expect(proposalFrom(none)).toEqual({ objectiveId: null, horizon: '90d', scenarioId: null, classification: 'internal', effectiveAt: null });
    expect(diffDimensions(none, proposalFrom(none))).toEqual(['classification']);
    expect(diffDimensions(set, switchTo)).toEqual(['objective', 'scenario']);
    expect(diffDimensions(set, { ...proposalFrom(set), effectiveAt: '2026-10-01T00:00:00Z' })).toEqual(['effective_at']);
    expect(sameProposal(switchTo, { ...switchTo })).toBe(true);
    expect(sameProposal({ ...switchTo, effectiveAt: '2026-10-01T00:00:00Z' }, { ...switchTo, effectiveAt: '2026-10-01T00:00:00.000Z' })).toBe(true);
    expect(sameProposal(switchTo, { ...switchTo, horizon: '30d' })).toBe(false);
  });
  it('a stale choice is said (and the server refuses it)', () => {
    expect(staleChoice(set, { ...switchTo, objectiveId: OBJ2 })).toBe('the objective "Hold the Hamburg buffer" is closed; a stale objective cannot be set');
    expect(staleChoice(set, { ...switchTo, scenarioId: SCN2 })).toBe('the scenario "An old scenario" is closed; a stale scenario cannot be set');
    expect(staleChoice(set, switchTo)).toBeNull();
  });
  it('the commit gate: never without a preview of exactly the choice on screen; not stale; not unchanged; not without the role', () => {
    expect(commitGate({ preview: null, previewedFor: null, onScreen: switchTo, maySet: true })).toEqual({ allowed: false, reason: 'preview the switch first — a context is never switched silently' });
    expect(commitGate({ preview: preview(), previewedFor: switchTo, onScreen: { ...switchTo, horizon: '30d' }, maySet: true }).reason).toBe('the choice changed since the preview — preview it again');
    expect(commitGate({ preview: preview({ stale: [{ dimension: 'scenario', id: SCN2, reason: 'context rejected (stale): scenario x is closed' }] }), previewedFor: switchTo, onScreen: switchTo, maySet: true }))
      .toEqual({ allowed: false, reason: 'context rejected (stale): scenario x is closed' });
    expect(commitGate({ preview: preview({ unchanged: true, changed: [] }), previewedFor: switchTo, onScreen: switchTo, maySet: true }).reason).toBe('this is the current context; nothing to switch');
    expect(commitGate({ preview: preview(), previewedFor: switchTo, onScreen: switchTo, maySet: false }).allowed).toBe(false);
    expect(commitGate({ preview: preview(), previewedFor: switchTo, onScreen: switchTo, maySet: true })).toEqual({ allowed: true, reason: null });
  });
  it('the payload is exactly the previewed switch with its basis, its digest and the invalidated client-held previews', () => {
    expect(commitPayload(switchTo, preview(), ['decision-preview:p1'])).toEqual({ ...switchTo, basisContextId: 'c2', impactDigest: '9'.repeat(64), invalidated: ['decision-preview:p1'] });
    expect(commitPayload(switchTo, preview({ basis: null }), []).basisContextId).toBeNull();
  });
  it('the preview in words: the changed dimensions, the open work KEPT, the approvals UNAFFECTED', () => {
    expect(changedLines(preview())).toEqual(['objective: Keep the Regensburg line supplied through Q1 → the whole domain', 'scenario: no scenario → Bab el-Mandeb closure (SYNTHETIC)']);
    const a = affectedLines(preview());
    expect(a.find((x) => x.key === 'drafts')).toMatchObject({ count: 1, effect: expect.stringMatching(/^kept/) });
    expect(a.find((x) => x.key === 'approvals')).toMatchObject({ count: 1, effect: 'UNAFFECTED — each binds the version digest it read' });
    expect(a.find((x) => x.key === 'home')).toMatchObject({ count: 8, effect: 'recomposed under the new context' });
  });
  it('the effective time typed in the person\'s local wall time becomes an instant; blank is live', () => {
    expect(localToInstant('')).toBeNull();
    expect(localToInstant('2026-10-01T08:30')).toBe(new Date('2026-10-01T08:30').toISOString());
    expect(localToInstant('not a time')).toBeNull();
  });
});

describe('the client-preview invalidation registry (UX-10-004)', () => {
  it('a switch INVALIDATES every preview and pending command bound to another context; a query / selection is kept or discarded explicitly; nothing applied before the receipt', () => {
    const r = createPreviewRegistry();
    const dropped: string[][] = [];
    r.onDropped((k) => dropped.push(k));
    const off = r.register({ key: 'decision-preview:p1', label: 'the commit preview of package p1', kind: 'preview', contextKey: DIG });
    r.register({ key: 'command:approve-p2', label: 'approve p2 (pending)', kind: 'command', contextKey: DIG });
    r.register({ key: 'query:sources', label: 'the sources filter "Red Sea"', kind: 'query', contextKey: DIG });
    r.register({ key: 'selection:sources', label: '3 sources selected', kind: 'selection', contextKey: DIG });
    r.register({ key: 'preview:new', label: 'a preview under the new context', kind: 'preview', contextKey: 'e'.repeat(64) });
    const plan = r.plan('e'.repeat(64));
    expect(plan.invalidated.map((i) => i.key)).toEqual(['command:approve-p2', 'decision-preview:p1']);
    expect(plan.choosable.map((i) => i.key)).toEqual(['query:sources', 'selection:sources']);
    expect(plan.unaffected.map((i) => i.key)).toEqual(['preview:new']);
    expect(r.list()).toHaveLength(5); // planning changes nothing
    const out = r.apply('e'.repeat(64), { 'selection:sources': 'discard' });
    expect(out).toEqual(['command:approve-p2', 'decision-preview:p1', 'selection:sources']);
    expect(dropped).toEqual([out]);
    expect(r.list().map((i) => [i.key, i.contextKey])).toEqual([['preview:new', 'e'.repeat(64)], ['query:sources', 'e'.repeat(64)]]);
    off(); // an already-dropped item's unregister is a no-op
    expect(r.list()).toHaveLength(2);
    expect(r.plan('e'.repeat(64))).toEqual({ invalidated: [], choosable: [], unaffected: r.list() });
  });
  it('the channel announces a committed switch to the page\'s other consumers', () => {
    const ch = createContextChannel();
    const seen: string[] = [];
    const off = ch.subscribe((c) => seen.push(c.digest));
    ch.publish({ tenantId: T, domainId: D, contextId: 'c3', digest: 'e'.repeat(64), version: 3, receipt: { policyDecisionId: 'pol', auditSeq: 1 } });
    off();
    ch.publish({ tenantId: T, domainId: D, contextId: 'c4', digest: 'f'.repeat(64), version: 4, receipt: { policyDecisionId: 'pol', auditSeq: 2 } });
    expect(seen).toEqual(['e'.repeat(64)]);
  });
});
