/**
 * GATE CAPABILITIES — CP-6 B34 (0090 §G; F-P6-04 human gate completeness).
 *
 * One narrow shape per gate write, every one a SECURITY DEFINER port that asserts the caller's own bound action:
 *
 *   act       decision.gate_act — review, acknowledge, ready (the INDEPENDENT reviewer, on the information package digest),
 *             defer, reject, request_information, resume (`decision.gate.<act>`, each its own PDP action — HX-12);
 *   override  decision.grant_override (`decision.override.grant`: normal by a decision authority, conditions only; emergency by
 *             an executive, + a quorum shortfall and a mandatory review task) and decision.review_override
 *             (`decision.override.review`, never the grantor);
 *   delegate  decision.delegate_approval / decision.end_delegation (`decision.delegation.grant` / `.end`: an approver's own
 *             authority on one package, ≤ 30 days, ended or reassigned by the delegator);
 *   board     decision.reserve_board_class (`decision.board.reserve`, an executive, on a draft);
 *   preview   decision.commit_preview (`decision.commit.preview`: the committing authority's recorded reading, digested — the
 *             commit carries the digest within 30 minutes — HX-13);
 *   control   decision.record_control (`decision.control.record`: versioned policy revisions and control decisions).
 *
 * Every shape reads the gate as it stands (decision.gate_status, decision.information_package) under the caller's context.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

abstract class GateCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined) throw new Error(`${what} returned no row`);
    return row ?? {};
  }
}

export interface GateReads {
  readonly action: string;
  /** The gate as it stands for one version (null when the package or version is not in the caller's domain). */
  gateStatus(a: { tenantId: string; domainId: string; packageId: string; version: number }): Promise<Row | null>;
  /** What an independent reviewer reads, and its digest. */
  informationPackage(a: { tenantId: string; domainId: string; packageId: string; version: number }): Promise<Row | null>;
  /** The controls in force at an instant (per key, the latest version recorded and effective by then). */
  controlsAsOf(a: { tenantId: string; domainId: string; at: string }): Promise<Row[]>;
}
export interface GateActWrites extends GateReads {
  gateAct(a: { actionId: string; tenantId: string; domainId: string; packageId: string; version: number; act: string; rationale: string; nextReviewAt: string | null;
               infoRequest: string | null; packageDigest: string | null; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}
export interface OverrideWrites extends GateReads {
  grantOverride(a: { overrideId: string; tenantId: string; domainId: string; packageId: string; version: number; kind: string; rationale: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  reviewOverride(a: { tenantId: string; domainId: string; overrideId: string; outcome: string; note: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}
export interface DelegationWrites extends GateReads {
  delegateApproval(a: { delegationId: string; tenantId: string; domainId: string; packageId: string; delegate: string; expiresAt: string; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  endDelegation(a: { tenantId: string; domainId: string; delegationId: string; reason: string; reassignTo: string | null; newDelegationId: string; expiresAt: string | null;
                     actor: string; eventId: string; correlationId: string }): Promise<Row>;
}
export interface BoardWrites extends GateReads {
  reserveBoard(a: { tenantId: string; domainId: string; packageId: string; board: Row; rationale: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}
export interface PreviewWrites extends GateReads {
  commitPreview(a: { previewId: string; tenantId: string; domainId: string; packageId: string; version: number; versionDigest: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}
export interface ControlWrites extends GateReads {
  recordControl(a: { controlId: string; tenantId: string; domainId: string; kind: string; controlKey: string; body: Row; rationale: string; effectiveFrom: string | null; packageId: string | null;
                     actor: string; eventId: string; correlationId: string }): Promise<Row>;
}

class GateCapabilityImpl extends GateCore implements GateActWrites, OverrideWrites, DelegationWrites, BoardWrites, PreviewWrites, ControlWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }

  async gateStatus(a: Parameters<GateReads['gateStatus']>[0]): Promise<Row | null> {
    const r = await this.one(sql`select decision.gate_status(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int) as r`, 'gate_status');
    return Object.keys(r).length === 0 ? null : r;
  }
  async informationPackage(a: Parameters<GateReads['informationPackage']>[0]): Promise<Row | null> {
    const r = await this.one(sql`select decision.information_package(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int) as r`, 'information_package');
    return Object.keys(r).length === 0 ? null : r;
  }
  async controlsAsOf(a: Parameters<GateReads['controlsAsOf']>[0]): Promise<Row[]> {
    const r = await this.one(sql`select jsonb_build_object('c', decision.control_decisions_as_of(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.at}::timestamptz)) as r`, 'control_decisions_as_of');
    return (r['c'] ?? []) as Row[];
  }
  gateAct(a: Parameters<GateActWrites['gateAct']>[0]): Promise<Row> {
    return this.one(sql`select decision.gate_act(${a.actionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.act}, ${a.rationale},
      ${a.nextReviewAt}::timestamptz, ${a.infoRequest}, ${a.packageDigest}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'gate_act');
  }
  grantOverride(a: Parameters<OverrideWrites['grantOverride']>[0]): Promise<Row> {
    return this.one(sql`select decision.grant_override(${a.overrideId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.kind}, ${a.rationale},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'grant_override');
  }
  reviewOverride(a: Parameters<OverrideWrites['reviewOverride']>[0]): Promise<Row> {
    return this.one(sql`select decision.review_override(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.overrideId}::uuid, ${a.outcome}, ${a.note}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'review_override');
  }
  delegateApproval(a: Parameters<DelegationWrites['delegateApproval']>[0]): Promise<Row> {
    return this.one(sql`select decision.delegate_approval(${a.delegationId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.delegate}::uuid, ${a.expiresAt}::timestamptz,
      ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'delegate_approval');
  }
  endDelegation(a: Parameters<DelegationWrites['endDelegation']>[0]): Promise<Row> {
    return this.one(sql`select decision.end_delegation(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.delegationId}::uuid, ${a.reason}, ${a.reassignTo}::uuid, ${a.newDelegationId}::uuid,
      ${a.expiresAt}::timestamptz, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'end_delegation');
  }
  reserveBoard(a: Parameters<BoardWrites['reserveBoard']>[0]): Promise<Row> {
    return this.one(sql`select decision.reserve_board_class(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${JSON.stringify(a.board)}::jsonb, ${a.rationale},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'reserve_board_class');
  }
  commitPreview(a: Parameters<PreviewWrites['commitPreview']>[0]): Promise<Row> {
    return this.one(sql`select decision.commit_preview(${a.previewId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.versionDigest},
      ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'commit_preview');
  }
  recordControl(a: Parameters<ControlWrites['recordControl']>[0]): Promise<Row> {
    return this.one(sql`select decision.record_control(${a.controlId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.controlKey}, ${JSON.stringify(a.body)}::jsonb, ${a.rationale},
      ${a.effectiveFrom}::timestamptz, ${a.packageId}::uuid, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'record_control');
  }
}

export const GateCapability = {
  read(tx: Tx, action: string): GateReads { return new GateCapabilityImpl(tx, action); },
  act(tx: Tx, action: string): GateActWrites { return new GateCapabilityImpl(tx, action); },
  override(tx: Tx, action: string): OverrideWrites { return new GateCapabilityImpl(tx, action); },
  delegate(tx: Tx, action: string): DelegationWrites { return new GateCapabilityImpl(tx, action); },
  board(tx: Tx, action: string): BoardWrites { return new GateCapabilityImpl(tx, action); },
  preview(tx: Tx, action: string): PreviewWrites { return new GateCapabilityImpl(tx, action); },
  control(tx: Tx, action: string): ControlWrites { return new GateCapabilityImpl(tx, action); },
};
