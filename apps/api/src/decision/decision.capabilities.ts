/**
 * DECISION CAPABILITIES — Phase 6 (L9 Decision Intelligence), stage P6-M1.
 *
 * The same shape as the twin capabilities: one implementation, narrow interfaces,
 * every write a SECURITY DEFINER port that asserts the caller's own bound action.
 * A decision owner holds `declare`, `version`, `option`, `terms`, `choice`, `propose`
 * and `withdraw` one at a time — each a separate governed write with its own receipt.
 * Dissent is its own capability (a named human, on their own behalf). Approvals,
 * commitment, outcomes and replay arrive with 0042/0043.
 */
import { sql } from 'kysely';
import type { Tx } from '../shared/db.js';

export type ConsequenceKind = 'run' | 'forecast' | 'claim' | 'evidence' | 'assumption' | 'warning';
export interface Citation { kind: ConsequenceKind; id: string; version: number; digest: string }

/** One exact canonical object version with the controls it carries. */
export interface CitedObjectRow {
  object_id: string; object_type: string; object_version: number; content_digest: string; lifecycle_state: string;
  truth_state: string; synthetic_state: boolean; classification: string; rights_profile: string | null;
  residency_profile: string | null; retention_profile: string | null; access_policy_ref: string | null; recorded_at: string;
  quality_state: Record<string, unknown> | null;
}

