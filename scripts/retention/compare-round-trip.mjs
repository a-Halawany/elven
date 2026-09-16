#!/usr/bin/env node
/**
 * THE CUSTOMER'S ROUND-TRIP COMPARISON (CP-6 B16; DP-47-006 "round-trip fixtures", DP-47-003 "preserve identity, temporal truth,
 * provenance, corrections, policy labels", DZ-17): the package a domain EXPORTED, the package the importing domain RE-EXPORTED after
 * admitting it, and the import's own record — compared object by object, claim version by claim version, edge by edge, entity by
 * entity, so that "what went in is what came out, under new ids, with the old identity recoverable" is a statement the customer
 * proves from the three artifacts alone.
 *
 *   node scripts/retention/compare-round-trip.mjs --origin <dir|package.tar> --reexport <dir|package.tar> --map <import get JSON>
 *        [--origin-public-key <pem>] [--reexport-public-key <pem>] [--json]
 *
 * Node 18 or later; no dependency, no network, no database. `--map` is the answer of the product's import read
 * (`POST …/retention/imports/<id>/get`, which `scripts/retention/import-package.mjs get --json` prints verbatim): its `items[]` carry the
 * ORIGIN → NEW map (`origin_ref` — `<object_id>@<version>`, `entity:<id>`, `edge:<id>` — to `admitted`, the ids this installation
 * minted, or the existing ids it REUSED), its `import` row the package digest the import bound itself to, its `partner` the intake
 * source the imported manifests were recorded under.
 *
 * What is proven, in order — each a check printed PASS or FAIL; the verdict is ROUND TRIP OK only when every check passed:
 *   1. BOTH PACKAGES VERIFY: the customer's verifier (verify-export.mjs, --json) passes on each — integrity, re-import digests,
 *      completeness, the chain, the signature when a public key is given, the closure by pair (a /2 closure) or by id (a /1 closure,
 *      said so); the import's recorded package digest is the origin's (the map is THIS package's import).
 *   2. EVERY ORIGIN RECORD is carried or accounted for: an item exists for each; an admitted or reused one maps to a re-export object
 *      with the SAME object_version, the SAME bytes (bytes.content_digest, byte_length) and the same payload.content_digest — the
 *      bytes went through unchanged; an excluded or refused one is listed with its gate (not a failure: the import said so).
 *   3. THE PROVENANCE recovers the identity: payload.imported_from names format eye-import-provenance/1, the import, the partner, the
 *      origin package (tenant, domain, action, package digest, manifest digest, built_at, the signature's scheme and key id), the origin
 *      object by (object_id, object_version, object_type, schema_ref, content_digest), and carries the ORIGINAL 43-field header and the
 *      original payload VERBATIM (JCS-equal to the origin package's).
 *   4. THE HEADER is preserved field by field: lifecycle_state, truth_state, owning_component, event_time, observation_time, valid_from,
 *      valid_to, time_precision, source_clock_quality, synthetic_state, confidence, uncertainty, method_ref, classification,
 *      purpose_scope, rights_profile, residency_profile, retention_profile, access_policy_ref, quality_profile, quality_state,
 *      freshness_state, ontology_ref, withdrawal_reason, object_type and object_version VERBATIM; contradiction_refs, corroboration_refs,
 *      human_refs, correction_of and supersedes with every uuid REMAPPED through the item map; and the fields the import sets BY RULE
 *      checked by that rule — object_id the mapped id; tenant_id/domain_id the importing domain's; schema_ref the import form of the
 *      origin's (EVD@v1 → EVD@v2, …, CLM@v2 → CLM@v3); source_object_ids the remapped origin list plus exactly `import:<import id>`;
 *      evidence_refs remapped (the record's manifest id through the map); provenance_ref `SRC:<intake source>@<version>` — the intake
 *      contract the re-export names for the record; content_ref the evidence copy's; recorded_at a fresh instant; accountable_owner a
 *      principal; audit_correlation_id a uuid (the origin's values of these sit inside imported_from.header).
 *   5. THE PAYLOAD is the origin's with every uuid remapped — the record's manifest_id and locator excepted (the import's own copy;
 *      manifest_id checked through the map, locator checked to be the copy the content_ref names) and imported_from set aside.
 *   6. EVERY ORIGIN CLAIM VERSION (the closure's claims — by (object_id, object_version) in a /2 closure; the entry's own version in a
 *      /1 closure) is carried or accounted for; a carried one exists in the re-export closure under the mapped id with the SAME
 *      version (C@1 → C'@1, C@2 → C'@2 under one new id — versions are never renumbered), its header and payload held to rules 3–5, its
 *      lineage row the row of its own version with the same byte span, mode, confidence, run, method and call, naming the mapped
 *      record by (object_id, bytes digest).
 *   7. EVERY ORIGIN EDGE is carried or accounted for; a carried one has the same predicate, validity, state, asserted_at, retracted_at,
 *      superseded_at, confidence, mode, run and method, its ends mapped, its claim mapped WITH THE VERSION EQUAL (an edge asserted on
 *      C@1 rests on C'@1 — never rebased), its evidence mapped with the digest equal, its successor mapped (or none on both sides).
 *   8. EVERY ORIGIN ENTITY is carried or accounted for; an admitted one has the same type, name and lifecycle and the same identifiers
 *      by (system_key, value); one the import REUSED (an entity of the importing domain already identified by the same authoritative
 *      identifier) carries at least the origin's identifiers — its own name and type are its own, printed as a note.
 *
 * Prints `ROUND TRIP OK: n records, m claim versions, e edges, k entities; identities recoverable` (and what the import did not carry,
 * by gate) or `ROUND TRIP FAILED: …` with every failed check; exit 0 / 1; 2 on usage. With --json the same as an object
 * { ok, origin, reexport, import_id, counts, not_carried, checks, failed }.
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, fstatSync, openSync, readFileSync, readSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const VERIFIER = join(dirname(fileURLToPath(import.meta.url)), 'verify-export.mjs');
const USAGE = 'usage: node scripts/retention/compare-round-trip.mjs --origin <dir|package.tar> --reexport <dir|package.tar> --map <import get JSON> [--origin-public-key <pem>] [--reexport-public-key <pem>] [--json]';
const PROVENANCE_FORMAT = 'eye-import-provenance/1';
/** The import forms (B16 §3.2): every imported header carries the form that admits `imported_from`; an origin form absent here has no import form. */
const IMPORT_FORMS = { 'EVD@v1': 'EVD@v2', 'EVD@v2': 'EVD@v2', 'ENT@v1': 'ENT@v2', 'ENT@v2': 'ENT@v2', 'EVT@v1': 'EVT@v2', 'EVT@v2': 'EVT@v2', 'REL@v1': 'REL@v2', 'REL@v2': 'REL@v2', 'ASM@v1': 'ASM@v2', 'ASM@v2': 'ASM@v2', 'CLM@v2': 'CLM@v3', 'CLM@v3': 'CLM@v3' };
/** The header fields the import carries VERBATIM (B16 §3.2 with N1's exclusions: the rest are set by rule and checked by that rule). */
const VERBATIM_HEADER_FIELDS = ['object_type', 'object_version', 'scope', 'lifecycle_state', 'truth_state', 'owning_component', 'event_time', 'observation_time', 'valid_from', 'valid_to', 'time_precision', 'source_clock_quality', 'synthetic_state', 'confidence', 'uncertainty', 'method_ref', 'classification', 'purpose_scope', 'rights_profile', 'residency_profile', 'retention_profile', 'access_policy_ref', 'quality_profile', 'quality_state', 'freshness_state', 'ontology_ref', 'withdrawal_reason'];
/** The header fields the import REMAPS (every uuid through the item map) and carries otherwise unchanged. */
const REMAPPED_HEADER_FIELDS = ['contradiction_refs', 'corroboration_refs', 'human_refs', 'correction_of', 'supersedes'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UUID_TOKEN = /(?<![0-9a-f-])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f-])/gi;
const HEX64 = /^[0-9a-f]{64}$/;
const HEADER_FIELDS = 43;

