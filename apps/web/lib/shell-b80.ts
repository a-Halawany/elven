/**
 * CP-6 B80 §SH — THE SHELL'S PURE MODEL (F-P7-E-01: PR-05-001/002/003/005, CAP-AU-06, UX-09-002…005, UX-11-001…005, UX-15-001…005,
 * CMP-009/011/012/013/014/015/016, PAT-25, PAT-26). The component contract as pure functions (the web has no DOM test environment and B80
 * adds no dependency — the rendering is proven by the catalogue and deep-link walks):
 *
 *   THE WORKSPACE REGISTRY   WS-01…WS-20 (Appendix K): identity, purpose, audience, objects, the continuity rule, the routes each one owns
 *                            and the queues it works from — ONE registry feeding ONE rail per shell; the audience is DESCRIPTIVE (navigation
 *                            never implies permission: the server decides every read and refuses what it refuses, in its own words).
 *   THE SHELL SPECS          the eight shells (b80-seams WorkspaceKey) — title, the rail's accessible name (WORKSPACE_NAV_NAMES, a hosted
 *                            selector), scope, home and the rail's items (moved here from the seven layouts, each part's marked line kept).
 *   THE NAV MODEL            the active item (the LONGEST matching item — one aria-current), the breadcrumb, the workspace of a path.
 *   THE HISTORY STACK        the tab's own back stack (sessionStorage — never the server, never shared), the last VERIFIED location.
 *   THE RETURN TOKEN         `from=` — the source, its title and the focus target; a LOCATION only: no field can carry a command, so a return
 *                            never repeats a side effect (PAT-26).
 *   THE DEEP-LINK CODEC      object kind + id + version + as-of + return token ↔ the in-app href; the outcome classes of a resolution
 *                            (exact · drifted · not_replayable · future · unavailable — the last one says nothing about existence).
 *   THE NAVIGATION GUARD     the shell issues READS only, plus one personal write the person asks for (`shell.navigation.save`); the
 *                            palette's entries are navigations only — anything else is refused by the model (and by the test over sources).
 *   THE SHELL STATUS         verifying · ready · degraded · unverified (fail closed); what is frozen and what is merely declared.
 *   TABS AND PALETTE         roving focus over tabs (RTL mirrored), the palette's filtering and its active option.
 *   THE CLIENT               the navigation-state read / save and the warning as-of read (0118_b80_x_sh), in the server's words.
 *
 * THREE CLAIMS: construction (this module, components/shell.tsx, the layouts, 0118_b80_x_sh, the harnesses); demonstrated operation (the
 * act's deep-link scene on SYNTHETIC NORDWERK records); real acceptance (H3) — never claimed.
 */
import { call, type ApiResult } from './api';
import { t, defaultLocale, type Locale } from './i18n';
import { WORKSPACE_NAV_NAMES, type NavItem, type ShellScope, type WorkspaceKey, type WorkspaceSpec } from './b80-seams';
/* B81 si: the evolved guard's rule (pure) */ import { assertNoExecution } from './authority-b81'; /* end B81 si */

