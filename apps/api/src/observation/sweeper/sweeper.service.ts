/**
 * Orphan reconciliation — PHASE1_PLAN §5.11, acceptance A4 (F34–F36).
 *
 * Three classes of orphan, three treatments, and one rule that governs all of
 * them: NOTHING IS EVER SILENTLY DELETED. An admitted-candidate blob with no
 * manifest row is quarantined for investigation, not removed; a quarantine case
 * past its TTL is expired with an event; an interrupted run is failed with a
 * stated reason. A sweeper that tidied evidence away would be the most dangerous
 * component in the system.
 *
 * EVERY OPERATION IS IDEMPOTENT. The sweeper can crash between classifying an
 * orphan and acting on it (F36), during one item (F34), or on a poison item
 * (F35), and the next sweep re-derives the classification and completes the work.
 * That is why classification is a pure function of stored state and never a
 * remembered decision.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { readdir, stat } from 'node:fs/promises';
import { join } from 'node:path';
import type { Envelope } from '@eye/contracts';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { APP_DB } from '../../shared/shared.module.js';
import type { Db } from '../../shared/db.js';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { ObservationCapability, type ObservationReads } from '../observation.capabilities.js';
import { VaultService } from '../vault/vault.service.js';
import * as fault from '../fault-injection.js';

const EMPTY_PAYLOAD_DIGEST = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';

export interface SweepReport {
  expiredCases: number;
  failedRuns: number;
  orphanCandidates: number;
  pendingTombstones: number;
  poisonItems: Array<{ kind: string; ref: string; reason: string }>;
}

@Injectable()
export class SweeperService {
  private readonly log = new Logger('observation.sweeper');

  constructor(
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
    @Inject(APP_DB) private readonly db: Db,
    private readonly pipeline: PipelineService,
    private readonly vault: VaultService,
  ) {}

  /**
   * Every read here is a CONSEQUENTIAL READ under the sweeping principal's
   * authority. Reading through the ordinary application pool returns nothing —
   * row-level security has no tenant to compare against outside a governed
   * context — and a sweeper that saw no manifests would classify every blob in
   * the volume as an orphan, which is precisely the wrong answer to be confident
   * about.
   */
  private async read<T>(
    principal: AuthenticatedPrincipal, tenantId: string, domainId: string,
    correlationId: string, purposeId: string, objectType: string,
    fn: (cap: ObservationReads) => Promise<T>,
  ): Promise<T> {
    const envelope: Envelope = {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId,
      principal_id: `principal:${principal.principalId}`, purpose_id: purposeId,
      action: 'observation.read.sweeper', side_effect_class: 'none', consequence_class: 'C1',
      object_type: objectType, object_id: null, schema_version: 'v1',
      issued_at: new Date().toISOString(), clock_quality: 'trusted',
      correlation_id: correlationId, trace_id: `sweep-${correlationId.slice(0, 8)}`,
      payload_digest: EMPTY_PAYLOAD_DIGEST,
    };
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      {
        scope: 'DOMAIN', tenantId, domainId,
        action: 'observation.read.sweeper', objectType, objectId: null,
      },
      ObservationCapability.read, async (cap) => fn(cap));
    return out.result;
  }

  async sweep(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    domainId: string,
    correlationId: string,
    purposeId: string,
  ): Promise<SweepReport> {
    const report: SweepReport = {
      expiredCases: 0, failedRuns: 0, orphanCandidates: 0,
      pendingTombstones: 0, poisonItems: [],
    };

    // ── 1. Quarantine cases past their TTL without a terminal state ──────────
    const staleCases = await this.read(principal, tenantId, domainId, correlationId, purposeId, 'QAR',
      async (cap) => (await cap
        .readQuarantine().selectAll()
        .where('state' as never, '=', 'open' as never)
        .where('expires_at' as never, '<', new Date() as never)
        .limit(200)
        .execute()) as Array<{ case_id: string }>);

    for (const c of staleCases) {
      fault.at('f36.sweeper_between_classify_and_act');
      try {
        fault.at('f34.during_sweeper_item');
        await this.governed(principal, tenantId, domainId, correlationId, purposeId,
          'observation.sweeper.reconcile', 'QAR', c.case_id, async (cap) => {
            await cap.closeQuarantineCase({
              caseId: c.case_id, tenantId, domainId, outcome: 'expired',
              reason: null, eventId: newId(), correlationId,
            });
          });
        report.expiredCases += 1;
      } catch (e) {
        // A poison item does not stop the sweep; it is recorded and retried next
        // round, so one bad row cannot stall reconciliation for everything else.
        fault.at('f35.sweeper_poison_item');
        report.poisonItems.push({ kind: 'quarantine_case', ref: c.case_id, reason: describe(e) });
      }
    }

    // ── 2. Runs started but never terminated, past the run timeout ───────────
    const cutoff = new Date(Date.now() - this.cfg['eye.sweeper.run_timeout_seconds'] * 1000);
    const stuckRuns = await this.read(principal, tenantId, domainId, correlationId, purposeId, 'RUN',
      async (cap) => (await cap
        .readRuns().selectAll()
        .where('state' as never, '=', 'started' as never)
        .where('last_event_at' as never, '<', cutoff as never)
        .limit(200)
        .execute()) as Array<{
        run_id: string; source_id: string; contract_version: number;
        agent_principal_id: string; agent_version: string; code_digest: string;
        connector: string; connector_version: string; acquisition_mode: string;
      }>);

    for (const r of stuckRuns) {
      try {
        await this.governed(principal, tenantId, domainId, correlationId, purposeId,
          'observation.sweeper.reconcile', 'RUN', r.run_id, async (cap) => {
            await cap.appendRunEvent({
              eventId: newId(), tenantId, domainId, runId: r.run_id,
              sourceId: r.source_id, contractVersion: r.contract_version,
              agentPrincipalId: r.agent_principal_id, agentVersion: r.agent_version,
              codeDigest: r.code_digest, connector: r.connector,
              connectorVersion: r.connector_version, acquisitionMode: r.acquisition_mode,
              event: 'run.failed',
              details: { reason: 'interrupted', reconciled_by: 'sweeper' },
              correlationId,
            });
          });
        report.failedRuns += 1;
      } catch (e) {
        report.poisonItems.push({ kind: 'run', ref: r.run_id, reason: describe(e) });
      }
    }

    // ── 3. Quarantine blobs whose case closed as admitted but whose tombstone
    //       never completed. The tombstone is idempotent, so re-running it is
    //       always safe and always finishes the job (F26/F27). ────────────────
    const admittedCases = await this.read(principal, tenantId, domainId, correlationId, purposeId, 'QAR',
      async (cap) => (await cap
        .readQuarantine().selectAll()
        .where('state' as never, '=', 'admitted' as never)
        .limit(200)
        .execute()) as Array<{ case_id: string; manifest_id: string | null }>);
    for (const c of admittedCases) {
      if (c.manifest_id === null) continue;
      const m = await this.read(principal, tenantId, domainId, correlationId, purposeId, 'EVD',
        async (cap) => (await cap
          .readManifests().selectAll()
          .where('manifest_id' as never, '=', c.manifest_id as never)
          .executeTakeFirst()) as { locator: string; vault: string } | undefined);
      if (m === undefined || m.vault !== 'quarantine') continue;
      if (!(await this.vault.exists('quarantine', { tenantId, domainId }, m.locator))) continue;
      try {
        await this.governed(principal, tenantId, domainId, correlationId, purposeId,
          'observation.sweeper.reconcile', 'QAR', c.case_id, async (cap) => {
            await cap.tombstoneBlob({
              tombstoneId: newId(), tenantId, domainId, manifestId: c.manifest_id as string,
              reason: 'quarantine copy retired after admission (sweeper completion)',
              correlationId,
            });
          });
        await this.vault.tombstone('quarantine', { tenantId, domainId }, m.locator);
        report.pendingTombstones += 1;
      } catch (e) {
        report.poisonItems.push({ kind: 'tombstone', ref: c.case_id, reason: describe(e) });
      }
    }

    // ── 4. Admitted-candidate blobs with NO manifest row ─────────────────────
    // These are the 8g orphans. They are ALREADY unreachable (retrieval resolves
    // through the manifest), and they are QUARANTINED FOR INVESTIGATION rather
    // than deleted: bytes that reached the evidence volume without a record are
    // exactly the thing a reviewer will want to see.
    report.orphanCandidates = await this.reconcileOrphanCandidates(
      principal, tenantId, domainId, correlationId, purposeId, report);

    return report;
  }

  /**
   * Walk the evidence volume for this domain and compare against the manifests.
   * Filesystem-first, deliberately: an orphan is by definition something the
   * database does not know about, so a database-first sweep could never find one.
   */
  private async reconcileOrphanCandidates(
    principal: AuthenticatedPrincipal, tenantId: string, domainId: string,
    correlationId: string, purposeId: string, report: SweepReport,
  ): Promise<number> {
    const dir = join(this.vault.rootFor('evidence'), tenantId, domainId);
    let names: string[];
    try {
      names = await readdir(dir);
    } catch {
      return 0; // nothing stored for this domain yet
    }
    const known = new Set(
      (await this.read(principal, tenantId, domainId, correlationId, purposeId, 'EVD',
        async (cap) => (await cap
          .readManifests().select('locator' as never)
          .where('vault' as never, '=', 'evidence' as never)
          .limit(20000)
          .execute()) as Array<{ locator: string }>)).map((r) => r.locator),
    );

    let orphans = 0;
    for (const name of names) {
      const locator = `${tenantId}/${domainId}/${name}`;
      if (known.has(locator)) continue;
      // A temp file from an interrupted write is a different orphan class and is
      // removed: it never had a locator, so nothing could ever have referenced it.
      if (name.includes('.tmp-')) {
        const info = await stat(join(dir, name)).catch(() => null);
        if (info !== null && Date.now() - info.mtimeMs > 60_000) {
          await this.vault.tombstone('evidence', { tenantId, domainId }, locator).catch(() => undefined);
        }
        continue;
      }
      orphans += 1;
      // Recorded, NOT removed: the bytes stay where they are for investigation.
      // A BOUNDED SAMPLE is carried in the report — a list that repeats one
      // sentence two hundred times tells an operator less than a count and five
      // examples, not more.
      if (orphans <= 5) {
        report.poisonItems.push({
          kind: 'orphan_candidate',
          ref: locator,
          reason: 'evidence-volume bytes with no manifest row: an admission transaction that did not commit. Retained for investigation, unreachable through every retrieval path.',
        });
      }
    }
    return orphans;
  }

  private async governed(
    principal: AuthenticatedPrincipal,
    tenantId: string,
    domainId: string,
    correlationId: string,
    purposeId: string,
    action: string,
    objectType: string,
    objectId: string,
    body: (cap: ReturnType<typeof ObservationCapability.acquisition>) => Promise<void>,
  ): Promise<void> {
    const envelope: Envelope = {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId,
      principal_id: `principal:${principal.principalId}`, purpose_id: purposeId,
      action, side_effect_class: 'reversible', consequence_class: 'C1',
      object_type: objectType, object_id: objectId, schema_version: 'v1',
      issued_at: new Date().toISOString(), clock_quality: 'trusted',
      correlation_id: correlationId, trace_id: `sweep-${correlationId.slice(0, 8)}`,
      payload_digest: EMPTY_PAYLOAD_DIGEST,
    };
    await this.pipeline.write(
      envelope, principal,
      { scope: 'DOMAIN', tenantId, domainId, action, objectType, objectId },
      ObservationCapability.acquisition,
      async (cap) => {
        await body(cap);
        return { result: {}, targetType: objectType, targetId: objectId, targetVersion: '1', outboxEvent: null };
      },
    );
  }
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message.slice(0, 300) : 'unknown failure';
}
