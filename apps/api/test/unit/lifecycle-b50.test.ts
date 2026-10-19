/**
 * B50 §LC (0120_b50_x_lc) — hermetic: the PDP's five EXACT lifecycle rules (placed before the `objects.` prefix rules), and the pure logic of the
 * lifecycle routes (the refusal classes in the port's words, the kept-but-rejected answer, the intake shaping). No database. Fixtures SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import {
  LIFECYCLE_ACTIONS, asLifecycleRefusal, authorIntake, decideIntake, proposeIntake, rejectionOf, statusOfClass, transitionIntake,
} from '../../src/objects/lifecycle/lifecycle-logic.js';

const T = '0193a3d0-0000-7000-8000-000000000001';
const D = '0193a3d0-0000-7000-8000-000000000002';
const input = (action: string, roles: string[], over: Partial<PolicyInput> & { kind?: 'human' | 'agent' } = {}): PolicyInput => ({
  principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind: over.kind ?? 'human', assurance: 'password',
               bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
  delegationId: null, action, objectType: 'ASM', objectId: null, purposeId: 'intelligence',
  context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C2', environment: { deployment: 'local-dev', clockQuality: 'trusted' }, ...over,
});

describe('B50 §LC · the PDP rules are exact and placed before the objects prefix rules', () => {
  const pdp = new PdpService();
  it('reading: a domain\'s human roles, audited; nothing for an agent role', () => {
    const r = pdp.evaluate(input(LIFECYCLE_ACTIONS.read, ['knowledge_owner']));
    expect(r).toMatchObject({ decision: 'allow_with_obligations', obligations: [{ type: 'audit_access' }] });
    expect(pdp.evaluate(input(LIFECYCLE_ACTIONS.read, ['extraction_agent'])).decision).toBe('deny');
  });
  it('authoring: the authoring roles under the human gate; a simulation operator is refused', () => {
    expect(pdp.evaluate(input(LIFECYCLE_ACTIONS.author, ['domain_specialist']))).toMatchObject({ decision: 'allow_with_obligations', obligations: [{ type: 'human_gate' }] });
    expect(pdp.evaluate(input(LIFECYCLE_ACTIONS.author, ['simulation_operator'])).decision).toBe('deny');
  });
  it('transitioning and deciding: human-gated (the port re-checks owner / reviewer / approver); a domain_admin gets the GATE, not the prefix rule\'s bare allow', () => {
    for (const a of [LIFECYCLE_ACTIONS.transition, LIFECYCLE_ACTIONS.decide]) {
      expect(pdp.evaluate(input(a, ['domain_admin'])), a).toMatchObject({ decision: 'allow_with_obligations', obligations: [{ type: 'human_gate' }] });
      expect(pdp.evaluate(input(a, ['extraction_agent'])).decision, a).toBe('deny');
    }
  });
  it('proposing: people and the agent roles, never gated (a proposal is never authoritative)', () => {
    expect(pdp.evaluate(input(LIFECYCLE_ACTIONS.propose, ['extraction_agent'], { kind: 'agent' }))).toMatchObject({ decision: 'allow', obligations: [] });
    expect(pdp.evaluate(input(LIFECYCLE_ACTIONS.propose, ['knowledge_owner'])).decision).toBe('allow');
  });
  it('exact: a neighbouring name inherits nothing from these rules (it falls to the objects prefix rule, which never gates and stops at C2)', () => {
    const near = pdp.evaluate(input('objects.lifecycle.transitions', ['domain_specialist']));
    expect(near.decision).toBe('deny');   // the prefix rule does not admit a domain_specialist
    expect(pdp.evaluate(input(LIFECYCLE_ACTIONS.transition, ['domain_specialist'], { consequenceClass: 'C3' })).decision).toBe('deny');
  });
});

describe('B50 §LC · the refusal classes and the kept rejection', () => {
  it('the classes: 403 actor/authority/separation, 404 unknown_*, 409 state/stale/duplicate, 422 the rest', () => {
    expect(['actor', 'authority', 'separation_of_duties'].map(statusOfClass)).toEqual([403, 403, 403]);
    expect(['unknown_object', 'unknown_proposal'].map(statusOfClass)).toEqual([404, 404]);
    expect(['state', 'stale', 'duplicate'].map(statusOfClass)).toEqual([409, 409, 409]);
    expect(['transition', 'reentry', 'profile', 'reason'].map(statusOfClass)).toEqual([422, 422, 422, 422]);
  });
  it('a port\'s raised refusal keeps its words; anything else passes through', () => {
    const m = asLifecycleRefusal(new Error('lifecycle proposal rejected (stale): the proposal read version 1; the authoritative version is 2 (reviewed)'), 'c') as HttpException;
    expect(m.getStatus()).toBe(409);
    expect((m.getResponse() as Record<string, unknown>)['message']).toMatch(/^lifecycle proposal rejected \(stale\)/);
    const other = new Error('something else');
    expect(asLifecycleRefusal(other, 'c')).toBe(other);
  });
  it('a kept rejection answers its class with the recorded outcome beside it; an acceptance answers nothing', () => {
    const out = { outcome: 'rejected', refusal: { class: 'stale', code: 'stale_version', message: 'lifecycle transition rejected (stale): expected 2; is 3' }, last_authoritative_version: 3 };
    const e = rejectionOf(out, 'c', { policyDecisionId: 'p', auditSeq: 1 })!;
    expect(e.getStatus()).toBe(409);
    expect(e.getResponse()).toMatchObject({ message: out.refusal.message, outcome: out, receipt: { auditSeq: 1 } });
    expect(rejectionOf({ outcome: 'accepted' }, 'c', { policyDecisionId: 'p', auditSeq: 1 })).toBeNull();
  });
});

describe('B50 §LC · the intake (types only)', () => {
  const bad = (f: () => unknown, re: RegExp) => { try { f(); throw new Error('accepted'); } catch (e) { expect((e as HttpException).getResponse()).toMatchObject({ message: expect.stringMatching(re) }); } };
  it('a transition names its action, the version read and its key; a re-entry reason from the vocabulary; changes an object', () => {
    expect(transitionIntake({ action: 'publish', expectedVersion: 2, idempotencyKey: 'k-00000001' }, 'c')).toMatchObject({ action: 'publish', expectedVersion: 2, to: null, changes: {} });
    bad(() => transitionIntake({ expectedVersion: 2, idempotencyKey: 'k-00000001' }, 'c'), /^lifecycle transition rejected \(transition\)/);
    bad(() => transitionIntake({ action: 'publish', expectedVersion: 0, idempotencyKey: 'k-00000001' }, 'c'), /^lifecycle transition rejected \(version\)/);
    bad(() => transitionIntake({ action: 'publish', expectedVersion: 2, idempotencyKey: 'short' }, 'c'), /^lifecycle transition rejected \(idempotency\)/);
    bad(() => transitionIntake({ action: 'reopen', expectedVersion: 2, idempotencyKey: 'k-00000001', reentryReason: 'because' }, 'c'), /^lifecycle transition rejected \(reentry\)/);
    bad(() => transitionIntake({ action: 'publish', expectedVersion: 2, idempotencyKey: 'k-00000001', causationId: 'x' }, 'c'), /^lifecycle transition rejected \(causation_id\)/);
  });
  it('authoring, proposing and deciding', () => {
    expect(authorIntake({ title: 't', statement: 's', idempotencyKey: 'k-00000001' }, 'c')).toMatchObject({ objectType: 'ASM', synthetic: false, evidenceRefs: [] });
    bad(() => authorIntake({ idempotencyKey: 'k-00000001', body: [] }, 'c'), /^work object rejected \(content\)/);
    bad(() => proposeIntake({ requestId: '0193a3d0-0000-7000-8000-000000000009', baseVersion: 1, action: 'publish', via: 'email' }, 'c'), /^lifecycle proposal rejected \(via\)/);
    expect(decideIntake({ requestId: '0193a3d0-0000-7000-8000-000000000009', decision: 'decline', reason: 'r' }, 'c')).toMatchObject({ expectedVersion: null, idempotencyKey: null });
    bad(() => decideIntake({ requestId: '0193a3d0-0000-7000-8000-000000000009', decision: 'accept', reason: 'r' }, 'c'), /^lifecycle proposal rejected \(version\)/);
  });
});