/* ═════════════════════════════ THE WORKSPACE REGISTRY (WS-01…WS-20) ═════════════════════════════ */
export type WorkspaceId = `WS-${'01' | '02' | '03' | '04' | '05' | '06' | '07' | '08' | '09' | '10' | '11' | '12' | '13' | '14' | '15' | '16' | '17' | '18' | '19' | '20'}`;
export interface QueueLink { href: string; label: string }
export interface WorkspaceEntry {
  id: WorkspaceId;
  title: string;
  purpose: string;
  /** the roles the workspace is designed for — DESCRIPTIVE: it decides nothing (the server's policy does) */ audience: string[];
  objects: string[];
  /** the continuity rule of Appendix K: what the workspace preserves or marks when its state is stale or degraded */ continuity: string;
  /** the in-app routes this workspace owns (prefixes); empty = no surface in this build (named, never offered as a link) */ routes: string[];
  queues: QueueLink[];
}
const Q = {
  attention: { href: '/decisions/attention', label: 'Attention queue' },
  tasks: { href: '/decisions/tasks', label: 'Tasks' },
  requests: { href: '/decisions/requests', label: 'Requests' },
  review: { href: '/intelligence/review', label: 'Review queue' },
  quarantine: { href: '/observation/quarantine', label: 'Quarantine' },
  resolutions: { href: '/graph/resolutions', label: 'Resolution queue' },
  warnings: { href: '/prediction/warnings', label: 'Warnings' },
  service: { href: '/admin/service', label: 'Service cases' },
} as const;
export const WORKSPACE_REGISTRY: readonly WorkspaceEntry[] = [
  { id: 'WS-01', title: 'Executive Operating System', purpose: 'Executive cadence, priorities, warnings, decisions, commitments, outcomes', audience: ['executive', 'executive_operator', 'board_member'],
    objects: ['objectives', 'strategic packages', 'decisions', 'commitments'], continuity: 'Preserve context, evidence, and approval state', routes: ['/home', '/decisions/briefings', '/decisions/board', '/decisions/publications'], queues: [Q.attention, Q.requests] },
  { id: 'WS-02', title: 'Observation Operations', purpose: 'Source coverage, freshness, collection health, blind spots, incidents', audience: ['collection_manager', 'domain_admin'],
    objects: ['sources', 'plans', 'runs', 'gaps', 'incidents'], continuity: 'Show last verified coverage and degraded intervals', routes: ['/observation'], queues: [Q.quarantine, Q.attention] },
  { id: 'WS-03', title: 'Research and Discovery', purpose: 'Structured search, exploration, saved research, evidence review', audience: ['domain_analyst', 'domain_specialist'],
    objects: ['queries', 'results', 'evidence', 'citations', 'watchlists'], continuity: 'Preserve query snapshot and policy-filtered scope', routes: ['/graph/search'], queues: [Q.review] },
  { id: 'WS-04', title: 'Intelligence Analysis', purpose: 'Cases, assessments, claims, summaries, review, publication', audience: ['extraction_manager', 'domain_analyst'],
    objects: ['cases', 'claims', 'evidence', 'assessments', 'tasks'], continuity: 'Preserve draft history and review status', routes: ['/intelligence'], queues: [Q.review, Q.tasks] },
  { id: 'WS-05', title: 'Entity and Relationship Workbench', purpose: 'Identity, alias, merge, split, and relationship stewardship', audience: ['resolution_manager', 'ontology_steward'],
    objects: ['entities', 'candidates', 'relationships', 'cases'], continuity: 'Keep unresolved candidates separate', routes: ['/graph/entities', '/graph/resolutions'], queues: [Q.resolutions] },
  { id: 'WS-06', title: 'Knowledge Graph Explorer', purpose: 'Temporal connected exploration and governed curation', audience: ['domain_analyst', 'ontology_steward', 'resolution_manager'],
    objects: ['nodes', 'edges', 'paths', 'subgraphs', 'revisions'], continuity: 'Serve last verified projection with watermark',
    routes: ['/graph', '/graph/explore', '/graph/revisions', '/graph/ontology', '/graph/impact', '/graph/subscriptions'], queues: [Q.resolutions] },
  { id: 'WS-07', title: 'Enterprise Memory', purpose: 'Institutional records, strategic context, lessons, and retrieval', audience: ['knowledge_owner', 'record_authority', 'retention_steward'],
    objects: ['memory items', 'decisions', 'artifacts', 'lessons'], continuity: 'Preserve permission and historical versions', routes: ['/graph/memory', '/graph/retention'], queues: [Q.attention] },
  { id: 'WS-08', title: 'Weak Signals and Warnings', purpose: 'Signal review, indicator management, warning response, escalation', audience: ['forecast_owner', 'strategy_owner', 'executive'],
    objects: ['signals', 'indicators', 'warnings', 'actions'], continuity: 'Preserve signal history and warning quality', routes: ['/prediction/warnings', '/prediction/signals', '/prediction/streams'], queues: [Q.warnings, Q.attention] },
  { id: 'WS-09', title: 'Risk and Opportunity', purpose: 'Exposure, appetite, mitigation, sponsorship, options, outcomes', audience: ['risk_owner', 'opportunity_sponsor'],
    objects: ['risks', 'opportunities', 'controls', 'options'], continuity: 'Expose gaps and prevent invalid aggregation', routes: ['/prediction/exposures'], queues: [Q.attention] },
  { id: 'WS-10', title: 'Domain Intelligence', purpose: 'Competitor, supply-chain, geopolitical, technology, cyber, finance', audience: ['domain_specialist', 'domain_analyst'],
    objects: ['domain objects', 'events', 'assessments', 'forecasts'], continuity: 'Disable incompatible domain packages', routes: ['/prediction/domains', '/twins/supply'], queues: [Q.attention] },
  { id: 'WS-11', title: 'Forecasting', purpose: 'Forecast design, comparison, monitoring, calibration, scoring', audience: ['forecast_owner', 'method_steward'],
    objects: ['forecasts', 'models', 'assumptions', 'outcomes'], continuity: 'Retain prior forecast and abstention state',
    routes: ['/prediction', '/prediction/forecasts', '/prediction/calibration', '/prediction/ensembles', '/prediction/registry', '/prediction/information-sets'], queues: [Q.warnings] },
  { id: 'WS-12', title: 'Scenario Intelligence', purpose: 'Scenario sets, drivers, branches, implications, options', audience: ['strategy_owner', 'forecast_owner'],
    objects: ['scenarios', 'assumptions', 'indicators', 'options'], continuity: 'Preserve plurality and inconsistent drafts', routes: ['/prediction/scenarios'], queues: [Q.attention] },
  { id: 'WS-13', title: 'Simulation Center', purpose: 'Design, execution, checkpoints, comparison, sensitivity', audience: ['simulation_operator', 'twin_owner'],
    objects: ['simulations', 'twin snapshots', 'runs', 'outputs'], continuity: 'Preserve checkpoints as non-decision-active', routes: ['/twins/simulations'], queues: [Q.attention] },
  { id: 'WS-14', title: 'Digital Twin Portfolio', purpose: 'Twin scope, observed state, branches, validity, time travel', audience: ['twin_owner', 'constraint_steward'],
    objects: ['twins', 'snapshots', 'branches', 'models'], continuity: 'Mark invalid or unsynchronized state', routes: ['/twins', '/twins/explorer', '/twins/models', '/twins/reconciliation', '/twins/constraints'], queues: [Q.attention] },
  { id: 'WS-15', title: 'Decision Intelligence', purpose: 'Decision packages, recommendations, alternatives, approval', audience: ['decision_owner', 'decision_approver', 'decision_authority'],
    objects: ['cases', 'options', 'recommendations', 'decisions'], continuity: 'Block decision-ready state when incomplete',
    routes: ['/decisions', '/decisions/analysis', '/decisions/recommendations', '/decisions/explanations', '/decisions/review', '/decisions/commitments', '/decisions/workflow', '/decisions/workspaces', '/decisions/health'],
    queues: [Q.attention, Q.tasks, Q.requests] },
  { id: 'WS-16', title: 'Strategy and Planning', purpose: 'Objectives, capabilities, initiatives, resources, outcomes', audience: ['strategy_owner', 'executive'],
    objects: ['Strategy Graph', 'plans', 'initiatives', 'measures'], continuity: 'Preserve baseline and unauthorized changes', routes: ['/graph/strategy'], queues: [Q.attention] },
  { id: 'WS-17', title: 'Agent Operations', purpose: 'Agent catalog, runs, plans, tools, budgets, escalation, override', audience: ['domain_admin', 'tenant_admin'],
    objects: ['agents', 'packages', 'runs', 'tasks', 'traces'], continuity: 'Pause unsafe runs and preserve full trace', routes: [], queues: [Q.attention] },
  { id: 'WS-18', title: 'Trust and Governance', purpose: 'Provenance, model, agent, data, policy, audit, exceptions', audience: ['auditor', 'data_steward', 'conformance_steward', 'product_authority'],
    objects: ['artifacts', 'policies', 'evaluations', 'audit cases'], continuity: 'Constrain use when evidence is indeterminate',
    routes: ['/admin/governance', '/admin/audit', '/graph/data/products', '/graph/data/catalog', '/graph/data/metrics', '/graph/data/events', '/graph/data/analytics'], queues: [Q.attention] },
  { id: 'WS-19', title: 'Platform and Customer Administration', purpose: 'Identity, tenants, domains, integrations, service, recovery', audience: ['platform_admin', 'tenant_admin', 'commercial_authority'],
    objects: ['users', 'roles', 'policies', 'connectors', 'health'], continuity: 'Fail closed on ambiguous tenant or authority',
    routes: ['/admin', '/admin/tenants', '/admin/principals', '/admin/objects', '/admin/commercial'], queues: [Q.service] },
  { id: 'WS-20', title: 'Product Delivery and Acceptance', purpose: 'Packaging, onboarding, migration, adoption, support, readiness', audience: ['onboarding_authority', 'implementation_lead', 'customer_sponsor', 'support_engineer'],
    objects: ['offers', 'plans', 'releases', 'tests', 'evidence'], continuity: 'Withhold acceptance and preserve prior safe operation',
    routes: ['/admin/onboarding', '/admin/implementation', '/admin/service', '/admin/customer-success', '/admin/control-center', '/admin/governance/acceptance'], queues: [Q.service] },
];

