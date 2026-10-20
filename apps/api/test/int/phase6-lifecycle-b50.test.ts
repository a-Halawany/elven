/**
 * CP-6 B50 §LC (migration 0120_b50_x_lc) — THE GOVERNED WORK-OBJECT LIFECYCLE (F-P3-02: PR-06-001/002/003/005/006, CAP-AU-07, AT-06, ADR-006;
 * F-P3-01: V03-T-021, V04-T-006; F-P7-F-03: V01-T-046) on a real database through the real pipeline, the PDP, the ports and the controllers.
 * CONSTRUCTION evidence: every persona, assessment, proposal and contract here is SYNTHETIC; nothing here demonstrates or accepts anything.
 *
 *   LC0 · THE VOCABULARY AND THE PROFILES (ADR-006, V04-T-006): the CHECK widened (the eight states distinct, the old nine kept), the header
 *         semantics copied with it; twelve profiles, each state mapped to a canonical word, each module type on its own port, re-entries typed;
 *         the three write actions pinned to ASM; the generic create refused for an assessment (no second write path).
 *   LC1 · THE SCENE (PR-06-001/003/005): D. Ivanova authors the Red Sea assessment (draft); K. Müller reviews it and is refused publishing
 *         (not the owner); the extraction agent is refused by the human gate and only PROPOSES, which the owner declines; the owner
 *         publishes; a stale second tab is REJECTED and kept; the repeated key answers the first result; corrected; retired; replay at every
 *         recorded instant; the stored rows rebuild to their digests.
 *   LC2 · AUTHORITY AND SEPARATION (PR-06-003, AT-06 unauthorized-role): the author never reviews or approves; the reviewer never approves; a
 *         role outside the profile refused; approval then publication; withdrawal terminal (MET-008's rule kept).
 *   LC3 · RE-ENTRY, COMPENSATION, ORDER (V03-T-021, PR-06-005): an untyped return refused; a typed re-entry with its cause; a compensation
 *         undoing the last transition (kept as compensated); out-of-order, unknown, mismatched, content-less and ownerless attempts rejected
 *         and kept; two concurrent publishes — one accepted, one stale; a module-owned type refused (its own port).
 *   LC4 · PROPOSALS (PR-06-003): a view proposes, the owner accepts (the transition carries the proposal as its cause); decided once; the
 *         proposer's channel matches its kind; a stale proposal refused; a refused acceptance leaves the proposal open.
 *   LC5 · READS, RECONCILE, RLS, GRANTS (PR-06-002, AT-06 cross-tenant): the history with the unresolved; the reconciliation (planted
 *         disagreements inside a rolled-back transaction); another tenant refused; no write grant; append-only; the ports eye_commit's.
 *   LC6 · EXPORT / RE-IMPORT (PR-06-006): the history exported, verified on re-import (digests recomputed, replay re-derived); a tampered
 *         document refused.
 *   LC7 · LIFECYCLE COVERAGE (V01-T-046): the registered computation through the compute port on an approved (planted) definition — the
 *         work objects counted, each excluded object with its reason; a window before the register existed is INDETERMINATE.
 *   LC8 · THE CONTINUITY CONTRACT (PR-06-005, AT-06's fault exercise): "lifecycle register unavailable" declared through B81's degraded
 *         contracts against the audit journal — evaluated active (the lifecycle acts unavailable, its reads available) when the journal is
 *         degraded, by the process journal and by an open incident (inside a rolled-back transaction).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { LifecycleController } from '../../src/objects/lifecycle/lifecycle.controller.js';
import { asLifecycleRefusal } from '../../src/objects/lifecycle/lifecycle-logic.js';
import { ObjectsController } from '../../src/objects/objects.controller.js';
import { rebuildHeaderFromRow, type ObjectRow } from '../../src/objects/objects.service.js';
import { DegradedPlatformController } from '../../src/shell/degraded/degraded.controller.js';
import { AnalyticsComputeController } from '../../src/analytics/compute/compute.controller.js';
import { definitionsA } from '../../src/analytics/computations-a/definitions-a.js';
import type { MetricContract } from '../../src/analytics/contract.js';
import { WORK_OBJECT_STATES } from '../../src/objects/b50-seams.js';
import { Phase4Harness } from './phase4-helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let lc: LifecycleController; let oc: ObjectsController; let pc: DegradedPlatformController; let cc: AnalyticsComputeController;
let T = ''; let D = ''; let T2 = ''; let D2 = '';
const T0 = () => T; const D0 = () => D;
let other: AuthenticatedPrincipal;  // a domain_analyst of ANOTHER tenant (SYNTHETIC)
const RUN = uuidv7().slice(-6);
let ivanova: AuthenticatedPrincipal;   // domain_specialist — the author and accountable owner (SYNTHETIC)
let muller: AuthenticatedPrincipal;    // knowledge_owner — the reviewer (SYNTHETIC)
let adler: AuthenticatedPrincipal;     // record_authority — an approver (SYNTHETIC)
let okafor: AuthenticatedPrincipal;    // an AGENT holding extraction_agent (SYNTHETIC)
let operator: AuthenticatedPrincipal;  // simulation_operator — no lifecycle authority (SYNTHETIC)
let haas: AuthenticatedPrincipal;      // a second author whose account is suspended later (ownerless) (SYNTHETIC)
let ops: AuthenticatedPrincipal;       // operations_authority (PLATFORM) — declares the audit journal's contract (SYNTHETIC)
let analyst: AuthenticatedPrincipal;   // product_analyst — computes the measure (SYNTHETIC)
let paOwner: AuthenticatedPrincipal;   // product_analytics_owner — owns the planted definition (SYNTHETIC)

const H64 = (s: string) => createHash('sha256').update(s).digest('hex');
const key = (label: string) => `b50lc-${label}-${uuidv7()}`;
const rq = (p: AuthenticatedPrincipal, action: string, type: string = 'ASM', id: string | null = null, t = T, d = D) => {
  const r = h.req(p, action, type, id, 'intelligence') as { eyeEnvelope: Row };
  r.eyeEnvelope['tenant_id'] = t; r.eyeEnvelope['domain_id'] = d;
  return r as never;
};
const prq = (p: AuthenticatedPrincipal, action: string) => {
  const r = h.req(p, action, 'SDG', null, 'observation') as { eyeEnvelope: Row };
  r.eyeEnvelope['scope'] = 'PLATFORM'; r.eyeEnvelope['tenant_id'] = null; r.eyeEnvelope['domain_id'] = null;
  return r as never;
};
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string; body: Row; raw: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof Error && e.message === 'the call should have been refused') throw e;
  const raw = e instanceof Error ? e.message : String(e);
  const m1 = asLifecycleRefusal(e, 'harness');
  const m = m1 instanceof HttpException ? m1 : asObservationRefusal(e, 'harness');
  if (m instanceof HttpException) { const b = m.getResponse() as Row; return { status: m.getStatus(), message: String(b['message'] ?? m.message), body: b, raw }; }
  return { status: null, message: raw, body: {}, raw };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => { const r = await refusal(p); expect(r.message).toMatch(re); expect(r.status, r.message).toBe(status); return r; };
const one = async (q: ReturnType<typeof sql>) => ((await q.execute(h.su)).rows[0] ?? {}) as Row;
const rows = async (q: ReturnType<typeof sql>) => (await q.execute(h.su)).rows as Row[];

/* the routes */
type TOut = { transition: Row; receipt: Row };
const author = (as: AuthenticatedPrincipal, over: Row = {}) => lc.author(rq(as, 'objects.work_object.author'), T, D, { payload: {
  objectType: 'ASM', title: 'Red Sea corridor assessment — Bab el-Mandeb, January 2024 (SYNTHETIC)',
  statement: 'Container transits through Bab el-Mandeb fell sharply in January 2024; carriers rerouted via the Cape; the corridor stays disrupted (SYNTHETIC).',
  body: { scope: 'The Red Sea corridor (Bab el-Mandeb)', judgement: 'disrupted', horizon: '90 days' }, evidenceRefs: [], classification: 'internal', purposeScope: 'intelligence',
  synthetic: true, idempotencyKey: key('author'), ...over } }) as unknown as Promise<TOut>;
