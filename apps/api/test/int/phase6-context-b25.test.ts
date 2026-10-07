/**
 * CP-6 B25 part `context` (migration 0108 §CX; F-P4-03 — V00-T-009, L6-C02, V03-T-319, AI-48-002, V03-T-127's lineage; the carried
 * F-P5-03 ENVIRONMENT, V03-T-196): GROUNDED CONTEXT, THE FROZEN INFORMATION SET, THE REPLAY — on the real database and the real
 * controllers, the world of `bootDecisionWorld` (the "Bab el-Mandeb Strait" place entity, the NORDWERK corridor twin admitted on actual
 * with the strait in its boundary, the synthetic daily transit series, the ASU "The corridor stays open"), a CORRIDOR-LIKE series
 * registered on the same source WITH the strait as its subject, an approved ontology, and the named humans with sessions of their own:
 * N. Eriksen (forecast_owner), K. Müller (knowledge_owner), an analyst, an ontology steward.
 *
 *   CX1 · L6-C02 the feature and context assembler — POSITIVE: a set frozen for the corridor series at the database's instant names its
 *         evidence, the strait, its edge, its events, the twin's elements and the assumption as features (key, source, digest, value), the
 *         manifest digest recomputes; REFUSAL: a cut-off in the future (contract 422), before any evidence (incomplete 422), an unknown
 *         series (404), an assumption that is no ASU (404), the analyst (PDP 403) — nothing written; RECOVERY: the request corrected
 *         freezes; a series with no subject freezes with its gaps NAMED (no graph context, no twin).
 *   CX2 · V03-T-319 / AI-48-002 the manifest pinned on the forecast — POSITIVE: the grounded issue pins the set (information_set_id, the
 *         FCT@v2 payload's information_set and environment, forecast.information_set_frozen, information_set.pinned); the CONTEXT_FREEZER
 *         seam resolves to the grounded freezer and freezes inside another issuing action; REFUSAL: a forecast naming another series' set
 *         (mismatch 422), a pin changed afterwards (state 409), a set edited (append-only), the port's bindings (a stale head 409, a twin
 *         pin and an evidence digest that are not the domain's 422); RECOVERY: the same issue with its own set.
 *   CX3 · V00-T-009 understand before predicting — POSITIVE: the grounding read shows the forecast's inputs: the strait, its relationship
 *         (claim and evidence), its events, the twin's mechanism elements (shock.corridor_delay_days 14 days), the assumption with its
 *         version as of the cut-off; REFUSAL: the legacy issue stays UNGROUNDED (default-off: no set, FCT@v1, no new event) and its replay
 *         is refused (ungrounded 422); RECOVERY: the same question issued grounded.
 *   CX4 · V03-T-127 lineage — POSITIVE: forecast → set → every pinned evidence version, the edge's claim version and evidence digest, the
 *         twin version's digests, the ASU's canonical version — each resolved in the database; REFUSAL: a principal with no read role
 *         (PDP 403); RECOVERY: the analyst reads it.
 *   CX5 · THE REPLAY and THE SCENE (F-P4-03: "a corridor forecast pins the twin snapshot and graph revision it used; a later graph change
 *         leaves the replayed package unchanged") — REPRODUCED; K. Müller's later change set (a second operator ships through the strait)
 *         moves the head; the replay is REPRODUCED again while the fresh grounding differs (the head, the edges); a REPLACED method
 *         implementation → DIVERGED (output) with the environment difference REPORTED; restored → REPRODUCED; REFUSAL: the analyst (PDP
 *         403), an unknown forecast (404).
 *   CX6 · V03-T-196 the environment — POSITIVE: node, platform, arch, the method reference, its implementation digest (models.ts) and the
 *         assembler, digested (sha-256 / JCS) on the row and in the FCT payload; REFUSAL: an environment without its digest (the pair
 *         constraint, 409); RECOVERY: the grounded issue records both.
 *
 *   B25 completion (the gaps the bookkeeping review found; registry entries proposed by N. Eriksen, approved by H. Petrović, the target by
 *   T. Richter, the horizon policy concurred by H. Petrović — all SYNTHETIC declarations):
 *   CX7 · G1 FEATURES AS MODEL INPUTS (V00-T-009, L6-C02) — POSITIVE: a routed 5y regime forecast whose entry declares conditions on a TWIN
 *         feature (shock.corridor_delay_days) and a GRAPH feature (graph.edges.ships_through) of the frozen set: each read with its value and
 *         digest, held, its pseudo-count added; REFUSAL: a condition on a feature the frozen set lacks, and on one with no scalar value —
 *         `forecast rejected (context)` (422, ledgered, nothing issued); RECOVERY: the steward's corrected version issues.
 *   CX8 · G2 THE REPLAY OF ROUTED FORECASTS (F-P4-03) — POSITIVE: the routed regime (twin-conditioned), event and bayesian forecasts replay
 *         REPRODUCED; after a later TWIN version (the corridor delay 14 → 21 days) and a later graph change the regime replay is still
 *         REPRODUCED while the fresh grounding differs; REFUSAL: the entry pinned to other bytes (a stated superuser move) → DIVERGED
 *         (implementation), not re-run; RECOVERY: the pin restored → REPRODUCED.
 *   CX9 · G7 THE PINS (AI-48-002) — POSITIVE: the routed forecast's row and package pin the TARGET VERSION with its definition digest and the
 *         EVALUATION PROFILE (policy and version, validation requirement, the applicable record); the manifest pins the target key and the
 *         horizon policy version; the grounded legacy issue pins its profile (the legacy rule, the backtest read); REFUSAL: a target definition
 *         edited after issue (a stated superuser move) → the replay DIVERGES on target.definition; RECOVERY: restored → REPRODUCED.
 *
 * SOFTWARE CAPABILITY on a SYNTHETIC world: every figure here is synthetic (the fixture series, the twin's records, the claims). No external
 * integration is exercised or claimed. Every count is scoped to this harness's tenant.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PredictionCapability } from '../../src/prediction/prediction.capabilities.js';
import { ForecastingService } from '../../src/prediction/forecasting/forecasting.service.js';
import { CONTEXT_FREEZER, type ContextFreezer } from '../../src/prediction/portfolio/seams.js';
import { ContextController } from '../../src/prediction/context/context.controller.js';
import { ContextCapability } from '../../src/prediction/context/context.capabilities.js';
import { GroundedContextFreezer, PDP_BUNDLE_VERSION } from '../../src/prediction/context/context-freezer.js';
import { assembleManifest, canonicalRequest } from '../../src/prediction/context/assembler.js';
import { MODELS_IMPLEMENTATION_DIGEST, legacyOutput } from '../../src/prediction/context/legacy-methods.js';
import { canonicalDigest, registerForecastMethod, restoreForecastMethod } from '../../src/shared/forecast-environment.js';
import { SEASONAL_NAIVE } from '../../src/prediction/models/models.js';
import type { RegistryController } from '../../src/prediction/registry/registry.controller.js';
import { completeElements } from './phase5-fixtures.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';

// C5 / Nit 8: this file's own vault roots (bootDecisionWorld and the claims upload through h.upload()).
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b25-context-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Evd = { id: string; version: number; digest: string; bytesDigest: string };
type Claim = { id: string; version: number };

let h: Phase4Harness; let w: DecisionWorld; let su: Phase4Harness['su'];
let graph: GraphController; let C: ContextController;
let eriksen: AuthenticatedPrincipal; let kMueller: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
let CORRIDOR: string; let ONT: string; let B: Evd;
let CX2_FORECAST = '';   // B25 completion (G7): the grounded legacy forecast CX2 issues, read again by CX9
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const OBSERVED_THROUGH = '2023-12-31';

/* ───────────── the calls (in process) ───────────── */
const freeze = (as: AuthenticatedPrincipal, payload: Row) => C.freeze(h.req(as, 'prediction.information_set.freeze', 'INS', null), T(), D(), { payload }) as Promise<{ informationSet: Row & { informationSetId: string; manifestDigest: string; features: Array<Row & { key: string }>; coverageGaps: string[]; summary: Row } }>;
const issueGrounded = (as: AuthenticatedPrincipal, payload: Row) => C.issueGrounded(h.req(as, 'prediction.forecast.issue', 'FCT', null), T(), D(), { payload }) as unknown as Promise<{ forecast: Row & { forecastId: string; informationSet: Row; environment: Row } }>;
const replay = (as: AuthenticatedPrincipal, id: string) => C.replay(h.req(as, 'prediction.forecast.replay', 'FCT', id), T(), D(), id) as unknown as Promise<{ replay: Row & { outcome: string; diverged: Array<Row & { what: string }>; fresh: Row & { differs: boolean; what: string[] }; environment: Row & { match: boolean; differences: string[] } } }>;
const grounding = (as: AuthenticatedPrincipal, id: string) => C.grounding(h.req(as, 'prediction.information_set.read', 'FCT', id), T(), D(), id) as unknown as Promise<{ grounding: Row & { grounded: boolean; forecast: Row; set: Row | null; replays: Row[] } }>;
const legacyIssue = (as: AuthenticatedPrincipal, payload: Row) => w.prediction.issueForecast(h.req(as, 'prediction.forecast.issue', 'FCT', null), T(), D(), { payload } as never) as Promise<{ forecast: { forecastId: string } }>;

