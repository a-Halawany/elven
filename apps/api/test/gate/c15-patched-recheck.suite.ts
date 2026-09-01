/**
 * C15 — the patched-image recheck.
 *
 * SCX-0006..0009 accept residual risk for CVE-2026-14456 for exactly one reason: no official image
 * carries the fixed OpenSSL. These controls hold the check that is supposed to notice when that
 * stops being true, and the property that matters most is the one that was wrong first: a severity
 * reclassification must not be read as a fix.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, fakeToolchain } from './helpers/fake-scanner';

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
    expect(v.why).toMatch(/falls inside an affected range/);
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
    expect(v.why).toMatch(/no longer listed, but the package was not rebuilt/);
  });

  it('PATCHED only when every watched package is OUTSIDE every affected range', async () => {
    const m = await load();
    const both = (v: string) => report({ vulns: [], versions: { libcrypto3: v, libssl3: v } });
    // The advisory has three branch ranges, not one threshold: 3.5.0–3.5.8, 3.6.0–3.6.4, 4.0.0–4.0.2.
    expect(m.assessReport(both('3.5.8-r0')).state).toBe('patched');
    expect(m.assessReport(both('3.5.9-r0')).state).toBe('patched');
    expect(m.assessReport(both('3.6.4-r0')).state).toBe('patched');
    expect(m.assessReport(both('4.0.2-r0')).state).toBe('patched');
    // A single 3.5.8 threshold called these patched because they sort above it.
    expect(m.assessReport(both('3.6.0-r0')).state).toBe('affected');
    expect(m.assessReport(both('3.6.3-r0')).state).toBe('affected');
    expect(m.assessReport(both('4.0.0-r0')).state).toBe('affected');
    expect(m.assessReport(both('4.0.1-r0')).state).toBe('affected');
    // ...and called this affected because it sorts below, when the branch predates QUIC entirely.
    expect(m.assessReport(both('3.4.9-r0')).state).toBe('patched');
    // One rebuilt and one not is NOT patched.
    expect(m.assessReport(report({
      vulns: [], versions: { libcrypto3: '3.5.8-r0', libssl3: '3.5.7-r0' },
    })).state).toBe('affected');
  });

  it('CONTRADICTION: a fixed inventory with a stale advisory row is indeterminate', async () => {
    const m = await load();
    // This previously returned affected, so the CLI exited 0 and the contradiction passed unnoticed.
    const v = m.assessReport(report({
      vulns: [finding('HIGH')], versions: { libcrypto3: '3.5.8-r0', libssl3: '3.5.8-r0' },
    }));
    expect(v.state).toBe('indeterminate');
    expect(v.why).toMatch(/disagrees with itself/);
  });

  it('DUPLICATE conflicting versions are indeterminate, not order-dependent', async () => {
    const m = await load();
    // A Map set in a loop kept whichever row came last, so the verdict depended on result ordering.
    const dup = (order: string[]) => ({
      Results: [{
        Packages: [...order.map((Version) => ({ Name: 'libcrypto3', Version })),
          { Name: 'libssl3', Version: '3.5.8-r0' }],
        Vulnerabilities: [],
      }],
    });
    for (const order of [['3.5.7-r0', '3.5.8-r0'], ['3.5.8-r0', '3.5.7-r0']]) {
      const v = m.assessReport(dup(order));
      expect(v.state, `order ${order.join(',')} must not decide the verdict`).toBe('indeterminate');
      expect(v.why).toMatch(/more than one installed version/);
    }
    // Duplicates that AGREE are not a contradiction.
    expect(m.assessReport(dup(['3.5.8-r0', '3.5.8-r0'])).state).toBe('patched');
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
    expect(v.why).toMatch(/not a comparable version/);
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
    // A bare upstream version compares on its base; the revision is simply not part of the answer.
    expect(m.compareApkVersions('3.5.8', '3.5.8-r0')).toBe(0);
    for (const bad of ['latest', '', null, undefined, 'r0', '3.5.8-rX']) {
      expect(m.compareApkVersions(bad, '3.5.8-r0'), `${bad} must not compare`).toBeNull();
    }
  });

  it('the recheck is WIRED into required CI and a schedule', () => {
    // Whether it is armed is a fact about other files; what it DOES is proved by executing it,
    // which the subprocess controls below do.
    const ci = readFileSync(join(REPO, '.github', 'workflows', 'ci.yml'), 'utf8');
    expect(ci).toMatch(/check-patched-images\.mjs/);
    const cron = readFileSync(
      join(REPO, '.github', 'workflows', 'c15-patched-image-recheck.yml'), 'utf8');
    expect(cron).toMatch(/schedule:/);
    expect(cron).toMatch(/check-patched-images\.mjs/);
  });
});

describe('C15 — the scheduled workflow grants exactly contents: read', () => {
  const load2 = () => import(/* @vite-ignore */
    join(REPO, 'scripts', 'gate', 'assert-readonly-workflow.mjs'));
  const WF = join(REPO, '.github', 'workflows', 'c15-patched-image-recheck.yml');

  it('the committed workflow passes', async () => {
    const m = await load2();
    expect(m.assertReadOnly(readFileSync(WF, 'utf8'), 'wf')).toEqual([]);
  });

  /**
   * The previous self-check grepped for `id-token: write`. That is one key out of many, and
   * `permissions: write-all` grants every one of them in five words the grep would not match.
   */
  const base = [
    'name: x', 'on:', '  schedule:', "    - cron: '0 0 * * *'", '',
    'permissions:', '  contents: read', '', 'jobs:', '  j:',
    '    runs-on: ubuntu-latest', '    permissions:', '      contents: read', '',
  ].join('\n');

  const REFUSED: Array<[string, string]> = [
    ['contents: write', base.replace('      contents: read', '      contents: write')],
    ['packages: write', base.replace('      contents: read', '      contents: read\n      packages: write')],
    ['attestations: write', base.replace('      contents: read', '      contents: read\n      attestations: write')],
    ['issues: write', base.replace('      contents: read', '      contents: read\n      issues: write')],
    ['pull-requests: write', base.replace('      contents: read', '      contents: read\n      pull-requests: write')],
    ['security-events: write', base.replace('      contents: read', '      contents: read\n      security-events: write')],
    ['deployments: write', base.replace('      contents: read', '      contents: read\n      deployments: write')],
    ['id-token: write', base.replace('      contents: read', '      contents: read\n      id-token: write')],
    ['write-all', base.replace('permissions:\n  contents: read', 'permissions: write-all')],
    ['read-all', base.replace('permissions:\n  contents: read', 'permissions: read-all')],
    ['no permissions block at all', 'name: x\non: push\njobs:\n  j:\n    runs-on: ubuntu-latest\n'],
    ['an empty permissions block', base.replace('  contents: read\n\njobs', '\njobs')],
  ];
  for (const [what, text] of REFUSED) {
    it(`REFUSES ${what}`, async () => {
      const m = await load2();
      const problems = m.assertReadOnly(text, 'wf');
      expect(problems.length, `${what} must be refused`).toBeGreaterThan(0);
    });
  }

  it('the workflow checks itself with the parser, not a grep', () => {
    const text = readFileSync(WF, 'utf8');
    expect(text).toMatch(/assert-readonly-workflow\.mjs/);
    // The old shape: a grep for one key.
    expect(text).not.toMatch(/grep -qE .*id-token/);
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

  it('a RISK_ACCEPTED record cannot drop its scope boundary', async () => {
    const m = await import(/* @vite-ignore */ join(LIB, 'scanner-exclusions.mjs'));
    const doc = JSON.parse(readFileSync(join(REPO, 'scripts', 'gate', 'scanner-exclusions.json'), 'utf8'));
    const run = (d: unknown) => m.validateRecords(d, {
      runDate: '2026-09-01', root: REPO, isTracked: () => true,
      readEvidence: (rel: string) => { try { return readFileSync(join(REPO, rel)); } catch { return null; } },
    }).problems;
    expect(run(doc)).toEqual([]);
    // Validating the field only when present left it removable: deleting the one line saying
    // "not for production data, not for Phase 1" produced no finding at all.
    for (const id of ['SCX-0006', 'SCX-0007', 'SCX-0008', 'SCX-0009']) {
      const cut = JSON.parse(JSON.stringify(doc));
      delete cut.records.find((r: { id: string }) => r.id === id).prohibited_use;
      expect(run(cut).join('\n'), `${id} must be caught`).toMatch(/must declare prohibited_use/);
    }
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

/**
 * ── THE CLI, EXECUTED ──
 *
 * Driven as a real subprocess against fake `docker` and `trivy` on its PATH. Source-text assertions
 * cannot show what a program does; these show the exit code, the message and the argv it actually
 * used, which is the only way the platform pin and the digest-resolved reference are proved rather
 * than assumed.
 */
describe('C15 — the recheck CLI, executed as a subprocess', () => {
  const CLI = join(REPO, 'scripts', 'gate', 'check-patched-images.mjs');
  const PG = 'postgres:18-alpine';
  const RD = 'redis:8-alpine';
  const PG_DIGEST = `sha256:${'1'.repeat(64)}`;
  const RD_DIGEST = `sha256:${'2'.repeat(64)}`;

  const bothAt = (version: string, vulns: Array<[string, string, string]> = []) =>
    buildReport({ packages: { libcrypto3: version, libssl3: version }, vulns });

  const run = (reports: Record<string, unknown | null>, opts: {
    digests?: Record<string, string | null>; trivyWritesNothing?: boolean;
  } = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'c15fake-'));
    const tc = fakeToolchain(dir, {
      digests: opts.digests ?? { [PG]: PG_DIGEST, [RD]: RD_DIGEST },
      reports,
      trivyWritesNothing: opts.trivyWritesNothing,
    });
    const r = spawnSync(process.execPath, [CLI, '--cache', join(dir, 'cache')], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${tc.binDir}:${process.env.PATH}` },
      timeout: 120_000,
    });
    return { ...r, out: `${r.stdout}${r.stderr}`, calls: tc.calls() };
  };

  it('AFFECTED at 3.5.7 — exits 0 and keeps the acceptance justified', () => {
    const r = run({ [PG]: bothAt('3.5.7-r0', [['HIGH', 'libcrypto3', '3.5.7-r0']]), [RD]: bothAt('3.5.7-r0') });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/AFFECTED/);
    expect(r.out).toMatch(/remain justified/);
  }, 120_000);

  it('PATCHED at 3.5.8 — FAILS and names the digest to re-pin to', () => {
    const r = run({ [PG]: bothAt('3.5.8-r0'), [RD]: bothAt('3.5.8-r0') });
    // The inversion is deliberate: the good news is what has to interrupt someone.
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/a PATCHED official image now exists/);
    expect(r.out).toContain(PG_DIGEST);
    expect(r.out).toContain(RD_DIGEST);
    expect(r.out).toMatch(/DELETE the/);
  }, 120_000);

  /**
   * The two classes a single 3.5.8 threshold got wrong: 3.6.x and 4.0.x sort ABOVE it while sitting
   * squarely inside their own affected ranges.
   */
  it('AFFECTED at 3.6.3, PATCHED at 3.6.4', () => {
    expect(run({ [PG]: bothAt('3.6.3-r0'), [RD]: bothAt('3.6.3-r0') }).status).toBe(0);
    expect(run({ [PG]: bothAt('3.6.4-r0'), [RD]: bothAt('3.6.4-r0') }).status).not.toBe(0);
  }, 120_000);

  it('AFFECTED at 4.0.1, PATCHED at 4.0.2', () => {
    expect(run({ [PG]: bothAt('4.0.1-r0'), [RD]: bothAt('4.0.1-r0') }).status).toBe(0);
    expect(run({ [PG]: bothAt('4.0.2-r0'), [RD]: bothAt('4.0.2-r0') }).status).not.toBe(0);
  }, 120_000);

  it('PRE-3.5 is outside every range — the branch predates the QUIC listener', () => {
    // A single threshold called this "affected" because it sorts below 3.5.8.
    const r = run({ [PG]: bothAt('3.4.9-r0'), [RD]: bothAt('3.4.9-r0') });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/outside every affected range/);
  }, 120_000);

  it('SEVERITY RECLASSIFICATION to Low is still affected', () => {
    const r = run({
      [PG]: bothAt('3.5.7-r0', [['LOW', 'libcrypto3', '3.5.7-r0'], ['LOW', 'libssl3', '3.5.7-r0']]),
      [RD]: bothAt('3.5.7-r0', [['LOW', 'libcrypto3', '3.5.7-r0']]),
    });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/AFFECTED/);
  }, 120_000);

  it('ADVISORY DISAPPEARANCE with an unchanged package is still affected', () => {
    const r = run({ [PG]: bothAt('3.5.7-r0', []), [RD]: bothAt('3.5.7-r0', []) });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/no longer listed, but the package was not rebuilt/);
  }, 120_000);

  it('CONTRADICTORY advisory row against a fixed inventory FAILS the job', () => {
    // Fixed packages plus a stale CVE row previously returned affected, so the CLI exited 0 and the
    // contradiction passed unnoticed.
    const r = run({
      [PG]: bothAt('3.5.8-r0', [['HIGH', 'libcrypto3', '3.5.7-r0']]),
      [RD]: bothAt('3.5.7-r0'),
    });
    expect(r.status, 'a self-contradictory report must fail the job').not.toBe(0);
    expect(r.out).toMatch(/disagrees with itself/);
    expect(r.out).toMatch(/could not be re-justified/);
  }, 120_000);

  it('DUPLICATE conflicting versions FAIL rather than depend on ordering', () => {
    const r = run({
      [PG]: buildReport({ packages: { libcrypto3: ['3.5.7-r0', '3.5.8-r0'], libssl3: '3.5.8-r0' } }),
      [RD]: bothAt('3.5.7-r0'),
    });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/more than one installed version/);
  }, 120_000);

  it('MALFORMED and INCOMPLETE reports are indeterminate and fail the job', () => {
    for (const raw of [null, 'a string', 42, [], { Results: 'nope' }, {}]) {
      const r = run({ [PG]: buildReport({ raw }), [RD]: bothAt('3.5.7-r0') });
      expect(r.status, `${JSON.stringify(raw)} must fail`).not.toBe(0);
      expect(r.out).toMatch(/could not be re-justified/);
    }
    // A report missing one watched package entirely.
    const partial = run({
      [PG]: buildReport({ packages: { libcrypto3: '3.5.8-r0' } }), [RD]: bothAt('3.5.7-r0'),
    });
    expect(partial.status).not.toBe(0);
    expect(partial.out).toMatch(/no installed version for libssl3/);
  }, 300_000);

  it('an UNRESOLVABLE digest or a failed scan fails closed', () => {
    const noDigest = run({ [PG]: bothAt('3.5.7-r0'), [RD]: bothAt('3.5.7-r0') },
      { digests: { [PG]: null, [RD]: RD_DIGEST } });
    expect(noDigest.status).not.toBe(0);
    expect(noDigest.out).toMatch(/digest could not be resolved/);

    const scanFails = run({ [PG]: null, [RD]: bothAt('3.5.7-r0') });
    expect(scanFails.status).not.toBe(0);
    expect(scanFails.out).toMatch(/the scan failed/);

    // Trivy exits 0 but writes no report — "could not check" must not read like "nothing to do".
    const noFile = run({ [PG]: bothAt('3.5.7-r0'), [RD]: bothAt('3.5.7-r0') },
      { trivyWritesNothing: true });
    expect(noFile.status).not.toBe(0);
    expect(noFile.out).toMatch(/unreadable/);
  }, 300_000);

  it('scans the EXACT linux/amd64 child of the digest-resolved reference', () => {
    const r = run({ [PG]: bothAt('3.5.7-r0'), [RD]: bothAt('3.5.7-r0') });
    const trivy = r.calls.filter((c) => c.tool === 'trivy');
    expect(trivy.length).toBe(2);
    for (const call of trivy) {
      // The platform is pinned, because a scanner given none follows the host and would examine a
      // different child with different layers.
      expect(call.argv).toContain('--platform');
      expect(call.argv[call.argv.indexOf('--platform') + 1]).toBe('linux/amd64');
      // And the reference is the resolved DIGEST, never the moving tag.
      const ref = call.argv[call.argv.length - 1];
      expect(ref).toMatch(/@sha256:[0-9a-f]{64}$/);
      expect([`postgres@${PG_DIGEST}`, `redis@${RD_DIGEST}`]).toContain(ref);
      // No severity filter: that is what let a reclassification read as a fix.
      expect(call.argv).not.toContain('--severity');
    }
    const docker = r.calls.filter((c) => c.tool === 'docker');
    expect(docker.length).toBe(2);
    expect(docker[0].argv.slice(0, 3)).toEqual(['buildx', 'imagetools', 'inspect']);
  }, 120_000);
});