const move = (as: AuthenticatedPrincipal, id: string, payload: Row, t = T, d = D) =>
  lc.transition(rq(as, 'objects.lifecycle.transition', 'ASM', id, t, d), t, d, 'ASM', id, { payload: { idempotencyKey: key('move'), ...payload } }) as unknown as Promise<TOut>;
const history = (as: AuthenticatedPrincipal, id: string, t = T, d = D) => lc.history(rq(as, 'objects.lifecycle.read', 'ASM', id, t, d), t, d, 'ASM', id) as unknown as Promise<{ lifecycle: Row; receipt: Row }>;
const replay = (as: AuthenticatedPrincipal, id: string, asOf: string) => lc.replay(rq(as, 'objects.lifecycle.read', 'ASM', id), T, D, 'ASM', id, { payload: { asOf } }) as unknown as Promise<{ replay: Row }>;
const propose = (as: AuthenticatedPrincipal, id: string, payload: Row) =>
  lc.propose(rq(as, 'objects.lifecycle.propose', 'ASM', id), T, D, 'ASM', id, { payload: { requestId: uuidv7(), ...payload } }) as unknown as Promise<{ proposal: Row }>;
const decide = (as: AuthenticatedPrincipal, id: string, proposalId: string, payload: Row) =>
  lc.decide(rq(as, 'objects.lifecycle.proposal.decide', 'ASM', id), T, D, 'ASM', id, proposalId, { payload: { requestId: uuidv7(), idempotencyKey: key('decide'), ...payload } }) as unknown as Promise<{ decision: Row }>;
const current = async (id: string) => one(sql`select object_version::int v, lifecycle_state s, truth_state t, recorded_at, payload, correction_of, withdrawal_reason, human_refs
  from objects.canonical_objects where object_id = ${id}::uuid order by object_version desc limit 1`);
const ledger = async (id: string) => rows(sql`select * from objects.lifecycle_transitions where object_id = ${id}::uuid order by recorded_at, transition_id`);
/** a draft authored, reviewed by Müller, optionally published by the owner — the scaffolding of the later sections */
async function reviewed(owner: AuthenticatedPrincipal = ivanova, title = `Corridor assessment ${uuidv7().slice(-6)} (SYNTHETIC)`): Promise<string> {
  const id = String((await author(owner, { title })).transition['object_id']);
  await move(muller, id, { expectedVersion: 1, action: 'review', reason: 'Findings: the evidence supports the judgement (SYNTHETIC)' });
  return id;
}

async function person(label: string, kind: 'human' | 'agent', roles: Array<{ role: string; scope: 'PLATFORM' | 'DOMAIN' }>, t0?: string, d0?: string): Promise<AuthenticatedPrincipal> {
  const T = t0 ?? T0(); const D = d0 ?? D0();
  const id = uuidv7(); const platform = roles.every((r) => r.scope === 'PLATFORM');
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${id}::uuid, ${kind}, ${platform ? 'PLATFORM' : 'DOMAIN'}, ${platform ? null : T}::uuid, ${platform ? null : D}::uuid, ${`b50-lc-${label}-${RUN} (SYNTHETIC)`}, ${`b50lc-${label.slice(0, 6)}-${id.slice(-8)}`}, 'active')`.execute(h.su);
  const bindings = roles.map((r) => ({ roleCode: r.role, scope: r.scope, tenantId: r.scope === 'PLATFORM' ? null : T, domainId: r.scope === 'DOMAIN' ? D : null }));
  for (const b of bindings) {
    await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id) values (${uuidv7()}::uuid, ${id}::uuid, ${b.roleCode}, ${b.scope}, ${b.tenantId}::uuid, ${b.domainId}::uuid)`.execute(h.su);
  }
  return h.openSession({ ...h.manager, principalId: id, kind, homeScope: platform ? 'PLATFORM' : 'DOMAIN', homeTenantId: platform ? null : T, homeDomainId: platform ? null : D, bindings } as AuthenticatedPrincipal);
}

beforeAll(async () => {
  h = await Phase4Harness.boot();
  T = h.fx.tenantId; D = h.fx.domainId;
  lc = h.app.get(LifecycleController); oc = h.app.get(ObjectsController); pc = h.app.get(DegradedPlatformController); cc = h.app.get(AnalyticsComputeController);
  ivanova = await h.humanWithSession(['domain_specialist'], 'b50lc-ivanova');
  muller = await h.humanWithSession(['knowledge_owner'], 'b50lc-muller');
  adler = await h.humanWithSession(['record_authority'], 'b50lc-adler');
  operator = await h.humanWithSession(['simulation_operator'], 'b50lc-operator');
  haas = await h.humanWithSession(['domain_specialist'], 'b50lc-haas');
  analyst = await h.humanWithSession(['product_analyst'], 'b50lc-analyst');
  paOwner = await h.humanWithSession(['product_analytics_owner'], 'b50lc-paowner');
  okafor = await person('okafor', 'agent', [{ role: 'extraction_agent', scope: 'DOMAIN' }, { role: 'domain_analyst', scope: 'DOMAIN' }]);   // holds a role the routes admit: the GATE refuses it
  ops = await person('ops', 'human', [{ role: 'operations_authority', scope: 'PLATFORM' }]);
  T2 = uuidv7(); D2 = uuidv7();
  await sql`insert into tenancy.tenants (id, name, status, residency_profile, retention_profile, activated_at) values (${T2}::uuid, ${'b50-lc-other-' + RUN}, 'active', 'EU', 'default', clock_timestamp())`.execute(h.su);
  await sql`insert into tenancy.domains (id, tenant_id, name, status, activated_at) values (${D2}::uuid, ${T2}::uuid, ${'b50-lc-other-domain-' + RUN}, 'active', clock_timestamp())`.execute(h.su);
  other = await person('other', 'human', [{ role: 'domain_analyst', scope: 'DOMAIN' }], T2, D2);
}, 600_000);
afterAll(async () => { await h?.close(); });

