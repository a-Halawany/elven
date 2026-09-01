/**
 * C15 — the patched-image recheck.
 *
 * SCX-0006..0009 accept residual risk for CVE-2026-14456 for exactly one reason: no official image
 * carries the fixed OpenSSL. These controls hold the check that is supposed to notice when that
 * stops being true, and the property that matters most is the one that was wrong first: a severity
 * reclassification must not be read as a fix.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const LIB = join(REPO, 'scripts', 'gate', 'lib');
const load = () => import(/* @vite-ignore */ join(LIB, 'c19-patched-images.mjs'));

/** A report shaped like trivy's, with the parts the decision reads. */
const report = ({ vulns = [], versions = { libcrypto3: '3.5.7-r0', libssl3: '3.5.7-r0' } } = {}) => ({
  SchemaVersion: 2,
  ArtifactName: 'postgres@sha256:' + 'a'.repeat(64),
  Results: [{
    Target: 'postgres (alpine 3.24.1)',
    Class: 'os-pkgs',
    Type: 'alpine',
    Packages: Object.entries(versions).map(([Name, Version]) => ({ Name, Version })),
    Vulnerabilities: vulns,
  }],
});
const finding = (severity = 'HIGH', pkg = 'libcrypto3') => ({
  VulnerabilityID: 'CVE-2026-14456', PkgName: pkg, InstalledVersion: '3.5.7-r0',
  FixedVersion: '3.5.8-r0', Severity: severity,
});

describe('C15 — the patched-image recheck decides on versions, not on severity', () => {
  it('AFFECTED: the advisory is reported and the package predates the fix', async () => {
    const m = await load();
    const v = m.assessReport(report({ vulns: [finding('HIGH'), finding('HIGH', 'libssl3')] }));
    expect(v.state).toBe('affected');
    expect(v.why).toMatch(/still reported/);
  });

  /**
   * THE DEFECT THIS REPLACES. The first version scanned with `--severity HIGH,CRITICAL` and read
   * "no finding" as "patched". Severity is an advisory database's editorial judgement and it
   * changes; the installed version is a fact about the image. Under the old logic this input
   * retired four dispositions while the vulnerable code sat exactly where it was.
   */
  it('RECLASSIFIED to Low is still AFFECTED, not patched', async () => {
    const m = await load();
    const v = m.assessReport(report({ vulns: [finding('LOW'), finding('LOW', 'libssl3')] }));
    expect(v.state).toBe('affected');
    expect(v.severities).toEqual(['LOW']);
  });

  it('DROPPED from the advisory listing entirely is still AFFECTED while the version is old', async () => {
    const m = await load();
    // The strongest form: the scanner stops reporting it at any severity, but the package was not
    // rebuilt. Absence of a finding is not presence of a fix.
    const v = m.assessReport(report({ vulns: [] }));
    expect(v.state).toBe('affected');
    expect(v.why).toMatch(/predates 3\.5\.8-r0/);
  });

  it('PATCHED only when every watched package is at or past the fixed version', async () => {
    const m = await load();
    expect(m.assessReport(report({
      vulns: [], versions: { libcrypto3: '3.5.8-r0', libssl3: '3.5.8-r0' },
    })).state).toBe('patched');
    expect(m.assessReport(report({
      vulns: [], versions: { libcrypto3: '3.6.0-r0', libssl3: '3.6.0-r0' },
    })).state).toBe('patched');
    // One rebuilt and one not is NOT patched.
    expect(m.assessReport(report({
      vulns: [], versions: { libcrypto3: '3.5.8-r0', libssl3: '3.5.7-r0' },
    })).state).toBe('affected');
  });

  it('UNRESOLVED when a watched package is absent from the report', async () => {
    const m = await load();
    const v = m.assessReport(report({ vulns: [], versions: { libcrypto3: '3.5.8-r0' } }));
    expect(v.state).toBe('indeterminate');
    expect(v.why).toMatch(/no installed version for libssl3/);
  });

  it('UNRESOLVED when a version cannot be compared, rather than guessed', async () => {
    const m = await load();
    const v = m.assessReport(report({
      vulns: [], versions: { libcrypto3: 'latest', libssl3: '3.5.8-r0' },
    }));
    expect(v.state).toBe('indeterminate');
    expect(v.why).toMatch(/not a comparable apk version/);
  });

  it('MALFORMED responses are indeterminate, never patched', async () => {
    const m = await load();
    for (const bad of [null, undefined, 'a string', 42, true, [], {}, { Results: 'nope' }]) {
      const v = m.assessReport(bad);
      expect(v.state, `${JSON.stringify(bad)} must not be read as patched`).toBe('indeterminate');
    }
  });

  it('apk version comparison refuses input it does not understand', async () => {
    const m = await load();
    expect(m.compareApkVersions('3.5.7-r0', '3.5.8-r0')).toBe(-1);
    expect(m.compareApkVersions('3.5.8-r0', '3.5.8-r0')).toBe(0);
    expect(m.compareApkVersions('3.5.8-r1', '3.5.8-r0')).toBe(1);
    expect(m.compareApkVersions('3.10.0-r0', '3.9.0-r0')).toBe(1);   // not string order
    for (const bad of ['latest', '', null, undefined, '3.5.8', 'r0']) {
      expect(m.compareApkVersions(bad, '3.5.8-r0'), `${bad} must not compare`).toBeNull();
    }
  });

  it('the CLI scans at ALL severities and is wired into required CI and a schedule', () => {
    const cli = readFileSync(join(REPO, 'scripts', 'gate', 'check-patched-images.mjs'), 'utf8');
    // A severity filter is what made a reclassification look like a fix. Check the argv the CLI
    // actually builds, not the prose - the comment explaining the defect names the flag too.
    const code = cli.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/--severity/);
    expect(cli).toMatch(/assessReport/);
    // An armed check is one something actually runs.
    const ci = readFileSync(join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci).toMatch(/check-patched-images\.mjs/);
    const cron = readFileSync(
      join(REPO, '.github', 'workflows', 'c15-patched-image-recheck.yml'), 'utf8');
    expect(cron).toMatch(/schedule:/);
    expect(cron).toMatch(/check-patched-images\.mjs/);
    // Read-only: a scheduled job that could sign would be a standing capability nobody watches.
    expect(cron).not.toMatch(/^\s*id-token:\s*write/m);
  });
});

