/**
 * CP-6 B32 part `graph` (migration 0089 §G) — THE STRATEGY GRAPH'S CAPABILITIES, INITIATIVES, RESOURCES, MEASURES AND ALIGNMENT (F-P6-09:
 * V8 PR-37-001..006, CAP-DS-08, AT-37, PER-09): the six new types (the prelude's) given what they mean — ALIGNMENTS typed by their ends
 * and mirrored into the dependencies, MEASURES with observations and freshness, the GAP VIEW (alignment_rule@1, a transparent count), the
 * DETECTIONS with their declared continuity, the HUMAN AUTHORITY's four acts with separation and expiry (PR-37-003), OWNERSHIP transfer,
 * the impact walk REACHING the new types (and graph.record_impact recording them), and the HEALTH INPUT's measure branch.
 *
 * On a real database, through the real controllers and the pipeline (PDP, the human gate, the ports' own refusals mapped as the filter maps
 * them). No scheduler: nothing here is a subscription. THE CLAIMS are PLANTED canonical CLM rows (the B21/B22/B28 plantClaim idiom, no
 * lineage — nothing here reads it; SYNTHETIC, labelled in their payloads); every strategy object, alignment, measure, observation and act goes
 * through its route. THE MISSING OWNER is made by SUSPENDING a principal by the superuser (the phase4-corrections idiom — stated).
 *
 *   G1 · THE SCENE: "on-time delivery 95%" (OBJ) supported by the Regensburg assembly capability (CAP), built by the dual-sourcing
 *        initiative (INI), resourced by the bearings budget (RSC), measured by the on-time delivery rate (MSR, 7-day window), affecting the
 *        Regensburg line workforce (STK); the executive sets the objective, approves the measure and the allocation; the measure's last
 *        observation is 10 days old → the GAP VIEW shows the capability UNDER-EVIDENCED and the measure stale; the stale_measure detection
 *        exposes the affected objective. RECOVERY: a fresh observation, the supports alignment re-declared with a second claim → supported 5/5.
 *   G2 · ALIGNMENTS: the mirrors (dependent and target per kind; conflicts_with none); the refusals 403 (PDP / human gate / borrowed session),
 *        404 (object / evidence / alignment), 409 (inactive / duplicate / retired), 422 (kind / endpoint / strength / rationale).
 *   G3 · MEASURES: the refusals (403 / 404 / 409 value_conflict / 422); an idempotent retry of a definition and of an observation; a
 *        redefinition resets the approval — the old digest refused (stale_digest), the new one approved.
 *   G4 · AUTHORITY: separation (the declarer refused), the human gate (an agent refused and its denial recorded), PDP 403, 404, 409
 *        duplicate, 422 subject / expiry; eligible_by; the ledger append-only.
 *   G5 · DETECTIONS: a CONFLICT held (the gap row held) → a trade-off approved → resolved; a CYCLE with its path → an alignment retired →
 *        gone; a MISSING OWNER routed to the planning review → authority acts refused (missing_owner) → an owner assigned (its refusals) → gone.
 *   G6 · THE IMPACT WALK: a claim correction walked → the capability reached at hop 2 THROUGH the builds mirror, the objective through the
 *        supports mirror, the stakeholder through affects; graph.record_impact's affected_strategy_nodes and its count; the GraphChanged
 *        objects carry the new buckets; no assumption touched.
 *   G7 · THE HEALTH INPUT: graph.health_inputs has EXACTLY executive.health_measure_inputs' result type; one measure row per approved MSR
 *        (value, observed_at, unit, direction, the window, the evidence, the objectives); absent before the approval; NULL value (never
 *        imputed) before any observation; an unapproved measure absent.
 *
 * EACH CASE LOGS ONE `B32 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { ProjectionsController } from '../../src/graph/projections/projections.controller.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
type Gap = Row & { objective_id: string; capability_id: string | null; criteria_met: number; gap_reasons: string[]; alignment_claim: string; evidence_count: number; strongest_truth: string | null;
  objective_subject: { version: number; digest: string }; criteria: Array<{ criterion: string; met: boolean; basis: string }>; held_by: Row[]; measures: Row[]; initiatives: Row[] };
type Detection = Row & { detection_kind: string; detection_key: string; state: string; subject_ids: string[]; continuity: string; affected_ids: string[]; routed_to: string[]; path: Row[] | null; resolved_by: string | null };

let h: Phase4Harness; let su: AnyDb; let graph: GraphController; let projections: ProjectionsController;
/** The planning lead (declares), a second strategy owner, the executive (the human authority), a domain administrator, an analyst, and the ghost (the missing owner). */
let lead: AuthenticatedPrincipal; let planner: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let admin: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let ghost: AuthenticatedPrincipal;
/** What the cases leave one another. */
let C1 = ''; let C2 = ''; let C3 = '';
let OBJ = ''; let CAP = ''; let INI = ''; let RSC = ''; let MSR = ''; let STK = '';
let SUP = ''; let BLD = ''; let RES = ''; let AFF = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const DAY = 86_400_000;
const future = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (asObservationRefusal — the B18/B20 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number, code?: string): Promise<{ status: number | null; code: string | null; message: string }> => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  if (code !== undefined) expect(r.code, r.message).toBe(code);
  return r;
};
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B32 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);

