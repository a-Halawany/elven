/**
 * B82-F cc (migration 0122_b82f_x_cc) — CORRECTION CLOSURE FOR THE AFFECTED PRODUCT'S OWNER (B50 §CL's "Observed, not fixed": the owner of an
 * affected product — a decision owner, an executive operator — holds `graph.closure.acknowledge` / `.except` but could not reach the obligation,
 * because the case page and its reads sit behind `graph.read`, whose roles exclude them).
 *
 * Through the real database, the PDP and the controllers, on the decision world (phase6-fixtures' bootDecisionWorld): a proposed decision
 * package whose reroute option cites the series evidence w.evd (owned by the DECISION OWNER w.owner), a drafted report PUBLICATION of it
 * (owned by its drafter, an EXECUTIVE OPERATOR); a correction of w.evd applied by the correction authority and walked.
 *
 *   r  THE REPRODUCTION: the two owners are refused the case read (graph.read, 403) — and the narrow read answers each ONLY their own
 *      obligation, with only what the act needs.
 *   n  NARROW: the answer's fields are exactly the act's (no path, no notice, no other consumer, no evidence); every listed obligation is the
 *      caller's as the existing ports decide (set-equal to the full read's consumers they answer for, over every open case); a principal with
 *      no obligation sees nothing; a role outside the acknowledge / except rule is refused the read (403) even when it holds graph.read; the
 *      exact rule's roles are the acknowledge rule's roles; the port re-checks the bound action and the acting principal.
 *   s  STILL REFUSED: the case read, the case list, the evidence (its detail and its bytes) — to both owners; another consumer's act and another
 *      case's act refused by the EXISTING ports; nobody was added to graph.read.
 *   c  COMPLETED through the EXISTING ports: the owner acknowledges their human review, the operator excepts their stale publication; the read
 *      then answers the new state with no act left; the escalation instants answered after a stall.
 *
 * SYNTHETIC throughout. STATED SUPERUSER MOVES: none on a row under test (the decision world's own fixture rows only).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import type { ClosureB50Controller } from '../../src/graph/closure/closure.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { PublishingController } from '../../src/executive/publishing/publishing.controller.js';
import { PdpService } from '../../src/policy/pdp.service.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';

const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b82f-cc-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');
process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

type Row = Record<string, unknown>;
let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>; let pdp: PdpService;
let ctl: ClosureB50Controller; let observation: ObservationController; let pubs: PublishingController;
let corrector: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal; let strategist: AuthenticatedPrincipal; let drafter: AuthenticatedPrincipal;
let analyst: AuthenticatedPrincipal; let bystander: AuthenticatedPrincipal; let retentionSteward: AuthenticatedPrincipal;
let PKG = ''; let PV = 0; let PUB = ''; let SERIES_SOURCE = ''; let CASE = ''; let CASE2 = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const WINDOWS = (s: number) => ({ stale: s, challenged: s, withdrawn: s, recompute: s, human_review: s, subscription: s });

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof Error && e.message === 'the call should have been refused') throw e;
  const code = (e as { code?: string }).code ?? null;
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), code, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};

/* ───────────── the routes (in process) ───────────── */
const G = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'graph');
const readCase = async (as: AuthenticatedPrincipal, caseId: string) => ((await ctl.read(G(as, 'graph.read', 'COR', caseId), T(), D(), caseId, { payload: { check: false } })) as { closure: Row }).closure;
const listCases = (as: AuthenticatedPrincipal) => ctl.list(G(as, 'graph.read', 'COR'), T(), D(), { payload: { limit: 200 } });
/** THE NARROW READ (B82-F cc): the caller's own obligations, optionally of one case. */
const obligationsOf = async (as: AuthenticatedPrincipal, caseId: string | null = null): Promise<Row> => {
  const route = (ctl as unknown as { obligations?: (...a: unknown[]) => Promise<{ obligations: Row }> }).obligations;
  if (typeof route !== 'function') throw new Error('there is no obligation read: ClosureB50Controller.obligations does not exist (POST …/graph/closure/obligations)');
  return (await route.call(ctl, G(as, 'graph.closure.obligation.read', 'COR', caseId), T(), D(), { payload: caseId === null ? {} : { caseId } })).obligations;
};
const list = (a: Row) => (a['obligations'] as Row[]);
const ack = (as: AuthenticatedPrincipal, caseId: string, payload: Row) => ctl.acknowledge(G(as, 'graph.closure.acknowledge', 'COR', caseId), T(), D(), caseId, { payload }) as Promise<{ acknowledgement: Row }>;
const except = (as: AuthenticatedPrincipal, caseId: string, payload: Row) => ctl.except(G(as, 'graph.closure.except', 'COR', caseId), T(), D(), caseId, { payload }) as Promise<{ exception: Row }>;
const declare = (as: AuthenticatedPrincipal, payload: Row) => ctl.declare(G(as, 'graph.closure.contract.declare', 'CCT'), T(), D(), { payload }) as Promise<{ contract: Row }>;
const sweep = (as: AuthenticatedPrincipal) => ctl.sweep(G(as, 'graph.closure.sweep', 'COR'), T(), D());
const propagate = (as: AuthenticatedPrincipal, payload: Row) =>
  w.graph.propagate(G(as, 'graph.impact.propagate', 'INV', payload['triggerObjectId'] as string), T(), D(), { payload: payload as never }) as Promise<{ impact: Row & { invalidationId: string } }>;
