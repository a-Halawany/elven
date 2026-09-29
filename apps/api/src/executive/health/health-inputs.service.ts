/**
 * THE SCORE COMPLETED — CP-6 B36 part `strategy` (migration 0094 §S1–§S5; F-P6-08 (f)(g)(h)).
 *
 *   THE INPUT CONTRACT WITH OWNERS   executive.health_inputs — per component of the active definition the input it reads, its OWNER
 *                                    (derived from the input's own object: the measure's MSR owner, the indicator's owner, the
 *                                    exposure's owner, the objective's owner for the computed classes), the value last read or last
 *                                    stated, and the EDIT HISTORY (executive.health_input_edits). The OWNER-CORRECTION route
 *                                    (executive.set_health_input) admits the input's owner only; a non-owner is refused (ownership).
 *   THE ANTI-GAMING MEASURE          an owner edit inside the definition's policy window before a FAVOURABLE change is flagged on the
 *                                    change (owner_edit_flag, the edit ids) and counted per owner (executive.owner_edit_analysis).
 *   THE EXCEPTIONS                   requested by a named human, approved or refused by ANOTHER (the executive's authority), with a
 *                                    reason and an expiry; the score names the ones in force; an unapproved one has no effect.
 *   THE SNAPSHOT APPROVAL            the executive accepts a CURRENT snapshot on the digest PREVIEWED; the acceptance is SIGNED beyond
 *                                    the audit chain (§0's record_signature, kind health_snapshot) under the same bound action.
 *
 * The rules are the ports'; the validation here refuses a malformed request early, in plain words (422).
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { SignatureService } from '../signatures/signature.service.js';
import type { ExecutiveReads, HealthInputWrites } from '../executive.capabilities.js';

type Row = Record<string, unknown>;
export const EXCEPTION_KINDS = ['exclude', 'relax_bound'] as const;
export const EXCEPTION_STATES = ['requested', 'approved', 'refused'] as const;
export const HEALTH_SNAPSHOT_SIGNATURE_KIND = 'health_snapshot' as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const text = (p: Row, k: string): string => (typeof p[k] === 'string' ? (p[k] as string).trim() : '');
const bad = (correlationId: string, m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, m), 422); };

/** The owner-correction intake: the component, the restated value, the reason. */
export function validateSetInput(p: Row, correlationId: string): { componentKey: string; value: number; reason: string } {
  const componentKey = text(p, 'component_key');
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(componentKey)) bad(correlationId, 'payload.component_key names a component of the active definition (lower_snake_case)');
  const value = Number(p['value']);
  if (p['value'] === null || p['value'] === undefined || p['value'] === '' || !Number.isFinite(value)) bad(correlationId, 'payload.value is the restated reading (a finite number)');
  const reason = text(p, 'reason');
  if (reason.length < 8 || reason.length > 2000) bad(correlationId, 'payload.reason says why the reading is restated (8–2000 characters)');
  return { componentKey, value, reason };
}

/** An exception request: the component, exclude | relax_bound (with the relaxed days), the reason, the expiry (an instant). */
export function validateExceptionRequest(p: Row, correlationId: string): { componentKey: string; kind: (typeof EXCEPTION_KINDS)[number]; relaxedDays: number | null; reason: string; expiresAt: string } {
  const componentKey = text(p, 'component_key');
  if (!/^[a-z][a-z0-9_]{1,62}$/.test(componentKey)) bad(correlationId, 'payload.component_key names a component of the active definition (lower_snake_case)');
  const kind = p['kind'];
  if (typeof kind !== 'string' || !(EXCEPTION_KINDS as readonly string[]).includes(kind)) bad(correlationId, `payload.kind is one of ${EXCEPTION_KINDS.join(', ')}`);
  const relaxed = p['relaxed_stale_after_days'];
  const relaxedDays = relaxed === undefined || relaxed === null || relaxed === '' ? null : Number(relaxed);
  if (relaxedDays !== null && (!Number.isFinite(relaxedDays) || relaxedDays <= 0 || relaxedDays > 3660)) bad(correlationId, 'payload.relaxed_stale_after_days is a number of days in (0, 3660]');
  if ((kind === 'relax_bound') !== (relaxedDays !== null)) bad(correlationId, 'relax_bound names payload.relaxed_stale_after_days; exclude names none');
  const reason = text(p, 'reason');
  if (reason.length < 8 || reason.length > 2000) bad(correlationId, 'payload.reason says why the component is excepted (8–2000 characters)');
  const e = p['expires_at'];
  if (typeof e !== 'string' || Number.isNaN(Date.parse(e))) bad(correlationId, 'payload.expires_at is the instant the exception lapses (ISO 8601)');
  return { componentKey, kind: kind as (typeof EXCEPTION_KINDS)[number], relaxedDays, reason, expiresAt: new Date(e as string).toISOString() };
}

