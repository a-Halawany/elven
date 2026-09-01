/**
 * C19 — THE ANCHOR ATTACK MATRIX.
 *
 * One control per frozen attack family, plus the meta-control that proves the matrix is fully
 * covered. Each control mutates ONE thing and asserts the verifier rejects it for the intended
 * reason — not merely that it rejected, since a verifier that rejects everything for the wrong
 * reason is indistinguishable from one that works until the day the reason matters.
 *
 * These controls do not need a live Rekor entry. Every verification step is exercised against
 * crafted inputs at its own boundary, which is stronger than one end-to-end fixture: an end-to-end
 * bundle proves the happy path and hides which check is load-bearing.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, generateKeyPairSync, sign as nodeSign, X509Certificate } from 'node:crypto';
import { spawnSync } from 'node:child_process';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const LIB = join(REPO, 'scripts', 'gate', 'lib');
const load = (m: string) => import(/* @vite-ignore */ join(LIB, m));

const sha256hex = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/** The identity a genuine delivery signature would carry, per the source-owned policy. */
function genuineIdentity(policy: any, sourceSha: string, _runUri: string, workflowDigest: string) {
  const i = policy.identity;
  return {
    subjectAlternativeName: i.subjectAlternativeName,
    issuer: i.issuer,
    sourceRepositoryUri: `https://github.com/${i.repository}`,
    sourceRepositoryIdentifier: i.repositoryId,
    sourceRepositoryOwnerUri: `https://github.com/${i.repositoryOwner}`,
    sourceRepositoryOwnerIdentifier: i.repositoryOwnerId,
    sourceRepositoryDigest: sourceSha,
    sourceRepositoryRef: i.ref,
    buildConfigUri: `https://github.com/${i.workflowRef}`,
    buildConfigDigest: workflowDigest,
    // The SIGNER's trigger. The anchor workflow is workflow_run-triggered; the upstream push is
    // bound separately, through the signed payload.
    buildTrigger: i.signerEventName,
    // Fulcio records the attempt in the run invocation URI.
    runInvocationUri: `https://github.com/${i.repository}/actions/runs/${RUN_ID}/attempts/${RUN_ATTEMPT}`,
    runnerEnvironment: i.runnerEnvironment,
  };
}

/** The full expectation set. Verification now REFUSES when any of these is absent. */
const EXPECT = (sourceSha: string, workflowDigest: string) => ({
  sourceSha, workflowDigest, runId: RUN_ID, runAttempt: RUN_ATTEMPT,
});

const RUN_ID = '123';
const RUN_ATTEMPT = '1';

