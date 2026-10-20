/**
 * CP-6 B50 §CL (migration 0120_b50_x_cl) — CORRECTION-PROPAGATION CLOSURE: ACKNOWLEDGEMENT, FREEZE AND ESCALATION, through the real database,
 * the PDP and the controllers, on the decision world (phase6-fixtures' bootDecisionWorld) with a proposed decision package whose reroute option
 * cites the series evidence w.evd, a drafted report PUBLICATION of that package, and an EXPORT PACKAGE that shipped the evidence's manifest:
 *
 *   s  THE SCHEMA: the four ledgers forced under RLS, no write grant, append-only where the rows say so; the attention vocabulary carries
 *      correction_propagation_stall and knowledge_challenge_overdue; the hook objects.publication_frozen still STABLE and invoker.
 *   o  THE RECORD OPENS AT THE APPLY (V03-T-297, ES-30-005): an applied case is OPEN — correction_current.closed_at is the apply instant, the
 *      closure state is open, not closed.
 *   k  THE CONTRACT (DF-12, D8): declared and versioned by the domain administrator; the PDP and the PORT refuse anyone else; malformed windows,
 *      an unflagged sub-hour window and an unchanged version refused.
 *   c  THE CONSUMERS (V03-T-301, DP-24-002, PR-24-002): per affected product (§CI's classes, owners) and per subscription consumer; the read is
 *      the case's identity, authority, target versions, reason, effective time, impacted graph, propagation state and each acknowledgement.
 *   f  THE STALL AND THE FREEZE (DF-12, DP-24-005, D7, D8): within the window nothing stalls; a FAILED delivery stalls at once (recorded as a
 *      failed consumer, routed to the subscription's owner); a window passed on the DATABASE clock routes every overdue consumer to its owner as
 *      correction_propagation_stall; the case's open products freeze; publication approval of the frozen package is REFUSED (held); the reach
 *      (the object, what reached it through the frozen product, a package option citing it); the item escalates past its deadline.
 *   a  THE ACKNOWLEDGEMENTS (PR-24-003, V03-T-300, DP-24-006): the correction authority never acknowledges a human review; a non-owner never
 *      acknowledges another's product; a human review is never recomputed; a recompute names a real later record (the export AMENDMENT);
 *      a bounded exception has a reason, an expiry within the contract and an owner; under a legal hold its owner is a record authority.
 *   x  THE CLOSURE (ES-30-005, V03-T-297, HX-18): refused while a consumer is open (the reasons named); then closed by the correction authority
 *      with the projections reconciled — the record lists every consumer, the failed delivery, the residual exposure, every acknowledgement and
 *      its audit digest (the sha256 of the record, recomputed here); the freezes lift; the stall items close; the publication approves.
 *   m  MET-010 v2 (DQM-020): registered as version 2; the closed case measured to the CLOSURE instant; an open case censored.
 *   d  THE ADOPT ACT (D9): an older applied case is LISTED, never adopted by itself; adopted by the correction authority's act (once); it does
 *      not close while its impact scope is unknown.
 *   t  THE TICK (D8): the attention agent's tick runs the step `correction-closure` under executive.attention.tick.
 *   v  RE-VERIFIED (V03-T-300, MS-06, DCN-09, PR-24-005): the human decision and the evidence's first version unchanged by any of it.
 *
 * SYNTHETIC throughout. STATED SUPERUSER MOVES (fixture rows read by the ports, never a row under test): one export package + its executed
 * manifest scope item (and its amendment), one subscription + one failed delivery of the case's GraphChanged event, one attention item's
 * deadline moved into the past (the escalation's precondition), one pre-B50 applied case (its trigger skipped), one legal hold; and the
 * in-memory role of one principal forged (no database binding) to prove the PORT re-checks the role the PDP admitted.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import type { ClosureB50Controller } from '../../src/graph/closure/closure.controller.js';
import type { ObservationController } from '../../src/observation/observation.controller.js';
import type { PublishingController } from '../../src/executive/publishing/publishing.controller.js';
import { AttentionTickRegistry } from '../../src/executive/attention/tick.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { CORRECTION_CLOSURE_ORDER, CORRECTION_CLOSURE_STEP } from '../../src/graph/closure/closure.service.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, type DecisionWorld } from './phase6-fixtures.js';

// this file's own vault roots and signing key (the publication's approval signs by reference)
const VAULT_DIR = realpathSync(mkdtempSync(join(tmpdir(), 'eye-b50-closure-vault-')));
process.env['EYE_VAULT_QUARANTINE_ROOT'] = join(VAULT_DIR, 'quarantine');
process.env['EYE_VAULT_EVIDENCE_ROOT'] = join(VAULT_DIR, 'evidence');
process.env['EYE_VAULT_ARCHIVE_ROOT'] = join(VAULT_DIR, 'archive');
process.env['EYE_VAULT_EXPORT_ROOT'] = join(VAULT_DIR, 'export');
process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = generateKeyPairSync('ed25519').privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

type Row = Record<string, unknown>;
let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let ctl: ClosureB50Controller; let observation: ObservationController; let pubs: PublishingController;
let corrector: AuthenticatedPrincipal; let domainAdmin: AuthenticatedPrincipal; let strategist: AuthenticatedPrincipal; let drafter: AuthenticatedPrincipal;
let recordAuth: AuthenticatedPrincipal; let subOwner: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal;
let twinOwner: AuthenticatedPrincipal; let operatorP: AuthenticatedPrincipal;
/** What the cases leave one another. */
let PKG = ''; let PV = 0; let PUB = ''; let PUB_DIGEST = ''; let EXPORT = ''; let MANIFEST = ''; let SERIES_SOURCE = ''; let CASE = ''; let SUB = ''; let OLD_CASE = '';
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const hex = (s: string) => createHash('sha256').update(s).digest('hex');
const DAY = 86_400;
const WINDOWS = (s: number) => ({ stale: s, challenged: s, withdrawn: s, recompute: s, human_review: s, subscription: s });

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal; the raw SQLSTATE and text beside it. */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; code: string | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof Error && e.message === 'the call should have been refused') throw e;
  const code = (e as { code?: string }).code ?? null;
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, code, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), code, message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
/** A port refusal in the class form: its text and SQLSTATE; the HTTP status once the integrator maps the noun (null until then — never a wrong one). */
const portRefused = async (p: Promise<unknown>, re: RegExp, sqlstate: string, status: number) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  if (r.code !== null) expect(r.code, r.message).toBe(sqlstate);
  expect([null, status], r.message).toContain(r.status);
  return r;
};

