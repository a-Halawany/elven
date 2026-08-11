/**
 * C16 RUNNER — generate the two target-resolved closures, serialize them, RE-READ
 * them from disk, and reconcile the lock-derived graph against the SBOM graph in
 * BOTH directions, per target.
 *
 * WHY THE RE-READ MATTERS. Gate-2.1 compared an SBOM against a structure derived
 * from that same SBOM (and against a licence inventory derived from it in turn).
 * That is self-reconciliation: it cannot fail, so it evidences nothing. Here the two
 * sides have independent provenance —
 *   side A: the closure computed from pnpm-lock.yaml (importers + packages + snapshots);
 *   side B: the SBOM parsed back from the bytes actually written to disk.
 * Nothing from side A is consulted when parsing side B.
 *
 * CLOSURE TRUTH is the lockfile plus the target descriptor. node_modules, the host
 * platform, `pnpm licenses list` and the SBOM itself are all forbidden as closure
 * truth (see closure_truth.forbidden_sources in the descriptor) and are never read.
 *
 * Usage:
 *   node scripts/gate/generate-closures.mjs [--out DIR]
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, dirname, isAbsolute, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { loadLock, buildClosure } from './lib/lock-closure.mjs';
import { buildSbom, serialize, extractFromSbom } from './lib/sbom.mjs';
import {
  reconcile, governExclusions, findVulnerableResiduals, lockPackageUniverse, FORBIDDEN_RESIDUALS,
} from './lib/reconcile.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/**
 * Build every target closure declared in the descriptor. Exported so the negative
 * controls exercise exactly the closure the gate ships, not a re-implementation.
 */
