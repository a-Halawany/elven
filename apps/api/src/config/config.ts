/**
 * Configuration — schema-validated, namespaced under `eye.*` (ADR-P0-15, ES-66).
 * Defaults are safe; no invented defaults when required values are missing —
 * startup fails closed with a named namespace error.
 * `.env` is local-dev only (EXC-P0-005).
 */
import { z } from 'zod';

const schema = z.object({
  'eye.runtime.env': z.enum(['local', 'test']).default('local'),
  'eye.runtime.port': z.coerce.number().int().min(1).max(65535).default(3401),
  'eye.db.host': z.string().default('localhost'),
  'eye.db.port': z.coerce.number().int().default(5432),
  'eye.db.name': z.string().default('eye'),
  // Role credentials — exact privilege boundary (ADR-P0-09):
  'eye.db.app_user': z.string().default('eye_app'),
  'eye.db.app_password': z.string().min(1),
  'eye.db.allocator_user': z.string().default('eye_audit_allocator'),
  'eye.db.allocator_password': z.string().min(1),
  'eye.db.migrate_user': z.string().default('eye'),
  'eye.db.migrate_password': z.string().min(1),
  'eye.identity.jwt_issuer': z.string().default('the-eye.local'),
  'eye.identity.jwt_audience': z.string().default('the-eye-api'),
  'eye.identity.access_ttl_seconds': z.coerce.number().int().min(60).max(3600).default(900),
  'eye.identity.refresh_ttl_seconds': z.coerce.number().int().min(3600).default(28800),
  // HS256 for local-dev (EXC-P0-002); key rotation via kid.
  'eye.identity.jwt_secret': z.string().min(32),
  'eye.identity.jwt_kid': z.string().default('local-1'),
  'eye.policy.bundle_version': z.string().default('bundle-v1'),
  'eye.audit.seal_every_n_events': z.coerce.number().int().min(10).default(1000),
  'eye.telemetry.redact_fields': z.string().default('password,token,secret,authorization,credential'),
});

export type EyeConfig = z.infer<typeof schema>;

const ENV_MAP: Record<string, keyof EyeConfig> = {
  EYE_RUNTIME_ENV: 'eye.runtime.env',
  EYE_RUNTIME_PORT: 'eye.runtime.port',
  EYE_DB_HOST: 'eye.db.host',
  EYE_DB_PORT: 'eye.db.port',
  EYE_DB_NAME: 'eye.db.name',
  EYE_DB_APP_USER: 'eye.db.app_user',
  EYE_DB_APP_PASSWORD: 'eye.db.app_password',
  EYE_DB_ALLOCATOR_USER: 'eye.db.allocator_user',
  EYE_DB_ALLOCATOR_PASSWORD: 'eye.db.allocator_password',
  EYE_DB_MIGRATE_USER: 'eye.db.migrate_user',
  EYE_DB_MIGRATE_PASSWORD: 'eye.db.migrate_password',
  EYE_IDENTITY_JWT_ISSUER: 'eye.identity.jwt_issuer',
  EYE_IDENTITY_JWT_AUDIENCE: 'eye.identity.jwt_audience',
  EYE_IDENTITY_ACCESS_TTL: 'eye.identity.access_ttl_seconds',
  EYE_IDENTITY_REFRESH_TTL: 'eye.identity.refresh_ttl_seconds',
  EYE_IDENTITY_JWT_SECRET: 'eye.identity.jwt_secret',
  EYE_IDENTITY_JWT_KID: 'eye.identity.jwt_kid',
  EYE_POLICY_BUNDLE_VERSION: 'eye.policy.bundle_version',
  EYE_AUDIT_SEAL_EVERY_N: 'eye.audit.seal_every_n_events',
  EYE_TELEMETRY_REDACT: 'eye.telemetry.redact_fields',
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): EyeConfig {
  const raw: Record<string, unknown> = {};
  for (const [envKey, cfgKey] of Object.entries(ENV_MAP)) {
    const v = env[envKey];
    if (v !== undefined && v !== '') raw[cfgKey] = v;
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const missing = parsed.error.issues.map((i) => i.path.join('.')).join(', ');
    // Fail closed: never invent defaults for required config (ES-66 failure semantics).
    throw new Error(`configuration invalid or missing for namespaces: ${missing}`);
  }
  return parsed.data;
}
