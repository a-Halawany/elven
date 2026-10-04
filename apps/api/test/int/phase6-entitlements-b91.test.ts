/**
 * CP-6 B91 §EN (migration 0105, part `entitlements`) — F-P7-F-01: THE OBJECT MODEL (capability catalogue, packages, SKUs, offers, a
 * tenant's licence versions with digest and provenance), THE CONTRACT SCOPE (V10-T-015) and THE AVAILABILITY GATE (ADR-022, PR-66-003) —
 * on a real database through the real routes, ports and pipeline, with named humans holding sessions of their own (the ports compare the
 * acting principal). Every offer, package, SKU, order reference and licence here is SYNTHETIC (no customer, no price; NORDWERK's data is
 * the demonstration's).
 *
 *   EN0 · THE CATALOGUE: seeded (V8 App L ENT-01..20 and V10 App E ENT-01..20 each mapped), two core rows, versions immutable.
 *   EN1 · THE VENDOR'S OBJECTS: capability, package, SKU and offer declared and versioned by the commercial authority (PLATFORM, human-gated).
 *         Refused: a core row changed, a prefix claiming a mandatory control, a duplicate prefix, a stale version, an unknown capability,
 *         package or SKU, a withdrawn package, malformed limits; the tenant administrator (scope), the platform administrator (PDP), an
 *         agent holding the role (human gate) and a forged actor (the port). Recovered on the current version.
 *   EN2 · THE ENTITLEMENT MATRIX through the pipeline's gate — UNCONTRACTED (never gated), CORE, EXEMPT, LICENSED, UNLICENSED, GRACE (the
 *         default read-and-preserve, §GR's grace_rules seam, an expired licence, an indeterminate entitlement), SUSPENDED and LAPSED — each a
 *         POSITIVE, a REFUSAL (403 EYE_ENT_001, recorded through recordDenial: a deny policy decision and an EYE-ENT-001 audit event, no
 *         business effect) and a RECOVERY (a new licence version; the state restored). Licence issuance: v+1 supersedes, digest, provenance;
 *         refused over a suspended licence, over an indeterminate entitlement, with a future window or an unknown SKU.
 *         The STATE TRANSITIONS (grace, suspended, lapsed, reinstated) are §GR's ports — absent from this worktree, this harness writes the
 *         prelude's commercial.licences.state directly as their stand-in (the integrator wires §GR's).
 *   EN3 · THE BOUNDARY: on a tenant licensed for NOTHING BUT CORE — active, in grace, suspended and lapsed — no mandatory control is ever
 *         refused: the audit read (the auditor, the real route — and it shows the entitlement refusal itself), identity (/me), a warning
 *         acknowledge, an attention acknowledge, a correction, withdrawals, an export, the retention read, every human-gated decision in an
 *         unlicensed capability, and the reads of existing simulation records.
 *   EN4 · THE CONTRACT SCOPE: decision cells, sources, twins, authorities, environments and the support boundary, pinned to the licence
 *         version; refused for another tenant's domain, the vendor's role as an authority, a tenant with no licence, an unknown twin, a stale
 *         version; recovered as v2.
 *   EN5 · THE READS: the tenant's entitlement (TENANT), the availability explained (DOMAIN), the vendor's catalogue and matrix (PLATFORM);
 *         refused across tenants (scope) and at the database's N-01 guard; recovered within the reader's own tenant.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { ConstraintsController } from '../../src/twin/constraints/constraints.controller.js';
import type { EntitlementsTenantController, EntitlementsVendorController } from '../../src/commercial/entitlements/entitlements.controller.js';
import { EntitlementCapability } from '../../src/commercial/entitlements/entitlement.capabilities.js';
import { entitlementExemption } from '../../src/commercial/entitlements/entitlement-gate.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';

let h: Phase4Harness; let T: string; let D: string; let U: string; let DU: string;
let vendor: AuthenticatedPrincipal; let platformAdmin: AuthenticatedPrincipal; let agentVendor: AuthenticatedPrincipal;
let tadmin: AuthenticatedPrincipal; let auditor: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let steward: AuthenticatedPrincipal;
let omni: AuthenticatedPrincipal; let uAdmin: AuthenticatedPrincipal; let uOmni: AuthenticatedPrincipal;
let vapi: EntitlementsVendorController; let tapi: EntitlementsTenantController; let capi: ConstraintsController;
const RUN = uuidv7().slice(-6);
/** The correlation of EN2's refused write (EN3's auditor reads its audit event). */
let refusedCorrelation = '';

// ── envelopes and calls ────────────────────────────────────────────────────────────────
function env(p: AuthenticatedPrincipal, action: string, scope: Scope, t: string | null, d: string | null, purpose = 'commercial'): Envelope {
  return {
    message_id: uuidv7(), scope, tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: purpose, action,
    side_effect_class: 'reversible', consequence_class: 'C2', object_type: null, object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b91-entitlements',
  } as unknown as Envelope;
}
const vreq = (p: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: env(p, action, 'PLATFORM', null, null), eyePrincipal: p }) as never;
const treq = (p: AuthenticatedPrincipal, action: string, t: string) => ({ eyeEnvelope: env(p, action, 'TENANT', t, null), eyePrincipal: p }) as never;
const dreq = (p: AuthenticatedPrincipal, action: string, t: string, d: string, purpose = 'commercial') => ({ eyeEnvelope: env(p, action, 'DOMAIN', t, d, purpose), eyePrincipal: p }) as never;

/** A refusal as the HTTP answer the filter would give (a port's text mapped by observation-errors; a pipeline HttpException as is), or ok. */
async function refusal(p: Promise<unknown>): Promise<{ status: number | 'ok'; code: string; message: string; body: Row }> {
  try { await p; return { status: 'ok', code: '', message: '', body: {} }; } catch (e) {
    const body = e instanceof HttpException ? (e.getResponse() as Row) : {};
    const raw = e instanceof HttpException ? String(body['message'] ?? '') : (e instanceof Error ? e.message : String(e));
    const r = asObservationRefusal(e, uuidv7());
    if (r === null) throw e;
    return { status: r.getStatus(), code: String((r.getResponse() as Row)['code'] ?? ''), message: raw, body };
  }
}

/** THE SENTINEL: drive the REAL pipeline for `action` with a handler that throws on entry. 'reached' = the PDP allowed it AND the
 *  availability gate let it through AND the commit context was minted — the request reached its handler; otherwise the refusal. */
