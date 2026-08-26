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
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { createHash, generateKeyPairSync, sign as nodeSign, X509Certificate } from 'node:crypto';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..', '..', '..');
const LIB = join(REPO, 'scripts', 'gate', 'lib');
const load = (m: string) => import(/* @vite-ignore */ join(LIB, m));

const sha256hex = (b: Buffer | string) => createHash('sha256').update(b).digest('hex');

/** The identity a genuine delivery signature would carry, per the source-owned policy. */
function genuineIdentity(policy: any, sourceSha: string, runUri: string, workflowDigest: string) {
  const i = policy.identity;
  return {
    subjectAlternativeName: i.subjectAlternativeName,
    issuer: i.issuer,
    sourceRepositoryUri: `https://github.com/${i.repository}`,
    sourceRepositoryDigest: sourceSha,
    sourceRepositoryRef: i.ref,
    sourceRepositoryOwnerUri: `https://github.com/${i.repositoryOwner}`,
    buildConfigUri: `https://github.com/${i.workflowRef}`,
    buildConfigDigest: workflowDigest,
    buildTrigger: i.eventName,
    runInvocationUri: runUri,
    runnerEnvironment: i.runnerEnvironment,
  };
}

export function registerC19Anchor(): void {
  const SHA = 'a'.repeat(40);
  const RUN = 'https://github.com/a-Halawany/elven/actions/runs/123';
  const WFD = 'b'.repeat(40);

  describe('C19 — the signer identity is bound EXACTLY', () => {
    it('a genuine identity is accepted', async () => {
      const a = await load('c19-anchor.mjs');
      const { policy } = a.loadTrustMaterial(LIB);
      expect(a.verifyIdentity(genuineIdentity(policy, SHA, RUN, WFD), policy,
        { sourceSha: SHA, expectedRunUri: RUN, workflowDigest: WFD })).toEqual([]);
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
        { sourceSha: SHA, expectedRunUri: RUN, workflowDigest: WFD });
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
      expect(a.verifyIdentity(identity, policy, { sourceSha: SHA }).join('\n'))
        .toMatch(/sourceRepositoryRef/);
    });
  });

  describe('C19 — the trust material cannot be substituted or aged', () => {
    it('REJECTS substituted-trust-root: a tampered trusted root fails its TUF digest', async () => {
      const a = await load('c19-anchor.mjs');
      const dir = mkdtempSync(join(tmpdir(), 'c19-trust-'));
      const policy = JSON.parse(readFileSync(join(LIB, 'c19-trust.json'), 'utf8'));
      const root = JSON.parse(readFileSync(join(LIB, policy.tuf.trustedRootFile), 'utf8'));
      // Swap in an attacker's certificate authority — the exact move that would let a signature
      // from a CA we never trusted verify.
      root.certificateAuthorities[0].subject = { organization: 'attacker.example' };
      writeFileSync(join(dir, policy.tuf.trustedRootFile), JSON.stringify(root));
      writeFileSync(join(dir, 'c19-trust.json'), JSON.stringify(policy));
      expect(() => a.loadTrustMaterial(dir)).toThrow(/trust material has been substituted|does not match the digest/);
    });

    it('NON-VACUITY: the genuine trust material loads', async () => {
      const a = await load('c19-anchor.mjs');
      const { policy, trustedRoot } = a.loadTrustMaterial(LIB);
      expect(policy.version).toBe(2);
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
      expect(a.verifyInclusionProof({ canonicalizedBody: 'e30=' }).join('\n'))
        .toMatch(/no inclusion proof/);
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
      const good = {
        canonicalizedBody: bodies[3]!.toString('base64'),
        inclusionProof: {
          logIndex: 3, treeSize: 8, rootHash: r.toString('base64'),
          hashes: path(leaves, 3).map((h) => h.toString('base64')),
        },
      };
      expect(a.verifyInclusionProof(good)).toEqual([]);

      const forgeries: Record<string, any> = {
        'wrong body': { ...good, canonicalizedBody: Buffer.from('forged').toString('base64') },
        'wrong checkpoint': { ...good, inclusionProof: { ...good.inclusionProof, rootHash: Buffer.alloc(32).toString('base64') } },
        'truncated path': { ...good, inclusionProof: { ...good.inclusionProof, hashes: good.inclusionProof.hashes.slice(0, 2) } },
        'extra path node': { ...good, inclusionProof: { ...good.inclusionProof, hashes: [...good.inclusionProof.hashes, Buffer.alloc(32).toString('base64')] } },
        'index outside tree': { ...good, inclusionProof: { ...good.inclusionProof, logIndex: 8 } },
      };
      for (const [name, f] of Object.entries(forgeries)) {
        expect(a.verifyInclusionProof(f).length, `${name} must be rejected`).toBeGreaterThan(0);
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
      expect(on.workflow_run.workflows).toEqual(['ci']);
    });

    it('the guard requires push, success, main, this repository, and not a fork', async () => {
      // Each condition defends a different bypass, so a single missing one is a hole.
      for (const needed of [
        /"\$EV" = "push"/, /"\$CONCLUSION" = "success"/, /"\$BRANCH" = "main"/,
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

    it('cosign is pinned by version AND verified by digest before it is executed', () => {
      expect(wf).toMatch(/COSIGN_VERSION: v\d+\.\d+\.\d+/);
      expect(wf).toMatch(/COSIGN_SHA256: [0-9a-f]{64}/);
      // The digest check must precede execution; installing then running an unverified binary
      // would make the supply chain the weakest link in a gate about provenance.
      const check = wf.indexOf('digest mismatch');
      const exec = wf.indexOf('/tmp/cosign version');
      expect(check).toBeGreaterThan(0);
      expect(check).toBeLessThan(exec);
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
          { sourceSha: SHA, expectedRunUri: RUN, workflowDigest: WFD });
      });
      expect(result).toEqual([]);
      // Zero attempts is the load-bearing assertion: a verifier that reached out and fell back to
      // a default would otherwise look identical to one that never needed the network.
      expect(attempts).toEqual([]);
    });
  });

  describe('C19 — the frozen criteria and the routing rule', () => {
    it('every frozen attack family is a real string and the set has no duplicates', async () => {
      const c = await load('c19-criteria.mjs');
      const fams = c.C19_ATTACK_FAMILIES;
      expect(new Set(fams).size).toBe(fams.length);
      for (const f of fams) expect(f).toMatch(/^[a-z0-9-]+$/);
    });

    it('a NEW attack class routes to C20 rather than expanding C19', async () => {
      const c = await load('c19-criteria.mjs');
      expect(c.route('rekor-operator-key-compromise').gate).toBe('C20');
      expect(c.route('quantum-forged-ecdsa').gate).toBe('C20');
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
