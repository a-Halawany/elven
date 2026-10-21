/**
 * CP-6 B40 §CR — THE CONNECTOR CELL (INF-PF-12, IA-47-001, IA-47-003, IA-47-005, DAT-IN-02, DP-14-003; RU-11 re-verified).
 *
 * A source contract of kind `adapter` binds an APPROVED adapter package (SRC@v4 `adapter`; after a requalification, the package that
 * requalification approved). Each run of it is ONE CHILD PROCESS — the cell — inside the run the lifecycle already governs: the run
 * holds the source's lease (0051) for the whole cell, the run acts as the source's agent, and the cell's framed items go back to the
 * UNCHANGED lifecycle (inspection, admission, custody — the connector never creates canonical truth, IA-47-003). The cell:
 *   - is started by the §0 launcher (Node's permission model: fs READ of the SDK and of the one materialized package only; no fs write,
 *     no child process, no worker, no addon; code generation from strings disallowed; heap and wall-clock caps; the environment EMPTY —
 *     no credential, no database or Redis address);
 *   - runs the package's bytes after each file is read from the vault and RE-VERIFIED against the registered digest — a package whose bytes
 *     do not verify is never run: the contract is suspended for requalification (`package_integrity`);
 *   - reaches the outside only through the run's EGRESS GATEWAY on loopback (egress-gateway.ts): the contract's registered destinations,
 *     the purpose and data class, the budget, §AP's throttle stage, the vetted and pinned transport, the credential injected there — and a
 *     TRANSFER RECEIPT per request, written before anything the cell framed can be admitted (no item without its receipts, F55).
 * An UNREGISTERED destination or a CHANGED destination identity is BLOCKING: the run fails closed (nothing it framed is admitted), the
 * exchange of a changed identity is quarantined with its request preserved (`destination_identity_changed`), the contract is SUSPENDED
 * with its cursor, checkpoint and custody untouched, and a REQUALIFICATION is required — a new package digest, contract tests run here in
 * a cell, a second person's approval — before it can be activated again (transition_contract refuses it meanwhile).
 *
 * NOT CLAIMED (D3): the permission model has no network switch; the gateway is the cell's only INTENDED egress and a direct socket is not
 * prevented by the OS here. Network-level denial is B103 / B109, then R1. THREE CLAIMS: construction (this file and its harnesses);
 * demonstrated operation (the act); real acceptance — never claimed.
 */
import { HttpException, Inject, Injectable } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import { errorBody } from '@eye/contracts';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { PipelineService, type RouteInfo } from '../../pipeline/pipeline.service.js';
import { ObservationCapability } from '../observation.capabilities.js';
import { VaultIntegrityError, VaultService } from '../vault/vault.service.js';
import { SourceCredentialStore } from '../sources/source-credentials.js';
import { ReplayResponder } from '../connectors/replay.js';
import type { AcquiredItem, AcquisitionContext, AcquisitionOutput, Connector } from '../connectors/sdk.js';
import { confinedSpawn, type ConfinedOutcome } from '../sandbox/spawn-confined.js';
import * as fault from '../fault-injection.js';
import { CellCapability } from './cell.capabilities.js';
import { EgressGateway, LiveTransport, NoEgressTransport, ReplayTransport, type EgressReceipt, type PinSet, type Transport } from './egress-gateway.js';
import { loadSdk, locateSdk, type Sdk } from './sdk-runtime.js';

type Row = Record<string, unknown>;
const EMPTY_PAYLOAD_DIGEST = '44136fa355b3678a1146ad16f7e8649e94fb4fc21fe77e8310c060f61caaff8a';
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strs = (v: unknown): string[] => arr(v).filter((x): x is string => typeof x === 'string');
const hostsOf = (urls: string[]): string[] => [...new Set(urls.map((u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } }).filter((h) => h !== ''))];

/** Why a cell's run failed closed, in the class form the run's reason carries (`connector cell refused (<class>): …`). */
export class CellRefused extends Error {
  constructor(readonly refusalClass: string, message: string) {
    super(`connector cell refused (${refusalClass}): ${message}`.slice(0, 600));
    this.name = 'CellRefused';
  }
}

/** The run a cell serves: the agent principal its run acts as (bound by the orchestrator when it mints the run session). */
export interface CellRun {
  principal: AuthenticatedPrincipal;
  tenantId: string;
  domainId: string;
  correlationId: string;
  purposeId: string;
}

/** A package as the register holds it (the port's JSON) and its files as the cell will read them. */
interface PackageRow { package_id: string; name: string; version: string; package_digest: string; manifest: Row; files: Array<{ file: string; sha256: string; byte_length: number; locator: string }> }

export interface ContractTestReport {
  outcome: 'pass' | 'fail';
  summary: string;
  cases: Array<{ name: string; outcome: 'pass' | 'fail' | 'skipped'; detail: string }>;
  ran_at: string;
  sdk_version: string;
  sdk_digest: string;
  package: { package_id: string; name: string; version: string; package_digest: string };
  transport: 'replay' | 'none';
  receipts: Record<string, number>;
  cell: { status: string; exit_code: number | null; duration_ms: number; flags: string[] };
}

