/**
 * Explicit versioned SQL migration runner (ADR-P0-01: Kysely + node-postgres,
 * no ORM; migrations are plain .sql applied in filename order).
 * Records each applied file with its SHA-256 digest; refuses to run if an
 * already-applied file's digest changed (immutable migration history).
 */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const dir = join(here, '..', 'migrations');

const client = new pg.Client({
  host: process.env.EYE_DB_HOST ?? 'localhost',
  port: Number(process.env.EYE_DB_PORT ?? 5432),
  database: process.env.EYE_DB_NAME ?? 'eye',
  user: process.env.EYE_DB_MIGRATE_USER ?? 'eye',
  password: process.env.EYE_DB_MIGRATE_PASSWORD ?? 'eye_local_dev',
});

const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');

// R7: role-password placeholders are substituted from the environment. The
// runner refuses to run with placeholders unset, and re-applies ALTER ROLE
// after migrations so environment passwords are actually in effect.
const ROLE_SECRETS = {
  __EYE_DB_APP_PASSWORD__: ['eye_app', process.env.EYE_DB_APP_PASSWORD],
  __EYE_DB_ALLOCATOR_PASSWORD__: ['eye_audit_allocator', process.env.EYE_DB_ALLOCATOR_PASSWORD],
  __EYE_DB_SYSTEM_PASSWORD__: ['eye_system', process.env.EYE_DB_SYSTEM_PASSWORD],
  // Gate-2 least-privilege runtime roles (migration 0009).
  __EYE_DB_COMMIT_PASSWORD__: ['eye_commit', process.env.EYE_DB_COMMIT_PASSWORD],
  __EYE_DB_IDENTITY_PASSWORD__: ['eye_identity', process.env.EYE_DB_IDENTITY_PASSWORD],
  __EYE_DB_PUBLISHER_PASSWORD__: ['eye_publisher', process.env.EYE_DB_PUBLISHER_PASSWORD],
  __EYE_DB_VERIFIER_PASSWORD__: ['eye_verifier', process.env.EYE_DB_VERIFIER_PASSWORD],
  // Break-glass recovery: a credential exists, but NO application pool loads it.
  __EYE_DB_RECOVERY_PASSWORD__: ['eye_recovery', process.env.EYE_DB_RECOVERY_PASSWORD],
};
function substitutePlaceholders(sql, filename) {
  for (const [ph, [role, value]] of Object.entries(ROLE_SECRETS)) {
    if (sql.includes(ph)) {
      if (!value) throw new Error(`migration ${filename} needs env password for role ${role} (placeholder ${ph}) — refusing to run with it unset`);
      sql = sql.replaceAll(ph, value.replaceAll("'", "''"));
    }
  }
  return sql;
}

await client.connect();
try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      filename text PRIMARY KEY,
      digest   text NOT NULL,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);

  const applied = new Map(
    (await client.query('SELECT filename, digest FROM public.schema_migrations')).rows.map((r) => [r.filename, r.digest]),
  );

  const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const f of files) {
    const raw = readFileSync(join(dir, f), 'utf8');
    // Digest is over the COMMITTED file (placeholders), never over secrets.
    const digest = sha256(raw);
    const sql = substitutePlaceholders(raw, f);
    if (applied.has(f)) {
      if (applied.get(f) !== digest) {
        throw new Error(`migration ${f} was modified after being applied (digest mismatch) — migrations are immutable; add a new file`);
      }
      continue;
    }
    process.stdout.write(`applying ${f} ... `);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO public.schema_migrations (filename, digest) VALUES ($1, $2)', [f, digest]);
      await client.query('COMMIT');
      console.log('ok');
    } catch (e) {
      await client.query('ROLLBACK');
      throw new Error(`migration ${f} failed: ${e.message}`);
    }
  }
  console.log('migrations up to date');
  // Ensure env-supplied role passwords are actually applied (idempotent).
  for (const [ph, [role, value]] of Object.entries(ROLE_SECRETS)) {
    if (!value) continue;
    const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [role]);
    if (exists.rowCount > 0) {
      await client.query(`ALTER ROLE ${role} PASSWORD '${value.replaceAll("'", "''")}'`);
    }
  }
  console.log('role passwords synchronized from environment');
} finally {
  await client.end();
}
