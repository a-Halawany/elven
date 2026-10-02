/**
 * GATE COMPLETION CAPABILITIES — CP-6 B36 (0094 §G; F-P6-04 completes).
 *
 * One narrow shape per port group, every write a SECURITY DEFINER port asserting the caller's own bound action:
 *
 *   sign        decision.signature_subject (what would be signed now) → SignatureService.sign (executive.record_signature under
 *               decision.sign.approval | decision.sign.decision) → decision.sign_approval / decision.sign_decision (the row bound to
 *               the subject as it stands; a stale digest refused, the row rolling back with it);
 *   recuse      decision.recuse_approver (`decision.recuse`: the approver's own act; the standing approval voided; the quorum re-read);
 *   challenge   decision.challenge_decision (`decision.challenge`: a room member or the auditor) and decision.resolve_challenge
 *               (`decision.challenge.resolve`: the owner, never the challenger);
 *   distribute  decision.distribute_decision (`decision.distribute`: after commitment; in_app placed at once, the SYNTHETIC channels queued)
 *               and decision._record_distribution_receipt (the adapter's receipt, in the same write);
 *   fields      decision.set_version_fields (`decision.package.terms`, on a draft) and decision.validate_version_fields_at_propose
 *               (`decision.package.propose`, before the proposal's own port);
 *   board       decision.board_gate_check (`decision.board.<act>`: the class and the standing before the board's approve / reject / defer);
 *   reads       decision.gate_state_of / observation.source_gate_state_of / graph.merge_gate_state_of (the ONE vocabulary), the gate
 *               record (signatures, recusals, challenges, denials, distributions, fields), decision.board_surface, decision.pdp_denials_of.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';
import type { SignatureWrites } from '../../executive/signatures/signature.service.js';

type Row = Record<string, unknown>;

abstract class Core {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  /** The signer's way in: one statement under the pipeline's bound action (SignatureService.sign calls executive.record_signature through it). */
  async call<T>(q: ReturnType<typeof sql>): Promise<T[]> { const r = await q.execute(this.#tx); return r.rows as T[]; }
  protected async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined) throw new Error(`${what} returned no row`);
    return row ?? {};
  }
  protected async maybe(q: ReturnType<typeof sql>): Promise<Row | null> {
    const r = await q.execute(this.#tx);
    const row = (r.rows as Array<{ r: Row | null }>)[0]?.r;
    return row === undefined || row === null ? null : row;
  }
}

