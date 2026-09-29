/**
 * CP-6 B36 (migration 0094 §S, part `strategy`) — THE SCORE AND THE STRATEGY GRAPH COMPLETED (F-P6-08 (f)(g)(h), F-P6-09 (a)–(d)) — on a
 * real database through the real routes (the PDP, the pipeline, the ports), the real subscription dispatch (BullMQ on the verification
 * Redis) and the real attention tick (AttentionTimerService.tickNow), the humans holding sessions of their own. Every figure is SYNTHETIC
 * (a NORDWERK-shaped scene the harness plants; the demonstration's data is the act's). The executive signing key is a pair generated here
 * and bound in the process (EYE_EXECUTIVE_SIGNING_KEY_DEMO) before the boot — the demonstration's is in .eye-local/env. Instants are the
 * DATABASE clock's (clock_timestamp) wherever a record is compared.
 *
 *   S0 · THE SCENE (g): the objective, its capability built by an initiative and resourced, its measure approved; the definition (window 2
 *        days, change_points 3) proposed by the executive and approved by the administrator; the first snapshot reads the FOUR NEW CLASSES —
 *        capability 100, quality 100 (the measure approved and fresh), execution and outcome MISSING (no commitment item, no outcome —
 *        declared); the input REGISTER filled with every component's OWNER; a definition naming an unknown kind refused (422).
 *   S1 · THE OWNER-CORRECTION ROUTE AND THE ANTI-GAMING MEASURE (f): an analyst, the administrator and a person holding nothing refused
 *        (ownership 403 / PDP 403), an agent by the gate, unknown component (404), a short reason (422); the measure's OWNER restates 91 →
 *        96 — the register shows it owner-stated with its history; the next current snapshot moves the dimension favourably (watch →
 *        healthy) and the change carries owner_edit_flag with the edit id (and the owner_edit gaming flag); owner_edit_analysis counts it
 *        against the owner; RECOVERY: a restatement followed by an UNFAVOURABLE change carries no flag.
 *   S2 · EXCEPTIONS AS RECORDED OBJECTS (g): requested by the lead — NO EFFECT until approved (the next snapshot still reads the component);
 *        the requester approving (403 separation), an analyst (403 PDP), unknown (404), a second request while pending (409), malformed
 *        (422); approved by the executive → the component excluded and the exception NAMED on the snapshot; a relaxed bound applied; an
 *        expired request refused (409); RECOVERY: a refused exception has no effect and its record stays.
 *   S3 · THE SIGNED ACCEPTANCE (h): the preview (digest, consequence, flags, exceptions); the executive accepts on the digest → the approval
 *        row and an Ed25519 SIGNATURE (kind health_snapshot) that VERIFIES against the harness's public key; a stale digest (409), an as_of
 *        replay (409), the same person again (409), an analyst (403), unknown (404), a short note (422); the key UNBOUND → the whole act
 *        refused (409) and NO approval recorded; RECOVERY: the key rebound, a second executive accepts. The contract read names the reader's
 *        context (none set: stated).
 *   S4 · GRAPHCHANGED ON STRATEGY CHANGES (a): a commitments subscription naming the three kinds; an alignment declared → one outbox row
 *        strategy.alignment_changed with the typed block, DELIVERED and APPLIED through the real dispatch; a measure observed →
 *        strategy.measure_changed; a capability's owner transferred → strategy.owner_changed with owner_from/to; a refused declaration and a
 *        repeated observation announce nothing.
 *   S5 · REVOCABLE AUTHORITY ACTS (b): the executive revokes the allocation → the gap view's initiative_resourced false AT ONCE; revokes the
 *        measure's approval → approved_now false, approval_state revoked, the measure gone from the health branch; the lead (403
 *        not_authority), again (409 revoked), unknown (404), a short reason (422), an agent (403); a LAPSED act (409 lapsed); RECOVERY: a
 *        new approval on the same digest (the revoked act is no duplicate) → in force again.
 *   S6 · THE DETECTIONS RAISED ON THE SCHEDULE (c): the attention agent registered and the policy published (class strategy.detection); a
 *        second measure with a 29-minute window observed a day ago → the TICK raises stale_measure ONCE and routes it as an attention item
 *        of class strategy.detection to the measure's owner (state open) — nobody read the page; a second tick raises no duplicate; the
 *        gamed_measure of S1's flagged edit, a lost_linkage (its measures alignment retired) and an owner_missing (the ghost suspended —
 *        planted, stated) raised and routed; the port outside the tick refused; RECOVERY: a fresh observation → the next tick raises nothing
 *        new for it.
 *   S7 · THE PLAN LINKS (d): absent in this deployment and STATED so; Part P's table planted by the superuser (stated) → the link read; dropped.
 *
 * EACH CASE LOGS ONE `B36 EVIDENCE` LINE with the six things V04-T-024/026 demand.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { createHash } from 'node:crypto';
import { uuidv7 } from 'uuidv7';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { SignatureService } from '../../src/executive/signatures/signature.service.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

process.env['EYE_SCHEDULER_ENABLED'] = 'true';
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b36s-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');
/** THE SIGNING KEY: an Ed25519 pair of this process, bound by reference before the boot (the product reads it at signing time only). */
const KEY_REF = 'EYE_EXECUTIVE_SIGNING_KEY_DEMO';
const PAIR = generateKeyPairSync('ed25519');
const PRIVATE_B64 = PAIR.privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64');
const PUBLIC_PEM = PAIR.publicKey.export({ type: 'spki', format: 'pem' }).toString();
process.env[KEY_REF] = PRIVATE_B64;

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let graph: GraphController; let exec: ExecutiveController;
let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService; let timer: AttentionTimerService;
let lead: AuthenticatedPrincipal; let executive: AuthenticatedPrincipal; let exec2: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
let roleless: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let ghost: AuthenticatedPrincipal;
let C1 = ''; let C2 = '';
let OBJ = ''; let OBJ2 = ''; let CAP = ''; let INI = ''; let RSC = ''; let MSR = ''; let MSR2 = ''; let STK = '';
let RES = ''; let MEASURE_ACT = ''; let RES_ACT = ''; let SET_ACT = ''; let MSR_DIGEST = '';
let V1 = ''; let S1: Row = {}; let S2: Row = {}; let S5: Row = {}; let EDIT1 = ''; let agentId = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const DAY = 86_400_000;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const obj = (v: unknown): Row => (v ?? {}) as Row;
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const sixEvidence = (caseName: string, e: { fault_trace: unknown; watermark: unknown; consumer_behaviour: unknown; operator_action: unknown; recovery: unknown; reconciliation: unknown }): void =>
  console.log(`B36 EVIDENCE ${caseName}: ${JSON.stringify(e)}`);
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { code?: string; message?: string };
  return { status: mapped.getStatus(), code: r.code ?? null, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number, code?: string) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  if (code !== undefined) expect(r.code, r.message).toBe(code);
  return r;
};
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 90_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 800)}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen()).slice(0, 400)}`);
    await sleep(300);
  }
}
const dbInstant = async (ago: string): Promise<string> => (await sql<{ t: Date }>`select clock_timestamp() - ${ago}::interval t`.execute(su)).rows[0]!.t.toISOString();
const dimOf = (snapshot: Row, key: string): Row => arr(obj(snapshot['result'])['dimensions']).find((d) => d['key'] === key) ?? {};
const compOf = (snapshot: Row, key: string): Row => arr(snapshot['components']).find((c) => c['key'] === key) ?? arr(obj(snapshot['result'])['components']).find((c) => c['key'] === key) ?? {};

/* ───────────── the planted claims (SYNTHETIC; the B32 graph harness's idiom) ───────────── */
async function plantClaim(label: string): Promise<string> {
  const id = uuidv7(); const now = new Date().toISOString();
  const payload: Row = { claim_kind: 'claim', subject: 'Regensburg assembly', predicate: 'b36_fixture', object_value: `${label} (B36 harness, SYNTHETIC)`, confidence: 0.9, synthetic: true };
  const header: CanonicalHeader = {
    object_id: id, object_type: 'CLM', tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: '1', lifecycle_state: 'active', owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture',
    source_object_ids: [], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'extracted', synthetic_state: false, confidence: null, uncertainty: null, evidence_refs: [], provenance_ref: null, method_ref: 'fixture-extraction@1.0.0',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1', ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
  };
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, event_time, observation_time, valid_from, valid_to, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, uncertainty, evidence_refs, provenance_ref, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state, freshness_state, schema_ref, ontology_ref, correction_of, supersedes, withdrawal_reason, audit_correlation_id, content_ref, payload, content_digest)
    values (${id}::uuid, 'CLM', ${T()}::uuid, ${D()}::uuid, 'DOMAIN', 1, 'active', 'CP-INT-01', 'agent:fixture', '[]'::jsonb, null, ${now}::timestamptz, null, null, ${now}::timestamptz, 'exact', 'trusted', 'extracted', false, null, null, '[]'::jsonb, null, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'internal', 'intelligence', null, null, null, null, null, null, null, 'CLM@v1', null, null, null, null, ${header.audit_correlation_id}::uuid, null, ${JSON.stringify(payload)}::jsonb, ${canonicalHeaderDigest(header, payload)})`.execute(su);
  return id;
}

