import { describe, expect, it } from 'vitest';
import { PROJECTION_NAMES, projectionNote, searchBoundNote, type ProjectionBlock, type SearchResult } from './graph';

/**
 * The rule this pins (CP-6 B20, 0080): a screen renders the state of a projection FROM THE FLAG — `condition` decides,
 * the server's label is the wording, and a non-current state without a label is still said — and the search's
 * completeness from `complete`, never from whether a note came. A current block, or no block, says nothing.
 */
const block = (over: Partial<ProjectionBlock> = {}): ProjectionBlock => ({
  revision: 12, verified_seq: 12, verified_at: '2026-09-17T07:00:00.000Z', verified_check_id: 'c1', checkpoint_seq: 12,
  lag_events: 0, unresolved_deliveries: 0, subscription: { subscription_id: 's1', status: 'active' },
  partitions: [], condition: 'current', degraded: false, code: null, label: null, withdrawn: [], domain_withdrawn: [], ...over,
});
const UNVERIFIED = 'no live retrieval subscription verifies this domain\'s projections; the projection watermark is unknown';

describe('the projection block on a screen (B20)', () => {
  it('the six partition names are the fixed six, in order', () => {
    expect([...PROJECTION_NAMES]).toEqual(['entities_current', 'resolutions_current', 'edges_current', 'strategy_current', 'invalidations_current', 'memory_items_current']);
  });

  it('projectionNote: nothing for a current block or no block; the flag decides, the label is the wording', () => {
    expect(projectionNote(null)).toBeNull();
    expect(projectionNote(undefined)).toBeNull();
    expect(projectionNote(block())).toBeNull();
    // a current block that (wrongly) carries a label still says nothing: the flag decides
    expect(projectionNote(block({ label: 'stray' }))).toBeNull();
    expect(projectionNote(block({ condition: 'unverified', verified_seq: null, label: UNVERIFIED, subscription: { subscription_id: null, status: null } })))
      .toEqual({ condition: 'unverified', text: UNVERIFIED, code: null, degraded: false });
    expect(projectionNote(block({ condition: 'lagging', lag_events: 2, label: 'verified through revision 12 (at 2026-09-17T07:00:00.000Z); 2 change(s) since are not yet verified by the retrieval subscriber — the ports write a projection and its log in one transaction, so this is verification lag, not data lag' })))
      .toMatchObject({ condition: 'lagging', code: null, degraded: false });
  });

  it('projectionNote: a withdrawn block is degraded with its declared code; a non-current state without a label is never silent', () => {
    const withdrawn = block({ condition: 'withdrawn', degraded: true, code: 'EYE-DEG-001', withdrawn: ['entities_current'], domain_withdrawn: ['entities_current'],
      label: 'the entities_current projection of this domain is withdrawn since 2026-09-17T07:00:00.000Z (a suspicion); this answer is derived from the event log — the last valid state — and is labelled; it resumes from the projection when it is rebuilt (POST …/graph/projections/entities_current/rebuild (graph.projection.rebuild))' });
    expect(projectionNote(withdrawn)).toEqual({ condition: 'withdrawn', text: withdrawn.label, code: 'EYE-DEG-001', degraded: true });
    // the fallback wording when the server sent no label; a degraded block without its code still declares EYE-DEG-001
    expect(projectionNote(block({ condition: 'lagging', lag_events: 1 }))).toEqual({ condition: 'lagging', text: 'the projection state is not current', code: null, degraded: false });
    expect(projectionNote(block({ condition: 'withdrawn', degraded: true }))).toEqual({ condition: 'withdrawn', text: 'the projection state is not current', code: 'EYE-DEG-001', degraded: true });
  });

  it('searchBoundNote: from the flags — nothing while both scans are complete, the server\'s note when one is bounded, a fallback without a note', () => {
    const result = (over: Partial<SearchResult>): Pick<SearchResult, 'complete' | 'note' | 'bounds'> =>
      ({ complete: { entities: true, objects: true }, bounds: { entities: 1_000, objects: 2_000 }, note: null, ...over });
    expect(searchBoundNote(null)).toBeNull();
    expect(searchBoundNote(result({}))).toBeNull();
    // a stray note on a complete answer says nothing: the flag decides
    expect(searchBoundNote(result({ note: 'stray' }))).toBeNull();
    const note = 'the entity scan is bounded at 1,000 rows and the object scan at the 2,000 newest; a match beyond a bound is not returned';
    expect(searchBoundNote(result({ complete: { entities: false, objects: true }, note }))).toBe(note);
    expect(searchBoundNote(result({ complete: { entities: true, objects: false }, note: null }))).toBe(note);
    expect(searchBoundNote(result({ complete: { entities: false, objects: false }, note: null, bounds: { entities: 500, objects: 1_500 } })))
      .toBe('the entity scan is bounded at 500 rows and the object scan at the 1,500 newest; a match beyond a bound is not returned');
  });
});
