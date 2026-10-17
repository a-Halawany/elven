/**
 * B107 §DR (0115_b107_x_dr) — THE PURE LOGIC of data governance and ownership: the stewardship SLA and reviewer count by consequence (the
 * ports' table, mirrored for the previews), the transfer checklist (ES-11-005), distinguishability (ES-04-002), the OWNED-CONTRACT LINT
 * over the API's routes (ES-11-002: an endpoint outside every ratified owned contract is listed — never hidden), the read-only reader of
 * the V7 App A DAT rows (audit/requirements/v07.csv — the file is never written) and the realization this build declares for the DAT-GV
 * capabilities it implements. Nothing here decides a rule a port decides; these functions explain and prepare.
 *
 * THREE CLAIMS, never mixed: construction (this code and its tests); demonstrated operation (the act on SYNTHETIC NORDWERK records); real
 * acceptance / production admission (R1/R2/H2 — never claimed here).
 */

type Row = Record<string, unknown>;

export const CASE_KINDS = ['identity', 'semantic', 'quality', 'access', 'classification', 'correction', 'lifecycle', 'data_exception'] as const;
export type CaseKind = (typeof CASE_KINDS)[number];
export const CONSEQUENCES = ['C0', 'C1', 'C2', 'C3', 'C4'] as const;
export type Consequence = (typeof CONSEQUENCES)[number];
/** The stewardship SLA by consequence, in days (governance.dr_case_sla): the higher the consequence, the shorter the window. */
export const SLA_DAYS: Readonly<Record<Consequence, number>> = { C0: 30, C1: 14, C2: 5, C3: 2, C4: 1 };
/** Distinct approvals a decision needs (governance.dr_reviewers_required). */
export const reviewersRequired = (c: Consequence): number => (c === 'C3' || c === 'C4' ? 2 : 1);
/** The consequence an escalation is raised at: one level higher per escalation, capped at C4 (the sweep's rule). */
export function escalatedConsequence(c: Consequence, level: number): Consequence {
  const n = Math.min(4, Number(c.slice(1)) + Math.max(0, level));
  return `C${n}` as Consequence;
}
/** Who may review a case of this kind (the port's approver roles) and whether the subject's owner is excluded (it expands the owner's authority). */
export function reviewRule(kind: CaseKind): { roles: string[]; ownerExcluded: boolean } {
  return {
    roles: kind === 'access' || kind === 'classification' ? ['data_steward', 'domain_admin', 'privacy_officer'] : ['data_steward', 'domain_admin'],
    ownerExcluded: kind === 'access' || kind === 'data_exception',
  };
}

export const DUTIES = ['owner', 'steward', 'custodian', 'producer', 'consumer', 'policy_authority', 'quality_authority'] as const;
export const GAP_KINDS = ['no_owner', 'owner_lost', 'conflicting_authorities', 'unresolved_authority', 'contact_lost', 'case_unowned'] as const;

/** ES-11-005: every item, none optional. */
export const TRANSFER_ITEMS = ['code', 'state', 'contracts', 'dashboards', 'alerts', 'runbooks', 'risks', 'exceptions', 'incidents'] as const;
/** The checklist's problems in words (the port refuses the same): a missing item, an item without a reference (4+ characters), an unknown item. */
export function checklistProblems(checklist: unknown): string[] {
  if (checklist === null || typeof checklist !== 'object' || Array.isArray(checklist)) return ['the checklist is an object of the nine items'];
  const c = checklist as Row; const out: string[] = [];
  for (const i of TRANSFER_ITEMS) {
    const v = c[i];
    if (v === null || typeof v !== 'object' || Array.isArray(v)) out.push(`${i}: missing`);
    else if (typeof (v as Row)['ref'] !== 'string' || String((v as Row)['ref']).trim().length < 4) out.push(`${i}: no reference`);
  }
  for (const k of Object.keys(c)) if (!(TRANSFER_ITEMS as readonly string[]).includes(k)) out.push(`${k}: not a checklist item`);
  return out;
}

