/**
 * C15 CARRY-FORWARD (closed in C16) — SCANNER AND TARGET PROVENANCE.
 *
 * Three gaps in the C15 evidence are closed here.
 *
 * 1. MULTI-ARCH AMBIGUITY. docker-compose.yml pins each service by digest, but those
 *    digests are OCI image INDEXES (manifest lists) with a child per platform. "we
 *    scanned the digest-pinned image" is therefore ambiguous: a scanner with no
 *    --platform resolves the child matching the HOST, so an arm64 developer machine
 *    scans the arm64 child while CI (ubuntu-latest) runs the linux/amd64 child. The
 *    two children have different layers and therefore different findings.
 *    resolveImageIndex() enumerates every child and returns the exact linux/amd64
 *    child digest, so the scan can name the manifest it actually examined.
 *
 * 2. SCANNER IDENTITY. A version string is a claim the binary makes about itself.
 *    scannerBinaries() records the resolved path and the SHA-256 of the executable
 *    bytes alongside it, plus trivy's vulnerability-database identity and freshness —
 *    a scan is only reproducible against a known DB, and a stale DB silently
 *    under-reports.
 *
 * 3. STEP-POLICY HONESTY. "eight steps, six blocking" invites the reading that two
 *    scans were allowed to fail. classifyStepPolicies() requires every informational
 *    step to declare the blocking step whose coverage it duplicates, and fails if any
 *    informational step introduces coverage that nothing blocking also enforces.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/**
 * Resolve a digest-pinned reference to its per-platform children.
 * Returns { kind: 'index' | 'manifest', children, target } where `target` is the
 * child digest for the requested platform, or null if that platform is absent.
 */