const P = (as: AuthenticatedPrincipal, action: string, id: string | null = null) => h.req(as, action, 'PUB', id, 'decision');

async function applyCorrection(evdIds: string[], reason: string, sourceId: string): Promise<string> {
  const opened = await observation.submitCorrection(h.req(corrector, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
    { payload: { sourceId, kind: 'correction', channel: 'operator re-upload', publisherRef: `fixture ${reason}`, reason, affectedEvdIds: evdIds } }) as { correction: { caseId: string } };
  const caseId = opened.correction.caseId;
  await observation.applyCorrection(h.req(corrector, 'observation.correction.apply', 'COR', caseId, 'observation'), T(), D(), caseId,
    { payload: { decision: 'apply', affectedEvdIds: evdIds, reason: `${reason}: verified against the publisher` } });
  return caseId;
}

/** The fields one obligation carries — what the act needs, and nothing else. */
const OBLIGATION_KEYS = ['acts', 'as_owner', 'basis', 'case', 'class', 'closing', 'consumer_kind', 'consumer_ref', 'corrected', 'deadline', 'escalations', 'frozen',
  'latest_act', 'object_type', 'overdue', 'product_id', 'product_kind', 'product_version', 'state', 'title'].sort();

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  pdp = h.app.get(PdpService);
  const { ClosureB50Controller: Cc } = await import('../../src/graph/closure/closure.controller.js');
  const { ObservationController: Oc } = await import('../../src/observation/observation.controller.js');
  const { PublishingController: Pc } = await import('../../src/executive/publishing/publishing.controller.js');
  ctl = h.app.get(Cc); observation = h.app.get(Oc); pubs = h.app.get(Pc);
  corrector = await h.humanWithSession(['collection_manager'], 'b82fcc-corrector');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b82fcc-domain-admin');
  strategist = await h.humanWithSession(['strategy_owner'], 'b82fcc-strategist');
  drafter = await h.humanWithSession(['executive_operator'], 'b82fcc-operator');
  analyst = await h.humanWithSession(['domain_analyst'], 'b82fcc-analyst');
  bystander = await h.humanWithSession(['privacy_officer'], 'b82fcc-bystander');
  retentionSteward = await h.humanWithSession(['retention_steward'], 'b82fcc-retention');

  // the package whose reroute option cites w.evd (proposed; owned by the decision owner), its report publication drafted by the operator
  const p = await c.proposed();
  PKG = p.pkg; PV = p.v;
  const dpk = await one(sql`select content_digest from objects.canonical_objects where object_type = 'DPK' and object_id = ${PKG}::uuid and object_version = ${PV}`);
  const d = (await pubs.draft(P(drafter, 'executive.publication.draft'), T(), D(), { payload: {
    title: 'Board note — the Cape reroute (SYNTHETIC)', sourceKind: 'report', sourceId: PKG, sourceVersion: PV, sourceDigest: String(dpk['content_digest']),
    audience: { roles: ['executive'], recipients: [] }, classification: 'internal', channels: ['in_app'], format: 'md', accessibility: { plain_language: true, alt_text_present: true },
    template: 'board-pack@1', external: null } }) as unknown as { publication: Row }).publication;
  PUB = String(d['publication_id']);
  const ev = await one(sql`select provenance_ref from objects.canonical_objects where object_id = ${w.evd.id}::uuid and object_version = ${w.evd.version}`);
  SERIES_SOURCE = String(ev['provenance_ref']).replace(/^SRC:/, '').replace(/@.*$/, '');
  // the stall class routed to the owner (the escalation instants the read answers)
  await w.exec.publishAttentionPolicy(h.req(w.executive, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { reason: 'the correction-propagation stall class for the B82-F cc harness', rules: { classes: {
    correction_propagation_stall: { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['domain_admin'], escalate_to_roles: ['collection_manager'], max_escalations: 2, ack_within_minutes: 240 } } } } as never });
  // the case: w.evd corrected and walked (its products classed; the owners recorded)
  CASE = await applyCorrection([w.evd.id], 'restated transits (B82-F cc harness)', SERIES_SOURCE);
  await propagate(strategist, { triggerKind: 'evidence_correction', triggerObjectId: w.evd.id, correctionCaseId: CASE });
  // a second open case on another object (another case: nothing of it is the operator's unless the walk says so)
  CASE2 = await applyCorrection([w.records.inv.id], 'a second restatement (B82-F cc harness)', w.uploadSourceId);
  await propagate(strategist, { triggerKind: 'evidence_correction', triggerObjectId: w.records.inv.id, correctionCaseId: CASE2 });
}, 900_000);
afterAll(async () => { await h?.close(); });

