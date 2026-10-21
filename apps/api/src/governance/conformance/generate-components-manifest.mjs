/**
 * B107 §CM (0115_b107_x_cm; F-P7D-25: ES-01-001/-004, ES-02-002, ES-31..40-002, ES-65-001/-002/-004, ADR-0001, V03-T-029, V04-T-004,
 * V06-T-002, V07-T-005, IA-01-001/-003, IA-72-003, AI-08-001/-005, DP-65-002/-005) — THE COMPONENT CONFORMANCE MANIFEST GENERATOR.
 *
 * Produces `conformance/components.manifest.json` from the repository ITSELF (pure Node, no network, no database, nothing written but that
 * one file, and only with `--write`):
 *   * every DEPLOYABLE UNIT — each Nest module of the API (discovered: apps/api/src/<dir>/<dir>.module.ts and the composition root), each
 *     BullMQ worker (discovered: a file of apps/api/src constructing `new Worker(` from 'bullmq'), the web app (apps/*), each workspace
 *     package (packages/*), each Compose service (docker-compose.yml) — with its owner, the components it DEPLOYS, its layer(s), its state
 *     boundary (the schemas it owns), its public contract (the controllers its module registers; its schemas' definer ports), its
 *     dependencies (the modules its module imports — derived), its controls, its quality obligations, its plane boundaries (AI-08-005) and its
 *     semantic authority (IA-01-003: infrastructure hosts, it never owns truth, policy meaning or a decision);
 *   * the 92 LOGICAL COMPONENTS (L1-C01 … L10-C09, Volume 3 Ch. 9-18 — read from audit/requirements/v03.csv, READ ONLY) as SERVICE
 *     MANIFESTS (ES-31..40-002): id, name and duty (the frozen clause, split at its duty verb), layer, owner, state class (the duty verb's
 *     class — declared from the authoritative wording, never inferred from code), contracts (the layer's interfaces L<n>-I01..05 and the schema
 *     object types the layer owns — objects.interface_register ids / objects.schema_registry types, versions resolved live), dependencies, controls, DECLARED
 *     SLO targets (B64 SUBSTITUTED: declared, never computed), failure domains, and the recovery procedure naming the PRODUCT semantics affected
 *     (V03-T-433 — the runbooks themselves are B63's);
 *   * the platform (CP-*, conformance.manifest.json `units`, read only), infrastructure (INF-*, v06.csv) and data (DAT-*, v07.csv) component
 *     catalogues (id + the catalogue text verbatim + the declared hosting unit; their requirement rows stay authoritative for status);
 *   * the AI PLANES (AI-08-001), the frozen-contract register (IA-72-003), the generated-artifact register (ES-65-004) and the conformance
 *     evidence families (V03-T-452).
 *
 * THE CHECKS (unit tests — apps/api/test/unit/governance-conformance-b107.test.ts — inside the existing build-test; no workflow change):
 * "regenerated equals committed" and "no unmapped unit" (a discovered unit absent from UNIT_MAP is emitted `mapped: false` and FAILS the test;
 * the registration port refuses a manifest carrying one and preserves the non-conformant record — IA-01-005, DP-65-005).
 *
 * THREE CLAIMS: this manifest is CONSTRUCTION — a declaration from source. It never says a component is conformant, healthy or accepted (the
 * conformance service reads evidence for that); production reconciliation (IA-01-002) is R1; layer desired/observed reconciliation is B109/B110.
 *
 * Usage: node apps/api/src/governance/conformance/generate-components-manifest.mjs [--write | --check]
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MANIFEST_PATH = 'conformance/components.manifest.json';
export const GENERATOR_PATH = 'apps/api/src/governance/conformance/generate-components-manifest.mjs';
export const SCHEMA = 'eye.components-manifest/v1';
const OWNER = 'founding-engineer';

// ───────────────────────────────────────── the canonical layers (Volume 3 Ch. 9-18; Volume 4 ES-31..ES-40) ─────────────────────────────────────────
/** Each layer: the V4 chapter (ES-3x), the units hosting its components, the schema object types it owns (objects.schema_registry), the layers it
 *  reads from, its failure domains and the PRODUCT semantics its loss affects (the recovery statement names product meaning, never only
 *  infrastructure — V03-T-433). */
