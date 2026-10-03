/**
 * CP-6 B30 part `branches` (0103 §BR; F-P5-03) — THE BRANCH CAPABILITIES: the twin capability's shape (one implementation, narrow interfaces,
 * every write a SECURITY DEFINER port that asserts the caller's own bound action). Reads go through the tables' row security (this domain's
 * merges, resolutions, freezes, policies and ledger) and the INVOKER reads (twin.version_freshness, twin.confidence_rollup, twin.served_state).
 *
 *   twin.freshness.policy  → twin.set_freshness_policy          (the twin's own owner)
 *   twin.branch.merge      → twin.open_merge / complete_merge / close_merge   (a twin owner opens; the twin's own owner completes or refuses)
 *   twin.branch.reconcile  → twin.resolve_merge_key           (the twin's own owner)
 *   twin.branch.restore    → twin.restore_checkpoint          (the twin's own owner; the draft opened just before under twin.version)
 *   twin.snapshot.freeze   → twin.freeze_snapshot / lift_freeze  (the twin's own owner)
 *   twin.ground            → twin.ground_element               (the EXISTING grounding port — a merge's elements and a SCENARIO element)
 *   executive.attention.tick → twin.freshness_sweep            (the tick step `twin-freshness`)
 *
 * The merge's draft and admission go through TwinCapability (twin.version / twin.version.admit) — each its own governed write; a port here
 * never calls another port.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';
import { TwinCapability, type AdmitWrites, type Citation, type TwinReads, type VersionWrites } from '../twin.capabilities.js';

type Row = Record<string, unknown>;

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface BranchReads {
  readonly action: string;
  /** the twin capability's reads, on the same transaction and action */
  readonly twin: TwinReads;
  readMerges(): any;
  readResolutions(): any;
  readFreezes(): any;
  readPolicies(): any;
  readEvents(): any;
  readScenarioAssumptions(): any;
  dbNow(): Promise<string>;
  versionFreshness(twinId: string, version: number): Promise<Row | null>;
  confidenceRollup(twinId: string, version: number): Promise<Row | null>;
  servedState(twinId: string, asOf: string | null): Promise<Row | null>;
  diff(twinId: string, version: number, against: number): Promise<Row[]>;
  currentResolutions(mergeId: string): Promise<Row[]>;
  unresolved(mergeId: string): Promise<string[]>;
  mergeExpected(mergeId: string): Promise<Row | null>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Ids { tenantId: string; domainId: string; actor: string; eventId: string; correlationId: string }
