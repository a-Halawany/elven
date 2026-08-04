/**
 * WS-19 API client. Builds canonical envelopes (JCS digest via Web Crypto),
 * renders only from authoritative receipts (no optimistic UI — UX-ADR-017).
 * The access token lives in sessionStorage for the local-dev profile.
 */
import { contentDigest } from './jcs';

export const API_BASE = process.env.NEXT_PUBLIC_EYE_API ?? 'http://localhost:3401';

export interface Session {
  principalId: string;
  accessToken: string;
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  const raw = sessionStorage.getItem('eye.session');
  return raw !== null ? (JSON.parse(raw) as Session) : null;
}

export function setSession(s: Session | null): void {
  if (s === null) sessionStorage.removeItem('eye.session');
  else sessionStorage.setItem('eye.session', JSON.stringify(s));
}

export interface EnvelopeOverrides {
  scope: 'PLATFORM' | 'TENANT' | 'DOMAIN';
  tenant_id?: string | null;
  domain_id?: string | null;
  action: string;
  object_type: string;
  object_id?: string | null;
  side_effect_class?: 'none' | 'reversible' | 'compensatable';
  consequence_class?: 'C0' | 'C1' | 'C2';
  purpose_id?: string;
  principal_id?: string;
}

export async function buildEnvelope(over: EnvelopeOverrides, payload: unknown): Promise<Record<string, unknown>> {
  const session = getSession();
  return {
    message_id: crypto.randomUUID(),
    scope: over.scope,
    tenant_id: over.tenant_id ?? null,
    domain_id: over.domain_id ?? null,
    principal_id: over.principal_id ?? (session !== null ? `principal:${session.principalId}` : 'anonymous'),
    purpose_id: over.purpose_id ?? 'platform.administration',
    action: over.action,
    side_effect_class: over.side_effect_class ?? 'reversible',
    consequence_class: over.consequence_class ?? 'C1',
    object_type: over.object_type,
    object_id: over.object_id ?? null,
    schema_version: 'v1',
    issued_at: new Date().toISOString(),
    clock_quality: 'trusted',
    correlation_id: crypto.randomUUID(),
    trace_id: 'ws19',
    payload_digest: await contentDigest(payload ?? {}),
  };
}

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  data?: T;
  error?: { code: string; message: string; correlationId: string; retry: string };
}

export async function call<T>(path: string, over: EnvelopeOverrides, payload: unknown = {}): Promise<ApiResult<T>> {
  const session = getSession();
  const envelope = await buildEnvelope(over, payload);
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (session !== null) headers['authorization'] = `Bearer ${session.accessToken}`;
  try {
    const r = await fetch(API_BASE + path, {
      method: 'POST',
      headers,
      body: JSON.stringify({ envelope, payload }),
    });
    const body = (await r.json()) as Record<string, unknown>;
    if (!r.ok) {
      return {
        ok: false,
        status: r.status,
        error: {
          code: String(body.code ?? 'EYE-INT-001'),
          message: String(body.message ?? 'request failed'),
          correlationId: String(body.correlationId ?? envelope.correlation_id),
          retry: String(body.retry ?? 'no'),
        },
      };
    }
    return { ok: true, status: r.status, data: body as T };
  } catch {
    return {
      ok: false,
      status: 0,
      error: { code: 'EYE-DEP-001', message: 'API unreachable', correlationId: String(envelope.correlation_id), retry: 'yes' },
    };
  }
}

export async function login(username: string, password: string): Promise<ApiResult<{ principalId: string; tokens: { accessToken: string } }>> {
  const payload = { username, password };
  const r = await call<{ principalId: string; tokens: { accessToken: string } }>('/v1/auth/login', {
    scope: 'PLATFORM',
    action: 'identity.session.create',
    object_type: 'SES',
    principal_id: 'anonymous',
    purpose_id: 'authentication',
  }, payload);
  if (r.ok && r.data !== undefined) {
    setSession({ principalId: r.data.principalId, accessToken: r.data.tokens.accessToken });
  }
  return r;
}

export async function health(): Promise<{ status: string; db?: boolean }> {
  try {
    const r = await fetch(API_BASE + '/readyz');
    return (await r.json()) as { status: string; db?: boolean };
  } catch {
    return { status: 'unreachable' };
  }
}
