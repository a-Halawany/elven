/**
 * CP-6 B40 §IN (F-P1-03) — THE INTAKE REVIEW QUEUE, THE CASE'S WHY, THE VERDICTS AND THE UPLOAD APPROVAL as a pure model (vitest, node) and
 * its client. Every word here is said from what the SERVER recorded (0123 §IN: observation.intake_review_queue, intake_case_read,
 * inspection_verdicts_read, decide_upload); nothing is inferred and nothing optimistic is shown:
 *
 *  - the outcomes clean | detected | unavailable | failed | incomplete, with DESIGN D2's sentence: only a clean scan admits;
 *  - the review reasons (safety · authenticity · policy · duplicate · quality · rights · integrity · schema · identity), the duplicate state,
 *    the quality score with its basis, "not recorded before B40" for an earlier case (no back-fill, D8);
 *  - a finding is its CODE, its CLASS and its byte OFFSETS — never content (D9); the excerpt is a separate read of the bytes under
 *    observation.evidence.retrieve, rendered as escaped printable text, the cited span marked;
 *  - the review controls: a manual upload is never reviewed by its uploader (D9b — said on the control AND refused by the server); a held
 *    upload (SP-22) is released only after a second person's approval;
 *  - the upload decision's review is a CLIENT-SIDE PAYLOAD REVIEW (the decide route binds no version or digest): the exact payload shown is
 *    keyed, and any change to it voids the review — said so on the control, never presented as a server version binding.
 * CONSTRUCTION; the walk demonstrates on SYNTHETIC personas.
 */
import { call, type ApiResult } from './api';
import type { ConsequenceView, Eligibility } from './authority-b81';

type Row = Record<string, unknown>;
export type Scope = { tenantId: string; domainId: string };
export interface Receipt { policyDecisionId: string; auditSeq: number }

/* ───────────────────────── the vocabulary ───────────────────────── */
export const INSPECTION_OUTCOMES = ['clean', 'detected', 'unavailable', 'failed', 'incomplete'] as const;
export type InspectionOutcome = (typeof INSPECTION_OUTCOMES)[number];
/** DESIGN D2, in the product's words. */
export const D2_SENTENCE = 'Only a clean scan admits; an unavailable, failed or incomplete scan is never clean.';
export const OUTCOME_WORDS: Readonly<Record<InspectionOutcome, { mark: string; label: string; meaning: string }>> = Object.freeze({
  clean: { mark: '✓', label: 'clean', meaning: 'the engine completed its scan and found no threat' },
  detected: { mark: '⊘', label: 'detected', meaning: 'the engine found a threat — the item is quarantined' },
  unavailable: { mark: '◌', label: 'unavailable', meaning: 'the engine could not be reached or did not answer in time — never a clean verdict' },
  failed: { mark: '✕', label: 'failed', meaning: 'the engine answered with an error — never a clean verdict' },
  incomplete: { mark: '◐', label: 'incomplete', meaning: 'the engine scanned part of the item only — never a clean verdict' },
});
export function outcomeWords(o: unknown): { mark: string; label: string; meaning: string } {
  return typeof o === 'string' && o in OUTCOME_WORDS ? OUTCOME_WORDS[o as InspectionOutcome] : { mark: '?', label: String(o ?? 'not recorded'), meaning: 'an outcome this page does not know — read it as not clean' };
}
export const REVIEW_REASON_LABEL: Readonly<Record<string, string>> = Object.freeze({
  safety: 'Safety — active content, macros, embedded files, hidden instructions or a scan that did not complete clean',
  authenticity: 'Authenticity — an unknown signer',
  policy: 'Policy — the contract\'s rules (an upload awaiting approval, a residency conflict)',
  duplicate: 'Duplicate',
  quality: 'Quality',
  rights: 'Rights',
  integrity: 'Integrity — the bytes are malformed, oversized or not what they declare',
  schema: 'Schema — drift beyond the contract\'s tolerance',
  identity: 'Identity — the destination or the response changed',
  other: 'Other',
});
export const reviewReasonLabel = (r: unknown): string => (typeof r === 'string' && REVIEW_REASON_LABEL[r] !== undefined ? REVIEW_REASON_LABEL[r]! : 'Unclassified (no review reason recorded)');
/** The quarantine classes in words (the historic content classes and §0's). */
export const CLASS_LABEL: Readonly<Record<string, string>> = Object.freeze({
  path_traversal: 'Archive entry escapes the extraction root', type_mismatch: 'Declared and sniffed types disagree', schema_drift: 'Schema drift beyond the contract’s tolerance',
  expansion_limit: 'Declared expansion exceeds the limit', entry_limit: 'Archive declares too many entries', compression_ratio: 'Declared compression ratio is implausible',
  malformed_archive: 'Archive structure is unreadable', oversize: 'Payload exceeds the contract ceiling',
  active_content: 'Active content (scripts, actions)', macro: 'Office macros', embedded_file: 'Embedded files or objects', hidden_instruction: 'Hidden instructions',
  malware_verdict: 'A scan engine detected a threat', inspection_unavailable: 'A scan engine was unavailable', inspection_failed: 'A scan engine answered with an error',
  inspection_incomplete: 'A scan did not cover the whole item', duplicate: 'Duplicate', quality: 'Quality below the contract’s rule', rights: 'Rights',
  policy_prohibited: 'Held by the contract’s policy', residency_conflict: 'Residency conflict', destination_identity_changed: 'Destination identity changed',
  unknown_signer: 'Unknown signer', response_anomaly: 'Response anomaly',
});
export const classLabel = (c: unknown): string => (typeof c === 'string' && CLASS_LABEL[c] !== undefined ? CLASS_LABEL[c]! : typeof c === 'string' ? c : 'unclassified');
export const DUPLICATE_WORDS: Readonly<Record<string, string>> = Object.freeze({
  none: 'no duplicate — these bytes and this item key are new to the domain',
  same_digest: 'the same bytes are already admitted as evidence in this domain',
  same_item_other_digest: 'this source admitted the same item key before, with other bytes',
});
export const duplicateWords = (d: unknown): string => (typeof d === 'string' && DUPLICATE_WORDS[d] !== undefined ? DUPLICATE_WORDS[d]! : 'not recorded before B40');
export const NOT_RECORDED = 'not recorded before B40 (or for a v1–v3 contract — its recorded rule, D8)';
export const D9B_REASON = 'you uploaded this item; a second person reviews it (D9b)';

