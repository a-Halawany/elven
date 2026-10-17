/**
 * The design-governance client — CP-6 B107 §DG (0115_b107_x_dg; F-P7-E-17: UX-01/02/03/08/72, UX-ADR-001/002/023/024, REL-01/02/23/24): the
 * design baseline under the Design System Authority, design assets and their owners, principles and the lint, narrow expiring exceptions,
 * the contribution queue, the design trace, design acceptance records, experience learning (B92 design_change_proposal actions), B92's
 * telemetry governance as evidence, and the independent conformance package (UNSIGNED — R2).
 *
 * Every response is returned VERBATIM. The helpers below only WORD the record — the server decides the state, the blockers and who may act
 * (the ports re-check every rule). Nothing here shows a design conformant, accepted or healthy by inference: the conformance state is
 * `withheld` (with reasons) or `no blocking finding`, which is said NOT to be conformance. Every persona and record on a demonstration is
 * SYNTHETIC; real acceptance by named independent authorities is R2 / H3 and never claimed. The loop-stage header's logic (UX-02) is here:
 * the general context bar stays B80's.
 */
import { call, type ApiResult } from './api';

type Row = Record<string, unknown>;
export interface Receipt { policyDecisionId: string; auditSeq: number }
export interface Blocker { class: string; reason: string; key?: string }
export interface Workspace {
  authority: { role: string; holders: Array<{ principal_id: string; name: string | null; kind: string }>; product_meaning: string };
  conformance: { state: 'withheld' | 'no_blocking_finding' | string; reasons: Blocker[]; baseline: Row | null; latest_lint: Row | null; note: string; as_of: string };
  baselines: Row[]; assets: Row[]; principles: Row[]; evaluations: Row[]; exceptions: Row[]; contributions: Row[];
  orphans: { assets_without_requirement: Row[]; assets_without_owner: Row[]; requirements_without_design: Row[]; contradictions: Row[] };
  ledger: Row[]; read_at: string; boundary: string; receipt: Receipt;
}
export interface Preview { subject: Row; digest: string; consequence: string[]; blockers?: Blocker[]; eligibility: string[]; boundary: string; receipt: Receipt }
export interface DomainRead {
  baseline: Row | null; acceptances: Array<Row & { attest: Array<{ obligation: string; role: string; attested: boolean; eligibility: string[] }> }>; intakes: Row[]; pending_actions: Row[];
  packages: Row[]; telemetry: Row; accessibility: Row; read_at: string; boundary: string; receipt: Receipt;
}

const PLATFORM = { scope: 'PLATFORM' as const, purpose_id: 'governance' };
const P = (action: string, objectType: string, objectId: string | null = null) => ({ ...PLATFORM, action, object_type: objectType, object_id: objectId,
  side_effect_class: action.endsWith('.read') ? 'none' as const : 'reversible' as const });
const D = (t: string, d: string, action: string, objectType: string, objectId: string | null = null) => ({ scope: 'DOMAIN' as const, tenant_id: t, domain_id: d, purpose_id: 'governance',
  action, object_type: objectType, object_id: objectId, side_effect_class: action.endsWith('.read') ? 'none' as const : 'reversible' as const });
const base = '/v1/governance/design';
const dbase = (t: string, d: string) => `/v1/tenants/${t}/domains/${d}/governance/design`;
type R<T> = Promise<ApiResult<T & { receipt: Receipt }>>;

