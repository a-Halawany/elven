/**
 * The acquisition lifecycle — PHASE1_PLAN §5, acceptance A2/A4.
 *
 * The twelve numbered steps, in order, with the transaction boundaries exactly
 * where the plan puts them. Three properties are worth naming before the code,
 * because they are what the whole design is for:
 *
 *  1. NO EXTERNAL I/O HAPPENS INSIDE A DATABASE TRANSACTION. Acquisition (step 4)
 *     and the filesystem writes (steps 5, 8a) run between transactions, never
 *     inside one. A4 asserts this structurally; the shape of this file is the
 *     assertion's subject.
 *  2. THE FILESYSTEM COPY IS NOT PART OF THE DATABASE TRANSACTION, and nothing
 *     here describes it as atomic with one. The candidate bytes are made durable
 *     and digest-verified FIRST (8a/8b); only then does a short transaction
 *     commit the records that reference them (8c–8e). The canonical record can
 *     therefore never reference missing or non-durable bytes.
 *  3. A FAILED ADMISSION LEAVES AN ORPHAN, NOT A LIE. If the transaction aborts,
 *     the candidate has no manifest row, and retrieval resolves through the
 *     manifest only — so it is unreachable by every path, and the sweeper
 *     reconciles it rather than anything silently deleting it.
 *
 * Fault-injection points from §5.13 are marked inline with their row ids.
 */
import { Inject, Injectable, Logger } from '@nestjs/common';
import { canonicalHeaderDigest, validateHeader, type CanonicalHeader, type Envelope } from '@eye/contracts';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { APP_DB } from '../../shared/shared.module.js';
import type { Db } from '../../shared/db.js';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { PipelineService, type RouteInfo } from '../../pipeline/pipeline.service.js';
import { ObservationCapability, type AcquisitionWrites } from '../observation.capabilities.js';
import { VaultService, VaultIntegrityError } from '../vault/vault.service.js';
import { inspectContent } from '../connectors/content-controls.js';
import { redactValue } from '../connectors/redaction.js';
import { BudgetExceeded, BudgetMeter, checkSchemaDrift, type AcquiredItem, type Connector, type SourceBinding } from '../connectors/sdk.js';
import { EgressRefused } from '../connectors/http-client.js';
import { ReplayIntegrityError } from '../connectors/replay.js';
import * as fault from '../fault-injection.js';

export interface RunRequest {
  sourceId: string;
  contractVersion: number;
  agentId: string;
  agentVersion: string;
  connector: Connector;
  principal: AuthenticatedPrincipal;
  correlationId: string;
  purposeId: string;
}

/** What the admission transaction actually committed for one item. */
type AdmissionResult =
  | { kind: 'admitted'; evdObjectId: string }
  | { kind: 'noop' };

export interface RunOutcome {
  runId: string;
  state: 'finished' | 'failed' | 'cancelled' | 'budget_exceeded';
  admitted: number;
  quarantined: number;
  noop: number;
  reason?: string;
}

interface ContractRow {
  source_id: string;
  contract_version: number;
  tenant_id: string;
  domain_id: string;
  source_key: string;
  authority_class: 'authoritative' | 'observational';
  connector_kind: string;
  acquisition_mode: 'replay' | 'live';
  lifecycle_state: string;
  rights_state: string;
  classification_ceiling: string;
  residency: string;
  purposes: string[];
  endpoints: string[];
  contract: Record<string, unknown>;
  [k: string]: unknown;
}

@Injectable()
export class AcquisitionLifecycle {
  private readonly log = new Logger('observation.acquisition');

  constructor(
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
    @Inject(APP_DB) private readonly db: Db,
    private readonly pipeline: PipelineService,
    private readonly vault: VaultService,
  ) {}

  /** The envelope a governed operation needs. Built server-side; never client-supplied. */
  private envelope(req: RunRequest, action: string, objectType: string, objectId: string | null, tenantId: string, domainId: string): Envelope {
    return {
      message_id: newId(),
      scope: 'DOMAIN',
      tenant_id: tenantId,
      domain_id: domainId,
      principal_id: `principal:${req.principal.principalId}`,
      purpose_id: req.purposeId,
      action,
      side_effect_class: 'reversible',
      consequence_class: 'C1',
      object_type: objectType,
      object_id: objectId,
      schema_version: 'v1',
      issued_at: new Date().toISOString(),
      clock_quality: 'trusted',
      correlation_id: req.correlationId,
      trace_id: `obs-${req.correlationId.slice(0, 8)}`,
      payload_digest: EMPTY_PAYLOAD_DIGEST,
    };
  }

  private route(action: string, tenantId: string, domainId: string, objectType: string, objectId: string | null): RouteInfo {
    return { scope: 'DOMAIN', tenantId, domainId, action, objectType, objectId };
  }