/** The refusal as the HTTP filter would answer it (a port's text through the observation mapper; a PDP denial as thrown). */
async function refused(p: Promise<unknown>): Promise<{ status: number; message: string }> {
  try { await p; } catch (e) {
    if (e instanceof HttpException) return { status: e.getStatus(), message: String((e.getResponse() as { message?: string }).message ?? e.message) };
    const mapped = asObservationRefusal(e, 'c');
    if (mapped !== null) return { status: mapped.getStatus(), message: String((mapped.getResponse() as { message?: string }).message ?? (e as Error).message), raw: (e as Error).message } as { status: number; message: string };
    return { status: 500, message: e instanceof Error ? e.message : String(e) };
  }
  throw new Error('expected a refusal, the call succeeded');
}
const dbNow = async (): Promise<string> => (await sql<{ t: string }>`select prediction.pcx_ts(clock_timestamp()) t`.execute(su)).rows[0]!.t;
const count = async (table: string): Promise<number> =>
  Number((await sql<{ n: string }>`select count(*)::text n from ${sql.table(table)} where tenant_id = ${T()}::uuid`.execute(su)).rows[0]!.n);
const head = async (): Promise<number> => Number((await sql<{ h: string }>`select coalesce((select head from graph.revision_heads where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid), 0)::text h`.execute(su)).rows[0]!.h);

