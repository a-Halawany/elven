#!/usr/bin/env node
// The Eye — APPLICATION-ARTIFACT IDENTITY for the backup/restore path (CP-4/5).
//
// The reviewer's finding (2026-09-10): the drill reused `apps/api/dist` because
// "no source file is newer than the newest dist file". File timestamps do not
// prove which source and which dependencies produced that build, and restore.sh
// started `apps/api/dist/main.js` without verifying any recorded digest — so the
// restore receipt was not bound to an identified artifact.
//
// This module establishes that identity:
//
//   build   — export the COMMITTED tree at a git SHA (git archive; the worktree is
//             never used and never written to), install with the committed lockfile
//             (`pnpm install --frozen-lockfile`), build the API and its workspace
//             dependencies (`pnpm --filter @eye/api... build` — @eye/api alone cannot
//             compile, it needs packages/contracts), then digest the produced
//             apps/api/dist tree and record everything that determined it.
//   digest  — the deterministic digest of a dist tree, on its own.
//   --verify <manifest> — re-compute the digest of a dist tree and compare it with
//             the one recorded in a bundle MANIFEST.json (.build) or a
//             BUILD_IDENTITY.json, reporting `identical` or `divergent` and, when
//             divergent, exactly which relative paths differ.
//
// THE DIGEST. Sorted relative POSIX paths, one `"<sha256>  <path>"` line per file,
// joined with "\n" and terminated, hashed once with sha256. It depends only on the
// file contents and their paths: not on mtimes, not on inode order, not on the
// directory the tree happens to live in. Two trees with the same digest have the
// same bytes at the same paths.
//
// This script writes ONLY under the build root it is given, and reads the
// repository only through `git archive` (a read of the object store).
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync, existsSync, lstatSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

const FORMAT = 'eye-build-identity/1';
const DIGEST_ALGORITHM = 'sha256 over sorted "<sha256 of file>  <relative posix path>" lines';

// ─────────────────────────────────────────────────────────────────── helpers
const die = (m) => { process.stderr.write(`build-identity: ${m}\n`); process.exit(2); };

function run(argv, opts = {}) {
  const started = Date.now();
  const r = spawnSync(argv[0], argv.slice(1), { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...opts });
  const seconds = Math.round((Date.now() - started) / 100) / 10;
  return { argv, seconds, status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '', error: r.error };
}
function must(argv, opts = {}) {
  const r = run(argv, opts);
  if (r.status !== 0) {
    process.stderr.write(r.stdout.slice(-4000));
    process.stderr.write(r.stderr.slice(-4000));
    die(`${argv.join(' ')} failed (exit ${r.status ?? 'signal'})`);
  }
  return r;
}
const sha256File = (p) => createHash('sha256').update(readFileSync(p)).digest('hex');
const nowUtc = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

/** Every regular file under `root`, as relative POSIX paths, sorted. Symlinks are recorded as such and refused. */
function walk(root) {
  const out = [];
  const stack = [root];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const p = join(dir, e.name);
      if (e.isSymbolicLink()) die(`${p} is a symlink; a build artifact tree must not contain one`);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile()) out.push(relative(root, p).split(sep).join('/'));
    }
  }
  return out.sort();
}

/** The deterministic digest of a dist tree: { digest, files, bytes, entries }. */
export function digestTree(root) {
  const abs = resolve(root);
  if (!existsSync(abs) || !statSync(abs).isDirectory()) die(`${abs} is not a directory`);
  const paths = walk(abs);
  const entries = {};
  let bytes = 0;
  const lines = [];
  for (const rel of paths) {
    const p = join(abs, rel);
    const h = sha256File(p);
    entries[rel] = h;
    bytes += lstatSync(p).size;
    lines.push(`${h}  ${rel}`);
  }
  return {
    digest: `sha256:${createHash('sha256').update(`${lines.join('\n')}\n`).digest('hex')}`,
    algorithm: DIGEST_ALGORITHM,
    files: paths.length,
    bytes,
    entries,
  };
}

/** What differs between two entry maps, for the divergence report. */
function diffEntries(a, b) {
  const added = [], removed = [], changed = [];
  for (const k of Object.keys(b)) { if (a[k] === undefined) added.push(k); else if (a[k] !== b[k]) changed.push(k); }
  for (const k of Object.keys(a)) { if (b[k] === undefined) removed.push(k); }
  return { added: added.sort(), removed: removed.sort(), changed: changed.sort() };
}

const arg = (argv, name, fallback = null) => {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
};

