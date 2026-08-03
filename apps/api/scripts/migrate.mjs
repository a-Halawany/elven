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
    const sql = readFileSync(join(dir, f), 'utf8');
    const digest = sha256(sql);
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
} finally {
  await client.end();
}