const under = (path: string, prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
/** The registry entry that owns a path: the entry with the LONGEST matching route (null = no workspace owns it). */
export function registryEntryFor(pathname: string): WorkspaceEntry | null {
  let best: { e: WorkspaceEntry; n: number } | null = null;
  for (const e of WORKSPACE_REGISTRY) for (const r of e.routes) if (under(pathname, r) && (best === null || r.length > best.n)) best = { e, n: r.length };
  return best?.e ?? null;
}

/* ═════════════════════════════ THE SHELL SPECS (the eight shells and their rails) ═════════════════════════════ */
const OBSERVATION_NAV: NavItem[] = [
  { href: '/observation', label: 'Overview', glyph: '◎' },
  { href: '/observation/sources', label: 'Sources', glyph: '⛁' },
  { href: '/observation/evidence', label: 'Evidence', glyph: '❑' },
  { href: '/observation/quarantine', label: 'Quarantine', glyph: '⚠' },
  { href: '/observation/corrections', label: 'Corrections', glyph: '⟳' },
  { href: '/intelligence', label: 'Intelligence', glyph: '❝' },
  { href: '/decisions', label: 'Decisions', glyph: '◆' },
  { href: '/decisions/briefings', label: 'Briefings', glyph: '☰' },
  { href: '/decisions/attention', label: 'Attention', glyph: '⚑' },
  { href: '/twins', label: 'Twins', glyph: '◫' },
  { href: '/graph', label: 'Graph', glyph: '◈' },
  { href: '/prediction', label: 'Prediction', glyph: '↗' },
];
/** The Decisions rail (the home's too — `/home` is its first line). Exported by decisions/layout.tsx as `NAV` (the home layout reuses it). */
export const DECISIONS_NAV: NavItem[] = [
  /* B36 (0094 §H) home: the executive home first (WS-01) */ { href: '/home', label: 'Home', glyph: '⌂' }, /* end B36 home */
  { href: '/decisions', label: 'Decisions', glyph: '◆' },
  { href: '/decisions/briefings', label: 'Briefings', glyph: '☰' },
  /* B80 integration (§CL-F) */ { href: '/decisions/packages/new', label: 'New package', glyph: '✚' }, /* end B80 */
  /* B35 analysis */ { href: '/decisions/analysis', label: 'Analysis', glyph: '⚖' }, /* end B35 analysis */
  { href: '/decisions/attention', label: 'Attention', glyph: '⚑' },
  { href: '/decisions/requests', label: 'Requests', glyph: '✎' },
  /* B32 (0089) health */ { href: '/decisions/health', label: 'Health', glyph: '◔' }, /* end B32 health */
  /* B34 (0090) workflow */ { href: '/decisions/tasks', label: 'Tasks', glyph: '☑' }, { href: '/decisions/workspaces', label: 'Workspaces', glyph: '⧉' },
  { href: '/decisions/workflow', label: 'Workflow', glyph: '⇄' }, /* end B34 workflow */
  /* B34 (0090) commitments */ { href: '/decisions/commitments', label: 'Commitments', glyph: '⇢' }, /* end B34 commitments */
  /* B36 (0094) gates */ { href: '/decisions/board', label: 'Board', glyph: '▣' }, /* end B36 gates */
  /* B36 (0094) publishing */ { href: '/decisions/publications', label: 'Publications', glyph: '⎙' }, /* end B36 publishing */
  /* B35 explanation */ { href: '/decisions/explanations', label: 'Explanations', glyph: '¶' }, /* end B35 explanation */
  /* B35 reopen */ { href: '/decisions/review', label: 'Review', glyph: '↺' }, /* end B35 reopen */
  /* B35 recommendation */ { href: '/decisions/recommendations', label: 'Recommendations', glyph: '⚖' }, /* end B35 recommendation */
  { href: '/twins', label: 'Twins', glyph: '◫' },
  { href: '/prediction', label: 'Prediction', glyph: '↗' },
  { href: '/graph', label: 'Graph', glyph: '◈' },
  { href: '/intelligence', label: 'Intelligence', glyph: '❝' },
  { href: '/observation', label: 'Observation', glyph: '⛁' },
];
const GRAPH_NAV: NavItem[] = [
  { href: '/graph', label: 'Overview', glyph: '◎' },
  { href: '/graph/search', label: 'Search', glyph: '⌕' },
  { href: '/graph/entities', label: 'Entities', glyph: '◈' },
  { href: '/graph/resolutions', label: 'Resolutions', glyph: '⚖' },
  { href: '/graph/explore', label: 'Explore', glyph: '⁂' },
  { href: '/graph/strategy', label: 'Strategy', glyph: '◇' },
  /* B32 (0089) graph */
  { href: '/graph/strategy/alignment', label: 'Alignment', glyph: '⋈' },
  /* B36 (0094 §P) planning */ { href: '/graph/strategy/planning', label: 'Planning', glyph: '▤' }, /* end B36 planning */
  /* B90 metrics */ { href: '/graph/data/metrics', label: 'Metrics', glyph: '∑' }, /* end B90 metrics */
  /* B92 (0113 §0) product analytics — the pages are the parts' (§MD the catalog, §UX the experience workspace, §OR the operating review) */
  { href: '/graph/data/analytics', label: 'Product analytics', glyph: '∿' },
  { href: '/graph/data/analytics/experience', label: 'Experience quality', glyph: '◐' },
  { href: '/graph/data/analytics/review', label: 'Operating review', glyph: '▣' },
  /* end B92 */
  /* B90 products */ { href: '/graph/data/products', label: 'Products', glyph: '▦' }, /* end B90 products */
  /* B90 catalog (0095 §K) */ { href: '/graph/data/catalog', label: 'Catalog', glyph: '⊟' }, /* end B90 catalog */
  /* B90 events */ { href: '/graph/data/events', label: 'Event products', glyph: '⇶' }, /* end B90 events */
  /* end B32 graph */
  { href: '/graph/impact', label: 'Impact', glyph: '⚠' },
  { href: '/graph/subscriptions', label: 'Subscriptions', glyph: '⟳' },
  { href: '/graph/memory', label: 'Memory', glyph: '▤' },
  { href: '/graph/retention', label: 'Retention', glyph: '⌛' },
  { href: '/graph/ontology', label: 'Ontology', glyph: '⊞' },
  /* B23 (0084) revision */ { href: '/graph/revisions', label: 'Revisions', glyph: '⊕' }, /* end B23 revision */
  { href: '/decisions', label: 'Decisions', glyph: '◆' },
  { href: '/decisions/briefings', label: 'Briefings', glyph: '☰' },
  { href: '/decisions/attention', label: 'Attention', glyph: '⚑' },
  { href: '/twins', label: 'Twins', glyph: '◫' },
  { href: '/prediction', label: 'Prediction', glyph: '↗' },
  { href: '/intelligence', label: 'Intelligence', glyph: '❝' },
  { href: '/observation', label: 'Observation', glyph: '⛁' },
];
const INTELLIGENCE_NAV: NavItem[] = [
  { href: '/intelligence', label: 'Overview', glyph: '◎' },
  { href: '/intelligence/claims', label: 'Claims', glyph: '❝' },
  { href: '/intelligence/review', label: 'Review', glyph: '⚖' },
  { href: '/intelligence/contradictions', label: 'Contradictions', glyph: '≠' },
  { href: '/intelligence/methods', label: 'Methods', glyph: '⚙' },
  { href: '/intelligence/gateway', label: 'Gateway', glyph: '⇄' },
  { href: '/decisions', label: 'Decisions', glyph: '◆' },
  { href: '/decisions/briefings', label: 'Briefings', glyph: '☰' },
  { href: '/decisions/attention', label: 'Attention', glyph: '⚑' },
  { href: '/twins', label: 'Twins', glyph: '◫' },
  { href: '/graph', label: 'Graph', glyph: '◈' },
  { href: '/prediction', label: 'Prediction', glyph: '↗' },
  { href: '/observation', label: 'Observation', glyph: '⛁' },
];
const PREDICTION_NAV: NavItem[] = [
  { href: '/prediction', label: 'Overview', glyph: '◎' },
  { href: '/prediction/forecasts', label: 'Forecasts', glyph: '↗' },
  { href: '/prediction/scenarios', label: 'Scenarios', glyph: '⑂' },
  { href: '/prediction/warnings', label: 'Warnings', glyph: '⚑' },
  /* B28 (0088) warnings */ { href: '/prediction/warnings/evaluations', label: 'Warning evaluation', glyph: '◑' }, /* end B28 warnings */
  { href: '/prediction/calibration', label: 'Calibration', glyph: '◐' },
  /* B25 ensembles */ { href: '/prediction/ensembles', label: 'Ensembles', glyph: '⧉' }, /* end B25 ensembles */
  /* B28 (0088) signals: the weak-signal workbench */ { href: '/prediction/signals', label: 'Weak signals', glyph: '≈' }, /* end B28 signals */
  /* B28 (0088) streams */ { href: '/prediction/streams', label: 'Streams', glyph: '≋' }, /* end B28 streams */
  /* B32 (0089) exposures: the risk and opportunity workspace (WS-09) */ { href: '/prediction/exposures', label: 'Risk & opportunity', glyph: '⇅' }, /* end B32 exposures */
  /* B25 context: the frozen information sets (each forecast's grounding and replay) */ { href: '/prediction/information-sets', label: 'Information sets', glyph: '⧉' }, /* end B25 context */
  /* B25 registry */ { href: '/prediction/registry', label: 'Forecasting portfolio', glyph: '⊞' }, /* end B25 registry */
  /* B33 (0111 §0.9): the domain intelligence workspace (WS-10; §PK's page, §CI's competitors beneath it) */ { href: '/prediction/domains', label: 'Domains', glyph: '◇' }, /* end B33 */
  { href: '/decisions', label: 'Decisions', glyph: '◆' },
  { href: '/decisions/briefings', label: 'Briefings', glyph: '☰' },
  { href: '/decisions/attention', label: 'Attention', glyph: '⚑' },
  { href: '/twins', label: 'Twins', glyph: '◫' },
  { href: '/graph', label: 'Graph', glyph: '◈' },
  { href: '/intelligence', label: 'Intelligence', glyph: '❝' },
  { href: '/observation', label: 'Observation', glyph: '⛁' },
];
const TWINS_NAV: NavItem[] = [
  { href: '/decisions', label: 'Decisions', glyph: '◆' },
  { href: '/decisions/briefings', label: 'Briefings', glyph: '☰' },
  { href: '/decisions/attention', label: 'Attention', glyph: '⚑' },
  { href: '/twins', label: 'Twins', glyph: '◫' },
  { href: '/twins/simulations', label: 'Simulations', glyph: '⟳' },
  /* B29 (0092) §D */ { href: '/twins/constraints', label: 'Constraints', glyph: '⊨' },
  /* B30 branches */ { href: '/twins/explorer', label: 'Explorer', glyph: '⑂' }, /* end B30 branches */
  /* B30 envelope */ { href: '/twins/models', label: 'Models', glyph: '⚖' }, /* end B30 envelope */
  /* B30 estimation */ { href: '/twins/reconciliation', label: 'Reconciliation', glyph: '⇄' }, /* end B30 estimation */
  /* B30 experiments */ { href: '/twins/simulations/fabric', label: 'Fabric experiments', glyph: '⧉' }, /* end B30 experiments */
  /* B33 (0111 §0.9): the supply-chain intelligence workspace (§SC's page) */ { href: '/twins/supply', label: 'Supply network', glyph: '⋔' }, /* end B33 */
  { href: '/prediction', label: 'Prediction', glyph: '↗' },
  { href: '/graph', label: 'Graph', glyph: '◈' },
  { href: '/intelligence', label: 'Intelligence', glyph: '❝' },
  { href: '/observation', label: 'Observation', glyph: '⛁' },
];
/** The admin rail's message keys (its labels are the catalogue's — messages/en.json; no glyph: the admin rail never collapses to icons). */
export const ADMIN_NAV_KEYS: ReadonlyArray<{ href: string; key: string }> = [
  { href: '/admin', key: 'nav.overview' },
  { href: '/admin/tenants', key: 'nav.tenants' },
  { href: '/admin/principals', key: 'nav.principals' },
  { href: '/admin/objects', key: 'nav.objects' },
  { href: '/admin/audit', key: 'nav.audit' },
  /* B91 entitlements */ { href: '/admin/commercial/catalog', key: 'nav.commercial.catalog' }, /* end B91 entitlements */
  /* B91 grace */ { href: '/admin/commercial', key: 'nav.commercial.entitlement' }, /* end B91 grace */
  /* B91 ledger */ { href: '/admin/commercial/ledger', key: 'nav.commercial.ledger' }, /* end B91 ledger */
  /* B91 meters */ { href: '/admin/commercial/usage', key: 'nav.commercial.usage' }, /* end B91 meters */
  /* B94 §0 (WS-20: the product delivery workspace — onboarding, migration, implementation, service, customer success, the control center) */
  { href: '/admin/onboarding', key: 'nav.delivery.onboarding' },
  { href: '/admin/onboarding/migration', key: 'nav.delivery.migration' },
  { href: '/admin/implementation', key: 'nav.delivery.implementation' },
  { href: '/admin/service', key: 'nav.delivery.service' },
  { href: '/admin/customer-success', key: 'nav.delivery.success' },
  { href: '/admin/control-center', key: 'nav.delivery.control' },
  /* end B94 §0 */
  /* B107 §0 (the product-governance workspace, its registries, conformance, acceptance records and design governance) */
  { href: '/admin/governance', key: 'nav.governance.workspace' },
  { href: '/admin/governance/registries', key: 'nav.governance.registries' },
  { href: '/admin/governance/conformance', key: 'nav.governance.conformance' },
  { href: '/admin/governance/acceptance', key: 'nav.governance.acceptance' },
  { href: '/admin/governance/design', key: 'nav.governance.design' },
  /* B80 integration (§TK, §CL-D) */ { href: '/admin/governance/design/themes', key: 'nav.governance.themes' }, { href: '/admin/governance/design/tokens', key: 'nav.governance.tokens' }, { href: '/admin/governance/design/catalogue', key: 'nav.governance.catalogue' }, /* end B80 */
  /* end B107 §0 */
  /* B107 ownership */ { href: '/admin/governance/ownership', key: 'nav.governance.ownership' }, /* end B107 ownership */
];
export function adminNav(locale: Locale = defaultLocale): NavItem[] {
  return ADMIN_NAV_KEYS.map((n) => ({ href: n.href, label: t(n.key, locale), glyph: '' }));
}

/** THE EIGHT SHELLS. `navName` is the rail's accessible name — a CONTRACT of the hosted suites (b80-seams WORKSPACE_NAV_NAMES), never renamed. */
export function shellSpec(key: WorkspaceKey, locale: Locale = defaultLocale): WorkspaceSpec {
  const navName = WORKSPACE_NAV_NAMES[key];
  switch (key) {
    case 'admin': return { key, title: t('app.title', locale), navName, homeHref: '/admin', scope: 'PLATFORM', nav: adminNav(locale) };
    case 'home': return { key, title: 'Decisions', navName, homeHref: '/home', scope: 'DOMAIN', nav: DECISIONS_NAV };
    case 'decisions': return { key, title: 'Decisions', navName, homeHref: '/decisions', scope: 'DOMAIN', nav: DECISIONS_NAV };
    case 'graph': return { key, title: 'Graph', navName, homeHref: '/graph', scope: 'DOMAIN', nav: GRAPH_NAV };
    case 'intelligence': return { key, title: 'Intelligence', navName, homeHref: '/intelligence', scope: 'DOMAIN', nav: INTELLIGENCE_NAV };
    case 'observation': return { key, title: 'Observation Operations', navName, homeHref: '/observation', scope: 'DOMAIN', nav: OBSERVATION_NAV };
    case 'prediction': return { key, title: 'Prediction', navName, homeHref: '/prediction', scope: 'DOMAIN', nav: PREDICTION_NAV };
    case 'twins': return { key, title: 'Twins', navName, homeHref: '/twins', scope: 'DOMAIN', nav: TWINS_NAV };
  }
}
/**
 * What the shell hands its ThemeScope slot: the tenant AND the working domain. A domain-bound principal holds no TENANT binding, so the theme
 * in force is read on the DOMAIN route (governance.design.theme.in_force.read is admitted there); without the domain the read is refused and
 * every domain workspace falls back to the core theme (found in the B80 act's rehearsal walk). The PLATFORM workspace (scope null) reads none.
 */
export function themeScopeOf(scope: ShellScope | null): { tenantId: string | null; domainId: string | null } {
  return { tenantId: scope?.tenantId ?? null, domainId: scope?.domainId ?? null };
}
export const SHELL_KEYS: readonly WorkspaceKey[] = ['admin', 'home', 'decisions', 'graph', 'intelligence', 'observation', 'prediction', 'twins'];
/** The shell whose locations a path is (by its first segment), or null for a path no shell owns (/login, /). */
export function shellOfPath(pathname: string): WorkspaceKey | null {
  const seg = pathname.split('/')[1] ?? '';
  return (SHELL_KEYS as readonly string[]).includes(seg) ? (seg as WorkspaceKey) : null;
}

/* ═════════════════════════════ THE NAV MODEL ═════════════════════════════ */
/** The ONE active rail item: the LONGEST item that is the path or a parent of it (so /graph/strategy/alignment is Alignment, not Strategy too). */
export function activeHref(nav: readonly NavItem[], pathname: string): string | null {
  let best: string | null = null;
  for (const n of nav) if (under(pathname, n.href) && (best === null || n.href.length > best.length)) best = n.href;
  return best;
}
export interface Crumb { label: string; href: string | null; current: boolean }
const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const words = (seg: string) => { const s = decodeURIComponent(seg).replace(/[-_]+/g, ' ').trim(); return s === '' ? seg : s.charAt(0).toUpperCase() + s.slice(1); };
/**
 * The breadcrumb: the workspace, the rail item the path is under (when it is not the home), then the deeper segments (an id is shown as
 * "record 0123abcd…"); the last crumb is the current page (aria-current, not a link). Built from the rail and the path only — a crumb names
 * where the page is, never whether the reader may do anything there.
 */
export function breadcrumbOf(spec: WorkspaceSpec, pathname: string): Crumb[] {
  const crumbs: Crumb[] = [{ label: spec.title, href: spec.homeHref, current: false }];
  const active = activeHref(spec.nav, pathname);
  let base = spec.homeHref;
  if (active !== null && active !== spec.homeHref) {
    crumbs.push({ label: spec.nav.find((n) => n.href === active)?.label ?? words(active.split('/').pop() ?? ''), href: active, current: false });
    base = active;
  }
  if (under(pathname, base) && pathname !== base) {
    for (const seg of pathname.slice(base.length).split('/').filter((s) => s !== '')) {
      base = `${base}/${seg}`;
      crumbs.push({ label: UUIDISH.test(seg) ? `record ${seg.slice(0, 8)}…` : words(seg), href: base, current: false });
    }
  }
  const last = crumbs[crumbs.length - 1]!;
  crumbs[crumbs.length - 1] = { ...last, href: null, current: true };
  return crumbs;
}

/* ═════════════════════════════ IN-APP LOCATIONS (the SQL route_ok, mirrored) ═════════════════════════════ */
const PATH_RE = /^\/[A-Za-z0-9/_.~%-]*$/;
const QUERY_RE = /^[A-Za-z0-9=&_.~%+:,-]*$/;
/** An absolute in-app location: never a scheme, a host, `//` or `..`; an optional plain query. The server applies the same rule. */
export function safeLocation(v: unknown): string | null {
  if (typeof v !== 'string' || v.length < 1 || v.length > 600 || v.includes('//') || v.includes('..')) return null;
  const q = v.indexOf('?');
  const path = q < 0 ? v : v.slice(0, q); const query = q < 0 ? '' : v.slice(q + 1);
  return PATH_RE.test(path) && QUERY_RE.test(query) ? v : null;
}
/** The query without the shell's own parameters (the return token is the shell's, never part of a page's state). */
export function withoutShellParams(search: string): string {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  p.delete('from');
  const s = p.toString();
  return s === '' ? '' : `?${s}`;
}

/* ═════════════════════════════ THE HISTORY STACK (the tab's own) ═════════════════════════════ */
export interface HistoryEntry { route: string; title: string; workspace: WorkspaceKey | null; at: string; verified: boolean }
export interface HistoryState { entries: HistoryEntry[]; index: number }
export const HISTORY_MAX = 30;
export const EMPTY_HISTORY: HistoryState = { entries: [], index: -1 };
/**
 * A visit: the same location again changes nothing; the location one step back is a BACK move (the index moves, nothing is pushed); the
 * location one step forward is a FORWARD move; anything else truncates the forward branch and is pushed (capped at HISTORY_MAX, oldest out).
 */
export function historyVisit(s: HistoryState, e: HistoryEntry): HistoryState {
  const cur = s.entries[s.index];
  if (cur !== undefined && cur.route === e.route) return { entries: s.entries.map((x, i) => (i === s.index ? { ...x, verified: x.verified || e.verified, title: e.title || x.title } : x)), index: s.index };
  if (s.entries[s.index - 1]?.route === e.route) return { entries: s.entries, index: s.index - 1 };
  if (s.entries[s.index + 1]?.route === e.route) return { entries: s.entries, index: s.index + 1 };
  const kept = [...s.entries.slice(0, s.index + 1), e];
  const over = Math.max(0, kept.length - HISTORY_MAX);
  return { entries: kept.slice(over), index: kept.length - 1 - over };
}
/** Mark the current location VERIFIED (the shell rendered it on the server's answer about who this is). */
export function historyVerify(s: HistoryState): HistoryState {
  return s.index < 0 ? s : { entries: s.entries.map((x, i) => (i === s.index ? { ...x, verified: true } : x)), index: s.index };
}
export const historyBack = (s: HistoryState): HistoryEntry | null => s.entries[s.index - 1] ?? null;
export const historyForward = (s: HistoryState): HistoryEntry | null => s.entries[s.index + 1] ?? null;
/** The last location the shell VERIFIED before the current one — where an unverifiable state restores to (PR-05-005, UX-11-005). */
export function lastVerifiedLocation(s: HistoryState, exceptRoute?: string): HistoryEntry | null {
  for (let i = s.entries.length - 1; i >= 0; i -= 1) { const e = s.entries[i]!; if (e.verified && e.route !== exceptRoute) return e; }
  return null;
}
/** The stored stack, validated entry by entry (a tampered or foreign entry is dropped, never followed). */
export function parseHistory(raw: string | null): HistoryState {
  if (raw === null) return EMPTY_HISTORY;
  try {
    const v = JSON.parse(raw) as { entries?: unknown; index?: unknown };
    if (!Array.isArray(v.entries) || typeof v.index !== 'number') return EMPTY_HISTORY;
    const entries = (v.entries as Array<Record<string, unknown>>).filter((e) => e !== null && typeof e === 'object' && safeLocation(e['route']) !== null)
      .slice(-HISTORY_MAX).map((e) => ({ route: String(e['route']), title: typeof e['title'] === 'string' ? (e['title'] as string).slice(0, 160) : '',
        workspace: shellOfPath(String(e['route']).split('?')[0] ?? ''), at: typeof e['at'] === 'string' ? (e['at'] as string) : '', verified: e['verified'] === true }));
    return { entries, index: Math.min(Math.max(-1, Math.trunc(v.index)), entries.length - 1) };
  } catch { return EMPTY_HISTORY; }
}

/* ═════════════════════════════ THE RETURN TOKEN (PAT-26) ═════════════════════════════ */
export interface ReturnToken { path: string; title: string; workspace: WorkspaceKey | null; focus: string | null }
const FOCUS_RE = /^[A-Za-z][A-Za-z0-9_:-]{0,80}$/;
const b64url = (s: string) => {
  const bytes = new TextEncoder().encode(s); let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const unb64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};
/** The token a cross-workspace move carries (`from=`): where it came from, its title and the element to give focus back to. */
export function encodeReturnToken(r: ReturnToken): string | null {
  const path = safeLocation(r.path);
  if (path === null) return null;
  return b64url(JSON.stringify({ p: path, t: r.title.slice(0, 120), f: r.focus !== null && FOCUS_RE.test(r.focus) ? r.focus : null }));
}
/** The token read back — validated: an unknown field, a foreign location or a malformed token is refused (null), never followed. */
export function decodeReturnToken(raw: string | null | undefined): ReturnToken | null {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > 1200 || !/^[A-Za-z0-9_-]+$/.test(raw)) return null;
  try {
    const v = JSON.parse(unb64url(raw)) as Record<string, unknown>;
    if (v === null || typeof v !== 'object' || Object.keys(v).some((k) => !['p', 't', 'f'].includes(k))) return null;
    const path = safeLocation(v['p']);
    if (path === null) return null;
    const focus = typeof v['f'] === 'string' && FOCUS_RE.test(v['f'] as string) ? (v['f'] as string) : null;
    return { path, title: typeof v['t'] === 'string' ? (v['t'] as string).slice(0, 120) : '', workspace: shellOfPath(path.split('?')[0] ?? ''), focus };
  } catch { return null; }
}
/** An href carrying a return token (`from=`) to the place it was opened from — the visible route back of a cross-workspace move. */
export function withReturn(href: string, from: ReturnToken): string {
  const tok = encodeReturnToken(from);
  if (tok === null) return href;
  return `${href}${href.includes('?') ? '&' : '?'}from=${tok}`;
}