const SENTINEL = new Error('b91-sentinel: the request reached its handler');
async function reach(p: AuthenticatedPrincipal, action: string, t = T, d = D): Promise<'reached' | { status: number; code: string; message: string }> {
  const route = { scope: 'DOMAIN' as const, tenantId: t, domainId: d, action, objectType: null, objectId: null };
  try {
    await h.pipeline.write(env(p, action, 'DOMAIN', t, d), p, route, (() => null) as never, async () => { throw SENTINEL; });
  } catch (e) {
    if (e === SENTINEL) return 'reached';
    if (e instanceof HttpException) { const b = e.getResponse() as Row; return { status: e.getStatus(), code: String(b['code']), message: String(b['message']) }; }
    throw e;
  }
  throw new Error(`${action}: the sentinel handler did not run and nothing was refused`);
}
const gate = async (t: string, action: string, humanGated = false) =>
  (await sql<{ a: Row }>`select commercial.capability_available(${t}::uuid, ${action}, ${humanGated}) as a`.execute(h.su)).rows[0]!.a;
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const n = async (q: ReturnType<typeof sql>) => Number(((await q.execute(h.su)).rows[0] as { n: number } | undefined)?.n ?? 0);
/** The stand-in for §GR's transitions (its ports are not in this worktree): the prelude's state columns written directly. */
const setState = (t: string, state: string, extra: { graceDays?: number } = {}) =>
  sql`update commercial.licences set state = ${state}, state_changed_at = clock_timestamp(),
        grace_until = case when ${state} = 'grace' then clock_timestamp() + make_interval(days => ${extra.graceDays ?? 7}) else grace_until end,
        last_valid = case when ${state} = 'grace' then jsonb_build_object('version', version, 'capabilities', to_jsonb(capabilities), 'limits', limits) else last_valid end
      where tenant_id = ${t}::uuid and state <> 'superseded'`.execute(h.su);

