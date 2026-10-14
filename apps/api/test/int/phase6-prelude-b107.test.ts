/**
 * CP-6 B107 §0 (migration 0115 §0) — THE PRELUDE of product governance: the five PLATFORM roles, the vocabularies (copied whole + B107's),
 * the generalised APPROVER TEST (a named human at a covering scope; never the proposer, never a builder, never an agent), the ARTIFACTS (one
 * current version per kind + key + owner scope), the LINKS (append-only; retired by a later row; the live view), the platform SIGNATURES and
 * the HOLDS (append-only / lifted, never deleted), the ledger and RLS on every shared table. Every row here is SYNTHETIC fixture data.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const RUN = uuidv7().slice(-6);
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const failure = async (q: ReturnType<typeof sql>): Promise<string> => q.execute(h.su).then(() => 'no error', (e: unknown) => (e instanceof Error ? e.message : String(e)));

async function principal(kind: 'human' | 'agent', label: string, scope: 'PLATFORM' | 'TENANT' = 'PLATFORM'): Promise<string> {
  const id = uuidv7();
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${scope}, ${scope === 'PLATFORM' ? null : T()}::uuid, null, ${`b107-${label}-${id.slice(-8)} (SYNTHETIC)`}, ${`b107-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  return id;
}
async function bind(principalId: string, role: string, scope: 'PLATFORM' | 'TENANT' | 'DOMAIN'): Promise<string> {
  const id = uuidv7();
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
            values (${id}::uuid, ${principalId}::uuid, ${role}, ${scope}, ${scope === 'PLATFORM' ? null : T()}::uuid, ${scope === 'DOMAIN' ? D() : null}::uuid)`.execute(h.su);
  return id;
}
const approver = (actor: string, roles: string[], proposer: string | null, builders: string[] | null, tenant: string | null = null, domain: string | null = null) =>
  failure(sql`select governance.assert_approver('acceptance record', ${actor}::uuid, ${tenant}::uuid, ${domain}::uuid, ${roles}::text[], ${proposer}::uuid, ${builders}::uuid[], 'accepting the capability')`);
const artifact = (id: string, version: number, kind: string, key: string, superseded = false) =>
  sql`insert into governance.artifacts (artifact_id, version, scope, kind, external_key, title, digest, recorded_by, correlation_id, superseded_at)
      values (${id}::uuid, ${version}, 'PLATFORM', ${kind}, ${key}, ${`${key} (SYNTHETIC)`}, ${'a'.repeat(64)}, ${uuidv7()}::uuid, ${uuidv7()}::uuid, ${superseded ? new Date().toISOString() : null}::timestamptz)`;

beforeAll(async () => { h = await Phase4Harness.boot(); }, 300_000);
afterAll(async () => { await h?.close(); });

describe('§0.2–§0.3 · roles and vocabularies', () => {
  it('the five PLATFORM roles', async () => {
    const r = (await sql<{ code: string; scope: string }>`select code, scope from identity.roles where code in ('product_authority','design_system_authority','independent_assurance','operations_authority','conformance_steward') order by code`.execute(h.su)).rows;
    expect(r.map((x) => x.scope)).toEqual(['PLATFORM', 'PLATFORM', 'PLATFORM', 'PLATFORM', 'PLATFORM']);
    expect(r).toHaveLength(5);
  });
  it('attention classes, subject kinds, task and timer kinds, signature kinds include B107\'s and keep B94\'s', async () => {
    const v = await one(sql`select executive.attention_signal_classes() as c, executive.human_task_kinds() as k, executive.task_subject_kinds() as s, executive.workflow_timer_kinds() as t,
      (select pg_get_constraintdef(oid) from pg_constraint where conname = 'signatures_subject_kind_check') as sig,
      (select pg_get_constraintdef(oid) from pg_constraint where conname = 'attention_items_subject_kind_check') as subj`);
    expect(v['c']).toEqual(expect.arrayContaining(['support.access', 'responsibility.gap', 'governance.exception', 'governance.acceptance', 'governance.conformance', 'governance.conflict', 'governance.ownership']));
    expect(v['k']).toEqual(expect.arrayContaining(['support.access_review', 'governance.attest', 'governance.exception_review', 'governance.stewardship', 'governance.design_review']));
    expect(v['s']).toEqual(expect.arrayContaining(['support_grant', 'acceptance_record', 'governance_exception', 'release_candidate']));
    expect(v['t']).toEqual(expect.arrayContaining(['support_access.expiry', 'acceptance.evidence_expiry', 'exception.expiry', 'stewardship.sla']));
    for (const k of ['admission_record', 'acceptance_attestation', 'design_acceptance']) expect(String(v['sig'])).toContain(`'${k}'`);
    for (const k of ['responsibility_matrix', 'acceptance_record', 'change_proposal']) expect(String(v['subj'])).toContain(`'${k}'`);
  });
});

describe('§0.4 · the approver test, generalised', () => {
  let authority = ''; let proposer = ''; let builder = ''; let agent = ''; let plain = ''; let sponsor = '';
  beforeAll(async () => {
    authority = await principal('human', 'assurance'); await bind(authority, 'independent_assurance', 'PLATFORM');
    proposer = await principal('human', 'proposer'); await bind(proposer, 'independent_assurance', 'PLATFORM');
    builder = await principal('human', 'builder'); await bind(builder, 'independent_assurance', 'PLATFORM');
    agent = await principal('agent', 'agent'); await bind(agent, 'independent_assurance', 'PLATFORM');
    plain = await principal('human', 'plain');
    sponsor = await principal('human', 'sponsor', 'TENANT'); await bind(sponsor, 'customer_sponsor', 'TENANT');
  });
  it('positive: a named human at a covering scope (a PLATFORM binding covers a domain; a TENANT binding its tenant)', async () => {
    expect(await approver(authority, ['independent_assurance'], proposer, [builder], T(), D())).toBe('no error');
    expect(await approver(sponsor, ['customer_sponsor'], proposer, [builder], T(), D())).toBe('no error');
  });
  it('refusals: an agent (actor) · without the role (authority) · the proposer (no self-acceptance) · a builder (independence) · another tenant\'s sponsor', async () => {
    expect(await approver(agent, ['independent_assurance'], proposer, [builder])).toMatch(/^acceptance record rejected \(actor\)/);
    expect(await approver(plain, ['independent_assurance'], proposer, [builder])).toMatch(/^acceptance record rejected \(authority\)/);
    expect(await approver(proposer, ['independent_assurance'], proposer, [builder])).toMatch(/^acceptance record rejected \(separation_of_duties\): .* never done by its proposer \(no self-acceptance\)/);
    expect(await approver(builder, ['independent_assurance'], proposer, [builder])).toMatch(/^acceptance record rejected \(separation_of_duties\): .* never done by a builder of the subject \(independence\)/);
    expect(await approver(sponsor, ['customer_sponsor'], proposer, [builder], uuidv7(), null)).toMatch(/\(authority\)/);
  });
});

describe('§0.6 · artifacts, links, signatures, holds; the ledger; RLS', () => {
  it('one CURRENT version per kind + key + scope owner; a superseded version beside it; an unknown kind refused', async () => {
    const a = uuidv7(); const key = `V9:TEST-${RUN}`;
    await artifact(a, 1, 'requirement', key).execute(h.su);
    expect(await failure(artifact(uuidv7(), 1, 'requirement', key))).toMatch(/gar_key_current/);
    await sql`update governance.artifacts set superseded_at = clock_timestamp() where artifact_id = ${a}::uuid and version = 1`.execute(h.su);
    await artifact(a, 2, 'requirement', key).execute(h.su);
    expect(await one(sql`select count(*)::int as n from governance.artifacts where artifact_id = ${a}::uuid and superseded_at is null`)).toEqual({ n: 1 });
    expect(await failure(artifact(uuidv7(), 1, 'spreadsheet', `X-${RUN}`))).toMatch(/artifacts_kind_check|check constraint/);
  });
  it('links are append-only; a link is retired by a later row; the live view omits it; a self-link refused', async () => {
    const a = uuidv7(); const b = uuidv7(); const l = uuidv7();
    await sql`insert into governance.links (link_id, scope, from_artifact, to_artifact, relation, recorded_by, correlation_id) values (${l}::uuid, 'PLATFORM', ${a}::uuid, ${b}::uuid, 'verifies', ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    expect(await failure(sql`update governance.links set relation = 'cites' where link_id = ${l}::uuid`)).toMatch(/append-only|append only/i);
    expect(await one(sql`select count(*)::int as n from governance.links_live where link_id = ${l}::uuid`)).toEqual({ n: 1 });
    await sql`insert into governance.links (link_id, scope, from_artifact, to_artifact, relation, retired, retires_link, recorded_by, correlation_id) values (${uuidv7()}::uuid, 'PLATFORM', ${a}::uuid, ${b}::uuid, 'verifies', true, ${l}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    expect(await one(sql`select count(*)::int as n from governance.links_live where from_artifact = ${a}::uuid`)).toEqual({ n: 0 });
    expect(await failure(sql`insert into governance.links (link_id, scope, from_artifact, to_artifact, relation, recorded_by, correlation_id) values (${uuidv7()}::uuid, 'PLATFORM', ${a}::uuid, ${a}::uuid, 'cites', ${uuidv7()}::uuid, ${uuidv7()}::uuid)`)).toMatch(/gln_not_self/);
  });
  it('platform signatures are append-only and one per signer per subject version; a hold is lifted with its reason, never deleted', async () => {
    const s = uuidv7(); const subject = uuidv7(); const signer = uuidv7();
    const ins = (id: string) => sql`insert into governance.signatures (signature_id, scope, subject_kind, subject_id, subject_version, subject_digest, signer, signer_role, key_id, algorithm, signature, bound_action, correlation_id)
      values (${id}::uuid, 'PLATFORM', 'baseline_decision', ${subject}::uuid, 1, ${'b'.repeat(64)}, ${signer}::uuid, 'product_authority', 'demo', 'ed25519', 'sig', 'governance.baseline.decide', ${uuidv7()}::uuid)`;
    await ins(s).execute(h.su);
    expect(await failure(ins(uuidv7()))).toMatch(/gsg_one_per_signer/);
    expect(await failure(sql`delete from governance.signatures where signature_id = ${s}::uuid`)).toMatch(/append-only|append only/i);
    const hold = uuidv7();
    await sql`insert into governance.holds (hold_id, scope, subject_artifact, reason_kind, reason, opened_by, correlation_id) values (${hold}::uuid, 'PLATFORM', ${subject}::uuid, 'exception_expired', 'an exception on the export path expired (SYNTHETIC)', ${signer}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    expect(await failure(sql`update governance.holds set lifted_at = clock_timestamp() where hold_id = ${hold}::uuid`)).toMatch(/ghd_lifted/);
    await sql`update governance.holds set lifted_at = clock_timestamp(), lifted_by = ${signer}::uuid, lift_reason = 'renewed with current evidence' where hold_id = ${hold}::uuid`.execute(h.su);
  });
  it('the ledger is append-only; every shared table forces RLS', async () => {
    const id = (await one(sql`select governance.ledger(null, null, 'baseline', ${uuidv7()}::uuid, 1, 'baseline.signed', ${uuidv7()}::uuid, '{}'::jsonb, ${uuidv7()}::uuid) as id`))['id'];
    expect(await failure(sql`delete from governance.events where event_id = ${String(id)}::uuid`)).toMatch(/append-only|append only/i);
    const forced = (await sql<{ t: string; f: boolean }>`select c.relname as t, c.relforcerowsecurity as f from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'governance' and c.relkind = 'r' order by 1`.execute(h.su)).rows;
    expect(forced.map((r) => r.t)).toEqual(['artifacts', 'events', 'holds', 'links', 'signatures']);
    expect(forced.every((r) => r.f)).toBe(true);
  });
});