/** An exception decision: approve | refuse, with a note. */
export function validateExceptionDecision(p: Row, correlationId: string): { decision: 'approve' | 'refuse'; note: string } {
  const decision = p['decision'];
  if (decision !== 'approve' && decision !== 'refuse') bad(correlationId, 'payload.decision is approve or refuse');
  const note = text(p, 'note');
  if (note.length < 8 || note.length > 2000) bad(correlationId, 'payload.note records the decision (8–2000 characters)');
  return { decision: decision as 'approve' | 'refuse', note };
}

/** A snapshot approval: the digest previewed and a note. */
export function validateSnapshotApproval(p: Row, correlationId: string): { digest: string; note: string } {
  const digest = text(p, 'result_digest').toLowerCase();
  if (!HEX64.test(digest)) bad(correlationId, 'payload.result_digest is the result digest the approver previewed (64 hex)');
  const note = text(p, 'note');
  if (note.length < 8 || note.length > 2000) bad(correlationId, 'payload.note records the acceptance (8–2000 characters)');
  return { digest, note };
}

function inputOf(r: Row, edits: Row[]): Row {
  return {
    input_id: r['input_id'], definition_id: r['definition_id'], component_key: r['component_key'], input_kind: r['input_kind'], input_ref: r['input_ref'],
    owner_principal_id: r['owner_principal_id'] ?? null, owner_basis: r['owner_basis'], value: num(r['value']), unit: r['unit'] ?? null, as_of: iso(r['as_of']), digest: r['digest'],
    owner_stated: r['owner_stated'] === true, edits: Number(r['edits'] ?? 0), last_edit_id: r['last_edit_id'] ?? null, refreshed_at: iso(r['refreshed_at']),
    history: edits.filter((e) => e['input_id'] === r['input_id']).map((e) => ({ edit_id: e['edit_id'], editor: e['editor_principal_id'], from_value: num(e['from_value']), to_value: num(e['to_value']), reason: e['reason'], edited_at: iso(e['edited_at']) })),
  };
}
function exceptionOf(r: Row): Row {
  return {
    exception_id: r['exception_id'], definition_id: r['definition_id'], component_key: r['component_key'], kind: r['kind'], relaxed_stale_after_days: num(r['relaxed_stale_after_days']), reason: r['reason'],
    expires_at: iso(r['expires_at']), state: r['state'], requested_by: r['requested_by'], requested_at: iso(r['requested_at']), approved_by: r['approved_by'] ?? null, approved_at: iso(r['approved_at']),
    approval_note: r['approval_note'] ?? null, refused_by: r['refused_by'] ?? null, refused_at: iso(r['refused_at']), refusal_reason: r['refusal_reason'] ?? null,
  };
}

@Injectable()
export class HealthInputsService {
  constructor(private readonly signatures: SignatureService) {}

