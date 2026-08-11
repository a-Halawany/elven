/**
 * C16 — TARGET-RESOLVED DEPENDENCY CLOSURE, DERIVED FROM THE LOCKFILE ALONE.
 *
 * Closure truth is `pnpm-lock.yaml` (`importers`, `packages`, `snapshots`) plus the
 * target descriptor. Nothing here reads node_modules, `pnpm licenses list`, the host
 * OS/arch/libc, or the generated SBOM — any of those would make the reconciliation
 * compare a thing against itself, which is the defect C16 exists to remove.
 *
 * WHY SNAPSHOTS ARE THE NODES. In lockfile v9 a package can be installed more than
 * once with different peer resolutions. `packages:` is keyed by `name@version`
 * (metadata: integrity, os/cpu/libc); `snapshots:` is keyed by the FULL resolution
 * including peer context, e.g. `eslint-plugin-x@1.2.3(eslint@9.0.0)(typescript@5.6.0)`.
 * Those are genuinely distinct installed nodes with distinct dependency graphs, so the
 * snapshot key is the node identity. Flattening to name@version merges them and
 * silently loses edges.
 *
 * ── REMEDIATION AFTER INDEPENDENT REVIEW OF e3a0b1f ──────────────────────────────
 * This module previously (a) hand-rolled a partial YAML reader, (b) emitted
 * non-canonical scoped PURLs (`%40scope%2Fname` instead of `%40scope/name`, which
 * parses as an UNSCOPED name and is therefore a different package), (c) invented
 * workspace identities from path basenames with a hardcoded `0.0.0`, (d) resolved
 * `link:` targets by fuzzy `endsWith` matching rather than relative to the importer,
 * (e) never expanded a linked workspace that was not itself a declared target root,
 * (f) returned early on an already-visited node so scope membership never reached a
 * fixed point, (g) continued silently past an unresolved OPTIONAL reference, and
 * (h) mishandled mixed positive/negative platform constraints. All corrected below.
 */
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, posix } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { PackageURL } from 'packageurl-js';

export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

/**
 * Lockfile formats this gate is written against. A future or unknown format must be a
 * hard failure: the closure semantics (snapshot keys, peer suffixes, importer shape) are
 * format-specific, so silently parsing an unsupported version would produce a
 * confidently wrong closure.
 */
export const SUPPORTED_LOCKFILE_VERSIONS = Object.freeze(['9.0']);

/**
 * Parse the lockfile with an EXACT-PINNED YAML parser (yaml@2.9.0).
 *
 * The previous bespoke reader silently mishandled flow mappings, quoted keys,
 * anchors/aliases and nested sequences — each a way to lose real closure data with no
 * error. Correct parsing is not something to re-implement per gate.
 */
export function parseLockfile(text) {
  const doc = parseYaml(text, {
    // Lockfile keys such as `on`/`y`/version-like strings must never be coerced.
    merge: true,
    strict: true,
  });
  if (doc === null || typeof doc !== 'object') {
    throw new Error('pnpm-lock.yaml did not parse to a mapping');
  }
  const version = String(doc.lockfileVersion ?? '');
  if (!SUPPORTED_LOCKFILE_VERSIONS.includes(version)) {
    throw new Error(
      `pnpm-lock.yaml declares lockfileVersion ${JSON.stringify(doc.lockfileVersion)}, which this ` +
      `gate does not support (supported: ${SUPPORTED_LOCKFILE_VERSIONS.join(', ')}). Closure ` +
      'semantics are format-specific; parsing an unknown format would produce a confidently ' +
      'wrong closure.',
    );
  }
  return doc;
}

export function loadLock(path) {
  return parseLockfile(readFileSync(path, 'utf8'));
}

/**
 * Split a snapshot/package key into its parts.
 *
 * PATCH HASH IS NOT PEER CONTEXT. pnpm packs both into the same parenthesised suffix:
 * `foo@1.0.0(bar@2.0.0)` is a peer resolution, `foo@1.0.0(patch_hash=abc)` is a patched
 * build with NO peer context at all, and the two can co-occur. Treating the whole suffix
 * as "peer context" labelled every patched-only package as a peer variant, which
 * misstates why two resolutions of one version exist. `peerContext` therefore excludes
 * patch markers, while `suffix` keeps the full key text (the installed identity).
 */
