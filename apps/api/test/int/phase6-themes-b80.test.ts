/**
 * CP-6 B80 §TK (migration 0118_b80_x_tk; F-P7-E-03: UX-68-001…005, UX-ADR-022, PAT-41, REL-16, UX-17-001/-005, UX-05-003/-004/-005) — THE
 * GOVERNED CUSTOMER THEME on a real database through the real routes, pipeline and ports, with named humans holding sessions of their own
 * (the ports compare the acting principal). CONSTRUCTION evidence: every persona, tenant, brand and theme here is SYNTHETIC (a fictitious
 * brand's colours); a certification by a synthetic Design System Authority demonstrates the software only (`claim = demonstration`); a real
 * customer's brand acceptance and the named design authorities' attestation are H3 / R2 and never recorded.
 *
 *   TH0 · THE ALGORITHM: the SQL core palette IS packages/tokens' registry (read from the file); the SQL matrix EQUALS contrast.ts pair by
 *         pair (core, a contrast-reducing tint, the corrected tint, an accent that resembles the critical state); the SQL schema refuses what
 *         themes.ts refuses, in the same class.
 *   TH1 · PROPOSE (UX-68-003/-004): v1 by the brand owner; refusals — a semantic key (semantic), an unknown key, an honest agent (the human
 *         gate), an agent claiming a human session (the port), a principal without branding_authority (PDP), a stale version, another
 *         tenant's brand owner.
 *   TH2 · PREVIEW (PAT-41): the matrix from the STORED mapping, the failing pairs named with their ratios, the certification digest, the
 *         caller's eligibility in words.
 *   TH3 · CERTIFY REFUSED (UX-17-005, UX-68-005): refusals first (the proposer certifying — separation of duties; an agent; a machine; a
 *         stale digest — nothing written); then the DSA's certification of v1 is REFUSED, the critical pair and its ratio named (409), the
 *         refused record and its signature committed; v1 cannot be activated.
 *   TH4 · CORRECTED v2 CERTIFIED → ACTIVATED: activation before certification refused; certified and signed (the signature verifies);
 *         activated; the theme IN FORCE read on a TENANT and on a DOMAIN route; a duplicate activation and the retirement of the theme in
 *         force refused.
 *   TH5 · ROLLBACK (stack): v3 activated over v2 → rollback → v2 → rollback → the CORE theme → nothing to roll back; a stale rollback.
 *   TH6 · RETIRE: v3 retired (not in force); retired twice refused; a retired theme never re-proposed. FAULT: the version in force no longer
 *         certified (planted by the superuser) → the read answers the certified CORE theme with the reason (render-time fallback).
 *   TH7 · CROSS-TENANT and the PLATFORM queue: another tenant's brand owner reads and acts on nothing here; the DSA's queue lists every
 *         tenant's proposals; a tenant principal has no PLATFORM queue.
 *   TH8 · THE LIBRARY (UX-05-003/-005): the fork principle declared by the DSA (B107's registry); dg-lint-2 over planted forks (nonconformant,
 *         open findings) and over the real web source (recorded); the inventory registers the token set at 0.1.0; a component_change
 *         contribution carrying the compatibility evidence enters B107's queue.
 *   TH9 · BOUNDARIES: FORCE RLS on the three tables, no write grant, append-only certifications and activations, never-deleted and
 *         content-immutable versions, the allowed-key CHECK, the claim CHECK; the ledger REPLAYS the theme's history in order; the artifact.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { generateKeyPairSync, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { SignatureService } from '../../src/executive/signatures/signature.service.js';
import { DesignPlatformController } from '../../src/governance/design/design.controller.js';
import { repoRoot } from '../../src/governance/design/design-source.js';
import { ThemesDomainController, ThemesPlatformController, ThemesTenantController } from '../../src/governance/design/themes/themes.controller.js';
import { FORK_PRINCIPLE, FORK_PRINCIPLE_STATEMENT } from '../../src/governance/design/themes/library-lint.js';
// THE ORACLE: packages/tokens' own TS implementation (read by relative path — a test-only import, no dependency)
import { certifyTheme, validateMapping } from '../../../../packages/tokens/src/themes.js';
import { Phase4Harness } from './phase4-helpers.js';

const KEY = generateKeyPairSync('ed25519');
process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = KEY.privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');

type Row = Record<string, unknown>;
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';
let h: Phase4Harness; let tc: ThemesTenantController; let dc: ThemesDomainController; let pc: ThemesPlatformController; let dgc: DesignPlatformController;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
let U = ''; let DU = '';
const RUN = uuidv7().slice(-6);
const signer = new SignatureService();

/** A fictitious brand (SYNTHETIC). v1: the primary surface tinted so far that the status inks fail; v2: the corrected tint; v3: a canvas tint. */
const V1 = { 'color.accent.default': { light: '#00476B', dark: '#7CC4E8' }, 'color.accent.strong': { light: '#003352', dark: '#A8DAF2' },
             'color.surface.primary': { light: '#D5CFC8', dark: '#111A27' }, 'brand.wordmark': { text: 'NORDWERK (SYNTHETIC)' } };
const V2 = { ...V1, 'color.surface.primary': { light: '#F7F5F2', dark: '#111A27' } };
const V3 = { ...V2, 'color.canvas': { light: '#F2F4F6', dark: '#0A111B' }, 'color.accent.strong': { alias: 'color.accent.default' } };
const RED_ACCENT = { 'color.accent.default': { light: '#C8102E', dark: '#FF8A95' } };

