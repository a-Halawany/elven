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
 *   node scripts/gate/package-c17-evidence.mjs verify --zip <FILE> --root <REPO> \
 *                                                     --profile candidate|delivery \
 *                                                     [--online] [--require-hosted]
 */
import {
  readFileSync, writeFileSync, mkdirSync, mkdtempSync, readdirSync, lstatSync, existsSync, rmSync,
  cpSync, realpathSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { join, dirname, relative, sep, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

import {
  compileBomValidator, validateBom, verifyVendoredSchemas, VENDOR_DIR, SCHEMA_FILES,
} from './lib/cyclonedx-schema.mjs';
import { deriveC16Expectation, generatorDigest } from './generate-closures.mjs';
import { RECEIPT_PROFILES, verifyHostedRun } from './lib/hosted-run.mjs';
import { buildTargetInventory, reconcileInventory } from './lib/license-closure.mjs';
import {
  EXCLUSION_REQUIRED_FIELDS, FORBIDDEN_RESIDUALS, findVulnerableResiduals,
} from './lib/reconcile.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const CHECKSUM_FILE = 'SHA256SUMS.txt';

/** Deep deterministic equality for JSON values (including nested object keys). */
function jsonCanonical(value) {
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === 'object') {
      return Object.fromEntries(Object.keys(v).sort().map((k) => [k, walk(v[k])]));
    }
    return v;
  };
  return JSON.stringify(walk(value));
}

/**
 * Reconstruct the complete deterministic C16 report contract from source.
 *
 * `generated_from.run_date` and the hash of RESULT-PASS.txt contain execution-time data and are
 * checked separately. Everything else is code/source-derived, including the report's top-level
 * acceptance posture. This prevents a rebound archive from changing `status`, `artifact`,
 * `final_source_posture`, governance, remediation or provenance while retaining genuine SBOMs.
 */
