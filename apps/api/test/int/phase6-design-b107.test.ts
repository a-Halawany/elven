/**
 * CP-6 B107 §DG (migration 0115_b107_x_dg; F-P7-E-17) — DESIGN GOVERNANCE on a real database through the real routes, pipeline and ports, with
 * named humans holding sessions of their own (the ports compare the acting principal). CONSTRUCTION evidence: every persona, asset,
 * requirement, finding, action and record here is SYNTHETIC (the B92 finding and action and the §RG requirement / test artifacts are
 * PLANTED by the superuser — their own parts' ports are proven in their harnesses); a design acceptance by a synthetic persona demonstrates
 * the software only (`claim = demonstration`); the independent conformance package is generated and left UNSIGNED (R2 / H3).
 *
 *   DG1 · PRINCIPLES AND THE LINT (UX-03-001/-002/-003, UX-ADR-002): the seeded registry (unwaivable four); the lint over the REAL web source
 *         (conformant) and over planted files (each rule); a principle versioned by the authority; refusals (the steward — PDP; a machine —
 *         port; an unwaivable principle relaxed — boundary; a stale version); recovery.
 *   DG2 · ASSETS AND OWNERSHIP (REL-01): the inventory of the real repository (registered, then idempotent — REPLAY), drift reported and
 *         nothing changed; approval with one accountable owner; refusals (the registrar — SoD; an agent owner; a stale digest; unknown).
 *   DG3 · THE BASELINE (UX-01-001…005, UX-ADR-001): registered; attestation HELD on an ownership gap (the hold committed, the proposal
 *         preserved); CORRECTION: the owner named → attested and SIGNED; compare v1/v2; reject v2 (v1 stays in force); refusals.
 *   DG4 · NARROW EXPIRING EXCEPTIONS (UX-03-003/-006, ES-02-004): requested, approved and signed; a review finding `excepted`; refusals (the
 *         asset's owner, the requester, an unwaivable principle, > 90 days, a broadening renewal); EXPIRY: the finding open again.
 *   DG5 · THE CONTRIBUTION QUEUE (UX-72-001…005): propose → review HELD (evidence) → amend → review → accept (SIGNED) → publish → adopt
 *         (divergent → HELD; recovery) → measure → close; a change publishes the next version; a constitutional amendment ratified by the
 *         product authority only; a deprecation that would strand consumers HELD, migrated, retired; refusals (proposer, builder, agent, stale).
 *   DG6 · EXPERIENCE LEARNING (UX-ADR-024) + REL-23: a B92 design_change_proposal → a contribution proposal (route and tick; idempotent);
 *         telemetry never modifies a pattern; refusals (another kind, unknown, PDP, cross-tenant); the telemetry evidence read.
 *   DG7 · DESIGN ACCEPTANCE (UX-ADR-023, REL-24, ES-71-002): the exact tuple; attested per obligation by distinct humans and SIGNED → accepted;
 *         refusals (one person two obligations, the wrong role, a builder, a machine, a stale digest, expired evidence, a component outside
 *         the baseline, the tuple, cross-tenant); the tick WITHHOLDS on expiry (attention raised); recovery v2; the claim CHECK.
 *   DG8 · THE TRACE (UX-08-001…005, REL-02): links recorded; the bidirectional trace; orphans and contradictions stated; refusals; retire.
 *   DG9 · THE CONFORMANCE PACKAGE (UX-70-006, UX-66-006): generated UNSIGNED with the tuple, aged evidence, findings (MET-034 unsupported);
 *         refusals (PDP, target, unknown, a signed flag); FAULT: no signing key bound → the attestation refused 409 and nothing written.
 *   DG10 · BOUNDARIES: RLS forced on every §DG table; the ledger reconstructs the acts (REPLAY); cross-tenant reads see nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash, generateKeyPairSync, randomBytes } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { SignatureService } from '../../src/executive/signatures/signature.service.js';
import { DesignDomainController, DesignPlatformController } from '../../src/governance/design/design.controller.js';
import { Phase4Harness } from './phase4-helpers.js';

// THE SIGNING KEY (the B36 signer's discipline): generated here, bound in the process before the boot.
const KEY = generateKeyPairSync('ed25519');
const KEY_B64 = KEY.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = KEY_B64;

type Row = Record<string, unknown>;
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';
let h: Phase4Harness; let pc: DesignPlatformController; let dc: DesignDomainController;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
let U = ''; let DU = '';
const RUN = uuidv7().slice(-6);
const hex = () => randomBytes(32).toString('hex');
const signer = new SignatureService();

// ── personas (SYNTHETIC) ─────────────────────────────────────────────────────────────────────────
let dsa: AuthenticatedPrincipal;        // the Design System Authority (a named human)
let dsa2: AuthenticatedPrincipal;       // a second Design System Authority (becomes a BUILDER of one contribution)
let ownerDsa: AuthenticatedPrincipal;   // a Design System Authority who OWNS assets (ES-02-004 probe)
let steward: AuthenticatedPrincipal;    // the conformance steward (registers, proposes, evaluates — approves nothing)
let product: AuthenticatedPrincipal;    // the product authority (ratifies a constitutional amendment)
let assurance: AuthenticatedPrincipal;  // independent assurance
let dual: AuthenticatedPrincipal;       // holds BOTH the design authority and independent assurance (one person, one obligation)
let machine: AuthenticatedPrincipal;    // an AGENT holding the design authority whose session claims a human (the PEP passes; the PORT refuses)
let agentSteward: AuthenticatedPrincipal; // an honest AGENT holding the steward role (may propose; never approves)
let sponsor: AuthenticatedPrincipal;    // the customer sponsor (TENANT)
let dadmin: AuthenticatedPrincipal;     // the domain admin
let pao: AuthenticatedPrincipal;        // the product analytics owner (DOMAIN; B92)
let auditor: AuthenticatedPrincipal;    // the tenant's auditor
let uSponsor: AuthenticatedPrincipal;   // another tenant's sponsor (cross-tenant)
let uAdmin: AuthenticatedPrincipal;     // another tenant's domain admin (cross-tenant reads)
let agentId = '';

async function person(label: string, kind: 'human' | 'agent', scope: Scope, roles: Array<{ role: string; scope: Scope }>, o: { claim?: 'human' | 'agent'; tenant?: string; domain?: string | null } = {}): Promise<AuthenticatedPrincipal> {
  const id = uuidv7(); const t = scope === 'PLATFORM' ? null : (o.tenant ?? T()); const d = scope === 'DOMAIN' ? (o.domain ?? D()) : null;
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${scope}, ${t}::uuid, ${d}::uuid, ${`b107dg-${label}-${RUN} (SYNTHETIC)`}, ${`b107dg-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r.role, scope: r.scope, tenantId: r.scope === 'PLATFORM' ? null : (o.tenant ?? T()), domainId: r.scope === 'DOMAIN' ? (o.domain ?? D()) : null }));
  for (const b of bindings) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  }
  const claim = o.claim ?? kind;
  return h.openSession({ ...h.manager, principalId: id, kind: claim === 'agent' ? 'agent' : 'human', assurance: claim === 'agent' ? 'agent_grant' : 'password', homeScope: scope, homeTenantId: t, homeDomainId: d, bindings } as AuthenticatedPrincipal);
}
const P = (role: string) => ({ role, scope: 'PLATFORM' as Scope });

// ── envelopes and routes (in process) ──────────────────────────────────────────────────────────────
function env(p: AuthenticatedPrincipal, action: string, scope: Scope, t: string | null, d: string | null): Envelope {
  return { message_id: uuidv7(), scope, tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: 'governance', action,
           side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C2', object_type: null, object_id: null, schema_version: 'v1',
           issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b107-design' } as unknown as Envelope;
}
const preq = (p: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: env(p, action, 'PLATFORM', null, null), eyePrincipal: p }) as never;
const dreq = (p: AuthenticatedPrincipal, action: string, t = T(), d = D()) => ({ eyeEnvelope: env(p, action, 'DOMAIN', t, d), eyePrincipal: p }) as never;
const W = async (p: Promise<unknown>) => (await p) as Row;

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string; body: Row }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e), body: {} };
  const r = mapped.getResponse() as Row;
  return { status: mapped.getStatus(), message: String(r['message'] ?? (e instanceof Error ? e.message : '')), body: r };
};
/** The pipeline's scope / PDP denial (its words differ by where the binding fails: no binding for the route's tenant or domain, no PLATFORM binding, no qualifying role). */
const DENIED = /no qualifying role binding|has no binding for this|no platform authority binding|human gate/;
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const n = async (q: ReturnType<typeof sql>) => Number((await one(q))['n'] ?? 0);
const events = async (subject: string) => (await rows(sql`select event from governance.events where subject_id = ${subject}::uuid order by occurred_at, event_id`)).map((r) => String(r['event']));

