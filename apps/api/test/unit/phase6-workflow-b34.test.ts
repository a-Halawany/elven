/*
 * CP-6 B34 (0090 §W) part `workflow` · the pure halves of the durable workflow engine, the human tasks and collaboration: the intakes (422
 * on a malformed request — the ports decide the people, the states and the grants), the refusal rows of the seven port families through
 * the mapper (anchored; B9's order 403 → 404 → 409 → 422; no earlier row answers for them), the PDP's exact rules (what an external
 * collaborator holds — exactly five actions — and what it never does), and the clearance of an external (its grant's audience ceiling).
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { clearanceOf, isExternal } from '../../src/shared/clearance.js';
import { completesThroughOwningAction, validateAdvance, validateComplete, validateDefine, validateDrill, validateReassign } from '../../src/executive/workflow/workflow.service.js';
import { MAX_GRANT_DAYS, validateAccept, validateArtifact, validateInvite, validateReviewRequest } from '../../src/executive/workflow/collab.service.js';

const ID = '0190b1c2-d3e4-7000-8000-000000000341';
const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
const answer = (code: string, m: string, status: number, body: string): void => {
  const r = asObservationRefusal(pg(code, m), 'corr');
  expect(r?.getStatus(), m).toBe(status);
  const b = r?.getResponse() as { code: string; message: string };
  expect(b.code, m).toBe(body);
  expect(b.message, m).toBe(m);
};
const status422 = (f: () => unknown, re: RegExp): void => {
  try { f(); throw new Error('the intake should have refused'); } catch (e) {
    expect(e).toBeInstanceOf(HttpException);
    expect((e as HttpException).getStatus()).toBe(422);
    expect(String(((e as HttpException).getResponse() as { message?: string }).message)).toMatch(re);
  }
};

describe('B34 workflow · the intakes', () => {
  it('a definition, an advance, a drill', () => {
    status422(() => validateDefine({ def_key: 'X', spec: {}, owner: ID, escalation: ID, reason: 'a reason here' }, 'c'), /def_key/);
    status422(() => validateDefine({ def_key: 'collab.review', spec: [], owner: ID, escalation: ID, reason: 'a reason here' }, 'c'), /payload\.spec/);
    expect(validateDefine({ def_key: 'collab.review', spec: { states: [] }, owner: ID, escalation: ID, reason: 'the review workflow' }, 'c').defKey).toBe('collab.review');
    status422(() => validateAdvance({ event: 'start_review', idempotency_key: 'k1x', lease_owner: 'w', lease_seconds: 30 }, 'c'), /lease_owner/);
    status422(() => validateAdvance({ event: 'start_review', idempotency_key: 'k1x', lease_owner: 'worker', lease_seconds: 7200 }, 'c'), /lease_seconds is 1\.\.3600/);
    expect(validateAdvance({ event: 'start_review', idempotency_key: 'k1x', lease_owner: 'worker' }, 'c')).toMatchObject({ leaseSeconds: 60, expectedSeq: null });
    status422(() => validateDrill({ kind: 'restart_replay' }, 'c'), /names the instance/);
    expect(validateDrill({ kind: 'duplicate_task' }, 'c')).toEqual({ kind: 'duplicate_task', instanceId: null });
  });
  it('a reassignment, a completion (the owning-action kinds), an invitation (≤ 30 days), an acceptance, an artifact, a review request', () => {
    status422(() => validateReassign({ to: 'nobody', reason: 'a good reason' }, 'c'), /payload\.to/);
    status422(() => validateComplete({ outcome: 'done', note: 'short' }, 'c'), /payload\.note/);
    expect(completesThroughOwningAction('gate.approve')).toBe(true);
    expect(completesThroughOwningAction('commitment.checkpoint')).toBe(true);
    expect(completesThroughOwningAction('collab.review')).toBe(false);
    expect(completesThroughOwningAction('workflow.compensation_confirm')).toBe(false);
    const now = Date.UTC(2026, 8, 28);
    status422(() => validateInvite({ display_name: 'Customs expert', contact_label: 'expert (SYNTHETIC)', audience_ceiling: 'internal', expires_in_days: MAX_GRANT_DAYS + 1 }, 'c', now), /expires_in_days is 1\.\.30/);
    status422(() => validateInvite({ display_name: 'Customs expert', contact_label: 'expert (SYNTHETIC)', audience_ceiling: 'secret', expires_in_days: 14 }, 'c', now), /audience_ceiling/);
    const inv = validateInvite({ display_name: 'Customs expert', contact_label: 'expert (SYNTHETIC)', audience_ceiling: 'internal', expires_in_days: 14 }, 'c', now);
    expect((new Date(inv.expiresAt).getTime() - now) / 86_400_000).toBeLessThanOrEqual(14);
    status422(() => validateAccept({ token: 'x'.repeat(32), password: 'short' }, 'c'), /password is at least 12/);
    status422(() => validateArtifact({ key: 'k1', title: 'A title', kind: 'evidence_ref', classification: 'internal' }, 'c'), /object_ref/);
    expect(validateArtifact({ key: 'k1', title: 'A title', kind: 'note', classification: 'internal', content: 'body' }, 'c').contentDigest).toMatch(/^[0-9a-f]{64}$/);
    status422(() => validateReviewRequest({ reviewer: ID, title: 'Review it', escalation: { max_escalations: 9 }, request_key: 'rk1' }, 'c'), /max_escalations is 0\.\.5/);
    expect(validateReviewRequest({ reviewer: ID, title: 'Review it', escalation: { principal: ID }, request_key: 'rk1' }, 'c').escalation).toEqual({ principal: ID, max_escalations: 1, extend_minutes: 1440 });
  });
});

describe('B34 workflow · the refusal rows (anchored; 403 → 404 → 409 → 422)', () => {
  it('the engine and the drills', () => {
    answer('42501', 'workflow definition rejected: recorded by the acting principal', 403, 'EYE-AUT-001');
    answer('42501', 'workflow rejected: an instance is never deleted', 403, 'EYE-AUT-001');
    answer('23503', `workflow rejected (unknown_instance): no instance ${ID} in this domain`, 404, 'EYE-STA-001');
    answer('23503', 'workflow rejected (unknown_definition): no definition collab.review in this domain', 404, 'EYE-STA-001');
    answer('23505', `workflow rejected (leased): instance ${ID} is leased by worker-a until 2026-09-28 18:35:15+00`, 409, 'EYE-STA-002');
    answer('23505', 'workflow rejected (stale_seq): the worker expected seq 0 and the committed seq is 1 — resume from the committed transition', 409, 'EYE-STA-002');
    answer('22023', `workflow rejected (not_running): instance ${ID} is completed`, 409, 'EYE-STA-002');
    answer('22023', 'workflow rejected (no_transition): escalate_to_board is not a transition from requested in collab.review v1 (the pinned definition)', 409, 'EYE-STA-002');
    answer('22023', 'workflow rejected (pinned): an instance keeps the definition, digest and subject it started with', 409, 'EYE-STA-002');
    answer('22023', 'workflow definition rejected (unchanged): version 1 of collab.review already has digest 0123456789ab', 409, 'EYE-STA-002');
    answer('22023', 'workflow definition rejected (initial): the initial state is one of the states', 422, 'EYE-REQ-001');
    answer('22023', 'workflow rejected (lease): a worker names itself and a lease of 1..3600 seconds', 422, 'EYE-REQ-001');
    answer('23503', `workflow drill rejected (unknown_instance): no instance ${ID} in this domain`, 404, 'EYE-STA-001');
    answer('22023', 'workflow drill rejected (kind): restart_replay, duplicate_task, duplicate_timer or definition_change', 422, 'EYE-REQ-001');
  });
  it('the timers (the prelude\'s texts included) and the human tasks', () => {
    answer('42501', 'workflow timer rejected: a timer is never deleted', 403, 'EYE-AUT-001');
    answer('22023', `workflow timer rejected: timer ${ID} already fired`, 409, 'EYE-STA-002');
    answer('23505', `workflow timer rejected (fired): timer ${ID} fired at 2026-09-28 — a timer fires once`, 409, 'EYE-STA-002');
    answer('23505', `workflow timer rejected (cancelled): timer ${ID} was cancelled at 2026-09-28`, 409, 'EYE-STA-002');
    answer('22023', 'workflow timer rejected (due_at): a timer names its instant', 422, 'EYE-REQ-001');
    answer('42501', 'human task rejected: recorded by the acting principal', 403, 'EYE-AUT-001');
    answer('42501', 'human task rejected (not_assignee): a task is reassigned by its assignee, an executive or a domain administrator', 403, 'EYE-AUT-001');
    answer('23503', `human task rejected (unknown_task): no task ${ID} in this domain`, 404, 'EYE-STA-001');
    answer('23505', 'human task rejected (owning_action): a gate.approve task is completed through the owning action, never here — complete through the owning action', 409, 'EYE-STA-002');
    answer('23505', `human task rejected (closed): task ${ID} is completed`, 409, 'EYE-STA-002');
    answer('22023', `human task rejected (not_eligible): ${ID} does not meet the stored eligibility of the gate.approve task (roles decision_approver, exclusions) — reassignment moves work, never authority`, 422, 'EYE-REQ-001');
    answer('22023', `human task rejected (not_member): ${ID} is not an active member of this tenant — reassignment moves work to a member`, 422, 'EYE-REQ-001');
    answer('22023', 'human task rejected (kind): workflow.x is not a task kind (gate.approve, …)', 422, 'EYE-REQ-001');
  });
  it('collaboration and its grants', () => {
    answer('42501', 'collaboration rejected (purpose): the grant is for the purpose collaboration.x; this request states executive', 403, 'EYE-AUT-001');
    answer('42501', 'collaboration rejected (grant_expired): the grant expired at 2026-10-12', 403, 'EYE-AUT-001');
    answer('42501', 'collaboration rejected (grant_lapsed): the grant on this workspace was lapsed — access is lost', 403, 'EYE-AUT-001');
    answer('42501', 'collaboration rejected (not_owner): the workspace\'s owner sets its participants', 403, 'EYE-AUT-001');
    answer('42501', 'collaboration rejected (not_assignee): review task x is held by another participant', 403, 'EYE-AUT-001');
    answer('23503', `collaboration rejected (unknown_workspace): no workspace ${ID} in this domain`, 404, 'EYE-STA-001');
    answer('23505', `collaboration rejected (closed): workspace ${ID} is closed`, 409, 'EYE-STA-002');
    answer('23505', `collaboration rejected (duplicate): ${ID} already takes part (or took part) in this workspace`, 409, 'EYE-STA-002');
    answer('22023', 'collaboration rejected (above_ceiling): confidential is above the ceiling internal this actor works under in this workspace', 422, 'EYE-REQ-001');
    answer('22023', `collaboration rejected (members_only): ${ID} is not an active member — an external collaborator joins only by invitation`, 422, 'EYE-REQ-001');
    answer('42501', 'collaboration grant rejected (not_invitee): only the invitee accepts their invitation', 403, 'EYE-AUT-001');
    answer('42501', 'collaboration grant rejected (token): the invitation token does not match', 403, 'EYE-AUT-001');
    answer('23503', `collaboration grant rejected (unknown_grant): no grant ${ID} in this domain`, 404, 'EYE-STA-001');
    answer('23505', 'collaboration grant rejected (state): the grant is revoked', 409, 'EYE-STA-002');
    answer('22023', 'collaboration grant rejected (expiry): a grant expires in the future and at most 30 days out', 422, 'EYE-REQ-001');
    answer('22023', 'collaboration grant rejected (ceiling): the audience ceiling restricted is at or below the workspace\'s ceiling confidential', 422, 'EYE-REQ-001');
    /* B34-F1 (0091): the provisioning's refusals */
    answer('42501', 'collaboration grant rejected (separation): the requester of an invitation does not provision it — an identity administrator does', 403, 'EYE-AUT-001');
    answer('42501', 'collaboration grant rejected (provisioner): a named, active human of the tenant or the platform provisions an invitee', 403, 'EYE-AUT-001');
    answer('23505', 'collaboration grant rejected (not_reserved): the grant\'s invitee is reserved by its provisioner first', 409, 'EYE-STA-002');
    answer('23505', 'collaboration grant rejected (identity): the invitee holds exactly one credential, expiring with the invitation window', 409, 'EYE-STA-002');
    answer('23505', 'collaboration grant rejected (state): the requested grant expired at 2026-09-29 10:00:00+00', 409, 'EYE-STA-002');
    answer('22023', 'collaboration grant rejected (invitee): an ext- login name', 422, 'EYE-REQ-001');
  });
});