/**
 * THE CONNECTOR of kind `adapter` (one per run; the orchestrator's connectorFor). Its name, version and code digest are the CELL's: the
 * SDK it speaks (an agent is registered for exactly that SDK digest); the package it runs is the contract's, re-verified every run.
 */
export class AdapterCellConnector implements Connector {
  readonly kind = 'adapter' as const;
  readonly name = 'adapter-cell';
  readonly version: string;
  readonly codeDigest: string;
  private run: CellRun | null = null;

  constructor(private readonly cells: ConnectorCellService) {
    const sdk = locateSdk();
    this.version = sdk?.version ?? '0.0.0';
    // The cell's digest is the SDK's: what the agent instance is registered for. Absent SDK → a digest no agent is registered under.
    this.codeDigest = createHash('sha256').update(`adapter-cell\0${sdk?.digest ?? 'no-sdk'}`).digest('hex');
  }

  /** Bind the run's agent principal (the orchestrator, after it minted the run session). A cell never runs unbound. */
  bindRun(run: CellRun): this { this.run = run; return this; }

  async acquire(ctx: AcquisitionContext): Promise<AcquisitionOutput> {
    if (this.run === null) throw new CellRefused('unbound', 'a cell runs only for a run bound to its agent principal');
    return this.cells.runCell(this, this.run, ctx);
  }
}

@Injectable()
export class ConnectorCellService {
  constructor(
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
    private readonly pipeline: PipelineService,
    private readonly vault: VaultService,
    private readonly credentials: SourceCredentialStore,
  ) {}

  /**
   * TEST CONTROL ONLY (B14's one transport substitution): the live transport's resolver — a harness maps the synthetic destination to a
   * loopback server whose certificate it made (and names that certificate as the trust anchor). Refused outside the test runtime.
   */
  private liveForTests: { resolve: (host: string) => Promise<string[]>; trustAnchorPem?: string } | null = null;
  useLiveTransportForTests(s: { resolve: (host: string) => Promise<string[]>; trustAnchorPem?: string } | null): void {
    if (this.cfg['eye.runtime.env'] !== 'test') throw new Error('useLiveTransportForTests is available only in the test runtime');
    this.liveForTests = s;
  }

  connector(): AdapterCellConnector { return new AdapterCellConnector(this); }

  /* ── governed plumbing ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  private envelope(run: CellRun, action: string, objectType: string, objectId: string | null): Envelope {
    return {
      message_id: newId(), scope: 'DOMAIN', tenant_id: run.tenantId, domain_id: run.domainId, principal_id: `principal:${run.principal.principalId}`,
      purpose_id: run.purposeId, action, side_effect_class: action.includes('.load') ? 'none' : 'reversible', consequence_class: 'C1',
      object_type: objectType, object_id: objectId, schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted',
      correlation_id: run.correlationId, trace_id: `cell-${run.correlationId.slice(0, 8)}`, payload_digest: EMPTY_PAYLOAD_DIGEST,
    } as Envelope;
  }
  private route(run: CellRun, action: string, objectType: string, objectId: string | null): RouteInfo {
    return { scope: 'DOMAIN', tenantId: run.tenantId, domainId: run.domainId, action, objectType, objectId };
  }

  /** The run's binding (observation.adapter.load): the contract, the package in force and its files, the credential binding, the pins, the lease. */
  private async binding(run: CellRun, sourceId: string, contractVersion: number): Promise<Row> {
    const out = await this.pipeline.consequentialRead(this.envelope(run, 'observation.adapter.load', 'SRC', sourceId), run.principal,
      this.route(run, 'observation.adapter.load', 'SRC', sourceId), CellCapability.load,
      async (cap) => cap.binding({ tenantId: run.tenantId, domainId: run.domainId, sourceId, contractVersion }));
    return out.result;
  }

  /** Read every file of a package from the vault (each digest re-verified on read), check the package digest, write them into a private
   *  directory for the cell (mode 0400 files in a 0700 directory) and RE-READ them there. Any mismatch is `package_integrity`. */
  private async materialize(sdk: Sdk, scope: { tenantId: string; domainId: string }, pkg: PackageRow, expectedDigest: string): Promise<string> {
    const files: Array<{ file: string; sha256: string; bytes: Buffer }> = [];
    for (const f of pkg.files) {
      if (!sdk.isPackageFileName(f.file)) throw new CellRefused('package_integrity', `package file ${JSON.stringify(f.file)} is not a plain file name`);
      try {
        const got = await this.vault.read('evidence', scope, f.locator, f.sha256);
        files.push({ file: f.file, sha256: got.contentDigest, bytes: got.bytes });
      } catch (e) {
        const why = e instanceof VaultIntegrityError ? `${e.reason}: ${e.message}` : 'unreadable';
        throw new CellRefused('package_integrity', `package ${pkg.name} ${pkg.version} file ${f.file} did not verify (${why})`);
      }
    }
    const digest = sdk.packageDigest(files);
    if (digest !== expectedDigest || digest !== pkg.package_digest) {
      throw new CellRefused('package_integrity', `package ${pkg.name} ${pkg.version} digests to ${digest}, not the ${expectedDigest} the contract binds`);
    }
    const dir = await realpath(await mkdtemp(join(tmpdir(), 'eye-cell-')));
    for (const f of files) await writeFile(join(dir, f.file), f.bytes, { mode: 0o400, flag: 'wx' });
    for (const f of files) {
      const back = await readFile(join(dir, f.file));
      if (createHash('sha256').update(back).digest('hex') !== f.sha256) {
        await rm(dir, { recursive: true, force: true });
        throw new CellRefused('package_integrity', `package file ${f.file} changed between the vault and the cell's directory`);
      }
    }
    return dir;
  }

