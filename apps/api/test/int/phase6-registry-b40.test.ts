/**
 * CP-6 B40 §RG (migration 0123_b40_x_rg) — THE SOURCE REGISTRY, STEWARDSHIP, THE RIGHTS LIFECYCLE AND REVOCATION IMPACT (F-P1-01), on a real
 * database with real Redis (EYE_REDIS_PORT), the product's own routes (in process), the real outbox publisher and subscription dispatcher
 * (the B28 idiom: the scheduler enabled at module top, the source-health subscription registered) and an ISOLATED vault:
 *
 *   RG1 · DISCOVERY (JRN-02, V00-T-032, V01-T-009): an analyst proposes a candidate (replayed by its request id; a duplicate refused); the
 *         prefilled SRC@v4 draft and what it lacks; the PROMOTION registers the draft SRC@v4 contract and promotes the candidate in ONE
 *         transaction (a v3 contract refused with nothing written); a decline by the proposer; the PDP (an agent, a decision owner refused).
 *   RG2 · EVALUATION AND APPROVAL (D5, DP-09-006, PR-09-001/-002/-003, CAP-OB-02): an UNEVALUATED v4 approval refused with nothing written; the
 *         registrar may not evaluate (separation of duties), an agent never; a failed contract test cannot recommend approval; a "revise"
 *         blocks approval; the collection manager evaluates and approves (registrar ≠ approver kept); a v1–v3 contract keeps its path (no
 *         evaluation); a superseding version's evaluation records the change preview.
 *   RG3 · THE CUSTOMER APPROVAL (D13), STEWARDSHIP (L1-C01), SOURCE INCIDENTS (PER-11), ECONOMICS against the run meter (PR-09-002).
 *   RG4 · THE RIGHTS LIFECYCLE (L1-C01, R-09, FEX-02): the preview; narrowing; the new feed's withdrawal — "nothing rests on it yet", its
 *         schedule, the declared DELETION OBLIGATION opening a B9 retention action (waiting for the retention authority, never executed); the
 *         refusals (stale, evidence, an analyst, an agent, a second withdrawal).
 *   RG5 · DESIGN D4 (the owner's word) on the fixture source S, whose evidence products rest on: the withdrawal (every version, the suspension,
 *         the schedule, the incident, the owners' attention items, SourceHealthChanged cause rights → the markers set with cause `rights`);
 *         the affected use REFUSED with NO business effect on the REAL option, gate, publication and export paths; the UNAFFECTED scope still
 *         usable (another source's evidence; the same paths); READING as it was (D9); from CURRENT state (no tick); history intact.
 *   RG6 · BOTH RIGHTS SOURCES, and RECOVERY: an in-force terms record does not lift the contract withdrawal; the restoration (with evidence)
 *         does — the versions back, the suspended version resumed, the schedule back, the markers cleared, the incident resolved; a terms
 *         withdrawal is refused though the contract is confirmed, and a contract restoration does not lift it — a new terms version does.
 *   RG7 · THE v1–v3 ROUTE re-pointed (set_rights_state): a withdrawal through it is the lifecycle's; it cannot lift one; no version of a
 *         withdrawn source is approved; CROSS-TENANT / foreign scope reads nothing.
 *   RG8 · THE SHAPE: the ledgers FORCE RLS with SELECT only, append-only; the ports definer with their grants; §0's stub replaced whole.
 *
 * Every row here is SYNTHETIC fixture data (personas named after the act's: A. Hoffmann — analyst; M. Dvořák — collection manager; F. Aydın —
 * data steward; W. Zielińska — customer sponsor; H. Bergmann — retention authority; P. Novák — retention steward). THREE CLAIMS: this harness
 * is CONSTRUCTION evidence; the act is demonstrated operation; real acceptance (B111, then H3/R2) is never claimed. The §RG refusal nouns are
 * NOT mapped centrally yet (the integrator maps them): their class, SQLSTATE and the status their class takes under the convention are asserted.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { CollectionOrchestrator } from '../../src/observation/acquisition/orchestrator.service.js';
import { SubscriptionDispatcherService } from '../../src/graph/subscriptions/subscription-dispatcher.service.js';
import type { RegistryB40Controller } from '../../src/observation/registry-b40/registry-b40.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { EvidenceB82Controller } from '../../src/observation/evidence-b82/evidence-b82.controller.js';
import type { GraphController } from '../../src/graph/graph.controller.js';
import type { RetentionController } from '../../src/retention/retention.controller.js';
import type { PublishingController } from '../../src/executive/publishing/publishing.controller.js';
import { draftContractFromCandidate, sourceKeyOf } from '../../src/observation/registry-b40/draft.js';
import { validateSourceContract } from '../../src/observation/sources/source-contract.js';
import { Phase4Harness, syntheticEgress, uploadContract } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';
import { srcV4Contract } from './phase6-b40-fixtures.js';

// The B6 rule: the scheduler (the outbox publisher's routing, the subscription worker) is enabled BEFORE the boot, at module top.
process.env['EYE_SCHEDULER_ENABLED'] = 'true';
process.env['EYE_CONNECTOR_PER_SOURCE_CONCURRENCY'] = '1';
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b40-rg-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');

type Row = Record<string, unknown>;
let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let rg: RegistryB40Controller; let obs: ObservationController; let ev: EvidenceB82Controller; let graph: GraphController; let retention: RetentionController; let pubs: PublishingController;
let scheduler: SchedulerService; let dispatcher: SubscriptionDispatcherService;
let hoffmann: AuthenticatedPrincipal; let analyst2: AuthenticatedPrincipal; let dvorak: AuthenticatedPrincipal; let aydin: AuthenticatedPrincipal; let zielinska: AuthenticatedPrincipal;
let novak: AuthenticatedPrincipal; let bergmann: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let drafter: AuthenticatedPrincipal; let collector: AuthenticatedPrincipal;
let adminApprover: AuthenticatedPrincipal;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const S = () => h.fx.sourceId;
const one = async (q: { execute: (db: never) => Promise<{ rows: unknown[] }> }) => ((await q.execute(h.su as never)).rows[0] ?? {}) as Row;
const rows = async (q: { execute: (db: never) => Promise<{ rows: unknown[] }> }) => (await q.execute(h.su as never)).rows as Row[];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** The status a class-form refusal takes — through the CENTRAL mapper (observation-errors.ts, the B40 rows; B40 integration: the harness's
 *  local copy of the convention is removed). The SQLSTATE is any the mapper considers: the B40 rows read the text. */
const classStatus = (message: string): number | null =>
  /^[a-z][a-z _-]* rejected \(/.test(message) ? asObservationRefusal(Object.assign(new Error(message), { code: '22023' }), 'harness')?.getStatus() ?? null : null;
/** A refusal: the route's own status, the central mapping's, or the class convention's (an unmapped §RG noun); the RAW message; the SQLSTATE. */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string; code: string | null; sqlstate: string | null }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof HttpException) { const r = e.getResponse() as { message?: string; code?: string }; return { status: e.getStatus(), message: String(r.message ?? ''), code: r.code ?? null, sqlstate: null }; }
  const message = e instanceof Error ? e.message : String(e);
  const mapped = asObservationRefusal(e, 'harness');
  const sqlstate = (e as { code?: string }).code ?? null;
  return { status: classStatus(message) ?? mapped?.getStatus() ?? null, message, code: null, sqlstate };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };

/* ───────────── the routes (in process) ───────────── */
const R = (as: AuthenticatedPrincipal, action: string, id: string | null = null, purpose = 'observation') => h.req(as, action, 'SRC', id, purpose);
const candidates = (as: AuthenticatedPrincipal) => rg.candidates(R(as, 'observation.registry.read'), T(), D()) as Promise<{ candidates: Row[] }>;
const propose = (as: AuthenticatedPrincipal, payload: Row) => rg.propose(R(as, 'observation.source.discover'), T(), D(), { payload }) as Promise<{ candidate: Row }>;
const decline = (as: AuthenticatedPrincipal, id: string, reason: string) => rg.decline(R(as, 'observation.source.discover', id), T(), D(), id, { payload: { reason } }) as Promise<{ candidate: Row }>;
const draft = (as: AuthenticatedPrincipal, id: string, kind = 'upload') => rg.draft(R(as, 'observation.registry.read', id), T(), D(), id, { payload: { kind } }) as Promise<{ draft: { contract: Row; missing: string[]; state: string } }>;
const promote = (as: AuthenticatedPrincipal, id: string, contract: Row) => rg.promote(R(as, 'observation.source.register', id), T(), D(), id, { payload: { contract } }) as Promise<{ source: { sourceId: string; contractVersion: number }; candidate: Row }>;
const record = (as: AuthenticatedPrincipal, src: string) => rg.record(R(as, 'observation.registry.read', src), T(), D(), src) as Promise<{ registry: Row & { versions: Row[]; rights_changes: Row[]; incidents: Row[]; economics: Row; markers: Row[] } }>;
const evaluate = (as: AuthenticatedPrincipal, src: string, payload: Row) => rg.evaluate(R(as, 'observation.source.evaluate', src), T(), D(), src, { payload }) as Promise<{ evaluation: Row }>;
const rights = (as: AuthenticatedPrincipal, src: string, payload: Row) => rg.changeRights(R(as, 'observation.source.change_rights', src), T(), D(), src, { payload }) as Promise<{ change: Row & { affected: Row[]; impact: Row; attention_items: Row[] } }>;
const impact = (as: AuthenticatedPrincipal, src: string) => rg.impact(R(as, 'observation.rights.impact.read', src, 'decision'), T(), D(), src) as Promise<{ impact: Row & { products: Row[]; claims: Row[]; owners: Row[]; markers: Row[]; forward: Row } }>;
const preview = (as: AuthenticatedPrincipal, src: string, change: Row) => rg.preview(R(as, 'observation.source.change_impact.read', src), T(), D(), src, { payload: { change } }) as Promise<{ preview: Row }>;
const customer = (as: AuthenticatedPrincipal, src: string, payload: Row) => rg.customerApproval(R(as, 'observation.source.customer_approve', src), T(), D(), src, { payload }) as Promise<{ approval: Row }>;
const steward = (as: AuthenticatedPrincipal, src: string, payload: Row) => rg.stewardship(R(as, 'observation.source.stewardship', src), T(), D(), src, { payload }) as Promise<{ stewardship: Row }>;
const openIncident = (as: AuthenticatedPrincipal, src: string, payload: Row) => rg.openIncident(R(as, 'observation.source.incident', src), T(), D(), src, { payload }) as Promise<{ incident: Row }>;
const resolveIncident = (as: AuthenticatedPrincipal, id: string, resolution: string) => rg.resolveIncident(R(as, 'observation.source.incident', id), T(), D(), id, { payload: { resolution } }) as Promise<{ incident: Row }>;
const approveSrc = (as: AuthenticatedPrincipal, src: string, v: number, decision: 'approve' | 'reject' = 'approve') =>
  obs.approveSource(R(as, 'observation.source.approve', src), T(), D(), src, { payload: { contractVersion: v, decision, reason: 'B40 §RG harness (SYNTHETIC)' } });
