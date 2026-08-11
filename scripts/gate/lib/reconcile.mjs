/**
 * C16 — FULL-FIELD MULTISET RECONCILIATION and OPERATIONAL EXCLUSION GOVERNANCE.
 *
 * The two sides compared here MUST have independent provenance:
 *   side A — the closure computed from pnpm-lock.yaml + the target descriptor;
 *   side B — an SBOM parsed back from bytes on disk.
 * Comparing an SBOM to itself, or to a licence inventory derived from that same SBOM,
 * is self-reconciliation and proves nothing.
 *
 * ── REMEDIATION AFTER INDEPENDENT REVIEW OF e3a0b1f ──────────────────────────────
 * The previous reconciler compared Maps and Sets, so it silently collapsed duplicate
 * components, duplicate dependency entries and repeated `dependsOn` values, and it
 * compared only four fields (ref, version, purl, lock key). Everything else in the
 * SBOM — name, type, integrity hashes, patch hash, peer context, target id, scope
 * membership, os/cpu/libc, workspace identity, and the metadata subject's edges to the
 * declared roots — could be removed or rewritten and still reconcile "clean".
 *
 * This version compares MULTIPLICITY and EVERY required field in both directions, and
 * treats the subject-to-root edges as mandatory rather than exempting roots.
 */
import { splitKey } from './lock-closure.mjs';
import { subjectRef } from './sbom.mjs';

/** Fields on a component that must agree exactly with the lockfile-derived node. */
const REQUIRED_PROPERTIES = ['eye:target', 'eye:lock-key', 'eye:scopes'];

const listOf = (v) => (v === null || v === undefined ? [] : [].concat(v).map(String));

/**
 * Reconcile a lock-derived closure against an on-disk SBOM, in both directions, over
 * component multiplicity, edge multiplicity and every required field.
 */
