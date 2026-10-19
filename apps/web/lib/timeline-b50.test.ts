/**
 * B50 §TL — the timeline, the as-of explorer and the trace as pure functions (lib/timeline-b50.ts). Every value SYNTHETIC. CONSTRUCTION
 * evidence only: the walk is the demonstration; nothing here is accepted. The model test of PR-22-003: NO read path drops a disclosure —
 * every disclosure kind has a line for any answer, zero or not, and the partial declaration is never complete while one is open.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  AXES, DISCLOSURE_KEYS, RECONCILE_ROLES, REASON_WORDS, STAGES, boundInstant, clockWord, continuityState, disclosureLines, instantText, itemLine, parseTimelineLink, parseTraceLink,
  partialFromDisclosure, reasonText, reconcileCommand, scrubberStops, stagesOf, stopIndex, timelineHref, traceHref, traceSummary,
  type DisclosureView, type TimelineItemView, type TraceNodeView, type TraceView,
} from './timeline-b50';

const ROOT = join(__dirname, '..', '..', '..');
const ID = '01a1aaaa-0000-7000-8000-000000000001';
const q = (o: Record<string, string>) => ({ get: (k: string) => (k in o ? (o[k] as string) : null) });

const EMPTY: DisclosureView = {
  missingIntervals: [], withheld: { count: 0, reason: 'policy' }, clockFlags: 0, brokenLineage: [], incomplete: false,
  missing: [], unattributedOpenRanges: 0, withheldByReason: { classification: 0, audience: 0 }, clock: { degraded: 0, unknown: 0, observation_after_record: 0, conflict: 0 },
  brokenDetail: [], correctionsLater: 0, untimed: 0, bounds: { limit: 200, listed: 3, matched: 3, truncated: false },
};
const FULL: DisclosureView = {
  ...EMPTY, incomplete: true,
  missing: [{ basis: 'acquisition_incomplete_ranges', source_key: 'fixture-portwatch', from: '2025-11-18', to: '2025-11-21', reason: 'publisher_gap', placed: true, resolved_at: null, resolved_later: true },
            { basis: 'source_health_events', source_key: 'fixture-portwatch', from: '2025-11-22T00:00:00.000000Z', to: null, reason: 'source_health:failed', placed: true, open: true }],
  missingIntervals: [{ sourceKey: 'fixture-portwatch', from: '2025-11-18', to: '2025-11-21' }],
  withheld: { count: 2, reason: 'classification' }, withheldByReason: { classification: 1, audience: 1 },
  clockFlags: 2, clock: { degraded: 1, unknown: 0, observation_after_record: 1, conflict: 0 },
  brokenLineage: [{ ref: `CLM:${ID}@1`, cites: `CLM:${ID.replace('1', '2')}@1` }], correctionsLater: 1, untimed: 2, bounds: { limit: 2, listed: 2, matched: 5, truncated: true },
};
const item = (over: Partial<TimelineItemView> = {}): TimelineItemView => ({
  ref: `CLM:${ID}@1`, objectType: 'CLM', title: 'Port of Hamburg throughput fell 12% (SYNTHETIC)', objectId: ID, version: 1,
  eventTime: '2025-11-19T00:00:00.000000Z', observedAt: '2025-11-20T06:00:00.000000Z', validFrom: null, validTo: null, recordedAt: '2026-09-19T10:00:00.000000Z',
  correctedLater: null, clock: 'trusted', time: null, headerOnly: false, axisStart: null, axisEnd: null, times: null, timeStated: false, clockFlags: [], clockDetail: [],
  lifecycle: 'active', truthState: 'asserted', synthetic: false, classification: 'internal', owner: 'principal:x', digest: 'a'.repeat(64), believedAtAsOf: true,
  correctionCases: [], brokenLineage: [], ...over,
});

describe('the ask and the deep link', () => {
  it('a subject or a scope — never both; the axis, the window and the as-of instant parsed or the reason said', () => {
    expect(parseTimelineLink(q({}))).toEqual({ ok: 'empty' });
    const s = parseTimelineLink(q({ type: 'CLM', id: ID.toUpperCase(), axis: 'event', from: '2025-11-01', to: '2025-12-01' }));
    expect(s).toEqual({ ok: true, ask: { subjectType: 'CLM', subjectId: ID, scopeKey: null, axis: 'event', from: '2025-11-01T00:00:00Z', to: '2025-12-01T00:00:00Z', asOf: null } });
    expect(parseTimelineLink(q({ scope: 'b50-corridor' }))).toMatchObject({ ok: true, ask: { scopeKey: 'b50-corridor', subjectId: null, axis: 'record' } });
    expect(parseTimelineLink(q({ type: 'CLM', id: ID, scope: 'b50-corridor' }))).toMatchObject({ ok: false, reason: expect.stringMatching(/both a subject and a scope/) });
    expect(parseTimelineLink(q({ type: 'clm', id: ID }))).toMatchObject({ ok: false });
    expect(parseTimelineLink(q({ type: 'CLM', id: 'x' }))).toMatchObject({ ok: false, reason: expect.stringMatching(/no object id/) });
    expect(parseTimelineLink(q({ type: 'CLM', id: ID, axis: 'wall' }))).toMatchObject({ ok: false, reason: expect.stringMatching(/not an axis/) });
    expect(parseTimelineLink(q({ type: 'CLM', id: ID, from: '2025-12-01', to: '2025-11-01' }))).toMatchObject({ ok: false, reason: 'the window ends before it starts' });
    expect(parseTimelineLink(q({ type: 'CLM', id: ID, asOf: 'yesterday' }))).toMatchObject({ ok: false, reason: 'the as-of instant is not an instant' });
    expect(AXES).toEqual(['event', 'observation', 'valid', 'record']);
  });
  it('the href round-trips; a trace link opens exactly the version it names', () => {
    const a = { subjectType: 'CLM', subjectId: ID, scopeKey: null, axis: 'valid' as const, from: '2025-11-01T00:00:00.000Z', to: '2100-01-01T00:00:00Z', asOf: '2026-09-29T00:00:00.000Z' };
    const href = timelineHref(a);
    const back = parseTimelineLink(new URLSearchParams(href.split('?')[1]!));
    expect(back).toEqual({ ok: true, ask: a });
    expect(traceHref('CLM', ID, 2)).toBe(`/graph/trace/CLM/${ID}?version=2`);
    expect(parseTraceLink('CLM', ID, '2')).toEqual({ ok: true, type: 'CLM', id: ID, version: 2 });
    expect(parseTraceLink('CLM', ID, null)).toMatchObject({ ok: false, reason: expect.stringMatching(/no version/) });
    expect(parseTraceLink('CL', ID, '1')).toMatchObject({ ok: false });
    expect(boundInstant('2025-11-18')).toBe('2025-11-18T00:00:00Z');
    expect(boundInstant('soon')).toBeNull();
  });
});

describe('the scrubber steps over the record instants the answer carries, never another', () => {
  it('unique, ascending, the live read last; the as-of instant finds its stop', () => {
    const stops = scrubberStops({ items: [item({ recordedAt: '2026-09-19T10:00:00.000000Z' }), item({ recordedAt: '2026-09-09T10:00:00.000000Z' }), item({ recordedAt: '2026-09-19T10:00:00.000000Z' })],
      events: [{ at: '2026-09-15T00:00:00.000000Z' }, { at: null }] });
    expect(stops.map((s) => s.at)).toEqual(['2026-09-09T10:00:00.000000Z', '2026-09-15T00:00:00.000000Z', '2026-09-19T10:00:00.000000Z', 'now']);
    expect(stops[0]!.label).toBe('as recorded at 2026-09-09 10:00:00 UTC');
    expect(stopIndex(stops, null)).toBe(3);
    expect(stopIndex(stops, '2026-09-16T00:00:00Z')).toBe(1);
    expect(stopIndex(stops, '2026-01-01T00:00:00Z')).toBe(0);
  });
});

describe('the words: a DATE is the day it names; a clock is a glyph AND a word; a correction says when', () => {
  it('instants and days', () => {
    expect(instantText('2025-11-18')).toBe('2025-11-18');                    // never shifted by a zone
    expect(instantText('2025-11-20T06:00:00.000000Z')).toBe('2025-11-20 06:00:00 UTC');
    expect(instantText(null)).toBe('none stated');
  });
  it('every clock reading has a word; an unknown one is the server\'s word, flagged', () => {
    for (const c of ['trusted', 'degraded', 'unknown', 'observation_after_record', 'conflict']) expect(clockWord(c).known, c).toBe(true);
    expect(clockWord('observation_after_record')).toMatchObject({ glyph: '⇄', word: 'OBSERVED AFTER RECORDED' });
    expect(clockWord('lunar')).toMatchObject({ word: 'LUNAR', known: false });
  });
  it('an item line: four times, believed or superseded, the later correction (and whether it was known then), the broken citations', () => {
    const l = itemLine(item({ correctedLater: { at: '2026-10-09T00:00:00.000000Z', by: 'principal:k-mueller', version: 2, lifecycle: 'corrected', knownAtAsOf: false }, believedAtAsOf: true,
      brokenLineage: [{ ref: `CLM:${ID}@9`, state: 'unresolved', reason: 'version 9 is not recorded; the latest is 1' }] }));
    expect(l.times.map((t) => t.label)).toEqual(['Event time', 'Observation time', 'Valid', 'Record time']);
    expect(l.times[2]!.value).toBe('none stated');
    expect(l.correction).toBe('corrected on 2026-10-09 00:00:00 UTC by principal:k-mueller (version 2, corrected) — not yet known at the instant');
    expect(l.believed).toBe('believed at the instant');
    expect(l.broken).toEqual([`CLM:${ID}@9 — unresolved: version 9 is not recorded; the latest is 1`]);
    expect(itemLine(item({ believedAtAsOf: false })).believed).toMatch(/^superseded/);
  });
});

describe('PR-22-003 — the model test: no read path drops a disclosure', () => {
  it('every disclosure kind has exactly one line, for an empty answer and a full one', () => {
    for (const d of [EMPTY, FULL]) {
      const lines = disclosureLines(d);
      expect(lines.map((l) => l.key)).toEqual([...DISCLOSURE_KEYS]);
      for (const l of lines) expect(l.text.length, l.key).toBeGreaterThan(10);
    }
    const e = Object.fromEntries(disclosureLines(EMPTY).map((l) => [l.key, l]));
    expect(e['missing']!.text).toMatch(/^Missing intervals: none declared/);
    expect(e['withheld']!.text).toBe('Policy filtering: nothing withheld from you');
    expect(e['broken']!.text).toBe('Broken lineage: every citation resolves');
  });
  it('a full answer: each line says the count, never the withheld content; the details listed; the partial declaration is not complete', () => {
    const f = Object.fromEntries(disclosureLines(FULL).map((l) => [l.key, l]));
    expect(f['missing']).toMatchObject({ tone: 'attention', text: 'Missing intervals: 2 intervals' });
    expect(f['missing']!.detail[0]).toBe('fixture-portwatch: 2025-11-18 to 2025-11-21 — publisher_gap (resolved later, not known at the instant)');
    expect(f['missing']!.detail[1]).toMatch(/to open — source_health:failed$/);
    expect(f['withheld']!.text).toBe('Policy filtering: 1 version withheld above your clearance; 1 version shown header-only (audience) — counted, their content not shown');
    expect(f['clock']!.text).toBe('Clock skew: 2 versions flagged (degraded clock 1, observed after recorded 1)');
    expect(f['broken']!.detail).toEqual([`CLM:${ID}@1 cites CLM:${ID.replace('1', '2')}@1`]);
    expect(f['untimed']!.text).toMatch(/^2 versions carry no time on this axis and are not placed/);
    expect(f['bounds']!.text).toMatch(/^Bounded: 2 of 5 versions listed/);
    const p = partialFromDisclosure(FULL);
    expect(p.complete).toBe(false);
    expect(p.missingIntervals).toEqual([{ from: '2025-11-18', to: '2025-11-21' }, { from: '2025-11-22 00:00:00 UTC', to: 'open' }]);
    expect(p.filters).toEqual(['1 withheld above your clearance', '1 shown header-only', '2 with a clock flag', '1 citation(s) that do not resolve']);
    expect(partialFromDisclosure(EMPTY).complete).toBe(true);
  });
});

describe('the trace', () => {
  const node = (stage: TraceNodeView['stage'], over: Partial<TraceNodeView> = {}): TraceNodeView => ({
    nodeId: `obj:${stage}`, kind: stage === 'decision' ? 'product' : stage, ref: `CLM:${ID}@1`, label: stage, outcome: 'ok', at: null, actor: null, parents: [], stage,
    visible: true, clock: 'trusted', clockFlags: [], clockDetail: [], correctedLater: null, recordedAt: null, eventTime: null, observedAt: null, ...over,
  });
  it('the stages in their order, every stage present (an empty one says so), never invented', () => {
    const g = stagesOf([node('product'), node('evidence'), node('source'), node('evidence', { nodeId: 'obj:e2' })]);
    expect(g.map((x) => [x.stage, x.nodes.length])).toEqual([['source', 1], ['evidence', 2], ['claim', 0], ['product', 1], ['decision', 0]]);
    expect(STAGES).toEqual(['source', 'evidence', 'claim', 'product', 'decision']);
  });
  it('the completeness: every reason in words, an unknown one in the server\'s', () => {
    expect(traceSummary({ incomplete: false, reasons: [] }).complete).toBe(true);
    const s = traceSummary({ incomplete: true, reasons: [{ reason: 'broken_lineage', count: 2 }, { reason: 'clock_unknown', count: 2 }, { reason: 'moon_phase', count: 1 }] });
    expect(s.text).toBe('a citation or lineage edge does not resolve — 2; a source states its clock is unknown (its own limitation) — 2; moon_phase (as the server states it) — 1');
    expect(reasonText({ reason: 'continuity_degraded', count: 1 })).toBe('a source the trace rests on is degraded — 1');
    // every reason the SQL raises has its words (the port's reasons read from the migration)
    const sqlText = readFileSync(join(ROOT, 'apps/api/migrations/0120_b50_x_tl.sql'), 'utf8');
    const raised = [...new Set([...sqlText.matchAll(/jsonb_build_object\('(?:reason|limitation)', '([a-z_]+)'/g)  /* B50 integration (D20): a stated limitation is worded too */].map((m) => m[1]!))].sort();
    expect(raised).toEqual(Object.keys(REASON_WORDS).sort());
  });
  it('the continuity onto B81\'s DegradedState: the contracts in force and the undeclared, flattened; normal → nothing to show', () => {
    const t = { readAt: '2026-10-19T00:00:00Z', continuity: { state: 'degraded', dependencies: [
      { dependency: { kind: 'source', key: 'fixture-portwatch' }, contracts: [{ contract_id: 'c1', mode: 'active' }], undeclared: [], unavailable_functions: [{ action: 'graph.provenance.fitness.mark' }] },
      { dependency: { kind: 'source', key: 'fixture-other' }, contracts: [], undeclared: [{ dependency: { kind: 'source', key: 'fixture-other' } }], unavailable_functions: [] }] } } as unknown as Pick<TraceView, 'continuity' | 'readAt'>;
    const s = continuityState(t)!;
    expect(s).toMatchObject({ degraded: true, unknown: 0 });
    expect(s.contracts.length).toBe(1); expect(s.undeclared.length).toBe(1); expect(s.unavailable_functions.length).toBe(1);
    expect(continuityState({ readAt: 'x', continuity: { state: 'normal', dependencies: [] } })).toBeNull();
  });
  it('the reconciliation: a person, an incomplete trace, a role of the rule (or the owner), a note — each refusal with its reason', () => {
    const t = { incomplete: true, reconciliation: [], reasons: [{ reason: 'broken_lineage', count: 1 }] };
    expect(reconcileCommand(t, ['domain_analyst'], true, false, 'Two citations do not resolve')).toEqual({ enabled: true, reason: null });
    expect(reconcileCommand(t, ['domain_analyst'], false, false, 'Two citations do not resolve').reason).toMatch(/never an agent/);
    expect(reconcileCommand({ ...t, incomplete: false }, ['domain_analyst'], true, false, 'Two citations do not resolve').reason).toMatch(/nothing to reconcile/);
    expect(reconcileCommand(t, ['collection_manager'], true, false, 'Two citations do not resolve').reason).toMatch(/do not route a reconciliation/);
    expect(reconcileCommand(t, ['collection_manager'], true, true, 'Two citations do not resolve').enabled).toBe(true);   // the product's owner
    expect(reconcileCommand(t, ['domain_analyst'], true, false, 'short').reason).toMatch(/8 characters/);
  });
  it('the roles offered are the PDP rule\'s (graph.timeline.reconcile)', () => {
    const pdp = readFileSync(join(ROOT, 'apps/api/src/policy/pdp.service.ts'), 'utf8');
    const block = pdp.slice(pdp.indexOf('/* B50 tl */'), pdp.indexOf('/* end B50 tl */'));
    const m = block.match(/const reconcilers = \[([^\]]*)\]/);
    expect(m).not.toBeNull();
    expect([...m![1]!.matchAll(/'([a-z_]+)'/g)].map((x) => x[1])).toEqual([...RECONCILE_ROLES]);
  });
});
