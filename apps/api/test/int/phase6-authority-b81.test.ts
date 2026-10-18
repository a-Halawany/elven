/**
 * CP-6 B81 · part §HA — THE HUMAN-AUTHORITY PATTERNS (F-P7-E-20; migration 0119 §HA), through the real database and controllers.
 *
 * §HA.1 PAT-08 — THE DEFER INTAKE captures its CONDITIONS and its OWNER beside the rationale and the next review (B34's gate defer): a
 *   POSITIVE (the owner defers naming the decision authority as the next review's owner, two conditions: recorded on the append-only gate
 *   act, the gate.review task assigned to that owner, the version.deferred event and the gate status carry both; nothing destroyed — the
 *   version, its options and its approvals stand; the named owner resumes); today's caller (no conditions, no owner — the 13-argument port
 *   form included) keeps today's behaviour exactly (the deferring person owns the review; none stated is an empty list); REFUSALS (422, the
 *   B34 family `gate rejected (conditions|owner)`: conditions on another act, too many, too short, repeated, not statements, an owner without
 *   standing, an agent owner, a malformed owner; nothing recorded); the ledger's checks and its append-only trigger; RECOVERY (the same
 *   version deferred correctly after the refusals).
 * §HA.2 REL-05 — the SERVER half the shared authority components render (CommandReview / AuthorityBanner / DecisionDigest /
 *   ConsequencePreview / SignatureReceipt): eligibility (an approver the policy does not name, an agent), separation of duties (a
 *   self-approval; an approver who would commit — D3: the approver approves, the decision authority commits and signs), the exact digest (a
 *   stale version digest on approve and commit; a stale header digest on the decision's signature), the consequence read before effect (no
 *   commit without the committer's own preview), the deliberate act (the commit carries both digests), the signature VERIFIED and the receipt
 *   (policy decision + audit seq) on every write. The typed confirmation (PAT-16) is the client's (apps/web/lib/authority-b81.ts, its unit
 *   test); the server's digest binding is what refuses a mismatch — asserted here.
 *
 * CONSTRUCTION evidence only (claim: construction). SYNTHETIC world (bootDecisionWorld); persona text is pronoun-neutral; the signing key is
 * generated in this process (EYE_EXECUTIVE_SIGNING_KEY_DEMO), never a real key.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { generateKeyPairSync } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PipelineService } from '../../src/pipeline/pipeline.service.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, message, type DecisionWorld } from './phase6-fixtures.js';
import type { AnyDb } from './helpers.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let su: AnyDb; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>; let pipeline: PipelineService;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const DAY = 86_400_000;
const inDays = (d: number) => new Date(Date.now() + d * DAY).toISOString();

/** A refused call: the HttpException's own answer, or the mapper's for a port's raw refusal (the B18/B24/B34 idiom). */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  const mapped = e instanceof HttpException ? e : asObservationRefusal(e, 'harness');
  if (mapped === null) return { status: null, message: e instanceof Error ? e.message : String(e) };
  const r = mapped.getResponse() as { message?: string };
  return { status: mapped.getStatus(), message: String(r.message ?? (e instanceof Error ? e.message : '')) };
};
const refused = async (p: Promise<unknown>, re: RegExp, status: number) => {
  const r = await refusal(p);
  expect(r.message).toMatch(re);
  expect(r.status, r.message).toBe(status);
  return r;
};
const evidence = (caseName: string, e: Row): void => console.log(`B81 AUTHORITY EVIDENCE ${caseName}: ${JSON.stringify(e)}`);
const receiptOf = (r: unknown): Row => ((r as { receipt?: Row }).receipt ?? {});

/* ───────────── the calls ───────────── */
const dc = () => w.decisions;
const ACTION: Record<string, string> = { 'request-information': 'decision.gate.request_information' };
const gate = (as: AuthenticatedPrincipal, pkg: string, v: number, act: string, payload: Row = {}) =>
  dc().gateAct(h.req(as, ACTION[act] ?? `decision.gate.${act}`, 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), act, { payload }) as Promise<{ gate: Row; receipt: Row }>;
const status = (pkg: string, v: number, as = w.executive) =>
  dc().gateStatus(h.req(as, 'decision.read', 'DPK', pkg, 'decision'), T(), D(), pkg, String(v)) as Promise<{ gate: Row & { actions: Row[]; tasks: Row[] } }>;
