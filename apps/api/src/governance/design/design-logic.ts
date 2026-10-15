/**
 * B107 §DG (0115_b107_x_dg) — the PURE logic of design governance (unit-tested): the contribution steps and their actions, which steps are a
 * named human's act, the obligations of a design acceptance and the role each is attested by, the comparison of two baseline versions
 * (UX-01-003 `compare`), the eligibility of an approver in words (the PORT decides — this explains, before the act), the request shapes the
 * routes refuse early, and evidence ages. Nothing here decides a rule a port decides.
 */

export const CONTRIBUTION_KINDS = ['new_component', 'component_change', 'new_pattern', 'pattern_change', 'deprecation', 'retirement', 'amendment'] as const;
export type ContributionKind = (typeof CONTRIBUTION_KINDS)[number];
export const CONTRIBUTION_STEPS = ['review', 'accept', 'reject', 'publish', 'deprecate', 'adopt', 'measure', 'migrate', 'retire', 'close'] as const;
export type ContributionStep = (typeof CONTRIBUTION_STEPS)[number];
/** The steps that are a named human's act (human-gated at the PEP; the port re-checks the approver test). */
export const HUMAN_STEPS: readonly ContributionStep[] = ['review', 'accept', 'reject', 'publish', 'deprecate', 'retire', 'close'];
export const stepAction = (step: ContributionStep): string => `governance.design.contribution.${step}`;

/** Which steps a contribution in a stage of a kind may take next (the port enforces; the page offers only these). */
export function nextSteps(kind: string, stage: string): ContributionStep[] {
  switch (stage) {
    case 'proposed': case 'held': return ['review', 'reject'];
    case 'in_review': return ['accept', 'reject'];
    case 'accepted': return kind === 'deprecation' ? ['deprecate', 'reject'] : kind === 'retirement' ? ['retire', 'reject'] : ['publish', 'reject'];
    case 'published': return ['adopt'];
    case 'adopted': return ['adopt', 'measure'];
    case 'measured': return ['measure', 'close'];
    case 'deprecated': return ['migrate', 'retire'];
    case 'migrating': return ['migrate', 'retire'];
    case 'retired': case 'rejected': return ['close'];
    default: return [];
  }
}

export const OBLIGATIONS = ['design', 'assurance', 'customer'] as const;
export type Obligation = (typeof OBLIGATIONS)[number];
export const OBLIGATION_ROLE: Record<Obligation, string> = { design: 'design_system_authority', assurance: 'independent_assurance', customer: 'customer_sponsor' };

type Row = Record<string, unknown>;
export interface Member { asset_id: string; key: string; version: number; digest: string; status?: string; owner?: string | null }
export interface BaselineVersion { version: number; digest: string; members: Member[]; principles: Array<{ key: string; version: number; digest: string }>; exceptions: Array<{ exception_id: string }>;
                                   conformance_scope: Record<string, string[]>; design_system_version: string }

/** COMPARE two baseline versions: members added / removed / re-versioned, principles changed, exceptions added / dropped, scope and
 *  design-system version changes. Deterministic (sorted by key). */
export function compareBaselines(from: BaselineVersion, to: BaselineVersion) {
  const fm = new Map(from.members.map((m) => [m.asset_id, m])); const tm = new Map(to.members.map((m) => [m.asset_id, m]));
  const added = to.members.filter((m) => !fm.has(m.asset_id)).map((m) => ({ key: m.key, version: m.version }));
  const removed = from.members.filter((m) => !tm.has(m.asset_id)).map((m) => ({ key: m.key, version: m.version }));
  const changed = to.members.filter((m) => fm.has(m.asset_id) && (fm.get(m.asset_id)!.version !== m.version || fm.get(m.asset_id)!.digest !== m.digest))
    .map((m) => ({ key: m.key, from: fm.get(m.asset_id)!.version, to: m.version }));
  const fp = new Map(from.principles.map((p) => [p.key, p])); const tp = new Map(to.principles.map((p) => [p.key, p]));
  const principles = [...new Set([...fp.keys(), ...tp.keys()])].sort()
    .filter((k) => fp.get(k)?.digest !== tp.get(k)?.digest)
    .map((k) => ({ key: k, from: fp.get(k)?.version ?? null, to: tp.get(k)?.version ?? null }));
  const fx = new Set(from.exceptions.map((x) => x.exception_id)); const tx = new Set(to.exceptions.map((x) => x.exception_id));
  const scopeKeys = [...new Set([...Object.keys(from.conformance_scope ?? {}), ...Object.keys(to.conformance_scope ?? {})])].sort();
  const scope = scopeKeys.filter((k) => JSON.stringify([...(from.conformance_scope?.[k] ?? [])].sort()) !== JSON.stringify([...(to.conformance_scope?.[k] ?? [])].sort()))
    .map((k) => ({ dimension: k, from: from.conformance_scope?.[k] ?? [], to: to.conformance_scope?.[k] ?? [] }));
  const by = (a: { key: string }, b: { key: string }) => a.key.localeCompare(b.key);
  return {
    from: { version: from.version, digest: from.digest }, to: { version: to.version, digest: to.digest },
    design_system_version: from.design_system_version === to.design_system_version ? null : { from: from.design_system_version, to: to.design_system_version },
    members: { added: added.sort(by), removed: removed.sort(by), changed: changed.sort(by) }, principles,
    exceptions: { added: [...tx].filter((x) => !fx.has(x)).sort(), dropped: [...fx].filter((x) => !tx.has(x)).sort() }, scope,
    identical: from.digest === to.digest,
  };
}