  /** One cell to completion under the launcher: the SDK runtime and the package directory readable, nothing else; the start frame on stdin. */
  private async spawnCell(dir: string, pkg: PackageRow, gateway: { url: string; token: string }, run: { sourceKey: string; contractVersion: number; purpose: string | null },
                          checkpoint: Record<string, unknown> | null, timeoutMs: number): Promise<ConfinedOutcome> {
    const sdk = locateSdk();
    if (sdk === null) throw new CellRefused('sdk_unavailable', 'the connector SDK (packages/connector-sdk) is not present in this deployment');
    const start = {
      protocol: 'eye-cell/1', sdk: sdk.version,
      run: { source_key: run.sourceKey, contract_version: run.contractVersion, purpose: run.purpose },
      gateway, package: { dir, entry: String(pkg.manifest['entry'] ?? ''), name: pkg.name, version: pkg.version }, checkpoint,
    };
    return confinedSpawn({
      script: sdk.runtime, readPaths: [sdk.dir, dir], stdin: JSON.stringify(start),
      timeoutMs: Math.max(1_000, Math.min(timeoutMs, 600_000)), maxHeapMb: 256, maxOutputBytes: 256 * 1024 * 1024,
    });
  }

  /* ── the run ───────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
  async runCell(connector: AdapterCellConnector, run: CellRun, ctx: AcquisitionContext): Promise<AcquisitionOutput> {
    const sdk = await loadSdk().catch(() => { throw new CellRefused('sdk_unavailable', 'the connector SDK is not present in this deployment'); });
    const scope = { tenantId: run.tenantId, domainId: run.domainId };
    const b = await this.binding(run, ctx.binding.sourceId, ctx.binding.contractVersion);
    if (b['connector_kind'] !== 'adapter') throw new CellRefused('kind', `source ${ctx.binding.sourceId} v${ctx.binding.contractVersion} is not an adapter contract`);
    const lease = b['lease'] as Row | null;
    const runId = typeof lease?.['run_id'] === 'string' ? lease['run_id'] as string : null;
    if (runId === null || Number(lease?.['contract_version']) !== ctx.binding.contractVersion) {
      throw new CellRefused('lease', 'no run holds the source\'s lease for this contract version — a cell runs only inside its run');
    }
    const open = b['open_requalification'] as Row | null;
    if (open !== null && open !== undefined) {
      throw new CellRefused('requalification_open', `requalification ${String(open['requalification_id'])} (${String(open['cause'])}, ${String(open['state'])}) holds this contract version`);
    }
    if (typeof b['package_problem'] === 'string') throw new CellRefused('package', b['package_problem'] as string);
    const pkg = b['package'] as PackageRow | null;
    const inForce = b['package_in_force'] as Row | null;
    if (pkg === null || inForce === null) throw new CellRefused('package', 'the contract binds no adapter package');
    const recordCtx = { run, runId, sourceId: ctx.binding.sourceId, contractVersion: ctx.binding.contractVersion, connector };

    let dir: string;
    try { dir = await this.materialize(sdk, scope, pkg, String(inForce['digest'])); }
    catch (e) {
      if (e instanceof CellRefused && e.refusalClass === 'package_integrity') {
        const suspended = await this.suspend(recordCtx, 'package_integrity', e.message, null, pkg.package_digest);
        throw new CellRefused('package_integrity', `${suspended}; ${e.message.replace(/^connector cell refused \(package_integrity\): /, '')}`);
      }
      throw e;
    }

    // the credential: the binding in force (a rotation) resolved by REFERENCE here; else the contract's own (resolved by the lifecycle, live only)
    const live = ctx.binding.acquisitionMode === 'live';
    const rotated = b['credential_binding'] as { ref: string; header: string } | null;
    let credential: { ref: string; header: string; value: string } | null = null;
    if (live && rotated !== null && rotated !== undefined) {
      const value = this.credentials.resolve(rotated.ref);
      if (value === null) { await rm(dir, { recursive: true, force: true }); throw new CellRefused('credential', `the deployment binds no source credential named ${rotated.ref} (binding in force)`); }
      credential = { ref: rotated.ref, header: rotated.header, value };
    } else if (live && ctx.credential !== undefined && ctx.binding.credential !== undefined) {
      credential = { ref: ctx.binding.credential.ref, header: ctx.credential.header, value: ctx.credential.value };
    }

    const manifest = pkg.manifest;
    const contractPurposes = strs(b['purposes']);
    const pins: PinSet = { declared: strs(b['declared_pins']), recorded: new Map(arr(b['pins']).map((p) => {
      const r = p as Row; return [String(r['host']), { spki: String(r['tls_spki_sha256']), addresses: strs(r['addresses']) }] as const; })) };
    const transport: Transport = live
      ? new LiveTransport(pins, this.liveForTests === null ? {} : this.liveForTests)
      : new ReplayTransport(new ReplayResponder(ctx.replayRoot), ctx.binding.replaySet);
    // the purposes a request may name: the package's that the contract also names — the run's own purpose first (the default)
    const allowed = strs(manifest['purposes']).filter((p) => contractPurposes.includes(p));
    const purposes = allowed.includes(run.purposeId) ? [run.purposeId, ...allowed.filter((p) => p !== run.purposeId)] : allowed;
    const gateway = new EgressGateway({
      contractHosts: hostsOf(strs(b['endpoints'])), packageHosts: strs(manifest['declared_destinations']),
      purposes, dataClasses: strs(manifest['data_classes']), schemes: ['https'],
      maxResponseBytes: ctx.binding.egress.maxResponseBytes, timeoutMs: ctx.binding.egress.timeoutMs,
      package: { id: pkg.package_id, digest: pkg.package_digest }, credential,
    }, transport, {
      spendRequest: () => ctx.budget.spendRequest(), spendBytes: (n) => ctx.budget.spendBytes(n),
      ...(ctx.throttle === undefined ? {} : { throttle: ctx.throttle }),
    });

    let outcome: ConfinedOutcome;
    try {
      let at: { url: string; token: string };
      try { at = await gateway.start(); }
      catch (e) { throw new CellRefused('gateway_unavailable', `the egress gateway could not start (${e instanceof Error ? e.message : 'unknown'}); no cell was started and no request left`); }
      try {
        outcome = await this.spawnCell(dir, pkg, at, { sourceKey: ctx.binding.sourceKey, contractVersion: ctx.binding.contractVersion, purpose: purposes[0] ?? null },
          ctx.checkpoint, ctx.binding.budgets.timeoutMs);
      } finally { await gateway.stop(); }
    } finally { await rm(dir, { recursive: true, force: true }); }

    // THE RECEIPTS FIRST: nothing the cell framed is admitted unless every request it made is on the record (F55: fail closed)
    if (gateway.receipts.length > 0) await this.recordReceipts(recordCtx, gateway.receipts);

    if (gateway.blocking !== null) {
      const blk = gateway.blocking;
      let quarantined = '';
      if (blk.refusalClass === 'destination_identity_changed' && gateway.blockedExchange !== null) {
        quarantined = `; the exchange quarantined (case ${await this.quarantineExchange(recordCtx, gateway.blockedExchange)})`;
      }
      const suspended = await this.suspend(recordCtx, blk.refusalClass as 'unregistered_destination' | 'destination_identity_changed', blk.detail, blk.receiptId, pkg.package_digest);
      // the outcome first (the run's reason is bounded): what became of the contract, then what the cell did, with its receipt
      throw new CellRefused(blk.refusalClass, `${suspended}${quarantined}; ${blk.detail} (receipt ${blk.receiptId})`);
    }
    if (gateway.runError !== null) throw gateway.runError;   // the budget or §AP's throttle refused a request: the run records it as its own
    if (outcome.status !== 'ok') {
      throw new CellRefused('cell_failed', `the cell ended ${outcome.status}${outcome.exitCode === null ? '' : ` (exit ${outcome.exitCode})`}${outcome.signal === null ? '' : ` by ${outcome.signal}`}; nothing it framed is admitted`
        + this.errorOf(sdk, outcome));
    }
    const parsed = sdk.parseFrames(outcome.stdout.toString('utf8'));
    if (parsed.problems.length > 0) throw new CellRefused('protocol', `the cell spoke outside eye-cell/1: ${parsed.problems.slice(0, 3).join('; ')}`);
    const frames = parsed.frames;
    if (frames[0]?.t !== 'hello') throw new CellRefused('protocol', 'the cell did not open with a hello frame');
    const last = frames[frames.length - 1];
    if (last?.t !== 'done') throw new CellRefused('protocol', 'the cell did not close with a done frame');
    const retrievedAt = new Date().toISOString();
    const methodRef = `adapter:${pkg.name}@${pkg.version}#${pkg.package_digest.slice(0, 16)} via eye-cell/1`;
    const items: AcquiredItem[] = [];
    for (const f of frames) {
      if (f.t !== 'item') continue;
      items.push({
        itemKey: `${f.itemKey}@${retrievedAt}`, pollKey: f.itemKey, bytes: f.bytes, declaredMediaType: f.mediaType,
        filename: f.filename ?? `${f.itemKey.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120)}.bin`, publisherTime: f.publisherTime,
        transport: { connector: connector.name, connectorVersion: connector.version, methodRef, endpoint: null, httpStatus: null, retainedHeaders: {},
          tlsVerified: live ? true : null, originAllowlisted: true },
      });
    }
    return { items, checkpoint: last.checkpoint ?? ctx.checkpoint ?? {}, bytesTransferred: gateway.bytesTransferred, requestsMade: gateway.requestsMade };
  }

  private errorOf(sdk: Sdk, outcome: ConfinedOutcome): string {
    const parsed = sdk.parseFrames(outcome.stdout.toString('utf8'));
    const err = parsed.frames.find((f) => f.t === 'error');
    return err === undefined || err.t !== 'error' ? '' : ` — the adapter reported ${err.class}${err.refusalClass === null ? '' : ` (${err.refusalClass})`}: ${err.message.slice(0, 200)}`;
  }

  /** F55: the receipts, written whole or not at all; a failure fails the run closed (nothing framed is admitted). */
  private async recordReceipts(c: { run: CellRun; runId: string; sourceId: string; contractVersion: number }, receipts: EgressReceipt[]): Promise<void> {
    try {
      fault.at('f55.receipt_write');
      await this.pipeline.write(this.envelope(c.run, 'observation.egress.record', 'RUN', c.runId), c.run.principal,
        this.route(c.run, 'observation.egress.record', 'RUN', c.runId), CellCapability.receipts,
        async (cap) => {
          const r = await cap.record({ tenantId: c.run.tenantId, domainId: c.run.domainId, sourceId: c.sourceId, contractVersion: c.contractVersion, runId: c.runId,
            receipts: receipts as unknown as Row[], correlationId: c.run.correlationId });
          return { result: r, targetType: 'RUN', targetId: c.runId, targetVersion: null, outboxEvent: null };
        });
    } catch (e) {
      throw new CellRefused('receipts_unrecorded', `the ${receipts.length} transfer receipt(s) of this run could not be recorded (${e instanceof Error ? e.message.slice(0, 200) : 'unknown'}); nothing the cell framed is admitted`);
    }
  }