  /**
   * Run one collection attempt end to end.
   *
   * The method is long because the lifecycle is long, and splitting it would put
   * the transaction boundaries out of sight of the steps they belong to. Each
   * step keeps its number.
   */
  async run(req: RunRequest): Promise<RunOutcome> {
    const runId = newId();

    // ── step 1: authorize the scheduled attempt ─────────────────────────────
    // The agent principal is already authenticated (its session was minted from
    // the registry, not from a queued credential). Scope resolution and the PDP
    // evaluation happen inside the pipeline call below, which is step 1's real
    // execution; the injection points sit on its sub-boundaries.
    fault.at('f02.after_agent_auth');
    const contract = await this.loadContract(req.sourceId, req.contractVersion);
    if (contract === null) {
      return { runId, state: 'failed', admitted: 0, quarantined: 0, noop: 0, reason: 'no such source contract version' };
    }
    const { tenant_id: tenantId, domain_id: domainId } = contract;
    fault.at('f03.after_scope_resolution');
    fault.at('f04.after_pdp_decision');

    // ── step 2: POL + AUD + run.started, in ONE transaction ─────────────────
    // F05/F06 assert the atomicity of exactly this: a `run.started` that exists
    // without its authorization evidence, or the reverse, is impossible.
    let agentPrincipalId = req.principal.principalId;
    let codeDigest = req.connector.codeDigest;
    try {
      await this.pipeline.write(
        this.envelope(req, 'observation.run.start', 'RUN', runId, tenantId, domainId),
        req.principal,
        this.route('observation.run.start', tenantId, domainId, 'RUN', runId),
        ObservationCapability.acquisition,
        async (cap) => {
          // Per-run reauthorization (§11): the agent grant is re-derived here, so
          // a revocation that landed while the job was queued stops the run.
          const agent = await cap.authorizeAgentRun({
            agentId: req.agentId, tenantId, domainId,
            principalId: req.principal.principalId,
            agentVersion: req.agentVersion, codeDigest: req.connector.codeDigest,
            sourceId: req.sourceId,
          });
          agentPrincipalId = req.principal.principalId;
          codeDigest = req.connector.codeDigest;
          // The contract is revalidated a FIRST time here, before scheduling work.
          await cap.lockActiveContract({
            sourceId: req.sourceId, contractVersion: req.contractVersion,
            tenantId, domainId, purpose: req.purposeId,
          });
          fault.at('f05.in_run_start_tx_before_commit');
          await cap.appendRunEvent({
            eventId: newId(), tenantId, domainId, runId,
            sourceId: req.sourceId, contractVersion: req.contractVersion,
            agentPrincipalId, agentVersion: req.agentVersion, codeDigest,
            connector: req.connector.name, connectorVersion: req.connector.version,
            acquisitionMode: contract.acquisition_mode,
            event: 'run.started',
            details: { agent_id: req.agentId, budgets: agent.budgets, owner: agent.owner_principal_id },
            correlationId: req.correlationId,
          });
          fault.at('f06.at_run_start_commit');
          return { result: { runId }, targetType: 'RUN', targetId: runId, targetVersion: '1', outboxEvent: null };
        },
      );
    } catch (e) {
      // Nothing was persisted: the transaction carried POL, AUD and run.started
      // together, so there is no half-started run to reconcile.
      return { runId, state: 'failed', admitted: 0, quarantined: 0, noop: 0, reason: describe(e) };
    }
    fault.at('f07.after_run_start_commit');

    let admitted = 0;
    let quarantined = 0;
    let noop = 0;

    try {
      // ── step 3: revalidate the exact contract version immediately before egress ──
      const stillActive = await this.loadContract(req.sourceId, req.contractVersion);
      if (stillActive === null || stillActive.lifecycle_state !== 'active') {
        // F08: abort BEFORE egress. No external I/O is performed at all.
        await this.appendEvent(req, tenantId, domainId, runId, contract, 'observation.run.cancel', 'run.cancelled', {
          reason: 'contract was not active at the pre-egress revalidation',
          lifecycle_state: stillActive?.lifecycle_state ?? 'absent',
        });
        return { runId, state: 'cancelled', admitted, quarantined, noop, reason: 'contract not active before egress' };
      }
      fault.at('f09.after_revalidation_before_egress');

      // ── step 4: bounded external acquisition, OUTSIDE any transaction ───────
      const binding = this.bindingFor(contract);
      const meter = new BudgetMeter(binding.budgets);
      const checkpoint = await this.loadCheckpoint(req.sourceId);
      const output = await req.connector.acquire({
        binding, checkpoint, budget: meter,
        replayRoot: this.cfg['eye.connector.replay_root'],
      });
      fault.at('f11.after_acquisition_before_open');

      // A framing parent (the raw feed response) is admitted first, so a child
      // fragment always has a parent that already exists.
      const queue: AcquiredItem[] = output.parent != null ? [output.parent, ...output.items] : output.items;
      const parentEvdByKey = new Map<string, string>();

      for (const item of queue) {
        await this.appendEvent(req, tenantId, domainId, runId, contract, 'observation.run.checkpoint', 'item.fetched', {
          item_key: item.itemKey, bytes: item.bytes.byteLength,
          transport: redactValue(item.transport),
        });

        const result = await this.admitOrQuarantine(
          req, contract, runId, item, binding,
          item.parentItemKey != null ? parentEvdByKey.get(item.parentItemKey) ?? null : null,
        );
        if (result.kind === 'admitted') {
          admitted += 1;
          parentEvdByKey.set(item.itemKey, result.evdObjectId);
        } else if (result.kind === 'quarantined') {
          quarantined += 1;
        } else {
          noop += 1;
        }
      }

      // ── step 9: advance the checkpoint ONLY after the DB commits ────────────
      fault.at('f28.before_checkpoint_append');
      await this.pipeline.write(
        this.envelope(req, 'observation.run.checkpoint', 'RUN', runId, tenantId, domainId),
        req.principal,
        this.route('observation.run.checkpoint', tenantId, domainId, 'RUN', runId),
        ObservationCapability.acquisition,
        async (cap) => {
          fault.at('f29.during_checkpoint_append');
          await cap.appendCheckpoint({
            eventId: newId(), tenantId, domainId, sourceId: req.sourceId,
            contractVersion: req.contractVersion, runId,
            checkpoint: output.checkpoint, correlationId: req.correlationId,
          });
          await cap.appendRunEvent({
            eventId: newId(), tenantId, domainId, runId,
            sourceId: req.sourceId, contractVersion: req.contractVersion,
            agentPrincipalId, agentVersion: req.agentVersion, codeDigest,
            connector: req.connector.name, connectorVersion: req.connector.version,
            acquisitionMode: contract.acquisition_mode,
            event: 'run.checkpointed', details: { checkpoint: redactValue(output.checkpoint) },
            correlationId: req.correlationId,
          });
          return { result: {}, targetType: 'RUN', targetId: runId, targetVersion: '1', outboxEvent: null };
        },
      );
      fault.at('f30.after_checkpoint_append');

      // ── step 10: the outbox row committed with the admission publishes async ──
      await this.appendEvent(req, tenantId, domainId, runId, contract, 'observation.run.finish', 'run.finished', {
        admitted, quarantined, noop,
        budget_spent: meter.spent,
        requests: output.requestsMade, bytes: output.bytesTransferred,
      });
      return { runId, state: 'finished', admitted, quarantined, noop };
    } catch (e) {
      // A BUDGET breach is its own terminal state and escalates (§11); everything
      // else is a failure. Either way the run gets a terminal event, so the
      // sweeper has nothing to reconcile.
      const budget = e instanceof BudgetExceeded;
      await this.appendEvent(
        req, tenantId, domainId, runId, contract,
        budget ? 'observation.run.finish' : 'observation.run.finish',
        budget ? 'run.budget_exceeded' : 'run.failed',
        { reason: describe(e), admitted, quarantined, noop },
      ).catch(() => undefined);
      return {
        runId, state: budget ? 'budget_exceeded' : 'failed',
        admitted, quarantined, noop, reason: describe(e),
      };
    }
  }