export function buildAllClosures(root = ROOT) {
  const lockText = readFileSync(join(root, 'pnpm-lock.yaml'), 'utf8');
  const descriptorText = readFileSync(join(root, 'scripts/gate/target-descriptor.json'), 'utf8');
  const lock = loadLock(join(root, 'pnpm-lock.yaml'));
  const descriptor = JSON.parse(descriptorText);
  const closures = {};
  for (const [name, target] of Object.entries(descriptor.targets)) {
    closures[name] = buildClosure(lock, target);
  }
  return {
    closures,
    descriptor,
    lock,
    lockUniverse: lockPackageUniverse(lock),
    meta: {
      projectVersion: JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version ?? '0.0.0',
      lockfileSha256: sha256(lockText),
      descriptorSha256: sha256(descriptorText),
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
    platform_excluded: closure.excludedByPlatform.length,
    leaf_nodes: [...closure.nodes.keys()].filter((r) => !closure.edges.some((e) => e.from === r)).length,
  };
}

export function main(argv = process.argv) {
  const outIdx = argv.indexOf('--out');
  const outArg = outIdx !== -1 ? argv[outIdx + 1] : 'evidence/supply-chain/c16';
  const outDir = isAbsolute(outArg) ? resolve(outArg) : join(ROOT, outArg);
  mkdirSync(outDir, { recursive: true });

  const exclusionsText = readFileSync(join(ROOT, 'scripts/gate/closure-exclusions.json'), 'utf8');
  const exclusionDoc = JSON.parse(exclusionsText);
  const { closures, descriptor, lockUniverse, meta } = buildAllClosures();

  console.log('=== C16 TARGET-RESOLVED CLOSURES ===');
  console.log('closure truth:     pnpm-lock.yaml + scripts/gate/target-descriptor.json');
  console.log(`forbidden sources: ${descriptor.closure_truth.forbidden_sources.join(', ')}`);
  console.log(`lockfile sha256:   ${meta.lockfileSha256}`);
  console.log(`descriptor sha256: ${meta.descriptorSha256}`);

  const reports = {};
  for (const [name, closure] of Object.entries(closures)) {
    const target = closure.target;
    if (closure.missingSnapshots.length > 0) {
      console.error(`\n${name}: UNRESOLVED lockfile references (closure is incomplete):`);
      for (const m of closure.missingSnapshots.slice(0, 20)) console.error(`  ${m}`);
      process.exit(1);
    }

    const doc = buildSbom(closure, meta);
    const text = serialize(doc);
    const file = join(outDir, `sbom-${target.id}.cdx.json`);
    writeFileSync(file, text);

    // RE-READ FROM DISK. Reconciliation never touches the in-memory document.
    const onDisk = extractFromSbom(readFileSync(file, 'utf8'));
    const rec = reconcile(closure, onDisk);

    reports[name] = {
      target,
      sbom_file: `sbom-${target.id}.cdx.json`,
      sbom_sha256: sha256(text),
      serial_number: doc.serialNumber,
      counts: countsOf(closure),
      platform_exclusions: closure.excludedByPlatform,
      reconciliation: rec,
    };

    const c = reports[name].counts;
    console.log(`\n${name} (${target.id}):`);
    console.log(`  scopes            ${target.dependency_scopes.join(', ')}`);
    console.log(`  importer roots    ${target.importer_roots.join(', ')}`);
    console.log(`  components        ${c.nodes} (workspace ${c.workspace_nodes}, registry ${c.registry_nodes}, peer-variants ${c.peer_variant_nodes}, leaves ${c.leaf_nodes})`);
    console.log(`  edges             ${c.edges}`);
    console.log(`  platform-excluded ${c.platform_excluded}`);
    console.log(`  lock -> sbom      nodes ${rec.lock_nodes}/${rec.sbom_nodes}, edges ${rec.lock_edges}/${rec.sbom_edges}`);
    console.log(`  reconciliation    ${rec.clean ? 'CLEAN in both directions' : 'DIFFERENCES FOUND'}`);
    if (!rec.clean) {
      for (const k of ['missing_nodes', 'extra_nodes', 'missing_edges', 'extra_edges',
        'identity_mismatches', 'dangling_references', 'components_without_dependency_entry',
        'orphan_components']) {
        if (rec[k].length > 0) {
          console.log(`    ${k} (${rec[k].length}): ${rec[k].slice(0, 3).join(' | ')}`);
        }
      }
    }
  }

  const exclusionProblems = governExclusions(exclusionDoc, closures, lockUniverse);
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

  console.log(`\ngoverned exclusions:  ${(exclusionDoc.exclusions ?? []).length} declared, ${exclusionProblems.length} rejected`);
  for (const p of overrideProof) {
    const resolved = Object.entries(p.resolved_per_target)
      .map(([t, v]) => `${t}=${v.length > 0 ? v.join('/') : 'absent'}`).join(' ');
    console.log(`override residual:    ${p.package} pinned ${p.pinned_exact} (${p.advisory} fixed at ${p.vulnerable_below}) -> ${resolved}`);
  }
  console.log(`vulnerable residuals: ${residuals.length}`);

  const report = {
    artifact: 'C16 target-resolved dependency closures + bidirectional reconciliation',
    status: 'PRELIMINARY — regenerate from the frozen source SHA and commit in the evidence-only child',
    generated_from: {
      lockfile: 'pnpm-lock.yaml',
      lockfile_sha256: meta.lockfileSha256,
      target_descriptor: 'scripts/gate/target-descriptor.json',
      descriptor_sha256: meta.descriptorSha256,
      exclusions: 'scripts/gate/closure-exclusions.json',
      exclusions_sha256: sha256(exclusionsText),
      generator: 'scripts/gate/generate-closures.mjs',
    },
    determinism_contract: {
      serial_number: 'SHA-256 of the component/dependency/metadata content, shaped into a UUID',
      metadata_timestamp: 'deliberately omitted',
      collections: 'explicitly sorted',
      node_modules_read: false,
      host_platform_read: false,
      reconciliation_reads_sbom_from_disk: true,
    },
    source_sha: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).trim(),
    targets: reports,
    governed_exclusions: {
      schema_version: exclusionDoc.schema_version,
      required_fields: exclusionDoc.required_fields,
      rejection_rules: exclusionDoc.rejection_rules,
      declared: exclusionDoc.exclusions ?? [],
      problems: exclusionProblems,
    },
    override_residual_proof: overrideProof,
    vulnerable_residuals: residuals,
  };
  writeFileSync(join(outDir, 'closure-reconciliation.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(`\nreport: ${join(outDir, 'closure-reconciliation.json')}`);

  const failed =
    Object.values(reports).some((r) => !r.reconciliation.clean) ||
    exclusionProblems.length > 0 || residuals.length > 0;
  if (failed) {
    console.error('\n=== C16 CLOSURE GATE FAILED ===');
    for (const p of exclusionProblems) console.error(`  exclusion: ${p}`);
    for (const r of residuals) console.error(`  residual:  ${r}`);
    process.exitCode = 1;
    return report;
  }
  console.log('\nC16 closure gate: PASS');
  return report;
}

// Only run when invoked as a script — the negative controls import this module.
if (process.argv[1] !== undefined &&
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  main();
}
