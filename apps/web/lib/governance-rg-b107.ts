/**
 * The registries and traceability client — CP-6 B107 §RG (0115_b107_x_rg; F-P7D-25, F-P7-F-12): the read-only import of the repository's
 * registers, the normative-artifact registry, bidirectional trace (as of an instant), orphans, the lint, deterministic change impact, the
 * inheritance holds, the admission check, the verification record and the fixture registry.
 *
 * Every response is returned VERBATIM. The server decides what is orphaned, stale, held, admissible, current or eligible (the ports re-check
 * every rule); the helpers below only WORD the record and shape it for display — nothing here infers a state the server did not state. The
 * repository's registers stay authoritative and are never written; the admission check is the construction half (production admission is
 * R1); every demonstration persona and record is SYNTHETIC.
 */
import { call, type ApiResult } from './api';

type Row = Record<string, unknown>;
export interface Receipt { policyDecisionId: string; auditSeq: number }
export interface WalkNode {
  depth: number; artifact_id: string; kind: string; key: string; title: string; version: number; lifecycle: string; authority_class: string | null;
  relation: string; via: string; link_id: string; stale: boolean; scope?: string; tenant_id?: string | null; domain_id?: string | null;
}
export interface Walk { direction: 'up' | 'down'; as_of: string; depth: number; count: number; truncated: boolean; nodes: WalkNode[]; back_to_root: Row[] }
export interface Trace { artifact: Row; as_of: string; up: Walk; down: Walk; versions: Row[] }
export interface Impact {
  input: Row[]; depth_limit: number; truncated: boolean; dependents: Array<WalkNode & { depth: number }>; counts: Record<string, number>; stale_verifications: Row[];
  release_candidates: Row[]; decision_active: Row[]; requirements_to_reverify: Row[]; digest: string; held?: Row[]; impact_id?: string; trigger?: string;
}
export interface OrphanRule { rule_id: string; kind: string; relation: string; side: string; description: string; basis: string; count: number; orphans: Row[] }
export interface Overview {
  database_identity: Row; today: string; sources: Row[]; reconciliation: Array<{ source_path: string; current_digest: string | null; imported_digest: string | null; imported_at: string | null; state: string }>;
  counts: Array<{ kind: string; lifecycle: string; n: number }>; orphans: { total: number; rules: OrphanRule[] }; lint: Row; holds: Row[]; impacts: Row[]; verification: Row[]; fixtures: Row[];
  engineering_exceptions: Row[]; requirement_snapshot: Row; ledger: Row[]; read_at: string; build: Row; boundary: string; receipt: Receipt;
}
export type ArtifactRef = { artifactId: string } | { kind: string; key: string };

const PLATFORM = (action: string, objectType: string, objectId: string | null = null) => ({
  scope: 'PLATFORM' as const, purpose_id: 'governance', action, object_type: objectType, object_id: objectId,
  side_effect_class: action === 'governance.read' ? 'none' as const : 'reversible' as const,
});
const B = '/v1/governance/registries';

