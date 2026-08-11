/**
 * GATE-2.2 C16 — NON-VACUITY CONTROLS FOR THE DEPENDENCY-CLOSURE RECONCILER.
 *
 * The Gate-2.1 defect this replaces was self-reconciliation: the SBOM was compared
 * against a structure derived from that same SBOM, so the check could not fail. A
 * reconciler that has only ever been run on a passing input is indistinguishable
 * from one that returns "clean" unconditionally.
 *
 * Every control below CORRUPTS a real generated SBOM in one specific way and
 * requires the reconciler to report that exact corruption. If any control's
 * corruption were to reconcile clean, the reconciler is vacuous and the gate fails.
 *
 * These controls need no fixtures on disk and no prior generator run: the closure is
 * computed from the committed pnpm-lock.yaml, and the SBOM is serialized to a
 * temporary directory inside the test.
 */
import { describe, expect, it, beforeAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs gate libraries shared with the CI scripts (no types)
import { buildAllClosures } from '../../../../scripts/gate/generate-closures.mjs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { buildSbom, serialize, extractFromSbom } from '../../../../scripts/gate/lib/sbom.mjs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { reconcile, governExclusions } from '../../../../scripts/gate/lib/reconcile.mjs';

const REPO = join(__dirname, '..', '..', '..', '..');

type Rec = {
  missing_nodes: string[];
  extra_nodes: string[];
  missing_edges: string[];
  extra_edges: string[];
  identity_mismatches: string[];
  dangling_references: string[];
  components_without_dependency_entry: string[];
  orphan_components: string[];
  clean: boolean;
};
type Closure = {
  target: { id: string; dependency_scopes: string[]; importer_roots: string[] };
  nodes: Map<string, { name: string; version: string; bomRef: string; lockKey: string; peerSuffix: string; kind: string; platform?: { compatible: boolean } }>;
  edges: { from: string; to: string; kind: string }[];
  roots: string[];
  excludedByPlatform: { key: string; reason: string }[];
};
type Doc = {
  components: { 'bom-ref': string; name: string; version: string; purl?: string; properties: { name: string; value: string }[] }[];
  dependencies: { ref: string; dependsOn: string[] }[];
};

let closures: Record<string, Closure>;
let lockUniverse: Set<string>;
let meta: { projectVersion: string; lockfileSha256: string; descriptorSha256: string };
let dir: string;

/** Serialize a (possibly mutated) document and reconcile it FROM DISK. */
function reconcileFromDisk(closure: Closure, mutate?: (doc: Doc) => void): Rec {
  const doc = buildSbom(closure, meta) as unknown as Doc;
  if (mutate !== undefined) mutate(doc);
  const file = join(dir, `sbom-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, serialize(doc));
  const onDisk = extractFromSbom(readFileSync(file, 'utf8'));
  rmSync(file);
  return reconcile(closure, onDisk) as Rec;
}

/** A registry component that is safe to mutate: not a workspace root. */
function pickRegistryComponent(doc: Doc): Doc['components'][number] {
  const c = doc.components.find((x) => x.purl !== undefined && !x['bom-ref'].startsWith('workspace:'));
  if (c === undefined) throw new Error('no registry component in the generated SBOM');
  return c;
}

beforeAll(() => {
  const built = buildAllClosures(REPO) as {
    closures: Record<string, Closure>;
    lockUniverse: Set<string>;
    meta: typeof meta;
  };
  closures = built.closures;
  lockUniverse = built.lockUniverse;
  meta = built.meta;
  dir = mkdtempSync(join(tmpdir(), 'eye-c16-controls-'));
});

describe('C16 baseline — the uncorrupted closure reconciles clean in both directions', () => {
  it('production and development both reconcile with zero differences', () => {
    for (const name of ['production', 'development']) {
      const rec = reconcileFromDisk(closures[name]);
      expect(rec.missing_nodes, `${name} missing nodes`).toEqual([]);
      expect(rec.extra_nodes, `${name} extra nodes`).toEqual([]);
      expect(rec.missing_edges, `${name} missing edges`).toEqual([]);
      expect(rec.extra_edges, `${name} extra edges`).toEqual([]);
      expect(rec.identity_mismatches, `${name} identity mismatches`).toEqual([]);
      expect(rec.dangling_references, `${name} dangling refs`).toEqual([]);
      expect(rec.components_without_dependency_entry, `${name} components lacking a dependency entry`).toEqual([]);
      expect(rec.orphan_components, `${name} orphans`).toEqual([]);
      expect(rec.clean).toBe(true);
    }
  });

  it('the two targets are genuinely different closures, not the same set twice', () => {
    const prod = new Set(closures.production.nodes.keys());
    const dev = new Set(closures.development.nodes.keys());
    expect(dev.size).toBeGreaterThan(prod.size);
    // Every production component must also be in development (dev is a superset of
    // scopes over a superset of importer roots). A prod-only component would mean
    // the two closures were computed by inconsistent rules.
    const prodOnly = [...prod].filter((n) => !dev.has(n));
    expect(prodOnly, 'components in production but not development').toEqual([]);
    const devOnly = [...dev].filter((n) => !prod.has(n));
    expect(devOnly.length, 'development must add tooling components').toBeGreaterThan(50);
  });
});

describe('C16 control 1 — removing a real component is detected', () => {
  it('reports the removed component as a missing node, not as clean', () => {
    let removed = '';
    const rec = reconcileFromDisk(closures.production, (doc) => {
      const victim = pickRegistryComponent(doc);
      removed = victim['bom-ref'];
      doc.components = doc.components.filter((c) => c['bom-ref'] !== removed);
      doc.dependencies = doc.dependencies.filter((d) => d.ref !== removed);
    });
    expect(rec.clean).toBe(false);
    expect(rec.missing_nodes).toContain(removed);
    expect(rec.extra_nodes).toEqual([]);
  });
});

describe('C16 control 2 — adding a ghost component is detected', () => {
  it('reports the fabricated component as an extra node and as an orphan', () => {
    const ghost = 'pkg:npm/eye-ghost-control@9.9.9';
    const rec = reconcileFromDisk(closures.production, (doc) => {
      doc.components.push({
        'bom-ref': ghost,
        name: 'eye-ghost-control',
        version: '9.9.9',
        purl: ghost,
        properties: [{ name: 'eye:lock-key', value: 'eye-ghost-control@9.9.9' }],
      });
      doc.dependencies.push({ ref: ghost, dependsOn: [] });
    });
    expect(rec.clean).toBe(false);
    expect(rec.extra_nodes).toContain(ghost);
    expect(rec.orphan_components).toContain(ghost);
    expect(rec.missing_nodes).toEqual([]);
  });
});

describe('C16 control 3 — altering a recorded version is detected', () => {
  it('reports an identity mismatch even though the bom-ref set still matches', () => {
    let ref = '';
    const rec = reconcileFromDisk(closures.production, (doc) => {
      const victim = pickRegistryComponent(doc);
      ref = victim['bom-ref'];
      victim.version = '0.0.0-tampered';
    });
    // The ref set is untouched, so a set-only comparison would call this clean.
    expect(rec.missing_nodes).toEqual([]);
    expect(rec.extra_nodes).toEqual([]);
    expect(rec.clean).toBe(false);
    expect(rec.identity_mismatches.join('\n')).toContain(`${ref}: version`);
    expect(rec.identity_mismatches.join('\n')).toContain('0.0.0-tampered');
  });
});

describe('C16 control 4 — altering a recorded PURL is detected', () => {
  it('reports an identity mismatch for a substituted package coordinate', () => {
    let ref = '';
    const rec = reconcileFromDisk(closures.production, (doc) => {
      const victim = pickRegistryComponent(doc);
      ref = victim['bom-ref'];
      victim.purl = 'pkg:npm/typosquat-impostor@1.0.0';
    });
    expect(rec.missing_nodes).toEqual([]);
    expect(rec.clean).toBe(false);
    expect(rec.identity_mismatches.join('\n')).toContain(`${ref}: purl`);
    expect(rec.identity_mismatches.join('\n')).toContain('typosquat-impostor');
  });

  it('reports an identity mismatch when the lock-key provenance property is rewritten', () => {
    const rec = reconcileFromDisk(closures.production, (doc) => {
      const victim = pickRegistryComponent(doc);
      const prop = victim.properties.find((p) => p.name === 'eye:lock-key');
      if (prop === undefined) throw new Error('eye:lock-key property missing from the SBOM');
      prop.value = 'something-else@0.0.0';
    });
    expect(rec.clean).toBe(false);
    expect(rec.identity_mismatches.join('\n')).toContain('lock-key');
  });
});

describe('C16 control 5 — removing a real edge is detected', () => {
  it('reports the dropped relationship as a missing edge while all nodes still match', () => {
    const first = closures.production.edges[0];
    const expected = `${first.from} ${first.to}`;
    const rec = reconcileFromDisk(closures.production, (doc) => {
      const entry = doc.dependencies.find((d) => d.ref === first.from);
      if (entry === undefined) throw new Error(`no dependency entry for ${first.from}`);
      entry.dependsOn = entry.dependsOn.filter((t) => t !== first.to);
    });
    expect(rec.missing_nodes).toEqual([]);
    expect(rec.extra_nodes).toEqual([]);
    expect(rec.clean).toBe(false);
    expect(rec.missing_edges).toContain(expected);
  });
});

describe('C16 control 6 — adding a fake edge is detected', () => {
  it('reports an invented relationship between two real components as an extra edge', () => {
    const from = closures.production.edges[0].from;
    const unrelated = [...closures.production.nodes.keys()].find(
      (n) => n !== from && !closures.production.edges.some((e) => e.from === from && e.to === n),
    );
    if (unrelated === undefined) throw new Error('no unrelated component available');
    const rec = reconcileFromDisk(closures.production, (doc) => {
      const entry = doc.dependencies.find((d) => d.ref === from);
      if (entry === undefined) throw new Error(`no dependency entry for ${from}`);
      entry.dependsOn = [...entry.dependsOn, unrelated].sort();
    });
    expect(rec.clean).toBe(false);
    expect(rec.extra_edges).toContain(`${from} ${unrelated}`);
    expect(rec.missing_edges).toEqual([]);
  });

  it('reports an edge pointing at a component that does not exist as dangling', () => {
    const from = closures.production.edges[0].from;
    const rec = reconcileFromDisk(closures.production, (doc) => {
      const entry = doc.dependencies.find((d) => d.ref === from);
      if (entry === undefined) throw new Error(`no dependency entry for ${from}`);
      entry.dependsOn = [...entry.dependsOn, 'pkg:npm/does-not-exist@1.0.0'];
    });
    expect(rec.clean).toBe(false);
    expect(rec.dangling_references).toContain(`${from} -> pkg:npm/does-not-exist@1.0.0`);
  });

  it('reports a component that has no dependency entry at all', () => {
    let ref = '';
    const rec = reconcileFromDisk(closures.production, (doc) => {
      const leaf = doc.dependencies.find((d) => d.dependsOn.length === 0);
      if (leaf === undefined) throw new Error('no leaf dependency entry');
      ref = leaf.ref;
      doc.dependencies = doc.dependencies.filter((d) => d.ref !== ref);
    });
    expect(rec.clean).toBe(false);
    expect(rec.components_without_dependency_entry).toContain(ref);
  });
});

describe('C16 control 7 — collapsing peer-context instances is detected', () => {
  it('the closure keeps distinct nodes per peer resolution', () => {
    const variants = [...closures.production.nodes.values()].filter((n) => n.peerSuffix !== '');
    expect(variants.length, 'peer-variant nodes in production').toBeGreaterThan(0);
    // Two nodes sharing name@version but differing in peer context must both exist.
    const byNameVersion = new Map<string, string[]>();
    for (const n of closures.development.nodes.values()) {
      const k = `${n.name}@${n.version}`;
      byNameVersion.set(k, [...(byNameVersion.get(k) ?? []), n.bomRef]);
    }
    const withPeerContext = [...closures.development.nodes.values()].filter((n) => n.peerSuffix !== '');
    expect(withPeerContext.length).toBeGreaterThan(0);
    for (const n of withPeerContext) {
      expect(n.bomRef, 'the peer context must be part of the component identity').toContain('(');
    }
  });

  it('merging two peer variants into one component is reported as missing nodes', () => {
    const variants = [...closures.development.nodes.values()].filter((n) => n.peerSuffix !== '');
    const victim = variants[0];
    const rec = reconcileFromDisk(closures.development, (doc) => {
      // Collapse: strip the peer context, which is exactly what a naive generator
      // keyed on name@version alone would produce.
      const target = doc.components.find((c) => c['bom-ref'] === victim.bomRef);
      if (target === undefined) throw new Error(`peer variant ${victim.bomRef} not emitted`);
      const collapsed = `pkg:npm/${victim.name.replace('@', '%40').replace('/', '%2F')}@${victim.version}`;
      target['bom-ref'] = collapsed;
      for (const d of doc.dependencies) {
        if (d.ref === victim.bomRef) d.ref = collapsed;
        d.dependsOn = d.dependsOn.map((t) => (t === victim.bomRef ? collapsed : t));
      }
    });
    expect(rec.clean).toBe(false);
    expect(rec.missing_nodes).toContain(victim.bomRef);
  });
});

describe('C16 control 8 — a target-compatible optional dependency must be present', () => {
  it('linux-x64 optional native binaries ARE in the closure', () => {
    const names = [...closures.production.nodes.values()].map((n) => n.name);
    // These are optionalDependencies whose os/cpu metadata matches the target, so
    // omitting them would understate the deployable closure.
    expect(names).toContain('@img/sharp-linux-x64');
    expect(names).toContain('@next/swc-linux-x64-gnu');
  });

  it('omitting a compatible optional dependency from the SBOM is reported as missing', () => {
    const victim = [...closures.production.nodes.values()].find((n) => n.name === '@img/sharp-linux-x64');
    if (victim === undefined) throw new Error('@img/sharp-linux-x64 absent from the production closure');
    const rec = reconcileFromDisk(closures.production, (doc) => {
      doc.components = doc.components.filter((c) => c['bom-ref'] !== victim.bomRef);
      doc.dependencies = doc.dependencies.filter((d) => d.ref !== victim.bomRef);
    });
    expect(rec.clean).toBe(false);
    expect(rec.missing_nodes).toContain(victim.bomRef);
  });
});

describe('C16 control 9 — a platform-incompatible dependency must be absent', () => {
  it('darwin and arm64 native binaries are excluded, with a recorded reason', () => {
    const names = [...closures.production.nodes.values()].map((n) => n.name);
    expect(names).not.toContain('@img/sharp-darwin-arm64');
    expect(names).not.toContain('@img/sharp-libvips-linux-arm64');
    expect(names).not.toContain('@next/swc-darwin-arm64');

    const excluded = closures.production.excludedByPlatform;
    expect(excluded.length).toBeGreaterThan(0);
    const darwin = excluded.find((e) => e.bomRef.includes('sharp-darwin-arm64'));
    expect(darwin, 'the darwin exclusion must be recorded, not silent').toBeDefined();
    expect(darwin?.field).toBe('os');
    expect(darwin?.reason).toBe('requires darwin');
    // The exclusion must be justified by the package's OWN metadata, never by the
    // host: every excluded entry names the os/cpu/libc field that excluded it, the
    // value that field demanded, and the parent that made it reachable.
    for (const e of excluded) {
      expect(['os', 'cpu', 'libc']).toContain(e.field);
      expect(e.reason).toMatch(/^requires /);
      expect(e.parent, `${e.bomRef} must record the parent that pulled it in`).toBeTruthy();
    }
    // And an arm64 exclusion must be excluded on cpu, not on os — a single blanket
    // reason for every entry would mean the filter is not really reading metadata.
    const arm = excluded.find((e) => e.bomRef.includes('libvips-linux-arm64'));
    expect(arm?.field).toBe('cpu');
    expect(arm?.reason).toBe('requires arm64');
  });

  it('injecting an incompatible platform dependency is reported as an extra node', () => {
    const ref = 'pkg:npm/%40img%2Fsharp-darwin-arm64@0.35.2';
    const rec = reconcileFromDisk(closures.production, (doc) => {
      const parent = doc.dependencies[0];
      doc.components.push({
        'bom-ref': ref,
        name: '@img/sharp-darwin-arm64',
        version: '0.35.2',
        purl: ref,
        properties: [{ name: 'eye:lock-key', value: '@img/sharp-darwin-arm64@0.35.2' }],
      });
      doc.dependencies.push({ ref, dependsOn: [] });
      parent.dependsOn = [...parent.dependsOn, ref].sort();
    });
    expect(rec.clean).toBe(false);
    expect(rec.extra_nodes).toContain(ref);
  });
});

describe('C16 control 10 — exclusion governance rejects every prohibited entry shape', () => {
  const base = {
    target: 'production',
    scope: 'dependencies',
    reason: 'control fixture',
    evidence: 'apps/api/test/gate/c16-closure-controls.test.ts',
    owner: 'gate-2.2',
    review: '2026-08-11',
  };
  const doc = (exclusions: unknown[]) => ({
    schema_version: '1.0.0',
    required_fields: ['target', 'scope', 'resolution_key', 'parent_edge', 'reason', 'evidence', 'owner', 'review'],
    rejection_rules: {},
    exclusions,
  });

  it('the committed exclusion file is empty, so nothing is being suppressed today', () => {
    const committed = JSON.parse(
      readFileSync(join(REPO, 'scripts/gate/closure-exclusions.json'), 'utf8'),
    ) as { exclusions: unknown[] };
    expect(committed.exclusions).toEqual([]);
    expect(governExclusions(committed, closures, lockUniverse)).toEqual([]);
  });

  it('rejects a wildcard resolution_key', () => {
    const problems = governExclusions(
      doc([{ ...base, resolution_key: '@img/sharp-*', parent_edge: 'x -> y' }]),
      closures, lockUniverse,
    ) as string[];
    expect(problems.join('\n')).toContain("rejected by 'wildcard_or_name_only'");
  });

  it('rejects a name-only resolution_key with no version', () => {
    const problems = governExclusions(
      doc([{ ...base, resolution_key: 'nanoid', parent_edge: 'x -> y' }]),
      closures, lockUniverse,
    ) as string[];
    expect(problems.join('\n')).toContain("rejected by 'wildcard_or_name_only'");
  });

  it('rejects a stale entry whose subject is not resolved anywhere in the lockfile', () => {
    const problems = governExclusions(
      doc([{ ...base, resolution_key: 'left-pad@1.3.0', parent_edge: 'x -> y' }]),
      closures, lockUniverse,
    ) as string[];
    expect(problems.join('\n')).toContain("rejected by 'stale_not_in_closure'");
  });

  it('rejects an entry reviewed against a version the closure no longer resolves', () => {
    const problems = governExclusions(
      doc([{ ...base, resolution_key: 'nanoid@3.3.11', parent_edge: 'x -> y' }]),
      closures, lockUniverse,
    ) as string[];
    expect(problems.join('\n')).toContain("rejected by 'version_changed'");
  });

  it('rejects an entry that never applied to the declared target', () => {
    // A dev-only tooling package is resolved by the lockfile but absent from the
    // production closure, so excluding it from production suppresses nothing.
    const devOnly = [...closures.development.nodes.values()].find(
      (n) => n.kind !== 'workspace' && !closures.production.nodes.has(n.bomRef) && n.peerSuffix === '',
    );
    if (devOnly === undefined) throw new Error('no development-only package found');
    const problems = governExclusions(
      doc([{ ...base, resolution_key: `${devOnly.name}@${devOnly.version}`, parent_edge: 'x -> y' }]),
      closures, lockUniverse,
    ) as string[];
    expect(problems.join('\n')).toContain("rejected by 'unused_never_applied'");
  });

  it('rejects excluding a target-compatible MANDATORY dependency', () => {
    const mandatory = closures.production.edges.find((e) => e.kind === 'dependencies');
    if (mandatory === undefined) throw new Error('no mandatory edge in the production closure');
    const node = closures.production.nodes.get(mandatory.to);
    if (node === undefined) throw new Error('mandatory edge target missing');
    const problems = governExclusions(
      doc([{
        ...base,
        resolution_key: node.lockKey,
        parent_edge: `${mandatory.from} -> ${mandatory.to}`,
      }]),
      closures, lockUniverse,
    ) as string[];
    expect(problems.join('\n')).toContain("rejected by 'excludes_compatible_mandatory_dependency'");
  });

  it('rejects an entry missing any required field, and a parent_edge that is not a real edge', () => {
    const mandatory = closures.production.edges.find((e) => e.kind === 'dependencies');
    const node = closures.production.nodes.get(mandatory!.to)!;
    const noOwner = governExclusions(
      doc([{ ...base, owner: '', resolution_key: node.lockKey, parent_edge: 'x -> y' }]),
      closures, lockUniverse,
    ) as string[];
    expect(noOwner.join('\n')).toContain("missing required field 'owner'");

    const badEdge = governExclusions(
      doc([{ ...base, resolution_key: node.lockKey, parent_edge: 'not -> an-edge' }]),
      closures, lockUniverse,
    ) as string[];
    expect(badEdge.join('\n')).toContain("parent_edge 'not -> an-edge' is not an edge");
  });
});

describe('C16 control 11 — the closure actually depends on the declared importer roots', () => {
  it('narrowing the importer roots removes components, so the roots are load-bearing', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires, @typescript-eslint/no-unsafe-assignment
    const full = closures.production;
    const narrowed = buildNarrowed(['packages/tokens']);
    expect(narrowed.nodes.size).toBeLessThan(full.nodes.size);
    expect(narrowed.target.importer_roots).toEqual(['packages/tokens']);
  });

  it('widening the scopes adds components, so the scope list is load-bearing', () => {
    const prodScopes = closures.production.target.dependency_scopes;
    const devScopes = closures.development.target.dependency_scopes;
    expect(prodScopes).not.toContain('devDependencies');
    expect(devScopes).toContain('devDependencies');
    expect(closures.development.nodes.size).toBeGreaterThan(closures.production.nodes.size);
  });
});

describe('C16 control 12 — output is a function of the lockfile, not of the environment', () => {
  it('two builds of the same target serialize byte-identically', () => {
    const a = serialize(buildSbom(closures.production, meta)) as string;
    const b = serialize(buildSbom(closures.production, meta)) as string;
    expect(a).toBe(b);
  });

  it('the SBOM carries no wall-clock timestamp and no random serial number', () => {
    const doc = buildSbom(closures.production, meta) as unknown as {
      metadata: Record<string, unknown>; serialNumber: string;
    };
    expect(doc.metadata.timestamp, 'metadata.timestamp must be omitted for byte-comparability').toBeUndefined();
    const again = buildSbom(closures.production, meta) as unknown as { serialNumber: string };
    expect(doc.serialNumber).toBe(again.serialNumber);
    expect(doc.serialNumber).toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('a mutated node_modules tree cannot change the closure', () => {
    const ghostDir = join(REPO, 'node_modules', 'eye-c16-control-ghost');
    const before = serialize(buildSbom(closures.production, meta)) as string;
    mkdirSync(ghostDir, { recursive: true });
    writeFileSync(join(ghostDir, 'package.json'), '{"name":"eye-c16-control-ghost","version":"9.9.9"}');
    try {
      const rebuilt = buildAllClosures(REPO) as { closures: Record<string, Closure>; meta: typeof meta };
      const after = serialize(buildSbom(rebuilt.closures.production, rebuilt.meta)) as string;
      expect(after).toBe(before);
      expect(after).not.toContain('eye-c16-control-ghost');
    } finally {
      rmSync(ghostDir, { recursive: true, force: true });
    }
  });

  it('the exact nanoid pin leaves no vulnerable residual in either closure', () => {
    // C15 finding: nanoid <3.3.17 is CVE-2026-67213 (HIGH). The override is pinned
    // to an exact reviewed version, so BOTH closures must resolve only that version.
    for (const [name, closure] of Object.entries(closures)) {
      const versions = [...closure.nodes.values()].filter((n) => n.name === 'nanoid').map((n) => n.version);
      expect(versions.length, `${name} must resolve nanoid`).toBeGreaterThan(0);
      for (const v of versions) {
        expect(v, `${name} resolved a vulnerable nanoid`).toBe('3.3.18');
      }
    }
  });
});

/** Rebuild a production-shaped closure over a narrowed importer-root list. */
function buildNarrowed(roots: string[]): Closure {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { buildClosure, loadLock } = require('../../../../scripts/gate/lib/lock-closure.mjs') as {
    buildClosure: (lock: unknown, target: unknown) => Closure;
    loadLock: (p: string) => unknown;
  };
  const lock = loadLock(join(REPO, 'pnpm-lock.yaml'));
  return buildClosure(lock, { ...closures.production.target, importer_roots: roots });
}
