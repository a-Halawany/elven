/**
 * Audited bootstrap seed (ADR-P0-04/17, remediation R6/R7) — creates the first
 * platform administrator.
 *
 * Modeled on break-glass rules (Vol 3 Ch.22): time-bound (one-shot), conspicuous
 * (loud output + durable audit evidence), independently reviewable (audit event
 * on the PLATFORM partition under system provenance), never erases the audit path.
 * Refuses to run when a platform administrator already exists.
 *
 * Runs on the SYSTEM pool (eye_system): platform context via the audited
 * eye_set_system_context port; the password credential goes through the
 * identity.credential_issue definer port (human-only, status-checked).
 *
 * Exit codes (R7 — failures are never hidden):
 *   0 — bootstrap performed
 *   2 — already bootstrapped (caller may continue)
 *   1 — real failure (caller must abort)
 *
 * Usage:
 *   EYE_BOOTSTRAP_ADMIN=<username> EYE_BOOTSTRAP_PASSWORD=<password> node dist/bootstrap/run-bootstrap.js
 */
import { sql } from 'kysely';
import * as argon2 from 'argon2';
import type { AuditEventBody } from '@eye/contracts';
import { loadConfig } from '../config/config.js';
import { createSystemDb } from '../shared/db.js';
import { newId } from '../shared/ids.js';
import { appendAuditEvent } from '../audit/internal/audit-append.port.js';
import { SYSTEM_PIPELINE_PRINCIPAL } from '../audit/audit.service.js';

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
  // Config restricts eye.runtime.env to local|test — the bootstrap path cannot
  // operate against production or real customer data (ADR-P0-17).
  if (cfg['eye.runtime.env'] !== 'local' && cfg['eye.runtime.env'] !== 'test') {
    console.error('bootstrap: refused outside local/test environments');
    process.exit(1);
  }
  const db = createSystemDb(cfg);
  const correlationId = newId();

  try {
    await db.transaction().execute(async (tx) => {
      // System provenance: audited platform context (eye_system only — R1a).
      await sql`select public.eye_set_system_context('one-shot platform bootstrap')`.execute(tx);

      const existing = await tx
        .selectFrom('identity.role_bindings')
        .select('id')
        .where('role_code', '=', 'platform_admin')
        .where('revoked_at', 'is', null)
        .executeTakeFirst();
      if (existing !== undefined) {
        throw new AlreadyBootstrappedError(
          'a platform administrator already exists — bootstrap refuses to run twice (use governed admin flows)',
        );
      }

      const principalId = newId();
      await tx
        .insertInto('identity.principals')
        .values({
          id: principalId,
          kind: 'human',
          scope: 'PLATFORM',
          tenant_id: null,
          domain_id: null,
          display_name: username,
          login_name: username, // unique login identifier (R6)
          status: 'active',
        })
        .execute();
      // One-time secret: forces rotation on first use; disabled if unused
      // within 24 hours (ADR-P0-17). Issued through the definer port (R6).
      await sql`select identity.credential_issue(
        ${newId()}::uuid, ${principalId}::uuid,
        ${await argon2.hash(password, { type: argon2.argon2id })},
        'must_rotate', ${new Date(Date.now() + 24 * 3600 * 1000)}
      )`.execute(tx);
      await tx
        .insertInto('identity.role_bindings')
        .values({
          id: newId(),
          principal_id: principalId,
          role_code: 'platform_admin',
          scope: 'PLATFORM',
          tenant_id: null,
          domain_id: null,
        })
        .execute();

      const event: AuditEventBody = {
        event_type: 'admin.bootstrap',
        outcome: 'success',
        scope: 'PLATFORM',
        tenant_id: null,
        domain_id: null,
        actor: SYSTEM_PIPELINE_PRINCIPAL,
        delegation_id: null,
        action: 'identity.bootstrap.platform_admin',
        target_type: 'PRN',
        target_id: principalId,
        target_version: '1',
        purpose_id: 'platform.bootstrap',
        policy_decision_id: null,
        policy_version: null,
        result_code: 'OK',
        occurred_at: new Date().toISOString(),
        clock_quality: 'trusted',
        correlation_id: correlationId,
        causation_id: null,
        trace_id: null,
        request_digest: null,
        metadata: {
          note: 'one-shot audited bootstrap under system provenance; conspicuous by design',
          admin_username: username,
        },
      };
      await appendAuditEvent(tx, event);

      console.log('==============================================================');
      console.log('  THE EYE — PLATFORM BOOTSTRAP (conspicuous, audited, one-shot)');
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
    console.error('bootstrap: FAILED —', e instanceof Error ? e.message : e);
    await db.destroy();
    process.exit(1);
  }
  await db.destroy();
}

void main();
