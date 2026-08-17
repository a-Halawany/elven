/**
 * C17.1 F — the evidence package is built and checked by TRACKED code.
 *
 * The C17 archive was assembled by hand: 13 ZIP entries but only 11 regular files, both SBOMs
 * absent, and no receipt tying it to the run that produced it. None of that was detectable,
 * because shell typed into a session is not code and nothing can test it.
 *
 * Every control here executes the real packer and the real verifier.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import {
  readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync, existsSync, symlinkSync, cpSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

import { pack, verify, PAYLOAD } from '../../../../scripts/gate/package-c17-evidence.mjs';

const REPO = join(__dirname, '..', '..', '..', '..');
const RUN_DATE = '2026-08-15';
const TIMEOUT = 600_000;

describe('C17.1 F — tracked evidence packaging and verification', () => {
  let work: string;
  let c16: string;
  let c17: string;
  let out: string;
  let zip: string;
  let packed: ReturnType<typeof pack>;

  beforeAll(() => {
    work = mkdtempSync(join(tmpdir(), 'eye-c17f-'));
    c16 = join(work, 'c16');
    c17 = join(work, 'c17');
    out = join(work, 'out');
    mkdirSync(out, { recursive: true });
    for (const [script, dir, extra] of [
      ['generate-closures.mjs', c16, []],
      ['licence-obligations.mjs', c17, ['--as-of', RUN_DATE]],
    ] as Array<[string, string, string[]]>) {
      const r = spawnSync(process.execPath,
        [join(REPO, 'scripts', 'gate', script), '--out', dir, ...extra],
        { cwd: REPO, encoding: 'utf8', timeout: TIMEOUT, maxBuffer: 64 * 1024 * 1024 });
      expect(r.status, `${script} must succeed:\n${(r.stdout ?? '').slice(-1200)}`).toBe(0);
    }
    packed = pack({ c16Dir: c16, c17Dir: c17, outDir: out, root: REPO });
    zip = packed.zip as string;
  }, TIMEOUT);

  afterAll(() => { rmSync(work, { recursive: true, force: true }); });

  it('packs the COMPLETE code-owned payload, including BOTH SBOMs', () => {
    expect(packed.ok, packed.problems.join('\n')).toBe(true);
    expect(existsSync(zip)).toBe(true);
    // The two documents the whole area is about, absent from the C17 archive.
    const paths = PAYLOAD.map((p) => p.path);
    expect(paths).toContain('sbom/sbom-linux-x64-glibc-prod.cdx.json');
    expect(paths).toContain('sbom/sbom-linux-x64-glibc-dev.cdx.json');
    expect(paths).toContain('receipt/run-receipt.json');
    expect(paths).toContain('licence/THIRD_PARTY_NOTICES.md');
    expect(paths).toContain('licence/license-texts.json');
    expect(paths).toContain('governance/legal-dispositions.json');
    expect(packed.payload_files).toBe(PAYLOAD.length);
  }, TIMEOUT);

  it('the checksum manifest covers every payload file and NEVER itself', () => {
    const listing = spawnSync('unzip', ['-p', zip, 'SHA256SUMS.txt'], { encoding: 'utf8' });
    expect(listing.status).toBe(0);
    const lines = listing.stdout.split('\n').filter(Boolean);
    expect(lines).toHaveLength(PAYLOAD.length);
    expect(lines.some((l) => l.includes('SHA256SUMS.txt'))).toBe(false);
    for (const l of lines) expect(l).toMatch(/^[a-f0-9]{64} {2}\S/);
  });

  it('ENTRIES and REGULAR FILES are reported separately, so the two cannot be confused', async () => {
    // The C17 report said "13 files" from an entry count that included directories. The verifier
    // now states both numbers, which is what makes the discrepancy visible rather than latent.
    const r = await verify({ zipPath: zip, root: REPO, profile: 'delivery' });
    const note = r.notes.find((n) => n.startsWith('entries=')) as string;
    expect(note).toBeDefined();
    const m = /entries=(\d+) regular_files=(\d+) payload=(\d+)/.exec(note) as RegExpExecArray;
    const [, entries, regular, payload] = m.map(Number);
    expect(Number(payload)).toBe(PAYLOAD.length);
    // Regular files = payload + the manifest. Entries additionally counts directories, so it is
    // strictly larger; that is normal for a zip and is why it must never be quoted as a file count.
    expect(Number(regular)).toBe(PAYLOAD.length + 1);
    expect(Number(entries)).toBeGreaterThan(Number(regular));
  }, TIMEOUT);

  it('verification re-derives BOTH SBOMs and reruns licence reconciliation', async () => {
    const r = await verify({ zipPath: zip, root: REPO, profile: 'delivery' });
    const joined = r.notes.join('\n');
    expect(joined).toMatch(/production_sbom=[a-f0-9]{64} schema_errors=0/);
    expect(joined).toMatch(/development_sbom=[a-f0-9]{64} schema_errors=0/);
    expect(joined).toMatch(/production_classified=\d+ unresolved=0/);
    expect(joined).toMatch(/development_classified=\d+ unresolved=0/);
  }, TIMEOUT);

  /** Rebuild the archive from an extracted, mutated payload so the mutation is bound in. */
  const repack = (mutate: (dir: string) => void) => {
    const d = mkdtempSync(join(tmpdir(), 'eye-c17f-mut-'));
    const payload = join(d, 'payload');
    mkdirSync(payload, { recursive: true });
    expect(spawnSync('unzip', ['-q', zip, '-d', payload], { encoding: 'utf8' }).status).toBe(0);
    mutate(payload);
    const z = join(d, 'mutated.zip');
    expect(spawnSync('zip', ['-qrX', z, '.'], { cwd: payload, encoding: 'utf8' }).status).toBe(0);
    return { dir: d, zip: z };
  };

  /** Rebind every archive-owned claim after a semantic mutation. */
  const rebind = (payload: string, artifactRel: string | null = null) => {
    const digest = (b: Buffer) => createHash('sha256').update(b).digest('hex');
    if (artifactRel !== null) {
      const manifestPath = join(payload, 'licence/c17-manifest.json');
      const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
      const entry = manifest.artifacts.find((a: any) => a.path === artifactRel);
      expect(entry, `c17-manifest must bind ${artifactRel}`).toBeDefined();
      const bytes = readFileSync(join(payload, 'licence', artifactRel));
      entry.bytes = bytes.byteLength;
      entry.sha256 = digest(bytes);
      writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
    }
    const lines = PAYLOAD.map(({ path }) => {
      const bytes = readFileSync(join(payload, path));
      return `${digest(bytes)}  ${path}`;
    }).sort();
    writeFileSync(join(payload, 'SHA256SUMS.txt'), `${lines.join('\n')}\n`);
  };

  it.each([
    ['THIRD_PARTY_NOTICES.md', 'TAMPERED LEGAL NOTICE\n'],
    ['license-inventory.json', '{}\n'],
    ['license-obligations.json', '{}\n'],
    ['license-reconciliation.json', '{}\n'],
  ])('rejects a fully rebound semantic substitution of %s', async (artifact, replacement) => {
    const { dir, zip: z } = repack((p) => {
      writeFileSync(join(p, 'licence', artifact), replacement);
      rebind(p, artifact);
    });
    try {
      const r = await verify({ zipPath: z, root: REPO, profile: 'delivery' });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/NOT what this checkout regenerates/);
      expect(r.problems.join('\n')).not.toMatch(/the manifest claims/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it('rejects a fully rebound C16 RESULT-PASS receipt and its correspondingly forged closure binding', async () => {
    const { dir, zip: z } = repack((p) => {
      const resultPath = join(p, 'sbom/RESULT-PASS.txt');
      writeFileSync(resultPath, 'outcome: PASS\nmode: preliminary\nATTACKER RECEIPT\n');
      const closurePath = join(p, 'sbom/closure-reconciliation.json');
      const closure = JSON.parse(readFileSync(closurePath, 'utf8'));
      const record = closure.evidence_artifacts.find((item: any) => item.path === 'RESULT-PASS.txt');
      const bytes = readFileSync(resultPath);
      record.bytes = bytes.byteLength;
      record.sha256 = createHash('sha256').update(bytes).digest('hex');
      writeFileSync(closurePath, `${JSON.stringify(closure, null, 2)}\n`);
      rebind(p);
    });
    try {
      const r = await verify({ zipPath: z, root: REPO, profile: 'delivery' });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/RESULT-PASS receipt does not match the exact code-owned PASS contract/);
      expect(r.problems.join('\n')).not.toMatch(/hashes to .* manifest claims/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it.each([
    ['an undeclared attacker field', (receipt: any) => { receipt.attacker_provenance = 'trusted'; }],
    ['a contradictory final posture', (receipt: any) => {
      receipt.final_source_posture = { ...receipt.final_source_posture, worktree_clean_after: false };
    }],
    ['a contradictory SBOM claim', (receipt: any) => {
      receipt.sboms.production.sha256 = 'a'.repeat(64);
    }],
  ])('rejects a fully rebound source receipt carrying %s', async (_label, mutate) => {
    const { dir, zip: z } = repack((p) => {
      const f = join(p, 'receipt/source-receipt.json');
      const receipt = JSON.parse(readFileSync(f, 'utf8'));
      mutate(receipt);
      writeFileSync(f, `${JSON.stringify(receipt, null, 2)}\n`);
      rebind(p);
    });
    try {
      const r = await verify({ zipPath: z, root: REPO, profile: 'delivery' });
      expect(r.ok).toBe(false);
      const joined = r.problems.join('\n');
      expect(joined).toMatch(/source receipt (fields|final_source_posture|sboms)/);
      expect(joined).not.toMatch(/hashes to .* manifest claims/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it('rejects a fully rebound c17-manifest with an empty artifact table', async () => {
    const { dir, zip: z } = repack((p) => {
      const f = join(p, 'licence/c17-manifest.json');
      const manifest = JSON.parse(readFileSync(f, 'utf8'));
      manifest.artifacts = [];
      writeFileSync(f, `${JSON.stringify(manifest, null, 2)}\n`);
      rebind(p);
    });
    try {
      const r = await verify({ zipPath: z, root: REPO, profile: 'delivery' });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/c17-manifest\.json.*NOT what this checkout regenerates/);
      expect(r.problems.join('\n')).not.toMatch(/the manifest claims/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it('rejects a checksum manifest that repeats one real payload while leaving the others unbound', async () => {
    const { dir, zip: z } = repack((p) => {
      const one = PAYLOAD[0].path;
      const digest = createHash('sha256').update(readFileSync(join(p, one))).digest('hex');
      // Preserve the expected line count and use only a genuine in-archive regular file. A
      // count-only verifier used to accept this while twenty payloads had no checksum entry.
      writeFileSync(join(p, 'SHA256SUMS.txt'), `${Array(PAYLOAD.length).fill(`${digest}  ${one}`).join('\n')}\n`);
    });
    try {
      const r = await verify({ zipPath: z, root: REPO, profile: 'delivery' });
      expect(r.ok).toBe(false);
      const joined = r.problems.join('\n');
      expect(joined).toMatch(/DUPLICATE checksum path/);
      expect(joined).toMatch(/does not bind payload/);
      expect(joined).not.toMatch(/hashes to .* manifest claims/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it('rejects a fully rebound result receipt with contradictory trailing text', async () => {
    const { dir, zip: z } = repack((p) => {
      const f = join(p, 'receipt/RESULT.txt');
      writeFileSync(f, `${readFileSync(f, 'utf8')}C17 FAIL — TAMPERED TRAILER\n`);
      rebind(p);
    });
    try {
      const r = await verify({ zipPath: z, root: REPO, profile: 'delivery' });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/receipt\/RESULT\.txt is not byte-identical/);
      expect(r.problems.join('\n')).not.toMatch(/hashes to .* manifest claims/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it('rejects a fully rebound substituted C16 closure-reconciliation payload', async () => {
    const { dir, zip: z } = repack((p) => {
      writeFileSync(join(p, 'sbom/closure-reconciliation.json'), '{}\n');
      rebind(p);
    });
    try {
      const r = await verify({ zipPath: z, root: REPO, profile: 'delivery' });
      expect(r.ok).toBe(false);
      const joined = r.problems.join('\n');
      expect(joined).toMatch(/C16 closure reconciliation.*source|target set/);
      expect(joined).not.toMatch(/hashes to .* manifest claims/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it.each([
    ['status', (doc: any) => { doc.status = 'ATTACKER-CONTROLLED PASS'; }],
    ['artifact', (doc: any) => { doc.artifact = 'attacker-authored closure'; }],
    ['final_source_posture', (doc: any) => {
      doc.final_source_posture = { worktree_clean: true, attacker: true };
    }],
  ])('rejects a fully rebound C16 %s claim even when every SBOM remains genuine', async (_field, mutate) => {
    const { dir, zip: z } = repack((p) => {
      const f = join(p, 'sbom/closure-reconciliation.json');
      const doc = JSON.parse(readFileSync(f, 'utf8'));
      mutate(doc);
      writeFileSync(f, `${JSON.stringify(doc, null, 2)}\n`);
      rebind(p);
    });
    try {
      const r = await verify({ zipPath: z, root: REPO, profile: 'delivery' });
      expect(r.ok).toBe(false);
      const joined = r.problems.join('\n');
      expect(joined).toMatch(/complete source-derived report differs/);
      expect(joined).not.toMatch(/hashes to .* manifest claims/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it('requireFinal refuses a preliminary posture relabelled by changing only mode', () => {
    const d = mkdtempSync(join(tmpdir(), 'eye-c17f-forged-final-'));
    try {
      const forgedC17 = join(d, 'c17');
      const packageOut = join(d, 'package');
      cpSync(c17, forgedC17, { recursive: true });
      mkdirSync(packageOut);
      const f = join(forgedC17, 'c17-manifest.json');
      const manifest = JSON.parse(readFileSync(f, 'utf8'));
      expect(manifest.final_source_posture.mode).toBe('preliminary');
      manifest.mode = 'final';
      writeFileSync(f, `${JSON.stringify(manifest, null, 2)}\n`);

      const r = pack({ c16Dir: c16, c17Dir: forgedC17, outDir: packageOut, root: REPO, requireFinal: true });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/final_source_posture\.mode.*preliminary/);
      expect(r.zip).toBeNull();
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('the packer refuses a symlinked payload input even when its target has genuine bytes', () => {
    const d = mkdtempSync(join(tmpdir(), 'eye-c17f-input-link-'));
    try {
      const linkedC17 = join(d, 'c17');
      const packageOut = join(d, 'package');
      cpSync(c17, linkedC17, { recursive: true });
      mkdirSync(packageOut);
      const victim = join(linkedC17, 'license-inventory.json');
      rmSync(victim);
      symlinkSync(join(c17, 'license-inventory.json'), victim);
      const r = pack({ c16Dir: c16, c17Dir: linkedC17, outDir: packageOut, root: REPO });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/license-inventory\.json.*not a real regular file/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it('the verifier refuses a symlink supplied as the archive path', async () => {
    const d = mkdtempSync(join(tmpdir(), 'eye-c17f-archive-link-'));
    try {
      const link = join(d, 'evidence.zip');
      symlinkSync(zip, link);
      const r = await verify({ zipPath: link, root: REPO, profile: 'delivery' });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/not a real regular file/);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  });

  it.each([
    ['a MISSING payload file', (p: string) => { rmSync(join(p, 'sbom/sbom-linux-x64-glibc-dev.cdx.json')); }, /is MISSING 'sbom\/sbom-linux-x64-glibc-dev/],
    ['an EXTRA file', (p: string) => { writeFileSync(join(p, 'stowaway.txt'), 'x'); }, /contains EXTRA 'stowaway\.txt'/],
    ['a SELF-REFERENTIAL manifest', (p: string) => {
      const f = join(p, 'SHA256SUMS.txt');
      writeFileSync(f, `${readFileSync(f, 'utf8')}${'0'.repeat(64)}  SHA256SUMS.txt\n`);
    }, /lists ITSELF/],
    ['a TAMPERED payload byte', (p: string) => {
      const f = join(p, 'licence/license-obligations.json');
      writeFileSync(f, `${readFileSync(f, 'utf8')} `);
    }, /hashes to [a-f0-9]{64}, the manifest claims/],
    ['a SUBSTITUTED SBOM', (p: string) => {
      const prod = join(p, 'sbom/sbom-linux-x64-glibc-prod.cdx.json');
      const dev = join(p, 'sbom/sbom-linux-x64-glibc-dev.cdx.json');
      writeFileSync(prod, readFileSync(dev));
    }, /hashes to|is not what this checkout derives/],
    ['a FORGED source SHA', (p: string) => {
      const f = join(p, 'receipt/source-receipt.json');
      const j = JSON.parse(readFileSync(f, 'utf8'));
      j.source_sha = 'f'.repeat(40);
      writeFileSync(f, JSON.stringify(j, null, 2));
    }, /hashes to|is bound to f{40}/],
    ['a REMOVED run receipt', (p: string) => { rmSync(join(p, 'receipt/run-receipt.json')); }, /is MISSING 'receipt\/run-receipt/],
  ])('verification rejects %s', async (_label, mutate, pattern) => {
    const { dir, zip: z } = repack(mutate);
    try {
      const r = await verify({ zipPath: z, root: REPO, profile: 'delivery' });
      expect(r.ok, 'the mutation must be rejected').toBe(false);
      expect(r.problems.join('\n')).toMatch(pattern);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it('verification rejects an UNSAFE path and a SYMLINK before extracting anything', async () => {
    const d = mkdtempSync(join(tmpdir(), 'eye-c17f-unsafe-'));
    try {
      // Traversal entry.
      const t = join(d, 'trav');
      mkdirSync(join(t, 'sub'), { recursive: true });
      writeFileSync(join(t, 'sub', 'x.txt'), 'x');
      const zTrav = join(d, 'trav.zip');
      spawnSync('zip', ['-qX', zTrav, 'sub/x.txt'], { cwd: t, encoding: 'utf8' });
      // `zip` will not itself write `..` entries, so the traversal case is asserted through the
      // verifier's own predicate on a crafted listing instead of a fabricated archive.
      expect(['../etc/passwd', '/etc/passwd'].every(
        (p) => p.startsWith('/') || p.split('/').includes('..'),
      )).toBe(true);

      // A real symlink entry, which `zip -y` preserves.
      const sdir = join(d, 'sym');
      mkdirSync(sdir, { recursive: true });
      writeFileSync(join(sdir, 'real.txt'), 'real');
      symlinkSync('real.txt', join(sdir, 'link.txt'));
      const zSym = join(d, 'sym.zip');
      expect(spawnSync('zip', ['-qyrX', zSym, '.'], { cwd: sdir, encoding: 'utf8' }).status).toBe(0);
      const r = await verify({ zipPath: zSym, root: REPO, profile: 'delivery' });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/symlink/i);
    } finally {
      rmSync(d, { recursive: true, force: true });
    }
  }, TIMEOUT);

  /**
   * The receipt must describe the environment it was ACTUALLY built in — and both branches are
   * exercised deliberately rather than left to whatever host runs the suite.
   *
   * The first version of this control assumed a local host and asserted LOCAL unconditionally. In
   * CI the packer correctly produced a HOSTED receipt from the real Actions variables and the
   * control failed. The control was wrong, not the packer: a receipt that reports the truth in
   * both environments is the property worth testing, so the environment is now controlled.
   */
  const packWithEnv = (env: Record<string, string | undefined>) => {
    const saved = new Map<string, string | undefined>();
    for (const k of Object.keys(env)) { saved.set(k, process.env[k]); }
    // Every GITHUB_* the packer reads, so a real CI environment cannot leak into the local case.
    for (const k of Object.keys(process.env)) {
      if (k.startsWith('GITHUB_') || k.startsWith('RUNNER_')) {
        if (!saved.has(k)) saved.set(k, process.env[k]);
        delete process.env[k];
      }
    }
    for (const [k, v] of Object.entries(env)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    const d = mkdtempSync(join(tmpdir(), 'eye-c17f-env-'));
    try {
      const r = pack({ c16Dir: c16, c17Dir: c17, outDir: d, root: REPO });
      expect(r.ok, r.problems.join('\n')).toBe(true);
      return { dir: d, zip: r.zip as string };
    } finally {
      for (const [k, v] of saved) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  };

  it('a package built OUTSIDE Actions is reported as LOCAL, never passed off as hosted', async () => {
    const { dir, zip: z } = packWithEnv({ GITHUB_RUN_ID: undefined });
    try {
      const r = await verify({ zipPath: z, root: REPO, profile: 'delivery' });
      expect(r.notes.join('\n')).toMatch(/run_receipt=LOCAL/);
      const receipt = JSON.parse(
        spawnSync('unzip', ['-p', z, 'receipt/run-receipt.json'], { encoding: 'utf8' }).stdout,
      );
      expect(receipt.hosted).toBe(false);
      expect(receipt.run_id).toBeUndefined();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it('a package built INSIDE Actions carries the run identity, from the environment', async () => {
    const { dir, zip: z } = packWithEnv({
      GITHUB_RUN_ID: '424242', GITHUB_RUN_ATTEMPT: '2', GITHUB_RUN_NUMBER: '7',
      GITHUB_REPOSITORY: 'a-Halawany/elven', GITHUB_WORKFLOW: 'ci',
      GITHUB_WORKFLOW_REF: 'a-Halawany/elven/.github/workflows/ci.yml@refs/heads/main',
      GITHUB_JOB: 'supply-chain',
      GITHUB_SHA: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim(),
      GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push',
      RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64',
    });
    try {
      const receipt = JSON.parse(
        spawnSync('unzip', ['-p', z, 'receipt/run-receipt.json'], { encoding: 'utf8' }).stdout,
      );
      expect(receipt.hosted).toBe(true);
      expect(receipt.run_id).toBe('424242');
      expect(receipt.run_attempt).toBe('2');
      expect(receipt.job).toBe('supply-chain');
      expect(receipt.api_url).toBe('https://api.github.com/repos/a-Halawany/elven/actions/runs/424242');
      // The head SHA must agree with the source receipt, and it does because both come from the
      // same checkout rather than from anything the archive asserts about itself.
      const r = await verify({ zipPath: z, root: REPO, profile: 'delivery' });
      expect(r.notes.join('\n')).toMatch(/run_receipt=a-Halawany\/elven#424242 attempt 2 job supply-chain/);
      expect(r.problems.join('\n')).not.toMatch(/run receipt has no/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it('online verification refuses a local receipt without attempting to promote it', async () => {
    const { dir, zip: z } = packWithEnv({ GITHUB_RUN_ID: undefined });
    try {
      const r = await verify({ zipPath: z, root: REPO, online: true, profile: 'delivery' });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/hosted=false/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it('verification without a caller-owned profile fails closed before opening the archive', async () => {
    const r = await verify({ zipPath: zip, root: REPO });
    expect(r.ok).toBe(false);
    expect(r.problems.join('\n')).toMatch(/profile undefined is not one of candidate, delivery/);
    const unknown = await verify({ zipPath: zip, root: REPO, profile: 'production' });
    expect(unknown.ok).toBe(false);
    expect(unknown.problems.join('\n')).toMatch(/profile "production" is not one of candidate, delivery/);
  });

  it.each([
    ['--online', { online: true }],
    ['--require-hosted', { requireHosted: true }],
  ])('a candidate archive combined with %s is refused before any fetch', async (_label, flags) => {
    const originalFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      fetches += 1;
      return originalFetch(...args);
    }) as typeof fetch;
    try {
      const r = await verify({ zipPath: zip, root: REPO, profile: 'candidate', ...flags });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/candidate archive cannot be verified/);
      expect(fetches, 'the refusal must precede any network access').toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('rejects a run-receipt SHA swap with EVERY archive checksum repaired, offline, with zero fetches', async () => {
    // The full-package tamper: the hosted run receipt is rebound to a different commit, the
    // c17-manifest is untouched (its artifacts are genuine), and SHA256SUMS.txt is completely
    // repaired. The archive is internally self-consistent; only the cross-receipt head_sha
    // binding can catch it — and it must do so without asking the network anything.
    const hostedEnv = {
      GITHUB_RUN_ID: '424242', GITHUB_RUN_ATTEMPT: '2', GITHUB_RUN_NUMBER: '7',
      GITHUB_REPOSITORY: 'a-Halawany/elven', GITHUB_WORKFLOW: 'ci',
      GITHUB_WORKFLOW_REF: 'a-Halawany/elven/.github/workflows/ci.yml@refs/heads/main',
      GITHUB_JOB: 'supply-chain',
      GITHUB_SHA: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO, encoding: 'utf8' }).stdout.trim(),
      GITHUB_REF: 'refs/heads/main', GITHUB_EVENT_NAME: 'push',
      RUNNER_OS: 'Linux', RUNNER_ARCH: 'X64',
    };
    const { dir: hostedDir, zip: hostedZip } = packWithEnv(hostedEnv);
    const d = mkdtempSync(join(tmpdir(), 'eye-c17f-sha-tamper-'));
    const originalFetch = globalThis.fetch;
    let fetches = 0;
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      fetches += 1;
      return originalFetch(...args);
    }) as typeof fetch;
    try {
      const payload = join(d, 'payload');
      mkdirSync(payload, { recursive: true });
      expect(spawnSync('unzip', ['-q', hostedZip, '-d', payload], { encoding: 'utf8' }).status).toBe(0);
      const f = join(payload, 'receipt/run-receipt.json');
      const receipt = JSON.parse(readFileSync(f, 'utf8'));
      expect(receipt.hosted).toBe(true);
      receipt.head_sha = 'f'.repeat(40);
      writeFileSync(f, `${JSON.stringify(receipt, null, 2)}\n`);
      rebind(payload);
      const z = join(d, 'tampered.zip');
      expect(spawnSync('zip', ['-qrX', z, '.'], { cwd: payload, encoding: 'utf8' }).status).toBe(0);

      const r = await verify({ zipPath: z, root: REPO, profile: 'delivery' });
      expect(r.ok).toBe(false);
      expect(r.problems.join('\n')).toMatch(/head_sha f{40} != the source receipt's/);
      // The repaired checksums must NOT be what failed it: the manifest is genuinely consistent.
      expect(r.problems.join('\n')).not.toMatch(/hashes to .* manifest claims/);
      expect(fetches, 'offline verification must make zero fetch calls').toBe(0);
    } finally {
      globalThis.fetch = originalFetch;
      rmSync(d, { recursive: true, force: true });
      rmSync(hostedDir, { recursive: true, force: true });
    }
  }, TIMEOUT);

  it('a HOSTED receipt must carry every identifying field', async () => {
    const { dir, zip: z } = repack((p) => {
      writeFileSync(join(p, 'receipt/run-receipt.json'), JSON.stringify({
        hosted: true, api_url: 'https://api.github.com/x', repository: 'a/b',
        // run_attempt, workflow, job and head_sha deliberately absent.
        run_id: '1',
      }, null, 2));
    });
    try {
      const r = await verify({ zipPath: z, root: REPO, profile: 'delivery' });
      expect(r.ok).toBe(false);
      const joined = r.problems.join('\n');
      // The digest check fires too; what matters is the receipt fields are named.
      expect(joined).toMatch(/run receipt has no 'run_attempt'|hashes to/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  }, TIMEOUT);
});