/* ── JCS (RFC 8785), the subset the packages need — the verifier's rules ────── */
function jcs(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') { if (!Number.isFinite(value)) throw new Error('non-finite number cannot be canonicalized'); return JSON.stringify(value); }
  if (t === 'string') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((v) => { if (v === undefined) throw new Error('undefined array element'); return jcs(v); }).join(',')}]`;
  if (t === 'object') return `{${Object.keys(value).sort().map((k) => { if (value[k] === undefined) throw new Error(`undefined member at ${k}`); return `${JSON.stringify(k)}:${jcs(value[k])}`; }).join(',')}}`;
  throw new Error(`${t} cannot be canonicalized`);
}
const same = (a, b) => { try { return jcs(a) === jcs(b); } catch { return false; } };
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
/** Every uuid TOKEN (bounded by non-[0-9a-f-]) in any string, at any depth, replaced when the map has it — the import's remapUuids, re-implemented. */
function remapUuids(value, map) {
  if (typeof value === 'string') return value.replace(UUID_TOKEN, (m) => map.get(m.toLowerCase()) ?? m);
  if (Array.isArray(value)) return value.map((v) => remapUuids(v, map));
  if (value !== null && typeof value === 'object') { const out = {}; for (const k of Object.keys(value)) out[k] = remapUuids(value[k], map); return out; }
  return value;
}
const without = (o, ...keys) => { const out = { ...(o ?? {}) }; for (const k of keys) delete out[k]; return out; };
const short = (id) => `${String(id).slice(0, 8)}…`;

/* ── arguments ─────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2); const opt = {}; let asJson = false;
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--json') asJson = true;
  else if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
  else if (a.startsWith('--')) { opt[a.slice(2)] = String(args[i + 1] ?? ''); i += 1; }
  else { console.error(`unexpected argument: ${a}\n${USAGE}`); process.exit(2); }
}
for (const k of ['origin', 'reexport', 'map']) if (!opt[k]) { console.error(`--${k} is required\n${USAGE}`); process.exit(2); }
const originPath = resolve(opt.origin); const reexportPath = resolve(opt.reexport); const mapPath = resolve(opt.map);
for (const p of [originPath, reexportPath, mapPath]) if (!existsSync(p)) { console.error(`${p} does not exist`); process.exit(2); }

/* ── the packages: a directory, or a tar scanned for its two JSON entries ───── */
const BLOCK = 512;
function tarEntries(path, wanted) {
  const fd = openSync(path, 'r');
  try {
    const total = fstatSync(fd).size; const header = Buffer.alloc(BLOCK); const found = new Map(); const whole = createHash('sha256'); const buf = Buffer.alloc(4 * 1024 * 1024);
    let off = 0;
    const field = (b, o, n) => { const end = b.indexOf(0, o); const stop = end < 0 || end > o + n ? o + n : end; return b.toString('utf8', o, stop); };
    while (off + BLOCK <= total) {
      if (readSync(fd, header, 0, BLOCK, off) !== BLOCK) throw new Error(`truncated at ${off}`);
      whole.update(header);
      if (header.every((b) => b === 0)) { let pos = off + BLOCK; while (pos < total) { const n = readSync(fd, buf, 0, Math.min(buf.byteLength, total - pos), pos); if (n <= 0) break; whole.update(buf.subarray(0, n)); pos += n; } break; }
      const version = header.toString('latin1', 263, 265); const prefix = version === '00' ? field(header, 345, 155) : '';
      const name = prefix.length > 0 ? `${prefix}/${field(header, 0, 100)}` : field(header, 0, 100);
      const size = parseInt(field(header, 124, 12).trim() || '0', 8);
      const start = off + BLOCK; const padded = start + Math.ceil(size / BLOCK) * BLOCK;
      const keep = wanted.includes(name) ? [] : null;
      let pos = start;
      while (pos < padded) { const n = readSync(fd, buf, 0, Math.min(buf.byteLength, padded - pos), pos); if (n <= 0) throw new Error(`truncated at ${pos}`); whole.update(buf.subarray(0, n)); if (keep !== null) keep.push(Buffer.from(buf.subarray(0, Math.min(n, Math.max(0, start + size - pos))))); pos += n; }
      if (keep !== null) found.set(name, Buffer.concat(keep));
      off = padded;
    }
    return { entries: found, archiveDigest: whole.digest('hex') };
  } finally { closeSync(fd); }
}
function readPackage(target) {
  const isDir = statSync(target).isDirectory();
  let manifestBytes = null; let linksBytes = null; let archiveDigest = null;
  if (isDir) {
    manifestBytes = existsSync(join(target, 'manifest.json')) ? readFileSync(join(target, 'manifest.json')) : null;
    linksBytes = existsSync(join(target, 'links.json')) ? readFileSync(join(target, 'links.json')) : null;
  } else {
    const scanned = tarEntries(target, ['manifest.json', 'links.json']);
    manifestBytes = scanned.entries.get('manifest.json') ?? null; linksBytes = scanned.entries.get('links.json') ?? null; archiveDigest = scanned.archiveDigest;
  }
  const parse = (b) => { if (b === null) return null; try { const v = JSON.parse(b.toString('utf8')); return v !== null && typeof v === 'object' && !Array.isArray(v) ? v : null; } catch { return null; } };
  return { kind: isDir ? 'directory' : 'archive', manifest: parse(manifestBytes), manifestDigest: manifestBytes === null ? null : sha256(manifestBytes), links: parse(linksBytes), archiveDigest };
}
function verify(target, publicKey) {
  const isDir = statSync(target).isDirectory();
  const r = spawnSync(process.execPath, [VERIFIER, ...(isDir ? [target] : ['--tar', target]), '--json', ...(publicKey ? ['--public-key', resolve(publicKey)] : [])], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
  let v = null; try { v = JSON.parse(r.stdout); } catch { v = null; }
  return { ok: v?.ok === true, failed: (v?.checks ?? []).filter((c) => c.ok === false).map((c) => `${c.name}${c.detail ? ` — ${c.detail}` : ''}`), packageDigest: v?.summary?.package_digest ?? null, signature: v?.signature ?? null, closureFormat: v?.closure_format ?? null, exit: r.status, stderr: String(r.stderr ?? '').slice(0, 300) };
}

/* ── the checks ────────────────────────────────────────────────────────────── */
const results = []; const notCarried = []; const notes = [];
const check = (name, ok, detail) => { results.push({ name, ok: ok === true, detail: detail ?? null }); return ok === true; };
const counts = { records: 0, claim_versions: 0, edges: 0, entities: 0 };

// 1. both packages verify; the map is this package's import
const vo = verify(originPath, opt['origin-public-key']); const vr = verify(reexportPath, opt['reexport-public-key']);
check('origin: the customer\'s verifier passes on the origin package', vo.ok, vo.ok ? `package digest ${vo.packageDigest}; closure ${vo.closureFormat ?? 'none'}${vo.signature?.verified === true ? `; signature verified (${vo.signature.key_id})` : ''}` : `${vo.failed.length} failed: ${vo.failed.slice(0, 3).join(' | ')}${vo.stderr ? ` ${vo.stderr}` : ''}`);
check('re-export: the customer\'s verifier passes on the re-exported package', vr.ok, vr.ok ? `package digest ${vr.packageDigest}; closure ${vr.closureFormat ?? 'none'}${vr.signature?.verified === true ? `; signature verified (${vr.signature.key_id})` : ''}` : `${vr.failed.length} failed: ${vr.failed.slice(0, 3).join(' | ')}${vr.stderr ? ` ${vr.stderr}` : ''}`);
const origin = readPackage(originPath); const reexport = readPackage(reexportPath);
let mapDoc = null; try { mapDoc = JSON.parse(readFileSync(mapPath, 'utf8')); } catch (e) { mapDoc = null; }
const items = Array.isArray(mapDoc?.items) ? mapDoc.items : null;
const importRow = mapDoc?.import !== null && typeof mapDoc?.import === 'object' ? mapDoc.import : null;
const partner = mapDoc?.partner !== null && typeof mapDoc?.partner === 'object' ? mapDoc.partner : null;
check('map: --map is an import record with its items', items !== null, items === null ? `${mapPath} carries no items[] (the answer of POST …/retention/imports/<id>/get, or {items: […]})` : `${items.length} item(s); import ${importRow?.import_id ?? '(no import row)'}; state ${importRow?.state ?? '?'}`);
const om = origin.manifest; const rm = reexport.manifest;
const ready = vo.ok && vr.ok && items !== null && om !== null && rm !== null;
if (om === null) check('origin: manifest.json read', false, 'no manifest object');
if (rm === null) check('re-export: manifest.json read', false, 'no manifest object');
if (ready) {
  const originDigest = String(om.signature?.package_digest ?? '');
  if (importRow !== null) check('map: the import\'s recorded package digest is the origin package\'s (the map is THIS package\'s import)', importRow.package_digest === originDigest, importRow.package_digest === originDigest ? originDigest : `the import bound itself to ${importRow.package_digest}, the origin package digests to ${originDigest}`);
  const importId = importRow?.import_id ?? null;
  if (importRow !== null && importRow.state !== 'admitted') notes.push(`the import's state is ${importRow.state}, not admitted — the comparison holds only for the items already admitted`);

  // THE MAP: origin id → new id, from the items (records, claims, entities, edges) — and the records' manifest ids from the two manifests.
  const map = new Map(); const itemByRef = new Map();
  const itemFor = (kind, originRef) => itemByRef.get(`${kind}|${originRef}`);
  const idOf = (it) => { const a = it.admitted ?? it.planned ?? {}; return a.object_id ?? a.entity_id ?? a.edge_id ?? null; };
  for (const it of items) {
    itemByRef.set(`${it.kind}|${it.origin_ref}`, it);
    if (it.disposition !== 'admitted' && it.disposition !== 'reused') continue;
    const to = idOf(it); if (to === null) continue;
    const from = it.kind === 'record' || it.kind === 'claim' ? String(it.origin_ref).split('@')[0] : it.kind === 'entity' || it.kind === 'edge' ? String(it.origin_ref).replace(/^(entity|edge):/, '') : null;
    if (from !== null && UUID.test(from)) map.set(from.toLowerCase(), String(to).toLowerCase());
  }
  const rObjects = Array.isArray(rm.objects) ? rm.objects : []; const oObjects = Array.isArray(om.objects) ? om.objects : [];
  const rById = new Map(rObjects.map((o) => [String(o.object_id).toLowerCase(), o]));
  for (const o of oObjects) {
    const it = itemFor('record', `${o.object_id}@${o.object_version}`);
    if (it !== undefined && (it.disposition === 'admitted' || it.disposition === 'reused')) {
      const r = rById.get(String(idOf(it) ?? '').toLowerCase());
      const newManifest = it.admitted?.manifest_id ?? r?.manifest_id ?? r?.payload?.manifest_id ?? null;
      if (typeof o.manifest_id === 'string' && typeof newManifest === 'string') map.set(o.manifest_id.toLowerCase(), newManifest.toLowerCase());
    }
  }
  const mapped = (id) => (typeof id === 'string' ? map.get(id.toLowerCase()) ?? null : null);
  const intakeRef = partner !== null && partner.intake_source_id !== undefined ? `SRC:${partner.intake_source_id}@${partner.intake_contract_version}` : null;
  let archiveNoted = false;

  // RULES 3–5 on a carried object (a record or a claim version): the provenance, the header, the payload.
  const compareObject = (label, o, r, extra) => {
    const faults = [];
    const rh = r.header ?? {}; const oh = o.header ?? {}; const rp = r.payload ?? {}; const op = o.payload ?? {};
    // 3. the provenance
    const pf = rp.imported_from;
    if (pf === null || typeof pf !== 'object') faults.push('payload.imported_from absent');
    else {
      if (pf.format !== PROVENANCE_FORMAT) faults.push(`imported_from.format ${JSON.stringify(pf.format)}`);
      if (importId !== null && pf.import_id !== importId) faults.push(`imported_from.import_id ${pf.import_id} is not the map's import ${importId}`);
      if (partner !== null && partner.partner_key !== undefined && pf.partner_key !== partner.partner_key) faults.push(`imported_from.partner_key ${pf.partner_key} is not the map's partner ${partner.partner_key}`);
      const pk = pf.package ?? {};
      if (pk.action_id !== om.package?.action_id || pk.tenant_id !== om.package?.tenant_id || pk.domain_id !== om.package?.domain_id) faults.push('imported_from.package does not name the origin action, tenant and domain');
      if (pk.package_digest !== originDigest) faults.push(`imported_from.package.package_digest ${pk.package_digest} is not the origin's ${originDigest}`);
      if (origin.manifestDigest !== null && pk.manifest_digest !== origin.manifestDigest) faults.push(`imported_from.package.manifest_digest ${pk.manifest_digest} is not sha256(manifest.json) ${origin.manifestDigest}`);
      if (origin.archiveDigest !== null && pk.archive_digest !== origin.archiveDigest && !archiveNoted) { archiveNoted = true; notes.push(`imported_from.package.archive_digest ${pk.archive_digest} is not the sha256 of the origin tar given here (${origin.archiveDigest}) — an archive re-packed by the customer's own tar, or another delivery's bytes; the PACKAGE digest is what binds the import to the content, and it agrees`); }
      if (pk.built_at !== om.package?.built_at) faults.push('imported_from.package.built_at is not the origin manifest\'s');
      if (pk.signature?.scheme !== om.signature?.scheme || (om.signature?.key_id !== undefined && pk.signature?.key_id !== om.signature.key_id)) faults.push('imported_from.package.signature does not name the origin\'s scheme and key id');
      const ob = pf.object ?? {};
      if (ob.object_id !== o.object_id || Number(ob.object_version) !== Number(o.object_version) || ob.object_type !== (o.object_type ?? oh.object_type) || ob.schema_ref !== oh.schema_ref || ob.content_digest !== o.content_digest) faults.push(`imported_from.object ${JSON.stringify(ob)} is not the origin's (${o.object_id}@${o.object_version}, ${oh.schema_ref}, ${o.content_digest})`);
      if (!same(pf.header, oh)) faults.push('imported_from.header is not the origin header verbatim');
      if (!same(pf.payload, op)) faults.push('imported_from.payload is not the origin payload verbatim');
    }
    // 4. the header
    if (Object.keys(rh).length !== HEADER_FIELDS) faults.push(`the re-exported header carries ${Object.keys(rh).length} field(s), not ${HEADER_FIELDS}`);
    for (const f of VERBATIM_HEADER_FIELDS) if (!same(rh[f], oh[f])) faults.push(`header.${f}: ${JSON.stringify(rh[f])} ≠ origin ${JSON.stringify(oh[f])}`);
    for (const f of REMAPPED_HEADER_FIELDS) if (!same(rh[f], remapUuids(oh[f], map))) faults.push(`header.${f}: ${JSON.stringify(rh[f])} ≠ remapped origin ${JSON.stringify(remapUuids(oh[f], map))}`);
    if (String(rh.object_id).toLowerCase() !== String(mapped(o.object_id))) faults.push(`header.object_id ${rh.object_id} is not the mapped id ${mapped(o.object_id)}`);
    if (rh.tenant_id !== rm.package?.tenant_id || rh.domain_id !== rm.package?.domain_id) faults.push('header.tenant_id/domain_id are not the importing domain\'s');
    const form = IMPORT_FORMS[oh.schema_ref];
    if (form === undefined) faults.push(`origin schema_ref ${oh.schema_ref} has no import form`); else if (rh.schema_ref !== form) faults.push(`header.schema_ref ${rh.schema_ref} is not the import form ${form} of ${oh.schema_ref}`);
    const soi = Array.isArray(rh.source_object_ids) ? rh.source_object_ids : []; const expectedSoi = remapUuids(Array.isArray(oh.source_object_ids) ? oh.source_object_ids : [], map);
    const importMarks = soi.filter((s) => typeof s === 'string' && s.startsWith('import:')); const others = soi.filter((s) => !(typeof s === 'string' && s.startsWith('import:')));
    if (!same([...others].sort(), [...expectedSoi].sort()) || importMarks.length !== 1 || (importId !== null && importMarks[0] !== `import:${importId}`)) faults.push(`header.source_object_ids ${JSON.stringify(soi)} is not the remapped origin list plus import:<the import>`);
    if (!same(rh.evidence_refs, remapUuids(oh.evidence_refs, map))) faults.push(`header.evidence_refs ${JSON.stringify(rh.evidence_refs)} ≠ remapped origin ${JSON.stringify(remapUuids(oh.evidence_refs, map))}`);
    if (!/^SRC:[0-9a-f-]{36}@\d+$/i.test(String(rh.provenance_ref))) faults.push(`header.provenance_ref ${JSON.stringify(rh.provenance_ref)} is not an intake contract reference`);
    else if (intakeRef !== null && rh.provenance_ref !== intakeRef) faults.push(`header.provenance_ref ${rh.provenance_ref} is not the partner's intake contract ${intakeRef}`);
    if (extra?.source !== undefined && extra.source !== null && rh.provenance_ref !== `SRC:${extra.source.source_id}@${extra.source.contract_version}`) faults.push(`header.provenance_ref ${rh.provenance_ref} is not the contract the re-export names for the record (SRC:${extra.source.source_id}@${extra.source.contract_version})`);
    if (typeof oh.content_ref === 'string' && oh.content_ref.startsWith('vault:evidence/')) { if (rh.content_ref !== `vault:evidence/${rp.locator}`) faults.push(`header.content_ref ${rh.content_ref} is not the evidence copy the payload names (vault:evidence/${rp.locator})`); }
    else if (!same(rh.content_ref, remapUuids(oh.content_ref, map))) faults.push(`header.content_ref ${JSON.stringify(rh.content_ref)} ≠ remapped origin`);
    if (typeof rh.recorded_at !== 'string' || Number.isNaN(Date.parse(rh.recorded_at))) faults.push('header.recorded_at is not an instant');
    if (!/^principal:/.test(String(rh.accountable_owner))) faults.push(`header.accountable_owner ${JSON.stringify(rh.accountable_owner)} is not a principal`);
    if (!UUID.test(String(rh.audit_correlation_id))) faults.push('header.audit_correlation_id is not a uuid');
    // 5. the payload: the origin's remapped, the import's own copy fields set aside
    const skip = extra?.record === true ? ['imported_from', 'manifest_id', 'locator'] : ['imported_from'];
    if (!same(without(rp, ...skip), without(remapUuids(op, map), ...skip))) faults.push('the payload is not the origin payload with its uuids remapped (imported_from set aside)');
    if (extra?.record === true) {
      if (String(rp.manifest_id).toLowerCase() !== String(mapped(op.manifest_id))) faults.push(`payload.manifest_id ${rp.manifest_id} is not the mapped manifest ${mapped(op.manifest_id)}`);
      if (typeof rp.locator !== 'string' || rp.locator.length === 0) faults.push('payload.locator (the evidence copy) is absent');
      if (rp.content_digest !== op.content_digest) faults.push(`payload.content_digest ${rp.content_digest} ≠ origin ${op.content_digest}`);
    }
    return faults;
  };

  // 2–5. the records
  const recordFaults = [];
  for (const o of oObjects) {
    const ref = `${o.object_id}@${o.object_version}`; const it = itemFor('record', ref);
    if (it === undefined) { recordFaults.push(`record ${ref}: no item in the map`); continue; }
    if (it.disposition !== 'admitted' && it.disposition !== 'reused') { notCarried.push(`record ${ref}: ${it.disposition} (${it.gate ?? '?'}${it.reason ? `: ${it.reason}` : ''})`); continue; }
    const to = mapped(o.object_id); const r = to === null ? undefined : rById.get(to);
    if (r === undefined) { recordFaults.push(`record ${ref}: mapped to ${to ?? '(no id)'}, which the re-export does not carry`); continue; }
    const faults = [];
    if (Number(r.object_version) !== Number(o.object_version)) faults.push(`object_version ${r.object_version} ≠ ${o.object_version}`);
    if (r.bytes?.content_digest !== o.bytes?.content_digest || Number(r.bytes?.byte_length) !== Number(o.bytes?.byte_length)) faults.push(`bytes ${r.bytes?.content_digest} (${r.bytes?.byte_length}) ≠ ${o.bytes?.content_digest} (${o.bytes?.byte_length})`);
    if (r.payload?.content_digest !== o.payload?.content_digest) faults.push('payload.content_digest differs');
    faults.push(...compareObject(ref, o, r, { record: true, source: r.source ?? null }));
    if (faults.length > 0) recordFaults.push(`record ${ref} → ${short(to)}@${r.object_version}: ${faults.join('; ')}`); else counts.records += 1;
  }
  check('records: every origin record is carried under its mapped id with the same version and bytes, or accounted for by the import', recordFaults.length === 0, recordFaults.length === 0 ? `${counts.records} carried${notCarried.length > 0 ? `, ${notCarried.length} accounted for` : ''}` : recordFaults.slice(0, 3).join(' || ') + (recordFaults.length > 3 ? ` … ${recordFaults.length} in all` : ''));
  check('provenance and headers: imported_from recovers each origin identity; the header preserved field by field, the rule-set fields by their rules; the payload the origin\'s remapped', recordFaults.length === 0, recordFaults.length === 0 ? 'every carried record' : 'see the record faults');

  // 6. the claim versions
  const ol = origin.links; const rl = reexport.links;
  if (ol === null && om.package?.links) check('closure: the origin package\'s links.json read', false, 'the origin manifest names a closure that could not be read');
  const oClaims = Array.isArray(ol?.claims) ? ol.claims : []; const rClaims = Array.isArray(rl?.claims) ? rl.claims : [];
  const rClaimByPair = new Map(rClaims.map((c) => [`${String(c.object_id).toLowerCase()}@${c.object_version}`, c]));
  const rClaimsById = new Map(); for (const c of rClaims) { const k = String(c.object_id).toLowerCase(); rClaimsById.set(k, [...(rClaimsById.get(k) ?? []), c.object_version]); }
  const claimFaults = [];
  const rDigests = new Map(rObjects.map((o) => [String(o.object_id).toLowerCase(), o.bytes?.content_digest]));
  for (const c of oClaims) {
    const ref = `${c.object_id}@${c.object_version}`; const it = itemFor('claim', ref);
    if (it === undefined) { claimFaults.push(`claim ${ref}: no item in the map`); continue; }
    if (it.disposition !== 'admitted' && it.disposition !== 'reused') { notCarried.push(`claim ${ref}: ${it.disposition} (${it.gate ?? '?'}${it.reason ? `: ${it.reason}` : ''})`); continue; }
    const to = mapped(c.object_id); const r = to === null ? undefined : rClaimByPair.get(`${to}@${c.object_version}`);
    if (r === undefined) { claimFaults.push(`claim ${ref}: mapped to ${to ?? '(no id)'}, whose version ${c.object_version} the re-export closure does not carry (it carries ${JSON.stringify(rClaimsById.get(to ?? '') ?? [])})`); continue; }
    const faults = compareObject(ref, c, r, { record: false });
    if (r.object_type !== c.object_type) faults.push(`object_type ${r.object_type} ≠ ${c.object_type}`);
    const orow = (Array.isArray(c.lineage) ? c.lineage : []).find((l) => Number(l.claim_version) === Number(c.object_version)) ?? null;
    const rrow = (Array.isArray(r.lineage) ? r.lineage : []).find((l) => Number(l.claim_version) === Number(r.object_version)) ?? null;
    if (orow === null) faults.push('the origin entry has no lineage row of its own version');
    else if (rrow === null) faults.push('the re-export entry has no lineage row of its own version');
    else {
      for (const f of ['byte_start', 'byte_end', 'mode', 'confidence', 'run_id', 'method_id', 'call_id']) if (!same(rrow[f] ?? null, orow[f] ?? null)) faults.push(`lineage.${f} ${JSON.stringify(rrow[f] ?? null)} ≠ ${JSON.stringify(orow[f] ?? null)}`);
      if (String(rrow.evidence_object_id).toLowerCase() !== String(mapped(orow.evidence_object_id))) faults.push(`lineage.evidence_object_id ${rrow.evidence_object_id} is not the mapped record ${mapped(orow.evidence_object_id)}`);
      if (rrow.evidence_digest !== orow.evidence_digest) faults.push(`lineage.evidence_digest ${rrow.evidence_digest} ≠ ${orow.evidence_digest}`);
      if (rDigests.get(String(rrow.evidence_object_id).toLowerCase()) !== rrow.evidence_digest) faults.push('the re-export lineage row does not resolve to the re-exported bytes by (object_id, digest)');
    }
    if (faults.length > 0) claimFaults.push(`claim ${ref} → ${short(to)}@${r.object_version}: ${faults.join('; ')}`); else counts.claim_versions += 1;
  }
  check('claim versions: every origin claim version is carried under its mapped id with the SAME version (never renumbered), its header, payload and lineage row preserved, or accounted for', claimFaults.length === 0, claimFaults.length === 0 ? `${counts.claim_versions} carried (${rl?.format ?? 'no closure'} in the re-export)` : claimFaults.slice(0, 3).join(' || ') + (claimFaults.length > 3 ? ` … ${claimFaults.length} in all` : ''));

  // 7. the edges
  const oEdges = Array.isArray(ol?.edges) ? ol.edges : []; const rEdges = Array.isArray(rl?.edges) ? rl.edges : [];
  const rEdgeById = new Map(rEdges.map((e) => [String(e.edge_id).toLowerCase(), e]));
  const edgeFaults = [];
  for (const e of oEdges) {
    const ref = `edge:${e.edge_id}`; const it = itemFor('edge', ref);
    if (it === undefined) { edgeFaults.push(`${ref}: no item in the map`); continue; }
    if (it.disposition !== 'admitted' && it.disposition !== 'reused') { notCarried.push(`${ref}: ${it.disposition} (${it.gate ?? '?'}${it.reason ? `: ${it.reason}` : ''})`); continue; }
    const to = mapped(e.edge_id); const r = to === null ? undefined : rEdgeById.get(to);
    if (r === undefined) { edgeFaults.push(`${ref}: mapped to ${to ?? '(no id)'}, which the re-export closure does not carry`); continue; }
    const faults = [];
    for (const f of ['predicate', 'valid_from', 'valid_to', 'state', 'asserted_at', 'retracted_at', 'superseded_at', 'confidence', 'mode', 'run_id', 'method_id', 'retraction_reason']) if (!same(r[f] ?? null, e[f] ?? null)) faults.push(`${f} ${JSON.stringify(r[f] ?? null)} ≠ ${JSON.stringify(e[f] ?? null)}`);
    if (String(r.subject_entity_id).toLowerCase() !== String(mapped(e.subject_entity_id))) faults.push(`subject ${r.subject_entity_id} is not the mapped entity ${mapped(e.subject_entity_id)}`);
    if (String(r.object_entity_id).toLowerCase() !== String(mapped(e.object_entity_id))) faults.push(`object ${r.object_entity_id} is not the mapped entity ${mapped(e.object_entity_id)}`);
    if (String(r.claim?.object_id).toLowerCase() !== String(mapped(e.claim?.object_id)) || Number(r.claim?.object_version) !== Number(e.claim?.object_version)) faults.push(`claim ${r.claim?.object_id}@${r.claim?.object_version} is not the mapped pair ${mapped(e.claim?.object_id)}@${e.claim?.object_version} (the VERSION must be equal: an edge is never rebased)`);
    if (String(r.evidence?.object_id).toLowerCase() !== String(mapped(e.evidence?.object_id)) || r.evidence?.digest !== e.evidence?.digest) faults.push('evidence is not the mapped record with the same digest');
    const oSucc = e.superseded_by ?? null; const rSucc = r.superseded_by ?? null;
    if ((oSucc === null) !== (rSucc === null) || (oSucc !== null && String(rSucc).toLowerCase() !== String(mapped(oSucc)))) faults.push(`superseded_by ${rSucc} is not the mapped successor ${oSucc === null ? 'none' : mapped(oSucc)}`);
    if (faults.length > 0) edgeFaults.push(`${ref} → ${short(to)}: ${faults.join('; ')}`); else counts.edges += 1;
  }
  check('edges: every origin edge is carried under its mapped id with the same predicate, validity, state, instants, confidence, mode, run and method, its ends and its claim PAIR mapped (the version equal), or accounted for', edgeFaults.length === 0, edgeFaults.length === 0 ? `${counts.edges} carried` : edgeFaults.slice(0, 3).join(' || ') + (edgeFaults.length > 3 ? ` … ${edgeFaults.length} in all` : ''));

  // 8. the entities
  const oEntities = Array.isArray(ol?.entities) ? ol.entities : []; const rEntities = Array.isArray(rl?.entities) ? rl.entities : [];
  const rEntityById = new Map(rEntities.map((n) => [String(n.entity_id).toLowerCase(), n]));
  const rSystems = Array.isArray(rl?.identifier_systems) ? new Set(rl.identifier_systems.map((s) => s.system_key)) : null;
  const entityFaults = [];
  const idPairs = (n) => (Array.isArray(n.identifiers) ? n.identifiers : []).map((i) => `${i.system_key}=${i.value}`).sort();
  for (const n of oEntities) {
    const ref = `entity:${n.entity_id}`; const it = itemFor('entity', ref);
    if (it === undefined) { entityFaults.push(`${ref}: no item in the map`); continue; }
    if (it.disposition !== 'admitted' && it.disposition !== 'reused') { notCarried.push(`${ref}: ${it.disposition} (${it.gate ?? '?'}${it.reason ? `: ${it.reason}` : ''})`); continue; }
    const to = mapped(n.entity_id); const r = to === null ? undefined : rEntityById.get(to);
    if (r === undefined) { entityFaults.push(`${ref}: mapped to ${to ?? '(no id)'}, which the re-export closure does not carry`); continue; }
    const faults = [];
    const op = idPairs(n); const rp = idPairs(r);
    if (it.disposition === 'reused') {
      const missing = op.filter((p) => !rp.includes(p));
      if (missing.length > 0) faults.push(`the reused entity lacks the origin's identifier(s) ${missing.join(', ')}`);
      notes.push(`${ref} was REUSED as ${short(to)} (${r.entity_type} ${JSON.stringify(r.canonical_name)}; the origin's: ${n.entity_type} ${JSON.stringify(n.canonical_name)}) — an entity of the importing domain already identified by the same authoritative identifier`);
    } else {
      for (const f of ['entity_type', 'canonical_name', 'lifecycle_state']) if (!same(r[f], n[f])) faults.push(`${f} ${JSON.stringify(r[f])} ≠ ${JSON.stringify(n[f])}`);
      if (!same(op, rp)) faults.push(`identifiers ${JSON.stringify(rp)} ≠ ${JSON.stringify(op)}`);
      for (const i of Array.isArray(r.identifiers) ? r.identifiers : []) {
        const oi = (n.identifiers ?? []).find((x) => x.system_key === i.system_key && x.value === i.value);
        if (oi !== undefined && typeof oi.source_claim_object_id === 'string' && mapped(oi.source_claim_object_id) !== null && String(i.source_claim_object_id).toLowerCase() !== mapped(oi.source_claim_object_id)) faults.push(`identifier ${i.system_key}=${i.value} names claim ${i.source_claim_object_id}, not the mapped ${mapped(oi.source_claim_object_id)}`);
      }
    }
    if (rSystems !== null) for (const i of Array.isArray(r.identifiers) ? r.identifiers : []) if (!rSystems.has(i.system_key)) faults.push(`identifier system ${i.system_key} is not among the re-export's identifier_systems`);
    if (faults.length > 0) entityFaults.push(`${ref} → ${short(to)}: ${faults.join('; ')}`); else counts.entities += 1;
  }
  check('entities: every origin entity is carried under its mapped id with the same type, name, lifecycle and identifiers (a reused one with at least the origin\'s identifiers), or accounted for', entityFaults.length === 0, entityFaults.length === 0 ? `${counts.entities} carried` : entityFaults.slice(0, 3).join(' || ') + (entityFaults.length > 3 ? ` … ${entityFaults.length} in all` : ''));
  // what the re-export carries beyond the round trip (a note, not a fault: the importing domain exports what it holds)
  const extraObjects = rObjects.filter((o) => ![...map.values()].includes(String(o.object_id).toLowerCase())).length;
  if (extraObjects > 0) notes.push(`the re-export carries ${extraObjects} record(s) that are not this import's (the importing domain's own, or another import's)`);
}