/** WHY a principal may not take an approving act, in words (empty = eligible as far as the page can tell; the PORT decides). */
export function eligibility(a: { kind: string; principal: string; holds: boolean; role: string; proposer: string | null; builders: readonly string[]; owner?: string | null;
                                state: string; expectedState: string | readonly string[]; already?: boolean }): string[] {
  const reasons: string[] = [];
  if (a.kind !== 'human') reasons.push('a named human takes this act — an agent or a system never approves, accepts or attests');
  if (!a.holds) reasons.push(`you do not hold ${a.role}`);
  if (a.proposer !== null && a.principal === a.proposer) reasons.push('you proposed it — no self-acceptance');
  if (a.builders.includes(a.principal)) reasons.push('you built or amended it — independence');
  if (a.owner !== undefined && a.owner !== null && a.principal === a.owner) reasons.push('you own the asset whose authority this expands (ES-02-004)');
  const expected = typeof a.expectedState === 'string' ? [a.expectedState] : a.expectedState;
  if (!expected.includes(a.state)) reasons.push(`it is ${a.state}, not ${expected.join(' or ')}`);
  if (a.already === true) reasons.push('you already attested another obligation of this version — one person, one obligation');
  return reasons;
}

/** An evidence item's age in days (one decimal) on the given clock; null without a capture time. */
export function ageDays(capturedAt: string | null | undefined, now: string): number | null {
  if (capturedAt === null || capturedAt === undefined) return null;
  const ms = Date.parse(now) - Date.parse(capturedAt);
  return Number.isFinite(ms) ? Math.round(ms / 8_640_000) / 10 : null;
}

const HEX64 = /^[0-9a-f]{64}$/;
export const TUPLE_REQUIRED = ['capability', 'journey', 'persona', 'role', 'deployment_profile', 'theme', 'locale', 'device'] as const;
export const TUPLE_OPTIONAL = ['entitlement', 'assistive_technology', 'configuration_digest', 'data_versions', 'model_versions', 'period_from', 'period_to'] as const;
export const PROFILES = ['local-dev', 'saas', 'private-cloud', 'on-premise'] as const;

/** The design tuple's shape (the route refuses early; the port re-checks). */
export function tupleProblem(t: unknown): string | null {
  if (t === null || typeof t !== 'object' || Array.isArray(t)) return 'the scope tuple is an object';
  const o = t as Row;
  for (const k of TUPLE_REQUIRED) if (typeof o[k] !== 'string' || String(o[k]).trim().length < 2) return `the tuple names its ${k} (UX-ADR-023: acceptance is exact)`;
  for (const k of Object.keys(o)) if (!(TUPLE_REQUIRED as readonly string[]).includes(k) && !(TUPLE_OPTIONAL as readonly string[]).includes(k)) return `${k} is not a dimension of the design tuple`;
  if (!(PROFILES as readonly string[]).includes(String(o['deployment_profile']))) return `${String(o['deployment_profile'])} is not a deployment profile`;
  if (o['configuration_digest'] !== undefined && !HEX64.test(String(o['configuration_digest']))) return 'the configuration digest is 64 hex';
  return null;
}

/** Evidence items' shape: kind, ref, digest (64 hex), capturedAt, validUntil — captured in the past, valid for some time. */
export function evidenceProblem(items: unknown, now: string): string | null {
  if (!Array.isArray(items) || items.length === 0 || items.length > 50) return 'a record binds 1–50 evidence items';
  for (const x of items as Row[]) {
    if (typeof x !== 'object' || x === null) return 'an evidence item is an object';
    if (String(x['kind'] ?? '').length < 3 || String(x['ref'] ?? '').length < 3 || !HEX64.test(String(x['digest'] ?? ''))) return 'each item names its kind, reference and digest (64 hex)';
    const c = Date.parse(String(x['capturedAt'] ?? '')); const v = Date.parse(String(x['validUntil'] ?? ''));
    if (!Number.isFinite(c) || !Number.isFinite(v)) return 'each item names capturedAt and validUntil (instants)';
    if (c > Date.parse(now) + 60_000 || v <= c) return `${String(x['ref'])} was captured in the future or is valid for no time`;
  }
  return null;
}
