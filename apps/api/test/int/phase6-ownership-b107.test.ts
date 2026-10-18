/**
 * CP-6 B107 §DR (migration 0115_b107_x_dr) — DATA GOVERNANCE AND OWNERSHIP, on a real database through the real pipeline, ports and
 * controllers. CONSTRUCTION evidence: every persona, asset, product, component and record here is SYNTHETIC; an acceptance, ratification or
 * attestation by a synthetic persona demonstrates the software only — production admission (DP-01/-04/-55-006) is R1 and never claimed.
 *
 *   DR1 · THE DATA AUTHORITY REGISTRY (V00-T-082, DP-04-001/-002, DAT-GV-01/-04): proposed by a steward, accepted by the NAMED owner,
 *         ratified by another named human; resolved live; versioned; recertified. Refusals: the policy, an unknown asset, owner = steward, an
 *         inactive owner, a stale version, an open proposal, a non-owner's acceptance, a stale digest, the proposer, the owner, an agent,
 *         ratification before acceptance.
 *   DR2 · THE DOMAIN REGISTRY EXTENSION (DAT-GV-02): the leader, the boundary, the extension contract, the governance mode.
 *   DR3 · THE GAP REGISTER (DP-04-005, DP-01-005): conflicting authorities preserved and HELD — new consumption stops; resolved by the
 *         governed correction; an owner LOST → the tick degrades the product (DP-41-005) and only a domain review restores it; the residual
 *         ACCEPTED by a named approver; escalation by age; an enforced domain holds a missing authority.
 *   DR4 · THE DATA CAPABILITY INVENTORY (DP-01-001/-002/-005/-006): imported read-only from v07.csv (idempotent; the file untouched),
 *         reconciled (conformant / unresolved / drift), admitted only when conformant, accepted and unheld — production admission R1.
 *   DR5 · COMPONENT OWNERSHIP (ES-04-001/-002, ES-11-001/-002/-005, PER-19): the ratified, SIGNED transfer with the nine-item checklist;
 *         distinguishability; one owner per contract; contacts reconciled; the owned-contract lint over this API's routes; a PLATFORM
 *         context reads no customer stewardship content.
 *   DR6 · STEWARDSHIP CASES (DP-55-001/-002/-005, DAT-GV-07): SLA by consequence, segregation, distinct reviewers, conditions, expiry,
 *         escalation (the sweep and the SLA TIMER), an unowned case held, an expired data exception holding consumption, a confirmed policy
 *         violation degrading a product (DP-41-005).
 *   DR7 · THE RESPONSIBILITY EVIDENCE RECORD (DP-01-006, DP-04-006, DP-55-006): held without a signed matrix; attested and SIGNED over it.
 *   DR8 · THE B90 RESIDUALS: catalog_trust consulted by subscription registration and metric serving (DP-49-005); the lineage-retirement
 *         port (DP-49-006); "registry row gone → orphan" (§B90.9 #5).
 *   DR9 · THE READS (DAT-GV-03, DAT-GV-10), ISOLATION and CROSS-TENANT, REPLAY (the ledger), the FAULT exercise (a refused ratification
 *         rolls its signature back).
 *
 * Stated superuser moves (fixture scaffolding, never the part's own act): component / deployable-unit / exception artifacts and their
 * `excepts` link planted (§RG / §CM register them in the product); principals suspended and reactivated (the identity administrator's act);
 * a gap's opening instant, a case's due instant and a data exception's expiry moved back (the fast-expiry idiom); a stewardship timer
 * planted due; an objects.schema_registry row inserted then deleted (the registry row gone).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { SchedulerService } from '../../src/observation/scheduling/scheduler.service.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { OwnershipDomainController, OwnershipPlatformController } from '../../src/governance/ownership/ownership.controller.js';
import { OwnershipService, requirementFile } from '../../src/governance/ownership/ownership.service.js';
import { OwnershipCap } from '../../src/governance/ownership/ownership.capabilities.js';
import { normalisePath } from '../../src/governance/ownership/ownership-logic.js';
import { Phase4Harness } from './phase4-helpers.js';

// THE SIGNING KEY (the B36 signer's discipline): generated here, bound in the process before the boot — one key for the executive and the
// platform signatures (the same key-reference path).
const KEY = generateKeyPairSync('ed25519');
process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = KEY.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
const PUBLIC_PEM = KEY.publicKey.export({ format: 'pem', type: 'spki' }).toString();

type Row = Record<string, unknown>;
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';
let h: Phase4Harness; let dc: OwnershipDomainController; let pc: OwnershipPlatformController; let svc: OwnershipService;
// the B90 / B94 / B24 surfaces this part acts beside (their own routes)
let products: any; let events: any; let metrics: any; let catalog: any; let consumers: any; let support: any; let exec: any; // eslint-disable-line @typescript-eslint/no-explicit-any
let scheduler: SchedulerService; let timer: AttentionTimerService;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
const obj = (v: unknown): Row => (v !== null && typeof v === 'object' ? (v as Row) : {});
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ── personas (SYNTHETIC) ─────────────────────────────────────────────────────────────────────────
let steward: AuthenticatedPrincipal; let steward2: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let dadmin2: AuthenticatedPrincipal;
let owner: AuthenticatedPrincipal;        // forecast_owner + privacy_officer: owns P1 (and its authority); the owner-exclusion probe on access cases
let owner2: AuthenticatedPrincipal;       // risk_owner: the next owner named in v2
let stewardOwner: AuthenticatedPrincipal; // data_steward + forecast_owner: named owner, then tries to ratify its own appointment
let lostOwner: AuthenticatedPrincipal;    // forecast_owner: owns P2, then suspended (owner LOST)
let violOwner: AuthenticatedPrincipal;    // forecast_owner: owns P3 (the policy violation)
let privacy: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let reviewer: AuthenticatedPrincipal; let agentSteward: AuthenticatedPrincipal;
let tenantAdmin: AuthenticatedPrincipal; let sponsor: AuthenticatedPrincipal; let sponsor2: AuthenticatedPrincipal; let onbAuth: AuthenticatedPrincipal; let lead: AuthenticatedPrincipal;
let cSteward: AuthenticatedPrincipal; let prodAuth: AuthenticatedPrincipal; let opsAuth: AuthenticatedPrincipal; let opsAuth2: AuthenticatedPrincipal; let designLead: AuthenticatedPrincipal;
let contact1: AuthenticatedPrincipal; let contact2: AuthenticatedPrincipal; let platformAgent: AuthenticatedPrincipal;
let elsewhere: AuthenticatedPrincipal;
let agentId = ''; let D2 = '';

// ── refusals ─────────────────────────────────────────────────────────────────────────────────────
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string; body: Row }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e), body: {} };
  const r = mapped.getResponse() as Row;
  return { status: mapped.getStatus(), message: String(r['message'] ?? (e instanceof Error ? e.message : '')), body: r };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const dbAhead = async (ahead: string): Promise<string> => (await sql<{ t: Date }>`select clock_timestamp() + ${ahead}::interval t`.execute(h.su)).rows[0]!.t.toISOString();
const dbAgo = async (ago: string): Promise<string> => (await sql<{ t: Date }>`select clock_timestamp() - ${ago}::interval t`.execute(h.su)).rows[0]!.t.toISOString();

// ── envelopes ────────────────────────────────────────────────────────────────────────────────────
function env(p: AuthenticatedPrincipal, action: string, scope: Scope, t: string | null, d: string | null, purpose = 'governance'): Envelope {
  return { message_id: uuidv7(), scope, tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: purpose, action,
    side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C2', object_type: null, object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b107-dr' } as unknown as Envelope;
}
const dq = (p: AuthenticatedPrincipal, action: string, d = D()) => ({ eyeEnvelope: env(p, action, 'DOMAIN', T(), d), eyePrincipal: p }) as never;
const pq = (p: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: env(p, action, 'PLATFORM', null, null), eyePrincipal: p }) as never;
const bq = (p: AuthenticatedPrincipal, action: string, type: string, id: string | null = null, purpose = 'executive') => h.req(p, action, type, id, purpose);

// ── §DR routes (in process) ──────────────────────────────────────────────────────────────────────
const portal = (as: AuthenticatedPrincipal, d = D()) => dc.portal(dq(as, 'governance.ownership.read', d), T(), d, { payload: {} }) as Promise<Row & { portal: Row; cases: Row[]; gaps: Row[] }>;
const asset = (as: AuthenticatedPrincipal, id: string) => dc.asset(dq(as, 'governance.ownership.read'), T(), D(), id) as Promise<Row & { resolution: Row; versions: Row[]; holds: Row[]; ledger: Row[] }>;
const productsRead = (as: AuthenticatedPrincipal) => dc.products(dq(as, 'governance.ownership.read'), T(), D()) as Promise<{ products: Row[] }>;
const propose = (as: AuthenticatedPrincipal, payload: Row) => dc.propose(dq(as, 'governance.ownership.authority.propose'), T(), D(), { payload }) as Promise<{ authority: Row }>;
const acceptA = (as: AuthenticatedPrincipal, id: string, payload: Row) => dc.accept(dq(as, 'governance.ownership.authority.accept'), T(), D(), id, { payload }) as Promise<{ authority: Row }>;
const decideA = (as: AuthenticatedPrincipal, id: string, payload: Row) => dc.decide(dq(as, 'governance.ownership.authority.ratify'), T(), D(), id, { payload: { reason: 'the duties read against the domain operating model (SYNTHETIC)', ...payload } }) as Promise<{ authority: Row }>;
const recertify = (as: AuthenticatedPrincipal, id: string) => dc.recertify(dq(as, 'governance.ownership.authority.recertify'), T(), D(), id) as Promise<{ authority: Row }>;
const proposeDomain = (as: AuthenticatedPrincipal, payload: Row) => dc.proposeDomain(dq(as, 'governance.ownership.domain.propose'), T(), D(), { payload }) as Promise<{ entry: Row }>;
const decideDomain = (as: AuthenticatedPrincipal, payload: Row) => dc.decideDomain(dq(as, 'governance.ownership.domain.ratify'), T(), D(), { payload: { reason: 'the domain boundary and contract reviewed (SYNTHETIC)', ...payload } }) as Promise<{ entry: Row }>;
const reconcile = (as: AuthenticatedPrincipal) => dc.reconcile(dq(as, 'governance.ownership.reconcile'), T(), D()) as Promise<{ reconciliation: Row }>;
const acceptGap = (as: AuthenticatedPrincipal, id: string, payload: Row) => dc.acceptGap(dq(as, 'governance.ownership.gap.accept'), T(), D(), id, { payload }) as Promise<{ gap: Row }>;
const openCase = (as: AuthenticatedPrincipal, payload: Row) => dc.openCase(dq(as, 'governance.ownership.case.open'), T(), D(), { payload: { evidence: [{ kind: 'catalog_flag', ref: 'synthetic-evidence-1' }], ...payload } }) as Promise<{ case: Row }>;
const previewCase = (as: AuthenticatedPrincipal, id: string) => dc.casePreview(dq(as, 'governance.ownership.read'), T(), D(), id) as Promise<Row & { case: Row; eligibility: { can_review: boolean; reasons: string[] } }>;
const reviewCase = (as: AuthenticatedPrincipal, id: string, payload: Row) => dc.reviewCase(dq(as, 'governance.ownership.case.review'), T(), D(), id, { payload: { note: 'the evidence read against the proposed action (SYNTHETIC)', ...payload } }) as Promise<{ case: Row }>;
const closeCase = (as: AuthenticatedPrincipal, id: string, payload: Row) => dc.closeCase(dq(as, 'governance.ownership.case.close'), T(), D(), id, { payload }) as Promise<{ case: Row }>;
const withdrawCase = (as: AuthenticatedPrincipal, id: string) => dc.withdrawCase(dq(as, 'governance.ownership.case.withdraw'), T(), D(), id, { payload: { reason: 'opened against the wrong asset (SYNTHETIC)' } }) as Promise<{ case: Row }>;
const assemble = (as: AuthenticatedPrincipal, payload: Row) => dc.assemble(dq(as, 'governance.ownership.evidence.assemble'), T(), D(), { payload }) as Promise<{ record: Row }>;
const attest = (as: AuthenticatedPrincipal, id: string, payload: Row) => dc.attest(dq(as, 'governance.ownership.evidence.attest'), T(), D(), id, { payload: { reason: 'the evidence read for the period (SYNTHETIC)', ...payload } }) as Promise<{ record: Row }>;
const retire = (as: AuthenticatedPrincipal, edgeId: string, payload: Row) => dc.retireLineage(dq(as, 'products.catalog.lineage.retire'), T(), D(), edgeId, { payload }) as Promise<{ edge: Row }>;
const platformRead = (as: AuthenticatedPrincipal) => pc.read(pq(as, 'governance.ownership.read')) as Promise<Row & { capabilities: Row[]; components: Row[]; transfers: Row[]; gaps: Row[] }>;
const lint = (as: AuthenticatedPrincipal) => pc.lint(pq(as, 'governance.ownership.read')) as Promise<{ lint: Row }>;
const importCaps = (as: AuthenticatedPrincipal, payload: Row) => pc.importCapabilities(pq(as, 'governance.ownership.capability.declare'), { payload }) as Promise<{ import: Row }>;
const reconcileCap = (as: AuthenticatedPrincipal, id: string) => pc.reconcileCapability(pq(as, 'governance.ownership.capability.reconcile'), id) as Promise<{ capability: Row }>;
const acceptCap = (as: AuthenticatedPrincipal, id: string, payload: Row) => pc.acceptCapability(pq(as, 'governance.ownership.capability.accept'), id, { payload }) as Promise<{ capability: Row }>;
const admitCap = (as: AuthenticatedPrincipal, id: string, payload: Row) => pc.admitCapability(pq(as, 'governance.ownership.capability.admit'), id, { payload: { reason: 'conformant, owned and unheld (SYNTHETIC)', ...payload } }) as Promise<{ capability: Row }>;
const proposeT = (as: AuthenticatedPrincipal, payload: Row) => pc.proposeTransfer(pq(as, 'governance.ownership.component.propose'), { payload }) as Promise<{ transfer: Row }>;
const previewT = (as: AuthenticatedPrincipal, id: string) => pc.transferPreview(pq(as, 'governance.ownership.read'), id) as Promise<Row & { transfer: Row; signatures: Row[]; eligibility: Row }>;
const acceptT = (as: AuthenticatedPrincipal, id: string, digest: string) => pc.acceptTransfer(pq(as, 'governance.ownership.component.accept'), id, { payload: { digest } }) as Promise<{ transfer: Row }>;
const decideT = (as: AuthenticatedPrincipal, id: string, payload: Row) => pc.decideTransfer(pq(as, 'governance.ownership.component.ratify'), id, { payload: { reason: 'the handover inventory read item by item (SYNTHETIC)', ...payload } }) as Promise<{ transfer: Row }>;
const withdrawT = (as: AuthenticatedPrincipal, id: string) => pc.withdrawTransfer(pq(as, 'governance.ownership.component.withdraw'), id, { payload: { reason: 'superseded by another proposal (SYNTHETIC)' } }) as Promise<{ transfer: Row }>;
const reconcileComponents = (as: AuthenticatedPrincipal) => pc.reconcileComponents(pq(as, 'governance.ownership.component.reconcile')) as Promise<{ reconciliation: Row }>;
const acceptPlatformGap = (as: AuthenticatedPrincipal, id: string, payload: Row) => pc.acceptGap(pq(as, 'governance.ownership.platform_gap.accept'), id, { payload }) as Promise<{ gap: Row }>;

// ── B90 / B94 routes (their own) ─────────────────────────────────────────────────────────────────
const registerProduct = (as: AuthenticatedPrincipal, payload: Row) => products.register(bq(as, 'products.product.register', 'DPR'), T(), D(), { payload }) as Promise<{ product: Row }>;
const declareProduct = (as: AuthenticatedPrincipal, id: string, declaration: unknown) => products.declare(bq(as, 'products.product.declare', 'DPR', id), T(), D(), id, { payload: { declaration } }) as Promise<{ product: Row }>;
const reviewProduct = (as: AuthenticatedPrincipal, id: string, payload: Row) => products.review(bq(as, 'products.product.review', 'DPR', id), T(), D(), id, { payload }) as Promise<{ review: Row }>;
const releaseProduct = (as: AuthenticatedPrincipal, id: string, version: number) => products.release(bq(as, 'products.product.release', 'DPR', id), T(), D(), id, { payload: { version } }) as Promise<{ product: Row }>;
const declareEvent = (as: AuthenticatedPrincipal, id: string, declaration: Row) => events.declare(bq(as, 'products.event_product.declare', 'DPR', id), T(), D(), id, { payload: { declaration } }) as Promise<{ event_product: Row }>;
const subscribe = (as: AuthenticatedPrincipal, payload: Row) => events.register(bq(as, 'products.subscription.register', 'SUB'), T(), D(), { payload }) as Promise<{ subscription: Row }>;
const restore = (as: AuthenticatedPrincipal, id: string, note: string) => consumers.restore(bq(as, 'products.product.restore', 'DPR', id), T(), D(), id, { payload: { note } }) as Promise<{ product: Row }>;
const defineMetric = (as: AuthenticatedPrincipal, id: string, payload: Row) => metrics.define(bq(as, 'products.metric.declare', 'MET', id), T(), D(), id, { payload }) as Promise<{ metric: Row }>;
const certify = (as: AuthenticatedPrincipal, id: string, version: number, expiresAt: string) => metrics.certify(bq(as, 'products.metric.certify', 'MET', id), T(), D(), id, { payload: { version, expiresAt } }) as Promise<{ metric: Row }>;
const serve = (as: AuthenticatedPrincipal, key: string, view: string) => metrics.serve(bq(as, 'products.metric.serve', 'MET'), T(), D(), key, { payload: { view } }) as Promise<{ serving: Row }>;
const catReconcile = (as: AuthenticatedPrincipal) => catalog.reconcile(bq(as, 'products.catalog.reconcile', 'CAT'), T(), D()) as Promise<{ run: Row }>;
const catFlag = (as: AuthenticatedPrincipal, id: string, kind: string, clear = false) => catalog.flag(bq(as, 'products.catalog.flag', 'CAT', id), T(), D(), id, { payload: { kind, reason: 'the steward found the entry inconsistent with its source (SYNTHETIC)', clear } }) as Promise<{ asset: Row }>;
const catOwner = (as: AuthenticatedPrincipal, id: string, ownerPrincipalId: string) => catalog.setOwner(bq(as, 'products.catalog.owner.set', 'CAT', id), T(), D(), id, { payload: { ownerPrincipalId } }) as Promise<{ asset: Row }>;
const catLineage = (as: AuthenticatedPrincipal, fromAssetId: string, toAssetId: string, kind: string) => catalog.declareLineage(bq(as, 'products.catalog.lineage.declare', 'CAT', fromAssetId), T(), D(), { payload: { fromAssetId, toAssetId, kind, evidence: { note: 'SYNTHETIC' } } }) as Promise<{ edge: Row }>;
const catRegister = (as: AuthenticatedPrincipal, payload: Row) => catalog.register(bq(as, 'products.catalog.asset.register', 'CAT'), T(), D(), { payload }) as Promise<{ asset: Row }>;
const catRead = (as: AuthenticatedPrincipal, id: string) => catalog.read(bq(as, 'products.catalog.read', 'CAT', id), T(), D(), id) as Promise<{ asset: Row }>;
const VOCAB_ROWS = (): Row[] => [
  { key: 'domain.operation', title: 'Operating the corridor domain (SYNTHETIC)', ownerRole: 'domain_admin', operatorRole: 'collection_manager', customerAuthority: 'onboarding_authority' },
  { key: 'risk.ownership', title: 'Owning the domain\'s risks (SYNTHETIC)', ownerRole: 'risk_owner', operatorRole: 'domain_analyst', customerAuthority: 'onboarding_authority' },
  { key: 'support.access', title: 'Approving vendor support access (SYNTHETIC)', ownerRole: 'domain_admin', operatorRole: 'support_engineer', customerAuthority: 'onboarding_authority' },
  { key: 'evidence.custody', title: 'Custody of the domain\'s evidence (SYNTHETIC)', ownerRole: 'data_steward', operatorRole: 'collection_manager', customerAuthority: 'onboarding_authority' },
].map((r) => ({ accessPath: 'the domain workspace and the control center', evidenceProducer: 'the audit chain and the service ledger', escalationPath: 'the domain admin, then the onboarding authority', ...r }));

const EVENT_DECL = (): Row => ({
  schema: { version: 'v1', fields: [{ name: 'title', type: 'string' }, { name: 'consequence_class', type: 'string' }, { name: 'confidence', type: 'number' }] },
  subject_kind: 'warning', ordering_key: 'subject_id', delivery: 'pull', retention_days: 30, replay_policy: { allowed: true },
  source: { ledger: 'prediction.warning_events', kinds: ['warning.raised'] },
});
const DECL = (): Row => ({
  contract: { schema: [{ object_type: 'WRN', schema_version: 'v2' }] }, serving_modes: ['event'],
  inputs: [{ kind: 'relation', ref: 'prediction.warning_events' }], outputs: [{ kind: 'object_type', ref: 'WRN', authority: false }],
  slo: { lag_events: 2 }, policy: { purposes: ['executive', 'procurement'], data_classes: ['internal'] }, cost: { basis: 'compute-minutes' }, quality: { completeness: 'declared' },
});
const SUBSCRIPTION = (productId: string): Row => ({ productId, purpose: 'procurement', granted: { fields: ['title', 'consequence_class'], consequence: 'C2', from: null, to: null }, filters: {},
  schemaVersion: 'v1', lagPolicy: { max_lag_events: 2, max_lag_seconds: 86_400 }, handlesCorrections: true, handlesReplays: true });
async function releasedEventProduct(key: string, title: string, productOwner: AuthenticatedPrincipal): Promise<string> {
  const id = String((await registerProduct(steward, { key, title, kind: 'event', purpose: `${title}: a subscribable event product (SYNTHETIC)`, ownerPrincipalId: productOwner.principalId })).product['product_id']);
  await declareEvent(productOwner, id, EVENT_DECL());
  await declareProduct(productOwner, id, DECL());
  await reviewProduct(reviewer, id, { version: 1, kind: 'admission', outcome: 'accepted', notes: 'the event contract, its SLO and purposes reviewed (B107 §DR harness)' });
  expect((await releaseProduct(productOwner, id, 1)).product).toMatchObject({ state: 'released', released_version: 1 });
  return id;
}
const assetOf = async (kind: string, ref: string): Promise<string> => String((await one(sql`select asset_id::text as a from products.catalog_assets where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and kind = ${kind} and ref = ${ref}`))['a']);
const ledger = async (subject: string) => (await rows(sql`select event from governance.events where subject_id = ${subject}::uuid order by occurred_at, event_id`)).map((r) => String(r['event']));
const openHolds = async (subject: string) => rows(sql`select reason_kind, reason, source_artifact::text as source from governance.holds where subject_artifact = ${subject}::uuid and lifted_at is null order by opened_at`);
const gapOf = async (subject: string, kind: string) => one(sql`select gap_id::text, state, held, detail, escalations from governance.ownership_gaps where subject_id = ${subject}::uuid and gap_kind = ${kind} order by opened_at desc limit 1`);
const itemsOf = async (subject: string) => rows(sql`select signal_class, subject_kind, state, title from executive.attention_items where subject_id = ${subject}::uuid and signal_class = 'governance.ownership' order by created_at`);
let slot = 0;
const tick = async () => {
  const o = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2037, 0, 1) + (slot++) * 86_400_000) });   // one tick per cadence (a day): a repeated key runs nothing
  expect(o.outcome, JSON.stringify(o.run?.outputs ?? o.stopReason).slice(0, 800)).toBe('finished');
  return { steps: (o.run?.outputs['steps'] ?? {}) as Record<string, Row>, after: (o.run?.outputs['after'] ?? {}) as Record<string, Row> };
};

async function tenantPrincipal(kind: 'human' | 'agent', roles: string[], label: string, claim: 'human' | 'agent', scope: 'TENANT' | 'DOMAIN'): Promise<AuthenticatedPrincipal> {
  const id = uuidv7(); const dom = scope === 'DOMAIN' ? D() : null;
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${scope}, ${T()}::uuid, ${dom}::uuid, ${`b107dr-${label}-${id.slice(-8)} (SYNTHETIC)`}, ${`b107dr-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  for (const role of roles) await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${role}, ${scope}, ${T()}::uuid, ${dom}::uuid)`.execute(h.su);
  return h.openSession({ ...h.manager, principalId: id, kind: claim, homeScope: scope, homeDomainId: dom, bindings: roles.map((roleCode) => ({ roleCode, scope, tenantId: T(), domainId: dom })) } as AuthenticatedPrincipal);
}
/** A PLATFORM-homed principal; an AGENT's session may CLAIM a human (the PEP's human gate passes — the PORT is what refuses it). */
async function platformPerson(label: string, kind: 'human' | 'agent', roles: string[], claim: 'human' | 'agent' = kind): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, 'PLATFORM', null, null, ${`b107dr-${label}-${RUN} (SYNTHETIC)`}, ${`b107dr-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  for (const role of roles) await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${role}, 'PLATFORM', null, null)`.execute(h.su);
  return h.openSession({ ...h.manager, principalId: id, kind: claim, homeScope: 'PLATFORM', homeTenantId: null, homeDomainId: null,
    bindings: roles.map((roleCode) => ({ roleCode, scope: 'PLATFORM' as const, tenantId: null, domainId: null })) } as unknown as AuthenticatedPrincipal);
}
const plantArtifact = async (kind: string, key: string, title: string): Promise<string> => {
  const id = uuidv7();
  await sql`insert into governance.artifacts (artifact_id, version, scope, kind, external_key, title, digest, recorded_by, correlation_id)
            values (${id}::uuid, 1, 'PLATFORM', ${kind}, ${key}, ${`${title} (SYNTHETIC)`}, ${createHash('sha256').update(key).digest('hex')}, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  return id;
};

let P1 = ''; let P2 = ''; let P3 = ''; let M1 = ''; let A_P1 = ''; let A_P2 = ''; let A_P3 = ''; let A_M1 = ''; let A_SRC = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  dc = h.app.get(OwnershipDomainController); pc = h.app.get(OwnershipPlatformController); svc = h.app.get(OwnershipService);
  const { ProductsController: PC } = await import('../../src/products/products.controller.js');
  const { EventsController: EC } = await import('../../src/products/events/events.controller.js');
  const { MetricsController: MC } = await import('../../src/products/metrics/metrics.controller.js');
  const { CatalogController: CC } = await import('../../src/products/catalog/catalog.controller.js');
  const { ConsumersController: KC } = await import('../../src/products/consumers/consumers.controller.js');
  const { SupportController: SC } = await import('../../src/delivery/support/support.controller.js');
  const { ExecutiveController: XC } = await import('../../src/executive/executive.controller.js');
  products = h.app.get(PC); events = h.app.get(EC); metrics = h.app.get(MC); catalog = h.app.get(CC); consumers = h.app.get(KC); support = h.app.get(SC); exec = h.app.get(XC);
  scheduler = h.app.get(SchedulerService); timer = h.app.get(AttentionTimerService);
  steward = await h.humanWithSession(['data_steward'], 'b107dr-steward');
  steward2 = await h.humanWithSession(['data_steward'], 'b107dr-steward-2');
  dadmin = await h.humanWithSession(['domain_admin'], 'b107dr-dadmin');
  dadmin2 = await h.humanWithSession(['domain_admin'], 'b107dr-dadmin-2');
  owner = await h.humanWithSession(['forecast_owner', 'privacy_officer'], 'b107dr-owner');
  owner2 = await h.humanWithSession(['risk_owner'], 'b107dr-owner-2');
  stewardOwner = await h.humanWithSession(['data_steward', 'forecast_owner'], 'b107dr-steward-owner');
  lostOwner = await h.humanWithSession(['forecast_owner'], 'b107dr-lost-owner');
  violOwner = await h.humanWithSession(['forecast_owner'], 'b107dr-viol-owner');
  privacy = await h.humanWithSession(['privacy_officer'], 'b107dr-privacy');
  analyst = await h.humanWithSession(['domain_analyst'], 'b107dr-analyst');
  reviewer = await h.humanWithSession(['executive'], 'b107dr-reviewer');
  agentSteward = await tenantPrincipal('agent', ['data_steward', 'domain_admin'], 'agent-steward', 'human', 'DOMAIN');
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b107dr-tenant-admin', 'TENANT');
  sponsor = await h.humanWithSession(['customer_sponsor'], 'b107dr-sponsor', 'TENANT');
  sponsor2 = await h.humanWithSession(['customer_sponsor'], 'b107dr-sponsor-2', 'TENANT');
  onbAuth = await h.humanWithSession(['onboarding_authority'], 'b107dr-onb-authority', 'TENANT');
  lead = await h.humanWithSession(['implementation_lead'], 'b107dr-lead', 'TENANT');
  cSteward = await platformPerson('conformance-steward', 'human', ['conformance_steward']);
  prodAuth = await platformPerson('product-authority', 'human', ['product_authority']);
  opsAuth = await platformPerson('operations-authority', 'human', ['operations_authority']);
  opsAuth2 = await platformPerson('operations-authority-2', 'human', ['operations_authority']);
  designLead = await platformPerson('design-lead', 'human', ['design_system_authority']);
  contact1 = await platformPerson('contact-1', 'human', ['independent_assurance']);
  contact2 = await platformPerson('contact-2', 'human', ['independent_assurance']);
  platformAgent = await platformPerson('platform-agent', 'agent', ['product_authority'], 'human');
  // ANOTHER DOMAIN of the tenant (fixture scaffolding) and an analyst who lives there
  D2 = uuidv7();
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${D2}::uuid, ${T()}::uuid, ${'b107dr-elsewhere-' + D2.slice(-8)}, 'active', clock_timestamp())`.execute(h.su);
  elsewhere = await h.humanWithSession(['domain_admin'], 'b107dr-elsewhere', 'DOMAIN', { domainId: D2 });
  // THE ATTENTION AGENT: the tick's host (its timer unscheduled; the ticks below are the harness's own)
  const r = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: { kind: 'attention', version: ATTENTION_TIMER_VERSION,
    codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: reviewer.principalId, escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 80, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 86_400 } } }) as { agent: { agentId: string } };
  agentId = r.agent.agentId;
  await sleep(1500);
  await scheduler.unscheduleAttentionTick(T(), D());
  // THE PRODUCTS (B90's registry, its own routes): three released event products and one certified metric
  P1 = await releasedEventProduct(`b107dr-corridor-stream-${RUN}`, 'Corridor warning stream (SYNTHETIC)', owner);
  P2 = await releasedEventProduct(`b107dr-port-stream-${RUN}`, 'Port congestion stream (SYNTHETIC)', lostOwner);
  P3 = await releasedEventProduct(`b107dr-supplier-stream-${RUN}`, 'Supplier risk stream (SYNTHETIC)', violOwner);
  M1 = String((await registerProduct(steward, { key: `b107dr-exposure-${RUN}`, title: 'Corridor exposure (SYNTHETIC)', kind: 'metric', purpose: 'the corridor exposure metric served to the executive view (SYNTHETIC)', ownerPrincipalId: owner.principalId })).product['product_id']);
  await defineMetric(owner, M1, { measure: 'measure_observations', unit: 'EUR', aggregation: 'last', grain: 'month', dimensions: ['measure_id', 'objective_id'], filters: {}, effectiveFrom: await dbAgo('30 days') });
  await certify(owner, M1, 1, await dbAhead('90 days'));
  // THE CATALOG (B90 §K, its own route): the reconciliation catalogues the products and the fixture's source
  await catReconcile(steward);
  A_P1 = await assetOf('product', P1); A_P2 = await assetOf('product', P2); A_P3 = await assetOf('product', P3); A_M1 = await assetOf('product', M1);
  A_SRC = String((await one(sql`select asset_id::text as a from products.catalog_assets where tenant_id = ${T()}::uuid and domain_id = ${D()}::uuid and kind = 'source' order by registered_at limit 1`))['a']);
}, 600_000);

