/**
 * Audited bootstrap seed (ADR-P0-04/17; Gate-2 §8) — creates the first platform
 * administrator.
 *
 * Modeled on break-glass rules (Vol 3 Ch.22): single-use, conspicuous, audited,
 * independently reviewable, never erasing the audit path.
 *
 * Gate-2 hardening:
 *  * SINGLE-USE IS DATABASE-ENFORCED: identity.claim_bootstrap() inserts the
 *    single-row claim; two concurrent attempts serialize on that primary key and
 *    exactly one can win. The loser gets exit 2 without side effects.
 *  * LOCAL/TEST ELIGIBILITY IS STRUCTURAL: the claim function reads
 *    config.runtime_profile from the database. A caller-supplied environment
 *    label cannot grant eligibility.
 *  * NO SECRET DEFAULTS: the one-time secret must arrive from the environment;
 *    there is no fallback value anywhere on this path.
 *  * Runs on the IDENTITY authority — the ordinary application role cannot
 *    perform any part of this.
 *
 * Exit codes:
 *   0 — bootstrap performed
 *   2 — already bootstrapped / claim lost (caller may continue)
 *   1 — real failure (caller must abort)
 */
import { sql } from 'kysely';
import * as argon2 from 'argon2';
import { loadConfig } from '../config/config.js';
import { createIdentityDb } from '../shared/db.js';
import { newId } from '../shared/ids.js';

export const EXIT_ALREADY_BOOTSTRAPPED = 2;

class AlreadyBootstrappedError extends Error {}

async function main(): Promise<void> {
  const username = process.env['EYE_BOOTSTRAP_ADMIN'];
  const password = process.env['EYE_BOOTSTRAP_PASSWORD'];
  if (username === undefined || username.length < 3 || password === undefined || password.length < 16) {
    // The secret is environment-supplied only: never committed, never defaulted,
    // never logged (ADR-P0-17). Generate one per environment, e.g.:
    //   EYE_BOOTSTRAP_PASSWORD="$(openssl rand -base64 24)"
    console.error('bootstrap: EYE_BOOTSTRAP_ADMIN (>=3 chars) and EYE_BOOTSTRAP_PASSWORD (>=16 chars) are required from the environment');
    process.exit(1);
  }

  const cfg = loadConfig();
  const db = createIdentityDb(cfg);
  const correlationId = newId();

  try {
    await db.transaction().execute(async (tx) => {
      await sql`select ctx.issue_system('one-shot platform bootstrap')`.execute(tx);

      // Database-enforced single use + structural local/test eligibility.
      const claimed = (
        await sql<{ ok: boolean }>`select identity.claim_bootstrap() as ok`.execute(tx)
      ).rows[0]?.ok === true;
      if (!claimed) {
        throw new AlreadyBootstrappedError(
          'bootstrap has already been claimed — it refuses to run twice (use governed admin flows)',
        );
      }
      // Belt-and-braces: an existing platform administrator also blocks it.
      const adminExists = (
        await sql<{ ok: boolean }>`select identity.platform_admin_exists() as ok`.execute(tx)
      ).rows[0]?.ok === true;
      if (adminExists) {
        throw new AlreadyBootstrappedError('a platform administrator already exists');
      }

      const principalId = newId();
      await sql`select identity.create_principal(
        ${principalId}::uuid, 'human', 'PLATFORM', null::uuid, null::uuid,
        ${username}, ${username},
        ${await argon2.hash(password, { type: argon2.argon2id })}, 'platform_admin'
      )`.execute(tx);
      // One-time semantics: force rotation on first use, disable if unused 24h.
      await sql`update identity.credentials
                   set status = 'must_rotate', expires_at = now() + interval '24 hours'
                 where principal_id = ${principalId}::uuid`.execute(tx);
      await sql`select identity.record_bootstrap_principal(${principalId}::uuid)`.execute(tx);

      await sql`select audit.commit_identity_event(
        ${principalId}::uuid, null::uuid, 'admin.bootstrap',
        'identity.bootstrap.platform_admin', 'success', 'OK', ${correlationId}::uuid,
        ${JSON.stringify({
          note: 'single-use audited bootstrap under system provenance; conspicuous by design',
          admin_username: username,
        })}::jsonb
      )`.execute(tx);

      console.log('==============================================================');
      console.log('  THE EYE — PLATFORM BOOTSTRAP (conspicuous, audited, single-use)');
      console.log(`  platform_admin principal: ${principalId}`);
      console.log(`  username:                 ${username}`);
      console.log('  secret:                   [environment-supplied, NOT logged]');
      console.log('  one-time:                 first login FORCES rotation; unused');
      console.log('                            credential disables after 24h');
      console.log(`  audit correlation:        ${correlationId} (partition: platform)`);
      console.log('==============================================================');
    });
  } catch (e) {
    if (e instanceof AlreadyBootstrappedError) {
      console.log(`bootstrap: ${e.message}`);
      await db.destroy();
      process.exit(EXIT_ALREADY_BOOTSTRAPPED);
    }
    const msg = e instanceof Error ? e.message : String(e);
    // A lost concurrency race surfaces as the claim conflict, not a hard failure.
    if (/already been claimed|already exists/i.test(msg)) {
      console.log(`bootstrap: ${msg}`);
      await db.destroy();
      process.exit(EXIT_ALREADY_BOOTSTRAPPED);
    }
    console.error('bootstrap: FAILED —', msg);
    await db.destroy();
    process.exit(1);
  }
  await db.destroy();
}

void main();
