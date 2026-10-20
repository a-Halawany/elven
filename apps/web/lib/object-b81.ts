/**
 * CP-6 B81 §OB (F-P7-E-06: UX-12-001…005, UX-25-001…005, CMP-017…020, PAT-01, PAT-12, OBJ-04, UX-ADR-004, REL-04, LS-01…12) — THE OBJECT
 * MODEL of the canonical header, as PURE functions (the web has no DOM test environment; components/object.tsx renders exactly what these
 * decide, and the walk proves the rendering).
 *
 *   · THE OBJECT-TYPE REGISTRY: every canonical object type the server serves through a get route — its read route and PDP action, the page
 *     that opens it (or, for a type without one, the stage that carries it — never silently omitted, Q13), its lifecycle map, its as-of
 *     support and its header commands;
 *   · THE LIFECYCLE CATALOGUE LS-01…12 (Volume 9): a title-case label, a glyph and a definition per state, and per type the map from the
 *     SERVER's own state word to an LS code. A server state with no catalogue equivalent is shown in the server's words with the reason —
 *     nothing is mapped by resemblance, no new state semantics are introduced, and a lifecycle reading is NEVER derived from a truth state
 *     (the truth badge is a separate element: `disputed`, for instance, is a truth marking, not a lifecycle state);
 *   · THE HEADER ADAPTER: the fields every object header shows (type, canonical name, immutable id, version, owner, lifecycle, truth, time,
 *     classification, trust status, authority, relationships, provenance, the read's own record) — each one either resolved from the record or
 *     marked UNRESOLVED; an object whose identity, version, owner or state cannot be resolved is INDETERMINATE: the last verified version is
 *     kept, its mutating commands are disabled with the reason, and the reconciliation route is named (UX-12-005, UX-25-005);
 *   · THE COMMANDS: inspect, compare, relate, propose, review, correct, export, replay — each a NAVIGATION to the canonical service's page where
 *     the governed act lives behind its own gate, or ABSENT with its carrier. The header issues no write itself (UX-12-004): it holds no port;
 *   · THE DURABLE REFERENCE: `eye:<TYPE>:<id>[:v<version>][@<instant>]`, parsed back exactly or refused — a reference never resolves to
 *     something else.
 *
 * Presentation never changes meaning: prominence, emphasis or elevation evidence nothing (UX-25-004) — approval is shown as an explicit
 * authority statement read from the record. CONSTRUCTION only: nothing here is demonstrated or accepted; records in tests are SYNTHETIC.
 */
import type { LifecycleState, ObjectTypeSpec } from './b81-seams';
import type { EffectiveTimeSupport } from './b80-seams';
/* B82 ts */ import { freshnessView, truthGate, type FreshnessInput, type PendingCommand, type StatePolicy, type TruthInput } from './truth-b82'; /* end B82 ts */

/* ═════════════════════════════ THE LIFECYCLE CATALOGUE (Volume 9 LS-01…12) ═════════════════════════════ */
export interface LifecycleDef { code: LifecycleState; label: string; definition: string; glyph: string }
/** The catalogue: the label is title case; the glyph is decorative beside the visible label (never the only cue) and shares no glyph with the truth set. */
export const LIFECYCLE_STATES: readonly LifecycleDef[] = [
  { code: 'LS-01', label: 'Draft', definition: 'Authoring; not review-active', glyph: '○' },
  { code: 'LS-02', label: 'Proposed', definition: 'Submitted for governed review', glyph: '◔' },
  { code: 'LS-03', label: 'In Review', definition: 'Named review is active', glyph: '◑' },
  { code: 'LS-04', label: 'Approved', definition: 'Eligible authority approved exact version', glyph: '◕' },
  { code: 'LS-05', label: 'Published', definition: 'Approved version made effective for audience', glyph: '◉' },
  { code: 'LS-06', label: 'Superseded', definition: 'Replaced by a newer effective version', glyph: '⇢' },
  { code: 'LS-07', label: 'Corrected', definition: 'Material correction linked to prior version', glyph: '↺' },
  { code: 'LS-08', label: 'Withdrawn', definition: 'Removed from current use but preserved', glyph: '⊖' },
  { code: 'LS-09', label: 'Archived', definition: 'Retained for history; no active change', glyph: '▣' },
  { code: 'LS-10', label: 'Retired', definition: 'No longer supported or admitted', glyph: '⊗' },
  { code: 'LS-11', label: 'Degraded', definition: 'Available with declared limitations', glyph: '◒' },
  { code: 'LS-12', label: 'Blocked', definition: 'Required condition prevents transition', glyph: '⊠' },
];
export const LIFECYCLE: Readonly<Record<LifecycleState, LifecycleDef>> = Object.fromEntries(LIFECYCLE_STATES.map((d) => [d.code, d])) as Record<LifecycleState, LifecycleDef>;
/** The truth vocabulary (TS-01…10 and the tags). A lifecycle map never maps one of these words: truth is shown by the truth badge alone. */
export const TRUTH_ONLY_WORDS: readonly string[] = ['observed', 'asserted', 'extracted', 'inferred', 'assessed', 'synthetic', 'recommended', 'decided', 'disputed', 'indeterminate'];

/* ═════════════════════════════ THE OBJECT-TYPE REGISTRY ═════════════════════════════ */
export const COMMAND_VERBS = ['inspect', 'compare', 'relate', 'propose', 'review', 'correct', 'export', 'replay'] as const;
export type CommandVerb = (typeof COMMAND_VERBS)[number];
/** The verbs whose act CHANGES a governed object — offered only to the eligible and never on an indeterminate object (UX-12-004/005). */
export const MUTATING_VERBS: ReadonlySet<CommandVerb> = new Set(['propose', 'review', 'correct']);
export interface ObjectRef { type: string; id: string; version: number | null; asOf: string | null }
export type CommandSpec =
  | { kind: 'here'; label: string; anchor: string }
  | { kind: 'navigate'; label: string; href: (r: ObjectRef) => string }
  | { kind: 'absent'; reason: string; carrier: string };