export const LAYERS = [
  { n: 1, name: 'World Observation', chapter: 'ES-31', units: ['api.observation', 'worker.collection'], objects: ['SRC', 'OBS', 'EVD'], reads: [],
    failure: ['postgres:observation', 'redis:collection-queue', 'connector egress'],
    affected: 'observations stop arriving or arrive late: freshness and coverage read stale with the gap DISCLOSED; warnings, forecasts and briefings that depend on the source show their evidence age; nothing is inferred current' },
  { n: 2, name: 'Intelligence', chapter: 'ES-32', units: ['api.intelligence', 'worker.extraction-plan'], objects: ['CLM', 'ENT', 'EVT', 'REL', 'ASM'], reads: [1],
    failure: ['postgres:intelligence', 'redis:extraction-queue', 'model gateway'],
    affected: 'claims, entities and events are not extracted or reviewed: new evidence stays un-transformed and is shown as such; no claim is promoted without its review; truth states are never upgraded by default' },
  { n: 3, name: 'Enterprise Memory', chapter: 'ES-33', units: ['api.objects', 'api.retention', 'api.graph'], objects: ['OBJ', 'MEM', 'APR', 'RPL'], reads: [1, 2],
    failure: ['postgres:objects', 'postgres:memory', 'vault filesystem roots'],
    affected: 'memory commits, retention actions and exports pause: prior versions stay readable with their provenance; corrections are queued, never lost; a deletion or export is never reported complete before it is' },
  { n: 4, name: 'Knowledge Graph', chapter: 'ES-34', units: ['api.graph'], objects: ['ENT', 'REL', 'DPR'], reads: [2, 3],
    failure: ['postgres:graph', 'redis:subscription-queue'],
    affected: 'graph revisions and traversals degrade: paths are returned partial with incompleteness disclosed; GraphChanged consumers lag visibly; identity resolutions are held, never merged by default' },
  { n: 5, name: 'Digital Twins', chapter: 'ES-35', units: ['api.twin'], objects: ['TWN'], reads: [3, 4],
    failure: ['postgres:twin', 'redis:estimation-queue'],
    affected: 'twin state estimates go stale: twins show their freshness and operating-envelope state; synthetic states stay labelled; branches cannot be run on a stale twin without the disclosure' },
  { n: 6, name: 'Prediction Engine', chapter: 'ES-36', units: ['api.prediction'], objects: ['FCT', 'WRN', 'SIM'], reads: [1, 3, 4, 5],
    failure: ['postgres:prediction', 'redis:forecast-queue', 'model gateway'],
    affected: 'forecasts and warnings are not refreshed: the last forecast version shows its age and fitness; unfit forecasts are withheld from decisions; warnings already raised stay visible with their acknowledgement state' },
  { n: 7, name: 'Scenario Intelligence', chapter: 'ES-37', units: ['api.prediction', 'api.domains'], objects: ['SCN', 'ASU'], reads: [4, 5, 6],
    failure: ['postgres:prediction'],
    affected: 'scenarios, signposts and assumptions are not updated: scenario sets show their coherence state as of their last review; signpost movements are not inferred' },
  { n: 8, name: 'Simulation Engine', chapter: 'ES-38', units: ['api.twin'], objects: ['SIM'], reads: [5, 6, 7],
    failure: ['postgres:simulation', 'redis:experiment-queue', 'compute budget'],
    affected: 'experiments queue or stop at their budget: completed runs stay reproducible from their seeds and versions; partial runs are never presented as results' },
  { n: 9, name: 'Decision Intelligence', chapter: 'ES-39', units: ['api.decision'], objects: ['DEC', 'CMT', 'OUT', 'DPK'], reads: [4, 6, 7, 8],
    failure: ['postgres:decision'],
    affected: 'decision packages cannot be assembled or approved: no recommendation is issued without its evidence and foresight; pending approvals stay pending (never auto-approved); recorded decisions and commitments stay intact and replayable' },
  { n: 10, name: 'Executive Operating System', chapter: 'ES-40', units: ['api.executive'], objects: ['BRF', 'PLN', 'PUB', 'CAP', 'INI', 'RSC', 'MSR', 'STK', 'RSK', 'MET'], reads: [6, 7, 9],
    failure: ['postgres:executive', 'redis:attention-queue', 'local delivery sinks'],
    affected: 'briefings, attention routing and rooms degrade: the workspace marks what is stale; attention items already raised stay owned and visible; escalations are held, never silently dropped; a human gate is never bypassed' },
];

/** The duty verb (Volume 3's own wording of each component's clause) → the declared state class. Declared from the authoritative text. */
export const STATE_CLASS = {
  Persists: 'authoritative_store',
  Owns: 'authoritative_owner',
  Coordinates: 'workflow_state',
  Executes: 'derived_results',
  Measures: 'derived_quality_state',
  Mediates: 'adapter_no_authoritative_state',
  Presents: 'presentation_projection',
};

/** DECLARED SLO targets by state class (B64 SUBSTITUTED: declared here, never computed; the SLO service and its exhaustion triggers are B64's). */
const SLO = {
  authoritative_store: [{ indicator: 'durable commit success', target: '99.9% / 30d' }, { indicator: 'recovery point', target: '≤ 15 min' }],
  authoritative_owner: [{ indicator: 'governed write success', target: '99.5% / 30d' }, { indicator: 'command latency p95', target: '≤ 2 s' }],
  workflow_state: [{ indicator: 'transitions applied in order', target: '100% (no reorder)' }, { indicator: 'stuck item age', target: '≤ 1 tick cadence' }],
  derived_results: [{ indicator: 'reproducible from declared inputs', target: '100% of retained runs' }, { indicator: 'run latency p95', target: 'declared per method' }],
  derived_quality_state: [{ indicator: 'quality state freshness', target: '≤ 1 evaluation cycle' }],
  adapter_no_authoritative_state: [{ indicator: 'contract-valid responses', target: '99% / 7d' }, { indicator: 'external semantics leaked', target: '0' }],
  presentation_projection: [{ indicator: 'render with stale/degraded marked', target: '100%' }, { indicator: 'read latency p95', target: '≤ 1.5 s' }],
};

