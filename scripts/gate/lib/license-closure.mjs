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

/** Split an SPDX expression into the ids it names. Deliberately syntactic, never semantic. */
export function spdxIds(expression) {
  if (typeof expression !== 'string' || expression.trim() === '') return [];
  return [...new Set(
    expression
      .replace(/[()]/g, ' ')
      .split(/\s+(?:OR|AND|WITH)\s+/i)
      .map((t) => t.trim())
      .filter((t) => t.length > 0 && !/^(OR|AND|WITH)$/i.test(t)),
  )];
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
      copyright: [...new Set((text.match(COPYRIGHT_LINE) ?? []).map((l) => l.trim()))].slice(0, 8),
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
    const record = {
      ...base,
      first_party: false,
      declared_license: declared,
      spdx_ids: spdxIds(declared),
      manifest_sha256: sha256(manifestBytes),
      licence_files: files,
      copyright: [...new Set(files.flatMap((f) => f.copyright))].sort(),
      evidence_provenance: `package.json + ${files.length} licence/notice file(s) read from the `
        + 'materialized package under node_modules/.pnpm',
    };
    if (declared === null || declared.trim() === '') {
      unresolved.push({ ...record, issue: 'no_declared_licence', detail: 'the package declares no licence' });
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