/* ───────────── the graph world: claims planted with their lineage (the B23 harness idiom), change sets through the real route ───────────── */
async function plantClaim(type: 'ENT' | 'REL', evidence: Evd, o: { subject: string; object?: string }): Promise<Claim> {
  const id = uuidv7(); const version = 1; const now = new Date().toISOString(); const runId = uuidv7(); const methodId = uuidv7();
  const lineage = { method_id: methodId, run_id: runId, mode: 'replay', evidence_object_id: evidence.id, evidence_digest: evidence.bytesDigest, byte_start: 0, byte_end: 4 };
  const payload: Row = { claim_kind: type === 'ENT' ? 'entity' : 'relationship', subject: o.subject, predicate: type === 'REL' ? 'related_to' : 'is', object_value: o.object ?? null, confidence: 0.91, lineage,
    review: { state: 'approved', reason: 'fixture', decider: null } };
  const header: CanonicalHeader = {
    object_id: id, object_type: type, tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: String(version), lifecycle_state: 'active', owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture',
    source_object_ids: [evidence.id], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'extracted', synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: [`EVD:${evidence.id}@${evidence.version}`], provenance_ref: null, method_ref: 'fixture-extraction@1.0.0',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: `${type}@v1`, ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
  };
  const contentDigest = canonicalHeaderDigest(header, payload);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes, withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest)
    values (${id}::uuid, ${type}, ${T()}::uuid, ${D()}::uuid, 'DOMAIN', ${version}, 'active', 'CP-INT-01', 'agent:fixture', ${JSON.stringify(header.source_object_ids)}::jsonb, null, ${now}::timestamptz, null, null, ${now}::timestamptz, 'exact', 'trusted', 'extracted', false, null, null, ${JSON.stringify(header.evidence_refs)}::jsonb, null, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'internal', 'intelligence', null, null, null, null, null, null, null, ${`${type}@v1`}, null, null, null, null, ${header.audit_correlation_id}::uuid, null, ${JSON.stringify(payload)}::jsonb, ${contentDigest})`.execute(su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${id}::uuid, ${version}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${type}, ${runId}::uuid, ${methodId}::uuid, null, 'replay', ${evidence.id}::uuid, ${evidence.bytesDigest}, 0, 4, 0.91, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(su);
  return { id, version };
}
/** One change set through the real route as K. Müller: a new operator (organization) that ships through the strait. */
async function operatorShipsThroughStrait(name: string): Promise<Row & { revision: number; edge_ids: Row[] }> {
  const ent = await plantClaim('ENT', B, { subject: name });
  const rel = await plantClaim('REL', B, { subject: name, object: 'Bab el-Mandeb Strait' });
  const read = await graph.revisionHead(h.req(kMueller, 'graph.read', 'GRV', null, 'graph'), T(), D()) as unknown as { head: { revision: number } };
  const out = await graph.commitRevision(h.req(kMueller, 'graph.revision.commit', 'GRV', null, 'graph'), T(), D(), { payload: {
    idempotency_key: `b25-cx/${uuidv7()}`, expected_revision: read.head.revision,
    change_set: { ontology: { version_id: ONT },
      nodes: [{ ref: 'op', entity_type: 'organization', canonical_name: name, provenance: { claim_object_id: ent.id, claim_version: ent.version } }],
      identifiers: [],
      edges: [{ subject: { ref: 'op' }, predicate: 'ships_through', object: { entity_id: w.entityId }, valid_from: '2024-01-01T00:00:00Z', provenance: { claim_object_id: rel.id, claim_version: rel.version } }] } } } as never) as unknown as { revision: Row & { revision: number; edge_ids: Row[] } };
  return out.revision;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  w = await bootDecisionWorld(h);
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  graph = h.app.get(Gc); C = h.app.get(ContextController);
  // THE PEOPLE — each acting human with a session of their own (the ports compare the acting principal).
  eriksen = await h.humanWithSession(['forecast_owner'], 'b25-n-eriksen');
  kMueller = await h.humanWithSession(['knowledge_owner'], 'b25-k-mueller');
  analyst = await h.humanWithSession(['domain_analyst'], 'b25-analyst');
  steward = await h.humanWithSession(['ontology_steward'], 'b25-steward');
  outsider = await h.humanWithSession(['decision_owner'], 'b25-outsider');
  // THE CORRIDOR-LIKE SERIES: the fixture's synthetic transit source, with the strait as its SUBJECT (the corridor series' shape).
  const sourceKey = w.seriesKey.slice('fixture:'.length, -':value'.length);
  CORRIDOR = `b25-corridor:${sourceKey}:transits`;
  await w.prediction.registerSeries(h.req(eriksen, 'prediction.series.register', 'SER', null), T(), D(),
    { payload: { seriesKey: CORRIDOR, sourceKey, parserRef: 'sdmx-json-observations@1', valueField: 'OBS_VALUE', unit: 'transits/day', seasonalityDays: 7,
                 subjectEntityId: w.entityId, attribution: 'Source: fixture statistics.', description: 'SYNTHETIC daily strait transits, the corridor series shape' } });
  // THE ONTOLOGY (proposed by the analyst, approved by the steward) and THE FIRST OPERATOR's edge on the strait, before any freeze.
  const proposed = await graph.proposeOntology(h.req(analyst, 'graph.ontology.propose', 'ONT', null, 'graph'), T(), D(), { payload: {
    namespace: 'domain', entityTypes: ['organization', 'place', 'route'], rationale: 'B25 §CX: the corridor vocabulary a change set is validated against',
    predicates: [{ predicate: 'ships_through', subject_types: ['organization'], object_types: ['place'] }] } } as never) as unknown as { ontology: { version_id: string } };
  ONT = proposed.ontology.version_id;
  await graph.decideOntology(h.req(steward, 'graph.ontology.decide', 'ONT', ONT, 'graph'), T(), D(), ONT, { payload: { decision: 'approve', reason: 'B25 §CX: additive vocabulary, reviewed' } } as never);
  [B] = (await h.upload([{ filename: 'b25-cx-claims.csv', text: 'operator,strait\nHanse Meridian Shipping,Bab el-Mandeb\n', documentTime: '2024-01-10T00:00:00Z' }]))
    .map((u) => ({ id: u.id, version: u.version, digest: u.digest, bytesDigest: u.bytesDigest })) as [Evd];
  await operatorShipsThroughStrait('Hanse Meridian Shipping (SYNTHETIC)');
}, 600_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B25 §CX · grounded context, the frozen information set, the replay, the environment (0108; F-P4-03, V03-T-196)', () => {
  let setA: string; let corridorForecast: string; let corridorSet: string; let pinnedHead: number;

  it('CX1 · L6-C02 THE ASSEMBLER — the corridor series frozen at the database\'s instant: evidence, the strait, its edge and events, the twin\'s elements, the assumption as FEATURES; the refusals write nothing; the corrected request freezes; a subject-less series NAMES its gaps', async () => {
    const before = await count('prediction.information_sets');
    const now = await dbNow();
    // REFUSAL — the contract, the required input, the absences, the policy.
    const future = new Date(Date.parse(now) + 86_400_000).toISOString();
    const r1 = await refused(freeze(eriksen, { seriesKey: CORRIDOR, knownAt: future, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId] }));
    expect(r1).toMatchObject({ status: 422 }); expect(r1.message).toMatch(/^information set rejected \(contract\): the cut-off .* is later than the database's instant/);
    const r2 = await refused(freeze(eriksen, { seriesKey: CORRIDOR, knownAt: '2020-01-01T00:00:00Z', observedThrough: null, assumptions: [w.assumptionId] }));
    expect(r2).toMatchObject({ status: 422 }); expect(r2.message).toMatch(/^information set rejected \(incomplete\)/);
    const r3 = await refused(freeze(eriksen, { seriesKey: 'b25-no-such-series', knownAt: now, assumptions: [w.assumptionId] }));
    expect(r3).toMatchObject({ status: 404 }); expect(r3.message).toMatch(/^information set rejected \(unknown_series\)/);
    const r4 = await refused(freeze(eriksen, { seriesKey: CORRIDOR, knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [uuidv7()] }));
    expect(r4).toMatchObject({ status: 404 }); expect(r4.message).toMatch(/^information set rejected \(unknown_assumption\)/);
    const r5 = await refused(freeze(analyst, { seriesKey: CORRIDOR, knownAt: now, assumptions: [w.assumptionId] }));
    expect(r5.status).toBe(403);
    expect(await count('prediction.information_sets')).toBe(before);
    // RECOVERY + POSITIVE — the corrected request freezes.
    const out = (await freeze(eriksen, { seriesKey: CORRIDOR, knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId] })).informationSet;
    setA = out.informationSetId;
    const keys = out.features.map((f) => f.key);
    expect(keys).toEqual(expect.arrayContaining(['evidence.versions', 'graph.subject', 'graph.edges', 'graph.edges.ships_through', 'graph.events', 'twin.shock.corridor_delay_days',
      'twin.inventory.on_hand:SYN-PART-MAG', `assumption.${w.assumptionId}`]));
    const f = Object.fromEntries(out.features.map((x) => [x.key, x]));
    const evd = Number((await sql<{ n: string }>`select count(distinct object_id)::text n from objects.canonical_objects where object_type = 'EVD' and tenant_id = ${T()}::uuid and provenance_ref like ${`SRC:${h.fx.sourceId}@%`}`.execute(su)).rows[0]!.n);
    expect(f['evidence.versions']).toMatchObject({ source: `series:${CORRIDOR}`, value: evd });
    expect(f['graph.subject']).toMatchObject({ source: `graph.entity:${w.entityId}`, value: 'place' });
    expect(f['graph.edges.ships_through']).toMatchObject({ value: 1 });
    expect(f['twin.shock.corridor_delay_days']).toMatchObject({ source: `twin:${w.twinId}@v${w.v1}`, value: 14 });
    expect(f[`assumption.${w.assumptionId}`]).toMatchObject({ source: 'graph.strategy:ASU', value: 'unverified' });
    for (const x of out.features) expect(String(x['digest'])).toMatch(/^[0-9a-f]{64}$/);
    const row = (await sql<Row>`select manifest, manifest_digest, assembler_version, frozen_via, frozen_by::text, revision_head::int, twin_id::text, twin_version, series_key, subject_entity_id::text, coverage_gaps
      from prediction.information_sets where information_set_id = ${setA}::uuid`.execute(su)).rows[0]!;
    expect(row).toMatchObject({ assembler_version: 'assembler@1', frozen_via: 'prediction.information_set.freeze', frozen_by: eriksen.principalId, revision_head: await head(),
      twin_id: w.twinId, twin_version: w.v1, series_key: CORRIDOR, subject_entity_id: w.entityId, coverage_gaps: [] });
    expect(canonicalDigest(row['manifest'])).toBe(row['manifest_digest']);
    expect(await count('prediction.information_sets')).toBe(before + 1);
    const ev = (await sql<Row>`select event, details from prediction.information_set_events where information_set_id = ${setA}::uuid`.execute(su)).rows;
    expect(ev).toEqual([expect.objectContaining({ event: 'information_set.frozen', details: expect.objectContaining({ manifest_digest: row['manifest_digest'], via: 'prediction.information_set.freeze' }) })]);
    // A series with NO subject (the fixture's own): frozen, its gaps NAMED — no graph context, no twin; never refused for an optional input.
    const bare = (await freeze(eriksen, { seriesKey: w.seriesKey, knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId] })).informationSet;
    expect(bare.coverageGaps).toEqual([expect.stringMatching(/^graph\.subject: the series names no subject entity/)]);
    expect(bare.twin).toBeNull();
    console.log(`B25 CX1 EVIDENCE · set ${setA} · features ${keys.length} · digest ${String(row['manifest_digest']).slice(0, 12)} · refusals 422/422/404/404/403 wrote nothing · gaps named on the subject-less series`);
  });

  it('CX2 · V03-T-319 / AI-48-002 THE MANIFEST PINNED ON THE FORECAST — the grounded issue pins the set and the environment (row, FCT@v2, events); the seam resolves to the grounded freezer; a foreign pin, a changed pin, an edited set and the port\'s bindings are refused; the same issue with its own set stands', async () => {
    const now = await dbNow();
    // POSITIVE — the grounded issue.
    const g = (await issueGrounded(eriksen, { seriesKey: CORRIDOR, horizon: '30d', knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId], label: 'replay demonstration' })).forecast;
    corridorForecast = g.forecastId; CX2_FORECAST = g.forecastId; corridorSet = String(g.informationSet['id']); pinnedHead = Number((g.informationSet['graph'] as Row)['revision_head']);
    const fr = (await sql<Row>`select information_set_id::text, environment_digest, environment, known_at, series_key, method, method_version from prediction.forecasts_current where forecast_id = ${corridorForecast}::uuid`.execute(su)).rows[0]!;
    expect(fr).toMatchObject({ information_set_id: corridorSet, series_key: CORRIDOR, method: SEASONAL_NAIVE, method_version: '1' });
    expect(pinnedHead).toBe(await head());
    const obj = (await sql<Row>`select schema_ref, payload from objects.canonical_objects where object_id = ${corridorForecast}::uuid and object_type = 'FCT'`.execute(su)).rows[0]!;
    expect(obj['schema_ref']).toBe('FCT@v2');
    const pay = obj['payload'] as Row;
    expect(pay['information_set']).toMatchObject({ id: corridorSet, graph: { revision_head: pinnedHead, subject_entity_id: w.entityId, edges: 1 }, twin: { twin_id: w.twinId, version: w.v1 } });
    expect(pay['environment']).toEqual(fr['environment']);
    const events = (await sql<{ event: string }>`select event from prediction.forecast_events where forecast_id = ${corridorForecast}::uuid order by occurred_at, event`.execute(su)).rows.map((r) => r.event);
    expect(events).toEqual(['forecast.information_set_frozen', 'forecast.issued']);
    expect((await sql<Row>`select event, forecast_id::text from prediction.information_set_events where information_set_id = ${corridorSet}::uuid order by occurred_at`.execute(su)).rows)
      .toEqual([{ event: 'information_set.frozen', forecast_id: null }, { event: 'information_set.pinned', forecast_id: corridorForecast }]);
    // THE SEAM: CONTEXT_FREEZER resolves to the grounded freezer and freezes inside ANOTHER issuing action's transaction (§MR / §EN's way).
    const freezer = h.app.get<ContextFreezer>(CONTEXT_FREEZER);
    expect(freezer).toBeInstanceOf(GroundedContextFreezer);
    const viaSeam = await h.pipeline.write(h.env(eriksen, 'prediction.forecast.issue', 'FCT', null, 'prediction'), eriksen,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'prediction.forecast.issue', objectType: 'FCT', objectId: null }, (tx) => ({ tx }),
      async (cap) => ({ result: await freezer.freeze(cap, { tenantId: T(), domainId: D(), seriesKey: CORRIDOR, subjectEntityId: w.entityId, targetKey: null, knownAt: now,
        observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId], actor: eriksen.principalId, correlationId: uuidv7() }), targetType: 'FCT', targetId: null, targetVersion: null, outboxEvent: null }));
    expect(viaSeam.result).toMatchObject({ graph: { revisionHead: pinnedHead }, twin: { twinId: w.twinId, version: w.v1 } });
    expect((await sql<{ v: string }>`select frozen_via v from prediction.information_sets where information_set_id = ${viaSeam.result!.informationSetId}::uuid`.execute(su)).rows[0]!.v).toBe('prediction.forecast.issue');
    expect(freezer.environment('seasonal_naive@1')).toMatchObject({ facts: { implementation_digest: MODELS_IMPLEMENTATION_DIGEST } });

    // REFUSAL — a forecast naming ANOTHER series' set (the issue path's pin trigger).
    const subjectless = (await freeze(eriksen, { seriesKey: w.seriesKey, knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId] })).informationSet.informationSetId;
    const fs = h.app.get(ForecastingService);
    const issueWith = (columns: Row) => {
      const id = uuidv7(); const env = h.env(eriksen, 'prediction.forecast.issue', 'FCT', id, 'prediction');
      return h.pipeline.write(env, eriksen,
        { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'prediction.forecast.issue', objectType: 'FCT', objectId: id }, PredictionCapability.forecast,
        async (cap, scope) => {
          await fs.issue(cap, scope, { principal: eriksen, tenantId: T(), domainId: D(), correlationId: env.correlation_id, purposeId: 'prediction' }, {
            seriesKey: CORRIDOR, horizonCode: '90d', knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId], refreshCadence: 'daily', label: 'replay demonstration',
            b25: { columns } }, eriksen.principalId, env.correlation_id, 'prediction', id);
          return { result: id, targetType: 'FCT', targetId: id, targetVersion: '1', outboxEvent: null };
        });
    };
    const fBefore = await count('prediction.forecasts_current');
    const m1 = await refused(issueWith({ information_set_id: subjectless }));
    expect(m1).toMatchObject({ status: 422 }); expect(m1.message).toMatch(/^information set rejected \(mismatch\): set .* was frozen for series fixture:/);
    const m2 = await refused(issueWith({ information_set_id: uuidv7() }));
    expect(m2).toMatchObject({ status: 404 }); expect(m2.message).toMatch(/^information set rejected \(unknown_information_set\)/);
    expect(await count('prediction.forecasts_current')).toBe(fBefore);
    // REFUSAL — a pin never changes; a set is never edited.
    const changed = await refused(sql`update prediction.forecasts_current set information_set_id = ${setA}::uuid where forecast_id = ${corridorForecast}::uuid`.execute(su));
    expect(changed.message).toMatch(/^information set rejected \(state\): forecast .* pinned information set .* at issue; a pin is never changed/);
    expect(changed.status).toBe(409);
    const edited = await refused(sql`update prediction.information_sets set coverage_gaps = '[]'::jsonb where information_set_id = ${setA}::uuid`.execute(su));
    expect(edited.message).toMatch(/append-only/);
    // REFUSAL — the port binds what the manifest pins: a stale head, a twin pin and an evidence digest that are not the domain's.
    const portFreeze = (mutate: (m: Row) => void) => h.pipeline.write(h.env(eriksen, 'prediction.information_set.freeze', 'INS', null, 'prediction'), eriksen,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'prediction.information_set.freeze', objectType: 'INS', objectId: null }, ContextCapability.freeze,
      async (cap) => {
        const request = canonicalRequest({ seriesKey: CORRIDOR, subjectEntityId: w.entityId, targetKey: null, knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId] });
        const ctxRead = await cap.groundingContext({ seriesKey: CORRIDOR, knownAt: now, assumptions: [w.assumptionId], twin: null });
        const m = assembleManifest(request, ctxRead, { pdpBundle: PDP_BUNDLE_VERSION }).manifest as unknown as Row;
        mutate(m);
        const r = await cap.freezeSet({ setId: uuidv7(), tenantId: T(), domainId: D(), request: request as unknown as Row, manifest: m, manifestDigest: canonicalDigest(m),
          assemblerVersion: 'assembler@1', actor: eriksen.principalId, eventId: uuidv7(), correlationId: uuidv7() });
        return { result: r, targetType: 'INS', targetId: null, targetVersion: null, outboxEvent: null };
      });
    const sBefore = await count('prediction.information_sets');
    const stale = await refused(portFreeze((m) => { (m['graph'] as Row)['revision_head'] = pinnedHead - 1; }));
    expect(stale).toMatchObject({ status: 409 }); expect(stale.message).toMatch(/^information set rejected \(stale\): the manifest pins graph revision/);
    const twinPin = await refused(portFreeze((m) => { (m['twin'] as Row)['state_set_digest'] = 'f'.repeat(64); }));
    expect(twinPin).toMatchObject({ status: 422 }); expect(twinPin.message).toMatch(/^information set rejected \(mismatch\): the twin pin/);
    const evidence = await refused(portFreeze((m) => { ((m['evidence'] as Row[])[0] as Row)['evidence_digest'] = 'e'.repeat(64); }));
    expect(evidence).toMatchObject({ status: 422 }); expect(evidence.message).toMatch(/^information set rejected \(mismatch\): evidence /);
    const req = await refused(portFreeze((m) => { m['request'] = { ...(m['request'] as Row), observed_through: null }; }));
    expect(req).toMatchObject({ status: 422 }); expect(req.message).toMatch(/^information set rejected \(mismatch\): the manifest's request/);
    expect(await count('prediction.information_sets')).toBe(sBefore);
    // RECOVERY — the same 90-day issue with its OWN set: the port answers, the pin binds.
    const own = (await freeze(eriksen, { seriesKey: CORRIDOR, knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId] })).informationSet.informationSetId;
    const ok = await issueWith({ information_set_id: own });
    expect((await sql<{ s: string }>`select information_set_id::text s from prediction.forecasts_current where forecast_id = ${ok.result}::uuid`.execute(su)).rows[0]!.s).toBe(own);
    console.log(`B25 CX2 EVIDENCE · forecast ${corridorForecast} pins set ${corridorSet} (head ${pinnedHead}, twin v${w.v1}) · FCT@v2 · seam → GroundedContextFreezer · refusals mismatch/unknown/state/append-only/stale/twin/evidence/request · recovery pinned ${own}`);
  });

  it('CX3 · V00-T-009 UNDERSTAND BEFORE PREDICTING — the grounding shows the strait, its relationship, its events, the twin\'s mechanism and the assumption as the forecast\'s inputs; the legacy issue stays ungrounded (default-off) and cannot be replayed; the same question issued grounded can', async () => {
    const got = (await grounding(eriksen, corridorForecast)).grounding;
    expect(got.grounded).toBe(true);
    const set = got.set as Row; const manifest = set['manifest'] as Row;
    expect((manifest['graph'] as Row)['subject']).toMatchObject({ entity_id: w.entityId, entity_type: 'place', lifecycle: 'active' });
    expect((manifest['graph'] as Row)['edge_count']).toBe(1);
    expect((manifest['twin'] as Row)).toMatchObject({ twin_id: w.twinId, version: w.v1, mode: 'head' });
    const features = manifest['features'] as Row[];
    expect(features.find((x) => x['key'] === 'twin.shock.corridor_delay_days')).toMatchObject({ value: 14 });
    expect(manifest['assumptions']).toEqual([expect.objectContaining({ id: w.assumptionId, version: 1, verification_state: 'unverified' })]);
    expect(manifest['policy']).toMatchObject({ pdp_bundle: PDP_BUNDLE_VERSION, ontology: { version_id: ONT } });
    // REFUSAL — the legacy issue is unchanged: ungrounded, FCT@v1, no new event; its replay refused.
    const now = await dbNow();
    const legacy = (await legacyIssue(eriksen, { seriesKey: CORRIDOR, horizon: '180d', knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId] })).forecast.forecastId;
    const lr = (await sql<Row>`select information_set_id, environment, environment_digest from prediction.forecasts_current where forecast_id = ${legacy}::uuid`.execute(su)).rows[0]!;
    expect(lr).toEqual({ information_set_id: null, environment: null, environment_digest: null });
    expect((await sql<{ s: string }>`select schema_ref s from objects.canonical_objects where object_id = ${legacy}::uuid`.execute(su)).rows[0]!.s).toBe('FCT@v1');
    expect((await sql<{ event: string }>`select event from prediction.forecast_events where forecast_id = ${legacy}::uuid`.execute(su)).rows.map((r) => r.event)).toEqual(['forecast.issued']);
    expect((await grounding(eriksen, legacy)).grounding).toMatchObject({ grounded: false, set: null });
    const r = await refused(replay(eriksen, legacy));
    expect(r).toMatchObject({ status: 422 }); expect(r.message).toMatch(/^forecast replay rejected \(ungrounded\)/);
    // RECOVERY — the same question issued grounded.
    const again = (await issueGrounded(eriksen, { seriesKey: CORRIDOR, horizon: '180d', knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId] })).forecast.forecastId;
    expect((await grounding(eriksen, again)).grounding.grounded).toBe(true);
    console.log(`B25 CX3 EVIDENCE · grounded ${corridorForecast}: strait + 1 edge + events + twin v${w.v1} (corridor delay 14 days) + ASU v1 · legacy ${legacy} ungrounded FCT@v1, replay 422 · re-issued grounded ${again}`);
  });

  it('CX4 · V03-T-127 LINEAGE — forecast → set → every evidence version, the edge\'s claim and evidence, the twin version\'s digests, the ASU\'s version resolve in the database; a principal with no read role is refused; the analyst reads it', async () => {
    const set = (await sql<Row>`select evidence, graph, twin, assumptions, manifest from prediction.information_sets where information_set_id = ${corridorSet}::uuid`.execute(su)).rows[0]!;
    for (const e of set['evidence'] as Row[]) {
      const ok = (await sql<{ n: string }>`select count(*)::text n from objects.canonical_objects where object_type = 'EVD' and object_id = ${String(e['evidence_object_id'])}::uuid
        and object_version = ${Number(e['evidence_version'])} and payload ->> 'content_digest' = ${String(e['evidence_digest'])}`.execute(su)).rows[0]!.n;
      expect(ok).toBe('1');
    }
    const fcEvidence = (await sql<{ e: Row[] }>`select evidence_refs e from prediction.forecasts_current where forecast_id = ${corridorForecast}::uuid`.execute(su)).rows[0]!.e;
    const pinned = new Set((set['evidence'] as Row[]).map((e) => `${String(e['evidence_object_id'])}@${String(e['evidence_version'])}`));
    for (const e of fcEvidence) expect(pinned.has(`${String(e['evidence_object_id'])}@${String(e['evidence_version'])}`)).toBe(true);
    const ctxEdges = ((set['manifest'] as Row)['graph'] as Row);
    expect(ctxEdges['edge_count']).toBe(1);
    const ctxRead = (await h.pipeline.consequentialRead(h.env(analyst, 'prediction.information_set.read', 'INS', null, 'prediction'), analyst,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'prediction.information_set.read', objectType: 'INS', objectId: null }, ContextCapability.read,
      async (cap) => cap.groundingContext({ seriesKey: CORRIDOR, knownAt: String((set['manifest'] as Row & { request: Row })['request']['known_at']), assumptions: [w.assumptionId], twin: null }))).result;
    const edge = (ctxRead['edges'] as Row[])[0]!;
    const claim = (await sql<{ n: string }>`select count(*)::text n from intelligence.claim_lineage where claim_object_id = ${String(edge['claim_object_id'])}::uuid and claim_version = ${Number(edge['claim_version'])}
      and evidence_object_id = ${String(edge['evidence_object_id'])}::uuid and evidence_digest = ${String(edge['evidence_digest'])}`.execute(su)).rows[0]!.n;
    expect(claim).toBe('1');
    const twin = set['twin'] as Row;
    const tv = (await sql<Row>`select state_set_digest, header_digest from twin.twin_versions where twin_id = ${String(twin['twin_id'])}::uuid and version = ${Number(twin['version'])}`.execute(su)).rows[0]!;
    expect(tv).toEqual({ state_set_digest: twin['state_set_digest'], header_digest: twin['header_digest'] });
    const asu = (set['assumptions'] as Row[])[0]!;
    expect((await sql<{ n: string }>`select count(*)::text n from objects.canonical_objects where object_type = 'ASU' and object_id = ${String(asu['id'])}::uuid and object_version = ${Number(asu['version'])}`.execute(su)).rows[0]!.n).toBe('1');
    // REFUSAL — no read role; RECOVERY — the analyst.
    expect((await refused(grounding(outsider, corridorForecast))).status).toBe(403);
    const read = (await grounding(analyst, corridorForecast)).grounding;
    expect(read).toMatchObject({ grounded: true, forecast: { forecast_id: corridorForecast, information_set_id: corridorSet } });
    const listed = await C.list(h.req(analyst, 'prediction.information_set.read', 'INS', null), T(), D(), { payload: { seriesKey: CORRIDOR } }) as unknown as { sets: Row[] };
    expect(listed.sets.map((s) => s['information_set_id'])).toContain(corridorSet);
    const got = await C.get(h.req(analyst, 'prediction.information_set.read', 'INS', corridorSet), T(), D(), corridorSet) as unknown as { informationSet: Row & { forecasts: Row[] } };
    expect(got.informationSet.forecasts.map((x) => x['forecast_id'])).toContain(corridorForecast);
    console.log(`B25 CX4 EVIDENCE · ${(set['evidence'] as Row[]).length} evidence versions, claim ${String(edge['claim_object_id']).slice(0, 8)}@${String(edge['claim_version'])}, twin v${String(twin['version'])} digests, ASU v${String(asu['version'])} resolved · outsider 403 · analyst reads`);
  });

  it('CX5 · THE REPLAY and THE SCENE — REPRODUCED; after K. Müller\'s later change set the replay is unchanged while a fresh grounding differs; a replaced implementation DIVERGES (the environment difference reported); restored, it reproduces; the analyst and an unknown forecast are refused', async () => {
    const r0 = (await replay(eriksen, corridorForecast)).replay;
    expect(r0).toMatchObject({ outcome: 'REPRODUCED', diverged: [], environment: { match: true, differences: [] } });
    expect(r0.fresh.differs).toBe(false);
    // THE LATER GRAPH CHANGE: K. Müller commits a second operator shipping through the strait.
    const commit = await operatorShipsThroughStrait('NORDWERK Antriebstechnik GmbH (SYNTHETIC)');
    expect(commit.revision).toBeGreaterThan(pinnedHead);
    const r1 = (await replay(eriksen, corridorForecast)).replay;
    expect(r1).toMatchObject({ outcome: 'REPRODUCED', diverged: [] });
    expect((r1['manifest'] as Row)['replayed']).toBe((r1['manifest'] as Row)['original']);
    expect(r1.fresh).toMatchObject({ differs: true, revision_head: commit.revision });
    expect(r1.fresh.what).toEqual(expect.arrayContaining(['graph.revision_head', 'graph.edges', 'feature:graph.edges.ships_through']));
    const rows = (await sql<Row>`select outcome, environment_match, fresh, original_manifest_digest = replayed_manifest_digest as same from prediction.forecast_replays where forecast_id = ${corridorForecast}::uuid order by replayed_at`.execute(su)).rows;
    expect(rows.map((x) => [x['outcome'], x['same'], x['environment_match']])).toEqual([['REPRODUCED', true, true], ['REPRODUCED', true, true]]);
    // A REPLACED IMPLEMENTATION (the same method reference, another digest, another computation): DIVERGED; the environment says why.
    const prior = registerForecastMethod('seasonal-naive@1', { implementationDigest: 'e'.repeat(64),
      compute: (p, s, m) => { const o = legacyOutput(SEASONAL_NAIVE, p, s, m); return { ...o, quantiles: { ...o.quantiles, q50: o.quantiles.q50 + 1 } }; } });
    let r2: Awaited<ReturnType<typeof replay>>['replay'];
    try { r2 = (await replay(eriksen, corridorForecast)).replay; } finally { restoreForecastMethod('seasonal-naive@1', prior); }
    expect(r2.outcome).toBe('DIVERGED');
    expect(r2.diverged.map((d) => d.what)).toEqual(['output']);
    expect(r2.environment).toMatchObject({ match: false, differences: ['implementation_digest'] });
    // RECOVERY — the implementation restored: reproduced again.
    expect((await replay(eriksen, corridorForecast)).replay.outcome).toBe('REPRODUCED');
    // REFUSAL — the analyst (no replay role), an unknown forecast (the port's 404).
    const nBefore = await count('prediction.forecast_replays');
    expect((await refused(replay(analyst, corridorForecast))).status).toBe(403);
    const unknown = await refused(replay(eriksen, uuidv7()));
    expect(unknown).toMatchObject({ status: 404 }); expect(unknown.message).toMatch(/^forecast replay rejected \(unknown_forecast\)/);
    expect(await count('prediction.forecast_replays')).toBe(nBefore);
    const evs = (await sql<{ event: string; outcome: string }>`select event, details ->> 'outcome' outcome from prediction.forecast_events where forecast_id = ${corridorForecast}::uuid and event = 'forecast.replayed' order by occurred_at`.execute(su)).rows;
    expect(evs.map((e) => e.outcome)).toEqual(['REPRODUCED', 'REPRODUCED', 'DIVERGED', 'REPRODUCED']);
    const pinnedNow = (await sql<Row>`select revision_head::int h, twin_version v from prediction.information_sets where information_set_id = ${corridorSet}::uuid`.execute(su)).rows[0]!;
    expect(pinnedNow).toEqual({ h: pinnedHead, v: w.v1 });
    console.log(`B25 CX5 EVIDENCE · the scene: forecast ${corridorForecast} pins head ${pinnedHead} + twin v${w.v1}; K. Müller's change set → head ${commit.revision}; replay REPRODUCED (manifest ${String((r1['manifest'] as Row)['original']).slice(0, 12)}) while the fresh grounding differs in ${r1.fresh.what.join(', ')} · replaced implementation → DIVERGED (output; environment implementation_digest) · restored → REPRODUCED · analyst 403 · unknown 404`);
  });

  it('CX6 · V03-T-196 THE ENVIRONMENT — node, platform, arch, the method reference, its implementation digest and the assembler, digested on the row and in the payload; an environment without its digest is refused; the grounded issue records both', async () => {
    const fr = (await sql<Row>`select environment, environment_digest from prediction.forecasts_current where forecast_id = ${corridorForecast}::uuid`.execute(su)).rows[0]!;
    const env = fr['environment'] as Row;
    expect(env).toMatchObject({ node: process.version, platform: process.platform, arch: process.arch, method_ref: `${SEASONAL_NAIVE}@1`, implementation_digest: MODELS_IMPLEMENTATION_DIGEST,
      implementation: 'registered', assembler_version: 'assembler@1', digest: fr['environment_digest'] });
    const { digest: _d, ...facts } = env;
    expect(canonicalDigest(facts)).toBe(fr['environment_digest']);
    // REFUSAL — an environment recorded without its digest (the prelude's pair constraint), through the one issue path.
    const fs = h.app.get(ForecastingService); const now = await dbNow(); const id = uuidv7(); const env6 = h.env(eriksen, 'prediction.forecast.issue', 'FCT', id, 'prediction');
    const bad = await refused(h.pipeline.write(env6, eriksen,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'prediction.forecast.issue', objectType: 'FCT', objectId: id }, PredictionCapability.forecast,
      async (cap, scope) => {
        await fs.issue(cap, scope, { principal: eriksen, tenantId: T(), domainId: D(), correlationId: env6.correlation_id, purposeId: 'prediction' }, {
          seriesKey: CORRIDOR, horizonCode: '1y', knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId], refreshCadence: 'daily', label: 'replay demonstration',
          b25: { columns: { environment: { node: process.version } } } }, eriksen.principalId, env6.correlation_id, 'prediction', id);
        return { result: id, targetType: 'FCT', targetId: id, targetVersion: '1', outboxEvent: null };
      }));
    expect(bad.status).toBe(409); expect(String((bad as { raw?: string }).raw)).toMatch(/fct_environment_pair/);
    expect((await sql<{ n: string }>`select count(*)::text n from prediction.forecasts_current where forecast_id = ${id}::uuid`.execute(su)).rows[0]!.n).toBe('0');
    // RECOVERY — the grounded issue at the same horizon records the pair.
    const ok = (await issueGrounded(eriksen, { seriesKey: CORRIDOR, horizon: '1y', knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId] })).forecast;
    expect(ok.environment).toMatchObject({ method_ref: `${SEASONAL_NAIVE}@1`, digest: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect((await sql<{ d: string }>`select environment_digest d from prediction.forecasts_current where forecast_id = ${ok.forecastId}::uuid`.execute(su)).rows[0]!.d).toBe(ok.environment['digest']);
    console.log(`B25 CX6 EVIDENCE · environment ${String(fr['environment_digest']).slice(0, 12)} = sha256(JCS(${Object.keys(facts).sort().join(',')})) · pair refused 409 · grounded 1y records it`);
  });
});

