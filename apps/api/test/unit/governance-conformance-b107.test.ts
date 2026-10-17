/**
 * CP-6 B107 §CM — THE BUILD-TEST CHECKS of the generated component conformance manifest (no workflow change: these run inside the existing
 * build-test's unit tests) and the PURE LOGIC of conformance. No database, no network.
 *
 *   "regenerated equals committed" (ES-65-004: a generated artifact is reproducible from its authoritative sources) and "no unmapped unit"
 *   (IA-01-005, DP-65-005: a deployable unit that cannot resolve to an approved component identity blocks the build); ES-01-001 / ES-65-001
 *   (every unit declares layer, components, owner, state boundary, contracts, quality obligations); ES-31..40-002 (a service manifest for
 *   every logical component of every layer); V04-T-004 (the 92 identities); IA-01-003 (a hosting unit never owns truth, policy meaning or a
 *   decision); AI-08-001/-005 (planes and plane boundaries); the conformance.manifest.json reference; then the monitor's findings, the state per
 *   component (never inferred), the closure gap report and the check's refusal order. SYNTHETIC inputs only.
 */
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// the generator is plain Node (it runs in build-test without a TypeScript loader)
import { AI_PLANES, LAYERS, MANIFEST_PATH, GENERATOR_PATH, STATE_CLASS, UNIT_MAP, discoverUnits, generateManifest, parseCsv, render, unmappedUnits } from '../../src/governance/conformance/generate-components-manifest.mjs';
import { attestEligibility, closureGaps, componentStates, monitorFindings, refusalOf, type MonitorObservation } from '../../src/governance/conformance/conformance-logic.js';
import { gitHead, indexOf } from '../../src/governance/conformance/build-identity.js';

type Row = Record<string, unknown>;
const ROOT = join(__dirname, '..', '..', '..', '..');
const manifest = generateManifest(ROOT) as Row;
const units = manifest['deployable_units'] as Row[];
const logical = manifest['logical_components'] as Row[];

