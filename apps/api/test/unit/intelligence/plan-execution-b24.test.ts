/**
 * CP-6 B24 (0086 §P, part `plan`) — hermetic: the extraction agent's two EXACT policy rules (human-gated; no agent role; nothing near them
 * inherits), the refusal rows of the registry and the ledger ports (anchored, in 403 → 404 → 409 → 422 order), the executor's identity,
 * and the observations consumer's new identity (its METHOD_REF changed: the selection now queues executions).
 */
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { PdpService, type PolicyInput } from '../../../src/policy/pdp.service.js';
import { asObservationRefusal } from '../../../src/observation/observation-errors.js';
import { consumerCodeDigest, CONSUMER_VERSION } from '../../../src/graph/subscriptions/graph-change.js';
import { PLAN_EXECUTOR, planQueueNameFor, planSchedulerIdFor } from '../../../src/intelligence/plan/plan-executor.js';

const T = '0193a3d0-0000-7000-8000-000000000001';
const D = '0193a3d0-0000-7000-8000-000000000002';
const input = (over: Partial<PolicyInput> & { roles?: string[]; kind?: 'human' | 'workload' | 'agent' }): PolicyInput => ({
  principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind: over.kind ?? 'human', assurance: 'password',
               bindings: (over.roles ?? ['extraction_manager']).map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: T, domainId: D })) },
  delegationId: null, action: 'intelligence.extraction.agent.register', objectType: 'AGT', objectId: null, purposeId: 'intelligence',
  context: { scope: 'DOMAIN', tenantId: T, domainId: D }, consequenceClass: 'C2',
  environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  ...over,
});
const pgError = (code: string, message: string) => Object.assign(new Error(message), { code });

describe('B24 plan · the extraction agent at the policy decision point', () => {
  const pdp = new PdpService();
  it('registration and revocation: the domain administrator and the extraction manager, human-gated, at C2', () => {
    for (const action of ['intelligence.extraction.agent.register', 'intelligence.extraction.agent.revoke']) {
      for (const role of ['extraction_manager', 'domain_admin']) {
        const r = pdp.evaluate(input({ action, roles: [role] }));
        expect(r.decision, `${action} ${role}`).toBe('allow_with_obligations');
        expect(r.obligations).toEqual([{ type: 'human_gate' }]);
      }
      expect(pdp.evaluate(input({ action, consequenceClass: 'C3' })).decision, action).toBe('deny');
    }
  });
  it('no agent role and no reader holds it: nothing that runs extraction decides who runs it', () => {
    for (const role of ['extraction_agent', 'observation_subscriber', 'domain_analyst', 'collection_manager', 'resolution_manager', 'attention_agent']) {
      expect(pdp.evaluate(input({ roles: [role] })).decision, role).toBe('deny');
    }
  });
  it('matches EXACTLY: a neighbouring action inherits nothing', () => {
    for (const action of ['intelligence.extraction.agent', 'intelligence.extraction.agent.registered', 'intelligence.extraction.agent.register.now', 'intelligence.extraction']) {
      expect(pdp.evaluate(input({ action })).decision, action).toBe('indeterminate');
    }
  });
  it('the run itself needs nothing new: extraction_agent already holds the read, the run, the retrieval and the admission', () => {
    for (const action of ['intelligence.read', 'intelligence.run.start', 'intelligence.run.finish', 'observation.evidence.retrieve', 'intelligence.claim.admit']) {
      expect(['allow', 'allow_with_obligations'], action).toContain(pdp.evaluate(input({ action, roles: ['extraction_agent'], kind: 'agent', consequenceClass: 'C2' })).decision);
    }
  });
});

describe('B24 plan · the refusal rows', () => {
  const at = (code: string, message: string) => {
    const e = asObservationRefusal(pgError(code, message), 'unit');
    const body = e?.getResponse() as { code?: string; message?: string } | undefined;
    return { status: e?.getStatus() ?? null, code: body?.code ?? null, message: body?.message ?? null };
  };
  it('the standing 403, the absences 404, the record\'s state 409, the caller\'s request 422 — the port\'s own words kept', () => {
    expect(at('42501', 'extraction agent rejected: recorded by the acting principal only (the actor named is not the session\'s principal)')).toMatchObject({ status: 403, code: 'EYE-AUT-001' });
    expect(at('42501', 'extraction agent revocation rejected: recorded by the acting principal only (x)')).toMatchObject({ status: 403 });
    expect(at('23503', 'extraction agent revocation rejected: 0193a3d0-0000-7000-8000-000000000003 is not an active extraction agent of this domain')).toMatchObject({ status: 404, code: 'EYE-STA-001' });
    expect(at('23503', 'plan execution rejected: agent 0193a3d0-0000-7000-8000-000000000003 is not registered in this domain')).toMatchObject({ status: 404 });
    expect(at('23503', 'plan execution rejected: execution 0193a3d0-0000-7000-8000-000000000003 is not an execution of this domain')).toMatchObject({ status: 404 });
    expect(at('23505', 'extraction agent rejected: this domain already has an active extraction agent; revoke it first')).toMatchObject({ status: 409, code: 'EYE-STA-002' });
    expect(at('23505', 'extraction agent rejected: principal 0193a3d0-0000-7000-8000-000000000003 was already registered (a revoked registration is not reused; register a new principal)')).toMatchObject({ status: 409 });
    expect(at('23514', 'plan execution rejected: execution 0193a3d0-0000-7000-8000-000000000003 is done, not running; only a claimed execution records an outcome')).toMatchObject({ status: 409 });
    const r = at('22023', 'extraction agent rejected: principal 0193a3d0-0000-7000-8000-000000000003 holds no live extraction_agent binding in this domain');
    expect(r).toMatchObject({ status: 422, code: 'EYE-REQ-001' });
    expect(r.message).toMatch(/^extraction agent rejected: principal .* holds no live extraction_agent binding/);
    expect(at('22023', 'extraction agent revocation rejected: a revocation states its reason (at least 8 characters)')).toMatchObject({ status: 422 });
    expect(at('22023', 'plan execution rejected: an outcome is done, refused or failed')).toMatchObject({ status: 422 });
  });
});

describe('B24 plan · the identities', () => {
  it('the executor\'s version and code digest are the code\'s; its queue and drain are scope-prefixed', () => {
    expect(PLAN_EXECUTOR).toMatchObject({ name: 'intelligence.plan-execution', version: '1.0.0' });
    expect(PLAN_EXECUTOR.codeDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(planQueueNameFor(T, D)).toBe(`intel:${T}:${D}:plan`);
    expect(planSchedulerIdFor(T, D)).toBe(`intel:${T}:${D}:plan-drain`);
  });
  it('the observations consumer is a NEW identity (0086: the selection queues executions) — every live observations subscription is re-registered', () => {
    const b22 = 'ObservationRecorded → intelligence.select_transformation_plan (the active extraction methods that read the evidence\'s source, or no_plan with the reason; once per event and evidence); the run stays an extraction agent\'s act; a payload that is not the contract is quarantined (invalid_event)';
    const before = createHash('sha256').update(`graph.subscription.observations@${CONSUMER_VERSION}:${b22}`, 'utf8').digest('hex');
    expect(consumerCodeDigest('observations')).toMatch(/^[0-9a-f]{64}$/);
    expect(consumerCodeDigest('observations')).not.toBe(before);
  });
});