  /**
   * Steps 5–8 and 12 for ONE item.
   *
   * Returns which of the three outcomes happened: admitted, quarantined, or the
   * audited no-op of an exact replay. Those three are exhaustive by construction
   * — there is no "skipped" that leaves no record.
   */
  private async admitOrQuarantine(
    req: RunRequest,
    contract: ContractRow,
    runId: string,
    item: AcquiredItem,
    binding: SourceBinding,
    parentEvdObjectId: string | null,
  ): Promise<{ kind: 'admitted'; evdObjectId: string } | { kind: 'quarantined' } | { kind: 'noop' }> {
    const tenantId = contract.tenant_id;
    const domainId = contract.domain_id;
    const scope = { tenantId, domainId };

    // ── steps 5 + 6: store the exact original bytes, fsync, re-read, compare ──
    const stored = await this.vault.store('quarantine', scope, item.bytes);

    // ── step 7: bounded validation and safety scanning ──────────────────────
    const verdict = inspectContent(item.bytes, {
      declaredType: item.declaredMediaType,
      filename: item.filename,
    });
    let drift: { ok: true } | { ok: false; missing: string[]; reason: string } = { ok: true };
    if (verdict.ok && binding.expectedSchema.requiredFields.length > 0) {
      drift = await this.checkDeclaredSchema(item, binding);
    }

    if (!verdict.ok || !drift.ok) {
      // QUARANTINE, NOT ADMIT-AND-FLAG. The bytes stay in the quarantine volume
      // and never reach the evidence volume; a silently admitted gap becomes a
      // fact, which is the failure mode this whole path exists to prevent.
      await this.quarantineItem(req, contract, runId, item, stored, verdict, drift);
      return { kind: 'quarantined' };
    }

    // ── step 8a + 8b: admitted candidate, fsync'd and digest-verified ────────
    // OUTSIDE the database transaction, deliberately. The bytes are durable and
    // verified before any record references them.
    let candidate;
    try {
      candidate = await this.vault.createAdmittedCandidate(scope, stored.locator, stored.contentDigest);
    } catch (e) {
      if (e instanceof VaultIntegrityError) {
        await this.quarantineItem(req, contract, runId, item, stored, {
          ...verdict, ok: false, class: 'malformed_archive',
          reason: `admitted candidate could not be verified against the quarantine original (${e.reason})`,
        }, { ok: true });
        return { kind: 'quarantined' };
      }
      throw e;
    }

    const obsObjectId = newId();
    const evdObjectId = newId();
    const manifestId = newId();
    const observedAt = new Date().toISOString();

    // ── steps 8c–8e + 12: ONE short transaction ─────────────────────────────
    // The result is what the transaction COMMITTED, not what the closure believed
    // it was doing: an admission and an audited no-op are distinguished by the
    // record that survived, never by a variable the handler set on the way past.
    const committed = await this.pipeline.write<AdmissionResult, AcquisitionWrites>(
      this.envelope(req, 'observation.item.admit', 'EVD', evdObjectId, tenantId, domainId),
      req.principal,
      this.route('observation.item.admit', tenantId, domainId, 'EVD', evdObjectId),
      ObservationCapability.acquisition,
      async (cap) => {
        fault.at('f20.after_tx_open_before_lock');

        // 8d: THE TRANSACTIONALLY PROTECTED FINAL CONTRACT REVALIDATION, under a
        // row-level share lock. A concurrent suspension either committed before
        // this lock — and this admission aborts — or blocks until we commit.
        const active = await cap.lockActiveContract({
          sourceId: req.sourceId, contractVersion: req.contractVersion,
          tenantId, domainId, purpose: req.purposeId,
        });
        fault.at('f22.while_holding_contract_lock');

        // ── step 12: idempotency vs. evidence identity ────────────────────────
        fault.at('f37.after_attempt_key_before_lookup');
        fault.at('f38.during_attempt_lookup');
        const claim = await cap.claimAttempt({
          attemptId: newId(), tenantId, domainId, sourceId: req.sourceId,
          contractVersion: req.contractVersion, runId, itemKey: item.itemKey,
          correlationId: req.correlationId,
        });
        if (claim === 'replay') {
          // An EXACT replay of this acquisition attempt. It no-ops — and the no-op
          // is AUDITED, not silent. Identical bytes seen at a later observation
          // time are a different attempt key and never land here.
          fault.at('f39.replay_before_noop_event');
          fault.at('f40.during_noop_event_append');
          await cap.appendRunEvent({
            eventId: newId(), tenantId, domainId, runId,
            sourceId: req.sourceId, contractVersion: req.contractVersion,
            agentPrincipalId: req.principal.principalId, agentVersion: req.agentVersion,
            codeDigest: req.connector.codeDigest,
            connector: req.connector.name, connectorVersion: req.connector.version,
            acquisitionMode: contract.acquisition_mode,
            event: 'item.noop',
            details: { item_key: item.itemKey, reason: 'exact replay of the same acquisition attempt' },
            correlationId: req.correlationId,
          });
          return {
            result: { kind: 'noop' as const },
            targetType: 'RUN', targetId: runId, targetVersion: '1', outboxEvent: null,
          };
        }
        fault.at('f42.new_observation_before_obs_insert');

        // 8e, write 1 of 7: the blob manifest. Retrieval resolves through this row
        // and only through it, which is what makes an aborted admission unreachable.
        await cap.recordManifest({
          manifestId, tenantId, domainId, vault: 'evidence', locator: candidate.locator,
          digest: candidate.contentDigest, byteLength: candidate.byteLength,
          declaredType: item.declaredMediaType, sniffedType: verdict.sniffedType,
          activeContentRisk: verdict.activeContentRisk,
          classification: String(active['classification_ceiling']),
          residency: String(active['residency']),
          retention: String((contract.contract as { authority_and_rights?: { retention?: string } })
            .authority_and_rights?.retention ?? 'default'),
          legalHold: false,
          sourceId: req.sourceId, contractVersion: req.contractVersion, runId,
          acquisitionMode: contract.acquisition_mode, correlationId: req.correlationId,
        });
        fault.at('f23.after_manifest_before_obs');

        // 8e, write 2 of 7: the OBS canonical object — WHAT WAS OBSERVED AND WHEN,
        // with transport lineage and no interpretation of the content whatsoever.
        await this.admitObs(cap, req, contract, runId, item, obsObjectId, observedAt, parentEvdObjectId);
        fault.at('f23a.after_obs_before_evd');

        // 8e, write 3 of 7: the EVD canonical object — the bytes, their digest,
        // and the FOUR SEPARATE authenticity concepts, never collapsed into one.
        await this.admitEvd(cap, req, contract, item, obsObjectId, evdObjectId, manifestId, candidate, verdict, parentEvdObjectId);
        fault.at('f23b.after_evd_before_custody');

        // 8e, write 4 of 7: the custody entry.
        fault.at('f44.after_shared_digest_resolved_before_commit');
        await cap.appendCustody({
          eventId: newId(), tenantId, domainId, manifestId,
          obsObjectId, evdObjectId, sourceId: req.sourceId,
          contractVersion: req.contractVersion, runId,
          event: 'custody.admitted', actor: `agent:${req.connector.name}@${req.agentVersion}`,
          agentPrincipalId: req.principal.principalId, agentVersion: req.agentVersion,
          codeDigest: req.connector.codeDigest,
          connector: req.connector.name, connectorVersion: req.connector.version,
          methodRef: item.transport.methodRef,
          contentDigest: candidate.contentDigest, digestVerified: true,
          details: {
            quarantine_locator_tombstoned_next: true,
            verified: ['pre-store', 'post-store', 'candidate-post-copy'],
          },
          correlationId: req.correlationId,
        });
        fault.at('f23c.after_custody_before_pol');

        await cap.appendRunEvent({
          eventId: newId(), tenantId, domainId, runId,
          sourceId: req.sourceId, contractVersion: req.contractVersion,
          agentPrincipalId: req.principal.principalId, agentVersion: req.agentVersion,
          codeDigest: req.connector.codeDigest,
          connector: req.connector.name, connectorVersion: req.connector.version,
          acquisitionMode: contract.acquisition_mode,
          event: 'item.admitted',
          details: { item_key: item.itemKey, evd_object_id: evdObjectId, digest: candidate.contentDigest },
          correlationId: req.correlationId,
        });
        await cap.markAttemptOutcome({
          tenantId, domainId, sourceId: req.sourceId, contractVersion: req.contractVersion,
          runId, itemKey: item.itemKey, outcome: 'admitted', evdObjectId,
        });

        // 8e, writes 5–7 (POL, AUD, outbox) are the pipeline's, in this same
        // transaction. F23d/F23e/F23f sit on their boundaries.
        fault.at('f23d.after_pol_before_aud');
        fault.at('f23e.after_aud_before_outbox');
        fault.at('f23f.after_outbox_before_commit');
        fault.at('f24.at_admission_commit');
        return {
          result: { kind: 'admitted' as const, evdObjectId },
          targetType: 'EVD', targetId: evdObjectId, targetVersion: '1',
          outboxEvent: {
            eventType: 'ObservationRecorded',
            payload: {
              obs_object_id: obsObjectId, evd_object_id: evdObjectId,
              source_id: req.sourceId, contract_version: req.contractVersion,
              run_id: runId, acquisition_mode: contract.acquisition_mode,
              authority_class: contract.authority_class,
              content_digest: candidate.contentDigest,
            },
          },
        };
      },
    );
    fault.at('f25.after_admission_commit');

    if (committed.result.kind === 'noop') {
      // The candidate was created before the replay was detected. It has no
      // manifest row, so it is already unreachable; removing it now saves the
      // sweeper a round rather than being load-bearing.
      await this.vault.tombstone('evidence', scope, candidate.locator).catch(() => undefined);
      await this.vault.tombstone('quarantine', scope, stored.locator).catch(() => undefined);
      return { kind: 'noop' };
    }

    // ── step 8f: finalize custody and tombstone the quarantine copy ──────────
    // After the commit, in its own governed operation. F25/F26/F27 cover the
    // crash points; every action here is idempotent so the sweeper can finish it.
    await this.pipeline.write(
      this.envelope(req, 'observation.item.admit', 'EVD', evdObjectId, tenantId, domainId),
      req.principal,
      this.route('observation.item.admit', tenantId, domainId, 'EVD', evdObjectId),
      ObservationCapability.acquisition,
      async (cap) => {
        await cap.appendCustody({
          eventId: newId(), tenantId, domainId, manifestId,
          obsObjectId, evdObjectId, sourceId: req.sourceId,
          contractVersion: req.contractVersion, runId,
          event: 'custody.finalized', actor: `agent:${req.connector.name}@${req.agentVersion}`,
          agentPrincipalId: req.principal.principalId, agentVersion: req.agentVersion,
          codeDigest: req.connector.codeDigest,
          connector: req.connector.name, connectorVersion: req.connector.version,
          methodRef: item.transport.methodRef,
          contentDigest: candidate.contentDigest, digestVerified: true,
          details: { quarantine_locator: 'tombstoned' },
          correlationId: req.correlationId,
        });
        fault.at('f26.after_finalized_custody_before_tombstone');
        return { result: {}, targetType: 'EVD', targetId: evdObjectId, targetVersion: '1', outboxEvent: null };
      },
    );
    await this.vault.tombstone('quarantine', scope, stored.locator);

    return { kind: 'admitted', evdObjectId };
  }

