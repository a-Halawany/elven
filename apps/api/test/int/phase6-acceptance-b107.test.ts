/**
 * CP-6 B107 §AR (migration 0115_b107_x_ar) — SCOPE-SPECIFIC ACCEPTANCE on a real database through the real pipeline, ports and controllers.
 * CONSTRUCTION evidence: every persona, capability, release candidate, exception and record here is SYNTHETIC; an attestation by a synthetic
 * persona demonstrates the software only; real acceptance by named independent and customer authorities (R2), the staffing of the
 * obligations (H2) and production admission (R1) are never claimed — the record cannot carry them (claim CHECK = 'demonstration').
 *
 *   AR1 · THE EVIDENCE VAULT (INF-OP-12, DAT-OP-12, IADR-022): references verified and digest-bound, never rewritten; append-only; renewals.
 *   AR2 · PROPOSE (PR-71-001/-002, ADR-023, CAP-AU-11, PAT-48, IA-71-003): the exact scope; blanket, missing, stale, failed, unknown, foreign,
 *         conditional-above-C2, duplicate and stale-version proposals refused; a CORRECTION (v2 supersedes the proposed v1).
 *   AR3 · VERIFY → ATTEST (PR-71-003, ES-71-002, CAP-DL-12, AT-71, JRN-24): the customer verifies before attesting; one named human per
 *         obligation, signed; the proposer, a builder, an agent, a wrong role, one person twice, a stale digest, another tenant refused;
 *         ACCEPTED only when every obligation is signed; the journey's stages.
 *   AR4 · THE ACCEPTED-SCOPE READ AND THE OPT-IN GATE (FEX-31 read, Q5): accepted here, not accepted there; the gate refuses outside the scope
 *         and never gates reads; the marking is the product authority's (PLATFORM, human-gated) and never covers a mandatory control.
 *   AR5 · EVIDENCE EXPIRY (FEX-31, ES-71-004, IA-71-005, DP-71-005, PR-71-005): the tick's timer and sweep constrain the record to its
 *         unaffected scope, open the expansion hold, raise attention; expansion refused (a new domain, a wider scope); RE-ACCEPTANCE over
 *         renewed evidence lifts it (recovery).
 *   AR6 · REVIEW TRIGGERS (ES-71-005): an incident under review, a suspension (the gate refuses), SLO exhaustion declared (B64 carries the
 *         computation), an overdue condition and the end of the period swept; refusals.
 *   AR7 · OPERATIONAL ACCEPTANCE (ES-71-001/-003, IA-71-002/-003/-006, DP-71-002/-003/-006, DAT-DL-08, TS-020, V04-T-003): the operating
 *         terms, the absent evidence slots as open conditions, a condition met by matching evidence; the joint signed acceptance.
 *   AR8 · RELEASE ACCEPTANCE (PAT-48, OBJ-40, ES-68-004): the candidate's identity bound; exceptions carried; a HELD candidate or an expired
 *         exception refuses; the preview's eligibility, digest and consequence; the sweep constrains a release whose candidate is held.
 *   AR9 · WITHDRAWAL (reversible acceptance) · AR10 · REPLAY, RLS, CROSS-TENANT, APPEND-ONLY, THE CLAIM · AR11 · FAULT: the signing key unbound.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { generateKeyPairSync, createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { AcceptanceController, AcceptancePlatformController } from '../../src/governance/acceptance/acceptance.controller.js';
import { AcceptanceService } from '../../src/governance/acceptance/acceptance.service.js';
import { Phase4Harness } from './phase4-helpers.js';

// THE SIGNING KEY (the B36 signer's discipline): generated here, bound in the process before the boot.
const KEY = generateKeyPairSync('ed25519');
const KEY_REF = ['EYE', 'EXECUTIVE', 'SIGNING', 'KEY', 'DEMO'].join('_');
const KEY_VALUE = KEY.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
process.env[KEY_REF] = KEY_VALUE;

type Row = Record<string, unknown>;
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';
let h: Phase4Harness; let api: AcceptanceController; let papi: AcceptancePlatformController; let svc: AcceptanceService;
let T = ''; let D = ''; let D2 = ''; let U = ''; let DU = '';
const RUN = uuidv7().slice(-6);
const PURPOSE = 'governance';
const sha = (s: string) => createHash('sha256').update(s).digest('hex');

// ── personas (SYNTHETIC) ─────────────────────────────────────────────────────────────────────────
let product: AuthenticatedPrincipal;     // product_authority (PLATFORM) — proposes and attests the product obligation
let product2: AuthenticatedPrincipal;    // a second product authority
let assurance: AuthenticatedPrincipal;   // independent_assurance (PLATFORM)
let assurance2: AuthenticatedPrincipal;  // a second independent assurance
let builderAssurer: AuthenticatedPrincipal; // independent_assurance, declared BUILDER of the capability (independence probe)
let dual: AuthenticatedPrincipal;        // holds product_authority AND independent_assurance (one-person-per-obligation probe)
let ops: AuthenticatedPrincipal;         // operations_authority (PLATFORM)
let steward: AuthenticatedPrincipal;     // conformance_steward (PLATFORM) — records evidence, proposes, approves nothing
let machineAssurer: AuthenticatedPrincipal; // an AGENT holding independent_assurance whose session claims a human (the PEP passes; the PORT refuses)
let sponsor: AuthenticatedPrincipal;     // customer_sponsor (TENANT)
let sponsor2: AuthenticatedPrincipal;
let tadmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let dadmin2: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal; let analyst2: AuthenticatedPrincipal;
let foreignSponsor: AuthenticatedPrincipal; // customer_sponsor of ANOTHER tenant
let agentId = '';

// ── envelopes and calls ─────────────────────────────────────────────────────────────────────────
function env(p: AuthenticatedPrincipal, action: string, scope: Scope, t: string | null, d: string | null): Envelope {
  return { message_id: uuidv7(), scope, tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: PURPOSE, action,
    side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C2', object_type: null, object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b107-ar' } as unknown as Envelope;
}
const dreq = (p: AuthenticatedPrincipal, action: string, d = D, t = T) => ({ eyeEnvelope: env(p, action, 'DOMAIN', t, d), eyePrincipal: p }) as never;
const preq = (p: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: env(p, action, 'PLATFORM', null, null), eyePrincipal: p }) as never;

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string; body: Row }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e), body: {} };
  const r = mapped.getResponse() as Row;
  const raw = e instanceof HttpException ? String(r['message'] ?? '') : (e instanceof Error ? e.message : String(e));
  return { status: mapped.getStatus(), message: raw, body: r };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const failure = async (q: ReturnType<typeof sql>): Promise<string> => q.execute(h.su).then(() => 'no error', (e: unknown) => (e instanceof Error ? e.message : String(e)));

const evidence = (as: AuthenticatedPrincipal, payload: Row, d = D) => api.recordEvidence(dreq(as, 'governance.acceptance.evidence.record', d), T, d, { payload }) as Promise<{ evidence: Row }>;
const propose = (as: AuthenticatedPrincipal, payload: Row, d = D) => api.propose(dreq(as, 'governance.acceptance.propose', d), T, d, { payload }) as Promise<{ record: Row }>;
const verify = (as: AuthenticatedPrincipal, id: string, payload: Row, d = D, t = T) => api.verify(dreq(as, 'governance.acceptance.verify', d, t), t, d, id,
  { payload: { findings: 'the scope, journeys and evidence read against the customer\'s own operation (SYNTHETIC)', ...payload } }) as Promise<{ verification: Row }>;
const attest = (as: AuthenticatedPrincipal, id: string, payload: Row, d = D, t = T) => api.attest(dreq(as, 'governance.acceptance.attest', d, t), t, d, id,
  { payload: { reason: 'the obligation\'s evidence read and accepted for this exact scope (SYNTHETIC)', ...payload } }) as Promise<{ attestation: Row }>;
const trigger = (as: AuthenticatedPrincipal, id: string, payload: Row, d = D) => api.trigger(dreq(as, 'governance.acceptance.trigger', d), T, d, id,
  { payload: { reason: 'a SYNTHETIC incident on the supply-risk path is under review', ...payload } }) as Promise<{ record: Row }>;
const closeCondition = (as: AuthenticatedPrincipal, id: string, payload: Row, d = D) => api.conditionMet(dreq(as, 'governance.acceptance.condition.close', d), T, d, id,
  { payload: { reason: 'the slot evidence is recorded and current (SYNTHETIC)', ...payload } }) as Promise<{ condition: Row }>;
const withdraw = (as: AuthenticatedPrincipal, id: string, d = D) => api.withdraw(dreq(as, 'governance.acceptance.withdraw', d), T, d, id,
  { payload: { reason: 'the capability is withdrawn from this scope (SYNTHETIC)' } }) as Promise<{ record: Row }>;
const workspace = (as: AuthenticatedPrincipal, d = D) => api.workspace(dreq(as, 'governance.acceptance.read', d), T, d) as Promise<Row & { records: Row[]; evidence: Row[]; scopes: Row[]; journeys: Record<string, Row> }>;
const scopeOf = (as: AuthenticatedPrincipal, key: string, d = D) => api.scope(dreq(as, 'governance.acceptance.read', d), T, d, { payload: { subjectKey: key } }) as Promise<{ scope: Row }>;
const preview = (as: AuthenticatedPrincipal, id: string, version: number, d = D) => api.preview(dreq(as, 'governance.acceptance.read', d), T, d, id, { payload: { version } }) as Promise<Row & { record: Row; eligibility: Row; consequence: string[]; journey: Row }>;
const history = (as: AuthenticatedPrincipal, id: string) => api.history(dreq(as, 'governance.acceptance.read'), T, D, id) as Promise<{ events: Row[] }>;
const enforce = (as: AuthenticatedPrincipal, payload: Row) => papi.set(preq(as, 'governance.acceptance.enforce'), { payload: { reason: 'the supply-risk capability is gated by its acceptance (SYNTHETIC)', ...payload } }) as Promise<{ enforcement: Row }>;

/** THE SENTINEL (B91's): drive the REAL pipeline for `action`; 'reached' = the PDP and every gate let it through to its handler. */
const SENTINEL = new Error('b107-ar-sentinel: the request reached its handler');
async function reach(p: AuthenticatedPrincipal, action: string, d = D): Promise<'reached' | { status: number; message: string }> {
  const route = { scope: 'DOMAIN' as const, tenantId: T, domainId: d, action, objectType: null, objectId: null };
  try {
    await h.pipeline.write({ ...env(p, action, 'DOMAIN', T, d), purpose_id: 'observation' } as Envelope, p, route, (() => null) as never, async () => { throw SENTINEL; });
  } catch (e) {
    if (e === SENTINEL) return 'reached';
    if (e instanceof HttpException) { const b = e.getResponse() as Row; return { status: e.getStatus(), message: String(b['message']) }; }
    throw e;
  }
  throw new Error(`${action}: the sentinel handler did not run and nothing was refused`);
}

