/**
 * CP-6 B107 §CM (migration 0115_b107_x_cm) — CONFORMANCE MANIFESTS, THE RELEASE-CANDIDATE RECORD AND ITS EVIDENCE CHECK, THE LOCAL CONFORMANCE
 * MONITOR — on a real database through the real pipeline, ports and controllers. CONSTRUCTION evidence: every persona, candidate, evidence item,
 * exception and hold here is SYNTHETIC; an attestation by a synthetic persona demonstrates the software only; a release candidate is NOT a
 * release (B65 substituted); production admission and production monitoring (R1) and real acceptance (R2) are never claimed.
 *
 *   CM1 · THE MANIFEST (ES-01-001, ES-02-002, ES-31..40-002, ES-65-001, V04-T-004, IA-01-005, DP-65-005): the steward registers the COMMITTED,
 *         generated manifest (artifacts + links; unresolved §RG references COUNTED); refusals: the PDP (product authority, a tenant admin), an
 *         UNMAPPED unit (refused, the finding PRESERVED) → recovery; §RG's artifacts appear → the re-registration links them (idempotent);
 *         correction: a changed manifest is a new version, a unit gone is RETIRED, the committed one restores it.
 *   CM2 · THE RELEASE CANDIDATE (ES-01-005, V04-T-001, IA-01-006, DP-67-006): assembled with the server's build identity; the CHECK refuses
 *         ABSENT (422 evidence), STALE (409), UNVERIFIABLE (422), FOREIGN-VERSION (422) evidence and an OPEN HOLD (409 held) — its evidence
 *         holds committed — and admits after the renewal / the hold's lift; ATTESTATION by independent assurance, signed: refusals — the PDP
 *         (the steward), the proposer (SoD), a builder (SoD), an agent (actor), a stale digest, a held or a stale candidate; withdraw.
 *   CM3 · THE MONITOR (V03-T-479, IA-01-002, DP-65-002): the after-tick hook under the attention agent — policy / head / migration / manifest
 *         drift (findings + conformance_drift holds; the check then HELD), evidence expiry (evidence_stale hold), an expired exception reported,
 *         recovery (resolved, holds lifted); the steward's run; refusals; the FAULT exercise (the manifest unreadable → a finding, never healthy).
 *   CM4 · THE CONFORMANCE SERVICE AND THE READS (DAT-GV-09, V04-T-018, V07-T-004): a state per component never inferred; the closure gap
 *         report; the manifest view by layer; cross-tenant and unauthorized reads refused.
 *   CM5 · REPLAY: the ledger reconstructs every candidate's and manifest's history.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { generateKeyPairSync } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { AttentionTimerService } from '../../src/executive/attention/attention-timer.service.js';
import { ATTENTION_TIMER_DIGEST, ATTENTION_TIMER_VERSION } from '../../src/executive/attention/timer-identity.js';
import { policyBundleDigest } from '../../src/policy/pdp.service.js';
import { ConformanceController } from '../../src/governance/conformance/conformance.controller.js';
import { ConformanceService } from '../../src/governance/conformance/conformance.service.js';
import { ConformanceCap } from '../../src/governance/conformance/conformance.capabilities.js';
import { PlatformSigner } from '../../src/governance/conformance/platform-signer.js';
import { buildIdentity, manifestPath, readCommittedManifest } from '../../src/governance/conformance/build-identity.js';
import { Phase4Harness } from './phase4-helpers.js';

// THE SIGNING KEY (the B36 signer's discipline): generated here, bound in the process before the boot.
const KEY = generateKeyPairSync('ed25519');
process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = KEY.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

type Row = Record<string, unknown>;
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';
let h: Phase4Harness; let api: ConformanceController; let svc: ConformanceService;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
const DAY = 86_400_000;
const iso = (ms: number) => new Date(ms).toISOString();
const today = () => new Date().toISOString().slice(0, 10);

// ── personas (SYNTHETIC) ─────────────────────────────────────────────────────────────────────────
let steward: AuthenticatedPrincipal; let stewardAgent: AuthenticatedPrincipal; let assurance: AuthenticatedPrincipal; let assurance2: AuthenticatedPrincipal;
let stewardAssurance: AuthenticatedPrincipal; // holds conformance_steward AND independent_assurance (the proposer probe)
let builderAssurance: AuthenticatedPrincipal; // independent assurance, declared a BUILDER of the candidate (the independence probe)
let machineAssurance: AuthenticatedPrincipal; // an AGENT holding independent_assurance whose session claims a human (the PEP passes; the PORT refuses)
let product: AuthenticatedPrincipal; let platformAdmin: AuthenticatedPrincipal; let tenantAdmin: AuthenticatedPrincipal; let analyst: AuthenticatedPrincipal;
let agentId = '';
let HEAD = '';

function env(p: AuthenticatedPrincipal, action: string, scope: Scope, t: string | null, d: string | null): Envelope {
  return {
    message_id: uuidv7(), scope, tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: 'governance', action,
    side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C2', object_type: null, object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b107-cm',
  } as unknown as Envelope;
}
const preq = (p: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: env(p, action, 'PLATFORM', null, null), eyePrincipal: p }) as never;

async function person(label: string, kind: 'human' | 'agent', scope: Scope, roles: string[], claim: 'human' | 'agent' = kind): Promise<AuthenticatedPrincipal> {
  const id = uuidv7(); const t = scope === 'PLATFORM' ? null : T(); const d = scope === 'DOMAIN' ? D() : null;
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${scope}, ${t}::uuid, ${d}::uuid, ${`b107cm-${label}-${RUN} (SYNTHETIC)`}, ${`b107cm-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((roleCode) => ({ roleCode, scope, tenantId: t, domainId: d }));
  for (const b of bindings) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
              values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  }
  return h.openSession({ ...h.manager, principalId: id, kind: claim, assurance: claim === 'human' ? 'password' : 'agent_grant', homeScope: scope, homeTenantId: t, homeDomainId: d, bindings } as AuthenticatedPrincipal);
}

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

// ── the routes (in process) ───────────────────────────────────────────────────────────────────────
const register = (as = steward) => api.register(preq(as, 'governance.conformance.manifest.register')) as Promise<{ manifest: Row }>;
const workspace = (as = steward) => api.workspace(preq(as, 'governance.read')) as Promise<Row>;
const manifestView = (payload: Row, as = steward) => api.manifest(preq(as, 'governance.read'), { payload }) as Promise<Row>;
const assemble = (payload: Row, as = steward) => api.assemble(preq(as, 'governance.conformance.candidate.assemble'), { payload }) as Promise<{ candidate: Row }>;
const check = (id: string, version: number, as = steward) => api.check(preq(as, 'governance.conformance.candidate.check'), id, { payload: { version } }) as Promise<{ check: Row }>;
const preview = (id: string, as = assurance) => api.preview(preq(as, 'governance.read'), id) as Promise<Row & { eligibility: { can_attest: boolean; reasons: string[] }; digest: string }>;
const attest = (id: string, payload: Row, as = assurance) => api.attest(preq(as, 'governance.conformance.candidate.attest'), id,
  { payload: { reason: 'the evidence of the three required families reads true at this head (SYNTHETIC)', ...payload } }) as Promise<{ attestation: Row }>;
const withdraw = (id: string, version: number, as = steward) => api.withdraw(preq(as, 'governance.conformance.candidate.withdraw'), id, { payload: { version, reason: 'superseded by a later candidate (SYNTHETIC)' } }) as Promise<{ candidate: Row }>;
const monitorRun = (as = steward) => api.monitor(preq(as, 'governance.conformance.monitor')) as Promise<{ monitor: Row }>;

/** Evidence items bound to the head (the three required families), valid for `days`. */
const EVIDENCE = (over: Record<string, Row> = {}, days = 30): Row[] => ['contract', 'trust', 'human_authority'].map((family, i) => ({
  family, kind: 'test_report', ref: `apps/api/test/int/phase6-conformance-b107.test.ts#${family} (SYNTHETIC report ${RUN})`, digest: String(i + 1).repeat(64).slice(0, 64).replace(/[^0-9a-f]/g, 'a'),
  bound_head_sha: HEAD, captured_at: iso(Date.now() - 60_000), valid_until: iso(Date.now() + days * DAY), ...(over[family] ?? {}),
}));
const candidatePayload = (label: string, over: Row = {}): Row => ({ label: `${label} ${RUN} (SYNTHETIC)`, expectedVersion: 0, periodFrom: today(), periodTo: today(), scope: { kind: 'platform' }, evidence: EVIDENCE(), ...over });