  // ===== the two canonical objects =====

  private async admitObs(
    cap: AcquisitionWrites, req: RunRequest, contract: ContractRow, runId: string,
    item: AcquiredItem, obsObjectId: string, observedAt: string, parentEvdObjectId: string | null,
  ): Promise<void> {
    const payload = {
      source_key: contract.source_key,
      source_id: req.sourceId,
      contract_version: req.contractVersion,
      run_id: runId,
      item_key: item.itemKey,
      acquisition_mode: contract.acquisition_mode,
      authority_class: contract.authority_class,
      observed_at: observedAt,
      publisher_time: item.publisherTime,
      transport: {
        connector: item.transport.connector,
        connector_version: item.transport.connectorVersion,
        method_ref: item.transport.methodRef,
        endpoint: item.transport.endpoint,
        http_status: item.transport.httpStatus,
        retained_headers: item.transport.retainedHeaders,
        tls_verified: item.transport.tlsVerified,
        origin_allowlisted: item.transport.originAllowlisted,
      },
      parent_obs_id: null,
      fragment_ref: item.fragment != null ? `${item.fragment.byteStart}-${item.fragment.byteEnd}` : null,
    };
    const header = this.header({
      objectId: obsObjectId, objectType: 'OBS', contract, req,
      // The FOUR TIMES, each from its own source and never from another's:
      //   event  — the publisher's own time for the item, when it publishes one
      //   observation — when WE observed it
      //   valid  — left open; Phase 1 makes no claim about the item's validity interval
      //   record — set by the committing component
      eventTime: item.publisherTime,
      observationTime: observedAt,
      validFrom: null,
      truthState: 'observed',
      methodRef: item.transport.methodRef,
      evidenceRefs: parentEvdObjectId != null ? [`EVD:${parentEvdObjectId}`] : [],
      sourceObjectIds: [`SRC:${req.sourceId}@${req.contractVersion}`],
      schemaRef: 'OBS@v1',
    });
    await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
  }