let brand: AuthenticatedPrincipal;      // the tenant's brand owner (branding_authority, TENANT)
let brand2: AuthenticatedPrincipal;     // a second brand owner (activates and rolls back — the act is the role's, not the proposer's)
let dsa: AuthenticatedPrincipal;        // the Design System Authority (PLATFORM)
let dual: AuthenticatedPrincipal;       // holds BOTH the design authority and the tenant's branding authority (self-certification probe)
let machine: AuthenticatedPrincipal;    // an AGENT holding the design authority whose session claims a human (the PEP passes; the PORT refuses)
let agentBrand: AuthenticatedPrincipal; // an honest AGENT holding branding_authority (the human gate refuses)
let brandMachine: AuthenticatedPrincipal; // an AGENT holding branding_authority whose session claims a human
let tenantAdmin: AuthenticatedPrincipal;// the tenant administrator (reads; no branding authority)
let collector: AuthenticatedPrincipal;  // a domain collection manager (reads the theme in force on a DOMAIN route)
let uBrand: AuthenticatedPrincipal;     // another tenant's brand owner

async function person(label: string, kind: 'human' | 'agent', scope: Scope, roles: Array<{ role: string; scope: Scope }>, o: { claim?: 'human' | 'agent'; tenant?: string; domain?: string | null } = {}): Promise<AuthenticatedPrincipal> {
  const id = uuidv7(); const t = scope === 'PLATFORM' ? null : (o.tenant ?? T()); const d = scope === 'DOMAIN' ? (o.domain ?? D()) : null;
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${scope}, ${t}::uuid, ${d}::uuid, ${`b80tk-${label}-${RUN} (SYNTHETIC)`}, ${`b80tk-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r.role, scope: r.scope, tenantId: r.scope === 'PLATFORM' ? null : (o.tenant ?? T()), domainId: r.scope === 'DOMAIN' ? (o.domain ?? D()) : null }));
  for (const b of bindings) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  }
  const claim = o.claim ?? kind;
  return h.openSession({ ...h.manager, principalId: id, kind: claim === 'agent' ? 'agent' : 'human', assurance: claim === 'agent' ? 'agent_grant' : 'password', homeScope: scope, homeTenantId: t, homeDomainId: d, bindings } as AuthenticatedPrincipal);
}
const P = (role: string) => ({ role, scope: 'PLATFORM' as Scope });
const TN = (role: string) => ({ role, scope: 'TENANT' as Scope });

function env(p: AuthenticatedPrincipal, action: string, scope: Scope, t: string | null, d: string | null): Envelope {
  return { message_id: uuidv7(), scope, tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: 'governance', action,
           side_effect_class: action.endsWith('.read') || action.endsWith('.preview') ? 'none' : 'reversible', consequence_class: 'C2', object_type: 'THM', object_id: null, schema_version: 'v1',
           issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b80-themes' } as unknown as Envelope;
}
const treq = (p: AuthenticatedPrincipal, action: string, t = T()) => ({ eyeEnvelope: env(p, action, 'TENANT', t, null), eyePrincipal: p }) as never;
const dreq = (p: AuthenticatedPrincipal, action: string, t = T(), d = D()) => ({ eyeEnvelope: env(p, action, 'DOMAIN', t, d), eyePrincipal: p }) as never;
const preq = (p: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: env(p, action, 'PLATFORM', null, null), eyePrincipal: p }) as never;
const W = async (p: Promise<unknown>) => (await p) as Row;

const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string; body: Row }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e), body: {} };
  const r = mapped.getResponse() as Row;
  return { status: mapped.getStatus(), message: String(r['message'] ?? (e instanceof Error ? e.message : '')), body: r };
};
const DENIED = /no qualifying role binding|has no binding for this|no platform authority binding|human gate/;
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
const n = async (q: ReturnType<typeof sql>) => Number((await one(q))['n'] ?? 0);
const failure = async (q: ReturnType<typeof sql>): Promise<string> => q.execute(h.su).then(() => 'no error', (e: unknown) => (e instanceof Error ? e.message : String(e)));

// the acts
const propose = (as: AuthenticatedPrincipal, payload: Row, t = T()) => W(tc.propose(treq(as, 'governance.design.theme.propose', t), t, { payload: { title: 'NORDWERK Corporate (SYNTHETIC)', ...payload } }));
const preview = (as: AuthenticatedPrincipal, id: string, version: number, t = T()) => W(tc.preview(treq(as, 'governance.design.theme.preview', t), t, id, { payload: { version } }));
const certify = (as: AuthenticatedPrincipal, id: string, payload: Row, t = T()) => W(tc.certify(treq(as, 'governance.design.theme.certify', t), t, id, { payload: { reason: 'read against the contrast matrix (SYNTHETIC)', ...payload } }));
const activate = (as: AuthenticatedPrincipal, id: string, payload: Row, t = T()) => W(tc.activate(treq(as, 'governance.design.theme.activate', t), t, id, { payload: { reason: 'the certified brand theme goes into force (SYNTHETIC)', ...payload } }));
const rollback = (as: AuthenticatedPrincipal, payload: Row, t = T()) => W(tc.rollback(treq(as, 'governance.design.theme.rollback', t), t, { payload: { reason: 'returning to the theme before (SYNTHETIC)', ...payload } }));
const retire = (as: AuthenticatedPrincipal, id: string, payload: Row, t = T()) => W(tc.retire(treq(as, 'governance.design.theme.retire', t), t, id, { payload: { reason: 'the version is no longer wanted (SYNTHETIC)', ...payload } }));
const tread = (as: AuthenticatedPrincipal, t = T()) => W(tc.read(treq(as, 'governance.design.theme.read', t), t));
const inForceT = (as: AuthenticatedPrincipal, t = T()) => W(tc.inForce(treq(as, 'governance.design.theme.in_force.read', t), t));
const inForceD = (as: AuthenticatedPrincipal, t = T(), d = D()) => W(dc.inForce(dreq(as, 'governance.design.theme.in_force.read', t, d), t, d));
const queue = (as: AuthenticatedPrincipal) => W(pc.queue(preq(as, 'governance.design.theme.read')));
const pv = async (as: AuthenticatedPrincipal, id: string, version: number) => (await preview(as, id, version))['preview'] as Row;
const events = async (subject: string) => (await rows(sql`select event, version from governance.events where subject_id = ${subject}::uuid order by occurred_at, event_id`)).map((r) => `${String(r['event'])}@${String(r['version'])}`);

/** THE ORACLE in the harness's terms: the TS matrix's results as the SQL port shapes them. */
const tsResults = (mapping: Row | null) => certifyTheme(mapping).matrix!.results.map((r) => ({ mode: r.mode, kind: r.kind, fg: r.fg, bg: r.bg, fg_value: r.fgValue, bg_value: r.bgValue, shown: r.shown, pass: r.pass, value: r.value }));
const sqlMatrix = async (mapping: Row | null) => (await one(sql`select governance.theme_matrix(${mapping === null ? null : JSON.stringify(mapping)}::jsonb) as m`))['m'] as Row;

let THEME = ''; let DUAL_THEME = ''; let ACT_V2 = ''; let ACT_V3 = '';

beforeAll(async () => {
  h = await Phase4Harness.boot();
  tc = h.app.get(ThemesTenantController); dc = h.app.get(ThemesDomainController); pc = h.app.get(ThemesPlatformController); dgc = h.app.get(DesignPlatformController);
  U = uuidv7(); DU = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${U}::uuid, ${'b80tk-other-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${DU}::uuid, ${U}::uuid, ${'b80tk-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
  brand = await person('brand', 'human', 'TENANT', [TN('branding_authority')]);
  brand2 = await person('brand2', 'human', 'TENANT', [TN('branding_authority')]);
  dsa = await person('dsa', 'human', 'PLATFORM', [P('design_system_authority')]);
  dual = await person('dual', 'human', 'PLATFORM', [P('design_system_authority'), TN('branding_authority')]);
  machine = await person('machine', 'agent', 'PLATFORM', [P('design_system_authority')], { claim: 'human' });
  agentBrand = await person('agent-brand', 'agent', 'TENANT', [TN('branding_authority')]);
  brandMachine = await person('brand-machine', 'agent', 'TENANT', [TN('branding_authority')], { claim: 'human' });
  tenantAdmin = await person('tadmin', 'human', 'TENANT', [TN('tenant_admin')]);
  collector = await person('collector', 'human', 'DOMAIN', [{ role: 'collection_manager', scope: 'DOMAIN' }]);
  uBrand = await person('u-brand', 'human', 'TENANT', [TN('branding_authority')], { tenant: U });
}, 600_000);
afterAll(async () => { await h?.close(); }, 120_000);

describe('TH0 · the algorithm: the SQL port is packages/tokens, pair by pair', () => {
  it('the SQL core palette IS the registry (Volume 9 Appendix A as packages/tokens/src/registry.ts holds it)', async () => {
    const root = repoRoot(); expect(root).not.toBeNull();
    const src = readFileSync(join(root!, 'packages/tokens/src/registry.ts'), 'utf8');
    const reg = [...src.matchAll(/token: '([^']+)', light: '(#[0-9A-F]{6})', dark: '(#[0-9A-F]{6})'/g)];
    expect(reg).toHaveLength(30);
    const core = (await one(sql`select governance.theme_core_palette() as p`))['p'] as { light: Record<string, string>; dark: Record<string, string> };
    expect(Object.keys(core.light)).toHaveLength(30);
    for (const m of reg) { expect(core.light[m[1]!], m[1]).toBe(m[2]); expect(core.dark[m[1]!], m[1]).toBe(m[3]); }
  });
  it('the SQL matrix EQUALS contrast.ts for the core theme, a contrast-reducing tint, the corrected tint and a critical-like accent', async () => {
    for (const mapping of [null, V1, V2, V3, RED_ACCENT] as Array<Row | null>) {
      const m = await sqlMatrix(mapping);
      const ts = tsResults(mapping);
      const sq = m['results'] as Row[];
      expect(sq).toHaveLength(ts.length);
      sq.forEach((r, i) => {
        const o = ts[i]!;
        expect([r['mode'], r['kind'], r['fg'], r['bg'], r['fg_value'], r['bg_value'], r['shown'], r['pass']]).toEqual([o.mode, o.kind, o.fg, o.bg, o.fg_value, o.bg_value, o.shown, o.pass]);
        expect(Math.abs(Number(r['value']) - o.value)).toBeLessThan(1e-9);
      });
      expect(m['outcome']).toBe(certifyTheme(mapping).outcome === 'certifiable' ? 'pass' : 'fail');
    }
    expect((await sqlMatrix(null))['pairs']).toBe(382);
  });
  it('the SQL schema refuses what themes.ts refuses, in the same class', async () => {
    const cases: Row[] = [{ 'color.critical': { light: '#000000', dark: '#000000' } }, { 'font.family.ui': 'Comic' }, { 'color.canvas': { light: 'red', dark: '#000000' } },
      { 'brand.logo': { src: 'https://cdn.example/logo.svg', alt: 'Logo' } }, { 'brand.wordmark': { text: 'N' } }, {},
      { 'color.accent.strong': { alias: 'color.critical' } }, { 'color.accent.default': { alias: 'color.accent.strong' }, 'color.accent.strong': { alias: 'color.accent.default' } }, V1];
    for (const c of cases) {
      const problem = (await one(sql`select governance.theme_mapping_problem(${JSON.stringify(c)}::jsonb) as p`))['p'] as string | null;
      const ts = validateMapping(c);
      if (ts.length === 0) expect(problem, JSON.stringify(c)).toBeNull();
      else { expect(problem, JSON.stringify(c)).not.toBeNull(); expect(problem!.split(': ')[0]).toBe(ts[0]!.cls); expect(problem!.slice(ts[0]!.cls.length + 2)).toBe(ts[0]!.message); }
    }
  });
});

describe('TH1 · propose (UX-68-003/-004): brand expression only, by the brand owner', () => {
  it('refusals: a semantic key, an unknown key, an honest agent, a machine, no branding authority, another tenant\'s brand owner', async () => {
    await refused(propose(brand, { key: `nordwerk-${RUN}`, mapping: { ...V1, 'color.critical': { light: '#B42318', dark: '#FDA29B' } } }), /^design theme rejected \(semantic\): color\.critical is a semantic or status token/, 422);
    await refused(propose(brand, { key: `nordwerk-${RUN}`, mapping: { 'color.brand.hero': { light: '#00476B', dark: '#7CC4E8' } } }), /^design theme rejected \(mapping\): color\.brand\.hero is not a theme key/, 422);
    await refused(propose(agentBrand, { key: `nordwerk-${RUN}`, mapping: V1 }), /human gate/, 403);
    await refused(propose(brandMachine, { key: `nordwerk-${RUN}`, mapping: V1 }), /^design theme rejected \(actor\): proposing a theme is a named human's act/, 403);
    await refused(propose(tenantAdmin, { key: `nordwerk-${RUN}`, mapping: V1 }), DENIED, 403);
    await refused(propose(uBrand, { key: `nordwerk-${RUN}`, mapping: V1 }), DENIED, 403);
    await refused(propose(brand, { key: 'X', mapping: V1 }), /^design theme rejected \(request\): the theme key/, 422);
    expect(await n(sql`select count(*)::int n from governance.design_themes where tenant_id = ${T()}::uuid`)).toBe(0);
  });
  it('v1 proposed (claim: demonstration), registered as a governance artifact of kind theme; a stale version refused', async () => {
    const r = (await propose(brand, { key: `nordwerk-${RUN}`, expectedVersion: 0, mapping: V1 }))['theme'] as Row;
    expect(r).toMatchObject({ version: 1, state: 'proposed', claim: 'demonstration' });
    THEME = String(r['theme_id']);
    expect(await one(sql`select kind, scope, lifecycle, external_key from governance.artifacts where artifact_id = ${THEME}::uuid and superseded_at is null`))
      .toEqual({ kind: 'theme', scope: 'TENANT', lifecycle: 'proposed', external_key: `THEME:nordwerk-${RUN}` });
    await refused(propose(brand, { key: `nordwerk-${RUN}`, expectedVersion: 0, mapping: V1 }), /^design theme rejected \(stale\): the theme nordwerk-.* is at version 1, not 0/, 409);
  });
});

describe('TH2 · preview (PAT-41): the matrix from the stored mapping, the pairs named, the eligibility in words', () => {
  it('v1 fails in light only; the critical pair and its ratio are named; the DSA is eligible, the brand owner is not', async () => {
    const p = await pv(dsa, THEME, 1);
    expect((p['matrix'] as Row)['outcome']).toBe('fail');
    expect(p['failing_text']).toContain('light: color.critical on color.surface.primary 4.25:1 < 4.5:1');
    expect(((p['matrix'] as Row)['failing'] as Row[]).every((f) => f['mode'] === 'light')).toBe(true);
    expect(p['certification_digest']).toMatch(/^[0-9a-f]{64}$/);
    expect((p['eligibility'] as Row)['certify']).toEqual([]);
    const b = await pv(brand, THEME, 1);
    expect((b['eligibility'] as Row)['certify']).toEqual(expect.arrayContaining(['you do not hold design_system_authority', 'you proposed it — no self-certification']));
    expect((b['eligibility'] as Row)['activate']).toEqual(['it is proposed, not certified — only a certified theme is activated']);
    await refused(preview(dsa, THEME, 9), /^design theme rejected \(unknown_theme\)/, 404);
    await refused(preview(collector, THEME, 1), DENIED, 403);
  });
});

describe('TH3 · certification REFUSED for a failing pair (UX-17-005, UX-68-005), after the refusals of who may certify', () => {
  it('the proposer certifying (separation of duties), an honest agent, a machine, a stale digest — nothing written', async () => {
    const d = (await propose(dual, { key: `dual-${RUN}`, expectedVersion: 0, mapping: V2, title: 'Self-certified theme (SYNTHETIC)' }))['theme'] as Row;
    DUAL_THEME = String(d['theme_id']);
    const dp = await pv(dual, DUAL_THEME, 1);
    await refused(certify(dual, DUAL_THEME, { version: 1, digest: dp['certification_digest'] }), /^design theme rejected \(separation_of_duties\): certifying a customer theme is never done by its proposer/, 403);
    const p = await pv(dsa, THEME, 1);
    await refused(certify(machine, THEME, { version: 1, digest: p['certification_digest'] }), /^design theme rejected \(actor\): certifying a customer theme is a named human's act/, 403);
    const agentDsa = await person('agent-dsa', 'agent', 'PLATFORM', [P('design_system_authority')]);
    await refused(certify(agentDsa, THEME, { version: 1, digest: p['certification_digest'] }), /human gate/, 403);
    await refused(certify(brand, THEME, { version: 1, digest: p['certification_digest'] }), DENIED, 403);
    await refused(certify(dsa, THEME, { version: 1, digest: 'a'.repeat(64) }), /^design theme rejected \(stale\): the certification digest shown is not the one recomputed/, 409);
    expect(await n(sql`select count(*)::int n from governance.theme_certifications where theme_id in (${THEME}::uuid, ${DUAL_THEME}::uuid)`)).toBe(0);
    expect(await n(sql`select count(*)::int n from governance.signatures where subject_kind = 'theme_certification'`)).toBe(0);
  });
  it('the DSA certifies v1: REFUSED (409), the critical pair and its ratio named; the refused record and its signature committed', async () => {
    const p = await pv(dsa, THEME, 1);
    const r = await refused(certify(dsa, THEME, { version: 1, digest: p['certification_digest'] }), /^design theme rejected \(contrast\): v1 is REFUSED certification — 13 failing pairs: .*light: color\.critical on color\.surface\.primary 4\.25:1 < 4\.5:1/, 409);
    expect((r.body['certification'] as Row)['outcome']).toBe('refused');
    expect((r.body['receipt'] as Row)['auditSeq']).toEqual(expect.any(Number));
    const c = await one(sql`select outcome, jsonb_array_length(failing) as nf, certifier::text, certifier_role, claim, rules_version, certification_digest from governance.theme_certifications where theme_id = ${THEME}::uuid and theme_version = 1`);
    expect(c).toMatchObject({ outcome: 'refused', nf: 13, certifier: dsa.principalId, certifier_role: 'design_system_authority', claim: 'demonstration', rules_version: 'b80-tk-contrast-1', certification_digest: p['certification_digest'] });
    expect(await one(sql`select state from governance.design_themes where theme_id = ${THEME}::uuid and version = 1`)).toEqual({ state: 'refused' });
    const s = await one(sql`select scope, tenant_id::text, signer::text, subject_digest, key_id, signature from governance.signatures where subject_kind = 'theme_certification' and subject_id = ${THEME}::uuid and subject_version = 1`);
    expect(s).toMatchObject({ scope: 'TENANT', tenant_id: T(), signer: dsa.principalId, subject_digest: p['certification_digest'] });
    expect(signer.verify(s as never)).toBe(true);
    // the audit row reads failure (the refused outcome), the act committed
    expect(await one(sql`select outcome, result_code from audit.audit_events where correlation_id = ${String(r.body['correlationId'])}::uuid and action = 'governance.design.theme.certify'
      order by audit_seq desc limit 1`)).toEqual({ outcome: 'failure', result_code: 'EYE-STA-002' });
  });
  it('a refused version is never activated, and never certified again', async () => {
    const t = await one(sql`select digest from governance.design_themes where theme_id = ${THEME}::uuid and version = 1`);
    await refused(activate(brand, THEME, { version: 1, digest: t['digest'] }), /^design theme rejected \(state\): nordwerk-.* v1 is refused, not certified/, 409);
    const p = await pv(dsa, THEME, 1);
    await refused(certify(dsa, THEME, { version: 1, digest: p['certification_digest'] }), /^design theme rejected \(state\): .* v1 is refused, not proposed/, 409);
  });
});

describe('TH4 · the corrected v2 certified, then activated; the theme in force', () => {
  it('v2 proposed; activation before certification refused', async () => {
    const r = (await propose(brand, { key: `nordwerk-${RUN}`, expectedVersion: 1, mapping: V2 }))['theme'] as Row;
    expect(r).toMatchObject({ theme_id: THEME, version: 2, state: 'proposed' });
    await refused(activate(brand, THEME, { version: 2, digest: r['digest'] }), /^design theme rejected \(state\): .* v2 is proposed, not certified/, 409);
  });
  it('v2 CERTIFIED and signed: every pair passes', async () => {
    const p = await pv(dsa, THEME, 2);
    expect((p['matrix'] as Row)['outcome']).toBe('pass');
    const c = (await certify(dsa, THEME, { version: 2, digest: p['certification_digest'] }))['certification'] as Row;
    expect(c).toMatchObject({ outcome: 'certified', version: 2, failing: [], pairs: 382, claim: 'demonstration' });
    const s = await one(sql`select key_id, signature, subject_digest from governance.signatures where signature_id = ${c['signature_id']}::uuid`);
    expect(signer.verify(s as never)).toBe(true);
    expect(await one(sql`select lifecycle from governance.artifacts where artifact_id = ${THEME}::uuid and superseded_at is null`)).toEqual({ lifecycle: 'active' });
  });
  it('activated by a brand owner (any holder of the role, not necessarily the proposer); a stale digest and a non-brand principal refused', async () => {
    const t = await one(sql`select digest from governance.design_themes where theme_id = ${THEME}::uuid and version = 2`);
    await refused(activate(brand2, THEME, { version: 2, digest: 'b'.repeat(64) }), /^design theme rejected \(stale\)/, 409);
    await refused(activate(dsa, THEME, { version: 2, digest: t['digest'] }), DENIED, 403);
    await refused(activate(brandMachine, THEME, { version: 2, digest: t['digest'] }), /^design theme rejected \(actor\)/, 403);
    const a = (await activate(brand2, THEME, { version: 2, digest: t['digest'] }))['activation'] as Row;
    expect(a).toMatchObject({ act: 'activate', seq: 1, version: 2, supersedes: null });
    ACT_V2 = String(a['activation_id']);
    await refused(activate(brand2, THEME, { version: 2, digest: t['digest'] }), /^design theme rejected \(duplicate\): .* v2 is already the tenant's theme in force/, 409);
  });
  it('the theme IN FORCE: the customer theme v2 with its certification, on a TENANT and on a DOMAIN route', async () => {
    const f = (await inForceT(tenantAdmin))['in_force'] as Row;
    expect(f).toMatchObject({ theme: 'customer', fallback: false });
    expect(f['version']).toMatchObject({ theme_id: THEME, version: 2 });
    expect(((f['version'] as Row)['resolved'] as Row)['color.surface.primary']).toEqual({ light: '#F7F5F2', dark: '#111A27' });
    expect(f['certification']).toMatchObject({ claim: 'demonstration', certifier: dsa.principalId });
    const d = (await inForceD(collector))['in_force'] as Row;
    expect(d['theme']).toBe('customer');
    await refused(inForceT(collector), DENIED, 403);
  });
  it('the theme in force is never retired', async () => {
    await refused(retire(brand, THEME, { version: 2 }), /^design theme rejected \(state\): .* v2 is the tenant's theme in force — roll it back first/, 409);
  });
});

describe('TH5 · rollback: to the theme before, then to the certified core theme', () => {
  it('v3 certified and activated over v2', async () => {
    const r = (await propose(brand, { key: `nordwerk-${RUN}`, expectedVersion: 2, mapping: V3 }))['theme'] as Row;
    const p = await pv(dsa, THEME, 3);
    await certify(dsa, THEME, { version: 3, digest: p['certification_digest'] });
    const a = (await activate(brand, THEME, { version: 3, digest: r['digest'] }))['activation'] as Row;
    expect(a).toMatchObject({ seq: 2, version: 3, supersedes: ACT_V2 });
    ACT_V3 = String(a['activation_id']);
  });
  it('a stale rollback refused; rollback → v2; rollback → the CORE theme; nothing left to roll back', async () => {
    await refused(rollback(brand, { expectedActivation: ACT_V2 }), /^design theme rejected \(stale\): the theme in force is activation/, 409);
    const r1 = (await rollback(brand2, { expectedActivation: ACT_V3 }))['activation'] as Row;
    expect(r1).toMatchObject({ act: 'rollback', seq: 3, theme_id: THEME, version: 2, to_core: false, fell_back: false });
    expect(((await inForceT(brand))['in_force'] as Row)['version']).toMatchObject({ version: 2 });
    const r2 = (await rollback(brand, { expectedActivation: r1['activation_id'] }))['activation'] as Row;
    expect(r2).toMatchObject({ act: 'rollback', seq: 4, theme_id: null, to_core: true });
    expect(((await inForceT(brand))['in_force'] as Row)).toMatchObject({ theme: 'core', fallback: false });
    await refused(rollback(brand, { expectedActivation: r2['activation_id'] }), /^design theme rejected \(state\): the certified core theme is in force — there is nothing to roll back/, 409);
  });
});

describe('TH6 · retire; the render-time fallback to the certified core', () => {
  it('v3 retired (not in force); retired twice refused; a retired theme is never re-proposed', async () => {
    const r = (await retire(brand, THEME, { version: 3 }))['theme'] as Row;
    expect(r).toMatchObject({ state: 'retired', was: 'certified' });
    await refused(retire(brand, THEME, { version: 3 }), /^design theme rejected \(state\): .* v3 is already retired/, 409);
    await refused(propose(brand, { key: `nordwerk-${RUN}`, expectedVersion: 3, mapping: V2 }), /^design theme rejected \(state\): the theme nordwerk-.* is retired/, 409);
    await refused(retire(agentBrand, THEME, { version: 2 }), /human gate/, 403);
  });
  it('FAULT (planted by the superuser): the version in force no longer certified → the read answers the CORE theme with the reason', async () => {
    const t = await one(sql`select digest from governance.design_themes where theme_id = ${THEME}::uuid and version = 2`);
    await activate(brand, THEME, { version: 2, digest: t['digest'] });
    await sql`update governance.design_themes set state = 'refused' where theme_id = ${THEME}::uuid and version = 2`.execute(h.su);
    const f = (await inForceT(brand))['in_force'] as Row;
    expect(f).toMatchObject({ theme: 'core', fallback: true });
    expect(String(f['note'])).toMatch(/v2 is refused — the certified core theme is applied instead/);
    await sql`update governance.design_themes set state = 'certified' where theme_id = ${THEME}::uuid and version = 2`.execute(h.su);
    expect(((await inForceT(brand))['in_force'] as Row)['theme']).toBe('customer');
  });
});

describe('TH7 · cross-tenant, and the Design System Authority\'s PLATFORM queue', () => {
  it('another tenant\'s brand owner reads and acts on nothing here', async () => {
    await refused(tread(uBrand), DENIED, 403);
    await refused(preview(uBrand, THEME, 2, U), /^design theme rejected \(unknown_theme\)/, 404);
    const t = await one(sql`select digest from governance.design_themes where theme_id = ${THEME}::uuid and version = 2`);
    await refused(activate(uBrand, THEME, { version: 2, digest: t['digest'] }, U), /^design theme rejected \(unknown_theme\)/, 404);
    const own = await tread(uBrand, U);
    expect(own['themes']).toEqual([]);
    expect((own['in_force'] as Row)['theme']).toBe('core');
  });
  it('the tenant read: every version with its certification, the activations (a stack), the core summary', async () => {
    const r = await tread(tenantAdmin);
    const mine = (r['themes'] as Row[]).filter((x) => x['theme_id'] === THEME);
    expect(mine.map((x) => [x['version'], x['state']])).toEqual([[3, 'retired'], [2, 'certified'], [1, 'refused']]);
    expect((mine[2]!['certification'] as Row)['outcome']).toBe('refused');
    expect((r['activations'] as Row[]).map((a) => [a['seq'], a['act'], a['theme_version']])).toEqual([[5, 'activate', 2], [4, 'rollback', null], [3, 'rollback', 2], [2, 'activate', 3], [1, 'activate', 2]]);
    expect((r['core'] as Row)['outcome']).toBe('pass');
    expect(String(r['boundary'])).toMatch(/claim = demonstration/);
  });
  it('the DSA\'s queue lists every tenant\'s proposals awaiting certification; a tenant principal has no PLATFORM queue', async () => {
    const q = await queue(dsa);
    expect((q['awaiting'] as Row[]).some((x) => x['theme_id'] === DUAL_THEME)).toBe(true);
    expect((q['awaiting'] as Row[]).some((x) => x['theme_id'] === THEME)).toBe(false);
    await refused(queue(brand), DENIED, 403);
  });
});

describe('TH8 · the library: the fork lint (dg-lint-2), the inventory at 0.1.0, the compatibility evidence into B107\'s queue (UX-05-003/-005)', () => {
  it('the fork principle declared by the Design System Authority (B107\'s registry — a human act)', async () => {
    const r = await W(dgc.declarePrinciple(preq(dsa, 'governance.design.principle.declare'), { payload: { key: FORK_PRINCIPLE, expectedVersion: 0, kind: 'prohibition', statement: FORK_PRINCIPLE_STATEMENT,
      prohibited: 'a local component named as a library component; a token value declared outside packages/tokens', patterns: [], remediation: 'migrate onto the library component or the governed theme; else reject the contribution',
      reason: 'B80 §TK: dg-lint-2 evidences this prohibition (SYNTHETIC harness)' } }));
    expect((r['principle'] as Row)['key']).toBe(FORK_PRINCIPLE);
  });
  it('planted forks: a local Symbol component and a token value declared in a page — NONCONFORMANT, the findings open', async () => {
    const files = [
      { path: 'apps/web/components/symbols.tsx', text: "export function Symbol({ id, label }: { id: string; label: string }) { return null; }\nexport function Legend() { return null; }\n" },
      { path: 'apps/web/app/demo/page.tsx', text: "function Symbol() { return null; }\nconst s = { '--eye-color-accent-default': 'x' };\nexport default function Page() { return null; }\n" },
    ];
    const r = await W(pc.lint(preq(dsa, 'governance.design.evaluate'), { payload: { files } }));
    const ev = r['evaluation'] as Row;
    expect(ev).toMatchObject({ verdict: 'nonconformant', open: 2, excepted: 0, library: 2 });
    expect((ev['findings'] as Row[]).map((f) => [f['rule'], f['principle'], f['file'], f['line'], f['status']])).toEqual([
      ['library-fork', FORK_PRINCIPLE, 'apps/web/app/demo/page.tsx', 1, 'open'], ['token-redefinition', FORK_PRINCIPLE, 'apps/web/app/demo/page.tsx', 2, 'open']]);
    expect((r['contracts'] as Row[]).find((c) => c['component'] === 'Symbol')).toMatchObject({ props: [{ name: 'id', required: true }, { name: 'label', required: true }] });
    await refused(W(pc.lint(preq(brand, 'governance.design.evaluate'), { payload: { files } })), DENIED, 403);
  });
  it('the real web source: recorded under dg-lint-2 (each finding a fork or a token redefinition, open)', async () => {
    const r = await W(pc.lint(preq(dsa, 'governance.design.evaluate'), {}));
    const ev = r['evaluation'] as Row;
    expect(ev['files']).toBeGreaterThan(100);
    expect((ev['findings'] as Row[]).every((f) => ['library-fork', 'token-redefinition'].includes(String(f['rule'])))).toBe(true);
    expect(await one(sql`select rules_version, source from governance.design_evaluations where evaluation_id = ${ev['evaluation_id']}::uuid`)).toEqual({ rules_version: 'dg-lint-2', source: 'lint' });
  });
  it('the inventory registers the token set at 0.1.0 and the new library components; a component_change carrying the compatibility evidence is proposed', async () => {
    const steward = await person('steward', 'human', 'PLATFORM', [P('conformance_steward')]);
    const inv = (await W(dgc.registerAssets(preq(steward, 'governance.design.asset.register'), { payload: {} })))['inventory'] as Row;
    expect(inv['registered']).toEqual(expect.arrayContaining([expect.objectContaining({ key: 'tokens.semantic' })]));
    const tokens = await one(sql`select asset_id::text, package_version from governance.design_assets where asset_key = 'tokens.semantic' and superseded_at is null`);
    expect(tokens['package_version']).toBe('0.1.0');
    const keys = (await rows(sql`select asset_key from governance.design_assets where superseded_at is null and (asset_key like 'web.symbols.%' or asset_key like 'web.theme.%' or asset_key like 'web.text.%') order by 1`)).map((x) => x['asset_key']);
    expect(keys).toEqual(expect.arrayContaining(['web.symbols.symbol', 'web.symbols.legend', 'web.theme.theme-scope', 'web.theme.theme-preview']));
    const lint = await W(pc.lint(preq(dsa, 'governance.design.evaluate'), {}));
    const c = (await W(dgc.propose(preq(steward, 'governance.design.contribution.propose'), { payload: { kind: 'component_change', targetAssetId: tokens['asset_id'],
      proposal: { packageVersion: '0.1.0', change: 'B80 §TK: contrast matrix, themes, symbols, the extended sheet', props_contracts: (lint['contracts'] as Row[]).slice(0, 20) },
      summary: 'B80 §TK token slice: themes, contrast, symbols, print and forced colours (SYNTHETIC harness)', plans: { compatibility: 'additive — no token removed or renamed', rollback: 'republish 0.0.1' } } })))['contribution'] as Row;
    expect(c).toMatchObject({ kind: 'component_change', stage: 'proposed' });
  });
});

describe('TH9 · boundaries: RLS, grants, append-only, immutability, the CHECKs, the ledger (REPLAY)', () => {
  it('FORCE RLS on the three tables; SELECT only to the runtime roles', async () => {
    const forced = await rows(sql`select c.relname as t, c.relforcerowsecurity as f from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'governance'
      and c.relname in ('design_themes', 'theme_certifications', 'theme_activations') order by 1`);
    expect(forced).toEqual([{ t: 'design_themes', f: true }, { t: 'theme_activations', f: true }, { t: 'theme_certifications', f: true }]);
    expect(await n(sql`select count(*)::int n from information_schema.role_table_grants where table_schema = 'governance' and table_name in ('design_themes', 'theme_certifications', 'theme_activations')
      and grantee in ('eye_app', 'eye_commit') and privilege_type <> 'SELECT'`)).toBe(0);
    expect(await one(sql`select has_function_privilege('eye_app', 'governance.theme_certify(uuid, int, text, text, uuid, uuid, uuid)', 'EXECUTE') as app,
      has_function_privilege('eye_commit', 'governance.theme_certify(uuid, int, text, text, uuid, uuid, uuid)', 'EXECUTE') as cmt,
      has_function_privilege('eye_app', 'governance.theme_preview(uuid, int)', 'EXECUTE') as prev`)).toEqual({ app: false, cmt: true, prev: true });
  });
  it('certifications and activations are append-only; a version is never deleted and its content never changes; the CHECKs hold', async () => {
    expect(await failure(sql`update governance.theme_certifications set outcome = 'certified' where theme_id = ${THEME}::uuid and theme_version = 1`)).toMatch(/append-only|not permitted|immutable/i);
    expect(await failure(sql`delete from governance.theme_activations where tenant_id = ${T()}::uuid`)).toMatch(/append-only|not permitted|immutable/i);
    expect(await failure(sql`delete from governance.design_themes where theme_id = ${THEME}::uuid`)).toMatch(/never deleted/);
    expect(await failure(sql`update governance.design_themes set mapping = '{"color.canvas": {"light": "#000000", "dark": "#000000"}}'::jsonb where theme_id = ${THEME}::uuid and version = 2`)).toMatch(/content is immutable/);
    expect(await failure(sql`insert into governance.design_themes (theme_id, version, tenant_id, theme_key, title, mapping, digest, proposed_by, correlation_id)
      values (${uuidv7()}::uuid, 1, ${T()}::uuid, 'planted-semantic', 'Planted (SYNTHETIC)', '{"color.critical": {"light": "#000000", "dark": "#000000"}}'::jsonb, ${'0'.repeat(64)}, ${brand.principalId}::uuid, ${uuidv7()}::uuid)`)).toMatch(/gdt_mapping_allowed/);
    expect(await failure(sql`insert into governance.design_themes (theme_id, version, tenant_id, theme_key, title, mapping, digest, proposed_by, correlation_id, claim)
      values (${uuidv7()}::uuid, 1, ${T()}::uuid, 'planted-claim', 'Planted (SYNTHETIC)', '{"color.canvas": {"light": "#FFFFFF", "dark": "#000000"}}'::jsonb, ${'0'.repeat(64)}, ${brand.principalId}::uuid, ${uuidv7()}::uuid, 'accepted')`)).toMatch(/claim_check|violates check/);
  });
  it('REPLAY: the ledger reconstructs the theme\'s history in order', async () => {
    expect(await events(THEME)).toEqual(['design.theme_proposed@1', 'design.theme_refused@1', 'design.theme_proposed@2', 'design.theme_certified@2', 'design.theme_activated@2',
      'design.theme_proposed@3', 'design.theme_certified@3', 'design.theme_activated@3', 'design.theme_rolled_back@3', 'design.theme_rolled_back@2', 'design.theme_retired@3', 'design.theme_activated@2']);
    const refusedEv = await one(sql`select details from governance.events where subject_id = ${THEME}::uuid and event = 'design.theme_refused'`);
    expect(((refusedEv['details'] as Row)['failing_text'] as string[])).toContain('light: color.critical on color.surface.primary 4.25:1 < 4.5:1');
  });
});
