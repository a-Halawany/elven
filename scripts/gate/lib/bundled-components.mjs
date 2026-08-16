/**
 * C17.2 F — THE BUNDLED NATIVE STACK, RECONCILED AGAINST WHAT THE PACKAGE SHIPS.
 *
 * `@img/sharp-libvips-linux-x64` ships one prebuilt shared object that statically bundles ~30
 * third-party libraries. C17 recorded only the package-level `LGPL-3.0-or-later` declaration, so
 * every bundled library's own terms — MPL, BSD, MIT, zlib, IJG, the AOM patent grant and the
 * fontconfig, freetype, libpng and libtiff licences — went unrecorded, along with their notice and
 * source-offer obligations.
 *
 * The tracked manifest is not trusted on its own. It is reconciled, every run, against the two
 * files the package itself ships:
 *   * `versions.json` — the version of each bundled library;
 *   * `README.md`     — the list of libraries and the terms each is used under.
 * A component in the manifest that the README does not name, a README row the manifest omits, a
 * version that disagrees with `versions.json`, a duplicate, an unclassified licence, or a copyleft
 * component with no source offer all FAIL CLOSED.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

export const BUNDLED_PACKAGE = '@img/sharp-libvips-linux-x64';
/** README name -> versions.json key, where they differ. `null` = not independently versioned. */
export const KEY_ALIASES = Object.freeze({
  libarchive: 'archive', libexif: 'exif', libffi: 'ffi', libheif: 'heif',
  libimagequant: 'imagequant', libpng: 'png', librsvg: 'rsvg', libtiff: 'tiff',
  libultrahdr: 'uhdr', libvips: 'vips', libwebp: 'webp', libxml2: 'xml2',
  libnsgif: null,
});