export function splitKey(key) {
  const s = String(key);
  const at = s.startsWith('@') ? s.indexOf('@', 1) : s.indexOf('@');
  if (at <= 0) {
    return {
      name: s, version: '', suffix: '', peerContext: '', peerSuffix: '',
      baseKey: s, patchHash: null, peers: [],
    };
  }
  const name = s.slice(0, at);
  const rest = s.slice(at + 1);
  const paren = rest.indexOf('(');
  const version = paren === -1 ? rest : rest.slice(0, paren);
  const suffix = paren === -1 ? '' : rest.slice(paren);

  // Split the suffix into balanced top-level groups, then classify each.
  const groups = [];
  let depth = 0;
  let current = '';
  for (const ch of suffix) {
    if (ch === '(') { depth += 1; if (depth === 1) { current = ''; continue; } }
    if (ch === ')') { depth -= 1; if (depth === 0) { groups.push(current); continue; } }
    if (depth >= 1) current += ch;
  }
  const patchGroups = groups.filter((g) => g.startsWith('patch_hash='));
  const peers = groups.filter((g) => !g.startsWith('patch_hash='));

  return {
    name,
    version,
    suffix,
    // Only genuine peer resolutions, re-rendered canonically.
    peerContext: peers.length > 0 ? peers.map((p) => `(${p})`).join('') : '',
    // Retained under the historical name so nothing silently reads a renamed field.
    peerSuffix: peers.length > 0 ? peers.map((p) => `(${p})`).join('') : '',
    peers,
    baseKey: `${name}@${version}`,
    patchHash: patchGroups.length > 0 ? patchGroups[0].slice('patch_hash='.length) : null,
  };
}

/**
 * Validate an npm SRI integrity string.
 * Returns { ok, algorithms, problem } — a malformed or weak digest must never be
 * silently carried into an SBOM as though the artifact were verified.
 */
export const SUPPORTED_SRI_ALGORITHMS = Object.freeze(['sha256', 'sha384', 'sha512']);
export const SRI_DIGEST_BYTES = Object.freeze({ sha256: 32, sha384: 48, sha512: 64 });

export function validateIntegrity(integrity) {
  if (typeof integrity !== 'string' || integrity.trim() === '') {
    return { ok: false, algorithms: [], problem: 'absent' };
  }
  const algorithms = [];
  for (const token of integrity.trim().split(/\s+/)) {
    const m = /^([a-z0-9]+)-(.+)$/.exec(token);
    if (m === null) return { ok: false, algorithms, problem: `malformed SRI token '${token}'` };
    const [, alg, b64] = m;
    if (!SUPPORTED_SRI_ALGORITHMS.includes(alg)) {
      return { ok: false, algorithms, problem: `unsupported SRI algorithm '${alg}'` };
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) {
      return { ok: false, algorithms, problem: `SRI digest for '${alg}' is not valid base64` };
    }
    const bytes = Buffer.from(b64, 'base64').byteLength;
    if (bytes !== SRI_DIGEST_BYTES[alg]) {
      return {
        ok: false, algorithms,
        problem: `SRI '${alg}' digest is ${bytes} bytes, expected ${SRI_DIGEST_BYTES[alg]}`,
      };
    }
    algorithms.push(alg);
  }
  if (algorithms.length === 0) return { ok: false, algorithms, problem: 'no SRI tokens' };
  return { ok: true, algorithms, problem: null };
}

/**
 * CANONICAL npm Package URL, produced by the exact-pinned reference implementation
 * (packageurl-js@2.0.1) rather than a bespoke encoder.
 *
 * The distinction is semantic, not cosmetic: for `@eye/contracts`, the canonical
 * `pkg:npm/%40eye/contracts@0.0.1` carries namespace `@eye` + name `contracts`, while
 * the previously emitted `pkg:npm/%40eye%2Fcontracts@0.0.1` parses as a namespace-less
 * package literally named `@eye/contracts`. Those identify different things, so every
 * downstream consumer matching on namespace saw the wrong package.
 */
export function npmPurl(name, version) {
  const slash = name.indexOf('/');
  const namespace = name.startsWith('@') && slash !== -1 ? name.slice(0, slash) : undefined;
  const bare = namespace === undefined ? name : name.slice(slash + 1);
  return new PackageURL('npm', namespace, bare, version, undefined, undefined).toString();
}

