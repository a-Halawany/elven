#!/usr/bin/env node
/**
 * The CUSTOMER'S VERIFIER of an export package (CP-6 B11; migration 0070 §3; V03-T-047, DPD-19).
 *
 *   node scripts/retention/verify-export.mjs <package-dir> [--expect-package-digest <hex>] [--json]
 *
 * Node 18 or later; no dependency, no network, no database — it reads the package directory alone. The package is what the
 * product handed over: `manifest.json` and one `<manifest_id>.bin` per exported object, nothing else. The checks, in order,
 * each printed as PASS or FAIL with its reason; the exit code is 0 only when every check passes:
 *
 *   1. the manifest: present, parses, format eye-customer-export/1, signature scheme eye-digest-chain/1;
 *   2. INTEGRITY of the bytes: every listed file present, sha256(file) = bytes.content_digest, size = bytes.byte_length;
 *   3. RE-IMPORT: for every object payload.content_digest = bytes.content_digest (the record binds the bytes) and
 *      sha256(JCS({header, payload})) = content_digest (the canonical header and payload recompute to the recorded canonical
 *      digest — what an import checks before admitting the record); the header carries exactly 43 fields;
 *   4. COMPLETENESS: every listed file present and every file in the directory listed — EVERY entry, a dot-file included (an
 *      unlisted file fails; the product's own verification counts the directory the same way); what was excluded and why
 *      is printed — an exclusion is not a failure;
 *   5. REDACTION: every exported header's classification is within gates.redaction.classification_ceiling (a package never
 *      states a ceiling one of its records exceeds);
 *   6. THE CHAIN: sha256(JCS(objects)) = signature.objects_digest; sha256(JCS({format, package, authorization, gates,
 *      objects_digest, excluded, bound_to, statement})) = signature.package_digest — the binding and the statement of the
 *      signature block are INSIDE the digest, so a tampered binding fails here; signature.bound_to restates the covered
 *      authorization (action_id = package.action_id, scope_digest = authorization.scope_digest, approval_id =
 *      authorization.approval_id); and, with --expect-package-digest, equality with the digest the product's record
 *      reports (the authenticity step: the same digest is recorded in the append-only retention ledger, bound to the
 *      approval on the resolved scope).
 *
 * The package is "signed" by that digest chain, not by a key (D4 of the batch record): integrity and completeness are
 * proven offline here; authenticity is proven by presenting the package digest to the product (the export read route, or
 * the retention record) and comparing.
 *
 * JCS (RFC 8785) is re-implemented here in the subset the manifest needs — members sorted by UTF-16 code units, strings
 * and numbers as JSON.stringify writes them, no whitespace; a non-finite number, an undefined value or a non-plain object
 * is refused rather than coerced — the same rules as packages/contracts/src/jcs.ts, which the product's harness holds to
 * agree with this file on the package it built.
 */
import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

const FORMAT = 'eye-customer-export/1';
const SCHEME = 'eye-digest-chain/1';
const HEADER_FIELDS = 43;
const HEX64 = /^[0-9a-f]{64}$/;
const BIN_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.bin$/;
const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'];
const rank = (c) => { const i = CLASSIFICATIONS.indexOf(String(c ?? '')); return i < 0 ? 3 : i; };

/* ── JCS, the subset the manifest needs (RFC 8785) ─────────────────────────── */
function jcs(value) {
  if (value === null) return 'null';
  const t = typeof value;
  if (t === 'boolean') return value ? 'true' : 'false';
  if (t === 'number') {
    if (!Number.isFinite(value)) throw new Error('non-finite number cannot be canonicalized');
    return JSON.stringify(value);
  }
  if (t === 'string') return JSON.stringify(value);
  if (t === 'undefined' || t === 'function' || t === 'symbol' || t === 'bigint') throw new Error(`${t} cannot be canonicalized`);
  if (Array.isArray(value)) {
    const parts = [];
    for (let i = 0; i < value.length; i += 1) {
      if (!Object.prototype.hasOwnProperty.call(value, i) || value[i] === undefined) throw new Error(`array element ${i} is absent or undefined`);
      parts.push(jcs(value[i]));
    }
    return `[${parts.join(',')}]`;
  }
  if (t === 'object') {
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) throw new Error('non-plain object cannot be canonicalized');
    const keys = Object.keys(value).sort();
    const members = [];
    for (const k of keys) {
      if (value[k] === undefined) throw new Error(`undefined member value at key "${k}"`);
      members.push(`${JSON.stringify(k)}:${jcs(value[k])}`);
    }
    return `{${members.join(',')}}`;
  }
  throw new Error(`unsupported type: ${t}`);
}
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const digestOf = (value) => createHash('sha256').update(jcs(value), 'utf8').digest('hex');