describe('LC0 · the vocabulary and the profiles (ADR-006, V04-T-006)', () => {
  it('the lifecycle_state CHECK holds ADR-006\'s eight states DISTINCT beside the nine it had; the header semantics accept them and nothing else', async () => {
    const def = String((await one(sql`select pg_get_constraintdef(c.oid) d from pg_constraint c where c.conrelid = 'objects.canonical_objects'::regclass and c.conname = 'canonical_objects_lifecycle_state_check'`))['d']);
    for (const s of [...WORK_OBJECT_STATES, 'proposed', 'admitted', 'active', 'disputed', 'superseded', 'deleted']) expect(def, s).toContain(`'${s}'`);
    expect(new Set(WORK_OBJECT_STATES).size).toBe(8);
    const probe = String((await author(ivanova, { title: 'A probe assessment for the header semantics (SYNTHETIC)' })).transition['object_id']);
    const row = await one(sql`select objects._lc_header(o) h from objects.canonical_objects o where o.object_id = ${probe}::uuid`);
    const hdr = row['h'] as Row;
    for (const s of WORK_OBJECT_STATES) await sql`select objects.assert_header_semantics(${JSON.stringify({ ...hdr, lifecycle_state: s })}::jsonb)`.execute(h.su);
    const r = await refusal(sql`select objects.assert_header_semantics(${JSON.stringify({ ...hdr, lifecycle_state: 'promoted' })}::jsonb)`.execute(h.su));
    expect(r.message).toMatch(/lifecycle_state promoted is not permitted/);
    expect((await one(sql`select objects.work_object_states() s`))['s']).toEqual([...WORK_OBJECT_STATES]);
  });
  it('twelve profiles: every state mapped to a canonical word with a reconciliation rule; ASM is the work object on objects.transition_lifecycle; every module type keeps its own port; re-entries declare their reasons', async () => {
    const out = (await lc.profiles(rq(muller, 'objects.lifecycle.read'), T, D) as unknown as { profiles: Row[] }).profiles;
    expect(out.map((p) => p['object_type']).sort()).toEqual(['ASM', 'BRF', 'CLM', 'DPK', 'EVD', 'FCT', 'GRV', 'MEM', 'PUB', 'RSK', 'SRC', 'WRN']);
    const canonical = (await one(sql`select objects.lifecycle_canonical_states() s`))['s'] as string[];
    for (const p of out) {
      for (const s of p['states'] as string[]) { expect(canonical, `${p['object_type']} ${s}`).toContain((p['canonical_map'] as Row)[s]); expect(p['consistent'] as Row).toHaveProperty(s); }
      for (const t of p['transitions'] as Row[]) { expect(['owner', 'reviewer', 'approver']).toContain(t['actor']); expect(['forward', 're_entry', 'compensation']).toContain(t['kind']); }
    }
    const asm = out.find((p) => p['object_type'] === 'ASM')!;
    expect(asm).toMatchObject({ governance: 'work_object', owning_port: 'objects.transition_lifecycle', schema_ref: 'ASM@v3' });
    expect((asm['states'] as string[])).toEqual(expect.arrayContaining([...WORK_OBJECT_STATES]));
    expect(out.find((p) => p['object_type'] === 'SRC')).toMatchObject({ governance: 'module', owning_port: 'observation.transition_contract', states: ['draft', 'approved', 'active', 'suspended', 'retired', 'superseded'] });
    expect(out.find((p) => p['object_type'] === 'RSK')!['states']).toEqual(['identified', 'assessed', 'accepted', 'contested', 'sponsored', 'closed']);
    expect(out.find((p) => p['object_type'] === 'MEM')).toMatchObject({ governance: 'module', owning_port: 'memory.item.*' });
    const reentries = out.flatMap((p) => (p['transitions'] as Row[]).filter((t) => t['kind'] === 're_entry').map((t) => [p['object_type'], t['action'], t['reentry_reasons']]));
    expect(reentries).toEqual(expect.arrayContaining([['ASM', 'reopen', ['contradiction', 'fitness_failure', 'policy_change', 'review_finding']], ['DPK', 'reopen', ['policy_change', 'contradiction']]]));
  });
  it('the three write actions are pinned to ASM; the generic create of an assessment is refused (no second write path)', async () => {
    const w = await rows(sql`select action, object_types from observation.canonical_write_actions where action in ('objects.work_object.author', 'objects.lifecycle.transition', 'objects.lifecycle.proposal.decide') order by action`);
    expect(w.map((x) => [x['action'], x['object_types']])).toEqual([['objects.lifecycle.proposal.decide', ['ASM']], ['objects.lifecycle.transition', ['ASM']], ['objects.work_object.author', ['ASM']]]);
    const generic = await h.humanWithSession(['domain_analyst'], 'b50lc-generic');
    const r = await refusal(oc.create(h.req(generic, 'objects.create', 'ASM', null, 'intelligence'), T, D, { payload: {
      objectType: 'ASM', truthState: 'assessed', classification: 'internal', purposeScope: 'intelligence', schemaVersion: 'v3', humanRefs: [`principal:${generic.principalId}`],
      payload: { form: 'work_object', title: 'A generic assessment (SYNTHETIC)', statement: 'Written through the generic create, which must refuse it (SYNTHETIC).', body: {}, act: { action: 'create', by: 'x', at: 'y' } } } }));
    expect(r.raw).toMatch(/admission rejected: action objects\.create may not admit a ASM object — it is written through its own port/);
  });
});