/** The conformance evidence families (V03-T-452): those this repository's harnesses evidence today, and those carried by later stages. */
export const EVIDENCE_FAMILIES = [
  { family: 'contract', required: true, evidence: 'packages/contracts/test, apps/api/test/int (port and envelope contracts)', carried_by: null },
  { family: 'trust', required: true, evidence: 'apps/api/test/int (RLS, PDP, audit chain, provenance, correction, deletion)', carried_by: null },
  { family: 'human_authority', required: true, evidence: 'apps/api/test/int (approval, separation of duties, human gates, override, replay)', carried_by: null },
  { family: 'quality', required: false, evidence: null, carried_by: 'B64 (SLO computation) / H1 (journeys at load)' },
  { family: 'deployment', required: false, evidence: null, carried_by: 'B106 (deployment parity) / B111 (profiles)' },
  { family: 'operations', required: false, evidence: null, carried_by: 'B63 (runbooks) / B64' },
];

// ───────────────────────────────────────── the deployable units (curated; a discovered unit absent here is UNMAPPED) ─────────────────────────────────────────
/** unit id → { path, kind, owner, layers (hosted wholly), components (explicit ids), schemas (the state it owns), controls, quality, semantic }.
 *  `semantic`: 'layer' (a canonical layer's owner), 'control' (a control plane: identity, policy, audit, governance …), 'host' (hosts only —
 *  IA-01-003: never truth, policy meaning or a decision). */
