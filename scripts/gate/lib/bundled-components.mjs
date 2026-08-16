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
import { readFileSync, readdirSync, existsSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';
import { OBLIGATION_TABLE, parseSpdxExpression } from './license-closure.mjs';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

export const BUNDLED_PACKAGE = '@img/sharp-libvips-linux-x64';
/**
 * Code-owned governance binding for the complete manifest.  The README/versions checks prove
 * what the package ships; this digest proves the legal mapping, package identity, shared-object
 * inventory, patent record, build recipe and source offers were the reviewed ones.  Without it,
 * changing LGPL to MIT or replacing an upstream with attacker.example was self-consistent.
 */
export const BUNDLED_MANIFEST_SHA256 = 'd06e6165c0178033dd3301c01c5e9f41923814dadc74b72c0518305951f64b49';
/** README name -> versions.json key, where they differ. `null` = not independently versioned. */
export const KEY_ALIASES = Object.freeze({
  libarchive: 'archive', libexif: 'exif', libffi: 'ffi', libheif: 'heif',
  libimagequant: 'imagequant', libpng: 'png', librsvg: 'rsvg', libtiff: 'tiff',
  libultrahdr: 'uhdr', libvips: 'vips', libwebp: 'webp', libxml2: 'xml2',
  libnsgif: null,
});

/** Identity and build facts independently read from the published package and reviewed recipe. */
export const BUNDLED_PACKAGE_CONTRACT = Object.freeze({
  name: BUNDLED_PACKAGE,
  version: '1.3.2',
  purl: 'pkg:npm/%40img/sharp-libvips-linux-x64@1.3.2',
  declared_license: 'LGPL-3.0-or-later',
  author: 'Lovell Fuller <npm@lovell.info>',
  repository: 'https://github.com/lovell/sharp-libvips',
  directory: 'npm/linux-x64',
  tag: 'v1.3.2',
  commit: '4da6d14c0d59866adfb9d8cf52bcaa53846dc4f6',
});

/**
 * Exact mapping from the terms SHIPPED in README.md to the SPDX expression whose obligation
 * rules are applied.  A parseable expression is not enough: `LGPLv3` remapped to `MIT` is still
 * parseable, but it erases source/relinking obligations.  The mapping therefore lives in code,
 * independently of bundled-components.json.
 */
export const BUNDLED_TERM_SPDX = Object.freeze({
  'BSD 2-Clause + [Alliance for Open Media Patent License 1.0](https://aomedia.org/license/patent-license/)': 'BSD-2-Clause',
  'Mozilla Public License 2.0': 'MPL-2.0',
  'MIT License': 'MIT',
  '[fontconfig License](https://gitlab.freedesktop.org/fontconfig/fontconfig/blob/main/COPYING) (BSD-like)': 'MIT',
  '[freetype License](https://git.savannah.gnu.org/cgit/freetype/freetype2.git/tree/docs/FTL.TXT) (BSD-like)': 'FTL',
  'LGPLv3': 'LGPL-3.0-or-later',
  'BSD 3-Clause': 'BSD-3-Clause',
  'BSD 2-Clause': 'BSD-2-Clause',
  '[BSD 2-Clause](https://github.com/lovell/libimagequant/blob/main/COPYRIGHT)': 'BSD-2-Clause',
  '[libpng License](https://github.com/pnggroup/libpng/blob/master/LICENSE)': 'Libpng',
  '[libtiff License](https://gitlab.com/libtiff/libtiff/blob/master/LICENSE.md) (BSD-like)': 'libtiff',
  'New BSD License': 'BSD-3-Clause',
  '[zlib License, IJG License, BSD 3-Clause](https://github.com/mozilla/mozjpeg/blob/master/LICENSE.md)': 'Zlib AND IJG AND BSD-3-Clause',
  '[zlib License](https://github.com/zlib-ng/zlib-ng/blob/develop/LICENSE.md)': 'Zlib',
});

/** Exact source locations for every component whose mapped obligations require source. */
export const BUNDLED_SOURCE_UPSTREAM = Object.freeze({
  cairo: 'https://gitlab.freedesktop.org/cairo/cairo',
  fribidi: 'https://github.com/fribidi/fribidi',
  glib: 'https://gitlab.gnome.org/GNOME/glib',
  libexif: 'https://github.com/libexif/libexif',
  libheif: 'https://github.com/strukturag/libheif',
  librsvg: 'https://gitlab.gnome.org/GNOME/librsvg',
  libvips: 'https://github.com/libvips/libvips',
  pango: 'https://gitlab.gnome.org/GNOME/pango',
  'proxy-libintl': 'https://github.com/frida/proxy-libintl',
});

export const BUNDLED_AOM_PATENT_GRANT = Object.freeze({
  applies_to: 'aom',
  url: 'https://aomedia.org/license/patent-license/',
  upstream_source: 'https://aomedia.googlesource.com/aom/+/03087864cf4bea6abb0d28f95cf7843511413d8f/PATENTS',
});

/**
 * Exact upstream legal files for the complete native closure.  These are code-owned expectations,
 * not summaries copied into the mutable manifest: path, byte length, digest and immutable
 * version/tag source are all checked before any text is trusted.  The complete bytes are emitted
 * into THIRD_PARTY_NOTICES.md.  AOM has two records because its patent grant is a separate legal
 * instrument; all other components have the exact legal file identified by their pinned build.
 */
const legal = (path, bytes, sha256, source_url, role = 'licence-and-attribution') =>
  Object.freeze({ path, bytes, sha256, source_url, role });

export const BUNDLED_LEGAL_FILES = Object.freeze({
  aom: Object.freeze([
    legal('vendor/sharp-libvips/1.3.2/legal/aom/LICENSE', 1316, '4764a286d8b2faeaf42f4418e7d7a28d58fc8fd4d00a3d0a7f44b0a4099de7f2', 'https://aomedia.googlesource.com/aom/+/03087864cf4bea6abb0d28f95cf7843511413d8f/LICENSE'),
    legal('vendor/sharp-libvips/1.3.2/legal/aom/PATENTS', 5701, '661fb8e504744e95587b556b94a58343448300606a41bea8c7a9b97125696e61', 'https://aomedia.googlesource.com/aom/+/03087864cf4bea6abb0d28f95cf7843511413d8f/PATENTS', 'patent-grant'),
  ]),
  cairo: Object.freeze([
    legal('vendor/sharp-libvips/1.3.2/legal/cairo/COPYING', 1576, '67228a9f7c5f9b67c58f556f1be178f62da4d9e2e6285318d8c74d567255abdf', 'https://gitlab.freedesktop.org/cairo/cairo/-/blob/1.18.4/COPYING'),
    legal('vendor/sharp-libvips/1.3.2/legal/cairo/COPYING-LGPL-2.1', 26533, '9e9e8608c4cdda51a78cc3a385f4ec9a2e4c96d5ecad74ac8bca5fca3e563b7d', 'https://gitlab.freedesktop.org/cairo/cairo/-/blob/1.18.4/COPYING-LGPL-2.1'),
    legal('vendor/sharp-libvips/1.3.2/legal/cairo/COPYING-MPL-1.1', 25755, '53692a2ed6c6a2c6ec9b32dd0b820dfae91e0a1fcdf625ca9ed0bdf8705fcc4f', 'https://gitlab.freedesktop.org/cairo/cairo/-/blob/1.18.4/COPYING-MPL-1.1'),
  ]),
  cgif: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/cgif/LICENSE', 1099, '7264dede477abab4ac3fe8236beb8153845c04ccd33b18f281085087e219fc6d', 'https://github.com/dloebl/cgif/blob/v0.5.3/LICENSE')]),
  expat: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/expat/COPYING', 1144, '31b15de82aa19a845156169a17a5488bf597e561b2c318d159ed583139b25e87', 'https://github.com/libexpat/libexpat/blob/R_2_8_2/expat/COPYING')]),
  fontconfig: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/fontconfig/COPYING', 8616, '51a51aa9823704fd90bccc616cdd17ebabb5b2b3e9cbde886ca02c7002288067', 'https://gitlab.freedesktop.org/fontconfig/fontconfig/-/blob/2.18.1/COPYING')]),
  freetype: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/freetype/FTL.TXT', 6743, '5a5ee54c5001bbad1cdc1a57cc3dd4c42199b2da09d39c7ee41fab002d02967f', 'https://github.com/freetype/freetype/blob/VER-2-14-3/docs/FTL.TXT')]),
  fribidi: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/fribidi/COPYING', 26440, '32434afcc8666ba060e111d715bfdb6c2d5dd8a35fa4d3ab8ad67d8f850d2f2b', 'https://github.com/fribidi/fribidi/blob/v1.0.16/COPYING')]),
  glib: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/glib/LGPL-2.1-or-later.txt', 25967, 'fa6f36630bb1e0c571d34b2bbdf188d08495c9dbf58f28cac112f303fc1f58fb', 'https://gitlab.gnome.org/GNOME/glib/-/blob/2.89.1/LICENSES/LGPL-2.1-or-later.txt')]),
  harfbuzz: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/harfbuzz/COPYING', 1971, 'ba8f810f2455c2f08e2d56bb49b72f37fcf68f1f4fade38977cfd7372050ad64', 'https://github.com/harfbuzz/harfbuzz/blob/14.2.1/COPYING')]),
  highway: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/highway/LICENSE', 20785, 'e340270d4f64384569a91d546acb5b094d69ce47f0c015db77abb74dc6f815af', 'https://github.com/google/highway/blob/1.4.0/LICENSE')]),
  lcms: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/lcms/LICENSE', 1080, '6dbd60437f8ef91d8de1f08ad75882547fd4931bfcc3566a0735f28db1484d31', 'https://github.com/mm2/Little-CMS/blob/lcms2.19.1/LICENSE')]),
  libarchive: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/libarchive/COPYING', 3089, '30e556b3959e3985d66efefec5eaac51d4995053caa1d3cffe6eb916f146f229', 'https://github.com/libarchive/libarchive/blob/v3.8.8/COPYING')]),
  libexif: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/libexif/COPYING', 26434, '36b6d3fa47916943fd5fec313c584784946047ec1337a78b440e5992cb595f89', 'https://github.com/libexif/libexif/blob/v0.6.26/COPYING')]),
  libffi: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/libffi/LICENSE', 1132, 'd5699fa516968e3a1550e6c902b7441c78856f2603d61bedd0b0662a26655366', 'https://github.com/libffi/libffi/blob/v3.6.0/LICENSE')]),
  libheif: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/libheif/COPYING', 44366, 'fa81ce652315b013359d6e8e4744335f31a50c7c192907176d3632f78a3b4596', 'https://github.com/strukturag/libheif/blob/v1.23.1/COPYING')]),
  libimagequant: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/libimagequant/COPYRIGHT', 1851, '7391bfbcde4404cefb9849553362c3ab436f929f5cc1abb57071ec045590ee99', 'https://github.com/lovell/libimagequant/blob/v2.4.1/COPYRIGHT')]),
  libnsgif: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/libnsgif/COPYING', 1133, '1469b759cf18e43c6e1b4ff892307d3962cbbb337ac497620d6690a219fad10c', 'https://github.com/libvips/libvips/blob/v8.18.3/libvips/foreign/libnsgif/COPYING')]),
  libpng: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/libpng/LICENSE', 5345, 'bdb0a645ea18c60507d0368379b1ac5474b92255fcc2d115e07486a7672ba526', 'https://github.com/pnggroup/libpng/blob/v1.6.58/LICENSE')]),
  librsvg: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/librsvg/COPYING.LIB', 26530, 'dc626520dcd53a22f727af3ee42c770e56c97a64fe3adb063799d8ab032fe551', 'https://gitlab.gnome.org/GNOME/librsvg/-/blob/2.62.90/COPYING.LIB')]),
  libtiff: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/libtiff/LICENSE.md', 2416, '0e27c2382d7b8147972bbb746e04059a1152c8d0fda9d03ef1399d1a433c4ade', 'https://gitlab.com/libtiff/libtiff/-/blob/d01a94be176f5f6a87f7ee1c0b32e65416aa2b4d/LICENSE.md')]),
  libultrahdr: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/libultrahdr/LICENSE', 12566, 'c9247b5cb07866938643cc238292434e6f2af8642e1fce10771c0e4cc7909316', 'https://github.com/google/libultrahdr/blob/1acdbed8c712e6923ebf9de4e7c8d8dda06509e9/LICENSE')]),
  libvips: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/libvips/LICENSE', 26530, 'dc626520dcd53a22f727af3ee42c770e56c97a64fe3adb063799d8ab032fe551', 'https://github.com/libvips/libvips/blob/v8.18.3/LICENSE')]),
  libwebp: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/libwebp/COPYING', 1496, '5aec868f669e384a22372a4e8a1a6cd7d44c64cd451f960ca69cc170d1e13acf', 'https://github.com/webmproject/libwebp/blob/v1.6.0/COPYING')]),
  libxml2: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/libxml2/Copyright', 1314, '5d4873884a890122a4b9b20ad56ac6f7da1d796a5bfcf04a427970ac96217626', 'https://gitlab.gnome.org/GNOME/libxml2/-/blob/v2.15.3/Copyright')]),
  mozjpeg: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/mozjpeg/LICENSE.md', 5620, '96f5b328adbb78eeaaec6980d73fd558cb1e4d62560ed615646bc3cf5e532430', 'https://github.com/mozilla/mozjpeg/blob/08265790774cd0714832c9e675522acbe5581437/LICENSE.md')]),
  pango: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/pango/COPYING', 25292, 'd245807f90032872d1438d741ed21e2490e1175dc8aa3afa5ddb6c8e529b58e5', 'https://gitlab.gnome.org/GNOME/pango/-/blob/1.58.0/COPYING')]),
  pixman: Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/pixman/COPYING', 2087, 'fac9270f0987b96ff4533fca3548c633e02083cbba4a0172a3b149b2e4019793', 'https://gitlab.freedesktop.org/pixman/pixman/-/blob/pixman-0.46.4/COPYING')]),
  'proxy-libintl': Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/proxy-libintl/COPYING', 25292, 'd245807f90032872d1438d741ed21e2490e1175dc8aa3afa5ddb6c8e529b58e5', 'https://github.com/frida/proxy-libintl/blob/0.5/COPYING')]),
  'zlib-ng': Object.freeze([legal('vendor/sharp-libvips/1.3.2/legal/zlib-ng/LICENSE.md', 867, '6c9f0d975b41afaa34d22f55bb8986ce69e5cb7ad327cb2b28820cd425edf5ee', 'https://github.com/zlib-ng/zlib-ng/blob/2.3.3/LICENSE.md')]),
});

// Compatibility name for the notices generator and existing callers. These are upstream files,
// not project-authored attribution summaries.
export const BUNDLED_ATTRIBUTIONS = BUNDLED_LEGAL_FILES;

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
    const manifestBytes = readFileSync(join(root, 'scripts/gate/bundled-components.json'));
    if (sha256(manifestBytes) !== BUNDLED_MANIFEST_SHA256) {
      problems.push(
        `C17 bundled-components.json hashes to ${sha256(manifestBytes)}, the code-owned reviewed `
        + `manifest is ${BUNDLED_MANIFEST_SHA256}`,
      );
    }
    manifest = JSON.parse(manifestBytes.toString('utf8'));
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
  // The package's declared identity must match in full, and the tracked record must agree with
  // the independent code-owned contract. Checking only `version` let a forged name/PURL/licence/
  // author remain internally self-consistent.
  const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
  const actualRepository = String(pkg.repository?.url ?? '')
    .replace(/^git\+/, '').replace(/\.git$/, '');
  const packageFacts = {
    name: pkg.name,
    version: pkg.version,
    declared_license: pkg.license,
    author: pkg.author,
  };
  for (const [field, actual] of Object.entries(packageFacts)) {
    const want = BUNDLED_PACKAGE_CONTRACT[field];
    if (actual !== want) {
      problems.push(`C17 bundled stack: published package ${field} is ${JSON.stringify(actual)}, the code-owned contract requires ${JSON.stringify(want)}`);
    }
    if (manifest.package?.[field] !== want) {
      problems.push(`C17 bundled stack: manifest package.${field} is ${JSON.stringify(manifest.package?.[field])}, the code-owned contract requires ${JSON.stringify(want)}`);
    }
  }
  if (manifest.package?.purl !== BUNDLED_PACKAGE_CONTRACT.purl) {
    problems.push(`C17 bundled stack: manifest package.purl is ${JSON.stringify(manifest.package?.purl)}, the code-owned contract requires ${JSON.stringify(BUNDLED_PACKAGE_CONTRACT.purl)}`);
  }
  if (actualRepository !== BUNDLED_PACKAGE_CONTRACT.repository
    || pkg.repository?.directory !== BUNDLED_PACKAGE_CONTRACT.directory) {
    problems.push(
      `C17 bundled stack: published package repository is ${JSON.stringify(actualRepository)} / `
      + `${JSON.stringify(pkg.repository?.directory)}, expected ${JSON.stringify(BUNDLED_PACKAGE_CONTRACT.repository)} / `
      + `${JSON.stringify(BUNDLED_PACKAGE_CONTRACT.directory)}`,
    );
  }
  for (const [field, want] of [
    ['repository', BUNDLED_PACKAGE_CONTRACT.repository],
    ['directory', BUNDLED_PACKAGE_CONTRACT.directory],
    ['tag', BUNDLED_PACKAGE_CONTRACT.tag],
  ]) {
    if (manifest.build_recipe?.[field] !== want) {
      problems.push(`C17 bundled stack: build_recipe.${field} is ${JSON.stringify(manifest.build_recipe?.[field])}, the code-owned contract requires ${JSON.stringify(want)}`);
    }
  }
  if (manifest.build_recipe?.commit_binding?.commit !== BUNDLED_PACKAGE_CONTRACT.commit) {
    problems.push(
      `C17 bundled stack: build recipe commit is ${JSON.stringify(manifest.build_recipe?.commit_binding?.commit)}, `
      + `the code-owned contract requires ${BUNDLED_PACKAGE_CONTRACT.commit}`,
    );
  }
  for (const [field, want] of Object.entries(BUNDLED_AOM_PATENT_GRANT)) {
    if (manifest.aom_patent_grant?.[field] !== want) {
      problems.push(
        `C17 bundled stack: aom_patent_grant.${field} is ${JSON.stringify(manifest.aom_patent_grant?.[field])}, `
        + `the code-owned contract requires ${JSON.stringify(want)}`,
      );
    }
  }
  if (typeof manifest.aom_patent_grant?.note !== 'string'
    || !/no identifier/i.test(manifest.aom_patent_grant.note)) {
    problems.push('C17 bundled stack: AOM patent grant must explain that no SPDX identifier/text substitutes for the separate grant');
  }
  // Every shipped shared object must be present and digest-equal, in BOTH directions. A
  // manifest listing nothing used to pass because verification iterated only what it declared.
  const declaredLibraries = Array.isArray(manifest.shipped_evidence?.shared_libraries)
    ? manifest.shipped_evidence.shared_libraries : [];
  if (!Array.isArray(manifest.shipped_evidence?.shared_libraries)) {
    problems.push('C17 bundled stack: shipped_evidence.shared_libraries must be an array');
  }
  const actualLibraries = [];
  const enumerateShared = (at, rel = 'lib') => {
    let entries;
    try { entries = readdirSync(at, { withFileTypes: true }); } catch (e) {
      problems.push(`C17 bundled stack: cannot enumerate shared-object directory '${rel}': ${e instanceof Error ? e.message : e}`);
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const abs = join(at, entry.name);
      const child = `${rel}/${entry.name}`;
      let st;
      try { st = lstatSync(abs); } catch (e) {
        problems.push(`C17 bundled stack: cannot inspect package path '${child}': ${e instanceof Error ? e.message : e}`);
        continue;
      }
      if (st.isSymbolicLink()) {
        problems.push(`C17 bundled stack: package path '${child}' is a symlink; shared-object inventory must be regular in-tree files`);
      } else if (st.isDirectory()) {
        enumerateShared(abs, child);
      } else if (/\.so(?:\.|$)/.test(entry.name)) {
        if (!st.isFile()) problems.push(`C17 bundled stack: shared object '${child}' is not a regular file`);
        else actualLibraries.push(child);
      }
    }
  };
  enumerateShared(join(dir, 'lib'));
  const declaredPaths = [];
  const seenLibraryPaths = new Set();
  for (const [i, lib] of declaredLibraries.entries()) {
    const where = `shipped_evidence.shared_libraries[${i}]`;
    if (lib === null || typeof lib !== 'object' || Array.isArray(lib)) {
      problems.push(`C17 bundled stack: ${where} must be an object`);
      continue;
    }
    if (typeof lib.path !== 'string' || !lib.path.startsWith('lib/')
      || lib.path.startsWith('/') || lib.path.split('/').includes('..')) {
      problems.push(`C17 bundled stack: ${where}.path ${JSON.stringify(lib.path)} must be a safe repository-relative path below lib/`);
      continue;
    }
    if (seenLibraryPaths.has(lib.path)) {
      problems.push(`C17 bundled stack: ${where}.path duplicates '${lib.path}'`);
      continue;
    }
    seenLibraryPaths.add(lib.path);
    declaredPaths.push(lib.path);
    if (!Number.isSafeInteger(lib.bytes) || lib.bytes <= 0 || !/^[a-f0-9]{64}$/.test(lib.sha256 ?? '')) {
      problems.push(`C17 bundled stack: ${where} needs positive integer bytes and a lowercase SHA-256 digest`);
    }
  }
  const actualPaths = [...new Set(actualLibraries)].sort();
  declaredPaths.sort();
  if (declaredPaths.join(',') !== actualPaths.join(',')) {
    problems.push(
      `C17 bundled stack shared-object inventory ${JSON.stringify(declaredPaths)} does not equal `
      + `the package bytes ${JSON.stringify(actualPaths)}`,
    );
  }
  for (const lib of declaredLibraries) {
    if (lib === null || typeof lib !== 'object' || typeof lib.path !== 'string'
      || !actualPaths.includes(lib.path)) continue;
    const abs = join(dir, lib.path);
    let st;
    try { st = lstatSync(abs); } catch { st = null; }
    if (st === null || !st.isFile()) {
      problems.push(`C17 bundled stack: shipped library '${lib.path}' is missing or is not a regular file`);
      continue;
    }
    const b = readFileSync(abs);
    if (b.byteLength !== lib.bytes || sha256(b) !== lib.sha256) {
      problems.push(`C17 bundled stack: '${lib.path}' does not match its recorded ${lib.bytes} bytes / ${lib.sha256}`);
    }
  }

  // ── component reconciliation, both directions ──────────────────────────────
  const versions = JSON.parse(versionsBytes.toString('utf8'));
  const rows = readmeRows(readmeBytes.toString('utf8'));
  const readmeNames = new Set(rows.map((r) => r.name));
  if (readmeNames.size !== rows.length) {
    problems.push('C17 bundled stack: shipped README contains duplicate library rows');
  }
  const shippedTerms = [...new Set(rows.map((r) => r.terms))].sort();
  const mappedTerms = Object.keys(BUNDLED_TERM_SPDX).sort();
  if (shippedTerms.join('\n') !== mappedTerms.join('\n')) {
    problems.push(
      `C17 bundled term mapping ${JSON.stringify(mappedTerms)} does not equal the exact shipped `
      + `README term set ${JSON.stringify(shippedTerms)}`,
    );
  }
  const legalNames = Object.keys(BUNDLED_LEGAL_FILES).sort();
  if (legalNames.join(',') !== [...readmeNames].sort().join(',')) {
    problems.push(
      `C17 code-owned bundled legal-file component set ${JSON.stringify(legalNames)} does not equal the shipped `
      + `README component set ${JSON.stringify([...readmeNames].sort())}`,
    );
  }

  // ── exact upstream legal bytes, both directions ───────────────────────────
  // The JSON record is delivered as evidence, but it cannot authenticate itself. Every field is
  // independently code-owned here and every vendored byte is checked before it is emitted.
  const expectedLegalRows = Object.entries(BUNDLED_LEGAL_FILES)
    .flatMap(([component, files]) => files.map((file) => ({ component, ...file })));
  const declaredLegalRows = Array.isArray(manifest.legal_files) ? manifest.legal_files : [];
  if (!Array.isArray(manifest.legal_files)) {
    problems.push('C17 bundled stack: legal_files must be an array');
  }
  const expectedLegalKeys = new Set(expectedLegalRows.map((r) => `${r.component}|${r.path}`));
  const declaredLegal = new Map();
  for (const [i, row] of declaredLegalRows.entries()) {
    const where = `legal_files[${i}]`;
    if (row === null || typeof row !== 'object' || Array.isArray(row)) {
      problems.push(`C17 bundled stack: ${where} must be an object`);
      continue;
    }
    const fields = Object.keys(row).sort();
    const expectedFields = ['bytes', 'component', 'path', 'role', 'sha256', 'source_url'];
    if (fields.join(',') !== expectedFields.join(',')) {
      problems.push(`C17 bundled stack: ${where} fields ${JSON.stringify(fields)} do not equal ${JSON.stringify(expectedFields)}`);
    }
    if (typeof row.component !== 'string' || typeof row.path !== 'string') {
      problems.push(`C17 bundled stack: ${where} must name a component and path`);
      continue;
    }
    const key = `${row.component}|${row.path}`;
    if (declaredLegal.has(key)) {
      problems.push(`C17 bundled stack: legal-file record '${key}' appears more than once`);
      continue;
    }
    declaredLegal.set(key, row);
    if (!expectedLegalKeys.has(key)) {
      problems.push(`C17 bundled stack: surplus legal-file record '${key}' is not code-owned`);
    }
  }
  const declaredLegalNames = [...new Set(declaredLegalRows
    .filter((r) => r !== null && typeof r === 'object' && typeof r.component === 'string')
    .map((r) => r.component))].sort();
  if (declaredLegalNames.join(',') !== [...readmeNames].sort().join(',')) {
    problems.push(
      `C17 manifest legal-file component set ${JSON.stringify(declaredLegalNames)} does not equal `
      + `the shipped README component set ${JSON.stringify([...readmeNames].sort())}`,
    );
  }

  const legalEvidence = new Map();
  for (const expected of expectedLegalRows) {
    const key = `${expected.component}|${expected.path}`;
    const declared = declaredLegal.get(key);
    if (declared === undefined) {
      problems.push(`C17 bundled stack: code-owned legal-file record '${key}' is missing from the manifest`);
    } else {
      for (const field of ['bytes', 'sha256', 'source_url', 'role']) {
        if (declared[field] !== expected[field]) {
          problems.push(
            `C17 bundled stack: legal-file record '${key}' ${field} is ${JSON.stringify(declared[field])}, `
            + `the code-owned value is ${JSON.stringify(expected[field])}`,
          );
        }
      }
    }

    // Walk every intermediate from the repository root. A symlinked vendor directory must not
    // redirect a code-owned path to attacker bytes with a coincidentally rebound manifest.
    const segments = expected.path.split('/');
    let at = root;
    let pathSafe = true;
    for (const [segmentIndex, segment] of segments.entries()) {
      at = join(at, segment);
      let st;
      try { st = lstatSync(at); } catch (e) {
        problems.push(`C17 bundled legal file '${expected.path}' is missing: ${e instanceof Error ? e.message : e}`);
        pathSafe = false;
        break;
      }
      if (st.isSymbolicLink()) {
        problems.push(`C17 bundled legal path '${expected.path}' has symlinked segment '${segments.slice(0, segmentIndex + 1).join('/')}'`);
        pathSafe = false;
        break;
      }
      if (segmentIndex < segments.length - 1 && !st.isDirectory()) {
        problems.push(`C17 bundled legal path '${expected.path}' has non-directory intermediate '${segments.slice(0, segmentIndex + 1).join('/')}'`);
        pathSafe = false;
        break;
      }
      if (segmentIndex === segments.length - 1 && !st.isFile()) {
        problems.push(`C17 bundled legal file '${expected.path}' is not a regular file`);
        pathSafe = false;
      }
    }
    if (!pathSafe) continue;
    const bytes = readFileSync(at);
    const actualSha = sha256(bytes);
    if (bytes.byteLength !== expected.bytes || actualSha !== expected.sha256) {
      problems.push(
        `C17 bundled legal file '${expected.path}' is ${bytes.byteLength} bytes / ${actualSha}, `
        + `the code-owned upstream file is ${expected.bytes} bytes / ${expected.sha256}`,
      );
    }
    if (!legalEvidence.has(expected.component)) legalEvidence.set(expected.component, []);
    legalEvidence.get(expected.component).push({ ...expected, text: bytes.toString('utf8') });
  }

  // There may be no unbound file hiding beside the reviewed set. Enumerate the vendor closure in
  // the opposite direction; this also makes a newly-added legal sidecar a blocking review event.
  const vendorLegalRoot = join(root, 'vendor', 'sharp-libvips', '1.3.2', 'legal');
  const actualLegalPaths = [];
  const enumerateLegal = (at, rel = 'vendor/sharp-libvips/1.3.2/legal') => {
    let entries;
    try { entries = readdirSync(at, { withFileTypes: true }); } catch (e) {
      problems.push(`C17 bundled legal root cannot be enumerated: ${e instanceof Error ? e.message : e}`);
      return;
    }
    for (const entry of entries.sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const abs = join(at, entry.name);
      const child = `${rel}/${entry.name}`;
      let st;
      try { st = lstatSync(abs); } catch (e) {
        problems.push(`C17 bundled legal path '${child}' cannot be inspected: ${e instanceof Error ? e.message : e}`);
        continue;
      }
      if (st.isSymbolicLink()) problems.push(`C17 bundled legal path '${child}' is a symlink`);
      else if (st.isDirectory()) enumerateLegal(abs, child);
      else if (st.isFile()) actualLegalPaths.push(child);
      else problems.push(`C17 bundled legal path '${child}' is not a regular file or directory`);
    }
  };
  enumerateLegal(vendorLegalRoot);
  const expectedLegalPaths = expectedLegalRows.map((r) => r.path).sort();
  actualLegalPaths.sort();
  if (actualLegalPaths.join('\n') !== expectedLegalPaths.join('\n')) {
    problems.push(
      `C17 bundled vendor legal-file set ${JSON.stringify(actualLegalPaths)} does not equal `
      + `the exact code-owned set ${JSON.stringify(expectedLegalPaths)}`,
    );
  }
  const components = Array.isArray(manifest.bundled_components) ? manifest.bundled_components : [];

  const seen = new Set();
  const obligations = [];
  for (const c of components) {
    if (typeof c.name !== 'string' || c.name === '') { problems.push('C17 bundled component with no name'); continue; }
    if (seen.has(c.name)) { problems.push(`C17 bundled component '${c.name}' appears more than once`); continue; }
    seen.add(c.name);
    if (!readmeNames.has(c.name)) {
      problems.push(`C17 bundled component '${c.name}' is not named by the shipped README`);
    }
    const evidence = legalEvidence.get(c.name) ?? [];
    if (evidence.length === 0) {
      problems.push(`C17 bundled component '${c.name}' has no verified upstream legal bytes`);
    }
    const attribution = {
      legal_files: evidence.map(({ text: _text, ...record }) => record),
      source: evidence.map((record) => record.source_url).join(' ; '),
      // Existing notices rendering consumes this field. It now contains the complete upstream
      // files with deterministic boundaries, never a project-authored or truncated summary.
      notice: evidence.map((record) => (
        `===== BEGIN UPSTREAM LEGAL FILE ${record.path} (${record.role}) =====\n`
        + `${record.text}${record.text.endsWith('\n') ? '' : '\n'}`
        + `===== END UPSTREAM LEGAL FILE ${record.path} =====`
      )).join('\n\n'),
    };
    const row = rows.find((r) => r.name === c.name);
    if (row !== undefined && row.terms !== c.declared_terms_upstream) {
      problems.push(
        `C17 bundled component '${c.name}' records terms ${JSON.stringify(c.declared_terms_upstream)}, `
        + `the shipped README says ${JSON.stringify(row.terms)}`,
      );
    }
    if (row !== undefined) {
      const expectedExpression = BUNDLED_TERM_SPDX[row.terms];
      if (expectedExpression === undefined) {
        problems.push(`C17 bundled component '${c.name}' has shipped terms with no code-owned SPDX mapping: ${JSON.stringify(row.terms)}`);
      } else if (c.spdx_expression !== expectedExpression) {
        problems.push(
          `C17 bundled component '${c.name}' maps ${JSON.stringify(row.terms)} to `
          + `${JSON.stringify(c.spdx_expression)}, the code-owned mapping requires ${JSON.stringify(expectedExpression)}`,
        );
      }
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
    const parsed = parseSpdxExpression(c.spdx_expression);
    if (!parsed.ok) {
      problems.push(`C17 bundled component '${c.name}' has invalid SPDX expression: ${parsed.error}`);
      continue;
    }
    const rules = [];
    for (const id of parsed.ids) {
      const rule = OBLIGATION_TABLE[id];
      if (rule === undefined) {
        problems.push(`C17 bundled component '${c.name}' names ${id}, which has no code-owned obligation rule`);
        continue;
      }
      if (!texts.has(id)) {
        problems.push(`C17 bundled component '${c.name}' names ${id}, for which no canonical text is available to reproduce`);
      }
      rules.push({ id, ...rule });
    }
    obligations.push({
      component: c.name,
      spdx_expression: c.spdx_expression,
      ids: parsed.ids,
      categories: [...new Set(rules.map((r) => r.category))].sort(),
      requires_notice: rules.some((r) => r.notice),
      requires_source_offer: rules.some((r) => r.source_offer),
      requires_modification_notice: rules.some((r) => r.modification_notice),
      attribution,
    });
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
  const sourceOfferRows = Array.isArray(manifest.source_offers) ? manifest.source_offers : [];
  if (!Array.isArray(manifest.source_offers)) {
    problems.push('C17 bundled stack: source_offers must be an array');
  }
  const offers = new Map();
  for (const [i, offer] of sourceOfferRows.entries()) {
    if (offer === null || typeof offer !== 'object' || Array.isArray(offer)
      || typeof offer.component !== 'string' || offer.component === '') {
      problems.push(`C17 bundled source_offers[${i}] must be an object naming a component`);
      continue;
    }
    if (offers.has(offer.component)) {
      problems.push(`C17 bundled source offer for '${offer.component}' appears more than once`);
      continue;
    }
    offers.set(offer.component, offer);
  }
  const sourceRequired = obligations.filter((o) => o.requires_source_offer);
  const requiredSourceNames = sourceRequired.map((o) => o.component).sort();
  const declaredSourceNames = [...offers.keys()].sort();
  const codeOwnedSourceNames = Object.keys(BUNDLED_SOURCE_UPSTREAM).sort();
  if (declaredSourceNames.join(',') !== requiredSourceNames.join(',')) {
    problems.push(
      `C17 bundled source-offer set ${JSON.stringify(declaredSourceNames)} does not equal the `
      + `obligation-derived set ${JSON.stringify(requiredSourceNames)}`,
    );
  }
  if (codeOwnedSourceNames.join(',') !== requiredSourceNames.join(',')) {
    problems.push(
      `C17 code-owned bundled source set ${JSON.stringify(codeOwnedSourceNames)} does not equal `
      + `the obligation-derived set ${JSON.stringify(requiredSourceNames)}`,
    );
  }
  for (const obligation of sourceRequired) {
    const c = components.find((candidate) => candidate.name === obligation.component);
    const o = offers.get(c.name);
    if (o === undefined) {
      problems.push(`C17 bundled component '${c.name}' is ${c.spdx_expression} and has NO source offer`);
      continue;
    }
    const expectedUpstream = BUNDLED_SOURCE_UPSTREAM[c.name];
    if (o.upstream_source !== expectedUpstream) {
      problems.push(
        `C17 source offer for '${c.name}' names upstream ${JSON.stringify(o.upstream_source)}, `
        + `the code-owned source is ${JSON.stringify(expectedUpstream)}`,
      );
    }
    if (o.spdx_expression !== c.spdx_expression) {
      problems.push(
        `C17 source offer for '${c.name}' covers ${JSON.stringify(o.spdx_expression)}, `
        + `the component is ${JSON.stringify(c.spdx_expression)}`,
      );
    }
    if (typeof o.obligation !== 'string' || !/weak-copyleft source offer/.test(o.obligation)) {
      problems.push(`C17 source offer for '${c.name}' does not identify the weak-copyleft obligation it discharges`);
    }
    if (!Array.isArray(o.obtain) || o.obtain.length === 0
      || o.obtain.some((step) => typeof step !== 'string' || step.trim() === '')) {
      problems.push(`C17 source offer for '${c.name}' says nothing about how to obtain the source`);
    } else {
      const instructions = o.obtain.join('\n');
      for (const required of [String(c.version), expectedUpstream, BUNDLED_PACKAGE_CONTRACT.commit, BUNDLED_PACKAGE_CONTRACT.directory]) {
        if (!instructions.includes(required)) {
          problems.push(`C17 source offer for '${c.name}' obtain instructions omit ${JSON.stringify(required)}`);
        }
      }
    }
    if (typeof o.relinking !== 'string' || o.relinking.trim() === '') {
      problems.push(`C17 source offer for '${c.name}' has no modification/relinking statement`);
    }
    if (o.version !== c.version) {
      problems.push(`C17 source offer for '${c.name}' is for version ${JSON.stringify(o.version)}, the component is ${JSON.stringify(c.version)}`);
    }
  }
  // The build recipe must be pinned to an immutable commit.
  const cb = manifest.build_recipe?.commit_binding;
  if (cb === undefined || !/^[0-9a-f]{40}$/.test(cb.commit ?? '')) {
    problems.push('C17 bundled stack: the build recipe is not bound to an immutable 40-hex commit');
  }

  notes.push(
    `bundled_components=${components.length} readme_rows=${rows.length} `
    + `versions_keys=${Object.keys(versions).length} source_offers=${offers.size} source_required=${sourceRequired.length}`,
  );
  return {
    ok: problems.length === 0, problems, notes, manifest, obligations,
    componentCount: components.length,
  };
}
