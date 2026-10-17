/**
 * CP-6 B80 §CB (0118 §CB) — the operating context bar's pure parts: the intakes (every dimension stated; no commit without its preview),
 * the PDP rules (executive.context.set widened to every human DOMAIN role, human-gated; executive.context.read audited; agents never), and
 * every refusal text of the ports and the route through the central mapper (actor 403, stale 409, the rest 422 — B36 home's rows).
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { B80_CONTEXT_SETTER_ROLES, PdpService } from '../../src/policy/pdp.service.js';
import { validateCommit, validateProposed } from '../../src/shell/context/context.service.js';

const corr = '00000000-0000-7000-8000-000000000000';
const message = (f: () => unknown): string => { try { f(); return 'accepted'; } catch (e) { return e instanceof HttpException ? String((e.getResponse() as { message: string }).message) : String(e); } };
const OBJ = '0192a3b4-c5d6-7e8f-9a0b-1c2d3e4f5a6b';

describe('B80 §CB · the intakes', () => {
  it('the proposed context states every dimension; an effective time is an instant or live', () => {
    expect(validateProposed({ objectiveId: OBJ, horizon: '30d', scenarioId: null, classification: 'internal', effectiveAt: '2026-10-01T00:00:00Z' }, corr))
      .toEqual({ objectiveId: OBJ, horizon: '30d', scenarioId: null, classification: 'internal', effectiveAt: '2026-10-01T00:00:00.000Z' });
    expect(message(() => validateProposed({ classification: 'internal' }, corr))).toBe('context rejected (horizon): the horizon is one of 30d, 90d, 12m, 36m');
    expect(message(() => validateProposed({ horizon: '90d' }, corr))).toMatch(/^context rejected \(classification\)/);
    expect(message(() => validateProposed({ horizon: '90d', classification: 'internal', objectiveId: 'x' }, corr))).toMatch(/^context rejected \(objective\)/);
    expect(message(() => validateProposed({ horizon: '90d', classification: 'internal', effectiveAt: 'soon' }, corr))).toMatch(/^context rejected \(effective_at\)/);
  });
  it('no commit without its preview: the basis key and the impact digest are required; the invalidated previews are bounded', () => {
    const p = { horizon: '90d', classification: 'internal' };
    expect(message(() => validateCommit(p, corr))).toMatch(/^context rejected \(preview\): .* basisContextId/);
    expect(message(() => validateCommit({ ...p, basisContextId: null }, corr))).toMatch(/^context rejected \(preview\): .* the impact digest is required/);
    expect(validateCommit({ ...p, basisContextId: null, impactDigest: 'a'.repeat(64) }, corr)).toMatchObject({ basisContextId: null, impactDigest: 'a'.repeat(64), invalidated: [] });
    expect(message(() => validateCommit({ ...p, basisContextId: null, impactDigest: 'a'.repeat(64), invalidated: Array.from({ length: 201 }, (_, i) => `k${i}`) }, corr))).toMatch(/^context rejected \(previews\)/);
    expect(message(() => validateCommit({ ...p, basisContextId: null, impactDigest: 'a'.repeat(64), invalidated: [''] }, corr))).toMatch(/^context rejected \(previews\)/);
  });
});

describe('B80 §CB · the PDP rules (D3)', () => {
  const pdp = new PdpService();
  const evalAs = (action: string, roleCode: string, scope: 'DOMAIN' | 'TENANT' = 'DOMAIN') => pdp.evaluate({
    principal: { principalId: 'p', kind: 'human', assurance: 'password', bindings: [{ roleCode, scope, tenantId: 't', domainId: scope === 'DOMAIN' ? 'd' : null }] },
    delegationId: null, action, objectType: 'CTX', objectId: null, purposeId: 'shell.context',
    context: { scope: 'DOMAIN', tenantId: 't', domainId: 'd' }, consequenceClass: 'C2', environment: {},
  } as never);
  it('executive.context.set: every human domain role, human-gated; an agent role, a subscriber and the external collaborator refused', () => {
    for (const role of B80_CONTEXT_SETTER_ROLES) {
      const r = evalAs('executive.context.set', role);
      expect(r.decision, role).toBe('allow_with_obligations');
      expect(r.obligations).toEqual([{ type: 'human_gate' }]);
    }
    for (const role of ['decision_agent', 'collection_agent', 'warning_subscriber', 'external_collaborator', 'tenant_admin']) {
      expect(evalAs('executive.context.set', role, role === 'tenant_admin' ? 'TENANT' : 'DOMAIN').decision, role).toBe('deny');
    }
    expect(B80_CONTEXT_SETTER_ROLES).toContain('collection_manager');
    expect(B80_CONTEXT_SETTER_ROLES).toContain('domain_analyst');
  });
  it('executive.context.read: the setters and the TENANT-bound readers, audited; an agent refused', () => {
    expect(evalAs('executive.context.read', 'collection_manager')).toMatchObject({ decision: 'allow_with_obligations', obligations: [{ type: 'audit_access' }] });
    expect(evalAs('executive.context.read', 'auditor', 'TENANT').decision).toBe('allow_with_obligations');
    expect(evalAs('executive.context.read', 'decision_agent').decision).toBe('deny');
  });
});

describe('B80 §CB · every refusal text through the central mapper', () => {
  const cases: Array<[string, number]> = [
    ['context rejected (actor): set by the acting principal', 403],
    ['context rejected (actor): a context is set by a named human — an agent or a workload never sets one', 403],
    ['context rejected (actor): the acting principal holds no human domain role in this domain', 403],
    ['context rejected (actor): the impact is read by the acting principal, for its own context', 403],
    ['context rejected (actor): the operating context is read by the acting principal, for its own context', 403],
    ['context rejected (stale): scenario 0192 is closed; a stale scenario cannot be set', 409],
    ['context rejected (stale): objective 0192 is not a live strategy object of this domain', 409],
    ['context rejected (stale): the context changed since the preview (previewed over none, current x); preview the switch again', 409],
    ['context rejected (stale): the affected work changed since the preview (previewed a, now b); preview the switch again', 409],
    ['context rejected (unchanged): the proposed context is the current one; nothing to switch', 422],
    ['context rejected (preview): a context is committed only from its impact preview — the impact digest is required', 422],
    ['context rejected (previews): the invalidated previews are a list of at most 200 keys of 1–200 characters', 422],
    ['context rejected (horizon): the horizon is one of 30d, 90d, 12m, 36m', 422],
    ['context rejected (classification): the classification ceiling is one of public, internal, confidential, restricted', 422],
  ];
  it.each(cases)('%s → %i', (text, status) => {
    const ex = asObservationRefusal({ message: text, code: '22023' }, 'unit');
    expect(ex, text).not.toBeNull();
    expect(ex!.getStatus()).toBe(status);
  });
});