export const UNIT_MAP = {
  'api.composition': { path: 'apps/api/src/app.module.ts', kind: 'api_composition_root', layers: [], components: ['CP-OPS-01'], schemas: [], semantic: 'host', controls: ['ADR-P0-02', 'ES-65-001'] },
  'api.analytics': { path: 'apps/api/src/analytics', kind: 'api_module', layers: [], components: ['DAT-SV-04', 'DAT-OP-01', 'DAT-OP-03'], schemas: ['analytics'], semantic: 'control', controls: ['REL-23', 'MET-001'] },
  'api.audit': { path: 'apps/api/src/audit', kind: 'api_module', layers: [], components: ['CP-AUD-01', 'DAT-TR-11', 'INF-ST-03'], schemas: ['audit'], semantic: 'control', controls: ['ES-24', 'ADR-P0-09'] },
  'api.commercial': { path: 'apps/api/src/commercial', kind: 'api_module', layers: [], components: ['INF-CP-12', 'DAT-DL-07'], schemas: ['commercial'], semantic: 'control', controls: ['ADR-022'] },
  'api.config': { path: 'apps/api/src/config', kind: 'api_module', layers: [], components: ['CP-CFG-01'], schemas: ['config'], semantic: 'control', controls: ['ADR-P0-15', 'ES-66'] },
  'api.decision': { path: 'apps/api/src/decision', kind: 'api_module', layers: [9], components: [], schemas: ['decision'], semantic: 'layer', controls: [] },
  'api.delivery': { path: 'apps/api/src/delivery', kind: 'api_module', layers: [], components: ['INF-DP-08', 'DAT-DL-04', 'DAT-DL-08'], schemas: ['onboarding', 'implementation', 'service'], semantic: 'control', controls: ['IA-04-001'] },
  'api.domains': { path: 'apps/api/src/domains', kind: 'api_module', layers: [], components: ['L7-C09', 'DAT-KN-11'], schemas: ['domain'], semantic: 'layer', controls: [] },
  'api.executive': { path: 'apps/api/src/executive', kind: 'api_module', layers: [10], components: [], schemas: ['executive'], semantic: 'layer', controls: [] },
  'api.governance': { path: 'apps/api/src/governance', kind: 'api_module', layers: [], components: ['DAT-GV-01', 'DAT-GV-02', 'DAT-GV-03', 'DAT-GV-04', 'DAT-GV-05', 'DAT-GV-06', 'DAT-GV-07', 'DAT-GV-08', 'DAT-GV-09', 'DAT-GV-10', 'INF-DP-10', 'INF-DL-08', 'INF-PF-04'], schemas: ['governance'], semantic: 'control', controls: ['ES-01-005', 'ES-02-002', 'V03-T-479'] },
  'api.graph': { path: 'apps/api/src/graph', kind: 'api_module', layers: [4], components: ['L3-C06', 'L3-C07', 'L3-C09'], schemas: ['graph', 'memory'], semantic: 'layer', controls: [] },
  'api.health': { path: 'apps/api/src/health', kind: 'api_module', layers: [], components: ['CP-OPS-01', 'INF-OP-11'], schemas: [], semantic: 'host', controls: ['ES-66'] },
  'api.identity': { path: 'apps/api/src/identity', kind: 'api_module', layers: [], components: ['CP-IAM-01', 'INF-TR-01'], schemas: ['identity'], semantic: 'control', controls: ['ADR-P0-17'] },
  'api.intelligence': { path: 'apps/api/src/intelligence', kind: 'api_module', layers: [2], components: ['INF-PF-08'], schemas: ['intelligence'], semantic: 'layer', controls: [] },
  'api.objects': { path: 'apps/api/src/objects', kind: 'api_module', layers: [], components: ['CP-OBJ-01', 'L3-C01', 'L3-C03', 'L3-C04', 'DAT-SM-02', 'DAT-SM-03'], schemas: ['objects', 'canon'], semantic: 'layer', controls: ['ES-20', 'ES-21'] },
  'api.observation': { path: 'apps/api/src/observation', kind: 'api_module', layers: [1], components: ['DAT-IN-01', 'DAT-IN-02', 'DAT-IN-03'], schemas: ['observation'], semantic: 'layer', controls: [] },
  'api.pipeline': { path: 'apps/api/src/pipeline', kind: 'api_module', layers: [], components: ['INF-TR-05', 'INF-NW-02'], schemas: ['ctx'], semantic: 'control', controls: ['ES-13-004', 'ADR-P0-10'] },
  'api.policy': { path: 'apps/api/src/policy', kind: 'api_module', layers: [], components: ['CP-POL-01', 'INF-TR-04', 'DAT-TR-02'], schemas: ['policy'], semantic: 'control', controls: ['ADR-P0-10'] },
  'api.prediction': { path: 'apps/api/src/prediction', kind: 'api_module', layers: [6, 7], components: [], schemas: ['prediction'], semantic: 'layer', controls: [] },
  'api.products': { path: 'apps/api/src/products', kind: 'api_module', layers: [], components: ['DAT-SV-01', 'DAT-SV-10', 'DAT-TR-01'], schemas: ['products'], semantic: 'layer', controls: [] },
  'api.retention': { path: 'apps/api/src/retention', kind: 'api_module', layers: [], components: ['L3-C02', 'L3-C05', 'L3-C08', 'DAT-TR-08', 'DAT-TR-09', 'DAT-TR-10', 'DAT-ST-06'], schemas: ['retention'], semantic: 'layer', controls: [] },
  /* B80 (0118): the shell's API — drafts, navigation states, the deep link's as-of read, the context bar's code */
  'api.shell': { path: 'apps/api/src/shell', kind: 'api_module', layers: [], components: ['CP-UX-02'], schemas: ['shell'], semantic: 'host', controls: ['PR-05-002', 'PAT-03'] },
  'api.shared': { path: 'apps/api/src/shared', kind: 'api_module', layers: [], components: ['CP-OPS-01'], schemas: [], semantic: 'host', controls: ['ADR-P0-02'] },
  'api.tenancy': { path: 'apps/api/src/tenancy', kind: 'api_module', layers: [], components: ['CP-TEN-01', 'DAT-GV-02'], schemas: ['tenancy'], semantic: 'control', controls: [] },
  'api.twin': { path: 'apps/api/src/twin', kind: 'api_module', layers: [5, 8], components: [], schemas: ['twin', 'simulation'], semantic: 'layer', controls: [] },
  'worker.collection': { path: 'apps/api/src/observation/scheduling/scheduler.service.ts', kind: 'worker', layers: [], components: ['L1-C03', 'INF-CP-08', 'DAT-IN-03'], schemas: [], semantic: 'host', controls: [] },
  'worker.extraction-plan': { path: 'apps/api/src/intelligence/plan/extraction-plan-worker.service.ts', kind: 'worker', layers: [], components: ['L2-C10', 'INF-CP-08'], schemas: [], semantic: 'host', controls: [] },
  'web.app': { path: 'apps/web', kind: 'web_app', layers: [], components: ['CP-UX-02', 'INF-PF-11'], schemas: [], semantic: 'host', controls: ['UX-ADR-010'] },
  'package.contracts': { path: 'packages/contracts', kind: 'package', layers: [], components: ['CP-OBJ-00'], schemas: [], semantic: 'control', controls: ['ES-20', 'ES-21', 'ES-24'] },
  'package.tokens': { path: 'packages/tokens', kind: 'package', layers: [], components: ['CP-UX-01'], schemas: [], semantic: 'host', controls: ['UX-ADR-010'] },
  /* B40 cr (0123 §CR): the published connector SDK — the Connector contract, the cell protocol eye-cell/1, the gateway client and the cell runtime */
  'package.connector-sdk': { path: 'packages/connector-sdk', kind: 'package', layers: [], components: ['L1-C02', 'INF-PF-12'], schemas: [], semantic: 'host', controls: ['V03-T-440', 'DP-14-003'] },
  /* end B40 cr */
  'infra.postgres': { path: 'docker-compose.yml#services.postgres', kind: 'infrastructure_service', layers: [], components: ['INF-ST-01', 'DAT-ST-04'], schemas: [], semantic: 'host', controls: ['ADR-P0-09'] },
  'infra.redis': { path: 'docker-compose.yml#services.redis', kind: 'infrastructure_service', layers: [], components: ['INF-ST-11', 'DAT-ST-08'], schemas: [], semantic: 'host', controls: [] },
};

/** The AI planes (Volume 5 Ch. 8 — AI-08-001): one accountable owner, state classes, versioned interfaces, the deployment boundary (units),
 *  declared SLO targets (B64), failure domains and conformance suites (the suites' independent verification is H2). */