/** The server's state word → its LS code, or `null` with the reason it has no catalogue equivalent (shown in the server's words). */
export type LifecycleMap = Record<string, LifecycleState | { none: string }>;
export interface ObjectTypeEntry extends ObjectTypeSpec {
  /** the API route the header reads (relative to the domain) */ readRoute: string;
  /** the page file that opens one object, or null — then `carrier` names the stage that builds it */ page: string | null;
  carrier: string | null;
  /** the header on that page: built here, or carried (with `carrier`) */ header: 'built' | 'carried';
  /** a route to an exact version, when the type is versioned and the page honours one */ versionRoute?: (id: string, version: number) => string;
  /** what the type's versions are: numbered versions, recorded instants (an event history), or immutable (one issued record) */ versioning: 'versions' | 'instants' | 'immutable';
  asOf: EffectiveTimeSupport | 'immutable';
  /** the full map (the seam's `lifecycle` is its mapped subset) */ states: LifecycleMap;
  /** the condition overlays read from other fields of the record (LS-11 degraded, LS-12 blocked) — named, never inferred */ conditions?: Partial<Record<'LS-11' | 'LS-12', string>>;
  commands: Record<CommandVerb, CommandSpec>;
}

const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const absent = (reason: string, carrier: string): CommandSpec => ({ kind: 'absent', reason, carrier });
const nav = (label: string, href: (r: ObjectRef) => string): CommandSpec => ({ kind: 'navigate', label, href });
const here = (label: string, anchor: string): CommandSpec => ({ kind: 'here', label, anchor });
const mapped = (m: LifecycleMap): Record<string, LifecycleState> =>
  Object.fromEntries(Object.entries(m).filter((e): e is [string, LifecycleState] => typeof e[1] === 'string')) as Record<string, LifecycleState>;
const entry = (e: Omit<ObjectTypeEntry, 'lifecycle'>): ObjectTypeEntry => ({ ...e, lifecycle: mapped(e.states) });

/** The canonical object store's own lifecycle vocabulary (0006: objects.canonical_objects) — evidence, claims and the other core objects. */
const CORE_STATES: LifecycleMap = {
  proposed: 'LS-02',
  admitted: { none: 'admitted by the admission port — an admission is not an authority\'s approval of the version' },
  active: { none: 'in current use — no catalogue state says "active"' },
  disputed: { none: 'a TRUTH marking (shown by the truth badge), never a lifecycle state' },
  corrected: 'LS-07', withdrawn: 'LS-08', superseded: 'LS-06',
  archived: 'LS-09',
  deleted: { none: 'deleted under retention — the record of the deletion is what remains' },
};
const B83_E13 = 'B83 (F-P7-E-13, the knowledge, memory, entity and evidence workspaces)';
const B83_E14 = 'B83 (F-P7-E-14, the foresight workspaces)';
const B84_E15 = 'B84 (F-P7-E-15, the decision, briefing, collaboration and publishing experience)';
const B84_E16 = 'B84 (F-P7-E-16, the governance administration experience)';
const B82_E07 = 'B82 (F-P7-E-07, the trust, evidence and provenance experience — the full provenance trail)';

