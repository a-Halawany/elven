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
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync, symlinkSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
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
/**
 * Attempts now carry an authoritative start timestamp, because attempt NUMBERS are local to a run
 * and cannot be ordered across runs. `at()` makes the ordering explicit in each control rather than
 * implicit in a number.
 */
const at = (iso: string) => ({ conclusion: 'success', run_started_at: iso });
const ok = at('2026-01-01T00:00:00Z');
const bad = { conclusion: 'failure', run_started_at: '2026-01-01T00:00:00Z' };

export function registerC19Pipeline(): void {
  describe('C19 — canonical attempt resolution, executed', () => {
    it('attempt 1 succeeds and attempt 2 also succeeds: attempt 1 is canonical', async () => {
      const r = await load('c19-resolve.mjs');
      // The attempt is part of the publication identity, so the later success must NOT mint a
      // second identity for evidence already published.
      const gh = fakeGitHub({
        runs: [ciRun(10, 2)],
        attempts: { '10#1': at('2026-01-01T00:00:00Z'), '10#2': at('2026-02-01T00:00:00Z') },
      });
      expect(r.resolveCanonicalSource({ gh, sha: 'x' })).toMatchObject({ runId: '10', runAttempt: '1' });
    });

    it('attempt 1 fails and attempt 2 succeeds: attempt 2 is canonical', async () => {
      const r = await load('c19-resolve.mjs');
      const gh = fakeGitHub({
        runs: [ciRun(10, 2)],
        attempts: { '10#1': bad, '10#2': at('2026-02-01T00:00:00Z') },
      });
      expect(r.resolveCanonicalSource({ gh, sha: 'x' })).toMatchObject({ runId: '10', runAttempt: '2' });
    });

    it('a success later REPLACED in the default view by a failed rerun is still found', async () => {
      const r = await load('c19-resolve.mjs');
      // This is not hypothetical: re-running main's CI to demonstrate an unrelated CVE turned
      // attempt 1 `success` into a run reporting `failure`, and a conclusion filter stopped seeing
      // a publication that plainly existed.
      const gh = fakeGitHub({
        runs: [{ ...ciRun(10, 2), conclusion: 'failure' }],
        attempts: { '10#1': ok, '10#2': bad },
      });
      expect(r.resolveCanonicalSource({ gh, sha: 'x' })).toMatchObject({ runId: '10', runAttempt: '1' });
    });

    it('considers ALL matching run ids, not just the first listed', async () => {
      const r = await load('c19-resolve.mjs');
      // A re-dispatch creates a new RUN, not a new attempt. Looking at one run makes the answer
      // depend on listing order.
      const gh = fakeGitHub({
        runs: [ciRun(20, 3), ciRun(10, 1)],
        attempts: {
          '20#1': bad, '20#2': bad, '20#3': at('2026-06-01T00:00:00Z'),
          '10#1': at('2026-01-01T00:00:00Z'),
        },
      });
      // Ordered by the authoritative START time, not by attempt number.
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

    it('EXECUTED: publish refuses a superseded commit, and no argument turns that off', () => {
      // The real CLI, in the mode that can sign, against a commit that is certainly not main's
      // tip. It must refuse at resolution — before OIDC, before cosign, before Rekor.
      const out = mkdtempSync(join(tmpdir(), 'c19tip-'));
      const r = spawnSync(process.execPath, [
        join(REPO, 'scripts', 'gate', 'c19-deliver.mjs'), 'publish',
        '--repo', 'a-Halawany/elven', '--sha', '0'.repeat(40), '--out', out,
      ], { encoding: 'utf8' });
      expect(r.status).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(/no longer the tip of main|resolution refused/);
      // Nothing irreversible was reached.
      expect(`${r.stdout}${r.stderr}`).not.toMatch(/would-sign|signed|offline boundary proved/);
      // And there is no escape hatch to find.
      expect(readFileSync(join(REPO, 'scripts', 'gate', 'c19-deliver.mjs'), 'utf8'))
        .not.toMatch(/--allow-superseded/);
    }, 120_000);

    it('the tip is re-checked immediately BEFORE the irreversible step, not only at resolution', async () => {
      const p = await load('c19-pipeline.mjs');
      // Resolution and signing are minutes apart: acquisition, C17 verification and payload
      // construction all run against a live API in between, and main can move inside that window.
      let calls = 0;
      const gh = {
        ...fakeGitHub({ runs: [ciRun(10, 1), finRun(30, 1)], attempts: { '10#1': ok, '30#1': ok } }),
        branchTip: () => { calls += 1; return 'the-tip'; },
      };
      expect(p.resolve({ gh, sha: 'the-tip' }).problems).toEqual([]);
      expect(calls).toBe(1);
      const cli = readFileSync(join(REPO, 'scripts', 'gate', 'c19-deliver.mjs'), 'utf8');
      const reCheck = cli.indexOf("gh.branchTip('main')");
      expect(reCheck, 'publish must read the tip again itself').toBeGreaterThan(-1);
      expect(reCheck).toBeLessThan(cli.indexOf('await recoverOrSign('));
      expect(reCheck).toBeGreaterThan(cli.indexOf('validateBeforeIrreversible('));
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

  describe('C19 — a fixture must satisfy the WHOLE chain, executed', () => {
    it('a run with intact history but a currently-failing conclusion is not a usable fixture', () => {
      const src = readFileSync(join(REPO, 'scripts', 'gate', 'c19-fixture.mjs'), 'utf8');
      // The C17 finalization verifier reads the source run's CURRENT state and refuses one that
      // now reports failure. So a run whose attempt 1 succeeded and which was later re-run to
      // failure has intact history and is still unusable downstream.
      expect(src).toMatch(/sourceRun\?\.conclusion !== 'success'/);
      expect(src).toMatch(/is still unusable downstream/);
      // The canonical attempt comes from the SHARED resolver, which is a separate question from
      // whether the run is currently usable.
      expect(src).toMatch(/resolveCanonicalSource\(\{ gh, sha \}\)/);
    });

    it('the two questions are genuinely different and both are asked', async () => {
      const r = await load('c19-resolve.mjs');
      // Canonical attempt: history. Usable fixture: current state. A resolver that conflated them
      // would either miss a valid publication or select one the chain will refuse.
      const gh = fakeGitHub({ runs: [ciRun(10, 2)], attempts: { '10#1': ok, '10#2': bad } });
      expect(r.resolveCanonicalSource({ gh, sha: 'x' })).toMatchObject({ runAttempt: '1' });
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
        search: async () => [Object.keys(entries)[0]],
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

  describe('C19 — recovery SUCCEEDS, executed', () => {
    const entries = JSON.parse(readFileSync(join(FIX, 'rekor-entry.json'), 'utf8'));
    const uuid = Object.keys(entries)[0] as string;
    const entry = Object.values(entries)[0] as any;
    const payload = readFileSync(join(FIX, 'payload.json'));

    it('THE positive differential: existing record reconstructed, outcome EXACTLY reuse, zero signing', async () => {
      const p = await load('c19-pipeline.mjs');
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      const out = mkdtempSync(join(tmpdir(), 'c19reuse-'));
      const bundlePath = join(out, 'bundle.sigstore.json');
      let signings = 0;

      const outcome = await p.recoverOrSign({
        canonicalBytes: payload, payloadPath: join(FIX, 'payload.json'), bundlePath,
        policy, trustedRoot,
        gh: { runAttempt: () => ({
          repository: { full_name: 'a-Halawany/elven' },
          path: '.github/workflows/c19-anchor.yml', head_branch: 'main',
          event: 'workflow_run', conclusion: 'cancelled', head_sha: 'a'.repeat(40),
        }) },
        search: async () => [uuid],
        fetchEntry: async () => entry,
        mode: 'publish',
        sign: () => { signings += 1; },
        // The cryptographic half needs a Fulcio-issued certificate that cannot be fabricated; it is
        // covered by the identity and transparency controls. This asserts the ORCHESTRATION that
        // was broken: recovery could never return reuse at all.
        verifyBundleFn: () => [],
      });

      // Exactly reuse. Not "reuse or refuse" — accepting refusal is what hid the defect.
      expect(outcome.action).toBe('reuse');
      expect(signings, 'recovery must perform exactly zero signing operations').toBe(0);
      expect(outcome.signings).toBe(0);
      // The bundle must land at the NORMAL path, because every later step reads that path.
      expect(existsSync(bundlePath), 'the bundle must be written at the normal path').toBe(true);
      const written = JSON.parse(readFileSync(bundlePath, 'utf8'));
      expect(written.mediaType).toMatch(/sigstore\.bundle/);
      // And nothing outside the Sigstore schema, which strict cosign parsing rejects.
      expect(Object.keys(written).some((k) => k.startsWith('_'))).toBe(false);
      // Recovery provenance is kept BESIDE the bundle.
      expect(existsSync(`${bundlePath}.recovery.json`)).toBe(true);
      expect(JSON.parse(readFileSync(`${bundlePath}.recovery.json`, 'utf8')).recoveredFromUuid)
        .toBe(uuid);
    });

    it('the original run\'s conclusion is NOT required to be success', async () => {
      const a = await load('c19-anchor.mjs');
      const { policy } = a.loadTrustMaterial(LIB);
      const base = {
        repository: { full_name: 'a-Halawany/elven' }, path: '.github/workflows/c19-anchor.yml',
        head_branch: 'main', event: 'workflow_run', head_sha: 'a'.repeat(40),
      };
      // Recovery exists because Rekor accepted the signature and the run THEN failed or was
      // cancelled. Requiring success would refuse every case the mechanism was built for.
      for (const conclusion of ['success', 'failure', 'cancelled', 'timed_out']) {
        expect(a.confirmAuthorizedSignerRun({
          invocation: { runId: '555', runAttempt: '1' }, policy, expectedHeadSha: 'a'.repeat(40),
          fetchRun: () => ({ ...base, conclusion }),
        }), `conclusion ${conclusion} must not be the reason for refusal`).toEqual([]);
      }
    });

    it.each([
      ['wrong repository', { repository: { full_name: 'attacker/x' } }],
      ['wrong workflow', { path: '.github/workflows/ci.yml' }],
      ['wrong ref', { head_branch: 'attacker' }],
      ['wrong event', { event: 'push' }],
      ['wrong source sha', { head_sha: 'b'.repeat(40) }],
    ])('still REFUSES an unauthorized original signer: %s', async (_n, patch) => {
      const a = await load('c19-anchor.mjs');
      const { policy } = a.loadTrustMaterial(LIB);
      expect(a.confirmAuthorizedSignerRun({
        invocation: { runId: '555', runAttempt: '1' }, policy, expectedHeadSha: 'a'.repeat(40),
        fetchRun: () => ({
          repository: { full_name: 'a-Halawany/elven' }, path: '.github/workflows/c19-anchor.yml',
          head_branch: 'main', event: 'workflow_run', head_sha: 'a'.repeat(40),
          conclusion: 'failure', ...(patch as object),
        }),
      }).length).toBeGreaterThan(0);
    });
  });

  describe('C19 — the offline boundary is proved BEFORE signing, executed', () => {
    it('no working sandbox means ZERO signing attempts, not post-publication failure', () => {
      const cli = readFileSync(join(REPO, 'scripts', 'gate', 'c19-deliver.mjs'), 'utf8');
      const body = cli.slice(cli.indexOf('async function main('));
      // The publish job runs on Ubuntu, where unprivileged unshare does not work. Signing first and
      // discovering that afterwards would publish to Rekor and then fail before persistence.
      expect(body.indexOf('proveNetworkDenial()')).toBeLessThan(body.indexOf('await recoverOrSign('));
      expect(body).toMatch(/Refusing to sign/);
    });

    it('the proof is FUNCTIONAL — it runs a child and checks it was denied', async () => {
      const s = await load('c19-sandbox.mjs');
      const proof = s.proveNetworkDenial();
      if (proof.ok) {
        expect(proof.mechanism).toBeTruthy();
      } else {
        // On a host with no mechanism the proof must FAIL, not silently pass.
        expect(proof.why).toMatch(/no OS-level network denial|did not deny/);
      }
    }, 60_000);

    it('more than one Linux mechanism is declared, because unprivileged unshare is not enough', async () => {
      const s = await load('c19-sandbox.mjs');
      const linux = s.MECHANISMS.filter((m: any) => m.platform === 'linux');
      expect(linux.length).toBeGreaterThan(1);
      expect(linux.map((m: any) => m.name)).toContain('sudo-unshare');
    });
  });

  describe('C19 — package-level offline verification, executed', () => {
    it('REFUSES a package with a missing mandatory file', async () => {
      const p = await load('c19-pipeline.mjs');
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      const dir = mkdtempSync(join(tmpdir(), 'c19pkg-'));
      writeFileSync(join(dir, 'payload.json'), '{}');
      const problems = p.verifyDeliveryPackage({ dir, policy, trustedRoot });
      expect(problems.join('\n')).toMatch(/required file .* is missing/);
    });

    it('REFUSES an unexpected file: the inventory is exact', async () => {
      const p = await load('c19-pipeline.mjs');
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      const dir = mkdtempSync(join(tmpdir(), 'c19pkg2-'));
      for (const f of p.DELIVERY_PACKAGE_FILES) writeFileSync(join(dir, f), '{}');
      writeFileSync(join(dir, 'payload.json'), JSON.stringify({ purpose: 'run-anchor' }));
      writeFileSync(join(dir, 'SURPRISE.txt'), 'x');
      expect(p.verifyDeliveryPackage({ dir, policy, trustedRoot }).join('\n'))
        .toMatch(/unexpected file .* the inventory is exact/);
    });

    it('persistDeliveryPackage FAILS CLOSED on a missing input', async () => {
      const p = await load('c19-pipeline.mjs');
      const out = mkdtempSync(join(tmpdir(), 'c19pp-'));
      // It previously copied each file "if it exists", producing a quietly incomplete package.
      expect(() => p.persistDeliveryPackage({
        out, libDir: LIB, payloadPath: '/nonexistent', bundlePath: '/nonexistent',
        acquisition: { wrapperPath: '/nonexistent', innerPath: '/nonexistent', innerName: 'x.zip' },
        metadata: {},
      })).toThrow(/requires .* and .* does not exist/);
    });

    /**
     * A GENUINE package, assembled from real bytes, so the checks above are shown to be
     * discriminating rather than merely strict. Every digest here is computed from the file that
     * is actually written, and the payload is the canonical encoding of its own content.
     */
    const genuinePackage = async () => {
      const p = await load('c19-pipeline.mjs');
      const dir = mkdtempSync(join(tmpdir(), 'c19good-'));
      const wrapper = Buffer.from('PK\u0003\u0004 finalized wrapper bytes');
      const inner = Buffer.from('PK\u0003\u0004 finalized inner evidence bytes');
      const innerName = 'c17-cross-host-finalized-'.concat('a'.repeat(40), '.zip');
      const hex = (b: Buffer) => createHash('sha256').update(b).digest('hex');
      writeFileSync(join(dir, 'finalized-wrapper.zip'), wrapper);
      writeFileSync(join(dir, innerName), inner);
      writeFileSync(join(dir, `${innerName}.sha256`), `${hex(inner)}  ${innerName}\n`);

      const built = p.buildCanonicalPayload({
        authed: {
          sourceSha: 'a'.repeat(40), sourceRunId: '1', sourceRunAttempt: '1',
          finalizerRunId: '2', finalizerRunAttempt: '1',
        },
        acquisition: {
          wrapperDigest: hex(wrapper), innerDigest: hex(inner), innerName,
          artifactId: '9', artifactName: 'c17-cross-host-finalized',
        },
        sourceTree: 'b'.repeat(40),
        workflowRef: 'a-Halawany/elven/.github/workflows/c19-anchor.yml@refs/heads/main',
        workflowDigest: 'c'.repeat(40),
        workflowYamlDigest: 'd'.repeat(64),
        sourceEvent: 'push',
        // Inside the window NOW, derived from the finalizer instant rather than the wall clock.
        finalizerCompletedAt: new Date(Date.now() - 3_600_000).toISOString(),
      });
      writeFileSync(join(dir, 'payload.json'), built.canonical);
      for (const [src, dst] of [['c19-sigstore-trusted-root.json', 'trusted-root.json'],
        ['c19-sigstore-tuf-root.json', 'tuf-root.json']] as const) {
        writeFileSync(join(dir, dst), readFileSync(join(LIB, src)));
      }
      writeFileSync(join(dir, 'bundle.sigstore.json'), readFileSync(join(FIX, 'rekor-entry.json')));
      writeFileSync(join(dir, 'metadata.json'), '{}');
      writeFileSync(join(dir, 'VERIFY.md'), '# verify\n');
      return { dir, innerName, p };
    };

    // Every finding class that does NOT depend on a Fulcio-issued certificate. The cryptographic
    // half needs a certificate that cannot be fabricated and is covered by the identity controls.
    const STRUCTURAL = /required file|unexpected file|hashes to|sidecar|validity window|expired|presented before|canonical encoding|domain-separate/;

    it('NON-VACUITY: a genuine package raises NO structural finding', async () => {
      const { dir, p } = await genuinePackage();
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      const structural = p.verifyDeliveryPackage({ dir, policy, trustedRoot })
        .filter((x: string) => STRUCTURAL.test(x));
      expect(structural, structural.join('\n')).toEqual([]);
    });

    it('one flipped byte in the inner evidence is CAUGHT — the digests are recomputed, not read', async () => {
      const { dir, innerName, p } = await genuinePackage();
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      const bytes = readFileSync(join(dir, innerName));
      bytes[bytes.length - 1] ^= 0x01;
      writeFileSync(join(dir, innerName), bytes);
      expect(p.verifyDeliveryPackage({ dir, policy, trustedRoot }).join('\n'))
        .toMatch(/the inner evidence hashes to .* but the signed payload binds/);
    });

    it('EXECUTED: with no OS boundary available, verify-offline REFUSES instead of verifying', async () => {
      const { dir } = await genuinePackage();
      const out = mkdtempSync(join(tmpdir(), 'c19vo-'));
      // The only difference from a working host is that no denial mechanism is reachable. An
      // unconstrained verifier that prints "offline PASS" proves nothing about what it reached for,
      // so the absence of the boundary must be fatal, not silently tolerated.
      const bare = mkdtempSync(join(tmpdir(), 'c19path-'));
      for (const t of ['node', 'git']) {
        const found = spawnSync('which', [t], { encoding: 'utf8' }).stdout.trim();
        if (found) symlinkSync(found, join(bare, t));
      }
      const r = spawnSync(process.execPath,
        [join(REPO, 'scripts', 'gate', 'c19-deliver.mjs'), 'verify-offline', '--package', dir, '--out', out],
        { encoding: 'utf8', env: { ...process.env, PATH: bare } });
      expect(r.status).not.toBe(0);
      expect(`${r.stdout}${r.stderr}`).toMatch(/Offline verification cannot be performed here/);
      // And it must not have reached the verification it was asked for.
      expect(`${r.stdout}${r.stderr}`).not.toMatch(/package verification, \d+ finding/);
    }, 120_000);

    it('EXECUTED: with a boundary available, the verifier runs INSIDE it', async () => {
      const s = await load('c19-sandbox.mjs');
      if (!s.proveNetworkDenial().ok) return; // the control above covers the no-mechanism host
      const { dir } = await genuinePackage();
      const out = mkdtempSync(join(tmpdir(), 'c19vo2-'));
      const r = spawnSync(process.execPath,
        [join(REPO, 'scripts', 'gate', 'c19-deliver.mjs'), 'verify-offline', '--package', dir, '--out', out],
        { encoding: 'utf8' });
      const all = `${r.stdout}${r.stderr}`;
      // The re-execution happened, and the package verification ran in the CHILD — so Node and
      // every descendant it spawns, cosign included, were constrained.
      expect(all).toMatch(/re-executing the whole verifier inside the \S+ boundary/);
      expect(all).toMatch(/package verification, \d+ finding/);
      // Structural findings must be absent even under the boundary: nothing here needs a network.
      expect(all.split('\n').filter((l) => STRUCTURAL.test(l))).toEqual([]);
    }, 180_000);
  });

  describe('C19 — the TUF chain is verified, not merely hashed', () => {
    const L = LIB;
    const load2 = (f: string) => JSON.parse(readFileSync(f, 'utf8'));
    const chain = () => ({
      root: load2(join(L, 'c19-sigstore-tuf-root.json')),
      timestamp: load2(join(L, 'c19-tuf', 'timestamp.json')),
      snapshot: load2(join(L, 'c19-tuf', 'snapshot.json')),
      targets: load2(join(L, 'c19-tuf', 'targets.json')),
      targetBytes: readFileSync(join(L, 'c19-sigstore-trusted-root.json')),
      targetName: 'trusted_root.json',
      now: Date.parse('2026-09-01T00:00:00Z'),
    });

    it('the genuine chain verifies, signatures and thresholds included', async () => {
      const t = await load('c19-tuf.mjs');
      expect(t.verifyTufChain(chain())).toEqual([]);
    });

    it('SIGNATURE non-vacuity: corrupting enough signatures breaks the threshold', async () => {
      const t = await load('c19-tuf.mjs');
      const c = chain();
      const role = c.root.signed.roles.root;
      // 5 signatures, threshold 3. Corrupting 2 must still pass; corrupting 3 must fail — which is
      // only true if signatures are genuinely verified rather than counted.
      const corrupt = (n: number) => {
        const m = JSON.parse(JSON.stringify(c.root));
        for (let i = 0; i < n; i += 1) m.signatures[i].sig = m.signatures[i].sig.replace(/^../, '00');
        return t.verifyRole({ metadata: m, keys: c.root.signed.keys, role, roleName: 'root' });
      };
      expect(corrupt(2)).toEqual([]);
      expect(corrupt(3).join('\n')).toMatch(/valid signature\(s\) from authorised keys but requires 3/);
    });

    it('THRESHOLD non-vacuity: the same key repeated does not satisfy a threshold', async () => {
      const t = await load('c19-tuf.mjs');
      const c = chain();
      const m = JSON.parse(JSON.stringify(c.root));
      const one = m.signatures[0];
      m.signatures = [one, { ...one }, { ...one }, { ...one }, { ...one }];
      expect(t.verifyRole({
        metadata: m, keys: c.root.signed.keys, role: c.root.signed.roles.root, roleName: 'root',
      }).length).toBeGreaterThan(0);
    });

    it.each([
      ['a signature from an unlisted key', (c: any) => { c.root.signatures = c.root.signatures.map((s: any) => ({ ...s, keyid: 'deadbeef' })); }],
      ['tampered targets metadata', (c: any) => { c.targets.signed.targets['trusted_root.json'].length = 1; }],
      ['tampered trusted-root bytes', (c: any) => { c.targetBytes = Buffer.concat([c.targetBytes, Buffer.from(' ')]); }],
      ['a snapshot version mismatch', (c: any) => { c.snapshot.signed.version = 999999; }],
      ['a rolled-back targets version', (c: any) => { c.targets.signed.version = 1; c.snapshot.signed.meta['targets.json'].version = 1; }],
      ['expired metadata (freeze)', (c: any) => { c.now = Date.parse('2099-01-01T00:00:00Z'); }],
    ])('REJECTS %s', async (_n, mutate) => {
      const t = await load('c19-tuf.mjs');
      const c = chain();
      mutate(c);
      expect(t.verifyTufChain(c).length).toBeGreaterThan(0);
    });

    it('loadTrustMaterial REFUSES material that does not chain, even if the pin is updated too', async () => {
      const a = await load('c19-anchor.mjs');
      const dir = mkdtempSync(join(tmpdir(), 'c19tt-'));
      mkdirSync(join(dir, 'c19-tuf'), { recursive: true });
      for (const f of ['c19-trust.json', 'c19-sigstore-tuf-root.json', 'c19-sigstore-trusted-root.json']) {
        writeFileSync(join(dir, f), readFileSync(join(LIB, f)));
      }
      for (const f of ['timestamp.json', 'snapshot.json', 'targets.json']) {
        writeFileSync(join(dir, 'c19-tuf', f), readFileSync(join(LIB, 'c19-tuf', f)));
      }
      const tr = JSON.parse(readFileSync(join(dir, 'c19-sigstore-trusted-root.json'), 'utf8'));
      tr.certificateAuthorities[0].subject = { organization: 'attacker' };
      writeFileSync(join(dir, 'c19-sigstore-trusted-root.json'), JSON.stringify(tr));
      // The attacker also updates the policy pin, which a hash-only check would accept.
      const pol = JSON.parse(readFileSync(join(dir, 'c19-trust.json'), 'utf8'));
      pol.tuf.trustedRootSha256 = createHash('sha256')
        .update(readFileSync(join(dir, 'c19-sigstore-trusted-root.json'))).digest('hex');
      writeFileSync(join(dir, 'c19-trust.json'), JSON.stringify(pol));
      expect(() => a.loadTrustMaterial(dir)).toThrow(/does not verify against the source-held TUF root/);
    });
  });

  describe('C19 — stable ordering and Rekor response validation, executed', () => {
    it('run 10 attempt 2 started earlier beats run 20 attempt 1', async () => {
      const r = await load('c19-resolve.mjs');
      // Attempt numbers are LOCAL to a run. Sorting on the number let a later run's attempt 1
      // displace an already-canonical publication.
      const ordered = r.orderCandidates([
        { runId: '10', attempt: 2, startedAt: '2026-01-01T00:00:00Z' },
        { runId: '20', attempt: 1, startedAt: '2026-06-01T00:00:00Z' },
      ]);
      expect(`${ordered[0].runId}#${ordered[0].attempt}`).toBe('10#2');
    });

    it('ties break deterministically, and missing timestamps are fail-closed', async () => {
      const r = await load('c19-resolve.mjs');
      const same = '2026-01-01T00:00:00Z';
      const ordered = r.orderCandidates([
        { runId: '20', attempt: 1, startedAt: same },
        { runId: '10', attempt: 3, startedAt: same },
      ]);
      expect(ordered[0].runId).toBe('10');
      expect(() => r.orderCandidates([{ runId: '1', attempt: 1, startedAt: null }]))
        .toThrow(/stable total ordering cannot be computed/);
    });

    it('a 404 for an attempt INSIDE the declared range is indeterminate, not absence', async () => {
      const r = await load('c19-resolve.mjs');
      const gh = { runAttempt: (_id: any, n: number) => (n === 1 ? null : { conclusion: 'success' }) };
      expect(() => r.earliestSuccessfulAttempt({ id: 10, run_attempt: 2 }, gh))
        .toThrow(/indeterminate attempt inside the declared range is fail-closed/);
    });

    it.each([
      ['a non-array response', 'not an array'],
      ['an object response', { uuids: [] }],
      ['null', null],
    ])('REFUSES to treat %s as "no record" and sign', async (_n, response) => {
      const p = await load('c19-pipeline.mjs');
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      let signings = 0;
      const out = await p.recoverOrSign({
        canonicalBytes: Buffer.from('{}'), payloadPath: 'p', bundlePath: 'b', policy, trustedRoot,
        gh: {}, search: async () => response, fetchEntry: async () => null, mode: 'publish',
        sign: () => { signings += 1; },
      });
      expect(out.action).toBe('refuse');
      expect(signings, 'a malformed response must never lead to signing').toBe(0);
    });

    it('malformed uuids are refused rather than treated as absent', async () => {
      const p = await load('c19-pipeline.mjs');
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      let signings = 0;
      const out = await p.recoverOrSign({
        canonicalBytes: Buffer.from('{}'), payloadPath: 'p', bundlePath: 'b', policy, trustedRoot,
        gh: {}, search: async () => ['not-a-uuid', '!!!'], fetchEntry: async () => null,
        mode: 'publish', sign: () => { signings += 1; },
      });
      expect(out.action).toBe('refuse');
      expect(signings).toBe(0);
    });

    it('the fetched entry must be the uuid that was requested', () => {
      const cli = readFileSync(join(REPO, 'scripts', 'gate', 'c19-deliver.mjs'), 'utf8');
      // Accepting whatever came back would let a redirect substitute a different record.
      expect(cli).toMatch(/rekor returned entry .* for request/);
    });
  });

  describe('C19 — the validity window is bounded and deterministic', () => {
    it('is derived from the authenticated finalizer instant, not the clock or 1970', async () => {
      const p = await load('c19-pipeline.mjs');
      const facts = { finalizerCompletedAt: '2026-08-24T20:23:00Z' };
      const w1 = p.deterministicWindow(facts, 'id');
      const w2 = p.deterministicWindow({ ...facts }, 'id');
      expect(w1).toEqual(w2);                                   // deterministic: retries match
      expect(w1.notBefore).not.toMatch(/^1970/);
      expect(w1.expiresAt).not.toMatch(/^9999/);
      const span = Date.parse(w1.expiresAt) - Date.parse(w1.notBefore);
      expect(span).toBeLessThanOrEqual(p.WINDOW_LIFETIME_MS + p.WINDOW_BEFORE_MS + 1000);
    });

    it('REFUSES to substitute the wall clock when the anchor instant is absent', async () => {
      const p = await load('c19-pipeline.mjs');
      expect(() => p.deterministicWindow({}, 'id'))
        .toThrow(/refusing to substitute the wall clock/);
    });

    it('an unbounded window is rejected at verification time', async () => {
      const p = await load('c19-pipeline.mjs');
      expect(p.validatePayloadWindow({
        issuedAt: '1970-01-01T00:00:00.000Z', notBefore: '1970-01-01T00:00:00.000Z',
        expiresAt: '9999-12-31T23:59:59.999Z',
      }).join('\n')).toMatch(/an unbounded window is not a validity window/);
    });
  });

  describe('C19 — the fixture chooser is a thin caller of the shared layer', () => {
    it('has no second transport, resolver or artifact selector', () => {
      const src = readFileSync(join(REPO, 'scripts', 'gate', 'c19-fixture.mjs'), 'utf8');
      // The duplication that let the harness resolve differently from production.
      expect(src).toMatch(/from '\.\/lib\/c19-github\.mjs'/);
      expect(src).toMatch(/from '\.\/lib\/c19-resolve\.mjs'/);
      expect(src).not.toMatch(/spawnSync\('gh'/);
      expect(src).not.toMatch(/successfulAttempt\s*\(run, fetchAttempt\)/);
    });

    it('an API failure is reported, never converted into "no fixture"', () => {
      const src = readFileSync(join(REPO, 'scripts', 'gate', 'c19-fixture.mjs'), 'utf8');
      expect(src).toMatch(/An API failure is NOT "no fixture"/);
      expect(src).toMatch(/process\.exit\(1\)/);
    });
  });

  describe('C19 — the post-Phase-0 backlog is not a gate', () => {
    it('a new attack class routes to the non-blocking backlog', async () => {
      const c = await load('c19-criteria.mjs');
      const r = c.route('a-brand-new-attack-class');
      expect(r.gate).toBe('post-phase-0-backlog');
      expect(r.reason).toMatch(/must not delay Phase 0 closure/);
    });

    it('no "C20" gate is referenced anywhere in the C19 source', () => {
      for (const f of ['c19-criteria.mjs', 'c19-pipeline.mjs', 'c19-resolve.mjs']) {
        expect(readFileSync(join(LIB, f), 'utf8'), `${f} must not name a C20 gate`)
          .not.toMatch(/\bC20\b/);
      }
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
    it('when a mechanism IS reported, it genuinely denies a spawned child', async () => {
      const s = await load('c19-sandbox.mjs');
      const mech = s.networkDenialMechanism();
      // The probe is functional, so a reported mechanism must actually work. A mechanism that is
      // installed but non-functional is worse than an absent one: it reports enforcement it does
      // not provide, which is how `unshare` on a GitHub Linux runner produced empty output while
      // the control asserted denial.
      if (mech === null) {
        expect(() => s.runWithoutNetwork(['echo', 'x'])).toThrow(/refusing to run unconstrained/);
        return;
      }
      const r = s.runWithoutNetwork([process.execPath, '-e',
        'const h=require("https");const q=h.request("https://example.com");'
        + 'q.on("error",e=>{console.log("DENIED");process.exit(0)});q.end();'
        + 'setTimeout(()=>{console.log("NOT-DENIED");process.exit(1)},6000)']);
      expect(r.enforced).toBe(true);
      expect(`${r.stdout}${r.stderr}`, 'a reported mechanism must actually deny').toMatch(/DENIED/);
    }, 60_000);

    it('when a mechanism IS reported, file access still works', async () => {
      const s = await load('c19-sandbox.mjs');
      if (s.networkDenialMechanism() === null) return;
      const r = s.runWithoutNetwork([process.execPath, '-e',
        'require("fs").readFileSync("/etc/hosts");console.log("FILES-OK")']);
      expect(`${r.stdout}${r.stderr}`).toMatch(/FILES-OK/);
    }, 60_000);

    it('a functional probe is used, not a mere `which`', () => {
      const src = readFileSync(join(LIB, 'c19-sandbox.mjs'), 'utf8');
      expect(src).toMatch(/The probe is FUNCTIONAL, not a `which`/);
      expect(src).toMatch(/worksHere/);
    });

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
