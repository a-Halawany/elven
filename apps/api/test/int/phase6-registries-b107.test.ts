/**
 * CP-6 B107 §RG (migration 0115_b107_x_rg, part `registries`) — F-P7D-25 / F-P7-F-12: THE REGISTRIES, BIDIRECTIONAL TRACEABILITY, ORPHAN
 * DETECTION, DETERMINISTIC CHANGE IMPACT, THE VERIFICATION RECORD AND THE FIXTURE REGISTRY — on a real database through the real routes,
 * pipeline (PDP, POL/AUD) and ports, with named PLATFORM humans holding sessions of their own (the ports compare the acting principal).
 *
 *   RG1 · IMPORT (ES-03-001..004, ES-67-001, PR-08-002, ADR-004, IA-02-002, IA-06-002, DP-02-002, DP-07-002): synthetic registers in a
 *         SYNTHETIC repository root (requirements of V0/V4/V8/V9 with chapters, a capability and a journey, the rowmap + tracker, a decision,
 *         an engineering exception) and the database's interface/schema registers — positive, IDEMPOTENT (nothing written twice), refused
 *         (a non-steward 403, a tenant administrator at the PLATFORM route, a malformed register 422 — nothing written), the FAULT exercise (a
 *         database refusal mid-source rolls the whole source back) and RECOVERY, a CORRECTION (version 2; version 1 resolvable as of its time;
 *         a removed row RETIRED, never deleted; the impact recorded on its own — ES-02-005) and REPLAY (as-of).
 *   RG2 · THE NORMATIVE-ARTIFACT REGISTRY + CONTROL ORDER (ES-02-001, ES-03-001/-002/-003, IA-02-001/-003, DP-02-001/-003, PR-08-003, ADR-004).
 *   RG3 · TRACE LINKS, BIDIRECTIONAL and AS OF (ES-06-001/-005, IA-06-001..003, DP-07-001..003, V03-T-474, V04-T-017, V06-T-008, ES-01-002,
 *         PR-08-001, CAP-AU-09) — the control order, cycles, another tenant's record, duplicates; append-only; retired by a later row.
 *   RG4 · ORPHANS — listed, never hidden (IA-06-006, PR-08-006, CAP-AU-09).
 *   RG5 · THE FIXTURE REGISTRY and THE VERIFICATION RECORD (DP-67-002/-005, V04-T-012, ES-67-001, ES-03-001): approval by independent
 *         assurance (never a builder, never an agent), quarantine invalidating evidence, the rebuild, the sweep; ingest (idempotent), the
 *         three dimensions, the independent review.
 *   RG6 · DETERMINISTIC CHANGE IMPACT (ES-02-005, ES-06-004) over a forecast contract: the component, the release candidate, the tests and
 *         their evidence, a DOMAIN's decision-active briefing (declared by its own administrator — another tenant refused), the requirements to
 *         re-verify; the same input → the same digest; recorded on the digest shown (stale refused); the candidate HELD until its stale
 *         verifications are current again.
 *   RG7 · INHERITANCE and ADMISSION (IA-06-005, DP-07-005, PR-08-005, IA-02-006, IA-06-006, DP-02-006, DP-07-006): incomplete, circular,
 *         stale → holds on the artifact and its capabilities; the chain closed → lifted; the admission check (construction half; R1 stated).
 *   RG8 · SNAPSHOT + BUILD IDENTITY (ES-06-002, ES-06-003); the ledger; the boundary.
 *   RG9 · THE REAL REGISTERS (read-only): every row of audit/requirements/*.csv, the rowmap, DECISIONS.md, EXCEPTIONS.md imported; again → unchanged.
 *
 * The AT-08 fixture classes: positive, negative, stale, unauthorized-role, cross-tenant, correction and replay — each named in a case title
 * below — and the fault exercise (RG1). Every principal, register, report, fixture and record written here is SYNTHETIC.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { RegistriesController, RegistriesDomainController } from '../../src/governance/registries/registries.controller.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';
let h: Phase4Harness; let T: string; let D: string; let U: string; let DU: string;
let api: RegistriesController; let dapi: RegistriesDomainController;
let steward: AuthenticatedPrincipal; let builder: AuthenticatedPrincipal; let assurance: AuthenticatedPrincipal; let agentSteward: AuthenticatedPrincipal;
let agentAssurance: AuthenticatedPrincipal; let product: AuthenticatedPrincipal; let padmin: AuthenticatedPrincipal; let tadmin: AuthenticatedPrincipal;
let dadmin: AuthenticatedPrincipal; let uadmin: AuthenticatedPrincipal;
const RUN = uuidv7().replace(/-/g, '').slice(-4).toUpperCase();
const P = `S${RUN}`;
const REPO = join(__dirname, '..', '..', '..', '..');
let SYN = '';
const sha = (s: string | Buffer) => createHash('sha256').update(s).digest('hex');

// ── envelopes, calls, refusals ─────────────────────────────────────────────────────────
function env(p: AuthenticatedPrincipal, action: string, scope: Scope, t: string | null, d: string | null): Envelope {
  return {
    message_id: uuidv7(), scope, tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: 'governance', action,
    side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C2', object_type: null, object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b107-registries',
  } as unknown as Envelope;
}
const preq = (p: AuthenticatedPrincipal, action = 'governance.read') => ({ eyeEnvelope: env(p, action, 'PLATFORM', null, null), eyePrincipal: p }) as never;
const dreq = (p: AuthenticatedPrincipal, t: string, d: string, action: string) => ({ eyeEnvelope: env(p, action, 'DOMAIN', t, d), eyePrincipal: p }) as never;
async function refusal(pr: Promise<unknown>): Promise<{ status: number | 'ok'; message: string }> {
  try { await pr; return { status: 'ok', message: '' }; } catch (e) {
    const body = e instanceof HttpException ? (e.getResponse() as Row) : {};
    const raw = e instanceof HttpException ? String(body['message'] ?? '') : (e instanceof Error ? e.message : String(e));
    const r = asObservationRefusal(e, uuidv7());
    if (r === null) throw e;
    return { status: r.getStatus(), message: raw };
  }
}
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const n = async (q: ReturnType<typeof sql>) => Number(((await q.execute(h.su)).rows[0] as { n: number } | undefined)?.n ?? 0);
const aid = async (kind: string, key: string) => String((await one(sql`select artifact_id::text as id from governance.artifacts where kind = ${kind} and external_key = ${key} and superseded_at is null`))['id']);
/** An instant on the DATABASE's clock (as-of replays compare with clock_timestamp(); the host clock may differ by milliseconds). */
const dbNow = async () => { await new Promise((res) => setTimeout(res, 15)); const t = String((await one(sql`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t`))['t']); await new Promise((res) => setTimeout(res, 15)); return t; };
/** B107 integration: the orphans an IMPORT of `pathLike` registered (the registry is shared — another part's planted artifact is not a register row). */
const imported = async (orphanRows: Row[], pathLike: string): Promise<Row[]> => {
  const ids = orphanRows.map((x) => String(x['artifact_id']));
  const keep = new Set((await sql<{ id: string }>`select artifact_id::text as id from governance.artifacts where artifact_id = any(${ids}::uuid[]) and superseded_at is null
                                                   and source->>'path' like ${pathLike}`.execute(h.su)).rows.map((x) => x.id));
  return orphanRows.filter((x) => keep.has(String(x['artifact_id'])));
};
const cur = (kind: string, key: string) => one(sql`select artifact_id::text, version, lifecycle, digest, attributes from governance.artifacts where kind = ${kind} and external_key = ${key} and superseded_at is null`);