/** Drive a §CM port through the REAL pipeline with crafted arguments (what a route never lets a client supply — the manifest content, a foreign
 *  build identity): the port still asserts the action, the scope and the actor. */
async function viaPort<T>(as: AuthenticatedPrincipal, action: string, fn: (cap: ReturnType<typeof ConformanceCap>) => Promise<T>): Promise<T> {
  const route = { scope: 'PLATFORM' as const, tenantId: null, domainId: null, action, objectType: 'CFN', objectId: null };
  const out = await h.pipeline.write(env(as, action, 'PLATFORM', null, null), as, route, ConformanceCap, async (cap) => ({ result: await fn(cap), targetType: 'CFN', targetId: null, targetVersion: null, outboxEvent: null }));
  return out.result;
}
const committedIndex = () => { const m = readCommittedManifest(manifestPath()); return { m, index: m.index as unknown as Row, summary: m.summary ?? {} }; };

let slot = 0;
const tick = async () => {
  const timer = h.app.get(AttentionTimerService);
  const o = await timer.tickNow({ tenantId: T(), domainId: D(), agentId, scheduledAt: new Date(Date.UTC(2035, 0, 1) + (slot++) * 60_000) });
  expect(o.outcome, JSON.stringify(o.run?.outputs ?? o.stopReason).slice(0, 600)).toBe('finished');
  const after = (o.run?.outputs['after'] ?? {}) as Record<string, Row>;
  return after['governance-conformance'] ?? {};
};
const openFindings = async (kind: string) => rows(sql`select finding_id::text, fingerprint, subject_artifact::text, summary from governance.cm_findings where kind = ${kind} and state = 'open' order by opened_at`);
const holdsOn = async (id: string) => rows(sql`select hold_id::text, reason_kind, reason, source_artifact::text, lifted_at from governance.holds where subject_artifact = ${id}::uuid order by opened_at`);
const openHoldsOn = async (id: string) => (await holdsOn(id)).filter((x) => x['lifted_at'] === null);

beforeAll(async () => {
  h = await Phase4Harness.boot();
  api = h.app.get(ConformanceController); svc = h.app.get(ConformanceService);
  HEAD = buildIdentity().head_sha;
  steward = await person('steward', 'human', 'PLATFORM', ['conformance_steward']);
  stewardAgent = await person('steward-agent', 'agent', 'PLATFORM', ['conformance_steward']);
  assurance = await person('assurance', 'human', 'PLATFORM', ['independent_assurance']);
  assurance2 = await person('assurance-2', 'human', 'PLATFORM', ['independent_assurance']);
  stewardAssurance = await person('steward-assurance', 'human', 'PLATFORM', ['conformance_steward', 'independent_assurance']);
  builderAssurance = await person('builder-assurance', 'human', 'PLATFORM', ['independent_assurance']);
  machineAssurance = await person('machine-assurance', 'agent', 'PLATFORM', ['independent_assurance'], 'human');
  product = await person('product', 'human', 'PLATFORM', ['product_authority']);
  platformAdmin = await person('padmin', 'human', 'PLATFORM', ['platform_admin']);
  tenantAdmin = await h.humanWithSession(['tenant_admin'], 'b107cm-tenant-admin', 'TENANT');
  analyst = await h.humanWithSession(['domain_analyst'], 'b107cm-analyst');
  const dadmin = await h.humanWithSession(['domain_admin'], 'b107cm-dadmin');
  const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
  const a = await h.app.get(Ec).registerAgent(h.req(tenantAdmin, 'agent.register', 'AGT', null, 'platform.administration'), T(), D(), { payload: {
    kind: 'attention', version: ATTENTION_TIMER_VERSION, codeDigest: ATTENTION_TIMER_DIGEST, ownerPrincipalId: dadmin.principalId, escalationPrincipalId: dadmin.principalId,
    budgets: { max_reads: 50, max_gateway_calls: 0, max_elapsed_ms: 120_000, tick_every_seconds: 60 } } }) as { agent: { agentId: string } };
  agentId = a.agent.agentId;
}, 600_000);

