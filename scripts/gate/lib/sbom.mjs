/**
 * C16 — DETERMINISTIC CycloneDX SBOM SERIALIZATION FROM A LOCK-DERIVED CLOSURE.
 *
 * DETERMINISM IS A HARD REQUIREMENT, so nothing here may vary with the run:
 *   * no random UUIDs — the serialNumber is derived from a digest of the content;
 *   * no wall-clock timestamp — `metadata.timestamp` is deliberately OMITTED (it is
 *     optional in CycloneDX and is the single most common cause of an SBOM that cannot
 *     be byte-compared between runs);
 *   * no host paths — component identity is the lockfile resolution key;
 *   * no filesystem-order dependence — every collection is explicitly sorted;
 *   * no node_modules access at any point.
 *
 * GRAPH COMPLETENESS. Every component, including leaves, gets a `dependencies` entry
 * (leaves get an empty `dependsOn`). A missing entry for a leaf is how a "complete"
 * SBOM ends up with dangling references no consumer can resolve.
 *
 * SUBJECT CONNECTIVITY (remediation after independent review of e3a0b1f). The
 * metadata subject `eye:target:<id>` previously appeared in `metadata.component` with
 * NO dependency entry, leaving the BOM a forest whose declared subject was attached to
 * nothing: a consumer walking from the subject reached zero components. The subject now
 * carries a dependency entry naming every declared importer root, and the reconciler
 * requires those edges to be present, complete and unaltered.
 *
 * PROVENANCE BINDING. Each SBOM binds the source commit SHA, the lockfile digest, the
 * target-descriptor digest, the generator digest and the target identity, so a
 * serialized SBOM cannot be separated from the inputs that produced it.
 */
import { createHash } from 'node:crypto';
import { splitKey, parsePurl, npmPurl } from './lock-closure.mjs';

/** The declared subject of every target SBOM. */
export const SUBJECT_NAME = 'the-eye';

const SPEC_VERSION = '1.6';

/** The bom-ref of the metadata subject for a target. */
export const subjectRef = (targetId) => `eye:target:${targetId}`;

