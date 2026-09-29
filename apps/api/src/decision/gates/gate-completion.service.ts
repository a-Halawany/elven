/**
 * THE HUMAN GATE COMPLETED — CP-6 B36 (0094 §G; F-P6-04 completes; ADR-003; JRN-17 sign, distribute; PER-01).
 *
 * The service shapes the caller's request and hands it to the port, which judges the person, the record and the rule in its own words:
 *   k1 THE SIGNATURE beyond the audit chain — the approval signed by its approver, the decision by its owner or committer after the
 *      commitment: what would be signed is read first (decision.signature_subject); the caller's digest must be it (a stale digest is
 *      refused before anything is signed); SignatureService signs (Ed25519 by key reference) and records the row through
 *      executive.record_signature under THIS act's bound action; the port binds the row to the subject as it stands. The read verifies
 *      every recorded signature (SignatureService.verify) and says so beside it — never a client judgement.
 *   l1 RECUSAL, l2 CHALLENGE and its resolution, k2 DISTRIBUTION (in_app placed by the port; email / sms / teams carried by the B34
 *      SYNTHETIC adapters to the LOCAL sinks in the same write, their receipts recorded — closes no real-provider clause), l3 the
 *      VALIDATED FIELDS, l4 the BOARD's own acts (the class and the standing judged by decision.board_gate_check before the act), l6 the
 *      ONE gate state for a decision, a source contract and a merge.
 */
