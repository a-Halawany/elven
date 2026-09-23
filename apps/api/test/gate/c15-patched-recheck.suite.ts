/**
 * C15 — the patched-image recheck.
 *
 * From 2026-09-10 to 2026-09-22 the service images were pinned, TEMPORARILY and by owner approval,
 * to derived maintenance builds because no official `postgres:18-alpine` / `redis:8-alpine` build
 * carried the util-linux, OpenSSL and c-ares fixes. The recheck is what noticed the official
 * rebuilds (2026-09-22); the compose file returned to them, and the owner approved the six SCX
 * re-issues on 2026-09-23. Since then the recheck decides against the CONFIGURED PIN: the pin,
 * carrying every watched fix on both platforms, passes; a NEWER compatible official build fails, to
 * trigger the governed re-pin; an indeterminate check fails visibly. These controls hold the check
 * — on BOTH platforms — and the property that matters most is still the one that was wrong first:
 * a severity reclassification must not be read as a fix. The recheck reports; it re-pins nothing and
 * deletes no evidence.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildReport, fakeToolchain, type FakeIndex } from './helpers/fake-scanner';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const LIB = join(REPO, 'scripts', 'gate', 'lib');
const load = () => import(/* @vite-ignore */ join(LIB, 'c19-patched-images.mjs'));
const readManifest = () => JSON.parse(readFileSync(join(REPO, 'conformance.manifest.json'), 'utf8'));
const readExclusions = () => JSON.parse(readFileSync(join(REPO, 'scripts', 'gate', 'scanner-exclusions.json'), 'utf8'));

