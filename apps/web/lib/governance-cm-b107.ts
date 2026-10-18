/**
 * The conformance client — CP-6 B107 §CM (0115_b107_x_cm; F-P7D-25): the generated component manifest (units, the 92 logical components as
 * service manifests), its registration, the release-candidate record (B65 SUBSTITUTED — never a release) with its evidence check and its
 * attestation by independent assurance, the local conformance monitor's findings and runs, the state per component, the closure gap report.
 *
 * Every response is returned VERBATIM. The helpers below only WORD what the record says — the server decides whether evidence is absent, stale,
 * unverifiable or foreign, whether a candidate is held, who may attest (the port's approver test), and what state a component is in (never
 * inferred). On a demonstration every persona and record is SYNTHETIC; an attested candidate is not a release (B65), not production admission
 * (R1), not real acceptance (R2).
 */
import { call, type ApiResult } from './api';

type Row = Record<string, unknown>;
export interface Receipt { policyDecisionId: string; auditSeq: number }
export interface EvidenceItem { item: number; family: string; kind: string; ref: string; artifact_id: string | null; digest: string | null; bound_head_sha: string | null; captured_at: string; valid_until: string; note?: string | null }
export interface Hold { hold_id: string; reason_kind: string; reason: string; opened_at: string }
export interface Signature { signature_id: string; signer: string; signer_role: string; key_id: string; signed_at: string; subject_digest: string; verified: boolean }
export interface Candidate {
  candidate_id: string; version: number; label: string; head_sha: string; migration_head: string; policy_bundle: { version: string; digest: string }; manifest_version: number; manifest_digest: string;
  config_digest: string; deployment_profile: string; customer_scope: { kind: string; tenants: string[]; domains: string[] }; topology: Row; period_from: string; period_to: string;
  evidence: EvidenceItem[]; builders: string[]; digest: string; state: string; check_result: Row | null; checked_at: string | null; attested_by_name: string | null; attested_at: string | null;
  signature_id: string | null; withdraw_reason: string | null; proposed_by: string; proposed_by_name: string | null; proposed_at: string; claim: string; release: string; production_admission: string;
  open_holds: Hold[]; signatures: Signature[];
}
export interface Finding { finding_id: string; kind: string; fingerprint: string; subject_artifact: string | null; summary: string; state: string; opened_at: string; resolved_at: string | null; resolution: string | null }
export interface ComponentState { component_id: string; kind: string; layer: string | null; deployed_by: string[]; state: string; basis: string }
export interface Workspace {
  identity: { head_sha: string; head_source: string; policy_bundle: { version: string; digest: string }; config_digest: string; config_keys: string[]; manifest: { path: string; readable: boolean; file_digest: string | null; reason: string | null } };
  migration_head: string | null; manifest: Row | null; manifests: Row[]; sync: { state: string; reason?: string; committed?: string; registered?: string };
  committed: { readable: boolean; path: string; file_digest: string | null; summary: Row | null; layers: Row[]; unmapped: string[] };
  candidates: Candidate[]; last_conformant: Candidate | null; findings: Finding[]; runs: Row[]; components: ComponentState[]; component_totals: Record<string, number>;
  closure: { statement: string; dimensions: string[]; totals: Record<string, number>; data: Row } | null; artifacts: Row[]; ledger: Row[]; signer: { key_id?: string } | null;
  read_at: string; boundary: string; receipt: Receipt;
}
export interface ManifestView { file_digest: string; summary: Row; layers: Row[]; filter: { layer: string | null; kind: string | null }; units: Row[]; logical_components: Row[]; ai_planes: Row[]; read_at: string; receipt: Receipt }
export interface Preview { candidate: Row; digest: string; eligibility: { can_attest: boolean; reasons: string[] }; consequence: string; signer_bound: boolean; read_at: string; receipt: Receipt }

const PLATFORM = (action: string, objectType: string, objectId: string | null = null) => ({
  scope: 'PLATFORM' as const, purpose_id: 'governance', action, object_type: objectType, object_id: objectId, side_effect_class: action.endsWith('.read') ? 'none' as const : 'reversible' as const,
});
const B = '/v1/governance/conformance';

export const cm = {
  workspace: (): Promise<ApiResult<Workspace>> => call(`${B}/read`, PLATFORM('governance.read', 'CFN')),
  manifest: (filter: { layer: string | null; kind: string | null }): Promise<ApiResult<ManifestView>> => call(`${B}/manifest/read`, PLATFORM('governance.read', 'CFN'), filter),
  register: (): Promise<ApiResult<{ manifest: Row; receipt: Receipt }>> => call(`${B}/manifest/register`, PLATFORM('governance.conformance.manifest.register', 'CFN')),
  assemble: (p: { candidateId?: string | null; expectedVersion: number; label: string; periodFrom: string; periodTo: string; scope: Row; evidence: Row[]; builders: string[] }): Promise<ApiResult<{ candidate: Candidate; receipt: Receipt }>> =>
    call(`${B}/candidates/assemble`, PLATFORM('governance.conformance.candidate.assemble', 'RCN', p.candidateId ?? null), p),
  check: (id: string, version: number): Promise<ApiResult<{ check: Row; receipt: Receipt }>> => call(`${B}/candidates/${id}/check`, PLATFORM('governance.conformance.candidate.check', 'RCN', id), { version }),
  preview: (id: string): Promise<ApiResult<Preview>> => call(`${B}/candidates/${id}/preview`, PLATFORM('governance.read', 'RCN', id)),
  attest: (id: string, p: { version: number; digest: string; reason: string }): Promise<ApiResult<{ attestation: Row; receipt: Receipt }>> =>
    call(`${B}/candidates/${id}/attest`, { ...PLATFORM('governance.conformance.candidate.attest', 'RCN', id), consequence_class: 'C2' }, p),
  withdraw: (id: string, p: { version: number; reason: string }): Promise<ApiResult<{ candidate: Row; receipt: Receipt }>> => call(`${B}/candidates/${id}/withdraw`, PLATFORM('governance.conformance.candidate.withdraw', 'RCN', id), p),
  monitor: (): Promise<ApiResult<{ monitor: Row; receipt: Receipt }>> => call(`${B}/monitor/run`, PLATFORM('governance.conformance.monitor', 'CFN')),
};