export const OBJECT_TYPES: readonly ObjectTypeEntry[] = [
  entry({
    type: 'WRN', label: 'Warning', route: (id) => `/prediction/warnings/${id}`, getAction: 'prediction.read', readRoute: '/prediction/warnings/:id/get',
    page: 'apps/web/app/prediction/warnings/[id]/page.tsx', carrier: null, header: 'built', versioning: 'instants', asOf: 'honoured',
    states: {
      raised: { none: 'raised and open for response — the response window is shown; no catalogue state says "raised"' },
      acknowledged: { none: 'acknowledged by a person — a response, not an approval' },
      expired: { none: 'the window closed unanswered — a recorded failure, not a lifecycle state of the catalogue' },
      closed: 'LS-08',
    },
    commands: {
      inspect: here('Inspect this warning', 'object-identity'),
      compare: here('Compare two recorded instants', 'warning-versions'),
      relate: nav('Open its lifecycle, cluster and context', () => '/prediction/warnings'),
      propose: absent('a warning is raised by the warning service from its origin, never proposed from its page', 'B28 (the warning lifecycle owns the raise)'),
      review: nav('Acknowledge, set context or close (on the warnings page)', () => '/prediction/warnings'),
      correct: absent('no warning correction exists — a closure (criterion no_longer_relevant) is the withdrawal (Q8)', 'B28 (a real withdraw is the warning owner\'s decision)'),
      export: absent('a warning is not exported from its page', B84_E15),
      replay: here('Open the state recorded at an instant (each version below links its as-of state)', 'warning-versions'),
    },
  }),
  entry({
    type: 'FCT', label: 'Forecast', route: (id) => `/prediction/forecasts/${id}`, getAction: 'prediction.read', readRoute: '/prediction/forecasts/:id/get',
    page: 'apps/web/app/prediction/forecasts/[forecastId]/page.tsx', carrier: null, header: 'built', versioning: 'immutable', asOf: 'live_only',
    states: {
      issued: { none: 'issued under its validation state — an issue is not an authority\'s approval' },
      superseded: 'LS-06',
      resolved: { none: 'scored against its outcome — the outcome is shown, not a catalogue state' },
      withdrawn: 'LS-08',
    },
    commands: {
      inspect: here('Inspect this forecast', 'object-identity'),
      compare: absent('a forecast is immutable: a revision is a new forecast, and the family\'s calibration compares them', B83_E14),
      relate: nav('Open its grounding (the information set it pins)', (r) => `/prediction/forecasts/${r.id}/grounding`),
      propose: absent('a forecast is issued by its owner from the forecasts page, never proposed from its page', B83_E14),
      review: nav('Assess fitness or score against the outcome (on the forecasts page)', () => '/prediction/forecasts'),
      correct: absent('a forecast is withdrawn by its owner through the API (L6-I05); no correction exists', B83_E14),
      export: absent('a forecast is not exported from its page', B84_E15),
      replay: nav('Replay it from its frozen information set', (r) => `/prediction/forecasts/${r.id}/grounding`),
    },
  }),
  entry({
    type: 'TWN', label: 'Twin snapshot', route: (id) => `/twins/${id}/versions/latest`, versionRoute: (id, v) => `/twins/${id}/versions/${v}`,
    getAction: 'twin.read', readRoute: '/twins/:id/get', page: 'apps/web/app/twins/[twinId]/versions/[v]/page.tsx', carrier: null, header: 'built',
    versioning: 'versions', asOf: 'live_only',
    states: { draft: 'LS-01', admitted: 'LS-04', withdrawn: 'LS-08' },
    commands: {
      inspect: here('Inspect this snapshot', 'object-identity'),
      compare: here('Compare with another version', 'twin-versions'),
      relate: nav('Open the twin\'s runs', () => '/twins/simulations'),
      propose: absent('a new version is grounded and admitted by the twin owner in the explorer', B83_E14),
      review: nav('Validate or admit (in the twin explorer)', () => '/twins/explorer'),
      correct: absent('a twin version is never edited: a correction is a new version through reconciliation', B83_E14),
      export: absent('a twin snapshot is not exported from its page', B84_E15),
      replay: nav('Read the twin as of an instant (in the twin explorer)', () => '/twins/explorer'),
    },
  }),
  entry({
    type: 'DPK', label: 'Decision package', route: (id) => `/decisions/packages/${id}`, getAction: 'decision.read', readRoute: '/decisions/:id/get',
    page: 'apps/web/app/decisions/packages/[id]/page.tsx', carrier: null, header: 'built', versioning: 'versions', asOf: 'live_only',
    states: {
      draft: 'LS-01', proposed: 'LS-02', under_review: 'LS-03', approved: 'LS-04',
      committed: { none: 'committed — the decision is DECIDED (a truth state of the decision, shown by its own badge), not a catalogue state' },
      monitoring: { none: 'committed and monitored against its outcome criteria' },
      closed: { none: 'closed after monitoring — no catalogue state says "closed"' },
      rejected: { none: 'rejected by its approvers — the rejection is the approvals\' record' },
      withdrawn: 'LS-08', superseded: 'LS-06',
      deferred: { none: 'deferred to a named next review — a deferral, not a block' },
      information_requested: 'LS-12',
    },
    conditions: { 'LS-12': 'the gate status reports the commitment HELD: an approval condition does not hold' },
    commands: {
      inspect: here('Inspect this package', 'object-identity'),
      compare: here('Compare two versions', 'package-versions'),
      relate: nav('Open its gates, approvals and replay (on the decisions page)', () => '/decisions'),
      propose: nav('Propose, approve or commit (on the decisions page, behind its gates)', () => '/decisions'),
      review: nav('Review in the decision room', () => '/decisions/review'),
      correct: absent('a committed decision is reopened, never edited', 'B35 (the reopen path, on the decisions page)'),
      export: absent('a package is rendered to its audience through publishing', B84_E15),
      replay: nav('Replay the decision as of its instant (on the decisions page)', () => '/decisions'),
    },
  }),
  entry({
    type: 'SRC', label: 'Source contract', route: (id) => `/observation/sources/${id}`, getAction: 'observation.read.sources', readRoute: '/observation/sources/:id/get',
    page: 'apps/web/app/observation/sources/[sourceId]/page.tsx', carrier: null, header: 'built', versioning: 'versions', asOf: 'live_only',
    states: {
      draft: 'LS-01', approved: 'LS-04',
      active: { none: 'collecting under the approved contract — an active contract is not a publication' },
      suspended: { none: 'collection halted by an operator — a suspension, not a declared condition' },
      retired: 'LS-10', superseded: 'LS-06',
    },
    conditions: { 'LS-11': 'the source\'s health state is DEGRADED' },
    commands: {
      inspect: here('Inspect this contract', 'object-identity'),
      compare: absent('a contract\'s versions are listed in its approval trail; no field compare exists yet', B83_E13),
      relate: nav('Open the evidence it admitted', (r) => `/observation/evidence?source=${r.id}`),
      propose: nav('Register a new contract', () => '/observation/sources/new'),
      review: here('Approve, activate or suspend (below, behind the collection manager\'s gate)', 'contract'),
      correct: nav('Open a correction case', () => '/observation/corrections'),
      export: absent('a contract is not exported from its page', B84_E16),
      replay: here('Replay the health timeline (below)', 'contract'),
    },
  }),
  entry({
    type: 'EVD', label: 'Evidence', route: (id) => `/observation/evidence/${id}`, getAction: 'observation.read.evidence', readRoute: '/observation/evidence/:id/get',
    page: 'apps/web/app/observation/evidence/[evdId]/page.tsx', carrier: null, header: 'built', versioning: 'versions', asOf: 'immutable',
    states: CORE_STATES,
    commands: {
      inspect: here('Inspect this evidence', 'object-identity'),
      compare: here('Open the version history (below)', 'history'),
      relate: nav('Open its source', () => '/observation/sources'),
      propose: absent('evidence is admitted by collection, never proposed from its page', 'B11 (collection)'),
      review: absent('evidence has no review act on its page', B83_E13),
      correct: nav('Open a correction case', () => '/observation/corrections'),
      export: here('Retrieve the original bytes (below — a consequential read)', 'authenticity'),
      replay: here('Read it as known at an instant (below)', 'history'),
    },
  }),
  entry({
    type: 'CLM', label: 'Claim', route: (id) => `/intelligence/claims?claim=${id}`, getAction: 'intelligence.read', readRoute: '/intelligence/claims/:id/get',
    page: 'apps/web/app/intelligence/claims/page.tsx', carrier: null, header: 'built', versioning: 'versions', asOf: 'live_only',
    states: CORE_STATES,
    commands: {
      inspect: here('Inspect this claim', 'object-identity'),
      compare: absent('a claim\'s versions are counted here; the field compare is the knowledge workspace\'s', B83_E13),
      relate: nav('Open its contradictions', () => '/intelligence/contradictions'),
      propose: absent('a claim is admitted by extraction, never proposed from its page', 'B19 (extraction and derivation)'),
      review: nav('Open the review queue', () => '/intelligence/review'),
      correct: nav('Open a correction case on its evidence', () => '/observation/corrections'),
      export: absent('a claim is not exported from its page', B84_E15),
      replay: absent('a claim as known at an instant is read in the knowledge workspace', B83_E13),
    },
  }),
  entry({
    type: 'ENT', label: 'Entity', route: (id) => `/graph/entities?entity=${id}`, getAction: 'graph.read', readRoute: '/graph/entities/:id/get',
    page: 'apps/web/app/graph/entities/page.tsx', carrier: null, header: 'built', versioning: 'immutable', asOf: 'honoured',
    states: { active: { none: 'in current use — no catalogue state says "active"' }, superseded: 'LS-06', retired: 'LS-10' },
    commands: {
      inspect: here('Inspect this entity', 'object-identity'),
      compare: absent('an entity has no numbered versions; its history is the mentions resolved to it (below)', B83_E13),
      relate: nav('Open the resolution queue', () => '/graph/resolutions'),
      propose: absent('an entity is created by resolution, never proposed from its page', 'B8 (resolution)'),
      review: nav('Decide resolutions', () => '/graph/resolutions'),
      correct: here('Split a wrong merge (below, the resolution manager\'s act)', 'object-identity'),
      export: absent('an entity is not exported from its page', B84_E15),
      replay: here('Read what it held at an instant (below)', 'object-identity'),
    },
  }),
  entry({
    type: 'DPR', label: 'Data product', route: (id) => `/graph/data/products/${id}`, getAction: 'products.product.read', readRoute: '/products/:id/read',
    page: 'apps/web/app/graph/data/products/[productId]/page.tsx', carrier: 'the page keeps B90\'s own header until the next stage that touches it — ' + B83_E13, header: 'carried',
    versioning: 'versions', asOf: 'live_only',
    states: {},
    commands: {
      inspect: nav('Open the data product', (r) => `/graph/data/products/${r.id}`), compare: absent('carried with the header', B83_E13), relate: absent('carried with the header', B83_E13),
      propose: absent('carried with the header', B83_E13), review: absent('carried with the header', B83_E13), correct: absent('carried with the header', B83_E13),
      export: absent('carried with the header', B83_E13), replay: absent('carried with the header', B83_E13),
    },
  }),
];