const transition = (as: AuthenticatedPrincipal, src: string, v: number, target: string) =>
  obs.transitionSource(R(as, 'observation.source.transition', src), T(), D(), src, { payload: { contractVersion: v, target, reason: `B40 §RG harness: ${target}` } });
const setRightsRoute = (as: AuthenticatedPrincipal, src: string, v: number, rightsState: string) =>
  obs.setRights(R(as, 'observation.source.rights', src), T(), D(), src, { payload: { contractVersion: v, rightsState, evidence: 'B40 §RG harness: the v1–v3 rights route (SYNTHETIC)' } });
const register = (as: AuthenticatedPrincipal, contract: Row, sourceId?: string) =>
  obs.registerSource(R(as, 'observation.source.register', sourceId ?? null), T(), D(), { payload: { contract, ...(sourceId === undefined ? {} : { sourceId }) } }) as Promise<{ source: { sourceId: string; contractVersion: number } }>;
const download = (as: AuthenticatedPrincipal, evdId: string) => obs.downloadEvidence(h.req(as, 'observation.evidence.retrieve', 'EVD', evdId, 'observation'), T(), D(), evdId) as Promise<{ download: { contentDigest: string; integrity: string } }>;
const declareTerms = (as: AuthenticatedPrincipal, payload: Row) => ev.declareRights(h.req(as, 'observation.rights.declare', 'SRC', String(payload['sourceId']), 'observation'), T(), D(), { payload }) as Promise<{ terms: Row }>;
const withdrawTerms = (as: AuthenticatedPrincipal, termsId: string, payload: Row) => ev.withdrawRights(h.req(as, 'observation.rights.withdraw', 'RTT', termsId, 'observation'), T(), D(), termsId, { payload }) as Promise<{ terms: Row }>;
const usable = (type: string, id: string, version: number, use: string) => sql`select objects.assert_usable(${type}, ${id}::uuid, ${version}::int, ${use})`.execute(h.su);
const gate = (as: AuthenticatedPrincipal, pkg: string, v: number, act: string, payload: Row = {}) =>
  w.decisions.gateAct(h.req(as, `decision.gate.${act}`, 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), act, { payload }) as Promise<{ gate: Row }>;
const infoDigest = async (pkg: string, v: number) =>
  String(((await w.decisions.gateStatus(h.req(w.executive, 'decision.read', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v))) as { gate: Row }).gate['information_package_digest']);