// the acts
const workspace = (as = steward) => W(pc.read(preq(as, 'governance.read')));
const register = (as: AuthenticatedPrincipal, assets?: Row[]) => W(pc.registerAssets(preq(as, 'governance.design.asset.register'), { payload: assets === undefined ? {} : { assets } }));
const approve = (as: AuthenticatedPrincipal, assetId: string, payload: Row) => W(pc.approveAsset(preq(as, 'governance.design.asset.approve'), assetId, { payload: { reason: 'the asset is the controlled one (SYNTHETIC)', ...payload } }));
const declare = (as: AuthenticatedPrincipal, payload: Row) => W(pc.declarePrinciple(preq(as, 'governance.design.principle.declare'), { payload: { reason: 'a principle version declared by the harness (SYNTHETIC)', ...payload } }));
const lint = (as: AuthenticatedPrincipal, files?: Array<{ path: string; text: string }>) => W(pc.lint(preq(as, 'governance.design.evaluate'), { payload: files === undefined ? {} : { files } }));
const review = (as: AuthenticatedPrincipal, payload: Row) => W(pc.review(preq(as, 'governance.design.evaluate'), { payload: { notes: 'a named reviewer read the asset against the principles (SYNTHETIC)', ...payload } }));
const requestX = (as: AuthenticatedPrincipal, payload: Row) => W(pc.requestException(preq(as, 'governance.design.exception.request'), { payload: { reason: 'conformance cannot yet be achieved for this one asset (SYNTHETIC)', compensating: 'the receipt is shown beside the control', ...payload } }));
const decideX = (as: AuthenticatedPrincipal, id: string, payload: Row) => W(pc.decideException(preq(as, 'governance.design.exception.decide'), id, { payload: { reason: 'narrow and time-boxed (SYNTHETIC)', ...payload } }));
const propose = (as: AuthenticatedPrincipal, payload: Row) => W(pc.propose(preq(as, 'governance.design.contribution.propose'), { payload }));
const amend = (as: AuthenticatedPrincipal, id: string, payload: Row) => W(pc.amend(preq(as, 'governance.design.contribution.amend'), id, { payload }));
const step = (as: AuthenticatedPrincipal, id: string, s: string, payload: Row) => W(pc.step(preq(as, `governance.design.contribution.${s}`), id, s, { payload: { reason: `the ${s} step, recorded by the harness (SYNTHETIC)`, ...payload } }));
const proposeB = (as: AuthenticatedPrincipal, payload: Row) => W(pc.proposeBaseline(preq(as, 'governance.design.baseline.propose'), { payload }));
const decideB = (as: AuthenticatedPrincipal, id: string, payload: Row) => W(pc.decideBaseline(preq(as, 'governance.design.baseline.decide'), id, { payload: { reason: 'the baseline read against Volume 9 (SYNTHETIC)', ...payload } }));
const link = (as: AuthenticatedPrincipal, payload: Row) => W(pc.link(preq(as, 'governance.design.link.record'), { payload }));
const trace = (as: AuthenticatedPrincipal, payload: Row) => W(pc.trace(preq(as, 'governance.read'), { payload }));
const dread = (as: AuthenticatedPrincipal, t = T(), d = D()) => W(dc.read(dreq(as, 'governance.read', t, d), t, d));
const intake = (as: AuthenticatedPrincipal, actionId: string | null, t = T(), d = D()) => W(dc.intake(dreq(as, 'governance.design.intake', t, d), t, d, { payload: actionId === null ? {} : { actionId } }));
const proposeA = (as: AuthenticatedPrincipal, payload: Row) => W(dc.proposeAcceptance(dreq(as, 'governance.design.acceptance.propose'), T(), D(), { payload }));
const attest = (as: AuthenticatedPrincipal, id: string, payload: Row, t = T(), d = D()) => W(dc.attest(dreq(as, 'governance.design.acceptance.attest', t, d), t, d, id, { payload: { reason: 'attested against the exact tuple (SYNTHETIC)', ...payload } }));
const generate = (as: AuthenticatedPrincipal, payload: Row) => W(dc.generate(dreq(as, 'governance.design.package.generate'), T(), D(), { payload }));

let slot = 0;
const tick = async () => {
  const timer = h.app.get(AttentionTimerService);
  const o = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2036, 0, 1) + (slot++) * 60_000) });
  expect(o.outcome, JSON.stringify(o.run?.outputs ?? o.stopReason).slice(0, 600)).toBe('finished');
  return (o.run?.outputs['steps'] ?? {}) as Record<string, Row>;
};
const asset = async (key: string) => one(sql`select asset_id::text, version, status, digest, owner_principal_id::text, consumers from governance.design_assets where asset_key = ${key} and superseded_at is null`);
/** A planted asset (SYNTHETIC — the inventory port registers it, as the TS reader would). */
const plantAsset = async (key: string, kind = 'design_component', consumers: string[] = []) => {
  const r = await register(steward, [{ kind, key, title: `${key} (SYNTHETIC)`, sourceRef: `apps/web/components/synthetic.tsx#${key}`, packageVersion: '0.0.1', sourceDigest: hex(), consumers }]);
  return String((((r['inventory'] as Row)['registered'] as Row[])[0] as Row)['asset_id']);
};
const approveOwned = async (assetId: string, owner: AuthenticatedPrincipal) => {
  const a = await one(sql`select version, digest from governance.design_assets where asset_id = ${assetId}::uuid and superseded_at is null`);
  return approve(dsa, assetId, { version: a['version'], digest: a['digest'], ownerPrincipalId: owner.principalId });
};

