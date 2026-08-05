/**
 * R10 mandated test 9 — refresh-token rotation, replay detection and
 * concurrent refresh, exercised through the REAL IdentityService methods and
 * the REAL identity.refresh_rotate definer function (no reimplementation).
 * The audited HTTP flow (rotation/rejection/reuse events + audit-failure
 * rollback) is covered in the acceptance suite against the running API.
 */
import 'reflect-metadata';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { loadConfig } from '../../src/config/config.js';
import { IdentityService } from '../../src/identity/identity.service.js';
import {
  appDb, systemDb, superDb, createPrincipalWithSession, sha256, type AnyDb,
} from './helpers.js';

let app: AnyDb;
let system: AnyDb;
let su: AnyDb;
let identity: IdentityService;

beforeAll(() => {
  app = appDb();
  system = systemDb();
  su = superDb();
  identity = new IdentityService(loadConfig(), app as never);
});

afterAll(async () => {
  await app.destroy();
  await system.destroy();
  await su.destroy();
});

async function freshSession() {
  return createPrincipalWithSession(system, { scope: 'PLATFORM', roleCode: 'platform_admin', label: 'refresh' });
}

async function rotate(token: string) {
  return system.transaction().execute(async (tx) => {
    await sql`select public.eye_set_system_context('refresh test')`.execute(tx);
    return identity.rotateRefreshToken(tx as never, token);
  });
}

describe('rotation', () => {
  it('issues a NEW refresh token and atomically invalidates the old one', async () => {
    const p = await freshSession();
    const r1 = await rotate(p.refreshToken);
    expect(r1.outcome).toBe('rotated');
    if (r1.outcome !== 'rotated') return;
    expect(r1.newRefreshToken).not.toBe(p.refreshToken);
    // The stored hash moved to the new token; the old hash is retained only
    // as prev_refresh_token_hash (for reuse detection).
    const row = await su
      .selectFrom('identity.sessions').selectAll()
      .where('id', '=', p.sessionId).executeTakeFirstOrThrow();
    expect(row.refresh_token_hash).toBe(sha256(r1.newRefreshToken));
    expect(row.prev_refresh_token_hash).toBe(sha256(p.refreshToken));
    expect(row.status).toBe('active');
  });

  it('a completely unknown token is invalid (no session leak)', async () => {
    const r = await rotate('never-issued-token');
    expect(r.outcome).toBe('invalid');
  });
});

describe('replay detection', () => {
  it('reusing the invalidated previous token revokes the session', async () => {
    const p = await freshSession();
    const r1 = await rotate(p.refreshToken);
    expect(r1.outcome).toBe('rotated');
    // REPLAY the old token:
    const r2 = await rotate(p.refreshToken);
    expect(r2.outcome).toBe('reuse');
    if (r2.outcome !== 'reuse') return;
    expect(r2.sessionId).toBe(p.sessionId);
    const row = await su
      .selectFrom('identity.sessions').selectAll()
      .where('id', '=', p.sessionId).executeTakeFirstOrThrow();
    expect(row.status).toBe('revoked');
    // After revocation even the NEWEST token is dead (whole session revoked).
    if (r1.outcome === 'rotated') {
      const r3 = await rotate(r1.newRefreshToken);
      expect(r3.outcome).toBe('invalid');
    }
  });
});

describe('concurrent refresh', () => {
  it('N concurrent refreshes with one token: exactly one rotation wins; the rest are reuse/invalid; session ends revoked', async () => {
    const p = await freshSession();
    const results = await Promise.all(Array.from({ length: 6 }, () => rotate(p.refreshToken)));
    const rotated = results.filter((r) => r.outcome === 'rotated');
    const reuse = results.filter((r) => r.outcome === 'reuse');
    const invalid = results.filter((r) => r.outcome === 'invalid');
    expect(rotated).toHaveLength(1);
    expect(reuse.length + invalid.length).toBe(5);
    expect(reuse.length).toBeGreaterThanOrEqual(1); // the losers are a theft signal
    const row = await su
      .selectFrom('identity.sessions').selectAll()
      .where('id', '=', p.sessionId).executeTakeFirstOrThrow();
    expect(row.status).toBe('revoked'); // concurrent replay revokes the session
  });
});
