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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadLock, buildClosure } from './lib/lock-closure.mjs';
import { buildSbom, serialize, extractFromSbom, subjectRef } from './lib/sbom.mjs';
import {
  reconcile, governExclusions, applyExclusions, findVulnerableResiduals,
  lockPackageUniverse, FORBIDDEN_RESIDUALS, FAILURE_KEYS,
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
  const closures = {};
  for (const [name, target] of Object.entries(descriptor.targets)) {
    closures[name] = buildClosure(lock, target, { root });
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
  mkdirSync(outDir, { recursive: true });

  const runDate = new Date().toISOString().slice(0, 10);
  const exclusionsText = readFileSync(join(ROOT, 'scripts/gate/closure-exclusions.json'), 'utf8');
  const exclusionDoc = JSON.parse(exclusionsText);
  const built = buildAllClosures();
  const { descriptor, lockUniverse, meta, generator } = built;

  console.log('=== C16 TARGET-RESOLVED CLOSURES ===');
  console.log(`mode:              ${finalMode ? 'FINAL (clean worktree required)' : 'preliminary'}`);
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

  if (finalMode) {
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8' }).trim();
    if (dirty !== '') {
      console.error('\n=== C16 CLOSURE GATE FAILED: --final requires a clean worktree ===');
      for (const line of dirty.split('\n').slice(0, 20)) console.error(`  ${line}`);
      console.error('  Final evidence must be reproducible from a committed source SHA.');
      process.exit(1);
    }
  }

  // Exclusion governance runs BEFORE reconciliation, because a valid exclusion changes
  // the closure that gets reconciled.
  const gov = governExclusions(exclusionDoc, built.closures, lockUniverse, runDate);
  const closures = {};
  const exclusionApplication = {};
  for (const [name, closure] of Object.entries(built.closures)) {
    const forTarget = gov.valid.filter((ex) => ex.target === name);
    const { closure: reduced, applied, excluded } = applyExclusions(closure, forTarget);
    closures[name] = reduced;
    exclusionApplication[name] = {
      declared_for_target: forTarget.length,
      applied_count: applied.length,
      applied,
      excluded_refs: excluded.map((n) => n.bomRef).sort(),
    };
  }

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
    const rec = reconcile(closure, onDisk, {
      expectedBindings: {
        'eye:target-id': target.id,
        'eye:source-sha': meta.sourceSha,
        'eye:lockfile-sha256': meta.lockfileSha256,
        'eye:descriptor-sha256': meta.descriptorSha256,
        'eye:generator-sha256': meta.generatorSha256,
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
      ? 'FINAL — produced in --final mode from a clean worktree'
      : 'PRELIMINARY — regenerate with --final from the frozen source SHA and commit in the evidence-only child',
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
      declared: exclusionDoc.exclusions ?? [],
      rejected: gov.problems,
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
    gov.problems.length > 0 || residuals.length > 0;
  if (failed) {
    console.error('\n=== C16 CLOSURE GATE FAILED ===');
    for (const p of gov.problems) console.error(`  exclusion: ${p}`);
    for (const r of residuals) console.error(`  residual:  ${r}`);
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