/** Parse a PURL back to its parts; throws on a malformed value. */
export function parsePurl(purl) {
  const p = PackageURL.fromString(purl);
  return { type: p.type, namespace: p.namespace ?? null, name: p.name, version: p.version ?? null };
}

/**
 * Is a package compatible with the target?
 *
 * THREE RULES, applied per field (os → target.os, cpu → target.arch, libc → target.libc):
 *   1. MISSING METADATA MEANS INCLUDE. Silence is not a claim of incompatibility, and
 *      treating it as exclusion would drop real runtime dependencies.
 *   2. The target must NOT match any negative constraint (`!darwin` excludes darwin).
 *   3. If any POSITIVE constraint is present, the target must match one of them.
 * Rules 2 and 3 are both applied when a field mixes the two forms — the previous
 * implementation checked negations OR positives and ignored whichever came second, so
 * `os: ['!win32', 'linux']` and `os: ['linux', '!linux']` were both mis-evaluated.
 */
export function platformCompatible(meta, target) {
  const check = (values, actual, field) => {
    if (values === undefined || values === null) return { ok: true, reason: null };
    const list = (Array.isArray(values) ? values : [values]).map(String);
    if (list.length === 0) return { ok: true, reason: null };

    const negatives = list.filter((v) => v.startsWith('!')).map((v) => v.slice(1));
    const positives = list.filter((v) => !v.startsWith('!'));

    // Rule 2 — an explicit exclusion always wins.
    if (negatives.includes(actual)) {
      return { ok: false, reason: `excluded by !${actual}` };
    }
    // Rule 3 — positives, when present, are an allowlist ('any' is a wildcard).
    if (positives.length > 0 && !positives.includes(actual) && !positives.includes('any')) {
      return { ok: false, reason: `requires ${positives.join(',')}` };
    }
    return { ok: true, reason: null, field };
  };

  for (const [field, values, actual] of [
    ['os', meta?.os, target.os],
    ['cpu', meta?.cpu, target.arch],
    ['libc', meta?.libc, target.libc],
  ]) {
    const r = check(values, actual, field);
    if (!r.ok) return { compatible: false, field, reason: r.reason };
  }
  return { compatible: true, field: null, reason: null };
}

/**
 * Read a workspace importer's REAL identity from its own package.json.
 *
 * Path basenames and a hardcoded `0.0.0` are fabricated identity: they made
 * `packages/contracts` appear as `contracts@0.0.0` when the package is actually
 * `@eye/contracts@0.0.1`. The manifest digest is bound so the identity is traceable
 * to exact bytes — but note the manifest supplies IDENTITY ONLY. Dependency
 * membership stays lockfile-derived; nothing here reads the manifest's dependency
 * lists, so editing a manifest cannot add or remove a closure member.
 */
export function workspaceIdentity(root, importerPath) {
  const rel = importerPath === '.' ? 'package.json' : posix.join(importerPath, 'package.json');
  const abs = join(root, rel);
  if (!existsSync(abs)) {
    throw new Error(
      `workspace importer '${importerPath}' has no package.json at ${rel}; ` +
      'first-party identity cannot be fabricated from the directory name',
    );
  }
  const raw = readFileSync(abs, 'utf8');
  const manifest = JSON.parse(raw);
  if (typeof manifest.name !== 'string' || manifest.name === '') {
    throw new Error(`${rel} declares no name; workspace identity must be real`);
  }
  if (typeof manifest.version !== 'string' || manifest.version === '') {
    throw new Error(`${rel} declares no version; workspace identity must be real`);
  }
  return {
    name: manifest.name,
    version: manifest.version,
    manifestPath: rel,
    manifestSha256: sha256(raw),
    private: manifest.private === true,
  };
}

/** Resolve a `link:`/`file:` target relative to the IMPORTING workspace. */
export function resolveLinkPath(importerPath, spec, importers) {
  const rel = spec.replace(/^(link|file):/, '');
  const base = importerPath === '.' ? '' : importerPath;
  const resolved = posix.normalize(posix.join(base, rel));
  const candidate = resolved === '' || resolved === '.' ? '.' : resolved;
  if (importers[candidate] !== undefined) return candidate;
  return null;
}