afterAll(async () => {
  try { await scheduler.unscheduleAttentionTick(T(), D()); } catch { /* none */ }
  try { await scheduler.obliterateAttentionTicksForTests(T(), D()); } catch { /* the queue may not exist */ }
  await h?.close();
}, 120_000);

const DUTIES = (over: Row = {}): Row => ({
  owner: owner.principalId, steward: steward2.principalId, custodianRole: 'data_steward', custodian: steward.principalId, producer: 'prediction.warning_events (the warning ledger)', consumerRoles: ['domain_analyst', 'executive'],
  policyAuthorityRole: 'privacy_officer', qualityAuthorityRole: 'data_steward', escalationPath: 'the steward, then the domain administrator, then the onboarding authority',
  evidenceObligation: 'the catalog reconciliation and the event stream ledger every period', writeRights: ['products.event_product.declare', 'products.catalog.owner.set'], ...over,
});
let V1 = '';

describe('DR1 · the data authority registry (V00-T-082, DP-04-001/-002, DAT-GV-01/-04)', () => {
  it('POSITIVE: a steward proposes the duties of the corridor stream; the NAMED owner accepts on the digest; another named human ratifies — registered in the core, resolved live', async () => {
    const a = (await propose(steward, { assetId: A_P1, expectedVersion: 0, duties: DUTIES({ delegatedDuties: [{ duty: 'custodian', to: steward.principalId, until: await dbAhead('30 days') }] }) })).authority;
    expect(a).toMatchObject({ authority_id: A_P1, version: 1, state: 'proposed', owner_principal_id: owner.principalId, steward_principal_id: steward2.principalId, custodian_role: 'data_steward',
      policy_authority_role: 'privacy_officer', quality_authority_role: 'data_steward', asset_kind: 'product', asset_ref: P1, owner_accepted_at: null });
    V1 = String(a['digest']);
    expect(V1).toMatch(/^[0-9a-f]{64}$/);
    expect((await asset(dadmin, A_P1)).resolution).toMatchObject({ state: 'proposed', ratified: null });
    await acceptA(owner, A_P1, { version: 1, digest: V1 });
    const r = (await decideA(dadmin, A_P1, { version: 1, digest: V1, decision: 'ratify' })).authority;
    expect(r).toMatchObject({ state: 'ratified', decided_by: dadmin.principalId });
    expect(r['recertify_by']).not.toBeNull();
    const res = (await asset(analyst, A_P1)).resolution;
    expect(res).toMatchObject({ state: 'resolved', unresolved: [], catalog_agreement: { state: 'agree' } });
    expect(obj(obj(res['duties'])['owner'])).toMatchObject({ principal: owner.principalId, state: 'resolved' });
    expect(obj(obj(res['duties'])['steward'])).toMatchObject({ state: 'resolved' });
    expect(obj(obj(res['duties'])['custodian'])).toMatchObject({ role: 'data_steward', principal: steward.principalId, state: 'resolved' });
    expect(obj(obj(res['duties'])['policy_authority'])).toMatchObject({ role: 'privacy_officer', state: 'resolved' });
    expect(await one(sql`select kind, scope, external_key, lifecycle, owner_principal_id::text as o from governance.artifacts where artifact_id = ${A_P1}::uuid and superseded_at is null`))
      .toEqual({ kind: 'data_authority', scope: 'DOMAIN', external_key: `product:${P1}`, lifecycle: 'active', o: owner.principalId });
    expect(await ledger(A_P1)).toEqual(['authority.proposed', 'authority.owner_accepted', 'authority.ratified']);
  });
  it('REFUSAL: the policy (an analyst), an unknown asset, owner = steward, an inactive owner, a stale version, an open proposal', async () => {
    await refused(propose(analyst, { assetId: A_P2, expectedVersion: 0, duties: DUTIES() }), /no qualifying role binding/, 403);
    await refused(propose(steward, { assetId: uuidv7(), expectedVersion: 0, duties: DUTIES() }), /^data authority rejected \(unknown_asset\)/, 404);
    await refused(propose(steward, { assetId: A_P2, expectedVersion: 0, duties: DUTIES({ owner: steward2.principalId }) }), /^data authority rejected \(separation_of_duties\): the owner and the steward are different people/, 403);
    await refused(propose(steward, { assetId: A_P2, expectedVersion: 0, duties: DUTIES({ owner: uuidv7() }) }), /^data authority rejected \(unknown_owner\): the owner is ONE named, active human/, 404);
    await refused(propose(steward, { assetId: A_P1, expectedVersion: 0, duties: DUTIES() }), /^data authority rejected \(stale\): the latest version is 1/, 409);
    await propose(steward, { assetId: A_P3, expectedVersion: 0, duties: DUTIES({ owner: stewardOwner.principalId }) });
    await refused(propose(steward, { assetId: A_P3, expectedVersion: 1, duties: DUTIES() }), /^data authority rejected \(state\): a proposal for product .* is open \(v1\)/, 409);
  });
  it('REFUSAL: acceptance by another than the named owner, a stale digest; ratification by the proposer, by the OWNER it appoints, by an agent, before the owner accepted', async () => {
    const p = obj((await asset(dadmin, A_P3)).resolution['proposal']);
    await refused(acceptA(owner, A_P3, { version: 1, digest: p['digest'] }), /^data authority rejected \(ownership\): ownership of product .* is accepted by its named owner only/, 403);
    await refused(acceptA(stewardOwner, A_P3, { version: 1, digest: 'a'.repeat(64) }), /^data authority rejected \(stale\)/, 409);
    await refused(decideA(steward, A_P3, { version: 1, digest: p['digest'], decision: 'ratify' }), /^data authority rejected \(separation_of_duties\): ratifying a data authority is never done by its proposer/, 403);
    await refused(decideA(dadmin, A_P3, { version: 1, digest: p['digest'], decision: 'ratify' }), /^data authority rejected \(state\): the named owner has not accepted version 1/, 409);
    await acceptA(stewardOwner, A_P3, { version: 1, digest: p['digest'] });
    await refused(decideA(stewardOwner, A_P3, { version: 1, digest: p['digest'], decision: 'ratify' }), /^data authority rejected \(separation_of_duties\): ratifying a data authority is never done by a builder of the subject/, 403);
    await refused(decideA(agentSteward, A_P3, { version: 1, digest: p['digest'], decision: 'ratify' }), /^data authority rejected \(actor\)/, 403);
    // recovery: REJECTED by another human — the record stays, visible
    expect((await decideA(dadmin, A_P3, { version: 1, digest: p['digest'], decision: 'reject', reason: 'the steward-owner cannot own the supplier stream (SYNTHETIC)' })).authority).toMatchObject({ state: 'rejected' });
  });
  it('RECOVERY: v2 names a new owner — accepted and ratified, v1 SUPERSEDED (never rewritten); the owner recertifies; a non-owner cannot', async () => {
    const v2 = (await propose(steward2, { assetId: A_P1, expectedVersion: 1, duties: DUTIES({ owner: owner2.principalId, steward: steward.principalId }) })).authority;
    await acceptA(owner2, A_P1, { version: 2, digest: v2['digest'] });
    await decideA(dadmin2, A_P1, { version: 2, digest: v2['digest'], decision: 'ratify' });
    expect(await rows(sql`select version, state from governance.data_authorities where authority_id = ${A_P1}::uuid order by version`)).toEqual([{ version: 1, state: 'superseded' }, { version: 2, state: 'ratified' }]);
    expect(await one(sql`select version from governance.artifacts where artifact_id = ${A_P1}::uuid and superseded_at is null`)).toEqual({ version: 2 });
    await refused(recertify(owner, A_P1), /^data authority rejected \(ownership\): ownership of product .* is recertified by its owner/, 403);
    const rc = (await recertify(owner2, A_P1)).authority;
    expect(rc).toMatchObject({ version: 2, state: 'ratified' });
    // the registry now names owner2 while the catalog names owner: CONFLICTING AUTHORITIES (DR3 reconciles it)
    expect(obj((await asset(dadmin, A_P1)).resolution['catalog_agreement'])).toMatchObject({ state: 'conflict', registry_owner: owner2.principalId, catalog_owner: owner.principalId });
    await expect(sql`update governance.data_authorities set owner_principal_id = ${owner2.principalId}::uuid where authority_id = ${A_P1}::uuid and version = 1`.execute(h.su)).rejects.toThrow(/immutable/);
  });
});