export interface OwnershipShape { component: string; units: string[]; contracts: string[]; stateStores: string[]; policyDecisions: string[]; telemetryNamespace: string; failureDomain: string }
/** ES-04-002: two components realised by a SHARED deployable unit stay distinguishable — no shared state store, contract or policy decision; their
 *  own telemetry namespace and failure domain. Answers what is shared (empty when distinguishable or when no unit is shared). */
export function sharedConcerns(a: OwnershipShape, b: OwnershipShape): string[] {
  if (!a.units.some((u) => b.units.includes(u))) return [];
  const both = (x: string[], y: string[]) => x.filter((v) => y.includes(v));
  const out: string[] = [];
  const st = both(a.stateStores, b.stateStores); if (st.length > 0) out.push(`state stores ${st.join(', ')}`);
  const ct = both(a.contracts, b.contracts); if (ct.length > 0) out.push(`contracts ${ct.join(', ')}`);
  const pd = both(a.policyDecisions, b.policyDecisions); if (pd.length > 0) out.push(`policy decisions ${pd.join(', ')}`);
  if (a.telemetryNamespace === b.telemetryNamespace) out.push(`the telemetry namespace ${a.telemetryNamespace}`);
  if (a.failureDomain === b.failureDomain) out.push(`the failure domain ${a.failureDomain}`);
  return out;
}

export interface Route { method: string; path: string }
export interface OwnedContracts { component: string; contracts: string[] }
export interface LintResult { routes: number; covered: Array<Route & { component: string }>; unowned: Route[]; ambiguous: Array<Route & { components: string[] }>; prefixes: number }
/** Normalise a route path: one leading slash, no trailing slash, parameters kept as written. */
export const normalisePath = (p: string): string => `/${p.split('/').filter((s) => s.length > 0).join('/')}`;
/** ES-11-002 — THE OWNED-CONTRACT LINT: every route of the service is matched against the ratified owned contracts that are ROUTE PREFIXES
 *  (a contract beginning with `/`; an interface id names no route). A route under no owned prefix is UNOWNED — a convenience endpoint outside
 *  every owner's contract; under two owners' prefixes it is AMBIGUOUS. Deterministic: routes sorted by path then method. */
export function lintOwnedRoutes(routes: Route[], owners: OwnedContracts[]): LintResult {
  const prefixes = owners.flatMap((o) => o.contracts.filter((c) => c.startsWith('/')).map((c) => ({ component: o.component, prefix: normalisePath(c) })));
  const sorted = [...routes].map((r) => ({ method: r.method.toUpperCase(), path: normalisePath(r.path) }))
    .sort((a, b) => a.path.localeCompare(b.path) || a.method.localeCompare(b.method));
  const out: LintResult = { routes: sorted.length, covered: [], unowned: [], ambiguous: [], prefixes: prefixes.length };
  for (const r of sorted) {
    const hits = [...new Set(prefixes.filter((x) => r.path === x.prefix || r.path.startsWith(`${x.prefix}/`)).map((x) => x.component))].sort();
    if (hits.length === 0) out.unowned.push(r);
    else if (hits.length === 1) out.covered.push({ ...r, component: hits[0]! });
    else out.ambiguous.push({ ...r, components: hits });
  }
  return out;
}

/** RFC 4180 CSV (quoted fields, doubled quotes, CRLF or LF). */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.length > 1 || row[0] !== '') rows.push(row);
      row = [];
    } else field += ch;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

/** The V7 App A component catalog's nine groups: each DAT prefix's group, authority class and layer (the clause is "<group> <name> <class>
 *  <layer> <purpose>"; each group carries exactly one class and one layer — read from the file, stated here so the reader can split it). */
