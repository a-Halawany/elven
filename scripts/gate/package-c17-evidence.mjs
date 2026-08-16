#!/usr/bin/env node
/**
 * C17.1 F — the C17 evidence package, BUILT BY TRACKED CODE.
 *
 * ── WHAT WAS WRONG ───────────────────────────────────────────────────────────────
 * The C17 archive was assembled by hand in a shell session. It showed 13 ZIP entries but only 11
 * regular files, it omitted BOTH SBOMs — the documents the whole area is about — and it carried no
 * receipt tying it to the hosted run that produced it. None of that was detectable, because the
 * assembly logic was not code and so nothing could test it.
 *
 * Packaging and verification are now one tracked module with two entry points, so a behavioural
 * control can execute both. The manifest excludes itself, every payload byte is recounted and
 * rehashed, and the run receipt is machine-readable so a reviewer can check it against GitHub's
 * public API rather than taking the archive's word.
 *
 * Usage:
 *   node scripts/gate/package-c17-evidence.mjs pack   --c16 <DIR> --c17 <DIR> --out <DIR> \
 *                                                     [--run-receipt <FILE>]
 *   node scripts/gate/package-c17-evidence.mjs verify --zip <FILE> --root <REPO> [--online]
 */
import {
  readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, lstatSync, existsSync, rmSync,
  cpSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, dirname, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  compileBomValidator, validateBom, verifyVendoredSchemas, VENDOR_DIR, SCHEMA_FILES,
} from './lib/cyclonedx-schema.mjs';
import { deriveC16Expectation } from './generate-closures.mjs';
import { buildTargetInventory, reconcileInventory } from './lib/license-closure.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const CHECKSUM_FILE = 'SHA256SUMS.txt';

/**
 * The CODE-OWNED payload contract. Packing writes exactly this set and verification requires
 * exactly it — no missing entries, and no extras. A file added to the archive without being
 * added here fails, which is what makes "the archive contains what it should" checkable.
 */
export const PAYLOAD = Object.freeze([
  { path: 'sbom/sbom-linux-x64-glibc-prod.cdx.json', from: 'c16', file: 'sbom-linux-x64-glibc-prod.cdx.json' },
  { path: 'sbom/sbom-linux-x64-glibc-dev.cdx.json', from: 'c16', file: 'sbom-linux-x64-glibc-dev.cdx.json' },
  { path: 'sbom/closure-reconciliation.json', from: 'c16', file: 'closure-reconciliation.json' },
  { path: 'licence/license-inventory.json', from: 'c17', file: 'license-inventory.json' },
  { path: 'licence/license-obligations.json', from: 'c17', file: 'license-obligations.json' },
  { path: 'licence/license-reconciliation.json', from: 'c17', file: 'license-reconciliation.json' },
  { path: 'licence/license-texts.json', from: 'c17', file: 'license-texts.json' },
  { path: 'licence/source-offers.json', from: 'c17', file: 'source-offers.json' },
  { path: 'licence/THIRD_PARTY_NOTICES.md', from: 'c17', file: 'THIRD_PARTY_NOTICES.md' },
  { path: 'licence/c17-manifest.json', from: 'c17', file: 'c17-manifest.json' },
  { path: 'schema/bom-1.6.schema.json', from: 'schema', file: 'bom-1.6.schema.json' },
  { path: 'schema/jsf-0.82.schema.json', from: 'schema', file: 'jsf-0.82.schema.json' },
  { path: 'schema/spdx.schema.json', from: 'schema', file: 'spdx.schema.json' },
  { path: 'schema/MANIFEST.json', from: 'schema', file: 'MANIFEST.json' },
  { path: 'governance/legal-dispositions.json', from: 'repo', file: 'scripts/gate/legal-dispositions.json' },
  { path: 'governance/source-offers.json', from: 'repo', file: 'scripts/gate/source-offers.json' },
  { path: 'receipt/source-receipt.json', from: 'generated' },
  { path: 'receipt/run-receipt.json', from: 'generated' },
  { path: 'receipt/RESULT.txt', from: 'generated' },
]);

