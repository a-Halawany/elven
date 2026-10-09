/**
 * CP-6 B33 §SC (0111) — SUPPLY-CHAIN INTELLIGENCE (F-P4-14): what the routes (supply-intel.controller.ts), the Supply Chain Agent's scan (its
 * B33 steps, offered through SupplyIntelBridge) and the after-tick hook `twin-supply-scan` do.
 *
 *   THE NETWORK VIEW (SC1)      a version's analysis (B29) and its UNCERTAINTY (intel.ts) — declared / validated / inferred, the unknowns.
 *   INFERENCE (SC2)             the agent reads the evidence of the network's declared RECORD SOURCES (governed retrievals in custody, under its
 *                               own session, every read reserved on its meter), infers hidden tiers (intel.ts, deterministic) and DRAFTS them
 *                               (one governed write); a NAMED analyst validates or rejects; the twin's OWNER applies through the existing
 *                               open / ground / admit ports — each its own governed write (R4) — and the application is recorded last.
 *   DISRUPTIONS (SC3)           opened by a person from a signal (or proposed by the agent through the route, confirmed by a person); the MAP is
 *                               computed in its OWN read (every network, its links, the line twins, freshness) BEFORE the write that records it
 *                               with the versions it pinned; a recorded map is REPLAYED on its pinned versions to the same digest.
 *   ALTERNATIVES (SC4/SC5)      an option's scenario branch `alt-<key>` (made by the twin's owner through the twin routes) evaluated under the
 *                               same disruption: run rate restored, time to effect against the cover, the B29 constraint engine through the
 *                               gate capability in its own read transaction, the cost; recorded feasible / infeasible / indeterminate.
 *   THE SCHEDULE (AG-026)       after every attention tick, when the domain's active Supply Chain Agent has work pending (a network version not
 *                               read through, unread evidence of a record source, a mapped disruption whose network moved), its supply_scan is
 *                               STARTED through the agent runner — never awaited past `scanAwaitMs`, one scan per agent in flight (B25-R).
 */
