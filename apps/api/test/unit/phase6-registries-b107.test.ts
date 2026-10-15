/**
 * CP-6 B107 §RG (0115_b107_x_rg) — the PURE logic of the registries: the strict CSV reader, the read-only importers over the REAL repository
 * registers (every requirement row of audit/requirements/*.csv, the rowmap, DECISIONS.md, EXCEPTIONS.md — read, never written), the
 * obligation and verification-method rules (ES-03-001/-002), the exact-id citation tokens (never prose similarity), and the verification
 * record's normalisers (vitest / playwright / gate receipt — V04-T-012). Every report and row built here is SYNTHETIC.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { CsvError, csvObjects, parseCsv } from '../../src/governance/registries/csv.js';
import {
  canonical, decisionsSource, exceptionExpired, exceptionsSource, interfacesSource, obligations, parseExceptionBlock, requirementIndex, requirementTokens, requirementsSource,
  resolveRequirementKeys, rowmapSource, schemasSource, sha256, v8CapabilityIds, verificationMethod, VOLUME_CLASS,
} from '../../src/governance/registries/importers.js';
import { fromGateReceipt, fromPlaywright, fromVitest, relativeFile, testKey } from '../../src/governance/registries/reports.js';
import { buildIdentity, repoRoot } from '../../src/governance/registries/build-identity.js';

const ROOT = join(__dirname, '..', '..', '..', '..');
const reqFiles = () => readdirSync(join(ROOT, 'audit/requirements')).filter((f) => /^v[0-9]+(?:-v[0-9]+)?\.csv$/.test(f)).sort()
  .map((f) => ({ path: `audit/requirements/${f}`, text: readFileSync(join(ROOT, 'audit/requirements', f), 'utf8') }));

describe('the strict CSV reader', () => {
  it('quoted fields, doubled quotes, embedded newlines and CR LF', () => {
    expect(parseCsv('a,b\r\n"x, ""y""","line1\nline2"\n')).toEqual([['a', 'b'], ['x, "y"', 'line1\nline2']]);
    expect(csvObjects('id,v\nA,1\nB,2\n')).toEqual([{ id: 'A', v: '1' }, { id: 'B', v: '2' }]);
  });
  it('refuses a malformed file whole — an unterminated quote, a ragged row, a stray quote', () => {
    expect(() => parseCsv('a,"b\n')).toThrow(CsvError);
    expect(() => csvObjects('a,b\n1,2,3\n')).toThrow(/row 2 has 3 fields/);
    expect(() => parseCsv('a,b"c\n')).toThrow(/quote inside an unquoted field/);
  });
});

describe('the rules the importer applies (ES-03-001 / ES-03-002)', () => {
  it('obligations: SHALL/MUST are mandatory; two are COMPOUND; SHOULD/MAY are not mandatory', () => {
    expect(obligations('The product SHALL hold the release.')).toEqual({ count: 1, obligation: 'SHALL', mandatory: true });
    expect(obligations('It shall be X. It shall not be Y.')).toMatchObject({ count: 2, mandatory: true });
    expect(obligations('Operators should review it.')).toEqual({ count: 0, obligation: 'SHOULD', mandatory: false });
    expect(obligations('A narrative sentence.')).toEqual({ count: 0, obligation: null, mandatory: false });
  });
  it('a verification method is stated, executed or a test in scope — otherwise none (never invented)', () => {
    expect(verificationMethod({ notes: 'x. Spec verification class: Security test.' })).toEqual({ method: 'Security test', basis: 'stated' });
    expect(verificationMethod({ notes: '', verif_status: 'passed:harness+ci' })).toEqual({ method: 'executed (harness+ci)', basis: 'register_status' });
    expect(verificationMethod({ notes: '', verif_status: 'unverified', evidence_scope: 'main+test' })).toEqual({ method: 'test (evidence scope)', basis: 'evidence_scope' });
    expect(verificationMethod({ notes: '', verif_status: 'unverified', evidence_scope: 'main' })).toEqual({ method: '', basis: null });
  });
  it('citation tokens are exact identities (ES-, V03-T-, CAP-AU-, L1-C04, C-001), resolved per volume — an ambiguous id resolves to every volume', () => {
    expect(requirementTokens('ES-06-001 and V03-T-474; CAP-AU-09, L1-C04 L3-I02 C-001 JRN-24 F-P7D-25 EYE_AUT_001')).toEqual(
      ['ES-06-001', 'V03-T-474', 'CAP-AU-09', 'L1-C04', 'L3-I02', 'C-001', 'JRN-24', 'F-P7D-25']);
    const idx = new Map([['JRN-24', ['V8', 'V9']], ['ES-06-001', ['V4']]]);
    expect(resolveRequirementKeys(['JRN-24', 'ES-06-001', 'NOPE-01'], idx)).toEqual({ keys: ['V4:ES-06-001', 'V8:JRN-24', 'V9:JRN-24'], unresolved: ['NOPE-01'] });
  });
});

describe('THE IMPORTERS over the REAL repository registers (read-only)', () => {
  const files = reqFiles();
  const catalogue = v8CapabilityIds(files.find((f) => f.path.endsWith('v08.csv'))!.text);
  const plans = files.map((f) => requirementsSource(f.path, f.text, catalogue));
  it('every requirement row of every file, each `<volume>:<id>` once, its class the volume\'s (6,264 rows)', () => {
    const reqs = plans.flatMap((p) => p.items.filter((i) => i.kind === 'requirement'));
    expect(reqs.length).toBe(6264);
    expect(new Set(reqs.map((r) => r.k)).size).toBe(6264);
    for (const r of reqs) expect(r.authority_class).toBe(VOLUME_CLASS[r.controlling_volume!]);
    expect(reqs.find((r) => r.k === 'V4:ES-06-004')).toMatchObject({ title: expect.stringMatching(/^ES-06-004 — A controlling change SHALL trigger/), attributes: { mandatory: true, obligation: 'SHALL' } });
    // every requirement is placed in its chapter
    for (const p of plans) expect(p.links.filter((l) => l.relation === 'part_of').length).toBe(p.items.filter((i) => i.kind === 'requirement').length);
  });
  it('V8 App A → 108 capabilities, App D → 24 journeys, each mapped to its row; the V9 App N bindings map them to V9 rows and chapters', () => {
    const v8 = plans.find((p) => p.source_path.endsWith('v08.csv'))!; const v9 = plans.find((p) => p.source_path.endsWith('v09.csv'))!;
    expect(v8.items.filter((i) => i.kind === 'capability')).toHaveLength(108);
    expect(v8.items.filter((i) => i.kind === 'journey')).toHaveLength(24);
    expect(v8.links).toContainEqual(expect.objectContaining({ from_kind: 'capability', from_key: 'CAP-FW-07', to_key: 'V8:CAP-FW-07', relation: 'maps_to' }));
    expect(v9.links).toContainEqual(expect.objectContaining({ from_kind: 'capability', from_key: 'CAP-FW-07', to_key: 'V9:CAP-FW-07' }));
    expect(v9.links.some((l) => l.from_key === 'CAP-FW-07' && l.to_kind === 'standard' && l.to_key.startsWith('V9:chapter:36 '))).toBe(true);
    // a capability V9 binds that V8 does not define is declared by V9 (never left unresolved, never declared twice)
    const v9caps = v9.items.filter((i) => i.kind === 'capability').map((i) => i.k);
    expect(v9caps.length).toBeGreaterThan(0); expect(v9caps.every((k) => !catalogue.has(k))).toBe(true);
    const all = new Set([...v8.items, ...v9.items].filter((i) => i.kind === 'capability').map((i) => i.k));
    expect(v9.links.filter((l) => l.from_kind === 'capability').every((l) => all.has(l.from_key))).toBe(true);
    const keysV9 = new Set(v9.items.map((i) => `${i.kind}|${i.k}`));
    expect(v9.links.filter((l) => l.to_kind === 'standard').every((l) => keysV9.has(`standard|${l.to_key}`))).toBe(true);
  });
  it('the register\'s delivery status is carried apart from the normative content (attributes.register)', () => {
    const r = plans[3]!.items.find((i) => i.kind === 'requirement')!;
    expect(r.attributes['register']).toMatchObject({ impl_status: expect.any(String), verif_status: expect.any(String) });
    expect(r.attributes['clause_digest']).toBe(sha256(String(r.attributes['clause'])));
  });
  it('the rowmap: every row → `feature implements requirement`; features titled from the tracker; one digest over both files', () => {
    const rm = readFileSync(join(ROOT, 'audit/delivery/feature-rowmap.csv'), 'utf8'); const tr = readFileSync(join(ROOT, 'audit/delivery/FEATURE_TRACKER.csv'), 'utf8');
    const p = rowmapSource('audit/delivery/feature-rowmap.csv', rm, tr);
    expect(p.links).toHaveLength(6264);
    expect(p.items.find((i) => i.k === 'F-P7D-25')!.title).toMatch(/^F-P7D-25 — /);
    expect(p.source_digest).toBe(sha256(`${sha256(rm)}:${sha256(tr)}`));
    const keys = new Set(plans.flatMap((q) => q.items.filter((i) => i.kind === 'requirement').map((i) => i.k)));
    expect(p.links.every((l) => keys.has(l.to_key))).toBe(true);
  });
  it('DECISIONS.md → 17 decision records citing their resolvable anchors; EXCEPTIONS.md → the engineering class, EXC-P0-003 reported expired on 2026-10-15', () => {
    const idx = requirementIndex(files);
    const d = decisionsSource('DECISIONS.md', readFileSync(join(ROOT, 'DECISIONS.md'), 'utf8'), idx);
    expect(d.items).toHaveLength(17);
    expect(d.links).toContainEqual(expect.objectContaining({ from_key: 'ADR-P0-02', to_key: 'V4:ES-04-002', relation: 'cites' }));
    const e = exceptionsSource('EXCEPTIONS.md', readFileSync(join(ROOT, 'EXCEPTIONS.md'), 'utf8'), idx);
    const x = e.items.find((i) => i.k === 'EXCEPTIONS.md:EXC-P0-003')!;
    expect(x).toMatchObject({ kind: 'exception', lifecycle: 'active', attributes: { class: 'engineering', status: 'open', expiry_date: '2026-09-30' } });
    expect(exceptionExpired('2026-09-30', '2026-10-15')).toBe(true);
    expect(exceptionExpired('2026-10-31', '2026-10-15')).toBe(false);
    expect(exceptionExpired('2026-10-15', '2026-10-15')).toBe(false); // a DATE is the day it names: valid through that day
    expect(e.links.some((l) => l.from_key === 'EXCEPTIONS.md:EXC-P0-003' && l.to_key === 'V4:ES-68-001')).toBe(true);
  });
  it('the importers never write: the registers\' bytes and modification times are unchanged after reading', () => {
    const before = files.map((f) => statSync(join(ROOT, f.path)).mtimeMs);
    reqFiles().forEach((f) => requirementsSource(f.path, f.text));
    expect(files.map((f) => statSync(join(ROOT, f.path)).mtimeMs)).toEqual(before);
  });
  it('a YAML exception block: scalars, inline lists, nested lists, trailing comments', () => {
    expect(parseExceptionBlock('exception_id:   EXC-X-1\nrequirement_ids: [A-01, B-02]\nnotes:\n  - one\n  - two\nstatus:  open   # enum\n')).toEqual(
      { exception_id: 'EXC-X-1', requirement_ids: ['A-01', 'B-02'], notes: ['one', 'two'], status: 'open' });
  });
  it('the database registers: interfaces map to their V3 row; schemas digest their JSON Schema; canonical JSON sorts keys', () => {
    const i = interfacesSource([{ interface_id: 'L1-I01', name: 'RegisterSource', contract: 'c', requirement: 'V3:L1-I01', binding_state: 'bound' }]);
    expect(i.links).toEqual([expect.objectContaining({ from_key: 'L1-I01', to_key: 'V3:L1-I01', relation: 'maps_to' })]);
    const s = schemasSource([{ object_type: 'claim', schema_version: 'v1', json_schema: { b: 1, a: 2 }, compatibility: 'additive' }]);
    expect(s.items[0]!.k).toBe('claim@v1');
    expect(canonical({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
  });
});

describe('THE VERIFICATION RECORD normalisers (V04-T-012)', () => {
  const vitest = JSON.stringify({ success: false, startTime: 1760500000000, testResults: [{ name: '/x/y/apps/api/test/int/phase6-demo.test.ts', endTime: 1760500005000, assertionResults: [
    { ancestorTitles: ['ES-06-001 trace links (SYNTHETIC)'], title: 'are bidirectional', fullName: 'ES-06-001 trace links (SYNTHETIC) are bidirectional', status: 'passed', duration: 12 },
    { ancestorTitles: ['DP-67-005'], title: 'quarantine', fullName: 'DP-67-005 quarantine', status: 'failed', duration: 3 },
    { ancestorTitles: [], title: 'skipped one', fullName: 'skipped one', status: 'pending' }] }] });
  it('vitest: one case per assertion, repository-relative identity, exact citations, the three dimensions; coverage NOT measured (stated)', () => {
    const r = fromVitest('demo report', vitest, ['AT-08'], ['fixture-a']);
    expect(r.cases.map((c) => [c.status, c.cited])).toEqual([['passed', ['ES-06-001', 'AT-08']], ['failed', ['DP-67-005', 'AT-08']], ['skipped', ['AT-08']]]);
    expect(r.cases[0]!.key).toBe('test:apps/api/test/int/phase6-demo.test.ts#ES-06-001 trace links (SYNTHETIC) are bidirectional');
    expect(r.identity).toMatchObject({ runner: 'vitest', files: ['apps/api/test/int/phase6-demo.test.ts'], test_count: 3 });
    expect(r.validity).toMatchObject({ population: 3, skipped: 1, coverage: 'not measured by this record' });
    expect(r.source_digest).toBe(sha256(vitest));
    expect(r.cases[0]!.fixtures).toEqual(['fixture-a']);
  });
  it('playwright: nested suites, projects, expected/unexpected/flaky/skipped', () => {
    const pw = JSON.stringify({ stats: { startTime: '2026-10-15T00:00:00Z', duration: 10, unexpected: 1 }, suites: [{ title: 'e2e/demo.spec.ts', file: 'e2e/demo.spec.ts', specs: [], suites: [
      { title: 'PR-08-001 traceability', file: 'e2e/demo.spec.ts', specs: [{ title: 'shows the trace', tests: [{ status: 'expected', projectName: 'chromium', results: [{ duration: 4 }] }, { status: 'flaky', projectName: 'firefox', results: [{ duration: 2 }, { duration: 3 }] }] },
        { title: 'holds', tests: [{ status: 'unexpected', projectName: 'chromium', results: [] }, { status: 'skipped', projectName: 'webkit', results: [] }] }] }] }] });
    const r = fromPlaywright('walk', pw);
    expect(r.cases.map((c) => c.status)).toEqual(['passed', 'flaky', 'failed', 'skipped']);
    expect(r.cases[0]!.full_name).toBe('PR-08-001 traceability › shows the trace [chromium]');
    expect(r.cases[1]!.duration_ms).toBe(5);
    expect(r.cases[0]!.cited).toEqual(['PR-08-001']);
    expect(r.declared_result).toBe('failed');
  });
  it('a gate receipt: passed or failed only when it DECLARES it; otherwise unstated (never inferred from its presence)', () => {
    expect(fromGateReceipt('c17', JSON.stringify({ schema_version: 'c17/1', head_sha: 'abc1234', source_conclusion: 'success', job: 'finalize' })).cases[0]!.status).toBe('passed');
    expect(fromGateReceipt('c17', JSON.stringify({ result: 'failure' })).cases[0]!.status).toBe('failed');
    const u = fromGateReceipt('c18', JSON.stringify({ schema_version: 'c18/2', head_sha: 'abc1234' }));
    expect(u.cases[0]!.status).toBe('unstated'); expect(u.declared_result).toBeNull();
    expect(() => fromGateReceipt('x', '[1]')).toThrow(/a JSON object/);
    expect(() => fromVitest('x', '{}')).toThrow(/testResults/);
  });
  it('identities are stable and bounded: repository-relative paths; a long key is hashed under 200 characters', () => {
    expect(relativeFile('C:\\w\\repo\\apps\\web\\e2e\\x.spec.ts')).toBe('apps/web/e2e/x.spec.ts');
    const k = testKey('apps/api/test/int/x.test.ts', 'y'.repeat(400));
    expect(k.length).toBeLessThanOrEqual(200); expect(testKey('a', 'b')).toBe('test:a#b');
  });
});

describe('THE BUILD IDENTITY (ES-06-003): env only, never guessed', () => {
  it('the head SHA from EYE_BUILD_SHA; absent → unstated; the manifest digest is the file\'s sha256', () => {
    const prev = process.env['EYE_BUILD_SHA']; const prevG = process.env['GITHUB_SHA'];
    try {
      delete process.env['GITHUB_SHA']; process.env['EYE_BUILD_SHA'] = 'abcdef1234567';
      const b = buildIdentity('bundle-v1', ROOT);
      expect(b).toMatchObject({ head_sha: 'abcdef1234567', head_sha_source: 'EYE_BUILD_SHA', policy_bundle: 'bundle-v1', manifest_digest: sha256(readFileSync(join(ROOT, 'conformance.manifest.json'))) });
      delete process.env['EYE_BUILD_SHA'];
      expect(buildIdentity(null, ROOT)).toMatchObject({ head_sha: null, head_sha_source: expect.stringMatching(/^unstated/) });
      process.env['EYE_GOVERNANCE_REPO_ROOT'] = '/tmp/x-root'; expect(repoRoot()).toBe('/tmp/x-root'); delete process.env['EYE_GOVERNANCE_REPO_ROOT'];
    } finally {
      if (prev === undefined) delete process.env['EYE_BUILD_SHA']; else process.env['EYE_BUILD_SHA'] = prev;
      if (prevG !== undefined) process.env['GITHUB_SHA'] = prevG;
    }
  });
});
