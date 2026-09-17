/**
 * TwinStateChanged@v1 at the function boundary (CP-6 B18; design §2.4, D4, D20): the variables that changed between two
 * element sets (added, removed, changed; an unchanged carry is silent; a first version adds everything), and the two
 * changes the builder announces — version.admitted from the admit route with the dependency impacts, version.unverified
 * from the twins consumer with its cause — pinned key by key on uuid fixtures, with the 200 ceiling and `truncated` said.
 * No database: what the B18 harness proves on a live admission, this holds on the builder.
 */
import { describe, expect, it } from 'vitest';
import { LIFECYCLE_EVENT_LIST_MAX } from '../../../src/graph/subscriptions/change-events.js';
import { changedVariablesOf, twinStateChangedEvent, type ElementRow } from '../../../src/twin/twins/twin-events.js';

let counter = 0;
/** A deterministic uuid-shaped id for fixtures (the product mints uuidv7; the shape is what matters here). */
const uid = (): string => { counter += 1; const h = counter.toString(16).padStart(12, '0'); return `0190b1c2-d3e4-7000-8000-${h}`; };
const TWIN = uid(); const ACTOR = uid(); const RUN_A = uid(); const RUN_B = uid(); const GW = uid();
const AT = '2026-09-17T10:00:00.000Z';

const el = (over: Partial<ElementRow> & { key: string }): ElementRow => ({
  kind: 'observed', value: 1, unit: 'units', valid_from: '2024-01-10', confidence: null, health: 'complete', citations: [], ...over,
});

describe('B18 · changedVariablesOf', () => {
  it('a first version (no prior) adds every element, in key order', () => {
    const out = changedVariablesOf(null, [el({ key: 'b.two', value: 2 }), el({ key: 'a.one', confidence: 0.8, citations: [{ kind: 'evidence' }] })]);
    expect(out.map((v) => v.key)).toEqual(['a.one', 'b.two']);
    expect(out[0]).toEqual({ key: 'a.one', kind: 'observed', change: 'added', from: null, to: { value: 1, unit: 'units', valid_from: '2024-01-10' }, confidence: 0.8, citations: 1 });
    expect(out[1]).toMatchObject({ change: 'added', from: null, to: { value: 2 }, confidence: null, citations: 0 });
  });
  it('added, removed and changed against a prior set; an element carried unchanged is not listed', () => {
    const prior = [el({ key: 'carried' }), el({ key: 'gone', kind: 'assumed', value: 'x', confidence: 0.5, citations: [{}, {}] }), el({ key: 'moved', value: 10 }), el({ key: 'reunit', unit: 'kg' }), el({ key: 'redated', valid_from: '2024-01-01' })];
    const next = [el({ key: 'carried' }), el({ key: 'moved', value: 12, confidence: 0.9 }), el({ key: 'reunit', unit: 't' }), el({ key: 'redated', valid_from: '2024-01-05' }), el({ key: 'context.transits_forecast', kind: 'predicted', value: { horizon: '30d' }, citations: [{ kind: 'forecast' }] })];
    const out = changedVariablesOf(prior, next);
    expect(out.map((v) => [v.key, v.change])).toEqual([['context.transits_forecast', 'added'], ['gone', 'removed'], ['moved', 'changed'], ['redated', 'changed'], ['reunit', 'changed']]);
    expect(out.find((v) => v.key === 'gone')).toEqual({ key: 'gone', kind: 'assumed', change: 'removed', from: { value: 'x', unit: 'units', valid_from: '2024-01-10' }, to: null, confidence: 0.5, citations: 2 });
    expect(out.find((v) => v.key === 'moved')).toMatchObject({ from: { value: 10 }, to: { value: 12 }, confidence: 0.9 });
    expect(out.find((v) => v.key === 'reunit')).toMatchObject({ from: { unit: 'kg' }, to: { unit: 't' } });
    expect(out.find((v) => v.key === 'redated')).toMatchObject({ from: { valid_from: '2024-01-01' }, to: { valid_from: '2024-01-05' } });
    expect(out.find((v) => v.key === 'context.transits_forecast')).toMatchObject({ kind: 'predicted', change: 'added', citations: 1 });
  });
  it('a structurally equal object value is unchanged; a changed nested field is a change', () => {
    expect(changedVariablesOf([el({ key: 'k', value: { a: 1, b: [1, 2] } })], [el({ key: 'k', value: { a: 1, b: [1, 2] } })])).toEqual([]);
    expect(changedVariablesOf([el({ key: 'k', value: { a: 1 } })], [el({ key: 'k', value: { a: 2 } })])).toHaveLength(1);
  });
});