/* ───────────── the routes (in process) ───────────── */
const G = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(as, action, type, id, 'graph');
const E = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(as, action, type, id, 'executive');
const declare = async (as: AuthenticatedPrincipal, objectType: string, title: string, restsOn: Row[]): Promise<string> =>
  ((await graph.declare(G(as, 'graph.strategy.declare', objectType, null), T(), D(), { payload: { objectType, title, statement: `${title} (B36 harness, SYNTHETIC)`, status: 'active', restsOn } })) as { strategy: { objectId: string } }).strategy.objectId;
const onClaim = (id: string): Row => ({ kind: 'claim', id, rationale: 'the declared object rests on this claim (B36 harness)' });
const align = (as: AuthenticatedPrincipal, payload: Row) => graph.declareAlignment(G(as, 'graph.alignment.declare', 'ALN', null), T(), D(), { payload }) as Promise<{ alignment: Row & { alignment_id: string; digest: string } }>;
const alignOk = async (as: AuthenticatedPrincipal, kind: string, from: string, to: string): Promise<string> => (await align(as, { kind, from, to, strength: 'strong', rationale: `the ${kind} alignment of the scene (B36 harness)` })).alignment.alignment_id;
const retire = (as: AuthenticatedPrincipal, id: string) => graph.retireAlignment(G(as, 'graph.alignment.retire', 'ALN', id), T(), D(), id, { payload: { reason: 'the alignment no longer stands (B36 harness)' } }) as Promise<{ alignment: Row }>;
const define = (as: AuthenticatedPrincipal, id: string, payload: Row) => graph.defineMeasure(G(as, 'graph.measure.define', 'MSR', id), T(), D(), id, { payload }) as Promise<{ measure: Row & { definition_digest: string; definition_version: number } }>;
const observe = (as: AuthenticatedPrincipal, id: string, payload: Row) => graph.observeMeasure(G(as, 'graph.measure.observe', 'MSR', id), T(), D(), id, { payload }) as Promise<{ observation: Row & { repeated: boolean; freshness: Row | null } }>;
const approveMeasure = (as: AuthenticatedPrincipal, id: string, payload: Row) => graph.approveMeasure(G(as, 'graph.strategy.authority.act', 'MSR', id), T(), D(), id, { payload }) as Promise<{ act: Row & { act_id: string } }>;
const act = (as: AuthenticatedPrincipal, subject: string, payload: Row) => graph.strategyAuthority(G(as, 'graph.strategy.authority.act', 'OBJ', subject), T(), D(), subject, { payload }) as Promise<{ act: Row & { act_id: string } }>;
const assignOwner = (as: AuthenticatedPrincipal, id: string, ownerPrincipalId: string) => graph.assignStrategyOwner(G(as, 'graph.strategy.owner.assign', 'OBJ', id), T(), D(), id, { payload: { ownerPrincipalId, reason: 'the object changes hands (B36 harness)' } }) as Promise<{ owner: Row }>;
const gaps = async (as: AuthenticatedPrincipal = executive) => ((await graph.alignmentGaps(G(as, 'graph.strategy.alignment.read', 'OBJ', null), T(), D(), { payload: {} })) as { gaps: { at: string; rows: Array<Row & { objective_id: string; capability_id: string | null; criteria: Array<{ criterion: string; met: boolean }>; objective_subject: { digest: string } }> } }).gaps;
const readDetections = async () => ((await graph.strategyDetections(G(executive, 'graph.strategy.alignment.read', 'OBJ', null), T(), D(), { payload: {} })) as { detections: { detections: Array<Row & { detection_key: string; state: string }> } }).detections;
const measures = async () => (await graph.listMeasures(G(executive, 'graph.strategy.alignment.read', 'MSR', null), T(), D(), { payload: {} })) as unknown as { measures: Array<Row & { measure_id: string; approved_now: boolean; approval_state: string; subject: { digest: string } }> };
const revoke = (as: AuthenticatedPrincipal, actId: string, reason = 'the authority no longer stands (B36 harness)') => graph.revokeAuthorityAct(G(as, 'graph.strategy.authority.revoke', 'ALN', actId), T(), D(), actId, { payload: { reason } }) as Promise<{ revocation: Row }>;
const raisedList = async (payload: Row = {}) => ((await graph.listRaisedDetections(G(executive, 'graph.strategy.alignment.read', 'OBJ', null), T(), D(), { payload: payload as never })) as { detections: Array<Row & { kind: string; subject_id: string; routed_item_id: string | null; routing: Row }> }).detections;
const planLinks = async (objectiveId?: string) => ((await graph.strategyPlanLinks(G(executive, 'graph.strategy.alignment.read', 'OBJ', null), T(), D(), { payload: objectiveId === undefined ? {} : { objectiveId } })) as { links: { available: boolean; reason?: string; initiatives: Row[] } }).links;
const measureDef = (objectiveId: string, over: Row = {}): Row => ({ objectiveId, unit: 'percent', direction: 'higher_better', targetValue: 95, targetDate: '2027-03-31', freshnessDays: 7, ...over });
const future = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const approveAll = (digest: string, over: Row = {}): Row => ({ subjectDigest: digest, decision: 'approve', rationale: 'approved by the executive for the plan (B36 harness)', expiresAt: future(180), ...over });
// the score
const propose = (as: AuthenticatedPrincipal, model: unknown, reason: string) => exec.proposeHealthDefinition(E(as, 'executive.health.definition.propose', 'HSD', null), T(), D(), { payload: { model, reason } as never }) as unknown as Promise<{ definition: Row }>;
const approveDef = (as: AuthenticatedPrincipal, id: string, note: string) => exec.approveHealthDefinition(E(as, 'executive.health.definition.approve', 'HSD', id), T(), D(), id, { payload: { note } }) as unknown as Promise<{ definition: Row }>;
const compute = (as: AuthenticatedPrincipal, at?: string) => exec.computeHealthScore(E(as, 'executive.health.compute', 'HSS', null), T(), D(), { payload: at === undefined ? {} : { at } }) as unknown as Promise<{ snapshot: Row }>;
const snapshot = (id: string) => exec.getHealthSnapshot(E(executive, 'executive.health.read', 'HSS', id), T(), D(), id) as unknown as Promise<{ snapshot: Row }>;
const contract = (as: AuthenticatedPrincipal = executive) => exec.listHealthInputs(E(as, 'executive.health.read', 'HSD', null), T(), D(), { payload: {} }) as unknown as Promise<{ contract: { definition_id: string | null; inputs: Array<Row & { component_key: string; owner_principal_id: string | null; owner_stated: boolean; edits: number; history: Row[] }>; owner_edits: Row; context: Row | null } }>;
const setInput = (as: AuthenticatedPrincipal, payload: Row) => exec.setHealthInput(E(as, 'executive.health.input.set', 'HSD', null), T(), D(), { payload }) as unknown as Promise<{ edit: Row }>;
const ownerEdits = () => exec.ownerEditAnalysis(E(executive, 'executive.health.read', 'HSD', null), T(), D(), { payload: {} }) as unknown as Promise<{ analysis: Row & { owners: Row[]; totals: Row } }>;
const requestException = (as: AuthenticatedPrincipal, payload: Row) => exec.requestHealthException(E(as, 'executive.health.exception.request', 'HSX', null), T(), D(), { payload }) as unknown as Promise<{ exception: Row & { exception_id: string } }>;
const decideException = (as: AuthenticatedPrincipal, id: string, decision: string, note: string) => exec.approveHealthException(E(as, 'executive.health.exception.approve', 'HSX', id), T(), D(), id, { payload: { decision, note } }) as unknown as Promise<{ exception: Row }>;
const listExceptions = () => exec.listHealthExceptions(E(executive, 'executive.health.read', 'HSX', null), T(), D(), { payload: {} }) as unknown as Promise<{ exceptions: Row[] }>;
const preview = (id: string, as: AuthenticatedPrincipal = executive) => exec.previewHealthSnapshotApproval(E(as, 'executive.health.read', 'HSS', id), T(), D(), id) as unknown as Promise<{ preview: Row & { result_digest: string; acceptable: boolean; approvals: Row[]; signatures: Row[] } }>;
const approveSnapshot = (as: AuthenticatedPrincipal, id: string, payload: Row) => exec.approveHealthSnapshot(E(as, 'executive.health.snapshot.approve', 'HSS', id), T(), D(), id, { payload }) as unknown as Promise<{ approval: Row & { signature: Row } }>;
const tick = async (day: number) => {
  const t = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2035, 0, day)) });
  expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
  return t;
};
const items = async (cls = 'strategy.detection') => (await sql<Row>`select item_id::text, subject_kind, subject_id::text, state, owner_principal_id::text, cause_event_type, title, details from executive.attention_items where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and signal_class = ${cls} order by created_at`.execute(su)).rows;
const deniedCount = async (action: string) => Number((await sql<{ n: string }>`select count(*)::text n from audit.audit_events where tenant_id = ${T()}::uuid and action = ${action} and outcome = 'denied'`.execute(su)).rows[0]!.n);