// shared state across the groups
let CONFORMANT_EVAL = ''; let NONCONF_EVAL = ''; let BUTTON = ''; let BANNER = ''; let PATTERN = ''; let BASELINE = ''; let B1DIGEST = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  pc = h.app.get(DesignPlatformController); dc = h.app.get(DesignDomainController);
  U = uuidv7(); DU = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${U}::uuid, ${'b107dg-other-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${DU}::uuid, ${U}::uuid, ${'b107dg-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
  dsa = await person('dsa', 'human', 'PLATFORM', [P('design_system_authority')]);
  dsa2 = await person('dsa2', 'human', 'PLATFORM', [P('design_system_authority')]);
  ownerDsa = await person('owner-dsa', 'human', 'PLATFORM', [P('design_system_authority')]);
  steward = await person('steward', 'human', 'PLATFORM', [P('conformance_steward')]);
  product = await person('product', 'human', 'PLATFORM', [P('product_authority')]);
  assurance = await person('assurance', 'human', 'PLATFORM', [P('independent_assurance')]);
  dual = await person('dual', 'human', 'PLATFORM', [P('design_system_authority'), P('independent_assurance')]);
  machine = await person('machine', 'agent', 'PLATFORM', [P('design_system_authority'), P('independent_assurance')], { claim: 'human' });
  agentSteward = await person('agent-steward', 'agent', 'PLATFORM', [P('conformance_steward')]);
  sponsor = await person('sponsor', 'human', 'TENANT', [{ role: 'customer_sponsor', scope: 'TENANT' }]);
  dadmin = await person('dadmin', 'human', 'DOMAIN', [{ role: 'domain_admin', scope: 'DOMAIN' }]);
  pao = await person('pao', 'human', 'DOMAIN', [{ role: 'product_analytics_owner', scope: 'DOMAIN' }]);
  auditor = await person('auditor', 'human', 'TENANT', [{ role: 'auditor', scope: 'TENANT' }]);
  uSponsor = await person('u-sponsor', 'human', 'TENANT', [{ role: 'customer_sponsor', scope: 'TENANT' }], { tenant: U });
  uAdmin = await person('u-admin', 'human', 'DOMAIN', [{ role: 'domain_admin', scope: 'DOMAIN' }], { tenant: U, domain: DU });
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const exec = h.app.get(Ec);
  const tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b107dg-tenant-admin', 'TENANT');
  await exec.publishAttentionPolicy(h.req(dadmin, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T(), D(), { payload: {
    reason: 'B107 §DG harness: governance acceptance items to the domain administrators',
    rules: { classes: { 'governance.acceptance': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['domain_admin'], ack_within_minutes: 240, escalate_to_roles: ['domain_admin'],
                                                   max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' } }, overload: { max_open_per_role: 50 } } } as never });
  const a = await exec.registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: {
    kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: dadmin.principalId, escalationPrincipalId: dadmin.principalId,
    budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 60 } } }) as { agent: { agentId: string } };
  agentId = a.agent.agentId;
}, 600_000);

afterAll(async () => {
  try {
    const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
    const tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b107dg-tenant-admin-2', 'TENANT');
    if (agentId !== '') await h.app.get(Ec).revokeAgent(h.req(tenantAdmin, 'agent.revoke', 'AGT', agentId, 'platform.administration'), T(), D(), agentId, { payload: { reason: 'the B107 §DG harness is done' } });
  } catch { /* already revoked */ }
  await h?.close();
}, 120_000);

describe('DG1 · principles, prohibitions and the lint (UX-03-001/-002/-003, UX-ADR-002)', () => {
  it('positive: the seeded V9 registry (four unwaivable); the lint over the REAL web source is conformant and recorded as evidence', async () => {
    const ws = await workspace();
    const principles = ws['principles'] as Row[];
    for (const k of ['surface-access-mode', 'semantic-tokens-only', 'no-optimistic-path', 'no-dark-patterns', 'human-authority', 'truth-state-separation', 'provenance-visible', 'accessibility']) {
      expect(principles.map((p) => p['principle_key']), k).toContain(k);
    }
    expect(principles.filter((p) => p['unwaivable'] === true).map((p) => p['principle_key']).sort()).toEqual(['accessibility', 'human-authority', 'provenance-visible', 'truth-state-separation']);
    const r = (await lint(steward))['evaluation'] as Row;
    expect(r['verdict'], JSON.stringify(r['findings']).slice(0, 800)).toBe('conformant');
    expect(Number(r['files'])).toBeGreaterThan(50);
    CONFORMANT_EVAL = String(r['evaluation_id']);
    expect(await events(CONFORMANT_EVAL)).toEqual(['design.evaluated']);
    expect((await one(sql`select kind, lifecycle from governance.artifacts where artifact_id = ${CONFORMANT_EVAL}::uuid and superseded_at is null`))).toEqual({ kind: 'evidence', lifecycle: 'active' });
  });
  it('negative: planted files violating each rule → nonconformant, each finding naming its principle (an agent may run the lint; it judges nothing)', async () => {
    const files = [
      { path: 'apps/web/app/x/page.tsx', text: "export default function X() {\n  return <h1>Executive dashboard</h1>;\n}\nconst s = { color: '#ff0000', background: 'rgb(1, 2, 3)' };\n// a comment with #abcdef and useOptimistic( is not code\n" },
      { path: 'apps/web/lib/y.ts', text: "import { useOptimistic } from 'react';\nexport const z = optimisticUpdate(1);\n" },
      { path: 'apps/web/messages/en.json', text: '{\n  "nav.chat": "Ask the Copilot"\n}\n' },
      { path: 'packages/tokens/src/registry.ts', text: "export const A = '#F4F7FA';\n" },
    ];
    const r = (await lint(agentSteward, files))['evaluation'] as Row;
    expect(r['verdict']).toBe('nonconformant');
    const f = r['findings'] as Row[];
    expect(f.map((x) => `${String(x['principle'])}@${String(x['file'])}:${String(x['line'])}`).sort()).toEqual([
      'no-optimistic-path@apps/web/lib/y.ts:1', 'no-optimistic-path@apps/web/lib/y.ts:2', 'semantic-tokens-only@apps/web/app/x/page.tsx:4',
      'surface-access-mode@apps/web/app/x/page.tsx:2', 'surface-access-mode@apps/web/messages/en.json:2']);
    expect(f.every((x) => x['status'] === 'open')).toBe(true);
    expect(r['counts']).toEqual({ 'raw-colour': 1, 'optimistic-path': 2, 'surface-definition': 2 });
    NONCONF_EVAL = String(r['evaluation_id']);
    expect(await one(sql`select evaluated_by_kind from governance.design_evaluations where evaluation_id = ${NONCONF_EVAL}::uuid`)).toEqual({ evaluated_by_kind: 'agent' });
  });
  it('refusals: the steward declares no principle (PDP) · a machine (port: actor) · an unwaivable principle relaxed (boundary) · a stale version', async () => {
    await refused(declare(steward, { key: `dg-${RUN}-x`, expectedVersion: 0, kind: 'principle', statement: 'a statement long enough', remediation: 'remediate it now' }), DENIED, 403);
    await refused(declare(machine, { key: `dg-${RUN}-x`, expectedVersion: 0, kind: 'principle', statement: 'a statement long enough', remediation: 'remediate it now' }), /^design principle rejected \(actor\)/, 403);
    await refused(declare(dsa, { key: 'accessibility', expectedVersion: 1, kind: 'principle', statement: 'accessibility, relaxed for once', remediation: 'remediate it now', unwaivable: false }), /^design principle rejected \(boundary\): accessibility is unwaivable/, 422);
    await refused(declare(dsa, { key: 'no-dark-patterns', expectedVersion: 7, kind: 'prohibition', statement: 'a statement long enough', remediation: 'remediate it now' }), /^design principle rejected \(stale\)/, 409);
  });
  it('recovery: the authority versions a principle on the current version; the prior version is superseded and readable', async () => {
    const p = (await declare(dsa, { key: `dg-${RUN}-density`, expectedVersion: 0, kind: 'prohibition', statement: 'Density is never optimised at the expense of comprehension.', prohibited: 'packing a decision surface past comprehension',
                                    patterns: ['decision surface'], remediation: 'split the surface; keep the evidence one step away' }))['principle'] as Row;
    expect(p['version']).toBe(1);
    const p2 = (await declare(dsa, { key: `dg-${RUN}-density`, expectedVersion: 1, kind: 'prohibition', statement: 'Density is never optimised at the expense of comprehension or control.',
                                     remediation: 'split the surface; keep the evidence one step away', state: 'retired' }))['principle'] as Row;
    expect(p2).toMatchObject({ version: 2, state: 'retired' });
    expect(await rows(sql`select version, state from governance.design_principles where principle_key = ${`dg-${RUN}-density`} order by version`)).toEqual([{ version: 1, state: 'superseded' }, { version: 2, state: 'retired' }]);
  });
});

describe('DG2 · design assets and ownership (REL-01)', () => {
  it('positive: the inventory of the REAL repository (the token set, the components, the patterns) — registered or unchanged; REPLAY is idempotent', async () => {
    const first = (await register(steward))['inventory'] as Row;
    const total = (first['registered'] as Row[]).length + Number(first['unchanged']);
    expect(total).toBeGreaterThan(20);
    const again = (await register(steward))['inventory'] as Row;
    expect(again['registered']).toEqual([]);
    expect(Number(again['unchanged'])).toBe(total);
    expect(again['drift']).toEqual([]);
    const tokens = await asset('tokens.semantic');
    expect(tokens['status']).toBeDefined();
    BUTTON = String((await asset('web.observation.governed-button'))['asset_id']);
    PATTERN = String((await asset('pattern.governed-action'))['asset_id']);
    BANNER = String((await asset('web.ui.degraded-banner'))['asset_id']);
    expect([BUTTON, PATTERN, BANNER].every((x) => /^[0-9a-f-]{36}$/.test(x))).toBe(true);
    expect(((await asset('web.observation.governed-button'))['consumers'] as string[]).length).toBeGreaterThan(0);
  });
  it('negative: a moved source is DRIFT — reported, nothing changed (the change is a contribution)', async () => {
    const key = `synthetic.drift-${RUN}`;
    const id = await plantAsset(key);
    const before = await asset(key);
    const r = (await register(steward, [{ kind: 'design_component', key, title: 'moved', sourceRef: 'apps/web/components/synthetic.tsx#moved', packageVersion: '0.0.1', sourceDigest: hex(), consumers: [] }]))['inventory'] as Row;
    expect((r['drift'] as Row[]).map((x) => x['key'])).toEqual([key]);
    expect(await asset(key)).toEqual(before);
    expect(id).toBe(before['asset_id']);
  });
  it('refusals: the registrar approving (separation_of_duties) · an agent owner · a stale digest · an unknown asset · the steward (PDP)', async () => {
    const key = `synthetic.own-${RUN}`;
    const reg = (await register(dsa2, [{ kind: 'design_component', key, title: 'registered by an authority', sourceRef: 'apps/web/components/x.tsx#A', packageVersion: '0.0.1', sourceDigest: hex(), consumers: [] }]))['inventory'] as Row;
    const id = String(((reg['registered'] as Row[])[0] as Row)['asset_id']);
    const a = await asset(key);
    await refused(approve(dsa2, id, { version: 1, digest: a['digest'], ownerPrincipalId: ownerDsa.principalId }), /^design baseline rejected \(separation_of_duties\): .*never done by its proposer/, 403);
    await refused(approve(dsa, id, { version: 1, digest: a['digest'], ownerPrincipalId: machine.principalId }), /^design baseline rejected \(owner\)/, 422);
    await refused(approve(dsa, id, { version: 1, digest: hex(), ownerPrincipalId: ownerDsa.principalId }), /^design baseline rejected \(stale\)/, 409);
    await refused(approve(dsa, uuidv7(), { version: 1, digest: a['digest'], ownerPrincipalId: ownerDsa.principalId }), /^design baseline rejected \(unknown_asset\)/, 404);
    await refused(approve(steward, id, { version: 1, digest: a['digest'], ownerPrincipalId: ownerDsa.principalId }), DENIED, 403);
    // recovery
    const ok = (await approve(dsa, id, { version: 1, digest: a['digest'], ownerPrincipalId: ownerDsa.principalId }))['asset'] as Row;
    expect(ok).toMatchObject({ status: 'approved', owner_principal_id: ownerDsa.principalId });
    expect(await events(id)).toEqual(['design.asset_approved']);
  });
});

describe('DG3 · the design baseline under the Design System Authority (UX-01-001…005, UX-ADR-001)', () => {
  it('positive → HELD: registered; the attestation HELD on an ownership gap — the hold committed, the proposal preserved', async () => {
    await approveOwned(BUTTON, ownerDsa);
    BASELINE = uuidv7();
    const b = (await proposeB(steward, { baselineId: BASELINE, expectedVersion: 0, title: `Design baseline (SYNTHETIC ${RUN})`, designSystemVersion: '@eye/tokens@0.0.1',
                                         scope: { capabilities: ['CAP-AU-01'], journeys: ['JRN-24'], profiles: ['local-dev'], themes: ['light', 'dark'], locales: ['en'] }, members: [BUTTON, PATTERN] }))['baseline'] as Row;
    expect(b).toMatchObject({ version: 1, state: 'proposed' });
    B1DIGEST = String(b['digest']);
    const r = await refused(decideB(dsa, BASELINE, { version: 1, decision: 'attest', digest: B1DIGEST }), /^design baseline rejected \(held\): design baseline v1 cannot be attested — pattern\.governed-action has no accountable owner/, 409);
    expect(((r.body['held'] as Row)['blocking'] as Row[]).map((x) => x['class'])).toEqual(['ownership_gap']);
    expect(await one(sql`select state from governance.design_baselines where baseline_id = ${BASELINE}::uuid and version = 1`)).toEqual({ state: 'proposed' });
    expect(await n(sql`select count(*)::int n from governance.holds where subject_artifact = ${BASELINE}::uuid and reason_kind = 'ownership_gap' and lifted_at is null`)).toBe(1);
    expect(await events(BASELINE)).toEqual(['design.baseline_proposed', 'design.baseline_held']);
    expect(await n(sql`select count(*)::int n from governance.signatures where subject_id = ${BASELINE}::uuid`)).toBe(0);
  });
  it('refusals: the steward (PDP) · the proposer holding the authority (no self-acceptance) · a machine (port) · a stale digest · a second open proposal', async () => {
    await refused(decideB(steward, BASELINE, { version: 1, decision: 'attest', digest: B1DIGEST }), DENIED, 403);
    const own = uuidv7();
    const ob = (await proposeB(dsa2, { baselineId: own, expectedVersion: 0, title: 'Self-attested baseline (SYNTHETIC)', designSystemVersion: '@eye/tokens@0.0.1', scope: { themes: ['light'] }, members: [BUTTON] }))['baseline'] as Row;
    await refused(decideB(dsa2, own, { version: 1, decision: 'attest', digest: ob['digest'] }), /^design baseline rejected \(separation_of_duties\): attesting a design baseline is never done by its proposer/, 403);
    await refused(decideB(machine, BASELINE, { version: 1, decision: 'attest', digest: B1DIGEST }), /^design baseline rejected \(actor\)/, 403);
    await refused(decideB(dsa, BASELINE, { version: 1, decision: 'attest', digest: hex() }), /^design baseline rejected \(stale\)/, 409);
    await refused(proposeB(steward, { baselineId: BASELINE, expectedVersion: 1, title: 'Another', designSystemVersion: '@eye/tokens@0.0.1', scope: { themes: ['light'] }, members: [BUTTON] }), /^design baseline rejected \(state\)/, 409);
    await refused(proposeB(steward, { baselineId: uuidv7(), expectedVersion: 0, title: 'Unknown member', designSystemVersion: 'x.y', scope: { themes: ['light'] }, members: [uuidv7()] }), /^design baseline rejected \(unknown_asset\)/, 404);
    await refused(proposeB(steward, { baselineId: uuidv7(), expectedVersion: 0, title: 'Bad scope', designSystemVersion: 'x.y', scope: { colour: ['red'] }, members: [BUTTON] }), /^design baseline rejected \(scope\)/, 422);
  });
  it('recovery (CORRECTION): the owner named → attested and SIGNED (verifiable); the hold lifted; the members part_of the baseline', async () => {
    await approveOwned(PATTERN, ownerDsa);
    const r = (await decideB(dsa, BASELINE, { version: 1, decision: 'attest', digest: B1DIGEST }))['baseline'] as Row;
    expect(r).toMatchObject({ state: 'attested', version: 1 });
    const sig = await one(sql`select key_id, signature, subject_digest, signer::text, subject_kind, bound_action from governance.signatures where signature_id = ${String(r['signature_id'])}::uuid`);
    expect(sig).toMatchObject({ subject_kind: 'baseline_decision', signer: dsa.principalId, subject_digest: B1DIGEST, bound_action: 'governance.design.baseline.decide' });
    expect(signer.verify(sig as never)).toBe(true);
    expect(await n(sql`select count(*)::int n from governance.holds where subject_artifact = ${BASELINE}::uuid and lifted_at is null`)).toBe(0);
    expect(await n(sql`select count(*)::int n from governance.links_live where to_artifact = ${BASELINE}::uuid and relation = 'part_of'`)).toBe(2);
    const conf = (await workspace())['conformance'] as Row;
    expect(['withheld', 'no_blocking_finding']).toContain(conf['state']);
    expect(conf['note']).toMatch(/never inferred/);
  });
  it('compare and reject: v2 adds a member; compared with v1; rejected — v1 stays the attested baseline', async () => {
    await approveOwned(BANNER, ownerDsa);
    const v2 = (await proposeB(steward, { baselineId: BASELINE, expectedVersion: 1, title: `Design baseline (SYNTHETIC ${RUN})`, designSystemVersion: '@eye/tokens@0.0.1',
                                          scope: { capabilities: ['CAP-AU-01'], journeys: ['JRN-24'], profiles: ['local-dev'], themes: ['light', 'dark'], locales: ['en', 'de'] }, members: [BUTTON, PATTERN, BANNER] }))['baseline'] as Row;
    const cmp = (await W(pc.compare(preq(dsa, 'governance.read'), BASELINE, { payload: { from: 1, to: 2 } })))['comparison'] as Row;
    expect((cmp['members'] as Row)['added']).toEqual([{ key: 'web.ui.degraded-banner', version: 1 }]);
    expect(cmp['scope']).toEqual([{ dimension: 'locales', from: ['en'], to: ['en', 'de'] }]);
    expect(cmp['identical']).toBe(false);
    const pv = await W(pc.preview(preq(steward, 'governance.read'), 'baseline', BASELINE, { payload: { version: 2 } }));
    expect(pv['digest']).toBe(v2['digest']);
    expect(pv['eligibility']).toEqual(['you do not hold design_system_authority', 'you proposed it — no self-acceptance']);
    expect(((await W(pc.preview(preq(dsa, 'governance.read'), 'baseline', BASELINE, { payload: { version: 2 } })))['eligibility'])).toEqual([]);
    await refused(W(pc.preview(preq(dsa, 'governance.read'), 'baseline', BASELINE, { payload: { version: 9 } })), /^design baseline rejected \(unknown_baseline\)/, 404);
    expect(((await decideB(dsa, BASELINE, { version: 2, decision: 'reject', digest: v2['digest'] }))['baseline'] as Row)['state']).toBe('rejected');
    expect(await rows(sql`select version, state from governance.design_baselines where baseline_id = ${BASELINE}::uuid order by version`)).toEqual([{ version: 1, state: 'attested' }, { version: 2, state: 'rejected' }]);
  });
});

let EXC = '';
describe('DG4 · narrow, expiring design exceptions (UX-03-003/-006, ES-02-004)', () => {
  it('refusals: an unwaivable principle (boundary) · > 90 days (expiry) · the owner deciding (ES-02-004) · the requester deciding (no self-acceptance)', async () => {
    const soon = new Date(Date.now() + 30 * 86_400_000).toISOString();
    await refused(requestX(steward, { principle: 'human-authority', assetId: BUTTON, expiresAt: soon }), /^design principle rejected \(boundary\): human-authority is unwaivable/, 422);
    await refused(requestX(steward, { principle: 'no-optimistic-path', assetId: BUTTON, expiresAt: new Date(Date.now() + 120 * 86_400_000).toISOString() }), /^design principle rejected \(expiry\)/, 422);
    const x = (await requestX(steward, { principle: 'no-optimistic-path', assetId: BUTTON, expiresAt: soon }))['exception'] as Row;
    EXC = String(x['exception_id']);
    await refused(requestX(steward, { principle: 'no-optimistic-path', assetId: BUTTON, expiresAt: soon }), /^design principle rejected \(duplicate\)/, 409);
    await refused(decideX(ownerDsa, EXC, { decision: 'approve', digest: x['digest'] }), /^design principle rejected \(separation_of_duties\): the owner of the asset never decides an exception that expands their own authority/, 403);
    const own = (await requestX(dsa2, { principle: 'semantic-tokens-only', assetId: BANNER, expiresAt: soon }))['exception'] as Row;
    await refused(decideX(dsa2, String(own['exception_id']), { decision: 'approve', digest: own['digest'] }), /^design principle rejected \(separation_of_duties\): deciding a design exception is never done by its proposer/, 403);
  });
  it('positive: approved and SIGNED by an independent authority; a review finding on that principle × asset reads `excepted` (conformant)', async () => {
    const x = await one(sql`select digest from governance.design_exceptions where exception_id = ${EXC}::uuid`);
    const r = (await decideX(dsa, EXC, { decision: 'approve', digest: x['digest'] }))['exception'] as Row;
    expect(r['state']).toBe('approved');
    expect(await one(sql`select subject_kind, signer::text from governance.signatures where signature_id = ${String(r['signature_id'])}::uuid`)).toEqual({ subject_kind: 'exception_approval', signer: dsa.principalId });
    const a = await asset('web.observation.governed-button');
    const ev = (await review(dsa2, { assetId: BUTTON, assetVersion: a['version'], findings: [{ principle: 'no-optimistic-path', file: 'apps/web/components/observation.tsx', line: 1, excerpt: 'synthetic' }] }))['evaluation'] as Row;
    expect(ev).toMatchObject({ verdict: 'conformant', open: 0, excepted: 1 });
    const ev2 = (await review(dsa2, { assetId: BUTTON, assetVersion: a['version'], findings: [{ principle: 'no-dark-patterns', note: 'a pre-checked default (SYNTHETIC)' }] }))['evaluation'] as Row;
    expect(ev2).toMatchObject({ verdict: 'nonconformant', open: 1 });
    await refused(requestX(steward, { principle: 'no-optimistic-path', assetId: PATTERN, expiresAt: new Date(Date.now() + 10 * 86_400_000).toISOString(), renews: EXC }), /^design principle rejected \(broadening\)/, 422);
  });
  it('EXPIRY (fixture time travel by the superuser, SYNTHETIC): an expired exception covers nothing — the same finding is open again', async () => {
    await sql`update governance.design_exceptions set requested_at = clock_timestamp() - interval '40 days', expires_at = clock_timestamp() - interval '1 minute' where exception_id = ${EXC}::uuid`.execute(h.su);
    const a = await asset('web.observation.governed-button');
    const ev = (await review(dsa2, { assetId: BUTTON, assetVersion: a['version'], findings: [{ principle: 'no-optimistic-path', note: 'the same finding after expiry' }] }))['evaluation'] as Row;
    expect(ev).toMatchObject({ verdict: 'nonconformant', open: 1, excepted: 0 });
    const ws = await workspace();
    expect(((ws['exceptions'] as Row[]).find((x) => x['exception_id'] === EXC) ?? {})['effective_state']).toBe('expired');
  });
});

let NEWC = ''; let NEW_ASSET = '';
describe('DG5 · the contribution queue (UX-72-001…005)', () => {
  it('propose → review HELD (evidence and ownership missing) → AMEND → review → accept (SIGNED) → publish → adopt → measure → close', async () => {
    const key = `synthetic.loop-header-${RUN}`;
    const c = (await propose(steward, { kind: 'new_component', proposal: { assetKey: key, title: 'Loop-stage header (SYNTHETIC)', sourceRef: 'apps/web/components/loop-stage.tsx#LoopStageHeader', packageVersion: '0.0.1' },
                                        summary: 'A loop-stage header for the governance pages (UX-02)', plans: {} }))['contribution'] as Row;
    NEWC = String(c['contribution_id']);
    expect(c['stage']).toBe('proposed');
    const held = await refused(step(dsa, NEWC, 'review', { revision: 1 }), /^design contribution rejected \(held\): the review step is held — ownership is missing/, 409);
    expect(((held.body['held'] as Row)['blocking'] as Row[]).length).toBeGreaterThanOrEqual(3);
    expect(await one(sql`select stage from governance.design_contributions where contribution_id = ${NEWC}::uuid`)).toEqual({ stage: 'held' });
    expect(await n(sql`select count(*)::int n from governance.holds where subject_artifact = ${NEWC}::uuid and lifted_at is null and reason_kind = 'ownership_gap'`)).toBe(1);
    const am = (await amend(steward, NEWC, { revision: 1, proposal: { assetKey: key, title: 'Loop-stage header (SYNTHETIC)', sourceRef: 'apps/web/components/loop-stage.tsx#LoopStageHeader', packageVersion: '0.0.1',
                                                                     ownerPrincipalId: ownerDsa.principalId, consumers: ['/admin/governance/design'] },
                                             summary: 'A loop-stage header for the governance pages (UX-02)', plans: { rollback: 'remove the header; the pages keep their titles', tests: ['governance-dg-b107.test.ts'], evaluationId: CONFORMANT_EVAL } }))['contribution'] as Row;
    expect(am).toMatchObject({ revision: 2, stage: 'proposed', blockers: [] });
    expect(await n(sql`select count(*)::int n from governance.holds where subject_artifact = ${NEWC}::uuid and lifted_at is null`)).toBe(0);
    expect(((await step(dsa, NEWC, 'review', { revision: 2 }))['contribution'] as Row)['stage']).toBe('in_review');
    await refused(step(dsa, NEWC, 'accept', { revision: 2, digest: hex() }), /^design contribution rejected \(stale\)/, 409);
    await refused(step(steward, NEWC, 'accept', { revision: 2, digest: am['digest'] }), DENIED, 403);
    await refused(step(machine, NEWC, 'accept', { revision: 2, digest: am['digest'] }), /^design contribution rejected \(actor\)/, 403);
    const acc = (await step(dsa, NEWC, 'accept', { revision: 2, digest: am['digest'] }))['contribution'] as Row;
    expect(acc['stage']).toBe('accepted');
    expect(signer.verify((await one(sql`select key_id, signature, subject_digest from governance.signatures where signature_id = ${String(acc['signature_id'])}::uuid`)) as never)).toBe(true);
    const pub = (await step(dsa, NEWC, 'publish', { revision: 2 }))['contribution'] as Row;
    expect(pub).toMatchObject({ stage: 'published', asset_version: 1 });
    NEW_ASSET = String(pub['asset_id']);
    expect(await one(sql`select status, owner_principal_id::text, contribution_id::text from governance.design_assets where asset_id = ${NEW_ASSET}::uuid`)).toEqual({ status: 'approved', owner_principal_id: ownerDsa.principalId, contribution_id: NEWC });
    // adoption diverges → HELD (the asset held for drift); recovery: adoption confirmed
    await refused(step(steward, NEWC, 'adopt', { revision: 2, evidence: { adopted: ['/admin/governance'], divergent: [{ consumer: '/admin/governance/registries', note: 'a local fork of the header' }] } }), /^design contribution rejected \(held\)/, 409);
    expect(await n(sql`select count(*)::int n from governance.holds where subject_artifact = ${NEW_ASSET}::uuid and reason_kind = 'conformance_drift' and lifted_at is null`)).toBe(1);
    expect(((await step(steward, NEWC, 'adopt', { revision: 2, evidence: { adopted: ['/admin/governance', '/admin/governance/registries'] } }))['contribution'] as Row)['stage']).toBe('adopted');
    expect(await n(sql`select count(*)::int n from governance.holds where subject_artifact = ${NEW_ASSET}::uuid and lifted_at is null`)).toBe(0);
    await refused(step(steward, NEWC, 'measure', { revision: 2, evidence: { measures: [] } }), /^design contribution rejected \(evidence\)/, 422);
    expect(((await step(steward, NEWC, 'measure', { revision: 2, evidence: { measures: [{ kind: 'experience_baseline', ref: 'B92 task_success_rate (SYNTHETIC)' }] } }))['contribution'] as Row)['stage']).toBe('measured');
    expect(((await step(dsa, NEWC, 'close', { revision: 2 }))['contribution'] as Row)['stage']).toBe('closed');
    expect(await events(NEWC)).toEqual(['design.contribution_proposed', 'design.contribution_held', 'design.contribution_amended', 'design.contribution_review', 'design.contribution_accept',
                                       'design.contribution_publish', 'design.contribution_held', 'design.contribution_adopt', 'design.contribution_measure', 'design.contribution_close']);
  });
  it('a change publishes the NEXT version (the prior superseded, still readable); a BUILDER (the amender) never accepts it; an agent may propose', async () => {
    const before = await asset('web.ui.degraded-banner');
    const c = (await propose(agentSteward, { kind: 'component_change', targetAssetId: BANNER, proposal: { packageVersion: '0.0.2' }, summary: 'The banner names the degraded dependency (SYNTHETIC)', plans: {} }))['contribution'] as Row;
    expect(c['proposed_by_kind']).toBe('agent');
    const id = String(c['contribution_id']);
    const am = (await amend(dsa2, id, { revision: 1, targetAssetId: BANNER, proposal: { packageVersion: '0.0.2' }, summary: 'The banner names the degraded dependency (SYNTHETIC)',
                                         plans: { compatibility: 'additive: one optional prop', consumers: 'every admin page keeps rendering', migration: 'none required', rollback: 'revert to 0.0.1', tests: ['ui.test'], evaluationId: CONFORMANT_EVAL } }))['contribution'] as Row;
    expect(am['builders']).toEqual([dsa2.principalId]);
    await step(dsa, id, 'review', { revision: 2 });
    await refused(step(dsa2, id, 'accept', { revision: 2, digest: am['digest'] }), /^design contribution rejected \(separation_of_duties\): accepting a design contribution is never done by a builder/, 403);
    await step(dsa, id, 'accept', { revision: 2, digest: am['digest'] });
    const pub = (await step(dsa, id, 'publish', { revision: 2 }))['contribution'] as Row;
    expect(pub['asset_version']).toBe(Number(before['version']) + 1);
    expect(await rows(sql`select version, status, package_version from governance.design_assets where asset_id = ${BANNER}::uuid order by version`)).toEqual([
      { version: Number(before['version']), status: 'superseded', package_version: '0.0.1' }, { version: Number(before['version']) + 1, status: 'approved', package_version: '0.0.2' }]);
  });
  it('UX-03-005: a NON-CONFORMANT design is blocked — the review HOLDS it naming the violated principles, the evidence preserved; recovery: a conformant evaluation', async () => {
    const plans = { compatibility: 'additive only', consumers: 'none affected', migration: 'none required', rollback: 'revert the version', tests: ['t1'] };
    const c = (await propose(steward, { kind: 'pattern_change', targetAssetId: PATTERN, proposal: { packageVersion: '0.0.3' }, summary: 'An optimistic shortcut for the governed action (SYNTHETIC)',
                                        plans: { ...plans, evaluationId: NONCONF_EVAL } }))['contribution'] as Row;
    const id = String(c['contribution_id']);
    const r = await refused(step(dsa, id, 'review', { revision: 1 }), /the design evaluation is nonconformant \(5 open finding\(s\): .*no-optimistic-path.*\) — the non-conformant pattern is blocked/, 409);
    expect(((r.body['held'] as Row)['blocking'] as Row[]).length).toBe(1);
    expect(await one(sql`select stage, plans ->> 'evaluationId' as e from governance.design_contributions where contribution_id = ${id}::uuid`)).toEqual({ stage: 'held', e: NONCONF_EVAL });
    await amend(steward, id, { revision: 1, targetAssetId: PATTERN, proposal: { packageVersion: '0.0.3' }, summary: 'The governed action, receipts only (SYNTHETIC)', plans: { ...plans, evaluationId: CONFORMANT_EVAL } });
    expect(((await step(dsa, id, 'review', { revision: 2 }))['contribution'] as Row)['stage']).toBe('in_review');
    await step(dsa, id, 'reject', { revision: 2 });
    expect((await asset('pattern.governed-action'))['version']).toBe(1);  // a rejected change leaves the pattern untouched
  });
  it('a constitutional AMENDMENT is ratified by the product authority only (UX-72-004); a non-amendment never claims constitutional meaning', async () => {
    await refused(propose(steward, { kind: 'component_change', targetAssetId: BUTTON, proposal: { packageVersion: '9.9.9' }, summary: 'a change claiming constitutional meaning', constitutional: true }), /^design contribution rejected \(constitutional\)/, 422);
    const c = (await propose(steward, { kind: 'amendment', proposal: { principle: 'truth-state-separation' }, summary: 'Amend the truth-state vocabulary (SYNTHETIC)', constitutional: true,
                                        plans: { compatibility: 'the old states map one to one', consumers: 'every badge', migration: 'a mapping table', rollback: 'the previous vocabulary', tests: ['ts.test'], evaluationId: CONFORMANT_EVAL } }))['contribution'] as Row;
    const id = String(c['contribution_id']);
    await step(dsa, id, 'review', { revision: 1 });
    await refused(step(dsa, id, 'accept', { revision: 1, digest: c['digest'] }), /^design contribution rejected \(authority\): ratifying a constitutional amendment is the act of a product_authority/, 403);
    expect(((await step(product, id, 'accept', { revision: 1, digest: c['digest'] }))['contribution'] as Row)['stage']).toBe('accepted');
  });
  it('a DEPRECATION that would strand consumers is HELD; migrated; retirement HELD while a consumer remains; retired once none does', async () => {
    const key = `synthetic.old-card-${RUN}`;
    const id = await plantAsset(key, 'design_component', ['/admin/a', '/admin/b']);
    await approveOwned(id, ownerDsa);
    const c = (await propose(steward, { kind: 'deprecation', targetAssetId: id, proposal: {}, summary: 'Deprecate the old card in favour of Panel (SYNTHETIC)', plans: { migrationMap: { '/admin/a': 'web.ui.panel' } } }))['contribution'] as Row;
    const cid = String(c['contribution_id']);
    await refused(step(dsa, cid, 'review', { revision: 1 }), /would strand 1 consumer\(s\) with no migration target: \/admin\/b/, 409);
    const am = (await amend(steward, cid, { revision: 1, targetAssetId: id, proposal: {}, summary: 'Deprecate the old card in favour of Panel (SYNTHETIC)', plans: { migrationMap: { '/admin/a': 'web.ui.panel', '/admin/b': 'web.ui.panel' } } }))['contribution'] as Row;
    await step(dsa, cid, 'review', { revision: 2 });
    await step(dsa, cid, 'accept', { revision: 2, digest: am['digest'] });
    expect(((await step(dsa, cid, 'deprecate', { revision: 2 }))['contribution'] as Row)['stage']).toBe('deprecated');
    expect((await asset(key))['status']).toBe('deprecated');
    await step(steward, cid, 'migrate', { revision: 2, evidence: { migrated: ['/admin/a'] } });
    await refused(step(dsa, cid, 'retire', { revision: 2 }), /^design contribution rejected \(held\): the retire step is held — retirement would strand 1 consumer/, 409);
    await refused(step(steward, cid, 'migrate', { revision: 2, evidence: { migrated: ['/admin/zzz'] } }), /is not a consumer/, 422);
    await step(steward, cid, 'migrate', { revision: 2, evidence: { migrated: ['/admin/b'] } });
    expect(((await step(dsa, cid, 'retire', { revision: 2 }))['contribution'] as Row)['stage']).toBe('retired');
    expect(await asset(key)).toMatchObject({ status: 'retired', consumers: [] });
  });
});

let ACTION = ''; let ACTION2 = '';
async function plantAction(kind: string): Promise<string> {
  const finding = uuidv7(); const action = uuidv7();
  await sql`insert into analytics.experience_findings (finding_id, scope, tenant_id, domain_id, origin_kind, origin_id, journey_key, statement, evidence, state, digest, proposed_by, proposed_by_kind, decided_at, correlation_id)
            values (${finding}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'threshold', ${uuidv7()}::uuid, 'operating-review', ${`Step two of the operating review is abandoned by most users (SYNTHETIC ${RUN})`}, '{}'::jsonb,
                    'actioned', ${hex()}, ${dadmin.principalId}::uuid, 'human', clock_timestamp(), ${uuidv7()}::uuid)`.execute(h.su);
  await sql`insert into analytics.experience_actions (action_id, scope, tenant_id, domain_id, finding_id, decision, kind, preview, preview_digest, reason, effect, decided_by, correlation_id)
            values (${action}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${finding}::uuid, 'act', ${kind}, '{}'::jsonb, ${hex()}, 'the owner decided the finding (SYNTHETIC planted)', '{}'::jsonb, ${pao.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  return action;
}
describe('DG6 · experience learning (UX-ADR-024) and the telemetry evidence (REL-23)', () => {
  it('positive: a B92 design_change_proposal action OPENS one contribution proposal (proposed by its owner) — nothing else changes; REPLAY answers `already`', async () => {
    ACTION = await plantAction('design_change_proposal');
    const assets = await n(sql`select count(*)::int n from governance.design_assets`);
    const r = (await intake(pao, ACTION))['intake'] as Row;
    const got = (r['intaken'] as Row[])[0] as Row;
    expect(got['action_id']).toBe(ACTION);
    expect(await one(sql`select stage, origin, kind, proposed_by::text, target_asset_id from governance.design_contributions where contribution_id = ${String(got['contribution_id'])}::uuid`))
      .toEqual({ stage: 'proposed', origin: 'experience_learning', kind: 'pattern_change', proposed_by: pao.principalId, target_asset_id: null });
    expect(await n(sql`select count(*)::int n from governance.design_assets`)).toBe(assets);  // telemetry never modifies a pattern
    const again = (await intake(pao, ACTION))['intake'] as Row;
    expect(again['intaken']).toEqual([]);
    expect((again['already'] as Row[]).map((x) => x['action_id'])).toEqual([ACTION]);
    // the review holds it until a contributor names the target (it never moves on its own)
    await refused(step(dsa, String(got['contribution_id']), 'review', { revision: 1 }), /names no target asset/, 409);
  });
  it('the attention tick takes in a new action (the agent opens proposals only) and nothing when nothing is new', async () => {
    ACTION2 = await plantAction('design_change_proposal');
    const steps = await tick();
    expect(((steps['design-experience-intake'] ?? {})['intaken'] as Row[]).map((x) => x['action_id'])).toEqual([ACTION2]);
    const again = await tick();
    expect((again['design-experience-intake'] ?? {})['intaken']).toEqual([]);
    expect(await one(sql`select intaken_by_kind from governance.design_experience_intakes where action_id = ${ACTION2}::uuid`)).toEqual({ intaken_by_kind: 'agent' });
  });
  it('refusals: another action kind · an unknown action · the steward (PDP) · another tenant\'s domain (scope)', async () => {
    const other = await plantAction('research_request');
    await refused(intake(pao, other), /^design contribution rejected \(kind\)/, 422);
    await refused(intake(pao, uuidv7()), /^design contribution rejected \(unknown_action\)/, 404);
    await refused(W(dc.intake(dreq(steward, 'governance.design.intake'), T(), D(), { payload: {} })), DENIED, 403);
    await refused(intake(uAdmin, ACTION, U, DU), /unknown_action/, 404);
  });
  it('REL-23: the telemetry governance read as evidence (purpose, consent, lineage, coverage, privacy review, metric governance)', async () => {
    const r = await dread(dadmin);
    const tel = r['telemetry'] as Row;
    for (const k of ['purposes', 'consent', 'lineage', 'coverage', 'metric_governance', 'experience']) expect(tel, k).toHaveProperty(k);
    expect(((tel['experience'] as Row)['actions'] as Row[]).map((a) => a['id'])).toEqual(expect.arrayContaining([ACTION, ACTION2]));
    expect((r['intakes'] as Row[]).map((i) => i['action_id'])).toEqual(expect.arrayContaining([ACTION, ACTION2]));
    expect(r['accessibility']).toMatchObject({ status: 'unsupported', metric: 'MET-034', carrier: 'B108 (source) → H3' });
  });
});

let ACC = ''; let ACC_DIGEST = '';
const evidence = (validDays = 30) => [
  { kind: 'design_evaluation', ref: `evaluation ${CONFORMANT_EVAL}`, digest: hex(), capturedAt: new Date(Date.now() - 86_400_000).toISOString(), validUntil: new Date(Date.now() + validDays * 86_400_000).toISOString() },
  { kind: 'journey_walk', ref: 'e2e walk of the operating review (SYNTHETIC)', digest: hex(), capturedAt: new Date(Date.now() - 3_600_000).toISOString(), validUntil: new Date(Date.now() + validDays * 86_400_000).toISOString() },
];
const TUPLE = { capability: 'CAP-AU-01', journey: 'JRN-24', persona: 'executive product authority', role: 'executive', deployment_profile: 'local-dev', theme: 'light', locale: 'en', device: 'desktop', assistive_technology: 'none recorded' };
describe('DG7 · design acceptance records (UX-ADR-023, REL-24, ES-71-002)', () => {
  it('refusals at proposal: the tuple · expired evidence · a component outside the attested baseline · the PDP (an executive proposes nothing)', async () => {
    await refused(proposeA(steward, { baselineId: BASELINE, components: [BUTTON], tuple: { ...TUPLE, device: undefined }, evidence: evidence() }), /^design acceptance rejected \(tuple\): the tuple names its device/, 422);
    const stale = [{ ...evidence()[0]!, validUntil: new Date(Date.now() - 1000).toISOString() }];
    await refused(proposeA(steward, { baselineId: BASELINE, components: [BUTTON], tuple: TUPLE, evidence: stale }), /^design acceptance rejected \(expired\)/, 409);
    await refused(proposeA(steward, { baselineId: BASELINE, components: [BANNER], tuple: TUPLE, evidence: evidence() }), /^design acceptance rejected \(scope\)/, 422);
    await refused(proposeA(pao, { baselineId: BASELINE, components: [BUTTON], tuple: TUPLE, evidence: evidence() }), DENIED, 403);
  });
  it('positive: the exact tuple proposed; attested per obligation by DISTINCT named humans, each SIGNED → accepted; the accessibility slots empty (MET-034)', async () => {
    const a = (await proposeA(steward, { baselineId: BASELINE, components: [BUTTON, PATTERN], tuple: TUPLE, evidence: evidence(), obligations: ['design', 'assurance', 'customer'],
                                         findings: [{ note: 'none open at proposal (SYNTHETIC)' }], conditions: [{ condition: 'local-dev profile only' }] }))['acceptance'] as Row;
    ACC = String(a['acceptance_id']); ACC_DIGEST = String(a['digest']);
    expect(a).toMatchObject({ version: 1, state: 'proposed', claim: 'demonstration' });
    const d1 = (await attest(dsa, ACC, { version: 1, obligation: 'design', digest: ACC_DIGEST }))['acceptance'] as Row;
    expect(d1).toMatchObject({ state: 'proposed', remaining: ['assurance', 'customer'] });
    await refused(attest(dual, ACC, { version: 1, obligation: 'design', digest: ACC_DIGEST }), /^design acceptance rejected \(duplicate\)/, 409);
    await attest(assurance, ACC, { version: 1, obligation: 'assurance', digest: ACC_DIGEST });
    const done = (await attest(sponsor, ACC, { version: 1, obligation: 'customer', digest: ACC_DIGEST }))['acceptance'] as Row;
    expect(done).toMatchObject({ state: 'accepted', remaining: [] });
    const sigs = await rows(sql`select key_id, signature, subject_digest, signer::text from executive.signatures where subject_kind = 'design_acceptance' and subject_id = ${ACC}::uuid order by signed_at`);
    expect(sigs.map((s) => s['signer'])).toEqual([dsa.principalId, assurance.principalId, sponsor.principalId]);
    expect(sigs.every((s) => signer.verify(s as never))).toBe(true);
    const rec = await one(sql`select accessibility, claim, state from governance.design_acceptances where acceptance_id = ${ACC}::uuid and version = 1`);
    expect(rec['accessibility']).toMatchObject({ status: 'unsupported', metric: 'MET-034' });
    expect(await n(sql`select count(*)::int n from governance.links_live where to_artifact = ${ACC}::uuid and relation = 'accepted_in'`)).toBe(2);
  });
  it('refusals at attestation: one person two obligations · the wrong role · a builder · a machine · a stale digest · another tenant\'s sponsor (PDP)', async () => {
    const a = (await proposeA(steward, { baselineId: BASELINE, components: [BUTTON], tuple: { ...TUPLE, locale: 'de' }, evidence: evidence(), builders: [dsa2.principalId] }))['acceptance'] as Row;
    const id = String(a['acceptance_id']); const dg = String(a['digest']);
    await attest(dual, id, { version: 1, obligation: 'design', digest: dg });
    await refused(attest(dual, id, { version: 1, obligation: 'assurance', digest: dg }), /^design acceptance rejected \(separation_of_duties\): one person attests one obligation/, 403);
    await refused(attest(dsa, id, { version: 1, obligation: 'assurance', digest: dg }), /^design acceptance rejected \(authority\)/, 403);
    await refused(attest(machine, id, { version: 1, obligation: 'assurance', digest: dg }), /^design acceptance rejected \(actor\)/, 403);
    await refused(attest(assurance, id, { version: 1, obligation: 'assurance', digest: hex() }), /^design acceptance rejected \(stale\)/, 409);
    await refused(attest(uSponsor, id, { version: 1, obligation: 'assurance', digest: dg }), DENIED, 403);
    await refused(attest(steward, id, { version: 1, obligation: 'assurance', digest: dg }), DENIED, 403);
    const b = (await proposeA(steward, { baselineId: BASELINE, components: [BUTTON], tuple: { ...TUPLE, theme: 'dark' }, evidence: evidence(), builders: [dsa2.principalId] }))['acceptance'] as Row;
    await refused(attest(dsa2, String(b['acceptance_id']), { version: 1, obligation: 'design', digest: b['digest'] }), /^design acceptance rejected \(separation_of_duties\): .* never done by a builder/, 403);
  });
  it('EXPIRY (time travel, SYNTHETIC): the tick WITHHOLDS the accepted record and raises governance.acceptance attention; RECOVERY: v2 over renewed evidence', async () => {
    await sql`update governance.design_acceptances set evidence = jsonb_set(evidence, '{0,validUntil}', to_jsonb((clock_timestamp() - interval '1 minute')::text)) where acceptance_id = ${ACC}::uuid and version = 1`.execute(h.su);
    const steps = await tick();
    const w = ((steps['design-acceptance-expiry'] ?? {})['withheld'] as Row[]).find((x) => x['acceptance_id'] === ACC) as Row;
    expect(w['reasons']).toEqual([expect.stringMatching(/^evidence evaluation .* expired at/)]);
    expect(await one(sql`select state from governance.design_acceptances where acceptance_id = ${ACC}::uuid and version = 1`)).toEqual({ state: 'withheld' });
    const items = await rows(sql`select state from executive.attention_items where signal_class = 'governance.acceptance' and subject_id = ${ACC}::uuid and state <> 'closed'`);
    expect(items.length).toBe(1);
    expect((await tick())['design-acceptance-expiry']).toMatchObject({ withheld: [] });  // nothing new to withhold
    const v2 = (await proposeA(steward, { acceptanceId: ACC, expectedVersion: 1, baselineId: BASELINE, components: [BUTTON, PATTERN], tuple: TUPLE, evidence: evidence(60) }))['acceptance'] as Row;
    for (const [who, o] of [[dsa, 'design'], [assurance, 'assurance']] as const) await attest(who, ACC, { version: 2, obligation: o, digest: v2['digest'] });
    expect(await rows(sql`select version, state from governance.design_acceptances where acceptance_id = ${ACC}::uuid order by version`)).toEqual([{ version: 1, state: 'superseded' }, { version: 2, state: 'accepted' }]);
    expect(await n(sql`select count(*)::int n from executive.attention_items where signal_class = 'governance.acceptance' and subject_id = ${ACC}::uuid and state <> 'closed'`)).toBe(0);
  });
  it('the claim CHECK: no record can carry a real acceptance (R2 / H3); versions are never deleted', async () => {
    await expect(sql`update governance.design_acceptances set claim = 'real' where acceptance_id = ${ACC}::uuid`.execute(h.su)).rejects.toThrow(/check constraint/);
    await expect(sql`delete from governance.design_acceptances where acceptance_id = ${ACC}::uuid`.execute(h.su)).rejects.toThrow(/never deleted/);
  });
});

describe('DG8 · the design trace (UX-08-001…005, REL-02)', () => {
  let REQ = ''; let REQ2 = ''; let TEST = '';
  const plantArtifact = async (kind: string, key: string) => {
    const id = uuidv7();
    await sql`insert into governance.artifacts (artifact_id, version, scope, kind, external_key, title, digest, recorded_by, correlation_id)
              values (${id}::uuid, 1, 'PLATFORM', ${kind}, ${key}, ${`${key} (SYNTHETIC — planted as §RG's importer would)`}, ${hex()}, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    return id;
  };
  it('positive: links recorded; the trace resolves BOTH ways (requirement → component → test, and back)', async () => {
    REQ = await plantArtifact('requirement', `V9:UX-03-001-${RUN}`); REQ2 = await plantArtifact('requirement', `V9:REL-01-${RUN}`); TEST = await plantArtifact('test', `e2e:design-${RUN}`);
    await link(steward, { from: BUTTON, to: REQ, relation: 'implements' });
    await link(steward, { from: TEST, to: BUTTON, relation: 'verifies' });
    const fwd = (await trace(dsa, { artifactId: REQ, depth: 2 }))['trace'] as Row;
    expect((fwd['nodes'] as Row[]).map((x) => x['artifact_id'])).toEqual(expect.arrayContaining([REQ, BUTTON, TEST, BASELINE]));
    const back = (await trace(dsa, { artifactId: TEST, depth: 2 }))['trace'] as Row;
    expect((back['nodes'] as Row[]).map((x) => x['artifact_id'])).toEqual(expect.arrayContaining([TEST, BUTTON, REQ]));
    const orph = (await workspace())['orphans'] as Row;
    expect((orph['requirements_without_design'] as Row[]).map((x) => x['key'])).toContain(`V9:REL-01-${RUN}`);
    expect((orph['requirements_without_design'] as Row[]).map((x) => x['key'])).not.toContain(`V9:UX-03-001-${RUN}`);
    expect((orph['assets_without_requirement'] as Row[]).map((x) => x['asset_id'])).not.toContain(BUTTON);
  });
  it('refusals: a link between two non-design artifacts (§RG\'s) · a duplicate · an unknown artifact · a relation outside the list · the PDP', async () => {
    await refused(link(steward, { from: TEST, to: REQ2, relation: 'verifies' }), /^design baseline rejected \(scope\)/, 422);
    await refused(link(steward, { from: BUTTON, to: REQ, relation: 'implements' }), /^design baseline rejected \(duplicate\)/, 409);
    await refused(link(steward, { from: uuidv7(), to: REQ, relation: 'implements' }), /^design baseline rejected \(unknown_artifact\)/, 404);
    await refused(link(steward, { from: BUTTON, to: REQ2, relation: 'owned_by' }), /^design baseline rejected \(relation\)/, 422);
    await refused(link(pao as never, { from: BUTTON, to: REQ2, relation: 'implements' }), DENIED, 403);
  });
  it('recovery: the orphan closed by a link; a link retired by a later row (never deleted); contradictions stated', async () => {
    const l = (await link(steward, { from: PATTERN, to: REQ2, relation: 'implements' }))['link'] as Row;
    expect(((await workspace())['orphans'] as Row)['requirements_without_design']).not.toEqual(expect.arrayContaining([expect.objectContaining({ key: `V9:REL-01-${RUN}` })]));
    await link(steward, { retire: l['link_id'] });
    expect(await n(sql`select count(*)::int n from governance.links_live where link_id = ${String(l['link_id'])}::uuid`)).toBe(0);
    expect(await n(sql`select count(*)::int n from governance.links where link_id = ${String(l['link_id'])}::uuid`)).toBe(1);
    expect(((await workspace())['orphans'] as Row)['contradictions']).toBeDefined();
  });
});

describe('DG9 · the independent conformance package (UX-70-006, UX-66-006) — left UNSIGNED (R2)', () => {
  it('positive: UX-70-006 over the accepted design acceptance — the exact tuple, evidence with ages, findings; UNSIGNED', async () => {
    const r = (await generate(assurance, { target: 'UX-70-006', acceptanceId: ACC }))['package'] as Row;
    expect(r).toMatchObject({ target: 'UX-70-006', signed: false });
    const c = r['content'] as Row;
    expect((c['tuple'] as Row)['acceptance']).toMatchObject({ acceptance_id: ACC, version: 2, state: 'accepted', claim: 'demonstration' });
    expect((c['evidence'] as Row[]).every((e) => e['age_days'] === null || typeof e['age_days'] === 'number')).toBe(true);
    expect((c['evidence'] as Row[]).map((e) => e['kind'])).toEqual(expect.arrayContaining(['design_evaluation', 'journey_walk', 'experience_action']));
    expect((c['findings'] as Row[]).map((f) => f['class'])).toContain('accessibility_unsupported');
    expect(c['unsigned']).toBe(true);
    expect(await one(sql`select signed, claim from governance.design_conformance_packages where package_id = ${String(r['package_id'])}::uuid`)).toEqual({ signed: false, claim: 'demonstration' });
    const read = (await W(dc.readPackage(dreq(auditor, 'governance.read'), T(), D(), String(r['package_id']))))['package'] as Row;
    expect(read).toMatchObject({ digest: r['digest'], signed: false, claim: 'demonstration' });
    await expect(sql`update governance.design_conformance_packages set signed = true where package_id = ${String(r['package_id'])}::uuid`.execute(h.su)).rejects.toThrow(/append-only|append only/i);
  });
  it('positive: UX-66-006 without a record — the attested baseline, B94 evidence by reference (none here → stated), findings', async () => {
    const r = (await generate(steward, { target: 'UX-66-006' }))['package'] as Row;
    const f = ((r['content'] as Row)['findings'] as Row[]).map((x) => x['class']);
    expect(f).toEqual(expect.arrayContaining(['no_acceptance', 'onboarding_unaccepted', 'accessibility_unsupported']));
    expect(((r['content'] as Row)['tuple'] as Row)['design_system']).toMatchObject({ baseline_id: BASELINE, state: 'attested' });
    const auditorPkg = (await generate(auditor, { target: 'UX-66-006' }))['package'] as Row;
    expect(auditorPkg['signed']).toBe(false);
  });
  it('refusals: the domain admin (PDP) · a target outside the two · an unknown record · another tenant\'s auditor (PDP)', async () => {
    await refused(generate(dadmin, { target: 'UX-70-006' }), DENIED, 403);
    await refused(generate(steward, { target: 'UX-99-006' }), /^conformance package rejected \(target\)/, 422);
    await refused(generate(steward, { target: 'UX-70-006', acceptanceId: uuidv7() }), /^conformance package rejected \(unknown_acceptance\)/, 404);
  });
  it('FAULT: no signing key bound → the attestation refused (409 unbound) and nothing written; recovery once the key is bound again', async () => {
    const a = (await proposeA(steward, { baselineId: BASELINE, components: [BUTTON], tuple: { ...TUPLE, device: 'tablet' }, evidence: evidence() }))['acceptance'] as Row;
    const id = String(a['acceptance_id']);
    delete process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'];
    try {
      await refused(attest(dsa, id, { version: 1, obligation: 'design', digest: a['digest'] }), /signature rejected \(unbound\)/, 409);
      expect(await n(sql`select count(*)::int n from executive.signatures where subject_id = ${id}::uuid`)).toBe(0);
      expect(await one(sql`select attestations from governance.design_acceptances where acceptance_id = ${id}::uuid`)).toEqual({ attestations: [] });
    } finally { process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = KEY_B64; }
    expect(((await attest(dsa, id, { version: 1, obligation: 'design', digest: a['digest'] }))['acceptance'] as Row)['remaining']).toEqual(['assurance']);
  });
});

describe('DG10 · boundaries: RLS, the ledger (REPLAY), cross-tenant reads', () => {
  it('every §DG table forces RLS; the PLATFORM registers carry no write grant to a runtime role', async () => {
    const forced = await rows(sql`select c.relname as t, c.relforcerowsecurity as f from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'governance' and c.relname like 'design\\_%' and c.relkind = 'r' order by 1`);
    expect(forced.map((r) => r['t'])).toEqual(['design_acceptances', 'design_assets', 'design_baselines', 'design_conformance_packages', 'design_contributions', 'design_evaluations', 'design_exceptions',
                                              'design_experience_intakes', 'design_principles']);
    expect(forced.every((r) => r['f'] === true)).toBe(true);
    expect(await n(sql`select count(*)::int n from information_schema.role_table_grants where table_schema = 'governance' and table_name like 'design\\_%' and grantee in ('eye_app', 'eye_commit') and privilege_type <> 'SELECT'`)).toBe(0);
  });
  it('REPLAY: the ledger reconstructs the baseline\'s and the acceptance\'s history in order', async () => {
    expect(await events(BASELINE)).toEqual(['design.baseline_proposed', 'design.baseline_held', 'design.baseline_attested', 'design.baseline_proposed', 'design.baseline_rejected']);
    expect(await events(ACC)).toEqual(['design.acceptance_proposed', 'design.acceptance_attested', 'design.acceptance_attested', 'design.acceptance_accepted', 'design.acceptance_withheld',
                                       'design.acceptance_proposed', 'design.acceptance_attested', 'design.acceptance_accepted']);
  });
  it('cross-tenant: another tenant\'s domain reads none of this domain\'s acceptances, intakes or packages; the vendor\'s registry is readable to it', async () => {
    const r = await dread(uAdmin, U, DU);
    expect(r['acceptances']).toEqual([]);
    expect(r['intakes']).toEqual([]);
    expect(r['packages']).toEqual([]);
    expect((r['baseline'] as Row)['baseline_id']).toBe(BASELINE);
    await refused(dread(uAdmin), DENIED, 403);
  });
});