afterAll(async () => {
  delete process.env['EYE_CONFORMANCE_MANIFEST_PATH'];
  try {
    const { ExecutiveController: Ec } = await import('../../src/executive/executive.controller.js');
    if (agentId !== '') await h.app.get(Ec).revokeAgent(h.req(tenantAdmin, 'agent.revoke', 'AGT', agentId, 'platform.administration'), T(), D(), agentId, { payload: { reason: 'the B107 §CM harness is done' } });
  } catch { /* already revoked */ }
  await h?.close();
}, 120_000);

let MANIFEST = ''; let C1 = ''; let C1DIGEST = '';

describe('CM1 · the component manifest (ES-01-001, ES-02-002, ES-31..40-002, IA-01-005)', () => {
  it('the committed manifest is readable, generated, complete: 92 logical components in 10 service-manifest layers, no unmapped unit; the build identity is the server\'s', () => {
    const { m } = committedIndex();
    expect(m.readable).toBe(true);
    expect(m.summary).toMatchObject({ logical_components: 92, layers: 10, unmapped_units: 0 });
    expect(HEAD).toMatch(/^[0-9a-f]{40}$/);
    const id = buildIdentity();
    expect(id.policy_bundle.digest).toBe(policyBundleDigest());
    expect(id.manifest.file_digest).toBe(m.fileDigest);
  });
  it('refusals before any registration: the product authority and the platform admin (PDP), a tenant administrator (no PLATFORM scope)', async () => {
    await refused(register(product), /no qualifying role binding/, 403);
    await refused(register(platformAdmin), /no qualifying role binding/, 403);
    const r = await refusal(register(tenantAdmin));
    expect(r.status).toBe(403);
    expect(await one(sql`select count(*)::int n from governance.cm_manifests`)).toEqual({ n: 0 });
  });
  it('UNMAPPED: a manifest carrying a unit that resolves to no component is REFUSED and the non-conformant record PRESERVED as an open finding', async () => {
    const { index, summary, m } = committedIndex();
    const bad = { ...index, units: [...(index['units'] as Row[]), { unit_id: null, path: 'apps/api/src/rogue', kind: 'api_module', mapped: false, reason: 'no entry in UNIT_MAP (SYNTHETIC)', component_ids: [] }] };
    const r = await viaPort(steward, 'governance.conformance.manifest.register', (cap) => cap.registerManifest({ path: 'conformance/components.manifest.json', schema: String(m.schema), generator: 'x',
      fileDigest: 'b'.repeat(64), index: bad, summary, actor: steward.principalId, correlationId: uuidv7() }));
    expect(r).toMatchObject({ refused: true, class: 'unmapped_unit' });
    expect(await openFindings('unmapped_unit')).toHaveLength(1);
    expect(await one(sql`select count(*)::int n from governance.cm_manifests`)).toEqual({ n: 0 });
    // a unit naming a component the manifest does not declare is refused the same way
    const bad2 = { ...index, units: [{ ...(index['units'] as Row[])[1], component_ids: ['L99-C01'] }] };
    const r2 = await viaPort(steward, 'governance.conformance.manifest.register', (cap) => cap.registerManifest({ path: 'conformance/components.manifest.json', schema: String(m.schema), generator: 'x',
      fileDigest: 'c'.repeat(64), index: bad2, summary, actor: steward.principalId, correlationId: uuidv7() }));
    expect(JSON.stringify(r2['unmapped'])).toContain('L99-C01');
    // an agent's actor claim, another principal's id: the port refuses (actor)
    await refused(viaPort(steward, 'governance.conformance.manifest.register', (cap) => cap.registerManifest({ path: 'conformance/components.manifest.json', schema: String(m.schema), generator: 'x',
      fileDigest: 'd'.repeat(64), index, summary, actor: product.principalId, correlationId: uuidv7() })), /^conformance manifest rejected \(actor\)/, 403);
  });
  it('POSITIVE + RECOVERY: the steward registers the COMMITTED manifest — v1, every unit and component an artifact, the links derived, §RG\'s missing references COUNTED; the unmapped finding resolved', async () => {
    const r = (await register()).manifest;
    expect(r).toMatchObject({ version: 1, units: 31, components: 298, findings_resolved: 2 });
    MANIFEST = String(r['manifest_id']);
    const links = r['links'] as Row;
    expect(Number(links['links_added'])).toBeGreaterThan(500);
    expect(links['unresolved']).toMatchObject({ requirements: 288, interfaces: 460 });
    expect(await openFindings('unmapped_unit')).toHaveLength(0);
    const counts = await rows(sql`select kind, count(*)::int n from governance.artifacts where superseded_at is null and source ->> 'part' = 'cm' group by 1 order by 1`);
    expect(counts).toEqual([{ kind: 'component', n: 298 }, { kind: 'deployable_unit', n: 31 }, { kind: 'manifest', n: 1 }]);
    const deploys = await one(sql`select count(*)::int n from governance.links_live l join governance.artifacts u on u.artifact_id = l.from_artifact and u.superseded_at is null
      join governance.artifacts c on c.artifact_id = l.to_artifact and c.superseded_at is null where l.relation = 'deploys' and u.external_key = 'api.observation' and c.external_key like 'L1-C%'`);
    expect(deploys).toEqual({ n: 9 });
    expect(await one(sql`select event from governance.events where subject_id = ${MANIFEST}::uuid and event = 'manifest.registered'`)).toEqual({ event: 'manifest.registered' });
  });
  it('IDEMPOTENT + §RG\'s artifacts: the same digest is UNCHANGED; once the requirement, interface and schema artifacts exist, the re-registration links them', async () => {
    const plant = (kind: string, key: string) => sql`insert into governance.artifacts (artifact_id, version, scope, kind, external_key, title, digest, recorded_by, correlation_id, source)
      values (${uuidv7()}::uuid, 1, 'PLATFORM', ${kind}, ${key}, ${`${key} (SYNTHETIC — as §RG's importer registers it)`}, ${'e'.repeat(64)}, ${steward.principalId}::uuid, ${uuidv7()}::uuid, '{"part":"rg"}'::jsonb)`.execute(h.su);
    await plant('requirement', 'V3:L1-C01'); await plant('interface', 'L1-I01'); await plant('schema', 'SRC@v2'); await plant('schema', 'SRC@v3');
    const r = (await register()).manifest;
    expect(r).toMatchObject({ unchanged: true, version: 1 });
    const links = r['links'] as Row;
    expect(Number(links['links_added'])).toBeGreaterThanOrEqual(3);
    expect(links['unresolved']).toMatchObject({ requirements: 287 });
    const mapsTo = await one(sql`select count(*)::int n from governance.links_live l join governance.artifacts c on c.artifact_id = l.from_artifact and c.superseded_at is null
      join governance.artifacts q on q.artifact_id = l.to_artifact where c.external_key = 'L1-C01' and l.relation = 'maps_to' and q.external_key = 'V3:L1-C01'`);
    expect(mapsTo).toEqual({ n: 1 });
    const schema = await rows(sql`select q.external_key from governance.links_live l join governance.artifacts c on c.artifact_id = l.from_artifact and c.superseded_at is null
      join governance.artifacts q on q.artifact_id = l.to_artifact where c.external_key = 'L1-C01' and l.relation = 'consumes' and q.kind = 'schema'`);
    expect(schema).toEqual([{ external_key: 'SRC@v3' }]);   // the CURRENT version of the type
    expect(Number(((await register()).manifest['links'] as Row)['links_added'])).toBe(0);
  });
  it('CORRECTION: a changed manifest is a new version (a unit gone RETIRED, its links retired); the committed one is v3 and restores it', async () => {
    const { index, summary, m } = committedIndex();
    const less = { ...index, units: (index['units'] as Row[]).filter((u) => u['unit_id'] !== 'infra.redis') };
    const r = await viaPort(steward, 'governance.conformance.manifest.register', (cap) => cap.registerManifest({ path: 'conformance/components.manifest.json', schema: String(m.schema), generator: 'x',
      fileDigest: 'a'.repeat(64), index: less, summary, actor: steward.principalId, correlationId: uuidv7() }));
    expect(r).toMatchObject({ version: 2, retired: 1, superseded_version: 1 });
    expect(await one(sql`select lifecycle from governance.artifacts where kind = 'deployable_unit' and external_key = 'infra.redis' and superseded_at is null`)).toEqual({ lifecycle: 'retired' });
    expect(Number((r['links'] as Row)['links_retired'])).toBeGreaterThanOrEqual(3);
    const back = (await register()).manifest;
    expect(back).toMatchObject({ version: 3, superseded_version: 2 });
    expect(await one(sql`select lifecycle from governance.artifacts where kind = 'deployable_unit' and external_key = 'infra.redis' and superseded_at is null`)).toEqual({ lifecycle: 'active' });
    expect(await rows(sql`select version, state from governance.cm_manifests order by version`)).toEqual([{ version: 1, state: 'superseded' }, { version: 2, state: 'superseded' }, { version: 3, state: 'current' }]);
  });
});

describe('CM2 · the release candidate and its evidence check (ES-01-005, V04-T-001, IA-01-006, DP-67-006) — not a release', () => {
  it('assembly refusals: the PDP (the product authority), the shape (label, family, validity), a stale expected version, an unknown candidate', async () => {
    await refused(assemble(candidatePayload('rc-x'), product), /no qualifying role binding/, 403);
    await refused(assemble(candidatePayload('rc-x', { label: 'x' })), /^release candidate rejected \(label\)/, 422);
    await refused(assemble(candidatePayload('rc-x', { evidence: [{ ...EVIDENCE()[0], family: 'vibes' }] })), /^release candidate rejected \(evidence\): item 1 names a family/, 422);
    await refused(assemble(candidatePayload('rc-x', { evidence: [{ ...EVIDENCE()[0], valid_until: iso(Date.now() - 2 * DAY) }] })), /valid until after it was captured/, 422);
    await refused(assemble(candidatePayload('rc-x', { expectedVersion: 3 })), /^release candidate rejected \(stale\): a new candidate expects version 0/, 409);
    await refused(assemble(candidatePayload('rc-x', { candidateId: uuidv7(), expectedVersion: 1 })), /^release candidate rejected \(unknown_candidate\)/, 404);
    await refused(assemble(candidatePayload('rc-x', { scope: { kind: 'tenants', tenants: [uuidv7()] } })), /^release candidate rejected \(scope\)/, 422);
  });
  it('POSITIVE: assembled by the stewards (the proposer probe holds both roles) with the SERVER\'s identity; the check admits it — CONFORMANT, not a release', async () => {
    const c = (await assemble(candidatePayload('rc-1', { scope: { kind: 'tenants', tenants: [T()], domains: [D()] }, builders: [builderAssurance.principalId] }), stewardAssurance)).candidate;
    expect(c).toMatchObject({ version: 1, state: 'assembled', head_sha: HEAD, deployment_profile: 'local-dev', claim: 'demonstration', release: 'not_a_release', manifest_version: 3 });
    expect(c['migration_head']).toBe(String((await one(sql`select max(filename) h from public.schema_migrations`))['h']));
    expect((c['policy_bundle'] as Row)['digest']).toBe(policyBundleDigest());
    C1 = String(c['candidate_id']); C1DIGEST = String(c['digest']);
    expect(await one(sql`select kind, lifecycle from governance.artifacts where artifact_id = ${C1}::uuid and superseded_at is null`)).toEqual({ kind: 'release_candidate', lifecycle: 'proposed' });
    expect(await one(sql`select count(*)::int n from governance.links_live where from_artifact = ${C1}::uuid and to_artifact = ${MANIFEST}::uuid and relation = 'covers'`)).toEqual({ n: 1 });
    const r = (await check(C1, 1)).check;
    expect(r).toMatchObject({ outcome: 'conformant', reasons: [], holds: [], required_families: ['contract', 'trust', 'human_authority'] });
    expect(String(r['carried_by'])).toMatch(/B64.*B106.*B63/);
  });
  it('ATTESTATION refusals: the steward (PDP) · the PROPOSER (SoD) · a declared BUILDER (SoD) · an agent (actor) · a stale digest — no signature is left', async () => {
    await refused(attest(C1, { version: 1, digest: C1DIGEST }, steward), /no qualifying role binding/, 403);
    await refused(attest(C1, { version: 1, digest: C1DIGEST }, stewardAssurance), /^release candidate rejected \(separation_of_duties\): .* never done by its proposer/, 403);
    await refused(attest(C1, { version: 1, digest: C1DIGEST }, builderAssurance), /^release candidate rejected \(separation_of_duties\): .* never done by a builder/, 403);
    await refused(attest(C1, { version: 1, digest: C1DIGEST }, machineAssurance), /^release candidate rejected \(actor\)/, 403);
    await refused(attest(C1, { version: 1, digest: 'f'.repeat(64) }), /^release candidate rejected \(stale\)/, 409);
    await refused(attest(C1, { version: 1, digest: C1DIGEST, reason: 'short' }), /^release candidate rejected \(reason\)/, 422);
    expect(await one(sql`select count(*)::int n from governance.signatures where subject_id = ${C1}::uuid`)).toEqual({ n: 0 });
  });
  it('the PREVIEW explains eligibility in words (the port decides) and names the exact digest and the consequence', async () => {
    const mine = await preview(C1, stewardAssurance);
    expect(mine.eligibility.can_attest).toBe(false);
    expect(mine.eligibility.reasons.join(' ')).toMatch(/assembled this candidate/);
    const theirs = await preview(C1, assurance);
    expect(theirs).toMatchObject({ digest: C1DIGEST, eligibility: { can_attest: true, reasons: [] } });
    expect(String(theirs['consequence'])).toMatch(/NOT a release \(B65\), NOT production admission \(R1\)/);
    await refused(preview(uuidv7()), /^release candidate rejected \(unknown_candidate\)/, 404);
  });
  it('POSITIVE: independent assurance ATTESTS — signed (manifest_attestation, PLATFORM), verified; a second attestation refused (state)', async () => {
    const a = (await attest(C1, { version: 1, digest: C1DIGEST })).attestation;
    expect(a).toMatchObject({ state: 'attested', digest: C1DIGEST });
    expect(String(a['boundary'])).toMatch(/NOT a release/);
    const sig = await one(sql`select key_id, signature, subject_digest, signer::text, signer_role, bound_action, scope, subject_kind from governance.signatures where signature_id = ${String(a['signature_id'])}::uuid`);
    expect(sig).toMatchObject({ subject_digest: C1DIGEST, signer: assurance.principalId, signer_role: 'independent_assurance', bound_action: 'governance.conformance.candidate.attest', scope: 'PLATFORM', subject_kind: 'manifest_attestation' });
    expect(new PlatformSigner().verify(sig as never)).toBe(true);
    expect(new PlatformSigner().verify({ ...(sig as never as { key_id: string; signature: string; subject_digest: string }), subject_digest: 'f'.repeat(64) })).toBe(false);
    await refused(attest(C1, { version: 1, digest: C1DIGEST }, assurance2), /^release candidate rejected \(state\): version 1 is attested/, 409);
    await refused(assemble(candidatePayload('rc-1', { candidateId: C1, expectedVersion: 1 })), /^release candidate rejected \(state\): version 1 is attested/, 409);
  });
  it('the CHECK refuses ABSENT evidence (422 evidence; an evidence_missing hold committed) — RECOVERY: amended with the family, conformant, the hold lifted', async () => {
    const c = (await assemble(candidatePayload('rc-absent', { evidence: EVIDENCE().filter((e) => e['family'] !== 'human_authority') }))).candidate;
    const id = String(c['candidate_id']);
    const r = await refused(check(id, 1), /^release candidate rejected \(evidence\): the candidate is refused — evidence: no human authority evidence/, 422);
    expect((r.body['check'] as Row)['outcome']).toBe('refused');
    expect((await openHoldsOn(id)).map((x) => x['reason_kind'])).toEqual(['evidence_missing']);
    expect(await one(sql`select state from governance.cm_release_candidates where candidate_id = ${id}::uuid and version = 1`)).toEqual({ state: 'refused' });
    const v2 = (await assemble(candidatePayload('rc-absent', { candidateId: id, expectedVersion: 1 }))).candidate;
    expect(v2).toMatchObject({ version: 2, state: 'assembled' });
    expect((await check(id, 2)).check).toMatchObject({ outcome: 'conformant', evidence_holds_lifted: 1 });
    expect(await openHoldsOn(id)).toHaveLength(0);
    await refused(check(id, 1), /^release candidate rejected \(state\): version 1 is superseded/, 409);
  });
  it('the CHECK refuses STALE evidence (409 stale; an evidence_stale hold), UNVERIFIABLE evidence (422) and FOREIGN-VERSION evidence (422)', async () => {
    const stale = String((await assemble(candidatePayload('rc-stale', { evidence: EVIDENCE({ trust: { captured_at: iso(Date.now() - 3 * DAY), valid_until: iso(Date.now() - DAY) } }) }))).candidate['candidate_id']);
    await refused(check(stale, 1), /^release candidate rejected \(stale\): .*the trust evidence .* expired/, 409);
    expect((await openHoldsOn(stale)).map((x) => x['reason_kind'])).toEqual(['evidence_stale']);
    const unverifiable = String((await assemble(candidatePayload('rc-unverifiable', { evidence: EVIDENCE({ contract: { digest: null }, trust: { artifact_id: uuidv7() } }) }))).candidate['candidate_id']);
    const u = await refused(check(unverifiable, 1), /^release candidate rejected \(unverifiable\): .*carries no digest.*not registered/, 422);
    expect(((u.body['check'] as Row)['reasons'] as Row[]).map((x) => x['class'])).toEqual(['unverifiable', 'unverifiable']);
    const foreign = String((await assemble(candidatePayload('rc-foreign', { evidence: EVIDENCE({ human_authority: { bound_head_sha: '0'.repeat(40) } }) }))).candidate['candidate_id']);
    await refused(check(foreign, 1), /^release candidate rejected \(foreign_version\): .*bound to head 000000000000/, 422);
    // a registered evidence artifact (as §RG's verification record) whose digest is not the item's: unverifiable; whose head is another: foreign
    const ev = uuidv7();
    await sql`insert into governance.artifacts (artifact_id, version, scope, kind, external_key, title, digest, recorded_by, correlation_id, attributes, source)
      values (${ev}::uuid, 1, 'PLATFORM', 'evidence', ${`vitest-report-${RUN}`}, 'a vitest JSON report (SYNTHETIC — as §RG ingests it)', ${'9'.repeat(64)}, ${steward.principalId}::uuid, ${uuidv7()}::uuid,
              ${JSON.stringify({ head_sha: '1'.repeat(40) })}::jsonb, '{"part":"rg"}'::jsonb)`.execute(h.su);
    const viaArtifact = String((await assemble(candidatePayload('rc-artifact', { evidence: EVIDENCE({ contract: { artifact_id: ev, digest: '9'.repeat(64), kind: 'artifact' } }) }))).candidate['candidate_id']);
    expect(await one(sql`select count(*)::int n from governance.links_live where from_artifact = ${ev}::uuid and to_artifact = ${viaArtifact}::uuid and relation = 'evidences'`)).toEqual({ n: 1 });
    await refused(check(viaArtifact, 1), /^release candidate rejected \(foreign_version\): .*evidence artifact was produced at head 111111111111/, 422);
    // RECOVERY of the stale one: renewed evidence, conformant, the stale hold lifted
    await assemble(candidatePayload('rc-stale', { candidateId: stale, expectedVersion: 1 }));
    expect((await check(stale, 2)).check).toMatchObject({ outcome: 'conformant' });
    expect(await openHoldsOn(stale)).toHaveLength(0);
  });
  it('an OPEN HOLD (an expired exception — §PG\'s) HOLDS the candidate: the check 409 held, the attestation 409 held; lifted → conformant → attested', async () => {
    const id = String((await assemble(candidatePayload('rc-held'))).candidate['candidate_id']);
    const hold = uuidv7();
    await sql`insert into governance.holds (hold_id, scope, subject_artifact, reason_kind, reason, opened_by, correlation_id)
      values (${hold}::uuid, 'PLATFORM', ${id}::uuid, 'exception_expired', 'the export-path exception EXC-SYN-01 expired yesterday (SYNTHETIC — as §PG opens it)', ${product.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const r = await refused(check(id, 1), /^release candidate rejected \(held\): the candidate is held — held \(exception_expired\): the export-path exception/, 409);
    expect((r.body['check'] as Row)['outcome']).toBe('held');
    await sql`update governance.holds set lifted_at = clock_timestamp(), lifted_by = ${product.principalId}::uuid, lift_reason = 'renewed by the authorised body with current evidence (SYNTHETIC)' where hold_id = ${hold}::uuid`.execute(h.su);
    const ok = (await check(id, 1)).check;
    expect(ok).toMatchObject({ outcome: 'conformant' });
    // a hold opened AFTER the check: the attestation re-checks at its instant
    const late = uuidv7();
    await sql`insert into governance.holds (hold_id, scope, subject_artifact, reason_kind, reason, opened_by, correlation_id)
      values (${late}::uuid, 'PLATFORM', ${id}::uuid, 'conflict', 'a cross-volume conformance conflict (SYNTHETIC — as §PG opens it)', ${product.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const digest = String(ok['digest']);
    await refused(attest(id, { version: 1, digest }), /^release candidate rejected \(held\): conflict: a cross-volume conformance conflict/, 409);
    await sql`update governance.holds set lifted_at = clock_timestamp(), lifted_by = ${product.principalId}::uuid, lift_reason = 'resolved (SYNTHETIC)' where hold_id = ${late}::uuid`.execute(h.su);
    expect((await attest(id, { version: 1, digest })).attestation).toMatchObject({ state: 'attested' });
  });
  it('WITHDRAW: the steward or the product authority (not independent assurance — PDP); the §CM holds lifted, the artifact retired; a withdrawn candidate is never checked', async () => {
    const id = String((await assemble(candidatePayload('rc-withdrawn', { evidence: EVIDENCE().slice(0, 2) }))).candidate['candidate_id']);
    await refused(check(id, 1), /\(evidence\)/, 422);
    await refused(withdraw(id, 1, assurance), /no qualifying role binding/, 403);
    expect((await withdraw(id, 1, product)).candidate).toMatchObject({ state: 'withdrawn', holds_lifted: 1 });
    expect(await one(sql`select lifecycle from governance.artifacts where artifact_id = ${id}::uuid and superseded_at is null`)).toEqual({ lifecycle: 'retired' });
    await refused(check(id, 1), /^release candidate rejected \(state\): version 1 is withdrawn/, 409);
    await refused(withdraw(id, 1), /\(state\)/, 409);
  });
});

describe('CM3 · the local conformance monitor under the attention tick (V03-T-479, IA-01-002, DP-65-002)', () => {
  let DRIFT = ''; let EXPIRING = '';
  it('the hook runs after the tick under the attention agent: the first pass records the observation (nothing drifted)', async () => {
    const a = await tick();
    expect(a).toMatchObject({ recorded: true, opened: 0 });
    const run = await one(sql`select via, ticked_domain::text, actor_principal_id::text from governance.cm_monitor_runs order by recorded_at desc limit 1`);
    expect(run).toMatchObject({ via: 'tick', ticked_domain: D() });
    expect(await tick()).toMatchObject({ recorded: false });   // recorded on change only
  });
  it('DRIFT: a candidate bound to another policy bundle, head and migration head → three findings, three conformance_drift holds; its check is HELD', async () => {
    const c = await viaPort(steward, 'governance.conformance.candidate.assemble', (cap) => cap.assemble({ candidateId: null, expectedVersion: 0, label: `rc-drift ${RUN} (SYNTHETIC)`, headSha: 'a'.repeat(40),
      policy: { version: 'bundle-v0', digest: 'f'.repeat(64) }, configDigest: 'c'.repeat(64), profile: 'local-dev', scope: { kind: 'platform' }, from: today(), to: today(),
      evidence: EVIDENCE({}, 30).map((e) => ({ ...e, bound_head_sha: 'a'.repeat(40) })), builders: [], actor: steward.principalId, correlationId: uuidv7() }));
    DRIFT = String(c['candidate_id']);
    await sql`update governance.cm_release_candidates set migration_head = '0099_old.sql' where candidate_id = ${DRIFT}::uuid`.execute(h.su);   // (SYNTHETIC: a candidate of an older database)
    const a = await tick();
    expect(a).toMatchObject({ recorded: true, opened: 3, holds_opened: 3 });
    expect((await openFindings('policy_drift')).map((f) => f['subject_artifact'])).toEqual([DRIFT]);
    expect((await openFindings('head_drift')).map((f) => f['subject_artifact'])).toEqual([DRIFT]);
    expect((await openFindings('migration_drift')).map((f) => f['subject_artifact'])).toEqual([DRIFT]);
    expect((await openHoldsOn(DRIFT)).map((x) => x['reason_kind'])).toEqual(['conformance_drift', 'conformance_drift', 'conformance_drift']);
    await refused(check(DRIFT, 1), /^release candidate rejected \(held\): the candidate is held — held \(conformance_drift\)/, 409);
    expect(await tick()).toMatchObject({ opened: 0 });   // the same observation opens nothing twice
  });
  it('RECOVERY: the drifted candidate withdrawn → the next pass RESOLVES its findings; the holds are lifted', async () => {
    await withdraw(DRIFT, 1);
    const a = await tick();
    expect(a).toMatchObject({ recorded: true, resolved: 3 });
    expect(await openFindings('policy_drift')).toHaveLength(0);
    expect(await openHoldsOn(DRIFT)).toHaveLength(0);
  });
  it('MANIFEST DRIFT: a registered manifest other than the committed one is a finding; a candidate bound to the old one is FOREIGN at its check; re-registration resolves it', async () => {
    const id = String((await assemble(candidatePayload('rc-manifest'))).candidate['candidate_id']);
    const { index, summary, m } = committedIndex();
    await viaPort(steward, 'governance.conformance.manifest.register', (cap) => cap.registerManifest({ path: 'conformance/components.manifest.json', schema: String(m.schema), generator: 'x',
      fileDigest: '7'.repeat(64), index, summary, actor: steward.principalId, correlationId: uuidv7() }));
    expect(await tick()).toMatchObject({ opened: 1 });
    expect((await openFindings('manifest_drift')).map((f) => f['fingerprint'])).toEqual([`manifest_drift:${'7'.repeat(64)}:${String(m.fileDigest)}`]);
    expect((await workspace())['sync']).toMatchObject({ state: 'drift' });
    await refused(check(id, 1), /^release candidate rejected \(foreign_version\): .*bound to manifest v3/, 422);
    expect((await register()).manifest).toMatchObject({ version: 5 });
    expect(await tick()).toMatchObject({ resolved: 1 });
    await refused(check(id, 1), /\(foreign_version\)/, 422);   // bound to v3 for ever: a new candidate binds v5
    await withdraw(id, 1);
  });
  it('EVIDENCE EXPIRY: an item expiring after the check → the monitor opens evidence_expired + an evidence_stale hold; the attestation refused; renewal recovers', async () => {
    const c = (await assemble(candidatePayload('rc-expiring', { evidence: EVIDENCE({ contract: { valid_until: iso(Date.now() + 4_000) } }) }))).candidate;
    EXPIRING = String(c['candidate_id']);
    const ok = (await check(EXPIRING, 1)).check;
    expect(ok['outcome']).toBe('conformant');
    await new Promise((r) => setTimeout(r, 4_500));
    expect(await tick()).toMatchObject({ opened: 1, holds_opened: 1 });
    expect((await openHoldsOn(EXPIRING)).map((x) => x['reason_kind'])).toEqual(['evidence_stale']);
    await refused(attest(EXPIRING, { version: 1, digest: String(ok['digest']) }), /^release candidate rejected \(held\): evidence_stale: evidence expired/, 409);
    await assemble(candidatePayload('rc-expiring', { candidateId: EXPIRING, expectedVersion: 1 }));
    expect((await check(EXPIRING, 2)).check).toMatchObject({ outcome: 'conformant', evidence_holds_lifted: 1 });
    expect(await tick()).toMatchObject({ resolved: 1 });
    expect(await openFindings('evidence_expired')).toHaveLength(0);
  });
  it('EXCEPTIONS: an expired-exception hold on a live candidate is REPORTED (no second hold); an exception artifact past its expiry is reported', async () => {
    const hold = uuidv7();
    await sql`insert into governance.holds (hold_id, scope, subject_artifact, reason_kind, reason, opened_by, correlation_id)
      values (${hold}::uuid, 'PLATFORM', ${EXPIRING}::uuid, 'exception_expired', 'EXC-SYN-02 on the export path expired (SYNTHETIC — as §PG opens it)', ${product.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await sql`insert into governance.artifacts (artifact_id, version, scope, kind, external_key, title, digest, recorded_by, correlation_id, attributes, source)
      values (${uuidv7()}::uuid, 1, 'PLATFORM', 'exception', ${`EXC-SYN-${RUN}`}, 'an export-path exception (SYNTHETIC — as §PG registers it)', ${'4'.repeat(64)}, ${product.principalId}::uuid, ${uuidv7()}::uuid,
              ${JSON.stringify({ expires_at: iso(Date.now() - DAY) })}::jsonb, '{"part":"pg"}'::jsonb)`.execute(h.su);
    expect(await tick()).toMatchObject({ opened: 2, holds_opened: 0 });
    expect((await openFindings('exception_expired')).map((f) => f['fingerprint'])).toEqual([`exception_expired:${hold}`]);
    expect(await openFindings('exception_expiry_reported')).toHaveLength(1);
    await sql`update governance.holds set lifted_at = clock_timestamp(), lifted_by = ${product.principalId}::uuid, lift_reason = 'renewed (SYNTHETIC)' where hold_id = ${hold}::uuid`.execute(h.su);
    expect(await tick()).toMatchObject({ resolved: 1 });
  });
  it('THE STEWARD runs the monitor at PLATFORM; refusals: the product authority (PDP), a domain analyst, an attention-agent record claiming the steward\'s path (port)', async () => {
    const r = (await monitorRun()).monitor;
    expect(r).toHaveProperty('open');
    expect(Array.isArray(r['findings'])).toBe(true);
    await refused(monitorRun(product), /no qualifying role binding/, 403);
    const route = { scope: 'DOMAIN' as const, tenantId: T(), domainId: D(), action: 'governance.conformance.monitor', objectType: 'CFN', objectId: null };
    await refused(h.pipeline.write(env(analyst, route.action, 'DOMAIN', T(), D()), analyst, route, ConformanceCap, async (cap) => ({ result: await cap.recordMonitor({ observed: {}, findings: [], via: 'tick', actor: analyst.principalId, correlationId: uuidv7() }),
      targetType: 'CFN', targetId: null, targetVersion: null, outboxEvent: null })), /no qualifying role binding/, 403);
    await refused(viaPort(steward, 'governance.conformance.monitor', (cap) => cap.recordMonitor({ observed: {}, findings: [], via: 'tick', actor: steward.principalId, correlationId: uuidv7() })),
      /^conformance finding rejected \(via\)/, 422);
    await refused(viaPort(steward, 'governance.conformance.monitor', (cap) => cap.recordMonitor({ observed: {}, findings: [{ kind: 'vibes', fingerprint: 'x:1', summary: 'a finding of no kind' }], via: 'steward', actor: steward.principalId, correlationId: uuidv7() })),
      /^conformance finding rejected \(finding\)/, 422);
  });
  it('FAULT: the committed manifest unreadable → manifest_unreadable (never inferred healthy), registration refused (409 state); restored → resolved', async () => {
    process.env['EYE_CONFORMANCE_MANIFEST_PATH'] = `conformance/missing-${RUN}.json`;
    try {
      expect(await tick()).toMatchObject({ opened: 1 });
      expect(await openFindings('manifest_unreadable')).toHaveLength(1);
      await refused(register(), /^conformance manifest rejected \(state\): the committed component manifest is missing/, 409);
      expect((await workspace())['sync']).toMatchObject({ state: 'unreadable' });
    } finally { delete process.env['EYE_CONFORMANCE_MANIFEST_PATH']; }
    expect(await tick()).toMatchObject({ resolved: 1 });
    expect(await openFindings('manifest_unreadable')).toHaveLength(0);
  });
});

describe('CM4 · the conformance service and the reads (DAT-GV-09, V04-T-018, V07-T-004)', () => {
  it('a state per component, never inferred: catalogued INF/DAT ids not_deployed; deployed components conformant_local ONLY on a checked candidate of the current manifest', async () => {
    const w = await workspace();
    const comps = w['components'] as Array<Row>;
    expect(comps).toHaveLength(298);
    const byId = Object.fromEntries(comps.map((c) => [String(c['component_id']), c]));
    expect(byId['INF-DP-01']).toMatchObject({ state: 'not_deployed' });
    expect(byId['L1-C01']).toMatchObject({ state: 'conformant_local' });
    expect(String(byId['L1-C01']?.['basis'])).toMatch(/build-level evidence .*H2.*R1/);
    expect(w['sync']).toMatchObject({ state: 'in_sync' });
    expect(String(w['boundary'])).toMatch(/never a release, never production admission \(R1\)/);
    // a newer candidate of the current manifest that is refused: the components say so (never the older good one by inference)
    const bad = String((await assemble(candidatePayload('rc-refused', { evidence: EVIDENCE().slice(0, 1) }))).candidate['candidate_id']);
    await refusal(check(bad, 1));
    const w2 = await workspace();
    expect(((w2['components'] as Row[]).find((c) => c['component_id'] === 'L1-C01'))).toMatchObject({ state: 'held' });
    await withdraw(bad, 1);
  });
  it('the closure gap report is a gap report — never a closure', async () => {
    const closure = (await workspace())['closure'] as Row;
    expect(String(closure['statement'])).toMatch(/closure is NOT reached/);
    expect(((closure['totals'] as Row)['quality contract (computed SLO)'])).toBe(92);
    expect(((closure['totals'] as Row)['deployment-parity fixture'])).toBe(92);
  });
  it('the manifest view by layer and kind; a bad filter refused', async () => {
    const v = await manifestView({ layer: 'L1' });
    expect((v['logical_components'] as Row[]).map((c) => c['component_id'])).toHaveLength(9);
    expect((v['units'] as Row[]).map((u) => u['unit_id'])).toEqual(['api.observation']);
    expect((await manifestView({ kind: 'worker' }))['units']).toHaveLength(2);
    await refused(manifestView({ layer: 'L11' }), /^conformance manifest rejected \(request\)/, 422);
  });
  it('CROSS-TENANT / UNAUTHORIZED: a tenant administrator and a domain analyst cannot read the vendor\'s workspace on the PLATFORM route', async () => {
    expect((await refusal(workspace(tenantAdmin))).status).toBe(403);
    expect((await refusal(workspace(analyst))).status).toBe(403);
  });
  it('RLS: a DOMAIN context READS the PLATFORM registries (not tenant data) and writes none of them', async () => {
    const exec = await h.humanWithSession(['executive'], 'b107cm-exec');
    const d = await h.pipeline.consequentialRead(env(exec, 'governance.read', 'DOMAIN', T(), D()), exec, { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'governance.read', objectType: 'CFN', objectId: null },
      ConformanceCap, async (cap) => ({ manifest: await cap.currentManifest(), findings: (await cap.findings(5)).length })).catch((e: unknown) => ({ result: { error: String(e) } }));
    expect(JSON.stringify(d.result)).not.toMatch(/error/);
    const w = await one(sql`select has_table_privilege('eye_commit', 'governance.cm_release_candidates', 'INSERT') ins, has_table_privilege('eye_app', 'governance.cm_findings', 'UPDATE') upd`);
    expect(w).toEqual({ ins: false, upd: false });
  });
});

describe('CM5 · replay: the ledger reconstructs the candidates and the manifests', () => {
  it('every candidate\'s history in order, every manifest version; the monitor runs are append-only', async () => {
    const ev = (await rows(sql`select event, version from governance.events where subject_id = ${C1}::uuid order by occurred_at, event_id`)).map((r) => `${String(r['event'])}@${String(r['version'])}`);
    expect(ev).toEqual(['candidate.assembled@1', 'candidate.checked@1', 'candidate.attested@1']);
    const mv = (await rows(sql`select event, version from governance.events where subject_kind = 'conformance_manifest' and event in ('manifest.registered') order by occurred_at`)).map((r) => Number(r['version']));
    expect(mv).toEqual([1, 2, 3, 4, 5]);
    expect(await rows(sql`select version from governance.cm_manifests order by version`)).toHaveLength(5);
    const run = String((await one(sql`select run_id::text from governance.cm_monitor_runs limit 1`))['run_id']);
    await expect(sql`delete from governance.cm_monitor_runs where run_id = ${run}::uuid`.execute(h.su)).rejects.toThrow(/append-only|append only/i);
    expect(svc.verifySignature({ key_id: 'x', signature: 'y', subject_digest: 'z' })).toBe(false);
  });
});
