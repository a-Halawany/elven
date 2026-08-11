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
import { createHash } from 'node:crypto';
import { splitKey } from './lock-closure.mjs';
import { subjectRef, expectedProperties, SUBJECT_NAME } from './sbom.mjs';

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

    const expectedType = a.componentType;
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

    // ── EXACT property set: no missing, no unknown, no duplicate, no altered value ──
    // Subset checking is what let a rewritten scope, a removed platform constraint or an
    // invented property reconcile "clean".
    const want = new Map(
      expectedProperties(a, targetId).map((p) => [p.name, String(p.value)]),
    );
    const have = new Map(Object.entries(b.properties).map(([k, v]) => [k, String(v)]));
    for (const [name, value] of want) {
      if (!have.has(name)) {
        fieldMismatches.push(`${ref}: required property '${name}' is absent`);
      } else if (have.get(name) !== value) {
        say(`property ${name}`, value, have.get(name));
      }
    }
    for (const name of have.keys()) {
      if (!want.has(name)) {
        fieldMismatches.push(`${ref}: UNKNOWN property '${name}' is not part of the governed set`);
      }
    }

    // Integrity: EXACT multiset of alg:digest pairs in both directions, so a fabricated
    // or extra hash fails just as a missing one does. Workspace identity (importer root,
    // manifest path, manifest digest) is already covered by the exact property set above.
    const wantHashes = expectedHashSet(a.integrity).sort();
    const haveHashes = [...b.hashes].sort();
    if (JSON.stringify(wantHashes) !== JSON.stringify(haveHashes)) {
      const missing = wantHashes.filter((h) => !haveHashes.includes(h));
      const extra = haveHashes.filter((h) => !wantHashes.includes(h));
      for (const h of missing) fieldMismatches.push(`${ref}: integrity hash ${h} is absent from the SBOM`);
      for (const h of extra) fieldMismatches.push(`${ref}: integrity hash ${h} is NOT recorded by the lockfile`);
      if (missing.length === 0 && extra.length === 0) {
        fieldMismatches.push(`${ref}: integrity hash multiplicity differs from the lockfile`);
      }
    }
    // A registry artifact with no verifiable digest is an unverified input. Only
    // first-party workspace components are built from tracked source rather than fetched.
    if (a.kind !== 'workspace' && wantHashes.length === 0 && a.integrityValid !== true) {
      fieldMismatches.push(`${ref}: a REGISTRY component carries no verifiable integrity digest`);
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

  // ── dependency entries for references that are not components at all ──────────
  // An entry for an unknown ref is a defect even when its dependsOn is empty: it asserts
  // the existence of something the BOM never declares.
  const unknownDependencyEntries = [...onDisk.declaredRefCounts.keys()]
    .filter((ref) => ref !== subject && !sbomSet.has(ref))
    .sort();

  // ── subject IDENTITY, field by field ──────────────────────────────────────────
  // The subject is a component identity, not just a label, so every field is compared.
  const expectedSubject = {
    bomRef: subject,
    name: SUBJECT_NAME,
    version: options.expectedSubjectVersion ?? null,
    type: 'application',
    purl: options.expectedSubjectPurl ?? null,
  };
  if (onDisk.subject === null) {
    problems.push('the SBOM declares no metadata.component subject at all');
  } else {
    for (const field of ['bomRef', 'name', 'type', 'version', 'purl']) {
      const want = expectedSubject[field];
      if (want === null) continue;   // not asserted by this caller
      if (onDisk.subject[field] !== want) {
        problems.push(
          `metadata subject ${field} is ${JSON.stringify(onDisk.subject[field])}, ` +
          `expected ${JSON.stringify(want)}`,
        );
      }
    }
  }
  if (!onDisk.declaredRefs.has(subject)) {
    problems.push(`metadata subject ${subject} has NO dependency entry — the BOM graph is disconnected`);
  }

  // ── metadata bindings: EXACT set, no missing and no unknown ────────────────────
  const bindings = options.expectedBindings ?? {};
  for (const [prop, expected] of Object.entries(bindings)) {
    if (onDisk.metadataProperties[prop] !== expected) {
      problems.push(
        `metadata property '${prop}' is ${JSON.stringify(onDisk.metadataProperties[prop] ?? null)}, ` +
        `expected ${JSON.stringify(expected)}`,
      );
    }
  }
  if (options.requireExactBindings === true) {
    for (const prop of Object.keys(onDisk.metadataProperties)) {
      if (!(prop in bindings)) {
        problems.push(`UNKNOWN metadata property '${prop}' is not part of the governed binding set`);
      }
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
    dependency_entries_for_unknown_refs: unknownDependencyEntries,
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
  'components_without_dependency_entry', 'dependency_entries_for_unknown_refs',
  'orphan_components', 'subject_and_binding_problems',
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
 * CODE-OWNED exclusion contract. Deliberately NOT read from the governance document: a
 * document that declares its own required fields can weaken its own validation by editing
 * itself. The document is DATA; this is the policy.
 */
export const EXCLUSION_SCHEMA_VERSIONS = Object.freeze(['3.0.0']);
export const EXCLUSION_REQUIRED_FIELDS = Object.freeze([
  'id', 'target', 'scope', 'resolution_key', 'parent_edge', 'reason',
  'evidence', 'evidence_sha256', 'owner', 'approver', 'approved_on', 'expires_on',
]);

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256_HEX = /^[a-f0-9]{64}$/;

/**
 * ONE EXPLICIT SEMANTIC, chosen and documented: a valid exclusion REMOVES the exact
 * governed node, every edge incident to it, and every descendant that the removal makes
 * UNREACHABLE from the subject/roots — each cascaded removal recorded individually. The
 * result is a graph with no orphan and no dangling reference, which the reconciler then
 * verifies independently.
 *
 * Cascading rather than rejecting is deterministic: reachability from a fixed root set is
 * a function of the graph, so the same exclusion always removes the same set. Leaving a
 * stranded descendant behind would produce exactly the orphan the reconciler must reject.
 */
export function applyExclusions(closure, entries) {
  if (entries.length === 0) {
    return { closure, applied: [], excluded: [], cascaded: [] };
  }

  const directRefs = new Set();
  const applied = [];
  for (const ex of entries) {
    const node = [...closure.nodes.values()].find(
      (n) => n.lockKey === ex.resolution_key || n.bomRef === ex.resolution_key,
    );
    if (node === undefined) continue;
    directRefs.add(node.bomRef);
    applied.push({
      id: ex.id,
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
  if (directRefs.size === 0) return { closure, applied: [], excluded: [], cascaded: [] };

  // Reachability from the surviving roots, over edges that do not touch a removed node.
  const surviving = closure.edges.filter((e) => !directRefs.has(e.from) && !directRefs.has(e.to));
  const adjacency = new Map();
  for (const e of surviving) {
    if (!adjacency.has(e.from)) adjacency.set(e.from, []);
    adjacency.get(e.from).push(e.to);
  }
  const reachable = new Set();
  const stack = closure.roots.filter((r) => !directRefs.has(r));
  while (stack.length > 0) {
    const ref = stack.pop();
    if (reachable.has(ref)) continue;
    reachable.add(ref);
    for (const to of adjacency.get(ref) ?? []) stack.push(to);
  }

  const cascaded = [...closure.nodes.keys()]
    .filter((ref) => !directRefs.has(ref) && !reachable.has(ref))
    .sort();
  const removed = new Set([...directRefs, ...cascaded]);

  const nodes = new Map([...closure.nodes.entries()].filter(([ref]) => !removed.has(ref)));
  const edges = closure.edges.filter((e) => !removed.has(e.from) && !removed.has(e.to));
  const excluded = [...closure.nodes.entries()]
    .filter(([ref]) => removed.has(ref))
    .map(([, n]) => n);

  return {
    closure: { ...closure, nodes, edges, roots: closure.roots.filter((r) => !removed.has(r)) },
    applied: applied.sort((a, b) => (String(a.id) < String(b.id) ? -1 : 1)),
    excluded,
    cascaded: cascaded.map((ref) => ({
      bom_ref: ref,
      reason: 'became unreachable from the subject roots once the governed node was removed',
    })),
  };
}

/**
 * Validate governed exclusions FAIL-CLOSED against the CODE-OWNED contract.
 *
 * `lockUniverse` is every `name@version` the lockfile resolves ANYWHERE, target-independent.
 * It keeps three rules from collapsing into one — and a rule that can never fire is not a
 * rule:
 *   version_changed      — the name IS in this closure, at a different version;
 *   unused_never_applied — the exact version is in the lockfile but not in THIS target's
 *                          closure, so the entry excluded nothing here;
 *   stale_not_in_closure — the exact version is gone from the lockfile entirely.
 */
export function governExclusions(exclusionDoc, closures, lockUniverse = new Set(), nowIso = null, opts = {}) {
  const problems = [];
  const valid = [];
  const entries = exclusionDoc.exclusions ?? [];
  const today = nowIso ?? '1970-01-01';
  const root = opts.root ?? null;
  const isTracked = opts.isTracked;
  const readEvidence = opts.readEvidence;

  // ── the document may not redefine its own policy ──
  if (!EXCLUSION_SCHEMA_VERSIONS.includes(exclusionDoc.schema_version)) {
    problems.push(
      `closure-exclusions schema_version ${JSON.stringify(exclusionDoc.schema_version)} is not one ` +
      `of the code-owned supported versions (${EXCLUSION_SCHEMA_VERSIONS.join(', ')})`,
    );
  }
  if (Array.isArray(exclusionDoc.required_fields)) {
    const declared = [...exclusionDoc.required_fields].sort().join(',');
    const owned = [...EXCLUSION_REQUIRED_FIELDS].sort().join(',');
    if (declared !== owned) {
      problems.push(
        'closure-exclusions declares a required_fields list that differs from the code-owned ' +
        `set. Declared: ${declared}. Code-owned: ${owned}. A document cannot weaken its own ` +
        'validation.',
      );
    }
  }

  const seenIds = new Set();
  const seenEntries = new Map();

  for (const [i, ex] of entries.entries()) {
    const where = `exclusions[${i}]${typeof ex.id === 'string' ? ` (${ex.id})` : ''}`;
    let fatal = false;

    for (const field of EXCLUSION_REQUIRED_FIELDS) {
      const value = ex[field];
      const empty = value === undefined || value === null ||
        (typeof value === 'string' && value.trim() === '') ||
        (typeof value === 'object' && Object.keys(value).length === 0);
      if (empty) {
        problems.push(`${where}: missing required field '${field}'`);
        fatal = true;
      }
    }

    if (typeof ex.id === 'string') {
      if (seenIds.has(ex.id)) {
        problems.push(`${where}: duplicate exclusion id '${ex.id}'`);
        fatal = true;
      }
      seenIds.add(ex.id);
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

    // DUPLICATE ENTRY: same target + resolution key, even if it would remove one node.
    const entryKey = `${ex.target}|${key}`;
    if (seenEntries.has(entryKey)) {
      problems.push(
        `${where}: duplicate entry — ${seenEntries.get(entryKey)} already excludes '${key}' from ` +
        `target '${ex.target}'. Two records for one removal make the applied cardinality ambiguous.`,
      );
      fatal = true;
    } else {
      seenEntries.set(entryKey, where);
    }

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
        `${where}: rejected by 'unapproved' — approver '${ex.approver}' is the same party as the ` +
        'owner; an exclusion cannot approve itself',
      );
      fatal = true;
    }
    // Chronology: approved in the past, expiring after approval, not yet expired.
    if (ISO_DATE.test(String(ex.approved_on)) && ISO_DATE.test(String(ex.expires_on))) {
      if (ex.approved_on > today) {
        problems.push(`${where}: rejected by 'future_approval' — approved_on ${ex.approved_on} is after the run date ${today}`);
        fatal = true;
      }
      if (ex.expires_on <= ex.approved_on) {
        problems.push(`${where}: expires_on ${ex.expires_on} is not after approved_on ${ex.approved_on}`);
        fatal = true;
      }
      if (ex.expires_on < today) {
        problems.push(`${where}: rejected by 'expired' — expires_on ${ex.expires_on} is before the run date ${today}`);
        fatal = true;
      }
    }

    // EVIDENCE must be repository-relative, tracked, present, and digest-matched.
    if (typeof ex.evidence === 'string' && ex.evidence !== '') {
      if (ex.evidence.startsWith('/') || ex.evidence.includes('..')) {
        problems.push(`${where}: evidence '${ex.evidence}' must be a repository-relative path`);
        fatal = true;
      } else {
        if (isTracked !== undefined && !isTracked(ex.evidence)) {
          problems.push(`${where}: evidence '${ex.evidence}' is not tracked in version control`);
          fatal = true;
        }
        if (readEvidence !== undefined) {
          const bytes = readEvidence(ex.evidence);
          if (bytes === null) {
            problems.push(`${where}: evidence '${ex.evidence}' does not exist`);
            fatal = true;
          } else if (SHA256_HEX.test(String(ex.evidence_sha256))) {
            const actual = createHash('sha256').update(bytes).digest('hex');
            if (actual !== ex.evidence_sha256) {
              problems.push(
                `${where}: evidence digest mismatch — '${ex.evidence}' hashes to ${actual}, ` +
                `the record claims ${ex.evidence_sha256}`,
              );
              fatal = true;
            }
          }
        }
      }
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
    const node = [...closure.nodes.values()].find((n) => n.lockKey === key || n.bomRef === key);

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

    // The declared scope must be one the node actually holds, not merely a target scope.
    if (!node.scopes.has(ex.scope)) {
      problems.push(
        `${where}: rejected by 'wrong_target' — '${key}' holds scopes ` +
        `[${[...node.scopes].sort().join(', ')}] in ${ex.target}, not '${ex.scope}'`,
      );
      continue;
    }

    // PARENT EDGE must be a real edge AND must terminate at the excluded component.
    const parentEdge = String(ex.parent_edge);
    const normalized = parentEdge.replace(' -> ', ' ');
    const realEdge = closure.edges.find((e) => `${e.from} ${e.to}` === normalized);
    if (realEdge === undefined) {
      problems.push(
        `${where}: rejected by 'wrong_parent' — parent_edge '${parentEdge}' is not an edge of the ` +
        `${ex.target} closure`,
      );
      continue;
    }
    if (realEdge.to !== node.bomRef) {
      problems.push(
        `${where}: rejected by 'wrong_parent' — parent_edge '${parentEdge}' terminates at ` +
        `'${realEdge.to}', not at the excluded component '${node.bomRef}'`,
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

  return { problems, valid, declared: entries.length };
}

/** Cardinalities that must agree exactly, or the applied set is not the governed set. */
export function checkExclusionCardinality({ declared, rejected, valid, applied, removedNodes, cascaded }) {
  const problems = [];
  if (declared !== valid + rejected) {
    problems.push(
      `exclusion cardinality: ${declared} declared but ${valid} valid + ${rejected} rejected`,
    );
  }
  if (valid !== applied) {
    problems.push(
      `exclusion cardinality: ${valid} valid entries but ${applied} applied; every valid ` +
      'exclusion must remove exactly one governed node',
    );
  }
  if (removedNodes !== applied + cascaded) {
    problems.push(
      `exclusion cardinality: ${removedNodes} nodes removed but ${applied} applied + ` +
      `${cascaded} cascaded`,
    );
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