/* ── arguments ─────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
let dir = null; let expected = null; let asJson = false;
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--expect-package-digest') { expected = String(args[i + 1] ?? '').toLowerCase(); i += 1; }
  else if (a === '--json') asJson = true;
  else if (a === '--help' || a === '-h') { console.log('usage: node scripts/retention/verify-export.mjs <package-dir> [--expect-package-digest <hex>] [--json]'); process.exit(0); }
  else if (dir === null) dir = a;
  else { console.error(`unexpected argument: ${a}`); process.exit(2); }
}
if (dir === null) { console.error('usage: node scripts/retention/verify-export.mjs <package-dir> [--expect-package-digest <hex>] [--json]'); process.exit(2); }
dir = resolve(dir);

/* ── the checks ────────────────────────────────────────────────────────────── */
const results = [];
let summary = null;
const check = (name, ok, detail) => { results.push({ name, ok: ok === true, detail: detail ?? null }); return ok === true; };
const note = (text) => results.push({ name: text, ok: null, detail: null });

let manifest = null;
const manifestPath = join(dir, 'manifest.json');
if (!existsSync(manifestPath)) {
  check('manifest.json present', false, `no manifest.json under ${dir}`);
} else {
  try {
    manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    check('manifest.json present and parses', true, `${statSync(manifestPath).size} bytes, file digest ${sha256(readFileSync(manifestPath))}`);
  } catch (e) {
    check('manifest.json present and parses', false, `manifest.json does not parse: ${e.message}`);
  }
}
if (manifest !== null && typeof manifest === 'object' && !Array.isArray(manifest)) {
  check(`format is ${FORMAT}`, manifest.format === FORMAT, `format ${JSON.stringify(manifest.format)}`);
  const sig = manifest.signature;
  check(`signature scheme is ${SCHEME}`, sig !== null && typeof sig === 'object' && sig.scheme === SCHEME, `scheme ${JSON.stringify(sig?.scheme)}`);
  const objects = Array.isArray(manifest.objects) ? manifest.objects : null;
  check('objects is a list', objects !== null, objects === null ? 'objects is not an array' : `${objects.length} object(s)`);
  const listed = new Set();
  let integrityOk = 0; let reimportOk = 0; let bytesTotal = 0;
  if (objects !== null) {
    for (let i = 0; i < objects.length; i += 1) {
      const o = objects[i];
      const label = `objects[${i}] ${o?.object_id ?? '?'}@${o?.object_version ?? '?'}`;
      const file = o?.bytes?.file;
      // 2. integrity of the bytes
      if (typeof file !== 'string' || !BIN_RE.test(file)) { check(`integrity ${label}: bytes.file`, false, `bytes.file ${JSON.stringify(file)} is not <manifest id>.bin`); continue; }
      listed.add(file);
      const path = join(dir, file);
      if (!existsSync(path)) { check(`integrity ${label}: ${file} present`, false, 'the listed file is absent'); continue; }
      const bytes = readFileSync(path);
      const d = sha256(bytes);
      const okDigest = d === o.bytes.content_digest;
      const okSize = bytes.byteLength === o.bytes.byte_length;
      if (check(`integrity ${label}: ${file} sha256 and size`, okDigest && okSize, okDigest ? (okSize ? `${bytes.byteLength} bytes, ${d}` : `size ${bytes.byteLength} is not ${o.bytes.byte_length}`) : `digest mismatch: file ${d}, listed ${o.bytes.content_digest}`)) { integrityOk += 1; bytesTotal += bytes.byteLength; }
      // 3. re-import: the record binds the bytes; the header and payload recompute to the canonical digest
      const payloadBinds = o?.payload?.content_digest === o.bytes.content_digest;
      const headerKeys = o?.header !== null && typeof o?.header === 'object' ? Object.keys(o.header).length : -1;
      let recomputed = null; let recomputeError = null;
      try { recomputed = digestOf({ header: o.header, payload: o.payload }); } catch (e) { recomputeError = e.message; }
      const okReimport = payloadBinds && headerKeys === HEADER_FIELDS && recomputed === o.content_digest;
      if (check(`re-import ${label}: payload binds the bytes, ${HEADER_FIELDS}-field header and payload recompute to the canonical digest`, okReimport,
        !payloadBinds ? `payload.content_digest ${JSON.stringify(o?.payload?.content_digest)} is not bytes.content_digest ${o.bytes.content_digest}`
          : headerKeys !== HEADER_FIELDS ? `the header carries ${headerKeys} field(s), not ${HEADER_FIELDS}`
            : recomputed !== o.content_digest ? `the header and payload recompute to ${recomputed ?? `nothing (${recomputeError})`}, the record says ${o.content_digest}` : `canonical digest ${o.content_digest}`)) reimportOk += 1;
    }
    note(`integrity ${integrityOk}/${objects.length}; re-import ${reimportOk}/${objects.length}`);
  }
  // 4. completeness: the directory holds the manifest and the listed files, nothing else — every entry counts, a dot-file included
  //    (the product's verification counts the directory the same way; the product never writes a dot-file into a package)
  const present = readdirSync(dir);
  const unlisted = present.filter((n) => n !== 'manifest.json' && !listed.has(n));
  const missing = [...listed].filter((n) => !present.includes(n));
  check('completeness: every listed file present and every file listed', unlisted.length === 0 && missing.length === 0,
    unlisted.length > 0 ? `unlisted file(s) in the package: ${unlisted.join(', ')}` : missing.length > 0 ? `listed file(s) absent: ${missing.join(', ')}` : `${present.length} entr${present.length === 1 ? 'y' : 'ies'} in the directory: manifest.json + ${listed.size} object file(s)`);
  const excluded = Array.isArray(manifest.excluded) ? manifest.excluded : [];
  note(`excluded ${excluded.length}: ${excluded.length === 0 ? 'nothing was withheld' : excluded.map((x) => `${x.manifest_id ?? '?'} (${x.gate ?? '?'}: ${x.reason ?? ''})`).join('; ')}`);
  // 5. redaction: no exported record classified above the package's stated ceiling
  if (objects !== null) {
    const ceiling = manifest.gates?.redaction?.classification_ceiling;
    const above = objects.filter((o) => rank(o?.header?.classification) > rank(ceiling)).map((o) => `${o?.object_id ?? '?'}@${o?.object_version ?? '?'} (${o?.header?.classification ?? '?'})`);
    check(`redaction: every exported record's classification is within the ceiling ${JSON.stringify(ceiling)}`, CLASSIFICATIONS.includes(ceiling) && above.length === 0,
      !CLASSIFICATIONS.includes(ceiling) ? `gates.redaction.classification_ceiling ${JSON.stringify(ceiling)} is not a classification` : above.length > 0 ? `record(s) above the ceiling: ${above.join(', ')}` : `${objects.length} record(s) at or below ${ceiling}`);
  }
  // 6. the chain
  if (objects !== null && sig !== null && typeof sig === 'object') {
    let objectsDigest = null; let packageDigest = null; let chainError = null;
    try {
      objectsDigest = digestOf(objects);
      packageDigest = digestOf({ format: manifest.format, package: manifest.package, authorization: manifest.authorization, gates: manifest.gates, objects_digest: objectsDigest, excluded, bound_to: sig.bound_to ?? null, statement: sig.statement ?? null });
    } catch (e) { chainError = e.message; }
    check('chain: sha256(JCS(objects)) = signature.objects_digest', objectsDigest !== null && objectsDigest === sig.objects_digest, chainError ?? `${objectsDigest} ${objectsDigest === sig.objects_digest ? '=' : '≠'} ${sig.objects_digest}`);
    check('chain: sha256(JCS({format, package, authorization, gates, objects_digest, excluded, bound_to, statement})) = signature.package_digest', packageDigest !== null && packageDigest === sig.package_digest, chainError ?? `${packageDigest} ${packageDigest === sig.package_digest ? '=' : '≠'} ${sig.package_digest}`);
    const auth = manifest.authorization ?? {};
    const boundOk = sig.bound_to !== null && typeof sig.bound_to === 'object' && sig.bound_to.action_id !== undefined && sig.bound_to.action_id === manifest.package?.action_id
      && sig.bound_to.scope_digest === auth.scope_digest && sig.bound_to.approval_id === auth.approval_id;
    check('chain: signature.bound_to restates the covered authorization (action_id = package.action_id, scope_digest = authorization.scope_digest, approval_id = authorization.approval_id)', boundOk,
      boundOk ? `bound to action ${manifest.package?.action_id}, scope digest ${auth.scope_digest}, approval ${auth.approval_id}`
        : `bound_to {action ${sig.bound_to?.action_id}, scope digest ${sig.bound_to?.scope_digest}, approval ${sig.bound_to?.approval_id}} does not restate {action ${manifest.package?.action_id}, scope digest ${auth.scope_digest}, approval ${auth.approval_id}}`);
    if (expected !== null) {
      check('authenticity: the package digest equals the digest the product recorded (--expect-package-digest)', HEX64.test(expected) && packageDigest === expected,
        !HEX64.test(expected) ? `the expected package digest is not sha-256 hex: ${expected}` : packageDigest === expected ? `recorded ${expected}` : `expected package digest ${expected}, the package computes ${packageDigest}`);
    } else {
      note('authenticity: pass --expect-package-digest <hex> with the digest the product recorded (the export read route, or the retention record) to compare');
    }
    summary = { objects: objects.length, bytes: bytesTotal, package_digest: packageDigest };
  }
}

/* ── the report ────────────────────────────────────────────────────────────── */
const failed = results.filter((r) => r.ok === false).length;
if (asJson) {
  console.log(JSON.stringify({ package: dir, checks: results, summary, failed, ok: failed === 0 }, null, 2));
} else {
  console.log(`export package: ${dir}`);
  for (const r of results) console.log(r.ok === null ? `  ${r.name}` : `  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.detail !== null ? ` — ${r.detail}` : ''}`);
  console.log(failed === 0 && summary !== null ? `PACKAGE OK: ${summary.objects} objects, ${summary.bytes} bytes, package digest ${summary.package_digest}` : `PACKAGE FAILED: ${failed} check(s)`);
}
process.exit(failed === 0 ? 0 : 1);