async function person(label: string, kind: 'human' | 'agent', scope: Scope, t: string | null, d: string | null, roles: Array<{ role: string; scope: Scope }>): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${scope}, ${t}::uuid, ${d}::uuid, ${`b107-rg-${label}-${RUN} (SYNTHETIC)`}, ${`b107rg-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r.role, scope: r.scope, tenantId: r.scope === 'PLATFORM' ? null : t, domainId: r.scope === 'DOMAIN' ? d : null }));
  for (const b of bindings) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
              values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  }
  return h.openSession({ ...h.manager, principalId: id, kind, homeScope: scope, homeTenantId: t, homeDomainId: d, bindings } as AuthenticatedPrincipal);
}

// ── the SYNTHETIC repository registers ─────────────────────────────────────────────────
const HEADER = 'id,volume,chapter,page,clause,family_seed,capability_area,impl_status,verif_status,release_status,phase_origin,package,evidence,remaining_work,notes,source_ref,evidence_scope,cap_alias';
const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
const row = (id: string, vol: string, chapter: string, clause: string, o: { verif?: string; notes?: string; scope?: string } = {}) =>
  [id, vol, q(chapter), '1', q(clause), 'SYN', 'governance', 'partial', o.verif ?? 'unverified', 'merged', 'synthetic', 'P7-D', q('synthetic'), q('synthetic'), q(o.notes ?? ''), 'synthetic', o.scope ?? 'main', ''].join(',');
const R = { inv: `${P}-00-001`, r1: `${P}-06-001`, r2: `${P}-06-002`, r3: `${P}-06-003`, r4: `${P}-06-004`, r5: `${P}-06-005`, pr: `${P}-08-001`, ux: `${P}-36-001`,
            cap: `CAP-${P}-01`, jrn: `JRN-${P}-01`, f1: `F-${P}-01`, f2: `F-${P}-02`, adr: `ADR-${P}-01`, exc: `EXC-${P}-001` };
const CH = { v0: 'SYN ch.1 Doctrine (SYNTHETIC)', v4: 'SYN 6 Traceability (SYNTHETIC)', v8: 'SYN 8 Product Context (SYNTHETIC)', v9: '36 SYN Supply Workspace (SYNTHETIC)' };
function writeRegisters(o: { r2Clause?: string; dropR5?: boolean; ragged?: boolean } = {}): void {
  mkdirSync(join(SYN, 'audit', 'requirements'), { recursive: true }); mkdirSync(join(SYN, 'audit', 'delivery'), { recursive: true });
  writeFileSync(join(SYN, 'audit/requirements/v00-v01.csv'), [HEADER,
    row(R.inv, 'V0', CH.v0, 'The Eye SHALL keep a named human decision authority (SYNTHETIC invariant).', { notes: 'Spec verification class: Test + accountable review.' })].join('\n') + '\n');
  writeFileSync(join(SYN, 'audit/requirements/v04.csv'), [HEADER,
    row(R.r1, 'V4', CH.v4, 'Trace links SHALL be machine-readable and versioned (SYNTHETIC).', { notes: 'Spec verification class: Automated conformance test.' }),
    row(R.r2, 'V4', CH.v4, o.r2Clause ?? 'A forecast contract change SHALL trigger deterministic impact analysis (SYNTHETIC).', { verif: 'passed:harness', scope: 'main+test' }),
    row(R.r3, 'V4', CH.v4, 'Fixtures SHALL carry an expiry (SYNTHETIC).'),
    row(R.r4, 'V4', CH.v4, 'The registry SHALL import rows and SHALL never write them (SYNTHETIC).', { notes: 'Spec verification class: Negative conformance test.' }),
    ...(o.dropR5 === true ? [] : [row(R.r5, 'V4', CH.v4, 'A removed row is retired, never deleted (SYNTHETIC).', { verif: 'passed:ci' })]),
    ...(o.ragged === true ? ['RAGGED-ROW,V4,"too few fields"'] : [])].join('\n') + '\n');
  writeFileSync(join(SYN, 'audit/requirements/v08.csv'), [HEADER,
    row(R.cap, 'V8', 'Appendix A Capability Catalog', 'Predict, Detect, and Warn — supply-chain intelligence workspace (SYNTHETIC).', { verif: 'passed:browser' }),
    row(R.jrn, 'V8', 'Appendix D Canonical User Journey Catalog', 'Release and accept a capability: trace, build, test, assure, deploy, attest (SYNTHETIC).', { verif: 'passed:harness' }),
    row(R.pr, 'V8', CH.v8, 'The product SHALL trace each capability to its evidence (SYNTHETIC).', { verif: 'passed:harness' })].join('\n') + '\n');
  writeFileSync(join(SYN, 'audit/requirements/v09.csv'), [HEADER,
    row(R.cap, 'V9', 'Appendix N Requirement and Cross-Volume Traceability Matrix', `Chapter acceptance footer binds capability ${R.cap} to chapter(s) 36 (SYNTHETIC).`, { verif: 'passed:harness' }),
    row(R.ux, 'V9', CH.v9, 'The workspace SHALL show the supply map (SYNTHETIC).', { verif: 'passed:browser' })].join('\n') + '\n');
  const mapped = [['v00-v01.csv', 'V0', R.inv, R.f1], ['v04.csv', 'V4', R.r1, R.f1], ['v04.csv', 'V4', R.r2, R.f1], ['v04.csv', 'V4', R.r4, R.f1], ['v04.csv', 'V4', R.r5, R.f1],
                  ['v08.csv', 'V8', R.cap, R.f2], ['v08.csv', 'V8', R.jrn, R.f2], ['v08.csv', 'V8', R.pr, R.f2], ['v09.csv', 'V9', R.cap, R.f2], ['v09.csv', 'V9', R.ux, R.f2]];
  writeFileSync(join(SYN, 'audit/delivery/feature-rowmap.csv'), ['file,volume,row_id,feature_id', ...mapped.map((m) => m.join(','))].join('\n') + '\n');
  writeFileSync(join(SYN, 'audit/delivery/FEATURE_TRACKER.csv'), ['feature_id,title,package,volumes,verify_stage,owner,status,stage,rows',
    `${R.f1},"Synthetic traceability feature (SYNTHETIC)",P7-D,V0 V4,H2,,partial,B107,5`, `${R.f2},"Synthetic product feature (SYNTHETIC)",P7-F,V8 V9,H3,,partial,B107,5`].join('\n') + '\n');
  writeFileSync(join(SYN, 'DECISIONS.md'), `# Decisions (SYNTHETIC)\n\n| ID | Title | Status | Date |\n|---|---|---|---|\n| ${R.adr} | Synthetic trace decision | Accepted | 2026-10-15 |\n\n## ${R.adr} — Synthetic trace decision\nTrace links are append-only.\n**Anchors:** ${R.r1}; Vol 3 Ch.4.\n`);
  writeFileSync(join(SYN, 'EXCEPTIONS.md'), `# Exceptions (SYNTHETIC)\n\n## ${R.exc} — Synthetic export exception\n\n\`\`\`yaml\nexception_id:            ${R.exc}\nrequirement_ids:         [${R.r2}]\ntitle:                   Synthetic export-path exception (SYNTHETIC)\nowner:                   Synthetic owner\napprover:                Synthetic approver\nconsequence_class:       C2\ncompensating_controls:\n  - synthetic control\nexpiry_date:             2026-09-30\nstatus:                  open       # controlled enum\n\`\`\`\n`);
}
const importAs = (p: AuthenticatedPrincipal, sources?: string[]) => api.import(preq(p, 'governance.registry.import'), { payload: sources === undefined ? {} : { sources } }) as Promise<{ imported: Row[]; impacts: Row[] }>;
const register = (payload: Row, as = steward) => api.register(preq(as, 'governance.registry.register'), { payload }) as Promise<{ artifact: Row; impact: Row | null }>;
const link = (payload: Row, as = steward) => api.link(preq(as, 'governance.trace.link'), { payload }) as Promise<{ link: Row }>;
const trace = (payload: Row, as = steward) => api.trace(preq(as), { payload }) as Promise<{ trace: Row }>;
const inh = (payload: Row) => api.inheritance(preq(steward), { payload }) as Promise<{ inheritance: Row }>;
const reconcile = (artifacts: Row[], as = steward) => api.reconcile(preq(as, 'governance.trace.check'), { payload: { artifacts } }) as Promise<{ reconciliation: { results: Row[] } }>;
const preview = (changes: Row[], as = steward) => api.impactPreview(preq(as), { payload: { changes } }) as Promise<{ impact: Row }>;
const record = (changes: Row[], expectedDigest: string, trigger = 'change', as = steward) =>
  api.impactRecord(preq(as, 'governance.impact.record'), { payload: { changes, expectedDigest, trigger } }) as Promise<{ impact: Row }>;
const admission = (payload: Row) => api.admission(preq(steward), { payload }) as Promise<{ admission: Row }>;
const orphans = (payload: Row = {}) => api.orphans(preq(steward), { payload }) as Promise<{ orphans: { rules: Row[]; total: number } }>;
const ruleOf = (o: { rules: Row[] }, id: string) => o.rules.find((r) => r['rule_id'] === id) as { count: number; orphans: Row[] };
const keysOf = (rows: unknown) => (rows as Row[]).map((r) => r['key']);
const ingest = (payload: Row, as = steward) => api.ingest(preq(as, 'governance.verification.ingest'), { payload }) as Promise<{ verification: Row }>;
const review = (recordId: string, payload: Row, as = assurance) => api.review(preq(as, 'governance.verification.review'), recordId, { payload }) as Promise<{ review: Row }>;
const fxRegister = (payload: Row, as = builder) => api.registerFixture(preq(as, 'governance.fixture.register'), { payload }) as Promise<{ fixture: Row }>;
const fxApprove = (id: string, payload: Row, as = assurance) => api.approveFixture(preq(as, 'governance.fixture.approve'), id, { payload }) as Promise<{ fixture: Row }>;
const fxQuarantine = (id: string, payload: Row, as = steward) => api.quarantineFixture(preq(as, 'governance.fixture.quarantine'), id, { payload }) as Promise<{ fixture: Row }>;
const vitestReport = (cases: Array<{ title: string; status: string }>, salt: string) => JSON.stringify({ success: cases.every((c) => c.status === 'passed'), startTime: Date.now(), salt,
  testResults: [{ name: `${REPO}/apps/api/test/int/phase6-synthetic-b107.test.ts`, endTime: Date.now(), assertionResults: cases.map((c) => ({ ancestorTitles: ['SYNTHETIC'], title: c.title, fullName: `SYNTHETIC ${c.title}`, status: c.status, duration: 1 })) }] });