export const AI_PLANES = [
  { plane: 'model', owner: OWNER, units: ['api.intelligence', 'api.prediction'], state_classes: ['adapter_no_authoritative_state', 'derived_results'], interfaces: ['L2-I01', 'L6-I01'],
    failure_domains: ['model gateway', 'provider egress'], suites: ['apps/api/test/int/phase2-*.test.ts', 'apps/api/test/int/phase4-*.test.ts'] },
  { plane: 'context', owner: OWNER, units: ['api.graph', 'api.objects', 'api.retention'], state_classes: ['authoritative_store', 'derived_results'], interfaces: ['L3-I02', 'L4-I04'],
    failure_domains: ['postgres:memory', 'postgres:graph'], suites: ['apps/api/test/int/phase3-*.test.ts'] },
  { plane: 'agent', owner: OWNER, units: ['api.executive', 'api.observation'], state_classes: ['workflow_state'], interfaces: ['L10-I02', 'L1-I02'],
    failure_domains: ['redis:attention-queue', 'agent sessions'], suites: ['apps/api/test/int/phase6-*-b24.test.ts', 'apps/api/test/int/phase6-*-b34.test.ts'] },
  { plane: 'assurance', owner: OWNER, units: ['api.policy', 'api.audit', 'api.pipeline', 'api.governance'], state_classes: ['authoritative_owner', 'derived_quality_state'], interfaces: ['L9-I05', 'L10-I05'],
    failure_domains: ['postgres:audit', 'postgres:policy'], suites: ['apps/api/test/int/gate21-*.test.ts', 'apps/api/test/int/gate22-*.test.ts', 'apps/api/test/acceptance/acceptance.test.ts'] },
  { plane: 'ai_product', owner: OWNER, units: ['api.prediction', 'api.twin', 'api.decision'], state_classes: ['authoritative_owner', 'derived_results'], interfaces: ['L6-I03', 'L8-I03', 'L9-I03'],
    failure_domains: ['postgres:prediction', 'postgres:simulation', 'postgres:decision'], suites: ['apps/api/test/int/phase6-*-b25.test.ts', 'apps/api/test/int/phase6-*-b35.test.ts'] },
];

/** The generated artifacts of this repository and their authoritative sources (ES-65-004): reproducible, and how the reproduction is reviewed. */
export const GENERATED_ARTIFACTS = [
  { artifact: MANIFEST_PATH, generator: GENERATOR_PATH, source: 'the repository (modules, workers, packages, compose) + audit/requirements v03/v06/v07 (read only)', review: 'unit test: regenerated equals committed' },
  { artifact: 'packages/tokens dist CSS', generator: 'packages/tokens/src/emit-css.ts', source: 'packages/tokens/src (the V9 App A token registry)', review: 'packages/tokens/test' },
  { artifact: 'packages/contracts dist', generator: 'tsc -p packages/contracts', source: 'packages/contracts/src', review: 'clean-source typecheck + build (ci build-test)' },
  { artifact: 'SBOM (CycloneDX 1.6)', generator: 'scripts/generate-sbom.mjs', source: 'pnpm-lock.yaml', review: 'supply-chain gate: bidirectional reconciliation' },
  { artifact: 'evidence/tracked-source-manifest.sha256', generator: 'scripts/generate-evidence.mjs', source: 'the tracked tree', review: 'recorded, not gated' },
];

// ───────────────────────────────────────── helpers ─────────────────────────────────────────
const sha256 = (s) => createHash('sha256').update(s).digest('hex');
const posix = (p) => p.split(sep).join('/');
const read = (root, rel) => readFileSync(join(root, rel), 'utf8');

/** RFC-4180 CSV (the audit CSVs quote fields with commas, quotes and newlines). */
export function parseCsv(text) {
  const rows = []; let row = []; let field = ''; let q = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else q = false; } else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i += 1; row.push(field); rows.push(row); row = []; field = ''; }
    else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  const [head, ...body] = rows;
  return body.filter((r) => r.length > 1).map((r) => Object.fromEntries(head.map((h, i) => [h, r[i] ?? ''])));
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name);
    if (name === 'node_modules' || name === 'dist' || name.startsWith('.')) continue;
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out); else out.push(p);
  }
  return out;
}