describe('the generated component manifest — the build-test checks', () => {
  it('REGENERATED EQUALS COMMITTED: conformance/components.manifest.json is exactly what the generator produces from this tree', () => {
    const committed = readFileSync(join(ROOT, MANIFEST_PATH), 'utf8');
    expect(render(ROOT) === committed, `${MANIFEST_PATH} is stale: run node ${GENERATOR_PATH} --write and commit`).toBe(true);
  });
  it('NO UNMAPPED UNIT: every discovered deployable unit (API modules, workers, apps, packages, Compose services) is mapped to declared components', () => {
    expect(unmappedUnits(ROOT), 'map each unit in UNIT_MAP (generate-components-manifest.mjs)').toEqual([]);
    expect(units.filter((u) => u['mapped'] !== true).map((u) => u['path'])).toEqual([]);
    const kinds = new Set(discoverUnits(ROOT).map((u: Row) => u['kind']));
    expect([...kinds].sort()).toEqual(['api_composition_root', 'api_module', 'infrastructure_service', 'package', 'web_app', 'worker']);
  });
  it('the unmapped-unit check BITES: a module, a package and a Compose service nobody mapped are reported', () => {
    const root = mkdtempSync(join(tmpdir(), 'b107-cm-'));
    try {
      for (const d of ['apps/api/src/rogue', 'apps/api/src/observation', 'apps/web', 'packages/stray', 'packages/contracts']) mkdirSync(join(root, d), { recursive: true });
      writeFileSync(join(root, 'apps/api/src/app.module.ts'), 'export class AppModule {}\n');
      writeFileSync(join(root, 'apps/api/src/rogue/rogue.module.ts'), 'export class RogueModule {}\n');
      writeFileSync(join(root, 'apps/api/src/observation/observation.module.ts'), 'export class ObservationModule {}\n');
      writeFileSync(join(root, 'apps/api/src/rogue/w.ts'), "import { Worker } from 'bullmq';\nnew Worker('q', async () => null);\n");
      for (const d of ['apps/web', 'packages/stray', 'packages/contracts']) writeFileSync(join(root, d, 'package.json'), '{}');
      writeFileSync(join(root, 'docker-compose.yml'), 'services:\n  postgres:\n    image: x\n  vault:\n    image: y\nvolumes:\n  data:\n');
      expect(unmappedUnits(root).sort()).toEqual(['apps/api/src/rogue', 'apps/api/src/rogue/w.ts', 'docker-compose.yml#services.vault', 'packages/stray']);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('V04-T-004 / ES-31..40-002: the 92 logical components, each in its layer\'s service manifest, with every service-manifest field', () => {
    expect(logical).toHaveLength(92);
    const sm = manifest['service_manifests'] as Row[];
    expect(sm.map((s) => s['requirement'])).toEqual(['ES-31-002', 'ES-32-002', 'ES-33-002', 'ES-34-002', 'ES-35-002', 'ES-36-002', 'ES-37-002', 'ES-38-002', 'ES-39-002', 'ES-40-002']);
    expect(sm.reduce((n, s) => n + (s['components'] as unknown[]).length, 0)).toBe(92);
    for (const c of logical) {
      const id = String(c['component_id']);
      expect(id).toMatch(/^L(10|[1-9])-C\d\d$/);
      expect(String(c['name']).length, id).toBeGreaterThan(3);
      expect(Object.values(STATE_CLASS)).toContain(c['state_class']);
      expect((c['contracts'] as Row)['interfaces'], id).toHaveLength(5);
      expect(((c['contracts'] as Row)['schema_types'] as unknown[]).length, id).toBeGreaterThan(0);
      expect((c['dependencies'] as Row)['deployed_by'], id).not.toHaveLength(0);
      expect(c['controls'], id).toContain(`${LAYERS[Number(id.slice(1, id.indexOf('-'))) - 1]!.chapter}-002`);
      expect(c['slo'], id).toMatchObject({ declared: true, computed: false, carrier: 'B64' });
      expect((c['failure_domains'] as unknown[]).length, id).toBeGreaterThan(0);
      expect(String((c['recovery'] as Row)['affected_product_semantics']).length, id).toBeGreaterThan(40);
      expect(c['owner'], id).toBe('founding-engineer');
    }
  });
  it('ES-01-001 / ES-65-001 / DP-65-002: every unit declares its owner, components (resolvable), layer(s), state boundary, public contract, dependencies, quality obligations and release path', () => {
    const known = new Set([...logical, ...(manifest['platform_components'] as Row[]), ...(manifest['infrastructure_components'] as Row[]), ...(manifest['data_components'] as Row[])].map((c) => String(c['component_id'])));
    for (const u of units) {
      const id = String(u['unit_id']);
      expect(u['owner'], id).toBe('founding-engineer');
      expect((u['component_ids'] as string[]).length, id).toBeGreaterThan(0);
      for (const c of u['component_ids'] as string[]) expect(known.has(c), `${id} → ${c}`).toBe(true);
      expect(Array.isArray(u['layers']), id).toBe(true);
      expect(u['state_boundary'], id).toHaveProperty('access');
      expect(u['public_contract'], id).toHaveProperty('ports');
      expect((u['dependencies'] as string[]).filter((d) => d.startsWith('unmapped:')), id).toEqual([]);
      expect((u['quality_obligations'] as unknown[]).length, id).toBeGreaterThan(0);
      expect(String(u['release_path']), id).toMatch(/never a release/);
      expect(u['build'], id).toMatchObject({ environment: expect.stringMatching(/^node /) });
      expect(((u['tests'] as Row)['suites'] as unknown[]).length, id).toBeGreaterThan(0);
      expect(u['deployment_targets'], id).toEqual(['local-dev']);
    }
    expect(units.find((u) => u['unit_id'] === 'api.governance')?.['dependencies']).toEqual(['api.pipeline']);
  });
  it('ES-65-002: no API unit writes another owner\'s state directly — no DML statement or query-builder write anywhere in apps/api/src (every write is a definer port)', () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const n of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, n.name);
        if (n.isDirectory()) walk(p);
        else if (n.name.endsWith('.ts') && (/\b(insert\s+into|delete\s+from)\s+[a-z_]+\.[a-z_]+|\bupdate\s+[a-z_]+\.[a-z_]+\s+set\b/i.test(readFileSync(p, 'utf8')) || /\.(insertInto|updateTable|deleteFrom)\(/.test(readFileSync(p, 'utf8')))) offenders.push(p);
      }
    };
    walk(join(ROOT, 'apps/api/src'));
    expect(offenders).toEqual([]);
  });
  it('AI-01-004: the representation boundary is exposed with each condition\'s evidence or carrier (parity B106, governed learning B75)', () => {
    const b = manifest['representation_boundary'] as Row;
    expect(b['requirement']).toBe('AI-01-004');
    const c = b['conditions'] as Row[];
    expect(c.map((x) => x['condition'])).toEqual(['human final authority', 'temporal truth', 'end-to-end provenance', 'tenant isolation', 'deployment semantic parity', 'governed learning']);
    expect(c.every((x) => (x['evidence'] === null) !== (x['carrier'] === null))).toBe(true);
  });
  it('IA-01-003: a HOSTING unit (infrastructure, worker, web, composition root) holds no canonical layer and nothing claims truth, policy meaning or a decision', () => {
    for (const u of units.filter((x) => ['infrastructure_service', 'worker', 'web_app', 'api_composition_root'].includes(String(x['kind'])))) {
      expect(u['semantic_authority'], String(u['unit_id'])).toBe('host');
      expect(u['layers'], String(u['unit_id'])).toEqual([]);
    }
    expect(JSON.stringify(manifest)).not.toMatch(/"owns_(truth|policy|decision)"/);
  });
  it('AI-08-001 / AI-08-005: every AI plane names its owner, state classes, interfaces, deployment units, declared SLOs, failure domains and suites; every API module its six plane boundaries', () => {
    const ids = new Set(units.map((u) => String(u['unit_id'])));
    expect((manifest['ai_planes'] as Row[]).map((p) => p['plane'])).toEqual(AI_PLANES.map((p: Row) => p['plane']));
    for (const p of manifest['ai_planes'] as Row[]) {
      for (const k of ['owner', 'state_classes', 'interfaces', 'units', 'failure_domains', 'suites']) expect((p[k] as unknown[] | string).length, `${String(p['plane'])}.${k}`).toBeGreaterThan(0);
      for (const u of p['units'] as string[]) expect(ids.has(u), u).toBe(true);
      expect(p['slo']).toMatchObject({ declared: true, computed: false });
    }
    for (const u of units.filter((x) => x['kind'] === 'api_module')) {
      const b = u['plane_boundaries'] as Row;
      for (const k of ['state', 'telemetry', 'policy', 'resource', 'failure', 'audit']) expect(String(b[k] ?? '').length, `${String(u['unit_id'])}.${k}`).toBeGreaterThan(0);
    }
  });
  it('conformance.manifest.json references the generated file through ONE new key; its frozen keys are present', () => {
    const doc = JSON.parse(readFileSync(join(ROOT, 'conformance.manifest.json'), 'utf8')) as Row;
    expect(doc['component_manifest']).toMatchObject({ path: MANIFEST_PATH, generator: GENERATOR_PATH, schema: 'eye.components-manifest/v1' });
    for (const k of ['pinned_images', 'units', 'runtime_authorities', 'gate_scripts']) expect(doc).toHaveProperty(k);
    expect(Object.keys(UNIT_MAP)).toHaveLength(units.length);
  });
  it('the reader: RFC-4180 CSV (quotes, commas, newlines); the git HEAD read from files', () => {
    expect(parseCsv('id,clause\nA,"x, ""y""\nz"\nB,plain\n')).toEqual([{ id: 'A', clause: 'x, "y"\nz' }, { id: 'B', clause: 'plain' }]);
    expect(gitHead(ROOT) ?? 'unknown').toMatch(/^([0-9a-f]{40}|unknown)$/);
    const idx = indexOf(manifest);
    expect(idx.components).toHaveLength(298);
    expect(idx.components.find((c) => c['component_id'] === 'INF-DP-01')).toMatchObject({ kind: 'infrastructure', requirement: 'V6:INF-DP-01' });
  });
});

