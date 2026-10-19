/**
 * The governed customer theme client — CP-6 B80 §TK (0118_b80_x_tk; F-P7-E-03: UX-68-001…005, UX-ADR-022, PAT-41, REL-16, UX-17-005).
 *
 * Every response is returned VERBATIM; the helpers below only WORD the record — the server decides the state, the matrix and who may act
 * (the ports re-check every rule and recompute the contrast matrix from the STORED mapping). Nothing here shows a theme certified or in
 * force by inference: "in force" is the tenant's latest activation as the server answers it; a client-side matrix is a PREVIEW, labelled
 * so, and the page states when it diverges from the server's. Every brand, persona and record on a demonstration is SYNTHETIC; a real
 * customer's brand acceptance is H3 / R2 and never claimed.
 */
import { ALLOWED_COLOUR_KEYS, CORE_DARK, CORE_LIGHT, certifyTheme, type MatrixResult, type ThemeMapping } from '@eye/tokens';
import { call, type ApiResult } from './api';

type Row = Record<string, unknown>;
export interface Receipt { policyDecisionId: string; auditSeq: number }
export interface ThemeRow {
  theme_id: string; version: number; tenant_id: string; theme_key: string; title: string; mapping: ThemeMapping; resolved: Record<string, { light: string; dark: string }>;
  state: 'proposed' | 'certified' | 'refused' | 'retired' | 'superseded' | string; digest: string; claim: string; proposed_by: string; proposed_by_name: string | null; proposed_at: string;
  certification: (Row & { outcome: string; failing: Row[]; certifier_name: string | null; certified_at: string; certification_digest: string }) | null;
}
export interface InForce { tenant_id: string; theme: 'core' | 'customer'; fallback: boolean; note: string; activation: Row | null;
  version?: { theme_id: string; version: number; key: string; title: string; digest: string; mapping: ThemeMapping; resolved: Record<string, { light: string; dark: string }> };
  certification?: Row }
export interface TenantRead { themes: ThemeRow[]; activations: Row[]; in_force: InForce; ledger: Row[]; core: Row; read_at: string; boundary: string; receipt: Receipt }
export interface Queue { awaiting: ThemeRow[]; recent: ThemeRow[]; ledger: Row[]; read_at: string; boundary: string; receipt: Receipt }
export interface Preview {
  theme_id: string; version: number; tenant_id: string; key: string; title: string; state: string; digest: string; mapping: ThemeMapping; resolved: Row; proposed_by: string; claim: string;
  matrix: { outcome: 'pass' | 'fail'; pairs: number; failing: Row[]; modes: Row[]; results: Row[]; rules_version: string }; failing_text: string[]; certification_digest: string;
  in_force: boolean; eligibility: { certify: string[]; activate: string[]; retire: string[] }; consequence: { certify: string[]; activate: string[] };
}

const tenantOver = (t: string, action: string, objectId: string | null = null) => ({ scope: 'TENANT' as const, tenant_id: t, purpose_id: 'governance', action, object_type: 'THM', object_id: objectId,
  side_effect_class: action.endsWith('.read') || action.endsWith('.preview') ? 'none' as const : 'reversible' as const, consequence_class: 'C2' as const });
const base = (t: string) => `/v1/tenants/${t}/governance/design/themes`;
type R<T> = Promise<ApiResult<T & { receipt: Receipt }>>;