/* ───────────── the planted claims (SYNTHETIC) ───────────── */
async function plantClaim(label: string, truth = 'extracted'): Promise<string> {
  const id = uuidv7(); const now = new Date().toISOString();
  const payload: Row = { claim_kind: 'claim', subject: 'Regensburg assembly', predicate: 'b32_fixture', object_value: `${label} (B32 harness, SYNTHETIC)`, confidence: 0.9, synthetic: true };
  const header: CanonicalHeader = {
    object_id: id, object_type: 'CLM', tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: '1', lifecycle_state: 'active', owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture',
    source_object_ids: [], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: truth, synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: [], provenance_ref: null, method_ref: 'fixture-extraction@1.0.0',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1', ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
  };
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes, withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest)
    values (${id}::uuid, 'CLM', ${T()}::uuid, ${D()}::uuid, 'DOMAIN', 1, 'active', 'CP-INT-01', 'agent:fixture', '[]'::jsonb, null, ${now}::timestamptz, null, null, ${now}::timestamptz, 'exact', 'trusted', ${truth}, false, null, null, '[]'::jsonb, null, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'internal', 'intelligence', null, null, null, null, null, null, null, 'CLM@v1', null, null, null, null, ${header.audit_correlation_id}::uuid, null, ${JSON.stringify(payload)}::jsonb, ${canonicalHeaderDigest(header, payload)})`.execute(su);
  return id;
}

/* ───────────── the routes (in process) ───────────── */
const declare = async (as: AuthenticatedPrincipal, objectType: string, title: string, restsOn: Row[], status = 'active'): Promise<string> =>
  ((await graph.declare(h.req(as, 'graph.strategy.declare', objectType, null, 'graph'), T(), D(), { payload: { objectType, title, statement: `${title} (B32 harness)`, status, restsOn } })) as { strategy: { objectId: string } }).strategy.objectId;
const onClaim = (id: string): Row => ({ kind: 'claim', id, rationale: 'the declared object rests on this claim (B32 harness)' });
const align = (as: AuthenticatedPrincipal, payload: Row) => graph.declareAlignment(h.req(as, 'graph.alignment.declare', 'ALN', null, 'graph'), T(), D(), { payload }) as Promise<{ alignment: Row & { alignment_id: string; digest: string; dependency: Row | null }; receipt: Row }>;
const alignOk = async (as: AuthenticatedPrincipal, kind: string, from: string, to: string, extra: Row = {}): Promise<string> =>
  (await align(as, { kind, from, to, strength: 'strong', rationale: `the ${kind} alignment of the scene (B32 harness)`, ...extra })).alignment.alignment_id;
const retire = (as: AuthenticatedPrincipal, id: string, reason = 'the alignment no longer stands (B32 harness)') => graph.retireAlignment(h.req(as, 'graph.alignment.retire', 'ALN', id, 'graph'), T(), D(), id, { payload: { reason } }) as Promise<{ alignment: Row }>;
const define = (as: AuthenticatedPrincipal, id: string, payload: Row) => graph.defineMeasure(h.req(as, 'graph.measure.define', 'MSR', id, 'graph'), T(), D(), id, { payload }) as Promise<{ measure: Row & { definition_digest: string; definition_version: number; repeated: boolean } }>;
const observe = (as: AuthenticatedPrincipal, id: string, payload: Row) => graph.observeMeasure(h.req(as, 'graph.measure.observe', 'MSR', id, 'graph'), T(), D(), id, { payload }) as Promise<{ observation: Row & { repeated: boolean; freshness: Row | null } }>;
const approveMeasure = (as: AuthenticatedPrincipal, id: string, payload: Row) => graph.approveMeasure(h.req(as, 'graph.strategy.authority.act', 'MSR', id, 'graph'), T(), D(), id, { payload }) as Promise<{ act: Row }>;
const act = (as: AuthenticatedPrincipal, subject: string, payload: Row) => graph.strategyAuthority(h.req(as, 'graph.strategy.authority.act', 'OBJ', subject, 'graph'), T(), D(), subject, { payload }) as Promise<{ act: Row & { act_id: string; eligible_by: string } }>;
const assignOwner = (as: AuthenticatedPrincipal, id: string, payload: Row) => graph.assignStrategyOwner(h.req(as, 'graph.strategy.owner.assign', 'OBJ', id, 'graph'), T(), D(), id, { payload }) as Promise<{ owner: Row }>;
const gaps = async (as: AuthenticatedPrincipal = executive, payload: Row = {}) => ((await graph.alignmentGaps(h.req(as, 'graph.strategy.alignment.read', 'OBJ', null, 'graph'), T(), D(), { payload })) as { gaps: { at: string; rule: string; rows: Gap[]; summary: Row } }).gaps;
const detections = async (as: AuthenticatedPrincipal = executive, payload: Row = {}) => ((await graph.strategyDetections(h.req(as, 'graph.strategy.alignment.read', 'OBJ', null, 'graph'), T(), D(), { payload })) as { detections: { detections: Detection[]; counts: Row } }).detections;
const measures = async (payload: Row = {}) => (await graph.listMeasures(h.req(executive, 'graph.strategy.alignment.read', 'MSR', null, 'graph'), T(), D(), { payload })) as unknown as { at: string; measures: Array<Row & { subject: { digest: string } }> };
const rowOf = (rows: Gap[], obj: string, cap: string | null) => rows.find((r) => r.objective_id === obj && r.capability_id === cap)!;
const measureDef = (objectiveId: string, over: Row = {}): Row => ({ objectiveId, unit: 'percent', direction: 'higher_better', targetValue: 95, targetDate: '2027-03-31', freshnessDays: 7, ...over });
const approveAll = (digest: string, over: Row = {}): Row => ({ subjectDigest: digest, decision: 'approve', rationale: 'approved by the executive for the 2027 plan (B32 harness)', expiresAt: future(180), ...over });
const deps = async (dependent: string) => (await sql<{ dependency_id: string; depends_on_kind: string; depends_on_id: string; state: string; dependent_type: string }>`select dependency_id::text, depends_on_kind, depends_on_id::text, state, dependent_type
  from graph.dependencies where dependent_object_id = ${dependent}::uuid order by created_at`.execute(su)).rows;
const healthRows = async (at: Date | string) => (await sql<Row & { input_id: string; value: string | null; objective_ids: string[]; evidence: Row[] }>`select * from graph.health_inputs(${T()}::uuid, ${D()}::uuid, ${at}::timestamptz)`.execute(su)).rows;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  graph = h.app.get(Gc);
  const { ProjectionsController: Pc } = await import('../../src/graph/projections/projections.controller.js');
  projections = h.app.get(Pc);
  lead = await h.humanWithSession(['strategy_owner'], 'b32g-lead');
  planner = await h.humanWithSession(['strategy_owner'], 'b32g-planner');
  executive = await h.humanWithSession(['executive'], 'b32g-executive');
  admin = await h.humanWithSession(['domain_admin'], 'b32g-admin');
  analyst = await h.humanWithSession(['domain_analyst'], 'b32g-analyst');
  ghost = await h.humanWithSession(['strategy_owner'], 'b32g-ghost');
  C1 = await plantClaim('the Regensburg line shipped 91% on time in Q3');
  C2 = await plantClaim('the second bearings supplier passed qualification');
  C3 = await plantClaim('the Regensburg assembly cell runs two shifts');
}, 240_000);

afterAll(async () => { await h?.close(); }, 120_000);

describe('B32 graph · capabilities, initiatives, resources, measures and alignment (0089 §G)', () => {
  it('G1 · THE SCENE: "on-time delivery 95%" linked to the Regensburg assembly capability and the dual-sourcing initiative — the gap view shows the capability under-evidenced; recovered to supported', async () => {
    /* G1.1 the objects, through the existing declare path (the prelude's types) */
    OBJ = await declare(lead, 'OBJ', 'On-time delivery 95%', [onClaim(C1)]);
    CAP = await declare(lead, 'CAP', 'Regensburg assembly', [onClaim(C1)]);
    INI = await declare(lead, 'INI', 'Dual-sourcing initiative', [onClaim(C2)]);
    RSC = await declare(lead, 'RSC', 'Bearings procurement budget', [onClaim(C2)]);
    MSR = await declare(lead, 'MSR', 'On-time delivery rate', [onClaim(C1)]);
    STK = await declare(lead, 'STK', 'Regensburg line workforce', [onClaim(C2)]);
    const types = (await sql<{ object_type: string }>`select object_type from graph.strategy_current where strategy_object_id in (${OBJ}::uuid, ${CAP}::uuid, ${INI}::uuid, ${RSC}::uuid, ${MSR}::uuid, ${STK}::uuid) order by object_type`.execute(su)).rows.map((r) => r.object_type);
    expect(types).toEqual(['CAP', 'INI', 'MSR', 'OBJ', 'RSC', 'STK']);
    /* G1.2 the alignments (each mirrored) and the measure */
    SUP = await alignOk(lead, 'supports', OBJ, CAP);
    BLD = await alignOk(lead, 'builds', INI, CAP);
    RES = await alignOk(lead, 'resources', RSC, INI);
    AFF = await alignOk(lead, 'affects', STK, OBJ);
    const m = (await define(lead, MSR, measureDef(OBJ))).measure;
    expect(m).toMatchObject({ measure_id: MSR, objective_id: OBJ, definition_version: 1, approval_state: 'proposed', repeated: false, alignment: { kind: 'measures', from_id: MSR, to_id: OBJ } });
    /* G1.3 the stale observation: ten days old, read from C1 */
    const tenDaysAgo = new Date(Date.now() - 10 * DAY).toISOString();
    const o = (await observe(analyst, MSR, { value: 91, observedAt: tenDaysAgo, source: { kind: 'claim', id: C1 } })).observation;
    expect(o).toMatchObject({ measure_id: MSR, repeated: false, source: { kind: 'claim', id: C1, version: 1 }, freshness: { state: 'stale' } });
    /* G1.4 the human authority: the executive sets the objective, approves the measure and the allocation (each on the digest read) */
    let g = await gaps();
    const objDigest = rowOf(g.rows, OBJ, CAP).objective_subject.digest;
    const setAct = (await act(executive, OBJ, { actKind: 'set_objective', ...approveAll(objDigest) })).act;
    expect(setAct).toMatchObject({ act_kind: 'set_objective', eligible_by: 'role:executive', subject_version: 1, declarer: lead.principalId, approver: executive.principalId });
    await approveMeasure(executive, MSR, approveAll(m.definition_digest));
    const resDigest = (await sql<{ digest: string }>`select digest from graph.alignments where alignment_id = ${RES}::uuid`.execute(su)).rows[0]!.digest;
    await act(executive, RES, { actKind: 'allocate_resource', ...approveAll(resDigest) });
    /* G1.5 THE GAP VIEW: the capability UNDER-EVIDENCED (one claim), the measure stale; the other three criteria met — a count, each with its basis */
    g = await gaps();
    const row = rowOf(g.rows, OBJ, CAP);
    expect(row).toMatchObject({ capability_title: 'Regensburg assembly', evidence_count: 1, strongest_truth: 'extracted', initiatives_active: 1, initiatives_resourced: 1, criteria_total: 5, criteria_met: 3, alignment_claim: 'gap' });
    expect(row.gap_reasons).toEqual(['capability_under_evidenced', 'measure_stale']);
    expect(Object.fromEntries(row.criteria.map((c) => [c.criterion, c.met]))).toEqual({ objective_set: true, capability_evidenced: false, initiative_active: true, initiative_resourced: true, measure_current: false });
    expect(row.criteria.find((c) => c.criterion === 'capability_evidenced')!.basis).toMatch(/^1 counted evidence ref\(s\), the strongest extracted/);
    expect(row.measures[0]).toMatchObject({ measure_id: MSR, approved: true, state: 'stale' });
    expect(g.rule).toMatch(/^alignment_rule@1/);
    /* G1.6 the stale_measure detection: EXPOSE AFFECTED SCOPE — the measured objective named, routed to the measure's owner */
    let d = await detections();
    const stale = d.detections.find((x) => x.detection_key === `stale_measure:${MSR}`)!;
    expect(stale).toMatchObject({ detection_kind: 'stale_measure', state: 'open', continuity: 'expose_affected_scope' });
    expect(stale.affected_ids.sort()).toEqual([MSR, OBJ].sort());
    expect(stale.routed_to).toEqual([lead.principalId]);
    /* G1.7 RECOVERY: a fresh observation, and the supports alignment re-declared citing a second claim */
    const fresh = (await observe(analyst, MSR, { value: 93.5, observedAt: new Date(Date.now() - DAY).toISOString(), source: { kind: 'claim', id: C1 } })).observation;
    expect(fresh.freshness).toMatchObject({ state: 'fresh' });
    await retire(lead, SUP, 'superseded by the alignment citing the shift-pattern claim (B32 harness)');
    SUP = await alignOk(lead, 'supports', OBJ, CAP, { evidence: [{ kind: 'claim', id: C3 }] });
    g = await gaps();
    const after = rowOf(g.rows, OBJ, CAP);
    expect(after).toMatchObject({ evidence_count: 2, criteria_met: 5, alignment_claim: 'supported', gap_reasons: [] });
    d = await detections();
    expect(d.detections.find((x) => x.detection_key === `stale_measure:${MSR}`)).toBeUndefined();
    sixEvidence('G1', { fault_trace: { under_evidenced: row.gap_reasons, criteria_met: row.criteria_met, stale_age_days: row.measures[0]!['age_days'] }, watermark: { objective: OBJ, capability: CAP, at: g.at },
      consumer_behaviour: 'the gap view counts the criteria each with its basis; the stale measure is exposed with the objective it affects, never shown current',
      operator_action: 'the lead declared the chain; the executive set the objective and approved the measure and the allocation on their digests',
      recovery: { fresh_observation: fresh.observation_id, supports_redeclared: SUP, claim: after.alignment_claim }, reconciliation: { evidence_count: after.evidence_count, criteria_met: after.criteria_met } });
  }, 240_000);

  it('G2 · ALIGNMENTS: typed ends, the mirrors in the dependencies (never ASU; conflicts_with none), retirement removes only the mirror it created — and every refusal', async () => {
    /* the mirrors: the end that RESTS ON the other is the dependent */
    expect((await deps(OBJ)).filter((x) => x.state === 'active').map((x) => x.depends_on_id)).toEqual(expect.arrayContaining([C1, CAP, MSR]));
    expect((await deps(CAP)).filter((x) => x.state === 'active').map((x) => x.depends_on_id)).toEqual(expect.arrayContaining([C1, INI]));
    expect((await deps(INI)).filter((x) => x.state === 'active').map((x) => x.depends_on_id)).toEqual(expect.arrayContaining([C2, RSC]));
    expect((await deps(STK)).filter((x) => x.state === 'active').map((x) => x.depends_on_id)).toEqual(expect.arrayContaining([C2, OBJ]));
    const retiredSup = (await sql<{ dependency_id: string; state: string }>`select d.dependency_id::text, d.state from graph.alignments a join graph.dependencies d on d.dependency_id = a.dependency_id
      where a.kind = 'supports' and a.from_id = ${OBJ}::uuid and a.state = 'retired'`.execute(su)).rows;
    expect(retiredSup.map((x) => x.state)).toEqual(['removed']);
    const events = (await sql<{ event: string }>`select event from graph.strategy_events where strategy_object_id = ${OBJ}::uuid and event in ('strategy.linked', 'strategy.unlinked') order by occurred_at`.execute(su)).rows.map((x) => x.event);
    expect(events).toEqual(['strategy.linked', 'strategy.linked', 'strategy.linked', 'strategy.unlinked', 'strategy.linked']);
    /* a mirror reused (an identical dependency the declaration's rests_on created) is not removed by the retirement */
    const OBJ2 = await declare(lead, 'OBJ', 'Minimise inventory cost', [onClaim(C2), { kind: 'strategy', id: CAP, rationale: 'the inventory objective already rests on the assembly capability' }]);
    const reuse = await align(lead, { kind: 'supports', from: OBJ2, to: CAP, strength: 'weak', rationale: 'the inventory objective needs the assembly capability (B32 harness)' });
    expect(reuse.alignment.dependency).toMatchObject({ created: false, dependent: OBJ2, depends_on: CAP });
    const rr = (await retire(lead, reuse.alignment.alignment_id)).alignment;
    expect(rr).toMatchObject({ state: 'retired', dependency_removed: false });
    expect((await deps(OBJ2)).find((x) => x.depends_on_id === CAP)!.state).toBe('active');
    /* THE REFUSALS — nothing recorded */
    const before = Number((await sql<{ n: number }>`select count(*)::int n from graph.alignments where tenant_id = ${T()}::uuid`.execute(su)).rows[0]!.n);
    const ok = { kind: 'builds', from: INI, to: CAP, strength: 'moderate', rationale: 'a second builds alignment (B32 harness)' };
    await refused(align(analyst, ok), /no qualifying role binding/, 403, 'EYE-AUT-001');
    await refused(align({ ...lead, kind: 'agent' } as AuthenticatedPrincipal, ok), /human gate: graph\.alignment\.declare requires a named human principal/, 403, 'EYE-WFL-002');
    const borrowed = await h.principalWith(['strategy_owner'], 'b32g-borrowed');
    await refused(align(borrowed, ok), /^strategy alignment rejected: recorded by the acting principal, never on behalf of another/, 403, 'EYE-AUT-001');
    await refused(align(lead, { ...ok, from: uuidv7() }), /^strategy alignment rejected \(unknown_object\): no strategy object .* in this domain/, 404, 'EYE-STA-001');
    await refused(align(lead, { ...ok, evidence: [{ kind: 'evidence', id: uuidv7() }] }), /^strategy alignment rejected \(unknown_evidence\): no evidence .* in this domain/, 404, 'EYE-STA-001');
    await refused(align(lead, ok), /^strategy alignment rejected \(duplicate\): alignment .* already records this builds alignment/, 409, 'EYE-STA-002');
    const closedCap = await declare(lead, 'CAP', 'Retired paint-shop capability', [onClaim(C3)], 'closed');
    await refused(align(lead, { ...ok, to: closedCap }), /^strategy alignment rejected \(inactive\): .* is active and .* is closed/, 409, 'EYE-STA-002');
    await refused(align(lead, { ...ok, kind: 'supports' }), /^strategy alignment rejected \(endpoint\): a supports alignment runs from an objective \(OBJ\) to the capability \(CAP\) it needs; .* is INI/, 422, 'EYE-REQ-001');
    await refused(align(lead, { ...ok, kind: 'conflicts_with', from: OBJ, to: INI }), /^strategy alignment rejected \(endpoint\): a conflicts_with alignment runs between two objectives/, 422, 'EYE-REQ-001');
    await refused(align(lead, { ...ok, kind: 'aligns' }), /kind must be one of supports, builds/, 422, 'EYE-REQ-001');
    await refused(align(lead, { ...ok, strength: 'huge' }), /strength must be/, 422, 'EYE-REQ-001');
    await refused(align(lead, { ...ok, rationale: 'short' }), /rationale is at least 8 characters/, 422, 'EYE-REQ-001');
    await refused(retire(lead, uuidv7()), /^strategy alignment rejected \(unknown_alignment\)/, 404, 'EYE-STA-001');
    await refused(retire(lead, reuse.alignment.alignment_id), /^strategy alignment rejected \(retired\): alignment .* was retired at/, 409, 'EYE-STA-002');
    expect(Number((await sql<{ n: number }>`select count(*)::int n from graph.alignments where tenant_id = ${T()}::uuid`.execute(su)).rows[0]!.n), 'no refused declaration was recorded').toBe(before + 0);
    /* the denials are recorded (the PDP's and the human gate's) */
    const denials = Number((await sql<{ n: number }>`select count(*)::int n from policy.policy_decisions where action = 'graph.alignment.declare' and decision = 'deny' and tenant_id = ${T()}::uuid`.execute(su)).rows[0]?.n ?? 0);
    expect(denials).toBeGreaterThanOrEqual(2);
    // no new type is ever coded ASU: every alignment end and mirror is typed by the object
    expect(Number((await sql<{ n: number }>`select count(*)::int n from graph.dependencies d join graph.alignments a on a.dependency_id = d.dependency_id where d.dependent_type = 'ASU'`.execute(su)).rows[0]!.n)).toBe(0);
    sixEvidence('G2', { fault_trace: { refusals: 13, reused_mirror: reuse.alignment.dependency }, watermark: { alignments: before },
      consumer_behaviour: 'each kind types its ends; the dependent end rests on the other in graph.dependencies (strategy.linked on it)',
      operator_action: 'the lead declared and retired; an analyst, an agent and a borrowed session were refused', recovery: { retired: rr },
      reconciliation: { mirror_kept_active: true, denials } });
  }, 180_000);

  it('G3 · MEASURES: definition and observations with their refusals; idempotent retries; a redefinition resets the approval and the old digest is refused', async () => {
    const CAP2 = await declare(lead, 'CAP', 'Bearings incoming inspection', [onClaim(C2)]);
    const MSR2 = await declare(lead, 'MSR', 'Inspection backlog', [onClaim(C2)]);
    /* the retry of the SAME definition changes nothing */
    const def = (await sql<{ definition_digest: string }>`select definition_digest from graph.measures where measure_id = ${MSR}::uuid`.execute(su)).rows[0]!.definition_digest;
    const again = (await define(lead, MSR, measureDef(OBJ))).measure;
    expect(again).toMatchObject({ repeated: true, definition_version: 1, definition_digest: def, approval_state: 'approved' });
    /* the refusals */
    await refused(define(analyst, MSR2, measureDef(OBJ)), /no qualifying role binding/, 403, 'EYE-AUT-001');
    await refused(define(lead, CAP2, measureDef(OBJ)), /^strategy measure rejected \(not_a_measure\): .* is CAP/, 422, 'EYE-REQ-001');
    await refused(define(lead, MSR2, measureDef(CAP2)), /^strategy measure rejected \(objective\): .* is CAP; a measure measures an objective/, 422, 'EYE-REQ-001');
    await refused(define(lead, uuidv7(), measureDef(OBJ)), /^strategy measure rejected \(unknown_object\)/, 404, 'EYE-STA-001');
    await refused(define(lead, MSR2, measureDef(OBJ, { freshnessDays: 0 })), /freshnessDays is a number of days/, 422, 'EYE-REQ-001');
    await refused(observe(analyst, MSR2, { value: 3, observedAt: new Date().toISOString(), source: { kind: 'claim', id: C2 } }), /^strategy measure rejected \(unknown_measure\): no measure is defined for/, 404, 'EYE-STA-001');
    await refused(observe(executive, MSR, { value: 3, observedAt: new Date().toISOString(), source: { kind: 'claim', id: C2 } }), /no qualifying role binding/, 403, 'EYE-AUT-001');
    await refused(observe(analyst, MSR, { value: 3, observedAt: new Date().toISOString(), source: { kind: 'claim', id: uuidv7() } }), /^strategy measure rejected \(unknown_source\): no claim/, 404, 'EYE-STA-001');
    await refused(observe(analyst, MSR, { value: 3, observedAt: future(2), source: { kind: 'claim', id: C2 } }), /^strategy measure rejected \(observed_at\): .* never a future one/, 422, 'EYE-REQ-001');
    await refused(observe(analyst, MSR, { value: 3, observedAt: new Date().toISOString() }), /source is the \{kind: claim \| evidence, id\}/, 422, 'EYE-REQ-001');
    /* an observation's retry answers the first; a different value for the same instant and source is refused */
    const at = new Date(Date.now() - 2 * DAY).toISOString();
    const first = (await observe(analyst, MSR, { value: 94, observedAt: at, source: { kind: 'claim', id: C2 } })).observation;
    const retry = (await observe(analyst, MSR, { value: 94, observedAt: at, source: { kind: 'claim', id: C2 } })).observation;
    expect(retry).toMatchObject({ observation_id: first.observation_id, repeated: true });
    await refused(observe(analyst, MSR, { value: 80, observedAt: at, source: { kind: 'claim', id: C2 } }), /^strategy measure rejected \(value_conflict\): observation .* already records 94/, 409, 'EYE-STA-002');
    await expect(sql`update graph.measure_observations set value = 1 where observation_id = ${first.observation_id as string}::uuid`.execute(su)).rejects.toThrow(/append-only|append only/i);
    /* REDEFINITION: the target moves to 96 — version 2, the approval reset; the executive's approval of the old digest is refused */
    const v2 = (await define(lead, MSR, measureDef(OBJ, { targetValue: 96 }))).measure;
    expect(v2).toMatchObject({ definition_version: 2, approval_state: 'proposed', repeated: false });
    expect((await healthRows(new Date())).find((r) => r.input_id === MSR), 'an unapproved definition is no health input').toBeUndefined();
    await refused(approveMeasure(executive, MSR, approveAll(def)), /^strategy authority rejected \(stale_digest\): the approver read .*; .* is now version 2/, 409, 'EYE-STA-002');
    const reapproved = (await approveMeasure(executive, MSR, approveAll(v2.definition_digest))).act;
    expect(reapproved).toMatchObject({ act_kind: 'approve_measure', subject_version: 2 });
    const listed = (await measures()).measures.find((x) => x['measure_id'] === MSR)!;
    expect(listed).toMatchObject({ definition_version: 2, approval_state: 'approved', approved_now: true, state: 'fresh', subject: { digest: v2.definition_digest } });
    const evs = (await sql<{ event: string }>`select event from graph.measure_events where measure_id = ${MSR}::uuid order by occurred_at`.execute(su)).rows.map((x) => x.event);
    expect(evs).toEqual(['measure.defined', 'measure.observed', 'measure.approved', 'measure.observed', 'measure.observed', 'measure.redefined', 'measure.approved']);
    sixEvidence('G3', { fault_trace: { stale_digest: def.slice(0, 12), value_conflict: first.observation_id }, watermark: { measure: MSR, version: 2 },
      consumer_behaviour: 'an unapproved definition is no health input; a retry answers the first record', operator_action: 'the lead redefined the target; the executive re-approved the new digest',
      recovery: { reapproved: reapproved['act_id'] }, reconciliation: { events: evs.length } });
  }, 180_000);

  it('G4 · AUTHORITY (PR-37-003): a named human eligible by role, never the declarer, on the digest read, expiring — an agent refused and its denial recorded', async () => {
    const g = await gaps();
    const digest = rowOf(g.rows, OBJ, CAP).objective_subject.digest;
    const payload = { actKind: 'set_objective', ...approveAll(digest) };
    await refused(act(lead, OBJ, payload), /^strategy authority rejected \(separation\): principal .* declared .*; the declarer never records the authority act on it/, 403, 'EYE-AUT-001');
    await refused(act({ ...executive, kind: 'agent' } as AuthenticatedPrincipal, OBJ, payload), /human gate: graph\.strategy\.authority\.act requires a named human principal/, 403, 'EYE-WFL-002');
    await refused(act(analyst, OBJ, payload), /no qualifying role binding/, 403, 'EYE-AUT-001');
    await refused(act(executive, uuidv7(), payload), /^strategy authority rejected \(unknown_subject\)/, 404, 'EYE-STA-001');
    await refused(act(executive, OBJ, payload), /^strategy authority rejected \(duplicate\): act .* already records this approver's set_objective on this version/, 409, 'EYE-STA-002');
    await refused(act(executive, CAP, { ...payload }), /^strategy authority rejected \(subject\): set_objective names .* \(a CAP\)/, 422, 'EYE-REQ-001');
    await refused(act(executive, SUP, { ...payload, actKind: 'allocate_resource' }), /^strategy authority rejected \(subject\): allocate_resource names .* \(a supports\)/, 422, 'EYE-REQ-001');
    await refused(act(executive, OBJ, { ...payload, expiresAt: new Date(Date.now() - DAY).toISOString() }), /^strategy authority rejected \(expiry\)/, 422, 'EYE-REQ-001');
    await refused(act(executive, OBJ, { ...payload, subjectDigest: 'abc' }), /subjectDigest is the digest/, 422, 'EYE-REQ-001');
    /* a SECOND planner (not the declarer) may act: eligible by strategy_owner; a reject is recorded as such */
    const byPlanner = (await act(planner, OBJ, { ...payload, decision: 'reject', rationale: 'the planner dissents: 95% needs the second supplier first (B32 harness)' })).act;
    expect(byPlanner).toMatchObject({ eligible_by: 'role:strategy_owner', decision: 'reject', declarer: lead.principalId });
    // the executive's approval is the latest act on the version for the gap view? No — the latest act decides: the planner's reject now stands
    const g2 = await gaps();
    expect(rowOf(g2.rows, OBJ, CAP).gap_reasons).toContain('objective_not_set');
    const again = (await act(admin, OBJ, { ...payload, rationale: 'the administrator records the executive board decision (B32 harness)' })).act;
    expect(again).toMatchObject({ eligible_by: 'role:domain_admin', decision: 'approve' });
    expect(rowOf((await gaps()).rows, OBJ, CAP).alignment_claim).toBe('supported');
    const denied = (await sql<{ reason: string }>`select reason from policy.policy_decisions where action = 'graph.strategy.authority.act' and decision = 'deny' and tenant_id = ${T()}::uuid order by created_at`.execute(su)).rows.map((r) => r.reason);
    expect(denied.some((r) => /human gate/.test(r)), 'the agent\'s attempt is recorded').toBe(true);
    await expect(sql`delete from graph.strategy_authority_acts where act_id = ${again.act_id}::uuid`.execute(su)).rejects.toThrow(/append-only|append only/i);
    sixEvidence('G4', { fault_trace: { refused: 9, denials: denied.length }, watermark: { subject: OBJ, digest: digest.slice(0, 12) },
      consumer_behaviour: 'the latest act on the current digest decides; a reject un-sets the objective', operator_action: 'the executive set it; the planner rejected; the administrator re-approved',
      recovery: { act: again.act_id }, reconciliation: { acts: (await sql<{ n: number }>`select count(*)::int n from graph.strategy_authority_acts where subject_id = ${OBJ}::uuid`.execute(su)).rows[0]!.n } });
  }, 180_000);

  it('G5 · DETECTIONS with declared continuity: a conflict HELD then resolved by a trade-off; a cycle with its path HELD then broken; a missing owner ROUTED then assigned', async () => {
    /* CONFLICT: "Minimise inventory cost" conflicts with "On-time delivery 95%" → hold; the gap row is held */
    const OBJ2 = (await sql<{ id: string }>`select strategy_object_id::text id from graph.strategy_current where title = 'Minimise inventory cost' and tenant_id = ${T()}::uuid`.execute(su)).rows[0]!.id;
    const CON = await alignOk(lead, 'conflicts_with', OBJ2, OBJ, { strength: 'moderate' });
    await refused(align(lead, { kind: 'conflicts_with', from: OBJ, to: OBJ2, strength: 'weak', rationale: 'the reverse of the same conflict (B32 harness)' }), /^strategy alignment rejected \(duplicate\)/, 409, 'EYE-STA-002');
    let d = await detections();
    const conflict = d.detections.find((x) => x.detection_key === `conflict:${CON}`)!;
    expect(conflict).toMatchObject({ detection_kind: 'conflict', state: 'open', continuity: 'hold', resolved_by: null });
    expect(conflict.subject_ids.sort()).toEqual([OBJ, OBJ2].sort());
    expect(conflict.routed_to).toEqual([lead.principalId]);
    let row = rowOf((await gaps()).rows, OBJ, CAP);
    expect(row).toMatchObject({ alignment_claim: 'held' });
    expect(row.gap_reasons).toContain('held_by_detection');
    expect(row.held_by).toEqual([{ kind: 'conflict', key: `conflict:${CON}`, continuity: 'hold' }]);
    // the trade-off: the executive approves it on the conflict's digest
    const conDigest = (await sql<{ digest: string }>`select digest from graph.alignments where alignment_id = ${CON}::uuid`.execute(su)).rows[0]!.digest;
    const trade = (await act(executive, CON, { actKind: 'approve_tradeoff', ...approveAll(conDigest, { rationale: 'delivery reliability over inventory cost until Q2 2027 (B32 harness)' }) })).act;
    d = await detections();
    expect(d.detections.find((x) => x.detection_key === `conflict:${CON}`)).toMatchObject({ state: 'resolved', resolved_by: trade.act_id });
    expect(rowOf((await gaps()).rows, OBJ, CAP).alignment_claim).toBe('supported');
    /* CYCLE: a capability resting on an objective that it supports → a two-node cycle with its path; retiring the alignment breaks it */
    const OBJ3 = await declare(lead, 'OBJ', 'Grow line capacity 10%', [onClaim(C3)]);
    const CAPX = await declare(lead, 'CAP', 'Line capacity planning', [{ kind: 'strategy', id: OBJ3, rationale: 'the planning capability exists for the capacity objective' }]);
    const LOOP = await alignOk(lead, 'supports', OBJ3, CAPX);
    d = await detections();
    const cycle = d.detections.find((x) => x.detection_kind === 'cycle')!;
    expect(cycle).toMatchObject({ state: 'open', continuity: 'hold' });
    expect(cycle.subject_ids.sort()).toEqual([OBJ3, CAPX].sort());
    expect((cycle.path ?? []).map((p) => p['id'])).toHaveLength(3);
    expect(String(cycle['detail'])).toMatch(/a dependency cycle of 2 strategy objects: (OBJ "Grow line capacity 10%" rests on CAP "Line capacity planning" rests on OBJ|CAP "Line capacity planning" rests on OBJ "Grow line capacity 10%" rests on CAP)/);
    expect(rowOf((await gaps()).rows, OBJ3, CAPX)).toMatchObject({ alignment_claim: 'held' });
    await retire(lead, LOOP, 'the capability rests on the objective; the loop was a declaration error (B32 harness)');
    d = await detections();
    expect(d.detections.filter((x) => x.detection_kind === 'cycle')).toEqual([]);
    /* MISSING OWNER: the ghost declares an objective, then is SUSPENDED (planted by the superuser — stated) */
    const OBJ4 = await declare(ghost, 'OBJ', 'Reduce scrap at Regensburg', [onClaim(C3)]);
    await sql`update identity.principals set status = 'suspended' where id = ${ghost.principalId}::uuid`.execute(su);
    d = await detections();
    const missing = d.detections.find((x) => x.detection_key === `missing_owner:${OBJ4}`)!;
    expect(missing).toMatchObject({ detection_kind: 'missing_owner', state: 'open', continuity: 'route_to_owner' });
    // the planning review: the domain's ACTIVE strategy owners and administrators (G2's borrowed fixture principal holds strategy_owner too); never the suspended ghost
    expect(missing.routed_to).toEqual(expect.arrayContaining([admin.principalId, lead.principalId, planner.principalId]));
    expect(missing.routed_to).not.toContain(ghost.principalId);
    const o4 = rowOf((await gaps()).rows, OBJ4, null);
    expect(o4.gap_reasons).toEqual(['objective_not_set', 'no_capability', 'no_measure']);
    await refused(act(executive, OBJ4, { actKind: 'set_objective', ...approveAll(o4.objective_subject.digest) }), /^strategy authority rejected \(missing_owner\): .* has no active human owner; an owner is assigned first/, 409, 'EYE-STA-002');
    // the owner transfer's refusals
    await refused(assignOwner(analyst, OBJ4, { ownerPrincipalId: lead.principalId, reason: 'the lead takes it over (B32 harness)' }), /no qualifying role binding/, 403, 'EYE-AUT-001');
    await refused(assignOwner({ ...lead, kind: 'agent' } as AuthenticatedPrincipal, OBJ4, { ownerPrincipalId: lead.principalId, reason: 'the lead takes it over (B32 harness)' }), /human gate/, 403, 'EYE-WFL-002');
    await refused(assignOwner(lead, uuidv7(), { ownerPrincipalId: lead.principalId, reason: 'the lead takes it over (B32 harness)' }), /^strategy owner rejected \(unknown_object\)/, 404, 'EYE-STA-001');
    await refused(assignOwner(lead, OBJ4, { ownerPrincipalId: analyst.principalId, reason: 'the analyst takes it over (B32 harness)' }), /^strategy owner rejected \(owner\): .* is not an active human holding strategy_owner/, 422, 'EYE-REQ-001');
    await refused(assignOwner(lead, OBJ4, { ownerPrincipalId: ghost.principalId, reason: 'back to the ghost (B32 harness)' }), /^strategy owner rejected \(owner\)/, 422, 'EYE-REQ-001');
    const moved = (await assignOwner(lead, OBJ4, { ownerPrincipalId: planner.principalId, reason: 'the planner owns scrap reduction now (B32 harness)' })).owner;
    expect(moved).toMatchObject({ from: ghost.principalId, from_active_human: false, to: planner.principalId });
    await refused(assignOwner(lead, OBJ4, { ownerPrincipalId: planner.principalId, reason: 'the planner owns scrap reduction now (B32 harness)' }), /^strategy owner rejected \(unchanged\)/, 409, 'EYE-STA-002');
    d = await detections();
    expect(d.detections.find((x) => x.detection_key === `missing_owner:${OBJ4}`)).toBeUndefined();
    const ev = (await sql<{ event: string; details: Row }>`select event, details from graph.strategy_events where strategy_object_id = ${OBJ4}::uuid and event = 'strategy.owner_assigned'`.execute(su)).rows;
    expect(ev).toHaveLength(1);
    expect(ev[0]!.details).toMatchObject({ from: ghost.principalId, to: planner.principalId });
    // the transfer survives a REBUILD (0089 §0, the integrator): the row lost, the partition withdrawn and rebuilt from the log — the owner is
    // the latest strategy.owner_assigned, not the canonical object's declarer (the ghost)
    await projections.withdraw(h.req(admin, 'graph.projection.withdraw', 'PRJ', null, 'graph'), T(), D(), 'strategy_current', { payload: { reason: 'the owner-transfer rebuild check (B32 harness)' } });
    await sql`delete from graph.strategy_current where strategy_object_id = ${OBJ4}::uuid`.execute(su);
    const rb = (await projections.rebuild(h.req(admin, 'graph.projection.rebuild', 'PRJ', null, 'graph'), T(), D(), 'strategy_current', { payload: { reason: 'the owner-transfer rebuild check (B32 harness)' } }) as unknown as { rebuild: Row }).rebuild;
    expect(rb).toMatchObject({ outcome: 'rebuilt', projection: 'strategy_current', state: 'serving', inserted: 1 });
    const rebuilt = (await sql<{ owner_principal_id: string }>`select owner_principal_id::text from graph.strategy_current where strategy_object_id = ${OBJ4}::uuid`.execute(su)).rows;
    expect(rebuilt).toEqual([{ owner_principal_id: planner.principalId }]);
    // the authority act now proceeds (the executive, not the declarer)
    await act(executive, OBJ4, { actKind: 'set_objective', ...approveAll(o4.objective_subject.digest) });
    await sql`update identity.principals set status = 'active' where id = ${ghost.principalId}::uuid`.execute(su);
    sixEvidence('G5', { fault_trace: { conflict: CON, cycle: cycle.detection_key, missing_owner: OBJ4 }, watermark: { open_after: d.counts },
      consumer_behaviour: 'conflict and cycle HOLD the rows (no claim over them); the missing owner is ROUTED to the planning review and its authority acts refused',
      operator_action: 'the executive approved the trade-off; the lead retired the looping alignment and assigned the planner as owner',
      recovery: { tradeoff: trade.act_id, retired: LOOP, owner: moved }, reconciliation: { owner_events: ev.length } });
  }, 240_000);

  it('G6 · THE IMPACT WALK reaches the new types through the mirrors; graph.record_impact records them; the GraphChanged objects carry them; no assumption touched', async () => {
    const out = await graph.propagate(h.req(admin, 'graph.impact.propagate', 'INV', C2, 'graph'), T(), D(), { payload: { triggerKind: 'claim_correction', triggerObjectId: C2 } }) as unknown as
      { impact: Row & { invalidationId: string; capabilities: Row[]; initiatives: Row[]; resources: Row[]; stakeholders: Row[]; measures: Row[]; objectives: Row[]; assumptions: Row[]; statement: string } };
    const r = out.impact;
    const cap = r.capabilities.find((x) => x['strategy_object_id'] === CAP)!;
    expect(cap).toMatchObject({ object_type: 'CAP', hop: 2, reached_via: 'rests on INI "Dual-sourcing initiative"' });
    expect(r.initiatives.map((x) => x['strategy_object_id'])).toContain(INI);
    expect(r.resources.map((x) => x['strategy_object_id'])).toContain(RSC);
    expect(r.stakeholders.map((x) => x['strategy_object_id'])).toContain(STK);
    expect(r.objectives.map((x) => x['strategy_object_id'])).toContain(OBJ);
    expect(r.assumptions).toEqual([]);
    expect(r.statement).toMatch(/capability\(ies\).*initiative\(s\).*resource\(s\).*stakeholder\(s\) reported for human review/);
    const inv = (await sql<{ affected_strategy_nodes: Array<{ strategy_object_id: string; object_type: string }>; affected_objectives: Row[] }>`select affected_strategy_nodes, affected_objectives from graph.invalidations_current where invalidation_id = ${r.invalidationId}::uuid`.execute(su)).rows[0]!;
    expect(inv.affected_strategy_nodes.map((x) => x.object_type).sort()).toEqual(expect.arrayContaining(['CAP', 'INI', 'RSC', 'STK']));
    expect(inv.affected_strategy_nodes.map((x) => x.strategy_object_id)).toContain(CAP);
    const assessed = (await sql<{ details: Row }>`select details from graph.invalidation_events where invalidation_id = ${r.invalidationId}::uuid and event = 'invalidation.assessed'`.execute(su)).rows[0]!;
    expect(Number(assessed.details['strategy_nodes'])).toBe(inv.affected_strategy_nodes.length);
    const changed = (await sql<{ payload: Row }>`select payload from objects.object_outbox where event_type = 'GraphChanged' and payload #>> '{change,invalidation_id}' = ${r.invalidationId}`.execute(su)).rows[0]!;
    const objects = changed.payload['objects'] as Row;
    expect(objects['capabilities']).toContain(CAP);
    expect(objects['initiatives']).toContain(INI);
    expect(objects['assumptions']).toEqual([]);
    // an unrelated walk carries no new bucket at all (an empty bucket is ABSENT — earlier payloads unchanged)
    const lone = await plantClaim('an unrelated customs notice');
    const quiet = await graph.propagate(h.req(admin, 'graph.impact.propagate', 'INV', lone, 'graph'), T(), D(), { payload: { triggerKind: 'claim_correction', triggerObjectId: lone } }) as unknown as { impact: { invalidationId: string } };
    const quietObjects = (await sql<{ payload: Row }>`select payload from objects.object_outbox where event_type = 'GraphChanged' and payload #>> '{change,invalidation_id}' = ${quiet.impact.invalidationId}`.execute(su)).rows[0]!.payload['objects'] as Row;
    expect(Object.keys(quietObjects).sort()).toEqual(['assumptions', 'briefings', 'claims', 'commitments', 'decisions', 'evidence', 'forecasts', 'memoryItems', 'objectives', 'scenarios', 'simulations', 'truncated', 'twins', 'walked', 'warnings']);
    sixEvidence('G6', { fault_trace: { trigger: C2, invalidation: r.invalidationId }, watermark: { strategy_nodes: inv.affected_strategy_nodes.length },
      consumer_behaviour: 'the capability reached at hop 2 through the builds mirror; listed for human review, nothing marked', operator_action: 'the administrator walked the claim correction',
      recovery: 'none needed (the walk reports)', reconciliation: { event_count: assessed.details['strategy_nodes'], graph_changed_capabilities: objects['capabilities'] } });
  }, 180_000);

  it('G7 · THE HEALTH INPUT: graph.health_inputs is the contract\'s measure branch — approved measures only, the latest observation at or before the instant, nothing imputed', async () => {
    const same = (await sql<{ same: boolean }>`select pg_get_function_result('graph.health_inputs(uuid,uuid,timestamptz)'::regprocedure) = pg_get_function_result('executive.health_measure_inputs(uuid,uuid,timestamptz)'::regprocedure) as same`.execute(su)).rows[0]!.same;
    expect(same, 'EXACTLY the RETURNS TABLE of executive.health_measure_inputs').toBe(true);
    const rows = await healthRows(new Date());
    const m = rows.find((r) => r.input_id === MSR)!;
    expect(m).toMatchObject({ input_kind: 'measure', input_version: '2', label: 'On-time delivery rate', unit: 'percent', direction: 'higher_better', confidence: null, exposure: null });
    // the latest OBSERVED instant wins (G1's fresh reading, a day old, over G3's two-day-old one)
    expect(Number(m['value'])).toBe(93.5);
    expect(Number(m['expected_every_days'])).toBe(7);
    expect(m.objective_ids).toEqual([OBJ]);
    expect(m.evidence).toEqual([{ object_id: C1, version: 1 }]);
    expect(String(m['basis'])).toMatch(/^measure .* \(definition version 2, approved by act .* until .*\): its latest observation at or before the instant, 93\.5 at .* \(fresh\); target 96 percent by 2027-03-31 \(higher_better\); expected every 7 day\(s\); no confidence input$/);
    // an approved measure never observed: a row with a NULL value — declared absence, never imputed
    const MSR3 = await declare(lead, 'MSR', 'Supplier qualification lead time', [onClaim(C2)]);
    const d3 = (await define(lead, MSR3, measureDef(OBJ, { unit: 'days', direction: 'lower_better', targetValue: 30, freshnessDays: 30 }))).measure;
    const beforeApproval = await mark();
    await approveMeasure(executive, MSR3, approveAll(d3.definition_digest));
    const r3 = (await healthRows(new Date())).find((r) => r.input_id === MSR3)!;
    expect(r3).toMatchObject({ value: null, observed_at: null, evidence: [] });
    expect(String(r3['basis'])).toMatch(/no observation at or before the instant \(no value is imputed\)/);
    expect((await healthRows(beforeApproval)).find((r) => r.input_id === MSR3), 'absent before the approval').toBeUndefined();
    // the stale detection names it (never observed) and the gap view counts the objective's measures
    expect((await detections()).detections.find((x) => x.detection_key === `stale_measure:${MSR3}`)).toMatchObject({ continuity: 'expose_affected_scope' });
    // through the READ path (RLS, eye_app): the measures list agrees
    const listed = (await measures()).measures.find((x) => x['measure_id'] === MSR3)!;
    expect(listed).toMatchObject({ approved_now: true, state: 'no_observation', observations: 0 });
    sixEvidence('G7', { fault_trace: { unobserved: MSR3 }, watermark: { rows: rows.length, same_result_type: same },
      consumer_behaviour: 'one measure row per approved MSR; value NULL where nothing was observed', operator_action: 'the executive approved the lead-time measure',
      recovery: 'none needed', reconciliation: { measure_value: m['value'], objective_ids: m.objective_ids } });
  }, 180_000);

  it('G8 · B32-F1 THE FRESHNESS BOUNDARY: the observation\'s response reads at a DATABASE instant at or after its own recorded_at — the first observation and a stale → fresh transition answer the NEW reading; the millisecond boundary confirmed on the rows (a millisecond instant inside the row\'s millisecond precedes it and reads the previous observation); the as-of reads of earlier instants unchanged', async () => {
    const obj8 = await declare(lead, 'OBJ', 'Freshness boundary objective (B32-F1)', [onClaim(C1)]);
    const m8 = await declare(lead, 'MSR', 'Freshness boundary measure (B32-F1)', [onClaim(C1)]);
    await define(lead, m8, measureDef(obj8));
    const iso = (v: unknown): string => new Date(v as string).toISOString();
    const readAfterRow = async (observationId: string, readAt: string): Promise<boolean> =>
      (await sql<{ ok: boolean }>`select ${readAt}::timestamptz >= recorded_at as ok from graph.measure_observations where observation_id = ${observationId}::uuid`.execute(su)).rows[0]!.ok;
    const freshAt = async (at: string) => (await sql<{ state: string; last_observed_at: Date | null }>`select state, last_observed_at from graph.measure_freshness(${T()}::uuid, ${D()}::uuid, ${at}::timestamptz) where measure_id = ${m8}::uuid`.execute(su)).rows[0]!;
    /* (1) THE FIRST OBSERVATION — nothing before it: the response is its own reading (never `no_observation`) */
    const firstAt = new Date(Date.now() - 12 * DAY).toISOString();
    const first = (await observe(analyst, m8, { value: 80, observedAt: firstAt, source: { kind: 'claim', id: C1 } })).observation;
    expect(first.freshness).toMatchObject({ state: 'stale', freshness_days: expect.anything() });
    expect(iso(first.freshness!['last_observed_at'])).toBe(firstAt);
    expect(String(first.freshness!['read_at'])).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{6}Z$/);
    expect(await readAfterRow(String(first['observation_id']), String(first.freshness!['read_at']))).toBe(true);
    /* (2) STALE → FRESH: the new reading's response is FRESH and names the new reading, read at or after the new row */
    const freshObserved = new Date(Date.now() - 1 * DAY).toISOString();
    const fresh = (await observe(analyst, m8, { value: 93.5, observedAt: freshObserved, source: { kind: 'claim', id: C1 } })).observation;
    expect(fresh['value']).toBe(93.5);
    expect(fresh.freshness).toMatchObject({ state: 'fresh' });
    expect(iso(fresh.freshness!['last_observed_at'])).toBe(freshObserved);
    expect(await readAfterRow(String(fresh['observation_id']), String(fresh.freshness!['read_at']))).toBe(true);
    /* (3) THE BOUNDARY, CONFIRMED ON THE ROWS: recorded_at keeps microseconds; the millisecond instant of the row's own millisecond (what a
       JavaScript Date carries) precedes it whenever the stamp has sub-millisecond digits, and the as-of read at that instant — correctly —
       answers the PREVIOUS observation (stale, the 80 reading). One more fresh reading is taken only if a stamp falls exactly on its
       millisecond (a one-in-a-thousand case), so the confirmation never depends on timing. */
    let probe = { id: String(fresh['observation_id']), observed: freshObserved };
    let row = (await sql<{ ms: string; exact: string; sub: boolean }>`select to_char(date_trunc('milliseconds', recorded_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ms,
        to_char(recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') exact, date_trunc('milliseconds', recorded_at) < recorded_at sub
        from graph.measure_observations where observation_id = ${probe.id}::uuid`.execute(su)).rows[0]!;
    for (let i = 0; !row.sub && i < 5; i += 1) {
      const at = new Date(Date.parse(probe.observed) + 1000).toISOString();
      const again = (await observe(analyst, m8, { value: 93.5, observedAt: at, source: { kind: 'claim', id: C1 } })).observation;
      probe = { id: String(again['observation_id']), observed: at };
      row = (await sql<{ ms: string; exact: string; sub: boolean }>`select to_char(date_trunc('milliseconds', recorded_at) at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') ms,
          to_char(recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') exact, date_trunc('milliseconds', recorded_at) < recorded_at sub
          from graph.measure_observations where observation_id = ${probe.id}::uuid`.execute(su)).rows[0]!;
    }
    expect(row.sub).toBe(true);
    expect(row.exact).toMatch(/\.\d{6}Z$/);
    const atMillisecond = await freshAt(row.ms);                      // the instant a millisecond clock would carry, inside the row's millisecond
    expect(atMillisecond.state).toBe(probe.id === String(fresh['observation_id']) ? 'stale' : 'fresh');
    if (probe.id === String(fresh['observation_id'])) expect(iso(atMillisecond.last_observed_at)).toBe(firstAt);   // the PREVIOUS reading
    const atStamp = await freshAt(row.exact);                         // the row's own stamp: it is visible
    expect(iso(atStamp.last_observed_at)).toBe(probe.observed);
    /* (4) HISTORY PRESERVED: an as-of read before the fresh reading was recorded still answers the first reading (stale) */
    const before = await freshAt(iso(Date.parse(String(first.freshness!['read_at']))));
    expect(before).toMatchObject({ state: 'stale' });
    expect(iso(before.last_observed_at)).toBe(firstAt);
    sixEvidence('G8', { fault_trace: { boundary: { recorded_at: row.exact, millisecond_instant: row.ms, read_at_that_instant: atMillisecond } },
      watermark: { first: first.freshness, fresh: fresh.freshness }, consumer_behaviour: 'the response reads at GREATEST(clock_timestamp(), the row\'s recorded_at); graph.measure_freshness unchanged',
      operator_action: 'none', recovery: 'the stale → fresh transition answers the new reading', reconciliation: { history: before } });
  }, 120_000);
});