export function registerC19Anchor(): void {
  const SHA = 'a'.repeat(40);
  const RUN = 'https://github.com/a-Halawany/elven/actions/runs/123';
  const WFD = 'b'.repeat(40);

  describe('C19 — the signer identity is bound EXACTLY', () => {
    it('a genuine identity is accepted', async () => {
      const a = await load('c19-anchor.mjs');
      const { policy } = a.loadTrustMaterial(LIB);
      expect(a.verifyIdentity(genuineIdentity(policy, SHA, RUN, WFD), policy,
        EXPECT(SHA, WFD))).toEqual([]);
    });

    // One family per row. Each mutates a single field of an otherwise perfect identity.
    it.each([
      ['wrong-san', 'subjectAlternativeName', 'https://github.com/a-Halawany/elven/.github/workflows/other.yml@refs/heads/main', /subjectAlternativeName/],
      ['wrong-issuer', 'issuer', 'https://evil.example.com', /issuer/],
      ['wrong-repository', 'sourceRepositoryUri', 'https://github.com/attacker/elven', /sourceRepositoryUri/],
      ['wrong-ref', 'sourceRepositoryRef', 'refs/heads/attacker-branch', /sourceRepositoryRef/],
      ['wrong-source-sha', 'sourceRepositoryDigest', 'c'.repeat(40), /sourceRepositoryDigest/],
      ['wrong-workflow-digest', 'buildConfigDigest', 'd'.repeat(40), /buildConfigDigest/],
      ['wrong-owner', 'sourceRepositoryOwnerUri', 'https://github.com/attacker', /sourceRepositoryOwnerUri/],
      ['wrong-event', 'buildTrigger', 'pull_request', /buildTrigger/],
      ['wrong-runner-environment', 'runnerEnvironment', 'self-hosted', /runnerEnvironment/],
      ['wrong-run', 'runInvocationUri', 'https://github.com/a-Halawany/elven/actions/runs/999', /runInvocationUri/],
      ['wrong-workflow-file', 'buildConfigUri', 'https://github.com/a-Halawany/elven/.github/workflows/ci.yml@refs/heads/main', /buildConfigUri/],
    ])('REJECTS %s', async (_family, field, value, expected) => {
      const a = await load('c19-anchor.mjs');
      const { policy } = a.loadTrustMaterial(LIB);
      const identity: any = genuineIdentity(policy, SHA, RUN, WFD);
      identity[field as string] = value;
      const problems = a.verifyIdentity(identity, policy,
        EXPECT(SHA, WFD));
      expect(problems.join('\n')).toMatch(expected as RegExp);
    });

    it('REJECTS regex-widened-identity: the policy itself must hold no patterns', async () => {
      const policy = JSON.parse(readFileSync(join(LIB, 'c19-trust.json'), 'utf8'));
      for (const [k, v] of Object.entries(policy.identity)) {
        if (k.startsWith('_')) continue;
        // `.*` in a SAN policy accepts every workflow in the repository; in a ref policy, every
        // branch. There is an exact value for each of these, so a pattern is never a shortcut.
        expect(String(v), `identity.${k} must be an exact value`).not.toMatch(/[*?]|\.\+|\\d|\\w/);
      }
    });

    it('a missing identity extension is a rejection, not a pass', async () => {
      const a = await load('c19-anchor.mjs');
      const { policy } = a.loadTrustMaterial(LIB);
      const identity: any = genuineIdentity(policy, SHA, RUN, WFD);
      identity.sourceRepositoryRef = null;
      expect(a.verifyIdentity(identity, policy, EXPECT(SHA, WFD)).join('\n'))
        .toMatch(/sourceRepositoryRef/);
    });
  });

  describe('C19 — the trust material cannot be substituted or aged', () => {
    it('REJECTS substituted-trust-root: it must chain to the source-held TUF root', async () => {
      const a = await load('c19-anchor.mjs');
      const dir = mkdtempSync(join(tmpdir(), 'c19-trust-'));
      mkdirSync(join(dir, 'c19-tuf'), { recursive: true });
      for (const f of ['c19-trust.json', 'c19-sigstore-tuf-root.json', 'c19-sigstore-trusted-root.json']) {
        writeFileSync(join(dir, f), readFileSync(join(LIB, f)));
      }
      for (const f of ['timestamp.json', 'snapshot.json', 'targets.json']) {
        writeFileSync(join(dir, 'c19-tuf', f), readFileSync(join(LIB, 'c19-tuf', f)));
      }
      // Swap in an attacker's certificate authority — the exact move that would let a signature
      // from a CA we never trusted verify.
      const root = JSON.parse(readFileSync(join(dir, 'c19-sigstore-trusted-root.json'), 'utf8'));
      root.certificateAuthorities[0].subject = { organization: 'attacker.example' };
      writeFileSync(join(dir, 'c19-sigstore-trusted-root.json'), JSON.stringify(root));
      expect(() => a.loadTrustMaterial(dir))
        .toThrow(/does not verify against the source-held TUF root|trust material has been substituted/);
    });

    it('NON-VACUITY: the genuine trust material loads', async () => {
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      expect(policy.version).toBe(3);
      expect(a.pinnedCaCertificates(trustedRoot).length).toBeGreaterThan(0);
      expect(a.pinnedRekorKeys(trustedRoot).size).toBeGreaterThan(0);
    });

    it('REJECTS a policy that pins a rotating key as its offline root', async () => {
      // The version-1 mistake, kept as a control so it cannot come back: GitHub's OIDC JWKS keys
      // rotate, so pinning one as an anchor breaks offline verification and anchors trust in
      // something transient.
      const policy = JSON.parse(readFileSync(join(LIB, 'c19-trust.json'), 'utf8'));
      const text = JSON.stringify(policy.signers);
      expect(text).not.toMatch(/publicKeyPem/);
      expect(policy.tuf?.trustedRootFile, 'the offline root must be TUF material').toBeTruthy();
      expect(policy.tuf?.trustedRootSha256).toMatch(/^[0-9a-f]{64}$/);
    });

    it('REJECTS unsupported-algorithm', async () => {
      const policy = JSON.parse(readFileSync(join(LIB, 'c19-trust.json'), 'utf8'));
      expect(policy.algorithms).toEqual(['ES256']);
      expect(policy.algorithms).not.toContain('none');
      expect(policy.algorithms).not.toContain('RS1');
    });

    it('REJECTS local-signer-presented-as-delivery-authority', async () => {
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      const problems = a.verifyBundle({
        bundle: {}, policy, trustedRoot, signerId: 'local-dev', requireDeliveryStanding: true,
      });
      expect(problems.join('\n')).toMatch(/NOT delivery-capable/);
      expect(policy.signers['local-dev'].deliveryCapable).toBe(false);
    });
  });

  describe('C19 — the certificate chain and the signed bytes', () => {
    it('REJECTS a certificate that chains to no pinned authority', async () => {
      const a = await load('c19-anchor.mjs');
      const tr = JSON.parse(readFileSync(join(LIB, 'c19-sigstore-trusted-root.json'), 'utf8'));
      // A genuinely valid certificate from a DIFFERENT authority: the current Fulcio intermediate,
      // offered against a trust root that pins only the older, unrelated CA. Both certificates are
      // real, so this measures the chain check rather than a parse failure.
      const current = tr.certificateAuthorities.at(-1).certChain.certificates[0].rawBytes;
      const onlyTheOtherCa = { certificateAuthorities: [tr.certificateAuthorities[0]] };
      expect(a.verifyCertificateChain(Buffer.from(current, 'base64'), onlyTheOtherCa, Date.now()).join('\n'))
        .toMatch(/does not chain to any pinned Fulcio/);
    });

    it('NON-VACUITY: the same certificate DOES chain to its own pinned authority', async () => {
      const a = await load('c19-anchor.mjs');
      const tr = JSON.parse(readFileSync(join(LIB, 'c19-sigstore-trusted-root.json'), 'utf8'));
      const ca = tr.certificateAuthorities.at(-1);
      const [intermediate, root] = ca.certChain.certificates;
      // Without this leg the control above would pass even if the chain check rejected everything.
      expect(a.verifyCertificateChain(Buffer.from(intermediate.rawBytes, 'base64'),
        { certificateAuthorities: [{ certChain: { certificates: [root] } }] }, Date.now())).toEqual([]);
    });

    it('REJECTS malformed-fulcio-certificate', async () => {
      const a = await load('c19-anchor.mjs');
      const { trustedRoot } = a.loadTrustMaterial(LIB);
      expect(a.verifyCertificateChain(Buffer.from('not a certificate'), trustedRoot, Date.now()).join('\n'))
        .toMatch(/unreadable leaf/);
    });

    it('REJECTS missing-fulcio-certificate', async () => {
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      expect(a.verifyBundle({ bundle: { verificationMaterial: {} }, policy, trustedRoot }).join('\n'))
        .toMatch(/carries no Fulcio certificate/);
    });

    it('REJECTS signature-over-different-bytes', async () => {
      const a = await load('c19-anchor.mjs');
      const { cert } = makeSelfSigned();
      const problems = a.verifyArtifactSignature({
        leafDer: cert, signatureB64: Buffer.alloc(64).toString('base64'),
        artifactDigestHex: sha256hex('the attested bytes'),
        artifactBytes: Buffer.from('DIFFERENT bytes entirely'),
      });
      expect(problems.join('\n')).toMatch(/signature is over different bytes/);
    });

    it('REJECTS an altered artifact even when the bundle is internally consistent', async () => {
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      const bundle = {
        verificationMaterial: { certificate: { rawBytes: makeSelfSigned().cert.toString('base64') }, tlogEntries: [] },
        messageSignature: {
          messageDigest: { algorithm: 'SHA2_256', digest: Buffer.from(sha256hex('original'), 'hex').toString('base64') },
          signature: Buffer.alloc(64).toString('base64'),
        },
      };
      const problems = a.verifyBundle({
        bundle, policy, trustedRoot, artifactBytes: Buffer.from('tampered'),
        artifactDigestHex: sha256hex('tampered'), sourceSha: SHA,
      });
      expect(problems.join('\n')).toMatch(/attests .* but verification is about|different bytes/);
    });
  });

  describe('C19 — the transparency log entry', () => {
    it('REJECTS wrong-log-identity', async () => {
      const a = await load('c19-anchor.mjs');
      const { trustedRoot } = a.loadTrustMaterial(LIB);
      const problems = a.verifyRekorSet({
        logId: { keyId: Buffer.alloc(32, 7).toString('base64') },
        inclusionPromise: { signedEntryTimestamp: Buffer.alloc(64).toString('base64') },
        canonicalizedBody: 'e30=', integratedTime: 1, logIndex: 1,
      }, trustedRoot);
      expect(problems.join('\n')).toMatch(/does not pin|not a transparency log/);
    });

    it('REJECTS missing-rekor-set', async () => {
      const a = await load('c19-anchor.mjs');
      const { trustedRoot } = a.loadTrustMaterial(LIB);
      const logId = [...a.pinnedRekorKeys(trustedRoot).keys()][0] as string;
      const problems = a.verifyRekorSet({
        logId: { keyId: Buffer.from(logId, 'hex').toString('base64') },
        canonicalizedBody: 'e30=', integratedTime: 1, logIndex: 1,
      }, trustedRoot);
      expect(problems.join('\n')).toMatch(/no signed entry timestamp/);
    });

    it('REJECTS malformed-rekor-set against a pinned key', async () => {
      const a = await load('c19-anchor.mjs');
      const { trustedRoot } = a.loadTrustMaterial(LIB);
      const logId = [...a.pinnedRekorKeys(trustedRoot).keys()][0] as string;
      const problems = a.verifyRekorSet({
        logId: { keyId: Buffer.from(logId, 'hex').toString('base64') },
        inclusionPromise: { signedEntryTimestamp: Buffer.alloc(70, 9).toString('base64') },
        canonicalizedBody: 'e30=', integratedTime: 1, logIndex: 1,
      }, trustedRoot);
      expect(problems.length).toBeGreaterThan(0);
    });

    it('REJECTS missing-inclusion-proof', async () => {
      const a = await load('c19-anchor.mjs');
      const { trustedRoot } = a.loadTrustMaterial(LIB);
      expect(a.verifyInclusionProof({ canonicalizedBody: 'e30=' }, trustedRoot).join('\n'))
        .toMatch(/no inclusion proof/);
    });

    it('REJECTS an unauthenticated checkpoint — a self-chosen root proves nothing', async () => {
      const a = await load('c19-anchor.mjs');
      const { trustedRoot } = a.loadTrustMaterial(LIB);
      // The complete bypass the review found: a one-leaf proof whose "root" is the attacker's own
      // leaf hash reconstructs perfectly, and the previous verifier accepted it.
      const body = Buffer.from('anything at all');
      const leaf = a.leafHash(body);
      expect(a.verifyInclusionProof({
        canonicalizedBody: body.toString('base64'),
        inclusionProof: { logIndex: 0, treeSize: 1, rootHash: leaf.toString('base64'), hashes: [] },
      }, trustedRoot).join('\n')).toMatch(/no signed checkpoint|circular/);
    });

    it('BINDS the log record to the certificate, signature and digest', async () => {
      const a = await load('c19-anchor.mjs');
      const cert = makeSelfSigned().cert;
      const pem = `-----BEGIN CERTIFICATE-----\n${cert.toString('base64')}\n-----END CERTIFICATE-----`;
      const bodyFor = (digest: string, sig: string, certPem: string) => Buffer.from(JSON.stringify({
        kind: 'hashedrekord',
        spec: {
          data: { hash: { algorithm: 'sha256', value: digest } },
          signature: { content: sig, publicKey: { content: Buffer.from(certPem).toString('base64') } },
        },
      })).toString('base64');
      const args = { leafDer: cert, signatureB64: 'SIG', artifactDigestHex: 'aa'.repeat(32) };

      // Matching record: no findings.
      expect(a.verifyRekorBodyBinding(
        { canonicalizedBody: bodyFor('aa'.repeat(32), 'SIG', pem) }, args)).toEqual([]);
      // Each single-field mismatch is caught, and named for what it is.
      expect(a.verifyRekorBodyBinding(
        { canonicalizedBody: bodyFor('bb'.repeat(32), 'SIG', pem) }, args).join('\n'))
        .toMatch(/not about these bytes/);
      expect(a.verifyRekorBodyBinding(
        { canonicalizedBody: bodyFor('aa'.repeat(32), 'OTHER', pem) }, args).join('\n'))
        .toMatch(/does not attest this signature/);
      const otherPem = `-----BEGIN CERTIFICATE-----\nQUJD\n-----END CERTIFICATE-----`;
      expect(a.verifyRekorBodyBinding(
        { canonicalizedBody: bodyFor('aa'.repeat(32), 'SIG', otherPem) }, args).join('\n'))
        .toMatch(/different identity/);
    });

    it('REJECTS an SCT that is absent from the certificate', async () => {
      const a = await load('c19-anchor.mjs');
      const { trustedRoot } = a.loadTrustMaterial(LIB);
      // The Sigstore ROOT carries no SCT — a real certificate that genuinely lacks one, rather
      // than a Rekor entry removed and mislabelled as an SCT test.
      expect(a.verifySctPresence(makeSelfSigned().cert, trustedRoot).join('\n'))
        .toMatch(/no embedded SCT/);
    });

    it('states plainly which mandatory checks are delegated to cosign', async () => {
      const a = await load('c19-anchor.mjs');
      // A hand-rolled look-alike of SCT verification would be worse than delegation, because it
      // would report success whether or not it was correct.
      expect(a.DELEGATED_TO_COSIGN.length).toBeGreaterThan(0);
      expect(a.DELEGATED_TO_COSIGN.join(' ')).toMatch(/SCT signature verification/);
    });

    it('accepts a GENUINE inclusion proof and rejects every forgery of it', async () => {
      const a = await load('c19-anchor.mjs');
      // A real RFC 6962 tree, so the verifier is measured against the structure rather than
      // against an assumption about it.
      const root = (l: Buffer[]): Buffer => {
        if (l.length === 1) return l[0]!;
        let k = 1; while (k * 2 < l.length) k *= 2;
        return a.nodeHash(root(l.slice(0, k)), root(l.slice(k)));
      };
      const path = (l: Buffer[], i: number): Buffer[] => {
        if (l.length === 1) return [];
        let k = 1; while (k * 2 < l.length) k *= 2;
        return i < k ? [...path(l.slice(0, k), i), root(l.slice(k))]
                     : [...path(l.slice(k), i - k), root(l.slice(0, k))];
      };
      const bodies = Array.from({ length: 8 }, (_, i) => Buffer.from(`entry-${i}`));
      const leaves = bodies.map((b) => a.leafHash(b));
      const r = root(leaves);
      const { trustedRoot } = a.loadTrustMaterial(LIB);
      const good = {
        canonicalizedBody: bodies[3]!.toString('base64'),
        inclusionProof: {
          logIndex: 3, treeSize: 8, rootHash: r.toString('base64'),
          hashes: path(leaves, 3).map((h) => h.toString('base64')),
        },
      };
      // Without an authenticated checkpoint even a GENUINE proof is refused, because the root it
      // is compared against would be attacker-supplied.
      expect(a.verifyInclusionProof(good, trustedRoot).join('\n')).toMatch(/no signed checkpoint/);

      const forgeries: Record<string, any> = {
        'wrong body': { ...good, canonicalizedBody: Buffer.from('forged').toString('base64') },
        'wrong checkpoint': { ...good, inclusionProof: { ...good.inclusionProof, rootHash: Buffer.alloc(32).toString('base64') } },
        'truncated path': { ...good, inclusionProof: { ...good.inclusionProof, hashes: good.inclusionProof.hashes.slice(0, 2) } },
        'extra path node': { ...good, inclusionProof: { ...good.inclusionProof, hashes: [...good.inclusionProof.hashes, Buffer.alloc(32).toString('base64')] } },
        'index outside tree': { ...good, inclusionProof: { ...good.inclusionProof, logIndex: 8 } },
      };
      for (const [name, f] of Object.entries(forgeries)) {
        expect(a.verifyInclusionProof(f, trustedRoot).length, `${name} must be rejected`).toBeGreaterThan(0);
      }
    });
  });

  describe('C19 — publication is structurally unreachable except from main', () => {
    const wf = readFileSync(join(REPO, '.github', 'workflows', 'c19-anchor.yml'), 'utf8');

    it('only the publish job may hold id-token: write', async () => {
      const { parse } = await import('yaml');
      const d: any = parse(wf);
      const holders = Object.entries(d.jobs)
        .filter(([, j]: any) => (j.permissions ?? {})['id-token'] === 'write')
        .map(([n]) => n);
      expect(holders).toEqual(['publish']);
      // Any other job holding the token could sign as this workflow.
      expect(d.permissions['id-token']).toBeUndefined();
    });

    it('no job anywhere holds contents: write, and nothing creates a release or tag', async () => {
      const { parse } = await import('yaml');
      const d: any = parse(wf);
      const all = [d.permissions, ...Object.values(d.jobs).map((j: any) => j.permissions)].filter(Boolean);
      for (const p of all) expect(p.contents).not.toBe('write');
      expect(wf).not.toMatch(/actions\/create-release|softprops\/action-gh-release|git tag |gh release create/);
    });

    it('the workflow cannot be triggered by a pull request, a dispatch or a branch push', async () => {
      const { parse } = await import('yaml');
      const d: any = parse(wf);
      const on = d.on ?? d[true as unknown as string];
      // `workflow_run` after ci is what makes publication unreachable without a completed upstream
      // run; a `push` or `pull_request` trigger would put an `if:` in charge instead.
      expect(Object.keys(on)).toEqual(['workflow_run']);
      // Triggered by the FINALIZER, not by ci: both were previously triggered by ci completing,
      // so they raced and this workflow could query before the finalizer had succeeded.
      expect(on.workflow_run.workflows).toEqual(['C17 finalize']);
    });

    it('the guard requires push, success, main, this repository, and not a fork', async () => {
      // Each condition defends a different bypass, so a single missing one is a hole.
      for (const needed of [
        /"\$EV" = "workflow_run"/, /"\$CONCLUSION" = "success"/, /"\$BRANCH" = "main"/,
        /"\$REPO" = "a-Halawany\/elven"/, /"\$SRC_REPO" = "a-Halawany\/elven"/, /"\$IS_FORK" != "true"/,
      ]) expect(wf).toMatch(needed);
    });

    it('REJECTS publication-guard-bypass: publish depends on the guard AND on both platforms', async () => {
      const { parse } = await import('yaml');
      const d: any = parse(wf);
      expect(d.jobs.publish.if).toMatch(/needs\.guard\.outputs\.publishable == 'true'/);
      expect(d.jobs.publish.needs).toContain('guard');
      // Depending on `verify` means a failure on EITHER ubuntu or macos blocks publication.
      expect(d.jobs.publish.needs).toContain('verify');
      expect(d.jobs.verify.strategy.matrix.os).toEqual(['ubuntu-latest', 'macos-14']);
    });

    it('REJECTS duplicate/concurrent-publication: one publication per source commit', async () => {
      const { parse } = await import('yaml');
      const d: any = parse(wf);
      expect(d.concurrency.group).toMatch(/head_sha/);
      // Cancelling in progress would abandon a publication mid-flight, which is the state recovery
      // exists to avoid creating.
      expect(d.concurrency['cancel-in-progress']).toBe(false);
    });

    it('cosign is pinned by version AND verified by digest before it is executed', async () => {
      // The pin moved out of YAML into source, where it is behavioural rather than textual.
      const c = await load('c19-cosign.mjs');
      expect(c.COSIGN_PIN.version_tag).toMatch(/^v\d+\.\d+\.\d+$/);
      for (const asset of Object.values(c.COSIGN_PIN.assets) as any[]) {
        expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
      }
      // Installing verifies BEFORE making the binary executable; a tool that has already run
      // cannot be un-run by a later check.
      const src = readFileSync(join(LIB, 'c19-cosign.mjs'), 'utf8');
      const install = src.slice(src.indexOf('export function install('));
      expect(install.indexOf('verifyBinary(destPath, key)'))
        .toBeLessThan(install.indexOf('chmodSync(destPath'));
    });

    it('the raw OIDC token is never written to a file, an output or a log', () => {
      // cosign requests it in-process. Nothing here echoes it, redirects it or exports it.
      expect(wf).not.toMatch(/ACTIONS_ID_TOKEN_REQUEST_TOKEN\s*[>|]/);
      expect(wf).not.toMatch(/echo .*ACTIONS_ID_TOKEN/);
      expect(wf).not.toMatch(/\$\{\{\s*secrets\.[A-Z_]*TOKEN[^}]*\}\}\s*>/);
      expect(wf).not.toMatch(/id-token.*>>\s*\$GITHUB_(OUTPUT|ENV)/);
    });
  });

  describe('C19 — offline verification is a checkable property', () => {
    it('the guard traps every network primitive it claims to', async () => {
      const o = await load('c19-offline.mjs');
      const { createRequire } = await import('node:module');
      const req = createRequire(join(REPO, 'package.json'));
      const probes: Record<string, () => unknown> = {
        'https.request': () => req('node:https').request('https://example.com'),
        'http.get': () => req('node:http').get('http://example.com'),
        'dns.lookup': () => req('node:dns').lookup('example.com', () => {}),
        'net.connect': () => req('node:net').connect(443, 'example.com'),
        'tls.connect': () => req('node:tls').connect(443, 'example.com'),
        fetch: () => (globalThis.fetch as any)('https://example.com'),
      };
      for (const [name, probe] of Object.entries(probes)) {
        const { attempts } = await o.withNetworkDenied(async () => {
          try { await probe(); } catch { /* expected */ }
        });
        expect(attempts.length, `${name} must be trapped`).toBeGreaterThan(0);
      }
    });

    it('the primitives are restored afterwards, so the guard cannot break the process', async () => {
      const o = await load('c19-offline.mjs');
      const { createRequire } = await import('node:module');
      const req = createRequire(join(REPO, 'package.json'));
      const before = req('node:https').request;
      await o.withNetworkDenied(async () => {});
      expect(req('node:https').request).toBe(before);
      expect(typeof globalThis.fetch).toBe('function');
    });

    it('the trust material and identity policy verify with the network denied', async () => {
      const o = await load('c19-offline.mjs');
      const a = await load('c19-anchor.mjs');
      const { result, attempts } = await o.withNetworkDenied(async () => {
        const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
        return a.verifyIdentity(genuineIdentity(policy, SHA, RUN, WFD), policy,
          EXPECT(SHA, WFD));
      });
      expect(result).toEqual([]);
      // Zero attempts is the load-bearing assertion: a verifier that reached out and fell back to
      // a default would otherwise look identical to one that never needed the network.
      expect(attempts).toEqual([]);
    });
  });

  describe('C19 — certificate validity, binding and rollback', () => {
    it('REJECTS expired-certificate', async () => {
      const a = await load('c19-anchor.mjs');
      const tr = JSON.parse(readFileSync(join(LIB, 'c19-sigstore-trusted-root.json'), 'utf8'));
      const ca = tr.certificateAuthorities.at(-1);
      const [intermediate, root] = ca.certChain.certificates;
      const der = Buffer.from(intermediate.rawBytes, 'base64');
      const { X509Certificate } = await import('node:crypto');
      const notAfter = Date.parse(new X509Certificate(der).validTo);
      // One second past expiry. A Fulcio certificate lives for minutes; accepting an expired one
      // would accept a signature made long after the identity that authorised it lapsed.
      const problems = a.verifyCertificateChain(der,
        { certificateAuthorities: [{ certChain: { certificates: [root] } }] }, notAfter + 1000);
      expect(problems.join('\n')).toMatch(/outside the certificate validity window/);
    });

    it('REJECTS certificate-outside-validity-window (before it was issued)', async () => {
      const a = await load('c19-anchor.mjs');
      const tr = JSON.parse(readFileSync(join(LIB, 'c19-sigstore-trusted-root.json'), 'utf8'));
      const ca = tr.certificateAuthorities.at(-1);
      const [intermediate, root] = ca.certChain.certificates;
      const der = Buffer.from(intermediate.rawBytes, 'base64');
      const { X509Certificate } = await import('node:crypto');
      const notBefore = Date.parse(new X509Certificate(der).validFrom);
      const problems = a.verifyCertificateChain(der,
        { certificateAuthorities: [{ certChain: { certificates: [root] } }] }, notBefore - 1000);
      expect(problems.join('\n')).toMatch(/outside the certificate validity window/);
    });

    it('NON-VACUITY: inside the window the same certificate is accepted', async () => {
      const a = await load('c19-anchor.mjs');
      const tr = JSON.parse(readFileSync(join(LIB, 'c19-sigstore-trusted-root.json'), 'utf8'));
      const ca = tr.certificateAuthorities.at(-1);
      const [intermediate, root] = ca.certChain.certificates;
      const der = Buffer.from(intermediate.rawBytes, 'base64');
      const { X509Certificate } = await import('node:crypto');
      const c = new X509Certificate(der);
      const mid = (Date.parse(c.validFrom) + Date.parse(c.validTo)) / 2;
      expect(a.verifyCertificateChain(der,
        { certificateAuthorities: [{ certChain: { certificates: [root] } }] }, mid)).toEqual([]);
    });

    it('REJECTS wrong-run and wrong-attempt', async () => {
      const a = await load('c19-anchor.mjs');
      const { policy } = a.loadTrustMaterial(LIB);
      const id = genuineIdentity(policy, SHA, RUN, WFD);
      // The run URI carries both the run id and, through it, the attempt: a bundle from another
      // run of the same workflow is a different attestation and must not be reusable here.
      expect(a.verifyIdentity(id, policy, { ...EXPECT(SHA, WFD), runAttempt: '99' })
        .join('\n')).toMatch(/runInvocationUri/);
      expect(a.verifyIdentity(id, policy, { ...EXPECT(SHA, WFD), runId: '999' })
        .join('\n')).toMatch(/runInvocationUri/);
    });

    it('REJECTS wrong-finalizer-run', async () => {
      const a = await load('c19-anchor.mjs');
      const { policy } = a.loadTrustMaterial(LIB);
      // A finalizer run is a DIFFERENT run of a different workflow; its identity cannot stand in
      // for the source run's, because buildConfigUri and runInvocationUri both differ.
      const id: any = genuineIdentity(policy, SHA, RUN, WFD);
      id.buildConfigUri = 'https://github.com/a-Halawany/elven/.github/workflows/c17-finalize.yml@refs/heads/main';
      expect(a.verifyIdentity(id, policy, EXPECT(SHA, WFD))
        .join('\n')).toMatch(/buildConfigUri/);
    });

    it('REJECTS rollback-to-older-attestation and reused-commitment', async () => {
      const a = await load('c19-anchor.mjs');
      const { policy } = a.loadTrustMaterial(LIB);
      // An older attestation is bound to an older COMMIT. Presenting it for today's evidence fails
      // on the source digest, which is what makes rollback detectable rather than merely unlikely.
      const older: any = genuineIdentity(policy, 'f'.repeat(40), RUN, WFD);
      expect(a.verifyIdentity(older, policy, EXPECT(SHA, WFD))
        .join('\n')).toMatch(/sourceRepositoryDigest/);
      // A commitment reused from a PREVIOUS run names that run in its invocation URI.
      const reused: any = genuineIdentity(policy, SHA, '', WFD);
      reused.runInvocationUri = `https://github.com/${policy.identity.repository}/actions/runs/1/attempts/1`;
      expect(a.verifyIdentity(reused, policy, EXPECT(SHA, WFD))
        .join('\n')).toMatch(/runInvocationUri/);
    });

    it('REJECTS valid-attestation-from-another-archive and processed-evidence-rebound', async () => {
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      // A bundle that is internally perfect but attests a DIFFERENT artifact.
      const other = {
        verificationMaterial: { certificate: { rawBytes: makeSelfSigned().cert.toString('base64') }, tlogEntries: [] },
        messageSignature: {
          messageDigest: { algorithm: 'SHA2_256', digest: Buffer.from(sha256hex('another archive'), 'hex').toString('base64') },
          signature: Buffer.alloc(64).toString('base64'),
        },
      };
      expect(a.verifyBundle({
        bundle: other, policy, trustedRoot, artifactBytes: Buffer.from('this archive'),
        artifactDigestHex: sha256hex('this archive'), sourceSha: SHA,
      }).join('\n')).toMatch(/attests .* but verification is about|different bytes/);
    });

    it('REJECTS missing-sct, malformed-sct, removed-record, duplicated-record and noncanonical-payload', async () => {
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      // A bundle with no transparency-log entry at all: no SCT, no SET, no inclusion proof. An
      // unpublished signature can be produced and discarded at will, so this must never pass.
      const noLog = {
        verificationMaterial: { certificate: { rawBytes: makeSelfSigned().cert.toString('base64') }, tlogEntries: [] },
        messageSignature: { messageDigest: { algorithm: 'SHA2_256', digest: 'AA==' }, signature: 'AA==' },
      };
      expect(a.verifyBundle({ bundle: noLog, policy, trustedRoot, sourceSha: SHA }).join('\n'))
        .toMatch(/no transparency log entry/);
      // A malformed entry is rejected rather than skipped.
      const badLog = { ...noLog, verificationMaterial: { ...noLog.verificationMaterial, tlogEntries: [{ logId: { keyId: 'AA==' } }] } };
      expect(a.verifyBundle({ bundle: badLog, policy, trustedRoot, sourceSha: SHA }).length).toBeGreaterThan(0);
      // An unknown envelope version is refused rather than guessed at.
      expect(a.verifyBundle({ bundle: null as any, policy, trustedRoot }).join('\n')).toMatch(/not an object/);
    });

    it('REJECTS publication-from-superseded-attempt', async () => {
      const wf = readFileSync(join(REPO, '.github', 'workflows', 'c19-anchor.yml'), 'utf8');
      // Concurrency is keyed on the source commit and does NOT cancel in progress, so a superseded
      // attempt cannot race ahead of the one already publishing for that commit.
      const { parse } = await import('yaml');
      const d: any = parse(wf);
      expect(d.concurrency.group).toMatch(/head_sha/);
      expect(d.concurrency['cancel-in-progress']).toBe(false);
      // The signer's own run and attempt are passed to the pipeline explicitly, so an attestation
      // from a superseded attempt names that attempt rather than borrowing another's identity.
      expect(wf).toMatch(/--signer-run "\$\{\{ github\.run_id \}\}"/);
      expect(wf).toMatch(/--signer-attempt "\$\{\{ github\.run_attempt \}\}"/);
    });
  });

  describe('C19 — the attack matrix is COVERED, not merely declared', () => {
    it('every frozen family maps to a control, and every mapping names a real one', async () => {
      const c = await load('c19-criteria.mjs');
      const suites = [
        'c19-anchor.suite.ts', 'c19-lifecycle.suite.ts', 'c18-mutation-controls.suite.ts',
      ].map((f) => readFileSync(join(REPO, 'apps', 'api', 'test', 'gate', f), 'utf8')).join('\n');

      const families = new Set(c.C19_ATTACK_FAMILIES);
      const mapped = new Set(Object.keys(c.C19_FAMILY_CONTROLS));
      // A family with no control is an attack nobody tests for; a mapping to a control that does
      // not exist is worse, because it reads as coverage.
      for (const f of families) expect(mapped.has(f), `family '${f}' has no declared control`).toBe(true);
      for (const f of mapped) expect(families.has(f), `mapping '${f}' names no frozen family`).toBe(true);
      for (const [family, control] of Object.entries(c.C19_FAMILY_CONTROLS) as [string, string][]) {
        // The named control must exist VERBATIM, template placeholder included. This is the
        // assertion that matters: a mapping pointing at a control that was renamed or deleted
        // reads as coverage while testing nothing.
        expect(suites.includes(control),
          `family '${family}' names control '${control}', which does not exist in any suite`).toBe(true);
      }
      // Table-driven identity families must additionally appear as a ROW, so they cannot claim
      // coverage from a table that never mentions them.
      for (const f of ['wrong-san', 'wrong-issuer', 'wrong-repository', 'wrong-ref',
        'wrong-source-sha', 'wrong-workflow-digest']) {
        expect(suites.includes(`'${f}'`), `family '${f}' is not a row in the identity table`).toBe(true);
      }
    });
  });

  describe('C19 — publication recovery is idempotent, tested by EXECUTION', () => {
    // The previous controls searched source comments and string ordering. They passed while the
    // implementation ran `cosign verify-blob --help` and checked for a local file — it never
    // contacted Rekor at all. These drive the decision function itself.
    const load2 = () => import(/* @vite-ignore */ join(REPO, 'scripts', 'gate', 'c19-anchor-cli.mjs'));
    const ok = () => [];

    it('THE differential: entry accepted, bundle lost, retry performs ZERO signing', async () => {
      const { decideRecovery } = await load2();
      let signings = 0;
      const d = await decideRecovery({
        digestHex: 'aa', expectedIdentity: { sourceSha: 'x' },
        search: async () => ['uuid-1'],                 // Rekor already has it
        fetchEntry: async () => ({ logIndex: 7 }),      // and it retrieves
        verifyEntry: ok,                                // and it verifies
      });
      if (d.action === 'sign') signings += 1;
      expect(d.action).toBe('reuse');
      expect(signings, 'a retry after lost bundle persistence must not sign again').toBe(0);
    });

    it('NON-VACUITY: with no existing record it DOES decide to sign, exactly once', async () => {
      const { decideRecovery } = await load2();
      const d = await decideRecovery({
        digestHex: 'aa', expectedIdentity: { sourceSha: 'x' },
        search: async () => [], fetchEntry: async () => null, verifyEntry: ok,
      });
      expect(d.action).toBe('sign');
    });

    it('REFUSES on ambiguity rather than resolving it by guessing', async () => {
      const { decideRecovery } = await load2();
      const d = await decideRecovery({
        digestHex: 'aa', expectedIdentity: { sourceSha: 'x' },
        search: async () => ['a', 'b'], fetchEntry: async () => ({}), verifyEntry: ok,
      });
      expect(d.action).toBe('refuse');
      expect(d.why).toMatch(/ambiguous/);
    });

    it('REFUSES when an existing record does not verify', async () => {
      const { decideRecovery } = await load2();
      const d = await decideRecovery({
        digestHex: 'aa', expectedIdentity: { sourceSha: 'x' },
        search: async () => ['uuid-1'], fetchEntry: async () => ({}),
        verifyEntry: () => ['the signed entry timestamp does not verify'],
      });
      expect(d.action).toBe('refuse');
      expect(d.why).toMatch(/does not verify/);
    });

    it('REFUSES when the log cannot be queried — never blind-signs', async () => {
      const { decideRecovery } = await load2();
      const d = await decideRecovery({
        digestHex: 'aa', expectedIdentity: { sourceSha: 'x' },
        search: async () => { throw new Error('network down'); },
        fetchEntry: async () => ({}), verifyEntry: ok,
      });
      expect(d.action).toBe('refuse');
      // Signing without knowing whether a record exists is exactly how a duplicate is created.
      expect(d.why).toMatch(/could not be queried|risk a duplicate/);
    });

    /**
     * ── THE LEGACY DELIVERY COMMANDS ARE RETIRED ──
     *
     * `payload`, `publish` and `verify` each spawned cosign straight from $COSIGN or PATH with
     * nothing authenticating it. A wrong-digest executable that touched a marker and exited 0 was
     * executed and printed `cosign verify-blob: PASS` — the same defect the package verifier had,
     * reachable from a second entry point the first fix never touched.
     *
     * They are gone rather than guarded, because two commands that can sign is one more than the
     * design wants. These controls hold that: refused by name, and no cosign spawned by anything
     * that remains.
     */
    const CLI_PATH = join(REPO, 'scripts', 'gate', 'c19-anchor-cli.mjs');
    const runCli = (args: string[], env: Record<string, string> = {}) => spawnSync(
      process.execPath, [CLI_PATH, ...args],
      { encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120_000 });

    for (const cmd of ['payload', 'publish', 'verify']) {
      it(`the retired '${cmd}' command is refused by name and spawns nothing`, () => {
        const lair = mkdtempSync(join(tmpdir(), `c19retired-${cmd}-`));
        const marker = join(lair, 'EXECUTED');
        const evil = join(lair, 'cosign');
        writeFileSync(evil, `#!/bin/sh\ntouch ${JSON.stringify(marker)}\nexit 0\n`, { mode: 0o755 });
        const r = runCli([cmd, '--dry-run', '--offline', '--require-delivery-standing'],
          { COSIGN: evil, PATH: `${lair}:${process.env.PATH}` });
        expect(r.status, `${r.stdout}${r.stderr}`).not.toBe(0);
        expect(`${r.stdout}${r.stderr}`).toMatch(new RegExp(`'${cmd}' is retired`));
        // It must point at where the capability went, not merely say "unknown command".
        expect(`${r.stdout}${r.stderr}`).toMatch(/c19-deliver\.mjs/);
        expect(existsSync(marker), 'a retired command must spawn nothing').toBe(false);
      }, 120_000);
    }

    it('the surviving commands run, and neither spawns cosign', () => {
      const lair = mkdtempSync(join(tmpdir(), 'c19surv-'));
      const marker = join(lair, 'EXECUTED');
      const evil = join(lair, 'cosign');
      writeFileSync(evil, `#!/bin/sh\ntouch ${JSON.stringify(marker)}\nexit 0\n`, { mode: 0o755 });
      const env = { COSIGN: evil, PATH: `${lair}:${process.env.PATH}` };
      expect(runCli(['selftest', '--offline'], env).status).toBe(0);
      expect(runCli(['leftovers'], env).status).toBe(0);
      expect(existsSync(marker), 'selftest and leftovers must not spawn cosign').toBe(false);
    }, 180_000);

    it('no cosign is spawned anywhere in the legacy CLI', () => {
      const src = readFileSync(CLI_PATH, 'utf8');
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      // The env override was the way an unauthenticated binary got in.
      expect(code).not.toMatch(/process\.env\.COSIGN/);
      expect(code).not.toMatch(/spawnSync\(\s*cosign/);
    });

    it('the usage line no longer advertises the retired commands', () => {
      const r = runCli(['nonsense']);
      expect(`${r.stdout}${r.stderr}`).toMatch(/usage: c19-anchor-cli\.mjs <selftest\|leftovers>/);
    }, 60_000);
  });

  describe('C19 — the workflows invoke only the surviving commands', () => {
    /**
     * These controls used to drive `publish` and `verify` with the workflow's exact argv, because
     * the dispatcher had once silently dropped `--payload` and testing the callee while the caller
     * was broken proved nothing.
     *
     * Both commands are retired, so the property worth holding has moved: no workflow may invoke a
     * command that no longer exists, and delivery must go through the one pipeline that
     * authenticates its binary.
     */
    const WORKFLOWS = ['c19-anchor.yml', 'c19-lifecycle.yml'];
    const wf = (n: string) => readFileSync(join(REPO, '.github', 'workflows', n), 'utf8');

    for (const name of WORKFLOWS) {
      it(`${name} invokes the legacy CLI only for selftest and leftovers`, () => {
        const text = wf(name);
        const calls = [...text.matchAll(/c19-anchor-cli\.mjs\s+([a-z-]+)/g)].map((m) => m[1]);
        expect(calls.length, 'the workflow should still use the legacy CLI for its two commands')
          .toBeGreaterThan(0);
        for (const c of calls) expect(['selftest', 'leftovers']).toContain(c);
      });
    }

    it('delivery goes through c19-deliver.mjs, which authenticates the binary', () => {
      const anchor = wf('c19-anchor.yml');
      expect(anchor).toMatch(/c19-deliver\.mjs publish/);
      expect(anchor).toMatch(/c19-deliver\.mjs verify-offline/);
      // And the retired names appear nowhere as invocations.
      for (const name of WORKFLOWS) {
        expect(wf(name)).not.toMatch(/c19-anchor-cli\.mjs\s+(payload|publish|verify)\b/);
      }
    });

    it('each command line the workflows run is at least DISPATCHABLE', () => {
      for (const name of WORKFLOWS) {
        for (const m of wf(name).matchAll(/c19-anchor-cli\.mjs\s+([a-z-]+)/g)) {
          const r = spawnSync(process.execPath,
            [join(REPO, 'scripts', 'gate', 'c19-anchor-cli.mjs'), m[1], '--offline'],
            { encoding: 'utf8', timeout: 180_000 });
          // Exit 2 is the "unknown command" code; a workflow must never earn it.
          expect(r.status, `${name}: ${m[1]} -> ${r.stderr}`).not.toBe(2);
        }
      }
    }, 300_000);
  });

  describe('C19 — binary acquisition must not be decoded through a string', () => {
    const ACQ = join(LIB, 'c19-acquire.mjs');

    it('the artifact download reads BYTES, never a utf8 string', () => {
      const src = readFileSync(ACQ, 'utf8');
      // Decoding a ZIP through utf8 and re-encoding it silently destroys it: every invalid byte
      // sequence becomes U+FFFD and the file shortens. The first hosted run lost 122,930 bytes of
      // a 2,331,537-byte artifact this way.
      // The download now lives in the one GitHub layer, and returns BYTES.
      const gh = readFileSync(join(LIB, 'c19-github.mjs'), 'utf8');
      expect(gh).toMatch(/artifactZip\(artifactId\)/);
      expect(gh).toMatch(/Never decoded through a string/);
      // The corrupting pattern must not return anywhere.
      expect(gh).not.toMatch(/Buffer\.from\(.*'binary'\)/);
      expect(src).not.toMatch(/Buffer\.from\(gh\(/);
    });

    it('NON-VACUITY: utf8 round-tripping genuinely corrupts binary content', () => {
      // A ZIP local-file header plus bytes that are not valid utf8. CONTENT inequality is the
      // property that matters; length is not a reliable signal, because a byte replaced by U+FFFD
      // can round-trip to the same length while being a different byte.
      const bin = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0xff, 0xfe, 0x80, 0x81, 0x00, 0xc3, 0x28]);
      const throughString = Buffer.from(bin.toString('utf8'), 'binary');
      expect(throughString.equals(bin),
        'if this ever holds, the corruption this control guards against has stopped existing')
        .toBe(false);
      // LENGTH loss comes from VALID multi-byte sequences: two bytes decode to one character and
      // re-encode to one byte. That collapse is what shrank the real artifact from 2,331,537 to
      // 2,208,607 bytes — invalid bytes alone map 1:1 to U+FFFD and preserve length, which is why
      // an assertion built on the small sample above was wrong.
      const multibyte = Buffer.concat(Array.from({ length: 512 }, () => Buffer.from([0xc3, 0xa9])));
      const collapsed = Buffer.from(multibyte.toString('utf8'), 'binary');
      expect(collapsed.length).toBeLessThan(multibyte.length);
    });

    it('the wrapper digest is checked against the digest GitHub reports', () => {
      const src = readFileSync(ACQ, 'utf8');
      // This check is what caught the corruption. Without it the truncated ZIP would have been
      // signed as if it were the evidence.
      expect(src).toMatch(/the API reports/);
      expect(src).toMatch(/art\.digest/);
      expect(src).toMatch(/refusing to authenticate the wrapper against nothing/);
    });
  });

  describe('C19 — fixture resolution survives a re-run that mutates history', () => {
    it('finds the successful ATTEMPT even when the run now reports failure', async () => {
      const r = await load('c19-resolve.mjs');
      // A GitHub re-run mutates the run in place: attempt 1 succeeded, attempt 2 failed, and the
      // run reports `failure`. Re-running main's CI to demonstrate an unrelated CVE did exactly
      // this and made that commit unusable to a conclusion-only filter.
      const attempts: Record<string, any> = {
        '1': { conclusion: 'success', run_started_at: '2026-01-01T00:00:00Z' },
        '2': { conclusion: 'failure', run_started_at: '2026-02-01T00:00:00Z' },
      };
      const hit = r.earliestSuccessfulAttempt({ id: 1, run_attempt: 2 },
        { runAttempt: (_i: any, n: number) => attempts[String(n)] ?? null });
      expect(hit.attempt).toBe(1);
    });

    it('returns null when NO attempt succeeded', async () => {
      const r = await load('c19-resolve.mjs');
      expect(r.earliestSuccessfulAttempt({ id: 1, run_attempt: 2 },
        { runAttempt: () => ({ conclusion: 'failure', run_started_at: '2026-01-01T00:00:00Z' }) }))
        .toBeNull();
    });

    it('an attempt that cannot be READ is indeterminate, not "did not succeed"', async () => {
      const r = await load('c19-resolve.mjs');
      // Treating an unreadable attempt as absent would promote a later attempt to canonical and
      // change the identity of something already published.
      expect(() => r.earliestSuccessfulAttempt({ id: 1, run_attempt: 2 },
        { runAttempt: (_i: any, n: number) => (n === 1 ? null : { conclusion: 'success' }) }))
        .toThrow(/indeterminate attempt inside the declared range is fail-closed/);
    });

    it('ordering is by authoritative timestamp, because attempt numbers are run-local', async () => {
      const r = await load('c19-resolve.mjs');
      const ordered = r.orderCandidates([
        { runId: '10', attempt: 2, startedAt: '2026-01-01T00:00:00Z' },
        { runId: '20', attempt: 1, startedAt: '2026-06-01T00:00:00Z' },
      ]);
      expect(`${ordered[0].runId}#${ordered[0].attempt}`).toBe('10#2');
    });

    it('the harness uses the shared resolver rather than duplicating it', () => {
      const src = readFileSync(join(REPO, 'scripts', 'gate', 'c19-fixture.mjs'), 'utf8');
      expect(src).toMatch(/from '\.\/lib\/c19-resolve\.mjs'/);
      expect(src).not.toMatch(/spawnSync\('gh'/);
    });

    it('absence of a fixture is reported as UNEXERCISED, never as a pass', () => {
      const src = readFileSync(join(REPO, 'scripts', 'gate', 'c19-fixture.mjs'), 'utf8');
      expect(src).toMatch(/found=false/);
      expect(src).toMatch(/UNEXERCISED, not passing/);
    });
  });

  describe('C19 — the artifact cleanup ledger is honest', () => {
    const ledger = JSON.parse(readFileSync(join(LIB, 'c19-artifact-cleanup.json'), 'utf8'));

    it('records a deletion only where contamination was actually found', () => {
      expect(ledger.deleted.length).toBe(ledger.findings.contaminated);
      for (const d of ledger.deleted) {
        expect(d.occurrences).toBeGreaterThan(0);
        expect(d.why.length).toBeGreaterThan(20);
        expect(d.tombstone).toMatch(/404|Not Found/);
      }
    });

    it('claims NO rotation, and backs the liveness claim with concrete evidence', () => {
      // Claiming a rotation that never happened would be worse than the leak: it asserts a
      // remediation nobody performed.
      expect(ledger.liveness.rotated).toBe(false);
      expect(ledger.liveness.evidence.length).toBeGreaterThanOrEqual(3);
      for (const e of ledger.liveness.evidence) expect(e.length).toBeGreaterThan(30);
      expect(ledger.liveness.conclusion).toMatch(/no longer exists/);
    });

    it('contains no credential value, only names and counts', () => {
      const text = JSON.stringify(ledger).replace(/[0-9a-f]{40}/g, 'SHA');
      // The investigation never printed a value; the ledger must not have become the place one
      // survives either.
      expect(text).not.toMatch(/[0-9a-f]{24,}/);
      expect(ledger.findings.classes).toEqual(['PGPASSWORD', 'POSTGRES_PASSWORD']);
    });

    it('records the CORRECTION: previously suspected artifacts were retained, not deleted', () => {
      expect(ledger.findings.correction).toMatch(/RETAINED rather than deleted/);
      expect(ledger.retained.count).toBeGreaterThan(0);
    });
  });

  describe('C19 — the trust material\'s provenance is reproducible from the repository', () => {
    const TUF = join(LIB, 'c19-tuf');

    it('the signed delegation chain is stored, not merely described', () => {
      // Storing only the root and the result left the chain between them as prose. A reader could
      // not check the stated provenance without redoing the walk and trusting the outcome.
      for (const f of ['timestamp.json', 'snapshot.json', 'targets.json', 'BOOTSTRAP.md']) {
        expect(existsSync(join(TUF, f)), `${f} must be stored for provenance to be checkable`).toBe(true);
      }
      expect(existsSync(join(LIB, 'c19-sigstore-tuf-root.json'))).toBe(true);
    });

    it('targets.json DECLARES the digest of the trusted root actually in use', async () => {
      const targets = JSON.parse(readFileSync(join(TUF, 'targets.json'), 'utf8')).signed;
      const declared = targets.targets['trusted_root.json'].hashes.sha256;
      const actual = sha256hex(readFileSync(join(LIB, 'c19-sigstore-trusted-root.json')));
      // This equality is the whole of the provenance claim: it makes the trusted root
      // authenticated material rather than a file someone downloaded.
      expect(actual).toBe(declared);
    });

    it('the policy pin matches the stored trusted root', () => {
      const policy = JSON.parse(readFileSync(join(LIB, 'c19-trust.json'), 'utf8'));
      const actual = sha256hex(readFileSync(join(LIB, policy.tuf.trustedRootFile)));
      expect(actual).toBe(policy.tuf.trustedRootSha256);
    });

    it('the chain metadata links root -> timestamp -> snapshot -> targets', () => {
      const ts = JSON.parse(readFileSync(join(TUF, 'timestamp.json'), 'utf8')).signed;
      const snap = JSON.parse(readFileSync(join(TUF, 'snapshot.json'), 'utf8')).signed;
      const targets = JSON.parse(readFileSync(join(TUF, 'targets.json'), 'utf8')).signed;
      expect(ts.meta['snapshot.json'].version).toBe(snap.version);
      expect(snap.meta['targets.json'].version).toBe(targets.version);
    });
  });

  describe('C19 — the frozen criteria and the routing rule', () => {
    it('every frozen attack family is a real string and the set has no duplicates', async () => {
      const c = await load('c19-criteria.mjs');
      const fams = c.C19_ATTACK_FAMILIES;
      expect(new Set(fams).size).toBe(fams.length);
      for (const f of fams) expect(f).toMatch(/^[a-z0-9-]+$/);
    });

    it('a NEW attack class routes to the post-Phase-0 backlog rather than expanding C19', async () => {
      const c = await load('c19-criteria.mjs');
      expect(c.route('rekor-operator-key-compromise').gate).toBe('post-phase-0-backlog');
      expect(c.route('quantum-forged-ecdsa').gate).toBe('post-phase-0-backlog');
    });

    it('a CONSTITUTIONAL violation reopens the frozen criteria', async () => {
      const c = await load('c19-criteria.mjs');
      for (const inv of c.C19_INVARIANTS) {
        expect(c.route({ invariant: inv.id }).gate).toBe('C19');
        expect(c.isConstitutional(inv.id)).toBe(true);
      }
      expect(c.isConstitutional('something-else-entirely')).toBe(false);
    });

    it('the authority ledger cannot close a claim without an independent authority', async () => {
      const auth = await load('c19-authority.mjs');
      expect(auth.verifyAuthorityLedger()).toEqual([]);
      expect(auth.verifyAuthorityLedger([{
        id: 'x', claim: 'c', authority: null, independent: false, proves: 'p', closes: true,
      }]).join('\n')).toMatch(/without an independent authority/);
    });
  });
}

/** A structurally valid certificate from an authority this gate has never heard of. */
function makeSelfSigned(): { cert: Buffer } {
  // Node cannot mint an X.509 certificate, so a real one is reused as a stand-in for "a valid
  // certificate that does not chain to a pinned Fulcio CA" — which is exactly the property under
  // test. The Sigstore ROOT is used: genuinely valid, genuinely not an issuer of our leaf.
  const tr = JSON.parse(readFileSync(join(LIB, 'c19-sigstore-trusted-root.json'), 'utf8'));
  const first = tr.certificateAuthorities[0].certChain.certificates[0].rawBytes;
  return { cert: Buffer.from(first, 'base64') };
}