const argOf = (argv, name) => {
  const i = argv.indexOf(name);
  if (i === -1) return null;
  const v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`${name} requires a value`);
  return v;
};

/** The hosted-run receipt, machine-readable and checkable against GitHub's public API. */
function runReceipt(explicitPath) {
  if (explicitPath !== null) {
    return JSON.parse(readFileSync(explicitPath, 'utf8'));
  }
  // Built from the Actions environment when packing inside a run; absent otherwise, and the
  // verifier says so rather than pretending a local package was hosted.
  const e = process.env;
  if (!e.GITHUB_RUN_ID) {
    return {
      hosted: false,
      note: 'Packed outside GitHub Actions. No hosted-run receipt is claimed; the verifier will '
        + 'report this package as locally produced.',
    };
  }
  return {
    hosted: true,
    api_url: `https://api.github.com/repos/${e.GITHUB_REPOSITORY}/actions/runs/${e.GITHUB_RUN_ID}`,
    html_url: `https://github.com/${e.GITHUB_REPOSITORY}/actions/runs/${e.GITHUB_RUN_ID}`,
    repository: e.GITHUB_REPOSITORY ?? null,
    run_id: e.GITHUB_RUN_ID ?? null,
    run_number: e.GITHUB_RUN_NUMBER ?? null,
    run_attempt: e.GITHUB_RUN_ATTEMPT ?? null,
    workflow: e.GITHUB_WORKFLOW ?? null,
    workflow_ref: e.GITHUB_WORKFLOW_REF ?? null,
    job: e.GITHUB_JOB ?? null,
    head_sha: e.GITHUB_SHA ?? null,
    ref: e.GITHUB_REF ?? null,
    event: e.GITHUB_EVENT_NAME ?? null,
    runner_os: e.RUNNER_OS ?? null,
    runner_arch: e.RUNNER_ARCH ?? null,
  };
}

export function pack({ c16Dir, c17Dir, outDir, runReceiptPath = null, root = ROOT, requireFinal = false }) {
  const problems = [];
  const staging = join(outDir, 'payload');
  rmSync(staging, { recursive: true, force: true });
  mkdirSync(staging, { recursive: true });

  const headSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  const dirty = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' }).stdout.trim();
  const c17Manifest = JSON.parse(readFileSync(join(c17Dir, 'c17-manifest.json'), 'utf8'));

  // C17.2 B — the posture is DERIVED from what the C17 gate recorded. The previous version
  // wrote `final_mode: true` unconditionally, so the archive asserted a posture no run had been
  // asked to take. A manifest that does not record final mode cannot be packaged as final.
  const posture = c17Manifest.final_source_posture ?? null;
  if (posture === null || c17Manifest.mode === undefined) {
    problems.push(
      'C17 packaging: the C17 manifest records no mode or final-source posture. It was produced by '
      + 'a gate that predates real --final support, and a posture cannot be manufactured here.',
    );
  } else if (requireFinal && c17Manifest.mode !== 'final') {
    problems.push(
      `C17 packaging: the C17 manifest records mode '${c17Manifest.mode}'. A PRELIMINARY result `
      + 'cannot be packaged as final evidence.',
    );
  }
  if (problems.length > 0) return { ok: false, problems, zip: null };

  const generated = {
    'receipt/source-receipt.json': `${JSON.stringify({
      source_sha: headSha,
      worktree_clean: dirty === '',
      mode: c17Manifest.mode,
      final_source_posture: posture,
      c17_result: c17Manifest.result,
      c17_as_of: c17Manifest.generated_from.as_of,
      schema: c17Manifest.schema,
      sboms: c17Manifest.sboms,
      payload_contract: PAYLOAD.map((p) => p.path),
    }, null, 2)}\n`,
    'receipt/run-receipt.json': `${JSON.stringify(runReceipt(runReceiptPath), null, 2)}\n`,
    'receipt/RESULT.txt': `C17 ${c17Manifest.result} at ${headSha}\n`,
  };

  for (const entry of PAYLOAD) {
    const dest = join(staging, entry.path);
    mkdirSync(dirname(dest), { recursive: true });
    if (entry.from === 'generated') {
      writeFileSync(dest, generated[entry.path]);
      continue;
    }
    const src = entry.from === 'c16' ? join(c16Dir, entry.file)
      : entry.from === 'c17' ? join(c17Dir, entry.file)
        : entry.from === 'schema' ? join(root, VENDOR_DIR, entry.file)
          : join(root, entry.file);
    if (!existsSync(src)) {
      problems.push(`C17 packaging: required payload file '${entry.path}' is missing at ${src}`);
      continue;
    }
    cpSync(src, dest);
  }
  if (problems.length > 0) return { ok: false, problems, zip: null };

  // The checksum manifest lists every payload file and NEVER itself.
  const lines = PAYLOAD.map((entry) => {
    const bytes = readFileSync(join(staging, entry.path));
    return `${sha256(bytes)}  ${entry.path}`;
  }).sort();
  writeFileSync(join(staging, CHECKSUM_FILE), `${lines.join('\n')}\n`);

  const zip = join(outDir, `c17-evidence-${headSha}.zip`);
  rmSync(zip, { force: true });
  // -X drops extra attributes so the archive is a function of its contents.
  const z = spawnSync('zip', ['-qrX', zip, '.'], { cwd: staging, encoding: 'utf8' });
  if (z.status !== 0) {
    return { ok: false, problems: [`C17 packaging: zip failed: ${z.stderr}`], zip: null };
  }
  const zipBytes = readFileSync(zip);
  writeFileSync(`${zip}.sha256`, `${sha256(zipBytes)}  ${`c17-evidence-${headSha}.zip`}\n`);
  return {
    ok: true,
    problems: [],
    zip,
    sha256: sha256(zipBytes),
    bytes: zipBytes.byteLength,
    payload_files: PAYLOAD.length,
    checksum_lines: lines.length,
  };
}