const fixtureAttrs = (seed: string, validUntil = new Date(Date.now() + 30 * 86_400_000).toISOString()) => ({
  purpose: 'a synthetic forecast series for the impact harness', generator: 'phase4-helpers syntheticValue()', schema: 'forecast@v1', seed, classification: 'synthetic',
  expected_results: 'the contract test passes on the synthetic series', environment_scope: ['harness'], valid_until: validUntil, builders: [builder.principalId] });

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  const { RegistriesController: C, RegistriesDomainController: DC } = await import('../../src/governance/registries/registries.controller.js');
  api = h.app.get(C); dapi = h.app.get(DC);
  U = uuidv7(); DU = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${U}::uuid, ${'b107-rg-other-' + RUN + ' (SYNTHETIC)'}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${DU}::uuid, ${U}::uuid, ${'b107-rg-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
  steward = await person('steward', 'human', 'PLATFORM', null, null, [{ role: 'conformance_steward', scope: 'PLATFORM' }]);
  builder = await person('builder', 'human', 'PLATFORM', null, null, [{ role: 'conformance_steward', scope: 'PLATFORM' }, { role: 'independent_assurance', scope: 'PLATFORM' }]);
  assurance = await person('assurance', 'human', 'PLATFORM', null, null, [{ role: 'independent_assurance', scope: 'PLATFORM' }]);
  agentSteward = await person('agent-steward', 'agent', 'PLATFORM', null, null, [{ role: 'conformance_steward', scope: 'PLATFORM' }]);
  agentAssurance = await person('agent-assurance', 'agent', 'PLATFORM', null, null, [{ role: 'independent_assurance', scope: 'PLATFORM' }]);
  product = await person('product', 'human', 'PLATFORM', null, null, [{ role: 'product_authority', scope: 'PLATFORM' }]);
  padmin = await person('padmin', 'human', 'PLATFORM', null, null, [{ role: 'platform_admin', scope: 'PLATFORM' }]);
  tadmin = await person('tadmin', 'human', 'TENANT', T, null, [{ role: 'tenant_admin', scope: 'TENANT' }]);
  dadmin = await person('dadmin', 'human', 'DOMAIN', T, D, [{ role: 'domain_admin', scope: 'DOMAIN' }]);
  uadmin = await person('uadmin', 'human', 'DOMAIN', U, DU, [{ role: 'domain_admin', scope: 'DOMAIN' }]);
  SYN = mkdtempSync(join(tmpdir(), 'b107-rg-'));
  writeRegisters();
  process.env['EYE_GOVERNANCE_REPO_ROOT'] = SYN;
}, 300_000);
afterAll(async () => {
  delete process.env['EYE_GOVERNANCE_REPO_ROOT'];
  if (SYN !== '') rmSync(SYN, { recursive: true, force: true });
  await h?.close();
});

