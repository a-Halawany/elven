/**
 * C16 RUNNER — generate the two target-resolved closures, serialize them, RE-READ them
 * from disk, and reconcile the lock-derived graph against the SBOM graph in BOTH
 * directions over component multiplicity, edge multiplicity and every required field.
 *
 * WHY THE RE-READ MATTERS. Gate-2.1 compared an SBOM against a structure derived from
 * that same SBOM (and against a licence inventory derived from it in turn). That is
 * self-reconciliation: it cannot fail, so it evidences nothing. Here the two sides have
 * independent provenance —
 *   side A: the closure computed from pnpm-lock.yaml (importers + packages + snapshots)
 *           plus the target descriptor;
 *   side B: the SBOM parsed back from the bytes actually written to disk.
 * Nothing from side A is consulted when parsing side B.
 *
 * CLOSURE TRUTH is the lockfile plus the target descriptor. node_modules, the host
 * platform, `pnpm licenses list` and the SBOM itself are all forbidden as closure truth
 * (see closure_truth.forbidden_sources in the descriptor) and are never read.
 *
 * Usage:
 *   node scripts/gate/generate-closures.mjs [--out DIR] [--final]
 *
 *   --final   evidence mode: additionally require a clean git worktree, so a
 *             final artifact can never be produced from uncommitted source.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync, spawnSync } from 'node:child_process';
import { loadLock, buildClosure, ALLOWED_COMPONENT_TYPES } from './lib/lock-closure.mjs';
import { buildSbom, serialize, extractFromSbom, subjectRef, SUBJECT_NAME } from './lib/sbom.mjs';
import { npmPurl } from './lib/lock-closure.mjs';

const subjectPurl = (version) => npmPurl(SUBJECT_NAME, version);
import {
  reconcile, governExclusions, applyExclusions, checkExclusionCardinality,
  findVulnerableResiduals, lockPackageUniverse, FORBIDDEN_RESIDUALS, FAILURE_KEYS,
  EXCLUSION_REQUIRED_FIELDS,
} from './lib/reconcile.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/** The exact-pinned third-party implementations this gate depends on. */
const PINNED_LIBS = { 'packageurl-js': '2.0.1', yaml: '2.9.0' };

/**
 * Digest of the generator itself: the runner plus every library it uses. A changed
 * generator produces a different binding, so an SBOM can never be attributed to code
 * that did not produce it.
 */
/**
 * git, but tolerant of a non-worktree export AND newline-normalised.
 *
 * `execFileSync` returns stdout verbatim, so `git rev-parse HEAD` ends with a newline.
 * Comparing that against an --expected-sha argument made the correct SHA compare unequal
 * to itself, so final mode could never succeed. Normalising at the single point where git
 * output enters the program is the fix; trimming at each call site is how one gets missed.
 */
function safeGit(args) {
  try {
    return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).replace(/\s+$/, '');
  } catch {
    return null;
  }
}

export function generatorDigest(root = ROOT) {
  const files = [
    'scripts/gate/generate-closures.mjs',
    'scripts/gate/lib/lock-closure.mjs',
    'scripts/gate/lib/sbom.mjs',
    'scripts/gate/lib/reconcile.mjs',
  ];
  const parts = files.map((f) => `${f}:${sha256(readFileSync(join(root, f), 'utf8'))}`);
  return { digest: sha256(parts.join('\n')), files: parts };
}

/** Verify the pinned libraries resolve to their exact expected versions. */
function verifyPinnedLibs(root = ROOT) {
  const problems = [];
  const resolved = {};
  const manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  for (const [name, expected] of Object.entries(PINNED_LIBS)) {
    const declared = manifest.devDependencies?.[name];
    if (declared !== expected) {
      problems.push(`${name}: package.json declares ${JSON.stringify(declared)}, expected exactly ${expected}`);
    }
    let actual = null;
    try {
      actual = JSON.parse(
        readFileSync(join(root, 'node_modules', name, 'package.json'), 'utf8'),
      ).version;
    } catch {
      actual = '(not installed)';
    }
    resolved[name] = { expected, declared: declared ?? null, installed: actual };
    if (actual !== expected) {
      problems.push(`${name}: installed ${actual}, expected exactly ${expected}`);
    }
  }
  return { resolved, problems };
}

