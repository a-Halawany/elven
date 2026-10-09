/**
 * CP-6 B33 PRELUDE (migration 0111 §0) — the shared seams the four parts (§TW, §SC, §PK, §CI) build on, proven on a real database through the
 * real pipeline, ports and controllers. Every figure is SYNTHETIC (fixture scaffolding; NORDWERK's data is the demonstration's). The package
 * ROWS below are written directly as fixtures — the package PORTS are §PK's, not the prelude's; what is under test is the prelude's SEAM over them.
 *
 *   P1 · THE PACKAGE_GATE SEAM — domain.package_function_state answers not_installed → uncertified (proposed, certified) → active → disabled
 *        (one function) / conflicted (one function) → active again → not_installed (retired); the TS seam (SqlPackageGate) answers the same
 *        under a real read context, and another tenant's context sees nothing (INVOKER under RLS); the version guards refuse a backward
 *        state, a changed manifest, a delete.
 *   P2 · THE ROUTED RAISE AND THE CLOSE — executive.b33_raise_routed under no policy (deprioritized, listed), under a PUBLISHED policy (routed
 *        to the policy's roles, the named owner kept), a class the policy does not name (deprioritized, never hidden), the same cause twice
 *        (the first item answered); refused: a class outside the vocabulary; executive.b33_close_items closes with `item.closed` and its
 *        reason, and a second close closes nothing; the ALERT reads seam answers the items under RLS.
 *   P3 · THE CITATION KINDS — twin.citations_ok accepts `scenario` (with and without its branch) and `estimate` (version 1) in their shapes
 *        and refuses the malformed; an element resting only on a scenario or an estimate citation is substantiated
 *        (tse_material_substantiated, re-added), the forms valid before stay valid, an entity alone still substantiates nothing.
 *   P4 · THE AGENT KIND — a domain_intelligence agent registers (role domain_intelligence_agent; a foreign digest refused) and opens its run
 *        (task domain_scan, the prelude's null scan: finished, nothing proposed, said); refused: the kind asked to run another kind's task.
 *   P5 · THE `domain.` ENTITLEMENT (0111 §0.7) — the catalogue's domain_package v2 claims `domain.`; an uncontracted tenant is never gated; a
 *        CONTRACTED tenant whose licence lacks domain_package is refused EYE-ENT-001 / 403 on a `domain.*` write (human-gated acts exempt);
 *        recovered: the licence reissued with domain_package, the same write passes. (No `domain.*` PDP rule exists before §PK/§CI: the PDP's
 *        decision for the sentinel action is taken from a real allowed rule — what is under test is the availability gate after it.)
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import type { Tx } from '../../src/shared/db.js';
import type { ExecutiveController } from '../../src/executive/executive.controller.js';
import type { EntitlementsVendorController } from '../../src/commercial/entitlements/entitlements.controller.js';
import { PdpService } from '../../src/policy/pdp.service.js';
import { ALERT, PACKAGE_GATE, type AlertReads, type PackageGate, PackageUnavailable } from '../../src/domains/seams.js';
import { DOMAIN_INTELLIGENCE_AGENT_DIGEST, DOMAIN_INTELLIGENCE_AGENT_VERSION } from '../../src/domains/domain-intelligence-agent.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
type Scope = 'PLATFORM' | 'TENANT' | 'DOMAIN';

let h: Phase4Harness; let T: string; let D: string; let U: string; let DU: string;
let exec: ExecutiveController; let vapi: EntitlementsVendorController; let gate: PackageGate; let alerts: AlertReads;
let tadmin: AuthenticatedPrincipal; let dadmin: AuthenticatedPrincipal; let strategist: AuthenticatedPrincipal; let reader: AuthenticatedPrincipal;
let uReader: AuthenticatedPrincipal; let vendor: AuthenticatedPrincipal; let omni: AuthenticatedPrincipal;
const RUN = uuidv7().slice(-6);
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

// ── envelopes, refusals, reads ─────────────────────────────────────────────────────────────────
function env(p: AuthenticatedPrincipal, action: string, scope: Scope, t: string | null, d: string | null, purpose = 'intelligence'): Envelope {
  return {
    message_id: uuidv7(), scope, tenant_id: t, domain_id: d, principal_id: `principal:${p.principalId}`, purpose_id: purpose, action,
    side_effect_class: action.includes('.read') ? 'none' : 'reversible', consequence_class: 'C2', object_type: null, object_id: null, schema_version: 'v1',
    issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: uuidv7(), trace_id: 'b33-prelude',
  } as unknown as Envelope;
}
const vreq = (p: AuthenticatedPrincipal, action: string) => ({ eyeEnvelope: env(p, action, 'PLATFORM', null, null, 'commercial'), eyePrincipal: p }) as never;
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];
async function refusedWith(p: Promise<unknown>): Promise<string> {
  try { await p; } catch (e) { return e instanceof HttpException ? String((e.getResponse() as Row)['message'] ?? '') : (e instanceof Error ? e.message : String(e)); }
  throw new Error('expected a refusal; the call succeeded');
}
/** A governed read under a real context (twin.read): the handler receives the transaction itself. */
const underRead = <R>(p: AuthenticatedPrincipal, t: string, d: string, fn: (tx: Tx) => Promise<R>) =>
  h.pipeline.consequentialRead(env(p, 'twin.read', 'DOMAIN', t, d, 'twin'), p, { scope: 'DOMAIN', tenantId: t, domainId: d, action: 'twin.read', objectType: 'TWN', objectId: null },
    ((tx: Tx) => tx) as never, async (tx: Tx) => fn(tx)).then((o) => o.result);