  /** F56: the suspension and the requalification; the run fails closed either way — the answer says whether they were recorded. */
  private async suspend(c: { run: CellRun; runId: string; sourceId: string; contractVersion: number }, cause: 'unregistered_destination' | 'destination_identity_changed' | 'package_integrity',
                        detail: string, receiptId: string | null, digest: string | null): Promise<string> {
    try {
      fault.at('f56.requalification_write');
      const out = await this.pipeline.write(this.envelope(c.run, 'observation.connector.suspend', 'SRC', c.sourceId), c.run.principal,
        this.route(c.run, 'observation.connector.suspend', 'SRC', c.sourceId), CellCapability.suspend,
        async (cap) => {
          const r = await cap.suspend({ tenantId: c.run.tenantId, domainId: c.run.domainId, sourceId: c.sourceId, contractVersion: c.contractVersion, runId: c.runId,
            cause, detail: detail.slice(0, 1000), receiptId, digest, correlationId: c.run.correlationId });
          return {
            result: r, targetType: 'SRC', targetId: c.sourceId, targetVersion: String(c.contractVersion),
            // the same event the manager's suspension emits (B22's consumer marks what rests on the source; cause health)
            outboxEvent: r['suspended'] === true ? { eventType: 'SourceHealthChanged', payload: { schema_version: 'v1', source_id: c.sourceId, contract_version: c.contractVersion,
              state: 'suspended', reason: `connector cell: ${cause} — requalification required` } } : null,
          };
        });
      const q = out.result['requalification'] as Row | undefined;
      return `the contract is ${String(out.result['contract_state'])}, requalification ${String(q?.['requalification_id'] ?? '?')} required (cursor and custody unchanged)`;
    } catch (e) {
      return `the suspension and requalification were NOT recorded (${e instanceof Error ? e.message.slice(0, 80) : 'unknown'}) — the run is failed closed all the same`;
    }
  }

