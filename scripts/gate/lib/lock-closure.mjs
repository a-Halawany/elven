/**
 * C16 — TARGET-RESOLVED DEPENDENCY CLOSURE, DERIVED FROM THE LOCKFILE ALONE.
 *
 * The closure truth is `pnpm-lock.yaml`: its `importers`, `packages` and `snapshots`
 * sections. Nothing here reads node_modules, `pnpm licenses list`, the host's
 * OS/arch, or the generated SBOM — each of those would make the reconciliation
 * compare a thing against itself, which is exactly the defect C16 exists to remove.
 *
 * WHY SNAPSHOTS ARE THE NODES. In lockfile v9 a package can be installed more than
 * once with different peer resolutions. `packages:` is keyed by `name@version`
 * (metadata: integrity, os/cpu/libc), while `snapshots:` is keyed by the FULL
 * resolution including the peer context, e.g.
 *     eslint-plugin-x@1.2.3(eslint@9.0.0)(typescript@5.6.0)
 * Those are genuinely distinct installed nodes with distinct dependency graphs, so
 * the snapshot key is the node identity and the bom-ref. Flattening to name@version
 * would merge them and silently lose edges.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

/** Minimal, dependency-free YAML reader for the pnpm lockfile subset we need. */
export function parseLockfile(text) {
  const lines = text.split('\n');
  const root = {};
  // stack of { indent, container }
  const stack = [{ indent: -1, node: root }];

  const setScalar = (node, key, raw) => {
    let v = raw;
    if (v === '') return (node[key] = {});
    if (v === 'true') v = true;
    else if (v === 'false') v = false;
    else if (/^-?\d+$/.test(v)) v = Number(v);
    else v = stripQuotes(v);
    node[key] = v;
  };

  for (const rawLine of lines) {
    if (rawLine.trim() === '' || /^\s*#/.test(rawLine)) continue;
    const indent = rawLine.search(/\S/);
    const line = rawLine.trim();

    // list item (only used for os/cpu/libc arrays)
    if (line.startsWith('- ')) {
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
      const parent = stack[stack.length - 1];
      const arr = parent.pendingArray;
      if (arr) arr.push(stripQuotes(line.slice(2).trim()));
      continue;
    }

    const m = /^(.*?):(?:\s+(.*))?$/.exec(line);
    if (!m) continue;
    const key = stripQuotes(m[1]);
    const value = m[2] === undefined ? '' : m[2].trim();

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
    const parent = stack[stack.length - 1].node;

    if (value === '') {
      // could be a map OR a list; decide lazily
      const child = {};
      parent[key] = child;
      const frame = { indent, node: child };
      // allow a following "- item" sequence to convert this into an array
      Object.defineProperty(frame, 'pendingArray', {
        get() {
          if (!Array.isArray(parent[key])) parent[key] = [];
          return parent[key];
        },
      });
      stack.push(frame);
    } else if (value.startsWith('{') && value.endsWith('}')) {
      // INLINE FLOW MAPPING, e.g. `resolution: {integrity: sha512-...}` or
      // `engines: {node: '>= 20'}`. Treating these as scalars silently dropped the
      // integrity/SRI values the closure must preserve.
      parent[key] = parseFlowMap(value);
    } else if (value === '[]') {
      parent[key] = [];
    } else if (value.startsWith('[') && value.endsWith(']')) {
      parent[key] = value
        .slice(1, -1)
        .split(',')
        .map((s) => stripQuotes(s.trim()))
        .filter((s) => s !== '');
    } else {
      setScalar(parent, key, value);
    }
  }
  return root;
}

/** Parse a YAML inline flow mapping `{a: 1, b: 'x'}` into an object. */
function parseFlowMap(text) {
  const body = text.slice(1, -1).trim();
  const out = {};
  if (body === '') return out;
  let depth = 0, quote = null, current = '';
  const parts = [];
  for (const ch of body) {
    if (quote !== null) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') { quote = ch; current += ch; continue; }
    if (ch === '{' || ch === '[') depth += 1;
    if (ch === '}' || ch === ']') depth -= 1;
    if (ch === ',' && depth === 0) { parts.push(current); current = ''; continue; }
    current += ch;
  }
  if (current.trim() !== '') parts.push(current);
  for (const part of parts) {
    const idx = part.indexOf(':');
    if (idx === -1) continue;
    const k = stripQuotes(part.slice(0, idx).trim());
    const v = part.slice(idx + 1).trim();
    out[k] = (v.startsWith('{') && v.endsWith('}')) ? parseFlowMap(v) : stripQuotes(v);
  }
  return out;
}

function stripQuotes(s) {
  const t = s.trim();
  if ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
    return t.slice(1, -1);
  }
  return t;
}