export function reconcile(closure, onDisk, options = {}) {
  const targetId = closure.target.id;
  const subject = subjectRef(targetId);
  const problems = [];

  // ── duplicates: a multiset check the previous Set-based comparison could not make ──
  const duplicateComponents = [...onDisk.componentRefCounts.entries()]
    .filter(([, n]) => n > 1)
    .map(([ref, n]) => `${ref} x${n}`)
    .sort();
  const duplicateDependencyEntries = [...onDisk.declaredRefCounts.entries()]
    .filter(([, n]) => n > 1)
    .map(([ref, n]) => `${ref} x${n}`)
    .sort();
  const duplicateDependsOn = [...onDisk.dependsOnDuplicates];
  const duplicateProperties = onDisk.componentList
    .filter((c) => c.duplicateProperties.length > 0)
    .map((c) => `${c.bomRef}: ${c.duplicateProperties.join(',')}`)
    .sort();

  // ── nodes, as multisets ────────────────────────────────────────────────────────
  const lockRefs = [...closure.nodes.keys()];
  const lockSet = new Set(lockRefs);
  const sbomRefs = onDisk.componentList.map((c) => c.bomRef);
  const sbomSet = new Set(sbomRefs);

  const missingNodes = lockRefs.filter((r) => !sbomSet.has(r)).sort();
  const extraNodes = [...new Set(sbomRefs.filter((r) => !lockSet.has(r)))].sort();

  // ── full-field identity comparison for every ref present on both sides ─────────
  const fieldMismatches = [];
  for (const ref of lockRefs) {
    if (!sbomSet.has(ref)) continue;
    const a = closure.nodes.get(ref);
    const b = onDisk.nodes.get(ref);
    const say = (field, expected, actual) =>
      fieldMismatches.push(`${ref}: ${field} lock=${JSON.stringify(expected)} sbom=${JSON.stringify(actual)}`);

    if (b.name !== a.name) say('name', a.name, b.name);
    if (b.version !== a.version) say('version', a.version, b.version);

    const expectedType = a.kind === 'workspace' ? 'application' : 'library';
    if (b.type !== expectedType) say('type', expectedType, b.type);

    if (b.purlError !== null) {
      fieldMismatches.push(`${ref}: purl is not a parseable Package URL (${b.purlError})`);
    } else if ((b.purl ?? null) !== (a.purl ?? null)) {
      say('purl', a.purl, b.purl);
    } else if (b.purlParts !== null) {
      // Canonical form check: a scoped package MUST carry its namespace. The
      // non-canonical `%40scope%2Fname` form parses as a namespace-less package whose
      // name literally contains a slash, which identifies a different thing.
      const slash = a.name.indexOf('/');
      const expectedNs = a.name.startsWith('@') && slash !== -1 ? a.name.slice(0, slash) : null;
      const expectedBare = expectedNs === null ? a.name : a.name.slice(slash + 1);
      if ((b.purlParts.namespace ?? null) !== expectedNs) {
        say('purl namespace', expectedNs, b.purlParts.namespace);
      }
      if (b.purlParts.name !== expectedBare) say('purl name', expectedBare, b.purlParts.name);
      if (b.purlParts.version !== a.version) say('purl version', a.version, b.purlParts.version);
    }

    for (const prop of REQUIRED_PROPERTIES) {
      if (b.properties[prop] === undefined) {
        fieldMismatches.push(`${ref}: required property '${prop}' is absent`);
      }
    }
    if (b.properties['eye:target'] !== undefined && b.properties['eye:target'] !== targetId) {
      say('eye:target', targetId, b.properties['eye:target']);
    }
    if (b.properties['eye:lock-key'] !== undefined && b.properties['eye:lock-key'] !== a.lockKey) {
      say('eye:lock-key', a.lockKey, b.properties['eye:lock-key']);
    }
    const expectedScopes = [...a.scopes].sort().join(',');
    if (b.properties['eye:scopes'] !== undefined && b.properties['eye:scopes'] !== expectedScopes) {
      say('eye:scopes', expectedScopes, b.properties['eye:scopes']);
    }

    // Peer context and patch hash are part of the installed identity.
    const expectedPeer = a.peerSuffix === '' ? undefined : a.peerSuffix;
    if ((b.properties['eye:peer-context'] ?? undefined) !== expectedPeer) {
      say('eye:peer-context', expectedPeer ?? null, b.properties['eye:peer-context'] ?? null);
    }
    const expectedPatch = a.patchHash ? String(a.patchHash) : undefined;
    if ((b.properties['eye:patch-hash'] ?? undefined) !== expectedPatch) {
      say('eye:patch-hash', expectedPatch ?? null, b.properties['eye:patch-hash'] ?? null);
    }

    // Platform metadata must be carried through verbatim.
    for (const [prop, value] of [['eye:os', a.os], ['eye:cpu', a.cpu], ['eye:libc', a.libc]]) {
      const expected = listOf(value).length > 0 ? listOf(value).join(',') : undefined;
      if ((b.properties[prop] ?? undefined) !== expected) {
        say(prop, expected ?? null, b.properties[prop] ?? null);
      }
    }

    // Integrity: every SRI hash the lockfile recorded must be present.
    const expectedHashes = expectedHashSet(a.integrity);
    if (expectedHashes.length > 0) {
      const have = new Set(b.hashes);
      for (const h of expectedHashes) {
        if (!have.has(h)) fieldMismatches.push(`${ref}: integrity hash ${h} is absent from the SBOM`);
      }
    } else if (a.kind !== 'workspace' && b.hashes.length === 0 && a.integrity !== null) {
      fieldMismatches.push(`${ref}: lockfile records integrity but the SBOM has no hashes`);
    }

    // Workspace identity, bound to the manifest bytes.
    if (a.kind === 'workspace') {
      for (const [prop, expected] of [
        ['eye:importer-root', a.importerPath],
        ['eye:workspace-manifest', a.manifestPath],
        ['eye:workspace-manifest-sha256', a.manifestSha256],
      ]) {
        if (b.properties[prop] !== expected) say(prop, expected, b.properties[prop] ?? null);
      }
    }
  }

  // ── edges, as multisets, including the subject-to-root edges ───────────────────
  const lockEdgeCounts = new Map();
  for (const e of closure.edges) {
    const k = `${e.from} ${e.to}`;
    lockEdgeCounts.set(k, (lockEdgeCounts.get(k) ?? 0) + 1);
  }
  // The subject must be attached to every declared root. Not an exemption — a
  // requirement, because exempting roots is exactly what hid a disconnected BOM graph.
  for (const rootRef of closure.roots) {
    lockEdgeCounts.set(`${subject} ${rootRef}`, 1);
  }

  const missingEdges = [];
  const extraEdges = [];
  const edgeMultiplicityMismatches = [];
  for (const [k, n] of lockEdgeCounts.entries()) {
    const m = onDisk.edgeCounts.get(k) ?? 0;
    if (m === 0) missingEdges.push(k);
    else if (m !== n) edgeMultiplicityMismatches.push(`${k}: lock x${n} sbom x${m}`);
  }
  for (const [k, m] of onDisk.edgeCounts.entries()) {
    if (!lockEdgeCounts.has(k)) extraEdges.push(`${k} x${m}`);
  }

  const subjectRootEdges = closure.roots
    .map((r) => `${subject} ${r}`)
    .filter((k) => (onDisk.edgeCounts.get(k) ?? 0) > 0);
  const missingSubjectRootEdges = closure.roots
    .map((r) => `${subject} ${r}`)
    .filter((k) => (onDisk.edgeCounts.get(k) ?? 0) === 0)
    .sort();
  const extraSubjectEdges = [...onDisk.edgeCounts.keys()]
    .filter((k) => k.startsWith(`${subject} `))
    .filter((k) => !closure.roots.some((r) => k === `${subject} ${r}`))
    .sort();

  // ── structural integrity of the SBOM in its own right ─────────────────────────
  const resolvable = new Set([...sbomSet, subject]);
  const dangling = [...onDisk.edgeCounts.keys()]
    .map((e) => e.split(' '))
    .filter(([, to]) => !resolvable.has(to))
    .map(([from, to]) => `${from} -> ${to}`)
    .sort();
  const missingDependencyEntries = [...sbomSet]
    .filter((n) => !onDisk.declaredRefs.has(n))
    .sort();
  const inbound = new Set([...onDisk.edgeCounts.keys()].map((e) => e.split(' ')[1]));
  const orphans = [...sbomSet].filter((n) => !inbound.has(n)).sort();

  // ── subject and provenance binding ────────────────────────────────────────────
  if (onDisk.subjectRef !== subject) {
    problems.push(`metadata subject is ${JSON.stringify(onDisk.subjectRef)}, expected ${subject}`);
  }
  if (!onDisk.declaredRefs.has(subject)) {
    problems.push(`metadata subject ${subject} has NO dependency entry — the BOM graph is disconnected`);
  }
  const bindings = options.expectedBindings ?? {};
  for (const [prop, expected] of Object.entries(bindings)) {
    if (onDisk.metadataProperties[prop] !== expected) {
      problems.push(
        `metadata property '${prop}' is ${JSON.stringify(onDisk.metadataProperties[prop] ?? null)}, ` +
        `expected ${JSON.stringify(expected)}`,
      );
    }
  }

  const result = {
    lock_nodes: lockRefs.length,
    sbom_nodes: sbomRefs.length,
    lock_edges: [...lockEdgeCounts.values()].reduce((a, b) => a + b, 0),
    sbom_edges: [...onDisk.edgeCounts.values()].reduce((a, b) => a + b, 0),
    subject_root_edges_expected: closure.roots.length,
    subject_root_edges_present: subjectRootEdges.length,
    missing_nodes: missingNodes,
    extra_nodes: extraNodes,
    missing_edges: missingEdges.sort(),
    extra_edges: extraEdges.sort(),
    edge_multiplicity_mismatches: edgeMultiplicityMismatches.sort(),
    missing_subject_root_edges: missingSubjectRootEdges,
    extra_subject_edges: extraSubjectEdges,
    field_mismatches: fieldMismatches.sort(),
    duplicate_components: duplicateComponents,
    duplicate_dependency_entries: duplicateDependencyEntries,
    duplicate_depends_on: duplicateDependsOn,
    duplicate_properties: duplicateProperties,
    dangling_references: dangling,
    components_without_dependency_entry: missingDependencyEntries,
    orphan_components: orphans,
    subject_and_binding_problems: problems.sort(),
  };
  result.clean = FAILURE_KEYS.every((k) => result[k].length === 0) &&
    result.subject_root_edges_present === result.subject_root_edges_expected;
  return result;
}

