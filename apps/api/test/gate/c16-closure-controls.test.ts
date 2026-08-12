/**
 * GATE-2.2 C16 — NON-VACUITY CONTROLS FOR THE DEPENDENCY-CLOSURE RECONCILER.
 *
 * The Gate-2.1 defect this replaces was self-reconciliation: the SBOM was compared
 * against a structure derived from that same SBOM, so the check could not fail. A
 * reconciler that has only ever been run on a passing input is indistinguishable from
 * one that returns "clean" unconditionally.
 *
 * Every control CORRUPTS a real generated SBOM in one specific way and requires the
 * reconciler to report that exact corruption. All of them drive the PRODUCTION
 * generator and reconciler (`buildAllClosures`, `buildSbom`, `serialize`,
 * `extractFromSbom`, `reconcile`, `governExclusions`, `applyExclusions`) — none of them
 * inspects source text, because a source-string assertion proves only that a line
 * exists, not that it works.
 *
 * Remediation after independent review of e3a0b1f: the previous suite compared Sets, so
 * it could not detect duplicates; and it checked only four fields, so a removed hash, a
 * rewritten scope, a false workspace version, a broken subject edge or a non-canonical
 * PURL all reconciled "clean". Those are the controls added here.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs gate libraries shared with the CI scripts (no types)
import { buildAllClosures, countsOf } from '../../../../scripts/gate/generate-closures.mjs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import { buildSbom, serialize, extractFromSbom, subjectRef } from '../../../../scripts/gate/lib/sbom.mjs';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import {
  reconcile, governExclusions, applyExclusions, checkExclusionCardinality,
  EXCLUSION_REQUIRED_FIELDS, FAILURE_KEYS,
} from '../../../../scripts/gate/lib/reconcile.mjs';

const REPO = join(__dirname, '..', '..', '..', '..');

type Rec = Record<string, string[]> & {
  clean: boolean;
  lock_nodes: number; sbom_nodes: number; lock_edges: number; sbom_edges: number;
  subject_root_edges_expected: number; subject_root_edges_present: number;
};
type LockNode = {
  bomRef: string; name: string; version: string; kind: string; lockKey: string;
  peerSuffix: string; patchHash: string | null; integrity: string | null;
  purl: string | null; scopes: Set<string>; importerPath?: string;
  manifestPath?: string; manifestSha256?: string;
  platform?: { compatible: boolean };
};
type Closure = {
  target: { id: string; dependency_scopes: string[]; importer_roots: string[] };
  nodes: Map<string, LockNode>;
  edges: Array<{ from: string; to: string; kind: string }>;
  roots: string[];
  excludedByPlatform: Array<{ bomRef: string; parent: string; field: string; reason: string }>;
  unresolved: string[];
};
type Doc = {
  metadata: { component: { 'bom-ref': string }; properties: Array<{ name: string; value: string }> };
  components: Array<{
    'bom-ref': string; name: string; version: string; type: string; purl?: string;
    hashes?: Array<{ alg: string; content: string }>;
    properties: Array<{ name: string; value: string }>;
  }>;
  dependencies: Array<{ ref: string; dependsOn: string[] }>;
};

let closures: Record<string, Closure>;
let lockUniverse: Set<string>;
let meta: Record<string, string>;
let dir: string;

const bindings = () => ({
  'eye:source-sha': meta.sourceSha,
  'eye:lockfile-sha256': meta.lockfileSha256,
  'eye:descriptor-sha256': meta.descriptorSha256,
  'eye:generator-sha256': meta.generatorSha256,
});

/** Serialize a (possibly mutated) document and reconcile it FROM DISK. */
function reconcileFromDisk(closure: Closure, mutate?: (doc: Doc) => void): Rec {
  const doc = buildSbom(closure, meta) as unknown as Doc;
  if (mutate !== undefined) mutate(doc);
  const file = join(dir, `sbom-${Math.random().toString(36).slice(2)}.json`);
  writeFileSync(file, serialize(doc));
  const onDisk = extractFromSbom(readFileSync(file, 'utf8'));
  rmSync(file);
  return reconcile(closure, onDisk, {
    expectedBindings: { 'eye:target-id': closure.target.id, ...bindings() },
  }) as Rec;
}

/** Which failure lists are non-empty — the precise shape of a detection. */
const failures = (rec: Rec): string[] => FAILURE_KEYS.filter((k: string) => rec[k].length > 0);

function pickRegistryComponent(doc: Doc): Doc['components'][number] {
  const c = doc.components.find((x) => x.purl !== undefined && !x['bom-ref'].startsWith('workspace:'));
  if (c === undefined) throw new Error('no registry component in the generated SBOM');
  return c;
}
function pickWorkspaceComponent(doc: Doc): Doc['components'][number] {
  const c = doc.components.find((x) => x['bom-ref'].startsWith('workspace:'));
  if (c === undefined) throw new Error('no workspace component in the generated SBOM');
  return c;
}
const propOf = (c: Doc['components'][number], name: string) =>
  c.properties.find((p) => p.name === name);