/* ═════════════════════════════ THE DEEP-LINK CODEC (PAT-25, UX-15-001…005) ═════════════════════════════ */
export const DEEP_LINK_KINDS = ['warning', 'evidence', 'source', 'data_product', 'forecast_grounding'] as const;
export type DeepLinkKind = (typeof DEEP_LINK_KINDS)[number];
export interface DeepLink { kind: DeepLinkKind; id: string; version: number | null; asOf: string | null; from: ReturnToken | null }
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
/** What each kind resolves to, and whether its as-of is honoured by a read (a kind without one says so — Q11: never silently ignored). */
export const DEEP_LINK_TARGETS: Readonly<Record<DeepLinkKind, { path: (id: string) => string; asOf: 'honoured' | 'immutable' | 'live_only'; canonical: string }>> = {
  warning: { path: () => '/prediction/warnings/as-of', asOf: 'honoured', canonical: '/prediction/warnings' },
  evidence: { path: (id) => `/observation/evidence/${id}`, asOf: 'immutable', canonical: '/observation/evidence' },
  source: { path: (id) => `/observation/sources/${id}`, asOf: 'live_only', canonical: '/observation/sources' },
  data_product: { path: (id) => `/graph/data/products/${id}`, asOf: 'live_only', canonical: '/graph/data/products' },
  forecast_grounding: { path: (id) => `/prediction/forecasts/${id}/grounding`, asOf: 'live_only', canonical: '/prediction/forecasts' },
};
/** The in-app href of a deep link: the object, its version, its as-of instant and the return token — or null for a link that cannot be made. */
export function encodeDeepLink(l: DeepLink): string | null {
  if (!(DEEP_LINK_KINDS as readonly string[]).includes(l.kind) || !UUIDISH.test(l.id)) return null;
  if (l.asOf !== null && (!ISO.test(l.asOf) || Number.isNaN(Date.parse(l.asOf)))) return null;
  if (l.version !== null && !(Number.isInteger(l.version) && l.version >= 1)) return null;
  const target = DEEP_LINK_TARGETS[l.kind];
  const q = new URLSearchParams();
  if (l.kind === 'warning') q.set('warning', l.id);
  if (l.version !== null) q.set('v', String(l.version));
  if (l.asOf !== null) q.set('at', l.asOf);
  const href = `${target.path(l.id)}${q.toString() === '' ? '' : `?${q.toString()}`}`;
  return l.from === null ? href : withReturn(href, l.from);
}
export type DeepLinkProblem = 'kind' | 'id' | 'version' | 'instant';
/** A warning deep link read back from its query (the page's own parameters), or the reason it cannot be opened. */
export function decodeWarningLink(search: string): { link: DeepLink } | { problem: DeepLinkProblem } {
  const p = new URLSearchParams(search.startsWith('?') ? search.slice(1) : search);
  const id = p.get('warning') ?? '';
  if (!UUIDISH.test(id)) return { problem: 'id' };
  const v = p.get('v'); const at = p.get('at');
  if (v !== null && !/^[1-9][0-9]{0,8}$/.test(v)) return { problem: 'version' };
  if (at === null || !ISO.test(at) || Number.isNaN(Date.parse(at))) return { problem: 'instant' };
  return { link: { kind: 'warning', id, version: v === null ? null : Number(v), asOf: at, from: decodeReturnToken(p.get('from')) } };
}
/** The outcome classes of opening a link — UX-15-005: an unavailable state is said, with the nearest safe canonical state, and nothing more. */
export type LinkOutcome = 'exact' | 'drifted' | 'not_replayable' | 'future' | 'unavailable' | 'invalid' | 'error';
export function linkOutcome(r: { ok: boolean; status: number; error?: { message: string } }, variance?: { exact?: unknown } | null): LinkOutcome {
  if (r.ok) return variance?.exact === true ? 'exact' : 'drifted';
  const m = r.error?.message ?? '';
  if (/rejected \(not_replayable\)/.test(m)) return 'not_replayable';
  if (/rejected \(future\)/.test(m)) return 'future';
  if (/rejected \(instant\)/.test(m)) return 'invalid';
  if (/rejected \(unknown_[a-z_]+\)/.test(m) || r.status === 403 || r.status === 404) return 'unavailable';
  return 'error';
}
/** What the page says for each outcome (the server's own words are shown beside it, never replaced). */
export const LINK_OUTCOME_WORDS: Readonly<Record<LinkOutcome, string>> = {
  exact: 'This is the exact recorded state: nothing was recorded after the link\'s instant.',
  drifted: 'This is the state recorded as of the link\'s instant. Later events exist — the variance against the current declared state is listed below.',
  not_replayable: 'The link names an instant before this record\'s history begins, so there is no recorded state to open. The current state is offered instead.',
  future: 'The link names an instant in the future; only a recorded state can be opened.',
  unavailable: 'This link cannot be opened for you. Nothing is said about whether the record exists.',
  invalid: 'The link is malformed: it does not name a record and an instant with its zone.',
  error: 'The link could not be resolved. Nothing was changed.',
};