// ─────────────────────────────── the pure logic ───────────────────────────────
const NOW = '2026-10-15T12:00:00.000Z';
const H = 'a'.repeat(40); const P = 'b'.repeat(64); const M = 'c'.repeat(64);
const obs = (over: Partial<MonitorObservation> = {}): MonitorObservation => ({
  identity: { head_sha: H, policy_bundle: { version: 'bundle-v1', digest: P }, manifest: { readable: true, file_digest: M, reason: null, path: 'conformance/components.manifest.json' } },
  migration_head: '0115_b107_x_cm.sql', registered: { manifest_id: 'm', version: 1, file_digest: M },
  candidates: [{ candidate_id: 'c1', version: 1, label: 'rc', state: 'conformant', head_sha: H, migration_head: '0115_b107_x_cm.sql', policy_bundle: { version: 'bundle-v1', digest: P },
                 manifest_digest: M, evidence: [{ item: 1, ref: 'r', family: 'trust', valid_until: '2026-11-01T00:00:00Z' }] }],
  holds: [], exceptions: [], now: NOW, ...over,
});

describe('monitorFindings — the local conformance monitor (V03-T-479, IA-01-002)', () => {
  it('nothing drifted → no finding; deterministic for the same observation', () => {
    expect(monitorFindings(obs())).toEqual([]);
  });
  it('drift of the policy bundle, the head, the migration head and the manifest each HOLD the candidate (conformance_drift)', () => {
    const f = monitorFindings(obs({ identity: { head_sha: 'd'.repeat(40), policy_bundle: { version: 'bundle-v1', digest: 'e'.repeat(64) }, manifest: { readable: true, file_digest: 'f'.repeat(64), reason: null, path: 'p' } },
                                    migration_head: '0116_next.sql' }));
    expect(f.map((x) => x.kind)).toEqual(['head_drift', 'manifest_drift', 'manifest_drift', 'migration_drift', 'policy_drift']);
    expect(f.filter((x) => x.subject_artifact === 'c1').every((x) => x.hold && x.hold_kind === 'conformance_drift')).toBe(true);
    expect(f.find((x) => x.subject_artifact === 'm')).toMatchObject({ kind: 'manifest_drift', hold: false });
  });
  it('an unknown head is never drift (never inferred); an unreadable manifest is a finding of its own; an unregistered one asks for registration', () => {
    expect(monitorFindings(obs({ identity: { ...obs().identity, head_sha: 'unknown' } }))).toEqual([]);
    expect(monitorFindings(obs({ identity: { ...obs().identity, manifest: { readable: false, file_digest: null, reason: 'missing', path: 'p' } } })).map((x) => x.kind)).toEqual(['manifest_unreadable']);
    expect(monitorFindings(obs({ registered: null })).map((x) => x.kind)).toEqual(['manifest_unregistered']);
  });
  it('expired evidence holds with evidence_stale; an expired-exception hold is reported (no second hold); an exception artifact past expiry reported; withdrawn candidates are not watched', () => {
    const f = monitorFindings(obs({ now: '2026-12-01T00:00:00Z', holds: [{ hold_id: 'h1', subject_artifact: 'c1', reason_kind: 'exception_expired', reason: 'EXC expired' }],
                                    exceptions: [{ artifact_id: 'x1', external_key: 'EXC-1', title: 't', expires_at: '2026-11-30T00:00:00Z' }, { artifact_id: 'x2', external_key: 'EXC-2', title: 't', expires_at: '2027-01-01T00:00:00Z' }] }));
    expect(f.map((x) => [x.kind, x.hold, x.hold_kind ?? null])).toEqual([['evidence_expired', true, 'evidence_stale'], ['exception_expired', false, null], ['exception_expiry_reported', false, null]]);
    expect(monitorFindings(obs({ now: '2026-12-01T00:00:00Z', candidates: [{ ...obs().candidates[0]!, state: 'withdrawn' }] }))).toEqual([]);
  });
});