/** Locate the materialized package, peer suffix and all. */
function packageDir(root) {
  const store = join(root, 'node_modules', '.pnpm');
  let names = [];
  try { names = readdirSync(store); } catch { return null; }
  const enc = BUNDLED_PACKAGE.replace(/\//g, '+');
  for (const n of names.sort()) {
    if (!n.startsWith(`${enc}@`)) continue;
    const dir = join(store, n, 'node_modules', BUNDLED_PACKAGE);
    if (existsSync(dir)) return dir;
  }
  return null;
}

/** The library rows the shipped README declares. Parsed, not assumed. */
export function readmeRows(readme) {
  const rows = [];
  const re = /^\|\s*(?:\[)?([A-Za-z0-9_.+-]+)(?:\])?[^|]*\|\s*(.+?)\s*\|\s*$/gm;
  for (const m of readme.matchAll(re)) {
    const name = m[1];
    if (name === 'Library' || /^-+$/.test(name)) continue;
    rows.push({ name, terms: m[2].replace(/\s+/g, ' ').trim() });
  }
  return rows;
}

export function loadBundledManifest(root) {
  const path = join(root, 'scripts/gate/bundled-components.json');
  return JSON.parse(readFileSync(path, 'utf8'));
}

/**
 * Reconcile the tracked manifest against the shipped package, in both directions.
 * `texts` is the canonical-text map, so every non-permissive component can be shown to have a
 * text available to reproduce.
 */
export function verifyBundledComponents(root, { texts = new Map() } = {}) {
  const problems = [];
  const notes = [];
  const dir = packageDir(root);
  if (dir === null) {
    return {
      ok: false,
      problems: [`C17 ${BUNDLED_PACKAGE} is not materialized; its bundled stack cannot be reconciled`],
      notes,
    };
  }
  let manifest;
  try {
    manifest = loadBundledManifest(root);
  } catch (e) {
    return { ok: false, problems: [`C17 bundled-components.json does not parse: ${e instanceof Error ? e.message : e}`], notes };
  }
  if (manifest.schema_version !== '1.0.0') {
    problems.push(`C17 bundled-components schema_version is ${JSON.stringify(manifest.schema_version)}, expected "1.0.0"`);
  }

  // ── the shipped evidence must be the bytes the manifest was built from ──────
  const versionsBytes = readFileSync(join(dir, 'versions.json'));
  const readmeBytes = readFileSync(join(dir, 'README.md'));
  if (sha256(versionsBytes) !== manifest.shipped_evidence?.versions_json_sha256) {
    problems.push(
      `C17 bundled stack: the shipped versions.json hashes to ${sha256(versionsBytes)}, the manifest `
      + `records ${manifest.shipped_evidence?.versions_json_sha256}. The package changed under the manifest.`,
    );
  }
  if (sha256(readmeBytes) !== manifest.shipped_evidence?.readme_sha256) {
    problems.push(
      `C17 bundled stack: the shipped README.md hashes to ${sha256(readmeBytes)}, the manifest records `
      + `${manifest.shipped_evidence?.readme_sha256}`,
    );
  }
  // The package's declared identity must match too.
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  if (pkg.version !== manifest.package?.version) {
    problems.push(`C17 bundled stack: package version is ${pkg.version}, the manifest records ${manifest.package?.version}`);
  }
  // Every shipped shared object must be present and digest-equal.
  for (const lib of manifest.shipped_evidence?.shared_libraries ?? []) {
    const abs = join(dir, lib.path);
    if (!existsSync(abs)) { problems.push(`C17 bundled stack: shipped library '${lib.path}' is missing`); continue; }
    const b = readFileSync(abs);
    if (b.byteLength !== lib.bytes || sha256(b) !== lib.sha256) {
      problems.push(`C17 bundled stack: '${lib.path}' does not match its recorded ${lib.bytes} bytes / ${lib.sha256}`);
    }
  }

  // ── component reconciliation, both directions ──────────────────────────────
  const versions = JSON.parse(versionsBytes.toString('utf8'));
  const rows = readmeRows(readmeBytes.toString('utf8'));
  const readmeNames = new Set(rows.map((r) => r.name));
  const components = Array.isArray(manifest.bundled_components) ? manifest.bundled_components : [];

  const seen = new Set();
  for (const c of components) {
    if (typeof c.name !== 'string' || c.name === '') { problems.push('C17 bundled component with no name'); continue; }
    if (seen.has(c.name)) { problems.push(`C17 bundled component '${c.name}' appears more than once`); continue; }
    seen.add(c.name);
    if (!readmeNames.has(c.name)) {
      problems.push(`C17 bundled component '${c.name}' is not named by the shipped README`);
    }
    const row = rows.find((r) => r.name === c.name);
    if (row !== undefined && row.terms !== c.declared_terms_upstream) {
      problems.push(
        `C17 bundled component '${c.name}' records terms ${JSON.stringify(c.declared_terms_upstream)}, `
        + `the shipped README says ${JSON.stringify(row.terms)}`,
      );
    }
    // Version, against versions.json.
    const key = Object.prototype.hasOwnProperty.call(KEY_ALIASES, c.name) ? KEY_ALIASES[c.name] : c.name;
    if (key === null) {
      if (c.version !== null) {
        problems.push(`C17 bundled component '${c.name}' is not independently versioned upstream but records ${JSON.stringify(c.version)}`);
      }
    } else if (!Object.prototype.hasOwnProperty.call(versions, key)) {
      problems.push(`C17 bundled component '${c.name}' maps to versions.json key '${key}', which the shipped file does not contain`);
    } else if (versions[key] !== c.version) {
      problems.push(`C17 bundled component '${c.name}' records version ${JSON.stringify(c.version)}, versions.json says ${JSON.stringify(versions[key])}`);
    }
    // An unclassified licence fails closed; a licence is not something to guess.
    if (typeof c.spdx_expression !== 'string' || c.spdx_expression === '') {
      problems.push(`C17 bundled component '${c.name}' has no SPDX expression; its licence is unclassified`);
      continue;
    }
    // Every named id must have a reproducible text, or be explicitly excepted.
    for (const id of c.spdx_expression.split(/\s+(?:AND|OR|WITH)\s+/)) {
      if (!texts.has(id) && id !== 'FTL') {
        if (!texts.has(id)) {
          problems.push(`C17 bundled component '${c.name}' names ${id}, for which no canonical text is available to reproduce`);
        }
      }
    }
  }
  for (const r of rows) {
    if (!seen.has(r.name)) {
      problems.push(`C17 the shipped README names bundled library '${r.name}', which the manifest omits`);
    }
  }
  // Every versions.json key must be claimed by some component.
  const claimed = new Set([...seen].map((n) => (Object.prototype.hasOwnProperty.call(KEY_ALIASES, n) ? KEY_ALIASES[n] : n)));
  for (const k of Object.keys(versions)) {
    if (!claimed.has(k)) problems.push(`C17 versions.json declares bundled '${k}', which no manifest component claims`);
  }

  // ── copyleft needs a source offer, per component ────────────────────────────
  const offers = new Map((manifest.source_offers ?? []).map((o) => [o.component, o]));
  const copyleft = components.filter(
    (c) => typeof c.spdx_expression === 'string' && /LGPL|MPL|GPL/.test(c.spdx_expression),
  );
  for (const c of copyleft) {
    const o = offers.get(c.name);
    if (o === undefined) {
      problems.push(`C17 bundled component '${c.name}' is ${c.spdx_expression} and has NO source offer`);
      continue;
    }
    if (typeof o.upstream_source !== 'string' || !o.upstream_source.startsWith('https://')) {
      problems.push(`C17 source offer for '${c.name}' names no https upstream source`);
    }
    if (!Array.isArray(o.obtain) || o.obtain.length === 0) {
      problems.push(`C17 source offer for '${c.name}' says nothing about how to obtain the source`);
    }
    if (o.version !== c.version) {
      problems.push(`C17 source offer for '${c.name}' is for version ${JSON.stringify(o.version)}, the component is ${JSON.stringify(c.version)}`);
    }
  }
  for (const name of offers.keys()) {
    if (!seen.has(name)) problems.push(`C17 source offer names bundled '${name}', which is not a manifest component`);
  }
  // The build recipe must be pinned to an immutable commit.
  const cb = manifest.build_recipe?.commit_binding;
  if (cb === undefined || !/^[0-9a-f]{40}$/.test(cb.commit ?? '')) {
    problems.push('C17 bundled stack: the build recipe is not bound to an immutable 40-hex commit');
  }

  notes.push(
    `bundled_components=${components.length} readme_rows=${rows.length} `
    + `versions_keys=${Object.keys(versions).length} source_offers=${offers.size} copyleft=${copyleft.length}`,
  );
  return { ok: problems.length === 0, problems, notes, manifest, componentCount: components.length };
}
