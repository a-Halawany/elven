/**
 * B80 §CB — THE OPERATING CONTEXT MODEL (F-P7-E-01: UX-10-001…005, CMP-010, PAT-02, UX-ADR-003, REL-03). Pure: no React, no fetch — the
 * component contract of the GlobalContextBar and the ContextSwitchDialog as functions (vitest, node), the rendering proven by the walk.
 *
 *   the DIMENSIONS     tenant, domain, role, objective, horizon, scenario, classification ceiling, effective time, policy — each explicit, each
 *                      in a STATE: set · default (no context set: the stated default) · unresolved (reconciled on read: the context names a
 *                      subject no longer live — never shown as current) · not_applied (a page that cannot honour the effective time says so)
 *   the DIFF           the dimensions a proposed switch changes, before any preview arrives (the server's preview is the authority)
 *   the REGISTRY       the CLIENT-held previews, pending commands, queries and selections, each BOUND to the context digest it was made
 *                      under: a switch INVALIDATES every preview and command bound to another digest (they cannot be kept — their consequence
 *                      was computed under the old context) and lets the person KEEP or DISCARD a query or a selection explicitly
 *   the STATE          CMP-010's states (loading, ready, degraded, unavailable, error, platform) and the freeze of consequential commands
 *                      while the scope is unresolved, stale or unreadable (UX-10-005: retain the last valid scope, deny cross-boundary effects)
 *   the CHANNEL        a commit published to the page's other consumers (the home re-reads its sections under the new context)
 *
 * A context switch is PRESENTATION: it never alters an approval (approvals bind version digests — the server lists them unaffected), never
 * re-scopes work, never discards a draft. Nothing here is optimistic: the bar shows what the server answered.
 */
import type { ContextDimensions, EffectiveTimeSupport, WorkspaceKey } from './b80-seams';

type Row = Record<string, unknown>;

export const HORIZONS = ['30d', '90d', '12m', '36m'] as const;
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export const DEFAULT_HORIZON = '90d';

/* ───────────── the server's answers (0118 §CB) ───────────── */
export interface ContextSubject { id: string; title: string | null; status: string; stale: boolean }
export interface ContextChoice { id: string; title: string; status?: string; state?: string; owner?: string; stale: boolean }
export interface BarRead {
  as_of: string; tenant_id: string; domain_id: string; principal_id: string;
  current: null | { context_id: string; version: number; digest: string; set_at: string; objective: ContextSubject | null; horizon: string; scenario: ContextSubject | null;
                    classification: string; effective_at: string | null };
  version: number;
  unresolved: Array<{ dimension: 'objective' | 'scenario'; id: string; status: string; reason: string | null }>;
  may_set: boolean;
  choices: { objectives: ContextChoice[]; scenarios: ContextChoice[]; horizons: string[]; classifications: string[]; as_of: string };
  policy?: { bundle: string };
}
export interface AffectedList { count: number; items: Row[] }
export interface ImpactRead {
  as_of: string;
  basis: null | { context_id: string; digest: string; set_at: string };
  current: { objective_id: string | null; horizon: string; scenario_id: string | null; classification: string | null; effective_at: string | null; digest: string | null; set: boolean };
  proposed: { objective: ContextSubject | null; objective_id: string | null; horizon: string; scenario: ContextSubject | null; scenario_id: string | null; classification: string; effective_at: string | null; digest: string };
  changed: Array<{ dimension: string; from?: unknown; to?: unknown; from_id?: string | null; to_id?: string | null }>;
  unchanged: boolean; stale: Array<{ dimension: string; id: string; reason: string }>; committable: boolean;
  affected: { drafts: AffectedList; tasks: AffectedList; requests: AffectedList; workspaces: AffectedList; rooms: AffectedList; home: { sections: string[]; effect: string } };
  approvals: AffectedList & { effect: 'unaffected' };
  previews: { held_by: 'client'; effect: string; note: string };
  limit: number;
  impact_digest: string;
}
export interface ProposedContext { objectiveId: string | null; horizon: string; scenarioId: string | null; classification: string; effectiveAt: string | null }