const BANDS = [{ key: 'healthy', min: 95 }, { key: 'watch', min: 70 }, { key: 'critical', min: 0 }];
/** THE MODEL (SYNTHETIC): one dimension over the objective; the measure, the four new classes; the window 2 days, change_points 3. */
const MODEL = (over: Row = {}): Row => ({
  min_coverage: 0.3, change_points: 3, min_confidence: 0.5, owner_edit_window_days: 2,
  dimensions: [{ key: 'delivery', label: 'Delivery performance', weight: 1, objective_ids: [OBJ], bands: BANDS }],
  components: [
    { key: 'on_time', label: 'On-time delivery rate (SYNTHETIC)', dimension: 'delivery', input_kind: 'measure', input_id: MSR, weight: 0.5, direction: 'higher_better', normalisation: { worst: 50, best: 100 }, stale_after_days: 7 },
    { key: 'capability_cov', label: 'Capability coverage', dimension: 'delivery', input_kind: 'capability', input_id: OBJ, weight: 0.2, direction: 'higher_better', normalisation: { worst: 0, best: 100 }, stale_after_days: 365 },
    { key: 'quality', label: 'Input quality', dimension: 'delivery', input_kind: 'quality', input_id: OBJ, weight: 0.2, direction: 'higher_better', normalisation: { worst: 0, best: 100 }, stale_after_days: 365 },
    { key: 'execution', label: 'Commitments delivered', dimension: 'delivery', input_kind: 'execution', input_id: OBJ, weight: 0.05, direction: 'higher_better', normalisation: { worst: 0, best: 100 }, stale_after_days: 365 },
    { key: 'outcomes', label: 'Outcomes met', dimension: 'delivery', input_kind: 'outcome', input_id: OBJ, weight: 0.05, direction: 'higher_better', normalisation: { worst: 0, best: 100 }, stale_after_days: 365 },
  ],
  ...over,
});

beforeAll(async () => {
  h = await Phase4Harness.boot();
  su = h.su;
  w = await bootDecisionWorld(h);
  graph = w.graph; exec = w.exec; executive = w.executive;
  scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService); timer = h.app.get(AttentionTimerService);
  lead = await h.humanWithSession(['strategy_owner'], 'b36s-lead');
  exec2 = await h.humanWithSession(['executive'], 'b36s-executive-2');
  dadmin = await h.humanWithSession(['domain_admin'], 'b36s-domain-admin');
  analyst = await h.humanWithSession(['domain_analyst'], 'b36s-analyst');
  roleless = await h.principalWith([], 'b36s-roleless');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b36s-tenant-admin', 'TENANT');
  ghost = await h.humanWithSession(['strategy_owner'], 'b36s-ghost');
  C1 = await plantClaim('the Regensburg line shipped 91% on time in Q3');
  C2 = await plantClaim('the second bearings supplier passed qualification');
  // the attention agent (the tick's host); its first scheduled tick waited for, then unscheduled — the ticks below are the harness's
  const r = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: executive.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } }) as unknown as { agent: { agentId: string } };
  agentId = r.agent.agentId;
  await sleep(1500);
  await scheduler.unscheduleAttentionTick(T(), D());
}, 600_000);