/** The canonical types the server serves through a get route WITHOUT an object page today — each declared with its carrier (Q13). */
export const DECLARED_TYPES: ReadonlyArray<{ type: string; label: string; readRoute: string; listPage: string | null; carrier: string; states?: LifecycleMap }> = [
  { type: 'SCN', label: 'Scenario', readRoute: '/prediction/scenarios/:id/get', listPage: '/prediction/scenarios', carrier: `${B83_E14}; its list page is a Field-fork page migrated by §RE first` },
  { type: 'SIM', label: 'Simulation run', readRoute: '/twins/simulations/:id/get', listPage: '/twins/simulations', carrier: B83_E14 },
  { type: 'SIG', label: 'Weak signal', readRoute: '/prediction/signals/:id/get', listPage: '/prediction/signals', carrier: B83_E14 },
  { type: 'RSK', label: 'Exposure', readRoute: '/prediction/exposures/:id/get', listPage: '/prediction/exposures', carrier: B83_E14 },
  { type: 'INS', label: 'Information set', readRoute: '/prediction/information-sets/:id/get', listPage: '/prediction/information-sets', carrier: B83_E14 },
  { type: 'OBJ', label: 'Strategy object', readRoute: '/graph/strategy/:id/get', listPage: '/graph/strategy', carrier: B83_E14 },
  { type: 'MEM', label: 'Memory item', readRoute: '/graph/memory/:id/get', listPage: '/graph/memory', carrier: B83_E13 },
  { type: 'RES', label: 'Resolution', readRoute: '/graph/resolutions/:id/get', listPage: '/graph/resolutions', carrier: B83_E13 },
  { type: 'MTH', label: 'Extraction method', readRoute: '/intelligence/methods/:id/get', listPage: '/intelligence/methods', carrier: B83_E13,
    states: { draft: 'LS-01', approved: 'LS-04', active: { none: 'in use' }, suspended: { none: 'halted by an operator' }, retired: 'LS-10' } },
  { type: 'RUN', label: 'Collection run', readRoute: '/observation/runs/:id/get', listPage: '/observation/runs', carrier: B83_E13 },
  { type: 'AQS', label: 'Acquisition stream', readRoute: '/observation/streams/:id/get', listPage: null, carrier: B83_E13 },
  { type: 'QAR', label: 'Quarantine case', readRoute: '/observation/quarantine/:id/get', listPage: '/observation/quarantine', carrier: B83_E13 },
  { type: 'COR', label: 'Correction case', readRoute: '/observation/corrections/:id/get', listPage: '/observation/corrections', carrier: B83_E13 },
  { type: 'CMT', label: 'Commitment', readRoute: '/decisions/commitments/:id/get', listPage: '/decisions/commitments', carrier: B84_E15 },
  { type: 'DRM', label: 'Decision room', readRoute: '/rooms/:id/get', listPage: '/decisions/review', carrier: B84_E15 },
  { type: 'BRF', label: 'Briefing', readRoute: '/briefings/:id/get', listPage: '/decisions/briefings', carrier: B84_E15 },
  { type: 'EXR', label: 'Executive request', readRoute: '/executive/requests/:id/get', listPage: '/decisions/requests', carrier: B84_E15 },
  { type: 'PLN', label: 'Strategic plan', readRoute: '/plans/:id/get', listPage: '/graph/strategy/planning', carrier: B84_E15 },
  { type: 'PUB', label: 'Publication', readRoute: '/executive/publications/:id/get', listPage: '/decisions/publications', carrier: B84_E15,
    states: { drafted: 'LS-01', approved: 'LS-04', delivered: 'LS-05', corrected: 'LS-07', withdrawn: 'LS-08', archived: 'LS-09' } },
  { type: 'RTA', label: 'Retention action', readRoute: '/retention/actions/:id/get', listPage: '/graph/retention', carrier: B84_E16 },
  { type: 'IMP', label: 'Governed import', readRoute: '/retention/imports/:id/get', listPage: null, carrier: B84_E16 },
];

export function objectType(type: string): ObjectTypeEntry | null { return OBJECT_TYPES.find((t) => t.type === type) ?? null; }
/** Every type the registry knows, with where it opens — a page, or the stage that carries it (never silently omitted). */
export function typeCoverage(): Array<{ type: string; label: string; opens: string | null; carrier: string | null }> {
  return [
    ...OBJECT_TYPES.map((t) => ({ type: t.type, label: t.label, opens: t.page, carrier: t.header === 'carried' ? t.carrier : null })),
    ...DECLARED_TYPES.map((d) => ({ type: d.type, label: d.label, opens: null, carrier: d.carrier })),
  ];
}