  /** A changed destination identity: the exchange (the request as it would have gone, both identities, the receipt) quarantined, its reason kept. */
  private async quarantineExchange(c: { run: CellRun; runId: string; sourceId: string; contractVersion: number; connector: AdapterCellConnector },
                                   x: { receipt: EgressReceipt; request: Record<string, unknown> }): Promise<string> {
    const scope = { tenantId: c.run.tenantId, domainId: c.run.domainId };
    const bytes = Buffer.from(JSON.stringify({ kind: 'egress exchange blocked: destination identity changed', receipt_id: x.receipt.receipt_id, request: x.request,
      destination: x.receipt.destination, reason: x.receipt.reason }, null, 2), 'utf8');
    const stored = await this.vault.store('quarantine', scope, bytes);
    const caseId = newId(); const manifestId = newId();
    const reason = (x.receipt.reason ?? 'destination identity changed').slice(0, 1000);
    await this.pipeline.write(this.envelope(c.run, 'observation.item.quarantine', 'QAR', caseId), c.run.principal,
      this.route(c.run, 'observation.item.quarantine', 'QAR', caseId), ObservationCapability.acquisition,
      async (cap) => {
        const contract = (await cap.readSourceContracts().selectAll().where('source_id' as never, '=', c.sourceId as never)
          .where('contract_version' as never, '=', c.contractVersion as never).executeTakeFirst()) as Row | undefined;
        await cap.recordManifest({ manifestId, tenantId: scope.tenantId, domainId: scope.domainId, vault: 'quarantine', locator: stored.locator, digest: stored.contentDigest,
          byteLength: stored.byteLength, declaredType: 'application/json', sniffedType: 'application/json', activeContentRisk: false,
          classification: String(contract?.['classification_ceiling'] ?? 'internal'), residency: String(contract?.['residency'] ?? 'EU'), retention: 'quarantine-review',
          legalHold: false, sourceId: c.sourceId, contractVersion: c.contractVersion, runId: c.runId,
          acquisitionMode: String(contract?.['acquisition_mode'] ?? 'live'), correlationId: c.run.correlationId } as never);
        await cap.openQuarantineCase({ caseId, tenantId: scope.tenantId, domainId: scope.domainId, sourceId: c.sourceId, contractVersion: c.contractVersion, runId: c.runId, manifestId,
          itemKey: `egress:${x.receipt.host}#${x.receipt.seq}`, reasonClass: 'destination_identity_changed', reason, declaredType: 'application/json', sniffedType: 'application/json',
          byteLength: stored.byteLength, digest: stored.contentDigest, ttlSeconds: this.cfg['eye.quarantine.ttl_seconds'], eventId: newId(), correlationId: c.run.correlationId } as never);
        await cap.appendCustody({ eventId: newId(), tenantId: scope.tenantId, domainId: scope.domainId, manifestId, obsObjectId: null, evdObjectId: null, sourceId: c.sourceId,
          contractVersion: c.contractVersion, runId: c.runId, event: 'custody.quarantined', actor: `agent:${c.connector.name}@${c.connector.version}`,
          agentPrincipalId: c.run.principal.principalId, agentVersion: c.connector.version, codeDigest: c.connector.codeDigest, connector: c.connector.name,
          connectorVersion: c.connector.version, methodRef: 'egress-gateway:identity-check', contentDigest: stored.contentDigest, digestVerified: true,
          details: { reason_class: 'destination_identity_changed', reason, receipt_id: x.receipt.receipt_id }, correlationId: c.run.correlationId } as never);
        await cap.appendRunEvent({ eventId: newId(), tenantId: scope.tenantId, domainId: scope.domainId, runId: c.runId, sourceId: c.sourceId, contractVersion: c.contractVersion,
          agentPrincipalId: c.run.principal.principalId, agentVersion: c.connector.version, codeDigest: c.connector.codeDigest, connector: c.connector.name,
          connectorVersion: c.connector.version, acquisitionMode: String(contract?.['acquisition_mode'] ?? 'live'), event: 'item.quarantined',
          details: { item_key: `egress:${x.receipt.host}#${x.receipt.seq}`, case_id: caseId, reason_class: 'destination_identity_changed', receipt_id: x.receipt.receipt_id },
          correlationId: c.run.correlationId } as never);
        return { result: { caseId }, targetType: 'QAR', targetId: caseId, targetVersion: '1', outboxEvent: null };
      });
    return caseId;
  }

