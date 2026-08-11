/**
 * C16 — DETERMINISTIC CycloneDX SBOM SERIALIZATION FROM A LOCK-DERIVED CLOSURE.
 *
 * DETERMINISM IS A HARD REQUIREMENT, so nothing here may vary with the run:
 *   * no random UUIDs — the serialNumber is derived from a digest of the content;
 *   * no wall-clock timestamp — `metadata.timestamp` is deliberately OMITTED
 *     (it is optional in CycloneDX and is the single most common cause of an SBOM
 *     that cannot be byte-compared between runs);
 *   * no host paths — component identity is the lockfile resolution key;
 *   * no filesystem-order dependence — every collection is explicitly sorted;
 *   * no node_modules access at any point.
 *
 * GRAPH COMPLETENESS. Every component, including leaves, gets a `dependencies`
 * entry (leaves get an empty `dependsOn`). A missing entry for a leaf is how a
 * "complete" SBOM ends up with dangling references that no consumer can resolve.
 */
import { createHash } from 'node:crypto';
import { splitKey } from './lock-closure.mjs';

const SPEC_VERSION = '1.6';

/** A deterministic RFC-4122-shaped UUID derived from content, never random. */
export function deterministicUuid(content) {
  const h = createHash('sha256').update(content).digest('hex');
  // Shape the digest into a v5-style UUID (version nibble 5, RFC variant bits).
  const b = h.slice(0, 32).split('');
  b[12] = '5';
  const variant = '89ab'[parseInt(h[16], 16) % 4];
  b[16] = variant;
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

function integrityToHashes(integrity) {
  if (typeof integrity !== 'string' || integrity === '') return undefined;
  const out = [];
  for (const token of integrity.split(/\s+/)) {
    const m = /^(sha256|sha384|sha512)-(.+)$/.exec(token);
    if (m === null) continue;
    const alg = { sha256: 'SHA-256', sha384: 'SHA-384', sha512: 'SHA-512' }[m[1]];
    // CycloneDX hash content is hex; npm SRI is base64.
    out.push({ alg, content: Buffer.from(m[2], 'base64').toString('hex') });
  }
  return out.length > 0 ? out : undefined;
}

function componentOf(node, targetId) {
  const props = [
    { name: 'eye:target', value: targetId },
    { name: 'eye:lock-key', value: node.lockKey },
    { name: 'eye:scopes', value: [...node.scopes].sort().join(',') },
  ];
  if (node.peerSuffix !== '') props.push({ name: 'eye:peer-context', value: node.peerSuffix });
  if (node.patchHash) props.push({ name: 'eye:patch-hash', value: String(node.patchHash) });
  if (node.os) props.push({ name: 'eye:os', value: [].concat(node.os).join(',') });
  if (node.cpu) props.push({ name: 'eye:cpu', value: [].concat(node.cpu).join(',') });
  if (node.libc) props.push({ name: 'eye:libc', value: [].concat(node.libc).join(',') });
  if (node.deprecated) props.push({ name: 'eye:deprecated', value: String(node.deprecated) });

  const comp = {
    'bom-ref': node.bomRef,
    type: node.kind === 'workspace' ? 'application' : 'library',
    name: node.name,
    version: node.version,
    properties: props.sort((a, b) => (a.name + a.value < b.name + b.value ? -1 : 1)),
  };
  if (node.purl !== null) comp.purl = node.purl;
  const hashes = integrityToHashes(node.integrity);
  if (hashes !== undefined) comp.hashes = hashes;
  if (node.kind === 'workspace') {
    comp.properties.push({ name: 'eye:importer-root', value: node.importerPath });
    comp.properties.sort((a, b) => (a.name + a.value < b.name + b.value ? -1 : 1));
  }
  return comp;
}

/** Build the CycloneDX document for a closure. Pure function of the closure. */
export function buildSbom(closure, meta) {
  const targetId = closure.target.id;
  const components = [...closure.nodes.values()]
    .map((n) => componentOf(n, targetId))
    .sort((a, b) => (a['bom-ref'] < b['bom-ref'] ? -1 : a['bom-ref'] > b['bom-ref'] ? 1 : 0));

  // EVERY component gets an entry, leaves included (empty dependsOn).
  const byFrom = new Map(components.map((c) => [c['bom-ref'], new Set()]));
  for (const e of closure.edges) {
    if (!byFrom.has(e.from)) byFrom.set(e.from, new Set());
    byFrom.get(e.from).add(e.to);
  }
  const dependencies = [...byFrom.entries()]
    .map(([ref, set]) => ({ ref, dependsOn: [...set].sort() }))
    .sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));

  const doc = {
    bomFormat: 'CycloneDX',
    specVersion: SPEC_VERSION,
    version: 1,
    metadata: {
      // NOTE: `timestamp` is intentionally absent — see the determinism contract.
      component: {
        'bom-ref': `eye:target:${targetId}`,
        type: 'application',
        name: 'the-eye',
        version: meta.projectVersion,
        description: closure.target.description,
      },
      properties: [
        { name: 'eye:target-id', value: targetId },
        { name: 'eye:target-os', value: closure.target.os },
        { name: 'eye:target-arch', value: closure.target.arch },
        { name: 'eye:target-libc', value: closure.target.libc },
        { name: 'eye:target-node', value: closure.target.node.pinned },
        { name: 'eye:target-pnpm', value: closure.target.pnpm.pinned },
        { name: 'eye:importer-roots', value: closure.target.importer_roots.join(',') },
        { name: 'eye:dependency-scopes', value: closure.target.dependency_scopes.join(',') },
        { name: 'eye:closure-source', value: 'pnpm-lock.yaml (importers+packages+snapshots)' },
        { name: 'eye:lockfile-sha256', value: meta.lockfileSha256 },
        { name: 'eye:descriptor-sha256', value: meta.descriptorSha256 },
        { name: 'eye:generator', value: 'scripts/gate/generate-closures.mjs' },
      ].sort((a, b) => (a.name < b.name ? -1 : 1)),
    },
    components,
    dependencies,
  };
  // serialNumber must be stable: derive from the content that defines this SBOM.
  const body = JSON.stringify({ c: doc.components, d: doc.dependencies, m: doc.metadata.properties });
  doc.serialNumber = `urn:uuid:${deterministicUuid(body)}`;
  return doc;
}