import { HttpException, Inject, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import { SignatureService, type SignatureRow } from '../../executive/signatures/signature.service.js';
import type { ChannelAdapter, ChannelResult, DeliveryMessage } from '../../executive/attention/delivery/channel.js';
import { EmailChannel } from '../../executive/attention/delivery/email.channel.js';
import { SmsChannel, TeamsChannel } from '../../executive/attention/delivery/webhook.channel.js';
import { SYNTHETIC_SINK_NOTE } from '../../executive/attention/delivery/local-sink.js';
import type { BoardWrites, ChallengeWrites, DistributeWrites, FieldsWrites, GateCompletionReads, RecuseWrites, SignWrites } from './gate-completion.capabilities.js';

type Row = Record<string, unknown>;
const bad = (correlationId: string, msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const HEX64 = /^[0-9a-f]{64}$/;

/* ───────────── the intakes (pure; unit-tested) ───────────── */
export const SIGN_KINDS = ['approval', 'decision'] as const;
export type SignKind = (typeof SIGN_KINDS)[number];
export const signActionOf = (kind: SignKind): string => `decision.sign.${kind}`;
export interface SignIntake { kind: SignKind; digest: string; approvalId: string | null }
export function validateSignIntake(m: Row, correlationId: string): SignIntake {
  if (m['kind'] !== 'approval' && m['kind'] !== 'decision') bad(correlationId, 'signature rejected (kind): a signature is over an approval or a decision');
  if (typeof m['digest'] !== 'string' || !HEX64.test(m['digest'])) bad(correlationId, 'signature rejected (digest): names the 64-hex digest read — an approval\'s header digest, or the committed version\'s');
  const approvalId = typeof m['approvalId'] === 'string' ? m['approvalId'] : null;
  if (m['kind'] === 'approval' && (approvalId === null || !UUID.test(approvalId))) bad(correlationId, 'signature rejected (approval): names the approval signed (its id)');
  return { kind: m['kind'] as SignKind, digest: m['digest'] as string, approvalId: m['kind'] === 'approval' ? approvalId : null };
}
export function validateReason(noun: string, m: Row, correlationId: string, min = 8): string {
  if (typeof m['reason'] !== 'string' || m['reason'].trim().length < min) bad(correlationId, `${noun} rejected (reason): states its reason (${min}+ characters)`);
  return m['reason'] as string;
}
export interface ResolveIntake { challengeId: string; resolution: 'upheld' | 'dismissed'; note: string }
export function validateResolveIntake(m: Row, correlationId: string): ResolveIntake {
  if (typeof m['challengeId'] !== 'string' || !UUID.test(m['challengeId'])) bad(correlationId, 'challenge resolution rejected (challenge): names the challenge resolved (its id)');
  if (m['resolution'] !== 'upheld' && m['resolution'] !== 'dismissed') bad(correlationId, 'challenge resolution rejected (resolution): a challenge is upheld or dismissed');
  if (typeof m['note'] !== 'string' || m['note'].trim().length < 8) bad(correlationId, 'challenge resolution rejected (note): the resolution says why (8 to 4000 characters)');
  return { challengeId: m['challengeId'] as string, resolution: m['resolution'] as ResolveIntake['resolution'], note: m['note'] as string };
}
export const DISTRIBUTION_CHANNELS = ['in_app', 'email', 'sms', 'teams'] as const;
export interface DistributeIntake { channels: string[]; recipients: string[] }
export function validateDistributeIntake(m: Row, correlationId: string): DistributeIntake {
  const channels = Array.isArray(m['channels']) ? m['channels'] : [];
  for (const c of channels) if (typeof c !== 'string' || !(DISTRIBUTION_CHANNELS as readonly string[]).includes(c)) bad(correlationId, `distribution rejected (channel): ${String(c)} is not a channel (in_app, and the SYNTHETIC email, sms, teams)`);
  const recipients = Array.isArray(m['recipients']) ? m['recipients'] : [];
  for (const r of recipients) if (typeof r !== 'string' || !UUID.test(r)) bad(correlationId, 'distribution rejected (recipient): a named recipient is a principal id');
  return { channels: [...new Set(['in_app', ...(channels as string[])])], recipients: [...new Set(recipients as string[])] };
}
export interface FieldsIntake { missingInformation: unknown[]; expectedEffects: unknown[] }
export function validateFieldsIntake(m: Row, correlationId: string): FieldsIntake {
  const mi = m['missingInformation'] ?? []; const ee = m['expectedEffects'] ?? [];
  if (!Array.isArray(mi) || mi.length > 20) bad(correlationId, 'version fields rejected (missing_information): a list of at most 20 {what, owner, needed_by}');
  if (!Array.isArray(ee) || ee.length > 20) bad(correlationId, 'version fields rejected (expected_effects): a list of at most 20 {effect, measure, direction, horizon, basis}');
  return { missingInformation: mi as unknown[], expectedEffects: ee as unknown[] };
}
export const BOARD_ACTS = ['approve', 'reject', 'defer'] as const;
export type BoardAct = (typeof BOARD_ACTS)[number];
export const boardActOf = (segment: string, correlationId: string): BoardAct => {
  if (!(BOARD_ACTS as readonly string[]).includes(segment)) bad(correlationId, `board decision rejected (act): ${segment} is not a board act (approve, reject, defer)`);
  return segment as BoardAct;
};
export const boardActionOf = (act: BoardAct): string => `decision.board.${act}`;
export const GATE_STATE_KINDS = ['decision', 'source', 'merge'] as const;
export interface GateStateIntake { kind: (typeof GATE_STATE_KINDS)[number]; id: string; version: number | null }
export function validateGateStateIntake(m: Row, correlationId: string): GateStateIntake {
  if (!(GATE_STATE_KINDS as readonly string[]).includes(String(m['kind']))) bad(correlationId, 'gate state rejected (kind): a decision, a source or a merge');
  if (typeof m['id'] !== 'string' || !UUID.test(m['id'])) bad(correlationId, 'gate state rejected (id): names the subject (its id)');
  const v = m['version'];
  if (v !== undefined && v !== null && (!Number.isInteger(v) || (v as number) < 1)) bad(correlationId, 'gate state rejected (version): a positive integer');
  return { kind: m['kind'] as GateStateIntake['kind'], id: m['id'] as string, version: typeof v === 'number' ? v : null };
}

/** The SYNTHETIC channels' message: what the record says, its digest, and that the delivery is to a LOCAL sink. */
export function decisionMessage(a: { title: string; version: number; recordDigest: string; commitmentId: string; signatures: number; conditions: number }): { subject: string; body: string } {
  return {
    subject: `[decision record] ${a.title} — version ${a.version} committed`.slice(0, 300),
    body: [
      `The decision "${a.title}" (version ${a.version}) was committed: commitment ${a.commitmentId}.`,
      `Record digest ${a.recordDigest}; ${a.signatures} signature(s) beyond the audit chain; ${a.conditions} approval condition(s) in force in monitoring.`,
      'Open the decisions surface to read the record: this message is a delivery, and its receipt is not your acknowledgement.',
      SYNTHETIC_SINK_NOTE,
    ].join('\n'),
  };
}

@Injectable()
export class GateCompletionService {
  private readonly adapters: Map<string, ChannelAdapter>;
  constructor(@Inject(SignatureService) private readonly signer: SignatureService, email: EmailChannel, sms: SmsChannel, teams: TeamsChannel) {
    this.adapters = new Map<string, ChannelAdapter>([[email.name, email], [sms.name, sms], [teams.name, teams]]);
  }

  /** k1: the signature — the subject read, the caller's digest compared, the row signed and recorded, the port binding it; the answer verified. */
  async sign(cap: SignWrites, ctx: ScopeContext, packageId: string, version: number, i: SignIntake, actor: string, correlationId: string): Promise<Row> {
    const subject = await cap.signatureSubject({ kind: i.kind, packageId, version, approvalId: i.approvalId });
    if (subject === null) throw new HttpException(errorBody('EYE_STA_001', correlationId, `signature rejected (unknown_${i.kind}): no such ${i.kind} on version ${version} of this package`), 404);
    const digestNow = typeof subject['digest'] === 'string' ? subject['digest'] : null;
    if (digestNow === null) throw new HttpException(errorBody('EYE_STA_002', correlationId, `signature rejected (state): the ${i.kind} carries no digest to sign yet`), 409);
    if (digestNow !== i.digest) throw new HttpException(errorBody('EYE_STA_002', correlationId, `signature rejected (stale_digest): the digest read (${i.digest}) is not the ${i.kind}'s digest now (${digestNow}); read it again and sign what stands`), 409);
    const row = await this.signer.sign(cap, { tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, action: signActionOf(i.kind), kind: i.kind,
      subjectId: String(subject['subject_id']), subjectVersion: Number(subject['subject_version']), subjectDigest: i.digest, actor, correlationId });
    const signatureId = String(row['signature_id']);
    const bound = i.kind === 'approval'
      ? await cap.signApproval({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, approvalId: i.approvalId as string, signatureId, actor, eventId: newId(), correlationId })
      : await cap.signDecision({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, signatureId, actor, eventId: newId(), correlationId });
    // the row's BYTES are read back (executive.signature_of; the port returns the row's identity, not its bytes) and verified against the bound key
    const after = await cap.signatureSubject({ kind: i.kind, packageId, version, approvalId: i.approvalId });
    const mine = (Array.isArray(after?.['signatures']) ? (after!['signatures'] as Row[]) : []).find((s) => s['signature_id'] === signatureId) ?? null;
    const verified = mine === null ? false : this.signer.verify({ key_id: String(mine['key_id']), signature: String(mine['signature']), subject_digest: String(mine['subject_digest']) } as Pick<SignatureRow, 'key_id' | 'signature' | 'subject_digest'>);
    return { ...bound, verified };
  }

  /** The signatures of a record, each VERIFIED against the bound key (a signature over another digest, or by an unknown key, reads as not verified). */
  verifyAll(rows: unknown): Row[] {
    if (!Array.isArray(rows)) return [];
    return (rows as Row[]).map((s) => ({ ...s, verified: this.signer.verify({ key_id: String(s['key_id'] ?? ''), signature: String(s['signature'] ?? ''), subject_digest: String(s['subject_digest'] ?? '') }) }));
  }

  /** The gate record with every signature verified and the signing key this deployment serves (for offline verification). */
  async record(cap: GateCompletionReads, packageId: string, version: number): Promise<Row | null> {
    const r = await cap.gateRecord({ packageId, version });
    if (r === null) return null;
    const approvals = (Array.isArray(r['approvals']) ? (r['approvals'] as Row[]) : []).map((a) => ({ ...a, signatures: this.verifyAll(a['signatures']) }));
    return { ...r, approvals, decision_signatures: this.verifyAll(r['decision_signatures']), signing_key: this.signer.publicKey() };
  }

  async recuse(cap: RecuseWrites, ctx: ScopeContext, packageId: string, version: number, m: Row, actor: string, correlationId: string): Promise<Row> {
    const reason = validateReason('recusal', m, correlationId);
    return cap.recuse({ recusalId: newId(), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, reason, actor, eventId: newId(), correlationId });
  }

  async challenge(cap: ChallengeWrites, ctx: ScopeContext, packageId: string, version: number, m: Row, actor: string, correlationId: string): Promise<Row> {
    const reason = validateReason('decision challenge', m, correlationId);
    return cap.challenge({ challengeId: newId(), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, reason, actor, eventId: newId(), correlationId });
  }

  async resolveChallenge(cap: ChallengeWrites, ctx: ScopeContext, m: Row, actor: string, correlationId: string): Promise<Row> {
    const i = validateResolveIntake(m, correlationId);
    return cap.resolveChallenge({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, challengeId: i.challengeId, resolution: i.resolution, note: i.note, actor, eventId: newId(), correlationId });
  }

  /**
   * k2: the distribution — the port places in_app and queues the SYNTHETIC channels; each queued row is handed to its adapter (the B34
   * local sinks; a missing sink or a refused host is a FAILED row with the reason, never a silent success) and its receipt recorded, all in
   * this write. The answer names every row with its state and says the synthetic channels close no real-provider clause.
   */
  async distribute(cap: DistributeWrites, ctx: ScopeContext, packageId: string, version: number, m: Row, actor: string, correlationId: string): Promise<Row> {
    const i = validateDistributeIntake(m, correlationId);
    const r = await cap.distribute({ distributionId: newId(), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, channels: i.channels, recipients: i.recipients, actor, eventId: newId(), correlationId });
    const record = (r['record'] ?? {}) as Row;
    const sigs = (record['signatures'] ?? {}) as Row;
    const approvalsSigned = (Array.isArray(sigs['approvals']) ? (sigs['approvals'] as Row[]) : []).reduce((n, a) => n + (Array.isArray(a['signatures']) ? (a['signatures'] as unknown[]).length : 0), 0);
    const msg = decisionMessage({ title: String(record['title'] ?? ''), version, recordDigest: String(r['record_digest']), commitmentId: String(r['commitment_id']),
      signatures: approvalsSigned + (Array.isArray(sigs['decision']) ? (sigs['decision'] as unknown[]).length : 0), conditions: Array.isArray((record['conditions_in_force'] as Row | undefined)?.['conditions']) ? ((record['conditions_in_force'] as Row)['conditions'] as unknown[]).length : 0 });
    const rows: Row[] = [];
    for (const row of (r['rows'] ?? []) as Row[]) {
      if (row['state'] !== 'queued') { rows.push(row); continue; }
      const adapter = this.adapters.get(String(row['channel']));
      let result: ChannelResult;
      if (adapter === undefined) result = { state: 'failed', receipt: null, error: `no adapter serves the channel ${String(row['channel'])} in this runtime` };
      else {
        const dm: DeliveryMessage = { deliveryId: String(row['delivery_id']), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, itemId: packageId, itemEventId: String(r['distribution_id']),
          itemEvent: 'decision.distributed', channel: String(row['channel']), recipient: String(row['recipient']), attempt: 1, maxAttempts: 1, subject: msg.subject, body: msg.body, correlationId,
          // the email / sms / teams adapters speak to their LOCAL sinks only and never reach the database: the tick capability slot is unused here
          via: undefined as never };
        try { result = await adapter.deliver(dm); } catch (e) { result = { state: 'failed', receipt: null, error: `${adapter.name}: ${(e as Error).message}`.slice(0, 500) }; }
      }
      const recorded = await cap.recordDistributionReceipt({ deliveryId: String(row['delivery_id']), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string,
        state: result.state === 'failed' ? 'failed' : 'delivered', receipt: result.receipt, providerRef: result.providerRef ?? null, error: result.state === 'failed' ? (result.error ?? 'the channel reported a failure without a reason') : null });
      rows.push({ ...row, state: recorded['state'], receipt: result.receipt, error: result.state === 'failed' ? result.error ?? null : null, synthetic: true });
    }
    return { distribution_id: r['distribution_id'], package_id: packageId, version, commitment_id: r['commitment_id'], record_digest: r['record_digest'], record, recipients: r['recipients'], channels: r['channels'], rows,
             synthetic_note: 'in_app is the product\'s channel; email / sms / teams are SYNTHETIC — carried to LOCAL sinks on the loopback interface; this closes no real-provider clause (owner decision D6)' };
  }

  async setFields(cap: FieldsWrites, ctx: ScopeContext, packageId: string, version: number, m: Row, actor: string, correlationId: string): Promise<Row> {
    const i = validateFieldsIntake(m, correlationId);
    return cap.setVersionFields({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, missingInformation: i.missingInformation, expectedEffects: i.expectedEffects, actor, correlationId });
  }

  async gateState(cap: GateCompletionReads, m: Row, correlationId: string): Promise<Row | null> {
    const i = validateGateStateIntake(m, correlationId);
    return cap.gateStateOf({ kind: i.kind, id: i.id, version: i.version });
  }

  async board(cap: GateCompletionReads, ctx: ScopeContext, actor: string): Promise<Row[]> {
    const rows = await cap.boardSurface({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, actor });
    return rows.map((p) => ({ ...p, approvals: (Array.isArray(p['approvals']) ? (p['approvals'] as Row[]) : []).map((a) => ({ ...a, signatures: this.verifyAll(a['signatures']) })), decision_signatures: this.verifyAll(p['decision_signatures']) }));
  }

  /** l4: the class and the standing judged by the port before the board's own act runs (the approval / the gate act under decision.board.<act>). */
  boardCheck(cap: BoardWrites, ctx: ScopeContext, packageId: string, version: number, act: BoardAct, actor: string): Promise<Row> {
    return cap.boardGateCheck({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, act, actor });
  }
}