// ── principals ─────────────────────────────────────────────────────────────────────────
async function person(label: string, kind: 'human' | 'agent', scope: Scope, t: string | null, d: string | null, roles: Array<{ role: string; scope: Scope }>): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${scope}, ${t}::uuid, ${d}::uuid, ${`b91-${label}-${RUN}`}, ${`b91-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r.role, scope: r.scope, tenantId: r.scope === 'PLATFORM' ? null : t, domainId: r.scope === 'DOMAIN' ? d : null }));
  for (const b of bindings) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
              values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  }
  return h.openSession({ ...h.manager, principalId: id, kind, homeScope: scope, homeTenantId: t, homeDomainId: d, bindings });
}

// ── the catalogue acts ─────────────────────────────────────────────────────────────────
const declareCapability = (payload: Row, as = vendor) => vapi.declareCapability(vreq(as, 'commercial.capability.declare'), { payload }) as Promise<{ capability: Row }>;
const declarePackage = (payload: Row, as = vendor) => vapi.declarePackage(vreq(as, 'commercial.offer.package'), { payload }) as Promise<{ package: Row }>;
const declareSku = (payload: Row, as = vendor) => vapi.declareSku(vreq(as, 'commercial.offer.sku'), { payload }) as Promise<{ sku: Row }>;
const declareOffer = (payload: Row, as = vendor) => vapi.declareOffer(vreq(as, 'commercial.offer.declare'), { payload }) as Promise<{ offer: Row }>;
const issue = (t: string, payload: Row, as = vendor) => vapi.issueLicence(vreq(as, 'commercial.licence.issue'), t, { payload }) as Promise<{ licence: Row }>;
const contract = (t: string, payload: Row, as = vendor) => vapi.declareContract(vreq(as, 'commercial.contract.declare'), t, { payload }) as Promise<{ contract: Row }>;
const order = (s: string) => `SYNTH-ORDER-${RUN}-${s}`;

const GEO = { key: `geospatial_${RUN}`, label: 'Geospatial analytics (SYNTHETIC)', description: 'A synthetic catalogue row for the harness.', prefixes: [`geospatial${RUN}.`],
              unit: 'domains', tier: 'foundation', specRefs: ['harness'], reason: 'a synthetic capability declared by the harness' };
const PK = { core: `core-only-${RUN}`, fd: `foresight-decision-${RUN}`, sim: `sim-suite-${RUN}`, old: `retired-pack-${RUN}` };
const SKU = { core: `EYE-CORE-${RUN}`.toUpperCase(), fd: `EYE-FD-${RUN}`.toUpperCase(), sim: `EYE-SIM-${RUN}`.toUpperCase() };

// the real simulation write: a constraint set declared by a constraint steward (simulation.constraint.declare — the Simulation capability)
const CONSTRAINT = { key: 'regensburg-pallets', kind: 'business_rule', title: 'Regensburg warehouse capacity', quantity: 'warehouse:regensburg.pallets',
                     op: '<=', value: 1800, unit: 'pallets', applies_to: ['plan'] };
let setSeq = 0;
const declareSet = () => capi.declare(dreq(steward, 'simulation.constraint.declare', T, D, 'twin'), T, D,
  { payload: { setKey: `b91-capacity-${RUN}-${++setSeq}`, title: 'Regensburg capacity (SYNTHETIC)', constraints: [CONSTRAINT], note: 'declared under the entitlement harness' } }) as Promise<{ set: Row }>;
const listSets = () => capi.listSets(dreq(steward, 'simulation.constraint.read', T, D, 'twin'), T, D, { payload: {} }) as Promise<{ sets: Row[] }>;
const setCount = () => n(sql`select count(*)::int n from simulation.constraint_sets where tenant_id = ${T}::uuid`);

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  const { EntitlementsVendorController: V, EntitlementsTenantController: Tc } = await import('../../src/commercial/entitlements/entitlements.controller.js');
  const { ConstraintsController: Cc } = await import('../../src/twin/constraints/constraints.controller.js');
  vapi = h.app.get(V); tapi = h.app.get(Tc); capi = h.app.get(Cc);
  // the second tenant: UNCONTRACTED throughout (fixture scaffolding, seeded directly)
  U = uuidv7(); DU = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${U}::uuid, ${'b91-uncontracted-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${DU}::uuid, ${U}::uuid, ${'b91-u-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
  vendor = await person('vendor', 'human', 'PLATFORM', null, null, [{ role: 'commercial_authority', scope: 'PLATFORM' }]);
  platformAdmin = await person('padmin', 'human', 'PLATFORM', null, null, [{ role: 'platform_admin', scope: 'PLATFORM' }]);
  agentVendor = await person('agentv', 'agent', 'PLATFORM', null, null, [{ role: 'commercial_authority', scope: 'PLATFORM' }]);
  tadmin = await person('tadmin', 'human', 'TENANT', T, null, [{ role: 'tenant_admin', scope: 'TENANT' }]);
  auditor = await person('auditor', 'human', 'TENANT', T, null, [{ role: 'auditor', scope: 'TENANT' }]);
  dadmin = await person('dadmin', 'human', 'DOMAIN', T, D, [{ role: 'domain_admin', scope: 'DOMAIN' }]);
  steward = await person('steward', 'human', 'DOMAIN', T, D, [{ role: 'constraint_steward', scope: 'DOMAIN' }]);
  uAdmin = await person('uadmin', 'human', 'TENANT', U, null, [{ role: 'tenant_admin', scope: 'TENANT' }]);
  // OMNI: a named human holding every customer role (DOMAIN roles in D, TENANT roles in T), so the PDP allows each action of the matrix and
  // the GATE is what is under test
  const roles = (await sql<{ code: string; scope: Scope }>`select code, scope from identity.roles where scope in ('DOMAIN', 'TENANT') order by code`.execute(h.su)).rows;
  omni = await person('omni', 'human', 'DOMAIN', T, D, roles.map((r) => ({ role: r.code, scope: r.scope })));
  uOmni = await person('uomni', 'human', 'DOMAIN', U, DU, roles.map((r) => ({ role: r.code, scope: r.scope })));
}, 600_000);

afterAll(async () => { await h?.close(); });

describe('EN0 · the capability catalogue (seeded by 0105 §EN)', () => {
  it('positive: every ENT row of V8 App L and V10 App E is mapped; two core rows; the MAP enforcement mapping', async () => {
    const rows = (await sql<Row>`select * from commercial.capabilities where declared_by = '00000000-0000-0000-0000-000000000000'::uuid and version = 1 order by capability_key`.execute(h.su)).rows;
    expect(rows.length).toBe(23);
    expect(rows.filter((r) => r['core'] === true).map((r) => r['capability_key']).sort()).toEqual(['attention_controls', 'core']);
    const refs = new Set(rows.flatMap((r) => r['spec_refs'] as string[]));
    for (let i = 1; i <= 20; i++) {
      const k = String(i).padStart(2, '0');
      expect(refs.has(`V8 ENT-${k}`), `V8 ENT-${k}`).toBe(true);
      expect(refs.has(`V10 ENT-${k}`), `V10 ENT-${k}`).toBe(true);
    }
    const by = Object.fromEntries(rows.map((r) => [r['capability_key'], r]));
    expect(by['foresight']!['action_prefixes']).toEqual(['prediction.']);
    expect(by['decision']!['action_prefixes']).toEqual(expect.arrayContaining(['decision.', 'executive.']));
    expect(by['simulation']!['action_prefixes']).toEqual(['simulation.', 'twin.']);
    expect(by['digital_twin']!['included_in']).toBe('simulation');
    expect(by['attention_controls']!['action_prefixes']).toEqual(['prediction.warning.', 'executive.attention.']);
  });
  it('refusal: a catalogue version is immutable and never deleted (only its supersession is recorded)', async () => {
    await expect(sql`update commercial.capabilities set label = 'tampered' where capability_key = 'core'`.execute(h.su)).rejects.toThrow(/immutable/);
    await expect(sql`delete from commercial.capabilities where capability_key = 'simulation'`.execute(h.su)).rejects.toThrow(/never deleted/);
    await expect(sql`update commercial.entitlement_events set reason = 'x' where subject_key = 'core'`.execute(h.su)).rejects.toThrow();
  });
  it('recovery: the catalogue reads back unchanged, and the exemption list agrees with the TypeScript fast path', async () => {
    expect((await one(sql`select label from commercial.capabilities where capability_key = 'core'`))['label']).toBe('Universal Strategic Intelligence Core');
    for (const a of ['audit.read', 'identity.self.read', 'prediction.warning.acknowledge', 'executive.attention.item.acknowledge', 'observation.correction.apply',
      'products.metric.withdraw_certification', 'simulation.read', 'simulation.fabric.read', 'executive.search', 'retention.export.download', 'simulation.experiment.declare',
      'prediction.forecast.issue', 'twin.estimate.propose', 'decision.review.metrics', 'report.render', 'commercial.licence.issue']) {
      const db = (await one(sql`select commercial.cen_exemption(${a}, false) as e`))['e'] ?? null;
      expect(db, a).toBe(entitlementExemption(a, false));
    }
    expect((await one(sql`select commercial.cen_exemption('simulation.experiment.declare', true) as e`))['e']).toBe('human_gate');
  });
});

describe('EN1 · the vendor\'s objects: capability, package, SKU, offer', () => {
  it('positive: the commercial authority declares a capability and versions it; packages, SKUs and an offer', async () => {
    const v1 = await declareCapability({ ...GEO, expectedVersion: 0 });
    expect(v1.capability).toMatchObject({ capability_key: GEO.key, version: 1, core: false, status: 'active', declared_by: vendor.principalId, digest: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const v2 = await declareCapability({ ...GEO, expectedVersion: 1, label: 'Geospatial analytics v2 (SYNTHETIC)' });
    expect(v2.capability).toMatchObject({ version: 2, label: 'Geospatial analytics v2 (SYNTHETIC)' });
    expect((await one(sql`select status from commercial.capabilities where capability_key = ${GEO.key} and version = 1`))['status']).toBe('superseded');
    expect((await one(sql`select (commercial.cen_action_capability(${`geospatial${RUN}.layer.add`})).capability_key as k`))['k']).toBe(GEO.key);

    const core = await declarePackage({ key: PK.core, expectedVersion: 0, title: 'Core only (SYNTHETIC)', capabilities: [], tier: 'foundation', reason: 'the core package: nothing licensed beyond core' });
    expect(core.package).toMatchObject({ version: 1, capabilities: [], status: 'published' });
    await declarePackage({ key: PK.fd, expectedVersion: 0, title: 'Foresight and Decision (SYNTHETIC)', capabilities: ['foresight', 'decision'], tier: 'strategic_cell', reason: 'foresight and decision, no simulation' });
    const sim = await declarePackage({ key: PK.sim, expectedVersion: 0, title: 'Strategic cell with simulation (SYNTHETIC)', capabilities: ['foresight', 'decision', 'simulation', 'observation', 'knowledge_memory'],
      limits: { simulation_compute: { quantity: 3600, unit: 'wall_seconds', period: 'month' }, users: 25 }, tier: 'strategic_cell', reason: 'the strategic cell including simulation' });
    expect(sim.package).toMatchObject({ capabilities: ['decision', 'foresight', 'knowledge_memory', 'observation', 'simulation'], limits: { users: 25 } });
    for (const [code, pkg] of [[SKU.core, PK.core], [SKU.fd, PK.fd], [SKU.sim, PK.sim]] as const) {
      const s = await declareSku({ code, expectedVersion: 0, title: `${pkg} 12 months`, packageKey: pkg, termMonths: 12, reason: 'a twelve-month synthetic term' });
      expect(s.sku).toMatchObject({ sku_code: code, version: 1, package_key: pkg, package_version: 1, term_months: 12, status: 'active' });
    }
    const offer = await declareOffer({ key: `strategic-${RUN}`, expectedVersion: 0, title: 'Strategic offer (SYNTHETIC)', summary: 'Core, foresight and decision, and simulation — synthetic terms.',
      skuCodes: [SKU.core, SKU.fd, SKU.sim], reason: 'the synthetic offer of the harness' });
    expect(offer.offer).toMatchObject({ version: 1, status: 'published', sku_codes: [SKU.core, SKU.fd, SKU.sim].sort() });
    expect(await n(sql`select count(*)::int n from commercial.entitlement_events where tenant_id is null and actor = ${vendor.principalId}::uuid`)).toBe(2 + 3 + 3 + 1);
  });

  it('refusal: core rows, mandatory-control prefixes, duplicates, stale versions, unknown and withdrawn references, malformed limits', async () => {
    let r = await refusal(declareCapability({ ...GEO, key: 'core', expectedVersion: 1 }));
    expect(r).toMatchObject({ status: 422 }); expect(r.message).toMatch(/^capability rejected \(core\)/);
    r = await refusal(declareCapability({ ...GEO, key: 'attention_controls', expectedVersion: 1, tier: 'foundation' }));
    expect(r.message).toMatch(/^capability rejected \(core\): attention_controls is a core capability/);
    r = await refusal(declareCapability({ ...GEO, key: `audit_plus_${RUN}`, expectedVersion: 0, prefixes: ['audit.extra.'] }));
    expect(r).toMatchObject({ status: 422 }); expect(r.message).toMatch(/^capability rejected \(boundary\)/);
    r = await refusal(declareCapability({ ...GEO, key: `warn_plus_${RUN}`, expectedVersion: 0, prefixes: ['prediction.warning.premium.'] }));
    expect(r.message).toMatch(/^capability rejected \(boundary\)/);
    r = await refusal(declareCapability({ ...GEO, key: `sim_two_${RUN}`, expectedVersion: 0, prefixes: ['simulation.'] }));
    expect(r).toMatchObject({ status: 409 }); expect(r.message).toMatch(/^capability rejected \(duplicate\): simulation\. is already covered by capability simulation/);
    r = await refusal(declareCapability({ ...GEO, expectedVersion: 1 }));
    expect(r).toMatchObject({ status: 409 }); expect(r.message).toMatch(/^capability rejected \(stale\)/);
    r = await refusal(declarePackage({ key: `bad-${RUN}`, expectedVersion: 0, title: 'Bad', capabilities: ['teleportation'], reason: 'an unknown capability' }));
    expect(r).toMatchObject({ status: 404 }); expect(r.message).toMatch(/^offer rejected \(unknown_capability\): teleportation/);
    r = await refusal(declarePackage({ key: `bad-${RUN}`, expectedVersion: 0, title: 'Bad', capabilities: [], limits: { users: -1 }, reason: 'negative limits' }));
    expect(r).toMatchObject({ status: 422 }); expect(r.message).toMatch(/^offer rejected \(limits\)/);
    r = await refusal(declareSku({ code: `EYE-NONE-${RUN}`.toUpperCase(), expectedVersion: 0, title: 'None', packageKey: `nope-${RUN}`, termMonths: 12, reason: 'an unknown package' }));
    expect(r).toMatchObject({ status: 404 }); expect(r.message).toMatch(/^offer rejected \(unknown_package\)/);
    await declarePackage({ key: PK.old, expectedVersion: 0, title: 'Retired pack', capabilities: ['foresight'], reason: 'to be withdrawn' });
    await declarePackage({ key: PK.old, expectedVersion: 1, title: 'Retired pack', capabilities: ['foresight'], status: 'withdrawn', reason: 'withdrawn from sale' });
    r = await refusal(declareSku({ code: `EYE-OLD-${RUN}`.toUpperCase(), expectedVersion: 0, title: 'Old', packageKey: PK.old, termMonths: 12, reason: 'a withdrawn package' }));
    expect(r).toMatchObject({ status: 409 }); expect(r.message).toMatch(/^offer rejected \(state\): package .* is withdrawn/);
    r = await refusal(declareOffer({ key: `bad-${RUN}`, expectedVersion: 0, title: 'Bad', summary: 'an offer naming nothing real', skuCodes: ['EYE-GHOST'], reason: 'an unknown SKU' }));
    expect(r).toMatchObject({ status: 404 }); expect(r.message).toMatch(/^offer rejected \(unknown_sku\)/);
  });

  it('refusal: only the commercial authority, a named human, acting as itself (scope, PDP, human gate, the port)', async () => {
    // the tenant administrator holds no PLATFORM binding: the PLATFORM route is refused at scope resolution
    let r = await refusal(declareCapability({ ...GEO, expectedVersion: 2 }, tadmin));
    expect(r).toMatchObject({ status: 403, code: 'EYE-TEN-001' });
    // the platform administrator is PLATFORM but not the commercial authority: the PDP refuses
    r = await refusal(declareCapability({ ...GEO, expectedVersion: 2 }, platformAdmin));
    expect(r).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    // an agent holding the role is not a named human: the human gate
    r = await refusal(issue(T, { skuCode: SKU.core, orderRef: order('agent'), reason: 'an agent would assign an entitlement' }, agentVendor));
    expect(r).toMatchObject({ status: 403, code: 'EYE-WFL-002' });
    // the port's own guard: a vendor passing the PDP who names another actor
    const route = { scope: 'PLATFORM' as const, tenantId: null, domainId: null, action: 'commercial.capability.declare', objectType: 'CAP', objectId: null };
    r = await refusal(h.pipeline.write(env(vendor, route.action, 'PLATFORM', null, null), vendor, route, EntitlementCapability.catalogue, async (cap) => {
      await cap.declareCapability({ key: `forged_${RUN}`, expectedVersion: 0, label: 'Forged', description: 'forged actor', prefixes: [], includedIn: null, unit: 'x units',
        tier: 'foundation', built: false, specRefs: [], cannotRemove: '', status: 'active', reason: 'a forged actor is refused', actor: uuidv7(), eventId: uuidv7(), correlationId: uuidv7() });
      return { result: null, targetType: 'CAP', targetId: null, targetVersion: null, outboxEvent: null };
    }));
    expect(r).toMatchObject({ status: 403 }); expect(r.message).toMatch(/^capability rejected \(actor\)/);
    expect(await n(sql`select count(*)::int n from commercial.capabilities where capability_key like ${'forged_' + RUN + '%'}`)).toBe(0);
  });

  it('recovery: on the current version the capability is retired (it then gates nothing) and the withdrawn package\'s successor sells', async () => {
    const v3 = await declareCapability({ ...GEO, expectedVersion: 2, status: 'retired', reason: 'the synthetic capability is retired' });
    expect(v3.capability).toMatchObject({ version: 3, status: 'retired' });
    expect((await one(sql`select (commercial.cen_action_capability(${`geospatial${RUN}.layer.add`})).capability_key as k`))['k']).toBeNull();
    expect((await one(sql`select event from commercial.entitlement_events where subject_key = ${GEO.key} and version = 3`))['event']).toBe('capability.retired');
    await declarePackage({ key: PK.old, expectedVersion: 2, title: 'Retired pack, re-published', capabilities: ['foresight'], reason: 're-published for the harness' });
    const s = await declareSku({ code: `EYE-OLD-${RUN}`.toUpperCase(), expectedVersion: 0, title: 'Old', packageKey: PK.old, termMonths: 6, reason: 'the re-published package sells' });
    expect(s.sku).toMatchObject({ package_version: 3, status: 'active' });
  });
});

describe('EN2 · the entitlement matrix through the pipeline\'s gate', () => {
  it('UNCONTRACTED: a tenant with no licence is never gated (every existing deployment)', async () => {
    expect(await gate(T, 'simulation.experiment.declare')).toMatchObject({ available: true, contracted: false, state: 'uncontracted' });
    expect(await reach(omni, 'simulation.experiment.declare')).toBe('reached');
    expect(await reach(uOmni, 'simulation.experiment.declare', U, DU)).toBe('reached');
  });

  it('licence issuance — positive: v1 (core only) with the digest, the provenance and core always included', async () => {
    const r = await issue(T, { skuCode: SKU.core, orderRef: order('1'), reason: 'the core licence of the synthetic tenant' });
    expect(r.licence).toMatchObject({ tenant_id: T, version: 1, state: 'active', package_key: PK.core, capabilities: ['attention_controls', 'core'], issued_by: vendor.principalId,
      digest: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(r.licence['provenance']).toMatchObject({ sku: SKU.core, sku_version: 1, package: PK.core, package_version: 1, order_ref: order('1'), issued_by: vendor.principalId });
    expect(await n(sql`select count(*)::int n from commercial.entitlement_events where tenant_id = ${T}::uuid and event = 'licence.issued'`)).toBe(1);
  });

  it('CORE and EXEMPT on the core-only licence: available; UNCATALOGUED: available', async () => {
    expect(await gate(T, 'report.render')).toMatchObject({ available: true, contracted: true, state: 'active', capability: { key: 'core', core: true } });
    expect(await gate(T, 'prediction.warning.acknowledge')).toMatchObject({ available: true, exemption: 'warning_control' });
    expect(await gate(T, 'simulation.experiment.approve', true)).toMatchObject({ available: true, exemption: 'human_gate' });
    expect(await gate(T, 'zzzz.thing.do')).toMatchObject({ available: true, capability: null });
    expect(await reach(omni, 'prediction.warning.acknowledge')).toBe('reached');
    expect(await reach(omni, 'simulation.experiment.approve')).toBe('reached');
  });

  it('UNLICENSED — refusal: the simulation write is refused 403 EYE_ENT_001, explained, recorded (deny + EYE-ENT-001), with no effect', async () => {
    const before = await setCount();
    const e = env(steward, 'simulation.constraint.declare', 'DOMAIN', T, D, 'twin');
    refusedCorrelation = String(e.correlation_id);
    const r = await refusal(capi.declare({ eyeEnvelope: e, eyePrincipal: steward } as never, T, D,
      { payload: { setKey: `b91-refused-${RUN}`, title: 'Refused (SYNTHETIC)', constraints: [CONSTRAINT], note: 'refused for entitlement' } }));
    expect(r).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
    expect(r.message).toBe('capability unavailable (entitlement): simulation is not licensed for this tenant (active; licence v1) — reads of existing records, corrections and withdrawals, export, audit, identity, warnings and their acknowledgement, and every human decision stay available');
    expect(r.body['entitlement']).toMatchObject({ capability: 'simulation', state: 'active', licence_version: 1 });
    expect(await setCount()).toBe(before);
    const pol = await one(sql`select decision, reason, action from policy.policy_decisions where correlation_id = ${refusedCorrelation}::uuid`);
    expect(pol).toMatchObject({ decision: 'deny', action: 'simulation.constraint.declare' });
    expect(String(pol['reason'])).toMatch(/^capability unavailable \(entitlement\): simulation/);
    const aud = await one(sql`select outcome, result_code, tenant_id from audit.audit_events where correlation_id = ${refusedCorrelation}::uuid`);
    expect(aud).toMatchObject({ outcome: 'denied', result_code: 'EYE-ENT-001', tenant_id: T });
    expect(await reach(omni, 'simulation.experiment.declare')).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
    expect(await reach(omni, 'prediction.forecast.issue')).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
    expect(await reach(omni, 'decision.review.metrics')).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
    // the uncontracted tenant is untouched by T's licence
    expect(await reach(uOmni, 'simulation.experiment.declare', U, DU)).toBe('reached');
  });

  it('LICENSED — v2 (foresight and decision) supersedes v1: foresight and decision available, simulation still refused (licence v2)', async () => {
    const r = await issue(T, { skuCode: SKU.fd, orderRef: order('2'), reason: 'the tenant buys foresight and decision' });
    expect(r.licence).toMatchObject({ version: 2, capabilities: ['attention_controls', 'core', 'decision', 'foresight'] });
    expect(r.licence['provenance']).toMatchObject({ supersedes: 1 });
    expect((await one(sql`select state from commercial.licences where tenant_id = ${T}::uuid and version = 1`))['state']).toBe('superseded');
    expect(await n(sql`select count(*)::int n from commercial.entitlement_events where tenant_id = ${T}::uuid and event = 'licence.superseded'`)).toBe(1);
    expect(await reach(omni, 'prediction.forecast.issue')).toBe('reached');
    expect(await reach(omni, 'decision.review.metrics')).toBe('reached');
    const s = await reach(omni, 'simulation.experiment.declare');
    expect(s).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
    expect((s as { message: string }).message).toMatch(/simulation is not licensed for this tenant \(active; licence v2\)/);
  });

  it('licence issuance — refusal: an unknown SKU, a future window, a malformed limit', async () => {
    let r = await refusal(issue(T, { skuCode: 'EYE-GHOST', orderRef: order('x'), reason: 'an unknown SKU' }));
    expect(r).toMatchObject({ status: 404 }); expect(r.message).toMatch(/^licence rejected \(unknown_sku\)/);
    const future = (await one(sql`select (clock_timestamp() + interval '30 days') as t`))['t'] as Date;
    r = await refusal(issue(T, { skuCode: SKU.sim, effectiveFrom: future.toISOString(), orderRef: order('x'), reason: 'a window in the future' }));
    expect(r).toMatchObject({ status: 422 }); expect(r.message).toMatch(/^licence rejected \(window\)/);
    r = await refusal(issue(T, { skuCode: SKU.sim, limits: { users: 'many' }, orderRef: order('x'), reason: 'a malformed limit' }));
    expect(r).toMatchObject({ status: 422 }); expect(r.message).toMatch(/^licence rejected \(limits\)/);
    expect((await one(sql`select max(version) v from commercial.licences where tenant_id = ${T}::uuid`))['v']).toBe(2);
  });

  it('UNLICENSED — recovery: v3 includes simulation; the same real write now commits', async () => {
    const r = await issue(T, { skuCode: SKU.sim, orderRef: order('3'), reason: 'the tenant adds simulation' });
    expect(r.licence).toMatchObject({ version: 3, limits: { users: 25 } });
    const before = await setCount();
    const s = await declareSet();
    expect(s.set).toMatchObject({ tenant_id: T, version: 1 });
    expect(await setCount()).toBe(before + 1);
    expect(await reach(omni, 'simulation.experiment.declare')).toBe('reached');
  });

  it('GRACE (default: read and preserve only) — a write refused, explained with the grace; reads, exempt acts and human decisions available', async () => {
    await setState(T, 'grace');
    const g = await gate(T, 'simulation.experiment.declare');
    expect(g).toMatchObject({ available: false, state: 'grace', grace: { in_grace: true } });
    expect(String((g['grace'] as Row)['rules_source'])).toMatch(/^(default: read and preserve only|commercial\.grace_rules)/);
    expect((g['grace'] as Row)['last_valid']).toMatchObject({ version: 3 });
    const r = await refusal(declareSet());
    expect(r).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
    expect(r.message).toMatch(/^capability unavailable \(entitlement\): simulation is in grace for this tenant \(grace until .* UTC; licence v3\) — grace allows reading and preserving work only/);
    expect((await listSets()).sets.length).toBeGreaterThanOrEqual(1);
    expect(await reach(omni, 'simulation.read')).toBe('reached');
    expect(await reach(omni, 'simulation.challenge.withdraw')).toBe('reached');
    expect(await reach(omni, 'simulation.retirement.run')).toBe('reached');
  });

  it('GRACE through §GR\'s seam — commercial.grace_rules(tenant) allows finishing declared work; recovery: the rule removed, read-and-preserve again', async () => {
    const seam = (await one(sql`select to_regprocedure('commercial.grace_rules(uuid)') is not null as s`))['s'] === true;
    if (seam) {
      // the integrated migration carries §GR's grace_rules: the gate consults it (whatever it allows is §GR's harness to prove)
      expect((await gate(T, 'simulation.experiment.declare'))['grace']).toMatchObject({ rules_source: 'commercial.grace_rules' });
      return;
    }
    // THE STAND-IN for §GR's function (absent from this worktree), created and dropped here: grace lets declared constraint work continue
    await sql`create function commercial.grace_rules(p_tenant uuid) returns jsonb language sql stable as $$
      select jsonb_build_object('mode', 'finish_running', 'allow_actions', jsonb_build_array('simulation.constraint.')) $$`.execute(h.su);
    try {
      const g = await gate(T, 'simulation.constraint.declare');
      expect(g).toMatchObject({ available: true, state: 'grace', grace: { rules_source: 'commercial.grace_rules', rules: { mode: 'finish_running' } } });
      expect((await declareSet()).set).toMatchObject({ tenant_id: T });
      expect(await reach(omni, 'simulation.experiment.declare')).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
    } finally {
      await sql`drop function commercial.grace_rules(uuid)`.execute(h.su);
    }
    expect(await refusal(declareSet())).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
  });

  it('GRACE — an ACTIVE licence past its effective_to (the transition not yet run) reads as grace; recovery: the window restored', async () => {
    await setState(T, 'active');
    await sql`update commercial.licences set effective_from = clock_timestamp() - interval '2 days', effective_to = clock_timestamp() - interval '1 minute'
              where tenant_id = ${T}::uuid and state = 'active'`.execute(h.su);
    const g = await gate(T, 'simulation.experiment.declare');
    expect(g).toMatchObject({ available: false, state: 'grace', grace: { expired_pending_transition: true } });
    expect(await reach(omni, 'simulation.experiment.declare')).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
    await sql`update commercial.licences set effective_to = null where tenant_id = ${T}::uuid and state = 'active'`.execute(h.su);
    expect(await reach(omni, 'simulation.experiment.declare')).toBe('reached');
  });

  it('GRACE — an INDETERMINATE entitlement (two live licences) enters grace (FEX-30) and refuses a new issuance; recovery: the conflict resolved', async () => {
    const ghost = uuidv7();
    await sql`insert into commercial.licences (licence_id, version, tenant_id, package_key, capabilities, limits, effective_from, state, provenance, digest, issued_by, correlation_id)
              values (${ghost}::uuid, 1, ${T}::uuid, ${PK.core}, array['core'], '{}'::jsonb, clock_timestamp(), 'active', '{"stand_in":"an unreconciled second licence"}'::jsonb,
                      repeat('a', 64), ${vendor.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const g = await gate(T, 'simulation.experiment.declare');
    expect(g).toMatchObject({ available: false, state: 'grace', grace: { indeterminate: true } });
    expect(String(g['reason'])).toMatch(/indeterminate/);
    expect(await reach(omni, 'prediction.warning.acknowledge')).toBe('reached');
    const r = await refusal(issue(T, { skuCode: SKU.sim, orderRef: order('ind'), reason: 'issued over an indeterminate entitlement' }));
    expect(r).toMatchObject({ status: 409 }); expect(r.message).toMatch(/^licence rejected \(state\): the tenant holds 2 live licences/);
    await sql`update commercial.licences set state = 'superseded' where licence_id = ${ghost}::uuid`.execute(h.su);
    expect(await reach(omni, 'simulation.experiment.declare')).toBe('reached');
  });

  it('SUSPENDED — refused (and no re-issuance over it); recovery: reinstated (§GR\'s transition, here its stand-in)', async () => {
    await setState(T, 'suspended');
    const s = await reach(omni, 'simulation.experiment.declare');
    expect(s).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
    expect((s as { message: string }).message).toMatch(/^capability unavailable \(entitlement\): simulation is not available for this tenant \(suspended; licence v3\)/);
    expect(await reach(omni, 'prediction.forecast.issue')).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
    const r = await refusal(issue(T, { skuCode: SKU.sim, orderRef: order('susp'), reason: 'a back door around the suspension' }));
    expect(r).toMatchObject({ status: 409 }); expect(r.message).toMatch(/^licence rejected \(state\): licence v3 is suspended/);
    await setState(T, 'active');
    expect(await reach(omni, 'simulation.experiment.declare')).toBe('reached');
  });

  it('LAPSED — refused; recovery: a new licence version (v4) issued from the lapsed one', async () => {
    await setState(T, 'lapsed');
    expect(await reach(omni, 'simulation.experiment.declare')).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
    const r = await issue(T, { skuCode: SKU.sim, orderRef: order('4'), reason: 'the tenant renews after a lapse' });
    expect(r.licence).toMatchObject({ version: 4, state: 'active' });
    expect(r.licence['provenance']).toMatchObject({ supersedes: 3 });
    expect(await reach(omni, 'simulation.experiment.declare')).toBe('reached');
    expect(await reach(uOmni, 'simulation.experiment.declare', U, DU)).toBe('reached');
  });
});