export const themes = {
  read: (t: string): Promise<ApiResult<TenantRead>> => call(`${base(t)}/read`, tenantOver(t, 'governance.design.theme.read')),
  /** The theme in force (ThemeScope): a TENANT route, or a DOMAIN route for a domain-bound principal. */
  inForce: (t: string, d: string | null = null): R<{ in_force: InForce; read_at: string }> => d === null
    ? call(`${base(t)}/in-force/read`, tenantOver(t, 'governance.design.theme.in_force.read'))
    : call(`/v1/tenants/${t}/domains/${d}/governance/design/themes/in-force/read`, { scope: 'DOMAIN', tenant_id: t, domain_id: d, purpose_id: 'governance',
        action: 'governance.design.theme.in_force.read', object_type: 'THM', side_effect_class: 'none', consequence_class: 'C2' }),
  queue: (): Promise<ApiResult<Queue>> => call('/v1/governance/design/themes/queue/read', { scope: 'PLATFORM', purpose_id: 'governance', action: 'governance.design.theme.read', object_type: 'THM', side_effect_class: 'none', consequence_class: 'C2' }),
  preview: (t: string, id: string, version: number): R<{ preview: Preview }> => call(`${base(t)}/${id}/preview`, tenantOver(t, 'governance.design.theme.preview', id), { version }),
  propose: (t: string, p: { themeId?: string; key: string; expectedVersion: number; title: string; mapping: ThemeMapping }): R<{ theme: Row }> =>
    call(`${base(t)}/propose`, tenantOver(t, 'governance.design.theme.propose', p.themeId ?? null), p),
  certify: (t: string, id: string, p: { version: number; digest: string; reason: string }): R<{ certification: Row }> => call(`${base(t)}/${id}/certify`, tenantOver(t, 'governance.design.theme.certify', id), p),
  activate: (t: string, id: string, p: { version: number; digest: string; reason: string }): R<{ activation: Row }> => call(`${base(t)}/${id}/activate`, tenantOver(t, 'governance.design.theme.activate', id), p),
  rollback: (t: string, p: { expectedActivation: string; reason: string }): R<{ activation: Row }> => call(`${base(t)}/rollback`, tenantOver(t, 'governance.design.theme.rollback', p.expectedActivation), p),
  retire: (t: string, id: string, p: { version: number; reason: string }): R<{ theme: Row }> => call(`${base(t)}/${id}/retire`, tenantOver(t, 'governance.design.theme.retire', id), p),
};

/* ── the words ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/** A theme version's state in words — never "in force" unless the server's latest activation names it. */
export function themeStateText(row: Pick<ThemeRow, 'state' | 'claim' | 'certification'> & { theme_id?: string; version?: number }, inForce: InForce | null): string {
  const live = inForce !== null && inForce.theme === 'customer' && inForce.version !== undefined && inForce.version.theme_id === row.theme_id && inForce.version.version === row.version;
  switch (row.state) {
    case 'proposed': return 'PROPOSED — not certified, not in force';
    case 'certified': return live ? `IN FORCE — certified (claim: ${row.claim})` : `CERTIFIED (claim: ${row.claim}) — not in force`;
    case 'refused': return `REFUSED certification — ${(row.certification?.failing ?? []).length} failing pair${(row.certification?.failing ?? []).length === 1 ? '' : 's'}; never in force`;
    case 'retired': return 'RETIRED — kept for the record, never in force';
    case 'superseded': return 'SUPERSEDED by a later proposal before certification';
    default: return row.state;
  }
}
export function inForceText(f: InForce | null): string {
  if (f === null) return 'Reading the theme in force…';
  if (f.theme === 'customer' && f.version !== undefined) return `In force: ${f.version.title} v${f.version.version} (certified; claim: demonstration) — on screen in light and dark; print and forced colours render the certified core`;
  return f.fallback ? `In force: the certified CORE theme — FALLBACK: ${f.note}` : 'In force: the certified CORE theme (Volume 9 Appendix A)';
}
/** The next version a proposal names (the latest + 1 — the port refuses a stale one). */
export function expectedVersionFor(rows: ReadonlyArray<Pick<ThemeRow, 'theme_key' | 'version'>>, key: string): number {
  return rows.filter((r) => r.theme_key === key).reduce((m, r) => Math.max(m, r.version), 0);
}
/** The scope id of a theme version's CSS (a plain key — no selector injection). */
export const scopeIdFor = (themeId: string, version: number): string => `t-${themeId.replace(/[^0-9a-f]/gi, '').slice(-12).toLowerCase()}-v${Math.max(0, Math.floor(version))}`;