/** Every list on a reconciliation result that must be empty for a clean verdict. */
export const FAILURE_KEYS = [
  'missing_nodes', 'extra_nodes', 'missing_edges', 'extra_edges',
  'edge_multiplicity_mismatches', 'missing_subject_root_edges', 'extra_subject_edges',
  'field_mismatches', 'duplicate_components', 'duplicate_dependency_entries',
  'duplicate_depends_on', 'duplicate_properties', 'dangling_references',
  'components_without_dependency_entry', 'orphan_components',
  'subject_and_binding_problems',
];

function expectedHashSet(integrity) {
  if (typeof integrity !== 'string' || integrity === '') return [];
  const out = [];
  for (const token of integrity.split(/\s+/)) {
    const m = /^(sha256|sha384|sha512)-(.+)$/.exec(token);
    if (m === null) continue;
    const alg = { sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' }[m[1]];
    out.push(`${alg}:${Buffer.from(m[2], 'base64').toString('hex')}`);
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════════════════
// EXCLUSION GOVERNANCE — validated AND APPLIED.
// ═══════════════════════════════════════════════════════════════════════════════════

/**
 * ONE EXPLICIT SEMANTIC, chosen and documented: a valid exclusion REMOVES the exact
 * governed node and every edge incident to it from the reconciled closure, and moves
 * it into a separate `excluded` set that the report carries. Reconciliation then runs
 * against the reduced closure, so an applied exclusion is visible as a smaller graph
 * plus an explicit governed record — never as a component that quietly still matches.
 *
 * The previous implementation validated entries and then did nothing with them, so a
 * "valid" exclusion had no effect and could never be observed to work.
 */
export function applyExclusions(closure, entries) {
  const applied = [];
  const removedRefs = new Set();

  for (const ex of entries) {
    const node = [...closure.nodes.values()].find(
      (n) => n.lockKey === ex.resolution_key || n.bomRef === ex.resolution_key,
    );
    if (node === undefined) continue;
    removedRefs.add(node.bomRef);
    applied.push({
      resolution_key: ex.resolution_key,
      bom_ref: node.bomRef,
      target: ex.target,
      scope: ex.scope,
      reason: ex.reason,
      owner: ex.owner,
      approver: ex.approver,
      evidence: ex.evidence,
      evidence_sha256: ex.evidence_sha256,
      approved_on: ex.approved_on,
      expires_on: ex.expires_on,
      removed_edges: closure.edges
        .filter((e) => e.from === node.bomRef || e.to === node.bomRef)
        .map((e) => `${e.from} -> ${e.to}`)
        .sort(),
    });
  }

  if (removedRefs.size === 0) return { closure, applied: [], excluded: [] };

  const nodes = new Map([...closure.nodes.entries()].filter(([ref]) => !removedRefs.has(ref)));
  const edges = closure.edges.filter((e) => !removedRefs.has(e.from) && !removedRefs.has(e.to));
  const excluded = [...closure.nodes.entries()]
    .filter(([ref]) => removedRefs.has(ref))
    .map(([, n]) => n);

  return {
    closure: { ...closure, nodes, edges, roots: closure.roots.filter((r) => !removedRefs.has(r)) },
    applied: applied.sort((a, b) => (a.resolution_key < b.resolution_key ? -1 : 1)),
    excluded,
  };
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

/**
 * Validate governed exclusions FAIL-CLOSED. Every rejection rule is enforced here and
 * any problem is a gate failure, not a warning: an unenforced exclusion schema is a
 * suppression mechanism wearing a governance label.
 *
 * `lockUniverse` is the set of every `name@version` the lockfile resolves ANYWHERE,
 * target-independent. It is what keeps three rules from collapsing into one — and a
 * rule that can never fire is not a rule:
 *   version_changed      — the name IS in this closure, at a different version;
 *   unused_never_applied — the exact version is in the lockfile but not in THIS
 *                          target's closure, so the entry excluded nothing here;
 *   stale_not_in_closure — the exact version is gone from the lockfile entirely.
 */
export function governExclusions(exclusionDoc, closures, lockUniverse = new Set(), nowIso = null) {
  const problems = [];
  const valid = [];
  const entries = exclusionDoc.exclusions ?? [];
  const today = nowIso ?? '1970-01-01';

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
    if (key.includes('*') || key.includes('?')) {
      problems.push(`${where}: rejected by 'wildcard_or_name_only' — wildcard resolution_key '${key}'`);
      fatal = true;
    } else if (!/^(?:@[^/@]+\/)?[^@/]+@\d/.test(key)) {
      problems.push(
        `${where}: rejected by 'wildcard_or_name_only' — resolution_key '${key}' is not an exact name@version`,
      );
      fatal = true;
    }

    // Approval must be a real, checkable record, not a free-text gesture.
    if (typeof ex.evidence_sha256 === 'string' && !SHA256_HEX.test(ex.evidence_sha256)) {
      problems.push(`${where}: rejected by 'unapproved' — evidence_sha256 is not a SHA-256 hex digest`);
      fatal = true;
    }
    for (const dateField of ['approved_on', 'expires_on']) {
      if (typeof ex[dateField] === 'string' && !ISO_DATE.test(ex[dateField])) {
        problems.push(`${where}: ${dateField} '${ex[dateField]}' is not an ISO YYYY-MM-DD date`);
        fatal = true;
      }
    }
    if (typeof ex.approver === 'string' && ex.approver === ex.owner) {
      problems.push(
        `${where}: rejected by 'unapproved' — approver '${ex.approver}' is the same party as the owner; ` +
        'an exclusion cannot approve itself',
      );
      fatal = true;
    }
    if (typeof ex.expires_on === 'string' && ISO_DATE.test(ex.expires_on) && ex.expires_on < today) {
      problems.push(
        `${where}: rejected by 'expired' — expires_on ${ex.expires_on} is before the run date ${today}`,
      );
      fatal = true;
    }

    if (fatal) continue;

    const closure = closures[ex.target];
    if (closure === undefined) {
      problems.push(`${where}: rejected by 'wrong_target' — unknown target '${ex.target}'`);
      continue;
    }
    if (!closure.target.dependency_scopes.includes(ex.scope)) {
      problems.push(
        `${where}: rejected by 'wrong_target' — scope '${ex.scope}' is not one of the ${ex.target} ` +
        `scopes (${closure.target.dependency_scopes.join(', ')})`,
      );
      continue;
    }

    const { name, version: declared } = splitKey(key);
    const node = [...closure.nodes.values()].find(
      (n) => n.lockKey === key || n.bomRef === key,
    );

    if (node === undefined) {
      const sameName = [...closure.nodes.values()].filter((n) => n.name === name);
      if (sameName.length > 0) {
        const versions = [...new Set(sameName.map((n) => n.version))].sort().join(', ');
        problems.push(
          `${where}: rejected by 'version_changed' — the ${ex.target} closure resolves ` +
          `${name}@${versions}, but the entry was reviewed against ${name}@${declared}`,
        );
      } else if (lockUniverse.has(`${name}@${declared}`)) {
        problems.push(
          `${where}: rejected by 'unused_never_applied' — '${key}' is resolved by the lockfile but ` +
          `is not in the ${ex.target} closure, so this entry excluded nothing`,
        );
      } else {
        problems.push(
          `${where}: rejected by 'stale_not_in_closure' — '${key}' is not resolved anywhere in ` +
          'pnpm-lock.yaml; the reviewed subject no longer exists',
        );
      }
      continue;
    }

    const parentOk = closure.edges.some(
      (e) => `${e.from} -> ${e.to}` === ex.parent_edge || `${e.from} ${e.to}` === ex.parent_edge,
    );
    if (!parentOk) {
      problems.push(
        `${where}: rejected by 'wrong_parent' — parent_edge '${ex.parent_edge}' is not an edge of ` +
        `the ${ex.target} closure`,
      );
      continue;
    }

    const mandatory = closure.edges.some((e) => e.to === node.bomRef && e.kind === 'dependencies');
    if (mandatory && node.platform?.compatible !== false) {
      problems.push(
        `${where}: rejected by 'excludes_compatible_mandatory_dependency' — '${key}' is a ` +
        'target-compatible MANDATORY dependency and cannot be excluded from the closure',
      );
      continue;
    }

    valid.push(ex);
  }

  return { problems, valid };
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
 * Versions a reviewed override was supposed to remove from BOTH closures. The residual
 * check is what makes an override a remediation instead of a wish.
 */
export const FORBIDDEN_RESIDUALS = [
  { name: 'nanoid', fixedAt: '3.3.17', pinnedTo: '3.3.18', advisory: 'CVE-2026-67213', severity: 'HIGH' },
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