/** Split a snapshot/package key into { name, version, peerSuffix, baseKey }. */
export function splitKey(key) {
  let at;
  if (key.startsWith('@')) {
    at = key.indexOf('@', 1);
  } else {
    at = key.indexOf('@');
  }
  const name = key.slice(0, at);
  const rest = key.slice(at + 1);
  const paren = rest.indexOf('(');
  const version = paren === -1 ? rest : rest.slice(0, paren);
  const peerSuffix = paren === -1 ? '' : rest.slice(paren);
  return { name, version, peerSuffix, baseKey: `${name}@${version}` };
}

/** Correct npm PURL, with the scope's `@` and `/` percent-encoded. */
export function npmPurl(name, version) {
  if (name.startsWith('@')) {
    const [scope, bare] = [name.slice(0, name.indexOf('/')), name.slice(name.indexOf('/') + 1)];
    return `pkg:npm/${encodeURIComponent(scope)}%2F${encodeURIComponent(bare)}@${version}`;
  }
  return `pkg:npm/${encodeURIComponent(name)}@${version}`;
}

/**
 * Is a package compatible with the target?
 *
 * MISSING METADATA MEANS INCLUDE. A package that records no os/cpu/libc constraint
 * makes no claim of incompatibility, and treating silence as exclusion would drop
 * real runtime dependencies.
 */
export function platformCompatible(meta, target) {
  const check = (values, actual) => {
    if (values === undefined) return { ok: true, reason: null };
    const list = Array.isArray(values) ? values : [values];
    if (list.length === 0) return { ok: true, reason: null };
    const negations = list.filter((v) => String(v).startsWith('!'));
    if (negations.length > 0) {
      const blocked = negations.some((v) => String(v).slice(1) === actual);
      return { ok: !blocked, reason: blocked ? `negated: ${list.join(',')}` : null };
    }
    const ok = list.includes(actual) || list.includes('any');
    return { ok, reason: ok ? null : `requires ${list.join(',')}` };
  };
  const os = check(meta?.os, target.os);
  const cpu = check(meta?.cpu, target.arch);
  const libc = check(meta?.libc, target.libc);
  if (!os.ok) return { compatible: false, field: 'os', reason: os.reason };
  if (!cpu.ok) return { compatible: false, field: 'cpu', reason: cpu.reason };
  if (!libc.ok) return { compatible: false, field: 'libc', reason: libc.reason };
  return { compatible: true, field: null, reason: null };
}

/**
 * Build the closure for one target.
 *
 * Returns nodes (Map bomRef -> node) and edges (Array of {from, to}), both derived
 * only from the lockfile. Workspace links are preserved as first-class nodes so a
 * workspace dependency never disappears from the graph.
 */