describe('EN3 · the boundary: no mandatory control is ever refused on a tenant licensed for nothing but core', () => {
  const MANDATORY = [
    'prediction.warning.acknowledge', 'prediction.warning.raise', 'executive.attention.item.acknowledge',   // warnings and their acknowledgement
    'observation.correction.apply', 'executive.publication.correct',                                         // corrections
    'prediction.forecast.withdraw', 'twin.version.withdraw', 'simulation.challenge.withdraw',                 // withdrawals in unlicensed capabilities
    'retention.export.download', 'retention.export.deliver', 'retention.read',                              // export and the customer's records
    'simulation.retirement.run', 'simulation.experiment.approve', 'twin.estimate.decide',                    // human decisions in an unlicensed capability
    'simulation.read', 'simulation.fabric.read', 'twin.read', 'decision.read',                               // reads of existing records
  ];
  it('positive: v5 (core only) — every mandatory control reaches its handler; the audit read, identity and the simulation reads answer', async () => {
    const r = await issue(T, { skuCode: SKU.core, orderRef: order('5'), reason: 'the tenant falls back to core only' });
    expect(r.licence).toMatchObject({ version: 5, capabilities: ['attention_controls', 'core'] });
    for (const a of MANDATORY) expect(await reach(omni, a), a).toBe('reached');
    // the audit read (the auditor, the real route) — it shows the entitlement refusal itself
    const { AdminControllers } = await import('../../src/pipeline/admin.controllers.js');
    const admin = h.app.get(AdminControllers);
    const audit = await admin.auditQueryTenant(treq(auditor, 'audit.read', T), T, { payload: { correlationId: refusedCorrelation } });
    expect((audit.events as Row[]).some((x) => (x['result_code'] ?? (x['event'] as Row | undefined)?.['result_code']) === 'EYE-ENT-001')).toBe(true);
    // identity: the caller's own identity (/me, the identity authority)
    const me = await admin.me({ eyeEnvelope: env(tadmin, 'identity.self.read', 'TENANT', T, null), eyePrincipal: tadmin } as never);
    expect(me).toMatchObject({ principalId: tadmin.principalId });
    expect((await listSets()).sets.length).toBeGreaterThanOrEqual(2);
    // and the writes of the unlicensed capabilities ARE refused — availability, not control
    expect(await reach(omni, 'simulation.experiment.declare')).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
    expect(await reach(omni, 'prediction.forecast.issue')).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
  });

  for (const state of ['grace', 'suspended', 'lapsed'] as const) {
    it(`refusal-proof: ${state} — the licence state never reaches a mandatory control (every one still reaches its handler)`, async () => {
      await setState(T, state);
      for (const a of MANDATORY) expect(await reach(omni, a), `${state}: ${a}`).toBe('reached');
      expect((await listSets()).sets.length).toBeGreaterThanOrEqual(2);
      expect(await reach(omni, 'simulation.experiment.declare')).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
    });
  }

  it('recovery: the licence back to active (core only) — the controls unchanged, the customer\'s records intact', async () => {
    await setState(T, 'active');
    for (const a of MANDATORY.slice(0, 4)) expect(await reach(omni, a), a).toBe('reached');
    expect(await setCount()).toBeGreaterThanOrEqual(2);
  });
});