/** A deterministic RFC-4122-shaped UUID derived from content, never random. */
export function deterministicUuid(content) {
  const h = createHash('sha256').update(content).digest('hex');
  const b = h.slice(0, 32).split('');
  b[12] = '5';
  b[16] = '89ab'[parseInt(h[16], 16) % 4];
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** Convert an npm SRI integrity string to CycloneDX hex hashes. */
export function integrityToHashes(integrity) {
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

const sortProps = (props) =>
  props.sort((a, b) => (`${a.name}\u0000${a.value}` < `${b.name}\u0000${b.value}` ? -1 : 1));

/**
 * The EXACT property set a component must carry. Exported so the reconciler can require
 * this set precisely — no missing, no unknown, no duplicate. The values still come from
 * the lockfile-derived closure and are compared against bytes read back from disk, so
 * provenance independence is preserved; sharing the *shape* only prevents the two sides
 * drifting into disagreement about which properties exist.
 */
export function expectedProperties(node, targetId) {
  return sortProps(propertiesOf(node, targetId));
}

function propertiesOf(node, targetId) {
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
  if (node.kind === 'workspace') {
    props.push({ name: 'eye:importer-root', value: node.importerPath });
    props.push({ name: 'eye:workspace-manifest', value: node.manifestPath });
    props.push({ name: 'eye:workspace-manifest-sha256', value: node.manifestSha256 });
  }
  return props;
}

export function componentOf(node, targetId) {
  const comp = {
    'bom-ref': node.bomRef,
    type: node.componentType,
    name: node.name,
    version: node.version,
    properties: expectedProperties(node, targetId),
  };
  if (node.purl !== null && node.purl !== undefined) comp.purl = node.purl;
  const hashes = integrityToHashes(node.integrity);
  if (hashes !== undefined) comp.hashes = hashes;
  return comp;
}

/** Build the CycloneDX document for a closure. Pure function of the closure + meta. */
export function buildSbom(closure, meta) {
  const targetId = closure.target.id;
  const subject = subjectRef(targetId);

  const components = [...closure.nodes.values()]
    .map((n) => componentOf(n, targetId))
    .sort((a, b) => (a['bom-ref'] < b['bom-ref'] ? -1 : a['bom-ref'] > b['bom-ref'] ? 1 : 0));

  // EVERY component gets an entry, leaves included (empty dependsOn), PLUS the
  // metadata subject, whose dependsOn is exactly the declared importer roots.
  const byFrom = new Map(components.map((c) => [c['bom-ref'], new Set()]));
  for (const e of closure.edges) {
    if (!byFrom.has(e.from)) byFrom.set(e.from, new Set());
    byFrom.get(e.from).add(e.to);
  }
  byFrom.set(subject, new Set(closure.roots));

  const dependencies = [...byFrom.entries()]
    .map(([ref, set]) => ({ ref, dependsOn: [...set].sort() }))
    .sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));

  const doc = {
    bomFormat: 'CycloneDX',
    specVersion: SPEC_VERSION,
    version: 1,
    metadata: {
      // NOTE: `timestamp` is intentionally absent — see the determinism contract.
      // The SUBJECT is itself a component identity and must be reconciled field by
      // field, so it carries a canonical PURL rather than only a name.
      component: {
        'bom-ref': subject,
        type: 'application',
        name: SUBJECT_NAME,
        version: meta.projectVersion,
        purl: npmPurl(SUBJECT_NAME, meta.projectVersion),
        description: closure.target.description,
      },
      properties: sortProps([
        { name: 'eye:target-id', value: targetId },
        { name: 'eye:target-os', value: closure.target.os },
        { name: 'eye:target-arch', value: closure.target.arch },
        { name: 'eye:target-libc', value: closure.target.libc },
        { name: 'eye:target-node', value: closure.target.node.pinned },
        { name: 'eye:target-pnpm', value: closure.target.pnpm.pinned },
        { name: 'eye:importer-roots', value: closure.target.importer_roots.join(',') },
        { name: 'eye:dependency-scopes', value: closure.target.dependency_scopes.join(',') },
        { name: 'eye:closure-source', value: 'pnpm-lock.yaml (importers+packages+snapshots)' },
        // Provenance binding: the SBOM cannot be separated from its inputs.
        { name: 'eye:source-sha', value: meta.sourceSha },
        { name: 'eye:lockfile-sha256', value: meta.lockfileSha256 },
        { name: 'eye:descriptor-sha256', value: meta.descriptorSha256 },
        { name: 'eye:generator', value: 'scripts/gate/generate-closures.mjs' },
        { name: 'eye:generator-sha256', value: meta.generatorSha256 },
        { name: 'eye:purl-implementation', value: meta.purlImplementation },
        { name: 'eye:yaml-implementation', value: meta.yamlImplementation },
      ]),
    },
    components,
    dependencies,
  };
  // serialNumber must be stable: derive from the content that defines this SBOM.
  const body = JSON.stringify({ c: doc.components, d: doc.dependencies, m: doc.metadata });
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
 * Read an SBOM back from disk and extract its full graph.
 *
 * Reconciliation MUST use this — comparing in-memory structures to themselves proves
 * nothing about what was actually serialized.
 *
 * Everything here is a MULTISET or a raw list, never a deduplicating Set: a duplicate
 * component or a repeated `dependsOn` entry is a real defect, and collapsing it on
 * read is how the previous reconciler could not see it.
 */
export function extractFromSbom(text) {
  const doc = JSON.parse(text);

  const componentList = [];
  const componentRefCounts = new Map();
  for (const c of doc.components ?? []) {
    const ref = c['bom-ref'];
    componentRefCounts.set(ref, (componentRefCounts.get(ref) ?? 0) + 1);
    const properties = c.properties ?? [];
    const propCounts = new Map();
    for (const p of properties) propCounts.set(p.name, (propCounts.get(p.name) ?? 0) + 1);
    let purlParts = null;
    let purlError = null;
    if (typeof c.purl === 'string') {
      try {
        purlParts = parsePurl(c.purl);
      } catch (e) {
        purlError = e instanceof Error ? e.message : String(e);
      }
    }
    componentList.push({
      bomRef: ref,
      name: c.name,
      version: c.version,
      type: c.type,
      purl: c.purl ?? null,
      purlParts,
      purlError,
      hashes: (c.hashes ?? []).map((h) => `${h.alg}:${h.content}`).sort(),
      properties: Object.fromEntries(properties.map((p) => [p.name, p.value])),
      duplicateProperties: [...propCounts.entries()].filter(([, n]) => n > 1).map(([k]) => k).sort(),
    });
  }

  // First occurrence wins for lookup; duplicates are reported separately.
  const nodes = new Map();
  for (const c of componentList) if (!nodes.has(c.bomRef)) nodes.set(c.bomRef, c);

  const edgeCounts = new Map();
  const declaredRefCounts = new Map();
  const dependsOnDuplicates = [];
  for (const d of doc.dependencies ?? []) {
    declaredRefCounts.set(d.ref, (declaredRefCounts.get(d.ref) ?? 0) + 1);
    const seen = new Map();
    for (const to of d.dependsOn ?? []) {
      seen.set(to, (seen.get(to) ?? 0) + 1);
      const key = `${d.ref} ${to}`;
      edgeCounts.set(key, (edgeCounts.get(key) ?? 0) + 1);
    }
    for (const [to, n] of seen.entries()) {
      if (n > 1) dependsOnDuplicates.push(`${d.ref} -> ${to} x${n}`);
    }
  }

  const subjectComponent = doc.metadata?.component ?? null;

  // METADATA PROPERTIES AS A MULTISET. `Object.fromEntries` silently kept the LAST
  // occurrence, so a duplicate binding — an attacker-inserted second eye:source-sha, or a
  // conflicting generator digest placed before or after the legitimate one — simply
  // disappeared. The raw list and per-name counts are preserved instead.
  const metadataPropertyList = (doc.metadata?.properties ?? []).map((p) => ({
    name: p?.name ?? null, value: p?.value ?? null,
  }));
  const metadataPropertyCounts = new Map();
  for (const p of metadataPropertyList) {
    metadataPropertyCounts.set(p.name, (metadataPropertyCounts.get(p.name) ?? 0) + 1);
  }
  // First occurrence wins for convenience lookups; duplicates are reported separately.
  const metadataProperties = {};
  for (const p of metadataPropertyList) {
    if (!(p.name in metadataProperties)) metadataProperties[p.name] = p.value;
  }

  return {
    doc,
    // Top-level document identity, so a rewritten format/spec/version cannot pass.
    document: {
      bomFormat: doc.bomFormat ?? null,
      specVersion: doc.specVersion ?? null,
      version: doc.version ?? null,
      serialNumber: doc.serialNumber ?? null,
      hasTimestamp: doc.metadata?.timestamp !== undefined,
    },
    subjectRef: subjectComponent?.['bom-ref'] ?? null,
    subject: subjectComponent === null ? null : {
      bomRef: subjectComponent['bom-ref'] ?? null,
      name: subjectComponent.name ?? null,
      version: subjectComponent.version ?? null,
      type: subjectComponent.type ?? null,
      purl: subjectComponent.purl ?? null,
      description: subjectComponent.description ?? null,
    },
    metadataPropertyList,
    metadataPropertyCounts,
    metadataProperties,
    componentList,
    nodes,
    componentRefCounts,
    edgeCounts,
    declaredRefCounts,
    dependsOnDuplicates: dependsOnDuplicates.sort(),
    // Retained for callers that only need presence.
    edges: new Set(edgeCounts.keys()),
    declaredRefs: new Set(declaredRefCounts.keys()),
  };
}

export { splitKey };