/* ── the verdict ───────────────────────────────────────────────────────────── */
const failed = results.filter((r) => r.ok === false);
const ok = ready === true && failed.length === 0;
const summary = `${counts.records} records, ${counts.claim_versions} claim versions, ${counts.edges} edges, ${counts.entities} entities`;
if (asJson) {
  console.log(JSON.stringify({ ok, origin: { path: originPath, package_digest: vo.packageDigest, closure_format: vo.closureFormat }, reexport: { path: reexportPath, package_digest: vr.packageDigest, closure_format: vr.closureFormat }, import_id: importRow?.import_id ?? null, counts, not_carried: notCarried, notes, checks: results, failed: failed.length }, null, 2));
} else {
  console.log(`round trip: origin ${originPath} → re-export ${reexportPath} (map ${mapPath})`);
  for (const r of results) console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail !== null ? ` — ${r.detail}` : ''}`);
  for (const n of notes) console.log(`  note  ${n}`);
  if (notCarried.length > 0) console.log(`  not carried by the import (accounted for, not a failure): ${notCarried.join('; ')}`);
  console.log(ok ? `ROUND TRIP OK: ${summary}; identities recoverable` : `ROUND TRIP FAILED: ${failed.length} check(s) failed — ${failed.map((f) => f.name.split(':')[0]).join(', ')}`);
}
process.exit(ok ? 0 : 1);