/* ───────────── the routes (in process) ───────────── */
const G = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null = null) => h.req(as, action, type, id, 'graph');
const readCase = async (as: AuthenticatedPrincipal, caseId: string, check = false) => ((await ctl.read(G(as, 'graph.read', 'COR', caseId), T(), D(), caseId, { payload: { check } })) as { closure: Row }).closure;
const listCases = async (as: AuthenticatedPrincipal) => ((await ctl.list(G(as, 'graph.read', 'COR'), T(), D(), { payload: { limit: 200 } })) as { cases: Row[] }).cases;
const declare = (as: AuthenticatedPrincipal, payload: Row) => ctl.declare(G(as, 'graph.closure.contract.declare', 'CCT'), T(), D(), { payload }) as Promise<{ contract: Row }>;
const ack = (as: AuthenticatedPrincipal, caseId: string, payload: Row) => ctl.acknowledge(G(as, 'graph.closure.acknowledge', 'COR', caseId), T(), D(), caseId, { payload }) as Promise<{ acknowledgement: Row }>;
const except = (as: AuthenticatedPrincipal, caseId: string, payload: Row) => ctl.except(G(as, 'graph.closure.except', 'COR', caseId), T(), D(), caseId, { payload }) as Promise<{ exception: Row }>;
const freeze = (as: AuthenticatedPrincipal, caseId: string, payload: Row) => ctl.freeze(G(as, 'graph.closure.freeze', 'COR', caseId), T(), D(), caseId, { payload }) as Promise<{ freeze: Row }>;
const lift = (as: AuthenticatedPrincipal, freezeId: string, reason: string) => ctl.lift(G(as, 'graph.closure.freeze.lift', 'CFZ', freezeId), T(), D(), freezeId, { payload: { reason } }) as Promise<{ freeze: Row }>;
const close = (as: AuthenticatedPrincipal, caseId: string, statement: string) => ctl.close(G(as, 'graph.closure.close', 'COR', caseId), T(), D(), caseId, { payload: { statement } }) as Promise<{ closure: Row }>;
const adopt = (as: AuthenticatedPrincipal, caseId: string, reason: string) => ctl.adopt(G(as, 'graph.closure.adopt', 'COR', caseId), T(), D(), caseId, { payload: { reason } }) as Promise<{ closure: Row }>;
const sweep = async (as: AuthenticatedPrincipal) => ((await ctl.sweep(G(as, 'graph.closure.sweep', 'COR'), T(), D())) as { sweep: Row }).sweep;
const propagate = (as: AuthenticatedPrincipal, payload: Row) =>
  w.graph.propagate(G(as, 'graph.impact.propagate', 'INV', payload['triggerObjectId'] as string), T(), D(), { payload: payload as never }) as Promise<{ impact: Row & { invalidationId: string } }>;
const P = (as: AuthenticatedPrincipal, action: string, id: string | null = null) => h.req(as, action, 'PUB', id, 'decision');
const approvePub = (as: AuthenticatedPrincipal, id: string, v: number, digest: string) => pubs.approve(P(as, 'executive.publication.approve', id), T(), D(), id, String(v), { payload: { digest } }) as unknown as Promise<{ approval: Row }>;
const consumers = (r: Row) => (r['consumers'] as Row[]);
const consumer = (r: Row, ref: string) => consumers(r).find((x) => x['consumer_ref'] === ref);
const frozen = async (type: string, id: string, version: number | null) => one(sql`select f.frozen, f.case_id::text from objects.publication_frozen(${type}, ${id}::uuid, ${version}::int) f`);
const dbSleep = async (seconds: number) => { await sql`select pg_sleep(${seconds})`.execute(h.su); };

/** A correction of the given evidence (of the series source), submitted and applied through the routes by the correction authority. */
async function applyCorrection(evdIds: string[], reason: string, sourceId = SERIES_SOURCE): Promise<string> {
  const opened = await observation.submitCorrection(h.req(corrector, 'observation.correction.receive', 'COR', null, 'observation'), T(), D(),
    { payload: { sourceId, kind: 'correction', channel: 'operator re-upload', publisherRef: `fixture ${reason}`, reason, affectedEvdIds: evdIds } }) as { correction: { caseId: string } };
  const caseId = opened.correction.caseId;
  await observation.applyCorrection(h.req(corrector, 'observation.correction.apply', 'COR', caseId, 'observation'), T(), D(), caseId,
    { payload: { decision: 'apply', affectedEvdIds: evdIds, reason: `${reason}: verified against the publisher` } });
  return caseId;
}