/* ───────────── the dimensions ───────────── */
/** The seam's dimensions from the bar's read (b80-seams ContextDimensions): the shell passes them to every page through ShellBase.context. */
export function dimensionsOf(bar: BarRead, roles: string[]): ContextDimensions {
  const c = bar.current;
  return {
    tenantId: bar.tenant_id, domainId: bar.domain_id, roles: [...roles],
    objective: c?.objective ? { id: c.objective.id, title: c.objective.title ?? c.objective.id } : null,
    horizon: c?.horizon ?? null,
    scenario: c?.scenario ? { id: c.scenario.id, title: c.scenario.title ?? c.scenario.id } : null,
    classification: c?.classification ?? null,
    effectiveAt: c?.effective_at ?? null,
    policyVersion: bar.policy?.bundle ?? null,
    version: c?.version ?? (bar.version > 0 ? bar.version : null),
  };
}
/** The key a client-held preview binds to: the server's context digest, or the domain's stated default when none was set. */
export function contextKeyOf(bar: Pick<BarRead, 'tenant_id' | 'domain_id' | 'current'>): string {
  return bar.current?.digest ?? `default:${bar.tenant_id}:${bar.domain_id}`;
}

export type DimensionKey = 'scope' | 'tenant' | 'domain' | 'role' | 'objective' | 'horizon' | 'scenario' | 'classification' | 'effective_time' | 'policy' | 'deployment' | 'version';
export type DimensionState = 'set' | 'default' | 'unresolved' | 'not_applied';
export interface DimensionLine { key: DimensionKey; label: string; value: string; state: DimensionState; note?: string }

/** REL-03: the dimensions MATERIAL to a workspace — the PLATFORM workspace has no tenant/domain context; every DOMAIN workspace has all. */
export function materialDimensions(workspace: WorkspaceKey): DimensionKey[] {
  if (workspace === 'admin') return ['scope', 'deployment', 'role', 'policy'];
  return ['tenant', 'domain', 'role', 'objective', 'horizon', 'scenario', 'classification', 'effective_time', 'policy'];
}