function expectedC16Report(root, receipt, derived) {
  const exclusionsText = readFileSync(join(root, 'scripts/gate/closure-exclusions.json'), 'utf8');
  const exclusionDoc = JSON.parse(exclusionsText);
  const generator = generatorDigest(root);
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const pinned = {};
  for (const [name, expected] of Object.entries({ 'packageurl-js': '2.0.1', yaml: '2.9.0' })) {
    let installed = '(not installed)';
    try {
      installed = JSON.parse(readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8')).version;
    } catch { /* kept as the generator's exact fail-closed sentinel */ }
    pinned[name] = {
      expected, declared: manifest.devDependencies?.[name] ?? null, installed,
    };
  }
  const overrideProof = FORBIDDEN_RESIDUALS.map((item) => ({
    package: item.name,
    advisory: item.advisory,
    severity: item.severity,
    vulnerable_below: item.fixedAt,
    pinned_exact: item.pinnedTo,
    resolved_per_target: Object.fromEntries(
      Object.entries(derived.closures).map(([name, closure]) => [
        name,
        [...closure.nodes.values()]
          .filter((node) => node.name === item.name).map((node) => node.version).sort(),
      ]),
    ),
  }));
  const finalMode = receipt.mode === 'final';
  return {
    artifact: 'C16 target-resolved dependency closures + full-field bidirectional reconciliation',
    status: finalMode
      ? 'FINAL — produced in --final mode from a clean worktree at an explicitly expected source SHA'
      : 'PRELIMINARY — regenerate with --final --expected-sha <SHA> from the frozen source and commit in the evidence-only child',
    final_source_posture: finalMode ? {
      expected_sha: receipt.source_sha,
      head_sha: receipt.source_sha,
      worktree_clean: true,
      ignored_inputs_present: ['node_modules'],
      ignored_inputs_are_not_closure_truth: true,
    } : null,
    remediation:
      'Remediated after independent source review of e3a0b1f: canonical PURLs via the ' +
      'exact-pinned reference implementation, real workspace identities, exact-pinned YAML ' +
      'parser, recursive cycle-safe link traversal, fail-closed unresolved references, ' +
      'fixed-point scope membership, mixed positive/negative platform constraints, ' +
      'subject-to-root edges, full-field multiset reconciliation, and operational exclusions.',
    generated_from: {
      lockfile: 'pnpm-lock.yaml',
      lockfile_sha256: derived.meta.lockfileSha256,
      target_descriptor: 'scripts/gate/target-descriptor.json',
      descriptor_sha256: derived.meta.descriptorSha256,
      exclusions: 'scripts/gate/closure-exclusions.json',
      exclusions_sha256: sha256(exclusionsText),
      generator: 'scripts/gate/generate-closures.mjs',
      generator_sha256: generator.digest,
      generator_files: generator.files,
      pinned_implementations: pinned,
      source_sha: derived.meta.sourceSha,
      // The producer's execution date is authenticated only as a valid date below; it is not
      // derivable from immutable source and must never be invented from the evidence under test.
      run_date: null,
    },
    determinism_contract: {
      serial_number: 'SHA-256 of the component/dependency/metadata content, shaped into a UUID',
      metadata_timestamp: 'deliberately omitted',
      collections: 'explicitly sorted',
      node_modules_read: false,
      host_platform_read: false,
      reconciliation_reads_sbom_from_disk: true,
    },
    targets: derived.reports,
    governed_exclusions: {
      schema_version: exclusionDoc.schema_version,
      semantic: exclusionDoc.semantic,
      required_fields: exclusionDoc.required_fields,
      rejection_rules: exclusionDoc.rejection_rules,
      code_owned_required_fields: EXCLUSION_REQUIRED_FIELDS,
      declared: exclusionDoc.exclusions ?? [],
      rejected: derived.gov.problems,
      cardinality_problems: derived.cardinalityProblems,
      applied_per_target: derived.exclusionApplication,
    },
    override_residual_proof: overrideProof,
    vulnerable_residuals: findVulnerableResiduals(derived.closures),
    evidence_binding_note:
      'Every file in the output directory is bound by path, size and SHA-256, EXCEPT ' +
      'closure-reconciliation.json itself: a report cannot contain its own digest.',
  };
}

/**
 * The CODE-OWNED payload contract. Packing writes exactly this set and verification requires
 * exactly it — no missing entries, and no extras. A file added to the archive without being
 * added here fails, which is what makes "the archive contains what it should" checkable.
 */
export const PAYLOAD = Object.freeze([
  { path: 'sbom/sbom-linux-x64-glibc-prod.cdx.json', from: 'c16', file: 'sbom-linux-x64-glibc-prod.cdx.json' },
  { path: 'sbom/sbom-linux-x64-glibc-dev.cdx.json', from: 'c16', file: 'sbom-linux-x64-glibc-dev.cdx.json' },
  { path: 'sbom/closure-reconciliation.json', from: 'c16', file: 'closure-reconciliation.json' },
  { path: 'sbom/RESULT-PASS.txt', from: 'c16', file: 'RESULT-PASS.txt' },
  { path: 'licence/license-inventory.json', from: 'c17', file: 'license-inventory.json' },
  { path: 'licence/license-obligations.json', from: 'c17', file: 'license-obligations.json' },
  { path: 'licence/license-reconciliation.json', from: 'c17', file: 'license-reconciliation.json' },
  { path: 'licence/license-texts.json', from: 'c17', file: 'license-texts.json' },
  { path: 'licence/source-offers.json', from: 'c17', file: 'source-offers.json' },
  { path: 'licence/bundled-components.json', from: 'c17', file: 'bundled-components.json' },
  { path: 'licence/THIRD_PARTY_NOTICES.md', from: 'c17', file: 'THIRD_PARTY_NOTICES.md' },
  { path: 'licence/c17-manifest.json', from: 'c17', file: 'c17-manifest.json' },
  { path: 'schema/bom-1.6.schema.json', from: 'schema', file: 'bom-1.6.schema.json' },
  { path: 'schema/jsf-0.82.schema.json', from: 'schema', file: 'jsf-0.82.schema.json' },
  { path: 'schema/spdx.schema.json', from: 'schema', file: 'spdx.schema.json' },
  { path: 'schema/MANIFEST.json', from: 'schema', file: 'MANIFEST.json' },
  { path: 'governance/legal-dispositions.json', from: 'repo', file: 'scripts/gate/legal-dispositions.json' },
  { path: 'governance/source-offers.json', from: 'repo', file: 'scripts/gate/source-offers.json' },
  { path: 'governance/bundled-components.json', from: 'repo', file: 'scripts/gate/bundled-components.json' },
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
  mkdirSync(outDir, { recursive: true });
  for (const [label, dir] of [['C16 input', c16Dir], ['C17 input', c17Dir], ['package output', outDir]]) {
    try {
      const st = lstatSync(resolve(dir));
      if (st.isSymbolicLink() || !st.isDirectory()) {
        problems.push(`C17 packaging: ${label} '${dir}' must be a real directory, not a symlink or non-directory`);
      }
    } catch (e) {
      problems.push(`C17 packaging: ${label} '${dir}' cannot be inspected (${e instanceof Error ? e.message : e})`);
    }
  }
  const staging = join(outDir, 'payload');
  if (existsSync(staging)) {
    problems.push(`C17 packaging: output staging path '${staging}' already exists; refusing stale or preplanted content`);
  }

  const headProbe = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' });
  const headSha = headProbe.stdout?.trim?.() ?? '';
  const statusProbe = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' });
  const dirty = statusProbe.stdout?.trim?.() ?? '';
  const zip = join(outDir, `c17-evidence-${headSha}.zip`);
  for (const path of [zip, `${zip}.sha256`]) {
    if (existsSync(path)) problems.push(`C17 packaging: expected output '${path}' already exists; refusing to follow or replace it`);
  }
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
  if (requireFinal) {
    if (headProbe.status !== 0 || !/^[0-9a-f]{40}$/.test(headSha)) {
      problems.push(`C17 packaging: final evidence cannot resolve a 40-hex HEAD (git exit ${headProbe.status})`);
    }
    if (statusProbe.status !== 0) {
      problems.push(`C17 packaging: final evidence cannot establish worktree cleanliness (git status exit ${statusProbe.status})`);
    } else if (dirty !== '') {
      problems.push(`C17 packaging: final evidence requires a clean worktree; ${dirty.split('\n').length} path(s) are dirty`);
    }
    let outputInside = null;
    try {
      const rel = relative(realpathSync(root), realpathSync(resolve(outDir)));
      outputInside = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
    } catch { outputInside = null; }
    if (outputInside !== false) {
      problems.push('C17 packaging: final package output must resolve outside the repository');
    }
    if (c17Manifest.result !== 'PASS') problems.push(`C17 packaging: C17 result is ${JSON.stringify(c17Manifest.result)}, not PASS`);
    if (c17Manifest.generated_from?.source_sha !== headSha) {
      problems.push('C17 packaging: C17 manifest source SHA is not the packaging checkout HEAD');
    }
    if (posture !== null) {
      if (posture.mode !== 'final') problems.push(`C17 packaging: final_source_posture.mode is ${JSON.stringify(posture.mode)}, not "final"`);
      if (posture.expected_sha !== headSha || posture.head_sha !== headSha) {
        problems.push('C17 packaging: final_source_posture is not bound to packaging checkout HEAD');
      }
      for (const field of ['worktree_clean_before', 'worktree_clean_after', 'output_outside_repo', 'target_materialization']) {
        if (posture[field] !== true) problems.push(`C17 packaging: final_source_posture.${field} is not true`);
      }
      if (!Array.isArray(posture.test_seams) || posture.test_seams.length !== 0) {
        problems.push('C17 packaging: final_source_posture.test_seams is not an empty array');
      }
    }
  }
  if (problems.length > 0) return { ok: false, problems, zip: null };

  mkdirSync(staging, { recursive: false });

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
    const srcStat = lstatSync(src);
    if (srcStat.isSymbolicLink() || !srcStat.isFile()) {
      problems.push(`C17 packaging: required payload file '${entry.path}' is not a real regular file`);
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

  // -X drops extra attributes so the archive is a function of its contents.
  const z = spawnSync('zip', ['-qrX', zip, '.'], { cwd: staging, encoding: 'utf8' });
  if (z.status !== 0) {
    return { ok: false, problems: [`C17 packaging: zip failed: ${z.stderr}`], zip: null };
  }
  const zipBytes = readFileSync(zip);
  writeFileSync(`${zip}.sha256`, `${sha256(zipBytes)}  ${`c17-evidence-${headSha}.zip`}\n`, { flag: 'wx' });
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

export async function verify({ zipPath, root = ROOT, online = false, requireHosted = false, profile }) {
  const problems = [];
  const notes = [];
  // C17.2 — the receipt PROFILE is caller-owned and mandatory. It states which contract the
  // archive's run receipt is judged by (candidate dispatch preflight vs push/main delivery);
  // an unknown or missing profile fails closed rather than defaulting to the laxer contract.
  if (!RECEIPT_PROFILES.includes(profile)) {
    return {
      ok: false,
      problems: [
        `verification profile ${JSON.stringify(profile)} is not one of ${RECEIPT_PROFILES.join(', ')}. `
        + 'State --profile explicitly; it is never inferred from the archive under test.',
      ],
      notes,
    };
  }
  // A candidate is an offline preflight and nothing else. Refused here, before the archive is
  // even opened — and in particular before any fetch could occur.
  if (profile === 'candidate' && (online || requireHosted)) {
    return {
      ok: false,
      problems: [
        'a candidate archive cannot be verified --online or --require-hosted. A workflow_dispatch '
        + 'preflight is not delivery evidence; verify the push/main delivery archive instead.',
      ],
      notes,
    };
  }
  if (!existsSync(zipPath)) return { ok: false, problems: [`archive ${zipPath} does not exist`], notes };
  const archiveStat = lstatSync(zipPath);
  if (archiveStat.isSymbolicLink() || !archiveStat.isFile()) {
    return { ok: false, problems: [`archive ${zipPath} is not a real regular file`], notes };
  }

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

  // Never extract beside an attacker-supplied archive path: that parent may be writable by a
  // different principal and race a predictable `.verify-<timestamp>` directory. mkdtemp gives
  // verification a newly-created private root under the platform temp directory.
  const tmp = mkdtempSync(join(tmpdir(), 'c17-archive-verify-'));
  try {
    const x = spawnSync('unzip', ['-q', zipPath, '-d', tmp], { encoding: 'utf8' });
    if (x.status !== 0) return { ok: false, problems: ['extraction failed'], notes };

    const files = walk(tmp);
    let unsafeExtractedMember = false;
    for (const f of files) {
      if (f.st.isSymbolicLink()) { problems.push(`extracted symlink '${f.rel}'`); unsafeExtractedMember = true; }
      else if (!f.st.isFile()) { problems.push(`extracted non-regular file '${f.rel}'`); unsafeExtractedMember = true; }
    }
    // Do not follow or inspect an unsafe member after detecting it.
    if (unsafeExtractedMember) return { ok: false, problems, notes };
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
      const checksumSeen = new Set();
      for (const line of sums) {
        const m = /^([a-f0-9]{64}) {2}(.+)$/.exec(line);
        if (m === null) { problems.push(`malformed checksum line: ${line.slice(0, 60)}`); continue; }
        const [, want2, rel] = m;
        if (rel.startsWith('/') || rel.includes('\\') || rel.split('/').includes('..')) {
          problems.push(`unsafe checksum path '${rel}'`);
          continue;
        }
        if (checksumSeen.has(rel)) problems.push(`DUPLICATE checksum path '${rel}'`);
        checksumSeen.add(rel);
        if (!PAYLOAD.some((p) => p.path === rel)) {
          problems.push(`${CHECKSUM_FILE} names non-payload path '${rel}'`);
          continue;
        }
        const abs = join(tmp, rel);
        if (!existsSync(abs)) { problems.push(`${CHECKSUM_FILE} names missing file '${rel}'`); continue; }
        const actual = sha256(readFileSync(abs));
        if (actual !== want2) problems.push(`'${rel}' hashes to ${actual}, the manifest claims ${want2}`);
      }
      for (const expectedPath of PAYLOAD.map((p) => p.path)) {
        if (!checksumSeen.has(expectedPath)) {
          problems.push(`${CHECKSUM_FILE} does not bind payload '${expectedPath}'`);
        }
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
      const receiptKeys = Object.keys(receipt).sort();
      const expectedReceiptKeys = [
        'source_sha', 'worktree_clean', 'mode', 'final_source_posture', 'c17_result',
        'c17_as_of', 'schema', 'sboms', 'payload_contract',
      ].sort();
      if (jsonCanonical(receiptKeys) !== jsonCanonical(expectedReceiptKeys)) {
        problems.push(
          `source receipt fields ${JSON.stringify(receiptKeys)} are not the exact code-owned set `
          + JSON.stringify(expectedReceiptKeys),
        );
      }
      const headSha = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).stdout.trim();
      if (receipt.source_sha !== headSha) {
        problems.push(`archive is bound to ${receipt.source_sha}, this checkout is ${headSha}`);
      }
      if (receipt.worktree_clean !== true) problems.push('archive was produced from a DIRTY worktree');
      if (receipt.c17_result !== 'PASS') problems.push(`archive records a C17 result of ${receipt.c17_result}`);
      const receiptContract = Array.isArray(receipt.payload_contract) ? [...receipt.payload_contract].sort() : null;
      const expectedContract = PAYLOAD.map((p) => p.path).sort();
      if (receiptContract === null || jsonCanonical(receiptContract) !== jsonCanonical(expectedContract)) {
        problems.push('source receipt payload_contract is not the exact code-owned payload set');
      }
      // Online verification is delivery verification. A locally produced or preliminary
      // archive may be useful offline, but it can never become hosted/final merely because a
      // caller forgot the second flag.
      if (online || requireHosted) {
        const p = receipt.final_source_posture;
        if (receipt.mode !== 'final') problems.push(`hosted delivery records C17 mode ${JSON.stringify(receipt.mode)}, expected "final"`);
        if (p === null || typeof p !== 'object') {
          problems.push('hosted delivery has no final_source_posture');
        } else {
          if (p.mode !== 'final') problems.push(`final_source_posture.mode is ${JSON.stringify(p.mode)}, expected "final"`);
          if (p.expected_sha !== receipt.source_sha || p.head_sha !== receipt.source_sha) {
            problems.push('final_source_posture is not bound to the source receipt SHA');
          }
          for (const field of ['worktree_clean_before', 'worktree_clean_after', 'output_outside_repo', 'target_materialization']) {
            if (p[field] !== true) problems.push(`final_source_posture.${field} is not true`);
          }
          if (!Array.isArray(p.test_seams) || p.test_seams.length !== 0) {
            problems.push('final_source_posture.test_seams is not an empty array');
          }
        }
      }
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

      // The C16 reconciliation report is itself a payload member. A checksum supplied by the
      // same archive cannot authenticate its semantics, so reconstruct every acceptance-relevant
      // target field from source just as we do for the SBOM bytes above.
      const closurePath = join(tmp, 'sbom/closure-reconciliation.json');
      if (!existsSync(closurePath)) {
        problems.push('archive is missing sbom/closure-reconciliation.json');
      } else {
        let closure = null;
        try { closure = JSON.parse(readFileSync(closurePath, 'utf8')); } catch (e) {
          problems.push(`sbom/closure-reconciliation.json is not JSON: ${e instanceof Error ? e.message : e}`);
        }
        if (closure !== null) {
          const expectedReport = expectedC16Report(root, receipt, derived);
          const deliveredComparable = structuredClone(closure);
          const expectedComparable = structuredClone(expectedReport);
          delete deliveredComparable.evidence_artifacts;
          // Execution date is not immutable source truth. Require a real canonical UTC date, then
          // remove it from both sides before exact comparison of every source-derived field.
          const runDate = deliveredComparable.generated_from?.run_date;
          if (typeof runDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(runDate)
            || Number.isNaN(Date.parse(`${runDate}T00:00:00.000Z`))
            || new Date(`${runDate}T00:00:00.000Z`).toISOString().slice(0, 10) !== runDate) {
            problems.push(`C16 closure reconciliation run_date ${JSON.stringify(runDate)} is not a real YYYY-MM-DD date`);
          }
          if (deliveredComparable.generated_from !== null
            && typeof deliveredComparable.generated_from === 'object') {
            deliveredComparable.generated_from.run_date = null;
          }
          if (jsonCanonical(deliveredComparable) !== jsonCanonical(expectedComparable)) {
            problems.push(
              'C16 closure reconciliation complete source-derived report differs from the '
              + 'code-owned expectation (status/posture/provenance/governance/targets)',
            );
          }

          const evidence = Array.isArray(closure.evidence_artifacts) ? closure.evidence_artifacts : [];
          const byPath = new Map();
          for (const record of evidence) {
            const keys = record !== null && typeof record === 'object'
              ? Object.keys(record).sort() : [];
            if (JSON.stringify(keys) !== JSON.stringify(['bytes', 'path', 'sha256'])) {
              problems.push('C16 closure reconciliation has a malformed evidence_artifacts record');
              continue;
            }
            if (byPath.has(record.path)) {
              problems.push(`C16 closure reconciliation duplicates evidence artifact '${record.path}'`);
            }
            byPath.set(record.path, record);
          }
          const expectedEvidencePaths = [
            'RESULT-PASS.txt',
            'sbom-linux-x64-glibc-dev.cdx.json',
            'sbom-linux-x64-glibc-prod.cdx.json',
          ];
          if (jsonCanonical([...byPath.keys()].sort()) !== jsonCanonical(expectedEvidencePaths)) {
            problems.push('C16 closure reconciliation evidence_artifacts is not the exact PASS output set');
          }
          for (const [target, file] of [
            ['production', 'sbom-linux-x64-glibc-prod.cdx.json'],
            ['development', 'sbom-linux-x64-glibc-dev.cdx.json'],
          ]) {
            const record = byPath.get(file);
            const text = derived.sbomTexts[target];
            if (record?.bytes !== Buffer.byteLength(text) || record?.sha256 !== sha256(text)) {
              problems.push(`C16 closure reconciliation evidence binding for '${file}' is not source-derived`);
            }
          }
          const resultRecord = byPath.get('RESULT-PASS.txt');
          const deliveredResultPath = join(tmp, 'sbom/RESULT-PASS.txt');
          if (!existsSync(deliveredResultPath)) {
            problems.push('archive is missing the C16 RESULT-PASS receipt');
          } else {
            const resultBytes = readFileSync(deliveredResultPath);
            if (resultRecord?.bytes !== resultBytes.byteLength
              || resultRecord?.sha256 !== sha256(resultBytes)) {
              problems.push('C16 closure reconciliation RESULT-PASS binding differs from delivered receipt bytes');
            }
            const resultText = resultBytes.toString('utf8');
            const lines = resultText.split('\n');
            const expectedMode = receipt.mode === 'final' ? 'final' : 'preliminary';
            const expectedSha = receipt.mode === 'final' ? receipt.source_sha : '(none)';
            const expectedPrefix = [
              'outcome: PASS',
              `mode: ${expectedMode}`,
              `source_sha: ${receipt.source_sha}`,
              `expected_sha: ${expectedSha}`,
              'targets: production, development',
            ];
            if (jsonCanonical(lines.slice(0, 5)) !== jsonCanonical(expectedPrefix)
              || !/^timestamp: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(lines[5] ?? '')
              || lines.slice(6).some((line) => line !== '')) {
              problems.push('C16 RESULT-PASS receipt does not match the exact code-owned PASS contract');
            }
          }
          if (evidence.length !== expectedEvidencePaths.length) {
            problems.push(`C16 closure reconciliation binds ${evidence.length} evidence artifacts, expected 3`);
          }

          if (closure.generated_from?.source_sha !== receipt.source_sha) {
            problems.push('C16 closure reconciliation is not bound to the source receipt SHA');
          }
          for (const [field, expected] of [
            ['lockfile_sha256', derived.meta.lockfileSha256],
            ['descriptor_sha256', derived.meta.descriptorSha256],
            ['generator_sha256', derived.meta.generatorSha256],
          ]) {
            if (closure.generated_from?.[field] !== expected) {
              problems.push(`C16 closure reconciliation ${field} does not equal the source-derived value`);
            }
          }
          const wantedTargets = Object.keys(derived.reports).sort();
          const deliveredTargets = Object.keys(closure.targets ?? {}).sort();
          if (jsonCanonical(deliveredTargets) !== jsonCanonical(wantedTargets)) {
            problems.push(`C16 closure reconciliation target set [${deliveredTargets.join(', ')}] is not source-derived [${wantedTargets.join(', ')}]`);
          }
          const targetFields = [
            'target', 'sbom_file', 'sbom_sha256', 'sbom_bytes', 'serial_number', 'subject_ref',
            'counts', 'scope_distribution', 'workspace_identities', 'platform_exclusions',
            'governed_exclusions_applied', 'reconciliation',
          ];
          for (const target of wantedTargets) {
            const got = closure.targets?.[target];
            const expected = derived.reports[target];
            if (got === undefined) continue;
            for (const field of targetFields) {
              if (jsonCanonical(got[field]) !== jsonCanonical(expected[field])) {
                problems.push(`C16 closure reconciliation ${target}.${field} does not equal the source-derived value`);
              }
            }
          }
          if (!Array.isArray(closure.vulnerable_residuals) || closure.vulnerable_residuals.length !== 0) {
            problems.push('C16 closure reconciliation records vulnerable residuals');
          }
          if (!Array.isArray(closure.governed_exclusions?.rejected)
            || closure.governed_exclusions.rejected.length !== 0) {
            problems.push('C16 closure reconciliation records rejected governed exclusions');
          }
          if (!Array.isArray(closure.governed_exclusions?.cardinality_problems)
            || closure.governed_exclusions.cardinality_problems.length !== 0) {
            problems.push('C16 closure reconciliation records exclusion cardinality problems');
          }
          notes.push(`c16_closure_targets=${wantedTargets.join(',')} source_derived=true`);
        }
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
            ['licence/bundled-components.json', 'bundled-components.json'],
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
            const regeneratedManifestPath = join(regen, 'c17-manifest.json');
            const deliveredManifestBytes = readFileSync(deliveredManifestPath);
            const regeneratedManifestBytes = readFileSync(regeneratedManifestPath);
            if (!deliveredManifestBytes.equals(regeneratedManifestBytes)) {
              problems.push(
                `'licence/c17-manifest.json' is NOT what this checkout regenerates: delivered `
                + `${deliveredManifestBytes.byteLength} bytes / ${sha256(deliveredManifestBytes)}, `
                + `regenerated ${regeneratedManifestBytes.byteLength} bytes / `
                + `${sha256(regeneratedManifestBytes)}`,
              );
            }
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
            const rm = JSON.parse(regeneratedManifestBytes.toString('utf8'));
            for (const [label, actual, expected] of [
              ['mode', receipt.mode, rm.mode],
              ['c17_result', receipt.c17_result, rm.result],
              ['c17_as_of', receipt.c17_as_of, rm.generated_from?.as_of],
              ['schema', receipt.schema, rm.schema],
              ['sboms', receipt.sboms, rm.sboms],
              ['final_source_posture', receipt.final_source_posture, rm.final_source_posture],
            ]) {
              if (jsonCanonical(actual) !== jsonCanonical(expected)) {
                problems.push(
                  `source receipt ${label} differs from the independently regenerated C17 manifest`,
                );
              }
            }
            if (receipt.source_sha !== rm.generated_from?.source_sha) {
              problems.push('source receipt source_sha differs from the independently regenerated C17 manifest');
            }
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
            const text = readFileSync(rr, 'utf8');
            const wantResult = JSON.parse(readFileSync(join(regen, 'c17-manifest.json'), 'utf8')).result;
            const expectedResult = `C17 ${wantResult} at ${receipt.source_sha}\n`;
            if (text !== expectedResult) {
              problems.push(`receipt/RESULT.txt is not byte-identical to ${JSON.stringify(expectedResult)}; got ${JSON.stringify(text)}`);
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
      ['governance/bundled-components.json', 'scripts/gate/bundled-components.json'],
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

    // ── HOSTED-RUN RECEIPT — verified by scripts/gate/lib/hosted-run.mjs ─────
    //
    // The endpoint is CONSTRUCTED there from a code-owned repository and a strictly numeric run
    // id; nothing the receipt says can choose which server is asked. See that module's header for
    // the forgery this replaces.
    const runPath = join(tmp, 'receipt/run-receipt.json');
    if (!existsSync(runPath)) {
      problems.push('archive has no run receipt');
    } else {
      const run = JSON.parse(readFileSync(runPath, 'utf8'));
      const hosted = await verifyHostedRun(run, {
        expectedHeadSha: receipt?.source_sha,
        requireHosted: requireHosted || online,
        requireArtifact: online,
        expectedArtifactDigest: online ? sha256(readFileSync(zipPath)) : null,
        profile,
        level: online ? 'online' : 'offline',
        fetchImpl: online ? globalThis.fetch : (async () => { throw new Error('offline'); }),
        // Rate-limit credential only. It cannot influence WHICH endpoint is contacted: the URL
        // is constructed in hosted-run.mjs from a code-owned repository and a validated id.
        token: process.env.GITHUB_TOKEN ?? null,
      });
      problems.push(...hosted.problems);
      notes.push(...hosted.notes);
      if (!online && hosted.local !== true) {
        notes.push(
          `run_receipt=${run.repository}#${run.run_id} attempt ${run.run_attempt} job ${run.job} `
          + `(${profile} profile, offline: shape + SHA binding, no API call)`,
        );
      }
    }
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  return { ok: problems.length === 0, problems, notes };
}

async function main() {
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
    const r = await verify({
      zipPath: argOf(argv, '--zip'),
      root: argOf(argv, '--root') ?? ROOT,
      online: argv.includes('--online'),
      requireHosted: argv.includes('--require-hosted'),
      profile: argOf(argv, '--profile') ?? undefined,
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
    // top-level await is available in ESM; verification is async because it contacts the API.
    await main();
  } catch (e) {
    console.error(`=== C17 PACKAGER FAILED (uncaught) ===\n  ${e instanceof Error ? e.stack : e}`);
    process.exit(1);
  }
}