const sign = (as: AuthenticatedPrincipal, pkg: string, v: number, kind: 'approval' | 'decision', digest: string, approvalId: string | null = null) =>
  dc().sign(h.req(as, `decision.sign.${kind}`, 'DPK', pkg, 'decision'), T(), D(), pkg, String(v), { payload: approvalId === null ? { kind, digest } : { kind, digest, approvalId } }) as Promise<{ signature: Row; receipt: Row }>;

/* ───────────── the record ───────────── */
const acts = async (pkg: string, v: number) => (await sql<{ action: string; actor: string; defer_conditions: unknown; defer_owner: string | null; next_review_at: Date | null; task_id: string | null }>`
  select action, actor_principal_id::text actor, defer_conditions, defer_owner_principal_id::text defer_owner, next_review_at, task_id::text from decision.gate_actions
   where package_id = ${pkg}::uuid and version = ${v} order by at, action_id`.execute(su)).rows;
const events = async (pkg: string, event: string) => (await sql<{ details: Row }>`select details from decision.package_events where package_id = ${pkg}::uuid and event = ${event} order by occurred_at, event_id`.execute(su)).rows;
const reviewTasks = async (pkg: string) => (await sql<{ state: string; assignee: string | null; outcome: string | null }>`
  select state, assignee_principal_id::text assignee, outcome from executive.human_tasks where kind = 'gate.review' and (subject ->> 'id' = ${pkg} or subject ->> 'package_id' = ${pkg}) order by opened_at`.execute(su)).rows;
const versionRow = async (pkg: string, v: number) => (await sql<{ state: string; version_digest: string | null; options: number; approvals: number }>`
  select pv.state, pv.version_digest, (select count(*)::int from decision.options o where o.package_id = pv.package_id and o.version = pv.version) options,
         (select count(*)::int from decision.approvals a where a.package_id = pv.package_id and a.version = pv.version) approvals
    from decision.package_versions pv where pv.package_id = ${pkg}::uuid and pv.version = ${v}`.execute(su)).rows[0]!;
const headerDigest = async (pkg: string, v: number) => (await sql<{ d: string }>`select header_digest d from decision.package_versions where package_id = ${pkg}::uuid and version = ${v}`.execute(su)).rows[0]!.d;

beforeAll(async () => {
  const { privateKey } = generateKeyPairSync('ed25519');
  process.env['EYE_EXECUTIVE_SIGNING_KEY_DEMO'] = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  delete process.env['EYE_EXECUTIVE_SIGNING_KEY_REF'];
  h = await Phase4Harness.boot();
  su = h.su as AnyDb;
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  pipeline = h.app.get(PipelineService);
}, 300_000);
afterAll(async () => { await h?.close(); });

