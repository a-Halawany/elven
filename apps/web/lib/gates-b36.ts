/**
 * CP-6 B36 (0094 §G) — the HUMAN GATE COMPLETED (F-P6-04): the signature beyond the audit chain, recusal, challenge, the distribution
 * after commitment, the validated fields, the board surface, the ONE uniform gate state (ADR-003). Every act is a separate governed write
 * with its own PDP action; the server judges the person, the record and the rule, verifies every signature and says so. The helpers below
 * only word what the record says and shape what is sent; nothing here decides whether a gate is open or a signature valid.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };
type Row = Record<string, unknown>;

/** The ONE uniform human-gate product state vocabulary (executive.gate_states, 0094 §0.3) — the same badge for a decision, a source contract and a merge. */
export const GATE_STATES = ['drafted', 'review_requested', 'information_requested', 'deferred', 'challenged', 'recused', 'approved', 'rejected', 'overridden', 'withdrawn'] as const;
export type GateState = (typeof GATE_STATES)[number];
export const GATE_STATE_KINDS = ['decision', 'source', 'merge'] as const;
export interface GateStateRow { kind: string; id: string; version: number | null; state: GateState; basis?: string; since: string | null; by: string | null; terminal?: boolean | null }

/** The state as a glyph, a token and a word — never colour alone. */
export function gateStateMark(state: string): { glyph: string; token: string; text: string } {
  switch (state) {
    case 'drafted': return { glyph: '◌', token: '--eye-color-ink-muted', text: 'DRAFTED' };
    case 'review_requested': return { glyph: '◍', token: '--eye-color-accent-default', text: 'REVIEW REQUESTED' };
    case 'information_requested': return { glyph: '?', token: '--eye-color-warning', text: 'INFORMATION REQUESTED' };
    case 'deferred': return { glyph: '◷', token: '--eye-color-warning', text: 'DEFERRED' };
    case 'challenged': return { glyph: '⚑', token: '--eye-color-critical', text: 'CHALLENGED — held' };
    case 'recused': return { glyph: '⊘', token: '--eye-color-warning', text: 'RECUSED — quorum re-evaluated' };
    case 'approved': return { glyph: '●', token: '--eye-color-success', text: 'APPROVED' };
    case 'rejected': return { glyph: '✕', token: '--eye-color-critical', text: 'REJECTED' };
    case 'overridden': return { glyph: '◇', token: '--eye-color-warning', text: 'OVERRIDDEN (recorded)' };
    case 'withdrawn': return { glyph: '✕', token: '--eye-color-ink-muted', text: 'WITHDRAWN' };
    default: return { glyph: '○', token: '--eye-color-ink-muted', text: String(state).toUpperCase() || 'UNKNOWN' };
  }
}

/** A recorded signature in words: the signer, the key, and whether the SERVER verified it (a signature over another digest reads as not verified). */
export function signatureLine(s: Row): string {
  const signer = typeof s['signer'] === 'string' ? `${s['signer'].slice(0, 8)}…` : 'unknown signer';
  const key = typeof s['key_id'] === 'string' ? s['key_id'] : 'no key';
  const at = typeof s['signed_at'] === 'string' ? s['signed_at'] : String(s['signed_at'] ?? '');
  return `${s['verified'] === true ? '✓ VERIFIED' : '✕ NOT VERIFIED'} — signed by ${signer} with ${key}${at ? ` at ${at}` : ''}`;
}

/** A denial in words: "denied: <who> tried <what> — <rule>". */
export function denialLine(d: Row): string {
  const who = typeof d['principal_id'] === 'string' ? `${d['principal_id'].slice(0, 8)}…` : 'someone';
  return `denied: ${who} tried ${String(d['action'])} — ${String(d['reason'] ?? d['decision'] ?? 'refused')} (policy decision ${String(d['policy_decision_id'] ?? '').slice(0, 8)}…)`;
}