/* ═════════════════════════════ THE LIFECYCLE READING ═════════════════════════════ */
export interface LifecycleReading {
  /** the LS code, or null when the server's state has no catalogue equivalent (or is not known) */ code: LifecycleState | null;
  label: string; definition: string; glyph: string;
  /** the server's own state word, exactly as recorded (null when the read carried none) */ serverState: string | null;
  /** why there is no LS code, when there is none */ note: string | null;
  /** the condition overlays that hold (LS-11 / LS-12), each with the record's reason */ conditions: Array<{ code: 'LS-11' | 'LS-12'; label: string; reason: string }>;
}
/** The lifecycle of one record of `type` from the SERVER's state word (and the condition overlays the page read). Never from a truth state. */
export function lifecycleOf(type: string, serverState: string | null | undefined, conditions: { degraded?: boolean; blocked?: boolean } = {}): LifecycleReading {
  const states = objectType(type)?.states ?? DECLARED_TYPES.find((d) => d.type === type)?.states ?? CORE_STATES;
  const spec = objectType(type)?.conditions ?? {};
  const overlays: LifecycleReading['conditions'] = [];
  if (conditions.degraded === true && spec['LS-11'] !== undefined) overlays.push({ code: 'LS-11', label: LIFECYCLE['LS-11'].label, reason: spec['LS-11'] });
  if (conditions.blocked === true && spec['LS-12'] !== undefined) overlays.push({ code: 'LS-12', label: LIFECYCLE['LS-12'].label, reason: spec['LS-12'] });
  const s = typeof serverState === 'string' && serverState.trim() !== '' ? serverState.trim() : null;
  if (s === null) return { code: null, label: 'Unresolved', definition: 'The read carried no lifecycle state', glyph: '?', serverState: null, note: 'the lifecycle state could not be resolved from the record', conditions: overlays };
  const m = Object.hasOwn(states, s) ? states[s] : undefined;
  if (typeof m === 'string') { const d = LIFECYCLE[m]; return { code: m, label: d.label, definition: d.definition, glyph: d.glyph, serverState: s, note: null, conditions: overlays }; }
  const note = m === undefined ? 'the server\'s state is not in this type\'s lifecycle map — shown in its own words' : m.none;
  return { code: null, label: s.replace(/_/g, ' '), definition: 'The server\'s own state — no lifecycle-catalogue equivalent', glyph: '·', serverState: s, note, conditions: overlays };
}

/* ═════════════════════════════ THE DURABLE REFERENCE ═════════════════════════════ */
/** `eye:<TYPE>:<id>[:v<version>][@<instant>]` — or null for a reference that cannot be made exactly. */
export function durableReference(r: ObjectRef): string | null {
  if (!/^[A-Z]{3}$/.test(r.type) || !UUIDISH.test(r.id)) return null;
  if (r.version !== null && !(Number.isInteger(r.version) && r.version >= 1)) return null;
  if (r.asOf !== null && (!ISO.test(r.asOf) || Number.isNaN(Date.parse(r.asOf)))) return null;
  return `eye:${r.type}:${r.id.toLowerCase()}${r.version === null ? '' : `:v${r.version}`}${r.asOf === null ? '' : `@${r.asOf}`}`;
}
/** A durable reference read back — exactly, or the reason it cannot be opened (it never resolves to something else). */
export function parseDurableReference(text: string): { ref: ObjectRef } | { problem: 'format' | 'type' | 'id' | 'version' | 'instant' } {
  const m = /^eye:([A-Z]{3}):([^:@]+)(?::v([^@]+))?(?:@(.+))?$/.exec(text.trim());
  if (m === null) return { problem: 'format' };
  const [, type, id, v, at] = m as unknown as [string, string, string, string | undefined, string | undefined];
  if (objectType(type) === null && !DECLARED_TYPES.some((d) => d.type === type)) return { problem: 'type' };
  if (!UUIDISH.test(id)) return { problem: 'id' };
  if (v !== undefined && !/^[1-9][0-9]{0,8}$/.test(v)) return { problem: 'version' };
  if (at !== undefined && (!ISO.test(at) || Number.isNaN(Date.parse(at)))) return { problem: 'instant' };
  return { ref: { type, id: id.toLowerCase(), version: v === undefined ? null : Number(v), asOf: at ?? null } };
}
/** The in-app page a reference opens — the EXACT version where the type has a version route; null when no page opens that type. */
export function objectHref(r: ObjectRef): string | null {
  const t = objectType(r.type);
  if (t === null || t.page === null || !UUIDISH.test(r.id)) return null;
  if (r.version !== null && t.versionRoute !== undefined) return t.versionRoute(r.id, r.version);
  const base = t.route(r.id);
  if (r.version !== null && t.versioning === 'versions') return `${base}${base.includes('?') ? '&' : '?'}v=${r.version}`;
  return base;
}
/** A page's `[id]` parameter: exactly an object id, or null (then the page says it cannot open what the link names). */
export function routeId(v: unknown): string | null { return typeof v === 'string' && UUIDISH.test(v) ? v.toLowerCase() : null; }
/** A page's version parameter: a version number, `latest`, or null for anything else. */
export function routeVersion(v: unknown): number | 'latest' | null {
  if (v === 'latest') return 'latest';
  return typeof v === 'string' && /^[1-9][0-9]{0,8}$/.test(v) ? Number(v) : null;
}
/** An ISO instant with its zone, or null. */
export function isoInstant(v: unknown): string | null { return typeof v === 'string' && ISO.test(v) && !Number.isNaN(Date.parse(v)) ? v : null; }