/* ───────────────────────── the rows ───────────────────────── */
export interface Finding { code: string; class?: string; offset?: number; length?: number; detail?: string }
export interface VerdictBrief { engine: string; engine_version: string | null; outcome: string; finding_codes: string[] }
export interface Verdict {
  verdict_id: string; engine: string; engine_version: string | null; image_digest: string | null; rule_set_digest: string | null;
  signature_databases: Array<{ name: string; version: string | null; buildTime: string | null; digest: string | null }>;
  engine_config: Row; outcome: string; findings: Finding[]; detail: string | null; started_at: string; finished_at: string;
  decision: string; decision_class: string | null; record_point: string;
}
export interface Assessment {
  decision: string; decision_class: string | null; review_reason: string | null; engines_required: string[]; content_rules: Row;
  duplicate_state: string; duplicate_of: Row[]; quality_score: number | string; quality: { completeness: number; parse_confidence: number; duplication: number; basis: string[]; method: string };
  manual_upload: boolean; uploader: string | null; consumer_notice: { products: Row; product_count: number; notify_roles: string[]; steward: string | null; statement: string } | null;
  scanned_digest_verified: boolean; recorded_at: string;
}
export interface UploadApproval {
  approval_id: string; state: 'pending' | 'approved' | 'declined' | 'expired'; requester: string; purpose: string; rule: Row; held_because: string;
  requested_at: string; decided_by: string | null; decided_at: string | null; decision_reason: string | null; media_type: string | null; byte_length: number;
}
export interface QueueCase {
  case_id: string; source_id: string; source_key: string | null; source_name: string | null; contract_version: number; schema_ref: string; connector_kind: string | null;
  item_key: string; state: string; opened_at: string; expires_at: string; closed_at: string | null; past_expiry: boolean; expiry_statement: string | null;
  reason_class: string | null; reason: string | null; review_reason: string | null; declared_type: string | null; sniffed_type: string | null;
  byte_length: number | null; content_digest: string | null; review_actor: string | null; review_reason_text: string | null;
  verdicts: VerdictBrief[]; assessment: Assessment | null; recorded: boolean; not_recorded_statement: string | null;
  manual_upload: boolean; uploader: string | null; you_uploaded: boolean; upload_approval: UploadApproval | null;
}
export interface Queue { cases: QueueCase[]; counts: { open: number; past_expiry: number; held_uploads: number; by_review_reason: Record<string, number> }; as_of: string; state: string }
export interface CaseRead {
  case: QueueCase & { run_id: string | null; manifest_id: string | null };
  source: { source_key: string; name: string; connector_kind: string; schema_ref: string; content_policy: Row | null } | null;
  verdicts: Verdict[]; assessment: Assessment | null; not_recorded_statement: string | null; manual_upload: boolean; uploader: string | null; you_uploaded: boolean;
  upload_approval: UploadApproval | null; upload_approval_events: Array<{ event: string; actor: string; details: Row; occurred_at: string }>;
  events: Row[]; custody: Array<{ event: string; actor: string; occurred_at: string; content_digest: string | null; digest_verified: boolean | null }>;
}

