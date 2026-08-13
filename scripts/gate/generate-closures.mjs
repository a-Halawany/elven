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
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
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


/** A caller mistake, distinguished from an internal fault so the message can be precise. */
class UsageError extends Error {}

const C16_FLAGS_WITH_VALUES = ['--out', '--expected-sha'];
const C16_BOOLEAN_FLAGS = ['--final'];

/**
 * VALIDATED argument parsing. C16 previously used bare `indexOf` scans, so a valueless
 * `--out` or an unknown flag produced a confusing downstream error — or, in final mode,
 * exited before any evidence was written at all.
 */
export function parseC16Args(argv) {
  const args = argv.slice(2);
  const out = { out: 'evidence/supply-chain/c16', expectedSha: null, final: false, raw: args };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (C16_BOOLEAN_FLAGS.includes(a)) { out.final = true; continue; }
    if (C16_FLAGS_WITH_VALUES.includes(a)) {
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) throw new UsageError(`${a} requires a value`);
      if (a === '--out') out.out = v;
      if (a === '--expected-sha') out.expectedSha = v;
      i += 1;
      continue;
    }
    throw new UsageError(
      `unrecognised argument ${JSON.stringify(a)}. Supported: ` +
      `${[...C16_FLAGS_WITH_VALUES, ...C16_BOOLEAN_FLAGS].join(' ')}`,
    );
  }
  if (out.expectedSha !== null && !/^[0-9a-f]{40}$/.test(out.expectedSha)) {
    throw new UsageError(
      `--expected-sha ${JSON.stringify(out.expectedSha)} is not a 40-character git object id`,
    );
  }
  return out;
}

/** Bind every file in the output directory except the report itself. */
function bindC16Artifacts(outDir) {
  const out = [];
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const full = join(dir, e.name);
      const relPath = rel === '' ? e.name : `${rel}/${e.name}`;
      if (e.isDirectory()) { walk(full, relPath); continue; }
      if (relPath === 'closure-reconciliation.json') continue;
      try {
        const buf = readFileSync(full);
        out.push({ path: relPath, bytes: buf.byteLength, sha256: sha256(buf) });
      } catch { /* unreadable artifacts are simply not bound */ }
    }
  };
  walk(outDir, '');
  return out.sort((a, b) => (a.path < b.path ? -1 : 1));
}

/**
 * ALWAYS-WRITTEN FAILURE EVIDENCE.
 *
 * C16 could previously fail before writing anything — a gitless final-mode refusal left the
 * output directory completely empty, so a red gate produced no evidence of why. Every
 * failure path now writes a structured manifest and RESULT-FAIL.txt when a writable output
 * directory is available, and emits structured stderr otherwise.
 */
