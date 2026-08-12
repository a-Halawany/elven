/**
 * GATE-2.2 C16 — SYNTHETIC LOCKFILE FIXTURES FOR THE PARSER AND THE TRAVERSAL.
 *
 * The real pnpm-lock.yaml happens not to exercise aliases, patched packages, links to
 * a workspace that is not a declared target root, dependency cycles, unresolvable
 * references, or mixed positive/negative platform constraints. A gate that is only ever
 * run against that one lockfile therefore cannot demonstrate it handles any of them —
 * and the independent review of e3a0b1f found real defects in exactly those paths.
 *
 * Every fixture below is a complete synthetic workspace (package.json manifests plus a
 * pnpm-lock.yaml) written to a temporary directory and fed to the PRODUCTION
 * `buildClosure`. Nothing here inspects source text.
 */
import { describe, expect, it, afterAll } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs gate library shared with the CI scripts (no types)
import { buildClosure, loadLock, splitKey, npmPurl, parsePurl, platformCompatible, resolveLinkPath, validateIntegrity, SUPPORTED_LOCKFILE_VERSIONS } from '../../../../scripts/gate/lib/lock-closure.mjs';

type Node = {
  bomRef: string; name: string; version: string; kind: string; version_: string;
  peerSuffix: string; patchHash: string | null; integrity: string | null;
  scopes: Set<string>; purl: string | null; manifestSha256?: string;
  platform: { compatible: boolean; field: string | null; reason: string | null };
};
type Closure = {
  nodes: Map<string, Node>;
  edges: Array<{ from: string; to: string; kind: string }>;
  roots: string[];
  unresolved: string[];
  excludedByPlatform: Array<{ bomRef: string; parent: string; field: string; reason: string }>;
};

const created: string[] = [];
afterAll(() => { for (const d of created) rmSync(d, { recursive: true, force: true }); });

/** A syntactically valid SRI value, derived so fixtures stay deterministic. */
const sri = (seed: string): string => `sha512-${createHash('sha512').update(seed).digest('base64')}`;

/** Materialize a synthetic repo and return its root. */
function synthRepo(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), 'eye-c16-fixture-'));
  created.push(root);
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

const manifest = (name: string, version = '1.0.0', extra: Record<string, unknown> = {}): string =>
  JSON.stringify({ name, version, private: true, ...extra }, null, 2);

/**
 * Every fixture importer needs a GOVERNED CycloneDX type; an unmapped importer is an
 * error by design, which a dedicated control below exercises.
 */
const FIXTURE_TYPES: Record<string, string> = {
  '.': 'application',
  'packages/linked': 'library',
  'packages/deeper': 'library',
  'packages/a': 'library',
  'packages/b': 'library',
  'packages/lib': 'library',
  'packages/bad': 'library',
  'packages/ghost': 'library',
};

const TARGET = {
  id: 'fixture-linux-x64',
  description: 'synthetic fixture target',
  os: 'linux',
  arch: 'x64',
  libc: 'glibc',
  node: { pinned: '24.11.1' },
  pnpm: { pinned: '11.9.0' },
  importer_roots: ['.'],
  dependency_scopes: ['dependencies', 'optionalDependencies'],
};