export const dg = {
  workspace: (): Promise<ApiResult<Workspace>> => call(`${base}/read`, P('governance.read', 'DSB')),
  trace: (p: { artifactId?: string; query?: string; depth?: number }): R<{ root?: Row; trace: Row | null; matches?: Row[] }> => call(`${base}/trace/read`, P('governance.read', 'TRC', p.artifactId ?? null), p),
  compare: (baselineId: string, from: number, to: number): R<{ comparison: Row }> => call(`${base}/baselines/${baselineId}/compare`, P('governance.read', 'DSB', baselineId), { from, to }),
  preview: (what: 'baseline' | 'contribution' | 'exception' | 'asset', id: string, version?: number): Promise<ApiResult<Preview>> =>
    call(`${base}/preview/${what}/${id}`, P('governance.read', 'DSB', id), version === undefined ? {} : { version }),
  proposeBaseline: (p: { baselineId?: string; expectedVersion: number; title: string; designSystemVersion: string; scope: Record<string, string[]>; members: string[] }): R<{ baseline: Row }> =>
    call(`${base}/baselines/propose`, P('governance.design.baseline.propose', 'DSB', p.baselineId ?? null), p),
  decideBaseline: (id: string, p: { version: number; decision: 'attest' | 'reject'; digest: string; reason: string }): R<{ baseline: Row }> =>
    call(`${base}/baselines/${id}/decide`, P('governance.design.baseline.decide', 'DSB', id), p),
  registerInventory: (): R<{ inventory: Row }> => call(`${base}/assets/register`, P('governance.design.asset.register', 'DSA')),
  approveAsset: (id: string, p: { version: number; ownerPrincipalId: string; digest: string; reason: string }): R<{ asset: Row }> =>
    call(`${base}/assets/${id}/approve`, P('governance.design.asset.approve', 'DSA', id), p),
  runLint: (): R<{ evaluation: Row }> => call(`${base}/evaluations/lint`, P('governance.design.evaluate', 'DSE')),
  requestException: (p: { principle: string; assetId: string; reason: string; compensating: string; expiresAt: string; renews?: string | null }): R<{ exception: Row }> =>
    call(`${base}/exceptions/request`, P('governance.design.exception.request', 'DSX'), p),
  decideException: (id: string, p: { decision: 'approve' | 'reject'; digest: string; reason: string }): R<{ exception: Row }> =>
    call(`${base}/exceptions/${id}/decide`, P('governance.design.exception.decide', 'DSX', id), p),
  propose: (p: { kind: string; targetAssetId?: string | null; proposal: Row; summary: string; plans: Row; constitutional?: boolean }): R<{ contribution: Row }> =>
    call(`${base}/contributions/propose`, P('governance.design.contribution.propose', 'DSC'), p),
  amend: (id: string, p: { revision: number; targetAssetId?: string | null; proposal: Row; summary: string; plans: Row }): R<{ contribution: Row }> =>
    call(`${base}/contributions/${id}/amend`, P('governance.design.contribution.amend', 'DSC', id), p),
  step: (id: string, step: string, p: { revision: number; digest?: string; reason: string; evidence?: Row }): R<{ contribution: Row }> =>
    call(`${base}/contributions/${id}/${step}`, P(`governance.design.contribution.${step}`, 'DSC', id), p),
  link: (p: { from?: string; to?: string; relation?: string; retire?: string }): R<{ link: Row }> => call(`${base}/links/record`, P('governance.design.link.record', 'TRC'), p),
  domain: (t: string, d: string): Promise<ApiResult<DomainRead>> => call(`${dbase(t, d)}/read`, D(t, d, 'governance.read', 'DAC')),
  intake: (t: string, d: string, actionId?: string): R<{ intake: Row }> => call(`${dbase(t, d)}/intake`, D(t, d, 'governance.design.intake', 'DSC', actionId ?? null), actionId === undefined ? {} : { actionId }),
  attest: (t: string, d: string, id: string, p: { version: number; obligation: string; digest: string; reason: string }): R<{ acceptance: Row }> =>
    call(`${dbase(t, d)}/acceptances/${id}/attest`, D(t, d, 'governance.design.acceptance.attest', 'DAC', id), p),
  generatePackage: (t: string, d: string, p: { target: 'UX-70-006' | 'UX-66-006'; acceptanceId?: string | null }): R<{ package: Row }> =>
    call(`${dbase(t, d)}/packages/generate`, D(t, d, 'governance.design.package.generate', 'DCP'), p),
  readPackage: (t: string, d: string, id: string): R<{ package: Row }> => call(`${dbase(t, d)}/packages/${id}/read`, D(t, d, 'governance.read', 'DCP', id)),
};

