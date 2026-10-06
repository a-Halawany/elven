/**
 * CP-6 B91 part `meters` (0105 §ME) — the pure logic: the cap intake (dimensions, units, periods, stop only where an admission point
 * enforces it — model_inference is warn only), the sweep route's refusal text, the PDP's two exact rules, and every refusal text of the
 * families `usage cap rejected (<class>)` / `usage record rejected (<class>)` mapped to its status. SYNTHETIC.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';
import { DIMENSIONS, STOPPABLE, UNITS, capRefusal, validateCapIntake } from '../../src/commercial/meters/meters.service.js';

const status = (f: () => unknown): number | null => { try { f(); return null; } catch (e) { return e instanceof HttpException ? e.getStatus() : -1; } };
const message = (f: () => unknown): string => { try { f(); return ''; } catch (e) { return e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? '') : String(e); } };
const map = (code: string, text: string): number | null => asObservationRefusal(Object.assign(new Error(text), { code }), 'c')?.getStatus() ?? null;
const CAP = { dimension: 'simulation_compute', period: 'day', limit: 3_600_000, action: 'stop', reason: 'the corridor study stops at an hour of compute (SYNTHETIC)' };

describe('B91 meters · the cap intake', () => {
  it('admits a stop cap on simulation_compute and a warn cap on every dimension in its units', () => {
    expect(validateCapIntake(CAP, 'c')).toEqual({ domainId: null, dimension: 'simulation_compute', unit: null, period: 'day', limit: 3_600_000, action: 'stop', reason: CAP.reason });
    for (const d of DIMENSIONS) for (const u of UNITS[d]) expect(validateCapIntake({ ...CAP, dimension: d, unit: u, action: 'warn' }, 'c')).toMatchObject({ dimension: d, unit: u, action: 'warn' });
    expect(STOPPABLE).toEqual(['simulation_compute']);
    expect(validateCapIntake({ ...CAP, domainId: '0190f3e2-aaaa-7000-8000-000000000001' }, 'c').domainId).toBe('0190f3e2-aaaa-7000-8000-000000000001');
  });
  it('refuses: an unmetered dimension, a unit of another dimension, a period, a limit, an action, a stop where nothing enforces it (model_inference: the gateway), a short reason, a malformed domain', () => {
    expect(status(() => validateCapIntake({ ...CAP, dimension: 'tokens' }, 'c'))).toBe(422);
    expect(status(() => validateCapIntake({ ...CAP, unit: 'calls' }, 'c'))).toBe(422);
    expect(status(() => validateCapIntake({ ...CAP, period: 'week' }, 'c'))).toBe(422);
    for (const limit of [0, -1, Number.NaN, '10']) expect(status(() => validateCapIntake({ ...CAP, limit }, 'c'))).toBe(422);
    expect(status(() => validateCapIntake({ ...CAP, action: 'throttle' }, 'c'))).toBe(422);
    expect(message(() => validateCapIntake({ ...CAP, dimension: 'model_inference', action: 'stop' }, 'c'))).toBe('usage cap rejected (action): a model_inference cap is warn only — a stop at the gateway would refuse an extraction mid-run');
    expect(message(() => validateCapIntake({ ...CAP, dimension: 'storage', action: 'stop' }, 'c'))).toMatch(/^usage cap rejected \(action\): a storage cap is warn only — no admission point enforces a stop on it/);
    expect(status(() => validateCapIntake({ ...CAP, reason: 'short' }, 'c'))).toBe(422);
    expect(status(() => validateCapIntake({ ...CAP, domainId: 'nordwerk' }, 'c'))).toBe(404);
  });
  it('the sweep route\'s refusal names the cap, the usage and that nothing was deleted', () => {
    const t = capRefusal({ limit: 1000, unit: 'wall_ms', period: 'day', used: 1200, period_start: '2026-10-04T00:00:00+00:00' });
    expect(t).toBe('usage cap rejected (cap): the tenant\'s simulation_compute cap (1000 wall_ms per day, stop) is reached — 1200 used since 2026-10-04T00:00:00+00:00; the sweep did not run (the breach is recorded; nothing was deleted; the tenant administrator may raise the cap)');
    expect(map('2F002', t)).toBe(409);
  });
});

describe('B91 meters · the refusal families mapped', () => {
  it('maps every class to its status (403 standing, 404 absence, 409 state, 422 the request)', () => {
    for (const c of ['actor', 'authority', 'scope']) { expect(map('42501', `usage cap rejected (${c}): x`)).toBe(403); expect(map('42501', `usage record rejected (${c}): x`)).toBe(403); }
    for (const c of ['unknown_domain', 'unknown_sweep']) { expect(map('22023', `usage cap rejected (${c}): x`)).toBe(404); expect(map('22023', `usage record rejected (${c}): x`)).toBe(404); }
    for (const c of ['state', 'stale', 'duplicate', 'unchanged', 'cap']) expect(map('2F002', `usage cap rejected (${c}): x`)).toBe(409);
    for (const c of ['dimension', 'unit', 'period', 'limit', 'action', 'reason', 'licence', 'source', 'quantity']) { expect(map('22023', `usage cap rejected (${c}): x`)).toBe(422); expect(map('22023', `usage record rejected (${c}): x`)).toBe(422); }
  });
});

describe('B91 meters · the PDP rules (exact)', () => {
  const pdp = new PdpService();
  const T = '0190f3e2-aaaa-7000-8000-0000000000aa'; const D = '0190f3e2-aaaa-7000-8000-0000000000bb';
  const input = (action: string, roles: Array<{ roleCode: string; scope: 'PLATFORM' | 'TENANT' | 'DOMAIN' }>, scope: 'TENANT' | 'DOMAIN'): PolicyInput => ({
    principal: { principalId: 'p', kind: 'human', assurance: 'password', bindings: roles.map((r) => ({ roleCode: r.roleCode, scope: r.scope, tenantId: r.scope === 'PLATFORM' ? null : T, domainId: r.scope === 'DOMAIN' ? D : null })) },
    delegationId: null, action, objectType: 'USG', objectId: null, purposeId: 'administration', context: { scope, tenantId: T, domainId: scope === 'DOMAIN' ? D : null }, consequenceClass: 'C2',
    environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  } as unknown as PolicyInput);
  it('commercial.cap.set: the tenant administrator only, human-gated', () => {
    expect(pdp.evaluate(input('commercial.cap.set', [{ roleCode: 'tenant_admin', scope: 'TENANT' }], 'TENANT'))).toMatchObject({ decision: 'allow_with_obligations', obligations: [{ type: 'human_gate' }] });
    for (const r of ['domain_admin', 'executive', 'simulation_operator']) expect(pdp.evaluate(input('commercial.cap.set', [{ roleCode: r, scope: 'DOMAIN' }], 'DOMAIN')).decision).toBe('deny');
    expect(pdp.evaluate(input('commercial.cap.set', [{ roleCode: 'commercial_authority', scope: 'PLATFORM' }], 'TENANT')).decision).toBe('deny');
  });
  it('commercial.usage.read: the administrator, the auditor, the vendor, the domain readers; audited', () => {
    expect(pdp.evaluate(input('commercial.usage.read', [{ roleCode: 'tenant_admin', scope: 'TENANT' }], 'TENANT'))).toMatchObject({ decision: 'allow_with_obligations', obligations: [{ type: 'audit_access' }] });
    expect(pdp.evaluate(input('commercial.usage.read', [{ roleCode: 'auditor', scope: 'TENANT' }], 'TENANT')).decision).toBe('allow_with_obligations');
    expect(pdp.evaluate(input('commercial.usage.read', [{ roleCode: 'commercial_authority', scope: 'PLATFORM' }], 'TENANT')).decision).toBe('allow_with_obligations');
    expect(pdp.evaluate(input('commercial.usage.read', [{ roleCode: 'domain_admin', scope: 'DOMAIN' }], 'DOMAIN')).decision).toBe('allow_with_obligations');
    expect(pdp.evaluate(input('commercial.usage.read', [{ roleCode: 'collection_manager', scope: 'DOMAIN' }], 'DOMAIN')).decision).toBe('deny');
  });
});