abstract class DecisionCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(relation: string): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }
  protected async call<T>(q: ReturnType<typeof sql>): Promise<T[]> {
    const r = await q.execute(this.#tx);
    return r.rows as T[];
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface DecisionReads {
  readonly action: string;
  readPackages(): any;
  readVersions(): any;
  readOptions(): any;
  readDissent(): any;
  readEvents(): any;
  readStrategy(): any;
  readRuns(): any;
  readTwins(): any;
  readTwinVersions(): any;
  readIndicators(): any;
  readWarnings(): any;
  readBranches(): any;
  readApprovals(): any;
  readCommitments(): any;
  readRoleBindings(): any;
  readReplays(): any;
  liveApprovals(a: { packageId: string; version: number }): Promise<Array<{ approval_id: string; approver_principal_id: string }>>;
  /** The exact object version a citation names (latest when version is null), under RLS. */
  citedObject(a: { objectType: string; id: string; version: number | null }): Promise<CitedObjectRow | undefined>;
  versionDigest(a: { packageId: string; version: number }): Promise<string>;
  rebuildProjections(): Promise<Array<{ projection: string; live_rows: string; rebuilt_rows: string; mismatched: string }>>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface DeclareWrites extends DecisionReads {
  declarePackage(a: { packageId: string; tenantId: string; domainId: string; decisionObjectId: string; title: string; statement: string; owner: string;
                      actor: string; eventId: string; correlationId: string }): Promise<void>;
}
export interface VersionWrites extends DecisionReads {
  openVersion(a: { packageId: string; tenantId: string; domainId: string; knownAt: string; observedThrough: string | null; carryFrom: number | null;
                   actor: string; eventId: string; correlationId: string }): Promise<number>;
}
export interface OptionWrites extends DecisionReads {
  setOption(a: { optionId: string; tenantId: string; domainId: string; packageId: string; version: number; key: string; title: string; kind: 'intervention' | 'status_quo';
                 consequences: Citation[]; simulated: boolean; unsimulatedReason: string | null; uncertainty: Record<string, unknown>;
                 secondOrder: unknown[]; risks: unknown[]; opportunities: unknown[]; reversibility: string | null; syntheticState: boolean; controls: unknown;
                 actor: string; eventId: string; correlationId: string }): Promise<void>;
}
export interface TermsWrites extends DecisionReads {
  setTerms(a: { tenantId: string; domainId: string; packageId: string; version: number; objectives: string[]; constraints: unknown[];
                approverPolicy: Record<string, unknown>; monitoringConditions: unknown[]; reversibility: string | null; informationValue: string | null;
                secondOrder: unknown[]; risks: unknown[]; opportunities: unknown[]; actor: string; eventId: string; correlationId: string }): Promise<void>;
}
export interface ChoiceWrites extends DecisionReads {
  setChoice(a: { tenantId: string; domainId: string; packageId: string; version: number; choice: Record<string, unknown>; actor: string; eventId: string; correlationId: string }): Promise<void>;
}
export interface DissentWrites extends DecisionReads {
  recordDissent(a: { dissentId: string; tenantId: string; domainId: string; packageId: string; version: number; principal: string; position: string; rationale: string;
                     citation: Citation | null; eventId: string; correlationId: string }): Promise<void>;
}
export interface ProposeWrites extends DecisionReads {
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  proposeVersion(a: { packageId: string; tenantId: string; domainId: string; version: number; expectedDigest: string; headerDigest: string; baselineRunId: string | null;
                      syntheticState: boolean; controls: unknown; dependencies: Array<{ kind: string; id: string; key: string }>;
                      actor: string; eventId: string; correlationId: string }): Promise<{ version_digest: string; baseline_run_id: string | null }>;
}
export interface ApproveWrites extends DecisionReads {
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  recordApproval(a: { approvalId: string; tenantId: string; domainId: string; packageId: string; version: number; approver: string; decision: 'approve' | 'reject';
                      versionDigest: string; rationale: string; conditions: unknown[]; headerDigest: string; eventId: string; correlationId: string }):
    Promise<{ state: string; live_approvals: number; quorum: number; expires_at: string; eligible_by: string }>;
  revokeApproval(a: { approvalId: string; tenantId: string; domainId: string; reason: string; eventId: string; correlationId: string }): Promise<{ state: string; live_approvals: number; quorum: number }>;
}
export interface CommitWrites extends DecisionReads {
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  commitPackage(a: { commitmentId: string; tenantId: string; domainId: string; packageId: string; version: number; committer: string; versionDigest: string; headerDigest: string;
                     title: string; statement: string; eventId: string; correlationId: string }):
    Promise<{ commitment_id: string; approvals: Array<{ approval_id: string; approver: string }>; op_class: string; decided_at: string }>;
}
export interface ReplayWrites extends DecisionReads {
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  /** The five layers under the version's cut-offs and the bound upper as_of — computed in the database, under the caller's own read authority. */
  replayLayers(a: { packageId: string; version: number; asOf: string | null }): Promise<Record<string, unknown>>;
  recordReplay(a: { replayId: string; tenantId: string; domainId: string; packageId: string; version: number; asOf: string; contentDigest: string; headerDigest: string;
                    reader: string; purpose: string; unavailable: unknown[]; summary: Record<string, unknown>; eventId: string; correlationId: string }): Promise<void>;
}
export interface WithdrawWrites extends DecisionReads {
  withdrawPackage(a: { packageId: string; tenantId: string; domainId: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<void>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class DecisionCapabilityImpl extends DecisionCore implements DeclareWrites, VersionWrites, OptionWrites, TermsWrites, ChoiceWrites, DissentWrites, ProposeWrites, WithdrawWrites, ApproveWrites, CommitWrites, ReplayWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }

  readPackages(): any { return this.from('decision.packages_current'); }
  readVersions(): any { return this.from('decision.package_versions'); }
  readOptions(): any { return this.from('decision.options'); }
  readDissent(): any { return this.from('decision.dissent'); }
  readEvents(): any { return this.from('decision.package_events'); }
  readStrategy(): any { return this.from('graph.strategy_current'); }
  readRuns(): any { return this.from('simulation.runs_current'); }
  readTwins(): any { return this.from('twin.twins_current'); }
  readTwinVersions(): any { return this.from('twin.twin_versions'); }
  readIndicators(): any { return this.from('prediction.indicators_current'); }
  readWarnings(): any { return this.from('prediction.warnings_current'); }
  readBranches(): any { return this.from('prediction.branches_current'); }
  readApprovals(): any { return this.from('decision.approvals'); }
  readCommitments(): any { return this.from('decision.commitments'); }
  readRoleBindings(): any { return this.from('identity.role_bindings'); }
  readReplays(): any { return this.from('decision.replays'); }

  async replayLayers(a: { packageId: string; version: number; asOf: string | null }): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select decision.replay_layers(${a.packageId}::uuid, ${a.version}::int, ${a.asOf}::timestamptz) as r`);
    const r = rows[0]?.r;
    if (r === undefined) throw new Error('replay returned no row');
    return r;
  }
  async recordReplay(a: Parameters<ReplayWrites['recordReplay']>[0]): Promise<void> {
    await this.call(sql`select decision.record_replay(${a.replayId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.asOf}::timestamptz,
      ${a.contentDigest}, ${a.headerDigest}, ${a.reader}::uuid, ${a.purpose}, ${JSON.stringify(a.unavailable)}::jsonb, ${JSON.stringify(a.summary)}::jsonb, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }

  async liveApprovals(a: { packageId: string; version: number }) {
    return this.call<{ approval_id: string; approver_principal_id: string }>(sql`select approval_id::text, approver_principal_id::text from decision.live_approvals(${a.packageId}::uuid, ${a.version}::int)`);
  }

  async citedObject(a: { objectType: string; id: string; version: number | null }): Promise<CitedObjectRow | undefined> {
    const rows = await this.call<CitedObjectRow>(sql`
      select o.object_id::text, o.object_type, o.object_version::int, o.content_digest, o.lifecycle_state, o.truth_state,
             o.synthetic_state, o.classification, o.rights_profile, o.residency_profile, o.retention_profile, o.access_policy_ref,
             to_char(o.recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') as recorded_at, o.quality_state
        from objects.canonical_objects o
       where o.object_type = ${a.objectType} and o.object_id = ${a.id}::uuid
         and (${a.version}::int is null or o.object_version = ${a.version}::int)
       order by o.object_version desc limit 1`);
    return rows[0];
  }

  async versionDigest(a: { packageId: string; version: number }): Promise<string> {
    const rows = await this.call<{ d: string }>(sql`select decision.version_digest(${a.packageId}::uuid, ${a.version}::int) as d`);
    return String(rows[0]?.d ?? '');
  }

  async rebuildProjections() {
    return this.call<{ projection: string; live_rows: string; rebuilt_rows: string; mismatched: string }>(
      sql`select projection, live_rows::text, rebuilt_rows::text, mismatched::text from decision.rebuild_projections()`);
  }

  async declarePackage(a: Parameters<DeclareWrites['declarePackage']>[0]): Promise<void> {
    await this.call(sql`select decision.declare_package(${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decisionObjectId}::uuid,
      ${a.title}, ${a.statement}, ${a.owner}::uuid, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
  async openVersion(a: Parameters<VersionWrites['openVersion']>[0]): Promise<number> {
    const rows = await this.call<{ v: number }>(sql`select decision.open_version(${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid,
      ${a.knownAt}::timestamptz, ${a.observedThrough}::date, ${a.carryFrom}::int, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as v`);
    return Number(rows[0]?.v);
  }
  async setOption(a: Parameters<OptionWrites['setOption']>[0]): Promise<void> {
    await this.call(sql`select decision.set_option(${a.optionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int,
      ${a.key}, ${a.title}, ${a.kind}, ${JSON.stringify(a.consequences)}::jsonb, ${a.simulated}, ${a.unsimulatedReason}, ${JSON.stringify(a.uncertainty)}::jsonb,
      ${JSON.stringify(a.secondOrder)}::jsonb, ${JSON.stringify(a.risks)}::jsonb, ${JSON.stringify(a.opportunities)}::jsonb, ${a.reversibility},
      ${a.syntheticState}, ${JSON.stringify(a.controls ?? {})}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
  async setTerms(a: Parameters<TermsWrites['setTerms']>[0]): Promise<void> {
    await this.call(sql`select decision.set_terms(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int,
      ${JSON.stringify(a.objectives)}::jsonb, ${JSON.stringify(a.constraints)}::jsonb, ${JSON.stringify(a.approverPolicy)}::jsonb, ${JSON.stringify(a.monitoringConditions)}::jsonb,
      ${a.reversibility}, ${a.informationValue}, ${JSON.stringify(a.secondOrder)}::jsonb, ${JSON.stringify(a.risks)}::jsonb, ${JSON.stringify(a.opportunities)}::jsonb,
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
  async setChoice(a: Parameters<ChoiceWrites['setChoice']>[0]): Promise<void> {
    await this.call(sql`select decision.set_choice(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int,
      ${JSON.stringify(a.choice)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
  async recordDissent(a: Parameters<DissentWrites['recordDissent']>[0]): Promise<void> {
    await this.call(sql`select decision.record_dissent(${a.dissentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int,
      ${a.principal}::uuid, ${a.position}, ${a.rationale}, ${a.citation === null ? null : JSON.stringify(a.citation)}::jsonb, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(
      sql`select content_digest from objects.admit_version(${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0];
    if (r === undefined) throw new Error('admission returned no row');
    return { contentDigest: r.content_digest };
  }
  async proposeVersion(a: Parameters<ProposeWrites['proposeVersion']>[0]) {
    const rows = await this.call<{ r: { version_digest: string; baseline_run_id: string | null } }>(sql`select decision.propose_version(
      ${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.expectedDigest}, ${a.headerDigest}, ${a.baselineRunId}::uuid,
      ${a.syntheticState}, ${JSON.stringify(a.controls ?? {})}::jsonb, ${JSON.stringify(a.dependencies)}::jsonb, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r;
    if (r === undefined) throw new Error('proposal returned no row');
    return r;
  }
  async recordApproval(a: Parameters<ApproveWrites['recordApproval']>[0]) {
    const rows = await this.call<{ r: { state: string; live_approvals: number; quorum: number; expires_at: string; eligible_by: string } }>(sql`select decision.record_approval(
      ${a.approvalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.approver}::uuid, ${a.decision}, ${a.versionDigest},
      ${a.rationale}, ${JSON.stringify(a.conditions)}::jsonb, ${a.headerDigest}, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r;
    if (r === undefined) throw new Error('approval returned no row');
    return r;
  }
  async revokeApproval(a: Parameters<ApproveWrites['revokeApproval']>[0]) {
    const rows = await this.call<{ r: { state: string; live_approvals: number; quorum: number } }>(sql`select decision.revoke_approval(
      ${a.approvalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r;
    if (r === undefined) throw new Error('revocation returned no row');
    return r;
  }
  async commitPackage(a: Parameters<CommitWrites['commitPackage']>[0]) {
    const rows = await this.call<{ r: { commitment_id: string; approvals: Array<{ approval_id: string; approver: string }>; op_class: string; decided_at: string } }>(sql`select decision.commit_package(
      ${a.commitmentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.committer}::uuid, ${a.versionDigest}, ${a.headerDigest},
      ${a.title}, ${a.statement}, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r;
    if (r === undefined) throw new Error('commitment returned no row');
    return r;
  }
  async withdrawPackage(a: Parameters<WithdrawWrites['withdrawPackage']>[0]): Promise<void> {
    await this.call(sql`select decision.withdraw_package(${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const DecisionCapability = {
  read(tx: Tx, action: string): DecisionReads { return new DecisionCapabilityImpl(tx, action); },
  declare(tx: Tx, action: string): DeclareWrites { return new DecisionCapabilityImpl(tx, action); },
  version(tx: Tx, action: string): VersionWrites { return new DecisionCapabilityImpl(tx, action); },
  option(tx: Tx, action: string): OptionWrites { return new DecisionCapabilityImpl(tx, action); },
  terms(tx: Tx, action: string): TermsWrites { return new DecisionCapabilityImpl(tx, action); },
  choice(tx: Tx, action: string): ChoiceWrites { return new DecisionCapabilityImpl(tx, action); },
  dissent(tx: Tx, action: string): DissentWrites { return new DecisionCapabilityImpl(tx, action); },
  propose(tx: Tx, action: string): ProposeWrites { return new DecisionCapabilityImpl(tx, action); },
  withdraw(tx: Tx, action: string): WithdrawWrites { return new DecisionCapabilityImpl(tx, action); },
  approve(tx: Tx, action: string): ApproveWrites { return new DecisionCapabilityImpl(tx, action); },
  commit(tx: Tx, action: string): CommitWrites { return new DecisionCapabilityImpl(tx, action); },
  replay(tx: Tx, action: string): ReplayWrites { return new DecisionCapabilityImpl(tx, action); },
};
