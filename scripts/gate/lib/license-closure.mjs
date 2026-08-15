/**
 * C17 §4/§5 — DETERMINISTIC, TARGET-SPECIFIC LICENCE INVENTORY AND OBLIGATIONS.
 *
 * ── WHERE THE TRUTH COMES FROM ───────────────────────────────────────────────────
 * Two independent sources, joined and reconciled against each other:
 *   1. the C16 lockfile-derived closure — WHICH components belong to a target;
 *   2. the packages pnpm actually materialized under `node_modules/.pnpm` from a frozen
 *      install — WHAT each of those components declares and ships.
 *
 * The SBOM is never consulted. Deriving licence facts from the document under validation would
 * make the inventory agree with it by construction, which is the same defect the gate spent
 * five rounds removing from the security evidence.
 *
 * ── WHAT IS A FACT AND WHAT IS A CONCLUSION ──────────────────────────────────────
 * Three layers are kept apart on purpose, because collapsing them is how a scanner's guess
 * becomes a legal claim:
 *   * DETECTED FACTS — the exact `license`/`licenses` field bytes, the manifest digest, the
 *     licence and notice files found in the package and their digests, the copyright lines
 *     read out of those files. No interpretation.
 *   * MECHANICAL OBLIGATIONS — what a given SPDX id implies, from one code-owned table.
 *     Mechanical, reviewable, and explicitly not advice.
 *   * UNRESOLVED — anything the table does not cover, anything absent, anything
 *     self-contradictory. These FAIL CLOSED. They are surfaced for a human, never guessed.
 *
 * Nothing here is legal advice, and the generated artifacts say so.
 */
