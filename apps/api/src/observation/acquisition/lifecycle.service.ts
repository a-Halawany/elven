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
import { ObservationCapability, type AcquisitionWrites , type HeldEvidenceRow } from '../observation.capabilities.js';
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
  /** Who or what opened the run: an operator (with the principal) or the scheduler (with the job). Recorded on run.started. */
  trigger?: { kind: 'scheduler' | 'operator'; by?: string; jobId?: string };
  /** Called the moment run.started is COMMITTED, so a caller that meets an execution fault later still knows which run it belongs to. */
  onOpened?: (runId: string) => void;
  /**
   * Extend the run's authority on the strength of its progress (migration 0057). Called
   * after every committed page checkpoint; resolves to the new expiry, or null when the
   * extension was refused. Absent for an operator-triggered run, which runs under the
   * operator's own session.
   */
  extendAuthority?: () => Promise<Date | null>;
}

/** What the admission transaction actually committed for one item. */
type AdmissionResult =
  | { kind: 'admitted'; evdObjectId: string }
  | { kind: 'noop'; heldEvdObjectId?: string }
  /**
   * A DIFFERENT evidence object already holds this item key with different bytes —
   * another run admitted it between this run's prior-evidence read and this commit.
   * Nothing was written. The caller re-reads what is held and admits once, correctly.
   */
  | { kind: 'conflict'; heldEvdObjectId: string; heldObjectVersion: number; heldDigest: string; heldRunId: string | null };

export interface RunOutcome {
  runId: string;
  state: 'finished' | 'failed' | 'cancelled' | 'budget_exceeded' | 'refused';
  admitted: number;
  quarantined: number;
  noop: number;
  reason?: string;
  /** FALSE when nothing was persisted: the run id was allocated but no run.started exists. */
  opened?: boolean;
  /**
   * A NAMED refusal, when the product declined to open the run at all. Today the one
   * class is `source_run_in_flight` — another attempt on this source is running — and it
   * carries who holds the source, so the controller can say so rather than answering
   * with a generic failure (SOURCE_INTEGRATION_STATUS.md §9.6.1).
   */
  refusalClass?: 'source_run_in_flight';
  refusalDetail?: Record<string, unknown>;
}

/**
 * The source is already being collected.
 *
 * Raised by the database's own lease (migration 0051), so it is the answer to an
 * operator trigger, a scheduler tick and anything written later alike — not a check
 * one caller performs and another forgets. `eye.connector.per_source_concurrency` is a
 * BullMQ worker setting and could never have served for this.
 */
export class SourceRunInFlight extends Error {
  readonly refusalClass = 'source_run_in_flight' as const;
  constructor(readonly holder: {
    holderRunId: string; holderTrigger: string; holderContractVersion: number;
    acquiredAt: string; heartbeatAt: string; expiresAt: string;
  }) {
    super(
      `collection refused: a ${holder.holderTrigger}-triggered run for this source is already in flight `
      + `(run ${holder.holderRunId}, contract version ${holder.holderContractVersion}, started ${holder.acquiredAt}, `
      + `last reported ${holder.heartbeatAt}). One attempt per source at a time; nothing was collected twice.`);
    this.name = 'SourceRunInFlight';
  }
}