/* ═════════════════════════════ THE HEADER ADAPTER ═════════════════════════════ */
export type Resolved<T> = { value: T } | { unresolved: string };
export const known = <T>(v: T | null | undefined, why: string): Resolved<T> => (v === null || v === undefined || (typeof v === 'string' && v.trim() === '') ? { unresolved: why } : { value: v });
export interface ObjectHeaderInput {
  type: string; id: string | null; title: string | null;
  version: number | null; versionCount: number | null; latestVersion?: number | null;
  owner: string | null; ownerRole: string;
  /** the type's record carries no owner at all (said, not unresolved) — e.g. an entity, whose decisions are the resolution manager's */ ownerNotApplicable?: string;
  serverState: string | null; conditions?: { degraded?: boolean; blocked?: boolean };
  truth: string | null; synthetic: boolean | null; classification: string | null;
  time: Array<{ label: string; value: string | null }>;
  trust: string | null;
  /** the explicit authority statement read from the record (who approved what, or that no approval exists) — never inferred */ authority: string;
  relationships: Array<{ label: string; href: string | null }>;
  provenance: Array<{ label: string; href: string | null }>;
  /** the read's own record: opening the page left this access evidence (PAT-01) */ receipt: { policyDecisionId: string; auditSeq: number } | null;
  /** how this page treats the context bar's effective time (B80 Q11) */ effective: { support: EffectiveTimeSupport | 'immutable'; asOf: string | null };
  /** the eligibility the page read for the mutating commands (its role flags) — the server re-checks every act */ eligible?: Partial<Record<CommandVerb, { can: boolean; reason: string | null }>>;
  /** an inconsistency the page found between two reads of the same object (e.g. a context version that does not match) */ inconsistencies?: string[];
  /* B82 ts — THE STATE STRIP (UX-06-001/-002/-005, HX-02, HX-15; all OPTIONAL — a page that passes none renders exactly as before): the
     server's display truth (objects.display_truth, or `{ stored, unread }`), the freshness of what the object rests on, the policy (the
     classification and the purpose) and the person's pending commands for the one-dimension context entry (UX-06-003). An INDETERMINATE
     display truth or stale / partial data HOLDS the mutating commands with the reason (the server refuses independently). */
  displayTruth?: TruthInput | null;
  freshness?: FreshnessInput | null;
  policy?: StatePolicy | null;
  pending?: PendingCommand[];
  /* end B82 ts */
}
export interface HeaderField { key: string; label: string; value: string | null; unresolved: string | null }
export interface HeaderCommand { verb: CommandVerb; label: string; href: string | null; anchor: string | null; disabledReason: string | null; absent: { reason: string; carrier: string } | null }
export interface HeaderView {
  typeLabel: string; title: string; ref: ObjectRef | null; reference: string | null;
  fields: HeaderField[]; lifecycle: LifecycleReading;
  indeterminate: boolean; reasons: string[];
  /** where an indeterminate object is reconciled */ reconcile: string | null;
  commands: HeaderCommand[];
  recorded: string | null; effective: string; authority: string;
}

/** DECIDE the header: every field resolved or marked UNRESOLVED; an unresolved identity/version/owner/state makes the object INDETERMINATE. */
export function headerView(i: ObjectHeaderInput): HeaderView {
  const t = objectType(i.type);
  const typeLabel = t?.label ?? DECLARED_TYPES.find((d) => d.type === i.type)?.label ?? i.type;
  const lifecycle = lifecycleOf(i.type, i.serverState, i.conditions ?? {});
  const reasons: string[] = [];
  const id = i.id !== null && UUIDISH.test(i.id) ? i.id.toLowerCase() : null;
  if (id === null) reasons.push('the immutable identifier could not be resolved');
  const versioned = t === null ? true : t.versioning === 'versions';
  if (versioned && i.version === null) reasons.push('the version could not be resolved');
  if (i.ownerNotApplicable === undefined && (i.owner === null || i.owner.trim() === '')) reasons.push(`the ${i.ownerRole} could not be resolved`);
  if (lifecycle.serverState === null) reasons.push('the lifecycle state could not be resolved');
  for (const x of i.inconsistencies ?? []) reasons.push(x);
  const indeterminate = reasons.length > 0;
  const ref: ObjectRef | null = id === null ? null : { type: i.type, id, version: versioned ? i.version : null, asOf: i.effective.support === 'honoured' ? i.effective.asOf : null };
  const reference = ref === null ? null : durableReference(ref);
  const f = (key: string, label: string, v: string | null | undefined, why: string): HeaderField => {
    const r = known(v, why);
    return 'value' in r ? { key, label, value: String(r.value), unresolved: null } : { key, label, value: null, unresolved: r.unresolved };
  };
  const versionText = !versioned ? (t?.versioning === 'instants' ? 'recorded instants (the event history below)' : 'immutable — one issued record')
    : i.version === null ? null
      : `v${i.version}${i.versionCount !== null ? ` of ${i.versionCount}` : ''}${i.latestVersion !== undefined && i.latestVersion !== null && i.latestVersion !== i.version ? ` — NOT the latest (v${i.latestVersion} exists)` : ''}`;
  const fields: HeaderField[] = [
    f('type', 'Type', typeLabel, 'the object type is not known'),
    f('name', 'Canonical name', i.title, 'the record carried no canonical name'),
    f('id', 'Immutable identifier', id, 'the identifier could not be resolved'),
    f('version', 'Version', versionText, 'the version could not be resolved'),
    i.ownerNotApplicable !== undefined ? { key: 'owner-none', label: i.ownerRole.charAt(0).toUpperCase() + i.ownerRole.slice(1), value: i.ownerNotApplicable, unresolved: null }
      : f('owner', i.ownerRole.charAt(0).toUpperCase() + i.ownerRole.slice(1), i.owner, `the ${i.ownerRole} is not recorded on this read`),
    f('truth', 'Truth', i.truth, 'no truth state is recorded on this type\'s read'),
    f('classification', 'Classification', i.classification, 'not recorded on this read'),
    f('trust', 'Trust status', i.trust, 'not recorded on this read'),
    ...i.time.map((x, n) => f(`time-${n}`, x.label, x.value, 'not recorded')),
    { key: 'synthetic', label: 'Synthetic', value: i.synthetic === null ? null : i.synthetic ? 'SYNTHETIC — never observed' : 'not synthetic', unresolved: i.synthetic === null ? 'not recorded on this read' : null },
  ];
  /* B82 ts: the display truth and the freshness hold the mutating commands with their reason (never a silent disable) */
  const held = (i.displayTruth === undefined ? null : truthGate(i.displayTruth, 'propose')) ?? (i.freshness === undefined || i.freshness === null ? null : freshnessView(i.freshness).constrains);
  const commands = headerCommands(i.type, ref, { indeterminate, eligible: i.eligible ?? {}, held });
  /* end B82 ts */
  const recorded = i.receipt === null ? null : `Opening this page was recorded — policy decision ${i.receipt.policyDecisionId.slice(0, 13)}…, audit seq ${i.receipt.auditSeq}. Viewing changed nothing.`;
  return {
    typeLabel, title: i.title ?? `${typeLabel} (name unresolved)`, ref, reference, fields, lifecycle, indeterminate, reasons,
    reconcile: indeterminate ? (t?.route !== undefined && id !== null ? `Reopen the object's page to re-read it, or open its list: ${t.route(id)}` : 'Open the list of this type and choose the object again') : null,
    commands, recorded, effective: effectiveLine(i.effective), authority: i.authority,
  };
}