describe('B34 workflow · the PDP (exact rules; the external collaborator holds exactly five actions)', () => {
  const pdp = new PdpService();
  const T = '0190b1c2-d3e4-7000-8000-00000000000a'; const D = '0190b1c2-d3e4-7000-8000-00000000000b';
  const decide = (action: string, role: string, scope: 'DOMAIN' | 'TENANT' = 'DOMAIN') => pdp.evaluate({ action, principal: { principalId: ID, kind: 'human', assurance: 'password',
    bindings: [{ roleCode: role, scope, tenantId: T, domainId: scope === 'DOMAIN' ? D : null }] }, delegationId: null, context: { scope: 'DOMAIN', tenantId: T, domainId: D }, purposeId: 'collaboration.x',
    consequenceClass: 'C2', objectType: 'CWS', objectId: null, environment: { deployment: 'local-dev', clockQuality: 'trusted' } } as PolicyInput);
  const EXTERNAL_HOLDS = ['executive.collab.read', 'executive.collab.discuss', 'executive.collab.review', 'executive.task.complete', 'executive.collab.accept'];
  it('the external collaborator: exactly its five actions; never a decision, a room, the workflow, the inbox, an invitation or its own scope', () => {
    for (const a of EXTERNAL_HOLDS) expect(decide(a, 'external_collaborator').decision, a).not.toBe('deny');
    for (const a of ['executive.task.read', 'executive.task.reassign', 'executive.workflow.read', 'executive.workflow.start', 'executive.collab.invite', 'executive.collab.workspace.open',
                     'executive.collab.participant.set', 'executive.collab.review.request', 'executive.collab.grant.revoke', 'decision.approve', 'decision.commit', 'room.membership', 'room.read',
                     'executive.attention.read', 'decision.read']) {
      expect(['deny', 'indeterminate'], a).toContain(decide(a, 'external_collaborator').decision);
    }
    // B36 (0094 §C, F-P6-14 (q)): the external collaborator resolves its OWN scope — identity.self.read admits the role, bounded by the grant in the port.
    expect(decide('identity.self.read', 'external_collaborator').decision).not.toBe('deny');
    expect(decide('executive.collab.discuss', 'external_collaborator').obligations).toEqual([{ type: 'human_gate' }]);
    expect(decide('executive.collab.read', 'external_collaborator').obligations).toEqual([{ type: 'audit_access' }]);
  });
  it('the members: the definition and the drills are the executive\'s and the administrator\'s; the invitation the owners\'; acceptance the external\'s alone', () => {
    for (const role of ['executive', 'domain_admin']) {
      expect(decide('executive.workflow.define', role).obligations, role).toEqual([{ type: 'human_gate' }]);
      expect(decide('executive.workflow.drill', role).decision, role).toBe('allow_with_obligations');
    }
    for (const role of ['domain_analyst', 'decision_approver', 'attention_agent']) expect(decide('executive.workflow.define', role).decision, role).toBe('deny');
    for (const role of ['decision_owner', 'strategy_owner', 'executive']) expect(decide('executive.collab.invite', role).decision, role).toBe('allow_with_obligations');
    for (const role of ['domain_analyst', 'decision_approver', 'auditor']) expect(decide('executive.collab.invite', role, role === 'auditor' ? 'TENANT' : 'DOMAIN').decision, role).toBe('deny');
    for (const role of ['executive', 'decision_owner', 'domain_admin']) expect(decide('executive.collab.accept', role).decision, role).toBe('deny');
    /* B34-F1 (0091): provisioning creates an identity principal — the identity administrators' act (the roles identity.principal.create admits) */
    expect(decide('executive.collab.provision', 'tenant_admin', 'TENANT').obligations).toEqual([{ type: 'human_gate' }]);
    for (const role of ['decision_owner', 'strategy_owner', 'executive', 'domain_admin', 'external_collaborator']) {
      expect(decide('executive.collab.provision', role).decision, role).toBe('deny');
      expect(decide('identity.principal.create', role).decision, role).toBe('deny');
    }
    expect(decide('identity.principal.create', 'tenant_admin', 'TENANT').decision).not.toBe('deny');
    expect(decide('executive.task.read', 'auditor', 'TENANT').decision).toBe('allow');
    expect(decide('executive.task.complete', 'decision_approver').obligations).toEqual([{ type: 'human_gate' }]);
  });
});