describe('§HA.1 PAT-08 — the defer captures its rationale, conditions, owner and next review; never destructive', () => {
  it('POSITIVE: the owner defers naming the decision authority as the next review\'s owner and two conditions — recorded, assigned, carried, resumed by that owner', async () => {
    const P = await c.proposed();
    const a = await c.approve(P.pkg, P.v, { decision: 'approve', versionDigest: P.digest, rationale: 'The reroute keeps the line running (B81 harness).' }, w.approver);
    expect(a.approval.state).toBe('approved');
    const before = await versionRow(P.pkg, P.v);
    const next = inDays(7);
    const conditions = ['  The broker confirms pre-clearance in writing  ', 'The Cape weather window is reviewed'];
    const r = await gate(w.owner, P.pkg, P.v, 'defer', { rationale: 'Deferred until the broker confirms pre-clearance (B81 harness)', nextReviewAt: next, conditions, owner: w.authority.principalId });
    expect(r.gate).toMatchObject({ action: 'defer', from_state: 'approved', to_state: 'deferred', standing: 'owner', event: 'version.deferred',
                                   conditions: ['The broker confirms pre-clearance in writing', 'The Cape weather window is reviewed'], owner: w.authority.principalId });
    expect(receiptOf(r)).toMatchObject({ policyDecisionId: expect.any(String), auditSeq: expect.any(Number) });
    /* the append-only gate act: the conditions trimmed, in order; the owner named */
    const rows = await acts(P.pkg, P.v);
    expect(rows.map((x) => [x.action, x.actor, x.defer_conditions, x.defer_owner])).toEqual([
      ['defer', w.owner.principalId, ['The broker confirms pre-clearance in writing', 'The Cape weather window is reviewed'], w.authority.principalId]]);
    expect(rows[0]!.next_review_at?.toISOString()).toBe(next);
    /* the review task is the OWNER's (not the deferring person's) */
    expect((await reviewTasks(P.pkg)).map((t) => [t.state, t.assignee])).toEqual([['open', w.authority.principalId]]);
    /* the event and the gate status carry both */
    expect((await events(P.pkg, 'version.deferred'))[0]!.details).toMatchObject({ conditions: ['The broker confirms pre-clearance in writing', 'The Cape weather window is reviewed'], owner: w.authority.principalId,
      rationale: 'Deferred until the broker confirms pre-clearance (B81 harness)', to_state: 'deferred' });
    const st = (await status(P.pkg, P.v)).gate;
    expect(st.actions.at(-1)).toMatchObject({ action: 'defer', defer_conditions: ['The broker confirms pre-clearance in writing', 'The Cape weather window is reviewed'], defer_owner_principal_id: w.authority.principalId });
    /* NEVER DESTRUCTIVE: the version, its digest, its options and its approval stand */
    const after = await versionRow(P.pkg, P.v);
    expect(after).toEqual({ ...before, state: 'deferred' });
    /* the named owner resumes (standing: authority); the review task resolved; the approval counted again */
    const res = await gate(w.authority, P.pkg, P.v, 'resume', { rationale: 'The broker confirmed in writing (B81 harness)' });
    expect(res.gate).toMatchObject({ from_state: 'deferred', to_state: 'approved', standing: 'authority', event: 'version.resumed' });
    expect(res.gate['conditions'], 'a resume carries no conditions').toBeUndefined();
    expect((await reviewTasks(P.pkg)).map((t) => t.state)).toEqual(['completed']);
    expect((await acts(P.pkg, P.v)).map((x) => [x.action, x.defer_conditions, x.defer_owner])).toEqual([
      ['defer', ['The broker confirms pre-clearance in writing', 'The Cape weather window is reviewed'], w.authority.principalId], ['resume', null, null]]);
    evidence('PAT-08 positive', { package: P.pkg, conditions: 2, owner: 'decision authority', task: 'assigned to the owner', destroyed: 0, resumed_by: 'the owner of the next review' });
  });

  it('TODAY\'S CALLER: a defer naming neither keeps today\'s behaviour — the deferring person owns the review, none stated is an empty list; the 13-argument port form too', async () => {
    const P = await c.proposed();
    const r = await gate(w.owner, P.pkg, P.v, 'defer', { rationale: 'Deferred for a week (B81 harness, no conditions)', nextReviewAt: inDays(7) });
    expect(r.gate).toMatchObject({ to_state: 'deferred', conditions: [], owner: w.owner.principalId });
    expect((await acts(P.pkg, P.v)).map((x) => [x.defer_conditions, x.defer_owner])).toEqual([[[], w.owner.principalId]]);
    expect((await reviewTasks(P.pkg)).map((t) => t.assignee)).toEqual([w.owner.principalId]);
    /* the 13-argument form of the port (a pre-B81 caller): the defaults apply */
    const Q = await c.proposed();
    const out = await pipeline.write(h.env(w.owner, 'decision.gate.defer', 'DPK', Q.pkg, 'decision'), w.owner,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action: 'decision.gate.defer', objectType: 'DPK', objectId: Q.pkg }, (tx: unknown) => tx,
      async (tx) => {
        const row = (await sql<{ r: Row }>`select decision.gate_act(${uuidv7()}::uuid, ${T()}::uuid, ${D()}::uuid, ${Q.pkg}::uuid, ${Q.v}::int, 'defer', 'Deferred through the 13-argument form (B81 harness)',
          ${inDays(5)}::timestamptz, null, null, ${w.owner.principalId}::uuid, ${uuidv7()}::uuid, ${uuidv7()}::uuid) as r`.execute(tx as never)).rows[0]!.r;
        return { result: row, targetType: 'DPK', targetId: Q.pkg, targetVersion: String(Q.v), outboxEvent: null };
      });
    expect(out.result).toMatchObject({ to_state: 'deferred', conditions: [], owner: w.owner.principalId });
    /* the request for information is unchanged: its asked-for text, its task the package owner's, no conditions or owner recorded */
    const R = await c.proposed();
    const ri = await gate(w.approver, R.pkg, R.v, 'request-information', { rationale: 'The broker letter is missing (B81 harness)', nextReviewAt: inDays(3), infoRequest: 'the pre-clearance letter for the rerouted consignments' });
    expect(ri.gate['conditions']).toBeUndefined();
    expect((await acts(R.pkg, R.v)).map((x) => [x.action, x.defer_conditions, x.defer_owner])).toEqual([['request_information', null, null]]);
    evidence('PAT-08 defaults', { owner: 'the deferring person', conditions: [], thirteen_argument_form: 'unchanged', request_information: 'unchanged' });
  });

  it('REFUSALS (422, gate rejected (conditions|owner)): another act, too many, too short, repeated, not statements, an owner without standing, an agent, a malformed id — nothing recorded', async () => {
    const P = await c.proposed();
    const why = 'Deferred pending the broker (B81 harness refusal)';
    const at = inDays(7);
    await refused(gate(w.owner, P.pkg, P.v, 'review', { rationale: 'Read the whole package (B81 harness)', conditions: ['The broker confirms'] }), /^gate rejected \(conditions\): conditions and an owner are recorded on a defer only, not on a review/, 422);
    await refused(gate(w.approver, P.pkg, P.v, 'request-information', { rationale: why, nextReviewAt: at, infoRequest: 'the broker letter please', owner: w.authority.principalId }), /^gate rejected \(conditions\): .*not on a request information/, 422);
    await refused(gate(w.owner, P.pkg, P.v, 'defer', { rationale: why, nextReviewAt: at, conditions: Array.from({ length: 13 }, (_, i) => `Condition number ${i + 1}`) }), /^gate rejected \(conditions\): a defer lists at most 12 conditions/, 422);
    await refused(gate(w.owner, P.pkg, P.v, 'defer', { rationale: why, nextReviewAt: at, conditions: ['ok?'] }), /^gate rejected \(conditions\): each condition of a defer is a statement of 4 to 500 characters/, 422);
    await refused(gate(w.owner, P.pkg, P.v, 'defer', { rationale: why, nextReviewAt: at, conditions: ['x'.repeat(501)] }), /^gate rejected \(conditions\): each condition/, 422);
    await refused(gate(w.owner, P.pkg, P.v, 'defer', { rationale: why, nextReviewAt: at, conditions: ['The broker confirms', 'the broker CONFIRMS '] }), /^gate rejected \(conditions\): a defer states each condition once/, 422);
    await refused(gate(w.owner, P.pkg, P.v, 'defer', { rationale: why, nextReviewAt: at, conditions: [42] }), /^gate rejected \(conditions\): the conditions of a defer are a list of statements/, 422);
    await refused(gate(w.owner, P.pkg, P.v, 'defer', { rationale: why, nextReviewAt: at, conditions: 'The broker confirms' }), /^gate rejected \(conditions\): the conditions of a defer are a list of statements/, 422);
    await refused(gate(w.owner, P.pkg, P.v, 'defer', { rationale: why, nextReviewAt: at, owner: w.executive.principalId }), /^gate rejected \(owner\): the owner of the next review \(.*\) is a named, active member with standing at this gate/, 422);
    await refused(gate(w.owner, P.pkg, P.v, 'defer', { rationale: why, nextReviewAt: at, owner: w.approver2.principalId }), /^gate rejected \(owner\)/, 422); // an approver the policy does not name
    await refused(gate(w.owner, P.pkg, P.v, 'defer', { rationale: why, nextReviewAt: at, owner: w.machinePrincipalId }), /^gate rejected \(owner\)/, 422); // an agent is never a named member
    await refused(gate(w.owner, P.pkg, P.v, 'defer', { rationale: why, nextReviewAt: at, owner: 'the-authority' }), /^gate rejected \(owner\): the owner of the next review is a named member \(a principal id\)/, 422);
    await refused(gate(w.owner, P.pkg, P.v, 'defer', { rationale: why, nextReviewAt: at, owner: uuidv7() }), /^gate rejected \(owner\)/, 422); // nobody
    /* the existing refusals stand: no next review */
    await refused(gate(w.owner, P.pkg, P.v, 'defer', { rationale: why, conditions: ['The broker confirms'] }), /^gate rejected \(next_review\)/, 422);
    /* NOTHING RECORDED */
    expect(await acts(P.pkg, P.v)).toEqual([]);
    expect(await reviewTasks(P.pkg)).toEqual([]);
    expect((await versionRow(P.pkg, P.v)).state).toBe('proposed');
    /* RECOVERY: the same version, deferred correctly (the approver the policy names owns the review) */
    const ok = await gate(w.owner, P.pkg, P.v, 'defer', { rationale: why, nextReviewAt: at, conditions: ['The broker confirms pre-clearance'], owner: w.approver.principalId });
    expect(ok.gate).toMatchObject({ to_state: 'deferred', owner: w.approver.principalId, conditions: ['The broker confirms pre-clearance'] });
    expect((await reviewTasks(P.pkg)).map((t) => [t.state, t.assignee])).toEqual([['open', w.approver.principalId]]);
    evidence('PAT-08 refusals', { refused: 14, status: 422, recorded_after_refusals: 0, recovery: 'deferred to the named approver' });
  });

  it('THE LEDGER: append-only (an update refused); the checks hold — conditions and an owner belong to a defer row only', async () => {
    const P = await c.proposed();
    await gate(w.owner, P.pkg, P.v, 'defer', { rationale: 'Deferred to test the ledger (B81 harness)', nextReviewAt: inDays(4), conditions: ['The ledger is append-only'] });
    expect(String(await sql`update decision.gate_actions set defer_conditions = '[]'::jsonb where package_id = ${P.pkg}::uuid`.execute(su).then(() => 'updated', (e: unknown) => (e as Error).message))).toMatch(/append-only|append only/i);
    const insert = (action: string, conditions: string | null, owner: string | null) => sql`insert into decision.gate_actions (action_id, scope, tenant_id, domain_id, package_id, version, action, actor_principal_id, rationale,
        from_state, to_state, correlation_id, defer_conditions, defer_owner_principal_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${P.pkg}::uuid, ${P.v}, ${action}, ${w.owner.principalId}::uuid, 'a direct row (B81 harness)', 'deferred', 'deferred', ${uuidv7()}::uuid,
              ${conditions}::jsonb, ${owner}::uuid)`.execute(su).then(() => 'inserted', (e: unknown) => (e as Error).message);
    expect(await insert('review', '["a condition"]', null)).toMatch(/dga_defer_conditions/);
    expect(await insert('acknowledge', null, w.owner.principalId)).toMatch(/dga_defer_owner/);
    expect(await sql`select count(*)::int n from decision.gate_actions where package_id = ${P.pkg}::uuid`.execute(su).then((r) => (r.rows[0] as { n: number }).n)).toBe(1);
    /* the port's grant: eye_commit only (never PUBLIC, never eye_app) */
    const g = (await sql<{ app: boolean; commit: boolean; pub: boolean }>`select has_function_privilege('eye_app', p.oid, 'execute') app, has_function_privilege('eye_commit', p.oid, 'execute') commit,
        coalesce((select bool_or(a.grantee = 0) from aclexplode(p.proacl) a), false) pub
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'decision' and p.proname = 'gate_act'`.execute(su)).rows;
    expect(g).toEqual([{ app: false, commit: true, pub: false }]);
    evidence('PAT-08 ledger', { append_only: true, checks: ['dga_defer_conditions', 'dga_defer_owner'], ports: 1, grant: 'eye_commit' });
  });
});

