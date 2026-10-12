/**
 * CP-6 B92 §MCA (migration 0113 §MCA) — COMPUTATIONS A: the product metrics of decisions, strategy, foresight, warnings and forecasts
 * (MET-001..005, MET-019..030), V01-T-046's value measures and ES-40-008's two indicators, computed THROUGH THE PRELUDE'S PORT
 * (analytics.metric.compute → analytics.amc_compute → the part's analytics.mc_<key>), replayed through the prelude's replay port.
 *
 * THE SCENE'S THREE METRICS IN DEPTH (the NORDWERK operating review: the Red Sea corridor, 2026-Q3): MET-001 (every link of the six shown on
 * each record; a learning link recorded AFTER the result's as-of → the replay reproduces, a fresh compute sees it), MET-022 (a receipt start,
 * the declared raised_at proxy labelled, a replayed world-clock warning excluded, an unqualified acknowledger excluded, a role cohort above
 * and below k, the strict no-proxy definition), MET-024 (inside and outside the approved band, a backtest listed as context and NOT counted,
 * the world clock). Every other metric: a positive determinate result, an explained indeterminate one, the scope applied (or "scope ignored",
 * said); unsupported V01-T-046 measures served unsupported with their carriers.
 *
 * EVERY ROW HERE IS SYNTHETIC FIXTURE DATA, planted by the superuser with triggers off (session_replication_role = replica) — the records'
 * own ports stamp `now` (clock_timestamp) and a record stamped now can never fall in a CLOSED period, which a determinate result needs; the
 * act demonstrates the computations on NORDWERK's records written through their real ports. The definitions are planted APPROVED by the
 * superuser (the prelude idiom — §MD's ports are another part's) from this part's own contracts (definitions-a.ts).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql, type Kysely } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { AnalyticsComputeController } from '../../src/analytics/compute/compute.controller.js';
import { AnalyticsComputationsAController } from '../../src/analytics/computations-a/computations-a.controller.js';
import { contractProblems, definitionsA, COMPUTATIONS_A } from '../../src/analytics/computations-a/definitions-a.js';
import type { MetricContract } from '../../src/analytics/contract.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
type Val = string | number | boolean | null | string[] | { json: unknown };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = Kysely<any>;
let h: Phase4Harness; let c: AnalyticsComputeController; let ca: AnalyticsComputationsAController;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const Q = '2026-Q3';
const SCOPE = 'red-sea-corridor';
const SERIES = ['portwatch', 'chokepoint4', 'n_total'].join(':');
/** the variant definitions the cases need (names held in constants: a `…Key: '<name>'` literal reads as a secret to the history scanner) */
const V = { strict: 'MET-022.strict', admit: 'MET-021.admit', world: 'MET-024.world', proposed: 'MET-002.proposed', use: 'ES40-explanation-use' } as const;
const OTHER_SERIES = 'ecb-eurusd';
const H64 = (s: string) => createHash('sha256').update(s).digest('hex');
const J = (v: unknown): Val => ({ json: v });
const id = () => uuidv7();
const plus = (iso: string, seconds: number) => new Date(Date.parse(iso) + seconds * 1000).toISOString();
const day = (d: Date) => d.toISOString().slice(0, 10);

let analyst: AuthenticatedPrincipal; let owner: AuthenticatedPrincipal; let outsider: AuthenticatedPrincipal;
const risk: string[] = []; let forecastOwner = ''; let unqualified = ''; let itemOwner = ''; let agent = ''; let approver = '';
// the fixture's named things
const objCorridor = id(); const objOther = id(); const bab = id(); const otherEntity = id(); const cap1 = id(); const msr1 = id(); const dec = id();
const ini1 = id(); const ini2 = id(); const plan1 = id();
const P = { p1: id(), p2: id(), p3: id(), p4: id(), p5: id(), p6: id() };
const corr = { p1: id(), p2: id(), p3: id(), p4: id(), p5: id(), s1: id() };
const ev1 = id(); const evWithdrawn = id();

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rq = (as: AuthenticatedPrincipal, action: string, idv: string | null = null, correlation?: string) => {
  const r = h.req(as, action, 'AMR', idv, 'intelligence') as { eyeEnvelope: Row };
  if (correlation !== undefined) r.eyeEnvelope['correlation_id'] = correlation;
  return r as never;
};
const compute = async (payload: Row, as: AuthenticatedPrincipal = analyst, correlation?: string) =>
  (await c.compute(rq(as, 'analytics.metric.compute', null, correlation), T(), D(), { payload }) as { result: Row }).result;
const read = async (resultId: string) => (await c.result(rq(owner, 'analytics.read', resultId), T(), D(), resultId, { payload: { recordsLimit: 2000 } }) as { result: Row }).result;
const replay = async (resultId: string) => (await c.replay(rq(analyst, 'analytics.metric.replay', resultId), T(), D(), resultId) as { replay: Row }).replay;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const reasons = (r: Row) => JSON.stringify(r['reasons']);
const recs = async (r: Row) => arr((await read(String(r['result_id'])))['records']);
const byId = async (r: Row) => new Map((await recs(r)).map((x) => [String(x['record_id']), x]));

// ── planting (superuser, triggers off) ────────────────────────────────────────────────────────────────────────────────────────────
const val = (v: Val) => (v !== null && typeof v === 'object' && !Array.isArray(v) ? sql`${JSON.stringify(v.json)}::jsonb` : sql`${v}`);
async function ins(tx: Tx, table: string, row: Record<string, Val>): Promise<void> {
  const cols = Object.keys(row);
  await sql`insert into ${sql.raw(table)} (${sql.raw(cols.join(', '))}) values (${sql.join(cols.map((k) => val(row[k] as Val)))})`.execute(tx);
}
const dom = (r: Record<string, Val>): Record<string, Val> => ({ scope: 'DOMAIN', tenant_id: T(), domain_id: D(), correlation_id: id(), ...r });
async function plant(fn: (put: (table: string, row: Record<string, Val>) => Promise<void>) => Promise<void>): Promise<void> {
  await h.su.transaction().execute(async (tx) => {
    await sql`set local session_replication_role = replica`.execute(tx);
    await fn((table, row) => ins(tx as unknown as Tx, table, row));
  });
}

/** An APPROVED definition planted from this part's contract (the prelude idiom: §MD's ports are another part's). */
async function plantDefinition(cdef: MetricContract, o: { metricKey?: string; params?: Row; clock?: 'record' | 'world'; floorN?: number } = {}): Promise<void> {
  const key = o.metricKey ?? cdef.metricKey;
  const contract = { ...cdef, metricKey: key, params: o.params ?? cdef.params, window: { ...cdef.window, clock: o.clock ?? cdef.window.clock } };
  await sql`insert into analytics.metric_definitions (definition_id, scope, tenant_id, domain_id, metric_key, version, title, meaning, kind, unit, direction, population, numerator, denominator,
      exclusions, window_spec, dimensions, privacy_class, k_min, floor_n, threshold, purpose_key, serves, cadence, owner_principal_id, action, retirement, quality, cost_allocation, computation_key,
      params, supported, unsupported_reason, source_refs, state, digest, proposed_by, proposed_by_kind, decided_by, decided_at, effective_from, correlation_id)
    values (${id()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${key}, 1, ${`${cdef.title} (SYNTHETIC fixture)`}, ${cdef.meaning}, ${cdef.kind}, ${cdef.unit}, ${cdef.direction},
      ${JSON.stringify(cdef.population)}::jsonb, ${cdef.numerator}, ${cdef.denominator}, ${JSON.stringify(cdef.exclusions)}::jsonb, ${JSON.stringify(contract.window)}::jsonb,
      ${cdef.dimensions}::text[], ${cdef.privacyClass}, ${cdef.kMin}, ${o.floorN ?? cdef.floorN}, ${JSON.stringify(cdef.threshold)}::jsonb, ${cdef.purposeKey}, ${JSON.stringify(cdef.serves)}::jsonb,
      ${cdef.cadence}, ${owner.principalId}::uuid, ${cdef.action}, ${cdef.retirement}, ${JSON.stringify(cdef.quality)}::jsonb, ${JSON.stringify(cdef.costAllocation)}::jsonb, ${cdef.computationKey},
      ${JSON.stringify(contract.params)}::jsonb, ${cdef.computationKey !== null}, ${cdef.unsupportedReason}, ${cdef.sourceRefs}::text[], 'approved', ${H64(JSON.stringify(contract))},
      ${analyst.principalId}::uuid, 'human', ${owner.principalId}::uuid, clock_timestamp(), clock_timestamp(), ${id()}::uuid)`.execute(h.su);
}
const contract = (key: string): MetricContract => { const x = definitionsA.find((d) => d.metricKey === key); if (x === undefined) throw new Error(`no contract ${key}`); return x; };

