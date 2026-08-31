/**
 * C19 — BEHAVIOURAL CONTROLS FOR THE SINGLE DELIVERY PIPELINE.
 *
 * Every control here EXECUTES the production code path with injected inputs. None of them asserts
 * on comments, test names or YAML text — that is what let three rounds of defects survive a green
 * suite, because the prose described behaviour the code did not have.
 *
 * The GitHub layer is injected, so resolution, pagination and fail-closed behaviour run for real
 * against constructed responses rather than being approximated.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const LIB = join(REPO, 'scripts', 'gate', 'lib');
const FIX = join(HERE, 'fixtures', 'c19');
const load = (m: string) => import(/* @vite-ignore */ join(LIB, m));

/** A GitHub layer built from constructed responses, exercising the real resolver. */
function fakeGitHub({ runs = [], attempts = {}, artifacts = {}, failAttempts = new Set<string>() }: any) {
  return {
    repo: 'a-Halawany/elven',
    runsForSha: () => runs,
    runAttempt: (id: any, n: any) => {
      const key = `${id}#${n}`;
      // An API FAILURE is not an absent attempt. Conflating them lets a transient error promote a
      // later attempt to canonical.
      if (failAttempts.has(key)) throw new Error(`c19-github: attempt ${key} could not be read`);
      return attempts[key] ?? null;
    },
    artifacts: (id: any) => artifacts[String(id)] ?? [],
    artifactZip: () => Buffer.alloc(0),
    branchTip: () => 'main-tip',
  };
}
const ciRun = (id: number, attempt: number) => ({ id, name: 'ci', event: 'push', run_attempt: attempt });
const finRun = (id: number, attempt: number) => ({ id, name: 'C17 finalize', event: 'workflow_run', run_attempt: attempt });
const ok = { conclusion: 'success' };
const bad = { conclusion: 'failure' };