/** Every file under a directory, repo-relative, sorted. */
function walk(dir, base = dir) {
  const out = [];
  for (const name of readdirSync(dir).sort()) {
    const abs = join(dir, name);
    const st = lstatSync(abs);
    if (st.isDirectory()) out.push(...walk(abs, base));
    else out.push({ rel: relative(base, abs).split(sep).join('/'), st, abs });
  }
  return out;
}

export function verify({ zipPath, root = ROOT, online = false }) {
  const problems = [];
  const notes = [];
  if (!existsSync(zipPath)) return { ok: false, problems: [`archive ${zipPath} does not exist`], notes };

  // ── ZIP SAFETY, before extraction ─────────────────────────────────────────
  const listing = spawnSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' });
  if (listing.status !== 0) return { ok: false, problems: ['archive is not readable as a zip'], notes };
  const entries = listing.stdout.split('\n').map((l) => l.trim()).filter(Boolean);
  const seen = new Set();
  for (const e of entries) {
    if (e.startsWith('/') || e.split('/').includes('..')) problems.push(`unsafe archive path '${e}'`);
    if (e.endsWith('/')) continue;
    if (seen.has(e)) problems.push(`archive contains a DUPLICATE entry '${e}'`);
    seen.add(e);
  }
  const symlinks = spawnSync('unzip', ['-l', zipPath], { encoding: 'utf8' }).stdout;
  if (/^\s*l/m.test(spawnSync('unzip', ['-Z', zipPath], { encoding: 'utf8' }).stdout)) {
    problems.push('archive contains a symlink');
  }
  if (problems.length > 0) return { ok: false, problems, notes };

  const tmp = join(dirname(zipPath), `.verify-${Date.now()}`);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  try {
    const x = spawnSync('unzip', ['-q', zipPath, '-d', tmp], { encoding: 'utf8' });
    if (x.status !== 0) return { ok: false, problems: ['extraction failed'], notes };

    const files = walk(tmp);
    for (const f of files) {
      if (f.st.isSymbolicLink()) problems.push(`extracted symlink '${f.rel}'`);
      else if (!f.st.isFile()) problems.push(`extracted non-regular file '${f.rel}'`);
    }
    // EXACT inventory: the code-owned contract plus the manifest, nothing else.
    const want = [...PAYLOAD.map((p) => p.path), CHECKSUM_FILE].sort();
    const got = files.map((f) => f.rel).sort();
    for (const missing of want.filter((w) => !got.includes(w))) problems.push(`archive is MISSING '${missing}'`);
    for (const extra of got.filter((g) => !want.includes(g))) problems.push(`archive contains EXTRA '${extra}'`);
    notes.push(`entries=${entries.length} regular_files=${files.length} payload=${PAYLOAD.length}`);

    // ── CHECKSUM MANIFEST: no self-reference, every line recomputed ──────────
    const sumPath = join(tmp, CHECKSUM_FILE);
    if (!existsSync(sumPath)) {
      problems.push(`archive has no ${CHECKSUM_FILE}`);
    } else {
      const sums = readFileSync(sumPath, 'utf8').split('\n').filter(Boolean);
      if (sums.some((l) => l.includes(CHECKSUM_FILE))) {
        problems.push(`${CHECKSUM_FILE} lists ITSELF, which cannot be verified`);
      }
      if (sums.length !== PAYLOAD.length) {
        problems.push(`${CHECKSUM_FILE} has ${sums.length} line(s), the payload contract has ${PAYLOAD.length}`);
      }
      for (const line of sums) {
        const m = /^([a-f0-9]{64})\s+(.+)$/.exec(line);
        if (m === null) { problems.push(`malformed checksum line: ${line.slice(0, 60)}`); continue; }
        const [, want2, rel] = m;
        const abs = join(tmp, rel);
        if (!existsSync(abs)) { problems.push(`${CHECKSUM_FILE} names missing file '${rel}'`); continue; }
        const actual = sha256(readFileSync(abs));
        if (actual !== want2) problems.push(`'${rel}' hashes to ${actual}, the manifest claims ${want2}`);
      }
      notes.push(`checksum_lines=${sums.length}`);
    }

    // ── BOTH SBOMs: schema-valid AND re-derived from THIS checkout ───────────
    const compiled = compileBomValidator(root);
    if (!compiled.ok) problems.push(...compiled.problems);
    const receiptPath = join(tmp, 'receipt/source-receipt.json');
    const receipt = existsSync(receiptPath) ? JSON.parse(readFileSync(receiptPath, 'utf8')) : null;
    if (receipt === null) {
      problems.push('archive has no source receipt');
    } else {
      const headSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
      if (receipt.source_sha !== headSha) {
        problems.push(`archive is bound to ${receipt.source_sha}, this checkout is ${headSha}`);
      }
      if (receipt.worktree_clean !== true) problems.push('archive was produced from a DIRTY worktree');
      if (receipt.c17_result !== 'PASS') problems.push(`archive records a C17 result of ${receipt.c17_result}`);
    }
    if (compiled.ok && receipt !== null) {
      const derived = deriveC16Expectation({ root, asOfDate: receipt.c17_as_of });
      for (const [target, file] of [
        ['production', 'sbom/sbom-linux-x64-glibc-prod.cdx.json'],
        ['development', 'sbom/sbom-linux-x64-glibc-dev.cdx.json'],
      ]) {
        const abs = join(tmp, file);
        if (!existsSync(abs)) { problems.push(`archive is missing the ${target} SBOM`); continue; }
        const bytes = readFileSync(abs);
        const errs = validateBom(compiled.validate, JSON.parse(bytes.toString('utf8')), target);
        if (errs.length > 0) problems.push(...errs);
        const expected = derived.sbomTexts[target];
        if (bytes.toString('utf8') !== expected) {
          problems.push(`the ${target} SBOM in the archive is not what this checkout derives`);
        }
        const claimed = receipt.sboms?.[target]?.sha256;
        if (claimed !== sha256(bytes)) {
          problems.push(`the ${target} SBOM hashes to ${sha256(bytes)}, the receipt claims ${claimed}`);
        }
        notes.push(`${target}_sbom=${sha256(bytes)} schema_errors=${errs.length}`);
      }
      // ── LICENCE RECONCILIATION, rerun here ────────────────────────────────
      for (const target of ['production', 'development']) {
        const inv = buildTargetInventory({ root, target, closure: derived.closures[target] });
        const rec = reconcileInventory({ target, inventory: inv, closure: derived.closures[target] });
        if (rec.length > 0) problems.push(...rec);
        if (inv.unresolved.length > 0) {
          problems.push(`${target} has ${inv.unresolved.length} unresolved licence finding(s) on re-run`);
        }
        notes.push(`${target}_classified=${inv.components.length} unresolved=${inv.unresolved.length}`);
      }
    }

    // ── C17.2 A — REGENERATE, then compare BYTES ────────────────────────────
    //
    // The previous verifier recomputed the checksum manifest against the payload and re-derived
    // only the SBOMs. Every licence artifact was therefore authenticated by a digest the archive
    // supplied about itself: replacing THIRD_PARTY_NOTICES.md with "TAMPERED LEGAL NOTICE" and
    // license-inventory.json with `{}`, then rebinding SHA256SUMS.txt, PASSED. Proved by
    // execution before this was written.
    //
    // A digest can only authenticate bytes against an INDEPENDENT expectation. So the gate is
    // re-run here, into a fresh temporary directory outside the tree, at the archive's own
    // governed as-of date and expected SHA, and every delivered artifact is compared byte for
    // byte with what this checkout produces.
    if (receipt !== null) {
      const regen = mkdtempSync(join(tmpdir(), 'c17-verify-regen-'));
      try {
        const gate = join(root, 'scripts', 'gate', 'licence-obligations.mjs');
        const args = [gate, '--out', regen, '--as-of', receipt.c17_as_of];
        if (receipt.source_sha !== undefined) args.push('--expected-sha', receipt.source_sha);
        if (receipt.mode === 'final') args.push('--final');
        const r = spawnSync(process.execPath, args, {
          cwd: root, encoding: 'utf8', timeout: 20 * 60_000, maxBuffer: 128 * 1024 * 1024,
        });
        if (r.status !== 0) {
          problems.push(
            'C17 could not be REGENERATED for comparison, so the delivered artifacts cannot be '
            + `authenticated: ${(r.stdout ?? '').slice(-600)}${(r.stderr ?? '').slice(-400)}`,
          );
        } else {
          // Every C17 artifact in the payload, mapped to its regenerated counterpart.
          const REGEN_COMPARE = [
            ['licence/license-inventory.json', 'license-inventory.json'],
            ['licence/license-obligations.json', 'license-obligations.json'],
            ['licence/license-reconciliation.json', 'license-reconciliation.json'],
            ['licence/license-texts.json', 'license-texts.json'],
            ['licence/source-offers.json', 'source-offers.json'],
            ['licence/THIRD_PARTY_NOTICES.md', 'THIRD_PARTY_NOTICES.md'],
          ];
          for (const [inZip, produced] of REGEN_COMPARE) {
            const a = join(tmp, inZip);
            const b = join(regen, produced);
            if (!existsSync(a)) { problems.push(`archive is missing '${inZip}'`); continue; }
            if (!existsSync(b)) { problems.push(`regeneration produced no '${produced}'`); continue; }
            const delivered = readFileSync(a);
            const expected = readFileSync(b);
            if (!delivered.equals(expected)) {
              problems.push(
                `'${inZip}' is NOT what this checkout regenerates: delivered ${delivered.byteLength} `
                + `bytes / ${sha256(delivered)}, regenerated ${expected.byteLength} bytes / `
                + `${sha256(expected)}. A rebound checksum cannot make substituted content genuine.`,
              );
            }
          }
          notes.push(`regenerated_and_compared=${REGEN_COMPARE.length}`);

          // The c17-manifest's OWN artifact table must agree with the delivered bytes, length
          // and digest — the manifest is a claim about the artifacts and is checked against them.
          const deliveredManifestPath = join(tmp, 'licence/c17-manifest.json');
          if (existsSync(deliveredManifestPath)) {
            const dm = JSON.parse(readFileSync(deliveredManifestPath, 'utf8'));
            for (const a of dm.artifacts ?? []) {
              const abs = join(tmp, 'licence', a.path);
              if (!existsSync(abs)) {
                problems.push(`c17-manifest claims artifact '${a.path}', absent from the archive`);
                continue;
              }
              const bytes = readFileSync(abs);
              if (bytes.byteLength !== a.bytes) {
                problems.push(`c17-manifest claims '${a.path}' is ${a.bytes} bytes; it is ${bytes.byteLength}`);
              }
              if (sha256(bytes) !== a.sha256) {
                problems.push(`c17-manifest claims '${a.path}' hashes to ${a.sha256}; it hashes to ${sha256(bytes)}`);
              }
            }
            // The regenerated manifest must agree on result and posture.
            const rm = JSON.parse(readFileSync(join(regen, 'c17-manifest.json'), 'utf8'));
            if (rm.result !== dm.result) {
              problems.push(`c17-manifest records result '${dm.result}'; regeneration produces '${rm.result}'`);
            }
            if (rm.mode !== dm.mode) {
              problems.push(`c17-manifest records mode '${dm.mode}'; regeneration produces '${rm.mode}'`);
            }
            notes.push(`c17_manifest_artifacts=${(dm.artifacts ?? []).length} mode=${dm.mode} result=${dm.result}`);
          } else {
            problems.push('archive is missing licence/c17-manifest.json');
          }

          // The result receipt must agree with the regenerated verdict, not merely exist.
          const rr = join(tmp, 'receipt/RESULT.txt');
          if (existsSync(rr)) {
            const text = readFileSync(rr, 'utf8').trim();
            const wantResult = JSON.parse(readFileSync(join(regen, 'c17-manifest.json'), 'utf8')).result;
            if (!text.startsWith(`C17 ${wantResult} at ${receipt.source_sha}`)) {
              problems.push(`receipt/RESULT.txt says ${JSON.stringify(text)}, which is not 'C17 ${wantResult} at ${receipt.source_sha}'`);
            }
          } else {
            problems.push('archive is missing receipt/RESULT.txt');
          }
        }
      } finally {
        rmSync(regen, { recursive: true, force: true });
      }
    }

    // ── GOVERNANCE BYTES: the archive's copies must equal the TRACKED source ──
    for (const [inZip, trackedRel] of [
      ['governance/legal-dispositions.json', 'scripts/gate/legal-dispositions.json'],
      ['governance/source-offers.json', 'scripts/gate/source-offers.json'],
    ]) {
      const a = join(tmp, inZip);
      const b = join(root, trackedRel);
      if (!existsSync(a)) { problems.push(`archive is missing '${inZip}'`); continue; }
      if (!readFileSync(a).equals(readFileSync(b))) {
        problems.push(`'${inZip}' differs from the tracked '${trackedRel}'`);
      }
    }

    // ── SCHEMA PROVENANCE: delivered bytes equal the tracked/code-owned bytes ─
    for (const f of [...SCHEMA_FILES, 'MANIFEST.json']) {
      const inZip = join(tmp, 'schema', f);
      const trackedPath = join(root, VENDOR_DIR, f);
      if (!existsSync(inZip)) { problems.push(`archive is missing schema/${f}`); continue; }
      if (!readFileSync(inZip).equals(readFileSync(trackedPath))) {
        problems.push(`schema/${f} in the archive differs from the tracked vendored bytes`);
      }
    }
    // And the tracked schema closure must itself still satisfy its CODE-OWNED provenance, so a
    // matching pair of archive and tree cannot both be wrong together.
    const prov = verifyVendoredSchemas(root);
    if (!prov.ok) problems.push(...prov.problems);

    // ── HOSTED-RUN RECEIPT ──────────────────────────────────────────────────
    const runPath = join(tmp, 'receipt/run-receipt.json');
    if (!existsSync(runPath)) {
      problems.push('archive has no run receipt');
    } else {
      const run = JSON.parse(readFileSync(runPath, 'utf8'));
      if (run.hosted !== true) {
        notes.push('run_receipt=LOCAL (not produced by a hosted run)');
      } else {
        for (const field of ['repository', 'run_id', 'run_attempt', 'workflow', 'job', 'head_sha', 'api_url']) {
          if (typeof run[field] !== 'string' || run[field].length === 0) {
            problems.push(`run receipt has no '${field}'`);
          }
        }
        if (receipt !== null && run.head_sha !== receipt.source_sha) {
          problems.push(`run receipt head_sha ${run.head_sha} != the source receipt's ${receipt.source_sha}`);
        }
        notes.push(`run_receipt=${run.repository}#${run.run_id} attempt ${run.run_attempt} job ${run.job}`);
        if (online) {
          // Checked against GitHub's PUBLIC API, so the claim is not self-attested.
          const api = spawnSync('curl', ['-fsSL', '-H', 'Accept: application/vnd.github+json', run.api_url], { encoding: 'utf8' });
          if (api.status !== 0) {
            problems.push(`run receipt could not be verified against ${run.api_url}`);
          } else {
            const body = JSON.parse(api.stdout);
            if (String(body.id) !== String(run.run_id)) problems.push('GitHub reports a different run id');
            if (body.head_sha !== run.head_sha) problems.push(`GitHub reports head_sha ${body.head_sha}, the receipt claims ${run.head_sha}`);
            if (body.conclusion !== 'success') problems.push(`GitHub reports run conclusion ${body.conclusion}`);
            notes.push(`github_api=verified id=${body.id} head_sha=${body.head_sha} conclusion=${body.conclusion}`);
          }
        }
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return { ok: problems.length === 0, problems, notes };
}

function main() {
  const argv = process.argv.slice(2);
  const mode = argv[0];
  if (mode === 'pack') {
    const r = pack({
      c16Dir: argOf(argv, '--c16'),
      c17Dir: argOf(argv, '--c17'),
      outDir: argOf(argv, '--out'),
      runReceiptPath: argOf(argv, '--run-receipt'),
      requireFinal: argv.includes('--require-final'),
    });
    if (!r.ok) {
      console.error('=== C17 PACKAGING FAILED ===');
      for (const p of r.problems) console.error(`  ${p}`);
      process.exit(1);
    }
    console.log(`C17 evidence packaged: ${r.zip}`);
    console.log(`  ${r.payload_files} payload file(s), ${r.checksum_lines} checksum line(s)`);
    console.log(`  ${r.bytes} bytes, sha256 ${r.sha256}`);
    if (process.env.GITHUB_ENV) {
      writeFileSync(process.env.GITHUB_ENV, `C17_ZIP=${r.zip}\nC17_ZIP_SHA256=${r.sha256}\n`, { flag: 'a' });
    }
    return;
  }
  if (mode === 'verify') {
    const r = verify({
      zipPath: argOf(argv, '--zip'),
      root: argOf(argv, '--root') ?? ROOT,
      online: argv.includes('--online'),
    });
    for (const n of r.notes) console.log(`  ${n}`);
    if (!r.ok) {
      console.error('=== C17 ARCHIVE VERIFICATION FAILED ===');
      for (const p of r.problems.slice(0, 40)) console.error(`  ${p}`);
      process.exit(1);
    }
    console.log('C17 archive verification: PASS');
    return;
  }
  console.error('usage: package-c17-evidence.mjs pack|verify …');
  process.exit(2);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (e) {
    console.error(`=== C17 PACKAGER FAILED (uncaught) ===\n  ${e instanceof Error ? e.stack : e}`);
    process.exit(1);
  }
}
