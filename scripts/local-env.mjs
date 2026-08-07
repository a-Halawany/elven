/**
 * Local secret material loader (remediation R7).
 *
 * Single supported handoff channel for generated secrets: the 0600, gitignored
 * .eye-local/env file at the repo root. Caller-supplied environment values
 * ALWAYS win; any key missing from both the environment and the file is
 * generated here (cryptographically random, per-environment, never committed,
 * never a fixed literal) and persisted so subsequent processes (API, tests,
 * demo, Playwright) share the same material.
 *
 * Used by: scripts/demo.sh (bash equivalent), vitest setup files,
 * playwright.config.ts, and the verification harness.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync, statSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

const GENERATED_KEYS = [
  'EYE_DB_PASSWORD',
  'EYE_DB_APP_PASSWORD',
  'EYE_DB_ALLOCATOR_PASSWORD',
  'EYE_DB_SYSTEM_PASSWORD',
  // Gate-2 least-privilege runtime roles (migration 0009):
  'EYE_DB_COMMIT_PASSWORD',
  'EYE_DB_IDENTITY_PASSWORD',
  'EYE_DB_PUBLISHER_PASSWORD',
  'EYE_DB_VERIFIER_PASSWORD',
  // Break-glass recovery credential — generated, but never loaded by the app:
  'EYE_DB_RECOVERY_PASSWORD',
  'EYE_REDIS_PASSWORD',
  'EYE_IDENTITY_JWT_SECRET',
  // Ephemeral per-environment test credentials (never fixed literals):
  'EYE_TEST_BOOTSTRAP_PASSWORD',
  'EYE_TEST_ADMIN_PASSWORD',
];

const gen = () => randomBytes(24).toString('base64url');

export function loadLocalEnv(root = ROOT) {
  const dir = join(root, '.eye-local');
  const file = join(dir, 'env');
  const stored = {};
  // Gate-2 §8: an EXISTING handoff file is checked and REPAIRED to 0600 (and its
  // directory to 0700) before it is read — a permissive mode from an earlier run
  // or a careless copy is corrected, not tolerated.
  if (existsSync(dir)) {
    try {
      if ((statSync(dir).mode & 0o777) !== 0o700) chmodSync(dir, 0o700);
    } catch { /* best effort; the file check below is the load-bearing one */ }
  }
  if (existsSync(file)) {
    if ((statSync(file).mode & 0o777) !== 0o600) {
      chmodSync(file, 0o600);
      console.warn(`[eye] repaired permissions on ${file} to 0600`);
    }
  }
  if (existsSync(file)) {
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
      if (m) stored[m[1]] = m[2];
    }
  }
  // Precedence: caller environment > existing handoff file > freshly generated.
  //
  // Gate-2.1 §9: whatever wins is RECORDED. Persisting only the generated keys left
  // an INCOMPLETE handoff whenever a caller's environment supplied some values —
  // and a later process that merely sources the file (demo.sh, the browser gate,
  // the migration runner) then failed on a key that was never written down. The
  // file must always describe the material actually in use.
  let dirty = false;
  const resolve = (key, fallback) => {
    const value = process.env[key] ?? stored[key] ?? fallback();
    if (stored[key] !== value) {
      stored[key] = value;
      dirty = true;
    }
    process.env[key] = value;
    return value;
  };
  for (const key of GENERATED_KEYS) resolve(key, gen);

  // EYE_DB_MIGRATE_PASSWORD is DERIVED, not independent: the migrate role IS the
  // compose superuser. A derived value must never be preserved once its source
  // changes — keeping a stored copy let it silently diverge from EYE_DB_PASSWORD
  // after a virgin run regenerated the superuser credential, and the only symptom
  // was `password authentication failed for user "eye"` from the migration runner.
  // Precedence is therefore: explicit caller value, otherwise ALWAYS the current
  // superuser password. An inconsistent handoff file repairs itself here.
  const migrate = process.env['EYE_DB_MIGRATE_PASSWORD'] ?? process.env['EYE_DB_PASSWORD'];
  if (stored['EYE_DB_MIGRATE_PASSWORD'] !== migrate) {
    stored['EYE_DB_MIGRATE_PASSWORD'] = migrate;
    dirty = true;
  }
  process.env['EYE_DB_MIGRATE_PASSWORD'] = migrate;

  if (dirty) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    const body = Object.entries(stored).map(([k, v]) => `${k}=${v}`).join('\n') + '\n';
    writeFileSync(file, body, { mode: 0o600 });
    chmodSync(file, 0o600);
  }
  return { ...process.env };
}
