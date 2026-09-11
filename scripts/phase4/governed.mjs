/**
 * Governed HTTP helpers shared by the Phase 4 scripts — the same envelope
 * discipline the Phase 1–3 seeds use. Every call is a canonical envelope with a
 * payload digest; every operator authenticates through the real login route.
 *
 * NOTHING HERE PRINTS A CREDENTIAL. Passwords are read from the local secret
 * handoff, used for a login, and never logged, copied or written anywhere.
 */
import { createHash, randomUUID } from 'node:crypto';

export const API = process.env.EYE_API ?? 'http://localhost:3401';

const jcs = (v) => {
  if (Array.isArray(v)) return `[${v.map(jcs).join(',')}]`;
  if (v !== null && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${jcs(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
};
export const digest = (payload) => createHash('sha256').update(jcs(payload), 'utf8').digest('hex');

let failures = 0;
export const ok = (m) => console.log(`  ✓ ${m}`);
export const bad = (m) => { failures += 1; console.log(`  ✗ ${m}`); };
export const note = (m) => console.log(`  · ${m}`);
export const failureCount = () => failures;

export async function call(path, over, payload = {}, token = null) {
  const envelope = {
    message_id: randomUUID(),
    scope: over.scope,
    tenant_id: over.tenantId ?? null,
    domain_id: over.domainId ?? null,
    principal_id: over.principalId ?? 'anonymous',
    purpose_id: over.purposeId ?? 'observation',
    action: over.action,
    side_effect_class: over.sideEffect ?? 'reversible',
    consequence_class: over.consequence ?? 'C1',
    object_type: over.objectType,
    object_id: over.objectId ?? null,
    schema_version: 'v1',
    issued_at: new Date().toISOString(),
    clock_quality: 'trusted',
    correlation_id: randomUUID(),
    trace_id: over.trace ?? 'phase4',
    payload_digest: digest(payload),
  };
  const headers = { 'content-type': 'application/json' };
  if (token !== null) headers.authorization = `Bearer ${token}`;
  const res = await fetch(API + path, { method: 'POST', headers, body: JSON.stringify({ envelope, payload }) });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body, correlationId: envelope.correlation_id };
}

export async function login(username, password) {
  const r = await call('/v1/auth/login', {
    scope: 'PLATFORM', action: 'identity.session.create', objectType: 'SES',
    principalId: 'anonymous', purposeId: 'authentication',
  }, { username, password });
  if (!r.ok) return null;
  return { token: r.body.tokens.accessToken, principalId: r.body.principalId, rotationRequired: r.body.rotationRequired };
}

/** The platform administrator, through the rotated credential (the seed rotated it). */
export async function adminSession(env) {
  const s = await login(env.EYE_BOOTSTRAP_ADMIN ?? 'platform-admin', env.EYE_TEST_ADMIN_PASSWORD);
  if (s === null || s.rotationRequired) throw new Error('the platform administrator could not authenticate; run the Phase 1 seed first');
  return s;
}

/** Locate the demonstration tenant and domain the Phase 1 seed created. */
export async function demoScope(admin) {
  const TENANT_NAME = 'NORDWERK ANTRIEBSTECHNIK GmbH (SYNTHETIC)';
  const DOMAIN_NAME = 'Supply Corridor Intelligence';
  const tenants = await call('/v1/platform/tenants/list', {
    scope: 'PLATFORM', action: 'tenancy.tenant.list', objectType: 'TEN',
    principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
  }, {}, admin.token);
  const tenant = (tenants.body.tenants ?? []).find((t) => t.name === TENANT_NAME);
  if (tenant === undefined) throw new Error('the demonstration tenant is not present; run the Phase 1 seed first');
  const domains = await call(`/v1/tenants/${tenant.id}/domains/list`, {
    scope: 'TENANT', tenantId: tenant.id, action: 'tenancy.domain.list', objectType: 'CID',
    principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration',
  }, {}, admin.token);
  const domain = (domains.body.domains ?? []).find((d) => d.name === DOMAIN_NAME);
  if (domain === undefined) throw new Error('the demonstration domain is not present; run the Phase 1 seed first');
  return { tenantId: tenant.id, domainId: domain.id };
}

/** An envelope builder for a domain operator. */
export function as(session, scope, over) {
  return {
    scope: 'DOMAIN', tenantId: scope.tenantId, domainId: scope.domainId,
    principalId: `principal:${session.principalId}`, ...over,
  };
}