/** THE SENTINEL (the b91 idiom): the REAL pipeline for `action`, a handler that throws on entry. */
const SENTINEL = new Error('b33-sentinel: the request reached its handler');
async function reach(p: AuthenticatedPrincipal, action: string, t = T, d = D): Promise<'reached' | { status: number; code: string; message: string }> {
  try {
    await h.pipeline.write(env(p, action, 'DOMAIN', t, d), p, { scope: 'DOMAIN', tenantId: t, domainId: d, action, objectType: null, objectId: null }, (() => null) as never, async () => { throw SENTINEL; });
  } catch (e) {
    if (e === SENTINEL) return 'reached';
    if (e instanceof HttpException) { const b = e.getResponse() as Row; return { status: e.getStatus(), code: String(b['code']), message: String(b['message']) }; }
    throw e;
  }
  throw new Error(`${action}: the sentinel handler did not run and nothing was refused`);
}
const availability = async (t: string, action: string, humanGated = false) =>
  (await sql<{ a: Row }>`select commercial.capability_available(${t}::uuid, ${action}, ${humanGated}) as a`.execute(h.su)).rows[0]!.a;

// ── principals (b91's person(): any scope, any roles, a session of its own) ───────────────────
async function person(label: string, scope: Scope, t: string | null, d: string | null, roles: Array<{ role: string; scope: Scope }>, bindDomain: string | null = d): Promise<AuthenticatedPrincipal> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, 'human', ${scope}, ${t}::uuid, ${d}::uuid, ${`b33p-${label}-${RUN} (SYNTHETIC)`}, ${`b33p-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r.role, scope: r.scope, tenantId: r.scope === 'PLATFORM' ? null : t, domainId: r.scope === 'DOMAIN' ? bindDomain : null }));
  for (const b of bindings) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
              values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  }
  return h.openSession({ ...h.manager, principalId: id, kind: 'human', homeScope: scope, homeTenantId: t, homeDomainId: d, bindings });
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  const { ExecutiveController: E } = await import('../../src/executive/executive.controller.js');
  const { EntitlementsVendorController: V } = await import('../../src/commercial/entitlements/entitlements.controller.js');
  exec = h.app.get(E); vapi = h.app.get(V); gate = h.app.get(PACKAGE_GATE); alerts = h.app.get(ALERT);
  U = uuidv7(); DU = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${U}::uuid, ${'b33p-other-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${DU}::uuid, ${U}::uuid, ${'b33p-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
  tadmin = await person('tadmin', 'TENANT', T, null, [{ role: 'tenant_admin', scope: 'TENANT' }]);
  dadmin = await person('dadmin', 'DOMAIN', T, D, [{ role: 'domain_admin', scope: 'DOMAIN' }]);
  strategist = await person('strategist', 'DOMAIN', T, D, [{ role: 'strategy_owner', scope: 'DOMAIN' }]);
  reader = await person('reader', 'DOMAIN', T, D, [{ role: 'domain_admin', scope: 'DOMAIN' }, { role: 'twin_owner', scope: 'DOMAIN' }]);
  uReader = await person('ureader', 'DOMAIN', U, DU, [{ role: 'domain_admin', scope: 'DOMAIN' }, { role: 'twin_owner', scope: 'DOMAIN' }]);
  vendor = await person('vendor', 'PLATFORM', null, null, [{ role: 'commercial_authority', scope: 'PLATFORM' }]);
  const all = (await sql<{ code: string; scope: Scope }>`select code, scope from identity.roles where scope in ('DOMAIN', 'TENANT') order by code`.execute(h.su)).rows;
  omni = await person('omni', 'TENANT', T, null, all.map((r) => ({ role: r.code, scope: r.scope })), D);
}, 600_000);

afterAll(async () => { vi.restoreAllMocks(); await h?.close(); });

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('P1 · the PACKAGE_GATE seam (domain.package_function_state) over the prelude\'s package tables', () => {
  const PKG = uuidv7(); const KEY = `competitor-${RUN}`;
  const state = async (fn: string | null, t = T, d = D, key = KEY) => (await one(sql`select domain.package_function_state(${t}::uuid, ${d}::uuid, ${key}, ${fn}) as s`))['s'] as Row;
  const version = (v: number, semver: string) => sql`insert into domain.package_versions (package_id, version, scope, tenant_id, domain_id, semver, manifest, manifest_digest, proposed_by, correlation_id)
      values (${PKG}::uuid, ${v}, 'DOMAIN', ${T}::uuid, ${D}::uuid, ${semver}, ${JSON.stringify({ release: { semver }, note: 'SYNTHETIC manifest' })}::jsonb, ${sha(`manifest-${v}`)}, ${strategist.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);

  it('positive: not_installed → uncertified → active → disabled / conflicted per function → active; the TS seam answers the same under a real read context', async () => {
    expect(await state('assess')).toMatchObject({ state: 'not_installed', package_key: KEY, function: 'assess', package_version: null, reason: `no package ${KEY} is installed in this domain` });
    await sql`insert into domain.packages (package_id, scope, tenant_id, domain_id, package_key, domain_kind, title, owner_principal_id, created_by, correlation_id)
              values (${PKG}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, ${KEY}, 'competitor', 'Competitor intelligence (SYNTHETIC)', ${strategist.principalId}::uuid, ${strategist.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    expect(await state('assess')).toMatchObject({ state: 'uncertified', reason: `package ${KEY} has no version yet` });
    await version(1, '1.0.0');
    expect(await state('assess')).toMatchObject({ state: 'uncertified', reason: `package ${KEY} has no active certified version (its latest, v1, is proposed)` });
    await sql`update domain.package_versions set state = 'certified', certified_at = clock_timestamp(), certified_by = ${dadmin.principalId}::uuid where package_id = ${PKG}::uuid and version = 1`.execute(h.su);
    expect(await state('assess')).toMatchObject({ state: 'uncertified', reason: expect.stringMatching(/v1, is certified/) });
    await sql`update domain.package_versions set state = 'active', activated_at = clock_timestamp(), activated_by = ${strategist.principalId}::uuid where package_id = ${PKG}::uuid and version = 1`.execute(h.su);
    expect(await state('assess')).toMatchObject({ state: 'active', package_id: PKG, package_version: 1, semver: '1.0.0', reason: `package ${KEY} v1 (1.0.0) is active` });
    // the INCOMPATIBLE FUNCTION disabled, never the whole package; a conflict scoped to one function
    await sql`update domain.package_versions set disabled_functions = ${JSON.stringify({ assess: { reason: 'the source gdelt-discovery was retired (SYNTHETIC)' } })}::jsonb,
                     conflict = ${JSON.stringify({ reason: 'version 1.0.0 conflicts with the active geopolitical package on the place mapping', functions: ['compare'] })}::jsonb
              where package_id = ${PKG}::uuid and version = 1`.execute(h.su);
    expect(await state('assess')).toMatchObject({ state: 'disabled', reason: `function assess of package ${KEY} v1 is disabled: the source gdelt-discovery was retired (SYNTHETIC)` });
    expect(await state('compare')).toMatchObject({ state: 'conflicted', reason: expect.stringMatching(/conflicts with the active geopolitical package/) });
    expect(await state('alert')).toMatchObject({ state: 'active' });
    expect(await state(null)).toMatchObject({ state: 'conflicted' });   // the package as a whole carries the conflict
    // the TS seam, under a real read context of the tenant: the same answers; the assertion refuses in the class form
    const ts = await underRead(reader, T, D, async (tx) => ({ assess: await gate.state(tx, { tenantId: T, domainId: D, packageKey: KEY, fn: 'assess' }),
      alert: await gate.assertActive(tx, { tenantId: T, domainId: D, packageKey: KEY, fn: 'alert' }, 'competitor profile'),
      refused: await gate.assertActive(tx, { tenantId: T, domainId: D, packageKey: KEY, fn: 'assess' }, 'competitor profile').then(() => null, (e: unknown) => e) }));
    expect(ts.assess).toMatchObject({ state: 'disabled' });
    expect(ts.alert).toMatchObject({ state: 'active', package_version: 1 });
    expect(ts.refused).toBeInstanceOf(PackageUnavailable);
    expect((ts.refused as Error).message).toBe(`competitor profile rejected (package): function assess of package ${KEY} v1 is disabled: the source gdelt-discovery was retired (SYNTHETIC)`);
  });

  it('refusal: another tenant\'s context sees nothing (INVOKER under RLS); the version guards refuse a backward state, a changed manifest, a delete; a second active version', async () => {
    const other = await underRead(uReader, U, DU, async (tx) => gate.state(tx, { tenantId: T, domainId: D, packageKey: KEY, fn: 'alert' }));
    expect(other).toMatchObject({ state: 'not_installed' });
    await expect(sql`update domain.package_versions set state = 'proposed' where package_id = ${PKG}::uuid and version = 1`.execute(h.su)).rejects.toThrow(/^domain package rejected \(state\): a package version moves forward only \(active → proposed refused\)/);
    await expect(sql`update domain.package_versions set manifest = '{"tampered": true}'::jsonb where package_id = ${PKG}::uuid and version = 1`.execute(h.su)).rejects.toThrow(/is immutable \(manifest, digest, semver, proposer\)/);
    await expect(sql`delete from domain.package_versions where package_id = ${PKG}::uuid`.execute(h.su)).rejects.toThrow(/never deleted/);
    await expect(sql`update domain.packages set package_key = 'renamed' where package_id = ${PKG}::uuid`.execute(h.su)).rejects.toThrow(/identity \(key, kind, scope, creator\) never changes/);
    await expect(sql`delete from domain.packages where package_id = ${PKG}::uuid`.execute(h.su)).rejects.toThrow(/never deleted \(it is retired\)/);
    await version(2, '1.1.0');
    await sql`update domain.package_versions set state = 'certified', certified_at = clock_timestamp(), certified_by = ${dadmin.principalId}::uuid where package_id = ${PKG}::uuid and version = 2`.execute(h.su);
    await expect(sql`update domain.package_versions set state = 'active', activated_at = clock_timestamp(), activated_by = ${strategist.principalId}::uuid where package_id = ${PKG}::uuid and version = 2`.execute(h.su))
      .rejects.toThrow(/dom_pv_one_active/);
    expect(await state('assess')).toMatchObject({ state: 'disabled', package_version: 1 });
  });

  it('recovery: v1 superseded and v2 activated (functions re-enabled, no conflict) → active; the package retired → not_installed', async () => {
    await sql`update domain.package_versions set state = 'superseded', superseded_at = clock_timestamp() where package_id = ${PKG}::uuid and version = 1`.execute(h.su);
    await sql`update domain.package_versions set state = 'active', activated_at = clock_timestamp(), activated_by = ${strategist.principalId}::uuid where package_id = ${PKG}::uuid and version = 2`.execute(h.su);
    for (const fn of ['assess', 'compare', 'alert']) expect(await state(fn)).toMatchObject({ state: 'active', package_version: 2, semver: '1.1.0' });
    await expect(sql`update domain.package_versions set disabled_functions = '{}'::jsonb where package_id = ${PKG}::uuid and version = 1`.execute(h.su)).rejects.toThrow(/is superseded; it is kept as it was/);
    await sql`update domain.packages set state = 'retired', retired_at = clock_timestamp(), retired_by = ${strategist.principalId}::uuid, retire_reason = 'the harness retires the package' where package_id = ${PKG}::uuid`.execute(h.su);
    expect(await state('assess')).toMatchObject({ state: 'not_installed', reason: `package ${KEY} is retired in this domain` });
    await expect(sql`update domain.packages set title = 'Revived' where package_id = ${PKG}::uuid`.execute(h.su)).rejects.toThrow(/is retired; a retirement is recorded once/);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('P2 · the routed raise and the close (executive.b33_raise_routed / b33_close_items) under the published attention policy', () => {
  const SUBJECT = uuidv7(); const SUBJECT2 = uuidv7(); const CAUSE = uuidv7();
  const raise = (cls: string, kind: string, subject: string, cause: string | null, owner: string | null, title = 'New capacity in our markets (SYNTHETIC)') =>
    one(sql`select executive.b33_raise_routed(${T}::uuid, ${D}::uuid, ${cls}, ${kind}, ${subject}::uuid, ${title}, ${JSON.stringify(['the watchlist rule matched'])}::jsonb,
              ${owner}::uuid, ${cause}::uuid, 'competitor.event_approved', ${JSON.stringify({ watchlist: 'new capacity' })}::jsonb, null, ${strategist.principalId}::uuid, ${uuidv7()}::uuid) as r`).then((x) => x['r'] as Row);
  const close = (cls: string | null, subject: string, reason: string, actor: string | null = strategist.principalId) =>
    one(sql`select executive.b33_close_items(${T}::uuid, ${D}::uuid, ${cls}, 'competitor_profile', ${subject}::uuid, ${reason}, ${actor}::uuid, ${uuidv7()}::uuid) as r`).then((x) => x['r'] as string[]);
  const RULES = {
    classes: {
      'domain.alert': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['strategy_owner'], ack_within_minutes: 240, escalate_to_roles: ['executive'], max_escalations: 1, suppression: { allowed: true, max_hours: 24 }, notify: 'in_app' },
      'supply.dependency': { materiality: { min_consequence: 'C1', min_confidence: 0.5 }, route_roles: ['domain_analyst'], ack_within_minutes: 480, escalate_to_roles: ['domain_admin'], max_escalations: 1, suppression: { allowed: false }, notify: 'in_app' },
    },
    overload: { max_open_per_role: 50 },
  };

  it('positive: no policy → deprioritized (listed); the policy published → routed to its roles with the named owner kept; the same cause answers the first item', async () => {
    const before = await raise('domain.alert', 'competitor_profile', SUBJECT, uuidv7(), strategist.principalId);
    expect(before).toMatchObject({ state: 'deprioritized', policy_version: null, owner: strategist.principalId, existing: false });
    const pub = await exec.publishAttentionPolicy(h.req(dadmin, 'executive.attention.policy.publish', 'ATP', null, 'executive'), T, D,
      { payload: { rules: RULES, reason: 'B33 prelude: domain alerts to the strategy owner, supply dependencies to the analysts (SYNTHETIC)' } as never }) as unknown as { policy: Row };
    expect(pub.policy).toMatchObject({ version: 1 });
    expect(await one(sql`select state from executive.attention_policies where tenant_id = ${T}::uuid and domain_id = ${D}::uuid and version = 1`)).toMatchObject({ state: 'active' });
    const routed = await raise('domain.alert', 'competitor_profile', SUBJECT, CAUSE, strategist.principalId);
    expect(routed).toMatchObject({ state: 'open', outcome: 'material', owner: strategist.principalId, route_roles: ['strategy_owner'], policy_version: 1, existing: false });
    const item = await one(sql`select signal_class, subject_kind, state, owner_principal_id::text as owner, route_roles, policy_version, details, cause_event_type from executive.attention_items where item_id = ${String(routed['item_id'])}::uuid`);
    expect(item).toMatchObject({ signal_class: 'domain.alert', subject_kind: 'competitor_profile', state: 'open', owner: strategist.principalId, route_roles: ['strategy_owner'], policy_version: 1, cause_event_type: 'competitor.event_approved' });
    expect(item['details']).toMatchObject({ raised_by: 'b33', watchlist: 'new capacity' });
    const ev = await rows(sql`select event, details from executive.attention_item_events where item_id = ${String(routed['item_id'])}::uuid`);
    expect(ev).toEqual([expect.objectContaining({ event: 'item.routed', details: expect.objectContaining({ raised_reasons: ['the watchlist rule matched'], policy_version: 1 }) })]);
    // a class the policy does not name: deprioritized, listed — never hidden
    const unnamed = await raise('domain.package', 'domain_package', SUBJECT2, uuidv7(), strategist.principalId, 'Certification pending (SYNTHETIC)');
    expect(unnamed).toMatchObject({ state: 'deprioritized', policy_version: 1 });
    // the same cause twice: the first item answered, nothing new written
    const again = await raise('domain.alert', 'competitor_profile', SUBJECT, CAUSE, strategist.principalId);
    expect(again).toMatchObject({ item_id: routed['item_id'], existing: true });
    // a named owner who is not an active human of the tenant is not kept (the role route stands)
    const noOwner = await raise('domain.alert', 'competitor_profile', SUBJECT, uuidv7(), uuidv7());
    expect(noOwner).toMatchObject({ state: 'open', owner: null, route_roles: ['strategy_owner'] });
    // the ALERT reads seam: the subject's open items under a real read context
    const seen = await underRead(reader, T, D, (tx) => alerts.items(tx, { subjectKind: 'competitor_profile', subjectId: SUBJECT, signalClass: 'domain.alert' }));
    expect(seen.map((i) => i.state).sort()).toEqual(['deprioritized', 'open', 'open']);
    expect(await underRead(uReader, U, DU, (tx) => alerts.items(tx, { subjectKind: 'competitor_profile', subjectId: SUBJECT }))).toEqual([]);
  });

  it('refusal: a class outside the vocabulary, a subject kind outside the CHECK, no title, a close without its actor or reason', async () => {
    await expect(raise('domain.bogus', 'competitor_profile', SUBJECT, uuidv7(), null)).rejects.toThrow(/attention item rejected: domain\.bogus is not a signal class/);
    await expect(raise('domain.alert', 'competitor', SUBJECT, uuidv7(), null)).rejects.toThrow(/attention_items_subject_kind_check/);
    await expect(raise('domain.alert', 'competitor_profile', SUBJECT, uuidv7(), null, '  ')).rejects.toThrow(/an item has a title/);
    await expect(close('domain.alert', SUBJECT, 'decided', null)).rejects.toThrow(/a closure names the principal/);
    await expect(close('domain.alert', SUBJECT, 'no')).rejects.toThrow(/a closure states its reason/);
    // the helpers are internal: no runtime role may execute them
    for (const fn of ['executive.b33_raise_routed', 'executive.b33_close_items']) {
      for (const role of ['eye_app', 'eye_commit', 'public']) {
        const r = await one(sql`select bool_or(has_function_privilege(${role}, p.oid, 'EXECUTE')) as r from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname || '.' || p.proname = ${fn}`);
        expect(r['r'], `${role} on ${fn}`).toBe(false);
      }
    }
  });

  it('recovery: the deciding act closes every open item of the subject with `item.closed` and its reason; a second close closes nothing; another subject is untouched', async () => {
    const closed = await close('domain.alert', SUBJECT, 'the material assessment was approved (profile v2)');
    expect(closed).toHaveLength(3);
    const states = await rows(sql`select state, closed_by::text as by, closed_at is not null as at from executive.attention_items where subject_id = ${SUBJECT}::uuid`);
    expect(states.every((s) => s['state'] === 'closed' && s['by'] === strategist.principalId && s['at'] === true)).toBe(true);
    const ev = await rows(sql`select details from executive.attention_item_events where event = 'item.closed' and item_id = any(${closed}::uuid[])`);
    expect(ev).toHaveLength(3);
    expect(ev[0]!['details']).toMatchObject({ reason: 'the material assessment was approved (profile v2)', signal_class: 'domain.alert', closed_by: 'b33' });
    expect(await close('domain.alert', SUBJECT, 'nothing left to close')).toEqual([]);
    expect((await one(sql`select state from executive.attention_items where subject_id = ${SUBJECT2}::uuid`))['state']).toBe('deprioritized');
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('P3 · the citation kinds `scenario` and `estimate` (twin.citations_ok, tse_material_substantiated, the dependency kind)', () => {
  const D64 = 'a'.repeat(64);
  const ok = async (c: unknown) => (await one(sql`select twin.citations_ok(${JSON.stringify(c)}::jsonb) as r`))['r'];
  const scenario = (extra: Row = {}) => ({ kind: 'scenario', id: uuidv7(), version: 3, digest: D64, ...extra });
  const estimate = (extra: Row = {}) => ({ kind: 'estimate', id: uuidv7(), version: 1, digest: D64, ...extra });
  const element = (kind: string, citations: unknown[]) => sql`insert into b33p_elements (element_id, scope, tenant_id, domain_id, twin_id, version, key, kind, value, material, citations, health, grounded_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, ${uuidv7()}::uuid, 1, 'corridor.capacity_share', ${kind}, '0.62'::jsonb, true, ${JSON.stringify(citations)}::jsonb, 'complete', ${strategist.principalId}::uuid, ${uuidv7()}::uuid)`;

  it('positive: both kinds accepted in their shapes; an element resting only on a scenario or an estimate citation is substantiated', async () => {
    expect(await ok([scenario()])).toBe(true);
    expect(await ok([scenario({ branch: uuidv7() })])).toBe(true);
    expect(await ok([estimate()])).toBe(true);
    // the table's own CHECKs, copied onto a scratch table (the element ports are the twin's; what is under test is the constraint set)
    await h.su.transaction().execute(async (tx) => {
      await sql`create temp table b33p_elements (like twin.state_elements including constraints including defaults) on commit drop`.execute(tx);
      await element('scenario', [scenario({ branch: uuidv7() })]).execute(tx);
      await element('estimated', [estimate()]).execute(tx);
      await element('estimated', [estimate(), { kind: 'evidence', id: uuidv7(), version: 1, digest: D64 }]).execute(tx);
    });
    const def = String((await one(sql`select pg_get_constraintdef(oid) as d from pg_constraint where conname = 'dependencies_depends_on_kind_check' and conrelid = 'graph.dependencies'::regclass`))['d']);
    expect(def).toMatch(/'estimate'/);
  });

  it('refusal: a malformed branch, an estimate not at version 1, an unknown kind; an element resting only on an entity still substantiates nothing', async () => {
    expect(await ok([scenario({ branch: 'blockade' })])).toBe(false);
    expect(await ok([scenario({ branch: 7 })])).toBe(false);
    expect(await ok([estimate({ version: 2 })])).toBe(false);
    expect(await ok([{ kind: 'rumour', id: uuidv7(), version: 1, digest: D64 }])).toBe(false);
    await expect(h.su.transaction().execute(async (tx) => {
      await sql`create temp table b33p_elements (like twin.state_elements including constraints including defaults) on commit drop`.execute(tx);
      await element('estimated', [{ kind: 'entity', id: uuidv7(), version: 1, digest: D64 }]).execute(tx);
    })).rejects.toThrow(/tse_material_substantiated/);
  });

  it('recovery: every form valid before stays valid (the seven kinds as they were; every stored element still passes)', async () => {
    for (const kind of ['evidence', 'claim', 'entity', 'forecast', 'assumption', 'run', 'twin']) expect(await ok([{ kind, id: uuidv7(), version: 2, digest: D64 }]), kind).toBe(true);
    expect(await ok([{ kind: 'evidence', id: uuidv7(), version: 2, digest: D64, branch: 'ignored on the other kinds' }])).toBe(true);
    expect((await one(sql`select count(*)::int as n from twin.state_elements where not twin.citations_ok(citations)`))['n']).toBe(0);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('P4 · the agent kind domain_intelligence (task domain_scan)', () => {
  let agentId = '';
  const base = () => ({ kind: 'domain_intelligence', version: DOMAIN_INTELLIGENCE_AGENT_VERSION, codeDigest: DOMAIN_INTELLIGENCE_AGENT_DIGEST, ownerPrincipalId: strategist.principalId,
    escalationPrincipalId: dadmin.principalId, budgets: { max_reads: 20, max_gateway_calls: 0, max_elapsed_ms: 120_000 }, stopConditions: [{ kind: 'max_items', value: 5 }] });
  const register = (payload: Row) => exec.registerAgent(h.req(tadmin, 'agent.register', 'AGT', null, 'platform.administration'), T, D, { payload } as never) as unknown as Promise<{ agent: { agentId: string; principalId: string; role: string; kind: string } }>;
  const run = (task: string) => exec.runAgent(h.req(dadmin, 'agent.trigger', 'AGT', agentId, 'intelligence'), T, D, agentId, { payload: { task } } as never) as unknown as Promise<{ run: Row }>;

  it('positive: registered with this runtime\'s identity (role domain_intelligence_agent); its run opens under its own session and finishes (the null scan, said)', async () => {
    const reg = (await register(base())).agent;
    expect(reg).toMatchObject({ role: 'domain_intelligence_agent', kind: 'domain_intelligence' });
    agentId = reg.agentId;
    expect(await one(sql`select agent_kind, stop_conditions from executive.agents where agent_id = ${agentId}::uuid`)).toMatchObject({ agent_kind: 'domain_intelligence', stop_conditions: [{ kind: 'max_items', value: 5 }] });
    const out = await run('domain_scan');
    expect(out.run).toMatchObject({ outcome: 'finished' });
    const r = await one(sql`select task, outcome, agent_kind, principal_id::text as p, outputs from executive.agent_runs where agent_id = ${agentId}::uuid`);
    expect(r).toMatchObject({ task: 'domain_scan', outcome: 'finished', agent_kind: 'domain_intelligence', p: reg.principalId });
    /* B33 §CI moved this pin: §CI's real domain scan is installed (DomainScanBridge) — with nothing watched it reads nothing and proposes nothing,
       and says so as an agent-produced output (the null scan's `note` is the prelude-only build's) */
    expect(r['outputs']).toMatchObject({ scanned: 0, proposed: [], marked: expect.stringMatching(/^agent-produced/), agent: expect.objectContaining({ agent_kind: 'domain_intelligence' }) });
  });

  it('refusal: a foreign digest at registration; an unknown kind; the kind asked to run another kind\'s task', async () => {
    expect(await refusedWith(register({ ...base(), codeDigest: 'b'.repeat(64) }))).toMatch(/a domain_intelligence agent is registered with this runtime's scan/);
    expect(await refusedWith(register({ ...base(), kind: 'oracle' }))).toBe('kind is decision, briefing, reporting, attention, weak_signal, risk, opportunity, supply_chain, reconciliation or domain_intelligence');
    expect(await refusedWith(run('supply_scan'))).toMatch(/a domain_intelligence agent does not run the task supply_scan/);
    // the refused open left no run behind (the port refused before the insert)
    const ws = await one(sql`select count(*)::int as n from executive.agent_runs where agent_id = ${agentId}::uuid`);
    expect(ws['n']).toBe(1);
  });

  it('recovery: the same agent runs its own task again; the registry lists one domain_intelligence agent', async () => {
    expect((await run('domain_scan')).run).toMatchObject({ outcome: 'finished' });
    expect((await one(sql`select count(*)::int as n from executive.agent_runs where agent_id = ${agentId}::uuid and outcome = 'finished' and task = 'domain_scan'`))['n']).toBe(2);
    expect((await one(sql`select count(*)::int as n from executive.agents where tenant_id = ${T}::uuid and agent_kind = 'domain_intelligence'`))['n']).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════════════════════════════
describe('P5 · the `domain.` entitlement (domain_package v2, 0111 §0.7) — runs LAST: it contracts the harness tenant', () => {
  const PK = { core: `b33p-core-${RUN}`, dom: `b33p-domain-${RUN}` };
  const SKU = { core: `EYE-B33P-CORE-${RUN}`.toUpperCase(), dom: `EYE-B33P-DOM-${RUN}`.toUpperCase() };
  const ACTION = 'domain.package.declare';
  /** The PDP's decision for a `domain.*` sentinel action is a real allowed rule's (none exists before §PK/§CI); the availability gate after it is what is tested. */
  const stubPdp = () => {
    const pdp = h.app.get(PdpService);
    const orig = pdp.evaluate.bind(pdp);
    return vi.spyOn(pdp, 'evaluate').mockImplementation((input) => orig(input.action.startsWith('domain.') ? { ...input, action: 'simulation.experiment.declare' } : input));
  };

  it('positive: the catalogue — domain_package v2 claims domain. (built), v1 superseded, the declaration recorded with its reason; an uncontracted tenant is never gated', async () => {
    const caps = await rows(sql`select version, status, action_prefixes, built from commercial.capabilities where capability_key = 'domain_package' order by version`);
    expect(caps).toEqual([expect.objectContaining({ version: 1, status: 'superseded', action_prefixes: [], built: false }), expect.objectContaining({ version: 2, status: 'active', action_prefixes: ['domain.'], built: true })]);
    const ev = await one(sql`select event, reason, details from commercial.entitlement_events where subject_key = 'domain_package' and version = 2`);
    expect(ev).toMatchObject({ event: 'capability.declared', details: expect.objectContaining({ prefixes: ['domain.'], supersedes: 1 }) });
    expect(String(ev['reason'])).toMatch(/^B33 \(0111 §0\.7\)/);
    expect(await one(sql`select (commercial.cen_action_capability(${ACTION})).capability_key as k`)).toMatchObject({ k: 'domain_package' });
    expect(await availability(T, ACTION)).toMatchObject({ available: true, contracted: false, state: 'uncontracted', capability: expect.objectContaining({ key: 'domain_package', version: 2 }) });
    const spy = stubPdp();
    try { expect(await reach(omni, ACTION)).toBe('reached'); } finally { spy.mockRestore(); }
  });

  it('refusal: a contracted tenant whose licence lacks domain_package — a domain.* write answers EYE-ENT-001 / 403, recorded; a human-gated domain act stays exempt', async () => {
    await vapi.declarePackage(vreq(vendor, 'commercial.offer.package'), { payload: { key: PK.core, expectedVersion: 0, title: 'Core only (SYNTHETIC)', capabilities: [], tier: 'foundation', reason: 'the core package of the prelude harness' } });
    await vapi.declarePackage(vreq(vendor, 'commercial.offer.package'), { payload: { key: PK.dom, expectedVersion: 0, title: 'Domain packages (SYNTHETIC)', capabilities: ['domain_package'], tier: 'strategic_cell', reason: 'the domain-package capability for the prelude harness' } });
    for (const [code, pkg] of [[SKU.core, PK.core], [SKU.dom, PK.dom]] as const) {
      await vapi.declareSku(vreq(vendor, 'commercial.offer.sku'), { payload: { code, expectedVersion: 0, title: `${pkg} 12 months`, packageKey: pkg, termMonths: 12, reason: 'a twelve-month synthetic term' } });
    }
    const lic = await vapi.issueLicence(vreq(vendor, 'commercial.licence.issue'), T, { payload: { skuCode: SKU.core, orderRef: `SYNTH-B33P-${RUN}-1`, reason: 'the core licence of the prelude harness tenant' } }) as unknown as { licence: Row };
    expect(lic.licence).toMatchObject({ version: 1, capabilities: ['attention_controls', 'core'] });
    expect(await availability(T, ACTION)).toMatchObject({ available: false, contracted: true, reason: expect.stringMatching(/^capability unavailable \(entitlement\): domain_package is not licensed for this tenant \(active; licence v1\)/) });
    expect(await availability(T, 'domain.package.approve', true)).toMatchObject({ available: true, exemption: 'human_gate' });
    expect(await availability(T, 'domain.package.read')).toMatchObject({ available: true, exemption: 'read_existing' });
    const spy = stubPdp();
    try {
      const r = await reach(omni, ACTION);
      expect(r).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
      expect((r as { message: string }).message).toMatch(/^capability unavailable \(entitlement\): domain_package is not licensed/);
      expect(await reach(omni, 'domain.competitor.propose')).toMatchObject({ status: 403, code: 'EYE-ENT-001' });
      // the uncontracted tenant is untouched by T's licence
      expect(await availability(U, ACTION)).toMatchObject({ available: true, contracted: false });
    } finally { spy.mockRestore(); }
  });

  it('recovery: the licence reissued with domain_package — the same domain.* write passes the gate', async () => {
    const lic = await vapi.issueLicence(vreq(vendor, 'commercial.licence.issue'), T, { payload: { skuCode: SKU.dom, orderRef: `SYNTH-B33P-${RUN}-2`, reason: 'the tenant adds the domain-package capability' } }) as unknown as { licence: Row };
    expect(lic.licence).toMatchObject({ version: 2, capabilities: expect.arrayContaining(['domain_package']) });
    expect(await availability(T, ACTION)).toMatchObject({ available: true, reason: 'licensed: domain_package under licence v2 (active)' });
    const spy = stubPdp();
    try { expect(await reach(omni, ACTION)).toBe('reached'); } finally { spy.mockRestore(); }
  });
});
