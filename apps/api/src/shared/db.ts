/**
 * Database access — Kysely over node-postgres (ADR-P0-01).
 *
 * Gate-2 privilege separation (migration 0009): one pool per AUTHORITY, each
 * with its own database credential, so a compromise of the ordinary request
 * path cannot reach any authoritative capability.
 *
 *   appDb        — eye_app        : RLS-governed SELECT only. No authoritative
 *                                   writes, no identity mutation, no evidence
 *                                   writes, no publish ack, no verifier/recovery.
 *   commitDb     — eye_commit     : the authoritative commit boundary (governed
 *                                   business writes + bound POL/AUD ports +
 *                                   canonical admission + outbox enqueue).
 *   identityDb   — eye_identity   : identity/credential/session mutation only.
 *   publisherDb  — eye_publisher  : outbox publication acknowledgement only.
 *   verifierDb   — eye_verifier   : audit verification/sealing + tamper evidence.
 *   allocatorDb  — eye_audit_allocator : chain-head allocation (definer-owned).
 *
 * BREAK-GLASS RECOVERY (eye_recovery) HAS NO POOL HERE BY DESIGN: chain-head
 * rebuild is not reachable from normal runtime code. Its credential exists only
 * for an operator/migration path.
 */
import { Kysely, PostgresDialect, type Transaction } from 'kysely';
import pg from 'pg';
import type { EyeConfig } from '../config/config.js';

// Phase 0 uses an intentionally loose DB type; typed tables arrive per module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = Kysely<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = Transaction<any>;

function pool(cfg: EyeConfig, user: string, password: string, max: number): Db {
  return new Kysely({
    dialect: new PostgresDialect({
      pool: new pg.Pool({
        host: cfg['eye.db.host'],
        port: cfg['eye.db.port'],
        database: cfg['eye.db.name'],
        user,
        password,
        max,
      }),
    }),
  });
}

export function createAppDb(cfg: EyeConfig): Db {
  return pool(cfg, cfg['eye.db.app_user'], cfg['eye.db.app_password'], 10);
}
export function createCommitDb(cfg: EyeConfig): Db {
  return pool(cfg, cfg['eye.db.commit_user'], cfg['eye.db.commit_password'], 8);
}
export function createIdentityDb(cfg: EyeConfig): Db {
  return pool(cfg, cfg['eye.db.identity_user'], cfg['eye.db.identity_password'], 6);
}
export function createPublisherDb(cfg: EyeConfig): Db {
  return pool(cfg, cfg['eye.db.publisher_user'], cfg['eye.db.publisher_password'], 3);
}
export function createVerifierDb(cfg: EyeConfig): Db {
  return pool(cfg, cfg['eye.db.verifier_user'], cfg['eye.db.verifier_password'], 3);
}
export function createMigrateDb(cfg: EyeConfig): Db {
  return pool(cfg, cfg['eye.db.migrate_user'], cfg['eye.db.migrate_password'], 2);
}
