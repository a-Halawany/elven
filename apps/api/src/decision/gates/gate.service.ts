/**
 * THE HUMAN GATE — CP-6 B34 (0090 §G; F-P6-04).
 *
 * The service shapes the caller's request (the types, the instants, the act a route names) and hands it to the port, which
 * judges the person, the record and the rule in its own words. Seven DISTINCT acts at the gate (HX-12): review and
 * acknowledge (a reading recorded), ready (the independent reviewer's decision-ready on the information package digest they
 * read — OBJ-32), defer / request information (with a rationale and the next review — OBJ-35), reject, resume. Overrides,
 * delegations, the board class, the consequence preview (HX-13) and the versioned controls each have their own act.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { BoardWrites, ControlWrites, DelegationWrites, GateActWrites, GateReads, OverrideWrites, PreviewWrites } from './gate.capabilities.js';

type Row = Record<string, unknown>;
const bad = (correlationId: string, msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };

/** The route segment → the act (and its PDP action `decision.gate.<act>`). */
export const GATE_ACTS = { review: 'review', acknowledge: 'acknowledge', ready: 'ready', defer: 'defer', reject: 'reject', 'request-information': 'request_information', resume: 'resume' } as const;
export type GateAct = (typeof GATE_ACTS)[keyof typeof GATE_ACTS];
export const gateActOf = (segment: string, correlationId: string): GateAct => {
  const act = (GATE_ACTS as Record<string, GateAct>)[segment];
  if (act === undefined) bad(correlationId, `gate rejected (action): ${segment} is not a gate act (${Object.keys(GATE_ACTS).join(', ')})`);
  return act as GateAct;
};
export const gateActionOf = (act: GateAct): string => `decision.gate.${act}`;

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
function instantOrNull(v: unknown, field: string, correlationId: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || Number.isNaN(new Date(v).getTime())) bad(correlationId, `${field} must be an ISO instant`);
  return new Date(v as string).toISOString();
}

export interface GateIntake { rationale: string; nextReviewAt: string | null; infoRequest: string | null; packageDigest: string | null }
export function validateGateIntake(act: GateAct, m: Row, correlationId: string): GateIntake {
  if (typeof m['rationale'] !== 'string') bad(correlationId, 'gate rejected (rationale): a gate act states its rationale (8 to 4000 characters)');
  const nextReviewAt = instantOrNull(m['nextReviewAt'], 'nextReviewAt', correlationId);
  if ((act === 'defer' || act === 'request_information') && nextReviewAt === null) bad(correlationId, `gate rejected (next_review): a ${act.replace('_', ' ')} names its next review, in the future and within 180 days`);
  const packageDigest = str(m['informationPackageDigest']);
  if (act === 'ready' && (packageDigest === null || !/^[0-9a-f]{64}$/.test(packageDigest))) bad(correlationId, 'gate rejected (stale_package): decision-ready names the 64-hex digest of the information package read');
  return { rationale: m['rationale'] as string, nextReviewAt: act === 'defer' || act === 'request_information' ? nextReviewAt : null,
           infoRequest: act === 'request_information' ? str(m['infoRequest']) : null, packageDigest: act === 'ready' ? packageDigest : null };
}

export interface OverrideIntake { kind: 'normal' | 'emergency'; rationale: string }
export function validateOverrideIntake(m: Row, correlationId: string): OverrideIntake {
  if (m['kind'] !== 'normal' && m['kind'] !== 'emergency') bad(correlationId, 'override rejected (kind): an override is normal or emergency');
  if (typeof m['rationale'] !== 'string') bad(correlationId, 'override rejected (rationale): an override states its rationale (20 to 4000 characters)');
  return { kind: m['kind'] as OverrideIntake['kind'], rationale: m['rationale'] as string };
}

export interface DelegationIntake { delegate: string; expiresAt: string; reason: string }
export function validateDelegationIntake(m: Row, correlationId: string): DelegationIntake {
  if (typeof m['delegate'] !== 'string' || !/^[0-9a-f-]{36}$/.test(m['delegate'])) bad(correlationId, 'delegation rejected (delegate): the delegate is another named, active member (a principal id)');
  const expiresAt = instantOrNull(m['expiresAt'], 'expiresAt', correlationId);
  if (expiresAt === null) bad(correlationId, 'delegation rejected (expiry): a delegation expires in the future and within 30 days');
  if (typeof m['reason'] !== 'string') bad(correlationId, 'delegation rejected (reason): a delegation states its reason (8+ characters)');
  return { delegate: m['delegate'] as string, expiresAt: expiresAt as string, reason: m['reason'] as string };
}