let RED = ''; const AT: Record<string, string> = {};
describe('LC1 · the scene: the Red Sea assessment (PR-06-001/003/005)', () => {
  it('D. Ivanova authors the draft (version 1, she is its owner); the stored row rebuilds to its digest; the repeated key answers the first result', async () => {
    const k = key('red');
    const r = await author(ivanova, { idempotencyKey: k });
    expect(r.transition).toMatchObject({ outcome: 'accepted', action: 'create', from: null, to: 'draft', object_version: 1, repeated: false, actor_class: 'author' });
    expect(r.receipt['policyDecisionId']).toEqual(expect.any(String));
    RED = String(r.transition['object_id']);
    const again = await author(ivanova, { idempotencyKey: k });
    expect(again.transition).toMatchObject({ transition_id: r.transition['transition_id'], repeated: true, object_id: RED });
    expect((await one(sql`select count(*)::int n from objects.canonical_objects where object_id = ${RED}::uuid`))['n']).toBe(1);
    await refused(author(ivanova, { idempotencyKey: k, title: 'Another assessment under the same key (SYNTHETIC)' }), /^work object rejected \(duplicate\): the idempotency key .+ was used for a different command/, 409);
    const row = await one(sql`select * from objects.canonical_objects where object_id = ${RED}::uuid and object_version = 1`);
    expect(row).toMatchObject({ lifecycle_state: 'draft', accountable_owner: `principal:${ivanova.principalId}`, schema_ref: 'ASM@v3', truth_state: 'synthetic', synthetic_state: true, owning_component: 'CP-OBJ-01' });
    expect(canonicalHeaderDigest(rebuildHeaderFromRow(row as unknown as ObjectRow), row['payload'] as Row)).toBe(row['content_digest']);
    AT['draft'] = new Date(row['recorded_at'] as Date).toISOString();
  });
  it('the agent may not author (the human gate) and is refused publishing; it proposes instead — never authoritative', async () => {
    const a = await refusal(author(okafor));
    expect(a.status).toBe(403);
    expect(a.message).toMatch(/human gate/);
    const g = await refusal(move(okafor, RED, { expectedVersion: 1, action: 'publish' }));
    expect(g.status).toBe(403);
    expect(g.message).toMatch(/human gate/);
    expect((await ledger(RED)).map((t) => t['action'])).toEqual(['create']);   // the gate refused before any port: nothing recorded as an attempt
  });
  it('K. Müller reviews (findings recorded on the version); her publishing is refused — not the owner — and the attempt is KEPT with the last authoritative version', async () => {
    const r = await move(muller, RED, { expectedVersion: 1, action: 'review', reason: 'Findings: PortWatch transits and two carrier advisories support the judgement (SYNTHETIC)',
      changes: { evidence_refs: ['EVD:portwatch-chokepoint4@2024-01-15'] } });
    expect(r.transition).toMatchObject({ outcome: 'accepted', from: 'draft', to: 'reviewed', object_version: 2, actor_class: 'reviewer' });
    const c = await current(RED);
    expect(c['payload']).toMatchObject({ review: { reviewer: `principal:${muller.principalId}`, version: 1, evidence_refs: ['EVD:portwatch-chokepoint4@2024-01-15'] } });
    AT['reviewed'] = new Date(c['recorded_at'] as Date).toISOString();
    const x = await refused(move(muller, RED, { expectedVersion: 2, action: 'publish' }), /^lifecycle transition rejected \(authority\): publish is the accountable owner's act/, 403);
    expect(x.body['outcome']).toMatchObject({ outcome: 'rejected', attempted_action: 'publish', last_authoritative_version: 2, refusal: { class: 'authority', code: 'not_owner' } });
    expect((await current(RED))['v']).toBe(2);
  });
  it('the agent\'s proposal to publish is declined by the owner (with why); K. Müller may not decide it', async () => {
    const p = (await propose(okafor, RED, { baseVersion: 2, action: 'publish', via: 'agent', reason: 'The review is complete; publish for the corridor desk (SYNTHETIC agent proposal)' })).proposal;
    expect(p).toMatchObject({ proposer_kind: 'agent', via: 'agent', to_state: 'published', base_version: 2, replayed: false });
    await refused(decide(muller, RED, String(p['proposal_id']), { decision: 'decline', reason: 'Not mine to decide (SYNTHETIC)' }), /^lifecycle proposal rejected \(authority\): only the accountable owner/, 403);
    const d = (await decide(ivanova, RED, String(p['proposal_id']), { decision: 'decline', reason: 'I publish it myself after reading the review (SYNTHETIC)' })).decision;
    expect(d).toMatchObject({ decision: 'declined', transition_id: null });
    await refused(decide(ivanova, RED, String(p['proposal_id']), { decision: 'decline', reason: 'A second decision (SYNTHETIC)' }), /^lifecycle proposal rejected \(state\): proposal .+ is decided already/, 409);
  });
  it('the owner publishes; a stale second tab is REJECTED and kept; the first command repeated answers the first result; the key reused for another command is refused', async () => {
    const k = key('publish');
    const r = await move(ivanova, RED, { expectedVersion: 2, action: 'publish', idempotencyKey: k });
    expect(r.transition).toMatchObject({ outcome: 'accepted', from: 'reviewed', to: 'published', object_version: 3, actor_class: 'owner' });
    AT['published'] = new Date((await current(RED))['recorded_at'] as Date).toISOString();
    const tab2 = await refused(move(ivanova, RED, { expectedVersion: 2, action: 'publish' }), /^lifecycle transition rejected \(stale\): the command expected version 2; the authoritative version is 3 \(published\)/, 409);
    expect(tab2.body['outcome']).toMatchObject({ outcome: 'rejected', attempted_action: 'publish', last_authoritative_version: 3, refusal: { code: 'stale_version' } });
    const again = await move(ivanova, RED, { expectedVersion: 2, action: 'publish', idempotencyKey: k });
    expect(again.transition).toMatchObject({ transition_id: r.transition['transition_id'], repeated: true, object_version: 3 });
    await refused(move(ivanova, RED, { expectedVersion: 3, action: 'retire', reason: 'a different command, the same key (SYNTHETIC)', idempotencyKey: k }), /^lifecycle transition rejected \(duplicate\)/, 409);
    expect((await current(RED))['v']).toBe(3);
    const l = await ledger(RED);
    expect(l.map((t) => [t['action'], t['outcome'], t['refusal_code']])).toEqual([['create', 'accepted', null], ['review', 'accepted', null], ['publish', 'rejected', 'not_owner'],
      ['publish', 'accepted', null], ['publish', 'rejected', 'stale_version']]);
    // the audit: the kept rejection beside a FAILURE audit row (no business effect stamped); the acceptance beside a success
    const aud = await rows(sql`select outcome, result_code from audit.audit_events where action = 'objects.lifecycle.transition' and correlation_id in
      (select correlation_id from objects.lifecycle_transitions where object_id = ${RED}::uuid and action = 'publish') order by audit_seq`);
    expect(aud.map((a) => [a['outcome'], a['result_code']])).toEqual(expect.arrayContaining([['failure', 'EYE-STA-002'], ['success', 'OK']]));
  });
  it('corrected (the content changes, the prior version linked), then retired; every stored version rebuilds to its digest', async () => {
    await refused(move(ivanova, RED, { expectedVersion: 3, action: 'correct', reason: 'a correction with nothing changed (SYNTHETIC)' }), /^lifecycle transition rejected \(transition\): a correction names what changes/, 422);
    const c = await move(ivanova, RED, { expectedVersion: 3, action: 'correct', reason: 'The January figure was restated by the publisher (SYNTHETIC)',
      changes: { statement: 'Container transits through Bab el-Mandeb fell by about two thirds in January 2024 (restated); the corridor stays disrupted (SYNTHETIC).' } });
    expect(c.transition).toMatchObject({ outcome: 'accepted', to: 'corrected', object_version: 4 });
    const cur = await current(RED);
    expect(cur).toMatchObject({ s: 'corrected', correction_of: `${RED}@3` });
    expect(String((cur['payload'] as Row)['statement'])).toMatch(/restated/);
    AT['corrected'] = new Date(cur['recorded_at'] as Date).toISOString();
    const r = await move(ivanova, RED, { expectedVersion: 4, action: 'retire', reason: 'The January 2024 judgement is superseded by the quarterly view (SYNTHETIC)' });
    expect(r.transition).toMatchObject({ outcome: 'accepted', from: 'corrected', to: 'retired', object_version: 5 });
    AT['retired'] = new Date((await current(RED))['recorded_at'] as Date).toISOString();
    await refused(move(ivanova, RED, { expectedVersion: 5, action: 'publish' }), /^lifecycle transition rejected \(state\): publish is offered from reviewed, approved; the object is retired/, 409);
    for (const v of await rows(sql`select * from objects.canonical_objects where object_id = ${RED}::uuid order by object_version`)) {
      expect(canonicalHeaderDigest(rebuildHeaderFromRow(v as unknown as ObjectRow), v['payload'] as Row), `v${v['object_version']}`).toBe(v['content_digest']);
    }
  });
  it('REPLAY at each recorded instant reads draft, reviewed, published, corrected, retired — and nothing before the draft', async () => {
    for (const s of ['draft', 'reviewed', 'published', 'corrected', 'retired']) {
      const r = (await replay(muller, RED, AT[s]!)).replay;
      expect(r, s).toMatchObject({ known: true, state: s, agrees: true, ledger: { state: s } });
    }
    const before = (await replay(muller, RED, new Date(Date.parse(AT['draft']!) - 60_000).toISOString())).replay;
    expect(before).toMatchObject({ known: false, state: null, note: 'nothing of this object was recorded by this instant' });
    const mid = (await replay(muller, RED, AT['published']!)).replay;
    expect(mid['later']).toMatchObject({ versions: 2 });
  });
});

describe('LC2 · authority and separation (PR-06-003, AT-06 unauthorized-role)', () => {
  it('the author never reviews her own draft; a role outside the profile is refused; the reviewer never approves; a third person approves; the owner publishes from approved', async () => {
    const id = String((await author(ivanova, { title: 'Suez corridor assessment — approval path (SYNTHETIC)' })).transition['object_id']);
    await refused(move(ivanova, id, { expectedVersion: 1, action: 'review', reason: 'Reviewing my own draft (SYNTHETIC)' }), /^lifecycle transition rejected \(separation_of_duties\): review is never done by the author/, 403);
    const w = await refused(move(operator, id, { expectedVersion: 1, action: 'review', reason: 'Not my role (SYNTHETIC)' }), /^lifecycle transition rejected \(authority\)/, 403);
    expect(w.body['outcome']).toMatchObject({ refusal: { code: 'not_reviewer' } });
    const k = await h.humanWithSession(['knowledge_owner', 'domain_specialist'], 'b50lc-ko-author');
    const own = String((await author(k, { title: 'A knowledge owner\'s own assessment (SYNTHETIC)' })).transition['object_id']);
    await refused(move(k, own, { expectedVersion: 1, action: 'review', reason: 'My own draft (SYNTHETIC)' }), /^lifecycle transition rejected \(separation_of_duties\): review is never done by the author/, 403);
    await move(muller, id, { expectedVersion: 1, action: 'review', reason: 'Findings: the approval path is exercised (SYNTHETIC)' });
    await refused(move(muller, id, { expectedVersion: 2, action: 'approve', reason: 'Approving what I reviewed (SYNTHETIC)' }), /^lifecycle transition rejected \(separation_of_duties\): approve is never done by the reviewer/, 403);
    const a = await move(adler, id, { expectedVersion: 2, action: 'approve', reason: 'Rationale: the exact version is fit for publication (SYNTHETIC)' });
    expect(a.transition).toMatchObject({ outcome: 'accepted', to: 'approved', actor_class: 'approver' });
    expect((await current(id))['payload']).toMatchObject({ approval: { approver: `principal:${adler.principalId}`, version: 2 } });
    expect((await move(ivanova, id, { expectedVersion: 3, action: 'publish' })).transition).toMatchObject({ from: 'approved', to: 'published', object_version: 4 });
  });
  it('withdrawal: the truth state withdrawn with the reason; withdrawn is terminal (MET-008\'s rule: a withdrawn record changes only by a correction)', async () => {
    const id = await reviewed();
    await refused(move(ivanova, id, { expectedVersion: 2, action: 'withdraw' }), /^lifecycle transition rejected \(reason\): withdraw records why it is withdrawn/, 422);
    await move(ivanova, id, { expectedVersion: 2, action: 'withdraw', reason: 'The underlying feed was withdrawn by its publisher (SYNTHETIC)' });
    expect(await current(id)).toMatchObject({ v: 3, s: 'withdrawn', t: 'withdrawn', withdrawal_reason: 'The underlying feed was withdrawn by its publisher (SYNTHETIC)' });
    await refused(move(ivanova, id, { expectedVersion: 3, action: 'archive' }), /^lifecycle transition rejected \(state\): archive is offered from published, corrected, superseded; the object is withdrawn/, 409);
  });
});

describe('LC3 · re-entry, compensation, order (V03-T-021, PR-06-005)', () => {
  it('an untyped return to draft is refused; a typed re-entry names its reason and its cause and opens a new review cycle', async () => {
    const id = await reviewed();
    await move(ivanova, id, { expectedVersion: 2, action: 'publish' });
    await refused(move(ivanova, id, { expectedVersion: 3, action: 'reopen', reason: 'Reopening without saying why (SYNTHETIC)' }), /^lifecycle transition rejected \(reentry\): a return to draft is a typed re-entry/, 422);
    const cause = uuidv7();   // a SYNTHETIC invalidation id: the fitness failure that reopened it
    const r = await move(ivanova, id, { expectedVersion: 3, action: 'reopen', reentryReason: 'fitness_failure', causationId: cause, correlationRef: 'corr-portwatch-2024-01-16',
      reason: 'The cited chokepoint day was restated; the judgement is reopened (SYNTHETIC)' });
    expect(r.transition).toMatchObject({ outcome: 'accepted', kind: 're_entry', from: 'published', to: 'draft', reentry_reason: 'fitness_failure', causation_id: cause, object_version: 4 });
    const t = (await ledger(id)).at(-1)!;
    expect(t).toMatchObject({ kind: 're_entry', causation_id: cause, correlation_ref: 'corr-portwatch-2024-01-16', prior_version: 3, new_version: 4, bundle_version: expect.any(String) });
    expect(t['policy_decision_id']).toEqual(expect.any(String));
    expect((await current(id))['payload']).toMatchObject({ review: null, approval: null });
    // the new cycle: the same reviewer reviews again (a new review, not the old one)
    expect((await move(muller, id, { expectedVersion: 4, action: 'review', reason: 'Findings: the restated day is reflected (SYNTHETIC)' })).transition).toMatchObject({ to: 'reviewed', object_version: 5 });
  });
  it('a compensation undoes the LAST accepted transition (the state and content before it restored; kept as compensated); out of order and twice refused', async () => {
    const id = await reviewed();
    const pub = await move(ivanova, id, { expectedVersion: 2, action: 'publish' });
    const review = (await ledger(id)).find((t) => t['action'] === 'review')!;
    const ooo = await refused(move(ivanova, id, { expectedVersion: 3, action: 'compensate', causationId: String(review['transition_id']), reason: 'Undo the review instead (SYNTHETIC)' }),
      /^lifecycle transition rejected \(state\)/, 409);
    expect(ooo.body['outcome']).toMatchObject({ refusal: { code: 'out_of_order' } });
    const c = await move(ivanova, id, { expectedVersion: 3, action: 'compensate', causationId: String(pub.transition['transition_id']), reason: 'Published before the desk signed off (SYNTHETIC)' });
    expect(c.transition).toMatchObject({ outcome: 'compensated', kind: 'compensation', from: 'published', to: 'reviewed', object_version: 4, compensates: pub.transition['transition_id'] });
    expect(await current(id)).toMatchObject({ s: 'reviewed', correction_of: `${id}@3` });
    expect((await ledger(id)).filter((t) => t['transition_id'] === pub.transition['transition_id'])[0]).toMatchObject({ outcome: 'accepted' });   // the compensated one stays
    const twice = await refused(move(ivanova, id, { expectedVersion: 4, action: 'compensate', causationId: String(c.transition['transition_id']), reason: 'Undo the undo (SYNTHETIC)' }), /^lifecycle transition rejected \(state\)/, 409);
    expect(twice.body['outcome']).toMatchObject({ refusal: { code: 'nothing_to_compensate' } });
  });
  it('an out-of-order command (naming an older transition as its cause), an unknown action, a mismatched target and a content change on a non-correction are rejected and kept', async () => {
    const id = await reviewed();
    const first = (await ledger(id))[0]!;
    const a = await refused(move(ivanova, id, { expectedVersion: 2, action: 'publish', causationId: String(first['transition_id']) }), /^lifecycle transition rejected \(state\): the command follows transition .+ which is not the latest/, 409);
    expect(a.body['outcome']).toMatchObject({ refusal: { code: 'out_of_order' } });
    await refused(move(ivanova, id, { expectedVersion: 2, action: 'promote' }), /^lifecycle transition rejected \(transition\): promote is not a transition of ASM/, 422);
    await refused(move(ivanova, id, { expectedVersion: 2, action: 'publish', to: 'archived' }), /^lifecycle transition rejected \(transition\): publish leads to published, not archived/, 422);
    await refused(move(ivanova, id, { expectedVersion: 2, action: 'publish', changes: { title: 'A new title while publishing (SYNTHETIC)' } }), /^lifecycle transition rejected \(transition\): publish changes no content/, 422);
    expect((await ledger(id)).filter((t) => t['outcome'] === 'rejected').map((t) => t['refusal_code'])).toEqual(['out_of_order', 'unknown_action', 'target_mismatch', 'changes_not_allowed']);
    expect((await current(id))['v']).toBe(2);
  });
  it('an object that cannot identify its owner (the owner\'s account suspended) is REJECTED as ownerless, kept, and moves again once the owner is active', async () => {
    const id = await reviewed(haas, 'An assessment whose owner leaves (SYNTHETIC)');
    await sql`update identity.principals set status = 'suspended' where id = ${haas.principalId}::uuid`.execute(h.su);   // fixture scaffolding: the account suspended
    try {
      const r = await refused(move(muller, id, { expectedVersion: 2, action: 'withdraw', reason: 'Withdrawing an ownerless object (SYNTHETIC)' }), /^lifecycle transition rejected \(state\): the accountable owner principal:.+ is not an active person/, 409);
      expect(r.body['outcome']).toMatchObject({ refusal: { code: 'ownerless' }, last_authoritative_version: 2 });
    } finally { await sql`update identity.principals set status = 'active' where id = ${haas.principalId}::uuid`.execute(h.su); }
  });
  it('two concurrent publishes of the same version: exactly one accepted, the other stale — both kept', async () => {
    const id = await reviewed();
    const [a, b] = await Promise.allSettled([move(ivanova, id, { expectedVersion: 2, action: 'publish' }), move(ivanova, id, { expectedVersion: 2, action: 'publish' })]);
    const ok = [a, b].filter((x) => x.status === 'fulfilled'); const no = [a, b].filter((x) => x.status === 'rejected') as PromiseRejectedResult[];
    expect(ok).toHaveLength(1); expect(no).toHaveLength(1);
    expect(((no[0]!.reason as HttpException).getResponse() as Row)['outcome']).toMatchObject({ refusal: { code: 'stale_version' } });
    expect((await ledger(id)).filter((t) => t['action'] === 'publish').map((t) => t['outcome']).sort()).toEqual(['accepted', 'rejected']);
    expect((await current(id))['v']).toBe(3);
  });
  it('a module-owned or other-form object is not moved by this machine: refused (profile) and kept, naming its own port; an unknown object is 404 and not kept', async () => {
    const clm = uuidv7();
    await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, recorded_at,
                time_precision, source_clock_quality, truth_state, synthetic_state, human_refs, classification, purpose_scope, schema_ref, audit_correlation_id, payload, content_digest)
              values (${clm}::uuid, 'CLM', ${T}::uuid, ${D}::uuid, 'DOMAIN', 1, 'active', 'CP-OBJ-01', ${`principal:${ivanova.principalId}`}, clock_timestamp(), 'exact', 'trusted', 'synthetic', true,
                ${JSON.stringify([`principal:${ivanova.principalId}`])}::jsonb, 'internal', 'intelligence', 'CLM@v1', ${uuidv7()}::uuid, '{"synthetic":true}'::jsonb, ${H64(clm)})`.execute(h.su);   // a PLANTED claim row (fixture)
    const r = await refusal(lc.transition(rq(ivanova, 'objects.lifecycle.transition', 'CLM', clm), T, D, 'CLM', clm, { payload: { expectedVersion: 1, action: 'withdraw', idempotencyKey: key('clm'), reason: 'Not this machine (SYNTHETIC)' } }));
    expect(r.message).toMatch(/^lifecycle transition rejected \(profile\): CLM .+ is not moved by this machine — its lifecycle is intelligence\.claim\.admit/);
    expect(r.status).toBe(422);
    expect((await ledger(clm)).map((t) => t['refusal_code'])).toEqual(['module_owned']);
    await refused(move(ivanova, uuidv7(), { expectedVersion: 1, action: 'publish' }), /^lifecycle transition rejected \(unknown_object\)/, 404);
  });
});

describe('LC4 · proposals (PR-06-003)', () => {
  it('a view proposes; the owner accepts — the transition is the owner\'s, its cause the proposal; decided once; the request id replayed answers the proposal', async () => {
    const id = await reviewed();
    const rid = uuidv7();
    const p = (await propose(muller, id, { requestId: rid, baseVersion: 2, action: 'publish', via: 'view', reason: 'Ready for the corridor desk after my review (SYNTHETIC)' })).proposal;
    expect(p).toMatchObject({ proposer_kind: 'human', via: 'view', replayed: false });
    expect((await propose(muller, id, { requestId: rid, baseVersion: 2, action: 'publish', via: 'view', reason: 'Ready for the corridor desk after my review (SYNTHETIC)' })).proposal).toMatchObject({ proposal_id: p['proposal_id'], replayed: true });
    const d = (await decide(ivanova, id, String(p['proposal_id']), { decision: 'accept', expectedVersion: 2, reason: 'Accepted: the review is sufficient (SYNTHETIC)' })).decision;
    expect(d).toMatchObject({ decision: 'accepted', transition: { outcome: 'accepted', to: 'published', proposal_id: p['proposal_id'], causation_id: p['proposal_id'], actor_principal_id: ivanova.principalId } });
    await refused(decide(ivanova, id, String(p['proposal_id']), { decision: 'accept', expectedVersion: 3, reason: 'Again (SYNTHETIC)' }), /^lifecycle proposal rejected \(state\)/, 409);
  });
  it('the proposer\'s channel matches its kind; a stale proposal is refused; a refused acceptance leaves the proposal open; a proposal on another object is unknown', async () => {
    const id = await reviewed();
    await refused(propose(muller, id, { baseVersion: 2, action: 'publish', via: 'agent', reason: 'A person posing as an agent (SYNTHETIC)' }), /^lifecycle proposal rejected \(via\): a human proposes through a view/, 422);
    await refused(propose(okafor, id, { baseVersion: 1, action: 'publish', via: 'agent', reason: 'Read an old version (SYNTHETIC)' }), /^lifecycle proposal rejected \(stale\)/, 409);
    await refused(propose(okafor, id, { baseVersion: 2, action: 'compensate', via: 'agent', reason: 'Undo something (SYNTHETIC)' }), /^lifecycle proposal rejected \(transition\)/, 422);
    const p = (await propose(okafor, id, { baseVersion: 2, action: 'publish', via: 'model', reason: 'The model scores the review complete (SYNTHETIC)' })).proposal;
    await move(ivanova, id, { expectedVersion: 2, action: 'withdraw', reason: 'Withdrawn before the proposal is read (SYNTHETIC)' });
    const x = await refused(decide(ivanova, id, String(p['proposal_id']), { decision: 'accept', expectedVersion: 2, reason: 'Accepting a stale proposal (SYNTHETIC)' }), /^lifecycle transition rejected \(stale\)/, 409);
    expect(x.body['outcome']).toMatchObject({ outcome: 'rejected', proposal_id: p['proposal_id'] });
    const hist = (await history(ivanova, id)).lifecycle;
    expect(hist['unresolved']).toMatchObject({ open_proposals: 1 });
    const other = await reviewed();
    await refused(decide(ivanova, other, String(p['proposal_id']), { decision: 'decline', reason: 'Wrong object (SYNTHETIC)' }), /^lifecycle proposal rejected \(unknown_proposal\)/, 404);
  });
});

describe('LC5 · reads, reconciliation, RLS, grants (PR-06-002, AT-06 cross-tenant)', () => {
  it('the history: every version, every attempt (accepted, rejected), the proposals with their decisions, the ledger agreeing, the unresolved since the last acceptance', async () => {
    const hist = (await history(muller, RED)).lifecycle;
    expect((hist['versions'] as Row[]).map((v) => v['state'])).toEqual(['draft', 'reviewed', 'published', 'corrected', 'retired']);
    expect((hist['transitions'] as Row[]).map((t) => t['outcome'])).toContain('rejected');
    expect((hist['proposals'] as Row[])[0]).toMatchObject({ via: 'agent', decision: { decision: 'declined' } });
    expect(hist).toMatchObject({ agreement: 'agrees', governed_here: true, current: { state: 'retired', version: 5 }, object: { title: expect.stringMatching(/Red Sea corridor assessment/) } });
    expect(((hist['unresolved'] as Row)['refused_since_last'] as Row[]).map((r) => r['code'])).toEqual(['invalid_transition']);
    const list = (await lc.list(rq(muller, 'objects.lifecycle.read'), T, D, 'ASM', { payload: {} }) as unknown as { objects: Row[] }).objects;
    expect(list.find((o) => o['object_id'] === RED)).toMatchObject({ state: 'retired', version: 5, ledger: 'agrees' });
  });
  it('the reconciliation agrees for the work objects; planted disagreements (inside a rolled-back transaction) are listed with their reasons', async () => {
    const clean = (await lc.reconcile(rq(muller, 'objects.lifecycle.read'), T, D) as unknown as { reconciliation: Row }).reconciliation;
    expect((clean['disagreements'] as Row[]).filter((x) => x['object_type'] === 'ASM')).toEqual([]);
    const inside = await h.su.transaction().execute(async (tx) => {
      const v = await sql<{ h: Row; p: Row }>`select objects._lc_header(o) h, o.payload p from objects.canonical_objects o where o.object_id = ${RED}::uuid order by o.object_version desc limit 1`.execute(tx);
      const hd = v.rows[0]!.h; const pl = v.rows[0]!.p;
      await sql`set local session_replication_role = replica`.execute(tx);
      await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, recorded_at, time_precision,
                  source_clock_quality, truth_state, synthetic_state, human_refs, classification, purpose_scope, schema_ref, audit_correlation_id, payload, content_digest)
                values (${RED}::uuid, 'ASM', ${T}::uuid, ${D}::uuid, 'DOMAIN', 6, 'published', 'CP-OBJ-01', ${String(hd['accountable_owner'])}, clock_timestamp(), 'exact', 'trusted', 'synthetic', true,
                  ${JSON.stringify(hd['human_refs'])}::jsonb, 'internal', 'intelligence', 'ASM@v3', ${uuidv7()}::uuid, ${JSON.stringify(pl)}::jsonb, ${H64('planted')})`.execute(tx);
      const r = (await sql<{ r: Row }>`select objects.lifecycle_reconcile(${T}::uuid, ${D}::uuid) as r`.execute(tx)).rows[0]!.r;
      throw Object.assign(new Error('rollback'), { r });
    }).catch((e: { r?: Row }) => e.r!);
    const bad = (inside['disagreements'] as Row[]).find((x) => x['object_id'] === RED)!;
    expect(bad).toMatchObject({ object_type: 'ASM', canonical_state: 'published', ledger_state: 'retired' });
    expect(String(bad['problem'])).toMatch(/written outside the lifecycle ledger/);
    expect((await current(RED))['v']).toBe(5);   // rolled back: nothing planted remains
  });
  it('another tenant: a person bound there reads nothing of this domain\'s object (404 in the port); this domain\'s reader is refused there (the PDP); an unbound runtime role reads no row', async () => {
    expect((await refusal(history(muller, RED, T2, D2))).status).toBe(403);
    await refused(history(other, RED, T2, D2), /^lifecycle read rejected \(unknown_object\): no object .+ is recorded in this domain/, 404);
    await refused(move(other, RED, { expectedVersion: 5, action: 'archive' }, T2, D2), /^lifecycle transition rejected \(unknown_object\)/, 404);
    const n = await h.su.transaction().execute(async (tx) => {
      await sql`set local role eye_app`.execute(tx);
      return Number((await sql<{ n: number }>`select count(*)::int n from objects.lifecycle_transitions`.execute(tx)).rows[0]!.n);
    });
    expect(n).toBe(0);
  });
  it('the grants: no write on the ledgers for a runtime role; append-only; FORCE RLS; the ports eye_commit\'s, the reads eye_app\'s and eye_commit\'s, the helpers nobody\'s', async () => {
    for (const t of ['lifecycle_profiles', 'lifecycle_transitions', 'lifecycle_proposals', 'lifecycle_proposal_decisions']) {
      const g = await one(sql`select has_table_privilege('eye_app', ${'objects.' + t}, 'INSERT') a, has_table_privilege('eye_commit', ${'objects.' + t}, 'INSERT') c,
        has_table_privilege('eye_commit', ${'objects.' + t}, 'UPDATE') u, has_table_privilege('eye_app', ${'objects.' + t}, 'SELECT') s,
        (select relforcerowsecurity from pg_class where oid = ${'objects.' + t}::regclass) f`);
      expect(g, t).toEqual({ a: false, c: false, u: false, s: true, f: true });
    }
    expect((await refusal(sql`update objects.lifecycle_transitions set reason = 'rewritten' where object_id = ${RED}::uuid`.execute(h.su))).message).toMatch(/append-only|append only/i);
    const fn = async (sig: string) => one(sql`select p.prosecdef d, has_function_privilege('eye_app', p.oid, 'EXECUTE') app, has_function_privilege('eye_commit', p.oid, 'EXECUTE') cmt,
      has_function_privilege('public', p.oid, 'EXECUTE') pub from pg_proc p where p.oid = ${sig}::regprocedure`);
    for (const s of ['objects.author_work_object(uuid, uuid, text, uuid, text, text, jsonb, jsonb, text, text, boolean, text, uuid, uuid)',
      'objects.transition_lifecycle(uuid, uuid, text, uuid, integer, text, text, text, text, uuid, text, text, jsonb, uuid, uuid)',
      'objects.propose_lifecycle(uuid, uuid, uuid, text, uuid, integer, text, text, text, text, uuid, uuid, uuid)',
      'objects.decide_lifecycle_proposal(uuid, uuid, uuid, uuid, uuid, text, text, integer, text, uuid, uuid)']) expect(await fn(s), s).toEqual({ d: true, app: false, cmt: true, pub: false });
    for (const s of ['objects.lifecycle_history(uuid, uuid, uuid)', 'objects.lifecycle_replay(uuid, uuid, uuid, timestamp with time zone)', 'objects.lifecycle_reconcile(uuid, uuid)',
      'objects.lifecycle_export(uuid, uuid, uuid)', 'objects.lifecycle_objects(uuid, uuid, text, integer)']) expect(await fn(s), s).toEqual({ d: true, app: true, cmt: true, pub: false });
    for (const s of ['objects._lifecycle_apply(uuid, uuid, text, uuid, integer, text, text, text, text, uuid, text, text, jsonb, uuid, uuid, uuid)', 'objects._lc_admit(jsonb, jsonb)', 'objects._lc_owner(text)']) {
      expect(await fn(s), s).toMatchObject({ app: false, cmt: false, pub: false });
    }
  });
});