describe('C15 — a disposition is rejected ON its stated expiry date', () => {
  it('expires_on 2026-11-05 is in force on the 4th and rejected on the 5th', async () => {
    const m = await import(/* @vite-ignore */ join(LIB, 'scanner-exclusions.mjs'));
    const doc = JSON.parse(readFileSync(join(REPO, 'scripts', 'gate', 'scanner-exclusions.json'), 'utf8'));
    const run = (runDate: string) => m.validateRecords(doc, {
      runDate, root: REPO, isTracked: () => true,
      readEvidence: (rel: string) => { try { return readFileSync(join(REPO, rel)); } catch { return null; } },
    }).problems.filter((x: string) => /EXPIRED/.test(x));
    // The document says "rejected by the gate from that date". `<` made that false by a day.
    expect(run('2026-11-04')).toEqual([]);
    expect(run('2026-11-05').length).toBeGreaterThan(0);
    expect(run('2026-11-06').length).toBeGreaterThan(0);
  });

  it('no record carries a decorative deadline that nothing enforces', () => {
    const doc = JSON.parse(readFileSync(join(REPO, 'scripts', 'gate', 'scanner-exclusions.json'), 'utf8'));
    const src = readFileSync(join(LIB, 'scanner-exclusions.mjs'), 'utf8');
    for (const r of doc.records) {
      for (const key of Object.keys(r)) {
        // Every field on a record must be read by the validator. A field that looks like a control
        // and is enforced by nothing is worse than no field - this control caught `prohibited_use`
        // being exactly that, and `mandatory_rereview_by` before it.
        expect(src.includes(`'${key}'`) || src.includes(`${key}:`) || src.includes(`r.${key}`),
          `record field ${key} is not referenced by the validator`).toBe(true);
      }
    }
  });
});