/* ═════════════════════════════ THE NAVIGATION GUARD (PR-05-003, UX-09-004, UX-11-004, UX-15-004) ═════════════════════════════ */
/** Every server action the shell may issue. Reads, and ONE personal write the person asks for; never a business write. */
export const SHELL_ACTIONS = { reads: ['identity.self.read', 'shell.navigation.read', 'prediction.read'], personal: ['shell.navigation.save'] } as const;
export const SHELL_ACTION_SET: ReadonlySet<string> = new Set([...SHELL_ACTIONS.reads, ...SHELL_ACTIONS.personal]);
export interface PaletteEntry { kind: 'navigate'; href: string; label: string; detail: string; workspace: WorkspaceKey | null; registry: WorkspaceId | null }
/** The palette's entries: every rail item of every shell and every registry route — NAVIGATIONS ONLY (CMP-015 at B80; intent and search are B81's). */
export function paletteEntries(locale: Locale = defaultLocale): PaletteEntry[] {
  const seen = new Set<string>(); const out: PaletteEntry[] = [];
  const add = (href: string, label: string, detail: string) => {
    if (seen.has(href) || safeLocation(href) === null) return;
    seen.add(href);
    out.push({ kind: 'navigate', href, label, detail, workspace: shellOfPath(href), registry: registryEntryFor(href)?.id ?? null });
  };
  for (const key of SHELL_KEYS) { const s = shellSpec(key, locale); for (const n of s.nav) if (under(n.href, `/${s.homeHref.split('/')[1]}`)) add(n.href, n.label, s.title); }
  for (const e of WORKSPACE_REGISTRY) for (const r of e.routes) add(r, e.title, `${e.id} · ${e.purpose}`);
  return out;
}
/* B81 si — THE GUARD EVOLVED (UX-13-004, UX-ADR-008): the palette EXECUTES NOTHING. B80's rule was "navigation only"; B81's palette also
   searches, reads intent and finds commands — so an entry navigates (navigate · search · ask · goto) or HANDS OFF a command to its page's
   Command Review (an in-app href naming the action under `review=`, §HA's commandHandoff), and no entry carries a function. §HA's
   assertNoExecution is the rule; this name stays for B80's callers and its words keep "navigation only" for what the palette does itself. */