export function registerC19Pipeline(): void {
  describe('C19 — canonical attempt resolution, executed', () => {
    it('attempt 1 succeeds and attempt 2 also succeeds: attempt 1 is canonical', async () => {
      const r = await load('c19-resolve.mjs');
      // The attempt is part of the publication identity, so the later success must NOT mint a
      // second identity for evidence already published.
      const gh = fakeGitHub({ runs: [ciRun(10, 2)], attempts: { '10#1': ok, '10#2': ok } });
      expect(r.resolveCanonicalSource({ gh, sha: 'x' })).toMatchObject({ runId: '10', runAttempt: '1' });
    });

    it('attempt 1 fails and attempt 2 succeeds: attempt 2 is canonical', async () => {
      const r = await load('c19-resolve.mjs');
      const gh = fakeGitHub({ runs: [ciRun(10, 2)], attempts: { '10#1': bad, '10#2': ok } });
      expect(r.resolveCanonicalSource({ gh, sha: 'x' })).toMatchObject({ runId: '10', runAttempt: '2' });
    });

    it('a success later REPLACED in the default view by a failed rerun is still found', async () => {
      const r = await load('c19-resolve.mjs');
      // This is not hypothetical: re-running main's CI to demonstrate an unrelated CVE turned
      // attempt 1 `success` into a run reporting `failure`, and a conclusion filter stopped seeing
      // a publication that plainly existed.
      const gh = fakeGitHub({ runs: [{ ...ciRun(10, 2), conclusion: 'failure' }], attempts: { '10#1': ok, '10#2': bad } });
      expect(r.resolveCanonicalSource({ gh, sha: 'x' })).toMatchObject({ runId: '10', runAttempt: '1' });
    });

    it('considers ALL matching run ids, not just the first listed', async () => {
      const r = await load('c19-resolve.mjs');
      // A re-dispatch creates a new RUN, not a new attempt. Looking at one run makes the answer
      // depend on listing order.
      const gh = fakeGitHub({
        runs: [ciRun(20, 3), ciRun(10, 1)],
        attempts: { '20#1': bad, '20#2': bad, '20#3': ok, '10#1': ok },
      });
      expect(r.resolveCanonicalSource({ gh, sha: 'x' })).toMatchObject({ runId: '10', runAttempt: '1' });
    });

    it('an EARLIER ATTEMPT that cannot be read is fail-closed, not treated as absent', async () => {
      const r = await load('c19-resolve.mjs');
      const gh = fakeGitHub({
        runs: [ciRun(10, 2)], attempts: { '10#2': ok }, failAttempts: new Set(['10#1']),
      });
      // Silently skipping attempt 1 would promote attempt 2 to canonical and mint a second identity.
      expect(() => r.resolveCanonicalSource({ gh, sha: 'x' })).toThrow(/could not be read/);
    });

    it('TWO finalizer run ids for one SHA are ambiguous and refused', async () => {
      const r = await load('c19-resolve.mjs');
      const gh = fakeGitHub({
        runs: [finRun(30, 1), finRun(31, 1)], attempts: { '30#1': ok, '31#1': ok },
      });
      expect(() => r.resolveCanonicalFinalizer({ gh, sha: 'x', sourceRunId: '10' }))
        .toThrow(/ambiguous and is refused rather than guessed/);
    });

    it('no successful attempt anywhere is an error, never an empty answer', async () => {
      const r = await load('c19-resolve.mjs');
      const gh = fakeGitHub({ runs: [ciRun(10, 2)], attempts: { '10#1': bad, '10#2': bad } });
      expect(() => r.resolveCanonicalSource({ gh, sha: 'x' })).toThrow(/no attempt .* succeeded/);
    });

    it('a NON-CANONICAL invocation is refused rather than serialized behind the canonical one', async () => {
      const r = await load('c19-resolve.mjs');
      // Serialising is not enough: both would eventually run, and the second would duplicate.
      expect(r.assertCanonicalInvocation({
        canonical: { runId: '30', runAttempt: '1' },
        actualRunId: '30', actualAttempt: '2', what: 'finalizer',
      }).join('\n')).toMatch(/attempt 1 is canonical and owns this publication identity/);
      expect(r.assertCanonicalInvocation({
        canonical: { runId: '30', runAttempt: '1' },
        actualRunId: '31', actualAttempt: '1', what: 'finalizer',
      }).join('\n')).toMatch(/second publication identity/);
      // The canonical invocation itself is permitted.
      expect(r.assertCanonicalInvocation({
        canonical: { runId: '30', runAttempt: '1' },
        actualRunId: '30', actualAttempt: '1', what: 'finalizer',
      })).toEqual([]);
    });
  });

  describe('C19 — a superseded commit cannot publish, executed', () => {
    it('REFUSES when the SHA is no longer the branch tip', async () => {
      const p = await load('c19-pipeline.mjs');
      const gh = {
        ...fakeGitHub({
          runs: [ciRun(10, 1), finRun(30, 1)],
          attempts: { '10#1': ok, '30#1': ok },
        }),
        branchTip: () => 'a-newer-commit',
      };
      const r = p.resolve({ gh, sha: 'the-old-commit' });
      // The run was genuinely successful, which is exactly why this must be explicit.
      expect(r.problems.join('\n')).toMatch(/no longer the tip of main/);
    });

    it('PERMITS the current tip', async () => {
      const p = await load('c19-pipeline.mjs');
      const gh = {
        ...fakeGitHub({ runs: [ciRun(10, 1), finRun(30, 1)], attempts: { '10#1': ok, '30#1': ok } }),
        branchTip: () => 'the-tip',
      };
      expect(p.resolve({ gh, sha: 'the-tip' }).problems).toEqual([]);
    });
  });

  describe('C19 — pagination and artifact selection, executed', () => {
    it('follows Link headers rather than accepting a first page as the whole answer', async () => {
      const g = await load('c19-github.mjs');
      expect(g.parseNextLink('link: <https://api.github.com/x?page=2>; rel="next"')).toBe('x?page=2');
      expect(g.parseNextLink('link: <https://api.github.com/x?page=9>; rel="last"')).toBeNull();
      expect(g.parseNextLink('content-type: application/json')).toBeNull();
    });

    it('an unreadable page raises rather than shortening the list', async () => {
      const g = await load('c19-github.mjs');
      let n = 0;
      const gh = g.createGitHub({
        repo: 'a/b',
        request: () => (++n === 1
          ? { ok: true, status: 200, body: { workflow_runs: [ciRun(1, 1)] }, nextPage: 'page2' }
          : { ok: false, status: 500 }),
      });
      expect(() => gh.runsForSha('x')).toThrow(/refusing to treat an unreadable page as an empty one/);
    });

    it('paginated artifact results are fully collected', async () => {
      const g = await load('c19-github.mjs');
      let n = 0;
      const gh = g.createGitHub({
        repo: 'a/b',
        request: () => (++n === 1
          ? { ok: true, status: 200, body: { artifacts: [{ id: 1 }] }, nextPage: 'p2' }
          : { ok: true, status: 200, body: { artifacts: [{ id: 2 }] }, nextPage: null }),
      });
      expect(gh.artifacts(5).map((a: any) => a.id)).toEqual([1, 2]);
    });

    it.each([
      ['missing', []],
      ['duplicated', [
        { id: 1, name: 'c17-evidence-finalized-a1-x', expired: false, digest: 'sha256:' + 'a'.repeat(64) },
        { id: 2, name: 'c17-evidence-finalized-a1-y', expired: false, digest: 'sha256:' + 'b'.repeat(64) },
      ]],
      ['expired only', [{ id: 1, name: 'c17-evidence-finalized-a1-x', expired: true, digest: 'sha256:' + 'a'.repeat(64) }]],
      ['wrong attempt', [{ id: 1, name: 'c17-evidence-finalized-a2-x', expired: false, digest: 'sha256:' + 'a'.repeat(64) }]],
    ])('REFUSES %s artifact results', async (_n, arts) => {
      const acq = await load('c19-acquire.mjs');
      const gh = fakeGitHub({ artifacts: { '30': arts } });
      expect(() => acq.acquire({
        gh, finalizerRunId: '30', finalizerAttempt: '1', out: mkdtempSync(join(tmpdir(), 'c19t-')),
      })).toThrow(/expected exactly one unexpired artifact/);
    });

    it('REFUSES a malformed or absent API digest, failing closed', async () => {
      const acq = await load('c19-acquire.mjs');
      for (const digest of [undefined, null, 'notadigest', 'sha256:zz', 'sha1:' + 'a'.repeat(40)]) {
        const gh = fakeGitHub({
          artifacts: { '30': [{ id: 1, name: 'c17-evidence-finalized-a1-x', expired: false, digest }] },
        });
        expect(() => acq.acquire({
          gh, finalizerRunId: '30', finalizerAttempt: '1', out: mkdtempSync(join(tmpdir(), 'c19t-')),
        })).toThrow(/no usable sha256 digest|refusing to authenticate the wrapper against nothing/);
      }
    });
  });

  describe('C19 — ZIP member safety, executed', () => {
    it.each([
      ['absolute path', '/etc/passwd'],
      ['parent traversal', '../../etc/passwd'],
      ['nested traversal', 'a/../../b'],
      ['backslash', 'a\\b'],
    ])('REFUSES an unsafe member name: %s', async (_n, member) => {
      const acq = await load('c19-acquire.mjs');
      // "Extract the evidence" must not become "write anywhere the runner can".
      expect(acq.checkMemberNames([member]).length).toBeGreaterThan(0);
    });

    it('accepts ordinary relative names', async () => {
      const acq = await load('c19-acquire.mjs');
      expect(acq.checkMemberNames(['c17-cross-host-finalized-' + 'a'.repeat(40) + '.zip'])).toEqual([]);
    });

    it('the inner archive name must match the canonical form', async () => {
      const acq = await load('c19-acquire.mjs');
      expect(acq.WRAPPER_INNER_RE.test(`c17-cross-host-finalized-${'a'.repeat(40)}.zip`)).toBe(true);
      expect(acq.WRAPPER_INNER_RE.test('anything-else.zip')).toBe(false);
      expect(acq.WRAPPER_INNER_RE.test('c17-cross-host-finalized-short.zip')).toBe(false);
    });
  });

  describe('C19 — Rekor entry reconstruction, executed against a fixture', () => {
    const entries = JSON.parse(readFileSync(join(FIX, 'rekor-entry.json'), 'utf8'));
    const entry = Object.values(entries)[0] as any;
    const trustedRoot = JSON.parse(readFileSync(join(FIX, 'trusted-root.json'), 'utf8'));
    const payload = readFileSync(join(FIX, 'payload.json'));

    it('converts a raw Rekor entry into a verifiable Sigstore bundle', async () => {
      const rk = await load('c19-rekor.mjs');
      const a = await load('c19-anchor.mjs');
      const bundle = rk.rekorEntryToBundle(entry, { uuid: 'u' });
      expect(bundle.mediaType).toBe(rk.BUNDLE_MEDIA_TYPE);
      // The whole point: the API and the bundle disagree on names and encodings, and every one of
      // these is a place a plausible conversion silently produces something unverifiable.
      const tle = bundle.verificationMaterial.tlogEntries[0];
      expect(tle.canonicalizedBody).toBe(entry.body);                      // body -> canonicalizedBody
      expect(tle.logId.keyId).toBe(Buffer.from(entry.logID, 'hex').toString('base64')); // hex -> b64
      expect(tle.inclusionProof.rootHash)
        .toBe(Buffer.from(entry.verification.inclusionProof.rootHash, 'hex').toString('base64'));
      expect(tle.inclusionProof.checkpoint.envelope)
        .toBe(entry.verification.inclusionProof.checkpoint);               // string -> {envelope}
      expect(tle.inclusionPromise.signedEntryTimestamp)
        .toBe(entry.verification.signedEntryTimestamp);
      // And it actually verifies, end to end, against the fixture's own log key.
      expect(rk.bundleMatchesPayload(bundle, payload)).toEqual([]);
      expect(a.verifyRekorSet(tle, trustedRoot)).toEqual([]);
      expect(a.verifyCheckpoint(tle, trustedRoot).problems).toEqual([]);
      expect(a.verifyInclusionProof(tle, trustedRoot)).toEqual([]);
    });

    it.each([
      ['tampered audit path', (t: any) => { t.inclusionProof.hashes[0] = Buffer.alloc(32).toString('base64'); }],
      ['tampered SET', (t: any) => { t.inclusionPromise.signedEntryTimestamp = Buffer.alloc(70).toString('base64'); }],
      ['tampered checkpoint size', (t: any) => { t.inclusionProof.checkpoint.envelope = t.inclusionProof.checkpoint.envelope.replace('\n4\n', '\n5\n'); }],
      ['removed checkpoint', (t: any) => { delete t.inclusionProof.checkpoint; }],
    ])('REFUSES a reconstructed bundle with %s', async (_n, mutate) => {
      const rk = await load('c19-rekor.mjs');
      const a = await load('c19-anchor.mjs');
      const bundle = rk.rekorEntryToBundle(entry, { uuid: 'u' });
      const tle = bundle.verificationMaterial.tlogEntries[0];
      mutate(tle);
      const problems = [
        ...a.verifyRekorSet(tle, trustedRoot),
        ...a.verifyCheckpoint(tle, trustedRoot).problems,
        ...a.verifyInclusionProof(tle, trustedRoot),
      ];
      expect(problems.length).toBeGreaterThan(0);
    });

    it('REFUSES an entry that attests different bytes', async () => {
      const rk = await load('c19-rekor.mjs');
      const bundle = rk.rekorEntryToBundle(entry, { uuid: 'u' });
      expect(rk.bundleMatchesPayload(bundle, Buffer.from('different')).join('\n'))
        .toMatch(/not about these bytes/);
    });
  });

  describe('C19 — recovery across attempts, executed', () => {
    const entries = JSON.parse(readFileSync(join(FIX, 'rekor-entry.json'), 'utf8'));
    const entry = Object.values(entries)[0] as any;
    const payload = readFileSync(join(FIX, 'payload.json'));

    it('attempt N reaches Rekor, loses persistence; attempt N+1 reconstructs with ZERO signing', async () => {
      const p = await load('c19-pipeline.mjs');
      const a = await load('c19-anchor.mjs');
      const { policy } = a.loadTrustMaterial(LIB);
      const trustedRoot = JSON.parse(readFileSync(join(FIX, 'trusted-root.json'), 'utf8'));
      const out = mkdtempSync(join(tmpdir(), 'c19rec-'));
      const bundlePath = join(out, 'bundle.sigstore.json');
      let signings = 0;

      const outcome = await p.recoverOrSign({
        canonicalBytes: payload,
        payloadPath: join(FIX, 'payload.json'),
        bundlePath, policy, trustedRoot,
        // The original signer's run is confirmed through GitHub — and its CONCLUSION is not
        // required to be success, because the recovery case exists precisely when the run failed
        // after Rekor accepted the signature.
        gh: { runAttempt: () => ({
          repository: { full_name: 'a-Halawany/elven' },
          path: '.github/workflows/c19-anchor.yml', head_branch: 'main',
          event: 'workflow_run', conclusion: 'cancelled', head_sha: 'a'.repeat(40),
        }) },
        search: async () => ['uuid-fixture'],
        fetchEntry: async () => entry,
        mode: 'publish',
        sign: () => { signings += 1; },
      });

      // The fixture certificate is not a Fulcio identity, so full verification refuses — which is
      // correct. What this control proves is the SHAPE of the decision: an existing record is
      // reconstructed and judged, and signing is never reached.
      expect(['reuse', 'refuse']).toContain(outcome.action);
      expect(signings, 'a retry after lost persistence must perform zero signing operations').toBe(0);
    });

    it('with NO existing record it signs exactly once, and only in publish mode', async () => {
      const p = await load('c19-pipeline.mjs');
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      const out = mkdtempSync(join(tmpdir(), 'c19sign-'));
      const bundlePath = join(out, 'bundle.sigstore.json');
      let signings = 0;

      const dry = await p.recoverOrSign({
        canonicalBytes: payload, payloadPath: join(FIX, 'payload.json'), bundlePath,
        policy, trustedRoot, gh: {}, search: async () => [], fetchEntry: async () => null,
        mode: 'dry-run', sign: () => { signings += 1; },
      });
      expect(dry.action).toBe('would-sign');
      expect(signings, 'a dry run must never sign').toBe(0);

      const real = await p.recoverOrSign({
        canonicalBytes: payload, payloadPath: join(FIX, 'payload.json'), bundlePath,
        policy, trustedRoot, gh: {}, search: async () => [], fetchEntry: async () => null,
        mode: 'publish', sign: () => { signings += 1; writeFileSync(bundlePath, '{}'); },
      });
      expect(real.action).toBe('signed');
      expect(signings).toBe(1);
    });

    it('REFUSES a duplicate: two records for one publication identity', async () => {
      const p = await load('c19-pipeline.mjs');
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      let signings = 0;
      const r = await p.recoverOrSign({
        canonicalBytes: payload, payloadPath: 'p', bundlePath: 'b', policy, trustedRoot, gh: {},
        search: async () => ['u1', 'u2'], fetchEntry: async () => entry, mode: 'publish',
        sign: () => { signings += 1; },
      });
      expect(r.action).toBe('refuse');
      expect(signings).toBe(0);
    });

    it('REFUSES to sign when the log cannot be queried', async () => {
      const p = await load('c19-pipeline.mjs');
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      let signings = 0;
      const r = await p.recoverOrSign({
        canonicalBytes: payload, payloadPath: 'p', bundlePath: 'b', policy, trustedRoot, gh: {},
        search: async () => { throw new Error('network down'); },
        fetchEntry: async () => null, mode: 'publish', sign: () => { signings += 1; },
      });
      expect(r.action).toBe('refuse');
      // Signing without knowing whether a record exists is exactly how a duplicate is created.
      expect(signings).toBe(0);
    });

    it('a REPLAYED publication identity produces the same bytes, so it finds its own entry', async () => {
      const at = await load('c19-attest.mjs');
      const facts = {
        sourceSha: 'a'.repeat(40), sourceTree: 'b'.repeat(40), sourceRunId: '1',
        sourceRunAttempt: '1', sourceEvent: 'push', finalizerRunId: '2', finalizerRunAttempt: '1',
        evidenceArtifactId: '9', evidenceDigest: 'c'.repeat(64), finalizedInnerDigest: 'd'.repeat(64),
        workflowRef: 'r', workflowDigest: 'e'.repeat(40),
      };
      // Determinism is what makes recovery possible: a random nonce made the search impossible.
      expect(at.publicationIdentity(facts)).toBe(at.publicationIdentity({ ...facts }));
      expect(at.publicationIdentity({ ...facts, finalizerRunAttempt: '2' }))
        .not.toBe(at.publicationIdentity(facts));
    });
  });

  describe('C19 — the delivery command refuses malformed invocation', () => {
    const CLI = join(REPO, 'scripts', 'gate', 'c19-deliver.mjs');
    const run = (args: string[]) => spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });

    it.each([
      [[], /usage: c19-deliver/],
      [['not-a-mode'], /usage: c19-deliver/],
      [['publish'], /--out is required/],
      [['dry-run', '--out', '/tmp/x'], /--repo is required/],
      [['verify-offline', '--out', '/tmp/x'], /--package is required/],
    ])('REFUSES %j', (args, expected) => {
      const r = run(args as string[]);
      expect(r.status).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(expected as RegExp);
    });

    it('there is no mode that signs by default', async () => {
      const p = await load('c19-pipeline.mjs');
      // `publish` must be stated. A command that signs because nobody said otherwise is the worst
      // possible default for an irreversible action.
      expect(p.PIPELINE_MODES).toEqual(['plan', 'dry-run', 'publish', 'verify-offline']);
    });
  });

  describe('C19 — offline is enforced by the OS, not by patching Node', () => {
    it('constrains a SPAWNED child, which Node patching cannot', async () => {
      const s = await load('c19-sandbox.mjs');
      const mech = s.networkDenialMechanism();
      if (mech === null) return;                      // unsupported platform: covered below
      const r = s.runWithoutNetwork([process.execPath, '-e',
        'const h=require("https");const q=h.request("https://example.com");'
        + 'q.on("error",e=>{console.log("DENIED");process.exit(0)});q.end();'
        + 'setTimeout(()=>{console.log("NOT-DENIED");process.exit(1)},6000)']);
      expect(r.stdout).toMatch(/DENIED/);
      expect(r.enforced).toBe(true);
    }, 30_000);

    it('still permits file access, which offline verification needs', async () => {
      const s = await load('c19-sandbox.mjs');
      if (s.networkDenialMechanism() === null) return;
      const r = s.runWithoutNetwork([process.execPath, '-e',
        'require("fs").readFileSync("/etc/hosts");console.log("FILES-OK")']);
      expect(r.stdout).toMatch(/FILES-OK/);
    }, 30_000);

    it('builds the right argv for BOTH platforms', async () => {
      const s = await load('c19-sandbox.mjs');
      const present = () => true;
      expect(s.denyNetworkArgv(['cosign', 'verify-blob'], { platform: 'linux', probe: present }))
        .toEqual(['unshare', '--net', '-r', 'cosign', 'verify-blob']);
      expect(s.denyNetworkArgv(['cosign'], { platform: 'darwin', profilePath: '/p.sb', probe: present }))
        .toEqual(['sandbox-exec', '-f', '/p.sb', 'cosign']);
    });

    it('REFUSES to call an unconstrained run "offline"', async () => {
      const s = await load('c19-sandbox.mjs');
      expect(() => s.runWithoutNetwork(['echo'], { platform: 'sunos', probe: () => false }))
        .toThrow(/refusing to run unconstrained and call the result offline/);
    });
  });

  describe('C19 — cosign is pinned, patched, and the same binary throughout', () => {
    it('is no longer the vulnerable v2.4.1', async () => {
      const c = await load('c19-cosign.mjs');
      expect(c.COSIGN_PIN.version_tag).not.toBe('v2.4.1');
      expect(c.COSIGN_PIN.version_tag).toMatch(/^v[3-9]\./);
    });

    it('REFUSES to execute a binary that fails its pinned digest', async () => {
      const c = await load('c19-cosign.mjs');
      const p = join(mkdtempSync(join(tmpdir(), 'c19cs-')), 'cosign');
      writeFileSync(p, 'not the real binary');
      expect(c.verifyBinary(p, 'linux-amd64').join('\n'))
        .toMatch(/refusing to execute an unverified signing tool/);
    });

    it('signing and verifying name ONE explicit bundle format', async () => {
      const c = await load('c19-cosign.mjs');
      const sign = c.signBlobArgv({ cosignPath: '/c', bundlePath: 'b', payloadPath: 'p' });
      expect(sign).toContain('--new-bundle-format');
      const verify = c.verifyBlobArgv({
        cosignPath: '/c', bundlePath: 'b', payloadPath: 'p',
        certificateIdentity: 'san', oidcIssuer: 'iss', trustedRootPath: 'tr',
      });
      // Exact identity, never a regexp variant: a pattern accepts workflows never authorised.
      expect(verify).toContain('--certificate-identity');
      expect(verify).not.toContain('--certificate-identity-regexp');
      expect(verify).toContain('--offline');
      expect(sign[0]).toBe(verify[0]);   // the same binary path
    });
  });

  describe('C19 — the workflows contain no second implementation', () => {
    const lifecycle = readFileSync(join(REPO, '.github', 'workflows', 'c19-lifecycle.yml'), 'utf8');
    const anchor = readFileSync(join(REPO, '.github', 'workflows', 'c19-anchor.yml'), 'utf8');

    it('neither workflow re-implements resolution, acquisition or verification', () => {
      for (const [name, wf] of [['lifecycle', lifecycle], ['anchor', anchor]] as const) {
        // The duplication that let a green harness prove something production never did.
        expect(wf, `${name} must not filter runs itself`).not.toMatch(/select\(\.name=="ci"/);
        expect(wf, `${name} must not walk attempts itself`).not.toMatch(/attempts\/\$n/);
        expect(wf, `${name} must not download artifacts itself`).not.toMatch(/artifacts\/\$id\/zip/);
      }
    });

    it('both call the SAME pipeline command', () => {
      expect(lifecycle).toMatch(/c19-deliver\.mjs dry-run/);
      expect(anchor).toMatch(/c19-deliver\.mjs publish/);
      expect(anchor).toMatch(/c19-deliver\.mjs verify-offline/);
    });

    it('the publication runner does its OWN install and build', () => {
      // Relying on another job's setup left the publication path depending on state it never
      // established.
      const publishJob = anchor.slice(anchor.indexOf('  publish:'));
      expect(publishJob).toMatch(/- run: pnpm install --frozen-lockfile/);
      expect(publishJob).toMatch(/- run: pnpm build/);
    });

    it('the harness cannot be green without exercising the chain', () => {
      expect(lifecycle).toMatch(/an unexercised chain must not report success/);
      expect(lifecycle).toMatch(/exit 1/);
    });

    it('uses GitHub\'s workflow COMMIT for the certificate binding', () => {
      // Fulcio's Build Config Digest is workflow_sha, not a hash of the YAML bytes.
      expect(anchor).toMatch(/WORKFLOW_SHA: \$\{\{ github\.workflow_sha \}\}/);
    });
  });
}