export interface PolicyWrites extends BranchReads {
  setPolicy(a: Ids & { twinId: string; maxAgeDays: number; keyMaxAge: Record<string, number>; nearExpiryHours: number | null; note: string }): Promise<Row>;
}
export interface MergeWrites extends BranchReads {
  openMerge(a: Ids & { mergeId: string; twinId: string; sourceBranch: string; reason: string }): Promise<Row>;
  completeMerge(a: Ids & { mergeId: string }): Promise<Row>;
  closeMerge(a: Ids & { mergeId: string; outcome: 'refused' | 'withdrawn'; reason: string }): Promise<Row>;
}
export interface ReconcileWrites extends BranchReads {
  resolveKey(a: Ids & { mergeId: string; key: string; resolution: string; kind: string | null; value: unknown; unit: string | null; citations: Citation[]; note: string }): Promise<Row>;
}
export interface RestoreWrites extends BranchReads {
  restore(a: Ids & { twinId: string; branchId: string; fromVersion: number; draftVersion: number; reason: string }): Promise<Row>;
}
export interface FreezeWrites extends BranchReads {
  freeze(a: Ids & { freezeId: string; twinId: string; branchId: string; version: number | null; warning: string; expiresAt: string }): Promise<Row>;
  lift(a: Ids & { freezeId: string; reason: string }): Promise<Row>;
}
/** The EXISTING grounding port with any element kind (a merge's branch element as it stands, a reconciled value, a SCENARIO element). */
export interface ElementWrites extends BranchReads {
  groundElement(a: {
    elementId: string; tenantId: string; domainId: string; twinId: string; version: number; key: string; kind: string; basisTruthState: string | null;
    value: unknown; unit: string | null; citations: Citation[]; health: string; validFrom: string | null; validTo: string | null; confidence: number | null;
    syntheticState: boolean; controls: unknown; inheritedValidation: string | null; actor: string; eventId: string; correlationId: string;
  }): Promise<boolean>;
}
export interface TickWrites extends BranchReads {
  sweep(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Row>;
}
/** The merge completion's draft (twin.version) and admission (twin.version.admit), on the twin capability, beside the branch reads. */
export interface DraftWrites extends BranchReads { readonly twinVersion: VersionWrites }
export interface AdmitStep extends BranchReads { readonly twinAdmit: AdmitWrites }

/* eslint-disable @typescript-eslint/no-explicit-any */
class BranchCapabilityImpl implements PolicyWrites, MergeWrites, ReconcileWrites, RestoreWrites, FreezeWrites, ElementWrites, TickWrites, DraftWrites, AdmitStep {
  readonly #tx: Tx;
  readonly #action: string;
  readonly twin: TwinReads;
  readonly twinVersion: VersionWrites;
  readonly twinAdmit: AdmitWrites;
  constructor(tx: Tx, action: string) {
    this.#tx = tx; this.#action = action;
    this.twin = TwinCapability.read(tx, action); this.twinVersion = TwinCapability.version(tx, action); this.twinAdmit = TwinCapability.admit(tx, action);
  }
  get action(): string { return this.#action; }
  private from(relation: string): any { return this.#tx.selectFrom(relation as never); }
  private async one(q: ReturnType<typeof sql>): Promise<Row> {
    const r = await q.execute(this.#tx);
    return ((r.rows[0] as { r?: Row } | undefined)?.r) ?? {};
  }
  private async maybe(q: ReturnType<typeof sql>): Promise<Row | null> {
    const r = await q.execute(this.#tx);
    return ((r.rows[0] as { r?: Row | null } | undefined)?.r) ?? null;
  }

  readMerges(): any { return this.from('twin.branch_merges'); }
  readResolutions(): any { return this.from('twin.merge_resolutions'); }
  readFreezes(): any { return this.from('twin.snapshot_freezes'); }
  readPolicies(): any { return this.from('twin.freshness_policies'); }
  readEvents(): any { return this.from('twin.branch_events'); }
  readScenarioAssumptions(): any { return this.from('prediction.scenario_assumptions'); }
  async dbNow(): Promise<string> {
    const r = await sql<{ t: string }>`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as t`.execute(this.#tx);
    return String(r.rows[0]?.t);
  }
  async versionFreshness(twinId: string, version: number) { return this.maybe(sql`select twin.version_freshness(${twinId}::uuid, ${version}::int) as r`); }
  async confidenceRollup(twinId: string, version: number) { return this.maybe(sql`select twin.confidence_rollup(${twinId}::uuid, ${version}::int) as r`); }
  async servedState(twinId: string, asOf: string | null) { return this.maybe(sql`select twin.served_state(${twinId}::uuid, ${asOf}::timestamptz) as r`); }
  async diff(twinId: string, version: number, against: number): Promise<Row[]> {
    const r = await this.maybe(sql`select twin.tbr_diverging(${twinId}::uuid, ${version}::int, ${against}::int, null::int) as r`);
    return (r as unknown as Row[] | null) ?? [];
  }
  async currentResolutions(mergeId: string): Promise<Row[]> {
    const r = await sql<Row>`select key, ordinal, resolution, kind, value, unit, citations, note, resolved_by, resolved_at from twin.tbr_resolutions(${mergeId}::uuid) order by key`.execute(this.#tx);
    return r.rows;
  }
  async unresolved(mergeId: string): Promise<string[]> {
    const r = await sql<{ u: string[] }>`select twin.tbr_unresolved(${mergeId}::uuid) as u`.execute(this.#tx);
    return (r.rows[0]?.u ?? []) as string[];
  }
  async mergeExpected(mergeId: string) { return this.maybe(sql`select twin.tbr_merge_expected(${mergeId}::uuid) as r`); }

  async setPolicy(a: Parameters<PolicyWrites['setPolicy']>[0]) {
    return this.one(sql`select twin.set_freshness_policy(${a.twinId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.maxAgeDays}::int, ${JSON.stringify(a.keyMaxAge)}::jsonb,
      ${a.nearExpiryHours}::int, ${a.note}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async openMerge(a: Parameters<MergeWrites['openMerge']>[0]) {
    return this.one(sql`select twin.open_merge(${a.mergeId}::uuid, ${a.twinId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceBranch}, ${a.reason},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async completeMerge(a: Parameters<MergeWrites['completeMerge']>[0]) {
    return this.one(sql`select twin.complete_merge(${a.mergeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async closeMerge(a: Parameters<MergeWrites['closeMerge']>[0]) {
    return this.one(sql`select twin.close_merge(${a.mergeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.outcome}, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async resolveKey(a: Parameters<ReconcileWrites['resolveKey']>[0]) {
    return this.one(sql`select twin.resolve_merge_key(${a.mergeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.key}, ${a.resolution}, ${a.kind},
      ${a.value === undefined || a.value === null ? null : JSON.stringify(a.value)}::jsonb, ${a.unit}, ${JSON.stringify(a.citations)}::jsonb, ${a.note},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async restore(a: Parameters<RestoreWrites['restore']>[0]) {
    return this.one(sql`select twin.restore_checkpoint(${a.twinId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.branchId}, ${a.fromVersion}::int, ${a.draftVersion}::int,
      ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async freeze(a: Parameters<FreezeWrites['freeze']>[0]) {
    return this.one(sql`select twin.freeze_snapshot(${a.freezeId}::uuid, ${a.twinId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.branchId}, ${a.version}::int,
      ${a.warning}, ${a.expiresAt}::timestamptz, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async lift(a: Parameters<FreezeWrites['lift']>[0]) {
    return this.one(sql`select twin.lift_freeze(${a.freezeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async groundElement(a: Parameters<ElementWrites['groundElement']>[0]): Promise<boolean> {
    const r = await sql<{ m: boolean }>`select twin.ground_element(
      ${a.elementId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid, ${a.version}::int, ${a.key}, ${a.kind},
      ${a.basisTruthState}, ${JSON.stringify(a.value ?? null)}::jsonb, ${a.unit}, ${JSON.stringify(a.citations)}::jsonb, ${a.health},
      ${a.validFrom}::date, ${a.validTo}::date, ${a.confidence}::numeric, ${a.syntheticState}, ${JSON.stringify(a.controls ?? {})}::jsonb,
      ${a.inheritedValidation}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as m`.execute(this.#tx);
    return r.rows[0]?.m === true;
  }
  async sweep(a: Parameters<TickWrites['sweep']>[0]) {
    return this.one(sql`select twin.freshness_sweep(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const BranchCapability = {
  read(tx: Tx, action: string): BranchReads { return new BranchCapabilityImpl(tx, action); },
  policy(tx: Tx, action: string): PolicyWrites { return new BranchCapabilityImpl(tx, action); },
  merge(tx: Tx, action: string): MergeWrites { return new BranchCapabilityImpl(tx, action); },
  reconcile(tx: Tx, action: string): ReconcileWrites { return new BranchCapabilityImpl(tx, action); },
  restore(tx: Tx, action: string): RestoreWrites { return new BranchCapabilityImpl(tx, action); },
  freeze(tx: Tx, action: string): FreezeWrites { return new BranchCapabilityImpl(tx, action); },
  /** twin.ground: the existing grounding port (a merge's elements; a scenario element) */
  ground(tx: Tx, action: string): ElementWrites { return new BranchCapabilityImpl(tx, action); },
  /** twin.version: the merge's or the restore's draft, through the twin capability */
  draft(tx: Tx, action: string): DraftWrites { return new BranchCapabilityImpl(tx, action); },
  /** twin.version.admit: the merge's admission, through the twin capability (the existing admit) */
  admit(tx: Tx, action: string): AdmitStep { return new BranchCapabilityImpl(tx, action); },
  tick(tx: Tx, action: string): TickWrites { return new BranchCapabilityImpl(tx, action); },
};