/** The guard: an entry navigates, or hands a command off to the page's Command Review — the palette itself executes nothing. */
export function assertNavigationOnly(entries: ReadonlyArray<{ kind: string }>): void {
  try { assertNoExecution(entries as unknown as ReadonlyArray<Record<string, unknown>>); } catch (e) {
    throw new Error(`the shell offers navigation only — a command is handed off to its page's Command Review, never executed here: ${e instanceof Error ? e.message : String(e)}`);
  }
}
/* end B81 si */
/** The palette's filter: every word of the query in the label or the detail (case-insensitive), label matches first, at most `limit`. */
export function filterPalette(entries: readonly PaletteEntry[], query: string, limit = 12): PaletteEntry[] {
  const ws = query.toLowerCase().split(/\s+/).filter((w) => w !== '');
  if (ws.length === 0) return entries.slice(0, limit);
  const hit = entries.filter((e) => ws.every((w) => `${e.label} ${e.detail} ${e.href}`.toLowerCase().includes(w)));
  const score = (e: PaletteEntry) => (ws.every((w) => e.label.toLowerCase().includes(w)) ? 0 : 1);
  return [...hit].sort((a, b) => score(a) - score(b) || a.label.localeCompare(b.label)).slice(0, limit);
}
/** The palette's active option after a key (wraps; Home/End). */
export function movePaletteIndex(index: number, key: string, count: number): number {
  if (count <= 0) return -1;
  if (key === 'ArrowDown') return (index + 1) % count;
  if (key === 'ArrowUp') return (index - 1 + count) % count;
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  return Math.min(Math.max(index, 0), count - 1);
}