beforeAll(() => {
  const built = buildAllClosures(REPO) as {
    closures: Record<string, Closure>; lockUniverse: Set<string>; meta: typeof meta;
  };
  closures = built.closures;
  lockUniverse = built.lockUniverse;
  meta = built.meta;
  dir = mkdtempSync(join(tmpdir(), 'eye-c16-controls-'));
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 baseline — the uncorrupted closure reconciles clean in both directions', () => {
  it('production and development both reconcile with zero differences of any kind', () => {
    for (const name of ['production', 'development']) {
      const rec = reconcileFromDisk(closures[name]!);
      expect(failures(rec), `${name} unexpected failures`).toEqual([]);
      expect(rec.clean).toBe(true);
      expect(rec.lock_nodes).toBe(rec.sbom_nodes);
      expect(rec.lock_edges).toBe(rec.sbom_edges);
      expect(rec.subject_root_edges_present).toBe(rec.subject_root_edges_expected);
    }
  });

  it('the closure resolves every reference; nothing is silently skipped', () => {
    for (const name of ['production', 'development']) {
      expect(closures[name]!.unresolved, `${name} unresolved references`).toEqual([]);
    }
  });

  it('the two targets are genuinely different closures, not the same set twice', () => {
    const prod = new Set(closures.production!.nodes.keys());
    const dev = new Set(closures.development!.nodes.keys());
    expect([...prod].filter((n) => !dev.has(n)), 'components in prod but not dev').toEqual([]);
    expect([...dev].filter((n) => !prod.has(n)).length).toBeGreaterThan(50);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 control — component presence and multiplicity', () => {
  it('removing a real component is reported as a missing node', () => {
    let removed = '';
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      const victim = pickRegistryComponent(doc);
      removed = victim['bom-ref'];
      doc.components = doc.components.filter((c) => c['bom-ref'] !== removed);
      doc.dependencies = doc.dependencies.filter((d) => d.ref !== removed);
    });
    expect(rec.clean).toBe(false);
    expect(rec.missing_nodes).toContain(removed);
  });

  it('adding a ghost component is reported as an extra node and an orphan', () => {
    const ghost = 'pkg:npm/eye-ghost-control@9.9.9';
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      doc.components.push({
        'bom-ref': ghost, name: 'eye-ghost-control', version: '9.9.9', type: 'library', purl: ghost,
        properties: [{ name: 'eye:lock-key', value: 'eye-ghost-control@9.9.9' }],
      });
      doc.dependencies.push({ ref: ghost, dependsOn: [] });
    });
    expect(rec.clean).toBe(false);
    expect(rec.extra_nodes).toContain(ghost);
    expect(rec.orphan_components).toContain(ghost);
  });

  it('DUPLICATING a component is reported — a Set comparison cannot see this', () => {
    let ref = '';
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      const victim = pickRegistryComponent(doc);
      ref = victim['bom-ref'];
      doc.components.push(JSON.parse(JSON.stringify(victim)) as Doc['components'][number]);
    });
    expect(rec.clean).toBe(false);
    expect(rec.duplicate_components.join(' ')).toContain(ref);
    // The node SETS still match exactly; only multiplicity differs.
    expect(rec.missing_nodes).toEqual([]);
    expect(rec.extra_nodes).toEqual([]);
  });

  it('DUPLICATING a dependency entry is reported', () => {
    let ref = '';
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      const entry = doc.dependencies[1]!;
      ref = entry.ref;
      doc.dependencies.push(JSON.parse(JSON.stringify(entry)) as Doc['dependencies'][number]);
    });
    expect(rec.clean).toBe(false);
    expect(rec.duplicate_dependency_entries.join(' ')).toContain(ref);
  });

  it('REPEATING a dependsOn value is reported', () => {
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      const entry = doc.dependencies.find((d) => d.dependsOn.length > 0)!;
      entry.dependsOn = [...entry.dependsOn, entry.dependsOn[0]!];
    });
    expect(rec.clean).toBe(false);
    expect(rec.duplicate_depends_on.length).toBeGreaterThan(0);
  });

  it('DUPLICATING a required property is reported', () => {
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      const victim = pickRegistryComponent(doc);
      victim.properties.push({ name: 'eye:lock-key', value: 'a-second-conflicting-value@0.0.0' });
    });
    expect(rec.clean).toBe(false);
    expect(rec.duplicate_properties.join(' ')).toContain('eye:lock-key');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 control — component identity fields', () => {
  it('altering a version is reported even though the bom-ref set still matches', () => {
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      pickRegistryComponent(doc).version = '0.0.0-tampered';
    });
    expect(rec.missing_nodes).toEqual([]);
    expect(rec.extra_nodes).toEqual([]);
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toContain('0.0.0-tampered');
  });

  it('altering a name is reported', () => {
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      pickRegistryComponent(doc).name = 'typosquat-impostor';
    });
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toContain('typosquat-impostor');
  });

  it('altering the component type is reported', () => {
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      pickRegistryComponent(doc).type = 'framework';
    });
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toContain('type');
  });

  it('substituting a PURL is reported', () => {
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      pickRegistryComponent(doc).purl = 'pkg:npm/typosquat-impostor@1.0.0';
    });
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toContain('purl');
  });

  it('a NON-CANONICAL scoped PURL is reported, even for the right package', () => {
    // `%40scope%2Fname` parses as a namespace-less package whose name contains a
    // slash: a different identity, which the previous exact-string comparison of two
    // equally non-canonical values could never surface.
    const scoped = () => {
      const c = closures.production!;
      const node = [...c.nodes.values()].find((n) => n.name.startsWith('@') && n.kind !== 'workspace');
      if (node === undefined) throw new Error('no scoped registry component');
      return node;
    };
    const victim = scoped();
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      const comp = doc.components.find((c) => c['bom-ref'] === victim.bomRef)!;
      const slash = victim.name.indexOf('/');
      comp.purl = `pkg:npm/${encodeURIComponent(victim.name.slice(0, slash))}%2F${victim.name.slice(slash + 1)}@${victim.version}`;
    });
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toMatch(/purl/);
  });

  it('a syntactically INVALID PURL is reported as unparseable', () => {
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      pickRegistryComponent(doc).purl = 'not-a-purl-at-all';
    });
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toContain('not a parseable Package URL');
  });

  it('rewriting the lock-key provenance property is reported', () => {
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      propOf(pickRegistryComponent(doc), 'eye:lock-key')!.value = 'something-else@0.0.0';
    });
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toContain('eye:lock-key');
  });

  it('REMOVING an SRI hash is reported', () => {
    const withHash = () => {
      const c = closures.production!;
      const node = [...c.nodes.values()].find((n) => n.integrity !== null);
      if (node === undefined) throw new Error('no component with integrity in the closure');
      return node;
    };
    const victim = withHash();
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      const comp = doc.components.find((c) => c['bom-ref'] === victim.bomRef)!;
      delete comp.hashes;
    });
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toMatch(/integrity hash .* is absent|no hashes/);
  });

  it('ALTERING an SRI hash value is reported', () => {
    const victim = [...closures.production!.nodes.values()].find((n) => n.integrity !== null)!;
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      const comp = doc.components.find((c) => c['bom-ref'] === victim.bomRef)!;
      comp.hashes = [{ alg: 'SHA-512', content: 'f'.repeat(128) }];
    });
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toContain('integrity hash');
  });

  it('changing the eye:target property is reported', () => {
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      propOf(pickRegistryComponent(doc), 'eye:target')!.value = 'some-other-target';
    });
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toContain('eye:target');
  });

  it('changing the eye:scopes property is reported', () => {
    const rec = reconcileFromDisk(closures.development!, (doc) => {
      propOf(pickRegistryComponent(doc), 'eye:scopes')!.value = 'devDependencies,dependencies,invented';
    });
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toContain('eye:scopes');
  });

  it('removing the eye:peer-context property from a peer-resolved component is reported', () => {
    const variant = [...closures.production!.nodes.values()].find((n) => n.peerSuffix !== '')!;
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      const comp = doc.components.find((c) => c['bom-ref'] === variant.bomRef)!;
      comp.properties = comp.properties.filter((p) => p.name !== 'eye:peer-context');
    });
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toContain('eye:peer-context');
  });

  it('INVENTING a patch hash on an unpatched component is reported', () => {
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      pickRegistryComponent(doc).properties.push({ name: 'eye:patch-hash', value: 'deadbeef' });
    });
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toContain('eye:patch-hash');
  });

  it('removing an os/cpu constraint property is reported', () => {
    const constrained = [...closures.production!.nodes.values()]
      .find((n) => (n as unknown as { os: unknown }).os !== null);
    expect(constrained, 'the closure must contain a platform-constrained component').toBeDefined();
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      const comp = doc.components.find((c) => c['bom-ref'] === constrained!.bomRef)!;
      comp.properties = comp.properties.filter((p) => p.name !== 'eye:os');
    });
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toContain('eye:os');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 control — first-party workspace identity', () => {
  it('the closure carries REAL workspace names and versions from package.json', () => {
    const ws = [...closures.production!.nodes.values()].filter((n) => n.kind === 'workspace');
    expect(ws.length).toBeGreaterThan(0);
    for (const w of ws) {
      expect(w.name, `${w.bomRef} name`).toMatch(/^@eye\//);
      expect(w.version, `${w.bomRef} version`).not.toBe('0.0.0');
      expect(w.manifestSha256, `${w.bomRef} manifest digest`).toMatch(/^[a-f0-9]{64}$/);
      // The old fabricated identity was the path basename at version 0.0.0.
      expect(w.name).not.toBe(w.importerPath!.split('/').pop());
    }
    const names = ws.map((w) => `${w.name}@${w.version}`).sort();
    expect(names).toContain('@eye/api@0.0.1');
    expect(names).toContain('@eye/contracts@0.0.1');
  });

  it('a FALSE workspace name is reported', () => {
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      pickWorkspaceComponent(doc).name = 'contracts';
    });
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toContain('name');
  });

  it('a FALSE workspace version is reported', () => {
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      pickWorkspaceComponent(doc).version = '0.0.0';
    });
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toContain('0.0.0');
  });

  it('a FALSE workspace manifest digest is reported', () => {
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      propOf(pickWorkspaceComponent(doc), 'eye:workspace-manifest-sha256')!.value = '0'.repeat(64);
    });
    expect(rec.clean).toBe(false);
    expect(rec.field_mismatches.join('\n')).toContain('eye:workspace-manifest-sha256');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 control — edges, multiplicity and subject connectivity', () => {
  it('removing a real edge is reported while all nodes still match', () => {
    const first = closures.production!.edges[0]!;
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      const entry = doc.dependencies.find((d) => d.ref === first.from)!;
      entry.dependsOn = entry.dependsOn.filter((t) => t !== first.to);
    });
    expect(rec.missing_nodes).toEqual([]);
    expect(rec.clean).toBe(false);
    expect(rec.missing_edges).toContain(`${first.from} ${first.to}`);
  });

  it('inventing an edge between two real components is reported', () => {
    const from = closures.production!.edges[0]!.from;
    const unrelated = [...closures.production!.nodes.keys()].find(
      (n) => n !== from && !closures.production!.edges.some((e) => e.from === from && e.to === n),
    )!;
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      const entry = doc.dependencies.find((d) => d.ref === from)!;
      entry.dependsOn = [...entry.dependsOn, unrelated].sort();
    });
    expect(rec.clean).toBe(false);
    expect(rec.extra_edges.join(' ')).toContain(`${from} ${unrelated}`);
  });

  it('an edge to a nonexistent component is reported as dangling', () => {
    const from = closures.production!.edges[0]!.from;
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      doc.dependencies.find((d) => d.ref === from)!.dependsOn.push('pkg:npm/does-not-exist@1.0.0');
    });
    expect(rec.clean).toBe(false);
    expect(rec.dangling_references).toContain(`${from} -> pkg:npm/does-not-exist@1.0.0`);
  });

  it('a component with no dependency entry at all is reported', () => {
    let ref = '';
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      const leaf = doc.dependencies.find((d) => d.dependsOn.length === 0 && d.ref !== subjectRef(closures.production!.target.id))!;
      ref = leaf.ref;
      doc.dependencies = doc.dependencies.filter((d) => d.ref !== ref);
    });
    expect(rec.clean).toBe(false);
    expect(rec.components_without_dependency_entry).toContain(ref);
  });

  it('the metadata subject is connected to EVERY declared importer root', () => {
    const c = closures.production!;
    const rec = reconcileFromDisk(c);
    expect(rec.subject_root_edges_expected).toBe(c.target.importer_roots.length);
    expect(rec.subject_root_edges_present).toBe(rec.subject_root_edges_expected);
    expect(rec.missing_subject_root_edges).toEqual([]);
  });

  it('REMOVING a subject-to-root edge is reported — roots are not exempt', () => {
    // Exempting roots from the orphan check is precisely what hid a subject attached
    // to nothing in the previous implementation.
    const c = closures.production!;
    const subject = subjectRef(c.target.id) as string;
    const rec = reconcileFromDisk(c, (doc) => {
      const entry = doc.dependencies.find((d) => d.ref === subject)!;
      entry.dependsOn = entry.dependsOn.slice(1);
    });
    expect(rec.clean).toBe(false);
    expect(rec.missing_subject_root_edges.length).toBe(1);
    expect(rec.subject_root_edges_present).toBe(rec.subject_root_edges_expected - 1);
  });

  it('REMOVING the whole subject dependency entry is reported as a disconnected graph', () => {
    const c = closures.production!;
    const subject = subjectRef(c.target.id) as string;
    const rec = reconcileFromDisk(c, (doc) => {
      doc.dependencies = doc.dependencies.filter((d) => d.ref !== subject);
    });
    expect(rec.clean).toBe(false);
    expect(rec.subject_and_binding_problems.join(' ')).toContain('disconnected');
  });

  it('ADDING a subject edge to a non-root is reported', () => {
    const c = closures.production!;
    const subject = subjectRef(c.target.id) as string;
    const nonRoot = [...c.nodes.keys()].find((n) => !c.roots.includes(n))!;
    const rec = reconcileFromDisk(c, (doc) => {
      doc.dependencies.find((d) => d.ref === subject)!.dependsOn.push(nonRoot);
    });
    expect(rec.clean).toBe(false);
    expect(rec.extra_subject_edges.join(' ')).toContain(nonRoot);
  });

  it('CHANGING the metadata subject bom-ref is reported', () => {
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      doc.metadata.component['bom-ref'] = 'eye:target:some-other-thing';
    });
    expect(rec.clean).toBe(false);
    expect(rec.subject_and_binding_problems.join(' ')).toContain('metadata subject');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 control — provenance bindings', () => {
  it('every binding is present and correct in the generated SBOM', () => {
    const doc = buildSbom(closures.production!, meta) as unknown as Doc;
    const props = Object.fromEntries(doc.metadata.properties.map((p) => [p.name, p.value]));
    expect(props['eye:source-sha']).toBe(meta.sourceSha);
    expect(props['eye:lockfile-sha256']).toBe(meta.lockfileSha256);
    expect(props['eye:descriptor-sha256']).toBe(meta.descriptorSha256);
    expect(props['eye:generator-sha256']).toBe(meta.generatorSha256);
    expect(props['eye:purl-implementation']).toBe('packageurl-js@2.0.1');
    expect(props['eye:yaml-implementation']).toBe('yaml@2.9.0');
  });

  it.each([
    'eye:source-sha', 'eye:lockfile-sha256', 'eye:descriptor-sha256', 'eye:generator-sha256',
  ])('tampering with %s is reported', (prop) => {
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      doc.metadata.properties.find((p) => p.name === prop)!.value = 'deadbeef';
    });
    expect(rec.clean).toBe(false);
    expect(rec.subject_and_binding_problems.join(' ')).toContain(prop);
  });

  it('REMOVING a binding is reported', () => {
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      doc.metadata.properties = doc.metadata.properties.filter((p) => p.name !== 'eye:lockfile-sha256');
    });
    expect(rec.clean).toBe(false);
    expect(rec.subject_and_binding_problems.join(' ')).toContain('eye:lockfile-sha256');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 control — peer resolutions stay distinct', () => {
  it('two peer resolutions of the same name@version are two components', () => {
    // Find a name@version that genuinely resolves more than once in the dev closure.
    const byNameVersion = new Map<string, string[]>();
    for (const n of closures.development!.nodes.values()) {
      const k = `${n.name}@${n.version}`;
      byNameVersion.set(k, [...(byNameVersion.get(k) ?? []), n.bomRef]);
    }
    const multi = [...byNameVersion.entries()].filter(([, refs]) => refs.length > 1);
    // If the lockfile has none today, the peer-variant count must still be non-zero,
    // and the collapse control below is the load-bearing proof.
    expect([...closures.development!.nodes.values()].filter((n) => n.peerSuffix !== '').length)
      .toBeGreaterThan(0);
    for (const [, refs] of multi) expect(new Set(refs).size).toBe(refs.length);
  });

  it('COLLAPSING a peer variant to name@version is reported as a missing node', () => {
    const victim = [...closures.development!.nodes.values()].find((n) => n.peerSuffix !== '')!;
    const rec = reconcileFromDisk(closures.development!, (doc) => {
      const comp = doc.components.find((c) => c['bom-ref'] === victim.bomRef)!;
      const collapsed = `${victim.name}@${victim.version}`;
      comp['bom-ref'] = collapsed;
      for (const d of doc.dependencies) {
        if (d.ref === victim.bomRef) d.ref = collapsed;
        d.dependsOn = d.dependsOn.map((t) => (t === victim.bomRef ? collapsed : t));
      }
    });
    expect(rec.clean).toBe(false);
    expect(rec.missing_nodes).toContain(victim.bomRef);
    expect(rec.extra_nodes.join(' ')).toContain(`${victim.name}@${victim.version}`);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 control — platform resolution is target-driven', () => {
  it('linux-x64 optional native binaries ARE in the closure', () => {
    const names = [...closures.production!.nodes.values()].map((n) => n.name);
    expect(names).toContain('@img/sharp-linux-x64');
    expect(names).toContain('@next/swc-linux-x64-gnu');
  });

  it('omitting a compatible optional dependency is reported as missing', () => {
    const victim = [...closures.production!.nodes.values()].find((n) => n.name === '@img/sharp-linux-x64')!;
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      doc.components = doc.components.filter((c) => c['bom-ref'] !== victim.bomRef);
      doc.dependencies = doc.dependencies.filter((d) => d.ref !== victim.bomRef);
    });
    expect(rec.clean).toBe(false);
    expect(rec.missing_nodes).toContain(victim.bomRef);
  });

  it('darwin and arm64 binaries are excluded, each naming the field and value that excluded it', () => {
    const names = [...closures.production!.nodes.values()].map((n) => n.name);
    expect(names).not.toContain('@img/sharp-darwin-arm64');
    expect(names).not.toContain('@img/sharp-libvips-linux-arm64');

    const excluded = closures.production!.excludedByPlatform;
    expect(excluded.length).toBeGreaterThan(0);
    for (const e of excluded) {
      expect(['os', 'cpu', 'libc']).toContain(e.field);
      expect(e.reason).toMatch(/^(requires |excluded by !)/);
      expect(e.parent, `${e.bomRef} must record its parent`).toBeTruthy();
    }
    expect(excluded.find((e) => e.bomRef.includes('sharp-darwin-arm64'))?.reason).toBe('requires darwin');
    expect(excluded.find((e) => e.bomRef.includes('libvips-linux-arm64'))?.field).toBe('cpu');
  });

  it('injecting an incompatible platform dependency is reported as an extra node', () => {
    const ref = '@img/sharp-darwin-arm64@0.35.3';
    const rec = reconcileFromDisk(closures.production!, (doc) => {
      doc.components.push({
        'bom-ref': ref, name: '@img/sharp-darwin-arm64', version: '0.35.3', type: 'library',
        purl: 'pkg:npm/%40img/sharp-darwin-arm64@0.35.3',
        properties: [{ name: 'eye:lock-key', value: ref }],
      });
      doc.dependencies.push({ ref, dependsOn: [] });
      doc.dependencies[1]!.dependsOn = [...doc.dependencies[1]!.dependsOn, ref].sort();
    });
    expect(rec.clean).toBe(false);
    expect(rec.extra_nodes).toContain(ref);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 control — exclusion governance is code-owned, enforced AND applied', () => {
  const RUN_DATE = '2026-08-12';
  const FUTURE = '2027-01-01';
  const EVIDENCE = 'PHASE0_EVIDENCE.md';
  const evidenceDigest = createHash('sha256')
    .update(readFileSync(join(REPO, EVIDENCE))).digest('hex');

  const isTracked = (rel: string) =>
    spawnSync('git', ['ls-files', '--error-unmatch', rel], { cwd: REPO, encoding: 'utf8' }).status === 0;
  const readEvidence = (rel: string) => {
    try { return readFileSync(join(REPO, rel)); } catch { return null; }
  };

  /** An entry satisfying every field contract; each test breaks exactly one thing. */
  const base = {
    id: 'CX-TEST-0001',
    target: 'production',
    scope: 'optionalDependencies',
    reason: 'control fixture for the C16 exclusion governance rules',
    evidence: EVIDENCE,
    evidence_sha256: evidenceDigest,
    owner: 'platform-team',
    approver: 'security-review',
    approved_on: '2026-08-01',
    expires_on: FUTURE,
  };
  const doc = (exclusions: unknown[], over: Record<string, unknown> = {}) => ({
    schema_version: '3.0.0',
    required_fields: [...EXCLUSION_REQUIRED_FIELDS],
    rejection_rules: {},
    exclusions,
    ...over,
  });
  const govern = (exclusions: unknown[], over: Record<string, unknown> = {}) =>
    governExclusions(doc(exclusions, over), closures, lockUniverse, RUN_DATE,
      { root: REPO, isTracked, readEvidence }) as
      { problems: string[]; valid: unknown[]; declared: number };

  /** A node reachable ONLY through optional edges, so excluding it is permissible. */
  const optionalOnlyNode = () => {
    const c = closures.production!;
    for (const n of c.nodes.values()) {
      if (n.kind === 'workspace') continue;
      const inbound = c.edges.filter((e) => e.to === n.bomRef);
      if (inbound.length > 0 && inbound.every((e) => e.kind === 'optionalDependencies')) {
        return { node: n, parent: inbound[0]! };
      }
    }
    throw new Error('no optional-only node in the production closure');
  };
  const validEntry = () => {
    const { node, parent } = optionalOnlyNode();
    return {
      ...base,
      resolution_key: node.lockKey,
      scope: [...node.scopes].includes('optionalDependencies') ? 'optionalDependencies' : [...node.scopes][0]!,
      parent_edge: `${parent.from} -> ${parent.to}`,
    };
  };

  it('the committed exclusion file is empty and passes its own code-owned validation', () => {
    const committed = JSON.parse(
      readFileSync(join(REPO, 'scripts/gate/closure-exclusions.json'), 'utf8'),
    ) as { exclusions: unknown[]; required_fields: string[]; schema_version: string };
    expect(committed.exclusions).toEqual([]);
    expect(committed.schema_version).toBe('3.0.0');
    const r = governExclusions(committed, closures, lockUniverse, RUN_DATE,
      { root: REPO, isTracked, readEvidence }) as { problems: string[] };
    expect(r.problems).toEqual([]);
  });

  it('the document CANNOT redefine the required-field set', () => {
    // A document that declares its own policy could weaken its own validation.
    const tampered = govern([], { required_fields: ['id', 'target'] });
    expect(tampered.problems.join('\n')).toContain('differs from the code-owned');
    const wrongSchema = govern([], { schema_version: '99.0.0' });
    expect(wrongSchema.problems.join('\n')).toContain('not one of the code-owned supported versions');
  });

  it('POSITIVE: a fully valid exclusion is accepted, APPLIED once, and cascades deterministically', () => {
    const entry = validEntry();
    const r = govern([entry]);
    expect(r.problems, 'a valid exclusion must be accepted').toEqual([]);
    expect(r.valid).toHaveLength(1);

    const before = closures.production!.nodes.size;
    const applied = applyExclusions(closures.production!, r.valid) as {
      closure: Closure;
      applied: Array<{ id: string; bom_ref: string; removed_edges: string[] }>;
      excluded: LockNode[];
      cascaded: Array<{ bom_ref: string; reason: string }>;
    };
    expect(applied.applied).toHaveLength(1);
    expect(applied.applied[0]!.id).toBe(entry.id);
    expect(applied.closure.nodes.has(applied.applied[0]!.bom_ref)).toBe(false);
    expect(applied.applied[0]!.removed_edges.length).toBeGreaterThan(0);

    // Cardinalities must agree exactly.
    const removed = before - applied.closure.nodes.size;
    expect(removed).toBe(applied.applied.length + applied.cascaded.length);
    expect(checkExclusionCardinality({
      declared: 1, rejected: 0, valid: 1,
      applied: applied.applied.length, removedNodes: removed, cascaded: applied.cascaded.length,
    })).toEqual([]);

    // Every cascaded removal is individually recorded with a reason.
    for (const c of applied.cascaded) {
      expect(c.bom_ref).toBeTruthy();
      expect(c.reason).toMatch(/unreachable/);
    }

    // The reduced graph must have NO orphan and NO dangling reference.
    const rec = reconcileFromDisk(applied.closure);
    expect(failures(rec), 'reduced closure must reconcile clean').toEqual([]);
    expect(rec.orphan_components).toEqual([]);
    expect(rec.dangling_references).toEqual([]);
  });

  it('applying zero exclusions leaves the closure identical', () => {
    const same = applyExclusions(closures.production!, []) as { closure: Closure; applied: unknown[]; cascaded: unknown[] };
    expect(same.applied).toEqual([]);
    expect(same.cascaded).toEqual([]);
    expect(same.closure.nodes.size).toBe(closures.production!.nodes.size);
  });

  it.each([
    ['wildcard_or_name_only', { resolution_key: '@img/sharp-*', parent_edge: 'x -> y' }],
    ['wildcard_or_name_only', { resolution_key: 'nanoid', parent_edge: 'x -> y' }],
    ['stale_not_in_closure', { resolution_key: 'left-pad@1.3.0', parent_edge: 'x -> y' }],
    ['version_changed', { resolution_key: 'nanoid@3.3.11', parent_edge: 'x -> y' }],
  ])('rejects by %s', (rule, patch) => {
    const r = govern([{ ...base, ...patch }]);
    expect(r.problems.join('\n')).toContain(`rejected by '${rule}'`);
    expect(r.valid).toHaveLength(0);
  });

  it('rejects an entry that never applied to the declared target', () => {
    const devOnly = [...closures.development!.nodes.values()].find(
      (n) => n.kind !== 'workspace' && !closures.production!.nodes.has(n.bomRef) && n.peerSuffix === '',
    )!;
    const r = govern([{ ...base, resolution_key: `${devOnly.name}@${devOnly.version}`, parent_edge: 'x -> y' }]);
    expect(r.problems.join('\n')).toContain("rejected by 'unused_never_applied'");
  });

  it('rejects excluding a target-compatible MANDATORY dependency', () => {
    const mandatory = closures.production!.edges.find((e) => e.kind === 'dependencies')!;
    const node = closures.production!.nodes.get(mandatory.to)!;
    const r = govern([{
      ...base, scope: 'dependencies', resolution_key: node.lockKey,
      parent_edge: `${mandatory.from} -> ${mandatory.to}`,
    }]);
    expect(r.problems.join('\n')).toContain("rejected by 'excludes_compatible_mandatory_dependency'");
  });

  it('rejects a wrong target, and a scope the NODE does not actually hold', () => {
    const e = validEntry();
    expect(govern([{ ...e, target: 'staging' }]).problems.join('\n'))
      .toContain("rejected by 'wrong_target'");
    expect(govern([{ ...e, scope: 'devDependencies' }]).problems.join('\n'))
      .toContain("rejected by 'wrong_target'");
  });

  it('rejects a parent_edge that is not real, and one that terminates ELSEWHERE', () => {
    const e = validEntry();
    expect(govern([{ ...e, parent_edge: 'not -> an-edge' }]).problems.join('\n'))
      .toContain("rejected by 'wrong_parent'");
    // A REAL edge that does not terminate at the excluded component must not justify it.
    const unrelated = closures.production!.edges.find(
      (x) => x.to !== e.resolution_key && !e.parent_edge.endsWith(x.to),
    )!;
    const r = govern([{ ...e, parent_edge: `${unrelated.from} -> ${unrelated.to}` }]);
    expect(r.problems.join('\n')).toContain('terminates at');
    expect(r.valid).toHaveLength(0);
  });

  it('rejects an EXPIRED exclusion and a FUTURE approval', () => {
    const e = validEntry();
    expect(govern([{ ...e, expires_on: '2026-08-11' }]).problems.join('\n'))
      .toContain("rejected by 'expired'");
    expect(govern([{ ...e, approved_on: '2027-06-01', expires_on: '2027-12-01' }]).problems.join('\n'))
      .toContain("rejected by 'future_approval'");
    // expiry must be strictly after approval
    expect(govern([{ ...e, approved_on: '2026-08-01', expires_on: '2026-08-01' }]).problems.join('\n'))
      .toContain('is not after approved_on');
  });

  it('rejects self-approval, a malformed digest and a non-ISO date', () => {
    const e = validEntry();
    expect(govern([{ ...e, approver: e.owner }]).problems.join('\n')).toContain("rejected by 'unapproved'");
    expect(govern([{ ...e, evidence_sha256: 'not-a-digest' }]).problems.join('\n')).toContain("rejected by 'unapproved'");
    expect(govern([{ ...e, approved_on: 'last tuesday' }]).problems.join('\n')).toContain('approved_on');
  });

  it('rejects FAKE evidence, an untracked path and a WRONG evidence digest', () => {
    const e = validEntry();
    expect(govern([{ ...e, evidence: 'does/not/exist.md' }]).problems.join('\n'))
      .toContain('does not exist');
    expect(govern([{ ...e, evidence: '/etc/passwd' }]).problems.join('\n'))
      .toContain('repository-relative');
    expect(govern([{ ...e, evidence: '../outside.md' }]).problems.join('\n'))
      .toContain('repository-relative');
    // Right file, wrong digest: the approval is not bound to these bytes.
    const r = govern([{ ...e, evidence_sha256: 'b'.repeat(64) }]);
    expect(r.problems.join('\n')).toContain('evidence digest mismatch');
    expect(r.valid).toHaveLength(0);
  });

  it('rejects DUPLICATE ids and duplicate entries even when one node would be removed', () => {
    const e = validEntry();
    const dupId = govern([e, { ...e, resolution_key: 'nanoid@3.3.18', parent_edge: 'x -> y' }]);
    expect(dupId.problems.join('\n')).toContain('duplicate exclusion id');

    const dupEntry = govern([e, { ...e, id: 'CX-TEST-0002' }]);
    expect(dupEntry.problems.join('\n')).toContain('duplicate entry');
    expect(dupEntry.valid, 'neither duplicate may be applied').toHaveLength(1);
  });

  it.each(EXCLUSION_REQUIRED_FIELDS as unknown as string[])(
    'rejects an entry missing the required field %s', (field) => {
      const entry: Record<string, unknown> = { ...validEntry() };
      entry[field] = '';
      expect(govern([entry]).problems.join('\n')).toContain(`missing required field '${field}'`);
    },
  );

  it('cardinality disagreement is itself a failure', () => {
    expect(checkExclusionCardinality({
      declared: 2, rejected: 0, valid: 2, applied: 1, removedNodes: 1, cascaded: 0,
    }).join(' ')).toContain('2 valid entries but 1 applied');
    expect(checkExclusionCardinality({
      declared: 1, rejected: 0, valid: 1, applied: 1, removedNodes: 5, cascaded: 0,
    }).join(' ')).toContain('5 nodes removed but 1 applied + 0 cascaded');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 control — the target definition is load-bearing', () => {
  it('narrowing the importer roots removes components', () => {
    const narrowed = buildAllClosures(REPO) as { closures: Record<string, Closure> };
    // Rebuild production over a single root using the production target shape.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { buildClosure, loadLock } = require('../../../../scripts/gate/lib/lock-closure.mjs') as {
      buildClosure: (l: unknown, t: unknown, o: unknown) => Closure; loadLock: (p: string) => unknown;
    };
    const lock = loadLock(join(REPO, 'pnpm-lock.yaml'));
    const descriptor = JSON.parse(
      readFileSync(join(REPO, 'scripts/gate/target-descriptor.json'), 'utf8'),
    ) as { first_party_component_types: { by_importer_root: Record<string, string> } };
    const one = buildClosure(
      lock,
      { ...narrowed.closures.production!.target, importer_roots: ['packages/tokens'], integrity_rules: [] },
      { root: REPO, firstPartyTypes: descriptor.first_party_component_types.by_importer_root },
    );
    expect(one.nodes.size).toBeLessThan(closures.production!.nodes.size);
    expect(one.roots).toEqual(['workspace:packages/tokens']);
  });

  it('widening the scopes adds components', () => {
    expect(closures.production!.target.dependency_scopes).not.toContain('devDependencies');
    expect(closures.development!.target.dependency_scopes).toContain('devDependencies');
    expect(closures.development!.nodes.size).toBeGreaterThan(closures.production!.nodes.size);
    expect(closures.development!.edges.length).toBeGreaterThan(closures.production!.edges.length);
  });

  it('countsOf reports the subject-root edge count alongside the graph counts', () => {
    const c = countsOf(closures.production!) as { subject_root_edges: number; nodes: number };
    expect(c.subject_root_edges).toBe(closures.production!.roots.length);
    expect(c.nodes).toBe(closures.production!.nodes.size);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 control — output is a function of the lockfile, not the environment', () => {
  it('two builds of the same target serialize byte-identically', () => {
    expect(serialize(buildSbom(closures.production!, meta)))
      .toBe(serialize(buildSbom(closures.production!, meta)));
  });

  it('the SBOM carries no wall-clock timestamp and no random serial number', () => {
    const doc = buildSbom(closures.production!, meta) as unknown as {
      metadata: Record<string, unknown>; serialNumber: string;
    };
    expect(doc.metadata['timestamp']).toBeUndefined();
    expect(doc.serialNumber).toBe((buildSbom(closures.production!, meta) as { serialNumber: string }).serialNumber);
    expect(doc.serialNumber).toMatch(/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('a mutated node_modules tree cannot change the closure', () => {
    const ghostDir = join(REPO, 'node_modules', 'eye-c16-control-ghost');
    const before = serialize(buildSbom(closures.production!, meta)) as string;
    mkdirSync(ghostDir, { recursive: true });
    writeFileSync(join(ghostDir, 'package.json'), '{"name":"eye-c16-control-ghost","version":"9.9.9"}');
    try {
      const rebuilt = buildAllClosures(REPO) as { closures: Record<string, Closure>; meta: typeof meta };
      const after = serialize(buildSbom(rebuilt.closures.production!, rebuilt.meta)) as string;
      expect(after).toBe(before);
      expect(after).not.toContain('eye-c16-control-ghost');
    } finally {
      rmSync(ghostDir, { recursive: true, force: true });
    }
  });

  it('the exact nanoid pin leaves no vulnerable residual in either closure', () => {
    for (const [name, closure] of Object.entries(closures)) {
      const versions = [...closure.nodes.values()].filter((n) => n.name === 'nanoid').map((n) => n.version);
      expect(versions.length, `${name} must resolve nanoid`).toBeGreaterThan(0);
      for (const v of versions) expect(v, `${name} resolved a vulnerable nanoid`).toBe('3.3.18');
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3 control — metadata bindings are an exact MULTISET', () => {
  /**
   * `Object.fromEntries` kept only the LAST occurrence of a repeated property, so a
   * duplicate binding simply disappeared. A second `eye:source-sha` would let a reader
   * pick either value, so the artifact would no longer name one source unambiguously.
   */
  const bind = (closure: Closure) => ({
    requireExactBindings: true,
    expectedSubjectVersion: meta.projectVersion,
    expectedBindings: governedBindings(closure),
  });

  const governedBindings = (closure: Closure): Record<string, string> => {
    const t = closure.target as unknown as {
      id: string; os: string; arch: string; libc: string;
      node: { pinned: string }; pnpm: { pinned: string };
      importer_roots: string[]; dependency_scopes: string[];
    };
    return {
      'eye:target-id': t.id,
      'eye:target-os': t.os,
      'eye:target-arch': t.arch,
      'eye:target-libc': t.libc,
      'eye:target-node': t.node.pinned,
      'eye:target-pnpm': t.pnpm.pinned,
      'eye:importer-roots': t.importer_roots.join(','),
      'eye:dependency-scopes': t.dependency_scopes.join(','),
      'eye:closure-source': 'pnpm-lock.yaml (importers+packages+snapshots)',
      'eye:source-sha': meta.sourceSha,
      'eye:lockfile-sha256': meta.lockfileSha256,
      'eye:descriptor-sha256': meta.descriptorSha256,
      'eye:generator': 'scripts/gate/generate-closures.mjs',
      'eye:generator-sha256': meta.generatorSha256,
      'eye:purl-implementation': meta.purlImplementation,
      'eye:yaml-implementation': meta.yamlImplementation,
    };
  };

  /** Reconcile with the full governed binding set, optionally mutating the document. */
  const reconcileBound = (closure: Closure, mutate?: (doc: Doc) => void): Rec => {
    const doc = buildSbom(closure, meta) as unknown as Doc;
    if (mutate !== undefined) mutate(doc);
    const file = join(dir, `sbom-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(file, serialize(doc));
    const onDisk = extractFromSbom(readFileSync(file, 'utf8'));
    rmSync(file);
    return reconcile(closure, onDisk, bind(closure)) as Rec;
  };

  it('the unmutated document reconciles clean under the full governed binding set', () => {
    const rec = reconcileBound(closures.production!);
    expect(failures(rec)).toEqual([]);
  });

  it.each([
    'eye:source-sha', 'eye:lockfile-sha256', 'eye:generator-sha256', 'eye:descriptor-sha256',
  ])('an IDENTICAL duplicate of %s is rejected', (prop) => {
    const rec = reconcileBound(closures.production!, (doc) => {
      const original = doc.metadata.properties.find((p) => p.name === prop)!;
      doc.metadata.properties.push({ name: prop, value: original.value });
    });
    expect(rec.clean).toBe(false);
    expect(rec.subject_and_binding_problems.join('\n')).toMatch(new RegExp(`DUPLICATE metadata property ${prop} x2`));
  });

  it.each([
    ['before', 'unshift'],
    ['after', 'push'],
  ])('a CONFLICTING duplicate inserted %s the legitimate value is rejected', (_where, method) => {
    const rec = reconcileBound(closures.production!, (doc) => {
      const fake = { name: 'eye:source-sha', value: 'f'.repeat(40) };
      if (method === 'unshift') doc.metadata.properties.unshift(fake);
      else doc.metadata.properties.push(fake);
    });
    expect(rec.clean).toBe(false);
    const text = rec.subject_and_binding_problems.join('\n');
    expect(text).toMatch(/DUPLICATE metadata property eye:source-sha/);
    // …and the conflicting VALUE is reported too, whichever position it took.
    expect(text).toMatch(/eye:source-sha' is "f{40}"/);
  });

  it('a REMOVED binding is rejected', () => {
    const rec = reconcileBound(closures.production!, (doc) => {
      doc.metadata.properties = doc.metadata.properties.filter((p) => p.name !== 'eye:generator-sha256');
    });
    expect(rec.clean).toBe(false);
    expect(rec.subject_and_binding_problems.join('\n')).toMatch(/eye:generator-sha256' is absent/);
  });

  it('an UNKNOWN binding is rejected', () => {
    const rec = reconcileBound(closures.production!, (doc) => {
      doc.metadata.properties.push({ name: 'eye:not-governed', value: 'x' });
    });
    expect(rec.clean).toBe(false);
    expect(rec.subject_and_binding_problems.join('\n')).toMatch(/UNKNOWN metadata property 'eye:not-governed'/);
  });

  it.each([
    'eye:target-node', 'eye:target-pnpm', 'eye:importer-roots', 'eye:target-arch', 'eye:target-libc',
  ])('tampering with %s is rejected', (prop) => {
    const rec = reconcileBound(closures.production!, (doc) => {
      doc.metadata.properties.find((p) => p.name === prop)!.value = 'tampered';
    });
    expect(rec.clean).toBe(false);
    expect(rec.subject_and_binding_problems.join('\n')).toContain(prop);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3 control — top-level document identity', () => {
  const withDocument = (closure: Closure, mutate?: (doc: Doc) => void): Rec => {
    const built = buildSbom(closure, meta) as unknown as Doc & { serialNumber: string };
    const expectedSerial = built.serialNumber;
    // Capture the subject's legitimate PURL BEFORE mutating, so the expectation is the
    // generator's own canonical value rather than a value restated by the test.
    const expectedPurl = (built.metadata.component as unknown as { purl?: string }).purl ?? null;
    if (mutate !== undefined) mutate(built);
    const file = join(dir, `sbom-${Math.random().toString(36).slice(2)}.json`);
    writeFileSync(file, serialize(built));
    const onDisk = extractFromSbom(readFileSync(file, 'utf8'));
    rmSync(file);
    return reconcile(closure, onDisk, {
      expectedDocument: {
        bomFormat: 'CycloneDX', specVersion: '1.6', version: 1, serialNumber: expectedSerial,
      },
      expectedSubjectVersion: meta.projectVersion,
      expectedSubjectType: 'application',
      expectedSubjectPurl: expectedPurl,
      expectedSubjectDescription: (closure.target as unknown as { description: string }).description,
    }) as Rec;
  };

  it('the unmutated document satisfies its declared identity', () => {
    const rec = withDocument(closures.production!);
    expect(rec.subject_and_binding_problems).toEqual([]);
  });

  it.each([
    ['bomFormat', (d: Doc) => { (d as unknown as { bomFormat: string }).bomFormat = 'SPDX'; }],
    ['specVersion', (d: Doc) => { (d as unknown as { specVersion: string }).specVersion = '1.4'; }],
    ['version', (d: Doc) => { (d as unknown as { version: number }).version = 7; }],
    ['serialNumber', (d: Doc) => { (d as unknown as { serialNumber: string }).serialNumber = 'urn:uuid:00000000-0000-5000-8000-000000000000'; }],
  ])('a rewritten %s is rejected', (field, mutate) => {
    const rec = withDocument(closures.production!, mutate);
    expect(rec.subject_and_binding_problems.join('\n')).toContain(`document ${field}`);
  });

  it('an ADDED metadata.timestamp is rejected (it breaks byte-comparability)', () => {
    const rec = withDocument(closures.production!, (d) => {
      (d.metadata as unknown as { timestamp: string }).timestamp = '2026-08-12T00:00:00Z';
    });
    expect(rec.subject_and_binding_problems.join('\n')).toMatch(/metadata\.timestamp is present/);
  });

  it.each(['name', 'version', 'type', 'purl', 'description'])(
    'a rewritten subject %s is rejected', (field) => {
      const rec = withDocument(closures.production!, (d) => {
        (d.metadata.component as unknown as Record<string, unknown>)[field] = 'tampered-value';
      });
      expect(rec.subject_and_binding_problems.join('\n')).toContain(`metadata subject ${field === 'purl' ? 'purl' : field}`);
    },
  );
});