describe('LC6 · export and re-import (PR-06-006)', () => {
  it('the history exported verifies on re-import (every digest recomputed, the replay re-derived); a tampered document is refused with its problems', async () => {
    const doc = (await lc.exportDoc(rq(muller, 'objects.lifecycle.read', 'ASM', RED), T, D, 'ASM', RED) as unknown as { document: Row }).document;
    expect(doc).toMatchObject({ format: 'eye-lifecycle-export/1', object_id: RED, object_type: 'ASM', digest: expect.stringMatching(/^[0-9a-f]{64}$/) });
    const ok = (await lc.verifyExport(rq(muller, 'objects.lifecycle.read'), T, D, { payload: { document: doc } }) as unknown as { verification: Row }).verification;
    expect(ok).toMatchObject({ valid: true, problems: [], versions: 5 });
    expect((ok['replay'] as Row[]).map((r) => r['state'])).toEqual(['draft', 'reviewed', 'published', 'corrected', 'retired']);
    const versions = JSON.parse(JSON.stringify(doc['versions'])) as Row[];
    (versions[2]!['header'] as Row)['lifecycle_state'] = 'approved';
    const bad = (await lc.verifyExport(rq(muller, 'objects.lifecycle.read'), T, D, { payload: { document: { ...doc, versions } } }) as unknown as { verification: Row }).verification;
    expect(bad['valid']).toBe(false);
    expect(JSON.stringify(bad['problems'])).toMatch(/document digest does not bind|version 3: its content digest does not recompute|version 3: the transition says published, the version says approved/);
    expect((bad['problems'] as string[]).length).toBeGreaterThanOrEqual(3);
  });
});

