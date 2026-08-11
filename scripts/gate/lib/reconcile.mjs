/**
 * C16 — BIDIRECTIONAL RECONCILIATION and FAIL-CLOSED EXCLUSION GOVERNANCE.
 *
 * Extracted from the runner so the negative controls can drive these functions
 * directly. A reconciler that is only ever exercised on a passing input is not
 * evidence: the controls in apps/api/test/gate/c16-closure-controls.test.ts feed it
 * deliberately corrupted SBOMs and require each corruption to be reported.
 *
 * The two sides compared here MUST have independent provenance:
 *   side A — the closure computed from pnpm-lock.yaml;
 *   side B — an SBOM parsed back from bytes on disk.
 * Comparing an SBOM to itself, or to a licence inventory derived from that same
 * SBOM, is self-reconciliation and proves nothing.
 */
import { splitKey } from './lock-closure.mjs';

/**
 * Compare a lock-derived closure against an on-disk SBOM in BOTH directions.
 * Missing (in lock, absent from SBOM) and extra (in SBOM, absent from lock) are
 * reported separately — a single symmetric-difference count hides which side lied.
 */
export function reconcile(closure, onDisk) {
  const lockNodes = new Set(closure.nodes.keys());
  const sbomNodes = new Set(onDisk.nodes.keys());
  const lockEdges = new Set(closure.edges.map((e) => `${e.from} ${e.to}`));

  const missingNodes = [...lockNodes].filter((n) => !sbomNodes.has(n)).sort();
  const extraNodes = [...sbomNodes].filter((n) => !lockNodes.has(n)).sort();
  const missingEdges = [...lockEdges].filter((e) => !onDisk.edges.has(e)).sort();
  const extraEdges = [...onDisk.edges].filter((e) => !lockEdges.has(e)).sort();

  // Identity drift that a set comparison on bom-ref alone would miss: the ref
  // matches but the recorded version or purl disagrees with the lockfile.
  const identityMismatches = [];
  for (const ref of lockNodes) {
    if (!sbomNodes.has(ref)) continue;
    const lockNode = closure.nodes.get(ref);
    const sbomNode = onDisk.nodes.get(ref);
    if (sbomNode.version !== lockNode.version) {
      identityMismatches.push(`${ref}: version lock=${lockNode.version} sbom=${sbomNode.version}`);
    }
    if ((sbomNode.purl ?? null) !== (lockNode.purl ?? null)) {
      identityMismatches.push(`${ref}: purl lock=${lockNode.purl} sbom=${sbomNode.purl}`);
    }
    if (sbomNode.properties['eye:lock-key'] !== lockNode.lockKey) {
      identityMismatches.push(
        `${ref}: lock-key lock=${lockNode.lockKey} sbom=${sbomNode.properties['eye:lock-key']}`,
      );
    }
  }

  // Structural integrity of the SBOM graph in its own right.
  const dangling = [...onDisk.edges]
    .map((e) => e.split(' '))
    .filter(([, to]) => !sbomNodes.has(to))
    .map(([from, to]) => `${from} -> ${to}`)
    .sort();
  const missingDependencyEntries = [...sbomNodes].filter((n) => !onDisk.declaredRefs.has(n)).sort();
  const inbound = new Set([...onDisk.edges].map((e) => e.split(' ')[1]));
  const orphans = [...sbomNodes]
    .filter((n) => !closure.roots.includes(n) && !inbound.has(n))
    .sort();

  return {
    lock_nodes: lockNodes.size,
    sbom_nodes: sbomNodes.size,
    lock_edges: lockEdges.size,
    sbom_edges: onDisk.edges.size,
    missing_nodes: missingNodes,
    extra_nodes: extraNodes,
    missing_edges: missingEdges,
    extra_edges: extraEdges,
    identity_mismatches: identityMismatches.sort(),
    dangling_references: dangling,
    components_without_dependency_entry: missingDependencyEntries,
    orphan_components: orphans,
    clean:
      missingNodes.length === 0 && extraNodes.length === 0 &&
      missingEdges.length === 0 && extraEdges.length === 0 &&
      identityMismatches.length === 0 && dangling.length === 0 &&
      missingDependencyEntries.length === 0 && orphans.length === 0,
  };
}

/**
 * Validate governed exclusions FAIL-CLOSED: every rejection rule in
 * scripts/gate/closure-exclusions.json is enforced here, and any problem is a
 * gate failure rather than a warning. An unenforced exclusion schema is a
 * suppression mechanism wearing a governance label.
 *
 * `lockUniverse` is the set of every `name@version` the lockfile resolves ANYWHERE,
 * independent of target. It is what separates three rules that would otherwise
 * collapse into one — and a rule that can never fire is not a rule:
 *   version_changed      — the name IS in this closure, but at a different version
 *                          than the one the reviewer signed off on;
 *   unused_never_applied — the exact version exists in the lockfile but is not in
 *                          THIS target's closure, so the entry did nothing here;
 *   stale_not_in_closure — the exact version is gone from the lockfile entirely, so
 *                          the review refers to something that no longer exists.
 */