describe('§HA.2 REL-05 — eligibility, separation, the exact digest, the consequence before effect, the deliberate act, the signature and the receipt (the server half)', () => {
  it('eligibility and separation of duties: an approver the policy does not name, an agent, a self-approval, an approver who would commit — each refused; the named approver approves, the authority commits and signs', async () => {
    const P = await c.proposed();
    expect(await message(c.approve(P.pkg, P.v, { decision: 'approve', versionDigest: P.digest, rationale: 'not named by the policy (B81 harness)' }, w.approver2))).toMatch(/not an eligible approver/);
    expect(await message(c.approve(P.pkg, P.v, { decision: 'approve', versionDigest: P.digest, rationale: 'an agent approving (B81 harness)' }, w.agent))).not.toBe('');
    const S = await c.proposed({ as: w.authorApprover, terms: { approverPolicy: { quorum: 1, principals: [w.authorApprover.principalId, w.approver.principalId] } } });
    expect(await message(c.approve(S.pkg, S.v, { decision: 'approve', versionDigest: S.digest, rationale: 'approving my own proposal (B81 harness)' }, w.authorApprover))).toMatch(/self-approval is forbidden/);
    const A = await c.proposed({ terms: { approverPolicy: { quorum: 1, principals: [w.approverAuthority.principalId] } } });
    await c.approve(A.pkg, A.v, { decision: 'approve', versionDigest: A.digest, rationale: 'Approved by the human who would commit (B81 harness).' }, w.approverAuthority);
    expect(await message(c.commit(A.pkg, A.v, A.digest, w.approverAuthority))).toMatch(/cannot be one of the approvers/);
    /* D3: the approver approves; the decision authority (not an approver) commits */
    const ap = await c.approve(P.pkg, P.v, { decision: 'approve', versionDigest: P.digest, rationale: 'The reroute keeps the line running (B81 harness).' }, w.approver);
    expect(receiptOf(ap)).toMatchObject({ policyDecisionId: expect.any(String), auditSeq: expect.any(Number) });
    const pv = await c.preview(P.pkg, P.v, P.digest, w.authority);
    const cm = await c.commit(P.pkg, P.v, P.digest, w.authority, 'C2', pv.preview.preview_digest);
    expect(cm.commitment.approvals.map((x) => x.approver)).toEqual([w.approver.principalId]);
    expect(receiptOf(cm)).toMatchObject({ policyDecisionId: expect.any(String), auditSeq: expect.any(Number) });
    evidence('REL-05 eligibility+separation', { not_named: 'refused', agent: 'refused', self_approval: 'refused', approver_commits: 'refused', approved_by: 'approver', committed_by: 'authority' });
  });

  it('the exact digest, the consequence before effect and the deliberate act: a stale digest refused on approve and commit; no commit without the committer\'s preview; the commit carries both digests', async () => {
    const P = await c.proposed();
    const stale = 'a'.repeat(64);
    expect(await message(c.approve(P.pkg, P.v, { decision: 'approve', versionDigest: stale, rationale: 'a digest that is not the version (B81 harness)' }))).toMatch(/not the digest of version/);
    await c.approve(P.pkg, P.v, { decision: 'approve', versionDigest: P.digest, rationale: 'The reroute keeps the line running (B81 harness).' }, w.approver);
    /* the consequence preview (HX-13) names the intended effect, the affected objects, the reversibility, the residual risk */
    const pv = await c.preview(P.pkg, P.v, P.digest, w.authority);
    expect(Object.keys(pv.preview.preview)).toEqual(expect.arrayContaining(['intended_effect', 'affected_objects', 'reversibility', 'residual_risk', 'blockers', 'would_commit']));
    await refused(c.commit(P.pkg, P.v, P.digest, w.authority, 'C2', null), /^commitment rejected \(no_preview\)/, 409);
    expect(await message(c.commit(P.pkg, P.v, 'b'.repeat(64), w.authority, 'C2', pv.preview.preview_digest))).toMatch(/not the digest of version|stale|preview/);
    expect(Number((await sql<{ n: number }>`select count(*)::int n from decision.commitments where package_id = ${P.pkg}::uuid`.execute(su)).rows[0]!.n), 'nothing committed by a refused act').toBe(0);
    const cm = await c.commit(P.pkg, P.v, P.digest, w.authority, 'C2', pv.preview.preview_digest);
    expect(cm.commitment.commitmentId).toMatch(/^[0-9a-f-]{36}$/);
    evidence('REL-05 digest+consequence', { stale_approve: 'refused', no_preview: 409, stale_commit: 'refused', committed_with: ['version digest', 'preview digest'] });
  });

  it('the signature and the receipt: a stale header digest refused; the decision signed by the authority and VERIFIED; each write answered with its policy decision and audit seq', async () => {
    const P = await c.committed();
    await refused(sign(w.authority, P.pkg, P.v, 'decision', 'c'.repeat(64)), /^signature rejected \(stale_digest\)/, 409);
    const hd = await headerDigest(P.pkg, P.v);
    const s = await sign(w.authority, P.pkg, P.v, 'decision', hd);
    expect(s.signature).toMatchObject({ kind: 'decision', signer: w.authority.principalId, subject_digest: hd, verified: true });
    expect(String(s.signature['key_id'])).toMatch(/^ed25519:[0-9a-f]{16}$/);
    expect(receiptOf(s)).toMatchObject({ policyDecisionId: expect.any(String), auditSeq: expect.any(Number) });
    await refused(sign(w.approver2, P.pkg, P.v, 'decision', hd), /./, 403);
    evidence('REL-05 signature+receipt', { stale_header: 409, verified: true, key: s.signature['key_id'], other_signer: 403 });
  });
});