describe('r · the reproduction: the owners cannot reach the case; the narrow read answers their own obligation', () => {
  it('the decision owner and the executive operator are refused the case read (graph.read, 403) — the full read lists them as the owners', async () => {
    const full = await readCase(analyst, CASE);
    const cons = full['consumers'] as Row[];
    expect(cons.find((x) => x['consumer_ref'] === `DPK:${PKG}@${PV}`)).toMatchObject({ class: 'human_review', owner: w.owner.principalId, state: 'pending' });
    expect(cons.find((x) => x['consumer_ref'] === `PUB:${PUB}@1`)).toMatchObject({ class: 'stale', owner: drafter.principalId, state: 'pending' });
    for (const p of [w.owner, drafter]) expect((await refusal(readCase(p, CASE))).status).toBe(403);
  });
  it('the narrow read answers the decision owner exactly their human review, and the operator exactly their publication — with the acts they may take', async () => {
    const mine = await obligationsOf(w.owner, CASE);
    expect(mine).toMatchObject({ schema: 'eye.correction-obligations/1', principal: w.owner.principalId, count: 1 });
    const o = list(mine)[0]!;
    expect(o).toMatchObject({ consumer_ref: `DPK:${PKG}@${PV}`, class: 'human_review', state: 'pending', as_owner: true, basis: 'the accountable owner', closing: false });
    expect(o['case']).toMatchObject({ case_id: CASE, kind: 'correction', closure_state: 'open', reason: 'restated transits (B82-F cc harness)' });
    expect((o['corrected'] as Row[]).map((x) => x['object_id'])).toEqual([w.evd.id]);
    expect(o['acts']).toMatchObject({ acknowledge: { allowed: true }, recompute: { allowed: false }, except: { allowed: true } });
    expect(String((o['acts'] as Row & { recompute: Row }).recompute['reason'])).toMatch(/never recomputed/);
    const op = await obligationsOf(drafter, CASE);
    expect(list(op).map((x) => x['consumer_ref'])).toEqual([`PUB:${PUB}@1`]);
    expect(list(op)[0]).toMatchObject({ class: 'stale', as_owner: true, acts: { acknowledge: { allowed: true }, recompute: { allowed: true }, except: { allowed: true } } });
  });
});