describe('DR2 · the domain registry extension (DAT-GV-02)', () => {
  it('REFUSAL: a bad contract, an unknown leader, the policy; ratification by the proposer and by the leader it appoints', async () => {
    await refused(proposeDomain(dadmin, { leader: sponsor.principalId, boundary: 'the corridor intelligence of the NORDWERK supply chain (SYNTHETIC)', contract: { version: '1', extensionPoints: [], compatibility: 'x' } }),
      /^data authority rejected \(contract\)/, 422);
    await refused(proposeDomain(dadmin, { leader: uuidv7(), boundary: 'the corridor intelligence of the NORDWERK supply chain (SYNTHETIC)', contract: { version: 'v1', extensionPoints: ['sources'], compatibility: 'backward' } }),
      /^data authority rejected \(unknown_leader\)/, 404);
    await refused(proposeDomain(analyst, { leader: sponsor.principalId, boundary: 'x'.repeat(20), contract: {} }), /no qualifying role binding/, 403);
    const e = (await proposeDomain(tenantAdmin, { leader: sponsor.principalId, boundary: 'the corridor intelligence of the NORDWERK supply chain (SYNTHETIC)',
      contract: { version: 'v1', extensionPoints: ['sources', 'event products'], compatibility: 'backward', governance: 'observed' } })).entry;
    expect(e).toMatchObject({ version: 1, state: 'proposed', governance_mode: 'observed' });
    await refused(decideDomain(tenantAdmin, { version: 1, digest: e['digest'], decision: 'ratify' }), /^data authority rejected \(separation_of_duties\): ratifying a domain's registry entry is never done by its proposer/, 403);
    await refused(decideDomain(sponsor, { version: 1, digest: e['digest'], decision: 'ratify' }), /^data authority rejected \(separation_of_duties\): .* never done by a builder of the subject/, 403);
  });
  it('POSITIVE: another sponsor ratifies — registered (kind domain), the governance mode observed; the portal shows the leader', async () => {
    const e = obj((await portal(dadmin)).portal['domain']);
    const prop = obj(e['proposal']);
    const r = (await decideDomain(sponsor2, { version: 1, digest: prop['digest'], decision: 'ratify' })).entry;
    expect(r).toMatchObject({ state: 'ratified', decided_by: sponsor2.principalId });
    const d = obj((await portal(dadmin)).portal['domain']);
    expect(d).toMatchObject({ governance_mode: 'observed' });
    expect(obj(d['registry'])).toMatchObject({ accountable_leader: sponsor.principalId, version: 1 });
    expect(await one(sql`select kind, external_key from governance.artifacts where artifact_id = ${D()}::uuid and superseded_at is null`)).toEqual({ kind: 'domain', external_key: `DOMAIN:${D()}` });
  });
});

describe('DR3 · the ownership-gap register and reconciliation (DP-04-005, DP-01-005, DP-41-005)', () => {
  let CONFLICT = '';
  it('POSITIVE: the reconciliation PRESERVES the conflicting instructions (registry v2 vs catalog), HOLDS the asset, raises the governance.ownership item; new consumption STOPS', async () => {
    const r = (await reconcile(steward)).reconciliation;
    expect(r['mode']).toBe('observed');
    const g = await gapOf(A_P1, 'conflicting_authorities');
    expect(g).toMatchObject({ state: 'open', held: true });
    CONFLICT = String(g['gap_id']);
    const instr = arr(obj(g['detail'])['instructions']);
    expect(instr.map((x) => x['owner'])).toEqual([owner2.principalId, owner.principalId]);
    expect((await openHolds(A_P1)).map((x) => x['reason_kind'])).toEqual(['ownership_gap']);
    expect((await itemsOf(A_P1))[0]).toMatchObject({ signal_class: 'governance.ownership', subject_kind: 'asset' });
    // the missing authorities of material assets are LISTED (observed domain: not held)
    expect(await gapOf(A_SRC, 'no_owner')).toMatchObject({ state: 'open', held: false });
    // DP-49-005 / DP-04-005: a NEW subscription stops while the hold stands
    await refused(subscribe(analyst, SUBSCRIPTION(P1)), /^subscription rejected \(state\): product .* is held by governance \(ownership_gap\) — new consumption stops/, 409);
  });
  it('RECOVERY: the governed correction (the catalog owner set to the ratified owner through B90\'s own port) → the next reconciliation RESOLVES the gap, lifts the hold; the subscription is admitted', async () => {
    await catOwner(steward, A_P1, owner2.principalId);
    const r = (await reconcile(steward)).reconciliation;
    expect(arr(r['resolved']).map((x) => x['gap_kind'])).toContain('conflicting_authorities');
    expect(await gapOf(A_P1, 'conflicting_authorities')).toMatchObject({ state: 'resolved' });
    expect(await openHolds(A_P1)).toEqual([]);
    expect((await itemsOf(A_P1)).every((i) => i['state'] === 'closed')).toBe(true);
    const s = (await subscribe(analyst, SUBSCRIPTION(P1))).subscription;
    expect(s).toMatchObject({ state: 'registered' });
    expect(await ledger(CONFLICT)).toEqual(['gap.opened', 'gap.resolved']);
  });
  it('POSITIVE (DP-41-005): the owner of the port stream is LOST — the tick of the registered domain opens owner_lost (held) and DEGRADES the product with its cause', async () => {
    await sql`update identity.principals set status = 'suspended' where id = ${lostOwner.principalId}::uuid`.execute(h.su);
    const t = await tick();
    const step = obj(t.steps['governance-ownership']);
    expect(arr(step['degraded']).map((x) => x['product_key'])).toEqual([`b107dr-port-stream-${RUN}`]);
    expect(arr(step['degraded'])[0]).toMatchObject({ cause: 'owner_lost' });
    expect(await one(sql`select state, degraded_reason from products.products_current where product_id = ${P2}::uuid`)).toMatchObject({ state: 'degraded' });
    const ev = await one(sql`select details from products.product_events where product_id = ${P2}::uuid and event = 'product.degraded'`);
    expect(obj(ev['details'])['by']).toBe('owner_lost');
    expect(await gapOf(A_P2, 'owner_lost')).toMatchObject({ state: 'open', held: true });
  });
  it('REFUSAL: the residual accepted by a steward (not an approver), by an agent, beyond 90 days; the restore without a domain review', async () => {
    const g = await gapOf(A_P2, 'owner_lost');
    await refused(acceptGap(steward, String(g['gap_id']), { until: await dbAhead('7 days'), reason: 'the port stream is read-only until a new owner is named' }), /no qualifying role binding/, 403);
    await refused(acceptGap(agentSteward, String(g['gap_id']), { until: await dbAhead('7 days'), reason: 'the port stream is read-only until a new owner is named' }), /^data authority rejected \(actor\)/, 403);
    await refused(acceptGap(dadmin, String(g['gap_id']), { until: await dbAhead('120 days'), reason: 'the port stream is read-only until a new owner is named' }), /^data authority rejected \(expiry\)/, 422);
    // the identity administrator reactivates the owner (a stated superuser move); a scorecard cannot restore an owner loss — only a domain review
    await sql`update identity.principals set status = 'active' where id = ${lostOwner.principalId}::uuid`.execute(h.su);
    lostOwner = await h.openSession(lostOwner);
    await refused(restore(lostOwner, P2, 'the owner is back (SYNTHETIC)'), /^data product rejected \(review\)/, 409);
  });
  it('RECOVERY: a domain review accepted → the owner restores; the next reconciliation resolves owner_lost; a residual ACCEPTED stays listed (visible) with its hold lifted', async () => {
    await reviewProduct(reviewer, P2, { version: 1, kind: 'domain', outcome: 'accepted', notes: 'the owner is reinstated and the stream reviewed (B107 §DR harness)' });
    expect((await restore(lostOwner, P2, 'restored after the domain review (SYNTHETIC)')).product).toMatchObject({ state: 'released' });
    await reconcile(steward);
    expect(await gapOf(A_P2, 'owner_lost')).toMatchObject({ state: 'resolved' });
    // the source's missing authority: the domain admin accepts the residual until a date — the gap stays LISTED
    const g = await gapOf(A_SRC, 'no_owner');
    const acc = (await acceptGap(dadmin, String(g['gap_id']), { until: await dbAhead('14 days'), reason: 'the source is read-only for the pilot; the steward names its owner next sprint' })).gap;
    expect(acc).toMatchObject({ state: 'accepted', accepted_by: dadmin.principalId });
    expect((await portal(dadmin)).gaps.find((x) => x['gap_id'] === g['gap_id'])).toMatchObject({ state: 'accepted' });
  });
  it('ESCALATION (stale): an open gap older than the escalation age escalates along its path (a C3 item); an ENFORCED domain HOLDS a missing authority', async () => {
    const g = await gapOf(A_M1, 'no_owner');
    expect(g['state']).toBe('open');
    await sql`alter table governance.ownership_gaps disable trigger gog_forward`.execute(h.su);
    await sql`update governance.ownership_gaps set opened_at = clock_timestamp() - interval '4 days' where gap_id = ${String(g['gap_id'])}::uuid`.execute(h.su);
    await sql`alter table governance.ownership_gaps enable trigger gog_forward`.execute(h.su);
    const r = (await reconcile(steward)).reconciliation;
    expect(arr(r['escalated']).some((x) => x['gap_id'] === g['gap_id'])).toBe(true);
    expect(await gapOf(A_M1, 'no_owner')).toMatchObject({ state: 'escalated', escalations: 1 });
    expect((await itemsOf(A_M1)).some((i) => String(i['title']).startsWith('ESCALATED ownership gap'))).toBe(true);
    // the domain moves to ENFORCED (v2 ratified): the next reconciliation holds the metric's missing authority — the executive view stops
    const e = (await proposeDomain(dadmin, { expectedVersion: 1, leader: sponsor.principalId, boundary: 'the corridor intelligence of the NORDWERK supply chain (SYNTHETIC)',
      contract: { version: 'v2', extensionPoints: ['sources', 'event products'], compatibility: 'backward', governance: 'enforced' } })).entry;
    await decideDomain(sponsor2, { version: 2, digest: e['digest'], decision: 'ratify' });
    await reconcile(steward);
    expect(await gapOf(A_M1, 'no_owner')).toMatchObject({ held: true });
    await refused(serve(reviewer, `b107dr-exposure-${RUN}`, 'executive'), /^metric rejected \(state\): metric .* is held by governance \(ownership_gap\) — the executive view stops new consumption/, 409);
    const a = (await serve(analyst, `b107dr-exposure-${RUN}`, 'analyst')).serving;
    expect(String(a['consumption'])).toMatch(/^STOPPED for new consumption: held by governance/);
    // recovery: the metric's authority ratified → resolved, the executive view serves again
    const pr = (await propose(steward, { assetId: A_M1, expectedVersion: 0, duties: DUTIES({ owner: owner.principalId, producer: 'graph.measure_observations' }) })).authority;
    await acceptA(owner, A_M1, { version: 1, digest: pr['digest'] });
    await decideA(dadmin, A_M1, { version: 1, digest: pr['digest'], decision: 'ratify' });
    await reconcile(steward);
    expect(await gapOf(A_M1, 'no_owner')).toMatchObject({ state: 'resolved' });
    expect((await serve(reviewer, `b107dr-exposure-${RUN}`, 'executive')).serving).toMatchObject({ certified: true, consumption: 'trusted' });
  });
});

let CAP_GV01 = ''; let CAP_GV05 = '';
describe('DR4 · the data capability inventory (DP-01-001/-002/-005/-006)', () => {
  it('POSITIVE: the conformance steward imports the DAT-GV rows READ-ONLY (the file untouched, its digest recorded); idempotent on re-import', async () => {
    const file = requirementFile('v07.csv');
    expect(file).not.toBeNull();
    const before = createHash('sha256').update(readFileSync(file!)).digest('hex');
    const imp = (await importCaps(cSteward, { prefix: 'DAT-GV-', owner: prodAuth.principalId, ownerRole: 'product_authority' })).import;
    expect(imp).toMatchObject({ rows: 10, changed: 10, digest: before });
    const again = (await importCaps(cSteward, { prefix: 'DAT-GV-', owner: prodAuth.principalId, ownerRole: 'product_authority' })).import;
    expect(again).toMatchObject({ rows: 10, changed: 0 });
    expect(createHash('sha256').update(readFileSync(file!)).digest('hex')).toBe(before);
    const caps = (await platformRead(prodAuth)).capabilities;
    const gv01 = caps.find((c) => c['dat_key'] === 'DAT-GV-01')!; const gv05 = caps.find((c) => c['dat_key'] === 'DAT-GV-05')!;
    expect(gv01).toMatchObject({ title: 'Data authority registry', capability_group: 'Authority and Governance', layer: 'Governance domain', authority_class: 'Registry / control', lifecycle: 'implemented', owner_principal_id: prodAuth.principalId });
    expect(gv05).toMatchObject({ lifecycle: 'planned', owner_principal_id: null });
    CAP_GV01 = String(gv01['capability_id']); CAP_GV05 = String(gv05['capability_id']);
    expect(await one(sql`select kind, external_key from governance.artifacts where artifact_id = ${CAP_GV01}::uuid and superseded_at is null`)).toEqual({ kind: 'capability', external_key: 'DAT-GV-01' });
  });
  it('REFUSAL: the import by a product authority (the policy), a tenant administrator on the PLATFORM route; the admission before acceptance and before reconciliation (held)', async () => {
    await refused(importCaps(prodAuth, { prefix: 'DAT-GV-' }), /no qualifying role binding/, 403);
    await refused(importCaps(tenantAdmin, { prefix: 'DAT-GV-' }), /no platform authority binding|scope|no qualifying role binding/i, 403);
    const c = obj((await platformRead(prodAuth)).capabilities.find((x) => x['capability_id'] === CAP_GV01));
    await refused(admitCap(opsAuth, CAP_GV01, { version: c['version'], digest: c['digest'] }), /^data authority rejected \(held\): DAT-GV-01 is not admitted — the declaration is unreconciled as last reconciled; the owner has not accepted ownership/, 409);
  });
  it('POSITIVE: reconciled (GV-01 conformant against the database; GV-05 UNRESOLVED — a PLATFORM gap, held); accepted by its owner; admitted by the operations authority (never the owner) — production admission R1', async () => {
    expect((await reconcileCap(cSteward, CAP_GV01)).capability).toMatchObject({ conformance: 'conformant' });
    const r5 = (await reconcileCap(cSteward, CAP_GV05)).capability;
    expect(r5).toMatchObject({ conformance: 'unresolved' });
    expect(await gapOf(CAP_GV05, 'no_owner')).toMatchObject({ state: 'open', held: true });
    const c = obj((await platformRead(prodAuth)).capabilities.find((x) => x['capability_id'] === CAP_GV01));
    await refused(acceptCap(opsAuth, CAP_GV01, { version: c['version'], digest: c['digest'] }), /^data authority rejected \(ownership\)/, 403);
    await acceptCap(prodAuth, CAP_GV01, { version: c['version'], digest: c['digest'] });
    await refused(admitCap(prodAuth, CAP_GV01, { version: c['version'], digest: c['digest'] }), /^data authority rejected \(separation_of_duties\): admitting a data capability is never done by a builder/, 403);
    await refused(admitCap(platformAgent, CAP_GV01, { version: c['version'], digest: c['digest'] }), /^data authority rejected \(actor\)/, 403);
    const a = (await admitCap(opsAuth, CAP_GV01, { version: c['version'], digest: c['digest'] })).capability;
    expect(a).toMatchObject({ admission: 'admitted', admitted_by: opsAuth.principalId });
    expect(String(a['production_admission'])).toMatch(/^R1/);
  });
  it('DRIFT and RECOVERY: a declaration naming a relation the database lacks DRIFTS (held conformance_drift); the corrected declaration is a new version, reconciled conformant, the hold lifted', async () => {
    const run = async (realization: Row, expected: number) => h.pipeline.write(env(cSteward, 'governance.ownership.capability.declare', 'PLATFORM', null, null), cSteward,
      { scope: 'PLATFORM', tenantId: null, domainId: null, action: 'governance.ownership.capability.declare', objectType: 'GDC', objectId: null }, OwnershipCap,
      async (cap) => ({ result: await cap.declareCapability({ capabilityId: null, key: 'DAT-GV-09', title: 'Conformance service', group: 'Authority and Governance', layer: 'Governance domain', authorityClass: 'Registry / control',
        purpose: null, lifecycle: 'implemented', deploymentScope: 'PLATFORM', owner: opsAuth.principalId, ownerRole: 'operations_authority', realization, source: { file: 'harness', row: 0 }, expected, actor: cSteward.principalId,
        correlationId: uuidv7() }), targetType: 'GDC', targetId: null, targetVersion: null, outboxEvent: null }));
    const cur = obj((await platformRead(prodAuth)).capabilities.find((x) => x['dat_key'] === 'DAT-GV-09'));
    const v = (await run({ schemas: ['governance'], relations: ['governance.conformance_runs_b107_missing'], functions: [] }, Number(cur['version']))).result as Row;
    const d = (await reconcileCap(cSteward, String(v['capability_id']))).capability;
    expect(d).toMatchObject({ conformance: 'drift', drift_holds: 1 });
    const v2 = (await run({ schemas: ['governance'], relations: ['governance.data_capabilities'], functions: [] }, Number(v['version']))).result as Row;
    expect((await reconcileCap(cSteward, String(v2['capability_id']))).capability).toMatchObject({ conformance: 'conformant', drift_holds: 0 });
  });
});

let C04 = ''; let C05 = ''; let UNIT = ''; let TR1 = '';
const CHECKLIST = (): Row => Object.fromEntries(['code', 'state', 'contracts', 'dashboards', 'alerts', 'runbooks', 'risks', 'exceptions', 'incidents'].map((k) => [k, { ref: `handover/${k}.md (SYNTHETIC)` }]));
const PROPOSAL = (over: Row = {}): Row => ({ owningTeam: 'Governance platform team (SYNTHETIC)', accountable: designLead.principalId, primaryContact: contact1.principalId, secondaryContact: contact2.principalId,
  operatorRole: 'operations_authority', ownedContracts: ['/v1/governance/ownership', 'IF-GOV-OWN-01'], stateStores: ['governance.data_authorities', 'governance.component_ownerships'],
  policyDecisions: ['governance.ownership.read'], telemetryNamespace: 'eye.governance.ownership', failureDomain: 'api-governance', deployableUnits: ['apps/api'], ...over });
describe('DR5 · component ownership and the ratified transfer (ES-04-001/-002, ES-11-001/-002/-005, PER-19)', () => {
  it('POSITIVE: the component registry (§RG/§CM\'s artifacts, planted) reconciled — every component without a ratified owner is a held PLATFORM gap', async () => {
    C04 = await plantArtifact('component', `L3-C04-${RUN}`, 'Ownership registry component');
    C05 = await plantArtifact('component', `L3-C05-${RUN}`, 'Stewardship case component');
    UNIT = await plantArtifact('deployable_unit', `apps/api-${RUN}`, 'The API deployable unit');
    const r = (await reconcileComponents(cSteward)).reconciliation;
    expect(arr(r['opened']).filter((x) => String(x['component']).endsWith(RUN)).length).toBe(3);
    expect(await gapOf(C04, 'no_owner')).toMatchObject({ state: 'open', held: true });
  });
  it('REFUSAL: the checklist incomplete (named), the same contact twice, an inactive contact, the policy (a design authority without the steward role proposes for another\'s component? — the port: authority)', async () => {
    const cl = CHECKLIST(); delete cl['incidents']; (cl['risks'] as Row)['ref'] = '';
    await refused(proposeT(cSteward, { componentId: C04, proposal: PROPOSAL(), checklist: cl }), /^ownership record rejected \(checklist\): .* missing: incidents, risks/, 422);
    await refused(proposeT(cSteward, { componentId: C04, proposal: PROPOSAL({ secondaryContact: contact1.principalId }), checklist: CHECKLIST() }), /^ownership record rejected \(contacts\): the primary and the secondary contact are two different people/, 422);
    await refused(proposeT(cSteward, { componentId: uuidv7(), proposal: PROPOSAL(), checklist: CHECKLIST() }), /^ownership record rejected \(unknown_component\)/, 404);
    await refused(proposeT(analyst, { componentId: C04, proposal: PROPOSAL(), checklist: CHECKLIST() }), /no platform authority binding|no qualifying role binding/i, 403);
  });
  it('POSITIVE: proposed with the nine items → accepted by the RECEIVING owner → ratified and SIGNED by the product authority (verifiable); the ownership is v1; the gap resolved, the hold lifted, the link owned_by', async () => {
    const t = (await proposeT(cSteward, { componentId: C04, expectedVersion: 0, proposal: PROPOSAL(), checklist: CHECKLIST() })).transfer;
    TR1 = String(t['transfer_id']);
    expect(t).toMatchObject({ state: 'proposed', from_version: null, open_exceptions: [] });
    await refused(acceptT(contact1, TR1, String(t['digest'])), /^ownership record rejected \(ownership\): the transfer of .* is accepted by its receiving accountable owner only/, 403);
    await refused(decideT(prodAuth, TR1, { digest: t['digest'], decision: 'ratify' }), /^ownership record rejected \(state\): transfer .* is proposed — the receiving owner accepts it before it is ratified/, 409);
    expect((await previewT(designLead, TR1)).eligibility).toMatchObject({ can_accept: true });
    await acceptT(designLead, TR1, String(t['digest']));
    const pv = await previewT(prodAuth, TR1);
    expect(pv.eligibility).toMatchObject({ can_ratify: true, reasons: [] });
    const r = (await decideT(prodAuth, TR1, { digest: t['digest'], decision: 'ratify' })).transfer;
    expect(r).toMatchObject({ state: 'ratified', decided_by: prodAuth.principalId });
    expect(obj(r['ownership'])).toMatchObject({ version: 1, owning_team: 'Governance platform team (SYNTHETIC)', accountable_principal_id: designLead.principalId, operator_role: 'operations_authority' });
    const sig = await rows(sql`select subject_kind, signer::text as signer, signer_role, key_id, signature, subject_digest, bound_action from governance.signatures where subject_id = ${TR1}::uuid`);
    expect(sig).toHaveLength(1);
    expect(sig[0]).toMatchObject({ subject_kind: 'ownership_transfer', signer: prodAuth.principalId, signer_role: 'product_authority', bound_action: 'governance.ownership.component.ratify', subject_digest: t['digest'] });
    expect(svc.platformSigner.verify(sig[0] as { key_id: string; signature: string; subject_digest: string })).toBe(true);
    expect(await gapOf(C04, 'no_owner')).toMatchObject({ state: 'resolved' });
    expect(await openHolds(C04)).toEqual([]);
    const own = String(obj(r['ownership'])['ownership_id']);
    expect(await rows(sql`select relation, to_artifact::text as t from governance.links_live where from_artifact = ${C04}::uuid`)).toEqual([{ relation: 'owned_by', t: own }]);
  });
  it('REFUSAL: one owner per contract (ES-11-002); distinguishability on a SHARED unit (ES-04-002); the proposer, a party, an agent ratifying — the agent\'s refused ratification rolls its signature back (the fault)', async () => {
    await refused(proposeT(cSteward, { componentId: C05, proposal: PROPOSAL({ ownedContracts: ['/v1/governance/ownership'] }), checklist: CHECKLIST() }), /^ownership record rejected \(duplicate\): a contract has one owner — \/v1\/governance\/ownership \(owned by L3-C04/, 409);
    await refused(proposeT(cSteward, { componentId: C05, proposal: PROPOSAL({ ownedContracts: ['/v1/tenants'], stateStores: ['governance.stewardship_cases'], policyDecisions: [] }), checklist: CHECKLIST() }),
      /^ownership record rejected \(distinguishability\): .* shares deployable unit\(s\) apps\/api with L3-C04-.* — shared: the telemetry namespace eye.governance.ownership; the failure domain api-governance/, 422);
    const t = (await proposeT(opsAuth, { componentId: C05, proposal: PROPOSAL({ accountable: opsAuth2.principalId, ownedContracts: ['IF-GOV-STW-01'], stateStores: ['governance.stewardship_cases'], policyDecisions: [],
      telemetryNamespace: 'eye.governance.stewardship', failureDomain: 'api-stewardship' }), checklist: CHECKLIST() })).transfer;
    await acceptT(opsAuth2, String(t['transfer_id']), String(t['digest']));
    await refused(decideT(opsAuth, String(t['transfer_id']), { digest: t['digest'], decision: 'ratify' }), /^ownership record rejected \(separation_of_duties\): .* never done by its proposer/, 403);
    await refused(decideT(opsAuth2, String(t['transfer_id']), { digest: t['digest'], decision: 'ratify' }), /^ownership record rejected \(separation_of_duties\): .* never done by a builder of the subject/, 403);
    await refused(decideT(platformAgent, String(t['transfer_id']), { digest: t['digest'], decision: 'ratify' }), /^ownership record rejected \(actor\)/, 403);
    expect(await rows(sql`select signature_id from governance.signatures where subject_id = ${String(t['transfer_id'])}::uuid`)).toEqual([]);
    await refused(decideT(prodAuth, String(t['transfer_id']), { digest: 'b'.repeat(64), decision: 'ratify' }), /^ownership record rejected \(stale\)/, 409);
    expect((await decideT(prodAuth, String(t['transfer_id']), { digest: t['digest'], decision: 'ratify' })).transfer).toMatchObject({ state: 'ratified' });
  });
  it('RECOVERY (ES-11-005): a contact is LOST → contact_lost (held); a TRANSFER of C04 to a new team carries the open exceptions it hands over — v1 superseded, the gap resolved', async () => {
    await sql`update identity.principals set status = 'suspended' where id = ${contact2.principalId}::uuid`.execute(h.su);
    await reconcileComponents(cSteward);
    expect(await gapOf(C04, 'contact_lost')).toMatchObject({ state: 'open', held: true });
    const exc = await plantArtifact('exception', `EXC-OWN-${RUN}`, 'A narrow exception on the ownership component');
    await sql`insert into governance.links (link_id, scope, from_artifact, to_artifact, relation, recorded_by, correlation_id) values (${uuidv7()}::uuid, 'PLATFORM', ${exc}::uuid, ${C04}::uuid, 'excepts', ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await refused(withdrawT(prodAuth, uuidv7()), /^ownership record rejected \(unknown_transfer\)/, 404);
    const t = (await proposeT(designLead, { componentId: C04, expectedVersion: 1, proposal: PROPOSAL({ owningTeam: 'Data governance team (SYNTHETIC)', accountable: opsAuth.principalId, secondaryContact: contact1.principalId,
      primaryContact: designLead.principalId }), checklist: CHECKLIST() })).transfer;
    expect(arr(t['open_exceptions']).map((x) => x['key'])).toEqual([`EXC-OWN-${RUN}`]);
    await acceptT(opsAuth, String(t['transfer_id']), String(t['digest']));
    const r = (await decideT(prodAuth, String(t['transfer_id']), { digest: t['digest'], decision: 'ratify' })).transfer;
    expect(obj(r['ownership'])).toMatchObject({ version: 2, owning_team: 'Data governance team (SYNTHETIC)', accountable_principal_id: opsAuth.principalId });
    expect(await rows(sql`select version, superseded_at is not null as s from governance.component_ownerships where component_artifact = ${C04}::uuid order by version`)).toEqual([{ version: 1, s: true }, { version: 2, s: false }]);
    expect(await gapOf(C04, 'contact_lost')).toMatchObject({ state: 'resolved' });
    await sql`update identity.principals set status = 'active' where id = ${contact2.principalId}::uuid`.execute(h.su);
  });
  it('THE LINT (ES-11-002) and PER-19: this API\'s routes against the owned route prefixes — the PLATFORM ownership routes covered by L3-C04, the rest LISTED unowned; a PLATFORM context reads no customer stewardship content; a PLATFORM gap accepted by an authority', async () => {
    const l = (await lint(prodAuth)).lint;
    expect(arr(l['covered']).some((x) => x['path'] === '/v1/governance/ownership/read' && x['component'] === `L3-C04-${RUN}`)).toBe(true);
    expect(Number(l['unowned_count'])).toBeGreaterThan(50);
    // B107 integration: the listing carries the first 500 unowned routes (sorted by path) with their full COUNT — after the fold the API serves
    // more unowned routes than that, so the domain ownership routes are proven unowned as the complement: served, neither covered nor ambiguous
    const domainRoutes = svc.routes().map((x) => ({ ...x, path: normalisePath(x.path) })).filter((x) => x.path.startsWith('/v1/tenants/:tenantId/domains/:domainId/governance/ownership'));
    expect(domainRoutes.length).toBeGreaterThan(0);
    const listed = [...arr(l['covered']), ...arr(l['ambiguous'])].map((x) => String(x['path']));
    expect(domainRoutes.filter((x) => listed.some((p) => p === x.path))).toEqual([]);
    expect(Number(l['unowned_count'])).toBe(Number(l['routes']) - arr(l['covered']).length - arr(l['ambiguous']).length);
    const seen = await h.pipeline.consequentialRead(env(prodAuth, 'governance.ownership.read', 'PLATFORM', null, null), prodAuth, { scope: 'PLATFORM', tenantId: null, domainId: null, action: 'governance.ownership.read', objectType: null, objectId: null },
      OwnershipCap, async (cap) => cap.call<{ n: number }>(sql`select (select count(*)::int from governance.stewardship_cases) + (select count(*)::int from governance.data_authorities) as n`));
    expect(seen.result[0]!.n).toBe(0);
    expect(Number((await one(sql`select count(*)::int as n from governance.data_authorities`))['n'])).toBeGreaterThan(0);
    const g = await gapOf(UNIT, 'no_owner');
    await refused(acceptPlatformGap(cSteward, String(g['gap_id']), { until: await dbAhead('30 days'), reason: 'the unit is owned through its components for now' }), /no qualifying role binding/, 403);
    expect((await acceptPlatformGap(opsAuth, String(g['gap_id']), { until: await dbAhead('30 days'), reason: 'the unit is owned through its components for now' })).gap).toMatchObject({ state: 'accepted' });
  });
});

let Q1 = ''; let ACC = ''; let EXC = ''; let SLA = ''; let UNOWNED = '';
describe('DR6 · stewardship cases (DP-55-001/-002/-005, DAT-GV-07)', () => {
  it('POSITIVE: a C2 quality case on the corridor stream — its owner resolved, one reviewer, the SLA 5 days and its TIMER; reviewed by another steward; closed with evidence', async () => {
    const c = (await openCase(steward, { kind: 'quality', subjectKind: 'catalog_asset', subjectId: A_P1, title: 'Duplicate warnings in the stream (SYNTHETIC)',
      action: 'deduplicate the stream on the warning id and re-emit', consequence: 'C2' })).case;
    Q1 = String(c['case_id']);
    expect(c).toMatchObject({ state: 'open', owner_principal_id: owner2.principalId, reviewers_required: 1, sla: '5 days', escalation_level: 0 });
    expect(String(c['case_ref'])).toMatch(/^STW-\d{4}$/);
    expect(await rows(sql`select kind, owner_kind from executive.workflow_timers where owner_id = ${Q1}::uuid`)).toEqual([{ kind: 'stewardship.sla', owner_kind: 'stewardship_case' }]);
    const pv = await previewCase(steward2, Q1);
    expect(pv.eligibility).toMatchObject({ can_review: true });
    expect((await previewCase(steward, Q1)).eligibility.reasons).toContain('the one who opened a case never reviews it');
    await refused(reviewCase(steward, Q1, { digest: c['digest'], outcome: 'approve' }), /^stewardship case rejected \(separation_of_duties\): .* never done by its proposer/, 403);
    await refused(reviewCase(analyst, Q1, { digest: c['digest'], outcome: 'approve' }), /no qualifying role binding/, 403);
    await refused(reviewCase(steward2, Q1, { digest: 'c'.repeat(64), outcome: 'approve' }), /^stewardship case rejected \(stale\)/, 409);
    const r = (await reviewCase(steward2, Q1, { digest: c['digest'], outcome: 'approve', conditions: ['the re-emitted stream is reconciled against the source ledger'] })).case;
    expect(r).toMatchObject({ state: 'approved', decision: 'approved', decided_by: steward2.principalId });
    expect(await one(sql`select count(*)::int as n from executive.workflow_timers where owner_id = ${Q1}::uuid and cancelled_at is not null`)).toEqual({ n: 1 });
    await refused(closeCase(owner2, Q1, { note: 'deduplicated and re-emitted (SYNTHETIC)', evidence: [] }), /^stewardship case rejected \(evidence\)/, 422);
    expect((await closeCase(owner2, Q1, { note: 'deduplicated and re-emitted (SYNTHETIC)', evidence: [{ kind: 'ledger', ref: 'products.event_stream reconciliation (SYNTHETIC)' }] })).case).toMatchObject({ state: 'closed' });
    expect(await ledger(Q1)).toEqual(['case.opened', 'case.decided', 'case.closed']);
  });
  it('SEGREGATION (C3 access case): two DISTINCT reviewers; the subject\'s OWNER never decides an access case on its own data; a second review by the same reviewer refused', async () => {
    const c = (await openCase(steward, { kind: 'access', subjectKind: 'catalog_asset', subjectId: A_M1, title: 'Analyst access to the exposure metric (SYNTHETIC)',
      action: 'grant the procurement analysts read access to the metric for the corridor review', consequence: 'C3' })).case;
    ACC = String(c['case_id']);
    expect(c).toMatchObject({ reviewers_required: 2, owner_principal_id: owner.principalId, sla: '2 days' });
    await refused(reviewCase(owner, ACC, { digest: c['digest'], outcome: 'approve' }), /^stewardship case rejected \(separation_of_duties\): .* never done by a builder of the subject/, 403);
    expect((await reviewCase(privacy, ACC, { digest: c['digest'], outcome: 'approve' })).case).toMatchObject({ state: 'in_review', approvals: 1 });
    await refused(reviewCase(privacy, ACC, { digest: c['digest'], outcome: 'approve' }), /^stewardship case rejected \(duplicate\)/, 409);
    expect((await reviewCase(steward2, ACC, { digest: c['digest'], outcome: 'approve' })).case).toMatchObject({ state: 'approved', approvals: 2 });
  });
  it('EXCEPTION EXPIRY: a data exception approved WITH its expiry (none refused); past it the sweep EXPIRES it and HOLDS the subject — new consumption stops; the closure lifts the hold', async () => {
    const c = (await openCase(steward, { kind: 'data_exception', subjectKind: 'product', subjectId: P1, title: 'Lag policy waived for the corridor review (SYNTHETIC)',
      action: 'accept a subscription lag beyond the policy during the corridor review week', consequence: 'C2' })).case;
    EXC = String(c['case_id']);
    await refused(reviewCase(steward2, EXC, { digest: c['digest'], outcome: 'approve' }), /^stewardship case rejected \(expiry\): a data exception is narrow and EXPIRES/, 422);
    await reviewCase(steward2, EXC, { digest: c['digest'], outcome: 'approve', expiresAt: await dbAhead('7 days') });
    await sql`update governance.stewardship_cases set expires_at = clock_timestamp() - interval '1 minute' where case_id = ${EXC}::uuid`.execute(h.su);
    const t = await tick();
    expect(arr(obj(t.steps['governance-stewardship-sla'])['expired']).map((x) => x['kind'])).toContain('data_exception');
    expect((await openHolds(P1)).map((x) => x['reason_kind'])).toContain('exception_expired');
    await refused(subscribe(analyst, SUBSCRIPTION(P1)), /^subscription rejected \(state\): product .* is held by governance \(exception_expired\)/, 409);
    await closeCase(steward2, EXC, { note: 'the review week ended; the lag policy applies again (SYNTHETIC)', evidence: [{ kind: 'note', ref: 'the corridor review minutes (SYNTHETIC)' }] });
    expect(await openHolds(P1)).toEqual([]);
  });
  it('ESCALATION BY CONSEQUENCE: a C3 case past its SLA — the SLA TIMER fires (the tick\'s workflow-timers step), level 1 at C3, the subject HELD until a named reviewer decides', async () => {
    const c = (await openCase(steward, { kind: 'semantic', subjectKind: 'catalog_asset', subjectId: A_P1, title: 'Corridor warning semantics disputed (SYNTHETIC)',
      action: 'redefine the supplier risk score as the 30-day maximum, not the average', consequence: 'C3' })).case;
    SLA = String(c['case_id']);
    await sql`update governance.stewardship_cases set due_at = clock_timestamp() - interval '1 minute' where case_id = ${SLA}::uuid`.execute(h.su);
    await sql`insert into executive.workflow_timers (timer_id, scope, tenant_id, domain_id, owner_kind, owner_id, kind, due_at, payload, created_by, correlation_id)
              values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'stewardship_case', ${SLA}::uuid, 'stewardship.sla', clock_timestamp() - interval '1 minute', '{"planted":true}'::jsonb, ${steward.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await tick();
    const after = await one(sql`select escalation_level, due_at > clock_timestamp() as future from governance.stewardship_cases where case_id = ${SLA}::uuid`);
    expect(after).toEqual({ escalation_level: 1, future: true });
    expect(Number((await one(sql`select count(*)::int as n from executive.workflow_timers where owner_id = ${SLA}::uuid and fired_at is not null`))['n'])).toBeGreaterThanOrEqual(1);
    expect((await openHolds(A_P1)).map((x) => x['reason_kind'])).toContain('evidence_stale');
    expect((await itemsOf(SLA)).some((i) => String(i['title']).includes('past its SLA (level 1, C3)'))).toBe(true);
    // a named reviewer decides (the C3 case needs two): the hold lifts on the decision
    await reviewCase(steward2, SLA, { digest: c['digest'], outcome: 'reject', note: 'the average is the agreed definition (SYNTHETIC)' });
    expect((await openHolds(A_P1)).filter((x) => x['source'] === SLA)).toEqual([]);
  });
  it('AN UNOWNED CASE: its subject resolves to no owner — a case_unowned gap, the subject HELD, approval refused (held); once the authority is ratified the sweep resolves it and approval proceeds', async () => {
    const src = (await catRegister(steward, { kind: 'staging', ref: `b107dr-staging-${RUN}`, title: 'Corridor AIS staging (SYNTHETIC)' })).asset;
    const sid = String(src['asset_id']);
    const c = (await openCase(steward, { kind: 'identity', subjectKind: 'catalog_asset', subjectId: sid, title: 'Duplicate vessel identities (SYNTHETIC)',
      action: 'merge the two vessel identities that share an IMO number', consequence: 'C1' })).case;
    UNOWNED = String(c['case_id']);
    expect(c).toMatchObject({ owner_principal_id: null });
    expect(await gapOf(UNOWNED, 'case_unowned')).toMatchObject({ state: 'open' });
    expect((await openHolds(sid)).map((x) => x['reason_kind'])).toEqual(['ownership_gap']);
    await refused(reviewCase(steward2, UNOWNED, { digest: c['digest'], outcome: 'approve' }), /^stewardship case rejected \(held\): .* lacks an accountable owner/, 409);
    const pr = (await propose(steward2, { assetId: sid, expectedVersion: 0, duties: DUTIES({ owner: owner.principalId, steward: steward.principalId, producer: 'the AIS feed (SYNTHETIC)' }) })).authority;
    await acceptA(owner, sid, { version: 1, digest: pr['digest'] });
    await decideA(dadmin, sid, { version: 1, digest: pr['digest'], decision: 'ratify' });
    const t = await tick();
    expect(arr(obj(t.steps['governance-stewardship-sla'])['owner_resolved']).map((x) => x['case_ref'])).toContain(c['case_ref']);
    expect(await openHolds(sid)).toEqual([]);
    expect((await reviewCase(steward2, UNOWNED, { digest: c['digest'], outcome: 'approve' })).case).toMatchObject({ state: 'approved' });
  });
  it('POLICY VIOLATION (DP-41-005): a classification case on the supplier stream APPROVED by two reviewers — the tick DEGRADES the product with cause policy_violation; withdraw only by the opener', async () => {
    const c = (await openCase(steward, { kind: 'classification', subjectKind: 'product', subjectId: P3, title: 'Supplier stream exposes confidential terms (SYNTHETIC)',
      action: 'reclassify the stream confidential and withhold the contract terms field', consequence: 'C3' })).case;
    await reviewCase(privacy, String(c['case_id']), { digest: c['digest'], outcome: 'approve' });
    await reviewCase(steward2, String(c['case_id']), { digest: c['digest'], outcome: 'approve' });
    const t = await tick();
    expect(arr(obj(t.steps['governance-ownership'])['degraded']).find((x) => x['product_key'] === `b107dr-supplier-stream-${RUN}`)).toMatchObject({ cause: 'policy_violation' });
    expect(obj((await one(sql`select details from products.product_events where product_id = ${P3}::uuid and event = 'product.degraded'`))['details'])['by']).toBe('policy_violation');
    const w = (await openCase(steward, { kind: 'lifecycle', subjectKind: 'catalog_asset', subjectId: A_P1, title: 'Retire the v0 stream alias (SYNTHETIC)', action: 'retire the alias of the corridor stream', consequence: 'C0' })).case;
    await refused(withdrawCase(steward2, String(w['case_id'])), /^stewardship case rejected \(authority\): a case is withdrawn by the one who opened it/, 403);
    expect((await withdrawCase(steward, String(w['case_id']))).case).toMatchObject({ state: 'withdrawn' });
  });
});

let REC = '';
describe('DR7 · the responsibility evidence record (DP-01-006, DP-04-006, DP-55-006 — R1 never claimed)', () => {
  it('REFUSAL: a period in the future; the attestation HELD without an approved, signed responsibility matrix; the assembler never attests', async () => {
    await refused(assemble(steward, { from: await dbAgo('2 days'), to: await dbAhead('1 day') }), /^data authority rejected \(period\)/, 422);
    const r = (await assemble(steward, { from: await dbAgo('1 day'), to: await dbAgo('1 second') })).record;
    expect(r).toMatchObject({ state: 'assembled', claim: 'demonstration', matrix: { state: 'missing' } });
    await refused(attest(onbAuth, String(r['record_id']), { digest: r['digest'], decision: 'attest' }), /^data authority rejected \(held\): the record carries no approved, signed responsibility matrix/, 409);
    expect((await attest(onbAuth, String(r['record_id']), { digest: r['digest'], decision: 'reject', reason: 'no signed matrix for the period (SYNTHETIC)' })).record).toMatchObject({ state: 'rejected' });
  });
  it('POSITIVE: over B94\'s approved, SIGNED matrix the record binds the build identity, the authorities, the stewardship queue (SLA, a clean segregation test, exception ageing, the override review, a sample) — attested and SIGNED by the onboarding authority', async () => {
    const m = (await support.proposeMatrix(h.req(lead, 'service.matrix.propose', 'RSM', null, 'service'), T(), D(), { payload: { rows: VOCAB_ROWS(), expectedVersion: 0 } }) as { matrix: Row }).matrix;
    await support.decideMatrix(h.req(onbAuth, 'service.matrix.decide', 'RSM', String(m['matrix_id']), 'service'), T(), D(), String(m['matrix_id']),
      { payload: { version: 1, decision: 'approve', digest: m['digest'], reason: 'the responsibilities read against the operating model (SYNTHETIC)' } });
    const r = (await assemble(steward, { from: await dbAgo('1 day'), to: await dbAgo('0 seconds') })).record;
    REC = String(r['record_id']);
    expect(r).toMatchObject({ matrix: { state: 'approved', version: 1 }, claim: 'demonstration' });
    expect(String(r['production_admission'])).toMatch(/^R1: production admission/);
    const b = obj(r['bound']);
    expect(String(b['migration_head'])).toMatch(/^01(1[5-9]|[2-9]\d)_/);  // the newest applied migration (0115 or later)
    expect(b['policy_bundle_version']).toBeTruthy();
    const st = obj(r['stewardship']);
    expect(obj(st['segregation'])).toMatchObject({ decided_by_opener: 0, reviewed_by_opener: 0, exception_approved_by_owner: 0 });
    expect(Number(st['decided'])).toBeGreaterThanOrEqual(4);
    expect(arr(st['exception_ageing']).length).toBeGreaterThanOrEqual(1);
    expect(arr(st['override_review']).length).toBeGreaterThanOrEqual(1);
    expect(arr(st['sample']).length).toBeGreaterThan(0);
    await refused(attest(steward, REC, { digest: r['digest'], decision: 'attest' }), /no qualifying role binding/, 403);
    const a = (await attest(onbAuth, REC, { digest: r['digest'], decision: 'attest' })).record;
    expect(a).toMatchObject({ state: 'attested', decided_by: onbAuth.principalId });
    const sig = await one(sql`select subject_kind, signer::text as signer, key_id, signature, subject_digest from executive.signatures where signature_id = ${String(a['signature_id'])}::uuid`);
    expect(sig).toMatchObject({ subject_kind: 'responsibility_matrix', signer: onbAuth.principalId, subject_digest: r['digest'] });
    expect(svc.signer.verify(sig as { key_id: string; signature: string; subject_digest: string }, PUBLIC_PEM)).toBe(true);
    await expect(sql`update governance.responsibility_evidence set claim = 'acceptance' where record_id = ${REC}::uuid`.execute(h.su)).rejects.toThrow();
  });
});

describe('DR8 · the carried B90 residuals (DP-49-005, DP-49-006, §B90.9 #5)', () => {
  it('DP-49-005 · the catalog\'s trust consulted: an UNTRUSTED product stops a new subscription and the executive serving (the analyst view marked); the trust restored, both proceed; an uncatalogued product is coverage debt, recorded', async () => {
    // the domain is ENFORCED (DR3): the port stream's authority is ratified first, so only the catalog's trust is in question here
    const pr = (await propose(steward, { assetId: A_P2, expectedVersion: 0, duties: DUTIES({ owner: lostOwner.principalId }) })).authority;
    await acceptA(lostOwner, A_P2, { version: 1, digest: pr['digest'] });
    await decideA(dadmin, A_P2, { version: 1, digest: pr['digest'], decision: 'ratify' });
    await reconcile(steward);
    expect(await openHolds(A_P2)).toEqual([]);
    await catFlag(steward, A_P2, 'inconsistent');
    await refused(subscribe(analyst, SUBSCRIPTION(P2)), /^subscription rejected \(state\): product .* is untrusted in the catalog \(flags: [a-z_, ]*inconsistent[a-z_, ]*\) — new consumption stops/, 409);
    await catFlag(steward, A_P2, 'inconsistent', true);
    const s = (await subscribe(analyst, SUBSCRIPTION(P2))).subscription;
    const ev = await one(sql`select details from products.product_events where product_id = ${P2}::uuid and event = 'subscription.registered' and details ->> 'subscription_id' = ${String(s['subscription_id'])}`);
    expect(obj(obj(ev['details'])['catalog_trust'])).toMatchObject({ known: true, trusted: true });
    await catFlag(steward, A_M1, 'inconsistent');
    await refused(serve(reviewer, `b107dr-exposure-${RUN}`, 'executive'), /^metric rejected \(state\): metric .* is untrusted in the catalog — the executive view stops new consumption/, 409);
    expect(String((await serve(analyst, `b107dr-exposure-${RUN}`, 'analyst')).serving['consumption'])).toMatch(/^STOPPED for new consumption: untrusted in the catalog/);
    await catFlag(steward, A_M1, 'inconsistent', true);
    expect((await serve(reviewer, `b107dr-exposure-${RUN}`, 'executive')).serving).toMatchObject({ consumption: 'trusted' });
  });
  it('DP-49-006 · the lineage-retirement port: refused to the policy, without a reason, twice; the retirement EVIDENCE on the catalog ledger; nothing inferred until the next reconciliation', async () => {
    const e = (await catLineage(steward, A_SRC, A_P1, 'feeds')).edge;
    const edge = String(e['edge_id']);
    await refused(retire(analyst, edge, { reason: 'the feed no longer reaches the stream' }), /^lineage rejected \(authority\): lineage is retired by a data steward or by the owner of either asset/, 403);
    await refused(retire(steward, edge, { reason: 'short' }), /reason/, 422);
    const r = (await retire(steward, edge, { reason: 'the AIS feed was replaced by the port authority feed (SYNTHETIC)', evidence: { change: 'CHG-SYNTHETIC-1' } })).edge;
    expect(r['retired_at']).not.toBeNull();
    const ledgerRow = await one(sql`select details from products.catalog_events where event = 'lineage.retired' and details ->> 'edge_id' = ${edge}`);
    expect(obj(ledgerRow['details'])).toMatchObject({ reason: 'the AIS feed was replaced by the port authority feed (SYNTHETIC)', evidence: { change: 'CHG-SYNTHETIC-1' } });
    await refused(retire(steward, edge, { reason: 'retired again by mistake (SYNTHETIC)' }), /^lineage rejected \(state\): edge .* was retired at/, 409);
    expect(arr((await catRead(steward, A_P1)).asset['upstream']).find((u) => u['edge_id'] === edge)).toBeUndefined();
  });
  it('§B90.9 #5 · "registry row gone → orphan": a schema registry row catalogued, then DELETED (a stated superuser move — no port deletes one) → the next reconciliation flags the entry orphan, undiscoverable', async () => {
    const type = `B107DR${RUN.toUpperCase().replace(/[^A-Z0-9]/g, 'X')}`;
    await sql`insert into objects.schema_registry (object_type, schema_version, json_schema) values (${type}, 'v1', '{"type":"object"}'::jsonb)`.execute(h.su);
    await catReconcile(steward);
    const id = await assetOf('schema', `${type}@v1`);
    expect(await one(sql`select discoverable from products.catalog_assets where asset_id = ${id}::uuid`)).toEqual({ discoverable: true });
    await sql`delete from objects.schema_registry where object_type = ${type}`.execute(h.su);
    await catReconcile(steward);
    const a = await one(sql`select discoverable, flags from products.catalog_assets where asset_id = ${id}::uuid`);
    expect(a['discoverable']).toBe(false);
    expect(arr(a['flags']).map((f) => f['kind'])).toContain('orphan');
  });
});

describe('DR9 · the reads (DAT-GV-03, DAT-GV-10), isolation, cross-tenant, replay', () => {
  it('THE PORTAL: the customer\'s duties (B94\'s matrix rows resolved live, every asset\'s authority), the platform\'s (components, capabilities, the operator rule), approvals, evidence, escalations', async () => {
    const p = (await portal(dadmin)).portal;
    const cd = obj(p['customer_duties']);
    expect(obj(cd['matrix'])).toMatchObject({ state: 'approved', version: 1 });
    expect(arr(cd['responsibilities']).map((r) => r['key']).sort()).toEqual(['domain.operation', 'evidence.custody', 'risk.ownership', 'support.access']);
    expect(arr(cd['data_authorities']).find((a) => a['asset_id'] === A_P1)).toMatchObject({ state: 'ratified', version: 2, owner: owner2.principalId });
    expect(arr(cd['data_authorities']).some((a) => a['state'] === 'undeclared')).toBe(true);
    const pd = obj(p['platform_duties']);
    expect(arr(pd['components']).find((c) => c['component'] === `L3-C04-${RUN}`)).toMatchObject({ owning_team: 'Data governance team (SYNTHETIC)', operator_role: 'operations_authority', version: 2 });
    expect(String(pd['operator_rule'])).toMatch(/^PER-19/);
    expect(arr(p['approvals']).map((a) => a['event'])).toEqual(expect.arrayContaining(['authority.ratified', 'domain.ratified', 'gap.accepted', 'case.decided', 'evidence.attested']));
    expect(arr(p['evidence']).find((e) => e['record_id'] === REC)).toMatchObject({ state: 'attested', claim: 'demonstration' });
  });
  it('THE DATA PRODUCT REGISTRY VIEW: purpose, contracts, consumers, SLOs, lifecycle and the governance (authority, holds)', async () => {
    const list = (await productsRead(analyst)).products;
    const p1 = list.find((x) => x['product_id'] === P1)!;
    expect(p1).toMatchObject({ kind: 'event', state: 'released', purpose: expect.stringContaining('Corridor warning stream') });
    expect(obj(obj(p1['governance'])['authority'])).toMatchObject({ owner: owner2.principalId, version: 2 });
    expect(list.find((x) => x['product_id'] === P3)).toMatchObject({ state: 'degraded' });
  });
  it('ISOLATION and CROSS-TENANT: another domain\'s administrator reads its own (empty) portal and is refused this domain\'s asset; an asset of this domain read under another domain is refused by scope', async () => {
    const other = (await portal(elsewhere, D2)).portal;
    expect(arr(obj(other['customer_duties'])['data_authorities'])).toEqual([]);
    expect(await refusal(dc.asset(dq(elsewhere, 'governance.ownership.read', D2), T(), D2, A_P1))).toMatchObject({ status: 404 });
    await refused(dc.asset(dq(elsewhere, 'governance.ownership.read', D2), T(), D(), A_P1), /scope|tenant|domain|denied|not permitted/i, 403);
  });
  it('RLS: every §DR table FORCES row-level security, append-only or forward-only by trigger; no runtime role holds a write grant', async () => {
    const mine = ['component_ownerships', 'component_transfers', 'data_authorities', 'data_capabilities', 'domain_registry', 'ownership_gaps', 'responsibility_evidence', 'stewardship_cases'];
    const forced = await rows(sql`select c.relname as t, c.relforcerowsecurity as f from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'governance' and c.relkind = 'r' and c.relname = any(${mine}::text[]) order by 1`);
    expect(forced.map((r) => r['t'])).toEqual(mine);
    expect(forced.every((r) => r['f'] === true)).toBe(true);
    const writes = await rows(sql`select table_name, grantee, privilege_type from information_schema.role_table_grants where table_schema = 'governance' and table_name = any(${mine}::text[])
      and grantee in ('eye_app', 'eye_commit') and privilege_type <> 'SELECT'`);
    expect(writes).toEqual([]);
    const trig = await rows(sql`select c.relname as t, count(*)::int as n from pg_trigger g join pg_class c on c.oid = g.tgrelid join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'governance' and c.relname = any(${mine}::text[]) and not g.tgisinternal group by 1 order by 1`);
    expect(trig.map((r) => r['t'])).toEqual(mine);
  });
  it('REPLAY: the ledger reconstructs the corridor stream\'s authority — every version, who acted, in order; the ledger is append-only', async () => {
    const ev = await rows(sql`select event, version, actor_principal_id::text as actor from governance.events where subject_id = ${A_P1}::uuid order by occurred_at, event_id`);
    expect(ev.map((e) => `${String(e['event'])}@${String(e['version'])}`)).toEqual(['authority.proposed@1', 'authority.owner_accepted@1', 'authority.ratified@1', 'authority.proposed@2',
      'authority.owner_accepted@2', 'authority.ratified@2', 'authority.recertified@2']);
    expect(ev[2]!['actor']).toBe(dadmin.principalId); expect(ev[5]!['actor']).toBe(dadmin2.principalId);
    await expect(sql`delete from governance.events where subject_id = ${A_P1}::uuid`.execute(h.su)).rejects.toThrow(/append/i);
  });
});