/** A distribution row in words: the recipient, the channel (SYNTHETIC said), the state and the receipt's proof. */
export function distributionLine(d: Row): string {
  const who = typeof d['recipient_principal_id'] === 'string' ? `${d['recipient_principal_id'].slice(0, 8)}…` : 'a recipient';
  const receipt = (d['receipt'] ?? null) as Row | null;
  const proof = receipt === null ? (typeof d['error'] === 'string' ? d['error'] : 'no receipt') : String(receipt['proof'] ?? receipt['sink_message_id'] ?? receipt['sink'] ?? 'receipt recorded');
  return `${who} via ${String(d['channel'])}${d['synthetic_state'] === true ? ' (SYNTHETIC — a local sink)' : ''}: ${String(d['state']).toUpperCase()} — ${proof}`;
}

/** The fields' item builders: an item, or the reason it is not one yet (the server re-validates and refuses naming the field). */
export interface MissingInformation { what: string; owner: string; needed_by: string }
export interface ExpectedEffect { effect: string; measure: string; direction: 'up' | 'down' | 'flat'; horizon: '30d' | '90d' | '12m' | '36m'; basis: string }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
export const EFFECT_DIRECTIONS = ['up', 'down', 'flat'] as const;
export const EFFECT_HORIZONS = ['30d', '90d', '12m', '36m'] as const;
export function buildMissingInformation(f: { what: string; owner: string; needed_by: string }): MissingInformation | string {
  if (f.what.trim().length < 4) return 'says what is missing (4+ characters)';
  if (!UUID.test(f.owner.trim())) return 'names the principal who will supply it';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.needed_by) || Number.isNaN(new Date(f.needed_by).getTime())) return 'names the day it is needed by';
  return { what: f.what.trim(), owner: f.owner.trim(), needed_by: f.needed_by };
}
export function buildExpectedEffect(f: { effect: string; measure: string; direction: string; horizon: string; basis: string }): ExpectedEffect | string {
  if (f.effect.trim().length < 4) return 'says the effect expected (4+ characters)';
  if (f.measure.trim().length < 2) return 'names the measure it shows on';
  if (!(EFFECT_DIRECTIONS as readonly string[]).includes(f.direction)) return 'the direction is up, down or flat';
  if (!(EFFECT_HORIZONS as readonly string[]).includes(f.horizon)) return 'the horizon is 30d, 90d, 12m or 36m';
  if (f.basis.trim().length < 4) return 'states the basis of the expectation (4+ characters)';
  return { effect: f.effect.trim(), measure: f.measure.trim(), direction: f.direction as ExpectedEffect['direction'], horizon: f.horizon as ExpectedEffect['horizon'], basis: f.basis.trim() };
}

/** Which board acts the page OFFERS for a board-class package's version state (the server decides; a refusal is shown in its words). */
export function boardActsFor(versionState: string, ownApproval: string | null, ownRecusal: boolean): Array<'approve' | 'reject' | 'defer'> {
  if (ownRecusal) return [];
  if (['proposed', 'under_review', 'approved'].includes(versionState)) return ownApproval === null ? ['approve', 'reject', 'defer'] : ['defer'];
  return [];
}

