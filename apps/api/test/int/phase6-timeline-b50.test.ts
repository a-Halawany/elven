/**
 * CP-6 B50 §TL (migration 0120_b50_x_tl) — THE TIMELINE, THE AS-OF EXPLORER AND THE SOURCE-TO-PRODUCT TRACE (F-P3-04), on a real database
 * with the product's own routes (in process) and an ISOLATED vault:
 *
 *   TL1 · BITEMPORAL REPLAY (PR-22-001/002, CAP-UM-10): a claim corrected later — as of an instant between the two records only the first
 *         version is known (and believed) and the LATER correction is disclosed ('corrected on …', not known then); live, both are listed
 *         and the first is no longer believed; the four axes (event | observation | valid | record) place versions by their own times; a
 *         version with no time on the axis is COUNTED (untimed), never silently dropped; the known-at read agrees.
 *   TL2 · NOTHING CONCEALED (PR-22-003): policy filtering COUNTED — a confidential version withheld from an internal reader (and listed for
 *         a confidential one), an audience-governed type shown header-only; MISSING INTERVALS — a declared incomplete acquisition range
 *         and a source-health gap of the evidence's source, as known at the instant (a resolution after it said, not applied); a governed
 *         SCOPE (B92's approved analytics.scopes) places the objects that are or cite its members; a proposed scope is refused.
 *   TL3 · CLOCK-SKEW FIXTURES (DESIGN D19, CAP-UM-10, PR-22-005): an observation AFTER its record time; a degraded and an unknown source
 *         clock; an event-time CONFLICT between sources (a §HD conflicting qualifier) — each flagged on its item and counted.
 *   TL4 · THE TRACE (PR-22-001/005/006): source → evidence → claim → product staged from §PV's explain; LINEAGE CLOSURE and DIGEST
 *         RESOLUTION on a complete trace; a claim citing what no longer resolves (no such object, no such version) and a tampered lineage
 *         digest — INCOMPLETE, the unresolved edge PRESERVED, every reason said; the timeline lists the same broken citations.
 *   TL5 · DECISION SNAPSHOT RECONSTRUCTION (PR-22-002/006): a committed package replayed — the timeline's ledger carries the decision-time
 *         snapshot (its digest the replay's), the as-of read lists it only once recorded, the trace stages the package as `decision` with it.
 *   TL6 · THE CHAPTER CONTINUITY — the fault exercise (AT-22, PR-22-005): the evidence's source degrades — undeclared first (shown), then
 *         under a declared B81 degraded contract (in force, its unavailable functions carried) — the trace reads INCOMPLETE (continuity).
 *   TL7 · RECONCILIATION ROUTED (PR-22-005): an incomplete trace routed as ONE attention item to the product's accountable owner (the port
 *         reads the trace itself; a repeat answers the same item; a complete trace refused; a role outside the rule denied by the PDP);
 *         the trace lists the routed item; the attention vocabulary widened by UNION (0115's classes kept).
 *   TL8 · THE REFUSALS in the class form; TL9 · THE SHAPE (invoker reads, the definer citation read and port, the grants).
 *
 * Every row here is SYNTHETIC fixture data (personas D. Ivanova — analyst; K. Müller — knowledge owner, the accountable owner; the domain
 * administrator). THREE CLAIMS: this harness is CONSTRUCTION evidence only; the act is demonstrated operation; real acceptance (PR-22-006,
 * AT-22: B111's recording path, then R2) is never claimed here. The §TL refusal nouns are not mapped centrally yet (the integrator maps
 * them): their class and SQLSTATE are asserted.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import type { TimelineController } from '../../src/graph/timeline/timeline.controller.js';
import type { DegradedDomainController } from '../../src/shell/degraded/degraded.controller.js';
import { VaultService } from '../../src/observation/vault/vault.service.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import { TERMS_CSV } from './phase5-fixtures.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b50-tl-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
type Item = Row & { ref: string; version: number; clock: string; clockFlags: string[]; correctedLater: (Row & { version: number; at: string; knownAtAsOf: boolean }) | null; believedAtAsOf: boolean;
  headerOnly: boolean; title: string; brokenLineage: Row[]; classification: string };
type Disclosure = Row & { missingIntervals: Array<{ sourceKey: string; from: string; to: string }>; withheld: { count: number; reason: string }; clockFlags: number;
  brokenLineage: Array<{ ref: string; cites: string }>; incomplete: boolean; missing: Row[]; withheldByReason: { classification: number; audience: number }; clock: Record<string, number>;
  untimed: number; correctionsLater: number; bounds: Row; unattributedOpenRanges: number };
type Timeline = { items: Item[]; events: Row[]; asOfReads: Row; disclosure: Disclosure; asOf: string; live: boolean; subject: Row; sources: string[] };
type TNode = Row & { nodeId: string; stage: string; kind: string; ref: string; label: string; outcome: string; clock: string; clockFlags: string[]; visible: boolean; parents: string[] };
type Trace = { nodes: TNode[]; steps: Row[]; edges: Row[]; unresolvedEdges: Row[]; gaps: Row[]; decisionSnapshots: Row[]; missingIntervals: Row[]; continuity: Row & { state: string; dependencies: Row[] };
  reasons: Array<{ reason: string; count: number }>; incomplete: boolean; reconciliation: Row[]; disclosure: Row; sources: string[] };

let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>; let tl: TimelineController; let dg: DegradedDomainController;
let ivanova: AuthenticatedPrincipal; let mueller: AuthenticatedPrincipal; let admin: AuthenticatedPrincipal; let collector: AuthenticatedPrincipal;
type Evd = { id: string; version: number; bytesDigest: string };
let E1: Evd; let E2: Evd; let SRC1 = ''; let SRC2 = ''; let KEY1 = ''; let KEY2 = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const one = async (q: { execute: (db: never) => Promise<{ rows: unknown[] }> }) => ((await q.execute(h.su as never)).rows[0] ?? {}) as Row;
const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY).toISOString();
const WIDE = { from: '2020-01-01T00:00:00Z', to: '2100-01-01T00:00:00Z' };

/** A refusal: the HTTP status the central mapping gives (null while a §TL noun is unmapped), the RAW message, the SQLSTATE. */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string; code: string | null }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof Error && e.message === 'the call should have been refused') throw e;
  if (e instanceof HttpException) { const r = e.getResponse() as { message?: string }; return { status: e.getStatus(), message: String(r.message ?? ''), code: null }; }
  const mapped = asObservationRefusal(e, 'harness');
  return { status: mapped?.getStatus() ?? null, message: e instanceof Error ? e.message : String(e), code: (e as { code?: string }).code ?? null };
};