describe('componentStates — the conformance service (DAT-GV-09): never inferred', () => {
  const comps: Row[] = [{ component_id: 'L1-C01', kind: 'logical', layer: 'L1', deployed_by: ['api.observation'] }, { component_id: 'INF-DP-01', kind: 'infrastructure', deployed_by: [] }];
  const cand = (state: string, digest = M, at = '2026-10-15T10:00:00Z') => ({ candidate_id: `c-${state}-${at}`, version: 1, label: 'rc', state, manifest_digest: digest, proposed_at: at, head_sha: H });
  const run = (candidates: ReturnType<typeof cand>[], extra: Partial<Parameters<typeof componentStates>[0]> = {}) =>
    componentStates({ components: comps, registered: { version: 1, file_digest: M }, candidates, openHoldsBySubject: {}, openDriftFindings: 0, ...extra }).map((c) => c.state);
  it('not deployed · unverified (no manifest / no candidate / not checked) · conformant_local only on a conformant or attested candidate of the CURRENT manifest', () => {
    expect(run([])).toEqual(['unverified', 'not_deployed']);
    expect(componentStates({ components: comps, registered: null, candidates: [], openHoldsBySubject: {}, openDriftFindings: 0 }).map((c) => c.state)).toEqual(['unverified', 'not_deployed']);
    expect(run([cand('assembled')])).toEqual(['unverified', 'not_deployed']);
    expect(run([cand('conformant', 'f'.repeat(64))])).toEqual(['unverified', 'not_deployed']);
    expect(run([cand('attested')])).toEqual(['conformant_local', 'not_deployed']);
  });
  it('the LATEST candidate decides: a newer refused or held one is shown, never the older good one; drift and open holds override', () => {
    expect(run([cand('attested', M, '2026-10-15T09:00:00Z'), cand('refused', M, '2026-10-15T11:00:00Z')])).toEqual(['nonconformant', 'not_deployed']);
    expect(run([cand('conformant')], { openDriftFindings: 1 })).toEqual(['drifted', 'not_deployed']);
    const c = cand('conformant');
    expect(run([c], { openHoldsBySubject: { [c.candidate_id]: 1 } })).toEqual(['held', 'not_deployed']);
  });
});