/** Canonical, stable JSON serialization (sorted keys, trailing newline). */
export function serialize(doc) {
  return `${stableStringify(doc)}\n`;
}

function stableStringify(value, indent = 0) {
  const pad = '  '.repeat(indent);
  const padIn = '  '.repeat(indent + 1);
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    return `[\n${value.map((v) => padIn + stableStringify(v, indent + 1)).join(',\n')}\n${pad}]`;
  }
  const keys = Object.keys(value).sort();
  if (keys.length === 0) return '{}';
  return `{\n${keys
    .map((k) => `${padIn}${JSON.stringify(k)}: ${stableStringify(value[k], indent + 1)}`)
    .join(',\n')}\n${pad}}`;
}

/**
 * Read an SBOM back from disk and extract its node multiset and edge set.
 *
 * Reconciliation MUST use this — comparing in-memory structures to themselves
 * proves nothing about what was actually serialized.
 */
export function extractFromSbom(text) {
  const doc = JSON.parse(text);
  const nodes = new Map();
  for (const c of doc.components ?? []) {
    const ref = c['bom-ref'];
    nodes.set(ref, {
      bomRef: ref,
      name: c.name,
      version: c.version,
      purl: c.purl ?? null,
      type: c.type,
      properties: Object.fromEntries((c.properties ?? []).map((p) => [p.name, p.value])),
    });
  }
  const edges = new Set();
  const declaredRefs = new Set();
  for (const d of doc.dependencies ?? []) {
    declaredRefs.add(d.ref);
    for (const to of d.dependsOn ?? []) edges.add(`${d.ref} ${to}`);
  }
  return { doc, nodes, edges, declaredRefs };
}

export { splitKey };