/** The latest evidence held for an item or poll key — what a re-run compares against — and what must be true before it is reused. */
interface PriorEvidence {
  evdObjectId: string; objectVersion: number; contentDigest: string; obsObjectId: string;
  lifecycleState: string; manifestId: string | null; locator: string | null; vault: string | null;
  manifestPresent: boolean; tombstoned: boolean;
}
/** Availability of held evidence, established before reuse: verified, or the reason it cannot be reused. */
type Availability = 'verified' | 'withdrawn' | 'governed-deleted' | 'no-manifest' | 'integrity';

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

  private route(
    action: string, tenantId: string, domainId: string, objectType: string, objectId: string | null,
    writableTargets?: string[],
  ): RouteInfo {
    return {
      scope: 'DOMAIN', tenantId, domainId, action, objectType, objectId,
      ...(writableTargets !== undefined ? { writableTargets } : {}),
    };
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
    const contract = await this.loadContract(req, null, null, req.contractVersion);
    if (contract === null) {
      return { runId, state: 'failed', admitted: 0, quarantined: 0, noop: 0, reason: 'no such source contract version', opened: false };
    }
    const { tenant_id: tenantId, domain_id: domainId } = contract;
    const scope = { tenantId, domainId };
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
          /*
           * ── 0051 · ONE ATTEMPT PER SOURCE, CLAIMED BEFORE ANYTHING IS COLLECTED ──
           *
           * The lease is taken in the SAME transaction as run.started, so a run either
           * holds the source and exists, or holds neither. A refusal here has written
           * nothing at all: no run row, no evidence, no request to the publisher.
           *
           * The database refuses `run.started` without the lease (migration 0051 §2),
           * so this call is how a caller ASKS rather than the check that enforces it —
           * an important difference, because a caller can forget to ask.
           */
          const lease = await cap.acquireSourceRunLease({
            tenantId, domainId, sourceId: req.sourceId, contractVersion: req.contractVersion,
            runId, trigger: req.trigger?.kind ?? 'operator',
            leaseSeconds: this.cfg['eye.connector.run_lease_seconds'], correlationId: req.correlationId,
          });
          if (!lease.granted) throw new SourceRunInFlight(lease);
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
            details: { agent_id: req.agentId, budgets: agent.budgets, owner: agent.owner_principal_id,
                       trigger: req.trigger ?? { kind: 'operator' },
                       // A source taken over from a run that stopped reporting is NOT the
                       // same fact as a source that was free. The record says which happened.
                       lease: { held_for_seconds: this.cfg['eye.connector.run_lease_seconds'],
                                ...(lease.granted && lease.tookOverFrom !== null
                                    ? { took_over_from_run: lease.tookOverFrom,
                                        note: 'the previous run stopped reporting for longer than the lease and its lease had expired' }
                                    : {}) } },
            correlationId: req.correlationId,
          });
          fault.at('f06.at_run_start_commit');
          return { result: { runId }, targetType: 'RUN', targetId: runId, targetVersion: '1', outboxEvent: null };
        },
      );
    } catch (e) {
      // Nothing was persisted: the transaction carried POL, AUD and run.started
      // together, so there is no half-started run to reconcile. A GOVERNANCE answer
      // (a refused grant, a contract no longer active) is reported as a failed, unopened
      // run; an INFRASTRUCTURE fault (a lost connection, an exhausted server) is not an
      // answer at all and propagates, so a scheduled caller records a fault and retries.
      if (isInfrastructureFault(e)) throw e;
      /*
       * A SOURCE ALREADY BEING COLLECTED IS ITS OWN ANSWER, not a failure. It is
       * reported with its class and the holder named, so an operator route can answer
       * 409 with who holds the source and a scheduled tick can record a refused attempt
       * instead of silently double-collecting (§9.6.1).
       */
      if (e instanceof SourceRunInFlight) {
        return {
          runId, state: 'refused', admitted: 0, quarantined: 0, noop: 0,
          reason: e.message, opened: false,
          refusalClass: e.refusalClass, refusalDetail: e.holder,
        };
      }
      return { runId, state: 'failed', admitted: 0, quarantined: 0, noop: 0, reason: describe(e), opened: false };
    }
    req.onOpened?.(runId);

    /*
     * A RUN THAT ESCAPES STILL ENDS.
     *
     * The run now holds the source's lease (0051 §1), and the lease is released by the
     * TERMINAL run event. Every path that RETURNS an outcome appends one. An exception
     * that ESCAPES this method — a process modelled as dying at `f07`, or a failure of
     * the error handling itself — used to append nothing: before the lease that left a
     * run row 'started' for the sweeper, and with the lease it would hold the source
     * until the lease expired.
     *
     * So an escaping exception records `run.failed` (which releases the source) and is
     * then RETHROWN UNCHANGED. The caller still observes a crash and no outcome, which
     * is the honest representation of a process that died; what changes is that the run
     * says how it ended and the next attempt is not blocked by it.
     */
    try {
      fault.at('f07.after_run_start_commit');
      return await this.walk(req, runId, contract, tenantId, domainId, scope, agentPrincipalId, codeDigest);
    } catch (e) {
      await this.appendEvent(
        req, tenantId, domainId, runId, contract, 'observation.run.finish', 'run.failed',
        { reason: describe(e), escaped: true,
          note: 'the run did not return: the exception escaped the lifecycle and the run is recorded failed so it holds nothing' },
      ).catch(() => undefined);
      throw e;
    }
  }

  /** The body of a run, from step 3 to the terminal event. Split out only so that an escaping exception has one place to be recorded. */
  private async walk(
    req: RunRequest, runId: string, contract: ContractRow, tenantId: string, domainId: string,
    scope: { tenantId: string; domainId: string }, agentPrincipalId: string, codeDigest: string,
  ): Promise<RunOutcome> {
    let admitted = 0;
    let quarantined = 0;
    let noop = 0;
    /** Bytes that became NEW stored evidence this run — distinct from bytes transferred. */
    let bytesStored = 0;

    try {
      // ── step 3: revalidate the exact contract version immediately before egress ──
      const stillActive = await this.loadContract(req, tenantId, domainId, req.contractVersion);
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
      const checkpoint = await this.loadCheckpoint(req, tenantId, domainId);
      const output = await req.connector.acquire({
        binding, checkpoint, budget: meter,
        replayRoot: this.cfg['eye.connector.replay_root'],
      });
      fault.at('f11.after_acquisition_before_open');

      // A framing parent (the raw feed response) is admitted first, so a child
      // fragment always has a parent that already exists.
      const queue: AcquiredItem[] = output.parent != null ? [output.parent, ...output.items] : output.items;
      const parentEvdByKey = new Map<string, string>();

      /*
       * WHAT IS ALREADY HELD FOR THE DETERMINISTIC ITEMS, read once per run.
       *
       * A backfill window re-run is the same window: identical bytes are an
       * audited no-op and changed bytes are a revision. The comparison needs the
       * latest evidence per item key, and one governed read for the whole batch
       * is the price of not admitting the same 2019 twice.
       */
      const prior = await this.loadPriorEvidence(
        req, tenantId, domainId, queue.filter((i) => i.deterministic === true).map((i) => i.itemKey));
      /*
       * WHAT IS ALREADY HELD FOR WHAT WAS POLLED. A forward poll's item key carries
       * the retrieval instant and never repeats; its POLL KEY (the endpoint, the
       * feed, the feed entry) does. Bytes equal to the latest evidence for the same
       * poll key are an audited confirmation — freshness-bearing, storing nothing
       * twice — never a second copy (SCHEDULED_COLLECTION.md §1.3).
       */
      //
      // LIVE ONLY. A replayed set is a frozen fixture: Phase 1's rule stands for it —
      // identical bytes retrieved again are a new observation (§5.12) — and a replay
      // confirms nothing about the publisher today (SCHEDULED_COLLECTION.md §5, 3).
      const live = contract.acquisition_mode === 'live';
      const priorByPoll = live
        ? await this.loadPriorByPollKeys(
            req, tenantId, domainId, [...new Set(queue.filter((i) => i.deterministic !== true && i.pollKey !== undefined).map((i) => i.pollKey as string))])
        : new Map<string, PriorEvidence>();
      /*
       * A QUARANTINED WINDOW IS NOT A COLLECTED WINDOW. The checkpoint the run
       * commits must not carry the backfill cursor past a window whose bytes were
       * refused, or the range looks complete with a hole in it. The earliest
       * quarantined window's cursor is where the next run resumes.
       */
      let rollbackTo: string | number | null = null;
      const earlier = (a: string | number, b: string | number): boolean =>
        typeof a === 'number' && typeof b === 'number' ? a < b : String(a) < String(b);

      /*
       * ── A CHECKPOINT PER COMPLETED PAGE, NOT ONE PER RUN ──────────────────────
       *
       * The backfill checkpoint used to be written once, at run end. A walk interrupted
       * after eight of nine pages therefore resumed from page one and re-walked
       * everything it had already admitted — the third cause of the 2,133 second copies
       * (§9.6.1). The connector now states, on each page's parent, the checkpoint that
       * becomes true once THAT page is committed; this persists it after the page's last
       * item commits, so a crash costs at most the page in progress.
       *
       * A QUARANTINED WINDOW IS STILL NOT A COLLECTED WINDOW. A page with anything
       * quarantined in it is not checkpointed here at all: run end applies the rollback
       * and writes the honest cursor.
       */
      let pendingPage: { checkpoint: Record<string, unknown>; quarantined: boolean } | null = null;

      for (const item of queue) {
        if (item.checkpointAfter !== undefined) {
          if (pendingPage !== null && !pendingPage.quarantined) {
            await this.appendPageCheckpoint(req, tenantId, domainId, runId, contract, pendingPage.checkpoint);
          }
          pendingPage = { checkpoint: item.checkpointAfter, quarantined: false };
        }
        await this.appendEvent(req, tenantId, domainId, runId, contract, 'observation.run.checkpoint', 'item.fetched', {
          item_key: item.itemKey, bytes: item.bytes.byteLength,
          transport: redactValue(item.transport),
        });

        let result = await this.admitOrQuarantine(
          req, contract, runId, item, binding,
          item.parentItemKey != null ? parentEvdByKey.get(item.parentItemKey) ?? null : null,
          item.deterministic === true ? prior.get(item.itemKey) ?? null : null,
          item.deterministic !== true && item.pollKey !== undefined ? priorByPoll.get(item.pollKey) ?? null : null,
        );
        /*
         * A CONFLICT IS RE-READ, NOT RE-TRIED BLINDLY. Another run admitted this item
         * key while this page was walked, so the prior evidence this run read before the
         * walk is stale. The register is authoritative; the key is re-read from it and
         * the item admitted ONCE against what is actually held — as a revision when the
         * bytes differ, as a no-op when they do not.
         *
         * With the per-source lease of §1 in place two runs cannot overlap on one source
         * at all, so this path is defence in depth. A conflict that survives the re-read
         * is not a race any more; it fails the run loudly rather than dropping an item.
         */
        if (result.kind === 'conflict') {
          const fresh = await this.loadPriorEvidence(req, tenantId, domainId, [item.itemKey]);
          result = await this.admitOrQuarantine(
            req, contract, runId, item, binding,
            item.parentItemKey != null ? parentEvdByKey.get(item.parentItemKey) ?? null : null,
            fresh.get(item.itemKey) ?? null, null,
          );
          if (result.kind === 'conflict') {
            throw new Error(
              `admission conflict for item key ${item.itemKey}: it is held by evidence `
              + `${result.heldEvdObjectId}@${result.heldObjectVersion} (run ${result.heldRunId ?? 'unknown'}) `
              + 'and could not be resolved by re-reading. Nothing was admitted twice.');
          }
        }
        if (result.kind === 'admitted') {
          admitted += 1;
          bytesStored += item.bytes.byteLength;
          parentEvdByKey.set(item.itemKey, result.evdObjectId);
        } else if (result.kind === 'noop') {
          // A parent confirmed unchanged is STILL the parent: a child that has to be
          // admitted under it (its own evidence gone) links to the held parent's evidence.
          if (result.evdObjectId !== undefined) parentEvdByKey.set(item.itemKey, result.evdObjectId);
          noop += 1;
        } else if (result.kind === 'quarantined') {
          quarantined += 1;
          if (pendingPage !== null) pendingPage.quarantined = true;
          if (item.backfillCursor !== undefined && (rollbackTo === null || earlier(item.backfillCursor, rollbackTo))) {
            rollbackTo = item.backfillCursor;
          }
        }
      }
      // The LAST page's checkpoint is not written here: step 9 below writes the run's
      // checkpoint, with the quarantine rollback applied, and that is the same cursor.


      /*
       * NOT MODIFIED (HTTP 304): the publisher said what is held is still current, and
       * sent nothing. That is a live confirmation of the held evidence — when the held
       * evidence is still available and intact. Otherwise it is recorded as an unbound
       * not-modified answer: audited, but confirming nothing.
       */
      for (const rv of live ? output.revalidated ?? [] : []) {
        // A 304 confirms EXACTLY the representation whose validator the request carried —
        // the ETag sent as If-None-Match, else the Last-Modified sent as If-Modified-Since —
        // which is not necessarily the newest held (a checkpoint that lags what was admitted
        // sends an older validator). The held evidence is therefore looked up BY THAT
        // VALIDATOR in its retained transport headers; when none carries it, or the
        // request carried none, the answer is recorded unbound and confirms nothing.
        const validator = { etag: rv.validators?.etag ?? null, lastModified: rv.validators?.etag !== undefined ? null : rv.validators?.lastModified ?? null };
        const held = await this.loadHeldByValidator(req, tenantId, domainId, rv.pollKey, validator);
        const availability = held === null ? null : await this.availabilityOf(scope, held);
        const sent = { ...(rv.validators?.etag !== undefined ? { etag: rv.validators.etag } : {}), ...(rv.validators?.lastModified !== undefined ? { last_modified: rv.validators.lastModified } : {}) };
        if (held !== null && availability === 'verified') {
          await this.appendEvent(req, tenantId, domainId, runId, contract, 'observation.run.checkpoint', 'item.noop', {
            item_key: null, poll_key: rv.pollKey, unchanged: true, bound: true, revalidated: 'http-304', validator: sent,
            evd_object_id: held.evdObjectId, evd_version: held.objectVersion, digest: held.contentDigest, bytes: 0,
            availability, reason: 'the publisher answered not-modified to the validator of this held evidence, which is available and intact',
          });
          noop += 1;
        } else {
          // Recorded on the run as a no-op that confirms NOTHING (`unchanged: false`,
          // `bound: false`): audited, counted by nobody as freshness.
          await this.appendEvent(req, tenantId, domainId, runId, contract, 'observation.run.checkpoint', 'item.noop', {
            item_key: null, poll_key: rv.pollKey, endpoint: rv.endpoint, status: rv.status, revalidated: 'http-304', validator: sent,
            unchanged: false, bound: false,
            held_evd_object_id: held?.evdObjectId ?? null, availability: availability ?? 'none-held',
            reason: Object.keys(sent).length === 0 ? 'not-modified to a request that carried no validator: no confirmation'
              : held === null ? 'not-modified, but no held evidence carries the validator the publisher confirmed: no confirmation'
              : `not-modified to the validator of held evidence that is ${availability}: no confirmation`,
          });
        }
      }

      // ── step 9: advance the checkpoint ONLY after the DB commits ────────────
      if (rollbackTo !== null && typeof output.checkpoint['backfill'] === 'object' && output.checkpoint['backfill'] !== null) {
        const bf = output.checkpoint['backfill'] as Record<string, unknown>;
        output.checkpoint['backfill'] = {
          ...bf, cursor: rollbackTo, done: false, finishedAt: null,
          incomplete: `a window starting at ${String(rollbackTo)} was quarantined; the cursor was rolled back to it`,
        };
      }
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
        // Transfer and storage, measured separately: a confirmed-unchanged poll transfers and stores nothing new.
        bytes_transferred: output.bytesTransferred, bytes_stored: bytesStored,
      });
      return { runId, state: 'finished', admitted, quarantined, noop };
    } catch (e) {
      // A BUDGET breach is its own terminal state and escalates (§11); everything
      // else is a failure. Either way the run gets a terminal event, so the
      // sweeper has nothing to reconcile.
      const budget = e instanceof BudgetExceeded;
      let reason = describe(e);
      /*
       * A TERMINAL EVENT THAT CANNOT BE WRITTEN IS SAID, NOT SWALLOWED (0057). When the
       * run's authority has lapsed, the terminal append is refused for the same reason
       * the walk failed; the run projection then stays `started` until the sweeper
       * reconciles it and the source lease releases at its expiry. The outcome the
       * caller records (the scheduled attempt, the operator's answer) says so.
       */
      const terminal = await this.appendEvent(
        req, tenantId, domainId, runId, contract,
        budget ? 'observation.run.finish' : 'observation.run.finish',
        budget ? 'run.budget_exceeded' : 'run.failed',
        { reason, admitted, quarantined, noop },
      ).then(() => null, (err: unknown) => describe(err));
      if (terminal !== null) {
        reason = `${reason} (terminal event NOT recorded: ${terminal}; the run stays 'started' until the sweeper reconciles it and the source lease releases at its expiry)`;
        this.log.warn(`run ${runId}: ${reason}`);
      }
      return {
        runId, state: budget ? 'budget_exceeded' : 'failed',
        admitted, quarantined, noop, reason,
      };
    }
  }

  /**
   * Commit the checkpoint a COMPLETED PAGE earned, mid-run.
   *
   * The same governed act as step 9 — the checkpoint port and a `run.checkpointed`
   * event, in one transaction under `observation.run.checkpoint` — made once per page
   * instead of once per run. It is marked `page: true` so a reader can tell a page
   * checkpoint from the run's final one, and it never advances past a page that
   * quarantined anything (the caller does not call it for such a page).
   */
  private async appendPageCheckpoint(
    req: RunRequest, tenantId: string, domainId: string, runId: string,
    contract: ContractRow, checkpoint: Record<string, unknown>,
  ): Promise<void> {
    await this.pipeline.write(
      this.envelope(req, 'observation.run.checkpoint', 'RUN', runId, tenantId, domainId),
      req.principal,
      this.route('observation.run.checkpoint', tenantId, domainId, 'RUN', runId),
      ObservationCapability.acquisition,
      async (cap) => {
        await cap.appendCheckpoint({
          eventId: newId(), tenantId, domainId, sourceId: req.sourceId,
          contractVersion: req.contractVersion, runId,
          checkpoint, correlationId: req.correlationId,
        });
        await cap.appendRunEvent({
          eventId: newId(), tenantId, domainId, runId,
          sourceId: req.sourceId, contractVersion: req.contractVersion,
          agentPrincipalId: req.principal.principalId, agentVersion: req.agentVersion,
          codeDigest: req.connector.codeDigest,
          connector: req.connector.name, connectorVersion: req.connector.version,
          acquisitionMode: contract.acquisition_mode,
          event: 'run.checkpointed',
          details: { page: true, checkpoint: redactValue(checkpoint) },
          correlationId: req.correlationId,
        });
        return { result: {}, targetType: 'RUN', targetId: runId, targetVersion: '1', outboxEvent: null };
      },
    );
    /*
     * PROGRESS EXTENDS AUTHORITY (0057). The demonstration's chokepoints walk of
     * 2026-09-10 outlived its run session's fixed 15-minute expiry and every admission
     * after 23:32:31 was refused as "authority insufficient" — recorded then as a stall.
     * A committed page is progress; it moves the session's expiry forward, so a run keeps
     * its authority exactly as long as it keeps walking. A refused extension is reported
     * and the run goes on until its authority lapses, which then fails it honestly.
     */
    if (req.extendAuthority !== undefined) {
      const until = await req.extendAuthority();
      if (until === null) this.log.warn(`run ${runId}: the run session could not be extended after a page checkpoint (the grant no longer verifies); the run continues on its remaining authority`);
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
    /** What is already held for this deterministic item key, if anything. */
    prior: PriorEvidence | null = null,
    /** What is already held for what this forward poll polled (its poll key), if anything. */
    heldForPoll: PriorEvidence | null = null,
  ): Promise<{ kind: 'admitted'; evdObjectId: string } | { kind: 'quarantined' } | { kind: 'noop'; evdObjectId?: string }
             | { kind: 'conflict'; heldEvdObjectId: string; heldObjectVersion: number; heldDigest: string; heldRunId: string | null }> {
    const tenantId = contract.tenant_id;
    const domainId = contract.domain_id;
    const scope = { tenantId, domainId };

    // ── steps 5 + 6: store the exact original bytes, fsync, re-read, compare ──
    const stored = await this.vault.store('quarantine', scope, item.bytes);

    /*
     * BEFORE ANYTHING HELD IS REUSED, ITS AVAILABILITY IS ESTABLISHED. Held evidence
     * whose latest version is withdrawn, whose bytes were governed-deleted, whose
     * manifest is gone, or whose bytes no longer verify is NOT something a poll can be
     * "confirmed" against: the incoming bytes are admitted as NEW evidence, the run
     * says what it could not reuse, and the deletion or withdrawal stands untouched.
     */
    let heldUnavailable: { evdObjectId: string; objectVersion: number; reason: Availability } | null = null;
    if (prior !== null) {
      const a = await this.availabilityOf(scope, prior);
      if (a !== 'verified') { heldUnavailable = { evdObjectId: prior.evdObjectId, objectVersion: prior.objectVersion, reason: a }; prior = null; }
    }
    if (heldForPoll !== null) {
      const a = await this.availabilityOf(scope, heldForPoll);
      if (a !== 'verified') { heldUnavailable = heldUnavailable ?? { evdObjectId: heldForPoll.evdObjectId, objectVersion: heldForPoll.objectVersion, reason: a }; heldForPoll = null; }
    }

    /*
     * A WINDOW ALREADY HELD, BYTE FOR BYTE, IS NOT NEW EVIDENCE.
     *
     * The Phase 1 rule — identical bytes retrieved later are a new observation —
     * is about a forward poll, whose item is the retrieval. A backfill item is the
     * window, and retrieving 2019-01 again with the same digest is the same
     * observation of the same window. It no-ops, AUDITED, and the quarantine copy
     * is tombstoned. Changed bytes fall through and become a revision below.
     */
    if (prior !== null && prior.contentDigest === stored.contentDigest) {
      await this.appendEvent(req, tenantId, domainId, runId, contract, 'observation.run.checkpoint', 'item.noop', {
        item_key: item.itemKey, evd_object_id: prior.evdObjectId, evd_version: prior.objectVersion,
        digest: stored.contentDigest, availability: 'verified',
        reason: 'identical bytes for a window already held; a backfill re-run admits nothing twice',
      });
      await this.vault.tombstone('quarantine', scope, stored.locator).catch(() => undefined);
      return { kind: 'noop', evdObjectId: prior.evdObjectId };
    }

    /*
     * A FORWARD POLL THAT RETURNED EXACTLY WHAT IS HELD is a confirmation, not new
     * evidence. The run records it — which evidence was confirmed, its digest, the
     * instant — so the poll is audited and freshness advances; the bytes were
     * transferred, are not stored a second time, and the quarantine copy is
     * tombstoned. Different bytes for the same poll key fall through and are
     * admitted as a new observation that names what it changed from.
     */
    if (heldForPoll !== null && heldForPoll.contentDigest === stored.contentDigest) {
      await this.appendEvent(req, tenantId, domainId, runId, contract, 'observation.run.checkpoint', 'item.noop', {
        item_key: item.itemKey, poll_key: item.pollKey ?? null, unchanged: true,
        evd_object_id: heldForPoll.evdObjectId, evd_version: heldForPoll.objectVersion,
        digest: stored.contentDigest, bytes: item.bytes.byteLength, availability: 'verified',
        reason: 'identical bytes to the evidence already held for this poll; confirmed, not stored again',
      });
      await this.vault.tombstone('quarantine', scope, stored.locator).catch(() => undefined);
      return { kind: 'noop', evdObjectId: heldForPoll.evdObjectId };
    }
    const changedFrom = heldForPoll !== null && heldForPoll.contentDigest !== stored.contentDigest ? heldForPoll : null;

    // ── step 7: bounded validation and safety scanning ──────────────────────
    const verdict = inspectContent(item.bytes, {
      declaredType: item.declaredMediaType,
      filename: item.filename,
    });
    let drift: { ok: true } | { ok: false; missing: string[]; reason: string } = { ok: true };
    if (verdict.ok && binding.expectedSchema.requiredFields.length > 0) {
      // A framed CHILD is checked against the element-relative field list; an
      // unframed payload is checked as a whole. The parent of a framed response
      // is not re-checked: its rows are checked individually, and failing the
      // parent for one bad row would quarantine the evidence of the good ones.
      const isFramedParent = binding.expectedSchema.itemPath !== undefined && item.fragment == null;
      if (!isFramedParent) drift = await this.checkDeclaredSchema(item, binding);
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
    // A REVISION is the next VERSION of the evidence object already held for this
    // window, never a second object: the prior bytes stay retrievable at their
    // version, and a known-at read positioned before this run still sees them.
    const revisionOf = prior;
    const evdObjectId = revisionOf !== null ? revisionOf.evdObjectId : newId();
    const evdVersion = revisionOf !== null ? revisionOf.objectVersion + 1 : 1;
    const manifestId = newId();
    const observedAt = new Date().toISOString();

    // ── steps 8c–8e + 12: ONE short transaction ─────────────────────────────
    // The result is what the transaction COMMITTED, not what the closure believed
    // it was doing: an admission and an audited no-op are distinguished by the
    // record that survived, never by a variable the handler set on the way past.
    const committed = await this.pipeline.write<AdmissionResult, AcquisitionWrites>(
      this.envelope(req, 'observation.item.admit', 'EVD', evdObjectId, tenantId, domainId),
      req.principal,
      // The two objects this admission writes, declared UP FRONT. Both ids were
      // generated before the capability is minted, so the capability names
      // exactly what it will produce and nothing else is writable under it.
      this.route('observation.item.admit', tenantId, domainId, 'EVD', evdObjectId, [obsObjectId, evdObjectId]),
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
        /*
         * ── 0051 · IDEMPOTENCY ON (SOURCE, ITEM KEY), IN THIS TRANSACTION ─────────
         *
         * The attempt key above is (source, contract version, RUN, item key): it stops
         * this run admitting this item twice and nothing else. A crash-retry, a re-walk
         * after an interruption, or a concurrent walk carries a NEW run id and passes
         * straight through it — which is how 2,133 second copies were admitted on
         * 2026-09-10 (§9.6.1).
         *
         * What must not happen twice is an ADMISSION OF THE SAME CONTENT UNDER THE SAME
         * ITEM KEY. The register is claimed here, inside the admitting transaction, so
         * the comparison is against what is held AT COMMIT TIME rather than against a
         * read taken before the page was walked. `loadPriorEvidence` above still does
         * the reading that decides revision-versus-no-op for the ordinary case; this is
         * the boundary that holds when two runs read the same "nothing held".
         *
         * DETERMINISTIC ITEMS ONLY. A forward poll's item key carries its retrieval
         * instant and never repeats, and Phase 1's rule for it is the opposite one —
         * identical bytes at a later observation time ARE a new observation (§5.12).
         * Registering those would add a row per poll and change that rule; it does not.
         */
        if (item.deterministic === true) {
          const claimed = await cap.claimItemAdmission({
            tenantId, domainId, sourceId: req.sourceId, itemKey: item.itemKey,
            contentDigest: candidate.contentDigest, evdObjectId, obsObjectId,
            objectVersion: evdVersion, contractVersion: req.contractVersion, runId,
            /*
             * WHAT IS HELD FOR THIS KEY WAS FOUND UNAVAILABLE — withdrawn, governed-
             * deleted, manifest gone, or bytes that no longer verify. That was
             * established above by READING, and it is why this admission exists at all:
             * Phase 1's rule is that such evidence is not something a later retrieval is
             * "confirmed" against. The register is told, so it records the fresh
             * admission instead of no-opping against something that is not there.
             */
            readmitUnavailable: heldUnavailable !== null,
          });
          if (claimed.outcome === 'noop') {
            // These exact bytes are already held under this key — by this run's own
            // earlier page, or by another run that committed while this page was walked.
            // AUDITED, never silent, and naming the evidence that already stands.
            await cap.appendRunEvent({
              eventId: newId(), tenantId, domainId, runId,
              sourceId: req.sourceId, contractVersion: req.contractVersion,
              agentPrincipalId: req.principal.principalId, agentVersion: req.agentVersion,
              codeDigest: req.connector.codeDigest,
              connector: req.connector.name, connectorVersion: req.connector.version,
              acquisitionMode: contract.acquisition_mode,
              event: 'item.noop',
              details: {
                item_key: item.itemKey, evd_object_id: claimed.evdObjectId,
                evd_version: claimed.objectVersion, digest: claimed.contentDigest,
                unchanged: true,
                held_by_run: claimed.runId, first_admitted_at: claimed.firstAdmittedAt,
                reason: 'these bytes are already held under this item key; a re-walk records a no-op, not a second copy',
              },
              correlationId: req.correlationId,
            });
            return {
              result: { kind: 'noop' as const, heldEvdObjectId: claimed.evdObjectId },
              targetType: 'RUN', targetId: runId, targetVersion: '1', outboxEvent: null,
            };
          }
          if (claimed.outcome === 'conflict') {
            // A DIFFERENT object holds this key, with different bytes. This run planned a
            // first admission (or the wrong next version) against evidence that has since
            // moved. Nothing is written and nothing is overwritten: the caller re-reads
            // what is held and admits once, as a revision of the object that stands.
            await cap.appendRunEvent({
              eventId: newId(), tenantId, domainId, runId,
              sourceId: req.sourceId, contractVersion: req.contractVersion,
              agentPrincipalId: req.principal.principalId, agentVersion: req.agentVersion,
              codeDigest: req.connector.codeDigest,
              connector: req.connector.name, connectorVersion: req.connector.version,
              acquisitionMode: contract.acquisition_mode,
              event: 'item.noop',
              details: {
                item_key: item.itemKey, conflict: true,
                held_evd_object_id: claimed.heldEvdObjectId, held_evd_version: claimed.heldObjectVersion,
                held_by_run: claimed.heldRunId, claimed_evd_object_id: claimed.claimedEvdObjectId,
                reason: 'another run admitted this item key while this page was walked; this admission was withdrawn and is retried against what is held',
              },
              correlationId: req.correlationId,
            });
            return {
              result: {
                kind: 'conflict' as const, heldEvdObjectId: claimed.heldEvdObjectId,
                heldObjectVersion: claimed.heldObjectVersion, heldDigest: claimed.heldDigest,
                heldRunId: claimed.heldRunId,
              },
              targetType: 'RUN', targetId: runId, targetVersion: '1', outboxEvent: null,
            };
          }
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
        await this.admitEvd(cap, req, contract, item, obsObjectId, evdObjectId, manifestId, candidate, verdict, parentEvdObjectId,
          evdVersion, revisionOf === null ? null : `${revisionOf.evdObjectId}@${revisionOf.objectVersion}`);
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
            ...(revisionOf === null ? {} : {
              revision: { from_version: revisionOf.objectVersion, to_version: evdVersion,
                          prior_digest: revisionOf.contentDigest } }),
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
          event: revisionOf === null ? 'item.admitted' : 'item.revised',
          details: { item_key: item.itemKey, poll_key: item.pollKey ?? null, evd_object_id: evdObjectId, digest: candidate.contentDigest,
                     ...(revisionOf === null ? {} : { evd_version: evdVersion, prior_digest: revisionOf.contentDigest }),
                     ...(changedFrom === null ? {} : { changed_from: { evd_object_id: changedFrom.evdObjectId, evd_version: changedFrom.objectVersion, digest: changedFrom.contentDigest } }),
                     ...(heldUnavailable === null ? {} : { held_unavailable: heldUnavailable }) },
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
          targetType: 'EVD', targetId: evdObjectId, targetVersion: String(evdVersion),
          outboxEvent: {
            eventType: 'ObservationRecorded',
            payload: { schema_version: 'v1',
              obs_object_id: obsObjectId, evd_object_id: evdObjectId,
              evd_version: evdVersion, revision: revisionOf !== null,
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

    if (committed.result.kind === 'noop' || committed.result.kind === 'conflict') {
      // The candidate was created before the replay, the already-held key or the
      // conflict was detected. It has no manifest row, so it is already unreachable;
      // removing it now saves the sweeper a round rather than being load-bearing.
      await this.vault.tombstone('evidence', scope, candidate.locator).catch(() => undefined);
      await this.vault.tombstone('quarantine', scope, stored.locator).catch(() => undefined);
      if (committed.result.kind === 'conflict') {
        return {
          kind: 'conflict', heldEvdObjectId: committed.result.heldEvdObjectId,
          heldObjectVersion: committed.result.heldObjectVersion,
          heldDigest: committed.result.heldDigest, heldRunId: committed.result.heldRunId,
        };
      }
      return committed.result.heldEvdObjectId === undefined
        ? { kind: 'noop' } : { kind: 'noop', evdObjectId: committed.result.heldEvdObjectId };
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
        return { result: {}, targetType: 'EVD', targetId: evdObjectId, targetVersion: String(evdVersion), outboxEvent: null };
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
    version = 1, supersedes: string | null = null,
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
      version, supersedes,
    });
    await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
  }

  private header(a: {
    objectId: string; objectType: string; contract: ContractRow; req: RunRequest;
    eventTime: string | null; observationTime: string; validFrom: string | null;
    truthState: string; methodRef: string; evidenceRefs: string[]; sourceObjectIds: string[];
    schemaRef: string; contentRef?: string; version?: number; supersedes?: string | null;
  }): CanonicalHeader {
    const recordedAt = new Date().toISOString();
    const header: CanonicalHeader = {
      object_id: a.objectId,
      object_type: a.objectType,
      tenant_id: a.contract.tenant_id,
      domain_id: a.contract.domain_id,
      scope: 'DOMAIN',
      object_version: String(a.version ?? 1),
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
      supersedes: a.supersedes ?? null,
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

  /**
   * Read the contract under the RUN's own authority.
   *
   * This is a CONSEQUENTIAL READ, not a convenience lookup: it goes through the
   * pipeline, so the policy decision and the audit event that permitted the agent
   * to see this contract are durable before the row is returned. That is also
   * what makes the §5 step 3 pre-egress revalidation visible in the audit trail
   * rather than being an unrecorded internal check.
   *
   * Reading through the ordinary application pool would return nothing here, and
   * correctly so: row-level security has no tenant to compare against outside a
   * governed context.
   */
  private async loadContract(
    req: RunRequest, tenantId: string | null, domainId: string | null, contractVersion: number,
  ): Promise<ContractRow | null> {
    // Before scope is known (the first load), fall back to the agent's own home
    // scope — an agent principal is always domain-bound.
    const t = tenantId ?? req.principal.homeTenantId;
    const d = domainId ?? req.principal.homeDomainId;
    if (t === null || d === null) return null;
    const out = await this.pipeline.consequentialRead(
      this.envelope(req, 'observation.read.sources', 'SRC', req.sourceId, t, d),
      req.principal,
      this.route('observation.read.sources', t, d, 'SRC', req.sourceId),
      ObservationCapability.read,
      async (cap) => (await cap
        .readSourceContracts()
        .selectAll()
        .where('source_id' as never, '=', req.sourceId as never)
        .where('contract_version' as never, '=', contractVersion as never)
        .executeTakeFirst()) as ContractRow | undefined,
    );
    return out.result ?? null;
  }

  private async loadPriorEvidence(
    req: RunRequest, tenantId: string, domainId: string, itemKeys: string[],
  ): Promise<Map<string, PriorEvidence>> {
    const out = new Map<string, PriorEvidence>();
    if (itemKeys.length === 0) return out;
    const got = await this.pipeline.consequentialRead(
      this.envelope(req, 'observation.read.evidence', 'EVD', null, tenantId, domainId),
      req.principal,
      this.route('observation.read.evidence', tenantId, domainId, 'EVD', null),
      ObservationCapability.read,
      async (cap) => cap.latestEvidenceByItemKeys({ sourceId: req.sourceId, itemKeys }),
    );
    for (const r of got.result) out.set(r.item_key, toPrior(r));
    return out;
  }

  /**
   * Is held evidence still something a poll may be confirmed against? Its latest
   * version not withdrawn; its manifest present and not governed-deleted; its bytes in
   * the vault verifying against the recorded digest. Established here, by reading —
   * never assumed from metadata.
   */
  private async availabilityOf(scope: { tenantId: string; domainId: string }, held: PriorEvidence): Promise<Availability> {
    if (held.lifecycleState === 'withdrawn') return 'withdrawn';
    if (held.tombstoned) return 'governed-deleted';
    if (!held.manifestPresent || held.manifestId === null || held.locator === null || held.vault === null) return 'no-manifest';
    try {
      await this.vault.read(held.vault as 'evidence' | 'quarantine', scope, held.locator, held.contentDigest);
      return 'verified';
    } catch {
      return 'integrity';
    }
  }

  private async loadHeldByValidator(
    req: RunRequest, tenantId: string, domainId: string, pollKey: string, validator: { etag: string | null; lastModified: string | null },
  ): Promise<PriorEvidence | null> {
    if (validator.etag === null && validator.lastModified === null) return null;
    const got = await this.pipeline.consequentialRead(
      this.envelope(req, 'observation.read.evidence', 'EVD', null, tenantId, domainId),
      req.principal,
      this.route('observation.read.evidence', tenantId, domainId, 'EVD', null),
      ObservationCapability.read,
      async (cap) => cap.evidenceByValidator({ sourceId: req.sourceId, pollKey, etag: validator.etag, lastModified: validator.lastModified }),
    );
    return got.result === null ? null : toPrior(got.result);
  }

  private async loadPriorByPollKeys(
    req: RunRequest, tenantId: string, domainId: string, pollKeys: string[],
  ): Promise<Map<string, PriorEvidence>> {
    const out = new Map<string, PriorEvidence>();
    if (pollKeys.length === 0) return out;
    const got = await this.pipeline.consequentialRead(
      this.envelope(req, 'observation.read.evidence', 'EVD', null, tenantId, domainId),
      req.principal,
      this.route('observation.read.evidence', tenantId, domainId, 'EVD', null),
      ObservationCapability.read,
      async (cap) => cap.latestEvidenceByPollKeys({ sourceId: req.sourceId, pollKeys }),
    );
    for (const r of got.result) out.set(r.poll_key, toPrior(r));
    return out;
  }

  private async loadCheckpoint(
    req: RunRequest, tenantId: string, domainId: string,
  ): Promise<Record<string, unknown> | null> {
    const out = await this.pipeline.consequentialRead(
      this.envelope(req, 'observation.read.runs', 'RUN', null, tenantId, domainId),
      req.principal,
      this.route('observation.read.runs', tenantId, domainId, 'RUN', null),
      ObservationCapability.read,
      async (cap) => (await cap
        .readCheckpoints()
        .select('checkpoint' as never)
        .where('source_id' as never, '=', req.sourceId as never)
        .executeTakeFirst()) as { checkpoint?: Record<string, unknown> } | undefined,
    );
    return out.result?.checkpoint ?? null;
  }

  private bindingFor(contract: ContractRow): SourceBinding {
    const c = contract.contract as {
      identity: { endpoints: string[] };
      security_and_operations: {
        budgets: Record<string, number>;
        expected_schema: {
          media_types: string[]; required_fields: string[]; drift_tolerance: number;
          max_bytes?: number; item_path?: string; item_key_field?: string | string[]; item_time_field?: string;
        };
        backfill?: {
          strategy: 'period-range' | 'arcgis-offset'; endpoint: string; from: string; to?: string | null;
          window_days?: number; start_param?: string; end_param?: string; page_size?: number;
          order_by?: string; time_field?: string; where?: string;
        };
      };
    };
    const b = c.security_and_operations.budgets;
    const es = c.security_and_operations.expected_schema;
    const bf = c.security_and_operations.backfill;
    return {
      ...(bf !== undefined ? { backfill: {
        strategy: bf.strategy, endpoint: bf.endpoint, from: bf.from, to: bf.to ?? null,
        ...(bf.window_days !== undefined ? { windowDays: bf.window_days } : {}),
        ...(bf.start_param !== undefined ? { startParam: bf.start_param } : {}),
        ...(bf.end_param !== undefined ? { endParam: bf.end_param } : {}),
        ...(bf.page_size !== undefined ? { pageSize: bf.page_size } : {}),
        ...(bf.order_by !== undefined ? { orderBy: bf.order_by } : {}),
        ...(bf.time_field !== undefined ? { timeField: bf.time_field } : {}),
        ...(bf.where !== undefined ? { where: bf.where } : {}),
      } } : {}),
      sourceId: contract.source_id,
      sourceKey: contract.source_key,
      replaySet: String(
        (contract.contract as { security_and_operations?: { replay_set?: string } })
          .security_and_operations?.replay_set ?? contract.source_key),
      contractVersion: contract.contract_version,
      acquisitionMode: contract.acquisition_mode,
      authorityClass: contract.authority_class,
      endpoints: c.identity.endpoints,
      expectedSchema: {
        mediaTypes: es.media_types,
        requiredFields: es.required_fields,
        driftTolerance: es.drift_tolerance,
        ...(es.max_bytes !== undefined ? { maxBytes: es.max_bytes } : {}),
        ...(es.item_path !== undefined ? { itemPath: es.item_path } : {}),
        ...(es.item_key_field !== undefined ? { itemKeyField: es.item_key_field } : {}),
        ...(es.item_time_field !== undefined ? { itemTimeField: es.item_time_field } : {}),
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
    // When framing is declared, `required_fields` are paths INSIDE an element, so
    // the declared prefix is stripped before the check.
    const prefix = binding.expectedSchema.itemPath !== undefined
      ? `${binding.expectedSchema.itemPath}.[].` : null;
    const fields = prefix === null
      ? binding.expectedSchema.requiredFields
      : binding.expectedSchema.requiredFields
          .filter((f) => f.startsWith(prefix))
          .map((f) => f.slice(prefix.length));
    if (fields.length === 0) return { ok: true };
    return checkSchemaDrift(parsed, { ...binding.expectedSchema, requiredFields: fields });
  }
}

function hostsOf(endpoints: string[]): string[] {
  const out = new Set<string>();
  for (const e of endpoints) {
    try { out.add(new URL(e).hostname.toLowerCase()); } catch { /* contract validation reported it */ }
  }
  return [...out];
}

/**
 * An infrastructure fault, as opposed to a governance answer: PostgreSQL connection
 * (08), resource (53), operator-intervention (57), system (58) and internal (XX)
 * classes, and the socket errors underneath them. A fault injected by the test
 * profile is a simulated crash, not infrastructure, and keeps its own path.
 */
export function isInfrastructureFault(e: unknown): boolean {
  if (e instanceof fault.InjectedFault) return false;
  const code = String((e as { code?: unknown })?.code ?? '');
  if (/^(08|53|57|58|XX)/.test(code)) return true;
  if (/^(ECONN|ETIMEDOUT|EPIPE|EHOSTUNREACH|ENETUNREACH|EAI_AGAIN)/.test(code)) return true;
  const message = e instanceof Error ? e.message : '';
  return /connection terminated|connection refused|terminating connection|timeout exceeded when trying to connect/i.test(message);
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

function toPrior(r: HeldEvidenceRow): PriorEvidence {
  return {
    evdObjectId: r.evd_object_id, objectVersion: Number(r.object_version),
    contentDigest: r.content_digest, obsObjectId: r.obs_object_id,
    lifecycleState: r.lifecycle_state, manifestId: r.manifest_id, locator: r.locator, vault: r.vault,
    manifestPresent: r.manifest_present === true, tombstoned: r.tombstoned === true,
  };
}