export function resolveImageIndex(ref, platform = 'linux/amd64') {
  const res = spawnSync('docker', ['buildx', 'imagetools', 'inspect', '--raw', ref], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  if (res.status !== 0) {
    return {
      ref,
      resolved: false,
      error: (res.stderr ?? '').trim().slice(0, 400) || `docker exited ${res.status}`,
      kind: null,
      children: [],
      target_platform: platform,
      target_digest: null,
    };
  }
  const raw = res.stdout;
  const doc = JSON.parse(raw);
  const [wantOs, wantArch, wantVariant] = platform.split('/');

  if (!Array.isArray(doc.manifests)) {
    // A single-platform manifest: the pinned digest IS the image that gets scanned.
    return {
      ref,
      resolved: true,
      kind: 'manifest',
      media_type: doc.mediaType ?? null,
      index_raw_sha256: sha256(raw),
      children: [],
      target_platform: platform,
      target_digest: ref.slice(ref.indexOf('@') + 1),
      target_is_index_child: false,
    };
  }

  const children = doc.manifests.map((m) => ({
    digest: m.digest,
    media_type: m.mediaType ?? null,
    os: m.platform?.os ?? null,
    architecture: m.platform?.architecture ?? null,
    variant: m.platform?.variant ?? null,
    size: m.size ?? null,
    // Buildkit attestation manifests are recorded as unknown/unknown; they are not
    // runnable images and must not be mistaken for a platform child.
    attestation: m.platform?.os === 'unknown' && m.platform?.architecture === 'unknown',
  }));

  const match = children.find(
    (c) => !c.attestation && c.os === wantOs && c.architecture === wantArch &&
      (wantVariant === undefined || (c.variant ?? wantVariant) === wantVariant),
  );

  return {
    ref,
    resolved: true,
    kind: 'index',
    media_type: doc.mediaType ?? null,
    index_raw_sha256: sha256(raw),
    child_count: children.length,
    runnable_platform_count: children.filter((c) => !c.attestation).length,
    children,
    target_platform: platform,
    target_digest: match?.digest ?? null,
    target_is_index_child: match !== undefined,
  };
}

/**
 * Build the exact reference to scan: the repository from the pinned reference,
 * addressed by the resolved per-platform CHILD digest. Scanning this reference is
 * unambiguous regardless of the host architecture the gate runs on.
 */
export function platformPinnedRef(pinnedRef, resolution) {
  const repo = pinnedRef.slice(0, pinnedRef.indexOf('@'));
  if (resolution.target_digest === null) return null;
  return `${repo}@${resolution.target_digest}`;
}

/** Resolved path plus SHA-256 of each scanner executable, and trivy's DB identity. */
export function scannerBinaries(names) {
  const out = {};
  for (const name of names) {
    const which = spawnSync('sh', ['-c', `command -v ${name}`], { encoding: 'utf8' });
    const path = which.status === 0 ? which.stdout.trim() : null;
    let digest = null;
    let bytes = null;
    if (path !== null) {
      try {
        const buf = readFileSync(path);
        digest = sha256(buf);
        bytes = buf.byteLength;
      } catch (e) {
        digest = `(unreadable: ${e instanceof Error ? e.message.slice(0, 80) : String(e)})`;
      }
    }
    out[name] = { resolved_path: path, binary_sha256: digest, binary_bytes: bytes };
  }
  return out;
}

/**
 * Trivy's vulnerability database identity and freshness. A scan against an unknown
 * or stale DB is not reproducible evidence, so the DB version, the timestamp it was
 * built, when this host downloaded it, and the misconfiguration check-bundle digest
 * are all recorded — and staleness is computed, not assumed.
 */
export function trivyDatabase(nowIso) {
  try {
    const raw = execFileSync('trivy', ['version', '--format', 'json'], { encoding: 'utf8' });
    const d = JSON.parse(raw);
    const updatedAt = d.VulnerabilityDB?.UpdatedAt ?? null;
    const nextUpdate = d.VulnerabilityDB?.NextUpdate ?? null;
    const now = new Date(nowIso);
    const ageHours = updatedAt === null
      ? null
      : Math.round(((now.getTime() - new Date(updatedAt).getTime()) / 3_600_000) * 10) / 10;
    return {
      available: true,
      raw_sha256: sha256(raw),
      trivy_version: d.Version ?? null,
      vulnerability_db: {
        schema_version: d.VulnerabilityDB?.Version ?? null,
        built_at: updatedAt,
        next_update_due: nextUpdate,
        downloaded_at: d.VulnerabilityDB?.DownloadedAt ?? null,
        age_hours_at_scan: ageHours,
        past_next_update_at_scan: nextUpdate === null ? null : now > new Date(nextUpdate),
      },
      misconfig_check_bundle: {
        digest: d.CheckBundle?.Digest ?? null,
        downloaded_at: d.CheckBundle?.DownloadedAt ?? null,
      },
    };
  } catch (e) {
    return { available: false, error: e instanceof Error ? e.message.slice(0, 200) : String(e) };
  }
}

/**
 * The step-policy taxonomy. Every informational step MUST name the blocking step
 * whose coverage it duplicates; a step that adds unblocked coverage is a hole.
 *
 * Keyed by step id → the blocking step id it re-captures in another format.
 */
export const INFORMATIONAL_DUPLICATES = {
  'pnpm-audit-json': 'pnpm-audit-human',
  'trivy-fs-json': 'trivy-fs',
};

export function classifyStepPolicies(steps) {
  const byId = new Map(steps.map((s) => [s.id, s]));
  const blocking = steps.filter((s) => s.policy === 'blocking');
  const informational = steps.filter((s) => s.policy !== 'blocking');
  const problems = [];
  const classified = [];

  for (const s of informational) {
    const duplicates = INFORMATIONAL_DUPLICATES[s.id];
    if (duplicates === undefined) {
      problems.push(
        `step '${s.id}' is non-blocking but declares no blocking step whose coverage it duplicates — ` +
        'non-blocking coverage is unenforced coverage',
      );
      continue;
    }
    const target = byId.get(duplicates);
    if (target === undefined) {
      problems.push(`step '${s.id}' claims to duplicate '${duplicates}', which did not run`);
      continue;
    }
    if (target.policy !== 'blocking') {
      problems.push(`step '${s.id}' claims to duplicate '${duplicates}', but that step is not blocking`);
      continue;
    }
    if (target.tool !== s.tool) {
      problems.push(
        `step '${s.id}' (${s.tool}) claims to duplicate '${duplicates}' (${target.tool}) — different tools ` +
        'do not produce the same coverage',
      );
      continue;
    }
    classified.push({
      id: s.id,
      policy: s.policy,
      duplicates_blocking_step: duplicates,
      relationship: 'alternate output format of the same scan by the same pinned tool',
      adds_unblocked_coverage: false,
    });
  }

  return {
    total_steps: steps.length,
    blocking_steps: blocking.length,
    informational_steps: informational.length,
    blocking_ids: blocking.map((s) => s.id),
    informational_classification: classified,
    // The claim the reviewer must be able to check: nothing is scanned only under a
    // non-blocking policy.
    every_informational_step_duplicates_a_blocking_step:
      problems.length === 0 && classified.length === informational.length,
    unblocked_coverage_problems: problems,
  };
}