export interface ControlIntake { kind: 'policy_revision' | 'control_decision'; controlKey: string; body: Row; rationale: string; effectiveFrom: string | null; packageId: string | null }
export function validateControlIntake(m: Row, correlationId: string): ControlIntake {
  if (m['kind'] !== 'policy_revision' && m['kind'] !== 'control_decision') bad(correlationId, 'control rejected (kind): a control is a policy_revision or a control_decision');
  if (typeof m['controlKey'] !== 'string') bad(correlationId, 'control rejected (key): the control key is 3 to 80 lower-case characters');
  if (typeof m['body'] !== 'object' || m['body'] === null || Array.isArray(m['body'])) bad(correlationId, 'control rejected (body): the control states its body (a non-empty object)');
  if (typeof m['rationale'] !== 'string') bad(correlationId, 'control rejected (rationale): the control states its rationale (8+ characters)');
  const packageId = str(m['packageId']);
  return { kind: m['kind'] as ControlIntake['kind'], controlKey: m['controlKey'] as string, body: m['body'] as Row, rationale: m['rationale'] as string,
           effectiveFrom: instantOrNull(m['effectiveFrom'], 'effectiveFrom', correlationId), packageId };
}

@Injectable()
export class GateService {
  async status(cap: GateReads, ctx: ScopeContext, packageId: string, version: number): Promise<Row | undefined> {
    const s = await cap.gateStatus({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version });
    return s ?? undefined;
  }

  async act(cap: GateActWrites, ctx: ScopeContext, packageId: string, version: number, act: GateAct, m: Row, actor: string, correlationId: string): Promise<Row> {
    const i = validateGateIntake(act, m, correlationId);
    return cap.gateAct({ actionId: newId(), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, act, rationale: i.rationale, nextReviewAt: i.nextReviewAt,
                         infoRequest: i.infoRequest, packageDigest: i.packageDigest, actor, eventId: newId(), correlationId });
  }

  async grantOverride(cap: OverrideWrites, ctx: ScopeContext, packageId: string, version: number, m: Row, actor: string, correlationId: string): Promise<Row> {
    const i = validateOverrideIntake(m, correlationId);
    return cap.grantOverride({ overrideId: newId(), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, kind: i.kind, rationale: i.rationale, actor, eventId: newId(), correlationId });
  }

  async reviewOverride(cap: OverrideWrites, ctx: ScopeContext, overrideId: string, m: Row, actor: string, correlationId: string): Promise<Row> {
    if (m['outcome'] !== 'upheld' && m['outcome'] !== 'contested') bad(correlationId, 'override review rejected (outcome): the review upholds or contests the override');
    return cap.reviewOverride({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, overrideId, outcome: m['outcome'] as string, note: String(m['note'] ?? ''), actor, eventId: newId(), correlationId });
  }

  async delegate(cap: DelegationWrites, ctx: ScopeContext, packageId: string, m: Row, actor: string, correlationId: string): Promise<Row> {
    const i = validateDelegationIntake(m, correlationId);
    return cap.delegateApproval({ delegationId: newId(), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, delegate: i.delegate, expiresAt: i.expiresAt, reason: i.reason, actor, eventId: newId(), correlationId });
  }

  async endDelegation(cap: DelegationWrites, ctx: ScopeContext, delegationId: string, m: Row, actor: string, correlationId: string): Promise<Row> {
    const reassignTo = str(m['reassignTo']);
    if (reassignTo !== null && !/^[0-9a-f-]{36}$/.test(reassignTo)) bad(correlationId, 'delegation rejected (delegate): the delegate is another named, active member (a principal id)');
    return cap.endDelegation({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, delegationId, reason: String(m['reason'] ?? ''), reassignTo, newDelegationId: newId(),
                               expiresAt: instantOrNull(m['expiresAt'], 'expiresAt', correlationId), actor, eventId: newId(), correlationId });
  }

  async reserveBoard(cap: BoardWrites, ctx: ScopeContext, packageId: string, m: Row, actor: string, correlationId: string): Promise<Row> {
    const board = m['board'];
    if (typeof board !== 'object' || board === null || Array.isArray(board)) bad(correlationId, 'board reservation rejected (board): the board names its charter (8+ characters) and a whole quorum of at least 2');
    return cap.reserveBoard({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, board: board as Row, rationale: String(m['rationale'] ?? ''), actor, eventId: newId(), correlationId });
  }

  async preview(cap: PreviewWrites, ctx: ScopeContext, packageId: string, version: number, m: Row, actor: string, correlationId: string): Promise<Row> {
    const d = str(m['versionDigest']);
    if (d === null || !/^[0-9a-f]{64}$/.test(d)) bad(correlationId, 'preview rejected: versionDigest must be the 64-hex digest of the version to be committed');
    return cap.commitPreview({ previewId: newId(), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, versionDigest: d as string, actor, eventId: newId(), correlationId });
  }

  async recordControl(cap: ControlWrites, ctx: ScopeContext, m: Row, actor: string, correlationId: string): Promise<Row> {
    const i = validateControlIntake(m, correlationId);
    return cap.recordControl({ controlId: newId(), tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, kind: i.kind, controlKey: i.controlKey, body: i.body, rationale: i.rationale,
                               effectiveFrom: i.effectiveFrom, packageId: i.packageId, actor, eventId: newId(), correlationId });
  }
}