/** The effective-time statement (B80 Q11): honoured on an as-of read, or said to be live — never silently ignored. */
export function effectiveLine(e: { support: EffectiveTimeSupport | 'immutable'; asOf: string | null }, barEffectiveAt: string | null = null): string {
  if (e.support === 'honoured') return e.asOf === null ? 'Live — this page honours an as-of instant when one is chosen' : `As of ${e.asOf} — the recorded state at that instant`;
  if (e.support === 'immutable') return 'An immutable record — the same at any effective time';
  return barEffectiveAt === null ? 'Live — this read has no as-of' : `Live — the context bar's effective time ${barEffectiveAt} is NOT applied to this read`;
}

/** The header's commands: a navigation, an anchor on the page, or ABSENT with its carrier. A mutating one is disabled with the reason when the
 *  object is indeterminate or the person is not eligible. The header itself never calls a port. */
export function headerCommands(type: string, ref: ObjectRef | null, facts: { indeterminate: boolean; eligible: Partial<Record<CommandVerb, { can: boolean; reason: string | null }>>; /* B82 ts */ held?: string | null /* end B82 ts */ }): HeaderCommand[] {
  const t = objectType(type);
  if (t === null) return COMMAND_VERBS.map((verb) => ({ verb, label: verb, href: null, anchor: null, disabledReason: null, absent: { reason: 'this type has no object page', carrier: DECLARED_TYPES.find((d) => d.type === type)?.carrier ?? 'not declared' } }));
  return COMMAND_VERBS.map((verb) => {
    const c = t.commands[verb];
    if (c.kind === 'absent') return { verb, label: verb, href: null, anchor: null, disabledReason: null, absent: { reason: c.reason, carrier: c.carrier } };
    let disabledReason: string | null = null;
    if (MUTATING_VERBS.has(verb)) {
      if (facts.indeterminate) disabledReason = 'the object could not be resolved consistently — nothing may change it until it is reconciled';
      /* B82 ts: held by the truth state or the freshness — a correction stays offered (it is how an indeterminate state is resolved) */
      else if (facts.held !== undefined && facts.held !== null && verb !== 'correct') disabledReason = facts.held;
      /* end B82 ts */
      else if (facts.eligible[verb] !== undefined && !facts.eligible[verb]!.can) disabledReason = facts.eligible[verb]!.reason ?? 'you are not eligible for this act';
    }
    if (ref === null && c.kind === 'navigate') return { verb, label: c.label, href: null, anchor: null, disabledReason: disabledReason ?? 'the identifier could not be resolved', absent: null };
    return c.kind === 'here'
      ? { verb, label: c.label, href: null, anchor: c.anchor, disabledReason, absent: null }
      : { verb, label: c.label, href: c.href(ref as ObjectRef), anchor: null, disabledReason, absent: null };
  });
}

/* ═════════════════════════════ VERSION COMPARE (PAT-12) ═════════════════════════════ */
type Row = Record<string, unknown>;
export interface WarningEventLike { event: string; details?: Row | null; occurred_at: string | null; actor_principal_id: string }
export interface VersionPoint { n: number; event: string; at: string | null; actedBy: string; contextVersion: number | null }
/** A warning's VERSIONS are its recorded instants — one per event, oldest first, with the person (or service) that acted. No approval exists
 *  for a warning, so the column says "acted by" (Q7). */
export function warningVersionPoints(events: readonly WarningEventLike[]): VersionPoint[] {
  const sorted = [...events].sort((a, b) => String(a.occurred_at ?? '').localeCompare(String(b.occurred_at ?? '')));
  return sorted.map((e, i) => {
    const cv = e.event === 'warning.context_set' ? Number((e.details ?? {})['context_version']) : NaN;
    return { n: i + 1, event: e.event, at: e.occurred_at, actedBy: e.actor_principal_id, contextVersion: Number.isFinite(cv) ? cv : null };
  });
}
export interface AsOfLike { state: string; title: string | null; level: string | null; urgency: string | null; confidence: unknown; closes_at: string | null; routed_to: string | null; context_version: number; event_count: number; last_event: { event: string; occurred_at: string } | null }
/** The record a warning version compares on: the state the server reconstructed AS OF the instant, and the context (contradicting evidence,
 *  affected objects, falsification, playbook) the recorded context_set event in force at that instant carried. The context version the server
 *  reports must be the event's — otherwise the instant is UNRESOLVED (named, never reconciled silently). */