describe('B18 · twinStateChangedEvent', () => {
  const base = () => ({
    twinId: TWIN, version: 2, branchId: 'actual', supersedes: 1, forkedFromVersion: null, stateSetDigest: 'a'.repeat(64), headerDigest: 'b'.repeat(64),
    completeness: 'complete', missingKeys: [] as string[], syntheticState: true, knownAt: '2024-01-17T12:00:00.000Z', observedThrough: '2024-01-17',
    actor: ACTOR, occurredAt: AT,
  });
  it('version.admitted from the admit route: the change, the freshness, the confidence list, the dependency impacts, the cause on the twin', () => {
    const changed = changedVariablesOf([el({ key: 'a' })], [el({ key: 'a' }), el({ key: 'context.transits_forecast', kind: 'predicted', value: { horizon: '30d' }, confidence: 0.7, citations: [{ kind: 'forecast' }] })]);
    const row = twinStateChangedEvent({
      ...base(), change: 'version.admitted', verificationState: 'verified', changedVariables: changed,
      dependencyImpacts: { runs: [{ run_id: RUN_A, state: 'completed', validity: 'valid' }, { run_id: RUN_B, state: 'completed', validity: 'invalidated' }], truncated: false },
      reason: null, causedBy: null, action: 'twin.version.admit',
    });
    expect(row.eventType).toBe('TwinStateChanged');
    expect(row.payload).toEqual({
      schema: 'TwinStateChanged', schema_version: 'v1',
      twin_id: TWIN, version: 2, branch_id: 'actual', supersedes: 1, forked_from_version: null, change: 'version.admitted',
      state_set_digest: 'a'.repeat(64), header_digest: 'b'.repeat(64), verification_state: 'verified',
      changed_variables: [{ key: 'context.transits_forecast', kind: 'predicted', change: 'added', from: null, to: { value: { horizon: '30d' }, unit: 'units', valid_from: '2024-01-10' }, confidence: 0.7, citations: 1 }],
      confidence: [{ key: 'context.transits_forecast', confidence: 0.7 }],
      freshness: { known_at: '2024-01-17T12:00:00.000Z', observed_through: '2024-01-17', completeness: 'complete', missing_keys: [] },
      dependency_impacts: { runs: [{ run_id: RUN_A, state: 'completed', validity: 'valid' }, { run_id: RUN_B, state: 'completed', validity: 'invalidated' }], truncated: false },
      reason: null, caused_by: null, truncated: false,
      temporal: { known_at: AT },
      cause: { action: 'twin.version.admit', actor: ACTOR, target_type: 'TWN', target_id: TWIN },
    });
  });
  it('version.unverified from the twins consumer: no variables, no impacts, the mark\'s reason and the GraphChanged that caused it', () => {
    const row = twinStateChangedEvent({
      ...base(), change: 'version.unverified', verificationState: 'unverified', changedVariables: [], dependencyImpacts: null,
      reason: 'GraphChanged/forecast.withdrawn (outbox x): a cited object or a boundary entity changed; the version must be re-verified',
      causedBy: { outbox_event_id: GW, change_kind: 'forecast.withdrawn' }, action: 'twin.subscription.apply',
    });
    expect(row.payload).toMatchObject({
      change: 'version.unverified', verification_state: 'unverified', changed_variables: [], confidence: [], dependency_impacts: null,
      reason: expect.stringMatching(/^GraphChanged\/forecast\.withdrawn/), caused_by: { outbox_event_id: GW, change_kind: 'forecast.withdrawn' }, truncated: false,
      cause: { action: 'twin.subscription.apply', actor: ACTOR, target_type: 'TWN', target_id: TWIN },
    });
  });
  it('the ceiling: 250 changed variables → 200 listed, the confidence list cut with them, truncated said', () => {
    const next = Array.from({ length: 250 }, (_, i) => el({ key: `k.${String(i).padStart(3, '0')}`, confidence: 0.5 }));
    const changed = changedVariablesOf(null, next);
    expect(changed).toHaveLength(250);
    const p = twinStateChangedEvent({ ...base(), change: 'version.admitted', verificationState: 'verified', changedVariables: changed, dependencyImpacts: { runs: [], truncated: false }, reason: null, causedBy: null, action: 'twin.version.admit' }).payload;
    expect(LIFECYCLE_EVENT_LIST_MAX).toBe(200);
    expect(p['changed_variables']).toHaveLength(200);
    expect(p['confidence']).toHaveLength(200);
    expect(p['truncated']).toBe(true);
  });
});