const short = (id: string) => `${id.slice(0, 8)}…`;
/** An instant in words, in UTC and named so (never a bare local string — the zone is explicit). */
export function instantWords(iso: string | null): string {
  if (iso === null) return 'live (now)';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, 'Z')} (UTC)`;
}

/**
 * THE BAR's lines, in order (UX-10-001: active scope first), each with its state. An unresolved dimension says so and names the server's
 * reason; the effective time on a page that cannot honour it is DECLARED not applied (Q11) — never silently ignored.
 */
export function dimensionLines(input: { workspace: WorkspaceKey; bar: BarRead | null; roles: string[]; deployment?: string; effectiveTime?: EffectiveTimeSupport }): DimensionLine[] {
  const { workspace, bar, roles } = input;
  const roleLine: DimensionLine = { key: 'role', label: roles.length > 1 ? 'Roles' : 'Role', value: roles.length === 0 ? 'no role binding' : roles.join(' · '), state: 'set' };
  if (workspace === 'admin' || bar === null) {
    if (workspace !== 'admin') return [roleLine];
    return [{ key: 'scope', label: 'Scope', value: 'PLATFORM — no tenant or domain context', state: 'set' },
            { key: 'deployment', label: 'Deployment', value: input.deployment ?? 'local-dev', state: 'set' }, roleLine];
  }
  const c = bar.current;
  const unresolved = (k: 'objective' | 'scenario') => bar.unresolved.find((u) => u.dimension === k) ?? null;
  const subjectLine = (k: 'objective' | 'scenario', label: string, s: ContextSubject | null, none: string): DimensionLine => {
    const u = unresolved(k);
    if (u !== null) return { key: k, label, value: `${s?.title ?? short(u.id)} — UNRESOLVED (${u.status})`, state: 'unresolved', note: u.reason ?? `the ${k} is no longer live; it is not applied` };
    if (c === null) return { key: k, label, value: none, state: 'default' };
    return { key: k, label, value: s === null ? none : (s.title ?? short(s.id)), state: 'set' };
  };
  const eff: DimensionLine = input.effectiveTime === 'live_only'
    ? { key: 'effective_time', label: 'Effective time', value: c?.effective_at ? `${instantWords(c.effective_at)} — not applied on this page (live)` : 'live (now)', state: c?.effective_at ? 'not_applied' : (c === null ? 'default' : 'set'),
        ...(c?.effective_at ? { note: 'this page reads live data only; the effective time is not applied here' } : {}) }
    : { key: 'effective_time', label: 'Effective time', value: instantWords(c?.effective_at ?? null), state: c === null ? 'default' : 'set' };
  return [
    { key: 'tenant', label: 'Tenant', value: short(bar.tenant_id), state: 'set' },
    { key: 'domain', label: 'Domain', value: short(bar.domain_id), state: 'set' },
    roleLine,
    subjectLine('objective', 'Objective', c?.objective ?? null, 'the whole domain'),
    { key: 'horizon', label: 'Horizon', value: c?.horizon ?? DEFAULT_HORIZON, state: c === null ? 'default' : 'set' },
    subjectLine('scenario', 'Scenario', c?.scenario ?? null, 'no scenario'),
    { key: 'classification', label: 'Classification ceiling', value: c?.classification ?? 'your own clearance', state: c === null ? 'default' : 'set' },
    eff,
    { key: 'policy', label: 'Policy', value: bar.policy?.bundle ?? 'unknown', state: bar.policy ? 'set' : 'unresolved' },
    { key: 'version', label: 'Context', value: c === null ? 'none set' : `v${c.version} · ${c.digest.slice(0, 12)}…`, state: c === null ? 'default' : 'set' },
  ];
}

/* ───────────── the bar's state (CMP-010) ───────────── */
export type BarState = 'loading' | 'ready' | 'degraded' | 'unavailable' | 'error' | 'platform';
export interface BarStatus { state: BarState; message: string | null; consequentialFrozen: boolean; maySwitch: boolean }
/**
 * UX-10-005: when the scope is unavailable, stale, unauthorized or partially loaded the bar RETAINS the last valid context (the caller keeps
 * the previous read), shows the unresolved dimensions, and FREEZES consequential commands (a page asks consequentialAllowed()). A refusal
 * (403) is `unavailable`, not an error: the principal holds no role that reads the context here.
 */
export function barStatus(input: { workspace: WorkspaceKey; bar: BarRead | null; loading: boolean; failure: { status: number; message: string } | null }): BarStatus {
  if (input.workspace === 'admin') return { state: 'platform', message: null, consequentialFrozen: false, maySwitch: false };
  if (input.failure !== null) {
    const unavailable = input.failure.status === 403 || input.failure.status === 404;
    return { state: unavailable ? 'unavailable' : 'error', message: input.failure.message, consequentialFrozen: true, maySwitch: false };
  }
  if (input.loading && input.bar === null) return { state: 'loading', message: null, consequentialFrozen: true, maySwitch: false };
  if (input.bar === null) return { state: 'loading', message: null, consequentialFrozen: true, maySwitch: false };
  if (input.bar.unresolved.length > 0) {
    return { state: 'degraded', message: `${input.bar.unresolved.length} dimension(s) unresolved: ${input.bar.unresolved.map((u) => `${u.dimension} ${u.status}`).join(', ')} — consequential commands that depend on the context are held`,
             consequentialFrozen: true, maySwitch: input.bar.may_set };
  }
  return { state: 'ready', message: null, consequentialFrozen: false, maySwitch: input.bar.may_set };
}
/** A page's consequential command asks this before it runs: never under a frozen, unresolved or unreadable scope. */
export function consequentialAllowed(s: BarStatus): { allowed: boolean; reason: string | null } {
  return s.consequentialFrozen ? { allowed: false, reason: s.message ?? 'the operating context is not resolved; consequential commands are held until it is' } : { allowed: true, reason: null };
}

/* ───────────── the proposed switch ───────────── */
/** The proposal the dialog starts from: the current context, or the stated default. */
export function proposalFrom(bar: BarRead): ProposedContext {
  const c = bar.current;
  return { objectiveId: c?.objective?.id ?? null, horizon: c?.horizon ?? DEFAULT_HORIZON, scenarioId: c?.scenario?.id ?? null, classification: c?.classification ?? 'internal', effectiveAt: c?.effective_at ?? null };
}
/** The dimensions a proposal changes against the bar's current context (the client's own diff; the server's preview is the authority). */
export function diffDimensions(bar: BarRead, p: ProposedContext): string[] {
  const c = bar.current;
  const out: string[] = [];
  if ((c?.objective?.id ?? null) !== p.objectiveId) out.push('objective');
  if ((c?.horizon ?? DEFAULT_HORIZON) !== p.horizon) out.push('horizon');
  if ((c?.scenario?.id ?? null) !== p.scenarioId) out.push('scenario');
  if ((c?.classification ?? null) !== p.classification) out.push('classification');
  if (!sameInstant(c?.effective_at ?? null, p.effectiveAt)) out.push('effective_at');
  return out;
}
const sameInstant = (a: string | null, b: string | null) => (a === null || b === null ? a === b : new Date(a).getTime() === new Date(b).getTime());
/** Two proposals are the same switch (the preview still answers the choice on screen). */
export function sameProposal(a: ProposedContext, b: ProposedContext): boolean {
  return a.objectiveId === b.objectiveId && a.horizon === b.horizon && a.scenarioId === b.scenarioId && a.classification === b.classification && sameInstant(a.effectiveAt, b.effectiveAt);
}
/** The stale choices the dialog offers DISABLED (and says why) — the server refuses them anyway. */
export function staleChoice(bar: BarRead, p: ProposedContext): string | null {
  const o = p.objectiveId === null ? null : bar.choices.objectives.find((x) => x.id === p.objectiveId);
  if (o?.stale === true) return `the objective "${o.title}" is ${o.status ?? 'not active'}; a stale objective cannot be set`;
  const s = p.scenarioId === null ? null : bar.choices.scenarios.find((x) => x.id === p.scenarioId);
  if (s?.stale === true) return `the scenario "${s.title}" is ${s.state ?? 'not active'}; a stale scenario cannot be set`;
  return null;
}
/** A datetime-local value (the person's local wall time) to an instant; blank is live. The page names the zone it reads in. */
export function localToInstant(v: string): string | null {
  if (v.trim() === '') return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** May the person commit what is on screen? Only the previewed choice, unstale, changed, with its digest — the reason when not. */
export function commitGate(input: { preview: ImpactRead | null; previewedFor: ProposedContext | null; onScreen: ProposedContext; maySet: boolean }): { allowed: boolean; reason: string | null } {
  if (!input.maySet) return { allowed: false, reason: 'you hold no role that sets a context in this domain' };
  if (input.preview === null || input.previewedFor === null) return { allowed: false, reason: 'preview the switch first — a context is never switched silently' };
  if (!sameProposal(input.previewedFor, input.onScreen)) return { allowed: false, reason: 'the choice changed since the preview — preview it again' };
  if (input.preview.stale.length > 0) return { allowed: false, reason: input.preview.stale.map((s) => s.reason).join(' · ') };
  if (input.preview.unchanged) return { allowed: false, reason: 'this is the current context; nothing to switch' };
  return { allowed: true, reason: null };
}
/** The commit's payload: exactly what was previewed, its basis and digest, and the client-held previews the switch invalidates. */
export function commitPayload(p: ProposedContext, preview: ImpactRead, invalidated: string[]): Row {
  return { objectiveId: p.objectiveId, horizon: p.horizon, scenarioId: p.scenarioId, classification: p.classification, effectiveAt: p.effectiveAt,
           basisContextId: preview.basis?.context_id ?? null, impactDigest: preview.impact_digest, invalidated };
}

/* ───────────── the preview in words ───────────── */
const subjectWords = (v: unknown, none: string): string => {
  if (v === null || v === undefined) return none;
  if (typeof v === 'object') { const s = v as Partial<ContextSubject>; return `${s.title ?? (s.id ? short(String(s.id)) : none)}${s.stale ? ` (${s.status})` : ''}`; }
  return String(v);
};
/** One line per changed dimension: "objective: Keep the Regensburg line … → the whole domain". */
export function changedLines(preview: ImpactRead): string[] {
  return preview.changed.map((c) => {
    switch (c.dimension) {
      case 'objective': return `objective: ${subjectWords(c.from, 'the whole domain')} → ${subjectWords(c.to, 'the whole domain')}`;
      case 'scenario': return `scenario: ${subjectWords(c.from, 'no scenario')} → ${subjectWords(c.to, 'no scenario')}`;
      case 'effective_at': return `effective time: ${instantWords((c.from as string | null) ?? null)} → ${instantWords((c.to as string | null) ?? null)}`;
      case 'classification': return `classification ceiling: ${c.from ?? 'your own clearance (default)'} → ${String(c.to)}`;
      default: return `${c.dimension}: ${String(c.from ?? 'default')} → ${String(c.to)}`;
    }
  });
}
/** The affected open work in words (each list's count; nothing is re-scoped, nothing discarded). */
export function affectedLines(preview: ImpactRead): Array<{ key: string; label: string; count: number; effect: string }> {
  const a = preview.affected;
  return [
    { key: 'drafts', label: 'your drafts', count: a.drafts.count, effect: 'kept — a draft is yours; discard one explicitly from the drafts list' },
    { key: 'tasks', label: 'your open tasks', count: a.tasks.count, effect: 'kept — still assigned to you; nothing is re-scoped' },
    { key: 'requests', label: 'your routed requests', count: a.requests.count, effect: 'kept — still routed' },
    { key: 'workspaces', label: 'your open workspaces', count: a.workspaces.count, effect: 'kept' },
    { key: 'rooms', label: 'your decision rooms', count: a.rooms.count, effect: 'kept' },
    { key: 'home', label: 'the home and the attention queue', count: a.home.sections.length, effect: a.home.effect },
    { key: 'approvals', label: 'your live approvals', count: preview.approvals.count, effect: 'UNAFFECTED — each binds the version digest it read' },
  ];
}

/* ───────────── the client-preview invalidation registry (UX-10-004) ───────────── */
export type HeldKind = 'preview' | 'command' | 'query' | 'selection';
export interface HeldItem { key: string; label: string; kind: HeldKind; contextKey: string }
export type Disposition = 'keep' | 'discard';
export interface InvalidationPlan { invalidated: HeldItem[]; choosable: HeldItem[]; unaffected: HeldItem[] }
export interface PreviewRegistry {
  register(item: HeldItem): () => void;
  list(): HeldItem[];
  /** What a switch to `nextKey` does: previews / commands bound to another context are INVALIDATED (never kept); queries / selections are the person's choice. */
  plan(nextKey: string): InvalidationPlan;
  /** Applied AFTER the server's receipt (never before — nothing optimistic): returns the keys invalidated or discarded. */
  apply(nextKey: string, choices: Record<string, Disposition>): string[];
  subscribe(fn: () => void): () => void;
  /** Listeners told which of their items were dropped (a page clears its own preview state). */
  onDropped(fn: (keys: string[]) => void): () => void;
}
export function createPreviewRegistry(): PreviewRegistry {
  const items = new Map<string, HeldItem>();
  const subs = new Set<() => void>();
  const dropSubs = new Set<(keys: string[]) => void>();
  const changed = () => { for (const f of subs) f(); };
  return {
    register(item) {
      items.set(item.key, item); changed();
      return () => { if (items.get(item.key) === item) { items.delete(item.key); changed(); } };
    },
    list: () => [...items.values()].sort((a, b) => a.key.localeCompare(b.key)),
    plan(nextKey) {
      const all = [...items.values()].sort((a, b) => a.key.localeCompare(b.key));
      const bound = all.filter((i) => i.contextKey !== nextKey);
      return { invalidated: bound.filter((i) => i.kind === 'preview' || i.kind === 'command'), choosable: bound.filter((i) => i.kind === 'query' || i.kind === 'selection'),
               unaffected: all.filter((i) => i.contextKey === nextKey) };
    },
    apply(nextKey, choices) {
      const p = this.plan(nextKey);
      const dropped = [...p.invalidated.map((i) => i.key), ...p.choosable.filter((i) => (choices[i.key] ?? 'keep') === 'discard').map((i) => i.key)];
      for (const k of dropped) items.delete(k);
      for (const i of p.choosable) if ((choices[i.key] ?? 'keep') === 'keep') items.set(i.key, { ...i, contextKey: nextKey });
      if (dropped.length > 0) for (const f of dropSubs) f(dropped);
      changed();
      return dropped;
    },
    subscribe(fn) { subs.add(fn); return () => { subs.delete(fn); }; },
    onDropped(fn) { dropSubs.add(fn); return () => { dropSubs.delete(fn); }; },
  };
}
/** The page's one registry (a module singleton: one tab, one person). */
export const previewRegistry: PreviewRegistry = createPreviewRegistry();

/* ───────────── the channel (a committed switch, announced to the page's other consumers) ───────────── */
export interface CommittedSwitch { tenantId: string; domainId: string; contextId: string; digest: string; version: number; receipt: { policyDecisionId: string; auditSeq: number } }
export function createContextChannel() {
  const subs = new Set<(c: CommittedSwitch) => void>();
  return {
    publish(c: CommittedSwitch) { for (const f of subs) f(c); },
    subscribe(fn: (c: CommittedSwitch) => void) { subs.add(fn); return () => { subs.delete(fn); }; },
  };
}
export const contextChannel = createContextChannel();

/** A refusal in the server's words (status, code, message) — never "something went wrong". */
export function refusalWords(r: { status: number; error?: { code: string; message: string } }, fallback: string): string {
  return `HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
}