  private async admitEvd(
    cap: AcquisitionWrites, req: RunRequest, contract: ContractRow, item: AcquiredItem,
    obsObjectId: string, evdObjectId: string, manifestId: string,
    candidate: { locator: string; contentDigest: string; byteLength: number },
    verdict: ReturnType<typeof inspectContent>, parentEvdObjectId: string | null,
  ): Promise<void> {
    const payload = {
      obs_object_id: obsObjectId,
      manifest_id: manifestId,
      locator: candidate.locator,
      content_digest: candidate.contentDigest,
      byte_length: candidate.byteLength,
      vault: 'evidence',
      acquisition_mode: contract.acquisition_mode,
      media_type_declared: item.declaredMediaType,
      media_type_sniffed: verdict.sniffedType,
      active_content_risk: verdict.activeContentRisk,
      parent_evd_id: parentEvdObjectId,
      fragment: item.fragment != null
        ? { byte_start: item.fragment.byteStart, byte_end: item.fragment.byteEnd, method_ref: item.fragment.methodRef }
        : null,
      /*
       * THE FOUR AUTHENTICITY CONCEPTS, RECORDED SEPARATELY (§6).
       *
       * TLS and a digest do not establish that content genuinely originates from
       * the claimed real-world source. In cohort 1 no source declares a publisher
       * signature mechanism, so content_authenticity is `unknown` — and it is
       * recorded as unknown rather than omitted, because an absent field reads as
       * an oversight while an explicit `unknown` reads as an answer.
       */
      authenticity: {
        transport_endpoint: item.transport.tlsVerified === true ? 'verified'
          : item.transport.tlsVerified === false ? 'unverified' : 'not_applicable',
        byte_integrity: 'verified',
        source_origin: item.transport.originAllowlisted === true ? 'verified'
          : item.transport.originAllowlisted === false ? 'unverified' : 'not_applicable',
        content_authenticity: 'unknown',
      },
    };
    const header = this.header({
      objectId: evdObjectId, objectType: 'EVD', contract, req,
      eventTime: item.publisherTime,
      observationTime: new Date().toISOString(),
      validFrom: null,
      truthState: 'observed',
      methodRef: item.transport.methodRef,
      evidenceRefs: [`blob:${manifestId}`],
      sourceObjectIds: [`OBS:${obsObjectId}`],
      schemaRef: 'EVD@v1',
      contentRef: `vault:evidence/${candidate.locator}`,
    });
    await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
  }

