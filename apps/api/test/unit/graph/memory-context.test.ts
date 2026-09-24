/**
 * The context query's product state at the function boundary (CP-6 B23, 0084; L3-I02 RetrieveContext): the PURE part —
 * `omissionsOf` (the withheld links summed over the SERVED items only, the unverified and content-absent rows, nothing for a
 * complete answer), `productStateOf` (partial when something is left out and named; stale when nothing is and the condition is
 * lagging / unverified / withdrawn; complete otherwise — with the code and the label from the flags), the reasons BYTE FOR BYTE,
 * CONTEXT_PARTITIONS (outside the twelve B20 routes), and the refusal row (`memory context rejected: …` → 422 with the port's
 * text, caught by no earlier row). No database: the B23 harness proves the same on live rows.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { CONTEXT_PARTITIONS, PROJECTIONS, ROUTE_PARTITIONS, blockOf, type ProjectionName } from '../../../src/graph/projections/projection-state.js';
import {
  CONTEXT_POLICY_NOTE, contentAbsentReason, contentUnavailableReason, omissionsOf, productStateOf, unverifiedRowsReason, withheldLinksReason,
} from '../../../src/graph/memory/context.js';
import { asObservationRefusal } from '../../../src/observation/observation-errors.js';

const SUB = '0190b1c2-d3e4-7000-8000-000000000001';
const CHECK = '0190b1c2-d3e4-7000-8000-000000000002';
const AT = new Date('2026-09-25T09:00:00.000Z');
const SINCE = new Date('2026-09-25T08:30:00.000Z');
function row(projection: ProjectionName, over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    projection, state: 'serving', condition: 'current',
    revision_seq: '40', verified_seq: '40', verified_at: AT, verified_check_id: CHECK, checkpoint_seq: '40',
    lag_events: '0', unresolved_deliveries: '0', subscription_id: SUB, subscription_status: 'active',
    withdrawn_at: null, withdrawn_by: null, withdrawn_reason: null, withdrawn_by_check: null,
    representation_version: '1', representation_current: '1', representation_ok: true, last_rebuild_id: null, rebuilt_at: null,
    last_check_id: CHECK, last_check_at: AT, last_check: null, ...over,
  };
}
const withdrawn = { state: 'withdrawn', condition: 'withdrawn', withdrawn_at: SINCE, withdrawn_by: SUB, withdrawn_reason: 'suspected by the operator' };
const block = (per: Partial<Record<ProjectionName, Record<string, unknown>>> = {}, domain: Record<string, unknown> = {}) =>
  blockOf(PROJECTIONS.map((p) => row(p, { ...domain, ...(per[p] ?? {}) })), CONTEXT_PARTITIONS);

describe('B23 · CONTEXT_PARTITIONS', () => {
  it('the memory, edges and entities partitions — kept outside the twelve B20 routes', () => {
    expect([...CONTEXT_PARTITIONS]).toEqual(['memory_items_current', 'edges_current', 'entities_current']);
    expect(Object.keys(ROUTE_PARTITIONS)).not.toContain('memoryContext');
    expect(Object.keys(ROUTE_PARTITIONS)).toHaveLength(12);
  });
});

describe('B23 · omissionsOf', () => {
  it('nothing left out on a serving domain', () => {
    expect(omissionsOf(block(), [{ withheld_links: { edges_current: 0, entities_current: 0 } }], { unverified_rows: 0, content_absent_rows: 0 })).toEqual([]);
  });
  it('the withheld links summed over the SERVED items only, named with the withdrawal and the rebuild route', () => {
    const b = block({ edges_current: withdrawn });
    const out = omissionsOf(b, [{ withheld_links: { edges_current: 1, entities_current: 0 } }, { withheld_links: { edges_current: 2, entities_current: 0 } }], {});
    expect(out).toEqual([{ projection: 'edges_current', rows: 3,
      reason: `3 explanation link(s) to graph edges are left out: the edges_current projection of this domain is withdrawn since ${SINCE.toISOString()} (suspected by the operator) and cannot vouch for them until it is rebuilt (POST …/graph/projections/edges_current/rebuild (graph.projection.rebuild))` }]);
  });
  it('the unverified rows and the content-absent rows, in that order, before the links', () => {
    const b = block({ memory_items_current: withdrawn, entities_current: withdrawn });
    const out = omissionsOf(b, [{ withheld_links: { edges_current: 0, entities_current: 1 } }], { unverified_rows: '2', content_absent_rows: 1 });
    expect(out.map((o) => [o.projection, o.rows])).toEqual([['memory_items_current', 2], ['content_tier', 1], ['entities_current', 1]]);
    expect(out[0]!.reason).toBe(unverifiedRowsReason(b.partitions[0], 2));
    expect(out[1]!.reason).toBe(contentAbsentReason(1));
    expect(out[2]!.reason).toBe(withheldLinksReason('entities_current', b.partitions[2], 1));
  });
});

describe('B23 · productStateOf', () => {
  it('complete: current and nothing left out — no code, no label', () => {
    expect(productStateOf(block(), [])).toEqual({ product_state: 'complete', code: null, label: null });
  });
  it('stale: lagging with nothing left out — EYE-DEG-001 and the block\'s label', () => {
    const b = block({}, { condition: 'lagging', lag_events: '1', revision_seq: '41' });
    expect(b.condition).toBe('lagging');
    const s = productStateOf(b, []);
    expect(s).toMatchObject({ product_state: 'stale', code: 'EYE-DEG-001' });
    expect(s.label).toBe(`stale: ${b.label}`);
  });
  it('stale: unverified (no subscription) — the watermark is unknown and said so', () => {
    const b = block({}, { condition: 'unverified', subscription_id: null, verified_seq: null });
    expect(productStateOf(b, []).label).toBe('stale: no live retrieval subscription verifies this domain\'s projections; the projection watermark is unknown');
  });
  it('stale: withdrawn with nothing left out (served from the log, labelled)', () => {
    const b = block({ memory_items_current: withdrawn });
    expect(productStateOf(b, [])).toMatchObject({ product_state: 'stale', code: 'EYE-DEG-001' });
  });
  it('partial: something left out and named — the reasons first, the block\'s label after', () => {
    const b = block({ edges_current: withdrawn });
    const omitted = omissionsOf(b, [{ withheld_links: { edges_current: 1, entities_current: 0 } }], {});
    const s = productStateOf(b, omitted);
    expect(s).toMatchObject({ product_state: 'partial', code: 'EYE-DEG-001' });
    expect(s.label).toBe(`partial: ${omitted[0]!.reason} — ${b.label}`);
  });
  it('partial on a current domain when the content tier did not answer (the item set left out whole)', () => {
    const omitted = [{ projection: 'content_tier' as const, reason: contentUnavailableReason('injected fault at b20.memory_content_unavailable', false), rows: null }];
    expect(productStateOf(block(), omitted)).toEqual({ product_state: 'partial', code: 'EYE-DEG-001',
      label: 'partial: the memory items are not served: the content tier did not answer (injected fault at b20.memory_content_unavailable); an item is served with its version or not at all — retry when the content tier answers' });
    expect(contentUnavailableReason('x', true)).toBe('the memory items are not served: the content tier did not answer (x) while the memory_items_current projection of this domain is withdrawn; an item is served with its version or not at all — retry when the content tier answers');
  });
  it('the policy note never counts', () => {
    expect(CONTEXT_POLICY_NOTE).not.toMatch(/[0-9]/);
  });
});

describe('B23 · the refusal row', () => {
  it('the port\'s 22023 texts answer 422 with the port\'s own message; no earlier row catches them', () => {
    for (const text of [
      'memory context rejected: a purpose is declared (the context is retrieved for an explicit purpose; the envelope\'s purpose_id is empty)',
      'memory context rejected: the subject names {kind, id} — kind one of entity, claim, edge, strategy, evidence, warning, forecast; id an object id',
      'memory context rejected: the scan bound is 1..500 (not 0)',
      'memory context rejected: the withdrawn partitions are named among the six projections (not x)',
    ]) {
      const e = asObservationRefusal(Object.assign(new Error(text), { code: '22023' }), 'c');
      expect(e).toBeInstanceOf(HttpException);
      expect(e!.getStatus(), text).toBe(422);
      expect((e!.getResponse() as { message?: string }).message).toBe(text);
    }
  });
});