/* ───────────────────────── what a reviewer may do here (the server re-checks every rule) ───────────────────────── */
export interface Control { enabled: boolean; reason: string | null }
/** Release / discard of one case from the queue: role, D9b, the held upload. Never more permissive than the server. */
export function reviewControls(c: Pick<QueueCase, 'state' | 'you_uploaded' | 'upload_approval'>, isCollectionManager: boolean): { release: Control; discard: Control } {
  const no = (reason: string): Control => ({ enabled: false, reason });
  if (c.state !== 'open') { const r = no(`the case is ${c.state} — only an open case is reviewed`); return { release: r, discard: r }; }
  if (!isCollectionManager) { const r = no('releasing or discarding requires the collection_manager role in this domain'); return { release: r, discard: r }; }
  if (c.you_uploaded) { const r = no(D9B_REASON); return { release: r, discard: r }; }
  const held = c.upload_approval !== null && c.upload_approval.state === 'pending';
  return {
    release: held ? no('this upload is held for a second person\'s approval (SP-22) — approve it first; the release follows the approval') : { enabled: true, reason: null },
    discard: { enabled: true, reason: null },
  };
}

/** The upload decision's eligibility in words (the PDP and the port decide: a collection manager or the domain admin, a person, never the uploader). */
export function approvalEligibility(a: UploadApproval | null, me: { principalId: string; kind: string; roles: readonly string[] }): Eligibility {
  const no = (reason: string): Eligibility => ({ can: false, reason, role: null, basis: 'not eligible' });
  if (a === null) return no('this case holds no upload awaiting approval');
  if (me.kind !== 'human') return no('the human gate: only a named person decides an upload — an agent never approves');
  const role = ['collection_manager', 'domain_admin'].find((r) => me.roles.includes(r)) ?? null;
  if (role === null) return no('you hold none of the roles this act requires (collection_manager or domain_admin)');
  if (a.requester === me.principalId) return no('separation of duties: you uploaded this item — a second person decides it (SP-22)');
  if (a.state !== 'pending') return no(`the upload is already ${a.state}`);
  return { can: true, reason: null, role, basis: `you hold ${role} in this domain and did not upload this item` };
}

/* ───────────────────────── the client-side payload review (the decide route binds no version) ───────────────────────── */
/* B40 integration: the binding is the shared one — CommandReview's `payloadReview` (lib/authority-b81.ts canonicalPayload /
   payloadReviewState, b40/res), which says on the control that it is a CLIENT-SIDE payload review; §IN's local key is removed. */