/* ── the proposal form ─────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface ProposalForm { colours: Record<string, { on: boolean; light: string; dark: string }>; wordmark: string; logoSrc: string; logoAlt: string }
/** The empty form: every allowed key OFF at its core value (a brand maps only what it chooses). */
export function emptyForm(): ProposalForm {
  const colours: ProposalForm['colours'] = {};
  for (const k of ALLOWED_COLOUR_KEYS) colours[k] = { on: false, light: CORE_LIGHT[k] ?? '', dark: CORE_DARK[k] ?? '' };
  return { colours, wordmark: '', logoSrc: '', logoAlt: '' };
}
/** The form as a mapping (the keys switched on, the wordmark and the logo when given). */
export function mappingFrom(f: ProposalForm): ThemeMapping {
  const m: ThemeMapping = {};
  for (const k of ALLOWED_COLOUR_KEYS) { const c = f.colours[k]; if (c?.on === true) m[k] = { light: c.light.toUpperCase(), dark: c.dark.toUpperCase() }; }
  if (f.wordmark.trim() !== '') m['brand.wordmark'] = { text: f.wordmark.trim() };
  if (f.logoSrc.trim() !== '' || f.logoAlt.trim() !== '') m['brand.logo'] = { src: f.logoSrc.trim(), alt: f.logoAlt.trim() };
  return m;
}

/** PARITY (UX-68-005/-006): the server's matrix and this client's recomputation agree pair by pair — or the divergence is named. */
export function matrixParity(server: { outcome: string; results: Row[] } | null, client: MatrixResult | null): { agree: boolean; differing: string[] } {
  if (server === null || client === null) return { agree: false, differing: ['one side of the comparison is missing'] };
  const differing: string[] = [];
  if (server.results.length !== client.results.length) differing.push(`the server evaluated ${server.results.length} pairs, this client ${client.results.length}`);
  const n = Math.min(server.results.length, client.results.length);
  for (let i = 0; i < n; i++) {
    const s = server.results[i]!; const c = client.results[i]!;
    if (s['fg'] !== c.fg || s['bg'] !== c.bg || s['mode'] !== c.mode || s['pass'] !== c.pass || s['shown'] !== c.shown) differing.push(`${c.mode}: ${c.fg} on ${c.bg}`);
  }
  if ((server.outcome === 'pass') !== (client.outcome === 'pass')) differing.push('the outcome');
  return { agree: differing.length === 0, differing };
}
/** The client-side preview of a mapping (labelled a preview — the certification recomputes it on the server). */
export const previewMatrix = (m: ThemeMapping | null) => certifyTheme(m);

/** THE SPECIMEN (PAT-41): the same items, in the same order, with the same labels and symbols in every mode — only the palette changes. */
export interface SpecimenItem { kind: 'warning' | 'decision' | 'recommendation' | 'table' | 'action' | 'wordmark'; symbol: string | null; label: string; text: string }
export function specimen(wordmark: string | null): SpecimenItem[] {
  return [
    ...(wordmark === null ? [] : [{ kind: 'wordmark' as const, symbol: null, label: 'BRAND', text: wordmark }]),
    { kind: 'warning', symbol: 'critical', label: 'CRITICAL', text: 'Corridor closure warning — a critical condition (SYNTHETIC specimen)' },
    { kind: 'decision', symbol: 'decided', label: 'DECIDED', text: 'Reroute decided by a named authority (SYNTHETIC specimen)' },
    { kind: 'recommendation', symbol: 'recommended', label: 'RECOMMENDED', text: 'Advisory: hold buffer stock — not a decision (SYNTHETIC specimen)' },
    { kind: 'table', symbol: 'observed', label: 'OBSERVED', text: 'A table row with an observed value and its unit' },
    { kind: 'action', symbol: null, label: 'ACTION', text: 'A focusable control (the focus ring is part of the certification)' },
  ];
}
export const SPECIMEN_MODES = ['light', 'dark', 'print'] as const;
