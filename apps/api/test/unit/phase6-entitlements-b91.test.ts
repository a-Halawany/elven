/**
 * CP-6 B91 §EN (0105) — hermetic: THE EXEMPTION LIST (the pipeline's fast path, mirrored by commercial.cen_exemption), the refusal
 * family's mapping (every `<noun> rejected (<class>)` text the part's migration raises, read from the file and run through the mapper), the
 * catalogue's EYE_ENT_001 and the B91 PDP rules.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ERROR_CATALOG, errorBody } from '@eye/contracts';
import { entitlementExemption } from '../../src/commercial/entitlements/entitlement-gate.js';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { PdpService, type PolicyInput } from '../../src/policy/pdp.service.js';

describe('B91 §EN · the exemption list (ADR-022: what no licence state can make unavailable)', () => {
  const CASES: Array<[string, boolean, string | null]> = [
    ['simulation.experiment.approve', true, 'human_gate'], ['decision.commit', true, 'human_gate'],
    ['identity.self.read', false, 'mandatory_control'], ['tenancy.domain.create', false, 'mandatory_control'], ['audit.read', false, 'mandatory_control'],
    ['audit.verify', false, 'mandatory_control'], ['policy.read', false, 'mandatory_control'], ['retention.export.download', false, 'mandatory_control'],
    ['retention.action.withdraw', false, 'mandatory_control'], ['objects.create', false, 'mandatory_control'], ['commercial.licence.issue', false, 'mandatory_control'],
    ['prediction.warning.acknowledge', false, 'warning_control'], ['prediction.warning.raise', false, 'warning_control'],
    ['executive.attention.item.acknowledge', false, 'warning_control'], ['executive.attention.tick', false, 'warning_control'],
    ['observation.correction.apply', false, 'correction_withdrawal'], ['executive.publication.correct', false, 'correction_withdrawal'],
    ['prediction.forecast.withdraw', false, 'correction_withdrawal'], ['products.metric.withdraw_certification', false, 'correction_withdrawal'],
    ['simulation.challenge.withdraw', false, 'correction_withdrawal'],
    ['simulation.read', false, 'read_existing'], ['simulation.fabric.read', false, 'read_existing'], ['executive.search', false, 'read_existing'],
    ['products.catalog.search', false, 'read_existing'], ['graph.assumption.verify', false, 'read_existing'], ['executive.publication.export', false, 'read_existing'],
    ['simulation.experiment.declare', false, null], ['simulation.sweep.run', false, null], ['simulation.reproduce', false, null], ['twin.estimate.propose', false, null],
    ['prediction.forecast.issue', false, null], ['decision.review.metrics', false, null], ['graph.entity.create', false, null], ['agent.run', false, null],
    ['report.render', false, null], ['prediction.warningx.raise', false, null], ['auditor.thing', false, null], ['simulation.readiness', false, null],
  ];
  it('every case', () => {
    for (const [action, gated, want] of CASES) expect(entitlementExemption(action, gated), action).toBe(want);
  });
  it('the human gate wins over everything (a named human\'s decision is never sold or removed)', () => {
    expect(entitlementExemption('simulation.experiment.declare', true)).toBe('human_gate');
  });
});

describe('B91 §EN · the refusal family maps per class (every text the migration raises)', () => {
  const sqlText = readFileSync(join(__dirname, '../../migrations/0105_b91_x_entitlements.sql'), 'utf8');
  const texts = [...sqlText.matchAll(/RAISE EXCEPTION '((capability|offer|licence|contract) rejected \(([a-z_]+)\)[^']*)'/g)].map((m) => ({ text: m[1]!, cls: m[3]! }));
  const want = (cls: string): number => (['actor', 'ownership', 'authority'].includes(cls) ? 403 : cls.startsWith('unknown_') ? 404 : ['state', 'stale', 'duplicate'].includes(cls) ? 409 : 422);
  it('the migration raises the four families (and nothing else in the class form)', () => {
    expect(texts.length).toBeGreaterThanOrEqual(60);
    expect(new Set(texts.map((t) => t.text.split(' rejected')[0]))).toEqual(new Set(['capability', 'offer', 'licence', 'contract']));
  });
  it('each text answers its class\'s status (403 / 404 / 409 / 422), under every SQLSTATE the ports use', () => {
    for (const { text, cls } of texts) {
      const message = text.replace(/%/g, 'x');
      for (const code of ['22023', '42501']) {
        const r = asObservationRefusal(Object.assign(new Error(message), { code }), 'c');
        expect(r?.getStatus(), `${code} ${message}`).toBe(want(cls));
      }
    }
  });
});

describe('B91 §EN · EYE_ENT_001', () => {
  it('is in the catalogue: 403, not retryable, an availability refusal', () => {
    expect(ERROR_CATALOG.EYE_ENT_001).toMatchObject({ code: 'EYE-ENT-001', machineName: 'capability_unavailable', httpStatus: 403, retry: 'no' });
    expect(errorBody('EYE_ENT_001', 'c', 'x')).toMatchObject({ code: 'EYE-ENT-001', message: 'x' });
  });
});

describe('B91 §EN · the PDP rules (exact, the commercial authority human-gated, the read audited)', () => {
  const pdp = new PdpService();
  const T = '0193a3d0-0000-7000-8000-000000000001';
  const D = '0193a3d0-0000-7000-8000-000000000002';
  const input = (action: string, scope: 'PLATFORM' | 'TENANT' | 'DOMAIN', role: string, atScope: 'PLATFORM' | 'TENANT' | 'DOMAIN', kind: 'human' | 'agent' = 'human'): PolicyInput => ({
    principal: { principalId: '0193a3d0-0000-7000-8000-0000000000aa', kind, assurance: 'password',
                 bindings: [{ roleCode: role, scope: atScope, tenantId: atScope === 'PLATFORM' ? null : T, domainId: atScope === 'DOMAIN' ? D : null }] },
    delegationId: null, action, objectType: null, objectId: null, purposeId: 'commercial',
    context: { scope, tenantId: scope === 'PLATFORM' ? null : T, domainId: scope === 'DOMAIN' ? D : null }, consequenceClass: 'C2',
    environment: { deployment: 'local-dev', clockQuality: 'trusted' },
  });
  const VENDOR_ACTS = ['commercial.capability.declare', 'commercial.offer.declare', 'commercial.offer.package', 'commercial.offer.sku', 'commercial.licence.issue', 'commercial.contract.declare'];
  it('the vendor\'s acts: the commercial authority (PLATFORM), human-gated; nobody else', () => {
    for (const a of VENDOR_ACTS) {
      const r = pdp.evaluate(input(a, 'PLATFORM', 'commercial_authority', 'PLATFORM'));
      expect(r.decision, a).toBe('allow_with_obligations');
      expect(r.obligations, a).toEqual([{ type: 'human_gate' }]);
      for (const [role, at] of [['platform_admin', 'PLATFORM'], ['tenant_admin', 'TENANT'], ['domain_admin', 'DOMAIN']] as const) {
        expect(pdp.evaluate(input(a, at, role, at)).decision, `${a} ${role}`).toBe('deny');
      }
    }
  });
  it('the read: the commercial authority, the tenant administrator and auditor, the domain readers — audited; exact (no neighbour inherits)', () => {
    expect(pdp.evaluate(input('commercial.read', 'PLATFORM', 'commercial_authority', 'PLATFORM')).obligations).toEqual([{ type: 'audit_access' }]);
    expect(pdp.evaluate(input('commercial.read', 'TENANT', 'tenant_admin', 'TENANT')).decision).toBe('allow_with_obligations');
    expect(pdp.evaluate(input('commercial.read', 'TENANT', 'auditor', 'TENANT')).decision).toBe('allow_with_obligations');
    expect(pdp.evaluate(input('commercial.read', 'DOMAIN', 'domain_admin', 'DOMAIN')).decision).toBe('allow_with_obligations');
    expect(pdp.evaluate(input('commercial.read', 'DOMAIN', 'executive', 'DOMAIN')).decision).toBe('allow_with_obligations');
    expect(pdp.evaluate(input('commercial.read', 'TENANT', 'domain_analyst', 'DOMAIN')).decision).toBe('deny');
    expect(pdp.evaluate(input('commercial.read', 'DOMAIN', 'collection_agent', 'DOMAIN')).decision).toBe('deny');
    for (const a of ['commercial.reads', 'commercial.licence.issued', 'commercial.licence', 'commercial.offer']) {
      expect(pdp.evaluate(input(a, 'PLATFORM', 'commercial_authority', 'PLATFORM')).decision, a).toBe('indeterminate');
    }
  });
});