  /* ── the contract tests (requalification) ─────────────────────────────────────────────────────────────────────────────────────── */
  /**
   * Run a candidate package in a cell against the contract WITHOUT the publisher: the replay set the contract declares (a replay contract),
   * or no egress at all (a live contract — every request refused `contract_test`, the destination check being the test). Never admits
   * anything, writes no receipt: a report the requalification records. Cases: the digest verified; eye-cell/1 spoken; every request on a
   * registered destination; every frame valid; the run completes; at least one item framed (replay).
   */
  async contractTest(scope: { tenantId: string; domainId: string }, binding: Row, pkg: PackageRow): Promise<ContractTestReport> {
    const sdk = await loadSdk();
    const at = locateSdk();
    const cases: ContractTestReport['cases'] = [];
    const replay = binding['acquisition_mode'] === 'replay';
    const base = { ran_at: new Date().toISOString(), sdk_version: at?.version ?? 'unknown', sdk_digest: at?.digest ?? 'unknown',
      package: { package_id: pkg.package_id, name: pkg.name, version: pkg.version, package_digest: pkg.package_digest }, transport: replay ? 'replay' as const : 'none' as const };
    const finish = (receipts: Record<string, number>, cell: ContractTestReport['cell']): ContractTestReport => {
      const failed = cases.filter((x) => x.outcome === 'fail');
      return { ...base, outcome: failed.length === 0 ? 'pass' : 'fail', cases, receipts, cell,
        summary: failed.length === 0 ? `${cases.filter((x) => x.outcome === 'pass').length} case(s) passed` : `failed: ${failed.map((x) => `${x.name} — ${x.detail}`).join('; ')}`.slice(0, 900) };
    };
    let dir: string;
    try { dir = await this.materialize(sdk, scope, pkg, pkg.package_digest); cases.push({ name: 'package digest verified', outcome: 'pass', detail: pkg.package_digest }); }
    catch (e) { cases.push({ name: 'package digest verified', outcome: 'fail', detail: e instanceof Error ? e.message.slice(0, 300) : 'unreadable' }); return finish({}, { status: 'not_started', exit_code: null, duration_ms: 0, flags: [] }); }
    const manifestCheck = sdk.validateAdapterManifest(pkg.manifest, pkg.files.map((f) => f.file));
    cases.push({ name: 'manifest valid for eye-cell/1', outcome: manifestCheck.ok ? 'pass' : 'fail', detail: manifestCheck.ok ? 'ok' : manifestCheck.problems.join('; ') });
    const contractHosts = hostsOf(strs(binding['endpoints']));
    const undeclared = strs(pkg.manifest['declared_destinations']).filter((h) => !contractHosts.includes(h));
    cases.push({ name: 'declared destinations registered by the contract', outcome: undeclared.length === 0 ? 'pass' : 'fail',
      detail: undeclared.length === 0 ? contractHosts.join(', ') : `not registered: ${undeclared.join(', ')}` });
    const contractPurposes = strs(binding['purposes']);
    const transport: Transport = replay ? new ReplayTransport(new ReplayResponder(this.cfg['eye.connector.replay_root']), String(binding['replay_set'])) : new NoEgressTransport();
    const gateway = new EgressGateway({ contractHosts, packageHosts: strs(pkg.manifest['declared_destinations']),
      purposes: strs(pkg.manifest['purposes']).filter((p) => contractPurposes.includes(p)), dataClasses: strs(pkg.manifest['data_classes']), schemes: ['https'],
      maxResponseBytes: this.cfg['eye.connector.max_response_bytes'], timeoutMs: this.cfg['eye.connector.request_timeout_ms'],
      package: { id: pkg.package_id, digest: pkg.package_digest }, credential: null }, transport, {});
    let outcome: ConfinedOutcome;
    try {
      const g = await gateway.start();
      try { outcome = await this.spawnCell(dir, pkg, g, { sourceKey: String(binding['source_key']), contractVersion: Number(binding['contract_version']), purpose: null }, null, 60_000); }
      finally { await gateway.stop(); }
    } finally { await rm(dir, { recursive: true, force: true }); }
    const counts: Record<string, number> = {};
    for (const r of gateway.receipts) { const k = `${r.decision}${r.refusal_class === null ? '' : `:${r.refusal_class}`}`; counts[k] = (counts[k] ?? 0) + 1; }
    const blocked = gateway.receipts.filter((r) => r.refusal_class === 'unregistered_destination');
    cases.push({ name: 'every request on a registered destination', outcome: blocked.length === 0 ? 'pass' : 'fail',
      detail: blocked.length === 0 ? `${gateway.receipts.length} request(s), none outside the registration` : `asked for ${[...new Set(blocked.map((r) => r.host))].join(', ')}` });
    const parsed = sdk.parseFrames(outcome.stdout.toString('utf8'));
    cases.push({ name: 'speaks eye-cell/1', outcome: parsed.frames[0]?.t === 'hello' && parsed.problems.length === 0 ? 'pass' : 'fail',
      detail: parsed.problems.length === 0 ? `${parsed.frames.length} frame(s)` : parsed.problems.slice(0, 3).join('; ') });
    const done = parsed.frames[parsed.frames.length - 1]?.t === 'done';
    const items = parsed.frames.filter((f) => f.t === 'item').length;
    if (replay) {
      cases.push({ name: 'completes against the replay set', outcome: outcome.status === 'ok' && done ? 'pass' : 'fail', detail: `${outcome.status}${this.errorOf(sdk, outcome)}`.slice(0, 300) });
      cases.push({ name: 'frames at least one item', outcome: items > 0 ? 'pass' : 'fail', detail: `${items} item(s)` });
    } else {
      cases.push({ name: 'completes against the replay set', outcome: 'skipped', detail: 'a live contract: no recorded set — no publisher request is made by a test' });
      cases.push({ name: 'frames at least one item', outcome: 'skipped', detail: 'a live contract' });
    }
    return finish(counts, { status: outcome.status, exit_code: outcome.exitCode, duration_ms: outcome.durationMs, flags: outcome.flags });
  }