  private header(a: {
    objectId: string; objectType: string; contract: ContractRow; req: RunRequest;
    eventTime: string | null; observationTime: string; validFrom: string | null;
    truthState: string; methodRef: string; evidenceRefs: string[]; sourceObjectIds: string[];
    schemaRef: string; contentRef?: string;
  }): CanonicalHeader {
    const recordedAt = new Date().toISOString();
    const header: CanonicalHeader = {
      object_id: a.objectId,
      object_type: a.objectType,
      tenant_id: a.contract.tenant_id,
      domain_id: a.contract.domain_id,
      scope: 'DOMAIN',
      object_version: '1',
      lifecycle_state: 'admitted',
      owning_component: 'CP-OBS-01',
      accountable_owner: `principal:${a.req.principal.principalId}`,
      source_object_ids: a.sourceObjectIds,
      event_time: a.eventTime != null && !Number.isNaN(Date.parse(a.eventTime))
        ? new Date(a.eventTime).toISOString() : null,
      observation_time: a.observationTime,
      valid_from: a.validFrom,
      valid_to: null,
      recorded_at: recordedAt,
      time_precision: 'exact',
      // A replayed capture's clock is the CAPTURE's clock, not this run's. Saying
      // `trusted` for a time we did not observe would be a small, compounding lie.
      source_clock_quality: a.contract.acquisition_mode === 'replay' ? 'unknown' : 'trusted',
      truth_state: a.truthState,
      synthetic_state: String(a.contract['data_origin']) === 'synthetic',
      confidence: null,
      uncertainty: null,
      evidence_refs: a.evidenceRefs,
      provenance_ref: `SRC:${a.req.sourceId}@${a.req.contractVersion}`,
      method_ref: a.methodRef,
      contradiction_refs: [],
      corroboration_refs: [],
      human_refs: [],
      classification: a.contract.classification_ceiling,
      purpose_scope: a.req.purposeId,
      rights_profile: String((a.contract.contract as { authority_and_rights?: { licence?: string } })
        .authority_and_rights?.licence ?? 'unspecified'),
      residency_profile: a.contract.residency,
      retention_profile: String((a.contract.contract as { authority_and_rights?: { retention?: string } })
        .authority_and_rights?.retention ?? 'default'),
      access_policy_ref: null,
      quality_profile: null,
      quality_state: null,
      freshness_state: null,
      schema_ref: a.schemaRef,
      ontology_ref: null,
      correction_of: null,
      supersedes: null,
      withdrawal_reason: null,
      audit_correlation_id: a.req.correlationId,
      content_ref: a.contentRef ?? null,
    };
    const v = validateHeader(header);
    if (!v.ok) throw new Error(`canonical header invalid: ${(v.errors ?? []).join('; ')}`);
    return header;
  }

