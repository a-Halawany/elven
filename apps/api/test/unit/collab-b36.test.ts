/**
 * CP-6 B36 (0094 §C, part `collab`) — the pure parts: the pickup code (its shape, its normalisation, its hash at rest), the SEAL (the
 * token opens under the code it was sealed with and under no other; the seal carries no clear text), the log scrub, the learn step's
 * intake, the refusal rows of the section's families (`task dependency rejected`, `task rejected (dependency)`, `invitation rejected`,
 * `execution registration rejected`, `execution activation rejected`, `execution handoff rejected (inactive_target)`, `exposure learning
 * rejected`, `workflow rejected (dependency)`, `workflow definition rejected (depends_on)`) and the PDP rules the section adds.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PICKUP_CODE_RE, PICKUP_FAILURES_TO_LOCK, newPickupCode, normalizePickupCode, openMaterial, pickupCodeHash, scrubToken, sealMaterial } from '../../src/executive/workflow/invitation-sealing.js';
import { validateLearning } from '../../src/prediction/exposures/exposure-learning.controller.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';

const GRANT = '0192a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b';
const pg = (message: string, code: string) => Object.assign(new Error(message), { code });
const mapped = (message: string, code = '23505'): { status: number; text: string } => {
  const e = asObservationRefusal(pg(message, code), 'unit');
  if (!(e instanceof HttpException)) throw new Error(`${message} did not map`);
  return { status: e.getStatus(), text: String((e.getResponse() as { message?: string }).message ?? '') };
};

describe('B36 collab · the pickup code and the seal', () => {
  it('a code is 12 symbols in three groups from the unambiguous alphabet; five failures lock', () => {
    for (let i = 0; i < 50; i += 1) expect(newPickupCode()).toMatch(PICKUP_CODE_RE);
    expect(PICKUP_FAILURES_TO_LOCK).toBe(5);
  });
  it('a person\'s typing is normalised: case, dashes, spaces, O→0 and I/L→1; anything else is not a code', () => {
    expect(normalizePickupCode('abcd efgh jkmn')).toBe('ABCD-EFGH-JKMN');
    expect(normalizePickupCode('ABCD-EFGH-JKMN')).toBe('ABCD-EFGH-JKMN');
    expect(normalizePickupCode('oiL0-1234-5678')).toBe('0110-1234-5678');
    expect(normalizePickupCode('ABCD-EFGH-JKM')).toBeNull();
    expect(normalizePickupCode('ABCD-EFGH-JKMU')).toBeNull(); // U is not in the alphabet
    expect(normalizePickupCode('')).toBeNull();
  });
  it('the hash at rest is sha256 over the grant and the code — the same code hashes differently under another grant', () => {
    const code = newPickupCode();
    expect(pickupCodeHash(GRANT, code)).toMatch(/^[0-9a-f]{64}$/);
    expect(pickupCodeHash(GRANT, code)).toBe(pickupCodeHash(GRANT, code));
    expect(pickupCodeHash(GRANT, code)).not.toBe(pickupCodeHash(GRANT.replace('0192', '0193'), code));
  });
  it('the seal opens under its code only; it carries neither the token nor the login in clear; a tampered seal does not open', () => {
    const code = newPickupCode(); const other = newPickupCode();
    const token = 'tok-' + 'synthetic-' + 'material-0001';
    const sealed = sealMaterial(GRANT, code, { login: 'ext-abcdef012345', token });
    expect(sealed).toMatch(/^[A-Za-z0-9+/=]{64,4096}$/);
    expect(Buffer.from(sealed, 'base64').toString('latin1')).not.toContain(token);
    expect(Buffer.from(sealed, 'base64').toString('latin1')).not.toContain('ext-abcdef012345');
    expect(openMaterial(GRANT, code, sealed)).toEqual({ login: 'ext-abcdef012345', token });
    expect(openMaterial(GRANT, other, sealed)).toBeNull();
    expect(openMaterial(GRANT.replace('0192', '0193'), code, sealed)).toBeNull();
    const buf = Buffer.from(sealed, 'base64'); buf[buf.byteLength - 1] = (buf[buf.byteLength - 1] as number) ^ 0x01;
    expect(openMaterial(GRANT, code, buf.toString('base64'))).toBeNull();
    expect(openMaterial(GRANT, code, 'not-a-seal')).toBeNull();
  });
  it('the scrub blanks the token wherever a line carries it', () => {
    expect(scrubToken('delivered tok-abc to x; tok-abc again', 'tok-abc')).toBe('delivered [token] to x; [token] again');
    expect(scrubToken('nothing', '')).toBe('nothing');
  });
});

describe('B36 collab · the learn step\'s intake', () => {
  const ok = { reviewId: GRANT, expected: 'a 30–60 % chance of a two-week stop', observed: 'three days of line stop; the buffer held', basisChange: 'the buffer, not the route, is the binding constraint: the next bracket rests on buffer days' };
  it('the review it follows and the three texts', () => {
    expect(validateLearning(ok, 'c')).toEqual({ reviewId: GRANT, expectedNote: ok.expected, observedNote: ok.observed, basisChange: ok.basisChange });
    expect(() => validateLearning({ ...ok, reviewId: 'x' }, 'c')).toThrow(/reviewId is the outcome review/);
    expect(() => validateLearning({ ...ok, expected: 'short' }, 'c')).toThrow(/expected is 8\.\.2000/);
    expect(() => validateLearning({ ...ok, basisChange: 'too short' }, 'c')).toThrow(/basisChange is 16\.\.4000/);
  });
});

describe('B36 collab · the refusal rows (the class form; placed before the B34 catch-alls)', () => {
  it('actor and ownership → 403', () => {
    expect(mapped('task dependency rejected (not_holder): task x is held by another principal', '42501').status).toBe(403);
    expect(mapped('invitation rejected (provisioner): the identity administrator who provisioned the invitation delivers it', '42501').status).toBe(403);
    expect(mapped('execution activation rejected (separation): the registrar of target t never activates it', '42501').status).toBe(403);
    expect(mapped('exposure learning rejected (not_owner): a learning is recorded by the exposure\'s owner', '42501').status).toBe(403);
  });
  it('unknown → 404', () => {
    expect(mapped('task dependency rejected (unknown_task): no task x in this domain', '23503').status).toBe(404);
    expect(mapped('execution activation rejected (unknown_decision): no decision package x in this domain', '23503').status).toBe(404);
    expect(mapped('exposure learning rejected (unknown_review): no outcome review x of exposure y', '23503').status).toBe(404);
  });
  it('state → 409 — the dependency guard, the transition guard and the gateway\'s inactive target among them (not the B34 422 catch-alls)', () => {
    expect(mapped('task rejected (dependency): task x waits on 1 open task(s) (Review the route summary); it is completed when they are').status).toBe(409);
    expect(mapped('workflow rejected (dependency): approve from drafted waits on 1 open task(s) of step(s) review').status).toBe(409);
    expect(mapped('execution handoff rejected (inactive_target): target real-erp is inactive — a named execution authority activates it').status).toBe(409);
    expect(mapped('execution activation rejected (decision_not_committed): decision x is draft; the owner\'s decision is COMMITTED').status).toBe(409);
    expect(mapped('execution activation rejected (synthetic): target t is recorded synthetic').status).toBe(409);
    expect(mapped('invitation rejected (duplicate): the invitation of grant x is delivered already').status).toBe(409);
    expect(mapped('task dependency rejected (state): task x is completed; only an open task waits').status).toBe(409);
    expect(mapped('exposure learning rejected (duplicate): the outcome review x carries its learning already').status).toBe(409);
  });
  it('the rest → 422', () => {
    expect(mapped('task dependency rejected (cycle): a task cannot wait on itself', '22023').status).toBe(422);
    expect(mapped('workflow definition rejected (depends_on): x is not a state of this definition (approve)', '22023').status).toBe(422);
    expect(mapped('execution registration rejected (trust_anchor): a non-synthetic target declares the trust anchor', '22023').status).toBe(422);
    expect(mapped('execution activation rejected (decision_names_no_target): the committed decision x names no target t', '22023').status).toBe(422);
    expect(mapped('invitation rejected (material): a delivery carries the code\'s hash and the sealed acceptance material', '22023').status).toBe(422);
  });
  it('the B34 families keep their rows: a human task refusal is not a task dependency\'s', () => {
    expect(mapped('human task rejected (not_assignee): task x is held by another principal', '42501').status).toBe(403);
    expect(mapped('execution issue rejected (separation): the drafter of handoff x never issues it', '42501').status).toBe(403);
  });
});

describe('B36 collab · the PDP rules', () => {
  const pdp = new PdpService();
  const T = '11111111-1111-4111-8111-111111111111'; const D = '22222222-2222-4222-8222-222222222222';
  const decide = (action: string, role: string) => pdp.evaluate({ action, principal: { principalId: GRANT, kind: 'human', assurance: 'password', bindings: [{ roleCode: role, scope: 'DOMAIN', tenantId: T, domainId: D }] },
    delegationId: null, context: { scope: 'DOMAIN', tenantId: T, domainId: D }, purposeId: 'executive', consequenceClass: 'C2', objectType: 'CGR', objectId: null,
    environment: { deployment: 'local-dev', clockQuality: 'trusted' } } as PolicyInput).decision;
  it('the external collaborator reads its own identity (bounded to its grant by the route) and nothing of the new acts', () => {
    expect(decide('identity.self.read', 'external_collaborator')).toMatch(/^allow/);
    for (const a of ['executive.task.dependency.declare', 'executive.collab.mailbox.read', 'decision.execution.target.register', 'decision.execution.target.activate', 'decision.execution.target.deactivate', 'prediction.exposure.learn']) {
      expect(decide(a, 'external_collaborator'), a).toBe('deny');
    }
  });
  it('the acts: the registrar (domain_admin) registers, the execution authority activates, either deactivates; the identity administrators read the mailbox; the owner or sponsor learns', () => {
    expect(decide('decision.execution.target.register', 'domain_admin')).toMatch(/^allow/);
    expect(decide('decision.execution.target.register', 'execution_authority')).toBe('deny');
    expect(decide('decision.execution.target.activate', 'execution_authority')).toMatch(/^allow/);
    expect(decide('decision.execution.target.activate', 'domain_admin')).toBe('deny');
    expect(decide('decision.execution.target.deactivate', 'domain_admin')).toMatch(/^allow/);
    expect(decide('executive.collab.mailbox.read', 'domain_admin')).toBe('deny');
    expect(decide('prediction.exposure.learn', 'risk_owner')).toMatch(/^allow/);
    expect(decide('prediction.exposure.learn', 'domain_analyst')).toBe('deny');
    expect(decide('executive.task.dependency.declare', 'decision_owner')).toMatch(/^allow/);
  });
});