  /* ── the human acts (the controller's) ────────────────────────────────────────────────────────────────────────────────────────── */
  /** Register a package: every file stored by the vault (digest verified on store), the manifest parsed from the package's own adapter.json. */
  async registerPackage(envelope: Envelope, principal: AuthenticatedPrincipal, scope: { tenantId: string; domainId: string },
                        input: { requestId: string; files: Array<{ file: string; bytes: Buffer }> }) {
    const sdk = await loadSdk();
    const at = locateSdk();
    const corr = envelope.correlation_id;
    const bad = (m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', corr, `adapter package rejected (files): ${m}`), 422); };
    if (input.files.length < 1 || input.files.length > 64) bad('a package is 1 to 64 files');
    const total = input.files.reduce((n, f) => n + f.bytes.byteLength, 0);
    if (total > 4 * 1024 * 1024) bad('a package is at most 4 MiB');
    const names = input.files.map((f) => f.file);
    if (new Set(names).size !== names.length || names.some((n) => !sdk.isPackageFileName(n))) bad('each file is named once, a plain name (letters, digits, dot, underscore, hyphen; no directory)');
    const manifestFile = input.files.find((f) => f.file === 'adapter.json');
    if (manifestFile === undefined) bad('the package carries its manifest as adapter.json');
    let manifest: Row;
    try { manifest = JSON.parse(manifestFile!.bytes.toString('utf8')) as Row; } catch { return bad('adapter.json is not JSON'); }
    const check = sdk.validateAdapterManifest(manifest, names);
    if (!check.ok) throw new HttpException(errorBody('EYE_REQ_001', corr, `adapter package rejected (manifest): ${check.problems.join('; ')}`), 422);
    const stored: Array<{ file: string; sha256: string; byte_length: number; locator: string }> = [];
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId: scope.tenantId, domainId: scope.domainId, action: 'observation.adapter.register', objectType: 'ADP', objectId: null },
      CellCapability.register,
      async (cap) => {
        try {
          for (const f of input.files) {
            const s = await this.vault.store('evidence', scope, f.bytes);
            stored.push({ file: f.file, sha256: s.contentDigest, byte_length: s.byteLength, locator: s.locator });
          }
          const r = await cap.register({ requestId: input.requestId, tenantId: scope.tenantId, domainId: scope.domainId, manifest, files: stored,
            packageDigest: sdk.packageDigest(stored), protocol: sdk.CELL_PROTOCOL, sdkVersion: at?.version ?? sdk.SDK_VERSION, actor: principal.principalId, correlationId: corr });
          return { result: r, targetType: 'ADP', targetId: String(r['package_id'] ?? ''), targetVersion: String(r['version'] ?? ''), outboxEvent: null };
        } catch (e) {
          // nothing registered: the blobs this attempt stored are removed (a replayed request's blobs, too — the recorded ones stand)
          for (const s of stored) await this.vault.tombstone('evidence', scope, s.locator).catch(() => undefined);
          throw e;
        }
      });
    if (out.result['replayed'] === true) for (const s of stored) await this.vault.tombstone('evidence', scope, s.locator).catch(() => undefined);
    return out;
  }

  /** Submit a requalification: the candidate package's contract tests run HERE (a cell, no publisher), then the port records them. */
  async submitRequalification(envelope: Envelope, principal: AuthenticatedPrincipal, scope: { tenantId: string; domainId: string },
                              input: { requestId: string; requalificationId: string; packageId: string | null; reason: string }) {
    const corr = envelope.correlation_id;
    const register = await this.pipeline.consequentialRead({ ...envelope, action: 'observation.connectors.read', message_id: newId() } as Envelope, principal,
      { scope: 'DOMAIN', tenantId: scope.tenantId, domainId: scope.domainId, action: 'observation.connectors.read', objectType: 'RQL', objectId: input.requalificationId },
      CellCapability.registerRead, async (cap) => cap.register(scope));
    const req = arr(register.result['requalifications']).map((x) => x as Row).find((x) => x['requalification_id'] === input.requalificationId);
    if (req === undefined) throw new HttpException(errorBody('EYE_STA_001', corr, `requalification rejected (unknown_requalification): requalification ${input.requalificationId} is not recorded in this domain`), 404);
    const sourceId = String(req['source_id']); const contractVersion = Number(req['contract_version']);
    const bindingOut = await this.pipeline.consequentialRead({ ...envelope, action: 'observation.adapter.load', message_id: newId() } as Envelope, principal,
      { scope: 'DOMAIN', tenantId: scope.tenantId, domainId: scope.domainId, action: 'observation.adapter.load', objectType: 'SRC', objectId: sourceId },
      CellCapability.load, async (cap) => cap.binding({ ...scope, sourceId, contractVersion }));
    const binding = bindingOut.result;
    let report: ContractTestReport | Row;
    if (binding['connector_kind'] === 'adapter') {
      const pkgId = input.packageId ?? String((binding['package_in_force'] as Row | null)?.['package_id'] ?? '');
      const pkg = arr(register.result['packages']).map((x) => x as unknown as PackageRow).find((p) => p.package_id === pkgId);
      if (pkg === undefined) throw new HttpException(errorBody('EYE_STA_001', corr, `requalification rejected (unknown_package): package ${pkgId} is not registered in this domain`), 404);
      report = await this.contractTest(scope, binding, pkg);
    } else {
      report = { outcome: 'fail', summary: 'only an adapter contract is requalified through its cell', cases: [] };
    }
    const out = await this.pipeline.write(envelope, principal,
      { scope: 'DOMAIN', tenantId: scope.tenantId, domainId: scope.domainId, action: 'observation.connector.requalification.submit', objectType: 'RQL', objectId: input.requalificationId },
      CellCapability.submit,
      async (cap) => {
        const r = await cap.submit({ requestId: input.requestId, tenantId: scope.tenantId, domainId: scope.domainId, requalificationId: input.requalificationId,
          packageId: binding['connector_kind'] === 'adapter' ? (input.packageId ?? String((binding['package_in_force'] as Row | null)?.['package_id'] ?? '')) || null : null,
          contractTests: report as unknown as Row, reason: input.reason, actor: principal.principalId, correlationId: corr });
        return { result: r, targetType: 'RQL', targetId: input.requalificationId, targetVersion: null, outboxEvent: null };
      });
    return { ...out, contractTests: report };
  }
}
