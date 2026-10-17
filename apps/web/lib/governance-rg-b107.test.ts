import { describe, expect, it } from 'vitest';
import {
  buildTree, dayText, exceptionText, fixtureEligibility, holdText, impactConsequence, impactGroups, latestOnly, lifecycleText, reviewEligibility, shortDigest, sourceStateText,
  verificationText, type WalkNode,
} from './governance-rg-b107';

/** CP-6 B107 §RG (0115_b107_x_rg): the registries page WORDS the server's record — orphans, holds, staleness and eligibility are the server's. SYNTHETIC. */
const node = (id: string, via: string, depth: number, key = id, extra: Partial<WalkNode> = {}): WalkNode =>
  ({ depth, artifact_id: id, kind: 'requirement', key, title: key, version: 1, lifecycle: 'active', authority_class: 'engineering', relation: 'part_of', via, link_id: `l-${id}`, stale: false, ...extra });

describe('states are visibly distinct; a DATE is the day it names; digests are shortened, never altered', () => {
  it('source, lifecycle and hold states', () => {
    expect(sourceStateText('in_sync')).toMatch(/^IN SYNC/);
    expect(sourceStateText('drifted')).toMatch(/^DRIFTED — the repository changed/);
    expect(sourceStateText('never_imported')).toMatch(/^NEVER IMPORTED/);
    expect(lifecycleText('proposed')).toBe('PROPOSED — not in force');
    expect(lifecycleText('superseded')).toMatch(/resolvable/);
    expect(lifecycleText('quarantined')).toMatch(/no evidence may use it/);
    expect(holdText({ reason_kind: 'evidence_stale', reason: 'the contract changed', lifted_at: null })).toBe('HELD (evidence_stale) — the contract changed');
    expect(holdText({ reason_kind: 'evidence_stale', reason: 'x', lifted_at: '2026-10-15T10:00:00Z', lift_reason: 're-run' })).toBe('LIFTED 2026-10-15T10:00:00Z — re-run');
  });
  it('dates and digests', () => {
    expect(dayText('2026-09-30')).toBe('2026-09-30');
    expect(dayText('2026-09-30T00:00:00.000Z')).toBe('2026-09-30');
    const d = 'a'.repeat(60) + 'beef';
    expect(shortDigest(d)).toBe(`${'a'.repeat(12)}…beef`);
    expect(shortDigest('short')).toBe('short');
  });
  it('an expired engineering exception is REPORTED, never closed', () => {
    expect(exceptionText({ expired: true, expiry_date: '2026-09-30', status: 'open' })).toMatch(/^EXPIRED on 2026-09-30 \(status open\) — reported, not closed/);
    expect(exceptionText({ expired: false, expiry_date: '2026-10-31', status: 'open' })).toBe('open · expires 2026-10-31');
  });
  it('a verification record\'s standing as stated', () => {
    expect(verificationText({ result: 'passed', invalidated: true, expired: false, reviews: [], claim: 'construction' })).toBe(
      'PASSED · INVALIDATED — its fixture was quarantined; re-run the tests · not reviewed · claim: construction');
    expect(verificationText({ result: 'unstated', expired: true, valid_until: '2026-10-01', reviews: [{ decision: 'accepted', reviewer: 'A (SYNTHETIC)' }], claim: 'demonstration' })).toMatch(
      /^UNSTATED · EXPIRED on 2026-10-01 · reviewed: accepted by A \(SYNTHETIC\)/);
  });
});

describe('the trace tree and the impact groups follow the server\'s order', () => {
  it('builds the tree through `via`, never revisiting a node', () => {
    const t = buildTree([node('a', 'root', 1), node('b', 'a', 2), node('c', 'root', 1), node('root', 'b', 3)], 'root');
    expect(t.map((x) => x.node.artifact_id)).toEqual(['a', 'c']);
    expect(t[0]!.children.map((x) => x.node.artifact_id)).toEqual(['b']);
    expect(t[0]!.children[0]!.children).toEqual([]);
  });
  it('groups dependents by kind in order', () => {
    const g = impactGroups({ dependents: [node('x', 'r', 1, 'CMP-1', { kind: 'component' }), node('y', 'r', 1, 'b:1', { kind: 'data_product' }), node('z', 'x', 2, 'T-1', { kind: 'test' }), node('w', 'x', 2, 'C-2', { kind: 'component' })] });
    expect(g.map((x) => [x.kind, x.items.length])).toEqual([['component', 2], ['data_product', 1], ['test', 1]]);
  });
  it('the consequence preview: a proposal holds nothing; a change names the candidates it holds', () => {
    const imp = { digest: 'f'.repeat(64), release_candidates: [{ key: 'rc-1' }], stale_verifications: [{ kind: 'test' }, { kind: 'evidence' }] };
    expect(impactConsequence(imp, 'proposal')[1]).toMatch(/^A PROPOSAL: nothing is held/);
    expect(impactConsequence(imp, 'change')[1]).toBe('A CHANGE: HOLDS rc-1 (evidence_stale) until the 1 stale test(s) are re-run and current.');
    expect(impactConsequence({ ...imp, release_candidates: [] }, 'change')[1]).toMatch(/nothing is held/);
  });
  it('only the newest response to a selection is applied', () => {
    const g = latestOnly(); const a = g.next(); const b = g.next();
    expect(g.isLatest(a)).toBe(false); expect(g.isLatest(b)).toBe(true);
  });
});

describe('eligibility is shown — the server decides', () => {
  const me = { principalId: 'p-1', roles: ['independent_assurance@PLATFORM'] };
  it('a review: the role, never the ingester, never the runner', () => {
    expect(reviewEligibility({ ingested_by: 'p-2', execution: {} }, me).eligible).toBe(true);
    expect(reviewEligibility({ ingested_by: 'p-1', execution: {} }, me)).toEqual({ eligible: false, reason: 'you ingested this record — the review is never the ingester\'s' });
    expect(reviewEligibility({ ingested_by: 'p-2', execution: { runner_principal: 'p-1' } }, me).eligible).toBe(false);
    expect(reviewEligibility({ ingested_by: 'p-2' }, { principalId: 'p-1', roles: ['conformance_steward@PLATFORM'] }).reason).toMatch(/independent assurance/);
  });
  it('a fixture approval: only a proposed, unexpired version; never a builder', () => {
    const f = { lifecycle: 'proposed', expired: false, attributes: { builders: ['p-9'] }, decisions: [{ decision: 'registered', actor_id: 'p-8' }] };
    expect(fixtureEligibility(f, me).eligible).toBe(true);
    expect(fixtureEligibility({ ...f, lifecycle: 'active' }, me).reason).toMatch(/only a proposed version/);
    expect(fixtureEligibility({ ...f, expired: true }, me).reason).toMatch(/expired/);
    expect(fixtureEligibility(f, { ...me, principalId: 'p-8' }).reason).toMatch(/never a builder/);
    expect(fixtureEligibility(f, { ...me, principalId: 'p-9' }).eligible).toBe(false);
  });
});