export const rg = {
  overview: (): Promise<ApiResult<Overview>> => call(`${B}/read`, PLATFORM('governance.read', 'GRG')),
  importRegisters: (sources: string[] = []): Promise<ApiResult<{ imported: Row[]; impacts: Row[] }>> => call(`${B}/import`, PLATFORM('governance.registry.import', 'RGI'), { sources }),
  search: (q: string, kind: string | null = null): Promise<ApiResult<{ artifacts: Row[]; receipt: Receipt }>> => call(`${B}/artifacts/search`, PLATFORM('governance.read', 'ART'), { q, ...(kind === null ? {} : { kind }) }),
  resolve: (kind: string, key: string, asOf: string | null = null): Promise<ApiResult<{ resolution: Row; receipt: Receipt }>> =>
    call(`${B}/artifacts/resolve`, PLATFORM('governance.read', 'ART'), { kind, key, ...(asOf === null ? {} : { asOf }) }),
  trace: (ref: ArtifactRef, depth = 4, asOf: string | null = null): Promise<ApiResult<{ trace: Trace; receipt: Receipt }>> =>
    call(`${B}/trace`, PLATFORM('governance.read', 'ART'), { ...ref, depth, ...(asOf === null ? {} : { asOf }) }),
  orphans: (rule: string | null, limit = 50, offset = 0): Promise<ApiResult<{ orphans: { total: number; rules: OrphanRule[] }; receipt: Receipt }>> =>
    call(`${B}/orphans`, PLATFORM('governance.read', 'ART'), { ...(rule === null ? {} : { rule }), limit, offset }),
  lint: (): Promise<ApiResult<{ lint: Row; receipt: Receipt }>> => call(`${B}/lint`, PLATFORM('governance.read', 'ART'), {}),
  impactPreview: (changes: Array<ArtifactRef & { proposedDigest?: string }>, depth = 8): Promise<ApiResult<{ impact: Impact; receipt: Receipt }>> =>
    call(`${B}/impact/preview`, PLATFORM('governance.read', 'IMP'), { changes, depth }),
  impactRecord: (changes: Array<ArtifactRef & { proposedDigest?: string }>, expectedDigest: string, trigger: 'change' | 'proposal', depth = 8): Promise<ApiResult<{ impact: Impact }>> =>
    call(`${B}/impact/record`, PLATFORM('governance.impact.record', 'IMP'), { changes, expectedDigest, trigger, depth }),
  inheritance: (ref: ArtifactRef): Promise<ApiResult<{ inheritance: Row; receipt: Receipt }>> => call(`${B}/inheritance/read`, PLATFORM('governance.read', 'ART'), ref),
  reconcile: (refs: ArtifactRef[]): Promise<ApiResult<{ reconciliation: { results: Row[] }; receipt: Receipt }>> => call(`${B}/inheritance/reconcile`, PLATFORM('governance.trace.check', 'ART'), { artifacts: refs }),
  admission: (ref: ArtifactRef): Promise<ApiResult<{ admission: Row; receipt: Receipt }>> => call(`${B}/admission/check`, PLATFORM('governance.read', 'ART'), ref),
  verification: (recordId: string): Promise<ApiResult<{ record: Row | null; cases: Row[]; receipt: Receipt }>> => call(`${B}/verification/${recordId}/read`, PLATFORM('governance.read', 'VER', recordId)),
  review: (recordId: string, p: { decision: 'accepted' | 'rejected'; digest: string; reason: string }): Promise<ApiResult<{ review: Row; receipt: Receipt }>> =>
    call(`${B}/verification/${recordId}/review`, PLATFORM('governance.verification.review', 'VER', recordId), p),
  approveFixture: (fixtureId: string, p: { version: number; digest: string; reason: string }): Promise<ApiResult<{ fixture: Row; receipt: Receipt }>> =>
    call(`${B}/fixtures/${fixtureId}/approve`, PLATFORM('governance.fixture.approve', 'FIX', fixtureId), p),
  quarantineFixture: (fixtureId: string, p: { reasonClass: string; reason: string }): Promise<ApiResult<{ fixture: Row; receipt: Receipt }>> =>
    call(`${B}/fixtures/${fixtureId}/quarantine`, PLATFORM('governance.fixture.quarantine', 'FIX', fixtureId), p),
  sweepFixtures: (): Promise<ApiResult<{ expired: number; quarantined: Row[] }>> => call(`${B}/fixtures/sweep`, PLATFORM('governance.fixture.quarantine', 'FIX'), {}),
};

// ── wording (never judging) ────────────────────────────────────────────────────────────
/** A DATE is the day it names (never shifted by a time zone). */
export function dayText(v: unknown): string { const s = String(v ?? ''); return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : s; }
/** Digests are shortened for reading, never altered; the exact digest goes with every act. */
export function shortDigest(d: unknown): string { const s = String(d ?? ''); return s.length > 16 ? `${s.slice(0, 12)}…${s.slice(-4)}` : s; }
/** Only the newest answer to a selection is applied — a stale response never shows another artifact's trace or impact. */
export function latestOnly(): { next: () => number; isLatest: (n: number) => boolean } {
  let seq = 0;
  return { next: () => ++seq, isLatest: (n: number) => n === seq };
}

const SOURCE_STATE: Record<string, string> = {
  in_sync: 'IN SYNC — the last import holds the repository\'s current bytes',
  drifted: 'DRIFTED — the repository changed since the last import; import again to reconcile',
  never_imported: 'NEVER IMPORTED — nothing in the registry comes from this source yet',
  source_unreadable: 'UNREADABLE — the source could not be read; nothing is inferred from it',
};
export function sourceStateText(state: string): string { return SOURCE_STATE[state] ?? state; }

const LIFECYCLE: Record<string, string> = {
  proposed: 'PROPOSED — not in force', active: 'ACTIVE', deprecated: 'DEPRECATED — in force, being replaced', retired: 'RETIRED — kept, resolvable, no longer in force',
  superseded: 'SUPERSEDED — kept, resolvable, replaced', quarantined: 'QUARANTINED — no evidence may use it',
};
export function lifecycleText(l: unknown): string { return LIFECYCLE[String(l)] ?? String(l); }

export function holdText(h: Row): string {
  const reason = String(h['reason'] ?? '');
  if (h['lifted_at'] !== null && h['lifted_at'] !== undefined) return `LIFTED ${String(h['lifted_at'])} — ${String(h['lift_reason'] ?? '')}`;
  return `HELD (${String(h['reason_kind'])}) — ${reason}`;
}