afterAll(async () => {
  try { await scheduler.unscheduleAttentionTick(T(), D()); } catch { /* none */ }
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('B36 strategy · the score and the Strategy Graph completed (0094 §S)', () => {
  it('S0 · THE SCENE (g): the four new score inputs read — capability and quality scored, execution and outcome declared missing; the register filled with owners; an unknown kind refused', async () => {
    OBJ = await declare(lead, 'OBJ', 'On-time delivery 95%', [onClaim(C1)]);
    OBJ2 = await declare(lead, 'OBJ', 'Customs clearance under 48 h', [onClaim(C2)]);
    CAP = await declare(lead, 'CAP', 'Regensburg assembly', [onClaim(C1)]);
    INI = await declare(lead, 'INI', 'Dual-sourcing initiative', [onClaim(C2)]);
    RSC = await declare(lead, 'RSC', 'Bearings procurement budget', [onClaim(C2)]);
    MSR = await declare(lead, 'MSR', 'On-time delivery rate', [onClaim(C1)]);
    MSR2 = await declare(lead, 'MSR', 'Customs clearance time', [onClaim(C2)]);
    STK = await declare(lead, 'STK', 'Regensburg line workforce', [onClaim(C2)]);
    await alignOk(lead, 'supports', OBJ, CAP);
    await alignOk(lead, 'builds', INI, CAP);
    RES = await alignOk(lead, 'resources', RSC, INI);
    const m = (await define(lead, MSR, measureDef(OBJ))).measure;
    MSR_DIGEST = m.definition_digest;
    await observe(analyst, MSR, { value: 91, observedAt: new Date(Date.now() - DAY).toISOString(), source: { kind: 'claim', id: C1 } });
    // the human authority: the objective set, the measure approved, the allocation approved — each on the digest read
    const g0 = await gaps();
    SET_ACT = (await act(executive, OBJ, { actKind: 'set_objective', ...approveAll(g0.rows.find((r) => r.objective_id === OBJ)!.objective_subject.digest) })).act.act_id;
    MEASURE_ACT = (await approveMeasure(executive, MSR, approveAll(MSR_DIGEST))).act.act_id;
    const resDigest = (await sql<{ digest: string }>`select digest from graph.alignments where alignment_id = ${RES}::uuid`.execute(su)).rows[0]!.digest;
    RES_ACT = (await act(executive, RES, { actKind: 'allocate_resource', ...approveAll(resDigest) })).act.act_id;
    // the definition: an unknown input kind refused by the validator; the window admitted as a model key; two people
    await refused(propose(executive, MODEL({ components: [{ ...(MODEL()['components'] as Row[])[0]!, input_kind: 'velocity' }] }), 'an unknown kind'), /^health definition rejected: component on_time input_kind is one of indicator, measure, risk, opportunity, capability, execution, outcome, quality/, 422, 'EYE-REQ-001');
    await refused(propose(executive, MODEL({ owner_edit_window_days: 0 }), 'a window of zero days'), /^health definition rejected: owner_edit_window_days is a number of days in \(0, 366\]/, 422, 'EYE-REQ-001');
    const p = (await propose(executive, MODEL(), 'the delivery model with the four new classes (B36 harness, SYNTHETIC)')).definition;
    V1 = String(p['definition_id']);
    const a = (await approveDef(dadmin, V1, 'reviewed with the supply chain lead (B36 harness)')).definition;
    expect(a).toMatchObject({ state: 'active', approved_by: dadmin.principalId });
    expect((await sql<{ w: string }>`select owner_edit_window_days::text w from executive.health_score_definitions where definition_id = ${V1}::uuid`.execute(su)).rows[0]!.w).toBe('2');
    // THE FIRST SNAPSHOT: the four new classes
    S1 = (await compute(analyst)).snapshot;
    expect(S1).toMatchObject({ kind: 'current', status: 'partial' });
    expect(compOf(S1, 'on_time')).toMatchObject({ state: 'included', value: 91, normalised: 82, owner_stated: false });
    expect(compOf(S1, 'capability_cov')).toMatchObject({ state: 'included', value: 100, input_kind: 'capability' });
    expect(compOf(S1, 'quality')).toMatchObject({ state: 'included', value: 100, input_kind: 'quality' });
    expect(compOf(S1, 'execution')).toMatchObject({ state: 'missing', input_kind: 'execution' });
    expect(String(compOf(S1, 'execution')['reason'])).toMatch(/^no execution input .* in the contract at the instant/);
    expect(compOf(S1, 'outcomes')).toMatchObject({ state: 'missing', input_kind: 'outcome' });
    expect(dimOf(S1, 'delivery')).toMatchObject({ value: 90, band: 'watch', status: 'partial', coverage: 0.9 });
    expect(obj(S1['result'])['exceptions']).toEqual([]);
    // THE REGISTER: every component with its OWNER derived from the input's own object (the measure's MSR owner; the objective's owner for the rest)
    const c = (await contract()).contract;
    expect(c.definition_id).toBe(V1);
    expect(c.inputs.map((i) => i.component_key).sort()).toEqual(['capability_cov', 'execution', 'on_time', 'outcomes', 'quality']);
    expect(c.inputs.find((i) => i.component_key === 'on_time')).toMatchObject({ owner_principal_id: lead.principalId, owner_stated: false, edits: 0, value: 91 });
    expect(String(c.inputs.find((i) => i.component_key === 'on_time')!['owner_basis'])).toMatch(/^the owner of MSR "On-time delivery rate"/);
    expect(c.inputs.find((i) => i.component_key === 'capability_cov')).toMatchObject({ owner_principal_id: lead.principalId, value: 100 });
    expect(c.context, 'no context set — stated as null; the page words it').toBeNull();
    sixEvidence('S0', { fault_trace: { unknown_kind: 422, zero_window: 422 }, watermark: { snapshot: S1['snapshot_id'], definition: V1, window_days: 2 },
      consumer_behaviour: 'capability and quality scored from the graph, execution and outcome declared missing (no item, no outcome)', operator_action: 'the executive proposed; the administrator approved; an analyst computed',
      recovery: 'n/a', reconciliation: { register: c.inputs.length, owners: c.inputs.every((i) => i.owner_principal_id === lead.principalId) } });
  }, 300_000);

  it('S1 · THE OWNER-CORRECTION ROUTE AND THE ANTI-GAMING MEASURE (f): only the input\'s owner restates; the edit ledgered; a favourable change flagged with the edit; counted per owner; an unfavourable one unflagged', async () => {
    const body = { component_key: 'on_time', value: 96, reason: 'the Q3 on-time figure restated after the late shipments were reclassified (B36 harness)' };
    // REFUSALS: not the owner (the port), the PDP, the gate, the absences, the request
    await refused(setInput(analyst, body), /^health input rejected \(ownership\): component on_time is restated by the owner of its input only \(the owner of MSR "On-time delivery rate"\)/, 403, 'EYE-AUT-001');
    await refused(setInput(dadmin, body), /^health input rejected \(ownership\)/, 403, 'EYE-AUT-001');
    expect((await refusal(setInput(roleless, body))).status).toBe(403);
    const before = await deniedCount('executive.health.input.set');
    await refused(setInput({ ...lead, kind: 'agent' } as AuthenticatedPrincipal, body), /human gate: executive\.health\.input\.set requires a named human principal/, 403, 'EYE-WFL-002');
    expect(await deniedCount('executive.health.input.set')).toBe(before + 1);
    await refused(setInput(lead, { ...body, component_key: 'no_such' }), /^health input rejected \(unknown_component\): the active definition \(version 1\) has no component no_such/, 404, 'EYE-STA-001');
    await refused(setInput(lead, { ...body, reason: 'short' }), /payload\.reason says why/, 422, 'EYE-REQ-001');
    await refused(setInput(lead, { ...body, value: 'many' }), /payload\.value is the restated reading/, 422, 'EYE-REQ-001');
    expect((await sql<{ n: number }>`select count(*)::int n from executive.health_input_edits`.execute(su)).rows[0]!.n, 'no refused edit was ledgered').toBe(0);
    // THE OWNER restates
    const e = (await setInput(lead, body)).edit;
    EDIT1 = String(e['edit_id']);
    expect(e).toMatchObject({ component_key: 'on_time', input_kind: 'measure', owner: lead.principalId, from_value: 91, to_value: 96, edits: 1, window_days: 2 });
    const c = (await contract()).contract;
    const onTime = c.inputs.find((i) => i.component_key === 'on_time')!;
    expect(onTime).toMatchObject({ owner_stated: true, edits: 1, value: 96, last_edit_id: EDIT1 });
    expect(onTime.history[0]).toMatchObject({ edit_id: EDIT1, editor: lead.principalId, from_value: 91, to_value: 96 });
    // THE NEXT SNAPSHOT reads the statement; the dimension moves favourably (watch → healthy); the change carries the flag and the edit id
    S2 = (await compute(analyst)).snapshot;
    expect(compOf(S2, 'on_time')).toMatchObject({ value: 96, normalised: 92, owner_stated: true, owner: lead.principalId, owner_edit_id: EDIT1 });
    expect(String(obj(compOf(S2, 'on_time')['lineage'])['basis'])).toMatch(/restated by its owner/);
    expect(dimOf(S2, 'delivery')).toMatchObject({ value: 95.56, band: 'healthy' });
    const changes = arr(S2['changes']);
    const dim = changes.find((x) => x['subject'] === 'dimension:delivery')!;
    expect(dim).toMatchObject({ direction: 'favourable', from_band: 'watch', to_band: 'healthy', owner_edit_flag: true, owner_edit_ids: [EDIT1] });
    expect(arr(dim['triggers'])).toEqual(expect.arrayContaining(['band_crossing', 'move']));
    const flag = arr(dim['gaming_flags']).find((f) => f['flag'] === 'owner_edit')!;
    expect(flag).toMatchObject({ component: 'on_time', edit_id: EDIT1, owner: lead.principalId, from_value: 91, to_value: 96, window_days: 2 });
    expect(changes.find((x) => x['subject'] === 'aggregate')).toMatchObject({ direction: 'favourable', owner_edit_flag: true, owner_edit_ids: [EDIT1] });
    // COUNTED per owner
    const an = (await ownerEdits()).analysis;
    expect(an).toMatchObject({ definition_id: V1, window_days: 2, totals: { edits: 1, flagged_edits: 1 } });
    expect(an.owners[0]).toMatchObject({ owner: lead.principalId, edits: 1, flagged_edits: 1, components: ['on_time'] });
    // RECOVERY: a restatement followed by an UNFAVOURABLE change — no flag
    const e2 = (await setInput(lead, { component_key: 'on_time', value: 80, reason: 'the reclassification reversed: the late shipments count again (B36 harness)' })).edit;
    const S3 = (await compute(analyst)).snapshot;
    expect(compOf(S3, 'on_time')).toMatchObject({ value: 80, owner_edit_id: String(e2['edit_id']) });
    const down = arr(S3['changes']).find((x) => x['subject'] === 'dimension:delivery')!;
    expect(down).toMatchObject({ direction: 'unfavourable', owner_edit_flag: false, owner_edit_ids: [] });
    expect((await ownerEdits()).analysis['totals']).toEqual({ edits: 2, flagged_edits: 1 });
    // the record itself: the ledger is append-only
    expect((await refusal(sql`update executive.health_input_edits set to_value = 99 where edit_id = ${EDIT1}::uuid`.execute(su))).message).toMatch(/append-only/);
    sixEvidence('S1', { fault_trace: { ownership: 403, pdp: 403, gate: 403, unknown: 404, request: 422, flagged_change: dim['change_id'] }, watermark: { edit: EDIT1, snapshot: S2['snapshot_id'] },
      consumer_behaviour: 'the statement read from its as-of; the favourable change flagged with the edit id; the unfavourable one not', operator_action: 'the measure owner restated 91 → 96, then 96 → 80',
      recovery: { unflagged: down['change_id'] }, reconciliation: an['totals'] });
  }, 300_000);

  it('S2 · EXCEPTIONS AS RECORDED OBJECTS (g): requested by one, no effect until ANOTHER approves; excluded and named on the snapshot; a bound relaxed; expired and refused ones without effect', async () => {
    const req = { component_key: 'execution', kind: 'exclude', reason: 'no commitment item rests on the objective yet — the execution class is not measurable this quarter (B36 harness)', expires_at: future(30) };
    await refused(requestException(lead, { ...req, kind: 'skip' }), /payload\.kind is one of exclude, relax_bound/, 422, 'EYE-REQ-001');
    await refused(requestException(lead, { ...req, kind: 'relax_bound' }), /relax_bound names payload\.relaxed_stale_after_days/, 422, 'EYE-REQ-001');
    await refused(requestException(lead, { ...req, component_key: 'no_such' }), /^health exception rejected \(unknown_component\)/, 404, 'EYE-STA-001');
    // the EXECUTIVE requests this one (so the port's separation rule, not the PDP, is what refuses their own approval below)
    const x = (await requestException(executive, req)).exception;
    expect(x).toMatchObject({ state: 'requested', kind: 'exclude', component_key: 'execution', requested_by: executive.principalId });
    await refused(requestException(lead, req), /^health exception rejected \(pending\): a exclude exception for component execution awaits a decision/, 409, 'EYE-STA-002');
    // NO EFFECT until approved: the next snapshot still reads the component and names no exception
    const s = (await compute(analyst)).snapshot;
    expect(compOf(s, 'execution')).toMatchObject({ state: 'missing' });
    expect(obj(s['result'])['exceptions']).toEqual([]);
    // the decision: the requester (403 separation), an analyst (403 PDP), unknown (404), malformed (422), then the executive approves
    await refused(decideException(executive, x.exception_id, 'approve', 'approving my own request'), /^health exception rejected \(separation\): the requester does not decide their own exception/, 403, 'EYE-AUT-001');
    expect((await refusal(decideException(analyst, x.exception_id, 'approve', 'an analyst approving'))).status).toBe(403);
    expect((await refusal(decideException(lead, x.exception_id, 'approve', 'a strategy owner approving'))).status, 'the PDP: not the executive\'s authority').toBe(403);
    await refused(decideException(executive, uuidv7(), 'approve', 'an id naming nothing'), /^health exception rejected \(unknown_exception\)/, 404, 'EYE-STA-001');
    await refused(decideException(executive, x.exception_id, 'maybe', 'a decision that is not one'), /payload\.decision is approve or refuse/, 422, 'EYE-REQ-001');
    const ok = (await decideException(exec2, x.exception_id, 'approve', 'agreed: execution is excepted until the first commitment item (B36 harness)')).exception;
    expect(ok).toMatchObject({ state: 'approved', approved_by: exec2.principalId, in_force_now: true });
    await refused(decideException(dadmin, x.exception_id, 'refuse', 'deciding a decided exception'), /^health exception rejected \(state\): exception .* is approved; only a requested exception is decided/, 409, 'EYE-STA-002');
    // a bound RELAXED on the measure (30 days instead of 7), approved
    const rb = (await requestException(lead, { component_key: 'on_time', kind: 'relax_bound', relaxed_stale_after_days: 30, reason: 'the ERP feed is monthly this quarter — a 30-day window (B36 harness)', expires_at: future(30) })).exception;
    await decideException(executive, rb.exception_id, 'approve', 'agreed for the quarter (B36 harness)');
    // THE EFFECT: the component excluded from the composition and the exceptions NAMED; the relaxed bound applied
    S5 = (await compute(analyst)).snapshot;
    expect(compOf(S5, 'execution')['key'], 'the excluded component is absent from the composition').toBeUndefined();
    expect(arr(obj(S5['result'])['components']).map((c) => c['key']).sort()).toEqual(['capability_cov', 'on_time', 'outcomes', 'quality']);
    expect(compOf(S5, 'on_time')).toMatchObject({ stale_after_days: 30 });
    const named = arr(obj(S5['result'])['exceptions']);
    expect(named.map((e) => `${String(e['component_key'])}:${String(e['kind'])}`).sort()).toEqual(['execution:exclude', 'on_time:relax_bound']);
    // the excluded component's weight is simply not covered (the coverage is the INCLUDED weight of the declared 1, never renormalised — the exception is named, not hidden)
    expect(dimOf(S5, 'delivery')['coverage']).toBe(0.9);
    expect(arr(dimOf(S5, 'delivery')['components']).map(String).sort()).toEqual(['capability_cov', 'on_time', 'outcomes', 'quality']);
    // an EXPIRED request is not decided; a REFUSED one has no effect and stays
    const soon = (await requestException(lead, { component_key: 'quality', kind: 'exclude', reason: 'a request that will lapse before it is decided (B36 harness)', expires_at: new Date(Date.now() + 2500).toISOString() })).exception;
    await sleep(3000);
    await refused(decideException(executive, soon.exception_id, 'approve', 'deciding a lapsed request'), /^health exception rejected \(expired\)/, 409, 'EYE-STA-002');
    const rf = (await requestException(lead, { component_key: 'quality', kind: 'exclude', reason: 'quality is fine; a request the executive will refuse (B36 harness)', expires_at: future(10) })).exception;
    const refusedX = (await decideException(executive, rf.exception_id, 'refuse', 'the quality class stays: no reason to except it (B36 harness)')).exception;
    expect(refusedX).toMatchObject({ state: 'refused', refused_by: executive.principalId });
    const s6 = (await compute(analyst)).snapshot;
    expect(compOf(s6, 'quality')).toMatchObject({ state: 'included' });
    expect((await listExceptions()).exceptions.map((e) => e['state']).sort()).toEqual(['approved', 'approved', 'refused', 'requested']);
    expect((await refusal(sql`update executive.health_exceptions set state = 'requested' where exception_id = ${x.exception_id}::uuid`.execute(su))).message).toMatch(/decided once and never rewritten/);
    sixEvidence('S2', { fault_trace: { kind: 422, unknown: 404, pending: 409, separation: 403, pdp: 403, decided: 409, expired: 409 }, watermark: { snapshot: S5['snapshot_id'], exceptions: named.length },
      consumer_behaviour: 'no effect until approved; then the component excluded and the exception named; the relaxed bound applied', operator_action: 'the executive requested one, the lead the others; a second executive approved the first, the executive approved one and refused one',
      recovery: { refused: refusedX['exception_id'], quality_still_included: true }, reconciliation: { coverage: dimOf(S5, 'delivery')['coverage'] } });
  }, 300_000);

  it('S3 · THE SIGNED ACCEPTANCE (h): the preview, the executive accepts on the digest — recorded and signed (Ed25519, verified); stale, replay, duplicate, PDP, unknown, note refused; the key unbound refuses the whole act', async () => {
    const id = String(S5['snapshot_id']);
    const pv = (await preview(id)).preview;
    expect(pv).toMatchObject({ snapshot_id: id, acceptable: true, result_digest: S5['result_digest'], approvals: [], signatures: [] });
    expect(String(pv['consequence'])).toMatch(/authorizes no action/);
    expect(arr(pv['exceptions_in_force'])).toHaveLength(2);
    // the refusals before any acceptance
    await refused(approveSnapshot(executive, id, { result_digest: 'a'.repeat(64), note: 'a digest that is not this snapshot\'s' }), /^health approval rejected \(stale_digest\)/, 409, 'EYE-STA-002');
    await refused(approveSnapshot(executive, id, { result_digest: pv.result_digest, note: 'short' }), /payload\.note records the acceptance/, 422, 'EYE-REQ-001');
    await refused(approveSnapshot(executive, uuidv7(), { result_digest: pv.result_digest, note: 'an id naming no snapshot' }), /^health approval rejected \(unknown_snapshot\)/, 404, 'EYE-STA-001');
    expect((await refusal(approveSnapshot(analyst, id, { result_digest: pv.result_digest, note: 'an analyst accepting the score' }))).status).toBe(403);
    expect((await refusal(approveSnapshot(dadmin, id, { result_digest: pv.result_digest, note: 'an administrator accepting the score' }))).status).toBe(403);
    // an AS_OF replay is not accepted
    const replay = (await compute(analyst, String(S1['at']))).snapshot;
    expect(replay['kind']).toBe('as_of');
    await refused(approveSnapshot(executive, String(replay['snapshot_id']), { result_digest: String(replay['result_digest']), note: 'accepting a temporal replay' }), /^health approval rejected \(state\): snapshot .* is an as_of replay/, 409, 'EYE-STA-002');
    // THE KEY UNBOUND: the whole act refused; nothing recorded (the port's row rolled back with the signature's refusal)
    const bound = process.env[KEY_REF]!;
    process.env[KEY_REF] = '';
    await refused(approveSnapshot(executive, id, { result_digest: pv.result_digest, note: 'accepting with no signing key bound' }), /^signature rejected \(unbound\): this deployment binds no executive signing key \(EYE_EXECUTIVE_SIGNING_KEY_DEMO\)/, 409, 'EYE-STA-002');
    expect((await sql<{ n: number }>`select count(*)::int n from executive.health_snapshot_approvals where snapshot_id = ${id}::uuid`.execute(su)).rows[0]!.n, 'no unsigned acceptance').toBe(0);
    process.env[KEY_REF] = bound;
    // THE ACCEPTANCE, signed and VERIFIED against the harness's public key
    const a = (await approveSnapshot(executive, id, { result_digest: pv.result_digest, note: 'accepted as the basis for the Q4 review (B36 harness)' })).approval;
    expect(a).toMatchObject({ snapshot_id: id, result_digest: pv.result_digest, approved_by: executive.principalId, authorizes_action: false });
    expect(a.signature).toMatchObject({ subject_kind: 'health_snapshot', subject_id: id, subject_version: 1, subject_digest: pv.result_digest, signer: executive.principalId });
    expect(String(a.signature['key_id'])).toMatch(/^ed25519:[0-9a-f]{16}$/);
    const row = (await sql<Row>`select key_id, signature, subject_digest, bound_action from executive.signatures where subject_kind = 'health_snapshot' and subject_id = ${id}::uuid`.execute(su)).rows[0]!;
    expect(row['bound_action']).toBe('executive.health.snapshot.approve');
    expect(new SignatureService().verify(row as never, PUBLIC_PEM), 'the signature verifies against the public key').toBe(true);
    expect(new SignatureService().verify({ ...row, subject_digest: 'b'.repeat(64) } as never, PUBLIC_PEM), 'another digest does not').toBe(false);
    await refused(approveSnapshot(executive, id, { result_digest: pv.result_digest, note: 'accepting the same snapshot twice' }), /^health approval rejected \(duplicate\)/, 409, 'EYE-STA-002');
    // RECOVERY: a second executive accepts (a distinct row and signature); the preview shows both
    await approveSnapshot(exec2, id, { result_digest: pv.result_digest, note: 'accepted for the board pack (B36 harness)' });
    const after = (await preview(id)).preview;
    expect(after.approvals.map((x) => x['approved_by']).sort()).toEqual([executive.principalId, exec2.principalId].sort());
    expect(after.signatures).toHaveLength(2);
    expect((await refusal(sql`delete from executive.health_snapshot_approvals where snapshot_id = ${id}::uuid`.execute(su))).message).toMatch(/append-only/);
    sixEvidence('S3', { fault_trace: { stale: 409, note: 422, unknown: 404, pdp: 403, replay: 409, unbound: 409, duplicate: 409 }, watermark: { snapshot: id, digest: pv.result_digest, key_id: row['key_id'] },
      consumer_behaviour: 'the acceptance recorded on the digest previewed and signed beyond the audit chain; verified', operator_action: 'the executive accepted; a second executive accepted',
      recovery: { rebound_key: true, approvals: after.approvals.length }, reconciliation: { signatures: after.signatures.length } });
  }, 300_000);

  it('S4 · GRAPHCHANGED ON STRATEGY CHANGES (a): an alignment declared, a measure observed, a capability re-owned — each announced with its typed block and delivered to a subscribed consumer through the real dispatch; a refusal and a repeat announce nothing', async () => {
    await graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
      { payload: { consumerKind: 'commitments', ownerPrincipalId: w.owner.principalId, backlog: 'leave', filter: { change_kinds: ['strategy.alignment_changed', 'strategy.measure_changed', 'strategy.owner_changed'] } } as never });
    const outbox = async (kind: string, after: Date) => (await sql<Row>`select id::text, payload from objects.object_outbox where event_type = 'GraphChanged' and payload -> 'change' ->> 'kind' = ${kind} and created_at >= ${after} order by created_at`.execute(su)).rows;
    const mark = async (): Promise<Date> => (await sql<{ t: Date }>`select clock_timestamp() t`.execute(su)).rows[0]!.t;
    // an ALIGNMENT declared
    let t0 = await mark();
    const AFF = await alignOk(lead, 'affects', STK, OBJ);
    const ev = await waitFor('the strategy.alignment_changed row', () => outbox('strategy.alignment_changed', t0), (r) => r.length === 1);
    const p = ev[0]!['payload'] as Row;
    expect(p).toMatchObject({ change: { kind: 'strategy.alignment_changed' }, objects: { objectives: [OBJ], walked: false }, cause: { action: 'graph.alignment.declare', actor: lead.principalId, target_type: 'ALN', target_id: AFF },
      strategy: { subject_kind: 'alignment', subject_id: AFF, subject_type: 'affects', change: 'alignment.declared', objective_ids: [OBJ] } });
    expect(arr(p['subscriptions']).map((s) => s['consumer_kind'])).toContain('commitments');
    const del = await waitFor('its commitments delivery applied', async () => (await sql<Row>`select state, items from graph.subscription_deliveries where event_id = ${String(ev[0]!['id'])}::uuid and consumer_kind = 'commitments'`.execute(su)).rows[0] ?? {}, (d) => d['state'] === 'applied', 120_000);
    expect(del['state']).toBe('applied');
    // a MEASURE observed; a repeated identical observation announces nothing
    t0 = await mark();
    const o = (await observe(analyst, MSR, { value: 92, observedAt: new Date(Date.now() - 3_600_000).toISOString(), source: { kind: 'claim', id: C1 } })).observation;
    expect(o.repeated).toBe(false);
    const m = await waitFor('the strategy.measure_changed row', () => outbox('strategy.measure_changed', t0), (r) => r.length === 1);
    expect(m[0]!['payload']).toMatchObject({ strategy: { subject_kind: 'measure', subject_id: MSR, change: 'measure.observed' }, cause: { action: 'graph.measure.observe' } });
    const again = (await observe(analyst, MSR, { value: 92, observedAt: o['observed_at'] as string, source: { kind: 'claim', id: C1 } })).observation;
    expect(again.repeated).toBe(true);
    await sleep(800);
    expect(await outbox('strategy.measure_changed', t0), 'a repeated observation announces nothing').toHaveLength(1);
    // a CAPABILITY's owner transferred (not an objective: strategy.owner_changed, never objective.changed)
    t0 = await mark();
    await assignOwner(dadmin, CAP, ghost.principalId);
    const ow = await waitFor('the strategy.owner_changed row', () => outbox('strategy.owner_changed', t0), (r) => r.length === 1);
    expect(ow[0]!['payload']).toMatchObject({ strategy: { subject_kind: 'strategy_object', subject_id: CAP, subject_type: 'CAP', change: 'owner.assigned', owner_from: lead.principalId, owner_to: ghost.principalId } });
    expect(await outbox('objective.changed', t0)).toHaveLength(0);
    // a REFUSED declaration announces nothing
    t0 = await mark();
    await refused(align(analyst, { kind: 'affects', from: STK, to: OBJ2, strength: 'weak', rationale: 'an analyst declaring an alignment (B36 harness)' }), /no qualifying role binding/, 403);
    await sleep(500);
    expect(await outbox('strategy.alignment_changed', t0)).toHaveLength(0);
    sixEvidence('S4', { fault_trace: { refused_alignment_announced: 0, repeated_observation_announced: 0 }, watermark: { alignment: AFF, event: ev[0]!['id'], delivery: del['state'] },
      consumer_behaviour: 'the commitments consumer received the alignment change through the real dispatch and applied it (it selects nothing for an alignment)', operator_action: 'the lead declared; an analyst observed; the administrator re-owned the capability',
      recovery: 'n/a', reconciliation: { kinds: ['strategy.alignment_changed', 'strategy.measure_changed', 'strategy.owner_changed'] } });
  }, 300_000);

  it('S5 · REVOCABLE AUTHORITY ACTS (b): the allocation revoked — the gap view sees it at once; the measure\'s approval revoked — gone from the health branch; the refusals; a lapsed act; re-approved', async () => {
    const before = await gaps();
    expect(before.rows.find((r) => r.objective_id === OBJ && r.capability_id === CAP)!.criteria.find((c) => c.criterion === 'initiative_resourced')!.met).toBe(true);
    // the refusals: not the issuer nor an administrator; unknown; a short reason; an agent
    await refused(revoke(lead, RES_ACT), /^strategy revocation rejected \(not_authority\): act .* was recorded by .*; its issuer or a domain administrator revokes it/, 403, 'EYE-AUT-001');
    await refused(revoke(executive, uuidv7()), /^strategy revocation rejected \(unknown_act\)/, 404, 'EYE-STA-001');
    await refused(revoke(executive, RES_ACT, 'short'), /reason is 8 to 2000 characters/, 422, 'EYE-REQ-001');
    await refused(revoke({ ...executive, kind: 'agent' } as AuthenticatedPrincipal, RES_ACT), /human gate: graph\.strategy\.authority\.revoke/, 403, 'EYE-WFL-002');
    // THE ISSUER revokes the allocation: the gap view sees it at once
    const rv = (await revoke(executive, RES_ACT)).revocation;
    expect(rv).toMatchObject({ act_id: RES_ACT, act_kind: 'allocate_resource', subject_kind: 'alignment', revoked_by: executive.principalId, object_type: 'ALN' });
    const after = await gaps();
    const row = after.rows.find((r) => r.objective_id === OBJ && r.capability_id === CAP)!;
    expect(row.criteria.find((c) => c.criterion === 'initiative_resourced')!.met).toBe(false);
    expect(row['gap_reasons']).toContain('initiative_unresourced');
    await refused(revoke(executive, RES_ACT), /^strategy revocation rejected \(revoked\)/, 409, 'EYE-STA-002');
    // the domain administrator revokes the MEASURE's approval: approved_now false, the state revoked, the health branch no longer lists it
    const mv = (await revoke(dadmin, MEASURE_ACT, 'the measure definition is under review after the restatements (B36 harness)')).revocation;
    expect(mv).toMatchObject({ act_kind: 'approve_measure', subject_id: MSR, object_type: 'MSR' });
    const ms = (await measures()).measures.find((x) => x.measure_id === MSR)!;
    expect(ms).toMatchObject({ approved_now: false, approval_state: 'revoked' });
    expect((await sql<Row>`select input_id::text from graph.health_inputs(${T()}::uuid, ${D()}::uuid, clock_timestamp()) where input_id = ${MSR}::uuid`.execute(su)).rows).toHaveLength(0);
    expect((await sql<{ event: string }>`select event from graph.measure_events where measure_id = ${MSR}::uuid order by occurred_at desc limit 1`.execute(su)).rows[0]!.event).toBe('measure.approval_revoked');
    // the record itself: a revocation is set once and nothing else changes
    expect((await refusal(sql`update graph.strategy_authority_acts set rationale = 'rewritten' where act_id = ${RES_ACT}::uuid`.execute(su))).message).toMatch(/immutable but for its one revocation/);
    expect((await refusal(sql`update graph.strategy_authority_acts set revoked_at = clock_timestamp(), revoked_by = ${lead.principalId}::uuid, revocation_reason = 'again' where act_id = ${RES_ACT}::uuid`.execute(su))).message).toMatch(/immutable but for its one revocation/);
    // a LAPSED act is not revoked (an act on the second objective expiring in 2 s)
    const g2 = after.rows.find((r) => r.objective_id === OBJ2)!;
    const lapsing = (await act(exec2, OBJ2, { actKind: 'set_objective', ...approveAll(g2.objective_subject.digest, { expiresAt: new Date(Date.now() + 2000).toISOString() }) })).act.act_id;
    await sleep(2600);
    await refused(revoke(exec2, lapsing), /^strategy revocation rejected \(lapsed\): act .* expired at .*; a lapsed act is not revoked/, 409, 'EYE-STA-002');
    // RECOVERY: a new approval on the same digest — the revoked act is no duplicate — in force again
    const re = (await approveMeasure(executive, MSR, approveAll(MSR_DIGEST))).act;
    expect(re.act_id).not.toBe(MEASURE_ACT);
    expect((await measures()).measures.find((x) => x.measure_id === MSR)).toMatchObject({ approved_now: true, approval_state: 'approved' });
    sixEvidence('S5', { fault_trace: { not_authority: 403, unknown: 404, reason: 422, gate: 403, revoked: 409, lapsed: 409 }, watermark: { allocation_act: RES_ACT, measure_act: MEASURE_ACT, revoked_at: rv['revoked_at'] },
      consumer_behaviour: 'the gap view and the health branch judge the act out of force from the revocation instant', operator_action: 'the executive revoked the allocation; the administrator revoked the measure approval; re-approved',
      recovery: { new_act: re.act_id }, reconciliation: { initiative_resourced: false, measure_approved_again: true } });
  }, 300_000);

  it('S6 · THE DETECTIONS RAISED ON THE SCHEDULE (c): the tick raises stale_measure once and routes it as an attention item to the owner — nobody read the page; gamed_measure, lost_linkage and owner_missing likewise; the port refused outside the tick; a fresh observation raises nothing new', async () => {
    // the policy with the class (the executive publishes it — the B34 attention idiom)
    const rules = { classes: {
      'strategy.detection': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['strategy_owner'], ack_within_minutes: 1440, escalate_to_roles: ['executive'], max_escalations: 1 },
      'health.change': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['executive'], ack_within_minutes: 60 },
    } };
    await exec.publishAttentionPolicy(E(executive, 'executive.attention.policy.publish', 'ATP', null), T(), D(), { payload: { rules, reason: 'the strategy detections routed to the strategy owners (B36 harness)' } as never });
    // MSR2: a 29-minute window, observed a day ago, approved — STALE
    const m2 = (await define(lead, MSR2, measureDef(OBJ2, { freshnessDays: 0.02 }))).measure;
    await observe(analyst, MSR2, { value: 52, observedAt: new Date(Date.now() - DAY).toISOString(), source: { kind: 'claim', id: C2 } });
    await approveMeasure(executive, MSR2, approveAll(m2.definition_digest));
    // the port outside the tick: refused (no bound action carries executive.attention.tick)
    expect((await refusal(sql`select graph.raise_strategy_detections(${T()}::uuid, ${D()}::uuid, ${executive.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su))).message).toMatch(/executive\.attention\.tick|authority|action/i);
    expect(await items()).toHaveLength(0);
    // THE TICK
    const t1 = await tick(1);
    const step = (t1 as unknown as { steps?: Record<string, Row> }).steps?.['strategy-detections'] ?? null;
    let raised = await raisedList();
    const stale = raised.find((d) => d['kind'] === 'stale_measure' && d['subject_id'] === MSR2)!;
    expect(stale, JSON.stringify({ step, raised })).toBeDefined();
    expect(stale).toMatchObject({ subject_type: 'MSR', measure_id: MSR2, owner_principal_id: lead.principalId });
    expect(String(stale['detail'])).toMatch(/^measure "Customs clearance time" was last observed .* day\(s\) before/);
    // ROUTED as an attention item of class strategy.detection to the measure's owner, under the policy — without anyone reading the page
    const its = await items();
    const item = its.find((i) => i['item_id'] === stale['routed_item_id'])!;
    expect(item).toMatchObject({ subject_kind: 'strategy_object', subject_id: MSR2, state: 'open', owner_principal_id: lead.principalId, cause_event_type: 'StrategyDetectionRaised' });
    expect(obj(item['details'])).toMatchObject({ detection_id: stale['detection_id'], kind: 'stale_measure', measure_id: MSR2 });
    expect(String(item['title'])).toMatch(/^stale measure: Customs clearance time/);
    expect(obj(stale['routing'])).toMatchObject({ state: 'open', outcome: 'material', route_roles: ['strategy_owner'] });
    // the GAMED measure of S1's flagged edit (subject MSR, cause the edit), routed to the measured objective's owner
    const gamed = raised.find((d) => d['kind'] === 'gamed_measure')!;
    expect(gamed).toMatchObject({ subject_id: MSR, measure_id: MSR, cause_key: EDIT1, owner_principal_id: lead.principalId });
    expect(String(gamed['detail'])).toMatch(/restated it 91 → 96 .* inside the 2-day window before a favourable change of dimension:delivery/);
    // ONCE per cause: a second tick raises nothing new
    await tick(2);
    expect((await raisedList()).length).toBe(raised.length);
    expect((await items()).length).toBe(its.length);
    // LOST LINKAGE: MSR2's measures alignment retired → the approved measure measures no active objective
    const ma = (await sql<{ alignment_id: string }>`select alignment_id::text from graph.alignments where kind = 'measures' and from_id = ${MSR2}::uuid and state = 'active'`.execute(su)).rows[0]!.alignment_id;
    await retire(lead, ma);
    // OWNER MISSING: the ghost (the capability's owner since S4) SUSPENDED — planted by the superuser (stated)
    await sql`update identity.principals set status = 'suspended' where id = ${ghost.principalId}::uuid`.execute(su);
    await tick(3);
    raised = await raisedList();
    expect(raised.find((d) => d['kind'] === 'lost_linkage' && d['subject_id'] === MSR2)).toMatchObject({ cause_key: 'v1', owner_principal_id: lead.principalId });
    const om = raised.find((d) => d['kind'] === 'owner_missing' && d['subject_id'] === CAP)!;
    expect(om).toMatchObject({ subject_type: 'CAP', cause_key: ghost.principalId });
    expect(om['owner_principal_id']).not.toBe(ghost.principalId);
    const read = await readDetections();
    expect(read.detections.find((d) => d.detection_key === `stale_measure:${MSR2}`)?.state, 'the 0089 read still shows it as of this read').toBe('open');
    // RECOVERY: a fresh observation on MSR2 — the next tick raises no new stale_measure for it
    await observe(analyst, MSR2, { value: 44, observedAt: new Date().toISOString(), source: { kind: 'claim', id: C2 } });
    const n = (await raisedList({ kind: 'stale_measure' })).length;
    await tick(4);
    expect((await raisedList({ kind: 'stale_measure' })).length).toBe(n);
    expect((await refusal(sql`delete from graph.strategy_detections where detection_id = ${stale['detection_id']}::uuid`.execute(su))).message).toMatch(/append-only/);
    sixEvidence('S6', { fault_trace: { outside_tick: 'refused', duplicate_after_second_tick: 0 }, watermark: { detection: stale['detection_id'], item: stale['routed_item_id'], ticks: [1, 2, 3, 4] },
      consumer_behaviour: 'the schedule raised and routed the detection under the active policy; the page was never read', operator_action: 'the tick (the attention agent); a fresh observation by an analyst',
      recovery: { stale_measure_after_fresh: n }, reconciliation: { kinds: [...new Set(raised.map((d) => d['kind']))].sort() } });
  }, 300_000);

  it('S7 · THE PLAN LINKS (d): Part P\'s tables declared (B36 integration) — available, empty for an unplanned objective; a planted plan and initiative (stated) → linked; the other objective still empty', async () => {
    // Since the integration of Part P (0094 §P), executive.plans / executive.initiatives exist: the read is AVAILABLE and empty for an objective in no plan.
    const none = await planLinks(OBJ);
    expect(none).toMatchObject({ available: true, initiatives: [] });
    // A plan and an initiative PLANTED by the superuser as Part P's ports leave them (stated; the ports' own harness is phase6-planning-b36): the
    // initiative IS the INI strategy object (one object, two views) and names OBJ as its objective.
    const plan = uuidv7(); const digest = createHash('sha256').update(plan).digest('hex');
    await sql`insert into executive.plans (plan_id, scope, tenant_id, domain_id, title, statement, horizon, objective_ids, owner_principal_id, budget_currency, budget_total, budget_authority, digest, declared_by, correlation_id)
      values (${plan}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'Dual sourcing 2027 (SYNTHETIC plan link)', 'the plan the link read finds', '12m', ARRAY[${OBJ}::uuid], ${lead.principalId}::uuid, 'EUR', 1200000, 900000, ${digest}, ${lead.principalId}::uuid, ${uuidv7()}::uuid)`.execute(su);
    await sql`insert into executive.initiatives (initiative_id, scope, tenant_id, domain_id, plan_id, objective_id, title, sponsor_principal_id, owner_principal_id, proposed_by, proposed_by_kind, digest, correlation_id)
      values (${INI}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${plan}::uuid, ${OBJ}::uuid, 'Dual-sourcing initiative (SYNTHETIC plan link)', ${executive.principalId}::uuid, ${lead.principalId}::uuid, ${lead.principalId}::uuid, 'human', ${createHash('sha256').update(INI).digest('hex')}, ${uuidv7()}::uuid)`.execute(su);
    const linked = await planLinks(OBJ);
    expect(linked.available).toBe(true);
    expect(linked.initiatives.map((i) => i['initiative_id'])).toEqual([INI]);
    expect((await planLinks(OBJ2)).initiatives).toEqual([]);
    sixEvidence('S7', { fault_trace: 'none', watermark: { objective: OBJ }, consumer_behaviour: 'the link read on Part P\'s tables (available since the B36 integration); an unplanned objective reads empty', operator_action: 'none', recovery: 'n/a', reconciliation: { planted: true } });
  }, 120_000);
});
