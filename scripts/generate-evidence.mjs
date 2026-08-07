/**
 * Evidence package generator (Gate-2.1 delivery protocol).
 *
 * Everything under evidence/ is produced HERE, from the frozen source candidate,
 * so the package is reproducible and the reproduce instructions it prints are the
 * ones that were actually used. Evidence is never tracked in the source candidate:
 * this script runs AFTER the source SHA is frozen and its output is committed
 * separately.
 *
 * Usage: node scripts/generate-evidence.mjs <SOURCE_CANDIDATE_SHA>
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const sha = process.argv[2];
if (!sha || !/^[0-9a-f]{40}$/.test(sha)) {
  console.error('usage: node scripts/generate-evidence.mjs <40-hex SOURCE_CANDIDATE_SHA>');
  process.exit(1);
}
const git = (args, opts = {}) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, ...opts });

mkdirSync('evidence', { recursive: true });

// ---- 1. Per-file manifest of every TRACKED file at the frozen SHA -----------
// The reproduce command is emitted with the SHA and the path in the ONE place
// git expects them — `git show <sha>:<path>` — because a manifest whose
// instructions cannot be run is not evidence.
const files = git(['ls-tree', '-r', '--name-only', sha]).split('\n').filter((f) => f !== '');
const lines = [
  `# Per-file SHA-256 manifest of every TRACKED file at SOURCE_CANDIDATE_SHA=${sha}`,
  `# Files: ${files.length}`,
  '#',
  '# Reproduce ONE path P:',
  `#   git show ${sha}:P | shasum -a 256`,
  '#',
  '# Reproduce EVERY line of this manifest (from a clone of the bundle):',
  `#   git ls-tree -r --name-only ${sha} | while IFS= read -r p; do \\`,
  `#     printf '%s  %s\\n' "$(git show ${sha}:"$p" | shasum -a 256 | cut -d' ' -f1)" "$p"; \\`,
  '#   done',
];
for (const path of files) {
  const blob = execFileSync('git', ['show', `${sha}:${path}`], { maxBuffer: 512 * 1024 * 1024 });
  lines.push(`${createHash('sha256').update(blob).digest('hex')}  ${path}`);
}
writeFileSync('evidence/tracked-source-manifest.sha256', lines.join('\n') + '\n');

// ---- 2. Whole-tree digest (git archive is byte-stable for a given SHA) ------
const archive = execFileSync('git', ['archive', sha], { maxBuffer: 1024 * 1024 * 1024 });
const archiveDigest = createHash('sha256').update(archive).digest('hex');
writeFileSync(
  'evidence/tracked-source.sha256',
  `${archiveDigest}  git archive ${sha}\n` +
  `# Reproduce: git archive ${sha} | shasum -a 256\n`,
);

// ---- 3. Verifiable, CLONABLE git bundle of the SOURCE CANDIDATE ------------
// Two properties are required and they pull against each other:
//   * the bundle must CLONE cleanly — a bundle carrying only an arbitrary ref and
//     no HEAD produces an empty clone, which is a broken deliverable;
//   * it must contain the SOURCE candidate only — this file lives in the evidence
//     commit, so a bundle containing that commit could never record its own digest.
// A temporary BARE clone whose HEAD is the candidate satisfies both: the bundle
// gets a HEAD, and its history stops at the candidate.
const bundlePath = 'evidence/the-eye-source.bundle';
const tmpBare = join(tmpdir(), `eye-source-${sha.slice(0, 12)}.git`);
rmSync(tmpBare, { recursive: true, force: true });
rmSync(bundlePath, { force: true });
git(['update-ref', 'refs/heads/gate-source-candidate', sha]);
try {
  git(['clone', '--quiet', '--bare', '--single-branch', '--branch', 'gate-source-candidate', '.', tmpBare]);
  execFileSync('git', ['-C', tmpBare, 'bundle', 'create', resolve(bundlePath), '--all'], {
    encoding: 'utf8', maxBuffer: 512 * 1024 * 1024,
  });
} finally {
  rmSync(tmpBare, { recursive: true, force: true });
  git(['update-ref', '-d', 'refs/heads/gate-source-candidate']);
}
// Prove the deliverable actually clones onto the declared candidate.
const probe = join(tmpdir(), `eye-bundle-probe-${sha.slice(0, 12)}`);
rmSync(probe, { recursive: true, force: true });
execFileSync('git', ['clone', '--quiet', resolve(bundlePath), probe], { encoding: 'utf8' });
const clonedHead = execFileSync('git', ['-C', probe, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const clonedEvidence = execFileSync('git', ['-C', probe, 'ls-tree', '-r', '--name-only', 'HEAD'], {
  encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
}).split('\n').filter((f) => f.startsWith('evidence/')).length;
rmSync(probe, { recursive: true, force: true });
if (clonedHead !== sha) {
  console.error(`bundle self-check FAILED: a clone lands on ${clonedHead}, not ${sha}`);
  process.exit(1);
}
if (clonedEvidence !== 0) {
  console.error(`bundle self-check FAILED: ${clonedEvidence} evidence file(s) inside the source candidate`);
  process.exit(1);
}
const bundleDigest = createHash('sha256').update(readFileSync(bundlePath)).digest('hex');

// ---- 4. Git metadata -------------------------------------------------------
writeFileSync('evidence/git-metadata.txt', [
  `SOURCE_CANDIDATE_SHA: ${sha}`,
  '',
  '## git log --oneline -8',
  git(['log', '--oneline', '-8', sha]).trim(),
  '',
  '## git show --stat (source candidate)',
  git(['show', '--stat', '--format=%H%n%an%n%ad%n%s', sha]).trim(),
  '',
  '## tracked file count',
  String(files.length),
  '',
  '## digests',
  `git archive ${sha} sha256: ${archiveDigest}`,
  `the-eye-source.bundle sha256: ${bundleDigest}`,
  '',
  '## bundle verification (git requires this to run inside a repository)',
  git(['bundle', 'verify', bundlePath]).trim(),
  '',
  '## bundle self-check',
  `a fresh clone of the bundle lands on ${sha} with 0 evidence files`,
].join('\n') + '\n');

// ---- 5. README with the commands that were actually used --------------------
writeFileSync('evidence/README.md', `# Phase 0 Gate-2.1 evidence

Generated by \`scripts/generate-evidence.mjs\` from the frozen source candidate.
Evidence is NOT tracked in the source candidate; it is committed separately.

    SOURCE_CANDIDATE_SHA = ${sha}

| File | What it is |
|---|---|
| \`the-eye-source.bundle\` | Verifiable git bundle of the complete history **through SOURCE_CANDIDATE_SHA** (clone and verify offline) |
| \`tracked-source.sha256\` | SHA-256 of \`git archive <SHA>\` (whole tracked tree) |
| \`tracked-source-manifest.sha256\` | SHA-256 per tracked file (${files.length} files) |
| \`git-metadata.txt\` | SHA, log, stat, digests, bundle verification |
| \`test-runs.txt\` | Raw output of every mandatory suite |
| \`clean-typecheck.txt\` | Clean-source typecheck with no build artifacts present |
| \`clean-checkout-transcript.txt\` | Isolated worktree + virgin volumes, end to end |
| \`db-paths.txt\` | BOTH database paths: forward upgrade of an existing 0001–0010 database (real pre-upgrade data, byte-identical audit hashes) and virgin install of 0001–0012 — full suites on each |
| \`authority-boundary.txt\` | Live grant/RLS/capability catalog at the frozen SHA |
| \`GATE2_1_SHAS.txt\` | Both declared SHAs and how to verify them |
| \`supply-chain/\` | CycloneDX 1.6 SBOM, licence inventories, reconciliation |

## Verify the source

\`\`\`bash
# git bundle verify must be run from inside any git repository (a git requirement):
git bundle verify evidence/the-eye-source.bundle
# The clone lands directly on the candidate — no checkout needed:
git clone evidence/the-eye-source.bundle verify && cd verify
git rev-parse HEAD                      # = ${sha}
git archive ${sha} | shasum -a 256      # must equal tracked-source.sha256
ls evidence 2>/dev/null || echo "no evidence in the source candidate (correct)"
\`\`\`

The bundle stops at \`SOURCE_CANDIDATE_SHA\`. The evidence-attestation commit is the
commit that contains this package; its SHA is reported in the delivery message, and
\`git diff --name-only <source> <attestation>\` lists \`evidence/\` paths only.

## Verify one file from the manifest

\`\`\`bash
git show ${sha}:apps/api/migrations/0011_authority_boundary_closure.sql | shasum -a 256
\`\`\`

## Verify the whole manifest

\`\`\`bash
git ls-tree -r --name-only ${sha} | while IFS= read -r p; do
  printf '%s  %s\\n' "$(git show ${sha}:"$p" | shasum -a 256 | cut -d' ' -f1)" "$p"
done | diff - <(grep -v '^#' evidence/tracked-source-manifest.sha256)
\`\`\`
`);

console.log(`evidence: manifest ${files.length} files`);
console.log(`evidence: archive sha256 ${archiveDigest}`);
console.log(`evidence: bundle  sha256 ${bundleDigest}`);
if (!existsSync(join('evidence', 'supply-chain', 'sbom.cdx.json'))) {
  console.warn('evidence: NOTE supply-chain/ not present — run scripts/generate-sbom.mjs');
}