describe('n · narrow: only the caller\'s obligations, only what the act needs', () => {
  it('the answer carries exactly the act\'s fields — never the walk\'s path, the notice, another consumer, the freezes ledger or any evidence content', async () => {
    const a = await obligationsOf(w.owner);
    expect(Object.keys(a).sort()).toEqual(['as_of', 'case_filter', 'contract_version', 'count', 'obligations', 'principal', 'schema', 'statement'].sort());
    for (const o of list(a)) {
      expect(Object.keys(o).sort()).toEqual(OBLIGATION_KEYS);
      expect(Object.keys(o['case'] as Row).sort()).toEqual(['applied_at', 'case_id', 'closure_state', 'kind', 'reason', 'received_at']);
      for (const x of o['corrected'] as Row[]) expect(Object.keys(x).sort()).toEqual(['from_version', 'object_id', 'to_version']);
    }
    const text = JSON.stringify(a);
    expect(text).not.toContain(drafter.principalId);
    expect(text).not.toContain(`PUB:${PUB}`);
    expect(text).not.toMatch(/"path"|"notice"|"events"|"freezes"|"payload"|"bytes"|"segment"/);
  });
  it('every obligation listed is the caller\'s as the existing ports decide — set-equal to the full read\'s consumers they answer for, over every open case', async () => {
    for (const p of [w.owner, drafter]) {
      const theirs: string[] = [];
      for (const k of [CASE, CASE2]) {
        for (const x of (await readCase(analyst, k))['consumers'] as Row[]) if (x['material'] === true && x['owner'] === p.principalId) theirs.push(`${k}|${String(x['consumer_ref'])}`);
      }
      const listed = list(await obligationsOf(p)).map((o) => `${String((o['case'] as Row)['case_id'])}|${String(o['consumer_ref'])}`);
      expect(listed.sort(), p.principalId).toEqual(theirs.sort());
    }
    // one case asked: only that case's
    expect(list(await obligationsOf(drafter, CASE2)).every((o) => (o['case'] as Row)['case_id'] === CASE2)).toBe(true);
    // a case of nobody's, or none at all: an empty answer (no existence oracle)
    expect(await obligationsOf(drafter, uuidv7())).toMatchObject({ count: 0, obligations: [] });
  });
  it('a principal with no obligation sees nothing; a role outside the acknowledge / except rule is refused the read even when it holds graph.read', async () => {
    expect(await obligationsOf(bystander)).toMatchObject({ count: 0, obligations: [] });
    expect((await refusal(obligationsOf(retentionSteward))).status).toBe(403);
    // the retention steward still reads the case (graph.read): the narrow read is not an alias of it
    expect((await readCase(retentionSteward, CASE))['tracked']).toBe(true);
  });
  it('THE PDP: one exact rule whose roles are the acknowledge rule\'s; nobody gained graph.read; the decision roles still refused it', async () => {
    const ctx = { scope: 'DOMAIN' as const, tenantId: T(), domainId: D() };
    const decide = (role: string, action: string) => pdp.evaluate({ principal: { principalId: uuidv7(), kind: 'human', assurance: 'password', bindings: [{ roleCode: role, scope: 'DOMAIN', tenantId: T(), domainId: D() }] },
      delegationId: null, action, objectType: 'COR', objectId: null, purposeId: 'graph', context: ctx as never, consequenceClass: 'C1', environment: { deployment: 'local-dev', clockQuality: 'trusted' } }).decision;
    const allowed = (d: string) => d === 'allow' || d === 'allow_with_obligations';
    const ROLES = ['domain_admin', 'domain_analyst', 'domain_specialist', 'collection_manager', 'extraction_manager', 'resolution_manager', 'strategy_owner', 'forecast_owner',
      'twin_owner', 'simulation_operator', 'knowledge_owner', 'record_authority', 'ontology_steward', 'data_steward', 'method_steward', 'decision_owner', 'decision_approver',
      'decision_authority', 'executive', 'executive_operator', 'risk_owner', 'privacy_officer', 'retention_steward', 'decision_agent', 'resolution_agent', 'board_member'];
    for (const role of ROLES) {
      expect(allowed(decide(role, 'graph.closure.obligation.read')), role).toBe(allowed(decide(role, 'graph.closure.acknowledge')));
      expect(allowed(decide(role, 'graph.closure.obligation.read')), role).toBe(allowed(decide(role, 'graph.closure.except')));
    }
    for (const role of ['executive', 'executive_operator', 'decision_approver', 'decision_owner']) expect(allowed(decide(role, 'graph.read')), role).toBe(false);
    // exact: a longer name is no rule's
    expect(allowed(decide('decision_owner', 'graph.closure.obligation.read.all'))).toBe(false);
  });
  it('THE PORT re-checks the bound action and the acting principal (a context bound to graph.read, an actor not the session\'s)', async () => {
    const cap = (await import('../../src/graph/closure/closure.capabilities.js')).ClosureCapability as unknown as Record<string, (tx: unknown, a: string) => Record<string, (x: Row) => Promise<Row>>>;
    expect(typeof cap['obligations']).toBe('function');
    // the raw port outside its bound action: refused by the database itself
    const r = await refusal(sql`select graph.correction_obligations(${T()}::uuid, ${D()}::uuid, ${w.owner.principalId}::uuid, null::uuid) r`.execute(h.su));
    expect(r.message).toMatch(/context is bound to action <none>|bound to action/);
    const grants = await one(sql`select has_function_privilege('eye_app', 'graph.correction_obligations(uuid, uuid, uuid, uuid)', 'EXECUTE') app,
      has_function_privilege('eye_commit', 'graph.correction_obligations(uuid, uuid, uuid, uuid)', 'EXECUTE') commit,
      (select prosecdef from pg_proc where oid = 'graph.correction_obligations(uuid, uuid, uuid, uuid)'::regprocedure) definer,
      (select array_to_string(proconfig, ',') from pg_proc where oid = 'graph.correction_obligations(uuid, uuid, uuid, uuid)'::regprocedure) cfg`);
    expect(grants).toMatchObject({ app: false, commit: true, definer: true });
    expect(String(grants['cfg'])).toMatch(/pg_catalog, pg_temp$/);
  });
});