export const DAT_GROUPS: Readonly<Record<string, { group: string; authorityClass: string; layer: string }>> = {
  GV: { group: 'Authority and Governance', authorityClass: 'Registry / control', layer: 'Governance domain' },
  IN: { group: 'Acquisition and Intake', authorityClass: 'Runtime / evidence', layer: 'Connector or intake cell' },
  SM: { group: 'Contracts and Semantics', authorityClass: 'Registry / canonical state', layer: 'Semantic domain' },
  ST: { group: 'Storage and Processing', authorityClass: 'Canonical / derived state', layer: 'Data state cell' },
  KN: { group: 'Knowledge and Strategic State', authorityClass: 'Canonical / product state', layer: 'Knowledge cell' },
  SV: { group: 'Products and Serving', authorityClass: 'Product / serving state', layer: 'Serving cell' },
  TR: { group: 'Trust and Lifecycle', authorityClass: 'Policy / protected evidence', layer: 'Trust domain' },
  OP: { group: 'Quality and Operations', authorityClass: 'Telemetry / control', layer: 'Operations domain' },
  DL: { group: 'Delivery and Economics', authorityClass: 'Registry / durable workflow', layer: 'Delivery domain' },
};
export interface DatRow { key: string; group: string; name: string; authorityClass: string; layer: string; purpose: string; status: string; row: number }
/** READ the DAT rows of v07.csv (the text given — the file is read-only and never written): one entry per DAT id, the clause split by its
 *  group's known class and layer; a row whose clause does not split is answered with `name` = the whole remainder (never dropped). */
export function parseDatRows(csvText: string): DatRow[] {
  const rows = parseCsv(csvText);
  const head = rows[0] ?? []; const id = head.indexOf('id'); const clause = head.indexOf('clause'); const status = head.indexOf('impl_status');
  if (id < 0 || clause < 0) throw new Error('v07.csv: the header names no id or clause column');
  const out: DatRow[] = [];
  rows.slice(1).forEach((r, i) => {
    const key = (r[id] ?? '').trim();
    if (!/^DAT-[A-Z]{2}-[0-9]{2}$/.test(key)) return;
    const g = DAT_GROUPS[key.slice(4, 6)];
    const text = (r[clause] ?? '').replace(/\s+/g, ' ').trim();
    if (g === undefined) { out.push({ key, group: 'unknown', name: text, authorityClass: 'unknown', layer: 'unknown', purpose: '', status: r[status] ?? '', row: i + 2 }); return; }
    const rest = text.startsWith(`${g.group} `) ? text.slice(g.group.length + 1) : text;
    const at = rest.indexOf(` ${g.authorityClass} ${g.layer} `);
    const name = at < 0 ? rest : rest.slice(0, at);
    const purpose = at < 0 ? '' : rest.slice(at + g.authorityClass.length + g.layer.length + 3);
    out.push({ key, group: g.group, name, authorityClass: g.authorityClass, layer: g.layer, purpose, status: r[status] ?? '', row: i + 2 });
  });
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

export interface Realization { schemas: string[]; relations: string[]; functions: string[] }
/** What THIS build declares realises the DAT-GV capabilities it implements (the reconciliation checks each against the database). A DAT id
 *  not listed is declared `planned` with no realization — its gap (no owner) and its state are stated, never hidden. */
export const DAT_REALIZATIONS: Readonly<Record<string, Realization>> = {
  'DAT-GV-01': { schemas: ['governance'], relations: ['governance.data_authorities'], functions: ['governance.dr_propose_authority', 'governance.dr_decide_authority'] },
  'DAT-GV-02': { schemas: ['governance', 'tenancy'], relations: ['governance.domain_registry', 'tenancy.domains'], functions: ['governance.dr_propose_domain', 'governance.dr_decide_domain'] },
  'DAT-GV-03': { schemas: ['products'], relations: ['products.products_current', 'products.product_consumers'], functions: ['governance.dr_products'] },
  'DAT-GV-04': { schemas: ['governance'], relations: ['governance.data_authorities'], functions: ['governance.dr_resolve', 'service.owner_resolution'] },
  'DAT-GV-07': { schemas: ['governance'], relations: ['governance.stewardship_cases'], functions: ['governance.dr_open_case', 'governance.dr_review_case', 'governance.dr_sweep_cases'] },
  'DAT-GV-10': { schemas: ['governance'], relations: ['governance.responsibility_evidence'], functions: ['governance.dr_portal'] },
};

/** The SLA's due instant for a consequence from an opening instant (the port's arithmetic, for previews). */
export function dueAt(openedAtIso: string, c: Consequence): string {
  return new Date(Date.parse(openedAtIso) + SLA_DAYS[c] * 86_400_000).toISOString();
}