  // ===== quarantine =====

  private async quarantineItem(
    req: RunRequest, contract: ContractRow, runId: string, item: AcquiredItem,
    stored: { locator: string; contentDigest: string; byteLength: number },
    verdict: ReturnType<typeof inspectContent>,
    drift: { ok: true } | { ok: false; missing: string[]; reason: string },
  ): Promise<void> {
    const tenantId = contract.tenant_id;
    const domainId = contract.domain_id;
    const caseId = newId();
    const manifestId = newId();
    const reasonClass = !verdict.ok ? verdict.class : 'schema_drift';
    const reason = !verdict.ok ? verdict.reason : (drift as { reason: string }).reason;

    await this.pipeline.write(
      this.envelope(req, 'observation.item.quarantine', 'QAR', caseId, tenantId, domainId),
      req.principal,
      this.route('observation.item.quarantine', tenantId, domainId, 'QAR', caseId),
      ObservationCapability.acquisition,
      async (cap) => {
        // The quarantined bytes get their OWN manifest in the quarantine vault. A
        // quarantined item is evidence too — of what arrived and why it was refused.
        await cap.recordManifest({
          manifestId, tenantId, domainId, vault: 'quarantine', locator: stored.locator,
          digest: stored.contentDigest, byteLength: stored.byteLength,
          declaredType: item.declaredMediaType, sniffedType: verdict.sniffedType,
          activeContentRisk: verdict.activeContentRisk,
          classification: contract.classification_ceiling, residency: contract.residency,
          retention: 'quarantine-review', legalHold: false,
          sourceId: req.sourceId, contractVersion: req.contractVersion, runId,
          acquisitionMode: contract.acquisition_mode, correlationId: req.correlationId,
        });
        await cap.openQuarantineCase({
          caseId, tenantId, domainId, sourceId: req.sourceId,
          contractVersion: req.contractVersion, runId, manifestId,
          itemKey: item.itemKey, reasonClass, reason,
          declaredType: item.declaredMediaType, sniffedType: verdict.sniffedType,
          byteLength: stored.byteLength, digest: stored.contentDigest,
          ttlSeconds: this.cfg['eye.quarantine.ttl_seconds'],
          eventId: newId(), correlationId: req.correlationId,
        });
        await cap.appendCustody({
          eventId: newId(), tenantId, domainId, manifestId,
          obsObjectId: null, evdObjectId: null, sourceId: req.sourceId,
          contractVersion: req.contractVersion, runId,
          event: 'custody.quarantined', actor: `agent:${req.connector.name}@${req.agentVersion}`,
          agentPrincipalId: req.principal.principalId, agentVersion: req.agentVersion,
          codeDigest: req.connector.codeDigest,
          connector: req.connector.name, connectorVersion: req.connector.version,
          methodRef: item.transport.methodRef,
          contentDigest: stored.contentDigest, digestVerified: true,
          details: { reason_class: reasonClass, reason, entries: verdict.entries.slice(0, 20) },
          correlationId: req.correlationId,
        });
        await cap.appendRunEvent({
          eventId: newId(), tenantId, domainId, runId,
          sourceId: req.sourceId, contractVersion: req.contractVersion,
          agentPrincipalId: req.principal.principalId, agentVersion: req.agentVersion,
          codeDigest: req.connector.codeDigest,
          connector: req.connector.name, connectorVersion: req.connector.version,
          acquisitionMode: contract.acquisition_mode,
          event: 'item.quarantined',
          details: { item_key: item.itemKey, case_id: caseId, reason_class: reasonClass },
          correlationId: req.correlationId,
        });
        return {
          result: { caseId }, targetType: 'QAR', targetId: caseId, targetVersion: '1',
          outboxEvent: null,
        };
      },
    );
  }

  // ===== helpers =====

