/**
 * Database access — Kysely over node-postgres (ADR-P0-01).
 * Two pools with an exact privilege boundary (ADR-P0-09):
 *   appDb       — role eye_app (INSERT/SELECT on evidence; DML only where declared mutable)
 *   allocatorDb — role eye_audit_allocator (UPDATE only on audit.audit_chain_heads)
 * The commit pipeline acquires transactions from appDb; the chain-head advance
 * runs through a SECURITY DEFINER function owned by the allocator role so the
 * app transaction can advance the head without holding UPDATE privileges.
 */
import { Kysely, PostgresDialect, type Transaction } from 'kysely';
import pg from 'pg';
import type { EyeConfig } from '../config/config.js';

// Phase 0 uses an intentionally loose DB type; typed tables arrive per module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = Kysely<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = Transaction<any>;

export function createAppDb(cfg: EyeConfig): Db {
  const pool = new pg.Pool({
    host: cfg['eye.db.host'],
    port: cfg['eye.db.port'],
    database: cfg['eye.db.name'],
    user: cfg['eye.db.app_user'],
    password: cfg['eye.db.app_password'],
    max: 10,
  });
  return new Kysely({ dialect: new PostgresDialect({ pool }) });
}

/**
 * System pool — role eye_system: the only role granted eye_set_system_context.
 * Used by bounded system paths only: authentication flows (atomic session +
 * audit), bootstrap, outbox publisher, audit verifier/sealer, security intake.
 */
export function createSystemDb(cfg: EyeConfig): Db {
  const pool = new pg.Pool({
    host: cfg['eye.db.host'],
    port: cfg['eye.db.port'],
    database: cfg['eye.db.name'],
    user: cfg['eye.db.system_user'],
    password: cfg['eye.db.system_password'],
    max: 6,
  });
  return new Kysely({ dialect: new PostgresDialect({ pool }) });
}

export function createMigrateDb(cfg: EyeConfig): Db {
  const pool = new pg.Pool({
    host: cfg['eye.db.host'],
    port: cfg['eye.db.port'],
    database: cfg['eye.db.name'],
    user: cfg['eye.db.migrate_user'],
    password: cfg['eye.db.migrate_password'],
    max: 2,
  });
  return new Kysely({ dialect: new PostgresDialect({ pool }) });
}