/** A report shaped like trivy's, with the parts the decision reads. */
const report = ({ vulns = [], versions = { libcrypto3: '3.5.7-r0', libssl3: '3.5.7-r0' } }:
  { vulns?: unknown[]; versions?: Record<string, string> } = {}) => ({
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
   * declared an official image fixed while the vulnerable code sat exactly where it was.
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

  it('util-linux fixes: revision-aware ranges, one package per image', async () => {
    const m = await load();
    const pg = (v: string) => ({ Results: [{ Packages: [{ Name: 'libuuid', Version: v }], Vulnerabilities: [] }] });
    const rd = (v: string) => ({ Results: [{ Packages: [{ Name: 'setpriv', Version: v }], Vulnerabilities: [] }] });
    expect(m.assessReport(pg('2.42.1-r0'), m.UTIL_LINUX_POSTGRES_FIX).state).toBe('affected');
    expect(m.assessReport(pg('2.42.3-r0'), m.UTIL_LINUX_POSTGRES_FIX).state).toBe('affected'); // -r1 needed
    expect(m.assessReport(pg('2.42.3-r1'), m.UTIL_LINUX_POSTGRES_FIX).state).toBe('patched');
    expect(m.assessReport(pg('2.42.4-r0'), m.UTIL_LINUX_POSTGRES_FIX).state).toBe('patched');
    expect(m.assessReport(pg('2.42.3'), m.UTIL_LINUX_POSTGRES_FIX).state).toBe('affected');    // unknown revision fails safe
    expect(m.assessReport(rd('2.41.4-r0'), m.UTIL_LINUX_REDIS_FIX).state).toBe('affected');
    expect(m.assessReport(rd('2.41.6-r0'), m.UTIL_LINUX_REDIS_FIX).state).toBe('affected');
    expect(m.assessReport(rd('2.41.6-r1'), m.UTIL_LINUX_REDIS_FIX).state).toBe('patched');
    // A report that lists a sibling advisory against a fixed version is a contradiction, not a fix.
    const stale = { Results: [{ Packages: [{ Name: 'libuuid', Version: '2.42.3-r1' }],
      Vulnerabilities: [{ VulnerabilityID: 'CVE-2026-78408', PkgName: 'libuuid', InstalledVersion: '2.42.3-r1', Severity: 'HIGH' }] }] };
    expect(m.assessReport(stale, m.UTIL_LINUX_POSTGRES_FIX).state).toBe('indeterminate');
    // The OpenSSL spec is unchanged by the revision rule: its ranges name no revision.
    expect(m.isAffectedVersion('3.5.8-r0')).toBe(false);
    expect(m.isAffectedVersion('3.5.7-r9')).toBe(true);
  });

  it('c-ares fix: every version below 1.34.8 is affected, with no lower bound', async () => {
    const m = await load();
    const pg = (v: string) => ({ Results: [{ Packages: [{ Name: 'c-ares', Version: v }], Vulnerabilities: [] }] });
    expect(m.assessReport(pg('1.34.6-r0'), m.C_ARES_FIX).state).toBe('affected');
    expect(m.assessReport(pg('1.33.0-r0'), m.C_ARES_FIX).state).toBe('affected');
    expect(m.assessReport(pg('1.34.8-r0'), m.C_ARES_FIX).state).toBe('patched');
    expect(m.assessReport(pg('1.35.0-r0'), m.C_ARES_FIX).state).toBe('patched');
  });

  it('the watched set: each service names its official tag, the repository its pin is under, its fixes and the records naming the configured pin', async () => {
    const m = await load();
    expect(m.PLATFORMS).toEqual(['linux/amd64', 'linux/arm64']);
    expect(Object.keys(m.SERVICES)).toEqual(['postgres', 'redis']);
    expect(m.SERVICES.postgres.tag).toBe('postgres:18-alpine');
    expect(m.SERVICES.redis.tag).toBe('redis:8-alpine');
    expect(m.SERVICES.postgres.fixes.map((f: { id: string }) => f.id)).toEqual(['openssl', 'util-linux/postgres', 'c-ares']);
    expect(m.SERVICES.redis.fixes.map((f: { id: string }) => f.id)).toEqual(['openssl', 'util-linux/redis']);
    // Since the return of 2026-09-22 the configured pins are the official indexes the watched tags name.
    const pins = m.readConfiguredPins(readManifest());
    expect(pins.postgres.repository).toBe(m.SERVICES.postgres.repository);
    expect(pins.redis.repository).toBe(m.SERVICES.redis.repository);
    expect(pins.postgres.human_tag).toBe(m.SERVICES.postgres.tag);
    expect(pins.redis.human_tag).toBe(m.SERVICES.redis.tag);
    expect(Object.keys(pins.postgres.children).sort()).toEqual(['linux/amd64', 'linux/arm64']);
    expect(Object.keys(pins.redis.children).sort()).toEqual(['linux/amd64', 'linux/arm64']);
    // The records a re-pin must re-review are exactly the tracked ones that name the configured pin.
    const doc = readExclusions();
    const naming = (ref: string) => doc.records.filter((r: { image: string }) => r.image === ref).map((r: { id: string }) => r.id);
    expect(m.SERVICES.postgres.records).toEqual(naming(pins.postgres.reference));
    expect([...m.SERVICES.redis.records]).toEqual(naming(pins.redis.reference));
    expect(m.RECHECK_SPECS.map((x: { id: string }) => x.id)).toEqual(['openssl', 'util-linux/postgres', 'util-linux/redis', 'c-ares']);
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

/**
 * The SERVICE verdict: a compatible fixed official image is one where every watched fix is present
 * on EVERY platform. One platform is not enough — the configured pins ship both, and a move that
 * fixed amd64 while arm64 regressed would be a downgrade wearing an upgrade's name.
 */
describe('C15 — a service is FIXED only when every fix is present on both platforms', () => {
  const pgOk = { libcrypto3: '3.5.8-r0', libssl3: '3.5.8-r0', libuuid: '2.42.3-r1', 'c-ares': '1.34.8-r0' };
  const pgOld = { libcrypto3: '3.5.7-r0', libssl3: '3.5.7-r0', libuuid: '2.42.1-r0', 'c-ares': '1.34.6-r0' };
  const rep = (versions: Record<string, string>) => report({ vulns: [], versions });

  it('fixed on both platforms', async () => {
    const m = await load();
    const v = m.assessService('postgres', { 'linux/amd64': rep(pgOk), 'linux/arm64': rep(pgOk) });
    expect(v.state).toBe('fixed');
    expect(v.tag).toBe('postgres:18-alpine');
    // Every record scoped to the configured postgres image, on BOTH scanned platforms — a re-pin
    // re-scopes all of them, or the ones left behind fail as unused.
    expect(v.records).toEqual(['SCX-0002', 'SCX-0003', 'SCX-0004', 'SCX-0005', 'SCX-0010', 'SCX-0011']);
    for (const p of ['linux/amd64', 'linux/arm64']) {
      expect(Object.values(v.platforms[p].fixes).map((f: { state: string }) => f.state)).toEqual(['patched', 'patched', 'patched']);
    }
  });

  it('fixed on amd64 only is AFFECTED, not fixed', async () => {
    const m = await load();
    const v = m.assessService('postgres', { 'linux/amd64': rep(pgOk), 'linux/arm64': rep(pgOld) });
    expect(v.state).toBe('affected');
    expect(v.platforms['linux/arm64'].fixes.openssl.state).toBe('affected');
  });

  it('one fix short on one platform is AFFECTED', async () => {
    const m = await load();
    const v = m.assessService('postgres', {
      'linux/amd64': rep(pgOk), 'linux/arm64': rep({ ...pgOk, 'c-ares': '1.34.6-r0' }),
    });
    expect(v.state).toBe('affected');
    expect(v.platforms['linux/arm64'].fixes['c-ares'].state).toBe('affected');
    expect(v.platforms['linux/arm64'].fixes.openssl.state).toBe('patched');
  });

  it('a missing or unreadable platform is INDETERMINATE, whatever the other platform says', async () => {
    const m = await load();
    const absent = m.assessService('postgres', { 'linux/amd64': rep(pgOk) }, { 'linux/arm64': 'the official index has no linux/arm64 child' });
    expect(absent.state).toBe('indeterminate');
    expect(absent.platforms['linux/arm64'].error).toMatch(/no linux\/arm64 child/);
    const broken = m.assessService('postgres', { 'linux/amd64': rep(pgOk), 'linux/arm64': { Results: 'nope' } });
    expect(broken.state).toBe('indeterminate');
    // Indeterminate outranks affected: "could not check" never reads like "nothing to do".
    const mixed = m.assessService('postgres', { 'linux/amd64': rep(pgOld), 'linux/arm64': { Results: 'nope' } });
    expect(mixed.state).toBe('indeterminate');
  });

  it('redis watches OpenSSL and setpriv, and names no record', async () => {
    const m = await load();
    const rd = (versions: Record<string, string>) => report({ vulns: [], versions });
    const ok = { libcrypto3: '3.5.8-r0', libssl3: '3.5.8-r0', setpriv: '2.41.6-r1' };
    expect(m.assessService('redis', { 'linux/amd64': rd(ok), 'linux/arm64': rd(ok) }).state).toBe('fixed');
    expect(m.assessService('redis', { 'linux/amd64': rd(ok), 'linux/arm64': rd({ ...ok, setpriv: '2.41.6-r0' }) }).state).toBe('affected');
    expect(m.assessService('redis', { 'linux/amd64': rd(ok), 'linux/arm64': rd(ok) }).records).toEqual([]);
    expect(() => m.assessService('mysql', {})).toThrow(/unknown service/);
  });
});

/**
 * ── AFTER THE RETURN: THE DECISION AGAINST THE CONFIGURED PIN ──
 *
 * Until 2026-09-23 the recheck failed whenever ANY compatible fixed official image existed, which
 * after the return of 2026-09-22 meant failing on the very image pinned. The owner's decision of
 * 2026-09-23: the adopted pin passes, a NEWER compatible official build triggers the existing
 * update process, an indeterminate check stays a visible failure. `decideService` is pure, so each
 * row is proven here without a registry; the subprocess controls below prove the CLI carries it.
 */
describe('C15 — after the return, the recheck decides against the CONFIGURED pin', () => {
  const pgOk = { libcrypto3: '3.5.8-r0', libssl3: '3.5.8-r0', libuuid: '2.42.3-r1', 'c-ares': '1.34.8-r0' };
  const pgOld = { libcrypto3: '3.5.7-r0', libssl3: '3.5.7-r0', libuuid: '2.42.1-r0', 'c-ares': '1.34.6-r0' };
  const rep = (versions: Record<string, string>) => report({ vulns: [], versions });
  const PIN = `sha256:${'f'.repeat(64)}`;
  const NEWER = `sha256:${'1'.repeat(64)}`;
  const AMD = `sha256:${'a'.repeat(64)}`;
  const ARM = `sha256:${'b'.repeat(64)}`;
  const pin = {
    service: 'postgres', tag: 'postgres:18-alpine', reference: `postgres@${PIN}`, repository: 'postgres',
    digest: PIN, human_tag: 'postgres:18-alpine', pinned_at: '2026-09-22',
    children: { 'linux/amd64': AMD, 'linux/arm64': ARM },
  };
  const index = (digest: string) => ({ digest, children: { 'linux/amd64': AMD, 'linux/arm64': ARM } });
  const fixed = (m: any) => m.assessService('postgres', { 'linux/amd64': rep(pgOk), 'linux/arm64': rep(pgOk) });
  const affected = (m: any) => m.assessService('postgres', { 'linux/amd64': rep(pgOk), 'linux/arm64': rep({ ...pgOk, 'c-ares': '1.34.6-r0' }) });

  it('the CONFIGURED pin, fixed on both platforms — PASS, and says the service is on the compatible official image', async () => {
    const m = await load();
    const d = m.decideService(index(PIN), fixed(m), pin);
    expect(d.kind).toBe('pinned-fixed');
    expect(d.pass).toBe(true);
    expect(d.moved).toBe(false);
    expect(d.lines.join('\n')).toMatch(/postgres: the configured pin is the compatible official image \(postgres:18-alpine -> sha256:f{64}; every watched fix \(openssl, util-linux\/postgres, c-ares\) is present on linux\/amd64 and linux\/arm64\)/);
  });

  it('a NEWER index that carries every watched fix — FAIL, the existing update process', async () => {
    const m = await load();
    const d = m.decideService(index(NEWER), fixed(m), pin);
    expect(d.kind).toBe('newer-fixed');
    expect(d.pass).toBe(false);
    expect(d.moved).toBe(true);
    const text = d.lines.join('\n');
    expect(text).toMatch(/a COMPATIBLE FIXED OFFICIAL image now exists for postgres: postgres:18-alpine -> sha256:1{64}/);
    expect(text).toMatch(/NEWER than the configured pin sha256:f{64}/);
    expect(text).toMatch(/This is a REPORT: nothing was re-pinned and no evidence was deleted/);
    expect(text).toMatch(/re-issue or retire SCX-0002, SCX-0003, SCX-0004, SCX-0005, SCX-0010, SCX-0011 \(they name the configured pin\)/);
    expect(text).toMatch(/run the FINAL chain/);
  });

  it('a different index that does NOT carry every watched fix — nothing to do, the pin stays', async () => {
    const m = await load();
    const d = m.decideService(index(NEWER), affected(m), pin);
    expect(d.kind).toBe('moved-affected');
    expect(d.pass).toBe(true);
    expect(d.lines.join('\n')).toMatch(/the tag postgres:18-alpine now resolves to sha256:1{64}, which does not carry every watched fix \(linux\/arm64 \[c-ares\] affected\); the configured pin sha256:f{64} stays — nothing to do/);
  });

  it('the CONFIGURED pin reported without a watched fix — FAIL: the premise of the return no longer holds', async () => {
    const m = await load();
    const d = m.decideService(index(PIN), affected(m), pin);
    expect(d.kind).toBe('pinned-affected');
    expect(d.pass).toBe(false);
    const text = d.lines.join('\n');
    expect(text).toMatch(/the CONFIGURED pin sha256:f{64} \(postgres:18-alpine\) does NOT carry every watched fix/);
    expect(text).toMatch(/linux\/arm64 \[c-ares\]: c-ares 1\.34\.6-r0 falls inside an affected range/);
    expect(text).toMatch(/SCX-0002, SCX-0003, SCX-0004, SCX-0005, SCX-0010, SCX-0011/);
  });

  it("the manifest's platform_children disagreeing with the pinned index — FAIL, the record of the return is wrong", async () => {
    const m = await load();
    const d = m.decideService({ digest: PIN, children: { 'linux/amd64': `sha256:${'9'.repeat(64)}`, 'linux/arm64': ARM } }, fixed(m), pin);
    expect(d.kind).toBe('pinned-children');
    expect(d.pass).toBe(false);
    const text = d.lines.join('\n');
    expect(text).toMatch(/platform_children disagree with the index/);
    expect(text).toMatch(/linux\/amd64: the index lists sha256:9{64}, the manifest names sha256:a{64}/);
    // A pin that records no children is compared on the digest alone.
    const bare = m.decideService(index(PIN), fixed(m), { ...pin, children: {} });
    expect(bare.kind).toBe('pinned-fixed');
  });

  it('INDETERMINATE outranks everything, whichever index the tag names — and an unresolved tag is indeterminate', async () => {
    const m = await load();
    const broken = m.assessService('postgres', { 'linux/amd64': rep(pgOk), 'linux/arm64': { Results: 'nope' } });
    for (const digest of [PIN, NEWER]) {
      const d = m.decideService(index(digest), broken, pin);
      expect(d.kind, digest).toBe('indeterminate');
      expect(d.pass).toBe(false);
    }
    const unresolved = m.decideService({ digest: null, children: {} }, m.assessService('postgres', {}, { 'linux/amd64': 'x', 'linux/arm64': 'x' }), pin);
    expect(unresolved.kind).toBe('indeterminate');
    // A fixed verdict with no resolved digest is still indeterminate: there is nothing to compare.
    expect(m.decideService({ digest: null, children: {} }, fixed(m), pin).kind).toBe('indeterminate');
    // ...and so is a fixed verdict against a pin that could not be read.
    expect(m.decideService(index(PIN), fixed(m), { ...pin, digest: null }).kind).toBe('indeterminate');
    // pgOld is exercised on the pinned branch too: every fix affected on both platforms is still FAIL.
    expect(m.decideService(index(PIN), m.assessService('postgres', { 'linux/amd64': rep(pgOld), 'linux/arm64': rep(pgOld) }), pin).kind).toBe('pinned-affected');
  });

  it('readConfiguredPins reads the tracked manifest and refuses a malformed one', async () => {
    const m = await load();
    const pins = m.readConfiguredPins(readManifest());
    for (const service of ['postgres', 'redis']) {
      expect(pins[service].digest).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(pins[service].reference).toBe(`${pins[service].repository}@${pins[service].digest}`);
      expect(pins[service].children['linux/amd64']).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(pins[service].children['linux/arm64']).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(pins[service].pinned_at).toBe('2026-09-22');
    }
    const good = readManifest();
    const cut = (mutate: (d: any) => void) => { const d = JSON.parse(JSON.stringify(good)); mutate(d); return d; };
    expect(() => m.readConfiguredPins({})).toThrow(/no pinned_images/);
    expect(() => m.readConfiguredPins(cut((d) => { delete d.pinned_images.redis; }))).toThrow(/pinned_images\.redis is missing/);
    expect(() => m.readConfiguredPins(cut((d) => { d.pinned_images.postgres.digest = 'postgres:18-alpine'; }))).toThrow(/not a name@sha256:<64 hex> reference/);
    expect(() => m.readConfiguredPins(cut((d) => { d.pinned_images.postgres.platform_children['linux/amd64'] = 'latest'; }))).toThrow(/is not a sha256 digest/);
    expect(() => m.readConfiguredPins(cut((d) => { d.pinned_images.postgres.platform_children = []; }))).toThrow(/platform_children is not an object/);
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

  it('the workflow only reports: no re-pin, no evidence deletion, no write step', () => {
    const text = readFileSync(WF, 'utf8');
    expect(text).toMatch(/schedule:/);
    // The cadence is the owner's to change: daily at 07:20 UTC, unchanged by the return.
    expect(text).toMatch(/cron: '20 7 \* \* \*'/);
    expect(text).not.toMatch(/git (commit|push)|sed -i|docker-compose\.yml|conformance\.manifest\.json|rm -/);
    expect(text).not.toMatch(/scanner-exclusions\.json/);
  });
});

describe('C15 — a disposition is rejected ON its stated expiry date', () => {
  it('expires_on 2026-11-05 is in force on the 4th and rejected on the 5th', async () => {
    const m = await import(/* @vite-ignore */ join(LIB, 'scanner-exclusions.mjs'));
    const doc = readExclusions();
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
    const doc = readExclusions();
    const run = (d: unknown) => m.validateRecords(d, {
      // 2026-09-23: the day the owner approved the six re-issues for the official postgres index
      // (docs/SCANNER_DISPOSITIONS.md §3.9); a record approved after the run date is correctly
      // refused, so the run date is the newest approval.
      runDate: '2026-09-23', root: REPO, isTracked: () => true,
      readEvidence: (rel: string) => { try { return readFileSync(join(REPO, rel)); } catch { return null; } },
    }).problems;
    expect(run(doc)).toEqual([]);
    // Validating the field only when present left it removable: deleting the one line saying
    // "not for production data, not for Phase 1" produced no finding at all.
    const accepted = doc.records.filter((r: { classification: string }) => r.classification === 'RISK_ACCEPTED').map((r: { id: string }) => r.id);
    // SCX-0010 and SCX-0011 joined the set on 2026-09-10 (the linux/arm64 child is scanned now) and
    // were accepted by the owner on 2026-09-11, RISK_ACCEPTED within their scope and expiry — so
    // they, too, must carry a stated scope boundary. The 2026-09-23 re-issue changed no classification.
    expect(accepted).toEqual(['SCX-0002', 'SCX-0003', 'SCX-0010', 'SCX-0011']);
    for (const id of accepted) {
      const cut = JSON.parse(JSON.stringify(doc));
      delete cut.records.find((r: { id: string }) => r.id === id).prohibited_use;
      expect(run(cut).join('\n'), `${id} must be caught`).toMatch(/must declare prohibited_use/);
    }
  });

  it("the six records name the configured OFFICIAL image, carry the owner's approval date, and the retired ids govern nothing", () => {
    const doc = readExclusions();
    const compose = readFileSync(join(REPO, 'docker-compose.yml'), 'utf8');
    const pinned = [...compose.matchAll(/image:\s*(\S+@sha256:[a-f0-9]{64})/g)].map((x) => x[1]);
    const manifest = readManifest();
    // SCX-0002..0005 govern the linux/amd64 child, SCX-0010 and SCX-0011 the linux/arm64 child; all
    // six name the same configured index reference — a record is separated from its twin by
    // `scan_platform`, not by a different image.
    expect(doc.records.map((r: { id: string }) => r.id))
      .toEqual(['SCX-0002', 'SCX-0003', 'SCX-0004', 'SCX-0005', 'SCX-0010', 'SCX-0011']);
    expect(doc.records.filter((r: { scan_platform: string }) => r.scan_platform === 'linux/arm64')
      .map((r: { id: string }) => r.id)).toEqual(['SCX-0010', 'SCX-0011']);
    for (const r of doc.records) {
      expect(pinned, `${r.id} must name a pinned image`).toContain(r.image);
      // The OFFICIAL index the compose file returned to on 2026-09-22, not the derived image.
      expect(r.image).toBe(manifest.pinned_images.postgres.digest);
      expect(r.image).toMatch(/^postgres@sha256:/);
      expect(r.expires_on).toBe('2026-11-05');
      // Re-issued for the official index under the owner's approval of 2026-09-23 — the day the
      // approval was given, not the day the re-issues were drafted (2026-09-22) and not the dates
      // of the previous approvals (2026-09-10 amd64, 2026-09-11 arm64).
      expect(r.approved_on, `${r.id} approved_on`).toBe('2026-09-23');
      expect(r.reviewed_on, `${r.id} reviewed_on`).toBe('2026-09-23');
      expect(r.status, `${r.id} must carry no draft marker`).toBeUndefined();
      const paths = r.evidence_files.map((e: { path: string }) => e.path);
      if (r.scan_platform === 'linux/arm64') {
        expect(r.approver, `${r.id} names the owner as approver`).toMatch(/^product-owner/);
        expect(paths).toContain('docs/images/ARM64_RISK_DECISION.md');
        expect(paths).toContain('infra/images/official/20260922/inventory/official-postgres-arm64.txt');
      } else {
        expect(paths).toContain('infra/images/official/20260922/inventory/official-postgres-amd64.txt');
      }
      expect(paths).toContain('infra/images/candidates/evidence/v2/gosu-verification.txt');
      expect(paths).toContain('infra/images/official/20260922/scans/scan-summary.txt');
    }
    expect(doc.retired_records.ids).toEqual(['SCX-0001', 'SCX-0006', 'SCX-0007', 'SCX-0008', 'SCX-0009']);
    for (const id of doc.retired_records.ids) {
      expect(doc.records.some((r: { id: string }) => r.id === id), `${id} must not remain a record`).toBe(false);
    }
    // The 2026-09-10 versions were SUPERSEDED, not deleted: listed by identity, naming the derived
    // image, and no draft block remains — a draft that governs nothing must not linger beside the
    // records that do.
    expect(doc.superseded_records.ids).toEqual(doc.records.map((r: { id: string }) => r.id));
    expect(doc.superseded_records.superseded_on).toBe('2026-09-23');
    for (const s of doc.superseded_records.records) {
      expect(s.image).toMatch(/^ghcr\.io\/a-halawany\/elven\/postgres@sha256:/);
      expect(s.approved_on).toBe(s.scan_platform === 'linux/arm64' ? '2026-09-11' : '2026-09-10');
      expect(s.full_text_last_present_at).toMatch(/^[0-9a-f]{40}$/);
    }
    expect(doc.pending_reissues).toBeUndefined();
  });

  it('no record carries a decorative deadline that nothing enforces', () => {
    const doc = readExclusions();
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
 * used, which is the only way the platform pins and the digest-resolved references are proved
 * rather than assumed. The fake registry serves either the CONFIGURED pin (read from the tracked
 * manifest, so the control tracks a re-pin) or a different, "newer" index.
 */
describe('C15 — the recheck CLI, executed as a subprocess', () => {
  const CLI = join(REPO, 'scripts', 'gate', 'check-patched-images.mjs');
  const PG = 'postgres:18-alpine';
  const RD = 'redis:8-alpine';
  const AMD = 'linux/amd64';
  const ARM = 'linux/arm64';
  const MANIFEST = readManifest();
  const pinnedIndex = (service: 'postgres' | 'redis'): FakeIndex => {
    const entry = MANIFEST.pinned_images[service];
    return {
      digest: entry.digest.slice(entry.digest.indexOf('@') + 1),
      children: { [AMD]: entry.platform_children[AMD], [ARM]: entry.platform_children[ARM] },
    };
  };
  /** The configured pins, as the registry serves them today. */
  const PG_PINNED = pinnedIndex('postgres');
  const RD_PINNED = pinnedIndex('redis');
  /** A different index for each tag — a build the compose file is NOT pinned to. */
  const PG_INDEX: FakeIndex = { digest: `sha256:${'1'.repeat(64)}`, children: { [AMD]: `sha256:${'a'.repeat(64)}`, [ARM]: `sha256:${'b'.repeat(64)}` } };
  const RD_INDEX: FakeIndex = { digest: `sha256:${'2'.repeat(64)}`, children: { [AMD]: `sha256:${'c'.repeat(64)}`, [ARM]: `sha256:${'d'.repeat(64)}` } };

  type V = Array<[string, string, string] | [string, string, string, string]>;
  /** A postgres report: OpenSSL, libuuid and c-ares at the given versions (defaults: all still affected). */
  const pg = ({ ssl = '3.5.7-r0', uuid = '2.42.1-r0', cares = '1.34.6-r0', vulns = [] as V } = {}) =>
    buildReport({ packages: { libcrypto3: ssl, libssl3: ssl, libuuid: uuid, 'c-ares': cares }, vulns });
  /** A redis report: OpenSSL and setpriv (defaults: still affected). */
  const rd = ({ ssl = '3.5.7-r0', setpriv = '2.41.4-r0', vulns = [] as V } = {}) =>
    buildReport({ packages: { libcrypto3: ssl, libssl3: ssl, setpriv }, vulns });
  const PG_FIXED = { ssl: '3.5.8-r0', uuid: '2.42.3-r1', cares: '1.34.8-r0' };
  const RD_FIXED = { ssl: '3.5.8-r0', setpriv: '2.41.6-r1' };

  const run = (reports: Record<string, unknown | null>, opts: {
    digests?: Record<string, FakeIndex | null>; trivyWritesNothing?: boolean; manifest?: string;
  } = {}) => {
    const dir = mkdtempSync(join(tmpdir(), 'c15fake-'));
    const tc = fakeToolchain(dir, {
      digests: opts.digests ?? { [PG]: PG_INDEX, [RD]: RD_INDEX },
      reports,
      trivyWritesNothing: opts.trivyWritesNothing,
    });
    const r = spawnSync(process.execPath, [CLI, '--cache', join(dir, 'cache'), ...(opts.manifest === undefined ? [] : ['--manifest', opts.manifest])], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${tc.binDir}:${process.env.PATH}` },
      timeout: 120_000,
    });
    return { ...r, out: `${r.stdout}${r.stderr}`, calls: tc.calls() };
  };
  const stillAffected = () => ({ [PG]: pg({ vulns: [['HIGH', 'libcrypto3', '3.5.7-r0']] }), [RD]: rd() });
  const onThePins = { digests: { [PG]: PG_PINNED, [RD]: RD_PINNED } };

  it('the CONFIGURED pins, fixed on both platforms — PASSES (exit 0) and says each service is on the compatible official image', () => {
    const r = run({ [PG]: pg(PG_FIXED), [RD]: rd(RD_FIXED) }, onThePins);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/postgres: postgres:18-alpine -> sha256:[0-9a-f]{64} — configured pin sha256:[0-9a-f]{64} \(THE SAME index\)/);
    expect(r.out).toMatch(/postgres: the configured pin is the compatible official image \(postgres:18-alpine -> sha256:[0-9a-f]{64}; every watched fix \(openssl, util-linux\/postgres, c-ares\) is present on linux\/amd64 and linux\/arm64\)/);
    expect(r.out).toMatch(/redis: the configured pin is the compatible official image \(redis:8-alpine -> sha256:[0-9a-f]{64}; every watched fix \(openssl, util-linux\/redis\) is present/);
    expect(r.out).toMatch(/c15-recheck: PASS — postgres and redis on the configured official pins with every watched fix on both platforms; no NEWER compatible official build; nothing re-pinned, no evidence deleted/);
    expect(r.out).not.toMatch(/COMPATIBLE FIXED OFFICIAL image now exists/);
    for (const p of [AMD, ARM]) {
      expect(r.out).toMatch(new RegExp(`\\[openssl\\] ${p} PATCHED`));
      expect(r.out).toMatch(new RegExp(`\\[util-linux/postgres\\] ${p} PATCHED`));
      expect(r.out).toMatch(new RegExp(`\\[c-ares\\] ${p} PATCHED`));
      expect(r.out).toMatch(new RegExp(`\\[util-linux/redis\\] ${p} PATCHED`));
    }
  }, 120_000);

  it('the tags moved to builds that do NOT qualify — exits 0, reports every fix on both platforms, the pins stay', () => {
    const r = run(stillAffected());
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/\(a DIFFERENT index\)/);
    for (const p of [AMD, ARM]) {
      expect(r.out).toMatch(new RegExp(`\\[openssl\\] ${p} AFFECTED`));
      expect(r.out).toMatch(new RegExp(`\\[util-linux/postgres\\] ${p} AFFECTED`));
      expect(r.out).toMatch(new RegExp(`\\[c-ares\\] ${p} AFFECTED`));
      expect(r.out).toMatch(new RegExp(`\\[util-linux/redis\\] ${p} AFFECTED`));
    }
    expect(r.out).toMatch(/postgres: AFFECTED/);
    expect(r.out).toMatch(/redis: AFFECTED/);
    expect(r.out).toMatch(/postgres: the tag postgres:18-alpine now resolves to sha256:1{64}, which does not carry every watched fix .*; the configured pin sha256:[0-9a-f]{64} stays — nothing to do/);
    expect(r.out).toMatch(/c15-recheck: PASS — postgres and redis: the tag moved to a build that does not qualify, the configured pin stays; no NEWER compatible official build/);
    expect(r.out).not.toMatch(/COMPATIBLE FIXED OFFICIAL image/);
  }, 120_000);

  it('a NEWER compatible official build for postgres alone — FAILS, names the index and children, says it only reports', () => {
    const r = run({ [PG]: pg(PG_FIXED), [RD]: rd() });
    // The inversion is deliberate: the good news is what has to interrupt someone.
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/c15-recheck: a COMPATIBLE FIXED OFFICIAL image now exists for postgres: postgres:18-alpine -> sha256:1{64}/);
    expect(r.out).toMatch(/NEWER than the configured pin sha256:[0-9a-f]{64}: the tag has moved/);
    expect(r.out).toContain(`linux/amd64 child ${PG_INDEX.children[AMD]}`);
    expect(r.out).toContain(`linux/arm64 child ${PG_INDEX.children[ARM]}`);
    expect(r.out).toMatch(/This is a REPORT: nothing was re-pinned and no evidence was deleted/);
    expect(r.out).toMatch(/re-issue or retire SCX-0002, SCX-0003, SCX-0004, SCX-0005, SCX-0010, SCX-0011 \(they name the configured pin\)/);
    expect(r.out).not.toMatch(/exists for redis/);
    expect(r.out).toMatch(/redis: AFFECTED/);
    expect(r.out).not.toMatch(/c15-recheck: PASS/);
  }, 120_000);

  it('a NEWER build FIXED on amd64 only — nothing to do, exits 0: both platforms must qualify', () => {
    const r = run({ [`${PG}|${AMD}`]: pg(PG_FIXED), [`${PG}|${ARM}`]: pg(), [RD]: rd() });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/\[openssl\] linux\/amd64 PATCHED/);
    expect(r.out).toMatch(/\[openssl\] linux\/arm64 AFFECTED/);
    expect(r.out).toMatch(/postgres: AFFECTED/);
    expect(r.out).not.toMatch(/COMPATIBLE FIXED OFFICIAL image/);
  }, 120_000);

  it('a NEWER compatible build for redis alone — FAILS for redis and says no record names its pin', () => {
    const r = run({ [PG]: pg(), [RD]: rd(RD_FIXED) });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/exists for redis: redis:8-alpine -> sha256:2{64}/);
    expect(r.out).toMatch(/confirm no SCX record names the configured pin/);
    expect(r.out).not.toMatch(/exists for postgres/);
  }, 120_000);

  it('the CONFIGURED pin reported without a watched fix — FAILS: the premise of the return no longer holds', () => {
    const r = run({ [PG]: pg({ ...PG_FIXED, cares: '1.34.6-r0' }), [RD]: rd(RD_FIXED) }, onThePins);
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/c15-recheck: postgres: the CONFIGURED pin sha256:[0-9a-f]{64} \(postgres:18-alpine\) does NOT carry every watched fix:/);
    expect(r.out).toMatch(/linux\/amd64 \[c-ares\]: c-ares 1\.34\.6-r0 falls inside an affected range/);
    expect(r.out).toMatch(/return's premise no longer holds/);
    // redis, on its pin and fixed, is still reported as such; the job fails on postgres alone.
    expect(r.out).toMatch(/redis: the configured pin is the compatible official image/);
    expect(r.out).not.toMatch(/c15-recheck: PASS/);
  }, 120_000);

  it("the manifest's platform_children disagreeing with the pinned index — FAILS", () => {
    const r = run({ [PG]: pg(PG_FIXED), [RD]: rd(RD_FIXED) }, {
      digests: { [PG]: { digest: PG_PINNED.digest, children: { [AMD]: `sha256:${'9'.repeat(64)}`, [ARM]: PG_PINNED.children[ARM] } }, [RD]: RD_PINNED },
    });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/platform_children disagree with the index it names/);
    expect(r.out).toMatch(new RegExp(`linux/amd64: the index lists sha256:9{64}, the manifest names ${PG_PINNED.children[AMD]}`));
    expect(r.out).not.toMatch(/c15-recheck: PASS/);
  }, 120_000);

  it('a manifest that cannot be read is an INDETERMINATE check, not a pass', () => {
    const r = run({ [PG]: pg(PG_FIXED), [RD]: rd(RD_FIXED) }, { ...onThePins, manifest: join(tmpdir(), 'no-such-manifest.json') });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/the configured pins could not be read from .*no-such-manifest\.json/);
    expect(r.out).toMatch(/nothing can be decided against/);
    // Nothing was resolved or scanned: the pins are read before anything is executed.
    expect(r.calls.length).toBe(0);
  }, 120_000);

  it('a platform ABSENT from the official index is indeterminate and fails closed', () => {
    const r = run({ [PG]: pg(PG_FIXED), [RD]: rd() },
      { digests: { [PG]: { digest: PG_INDEX.digest, children: { [AMD]: PG_INDEX.children[AMD] } }, [RD]: RD_INDEX } });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/linux\/arm64: ABSENT from the index/);
    expect(r.out).toMatch(/could not be checked on both platforms/);
    expect(r.out).toMatch(/no linux\/arm64 child/);
    expect(r.out).not.toMatch(/COMPATIBLE FIXED OFFICIAL image/);
  }, 120_000);

  it('util-linux at the fixed BASE but the wrong REVISION is still AFFECTED', () => {
    // CVE-2026-78408 is fixed in -r1; 2.42.3-r0 clears its siblings and not it.
    const r = run({ [PG]: pg({ ...PG_FIXED, uuid: '2.42.3-r0' }), [RD]: rd({ ...RD_FIXED, setpriv: '2.41.6-r0' }) });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/\[util-linux\/postgres\] linux\/amd64 AFFECTED/);
    expect(r.out).toMatch(/\[util-linux\/redis\] linux\/amd64 AFFECTED/);
    expect(r.out).toMatch(/\[openssl\] linux\/amd64 PATCHED/);
    // ...and on the configured pin the same shape FAILS rather than passing on the other fixes.
    const pinned = run({ [PG]: pg({ ...PG_FIXED, uuid: '2.42.3-r0' }), [RD]: rd(RD_FIXED) }, onThePins);
    expect(pinned.status).not.toBe(0);
    expect(pinned.out).toMatch(/does NOT carry every watched fix/);
  }, 120_000);

  it('SEVERITY RECLASSIFICATION to Low is still affected', () => {
    const r = run({
      [PG]: pg({ vulns: [['LOW', 'libcrypto3', '3.5.7-r0'], ['LOW', 'libssl3', '3.5.7-r0']] }),
      [RD]: rd({ vulns: [['LOW', 'libcrypto3', '3.5.7-r0']] }),
    });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/\[openssl\] linux\/amd64 AFFECTED/);
  }, 120_000);

  it('ADVISORY DISAPPEARANCE with an unchanged package is still affected', () => {
    const r = run({ [PG]: pg(), [RD]: rd() });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toMatch(/no longer listed, but the package was not rebuilt/);
  }, 120_000);

  it('CONTRADICTORY advisory row against a fixed inventory FAILS the job', () => {
    // Fixed packages plus a stale CVE row previously returned affected, so the CLI exited 0 and the
    // contradiction passed unnoticed.
    const r = run({
      [PG]: pg({ ...PG_FIXED, vulns: [['HIGH', 'libcrypto3', '3.5.7-r0']] }),
      [RD]: rd(),
    });
    expect(r.status, 'a self-contradictory report must fail the job').not.toBe(0);
    expect(r.out).toMatch(/disagrees with itself/);
    expect(r.out).toMatch(/could not be checked on both platforms/);
  }, 120_000);

  it('DUPLICATE conflicting versions FAIL rather than depend on ordering', () => {
    const r = run({
      [PG]: buildReport({ packages: { libcrypto3: ['3.5.7-r0', '3.5.8-r0'], libssl3: '3.5.8-r0', libuuid: '2.42.3-r1', 'c-ares': '1.34.8-r0' } }),
      [RD]: rd(),
    });
    expect(r.status).not.toBe(0);
    expect(r.out).toMatch(/more than one installed version/);
  }, 120_000);

  it('MALFORMED and INCOMPLETE reports are indeterminate and fail the job — on the pin as well as off it', () => {
    for (const raw of [null, 'a string', 42, [], { Results: 'nope' }, {}]) {
      const r = run({ [PG]: buildReport({ raw }), [RD]: rd() });
      expect(r.status, `${JSON.stringify(raw)} must fail`).not.toBe(0);
      expect(r.out).toMatch(/could not be checked on both platforms/);
    }
    // A report missing one watched package entirely.
    const partial = run({
      [PG]: buildReport({ packages: { libcrypto3: '3.5.8-r0', libuuid: '2.42.3-r1', 'c-ares': '1.34.8-r0' } }), [RD]: rd(),
    });
    expect(partial.status).not.toBe(0);
    expect(partial.out).toMatch(/no installed version for libssl3/);
    // The configured pin with an unreadable arm64 report: indeterminate outranks "on the pin".
    const onPin = run({ [`${PG}|${AMD}`]: pg(PG_FIXED), [`${PG}|${ARM}`]: buildReport({ raw: { Results: 'nope' } }), [RD]: rd(RD_FIXED) }, onThePins);
    expect(onPin.status).not.toBe(0);
    expect(onPin.out).toMatch(/could not be checked on both platforms/);
    expect(onPin.out).not.toMatch(/postgres: the configured pin is the compatible official image/);
  }, 300_000);

  it('an UNRESOLVABLE index or a failed scan fails closed', () => {
    const noDigest = run(stillAffected(), { digests: { [PG]: null, [RD]: RD_INDEX } });
    expect(noDigest.status).not.toBe(0);
    expect(noDigest.out).toMatch(/UNRESOLVED/);
    expect(noDigest.out).toMatch(/could not be checked on both platforms/);

    const scanFails = run({ [PG]: null, [RD]: rd() });
    expect(scanFails.status).not.toBe(0);
    expect(scanFails.out).toMatch(/the scan failed/);

    // Trivy exits 0 but writes no report — "could not check" must not read like "nothing to do".
    const noFile = run(stillAffected(), { trivyWritesNothing: true });
    expect(noFile.status).not.toBe(0);
    expect(noFile.out).toMatch(/unreadable/);
  }, 300_000);

  it('scans the EXACT platform child of each digest-resolved official index, on both platforms', () => {
    const r = run(stillAffected());
    const trivy = r.calls.filter((c) => c.tool === 'trivy');
    // Two services × two platforms.
    expect(trivy.length).toBe(4);
    const seen = new Set<string>();
    for (const call of trivy) {
      // The platform is pinned, because a scanner given none follows the host and would examine a
      // different child with different layers.
      expect(call.argv).toContain('--platform');
      const platform = call.argv[call.argv.indexOf('--platform') + 1];
      expect([AMD, ARM]).toContain(platform);
      // And the reference is the resolved CHILD DIGEST for that platform, never the moving tag.
      const ref = call.argv[call.argv.length - 1];
      expect(ref).toMatch(/@sha256:[0-9a-f]{64}$/);
      expect([
        `postgres@${PG_INDEX.children[platform as 'linux/amd64']}`,
        `redis@${RD_INDEX.children[platform as 'linux/amd64']}`,
      ]).toContain(ref);
      seen.add(`${ref}|${platform}`);
      // No severity filter: that is what let a reclassification read as a fix.
      expect(call.argv).not.toContain('--severity');
    }
    expect(seen.size).toBe(4);
    const docker = r.calls.filter((c) => c.tool === 'docker');
    // Per tag: the raw index (children) and the formatted listing (the index digest).
    expect(docker.length).toBe(4);
    for (const d of docker) expect(d.argv.slice(0, 3)).toEqual(['buildx', 'imagetools', 'inspect']);
    expect(docker.filter((d) => d.argv.includes('--raw')).length).toBe(2);
  }, 120_000);
});
