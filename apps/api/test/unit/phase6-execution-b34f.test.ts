/**
 * CP-6 B34-F2 (0091 section `execution`) — the pure parts of THE SYNTHETIC LOOPBACK PATH: the deployment switch (default off, `on` / `off`
 * only, anything else fails the startup closed), the loopback LITERAL (a name never is), the path a target's attempt takes and its basis, and
 * the egress's own re-check (refused before any connection when a precondition does not hold).
 */
import { describe, expect, it } from 'vitest';
import { loadConfig, type EyeConfig } from '../../src/config/config.js';
import { ExecutionEgress, executionPathOf, isLoopbackLiteral } from '../../src/decision/commitments/commitment.service.js';
import { EgressRefused, type DeliveryRequest } from '../../src/observation/connectors/http-client.js';

const base = { EYE_DB_APP_PASSWORD: 'x', EYE_DB_ALLOCATOR_PASSWORD: 'x', EYE_DB_COMMIT_PASSWORD: 'x', EYE_DB_IDENTITY_PASSWORD: 'x', EYE_DB_PUBLISHER_PASSWORD: 'x', EYE_DB_VERIFIER_PASSWORD: 'x',
  EYE_DB_MIGRATE_PASSWORD: 'x', EYE_REDIS_PASSWORD: 'x', EYE_IDENTITY_JWT_SECRET: 'b34f-' + 'x'.repeat(40) };
const PEM = '-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----\n';
const target = (endpoint: string, over: Record<string, unknown> = {}) => ({ endpoint, synthetic: true, trust_anchor_pem: PEM, credential_ref: null, ...over });

describe('B34-F2 · the deployment switch', () => {
  it('default OFF; `on` and `off` only — anything else fails the startup closed', () => {
    expect(loadConfig(base)['eye.execution.synthetic_loopback']).toBe('off');
    expect(loadConfig({ ...base, EYE_EXECUTION_SYNTHETIC_LOOPBACK: 'on' })['eye.execution.synthetic_loopback']).toBe('on');
    expect(loadConfig({ ...base, EYE_EXECUTION_SYNTHETIC_LOOPBACK: 'off' })['eye.execution.synthetic_loopback']).toBe('off');
    for (const v of ['true', '1', 'ON', 'yes']) expect(() => loadConfig({ ...base, EYE_EXECUTION_SYNTHETIC_LOOPBACK: v }), v).toThrow(/eye\.execution\.synthetic_loopback/);
  });
});

describe('B34-F2 · the path a target\'s attempt takes', () => {
  it('a loopback LITERAL is 127.0.0.0/8 written out; a name (localhost included), ::1 and every other address are not', () => {
    for (const h of ['127.0.0.1', '127.8.9.10', '127.255.255.255']) expect(isLoopbackLiteral(h), h).toBe(true);
    for (const h of ['localhost', '[::1]', '::1', '127.0.0.256', '127.0.0', '10.0.0.1', '0.0.0.0', 'erp.b34.invalid', '127.0.0.1.nip.io', '']) expect(isLoopbackLiteral(h), h).toBe(false);
  });
  it('synthetic-loopback only with the switch on, a synthetic target, an https loopback literal and a declared anchor', () => {
    expect(executionPathOf(target('https://127.0.0.1:3499/purchase-requests'), true)).toEqual({ transport: 'synthetic-loopback', switch: 'on', pinned: '127.0.0.1',
      basis: 'a synthetic target on a loopback literal, the switch on, the declared anchor verified' });
    const p = (t: Record<string, unknown>, on: boolean) => { const r = executionPathOf(t, on); return `${r.transport}|${r.switch}|${String(r.pinned)}|${r.basis}`; };
    expect(p(target('https://127.0.0.1:3499/'), false)).toBe('production|off|null|the synthetic loopback switch is off');
    expect(p(target('https://127.0.0.1:3499/', { synthetic: false }), true)).toBe('production|on|null|the target is not recorded synthetic');
    expect(p(target('https://127.0.0.1:3499/', { synthetic: 'true' }), true)).toBe('production|on|null|the target is not recorded synthetic');
    expect(p(target('not a url'), true)).toBe('production|on|null|the endpoint is not a URL');
    expect(p(target('http://127.0.0.1:3499/'), true)).toBe('production|on|null|the endpoint is not an https URL without userinfo');
    expect(p(target('https://u:p@127.0.0.1:3499/'), true)).toBe('production|on|null|the endpoint is not an https URL without userinfo');
    for (const e of ['https://localhost:3499/', 'https://[::1]:3499/', 'https://10.20.30.40:3499/', 'https://erp.b34.invalid:3499/', 'https://127.0.0.1.nip.io/']) {
      expect(p(target(e), true), e).toBe('production|on|null|the endpoint host is not an IPv4 loopback literal');
    }
    expect(p(target('https://127.0.0.1:3499/', { trust_anchor_pem: null }), true)).toBe('production|on|null|the target declares no trust anchor');
    expect(p(target('https://127.0.0.1:3499/', { trust_anchor_pem: '  ' }), true)).toBe('production|on|null|the target declares no trust anchor');
  });
  it('the egress re-checks its preconditions and refuses before any connection', async () => {
    const egress = (sw: 'on' | 'off') => new ExecutionEgress({ 'eye.execution.synthetic_loopback': sw } as unknown as EyeConfig);
    const req = (url: string, anchor: string | null = PEM): DeliveryRequest => ({ url, body: Buffer.from('{}'), contentType: 'application/json',
      policy: { hostAllowlist: [new URL(url).hostname], schemeAllowlist: ['https'], maxRedirects: 0, timeoutMs: 1000, maxResponseBytes: 1024, maxDecompressedBytes: 1024, ...(anchor === null ? {} : { trustAnchorPem: anchor }) } });
    expect(egress('on').syntheticLoopback()).toBe(true);
    expect(egress('off').syntheticLoopback()).toBe(false);
    const refusedWith = async (p: Promise<unknown>) => { const e = await p.then(() => null, (x: unknown) => x); expect(e).toBeInstanceOf(EgressRefused); return (e as EgressRefused).refusalClass; };
    expect(await refusedWith(egress('off').deliverSyntheticLoopback(req('https://127.0.0.1:1/'), '127.0.0.1'))).toBe('address_not_public');
    expect(await refusedWith(egress('on').deliverSyntheticLoopback(req('https://localhost:1/'), '127.0.0.1'))).toBe('address_not_public');
    expect(await refusedWith(egress('on').deliverSyntheticLoopback(req('https://127.0.0.1:1/'), '127.0.0.2'))).toBe('address_not_public');
    expect(await refusedWith(egress('on').deliverSyntheticLoopback(req('https://127.0.0.1:1/', null), '127.0.0.1'))).toBe('address_not_public');
  });
});
