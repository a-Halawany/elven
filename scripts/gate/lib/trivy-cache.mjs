/**
 * C16-R2 — TRIVY CACHE ACQUISITION, PROVENANCE CAPTURE AND FAIL-CLOSED ENFORCEMENT.
 *
 * ── THE DEFECT THIS FIXES (diagnosed from hosted run 31532067899) ────────────────
 * CI prefetched only the vulnerability database (`trivy image --download-db-only`) while
 * the runner's enforcement required a misconfiguration **checks-bundle digest** before
 * the first scan. trivy 0.73 has no `--download-check-only`: the checks bundle is
 * fetched LAZILY by the first misconfig scan. So on a cold runner the bundle was absent,
 * `trivy version --format json` omitted `CheckBundle` entirely, and the gate failed with
 * "check bundle reports no digest". It passed on my machine only because an earlier
 * `trivy fs --scanners misconfig` had already warmed the default cache — the enforcement
 * demanded an input the workflow never acquired.
 *
 * Two further facts, established by executable probe rather than assumption:
 *   * `trivy version --format json` reports a section ONLY when that artifact exists in
 *     the cache it is reading. With an empty `--cache-dir` it prints `{"Version": "…"}`
 *     and nothing else. Any provenance read must therefore use the SAME cache directory
 *     as the scans, or it describes a different cache than the one that produced the
 *     findings.
 *   * The vuln DB lands in `<cache>/db/{metadata.json,trivy.db}` and the checks bundle in
 *     `<cache>/policy/metadata.json`. trivy 0.73 records an OCI digest for the checks
 *     bundle but NOT for the vuln DB, so the DB is bound by the byte digest of its cache
 *     artifacts. That is an upstream limitation, recorded rather than papered over.
 *
 * ── CONTRACT ─────────────────────────────────────────────────────────────────────
 * `acquire()` warms an explicitly isolated cache with BOTH artifacts. `capture()` reads
 * provenance from that same cache. `enforce()` fails closed on anything missing,
 * malformed or stale. `fingerprint()` supports before/after equality, so the
 * authoritative scans can be proven to have run with `--skip-db-update
 * --skip-check-update` against exactly the captured cache and to have changed nothing.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, statSync, mkdirSync, mkdtempSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Cache artifact locations, relative to an isolated trivy cache directory. */
export const cachePaths = (cacheDir) => ({
  cacheDir,
  dbDir: join(cacheDir, 'db'),
  dbMetadata: join(cacheDir, 'db', 'metadata.json'),
  dbArtifact: join(cacheDir, 'db', 'trivy.db'),
  checksDir: join(cacheDir, 'policy'),
  checksMetadata: join(cacheDir, 'policy', 'metadata.json'),
});

/** Flags every AUTHORITATIVE scan must carry: use the captured cache, update nothing. */
export const frozenCacheArgs = (cacheDir) => [
  '--cache-dir', cacheDir, '--skip-db-update', '--skip-check-update',
];

/**
 * Warm an isolated cache with BOTH required artifacts.
 *
 * The checks bundle has no dedicated download command, so it is acquired by running one
 * throwaway misconfig scan over an empty directory. That is the only supported way to
 * populate it, and doing it here — once, explicitly — is what makes the authoritative
 * scans able to run with updates disabled.
 */