export function governExclusions(exclusionDoc, closures, lockUniverse = new Set()) {
  const problems = [];
  const entries = exclusionDoc.exclusions ?? [];

  for (const [i, ex] of entries.entries()) {
    const where = `exclusions[${i}]`;
    let fatal = false;

    for (const field of exclusionDoc.required_fields) {
      const value = ex[field];
      const empty = value === undefined || value === null ||
        (typeof value === 'string' && value.trim() === '') ||
        (typeof value === 'object' && Object.keys(value).length === 0);
      if (empty) {
        problems.push(`${where}: missing required field '${field}'`);
        fatal = true;
      }
    }

    const key = typeof ex.resolution_key === 'string' ? ex.resolution_key : '';

    // rejection rule: wildcard_or_name_only
    if (key.includes('*') || key.includes('?')) {
      problems.push(`${where}: rejected by 'wildcard_or_name_only' — wildcard resolution_key '${key}'`);
      fatal = true;
    } else if (!/^(?:@[^/@]+\/)?[^@/]+@\d/.test(key)) {
      problems.push(
        `${where}: rejected by 'wildcard_or_name_only' — resolution_key '${key}' is not an exact name@version`,
      );
      fatal = true;
    }

    if (fatal) continue;

    const closure = closures[ex.target];
    if (closure === undefined) {
      problems.push(`${where}: unknown target '${ex.target}'`);
      continue;
    }
    if (!closure.target.dependency_scopes.includes(ex.scope)) {
      problems.push(
        `${where}: scope '${ex.scope}' is not one of the ${ex.target} scopes ` +
        `(${closure.target.dependency_scopes.join(', ')})`,
      );
      continue;
    }

    const { name, version: declared } = splitKey(key);
    const node = [...closure.nodes.values()].find((n) => n.lockKey === key || n.bomRef === key);

    if (node === undefined) {
      const sameName = [...closure.nodes.values()].filter((n) => n.name === name);
      if (sameName.length > 0) {
        // rejection rule: version_changed
        const versions = [...new Set(sameName.map((n) => n.version))].sort().join(', ');
        problems.push(
          `${where}: rejected by 'version_changed' — the ${ex.target} closure resolves ` +
          `${name}@${versions}, but the entry was reviewed against ${name}@${declared}`,
        );
      } else if (lockUniverse.has(`${name}@${declared}`)) {
        // rejection rule: unused_never_applied
        problems.push(
          `${where}: rejected by 'unused_never_applied' — '${key}' is resolved by the lockfile but ` +
          `is not in the ${ex.target} closure, so this entry excluded nothing`,
        );
      } else {
        // rejection rule: stale_not_in_closure
        problems.push(
          `${where}: rejected by 'stale_not_in_closure' — '${key}' is not resolved anywhere in ` +
          'pnpm-lock.yaml; the reviewed subject no longer exists',
        );
      }
      continue;
    }

    // The parent edge must be a real edge in this closure.
    const parentOk = closure.edges.some(
      (e) => `${e.from} -> ${e.to}` === ex.parent_edge || `${e.from} ${e.to}` === ex.parent_edge,
    );
    if (!parentOk) {
      problems.push(`${where}: parent_edge '${ex.parent_edge}' is not an edge of the ${ex.target} closure`);
    }

    // rejection rule: excludes_compatible_mandatory_dependency
    const mandatory = closure.edges.some((e) => e.to === node.bomRef && e.kind === 'dependencies');
    if (mandatory && node.platform?.compatible !== false) {
      problems.push(
        `${where}: rejected by 'excludes_compatible_mandatory_dependency' — '${key}' is a ` +
        'target-compatible MANDATORY dependency and cannot be excluded from the closure',
      );
    }
  }

  return problems;
}

/** Every `name@version` the lockfile resolves, target-independent. */
export function lockPackageUniverse(lock) {
  const universe = new Set();
  for (const key of Object.keys(lock.packages ?? {})) {
    const { name, version } = splitKey(key);
    if (name !== '' && version !== '') universe.add(`${name}@${version}`);
  }
  return universe;
}

/** Semver-ordered comparison of two release strings (numeric parts only). */
export function compareSemver(a, b) {
  const pa = String(a).split('.').map((n) => Number.parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => Number.parseInt(n, 10) || 0);
  for (let i = 0; i < 3; i += 1) {
    if ((pa[i] ?? 0) !== (pb[i] ?? 0)) return (pa[i] ?? 0) - (pb[i] ?? 0);
  }
  return 0;
}

/**
 * Versions that a reviewed override was supposed to remove from BOTH closures.
 * The residual check is what makes an override a remediation instead of a wish:
 * it fails if any node in any target still resolves below the fixed boundary.
 */
export const FORBIDDEN_RESIDUALS = [
  {
    name: 'nanoid',
    fixedAt: '3.3.17',
    pinnedTo: '3.3.18',
    advisory: 'CVE-2026-67213',
    severity: 'HIGH',
  },
];

export function findVulnerableResiduals(closures) {
  const residuals = [];
  for (const [targetName, closure] of Object.entries(closures)) {
    for (const node of closure.nodes.values()) {
      for (const f of FORBIDDEN_RESIDUALS) {
        if (node.name === f.name && compareSemver(node.version, f.fixedAt) < 0) {
          residuals.push(
            `${targetName}: ${node.bomRef} resolves below ${f.name}@${f.fixedAt} (${f.advisory}, ${f.severity})`,
          );
        }
      }
    }
  }
  return residuals.sort();
}