describe('B34 workflow · the clearance of an external collaborator', () => {
  const T = '0190b1c2-d3e4-7000-8000-00000000000a'; const D = '0190b1c2-d3e4-7000-8000-00000000000b';
  const target = { tenantId: T, domainId: D };
  const ext = { bindings: [{ roleCode: 'external_collaborator', scope: 'DOMAIN' as const, tenantId: T, domainId: D }] };
  it('is its grant\'s audience ceiling (public when none is given); a member\'s is unchanged', () => {
    expect(isExternal(ext, target)).toBe(true);
    expect(clearanceOf(ext, target, 'internal')).toBe('internal');
    expect(clearanceOf(ext, target)).toBe('public');
    expect(clearanceOf(ext, target, 'bogus')).toBe('public');
    expect(clearanceOf(ext, { tenantId: T, domainId: '0190b1c2-d3e4-7000-8000-00000000000c' }, 'internal'), 'a binding in another domain lends nothing').toBe('internal');
    const exec = { bindings: [{ roleCode: 'executive', scope: 'DOMAIN' as const, tenantId: T, domainId: D }] };
    expect(isExternal(exec, target)).toBe(false);
    expect(clearanceOf(exec, target)).toBe('confidential');
    expect(clearanceOf(exec, target, 'public'), 'a member\'s clearance ignores a grant ceiling').toBe('confidential');
  });
});