/** Build every target closure declared in the descriptor. */
export function buildAllClosures(root = ROOT) {
  const lockText = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');
  const descriptorText = readFileSync(join(root, 'scripts/gate/target-descriptor.json'), 'utf8');
  const lock = loadLock(join(root, 'pnpm-lock.yaml'));
  const descriptor = JSON.parse(descriptorText);
  const firstPartyTypes = descriptor.first_party_component_types?.by_importer_root ?? {};
  const closures = {};
  for (const [name, target] of Object.entries(descriptor.targets)) {
    closures[name] = buildClosure(
      lock,
      { ...target, integrity_rules: descriptor.integrity_rules?.rules ?? [] },
      { root, firstPartyTypes, allowedComponentTypes: ALLOWED_COMPONENT_TYPES },
    );
  }
  let sourceSha = '(not a git worktree)';
  try {
    sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
  } catch { /* a source archive without .git is still reconcilable */ }
  const gen = generatorDigest(root);
  return {
    closures,
    descriptor,
    lock,
    lockUniverse: lockPackageUniverse(lock),
    generator: gen,
    meta: {
      projectVersion: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version ?? '0.0.0',
      lockfileSha256: sha256(lockText),
      descriptorSha256: sha256(descriptorText),
      sourceSha,
      generatorSha256: gen.digest,
      purlImplementation: `packageurl-js@${PINNED_LIBS['packageurl-js']}`,
      yamlImplementation: `yaml@${PINNED_LIBS.yaml}`,
    },
  };
}

export function countsOf(closure) {
  return {
    nodes: closure.nodes.size,
    edges: closure.edges.length,
    workspace_nodes: [...closure.nodes.values()].filter((n) => n.kind === 'workspace').length,
    registry_nodes: [...closure.nodes.values()].filter((n) => n.kind !== 'workspace').length,
    peer_variant_nodes: [...closure.nodes.values()].filter((n) => n.peerSuffix !== '').length,
    patched_nodes: [...closure.nodes.values()].filter((n) => n.patchHash !== null).length,
    platform_excluded: closure.excludedByPlatform.length,
    leaf_nodes: [...closure.nodes.keys()].filter((r) => !closure.edges.some((e) => e.from === r)).length,
    subject_root_edges: closure.roots.length,
  };
}