describe('s · still refused to the owners: the case, its graph, the evidence, another consumer, another case', () => {
  it('the case read, the case list and the evidence (its detail and its bytes) stay refused to both owners', async () => {
    for (const p of [w.owner, drafter]) {
      expect((await refusal(readCase(p, CASE))).status).toBe(403);
      expect((await refusal(readCase(p, CASE2))).status).toBe(403);
      expect((await refusal(listCases(p))).status).toBe(403);
      expect((await refusal(observation.getEvidence(h.req(p, 'observation.read.evidence', 'EVD', w.evd.id, 'observation'), T(), D(), w.evd.id, { payload: {} }))).status).toBe(403);
      expect((await refusal(observation.downloadEvidence(h.req(p, 'observation.evidence.retrieve', 'EVD', w.evd.id, 'observation'), T(), D(), w.evd.id))).status).toBe(403);
    }
  });
  it('another consumer\'s act is refused by the EXISTING port (authority); another case\'s act names no consumer of theirs', async () => {
    const r1 = await refusal(ack(drafter, CASE, { consumerRef: `DPK:${PKG}@${PV}`, note: 'the operator tries the owner\'s review (B82-F cc harness)' }));
    expect(r1.message).toMatch(/^correction closure rejected \(authority\): .* is owned by .*; its owner closes it/);
    expect(r1.status).toBe(403);
    const r2 = await refusal(except(w.owner, CASE, { consumerRef: `PUB:${PUB}@1`, reason: 'the owner tries the operator\'s publication (B82-F cc harness)', expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), ownerPrincipalId: w.owner.principalId }));
    expect(r2.message).toMatch(/^correction closure rejected \(authority\)/);
    // another case: a consumer of it that is not theirs is refused (authority); a product it never reached names no consumer (unknown_consumer)
    const others = ((await readCase(analyst, CASE2))['consumers'] as Row[]).filter((x) => x['material'] === true && x['owner'] !== drafter.principalId && x['consumer_kind'] === 'affected_product');
    expect(others.length).toBeGreaterThan(0);
    const r3 = await refusal(ack(drafter, CASE2, { consumerRef: String(others[0]!['consumer_ref']), note: 'a consumer of another case, not mine (B82-F cc harness)' }));
    expect(r3.message).toMatch(/^correction closure rejected \((authority|separation_of_duties)\)/);
    expect(r3.status).toBe(403);
    const r4 = await refusal(ack(drafter, CASE2, { consumerRef: `PUB:${uuidv7()}@1`, note: 'a product the case never reached (B82-F cc harness)' }));
    expect(r4.message).toMatch(/^correction closure rejected \(unknown_consumer\)/);
    // and the narrow read lists none of another owner's consumers of that case
    const listed = list(await obligationsOf(drafter, CASE2)).map((o) => o['consumer_ref']);
    for (const x of others) expect(listed).not.toContain(x['consumer_ref']);
  });
});