export function acquire({ cacheDir, timeout = '15m', log = () => {}, outDir = null }) {
  mkdirSync(cacheDir, { recursive: true });
  const steps = [];

  // COMPLETE capture, not a four-line tail: an acquisition that half-failed is exactly
  // the case a reviewer needs the raw bytes for. Written to disk when an output directory
  // is supplied, and digested either way.
  const run = (label, argv, id) => {
    const started = new Date().toISOString();
    const res = spawnSync(argv[0], argv.slice(1), {
      encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
      env: { ...process.env, TRIVY_CACHE_DIR: cacheDir },
    });
    const stdout = res.stdout ?? '';
    const stderr = res.stderr ?? '';
    if (outDir !== null) {
      writeFileSync(join(outDir, `${id}.stdout.txt`), stdout);
      writeFileSync(join(outDir, `${id}.stderr.txt`), stderr);
    }
    const record = {
      label,
      id,
      argv,
      started_at: started,
      finished_at: new Date().toISOString(),
      exit_code: res.status,
      signal: res.signal ?? null,
      stdout_bytes: Buffer.byteLength(stdout),
      stderr_bytes: Buffer.byteLength(stderr),
      stdout_sha256: sha256(stdout),
      stderr_sha256: sha256(stderr),
      stdout_file: outDir === null ? null : `${id}.stdout.txt`,
      stderr_file: outDir === null ? null : `${id}.stderr.txt`,
      stderr_tail: stderr.split('\n').filter((l) => l.trim() !== '').slice(-4),
    };
    steps.push(record);
    log(`  [${res.status === 0 ? 'ok' : `exit ${res.status}`}] ${label}`);
    return record;
  };

  const db = run('acquire vulnerability database', [
    'trivy', '--cache-dir', cacheDir, '--timeout', timeout,
    'image', '--download-db-only', '--no-progress',
  ], 'trivy-acquire-db');

  // Empty directory: the scan itself must find nothing, so the only effect is the
  // bundle download.
  const probeDir = mkdtempSync(join(tmpdir(), 'eye-trivy-checkwarm-'));
  const checks = run('acquire misconfiguration checks bundle', [
    'trivy', '--cache-dir', cacheDir, '--timeout', timeout,
    'fs', '--scanners', 'misconfig', '--no-progress', '--format', 'json', probeDir,
  ], 'trivy-acquire-checks');

  // A NONZERO acquisition must fail even when an older cache already exists: silently
  // continuing would scan against whatever stale data happened to be present, which is
  // precisely the condition the freshness enforcement exists to prevent.
  const problems = [];
  if (db.exit_code !== 0) {
    problems.push(
      `vulnerability-database acquisition exited ${db.exit_code}; a scan must not proceed ` +
      'against a cache whose refresh failed, even if an older cache is present',
    );
  }
  if (checks.exit_code !== 0) {
    problems.push(
      `checks-bundle acquisition exited ${checks.exit_code}; a scan must not proceed against ` +
      'a cache whose refresh failed, even if an older cache is present',
    );
  }
  return {
    cacheDir, steps, problems,
    db_exit: db.exit_code, checks_exit: checks.exit_code,
  };
}

/** Read a JSON cache metadata file, returning its parsed content AND byte digest. */
function readMetadata(path) {
  if (!existsSync(path)) return { present: false, path, error: 'file does not exist' };
  const raw = readFileSync(path);
  let parsed = null;
  let error = null;
  try {
    parsed = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    error = `malformed JSON: ${e instanceof Error ? e.message.slice(0, 120) : String(e)}`;
  }
  return {
    present: true, path, parsed, error,
    byte_sha256: sha256(raw), bytes: raw.byteLength,
  };
}

/** Resolved path plus SHA-256 of an executable on PATH. */
export function binaryProvenance(name) {
  const which = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
  const path = which.status === 0 ? which.stdout.trim() : null;
  if (path === null) return { name, resolved_path: null, sha256: null, bytes: null };
  try {
    const buf = readFileSync(path);
    return { name, resolved_path: path, sha256: sha256(buf), bytes: buf.byteLength };
  } catch (e) {
    return {
      name, resolved_path: path, sha256: null, bytes: null,
      error: e instanceof Error ? e.message.slice(0, 120) : String(e),
    };
  }
}

/**
 * Capture everything that identifies the scanner and the data it will match against.
 * Read from the SAME cache the scans will use — reading a different cache describes a
 * different scan.
 */
