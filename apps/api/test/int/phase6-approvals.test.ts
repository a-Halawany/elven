/**
 * PHASE 6 · P6-M2 — approvals, revocation and the exact C3 commit, through the real
 * database and controller.
 *
 * F2 (an approval signs the digest that was read; named humans or role-at-scope with
 * a quorum of DISTINCT eligible humans; self-approval forbidden; expiry; revocation;
 * nothing carries to another version), F3's commitment half (one exact action at
 * C3, by a decision_authority who is not an approver; the route pins the class; the
 * port verifies the class and the bound action in the authority context; concurrent
 * commits resolve to one; the bounded CMT lands in Phase 3's own graph; after
 * commitment nothing reopens), and the human gate at the PEP (a non-human principal
 * holding the role is refused before any port). Nothing here is browser evidence.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { Phase4Harness } from './phase4-helpers.js';
import { bootDecisionWorld, decisionCalls, message, status, type DecisionWorld } from './phase6-fixtures.js';

let h: Phase4Harness; let w: DecisionWorld; let c: ReturnType<typeof decisionCalls>;
let P1: { pkg: string; v: number; digest: string };
let approvalId = '';

const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const versionState = async (pkg: string, v: number) => (await sql<{ s: string }>`select state s from decision.package_versions where package_id = ${pkg}::uuid and version = ${v}`.execute(h.su)).rows[0]?.s;
const packageState = async (pkg: string) => (await sql<Record<string, unknown>>`select * from decision.packages_current where package_id = ${pkg}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;

beforeAll(async () => {
  h = await Phase4Harness.boot();
  w = await bootDecisionWorld(h);
  c = decisionCalls(h, w);
  P1 = await c.proposed();
}, 300_000);

afterAll(async () => { await h?.close(); });

describe('P6-M2 · F2 — an approval is a named human\'s signature on the digest they read', () => {
  it('refuses the owner, the agent and the executive (no approver role), and a human without a session of their own', async () => {
    for (const p of [w.owner, w.agent, w.executive, w.authority]) {
      expect(await status(c.approve(P1.pkg, P1.v, { decision: 'approve', versionDigest: P1.digest, rationale: 'probe, must not pass the policy' }, p))).toBe(403);
    }
  });

  it('the PEP discharges the human gate BEFORE any port: an agent or workload holding decision_approver is refused with EYE-WFL-002', async () => {
    const asAgent: AuthenticatedPrincipal = { ...w.approver, kind: 'agent' };
    const asWorkload: AuthenticatedPrincipal = { ...w.approver, kind: 'workload', assurance: 'agent_grant' };
    const asGrant: AuthenticatedPrincipal = { ...w.approver, assurance: 'agent_grant' };
    for (const p of [asAgent, asWorkload, asGrant]) {
      const r = c.approve(P1.pkg, P1.v, { decision: 'approve', versionDigest: P1.digest, rationale: 'a machine holding the role' }, p);
      expect(await status(r)).toBe(403);
      expect(await message(r)).toMatch(/human gate/);
    }
    expect((await sql<{ n: string }>`select count(*)::text n from decision.approvals where package_id = ${P1.pkg}::uuid`.execute(h.su)).rows[0]?.n).toBe('0');
    const denials = (await sql<{ n: string }>`select count(*)::text n from policy.policy_decisions where action = 'decision.approve' and decision = 'deny' and principal_id like ${`%${w.approver.principalId}%`}`.execute(h.su)).rows[0]?.n;
    expect(Number(denials)).toBeGreaterThanOrEqual(3);
  });

  it('refuses a wrong digest, an approver the policy does not name, and self-approval by the author', async () => {
    expect(await message(c.approve(P1.pkg, P1.v, { decision: 'approve', versionDigest: 'a'.repeat(64), rationale: 'signs a digest that is not the version' }))).toMatch(/not the digest of version/);
    expect(await status(c.approve(P1.pkg, P1.v, { decision: 'approve', versionDigest: 'nope', rationale: 'malformed digest' }))).toBe(422);
    expect(await message(c.approve(P1.pkg, P1.v, { decision: 'approve', versionDigest: P1.digest, rationale: 'not named by the policy' }, w.approver2))).toMatch(/not an eligible approver/);
    // the author who also holds decision_approver, on a version whose policy names them: refused by the port
    const P2 = await c.proposed({ as: w.authorApprover, terms: { approverPolicy: { quorum: 1, principals: [w.authorApprover.principalId, w.approver.principalId] } } });
    expect(await message(c.approve(P2.pkg, P2.v, { decision: 'approve', versionDigest: P2.digest, rationale: 'approving my own proposal' }, w.authorApprover))).toMatch(/self-approval is forbidden/);
    // positive control: the other named approver approves the same version
    const ok = await c.approve(P2.pkg, P2.v, { decision: 'approve', versionDigest: P2.digest, rationale: 'The reroute keeps the line running; the premium is acceptable.' }, w.approver);
    expect(ok.approval.state).toBe('approved');
    expect((await sql<{ n: string }>`select count(*)::text n from decision.approvals where package_id = ${P2.pkg}::uuid`.execute(h.su)).rows[0]?.n).toBe('1');
  });

  it('a named approver approves: APR admitted, the version and package approved at quorum, one live record per approver', async () => {
    const r = await c.approve(P1.pkg, P1.v, { decision: 'approve', versionDigest: P1.digest, rationale: 'The reroute keeps the line running; the premium is acceptable.', conditions: ['re-review if the corridor reopens before 2024-01-19'] });
    approvalId = r.approval.approvalId;
    expect(r.approval).toMatchObject({ state: 'approved', liveApprovals: 1, quorum: 1, eligibleBy: 'principal' });
    expect(new Date(r.approval.expiresAt).getTime()).toBeGreaterThan(Date.now() + 13 * 86_400_000);
    const obj = (await sql<Record<string, unknown>>`select object_type, schema_ref, method_ref, source_object_ids, human_refs from objects.canonical_objects where object_id = ${approvalId}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect(obj['object_type']).toBe('APR');
    expect(obj['schema_ref']).toBe('APR@v1');
    expect(obj['method_ref']).toBe('human-approval@1.0.0');
    expect(obj['source_object_ids']).toEqual([`DPK:${P1.pkg}@${P1.v}`]);
    expect(await versionState(P1.pkg, P1.v)).toBe('approved');
    expect((await packageState(P1.pkg))['state']).toBe('approved');
    expect(await message(c.approve(P1.pkg, P1.v, { decision: 'approve', versionDigest: P1.digest, rationale: 'approving twice' }))).toMatch(/already has a live record/);
    const events = (await sql<{ e: string }>`select event e from decision.package_events where package_id = ${P1.pkg}::uuid and event in ('review.recorded', 'version.approved') order by occurred_at`.execute(h.su)).rows.map((x) => x.e);
    expect(events).toEqual(['review.recorded', 'version.approved']);
    const g = await c.get(P1.pkg, w.executive);
    expect((g.package.versions[0]?.approvals[0] as { live: boolean }).live).toBe(true);
  });

  it('revocation is the approver\'s own act; it breaks quorum; the record is append-only; a fresh approval restores it', async () => {
    expect(await message(c.revoke(P1.pkg, approvalId, 'not mine to revoke', w.approver2))).toMatch(/only the approver revokes/);
    const r = await c.revoke(P1.pkg, approvalId, 'new information: the corridor may reopen');
    expect(r.revocation).toMatchObject({ state: 'under_review', liveApprovals: 0, quorum: 1 });
    expect(await versionState(P1.pkg, P1.v)).toBe('under_review');
    expect(await message(c.revoke(P1.pkg, approvalId, 'twice'))).toMatch(/already revoked/);
    await expect(sql`delete from decision.approvals where approval_id = ${approvalId}::uuid`.execute(h.su)).rejects.toThrow(/append-only/);
    await expect(sql`update decision.approvals set rationale = 'rewritten' where approval_id = ${approvalId}::uuid`.execute(h.su)).rejects.toThrow(/immutable/);
    const again = await c.approve(P1.pkg, P1.v, { decision: 'approve', versionDigest: P1.digest, rationale: 'On reflection the reroute still dominates; approved again.' });
    approvalId = again.approval.approvalId;
    expect(again.approval.state).toBe('approved');
    expect((await sql<{ n: string }>`select count(*)::text n from decision.approvals where package_id = ${P1.pkg}::uuid`.execute(h.su)).rows[0]?.n).toBe('2');
  });

  it('role-at-scope with a quorum of two DISTINCT humans; the same human twice is one; expiry ends an approval', async () => {
    const P3 = await c.proposed({ terms: { approverPolicy: { quorum: 2, roles: ['decision_approver'], expires_after_days: 1 } } });
    const a1 = await c.approve(P3.pkg, P3.v, { decision: 'approve', versionDigest: P3.digest, rationale: 'First of two.' }, w.approver);
    expect(a1.approval).toMatchObject({ state: 'under_review', liveApprovals: 1, quorum: 2, eligibleBy: 'role:decision_approver' });
    expect(await message(c.approve(P3.pkg, P3.v, { decision: 'approve', versionDigest: P3.digest, rationale: 'The same human again.' }, w.approver))).toMatch(/already has a live record/);
    const a2 = await c.approve(P3.pkg, P3.v, { decision: 'approve', versionDigest: P3.digest, rationale: 'Second of two, a different human.' }, w.approver2);
    expect(a2.approval).toMatchObject({ state: 'approved', liveApprovals: 2, quorum: 2 });
    // the clock moves: the first approval expires (fixture: the world's clock, not a caller's claim)
    await sql`alter table decision.approvals disable trigger dap_revocation_only`.execute(h.su);
    await sql`update decision.approvals set expires_at = clock_timestamp() - interval '1 minute' where approval_id = ${a1.approval.approvalId}::uuid`.execute(h.su);
    await sql`alter table decision.approvals enable trigger dap_revocation_only`.execute(h.su);
    expect((await sql<{ n: string }>`select count(*)::text n from decision.live_approvals(${P3.pkg}::uuid, ${P3.v})`.execute(h.su)).rows[0]?.n).toBe('1');
    // the projection still says approved; the COMMIT recounts and refuses
    expect(await message(c.commit(P3.pkg, P3.v, P3.digest))).toMatch(/quorum is 2 distinct eligible humans; 1 live approval/);
    expect((await sql<{ n: string }>`select count(*)::text n from decision.commitments where package_id = ${P3.pkg}::uuid`.execute(h.su)).rows[0]?.n).toBe('0');
    // a rejection ends the version
    const P4 = await c.proposed();
    const rj = await c.approve(P4.pkg, P4.v, { decision: 'reject', versionDigest: P4.digest, rationale: 'The deadline is before the next sailing; reject.' });
    expect(rj.approval.state).toBe('rejected');
    expect(await versionState(P4.pkg, P4.v)).toBe('rejected');
    expect(await message(c.commit(P4.pkg, P4.v, P4.digest))).toMatch(/is rejected, not approved/);
    // and a new version starts with no approvals at all
    const o = await c.open(P4.pkg, { carryFrom: P4.v });
    expect((await sql<{ n: string }>`select count(*)::text n from decision.approvals where package_id = ${P4.pkg}::uuid and version = ${o.version.version}`.execute(h.su)).rows[0]?.n).toBe('0');
  });
});

describe('P6-M2 · F3 — the exact C3 commit', () => {
  it('refuses everyone but a decision_authority at the PDP; refuses a wrong digest and an unapproved version at the port', async () => {
    for (const p of [w.owner, w.approver, w.executive, w.agent]) expect(await status(c.commit(P1.pkg, P1.v, P1.digest, p))).toBe(403);
    expect(await message(c.commit(P1.pkg, P1.v, 'b'.repeat(64)))).toMatch(/not the digest of version/);
    const P5 = await c.proposed();
    expect(await message(c.commit(P5.pkg, P5.v, P5.digest))).toMatch(/is proposed, not approved/);
    // an approver who also holds decision_authority cannot commit what they approved
    const P6 = await c.proposed({ terms: { approverPolicy: { quorum: 1, principals: [w.approverAuthority.principalId] } } });
    await c.approve(P6.pkg, P6.v, { decision: 'approve', versionDigest: P6.digest, rationale: 'Approved by the same human who would commit.' }, w.approverAuthority);
    expect(await message(c.commit(P6.pkg, P6.v, P6.digest, w.approverAuthority))).toMatch(/cannot be one of the approvers/);
    expect((await sql<{ n: string }>`select count(*)::text n from graph.strategy_current where object_type = 'CMT' and tenant_id = ${T()}::uuid`.execute(h.su)).rows[0]?.n).toBe('0');
  });

  it('the human gate at the PEP: a non-human principal holding decision_authority is refused before any port', async () => {
    const asAgent: AuthenticatedPrincipal = { ...w.authority, kind: 'agent' };
    const r = c.commit(P1.pkg, P1.v, P1.digest, asAgent);
    expect(await status(r)).toBe(403);
    expect(await message(r)).toMatch(/human gate: decision.commit requires a named human/);
    const pd = (await sql<{ cc: string; d: string }>`select consequence_class cc, decision d from policy.policy_decisions where action = 'decision.commit' and principal_id like ${`%${w.authority.principalId}%`} order by created_at desc limit 1`.execute(h.su)).rows[0];
    expect(pd).toMatchObject({ cc: 'C3', d: 'deny' });
  });

  it('the ROUTE pins C3 whatever the envelope claims; two authorities commit concurrently and exactly one succeeds', async () => {
    const results = await Promise.allSettled([
      c.commit(P1.pkg, P1.v, P1.digest, w.authority, 'C2'),
      c.commit(P1.pkg, P1.v, P1.digest, w.authority2, 'C4'),
    ]);
    const ok = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof c.commit>>> => r.status === 'fulfilled');
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(ok.length).toBe(1);
    expect(failed.length).toBe(1);
    expect(String((failed[0] as PromiseRejectedResult).reason?.message ?? failed[0]?.reason)).toMatch(/already committed|could not serialize|deadlock/);
    const commitment = (ok[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof c.commit>>>).value.commitment;
    expect(commitment.opClass).toBe('C3');
    expect(commitment.approvals.map((a) => a.approval_id)).toEqual([approvalId]);
    const row = (await sql<Record<string, unknown>>`select * from decision.commitments where package_id = ${P1.pkg}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect(row['op_class']).toBe('C3');
    expect(row['bound_action']).toBe('decision.commit');
    expect(String(row['commitment_id'])).toBe(commitment.commitmentId);
    // the policy decision that authorized it is a C3 allow_with_obligations carrying the human gate
    const pd = (await sql<{ cc: string; d: string; o: unknown }>`select consequence_class cc, decision d, obligations o from policy.policy_decisions where action = 'decision.commit' and decision <> 'deny' order by created_at desc limit 2`.execute(h.su)).rows;
    expect(pd.every((x) => x.cc === 'C3' && x.d === 'allow_with_obligations')).toBe(true);
    expect(pd[0]?.o).toEqual([{ type: 'human_gate' }]);
    // the package and the version
    const p = await packageState(P1.pkg);
    expect(p['state']).toBe('committed');
    expect(Number(p['committed_version'])).toBe(P1.v);
    expect(p['decided_at']).not.toBeNull();
    expect(await versionState(P1.pkg, P1.v)).toBe('committed');
  });

  it('the bounded CMT lands in Phase 3\'s own graph, as a CMT@v1 object, resting on the DEC, the chosen runs and the baseline', async () => {
    const cmt = (await sql<Record<string, unknown>>`select s.* from graph.strategy_current s join decision.commitments c on c.commitment_id = s.strategy_object_id where c.package_id = ${P1.pkg}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect(cmt['object_type']).toBe('CMT');
    expect(cmt['status']).toBe('active');
    expect(String(cmt['owner_principal_id'])).toBe(w.authority.principalId);
    expect(String(cmt['title'])).toMatch(/^Commit: Reroute SYN-SHIP-4472 around the Cape — Reroute via the Cape$/);
    const obj = (await sql<Record<string, unknown>>`select object_type, schema_ref, method_ref, owning_component, truth_state, synthetic_state, source_object_ids, human_refs from objects.canonical_objects where object_id = ${String(cmt['strategy_object_id'])}::uuid`.execute(h.su)).rows[0] as Record<string, unknown>;
    expect(obj['object_type']).toBe('CMT');
    expect(obj['schema_ref']).toBe('CMT@v1');
    expect(obj['method_ref']).toBe('decision-commit@1.0.0');
    expect(obj['owning_component']).toBe('CP-DEC-01');
    expect(obj['synthetic_state']).toBe(true);
    expect(obj['source_object_ids']).toEqual(expect.arrayContaining([`DPK:${P1.pkg}@${P1.v}`, `APR:${approvalId}@1`, `SIM:${w.rerouteId}@1`]));
    expect(obj['human_refs']).toEqual(expect.arrayContaining([`principal:${w.authority.principalId}`, `principal:${w.approver.principalId}`]));
    const deps = (await sql<{ k: string; id: string }>`select depends_on_kind k, depends_on_id::text id from graph.dependencies where dependent_object_id = ${String(cmt['strategy_object_id'])}::uuid and dependent_type = 'CMT' order by 1, 2`.execute(h.su)).rows;
    expect(deps.filter((d) => d.k === 'strategy').map((d) => d.id)).toEqual([w.decisionId]);
    expect(deps.filter((d) => d.k === 'run').map((d) => d.id).sort()).toEqual([w.controlId, w.rerouteId].sort());
    const ev = (await sql<{ e: string; d: Record<string, unknown> }>`select event e, details d from graph.strategy_events where strategy_object_id = ${String(cmt['strategy_object_id'])}::uuid`.execute(h.su)).rows[0];
    expect(ev?.e).toBe('strategy.declared');
    expect(ev?.d['via']).toBe('decision.commit');
    // the only CMT in the domain is this one; the strategy port's own action still does not admit through decision.*
    expect((await sql<{ n: string }>`select count(*)::text n from graph.strategy_current where object_type = 'CMT' and tenant_id = ${T()}::uuid`.execute(h.su)).rows[0]?.n).toBe('1');
    expect((await sql<{ t: string[] }>`select object_types t from observation.canonical_write_actions where action = 'decision.commit'`.execute(h.su)).rows[0]?.t).toEqual(['CMT']);
  });

  it('after commitment nothing reopens: no new version, no dissent, no revocation, no withdrawal, no second commit', async () => {
    expect(await message(c.open(P1.pkg))).toMatch(/a committed decision is not re-opened/);
    expect(await message(c.dissent(P1.pkg, P1.v, { position: 'late', rationale: 'Dissent after commitment is recorded nowhere here.' }))).toMatch(/dissent is recorded before commitment/);
    // a revocation after commitment is recorded — it is observed history for the replay — and changes nothing
    const late = await c.revoke(P1.pkg, approvalId, 'I would not approve this today');
    expect(late.revocation.state).toBe('committed');
    expect(await versionState(P1.pkg, P1.v)).toBe('committed');
    expect((await sql<{ r: string | null }>`select revoked_reason r from decision.approvals where approval_id = ${approvalId}::uuid`.execute(h.su)).rows[0]?.r).toBe('I would not approve this today');
    expect(await message(c.withdraw(P1.pkg, 'changed my mind'))).toMatch(/a committed decision is not withdrawn/);
    expect(await message(c.commit(P1.pkg, P1.v, P1.digest, w.authority2))).toMatch(/already committed/);
    await expect(sql`delete from decision.commitments where package_id = ${P1.pkg}::uuid`.execute(h.su)).rejects.toThrow(/append-only|prohibited/i);
    await expect(sql`update decision.package_versions set state = 'approved' where package_id = ${P1.pkg}::uuid and version = ${P1.v}`.execute(h.su)).rejects.toThrow(/not a workflow transition/);
    const g = await c.get(P1.pkg, w.executive);
    expect(g.package['state']).toBe('committed');
    expect((g.package.commitment as Record<string, unknown>)['op_class']).toBe('C3');
    // an approval on a committed version is refused
    expect(await message(c.approve(P1.pkg, P1.v, { decision: 'approve', versionDigest: P1.digest, rationale: 'after the fact' }, w.approver2))).toMatch(/is committed; only a proposed version is approved/);
  });
});
