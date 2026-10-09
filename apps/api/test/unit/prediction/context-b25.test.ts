/**
 * B25 §CX (0108) — the PURE logic of grounded context: the assembler (assembler@1: features, manifest, digest, pins, comparison), the
 * output digest, the forecast ENVIRONMENT (V03-T-196) and its method register, the legacy methods' pinned implementation digest, the
 * request contract, the seam's transaction resolution, and the refusal family's mapping (every text the ports raise → its status).
 * No database. Every figure is SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { HttpException } from '@nestjs/common';
import { ASSEMBLER_VERSION, assembleManifest, canonicalRequest, compareManifests, featuresOf, outputDigest, pinsOf, requiredGaps, scalarOf, summaryOf } from '../../../src/prediction/context/assembler.js';
import { canonicalDigest, environmentDifferences, forecastEnvironment, forecastEnvironmentFacts, registerForecastMethod, registeredForecastMethod, restoreForecastMethod } from '../../../src/shared/forecast-environment.js';
import { LEGACY_METHOD_REFS, MODELS_IMPLEMENTATION_DIGEST, legacyOutput, registerLegacyMethods } from '../../../src/prediction/context/legacy-methods.js';
import { resolveTx, validateFreezeRequest } from '../../../src/prediction/context/context-freezer.js';
import { asObservationRefusal } from '../../../src/observation/observation-errors.js';
import { SEASONAL_NAIVE } from '../../../src/prediction/models/models.js';

const SUBJECT = '01900000-0000-7000-8000-00000000000a';
const OTHER = '01900000-0000-7000-8000-00000000000b';
const TWIN = '01900000-0000-7000-8000-0000000000c1';
const ASU = '01900000-0000-7000-8000-0000000000d1';
const D64 = (c: string) => c.repeat(64);

const request = () => canonicalRequest({ seriesKey: 'portwatch:chokepoint4:n_total', subjectEntityId: SUBJECT, targetKey: null, knownAt: '2026-10-06T10:00:00.000Z',
  observedThrough: '2024-01-11', assumptions: [ASU, ASU] });

/** A SYNTHETIC grounding context, as prediction.pcx_grounding_context answers one. */
const context = (over: Record<string, unknown> = {}) => ({
  series: { series_key: 'portwatch:chokepoint4:n_total', subject_entity_id: SUBJECT, unit: 'transits/day', seasonality_days: 7 },
  known_at: '2026-10-06T10:00:00.000000Z', revision_head: 12, revision_updated_at: '2026-10-06T09:00:00.000000Z',
  evidence: [
    { evidence_object_id: '01900000-0000-7000-8000-0000000000e2', evidence_version: 1, evidence_digest: D64('b'), recorded_at: '2026-10-05T00:00:00.000000Z' },
    { evidence_object_id: '01900000-0000-7000-8000-0000000000e1', evidence_version: 2, evidence_digest: D64('a'), recorded_at: '2026-10-04T00:00:00.000000Z' },
  ],
  subject: { entity_id: SUBJECT, entity_type: 'place', created_at: '2026-10-01T00:00:00.000000Z', lifecycle: 'active' },
  edges: [
    { edge_id: '01900000-0000-7000-8000-0000000000f2', subject_entity_id: OTHER, predicate: 'ships_through', object_entity_id: SUBJECT, confidence: 0.91 },
    { edge_id: '01900000-0000-7000-8000-0000000000f1', subject_entity_id: SUBJECT, predicate: 'served_by', object_entity_id: OTHER, confidence: 0.8 },
  ],
  neighbours: [OTHER], events: [{ event_id: 'e1', of: 'entity', id: SUBJECT, event: 'entity.created', occurred_at: '2026-10-01T00:00:00.000000Z' }],
  twin: { twin_id: TWIN, version: 3, branch_id: 'actual', mode: 'head', state_set_digest: D64('c'), header_digest: D64('d'), known_at: '2026-10-02T00:00:00.000000Z',
          observed_through: '2024-01-17', admitted_at: '2026-10-02T00:00:01.000000Z', synthetic: true,
          elements: [{ key: 'shock.corridor_delay_days', kind: 'assumed', value: 14, unit: 'days' }, { key: 'supply.capacity_per_day', kind: 'observed', value: { value: 41 }, unit: 'units/day' },
                     { key: 'route.plan', kind: 'assumed', value: { legs: 3 }, unit: null }] },
  assumptions: [{ id: ASU, version: 1, verification_state: 'unverified' }], unknown_assumptions: [],
  policy: { ontology: null, attention_policy: { version: 2 }, decision_use_policy: null }, gaps: [], withdrawn_partitions: [],
  ...over,
});