/** The deployable units DISCOVERED in the repository (what must be mapped): { path, kind, module? }. */
export function discoverUnits(root) {
  const units = [];
  const api = join(root, 'apps/api/src');
  units.push({ path: 'apps/api/src/app.module.ts', kind: 'api_composition_root', module: 'AppModule' });
  for (const d of readdirSync(api).sort()) {
    const f = join(api, d, `${d}.module.ts`);
    if (!existsSync(f)) continue;
    const m = /export class (\w+Module)\b/.exec(readFileSync(f, 'utf8'));
    units.push({ path: `apps/api/src/${d}`, kind: 'api_module', module: m ? m[1] : null });
  }
  for (const f of walk(api)) {
    if (!f.endsWith('.ts')) continue;
    const t = readFileSync(f, 'utf8');
    if (/from 'bullmq'/.test(t) && /new Worker\(/.test(t)) units.push({ path: posix(relative(root, f)), kind: 'worker', module: null });
  }
  for (const d of readdirSync(join(root, 'apps')).sort()) if (d !== 'api' && existsSync(join(root, 'apps', d, 'package.json'))) units.push({ path: `apps/${d}`, kind: 'web_app', module: null });
  for (const d of readdirSync(join(root, 'packages')).sort()) if (existsSync(join(root, 'packages', d, 'package.json'))) units.push({ path: `packages/${d}`, kind: 'package', module: null });
  const compose = read(root, 'docker-compose.yml').split('\n');
  let inServices = false;
  for (const line of compose) {
    if (/^services:\s*$/.test(line)) { inServices = true; continue; }
    if (/^\S/.test(line)) inServices = false;
    const m = /^ {2}([a-z0-9_-]+):\s*$/.exec(line);
    if (inServices && m) units.push({ path: `docker-compose.yml#services.${m[1]}`, kind: 'infrastructure_service', module: null });
  }
  return units;
}

/** The discovered units that UNIT_MAP does not map (the "no unmapped unit" check). */
export function unmappedUnits(root) {
  const mapped = new Set(Object.values(UNIT_MAP).map((u) => u.path));
  return discoverUnits(root).filter((u) => !mapped.has(u.path)).map((u) => u.path);
}

/** A module file's array literal (controllers / imports) as the identifiers it names. */
function namesIn(text, key) {
  const m = new RegExp(`\\b${key}:\\s*\\[([\\s\\S]*?)\\]\\s*,?\\s*\\n`).exec(text);
  if (!m) return [];
  const body = m[1].replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  return [...new Set(body.match(/\b[A-Z]\w+\b/g) ?? [])].sort();
}

function moduleFacts(root, unit) {
  if (unit.kind !== 'api_module' && unit.kind !== 'api_composition_root') return { controllers: [], imports: [] };
  const file = unit.kind === 'api_module' ? `${unit.path}/${unit.path.split('/').pop()}.module.ts` : unit.path;
  const text = read(root, file);
  return { controllers: namesIn(text, 'controllers'), imports: namesIn(text, 'imports').filter((n) => n.endsWith('Module')) };
}

function logicalComponents(root) {
  const verbs = Object.keys(STATE_CLASS);
  const re = new RegExp(` (${verbs.join('|')}) `);
  return parseCsv(read(root, 'audit/requirements/v03.csv'))
    .filter((r) => /^L\d+-C\d\d$/.test(r.id))
    .map((r) => {
      const m = re.exec(r.clause);
      if (!m) throw new Error(`${r.id}: the clause names no duty verb (${verbs.join(', ')})`);
      return { id: r.id, layer: Number(/^L(\d+)-/.exec(r.id)[1]), name: r.clause.slice(0, m.index).trim(), duty: r.clause.slice(m.index + 1).trim(), verb: m[1] };
    });
}

function catalogue(root, file, prefix) {
  return parseCsv(read(root, file)).filter((r) => new RegExp(`^${prefix}-[A-Z]+-\\d+$`).test(r.id)).map((r) => ({ id: r.id, group: r.id.split('-')[1], text: r.clause.trim() }));
}

/** Canonical JSON (sorted keys, two-space indent, trailing newline) — the committed bytes. */
export function canonical(v) {
  const sort = (x) => (Array.isArray(x) ? x.map(sort) : x !== null && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sort(x[k])])) : x);
  return `${JSON.stringify(sort(v), null, 2)}\n`;
}

// ───────────────────────────────────────── the manifest ─────────────────────────────────────────
/** What each kind of unit is built into, and which suites exercise it (declared; the per-test evidence is §RG's verification record). */
const ARTIFACT_OF = {
  api_composition_root: 'the API process (tsc → apps/api/dist; one Node process: the modular monolith, ADR-P0-02)',
  api_module: 'compiled into the API process (tsc → apps/api/dist)', worker: 'a BullMQ worker inside the API process',
  web_app: 'the Next.js application (apps/web)', package: 'a workspace package (tsc → dist)', infrastructure_service: 'a Compose service on its pinned image (conformance.manifest.json pinned_images)',
};
const TESTS_OF = {
  api_composition_root: ['apps/api/test/acceptance', 'apps/api/test/int'], api_module: ['apps/api/test/unit', 'apps/api/test/int'], worker: ['apps/api/test/int'],
  web_app: ['apps/web/lib/*.test.ts', 'e2e'], package: ['packages/*/test'], infrastructure_service: ['apps/api/test/gate (C15–C19 supply-chain gates)'],
};

/** AI-01-004: the conditions under which an implementation may represent itself as The Eye, each with where its evidence lives (or its carrier). */
export const REPRESENTATION_BOUNDARY = [
  { condition: 'human final authority', evidence: 'the PDP human gates and the ports\' approver tests (apps/api/test/int)', carrier: null },
  { condition: 'temporal truth', evidence: 'the truth-state and temporal semantics suites (apps/api/test/int, packages/contracts/test)', carrier: null },
  { condition: 'end-to-end provenance', evidence: 'the audit chain and provenance suites (apps/api/test/int)', carrier: null },
  { condition: 'tenant isolation', evidence: 'RLS and domain-isolation suites (apps/api/test/int)', carrier: null },
  { condition: 'deployment semantic parity', evidence: null, carrier: 'B106 (the parity runner) / B111 (profiles)' },
  { condition: 'governed learning', evidence: null, carrier: 'B75' },
];