export function capture({ cacheDir, nowIso, platform, pins }) {
  const p = cachePaths(cacheDir);
  const now = new Date(nowIso);

  let versionRaw = null;
  let versionParsed = null;
  let versionError = null;
  try {
    versionRaw = execFileSync('trivy', ['--cache-dir', cacheDir, 'version', '--format', 'json'], {
      encoding: 'utf8', env: { ...process.env, TRIVY_CACHE_DIR: cacheDir },
    });
    versionParsed = JSON.parse(versionRaw);
  } catch (e) {
    versionError = e instanceof Error ? e.message.slice(0, 200) : String(e);
  }

  const dbMeta = readMetadata(p.dbMetadata);
  const checksMeta = readMetadata(p.checksMetadata);

  const dbArtifact = existsSync(p.dbArtifact)
    ? (() => {
      const st = statSync(p.dbArtifact);
      return { present: true, bytes: st.size, sha256: sha256(readFileSync(p.dbArtifact)) };
    })()
    : { present: false };

  const ageHours = (iso) => {
    if (typeof iso !== 'string' || Number.isNaN(Date.parse(iso))) return null;
    return Math.round(((now.getTime() - Date.parse(iso)) / 3_600_000) * 10) / 10;
  };

  const dbParsed = dbMeta.parsed ?? {};
  const checksParsed = checksMeta.parsed ?? {};

  return {
    captured_at: nowIso,
    target_platform: platform,
    cache_dir: cacheDir,
    // What executed the scan.
    executable: binaryProvenance('trivy'),
    installation_provenance: {
      expected_version: pins?.tools?.trivy?.version ?? null,
      artifact_url: pins?.tools?.trivy?.artifacts?.[platformKey(platform)]?.url ?? null,
      artifact_sha256_expected: pins?.tools?.trivy?.artifacts?.[platformKey(platform)]?.sha256 ?? null,
      checksum_source: pins?.checksum_sources?.trivy ?? null,
    },
    reported_version: versionParsed?.Version ?? null,
    version_probe_raw_sha256: versionRaw === null ? null : sha256(versionRaw),
    version_probe_error: versionError,
    // What it will match against.
    vulnerability_db: {
      metadata_present: dbMeta.present,
      metadata_error: dbMeta.error ?? null,
      metadata_byte_sha256: dbMeta.byte_sha256 ?? null,
      schema_version: dbParsed.Version ?? null,
      built_at: dbParsed.UpdatedAt ?? null,
      next_update_due: dbParsed.NextUpdate ?? null,
      downloaded_at: dbParsed.DownloadedAt ?? null,
      age_hours_at_scan: ageHours(dbParsed.UpdatedAt),
      past_next_update_at_scan: typeof dbParsed.NextUpdate === 'string' &&
        !Number.isNaN(Date.parse(dbParsed.NextUpdate))
        ? now > new Date(dbParsed.NextUpdate)
        : null,
      artifact: dbArtifact,
      repository: pins?.vulnerability_database?.db_repository ?? null,
      oci_digest: null,
      oci_digest_note:
        'trivy 0.73.0 does not record an OCI digest for the vulnerability database; ' +
        'identity is bound by metadata_byte_sha256 + artifact.sha256 instead',
    },
    checks_bundle: {
      metadata_present: checksMeta.present,
      metadata_error: checksMeta.error ?? null,
      metadata_byte_sha256: checksMeta.byte_sha256 ?? null,
      oci_digest: checksParsed.Digest ?? null,
      major_version: checksParsed.MajorVersion ?? null,
      downloaded_at: checksParsed.DownloadedAt ?? null,
      age_hours_at_scan: ageHours(checksParsed.DownloadedAt),
      repository: pins?.vulnerability_database?.checks_bundle_repository ?? null,
      // The same digest as reported by the tool, so the two must agree.
      reported_by_tool: versionParsed?.CheckBundle?.Digest ?? null,
    },
    freshness_window_hours: pins?.vulnerability_database?.max_age_hours ?? 24,
  };
}

function platformKey(platform) {
  return String(platform).replace('linux/amd64', 'linux-x64').replace('/', '-');
}

/**
 * FAIL CLOSED. Every condition here makes the captured provenance unusable as evidence,
 * so each returns a blocking problem rather than a warning.
 */