import { HttpException, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { errorBody, type Envelope } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import type { ScopeContext } from '../../shared/scope.js';
import { COMMIT_DB } from '../../shared/shared.module.js';
import type { Db } from '../../shared/db.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { SeriesService } from '../../prediction/series/series.service.js';
import { AttentionTickRegistry } from '../../executive/attention/tick.js';
import { twinStateChangedGraphEvent } from '../../graph/subscriptions/change-events.js';
import { TwinCapability } from '../twin.capabilities.js';
import { TwinService, validateElementIntake } from '../twins/twin.service.js';
import { twinStateChangedEvent } from '../twins/twin-events.js';
import { ConstraintService, DEFAULT_BUDGET_MS } from '../constraints/constraint.service.js';
import { ConstraintCapability } from '../constraints/constraint.capabilities.js';
import { ReconciliationBridge } from '../estimation/reconciliation-bridge.js';
import { analyseNetwork, readNetwork, type FamilyElement } from '../supply-network/network.js';
import {
  ALTERNATIVE_KINDS, alternativeSubject, evaluateAlternative, inferHiddenTiers, mapDisruption, parseSupplyRecords, uncertaintyOf, unsourcedOf,
  type AlternativeKind, type DisruptionMap, type DisruptionSpec, type NetworkInput, type RecordRead, type SupplyRecord,
} from './intel.js';
import { SupplyIntelCapability, type SupplyIntelReads } from './supply-intel.capabilities.js';
import { SupplyIntelBridge, type SupplyIntelScanArgs, type SupplyIntelScanEnv } from './bridge.js';

type Row = Record<string, unknown>;
export const SUPPLY_SCAN_HOOK = 'twin-supply-scan';
export const SUPPLY_READ = 'twin.supply.read';
/* B25-R: how long the attention tick waits on the supply scan it started before it returns — the scan goes on, detached, and closes its own run */
export const SUPPLY_SCAN_AWAIT_MS = 30_000;
/* the evidence versions one scan reads per record source (the rest wait for the next run — the hook sees them pending) */
export const EVIDENCE_PER_RUN = 10;
/* the disruptions one scan re-maps */
export const REMAPS_PER_RUN = 3;
const textOf = (e: unknown): string => (e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : (e instanceof Error ? e.message : String(e)));
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const elOf = (e: Row): FamilyElement => ({ key: String(e['key']), value: e['value'], unit: (e['unit'] as string | null) ?? null, health: (e['health'] as string | null) ?? null });

export interface MapInputs {
  spec: DisruptionSpec;
  networks: Array<{ twin_id: string; title: string; version: number; owner: string | null; freshness: string | null;
                    links: Array<{ twin_id: string; title: string; version: number | null; owner: string | null; freshness: string | null; mapping: Array<{ from: string; to: string }> }> }>;
  telemetry: { twin_id: string; version: number | null; freshness: string | null } | null;
}
export interface ApplyIntake { capacityPerDay: number | null; leadDays: number | null; entityId: string | null; allowIncomplete: boolean }
export interface AlternativeIntake {
  key: string; kind: AlternativeKind; title: string; twinId: string; branchVersion: number; params: Row; constraintSets: string[];
  cost: { amount: number; currency: string; basis: string } | null; costRef: { twinId: string; key: string; multiplier: number | null; currency: string } | null; restoreShare: number | null;
}

@Injectable()
export class SupplyIntelService implements OnModuleInit {
  private readonly log = new Logger('twin.supply-intel');
  /* B25-R: the supply scan in flight per agent (one process runs a domain's timer) */
  private readonly inFlight = new Map<string, { since: string; done: Promise<Row> }>();
  scanAwaitMs = SUPPLY_SCAN_AWAIT_MS;
  constructor(private readonly moduleRef: ModuleRef, private readonly pipeline: PipelineService, private readonly twins: TwinService, private readonly series: SeriesService,
              private readonly constraints: ConstraintService, @Inject(COMMIT_DB) private readonly commitDb: Db) {}

  onModuleInit(): void {
    SupplyIntelBridge.setScanner((d, p, a) => this.scan(d, p, a));
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: the supply scan is not scheduled'); return; }
    registry.registerAfter({ name: SUPPLY_SCAN_HOOK, run: async (a) => this.afterTick(a) });
  }

  // ───────────────────────── envelopes ─────────────────────────
  envelopeFor(principal: AuthenticatedPrincipal, tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null, correlationId: string, purpose = 'twin'): Envelope {
    return {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${principal.principalId}`, purpose_id: purpose, action,
      side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C1', object_type: objectType, object_id: objectId,
      schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: correlationId, trace_id: 'twin-supply',
    } as unknown as Envelope;
  }
  derive(base: Envelope, action: string, objectType: string, objectId: string | null): Envelope {
    return { ...base, action, object_type: objectType, object_id: objectId, side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', message_id: newId() } as Envelope;
  }
  route(tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  private async read<T>(base: Envelope, principal: AuthenticatedPrincipal, T_: string, D: string, objectType: string, objectId: string | null, fn: (cap: SupplyIntelReads) => Promise<T>): Promise<T> {
    return (await this.pipeline.consequentialRead(this.derive(base, SUPPLY_READ, objectType, objectId), principal, this.route(T_, D, SUPPLY_READ, objectType, objectId),
      SupplyIntelCapability.read, (cap) => fn(cap))).result;
  }

  // ───────────────────────── reads ─────────────────────────
  /** The domain's supply-network twins with their heads on actual. */
  async networks(cap: SupplyIntelReads): Promise<Array<{ twin_id: string; title: string; owner: string; kind: string; head: number | null }>> {
    const kinds = ((await cap.readKinds().select(['kind'] as never).where('family' as never, '=', 'supply-network' as never).execute()) as Array<{ kind: string }>).map((k) => k.kind);
    if (kinds.length === 0) return [];
    const twins = (await cap.readTwins().select(['twin_id', 'title', 'owner_principal_id', 'kind', 'declared_at'] as never).where('kind' as never, 'in', kinds as never)
      .orderBy('declared_at' as never).orderBy('twin_id' as never).execute()) as Row[];
    const out: Array<{ twin_id: string; title: string; owner: string; kind: string; head: number | null }> = [];
    for (const t of twins) out.push({ twin_id: String(t['twin_id']), title: String(t['title']), owner: String(t['owner_principal_id']), kind: String(t['kind']), head: await this.head(cap, String(t['twin_id'])) });
    return out;
  }
  async head(cap: SupplyIntelReads, twinId: string, branch = 'actual'): Promise<number | null> {
    const v = (await cap.readVersions().select(['version'] as never).where('twin_id' as never, '=', twinId as never).where('branch_id' as never, '=', branch as never)
      .where('state' as never, '=', 'admitted' as never).orderBy('version' as never, 'desc').limit(1).executeTakeFirst()) as { version: number } | undefined;
    return v === undefined ? null : Number(v.version);
  }
  async elements(cap: SupplyIntelReads, twinId: string, version: number): Promise<FamilyElement[]> {
    return ((await cap.readElements().select(['key', 'value', 'unit', 'health'] as never).where('twin_id' as never, '=', twinId as never)
      .where('version' as never, '=', version as never).orderBy('key' as never).execute()) as Row[]).map(elOf);
  }

  /** THE NETWORK VIEW: a version's analysis and its uncertainty, the record sources, the inferences, the live disruptions touching it. */
  async networkView(cap: SupplyIntelReads, twinId: string, version: number | null): Promise<Row | null> {
    const twin = (await cap.readTwins().select(['twin_id', 'title', 'kind', 'owner_principal_id'] as never).where('twin_id' as never, '=', twinId as never).executeTakeFirst()) as Row | undefined;
    if (twin === undefined) return null;
    const kind = (await cap.readKinds().select(['family'] as never).where('kind' as never, '=', twin['kind'] as never).executeTakeFirst()) as { family: string | null } | undefined;
    if (kind?.family !== 'supply-network') return { twin_id: twinId, title: twin['title'], family: kind?.family ?? null, note: 'not a supply-network twin' };
    const v = version ?? await this.head(cap, twinId);
    const vrow = v === null ? undefined : (await cap.readVersions().select(['version', 'state', 'branch_id'] as never).where('twin_id' as never, '=', twinId as never)
      .where('version' as never, '=', v as never).executeTakeFirst()) as Row | undefined;
    const els = vrow === undefined ? [] : await this.elements(cap, twinId, Number(vrow['version']));
    const sources = (await cap.readRecordSources().selectAll().where('twin_id' as never, '=', twinId as never).orderBy('declared_at' as never).execute()) as Row[];
    const reads = (await cap.readRecordReads().select(['source_key', 'evidence_id', 'evidence_version', 'recognised', 'read_at'] as never).where('twin_id' as never, '=', twinId as never)
      .orderBy('read_at' as never).execute()) as Row[];
    const inferences = (await cap.readInferences().selectAll().where('twin_id' as never, '=', twinId as never).orderBy('drafted_at' as never, 'desc').execute()) as Row[];
    return {
      twin_id: twinId, title: twin['title'], owner: twin['owner_principal_id'], family: 'supply-network', version: vrow === undefined ? null : Number(vrow['version']),
      state: vrow?.['state'] ?? null, branch_id: vrow?.['branch_id'] ?? null, freshness: vrow === undefined ? null : await cap.freshness(twinId, Number(vrow['version'])),
      analysis: vrow === undefined ? null : analyseNetwork(els), uncertainty: vrow === undefined ? null : uncertaintyOf(els),
      record_sources: sources, records_read: reads.length, records_recognised: reads.filter((r) => r['recognised'] === true).length, inferences,
    };
  }

  async listInferences(cap: SupplyIntelReads, f: { twinId: string | null; state: string | null }): Promise<Row[]> {
    let q = cap.readInferences().selectAll();
    if (f.twinId !== null) q = q.where('twin_id' as never, '=', f.twinId as never);
    if (f.state !== null) q = q.where('state' as never, '=', f.state as never);
    return (await q.orderBy('drafted_at' as never, 'desc').orderBy('inference_id' as never).execute()) as Row[];
  }
  async getInference(cap: SupplyIntelReads, inferenceId: string): Promise<Row | null> {
    const i = (await cap.readInferences().selectAll().where('inference_id' as never, '=', inferenceId as never).executeTakeFirst()) as Row | undefined;
    if (i === undefined) return null;
    const events = (await cap.readEvents().selectAll().where('subject_id' as never, '=', inferenceId as never).orderBy('occurred_at' as never).execute()) as Row[];
    const items = (await cap.readItems().select(['item_id', 'signal_class', 'state', 'outcome', 'owner_principal_id', 'route_roles', 'title', 'policy_version', 'created_at', 'closed_at'] as never)
      .where('subject_id' as never, '=', inferenceId as never).orderBy('created_at' as never).execute()) as Row[];
    return { ...i, events, items };
  }
  async listDisruptions(cap: SupplyIntelReads, state: string | null): Promise<Row[]> {
    let q = cap.readDisruptions().selectAll();
    if (state !== null) q = q.where('state' as never, '=', state as never);
    return (await q.orderBy('opened_at' as never, 'desc').orderBy('disruption_id' as never).execute()) as Row[];
  }
  async getDisruption(cap: SupplyIntelReads, disruptionId: string): Promise<Row | null> {
    const d = (await cap.readDisruptions().selectAll().where('disruption_id' as never, '=', disruptionId as never).executeTakeFirst()) as Row | undefined;
    if (d === undefined) return null;
    const maps = (await cap.readMaps().selectAll().where('disruption_id' as never, '=', disruptionId as never).orderBy('map_no' as never).execute()) as Row[];
    const alternatives = (await cap.readAlternatives().selectAll().where('disruption_id' as never, '=', disruptionId as never).orderBy('evaluated_at' as never).execute()) as Row[];
    const events = (await cap.readEvents().selectAll().where('subject_id' as never, '=', disruptionId as never).orderBy('occurred_at' as never).execute()) as Row[];
    const subjects = [disruptionId, ...alternatives.map((a) => String(a['alternative_id']))];
    const items = (await cap.readItems().select(['item_id', 'signal_class', 'subject_id', 'state', 'outcome', 'owner_principal_id', 'route_roles', 'title', 'policy_version', 'created_at', 'closed_at'] as never)
      .where('subject_id' as never, 'in', subjects as never).orderBy('created_at' as never).execute()) as Row[];
    return { ...d, maps, latest_map: maps[maps.length - 1] ?? null, alternatives, events, items };
  }

  // ───────────────────────── record sources (SC2) ─────────────────────────
  async declareRecordSource(base: Envelope, principal: AuthenticatedPrincipal, T_: string, D: string, a: { twinId: string; sourceKey: string; note: string | null; retire: boolean; reason: string | null }) {
    const id = newId();
    const out = await this.pipeline.write(this.derive(base, 'twin.supply.records.declare', 'TWN', a.twinId), principal, this.route(T_, D, 'twin.supply.records.declare', 'TWN', a.twinId),
      SupplyIntelCapability.records, async (cap, scope) => ({
        result: await cap.declareRecordSource({ recordSourceId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, twinId: a.twinId, sourceKey: a.sourceKey,
          note: a.note, retire: a.retire, reason: a.reason, actor: principal.principalId, correlationId: base.correlation_id }),
        targetType: 'TWN', targetId: a.twinId, targetVersion: null, outboxEvent: null }));
    return { recordSource: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  // ───────────────────────── the decision and the application (SC2) ─────────────────────────
  async decideInference(base: Envelope, principal: AuthenticatedPrincipal, T_: string, D: string, inferenceId: string,
                        a: { decision: 'validated' | 'rejected'; reason: string | null; digest: string | null; validUntil: string | null }) {
    const out = await this.pipeline.write(this.derive(base, 'twin.supply.inference.validate', 'TWS', inferenceId), principal,
      this.route(T_, D, 'twin.supply.inference.validate', 'TWS', inferenceId), SupplyIntelCapability.decide, async (cap, scope) => ({
        result: await cap.decideInference({ inferenceId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, decision: a.decision, reason: a.reason, digest: a.digest,
          validUntil: a.validUntil, actor: principal.principalId, correlationId: base.correlation_id }),
        targetType: 'TWS', targetId: inferenceId, targetVersion: '1', outboxEvent: null }));
    return { decision: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /** One governed write of the twin's own: open a draft (twin.version). */
  private async openDraft(base: Envelope, principal: AuthenticatedPrincipal, T_: string, D: string, twinId: string, a: { branchId: string; forkedFromVersion: number | null; carryFrom: number | null; except: string[] }) {
    const out = await this.pipeline.write(this.derive(base, 'twin.version', 'TWN', twinId), principal, this.route(T_, D, 'twin.version', 'TWN', twinId), TwinCapability.version,
      async (cap, scope) => {
        const r = await this.twins.openVersion(cap, scope, twinId, { branchId: a.branchId, forkedFromVersion: a.forkedFromVersion, knownAt: new Date().toISOString(), observedThrough: null,
          carryFrom: a.carryFrom, except: a.except }, principal.principalId, base.correlation_id);
        return { result: r, targetType: 'TWN', targetId: twinId, targetVersion: String(r.version), outboxEvent: null };
      });
    return out.result.version;
  }
  /** One governed write of the twin's own: ground elements into the draft (twin.ground) — the elements' citations resolved by the twin service. */
  private async groundDraft(base: Envelope, principal: AuthenticatedPrincipal, T_: string, D: string, twinId: string, version: number, elements: Row[]) {
    const intake = elements.map((e) => validateElementIntake(e as never, base.correlation_id));
    const reader = { principal, tenantId: T_, domainId: D, correlationId: base.correlation_id, purposeId: base.purpose_id ?? 'twin' };
    await this.pipeline.write(this.derive(base, 'twin.ground', 'TWN', twinId), principal, this.route(T_, D, 'twin.ground', 'TWN', twinId), TwinCapability.ground,
      async (cap, scope) => ({ result: await this.twins.ground(cap, scope, reader, twinId, version, intake, principal.principalId, base.correlation_id),
                               targetType: 'TWN', targetId: twinId, targetVersion: String(version), outboxEvent: null }));
  }
  /** One governed write of the twin's own: admit (twin.version.admit), announced exactly as the admit route announces it. */
  private async admitDraft(base: Envelope, principal: AuthenticatedPrincipal, T_: string, D: string, twinId: string, version: number, allowIncomplete: boolean) {
    const out = await this.pipeline.write(this.derive(base, 'twin.version.admit', 'TWN', twinId), principal, this.route(T_, D, 'twin.version.admit', 'TWN', twinId), TwinCapability.admit,
      async (cap, scope) => {
        const { runs, ...r } = await this.twins.admit(cap, scope, twinId, version, allowIncomplete, base.purpose_id ?? 'twin', principal.principalId, base.correlation_id);
        const now = new Date().toISOString();
        return {
          result: r, targetType: 'TWN', targetId: twinId, targetVersion: String(version),
          outboxEvent: twinStateChangedEvent({
            twinId, version, branchId: r.branchId, supersedes: r.supersedes, forkedFromVersion: r.forkedFrom, change: 'version.admitted',
            stateSetDigest: r.stateSetDigest, headerDigest: r.headerDigest, completeness: r.completeness, missingKeys: r.missingKeys, syntheticState: r.syntheticState,
            knownAt: r.knownAt, observedThrough: r.observedThrough, verificationState: 'verified', changedVariables: r.changedVariables, dependencyImpacts: r.dependencyImpacts,
            reason: null, causedBy: null, action: 'twin.version.admit', actor: principal.principalId, occurredAt: now,
          }),
          outboxEvents: [twinStateChangedGraphEvent({
            twinId, version, supersedes: r.supersedes, branchId: r.branchId, changedVariables: r.changedVariables.length, runs,
            subscriptions: await cap.changeSubscriptions({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, changeKind: 'twin.state_changed' }),
            actor: principal.principalId, occurredAt: now,
          })],
        };
      });
    return out.result;
  }
  /** The compensation of a failed application: the draft withdrawn (twin.version.withdraw), its reason the failure. */
  private async withdrawDraft(base: Envelope, principal: AuthenticatedPrincipal, T_: string, D: string, twinId: string, version: number, reason: string) {
    try {
      await this.pipeline.write(this.derive(base, 'twin.version.withdraw', 'TWN', twinId), principal, this.route(T_, D, 'twin.version.withdraw', 'TWN', twinId), TwinCapability.withdraw,
        async (cap, scope) => ({ result: await this.twins.withdrawVersion(cap, scope, twinId, version, reason.slice(0, 1000), principal.principalId, base.correlation_id),
                                 targetType: 'TWN', targetId: twinId, targetVersion: String(version), outboxEvent: null }));
      return true;
    } catch (e) { this.log.warn(`the draft ${twinId} v${version} could not be withdrawn: ${textOf(e)}`); return false; }
  }
  private async recordApplication(base: Envelope, principal: AuthenticatedPrincipal, T_: string, D: string, inferenceId: string, mode: 'apply' | 'revert', version: number) {
    const out = await this.pipeline.write(this.derive(base, 'twin.supply.inference.apply', 'TWS', inferenceId), principal, this.route(T_, D, 'twin.supply.inference.apply', 'TWS', inferenceId),
      SupplyIntelCapability.apply, async (cap, scope) => ({
        result: await cap.applyInference({ inferenceId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, mode, version, actor: principal.principalId, correlationId: base.correlation_id }),
        targetType: 'TWS', targetId: inferenceId, targetVersion: '1', outboxEvent: null }));
    return { recorded: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /** The port alone: the owner made the version through the twin routes and records it here. */
  async recordInference(base: Envelope, principal: AuthenticatedPrincipal, T_: string, D: string, inferenceId: string, mode: 'apply' | 'revert', version: number) {
    return this.recordApplication(base, principal, T_, D, inferenceId, mode, version);
  }

  /**
   * APPLY a validated inference (the twin's OWNER): read the inference and the head FIRST; then, each its own governed write — a draft on actual
   * carrying the head, the site (provenance validated, naming the inference, citing its evidence), the route, the capacity (stated by the owner,
   * else the records' observed flow — a lower bound, said so) and the tier when it is new, the admission — and the application recorded. A failure
   * after the draft opened withdraws it (the compensation), so the branch is free again.
   */
  async applyInference(base: Envelope, principal: AuthenticatedPrincipal, T_: string, D: string, inferenceId: string, intake: ApplyIntake) {
    const corr = base.correlation_id;
    const pre = await this.read(base, principal, T_, D, 'TWS', inferenceId, async (cap) => {
      const i = (await cap.readInferences().selectAll().where('inference_id' as never, '=', inferenceId as never).executeTakeFirst()) as Row | undefined;
      if (i === undefined) return null;
      const twinId = String(i['twin_id']);
      const head = await this.head(cap, twinId);
      const els = head === null ? [] : await this.elements(cap, twinId, head);
      const entity = intake.entityId === null ? null : ((await cap.readEntities().select(['entity_id', 'entity_type', 'lifecycle_state'] as never)
        .where('entity_id' as never, '=', intake.entityId as never).executeTakeFirst()) as Row | undefined) ?? undefined;
      return { i, twinId, head, els, entity };
    });
    if (pre === null) throw new HttpException(errorBody('EYE_STA_001', corr, `supply inference rejected (unknown_inference): ${inferenceId} is not an inference of this domain`), 404);
    const { i, twinId, head, els } = pre;
    if (i['state'] !== 'validated') throw new HttpException(errorBody('EYE_STA_002', corr, `supply inference rejected (state): inference ${inferenceId} is ${String(i['state'])}; only a validated inference is applied`), 409);
    if (head === null) throw new HttpException(errorBody('EYE_STA_002', corr, `supply inference rejected (state): twin ${twinId} has no admitted head on actual`), 409);
    if (intake.entityId !== null && (pre.entity === undefined || pre.entity === null || !['organization', 'place'].includes(String(pre.entity['entity_type'])))) {
      throw new HttpException(errorBody('EYE_REQ_001', corr, `supply inference rejected (entity): ${intake.entityId} is not a graph organization or place of this domain (create it through the graph's own port first)`), 422);
    }
    const { network: n } = readNetwork(els);
    const material = String(i['material']); const site = String(i['proposed_site']); const behind = String(i['behind_site']);
    const mat = n.materials.get(material);
    if (mat === undefined) throw new HttpException(errorBody('EYE_STA_002', corr, `supply inference rejected (stale): the head v${head} no longer declares material ${material}`), 409);
    if (!n.sites.has(behind)) throw new HttpException(errorBody('EYE_STA_002', corr, `supply inference rejected (stale): the head v${head} no longer declares site ${behind}`), 409);
    if (n.sites.has(site)) throw new HttpException(errorBody('EYE_STA_002', corr, `supply inference rejected (stale): the head v${head} already declares site ${site}`), 409);
    const observed = i['observed_flow_per_day'] === null || i['observed_flow_per_day'] === undefined ? null : Number(i['observed_flow_per_day']);
    const capacity = intake.capacityPerDay ?? observed;
    if (capacity === null || !Number.isFinite(capacity) || capacity < 0) {
      throw new HttpException(errorBody('EYE_REQ_001', corr, 'supply inference rejected (capacity): the records state no flow; the owner states the site\'s capacity per day (capacityPerDay)'), 422);
    }
    const evidence = (i['evidence'] as Row[]).map((e) => ({ kind: 'evidence', id: String(e['id']), version: Number(e['version']) }));
    const pv = i['proposed_value'] as Row;
    const tier = Number(pv['tier']);
    const value: Row = { ...pv, provenance: { basis: 'validated', inference_id: inferenceId, confidence: Number(i['confidence']) }, ...(intake.entityId === null ? {} : { entity_id: intake.entityId }) };
    const route: Row = { ...(i['proposed_route'] as Row), ...(intake.leadDays === null ? {} : { lead_days: intake.leadDays }) };
    const routeKey = `route:inf-${site}`.slice(0, 66);
    const elements: Row[] = [
      ...(n.tiers.includes(tier) ? [] : [{ key: `tier:${tier}`, kind: 'assumed', value: `tier ${tier} (a validated hidden tier)`, unit: null, citations: evidence }]),
      { key: `site:${site}`, kind: 'assumed', value, unit: null, citations: evidence },
      { key: routeKey, kind: 'assumed', value: route, unit: null, citations: evidence },
      { key: `capacity:${site}.${material}`, kind: 'assumed', value: capacity, unit: `${mat.unit}/day`, citations: evidence },
    ];
    const version = await this.openDraft(base, principal, T_, D, twinId, { branchId: 'actual', forkedFromVersion: null, carryFrom: head, except: [] });
    let admitted: Row;
    try {
      await this.groundDraft(base, principal, T_, D, twinId, version, elements);
      admitted = await this.admitDraft(base, principal, T_, D, twinId, version, intake.allowIncomplete) as unknown as Row;
    } catch (e) {
      await this.withdrawDraft(base, principal, T_, D, twinId, version, `the application of inference ${inferenceId} failed: ${textOf(e)}`.slice(0, 900));
      throw e;
    }
    const rec = await this.recordApplication(base, principal, T_, D, inferenceId, 'apply', version);
    return { applied: rec.recorded, version, admitted, capacity: { value: capacity, unit: `${mat.unit}/day`, basis: intake.capacityPerDay === null ? 'the records\' observed flow — a lower bound of the capacity' : 'stated by the twin\'s owner' }, receipt: rec.receipt };
  }

  /** REVERT a revoked inference (the twin's OWNER): a new version on actual without its site, route and capacity, admitted; the revert recorded. */
  async revertInference(base: Envelope, principal: AuthenticatedPrincipal, T_: string, D: string, inferenceId: string, allowIncomplete: boolean) {
    const corr = base.correlation_id;
    const pre = await this.read(base, principal, T_, D, 'TWS', inferenceId, async (cap) => {
      const i = (await cap.readInferences().selectAll().where('inference_id' as never, '=', inferenceId as never).executeTakeFirst()) as Row | undefined;
      if (i === undefined) return null;
      const head = await this.head(cap, String(i['twin_id']));
      return { i, head, els: head === null ? [] : await this.elements(cap, String(i['twin_id']), head) };
    });
    if (pre === null) throw new HttpException(errorBody('EYE_STA_001', corr, `supply inference rejected (unknown_inference): ${inferenceId} is not an inference of this domain`), 404);
    if (pre.i['state'] !== 'revoked') throw new HttpException(errorBody('EYE_STA_002', corr, `supply inference rejected (state): only a revoked inference is reverted (inference ${inferenceId} is ${String(pre.i['state'])})`), 409);
    const twinId = String(pre.i['twin_id']); const site = String(pre.i['proposed_site']);
    const except = pre.els.filter((e) => e.key === `site:${site}` || e.key.startsWith(`capacity:${site}.`) || e.key.startsWith(`inventory:${site}.`)
      || (e.key.startsWith('route:') && typeof e.value === 'object' && e.value !== null && ((e.value as Row)['from'] === site || (e.value as Row)['to'] === site))).map((e) => e.key);
    const version = await this.openDraft(base, principal, T_, D, twinId, { branchId: 'actual', forkedFromVersion: null, carryFrom: pre.head, except });
    try { await this.admitDraft(base, principal, T_, D, twinId, version, allowIncomplete); }
    catch (e) { await this.withdrawDraft(base, principal, T_, D, twinId, version, `the revert of inference ${inferenceId} failed: ${textOf(e)}`.slice(0, 900)); throw e; }
    const rec = await this.recordApplication(base, principal, T_, D, inferenceId, 'revert', version);
    return { reverted: rec.recorded, version, removed: except, receipt: rec.receipt };
  }

  // ───────────────────────── disruptions (SC3) ─────────────────────────
  async openDisruption(base: Envelope, principal: AuthenticatedPrincipal, T_: string, D: string,
                       a: { title: string; signal: Row; chokepoints: string[]; places: Row[]; derating: number; durationDays: number | null; telemetryTwinId: string | null; agentId: string | null; runId: string | null }) {
    const id = newId();
    const out = await this.pipeline.write(this.derive(base, 'twin.supply.disruption.open', 'TWS', id), principal, this.route(T_, D, 'twin.supply.disruption.open', 'TWS', id),
      SupplyIntelCapability.disruption, async (cap, scope) => ({
        result: await cap.openDisruption({ disruptionId: id, tenantId: scope.tenantId as string, domainId: scope.domainId as string, ...a, actor: principal.principalId, correlationId: base.correlation_id }),
        targetType: 'TWS', targetId: id, targetVersion: '1', outboxEvent: null }));
    return { disruption: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }
  async settleDisruption(base: Envelope, principal: AuthenticatedPrincipal, T_: string, D: string, disruptionId: string, to: 'open' | 'closed' | 'withdrawn', reason: string | null) {
    const action = to === 'open' ? 'twin.supply.disruption.confirm' : 'twin.supply.disruption.close';
    const out = await this.pipeline.write(this.derive(base, action, 'TWS', disruptionId), principal, this.route(T_, D, action, 'TWS', disruptionId),
      SupplyIntelCapability.disruption, async (cap, scope) => ({
        result: await cap.settleDisruption({ disruptionId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, to, reason, actor: principal.principalId, correlationId: base.correlation_id }),
        targetType: 'TWS', targetId: disruptionId, targetVersion: '1', outboxEvent: null }));
    return { disruption: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /** What a map reads (its own read, BEFORE the write): every network's head and links, the line twins, freshness — and the versions it pins. */
  async mapInputs(cap: SupplyIntelReads, tenantId: string, d: Row): Promise<{ inputs: MapInputs; elements: Map<string, FamilyElement[]>; pinned: Row[] }> {
    const spec: DisruptionSpec = { chokepoints: (d['chokepoints'] as string[]) ?? [], places: (d['places'] as Row[] ?? []) as DisruptionSpec['places'],
                                   derating: Number(d['derating']), duration_days: d['duration_days'] === null || d['duration_days'] === undefined ? null : Number(d['duration_days']) };
    const elements = new Map<string, FamilyElement[]>(); const pinned = new Map<string, Row>();
    const pin = async (twinId: string, version: number) => {
      const k = `${twinId}@${version}`;
      if (pinned.has(k)) return;
      const c = await cap.twinCitation(tenantId, twinId, version);
      if (c !== null) pinned.set(k, c);
      elements.set(k, await this.elements(cap, twinId, version));
    };
    const networks: MapInputs['networks'] = [];
    for (const net of await this.networks(cap)) {
      if (net.head === null) continue;
      await pin(net.twin_id, net.head);
      const links = (await cap.readLinks().select(['downstream_twin_id', 'mapping'] as never).where('upstream_twin_id' as never, '=', net.twin_id as never)
        .where('state' as never, '=', 'live' as never).orderBy('downstream_twin_id' as never).execute()) as Row[];
      const linked: MapInputs['networks'][number]['links'] = [];
      for (const l of links) {
        const id = String(l['downstream_twin_id']);
        const t = (await cap.readTwins().select(['title', 'owner_principal_id'] as never).where('twin_id' as never, '=', id as never).executeTakeFirst()) as Row | undefined;
        const h = await this.head(cap, id);
        if (h !== null) await pin(id, h);
        linked.push({ twin_id: id, title: String(t?.['title'] ?? id), version: h, owner: (t?.['owner_principal_id'] as string | undefined) ?? null, freshness: h === null ? null : await cap.freshness(id, h),
                      mapping: (l['mapping'] as Array<{ from: string; to: string }>) ?? [] });
      }
      networks.push({ twin_id: net.twin_id, title: net.title, version: net.head, owner: net.owner, freshness: await cap.freshness(net.twin_id, net.head), links: linked });
    }
    let telemetry: MapInputs['telemetry'] = null;
    if (typeof d['telemetry_twin_id'] === 'string') {
      const id = d['telemetry_twin_id'] as string; const h = await this.head(cap, id);
      if (h !== null) await pin(id, h);
      telemetry = { twin_id: id, version: h, freshness: h === null ? null : await cap.freshness(id, h) };
    }
    return { inputs: { spec, networks, telemetry }, elements, pinned: [...pinned.values()] };
  }
  /** THE MAP from its inputs and the pinned versions' elements (pure — the same inputs, the same map: the replay's basis). */
  static mapOf(inputs: MapInputs, elements: ReadonlyMap<string, FamilyElement[]>): DisruptionMap & { inputs: MapInputs } {
    const nets: NetworkInput[] = inputs.networks.map((n) => ({
      twin_id: n.twin_id, title: n.title, version: n.version, owner: n.owner, freshness: n.freshness, elements: elements.get(`${n.twin_id}@${n.version}`) ?? [],
      links: n.links.map((l) => ({ twin_id: l.twin_id, title: l.title, version: l.version, owner: l.owner, freshness: l.freshness, mapping: l.mapping,
                                   elements: l.version === null ? [] : elements.get(`${l.twin_id}@${l.version}`) ?? [] })),
    }));
    return { ...mapDisruption(inputs.spec, nets, inputs.telemetry), inputs };
  }

  /** MAP a disruption: the read (its own transaction) BEFORE the write; the agent passes its run. */
  async map(base: Envelope, principal: AuthenticatedPrincipal, T_: string, D: string, disruptionId: string, agent: { agentId: string; runId: string } | null) {
    const corr = base.correlation_id;
    const read = await this.read(base, principal, T_, D, 'TWS', disruptionId, async (cap) => {
      const d = (await cap.readDisruptions().selectAll().where('disruption_id' as never, '=', disruptionId as never).executeTakeFirst()) as Row | undefined;
      if (d === undefined) return null;
      return { d, ...(await this.mapInputs(cap, T_, d)) };
    });
    if (read === null) throw new HttpException(errorBody('EYE_STA_001', corr, `supply disruption rejected (unknown_disruption): ${disruptionId} is not a disruption of this domain`), 404);
    if (read.pinned.length === 0) throw new HttpException(errorBody('EYE_STA_002', corr, 'supply disruption rejected (state): the domain has no supply network with an admitted head to map'), 409);
    const result = SupplyIntelService.mapOf(read.inputs, read.elements);
    const mapId = newId();
    const out = await this.pipeline.write(this.derive(base, 'twin.supply.disruption.map', 'TWS', disruptionId), principal, this.route(T_, D, 'twin.supply.disruption.map', 'TWS', disruptionId),
      SupplyIntelCapability.disruption, async (cap, scope) => ({
        result: await cap.recordMap({ mapId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, disruptionId, pinned: read.pinned, result: result as unknown as Row,
          agentId: agent?.agentId ?? null, runId: agent?.runId ?? null, actor: principal.principalId, correlationId: corr }),
        targetType: 'TWS', targetId: disruptionId, targetVersion: null, outboxEvent: null }));
    return { map: out.result, result, pinned: read.pinned, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /** REPLAY a recorded map on ITS pinned versions (and the freshness it recorded): the same result digest proves the map reproducible. */
  async replay(cap: SupplyIntelReads, tenantId: string, disruptionId: string, mapNo: number | null): Promise<Row | null> {
    let q = cap.readMaps().selectAll().where('disruption_id' as never, '=', disruptionId as never);
    q = mapNo === null ? q.orderBy('map_no' as never, 'desc') : q.where('map_no' as never, '=', mapNo as never);
    const m = (await q.limit(1).executeTakeFirst()) as Row | undefined;
    if (m === undefined) return null;
    const recorded = m['result'] as Row & { inputs: MapInputs };
    const elements = new Map<string, FamilyElement[]>();
    for (const c of m['pinned'] as Row[]) elements.set(`${String(c['id'])}@${Number(c['version'])}`, await this.elements(cap, String(c['id']), Number(c['version'])));
    // the pinned versions' digests re-read: a version is immutable once admitted, its TWN digest the same
    const digests: Row[] = [];
    for (const c of m['pinned'] as Row[]) {
      const now = await cap.twinCitation(tenantId, String(c['id']), Number(c['version']));
      digests.push({ id: c['id'], version: c['version'], recorded: c['digest'], now: now?.['digest'] ?? null, same: now?.['digest'] === c['digest'] });
    }
    const result = SupplyIntelService.mapOf(recorded.inputs, elements);
    const replayed = await cap.mapDigest(m['pinned'] as unknown[], result as unknown as Row);
    return { disruption_id: disruptionId, map_id: m['map_id'], map_no: m['map_no'], recorded_digest: m['result_digest'], replayed_digest: replayed, identical: replayed === m['result_digest'],
             pinned: digests, result };
  }

  // ───────────────────────── alternatives (SC4/SC5) ─────────────────────────
  /**
   * EVALUATE an option on its scenario branch (a person): read the disruption, its latest map, the network's pinned head and the branch version
   * FIRST; the constraint engine in its own read transaction (the gate capability, a run_input subject — never recorded as a plan check); the
   * cost from the option or a cited twin element; then the one governed write recording the verdict.
   */
  async evaluate(base: Envelope, principal: AuthenticatedPrincipal, T_: string, D: string, disruptionId: string, intake: AlternativeIntake) {
    const corr = base.correlation_id;
    const read = await this.read(base, principal, T_, D, 'TWS', disruptionId, async (cap) => {
      const d = (await cap.readDisruptions().selectAll().where('disruption_id' as never, '=', disruptionId as never).executeTakeFirst()) as Row | undefined;
      if (d === undefined) return null;
      const m = d['last_map_id'] === null ? undefined : (await cap.readMaps().selectAll().where('map_id' as never, '=', d['last_map_id'] as never).executeTakeFirst()) as Row | undefined;
      const bv = (await cap.readVersions().select(['version', 'branch_id', 'state', 'forked_from_version', 'observed_through'] as never).where('twin_id' as never, '=', intake.twinId as never)
        .where('version' as never, '=', intake.branchVersion as never).executeTakeFirst()) as Row | undefined;
      const branch = bv === undefined ? [] : await this.elements(cap, intake.twinId, intake.branchVersion);
      const pinnedHead = m === undefined ? null : ((m['pinned'] as Row[]).find((c) => c['id'] === intake.twinId) ?? null);
      const head = pinnedHead === null ? [] : await this.elements(cap, intake.twinId, Number(pinnedHead['version']));
      let cost: Row | null = intake.cost === null ? null : { amount: intake.cost.amount, currency: intake.cost.currency, basis: intake.cost.basis };
      if (intake.costRef !== null) {
        const h = await this.head(cap, intake.costRef.twinId);
        const el = h === null ? undefined : (await cap.readElements().select(['value', 'unit'] as never).where('twin_id' as never, '=', intake.costRef.twinId as never)
          .where('version' as never, '=', h as never).where('key' as never, '=', intake.costRef.key as never).executeTakeFirst()) as Row | undefined;
        cost = el === undefined || typeof el['value'] !== 'number'
          ? { amount: null, currency: intake.costRef.currency, basis: `the cited element ${intake.costRef.key} of twin ${intake.costRef.twinId} is not on its head — the cost is unknown` }
          : { amount: Number(el['value']) * (intake.costRef.multiplier ?? 1), currency: intake.costRef.currency, unit: el['unit'] ?? null,
              basis: `${intake.costRef.key} = ${String(el['value'])} on twin ${intake.costRef.twinId} v${String(h)}${intake.costRef.multiplier === null ? '' : ` × ${intake.costRef.multiplier}`}`, ref: { twin_id: intake.costRef.twinId, version: h, key: intake.costRef.key } };
      }
      return { d, m, bv, branch, head, cost, now: await cap.now() };
    });
    if (read === null) throw new HttpException(errorBody('EYE_STA_001', corr, `supply alternative rejected (unknown_disruption): ${disruptionId} is not a disruption of this domain`), 404);
    if (read.m === undefined) throw new HttpException(errorBody('EYE_STA_002', corr, `supply alternative rejected (state): disruption ${disruptionId} is not mapped yet — map it first`), 409);
    if (read.bv === undefined) throw new HttpException(errorBody('EYE_STA_001', corr, `supply alternative rejected (unknown_branch): version ${intake.branchVersion} of twin ${intake.twinId} does not exist`), 404);
    const result = read.m['result'] as Row & DisruptionMap;
    const net = result.networks.find((n) => n.twin_id === intake.twinId);
    if (net === undefined) throw new HttpException(errorBody('EYE_REQ_001', corr, `supply alternative rejected (branch): twin ${intake.twinId} is not a network the disruption's map read`), 422);
    const line = net.lines[0] ?? null;
    const prelim = evaluateAlternative({ kind: intake.kind, spec: (result as unknown as { inputs: MapInputs }).inputs.spec, network: net, line, head: read.head, branch: read.branch, constraint: null,
                                         cost: read.cost === null ? null : { amount: read.cost['amount'] as number | null, currency: read.cost['currency'] as string | null, basis: String(read.cost['basis']) },
                                         ...(intake.restoreShare === null ? {} : { restoreShare: intake.restoreShare }) });
    // the constraint engine, its own read transaction (the gate capability; a run_input subject — not recorded as a plan check)
    let constraint: { outcome: string; reason: string | null } | null = null; let constraintRecord: Row | null = null;
    if (intake.constraintSets.length > 0) {
      const subject = alternativeSubject(`supply-alternative:${disruptionId}:${intake.key}`, prelim, read.branch, read.now.slice(0, 10));
      try {
        const r = await this.commitDb.transaction().execute(async (tx) => {
          const cap = await ConstraintCapability.gate(tx, { tenantId: T_, domainId: D }, `supply alternative: ${disruptionId} ${intake.key}`.slice(0, 200));
          return this.constraints.checkWith(cap, { tenantId: T_, domainId: D }, subject, { setKeys: [...intake.constraintSets].sort(), budgetMs: DEFAULT_BUDGET_MS, actor: null, correlationId: corr, record: false });
        });
        const ev = r.evaluation;
        constraint = { outcome: ev.outcome, reason: ev.outcome === 'violated' ? ev.violations.map((v) => `${v.setKey} v${v.setVersion}: ${JSON.stringify(v).slice(0, 300)}`).join('; ').slice(0, 2000)
                                                   : ev.outcome === 'indeterminate' ? ev.indeterminate.join('; ').slice(0, 2000) : null };
        constraintRecord = { outcome: ev.outcome, pins: ev.pins, violations: ev.violations, applied: ev.applied, vacuous: ev.vacuous, subject_kind: 'run_input', engine: 'B29 constraint engine (the gate path)' };
      } catch (err) {
        constraint = { outcome: 'indeterminate', reason: `the constraint engine failed: ${textOf(err)}`.slice(0, 500) };
        constraintRecord = { outcome: 'indeterminate', reason: constraint.reason };
      }
    }
    const ev = constraint === null ? prelim : evaluateAlternative({ kind: intake.kind, spec: (result as unknown as { inputs: MapInputs }).inputs.spec, network: net, line, head: read.head, branch: read.branch,
                                                                     constraint, cost: prelim.cost === null ? null : { amount: prelim.cost['amount'] as number | null, currency: prelim.cost['currency'] as string | null, basis: String(prelim.cost['basis']) },
                                                                     ...(intake.restoreShare === null ? {} : { restoreShare: intake.restoreShare }) });
    const alternativeId = newId();
    const out = await this.pipeline.write(this.derive(base, 'twin.supply.alternative.evaluate', 'TWS', disruptionId), principal,
      this.route(T_, D, 'twin.supply.alternative.evaluate', 'TWS', disruptionId), SupplyIntelCapability.alternative, async (cap, scope) => ({
        result: await cap.recordAlternative({ alternativeId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, disruptionId, mapId: String(read.m!['map_id']), key: intake.key,
          kind: intake.kind, title: intake.title, params: intake.params, twinId: intake.twinId, branchVersion: intake.branchVersion, evaluation: ev as unknown as Row, verdict: ev.verdict,
          reasons: ev.reasons, limits: ev.coverage_limits, constraint: constraintRecord, cost: read.cost, actor: principal.principalId, correlationId: corr }),
        targetType: 'TWS', targetId: alternativeId, targetVersion: '1', outboxEvent: null }));
    return { alternative: out.result, evaluation: ev, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  // ───────────────────────── the agent's B33 steps (SC2, SC3) ─────────────────────────
  /** What is pending for the domain's Supply Chain Agent (the hook's read and the scan's plan). */
  async pending(cap: SupplyIntelReads, agentId: string | null): Promise<{ agents: string[]; backlog: number; unread: Array<{ twin_id: string; source_key: string; count: number }>; remaps: string[] }> {
    const agents = ((await cap.readAgents().select(['agent_id'] as never).where('agent_kind' as never, '=', 'supply_chain' as never).where('status' as never, '=', 'active' as never)
      .orderBy('created_at' as never).orderBy('agent_id' as never).execute()) as Array<{ agent_id: string }>).map((a) => String(a.agent_id));
    const agent = agentId ?? agents[0] ?? null;
    let backlog = 0;
    const nets = await this.networks(cap);
    if (agent !== null) {
      for (const n of nets) {
        if (n.head === null) continue;
        const read = await cap.readScans().select(['scan_id'] as never).where('agent_id' as never, '=', agent as never).where('twin_id' as never, '=', n.twin_id as never)
          .where('twin_version' as never, '=', n.head as never).where('complete' as never, '=', true as never).limit(1).executeTakeFirst();
        if (read === undefined) backlog += 1;
      }
    }
    const unread: Array<{ twin_id: string; source_key: string; count: number }> = [];
    const sources = (await cap.readRecordSources().select(['twin_id', 'source_key'] as never).where('state' as never, '=', 'live' as never).orderBy('declared_at' as never).execute()) as Row[];
    for (const s of sources) {
      const ev = await cap.unreadEvidence(String(s['twin_id']), String(s['source_key']), EVIDENCE_PER_RUN);
      if (ev.length > 0) unread.push({ twin_id: String(s['twin_id']), source_key: String(s['source_key']), count: ev.length });
    }
    const remaps: string[] = [];
    const live = (await cap.readDisruptions().select(['disruption_id', 'last_map_id'] as never).where('state' as never, '=', 'mapped' as never).orderBy('opened_at' as never).execute()) as Row[];
    for (const d of live) {
      const m = (await cap.readMaps().select(['pinned'] as never).where('map_id' as never, '=', d['last_map_id'] as never).executeTakeFirst()) as Row | undefined;
      if (m === undefined) continue;
      for (const c of m['pinned'] as Row[]) {
        const h = await this.head(cap, String(c['id']));
        if (h !== null && h > Number(c['version']) && nets.some((n) => n.twin_id === c['id'])) { remaps.push(String(d['disruption_id'])); break; }
      }
    }
    return { agents, backlog, unread, remaps };
  }

  /**
   * THE AGENT'S B33 STEPS (inside its supply_scan, after B29's findings): per network with a live record source — the unread evidence retrieved
   * (each a governed retrieval in custody, reserved on the meter), the hidden tiers inferred from every record read so far, ONE governed draft;
   * then the mapped disruptions whose network moved, re-mapped (each a read before its write). Bounded: EVIDENCE_PER_RUN per source,
   * REMAPS_PER_RUN per run; the meter stops the run inside its session (B25-R) — what was committed stands, the rest waits for the next run.
   */
  async scan(d: SupplyIntelScanEnv, p: AuthenticatedPrincipal, a: SupplyIntelScanArgs): Promise<Row> {
    const T_ = a.tenantId; const D = a.domainId;
    a.meter.read('the supply networks\' record sources, unread evidence and live disruptions');
    const plan = (await d.pipeline.consequentialRead(d.env(SUPPLY_READ, 'TWS', null), p, d.route(SUPPLY_READ, 'TWS', null), SupplyIntelCapability.read, async (cap) => {
      const pend = await this.pending(cap, a.agentId);
      const sources = (await cap.readRecordSources().select(['twin_id', 'source_key'] as never).where('state' as never, '=', 'live' as never).orderBy('declared_at' as never).execute()) as Row[];
      const work: Array<{ twin_id: string; head: number | null; evidence: Array<{ id: string; version: number; digest: string; source_key: string }> }> = [];
      for (const twinId of [...new Set(sources.map((s) => String(s['twin_id'])))]) {
        const evidence: Array<{ id: string; version: number; digest: string; source_key: string }> = [];
        for (const s of sources.filter((x) => x['twin_id'] === twinId)) evidence.push(...await cap.unreadEvidence(twinId, String(s['source_key']), EVIDENCE_PER_RUN));
        work.push({ twin_id: twinId, head: await this.head(cap, twinId), evidence });
      }
      return { work, remaps: pend.remaps.slice(0, REMAPS_PER_RUN) };
    })).result;
    const inference: Row[] = []; const remapped: Row[] = []; const refused: Row[] = [];
    for (const w of plan.work) {
      if (w.head === null) { inference.push({ twin_id: w.twin_id, skipped: 'no admitted head on actual' }); continue; }
      // 1. the unread evidence, each a governed retrieval in custody under the agent's own session
      const fresh: Row[] = [];
      for (const e of w.evidence) {
        a.meter.read(`evidence ${e.id}@${e.version}`);
        const got = await this.series.retrieveBytes({ principal: p, tenantId: T_, domainId: D, correlationId: a.correlationId, purposeId: 'twin' }, e.id, e.version,
          { read_for: 'twin.supply.inference', twin_id: w.twin_id, source_key: e.source_key, version: String(e.version) });
        if ('refused' in got) { refused.push({ evidence: `${e.id}@${e.version}`, refused: got.refused }); continue; }
        const parsed = parseSupplyRecords(got.bytes.toString('utf8'));
        fresh.push({ source_key: e.source_key, evidence: { kind: 'evidence', id: e.id, version: e.version, digest: e.digest }, recognised: parsed.recognised, records: parsed.records, rejected: parsed.rejected });
      }
      // 2. the head and every record read so far (its own read), then the rule (pure)
      a.meter.read(`twin ${w.twin_id} v${w.head}: its elements, records and open inferences`);
      const state = (await d.pipeline.consequentialRead(d.env(SUPPLY_READ, 'TWN', w.twin_id), p, d.route(SUPPLY_READ, 'TWN', w.twin_id), SupplyIntelCapability.read, async (cap) => ({
        elements: await this.elements(cap, w.twin_id, w.head as number),
        reads: (await cap.readRecordReads().select(['evidence_id', 'evidence_version', 'evidence_digest', 'records'] as never).where('twin_id' as never, '=', w.twin_id as never)
          .where('recognised' as never, '=', true as never).orderBy('read_at' as never).execute()) as Row[],
        open: (await cap.readInferences().select(['inference_id', 'behind_site', 'material', 'state', 'twin_version'] as never).where('twin_id' as never, '=', w.twin_id as never)
          .where('state' as never, 'in', ['proposed', 'validated'] as never).execute()) as Row[],
      }))).result;
      const reads: RecordRead[] = [
        ...state.reads.map((r) => ({ evidence: { kind: 'evidence' as const, id: String(r['evidence_id']), version: Number(r['evidence_version']), digest: String(r['evidence_digest']) }, records: r['records'] as SupplyRecord[] })),
        ...fresh.filter((f) => f['recognised'] === true).map((f) => ({ evidence: f['evidence'] as RecordRead['evidence'], records: f['records'] as SupplyRecord[] })),
      ];
      const candidates = inferHiddenTiers(state.elements, reads);
      const unsourced = new Set(unsourcedOf(readNetwork(state.elements).network).map((u) => `${u.site}|${u.material}`));
      const withdraw = state.open.filter((o) => !unsourced.has(`${String(o['behind_site'])}|${String(o['material'])}`))
        .map((o) => ({ inference_id: o['inference_id'], reason: `the network's head v${String(w.head)} now declares a route of ${String(o['material'])} to ${String(o['behind_site'])}: the inference's basis is gone` }));
      const openKeys = new Set(state.open.map((o) => `${String(o['behind_site'])}|${String(o['material'])}`));
      const newCandidate = candidates.some((c) => !openKeys.has(`${c.behind_site}|${c.material}`));
      const behind = state.open.length > 0 && Math.max(...state.open.map((o) => Number(o['twin_version']))) < (w.head as number);
      if (fresh.length === 0 && withdraw.length === 0 && !newCandidate && !(candidates.length > 0 && behind)) {
        inference.push({ twin_id: w.twin_id, version: w.head, read: 0, candidates: candidates.length, note: 'nothing new to read or draft' });
        continue;
      }
      // 3. ONE governed draft (the agent's session, its running scan)
      a.meter.tick(`the inference draft of twin ${w.twin_id} v${w.head}`);
      const out = await d.pipeline.write(d.env('twin.supply.inference.draft', 'TWN', w.twin_id), p, d.route('twin.supply.inference.draft', 'TWN', w.twin_id), SupplyIntelCapability.draft,
        async (cap, scope) => ({ result: await cap.draftInferences({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, twinId: w.twin_id, version: w.head as number,
          reads: fresh, inferences: candidates.map((c) => { const { proposal_digest: _digest, ...rest } = c; void _digest; return rest; }), withdraw, agentId: a.agentId, runId: a.runId, actor: p.principalId, correlationId: a.correlationId }),
          targetType: 'TWN', targetId: w.twin_id, targetVersion: String(w.head), outboxEvent: null }));
      const r = out.result as Row;
      inference.push({ twin_id: w.twin_id, version: w.head, read: r['read'], drafted: r['drafted'], unchanged: (r['unchanged'] as Row[] | undefined)?.length ?? 0, superseded: r['superseded'],
                       withdrawn: r['withdrawn'], receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } });
    }
    for (const disruptionId of plan.remaps) {
      a.meter.read(`disruption ${disruptionId}: the networks it reaches`);
      a.meter.tick(`the re-map of disruption ${disruptionId}`);
      try {
        const m = await this.map(d.env('twin.supply.disruption.map', 'TWS', disruptionId), p, T_, D, disruptionId, { agentId: a.agentId, runId: a.runId });
        remapped.push({ disruption_id: disruptionId, map_no: m.map['map_no'], unchanged: m.map['unchanged'], affected: m.map['affected'] });
      } catch (e) {
        if (e instanceof HttpException && e.getStatus() === 403) a.refusals.push({ action: 'twin.supply.disruption.map', code: 'EYE-AUT-001', reason: textOf(e), at: new Date().toISOString() });
        else remapped.push({ disruption_id: disruptionId, error: textOf(e).slice(0, 300) });
      }
    }
    return { inference, remapped, refused_reads: refused, rule: 'hidden-tier@1; supply-map@1' };
  }

  // ───────────────────────── the schedule (AG-026) ─────────────────────────
  /**
   * THE HOOK: when the domain's active Supply Chain Agent has work pending, its supply_scan is STARTED through the agent runner (the executive's,
   * offered on the bridge), not awaited past `scanAwaitMs`; one scan per agent in flight — a tick never starts a second.
   */
  async afterTick(a: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string; correlationId: string }): Promise<Row> {
    const pend = (await this.pipeline.consequentialRead(this.envelopeFor(a.principal, a.tenantId, a.domainId, SUPPLY_READ, 'TWS', null, a.correlationId), a.principal,
      this.route(a.tenantId, a.domainId, SUPPLY_READ, 'TWS', null), SupplyIntelCapability.read, async (cap) => this.pending(cap, null))).result;
    const work = pend.backlog > 0 || pend.unread.length > 0 || pend.remaps.length > 0;
    if (pend.agents.length === 0 || !work) return { pending: { backlog: pend.backlog, unread: pend.unread, remaps: pend.remaps }, agents: pend.agents.length, scan: null };
    const agentId = pend.agents[0] as string;
    // the executive's runner (AgentsService.run) runs any task of the agent's kind; its bridge type names B30's task — the supply scan is the same call
    const runner = ReconciliationBridge.runner() as unknown as ((x: Row) => Promise<{ runId: string; agentId: string; outcome: string; stopReason: string | null }>) | null;
    const live = this.inFlight.get(agentId);
    let scan: Row;
    if (runner === null) scan = { skipped: 'no agent runner in this application' };
    else if (live !== undefined) scan = { skipped: `a supply scan of agent ${agentId} is in flight since ${live.since}; the pending work waits for it`, agent_id: agentId, in_flight_since: live.since };
    else {
      const since = new Date().toISOString();
      const done: Promise<Row> = runner({ agentId, tenantId: a.tenantId, domainId: a.domainId, task: 'supply_scan', trigger: { kind: 'scheduler', principalId: a.principal.principalId, ref: SUPPLY_SCAN_HOOK },
                                          roomId: null, packageId: null, version: null, correlationId: a.correlationId })
        .then((r): Row => ({ run_id: r.runId, agent_id: r.agentId, outcome: r.outcome, stop_reason: r.stopReason }), (err: unknown): Row => ({ error: textOf(err).slice(0, 500) }))
        .finally(() => { this.inFlight.delete(agentId); });
      this.inFlight.set(agentId, { since, done });
      let timer: NodeJS.Timeout | undefined;
      const first = await Promise.race([done, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), this.scanAwaitMs); })]);
      clearTimeout(timer);
      if (first !== null) scan = first;
      else {
        scan = { in_flight: true, agent_id: agentId, since, note: `the scan goes on after the tick (waited ${this.scanAwaitMs} ms); its run closes itself` };
        void done.then((r) => { this.log.log(`supply scan of agent ${agentId} (started ${since}) ended after the tick: ${JSON.stringify(r).slice(0, 300)}`); });
      }
    }
    return { pending: { backlog: pend.backlog, unread: pend.unread, remaps: pend.remaps }, agents: pend.agents.length, scan };
  }

  /** The intake checks the routes share (the ports check again). */
  static alternativeIntake(p: Row, corr: string): AlternativeIntake {
    const bad = (m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', corr, `supply alternative rejected (shape): ${m}`), 422); };
    const key = typeof p['key'] === 'string' ? p['key'] : bad('key is the option\'s short name (its branch is alt-<key>)');
    if (!(ALTERNATIVE_KINDS as readonly string[]).includes(String(p['kind']))) bad('kind is sourcing, inventory or routing');
    if (typeof p['twinId'] !== 'string' || !UUID.test(p['twinId'])) bad('twinId is the network the branch belongs to');
    if (!Number.isInteger(p['branchVersion']) || Number(p['branchVersion']) < 1) bad('branchVersion is the admitted version of the branch alt-<key>');
    const sets = Array.isArray(p['constraintSets']) ? (p['constraintSets'] as unknown[]).filter((s): s is string => typeof s === 'string') : [];
    const c = p['cost'] as Row | undefined;
    const cost = c === undefined || c === null ? null : (typeof c['amount'] === 'number' && typeof c['currency'] === 'string' && typeof c['basis'] === 'string'
      ? { amount: c['amount'] as number, currency: c['currency'] as string, basis: c['basis'] as string } : bad('cost is {amount, currency, basis}'));
    const r = p['costRef'] as Row | undefined;
    const costRef = r === undefined || r === null ? null : (typeof r['twinId'] === 'string' && UUID.test(r['twinId']) && typeof r['key'] === 'string' && typeof r['currency'] === 'string'
      ? { twinId: r['twinId'] as string, key: r['key'] as string, currency: r['currency'] as string, multiplier: typeof r['multiplier'] === 'number' ? r['multiplier'] as number : null }
      : bad('costRef is {twinId, key, currency, multiplier?}'));
    const rs = p['restoreShare'];
    if (rs !== undefined && rs !== null && !(typeof rs === 'number' && rs > 0 && rs <= 1)) bad('restoreShare lies in (0, 1]');
    return { key, kind: p['kind'] as AlternativeKind, title: typeof p['title'] === 'string' ? p['title'] : '', twinId: p['twinId'] as string, branchVersion: Number(p['branchVersion']),
             params: (typeof p['params'] === 'object' && p['params'] !== null ? p['params'] : {}) as Row, constraintSets: sets, cost, costRef, restoreShare: typeof rs === 'number' ? rs : null };
  }
}

export type { ScopeContext };