export function warningCompareRecord(asOf: AsOfLike, events: readonly WarningEventLike[], at: string): { record: Row; actedBy: string | null; problem: string | null } {
  const upTo = [...events].filter((e) => e.occurred_at !== null && Date.parse(e.occurred_at) <= Date.parse(at)).sort((a, b) => String(a.occurred_at).localeCompare(String(b.occurred_at)));
  const ctx = [...upTo].reverse().find((e) => e.event === 'warning.context_set') ?? null;
  const d = (ctx?.details ?? {}) as Row;
  const ctxVersion = ctx === null ? 0 : Number(d['context_version']);
  const problem = ctxVersion === asOf.context_version ? null
    : `the server reports context version ${asOf.context_version} at this instant, the recorded context events give ${ctxVersion} — this instant is unresolved`;
  const record: Row = {
    state: asOf.state, title: asOf.title, level: asOf.level, urgency: asOf.urgency, confidence: asOf.confidence, closes_at: asOf.closes_at, routed_to: asOf.routed_to,
    context_version: asOf.context_version, contradicting: d['contradicting'] ?? [], affected: d['affected'] ?? {}, falsification: d['falsification'] ?? [], playbook: d['playbook'] ?? null,
    events_up_to_instant: asOf.event_count, last_event: asOf.last_event === null ? null : `${asOf.last_event.event} at ${asOf.last_event.occurred_at}`,
  };
  return { record, actedBy: upTo.length === 0 ? null : upTo[upTo.length - 1]!.actor_principal_id, problem };
}
export const WARNING_COMPARE_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'state', label: 'State' }, { key: 'contradicting', label: 'Contradicting evidence' }, { key: 'affected', label: 'Affected objectives and objects' },
  { key: 'falsification', label: 'Falsification conditions' }, { key: 'playbook', label: 'Playbook' }, { key: 'context_version', label: 'Context version' },
  { key: 'level', label: 'Level' }, { key: 'urgency', label: 'Urgency' }, { key: 'confidence', label: 'Confidence' }, { key: 'title', label: 'Title' },
  { key: 'closes_at', label: 'Window closes' }, { key: 'routed_to', label: 'Routed to' }, { key: 'events_up_to_instant', label: 'Events up to the instant' }, { key: 'last_event', label: 'Last event' },
];

export interface PackageVersionLike {
  version: number; state: string; supersedes: number | null; version_digest: string | null; proposed_at: string | null; known_at: string;
  objectives: string[]; constraints: unknown[]; approver_policy: object; choice: { option_key: string; rationale?: string } | null; reversibility: string | null; information_value: string | null;
  options: Array<{ key: string; title: string; kind: string; simulated: boolean }>; dissent: Array<{ principal_id: string; position: string }>;
  approvals: Array<{ approver_principal_id: string; decision: string; version_digest: string; live: boolean; recorded_at: string; revoked_at: string | null }>;
}
/** The record a package version compares on — and its AUTHORITY: the approvals actually recorded on that version (who, which digest, live). */
export function packageCompareRecord(v: PackageVersionLike): { record: Row; authority: string } {
  const live = v.approvals.filter((a) => a.live && a.revoked_at === null);
  const authority = v.approvals.length === 0 ? 'no approval recorded on this version'
    : `${live.filter((a) => a.decision === 'approve').length} live approval(s), ${v.approvals.length} recorded: ${v.approvals.map((a) => `${a.decision} by ${a.approver_principal_id.slice(0, 8)}…${a.live && a.revoked_at === null ? '' : ' (not live)'}${a.version_digest === v.version_digest ? '' : ' (ANOTHER digest)'}`).join('; ')}`;
  return {
    authority,
    record: {
      state: v.state, version_digest: v.version_digest, supersedes: v.supersedes, proposed_at: v.proposed_at, known_at: v.known_at,
      options: v.options.map((o) => `${o.key}: ${o.title} (${o.kind}${o.simulated ? ', simulated' : ', not simulated'})`),
      choice: v.choice === null ? null : `${v.choice.option_key} — ${v.choice.rationale ?? ''}`,
      approver_policy: v.approver_policy, approvals: v.approvals.map((a) => `${a.decision} by ${a.approver_principal_id} on ${a.version_digest.slice(0, 12)}… at ${a.recorded_at}${a.live && a.revoked_at === null ? '' : ' (not live)'}`),
      dissent: v.dissent.map((d) => `${d.principal_id.slice(0, 8)}…: ${d.position}`), objectives: v.objectives, constraints: v.constraints,
      reversibility: v.reversibility, information_value: v.information_value,
    },
  };
}
export const PACKAGE_COMPARE_FIELDS: ReadonlyArray<{ key: string; label: string }> = [
  { key: 'state', label: 'State' }, { key: 'version_digest', label: 'Version digest' }, { key: 'approvals', label: 'Approvals (the approvers)' }, { key: 'choice', label: 'Choice' },
  { key: 'options', label: 'Options' }, { key: 'dissent', label: 'Dissent' }, { key: 'approver_policy', label: 'Approver policy' }, { key: 'objectives', label: 'Objectives' },
  { key: 'constraints', label: 'Constraints' }, { key: 'reversibility', label: 'Reversibility' }, { key: 'information_value', label: 'Information value' },
  { key: 'supersedes', label: 'Supersedes' }, { key: 'proposed_at', label: 'Proposed at' }, { key: 'known_at', label: 'Known at' },
];

export interface TwinElementLike { key: string; kind: string; basis_truth_state: string | null; value: unknown; unit: string | null; valid_from: string | null; valid_to: string | null; citations: unknown[]; health: string; confidence: number | null; synthetic_state: boolean; inherited_validation?: string | null }
/** A twin version's comparable record: one entry per element key — what the element IS (kind, basis, value with its unit, validity, the
 *  number of citations, health, confidence, synthetic) — the same semantics the server's own compare reads (twin.service compare). */
export function twinCompareRecord(elements: readonly TwinElementLike[]): Row {
  const out: Row = {};
  for (const e of [...elements].sort((a, b) => a.key.localeCompare(b.key))) {
    out[e.key] = `${e.kind}${e.basis_truth_state === null ? '' : ` (${e.basis_truth_state})`} · ${typeof e.value === 'string' ? e.value : JSON.stringify(e.value)}${e.unit === null ? '' : ` ${e.unit}`}`
      + ` · valid ${e.valid_from ?? '—'}…${e.valid_to ?? '—'} · ${e.citations.length} citation(s) · ${e.health}${e.confidence === null ? '' : ` · confidence ${e.confidence}`}${e.synthetic_state ? ' · SYNTHETIC' : ''}`
      + `${e.inherited_validation ? ` · validation ${e.inherited_validation}` : ''}`;
  }
  return out;
}

/** UX-25-004: emphasis is never bound to approval or truth — the header's presentation is the same for every lifecycle and truth state. */
export function headerEmphasis(_v: Pick<HeaderView, 'lifecycle' | 'authority'>): 'standard' { return 'standard'; }