describe('B25 §CX · the assembler (assembler@1)', () => {
  it('the request is canonical: assumptions de-duplicated and sorted; absent optionals null', () => {
    expect(request()).toEqual({ series_key: 'portwatch:chokepoint4:n_total', subject_entity_id: SUBJECT, target_key: null, known_at: '2026-10-06T10:00:00.000Z', observed_through: '2024-01-11', assumptions: [ASU] });
  });

  it('the FEATURES: evidence, the subject, the edges (and per predicate), the events, each twin element (scalar values), each assumption — keyed, sourced, digested', () => {
    const f = featuresOf('portwatch:chokepoint4:n_total', context());
    expect(f.map((x) => x.key)).toEqual(['assumption.' + ASU, 'evidence.versions', 'graph.edges', 'graph.edges.served_by', 'graph.edges.ships_through', 'graph.events', 'graph.subject',
      'twin.route.plan', 'twin.shock.corridor_delay_days', 'twin.supply.capacity_per_day']);
    const by = Object.fromEntries(f.map((x) => [x.key, x]));
    expect(by['evidence.versions']).toMatchObject({ source: 'series:portwatch:chokepoint4:n_total', value: 2 });
    expect(by['graph.edges']).toMatchObject({ value: 2 });
    expect(by['twin.shock.corridor_delay_days']).toMatchObject({ source: `twin:${TWIN}@v3`, value: 14 });
    expect(by['twin.supply.capacity_per_day']?.value).toBe(41);
    expect('value' in (by['twin.route.plan'] ?? {})).toBe(false);   // a structured element has no scalar value; its digest still pins it
    for (const x of f) expect(x.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(scalarOf(true)).toBe(true); expect(scalarOf({ a: 1 })).toBeUndefined();
  });

  it('the MANIFEST digest is canonical: the same context in another order digests the same; a changed edge does not', () => {
    const a = assembleManifest(request(), context(), { pdpBundle: 'bundle-v1' });
    const shuffled = context({ evidence: [...(context().evidence as unknown[])].reverse(), edges: [...(context().edges as unknown[])].reverse() });
    const b = assembleManifest(request(), shuffled, { pdpBundle: 'bundle-v1' });
    expect(b.digest).toBe(a.digest);
    expect(a.digest).toBe(canonicalDigest(a.manifest));
    expect(a.manifest).toMatchObject({ schema: 'information-set@1', assembler_version: ASSEMBLER_VERSION, graph: { revision_head: 12, edge_count: 2, neighbours: [OTHER] },
      twin: { twin_id: TWIN, version: 3, mode: 'head', element_count: 3 }, policy: { pdp_bundle: 'bundle-v1' } });
    const edges = [...(context().edges as Array<Record<string, unknown>>)]; edges[0] = { ...edges[0], confidence: 0.5 };
    expect(assembleManifest(request(), context({ edges }), { pdpBundle: 'bundle-v1' }).digest).not.toBe(a.digest);
  });

  it('REQUIRED gaps: no evidence, an unregistered series, an unknown assumption; a missing twin is a NAMED, optional gap', () => {
    const none = assembleManifest(request(), context({ evidence: [] }), { pdpBundle: 'b' });
    expect(requiredGaps(none.manifest).map((g) => g.key)).toEqual(['evidence.versions']);
    const unreg = assembleManifest(request(), { series: null }, { pdpBundle: 'b' });
    expect(requiredGaps(unreg.manifest).map((g) => g.key)).toEqual(['series']);
    const unknown = assembleManifest(request(), context({ unknown_assumptions: [OTHER] }), { pdpBundle: 'b' });
    expect(requiredGaps(unknown.manifest).map((g) => g.key)).toEqual([`assumption.${OTHER}`]);
    const noTwin = assembleManifest(request(), context({ twin: null, gaps: [{ key: 'twin.snapshot', required: false, reason: 'no twin served' }] }), { pdpBundle: 'b' });
    expect(noTwin.manifest.twin).toBeNull();
    expect(noTwin.manifest.coverage_gaps).toEqual([{ key: 'twin.snapshot', required: false, reason: 'no twin served' }]);
    expect(requiredGaps(noTwin.manifest)).toEqual([]);
  });

  it('PINS: a replay copies the revision head, the policy, the twin\'s served mode and the policy/twin-resolution gaps — a later head does not move its digest', () => {
    const frozen = assembleManifest(request(), context({ gaps: [{ key: 'policy.attention', required: false, reason: 'unreadable' }] }), { pdpBundle: 'bundle-v1' });
    const pins = pinsOf(frozen.manifest);
    expect(pins).toMatchObject({ revisionHead: 12, twinMode: 'head', pinnedGaps: [{ key: 'policy.attention' }] });
    // the replay reads the pinned twin version (mode 'pinned'), a later head (14), another policy — and no policy gap
    const later = context({ revision_head: 14, twin: { ...(context().twin as Record<string, unknown>), mode: 'pinned' }, policy: { ontology: { version: 9 } }, gaps: [] });
    const replay = assembleManifest(request(), later, { pdpBundle: 'bundle-v2', pins });
    expect(replay.digest).toBe(frozen.digest);
    expect(compareManifests(frozen.manifest, replay.manifest)).toEqual([]);
    // without the pins the same read is a different manifest: the head and the policy say what moved
    const fresh = assembleManifest(request(), later, { pdpBundle: 'bundle-v2' });
    expect(compareManifests(frozen.manifest, fresh.manifest).map((d) => d.what)).toEqual(['graph.revision_head', 'twin', 'policy', 'coverage_gaps']);
  });

  it('COMPARISON names what diverged — a later edge: the edges, the predicate\'s feature added; the fresh grounding ignores the request\'s cut-off', () => {
    const frozen = assembleManifest(request(), context(), { pdpBundle: 'b' }).manifest;
    const edges = [...(context().edges as unknown[]), { edge_id: '01900000-0000-7000-8000-0000000000f3', subject_entity_id: OTHER, predicate: 'routes_via', object_entity_id: SUBJECT, confidence: 0.7 }];
    const moved = assembleManifest({ ...request(), known_at: '2026-10-07T00:00:00.000Z' }, context({ edges, revision_head: 13 }), { pdpBundle: 'b' }).manifest;
    const d = compareManifests(frozen, moved, ['request']);
    expect(d.map((x) => x.what)).toEqual(['graph.revision_head', 'graph.edges', 'feature:graph.edges', 'feature:graph.edges.routes_via']);
    expect(d.find((x) => x.what === 'feature:graph.edges.routes_via')).toMatchObject({ note: 'added', replayed: 1 });
    expect(compareManifests(frozen, moved).map((x) => x.what)[0]).toBe('request');
  });

  it('the SUMMARY a forecast carries (FCT@v2 information_set): the id, the digest, the graph revision and cut-off, the twin pin, the feature keys, the gaps', () => {
    const { manifest, digest } = assembleManifest(request(), context(), { pdpBundle: 'b' });
    expect(summaryOf('set-1', digest, manifest)).toMatchObject({ id: 'set-1', manifest_digest: digest, graph: { revision_head: 12, subject_entity_id: SUBJECT, edges: 2 },
      twin: { twin_id: TWIN, version: 3, state_set_digest: D64('c') }, evidence: 2, coverage_gaps: [] });
  });

  it('the OUTPUT digest is the quantiles and the path as stored; the legacy compute stores what the issue stores (rounded to 4 places)', () => {
    const points = Array.from({ length: 60 }, (_, i) => ({ date: new Date(Date.UTC(2024, 0, 1 + i)).toISOString().slice(0, 10), value: 40 + 5 * Math.sin(i / 7 * 2 * Math.PI) + (i % 3) * 0.123456 }));
    const a = legacyOutput(SEASONAL_NAIVE, points, 30, 7); const b = legacyOutput(SEASONAL_NAIVE, points, 30, 7);
    expect(outputDigest(a.quantiles, a.path)).toBe(outputDigest(b.quantiles, b.path));
    for (const v of [a.quantiles.q10, a.quantiles.q50, a.quantiles.q90]) expect(Number(v.toFixed(4))).toBe(v);
    expect(outputDigest(JSON.parse(JSON.stringify(a.quantiles)), JSON.parse(JSON.stringify(a.path)))).toBe(outputDigest(a.quantiles, a.path));   // a jsonb round trip
    expect(outputDigest({ ...a.quantiles, q50: a.quantiles.q50 + 0.0001 }, a.path)).not.toBe(outputDigest(a.quantiles, a.path));
  });
});

describe('B25 §CX · the forecast ENVIRONMENT (V03-T-196) and the method register', () => {
  it('the legacy methods\' implementation digest is the sha-256 of models.ts (change the models, change the version)', () => {
    const src = readFileSync(fileURLToPath(new URL('../../../src/prediction/models/models.ts', import.meta.url)));
    expect(createHash('sha256').update(src).digest('hex')).toBe(MODELS_IMPLEMENTATION_DIGEST);
    registerLegacyMethods();
    for (const ref of Object.keys(LEGACY_METHOD_REFS)) expect(registeredForecastMethod(ref)?.implementationDigest).toBe(MODELS_IMPLEMENTATION_DIGEST);
  });

  it('the facts mirror environmentFor (node, platform, arch) with the method reference, its implementation digest and the assembler; the digest is sha-256 over their JCS form', () => {
    registerLegacyMethods();
    const runtime = { node: 'v22.0.0', platform: 'linux', arch: 'x64' };
    const e = forecastEnvironment('seasonal-naive@1', ASSEMBLER_VERSION, runtime);
    expect(e.facts).toEqual({ node: 'v22.0.0', platform: 'linux', arch: 'x64', method_ref: 'seasonal-naive@1', implementation_digest: MODELS_IMPLEMENTATION_DIGEST,
      implementation: 'registered', assembler_version: 'assembler@1' });
    expect(e.digest).toBe(canonicalDigest(e.facts));
    expect(forecastEnvironment('seasonal-naive@1', ASSEMBLER_VERSION, runtime).digest).toBe(e.digest);
    expect(forecastEnvironment('seasonal-naive@1', ASSEMBLER_VERSION, { ...runtime, arch: 'arm64' }).digest).not.toBe(e.digest);
    expect(forecastEnvironment('seasonal-naive@1', 'assembler@2', runtime).digest).not.toBe(e.digest);
    expect(forecastEnvironmentFacts('regime-judgement@1', ASSEMBLER_VERSION, runtime)).toMatchObject({ implementation_digest: null, implementation: 'unregistered' });
    expect(forecastEnvironmentFacts('seasonal-naive@1', ASSEMBLER_VERSION).node).toBe(process.version);
  });

  it('a REPLACED implementation changes the environment (and is restored); the differences are named, never hidden', () => {
    registerLegacyMethods();
    const before = forecastEnvironment('seasonal-naive@1', ASSEMBLER_VERSION);
    const prior = registerForecastMethod('seasonal-naive@1', { implementationDigest: D64('f'), compute: null });
    const after = forecastEnvironment('seasonal-naive@1', ASSEMBLER_VERSION);
    expect(after.digest).not.toBe(before.digest);
    expect(environmentDifferences({ ...before.facts, digest: before.digest }, { ...after.facts, digest: after.digest })).toEqual(['implementation_digest']);
    restoreForecastMethod('seasonal-naive@1', prior);
    expect(forecastEnvironment('seasonal-naive@1', ASSEMBLER_VERSION).digest).toBe(before.digest);
    expect(environmentDifferences(null, { a: 1 })).toEqual(['environment']);
    expect(() => registerForecastMethod('no version', { implementationDigest: D64('a') })).toThrow(/key@version/);
    expect(() => registerForecastMethod('x@1', { implementationDigest: 'short' })).toThrow(/sha-256/);
  });
});

describe('B25 §CX · the request contract and the seam', () => {
  const ok = { tenantId: 't', domainId: 'd', seriesKey: 'portwatch:chokepoint4:n_total', subjectEntityId: SUBJECT, targetKey: null, knownAt: '2026-10-06T10:00:00Z',
               observedThrough: '2024-01-11', assumptions: [ASU], actor: 'a', correlationId: 'c' };
  const refusal = (f: () => void): string => { try { f(); return 'ok'; } catch (e) { return e instanceof HttpException ? `${e.getStatus()} ${String((e.getResponse() as { message?: string }).message)}` : String(e); } };
  it('validates the request before anything is read (L6-C02 contract validation)', () => {
    expect(refusal(() => validateFreezeRequest(ok, 'c'))).toBe('ok');
    expect(refusal(() => validateFreezeRequest({ ...ok, knownAt: 'yesterday' }, 'c'))).toMatch(/^422 .*knownAt/);
    expect(refusal(() => validateFreezeRequest({ ...ok, observedThrough: '11/01/2024' }, 'c'))).toMatch(/^422 .*observedThrough/);
    expect(refusal(() => validateFreezeRequest({ ...ok, assumptions: ['not-a-uuid'] }, 'c'))).toMatch(/^422 .*assumptions/);
    expect(refusal(() => validateFreezeRequest({ ...ok, subjectEntityId: 'x' }, 'c'))).toMatch(/^422 .*subjectEntityId/);
  });
  it('resolves the write transaction a seam caller hands (the transaction, or an object carrying it as `tx`)', () => {
    const tx = { executeQuery: () => undefined, selectFrom: () => undefined };
    expect(resolveTx(tx)).toBe(tx);
    expect(resolveTx({ tx })).toBe(tx);
    expect(() => resolveTx({ forecast: {} })).toThrow(/write transaction/);
  });
});

describe('B25 §CX · the refusal family maps to its status (every text the ports raise)', () => {
  const map = (code: string, message: string): number | null => asObservationRefusal({ code, message }, 'c')?.getStatus() ?? null;
  it.each([
    ['42501', 'information set rejected (actor): the acting principal x is not the bound principal; a set is frozen by whoever acts', 403],
    ['22023', 'information set rejected (contract): the cut-off 2026 is later than the database\'s instant 2025; a set freezes what was known, never what will be', 422],
    ['23503', 'information set rejected (unknown_series): series x is not registered in this domain', 404],
    ['23503', 'information set rejected (unknown_assumption): x is not an assumption (ASU) of this domain', 404],
    ['23503', 'information set rejected (unknown_information_set): x is no frozen information set of this domain', 404],
    ['22023', 'information set rejected (mismatch): set x was frozen for series a (subject none, known at t), not for this forecast\'s series b (subject none, known at t)', 422],
    ['22023', 'information set rejected (mismatch): the twin pin x@v1 is not an admitted version of this domain with those digests', 422],
    ['22023', 'information set rejected (incomplete): no evidence version of series x was known at t; the required input is unreadable', 422],
    ['23514', 'information set rejected (stale): the manifest pins graph revision 3 but the domain\'s head is 4; a graph commit landed between the read and the freeze — assemble again', 409],
    ['23514', 'information set rejected (state): forecast x pinned information set y at issue; a pin is never changed — issue a new forecast', 409],
    ['23505', 'information set rejected (duplicate): information set x is already frozen; a set is frozen once', 409],
    ['42501', 'forecast replay rejected (actor): the acting principal x is not the bound principal', 403],
    ['23503', 'forecast replay rejected (unknown_forecast): no forecast x in this domain', 404],
    ['22023', 'forecast replay rejected (ungrounded): forecast x was issued without a frozen information set, so nothing pins what it knew — replay needs a grounded forecast (POST …/prediction/forecasts/issue-grounded)', 422],
    ['22023', 'forecast replay rejected (mismatch): forecast x pins information set y, not z', 422],
    ['23514', 'forecast replay rejected (stale): the original manifest digest handed (abc) is not the frozen set\'s (def)', 409],
    ['22023', 'forecast replay rejected (contract): the digests differ but no divergence is named; a replay that diverged says what diverged', 422],
  ])('%s %s → %i', (code, message, status) => {
    expect(map(code, message)).toBe(status);
  });
});