import { readFileSync, readdirSync, existsSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

import parseSpdx from 'spdx-expression-parse';

const sha256 = (b) => createHash('sha256').update(b).digest('hex');

/**
 * The code-owned obligation table. Keyed by SPDX id; every id the inventory may classify
 * without human review must appear here. An id NOT in this table is unresolved, never
 * "probably fine".
 */
export const OBLIGATION_TABLE = Object.freeze({
  MIT: { category: 'permissive-notice', notice: true, source_offer: false, modification_notice: false },
  'MIT-0': { category: 'permissive-no-notice', notice: false, source_offer: false, modification_notice: false },
  ISC: { category: 'permissive-notice', notice: true, source_offer: false, modification_notice: false },
  'BSD-2-Clause': { category: 'permissive-notice', notice: true, source_offer: false, modification_notice: false },
  'BSD-3-Clause': { category: 'permissive-notice', notice: true, source_offer: false, modification_notice: false },
  '0BSD': { category: 'permissive-no-notice', notice: false, source_offer: false, modification_notice: false },
  'Apache-2.0': { category: 'permissive-notice-patent', notice: true, source_offer: false, modification_notice: true },
  'BlueOak-1.0.0': { category: 'permissive-notice', notice: true, source_offer: false, modification_notice: false },
  Unlicense: { category: 'public-domain', notice: false, source_offer: false, modification_notice: false },
  'CC0-1.0': { category: 'public-domain', notice: false, source_offer: false, modification_notice: false },
  'CC-BY-4.0': { category: 'attribution', notice: true, source_offer: false, modification_notice: true },
  'CC-BY-3.0': { category: 'attribution', notice: true, source_offer: false, modification_notice: true },
  'Python-2.0': { category: 'permissive-notice', notice: true, source_offer: false, modification_notice: true },
  'LGPL-2.1-or-later': { category: 'weak-copyleft', notice: true, source_offer: true, modification_notice: true },
  'LGPL-3.0-or-later': { category: 'weak-copyleft', notice: true, source_offer: true, modification_notice: true },
  'MPL-2.0': { category: 'weak-copyleft-file', notice: true, source_offer: true, modification_notice: true },
});

/** Human-readable obligations per category, kept beside the table so they cannot drift. */
export const CATEGORY_OBLIGATIONS = Object.freeze({
  'permissive-no-notice': ['No attribution obligation is imposed by the licence text.'],
  'public-domain': ['No attribution obligation is imposed by the dedication.'],
  'permissive-notice': [
    'Reproduce the copyright notice and the licence text in distributed materials.',
  ],
  'permissive-notice-patent': [
    'Reproduce the copyright notice, the licence text and any NOTICE file in distributed materials.',
    'State significant changes made to the licensed files.',
    'Note the express patent grant and its termination-on-litigation condition.',
  ],
  attribution: [
    'Give attribution to the author as specified by the licence.',
    'Indicate whether the material was modified.',
    'Retain the licence notice and any disclaimer.',
  ],
  'weak-copyleft': [
    'Reproduce the copyright notice and the licence text.',
    'Offer the corresponding source of the licensed component to recipients.',
    'Permit reverse engineering for debugging modifications, and allow the component to be replaced.',
    'State significant changes made to the licensed files.',
  ],
  'weak-copyleft-file': [
    'Reproduce the copyright notice and the licence text.',
    'Offer the corresponding source of any modified licensed FILE to recipients.',
    'State significant changes made to the licensed files.',
  ],
});

const LICENCE_FILE = /^(LICEN[CS]E|COPYING|NOTICE|AUTHORS|COPYRIGHT)([-._].*)?$/i;
const COPYRIGHT_LINE = /^.*copyright.*$/gim;

/**
 * C17.1 B3 — a REAL SPDX expression parser.
 *
 * The previous implementation split on whitespace around OR/AND/WITH. That accepts anything:
 * `NOT-A-LICENCE` is a single token and became an "id", `MIT OR` parsed as `['MIT']`, and
 * `Apache-2.0 WITH Nope-exception` yielded a fabricated exception. Identifier validity was then
 * checked against the obligation table, so an unknown id landed in `unclassified_licence` —
 * correct by accident for that one case, and wrong for malformed grammar and bad exceptions.
 *
 * `spdx-expression-parse@5.0.0` (exact-pinned) validates the grammar AND the identifier register,
 * and throws on an invalid exception. A throw is a hard failure here: an expression this parser
 * cannot read is not an expression we may interpret.
 */
export function spdxIds(expression) {
  const r = parseSpdxExpression(expression);
  return r.ok ? r.ids : [];
}

/** Parse an SPDX expression, reporting WHY it failed rather than swallowing it. */
export function parseSpdxExpression(expression) {
  if (typeof expression !== 'string' || expression.trim() === '') {
    return { ok: false, ids: [], exceptions: [], error: 'no licence expression' };
  }
  let ast;
  try {
    ast = parseSpdx(expression.trim());
  } catch (e) {
    return {
      ok: false, ids: [], exceptions: [],
      error: `not a valid SPDX expression: ${e instanceof Error ? e.message : e}`,
    };
  }
  const ids = new Set();
  const exceptions = new Set();
  let disjunctive = false;
  const walk = (n) => {
    if (n === null || typeof n !== 'object') return;
    if (typeof n.license === 'string') {
      ids.add(n.license + (n.plus === true ? '+' : ''));
      if (typeof n.exception === 'string') exceptions.add(n.exception);
      return;
    }
    if (typeof n.conjunction === 'string') {
      if (n.conjunction === 'or') disjunctive = true;
      walk(n.left);
      walk(n.right);
    }
  };
  walk(ast);
  if (ids.size === 0) {
    return { ok: false, ids: [], exceptions: [], error: 'expression names no licence identifier' };
  }
  return { ok: true, ids: [...ids].sort(), exceptions: [...exceptions].sort(), disjunctive };
}

/**
 * C17.1 B2 — CONTRADICTORY licence evidence.
 *
 * A manifest saying `MIT` while shipping the GPLv3 text is not an MIT package; it is a package
 * whose evidence disagrees with itself, and classifying it as MIT would launder that. Detection
 * is deterministic and reviewable: one code-owned table of phrases that appear in a licence
 * FAMILY's own text and in no other family's. If a shipped file matches a family the declared
 * expression does not name, the component becomes `contradictory_licence` and fails closed.
 *
 * The table is deliberately conservative. It is used to detect DISAGREEMENT, never to infer a
 * licence: a file matching nothing recognisable is not a contradiction, because absence of a
 * marker is not evidence of a different licence.
 *
 * ── WHY THE TITLE POSITION MATTERS ───────────────────────────────────────────────
 * A first attempt matched the markers anywhere in the file and produced three FALSE POSITIVES on
 * the real tree, each instructive:
 *   * `lightningcss@1.33.0` and its native binary declare MPL-2.0, and the MPL's own text names
 *     the GNU GPL as a compatible Secondary License in §3.3 and Exhibit B. Mentioning a licence
 *     is not being under it.
 *   * `vite@8.2.0` declares MIT and ships a LICENSE.md that BUNDLES its vendored dependencies'
 *     licences, several Apache-2.0. A bundle of other people's notices is not a redeclaration.
 * So the marker must appear as the file's own TITLE — on a short line near the top, which is
 * where a licence states what it is — rather than anywhere in the body.
 */
export const FAMILY_MARKERS = Object.freeze([
  { family: 'GPL', pattern: /GNU GENERAL PUBLIC LICENSE/i },
  { family: 'LGPL', pattern: /GNU LESSER GENERAL PUBLIC LICENSE/i },
  { family: 'AGPL', pattern: /GNU AFFERO GENERAL PUBLIC LICENSE/i },
  { family: 'MPL', pattern: /Mozilla Public License Version/i },
  { family: 'Apache', pattern: /Apache License\s*,?\s*Version 2\.0/i },
  { family: 'CC-BY', pattern: /Creative Commons Attribution/i },
  { family: 'Python', pattern: /PYTHON SOFTWARE FOUNDATION LICENSE/i },
]);

/** Which family a declared SPDX id belongs to, where the id names one at all. */
export function familyOf(id) {
  if (/^AGPL-/i.test(id)) return 'AGPL';
  if (/^LGPL-/i.test(id)) return 'LGPL';
  if (/^GPL-/i.test(id)) return 'GPL';
  if (/^MPL-/i.test(id)) return 'MPL';
  if (/^Apache-/i.test(id)) return 'Apache';
  if (/^CC-BY/i.test(id)) return 'CC-BY';
  if (/^Python-/i.test(id)) return 'Python';
  return null;
}

/** Families the shipped text positively identifies AS ITS OWN, by title position. */
export function familiesInText(text) {
  const found = new Set();
  // The head of the file only, and only lines short enough to be a heading rather than prose
  // that happens to name another licence.
  const head = text.split(/\r?\n/).slice(0, 12);
  for (const raw of head) {
    const line = raw.trim().replace(/^#+\s*/, '');
    if (line.length === 0 || line.length > 80) continue;
    for (const { family, pattern } of FAMILY_MARKERS) {
      if (pattern.test(line)) found.add(family);
    }
  }
  return [...found].sort();
}

/**
 * Where pnpm materialized a given name@version, if it did.
 *
 * The store directory is `<name>@<version>` with `/` encoded as `+`, but a package with peer
 * dependencies gets a PEER SUFFIX appended (`@nestjs+common@11.1.28_reflect-metadata@0.2.2_...`).
 * An exact-name lookup therefore misses every peer-bearing package — which is most of the
 * interesting ones. The directory listing is read once and indexed by prefix.
 */
let storeIndex = null;
function storeEntries(root) {
  if (storeIndex !== null) return storeIndex;
  const dir = join(root, 'node_modules', '.pnpm');
  let names = [];
  try { names = readdirSync(dir); } catch { names = []; }
  storeIndex = { dir, names: names.sort() };
  return storeIndex;
}
export function resetStoreIndex() { storeIndex = null; }

function storeDir(root, name, version) {
  const encoded = `${name.replace(/\//g, '+')}@${version}`;
  const { dir, names } = storeEntries(root);
  const exact = join(dir, encoded, 'node_modules', name);
  if (existsSync(exact)) return exact;
  // Peer-suffixed: `<encoded>_<peer>@<ver>_...`. The suffix is separated by `_`, which cannot
  // appear at that position in a bare name@version, so the prefix test is unambiguous.
  for (const entry of names) {
    if (!entry.startsWith(`${encoded}_`)) continue;
    const candidate = join(dir, entry, 'node_modules', name);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Read the licence/notice files a package ships, with a digest for each. */
function licenceFiles(dir) {
  const out = [];
  let entries = [];
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries.sort()) {
    if (!LICENCE_FILE.test(name)) continue;
    const abs = join(dir, name);
    let st = null;
    try { st = lstatSync(abs); } catch { st = null; }
    if (st === null || !st.isFile()) continue;
    const bytes = readFileSync(abs);
    const text = bytes.toString('utf8');
    out.push({
      file: name,
      bytes: bytes.byteLength,
      sha256: sha256(bytes),
      // C17.1 C — every copyright line, not the first eight. A distribution obligation is not
      // satisfied by a sample of the notices it requires.
      copyright: [...new Set((text.match(COPYRIGHT_LINE) ?? []).map((l) => l.trim()))],
      families: familiesInText(text),
      text,
    });
  }
  return out;
}

/**
 * Build the inventory for ONE target closure.
 *
 * Workspace components are handled separately and honestly: they are this repository's own
 * first-party packages, they are not published to a registry and they carry no third-party
 * obligation. They are recorded as such rather than being silently dropped (which would hide a
 * component) or classified as unresolved (which would be false).
 */
export function buildTargetInventory({ root, target, closure }) {
  const components = [];
  const unresolved = [];
  for (const node of [...closure.nodes.values()].sort((a, b) => (a.bomRef < b.bomRef ? -1 : 1))) {
    const base = {
      target,
      bom_ref: node.bomRef,
      purl: node.purl,
      name: node.name,
      version: node.version,
      lock_key: node.lockKey ?? null,
      peer_context: node.peerContext === '' ? null : node.peerContext,
      kind: node.kind,
    };
    if (node.kind === 'workspace') {
      components.push({
        ...base,
        first_party: true,
        declared_license: null,
        spdx_ids: [],
        obligation_category: 'first-party',
        manifest_sha256: null,
        licence_files: [],
        evidence_provenance: 'workspace package of this repository; not published, no third-party obligation',
      });
      continue;
    }
    const dir = storeDir(root, node.name, node.version);
    if (dir === null) {
      // Say WHY, precisely. A platform-gated optional package (`@next/swc-linux-x64-gnu`) is
      // absent because the host is not linux-x64 — it is not missing from the lockfile, and a
      // reviewer must not be left to guess which of those two it is. The declared targets are
      // linux-x64-glibc, so an authoritative inventory can only be produced on such a host.
      const decl = [
        Array.isArray(node.os) && node.os.length > 0 ? `os=${node.os.join('|')}` : null,
        Array.isArray(node.cpu) && node.cpu.length > 0 ? `cpu=${node.cpu.join('|')}` : null,
        Array.isArray(node.libc) && node.libc.length > 0 ? `libc=${node.libc.join('|')}` : null,
      ].filter(Boolean).join(' ');
      unresolved.push({
        ...base,
        issue: 'not_materialized',
        detail: `no materialized package under node_modules/.pnpm on this host `
          + `(${process.platform}/${process.arch})`
          + (decl === '' ? '' : `; the package declares ${decl}`)
          + '. The declared C16 targets are linux-x64-glibc, so a complete inventory requires a '
          + 'linux-x64 host — which is where the authoritative run happens.',
      });
      continue;
    }
    const manifestPath = join(dir, 'package.json');
    if (!existsSync(manifestPath)) {
      unresolved.push({ ...base, issue: 'no_manifest', detail: `${dir} has no package.json` });
      continue;
    }
    const manifestBytes = readFileSync(manifestPath);
    let manifest;
    try {
      manifest = JSON.parse(manifestBytes.toString('utf8'));
    } catch (e) {
      unresolved.push({ ...base, issue: 'unparseable_manifest', detail: String(e).slice(0, 120) });
      continue;
    }
    // C17.1 B1 — the materialized package must BE the component before its licence is trusted.
    // A store directory named `foo@1.0.0` holding a manifest that says `attacker@9.9.9` would
    // otherwise contribute that package's licence, notices and copyright under this component's
    // identity. The directory name is a filesystem fact; the manifest is the package's own claim.
    if (manifest.name !== node.name || manifest.version !== node.version) {
      unresolved.push({
        ...base,
        issue: 'identity_mismatch',
        detail: `the materialized package at ${dir} declares `
          + `${JSON.stringify(manifest.name)}@${JSON.stringify(manifest.version)}, but the C16 `
          + `closure resolves ${node.name}@${node.version}`,
      });
      continue;
    }
    // DETECTED FACT: the exact declared field, in whichever of the two shapes npm allows.
    let declared = null;
    if (typeof manifest.license === 'string') declared = manifest.license;
    else if (manifest.license && typeof manifest.license === 'object' && typeof manifest.license.type === 'string') {
      declared = manifest.license.type;
    } else if (Array.isArray(manifest.licenses)) {
      const ids = manifest.licenses.map((l) => (typeof l === 'string' ? l : l?.type)).filter(Boolean);
      declared = ids.length > 1 ? `(${ids.join(' OR ')})` : (ids[0] ?? null);
    }
    const files = licenceFiles(dir);
    const parsed = parseSpdxExpression(declared);
    // C17.1 C — attribution needs a NAMED party. An attribution licence (CC-BY) requires
    // crediting the author as specified, and C17 printed the obligation without ever recording
    // who the author was. npm allows the field as a string or an object, so both are read.
    const personName = (v) => {
      if (typeof v === 'string') return v;
      if (v !== null && typeof v === 'object' && typeof v.name === 'string') {
        return v.email ? `${v.name} <${v.email}>` : v.name;
      }
      return null;
    };
    const attribution = {
      author: personName(manifest.author),
      contributors: (Array.isArray(manifest.contributors) ? manifest.contributors : [])
        .map(personName).filter(Boolean),
      homepage: typeof manifest.homepage === 'string' ? manifest.homepage : null,
      repository: typeof manifest.repository === 'string'
        ? manifest.repository
        : (manifest.repository?.url ?? null),
    };
    const record = {
      ...base,
      first_party: false,
      declared_license: declared,
      spdx_ids: parsed.ok ? parsed.ids : [],
      spdx_exceptions: parsed.ok ? parsed.exceptions : [],
      manifest_sha256: sha256(manifestBytes),
      attribution,
      licence_files: files,
      copyright: [...new Set(files.flatMap((f) => f.copyright))].sort(),
      evidence_provenance: `package.json + ${files.length} licence/notice file(s) read from the `
        + 'materialized package under node_modules/.pnpm',
    };
    if (declared === null || declared.trim() === '') {
      unresolved.push({ ...record, issue: 'no_declared_licence', detail: 'the package declares no licence' });
      continue;
    }
    if (!parsed.ok) {
      unresolved.push({ ...record, issue: 'unclassified_licence', detail: `'${declared}' is ${parsed.error}` });
      continue;
    }
    // B2: shipped text that positively identifies another family contradicts the declaration.
    const declaredFamilies = new Set(parsed.ids.map(familyOf).filter(Boolean));
    const shippedFamilies = [...new Set(files.flatMap((f) => f.families))];
    const conflicting = shippedFamilies.filter((f) => !declaredFamilies.has(f));
    if (shippedFamilies.length > 0 && conflicting.length > 0) {
      unresolved.push({
        ...record,
        issue: 'contradictory_licence',
        detail: `declares '${declared}' but its shipped licence text identifies `
          + `${conflicting.join(', ')} (files: ${files.filter((f) => f.families.some((x) => conflicting.includes(x))).map((f) => f.file).join(', ')})`,
      });
      continue;
    }
    const ids = record.spdx_ids;
    const unknown = ids.filter((id) => !Object.prototype.hasOwnProperty.call(OBLIGATION_TABLE, id));
    if (ids.length === 0 || unknown.length > 0) {
      unresolved.push({
        ...record,
        issue: 'unclassified_licence',
        detail: ids.length === 0
          ? `'${declared}' yields no SPDX identifier`
          : `no obligation-table entry for ${unknown.join(', ')}`,
      });
      continue;
    }
    // MECHANICAL: the union of what every named id requires. A disjunction ("A OR B") is
    // deliberately treated as requiring BOTH until a human records which limb was chosen —
    // choosing a limb is a legal decision, not a mechanical one.
    const cats = ids.map((id) => OBLIGATION_TABLE[id]);
    record.obligation_category = [...new Set(cats.map((c) => c.category))].sort().join('+');
    record.obligations = [...new Set(cats.flatMap((c) => CATEGORY_OBLIGATIONS[c.category] ?? []))].sort();
    record.requires_notice = cats.some((c) => c.notice);
    record.requires_source_offer = cats.some((c) => c.source_offer);
    record.requires_modification_notice = cats.some((c) => c.modification_notice);
    record.alternative_licences = ids.length > 1 && /\sOR\s/i.test(declared);
    // A package that DECLARES a known SPDX id but ships no licence file is not an unknown
    // licence — the licence is known exactly. What is missing is the text to reproduce, and the
    // mechanical consequence is that the notice must carry the canonical SPDX text instead of a
    // shipped file. Recorded as such, so the notices file states where its text came from,
    // rather than being failed as "unclassified" (false) or passed silently (worse).
    record.notice_text_source = files.length > 0 ? 'package-file' : 'spdx-canonical';
    if (record.requires_notice && files.length === 0) {
      record.obligations = [...record.obligations,
        `The package ships no licence file; the canonical ${record.spdx_ids.join('/')} text must be `
        + 'reproduced from the SPDX register, and any copyright line taken from its manifest.'];
    }
    components.push(record);
  }
  return { target, components, unresolved };
}

/** Bidirectional reconciliation of an inventory against the closure it claims to describe. */
export function reconcileInventory({ target, inventory, closure }) {
  const problems = [];
  // Identity is the bomRef, NOT the PURL: two nodes can share a PURL while differing in peer
  // context (`ajv-formats@3.0.1` resolves against two different `ajv` versions), and keying on
  // the PURL would report the second as a duplicate and hide one of them.
  const byRef = new Map();
  for (const n of closure.nodes.values()) byRef.set(n.bomRef, n);
  const seen = new Map();
  for (const c of [...inventory.components, ...inventory.unresolved]) {
    if (seen.has(c.bom_ref)) problems.push(`C17 ${target} inventory lists ${c.bom_ref} more than once`);
    seen.set(c.bom_ref, c);
  }
  for (const [ref, node] of byRef) {
    const c = seen.get(ref);
    if (c === undefined) {
      problems.push(`C17 ${target} inventory is MISSING ${ref}, which the C16 closure contains`);
      continue;
    }
    if (c.version !== node.version) {
      problems.push(`C17 ${target} inventory has ${ref} at ${c.version}, the closure resolves ${node.version}`);
    }
    if (c.purl !== node.purl) {
      problems.push(`C17 ${target} inventory has ${ref} with PURL ${c.purl}, the closure derives ${node.purl}`);
    }
    if (c.target !== target) {
      problems.push(`C17 ${target} inventory contains a record targeted at ${c.target} — target leakage`);
    }
  }
  for (const ref of seen.keys()) {
    if (!byRef.has(ref)) {
      problems.push(`C17 ${target} inventory contains EXTRA ${ref}, absent from the C16 closure`);
    }
  }
  return problems;
}