/** The principals the harness can act as, by id (the owners the walk recorded). */
const actors = new Map<string, AuthenticatedPrincipal>();

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  const { ClosureB50Controller: Cc } = await import('../../src/graph/closure/closure.controller.js');
  const { ObservationController: Oc } = await import('../../src/observation/observation.controller.js');
  const { PublishingController: Pc } = await import('../../src/executive/publishing/publishing.controller.js');
  ctl = h.app.get(Cc); observation = h.app.get(Oc); pubs = h.app.get(Pc);
  corrector = await h.humanWithSession(['collection_manager'], 'b50cl-corrector');
  domainAdmin = await h.humanWithSession(['domain_admin'], 'b50cl-domain-admin');
  strategist = await h.humanWithSession(['strategy_owner'], 'b50cl-strategist');
  drafter = await h.humanWithSession(['executive_operator'], 'b50cl-operator');
  recordAuth = await h.humanWithSession(['record_authority'], 'b50cl-record');
  subOwner = await h.humanWithSession(['domain_analyst'], 'b50cl-sub-owner');
  analyst = await h.humanWithSession(['domain_analyst'], 'b50cl-analyst');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b50cl-tenant-admin', 'TENANT');
  twinOwner = await h.openSession(w.twinOwner);
  operatorP = await h.openSession(w.operator);
  for (const p of [corrector, domainAdmin, strategist, drafter, recordAuth, subOwner, analyst, twinOwner, operatorP, w.owner, w.approver, w.approver2, w.authority, w.authority2, w.executive]) actors.set(p.principalId, p);

  // the package whose reroute option cites w.evd (proposed), its report publication drafted by the operator
  const p = await c.proposed();
  PKG = p.pkg; PV = p.v;
  const dpk = await one(sql`select content_digest from objects.canonical_objects where object_type = 'DPK' and object_id = ${PKG}::uuid and object_version = ${PV}`);
  const d = (await pubs.draft(P(drafter, 'executive.publication.draft'), T(), D(), { payload: {
    title: 'Board note — the Cape reroute (SYNTHETIC)', sourceKind: 'report', sourceId: PKG, sourceVersion: PV, sourceDigest: String(dpk['content_digest']),
    audience: { roles: ['executive'], recipients: [] }, classification: 'internal', channels: ['in_app'], format: 'md', accessibility: { plain_language: true, alt_text_present: true },
    template: 'board-pack@1', external: null } }) as unknown as { publication: Row }).publication;
  PUB = String(d['publication_id']); PUB_DIGEST = String(d['bytes_digest']);
  const ev = await one(sql`select payload ->> 'manifest_id' m, provenance_ref from objects.canonical_objects where object_id = ${w.evd.id}::uuid and object_version = ${w.evd.version}`);
  MANIFEST = String(ev['m']);
  SERIES_SOURCE = String(ev['provenance_ref']).replace(/^SRC:/, '').replace(/@.*$/, '');
  // STATED SUPERUSER MOVE — the export package that shipped the evidence's manifest (the walk reads it; recompute = its amendment)
  EXPORT = uuidv7();
  await sql`insert into retention.export_packages (action_id, scope, tenant_id, domain_id, destination, locator_prefix, scope_digest, approval_id, classification_ceiling, object_count, byte_total, manifest_digest, package_digest, signature, built_by, correlation_id)
    values (${EXPORT}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'export', ${`${T()}/${D()}/${EXPORT}/`}, ${hex('scope')}, ${uuidv7()}::uuid, 'internal', 1, 1024, ${hex('m')}, ${hex('p')}, '{"scheme":"eye-digest-chain/1"}'::jsonb, ${recordAuth.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  await sql`insert into retention.scope_items (item_id, scope, tenant_id, domain_id, action_id, item_kind, ref, dependency_order, disposition)
    values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${EXPORT}::uuid, 'manifest', ${MANIFEST}, 0, 'execute')`.execute(h.su);
  // the attention policy names the stall class (routed to the owner; the domain administrators when nobody owns it)
  await w.exec.publishAttentionPolicy(h.req(w.executive, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: { reason: 'the correction-propagation stall class for the closure harness', rules: { classes: {
    correction_propagation_stall: { materiality: { min_consequence: 'C2', min_confidence: 0.5 }, route_roles: ['domain_admin'], escalate_to_roles: ['collection_manager'], max_escalations: 2, ack_within_minutes: 240 } } } } as never });
}, 900_000);
afterAll(async () => { try { await h?.app.get(SchedulerService).unscheduleAttentionTick(T(), D()); } catch { /* none */ } await h?.close(); });

describe('s · the schema and the vocabulary', () => {
  it('the ledgers are forced under RLS with SELECT only; the acknowledgements, events and contracts are append-only; the hook is still STABLE and invoker', async () => {
    for (const t of ['closure_contracts', 'correction_closures', 'correction_closure_events', 'consumer_acknowledgements', 'publication_freezes']) {
      const r = await one(sql`select c.relrowsecurity rls, c.relforcerowsecurity f, has_table_privilege('eye_commit', c.oid, 'INSERT') ins, has_table_privilege('eye_app', c.oid, 'SELECT') sel
        from pg_class c where c.oid = ${`graph.${t}`}::regclass`);
      expect(r, t).toEqual({ rls: true, f: true, ins: false, sel: true });
    }
    const hook = await one(sql`select provolatile v, prosecdef d, array_to_string(proconfig, ',') cfg, has_function_privilege('eye_commit', oid, 'EXECUTE') x from pg_proc where oid = 'objects.publication_frozen(text, uuid, integer)'::regprocedure`);
    expect(hook).toEqual({ v: 's', d: false, cfg: 'search_path=objects, pg_catalog, pg_temp', x: false });
    const classes = (await one(sql`select executive.attention_signal_classes() c`))['c'] as string[];
    expect(classes).toEqual(expect.arrayContaining(['correction_propagation_stall', 'knowledge_challenge_overdue', 'governance.ownership', 'forecast.unfit']));
    expect(await frozen('BRF', uuidv7(), 1)).toEqual({ frozen: false, case_id: null });
  });
});

describe('o · the closure record opens at the apply; an applied case is not closed', () => {
  it('the correction applied and walked: its closure record OPEN from the apply instant; closed_at on the case is the apply, the closure state open', async () => {
    CASE = await applyCorrection([w.evd.id], 'restated transits (B50 §CL harness)');
    const r = (await propagate(strategist, { triggerKind: 'evidence_correction', triggerObjectId: w.evd.id, correctionCaseId: CASE })).impact;
    expect(r.invalidationId).toBeTruthy();
    const cs = await one(sql`select state, closed_at, propagation_state from observation.correction_current where case_id = ${CASE}::uuid`);
    expect(cs['state']).toBe('applied');
    expect(cs['closed_at']).not.toBeNull();
    const x = await one(sql`select state, opened_via, opened_at from graph.correction_closures where case_id = ${CASE}::uuid`);
    expect(x).toMatchObject({ state: 'open', opened_via: 'applied' });
    expect((x['opened_at'] as Date).toISOString()).toBe((cs['closed_at'] as Date).toISOString());
    const listed = (await listCases(analyst)).find((k) => k['case_id'] === CASE)!;
    expect(listed).toMatchObject({ case_state: 'applied', closure_state: 'open' });
    const ev = await rows(sql`select event from graph.correction_closure_events where case_id = ${CASE}::uuid`);
    expect(ev.map((e) => e['event'])).toEqual(['closure.opened']);
  });
});

describe('k · the closure contract (declared, versioned)', () => {
  it('POSITIVE: the domain administrator declares version 1 (a day per class, not synthetic)', async () => {
    const k = (await declare(domainAdmin, { windows: WINDOWS(DAY), exceptionMaxDays: 30, synthetic: false, statement: 'a day for every consumer class to acknowledge a correction (B50 harness, SYNTHETIC)' })).contract;
    expect(k).toMatchObject({ version: 1, exception_max_days: 30, synthetic: false, repeated: false, declared_by: domainAdmin.principalId });
    expect(String(k['contract_digest'])).toMatch(/^[0-9a-f]{64}$/);
  });
  it('REFUSAL: the PDP refuses a non-administrator; the PORT refuses a forged in-memory role; malformed and unflagged windows; an unchanged version', async () => {
    expect((await refusal(declare(analyst, { windows: WINDOWS(DAY), exceptionMaxDays: 30, synthetic: false, statement: 'an analyst cannot declare the contract (B50 harness)' }))).status).toBe(403);
    const forged = { ...analyst, bindings: [...analyst.bindings, { roleCode: 'domain_admin', scope: 'DOMAIN' as const, tenantId: T(), domainId: D() }] } as AuthenticatedPrincipal;
    await portRefused(declare(forged, { windows: WINDOWS(2 * DAY), exceptionMaxDays: 30, synthetic: false, statement: 'a forged role is re-checked by the port (B50 harness)' }),
      /^correction closure rejected \(authority\): a closure contract is declared by the domain administrator/, '42501', 403);
    await portRefused(declare(domainAdmin, { windows: { stale: 60 }, exceptionMaxDays: 30, synthetic: true, statement: 'a window for one class only (B50 harness)' }),
      /^correction closure rejected \(windows\): every consumer class has its window/, '22023', 422);
    await portRefused(declare(domainAdmin, { windows: { ...WINDOWS(DAY), urgent: 5 }, exceptionMaxDays: 30, synthetic: false, statement: 'an unknown consumer class (B50 harness)' }),
      /^correction closure rejected \(windows\): urgent is not a consumer class/, '22023', 422);
    await portRefused(declare(domainAdmin, { windows: WINDOWS(60), exceptionMaxDays: 30, synthetic: false, statement: 'a one-minute window not declared synthetic (B50 harness)' }),
      /^correction closure rejected \(synthetic\): a window under an hour/, '22023', 422);
    await portRefused(declare(domainAdmin, { windows: WINDOWS(DAY), exceptionMaxDays: 30, synthetic: false, statement: 'the same windows again (B50 harness, SYNTHETIC)' }),
      /^correction closure rejected \(duplicate\): the windows are unchanged from version 1/, '22023', 409);
    expect((await refusal(declare(domainAdmin, { windows: WINDOWS(DAY), exceptionMaxDays: 30, statement: 'no synthetic flag (B50 harness)' }))).status).toBe(422);
    expect(Number((await one(sql`select count(*)::int n from graph.closure_contracts where tenant_id = ${T()}::uuid`))['n'])).toBe(1);
    expect((await refusal(sql`update graph.closure_contracts set exception_max_days = 1`.execute(h.su))).message).toMatch(/append-only/);
  });
});

describe('c · the consumers: per affected product and per subscription consumer', () => {
  it('the case read: identity, authority, target versions, reason, effective time, impacted graph, propagation state and every consumer with its class, owner and deadline', async () => {
    const r = await readCase(analyst, CASE);
    const k = r['case'] as Row;
    expect(k).toMatchObject({ case_id: CASE, kind: 'correction', state: 'applied', applied_by: corrector.principalId, reason: 'restated transits (B50 §CL harness)' });
    expect((k['target_versions'] as Row[]).map((x) => x['object_id'])).toContain(w.evd.id);
    expect(r['tracked']).toBe(true);
    expect((r['scope'] as Row)['walks']).toHaveLength(1);
    const dpk = consumer(r, `DPK:${PKG}@${PV}`)!;
    expect(dpk).toMatchObject({ consumer_kind: 'affected_product', class: 'human_review', material: true, owner: w.owner.principalId, state: 'pending', closing: false, overdue: false, frozen: false });
    expect(dpk['deadline']).not.toBeNull();
    expect(consumer(r, `PUB:${PUB}@1`)).toMatchObject({ class: 'stale', owner: drafter.principalId, state: 'pending' });
    expect(consumer(r, `export_package:${EXPORT}`)).toMatchObject({ class: 'recompute', owner: recordAuth.principalId, state: 'pending' });
    expect((r['readiness'] as Row)['ready']).toBe(false);
    const notice = r['notice'] as Row;
    expect(notice['schema']).toBe('eye.correction-impact-notice/1');
    expect((notice['required_review'] as Row[]).map((x) => x['ref'])).toContain(`DPK:${PKG}@${PV}`);
    expect((notice['decisions'] as Row[]).map((x) => x['ref'])).toContain(`DPK:${PKG}@${PV}`);
    expect(notice['closure']).toMatchObject({ state: 'open' });
  });
  it('within the window nothing stalls, nothing freezes, nobody is paged', async () => {
    const s = await sweep(corrector);
    const mine = (s['swept'] as Row[]).find((x) => x['case_id'] === CASE)!;
    expect(mine).toMatchObject({ state: 'open', stalled: 0, frozen_now: 0, failed_recorded: 0 });
    expect(await frozen('DPK', PKG, PV)).toEqual({ frozen: false, case_id: null });
    expect(Number((await one(sql`select count(*)::int n from executive.attention_items where subject_id = ${CASE}::uuid`))['n'])).toBe(0);
    expect((await refusal(sweep(analyst))).status).toBe(403);
  });
});

describe('f · the stall and the freeze (on the database clock)', () => {
  it('a FAILED delivery of the case\'s change is an immediate stall: recorded as a failed consumer, routed to the subscription\'s owner; the case\'s open products freeze', async () => {
    // STATED SUPERUSER MOVE — a subscription consumer whose delivery of the case's GraphChanged event failed
    const evt = await one(sql`select id::text, created_at from objects.object_outbox where event_type = 'GraphChanged' and payload #>> '{change,correction_case_id}' = ${CASE} order by created_at limit 1`);
    expect(evt['id']).toBeTruthy();
    const live = (await rows(sql`select consumer_kind from graph.subscriptions where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and status <> 'revoked'`)).map((x) => x['consumer_kind']);
    const kind = ['twins', 'forecasts', 'scenarios', 'decisions', 'warnings', 'commitments', 'proposals'].find((k) => !live.includes(k))!;
    SUB = uuidv7();
    await sql`insert into graph.subscriptions (subscription_id, scope, tenant_id, domain_id, consumer_kind, event_types, principal_id, consumer_version, code_digest, owner_principal_id, budgets, created_by, correlation_id)
      values (${SUB}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${kind}, ARRAY['GraphChanged'], ${w.machinePrincipalId}::uuid, '1.0.0', ${hex('consumer')}, ${subOwner.principalId}::uuid,
              '{"max_items_per_event": 50, "max_elapsed_ms": 30000}'::jsonb, ${subOwner.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await sql`insert into graph.subscription_deliveries (event_id, subscription_id, scope, tenant_id, domain_id, consumer_kind, event_type, change_kind, outbox_created_at, state, last_error, finished_at, failure_class, correlation_id)
      values (${String(evt['id'])}::uuid, ${SUB}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${kind}, 'GraphChanged', 'invalidation.assessed', ${evt['created_at'] as Date}, 'failed', 'the consumer was unavailable (SYNTHETIC)', now(), 'consumer_unavailable', ${uuidv7()}::uuid)`.execute(h.su);
    const s = await sweep(corrector);
    const mine = (s['swept'] as Row[]).find((x) => x['case_id'] === CASE)!;
    expect(mine).toMatchObject({ state: 'stalled', stalled: 1, failed_recorded: 1 });
    expect(Number(mine['frozen_now'])).toBeGreaterThan(0);
    const r = await readCase(analyst, CASE);
    expect(consumer(r, `SUB:${SUB}`)).toMatchObject({ consumer_kind: 'subscription', delivery_state: 'failed', failure_class: 'consumer_unavailable', state: 'failed', overdue: true, owner: subOwner.principalId });
    expect((r['closure'] as Row)['state']).toBe('stalled');
    const items = await rows(sql`select signal_class, subject_kind, owner_principal_id::text owner, state, details from executive.attention_items where subject_id = ${CASE}::uuid`);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ signal_class: 'correction_propagation_stall', subject_kind: 'correction_case', owner: subOwner.principalId, state: 'open' });
    expect((items[0]!['details'] as Row)['link']).toBe(`/observation/corrections/${CASE}`);
    // a second sweep repeats nothing
    const s2 = await sweep(corrector);
    expect((s2['swept'] as Row[]).find((x) => x['case_id'] === CASE)).toMatchObject({ frozen_now: 0, failed_recorded: 0 });
    expect(Number((await one(sql`select count(*)::int n from executive.attention_items where subject_id = ${CASE}::uuid`))['n'])).toBe(1);
  });
  it('THE FREEZE refuses the publication of the frozen package at approval (held, 409) — the frozen product stays visible with its marker and the case link', async () => {
    expect(await frozen('DPK', PKG, PV)).toEqual({ frozen: true, case_id: CASE });
    const r = await refusal(approvePub(w.executive, PUB, 1, PUB_DIGEST));
    expect(r.message).toMatch(new RegExp(`^publication rejected \\(held\\): its source report ${PKG} v${PV} is frozen by correction case ${CASE}`));
    expect(r.status).toBe(409);
    const v = await one(sql`select state from executive.publication_versions where publication_id = ${PUB}::uuid and version = 1`);
    expect(v['state']).toBe('drafted');
    const cs = await readCase(analyst, CASE);
    expect(consumer(cs, `DPK:${PKG}@${PV}`)).toMatchObject({ frozen: true, state: 'pending' });
    expect((cs['freezes'] as Row[]).some((f) => f['object_id'] === PKG && f['lifted_at'] === null)).toBe(true);
  });
  it('a window passed on the DATABASE clock: every overdue consumer routed to its owner; an item escalates past its deadline', async () => {
    const k = (await declare(domainAdmin, { windows: WINDOWS(2), exceptionMaxDays: 30, synthetic: true, statement: 'a two-second SYNTHETIC demonstration window per class (B50 harness)' })).contract;
    expect(k).toMatchObject({ version: 2, synthetic: true, supersedes: 1 });
    await dbSleep(2.5);
    const s = await sweep(corrector);
    const mine = (s['swept'] as Row[]).find((x) => x['case_id'] === CASE)!;
    expect(Number(mine['stalled'])).toBeGreaterThan(1);
    const items = await rows(sql`select item_id::text, owner_principal_id::text owner, details ->> 'consumer_ref' ref, state, due_at from executive.attention_items where subject_id = ${CASE}::uuid order by created_at`);
    const dpkItem = items.find((i) => i['ref'] === `DPK:${PKG}@${PV}`)!;
    expect(dpkItem).toMatchObject({ owner: w.owner.principalId, state: 'open' });
    expect(items.find((i) => i['ref'] === `PUB:${PUB}@1`)).toMatchObject({ owner: drafter.principalId });
    // STATED SUPERUSER MOVE — the DPK item's deadline moved into the past (the escalation's precondition), then the governed escalation
    await sql`update executive.attention_items set due_at = now() - interval '1 minute' where item_id = ${String(dpkItem['item_id'])}::uuid`.execute(h.su);
    await w.exec.escalateAttentionDue(h.req(domainAdmin, 'executive.attention.escalate', 'ATI', null, 'executive'), T(), D());
    const after = await one(sql`select state, escalations, route_roles from executive.attention_items where item_id = ${String(dpkItem['item_id'])}::uuid`);
    expect(after).toMatchObject({ state: 'escalated', escalations: 1 });
    expect(after['route_roles']).toEqual(expect.arrayContaining(['collection_manager', 'domain_admin']));
  });
});

describe('a · the acknowledgements, the recompute, the bounded exception', () => {
  it('REFUSAL: the correction authority never acknowledges a human review; a non-owner never acknowledges another\'s product; a human review is never recomputed; unknown consumers and records', async () => {
    const dpk = `DPK:${PKG}@${PV}`;
    await portRefused(ack(corrector, CASE, { consumerRef: dpk, note: 'the correction authority tries to close the review (B50 harness)' }),
      /^correction closure rejected \(separation_of_duties\): .* the correction authority who applied case .* never acknowledges it/, '42501', 403);
    await portRefused(ack(domainAdmin, CASE, { consumerRef: dpk, note: 'an administrator tries to close another\'s review (B50 harness)' }),
      /^correction closure rejected \(authority\): .* is owned by .*; its owner closes it/, '42501', 403);
    await portRefused(ack(w.owner, CASE, { consumerRef: dpk, state: 'recomputed', recomputeRef: `DPK:${PKG}@${PV}`, note: 'a decision is never recomputed by a correction (B50 harness)' }),
      /^correction closure rejected \(no_rewrite\)/, '22023', 422);
    await portRefused(ack(w.owner, CASE, { consumerRef: `DPK:${uuidv7()}@1`, note: 'a product the case never reached (B50 harness)' }),
      /^correction closure rejected \(unknown_consumer\)/, '23503', 404);
    await portRefused(ack(recordAuth, CASE, { consumerRef: `export_package:${EXPORT}`, state: 'recomputed', recomputeRef: `export_package:${uuidv7()}`, note: 'an amendment that does not exist (B50 harness)' }),
      /^correction closure rejected \(unknown_recompute\)/, '23503', 404);
    await portRefused(ack(recordAuth, CASE, { consumerRef: `export_package:${EXPORT}`, state: 'recomputed', recomputeRef: 'the new one', note: 'a malformed re-run reference (B50 harness)' }),
      /^correction closure rejected \(recompute_ref\)/, '22023', 422);
    expect((await refusal(ack(w.owner, CASE, { consumerRef: dpk, note: 'short' }))).status).toBe(422);
    expect(Number((await one(sql`select count(*)::int n from graph.consumer_acknowledgements where case_id = ${CASE}::uuid and state <> 'failed'`))['n'])).toBe(0);
  });
  it('POSITIVE: the package owner acknowledges the review (no rewrite); the export owner records the AMENDMENT as recomputed; the subscription owner acknowledges the failure; a repeated ack id answers the first', async () => {
    const ackId = uuidv7();
    const a = (await ack(w.owner, CASE, { consumerRef: `DPK:${PKG}@${PV}`, note: 'reviewed: the reroute still holds on the restated transits (B50 harness)', ackId })).acknowledgement;
    expect(a).toMatchObject({ state: 'acknowledged', recorded_by: w.owner.principalId, affected_class: 'human_review', repeated: false, basis: 'the accountable owner' });
    const again = (await ack(w.owner, CASE, { consumerRef: `DPK:${PKG}@${PV}`, note: 'reviewed: the reroute still holds on the restated transits (B50 harness)', ackId })).acknowledgement;
    expect(again['repeated']).toBe(true);
    await portRefused(ack(w.owner, CASE, { consumerRef: `DPK:${PKG}@${PV}`, note: 'a second acknowledgement of the same review (B50 harness)' }), /^correction closure rejected \(state\): .* is already acknowledged/, '22023', 409);
    // STATED SUPERUSER MOVE — the amended export package (built after the correction): DP-24-006's export amendment
    const amended = uuidv7();
    await sql`insert into retention.export_packages (action_id, scope, tenant_id, domain_id, destination, locator_prefix, scope_digest, approval_id, classification_ceiling, object_count, byte_total, manifest_digest, package_digest, signature, built_by, correlation_id)
      values (${amended}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'export', ${`${T()}/${D()}/${amended}/`}, ${hex('scope2')}, ${uuidv7()}::uuid, 'internal', 1, 1024, ${hex('m2')}, ${hex('p2')}, '{"scheme":"eye-digest-chain/1"}'::jsonb, ${recordAuth.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const rc = (await ack(recordAuth, CASE, { consumerRef: `export_package:${EXPORT}`, state: 'recomputed', recomputeRef: `export_package:${amended}`, note: 'the export amended with the corrected evidence (B50 harness)' })).acknowledgement;
    expect(rc).toMatchObject({ state: 'recomputed', recompute_ref: `export_package:${amended}` });
    await portRefused(ack(analyst, CASE, { consumerRef: `SUB:${SUB}`, note: 'not the subscription\'s owner (B50 harness)' }), /^correction closure rejected \(authority\)/, '42501', 403);
    const sa = (await ack(subOwner, CASE, { consumerRef: `SUB:${SUB}`, note: 'the consumer re-read the change after its outage (B50 harness)' })).acknowledgement;
    expect(sa).toMatchObject({ state: 'acknowledged', consumer_kind: 'subscription', subscription_id: SUB });
    const r = await readCase(analyst, CASE);
    expect(consumer(r, `SUB:${SUB}`)).toMatchObject({ state: 'acknowledged', closing: true, delivery_state: 'failed' });
    expect((await refusal(sql`delete from graph.consumer_acknowledgements where case_id = ${CASE}::uuid`.execute(h.su))).message).toMatch(/append-only/);
  });
  it('THE BOUNDED EXCEPTION: a reason, an expiry within the contract, an owner; under a legal hold on the corrected evidence its owner is a record authority', async () => {
    const pub = `PUB:${PUB}@1`;
    const soon = () => new Date(Date.now() + 3 * 86_400_000).toISOString();
    await portRefused(except(drafter, CASE, { consumerRef: pub, reason: 'the board note is reissued next week (B50 harness)', expiresAt: new Date(Date.now() + 40 * 86_400_000).toISOString(), ownerPrincipalId: drafter.principalId }),
      /^correction closure rejected \(expiry\): .* within 30 day/, '22023', 422);
    await portRefused(except(drafter, CASE, { consumerRef: pub, reason: 'the board note is reissued next week (B50 harness)', expiresAt: soon(), ownerPrincipalId: w.machinePrincipalId }),
      /^correction closure rejected \(owner\)/, '22023', 422);
    // STATED SUPERUSER MOVE — a legal hold on the corrected evidence's manifest
    const hold = uuidv7();
    await sql`insert into observation.legal_holds (hold_id, scope, tenant_id, domain_id, manifest_id, evd_object_id, reason, placed_by, correlation_id)
      values (${hold}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${MANIFEST}::uuid, ${w.evd.id}::uuid, 'litigation hold on the bulletin (SYNTHETIC)', ${recordAuth.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await portRefused(except(drafter, CASE, { consumerRef: pub, reason: 'the board note is reissued next week (B50 harness)', expiresAt: soon(), ownerPrincipalId: drafter.principalId }),
      /^correction closure rejected \(held\): .* legal hold — the exception is routed to the record authority/, '22023', 409);
    const e = (await except(drafter, CASE, { consumerRef: pub, reason: 'the board note is reissued next week; the hold keeps the bulletin (B50 harness)', expiresAt: soon(), ownerPrincipalId: recordAuth.principalId })).exception;
    expect(e).toMatchObject({ state: 'bounded_exception', exception_owner: recordAuth.principalId, affected_class: 'stale' });
    await sql`update observation.legal_holds set lifted_by = ${recordAuth.principalId}::uuid, lifted_at = now(), lift_reason = 'the hold is lifted (SYNTHETIC)' where hold_id = ${hold}::uuid`.execute(h.su);
    expect(consumer(await readCase(analyst, CASE), pub)).toMatchObject({ state: 'bounded_exception', closing: true });
  });
  it('THE REACH: the object itself (any version when unnamed), what a walk reached THROUGH a frozen product, a package option citing a frozen object', async () => {
    // (a)+(b): the publication's own freeze lifted once its consumer is closed (the exception above) — it is still frozen, reached THROUGH the frozen package
    const pubFreeze = (await rows(sql`select freeze_id::text from graph.publication_freezes where case_id = ${CASE}::uuid and object_id = ${PUB}::uuid and lifted_at is null`))[0]!;
    const lifted = (await lift(corrector, String(pubFreeze['freeze_id']), 'the board note is excepted until its reissue (B50 harness)')).freeze;
    expect(lifted).toMatchObject({ lift_kind: 'consumer_closed', lifted_by: corrector.principalId });
    expect(await frozen('PUB', PUB, 1)).toEqual({ frozen: true, case_id: CASE });
    const path = (await one(sql`select path from graph.affected_products where correction_case_id = ${CASE}::uuid and product_id = ${PUB}::uuid order by recorded_at desc limit 1`))['path'] as string[];
    expect(path).toContain(`DPK:${PKG}@${PV}`);
    // (c): a NEW package version (after the walk) whose option cites a frozen run is frozen too
    const frozenIds = (await rows(sql`select object_id::text id from graph.publication_freezes where case_id = ${CASE}::uuid and lifted_at is null`)).map((x) => x['id']);
    expect(frozenIds).toContain(w.forecastId);
    const d2 = await c.declare({ decisionObjectId: w.decisionId, title: 'Hedge on the corridor forecast (SYNTHETIC)', statement: 'whether to hedge the second shipment on the forecast', owner: w.owner.principalId });
    const pkg2 = d2.package.packageId; const v2 = (await c.open(pkg2)).version.version;
    await c.option(pkg2, v2, { key: 'hedge', title: 'Hedge on the corridor forecast', kind: 'intervention', consequences: [{ kind: 'run', id: w.controlId }, { kind: 'forecast', id: w.forecastId }] });
    expect(frozenIds).not.toContain(pkg2);
    expect(await frozen('DPK', pkg2, v2)).toEqual({ frozen: true, case_id: CASE });
    // nothing else answers
    expect(await frozen('FCT', uuidv7(), 1)).toEqual({ frozen: false, case_id: null });
  });
  it('THE FREEZE LIFT before closure: refused while its consumer is open; a steward\'s manual freeze of an open product', async () => {
    const r = await readCase(analyst, CASE);
    const open = consumers(r).find((x) => x['consumer_kind'] === 'affected_product' && x['material'] === true && x['closing'] === false)!;
    expect(open).toBeTruthy();
    const f = (r['freezes'] as Row[]).find((x) => x['object_id'] === open['product_id'] && x['lifted_at'] === null)!;
    await portRefused(lift(corrector, String(f['freeze_id']), 'the consumer is not owned yet (B50 harness)'), /^correction closure rejected \(held\): .* is still pending/, '22023', 409);
    expect((await refusal(lift(analyst, String(f['freeze_id']), 'an analyst cannot lift a freeze (B50 harness)'))).status).toBe(403);
    const again = (await freeze(domainAdmin, CASE, { consumerRef: open['consumer_ref'], reason: 'the consumer cannot reconcile until its owner returns (B50 harness)' })).freeze;
    expect(again).toMatchObject({ frozen: true, repeated: true });
  });
});

describe('x · the closure', () => {
  it('REFUSAL: the case does not close while a consumer is open (the reasons named); an analyst cannot close (PDP); the authority\'s forged role is re-checked', async () => {
    const r = await portRefused(close(corrector, CASE, 'every consumer reconciled (B50 harness, premature)'), /^correction closure rejected \(held\): case .* does not close yet — .*material consumer\(s\) are not closed/, '22023', 409);
    expect(r.message).toMatch(/pending/);
    expect((await refusal(close(analyst, CASE, 'an analyst cannot close a correction (B50 harness)'))).status).toBe(403);
    expect((await one(sql`select state from graph.correction_closures where case_id = ${CASE}::uuid`))['state']).toBe('stalled');
  });
  it('POSITIVE: every open consumer closed by its owner (or excepted by the administrator when nobody here can act as its owner); the case closed with the projections reconciled — the record, its digest; the freezes lift, the items close, the publication approves', async () => {
    const r = await readCase(analyst, CASE);
    for (const x of consumers(r).filter((y) => y['closing'] === false)) {
      const owner = typeof x['owner'] === 'string' ? x['owner'] : null;
      const as = owner === null ? undefined : actors.get(owner);
      if (as !== undefined && !(x['class'] === 'human_review' && as.principalId === corrector.principalId)) {
        await ack(as, CASE, { consumerRef: x['consumer_ref'], note: `reviewed against the restated transits (B50 harness): ${String(x['title']).slice(0, 60)}` });
      } else {
        await except(domainAdmin, CASE, { consumerRef: x['consumer_ref'], reason: 'its owner is an agent or absent here; re-run at the next scheduled cycle (B50 harness)',
          expiresAt: new Date(Date.now() + 7 * 86_400_000).toISOString(), ownerPrincipalId: domainAdmin.principalId });
      }
    }
    const ready = (await readCase(analyst, CASE, true))['readiness'] as Row;
    expect(ready, JSON.stringify(ready['reasons'])).toMatchObject({ ready: true, projections_checked: true });
    const closed = (await close(corrector, CASE, 'every material consumer acknowledged, recomputed or excepted; the projections reconcile (B50 harness)')).closure;
    expect(closed).toMatchObject({ schema: 'eye.correction-closure/1', case_id: CASE, closed_by: corrector.principalId });
    expect(Number(closed['reached_consumers'])).toBe(consumers(r).length);
    expect((closed['failed_deliveries'] as Row[]).map((x) => x['ref'])).toEqual([`SUB:${SUB}`]);
    expect((closed['residual_exposure'] as Row[]).map((x) => x['ref'])).toContain(`PUB:${PUB}@1`);
    expect((closed['projections'] as Row)['reconciled']).toBe(true);
    const rec = await one(sql`select state, audit_digest, encode(sha256(convert_to(record::text, 'UTF8')), 'hex') d, projections_reconciled, closed_at from graph.correction_closures where case_id = ${CASE}::uuid`);
    expect(rec['state']).toBe('closed');
    expect(rec['audit_digest']).toBe(rec['d']);
    expect(closed['audit_digest']).toBe(rec['d']);
    expect(Number((await one(sql`select count(*)::int n from graph.publication_freezes where case_id = ${CASE}::uuid and lifted_at is null`))['n'])).toBe(0);
    expect(Number((await one(sql`select count(*)::int n from executive.attention_items where subject_id = ${CASE}::uuid and state <> 'closed'`))['n'])).toBe(0);
    expect(await frozen('DPK', PKG, PV)).toEqual({ frozen: false, case_id: null });
    expect((await listCases(analyst)).find((k) => k['case_id'] === CASE)).toMatchObject({ closure_state: 'closed' });
    const notice = (await readCase(analyst, CASE))['notice'] as Row;
    expect(notice['closure']).toMatchObject({ state: 'closed', audit_digest: rec['d'] });
    // the freeze is gone: the approval passes it
    const a = (await approvePub(w.executive, PUB, 1, PUB_DIGEST)).approval;
    expect(a['state']).toBe('approved');
  });
  it('RECOVERY: a closed case never changes — a second close, an acknowledgement or a freeze is refused; the record is immutable', async () => {
    await portRefused(close(corrector, CASE, 'closing it twice (B50 harness, SYNTHETIC)'), /^correction closure rejected \(state\): correction case .* was closed at/, '22023', 409);
    await portRefused(ack(w.owner, CASE, { consumerRef: `DPK:${PKG}@${PV}`, note: 'after the closure (B50 harness)' }), /^correction closure rejected \(state\): correction case .* is closed/, '22023', 409);
    expect((await refusal(sql`update graph.correction_closures set statement = 'x' where case_id = ${CASE}::uuid`.execute(h.su))).message).toMatch(/closed record never changes/);
  });
});

describe('m · MET-010 v2: to the closure instant', () => {
  it('registered as version 2 in 0120 §CL; the closed case measured to its closure record\'s instant, an open case censored and said', async () => {
    const reg = await one(sql`select version, registered_in, dimensions from analytics.computation_registry where function_name = 'analytics.mc_met010_correction_propagation'`);
    expect(reg).toMatchObject({ version: 2, registered_in: '0120 §CL', dimensions: ['correction_kind'] });
    const open = await applyCorrection([w.records.inv.id], 'a second restatement left open (B50 §CL harness)', w.uploadSourceId);
    const out = (await one(sql`select analytics.mc_met010_correction_propagation(${T()}::uuid, ${D()}::uuid, now() - interval '1 day', now() + interval '1 day', clock_timestamp(), null, '{}'::jsonb, '{}'::jsonb) r`))['r'] as Row;
    const recs = out['records'] as Row[];
    const mine = recs.find((x) => x['id'] === CASE)!;
    const closedAt = (await one(sql`select closed_at from graph.correction_closures where case_id = ${CASE}::uuid`))['closed_at'] as Date;
    expect(mine['role']).toBe('included');
    expect(new Date(String((mine['detail'] as Row)['closed_at'])).toISOString()).toBe(closedAt.toISOString());
    expect((mine['detail'] as Row)['closure']).toBe('material consumer closure (the closure record)');
    const other = recs.find((x) => x['id'] === open)!;
    expect(other).toMatchObject({ role: 'excluded' });
    expect(String(other['reason'])).toMatch(/censored: the closure is open/);
    expect(((out['quality'] as Row)['computation_version'])).toBe(2);
    const cohort = (await one(sql`select analytics.mc_met010_correction_propagation(${T()}::uuid, ${D()}::uuid, now() - interval '1 day', now() + interval '1 day', clock_timestamp(), null, '{"correction_kind":"withdrawal"}'::jsonb, '{}'::jsonb) r`))['r'] as Row;
    expect((cohort['records'] as Row[]).length).toBe(0);
  });
});

describe('d · the adopt act for an older case (never automatic)', () => {
  it('an applied case recorded before B50 has no record: LISTED as adoptable, read "not tracked", never adopted by itself', async () => {
    OLD_CASE = uuidv7();
    // STATED SUPERUSER MOVE — a case applied before 0120 (its trigger skipped: there was none then)
    await h.su.transaction().execute(async (tx) => {
      await sql`set local session_replication_role = replica`.execute(tx);
      await sql`insert into observation.correction_current (case_id, scope, tenant_id, domain_id, source_id, kind, state, received_at, closed_at, channel, publisher_ref, reason, affected_resolved, propagation_unresolved)
        values (${OLD_CASE}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${SERIES_SOURCE}::uuid, 'supersession', 'applied', '2026-09-10T08:00:00Z', '2026-09-10T09:00:00Z', 'publisher feed', 'imf-portwatch-ports (SYNTHETIC)', 'a supersession applied before B50 (SYNTHETIC)', '[]'::jsonb, 'pending')`.execute(tx);
    });
    const adoptable = ((await ctl.adoptable(G(analyst, 'graph.read', 'COR'), T(), D())) as { cases: Row[] }).cases;
    expect(adoptable.map((x) => x['case_id'])).toContain(OLD_CASE);
    expect((await listCases(analyst)).find((k) => k['case_id'] === OLD_CASE)).toMatchObject({ closure_state: 'not_tracked' });
    expect((await readCase(analyst, OLD_CASE))['tracked']).toBe(false);
    await portRefused(ack(w.owner, OLD_CASE, { consumerRef: `DPK:${PKG}@${PV}`, note: 'before adoption (B50 harness)' }), /^correction closure rejected \(state\): case .* has no closure record/, '22023', 409);
  });
  it('ADOPTED by the correction authority\'s act — once; the windows run from the apply; it does not close while its impact scope is unknown', async () => {
    expect((await refusal(adopt(analyst, OLD_CASE, 'an analyst cannot adopt a case (B50 harness)'))).status).toBe(403);
    const a = (await adopt(corrector, OLD_CASE, 'the stalled supersession is tracked to its closure from now on (B50 harness)')).closure;
    expect(a).toMatchObject({ case_id: OLD_CASE, opened_via: 'adopted', state: 'open', adopted_by: corrector.principalId });
    expect(new Date(String(a['opened_at'])).toISOString()).toBe('2026-09-10T09:00:00.000Z');
    await portRefused(adopt(corrector, OLD_CASE, 'adopting the same case again (B50 harness)'), /^correction closure rejected \(duplicate\)/, '22023', 409);
    await portRefused(adopt(corrector, uuidv7(), 'a case that does not exist (B50 harness)'), /^correction closure rejected \(unknown_case\)/, '23503', 404);
    await portRefused(close(corrector, OLD_CASE, 'the scope is not known yet (B50 harness, SYNTHETIC)'), /^correction closure rejected \(held\): .*the impact scope is not known: the propagation is pending/, '22023', 409);
    expect((await listCases(analyst)).find((k) => k['case_id'] === OLD_CASE)).toMatchObject({ closure_state: 'open', opened_via: 'adopted' });
  });
});

describe('t · the attention tick runs the sweep', () => {
  it('the step is registered (correction-closure, before the deliveries); the attention agent\'s tick runs it under executive.attention.tick', async () => {
    const reg = h.app.get(AttentionTickRegistry);
    const step = reg.steps().find((s) => s.name === CORRECTION_CLOSURE_STEP)!;
    expect(step.order).toBe(CORRECTION_CLOSURE_ORDER);
    expect(reg.steps().findIndex((s) => s.name === CORRECTION_CLOSURE_STEP)).toBeLessThan(reg.steps().findIndex((s) => s.name === 'deliveries'));
    const r = await w.exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
      codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: w.executive.principalId, escalationPrincipalId: domainAdmin.principalId, budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } }) as unknown as { agent: { agentId: string } };
    await new Promise((res) => setTimeout(res, 1500));
    await h.app.get(SchedulerService).unscheduleAttentionTick(T(), D());
    const t = await h.app.get(AttentionTimerService).tickNow({ tenantId: T(), domainId: D(), agentId: r.agent.agentId, scheduledAt: new Date(Date.UTC(2035, 0, 3)) });
    expect(t.outcome, JSON.stringify(t.stopReason)).toBe('finished');
    const tick = await one(sql`select result from executive.attention_ticks where run_id = ${t.runId}::uuid`);
    const res = ((tick['result'] as Row)['steps'] as Row)[CORRECTION_CLOSURE_STEP] as Row;
    expect(res).toMatchObject({ by: 'executive.attention.tick' });
    expect((res['swept'] as Row[]).map((x) => x['case_id'])).toContain(OLD_CASE);
  });
});

describe('v · re-verified: a correction constrains, it never rewrites', () => {
  it('the human decision\'s package version and the evidence\'s first version are unchanged; history reads as it was', async () => {
    const v = await one(sql`select state from decision.package_versions where package_id = ${PKG}::uuid and version = ${PV}`);
    expect(v['state']).toBe('proposed');
    const first = await one(sql`select object_version, lifecycle_state from objects.canonical_objects where object_id = ${w.evd.id}::uuid and object_version = ${w.evd.version}`);
    expect(Number(first['object_version'])).toBe(w.evd.version);
    const opts = await one(sql`select count(*)::int n from decision.options o, jsonb_array_elements(o.consequences) c where o.package_id = ${PKG}::uuid and o.version = ${PV} and c ->> 'id' = ${w.evd.id} and (c ->> 'version')::int = ${w.evd.version}`);
    expect(Number(opts['n'])).toBe(1);
  });
});