function writeC16Failure({ outArg, phase, category, message, stack, parsed, sourceSha }) {
  const record = {
    artifact: 'C16 target-resolved dependency closures — failure evidence',
    outcome: category === 'USAGE' ? 'USAGE-ERROR' : category === 'GATE' ? 'FAIL' : 'CRASH',
    phase,
    error_category: category,
    exception: { message: String(message).slice(0, 800) },
    mode: parsed?.final === true ? 'final' : 'preliminary',
    expected_sha: parsed?.expectedSha ?? null,
    source_sha: sourceSha ?? '(unavailable)',
    arguments: process.argv.slice(2),
    finished_at: new Date().toISOString(),
    evidence_artifacts: [],
    evidence_binding_note:
      'Every file present in the output directory is bound, EXCEPT ' +
      'closure-reconciliation.json itself (a report cannot contain its own digest).',
  };

  let outDir = null;
  try {
    const candidate = outArg ?? 'evidence/supply-chain/c16';
    outDir = isAbsolute(candidate) ? resolve(candidate) : join(ROOT, candidate);
    mkdirSync(outDir, { recursive: true });
  } catch {
    outDir = null;
  }

  if (outDir === null) {
    // No writable location: structured stderr is the only remaining record.
    console.error(JSON.stringify({ ...record, note: 'no writable output directory' }, null, 2));
    return;
  }
  try {
    writeFileSync(join(outDir, 'RESULT-FAIL.txt'), [
      `outcome: ${record.outcome}`,
      `phase: ${phase}`,
      `error_category: ${category}`,
      `mode: ${record.mode}`,
      `expected_sha: ${record.expected_sha ?? '(none)'}`,
      `source_sha: ${record.source_sha}`,
      `arguments: ${record.arguments.join(' ')}`,
      `timestamp: ${record.finished_at}`,
      '',
      String(message),
      '',
      stack ?? '',
      '',
    ].join('\n'));
  } catch { /* nothing further can be recorded */ }
  try { record.evidence_artifacts = bindC16Artifacts(outDir); } catch { /* best effort */ }
  try {
    writeFileSync(join(outDir, 'closure-reconciliation.json'), `${JSON.stringify(record, null, 2)}\n`);
  } catch { /* nothing further can be recorded */ }
  console.error(`\n=== C16 CLOSURE GATE ${record.outcome} (${phase}) ===`);
  console.error(`  ${message}`);
  console.error(`  failure evidence: ${join(outDir, 'closure-reconciliation.json')}`);
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

/**
 * C16-R3.4 — THE DETERMINISTIC SOURCE-DERIVED C16 DERIVATION.
 *
 * One pure function, called by BOTH the generator and the final verifier. Everything it
 * returns is derived from tracked source: `pnpm-lock.yaml`, the target descriptor, the
 * workspace manifests and the governed closure exclusions, with exclusion expiry evaluated
 * against ONE explicitly bound as-of date rather than an implicit wall clock.
 *
 * This exists because the verifier previously accepted the generator's OWN self-report as
 * proof of the generator's work: `reconciliation.clean` and the reported counts were read out
 * of the evidence and compared to nothing. A verifier that can reconstruct the answer does
 * not need to be told it.
 *
 * Purity: no writes, no console output, no wall clock. `asOfDate` must be supplied by the
 * caller ('YYYY-MM-DD'), which is what makes two independent runs comparable.
 */
export function deriveC16Expectation({ root = ROOT, asOfDate, isTracked, readEvidence } = {}) {
  if (typeof asOfDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(asOfDate)) {
    throw new Error(`deriveC16Expectation requires an explicit asOfDate as YYYY-MM-DD, got ${JSON.stringify(asOfDate)}`);
  }
  const trackedFn = isTracked ?? ((rel) =>
    spawnSync('git', ['ls-files', '--error-unmatch', rel], { cwd: root, encoding: 'utf8' }).status === 0);
  const evidenceFn = readEvidence ?? ((rel) => {
    try { return readFileSync(join(root, rel)); } catch { return null; }
  });

  const exclusionDoc = JSON.parse(
    readFileSync(join(root, 'scripts/gate/closure-exclusions.json'), 'utf8'),
  );
  const built = buildAllClosures(root);
  const { descriptor, lockUniverse, meta } = built;

  const gov = governExclusions(exclusionDoc, built.closures, lockUniverse, asOfDate, {
    root, isTracked: trackedFn, readEvidence: evidenceFn,
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
    cardinalityProblems.push(...checkExclusionCardinality({
      declared: forTarget.length, rejected: 0, valid: forTarget.length,
      applied: applied.length, removedNodes: before - reduced.nodes.size, cascaded: cascaded.length,
    }).map((p) => `${name}: ${p}`));
  }
  cardinalityProblems.push(...checkExclusionCardinality({
    declared: gov.declared,
    rejected: gov.problems.length > 0 ? gov.declared - gov.valid.length : 0,
    valid: gov.valid.length,
    applied: Object.values(exclusionApplication).reduce((a, x) => a + x.applied_count, 0),
    removedNodes: Object.values(exclusionApplication).reduce((a, x) => a + x.removed_nodes, 0),
    cascaded: Object.values(exclusionApplication).reduce((a, x) => a + x.cascaded_count, 0),
  }).map((p) => `document: ${p}`));

  const reports = {};
  const sbomTexts = {};
  const unresolved = {};
  for (const [name, closure] of Object.entries(closures)) {
    const target = closure.target;
    if (closure.unresolved.length > 0) {
      unresolved[name] = [...closure.unresolved];
      continue;
    }
    const doc = buildSbom(closure, meta);
    const text = serialize(doc);
    sbomTexts[name] = text;

    // Reconcile against the SERIALIZED TEXT — the same bytes that get written and shipped,
    // never the in-memory document.
    const rec = reconcile(closure, extractFromSbom(text), {
      requireExactBindings: true,
      expectedDocument: {
        bomFormat: 'CycloneDX', specVersion: '1.6', version: 1, serialNumber: doc.serialNumber,
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
      sbom_sha256: sha256(text),
      sbom_bytes: Buffer.byteLength(text),
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
  }

  return {
    asOfDate, meta, descriptor, lockUniverse, closures,
    reports, sbomTexts, unresolved,
    gov, exclusionApplication, cardinalityProblems,
  };
}

export function main(parsed) {
  const outArg = parsed.out;
  const outDir = isAbsolute(outArg) ? resolve(outArg) : join(ROOT, outArg);
  const finalMode = parsed.final;
  const expectedSha = parsed.expectedSha;
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
    writeC16Failure({
      outArg, phase: 'pinned-implementations', category: 'GATE',
      message: libs.problems.join('\n'), parsed, sourceSha: meta.sourceSha,
    });
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
      writeC16Failure({
        outArg, phase: 'final-source-binding', category: 'GATE',
        message: problems.join('\n'), parsed, sourceSha: meta.sourceSha,
      });
      process.exit(1);
    }
  }

  // ── ONE SOURCE-DERIVED DERIVATION, SHARED WITH THE VERIFIER ────────────────────
  // C16-R3.4: the producer and the final verifier now call the SAME pure function, so the
  // verifier can reconstruct every count, every reconciliation and every SBOM byte from
  // tracked source instead of reading the generator's self-report back as proof. The as-of
  // date is passed explicitly for the same reason.
  const derived = deriveC16Expectation({ root: ROOT, asOfDate: runDate });
  const { gov, closures, exclusionApplication, cardinalityProblems, reports } = derived;

  for (const [name, refs] of Object.entries(derived.unresolved)) {
    writeC16Failure({
      outArg, phase: `closure-resolution:${name}`, category: 'GATE',
      message: [
        `${name}: UNRESOLVED lockfile references (closure is incomplete):`,
        ...refs.slice(0, 40),
        'Every required AND optional reference must resolve; the gate fails closed.',
      ].join('\n'),
      parsed, sourceSha: meta.sourceSha,
    });
    process.exit(1);
  }

  for (const [name, report] of Object.entries(reports)) {
    const target = report.target;
    const text = derived.sbomTexts[name];
    const file = join(outDir, report.sbom_file);
    writeFileSync(file, text);
    // The DELIVERED bytes must be the derived bytes. Reconciliation already ran against the
    // derived text; this proves the file on disk is those same bytes and nothing else.
    const onDisk = readFileSync(file, 'utf8');
    if (onDisk !== text) {
      writeC16Failure({
        outArg, phase: `sbom-write:${name}`, category: 'GATE',
        message: `the SBOM written to ${report.sbom_file} does not equal the derived bytes`,
        parsed, sourceSha: meta.sourceSha,
      });
      process.exit(1);
    }

    const rec = report.reconciliation;
    const c = report.counts;
    console.log(`\n${name} (${target.id}):`);
    console.log(`  scopes            ${target.dependency_scopes.join(', ')}`);
    console.log(`  importer roots    ${target.importer_roots.join(', ')}`);
    console.log(`  components        ${c.nodes} (workspace ${c.workspace_nodes}, registry ${c.registry_nodes}, peer-variants ${c.peer_variant_nodes}, leaves ${c.leaf_nodes})`);
    console.log(`  edges             ${c.edges} + ${c.subject_root_edges} subject->root`);
    console.log(`  platform-excluded ${c.platform_excluded}`);
    console.log(`  scope membership  ${JSON.stringify(report.scope_distribution)}`);
    console.log(`  workspace ids     ${report.workspace_identities.map((w) => `${w.name}@${w.version}`).join(', ')}`);
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
  const failed =
    Object.values(reports).some((r) => !r.reconciliation.clean) ||
    gov.problems.length > 0 || cardinalityProblems.length > 0 || residuals.length > 0;

  // Receipt FIRST, then bind, then the report — so the receipt is itself inventoried.
  writeFileSync(join(outDir, failed ? 'RESULT-FAIL.txt' : 'RESULT-PASS.txt'), [
    `outcome: ${failed ? 'FAIL' : 'PASS'}`,
    `mode: ${finalMode ? 'final' : 'preliminary'}`,
    `source_sha: ${meta.sourceSha}`,
    `expected_sha: ${expectedSha ?? '(none)'}`,
    `targets: ${Object.keys(reports).join(', ')}`,
    `timestamp: ${new Date().toISOString()}`,
    '',
    ...gov.problems.map((p) => `PROBLEM exclusion: ${p}`),
    ...cardinalityProblems.map((p) => `PROBLEM cardinality: ${p}`),
    ...residuals.map((r) => `PROBLEM residual: ${r}`),
    '',
  ].join('\n'));
  report.evidence_artifacts = bindC16Artifacts(outDir);
  report.evidence_binding_note =
    'Every file in the output directory is bound by path, size and SHA-256, EXCEPT ' +
    'closure-reconciliation.json itself: a report cannot contain its own digest.';
  const reportText = `${JSON.stringify(report, null, 2)}\n`;
  writeFileSync(join(outDir, 'closure-reconciliation.json'), reportText);
  console.log(`\nreport: ${join(outDir, 'closure-reconciliation.json')}`);
  for (const [name, r] of Object.entries(reports)) {
    console.log(`  ${name} sbom sha256: ${r.sbom_sha256}`);
  }

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
//
// OUTERMOST BOUNDARY. Expected gate failures are handled inside main() by
// writeC16Failure(); this covers the unexpected ones (malformed arguments, an unreadable
// or malformed descriptor, an internal fault) so a red run always leaves evidence.
if (process.argv[1] !== undefined &&
    resolve(process.argv[1]) === resolve(fileURLToPath(import.meta.url))) {
  let parsed = null;
  try {
    parsed = parseC16Args(process.argv);
    main(parsed);
  } catch (e) {
    const i = process.argv.indexOf('--out');
    const outArg = i !== -1 && process.argv[i + 1] !== undefined && !process.argv[i + 1].startsWith('--')
      ? process.argv[i + 1]
      : null;
    let sourceSha = '(unavailable)';
    try { sourceSha = safeGit(['rev-parse', 'HEAD']) ?? '(not a git worktree)'; } catch { /* noted */ }
    writeC16Failure({
      outArg,
      phase: parsed === null ? 'argument-parsing' : 'unexpected',
      category: e instanceof UsageError ? 'USAGE' : 'INTERNAL',
      message: e instanceof Error ? e.message : String(e),
      stack: e instanceof Error ? e.stack : '',
      parsed,
      sourceSha,
    });
    process.exit(1);
  }
}