export function enforce(prov, { expectedVersion, expectedBinarySha256 = null } = {}) {
  const problems = [];
  const maxAge = prov.freshness_window_hours;

  if (prov.version_probe_error !== null) {
    problems.push(`trivy version probe failed: ${prov.version_probe_error}`);
  }
  if (expectedVersion !== undefined && prov.reported_version !== expectedVersion) {
    problems.push(`trivy reports version ${JSON.stringify(prov.reported_version)}, expected ${expectedVersion}`);
  }
  if (prov.executable.resolved_path === null) {
    problems.push('trivy executable could not be resolved on PATH');
  } else if (prov.executable.sha256 === null) {
    problems.push(`trivy executable at ${prov.executable.resolved_path} could not be digested`);
  } else if (expectedBinarySha256 !== null && prov.executable.sha256 !== expectedBinarySha256) {
    problems.push(
      `trivy executable digest ${prov.executable.sha256} does not match the trusted ` +
      `value ${expectedBinarySha256}`,
    );
  }

  // ── vulnerability database ──
  const db = prov.vulnerability_db;
  if (!db.metadata_present) {
    problems.push(
      `vulnerability database metadata is absent from the captured cache ` +
      `(${prov.cache_dir}/db/metadata.json); a scan against no database finds nothing`,
    );
  } else if (db.metadata_error !== null) {
    problems.push(`vulnerability database metadata is malformed: ${db.metadata_error}`);
  } else {
    if (db.schema_version === null) problems.push('vulnerability database reports no schema version');
    if (db.built_at === null) problems.push('vulnerability database reports no build time (UpdatedAt)');
    if (db.next_update_due === null) {
      problems.push('vulnerability database reports no NextUpdate; freshness cannot be established');
    }
    if (db.age_hours_at_scan === null) {
      problems.push('vulnerability database age could not be computed');
    } else if (db.age_hours_at_scan < 0) {
      problems.push(
        `vulnerability database reports a negative age (${db.age_hours_at_scan}h); the host ` +
        'clock and the database disagree, so freshness cannot be established',
      );
    } else if (db.age_hours_at_scan > maxAge) {
      problems.push(
        `vulnerability database is ${db.age_hours_at_scan}h old, beyond the permitted ${maxAge}h window`,
      );
    }
    if (db.past_next_update_at_scan === true) {
      problems.push(
        `vulnerability database is past its next-update time (${db.next_update_due}); a newer ` +
        'database was expected before this scan',
      );
    }
  }
  if (!db.artifact.present) {
    problems.push(`vulnerability database artifact is missing from the cache (${prov.cache_dir}/db/trivy.db)`);
  } else if (db.artifact.sha256 === null) {
    problems.push('vulnerability database artifact could not be digested');
  }

  // ── misconfiguration checks bundle ──
  const cb = prov.checks_bundle;
  if (!cb.metadata_present) {
    problems.push(
      `checks-bundle metadata is absent from the captured cache (${prov.cache_dir}/policy/metadata.json). ` +
      'trivy has no --download-check-only; the bundle must be acquired by running one ' +
      'misconfig scan before the authoritative scans',
    );
  } else if (cb.metadata_error !== null) {
    problems.push(`checks-bundle metadata is malformed: ${cb.metadata_error}`);
  } else {
    if (cb.oci_digest === null) problems.push('checks bundle reports no OCI digest');
    if (cb.major_version === null) problems.push('checks bundle reports no major version');
    if (cb.downloaded_at === null) problems.push('checks bundle reports no download timestamp');
    if (cb.age_hours_at_scan !== null && cb.age_hours_at_scan < 0) {
      problems.push(`checks bundle reports a negative age (${cb.age_hours_at_scan}h)`);
    }
  }
  // The tool's own report and the cache file must agree, or one of them is stale.
  if (cb.oci_digest !== null && cb.reported_by_tool !== null &&
      cb.oci_digest !== cb.reported_by_tool) {
    problems.push(
      `checks-bundle digest disagreement: cache says ${cb.oci_digest}, tool reports ` +
      `${cb.reported_by_tool}`,
    );
  }
  if (cb.oci_digest !== null && cb.reported_by_tool === null) {
    problems.push(
      'trivy does not report a checks bundle even though the cache contains one; the tool ' +
      'and the captured cache disagree',
    );
  }

  return problems;
}

/**
 * A digest over the cache artifacts that must not change while the authoritative scans
 * run. Compared before and after, this proves the scans used the captured cache and
 * silently re-downloaded nothing.
 */
export function fingerprint(cacheDir) {
  const p = cachePaths(cacheDir);
  const entries = [];
  for (const [label, path] of [
    ['db/metadata.json', p.dbMetadata],
    ['db/trivy.db', p.dbArtifact],
    ['policy/metadata.json', p.checksMetadata],
  ]) {
    if (!existsSync(path)) {
      entries.push({ path: label, present: false });
      continue;
    }
    const st = statSync(path);
    entries.push({ path: label, present: true, bytes: st.size, sha256: sha256(readFileSync(path)) });
  }

  // BYTE-LEVEL checks-bundle manifest. Counting files and summing sizes made an
  // equal-length modification invisible: swap one rego check for different bytes of the
  // same length and the old fingerprint was identical. Every file is now digested
  // individually and the sorted manifest is hashed.
  const checksManifest = fileManifest(join(p.checksDir, 'content'), 'policy/content');
  const combined = sha256(JSON.stringify({ entries, checksManifest: checksManifest.files }));
  return {
    digest: combined,
    entries,
    checks_content: {
      files: checksManifest.files.length,
      bytes: checksManifest.files.reduce((a, f) => a + f.bytes, 0),
      manifest_sha256: sha256(JSON.stringify(checksManifest.files)),
    },
    // Retained in full so a reviewer can diff two runs file by file.
    checks_manifest: checksManifest.files,
  };
}

/**
 * A deterministic recursive manifest: every file's cache-relative path, size and SHA-256,
 * sorted by path so the result never depends on directory-read order.
 */
export function fileManifest(dir, prefix) {
  const files = [];
  if (!existsSync(dir)) return { files };
  const walk = (d, rel) => {
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = join(d, e.name);
      const relPath = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) walk(full, relPath);
      else if (e.isFile()) {
        const buf = readFileSync(full);
        files.push({ path: `${prefix}/${relPath}`, bytes: buf.byteLength, sha256: sha256(buf) });
      }
    }
  };
  walk(dir, '');
  files.sort((a, b) => (a.path < b.path ? -1 : 1));
  return { files };
}

/** Load the tracked scanner pins. */
export function loadPins(root) {
  return JSON.parse(readFileSync(join(root, 'scripts/gate/scanner-pins.json'), 'utf8'));
}