describe('RG1 · THE READ-ONLY IMPORT', () => {
  it('POSITIVE: the steward imports the registers — requirements, chapters, the capability and journey, the rowmap, a decision, the engineering exception, the interfaces and schemas; each source digest and the build identity recorded', async () => {
    // B107 integration: the registry is PLATFORM-wide and shared with the other parts' harnesses — the artifacts that exist before this run's
    // first import (another part's copies of an interface / schema / requirement under §RG's identity) are read first
    const pre = new Set((await sql<{ id: string }>`select artifact_id::text as id from governance.artifacts where superseded_at is null`.execute(h.su)).rows.map((x) => x.id));
    const r = await importAs(steward);
    expect(r.imported.map((x) => x['source_path'])).toEqual(['audit/requirements/v00-v01.csv', 'audit/requirements/v04.csv', 'audit/requirements/v08.csv', 'audit/requirements/v09.csv',
      'audit/delivery/feature-rowmap.csv', 'DECISIONS.md', 'EXCEPTIONS.md', 'objects.interface_register', 'objects.schema_registry']);
    expect(r.imported.every((x) => x['unchanged'] === false)).toBe(true);
    // nothing of this run's existed before: nothing of it changed — an import re-versions only a PRE-EXISTING artifact (another part's copy),
    // and only then is an impact recorded (on a registry nobody else wrote, none)
    const importIds = r.imported.map((x) => String(x['import_id']));
    const changed = (await sql<{ id: string }>`select distinct unnest(changed)::text as id from governance.rg_imports where import_id = any(${importIds}::uuid[])`.execute(h.su)).rows.map((x) => x.id);
    expect(changed.filter((id) => !pre.has(id))).toEqual([]);
    expect(r.impacts).toHaveLength(changed.length === 0 ? 0 : 1);
    expect(await cur('requirement', `V4:${R.r2}`)).toMatchObject({ version: 1, lifecycle: 'active', attributes: { verification_method: 'executed (harness)', verification_basis: 'register_status', mandatory: true } });
    expect(await cur('requirement', `V4:${R.r4}`)).toMatchObject({ attributes: { obligations: 2 } });
    expect(await cur('capability', R.cap)).toMatchObject({ version: 1 });
    expect(await cur('journey', R.jrn)).toMatchObject({ version: 1 });
    expect(await cur('exception', `EXCEPTIONS.md:${R.exc}`)).toMatchObject({ lifecycle: 'active', attributes: { class: 'engineering', expiry_date: '2026-09-30' } });
    // the interface register's 50 rows (scoped to the register's source: another part may register an interface of its own)
    expect(await n(sql`select count(*)::int as n from governance.artifacts where kind = 'interface' and superseded_at is null and source->>'path' = 'objects.interface_register'`)).toBe(50);
    expect(await n(sql`select count(*)::int as n from governance.links_live l where l.from_artifact = ${await aid('capability', R.cap)}::uuid and l.relation = 'maps_to'`)).toBe(3); // V8 row, V9 row, V9 chapter 36
    const imp = await one(sql`select source_digest, build_identity, counts from governance.rg_imports where source_path = 'audit/requirements/v04.csv'`);
    expect(imp['source_digest']).toBe(sha(readFileSync(join(SYN, 'audit/requirements/v04.csv'))));
    expect(imp['build_identity']).toMatchObject({ migration_head: readdirSync(join(__dirname, '../../migrations')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort().at(-1), policy_bundle: 'bundle-v1', manifest_path: 'conformance.manifest.json' });
    expect(imp['counts']).toMatchObject({ registered: 6, links_added: 5 }); // 5 rows + 1 chapter; 5 part_of
  });
  it('IDEMPOTENT: the same registers again write nothing — every source unchanged; no import, artifact or link row added', async () => {
    const before = await one(sql`select (select count(*) from governance.rg_imports)::int as i, (select count(*) from governance.artifacts)::int as a, (select count(*) from governance.links)::int as l`);
    const r = await importAs(steward);
    expect(r.imported.every((x) => x['unchanged'] === true)).toBe(true);
    // an agent holding the steward role may run the import (it drafts nothing and approves nothing): unchanged again
    expect((await importAs(agentSteward, ['requirements'])).imported.every((x) => x['unchanged'] === true)).toBe(true);
    expect(await one(sql`select (select count(*) from governance.rg_imports)::int as i, (select count(*) from governance.artifacts)::int as a, (select count(*) from governance.links)::int as l`)).toEqual(before);
  });
  it('UNAUTHORIZED-ROLE and NEGATIVE: a product authority (PDP 403), a tenant administrator at the PLATFORM route (refused), a malformed register (422 — nothing written)', async () => {
    expect(await refusal(importAs(product))).toMatchObject({ status: 403 });
    expect((await refusal(importAs(tadmin))).status).not.toBe('ok');
    writeRegisters({ ragged: true });
    const before = await n(sql`select count(*)::int as n from governance.rg_imports`);
    const r = await refusal(importAs(steward, ['requirements']));
    expect(r).toMatchObject({ status: 422 }); expect(r.message).toMatch(/^requirement registry rejected \(source\): .*v04\.csv.*has 3 fields/);
    expect(await n(sql`select count(*)::int as n from governance.rg_imports`)).toBe(before);
    writeRegisters();
  });
  it('FAULT EXERCISE + RECOVERY: a database refusal mid-source (an identity planted under another id) rolls the whole source back — then the corrected state imports', async () => {
    const planted = uuidv7(); const key = `V4:${P}-06-099`;
    await sql`insert into governance.artifacts (artifact_id, version, scope, kind, external_key, title, digest, recorded_by, correlation_id)
              values (${planted}::uuid, 1, 'PLATFORM', 'requirement', ${key}, 'a conflicting identity (SYNTHETIC fault)', ${'f'.repeat(64)}, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const v04 = readFileSync(join(SYN, 'audit/requirements/v04.csv'), 'utf8');
    writeFileSync(join(SYN, 'audit/requirements/v04.csv'), v04 + row(`${P}-06-099`, 'V4', CH.v4, 'A fault row (SYNTHETIC).', { verif: 'passed:ci' }) + '\n');
    const r2before = await cur('requirement', `V4:${R.r2}`);
    const r = await refusal(importAs(steward, ['requirements']));
    expect(r.message).toMatch(/^requirement registry rejected \(duplicate\): requirement V4:S.*-06-099 is registered under another identity/); expect(r).toMatchObject({ status: 409 });
    expect(await cur('requirement', `V4:${R.r2}`)).toEqual(r2before); // nothing partial
    expect(await n(sql`select count(*)::int as n from governance.artifacts where external_key = ${`V4:${P}-06-099`} and artifact_id <> ${planted}::uuid`)).toBe(0);
    await sql`update governance.artifacts set superseded_at = clock_timestamp(), lifecycle = 'retired' where artifact_id = ${planted}::uuid`.execute(h.su);
    writeFileSync(join(SYN, 'audit/requirements/v04.csv'), v04);
    expect((await importAs(steward, ['requirements'])).imported.find((x) => x['source_path'] === 'audit/requirements/v04.csv')).toMatchObject({ unchanged: true });
  });
});

describe('RG2 · THE NORMATIVE-ARTIFACT REGISTRY AND THE CONTROL ORDER', () => {
  it('POSITIVE: a component, the forecast contract (schema) and a DERIVED requirement (its parent controls it and is not weakened) — authority, owner, version, effective time', async () => {
    const c = await register({ kind: 'component', key: `CMP-${P}-forecast`, title: 'Forecast service component (SYNTHETIC)', authorityClass: 'implementation', ownerRole: 'conformance_steward' });
    expect(c.artifact).toMatchObject({ version: 1, changed: true, created: true }); expect(c.impact).toBeNull();
    await register({ kind: 'schema', key: `forecast-contract@${P}`, title: 'The forecast contract (SYNTHETIC)', authorityClass: 'implementation', ownerRole: 'conformance_steward', attributes: { contract: 'forecast v1' } });
    await register({ kind: 'requirement', key: `V4:${P}-06-010`, title: 'A derived trace requirement (SYNTHETIC)', authorityClass: 'engineering', volume: 'V4',
                     parent: await aid('requirement', `V4:${R.r1}`), ownerRole: 'conformance_steward',
                     attributes: { mandatory: true, obligation: 'SHALL', obligations: 1, verification_method: 'Automated conformance test' } });
    expect(await n(sql`select count(*)::int as n from governance.links_live where from_artifact = ${await aid('requirement', `V4:${P}-06-010`)}::uuid and relation = 'derives_from'`)).toBe(1);
    const again = await register({ kind: 'component', key: `CMP-${P}-forecast`, expectedVersion: 1, title: 'Forecast service component (SYNTHETIC)', authorityClass: 'implementation', ownerRole: 'conformance_steward' });
    expect(again.artifact).toMatchObject({ changed: false, version: 1 });
  });
  it('NEGATIVE: PR-08-003 (a V8 row never claims a higher authority), ES-03-001 (no method), ES-03-002 (compound), ES-03-003 (weakens; a lower parent), supersession upward, another part\'s kind, no owner; STALE version', async () => {
    const base = { kind: 'requirement', authorityClass: 'product', volume: 'V8', ownerRole: 'product_authority', attributes: { mandatory: true, obligation: 'SHALL', obligations: 1, verification_method: 'Test' } };
    let r = await refusal(register({ ...base, key: `V8:${P}-08-090`, title: 'claims the constitution (SYNTHETIC)', authorityClass: 'constitutional' }));
    expect(r).toMatchObject({ status: 422 }); expect(r.message).toMatch(/rejected \(control_order\): a V8 row carries product authority — it never claims constitutional/);
    r = await refusal(register({ ...base, key: `V8:${P}-08-091`, title: 'no method (SYNTHETIC)', attributes: { mandatory: true, obligations: 1 } }));
    expect(r.message).toMatch(/\(verification_method\)/);
    r = await refusal(register({ ...base, key: `V8:${P}-08-092`, title: 'compound (SYNTHETIC)', attributes: { ...base.attributes, obligations: 2 } }));
    expect(r.message).toMatch(/\(compound\)/);
    const parent = String((await register({ kind: 'requirement', key: `V4:${P}-06-008`, title: 'A parent with a threshold (SYNTHETIC)', authorityClass: 'engineering', volume: 'V4', ownerRole: 'conformance_steward',
      attributes: { mandatory: true, obligation: 'SHALL', obligations: 1, verification_method: 'Automated conformance test', threshold: { value: 0.9, direction: 'min' } } })).artifact['artifact_id']);
    r = await refusal(register({ kind: 'requirement', key: `V4:${P}-06-011`, title: 'weaker (SYNTHETIC)', authorityClass: 'engineering', volume: 'V4', ownerRole: 'conformance_steward', parent,
                                  attributes: { mandatory: true, obligation: 'SHALL', obligations: 1, verification_method: 'Test', threshold: { value: 0.5, direction: 'min' } } }));
    expect(r).toMatchObject({ status: 422 }); expect(r.message).toMatch(/\(weakens\): the threshold 0\.5 \(min\) is weaker than the parent's 0\.9/);
    r = await refusal(register({ kind: 'requirement', key: `V4:${P}-06-012`, title: 'derives from a lower authority (SYNTHETIC)', authorityClass: 'engineering', volume: 'V4', ownerRole: 'conformance_steward',
                                  parent: await aid('requirement', `V8:${R.pr}`), attributes: { mandatory: false } }));
    expect(r.message).toMatch(/\(control_order\): engineering authority never derives from product authority/);
    r = await refusal(register({ kind: 'standard', key: `V8:${P}:standard-x`, title: 'supersedes upward (SYNTHETIC)', authorityClass: 'product', volume: 'V8', ownerRole: 'product_authority',
                                  supersedes: await aid('standard', `V4:chapter:${CH.v4}`) }));
    expect(r.message).toMatch(/\(control_order\): product authority never supersedes engineering authority/);
    r = await refusal(register({ kind: 'exception', key: `X-${P}`, title: 'another part\'s kind (SYNTHETIC)', authorityClass: 'project_exception', ownerRole: 'product_authority' }));
    expect(r.message).toMatch(/\(kind\): exception is registered by its own part/);
    r = await refusal(register({ kind: 'component', key: `CMP-${P}-ownerless`, title: 'no owner (SYNTHETIC)', authorityClass: 'implementation' }));
    expect(r.message).toMatch(/\(owner\)/);
    r = await refusal(register({ kind: 'component', key: `CMP-${P}-forecast`, expectedVersion: 0, title: 'stale (SYNTHETIC)', authorityClass: 'implementation', ownerRole: 'conformance_steward' }));
    expect(r).toMatchObject({ status: 409 }); expect(r.message).toMatch(/\(stale\): .* is at version 1, not 0/);
  });
  it('RECOVERY + REPLAY: a supersession within its class — the superseded stays resolvable as of its time; a retired identity is never reused (ADR-004)', async () => {
    const old = await register({ kind: 'policy_bundle', key: `bundle-${P}-a`, title: 'Policy bundle A (SYNTHETIC)', authorityClass: 'implementation', ownerRole: 'conformance_steward' });
    const t0 = await dbNow();
    const nu = await register({ kind: 'policy_bundle', key: `bundle-${P}-b`, title: 'Policy bundle B (SYNTHETIC)', authorityClass: 'implementation', ownerRole: 'conformance_steward', supersedes: String(old.artifact['artifact_id']) });
    expect((nu.artifact['changed_artifacts'] as string[])).toContain(String(old.artifact['artifact_id']));
    const res = (await api.resolve(preq(steward), { payload: { kind: 'policy_bundle', key: `bundle-${P}-a`, asOf: t0 } }) as { resolution: Row }).resolution;
    expect(res['in_force']).toMatchObject({ version: 1, lifecycle: 'active' });
    expect((res['versions'] as Row[]).map((v) => v['lifecycle'])).toEqual(['active', 'superseded']);
    const r = await refusal(register({ kind: 'policy_bundle', key: `bundle-${P}-a`, expectedVersion: 2, title: 'reuse (SYNTHETIC)', authorityClass: 'implementation', ownerRole: 'conformance_steward' }));
    expect(r.message).toMatch(/\(state\): .* was superseded; a retired identity is never reused \(ADR-004\)/);
  });
});

describe('RG3 · TRACE LINKS — BIDIRECTIONAL, VERSIONED, APPEND-ONLY, AS OF', () => {
  it('POSITIVE: the V4 chapter anchored to the constitutional invariant; the component implements the requirement and consumes the contract; the trace answers up and down', async () => {
    const chapter = await aid('standard', `V4:chapter:${CH.v4}`); const inv = await aid('requirement', `V0:${R.inv}`);
    const l = await link({ from: chapter, to: inv, relation: 'derives_from', reason: 'the chapter inherits the human-authority invariant (SYNTHETIC)' });
    expect(l.link).toMatchObject({ created: true, relation: 'derives_from' });
    const attrs = (await one(sql`select attributes from governance.links where link_id = ${String(l.link['link_id'])}::uuid`))['attributes'] as Row;
    expect(attrs).toMatchObject({ from_version: 1, to_version: 1, from_digest: expect.stringMatching(/^[0-9a-f]{64}$/), source: 'recorded' });
    const comp = await aid('component', `CMP-${P}-forecast`);
    await link({ from: comp, to: await aid('requirement', `V4:${R.r2}`), relation: 'implements', reason: 'the forecast service realises the impact requirement (SYNTHETIC)' });
    await link({ from: comp, to: await aid('schema', `forecast-contract@${P}`), relation: 'consumes', reason: 'the service is bound to the forecast contract (SYNTHETIC)' });
    const t = (await trace({ kind: 'component', key: `CMP-${P}-forecast`, depth: 6 })).trace;
    expect(keysOf((t['up'] as Row)['nodes'])).toEqual(expect.arrayContaining([`V4:${R.r2}`, `forecast-contract@${P}`, `V4:chapter:${CH.v4}`, `V0:${R.inv}`]));
    const down = (await trace({ kind: 'requirement', key: `V4:${R.r2}`, depth: 3 })).trace['down'] as Row;
    expect(keysOf(down['nodes'])).toEqual(expect.arrayContaining([R.f1, `CMP-${P}-forecast`, `EXCEPTIONS.md:${R.exc}`]));
    expect(await n(sql`select count(*)::int as n from governance.events where event = 'trace.linked' and details->>'from' = ${`CMP-${P}-forecast`}`)).toBe(2);
  });
  it('NEGATIVE: the control order (the constitution never derives from a chapter), a cycle, another tenant\'s record (CROSS-TENANT), a duplicate, a relation the kinds do not admit, an unknown artifact', async () => {
    const chapter = await aid('standard', `V4:chapter:${CH.v4}`); const inv = await aid('requirement', `V0:${R.inv}`); const comp = await aid('component', `CMP-${P}-forecast`);
    let r = await refusal(link({ from: inv, to: chapter, relation: 'derives_from', reason: 'upside down (SYNTHETIC)' }));
    expect(r).toMatchObject({ status: 422 }); expect(r.message).toMatch(/^trace link rejected \(control_order\)/);
    const a = await aid('requirement', `V4:${R.r1}`); const b = await aid('requirement', `V4:${P}-06-010`);
    r = await refusal(link({ from: a, to: b, relation: 'derives_from', reason: 'closes a cycle (SYNTHETIC)' }));
    expect(r.message).toMatch(/\(circular\)|\(weakens\)/);
    const foreign = uuidv7();
    await sql`insert into governance.artifacts (artifact_id, version, scope, tenant_id, domain_id, kind, external_key, title, digest, recorded_by, correlation_id)
              values (${foreign}::uuid, 1, 'DOMAIN', ${U}::uuid, ${DU}::uuid, 'data_product', ${'foreign-' + RUN}, 'another tenant''s product (SYNTHETIC)', ${'e'.repeat(64)}, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    r = await refusal(link({ from: comp, to: foreign, relation: 'depends_on', reason: 'reaches into a tenant (SYNTHETIC)' }));
    expect(r.message).toMatch(/\(scope\): the vendor's registry links only its own \(PLATFORM\) artifacts/);
    r = await refusal(link({ from: comp, to: await aid('requirement', `V4:${R.r2}`), relation: 'implements', reason: 'again (SYNTHETIC)' }));
    expect(r).toMatchObject({ status: 409 }); expect(r.message).toMatch(/\(duplicate\)/);
    r = await refusal(link({ from: comp, to: a, relation: 'verifies', reason: 'a component verifies nothing (SYNTHETIC)' }));
    expect(r.message).toMatch(/\(relation\): only a test or a verification record verifies/);
    r = await refusal(link({ from: comp, to: uuidv7(), relation: 'depends_on', reason: 'nothing there (SYNTHETIC)' }));
    expect(r).toMatchObject({ status: 404 });
    // ES-06-005: the links are audit evidence — append-only at the database
    await expect(sql`update governance.links set relation = 'cites' where from_artifact = ${comp}::uuid`.execute(h.su)).rejects.toThrow(/append-only|append only/i);
  });
  it('RECOVERY + REPLAY: a recorded link retired by a later row (an imported one is the source\'s — refused); the trace AS OF before the link still shows it', async () => {
    const comp = await aid('component', `CMP-${P}-forecast`); const r4 = await aid('requirement', `V4:${R.r4}`);
    const l = await link({ from: comp, to: r4, relation: 'depends_on', reason: 'a temporary dependency (SYNTHETIC)' });
    const t1 = await dbNow();
    await api.retire(preq(steward, 'governance.trace.link'), String(l.link['link_id']), { payload: { reason: 'the dependency was declared in error (SYNTHETIC)' } });
    expect(keysOf(((await trace({ artifactId: comp, depth: 1 })).trace['up'] as Row)['nodes'])).not.toContain(`V4:${R.r4}`);
    expect(keysOf(((await trace({ artifactId: comp, depth: 1, asOf: t1 })).trace['up'] as Row)['nodes'])).toContain(`V4:${R.r4}`);
    const imported = String((await one(sql`select link_id::text as id from governance.links_live where attributes->>'source' = 'audit/delivery/feature-rowmap.csv' limit 1`))['id']);
    const r = await refusal(api.retire(preq(steward, 'governance.trace.link'), imported, { payload: { reason: 'try to retire an imported link (SYNTHETIC)' } }));
    expect(r.message).toMatch(/\(state\): this link is declared by audit\/delivery\/feature-rowmap\.csv — the source is authoritative/);
  });
});

describe('RG4 · ORPHANS — LISTED, NEVER HIDDEN', () => {
  it('the unmapped requirement (RG-O01), the method-less mandatory requirement (RG-V01), the unanchored chapters (RG-O03) — counted and listed; a recorded link clears one', async () => {
    let o = (await orphans()).orphans;
    // (the full RG-O01 list: the other parts' requirements may precede this run's keys in the first page)
    expect(keysOf(ruleOf((await orphans({ rule: 'RG-O01', limit: 500 })).orphans, 'RG-O01').orphans)).toContain(`V4:${R.r3}`);
    const v01 = (await orphans({ rule: 'RG-V01', limit: 500 })).orphans;
    expect(keysOf(ruleOf(v01, 'RG-V01').orphans)).toContain(`V4:${R.r3}`);
    expect(keysOf(ruleOf(v01, 'RG-V01').orphans)).not.toContain(`V4:${R.r2}`); // executed (harness): a method
    const o3 = (await orphans({ rule: 'RG-O03', limit: 500 })).orphans;
    expect(keysOf(ruleOf(o3, 'RG-O03').orphans)).toEqual(expect.arrayContaining([`V8:chapter:${CH.v8}`, 'V8:chapter:Appendix A Capability Catalog']));
    expect(keysOf(ruleOf(o3, 'RG-O03').orphans)).not.toContain(`V4:chapter:${CH.v4}`); // anchored in RG3
    expect(keysOf(ruleOf(o3, 'RG-O03').orphans)).not.toContain(`V0:chapter:${CH.v0}`); // constitutional: the anchor itself
    expect(o.total).toBeGreaterThanOrEqual(ruleOf(o, 'RG-O01').count);
    await link({ from: await aid('feature', R.f1), to: await aid('requirement', `V4:${R.r3}`), relation: 'implements', reason: 'the feature carries the fixture-expiry row (SYNTHETIC)' });
    o = (await orphans({ rule: 'RG-O01', limit: 500 })).orphans;
    expect(keysOf(ruleOf(o, 'RG-O01').orphans)).not.toContain(`V4:${R.r3}`);
    expect((await refusal(api.orphans(preq(steward), { payload: { rule: 'nope' } }))).status).toBe(422);
  });
});

let fixtureId = ''; let recordId = ''; let recordDigest = ''; const TEST_TITLE = `${R.r2} the forecast contract test`; let FX41: Row = {};
describe('RG5 · THE FIXTURE REGISTRY AND THE VERIFICATION RECORD', () => {
  it('fixtures: registered PROPOSED; refused privacy-unsafe; approved by independent assurance — never a builder (SoD), never an agent (the PEP)', async () => {
    const r = await refusal(fxRegister({ key: `fx-${RUN.toLowerCase()}-series`, title: 'unsafe (SYNTHETIC)', reason: 'a privacy-unsafe fixture', attributes: { ...fixtureAttrs('1'), classification: 'customer_copy' } }));
    expect(r.message).toMatch(/^governance fixture rejected \(classification\)/);
    FX41 = fixtureAttrs('41');
    const f = (await fxRegister({ key: `fx-${RUN.toLowerCase()}-series`, title: 'Synthetic forecast series (SYNTHETIC)', reason: 'the contract test needs a series', attributes: FX41 })).fixture;
    expect(f).toMatchObject({ lifecycle: 'proposed', version: 1 }); fixtureId = String(f['artifact_id']);
    const fx = await cur('fixture', `fx-${RUN.toLowerCase()}-series`);
    expect(await refusal(fxApprove(fixtureId, { version: 1, digest: fx['digest'], reason: 'I built it and approve it' }, builder))).toMatchObject({ status: 403, message: expect.stringMatching(/\(separation_of_duties\)/) });
    expect(await refusal(fxApprove(fixtureId, { version: 1, digest: fx['digest'], reason: 'an agent approving' }, agentAssurance))).toMatchObject({ status: 403 });
    expect(await refusal(fxApprove(fixtureId, { version: 1, digest: fx['digest'], reason: 'steward is no assurance' }, steward))).toMatchObject({ status: 403 });
    expect(await refusal(fxApprove(fixtureId, { version: 1, digest: 'a'.repeat(64), reason: 'a stale digest named' }))).toMatchObject({ status: 409 });
    expect((await fxApprove(fixtureId, { version: 1, digest: fx['digest'], reason: 'independent review of the generator' })).fixture).toMatchObject({ lifecycle: 'active', version: 2 });
  });
  it('ingest: a vitest report → `evidence` + `test` artifacts, the cited requirement VERIFIED by exact id, the three dimensions; the same report again is the same record; refusals', async () => {
    const rep = vitestReport([{ title: TEST_TITLE, status: 'passed' }, { title: 'an uncited case', status: 'passed' }], 'one');
    const v = (await ingest({ format: 'vitest', name: 'synthetic forecast contract run (SYNTHETIC)', report: rep, fixtures: [`fx-${RUN.toLowerCase()}-series`] })).verification;
    expect(v).toMatchObject({ duplicate: false, record: { result: 'passed', claim: 'construction', totals: { cases: 2, passed: 2 } } });
    recordId = String((v['record'] as Row)['record_id']); recordDigest = String((v['record'] as Row)['source_digest']);
    const rec = v['record'] as Row;
    expect(rec['identity']).toMatchObject({ runner: 'vitest', files: ['apps/api/test/int/phase6-synthetic-b107.test.ts'], build: { policy_bundle: 'bundle-v1' } });
    expect(rec['validity']).toMatchObject({ population: 2, coverage: 'not measured by this record' });
    const test = await aid('test', `test:apps/api/test/int/phase6-synthetic-b107.test.ts#SYNTHETIC ${TEST_TITLE}`);
    expect(await n(sql`select count(*)::int as n from governance.links_live where from_artifact = ${test}::uuid and relation = 'verifies' and to_artifact = ${await aid('requirement', `V4:${R.r2}`)}::uuid`)).toBe(1);
    expect(await n(sql`select count(*)::int as n from governance.links_live where from_artifact = ${test}::uuid and relation = 'consumes' and to_artifact = ${fixtureId}::uuid`)).toBe(1);
    expect((await ingest({ format: 'vitest', name: 'again', report: rep })).verification).toMatchObject({ duplicate: true });
    expect(await refusal(ingest({ format: 'vitest', name: 'x', report: rep }, product))).toMatchObject({ status: 403 });
    expect((await refusal(ingest({ format: 'vitest', name: 'x', report: vitestReport([{ title: 'x', status: 'passed' }], 'u'), fixtures: ['fx-none'] }))).message).toMatch(/\(unknown_fixture\)/);
    expect((await refusal(ingest({ format: 'vitest', name: 'x', report: JSON.stringify({ testResults: [] }) }))).message).toMatch(/\(cases\)/);
    expect((await refusal(ingest({ format: 'vitest', name: 'x', report: rep, claim: 'acceptance' }))).message).toMatch(/\(claim\)/);
    // the steward links the test to the component (the contract test verifies the forecast service)
    await link({ from: test, to: await aid('component', `CMP-${P}-forecast`), relation: 'verifies', reason: 'the contract test exercises the service (SYNTHETIC)' });
  });
  it('review: independent assurance accepts on the exact digest; the ingester (also assurance) is refused (SoD), an agent (PEP), a stale digest, a second review by the same reviewer', async () => {
    const asBuilder = (await ingest({ format: 'gate_receipt', name: 'synthetic gate receipt (SYNTHETIC)', report: JSON.stringify({ schema_version: 'syn/1', head_sha: 'abc1234', conclusion: 'success', job: `gate-${RUN}` }) }, builder)).verification;
    const bRec = asBuilder['record'] as Row;
    expect(bRec).toMatchObject({ result: 'passed' });
    expect(await refusal(review(String(bRec['record_id']), { decision: 'accepted', digest: bRec['source_digest'], reason: 'my own record' }, builder))).toMatchObject({ status: 403, message: expect.stringMatching(/\(separation_of_duties\)/) });
    expect(await refusal(review(recordId, { decision: 'accepted', digest: recordDigest, reason: 'agent review' }, agentAssurance))).toMatchObject({ status: 403 });
    expect(await refusal(review(recordId, { decision: 'accepted', digest: 'b'.repeat(64), reason: 'wrong digest' }))).toMatchObject({ status: 409 });
    expect((await review(recordId, { decision: 'accepted', digest: recordDigest, reason: 'the cases cite the rows they verify' })).review).toMatchObject({ decision: 'accepted' });
    expect(await refusal(review(recordId, { decision: 'accepted', digest: recordDigest, reason: 'a second review by the same reviewer' }))).toMatchObject({ status: 409 });
    const unstated = (await ingest({ format: 'gate_receipt', name: 'a receipt without a result (SYNTHETIC)', report: JSON.stringify({ schema_version: 'syn/2', head_sha: 'abc1234', run: RUN }) })).verification;
    expect(unstated['record']).toMatchObject({ result: 'unstated' });
  });
  it('STALE + CORRECTION: the fixture QUARANTINED (contaminated) invalidates the record and names the re-run; evidence on it refused; the rebuild must change content; rebuilt, approved, re-run → current', async () => {
    const q = (await fxQuarantine(fixtureId, { reasonClass: 'contaminated', reason: 'a customer value leaked into the synthetic series (SYNTHETIC drill)' })).fixture;
    expect(q).toMatchObject({ lifecycle: 'quarantined', invalidated: [recordId] });
    expect((q['rerun'] as string[])).toContain(`test:apps/api/test/int/phase6-synthetic-b107.test.ts#SYNTHETIC ${TEST_TITLE}`);
    const test = await aid('test', `test:apps/api/test/int/phase6-synthetic-b107.test.ts#SYNTHETIC ${TEST_TITLE}`);
    expect(await one(sql`select governance.rg_test_evidence(${test}::uuid) as e`)).toMatchObject({ e: { current: false, invalidated: true } });
    expect(await refusal(ingest({ format: 'vitest', name: 'x', report: vitestReport([{ title: TEST_TITLE, status: 'passed' }], 'q'), fixtures: [`fx-${RUN.toLowerCase()}-series`] }))).toMatchObject({ status: 409 });
    const same = await refusal(fxRegister({ key: `fx-${RUN.toLowerCase()}-series`, expectedVersion: 3, title: 'Synthetic forecast series (SYNTHETIC)', reason: 'rebuild as is', attributes: FX41 }));
    expect(same.message).toMatch(/\(rebuild\)/);
    const rb = (await fxRegister({ key: `fx-${RUN.toLowerCase()}-series`, expectedVersion: 3, title: 'Synthetic forecast series (SYNTHETIC)', reason: 'rebuilt from the generator, new seed', attributes: fixtureAttrs('42') })).fixture;
    expect(rb).toMatchObject({ lifecycle: 'proposed', rebuilt: true, version: 4 });
    const now = await cur('fixture', `fx-${RUN.toLowerCase()}-series`);
    await fxApprove(fixtureId, { version: 4, digest: now['digest'], reason: 'the rebuilt series reviewed' });
    const re = (await ingest({ format: 'vitest', name: 'the re-run (SYNTHETIC)', report: vitestReport([{ title: TEST_TITLE, status: 'passed' }], 'rerun'), fixtures: [`fx-${RUN.toLowerCase()}-series`] })).verification;
    expect(re['record']).toMatchObject({ result: 'passed' });
    expect(await one(sql`select governance.rg_test_evidence(${test}::uuid) as e`)).toMatchObject({ e: { current: true } });
  });
  it('the SWEEP: an expired fixture is quarantined as stale (read first, then written)', async () => {
    const k = `fx-${RUN.toLowerCase()}-short`;
    const f = (await fxRegister({ key: k, title: 'Short-lived series (SYNTHETIC)', reason: 'expires within the harness', attributes: fixtureAttrs('7', new Date(Date.now() + 1500).toISOString()) })).fixture;
    await new Promise((res) => setTimeout(res, 1800));
    const s = await api.sweep(preq(steward, 'governance.fixture.quarantine')) as { expired: number; quarantined: Row[] };
    expect(s.quarantined.map((x) => x['key'])).toContain(k);
    expect(await cur('fixture', k)).toMatchObject({ lifecycle: 'quarantined', attributes: { quarantine: { class: 'stale' } } });
    expect(String(f['artifact_id'])).toBe(await aid('fixture', k));
  });
});

let rc = ''; let briefing = '';
describe('RG6 · DETERMINISTIC CHANGE IMPACT — the forecast contract changes', () => {
  it('setup: a release candidate deploys the component (§CM\'s record, planted); the domain administrator declares a NORDWERK-style briefing citing the contract — another tenant refused (CROSS-TENANT)', async () => {
    rc = uuidv7();
    await sql`insert into governance.artifacts (artifact_id, version, scope, kind, external_key, title, authority_class, owner_role, digest, recorded_by, correlation_id)
              values (${rc}::uuid, 1, 'PLATFORM', 'release_candidate', ${'rc-' + RUN}, 'Release candidate (SYNTHETIC; §CM substitute for B65 — not a release)', 'implementation', 'conformance_steward', ${'c'.repeat(64)}, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    await link({ from: rc, to: await aid('component', `CMP-${P}-forecast`), relation: 'deploys', reason: 'the candidate deploys the forecast service (SYNTHETIC)' });
    briefing = uuidv7();
    await sql`insert into executive.briefings (briefing_id, scope, tenant_id, domain_id, composed_by, composed_via, known_at, watermark, sources, items, windows, content_digest, header_digest, correlation_id)
              values (${briefing}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, ${dadmin.principalId}::uuid, 'human', clock_timestamp(), '{}'::jsonb, '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, ${'d'.repeat(64)}, ${'d'.repeat(64)}, ${uuidv7()}::uuid)`.execute(h.su);
    const decl = (as: AuthenticatedPrincipal, t: string, d: string, object = briefing) => dapi.declare(dreq(as, t, d, 'governance.trace.domain_cite'), t, d,
      { payload: { productKind: 'briefing', objectId: object, title: 'Supply-risk briefing (SYNTHETIC)', cites: [{ kind: 'schema', key: `forecast-contract@${P}` }], reason: 'the briefing cites the forecast contract' } }) as Promise<{ product: Row }>;
    expect((await decl(dadmin, T, D)).product).toMatchObject({ key: `briefing:${briefing}` });
    expect((await decl(dadmin, T, D)).product).toMatchObject({ unchanged: true });
    expect((await refusal(decl(uadmin, T, D))).status).not.toBe('ok');                           // another tenant's administrator: never in this domain
    expect(await refusal(decl(uadmin, U, DU))).toMatchObject({ status: 404 });                    // T's briefing is not in U's domain
  });
  let shown = '';
  it('PREVIEW: ordered dependents (the component, the briefing, the candidate, the test and its evidence), the requirements to re-verify, ONE digest — the same input gives the same digest', async () => {
    const changes = [{ kind: 'schema', key: `forecast-contract@${P}`, proposedDigest: 'e'.repeat(64) }];
    const a = (await preview(changes)).impact; const b = (await preview(changes)).impact;
    expect(a['digest']).toBe(b['digest']); expect(a['dependents']).toEqual(b['dependents']);
    shown = String(a['digest']);
    const deps = a['dependents'] as Row[];
    expect(deps.map((d) => [d['depth'], d['kind']])).toEqual(expect.arrayContaining([[1, 'component'], [1, 'data_product'], [2, 'release_candidate'], [2, 'test'], [3, 'evidence']]));
    const order = deps.map((d) => `${String(d['depth'])}|${String(d['kind'])}|${String(d['key'])}`);
    expect(order).toEqual([...order].sort((x, y) => (Number(x.split('|')[0]) - Number(y.split('|')[0])) || x.localeCompare(y)));
    expect(keysOf(a['decision_active'])).toEqual([`briefing:${briefing}`]);
    expect((a['decision_active'] as Row[])[0]).toMatchObject({ scope: 'DOMAIN', tenant_id: T });
    expect(keysOf(a['requirements_to_reverify'])).toContain(`V4:${R.r2}`);
    expect(keysOf(a['release_candidates'])).toEqual([`rc-${RUN}`]);
    expect((a['stale_verifications'] as Row[]).some((s) => s['kind'] === 'test')).toBe(true);
    // a different proposal is a different input: a different digest
    expect((await preview([{ kind: 'schema', key: `forecast-contract@${P}`, proposedDigest: 'f'.repeat(64) }])).impact['digest']).not.toBe(shown);
  });
  it('RECORD on the digest shown — the candidate HELD (evidence_stale); STALE when the links moved; refused to a non-steward', async () => {
    const changes = [{ kind: 'schema', key: `forecast-contract@${P}`, proposedDigest: 'e'.repeat(64) }];
    expect(await refusal(record(changes, shown, 'change', product))).toMatchObject({ status: 403 });
    const r = (await record(changes, shown)).impact;
    expect(r).toMatchObject({ digest: shown, trigger: 'change' });
    expect((r['held'] as Row[]).map((x) => x['key'])).toEqual([`rc-${RUN}`]);
    expect(await n(sql`select count(*)::int as n from governance.holds where subject_artifact = ${rc}::uuid and lifted_at is null and reason_kind = 'evidence_stale'`)).toBe(1);
    // the recorded impact is an analysis of the contract, never one of its dependents: the preview answers the same digest
    expect((await preview(changes)).impact['digest']).toBe(shown);
    await link({ from: await aid('component', `CMP-${P}-forecast`), to: await aid('requirement', `V4:${R.r4}`), relation: 'depends_on', reason: 'a new dependency moves the impact (SYNTHETIC)' });
    expect(await refusal(record(changes, shown))).toMatchObject({ status: 409, message: expect.stringMatching(/^change impact rejected \(stale\)/) });
    expect(await refusal(preview([{ kind: 'schema', key: 'no-such-contract' }]))).toMatchObject({ status: 404 });
  });
  it('a PROPOSAL holds nothing; a re-run of the stale test lifts the candidate\'s hold (RECOVERY)', async () => {
    const changes = [{ kind: 'schema', key: `forecast-contract@${P}`, proposedDigest: 'a'.repeat(64) }];
    const p = (await record(changes, String((await preview(changes)).impact['digest']), 'proposal')).impact;
    expect(p['held']).toEqual([]);
    let rec = (await reconcile([{ artifactId: rc }])).reconciliation.results[0]!;
    expect(rec['still_open']).toHaveLength(1);
    await ingest({ format: 'vitest', name: 'the re-run after the contract change (SYNTHETIC)', report: vitestReport([{ title: TEST_TITLE, status: 'passed' }], 'after-impact'), fixtures: [`fx-${RUN.toLowerCase()}-series`] });
    rec = (await reconcile([{ artifactId: rc }])).reconciliation.results[0]!;
    expect(rec['lifted']).toHaveLength(1); expect(rec['still_open']).toEqual([]);
  });
});

describe('RG7 · INHERITANCE AND ADMISSION', () => {
  it('INCOMPLETE (PR-08-005): the capability\'s row reaches no constitutional anchor → the row and the capability HELD, the journeys and releases named, the controlling authority stated; the chain closed → LIFTED', async () => {
    const capRow = await aid('requirement', `V8:${R.cap}`); const capability = await aid('capability', R.cap);
    const i = (await inh({ artifactId: capRow })).inheritance;
    expect(i).toMatchObject({ conformant: false, findings: expect.arrayContaining([expect.objectContaining({ class: 'incomplete' })]) });
    expect(keysOf((i['affected'] as Row)['capabilities'])).toEqual([R.cap]);
    const r = (await reconcile([{ artifactId: capRow }])).reconciliation.results[0]!;
    expect((r['held'] as Row[]).map((x) => x['subject'])).toEqual(expect.arrayContaining([capRow, capability]));
    expect(await n(sql`select count(*)::int as n from governance.holds where subject_artifact = ${capability}::uuid and lifted_at is null and reason_kind = 'evidence_missing'`)).toBe(1);
    expect((await reconcile([{ artifactId: capRow }])).reconciliation.results[0]!['held']).toEqual([]); // idempotent: no second hold
    await link({ from: await aid('standard', 'V8:chapter:Appendix A Capability Catalog'), to: await aid('requirement', `V0:${R.inv}`), relation: 'derives_from', reason: 'the catalogue inherits the authority invariant (SYNTHETIC)' });
    const ok = (await reconcile([{ artifactId: capRow }])).reconciliation.results[0]!;
    expect(ok).toMatchObject({ conformant: true }); expect((ok['lifted'] as string[]).length).toBe(2);
    expect(await n(sql`select count(*)::int as n from governance.holds where subject_artifact = ${capability}::uuid and lifted_at is null`)).toBe(0);
    expect((await inh({ artifactId: capRow })).inheritance['controlling_authority']).toMatchObject({ key: `V0:${R.inv}`, authority_class: 'constitutional' });
  });
  it('CIRCULAR (planted at the database — the link port refuses one): detected by the inheritance and the lint', async () => {
    const a = await aid('standard', `V8:chapter:${CH.v8}`); const b = await aid('requirement', `V8:${R.pr}`);
    await sql`insert into governance.links (link_id, scope, from_artifact, to_artifact, relation, attributes, recorded_by, correlation_id)
              values (${uuidv7()}::uuid, 'PLATFORM', ${a}::uuid, ${b}::uuid, 'derives_from', '{"source":"planted-fault"}'::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const i = (await inh({ artifactId: b })).inheritance;
    expect((i['findings'] as Row[]).map((f) => f['class'])).toEqual(expect.arrayContaining(['circular']));
    const lint = (await api.lint(preq(steward), { payload: {} }) as { lint: Row }).lint;
    expect((lint['circular'] as Row)['count']).toBeGreaterThanOrEqual(1);
    expect((lint['compound'] as Row)['sample']).toContain(`V4:${R.r4}`);
  });
  it('STALE + CORRECTION (ES-02-005): a changed row is version 2 (version 1 resolvable as of its time), the component\'s link to it STALE, the impact recorded on the import; a removed row RETIRED; re-asserting the link closes the chain', async () => {
    const t0 = await dbNow();
    writeRegisters({ r2Clause: 'A forecast contract change SHALL trigger deterministic, digested impact analysis (SYNTHETIC v2).', dropR5: true });
    const r = await importAs(steward, ['requirements']);
    const v04 = r.imported.find((x) => x['source_path'] === 'audit/requirements/v04.csv')!;
    expect(v04['counts']).toMatchObject({ versioned: 1, retired: 1, normative_changes: 1 }); // R2 changed; R5 gone
    expect(r.impacts).toHaveLength(1);
    expect(keysOf((r.impacts[0] as Row)['dependents'])).toEqual(expect.arrayContaining([`CMP-${P}-forecast`, `rc-${RUN}`]));
    expect(await cur('requirement', `V4:${R.r2}`)).toMatchObject({ version: 2 });
    const res = (await api.resolve(preq(steward), { payload: { kind: 'requirement', key: `V4:${R.r2}`, asOf: t0 } }) as { resolution: Row }).resolution;
    expect(res['in_force']).toMatchObject({ version: 1 });
    expect(await cur('requirement', `V4:${R.r5}`)).toMatchObject({ lifecycle: 'retired', version: 2 });
    const comp = await aid('component', `CMP-${P}-forecast`);
    const i = (await inh({ artifactId: comp })).inheritance;
    expect((i['findings'] as Row[]).map((f) => f['class'])).toContain('stale');
    const adm = (await admission({ artifactId: rc })).admission;
    expect(adm).toMatchObject({ admissible: false, claim: 'construction', production_admission: expect.stringMatching(/^R1 — /) });
    expect((adm['blocking'] as Row[]).map((b) => b['class'])).toEqual(expect.arrayContaining(['held', 'stale']));
    await link({ from: comp, to: await aid('requirement', `V4:${R.r2}`), relation: 'implements', reason: 're-asserted over version 2 of the row (SYNTHETIC)' });
    expect(((await inh({ artifactId: comp })).inheritance['findings'] as Row[]).map((f) => f['class'])).not.toContain('stale');
  });
  it('ADMISSION (IA-02-006 construction half): the stale test re-run, the candidate reconciled → ADMISSIBLE; production admission stays R1', async () => {
    await ingest({ format: 'vitest', name: 'the re-run after the row changed (SYNTHETIC)', report: vitestReport([{ title: TEST_TITLE, status: 'passed' }], 'after-row'), fixtures: [`fx-${RUN.toLowerCase()}-series`] });
    await reconcile([{ artifactId: rc }]);
    const adm = (await admission({ artifactId: rc })).admission;
    expect(adm['blocking']).toEqual([]); expect(adm['admissible']).toBe(true);
    expect(String(adm['production_admission'])).toMatch(/admits nothing to production/);
  });
});

describe('RG8 · SNAPSHOT, BUILD IDENTITY, THE OVERVIEW, THE LEDGER', () => {
  it('the requirement snapshot is stable until a requirement changes (ES-06-002); the overview reconciles the sources against the repository and reports the expired engineering exception (non-blocking)', async () => {
    const s1 = (await api.snapshot(preq(product), { payload: {} }) as { snapshot: Row }).snapshot; const s2 = (await api.snapshot(preq(padmin), { payload: {} }) as { snapshot: Row }).snapshot;
    expect(s1['digest']).toBe(s2['digest']);
    await register({ kind: 'requirement', key: `V4:${P}-06-020`, title: 'A new requirement moves the snapshot (SYNTHETIC)', authorityClass: 'engineering', volume: 'V4', ownerRole: 'conformance_steward',
                     attributes: { mandatory: true, obligation: 'SHALL', obligations: 1, verification_method: 'Automated conformance test' } });
    expect((await api.snapshot(preq(product), { payload: {} }) as { snapshot: Row }).snapshot['digest']).not.toBe(s1['digest']);
    const o = await api.read(preq(product)) as Row;
    const rec = (o['reconciliation'] as Row[]).find((x) => x['source_path'] === 'audit/requirements/v04.csv')!;
    expect(rec['state']).toBe('in_sync');
    writeFileSync(join(SYN, 'audit/requirements/v04.csv'), readFileSync(join(SYN, 'audit/requirements/v04.csv'), 'utf8') + row(`${P}-06-030`, 'V4', CH.v4, 'Drift (SYNTHETIC).', { verif: 'passed:ci' }) + '\n');
    const o2 = await api.read(preq(product)) as Row;
    expect((o2['reconciliation'] as Row[]).find((x) => x['source_path'] === 'audit/requirements/v04.csv')!['state']).toBe('drifted');
    expect((o2['engineering_exceptions'] as Row[]).find((x) => x['external_key'] === `EXCEPTIONS.md:${R.exc}`)).toMatchObject({ expired: true, status: 'open' });
    expect(o2['build']).toMatchObject({ policy_bundle: 'bundle-v1' }); expect(String(o2['boundary'])).toMatch(/imported READ-ONLY/);
    expect(await refusal(api.read(preq(tadmin)))).not.toMatchObject({ status: 'ok' });
    writeRegisters({ r2Clause: 'A forecast contract change SHALL trigger deterministic, digested impact analysis (SYNTHETIC v2).', dropR5: true });
    // every §RG table (and the prelude's) forces RLS; every §RG table is append-only
    const forced = (await sql<{ t: string; f: boolean }>`select c.relname as t, c.relforcerowsecurity as f from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'governance' and c.relkind = 'r' order by 1`.execute(h.su)).rows;
    expect(forced.map((x) => x.t)).toEqual(expect.arrayContaining(['rg_fixture_decisions', 'rg_hold_origins', 'rg_impacts', 'rg_imports', 'rg_invalidations', 'rg_verification_cases', 'rg_verification_records', 'rg_verification_reviews']));
    expect(forced.every((x) => x.f)).toBe(true);
    await expect(sql`delete from governance.rg_imports`.execute(h.su)).rejects.toThrow(/append-only|append only/i);
    const events = (await sql<{ event: string }>`select distinct event from governance.events where scope = 'PLATFORM' and event like any (array['registry.%','trace.%','impact.%','inheritance.%','verification.%','fixture.%'])`.execute(h.su)).rows.map((x) => x.event).sort();
    expect(events).toEqual(expect.arrayContaining(['fixture.approved', 'fixture.quarantined', 'fixture.rebuilt', 'fixture.registered', 'impact.recorded', 'inheritance.held', 'inheritance.restored',
      'registry.imported', 'registry.registered', 'trace.link_retired', 'trace.linked', 'verification.ingested', 'verification.reviewed']));
  });
});

describe('RG9 · THE REAL REPOSITORY REGISTERS (read-only)', () => {
  it('every row of audit/requirements/*.csv, the rowmap, DECISIONS.md and EXCEPTIONS.md imported; again → unchanged; the files untouched', async () => {
    delete process.env['EYE_GOVERNANCE_REPO_ROOT'];
    const files = ['audit/requirements/v04.csv', 'audit/delivery/feature-rowmap.csv', 'DECISIONS.md', 'EXCEPTIONS.md'];
    const before = files.map((f) => sha(readFileSync(join(REPO, f))));
    const started = Date.now();
    const r = await importAs(steward, ['requirements', 'rowmap', 'decisions', 'exceptions', 'interfaces']);
    const took = Date.now() - started;
    expect(r.imported).toHaveLength(14); // ten requirement files, the rowmap, DECISIONS.md, EXCEPTIONS.md, the interface register
    // every link end resolves once its source is in: the V9 bindings (V9-only capabilities declared by V9) and the interfaces' V3 rows
    // (left unresolved when RG1 imported the register over the synthetic rows — re-diffed now, because the last import left them open)
    for (const src of ['audit/requirements/v09.csv', 'objects.interface_register', 'audit/delivery/feature-rowmap.csv']) {
      expect(r.imported.find((x) => x['source_path'] === src)!['unresolved']).toEqual([]);
    }
    expect(r.imported.find((x) => x['source_path'] === 'objects.interface_register')).toMatchObject({ unchanged: false, counts: { links_added: 50 } });
    expect(await n(sql`select count(*)::int as n from governance.artifacts where kind = 'requirement' and superseded_at is null and lifecycle = 'active' and source->>'source_digest' is not null
                        and source->>'path' like 'audit/requirements/%'`)).toBe(6264);
    // the capabilities the REAL registers declare (scoped to their source: the other parts plant capabilities of their own)
    expect(await n(sql`select count(*)::int as n from governance.artifacts where kind = 'capability' and superseded_at is null and lifecycle = 'active' and controlling_volume = 'V8'
                        and source->>'path' like 'audit/requirements/%'`)).toBe(108);
    expect(await n(sql`select count(*)::int as n from governance.artifacts where kind = 'capability' and superseded_at is null and lifecycle = 'active' and controlling_volume = 'V9'
                        and source->>'path' like 'audit/requirements/%'`)).toBeGreaterThan(0);
    const again = await importAs(steward, ['requirements', 'rowmap', 'decisions', 'exceptions', 'interfaces']);
    expect(again.imported.every((x) => x['unchanged'] === true)).toBe(true);
    expect(files.map((f) => sha(readFileSync(join(REPO, f))))).toEqual(before);
    const o = (await orphans({ rule: 'RG-O01', limit: 500 })).orphans;
    // the rowmap maps every real row to a feature (only this run's registered rows — and the other parts' own requirements — remain)
    expect(keysOf(await imported(ruleOf(o, 'RG-O01').orphans, 'audit/requirements/%')).filter((k) => !String(k).includes(P))).toEqual([]);
    expect(took).toBeLessThan(240_000);
    // the overview over the real registers answers inside its authorization context; the real sources read IN SYNC
    const ov = await api.read(preq(product)) as Row;
    expect(keysOf(await imported(ruleOf((await orphans({ rule: 'RG-O15', limit: 500 })).orphans, 'RG-O15').orphans, 'objects.interface_register'))).toEqual([]); // every REGISTER interface maps to its V3 row
    for (const f of ['audit/requirements/v04.csv', 'audit/delivery/feature-rowmap.csv', 'DECISIONS.md', 'EXCEPTIONS.md']) {
      expect((ov['reconciliation'] as Row[]).find((x) => x['source_path'] === f)).toMatchObject({ state: 'in_sync' });
    }
    expect((ov['engineering_exceptions'] as Row[]).find((x) => x['external_key'] === 'EXCEPTIONS.md:EXC-P0-003')).toMatchObject({ status: 'open', expired: true });
    expect((ov['orphans'] as Row)['total']).toBeGreaterThan(0); // stated, never hidden (e.g. the unanchored chapters)
    process.env['EYE_GOVERNANCE_REPO_ROOT'] = SYN;
  }, 600_000);
});