describe('LC7 · lifecycle coverage (V01-T-046)', () => {
  const contract = (): MetricContract => {
    const u = definitionsA.find((d) => d.metricKey === 'V1-lifecycle-coverage')!;
    return { ...u, metricKey: 'V1-lifecycle-coverage.b50', computationKey: 'v1_lifecycle_coverage', unsupportedReason: null, dimensions: ['object_type'],
      population: { subject: 'canonical objects of the domain', inclusion: 'every object existing at the window\'s end, its state read then', scope_rule: 'ignored: the lifecycle register is domain-wide' },
      numerator: 'objects under a declared lifecycle (a work object written by its ledger; a module or canonical state its profile admits)', denominator: 'every object of the population',
      ownerRole: 'executive', quality: { reads: 'objects.lifecycle_profiles, objects.lifecycle_transitions' } };
  };
  it('registered (0120 §LC) over the ledger; computed on an approved (planted) definition: the work objects in the numerator, every other object with its reason; replayable', async () => {
    expect(await one(sql`select computation_key, kind, dimensions, reads, registered_in from analytics.computation_registry where computation_key = 'v1_lifecycle_coverage'`))
      .toEqual({ computation_key: 'v1_lifecycle_coverage', kind: 'rate', dimensions: ['object_type'], reads: ['objects.canonical_objects', 'objects.lifecycle_profiles', 'objects.lifecycle_transitions'], registered_in: '0120 §LC' });
    const c = contract();
    await sql`insert into analytics.metric_definitions (definition_id, scope, tenant_id, domain_id, metric_key, version, title, meaning, kind, unit, direction, population, numerator, denominator,
        exclusions, window_spec, dimensions, privacy_class, k_min, floor_n, threshold, purpose_key, serves, cadence, owner_principal_id, action, retirement, quality, cost_allocation, computation_key,
        params, supported, unsupported_reason, source_refs, state, digest, proposed_by, proposed_by_kind, decided_by, decided_at, effective_from, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T}::uuid, ${D}::uuid, ${c.metricKey}, 1, ${`${c.title} (SYNTHETIC fixture)`}, ${c.meaning}, ${c.kind}, ${c.unit}, ${c.direction},
        ${JSON.stringify(c.population)}::jsonb, ${c.numerator}, ${c.denominator}, ${JSON.stringify(c.exclusions)}::jsonb, ${JSON.stringify(c.window)}::jsonb, ${c.dimensions}::text[], ${c.privacyClass},
        ${c.kMin}, ${c.floorN}, ${JSON.stringify(c.threshold)}::jsonb, ${c.purposeKey}, ${JSON.stringify(c.serves)}::jsonb, ${c.cadence}, ${paOwner.principalId}::uuid, ${c.action}, ${c.retirement},
        ${JSON.stringify(c.quality)}::jsonb, ${JSON.stringify(c.costAllocation)}::jsonb, ${c.computationKey}, ${JSON.stringify(c.params)}::jsonb, true, null, ${c.sourceRefs}::text[], 'approved',
        ${H64(JSON.stringify(c))}, ${analyst.principalId}::uuid, 'human', ${paOwner.principalId}::uuid, clock_timestamp(), clock_timestamp(), ${uuidv7()}::uuid)`.execute(h.su);   // PLANTED approved definition (B92's idiom)
    const q = `${new Date().getUTCFullYear()}-Q${Math.floor(new Date().getUTCMonth() / 3) + 1}`;
    const r = (await cc.compute(h.req(analyst, 'analytics.metric.compute', 'AMR', null, 'intelligence'), T, D, { payload: { metricKey: c.metricKey, period: q } }) as unknown as { result: Row }).result;
    // the period is the OPEN quarter (every record here is today's): the port says so — indeterminate for that reason ALONE, never a value presented as the period's
    expect(r).toMatchObject({ state: 'indeterminate' });
    expect(r['reasons']).toEqual([expect.stringMatching(/^the period .+ is open until .+: a partial period is not presented as the period$/)]);
    const read = (await cc.result(h.req(paOwner, 'analytics.read', 'AMR', String(r['result_id']), 'intelligence'), T, D, String(r['result_id']), { payload: { recordsLimit: 2000 } }) as unknown as { result: Row }).result;
    const recs = read['records'] as Row[];
    const asm = recs.filter((x) => String(x['record_ref'] ?? x['id'] ?? '').startsWith('ASM:') || (x['detail'] as Row | undefined)?.['object_type'] === 'ASM');
    expect(asm.length).toBeGreaterThanOrEqual(10);
    expect(asm.every((x) => x['role'] === 'numerator')).toBe(true);
    const clm = recs.find((x) => (x['detail'] as Row | undefined)?.['object_type'] === 'CLM' && x['role'] === 'denominator');
    expect(clm === undefined || /not in the CLM profile|no lifecycle profile/.test(String(clm['reason']))).toBe(true);
    // the computation itself (the §0.7 answer): no reason of its own; the numerator the ASM work objects and the governed records
    const direct = (await one(sql`select analytics.mc_v1_lifecycle_coverage(${T}::uuid, ${D}::uuid, now() - interval '1 day', now() + interval '1 day', clock_timestamp(), null, '{}'::jsonb, '{}'::jsonb) r`))['r'] as Row;
    expect(direct).toMatchObject({ kind: 'rate', reasons: [] });
    const drecs = direct['records'] as Row[];
    expect(drecs.filter((x) => x['role'] === 'numerator').length).toBeGreaterThanOrEqual(asm.length);
    expect(drecs.length).toBe(recs.filter((x) => x['role'] === 'numerator' || x['role'] === 'denominator').length);
    for (const x of drecs.filter((y) => y['role'] === 'denominator')) expect(String(x['reason']), String(x['id'])).toMatch(/no lifecycle profile declares|has no lifecycle profile|outside the lifecycle ledger|is not (one the|in the)/);
    expect(r['n']).toBe(drecs.length);
  });
  it('a window that ended before the register existed is INDETERMINATE (said), never a 0 %', async () => {
    const v = (await one(sql`select analytics.mc_v1_lifecycle_coverage(${T}::uuid, ${D}::uuid, '2026-07-01T00:00:00Z', '2026-10-01T00:00:00Z', clock_timestamp(), null, '{}'::jsonb, '{}'::jsonb) r`))['r'] as Row;
    expect(JSON.stringify(v['reasons'])).toMatch(/no lifecycle profile was declared by the window's end/);
  });
});

describe('LC8 · the continuity contract: "lifecycle register unavailable" (PR-06-005, AT-06 fault exercise)', () => {
  it('declared against the audit journal by the operations authority; evaluated ACTIVE when the journal is degraded — the lifecycle acts unavailable, its reads available', async () => {
    const st = (await pc.state(prq(ops, 'shell.degraded.read'), { payload: { kind: 'audit' } }) as unknown as { degraded: Row }).degraded;
    const existing = (st['contracts'] as Row[]).find((c) => (c['dependency'] as Row)['kind'] === 'audit');
    const decl = (await pc.declare(prq(ops, 'shell.degraded.contract.declare'), { payload: {
      requestId: uuidv7(), kind: 'audit', key: 'journal', expectedVersion: existing === undefined ? 0 : Number(existing['version']),
      available: [{ action: 'objects.lifecycle.read', label: 'Read a work object\'s history, replay and reconciliation from the recorded ledger' }],
      unavailable: [{ action: 'objects.lifecycle.*', label: 'Move, propose or decide a lifecycle transition (lifecycle register unavailable: it cannot be journaled)' },
        { action: 'objects.work_object.author', label: 'Author a work object (lifecycle register unavailable)' }],
      limitations: ['The lifecycle register is unavailable: no transition is recorded until the journal recovers', 'Every state shown is the last recorded one'],
      maxDurationSeconds: 14_400, ownerPrincipalId: ops.principalId, exitEvidence: 'Every availability incident reconciled, /readyz ok and a lifecycle transition recorded',
      reason: 'the lifecycle register depends on the authoritative audit journal (SYNTHETIC harness)' } }) as unknown as { contract: Row }).contract;
    expect(decl).toMatchObject({ dependency: { kind: 'audit', key: 'journal' } });
    const at = new Date().toISOString();
    const j = (await one(sql`select shell.dg_state_at(null, null, ${at}::timestamptz, ${JSON.stringify({ degraded: true, incidents: 1, since: new Date(Date.now() - 30_000).toISOString() })}::jsonb, 'audit', 'journal') as r`))['r'] as Row;
    const c = (j['contracts'] as Row[]).find((x) => (x['dependency'] as Row)['key'] === 'journal')!;
    expect(c).toMatchObject({ mode: 'active', signal: { state: 'degraded' } });
    expect(JSON.stringify(j['unavailable_functions'])).toContain('objects.lifecycle.*');
    expect(JSON.stringify(c['available'])).toContain('objects.lifecycle.read');
    const inside = await h.su.transaction().execute(async (tx) => {
      await sql`insert into audit.availability_incidents (id, kind, details) values (${uuidv7()}::uuid, 'audit_unavailable', '{"synthetic":true,"b50":"lc"}'::jsonb)`.execute(tx);
      const v = (await sql<{ r: Row }>`select shell.dg_signal('audit', 'journal', null, null, clock_timestamp(), ${JSON.stringify({ degraded: false, incidents: 0, since: null })}::jsonb) as r`.execute(tx)).rows[0]!.r;
      throw Object.assign(new Error('rollback'), { v });
    }).catch((e: { v?: Row }) => e.v);
    expect(inside).toMatchObject({ state: 'degraded' });
  });
});