/* ═════════════════════════ B25 completion — G1 features as model inputs, G2 the replay of routed forecasts, G7 the pins ═════════════════════════ */
describe('B25 completion · the routed families grounded: features as inputs (G1), their replay (G2), the target version and evaluation profile pinned (G7)', () => {
  let rg: RegistryController; let petrovic: AuthenticatedPrincipal; let richter: AuthenticatedPrincipal;
  let F5Y = ''; let F30 = ''; let F1Y = ''; let BAYES_METHOD_ID = '';
  const TARGET = 'corridor.cx.transit-regime';
  const r = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'prediction');
  const approve = async (payload: Row): Promise<Row> => {
    const m = (await rg.propose(r(eriksen, 'prediction.registry.method.propose', 'FMR'), T(), D(), { payload }) as { method: Row }).method;
    return (await rg.decide(r(petrovic, 'prediction.registry.method.approve', 'FMR', String(m['method_id'])), T(), D(), String(m['method_id']),
      { payload: { decision: 'approve', note: 'the declarations and the conditions were reviewed (SYNTHETIC)' } }) as { method: Row }).method;
  };
  const issue = (payload: Row) => rg.issue(r(eriksen, 'prediction.portfolio.issue', 'FCT'), T(), D(), { payload }) as Promise<{ forecast: Row }>;
  const CATS = [{ key: 'closed', label: 'closed', rule: { comparator: '<', threshold: 45 } }, { key: 'disrupted', label: 'disrupted', rule: { comparator: '<', threshold: 58 } }, { key: 'open', label: 'open', rule: null }];
  const JUDGEMENT = () => ({ pseudo_counts: { closed: 2, disrupted: 6, open: 12 }, rationale: 'escalation risk in the strait over five years (SYNTHETIC judgement)', judged_by: eriksen.principalId });
  const TWIN_CONDITION = { feature: 'twin.shock.corridor_delay_days', comparator: '>=', threshold: 10, regime: 'disrupted', pseudo_count: 4, rationale: 'the twin\'s two-week corridor delay weighs towards disruption (SYNTHETIC)' };
  const GRAPH_CONDITION = { feature: 'graph.edges.ships_through', comparator: '>=', threshold: 1, regime: 'closed', pseudo_count: 1, rationale: 'an operator routed through the strait is exposed to its closure (SYNTHETIC)' };
  const OPTIONS = [{ key: 'hold', label: 'hold safety stock', cost: 2, payoff: { closed: 8, disrupted: 6, open: 3 } }, { key: 'reroute', label: 'reroute via the Cape', cost: 4, payoff: { closed: 10, disrupted: 7, open: 1 } }];
  const NL = { model: 'normal_linear', window_days: 60, intercept: { mean: 60, sd: 20 }, slope_per_year: { mean: 0, sd: 2 } };
  const rules = (): Row => ({
    '30d': { treatment: 'intervention windows and freshness', allowed_families: ['event', 'statistical', 'bayesian'], kinds: { event: { confidence_language: 'probability', validation: { required: false } }, quantity: { confidence_language: 'distribution', validation: { required: false } } } },
    '90d': { treatment: 'operational planning', allowed_families: ['statistical', 'bayesian'], kinds: { quantity: { confidence_language: 'distribution', validation: { required: false } } } },
    '180d': { treatment: 'budget and capacity', allowed_families: ['statistical', 'bayesian'], kinds: { quantity: { confidence_language: 'distribution_with_scenarios', validation: { required: false } } } },
    '1y': { treatment: 'annual planning', allowed_families: ['statistical', 'bayesian'], kinds: { quantity: { confidence_language: 'distribution_with_scenarios', validation: { required: false } } } },
    '3y': { treatment: 'regimes and path dependence', allowed_families: ['structural_judgmental', 'bayesian'], kinds: { regime: { confidence_language: 'scenario_language', validation: { required: false } },
            quantity: { confidence_language: 'distribution_with_scenarios', validation: { required: true, kind: 'quantity_rolling_origin', min_origins: 20, modes: ['historical', 'retrospective'] } } } },
    '5y': { treatment: 'regimes, path dependence, option value and resilience: scenario language', allowed_families: ['structural_judgmental', 'bayesian'], kinds: { regime: { confidence_language: 'scenario_language', validation: { required: false } },
            quantity: { confidence_language: 'distribution_with_scenarios', validation: { required: true, kind: 'quantity_rolling_origin', min_origins: 20, modes: ['historical', 'retrospective'] } } } },
  });
  const routeOf = async (routeId: string) => (await sql<Row>`select outcome, refusal_class, forecast_id::text from prediction.forecast_routes where route_id = ${routeId}::uuid`.execute(su)).rows[0];

  it('CX7 · G1 FEATURES AS MODEL INPUTS — a routed 5y regime conditioned on the TWIN\'s corridor delay and the GRAPH\'s strait edges reads both from the frozen set; a condition on an absent or non-scalar feature is refused (context); the corrected version issues', async () => {
    const { RegistryController: Rc } = await import('../../src/prediction/registry/registry.controller.js');
    rg = h.app.get(Rc);
    petrovic = await h.humanWithSession(['method_steward'], 'b25-h-petrovic');
    richter = await h.humanWithSession(['domain_admin'], 'b25-t-richter');
    // the registry the act stages, SYNTHETIC: the entries (N. Eriksen proposes, H. Petrović approves), the target with the strait as subject
    // (T. Richter approves), the horizon policy (H. Petrović concurs)
    await approve({ methodKey: 'event_rate', family: 'event', horizons: ['30d'], steward: petrovic.principalId, description: 'P(event within the window), Beta prior (SYNTHETIC)', declarations: { prior: { alpha: 1, beta: 1 } }, parameters: { min_windows: 6 } });
    await approve({ methodKey: 'regime_judgement', family: 'structural_judgmental', forecastKinds: ['regime'], horizons: ['5y'], steward: petrovic.principalId,
      description: 'Regime probabilities from the structural judgement and counted windows (SYNTHETIC) — version 1, before the conditions', declarations: { judgement: JUDGEMENT() } });
    await approve({ methodKey: 'regime_judgement', version: 2, family: 'structural_judgmental', forecastKinds: ['regime'], horizons: ['5y'], steward: petrovic.principalId,
      description: 'Regime probabilities from the structural judgement, counted windows and conditions on the frozen twin and graph features (SYNTHETIC)',
      declarations: { judgement: JUDGEMENT(), conditions: [TWIN_CONDITION, GRAPH_CONDITION], options: OPTIONS } });
    BAYES_METHOD_ID = String((await approve({ methodKey: 'bayes_level', family: 'bayesian', horizons: ['1y'], steward: petrovic.principalId, description: 'Normal–linear level, explicit priors (SYNTHETIC)',
      declarations: { prior: NL, alternatives: [{ label: 'a wider prior', prior: { ...NL, intercept: { mean: 60, sd: 40 } } }] } }))['method_id']);
    const t = (await rg.declareTarget(r(eriksen, 'prediction.registry.target.declare', 'FTG'), T(), D(), { payload: { targetKey: TARGET, kind: 'event', unit: 'probability', title: 'Strait transit regime (SYNTHETIC corridor)',
      subjectEntityId: w.entityId, definition: { series_key: CORRIDOR, event: { comparator: '<', threshold: 41, consecutive: 5 }, horizon_kinds: { '5y': 'regime' }, regime: { classification_window_days: 90, categories: CATS } },
      sources: { series: [CORRIDOR], twin_elements: ['shock.corridor_delay_days'], graph: ['graph.edges.ships_through'] } } }) as { target: Row }).target;
    await rg.decideTarget(r(richter, 'prediction.registry.target.approve', 'FTG', String(t['target_id'])), T(), D(), String(t['target_id']), { payload: { decision: 'approve', note: 'the definition is the indicator\'s (SYNTHETIC)' } });
    const pol = (await rg.publishPolicy(r(eriksen, 'prediction.registry.policy.publish', 'HZP'), T(), D(), { payload: { riskClass: 'standard', statement: 'the corridor\'s horizon treatment (SYNTHETIC)', steward: petrovic.principalId, rules: rules() } }) as { policy: Row }).policy;
    await rg.concurPolicy(r(petrovic, 'prediction.registry.policy.concur', 'HZP', String(pol['policy_id'])), T(), D(), String(pol['policy_id']), { payload: { decision: 'concur', note: 'the treatment table is right (SYNTHETIC)' } });

    // POSITIVE — the routed 5y regime, grounded: the twin and graph features read from the frozen set
    const now = await dbNow();
    const a = await issue({ targetKey: TARGET, horizon: '5y', knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId], methodRef: 'regime_judgement@2' });
    F5Y = String(a.forecast['forecastId']);
    expect(a.forecast).toMatchObject({ method_ref: 'regime_judgement@2', forecast_kind: 'regime', validation_state: 'scenario_language' });
    const o = a.forecast['outcome'] as Row;
    const used = o['features_used'] as Row[];
    expect(used.map((x) => [x['key'], x['value'], x['held']])).toEqual([['twin.shock.corridor_delay_days', 14, true], ['graph.edges.ships_through', 2, true]]);
    const set = (await sql<Row>`select manifest from prediction.information_sets where information_set_id = ${String(a.forecast['information_set_id'])}::uuid`.execute(su)).rows[0]!['manifest'] as Row;
    const frozen = Object.fromEntries((set['features'] as Row[]).map((x) => [String(x['key']), x]));
    for (const u of used) expect(u['digest']).toBe(frozen[String(u['key'])]!['digest']);
    expect((o['judgement'] as Row)['conditioned_pseudo_counts']).toEqual({ closed: 3, disrupted: 10, open: 12 });
    expect(String(a.forecast['statement'])).toMatch(/Conditions on the frozen features: twin\.shock\.corridor_delay_days = 14 >= 10 HELD \(\+4 to disrupted\); graph\.edges\.ships_through = 2 >= 1 HELD \(\+1 to closed\)/);
    // G6 rides beside it: the path-dependent view and the declared options' value and resilience
    expect((o['path_dependence'] as Row)['current']).toBe('open');
    expect((o['options'] as Row)['option_value'] as number).toBeGreaterThanOrEqual(0);
    expect(String(a.forecast['statement'])).toMatch(/THE PATH-DEPENDENT VIEW .* OPTION VALUE AND RESILIENCE/);

    // REFUSAL — a condition on a feature the frozen set does not carry; one on a feature with no scalar value: refused, ledgered, nothing issued
    await approve({ methodKey: 'regime_toll', family: 'structural_judgmental', forecastKinds: ['regime'], horizons: ['5y'], steward: petrovic.principalId, description: 'conditioned on a canal toll the twin does not carry (SYNTHETIC)',
      declarations: { judgement: JUDGEMENT(), conditions: [{ ...TWIN_CONDITION, feature: 'twin.route.canal_toll' }] } });
    await approve({ methodKey: 'regime_shipment', family: 'structural_judgmental', forecastKinds: ['regime'], horizons: ['5y'], steward: petrovic.principalId, description: 'conditioned on a shipment row, not a scalar (SYNTHETIC)',
      declarations: { judgement: JUDGEMENT(), conditions: [{ ...TWIN_CONDITION, feature: 'twin.shipment:SYN-SHIP-4472', comparator: '=', threshold: 'x' }] } });
    const fBefore = await count('prediction.forecasts_current');
    const absent = await refused(issue({ targetKey: TARGET, horizon: '5y', knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId], methodRef: 'regime_toll@1' }));
    expect(absent.status).toBe(422); expect(absent.message).toMatch(/^forecast rejected \(context\): regime_toll@1's condition\(s\) cannot be read from the frozen information set — twin\.route\.canal_toll is not a feature of the frozen information set/);
    const shipment = await refused(issue({ targetKey: TARGET, horizon: '5y', knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId], methodRef: 'regime_shipment@1' }));
    expect(shipment.status).toBe(422); expect(shipment.message).toMatch(/^forecast rejected \(context\): .*twin\.shipment:SYN-SHIP-4472 has no scalar value/);
    expect(await count('prediction.forecasts_current')).toBe(fBefore);
    const refusedRoutes = (await sql<Row>`select outcome, refusal_class from prediction.forecast_routes where tenant_id = ${T()}::uuid and refusal_class = 'context'
      and (refusal like 'forecast rejected (context): regime_toll@1%' or refusal like 'forecast rejected (context): regime_shipment@1%')`.execute(su)).rows;
    expect(refusedRoutes).toEqual([{ outcome: 'refused', refusal_class: 'context' }, { outcome: 'refused', refusal_class: 'context' }]);
    expect((await sql<Row>`select state from prediction.forecast_methods where tenant_id = ${T()}::uuid and method_ref = 'regime_toll@1'`.execute(su)).rows[0]).toEqual({ state: 'approved' });
    // RECOVERY — the steward's corrected version (the condition on the twin's corridor delay) issues
    await approve({ methodKey: 'regime_toll', version: 2, family: 'structural_judgmental', forecastKinds: ['regime'], horizons: ['5y'], steward: petrovic.principalId, description: 'the condition corrected to the twin\'s corridor delay (SYNTHETIC)',
      declarations: { judgement: JUDGEMENT(), conditions: [TWIN_CONDITION] } });
    const ok = await issue({ targetKey: TARGET, horizon: '5y', knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId], methodRef: 'regime_toll@2' });
    expect(((ok.forecast['outcome'] as Row)['features_used'] as Row[]).map((x) => x['key'])).toEqual(['twin.shock.corridor_delay_days']);
    console.log(`B25 CX7 EVIDENCE · G1 · ${F5Y} regime_judgement@2: twin.shock.corridor_delay_days = 14 held, graph.edges.ships_through = 2 held → conditioned pseudo-counts 3/10/12 · absent and non-scalar features refused (context) · regime_toll@2 issued`);
  });

  it('CX8 · G2 THE REPLAY OF ROUTED FORECASTS — the twin-conditioned regime, the event and the bayesian forecasts REPRODUCED; after a later TWIN version and graph change the regime still REPRODUCED while a fresh grounding differs; the entry pinned to other bytes DIVERGES (implementation); restored, it reproduces', async () => {
    const now = await dbNow();
    F30 = String((await issue({ targetKey: TARGET, horizon: '30d', knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId], methodRef: 'event_rate@1' })).forecast['forecastId']);
    F1Y = String((await issue({ seriesKey: CORRIDOR, horizon: '1y', knownAt: now, observedThrough: OBSERVED_THROUGH, assumptions: [w.assumptionId], methodRef: 'bayes_level@1' })).forecast['forecastId']);
    // POSITIVE — each routed family recomputed from the frozen set (the registry's replayer, through the shared register)
    for (const id of [F5Y, F30, F1Y]) {
      const x = (await replay(eriksen, id)).replay;
      expect(x, JSON.stringify(x.diverged)).toMatchObject({ outcome: 'REPRODUCED', diverged: [], environment: { match: true } });
      expect((x['replayer'] as Row)['replayer']).toBe('registry-family@1');
      expect(((x['replayer'] as Row)['implementation'] as Row)['match']).toBe(true);
    }
    const rr = (await replay(eriksen, F5Y)).replay;
    expect(((rr['replayer'] as Row)['target'] as Row)).toMatchObject({ target_key: TARGET, version: 1, resolved_by: expect.stringMatching(/outcome_spec\.target/) });
    expect((((rr['replayer'] as Row)['features'] as Row)['used'] as Row[]).map((x) => [x['key'], x['value']])).toEqual([['twin.shock.corridor_delay_days', 14], ['graph.edges.ships_through', 2]]);
    // THE LATER TWIN VERSION (the corridor delay 14 → 21 days, admitted on actual) and a later graph change
    const tw = w.twinOwner;
    const o = await w.twins.openVersion(h.req(tw, 'twin.version', 'TWN', w.twinId), T(), D(), w.twinId, { payload: { branchId: 'actual', knownAt: await dbNow(), observedThrough: '2024-01-24' } }) as { version: { version: number } };
    const elements = (completeElements(w.records) as Row[]).map((e) => (e['key'] === 'shock.corridor_delay_days' ? { ...e, value: 21 } : e));
    await w.twins.ground(h.req(tw, 'twin.ground', 'TWN', w.twinId), T(), D(), w.twinId, String(o.version.version), { payload: { elements } });
    await w.twins.admit(h.req(tw, 'twin.version.admit', 'TWN', w.twinId), T(), D(), w.twinId, String(o.version.version), { payload: {} });
    const commit = await operatorShipsThroughStrait('Rotterdam Feeder Lines (SYNTHETIC)');
    const after = (await replay(eriksen, F5Y)).replay;
    expect(after, JSON.stringify(after.diverged)).toMatchObject({ outcome: 'REPRODUCED', diverged: [] });
    expect(after.fresh).toMatchObject({ differs: true, revision_head: commit.revision, twin: { twin_id: w.twinId, version: o.version.version } });
    expect(after.fresh.what).toEqual(expect.arrayContaining(['graph.revision_head', 'twin', 'feature:twin.shock.corridor_delay_days', 'feature:graph.edges.ships_through']));
    // REFUSAL — the entry pinned to other bytes (STATED SUPERUSER MOVE, as if approved for a build that is no longer this one): not re-run, DIVERGED
    const pinned = (await sql<{ d: string }>`select implementation_digest d from prediction.forecast_methods where method_id = ${BAYES_METHOD_ID}::uuid`.execute(su)).rows[0]!.d;
    await sql`update prediction.forecast_methods set implementation_digest = ${'0'.repeat(64)} where method_id = ${BAYES_METHOD_ID}::uuid`.execute(su);
    let mismatch: Awaited<ReturnType<typeof replay>>['replay'];
    try { mismatch = (await replay(eriksen, F1Y)).replay; } finally { await sql`update prediction.forecast_methods set implementation_digest = ${pinned} where method_id = ${BAYES_METHOD_ID}::uuid`.execute(su); }
    expect(mismatch.outcome).toBe('DIVERGED');
    expect(mismatch.diverged.map((d) => d.what)).toEqual(['implementation']);
    expect(mismatch.diverged[0]).toMatchObject({ original: '0'.repeat(64), replayed: pinned });
    expect((mismatch['output'] as Row)['replayed']).toBeNull();
    // RECOVERY — the pin restored: reproduced again
    expect((await replay(eriksen, F1Y)).replay.outcome).toBe('REPRODUCED');
    const outcomes = (await sql<{ outcome: string }>`select outcome from prediction.forecast_replays where forecast_id = ${F1Y}::uuid order by replayed_at`.execute(su)).rows.map((x) => x.outcome);
    expect(outcomes).toEqual(['REPRODUCED', 'DIVERGED', 'REPRODUCED']);
    console.log(`B25 CX8 EVIDENCE · G2 · regime ${F5Y}, event ${F30}, bayesian ${F1Y} REPRODUCED by registry-family@1 · twin v${o.version.version} (delay 21) + head ${commit.revision}: the regime still REPRODUCED, the fresh grounding differs in ${after.fresh.what.length} section(s) · digest mismatch → DIVERGED (implementation) · restored → REPRODUCED`);
  });

  it('CX9 · G7 THE PINS — the routed forecast pins the target version with its definition digest and the evaluation profile (row, package); the manifest pins the target key and the horizon policy; the grounded legacy issue pins its profile; an edited definition DIVERGES its replay; restored, it reproduces', async () => {
    const row = (await sql<Row>`select outcome_spec, horizon_policy, information_set_id::text from prediction.forecasts_current where forecast_id = ${F30}::uuid`.execute(su)).rows[0]!;
    const def = (await sql<Row>`select definition, target_id::text from prediction.forecast_targets where tenant_id = ${T()}::uuid and target_key = ${TARGET} and version = 1`.execute(su)).rows[0]!;
    const pin = { target_key: TARGET, version: 1, kind: 'event', unit: 'probability', definition_digest: canonicalDigest(def['definition']) };
    expect((row['outcome_spec'] as Row)['target']).toEqual(pin);
    const hp = row['horizon_policy'] as Row; const profile = hp['evaluation_profile'] as Row;
    expect(profile).toMatchObject({ policy: { version: 1, legacy: false }, horizon: '30d', forecast_kind: 'event', confidence_language: 'probability', validation_requirement: { required: false }, validation_ref: null });
    expect((profile['policy'] as Row)['policy_id']).toBe(hp['policy_id']);
    const pay = (await sql<{ p: Row }>`select payload p from objects.canonical_objects where object_id = ${F30}::uuid and object_type = 'FCT'`.execute(su)).rows[0]!.p;
    expect((pay['outcome'] as Row)['target']).toEqual(pin);
    expect((pay['horizon_policy'] as Row)['evaluation_profile']).toEqual(profile);
    const m = (await sql<{ m: Row }>`select manifest m from prediction.information_sets where information_set_id = ${String(row['information_set_id'])}::uuid`.execute(su)).rows[0]!.m;
    expect((m['request'] as Row)['target_key']).toBe(TARGET);
    expect(((m['policy'] as Row)['horizon_policy'] as Row)).toMatchObject({ version: 1 });
    // the grounded legacy issue (CX2) pins its evaluation profile: the legacy rule, no target
    const g = (await sql<{ hp: Row; p: Row }>`select f.horizon_policy hp, o.payload p from prediction.forecasts_current f join objects.canonical_objects o on o.object_id = f.forecast_id and o.object_type = 'FCT'
      where f.forecast_id = ${CX2_FORECAST}::uuid`.execute(su)).rows[0]!;
    expect(g.hp).toMatchObject({ legacy: true, target: null, evaluation_profile: { policy: { legacy: true }, target: null, validation_requirement: { required: false } } });
    expect((g.p['horizon_policy'] as Row)['evaluation_profile']).toEqual(g.hp['evaluation_profile']);
    // REFUSAL — the target's definition edited AFTER the forecast was issued (STATED SUPERUSER MOVE): the pin detects it, the replay DIVERGES
    const edited = { ...(def['definition'] as Row), event: { comparator: '<', threshold: 50, consecutive: 5 } };
    await sql`update prediction.forecast_targets set definition = ${JSON.stringify(edited)}::jsonb where target_id = ${String(def['target_id'])}::uuid`.execute(su);
    let d: Awaited<ReturnType<typeof replay>>['replay'];
    try { d = (await replay(eriksen, F30)).replay; } finally { await sql`update prediction.forecast_targets set definition = ${JSON.stringify(def['definition'])}::jsonb where target_id = ${String(def['target_id'])}::uuid`.execute(su); }
    expect(d.outcome).toBe('DIVERGED');
    expect(d.diverged.map((x) => x.what)).toContain('target.definition');
    expect(d.diverged.find((x) => x.what === 'target.definition')).toMatchObject({ original: pin.definition_digest });
    // RECOVERY — restored: REPRODUCED
    expect((await replay(eriksen, F30)).replay.outcome).toBe('REPRODUCED');
    console.log(`B25 CX9 EVIDENCE · G7 · ${F30} pins ${TARGET} v1 (definition ${pin.definition_digest.slice(0, 12)}) and the evaluation profile (policy v1, requirement none at 30d) on its row and package; the manifest pins the target key and policy v1; the grounded legacy issue pins its legacy profile · edited definition → DIVERGED (${d.diverged.map((x) => x.what).join(', ')}) · restored → REPRODUCED`);
  });
});