export function generateManifest(root) {
  const discovered = discoverUnits(root);
  const pkg = JSON.parse(read(root, 'package.json'));
  const build = { environment: `node ${pkg.engines?.node ?? '?'} · ${pkg.packageManager ?? 'pnpm'} (frozen lockfile)` };
  const lcs = logicalComponents(root);
  const inf = catalogue(root, 'audit/requirements/v06.csv', 'INF');
  const dat = catalogue(root, 'audit/requirements/v07.csv', 'DAT');
  const cpUnits = JSON.parse(read(root, 'conformance.manifest.json')).units ?? [];
  const cp = [...new Map(cpUnits.flatMap((u) => (u.component_ids ?? []).map((id) => [id, { id, path: u.path, description: u.description, controls: u.controls ?? [], owner: u.owner }]))).values()]
    .sort((a, b) => a.id.localeCompare(b.id));
  const knownIds = new Set([...lcs.map((c) => c.id), ...inf.map((c) => c.id), ...dat.map((c) => c.id), ...cp.map((c) => c.id)]);
  const byPath = new Map(Object.entries(UNIT_MAP).map(([id, u]) => [u.path, { id, ...u }]));
  const moduleToUnit = new Map();
  for (const d of discovered) if (d.module && byPath.has(d.path)) moduleToUnit.set(d.module, byPath.get(d.path).id);
  const interfacesOf = (n) => [1, 2, 3, 4, 5].map((i) => `L${n}-I0${i}`);

  const units = discovered.map((d) => {
    const u = byPath.get(d.path);
    if (!u) return { unit_id: null, path: d.path, kind: d.kind, mapped: false, reason: 'no entry in UNIT_MAP: the unit cannot resolve to an approved component identity (IA-01-005)' };
    const facts = moduleFacts(root, u);
    const components = [...new Set([...u.layers.flatMap((n) => lcs.filter((c) => c.layer === n).map((c) => c.id)), ...u.components])].sort();
    const unresolved = components.filter((id) => !knownIds.has(id));
    return {
      unit_id: u.id, path: u.path, kind: u.kind, mapped: unresolved.length === 0 && components.length > 0, ...(unresolved.length > 0 ? { unresolved_components: unresolved } : {}),
      owner: OWNER, component_ids: components, layers: u.layers.map((n) => `L${n}`),
      state_boundary: { schemas: u.schemas, access: u.schemas.length === 0 ? 'no owned state' : 'writes only through its schemas\' SECURITY DEFINER ports; reads under RLS' },
      public_contract: { module: d.module, controllers: facts.controllers,
                         ports: u.schemas.map((s) => `${s}.* SECURITY DEFINER ports (REVOKE PUBLIC; eye_commit)`) },
      dependencies: facts.imports.map((m) => moduleToUnit.get(m) ?? `unmapped:${m}`).filter((x) => x !== u.id).sort(),
      controls: [...new Set([...u.controls, ...u.layers.map((n) => LAYERS[n - 1].chapter)])].sort(),
      quality_obligations: u.layers.length > 0 ? u.layers.map((n) => `the declared SLO targets of L${n}'s components (B64 computes)`) : ['the declared targets of its components (B64 computes)'],
      semantic_authority: u.semantic,
      plane_boundaries: { state: u.schemas.length === 0 ? 'none owned' : u.schemas.join(', '), telemetry: 'the audit chain partition (platform | tenant) and the module logger', policy: 'PDP exact rules for its actions',
                          resource: 'its database role (eye_commit ports / eye_app reads) and its queue names', failure: (u.layers[0] !== undefined ? LAYERS[u.layers[0] - 1].failure.join('; ') : 'process:api'), audit: 'every governed act through the pipeline (POL + AUD)' },
      release_path: 'build-test → browser-regression → supply-chain (ci.yml); a release candidate record (B65 substituted) — never a release',
      build: { environment: build.environment, artifact: ARTIFACT_OF[u.kind] ?? 'unknown', reproducible_from: u.kind === 'infrastructure_service' ? 'the pinned image digest' : 'the tracked source + pnpm-lock.yaml' },
      tests: { suites: TESTS_OF[u.kind] ?? [], selector: u.kind === 'api_module' ? `the suites importing ${u.path}/` : 'the suites named', verification: 'H2 (independent)' },
      deployment_targets: ['local-dev'],
    };
  });

  const deployers = (id) => units.filter((u) => u.mapped !== false && (u.component_ids ?? []).includes(id)).map((u) => u.unit_id).sort();
  const logical = lcs.map((c) => {
    const L = LAYERS[c.layer - 1]; const cls = STATE_CLASS[c.verb];
    return {
      component_id: c.id, name: c.name, duty: c.duty, layer: `L${c.layer}`, layer_name: L.name, owner: OWNER, accountable_role: 'conformance_steward (registry) / founding-engineer (engineering)',
      state_class: cls, state_class_basis: `the Volume 3 duty verb "${c.verb}"`,
      contracts: { interfaces: interfacesOf(c.layer), schema_types: [...L.objects].sort(), schema_versions: 'resolved live from objects.schema_registry at registration' },
      dependencies: { layers: L.reads.map((n) => `L${n}`), deployed_by: deployers(c.id) },
      controls: [`${L.chapter}-002`, L.chapter, 'ADR-0001'],
      slo: { declared: true, computed: false, carrier: 'B64', targets: SLO[cls] },
      failure_domains: L.failure,
      recovery: { procedure: `restore ${c.name} from its owned state (the database backup and the audit chain), replay its governed events in order, re-run the conformance check`, affected_product_semantics: L.affected, runbook_carrier: 'B63' },
      evidence_families: EVIDENCE_FAMILIES.map((f) => f.family),
      requirement: `V3:${c.id}`,
    };
  });

  const service_manifests = LAYERS.map((L) => ({ requirement: `${L.chapter}-002`, layer: `L${L.n}`, layer_name: L.name, components: logical.filter((c) => c.layer === `L${L.n}`).map((c) => c.component_id) }));

  return {
    $comment: `GENERATED by ${GENERATOR_PATH} — never edited by hand. Regenerate: node ${GENERATOR_PATH} --write. A declaration from source (CONSTRUCTION): it never states a component conformant, healthy or accepted — the conformance service reads evidence for that. SLO targets are DECLARED (B64 computes); runbooks are B63's; production reconciliation is R1; layer reconciliation B109/B110.`,
    schema: SCHEMA,
    generator: GENERATOR_PATH,
    sources: ['apps/api/src/*/*.module.ts', 'apps/api/src/**/*.ts (bullmq workers)', 'apps/*', 'packages/*', 'docker-compose.yml', 'conformance.manifest.json (units, read only)', 'audit/requirements/v03.csv (L*-C*, read only)', 'audit/requirements/v06.csv (INF-*, read only)', 'audit/requirements/v07.csv (DAT-*, read only)'],
    summary: {
      deployable_units: units.length, unmapped_units: units.filter((u) => u.mapped === false).length, logical_components: logical.length,
      platform_components: cp.length, infrastructure_components: inf.length, data_components: dat.length, layers: LAYERS.length, ai_planes: AI_PLANES.length,
    },
    layers: LAYERS.map((L) => ({ layer: `L${L.n}`, name: L.name, chapter: L.chapter, service_manifest_requirement: `${L.chapter}-002`, interfaces: interfacesOf(L.n), schema_types: [...L.objects].sort(),
                                 reads_from: L.reads.map((n) => `L${n}`), hosted_by: L.units, failure_domains: L.failure, affected_product_semantics: L.affected })),
    deployable_units: units,
    logical_components: logical,
    service_manifests,
    platform_components: cp.map((c) => ({ component_id: c.id, path: c.path, description: c.description, controls: c.controls, owner: c.owner, deployed_by: deployers(c.id) })),
    infrastructure_components: inf.map((c) => ({ component_id: c.id, group: c.group, catalogue_entry: c.text, deployed_by: deployers(c.id),
                                                 disposition: deployers(c.id).length > 0 ? 'hosted by a declared unit (its requirement row states its status)' : 'catalogued — no deployable realization declared in this repository (local-dev profile only)' })),
    data_components: dat.map((c) => ({ component_id: c.id, group: c.group, catalogue_entry: c.text, deployed_by: deployers(c.id),
                                       disposition: deployers(c.id).length > 0 ? 'hosted by a declared unit (its requirement row states its status)' : 'catalogued — no deployable realization declared in this repository' })),
    ai_planes: AI_PLANES.map((p) => ({ ...p, slo: { declared: true, computed: false, carrier: 'B64', targets: [{ indicator: 'plane admission available', target: '99.5% / 30d' }] }, conformance_suites_verification: 'H2' })),
    frozen_contracts: { interfaces: LAYERS.flatMap((L) => interfacesOf(L.n)), schema_types: [...new Set(LAYERS.flatMap((L) => L.objects))].sort(), rule: 'technology and providers are replaceable behind these identities; a change to one is a new version, never a redefinition (IA-72-003)' },
    evidence_families: EVIDENCE_FAMILIES,
    generated_artifacts: GENERATED_ARTIFACTS,
    profiles: { declared: ['local-dev'], carrier: 'B106 / B111 (the profile catalogue and deployment parity); R1 (production)' },
    representation_boundary: { requirement: 'AI-01-004', rule: 'an implementation that bypasses any condition below does not represent itself as The Eye', conditions: REPRESENTATION_BOUNDARY },
    boundary: 'CONSTRUCTION: a manifest generated from source. DEMONSTRATED OPERATION is the act on eye_demo; REAL ACCEPTANCE (R1/R2/H2/H3) is never claimed here.',
  };
}