const build = (root: string, overrides: Partial<typeof TARGET> = {}, types = FIXTURE_TYPES): Closure =>
  buildClosure(
    loadLock(join(root, 'pnpm-lock.yaml')),
    { ...TARGET, ...overrides, integrity_rules: [] },
    { root, firstPartyTypes: types },
  ) as Closure;

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 fixture — canonical Package URLs come from the pinned reference implementation', () => {
  it('emits the canonical scoped form, with the namespace NOT slash-escaped', () => {
    // The previously emitted `pkg:npm/%40eye%2Fcontracts@0.0.1` is not a cosmetic
    // variant: it parses as a namespace-less package literally named
    // "@eye/contracts", which identifies a different thing.
    expect(npmPurl('@eye/contracts', '0.0.1')).toBe('pkg:npm/%40eye/contracts@0.0.1');
    expect(npmPurl('@img/sharp-linux-x64', '0.35.3')).toBe('pkg:npm/%40img/sharp-linux-x64@0.35.3');
    expect(npmPurl('nanoid', '3.3.18')).toBe('pkg:npm/nanoid@3.3.18');
  });

  it('round-trips scoped, unscoped and escape-requiring names', () => {
    const vectors: Array<[string, string, string | null, string]> = [
      ['nanoid', '3.3.18', null, 'nanoid'],
      ['@eye/contracts', '0.0.1', '@eye', 'contracts'],
      ['@types/node', '26.1.2', '@types', 'node'],
      ['@img/sharp-libvips-linux-x64', '1.3.2', '@img', 'sharp-libvips-linux-x64'],
    ];
    for (const [name, version, ns, bare] of vectors) {
      const purl = npmPurl(name, version);
      const parsed = parsePurl(purl) as { type: string; namespace: string | null; name: string; version: string };
      expect(parsed.type, purl).toBe('npm');
      expect(parsed.namespace, purl).toBe(ns);
      expect(parsed.name, purl).toBe(bare);
      expect(parsed.version, purl).toBe(version);
    }
  });

  it('NEGATIVE: the old non-canonical form parses to a DIFFERENT package identity', () => {
    const wrong = parsePurl('pkg:npm/%40eye%2Fcontracts@0.0.1') as { namespace: string | null; name: string };
    expect(wrong.namespace).toBeNull();
    expect(wrong.name).toBe('@eye/contracts');
    // Proving it is not merely a different spelling of the canonical value:
    const right = parsePurl(npmPurl('@eye/contracts', '0.0.1')) as { namespace: string | null; name: string };
    expect(right.namespace).toBe('@eye');
    expect(right.name).toBe('contracts');
    expect(wrong.namespace).not.toBe(right.namespace);
  });

  it('NEGATIVE: a malformed Package URL is rejected rather than silently accepted', () => {
    for (const bad of ['not-a-purl', 'pkg:', 'pkg:npm', '']) {
      expect(() => parsePurl(bad), bad).toThrow();
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 fixture — lockfile syntax the bespoke reader mishandled', () => {
  const root = () => synthRepo({
    'package.json': manifest('@fixture/root', '0.0.1'),
    'pnpm-lock.yaml': [
      "lockfileVersion: '9.0'",
      'settings:',
      '  autoInstallPeers: true',
      'importers:',
      '  .:',
      '    dependencies:',
      // quoted key + scoped name
      "      '@scope/quoted':",
      "        specifier: ^1.0.0",
      '        version: 1.0.0',
      '      peered:',
      '        specifier: 2.0.0',
      '        version: 2.0.0(host@3.0.0)',
      '      patched:',
      '        specifier: 4.0.0',
      '        version: 4.0.0(patch_hash=abc123def456)',
      '      aliased:',
      '        specifier: npm:real-target@5.0.0',
      '        version: real-target@5.0.0',
      '    optionalDependencies:',
      '      opt-compatible:',
      '        specifier: 6.0.0',
      '        version: 6.0.0',
      'packages:',
      // flow mapping — the previous reader treated this as an opaque scalar and lost SRI
      `  '@scope/quoted@1.0.0':`,
      `    resolution: {integrity: ${sri('quoted')}}`,
      '    engines: {node: \'>=20\'}',
      '  peered@2.0.0:',
      `    resolution: {integrity: ${sri('peered')}}`,
      '  host@3.0.0:',
      `    resolution: {integrity: ${sri('host')}}`,
      '  patched@4.0.0:',
      `    resolution: {integrity: ${sri('patched')}}`,
      '  real-target@5.0.0:',
      `    resolution: {integrity: ${sri('real')}}`,
      '  opt-compatible@6.0.0:',
      `    resolution: {integrity: ${sri('opt')}}`,
      '    os:',
      '      - linux',
      '    cpu:',
      '      - x64',
      'snapshots:',
      `  '@scope/quoted@1.0.0': {}`,
      '  peered@2.0.0(host@3.0.0):',
      '    dependencies:',
      '      host: 3.0.0',
      '  host@3.0.0: {}',
      '  patched@4.0.0(patch_hash=abc123def456): {}',
      '  real-target@5.0.0: {}',
      '  opt-compatible@6.0.0: {}',
      '',
    ].join('\n'),
  });

  it('parses quoted keys, flow mappings and block sequences, preserving SRI', () => {
    const c = build(root());
    expect(c.unresolved).toEqual([]);
    const quoted = c.nodes.get('@scope/quoted@1.0.0');
    expect(quoted, 'quoted scoped key must resolve').toBeDefined();
    expect(quoted!.integrity, 'a flow-mapped integrity value must survive parsing').toBe(sri('quoted'));
    expect(quoted!.purl).toBe('pkg:npm/%40scope/quoted@1.0.0');
  });

  it('keeps the peer-resolution suffix as part of node identity', () => {
    const c = build(root());
    const peered = c.nodes.get('peered@2.0.0(host@3.0.0)');
    expect(peered, 'peer-suffixed snapshot key must be the node identity').toBeDefined();
    expect(peered!.peerSuffix).toBe('(host@3.0.0)');
    expect(peered!.version).toBe('2.0.0');
    // …and the peer target is itself a node, reached through the snapshot's own deps.
    expect(c.nodes.has('host@3.0.0')).toBe(true);
    expect(c.edges.some((e) => e.from === 'peered@2.0.0(host@3.0.0)' && e.to === 'host@3.0.0')).toBe(true);
  });

  it('extracts the patch hash from the resolution key', () => {
    const c = build(root());
    const patched = c.nodes.get('patched@4.0.0(patch_hash=abc123def456)');
    expect(patched, 'patched resolution key must resolve').toBeDefined();
    expect(patched!.patchHash).toBe('abc123def456');
    expect(patched!.version).toBe('4.0.0');
  });

  it('resolves an alias to the REAL package, not the alias name', () => {
    const c = build(root());
    expect(c.nodes.has('real-target@5.0.0'), 'the aliased target must be the node').toBe(true);
    expect(c.nodes.has('aliased@npm:real-target@5.0.0')).toBe(false);
    expect(c.nodes.get('real-target@5.0.0')!.name).toBe('real-target');
  });

  it('includes a target-compatible optional dependency', () => {
    const c = build(root());
    expect(c.nodes.has('opt-compatible@6.0.0')).toBe(true);
    expect(c.excludedByPlatform).toEqual([]);
  });

  it('splitKey handles scoped names, peer suffixes and patch markers together', () => {
    expect(splitKey('@scope/n@1.2.3')).toMatchObject({ name: '@scope/n', version: '1.2.3', peerSuffix: '' });
    expect(splitKey('a@1.0.0(b@2.0.0)')).toMatchObject({ name: 'a', version: '1.0.0', peerSuffix: '(b@2.0.0)' });
    expect(splitKey('a@1.0.0(patch_hash=xy)')).toMatchObject({ version: '1.0.0', patchHash: 'xy' });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 fixture — workspace links are traversed recursively and resolved relatively', () => {
  const linkRepo = () => synthRepo({
    'package.json': manifest('@fixture/root', '0.0.1'),
    'packages/linked/package.json': manifest('@fixture/linked', '2.5.0'),
    'packages/deeper/package.json': manifest('@fixture/deeper', '3.1.0'),
    'pnpm-lock.yaml': [
      "lockfileVersion: '9.0'",
      'importers:',
      '  .:',
      '    dependencies:',
      '      \'@fixture/linked\':',
      '        specifier: link:packages/linked',
      '        version: link:packages/linked',
      '  packages/linked:',
      '    dependencies:',
      '      runtime-of-linked:',
      '        specifier: 1.0.0',
      '        version: 1.0.0',
      // A link relative to packages/linked -> ../deeper
      '      \'@fixture/deeper\':',
      '        specifier: link:../deeper',
      '        version: link:../deeper',
      '    devDependencies:',
      '      devtool-of-linked:',
      '        specifier: 9.0.0',
      '        version: 9.0.0',
      '  packages/deeper:',
      '    dependencies:',
      '      runtime-of-deeper:',
      '        specifier: 1.0.0',
      '        version: 1.0.0',
      'packages:',
      '  runtime-of-linked@1.0.0:',
      `    resolution: {integrity: ${sri('rol')}}`,
      '  runtime-of-deeper@1.0.0:',
      `    resolution: {integrity: ${sri('rod')}}`,
      '  devtool-of-linked@9.0.0:',
      `    resolution: {integrity: ${sri('dol')}}`,
      'snapshots:',
      '  runtime-of-linked@1.0.0: {}',
      '  runtime-of-deeper@1.0.0: {}',
      '  devtool-of-linked@9.0.0: {}',
      '',
    ].join('\n'),
  });

  it('expands a linked workspace that is NOT a declared target root, recursively', () => {
    // Only '.' is a root. The previous implementation recorded the edge to the linked
    // workspace and stopped, so the linked package's transitive runtime dependencies
    // were absent from the closure while still being genuinely required.
    const c = build(linkRepo(), { importer_roots: ['.'] });
    expect(c.unresolved).toEqual([]);
    expect(c.nodes.has('workspace:packages/linked')).toBe(true);
    expect(c.nodes.has('runtime-of-linked@1.0.0'), 'first-level transitive runtime dep').toBe(true);
    // …and through a SECOND link resolved relative to packages/linked ('../deeper').
    expect(c.nodes.has('workspace:packages/deeper'), 'link relative to the importer').toBe(true);
    expect(c.nodes.has('runtime-of-deeper@1.0.0'), 'second-level transitive runtime dep').toBe(true);
  });

  it('uses the linked workspace REAL identity from its own package.json', () => {
    const c = build(linkRepo(), { importer_roots: ['.'] });
    const linked = c.nodes.get('workspace:packages/linked')!;
    expect(linked.name).toBe('@fixture/linked');
    expect(linked.version).toBe('2.5.0');
    expect(linked.purl).toBe('pkg:npm/%40fixture/linked@2.5.0');
    expect(linked.manifestSha256).toMatch(/^[a-f0-9]{64}$/);
    const deeper = c.nodes.get('workspace:packages/deeper')!;
    expect(deeper.name).toBe('@fixture/deeper');
    expect(deeper.version).toBe('3.1.0');
  });

  it('does NOT consume a linked workspace\'s devDependencies through the link', () => {
    const c = build(linkRepo(), { importer_roots: ['.'] });
    expect(c.nodes.has('devtool-of-linked@9.0.0')).toBe(false);
  });

  it('resolveLinkPath resolves relative to the importer, not by suffix guessing', () => {
    const importers = { '.': {}, 'packages/linked': {}, 'packages/deeper': {}, 'apps/api': {} };
    expect(resolveLinkPath('packages/linked', 'link:../deeper', importers)).toBe('packages/deeper');
    expect(resolveLinkPath('.', 'link:packages/linked', importers)).toBe('packages/linked');
    expect(resolveLinkPath('apps/api', 'link:../../packages/deeper', importers)).toBe('packages/deeper');
    // A path that does not resolve to a real importer must be null, never a fuzzy match.
    expect(resolveLinkPath('apps/api', 'link:../../packages/nope', importers)).toBeNull();
  });

  it('is cycle-safe when two workspaces link to each other', () => {
    const root = synthRepo({
      'package.json': manifest('@fixture/root', '0.0.1'),
      'packages/a/package.json': manifest('@fixture/a', '1.0.0'),
      'packages/b/package.json': manifest('@fixture/b', '1.0.0'),
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .:',
        '    dependencies:',
        '      \'@fixture/a\':',
        '        specifier: link:packages/a',
        '        version: link:packages/a',
        '  packages/a:',
        '    dependencies:',
        '      \'@fixture/b\':',
        '        specifier: link:../b',
        '        version: link:../b',
        '  packages/b:',
        '    dependencies:',
        '      \'@fixture/a\':',
        '        specifier: link:../a',
        '        version: link:../a',
        'packages: {}',
        'snapshots: {}',
        '',
      ].join('\n'),
    });
    const c = build(root, { importer_roots: ['.'] });   // must terminate
    expect(c.nodes.has('workspace:packages/a')).toBe(true);
    expect(c.nodes.has('workspace:packages/b')).toBe(true);
    expect(c.edges.some((e) => e.from === 'workspace:packages/a' && e.to === 'workspace:packages/b')).toBe(true);
    expect(c.edges.some((e) => e.from === 'workspace:packages/b' && e.to === 'workspace:packages/a')).toBe(true);
  });

  it('is cycle-safe when two registry packages depend on each other', () => {
    const root = synthRepo({
      'package.json': manifest('@fixture/root', '0.0.1'),
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .:',
        '    dependencies:',
        '      cyc-a:',
        '        specifier: 1.0.0',
        '        version: 1.0.0',
        'packages:',
        '  cyc-a@1.0.0:',
        `    resolution: {integrity: ${sri('ca')}}`,
        '  cyc-b@1.0.0:',
        `    resolution: {integrity: ${sri('cb')}}`,
        'snapshots:',
        '  cyc-a@1.0.0:',
        '    dependencies:',
        '      cyc-b: 1.0.0',
        '  cyc-b@1.0.0:',
        '    dependencies:',
        '      cyc-a: 1.0.0',
        '',
      ].join('\n'),
    });
    const c = build(root);
    expect(c.unresolved).toEqual([]);
    expect(c.nodes.size).toBe(3);  // root workspace + 2 packages
    expect(c.edges.length).toBe(3);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 fixture — unresolved references fail closed, optional included', () => {
  const repo = (kind: 'dependencies' | 'optionalDependencies') => synthRepo({
    'package.json': manifest('@fixture/root', '0.0.1'),
    'pnpm-lock.yaml': [
      "lockfileVersion: '9.0'",
      'importers:',
      '  .:',
      '    dependencies:',
      '      present:',
      '        specifier: 1.0.0',
      '        version: 1.0.0',
      'packages:',
      '  present@1.0.0:',
      `    resolution: {integrity: ${sri('p')}}`,
      'snapshots:',
      '  present@1.0.0:',
      `    ${kind}:`,
      '      ghost-never-resolved: 9.9.9',
      '',
    ].join('\n'),
  });

  it('a required reference with no resolution is reported', () => {
    const c = build(repo('dependencies'));
    expect(c.unresolved.length).toBeGreaterThan(0);
    expect(c.unresolved.join('\n')).toContain('ghost-never-resolved');
  });

  it('an OPTIONAL reference with no resolution is ALSO reported, not silently skipped', () => {
    // The previous implementation did `if (childRef === null) continue;` for optional
    // deps, so an incomplete closure could certify itself as complete.
    const c = build(repo('optionalDependencies'));
    expect(c.unresolved.length).toBeGreaterThan(0);
    expect(c.unresolved.join('\n')).toContain('ghost-never-resolved');
    expect(c.unresolved.join('\n')).toContain('optionalDependencies');
  });

  it('a platform-incompatible REQUIRED dependency is a failure, not an exclusion', () => {
    const root = synthRepo({
      'package.json': manifest('@fixture/root', '0.0.1'),
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .:',
        '    dependencies:',
        '      needs-darwin:',
        '        specifier: 1.0.0',
        '        version: 1.0.0',
        'packages:',
        '  needs-darwin@1.0.0:',
        `    resolution: {integrity: ${sri('nd')}}`,
        '    os:',
        '      - darwin',
        'snapshots:',
        '  needs-darwin@1.0.0: {}',
        '',
      ].join('\n'),
    });
    const c = build(root);
    expect(c.unresolved.join('\n')).toContain('is NOT optional');
    expect(c.excludedByPlatform).toEqual([]);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 fixture — scope membership reaches a fixed point', () => {
  const root = () => synthRepo({
    'package.json': manifest('@fixture/root', '0.0.1'),
    'pnpm-lock.yaml': [
      "lockfileVersion: '9.0'",
      'importers:',
      '  .:',
      '    dependencies:',
      '      prod-entry:',
      '        specifier: 1.0.0',
      '        version: 1.0.0',
      '    devDependencies:',
      '      dev-entry:',
      '        specifier: 1.0.0',
      '        version: 1.0.0',
      'packages:',
      '  prod-entry@1.0.0:',
      `    resolution: {integrity: ${sri('pe')}}`,
      '  dev-entry@1.0.0:',
      `    resolution: {integrity: ${sri('de')}}`,
      '  shared@1.0.0:',
      `    resolution: {integrity: ${sri('sh')}}`,
      '  deep@1.0.0:',
      `    resolution: {integrity: ${sri('dp')}}`,
      'snapshots:',
      '  prod-entry@1.0.0:',
      '    dependencies:',
      '      shared: 1.0.0',
      '  dev-entry@1.0.0:',
      '    dependencies:',
      '      shared: 1.0.0',
      '  shared@1.0.0:',
      '    dependencies:',
      '      deep: 1.0.0',
      '  deep@1.0.0: {}',
      '',
    ].join('\n'),
  });

  it('a shared component AND ITS DESCENDANTS carry both scopes', () => {
    // The previous early return added the second scope to the already-visited node but
    // never propagated it downward, so `deep` was recorded as dev-only or prod-only
    // depending purely on traversal order.
    const c = build(root(), { dependency_scopes: ['dependencies', 'devDependencies'] });
    expect(c.unresolved).toEqual([]);
    const scopesOf = (ref: string) => [...c.nodes.get(ref)!.scopes].sort();
    expect(scopesOf('shared@1.0.0')).toEqual(['dependencies', 'devDependencies']);
    expect(scopesOf('deep@1.0.0'), 'the descendant must inherit BOTH scopes').toEqual(['dependencies', 'devDependencies']);
    expect(scopesOf('prod-entry@1.0.0')).toEqual(['dependencies']);
    expect(scopesOf('dev-entry@1.0.0')).toEqual(['devDependencies']);
  });

  it('a workspace\'s devDependencies never inherit an inbound runtime scope', () => {
    const r = synthRepo({
      'package.json': manifest('@fixture/root', '0.0.1'),
      'packages/lib/package.json': manifest('@fixture/lib', '1.0.0'),
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .:',
        '    dependencies:',
        '      \'@fixture/lib\':',
        '        specifier: link:packages/lib',
        '        version: link:packages/lib',
        '  packages/lib:',
        '    dependencies:',
        '      lib-runtime:',
        '        specifier: 1.0.0',
        '        version: 1.0.0',
        '    devDependencies:',
        '      lib-devtool:',
        '        specifier: 1.0.0',
        '        version: 1.0.0',
        'packages:',
        '  lib-runtime@1.0.0:',
        `    resolution: {integrity: ${sri('lr')}}`,
        '  lib-devtool@1.0.0:',
        `    resolution: {integrity: ${sri('ld')}}`,
        'snapshots:',
        '  lib-runtime@1.0.0: {}',
        '  lib-devtool@1.0.0: {}',
        '',
      ].join('\n'),
    });
    // Both '.' and packages/lib are roots, so the dev edge to lib-devtool exists.
    const c = build(r, {
      importer_roots: ['.', 'packages/lib'],
      dependency_scopes: ['dependencies', 'devDependencies'],
    });
    expect([...c.nodes.get('lib-runtime@1.0.0')!.scopes].sort()).toEqual(['dependencies']);
    // lib-devtool must NOT become a production dependency merely because something
    // depends on the workspace that declares it as a dev tool.
    expect([...c.nodes.get('lib-devtool@1.0.0')!.scopes].sort()).toEqual(['devDependencies']);
  });

  it('every node in the closure carries at least one scope', () => {
    const c = build(root(), { dependency_scopes: ['dependencies', 'devDependencies'] });
    for (const [ref, n] of c.nodes) {
      expect(n.scopes.size, `${ref} has no scope provenance`).toBeGreaterThan(0);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 fixture — mixed positive/negative platform constraints', () => {
  const target = { os: 'linux', arch: 'x64', libc: 'glibc' };

  it('a positive allowlist admits only listed values', () => {
    expect(platformCompatible({ os: ['linux'] }, target).compatible).toBe(true);
    expect(platformCompatible({ os: ['darwin'] }, target).compatible).toBe(false);
    expect(platformCompatible({ cpu: ['arm64'] }, target).compatible).toBe(false);
    expect(platformCompatible({ libc: ['musl'] }, target).compatible).toBe(false);
  });

  it('a negation excludes the named value and admits everything else', () => {
    expect(platformCompatible({ os: ['!win32'] }, target).compatible).toBe(true);
    expect(platformCompatible({ os: ['!linux'] }, target).compatible).toBe(false);
    expect(platformCompatible({ os: ['!linux'] }, target).reason).toBe('excluded by !linux');
  });

  it('MIXED: a negation wins even when a matching positive is also present', () => {
    // The previous implementation checked negations OR positives and ignored whichever
    // came second, so this contradictory-but-legal metadata was mis-evaluated.
    const r = platformCompatible({ os: ['linux', '!linux'] }, target);
    expect(r.compatible).toBe(false);
    expect(r.reason).toBe('excluded by !linux');
  });

  it('MIXED: positives still act as an allowlist when a non-matching negation is present', () => {
    // os: ['!win32', 'darwin'] — not win32, but the allowlist is darwin only.
    const r = platformCompatible({ os: ['!win32', 'darwin'] }, target);
    expect(r.compatible).toBe(false);
    expect(r.reason).toBe('requires darwin');
  });

  it('MIXED: a non-matching negation plus a matching positive is compatible', () => {
    expect(platformCompatible({ os: ['!win32', 'linux'] }, target).compatible).toBe(true);
  });

  it('missing metadata means INCLUDE, and an empty list is not a constraint', () => {
    expect(platformCompatible({}, target).compatible).toBe(true);
    expect(platformCompatible({ os: undefined, cpu: null }, target).compatible).toBe(true);
    expect(platformCompatible({ os: [] }, target).compatible).toBe(true);
  });

  it('each field is evaluated against its OWN target axis and names the field it failed on', () => {
    expect(platformCompatible({ os: ['darwin'] }, target).field).toBe('os');
    expect(platformCompatible({ cpu: ['arm64'] }, target).field).toBe('cpu');
    expect(platformCompatible({ libc: ['musl'] }, target).field).toBe('libc');
  });

  it('an optional dependency excluded by MIXED constraints is recorded with a reason', () => {
    const root = synthRepo({
      'package.json': manifest('@fixture/root', '0.0.1'),
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .:',
        '    optionalDependencies:',
        '      mixed-excluded:',
        '        specifier: 1.0.0',
        '        version: 1.0.0',
        'packages:',
        '  mixed-excluded@1.0.0:',
        `    resolution: {integrity: ${sri('me')}}`,
        '    os:',
        '      - \'!win32\'',
        '      - darwin',
        'snapshots:',
        '  mixed-excluded@1.0.0: {}',
        '',
      ].join('\n'),
    });
    const c = build(root);
    expect(c.nodes.has('mixed-excluded@1.0.0')).toBe(false);
    expect(c.excludedByPlatform).toHaveLength(1);
    expect(c.excludedByPlatform[0]!.field).toBe('os');
    expect(c.excludedByPlatform[0]!.reason).toBe('requires darwin');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16 fixture — workspace identity is read, never fabricated', () => {
  it('refuses to invent an identity when a workspace has no package.json', () => {
    const root = synthRepo({
      'package.json': manifest('@fixture/root', '0.0.1'),
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .: {}',
        '  packages/ghost: {}',
        'packages: {}',
        'snapshots: {}',
        '',
      ].join('\n'),
    });
    expect(() => build(root, { importer_roots: ['.', 'packages/ghost'] }))
      .toThrow(/has no package.json|cannot be fabricated/);
  });

  it('refuses a manifest with no name or no version', () => {
    for (const bad of ['{"version":"1.0.0"}', '{"name":"@fixture/x"}']) {
      const root = synthRepo({
        'package.json': manifest('@fixture/root', '0.0.1'),
        'packages/bad/package.json': bad,
        'pnpm-lock.yaml': [
          "lockfileVersion: '9.0'",
          'importers:',
          '  .: {}',
          '  packages/bad: {}',
          'packages: {}',
          'snapshots: {}',
          '',
        ].join('\n'),
      });
      expect(() => build(root, { importer_roots: ['.', 'packages/bad'] }))
        .toThrow(/declares no (name|version)/);
    }
  });

  it('a manifest change alters IDENTITY but never closure MEMBERSHIP', () => {
    // Identity metadata must not be able to add or remove a dependency: membership is
    // lockfile-derived. Two repos differing only in the manifest's dependency lists
    // must produce identical node sets.
    const lock = [
      "lockfileVersion: '9.0'",
      'importers:',
      '  .:',
      '    dependencies:',
      '      real-dep:',
      '        specifier: 1.0.0',
      '        version: 1.0.0',
      'packages:',
      '  real-dep@1.0.0:',
      `    resolution: {integrity: ${sri('rd')}}`,
      'snapshots:',
      '  real-dep@1.0.0: {}',
      '',
    ].join('\n');

    const honest = synthRepo({
      'package.json': JSON.stringify({ name: '@fixture/root', version: '1.0.0', dependencies: { 'real-dep': '1.0.0' } }),
      'pnpm-lock.yaml': lock,
    });
    const lying = synthRepo({
      // Manifest claims a dependency the lockfile does not resolve, and omits the real one.
      'package.json': JSON.stringify({ name: '@fixture/root', version: '1.0.0', dependencies: { 'invented-dep': '9.9.9' } }),
      'pnpm-lock.yaml': lock,
    });

    const a = build(honest);
    const b = build(lying);
    expect([...b.nodes.keys()].sort()).toEqual([...a.nodes.keys()].sort());
    expect(b.nodes.has('invented-dep@9.9.9')).toBe(false);
    expect(b.nodes.has('real-dep@1.0.0')).toBe(true);
    // The manifest digest differs, so the identity binding still reflects the bytes.
    expect(b.nodes.get('workspace:.')!.manifestSha256)
      .not.toBe(a.nodes.get('workspace:.')!.manifestSha256);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R2 fixture — patch hash is NOT peer context', () => {
  const repo = () => synthRepo({
    'package.json': manifest('@fixture/root', '0.0.1'),
    'pnpm-lock.yaml': [
      "lockfileVersion: '9.0'",
      'importers:',
      '  .:',
      '    dependencies:',
      '      patched-only:',
      '        specifier: 1.0.0',
      '        version: 1.0.0(patch_hash=deadbeef)',
      '      peered-only:',
      '        specifier: 2.0.0',
      '        version: 2.0.0(host@9.0.0)',
      '      both:',
      '        specifier: 3.0.0',
      '        version: 3.0.0(host@9.0.0)(patch_hash=cafe1234)',
      'packages:',
      '  patched-only@1.0.0:',
      `    resolution: {integrity: ${sri('po')}}`,
      '  peered-only@2.0.0:',
      `    resolution: {integrity: ${sri('peo')}}`,
      '  both@3.0.0:',
      `    resolution: {integrity: ${sri('both')}}`,
      '  host@9.0.0:',
      `    resolution: {integrity: ${sri('host9')}}`,
      'snapshots:',
      '  patched-only@1.0.0(patch_hash=deadbeef): {}',
      '  peered-only@2.0.0(host@9.0.0):',
      '    dependencies:',
      '      host: 9.0.0',
      '  both@3.0.0(host@9.0.0)(patch_hash=cafe1234):',
      '    dependencies:',
      '      host: 9.0.0',
      '  host@9.0.0: {}',
      '',
    ].join('\n'),
  });

  it('splitKey separates peer resolutions from patch markers', () => {
    const patchOnly = splitKey('patched-only@1.0.0(patch_hash=deadbeef)') as
      { peerContext: string; patchHash: string | null; peers: string[]; version: string };
    expect(patchOnly.patchHash).toBe('deadbeef');
    expect(patchOnly.peerContext, 'a patched-only key has NO peer context').toBe('');
    expect(patchOnly.peers).toEqual([]);

    const peerOnly = splitKey('peered-only@2.0.0(host@9.0.0)') as
      { peerContext: string; patchHash: string | null; peers: string[] };
    expect(peerOnly.patchHash).toBeNull();
    expect(peerOnly.peerContext).toBe('(host@9.0.0)');

    const both = splitKey('both@3.0.0(host@9.0.0)(patch_hash=cafe1234)') as
      { peerContext: string; patchHash: string | null; peers: string[] };
    expect(both.patchHash).toBe('cafe1234');
    expect(both.peerContext, 'the patch marker must not appear in peer context').toBe('(host@9.0.0)');
    expect(both.peers).toEqual(['host@9.0.0']);
  });

  it('a patched-only component is NOT counted as a peer variant', () => {
    const c = build(repo());
    expect(c.unresolved).toEqual([]);
    const patched = c.nodes.get('patched-only@1.0.0(patch_hash=deadbeef)')!;
    expect(patched.patchHash).toBe('deadbeef');
    // The whole point: the previous implementation labelled this a peer variant.
    expect((patched as unknown as { peerContext: string }).peerContext).toBe('');
    expect(patched.peerSuffix).toBe('');

    const peered = c.nodes.get('peered-only@2.0.0(host@9.0.0)')!;
    expect(peered.peerSuffix).toBe('(host@9.0.0)');
    expect(peered.patchHash).toBeNull();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R2 fixture — one package+version under TWO distinct peer contexts', () => {
  const repo = () => synthRepo({
    'package.json': manifest('@fixture/root', '0.0.1'),
    'pnpm-lock.yaml': [
      "lockfileVersion: '9.0'",
      'importers:',
      '  .:',
      '    dependencies:',
      '      consumer-a:',
      '        specifier: 1.0.0',
      '        version: 1.0.0',
      '      consumer-b:',
      '        specifier: 1.0.0',
      '        version: 1.0.0',
      'packages:',
      '  consumer-a@1.0.0:',
      `    resolution: {integrity: ${sri('ca')}}`,
      '  consumer-b@1.0.0:',
      `    resolution: {integrity: ${sri('cb')}}`,
      '  shared-plugin@2.0.0:',
      `    resolution: {integrity: ${sri('sp')}}`,
      '  host-x@1.0.0:',
      `    resolution: {integrity: ${sri('hx')}}`,
      '  host-y@1.0.0:',
      `    resolution: {integrity: ${sri('hy')}}`,
      'snapshots:',
      '  consumer-a@1.0.0:',
      '    dependencies:',
      '      shared-plugin: 2.0.0(host-x@1.0.0)',
      '  consumer-b@1.0.0:',
      '    dependencies:',
      '      shared-plugin: 2.0.0(host-y@1.0.0)',
      '  shared-plugin@2.0.0(host-x@1.0.0):',
      '    dependencies:',
      '      host-x: 1.0.0',
      '  shared-plugin@2.0.0(host-y@1.0.0):',
      '    dependencies:',
      '      host-y: 1.0.0',
      '  host-x@1.0.0: {}',
      '  host-y@1.0.0: {}',
      '',
    ].join('\n'),
  });

  it('keeps the two peer resolutions as SEPARATE identities with separate edges', () => {
    const c = build(repo());
    expect(c.unresolved).toEqual([]);

    const x = 'shared-plugin@2.0.0(host-x@1.0.0)';
    const y = 'shared-plugin@2.0.0(host-y@1.0.0)';
    expect(c.nodes.has(x), 'peer resolution against host-x').toBe(true);
    expect(c.nodes.has(y), 'peer resolution against host-y').toBe(true);
    // Same name AND same version, two distinct components — flattening to name@version
    // would merge them and lose one subtree.
    expect(c.nodes.get(x)!.name).toBe(c.nodes.get(y)!.name);
    expect(c.nodes.get(x)!.version).toBe(c.nodes.get(y)!.version);
    expect(c.nodes.get(x)!.peerSuffix).not.toBe(c.nodes.get(y)!.peerSuffix);
    expect(c.nodes.has('shared-plugin@2.0.0'), 'the flattened form must NOT exist').toBe(false);

    // Each consumer reaches its OWN resolution, and each resolution its own peer.
    const edge = (from: string, to: string) => c.edges.some((e) => e.from === from && e.to === to);
    expect(edge('consumer-a@1.0.0', x)).toBe(true);
    expect(edge('consumer-b@1.0.0', y)).toBe(true);
    expect(edge('consumer-a@1.0.0', y), 'no cross-wiring between peer resolutions').toBe(false);
    expect(edge('consumer-b@1.0.0', x)).toBe(false);
    expect(edge(x, 'host-x@1.0.0')).toBe(true);
    expect(edge(y, 'host-y@1.0.0')).toBe(true);
    expect(edge(x, 'host-y@1.0.0')).toBe(false);

    // …and both PURLs are the same package coordinate, which is correct: the peer
    // context is not part of the npm identity, only of the installed-node identity.
    expect(c.nodes.get(x)!.purl).toBe(c.nodes.get(y)!.purl);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R2 fixture — integrity is required and validated', () => {
  const withResolution = (body: string) => synthRepo({
    'package.json': manifest('@fixture/root', '0.0.1'),
    'pnpm-lock.yaml': [
      "lockfileVersion: '9.0'",
      'importers:',
      '  .:',
      '    dependencies:',
      '      subject:',
      '        specifier: 1.0.0',
      '        version: 1.0.0',
      'packages:',
      '  subject@1.0.0:',
      `    ${body}`,
      'snapshots:',
      '  subject@1.0.0: {}',
      '',
    ].join('\n'),
  });

  it('accepts a valid sha512 SRI (positive control)', () => {
    const c = build(withResolution(`resolution: {integrity: ${sri('ok')}}`));
    expect(c.unresolved).toEqual([]);
    expect(c.nodes.get('subject@1.0.0')!.integrity).toBe(sri('ok'));
  });

  it('rejects a MISSING integrity value', () => {
    const c = build(withResolution('resolution: {tarball: https://example.invalid/x.tgz}'));
    expect(c.unresolved.join('\n')).toMatch(/integrity is absent/);
  });

  it('rejects a MALFORMED SRI', () => {
    const c = build(withResolution('resolution: {integrity: not-an-sri-value}'));
    expect(c.unresolved.join('\n')).toMatch(/integrity is/);
  });

  it('rejects an UNSUPPORTED algorithm and a truncated digest', () => {
    expect(validateIntegrity('md5-YWJj')).toMatchObject({ ok: false });
    expect((validateIntegrity('md5-YWJj') as { problem: string }).problem).toMatch(/unsupported SRI algorithm/);
    expect((validateIntegrity('sha512-YWJj') as { problem: string }).problem).toMatch(/digest is 3 bytes/);
    expect((validateIntegrity('sha256-!!!!') as { problem: string }).problem).toMatch(/not valid base64/);
    expect(validateIntegrity('sha256-' + Buffer.alloc(32).toString('base64'))).toMatchObject({ ok: true });
  });

  it('rejects a snapshot with NO packages metadata entry at all', () => {
    const root = synthRepo({
      'package.json': manifest('@fixture/root', '0.0.1'),
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .:',
        '    dependencies:',
        '      undescribed:',
        '        specifier: 1.0.0',
        '        version: 1.0.0',
        'packages: {}',
        'snapshots:',
        '  undescribed@1.0.0: {}',
        '',
      ].join('\n'),
    });
    const c = build(root);
    expect(c.unresolved.join('\n')).toMatch(/no 'packages:' metadata entry/);
  });

  it('a governed integrity_rule can admit a resolution class, and is recorded', () => {
    const root = withResolution('resolution: {tarball: https://example.invalid/x.tgz}');
    const c = buildClosure(
      loadLock(join(root, 'pnpm-lock.yaml')),
      {
        ...TARGET,
        integrity_rules: [{ id: 'IR-TEST', resolution_type: 'tarball', reason: 'fixture' }],
      },
      { root, firstPartyTypes: FIXTURE_TYPES },
    ) as Closure & { integrityExempted: Array<{ bomRef: string; rule: string }> };
    expect(c.unresolved).toEqual([]);
    expect(c.integrityExempted).toHaveLength(1);
    expect(c.integrityExempted[0]!.rule).toBe('IR-TEST');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R2 fixture — lockfile format and governed types are validated', () => {
  const lockWithVersion = (v: string) => synthRepo({
    'package.json': manifest('@fixture/root', '0.0.1'),
    'pnpm-lock.yaml': [
      `lockfileVersion: '${v}'`,
      'importers:',
      '  .: {}',
      'packages: {}',
      'snapshots: {}',
      '',
    ].join('\n'),
  });

  it('accepts exactly the supported lockfileVersion', () => {
    expect(SUPPORTED_LOCKFILE_VERSIONS).toEqual(['9.0']);
    expect(() => build(lockWithVersion('9.0'))).not.toThrow();
  });

  it('rejects a FUTURE or unsupported lockfileVersion rather than guessing', () => {
    for (const v of ['10.0', '8.0', '9.1', 'banana']) {
      expect(() => build(lockWithVersion(v)), v).toThrow(/does not support/);
    }
  });

  it('rejects a lockfile with no lockfileVersion at all', () => {
    const root = synthRepo({
      'package.json': manifest('@fixture/root', '0.0.1'),
      'pnpm-lock.yaml': 'importers:\n  .: {}\npackages: {}\nsnapshots: {}\n',
    });
    expect(() => build(root)).toThrow(/does not support/);
  });

  it('rejects an importer with NO governed component type', () => {
    const root = lockWithVersion('9.0');
    expect(() => build(root, {}, {})).toThrow(/no governed CycloneDX component type/);
  });

  it('applies the governed type per importer rather than one type for all', () => {
    const root = synthRepo({
      'package.json': manifest('@fixture/root', '0.0.1'),
      'packages/lib/package.json': manifest('@fixture/lib', '1.0.0'),
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .: {}',
        '  packages/lib: {}',
        'packages: {}',
        'snapshots: {}',
        '',
      ].join('\n'),
    });
    const c = build(root, { importer_roots: ['.', 'packages/lib'] });
    expect((c.nodes.get('workspace:.') as unknown as { componentType: string }).componentType).toBe('application');
    expect((c.nodes.get('workspace:packages/lib') as unknown as { componentType: string }).componentType).toBe('library');
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3 fixture — optional ancestry is EXACT, not merely present', () => {
  /**
   * The previous control asserted `toContain('optionalDependencies')`, which passes even
   * when the component also wrongly claims `dependencies`. A component reachable ONLY
   * through optional ancestry is not a mandatory production member, so its scope set must
   * be exactly {optionalDependencies}. Every assertion below is exact set equality.
   */
  const scopesOf = (c: Closure, ref: string) => [...c.nodes.get(ref)!.scopes].sort();

  it('optional-only child AND grandchild are optional, never plain dependencies', () => {
    const root = synthRepo({
      'package.json': manifest('@fixture/root', '0.0.1'),
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .:',
        '    dependencies:',
        '      required-parent:',
        '        specifier: 1.0.0',
        '        version: 1.0.0',
        'packages:',
        '  required-parent@1.0.0:',
        `    resolution: {integrity: ${sri('rp')}}`,
        '  optional-child@1.0.0:',
        `    resolution: {integrity: ${sri('oc')}}`,
        '  grandchild@1.0.0:',
        `    resolution: {integrity: ${sri('gc')}}`,
        'snapshots:',
        '  required-parent@1.0.0:',
        '    optionalDependencies:',
        '      optional-child: 1.0.0',
        '  optional-child@1.0.0:',
        '    dependencies:',
        '      grandchild: 1.0.0',
        '  grandchild@1.0.0: {}',
        '',
      ].join('\n'),
    });
    const c = build(root);
    expect(c.unresolved).toEqual([]);
    expect(scopesOf(c, 'required-parent@1.0.0')).toEqual(['dependencies']);
    // EXACT: optional-only means optional-only. `dependencies` here would be a false
    // claim that the component is mandatory.
    expect(scopesOf(c, 'optional-child@1.0.0')).toEqual(['optionalDependencies']);
    expect(scopesOf(c, 'grandchild@1.0.0')).toEqual(['optionalDependencies']);
  });

  it('a DUAL path (mandatory + optional) correctly carries both', () => {
    const root = synthRepo({
      'package.json': manifest('@fixture/root', '0.0.1'),
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .:',
        '    dependencies:',
        '      mandatory-parent:',
        '        specifier: 1.0.0',
        '        version: 1.0.0',
        '      optional-parent:',
        '        specifier: 1.0.0',
        '        version: 1.0.0',
        'packages:',
        '  mandatory-parent@1.0.0:',
        `    resolution: {integrity: ${sri('mp')}}`,
        '  optional-parent@1.0.0:',
        `    resolution: {integrity: ${sri('op')}}`,
        '  shared@1.0.0:',
        `    resolution: {integrity: ${sri('sh2')}}`,
        'snapshots:',
        '  mandatory-parent@1.0.0:',
        '    dependencies:',
        '      shared: 1.0.0',
        '  optional-parent@1.0.0:',
        '    optionalDependencies:',
        '      shared: 1.0.0',
        '  shared@1.0.0: {}',
        '',
      ].join('\n'),
    });
    const c = build(root);
    expect(c.unresolved).toEqual([]);
    // Two genuine paths, unioned deterministically.
    expect(scopesOf(c, 'shared@1.0.0')).toEqual(['dependencies', 'optionalDependencies']);
    expect(scopesOf(c, 'mandatory-parent@1.0.0')).toEqual(['dependencies']);
  });

  it('a DEVELOPMENT-only linked workspace stays development-only, exactly', () => {
    const root = synthRepo({
      'package.json': manifest('@fixture/root', '0.0.1'),
      'packages/lib/package.json': manifest('@fixture/lib', '1.0.0'),
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .:',
        '    devDependencies:',
        "      '@fixture/lib':",
        '        specifier: link:packages/lib',
        '        version: link:packages/lib',
        '  packages/lib:',
        '    dependencies:',
        '      lib-runtime:',
        '        specifier: 1.0.0',
        '        version: 1.0.0',
        '    optionalDependencies:',
        '      lib-optional:',
        '        specifier: 1.0.0',
        '        version: 1.0.0',
        'packages:',
        '  lib-runtime@1.0.0:',
        `    resolution: {integrity: ${sri('lr3')}}`,
        '  lib-optional@1.0.0:',
        `    resolution: {integrity: ${sri('lo3')}}`,
        'snapshots:',
        '  lib-runtime@1.0.0: {}',
        '  lib-optional@1.0.0: {}',
        '',
      ].join('\n'),
    });
    const c = build(root, {
      importer_roots: ['.'],
      dependency_scopes: ['dependencies', 'devDependencies'],
    });
    expect(c.unresolved).toEqual([]);
    expect(scopesOf(c, 'workspace:packages/lib')).toEqual(['devDependencies']);
    // The dev-only workspace's RUNTIME dep is development scope — and NOT production.
    expect(scopesOf(c, 'lib-runtime@1.0.0')).toEqual(['devDependencies']);
    // Its OPTIONAL dep is development AND optional, but still never `dependencies`.
    expect(scopesOf(c, 'lib-optional@1.0.0')).toEqual(['devDependencies', 'optionalDependencies']);
  });

  it('a snapshot marked `optional: true` is optional even on a NON-optional edge', () => {
    const root = synthRepo({
      'package.json': manifest('@fixture/root', '0.0.1'),
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .:',
        '    dependencies:',
        '      parent:',
        '        specifier: 1.0.0',
        '        version: 1.0.0',
        'packages:',
        '  parent@1.0.0:',
        `    resolution: {integrity: ${sri('par')}}`,
        '  flagged-optional@1.0.0:',
        `    resolution: {integrity: ${sri('fo')}}`,
        '  under-flagged@1.0.0:',
        `    resolution: {integrity: ${sri('uf')}}`,
        'snapshots:',
        '  parent@1.0.0:',
        '    dependencies:',
        '      flagged-optional: 1.0.0',
        '  flagged-optional@1.0.0:',
        '    optional: true',
        '    dependencies:',
        '      under-flagged: 1.0.0',
        '  under-flagged@1.0.0: {}',
        '',
      ].join('\n'),
    });
    const c = build(root);
    expect(c.unresolved).toEqual([]);
    // The EDGE is a plain `dependencies` edge; only the snapshot's own `optional: true`
    // marks it. 79 snapshots in the real lockfile carry that flag, and ignoring it
    // understated how much of the graph is optional.
    expect(scopesOf(c, 'flagged-optional@1.0.0')).toEqual(['optionalDependencies']);
    expect(scopesOf(c, 'under-flagged@1.0.0')).toEqual(['optionalDependencies']);
    expect(scopesOf(c, 'parent@1.0.0')).toEqual(['dependencies']);
  });

  it('an optional NATIVE subtree is optional throughout', () => {
    const root = synthRepo({
      'package.json': manifest('@fixture/root', '0.0.1'),
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .:',
        '    dependencies:',
        '      image-lib:',
        '        specifier: 1.0.0',
        '        version: 1.0.0',
        'packages:',
        '  image-lib@1.0.0:',
        `    resolution: {integrity: ${sri('il')}}`,
        '  native-linux-x64@1.0.0:',
        `    resolution: {integrity: ${sri('nlx')}}`,
        '    os:',
        '      - linux',
        '    cpu:',
        '      - x64',
        '  native-helper@1.0.0:',
        `    resolution: {integrity: ${sri('nh')}}`,
        'snapshots:',
        '  image-lib@1.0.0:',
        '    optionalDependencies:',
        '      native-linux-x64: 1.0.0',
        '  native-linux-x64@1.0.0:',
        '    dependencies:',
        '      native-helper: 1.0.0',
        '  native-helper@1.0.0: {}',
        '',
      ].join('\n'),
    });
    const c = build(root);
    expect(c.unresolved).toEqual([]);
    expect(scopesOf(c, 'native-linux-x64@1.0.0')).toEqual(['optionalDependencies']);
    expect(scopesOf(c, 'native-helper@1.0.0')).toEqual(['optionalDependencies']);
  });

  it('every node carries at least one scope, and roots carry the declared scopes', () => {
    const root = synthRepo({
      'package.json': manifest('@fixture/root', '0.0.1'),
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .:',
        '    dependencies:',
        '      a:',
        '        specifier: 1.0.0',
        '        version: 1.0.0',
        'packages:',
        '  a@1.0.0:',
        `    resolution: {integrity: ${sri('a')}}`,
        'snapshots:',
        '  a@1.0.0: {}',
        '',
      ].join('\n'),
    });
    const c = build(root, { dependency_scopes: ['dependencies', 'optionalDependencies'] });
    for (const [ref, n] of c.nodes) {
      expect(n.scopes.size, `${ref} has no scope provenance`).toBeGreaterThan(0);
    }
    expect(scopesOf(c, 'workspace:.')).toEqual(['dependencies', 'optionalDependencies']);
  });
});

// ═════════════════════════════════════════════════════════════════════════════
describe('C16-R3 fixture — the governed component type must be an ALLOWED type', () => {
  it('rejects a mapped type outside the code-owned allowed set, before serialization', () => {
    const root = synthRepo({
      'package.json': manifest('@fixture/root', '0.0.1'),
      'pnpm-lock.yaml': [
        "lockfileVersion: '9.0'",
        'importers:',
        '  .: {}',
        'packages: {}',
        'snapshots: {}',
        '',
      ].join('\n'),
    });
    // Declaring a mapping is not enough: the value must be a real CycloneDX type.
    expect(() => build(root, {}, { '.': 'not-a-cyclonedx-type' }))
      .toThrow(/not one of the code-owned allowed types/);
    // …and the allowed ones still work.
    for (const t of ['application', 'library', 'framework']) {
      expect(() => build(root, {}, { '.': t }), t).not.toThrow();
    }
  });
});