/* ═════════════════════════════ TABS (CMP-014) ═════════════════════════════ */
/** Roving focus over a tab list: arrows move (mirrored under RTL for a horizontal list), Home/End jump; disabled tabs are skipped. */
export function nextTabIndex(index: number, key: string, disabled: readonly boolean[], opts: { orientation?: 'horizontal' | 'vertical'; rtl?: boolean } = {}): number {
  const n = disabled.length;
  if (n === 0) return -1;
  const horizontal = (opts.orientation ?? 'horizontal') === 'horizontal';
  let step = 0;
  if (key === 'Home' || key === 'End') {
    const order = key === 'Home' ? [...Array(n).keys()] : [...Array(n).keys()].reverse();
    return order.find((i) => !disabled[i]) ?? index;
  }
  if (horizontal && (key === 'ArrowRight' || key === 'ArrowLeft')) step = (key === 'ArrowRight') !== (opts.rtl === true) ? 1 : -1;
  else if (!horizontal && (key === 'ArrowDown' || key === 'ArrowUp')) step = key === 'ArrowDown' ? 1 : -1;
  else return index;
  for (let k = 1; k <= n; k += 1) { const i = (index + step * k + n * n) % n; if (!disabled[i]) return i; }
  return index;
}

/* ═════════════════════════════ THE SHELL STATUS (UX-09-005, PR-05-005) ═════════════════════════════ */
export type ShellPhase = 'verifying' | 'ready' | 'degraded' | 'unverified' | 'signed_out';
export interface ShellStatus { phase: ShellPhase; frozen: boolean; regions: string[]; statement: string }
/**
 * What the shell can say about itself. UNVERIFIED (the server did not confirm who this is, or which scope) FREEZES everything — the shell
 * renders no workspace (fail closed) and offers the last verified location and the way back to sign-in. DEGRADED (the readiness check
 * failing) is DECLARED — every consequential write still fails closed at the pipeline when its audit cannot be made durable; the shell does
 * not pretend to know more than the check says.
 */