// ── wording (never judging) ──────────────────────────────────────────────────────────────────────
/** The design system's conformance state: never "conformant" — at best "no blocking finding", which the page says is not conformance. */
export function conformanceText(c: Pick<Workspace['conformance'], 'state' | 'reasons'>): string {
  if (c.state === 'withheld') return `⊘ CONFORMANCE WITHHELD — ${c.reasons.length} reason${c.reasons.length === 1 ? '' : 's'}`;
  if (c.state === 'no_blocking_finding') return '◇ NO BLOCKING FINDING — this is not conformance: conformance is accepted only by a design acceptance record, per scope';
  return String(c.state).toUpperCase();
}
/** A baseline version's standing: a PROPOSAL is never worded like an attestation. */
export function baselineStateText(b: Row): string {
  switch (b['state']) {
    case 'proposed': return ((b['blockers'] ?? []) as unknown[]).length > 0 ? 'PROPOSED — HELD: it cannot be attested until every member resolves to an approved owner' : 'PROPOSED — not in force; awaits the Design System Authority';
    case 'attested': return `ATTESTED and SIGNED — the controlling design baseline${b['decided_at'] !== null && b['decided_at'] !== undefined ? ` since ${String(b['decided_at'])}` : ''}`;
    case 'superseded': return 'SUPERSEDED — kept, signed, no longer in force';
    case 'rejected': return 'REJECTED — the baseline in force is unchanged';
    default: return String(b['state']);
  }
}
const STAGE_TEXT: Record<string, string> = {
  proposed: 'PROPOSED — a proposal, not a change; nothing is changed until a human accepts and publishes it',
  held: 'HELD — preserved with its reasons; it moves only when they are resolved',
  in_review: 'IN REVIEW — reviewed; awaits the authority\'s acceptance',
  accepted: 'ACCEPTED and SIGNED — not yet published',
  published: 'PUBLISHED — the next version is approved; adoption is recorded next',
  adopted: 'ADOPTED — consumers moved to the published version',
  measured: 'MEASURED — evidence recorded (telemetry informs; it never changes a pattern)',
  deprecated: 'DEPRECATED — consumers are migrated before retirement',
  migrating: 'MIGRATING — consumers moving off the deprecated version',
  retired: 'RETIRED — no consumer stranded',
  rejected: 'REJECTED — the prior baseline and consumers untouched',
  closed: 'CLOSED',
};
export function stageText(stage: unknown): string { return STAGE_TEXT[String(stage)] ?? String(stage); }
/** A design exception's standing on the read's clock: an approved exception past its expiry is EXPIRED (it covers nothing). */
export function exceptionStateText(x: Row, readAt: string): string {
  if (x['state'] === 'approved') {
    return Date.parse(String(x['expires_at'])) <= Date.parse(readAt) ? `EXPIRED at ${String(x['expires_at'])} — covers nothing; the finding is open again` : `APPROVED and SIGNED — narrow, until ${String(x['expires_at'])}`;
  }
  if (x['state'] === 'requested') return 'REQUESTED — not in force; awaits the Design System Authority (never the asset\'s owner)';
  return String(x['state']).toUpperCase();
}
export function assetOwnerText(a: Row): string {
  if (a['owner_principal_id'] === null || a['owner_principal_id'] === undefined) return '⊘ NO ACCOUNTABLE OWNER — an ownership gap (REL-01)';
  return `${String(a['owner_name'] ?? a['owner_principal_id'])} · ${String(a['status']).toUpperCase()}`;
}
export function acceptanceStateText(r: Row): string {
  switch (r['state']) {
    case 'proposed': return `PROPOSED — ${((r['attestations'] ?? []) as unknown[]).length} of ${((r['obligations'] ?? []) as unknown[]).length} obligations attested; NOT accepted`;
    case 'accepted': return `ACCEPTED for this exact tuple only (claim: ${String(r['claim'])}) — valid until ${String(r['valid_until'])}`;
    case 'withheld': return `WITHHELD — ${String(r['withheld_reason'] ?? '')} (what was accepted is kept; only a new version over renewed evidence accepts again)`;
    case 'superseded': return 'SUPERSEDED by a later version';
    default: return String(r['state']).toUpperCase();
  }
}
/** A DATE is the day it names; an instant is kept as the server wrote it. */
export function dayText(v: unknown): string { const s = String(v ?? ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s; }
export function shortDigest(d: unknown): string { const s = String(d ?? ''); return s.length > 16 ? `${s.slice(0, 12)}…${s.slice(-4)}` : s; }
/** An evidence item's age in words. */
export function ageText(ageDays: unknown): string {
  if (typeof ageDays !== 'number') return 'age unknown';
  return ageDays < 1 ? `${Math.round(ageDays * 24)} h old` : `${ageDays} d old`;
}
/** The end of the day a date names, as the instant an expiry is recorded at (UTC) — the request names the day the user chose. */
export function endOfDay(date: string): string | null { return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T23:59:59.000Z` : null; }
/** Only the newest answer of a selection-driven read is applied (a stale response never shows another subject's digest). */
export function latestOnly(): { next: () => number; isLatest: (n: number) => boolean } { let seq = 0; return { next: () => ++seq, isLatest: (n: number) => n === seq }; }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isId = (v: string): boolean => UUID.test(v.trim());

// ── the loop-stage header (UX-02; on B107's own pages — the general context bar is B80's) ─────────────
export const LOOP_STAGES = ['Observe', 'Understand', 'Predict', 'Simulate', 'Decide', 'Learn'] as const;
export type LoopStage = (typeof LOOP_STAGES)[number];
export interface LoopInput { stage: LoopStage; upstream: Array<{ label: string; present: boolean }>; next: { label: string; gate: string | null }; from: string | null }
export interface LoopHeader { stages: Array<{ stage: LoopStage; current: boolean }>; broken: string[]; next: { label: string; allowed: boolean; reason: string | null }; returnPath: string | null }
/** The header's model: the current stage among the six, the upstream evidence a handoff needs (a missing one is a BROKEN handoff, shown),
 *  the next governed action — never offered past a required gate or a broken handoff (UX-02-004/-005) — and a deterministic return path
 *  (an internal path only). */
export function loopHeader(i: LoopInput): LoopHeader {
  const broken = i.upstream.filter((u) => !u.present).map((u) => u.label);
  const reason = broken.length > 0 ? `the handoff is broken: ${broken.join(', ')} — the last coherent loop state is kept` : i.next.gate;
  return { stages: LOOP_STAGES.map((s) => ({ stage: s, current: s === i.stage })), broken, next: { label: i.next.label, allowed: reason === null, reason }, returnPath: safeReturn(i.from) };
}
/** A return path is an internal path ("/…", never "//…" or a URL) — anything else is dropped. */
export function safeReturn(from: string | null): string | null {
  if (from === null) return null;
  const f = from.trim();
  return /^\/(?!\/)[A-Za-z0-9/_\-.?=&%]*$/.test(f) ? f : null;
}