/* ───────────── the routes (in process) ───────────── */
const timeline = async (as: AuthenticatedPrincipal, payload: Row) =>
  (await tl.timeline(h.req(as, 'graph.timeline.read', String(payload['subjectType'] ?? 'TLN'), (payload['subjectId'] as string | undefined) ?? null, 'graph'), T(), D(), { payload })).timeline as unknown as Timeline;
const trace = async (as: AuthenticatedPrincipal, type: string, id: string, version: number) =>
  (await tl.trace(h.req(as, 'graph.timeline.read', type, id, 'graph'), T(), D(), { payload: { type, id, version } })).trace as unknown as Trace;
const reconcile = (as: AuthenticatedPrincipal, payload: Row) =>
  tl.reconcile(h.req(as, 'graph.timeline.reconcile', String(payload['type']), String(payload['id']), 'graph'), T(), D(), { payload }) as Promise<{ reconciliation: Row; receipt: Row }>;
const subject = (type: string, id: string, over: Row = {}) => ({ subjectType: type, subjectId: id, axis: 'record', ...WIDE, ...over });

/* ───────────── the planted world: canonical versions with the times each fixture needs (SYNTHETIC) ───────────── */
interface Plant {
  type?: string; id?: string; version?: number; title?: string; eventTime?: string | null; observationTime?: string | null; validFrom?: string | null; validTo?: string | null;
  recordedAt: string; clock?: 'trusted' | 'degraded' | 'unknown'; classification?: string; evidenceRefs?: string[]; sourceIds?: string[]; correctionOf?: string | null;
  lifecycle?: string; owner?: string; truth?: string; payload?: Row;
}
async function plant(o: Plant): Promise<{ id: string; version: number; ref: string }> {
  const id = o.id ?? uuidv7(); const version = o.version ?? 1; const type = o.type ?? 'CLM';
  const payload: Row = { title: o.title ?? `${type} fixture (SYNTHETIC)`, statement: 'B50 §TL timeline fixture (SYNTHETIC)', ...(o.payload ?? {}) };
  const evidenceRefs = o.evidenceRefs ?? []; const sourceIds = o.sourceIds ?? [];
  const header: CanonicalHeader = {
    object_id: id, object_type: type, tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: String(version), lifecycle_state: (o.lifecycle ?? 'active') as CanonicalHeader['lifecycle_state'],
    owning_component: 'CP-INT-01', accountable_owner: o.owner ?? `principal:${mueller.principalId}`, source_object_ids: sourceIds,
    event_time: o.eventTime ?? null, observation_time: o.observationTime ?? null, valid_from: o.validFrom ?? null, valid_to: o.validTo ?? null, recorded_at: o.recordedAt,
    time_precision: 'exact', source_clock_quality: o.clock ?? 'trusted', truth_state: (o.truth ?? 'asserted') as CanonicalHeader['truth_state'], synthetic_state: false,
    confidence: 0.8 as unknown as CanonicalHeader['confidence'], uncertainty: null, evidence_refs: evidenceRefs, provenance_ref: null, method_ref: 'fixture-timeline@1.0.0',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: o.classification ?? 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null,
    retention_profile: null, access_policy_ref: null, quality_profile: null, quality_state: null, freshness_state: null, schema_ref: `${type}@v1`, ontology_ref: null,
    correction_of: o.correctionOf ?? null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
  };
  const digest = canonicalHeaderDigest(header, payload);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids,
      event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, evidence_refs, method_ref,
      contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, schema_ref, correction_of, audit_correlation_id, payload, content_digest)
    values (${id}::uuid, ${type}, ${T()}::uuid, ${D()}::uuid, 'DOMAIN', ${version}, ${header.lifecycle_state}, 'CP-INT-01', ${header.accountable_owner}, ${JSON.stringify(sourceIds)}::jsonb,
            ${header.event_time}::timestamptz, ${header.observation_time}::timestamptz, ${header.valid_from}::timestamptz, ${header.valid_to}::timestamptz, ${o.recordedAt}::timestamptz,
            'exact', ${header.source_clock_quality}, ${header.truth_state}, false, '0.8'::jsonb, ${JSON.stringify(evidenceRefs)}::jsonb, 'fixture-timeline@1.0.0',
            '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, ${header.classification}, 'intelligence', ${header.schema_ref}, ${header.correction_of}, ${header.audit_correlation_id}::uuid,
            ${JSON.stringify(payload)}::jsonb, ${digest})`.execute(h.su);
  return { id, version, ref: `${type}:${id}@${version}` };
}
/** A claim's lineage row (0023 §5) on an evidence version — the digest the lineage names (the bytes digest, or a tampered one). */
async function lineage(claim: { id: string; version: number }, evd: Evd, digest = evd.bytesDigest): Promise<void> {
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${claim.id}::uuid, ${claim.version}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'CLM', ${uuidv7()}::uuid, ${uuidv7()}::uuid, null, 'replay', ${evd.id}::uuid, ${digest}, 0, 7, 0.8,
            ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  await h.app.get(VaultService).ensureRoots();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  const { TimelineController: Tc } = await import('../../src/graph/timeline/timeline.controller.js');
  const { DegradedDomainController: Dc } = await import('../../src/shell/degraded/degraded.controller.js');
  tl = h.app.get(Tc); dg = h.app.get(Dc);
  ivanova = await h.humanWithSession(['domain_analyst'], 'b50-tl-d-ivanova');
  mueller = await h.humanWithSession(['knowledge_owner'], 'b50-tl-k-mueller');
  admin = await h.humanWithSession(['domain_admin'], 'b50-tl-domain-admin');
  collector = await h.humanWithSession(['collection_manager'], 'b50-tl-collector');
  // TWO upload sources (SYNTHETIC): the first carries the missing intervals of TL2; the second stays clean until the fault exercise (TL6)
  [E1] = (await h.upload([{ filename: 'b50-tl-portwatch-1.csv', text: TERMS_CSV.replace('assumption', 'assumption (PortWatch bulletin, timeline 1)'), documentTime: '2025-11-20T00:00:00Z' }], 'internal', 'tl1'))
    .map((u) => ({ id: u.id, version: u.version, bytesDigest: u.bytesDigest })) as [Evd];
  [E2] = (await h.upload([{ filename: 'b50-tl-portwatch-2.csv', text: TERMS_CSV.replace('assumption', 'assumption (PortWatch bulletin, timeline 2)'), documentTime: '2025-11-21T00:00:00Z' }], 'internal', 'tl2'))
    .map((u) => ({ id: u.id, version: u.version, bytesDigest: u.bytesDigest })) as [Evd];
  SRC1 = await h.uploadSource('internal', 'tl1'); SRC2 = await h.uploadSource('internal', 'tl2');
  KEY1 = String((await one(sql`select source_key from observation.source_contracts_current where source_id = ${SRC1}::uuid limit 1`))['source_key']);
  KEY2 = String((await one(sql`select source_key from observation.source_contracts_current where source_id = ${SRC2}::uuid limit 1`))['source_key']);
}, 900_000);

afterAll(async () => {
  await h?.close();
  rmSync(VAULT_DIR, { recursive: true, force: true });
}, 120_000);

let A: { id: string; version: number; ref: string };
describe('TL1 · bitemporal replay — what was known, what was believed, what changed (PR-22-001/002, CAP-UM-10)', () => {
  it('as of an instant between the two records: only the first version is known and believed; the LATER correction is disclosed, not known then', async () => {
    A = await plant({ title: 'Port of Hamburg throughput fell 12% (SYNTHETIC)', observationTime: '2025-11-20T06:00:00Z', eventTime: '2025-11-19T00:00:00Z', recordedAt: ago(30), evidenceRefs: [`EVD:${E1.id}@${E1.version}`] });
    await plant({ id: A.id, version: 2, title: 'Port of Hamburg throughput fell 9% — restated (SYNTHETIC)', observationTime: '2025-11-20T06:00:00Z', eventTime: '2025-11-19T00:00:00Z',
      recordedAt: ago(10), evidenceRefs: [`EVD:${E1.id}@${E1.version}`], correctionOf: `${A.id}@1`, lifecycle: 'corrected' });
    const then = await timeline(ivanova, subject('CLM', A.id, { asOf: ago(20) }));
    expect(then.live).toBe(false);
    expect(then.items.map((i) => i.version)).toEqual([1]);
    expect(then.items[0]).toMatchObject({ believedAtAsOf: true, correctedLater: { version: 2, knownAtAsOf: false, lifecycle: 'corrected' } });
    expect(then.asOfReads['known_at']).toMatchObject({ version: 1, latest: 2, versions_after: 1 });
    expect(then.disclosure.correctionsLater).toBe(1);
    // LIVE: both versions; the first is no longer what is believed, and its correction is known
    const now = await timeline(ivanova, subject('CLM', A.id));
    expect(now.live).toBe(true);
    expect(now.items.map((i) => i.version)).toEqual([1, 2]);
    expect(now.items[0]).toMatchObject({ believedAtAsOf: false, correctedLater: { version: 2, knownAtAsOf: true } });
    expect(now.items[1]).toMatchObject({ believedAtAsOf: true, correctedLater: null, title: expect.stringMatching(/restated/) });
    expect(now.asOfReads['known_at']).toMatchObject({ version: 2, latest: 2, versions_after: 0 });
    // before the first record: nothing was known
    const before = await timeline(ivanova, subject('CLM', A.id, { asOf: ago(40) }));
    expect(before.items).toEqual([]);
    expect(String((before.asOfReads['known_at'] as Row)['statement'])).toMatch(/^no version of this object was recorded by /);
  });

  it('the four axes: event, observation, valid and record time each place versions by their own time; a version with no time on the axis is COUNTED', async () => {
    const V = await plant({ title: 'Red Sea transit assessment valid for December (SYNTHETIC)', validFrom: '2025-12-01T00:00:00Z', validTo: '2026-01-01T00:00:00Z', recordedAt: ago(25),
      eventTime: null, observationTime: null });
    const onEvent = await timeline(ivanova, subject('CLM', A.id, { axis: 'event', from: '2025-11-18T00:00:00Z', to: '2025-11-20T00:00:00Z' }));
    expect(onEvent.items.map((i) => i.version)).toEqual([1, 2]);
    expect(await timeline(ivanova, subject('CLM', A.id, { axis: 'observation', from: '2025-11-21T00:00:00Z', to: '2025-11-30T00:00:00Z' }))).toMatchObject({ items: [] });
    const onValid = await timeline(ivanova, subject('CLM', V.id, { axis: 'valid', from: '2025-12-15T00:00:00Z', to: '2025-12-16T00:00:00Z' }));
    expect(onValid.items.map((i) => i.ref)).toEqual([V.ref]);
    expect(onValid.items[0]).toMatchObject({ validFrom: '2025-12-01T00:00:00.000000Z', validTo: '2026-01-01T00:00:00.000000Z' });
    const vEvent = await timeline(ivanova, subject('CLM', V.id, { axis: 'event' }));
    expect(vEvent.items).toEqual([]);
    expect(vEvent.disclosure.untimed).toBe(1);              // no event time: counted, never silently dropped
    const onRecord = await timeline(ivanova, subject('CLM', A.id, { axis: 'record', from: ago(31), to: ago(29) }));
    expect(onRecord.items.map((i) => i.version)).toEqual([1]);
  });
});

describe('TL2 · nothing concealed — policy filtering counted, missing intervals shown, a governed scope (PR-22-003)', () => {
  const ENTITY = uuidv7();
  let S: string;
  it('a governed SCOPE: the objects that are or cite its member are placed; a confidential one is withheld from an internal reader and COUNTED; an audience-governed type is header-only', async () => {
    const key = `b50-tl-corridor-${ENTITY.slice(-6)}`;
    S = key;
    const dig = createHash('sha256').update(key).digest('hex');
    await sql`insert into analytics.scopes (scope_id, scope, tenant_id, domain_id, scope_key, version, title, entity_ids, description, state, digest, proposed_by, decided_by, decided_at, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${key}, 1, 'The Red Sea corridor (SYNTHETIC)', ${`{${ENTITY}}`}::uuid[], 'B50 §TL fixture scope (SYNTHETIC)', 'approved', ${dig},
              ${ivanova.principalId}::uuid, ${mueller.principalId}::uuid, clock_timestamp(), ${uuidv7()}::uuid)`.execute(h.su);
    const open = await plant({ title: 'Houthi activity near Bab el-Mandeb (SYNTHETIC)', recordedAt: ago(5), sourceIds: [`ENT:${ENTITY}`], evidenceRefs: [`EVD:${E1.id}@${E1.version}`] });
    const secret = await plant({ title: 'Naval escort schedule (SYNTHETIC)', recordedAt: ago(5), sourceIds: [`ENT:${ENTITY}`], classification: 'confidential' });
    const brief = await plant({ type: 'BRF', title: 'Corridor briefing (SYNTHETIC)', recordedAt: ago(4), sourceIds: [`ENT:${ENTITY}`, open.ref] });
    await plant({ title: 'An unrelated claim (SYNTHETIC)', recordedAt: ago(5) });
    const asAnalyst = await timeline(ivanova, { scopeKey: key, axis: 'record', ...WIDE });
    expect(asAnalyst.subject).toMatchObject({ kind: 'scope', scope_key: key, members: { entities: 1, objectives: 0 } });
    expect(asAnalyst.items.map((i) => i.ref).sort()).toEqual([brief.ref, open.ref].sort());
    expect(asAnalyst.disclosure.withheldByReason).toEqual({ classification: 1, audience: 1 });
    expect(asAnalyst.disclosure.withheld.count).toBe(2);
    expect(asAnalyst.items.find((i) => i.ref === brief.ref)).toMatchObject({ headerOnly: true, title: expect.stringMatching(/header only here/) });
    expect(JSON.stringify(asAnalyst)).not.toContain('Naval escort schedule');                // the withheld content is never in the answer
    // a confidential reader (the domain administrator) sees it listed; the count follows the reader
    const asAdmin = await timeline(admin, { scopeKey: key, axis: 'record', ...WIDE });
    expect(asAdmin.items.map((i) => i.ref)).toContain(secret.ref);
    expect(asAdmin.disclosure.withheldByReason).toEqual({ classification: 0, audience: 1 });
    // a PROPOSED scope is not a timeline's scope
    await sql`insert into analytics.scopes (scope_id, scope, tenant_id, domain_id, scope_key, version, title, entity_ids, description, state, digest, proposed_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`${key}-p`}, 1, 'A proposed corridor (SYNTHETIC)', ${`{${ENTITY}}`}::uuid[], 'B50 §TL fixture scope (SYNTHETIC)', 'proposed', ${dig}, ${ivanova.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const r = await refusal(timeline(ivanova, { scopeKey: `${key}-p`, axis: 'record', ...WIDE }));
    expect(r.message).toMatch(/^timeline rejected \(unknown_scope\): no approved governed scope /);
    expect(r.code).toBe('23503');
  });

  it('MISSING INTERVALS of the evidence\'s source, as known at the instant: a declared incomplete range, a source-health gap; a later resolution is said, not applied', async () => {
    const stream = uuidv7();
    await sql`insert into observation.acquisition_streams (stream_id, scope, tenant_id, domain_id, source_id, contract_version, partition_key, range_from, range_to, cursor, credit, state, opened_by, correlation_id)
      values (${stream}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${SRC1}::uuid, 1, 'portwatch:chokepoints', '2025-11-01', '2025-12-01', '{}'::jsonb, 4, 'open', ${admin.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const range = uuidv7();
    await sql`insert into observation.acquisition_incomplete_ranges (range_id, scope, tenant_id, domain_id, stream_id, source_id, range_from, range_to, reason_class, detail, declared_at, correlation_id)
      values (${range}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${stream}::uuid, ${SRC1}::uuid, '2025-11-18', '2025-11-21', 'publisher_gap', 'the publisher skipped three days (SYNTHETIC)', ${ago(28)}::timestamptz, ${uuidv7()}::uuid)`.execute(h.su);
    await sql`update observation.acquisition_incomplete_ranges set resolved_by_seq = 3, resolved_at = ${ago(8)}::timestamptz where range_id = ${range}::uuid`.execute(h.su);
    await sql`insert into observation.source_health_events (event_id, scope, tenant_id, domain_id, source_id, prior_state, new_state, evaluated_at, calc_version, coverage_universe_version, reason, lag_class, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${SRC1}::uuid, 'healthy', 'failed', ${ago(27)}::timestamptz, 'fixture@1', 'fixture@1', 'the collector failed (SYNTHETIC)', 'collection_failure', ${uuidv7()}::uuid),
             (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${SRC1}::uuid, 'failed', 'healthy', ${ago(26)}::timestamptz, 'fixture@1', 'fixture@1', 'recovered (SYNTHETIC)', 'none', ${uuidv7()}::uuid)`.execute(h.su);
    const then = await timeline(ivanova, subject('CLM', A.id, { asOf: ago(20) }));
    expect(then.sources).toContain(SRC1);
    const declared = then.disclosure.missing.find((m) => m['basis'] === 'acquisition_incomplete_ranges')!;
    expect(declared).toMatchObject({ source_key: KEY1, from: '2025-11-18', to: '2025-11-21', reason: 'publisher_gap', placed: true, resolved_at: null, resolved_later: true });
    const gap = then.disclosure.missing.find((m) => m['basis'] === 'source_health_events')!;
    expect(gap).toMatchObject({ source_key: KEY1, reason: 'source_health:failed', open: false });
    expect(then.disclosure.missingIntervals.length).toBe(2);
    expect(then.disclosure.incomplete).toBe(true);
    // live: the range's resolution is known now
    const now = await timeline(ivanova, subject('CLM', A.id));
    expect(now.disclosure.missing.find((m) => m['basis'] === 'acquisition_incomplete_ranges')).toMatchObject({ resolved_later: false, resolved_at: expect.any(String) });
    // before the declaration, the gap was not yet known
    const early = await timeline(ivanova, subject('CLM', A.id, { asOf: ago(29) }));
    expect(early.disclosure.missing).toEqual([]);
    void S;
  });
});

describe('TL3 · clock-skew fixtures — observation after record, a degraded and an unknown source clock, an event-time conflict between sources (DESIGN D19)', () => {
  it('each is flagged on its item and counted; a trusted version reads trusted', async () => {
    const rec = ago(15);
    const after = await plant({ title: 'Observed after it was recorded (SYNTHETIC)', recordedAt: rec, observationTime: new Date(new Date(rec).getTime() + 2 * 3_600_000).toISOString() });
    const degraded = await plant({ title: 'A degraded source clock (SYNTHETIC)', recordedAt: rec, observationTime: ago(16), clock: 'degraded' });
    const unknown = await plant({ title: 'An unknown source clock (SYNTHETIC)', recordedAt: rec, observationTime: ago(16), clock: 'unknown' });
    const conflict = await plant({ type: 'EVT', title: 'Vessel grounding — two sources disagree on when (SYNTHETIC)', recordedAt: rec, observationTime: ago(16) });
    await sql`insert into objects.time_qualifiers (object_id, object_version, axis, object_type, scope, tenant_id, domain_id, kind, instant, earliest, latest, time_precision, zone, source, rule, conflicts, clock_quality, declared, recorded_at)
      values (${conflict.id}::uuid, 1, 'event', 'EVT', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'conflicting', null, null, null, 'hour', 'UTC', 'two publishers (SYNTHETIC)', null,
              ${JSON.stringify([{ ref: `SRC:${SRC1}`, value: '2025-11-20T08:00:00Z' }, { ref: `SRC:${SRC2}`, value: '2025-11-21T02:00:00Z' }])}::jsonb, 'trusted', true, ${rec}::timestamptz)`.execute(h.su);
    const trusted = await plant({ title: 'A trusted clock (SYNTHETIC)', recordedAt: rec, observationTime: ago(16) });
    const read = async (p: { id: string; ref: string }, type = 'CLM') => (await timeline(ivanova, subject(type, p.id))).items[0]!;
    expect(await read(after)).toMatchObject({ clock: 'observation_after_record', clockFlags: ['observation_after_record'] });
    expect((await read(after))['clockDetail']).toEqual([expect.objectContaining({ flag: 'observation_after_record', ahead_by: '02:00:00' })]);
    expect(await read(degraded)).toMatchObject({ clock: 'degraded', clockFlags: ['degraded'] });
    expect(await read(unknown)).toMatchObject({ clock: 'unknown', clockFlags: ['unknown'] });
    const ev = await read(conflict, 'EVT');
    expect(ev).toMatchObject({ clock: 'conflict', clockFlags: ['conflict'], timeStated: true });
    expect((ev['times'] as Row[])[0]).toMatchObject({ kind: 'conflicting', axis: 'event', conflicts: [{ ref: `SRC:${SRC1}`, value: '2025-11-20T08:00:00Z' }, { ref: `SRC:${SRC2}`, value: '2025-11-21T02:00:00Z' }] });
    expect(await read(trusted)).toMatchObject({ clock: 'trusted', clockFlags: [] });
    // the same four on one record-time window: each counted in the disclosure
    const win = await timeline(admin, { scopeKey: null, subjectType: 'CLM', subjectId: after.id, axis: 'record', from: ago(16), to: ago(14) });
    expect(win.disclosure.clock).toMatchObject({ observation_after_record: 1 });
    expect(win.disclosure.clockFlags).toBe(1);
  });
});

let G: { id: string; version: number; ref: string }; let OK: { id: string; version: number; ref: string };
describe('TL4 · the trace — lineage closure, citation and digest resolution, the unresolved edge preserved (PR-22-001/005/006)', () => {
  it('LINEAGE CLOSED, every digest resolved: product → evidence (its span) → observation → source staged; the one reason left is the upload\'s own stated clock limitation', async () => {
    OK = await plant({ title: 'Throughput at Port Said steady (SYNTHETIC)', recordedAt: ago(3), observationTime: ago(3), truth: 'extracted', sourceIds: [E2.id], evidenceRefs: [`EVD:${E2.id}@${E2.version}`] });
    await lineage(OK, E2);
    const x = await trace(ivanova, 'CLM', OK.id, 1);
    // the upload path states its evidence's and observation's source clock UNKNOWN (a document's clock is not the platform's): said, its own reason
    expect(x.reasons, JSON.stringify(x.reasons)).toEqual([{ reason: 'clock_unknown', count: 2 }]);
    expect(x.nodes.filter((n) => n.clockFlags.includes('unknown')).map((n) => n.ref.slice(0, 3)).sort()).toEqual(['EVD', 'OBS']);
    expect(x.incomplete).toBe(true);
    expect(x.gaps).toEqual([]);
    const stages = x.nodes.map((n) => n.stage);
    expect(stages[stages.length - 1]).toBe('product');
    expect(stages).toEqual([...stages].sort((a, b) => ['source', 'evidence', 'claim', 'product', 'decision'].indexOf(a) - ['source', 'evidence', 'claim', 'product', 'decision'].indexOf(b)));
    expect(x.nodes.find((n) => n.nodeId === `obj:EVD:${E2.id}@${E2.version}`)).toMatchObject({ stage: 'evidence', visible: true, span: { start: 0, end: 7 } });
    expect(x.nodes.some((n) => n.stage === 'source')).toBe(true);
    expect(x.unresolvedEdges).toEqual([]);
    expect(x.edges.every((e) => e['to'] !== null || e['resolution'] === 'artifact' || e['resolution'] === 'opaque')).toBe(true);
    expect(x.continuity).toMatchObject({ state: 'normal', dependencies: [] });
    expect(x.sources).toContain(SRC2);
    expect(x.steps.some((s) => s['kind'] === 'method')).toBe(true);    // the production nodes are steps of the objects they made
  });

  it('a claim citing what no longer resolves (no such object; no such version) and a tampered lineage digest: INCOMPLETE, every reason said, the unresolved edge PRESERVED', async () => {
    const ghost = uuidv7();
    G = await plant({ title: 'A claim on a withdrawn bulletin (SYNTHETIC)', recordedAt: ago(3), observationTime: ago(3), truth: 'extracted',
      evidenceRefs: [`EVD:${E2.id}@${E2.version}`, `CLM:${ghost}@1`, `EVD:${E2.id}@99`] });
    await lineage(G, E2, 'f'.repeat(64));
    const x = await trace(ivanova, 'CLM', G.id, 1);
    expect(x.incomplete).toBe(true);
    expect(x.reasons.map((r) => r.reason)).toEqual(expect.arrayContaining(['broken_lineage', 'evidence_unavailable']));
    expect(x.unresolvedEdges.map((e) => e['ref']).sort()).toEqual([`CLM:${ghost}@1`, `EVD:${E2.id}@99`].sort());
    for (const e of x.unresolvedEdges) expect(e).toMatchObject({ from: G.ref, to: null, resolution: 'unresolved' });
    expect(x.gaps.some((g) => g['kind'] === 'unverifiable_artifact')).toBe(true);
    expect(x.nodes.filter((n) => n.nodeId.startsWith('gap:')).every((n) => n.outcome === 'unresolved')).toBe(true);
    // the timeline lists the same broken citations (citation resolution) — the valid one is not among them
    const t = await timeline(ivanova, subject('CLM', G.id));
    expect(t.items[0]!.brokenLineage.map((b) => [b['ref'], b['state']]).sort()).toEqual([[`CLM:${ghost}@1`, 'unresolved'], [`EVD:${E2.id}@99`, 'unresolved']].sort());
    expect(t.disclosure.brokenLineage.map((b) => b.cites).sort()).toEqual([`CLM:${ghost}@1`, `EVD:${E2.id}@99`].sort());
    expect(t.disclosure.incomplete).toBe(true);
  });

  it('policy filtering on the trace: a confidential cited claim is KEPT as a node with its label withheld from an internal reader, and counted', async () => {
    const hidden = await plant({ title: 'Escort intelligence (SYNTHETIC)', recordedAt: ago(3), classification: 'confidential', evidenceRefs: [`EVD:${E2.id}@${E2.version}`] });
    const P = await plant({ title: 'A summary resting on it (SYNTHETIC)', recordedAt: ago(2), evidenceRefs: [hidden.ref] });
    const x = await trace(ivanova, 'CLM', P.id, 1);
    const n = x.nodes.find((k) => k.nodeId === `obj:${hidden.ref}`)!;
    expect(n.label).toMatch(/^withheld — classified confidential, above your clearance internal/);
    expect(JSON.stringify(x.nodes)).not.toContain('Escort intelligence');
    expect(x.disclosure['withheld_by_reason']).toMatchObject({ classification: 1 });
    expect(x.reasons.map((r) => r.reason)).toContain('policy_filtered');
    // the product itself above the reader's clearance: its trace is refused, not shown
    const r = await refusal(trace(ivanova, 'CLM', hidden.id, 1));
    expect(r.message).toMatch(/^trace rejected \(clearance\): the product is classified confidential/);
    expect(r.code).toBe('42501');
  });
});

describe('TL5 · decision snapshot reconstruction (PR-22-002/006)', () => {
  it('a committed package replayed: the ledger carries the decision-time snapshot, its digest the replay\'s; the trace stages the package as a decision with it', async () => {
    const P = await c.committed();
    const before = await timeline(w.executive, subject('DPK', P.pkg));
    expect((before.asOfReads['decision'] as Row)['replays']).toEqual([]);
    expect(before.events.some((e) => e['ledger'] === 'package' && e['event'] === 'package.committed')).toBe(true);
    const rp = (await c.replay(P.pkg, P.v)).replay;
    const after = await timeline(w.executive, subject('DPK', P.pkg));
    const snap = after.events.find((e) => e['ledger'] === 'decision_snapshot')!;
    expect(snap).toMatchObject({ ref: `DPK:${P.pkg}@${P.v}`, details: { replay_id: rp.replayId, content_digest: rp.contentDigest, version: P.v } });
    expect((after.asOfReads['decision'] as Row)['replays']).toEqual([expect.objectContaining({ replay_id: rp.replayId, content_digest: rp.contentDigest })]);
    // as of before the replay was recorded, the snapshot is not yet known
    const asOf = await timeline(w.executive, subject('DPK', P.pkg, { asOf: before.asOf }));
    expect(asOf.events.some((e) => e['ledger'] === 'decision_snapshot')).toBe(false);
    const x = await trace(w.executive, 'DPK', P.pkg, P.v);
    expect(x.nodes.find((n) => n.nodeId === `obj:DPK:${P.pkg}@${P.v}`)).toMatchObject({ stage: 'decision' });
    expect(x.decisionSnapshots).toEqual([expect.objectContaining({ node_id: `replay:${rp.replayId}`, stage: 'decision', content_digest: rp.contentDigest })]);
  });
});

describe('TL6 · the chapter continuity — the fault exercise (AT-22, PR-22-005)', () => {
  it('the evidence\'s source degrades: undeclared (shown), then under a declared B81 contract (in force) — the trace reads incomplete (continuity)', async () => {
    await sql`insert into observation.source_health_events (event_id, scope, tenant_id, domain_id, source_id, prior_state, new_state, evaluated_at, calc_version, coverage_universe_version, reason, lag_class, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${SRC2}::uuid, 'healthy', 'failed', clock_timestamp(), 'fixture@1', 'fixture@1', 'the collector failed (SYNTHETIC fault exercise)', 'collection_failure', ${uuidv7()}::uuid)`.execute(h.su);
    const x1 = await trace(ivanova, 'CLM', OK.id, 1);
    expect(x1.continuity.state).toBe('degraded');
    expect(x1.continuity.dependencies).toEqual([expect.objectContaining({ dependency: { kind: 'source', key: KEY2 }, contracts: [] })]);
    expect((x1.continuity.dependencies[0]!['undeclared'] as Row[]).length).toBe(1);
    expect(x1.reasons.map((r) => r.reason)).toEqual(expect.arrayContaining(['continuity_degraded', 'missing_interval']));
    // the domain administrator declares the source's degraded contract (B81 §DG): the trace carries it in force
    const d = await dg.declare(h.req(admin, 'shell.degraded.contract.declare', 'SDG', null, 'observation'), T(), D(), { payload: {
      requestId: uuidv7(), kind: 'source', key: KEY2, expectedVersion: 0,
      available: [{ action: 'graph.timeline.read', label: 'Read the timeline and the trace recorded so far, labelled incomplete' }],
      unavailable: [{ action: 'graph.provenance.fitness.mark', label: 'Mark a product resting on this source fit' }],
      limitations: ['Nothing after the source failed is observed; traces through it are incomplete'], maxDurationSeconds: 86_400, ownerPrincipalId: admin.principalId,
      exitEvidence: 'A healthy evaluation of the source and a fresh upload admitted', reason: 'the PortWatch collector failed (SYNTHETIC fault exercise)' } }) as unknown as { contract: Row };
    expect(d.contract).toMatchObject({ version: 1 });
    const x2 = await trace(ivanova, 'CLM', OK.id, 1);
    const dep = x2.continuity.dependencies[0]!;
    expect((dep['contracts'] as Row[])).toEqual([expect.objectContaining({ contract_id: d.contract['contract_id'], in_force: true })]);
    expect((dep['unavailable_functions'] as Row[]).map((f) => f['action'])).toEqual(['graph.provenance.fitness.mark']);
    expect(x2.incomplete).toBe(true);
  });
});

describe('TL7 · reconciliation routed — one attention item to the accountable owner (PR-22-005)', () => {
  it('an incomplete trace routed by the analyst: owned by K. Müller (the product\'s accountable owner), idempotent; the trace lists it', async () => {
    const r = await reconcile(ivanova, { type: 'CLM', id: G.id, version: 1, note: 'Two citations no longer resolve and the lineage digest does not match (SYNTHETIC).' });
    expect(r.reconciliation).toMatchObject({ repeated: false, owner: mueller.principalId, ref: G.ref });
    expect((r.reconciliation['problems'] as Row[]).map((p) => p['reason'])).toEqual(expect.arrayContaining(['broken_lineage', 'evidence_unavailable']));
    expect(r.receipt['policyDecisionId']).toEqual(expect.any(String));
    const item = await one(sql`select signal_class, subject_kind, subject_id::text, owner_principal_id::text, state, outcome, details from executive.attention_items where item_id = ${String(r.reconciliation['item_id'])}::uuid`);
    expect(item).toMatchObject({ signal_class: 'knowledge.trace_reconciliation', subject_kind: 'canonical_object', subject_id: G.id, owner_principal_id: mueller.principalId });
    expect(['deprioritized', 'open', 'escalated', 'unrouted']).toContain(item['state']);
    expect(await one(sql`select count(*)::int n from executive.attention_item_events where item_id = ${String(r.reconciliation['item_id'])}::uuid`)).toEqual({ n: 1 });
    // a repeat answers the same item (the problem set unchanged)
    const again = await reconcile(mueller, { type: 'CLM', id: G.id, version: 1, note: 'Routed again by the owner (SYNTHETIC).' });
    expect(again.reconciliation).toMatchObject({ repeated: true, item_id: r.reconciliation['item_id'] });
    const x = await trace(ivanova, 'CLM', G.id, 1);
    expect(x.reconciliation).toEqual([expect.objectContaining({ item_id: r.reconciliation['item_id'], owner: mueller.principalId })]);
  });

  it('a complete trace is refused (nothing to reconcile); a role outside the rule is denied by the PDP; the attention vocabulary widened by union', async () => {
    const fresh = await plant({ title: 'Complete and clean (SYNTHETIC)', recordedAt: ago(1), observationTime: ago(1), truth: 'asserted' });
    const done = await refusal(reconcile(ivanova, { type: 'CLM', id: fresh.id, version: 1, note: 'Nothing to reconcile, asked anyway (SYNTHETIC).' }));
    expect(done.message).toMatch(/^trace reconciliation rejected \(state\): the trace of CLM v1 is complete/);
    expect(done.code).toBe('22023');
    expect((await refusal(reconcile(collector, { type: 'CLM', id: G.id, version: 1, note: 'A collection manager tries (SYNTHETIC).' }))).status).toBe(403);
    const v = await one(sql`select executive.attention_signal_classes() @> ARRAY['knowledge.trace_reconciliation', 'governance.ownership', 'forecast.unfit'] ok`);
    expect(v['ok']).toBe(true);
  });
});

describe('TL8 · the refusals in the class form', () => {
  it('subject and scope together; a future instant; an unknown object; an unknown axis; a bad clearance never reaches the database', async () => {
    const both = await refusal(timeline(ivanova, { subjectType: 'CLM', subjectId: A.id, scopeKey: 'b50-tl-x', axis: 'record', ...WIDE }));
    expect(both.message).toMatch(/^timeline rejected \(subject\): a timeline names ONE subject/);
    expect(both.code).toBe('22023');
    const future = await refusal(timeline(ivanova, subject('CLM', A.id, { asOf: new Date(Date.now() + DAY).toISOString() })));
    expect(future.message).toMatch(/^timeline rejected \(future\): /);
    const unknown = await refusal(timeline(ivanova, subject('CLM', uuidv7())));
    expect(unknown.message).toMatch(/^timeline rejected \(unknown_object\): no authorized CLM object matches this subject/);
    expect(unknown.code).toBe('23503');
    expect((await refusal(timeline(ivanova, subject('CLM', A.id, { axis: 'wall' })))).status).toBe(422);
    expect((await refusal(timeline(ivanova, subject('CLM', A.id, { from: WIDE.to, to: WIDE.from })))).message).toMatch(/^timeline rejected \(window\)/);
    const tu = await refusal(trace(ivanova, 'CLM', uuidv7(), 1));
    expect(tu.message).toMatch(/^trace rejected \(unknown_object\)/);
    expect(tu.code).toBe('23503');
  });
});

describe('TL9 · the shape', () => {
  it('the timeline and the trace are SECURITY INVOKER and STABLE; the citation read and the port are definers with a fixed search path; the grants', async () => {
    const f = async (sig: string) => one(sql`select p.prosecdef d, p.provolatile v, array_to_string(p.proconfig, ',') cfg,
        has_function_privilege('eye_app', p.oid, 'execute') app, has_function_privilege('eye_commit', p.oid, 'execute') com, has_function_privilege('public', p.oid, 'execute') pub
      from pg_proc p where p.oid = ${sig}::regprocedure`);
    expect(await f('graph.timeline(uuid, uuid, text, uuid, text, timestamptz, timestamptz, text, timestamptz, text, int)')).toMatchObject({ d: false, v: 's', app: true, com: true, pub: false });
    expect(await f('graph.trace(uuid, uuid, text, uuid, int, text)')).toMatchObject({ d: false, v: 's', app: true, com: true, pub: false });
    expect(await f('graph.tl_cite_state(uuid, uuid, text)')).toMatchObject({ d: true, v: 's', pub: false, cfg: expect.stringMatching(/^search_path=/) });
    expect(await f('graph.route_trace_reconciliation(uuid, uuid, uuid, text, uuid, int, text, uuid, uuid)')).toMatchObject({ d: true, app: false, com: true, pub: false, cfg: expect.stringMatching(/pg_temp/) });
  });
});