describe('EN4 · the contract scope (V10-T-015)', () => {
  let contractId = '';
  const scope = () => ({
    decision_cells: [D], sources: [h.fx.sourceId], twins: [],
    authorities: [{ role: 'tenant_admin', principal_id: tadmin.principalId }, { role: 'decision_authority' }],
    environments: ['local-dev', 'on-premise'], support_boundary: { tier: 'standard', statement: 'Business hours, named support contact, no access to customer data without a ticket (SYNTHETIC).' },
  });
  it('positive: the contract names the decision cells, sources, twins, authorities, environments and support boundary, pinned to licence v5', async () => {
    const r = await contract(T, { contractRef: `SYNTH-CONTRACT-${RUN}`, scope: scope(), reason: 'the synthetic contract of the harness' });
    contractId = String(r.contract['contract_id']);
    expect(r.contract).toMatchObject({ version: 1, tenant_id: T, licence_version: 5, decision_cells: [D], sources: [h.fx.sourceId], environments: ['local-dev', 'on-premise'], status: 'active',
      digest: expect.stringMatching(/^[0-9a-f]{64}$/) });
    expect(r.contract['provenance']).toMatchObject({ environments_available: ['local-dev'] });
  });
  it('refusal: another tenant\'s domain, the vendor\'s role as an authority, an unknown twin, a tenant with no licence, a stale version', async () => {
    let r = await refusal(contract(T, { contractRef: 'X', scope: { ...scope(), decision_cells: [DU] }, reason: 'a cell of another tenant' }));
    expect(r).toMatchObject({ status: 422 }); expect(r.message).toMatch(/^contract rejected \(decision_cells\)/);
    r = await refusal(contract(T, { contractRef: 'X', scope: { ...scope(), authorities: [{ role: 'commercial_authority' }] }, reason: 'the vendor as authority' }));
    expect(r).toMatchObject({ status: 422 }); expect(r.message).toMatch(/^contract rejected \(authorities\): commercial_authority is the vendor's role/);
    r = await refusal(contract(T, { contractRef: 'X', scope: { ...scope(), twins: [uuidv7()] }, reason: 'an unknown twin' }));
    expect(r).toMatchObject({ status: 422 }); expect(r.message).toMatch(/^contract rejected \(twins\)/);
    r = await refusal(contract(U, { contractRef: 'X', scope: { ...scope(), decision_cells: [DU], sources: [], authorities: [{ role: 'tenant_admin' }] }, reason: 'no licence to scope' }));
    expect(r).toMatchObject({ status: 404 }); expect(r.message).toMatch(/^contract rejected \(unknown_licence\)/);
    r = await refusal(contract(T, { contractId, expectedVersion: 0, contractRef: 'X', scope: scope(), reason: 'a stale version' }));
    expect(r).toMatchObject({ status: 409 }); expect(r.message).toMatch(/^contract rejected \(stale\)/);
  });
  it('recovery: v2 on the current version supersedes v1 (no environment added that does not exist is claimed as available)', async () => {
    const r = await contract(T, { contractId, expectedVersion: 1, contractRef: `SYNTH-CONTRACT-${RUN}`, scope: { ...scope(), environments: ['local-dev'] }, reason: 'the on-premise profile dropped from scope' });
    expect(r.contract).toMatchObject({ version: 2, environments: ['local-dev'] });
    expect((await one(sql`select status from commercial.contracts where contract_id = ${contractId}::uuid and version = 1`))['status']).toBe('superseded');
    expect(await n(sql`select count(*)::int n from commercial.entitlement_events where tenant_id = ${T}::uuid and subject_kind = 'contract'`)).toBe(3);
  });
});

describe('EN5 · the reads: the tenant\'s entitlement, the explained availability, the vendor\'s matrix', () => {
  it('positive: the tenant administrator reads its entitlement; a domain administrator reads the availability explained; the vendor reads the matrix', async () => {
    const e = await tapi.read(treq(tadmin, 'commercial.read', T), T);
    expect(e.entitlement).toMatchObject({ contracted: true, state: 'active', licence: { version: 5 }, contract: { version: 2 } });
    expect((e.entitlement['history'] as Row[]).length).toBe(5);
    const m = Object.fromEntries((e.entitlement['matrix'] as Row[]).map((x) => [x['key'], x]));
    expect(m['core']).toMatchObject({ licensed: true, available: true });
    expect(m['simulation']).toMatchObject({ licensed: false, available: false });
    const a = await tapi.availabilityInDomain(dreq(dadmin, 'commercial.read', T, D), T, D, { payload: { actions: ['simulation.experiment.declare', 'prediction.warning.acknowledge'] } });
    expect(a.availability[0]).toMatchObject({ available: false, capability: { key: 'simulation' }, licence: { version: 5 } });
    expect(String(a.availability[0]!['reason'])).toMatch(/^capability unavailable \(entitlement\): simulation is not licensed for this tenant \(active; licence v5\)/);
    expect(a.availability[1]).toMatchObject({ available: true, exemption: 'warning_control' });
    const c = await vapi.catalog(vreq(vendor, 'commercial.read'));
    const rowT = (c.catalog['matrix'] as Row[]).find((x) => x['tenant_id'] === T)!;
    const rowU = (c.catalog['matrix'] as Row[]).find((x) => x['tenant_id'] === U)!;
    expect(rowT).toMatchObject({ licence_version: 5, state: 'active', cells: { core: 'core', simulation: 'unlicensed', foresight: 'unlicensed' } });
    expect(rowU).toMatchObject({ state: 'uncontracted', cells: { core: 'core', simulation: 'uncontracted' } });
    const vt = await vapi.readTenant(vreq(vendor, 'commercial.read'), T);
    expect((vt.entitlement['events'] as Row[]).length).toBeGreaterThanOrEqual(8);
  });
  it('refusal: another tenant\'s administrator (scope) and a read of another tenant at the database (N-01 guard)', async () => {
    const r = await refusal(tapi.read(treq(uAdmin, 'commercial.read', T), T));
    expect(r).toMatchObject({ status: 403, code: 'EYE-TEN-001' });
    const route = { scope: 'TENANT' as const, tenantId: U, domainId: null, action: 'commercial.read', objectType: 'LIC', objectId: null };
    await expect(h.pipeline.consequentialRead(env(uAdmin, 'commercial.read', 'TENANT', U, null), uAdmin, route, EntitlementCapability.read,
      async (cap) => cap.available(T, 'simulation.experiment.declare'))).rejects.toThrow(/read rejected \(scope\)/);
    // a domain analyst holds no TENANT binding: the TENANT read is refused at scope resolution
    const analyst = await person('analyst', 'human', 'DOMAIN', T, D, [{ role: 'domain_analyst', scope: 'DOMAIN' }]);
    expect(await refusal(tapi.read(treq(analyst, 'commercial.read', T), T))).toMatchObject({ status: 403 });
  });
  it('recovery: the other tenant reads its own (uncontracted) entitlement; the auditor reads T\'s', async () => {
    expect((await tapi.read(treq(auditor, 'commercial.read', T), T)).entitlement).toMatchObject({ contracted: true });
    const e = await tapi.read(treq(uAdmin, 'commercial.read', U), U);
    expect(e.entitlement).toMatchObject({ contracted: false, state: 'uncontracted', licence: null });
  });
});