export function buildClosure(lock, target, opts = {}) {
  const importers = lock.importers ?? {};
  const packages = lock.packages ?? {};
  const snapshots = lock.snapshots ?? {};

  const nodes = new Map();
  const edges = [];
  const excludedByPlatform = [];
  const missingSnapshots = [];

  const workspaceRef = (path) => `workspace:${path}`;

  const addWorkspaceNode = (path) => {
    const ref = workspaceRef(path);
    if (!nodes.has(ref)) {
      nodes.set(ref, {
        bomRef: ref,
        kind: 'workspace',
        name: path === '.' ? 'eye-workspace-root' : path.split('/').pop(),
        version: '0.0.0',
        importerPath: path,
        purl: null,
        lockKey: `importer:${path}`,
        peerSuffix: '',
        integrity: null,
        patchHash: null,
        scopes: new Set(),
        platform: { compatible: true },
      });
    }
    return ref;
  };

  /** Resolve an importer/snapshot dependency version string to a node ref. */
  const resolveDep = (name, versionSpec) => {
    const spec = String(versionSpec);
    if (spec.startsWith('link:')) {
      // Workspace link — preserve the edge to the real importer.
      const rel = spec.slice('link:'.length);
      const path = normalizeImporterPath(rel, importers);
      return path === null ? null : addWorkspaceNode(path);
    }
    // `version` may already carry a peer suffix; snapshot keys are name@version(peers)
    const key = spec.includes('@') && spec.startsWith('@') ? spec : `${name}@${spec}`;
    if (snapshots[key] !== undefined) return key;
    // Some importer entries record the version only; try the bare form.
    const bare = `${name}@${splitKey(`${name}@${spec}`).version}`;
    if (snapshots[bare] !== undefined) return bare;
    return null;
  };

  const visit = (ref, scope) => {
    const node = nodes.get(ref);
    if (node !== undefined) {
      node.scopes.add(scope);
      return; // already expanded
    }
    const { name, version, peerSuffix, baseKey } = splitKey(ref);
    const meta = packages[baseKey] ?? {};
    const compat = platformCompatible(meta, target);
    nodes.set(ref, {
      bomRef: ref,
      kind: 'npm',
      name,
      version,
      purl: npmPurl(name, version),
      lockKey: ref,
      peerSuffix,
      integrity: meta?.resolution?.integrity ?? null,
      patchHash: meta?.patched ?? meta?.resolution?.patchHash ?? null,
      deprecated: meta?.deprecated ?? null,
      hasBin: meta?.hasBin ?? false,
      engines: meta?.engines ?? null,
      os: meta?.os ?? null,
      cpu: meta?.cpu ?? null,
      libc: meta?.libc ?? null,
      scopes: new Set([scope]),
      platform: compat,
    });

    const snap = snapshots[ref];
    if (snap === undefined) {
      missingSnapshots.push(ref);
      return;
    }
    // Required dependencies always traverse.
    for (const [depName, depVer] of Object.entries(snap.dependencies ?? {})) {
      const childRef = resolveDep(depName, depVer);
      if (childRef === null) {
        missingSnapshots.push(`${ref} -> ${depName}@${depVer}`);
        continue;
      }
      visit(childRef, scope);
      edges.push({ from: ref, to: childRef, kind: 'dependencies' });
    }
    // Optional dependencies: included when TARGET-COMPATIBLE, excluded only on the
    // package's own recorded platform conditions.
    for (const [depName, depVer] of Object.entries(snap.optionalDependencies ?? {})) {
      const childRef = resolveDep(depName, depVer);
      if (childRef === null) continue;
      const childBase = splitKey(childRef).baseKey;
      const childCompat = platformCompatible(packages[childBase] ?? {}, target);
      if (!childCompat.compatible) {
        excludedByPlatform.push({
          bomRef: childRef, parent: ref, field: childCompat.field, reason: childCompat.reason,
        });
        continue;
      }
      visit(childRef, scope);
      edges.push({ from: ref, to: childRef, kind: 'optionalDependencies' });
    }
  };

  // Roots: the declared importer roots for this target.
  const roots = [];
  for (const path of target.importer_roots) {
    if (importers[path] === undefined) {
      throw new Error(`target importer root '${path}' is not present in pnpm-lock.yaml importers`);
    }
    const ref = addWorkspaceNode(path);
    roots.push(ref);
    for (const scope of target.dependency_scopes) {
      const deps = importers[path][scope] ?? {};
      for (const [depName, entry] of Object.entries(deps)) {
        const version = typeof entry === 'object' ? entry.version : entry;
        if (version === undefined) continue;
        const childRef = resolveDep(depName, version);
        if (childRef === null) {
          missingSnapshots.push(`importer ${path} -> ${depName}@${version}`);
          continue;
        }
        if (childRef.startsWith('workspace:')) {
          // Workspace link: keep the edge, and expand that importer's own runtime deps.
          edges.push({ from: ref, to: childRef, kind: scope });
          continue;
        }
        const base = splitKey(childRef).baseKey;
        const compat = platformCompatible(packages[base] ?? {}, target);
        if (!compat.compatible && scope === 'optionalDependencies') {
          excludedByPlatform.push({ bomRef: childRef, parent: ref, field: compat.field, reason: compat.reason });
          continue;
        }
        visit(childRef, scope);
        edges.push({ from: ref, to: childRef, kind: scope });
      }
    }
  }

  // Deduplicate edges deterministically.
  const edgeKey = (e) => `${e.from} ${e.to}`;
  const uniqueEdges = [...new Map(edges.map((e) => [edgeKey(e), e])).values()].sort((a, b) =>
    edgeKey(a) < edgeKey(b) ? -1 : edgeKey(a) > edgeKey(b) ? 1 : 0,
  );

  return {
    target,
    roots: roots.sort(),
    nodes,
    edges: uniqueEdges,
    excludedByPlatform: excludedByPlatform.sort((a, b) => (a.bomRef < b.bomRef ? -1 : 1)),
    missingSnapshots: [...new Set(missingSnapshots)].sort(),
    opts,
  };
}

function normalizeImporterPath(rel, importers) {
  // importer dependency links are relative to the importer, e.g. '../../packages/contracts'
  const candidate = rel.replace(/^(\.\.\/)+/, '');
  if (importers[candidate] !== undefined) return candidate;
  for (const key of Object.keys(importers)) {
    if (key.endsWith(candidate) || candidate.endsWith(key)) return key;
  }
  return null;
}

export function loadLock(path) {
  return parseLockfile(readFileSync(path, 'utf8'));
}

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');