export function shellStatus(a: { session: boolean; verified: boolean | null; problem: string | null; health: string | null }): ShellStatus {
  if (!a.session) return { phase: 'signed_out', frozen: true, regions: ['session'], statement: 'no session — sign in to open a workspace' };
  if (a.problem !== null) return { phase: 'unverified', frozen: true, regions: ['identity', 'scope', 'workspace'], statement: `the server did not confirm this session's scope: ${a.problem}` };
  if (a.verified !== true) return { phase: 'verifying', frozen: true, regions: ['identity', 'scope'], statement: 'waiting for the server to confirm who this is and which scope it works in' };
  if (a.health !== null && a.health !== 'ok') return { phase: 'degraded', frozen: false, regions: ['service'], statement: `the readiness check reports ${a.health}: writes whose audit cannot be made durable are refused by the server` };
  return { phase: 'ready', frozen: false, regions: [], statement: 'the session, the scope and the service are confirmed' };
}

/* ═════════════════════════════ THE SHELL STATE (UX-09-002) ═════════════════════════════ */
export interface ShellStateLine { label: string; value: string }
/** The dimensions the banner keeps explicit (the context bar adds objective / horizon / scenario / classification / effective time — §CB). */
export function shellStateLines(a: { workspace: WorkspaceKey; tenantId: string | null; domainId: string | null; roles: readonly string[]; working: boolean; status: ShellStatus }): ShellStateLine[] {
  const short = (v: string | null) => (v === null ? 'PLATFORM' : `${v.slice(0, 8)}…`);
  return [
    { label: 'workspace', value: shellSpec(a.workspace).title },
    { label: 'tenant', value: short(a.tenantId) },
    { label: 'domain', value: a.domainId === null ? '—' : `${short(a.domainId)}${a.working ? ' (working domain)' : ''}` },
    { label: 'roles', value: a.roles.length === 0 ? 'no role binding' : a.roles.join(' · ') },
    { label: 'service', value: a.status.phase },
  ];
}

/* ═════════════════════════════ THE CLIENT (0118_b80_x_sh) ═════════════════════════════ */
type Receipt = { policyDecisionId: string; auditSeq: number };
export interface SavedLocation { route: string; section?: string; query?: string; filters?: Record<string, string>; view?: string; title?: string;
  selection?: Array<{ kind: string; id: string; version?: number }>; object?: { kind: string; id: string; version?: number; as_of?: string } | null; task?: { kind: string; id: string } | null }
export interface NavigationVersion { state_id: string; version: number; supersedes: string | null; location: SavedLocation; return_path: string | null; focus_target: string | null;
  recent: Array<{ route: string; title?: string }>; favorites: Array<{ route: string; title?: string }>; digest: string; saved_at: string }
export interface NavigationRead { principal_id: string; scope: string; read_at: string; claim: string;
  workspaces: Array<{ workspace: WorkspaceKey; current: NavigationVersion; versions: number; history: Array<{ state_id: string; version: number; route: string; digest: string; saved_at: string }> }> }
export interface SaveIntake { workspace: WorkspaceKey; expectedVersion: number; location: SavedLocation; returnPath: string | null; focus: string | null;
  recent: Array<{ route: string; title?: string }>; favorites: Array<{ route: string; title?: string }> }
const base = (s: ShellScope | null) => (s === null ? '/v1/shell' : `/v1/tenants/${s.tenantId}/domains/${s.domainId}/shell`);
const env = (s: ShellScope | null, action: string, objectType: string, objectId: string | null = null) => ({
  scope: (s === null ? 'PLATFORM' : 'DOMAIN') as 'PLATFORM' | 'DOMAIN', tenant_id: s?.tenantId ?? null, domain_id: s?.domainId ?? null, action, object_type: objectType, object_id: objectId,
  side_effect_class: (action.endsWith('.read') ? 'none' : 'reversible') as 'none' | 'reversible', consequence_class: 'C1' as const, purpose_id: 'navigation',
});
/** The caller's OWN navigation states (the PLATFORM ones for the admin workspace — `scope` null). */
export function readNavigation(s: ShellScope | null, workspace: WorkspaceKey | null, history = 5): Promise<ApiResult<{ navigation: NavigationRead; receipt: Receipt }>> {
  return call(`${base(s)}/navigation/read`, env(s, 'shell.navigation.read', 'NAV'), { workspace, history });
}
/** A new version of where the person stands in one workspace — asked for by the person; refused `(stale)` when it read an older version. */
export function saveNavigation(s: ShellScope | null, intake: SaveIntake): Promise<ApiResult<{ navigation: NavigationVersion & { workspace: WorkspaceKey }; receipt: Receipt }>> {
  return call(`${base(s)}/navigation/save`, env(s, 'shell.navigation.save', 'NAV'), intake);
}
export interface WarningAsOf {
  warning_id: string; at: string; read_at: string; first_event_at: string; claim: string;
  as_of: { state: string; title: string | null; level: string | null; urgency: string | null; confidence: unknown; closes_at: string | null; routed_to: string | null;
           context_version: number; event_count: number; last_event: { event_id: string; event: string; occurred_at: string } | null; events: Array<{ event_id: string; event: string; occurred_at: string }> };
  current: { state: string; title: string; level: string | null; context_version: number; event_count: number; attention_state: string; last_event: { event_id: string; event: string; occurred_at: string } | null };
  variance: { exact: boolean; events_since: number; changed: Array<{ field: string; as_of: unknown; current: unknown }>; statement: string };
}
/** The deep link's read: the warning AS OF the instant (reads only — opening a link acknowledges nothing). */
export function warningAsOf(s: ShellScope, warningId: string, at: string): Promise<ApiResult<{ warning: WarningAsOf; receipt: Receipt }>> {
  return call(`${base(s)}/links/warnings/${encodeURIComponent(warningId)}/as-of`, env(s, 'prediction.read', 'WRN', warningId), { at });
}
