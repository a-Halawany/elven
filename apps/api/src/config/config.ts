/**
 * Configuration — schema-validated, namespaced under `eye.*` (ADR-P0-15, ES-66).
 * Defaults are safe; no invented defaults when required values are missing —
 * startup fails closed with a named namespace error.
 * `.env` is local-dev only (EXC-P0-005).
 */
import { existsSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve } from 'node:path';
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
  // Gate-2 least-privilege runtime roles (migration 0009). Each authority is a
  // separate credential; the BREAK-GLASS RECOVERY role is deliberately absent
  // from this schema so no application pool can ever load it.
  'eye.db.commit_user': z.string().default('eye_commit'),
  'eye.db.commit_password': z.string().min(1),
  'eye.db.identity_user': z.string().default('eye_identity'),
  'eye.db.identity_password': z.string().min(1),
  'eye.db.publisher_user': z.string().default('eye_publisher'),
  'eye.db.publisher_password': z.string().min(1),
  'eye.db.verifier_user': z.string().default('eye_verifier'),
  'eye.db.verifier_password': z.string().min(1),
  'eye.db.migrate_user': z.string().default('eye'),
  'eye.db.migrate_password': z.string().min(1),
  'eye.redis.host': z.string().default('localhost'),
  'eye.redis.port': z.coerce.number().int().default(6379),
  'eye.redis.password': z.string().min(1),
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
  // ── Phase 1: evidence vault (PHASE1_PLAN §9, EXC-P1-002 local profile) ──
  // TWO SEPARATE ROOTS. The service refuses to start if they are equal or nested.
  'eye.vault.quarantine_root': z.string().default('.eye-local/vault/quarantine'),
  'eye.vault.evidence_root': z.string().default('.eye-local/vault/evidence'),
  'eye.vault.max_blob_bytes': z.coerce.number().int().min(1024).default(64 * 1024 * 1024),
  // ── Phase 1: connector hardening (§8.1) ──
  'eye.connector.max_redirects': z.coerce.number().int().min(0).max(3).default(3),
  'eye.connector.request_timeout_ms': z.coerce.number().int().min(100).max(120000).default(20000),
  'eye.connector.max_response_bytes': z.coerce.number().int().min(1024).default(32 * 1024 * 1024),
  'eye.connector.max_decompressed_bytes': z.coerce.number().int().min(1024).default(64 * 1024 * 1024),
  'eye.connector.global_concurrency': z.coerce.number().int().min(1).default(4),
  'eye.connector.per_source_concurrency': z.coerce.number().int().min(1).default(2),
  // Replay responder root — the frozen fixture set the deterministic demonstration
  // serves through the SHIPPING connector code (REPLAY_DATA_MANIFEST §4).
  'eye.connector.replay_root': z.string().default('fixtures/phase1/replay'),
  // ── Phase 1: scheduling (§12; the 60-second floor is also a DB constraint) ──
  'eye.scheduler.min_interval_seconds': z.coerce.number().int().min(60).default(60),
  'eye.scheduler.enabled': z
    .union([z.boolean(), z.string()])
    .transform((v) => v === true || v === 'true' || v === '1')
    .default(false),
  // ── Phase 1: quarantine case time-to-live before the sweeper expires it ──
  'eye.quarantine.ttl_seconds': z.coerce.number().int().min(60).default(7 * 24 * 3600),
  'eye.sweeper.run_timeout_seconds': z.coerce.number().int().min(60).default(3600),
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
  EYE_DB_COMMIT_USER: 'eye.db.commit_user',
  EYE_DB_COMMIT_PASSWORD: 'eye.db.commit_password',
  EYE_DB_IDENTITY_USER: 'eye.db.identity_user',
  EYE_DB_IDENTITY_PASSWORD: 'eye.db.identity_password',
  EYE_DB_PUBLISHER_USER: 'eye.db.publisher_user',
  EYE_DB_PUBLISHER_PASSWORD: 'eye.db.publisher_password',
  EYE_DB_VERIFIER_USER: 'eye.db.verifier_user',
  EYE_DB_VERIFIER_PASSWORD: 'eye.db.verifier_password',
  EYE_REDIS_HOST: 'eye.redis.host',
  EYE_REDIS_PORT: 'eye.redis.port',
  EYE_REDIS_PASSWORD: 'eye.redis.password',
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
  EYE_VAULT_QUARANTINE_ROOT: 'eye.vault.quarantine_root',
  EYE_VAULT_EVIDENCE_ROOT: 'eye.vault.evidence_root',
  EYE_VAULT_MAX_BLOB_BYTES: 'eye.vault.max_blob_bytes',
  EYE_CONNECTOR_MAX_REDIRECTS: 'eye.connector.max_redirects',
  EYE_CONNECTOR_TIMEOUT_MS: 'eye.connector.request_timeout_ms',
  EYE_CONNECTOR_MAX_RESPONSE_BYTES: 'eye.connector.max_response_bytes',
  EYE_CONNECTOR_MAX_DECOMPRESSED_BYTES: 'eye.connector.max_decompressed_bytes',
  EYE_CONNECTOR_GLOBAL_CONCURRENCY: 'eye.connector.global_concurrency',
  EYE_CONNECTOR_PER_SOURCE_CONCURRENCY: 'eye.connector.per_source_concurrency',
  EYE_CONNECTOR_REPLAY_ROOT: 'eye.connector.replay_root',
  EYE_SCHEDULER_MIN_INTERVAL: 'eye.scheduler.min_interval_seconds',
  EYE_SCHEDULER_ENABLED: 'eye.scheduler.enabled',
  EYE_QUARANTINE_TTL_SECONDS: 'eye.quarantine.ttl_seconds',
  EYE_SWEEPER_RUN_TIMEOUT_SECONDS: 'eye.sweeper.run_timeout_seconds',
};

/**
 * Filesystem roots are resolved to ABSOLUTE PATHS against the workspace root, not
 * against the process working directory.
 *
 * A relative root silently means a different directory depending on where the
 * process was started — the API from the repo root, a test runner from the
 * package directory, an operator from anywhere. For a vault, that is a path that
 * could quietly split evidence across two locations, and for the replay set it is
 * a fixture that is present or absent depending on how you launched.
 *
 * The workspace root is located by walking up from this module until the
 * pnpm workspace manifest is found; if it is not found (a packaged deployment),
 * the path is resolved against the process directory and stays as explicit as it
 * was configured.
 */
function workspaceRoot(): string {
  // This package emits CommonJS, so __dirname is the module's own directory.
  let dir = __dirname;
  for (let i = 0; i < 8; i += 1) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

const PATH_KEYS: Array<keyof EyeConfig> = [
  'eye.vault.quarantine_root',
  'eye.vault.evidence_root',
  'eye.connector.replay_root',
];

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
  const cfg = parsed.data;
  const root = workspaceRoot();
  for (const key of PATH_KEYS) {
    const value = cfg[key] as string;
    if (!isAbsolute(value)) (cfg as Record<string, unknown>)[key] = resolve(root, value);
  }
  return cfg;
}