/**
 * Build the closure for one target.
 *
 * Two explicit phases, because conflating them is what previously left scope
 * provenance incomplete:
 *   PHASE 1 (structure) — discover every reachable node and edge, cycle-safe, failing
 *     closed on any unresolved reference (required OR optional).
 *   PHASE 2 (scope) — propagate scope membership over that graph to a FIXED POINT, so
 *     a component reached under a second scope propagates that scope to all of its
 *     descendants instead of stopping at the already-visited node.
 */
export function buildClosure(lock, target, opts = {}) {
  const root = opts.root ?? process.cwd();
  const importers = lock.importers ?? {};
  const packages = lock.packages ?? {};
  const snapshots = lock.snapshots ?? {};

  const nodes = new Map();
  const childrenOf = new Map();      // ref -> [{ to, kind }]
  const excludedByPlatform = [];
  const unresolved = [];
  const integrityExempted = [];
  const workspaceManifests = {};

  const workspaceRef = (path) => `workspace:${path}`;
  const RUNTIME_SCOPES = ['dependencies', 'optionalDependencies'];

  /**
   * GOVERNED first-party component type. Mapping every workspace to "application" is
   * wrong: apps/* are deployable applications, packages/* are libraries consumed by
   * them, and a consumer filtering the BOM for deployable units must not receive
   * libraries. An unmapped importer is an error rather than a silent default.
   */
  const typeMap = opts.firstPartyTypes ?? {};
  const componentTypeFor = (path) => {
    const t = typeMap[path];
    if (t === undefined) {
      throw new Error(
        `importer '${path}' has no governed CycloneDX component type in ` +
        "target-descriptor.json first_party_component_types.by_importer_root; " +
        'the type must be declared, not defaulted',
      );
    }
    return t;
  };

  const addWorkspaceNode = (path) => {
    const ref = workspaceRef(path);
    if (nodes.has(ref)) return ref;
    const id = workspaceIdentity(root, path);
    workspaceManifests[path] = id;
    nodes.set(ref, {
      bomRef: ref,
      kind: 'workspace',
      componentType: componentTypeFor(path),
      name: id.name,
      version: id.version,
      importerPath: path,
      manifestPath: id.manifestPath,
      manifestSha256: id.manifestSha256,
      // First-party workspace packages are not published to a registry under these
      // coordinates, but a canonical PURL is still the correct component identity.
      purl: npmPurl(id.name, id.version),
      lockKey: `importer:${path}`,
      peerContext: '',
      peerSuffix: '',
      peers: [],
      patchHash: null,
      integrity: null,
      integrityAlgorithms: [],
      // A first-party workspace is built from tracked source, not fetched as an
      // artifact, so there is no registry digest to verify. That is why integrity is
      // required for REGISTRY packages only.
      integrityValid: true,
      os: null, cpu: null, libc: null,
      deprecated: null,
      scopes: new Set(),
      platform: { compatible: true, field: null, reason: null },
    });
    childrenOf.set(ref, []);
    return ref;
  };

  /**
   * Resolve a dependency entry to a node ref.
   * Returns { ref } | { workspace: path } | { alias: … } | null when unresolvable.
   */
  const resolveDep = (importerPath, name, rawSpec) => {
    const spec = String(rawSpec);

    if (spec.startsWith('link:') || spec.startsWith('file:')) {
      const path = resolveLinkPath(importerPath, spec, importers);
      return path === null ? null : { workspaceLink: path };
    }

    // ALIAS: `alias-name: npm:real-name@1.2.3(peers)` — the installed package is the
    // aliased target, so the node identity must be the real package, not the alias.
    let effectiveName = name;
    let versionPart = spec;
    const npmAlias = /^npm:(.+)$/.exec(spec);
    if (npmAlias !== null) {
      const inner = npmAlias[1];
      const at = inner.startsWith('@') ? inner.indexOf('@', 1) : inner.indexOf('@');
      if (at > 0) {
        effectiveName = inner.slice(0, at);
        versionPart = inner.slice(at + 1);
      }
    }

    // A spec that already carries its own name (snapshot alias form) is a full key.
    // The pattern deliberately forbids '(' before the '@' and requires a digit after
    // it, so a PEER-SUFFIXED version such as `11.1.28(reflect-metadata@0.2.2)` is not
    // mistaken for a `name@version` alias.
    const direct = versionPart;
    const candidates = [];
    if (/^(?:@[^/@()]+\/)?[^@/()]+@[0-9]/.test(direct)) candidates.push(direct);
    candidates.push(`${effectiveName}@${versionPart}`);
    // Peer-suffixed importer entries also resolve without the suffix.
    candidates.push(`${effectiveName}@${splitKey(`${effectiveName}@${versionPart}`).version}`);

    for (const key of candidates) {
      if (snapshots[key] !== undefined) {
        return { ref: key, aliasOf: npmAlias === null ? null : name };
      }
    }
    // A package with metadata but no snapshot entry is still a real resolution.
    for (const key of candidates) {
      if (packages[key] !== undefined) {
        return { ref: key, aliasOf: npmAlias === null ? null : name, snapshotless: true };
      }
    }
    return null;
  };

  /**
   * Governed exemptions from the integrity requirement. A registry package with no
   * verifiable digest is an unverified input, so it may only be admitted by an explicit
   * rule that states WHY integrity is unavailable for that resolution class.
   */
  const integrityRules = target.integrity_rules ?? [];
  const integrityExemption = (ref, meta) => integrityRules.find((rule) => {
    if (typeof rule.resolution_type === 'string') {
      const type = meta?.resolution?.type ?? (meta?.resolution?.tarball !== undefined ? 'tarball' : 'registry');
      if (type !== rule.resolution_type) return false;
    }
    if (typeof rule.key_prefix === 'string' && !ref.startsWith(rule.key_prefix)) return false;
    return true;
  });

  const materializePackage = (ref) => {
    if (nodes.has(ref)) return nodes.get(ref);
    const { name, version, peerContext, baseKey, patchHash, peers } = splitKey(ref);
    const meta = packages[baseKey];

    // A snapshot key with no `packages:` entry has no metadata at all — no integrity, no
    // platform constraints, no engines. Admitting it would put a component in the SBOM
    // that the lockfile never described.
    if (meta === undefined) {
      unresolved.push(
        `${ref}: no 'packages:' metadata entry for ${baseKey}; the resolution is undescribed`,
      );
    }

    const integrity = meta?.resolution?.integrity ?? null;
    const sri = validateIntegrity(integrity);
    if (!sri.ok) {
      const exemption = integrityExemption(ref, meta ?? {});
      if (exemption === undefined) {
        unresolved.push(
          `${ref}: integrity is ${sri.problem} and no governed integrity_rule admits it; ` +
          'an unverifiable artifact cannot enter the closure',
        );
      } else {
        integrityExempted.push({ bomRef: ref, problem: sri.problem, rule: exemption.id ?? '(unnamed)' });
      }
    }

    nodes.set(ref, {
      bomRef: ref,
      kind: 'npm',
      componentType: 'library',
      name,
      version,
      purl: npmPurl(name, version),
      lockKey: ref,
      // Peer context EXCLUDES patch markers, so a patched-only key is not a peer variant.
      peerContext,
      peerSuffix: peerContext,
      peers,
      patchHash: patchHash ?? (meta?.patched === true ? 'declared' : null),
      integrity,
      integrityAlgorithms: sri.algorithms,
      integrityValid: sri.ok,
      deprecated: meta?.deprecated ?? null,
      hasBin: meta?.hasBin ?? false,
      engines: meta?.engines ?? null,
      os: meta?.os ?? null,
      cpu: meta?.cpu ?? null,
      libc: meta?.libc ?? null,
      scopes: new Set(),
      platform: platformCompatible(meta ?? {}, target),
    });
    childrenOf.set(ref, []);
    return nodes.get(ref);
  };

  // ── PHASE 1: structure ────────────────────────────────────────────────────────
  // Cycle-safe BFS. `expanded` guards edge emission; scope is NOT considered here, so
  // no node's expansion can be skipped because of the scope it was first reached by.
  const expanded = new Set();
  const queue = [];
  const seeds = [];   // { ref, scope } — phase 2 entry points

  /** Expand one workspace importer under a given scope list. */
  const expandImporter = (path, scopes, isRoot) => {
    const from = addWorkspaceNode(path);
    if (expanded.has(`importer:${path}:${scopes.join(',')}`)) return from;
    expanded.add(`importer:${path}:${scopes.join(',')}`);

    for (const scope of scopes) {
      const deps = importers[path]?.[scope] ?? {};
      for (const [depName, entry] of Object.entries(deps)) {
        const version = (entry !== null && typeof entry === 'object') ? entry.version : entry;
        if (version === undefined || version === null) continue;
        const resolved = resolveDep(path, depName, version);
        if (resolved === null) {
          unresolved.push(`importer ${path} [${scope}] -> ${depName}@${version}`);
          continue;
        }

        if (resolved.workspaceLink !== undefined) {
          const to = addWorkspaceNode(resolved.workspaceLink);
          childrenOf.get(from).push({ to, kind: scope });
          // A linked workspace is traversed RECURSIVELY even when it is not itself a
          // declared target root: what the consumer actually consumes is that
          // package's runtime closure. Its devDependencies are not consumed through
          // the link, so only the runtime scopes follow.
          expandImporter(resolved.workspaceLink, RUNTIME_SCOPES, false);
          if (isRoot) seeds.push({ ref: to, scope });
          continue;
        }

        const node = materializePackage(resolved.ref);
        if (!node.platform.compatible) {
          if (scope === 'optionalDependencies') {
            excludedByPlatform.push({
              bomRef: resolved.ref, parent: from, field: node.platform.field,
              reason: node.platform.reason, optional: true,
            });
            nodes.delete(resolved.ref);
            childrenOf.delete(resolved.ref);
            continue;
          }
          // A REQUIRED dependency the target cannot satisfy is a real defect, not a
          // silent omission.
          unresolved.push(
            `importer ${path} [${scope}] -> ${resolved.ref} is platform-incompatible ` +
            `(${node.platform.field}: ${node.platform.reason}) but is NOT optional`,
          );
          continue;
        }
        childrenOf.get(from).push({ to: resolved.ref, kind: scope, aliasOf: resolved.aliasOf ?? null });
        queue.push(resolved.ref);
        // ONLY a declared target root seeds scope membership. A workspace reached through
        // a link is not a root: its dependencies inherit whatever scope the CONSUMER was
        // reached under, via propagation. Seeding here unconditionally made a dev-only
        // workspace's runtime dependencies look like production members.
        if (isRoot) seeds.push({ ref: resolved.ref, scope });
      }
    }
    return from;
  };

  const roots = [];
  for (const path of target.importer_roots) {
    if (importers[path] === undefined) {
      throw new Error(`target importer root '${path}' is not present in pnpm-lock.yaml importers`);
    }
    roots.push(expandImporter(path, target.dependency_scopes, true));
  }

  while (queue.length > 0) {
    const ref = queue.shift();
    if (expanded.has(ref)) continue;
    expanded.add(ref);
    const snap = snapshots[ref];
    if (snap === undefined) {
      // No snapshot entry: a leaf resolution recorded only in `packages`.
      continue;
    }

    for (const [kind, optional] of [['dependencies', false], ['optionalDependencies', true]]) {
      for (const [depName, depVer] of Object.entries(snap[kind] ?? {})) {
        const resolved = resolveDep('.', depName, depVer);
        if (resolved === null) {
          // FAIL CLOSED on optional too. Silently continuing here is how an
          // incomplete closure certifies itself as complete.
          unresolved.push(`${ref} [${kind}] -> ${depName}@${depVer}`);
          continue;
        }
        if (resolved.workspaceLink !== undefined) {
          const to = addWorkspaceNode(resolved.workspaceLink);
          childrenOf.get(ref).push({ to, kind });
          expandImporter(resolved.workspaceLink, RUNTIME_SCOPES, false);
          continue;
        }
        const node = materializePackage(resolved.ref);
        if (!node.platform.compatible) {
          if (optional) {
            excludedByPlatform.push({
              bomRef: resolved.ref, parent: ref, field: node.platform.field,
              reason: node.platform.reason, optional: true,
            });
            if (!expanded.has(resolved.ref)) {
              nodes.delete(resolved.ref);
              childrenOf.delete(resolved.ref);
            }
            continue;
          }
          unresolved.push(
            `${ref} [${kind}] -> ${resolved.ref} is platform-incompatible ` +
            `(${node.platform.field}: ${node.platform.reason}) but is NOT optional`,
          );
          continue;
        }
        childrenOf.get(ref).push({ to: resolved.ref, kind, aliasOf: resolved.aliasOf ?? null });
        queue.push(resolved.ref);
      }
    }
  }

  // ── PHASE 2: scope membership to a fixed point ────────────────────────────────
  // A worklist rather than a recursive walk: when a node gains a scope it did not
  // already carry, that scope is pushed to its descendants. Termination is guaranteed
  // because scopes are only ever ADDED to finite per-node sets.
  //
  // ONE NARROWING RULE, and it matters. Edges out of a WORKSPACE node are that
  // workspace's own manifest declarations. A `devDependencies` declaration is not
  // consumed by whoever depends on the workspace, so an inbound runtime scope must NOT
  // cross it — otherwise `apps/api --dependencies--> @eye/contracts` would mark
  // contracts' dev-only toolchain (typescript, vitest) as production dependencies.
  // Those dev edges get their own seed from the root declaration that created them.
  // Edges out of a registry package come from `snapshots` and are runtime by
  // construction, so they always inherit.
  //
  // OPTIONAL ANCESTRY. A component reached through an `optionalDependencies` edge is
  // itself optional, and so is everything only reachable beneath it. Propagating just the
  // root declaration scope labelled every production registry component a plain
  // `dependencies` member, which overstates what is mandatory. Crossing an optional edge
  // therefore ADDS `optionalDependencies` to what flows onward.
  const isWorkspace = (ref) => nodes.get(ref)?.kind === 'workspace';
  const OPTIONAL = 'optionalDependencies';
  const work = seeds.filter((s) => nodes.has(s.ref));
  while (work.length > 0) {
    const { ref, scope } = work.pop();
    const node = nodes.get(ref);
    if (node === undefined || node.scopes.has(scope)) continue;
    node.scopes.add(scope);
    for (const child of childrenOf.get(ref) ?? []) {
      if (!nodes.has(child.to)) continue;
      // A workspace's own dev declarations are not consumed by its consumers.
      if (isWorkspace(ref) && child.kind === 'devDependencies') continue;
      // Crossing an optional edge makes the subtree optional as well as whatever it
      // already was, so both scopes propagate.
      if (child.kind === OPTIONAL) {
        work.push({ ref: child.to, scope: OPTIONAL });
        if (scope !== OPTIONAL) work.push({ ref: child.to, scope });
      } else {
        work.push({ ref: child.to, scope });
      }
    }
  }

  // A declared target root is the SUBJECT of the closure rather than a member of one
  // of its scopes, so its scope set is the target's declared scopes. Assigned directly
  // and never propagated, so a root cannot contaminate its descendants' provenance.
  for (const ref of roots) {
    const node = nodes.get(ref);
    if (node !== undefined) node.scopes = new Set(target.dependency_scopes);
  }

  // Edges: deduplicated deterministically, and only between surviving nodes.
  const seen = new Map();
  for (const [from, children] of childrenOf.entries()) {
    if (!nodes.has(from)) continue;
    for (const child of children) {
      if (!nodes.has(child.to)) continue;
      const key = `${from} ${child.to}`;
      if (!seen.has(key)) seen.set(key, { from, to: child.to, kind: child.kind });
    }
  }
  const edges = [...seen.values()].sort((a, b) => {
    const ka = `${a.from} ${a.to}`;
    const kb = `${b.from} ${b.to}`;
    return ka < kb ? -1 : ka > kb ? 1 : 0;
  });

  return {
    target,
    roots: roots.sort(),
    nodes,
    edges,
    childrenOf,
    workspaceManifests,
    excludedByPlatform: excludedByPlatform
      .sort((a, b) => (`${a.parent} ${a.bomRef}` < `${b.parent} ${b.bomRef}` ? -1 : 1)),
    integrityExempted: integrityExempted.sort((a, b) => (a.bomRef < b.bomRef ? -1 : 1)),
    // Retained under the historical name so existing callers keep working; this is
    // now every unresolved reference, required or optional.
    missingSnapshots: [...new Set(unresolved)].sort(),
    unresolved: [...new Set(unresolved)].sort(),
    opts,
  };
}