/* retention (B9/B11) */
const openAction = (as: AuthenticatedPrincipal, payload: Row) => retention.openAction(h.req(as, 'retention.action.open', 'RTA', null, 'retention'), T(), D(), { payload }) as Promise<{ action: { actionId: string } }>;
const resolveScope = (as: AuthenticatedPrincipal, id: string) => retention.resolveScope(h.req(as, 'retention.action.resolve', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ scope: Row }>;
const approveAction = (as: AuthenticatedPrincipal, id: string, digest: string) => retention.approve(h.req(as, 'retention.action.approve', 'RTA', id, 'retention'), T(), D(), id, { payload: { scopeDigest: digest, rationale: 'the scope as resolved (B40 §RG harness)' } }) as Promise<{ approval: { approvalId: string } }>;
const executeAction = (as: AuthenticatedPrincipal, id: string) => retention.execute(h.req(as, 'retention.action.execute', 'RTA', id, 'retention'), T(), D(), id) as Promise<{ execution: Row }>;
/* publication (B36) */
const P = (as: AuthenticatedPrincipal, action: string, id: string | null = null) => h.req(as, action, 'PUB', id, 'decision');
const draftPub = (as: AuthenticatedPrincipal, payload: Row) => pubs.draft(P(as, 'executive.publication.draft'), T(), D(), { payload }) as unknown as Promise<{ publication: Row }>;
const approvePub = (as: AuthenticatedPrincipal, id: string, v: number, digest: string) => pubs.approve(P(as, 'executive.publication.approve', id), T(), D(), id, String(v), { payload: { digest } }) as unknown as Promise<{ approval: Row }>;
const dpkDigest = async (pkg: string, v: number) => String((await one(sql`select content_digest d from objects.canonical_objects where object_type = 'DPK' and object_id = ${pkg}::uuid and object_version = ${v}`))['d']);
const pubDraft = (pkg: string, v: number, digest: string, title: string): Row => ({ title, sourceKind: 'report', sourceId: pkg, sourceVersion: v, sourceDigest: digest,
  audience: { roles: ['board_member'], recipients: [w.owner.principalId] }, classification: 'internal', channels: ['in_app'], format: 'html', accessibility: { plain_language: true, alt_text_present: true }, template: 'board-pack@1', external: null });

/* ───────────── the subscription (B28's machinery) ───────────── */
async function waitFor<X>(what: string, probe: () => Promise<X>, ok: (x: X) => boolean, ms = 90_000): Promise<X> {
  const until = Date.now() + ms;
  for (;;) {
    const last = await probe();
    if (ok(last)) return last;
    if (Date.now() > until) throw new Error(`${what} did not happen within ${ms} ms; last: ${JSON.stringify(last).slice(0, 1200)}; dispatcher: ${JSON.stringify(dispatcher.lastFailureSeen())}`);
    await sleep(300);
  }
}
const settle = async (ms = 90_000): Promise<void> => {
  const until = Date.now() + ms;
  for (;;) {
    const q = await scheduler.subscriptionQueueCountsForTests(T(), D());
    const pending = Number((await one(sql`select count(*)::int n from objects.object_outbox where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and status = 'pending'`))['n']);
    if (q.active === 0 && q.waiting === 0 && q.delayed === 0 && pending === 0) return;
    if (Date.now() > until) throw new Error(`subscription queue did not settle: ${JSON.stringify(q)}; pending outbox rows ${pending}`);
    await sleep(300);
  }
};
const healthEvents = async (src: string, since: Date) => rows(sql`select id::text, payload, status from objects.object_outbox where event_type = 'SourceHealthChanged' and tenant_id = ${T()}::uuid
  and payload ->> 'source_id' = ${src} and created_at >= ${since} order by created_at`);
const healthApplied = (eventId: string) => waitFor(`the source-health delivery of ${eventId} applied`,
  () => rows(sql`select consumer_kind, state, items_applied from graph.subscription_deliveries where event_id = ${eventId}::uuid`),
  (rs) => rs.some((d) => d['consumer_kind'] === 'source-health' && d['state'] === 'applied'));
const mark = async (): Promise<Date> => (await one(sql`select clock_timestamp() t`))['t'] as Date;
const activeMarkers = (src: string) => rows(sql`select subject_kind, subject_id::text, health_state, cause from observation.source_impact_markers where source_id = ${src}::uuid and state = 'active' order by subject_kind, subject_id`);

/** A claim on evidence as the extraction admits it (the B28 idiom): the canonical row and its lineage — an agent's, so its owner is not a person. */
async function plantClaim(evidence: { id: string; version: number }, label: string): Promise<string> {
  const id = uuidv7(); const now = new Date().toISOString();
  const evidenceDigest = String((await one(sql`select payload ->> 'content_digest' d from objects.canonical_objects where object_id = ${evidence.id}::uuid and object_version = ${evidence.version}`))['d']);
  const payload: Row = { claim_kind: 'claim', subject: 'Bab el-Mandeb corridor', predicate: 'transits', object_value: `${label} (B40 §RG harness, SYNTHETIC)`, confidence: 0.9, review: { state: 'approved', reason: 'fixture', decider: null } };
  const header: CanonicalHeader = {
    object_id: id, object_type: 'CLM', tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: '1', lifecycle_state: 'active', owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture',
    source_object_ids: [evidence.id], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'extracted', synthetic_state: true, confidence: 0.9 as unknown as CanonicalHeader['confidence'], uncertainty: null, evidence_refs: [`EVD:${evidence.id}@${evidence.version}`], provenance_ref: null, method_ref: 'fixture-extraction@1.0.0',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1', ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
  };
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, observation_time, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, evidence_refs, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, schema_ref, audit_correlation_id, payload, content_digest)
    values (${id}::uuid, 'CLM', ${T()}::uuid, ${D()}::uuid, 'DOMAIN', 1, 'active', 'CP-INT-01', 'agent:fixture', ${JSON.stringify(header.source_object_ids)}::jsonb, ${now}::timestamptz, ${now}::timestamptz, 'exact', 'trusted', 'extracted', true, '0.9'::jsonb,
            ${JSON.stringify(header.evidence_refs)}::jsonb, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, 'internal', 'intelligence', 'CLM@v1', ${header.audit_correlation_id}::uuid, ${JSON.stringify(payload)}::jsonb, ${canonicalHeaderDigest(header, payload)})`.execute(h.su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${id}::uuid, 1, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'CLM', ${uuidv7()}::uuid, ${uuidv7()}::uuid, null, 'replay', ${evidence.id}::uuid, ${evidenceDigest}, 0, 4, 0.9, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  return id;
}

/** A TENANT-bound customer sponsor who is also the domain's collection manager — the separation probe (bindings written before the session). */
async function sponsorManager(label: string): Promise<AuthenticatedPrincipal> {
  const p = await h.principalWith(['customer_sponsor'], label, 'TENANT');
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${p.principalId}::uuid, 'collection_manager', 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(h.su);
  return h.openSession({ ...p, bindings: [...p.bindings, { roleCode: 'collection_manager', scope: 'DOMAIN', tenantId: T(), domainId: D() }] });
}

/* ───────────── what the cases leave one another ───────────── */
let candidateId = ''; let V = ''; let claimS = ''; let claimU = ''; let asuOnClaim = '';
let proposedP: { pkg: string; v: number; digest: string } = { pkg: '', v: 0, digest: '' };
let withdrawalS: Row = {};
const feedPurposes = ['corridor monitoring', 'internal briefings'];
const v4Feed = (key: string, over: { version?: number; supersedes?: number | null; purposes?: string[] } = {}) => {
  const c = srcV4Contract({ sourceKey: key, name: 'Red Sea shipping notices (SYNTHETIC)', kind: 'upload', mediaTypes: ['text/csv'], version: over.version, supersedes: over.supersedes ?? null });
  (c['authority_and_rights'] as Row)['purposes'] = over.purposes ?? feedPurposes;
  return c;
};
const evaluation = (v: number, over: Row = {}): Row => ({
  contractVersion: v, authority: 'The publisher is the regional maritime notice service (SYNTHETIC) — observational, not authoritative.',
  rightsEvidence: 'The terms page permits internal monitoring use; captured 2026-10-20 (SYNTHETIC).', coverageFit: 'Covers the Red Sea and the Gulf of Aden — the declared universe v1.',
  cost: 'no fee; one poll per hour', risks: ['notices may lag the events by hours'], contractTests: [{ name: 'schema parses', outcome: 'pass' }, { name: 'replay set admitted', outcome: 'pass' }],
  recommendation: 'approve', reason: 'Authority, rights evidence and coverage fit stand; no failed contract test.', ...over,
});

beforeAll(async () => {
  h = await Phase4Harness.boot();
  const { RegistryB40Controller: RgC } = await import('../../src/observation/registry-b40/registry-b40.controller.js');
  const { ObservationController: Oc } = await import('../../src/observation/observation.controller.js');
  const { EvidenceB82Controller: Ec } = await import('../../src/observation/evidence-b82/evidence-b82.controller.js');
  const { GraphController: Gc } = await import('../../src/graph/graph.controller.js');
  const { RetentionController: Rc } = await import('../../src/retention/retention.controller.js');
  const { PublishingController: Pc } = await import('../../src/executive/publishing/publishing.controller.js');
  rg = h.app.get(RgC); obs = h.app.get(Oc); ev = h.app.get(Ec); graph = h.app.get(Gc); retention = h.app.get(Rc); pubs = h.app.get(Pc);
  scheduler = h.app.get(SchedulerService); dispatcher = h.app.get(SubscriptionDispatcherService);
  // a collection a restored schedule may run reads the synthetic publisher (no network)
  h.app.get(CollectionOrchestrator).useEgressForTests(syntheticEgress().egress);
  hoffmann = await h.humanWithSession(['domain_analyst'], 'b40rg-a-hoffmann');
  analyst2 = await h.humanWithSession(['domain_analyst'], 'b40rg-analyst-2');
  dvorak = await h.humanWithSession(['collection_manager'], 'b40rg-m-dvorak');
  aydin = await h.humanWithSession(['data_steward'], 'b40rg-f-aydin');
  zielinska = await h.humanWithSession(['customer_sponsor'], 'b40rg-w-zielinska', 'TENANT');
  novak = await h.humanWithSession(['retention_steward'], 'b40rg-p-novak');
  bergmann = await h.humanWithSession(['retention_authority'], 'b40rg-h-bergmann', 'TENANT');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b40rg-tenant-admin', 'TENANT');
  drafter = await h.humanWithSession(['executive_operator'], 'b40rg-operator');
  adminApprover = await sponsorManager('b40rg-sponsor-manager');
  collector = await h.principalWith(['collection_agent'], 'b40rg-collector');
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  claimS = await plantClaim(w.evd, 'transits fell (on the fixture source S)');
  claimU = await plantClaim(w.records.inv, 'an invoice line (on the upload source U)');
  asuOnClaim = ((await graph.declare(h.req(w.twinOwner, 'graph.strategy.declare', 'ASU', null, 'graph'), T(), D(),
    { payload: { objectType: 'ASU', title: 'Corridor transits recover by Q1', statement: 'rests on the extracted transit claim (B40 §RG harness)', restsOn: [{ kind: 'claim', id: claimS, rationale: 'the assumption is the extracted claim' }] } })) as { strategy: { objectId: string } }).strategy.objectId;
  // THE PACKAGE proposed BEFORE any withdrawal: its reroute option cites S's evidence (w.evd) — the gate and publication paths below
  proposedP = await c.proposed();
  // THE SUBSCRIPTION: source-health, registered by the tenant administrator with the backlog left
  const sub = await graph.registerSubscription(h.req(tenantAdmin, 'graph.subscription.register', 'SUB', null, 'platform.administration'), T(), D(),
    { payload: { consumerKind: 'source-health', ownerPrincipalId: w.owner.principalId, backlog: 'leave' } as never }) as { served: { workerRunning: boolean } };
  expect(sub.served.workerRunning).toBe(true);
  await settle();
}, 600_000);

afterAll(async () => {
  try { await scheduler.unschedule(T(), D(), h.fx.sourceId); } catch { /* nothing scheduled */ }
  try { await scheduler.abandonSubscriptionWorkerForTests(T(), D()); await scheduler.obliterateSubscriptionsForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

describe('RG1 · DISCOVERY — discover → rights → contract (JRN-02)', () => {
  it('an analyst proposes a candidate (how found, publisher, terms, purposes, assessment); the request id replays it; another act under it is refused (duplicate)', async () => {
    const requestId = uuidv7();
    const payload = { requestId, name: 'Red Sea shipping notices (SYNTHETIC)', publisher: 'Regional maritime notice service (SYNTHETIC)', howFound: 'Cited by two carrier advisories in October 2026 (SYNTHETIC)',
      termsUrl: 'https://notices.example/terms', purposes: feedPurposes, assessment: 'Timely notices to mariners for the corridor; observational authority only (SYNTHETIC).' };
    const p = (await propose(hoffmann, payload)).candidate;
    expect(p).toMatchObject({ state: 'proposed', proposed_by: hoffmann.principalId, proposed_purposes: feedPurposes, replayed: false });
    candidateId = String(p['candidate_id']);
    expect((await propose(hoffmann, payload)).candidate).toMatchObject({ candidate_id: candidateId, replayed: true });
    const dup = await refusal(propose(analyst2, payload));
    expect(dup.message).toMatch(/^source candidate rejected \(duplicate\)/); expect(dup.status).toBe(409);
    const list = (await candidates(dvorak)).candidates;
    expect(list.find((x) => x['candidate_id'] === candidateId)).toMatchObject({ state: 'proposed', events: [expect.objectContaining({ event: 'candidate.proposed' })] });
    expect(await rows(sql`select 1 from observation.source_candidates where request_id = ${requestId}::uuid`)).toHaveLength(1);
  });
  it('the request\'s own refusals (purposes, terms URL, assessment) — class form, 422; the PDP refuses a decision owner (403) and an agent at the human gate', async () => {
    await refused(propose(hoffmann, { name: 'x', publisher: 'Pub (SYNTHETIC)', howFound: 'a search (SYNTHETIC)', purposes: [], assessment: 'too short? no, long enough' }), /^source candidate rejected \(name\)/, 422);
    await refused(propose(hoffmann, { name: 'Feed (SYNTHETIC)', publisher: 'Pub (SYNTHETIC)', howFound: 'a search (SYNTHETIC)', purposes: [], assessment: 'an assessment (SYNTHETIC)' }), /^source candidate rejected \(purposes\)/, 422);
    await refused(propose(hoffmann, { name: 'Feed (SYNTHETIC)', publisher: 'Pub (SYNTHETIC)', howFound: 'a search (SYNTHETIC)', termsUrl: 'http://insecure.example', purposes: ['monitoring'], assessment: 'an assessment (SYNTHETIC)' }), /^source candidate rejected \(terms_url\)/, 422);
    expect((await refusal(propose(w.owner, { name: 'Feed (SYNTHETIC)', publisher: 'Pub', howFound: 'a search (SYNTHETIC)', purposes: ['m'], assessment: 'an assessment' }))).status).toBe(403);
    const agent = await refusal(propose({ ...hoffmann, kind: 'agent' } as AuthenticatedPrincipal, { name: 'Feed (SYNTHETIC)', publisher: 'Pub (SYNTHETIC)', howFound: 'a search (SYNTHETIC)', purposes: ['m'], assessment: 'an assessment (SYNTHETIC)' }));
    expect(agent.status).toBe(403); expect(agent.message).toMatch(/human gate/);
  });
  it('the PREFILLED SRC@v4 draft carries the candidate (name, publisher, terms, purposes) with conservative defaults; a polled kind lists the endpoints it lacks; nothing is registered by a draft', async () => {
    const before = Number((await one(sql`select count(*)::int n from observation.source_contracts_current where tenant_id = ${T()}::uuid`))['n']);
    const up = (await draft(hoffmann, candidateId, 'upload')).draft;
    expect(up.missing).toEqual([]);
    expect(up.contract).toMatchObject({ name: 'Red Sea shipping notices (SYNTHETIC)', publisher: 'Regional maritime notice service (SYNTHETIC)', connector_kind: 'upload', source_key: 'red-sea-shipping-notices',
      authority_and_rights: { rights_state: 'pending', purposes: feedPurposes, licence: 'see https://notices.example/terms' },
      content_policy: { active_content: 'quarantine', macros: 'quarantine', embedded_files: 'quarantine', hidden_instructions: 'quarantine' } });
    expect(validateSourceContract(up.contract).ok).toBe(true);
    const rss = (await draft(hoffmann, candidateId, 'rss')).draft;
    expect(rss.missing).toContain('identity.endpoints must name at least one endpoint for a polled source');
    expect(Number((await one(sql`select count(*)::int n from observation.source_contracts_current where tenant_id = ${T()}::uuid`))['n'])).toBe(before);
    expect(sourceKeyOf('Djibouti transshipment — customs (SYNTHETIC)')).toBe('djibouti-transshipment-customs');
    expect(draftContractFromCandidate({ candidate_id: candidateId, name: 'Q', publisher: 'P', how_found: 'h', terms_url: null, proposed_purposes: ['m'], assessment: 'a' }, 'upload', '2026-10-21').contract)
      .toMatchObject({ source_key: 'source-candidate', stewardship: { review_due: '2027-04-21' } });
  });
  it('a candidate is promoted only to an SRC@v4 contract — a v3 contract is refused and NOTHING is registered; promoted, the draft SRC@v4 is registered by the analyst and the candidate names it; a second promotion is refused (state)', async () => {
    const before = Number((await one(sql`select count(*)::int n from observation.source_contracts_current where tenant_id = ${T()}::uuid`))['n']);
    const v3 = await refusal(promote(hoffmann, candidateId, uploadContract(`b40rg-v3-${uuidv7().slice(-8)}`)));
    expect(v3.message).toMatch(/^source candidate rejected \(contract\): a candidate is promoted to an SRC@v4 contract/); expect(v3.status).toBe(422);
    expect(Number((await one(sql`select count(*)::int n from observation.source_contracts_current where tenant_id = ${T()}::uuid`))['n'])).toBe(before);
    const key = `red-sea-shipping-notices-${uuidv7().slice(-8)}`;
    const r = await promote(hoffmann, candidateId, v4Feed(key));
    V = r.source.sourceId;
    expect(r.candidate).toMatchObject({ state: 'promoted', promoted_source_id: V, promoted_contract_version: 1 });
    expect(await one(sql`select s.lifecycle_state, s.registrar_principal_id::text reg, o.schema_ref from observation.source_contracts_current s join objects.canonical_objects o on o.object_type = 'SRC' and o.object_id = s.src_object_id and o.object_version = s.src_object_version where s.source_id = ${V}::uuid`))
      .toEqual({ lifecycle_state: 'draft', reg: hoffmann.principalId, schema_ref: 'SRC@v4' });
    await refused(promote(hoffmann, candidateId, v4Feed(`${key}-again`)), /^source candidate rejected \(state\)/, 409);
    expect((await record(dvorak, V)).registry['candidate']).toMatchObject({ candidate_id: candidateId, state: 'promoted' });
  });
  it('a decline: another analyst may not decline the proposer\'s candidate (authority); the proposer declines with a reason; a declined candidate is not promoted', async () => {
    const p = (await propose(hoffmann, { name: 'Gulf port gossip forum (SYNTHETIC)', publisher: 'anonymous forum (SYNTHETIC)', howFound: 'a forum thread (SYNTHETIC)', purposes: ['corridor monitoring'], assessment: 'unverifiable authority (SYNTHETIC)' })).candidate;
    const id = String(p['candidate_id']);
    await refused(decline(analyst2, id, 'not mine to decline (SYNTHETIC)'), /^source candidate rejected \(authority\)/, 403);
    expect((await decline(hoffmann, id, 'unverifiable authority; not worth registering (SYNTHETIC)')).candidate).toMatchObject({ state: 'declined', decided_by: hoffmann.principalId });
    await refused(promote(hoffmann, id, v4Feed(`b40rg-declined-${uuidv7().slice(-8)}`)), /^source candidate rejected \(state\)/, 409);
  });
});

describe('RG2 · EVALUATION BEFORE APPROVAL (D5) — the v4 gate; v1–v3 unchanged', () => {
  it('an UNEVALUATED v4 contract is refused approval — nothing written (the version stays a draft, no approval event)', async () => {
    const r = await refusal(approveSrc(dvorak, V, 1));
    expect(r.message).toMatch(/^source approval rejected \(unevaluated\): source .* v1 is an SRC@v4 contract with no recorded evaluation/);
    expect(r.status).toBe(409); expect(r.sqlstate).toBe('23514');
    expect(await one(sql`select lifecycle_state, approver_principal_id from observation.source_contracts_current where source_id = ${V}::uuid`)).toEqual({ lifecycle_state: 'draft', approver_principal_id: null });
    expect(await rows(sql`select 1 from observation.source_contract_events where source_id = ${V}::uuid and event = 'contract.approved'`)).toHaveLength(0);
  });
  it('the REGISTRAR may not evaluate (separation of duties); an analyst is refused by the PDP; an agent at the human gate; a failed contract test cannot recommend approval', async () => {
    expect((await refusal(evaluate(hoffmann, V, evaluation(1)))).status).toBe(403);   // the PDP: an analyst does not evaluate
    const agent = await refusal(evaluate({ ...dvorak, kind: 'agent' } as AuthenticatedPrincipal, V, evaluation(1)));
    expect(agent.status).toBe(403); expect(agent.message).toMatch(/human gate/);
    await refused(evaluate(dvorak, V, evaluation(1, { contractTests: [{ name: 'schema parses', outcome: 'fail' }] })), /^source evaluation rejected \(contract_tests\): an evaluation recommending approval records no failed contract test/, 422);
    // the separation: a collection manager who REGISTERED a v4 version may not evaluate it
    const own = await register(dvorak, v4Feed(`b40rg-own-${uuidv7().slice(-8)}`));
    await refused(evaluate(dvorak, own.source.sourceId, evaluation(1)), /^source evaluation rejected \(separation_of_duties\)/, 403);
    expect(await rows(sql`select 1 from observation.source_evaluations where source_id in (${V}::uuid, ${own.source.sourceId}::uuid)`)).toHaveLength(0);
  });
  it('an evaluation recommending REVISE blocks the approval (evaluation); a later one recommending approval admits it — the collection manager evaluates and approves; the registrar\'s own approval is still refused', async () => {
    const revise = (await evaluate(dvorak, V, evaluation(1, { recommendation: 'revise', reason: 'the coverage universe is not declared precisely enough (SYNTHETIC)' }))).evaluation;
    expect(revise).toMatchObject({ recommendation: 'revise', evaluated_by: dvorak.principalId, replayed: false });
    await refused(approveSrc(dvorak, V, 1), /^source approval rejected \(evaluation\): the latest evaluation of source .* recommends revise, not approval/, 409);
    const ok = (await evaluate(dvorak, V, evaluation(1))).evaluation;
    expect(ok).toMatchObject({ recommendation: 'approve', contract_tests: [{ name: 'schema parses', outcome: 'pass', note: null }, { name: 'replay set admitted', outcome: 'pass', note: null }], change_impact: null });
    expect((await refusal(approveSrc(hoffmann, V, 1))).status).toBe(403);   // the registrar (an analyst): the PDP, and the 0022 rule behind it
    await approveSrc(dvorak, V, 1);
    const ev1 = await one(sql`select details from observation.source_contract_events where source_id = ${V}::uuid and event = 'contract.approved'`);
    expect(ev1['details']).toMatchObject({ evaluation_id: ok['evaluation_id'], registrar: hoffmann.principalId });
    expect((await rows(sql`select event from observation.source_contract_events where source_id = ${V}::uuid order by occurred_at`)).map((e) => e['event']))
      .toEqual(['contract.registered', 'contract.evaluated', 'contract.evaluated', 'contract.approved']);
    await transition(dvorak, V, 1, 'active');
    // an evaluation of a version no longer a draft is refused (state)
    await refused(evaluate(dvorak, V, evaluation(1)), /^source evaluation rejected \(state\)/, 409);
  });
  it('a v1–v3 contract keeps its recorded path: registered by the analyst and approved by the collection manager with no evaluation (e2e phase1 #1–#3)', async () => {
    const r = await register(hoffmann, uploadContract(`b40rg-v3-path-${uuidv7().slice(-8)}`));
    await approveSrc(dvorak, r.source.sourceId, 1);
    expect(await one(sql`select lifecycle_state from observation.source_contracts_current where source_id = ${r.source.sourceId}::uuid`)).toEqual({ lifecycle_state: 'approved' });
    const reg = (await record(hoffmann, r.source.sourceId)).registry;
    expect(reg.versions[0]).toMatchObject({ v4: false, evaluations: [], approval_gate: expect.stringMatching(/not recorded before B40/) });
    expect(reg.economics).toMatchObject({ declared: false, statement: expect.stringMatching(/not recorded before B40/) });
  });
  it('CAP-OB-02: the evaluation of a version that SUPERSEDES another records the change preview (a purpose dropped; what rests on the source)', async () => {
    const v2 = await register(hoffmann, v4Feed(String((await one(sql`select source_key k from observation.source_contracts_current where source_id = ${V}::uuid`))['k']), { version: 2, supersedes: 1, purposes: ['corridor monitoring'] }), V);
    expect(v2.source.contractVersion).toBe(2);
    const e = (await evaluate(dvorak, V, evaluation(2, { recommendation: 'reject', reason: 'dropping internal briefings is not wanted (SYNTHETIC)' }))).evaluation;
    expect(e['change_impact']).toMatchObject({ operation: 'new_version', contract_version: 2, supersedes: 1, changes: [expect.objectContaining({ field: 'purposes', dropped: ['internal briefings'] })] });
    await approveSrc(dvorak, V, 2, 'reject');   // a rejection needs no approving evaluation
    expect(await one(sql`select lifecycle_state from observation.source_contracts_current where source_id = ${V}::uuid and contract_version = 2`)).toEqual({ lifecycle_state: 'retired' });
  });
});

describe('RG3 · CUSTOMER APPROVAL (D13), STEWARDSHIP, SOURCE INCIDENTS (PER-11), ECONOMICS', () => {
  it('W. Zielińska (customer sponsor, TENANT) records the customer approval of the feed\'s use — claim demonstration|construction only; a sponsor who approved the contract is refused (separation); a draft version is refused (state)', async () => {
    const a = (await customer(zielinska, V, { contractVersion: 1, decision: 'approve', scopeStatement: 'NORDWERK may use the notices for corridor monitoring and internal briefings (SYNTHETIC)', reason: 'the customer agrees the use (SYNTHETIC)', claim: 'construction' })).approval;
    expect(a).toMatchObject({ decision: 'approve', claim: 'construction', approved_by: zielinska.principalId });
    await refused(customer(zielinska, V, { contractVersion: 1, decision: 'approve', scopeStatement: 'a scope statement (SYNTHETIC)', reason: 'a reason (SYNTHETIC)', claim: 'acceptance' }), /^customer approval rejected \(claim\)/, 422);
    expect((await refusal(customer(dvorak, V, { contractVersion: 1, decision: 'approve', scopeStatement: 'a scope statement (SYNTHETIC)', reason: 'a reason (SYNTHETIC)', claim: 'construction' }))).status).toBe(403);   // the PDP
    // the approver of a contract who is ALSO a customer sponsor is refused by the port
    const own = await register(hoffmann, v4Feed(`b40rg-sep-${uuidv7().slice(-8)}`));
    await evaluate(dvorak, own.source.sourceId, evaluation(1));
    await approveSrc(adminApprover, own.source.sourceId, 1);
    await refused(customer(adminApprover, own.source.sourceId, { contractVersion: 1, decision: 'approve', scopeStatement: 'a scope statement (SYNTHETIC)', reason: 'a reason (SYNTHETIC)', claim: 'construction' }), /^customer approval rejected \(separation_of_duties\)/, 403);
    const draftOnly = await register(hoffmann, v4Feed(`b40rg-draft-${uuidv7().slice(-8)}`));
    await refused(customer(zielinska, draftOnly.source.sourceId, { contractVersion: 1, decision: 'approve', scopeStatement: 'a scope statement (SYNTHETIC)', reason: 'a reason (SYNTHETIC)', claim: 'construction' }), /^customer approval rejected \(state\)/, 409);
    expect((await rows(sql`select event from observation.source_contract_events where source_id = ${V}::uuid and event = 'contract.customer_approved'`))).toHaveLength(1);
  });
  it('STEWARDSHIP: F. Aydın names the steward and the review due date (v1); a stale change refused; a steward without the role refused; the history versioned; the contract event', async () => {
    const s1 = (await steward(aydin, V, { expectedVersion: 0, steward: aydin.principalId, state: 'assigned', reviewDue: '2027-04-30', reason: 'the notices feed is stewarded by the data steward (SYNTHETIC)' })).stewardship;
    expect(s1).toMatchObject({ version: 1, steward_principal_id: aydin.principalId, state: 'assigned', review_due: '2027-04-30' });
    await refused(steward(aydin, V, { expectedVersion: 0, steward: aydin.principalId, state: 'under_review', reviewDue: '2027-01-31', reason: 'a stale change (SYNTHETIC)' }), /^stewardship rejected \(stale\)/, 409);
    await refused(steward(aydin, V, { expectedVersion: 1, steward: hoffmann.principalId, state: 'assigned', reviewDue: '2027-01-31', reason: 'an analyst is not a steward (SYNTHETIC)' }), /^stewardship rejected \(steward\)/, 422);
    expect((await steward(dvorak, V, { expectedVersion: 1, steward: dvorak.principalId, state: 'under_review', reviewDue: '2026-11-30', reason: 'review on the rights change (SYNTHETIC)' })).stewardship).toMatchObject({ version: 2 });
    const reg = (await record(aydin, V)).registry;
    expect(reg['stewardship']).toMatchObject({ version: 2, state: 'under_review', steward: { id: dvorak.principalId } });
    expect((reg['stewardship_history'] as Row[]).map((x) => x['version'])).toEqual([2, 1]);
    expect(await rows(sql`select 1 from observation.source_contract_events where source_id = ${V}::uuid and event = 'contract.stewardship_changed'`)).toHaveLength(2);
    expect((await refusal(steward(hoffmann, V, { expectedVersion: 2, steward: aydin.principalId, state: 'assigned', reviewDue: '2027-01-31', reason: 'an analyst (SYNTHETIC)' }))).status).toBe(403);
  });
  it('SOURCE INCIDENTS (PER-11): an analyst opens one owned by the collection manager; an analyst may not own one; an analyst may not resolve; the collection manager resolves; resolved twice is refused', async () => {
    await refused(openIncident(hoffmann, V, { kind: 'quality', statement: 'two notices duplicated in the last poll (SYNTHETIC)', owner: hoffmann.principalId }), /^source incident rejected \(owner\)/, 422);
    const i = (await openIncident(hoffmann, V, { kind: 'quality', statement: 'two notices duplicated in the last poll (SYNTHETIC)', owner: dvorak.principalId })).incident;
    expect(i).toMatchObject({ state: 'open', owner_principal_id: dvorak.principalId, opened_by: hoffmann.principalId });
    const id = String(i['incident_id']);
    await refused(resolveIncident(hoffmann, id, 'an analyst closes it (SYNTHETIC)'), /^source incident rejected \(authority\)/, 403);
    expect((await resolveIncident(dvorak, id, 'the duplicates were the publisher\'s re-issue (SYNTHETIC)')).incident).toMatchObject({ state: 'resolved', resolved_by: dvorak.principalId });
    await refused(resolveIncident(dvorak, id, 'again (SYNTHETIC)'), /^source incident rejected \(state\)/, 409);
  });
  it('ECONOMICS against the run meter: the declared cost per run × the runs recorded in the period, the budget left; a v1–v3 source declares none', async () => {
    const e = (await record(dvorak, V)).registry.economics;
    expect(e).toMatchObject({ declared: true, period: 'month', currency: 'EUR', runs: 0, cost: 0, over_budget: false, basis: expect.stringMatching(/run meter/) });
  });
});

describe('RG4 · THE RIGHTS LIFECYCLE — preview, narrow, the new feed\'s withdrawal with its deletion obligation', () => {
  it('the CHANGE PREVIEW (CAP-OB-02) before a withdrawal: the versions and what each becomes, the schedule, "nothing rests on it yet"', async () => {
    const p = (await preview(dvorak, V, { operation: 'withdraw' })).preview;
    expect(p).toMatchObject({ operation: 'withdraw', possible: true, latest_version: 2, impact: { resting: 0, statement: expect.stringMatching(/^nothing rests on it yet/) } });
    expect((p['versions'] as Row[]).find((x) => x['contract_version'] === 1)).toMatchObject({ lifecycle: 'active', after: { rights_state: 'withdrawn', lifecycle: 'suspended' } });
    await refused(preview(dvorak, V, { operation: 'delete' }), /^source registry rejected \(operation\)/, 422);
  });
  it('NARROW: the purposes of the latest version narrowed to a strict subset (the event, the ledger); a wider or equal set refused', async () => {
    // the latest version of V is the retired v2 — narrowing reads the latest; v2 keeps ['corridor monitoring'] → nothing narrower: refused
    await refused(rights(dvorak, V, { contractVersion: 2, operation: 'narrow', purposes: ['corridor monitoring'], reason: 'narrow to monitoring only (SYNTHETIC)' }), /^rights change rejected \(purposes\)/, 422);
    const other = await register(hoffmann, v4Feed(`b40rg-narrow-${uuidv7().slice(-8)}`));
    const n = (await rights(dvorak, other.source.sourceId, { contractVersion: 1, operation: 'narrow', purposes: ['corridor monitoring'], reason: 'internal briefings dropped by the publisher\'s new terms (SYNTHETIC)', evidence: 'the publisher\'s notice of 2026-10-19 (SYNTHETIC)' })).change;
    expect(n).toMatchObject({ operation: 'narrow', purposes_before: feedPurposes, purposes_after: ['corridor monitoring'] });
    expect(await one(sql`select purposes from observation.source_contracts_current where source_id = ${other.source.sourceId}::uuid`)).toEqual({ purposes: ['corridor monitoring'] });
  });
  it('the refusals: stale (an older version read), a withdrawal without evidence, an analyst (PDP), an agent (human gate)', async () => {
    await refused(rights(dvorak, V, { contractVersion: 1, operation: 'withdraw', reason: 'the publisher revoked the licence (SYNTHETIC)', evidence: 'the revocation notice (SYNTHETIC)' }), /^rights change rejected \(stale\): source .* is at contract version 2; this change read 1/, 409);
    await refused(rights(dvorak, V, { contractVersion: 2, operation: 'withdraw', reason: 'the publisher revoked the licence (SYNTHETIC)' }), /^rights change rejected \(evidence\)/, 422);
    expect((await refusal(rights(hoffmann, V, { contractVersion: 2, operation: 'withdraw', reason: 'an analyst (SYNTHETIC)', evidence: 'none (SYNTHETIC)' }))).status).toBe(403);
    const agent = await refusal(rights({ ...dvorak, kind: 'agent' } as AuthenticatedPrincipal, V, { contractVersion: 2, operation: 'withdraw', reason: 'an agent (SYNTHETIC)', evidence: 'none (SYNTHETIC)' }));
    expect(agent.status).toBe(403); expect(agent.message).toMatch(/human gate/);
    expect(await rows(sql`select 1 from observation.source_rights_changes where source_id = ${V}::uuid`)).toHaveLength(0);
  });
  it('the feed WITHDRAWN with a declared DELETION OBLIGATION: every version withdrawn, v1 suspended, the incident opened, "nothing rests on it yet", a B9 retention action OPENED (waiting for the retention authority — never executed); a second withdrawal refused (state); the request replays', async () => {
    const requestId = uuidv7();
    const payload = { requestId, contractVersion: 2, operation: 'withdraw', reason: 'The publisher revoked the notices licence (SYNTHETIC)', evidence: 'Revocation notice ref RSN-2026-10-21 (SYNTHETIC)',
      deletionObligation: 'delete the admitted notices within 30 days of the withdrawal (SYNTHETIC)' };
    const r = (await rights(dvorak, V, payload)).change;
    expect(r).toMatchObject({ operation: 'withdraw', suspended_version: 1, schedule_runtime: 'removed', impact: { resting: 0 }, attention_items: [], replayed: false,
      deletion_statement: expect.stringMatching(/retention action .* waits for the retention authority/) });
    expect(r.affected.map((a) => [a['contract_version'], a['prior_rights'], a['prior_lifecycle'], a['changed']])).toEqual([[1, 'confirmed', 'active', true], [2, 'confirmed', 'retired', true]]);
    const action = await one(sql`select kind, target_kind, state, selector, opened_by::text from retention.actions_current where action_id = ${String(r['retention_action_id'])}::uuid`);
    expect(action).toMatchObject({ kind: 'deletion', target_kind: 'evidence', state: 'opened', selector: { source_id: V }, opened_by: dvorak.principalId });
    expect(await one(sql`select kind, state, owner_principal_id::text owner from observation.source_incidents where incident_id = ${String(r['incident_id'])}::uuid`)).toEqual({ kind: 'rights', state: 'open', owner: dvorak.principalId });
    expect((await rights(dvorak, V, payload)).change).toMatchObject({ change_id: r['change_id'], replayed: true });
    await refused(rights(dvorak, V, { ...payload, requestId: uuidv7() }), /^rights change rejected \(state\): the rights of source .* are already withdrawn/, 409);
    expect(await one(sql`select string_agg(rights_state || '/' || lifecycle_state, ',' order by contract_version) s from observation.source_contracts_current where source_id = ${V}::uuid`)).toEqual({ s: 'withdrawn/suspended,withdrawn/retired' });
    // the outbox announced it, cause rights
    const evs = await rows(sql`select payload from objects.object_outbox where event_type = 'SourceHealthChanged' and payload ->> 'source_id' = ${V} and payload ->> 'cause' = 'rights'`);
    expect(evs[0]!['payload']).toMatchObject({ state: 'suspended', cause: 'rights', rights_change_id: r['change_id'] });
    // B40 integration: the opened retention action is announced as the retention unit's own event (RetentionActionDue@v1), once
    const due = await rows(sql`select payload from objects.object_outbox where event_type = 'RetentionActionDue' and payload ->> 'action_id' = ${String(r['retention_action_id'])}`);
    expect(due).toHaveLength(1);
    expect(due[0]!['payload']).toMatchObject({ schema: 'RetentionActionDue', schema_version: 'v1', kind: 'deletion', target_kind: 'evidence', selector: { source_id: V, rights_change_id: r['change_id'] },
      opened_by: dvorak.principalId, cause: { action: 'observation.source.change_rights', target_type: 'RTA' } });
    // the feed is not reactivated while withdrawn (0022's rule), nor approved in a new version (RG7)
    await refused(transition(dvorak, V, 1, 'active'), /./, 409);
  });
});

describe('RG5 · DESIGN D4 — the fixture source S withdrawn: refused use with NO business effect, the unaffected scope usable, reading as it was, current state', () => {
  let since: Date; let optionsBefore = 0; let evdRows: Row[] = []; let custodyBefore = 0; let exportAction = { id: '', digest: '' }; let pubId = ''; let pubDigest = '';
  it('BEFORE: the impact lists what rests on S — its forecast and scenario (B28), the claim and the assumption on it, the package option citing its evidence (B50 forward), each with its owner', async () => {
    const i = (await impact(w.owner, S())).impact;
    expect(i.products.map((p) => p['kind'])).toEqual(expect.arrayContaining(['forecast', 'scenario', 'assumption']));
    expect(i.products.find((p) => p['id'] === asuOnClaim)).toMatchObject({ kind: 'assumption', owner: { id: w.twinOwner.principalId } });
    expect(i.claims.map((x) => x['id'])).toContain(claimS);
    expect(i.claims.map((x) => x['id'])).not.toContain(claimU);
    expect((i.forward['options'] as Row)['items']).toEqual(expect.arrayContaining([expect.objectContaining({ package_id: proposedP.pkg, option: 'reroute', owner: expect.objectContaining({ id: w.owner.principalId }) })]));
    expect(i.owners.map((o) => o['id'])).toEqual(expect.arrayContaining([w.twinOwner.principalId, w.owner.principalId]));
    expect(JSON.stringify(i)).not.toMatch(/"(payload|base64|object_value)"/);   // D9: refs and owners only, never content
    // the use paths are open before the withdrawal (the baseline)
    await usable('EVD', w.evd.id, w.evd.version, 'decision_option');
    await usable('CLM', claimS, 1, 'gate');
    // the export of S's and U's evidence, approved BEFORE the withdrawal (rights revoked while the export is queued — A9)
    const mS = String((await one(sql`select payload ->> 'manifest_id' m from objects.canonical_objects where object_id = ${w.evd.id}::uuid and object_version = ${w.evd.version}`))['m']);
    const mU = String((await one(sql`select payload ->> 'manifest_id' m from objects.canonical_objects where object_id = ${w.records.inv.id}::uuid and object_version = ${w.records.inv.version}`))['m']);
    const o = await openAction(novak, { kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mS, mU], classificationCeiling: 'restricted' } });
    const s = await resolveScope(novak, o.action.actionId);
    expect(s.scope).toMatchObject({ execute: 2 });
    exportAction = { id: o.action.actionId, digest: String(s.scope['scope_digest']) };
    await approveAction(bergmann, exportAction.id, exportAction.digest);
    // a publication of the package proposed before (its option cites S's evidence), drafted BEFORE the withdrawal
    const pd = (await draftPub(drafter, pubDraft(proposedP.pkg, proposedP.v, await dpkDigest(proposedP.pkg, proposedP.v), 'Corridor decision — board pack (B40 §RG, SYNTHETIC)'))).publication;
    pubId = String(pd['publication_id']); pubDigest = String(pd['bytes_digest']);
    expect(pd).toMatchObject({ version: 1, state: 'drafted' });
  });
  it('M. Dvořák WITHDRAWS S\'s rights (the publisher revoked them): every version withdrawn, the active one suspended, the schedule removed, the rights incident, an attention item to each owner, SourceHealthChanged {suspended, cause rights}', async () => {
    since = await mark();
    optionsBefore = Number((await one(sql`select count(*)::int n from decision.options where tenant_id = ${T()}::uuid`))['n']);
    evdRows = await rows(sql`select object_id::text, object_version, content_digest, lifecycle_state from objects.canonical_objects where object_type = 'EVD' and provenance_ref like ${`SRC:${S()}@%`} order by object_id, object_version`);
    custodyBefore = Number((await one(sql`select count(*)::int n from observation.custody_events where source_id = ${S()}::uuid and event <> 'custody.retrieved'`))['n']);
    const latest = Number((await one(sql`select max(contract_version)::int v from observation.source_contracts_current where source_id = ${S()}::uuid`))['v']);
    const r = (await rights(dvorak, S(), { contractVersion: latest, operation: 'withdraw', reason: 'The statistics publisher revoked the reuse licence (SYNTHETIC)', evidence: 'Licence revocation letter ref STAT-2026-10 (SYNTHETIC)' })).change;
    withdrawalS = r;
    expect(r).toMatchObject({ operation: 'withdraw', suspended_version: latest, deletion_statement: expect.stringMatching(/^no deletion obligation was declared/), retention_action_id: null });
    expect(r.affected.every((a) => a['prior_rights'] === 'confirmed')).toBe(true);
    expect(Number((r.impact as Row)['resting'])).toBeGreaterThan(0);
    const owners = (r.attention_items as Row[]).map((x) => x['owner']);
    expect(owners).toEqual(expect.arrayContaining([w.twinOwner.principalId]));
    const items = await rows(sql`select signal_class, subject_kind, owner_principal_id::text owner, cause_event_type, details ->> 'cause' cause from executive.attention_items where cause_event_id = ${String(r['change_id'])}::uuid`);
    expect(items.length).toBe((r.attention_items as Row[]).length);
    expect(items.every((x) => x['signal_class'] === 'source.coverage_loss' && x['cause'] === 'rights' && x['cause_event_type'] === 'SourceRightsWithdrawn')).toBe(true);
    expect(items.map((x) => x['subject_kind'])).toEqual(expect.arrayContaining(['strategy_object', 'claim']));
    expect([undefined, 'removed']).toContain((await one(sql`select status from observation.scheduler_entries where source_id = ${S()}::uuid`))['status']);   // no schedule left (none, or removed)
    const evs = await healthEvents(S(), since);
    expect(evs.map((e) => (e['payload'] as Row)['cause'])).toEqual(['rights']);
    await healthApplied(String(evs[0]!['id']));
    const markers = await activeMarkers(S());
    expect(markers.length).toBeGreaterThan(0);
    expect(markers.every((m) => m['cause'] === 'rights' && m['health_state'] === 'suspended')).toBe(true);
    expect(await one(sql`select string_agg(distinct rights_state, ',') r from observation.source_contracts_current where source_id = ${S()}::uuid`)).toEqual({ r: 'withdrawn' });
  }, 180_000);
  it('OPTION — an option citing S\'s evidence is REFUSED (rights_withdrawn, 409) through decision.derive_option; no option written', async () => {
    const d = await c.declare({ decisionObjectId: w.decisionId, title: 'B40 §RG — reroute on the withdrawn source (SYNTHETIC)', statement: 'probe', owner: w.owner.principalId });
    const v = (await c.open(d.package.packageId)).version.version;
    const r = await refusal(c.option(d.package.packageId, v, { key: 'reroute', title: 'Reroute via the Cape', kind: 'intervention', consequences: [{ kind: 'run', id: w.rerouteId }, { kind: 'evidence', id: w.evd.id, version: w.evd.version }] }));
    expect(r.message).toMatch(new RegExp(`object use rejected \\(rights_withdrawn\\): EVD ${w.evd.id} v${w.evd.version} rests on EVD ${w.evd.id} v${w.evd.version}, whose source contract \\(${S()} v\\d+\\) has its rights WITHDRAWN`));
    expect(r.status).toBe(409);
    expect(Number((await one(sql`select count(*)::int n from decision.options where package_id = ${d.package.packageId}::uuid`))['n'])).toBe(0);
    // UNAFFECTED: the same act citing U's evidence (another source) is admitted
    expect((await c.option(d.package.packageId, v, { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: w.controlId }, { kind: 'evidence', id: w.records.inv.id, version: w.records.inv.version }] })).option.optionId).toBeTruthy();
    expect(Number((await one(sql`select count(*)::int n from decision.options where tenant_id = ${T()}::uuid`))['n'])).toBe(optionsBefore + 1);
  });
  it('GATE — the package proposed before the withdrawal is REFUSED decision-ready (its reroute option rests on S\'s evidence); no gate act recorded', async () => {
    const before = Number((await one(sql`select count(*)::int n from decision.gate_actions where package_id = ${proposedP.pkg}::uuid`))['n']);
    const r = await refusal(gate(hoffmann, proposedP.pkg, proposedP.v, 'ready', { rationale: 'Complete: options and citations read (B40 §RG)', informationPackageDigest: await infoDigest(proposedP.pkg, proposedP.v) }));
    expect(r.message).toMatch(/object use rejected \(rights_withdrawn\): .* rests on EVD .* not used for gate/);
    expect(r.status).toBe(409);
    const after = Number((await one(sql`select count(*)::int n from decision.gate_actions where package_id = ${proposedP.pkg}::uuid`))['n']);
    expect(after).toBe(before);
  });
  it('PUBLICATION — the drafted board pack (a report of that package) is REFUSED approval (rights_withdrawn): it stays drafted, no PUB object, no signature', async () => {
    const r = await refusal(approvePub(w.executive, pubId, 1, pubDigest));
    expect(r.message).toMatch(/object use rejected \(rights_withdrawn\): DPK .* rests on EVD .* not used for publication/);
    expect(r.status).toBe(409);
    expect(await rows(sql`select 1 from objects.canonical_objects where object_type = 'PUB' and object_id = ${pubId}::uuid`)).toHaveLength(0);
    expect(await rows(sql`select 1 from executive.signatures where subject_kind = 'publication' and subject_id = ${pubId}::uuid`)).toHaveLength(0);
  });
  it('EXPORT — the export approved before the withdrawal is REFUSED at execution (rights_changed): no package, no custody.exported; an export of U\'s evidence alone executes (unaffected scope); assert_usable(export) refuses S\'s', async () => {
    await refused(executeAction(novak, exportAction.id), /rights_changed/, 409);
    expect(await rows(sql`select 1 from retention.export_packages where action_id = ${exportAction.id}::uuid`)).toHaveLength(0);
    expect(await rows(sql`select 1 from observation.custody_events where source_id = ${S()}::uuid and event = 'custody.exported'`)).toHaveLength(0);
    const mU = String((await one(sql`select payload ->> 'manifest_id' m from objects.canonical_objects where object_id = ${w.records.inv.id}::uuid and object_version = ${w.records.inv.version}`))['m']);
    const o = await openAction(novak, { kind: 'customer_export', targetKind: 'evidence', selector: { manifestIds: [mU], classificationCeiling: 'restricted' } });
    const s = await resolveScope(novak, o.action.actionId);
    await approveAction(bergmann, o.action.actionId, String(s.scope['scope_digest']));
    expect((await executeAction(novak, o.action.actionId)).execution).toMatchObject({ executed: 1 });
    expect((await refusal(usable('EVD', w.evd.id, w.evd.version, 'export'))).message).toMatch(/^object use rejected \(rights_withdrawn\)/);
    await usable('EVD', w.records.inv.id, w.records.inv.version, 'export');
    await usable('CLM', claimU, 1, 'publication');
  }, 180_000);
  it('READING stays as it was (D9): the analyst still reads S\'s evidence bytes (verified); the decision owner still may not (no new access); the claim and the evidence history are untouched', async () => {
    expect((await download(hoffmann, w.evd.id)).download).toMatchObject({ integrity: 'verified' });
    expect((await refusal(download(w.owner, w.evd.id))).status).toBe(403);
    expect(await rows(sql`select object_id::text, object_version, content_digest, lifecycle_state from objects.canonical_objects where object_type = 'EVD' and provenance_ref like ${`SRC:${S()}@%`} order by object_id, object_version`)).toEqual(evdRows);
    // the refused acts wrote no custody row (only reads — custody.retrieved — were recorded since the withdrawal)
    expect(Number((await one(sql`select count(*)::int n from observation.custody_events where source_id = ${S()}::uuid and event <> 'custody.retrieved'`))['n'])).toBe(custodyBefore);
  });
  it('from CURRENT database state, no tick: inside one transaction the rights flipped back to confirmed admit the use and flipped withdrawn refuse it again (rolled back — nothing kept)', async () => {
    let seen: string[] = [];
    await h.su.transaction().execute(async (tx) => {
      await sql`update observation.source_contracts_current set rights_state = 'confirmed' where source_id = ${S()}::uuid`.execute(tx);
      await sql`select objects.assert_usable('EVD', ${w.evd.id}::uuid, ${w.evd.version}::int, 'decision_option')`.execute(tx);
      seen.push('usable');
      await sql`update observation.source_contracts_current set rights_state = 'withdrawn' where source_id = ${S()}::uuid`.execute(tx);
      const e = await sql`select objects.assert_usable('EVD', ${w.evd.id}::uuid, ${w.evd.version}::int, 'decision_option')`.execute(tx).then(() => null, (x: unknown) => x as Error);
      seen.push(e === null ? 'usable' : /rights_withdrawn/.test(e.message) ? 'refused' : e.message);
      throw new Error('rollback');
    }).catch((e: unknown) => { if (!(e instanceof Error) || e.message !== 'rollback') throw e; });
    expect(seen).toEqual(['usable', 'refused']);
    seen = [];
    expect((await refusal(usable('CLM', claimS, 1, 'decision_option'))).message).toMatch(/^object use rejected \(rights_withdrawn\): CLM .* rests on EVD/);
  });
});

describe('RG6 · BOTH RIGHTS SOURCES COUNT, and RECOVERY only through governed versions', () => {
  let termsId = '';
  it('an IN-FORCE rights-terms record (F. Aydın, v1) does NOT lift the contract withdrawal — the use is still refused (rights_withdrawn)', async () => {
    const latest = Number((await one(sql`select max(contract_version)::int v from observation.source_contracts_current where source_id = ${S()}::uuid`))['v']);
    const evCv = Number((await one(sql`select split_part(provenance_ref, '@', 2)::int v from objects.canonical_objects where object_id = ${w.evd.id}::uuid and object_version = ${w.evd.version}`))['v']);
    expect(evCv).toBe(latest);
    const t = (await declareTerms(aydin, { sourceId: S(), contractVersion: evCv, expectedVersion: 0, expiresAt: null, purposes: ['decision support'], reason: 'Terms re-read from the publisher\'s page (SYNTHETIC)' })).terms;
    termsId = String(t['terms_id']);
    expect(t).toMatchObject({ state: 'in_force', version: 1 });
    expect((await refusal(usable('EVD', w.evd.id, w.evd.version, 'decision_option'))).message).toMatch(/^object use rejected \(rights_withdrawn\): .* has its rights WITHDRAWN \(its rights terms read in_force\)/);
  });
  it('a restoration needs its evidence and a collection manager; restoring nothing is refused (state)', async () => {
    const latest = Number((await one(sql`select max(contract_version)::int v from observation.source_contracts_current where source_id = ${S()}::uuid`))['v']);
    await refused(rights(dvorak, S(), { contractVersion: latest, operation: 'restore', reason: 'The licence was reinstated (SYNTHETIC)' }), /^rights change rejected \(evidence\)/, 422);
    expect((await refusal(rights(hoffmann, S(), { contractVersion: latest, operation: 'restore', reason: 'an analyst (SYNTHETIC)', evidence: 'none at all (SYNTHETIC)' }))).status).toBe(403);
    const fresh = await register(hoffmann, uploadContract(`b40rg-nothing-${uuidv7().slice(-8)}`));
    await refused(rights(dvorak, fresh.source.sourceId, { contractVersion: 1, operation: 'restore', reason: 'nothing was withdrawn (SYNTHETIC)', evidence: 'no evidence needed (SYNTHETIC)' }), /^rights change rejected \(state\)/, 409);
  });
  it('RECOVERY: the RESTORATION (with evidence) — the versions back to confirmed, the suspended version resumed, the schedule back, SourceHealthChanged {active, cause rights} clears the markers, the incident resolved; the use is admitted again', async () => {
    const t0 = await mark();
    const latest = Number((await one(sql`select max(contract_version)::int v from observation.source_contracts_current where source_id = ${S()}::uuid`))['v']);
    const r = (await rights(dvorak, S(), { contractVersion: latest, operation: 'restore', reason: 'The publisher reinstated the reuse licence (SYNTHETIC)', evidence: 'Reinstatement letter ref STAT-2026-10-R (SYNTHETIC)' })).change;
    expect(r).toMatchObject({ operation: 'restore', reverses: withdrawalS['change_id'], reactivated_version: latest, reactivated: true, schedule_runtime: 'restored' });
    expect(await one(sql`select string_agg(distinct rights_state, ',') r from observation.source_contracts_current where source_id = ${S()}::uuid`)).toEqual({ r: 'confirmed' });
    expect(await one(sql`select lifecycle_state from observation.source_contracts_current where source_id = ${S()}::uuid and contract_version = ${latest}`)).toEqual({ lifecycle_state: 'active' });
    expect(await one(sql`select status from observation.scheduler_entries where source_id = ${S()}::uuid`)).toEqual({ status: 'scheduled' });
    await scheduler.unschedule(T(), D(), S());   // the harness keeps the restored source from polling (its row says scheduled; the act's runtime is the scheduler's)
    const evs = (await healthEvents(S(), t0)).filter((e) => (e['payload'] as Row)['state'] === 'active');
    expect(evs.map((e) => (e['payload'] as Row)['cause'])).toEqual(['rights']);
    await healthApplied(String(evs[0]!['id']));
    expect(await activeMarkers(S())).toEqual([]);
    expect(await one(sql`select state from observation.source_incidents where incident_id = ${String(withdrawalS['incident_id'])}::uuid`)).toEqual({ state: 'resolved' });
    await usable('EVD', w.evd.id, w.evd.version, 'decision_option');
    const ok = (await gate(hoffmann, proposedP.pkg, proposedP.v, 'ready', { rationale: 'Complete after the rights were restored (B40 §RG)', informationPackageDigest: await infoDigest(proposedP.pkg, proposedP.v) })).gate;
    expect(ok).toMatchObject({ action: 'ready' });
  }, 180_000);
  it('the TERMS withdrawn while the contract is confirmed: the use is refused (B82 refuses it first as rights_expired; §RG counts it too — rights_withdrawn); restoring the CONTRACT does not lift it; a new TERMS version does', async () => {
    await withdrawTerms(aydin, termsId, { expectedVersion: 1, reason: 'The terms were withdrawn by the publisher (SYNTHETIC)' });
    expect((await refusal(usable('EVD', w.evd.id, w.evd.version, 'gate'))).message).toMatch(/^object use rejected \(rights_expired\)/);
    // §RG's hook on its own (the dispatcher's inputs): contract confirmed, terms withdrawn → rights_withdrawn
    const own = await one(sql`select observation._rg_use_refusal(${T()}::uuid, ${D()}::uuid, ${w.evd.id}::uuid, ${w.evd.version}::int, ${S()}::uuid, 1, 'confirmed', 'withdrawn') r`);
    expect((own['r'] as Row)['class']).toBe('rights_withdrawn');
    expect(String((own['r'] as Row)['detail'])).toMatch(/a confirmed contract does not lift a terms withdrawal/);
    // the contract is confirmed already: there is no withdrawal to restore (the contract side cannot lift the terms)
    const latest = Number((await one(sql`select max(contract_version)::int v from observation.source_contracts_current where source_id = ${S()}::uuid`))['v']);
    await refused(rights(dvorak, S(), { contractVersion: latest, operation: 'restore', reason: 'try to lift the terms (SYNTHETIC)', evidence: 'nothing to restore (SYNTHETIC)' }), /^rights change rejected \(state\)/, 409);
    expect((await refusal(usable('EVD', w.evd.id, w.evd.version, 'gate'))).message).toMatch(/^object use rejected \(rights_expired\)/);
    await declareTerms(aydin, { sourceId: S(), contractVersion: latest, expectedVersion: 2, expiresAt: null, purposes: ['decision support'], reason: 'The terms were granted again (SYNTHETIC)' });
    await usable('EVD', w.evd.id, w.evd.version, 'gate');
  });
  it('HISTORY intact: the contract events of S name both acts; the ledger holds both changes and refuses to be rewritten; the evidence rows are as they were', async () => {
    const evs = (await rows(sql`select event, details ->> 'operation' op from observation.source_contract_events where source_id = ${S()}::uuid and event in ('contract.rights_changed', 'contract.suspended', 'contract.reactivated') order by occurred_at`)).map((e) => `${e['event']}${e['op'] === null ? '' : `:${e['op']}`}`);
    expect(evs.filter((e) => e === 'contract.rights_changed:withdraw').length).toBeGreaterThanOrEqual(2);
    expect(evs).toContain('contract.suspended'); expect(evs).toContain('contract.reactivated'); expect(evs).toContain('contract.rights_changed:restore');
    expect((await rows(sql`select operation from observation.source_rights_changes where source_id = ${S()}::uuid order by recorded_at`)).map((x) => x['operation'])).toEqual(['withdraw', 'restore']);
    expect((await refusal(sql`update observation.source_rights_changes set reason = 'rewritten' where source_id = ${S()}::uuid`.execute(h.su))).message).toMatch(/is append-only/);
    expect((await refusal(sql`delete from observation.source_evaluations where source_id = ${V}::uuid`.execute(h.su))).message).toMatch(/is append-only/);
  });
});

describe('RG7 · the v1–v3 route RE-POINTED; no approval while withdrawn; foreign scope', () => {
  it('the v1–v3 rights route keeps its recorded behaviour and IS the lifecycle: its withdrawal is the lifecycle\'s (the ledger via rights_route, the announcement, its own suspension event once); a repeat is idempotent; no new version is approved while withdrawn; its confirmation is the lifecycle\'s restoration (never a reactivation)', async () => {
    const u2 = await h.uploadSource('internal', 'b40rg-route');
    const t0 = await mark();
    await setRightsRoute(dvorak, u2, 1, 'withdrawn');
    expect(await rows(sql`select via, operation from observation.source_rights_changes where source_id = ${u2}::uuid`)).toEqual([{ via: 'rights_route', operation: 'withdraw' }]);
    expect((await healthEvents(u2, t0)).map((e) => (e['payload'] as Row)['cause'])).toEqual(['rights']);
    expect((await rows(sql`select details ->> 'kind' k from observation.source_contract_events where source_id = ${u2}::uuid and event = 'contract.suspended'`)).map((e) => e['k'])).toEqual(['rights_update']);
    await setRightsRoute(dvorak, u2, 1, 'withdrawn');   // the route's recorded idempotence: no second lifecycle withdrawal
    expect(await rows(sql`select 1 from observation.source_rights_changes where source_id = ${u2}::uuid`)).toHaveLength(1);
    const key = String((await one(sql`select source_key k from observation.source_contracts_current where source_id = ${u2}::uuid`))['k']);
    const v2c = { ...uploadContract(key), lifecycle: { contract_version: 2, effective_from: '2024-01-01T00:00:00Z', effective_to: null, supersedes_version: 1 } };
    await register(hoffmann, v2c, u2);
    await refused(approveSrc(dvorak, u2, 2), /^source approval rejected \(rights_withdrawn\)/, 409);
    await setRightsRoute(dvorak, u2, 1, 'confirmed');
    expect((await rows(sql`select via, operation from observation.source_rights_changes where source_id = ${u2}::uuid order by recorded_at`)).map((x) => `${x['operation']}:${x['via']}`)).toEqual(['withdraw:rights_route', 'restore:rights_route']);
    expect(await one(sql`select rights_state, lifecycle_state from observation.source_contracts_current where source_id = ${u2}::uuid and contract_version = 1`)).toEqual({ rights_state: 'confirmed', lifecycle_state: 'suspended' });
    await approveSrc(dvorak, u2, 2);
    await settle();
  }, 120_000);
  it('a foreign scope reads nothing: another domain\'s path is refused before the port; the port refuses a context of another domain (read scope)', async () => {
    const other = uuidv7();
    const r = await refusal(rg.impact(h.req(dvorak, 'observation.rights.impact.read', 'SRC', S(), 'decision'), T(), other, S()));
    expect([403, 404]).toContain(r.status);
    const unknown = await refusal(impact(dvorak, uuidv7()));
    expect(unknown.message).toMatch(/^source registry rejected \(unknown_source\)/); expect(unknown.status).toBe(404);
  });
});

describe('RG8 · THE SHAPE', () => {
  it('the ledgers FORCE RLS, SELECT to eye_app / eye_commit, no write grant; the append-only triggers', async () => {
    for (const t of ['source_candidates', 'source_candidate_events', 'source_evaluations', 'source_rights_changes', 'source_customer_approvals', 'source_stewardship', 'source_incidents', 'source_incident_events']) {
      expect(await one(sql`select c.relrowsecurity r, c.relforcerowsecurity f, has_table_privilege('eye_app', c.oid, 'SELECT') s, has_table_privilege('eye_commit', c.oid, 'INSERT') i, has_table_privilege('eye_app', c.oid, 'UPDATE') u
        from pg_class c where c.oid = ${`observation.${t}`}::regclass`), t).toEqual({ r: true, f: true, s: true, i: false, u: false });
    }
    const trig = (await rows(sql`select c.relname from pg_trigger g join pg_class c on c.oid = g.tgrelid where c.relnamespace = 'observation'::regnamespace and g.tgfoid = 'public.raise_append_only'::regproc
      and c.relname in ('source_candidate_events', 'source_evaluations', 'source_rights_changes', 'source_customer_approvals', 'source_stewardship', 'source_incident_events') order by 1`)).map((x) => x['relname']);
    expect(trig).toEqual(['source_candidate_events', 'source_customer_approvals', 'source_evaluations', 'source_incident_events', 'source_rights_changes', 'source_stewardship']);
  });
  it('the ports: SECURITY DEFINER with a fixed search path; writes to eye_commit only, reads to eye_app and eye_commit, internals with no grant; none PUBLIC; §0\'s stub replaced WHOLE (STABLE, invoker, its search path, no grant)', async () => {
    const fns = await rows(sql`select p.proname n, p.prosecdef d, p.provolatile v, array_to_string(p.proconfig, ',') cfg, has_function_privilege('public', p.oid, 'EXECUTE') pub,
        has_function_privilege('eye_app', p.oid, 'EXECUTE') app, has_function_privilege('eye_commit', p.oid, 'EXECUTE') com
      from pg_proc p where p.pronamespace = 'observation'::regnamespace and p.proname in ('propose_source_candidate', 'decline_source_candidate', 'promote_source_candidate', 'record_source_evaluation',
        'change_rights', 'record_customer_approval', 'change_stewardship', 'open_source_incident', 'resolve_source_incident', 'source_registry_read', 'source_candidates_read', 'rights_revocation_impact',
        'source_change_impact', '_rg_impact', '_rg_withdraw', '_rg_change_preview', '_rg_route_owners', '_rg_use_refusal', 'approve_source', 'set_rights_state', 'mark_source_impact', 'upsert_scheduler_entry') order by 1`);
    const by = Object.fromEntries(fns.map((f) => [String(f['n']), f]));
    for (const n of ['propose_source_candidate', 'decline_source_candidate', 'promote_source_candidate', 'record_source_evaluation', 'change_rights', 'record_customer_approval', 'change_stewardship',
      'open_source_incident', 'resolve_source_incident', 'approve_source', 'set_rights_state', 'mark_source_impact', 'upsert_scheduler_entry']) expect(by[n], n).toMatchObject({ d: true, pub: false, app: false, com: true });
    for (const n of ['source_registry_read', 'source_candidates_read', 'rights_revocation_impact', 'source_change_impact']) expect(by[n], n).toMatchObject({ d: true, pub: false, app: true, com: true, v: 's' });
    for (const n of ['_rg_impact', '_rg_withdraw', '_rg_change_preview', '_rg_route_owners']) expect(by[n], n).toMatchObject({ d: true, pub: false, app: false, com: false });
    expect(by['_rg_use_refusal']).toMatchObject({ d: false, v: 's', cfg: 'search_path=observation, pg_catalog, pg_temp', pub: false, app: false, com: false });
    for (const f of fns) expect(String(f['cfg']), String(f['n'])).toMatch(/search_path=/);
  });
  it('§RG\'s hook on its inputs: in force on both sides → NULL; the contract withdrawn → rights_withdrawn whatever the terms say; a missing contract state read again from the projection; no source → not its question', async () => {
    const q = (cv: string | null, t: string | null, src: string | null = S()) => one(sql`select observation._rg_use_refusal(${T()}::uuid, ${D()}::uuid, ${w.evd.id}::uuid, 1, ${src}::uuid, 1, ${cv}::text, ${t}::text) r`).then((x) => x['r'] as Row | null);
    expect(await q('confirmed', 'in_force')).toBeNull();
    expect(await q('confirmed', null)).toBeNull();
    expect((await q('withdrawn', 'in_force'))!['class']).toBe('rights_withdrawn');
    expect((await q('withdrawn', null))!['class']).toBe('rights_withdrawn');
    expect((await q('confirmed', 'withdrawn'))!['class']).toBe('rights_withdrawn');
    expect(await q(null, null, null)).toBeNull();
    expect(await q(null, null)).toBeNull();   // re-read: S v1 is confirmed now
    expect(sha256('b40-rg')).toMatch(/^[0-9a-f]{64}$/);
  });
});