// ───────────────────────────────────────────────────────────────────── build
function cmdBuild(argv) {
  const repo = resolve(arg(argv, '--repo') ?? die('--repo is required'));
  const root = resolve(arg(argv, '--root') ?? die('--root is required (a build root that this script creates)'));
  const out = arg(argv, '--out', join(root, 'BUILD_IDENTITY.json'));

  const head = must(['git', '-C', repo, 'rev-parse', 'HEAD']).stdout.trim();
  const sha = arg(argv, '--sha', head);
  const full = must(['git', '-C', repo, 'rev-parse', sha]).stdout.trim();
  const branch = run(['git', '-C', repo, 'branch', '--show-current']).stdout.trim();
  // The worktree's cleanliness is recorded, never assumed: the build is taken from
  // the COMMITTED tree, so an uncommitted change is a fact about the source of
  // truth that the operator has to see, not a reason to build something else.
  const porcelain = run(['git', '-C', repo, 'status', '--porcelain']).stdout;
  const changes = porcelain.split('\n').filter((l) => l.trim() !== '');

  if (argv.includes('--root-precreated')) {
    // The caller CREATED the root itself (an atomic plain mkdir, recorded as its own
    // only once it succeeded — backup.sh, R1). What is verified here is that the
    // directory is exactly what such a creation produces: a real directory, not a
    // symlink, owned by this user, and EMPTY. Anything else is not a fresh root and
    // is refused without being written to.
    let st;
    try { st = lstatSync(root); } catch { die(`${root} does not exist (--root-precreated names a directory the caller created)`); }
    if (st.isSymbolicLink()) die(`${root} is a symlink; a build root must be a directory the caller created`);
    if (!st.isDirectory()) die(`${root} is not a directory`);
    if (typeof process.getuid === 'function' && st.uid !== process.getuid()) die(`${root} is not owned by this user (uid ${st.uid})`);
    if (readdirSync(root).length !== 0) die(`${root} is not empty (a fresh build root is required; nothing was written)`);
  } else {
    if (existsSync(root)) die(`${root} already exists (a fresh build root is required)`);
    mkdirSync(root, { recursive: false, mode: 0o700 });
  }
  const src = join(root, 'src');
  mkdirSync(src, { mode: 0o700 });

  const startedAt = nowUtc();
  const t0 = Date.now();
  const commands = [];

  // 1. the committed tree at the SHA — never the worktree
  const archive = must(['sh', '-c',
    `git -C ${JSON.stringify(repo)} archive ${JSON.stringify(full)} | tar -x -C ${JSON.stringify(src)}`]);
  commands.push({ label: 'git archive <sha> | tar -x', argv: ['git', 'archive', full], seconds: archive.seconds, exit: 0 });

  const lockfile = join(src, 'pnpm-lock.yaml');
  if (!existsSync(lockfile)) die(`the exported tree has no pnpm-lock.yaml (${lockfile})`);
  const lockSha = sha256File(lockfile);
  const lockBytes = lstatSync(lockfile).size;

  // 2. the committed lockfile, frozen
  const install = must(['pnpm', 'install', '--frozen-lockfile'], { cwd: src });
  commands.push({ label: 'pnpm install --frozen-lockfile', argv: ['pnpm', 'install', '--frozen-lockfile'], seconds: install.seconds, exit: 0 });

  // 3. the API and the workspace packages it needs (@eye/api alone does not compile)
  const filter = arg(argv, '--filter', '@eye/api...');
  const build = must(['pnpm', '--filter', filter, 'build'], { cwd: src });
  commands.push({ label: `pnpm --filter ${filter} build`, argv: ['pnpm', '--filter', filter, 'build'], seconds: build.seconds, exit: 0 });

  const distPath = join(src, 'apps', 'api', 'dist');
  if (!existsSync(join(distPath, 'main.js'))) die(`the build produced no ${join(distPath, 'main.js')}`);
  const tree = digestTree(distPath);
  const endedAt = nowUtc();

  const node = process.version;
  const pnpm = run(['pnpm', '--version']).stdout.trim();
  // The migration ledger of the COMMITTED tree at the SHA: what schema this artifact
  // was written against. A restore compares it with the restored database's
  // `schema_migrations` so an artifact is never started over a schema it predates.
  const migrations = must(['git', '-C', repo, 'ls-tree', '--name-only', full, 'apps/api/migrations/']).stdout
    .split('\n').map((l) => l.trim().replace(/^apps\/api\/migrations\//, '')).filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort();

  const identity = {
    format: FORMAT,
    git: {
      sha: full,
      requested: sha === full ? null : sha,
      head_at_build: head,
      branch: branch === '' ? null : branch,
      worktree_clean: changes.length === 0,
      worktree_changes: changes,
      source: 'git archive <sha> (the committed tree; the worktree is never built and never written to)',
    },
    lockfile: { path: 'pnpm-lock.yaml', sha256: lockSha, bytes: lockBytes, frozen: true },
    migrations: { count: migrations.length, last: migrations[migrations.length - 1] ?? null, source: 'git ls-tree <sha> apps/api/migrations/' },
    toolchain: { node, pnpm, platform: process.platform, arch: process.arch },
    build: {
      started_at_utc: startedAt,
      ended_at_utc: endedAt,
      duration_seconds: Math.round((Date.now() - t0) / 100) / 10,
      root,
      source_root: src,
      dist_path: distPath,
      node_modules: join(src, 'apps', 'api', 'node_modules'),
      commands,
    },
    dist: { digest: tree.digest, algorithm: tree.algorithm, files: tree.files, bytes: tree.bytes },
    // The per-file map lives beside the identity, not inside it: the manifest keeps
    // the one digest, the map is what makes a divergence explainable.
    dist_entries_file: 'DIST_ENTRIES.json',
  };
  writeFileSync(out, `${JSON.stringify(identity, null, 2)}\n`, { mode: 0o600 });
  writeFileSync(join(root, 'DIST_ENTRIES.json'), `${JSON.stringify(tree.entries, null, 0)}\n`, { mode: 0o600 });
  process.stdout.write(`${JSON.stringify(identity)}\n`);
}

// ──────────────────────────────────────────────────────────────────── digest
function cmdDigest(argv) {
  const dist = arg(argv, '--dist') ?? die('--dist is required');
  const t = digestTree(dist);
  process.stdout.write(`${JSON.stringify({ dist_path: resolve(dist), digest: t.digest, algorithm: t.algorithm, files: t.files, bytes: t.bytes })}\n`);
}

// ──────────────────────────────────────────────────────────────────── verify
// --verify <manifest.json | BUILD_IDENTITY.json> [--dist <dir>] [--entries <file>]
//   exit 0 identical, 1 divergent, 2 usage/IO
function cmdVerify(argv) {
  const manifestPath = arg(argv, '--verify') ?? die('--verify <manifest> is required');
  const doc = JSON.parse(readFileSync(manifestPath, 'utf8'));
  // A BUILD_IDENTITY.json is the identity itself (and has its own `.build` section);
  // a bundle MANIFEST.json carries the whole identity under `.build`.
  const identity = doc.format === FORMAT ? doc : (doc.build ?? doc);
  const recorded = identity?.dist?.digest;
  if (typeof recorded !== 'string') die(`${manifestPath} records no build.dist.digest`);
  const dist = arg(argv, '--dist', identity?.build?.dist_path);
  if (typeof dist !== 'string') die('no dist tree to verify: pass --dist (the manifest records no build.dist_path)');
  const got = digestTree(dist);
  const identical = got.digest === recorded;
  const report = {
    verdict: identical ? 'identical' : 'divergent',
    dist_path: resolve(dist),
    recorded_digest: recorded,
    computed_digest: got.digest,
    recorded_files: identity?.dist?.files ?? null,
    computed_files: got.files,
    recorded_git_sha: identity?.git?.sha ?? null,
  };
  if (!identical) {
    const entriesFile = arg(argv, '--entries', null);
    if (entriesFile !== null && existsSync(entriesFile)) {
      const d = diffEntries(JSON.parse(readFileSync(entriesFile, 'utf8')), got.entries);
      report.difference = {
        added: d.added.length, removed: d.removed.length, changed: d.changed.length,
        sample: { added: d.added.slice(0, 10), removed: d.removed.slice(0, 10), changed: d.changed.slice(0, 10) },
      };
    }
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
  process.exit(identical ? 0 : 1);
}

const argv = process.argv.slice(2);
if (argv.includes('--verify')) cmdVerify(argv);
else if (argv[0] === 'build') cmdBuild(argv);
else if (argv[0] === 'digest') cmdDigest(argv);
else {
  process.stderr.write(
    'usage:\n' +
    '  build-identity.mjs build  --repo <repo> --root <fresh build root> [--root-precreated] [--sha <sha>] [--filter <pnpm filter>] [--out <file>]\n' +
    '  build-identity.mjs digest --dist <dir>\n' +
    '  build-identity.mjs --verify <MANIFEST.json|BUILD_IDENTITY.json> [--dist <dir>] [--entries <DIST_ENTRIES.json>]\n');
  process.exit(2);
}