/** A verification record's standing as the server stated it: expired / invalidated / result / reviewed. */
export function verificationText(r: Row): string {
  const parts: string[] = [];
  parts.push(String(r['result'] ?? 'unstated').toUpperCase());
  if (r['invalidated'] === true) parts.push('INVALIDATED — its fixture was quarantined; re-run the tests');
  if (r['expired'] === true) parts.push(`EXPIRED on ${String(r['valid_until'])}`);
  const reviews = Array.isArray(r['reviews']) ? (r['reviews'] as Row[]) : [];
  parts.push(reviews.length === 0 ? 'not reviewed' : `reviewed: ${reviews.map((v) => `${String(v['decision'])} by ${String(v['reviewer'] ?? 'a reviewer')}`).join('; ')}`);
  parts.push(`claim: ${String(r['claim'] ?? '')}`);
  return parts.join(' · ');
}

export function exceptionText(e: Row): string {
  const exp = dayText(e['expiry_date']);
  if (e['expired'] === true) return `EXPIRED on ${exp} (status ${String(e['status'])}) — reported, not closed: renewing or closing it is the owner's`;
  return `${String(e['status'])} · expires ${exp}`;
}

/** The trace as a tree: each node under the node it was reached through (the server's `via`); roots are the walk's first level. */
export interface TreeNode { node: WalkNode; children: TreeNode[] }
export function buildTree(nodes: WalkNode[], rootId: string): TreeNode[] {
  const byVia = new Map<string, WalkNode[]>();
  for (const n of nodes) { const l = byVia.get(n.via) ?? []; l.push(n); byVia.set(n.via, l); }
  const grow = (id: string, seen: Set<string>): TreeNode[] => (byVia.get(id) ?? [])
    .filter((n) => !seen.has(n.artifact_id))
    .map((n) => ({ node: n, children: grow(n.artifact_id, new Set([...seen, n.artifact_id])) }));
  return grow(rootId, new Set([rootId]));
}

/** The impact's dependents grouped by kind, in the server's order (depth, kind, key). */
export function impactGroups(impact: Pick<Impact, 'dependents'>): Array<{ kind: string; items: WalkNode[] }> {
  const out: Array<{ kind: string; items: WalkNode[] }> = [];
  for (const d of impact.dependents) {
    const g = out.find((x) => x.kind === d.kind);
    if (g === undefined) out.push({ kind: d.kind, items: [d] }); else g.items.push(d);
  }
  return out;
}
/** What recording the impact will do, in words (the consequence preview). A proposal holds nothing. */
export function impactConsequence(impact: Pick<Impact, 'release_candidates' | 'stale_verifications' | 'digest'>, trigger: 'change' | 'proposal'): string[] {
  const rcs = impact.release_candidates.map((r) => String(r['key']));
  return [
    `Records the impact ${shortDigest(impact.digest)} exactly as shown; if the links moved since, the server refuses it (stale).`,
    trigger === 'proposal' ? 'A PROPOSAL: nothing is held; the analysis is kept as evidence for the change proposal.'
      : rcs.length === 0 ? 'A CHANGE: no release candidate depends on it — nothing is held.'
        : `A CHANGE: HOLDS ${rcs.join(', ')} (evidence_stale) until the ${impact.stale_verifications.filter((s) => s['kind'] === 'test').length} stale test(s) are re-run and current.`,
  ];
}

/** Can the signed-in person act? Eligibility as far as the client can tell — the PORT decides (never the ingester or a builder, never an agent). */
export function reviewEligibility(record: Row, me: { principalId: string; roles: string[] }): { eligible: boolean; reason: string } {
  if (!me.roles.includes('independent_assurance@PLATFORM')) return { eligible: false, reason: 'the review is independent assurance\'s (PLATFORM)' };
  if (record['ingested_by'] === me.principalId) return { eligible: false, reason: 'you ingested this record — the review is never the ingester\'s' };
  const runner = (record['execution'] as Row | undefined)?.['runner_principal'];
  if (runner === me.principalId) return { eligible: false, reason: 'you ran this record — the review is never the runner\'s' };
  return { eligible: true, reason: 'eligible as far as the page can tell — the server re-checks' };
}
export function fixtureEligibility(fixture: Row, me: { principalId: string; roles: string[] }): { eligible: boolean; reason: string } {
  if (fixture['lifecycle'] !== 'proposed') return { eligible: false, reason: `the fixture is ${String(fixture['lifecycle'])}; only a proposed version is approved` };
  if (fixture['expired'] === true) return { eligible: false, reason: 'the fixture expired; rebuild it first' };
  if (!me.roles.includes('independent_assurance@PLATFORM')) return { eligible: false, reason: 'approval is independent assurance\'s (PLATFORM)' };
  const builders = [...((fixture['attributes'] as Row | undefined)?.['builders'] as string[] | undefined ?? []),
    ...((fixture['decisions'] as Row[] | undefined) ?? []).filter((d) => d['decision'] === 'registered' || d['decision'] === 'rebuilt').map((d) => String(d['actor_id'] ?? ''))];
  if (builders.includes(me.principalId)) return { eligible: false, reason: 'you built this fixture — approval is never a builder\'s' };
  return { eligible: true, reason: 'eligible as far as the page can tell — the server re-checks' };
}