describe('c · completed through the EXISTING ports; the read answers the new state', () => {
  it('after a stall the read answers the escalation instants of the caller\'s own consumer', async () => {
    await declare(domainAdmin, { windows: WINDOWS(2), exceptionMaxDays: 30, synthetic: true, statement: 'a two-second SYNTHETIC demonstration window per class (B82-F cc harness)' });
    await sql`select pg_sleep(2.5)`.execute(h.su);
    await sweep(corrector);
    const o = list(await obligationsOf(w.owner, CASE))[0]!;
    expect(o).toMatchObject({ overdue: true, frozen: true, case: { closure_state: 'stalled' } });
    const items = o['escalations'] as Row[];
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ state: 'open' });
    expect(items[0]!['due_at']).not.toBeNull();
    expect(((o['acts'] as Row)['except'] as Row)).toMatchObject({ allowed: true, exception_max_days: 30, record_authority_owner_required: false });
  });
  it('the decision owner acknowledges the review, the operator excepts the publication — through the existing routes; the read then answers no act left', async () => {
    const a = (await ack(w.owner, CASE, { consumerRef: `DPK:${PKG}@${PV}`, note: 'reviewed: the reroute still holds on the restated transits (B82-F cc harness)' })).acknowledgement;
    expect(a).toMatchObject({ state: 'acknowledged', recorded_by: w.owner.principalId, basis: 'the accountable owner' });
    const e = (await except(drafter, CASE, { consumerRef: `PUB:${PUB}@1`, reason: 'the board note is reissued next week (B82-F cc harness)', expiresAt: new Date(Date.now() + 3 * 86_400_000).toISOString(), ownerPrincipalId: drafter.principalId })).exception;
    expect(e).toMatchObject({ state: 'bounded_exception', recorded_by: drafter.principalId });
    const o = list(await obligationsOf(w.owner, CASE))[0]!;
    expect(o).toMatchObject({ state: 'acknowledged', closing: true, latest_act: { state: 'acknowledged', by_you: true }, acts: { acknowledge: { allowed: false }, except: { allowed: false } } });
    const p = list(await obligationsOf(drafter, CASE))[0]!;
    expect(p).toMatchObject({ state: 'bounded_exception', closing: true, latest_act: { state: 'bounded_exception', by_you: true }, acts: { except: { allowed: true } } });
    // still nothing wider: the case remains refused to them
    expect((await refusal(readCase(drafter, CASE))).status).toBe(403);
  });
});