/** What the decide route's SERVER checks (said beside the client-side review — it binds no version or digest). */
export const APPROVAL_SERVER_CONTRACT = 'the person (a named human), the role (collection_manager or domain_admin), that the decider is not the uploader, and that the approval is still pending — no version or digest is bound';
/** The exact payload the decide route sends — what the client-side review holds (the reason as sent, trimmed). */
export function approvalPayload(payload: { approvalId: string; decision: 'approve' | 'decline'; reason: string }): { approvalId: string; decision: 'approve' | 'decline'; reason: string } {
  return { approvalId: payload.approvalId, decision: payload.decision, reason: payload.reason.trim() };
}
/** The effect of the decision, STATED (no server preview exists for it) — a destructive decline states what is kept. */
export function approvalConsequence(decision: 'approve' | 'decline'): ConsequenceView {
  return decision === 'approve'
    ? { effect: 'records your approval of this held upload, then releases its case into evidence through the quarantine review (its own governed write and receipt)',
        affected: ['the upload approval', 'its quarantine case', 'a new evidence object'], users: ['the uploader', 'the collection managers'],
        reversibility: 'the approval stays recorded; admitted evidence is corrected or withdrawn later, never erased', residualRisk: 'every engine answered clean; the content is still the uploader\'s',
        audit: 'upload.approved, case.admitted, the custody chain and the audit chain', source: 'stated', blockers: [] }
    : { effect: 'records your decline of this held upload, then rejects its case through the quarantine review — the bytes are kept in the quarantine volume, the case and its verdicts are kept',
        affected: ['the upload approval', 'its quarantine case'], users: ['the uploader', 'the collection managers'],
        reversibility: 'the decline stays recorded and is not rolled back; the uploader may upload again, as a new item', residualRisk: 'none — nothing is admitted',
        audit: 'upload.declined, case.rejected, the custody chain and the audit chain', source: 'stated', blockers: [] };
}

/* ───────────────────────── the excerpt (escaped printable text, the cited span marked) ───────────────────────── */
export interface ExcerptPart { text: string; marked: boolean }
/** Bytes → visible text: printable ASCII kept, everything else shown as an escape (\\n, \\t, \\xNN) — never interpreted, never HTML. */
export function printable(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) {
    if (b >= 0x20 && b < 0x7f) out += String.fromCharCode(b);
    else if (b === 0x0a) out += '\\n\n';
    else if (b === 0x09) out += '\\t';
    else out += `\\x${b.toString(16).padStart(2, '0')}`;
  }
  return out;
}
export function base64Bytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
  return out;
}
/** Split the served window into before / the cited span / after (offsets are the item's, as the server served them). */
export function excerptParts(e: { base64: string; served: { start: number; end: number }; highlight: { start: number; end: number } }): ExcerptPart[] {
  const bytes = base64Bytes(e.base64);
  const s = Math.max(0, e.highlight.start - e.served.start); const t = Math.max(s, Math.min(bytes.length, e.highlight.end - e.served.start));
  return [{ text: printable(bytes.subarray(0, s)), marked: false }, { text: printable(bytes.subarray(s, t)), marked: true }, { text: printable(bytes.subarray(t)), marked: false }]
    .filter((p) => p.text.length > 0);
}

/* ───────────────────────── words ───────────────────────── */
/** A finding as cited: its code, its class, its offset and length — never content (D9). */
export function findingLine(f: Finding): string {
  const at = f.offset === undefined ? 'no offset' : `byte ${f.offset}${f.length === undefined ? '' : ` (+${f.length})`}`;
  return `${f.code}${f.class === undefined ? '' : ` · ${f.class.replace(/_/g, ' ')}`} · ${at}`;
}
/** The engine's identity in one line (version, image digest, rule set, the databases) — what said the verdict. */
export function engineIdentityLine(v: Pick<Verdict, 'engine' | 'engine_version' | 'image_digest' | 'rule_set_digest' | 'signature_databases'>): string {
  const parts = [`${v.engine} ${v.engine_version ?? '(version not reported)'}`];
  if (v.engine === 'clamav' || v.image_digest !== null) parts.push(v.image_digest === null ? 'image digest not declared' : `image ${v.image_digest.slice(0, 19)}…`);
  if (v.rule_set_digest !== null) parts.push(`rule set ${v.rule_set_digest.slice(0, 12)}…`);
  for (const d of v.signature_databases) parts.push(`${d.name} ${d.version ?? '?'}${d.buildTime === null ? '' : ` built ${d.buildTime}`}${d.digest === null ? ' (digest not reported)' : ` ${d.digest.slice(0, 12)}…`}`);
  return parts.join(' · ');
}
/** The engine configuration recorded on a verdict (the ClamAV database source and update policy named explicitly). */
export function engineConfigLines(c: Row): string[] {
  const out: string[] = [];
  if (typeof c['database_source'] === 'string') out.push(`signature database source: ${c['database_source']}`);
  if (typeof c['update_policy'] === 'string') out.push(`update policy: ${c['update_policy']}`);
  if (typeof c['admission'] === 'string') out.push(`image admission: ${c['admission']}`);
  if (typeof c['address'] === 'string') out.push(`engine address: ${c['address']}`);
  if (typeof c['sandbox'] === 'string') out.push(`sandbox: ${c['sandbox']}`);
  if (typeof c['network'] === 'string') out.push(`network: ${c['network']}`);
  if (c['configured'] === false) out.push('no engine configured in this deployment');
  return out;
}
export const scoreOf = (q: unknown): number | null => { const n = Number(q); return Number.isFinite(n) ? n : null; };