export function main(argv = process.argv) {
  const outIdx = argv.indexOf('--out');
  const outArg = outIdx !== -1 ? argv[outIdx + 1] : 'evidence/supply-chain/c16';
  const outDir = isAbsolute(outArg) ? resolve(outArg) : join(ROOT, outArg);
  const finalMode = argv.includes('--final');
  const shaIdx = argv.indexOf('--expected-sha');
  const expectedSha = shaIdx !== -1 ? argv[shaIdx + 1] : null;
  let state_finalPosture = null;
  mkdirSync(outDir, { recursive: true });

  const runDate = new Date().toISOString().slice(0, 10);
  const exclusionsText = readFileSync(join(ROOT, 'scripts/gate/closure-exclusions.json'), 'utf8');
  const exclusionDoc = JSON.parse(exclusionsText);
  const built = buildAllClosures();
  const { descriptor, lockUniverse, meta, generator } = built;

  console.log('=== C16 TARGET-RESOLVED CLOSURES ===');
  console.log(`mode:              ${finalMode ? 'FINAL (expected SHA + clean worktree required)' : 'preliminary'}`);
  console.log('closure truth:     pnpm-lock.yaml + scripts/gate/target-descriptor.json');
  console.log(`forbidden sources: ${descriptor.closure_truth.forbidden_sources.join(', ')}`);
  console.log(`source SHA:        ${meta.sourceSha}`);
  console.log(`lockfile sha256:   ${meta.lockfileSha256}`);
  console.log(`descriptor sha256: ${meta.descriptorSha256}`);
  console.log(`generator sha256:  ${meta.generatorSha256}`);

  // Pinned implementations: a canonical PURL from an unknown encoder is not canonical.
  const libs = verifyPinnedLibs();
  for (const [name, r] of Object.entries(libs.resolved)) {
    console.log(`  ${r.installed === r.expected ? 'pinned' : 'MISPINNED'}  ${name} = ${r.installed} (expected ${r.expected})`);
  }
  if (libs.problems.length > 0) {
    console.error('\n=== C16 CLOSURE GATE FAILED: implementation not pinned ===');
    for (const p of libs.problems) console.error(`  ${p}`);
    process.exit(1);
  }

  // ── FINAL-SOURCE BINDING ───────────────────────────────────────────────────────
  // A gitless export stamped "(not a git worktree)" is acceptable only as PRELIMINARY
  // equivalence evidence — it names no commit, so nothing binds the artifact to a
  // reviewable source. Final mode therefore requires an EXPLICIT expected SHA, verifies
  // HEAD equals it, requires a clean worktree, and rejects unmanaged ignored inputs that
  // could affect the closure.
  if (finalMode) {
    const problems = [];
    if (expectedSha === null || expectedSha === undefined) {
      problems.push('--final requires --expected-sha <SHA>: final evidence must name the source it describes');
    }
    if (meta.sourceSha === '(not a git worktree)') {
      problems.push(
        'this tree is not a git worktree, so no commit can be bound. A gitless export is ' +
        'preliminary equivalence evidence only, never final source binding.',
      );
    } else if (expectedSha !== null && expectedSha !== meta.sourceSha) {
      problems.push(`--expected-sha ${expectedSha} does not match HEAD ${meta.sourceSha}`);
    }
    const dirty = safeGit(['status', '--porcelain']);
    if (dirty === null) {
      problems.push('git status could not be read; a clean worktree cannot be established');
    } else if (dirty.trim() !== '') {
      problems.push(`--final requires a clean worktree; ${dirty.trim().split('\n').length} path(s) are dirty`);
    }
    // Ignored-but-present inputs that would change the closure if read. The generator
    // never reads them, which is exactly why their presence must be stated rather than
    // assumed harmless.
    const ignoredInputs = ['node_modules', 'evidence/supply-chain/c16']
      .filter((rel) => existsSync(join(ROOT, rel)));
    state_finalPosture = {
      expected_sha: expectedSha,
      head_sha: meta.sourceSha,
      worktree_clean: dirty !== null && dirty.trim() === '',
      ignored_inputs_present: ignoredInputs,
      ignored_inputs_are_not_closure_truth: true,
    };
    if (problems.length > 0) {
      console.error('\n=== C16 CLOSURE GATE FAILED: final-source binding ===');
      for (const p of problems) console.error(`  ${p}`);
      process.exit(1);
    }
  }

  // Exclusion governance runs BEFORE reconciliation, because a valid exclusion changes
  // the closure that gets reconciled.
  const isTracked = (rel) =>
    spawnSync('git', ['ls-files', '--error-unmatch', rel], { cwd: ROOT, encoding: 'utf8' }).status === 0;
  const readEvidence = (rel) => {
    try {
      return readFileSync(join(ROOT, rel));
    } catch {
      return null;
    }
  };

  const gov = governExclusions(exclusionDoc, built.closures, lockUniverse, runDate, {
    root: ROOT, isTracked, readEvidence,
  });
  const closures = {};
  const exclusionApplication = {};
  const cardinalityProblems = [];
  for (const [name, closure] of Object.entries(built.closures)) {
    const forTarget = gov.valid.filter((ex) => ex.target === name);
    const before = closure.nodes.size;
    const { closure: reduced, applied, excluded, cascaded } = applyExclusions(closure, forTarget);
    closures[name] = reduced;
    exclusionApplication[name] = {
      valid_for_target: forTarget.length,
      applied_count: applied.length,
      cascaded_count: cascaded.length,
      nodes_before: before,
      nodes_after: reduced.nodes.size,
      removed_nodes: before - reduced.nodes.size,
      applied,
      cascaded,
      excluded_refs: excluded.map((n) => n.bomRef).sort(),
    };
    // Cardinalities must agree exactly, or the applied set is not the governed set.
    cardinalityProblems.push(...checkExclusionCardinality({
      declared: forTarget.length,
      rejected: 0,
      valid: forTarget.length,
      applied: applied.length,
      removedNodes: before - reduced.nodes.size,
      cascaded: cascaded.length,
    }).map((p) => `${name}: ${p}`));
  }
  // Whole-document cardinality: nothing may be silently dropped between stages.
  cardinalityProblems.push(...checkExclusionCardinality({
    declared: gov.declared,
    rejected: gov.problems.length > 0 ? gov.declared - gov.valid.length : 0,
    valid: gov.valid.length,
    applied: Object.values(exclusionApplication).reduce((a, x) => a + x.applied_count, 0),
    removedNodes: Object.values(exclusionApplication).reduce((a, x) => a + x.removed_nodes, 0),
    cascaded: Object.values(exclusionApplication).reduce((a, x) => a + x.cascaded_count, 0),
  }).map((p) => `document: ${p}`));

  const reports = {};
  for (const [name, closure] of Object.entries(closures)) {
    const target = closure.target;
    if (closure.unresolved.length > 0) {
      console.error(`\n${name}: UNRESOLVED lockfile references (closure is incomplete):`);
      for (const m of closure.unresolved.slice(0, 20)) console.error(`  ${m}`);
      console.error('  Every required AND optional reference must resolve; the gate fails closed.');
      process.exit(1);
    }

    const doc = buildSbom(closure, meta);
    const text = serialize(doc);
    const file = join(outDir, `sbom-${target.id}.cdx.json`);
    writeFileSync(file, text);

    // RE-READ FROM DISK. Reconciliation never touches the in-memory document.
    const onDiskText = readFileSync(file, 'utf8');
    const onDisk = extractFromSbom(onDiskText);
    // The COMPLETE governed binding set. `requireExactBindings` additionally rejects any
    // metadata property that is not in this set, so a binding cannot be quietly added.
    const rec = reconcile(closure, onDisk, {
      requireExactBindings: true,
      expectedDocument: {
        bomFormat: 'CycloneDX',
        specVersion: '1.6',
        version: 1,
        serialNumber: doc.serialNumber,
      },
      expectedSubjectVersion: meta.projectVersion,
      expectedSubjectType: 'application',
      expectedSubjectPurl: subjectPurl(meta.projectVersion),
      expectedSubjectDescription: target.description,
      expectedBindings: {
        'eye:target-id': target.id,
        'eye:target-os': target.os,
        'eye:target-arch': target.arch,
        'eye:target-libc': target.libc,
        'eye:target-node': target.node.pinned,
        'eye:target-pnpm': target.pnpm.pinned,
        'eye:importer-roots': target.importer_roots.join(','),
        'eye:dependency-scopes': target.dependency_scopes.join(','),
        'eye:closure-source': 'pnpm-lock.yaml (importers+packages+snapshots)',
        'eye:source-sha': meta.sourceSha,
        'eye:lockfile-sha256': meta.lockfileSha256,
        'eye:descriptor-sha256': meta.descriptorSha256,
        'eye:generator': 'scripts/gate/generate-closures.mjs',
        'eye:generator-sha256': meta.generatorSha256,
        'eye:purl-implementation': meta.purlImplementation,
        'eye:yaml-implementation': meta.yamlImplementation,
      },
    });

    reports[name] = {
      target,
      sbom_file: `sbom-${target.id}.cdx.json`,
      sbom_sha256: sha256(onDiskText),
      sbom_bytes: Buffer.byteLength(onDiskText),
      serial_number: doc.serialNumber,
      subject_ref: subjectRef(target.id),
      counts: countsOf(closure),
      scope_distribution: scopeDistribution(closure),
      workspace_identities: [...closure.nodes.values()]
        .filter((n) => n.kind === 'workspace')
        .map((n) => ({
          importer_root: n.importerPath, name: n.name, version: n.version, purl: n.purl,
          manifest: n.manifestPath, manifest_sha256: n.manifestSha256,
        }))
        .sort((a, b) => (a.importer_root < b.importer_root ? -1 : 1)),
      platform_exclusions: closure.excludedByPlatform,
      governed_exclusions_applied: exclusionApplication[name],
      reconciliation: rec,
    };

    const c = reports[name].counts;
    console.log(`\n${name} (${target.id}):`);
    console.log(`  scopes            ${target.dependency_scopes.join(', ')}`);
    console.log(`  importer roots    ${target.importer_roots.join(', ')}`);
    console.log(`  components        ${c.nodes} (workspace ${c.workspace_nodes}, registry ${c.registry_nodes}, peer-variants ${c.peer_variant_nodes}, leaves ${c.leaf_nodes})`);
    console.log(`  edges             ${c.edges} + ${c.subject_root_edges} subject->root`);
    console.log(`  platform-excluded ${c.platform_excluded}`);
    console.log(`  scope membership  ${JSON.stringify(reports[name].scope_distribution)}`);
    console.log(`  workspace ids     ${reports[name].workspace_identities.map((w) => `${w.name}@${w.version}`).join(', ')}`);
    console.log(`  lock <-> sbom     nodes ${rec.lock_nodes}/${rec.sbom_nodes}, edges ${rec.lock_edges}/${rec.sbom_edges}`);
    console.log(`  subject->root     ${rec.subject_root_edges_present}/${rec.subject_root_edges_expected}`);
    console.log(`  reconciliation    ${rec.clean ? 'CLEAN in both directions (full-field, multiset)' : 'DIFFERENCES FOUND'}`);
    if (!rec.clean) {
      for (const k of FAILURE_KEYS) {
        if (rec[k].length > 0) console.log(`    ${k} (${rec[k].length}): ${rec[k].slice(0, 3).join(' | ')}`);
      }
    }
  }

  const residuals = findVulnerableResiduals(closures);
  const overrideProof = FORBIDDEN_RESIDUALS.map((f) => ({
    package: f.name,
    advisory: f.advisory,
    severity: f.severity,
    vulnerable_below: f.fixedAt,
    pinned_exact: f.pinnedTo,
    resolved_per_target: Object.fromEntries(
      Object.entries(closures).map(([name, closure]) => [
        name,
        [...closure.nodes.values()].filter((n) => n.name === f.name).map((n) => n.version).sort(),
      ]),
    ),
  }));

  const declared = (exclusionDoc.exclusions ?? []).length;
  const appliedTotal = Object.values(exclusionApplication).reduce((a, x) => a + x.applied_count, 0);
  console.log(`\ngoverned exclusions:  ${declared} declared, ${gov.problems.length} rejected, ${appliedTotal} applied`);
  for (const p of overrideProof) {
    const resolvedStr = Object.entries(p.resolved_per_target)
      .map(([t, v]) => `${t}=${v.length > 0 ? v.join('/') : 'absent'}`).join(' ');
    console.log(`override residual:    ${p.package} pinned ${p.pinned_exact} (${p.advisory} fixed at ${p.vulnerable_below}) -> ${resolvedStr}`);
  }
  console.log(`vulnerable residuals: ${residuals.length}`);

  const report = {
    artifact: 'C16 target-resolved dependency closures + full-field bidirectional reconciliation',
    status: finalMode
      ? 'FINAL — produced in --final mode from a clean worktree at an explicitly expected source SHA'
      : 'PRELIMINARY — regenerate with --final --expected-sha <SHA> from the frozen source and commit in the evidence-only child',
    final_source_posture: state_finalPosture,
    remediation:
      'Remediated after independent source review of e3a0b1f: canonical PURLs via the ' +
      'exact-pinned reference implementation, real workspace identities, exact-pinned YAML ' +
      'parser, recursive cycle-safe link traversal, fail-closed unresolved references, ' +
      'fixed-point scope membership, mixed positive/negative platform constraints, ' +
      'subject-to-root edges, full-field multiset reconciliation, and operational exclusions.',
    generated_from: {
      lockfile: 'pnpm-lock.yaml',
      lockfile_sha256: meta.lockfileSha256,
      target_descriptor: 'scripts/gate/target-descriptor.json',
      descriptor_sha256: meta.descriptorSha256,
      exclusions: 'scripts/gate/closure-exclusions.json',
      exclusions_sha256: sha256(exclusionsText),
      generator: 'scripts/gate/generate-closures.mjs',
      generator_sha256: generator.digest,
      generator_files: generator.files,
      pinned_implementations: libs.resolved,
      source_sha: meta.sourceSha,
      run_date: runDate,
    },
    determinism_contract: {
      serial_number: 'SHA-256 of the component/dependency/metadata content, shaped into a UUID',
      metadata_timestamp: 'deliberately omitted',
      collections: 'explicitly sorted',
      node_modules_read: false,
      host_platform_read: false,
      reconciliation_reads_sbom_from_disk: true,
    },
    targets: reports,
    governed_exclusions: {
      schema_version: exclusionDoc.schema_version,
      semantic: exclusionDoc.semantic,
      required_fields: exclusionDoc.required_fields,
      rejection_rules: exclusionDoc.rejection_rules,
      code_owned_required_fields: EXCLUSION_REQUIRED_FIELDS,
      declared: exclusionDoc.exclusions ?? [],
      rejected: gov.problems,
      cardinality_problems: cardinalityProblems,
      applied_per_target: exclusionApplication,
    },
    override_residual_proof: overrideProof,
    vulnerable_residuals: residuals,
  };
  const reportText = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(join(outDir, 'closure-reconciliation.json'), reportText);
  console.log(`\nreport: ${join(outDir, 'closure-reconciliation.json')}`);
  for (const [name, r] of Object.entries(reports)) {
    console.log(`  ${name} sbom sha256: ${r.sbom_sha256}`);
  }

  const failed =
    Object.values(reports).some((r) => !r.reconciliation.clean) ||
    gov.problems.length > 0 || cardinalityProblems.length > 0 || residuals.length > 0;
  if (failed) {
    console.error('\n=== C16 CLOSURE GATE FAILED ===');
    for (const p of gov.problems) console.error(`  exclusion:   ${p}`);
    for (const p of cardinalityProblems) console.error(`  cardinality: ${p}`);
    for (const r of residuals) console.error(`  residual:    ${r}`);
    process.exitCode = 1;
    return report;
  }
  console.log('\nC16 closure gate: PASS');
  return report;
}

function scopeDistribution(closure) {
  const out = {};
  for (const n of closure.nodes.values()) {
    const k = [...n.scopes].sort().join('+') || '(none)';
    out[k] = (out[k] ?? 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort());
}

// Only run when invoked as a script — the negative controls import this module.
if (process.argv[1] !== undefined &&
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