export interface GateCompletionReads {
  readonly action: string;
  /** What would be signed now: the approval's header digest (kind approval) or the committed version's (kind decision); null when not visible. */
  signatureSubject(a: { kind: 'approval' | 'decision'; packageId: string; version: number; approvalId: string | null }): Promise<Row | null>;
  /** The uniform gate state of a decision version, a source contract or a merge (ADR-003); null when the subject is not visible. */
  gateStateOf(a: { kind: 'decision' | 'source' | 'merge'; id: string; version: number | null }): Promise<Row | null>;
  /** The gate's completion record for one version: signatures (the rows, verified by the service), recusals, challenges, denials, distributions, the fields. */
  gateRecord(a: { packageId: string; version: number }): Promise<Row | null>;
  /** The board member's surface: the board-class packages with their gate state, approvals, signatures and the reader's own standing. */
  boardSurface(a: { tenantId: string; domainId: string; actor: string }): Promise<Row[]>;
  /** The PDP denials of a package (a version when given). */
  pdpDenialsOf(a: { packageId: string; version: number | null }): Promise<Row[]>;
}
export interface SignWrites extends GateCompletionReads, SignatureWrites {
  signApproval(a: { tenantId: string; domainId: string; packageId: string; version: number; approvalId: string; signatureId: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  signDecision(a: { tenantId: string; domainId: string; packageId: string; version: number; signatureId: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}
export interface RecuseWrites extends GateCompletionReads {
  recuse(a: { recusalId: string; tenantId: string; domainId: string; packageId: string; version: number; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}
export interface ChallengeWrites extends GateCompletionReads {
  challenge(a: { challengeId: string; tenantId: string; domainId: string; packageId: string; version: number; reason: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  resolveChallenge(a: { tenantId: string; domainId: string; challengeId: string; resolution: string; note: string; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}
export interface DistributeWrites extends GateCompletionReads {
  distribute(a: { distributionId: string; tenantId: string; domainId: string; packageId: string; version: number; channels: string[]; recipients: string[]; actor: string; eventId: string; correlationId: string }): Promise<Row>;
  recordDistributionReceipt(a: { deliveryId: string; tenantId: string; domainId: string; state: 'delivered' | 'failed'; receipt: Row | null; providerRef: string | null; error: string | null }): Promise<Row>;
}
export interface FieldsWrites extends GateCompletionReads {
  setVersionFields(a: { tenantId: string; domainId: string; packageId: string; version: number; missingInformation: unknown[]; expectedEffects: unknown[]; actor: string; correlationId: string }): Promise<Row>;
  /** At the proposal (under decision.package.propose): the stored fields validated again, version.fields_validated recorded. */
  validateVersionFieldsAtPropose(a: { tenantId: string; domainId: string; packageId: string; version: number; actor: string; eventId: string; correlationId: string }): Promise<Row>;
}
export interface BoardWrites extends GateCompletionReads {
  boardGateCheck(a: { tenantId: string; domainId: string; packageId: string; version: number; act: 'approve' | 'reject' | 'defer'; actor: string }): Promise<Row>;
}

class GateCompletionImpl extends Core implements SignWrites, RecuseWrites, ChallengeWrites, DistributeWrites, FieldsWrites, BoardWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }

  signatureSubject(a: Parameters<GateCompletionReads['signatureSubject']>[0]): Promise<Row | null> {
    return this.maybe(sql`select decision.signature_subject(${a.kind}, ${a.packageId}::uuid, ${a.version}::int, ${a.approvalId}::uuid) as r`);
  }
  gateStateOf(a: Parameters<GateCompletionReads['gateStateOf']>[0]): Promise<Row | null> {
    if (a.kind === 'source') return this.maybe(sql`select observation.source_gate_state_of(${a.id}::uuid) as r`);
    if (a.kind === 'merge') return this.maybe(sql`select graph.merge_gate_state_of(${a.id}::uuid) as r`);
    return this.maybe(sql`select decision.gate_state_of(${a.id}::uuid, ${a.version ?? 1}::int) as r`);
  }
  gateRecord(a: Parameters<GateCompletionReads['gateRecord']>[0]): Promise<Row | null> {
    return this.maybe(sql`select case when v.package_id is null then null else jsonb_build_object(
        'package_id', v.package_id, 'version', v.version, 'state', v.state, 'version_digest', v.version_digest, 'header_digest', v.header_digest,
        'missing_information', v.missing_information, 'expected_effects', v.expected_effects,
        'gate', decision.gate_state_of(v.package_id, v.version),
        'approvals', (select coalesce(jsonb_agg(jsonb_build_object('approval_id', x.approval_id, 'approver', x.approver_principal_id, 'decision', x.decision, 'header_digest', x.header_digest, 'revoked_at', x.revoked_at, 'revoked_reason', x.revoked_reason,
                        'recused', exists (select 1 from decision.recusals r where r.package_id = x.package_id and r.version = x.version and r.approver_principal_id = x.approver_principal_id),
                        'signatures', executive.signature_of('approval', x.approval_id, 1)) order by x.recorded_at), '[]'::jsonb) from decision.approvals x where x.package_id = v.package_id and x.version = v.version),
        'decision_signatures', executive.signature_of('decision', v.package_id, v.version),
        'recusals', (select coalesce(jsonb_agg(to_jsonb(r) - 'scope' - 'tenant_id' - 'domain_id' order by r.recused_at), '[]'::jsonb) from decision.recusals r where r.package_id = v.package_id and r.version = v.version),
        'challenges', (select coalesce(jsonb_agg(to_jsonb(c) - 'scope' - 'tenant_id' - 'domain_id' order by c.raised_at), '[]'::jsonb) from decision.challenges c where c.package_id = v.package_id and c.version = v.version),
        'denials', decision.pdp_denials_of(v.package_id, null),
        'distributions', decision.distributions_of(v.package_id, v.version),
        'commitment', (select jsonb_build_object('commitment_id', c.commitment_id, 'committed_by', c.committed_by, 'committed_at', c.committed_at) from decision.commitments c where c.package_id = v.package_id and c.version = v.version))
      end as r from decision.package_versions v where v.package_id = ${a.packageId}::uuid and v.version = ${a.version}::int`);
  }
  async boardSurface(a: Parameters<GateCompletionReads['boardSurface']>[0]): Promise<Row[]> {
    const r = await this.one(sql`select jsonb_build_object('b', decision.board_surface(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid)) as r`, 'board_surface');
    return (r['b'] ?? []) as Row[];
  }
  async pdpDenialsOf(a: Parameters<GateCompletionReads['pdpDenialsOf']>[0]): Promise<Row[]> {
    const r = await this.one(sql`select jsonb_build_object('d', decision.pdp_denials_of(${a.packageId}::uuid, ${a.version}::int)) as r`, 'pdp_denials_of');
    return (r['d'] ?? []) as Row[];
  }
  signApproval(a: Parameters<SignWrites['signApproval']>[0]): Promise<Row> {
    return this.one(sql`select decision.sign_approval(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.approvalId}::uuid, ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'sign_approval');
  }
  signDecision(a: Parameters<SignWrites['signDecision']>[0]): Promise<Row> {
    return this.one(sql`select decision.sign_decision(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.signatureId}::uuid, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'sign_decision');
  }
  recuse(a: Parameters<RecuseWrites['recuse']>[0]): Promise<Row> {
    return this.one(sql`select decision.recuse_approver(${a.recusalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'recuse_approver');
  }
  challenge(a: Parameters<ChallengeWrites['challenge']>[0]): Promise<Row> {
    return this.one(sql`select decision.challenge_decision(${a.challengeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.reason}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'challenge_decision');
  }
  resolveChallenge(a: Parameters<ChallengeWrites['resolveChallenge']>[0]): Promise<Row> {
    return this.one(sql`select decision.resolve_challenge(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.challengeId}::uuid, ${a.resolution}, ${a.note}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'resolve_challenge');
  }
  distribute(a: Parameters<DistributeWrites['distribute']>[0]): Promise<Row> {
    return this.one(sql`select decision.distribute_decision(${a.distributionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int,
      ${sql.val(a.channels)}::text[], ${sql.val(a.recipients)}::uuid[], ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'distribute_decision');
  }
  recordDistributionReceipt(a: Parameters<DistributeWrites['recordDistributionReceipt']>[0]): Promise<Row> {
    return this.one(sql`select decision._record_distribution_receipt(${a.deliveryId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.state}, ${a.receipt === null ? null : JSON.stringify(a.receipt)}::jsonb, ${a.providerRef}, ${a.error}) as r`, '_record_distribution_receipt');
  }
  setVersionFields(a: Parameters<FieldsWrites['setVersionFields']>[0]): Promise<Row> {
    return this.one(sql`select decision.set_version_fields(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${JSON.stringify(a.missingInformation)}::jsonb, ${JSON.stringify(a.expectedEffects)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'set_version_fields');
  }
  validateVersionFieldsAtPropose(a: Parameters<FieldsWrites['validateVersionFieldsAtPropose']>[0]): Promise<Row> {
    return this.one(sql`select decision.validate_version_fields_at_propose(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`, 'validate_version_fields_at_propose');
  }
  boardGateCheck(a: Parameters<BoardWrites['boardGateCheck']>[0]): Promise<Row> {
    return this.one(sql`select decision.board_gate_check(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.version}::int, ${a.act}, ${a.actor}::uuid) as r`, 'board_gate_check');
  }
}

export const GateCompletionCapability = {
  read(tx: Tx, action: string): GateCompletionReads { return new GateCompletionImpl(tx, action); },
  sign(tx: Tx, action: string): SignWrites { return new GateCompletionImpl(tx, action); },
  recuse(tx: Tx, action: string): RecuseWrites { return new GateCompletionImpl(tx, action); },
  challenge(tx: Tx, action: string): ChallengeWrites { return new GateCompletionImpl(tx, action); },
  distribute(tx: Tx, action: string): DistributeWrites { return new GateCompletionImpl(tx, action); },
  fields(tx: Tx, action: string): FieldsWrites { return new GateCompletionImpl(tx, action); },
  board(tx: Tx, action: string): BoardWrites { return new GateCompletionImpl(tx, action); },
};
