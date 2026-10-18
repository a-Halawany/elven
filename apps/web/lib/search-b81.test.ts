/**
 * CP-6 B81 §SI — the FEDERATED SEARCH's pure adapters (UX-13-001, UX-13-002, UX-13-005; UX-13-006's PERMISSION TRIMMING fixture), the saved
 * search's intake and its DRIFT beside the exact saved set (D10 / Q14). Every record here is SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ProjectionBlock, SearchResult, StrategyRow } from './graph';
import { interpret } from './intent-b81';
import {
  LEGS, LEG_KEYS, SEARCH_ACTIONS, catalogLeg, driftOf, exposuresLeg, federate, graphLeg, legsOf, narrowTo, packagesLeg, rankHits, refusedLeg, resultsOf, strategyLeg,
  type SavedResult,
} from './search-b81';
import { partialText } from './degraded-b81';

const WEB = join(__dirname, '..');
const R = (id: string) => ({ policyDecisionId: id, auditSeq: 1 });
const CURRENT = { condition: 'current', withdrawn: [], lag_events: 0, label: null } as unknown as ProjectionBlock;
const search = (over: Partial<SearchResult> = {}): SearchResult => ({
  query: 'Bab el-Mandeb', normalized: 'bab el-mandeb', claims: [], evidence: [], total: 1, scope_note: 'within what you may see',
  entities: [{ kind: 'entity', id: '0192a000-0000-7000-8000-00000000000e', label: 'Bab el-Mandeb Strait', detail: 'place — active', matched_on: 'canonical name contains the query', recorded_at: null, extra: {} }],
  complete: { entities: true, objects: true }, bounds: { entities: 1000, objects: 2000 }, note: null, projection: CURRENT, ...over,
} as SearchResult);
const strat = (t: string, title: string, id: string, v = 1): StrategyRow =>
  ({ strategy_object_id: id, object_type: t, object_version: v, title, statement: `${title} (SYNTHETIC)`, status: 'active', verification_state: 'unverified', verification_reason: null, declared_at: '', updated_at: '' } as StrategyRow);
const STRATEGY = [strat('OBJ', 'Keep the Regensburg line supplied through Q1', 'o1'), strat('CAP', 'Regensburg assembly', 'c1'), strat('STK', 'Regensburg line workforce', 's1'), strat('OBJ', 'On-time delivery 95%', 'o2')];
const PHRASES = ['Bab el-Mandeb', 'Regensburg'];

function nordwerk() {
  return federate([
    graphLeg({ search: search(), receipt: R('r-graph-1') }, 'Bab el-Mandeb'),
    graphLeg({ search: search({ entities: [], total: 0 }), receipt: R('r-graph-2') }, 'Regensburg'),
    strategyLeg({ strategy: STRATEGY, projection: CURRENT, receipt: R('r-strategy') }, PHRASES),
    exposuresLeg({ risks: [{ exposure_id: 'x1', polarity: 'risk', category_key: 'supply', current_version: 3, state: 'assessed', title: 'Corridor closure — Regensburg line', statement: 'the corridor closes' } as never], opportunities: [], receipt: R('r-exp') }, PHRASES),
    { outcome: refusedLeg('catalog', { status: 403, message: 'EYE-AUT-001 the policy does not admit this read' }), hits: [] },
    packagesLeg({ packages: [{ package_id: 'p1', title: 'Corridor reroute via the Cape', statement: 'reroute SYN-SHIP-4472', state: 'proposed', current_version: 2, synthetic_state: true } as never], receipt: R('r-pkg') }, ['corridor reroute']),
  ], PHRASES, '2026-10-19T08:00:00.000Z');
}

describe('the legs: the EXISTING governed reads — never executive.search', () => {
  it('five legs, each a read action of its own; the module issues one read and two personal records of its own', () => {
    expect(LEG_KEYS).toEqual(['graph', 'strategy', 'catalog', 'exposures', 'packages']);
    expect(Object.values(LEGS).map((l) => l.action)).toEqual(['graph.read', 'graph.read', 'products.catalog.search', 'prediction.exposure.read', 'decision.read']);
    const src = readFileSync(join(WEB, 'lib/search-b81.ts'), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/executive\.search|\/home\/search|from '\.\/executive/);
    const actions = [...src.matchAll(/envOf\(s, '([^']+)'/g)].map((m) => m[1]);
    expect(actions.sort()).toEqual([...SEARCH_ACTIONS.reads, ...SEARCH_ACTIONS.personal].sort());
    // the API's leg table is the same (0119 §SI shell.search_legs)
    const sql = readFileSync(join(WEB, '..', 'api', 'migrations', '0119_b81_x_si.sql'), 'utf8');
    for (const k of LEG_KEYS) expect(sql).toMatch(new RegExp(`'${k}',\\s+jsonb_build_object\\('action', '${LEGS[k].action.replace(/\./g, '\\.')}',\\s+'object_type', '${LEGS[k].objectType}'\\)`));
  });
  it('graph: one phrase per read, its hits linked to their object pages; a bounded scan or a lagging projection is PARTIAL from the flags', () => {
    const g = graphLeg({ search: search(), receipt: R('r') }, 'Bab el-Mandeb');
    expect(g.outcome).toMatchObject({ leg: 'graph', phrase: 'Bab el-Mandeb', state: 'complete', receipt: 'r', count: 1 });
    expect(g.hits[0]).toMatchObject({ key: 'ENT:0192a000-0000-7000-8000-00000000000e', href: '/graph/entities?entity=0192a000-0000-7000-8000-00000000000e', opens: 'object' });
    const b = graphLeg({ search: search({ complete: { entities: false, objects: true }, note: 'the entity scan is bounded at 1,000 rows' }), receipt: R('r') }, 'x');
    expect(b.outcome.state).toBe('bounded');
    expect(partialText(b.outcome.partial)?.lines).toContain('Bounded: the entity scan is bounded at 1,000 rows');
    const lag = graphLeg({ search: search({ projection: { condition: 'lagging', withdrawn: [], lag_events: 3, label: 'served while the projection lags' } as unknown as ProjectionBlock }), receipt: R('r') }, 'x');
    expect(lag.outcome.state).toBe('partial');
  });
  it('strategy / exposures / packages: the list read filtered HERE by the phrases (said as such); a withdrawn object never matches', () => {
    const s = strategyLeg({ strategy: [...STRATEGY, { ...strat('OBJ', 'Regensburg withdrawn', 'w1'), status: 'withdrawn' }], projection: CURRENT, receipt: R('r') }, PHRASES);
    expect(s.hits.map((h) => [h.kind, h.label])).toEqual([['objective', 'Keep the Regensburg line supplied through Q1'], ['capability', 'Regensburg assembly'], ['stakeholder', 'Regensburg line workforce']]);
    expect(s.hits[0]!.matchedOn).toBe('the title contains “Regensburg”');
    expect(s.hits[0]!.opens).toBe('list');
  });
  it('PERMISSION TRIMMING: a refused leg is DECLARED in the server\'s words — absent, never hidden or counted; a failure says to run again', () => {
    const r = refusedLeg('catalog', { status: 403, message: 'EYE-AUT-001 the policy does not admit this read' });
    expect(r).toMatchObject({ state: 'refused', receipt: null, note: 'EYE-AUT-001 the policy does not admit this read', count: 0 });
    expect(partialText(r.partial)!.lines.join(' ')).toMatch(/Data catalog \(not searched — the server refused it for you: EYE-AUT-001.*absent, not hidden — nothing is counted for them/);
    expect(refusedLeg('graph', { status: 0, message: 'API unreachable' }).state).toBe('failed');
  });
  it('the catalog\'s own hidden count is said in its words (DAT-TR-01 — the catalog\'s rule, not the federation\'s)', () => {
    const c = catalogLeg({ search: { at: '', q: 'x', clearance: 'internal', kinds: [], total: 0, hidden: 2, hidden_by: { undiscoverable: 1, clearance: 1 }, hits: [] }, receipt: R('r') });
    expect(c.outcome.partial.filters[0]).toMatch(/^the catalog counts 2 entries it does not serve \(1 undiscoverable, 1 above your clearance internal\)/);
  });
});

describe('the federation and the reading over its hits (the demo scene, SYNTHETIC)', () => {
  const f = nordwerk();
  it('one canonical order; the merged declaration names the refused leg; the reading asks which "Regensburg"', () => {
    expect(f.hits.map((h) => `${h.leg}:${h.kind}`)).toEqual(['graph:entity', 'strategy:capability', 'strategy:objective', 'strategy:stakeholder', 'exposures:exposure', 'packages:package']);
    expect(f.partial.complete).toBe(false);
    expect(f.partial.missingSources[0]).toMatch(/^Data catalog \(not searched/);
    const r = interpret('Bab el-Mandeb exposure Regensburg', { mode: 'ask', hits: f.hits });
    expect(r.kind).toBe('ambiguous');
    expect(r.alternatives.map((a) => a.kind)).toEqual(['capability', 'exposure', 'objective', 'stakeholder']);
    const scoped = rankHits(narrowTo(f.hits, r, 'RSK:x1'), r.kinds);
    expect(scoped.scoped.map((h) => h.label)).toEqual(['Corridor closure — Regensburg line']);
    expect(scoped.other.map((h) => h.label)).toEqual(['Bab el-Mandeb Strait', 'Corridor reroute via the Cape']);
    expect(narrowTo(f.hits, r, null)).toEqual(f.hits);
  });
  it('the saved search\'s intake: the result set (leg · kind · id · version · label) and one entry per read — a refused leg once, with no receipt', () => {
    expect(resultsOf(f.hits)[0]).toEqual({ leg: 'graph', kind: 'entity', id: '0192a000-0000-7000-8000-00000000000e', version: null, label: 'Bab el-Mandeb Strait' });
    expect(legsOf(f.legs)).toEqual([
      { leg: 'graph', receipt: 'r-graph-1', state: 'complete', note: null }, { leg: 'graph', receipt: 'r-graph-2', state: 'complete', note: null },
      { leg: 'strategy', receipt: 'r-strategy', state: 'complete', note: null }, { leg: 'exposures', receipt: 'r-exp', state: 'complete', note: null },
      { leg: 'catalog', receipt: null, state: 'refused', note: 'EYE-AUT-001 the policy does not admit this read' }, { leg: 'packages', receipt: 'r-pkg', state: 'complete', note: null }]);
    expect(legsOf([...f.legs, refusedLeg('catalog', { status: 403, message: 'again' })]).filter((l) => l.leg === 'catalog')).toHaveLength(1);
  });
});

describe('D10 / Q14 — the saved search keeps its EXACT result set; the live drift is shown BESIDE it', () => {
  const saved: SavedResult[] = [{ leg: 'strategy', kind: 'objective', id: 'o1', version: 1, label: 'Keep the Regensburg line supplied' }, { leg: 'exposures', kind: 'exposure', id: 'x1', version: 3, label: 'Corridor closure' },
    { leg: 'graph', kind: 'entity', id: 'e1', version: null, label: 'Bab el-Mandeb Strait' }];
  it('the same records and versions — exact', () => {
    expect(driftOf(saved, [...saved].reverse())).toMatchObject({ exact: true, added: [], removed: [], changed: [], unchanged: 3, statement: 'The live re-run returns exactly the saved records and versions.' });
  });
  it('added, no longer returned, at another version — each named; the saved set itself is unchanged', () => {
    const live: SavedResult[] = [{ ...saved[0]!, version: 2 }, saved[2]!, { leg: 'strategy', kind: 'capability', id: 'c1', version: 1, label: 'Regensburg assembly' }];
    const d = driftOf(saved, live);
    expect(d.exact).toBe(false);
    expect(d.added.map((r) => r.id)).toEqual(['c1']);
    expect(d.removed.map((r) => r.id)).toEqual(['x1']);
    expect(d.changed).toEqual([{ key: 'strategy|objective|o1', label: 'Keep the Regensburg line supplied', saved: 1, live: 2 }]);
    expect(d.unchanged).toBe(1);
    expect(d.statement).toBe('Since the cutoff: 1 record added, 1 record no longer returned, 1 record at another version — the saved result set below is unchanged.');
    expect(saved.map((r) => r.version)).toEqual([1, 3, null]);
  });
});