// ── wording (never judging) ──────────────────────────────────────────────────────────────────────
/** A candidate's state in words: an assembled candidate is never worded like a checked one, a conformant check never like an attestation, and
 *  nothing is ever worded as a release. */
export function candidateStateText(state: string): string {
  switch (state) {
    case 'assembled': return 'ASSEMBLED — not checked';
    case 'conformant': return 'CONFORMANT on its local evidence check — not attested, not a release';
    case 'refused': return 'REFUSED by its evidence check';
    case 'held': return 'HELD — an open hold stops it';
    case 'attested': return 'ATTESTED by independent assurance (signed) — still not a release (B65), not production admission (R1)';
    case 'withdrawn': return 'WITHDRAWN';
    case 'superseded': return 'SUPERSEDED by a later version';
    default: return state;
  }
}
export function componentStateText(state: string): string {
  switch (state) {
    case 'conformant_local': return 'conformant (local, build-level evidence)';
    case 'not_deployed': return 'catalogued — not deployed here';
    case 'unverified': return 'unverified — no checked candidate';
    case 'nonconformant': return 'NON-CONFORMANT';
    case 'held': return 'HELD';
    case 'drifted': return 'DRIFTED — what runs is not what was checked';
    default: return state;
  }
}
export function syncText(s: Workspace['sync']): string {
  switch (s.state) {
    case 'in_sync': return 'the committed manifest is the registered one';
    case 'drift': return `DRIFT — the committed manifest (${shortDigest(s.committed)}) is not the registered one (${shortDigest(s.registered)}): register it`;
    case 'unregistered': return 'UNREGISTERED — the committed manifest is not registered yet';
    case 'unreadable': return `UNREADABLE — ${s.reason ?? 'the committed manifest cannot be read'} (nothing is inferred conformant)`;
    default: return s.state;
  }
}
/** A DATE as the day it names (never shifted by the viewer's time zone). */
export function dayText(v: unknown): string { const s = String(v ?? ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s; }
export function shortDigest(d: unknown): string { const s = String(d ?? ''); return s.length > 16 ? `${s.slice(0, 12)}…${s.slice(-4)}` : s; }

/** An evidence item's age and validity as of the read's instant (the server's clock): captured X ago · valid Y more | EXPIRED Y ago. */
export function evidenceAge(e: Pick<EvidenceItem, 'captured_at' | 'valid_until'>, readAt: string): string {
  const now = Date.parse(readAt); const cap = Date.parse(e.captured_at); const until = Date.parse(e.valid_until);
  if (!Number.isFinite(now) || !Number.isFinite(cap) || !Number.isFinite(until)) return 'age unknown';
  const span = (ms: number): string => { const m = Math.round(Math.abs(ms) / 60_000); return m < 120 ? `${m} min` : m < 2880 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`; };
  return `captured ${span(now - cap)} ago · ${until > now ? `valid ${span(until - now)} more` : `EXPIRED ${span(now - until)} ago`}`;
}

/** The evidence form: a JSON list of items (family, kind, ref, digest, bound_head_sha, captured_at, valid_until) — shape only; the server judges. */
export function parseEvidence(text: string): { ok: true; items: Row[] } | { ok: false; reason: string } {
  let v: unknown;
  try { v = JSON.parse(text); } catch { return { ok: false, reason: 'the evidence is not JSON' }; }
  if (!Array.isArray(v) || v.length === 0) return { ok: false, reason: 'the evidence is a non-empty list of items' };
  for (const [i, x] of v.entries()) {
    if (typeof x !== 'object' || x === null) return { ok: false, reason: `item ${i + 1} is not an object` };
    for (const k of ['family', 'kind', 'ref', 'captured_at', 'valid_until']) if (typeof (x as Row)[k] !== 'string') return { ok: false, reason: `item ${i + 1} names no ${k}` };
  }
  return { ok: true, items: v as Row[] };
}

/** Why the attest control is disabled (null when enabled): the server's eligibility, the signer, a missing reason. */
export function attestDisabledReason(p: Preview | null, reason: string): string | null {
  if (p === null) return 'open the preview first';
  if (!p.signer_bound) return 'this deployment binds no signing key — nothing can be signed';
  if (!p.eligibility.can_attest) return p.eligibility.reasons.join('; ');
  if (reason.trim().length < 8) return 'state a reason (8+ characters)';
  return null;
}

/** The check's outcome as a line: the outcome, then each reason in the server's words. */
export function checkLine(r: Row | null): string {
  if (r === null) return 'not checked';
  const reasons = ((r['reasons'] ?? []) as Row[]).map((x) => `${String(x['class'])}: ${String(x['detail'])}`);
  const holds = ((r['holds'] ?? []) as Row[]).map((h) => `held (${String(h['reason_kind'])})`);
  return [String(r['outcome']).toUpperCase(), ...holds, ...reasons].join(' · ');
}

/** A request-sequence guard: a page that loads by selection shows only the LATEST request's answer. */
export function latestOnly(): { next: () => number; isLatest: (n: number) => boolean } {
  let seq = 0;
  return { next: () => ++seq, isLatest: (n: number) => n === seq };
}