describe('closureGaps, refusalOf, attestEligibility', () => {
  it('the closure statement is a gap report, never a closure (B63 / B64 / B106 carried)', () => {
    const g = closureGaps(manifest);
    expect(g.statement).toMatch(/^Volume 4 \/ Volume 7 baseline closure is NOT reached/);
    expect(g.totals['runbook']).toBe(92);
    expect(g.totals['layer and component identity']).toBe(0);
    expect(g.components.every((c) => c.gaps.some((x) => x.carrier === 'B106'))).toBe(true);
  });
  it('the check\'s refusal: held > stale > evidence > unverifiable > foreign_version; conformant is no refusal', () => {
    expect(refusalOf({ outcome: 'conformant', reasons: [], holds: [] })).toBeNull();
    expect(refusalOf({ outcome: 'held', reasons: [{ class: 'stale', detail: 'x' }], holds: [{ reason_kind: 'exception_expired', reason: 'r' }] })).toMatchObject({ status: 409, cls: 'held' });
    expect(refusalOf({ outcome: 'refused', reasons: [{ class: 'foreign_version', detail: 'a' }, { class: 'stale', detail: 'b' }], holds: [] })).toMatchObject({ status: 409, cls: 'stale' });
    expect(refusalOf({ outcome: 'refused', reasons: [{ class: 'unverifiable', detail: 'a' }, { class: 'evidence', detail: 'b' }], holds: [] })).toMatchObject({ status: 422, cls: 'evidence' });
    expect(refusalOf({ outcome: 'refused', reasons: [{ class: 'foreign_version', detail: 'a' }], holds: [] })?.message).toBe('the candidate is refused — foreign_version: a');
  });
  it('the attestation\'s eligibility in words: an agent, no role, the proposer, a builder, not conformant, open holds', () => {
    const c = { proposed_by: 'p', builders: ['b'], state: 'conformant' };
    expect(attestEligibility({ principalKind: 'human', principalId: 'x', holdsAssurance: true, candidate: c, openHolds: 0 })).toEqual({ can_attest: true, reasons: [] });
    const r = attestEligibility({ principalKind: 'agent', principalId: 'p', holdsAssurance: false, candidate: { ...c, state: 'held', builders: ['p'] }, openHolds: 2 });
    expect(r.can_attest).toBe(false);
    expect(r.reasons).toHaveLength(6);
  });
});