// ── fixtures (SYNTHETIC, planted by the superuser — §RG / §CM / §PG own the real registries) ───────────────
async function person(label: string, kind: 'human' | 'agent', scope: Scope, t: string | null, d: string | null, roles: Array<{ role: string; scope: Scope; domain?: string }>, claim: 'human' | 'agent' = kind): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${scope}, ${t}::uuid, ${d}::uuid, ${`b107ar-${label}-${RUN} (SYNTHETIC)`}, ${`b107ar-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r.role, scope: r.scope, tenantId: r.scope === 'PLATFORM' ? null : (t ?? T), domainId: r.scope === 'DOMAIN' ? (r.domain ?? d) : null }));
  for (const b of bindings) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
              values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  }
  return h.openSession({ ...h.manager, principalId: id, kind: claim, assurance: claim === 'agent' ? 'agent_grant' : 'password', homeScope: scope, homeTenantId: t, homeDomainId: d, bindings } as AuthenticatedPrincipal);
}
async function artifact(kind: string, key: string, attrs: Row = {}, lifecycle = 'active'): Promise<string> {
  const id = uuidv7();
  await sql`insert into governance.artifacts (artifact_id, version, scope, kind, external_key, title, lifecycle, attributes, digest, recorded_by, correlation_id)
            values (${id}::uuid, 1, 'PLATFORM', ${kind}, ${key}, ${`${key} (SYNTHETIC — planted by the §AR harness)`}, ${lifecycle}, ${JSON.stringify(attrs)}::jsonb, ${sha(`${key}:1`)}, ${steward.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  return id;
}
/** A capability's next version (a change of the capability — the sweep's capability_changed). */
async function bumpArtifact(id: string): Promise<void> {
  const cur = await one(sql`select version, kind, external_key, title, attributes from governance.artifacts where artifact_id = ${id}::uuid and superseded_at is null`);
  await sql`update governance.artifacts set superseded_at = clock_timestamp() where artifact_id = ${id}::uuid and superseded_at is null`.execute(h.su);
  await sql`insert into governance.artifacts (artifact_id, version, scope, kind, external_key, title, attributes, digest, recorded_by, correlation_id)
            values (${id}::uuid, ${Number(cur['version']) + 1}, 'PLATFORM', ${String(cur['kind'])}, ${String(cur['external_key'])}, ${String(cur['title'])}, ${JSON.stringify(cur['attributes'])}::jsonb,
                    ${sha(`${String(cur['external_key'])}:${Number(cur['version']) + 1}`)}, ${steward.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
}
const hold = async (subject: string, reasonKind: string, source: string | null = null) => {
  const id = uuidv7();
  await sql`insert into governance.holds (hold_id, scope, subject_artifact, reason_kind, source_artifact, reason, opened_by, correlation_id)
            values (${id}::uuid, 'PLATFORM', ${subject}::uuid, ${reasonKind}, ${source}::uuid, 'an exception on the export path expired yesterday (SYNTHETIC)', ${steward.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  return id;
};
const lift = (holdId: string) => sql`update governance.holds set lifted_at = clock_timestamp(), lifted_by = ${steward.principalId}::uuid, lift_reason = 'renewed with current evidence (SYNTHETIC)' where hold_id = ${holdId}::uuid`.execute(h.su);
async function plantAdmission(t = T, d = D): Promise<{ id: string; digest: string }> {
  const id = uuidv7(); const digest = sha(`admission:${id}`);
  await sql`insert into service.admission_records (admission_id, version, tenant_id, domain_id, deployment_profile, period_from, period_to, baseline_digest, matrix, grant_ledger, drills, exercises, digest, proposed_by, correlation_id)
            values (${id}::uuid, 1, ${t}::uuid, ${d}::uuid, 'local-dev', current_date - 10, current_date, ${sha('baseline')}, '{}'::jsonb, '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, ${digest}, ${dadmin.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  return { id, digest };
}

const DAY = 86_400_000;
const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);
const CAP = `CAP-FW-07-${RUN}`;     // the supply-chain intelligence workspace (SYNTHETIC key)
const CAP2 = `CAP-AU-11-${RUN}`;    // a second capability (operational / triggers)
const GATECAP = `CAP-GATE-${RUN}`;  // the capability the gate is exercised on
const CAP3 = `CAP-OP-${RUN}`;       // the capability operated (operational acceptance)
const RC = `RC-${RUN}`;             // a local release candidate (B65 substituted)
const RCK = `RC-K-${RUN}`;          // the fault exercise's candidate
let capId = ''; let cap2Id = ''; let gateCapId = ''; let rcId = ''; let excId = ''; let excExpiredId = '';

const SCOPE = (over: Row = {}): Row => ({
  capability_version: '2026.10-synthetic', journeys: ['JRN-12', 'JRN-24'], roles: ['domain_analyst', 'executive'], deployment_profile: 'local-dev', entitlement: 'supply_chain_intelligence',
  data_versions: { 'nordwerk.suppliers': 'v3', 'corridor.flows': 'v7' }, model_versions: { 'supply-risk': '1.4.0' }, configuration_digest: sha('config'), consequence_class: 'C2',
  period: { from: today(), to: inDays(180) }, ...over,
});
const ext = (kind: string, validMs: number, over: Row = {}): Row => ({ kind, title: `${kind.replace('_', ' ')} for the supply-risk capability (SYNTHETIC)`, subjectKind: 'external',
  pointer: `evidence/synthetic/${kind}-${RUN}.json`, digest: sha(`${kind}:${RUN}:${Math.random()}`), capturedAt: new Date(Date.now() - 60_000).toISOString(),
  validUntil: new Date(Date.now() + validMs).toISOString(), ...over });
const SLOT_ITEMS = async (as: AuthenticatedPrincipal, kinds: readonly string[], d = D): Promise<string[]> => {
  const out: string[] = [];
  for (const k of kinds) out.push(String((await evidence(as, ext(k, 90 * DAY), d)).evidence['evidence_id']));
  return out;
};
const CAP_SLOTS = ['security_review', 'privacy_review', 'accessibility', 'resilience', 'recovery', 'support_readiness', 'parity'];

let slot = 0;
const tick = async () => {
  const timer = h.app.get(AttentionTimerService);
  const o = await timer.tickNow({ tenantId: T, domainId: D, agentId, scheduledAt: new Date(Date.UTC(2036, 0, 1) + (slot++) * 60_000) });
  expect(o.outcome, JSON.stringify(o.run?.outputs ?? o.stopReason).slice(0, 600)).toBe('finished');
  return { steps: (o.run?.outputs['steps'] ?? {}) as Record<string, Row> };
};
/** Attest every obligation of a version with the right persona each (the customer verifies first). */
async function acceptAll(id: string, version: number, digest: string, who: Partial<Record<string, AuthenticatedPrincipal>> = {}, d = D): Promise<Row> {
  const rec = await one(sql`select obligations from governance.acceptance_records where record_id = ${id}::uuid and version = ${version}`);
  const people: Record<string, AuthenticatedPrincipal> = { product, independent_assurance: assurance, customer: sponsor, operations: ops, ...who } as Record<string, AuthenticatedPrincipal>;
  let last: Row = {};
  if ((rec['obligations'] as string[]).includes('customer') && (await one(sql`select count(*)::int n from governance.acceptance_verifications where record_id = ${id}::uuid and version = ${version}`))['n'] === 0) {
    await verify(people['customer']!, id, { version, digest }, d);
  }
  for (const o of rec['obligations'] as string[]) last = (await attest(people[o]!, id, { version, obligation: o, digest }, d)).attestation;
  return last;
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  api = h.app.get(AcceptanceController); papi = h.app.get(AcceptancePlatformController); svc = h.app.get(AcceptanceService);
  // the second domain of the tenant (the NORDWERK Polska stand-in) and another tenant (cross-tenant)
  D2 = uuidv7(); U = uuidv7(); DU = uuidv7();
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${D2}::uuid, ${T}::uuid, ${`b107ar-polska-${RUN} (SYNTHETIC)`}, 'active', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${U}::uuid, ${`b107ar-other-${RUN} (SYNTHETIC)`}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${DU}::uuid, ${U}::uuid, ${`b107ar-other-domain-${RUN}`}, 'active', clock_timestamp())`.execute(h.su);
  product = await person('product', 'human', 'PLATFORM', null, null, [{ role: 'product_authority', scope: 'PLATFORM' }]);
  product2 = await person('product2', 'human', 'PLATFORM', null, null, [{ role: 'product_authority', scope: 'PLATFORM' }]);
  assurance = await person('assurance', 'human', 'PLATFORM', null, null, [{ role: 'independent_assurance', scope: 'PLATFORM' }]);
  assurance2 = await person('assurance2', 'human', 'PLATFORM', null, null, [{ role: 'independent_assurance', scope: 'PLATFORM' }]);
  builderAssurer = await person('builder', 'human', 'PLATFORM', null, null, [{ role: 'independent_assurance', scope: 'PLATFORM' }]);
  dual = await person('dual', 'human', 'PLATFORM', null, null, [{ role: 'product_authority', scope: 'PLATFORM' }, { role: 'independent_assurance', scope: 'PLATFORM' }]);
  ops = await person('ops', 'human', 'PLATFORM', null, null, [{ role: 'operations_authority', scope: 'PLATFORM' }]);
  steward = await person('steward', 'human', 'PLATFORM', null, null, [{ role: 'conformance_steward', scope: 'PLATFORM' }]);
  machineAssurer = await person('machine', 'agent', 'PLATFORM', null, null, [{ role: 'independent_assurance', scope: 'PLATFORM' }], 'human');
  sponsor = await person('sponsor', 'human', 'TENANT', T, null, [{ role: 'customer_sponsor', scope: 'TENANT' }]);
  sponsor2 = await person('sponsor2', 'human', 'TENANT', T, null, [{ role: 'customer_sponsor', scope: 'TENANT' }]);
  tadmin = await person('tadmin', 'human', 'TENANT', T, null, [{ role: 'tenant_admin', scope: 'TENANT' }]);
  dadmin = await person('dadmin', 'human', 'DOMAIN', T, D, [{ role: 'domain_admin', scope: 'DOMAIN' }]);
  dadmin2 = await person('dadmin-d2', 'human', 'DOMAIN', T, D2, [{ role: 'domain_admin', scope: 'DOMAIN' }]);
  analyst = await person('analyst', 'human', 'DOMAIN', T, D, [{ role: 'domain_analyst', scope: 'DOMAIN' }]);
  analyst2 = await person('analyst-d2', 'human', 'DOMAIN', T, D2, [{ role: 'domain_analyst', scope: 'DOMAIN' }]);
  foreignSponsor = await person('foreign-sponsor', 'human', 'TENANT', U, null, [{ role: 'customer_sponsor', scope: 'TENANT' }]);
  capId = await artifact('capability', CAP, { builders: [builderAssurer.principalId], volume: 'V8' });
  cap2Id = await artifact('capability', CAP2, { builders: [builderAssurer.principalId] });
  gateCapId = await artifact('capability', GATECAP);
  await artifact('capability', CAP3);
  await artifact('release_candidate', RCK, { substituted: 'B65' });
  rcId = await artifact('release_candidate', RC, { head_sha: 'a'.repeat(40), migration_head: '0115_b107_x_ar.sql', policy_bundle: 'bundle-v1', manifest_digest: sha('manifest'), substituted: 'B65' });
  excId = await artifact('exception', `EXC-EXPORT-${RUN}`, { expires_at: new Date(Date.now() + 30 * DAY).toISOString(), approver: 'independent_assurance' });
  excExpiredId = await artifact('exception', `EXC-OLD-${RUN}`, { expires_at: new Date(Date.now() - DAY).toISOString() });
  // the attention agent whose ticks fire the acceptance.evidence_expiry timers and run the sweep step
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const a = await h.app.get(Ec).registerAgent(h.req(tadmin, 'agent.register', 'AGT', null, 'platform.administration'), T, D, { payload: {
    kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: dadmin.principalId, escalationPrincipalId: dadmin.principalId,
    budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 60 } } }) as { agent: { agentId: string } };
  agentId = a.agent.agentId;
}, 600_000);

afterAll(async () => {
  try {
    const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
    if (agentId !== '') await h.app.get(Ec).revokeAgent(h.req(tadmin, 'agent.revoke', 'AGT', agentId, 'platform.administration'), T, D, agentId, { payload: { reason: 'the B107 §AR harness is done' } });
  } catch { /* already revoked */ }
  await h?.close();
}, 120_000);

// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('AR1 · the evidence vault (INF-OP-12, DAT-OP-12, IADR-022)', () => {
  it('POSITIVE: an external item and a REFERENCED B94 admission record (digest bound from the row, never rewritten); registered as an evidence artifact', async () => {
    const e1 = (await evidence(steward, ext('test_report', 30 * DAY))).evidence;
    expect(e1).toMatchObject({ kind: 'test_report', subject_kind: 'external', claim: 'demonstration' });
    const adm = await plantAdmission();
    const before = await one(sql`select digest, state from service.admission_records where admission_id = ${adm.id}::uuid`);
    const e2 = (await evidence(dadmin, { kind: 'admission_record', title: 'the corridor admission record (SYNTHETIC, B94 §SA)', subjectKind: 'service.admission_record', subjectId: adm.id,
      validUntil: new Date(Date.now() + 60 * DAY).toISOString() })).evidence;
    expect(e2['subject_digest']).toBe(adm.digest);
    expect(await one(sql`select digest, state from service.admission_records where admission_id = ${adm.id}::uuid`)).toEqual(before);
    expect(await one(sql`select kind, scope, domain_id::text from governance.artifacts where artifact_id = ${String(e2['evidence_id'])}::uuid and superseded_at is null`)).toEqual({ kind: 'evidence', scope: 'DOMAIN', domain_id: D });
  });
  it('REFUSALS: a stale digest (409) · an unknown or another tenant\'s record (404) · validity not after capture or beyond three years (422) · an external item without a pointer · a role without the act (PDP)', async () => {
    const adm = await plantAdmission();
    await refused(evidence(dadmin, { kind: 'admission_record', title: 'a stale reference (SYNTHETIC)', subjectKind: 'service.admission_record', subjectId: adm.id, digest: 'b'.repeat(64),
      validUntil: new Date(Date.now() + DAY).toISOString() }), /^acceptance record rejected \(stale\): the digest named is not the referenced admission record/, 409);
    const foreign = await plantAdmission(U, DU);
    await refused(evidence(dadmin, { kind: 'admission_record', title: 'another tenant\'s record (SYNTHETIC)', subjectKind: 'service.admission_record', subjectId: foreign.id,
      validUntil: new Date(Date.now() + DAY).toISOString() }), /^acceptance record rejected \(unknown_evidence_subject\)/, 404);
    await refused(evidence(steward, ext('test_report', -2 * 60_000)), /^acceptance record rejected \(evidence\): an item is valid until an instant after its capture/, 422);
    await refused(evidence(steward, ext('test_report', 1200 * DAY)), /within three years — evidence expires/, 422);
    await refused(evidence(steward, { ...ext('runbook', DAY), pointer: undefined }), /an external item names its pointer and its digest/, 422);
    await refused(evidence(analyst, ext('runbook', DAY)), /no qualifying role binding/, 403);
  });
  it('RENEWAL and APPEND-ONLY: a renewal keeps the kind and renews once; an item is never updated or deleted', async () => {
    const e1 = (await evidence(steward, ext('dashboard', DAY))).evidence;
    await refused(evidence(steward, ext('alert', DAY, { renews: e1['evidence_id'] })), /a renewal keeps the kind/, 422);
    const e2 = (await evidence(steward, ext('dashboard', 10 * DAY, { renews: e1['evidence_id'] }))).evidence;
    expect(e2['renews']).toBe(e1['evidence_id']);
    await refused(evidence(steward, ext('dashboard', 10 * DAY, { renews: e1['evidence_id'] })), /^acceptance record rejected \(duplicate\): item .* is already renewed/, 409);
    expect(await failure(sql`update governance.acceptance_evidence set valid_until = clock_timestamp() + interval '9 years' where evidence_id = ${String(e1['evidence_id'])}::uuid`)).toMatch(/append-only|append only/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
let R1 = ''; let R1DIGEST = ''; let TEST1 = ''; let SLOTS1: string[] = [];
describe('AR2 · propose: the exact scope (PR-71-001/-002, ADR-023, CAP-AU-11, PAT-48, IA-71-003)', () => {
  beforeAll(async () => {
    TEST1 = String((await evidence(steward, ext('test_report', 30 * DAY, { covers: { journeys: ['JRN-12'] } }))).evidence['evidence_id']);
    SLOTS1 = await SLOT_ITEMS(steward, CAP_SLOTS);
  });
  it('REFUSALS (the route): a blanket value · a missing scope key · an unknown kind or obligation', async () => {
    await refused(propose(product2, { kind: 'capability', title: 'Supply risk (SYNTHETIC)', subjectKey: CAP, scope: SCOPE({ roles: ['*'] }), evidence: [TEST1] }),
      /^acceptance record rejected \(blanket\): roles\.\[0\] is a blanket value .*PAT-48/, 422);
    const { period: _p, ...noPeriod } = SCOPE();
    await refused(propose(product2, { kind: 'capability', title: 'Supply risk (SYNTHETIC)', subjectKey: CAP, scope: noPeriod, evidence: [TEST1] }), /\(scope\): the scope names period/, 422);
    await refused(propose(product2, { kind: 'everything', title: 'x', subjectKey: CAP, scope: SCOPE(), evidence: [TEST1] }), /\(kind\)/, 422);
    await refused(propose(product2, { kind: 'capability', title: 'Supply risk', subjectKey: CAP, scope: SCOPE(), evidence: [TEST1], obligations: ['vibes'] }), /\(obligation\): vibes is not an obligation/, 422);
  });
  it('REFUSALS (the PORT re-checks, the route bypassed): a blanket journey list · a role the product does not have · a period over 366 days · no test evidence · a conditional record above C2', async () => {
    const env0 = env(product2, 'governance.acceptance.propose', 'DOMAIN', T, D);
    const base = { recordId: null, kind: 'capability', title: 'Supply risk (SYNTHETIC)', subjectKey: CAP, obligations: [], evidence: [TEST1, ...SLOTS1], conditions: [], exceptions: [], operational: null, builders: [], expectedVersion: 0 };
    await refused(svc.propose(env0, product2, T, D, { ...base, scope: SCOPE({ journeys: [] }) }), /^acceptance record rejected \(blanket\): journeys is a blanket value/, 422);
    await refused(svc.propose({ ...env0, correlation_id: uuidv7() } as Envelope, product2, T, D, { ...base, scope: SCOPE({ roles: ['domain_analyst', 'grand_vizier'] }) }), /every role in scope is a role of the product \(grand_vizier\)/, 422);
    await refused(svc.propose({ ...env0, correlation_id: uuidv7() } as Envelope, product2, T, D, { ...base, scope: SCOPE({ period: { from: today(), to: inDays(400) } }) }), /\(period\): .* at most 366 days/, 422);
    const runbook = String((await evidence(steward, ext('runbook', 30 * DAY))).evidence['evidence_id']);
    await refused(svc.propose({ ...env0, correlation_id: uuidv7() } as Envelope, product2, T, D, { ...base, evidence: [runbook, ...SLOTS1], scope: SCOPE() }), /^acceptance record rejected \(evidence_missing\): a capability acceptance needs current test or journey evidence/, 422);
    await refused(svc.propose({ ...env0, correlation_id: uuidv7() } as Envelope, product2, T, D, { ...base, evidence: [TEST1], scope: SCOPE({ consequence_class: 'C3' }) }),
      /^acceptance record rejected \(conditional\): a conditional acceptance \(7 open conditions\) is consequence-limited to C2/, 422);
  });
  it('REFUSALS (stale / unknown / foreign): expired evidence (409) · a failed test (422) · an unknown capability (404) · another domain\'s item (404) · covers outside the scope', async () => {
    const quick = String((await evidence(steward, ext('test_report', 1500))).evidence['evidence_id']);
    await new Promise((r) => setTimeout(r, 1800));
    await refused(propose(product2, { kind: 'capability', title: 'Supply risk (SYNTHETIC)', subjectKey: CAP, scope: SCOPE(), evidence: [quick, ...SLOTS1] }), /^acceptance record rejected \(stale\): evidence .* \(test_report\) expired at/, 409);
    const t2 = (await evidence(steward, ext('test_report', 30 * DAY))).evidence;
    await evidence(steward, ext('test_report', 30 * DAY, { renews: t2['evidence_id'], outcome: 'failed', title: 'the regression run FAILED (SYNTHETIC)' }));
    await refused(propose(product2, { kind: 'capability', title: 'Supply risk (SYNTHETIC)', subjectKey: CAP, scope: SCOPE(), evidence: [String(t2['evidence_id']), ...SLOTS1] }), /\(evidence_failed\): .* records a failure — remediate and retest/, 422);
    await refused(propose(product2, { kind: 'capability', title: 'Supply risk (SYNTHETIC)', subjectKey: `CAP-NONE-${RUN}`, scope: SCOPE(), evidence: [TEST1] }), /^acceptance record rejected \(unknown_subject\)/, 404);
    const d2item = String((await evidence(steward, ext('test_report', 30 * DAY), D2)).evidence['evidence_id']);
    await refused(propose(product2, { kind: 'capability', title: 'Supply risk (SYNTHETIC)', subjectKey: CAP, scope: SCOPE(), evidence: [d2item, ...SLOTS1] }), /^acceptance record rejected \(unknown_evidence\)/, 404);
    const wide = String((await evidence(steward, ext('test_report', 30 * DAY, { covers: { journeys: ['JRN-99'] } }))).evidence['evidence_id']);
    await refused(propose(product2, { kind: 'capability', title: 'Supply risk (SYNTHETIC)', subjectKey: CAP, scope: SCOPE(), evidence: [wide, ...SLOTS1] }), /covers journeys or roles outside the declared scope/, 422);
  });
  it('POSITIVE: the record for ONE domain — the exact tuple, the obligations (kind minimum), the evidence bound, tasks per obligation, claim = demonstration', async () => {
    const r = (await propose(product2, { kind: 'capability', title: `Supply-chain intelligence for the corridor domain (SYNTHETIC ${RUN})`, subjectKey: CAP, scope: SCOPE(),
      evidence: [TEST1, ...SLOTS1], obligations: ['security'] })).record;
    R1 = String(r['record_id']); R1DIGEST = String(r['digest']);
    expect(r).toMatchObject({ version: 1, state: 'proposed', kind: 'capability', claim: 'demonstration' });
    expect(r['obligations']).toEqual(['customer', 'independent_assurance', 'product', 'security']);
    expect((r['scope'] as Row)['domain']).toBe(D); expect((r['scope'] as Row)['tenant']).toBe(T); expect((r['scope'] as Row)['capability']).toBe(CAP);
    expect(r['conditions']).toEqual([]);
    expect(r['builders']).toContain(builderAssurer.principalId);
    expect((r['tasks'] as Row[]).map((x) => x['obligation'])).toEqual(['customer', 'independent_assurance', 'product', 'security']);
    expect(await one(sql`select count(*)::int n from executive.human_tasks where kind = 'governance.attest' and subject ->> 'id' = ${R1} and state = 'open'`)).toEqual({ n: 4 });
    expect(await one(sql`select count(*)::int n from governance.links_live where from_artifact = ${R1}::uuid and to_artifact = ${capId}::uuid and relation = 'covers'`)).toEqual({ n: 1 });
  });
  it('REFUSALS (state): a second record for the same capability here (duplicate) · a stale expected version', async () => {
    await refused(propose(product2, { kind: 'capability', title: 'Supply risk again (SYNTHETIC)', subjectKey: CAP, scope: SCOPE(), evidence: [TEST1, ...SLOTS1] }), /\(duplicate\): record .* already governs/, 409);
    await refused(propose(product2, { recordId: R1, kind: 'capability', title: 'Supply risk (SYNTHETIC)', subjectKey: CAP, scope: SCOPE(), evidence: [TEST1, ...SLOTS1], expectedVersion: 0 }), /\(stale\): the record is at version 1 \(expected 0\)/, 409);
  });
  it('CORRECTION: version 2 corrects the proposal (a role added) and supersedes the proposed version 1', async () => {
    const r = (await propose(product2, { recordId: R1, kind: 'capability', title: `Supply-chain intelligence for the corridor domain (SYNTHETIC ${RUN})`, subjectKey: CAP,
      scope: SCOPE({ roles: ['domain_analyst', 'executive', 'risk_owner'] }), evidence: [TEST1, ...SLOTS1], obligations: ['security'], expectedVersion: 1 })).record;
    expect(r).toMatchObject({ version: 2, state: 'proposed' });
    R1DIGEST = String(r['digest']);
    expect(await rows(sql`select version, state from governance.acceptance_records where record_id = ${R1}::uuid order by version`)).toEqual([{ version: 1, state: 'superseded' }, { version: 2, state: 'proposed' }]);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('AR3 · verify → attest: one named human per obligation, signed (PR-71-003, ES-71-002, JRN-24, AT-71)', () => {
  it('REFUSALS: the customer attests before verifying (state) · the proposer (no self-acceptance) · a builder (independence) · an agent (actor) · a wrong role (authority) · a stale digest · a role without the act (PDP) · another tenant (scope)', async () => {
    await refused(attest(sponsor, R1, { version: 2, obligation: 'customer', digest: R1DIGEST }), /^acceptance attestation rejected \(state\): the customer VERIFIES version 2 before attesting it/, 409);
    await refused(attest(product2, R1, { version: 2, obligation: 'product', digest: R1DIGEST }), /^acceptance attestation rejected \(separation_of_duties\): .* never done by its proposer \(no self-acceptance\)/, 403);
    await refused(attest(builderAssurer, R1, { version: 2, obligation: 'independent_assurance', digest: R1DIGEST }), /\(separation_of_duties\): .* never done by a builder of the subject \(independence\)/, 403);
    await refused(attest(machineAssurer, R1, { version: 2, obligation: 'independent_assurance', digest: R1DIGEST }), /^acceptance attestation rejected \(actor\): .* a named human's act/, 403);
    await refused(attest(ops, R1, { version: 2, obligation: 'product', digest: R1DIGEST }), /^acceptance attestation rejected \(authority\): attesting the product obligation is the act of a product_authority/, 403);
    await refused(attest(product, R1, { version: 2, obligation: 'product', digest: 'c'.repeat(64) }), /^acceptance attestation rejected \(stale\)/, 409);
    await refused(attest(analyst, R1, { version: 2, obligation: 'product', digest: R1DIGEST }), /no qualifying role binding/, 403);
    await refused(attest(foreignSponsor, R1, { version: 2, obligation: 'customer', digest: R1DIGEST }), /principal has no binding for this domain/, 403);
    await refused(verify(product, R1, { version: 2, digest: R1DIGEST }), /no qualifying role binding/, 403);
    expect(await one(sql`select count(*)::int n from governance.acceptance_attestations where record_id = ${R1}::uuid`)).toEqual({ n: 0 });
  });
  it('POSITIVE + ONE PERSON PER OBLIGATION: the customer verifies; the product attests (signed); the dual-role human attests assurance, then is refused the security obligation; partial is visible as such', async () => {
    const v = (await verify(sponsor, R1, { version: 2, digest: R1DIGEST })).verification;
    expect(v).toMatchObject({ outcome: 'verified', digest: R1DIGEST });
    await refused(verify(sponsor2, R1, { version: 2, digest: R1DIGEST }), /\(duplicate\): version 2 is already verified/, 409);
    const a1 = (await attest(product, R1, { version: 2, obligation: 'product', digest: R1DIGEST })).attestation;
    expect(a1).toMatchObject({ state: 'proposed', obligation: 'product' });
    expect(a1['unmet']).toEqual(['customer', 'independent_assurance', 'security']);
    const sig = await one(sql`select key_id, signature, subject_digest, bound_action, signer::text from executive.signatures where signature_id = ${String(a1['signature_id'])}::uuid`);
    expect(sig).toMatchObject({ subject_digest: R1DIGEST, bound_action: 'governance.acceptance.attest', signer: product.principalId });
    expect(svc.verifySignature(sig as never)).toBe(true);
    await attest(dual, R1, { version: 2, obligation: 'independent_assurance', digest: R1DIGEST });
    await refused(attest(dual, R1, { version: 2, obligation: 'security', digest: R1DIGEST }), /one named human attests ONE obligation .*ES-71-002/, 403);
    await refused(attest(assurance2, R1, { version: 2, obligation: 'independent_assurance', digest: R1DIGEST }), /\(duplicate\): the independent_assurance obligation of version 2 is already attested/, 409);
    const sc = (await scopeOf(dadmin, CAP)).scope;
    expect(sc).toMatchObject({ state: 'proposed_only' });
    expect((sc['proposal'] as Row)['unmet']).toEqual(['customer', 'security']);
  });
  it('ACCEPTED only when every obligation is signed: the record in force for exactly its scope; the tasks resolved; the expiry timer scheduled; JRN-24 at attest', async () => {
    await attest(assurance2, R1, { version: 2, obligation: 'security', digest: R1DIGEST });
    const last = (await attest(sponsor, R1, { version: 2, obligation: 'customer', digest: R1DIGEST })).attestation;
    expect(last).toMatchObject({ state: 'accepted', unmet: [], claim: 'demonstration' });
    const r = await one(sql`select state, accepted_at is not null as acc, effective_scope = scope_tuple as same, expiry_timer_id::text as timer from governance.acceptance_records where record_id = ${R1}::uuid and version = 2`);
    expect(r).toMatchObject({ state: 'accepted', acc: true, same: true });
    expect(await one(sql`select kind, owner_kind, fired_at is null as pending from executive.workflow_timers where timer_id = ${String(r['timer'])}::uuid`)).toEqual({ kind: 'acceptance.evidence_expiry', owner_kind: 'acceptance_record', pending: true });
    expect(await one(sql`select count(*)::int n from executive.human_tasks where kind = 'governance.attest' and subject ->> 'id' = ${R1} and subject ->> 'version' = '2' and state = 'completed'`)).toEqual({ n: 4 });
    expect(await one(sql`select count(*)::int n from executive.signatures where subject_kind = 'acceptance_attestation' and subject_id = ${R1}::uuid and subject_version = 2`)).toEqual({ n: 4 });
    const pv = await preview(dadmin, R1, 2);
    const stages = ((pv.journey['stages'] ?? []) as Row[]).map((s) => `${String(s['stage'])}:${String(s['done'])}`);
    expect(stages).toEqual(['trace:false', 'build:false', 'test:true', 'assure:true', 'deploy:false', 'exercise:true', 'customer_verify:true', 'attest:true']);
    expect(String(((pv.journey['stages'] as Row[])[0]!)['shown_by'])).toMatch(/no live trace link/);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('AR4 · the accepted-scope read and the opt-in request gate (FEX-31, Q5)', () => {
  it('SCOPE-SPECIFIC: accepted for the corridor domain; NOT ACCEPTED in the Polska stand-in (no inference)', async () => {
    const here = (await scopeOf(dadmin, CAP)).scope;
    expect(here).toMatchObject({ state: 'accepted', expansion_held: false });
    expect((here['effective_scope'] as Row)['journeys']).toEqual(['JRN-12', 'JRN-24']);
    const there = (await scopeOf(dadmin2, CAP, D2)).scope;
    expect(there).toMatchObject({ state: 'not_accepted', record: null, effective_scope: null });
  });
  it('THE MARKING: the product authority (PLATFORM, human-gated) — refusals: the steward (PDP), an agent session, a mandatory-control prefix, an unknown capability', async () => {
    await refused(enforce(steward, { capabilityKey: GATECAP, enforced: true, prefixes: ['observation.source.'] }), /no qualifying role binding/, 403);
    await refused(enforce(product, { capabilityKey: GATECAP, enforced: true, prefixes: ['governance.acceptance.'] }), /covers a mandatory control, warnings or attention — never gated/, 422);
    await refused(enforce(product, { capabilityKey: GATECAP, enforced: true, prefixes: ['executive.attention.item.'] }), /never gated/, 422);
    await refused(enforce(product, { capabilityKey: `CAP-NONE-${RUN}`, enforced: true, prefixes: ['observation.source.'] }), /\(unknown_capability\)/, 404);
    const e = (await enforce(product, { capabilityKey: GATECAP, enforced: true, prefixes: ['observation.source.'] })).enforcement;
    expect(e).toMatchObject({ version: 1, enforced: true, prefixes: ['observation.source.'] });
  });
  it('THE GATE: not accepted here → refused (403, recorded); accepted for the role → reached; a role outside the scope → refused; reads never gated', async () => {
    // not accepted anywhere yet
    const r0 = await reach(analyst, 'observation.source.register');
    expect(r0).toMatchObject({ status: 403 }); expect((r0 as Row)['message']).toMatch(/^acceptance record rejected \(access\): CAP-GATE-.* is not accepted for this domain/);
    expect(await reach(analyst, 'observation.source.read')).toBe('reached');  // a read is never gated
    // accept the gate capability in D for domain_analyst only
    const t = String((await evidence(steward, ext('test_report', 30 * DAY))).evidence['evidence_id']);
    const slots = await SLOT_ITEMS(steward, CAP_SLOTS);
    const r = (await propose(product2, { kind: 'capability', title: `The gated capability (SYNTHETIC ${RUN})`, subjectKey: GATECAP, scope: SCOPE({ roles: ['domain_analyst'] }), evidence: [t, ...slots] })).record;
    await acceptAll(String(r['record_id']), 1, String(r['digest']));
    expect(await reach(analyst, 'observation.source.register')).toBe('reached');
    const outside = await reach(dadmin, 'observation.source.register');
    expect((outside as Row)['message']).toMatch(/is accepted here for the roles domain_analyst only — the caller's roles are outside the accepted scope/);
    const elsewhere = await reach(analyst2, 'observation.source.register', D2);
    expect((elsewhere as Row)['message']).toMatch(/is not accepted for this domain/);
    // the consequence class (the gate's own answer, read as the superuser: a C3 request is outside a C2 acceptance)
    expect((await one(sql`select governance.ar_gate(${T}::uuid, ${D}::uuid, 'observation.source.register', ARRAY['domain_analyst'], 'C3') as g`))['g']).toMatchObject({ available: false, reason: expect.stringMatching(/up to consequence class C2 — this request is C3/) });
  });
  it('RECOVERY: unmarked, the action is never asked again (the fixture\'s own acts proceed)', async () => {
    await enforce(product, { capabilityKey: GATECAP, enforced: false, prefixes: [], reason: 'the gate exercise is over (SYNTHETIC)' });
    expect(await reach(dadmin, 'observation.source.register')).toBe('reached');
    expect(await reach(analyst2, 'observation.source.register', D2)).toBe('reached');
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
let R5 = ''; let R5DIGEST = ''; let SHORT = ''; let SHORT_UNTIL = 0; let T5 = '';
describe('AR5 · evidence expiry: constrained to the unaffected scope, expansion held, re-acceptance (FEX-31, ES-71-004, IA-71-005, PR-71-005)', () => {
  it('SETUP: a second acceptance whose journey-JRN-24 evidence expires in seconds (the fast-expiry idiom)', async () => {
    await withdraw(product, R1);  // the first record leaves the stage (AR9 proves withdrawal); this one is the expiry's subject
    T5 = String((await evidence(steward, ext('test_report', 60 * DAY, { covers: { journeys: ['JRN-12'] } }))).evidence['evidence_id']);
    const short = (await evidence(steward, ext('journey_evidence', 12_000, { covers: { journeys: ['JRN-24'] }, title: 'the JRN-24 release journey run (SYNTHETIC, short-lived)' }))).evidence;
    SHORT = String(short['evidence_id']); SHORT_UNTIL = Date.parse(String(short['valid_until']));
    const slots = await SLOT_ITEMS(steward, CAP_SLOTS);
    const r = (await propose(product2, { kind: 'capability', title: `Supply risk — expiring evidence (SYNTHETIC ${RUN})`, subjectKey: CAP, scope: SCOPE(), evidence: [T5, SHORT, ...slots] })).record;
    R5 = String(r['record_id']); R5DIGEST = String(r['digest']);
    expect((await acceptAll(R5, 1, R5DIGEST))['state']).toBe('accepted');
  });
  it('THE TICK: the timer (step 20) and the sweep (step 42) constrain it — JRN-24 removed, the hold opened on expansion, attention raised; nothing written twice', async () => {
    await new Promise((r) => setTimeout(r, Math.max(0, SHORT_UNTIL - Date.now()) + 800));
    const { steps } = await tick();
    expect(JSON.stringify(steps['workflow-timers'] ?? {})).toMatch(/acceptance\.evidence_expiry|fired/);
    const rec = await one(sql`select state, effective_scope -> 'journeys' as j, effective_scope -> 'removed' -> 'journeys' as removed, constrained_reasons from governance.acceptance_records where record_id = ${R5}::uuid and version = 1`);
    expect(rec).toMatchObject({ state: 'constrained', j: ['JRN-12'], removed: ['JRN-24'] });
    expect((rec['constrained_reasons'] as Row[]).map((x) => x['kind'])).toEqual(['evidence_expired']);
    expect(await one(sql`select count(*)::int n from governance.holds where source_artifact = ${R5}::uuid and reason_kind = 'acceptance_constrained' and lifted_at is null and subject_artifact = ${capId}::uuid`)).toEqual({ n: 1 });
    expect(await one(sql`select count(*)::int n from executive.attention_items where signal_class = 'governance.acceptance' and subject_id = ${R5}::uuid and state <> 'closed'`)).toEqual({ n: 1 });
    const again = await tick();
    expect(((again.steps['acceptance-evidence-expiry'] ?? {}) as Row)['changed']).toEqual([]);
    const sc = (await scopeOf(dadmin, CAP)).scope;
    expect(sc).toMatchObject({ state: 'constrained', expansion_held: true });
    expect((sc['removed'] as Row)['journeys']).toEqual(['JRN-24']);
  });
  it('EXPANSION HELD: a proposal in another domain · a re-acceptance wider than the accepted scope (a journey, a role, a profile, a data key, a higher class)', async () => {
    const d2t = String((await evidence(steward, ext('test_report', 30 * DAY), D2)).evidence['evidence_id']);
    await refused(propose(product2, { kind: 'capability', title: 'Supply risk for Polska (SYNTHETIC)', subjectKey: CAP, scope: SCOPE(), evidence: [d2t] }, D2),
      /^acceptance record rejected \(held\): CAP-FW-07-.* is constrained in another scope .* expansion to a new scope is held until it is re-accepted \(ES-71-004\)/, 409);
    const fresh = String((await evidence(steward, ext('journey_evidence', 60 * DAY, { covers: { journeys: ['JRN-24'] } }))).evidence['evidence_id']);
    const slots = await SLOT_ITEMS(steward, CAP_SLOTS);
    await refused(propose(product2, { recordId: R5, kind: 'capability', title: 'Supply risk wider (SYNTHETIC)', subjectKey: CAP, expectedVersion: 1, evidence: [T5, fresh, ...slots],
      scope: SCOPE({ journeys: ['JRN-12', 'JRN-24', 'JRN-30'], roles: ['domain_analyst', 'executive', 'board_member'], data_versions: { 'nordwerk.suppliers': 'v3', 'corridor.flows': 'v7', 'polska.vendors': 'v1' } }) }),
      /\(held\): the re-acceptance of .* expands beyond its previously accepted scope \(journey JRN-30, role board_member, data polska.vendors\)/, 409);
  });
  it('RECOVERY: RE-ACCEPTANCE over renewed evidence (same scope) — every obligation again; v1 superseded; the hold lifted; the attention closed; the scope accepted', async () => {
    const fresh = String((await evidence(steward, ext('journey_evidence', 60 * DAY, { covers: { journeys: ['JRN-24'] }, renews: SHORT }))).evidence['evidence_id']);
    const slots = await SLOT_ITEMS(steward, CAP_SLOTS);
    await refused(propose(product2, { recordId: R5, kind: 'capability', title: 'Supply risk re-accepted (SYNTHETIC)', subjectKey: CAP, expectedVersion: 1, scope: SCOPE(), evidence: [T5, SHORT, ...slots] }),
      /\(stale\): evidence .* \(journey_evidence\) expired/, 409);
    const v2 = (await propose(product2, { recordId: R5, kind: 'capability', title: `Supply risk — re-accepted (SYNTHETIC ${RUN})`, subjectKey: CAP, expectedVersion: 1, scope: SCOPE(), evidence: [T5, fresh, ...slots] })).record;
    expect(v2).toMatchObject({ version: 2, state: 'proposed' });
    expect((await one(sql`select state from governance.acceptance_records where record_id = ${R5}::uuid and version = 1`))['state']).toBe('constrained');  // in force until re-accepted
    await acceptAll(R5, 2, String(v2['digest']));
    expect(await rows(sql`select version, state from governance.acceptance_records where record_id = ${R5}::uuid order by version`)).toEqual([{ version: 1, state: 'superseded' }, { version: 2, state: 'accepted' }]);
    expect(await one(sql`select count(*)::int n from governance.holds where source_artifact = ${R5}::uuid and lifted_at is null`)).toEqual({ n: 0 });
    expect(await one(sql`select count(*)::int n from executive.attention_items where signal_class = 'governance.acceptance' and subject_id = ${R5}::uuid and state <> 'closed'`)).toEqual({ n: 0 });
    expect((await scopeOf(dadmin, CAP)).scope).toMatchObject({ state: 'accepted', expansion_held: false });
    expect(await one(sql`select event from governance.events where subject_id = ${R5}::uuid and event = 'acceptance.reaccepted'`)).toEqual({ event: 'acceptance.reaccepted' });
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
let R6 = ''; let R6DIGEST = '';
describe('AR6 · review triggers (ES-71-005, IA-71-005): an incident, a suspension, SLO exhaustion declared, an overdue condition, the period\'s end, a changed capability', () => {
  beforeAll(async () => {
    const t = String((await evidence(steward, ext('test_report', 30 * DAY))).evidence['evidence_id']);
    const slots = await SLOT_ITEMS(steward, CAP_SLOTS.filter((s) => s !== 'parity'));
    const r = (await propose(product2, { kind: 'capability', title: `Second capability under review (SYNTHETIC ${RUN})`, subjectKey: CAP2, scope: SCOPE(), evidence: [t, ...slots],
      conditions: [{ key: 'ux.review', text: 'the UX review of the corridor workspace is completed (SYNTHETIC)', due: inDays(10) }] })).record;
    R6 = String(r['record_id']); R6DIGEST = String(r['digest']);
    expect((r['conditions'] as Row[]).map((c) => c['key'])).toEqual(['ux.review', 'slot:parity']);
    await acceptAll(R6, 1, R6DIGEST);
  });
  it('REFUSALS: an agent (actor) · a role without the act (PDP) · an unknown record (404) · an undeclared trigger kind', async () => {
    const machineOps = await person('machine-ops', 'agent', 'PLATFORM', null, null, [{ role: 'operations_authority', scope: 'PLATFORM' }], 'human');
    await refused(trigger(machineOps, R6, { kind: 'incident' }), /^acceptance record rejected \(actor\)/, 403);
    await refused(trigger(analyst, R6, { kind: 'incident' }), /no qualifying role binding/, 403);
    await refused(trigger(ops, uuidv7(), { kind: 'incident' }), /\(unknown_record\)/, 404);
    await refused(trigger(ops, R6, { kind: 'evidence_expired' }), /\(trigger\): the trigger is one of/, 422);
  });
  it('POSITIVE: an incident puts it under REVIEW (constrained, scope kept, expansion held); SLO exhaustion is declared with its carrier (B64)', async () => {
    const x = (await trigger(ops, R6, { kind: 'incident', detail: { incident: 'INC-SYNTH-1' } })).record;
    expect(x).toMatchObject({ from: 'accepted', state: 'constrained' });
    expect(((x['effective_scope'] as Row)['journeys'])).toEqual(['JRN-12', 'JRN-24']);
    const y = (await trigger(ops, R6, { kind: 'slo_exhaustion', reason: 'the declared SLO budget was reported exhausted (SYNTHETIC)' })).record;
    expect(JSON.stringify(y['new_findings'])).toMatch(/SLO computation is B64's/);
  });
  it('SUSPEND: nothing of it is in force; the scope read says so; withdrawal of a suspended record is a named authority\'s', async () => {
    const z = (await trigger(dadmin, R6, { kind: 'control_failure', policy: 'suspend', reason: 'the export control failed its drill (SYNTHETIC)' })).record;
    expect(z).toMatchObject({ state: 'suspended', effective_scope: null });
    expect((await scopeOf(dadmin, CAP2)).scope).toMatchObject({ state: 'suspended', effective_scope: null });
    expect((await one(sql`select governance.ar_gate(${T}::uuid, ${D}::uuid, 'x.y', ARRAY['domain_analyst'], 'C1') as g`))['g']).toMatchObject({ gated: false });
  });
  it('THE SWEEP (explicit run): an OVERDUE condition, a CHANGED capability, then the END of the period — lapsed (the clock advanced on the record: a SYNTHETIC fixture)', async () => {
    const t = String((await evidence(steward, ext('test_report', 30 * DAY))).evidence['evidence_id']);
    const slots = await SLOT_ITEMS(steward, CAP_SLOTS);
    await withdraw(product, R6);
    const r = (await propose(product2, { recordId: R6, kind: 'capability', title: `Second capability, clean (SYNTHETIC ${RUN})`, subjectKey: CAP2, scope: SCOPE(), evidence: [t, ...slots], expectedVersion: 1,
      conditions: [{ key: 'ux.review', text: 'the UX review of the corridor workspace is completed (SYNTHETIC)', due: inDays(3) }] })).record;
    await acceptAll(R6, 2, String(r['digest']));
    // the clock advanced: the condition's due day is yesterday (the record's content is the fixture's; the port never edits a version)
    await sql`update governance.acceptance_records set conditions = jsonb_build_array(conditions -> 0 || jsonb_build_object('due', current_date - 1)) where record_id = ${R6}::uuid and version = 2`.execute(h.su);
    const s1 = (await api.sweep(dreq(steward, 'governance.acceptance.sweep'), T, D) as { sweep: Row }).sweep;
    expect(JSON.stringify(s1['changed'])).toMatch(/condition_overdue/);
    await bumpArtifact(cap2Id);
    const s2 = (await api.sweep(dreq(ops, 'governance.acceptance.sweep'), T, D) as { sweep: Row }).sweep;
    expect(JSON.stringify(s2['changed'])).toMatch(/capability_changed/);
    await sql`update governance.acceptance_records set scope_tuple = jsonb_set(scope_tuple, '{period,to}', to_jsonb((current_date - 1)::text)) where record_id = ${R6}::uuid and version = 2`.execute(h.su);
    const s3 = (await api.sweep(dreq(steward, 'governance.acceptance.sweep'), T, D) as { sweep: Row }).sweep;
    expect(s3['changed']).toEqual([expect.objectContaining({ record_id: R6, state: 'lapsed', effective_scope: null })]);
    expect((await scopeOf(dadmin, CAP2)).scope).toMatchObject({ state: 'lapsed' });
    await refused(trigger(ops, R6, { kind: 'incident' }), /\(state\): version 2 lapsed/, 409);
    await refused(api.sweep(dreq(analyst, 'governance.acceptance.sweep'), T, D) as Promise<unknown>, /no qualifying role binding/, 403);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
let R7 = '';
describe('AR7 · operational acceptance (ES-71-001/-003, IA-71-002/-003/-006, DP-71-002/-003/-006, DAT-DL-08, TS-020, V04-T-003)', () => {
  const OPS_SCOPE = () => SCOPE({ artifacts: ['eye-api@2026.10', 'eye-web@2026.10'], integrations: ['corridor-feed', 'erp-loopback'], data_classes: ['supplier', 'flow'],
                                   workloads: ['supply-risk-scoring'], products: ['corridor-risk-brief'], infrastructure: ['local-dev compose'] });
  const TERMS = (over: Row = {}): Row => ({ owners: [{ responsibility: 'operation of the corridor domain', role: 'domain_admin' }, { responsibility: 'vendor operations', role: 'operations_authority' }],
    open_risks: ['the corridor feed has a single supplier (SYNTHETIC)'], constraints: ['no C3 decisions'], monitoring: 'the attention queue and the domain health page (SYNTHETIC)',
    review_date: inDays(60), withdrawal_criteria: ['two S1 incidents in a quarter', 'an expired runbook'], ...over });
  it('REFUSALS: operating terms missing · an operational scope key missing (route and port) · a review date outside the period', async () => {
    const t = String((await evidence(ops, ext('readiness', 30 * DAY))).evidence['evidence_id']);
    await refused(propose(ops, { kind: 'operational', title: 'Operating the corridor (SYNTHETIC)', subjectKey: CAP3, scope: OPS_SCOPE(), evidence: [t] }), /\(operational\): an operational acceptance states its operating terms/, 422);
    const { workloads: _w, ...noWork } = OPS_SCOPE();
    await refused(propose(ops, { kind: 'operational', title: 'Operating the corridor (SYNTHETIC)', subjectKey: CAP3, scope: noWork, evidence: [t], operational: TERMS() }), /the scope names workloads/, 422);
    await refused(propose(ops, { kind: 'operational', title: 'Operating the corridor (SYNTHETIC)', subjectKey: CAP3, scope: OPS_SCOPE(), evidence: [t], operational: TERMS({ review_date: inDays(400) }) }), /the review date falls within the period/, 422);
  });
  it('POSITIVE: the operating terms, the evidence versions, the support model absent → an open condition, every absent slot an open condition (never a silent pass)', async () => {
    const items = await SLOT_ITEMS(ops, ['runbook', 'dashboard', 'alert', 'on_call', 'readiness']);
    const r = (await propose(ops, { kind: 'operational', title: `Operating the corridor domain (SYNTHETIC ${RUN})`, subjectKey: CAP3, scope: OPS_SCOPE(), evidence: items, operational: TERMS() })).record;
    R7 = String(r['record_id']);
    expect(r['obligations']).toEqual(['customer', 'independent_assurance', 'operations']);
    const keys = (r['conditions'] as Row[]).map((c) => String(c['key'])).sort();
    expect(keys).toEqual(['slot:backup', 'slot:capacity', 'slot:customer_communications', 'slot:degraded_mode', 'slot:escalation', 'slot:incident_roles', 'slot:recovery', 'support_model']);
    expect(Object.keys((r['operational'] as Row)['evidence_versions'] as Row)).toHaveLength(5);
    expect((r['operational'] as Row)['support_model']).toBeNull();
  });
  it('CONDITIONS: met by matching CURRENT evidence (the operations authority) — refusals: the wrong kind, a role without the act, an unknown key, twice', async () => {
    const backup = String((await evidence(ops, ext('backup', 30 * DAY))).evidence['evidence_id']);
    const alert = String((await evidence(ops, ext('alert', 30 * DAY))).evidence['evidence_id']);
    await refused(closeCondition(ops, R7, { version: 1, key: 'slot:backup', evidenceId: alert }), /the backup slot is met by backup evidence \(this item is alert\)/, 422);
    await refused(closeCondition(steward, R7, { version: 1, key: 'slot:backup', evidenceId: backup }), /no qualifying role binding/, 403);
    await refused(closeCondition(ops, R7, { version: 1, key: 'slot:nothing', evidenceId: backup }), /\(unknown_condition\)/, 404);
    const c = (await closeCondition(ops, R7, { version: 1, key: 'slot:backup', evidenceId: backup })).condition;
    expect(c).toMatchObject({ condition: 'slot:backup', note: expect.stringMatching(/never lifts a constraint by itself/) });
    await refused(closeCondition(ops, R7, { version: 1, key: 'slot:backup', evidenceId: backup }), /\(duplicate\): condition slot:backup is already met/, 409);
  });
  it('THE JOINT SIGNED ACCEPTANCE (IA-71-006, DP-71-006 — the production authority stays R1): operations, assurance and customer, each signed', async () => {
    const r = await one(sql`select digest from governance.acceptance_records where record_id = ${R7}::uuid and version = 1`);
    // the operations authority PROPOSED this version: it never attests it — a second operations authority does
    await refused(attest(ops, R7, { version: 1, obligation: 'operations', digest: String(r['digest']) }), /never done by its proposer/, 403);
    const ops2 = await person('ops2', 'human', 'PLATFORM', null, null, [{ role: 'operations_authority', scope: 'PLATFORM' }]);
    const last = await acceptAll(R7, 1, String(r['digest']), { operations: ops2 });
    expect(last).toMatchObject({ state: 'accepted' });
    expect(await one(sql`select count(distinct attester_role)::int n, count(*)::int a from governance.acceptance_attestations where record_id = ${R7}::uuid and decision = 'attest'`)).toEqual({ n: 3, a: 3 });
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
let R8 = ''; let R8DIGEST = '';
describe('AR8 · release acceptance (PAT-48, OBJ-40, ES-68-004): the candidate bound, exceptions carried, a held candidate refused', () => {
  const REL_SCOPE = () => SCOPE({ journeys: ['JRN-24'], roles: ['executive'] });
  it('REFUSALS: an expired exception carried (409) · an unknown exception (404) · a HELD release candidate (409)', async () => {
    const t = String((await evidence(steward, ext('test_report', 30 * DAY))).evidence['evidence_id']);
    await refused(propose(product2, { kind: 'release', title: 'Release acceptance (SYNTHETIC)', subjectKey: RC, scope: REL_SCOPE(), evidence: [t], exceptions: [excExpiredId] }),
      /^acceptance record rejected \(expired\): exception EXC-OLD-.* is expired/, 409);
    await refused(propose(product2, { kind: 'release', title: 'Release acceptance (SYNTHETIC)', subjectKey: RC, scope: REL_SCOPE(), evidence: [t], exceptions: [uuidv7()] }), /\(unknown_exception\)/, 404);
    const hd = await hold(rcId, 'exception_expired');
    await refused(propose(product2, { kind: 'release', title: 'Release acceptance (SYNTHETIC)', subjectKey: RC, scope: REL_SCOPE(), evidence: [t] }), /^acceptance record rejected \(held\): release candidate RC-.* is held — exception_expired/, 409);
    await lift(hd);
  });
  it('POSITIVE + OBJ-40 preview: the candidate\'s identity in the scope; the exception carried; the eligibility per obligation in words; the consequence preview; a release held MID-way refuses the attestation', async () => {
    const t = String((await evidence(steward, ext('test_report', 30 * DAY))).evidence['evidence_id']);
    const r = (await propose(product2, { kind: 'release', title: `Release acceptance of ${RC} (SYNTHETIC)`, subjectKey: RC, scope: REL_SCOPE(), evidence: [t], exceptions: [excId] })).record;
    R8 = String(r['record_id']); R8DIGEST = String(r['digest']);
    expect(((r['scope'] as Row)['release'] as Row)).toMatchObject({ key: RC, candidate_id: rcId, identity: expect.objectContaining({ substituted: 'B65' }) });
    expect(r['exceptions']).toEqual([expect.objectContaining({ key: `EXC-EXPORT-${RUN}` })]);
    const pv = await preview(product, R8, 1);
    expect(pv.consequence.join('\n')).toMatch(/becomes ACCEPTED for exactly this scope[\s\S]*Exceptions carried: EXC-EXPORT-[\s\S]*not a signed release[\s\S]*real acceptance .* is R2/);
    const elig = pv.eligibility['obligations'] as Row[];
    expect(elig.find((o) => o['obligation'] === 'product')).toMatchObject({ can_attest: true });
    expect(elig.find((o) => o['obligation'] === 'independent_assurance')).toMatchObject({ can_attest: false, reasons: [expect.stringMatching(/attested by a independent_assurance/)] });
    const pvSelf = await preview(product2, R8, 1);
    expect(((pvSelf.eligibility['obligations'] as Row[])[0]!)['reasons']).toContain('you proposed this version (no self-acceptance)');
    await attest(product, R8, { version: 1, obligation: 'product', digest: R8DIGEST });
    const hd = await hold(rcId, 'conflict');
    await refused(attest(assurance, R8, { version: 1, obligation: 'independent_assurance', digest: R8DIGEST }), /\(held\): release candidate RC-.* is held — conflict/, 409);
    await lift(hd);
    expect((await attest(assurance, R8, { version: 1, obligation: 'independent_assurance', digest: R8DIGEST })).attestation).toMatchObject({ state: 'accepted' });
  });
  it('THE SWEEP: a release whose candidate is held after acceptance is constrained (release_held)', async () => {
    await hold(rcId, 'evidence_stale');
    const s = (await api.sweep(dreq(steward, 'governance.acceptance.sweep'), T, D) as { sweep: Row }).sweep;
    expect(JSON.stringify(s['changed'])).toMatch(/release_held/);
    expect((await one(sql`select state from governance.acceptance_records where record_id = ${R8}::uuid and version = 1`))['state']).toBe('constrained');
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('AR9 · withdrawal (reversible) and withholding', () => {
  it('a WITHHELD obligation ends the version with its reason and exposes the unmet obligations; a proposer withdraws its own proposal; a stranger may not', async () => {
    const t = String((await evidence(steward, ext('test_report', 30 * DAY))).evidence['evidence_id']);
    const slots = await SLOT_ITEMS(steward, CAP_SLOTS);
    const g = await artifact('capability', `CAP-W-${RUN}`);
    const r = (await propose(product2, { kind: 'capability', title: 'Withheld capability (SYNTHETIC)', subjectKey: `CAP-W-${RUN}`, scope: SCOPE(), evidence: [t, ...slots] })).record;
    const w = (await attest(assurance, String(r['record_id']), { version: 1, obligation: 'independent_assurance', digest: String(r['digest']), decision: 'withhold',
      reason: 'the resilience evidence does not cover the corridor peak (SYNTHETIC)' })).attestation;
    expect(w).toMatchObject({ state: 'withheld', unmet: ['customer', 'independent_assurance', 'product'] });
    expect(g).toBeTruthy();
    const r2 = (await propose(product2, { recordId: r['record_id'], kind: 'capability', title: 'Withheld capability v2 (SYNTHETIC)', subjectKey: `CAP-W-${RUN}`, scope: SCOPE(), evidence: [t, ...slots], expectedVersion: 1 })).record;
    await refused(withdraw(dadmin2, String(r2['record_id']), D2), /\(unknown_record\)/, 404);
    expect((await withdraw(product2, String(r2['record_id']))).record).toMatchObject({ state: 'withdrawn', versions: [2] });
  });
  it('an accepted record withdrawn by a named authority (its expansion hold lifted); never by an agent', async () => {
    const before = await one(sql`select state from governance.acceptance_records where record_id = ${R8}::uuid and version = 1`);
    expect(before['state']).toBe('constrained');
    const machineSponsor = await person('machine-sponsor', 'agent', 'TENANT', T, null, [{ role: 'customer_sponsor', scope: 'TENANT' }], 'human');
    await refused(withdraw(machineSponsor, R8), /\(actor\)/, 403);
    const x = (await withdraw(sponsor, R8)).record;
    expect(x).toMatchObject({ state: 'withdrawn' });
    expect((x['holds_lifted'] as unknown[]).length).toBe(1);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('AR10 · replay, RLS, cross-tenant, append-only and the claim', () => {
  it('REPLAY: the ledger alone reconstructs the expiring record\'s life in order', async () => {
    const ev = (await history(dadmin, R5)).events.map((e) => `${String(e['event'])}@${String(e['version'])}`);
    expect(ev[0]).toBe('acceptance.proposed@1');
    expect(ev).toEqual(expect.arrayContaining(['acceptance.verified@1', 'acceptance.attested@1', 'acceptance.accepted@1', 'acceptance.constrained@1', 'acceptance.proposed@2', 'acceptance.reaccepted@2']));
    expect(ev.indexOf('acceptance.accepted@1')).toBeLessThan(ev.indexOf('acceptance.constrained@1'));
    expect(ev.indexOf('acceptance.constrained@1')).toBeLessThan(ev.indexOf('acceptance.reaccepted@2'));
  });
  it('RLS: the Polska stand-in reads none of the corridor\'s records; another tenant cannot even resolve the route', async () => {
    const w2 = await workspace(dadmin2, D2);
    expect(w2.records.filter((r) => r['domain_id'] === D || String(r['subject_key']).startsWith('CAP-FW-07'))).toEqual([]);
    expect(w2.evidence.every((e) => !(e['evidence_id'] === SHORT))).toBe(true);
    await refused(workspace(foreignSponsor), /principal has no binding for this domain/, 403);
    const w = await workspace(tadmin);
    expect(w.records.length).toBeGreaterThan(5);
    expect(w.scopes.map((s) => s['subject'])).toEqual(expect.arrayContaining([CAP, CAP2, RC]));
  });
  it('APPEND-ONLY and THE CLAIM: attestations and triggers never change; a record can never claim real acceptance', async () => {
    expect(await failure(sql`update governance.acceptance_attestations set reason = 'rewritten' where record_id = ${R5}::uuid`)).toMatch(/append-only|append only/i);
    expect(await failure(sql`delete from governance.acceptance_triggers where record_id = ${R5}::uuid`)).toMatch(/append-only|append only/i);
    expect(await failure(sql`update governance.acceptance_records set claim = 'customer_acceptance' where record_id = ${R5}::uuid`)).toMatch(/acceptance_records_claim_check|check constraint/);
    expect(await failure(sql`update governance.acceptance_evidence set claim = 'production' where evidence_id = ${T5}::uuid`)).toMatch(/append-only|append only/i);
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('AR11 · the fault exercise: the signing key unbound', () => {
  it('FAULT: with no executive signing key an attestation is refused (409 unbound) and NOTHING is written; RECOVERY: the key bound again, the same attestation succeeds', async () => {
    const t = String((await evidence(steward, ext('test_report', 30 * DAY))).evidence['evidence_id']);
    const r = (await propose(product2, { kind: 'release', title: 'Key fault (SYNTHETIC)', subjectKey: RCK, scope: SCOPE({ journeys: ['JRN-24'] }), evidence: [t] })).record;
    await refused(propose(product2, { kind: 'release', title: 'second (SYNTHETIC)', subjectKey: RCK, scope: SCOPE(), evidence: [t] }), /\(duplicate\): record .* already governs/, 409);
    delete process.env[KEY_REF];
    try {
      await refused(attest(product, String(r['record_id']), { version: 1, obligation: 'product', digest: String(r['digest']) }), /^signature rejected \(unbound\)/, 409);
      expect(await one(sql`select count(*)::int n from governance.acceptance_attestations where record_id = ${String(r['record_id'])}::uuid`)).toEqual({ n: 0 });
    } finally { process.env[KEY_REF] = KEY_VALUE; }
    expect((await attest(product, String(r['record_id']), { version: 1, obligation: 'product', digest: String(r['digest']) })).attestation).toMatchObject({ obligation: 'product' });
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
describe('AR12 · a DESIGN acceptance on the same core (§DG\'s records bind here): the design system authority and independent assurance', () => {
  it('POSITIVE: a design component accepted for its exact scope by the design authority and assurance; REFUSAL: the product authority cannot attest the design obligation', async () => {
    const designAuth = await person('design', 'human', 'PLATFORM', null, null, [{ role: 'design_system_authority', scope: 'PLATFORM' }]);
    await artifact('design_component', `DS-BUTTON-${RUN}`, { package: 'packages/tokens', version: '3.2.0' });
    const pkg = String((await evidence(steward, ext('design_package', 30 * DAY, { title: 'the design conformance package (SYNTHETIC, unsigned — R2)' }))).evidence['evidence_id']);
    const r = (await propose(product2, { kind: 'design', title: `The governed-button pattern (SYNTHETIC ${RUN})`, subjectKey: `DS-BUTTON-${RUN}`, scope: SCOPE({ journeys: ['JRN-24'] }), evidence: [pkg] })).record;
    expect(r['obligations']).toEqual(['design', 'independent_assurance']);
    await refused(attest(product, String(r['record_id']), { version: 1, obligation: 'design', digest: String(r['digest']) }), /\(authority\): attesting the design obligation is the act of a design_system_authority/, 403);
    await attest(designAuth, String(r['record_id']), { version: 1, obligation: 'design', digest: String(r['digest']) });
    expect((await attest(assurance, String(r['record_id']), { version: 1, obligation: 'independent_assurance', digest: String(r['digest']) })).attestation).toMatchObject({ state: 'accepted' });
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
/** B107-F (the review of 8396481): `B107F_REPRO=1` asserts the DEFECT — the gate and the accepted-scope read answered from the STORED state
 *  until a tick reconciled it — on the uncorrected code; without it, the correction (0116: the current findings decide at the request). */
const REPRO = process.env['B107F_REPRO'] === '1';
const GCAP = `CAP-GATE-F-${RUN}`;
let RF = ''; let SHORTF = ''; let SHORTF_UNTIL = ''; let TF = ''; let SHORT2 = ''; let SHORT2_UNTIL = ''; let V2TIMER = '';
/** Wait against the DATABASE's clock (never the process's) until `iso` has passed. */
const untilDb = async (iso: string) => {
  for (;;) {
    if ((await one(sql`select clock_timestamp() > ${iso}::timestamptz + interval '300 milliseconds' as past`))['past'] === true) return;
    await new Promise((r) => setTimeout(r, 400));
  }
};
const stored = async (version: number) => one(sql`select state, effective_scope from governance.acceptance_records where record_id = ${RF}::uuid and version = ${version}`);
describe(`B107-F · ${REPRO ? 'DEFECT' : 'correction'}: acceptance decided at the REQUEST — evidence expiry and the period's end before any reconciliation (FEX-31, ES-71-004, Q5)`, () => {
  afterAll(async () => {  // the marking is PLATFORM-global: never left enforced for another file, whatever happened above
    const cur = await one(sql`select enforced from governance.acceptance_enforcement where capability_key = ${GCAP} order by version desc limit 1`);
    if (cur['enforced'] === true) await enforce(product, { capabilityKey: GCAP, enforced: false, prefixes: [], reason: 'the B107-F exercise ended early (SYNTHETIC)' }).catch(() => undefined);
  });
  it('SETUP: the capability marked enforce_acceptance; accepted for domain_analyst and domain_admin over CURRENT evidence — one item covering the domain_analyst role expires in seconds', async () => {
    await artifact('capability', GCAP);
    await enforce(product, { capabilityKey: GCAP, enforced: true, prefixes: ['observation.source.'] });
    TF = String((await evidence(steward, ext('test_report', 60 * DAY))).evidence['evidence_id']);
    const short = (await evidence(steward, ext('journey_evidence', 15_000, { covers: { roles: ['domain_analyst'] }, title: 'the analyst journey run (SYNTHETIC, short-lived)' }))).evidence;
    SHORTF = String(short['evidence_id']); SHORTF_UNTIL = String(short['valid_until']);
    const slots = await SLOT_ITEMS(steward, CAP_SLOTS);
    const r = (await propose(product2, { kind: 'capability', title: `The gated capability, expiring (SYNTHETIC ${RUN})`, subjectKey: GCAP, scope: SCOPE({ roles: ['domain_analyst', 'domain_admin'] }), evidence: [TF, SHORTF, ...slots] })).record;
    RF = String(r['record_id']);
    expect((await acceptAll(RF, 1, String(r['digest'])))['state']).toBe('accepted');
    expect(await reach(analyst, 'observation.source.register')).toBe('reached');
    expect(await reach(dadmin, 'observation.source.register')).toBe('reached');
  });
  it(`EXPIRY BEFORE RECONCILIATION: the item expired on the database clock, NO tick ran (the timer pending, the record stored accepted) — ${REPRO ? 'the DEFECT: the gate still admits the affected role and the read still says accepted' : 'the affected role is DENIED (nothing reaches the handler), the unaffected role keeps its scope, the read says constrained'}`, async () => {
    await untilDb(SHORTF_UNTIL);
    expect(await stored(1)).toMatchObject({ state: 'accepted' });
    expect(await one(sql`select count(*)::int n from executive.workflow_timers where owner_id = ${RF}::uuid and fired_at is null and cancelled_at is null`)).toEqual({ n: 1 });
    const a = await reach(analyst, 'observation.source.register');
    const sc = (await scopeOf(dadmin, GCAP)).scope;
    if (REPRO) {
      expect(a).toBe('reached');
      expect(sc).toMatchObject({ state: 'accepted' });
      expect((sc['effective_scope'] as Row)['roles']).toEqual(['domain_analyst', 'domain_admin']);
      return;
    }
    expect(a).toMatchObject({ status: 403 });
    expect((a as Row)['message']).toMatch(/^acceptance record rejected \(access\): CAP-GATE-F-.* is constrained here for the roles domain_admin only — the caller's roles are outside the constrained scope/);
    expect(await reach(dadmin, 'observation.source.register')).toBe('reached');            // the unaffected scope is preserved (FEX-31)
    expect(await reach(analyst, 'observation.source.read')).toBe('reached');               // reads are never gated
    expect(sc).toMatchObject({ state: 'constrained', reconciled: false });
    expect((sc['effective_scope'] as Row)['roles']).toEqual(['domain_admin']);
    expect((sc['removed'] as Row)['roles']).toEqual(['domain_analyst']);
    expect((sc['current_findings'] as Row[]).map((f) => f['kind'])).toEqual(['evidence_expired']);
    // the request read changed nothing: still stored accepted, the timer still pending
    expect(await stored(1)).toMatchObject({ state: 'accepted' });
  });
  it('RECONCILIATION (the timer and the sweep, unchanged): the tick constrains the stored record — the same answers; nothing written twice', async () => {
    await tick();
    expect(await stored(1)).toMatchObject({ state: 'constrained' });
    expect(((await stored(1))['effective_scope'] as Row)['roles']).toEqual(['domain_admin']);
    expect((await reach(analyst, 'observation.source.register') as Row)['status']).toBe(403);
    expect(await reach(dadmin, 'observation.source.register')).toBe('reached');
    const again = await tick();
    expect(((again.steps['acceptance-evidence-expiry'] ?? {}) as Row)['changed']).toEqual([]);
    if (!REPRO) expect((await scopeOf(dadmin, GCAP)).scope).toMatchObject({ state: 'constrained', reconciled: true });
  });
  it('RECOVERY: renewed evidence and RE-ACCEPTANCE (v2) — the analyst reaches the handler again; v2 carries a second short item (the old-timer probe)', async () => {
    const renewed = String((await evidence(steward, ext('journey_evidence', 60 * DAY, { covers: { roles: ['domain_analyst'] }, renews: SHORTF }))).evidence['evidence_id']);
    const short2 = (await evidence(steward, ext('journey_evidence', 40_000, { covers: { journeys: ['JRN-12'] }, title: 'the JRN-12 run (SYNTHETIC, short-lived)' }))).evidence;
    SHORT2 = String(short2['evidence_id']); SHORT2_UNTIL = String(short2['valid_until']);
    const slots = await SLOT_ITEMS(steward, CAP_SLOTS);
    const v2 = (await propose(product2, { recordId: RF, kind: 'capability', title: `The gated capability, re-accepted (SYNTHETIC ${RUN})`, subjectKey: GCAP, expectedVersion: 1,
      scope: SCOPE({ roles: ['domain_analyst', 'domain_admin'] }), evidence: [TF, renewed, SHORT2, ...slots] })).record;
    await acceptAll(RF, 2, String(v2['digest']));
    expect(await stored(2)).toMatchObject({ state: 'accepted' });
    expect(await reach(analyst, 'observation.source.register')).toBe('reached');
    expect((await scopeOf(dadmin, GCAP)).scope).toMatchObject({ state: 'accepted', expansion_held: false });
    V2TIMER = String((await one(sql`select expiry_timer_id::text as t from governance.acceptance_records where record_id = ${RF}::uuid and version = 2`))['t']);
  });
  it('THE OLD TIMER (the act-found regression): v3 re-accepted before v2\'s item expires; v2\'s timer then fires on v3, which has no finding — v3 stays ACCEPTED', async () => {
    const renewed = String((await evidence(steward, ext('journey_evidence', 60 * DAY, { covers: { journeys: ['JRN-12'] }, renews: SHORT2 }))).evidence['evidence_id']);
    const slots = await SLOT_ITEMS(steward, CAP_SLOTS);
    const renewedRole = String((await one(sql`select evidence_id::text as e from governance.acceptance_evidence where renews = ${SHORTF}::uuid`))['e']);
    const v3 = (await propose(product2, { recordId: RF, kind: 'capability', title: `The gated capability, v3 (SYNTHETIC ${RUN})`, subjectKey: GCAP, expectedVersion: 2,
      scope: SCOPE({ roles: ['domain_analyst', 'domain_admin'] }), evidence: [TF, renewedRole, renewed, ...slots] })).record;
    await acceptAll(RF, 3, String(v3['digest']));
    await untilDb(SHORT2_UNTIL);
    expect(await one(sql`select fired_at is null and cancelled_at is null as pending from executive.workflow_timers where timer_id = ${V2TIMER}::uuid`)).toEqual({ pending: true });
    expect(await reach(analyst, 'observation.source.register')).toBe('reached');           // v3 is in force; v2's expired item is not v3's
    await tick();
    expect(await one(sql`select fired_at is not null as fired from executive.workflow_timers where timer_id = ${V2TIMER}::uuid`)).toEqual({ fired: true });
    expect(await stored(3)).toMatchObject({ state: 'accepted' });
    expect(await reach(analyst, 'observation.source.register')).toBe('reached');
  });
  it(`THE PERIOD ENDED before any sweep (the clock advanced on the record: a SYNTHETIC fixture, as AR6) — ${REPRO ? 'the DEFECT: the gate still admits and the read says accepted' : 'nothing of it is in force: every role DENIED, the read says lapsed'}; the sweep then lapses the stored record`, async () => {
    await sql`update governance.acceptance_records set scope_tuple = jsonb_set(scope_tuple, '{period,to}', to_jsonb((current_date - 1)::text)) where record_id = ${RF}::uuid and version = 3`.execute(h.su);
    expect(await stored(3)).toMatchObject({ state: 'accepted' });
    const a = await reach(analyst, 'observation.source.register');
    const sc = (await scopeOf(dadmin, GCAP)).scope;
    if (REPRO) {
      expect(a).toBe('reached');
      expect(sc).toMatchObject({ state: 'accepted' });
    } else {
      expect((a as Row)['message']).toMatch(/^acceptance record rejected \(access\): CAP-GATE-F-.* is lapsed in this domain .* nothing of it is in force until it is re-accepted/);
      expect((await reach(dadmin, 'observation.source.register') as Row)['status']).toBe(403);
      expect(sc).toMatchObject({ state: 'lapsed', effective_scope: null, reconciled: false });
      expect(await stored(3)).toMatchObject({ state: 'accepted' });
    }
    const s = (await api.sweep(dreq(steward, 'governance.acceptance.sweep'), T, D) as { sweep: Row }).sweep;
    expect(s['changed']).toEqual(expect.arrayContaining([expect.objectContaining({ record_id: RF, state: 'lapsed', effective_scope: null })]));
    expect((await reach(analyst, 'observation.source.register') as Row)['status']).toBe(403);
    expect((await scopeOf(dadmin, GCAP)).scope).toMatchObject({ state: 'lapsed' });
  });
  it('RECOVERY: unmarked, the action is never asked again', async () => {
    await enforce(product, { capabilityKey: GCAP, enforced: false, prefixes: [], reason: 'the B107-F exercise is over (SYNTHETIC)' });
    expect(await reach(analyst, 'observation.source.register')).toBe('reached');
  });
});

// ════════════════════════════════════════════════════════════════════════════════════════════════
/** B107-G (the review of ef90bb0 — a SOURCE finding): `B107G_REPRO=1` asserts what the uncorrected code DOES when expansion meets an expiry that no
 *  tick has reconciled; without it, the correction (0117: the expansion restriction read from what is in force NOW, at the proposal AND at the
 *  final attestation). Two orderings: (a) propose wider AFTER the expiry; (b) propose wider while current, the expiry BEFORE the final attestation. */
const REPRO_G = process.env['B107G_REPRO'] === '1';
const XCAP = `CAP-GATE-X-${RUN}`; const YCAP = `CAP-GATE-Y-${RUN}`;
const NARROW = () => SCOPE({ roles: ['domain_analyst'] });
const WIDE = () => SCOPE({ roles: ['domain_analyst', 'domain_admin'] });
const recordState = async (id: string) => rows(sql`select version, state, effective_scope -> 'roles' as roles from governance.acceptance_records where record_id = ${id}::uuid order by version`);
/** Verify (the customer) and attest every obligation but the LAST — returns the last obligation, still unattested. */
async function attestAllButLast(id: string, version: number, digest: string): Promise<string> {
  const rec = await one(sql`select obligations from governance.acceptance_records where record_id = ${id}::uuid and version = ${version}`);
  const obl = rec['obligations'] as string[];
  const people: Record<string, AuthenticatedPrincipal> = { product, independent_assurance: assurance, customer: sponsor, operations: ops };
  await verify(sponsor, id, { version, digest });
  // the customer attests first (it verified), then every other obligation but the last of the remaining order
  const order = ['customer', ...obl.filter((o) => o !== 'customer')];
  for (const o of order.slice(0, -1)) await attest(people[o]!, id, { version, obligation: o, digest });
  return order[order.length - 1]!;
}
describe(`B107-G · ${REPRO_G ? 'DEFECT' : 'correction'}: expansion while the record in force no longer meets its evidence, before any reconciliation (PR-71-005, ES-71-004)`, () => {
  afterAll(async () => {
    for (const k of [XCAP, YCAP]) {
      const cur = await one(sql`select enforced from governance.acceptance_enforcement where capability_key = ${k} order by version desc limit 1`);
      if (cur['enforced'] === true) await enforce(product, { capabilityKey: k, enforced: false, prefixes: [], reason: 'the B107-G exercise ended early (SYNTHETIC)' }).catch(() => undefined);
    }
  });
  let XR = ''; let XSHORT = ''; let XT = '';
  it('(a) SETUP: accepted for domain_analyst ONLY over current evidence — its analyst item expires in seconds; the domain administrator is outside the scope', async () => {
    await artifact('capability', XCAP);
    await enforce(product, { capabilityKey: XCAP, enforced: true, prefixes: ['observation.source.'] });
    XT = String((await evidence(steward, ext('test_report', 60 * DAY))).evidence['evidence_id']);
    const short = (await evidence(steward, ext('journey_evidence', 15_000, { covers: { roles: ['domain_analyst'] }, title: 'the analyst journey run (SYNTHETIC, short-lived)' }))).evidence;
    XSHORT = String(short['evidence_id']);
    const slots = await SLOT_ITEMS(steward, CAP_SLOTS);
    const r = (await propose(product2, { kind: 'capability', title: `Expansion probe (a) (SYNTHETIC ${RUN})`, subjectKey: XCAP, scope: NARROW(), evidence: [XT, XSHORT, ...slots] })).record;
    XR = String(r['record_id']);
    expect((await acceptAll(XR, 1, String(r['digest'])))['state']).toBe('accepted');
    expect(await reach(analyst, 'observation.source.register')).toBe('reached');
    expect((await reach(dadmin, 'observation.source.register') as Row)['status']).toBe(403);
    await untilDb(String(short['valid_until']));
    expect(await recordState(XR)).toEqual([{ version: 1, state: 'accepted', roles: ['domain_analyst'] }]);   // stored: no tick ran
    expect((await reach(analyst, 'observation.source.register') as Row)['status']).toBe(403);               // 0116: constrained at the request
  });
  it(`(a) a WIDER version (+ domain_admin) over FRESH evidence, proposed after the expiry with no tick — ${REPRO_G ? 'the DEFECT: proposed, every obligation completed, ACCEPTED; the administrator reaches the handler' : 'REFUSED (held): the accepted scope is re-accepted first; nothing activated, the administrator still refused'}`, async () => {
    const renewed = String((await evidence(steward, ext('journey_evidence', 60 * DAY, { covers: { roles: ['domain_analyst'] }, renews: XSHORT }))).evidence['evidence_id']);
    const adminRun = String((await evidence(steward, ext('journey_evidence', 60 * DAY, { covers: { roles: ['domain_admin'] }, title: 'the administrator journey run (SYNTHETIC)' }))).evidence['evidence_id']);
    const slots = await SLOT_ITEMS(steward, CAP_SLOTS);
    const wide = { recordId: XR, kind: 'capability', title: `Expansion probe (a) — wider (SYNTHETIC ${RUN})`, subjectKey: XCAP, expectedVersion: 1, scope: WIDE(), evidence: [XT, renewed, adminRun, ...slots] };
    if (REPRO_G) {
      const v2 = (await propose(product2, wide)).record;
      expect((await acceptAll(XR, 2, String(v2['digest'])))['state']).toBe('accepted');
      expect(await recordState(XR)).toEqual([{ version: 1, state: 'superseded', roles: ['domain_analyst'] }, { version: 2, state: 'accepted', roles: ['domain_analyst', 'domain_admin'] }]);
      expect(await reach(dadmin, 'observation.source.register')).toBe('reached');     // the newly admitted operation
      expect((await scopeOf(dadmin, XCAP)).scope).toMatchObject({ state: 'accepted' });
      return;
    }
    await refused(propose(product2, wide), /^acceptance record rejected \(held\): the re-acceptance of CAP-GATE-X-.* expands beyond its previously accepted scope \(role domain_admin\)/, 409);
    expect(await recordState(XR)).toEqual([{ version: 1, state: 'accepted', roles: ['domain_analyst'] }]);
    expect((await reach(dadmin, 'observation.source.register') as Row)['status']).toBe(403);
    expect((await scopeOf(dadmin, XCAP)).scope).toMatchObject({ state: 'constrained', reconciled: false });
    // RECOVERY: the SAME scope re-accepted over the renewed evidence; THEN the expansion, from a current acceptance
    const same = (await propose(product2, { ...wide, title: `Expansion probe (a) — re-accepted (SYNTHETIC ${RUN})`, scope: NARROW(), evidence: [XT, renewed, ...slots] })).record;
    expect((await acceptAll(XR, 2, String(same['digest'])))['state']).toBe('accepted');
    expect(await reach(analyst, 'observation.source.register')).toBe('reached');
    expect((await reach(dadmin, 'observation.source.register') as Row)['status']).toBe(403);
    const v3 = (await propose(product2, { ...wide, expectedVersion: 2, title: `Expansion probe (a) — expanded (SYNTHETIC ${RUN})` })).record;
    expect((await acceptAll(XR, 3, String(v3['digest'])))['state']).toBe('accepted');
    expect(await reach(dadmin, 'observation.source.register')).toBe('reached');      // expansion from a CURRENT acceptance is legitimate
    await enforce(product, { capabilityKey: XCAP, enforced: false, prefixes: [], reason: 'the (a) ordering is over (SYNTHETIC)' });
  });
  let YR = ''; let YSHORT_UNTIL = ''; let YV2 = ''; let YV2DIGEST = ''; let YLAST = ''; let YT = ''; let YSHORT = '';
  it('(b) SETUP: accepted for domain_analyst ONLY; a WIDER version (+ domain_admin) proposed WHILE it is current and attested by every obligation but the last', async () => {
    if (REPRO_G) await enforce(product, { capabilityKey: XCAP, enforced: false, prefixes: [], reason: 'the (a) ordering is over (SYNTHETIC)' }).catch(() => undefined);
    await artifact('capability', YCAP);
    await enforce(product, { capabilityKey: YCAP, enforced: true, prefixes: ['observation.source.'] });
    YT = String((await evidence(steward, ext('test_report', 60 * DAY))).evidence['evidence_id']);
    const short = (await evidence(steward, ext('journey_evidence', 30_000, { covers: { roles: ['domain_analyst'] }, title: 'the analyst journey run (SYNTHETIC, short-lived)' }))).evidence;
    YSHORT = String(short['evidence_id']); YSHORT_UNTIL = String(short['valid_until']);
    const slots = await SLOT_ITEMS(steward, CAP_SLOTS);
    const r = (await propose(product2, { kind: 'capability', title: `Expansion probe (b) (SYNTHETIC ${RUN})`, subjectKey: YCAP, scope: NARROW(), evidence: [YT, YSHORT, ...slots] })).record;
    YR = String(r['record_id']);
    expect((await acceptAll(YR, 1, String(r['digest'])))['state']).toBe('accepted');
    const fresh = String((await evidence(steward, ext('journey_evidence', 60 * DAY, { covers: { roles: ['domain_analyst', 'domain_admin'] } }))).evidence['evidence_id']);
    const slots2 = await SLOT_ITEMS(steward, CAP_SLOTS);
    const v2 = (await propose(product2, { recordId: YR, kind: 'capability', title: `Expansion probe (b) — wider (SYNTHETIC ${RUN})`, subjectKey: YCAP, expectedVersion: 1, scope: WIDE(), evidence: [YT, fresh, ...slots2] })).record;
    YV2 = String(v2['record_id']); YV2DIGEST = String(v2['digest']);
    expect(v2).toMatchObject({ version: 2, state: 'proposed' });                      // a legitimate proposal: the original is current
    YLAST = await attestAllButLast(YR, 2, YV2DIGEST);
    expect(await recordState(YR)).toEqual([{ version: 1, state: 'accepted', roles: ['domain_analyst'] }, { version: 2, state: 'proposed', roles: null }]);
  });
  it(`(b) the original's evidence EXPIRES before the final attestation, no tick — ${REPRO_G ? 'the DEFECT: the final attestation ACCEPTS the wider version, supersedes the original; the administrator reaches the handler' : 'the final attestation is REFUSED (held): nothing recorded, nothing activated, nothing superseded; then the legitimate recovery'}`, async () => {
    await untilDb(YSHORT_UNTIL);
    expect((await stored1(YR))['state']).toBe('accepted');
    const people: Record<string, AuthenticatedPrincipal> = { product, independent_assurance: assurance, customer: sponsor, operations: ops };
    const last = () => attest(people[YLAST]!, YR, { version: 2, obligation: YLAST, digest: YV2DIGEST });
    if (REPRO_G) {
      expect((await last()).attestation).toMatchObject({ state: 'accepted' });
      expect(await recordState(YR)).toEqual([{ version: 1, state: 'superseded', roles: ['domain_analyst'] }, { version: 2, state: 'accepted', roles: ['domain_analyst', 'domain_admin'] }]);
      expect(await reach(dadmin, 'observation.source.register')).toBe('reached');
      expect((await scopeOf(dadmin, YCAP)).scope).toMatchObject({ state: 'accepted' });
      await enforce(product, { capabilityKey: YCAP, enforced: false, prefixes: [], reason: 'the (b) ordering is over (SYNTHETIC)' });
      return;
    }
    const before = await one(sql`select count(*)::int as n from governance.acceptance_attestations where record_id = ${YR}::uuid and version = 2`);
    await refused(last(), /^acceptance attestation rejected \(held\): CAP-GATE-Y-.* — version 2 expands beyond the scope in force \(role domain_admin\)/, 409);
    expect(await one(sql`select count(*)::int as n from governance.acceptance_attestations where record_id = ${YR}::uuid and version = 2`)).toEqual(before);
    expect(await recordState(YR)).toEqual([{ version: 1, state: 'accepted', roles: ['domain_analyst'] }, { version: 2, state: 'proposed', roles: null }]);
    expect((await reach(dadmin, 'observation.source.register') as Row)['status']).toBe(403);
    expect((await reach(analyst, 'observation.source.register') as Row)['status']).toBe(403);
    // RECOVERY: the same scope over renewed evidence (v3 supersedes the pending v2), accepted; the analyst reaches the handler again
    const renewed = String((await evidence(steward, ext('journey_evidence', 60 * DAY, { covers: { roles: ['domain_analyst'] }, renews: YSHORT }))).evidence['evidence_id']);
    const slots = await SLOT_ITEMS(steward, CAP_SLOTS);
    const v3 = (await propose(product2, { recordId: YR, kind: 'capability', title: `Expansion probe (b) — re-accepted (SYNTHETIC ${RUN})`, subjectKey: YCAP, expectedVersion: 2, scope: NARROW(), evidence: [YT, renewed, ...slots] })).record;
    expect((await acceptAll(YR, 3, String(v3['digest'])))['state']).toBe('accepted');
    expect(await recordState(YR)).toEqual([{ version: 1, state: 'superseded', roles: ['domain_analyst'] }, { version: 2, state: 'superseded', roles: null }, { version: 3, state: 'accepted', roles: ['domain_analyst'] }]);
    expect(await reach(analyst, 'observation.source.register')).toBe('reached');
    expect((await reach(dadmin, 'observation.source.register') as Row)['status']).toBe(403);
    // the timer of v1 (and of nothing else) fires: idempotent, v3 stays accepted
    await tick(); await tick();
    expect((await stored1(YR, 3))['state']).toBe('accepted');
    await enforce(product, { capabilityKey: YCAP, enforced: false, prefixes: [], reason: 'the (b) ordering is over (SYNTHETIC)' });
    expect(await reach(dadmin, 'observation.source.register')).toBe('reached');
  });
  it(`(c) the same as (b) but the TICK HAS reconciled (constrained, the hold open) before the final attestation — ${REPRO_G ? 'the DEFECT: the final attestation still ACCEPTS the wider version and lifts the hold' : 'REFUSED (held); the hold stays open'}`, async () => {
    const ZCAP = `CAP-GATE-Z-${RUN}`;
    await artifact('capability', ZCAP);
    const t = String((await evidence(steward, ext('test_report', 60 * DAY))).evidence['evidence_id']);
    const short = (await evidence(steward, ext('journey_evidence', 30_000, { covers: { roles: ['domain_analyst'] } }))).evidence;
    const slots = await SLOT_ITEMS(steward, CAP_SLOTS);
    const r = (await propose(product2, { kind: 'capability', title: `Expansion probe (c) (SYNTHETIC ${RUN})`, subjectKey: ZCAP, scope: NARROW(), evidence: [t, String(short['evidence_id']), ...slots] })).record;
    const ZR = String(r['record_id']);
    await acceptAll(ZR, 1, String(r['digest']));
    const fresh = String((await evidence(steward, ext('journey_evidence', 60 * DAY, { covers: { roles: ['domain_analyst', 'domain_admin'] } }))).evidence['evidence_id']);
    const slots2 = await SLOT_ITEMS(steward, CAP_SLOTS);
    const v2 = (await propose(product2, { recordId: ZR, kind: 'capability', title: `Expansion probe (c) — wider (SYNTHETIC ${RUN})`, subjectKey: ZCAP, expectedVersion: 1, scope: WIDE(), evidence: [t, fresh, ...slots2] })).record;
    const lastO = await attestAllButLast(ZR, 2, String(v2['digest']));
    await untilDb(String(short['valid_until']));
    await tick();
    expect((await stored1(ZR))['state']).toBe('constrained');
    expect(await one(sql`select count(*)::int n from governance.holds where source_artifact = ${ZR}::uuid and reason_kind = 'acceptance_constrained' and lifted_at is null`)).toEqual({ n: 1 });
    const people: Record<string, AuthenticatedPrincipal> = { product, independent_assurance: assurance, customer: sponsor, operations: ops };
    const last = () => attest(people[lastO]!, ZR, { version: 2, obligation: lastO, digest: String(v2['digest']) });
    if (REPRO_G) {
      expect((await last()).attestation).toMatchObject({ state: 'accepted' });
      expect(await one(sql`select count(*)::int n from governance.holds where source_artifact = ${ZR}::uuid and reason_kind = 'acceptance_constrained' and lifted_at is null`)).toEqual({ n: 0 });
      return;
    }
    await refused(last(), /^acceptance attestation rejected \(held\): CAP-GATE-Z-.* — version 2 expands beyond the scope in force \(role domain_admin\)/, 409);
    expect(await one(sql`select count(*)::int n from governance.holds where source_artifact = ${ZR}::uuid and reason_kind = 'acceptance_constrained' and lifted_at is null`)).toEqual({ n: 1 });
    expect(await recordState(ZR)).toEqual([{ version: 1, state: 'constrained', roles: [] }, { version: 2, state: 'proposed', roles: null }]);
  });
});
const stored1 = async (id: string, version = 1) => one(sql`select state from governance.acceptance_records where record_id = ${id}::uuid and version = ${version}`);