/** The committed file's bytes and the regenerated bytes (the unit test's "regenerated equals committed"). */
export function render(root) { return canonical(generateManifest(root)); }
export function digestOf(text) { return sha256(text); }

// ───────────────────────────────────────── CLI ─────────────────────────────────────────
const self = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && resolve(process.argv[1]) === self) {
  const root = resolve(dirname(self), '../../../../..');
  const out = render(root);
  const target = join(root, MANIFEST_PATH);
  if (process.argv.includes('--write')) {
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, out);
    console.log(`wrote ${MANIFEST_PATH} (sha256 ${digestOf(out)})`);
  } else if (process.argv.includes('--check')) {
    const committed = existsSync(target) ? readFileSync(target, 'utf8') : '';
    const unmapped = unmappedUnits(root);
    if (committed !== out) { console.error(`${MANIFEST_PATH} differs from its regeneration: run node ${GENERATOR_PATH} --write and commit`); process.exitCode = 1; }
    if (unmapped.length > 0) { console.error(`unmapped deployable units: ${unmapped.join(', ')} — map each in UNIT_MAP`); process.exitCode = 1; }
    if (process.exitCode !== 1) console.log(`${MANIFEST_PATH} is current (sha256 ${digestOf(out)})`);
  } else process.stdout.write(out);
}
