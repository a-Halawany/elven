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
import { buildClosure, loadLock, splitKey, npmPurl, parsePurl, platformCompatible, resolveLinkPath } from '../../../../scripts/gate/lib/lock-closure.mjs';

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

const build = (root: string, overrides: Partial<typeof TARGET> = {}): Closure =>
  buildClosure(loadLock(join(root, 'pnpm-lock.yaml')), { ...TARGET, ...overrides }, { root }) as Closure;

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