// ── the fixture's timeline (2026-Q3 = [2026-07-01, 2026-10-01) UTC) ─────────────────────────────────────────────────────────────────
const RECEIPT_AFTER = [300, 200, 100, 400, 500, 600];   // W1..W6: raise → receipt (s)
const ACK_AFTER = [60, 120, 180, 240, 300, 600];         // W1..W6: receipt → acknowledgement (s) — MET-022's values
const W = Array.from({ length: 17 }, () => id());         // W[1..16]
const raisedAt = (i: number) => `2026-08-${String(i).padStart(2, '0')}T08:00:00.000Z`;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  c = h.app.get(AnalyticsComputeController);
  ca = h.app.get(AnalyticsComputationsAController);
  analyst = await h.humanWithSession(['product_analyst'], 'b92a-analyst');
  owner = await h.humanWithSession(['product_analytics_owner'], 'b92a-owner');
  outsider = await h.humanWithSession(['simulation_operator'], 'b92a-outsider');
  for (let i = 0; i < 6; i++) risk.push((await h.principalWith(['risk_owner'], `b92a-risk${i}`)).principalId);
  forecastOwner = (await h.principalWith(['forecast_owner'], 'b92a-fcst')).principalId;
  unqualified = (await h.principalWith(['simulation_operator'], 'b92a-unq')).principalId;
  itemOwner = (await h.principalWith(['decision_owner'], 'b92a-itemowner')).principalId;
  approver = (await h.principalWith(['decision_authority'], 'b92a-approver')).principalId;
  agent = id();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${agent}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'b92a fixture agent (SYNTHETIC)', ${`fx-agent-${agent.slice(-8)}`}, 'active')`.execute(h.su);
  // the acknowledgers held their roles BEFORE 2026-Q3 (MET-022 judges the role AT the acknowledgement instant)
  await h.su.transaction().execute(async (tx) => {
    await sql`set local session_replication_role = replica`.execute(tx);
    await sql`update identity.role_bindings set created_at = '2026-01-01T00:00:00Z' where principal_id = any(${[...risk, forecastOwner, unqualified, itemOwner, approver]}::uuid[])`.execute(tx);
  });

  // the definitions: every contract of the part, APPROVED; and the variants the cases need
  for (const d of definitionsA) await plantDefinition(d);
  await plantDefinition(contract('MET-022'), { metricKey: V.strict, params: { start: 'receipt', admit_synthetic: false } });
  await plantDefinition(contract('MET-021'), { metricKey: V.admit, params: { admit_synthetic: true } });
  await plantDefinition(contract('MET-024'), { metricKey: V.world, clock: 'world' });
  await plantDefinition(contract('MET-002'), { metricKey: V.proposed, params: { gate: 'proposed' } });

  await plant(async (put) => {
    // ── the strategy objects and the scope ────────────────────────────────────────────────────────────────────────────────────────
    const so = (sid: string, type: string, title: string) => put('graph.strategy_current', dom({ strategy_object_id: sid, object_type: type, object_version: 1, title, statement: `${title} (SYNTHETIC)`,
      status: 'active', verification_state: 'not_applicable', owner_principal_id: approver, declared_at: '2026-06-01T00:00:00Z' }));
    await so(objCorridor, 'OBJ', 'On-time delivery through the Red Sea corridor'); await so(objOther, 'OBJ', 'An unrelated objective');
    await so(cap1, 'CAP', 'Dual-sourcing capability'); await so(msr1, 'MSR', 'On-time share'); await so(dec, 'DEC', 'A decision object');
    await so(ini1, 'INI', 'Initiative one'); await so(ini2, 'INI', 'Initiative two');
    await put('graph.alignments', dom({ alignment_id: id(), kind: 'builds', from_id: ini1, from_type: 'INI', to_id: cap1, to_type: 'CAP', strength: 'strong', rationale: 'the initiative builds the capability (SYNTHETIC)',
      digest: H64('a1'), dependency_id: id(), declared_by: approver, declared_at: '2026-06-02T00:00:00Z', state: 'active' }));
    await put('graph.alignments', dom({ alignment_id: id(), kind: 'measures', from_id: msr1, from_type: 'MSR', to_id: objCorridor, to_type: 'OBJ', strength: 'strong', rationale: 'the measure measures the objective (SYNTHETIC)',
      digest: H64('a2'), dependency_id: id(), declared_by: approver, declared_at: '2026-06-02T00:00:00Z', state: 'active' }));
    // canonical evidence: one standing, one withdrawn (recorded in June)
    for (const [oid, state] of [[ev1, 'active'], [evWithdrawn, 'withdrawn']] as const) {
      await put('objects.canonical_objects', { object_id: oid, object_type: 'EVD', scope: 'DOMAIN', tenant_id: T(), domain_id: D(), object_version: 1, lifecycle_state: state, owning_component: 'fixture',
        accountable_owner: 'fixture', truth_state: 'synthetic', synthetic_state: true, classification: 'internal', purpose_scope: 'decision', schema_ref: 'EVD@v1', method_ref: 'fixture@1',
        audit_correlation_id: id(), content_digest: H64(oid), recorded_at: '2026-06-15T00:00:00Z' });
    }

    // ── DECISION PACKAGES P1..P6 (every one SYNTHETIC) ────────────────────────────────────────────────────────────────────────────
    type Pk = { pid: string; title: string; objectives: string[]; committed: string; proposed: string; cls?: string; initiative?: string | null; evidence: string | null; run: string | null;
      simulated: boolean; dissent: boolean; explanation: boolean; ready: string | null; outcome: boolean; assessment: boolean; lesson: boolean; closure: string | null;
      replay: 'ok' | 'unavailable' | null; approval: 'human' | 'agent'; corr: string };
    const pk = async (k: Pk) => {
      await put('decision.packages_current', dom({ package_id: k.pid, decision_object_id: dec, title: k.title, statement: `${k.title} (SYNTHETIC)`, owner_principal_id: approver, state: 'committed',
        current_version: 1, committed_version: 1, decided_at: k.committed, synthetic_state: true, declared_by: approver, declared_at: '2026-07-01T00:00:00Z', decision_class: k.cls ?? 'standard',
        board: k.cls === 'board' ? J({ fixture: true }) : null, initiative_id: k.initiative ?? null }));
      await put('decision.package_versions', dom({ package_id: k.pid, version: 1, state: 'committed', known_at: '2026-07-01T00:00:00Z', objectives: J(k.objectives), risks: J([{ risk: 'a corridor closure' }]),
        approver_policy: J({ roles: ['decision_authority'] }), choice: J({ option: 'a' }), version_digest: H64(`v${k.pid}`), header_digest: H64(`h${k.pid}`), proposed_at: k.proposed, proposed_by: approver,
        author_principal_id: approver, synthetic_state: true }));
      const cons: unknown[] = [];
      if (k.evidence !== null) cons.push({ kind: 'evidence', id: k.evidence, version: 1 });
      if (k.run !== null) cons.push({ kind: 'run', id: k.run, version: 1 });
      for (const [key, kind, cs, sim] of [['sq', 'status_quo', [], false], ['a', 'intervention', cons, k.simulated], ['b', 'intervention', [], false]] as const) {
        await put('decision.options', dom({ option_id: id(), package_id: k.pid, version: 1, key, title: `option ${key}`, kind, consequences: J(cs), simulated: sim, unsimulated_reason: sim ? null : 'not simulated (fixture)',
          set_by: approver, set_at: '2026-07-10T00:00:00Z' }));
      }
      if (k.dissent) await put('decision.dissent', dom({ dissent_id: id(), package_id: k.pid, version: 1, principal_id: approver, position: 'against the draw-down', rationale: 'a recorded position (SYNTHETIC)', recorded_at: '2026-07-20T00:00:00Z' }));
      if (k.explanation) {
        const xid = id();
        await put('decision.explanations', dom({ explanation_id: xid, subject_kind: 'package_version', subject_id: k.pid, subject_version: 1, explanation_version: 1, subject_digest: H64(`s${k.pid}`), subject_title: k.title,
          generator: 'fixture@1', conclusion: J({}), items: J([]), counter_evidence: J([]), competing_hypotheses: J([]), limitations: J([]),
          uncertainty: J({ likelihood: 'm', impact: 'm', confidence: 'm', evidence_quality: 'm', disagreement: 'm' }), contract: J({}), faithfulness_state: 'complete', integrity_digest: H64(`x${k.pid}`),
          generated_by: approver, generated_at: '2026-07-30T00:00:00Z' }));
        explanationOf[k.pid] = xid;
      }
      if (k.ready !== null) await put('decision.gate_actions', dom({ action_id: id(), package_id: k.pid, version: 1, action: 'ready', actor_principal_id: approver, rationale: 'decision-ready (SYNTHETIC)',
        information_package_digest: H64(`g${k.pid}`), from_state: 'under_review', to_state: 'approved', at: k.ready }));
      const aid = id();
      await put('decision.approvals', dom({ approval_id: aid, package_id: k.pid, version: 1, approver_principal_id: k.approval === 'human' ? approver : agent, decision: 'approve', version_digest: H64(`v${k.pid}`),
        rationale: 'approved on the version digest (SYNTHETIC)', eligible_by: 'role:decision_authority', expires_at: '2027-01-01T00:00:00Z', recorded_at: plus(k.committed, -3600) }));
      commitmentOf[k.pid] = id();
      await put('decision.commitments', dom({ commitment_id: commitmentOf[k.pid]!, package_id: k.pid, version: 1, committed_by: approver, version_digest: H64(`v${k.pid}`), approvals: J([{ approver: k.approval === 'human' ? approver : agent, approval_id: aid }]),
        op_class: 'C3', bound_action: 'decision.commit', header_digest: H64(`c${k.pid}`), committed_at: k.committed, policy_decision_id: id(), correlation_id: k.corr }));
      if (k.outcome) await put('decision.outcomes', dom({ outcome_id: id(), package_id: k.pid, version: 1, criterion_key: 'on_time', criterion: J({}), observed_value: J(0.9), target: 0.95, comparator: '>=', met: false,
        observed_on: J({}), header_digest: H64(`o${k.pid}`), recorded_by: approver, recorded_at: '2026-09-01T00:00:00Z' }));
      let assessment: string | null = null;
      if (k.assessment) {
        assessment = id();
        await put('decision.outcome_assessments', dom({ assessment_id: assessment, package_id: k.pid, version: 1, assessment_version: 1, observed: J({ outcomes: [], statement: 'observed (SYNTHETIC)' }),
          inferred: J({ statement: 'inferred', method: 'fixture', confidence: 'low' }), counterfactual: J({ claim: 'c', basis: 'b' }), changed_conditions: J([]), digest: H64(`a${k.pid}`), assessed_by: approver,
          assessed_at: '2026-09-02T00:00:00Z' }));
      }
      if (k.lesson && assessment !== null) await put('decision.lessons', dom({ lesson_id: id(), package_id: k.pid, assessment_id: assessment, kind: 'lesson', memory_item_id: id(), memory_version: 1,
        title: 'a governed lesson (SYNTHETIC)', linked_by: approver, linked_at: '2026-09-03T00:00:00Z' }));
      if (k.closure !== null) await put('decision.package_events', dom({ event_id: id(), package_id: k.pid, event: k.closure, actor_principal_id: approver,
        details: J({ lessons: 'the closure states what was learned (SYNTHETIC)' }), occurred_at: '2026-09-04T00:00:00Z' }));
      if (k.replay !== null) await put('decision.replays', dom({ replay_id: id(), package_id: k.pid, version: 1, known_at: '2026-07-01T00:00:00Z', decided_at: k.committed, as_of: plus(k.committed, 86400),
        content_digest: H64(`r${k.pid}`), header_digest: H64(`rh${k.pid}`), reader_principal_id: approver, purpose: 'decision_replay', unavailable: J(k.replay === 'ok' ? [] : [{ input: 'a superseded series version' }]),
        replayed_at: '2026-09-05T00:00:00Z' }));
    };
    const explanationOf: Record<string, string> = {}; const commitmentOf: Record<string, string> = {};
    await pk({ pid: P.p1, title: 'P1 reroute via the Cape', objectives: [objCorridor], committed: '2026-08-10T10:00:00Z', proposed: '2026-07-25T10:00:00Z', initiative: ini1, evidence: ev1, run: RUN.r1, simulated: true,
      dissent: true, explanation: true, ready: '2026-08-02T00:00:00Z', outcome: true, assessment: true, lesson: true, closure: null, replay: 'ok', approval: 'human', corr: corr.p1 });
    await pk({ pid: P.p2, title: 'P2 second source', objectives: [objCorridor], committed: '2026-08-11T10:00:00Z', proposed: '2026-07-26T10:00:00Z', evidence: ev1, run: RUN.r2, simulated: true,
      dissent: false, explanation: true, ready: '2026-08-03T00:00:00Z', outcome: true, assessment: true, lesson: false, closure: null, replay: 'ok', approval: 'human', corr: corr.p2 });
    await pk({ pid: P.p3, title: 'P3 buffer stock', objectives: [objCorridor], committed: '2026-08-12T10:00:00Z', proposed: '2026-07-27T10:00:00Z', evidence: evWithdrawn, run: null, simulated: false,
      dissent: true, explanation: true, ready: '2026-08-04T00:00:00Z', outcome: true, assessment: false, lesson: false, closure: 'package.closed', replay: 'unavailable', approval: 'human', corr: corr.p3 });
    await pk({ pid: P.p4, title: 'P4 board draw-down', objectives: [objCorridor], committed: '2026-08-13T10:00:00Z', proposed: '2026-07-28T10:00:00Z', cls: 'board', evidence: ev1, run: RUN.r4, simulated: true,
      dissent: true, explanation: false, ready: '2026-08-05T00:00:00Z', outcome: true, assessment: true, lesson: false, closure: 'commitment.closed', replay: null, approval: 'human', corr: corr.p4 });
    await pk({ pid: P.p5, title: 'P5 an unrelated decision', objectives: [objOther], committed: '2026-08-20T10:00:00Z', proposed: '2026-08-01T10:00:00Z', evidence: null, run: null, simulated: false,
      dissent: false, explanation: false, ready: null, outcome: false, assessment: false, lesson: false, closure: null, replay: null, approval: 'agent', corr: corr.p5 });
    await pk({ pid: P.p6, title: 'P6 committed in 2026-Q2', objectives: [objCorridor], committed: '2026-05-10T10:00:00Z', proposed: '2026-05-01T10:00:00Z', evidence: ev1, run: null, simulated: false,
      dissent: false, explanation: false, ready: null, outcome: false, assessment: false, lesson: false, closure: null, replay: null, approval: 'human', corr: id() });
    // the explanation renderings (ES-40-008 explanation use): P1 rendered before its commitment, P2 after
    await put('decision.explanation_renderings', dom({ rendering_id: id(), explanation_id: explanationOf[P.p1]!, audience: J({ role: 'executive' }), sentences: J(['a sentence']), renderer_principal_id: approver,
      renderer_kind: 'human', faithfulness: 'faithful', check_result: J({}), explanation_digest: H64('e1'), state: 'standing', rendered_at: '2026-08-05T00:00:00Z' }));
    await put('decision.explanation_renderings', dom({ rendering_id: id(), explanation_id: explanationOf[P.p2]!, audience: J({ role: 'executive' }), sentences: J(['a sentence']), renderer_principal_id: approver,
      renderer_kind: 'human', faithfulness: 'faithful', check_result: J({}), explanation_digest: H64('e2'), state: 'standing', rendered_at: '2026-08-15T00:00:00Z' }));
    // a signed act (MET-004), audited under corr.s1
    await put('executive.signatures', dom({ signature_id: id(), subject_kind: 'health_snapshot', subject_id: id(), subject_version: 1, subject_digest: H64('sig'), signer: approver, key_id: 'fixture-key',
      algorithm: 'ed25519', signature: 'c2lnbmF0dXJl', bound_action: 'executive.health.snapshot.approve', signed_at: '2026-08-21T00:00:00Z', correlation_id: corr.s1 }));
    // recommendations (MET-005): R1 complete on P1; R2 on P1 option b (nothing); R3 on P2 withdrawn; R5 complete on P2; R6 out of scope (P5)
    const rec = (pid: string, option: string, o: { complete: boolean; withdrawn?: boolean }) => put('decision.recommendations', dom({ recommendation_id: id(), package_id: pid, version: 1, option_key: option,
      what: 'recommend the option (SYNTHETIC)', for_whom: 'the decision authority', by_when: '2026-09-30', what_could_make_it_wrong: J([{ what: 'the corridor reopens' }]),
      assumptions: J(o.complete ? [{ what: 'insurers stay out' }] : []), model_outputs: J(o.complete ? [{ run: 'r' }] : []), author_kind: 'human', author_principal_id: approver,
      digest: H64(`${pid}${option}${o.complete}`), state: o.withdrawn ? 'withdrawn' : 'proposed', withdrawn_by: o.withdrawn ? approver : null, withdrawn_at: o.withdrawn ? '2026-09-01T00:00:00Z' : null,
      withdrawal_reason: o.withdrawn ? 'superseded by events (SYNTHETIC)' : null, recorded_at: '2026-08-01T00:00:00Z' }));
    await rec(P.p1, 'a', { complete: true }); await rec(P.p1, 'b', { complete: false }); await rec(P.p2, 'a', { complete: true, withdrawn: true }); await rec(P.p2, 'a', { complete: true });
    await rec(P.p5, 'a', { complete: true });

    // ── COMMITMENT ITEMS (MET-029, MET-030, ES-40-008 visibility) ─────────────────────────────────────────────────────────────────
    const item = async (iid: string, pid: string, parent: string | null, due: string, created: string) => put('decision.commitment_items', dom({ item_id: iid, commitment_id: commitmentOf[pid]!, package_id: pid,
      parent_item_id: parent, kind: parent === null ? 'obligation' : 'milestone', title: `item ${iid.slice(-4)} (SYNTHETIC)`, owner_principal_id: itemOwner, reviewer_basis: 'declared', due_at: due,
      state: 'open', objective_ids: [objCorridor], created_by: approver, created_at: created }));
    const ev = (iid: string, pid: string, event: string, at: string, actor = itemOwner) => put('decision.commitment_events', dom({ event_id: id(), commitment_id: commitmentOf[pid]!, item_id: iid, event, actor_principal_id: actor,
      details: J({ fixture: true }), occurred_at: at }));
    await item(CI.c1, P.p1, null, '2026-09-15T00:00:00Z', '2026-08-10T11:00:00Z');
    await item(CI.c1a, P.p1, CI.c1, '2026-09-01T00:00:00Z', '2026-08-10T11:00:00Z');
    await item(CI.c3, P.p1, CI.c1, '2026-09-25T00:00:00Z', '2026-08-10T11:00:00Z');
    await item(CI.c2, P.p2, null, '2026-09-20T00:00:00Z', '2026-08-11T11:00:00Z');
    await item(CI.c2a, P.p2, CI.c2, '2026-09-10T00:00:00Z', '2026-08-11T11:00:00Z');
    await item(CI.c4, P.p2, CI.c2, '2026-09-28T00:00:00Z', '2026-08-11T11:00:00Z');
    await item(CI.c5, P.p2, CI.c2, '2026-09-05T00:00:00Z', '2026-08-11T11:00:00Z');
    await ev(CI.c1, P.p1, 'item.accepted', '2026-08-10T20:00:00Z');   // the owner saw it within the day
    await ev(CI.c1a, P.p1, 'item.done', '2026-08-30T00:00:00Z');
    await ev(CI.c3, P.p1, 'item.waived', '2026-09-20T00:00:00Z', approver);
    await ev(CI.c4, P.p2, 'item.cancelled', '2026-09-21T00:00:00Z', approver);

    // ── INITIATIVES (MET-029) ─────────────────────────────────────────────────────────────────────────────────────────────────────
    await put('executive.plans', dom({ plan_id: plan1, title: 'Dual-sourcing 2027 (SYNTHETIC)', statement: 'the plan', horizon: '12m', objective_ids: [objCorridor], owner_principal_id: approver, budget_currency: 'EUR',
      budget_total: 1000, budget_authority: 1000, digest: H64('plan'), declared_by: approver }));
    for (const [iid, title] of [[ini1, 'I1 dual sourcing'], [ini2, 'I2 buffer stock']] as const) {
      await put('executive.initiatives', dom({ initiative_id: iid, plan_id: plan1, objective_id: objCorridor, title, sponsor_principal_id: approver, owner_principal_id: approver, proposed_by: approver,
        proposed_by_kind: 'human', state: 'approved', approved_by: approver, approved_at: '2026-08-01T00:00:00Z', funded_amount: 10, digest: H64(iid) }));
    }

    // ── WARNINGS W1..W16 and their attention items, deliveries, acts, feedback (MET-019..023, V1) ─────────────────────────────────
    const warning = async (i: number, o: { level: string; ack?: { at: string; by: string } | null; timing?: string; affected?: unknown; origin?: string; originRef?: unknown; closed?: string | null }) => {
      await put('prediction.warnings_current', dom({ warning_id: W[i]!, title: `W${i} (SYNTHETIC)`, evidence: J([{ kind: 'fixture' }]), consequence: 'a corridor consequence (SYNTHETIC)', confidence: 0.6,
        response_window_opens_at: raisedAt(i), response_window_closes_at: plus(raisedAt(i), 7 * 86400), routed_to: approver, raised_at: raisedAt(i), raised_by: approver, raised_as_of: raisedAt(i),
        timing_mode: o.timing ?? 'live', state: o.ack ? 'acknowledged' : (o.closed ? 'closed' : 'raised'), acknowledged_at: o.ack?.at ?? null, acknowledged_by: o.ack?.by ?? null,
        acknowledged_as_of: o.ack?.at ?? null, level: o.level, level_version: 1, urgency: 'prompt', consequence_class: 'C2', consequence_class_source: 'declared', op_class: 'C2',
        origin_kind: o.origin ?? 'indicator_breach', origin_ref: J(o.originRef ?? {}), affected: J(o.affected ?? { objectives: [objCorridor], geographies: ['BAB-EL-MANDEB'] }),
        closure: o.closed ? J({ disposition: 'resolved (SYNTHETIC)' }) : null, closed_at: o.closed ?? null, closed_by: o.closed ? approver : null }));
    };
    const attItem = async (subjectKind: string, subject: string, outcome: string, created: string, ackAt: string | null = null) => {
      const iid = id();
      await put('executive.attention_items', dom({ item_id: iid, signal_class: subjectKind === 'warning' ? 'warning.raised' : 'commitment.due', subject_kind: subjectKind, subject_id: subject, cause_event_id: id(),
        cause_event_type: 'fixture', title: `item on ${subjectKind} (SYNTHETIC)`, outcome, state: outcome === 'material' ? (ackAt ? 'acknowledged' : 'open') : 'closed', evaluation: J({ dimensions: { consequence: 'C2' } }),
        acknowledged_at: ackAt, acknowledged_by: ackAt ? approver : null, closed_at: outcome === 'material' ? null : created, closed_by: outcome === 'material' ? null : approver, created_at: created }));
      return iid;
    };
    const itemEvent = (iid: string, event: string, at: string, details: unknown = {}) => put('executive.attention_item_events', dom({ event_id: id(), item_id: iid, event, actor_principal_id: approver, details: J(details), occurred_at: at }));
    const delivery = (iid: string, recipient: string, channel: string, at: string) => put('executive.attention_deliveries', dom({ delivery_id: id(), item_id: iid, item_event_id: id(), item_event: 'item.routed',
      channel, recipient_principal_id: recipient, attempt: 1, max_attempts: 3, state: 'delivered', receipt: J({ at, placed: true, channel, fixture: true }), attempted_at: at, synthetic_state: channel !== 'in_app',
      created_at: plus(at, -1) }));
    const feedback = (w: string, kind: string) => put('prediction.warning_feedback', dom({ feedback_id: id(), warning_id: w, kind, warning_state: 'acknowledged', given_by: approver, given_at: '2026-09-10T00:00:00Z' }));
    const DISP = ['actioned', 'actioned', 'not_material', 'duplicate', 'actioned', null];
    for (let i = 1; i <= 6; i++) {
      const receipt = plus(raisedAt(i), RECEIPT_AFTER[i - 1]!); const ack = plus(receipt, ACK_AFTER[i - 1]!);
      await warning(i, { level: i <= 4 ? 'high' : 'normal', ack: { at: ack, by: risk[i - 1]! }, closed: i === 3 ? '2026-09-12T00:00:00Z' : null });
      const it = await attItem('warning', W[i]!, 'material', plus(raisedAt(i), 1), ack);
      await itemEvent(it, 'item.routed', plus(raisedAt(i), 10));
      await itemEvent(it, 'item.acknowledged', ack);
      if (DISP[i - 1] !== null) await itemEvent(it, 'item.disposition', plus(ack, 60), { disposition: DISP[i - 1] });
      await delivery(it, risk[i - 1]!, 'in_app', receipt);
      if (i === 1 || i === 3 || i === 5) await put('executive.attention_item_acts', dom({ act_id: id(), item_id: it, signal_class: 'warning.raised', action_key: 'acknowledge_warning', governed_action: 'prediction.warning.acknowledge',
        target_kind: 'warning', target_id: W[i]!, rationale: 'the act on the warning (SYNTHETIC)', state: 'acted', launched_by: approver, launched_at: plus(ack, 30), effect_ref: `fx:${i}`, settled_at: plus(ack, 31) }));
    }
    for (const [w, k] of [[1, 'useful'], [2, 'useful'], [3, 'useful'], [4, 'useful'], [4, 'false'], [5, 'false'], [6, 'false']] as const) await feedback(W[w]!, k);
    // W7: no delivery at all, a forecast owner acknowledges (the declared proxy); W8: a REPLAYED (world-clock) warning; W9: an unqualified acknowledger
    await warning(7, { level: 'normal', ack: { at: plus(raisedAt(7), 900), by: forecastOwner } });
    await warning(8, { level: 'high', timing: 'replay', ack: { at: plus(raisedAt(8), 50), by: risk[1]! } });
    await warning(9, { level: 'normal', ack: { at: plus(raisedAt(9), 70), by: unqualified } });
    // W10: only a SYNTHETIC (demo-mailbox) receipt; acknowledged by risk owner 0 → under the proxy it starts at the raise
    await warning(10, { level: 'high', ack: { at: plus(raisedAt(10), 1200), by: risk[0]! } });
    const it10 = await attItem('warning', W[10]!, 'material', plus(raisedAt(10), 1));
    await delivery(it10, risk[0]!, 'demo-mailbox', plus(raisedAt(10), 100));
    // W11: OUTSIDE the corridor (another objective), acknowledged after its receipt
    await warning(11, { level: 'high', ack: { at: plus(raisedAt(11), 500), by: risk[1]! }, affected: { objectives: [objOther] } });
    const it11 = await attItem('warning', W[11]!, 'material', plus(raisedAt(11), 1));
    await delivery(it11, risk[1]!, 'in_app', plus(raisedAt(11), 100));
    // W12..W16: weak-signal warnings (MET-020) — never acknowledged; W13 points at a signal that does not exist
    for (let i = 12; i <= 15; i++) await warning(i, { level: 'normal', origin: 'weak_signal', originRef: { signal_id: i === 13 ? id() : SIG[i - 12]! } });
    // a below-threshold item (V1-attention-saved: excluded)
    await warning(16, { level: 'low', affected: { objectives: [objOther] } });
    await attItem('warning', W[16]!, 'below_threshold', plus(raisedAt(16), 1));
    // commitment-item attention items: CI1a delivered to its owner within the day (ES-40-008 visibility); routed, never acted on (V1 understanding: excluded)
    const ic = await attItem('commitment_item', CI.c1a, 'material', '2026-08-10T12:00:00Z');
    await itemEvent(ic, 'item.routed', '2026-08-10T12:00:10Z');
    await delivery(ic, itemOwner, 'in_app', '2026-08-10T12:05:00Z');

    // ── WEAK SIGNALS S0..S5 (+ an agent's disposition) (MET-019, MET-020) ────────────────────────────────────────────────────────
    const sig = async (i: number, disposition: string | null, by: string, detector: boolean) => {
      await put('prediction.signals_current', dom({ signal_id: SIG[i]!, version: 1, title: `S${i} (SYNTHETIC)`, statement: 'a weak signal near the strait (SYNTHETIC)', subject_kind: 'entity', subject_id: bab,
        nominator_kind: detector ? 'detector' : 'analyst', nominated_by: approver, detection_id: detector ? id() : null, detector_key: detector ? 'novelty' : null, detector_version: detector ? '1' : null,
        detector_digest: detector ? H64('det') : null, as_of: detector ? '2026-07-19' : null, observation: J({}), baseline: J({}), novelty_basis: J({}), maturity: 'tentative',
        corroboration_threshold: 2, classification: 'internal', synthetic_state: true, created_at: '2026-07-20T00:00:00Z' }));
      if (disposition !== null) await put('prediction.signal_events', dom({ event_id: id(), signal_id: SIG[i]!, signal_version: 1, event: disposition === 'escalate' ? 'signal.escalated' : 'signal.disposition',
        actor_principal_id: by, details: J({ disposition }), occurred_at: `2026-08-25T0${i}:00:00Z` }));
    };
    await sig(0, 'escalate', forecastOwner, true); await sig(1, 'confirm', forecastOwner, true); await sig(2, 'monitor', forecastOwner, false);
    await sig(3, 'dismiss', forecastOwner, false); await sig(4, 'confirm', forecastOwner, false); await sig(5, 'confirm', agent, false);

    // ── FORECAST OUTCOMES (MET-024, MET-025) ─────────────────────────────────────────────────────────────────────────────────────
    const outcome = (series: string, horizon: string, method: string, known: string, covered: boolean, target: string, wide = false) => put('prediction.outcome_ledger', dom({ outcome_id: id(), forecast_id: id(),
      series_key: series, horizon_code: horizon, method, target_at: target, observed_value: covered ? 100 : 200, observed_evidence_object_id: ev1, observed_evidence_version: 1, observed_evidence_digest: H64('obs'),
      known_at: known, q10: wide ? 70 : 80, q50: 100, q90: wide ? 130 : 120, covered, abs_error: covered ? 0 : 100, pinball_mean: 1, label: 'live (SYNTHETIC)', recorded_by: approver, recorded_at: known }));
    for (let i = 0; i < 10; i++) await outcome(SERIES, '30d', 'seasonal_naive', `2026-08-${String(10 + i).padStart(2, '0')}T06:00:00Z`, i < 8, `2026-08-${String(9 + i).padStart(2, '0')}`);
    for (let i = 0; i < 8; i++) await outcome(SERIES, '90d', 'ets', `2026-09-${String(10 + i).padStart(2, '0')}T06:00:00Z`, i < 4, `2026-09-${String(9 + i).padStart(2, '0')}`, true);
    for (let i = 0; i < 3; i++) await outcome(OTHER_SERIES, '30d', 'seasonal_naive', `2026-08-${String(20 + i).padStart(2, '0')}T06:00:00Z`, true, `2026-08-${String(19 + i).padStart(2, '0')}`);
    for (let i = 0; i < 3; i++) await outcome(SERIES, '30d', 'seasonal_naive', `2026-05-${String(10 + i).padStart(2, '0')}T06:00:00Z`, true, `2026-05-${String(9 + i).padStart(2, '0')}`);
    // known in October (2026-Q4) but ABOUT a September day: in the world-clock 2026-Q3 only
    await outcome(SERIES, '30d', 'seasonal_naive', '2026-10-02T06:00:00Z', false, '2026-09-29');
    // a BACKTEST of the corridor series computed in the quarter — held-out history, a different definition
    await put('prediction.backtests', dom({ backtest_id: id(), series_key: SERIES, horizon_code: '30d', horizon_days: 30, method: 'seasonal_naive', method_version: '1', baseline_method: 'naive',
      window_from: '2024-01-01', window_to: '2026-01-01', origins: 40, coverage_80: 0.95, verdict: 'a historical backtest (SYNTHETIC)', known_at_discipline: 'historical', computed_by: approver,
      computed_at: '2026-08-15T00:00:00Z', mode: 'historical' }));

    // ── SCENARIO SETS (MET-026) ────────────────────────────────────────────────────────────────────────────────────────────────────
    const scen = (sid: string) => put('prediction.scenarios_current', dom({ scenario_id: sid, title: `scenario ${sid.slice(-4)} (SYNTHETIC)`, statement: 'a scenario', owner_principal_id: approver, review_cadence: 'monthly', state: 'active' }));
    const branch = (bid: string, sid: string) => put('prediction.branches_current', dom({ branch_id: bid, scenario_id: sid, name: `branch ${bid.slice(-4)}`, kind: 'baseline', statement: 'a branch', owner_principal_id: approver,
      review_cadence: 'monthly', consequence: 'a consequence of the branch', state: 'open' }));
    const element = (sid: string, bid: string | null, kind: string, name: string) => put('prediction.scenario_elements', dom({ element_id: id(), scenario_id: sid, branch_id: bid, kind, name, description: `${name} (SYNTHETIC fixture)`,
      attributes: J({}), version: 1, state: 'active', declared_by: approver, declared_at: '2026-07-02T00:00:00Z', updated_by: approver }));
    const set = async (sid: string, pid: string, members: Array<[string, string]>) => {
      await put('prediction.scenario_sets', dom({ set_id: sid, title: `set ${sid.slice(-4)} (SYNTHETIC)`, purpose: 'the plausible futures of the corridor', owner_principal_id: approver, package_id: pid,
        plurality_policy: J({}), state: 'active', version: 1, declared_by: approver, activated_by: approver, activated_at: '2026-07-05T00:00:00Z' }));
      for (const [scn, br] of members) await put('prediction.scenario_set_members', dom({ member_id: id(), set_id: sid, scenario_id: scn, branch_id: br, added_by: approver, added_in_version: 1, added_at: '2026-07-05T00:00:00Z' }));
    };
    await scen(SC.a); await scen(SC.b);
    for (const [b, s] of [[BR.b1, SC.a], [BR.b2, SC.a], [BR.b3, SC.b], [BR.b4, SC.b]] as const) await branch(b, s);
    await element(SC.a, BR.b1, 'driver', 'Houthi activity'); await element(SC.a, BR.b1, 'impact', 'Reroute via the Cape');
    await element(SC.a, BR.b2, 'driver', 'Insurer withdrawal'); await element(SC.a, BR.b2, 'impact', 'War-risk surcharge');
    await element(SC.b, BR.b3, 'driver', 'Houthi activity'); await element(SC.b, BR.b3, 'impact', 'Reroute via the Cape');
    await set(SET.s1, P.p1, [[SC.a, BR.b1], [SC.a, BR.b2]]);   // distinct → passes
    await set(SET.s2, P.p2, [[SC.a, BR.b1], [SC.b, BR.b3]]);   // the same structure → fails
    await set(SET.s3, P.p1, [[SC.a, BR.b1], [SC.b, BR.b4]]);   // a structureless branch → fails
    await set(SET.s4, P.p5, [[SC.a, BR.b1], [SC.a, BR.b2]]);   // outside the corridor

    // ── TWINS AND RUNS (MET-027, MET-028) ────────────────────────────────────────────────────────────────────────────────────────
    const today = new Date();
    const twin = async (tid: string, boundary: string[], o: { policyDays: number | null; observedAgo: number; contract: string[] | null; elements: string[]; validation: string | null }) => {
      await put('twin.twins_current', dom({ twin_id: tid, kind: 'enterprise', title: `twin ${tid.slice(-4)} (SYNTHETIC)`, statement: 'a twin', boundary: J(boundary), owner_principal_id: approver,
        behaviour_model_ref: 'supply-flow@1', validation: J({}), declared_by: approver, declared_at: '2026-06-01T00:00:00Z', synthetic_state: true }));
      await put('twin.twin_versions', dom({ twin_id: tid, version: 1, branch_id: 'actual', state: 'admitted', known_at: '2026-07-01T00:00:00Z', observed_through: day(new Date(today.getTime() - o.observedAgo * 86400000)),
        opened_by: approver, opened_at: '2026-07-01T00:00:00Z', admitted_at: '2026-07-01T01:00:00Z', synthetic_state: true }));
      if (o.policyDays !== null) await put('twin.freshness_policies', dom({ twin_id: tid, version: 1, max_age_days: o.policyDays, note: 'the freshness contract (SYNTHETIC)', set_by: approver, set_at: '2026-07-01T00:00:00Z' }));
      if (o.contract !== null) await put('twin.twin_contracts', dom({ twin_id: tid, contract_version: 1, exposed: J(Object.fromEntries(o.contract.map((k) => [k, { unit: 'u', cadence: 'on-admission' }]))),
        approved_uses: J({ method_families: [], decision_classes: [] }), state: 'current', published_by: approver, published_at: '2026-07-01T00:00:00Z' }));
      for (const k of o.elements) await put('twin.state_elements', dom({ element_id: id(), twin_id: tid, version: 1, key: k, kind: 'observed', value: J(1), material: true, citations: J([]), health: 'ok', grounded_by: approver }));
      if (o.validation !== null) await put('twin.validations', dom({ validation_id: id(), twin_id: tid, version: 1, verdict: o.validation, prior_state: 'none', envelope_check: J({}), envelope_state: 'inside',
        calibration: J({}), reason: 'a validation of the head (SYNTHETIC)', validated_by: approver, validated_at: '2026-07-02T00:00:00Z' }));
    };
    await twin(TW.t1, [bab], { policyDays: 30, observedAgo: 5, contract: ['supply.capacity'], elements: ['supply.capacity'], validation: 'fit' });
    await twin(TW.t2, [bab], { policyDays: 10, observedAgo: 40, contract: null, elements: [], validation: 'fit' });
    await twin(TW.t3, [bab], { policyDays: null, observedAgo: 1, contract: null, elements: [], validation: 'fit' });
    await twin(TW.t4, [bab], { policyDays: 30, observedAgo: 1, contract: ['supply.capacity', 'line.capacity'], elements: ['supply.capacity'], validation: 'fit' });
    await twin(TW.t5, [otherEntity], { policyDays: 30, observedAgo: 1, contract: null, elements: [], validation: 'fit' });
    const run = async (rid: string, completed: string, o: { verdict: string | null; invalidated?: string }) => {
      await put('simulation.runs_current', dom({ run_id: rid, twin_id: TW.t1, twin_version: 1, branch_id: 'actual', run_kind: 'control', shock: false, component: 'supply', known_at: '2026-07-01T00:00:00Z',
        observed_through: '2026-07-01', initial_state: J({}), initial_state_digest: H64('is'), model_ref: 'supply-flow@1', implementation_digest: H64('impl'), environment_digest: H64('env'), environment: J({}),
        stochastic_mode: 'deterministic', interventions: J([{ type: 'none' }]), constraints: J({}), assumptions: J({}), inputs_digest: H64('in'), validation_status: 'validated', state: 'completed',
        outputs: J({}), outputs_digest: H64(`out${rid}`), sensitivity: J({}), header_digest: H64(`hd${rid}`), operator_principal_id: approver, opened_at: plus(completed, -60), completed_at: completed,
        validity: o.invalidated ? 'invalidated' : 'valid', invalidated_at: o.invalidated ?? null, invalidated_by: o.invalidated ? approver : null, invalidation: o.invalidated ? J({ reason: 'fixture' }) : null }));
      if (o.verdict !== null) await put('simulation.reproductions', dom({ reproduction_id: id(), run_id: rid, verdict: o.verdict, expected_digest: H64(`out${rid}`),
        actual_digest: o.verdict === 'reproduced' ? H64(`out${rid}`) : (o.verdict === 'mismatch' ? H64('other') : null), reason: `the reproduction ${o.verdict} (SYNTHETIC)`, environment_digest: H64('env'),
        environment_matches: true, cold_process: true, operator_principal_id: approver, reproduced_at: plus(completed, 3600) }));
    };
    await run(RUN.r1, '2026-08-01T00:00:00Z', { verdict: 'reproduced' }); await run(RUN.r2, '2026-08-02T00:00:00Z', { verdict: 'mismatch' });
    await run(RUN.r3, '2026-08-03T00:00:00Z', { verdict: null }); await run(RUN.r4, '2026-08-04T00:00:00Z', { verdict: 'reproduced' });
    await run(RUN.r5, '2026-08-05T00:00:00Z', { verdict: 'reproduced', invalidated: '2026-08-06T00:00:00Z' });
  });

  // MET-004's audit events: a real governed write (an unsupported measure's compute, audited by the pipeline) under each effect's correlation
  for (const k of [corr.p1, corr.p2, corr.p3, corr.p5, corr.s1]) await compute({ metricKey: 'V1-resilience', period: Q }, analyst, k);
}, 900_000);

const CI = { c1: id(), c1a: id(), c2: id(), c2a: id(), c3: id(), c4: id(), c5: id() };
const SIG = Array.from({ length: 6 }, () => id());
const SC = { a: id(), b: id() }; const BR = { b1: id(), b2: id(), b3: id(), b4: id() };
const SET = { s1: id(), s2: id(), s3: id(), s4: id() };
const TW = { t1: id(), t2: id(), t3: id(), t4: id(), t5: id() };
const RUN = { r1: id(), r2: id(), r3: id(), r4: id(), r5: id() };

afterAll(async () => { await h?.close(); });

const scopeRow = async () => {
  await sql`insert into analytics.scopes (scope_id, scope, tenant_id, domain_id, scope_key, version, title, entity_ids, objective_ids, series_keys, geographies, description, state, digest, proposed_by, decided_by, decided_at, decision_reason, correlation_id)
    values (${id()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${SCOPE}, 1, 'The Red Sea corridor (SYNTHETIC fixture)', ${[bab]}::uuid[], ${[objCorridor]}::uuid[], ${[SERIES]}::text[], ${['BAB-EL-MANDEB']}::text[],
      'the Bab el-Mandeb entity, the corridor objective and the chokepoint series', 'approved', ${H64('scope')}, ${analyst.principalId}::uuid, ${owner.principalId}::uuid, clock_timestamp(), 'the corridor scope (fixture)', ${id()}::uuid)`.execute(h.su);
};

describe('MCA0 · the contracts and the registry', () => {
  it('every contract of the part is well-formed; every supported one names a computation registered by 0113 §MCA with its kind and ⊇ dimensions; the six V01-T-046 measures with no source are unsupported with a carrier', async () => {
    await scopeRow();
    expect(definitionsA).toHaveLength(29);
    for (const d of definitionsA) expect(contractProblems(d), d.metricKey).toEqual([]);
    const reg = new Map(((await sql<Row>`select * from analytics.computation_registry where registered_in = '0113 §MCA'`.execute(h.su)).rows).map((r) => [String(r['computation_key']), r]));
    expect(reg.size).toBe(23);
    expect(COMPUTATIONS_A.sort()).toEqual([...reg.keys()].sort());
    for (const d of definitionsA.filter((x) => x.computationKey !== null)) {
      const r = reg.get(d.computationKey!)!;
      expect(r['kind'], d.metricKey).toBe(d.kind);
      for (const dim of d.dimensions) expect(r['dimensions'] as string[], `${d.metricKey} ${dim}`).toContain(dim);
      expect(String(r['body_digest'])).toMatch(/^[0-9a-f]{32}$/);
    }
    const unsupported = definitionsA.filter((x) => x.computationKey === null);
    expect(unsupported.map((x) => x.metricKey)).toEqual(['V1-prevented-loss', 'V1-captured-opportunity', 'V1-option-value', 'V1-resilience', 'V1-residency-compliance', 'V1-lifecycle-coverage']);
    for (const u of unsupported) expect(u.unsupportedReason!).toMatch(/carrier: (B\d+|customer-approved)/);
  });
  it('the contracts route serves them with their registrations (analytics.read); an outsider is refused by the PDP', async () => {
    const out = await ca.contracts(rq(owner, 'analytics.read'), T(), D()) as unknown as { contracts: Row[]; scene: string[] };
    expect(out.contracts).toHaveLength(29);
    expect(out.scene).toEqual(['MET-001', 'MET-022', 'MET-024']);
    expect(out.contracts.filter((x) => x['registered'] === true)).toHaveLength(23);
    expect(out.contracts.find((x) => x['metricKey'] === 'MET-022')).toMatchObject({ registered: true, problems: [], registration: { kind: 'duration', dimensions: ['severity', 'role'] } });
    await refused(ca.contracts(rq(outsider, 'analytics.read'), T(), D()), /./, 403);
  });
  it('an unsupported V01-T-046 measure is computed UNSUPPORTED with its carrier — never a zero', async () => {
    const r = await compute({ metricKey: 'V1-residency-compliance', period: Q });
    expect(r).toMatchObject({ state: 'unsupported', value: null, n: null });
    expect(reasons(r)).toMatch(/unsupported: .*carrier: B62/);
  });
});

describe('MCA1 · MET-001 strategic loop closure (the scene\'s metric #1)', () => {
  let scoped: Row = {};
  it('the corridor, 2026-Q3: 4 committed packages, 2 with all six links → 0.5 with Wilson\'s interval; EVERY link of the six is on each record with what it rests on', async () => {
    scoped = await compute({ metricKey: 'MET-001', period: Q, scopeKey: SCOPE });
    expect(scoped).toMatchObject({ state: 'determinate', n: 4, scope_key: SCOPE, clock: 'record' });
    expect(Number(scoped['value'])).toBe(0.5);
    expect(scoped['uncertainty']).toMatchObject({ method: 'wilson' });
    expect(scoped['quality']).toMatchObject({ synthetic_share: 1, links: ['objective', 'evidence', 'foresight', 'commitment', 'outcome', 'learning'] });
    const m = await byId(scoped);
    const p1 = m.get(P.p1)!; const p2 = m.get(P.p2)!; const p3 = m.get(P.p3)!; const p4 = m.get(P.p4)!;
    expect(p1['role']).toBe('numerator'); expect(p4['role']).toBe('numerator');
    expect(p2['role']).toBe('denominator'); expect(p3['role']).toBe('denominator');
    const links = (r: Row) => (r['detail'] as Row)['links'] as Record<string, Row>;
    expect(Object.keys(links(p1)).sort()).toEqual(['commitment', 'evidence', 'foresight', 'learning', 'objective', 'outcome']);
    expect(links(p1)).toMatchObject({ objective: { met: true, objectives: [objCorridor] }, evidence: { met: true, standing_evidence_citations: 1 }, foresight: { met: true, standing_runs: 1, bound_scenario_sets: 2 },
      commitment: { met: true }, outcome: { met: true, outcomes_recorded: 1, assessments: 1 }, learning: { met: true, governed_lessons: 1 } });
    expect((p2['detail'] as Row)['missing']).toEqual(['learning']);
    expect((p3['detail'] as Row)['missing']).toEqual(['evidence', 'foresight', 'outcome']);   // a withdrawn citation; no foresight; an outcome never assessed
    expect(links(p3)).toMatchObject({ learning: { met: true, closure_lessons_records: 1, governed_lessons: 0 } });   // the closure's lessons record counts as learning
    expect(links(p4)).toMatchObject({ learning: { met: true, closure_lessons_records: 1 } });
  });
  it('the scope applied: the whole domain adds the out-of-corridor package (5, still 2 closed); 2026-Q2 holds one package → INDETERMINATE below the floor, the value NULL, never 0', async () => {
    const all = await compute({ metricKey: 'MET-001', period: Q });
    expect(all).toMatchObject({ state: 'determinate', n: 5 }); expect(Number(all['value'])).toBe(0.4);
    const q2 = await compute({ metricKey: 'MET-001', period: '2026-Q2', scopeKey: SCOPE });
    expect(q2).toMatchObject({ state: 'indeterminate', value: null, n: 1 });
    expect(reasons(q2)).toMatch(/n = 1 is below the floor 3/);
  });
  it('replay at the result\'s own as-of: a lesson linked AFTER the as-of does not count → reproduced; a fresh compute sees it (3 of 4 closed)', async () => {
    await plant(async (put) => {
      const a = String((await one(sql`select assessment_id from decision.outcome_assessments where package_id = ${P.p2}::uuid`))['assessment_id']);
      await put('decision.lessons', dom({ lesson_id: id(), package_id: P.p2, assessment_id: a, kind: 'lesson', memory_item_id: id(), memory_version: 1, title: 'a lesson linked later (SYNTHETIC)', linked_by: approver }));
    });
    const r = await replay(String(scoped['result_id']));
    expect(r).toMatchObject({ replay_verdict: 'reproduced', state: 'determinate' }); expect(Number(r['value'])).toBe(0.5);
    const now = await compute({ metricKey: 'MET-001', period: Q, scopeKey: SCOPE });
    expect(Number(now['value'])).toBe(0.75);
  });
  it('refusal: a cohort over a dimension the computation does not register (422), a person-grained cohort (403)', async () => {
    await refused(compute({ metricKey: 'MET-001', period: Q, cohort: { severity: 'high' } }), /^metric computation rejected \(dimension\)/, 422);
    await refused(compute({ metricKey: 'MET-001', period: Q, cohort: { owner: approver } }), /^metric computation rejected \(person\)/, 403);
  });
});

describe('MCA2 · MET-022 warning acknowledgement latency (the scene\'s metric #2)', () => {
  let scene: Row = {};
  it('the corridor, 2026-Q3, the scene\'s definition (receipt start; the raised_at PROXY declared): 8 qualified acknowledgements — 6 from a receipt, 2 on the LABELLED proxy; p50 270 s, p90 990 s, the median\'s interval', async () => {
    scene = await compute({ metricKey: 'MET-022', period: Q, scopeKey: SCOPE });
    expect(scene).toMatchObject({ state: 'determinate', kind: 'duration', n: 8 });
    expect(Number(scene['value'])).toBe(270);
    expect(scene['distribution']).toMatchObject({ p50: 270, p90: 990, min: 60, max: 1200, n: 8 });
    expect(scene['uncertainty']).toMatchObject({ method: 'order_statistics', lo_rank: 1, hi_rank: 8, lo: 60, hi: 1200 });
    expect(scene['quality']).toMatchObject({ proxy_declared: true, proxy_share: 0.25, world_clock_excluded: 1, qualified_roles: ['domain_admin', 'strategy_owner', 'forecast_owner', 'risk_owner'] });
    const m = await byId(scene);
    const d = (w: number) => m.get(W[w]!)!['detail'] as Row;
    expect(d(1)).toMatchObject({ value: 60, start: 'receipt', role: 'risk_owner', severity: 'high', channel: 'in_app' });
    expect(String(d(7)['start'])).toMatch(/^raised_at \(the definition's declared proxy: no receipt recorded\)/);
    expect(d(7)).toMatchObject({ value: 900, role: 'forecast_owner' });
    expect(String(d(10)['start'])).toMatch(/declared proxy/);   // its only receipt was SYNTHETIC (demo-mailbox): not admitted
    expect(m.get(W[8]!)).toMatchObject({ role: 'excluded', reason: expect.stringMatching(/replayed \(world-clock\) warning/) });
    expect(m.get(W[9]!)).toMatchObject({ role: 'excluded', reason: expect.stringMatching(/none of the qualified roles/) });
    expect(m.has(W[11]!)).toBe(false);   // outside the corridor
    // never a person: no record detail carries a principal id
    expect(JSON.stringify(await recs(scene))).not.toContain(risk[0]!);
  });
  it('the STRICT definition (no proxy): the two proxy records are EXCLUDED "no receipt instant" — 6 included, p50 210 s', async () => {
    const r = await compute({ metricKey: V.strict, period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 6 }); expect(Number(r['value'])).toBe(210);
    const m = await byId(r);
    expect(m.get(W[7]!)).toMatchObject({ role: 'excluded', reason: expect.stringMatching(/no receipt instant/) });
    expect(m.get(W[10]!)).toMatchObject({ role: 'excluded', reason: expect.stringMatching(/no receipt instant/) });
  });
  it('cohorts: severity high (5) determinate; severity normal (3) INDETERMINATE below the floor; role risk_owner rests on 6 distinct acknowledgers (≥ k) → shown; role forecast_owner rests on 1 → INDETERMINATE, "below k", no person singled out', async () => {
    const high = await compute({ metricKey: 'MET-022', period: Q, scopeKey: SCOPE, cohort: { severity: 'high' } });
    expect(high).toMatchObject({ state: 'determinate', n: 5 }); expect(Number(high['value'])).toBe(180);
    const normal = await compute({ metricKey: 'MET-022', period: Q, scopeKey: SCOPE, cohort: { severity: 'normal' } });
    expect(normal).toMatchObject({ state: 'indeterminate', value: null, n: 3 }); expect(reasons(normal)).toMatch(/n = 3 is below the floor 5/);
    const ro = await compute({ metricKey: 'MET-022', period: Q, scopeKey: SCOPE, cohort: { role: 'risk_owner' } });
    expect(ro).toMatchObject({ state: 'determinate', n: 7 }); expect(Number(ro['value'])).toBe(240);
    const fo = await compute({ metricKey: 'MET-022', period: Q, scopeKey: SCOPE, cohort: { role: 'forecast_owner' } });
    expect(fo).toMatchObject({ state: 'indeterminate', value: null, n: 1 });
    expect(reasons(fo)).toMatch(/rests on 1 distinct principals, below k = 5/);
    await refused(compute({ metricKey: 'MET-022', period: Q, cohort: { acknowledged_by: risk[0]! } }), /^metric computation rejected \(person\)/, 403);
  });
  it('replay reproduces the scene\'s result at its own as-of', async () => {
    const r = await replay(String(scene['result_id']));
    expect(r).toMatchObject({ replay_verdict: 'reproduced' }); expect(Number(r['value'])).toBe(270);
  });
});

describe('MCA3 · MET-024 forecast calibration (the scene\'s metric #3) and MET-025 sharpness', () => {
  let scene: Row = {};
  it('the corridor, 2026-Q3: 18 live outcomes, 12 covered → 0.667 — OUTSIDE the band [0.75, 0.85] (a breach: a review, never automatic); the backtest is CONTEXT, not counted', async () => {
    scene = await compute({ metricKey: 'MET-024', period: Q, scopeKey: SCOPE });
    expect(scene).toMatchObject({ state: 'determinate', n: 18 });
    expect(Number(scene['numerator'])).toBe(12); expect(Number(scene['value'])).toBeCloseTo(0.666667, 6);
    expect(scene['threshold_eval']).toMatchObject({ breach: true, threshold: { band: [0.75, 0.85] } });
    expect(scene['quality']).toMatchObject({ backtests_not_counted: 1, window_field: 'prediction.outcome_ledger.known_at' });
    const rd = await read(String(scene['result_id']));
    expect(rd['records_by_role']).toEqual({ numerator: 12, denominator: 6, context: 1 });
    const bt = arr(rd['records']).find((x) => x['record_kind'] === 'backtest')!;
    expect(bt).toMatchObject({ role: 'context', reason: expect.stringMatching(/backtest \(mode historical\) .* never counted as live calibration/) });
  });
  it('cohorts: horizon 30d → 0.8 INSIDE the band (no breach); horizon 90d → 0.5 outside; the whole domain adds another series; 2026-Q2 holds 3 → INDETERMINATE below the floor 8', async () => {
    const h30 = await compute({ metricKey: 'MET-024', period: Q, scopeKey: SCOPE, cohort: { horizon: '30d' } });
    expect(h30).toMatchObject({ state: 'determinate', n: 10, threshold_eval: { breach: false } }); expect(Number(h30['value'])).toBe(0.8);
    const h90 = await compute({ metricKey: 'MET-024', period: Q, scopeKey: SCOPE, cohort: { horizon: '90d', method: 'ets' } });
    expect(h90).toMatchObject({ state: 'determinate', n: 8, threshold_eval: { breach: true } }); expect(Number(h90['value'])).toBe(0.5);
    const all = await compute({ metricKey: 'MET-024', period: Q });
    expect(all).toMatchObject({ n: 21 });
    const q2 = await compute({ metricKey: 'MET-024', period: '2026-Q2', scopeKey: SCOPE });
    expect(q2).toMatchObject({ state: 'indeterminate', value: null, n: 3 }); expect(reasons(q2)).toMatch(/below the floor 8/);
  });
  it('the WORLD clock reads target_at: an outcome KNOWN in October about a September day joins 2026-Q3 (19)', async () => {
    const w = await compute({ metricKey: V.world, period: Q, scopeKey: SCOPE });
    expect(w).toMatchObject({ clock: 'world', n: 19, quality: { clock: 'world', window_field: 'prediction.outcome_ledger.target_at' } });
  });
  it('replay reproduces; MET-025 sharpness is read only for a CALIBRATED population: 30d → 0.4; 90d and the pooled corridor → INDETERMINATE, the coverage named', async () => {
    expect(await replay(String(scene['result_id']))).toMatchObject({ replay_verdict: 'reproduced' });
    const s30 = await compute({ metricKey: 'MET-025', period: Q, scopeKey: SCOPE, cohort: { horizon: '30d' } });
    expect(s30).toMatchObject({ state: 'determinate', kind: 'score', n: 10 }); expect(Number(s30['value'])).toBe(0.4);
    const s90 = await compute({ metricKey: 'MET-025', period: Q, scopeKey: SCOPE, cohort: { horizon: '90d' } });
    expect(s90).toMatchObject({ state: 'indeterminate', value: null }); expect(reasons(s90)).toMatch(/10–90 coverage is 0\.5, outside the band \[0\.75, 0\.85\]/);
    const pooled = await compute({ metricKey: 'MET-025', period: Q, scopeKey: SCOPE });
    expect(pooled).toMatchObject({ state: 'indeterminate' }); expect(reasons(pooled)).toMatch(/outside the band/);
  });
});

describe('MCA4 · decisions: MET-002, MET-003, MET-004, MET-005, V1 decision cycle, ES-40-008 explanation use', () => {
  it('MET-002 at the decision-ready gate: 4 versions, 1 complete (P2 no dissent, P3 no standing evidence, P4 no explanation); the board cohort (1) INDETERMINATE; the proposal gate variant', async () => {
    const r = await compute({ metricKey: 'MET-002', period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 4, threshold_eval: { breach: true } }); expect(Number(r['value'])).toBe(0.25);
    const m = new Map((await recs(r)).map((x) => [String((x['detail'] as Row)['package_id']), x['detail'] as Row]));
    expect(m.get(P.p2)!['missing']).toEqual(['dissent']); expect(m.get(P.p3)!['missing']).toEqual(['evidence']); expect(m.get(P.p4)!['missing']).toEqual(['explanation']);
    const board = await compute({ metricKey: 'MET-002', period: Q, scopeKey: SCOPE, cohort: { decision_class: 'board' } });
    expect(board).toMatchObject({ state: 'indeterminate', n: 1 });
    const prop = await compute({ metricKey: V.proposed, period: Q, scopeKey: SCOPE });
    expect(prop).toMatchObject({ n: 4, quality: { gate: 'proposed' } });
  });
  it('MET-003: 3 replayed (2 without unavailable input), 1 never replayed EXCLUDED and counted; 2026-Q2: the only package unreplayed → INDETERMINATE, the bias said', async () => {
    const r = await compute({ metricKey: 'MET-003', period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 3, quality: { cohort_size: 4, not_replayed: 1 } }); expect(Number(r['value'])).toBeCloseTo(0.666667, 6);
    const m = await byId(r);
    expect(m.get(P.p4)).toMatchObject({ role: 'excluded', reason: expect.stringMatching(/^not replayed/) });
    const q2 = await compute({ metricKey: 'MET-003', period: '2026-Q2', scopeKey: SCOPE });
    expect(q2).toMatchObject({ state: 'indeterminate' }); expect(reasons(q2)).toMatch(/1 of the 1 committed package\(s\) were never replayed/);
  });
  it('MET-004: 5 commitments + 1 signed act; 4 bound to an eligible human, a digest and an audit event; an unaudited commitment and an AGENT\'s approval fail; the scope is ignored, said; the C3 cohort', async () => {
    expect(Number((await one(sql`select count(*)::int n from audit.audit_events where correlation_id = ${corr.p1}::uuid`))['n'])).toBeGreaterThan(0);
    const r = await compute({ metricKey: 'MET-004', period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 6 }); expect(Number(r['value'])).toBeCloseTo(0.666667, 6);
    expect(JSON.stringify(r['quality'])).toMatch(/ignores the scope red-sea-corridor/);
    const recsAll = await recs(r);
    const fails = recsAll.filter((x) => x['role'] === 'denominator').map((x) => (x['detail'] as Row)['failed']);
    expect(fails).toEqual(expect.arrayContaining([['audit'], ['eligible_human']]));
    expect(JSON.stringify(recsAll)).not.toContain(approver);
    const c3 = await compute({ metricKey: 'MET-004', period: Q, cohort: { consequence_class: 'C3' } });
    expect(c3).toMatchObject({ n: 5 }); expect(Number(c3['value'])).toBe(0.6);
  });
  it('MET-005: of 3 decision-active recommendations 2 resolve to all five; the withdrawn one EXCLUDED; the out-of-corridor one outside', async () => {
    const r = await compute({ metricKey: 'MET-005', period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 3 }); expect(Number(r['value'])).toBeCloseTo(0.666667, 6);
    const all = await recs(r);
    expect(all.filter((x) => x['role'] === 'excluded').map((x) => x['reason'])).toEqual([expect.stringMatching(/withdrawn by the as-of/)]);
    expect(all.find((x) => x['role'] === 'denominator')!['detail']).toMatchObject({ missing: ['assumptions', 'evidence', 'methods', 'uncertainty'] });
  });
  it('V1 decision cycle (executive.metrics\' decision latency): 4 commitments, proposal → commitment; ES-40-008 explanation use: 1 of 4 commitments rendered its explanation before committing', async () => {
    const cyc = await compute({ metricKey: 'V1-decision-cycle', period: Q, scopeKey: SCOPE });
    expect(cyc).toMatchObject({ state: 'determinate', n: 4 }); expect(Number(cyc['value'])).toBe(16 * 86400);
    const use = await compute({ metricKey: V.use, period: Q, scopeKey: SCOPE });
    expect(use).toMatchObject({ state: 'determinate', n: 4 }); expect(Number(use['value'])).toBe(0.25);
    const q2 = await compute({ metricKey: V.use, period: '2026-Q2', scopeKey: SCOPE });
    expect(q2).toMatchObject({ state: 'indeterminate', n: 1 });
  });
});

describe('MCA5 · warnings and signals: MET-019, MET-020, MET-021, MET-023, V1 warning precision', () => {
  it('MET-019: 5 human dispositions (escalate, confirm, confirm of 5) → 0.6; an AGENT\'s disposition is not a review; the novelty detector cohort (2) INDETERMINATE', async () => {
    const r = await compute({ metricKey: 'MET-019', period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 5 }); expect(Number(r['value'])).toBe(0.6);
    expect((await byId(r)).has(SIG[5]!)).toBe(false);
    const nov = await compute({ metricKey: 'MET-019', period: Q, scopeKey: SCOPE, cohort: { detector: 'novelty' } });
    expect(nov).toMatchObject({ state: 'indeterminate', n: 2 });
  });
  it('MET-020: 3 warnings raised from signals → the lead time from the signal\'s record; a warning whose signal is unreadable EXCLUDED', async () => {
    const r = await compute({ metricKey: 'MET-020', period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 3 });
    expect(Number(r['value'])).toBe((Date.parse(raisedAt(14)) - Date.parse('2026-07-20T00:00:00Z')) / 1000);
    expect((await byId(r)).get(W[13]!)).toMatchObject({ role: 'excluded', reason: expect.stringMatching(/signal is not readable/) });
  });
  it('MET-021: 6 in-app receipts → p50 350 s; the SYNTHETIC (demo-mailbox) receipt EXCLUDED; admitted by a definition → counted and the synthetic share said', async () => {
    const r = await compute({ metricKey: 'MET-021', period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 6, quality: { admit_synthetic: false } }); expect(Number(r['value'])).toBe(350);
    expect((await recs(r)).filter((x) => x['role'] === 'excluded').map((x) => x['reason'])).toEqual([expect.stringMatching(/a synthetic channel \(demo-mailbox\)/)]);
    const ad = await compute({ metricKey: V.admit, period: Q, scopeKey: SCOPE });
    expect(ad).toMatchObject({ state: 'determinate', n: 7 }); expect(Number(ad['value'])).toBe(300);
    expect(Number((ad['quality'] as Row)['synthetic_share'])).toBeCloseTo(1 / 7, 4);
    expect(JSON.stringify(ad['quality'])).toMatch(/synthetic channel the definition admits/);
    const ch = await compute({ metricKey: 'MET-021', period: Q, scopeKey: SCOPE, cohort: { severity: 'normal', channel: 'in_app' } });
    expect(ch).toMatchObject({ state: 'indeterminate', n: 2 });
  });
  it('MET-023: 8 material warnings (the engine\'s item verdict, else the level), 3 with an owned disposition, an action and an outcome → 0.375; each record names the missing part; a non-material one EXCLUDED', async () => {
    const r = await compute({ metricKey: 'MET-023', period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 8 }); expect(Number(r['value'])).toBe(0.375);
    const m = await byId(r);
    expect((m.get(W[2]!)!['detail'] as Row)['missing']).toEqual(['action']);
    expect((m.get(W[3]!)!['detail'] as Row)['closure']).toMatchObject({ outcome: { met: true, closure: true } });
    expect(m.get(W[16]!)).toBeUndefined();   // outside the corridor
    expect(m.get(W[7]!)).toMatchObject({ role: 'excluded', reason: expect.stringMatching(/not material \(the warning's level/) });
  });
  it('V1 warning precision (evaluate_warnings\' feedback): 3 useful of 5 judged; the contradictory one EXCLUDED', async () => {
    const r = await compute({ metricKey: 'V1-warning-precision', period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 5 }); expect(Number(r['value'])).toBe(0.6);
    expect((await byId(r)).get(W[4]!)).toMatchObject({ role: 'excluded', reason: expect.stringMatching(/contradictory feedback/) });
  });
});

describe('MCA6 · strategy, commitments, the attention queue', () => {
  it('MET-029: 2 approved initiatives + 2 live root obligations; only I1 reaches objective, capability, owner and measure', async () => {
    const r = await compute({ metricKey: 'MET-029', period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 4 }); expect(Number(r['value'])).toBe(0.25);
    expect((await byId(r)).get(ini2)!['detail']).toMatchObject({ missing: ['capability'] });
  });
  it('MET-030 at PORTFOLIO level: 7 items due, 5 closed (evidence, exception, supersession, two roots by their package\'s outcome); a portfolio cohort below the floor INDETERMINATE; the owner is never a grouping', async () => {
    const r = await compute({ metricKey: 'MET-030', period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 7 }); expect(Number(r['value'])).toBeCloseTo(5 / 7, 6);
    const m = await byId(r);
    expect((m.get(CI.c1a)!['detail'] as Row)['closed_by']).toBe('evidence');
    expect((m.get(CI.c3)!['detail'] as Row)['closed_by']).toBe('exception');
    expect((m.get(CI.c4)!['detail'] as Row)['closed_by']).toBe('supersession');
    expect((m.get(CI.c1)!['detail'] as Row)['closed_by']).toBe('outcome');
    const pf = await compute({ metricKey: 'MET-030', period: Q, cohort: { portfolio: ini1 } });
    expect(pf).toMatchObject({ state: 'indeterminate', n: 3 });
    await refused(compute({ metricKey: 'MET-030', period: Q, cohort: { owner: itemOwner } }), /^metric computation rejected \(person\)/, 403);
  });
  it('ES-40-008 commitment visibility: 2 of 7 items received or accepted by their owner within 2 days', async () => {
    const r = await compute({ metricKey: 'ES40-commitment-visibility', period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 7 }); expect(Number(r['value'])).toBeCloseTo(2 / 7, 6);
  });
  it('V1 understanding latency (executive.metrics\' time to understanding): 6 routed warning items acted on → p50 490 s; the routed commitment item without an act EXCLUDED; the scope ignored, said', async () => {
    const r = await compute({ metricKey: 'V1-understanding-latency', period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 6 }); expect(Number(r['value'])).toBe(490);
    expect((await recs(r)).filter((x) => x['role'] === 'excluded')).toHaveLength(1);
    expect(JSON.stringify(r['quality'])).toMatch(/ignores the scope/);
  });
  it('V1 attention saved (evaluate_attention_queue\'s precision): 3 true positives, 2 false alarms → 0.6; the rest excluded with their reasons', async () => {
    const r = await compute({ metricKey: 'V1-attention-saved', period: Q });
    expect(r).toMatchObject({ state: 'determinate', n: 5 }); expect(Number(r['value'])).toBe(0.6);
    const ex = (await recs(r)).filter((x) => x['role'] === 'excluded').map((x) => String(x['reason']));
    expect(ex).toEqual(expect.arrayContaining([expect.stringMatching(/not judged material on arrival \(below_threshold\)/), expect.stringMatching(/not disposed by the as-of/)]));
  });
});

describe('MCA7 · scenarios, runs, twins: MET-026, MET-027, MET-028', () => {
  it('MET-026: of 3 corridor sets one passes (distinct structures); identical structures and a structureless branch fail, each named', async () => {
    const r = await compute({ metricKey: 'MET-026', period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 3 }); expect(Number(r['value'])).toBeCloseTo(1 / 3, 6);
    const m = await byId(r);
    expect(m.get(SET.s1)!['role']).toBe('numerator');
    expect((m.get(SET.s2)!['detail'] as Row)['too_similar_pairs']).toHaveLength(1);
    expect((m.get(SET.s3)!['detail'] as Row)['structureless_branches']).toEqual([BR.b4]);
    expect(m.has(SET.s4)).toBe(false);
  });
  it('MET-027: 3 reproduced-or-not accepted runs (tolerance 0, digest equality), 1 never reproduced EXCLUDED, the invalidated run outside', async () => {
    const r = await compute({ metricKey: 'MET-027', period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 3, quality: { tolerance: 0, never_reproduced: 1 } }); expect(Number(r['value'])).toBeCloseTo(2 / 3, 6);
    expect((await byId(r)).has(RUN.r5)).toBe(false);
  });
  it('MET-028 at the as-of: of 3 contracted twins one is within all contracts (one stale, one missing an exposed key); a twin with no policy EXCLUDED; the out-of-boundary twin outside', async () => {
    const r = await compute({ metricKey: 'MET-028', period: Q, scopeKey: SCOPE });
    expect(r).toMatchObject({ state: 'determinate', n: 3 }); expect(Number(r['value'])).toBeCloseTo(1 / 3, 6);
    const m = await byId(r);
    expect((m.get(TW.t2)!['detail'] as Row)['failed']).toEqual(['freshness']);
    expect((m.get(TW.t4)!['detail'] as Row)['failed']).toEqual(['coverage']);
    expect(m.get(TW.t3)).toMatchObject({ role: 'excluded', reason: expect.stringMatching(/no freshness policy/) });
    expect(m.has(TW.t5)).toBe(false);
    expect(await replay(String(r['result_id']))).toMatchObject({ replay_verdict: 'reproduced' });
  });
});