/** The filename as the upload route normalises it into the item key (upload.controller.ts normaliseFilename — mirrored, tested). */
export function normalisedFilename(name: string): string {
  const flat = name.replace(/\\/g, '/').split('/').pop() ?? 'upload';
  const safe = flat.replace(/^\.+/, '').trim().replace(/[^A-Za-z0-9._ -]+/g, '_').slice(0, 180);
  return safe.length > 0 ? safe : 'upload';
}
/** The run's outcome for an upload, from the server's counts AND the queue's own cases of this upload — never inferred. */
export function uploadOutcomeLines(run: { admitted: number; quarantined: number; noop: number; state: string; reason?: string },
                                   files: readonly string[], cases: readonly Pick<QueueCase, 'item_key' | 'reason_class' | 'upload_approval'>[]): string[] {
  const out = [`run ${run.state}: ${run.admitted} admitted · ${run.quarantined} quarantined · ${run.noop} no-op${run.reason !== undefined ? ` — ${run.reason}` : ''}`];
  for (const f of files) {
    const c = cases.find((x) => x.item_key.startsWith(`upload:${normalisedFilename(f)}@`));
    if (c === undefined) continue;
    out.push(c.upload_approval !== null && c.upload_approval.state === 'pending'
      ? `${f}: held for a second person's approval (SP-22) — ${c.upload_approval.held_because}`
      : `${f}: quarantined — ${classLabel(c.reason_class)}`);
  }
  if (run.quarantined > 0 && out.length === 1) out.push('the quarantined items are in the review queue (Quarantine)');
  return out;
}

/* ───────────────────────── the client (the §IN routes; the envelope's action is the route's) ───────────────────────── */
function obsCall<T>(s: Scope, path: string, action: string, objectType: string, payload: unknown, objectId: string | null = null, sideEffect: 'none' | 'reversible' = 'reversible'): Promise<ApiResult<T>> {
  return call<T>(`/v1/tenants/${s.tenantId}/domains/${s.domainId}/observation${path}`, {
    scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: objectType, object_id: objectId, purpose_id: 'observation', side_effect_class: sideEffect,
  }, payload);
}
export const intake = {
  queue: (s: Scope, state: 'open' | 'admitted' | 'rejected' | 'expired' | 'all' = 'open') =>
    obsCall<{ queue: Queue; receipt: Receipt }>(s, '/intake/queue', 'observation.inspection.read', 'QAR', { state, limit: 200 }),
  readCase: (s: Scope, caseId: string) =>
    obsCall<{ intake: CaseRead; receipt: Receipt }>(s, `/intake/cases/${caseId}/read`, 'observation.inspection.read', 'QAR', {}, caseId),
  excerpt: (s: Scope, caseId: string, offset: number, length: number | undefined) =>
    obsCall<{ excerpt: { caseId: string; contentDigest: string; byteLength: number; served: { start: number; end: number }; highlight: { start: number; end: number }; base64: string }; receipt: Receipt }>(
      s, `/intake/cases/${caseId}/excerpt`, 'observation.evidence.retrieve', 'QAR', length === undefined ? { offset } : { offset, length }, caseId),
  verdicts: (s: Scope, evdId: string, version: number | null) =>
    obsCall<{ inspection: { verdicts: Verdict[]; assessment: Assessment | null; statement: string | null }; receipt: Receipt }>(
      s, `/evidence/${evdId}/inspection`, 'observation.inspection.read', 'EVD', version === null ? {} : { version }, evdId),
  decide: (s: Scope, approvalId: string, decision: 'approve' | 'decline', reason: string) =>
    obsCall<{ approval: Row; review: { case: Row; receipt: Receipt } | null; review_refused?: { status: number; message: string }; receipt: Receipt }>(
      s, `/intake/uploads/${approvalId}/decide`, 'observation.upload.approve', 'QAR', { decision, reason }, approvalId, 'reversible'),
};