  /** The input CONTRACT of the active definition (or the one named): every component's owner, value, as-of and edit history; the owner-edit analysis; the reader's active context (§0). */
  async inputs(cap: HealthInputWrites, p: { definitionId?: unknown; principalId: string; tenantId: string; domainId: string }): Promise<Row> {
    const definitionId = typeof p.definitionId === 'string' && UUID.test(p.definitionId) ? p.definitionId : null;
    let q = cap.readHealthInputs().selectAll();
    if (definitionId !== null) q = q.where('definition_id' as never, '=', definitionId as never);
    else {
      const active = (await cap.readHealthDefinitions().select(['definition_id'] as never).where('state' as never, '=', 'active' as never).executeTakeFirst()) as Row | undefined;
      if (active === undefined) return { definition_id: null, inputs: [], owner_edits: { owners: [], totals: { edits: 0, flagged_edits: 0 } }, context: await cap.currentContext({ principalId: p.principalId }), note: 'no definition is active in this domain' };
      q = q.where('definition_id' as never, '=', active['definition_id'] as never);
    }
    const rows = (await q.orderBy('component_key' as never, 'asc').execute()) as Row[];
    const edits = rows.length === 0 ? [] : (await cap.readHealthInputEdits().selectAll().where('input_id' as never, 'in', rows.map((r) => r['input_id']) as never).orderBy('edited_at' as never, 'desc').execute()) as Row[];
    const [analysis, context] = await Promise.all([cap.ownerEditAnalysis({ tenantId: p.tenantId, domainId: p.domainId, definitionId }), cap.currentContext({ principalId: p.principalId })]);
    return { definition_id: definitionId ?? (rows[0]?.['definition_id'] ?? analysis['definition_id'] ?? null), inputs: rows.map((r) => inputOf(r, edits)), owner_edits: analysis, context };
  }

  async exceptions(cap: ExecutiveReads, p: { state?: unknown; definitionId?: unknown; limit?: unknown }): Promise<Row[]> {
    let q = cap.readHealthExceptions().selectAll();
    if (typeof p.state === 'string' && (EXCEPTION_STATES as readonly string[]).includes(p.state)) q = q.where('state' as never, '=', p.state as never);
    if (typeof p.definitionId === 'string' && UUID.test(p.definitionId)) q = q.where('definition_id' as never, '=', p.definitionId as never);
    const rows = (await q.orderBy('requested_at' as never, 'desc').limit(Math.min(Math.max(Number(p.limit ?? 100) || 100, 1), 500)).execute()) as Row[];
    return rows.map(exceptionOf);
  }

  /** The preview of a snapshot's approval (404 when no snapshot matches). */
  async preview(cap: HealthInputWrites, snapshotId: string, correlationId: string): Promise<Row> {
    const r = await cap.previewSnapshotApproval({ snapshotId });
    if (r === null) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no such health score snapshot in this domain'), 404);
    return r;
  }

  /**
   * APPROVE a snapshot and SIGN the acceptance in the same governed write: the port records the approval on the digest previewed; the
   * signer records the Ed25519 signature over that digest through §0's executive.record_signature under this same bound action. No
   * key bound → the whole act is refused (409 `signature rejected (unbound)`), never an unsigned acceptance.
   */
  async approveSnapshot(cap: HealthInputWrites, a: { tenantId: string; domainId: string; snapshotId: string; digest: string; note: string; actor: string; correlationId: string }): Promise<Row> {
    const approval = await cap.approveHealthSnapshot({ approvalId: newId(), tenantId: a.tenantId, domainId: a.domainId, snapshotId: a.snapshotId, digest: a.digest, note: a.note, actor: a.actor, correlationId: a.correlationId });
    const signature = await this.signatures.sign(cap.signer(), { tenantId: a.tenantId, domainId: a.domainId, action: 'executive.health.snapshot.approve', kind: HEALTH_SNAPSHOT_SIGNATURE_KIND,
      subjectId: a.snapshotId, subjectVersion: 1, subjectDigest: a.digest, actor: a.actor, correlationId: a.correlationId });
    return { ...approval, signature };
  }
}