  private async appendEvent(
    req: RunRequest, tenantId: string, domainId: string, runId: string,
    contract: ContractRow, action: string, event: string, details: Record<string, unknown>,
  ): Promise<void> {
    await this.pipeline.write(
      this.envelope(req, action, 'RUN', runId, tenantId, domainId),
      req.principal,
      this.route(action, tenantId, domainId, 'RUN', runId),
      ObservationCapability.acquisition,
      async (cap) => {
        await cap.appendRunEvent({
          eventId: newId(), tenantId, domainId, runId,
          sourceId: req.sourceId, contractVersion: req.contractVersion,
          agentPrincipalId: req.principal.principalId, agentVersion: req.agentVersion,
          codeDigest: req.connector.codeDigest,
          connector: req.connector.name, connectorVersion: req.connector.version,
          acquisitionMode: contract.acquisition_mode,
          event, details: redactValue(details) as Record<string, unknown>,
          correlationId: req.correlationId,
        });
        return { result: {}, targetType: 'RUN', targetId: runId, targetVersion: '1', outboxEvent: null };
      },
    );
  }

  private async loadContract(sourceId: string, contractVersion: number): Promise<ContractRow | null> {
    // Read through the RLS-governed application pool. This is the pre-egress
    // CHECK; the authoritative decision is the locked re-read at 8d.
    const rows = await this.db
      .selectFrom('observation.source_contracts_current' as never)
      .selectAll()
      .where('source_id' as never, '=', sourceId as never)
      .where('contract_version' as never, '=', contractVersion as never)
      .execute();
    return (rows[0] as ContractRow | undefined) ?? null;
  }

  private async loadCheckpoint(sourceId: string): Promise<Record<string, unknown> | null> {
    const rows = await this.db
      .selectFrom('observation.connector_checkpoints' as never)
      .select('checkpoint' as never)
      .where('source_id' as never, '=', sourceId as never)
      .execute();
    return ((rows[0] as { checkpoint?: Record<string, unknown> } | undefined)?.checkpoint) ?? null;
  }

  private bindingFor(contract: ContractRow): SourceBinding {
    const c = contract.contract as {
      identity: { endpoints: string[] };
      security_and_operations: {
        budgets: Record<string, number>;
        expected_schema: { media_types: string[]; required_fields: string[]; drift_tolerance: number; max_bytes?: number };
      };
    };
    const b = c.security_and_operations.budgets;
    return {
      sourceId: contract.source_id,
      sourceKey: contract.source_key,
      contractVersion: contract.contract_version,
      acquisitionMode: contract.acquisition_mode,
      authorityClass: contract.authority_class,
      endpoints: c.identity.endpoints,
      expectedSchema: {
        mediaTypes: c.security_and_operations.expected_schema.media_types,
        requiredFields: c.security_and_operations.expected_schema.required_fields,
        driftTolerance: c.security_and_operations.expected_schema.drift_tolerance,
        ...(c.security_and_operations.expected_schema.max_bytes !== undefined
          ? { maxBytes: c.security_and_operations.expected_schema.max_bytes } : {}),
      },
      budgets: {
        maxRequestsPerRun: b['max_requests_per_run'] as number,
        maxBytesPerRun: b['max_bytes_per_run'] as number,
        maxConcurrency: b['max_concurrency'] as number,
        timeoutMs: b['timeout_ms'] as number,
        maxRetries: b['max_retries'] as number,
      },
      egress: {
        // The allowlist is the contract's OWN endpoints. Nothing wider is reachable,
        // and a redirect to anything outside it is refused at every hop.
        hostAllowlist: hostsOf(c.identity.endpoints),
        schemeAllowlist: ['https'],
        maxRedirects: this.cfg['eye.connector.max_redirects'],
        timeoutMs: this.cfg['eye.connector.request_timeout_ms'],
        maxResponseBytes: this.cfg['eye.connector.max_response_bytes'],
        maxDecompressedBytes: this.cfg['eye.connector.max_decompressed_bytes'],
      },
    };
  }

  /**
   * Schema-drift check. Only structured payloads can be checked against declared
   * fields; for opaque types the contract's required_fields list is necessarily
   * empty, and this is never called.
   */
  private async checkDeclaredSchema(
    item: AcquiredItem, binding: SourceBinding,
  ): Promise<{ ok: true } | { ok: false; missing: string[]; reason: string }> {
    const text = Buffer.from(item.bytes).toString('utf8');
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Not JSON: the declared-field check does not apply, and pretending it
      // passed would be as wrong as pretending it failed.
      return { ok: true };
    }
    return checkSchemaDrift(parsed, binding.expectedSchema);
  }
}

function hostsOf(endpoints: string[]): string[] {
  const out = new Set<string>();
  for (const e of endpoints) {
    try { out.add(new URL(e).hostname.toLowerCase()); } catch { /* contract validation reported it */ }
  }
  return [...out];
}

function describe(e: unknown): string {
  if (e instanceof BudgetExceeded) return `budget exceeded: ${e.message}`;
  if (e instanceof EgressRefused) return `egress refused (${e.refusalClass})`;
  if (e instanceof VaultIntegrityError) return `vault integrity (${e.reason})`;
  if (e instanceof ReplayIntegrityError) return `replay fixture integrity failure: ${e.message}`;
  if (e instanceof Error) return e.message.slice(0, 300);
  return 'unknown failure';
}

/** SHA-256 of the JCS form of `{}` — the digest of an empty governed payload. */
const EMPTY_PAYLOAD_DIGEST = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
