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
import { Logger } from '@nestjs/common';
import { Kysely, PostgresDialect, type Transaction } from 'kysely';
import pg from 'pg';
import type { EyeConfig } from '../config/config.js';

// Phase 0 uses an intentionally loose DB type; typed tables arrive per module.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Db = Kysely<any>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tx = Transaction<any>;

const dbLog = new Logger('db');
function pool(cfg: EyeConfig, user: string, password: string, max: number): Db {
  const p = new pg.Pool({
    host: cfg['eye.db.host'],
    port: cfg['eye.db.port'],
    database: cfg['eye.db.name'],
    user,
    password,
    max,
  });
  // A connection that ends unexpectedly — a backend terminated by an administrator, a lost link, a server restart — is an 'error' EVENT:
  // on an idle client the pool emits it, on a CHECKED-OUT client the client itself does (pg-pool removes its idle listener on acquire),
  // and an 'error' event with no listener ends the process. Both are logged here; nothing else is done — the query in flight or the next
  // one on that client fails on its own, and the transaction using it was rolled back by the server with the connection (the retention
  // executor's rule for a lock that ended with its backend: 0071).
  p.on('error', (e) => dbLog.warn(`an idle ${user} connection ended unexpectedly: ${String((e as { message?: unknown })?.message ?? e).slice(0, 200)}`));
  p.on('connect', (client) => client.on('error', (e) => dbLog.warn(`a ${user} connection in use ended unexpectedly: ${String((e as { message?: unknown })?.message ?? e).slice(0, 200)}; the transaction on it is rolled back by the server`)));
  return new Kysely({ dialect: new PostgresDialect({ pool: p }) });
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