export interface GateRecord {
  package_id: string; version: number; state: string; version_digest: string | null; header_digest: string | null;
  missing_information: MissingInformation[]; expected_effects: ExpectedEffect[]; gate: GateStateRow;
  approvals: Array<Row & { approval_id: string; approver: string; decision: string; header_digest: string | null; revoked_at: string | null; recused: boolean; signatures: Row[] }>;
  decision_signatures: Row[]; recusals: Row[]; challenges: Row[]; denials: Row[]; distributions: Row[];
  commitment: { commitment_id: string; committed_by: string; committed_at: string } | null; signing_key: { keyId: string; publicKeyPem: string } | null;
}
export interface BoardPackage extends Row {
  package_id: string; title: string; statement: string; state: string; decision_class: string; board: Row | null; current_version: number | null; committed_version: number | null;
  gate: GateStateRow | null; version: (Row & { state: string; version_digest: string | null }) | null; approvals: Row[]; own_approval: string | null; own_recusal: boolean; open_challenge: Row | null; quorum: number; live_approvals: number;
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}`;
async function p<T>(s: Scope, path: string, action: string, objectType: string, payload: Row = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId,
    purpose_id: 'decision', side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2',
  }, payload);
}

export const gatesB36 = {
  record: (s: Scope, pkg: string, v: number) => p<{ record: GateRecord; receipt: Receipt }>(s, `/decisions/${pkg}/versions/${v}/gate-record`, 'decision.read', 'DPK', {}, pkg),
  gateState: (s: Scope, kind: 'decision' | 'source' | 'merge', id: string, version: number | null) =>
    p<{ gate: GateStateRow; receipt: Receipt }>(s, '/decisions/gate-state', 'decision.read', 'DPK', version === null ? { kind, id } : { kind, id, version }, id),
  /** k1: an approval by its approver (approvalId + the approval's header digest), or the committed decision by its owner / committer (the version's header digest). */
  sign: (s: Scope, pkg: string, v: number, kind: 'approval' | 'decision', digest: string, approvalId: string | null) =>
    p<{ signature: Row; receipt: Receipt }>(s, `/decisions/${pkg}/versions/${v}/sign`, `decision.sign.${kind}`, 'DPK', approvalId === null ? { kind, digest } : { kind, digest, approvalId }, pkg),
  recuse: (s: Scope, pkg: string, v: number, reason: string) => p<{ recusal: Row; receipt: Receipt }>(s, `/decisions/${pkg}/versions/${v}/recuse`, 'decision.recuse', 'DPK', { reason }, pkg),
  challenge: (s: Scope, pkg: string, v: number, reason: string) => p<{ challenge: Row; receipt: Receipt }>(s, `/decisions/${pkg}/versions/${v}/challenge`, 'decision.challenge', 'DPK', { reason }, pkg),
  resolveChallenge: (s: Scope, pkg: string, v: number, challengeId: string, resolution: 'upheld' | 'dismissed', note: string) =>
    p<{ resolution: Row; receipt: Receipt }>(s, `/decisions/${pkg}/versions/${v}/resolve-challenge`, 'decision.challenge.resolve', 'DPK', { challengeId, resolution, note }, pkg),
  /** k2: in_app always; email / sms / teams are SYNTHETIC (local sinks); named recipients are principal ids. */
  distribute: (s: Scope, pkg: string, v: number, channels: string[], recipients: string[]) =>
    p<{ distribution: Row & { rows: Row[]; record_digest: string; synthetic_note: string }; receipt: Receipt }>(s, `/decisions/${pkg}/versions/${v}/distribute`, 'decision.distribute', 'DPK', { channels, recipients }, pkg),
  /** l3: the fields on a DRAFT, under the terms' authority. */
  setFields: (s: Scope, pkg: string, v: number, missingInformation: MissingInformation[], expectedEffects: ExpectedEffect[]) =>
    p<{ fields: Row; receipt: Receipt }>(s, `/decisions/${pkg}/versions/${v}/fields`, 'decision.package.terms', 'DPK', { missingInformation, expectedEffects }, pkg),
  /** l4: the board surface and the board member's own acts (the server refuses a standard package). */
  board: (s: Scope) => p<{ board: BoardPackage[]; receipt: Receipt }>(s, '/decisions/board/list', 'decision.board.read', 'DPK'),
  boardAct: (s: Scope, pkg: string, v: number, act: 'approve' | 'reject' | 'defer', payload: Row) =>
    p<{ board: Row; receipt: Receipt }>(s, `/decisions/board/${pkg}/versions/${v}/${act}`, `decision.board.${act}`, act === 'defer' ? 'DPK' : 'APR', payload, act === 'defer' ? pkg : null),
};
