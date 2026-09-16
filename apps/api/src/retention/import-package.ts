/**
 * THE IMPORT PACKAGE — the PURE rules of a governed import (CP-6 B16; D3, D5, D6, D7, D8; §3.2, §3.4): what a staged inbound
 * package must satisfy before a person approves it, how its items are planned, and how an origin's record becomes a record of
 * the importing domain. Nothing here reads a database or a disk; the service (import.service.ts) stages the package into the
 * quarantine vault and gathers the facts (the partner by key, its intake contract, the origin's state, a live import of the same
 * digest), and these functions answer from what they are handed — which is what makes them unit-testable on fixtures and what
 * makes the product's checks the customer verifier's checks (scripts/retention/verify-export.mjs) restated in process.
 *
 * THE CHECKS (§3.4, in the order they are recorded; C2, C5, N14): the archive, the manifest, the ORIGIN (a domain does not import
 * its own export), the bytes' integrity, the re-import binding (the 43-field header and the payload recompute to the canonical
 * digest — the record is admissible AS RECORDED), completeness, the digest chain, the signature's scheme (key-signed packages only:
 * a partner IS a key, D6), the PARTNER holding the key, the signature over the RECOMPUTED digest, the relationship closure's file and
 * its consistency BY PAIR (an edge names an exact claim version and is never rebased — Codex B15-F1), the intake contract's policy,
 * a live duplicate, the origin's revocation and expiry (which can PASS or FAIL only on what THIS installation knows — the origin's
 * own record or the station's revocation notice — and is otherwise a NOTE: unsigned exchange statements prove nothing, C2), and the
 * origin's own exclusions (recorded, never admitted). `verified` = no check failed; a note (`ok: null`) is a fact, not a verdict.
 *
 * THE PLAN (D3, N3–N6): every imported row gets a NEW id minted by the importing installation — always, a package's ids are
 * caller-supplied data (Gate-2.2 C6) — with the version NUMBERS preserved exactly; one new id per origin id, so C@1 and C@2 arrive
 * as C'@1 and C'@2 under one id. An origin object id that an EARLIER import admitted into this domain keeps the id minted then
 * (any version); a version already admitted with the same digests is reused, the same version with other bytes is refused as an
 * integrity failure; an entity whose authoritative identifier already identifies one entity of this domain is reused — no other
 * resolution happens on import. A superseded edge whose successor is not carried is refused (a dangling successor is not
 * invented); a links/1 closure admits the entry's version alone and records the other lineage rows as exclusions.
 *
 * THE IMPORTED RECORD (D3, N1): the header's identity, scope, owner, record time and correlation are the importing domain's; the
 * provenance reference is the INTAKE CONTRACT the partner is admitted under (the origin's stays inside `imported_from`); every
 * reference field is remapped through the plan's map; every other field — the four times, the truth state, the policy labels, the
 * quality and correction fields — is carried VERBATIM: temporal truth, provenance, corrections and policy labels survive the crossing
 * (DP-47-003). The payload is the origin's, remapped, plus `imported_from`: the origin package, the origin (object_id, version,
 * digest) and the ORIGINAL header and payload verbatim — identity is recoverable, never reused.
 */
import { createHash } from 'node:crypto';
import { CANONICAL_HEADER_FIELD_COUNT, canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import { objectsDigestOf, packageDigestOf, type ExportManifestShape } from './export-package.js';
import { KEY_SIGNATURE_RE, KEY_SIGNATURE_SCHEME, SIGNING_ALGORITHM, verifySignature } from './export-signing.js';
import { ExportArchiveError, LINKS_FILE, listedFilesOf } from './export-archive.js';

type Row = Record<string, unknown>;

/** The provenance block's format, inside every imported payload (`payload.imported_from.format`; the registry's IMPORTED_FROM_SCHEMA, 0076 §5). */
export const IMPORT_PROVENANCE_FORMAT = 'eye-import-provenance/1';
/** D2/D3: the import FORM of every admissible schema — the base form plus `imported_from` (0076 §5); a schema_ref outside this table has no import form (the item is refused, gate schema). */
export const IMPORT_FORMS: Readonly<Record<string, string>> = {
  'EVD@v1': 'EVD@v2', 'EVD@v2': 'EVD@v2',
  'ENT@v1': 'ENT@v2', 'ENT@v2': 'ENT@v2',
  'EVT@v1': 'EVT@v2', 'EVT@v2': 'EVT@v2',
  'REL@v1': 'REL@v2', 'REL@v2': 'REL@v2',
  'ASM@v1': 'ASM@v2', 'ASM@v2': 'ASM@v2',
  'CLM@v2': 'CLM@v3', 'CLM@v3': 'CLM@v3',
};
/** The manifest formats and signature schemes an import reads (the verifier's own lists). */
export const IMPORT_MANIFEST_FORMATS = ['eye-customer-export/1', 'eye-customer-export/2'] as const;
export const IMPORT_SIGNATURE_SCHEMES = ['eye-digest-chain/1', KEY_SIGNATURE_SCHEME] as const;
/** The closure formats an import reads: B15's /1 (one version per claim id) and B16's /2 (claims keyed by pair, D8). */
export const IMPORT_LINKS_FORMATS = ['eye-customer-export-links/1', 'eye-customer-export-links/2'] as const;
/** The manifest and the closure are held in memory by the scan; anything above this is not parsed (the check names it). */
export const IMPORT_KEPT_MAX_BYTES = 64 * 1024 * 1024;

/** The stable names of the checks, in the order they are recorded (the details carry the facts; a name never changes with them). */
export const CHECK_NAMES = {
  archive: 'archive: the package parses as a ustar archive',
  manifest: 'manifest: manifest.json is present, parses as a JSON object, names a format (eye-customer-export/1 or /2), a signature scheme (eye-digest-chain/1 or eye-customer-export/2) and a list of objects',
  origin: "origin: the package's origin domain is not this domain",
  integrity: 'integrity: every listed file is present with the sha256 and size the manifest names',
  reimport: "re-import: every object's payload binds its bytes and its 43-field header and payload recompute to its canonical digest",
  completeness: 'completeness: every listed file is present and every entry is listed',
  chain: 'chain: sha256(JCS(objects)) = objects_digest; the package digest recomputes; bound_to restates the authorization',
  scheme: 'signature: the scheme is eye-customer-export/2 with a key id, Ed25519 and a 64-byte signature',
  partner: "partner: an active exchange partner of this domain holds the package's signing key",
  signature: "signature: the Ed25519 signature over the recomputed package digest verifies against the partner's key",
  linksFile: 'links: links.json is present with the digest and size the manifest names and is the closure the manifest counts',
  linksPairs: "links: every claim version's lineage names an exported record by (object_id, bytes digest); every edge names an included claim by (object_id, object_version), included entities and an exported record by (object_id, digest)",
  policy: 'policy: the intake source is an active upload contract with confirmed rights and its ceiling admits the records',
  duplicate: 'duplicate: no live import of this package in this domain',
  revocation: 'revocation: the origin has not revoked the package and it has not expired',
  exclusions: 'origin exclusions: the items the origin excluded are recorded, not admitted',
} as const;
/** §3.4: the ordered names — sixteen with the origin check of N14 (the numbering of the design shifts by one after the manifest). */
export const IMPORT_CHECKS: readonly string[] = [
  CHECK_NAMES.archive, CHECK_NAMES.manifest, CHECK_NAMES.origin, CHECK_NAMES.integrity, CHECK_NAMES.reimport, CHECK_NAMES.completeness,
  CHECK_NAMES.chain, CHECK_NAMES.scheme, CHECK_NAMES.partner, CHECK_NAMES.signature, CHECK_NAMES.linksFile, CHECK_NAMES.linksPairs,
  CHECK_NAMES.policy, CHECK_NAMES.duplicate, CHECK_NAMES.revocation, CHECK_NAMES.exclusions,
];

export interface ImportCheck { name: string; ok: boolean | null; detail: string | null }

/**
 * One entry of the scanned archive as staged: its name, size and sha256 (accumulated as the bytes passed, whatever became of them),
 * whether it is a regular file, and where its bytes are — `quarantine`: a blob under the locator; `oversize`: above the vault's blob
 * ceiling, hashed and dropped (refused at admission, gate oversize); `drained`: hashed and dropped because the manifest failed its
 * own checks before this entry arrived (C5: nothing is stored for a package no partner signed) or because manifest.json was not first.
 */
export interface StagedEntry { name: string; size: number; digest: string; regular: boolean; quarantineLocator: string | null; held: 'quarantine' | 'oversize' | 'drained' }

/** The package as the scan left it: what was read, what was kept, what was stored, and the unsigned exchange statements presented with it. */
export interface StagedPackage {
  archiveDigest: string; archiveSize: number;
  /** The scan's refusal when the source did not parse whole (the check names it); null for an archive read to its trailer. */
  archiveError: string | null;
  /** The first entry's name — the product writes manifest.json first; a package that does not is not read further (C5). */
  firstEntry: string | null;
  manifestBytes: Buffer | null; manifest: Row | null;
  /** Why the manifest is not usable (absent, too large to keep, not JSON, not an object), when it is not. */
  manifestError: string | null;
  linksBytes: Buffer | null; links: Row | null; linksError: string | null;
  entries: StagedEntry[];
  /** The sender's exchange statement — delivery.json at the station, or the block presented with an inline package — UNSIGNED. */
  exchange: Row | null;
  /** C2(c): the origin's revocation notice found beside the package at the station (revocation.json), when there is one. */
  revocation: Row | null;
}

export interface VerificationContext {
  /** The ACTIVE exchange partner of the importing domain holding the manifest's key_id, or null. */
  partner: Row | null;
  /** The partner's intake source contract (observation.source_contracts_current), or null without a partner. */
  contract: Row | null;
  /** retention.import_origin_state's answer: {known, revoked_at, expires_at} — known only when the presented digest is the recorded one (N13). */
  origin: Row;
  /** An import of this domain with the same package digest that is neither quarantined nor withdrawn, or null. */
  liveImport: Row | null;
  importingDomain: { tenantId: string; domainId: string };
  now: Date;
  /** The vault's blob ceiling, for the detail that names an oversize entry. */
  vaultMaxBytes?: number;
}

const HEX64 = /^[0-9a-f]{64}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY_ID = /^ed25519:[0-9a-f]{16}$/;
const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
/** The classification order the redaction gate uses: an unknown level ranks as restricted. */
export const classificationRank = (c: unknown): number => { const i = (CLASSIFICATIONS as readonly string[]).indexOf(String(c ?? '')); return i < 0 ? 3 : i; };
const isObject = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const few = (items: string[], max = 3): string => items.length <= max ? items.join('; ') : `${items.slice(0, max).join('; ')}; … ${items.length} in all`;
const check = (name: string, ok: boolean | null, detail: string | null): ImportCheck => ({ name, ok, detail });
const instantOf = (v: unknown): string | null => { if (v === null || v === undefined) return null; const t = Date.parse(String(v)); return Number.isNaN(t) ? null : new Date(t).toISOString(); };

/** What the manifest states, read once for every check (nulls where it does not parse). */
interface ManifestFacts {
  manifest: ExportManifestShape | null;
  pkg: Row; sig: Row | null; objects: Row[] | null; excluded: Row[] | null;
  linksBlock: Row | null;
  recomputedPackageDigest: string | null; recomputedObjectsDigest: string | null; chainError: string | null;
  keyId: string | null;
}
function factsOf(s: Pick<StagedPackage, 'manifest'>): ManifestFacts {
  const m = isObject(s.manifest) ? (s.manifest as unknown as ExportManifestShape) : null;
  const pkg = isObject(m?.package) ? (m?.package as Row) : {};
  const sig = isObject(m?.signature) ? (m?.signature as Row) : null;
  const objects = Array.isArray(m?.objects) ? (m?.objects as Row[]) : null;
  const excluded = Array.isArray(m?.excluded) ? (m?.excluded as Row[]) : null;
  const linksBlock = isObject(pkg['links']) ? (pkg['links'] as Row) : null;
  let recomputedPackageDigest: string | null = null; let recomputedObjectsDigest: string | null = null; let chainError: string | null = null;
  if (m !== null && objects !== null && excluded !== null && sig !== null) {
    try { recomputedObjectsDigest = objectsDigestOf(objects); recomputedPackageDigest = packageDigestOf(m); }
    catch (e) { chainError = String((e as { message?: unknown })?.message ?? 'the chain could not be recomputed'); }
  }
  const keyId = sig !== null && typeof sig['key_id'] === 'string' ? (sig['key_id'] as string) : null;
  return { manifest: m, pkg, sig, objects, excluded, linksBlock, recomputedPackageDigest, recomputedObjectsDigest, chainError, keyId };
}

// ───────────────────────── the checks, one function each ─────────────────────────

function archiveCheck(s: StagedPackage): ImportCheck {
  if (s.archiveError !== null) return check(CHECK_NAMES.archive, false, s.archiveError);
  if (s.firstEntry !== 'manifest.json') return check(CHECK_NAMES.archive, false, `the first entry is ${s.firstEntry === null ? 'absent' : JSON.stringify(s.firstEntry)}, not manifest.json — the product writes manifest.json first, and nothing was stored of a package that does not (${s.archiveSize} bytes, ${plural(s.entries.length, 'entry', 'entries')}, archive digest ${s.archiveDigest})`);
  return check(CHECK_NAMES.archive, true, `${s.archiveSize} bytes, ${plural(s.entries.length, 'entry', 'entries')}, archive digest ${s.archiveDigest}`);
}

function manifestCheck(s: Pick<StagedPackage, 'manifest' | 'manifestBytes' | 'manifestError'>, f: ManifestFacts): ImportCheck {
  if (f.manifest === null) return check(CHECK_NAMES.manifest, false, s.manifestError ?? 'manifest.json is absent or not a JSON object');
  const format = String(f.manifest.format ?? '');
  if (!(IMPORT_MANIFEST_FORMATS as readonly string[]).includes(format)) return check(CHECK_NAMES.manifest, false, `format ${JSON.stringify(f.manifest.format)} is not ${IMPORT_MANIFEST_FORMATS.join(' or ')}`);
  const scheme = f.sig === null ? undefined : f.sig['scheme'];
  if (f.sig === null || !(IMPORT_SIGNATURE_SCHEMES as readonly string[]).includes(String(scheme))) return check(CHECK_NAMES.manifest, false, `signature scheme ${JSON.stringify(scheme)} is not ${IMPORT_SIGNATURE_SCHEMES.join(' or ')}`);
  if (f.objects === null) return check(CHECK_NAMES.manifest, false, 'objects is not a list');
  if (f.excluded === null) return check(CHECK_NAMES.manifest, false, 'excluded is not a list');
  const fileDigest = s.manifestBytes === null ? 'unknown' : sha256Hex(s.manifestBytes);
  return check(CHECK_NAMES.manifest, true, `format ${format}, scheme ${String(scheme)}, ${plural(f.objects.length, 'object')}, ${plural(f.excluded.length, 'exclusion')}, built ${String(f.pkg['built_at'] ?? '?')} by ${String(f.pkg['built_by'] ?? '?')} under action ${String(f.pkg['action_id'] ?? '?')}; file digest ${fileDigest}`);
}

/** N14: a domain does not import its own export — the origin the manifest states against the importing domain. */
function originCheck(f: ManifestFacts, c: VerificationContext): ImportCheck {
  if (f.manifest === null) return check(CHECK_NAMES.origin, null, 'not checked: the manifest did not parse');
  const t = String(f.pkg['tenant_id'] ?? '').toLowerCase(); const d = String(f.pkg['domain_id'] ?? '').toLowerCase();
  if (!UUID.test(t) || !UUID.test(d)) return check(CHECK_NAMES.origin, false, `the manifest names no origin domain (package.tenant_id ${JSON.stringify(f.pkg['tenant_id'])}, package.domain_id ${JSON.stringify(f.pkg['domain_id'])})`);
  if (t === c.importingDomain.tenantId.toLowerCase() && d === c.importingDomain.domainId.toLowerCase()) {
    return check(CHECK_NAMES.origin, false, `the package was built by this domain (${t}/${d}, action ${String(f.pkg['action_id'] ?? '?')}); a domain does not import its own export`);
  }
  return check(CHECK_NAMES.origin, true, `origin ${t}/${d}, action ${String(f.pkg['action_id'] ?? '?')}`);
}

function integrityCheck(s: StagedPackage, f: ManifestFacts, c: VerificationContext): ImportCheck {
  if (f.objects === null) return check(CHECK_NAMES.integrity, null, 'not checked: the manifest did not parse');
  const byName = new Map(s.entries.map((e) => [e.name, e]));
  const failures: string[] = []; const oversize: string[] = []; let bytes = 0;
  for (let i = 0; i < f.objects.length; i += 1) {
    const o = f.objects[i] as Row;
    const label = `objects[${i}] ${String(o['object_id'] ?? '?')}@${String(o['object_version'] ?? '?')}`;
    const b = isObject(o['bytes']) ? (o['bytes'] as Row) : null;
    const file = b === null ? undefined : b['file'];
    if (typeof file !== 'string') { failures.push(`${label}: bytes.file ${JSON.stringify(file)} is not a file name`); continue; }
    const e = byName.get(file);
    if (e === undefined) { failures.push(`${label}: ${file} is absent`); continue; }
    if (!e.regular) { failures.push(`${label}: ${file} is not a regular file`); continue; }
    if (e.digest !== b?.['content_digest']) { failures.push(`${label}: ${file} digests to ${e.digest}, listed ${String(b?.['content_digest'])}`); continue; }
    if (e.size !== Number(b?.['byte_length'])) { failures.push(`${label}: ${file} is ${e.size} bytes, listed ${String(b?.['byte_length'])}`); continue; }
    bytes += e.size;
    if (e.held === 'oversize') oversize.push(`${file} (${e.size} bytes)`);
  }
  if (failures.length > 0) return check(CHECK_NAMES.integrity, false, few(failures));
  const over = oversize.length === 0 ? '' : `; ${plural(oversize.length, 'file')} above the vault's blob ceiling${c.vaultMaxBytes === undefined ? '' : ` of ${c.vaultMaxBytes} bytes`} hashed and not stored — refused at admission, gate oversize: ${few(oversize)}`;
  return check(CHECK_NAMES.integrity, true, `${plural(f.objects.length, 'file')}, ${bytes} bytes, every digest and size as listed${over}`);
}

function reimportCheck(f: ManifestFacts): ImportCheck {
  if (f.objects === null) return check(CHECK_NAMES.reimport, null, 'not checked: the manifest did not parse');
  const failures: string[] = [];
  for (let i = 0; i < f.objects.length; i += 1) {
    const o = f.objects[i] as Row;
    const label = `objects[${i}] ${String(o['object_id'] ?? '?')}@${String(o['object_version'] ?? '?')}`;
    const b = isObject(o['bytes']) ? (o['bytes'] as Row) : null; const p = isObject(o['payload']) ? (o['payload'] as Row) : null; const h = isObject(o['header']) ? (o['header'] as Row) : null;
    if (p === null || b === null || p['content_digest'] !== b['content_digest']) { failures.push(`${label}: payload.content_digest ${JSON.stringify(p?.['content_digest'])} is not bytes.content_digest ${JSON.stringify(b?.['content_digest'])}`); continue; }
    const keys = h === null ? -1 : Object.keys(h).length;
    if (keys !== CANONICAL_HEADER_FIELD_COUNT) { failures.push(`${label}: the header carries ${keys} field(s), not ${CANONICAL_HEADER_FIELD_COUNT}`); continue; }
    let recomputed: string | null = null; let error: string | null = null;
    try { recomputed = canonicalHeaderDigest(h as unknown as CanonicalHeader, p); } catch (e) { error = String((e as { message?: unknown })?.message ?? 'unknown'); }
    if (recomputed !== o['content_digest']) failures.push(`${label}: the header and payload recompute to ${recomputed ?? `nothing (${error})`}, the record says ${String(o['content_digest'])}`);
  }
  if (failures.length > 0) return check(CHECK_NAMES.reimport, false, few(failures));
  return check(CHECK_NAMES.reimport, true, `${plural(f.objects.length, 'record')}: every payload binds its bytes and every ${CANONICAL_HEADER_FIELD_COUNT}-field header recomputes to its canonical digest`);
}

function completenessCheck(s: StagedPackage, f: ManifestFacts): ImportCheck {
  if (f.objects === null) return check(CHECK_NAMES.completeness, null, 'not checked: the manifest did not parse');
  let listed: string[];
  try { listed = listedFilesOf(f.objects, f.manifest as { package?: { links?: unknown } }); }
  catch (e) { return check(CHECK_NAMES.completeness, false, e instanceof ExportArchiveError ? e.message : String((e as { message?: unknown })?.message ?? 'the listing is malformed')); }
  const wanted = new Set(['manifest.json', ...listed]);
  const present = s.entries.map((e) => e.name);
  const unlisted = present.filter((n) => !wanted.has(n));
  const missing = [...wanted].filter((n) => !present.includes(n));
  if (unlisted.length > 0) return check(CHECK_NAMES.completeness, false, `unlisted entr${unlisted.length === 1 ? 'y' : 'ies'} in the archive: ${few(unlisted)}`);
  if (missing.length > 0) return check(CHECK_NAMES.completeness, false, `listed file(s) absent: ${few(missing)}`);
  return check(CHECK_NAMES.completeness, true, `${plural(present.length, 'entry', 'entries')}: manifest.json + ${plural(listed.length, 'listed file')}`);
}

function chainCheck(f: ManifestFacts): ImportCheck {
  if (f.manifest === null || f.objects === null || f.excluded === null || f.sig === null) return check(CHECK_NAMES.chain, null, 'not checked: the manifest did not parse');
  if (f.chainError !== null) return check(CHECK_NAMES.chain, false, f.chainError);
  if (f.recomputedObjectsDigest !== f.sig['objects_digest']) return check(CHECK_NAMES.chain, false, `sha256(JCS(objects)) ${f.recomputedObjectsDigest} ≠ signature.objects_digest ${String(f.sig['objects_digest'])}`);
  if (f.recomputedPackageDigest !== f.sig['package_digest']) return check(CHECK_NAMES.chain, false, `the package digest recomputes to ${f.recomputedPackageDigest}, the manifest states ${String(f.sig['package_digest'])}`);
  const auth = isObject(f.manifest.authorization) ? f.manifest.authorization : {};
  const bound = isObject(f.sig['bound_to']) ? (f.sig['bound_to'] as Row) : null;
  const boundOk = bound !== null && bound['action_id'] !== undefined && bound['action_id'] === f.pkg['action_id'] && bound['scope_digest'] === auth['scope_digest'] && bound['approval_id'] === auth['approval_id'];
  if (!boundOk) return check(CHECK_NAMES.chain, false, `bound_to {action ${String(bound?.['action_id'])}, scope digest ${String(bound?.['scope_digest'])}, approval ${String(bound?.['approval_id'])}} does not restate {action ${String(f.pkg['action_id'])}, scope digest ${String(auth['scope_digest'])}, approval ${String(auth['approval_id'])}}`);
  return check(CHECK_NAMES.chain, true, `package digest ${f.recomputedPackageDigest}; bound to action ${String(f.pkg['action_id'])}, scope digest ${String(auth['scope_digest'])}, approval ${String(auth['approval_id'])}`);
}

/** D6: key-signed packages only — a /1 package carries the digest chain alone and is refused here, whatever else verifies. */
function schemeCheck(f: ManifestFacts): ImportCheck {
  if (f.sig === null) return check(CHECK_NAMES.scheme, null, 'not checked: the manifest did not parse');
  const scheme = String(f.sig['scheme'] ?? '');
  if (scheme !== KEY_SIGNATURE_SCHEME) return check(CHECK_NAMES.scheme, false, `the package carries the digest chain alone (${scheme || 'no scheme'}); an import admits key-signed packages only (${KEY_SIGNATURE_SCHEME})`);
  if (f.keyId === null || !KEY_ID.test(f.keyId)) return check(CHECK_NAMES.scheme, false, `key_id ${JSON.stringify(f.sig['key_id'])} is not a key id (ed25519:<16 hex>)`);
  if (f.sig['algorithm'] !== SIGNING_ALGORITHM) return check(CHECK_NAMES.scheme, false, `algorithm ${JSON.stringify(f.sig['algorithm'])} is not ${SIGNING_ALGORITHM}`);
  if (typeof f.sig['signature'] !== 'string' || !KEY_SIGNATURE_RE.test(f.sig['signature'])) return check(CHECK_NAMES.scheme, false, 'signature is not the base64 of 64 bytes');
  return check(CHECK_NAMES.scheme, true, `scheme ${KEY_SIGNATURE_SCHEME}, key ${f.keyId}, ${SIGNING_ALGORITHM}, a 64-byte signature`);
}

function partnerCheck(f: ManifestFacts, c: VerificationContext): ImportCheck {
  if (f.sig === null) return check(CHECK_NAMES.partner, null, 'not checked: the manifest did not parse');
  if (f.keyId === null) return check(CHECK_NAMES.partner, null, 'not checked: the package names no signing key');
  if (c.partner === null) return check(CHECK_NAMES.partner, false, `no exchange partner of this domain holds key ${f.keyId}; declare the partner (retention.partner.declare) and open the import again`);
  return check(CHECK_NAMES.partner, true, `partner ${String(c.partner['partner_key'])} (${String(c.partner['party'])}) holds key ${f.keyId}, declared ${instantOf(c.partner['declared_at']) ?? '?'}`);
}

function signatureCheck(f: ManifestFacts, c: VerificationContext): ImportCheck {
  if (f.sig === null) return check(CHECK_NAMES.signature, null, 'not checked: the manifest did not parse');
  if (c.partner === null) return check(CHECK_NAMES.signature, null, 'not checked: no partner holds the key');
  if (String(f.sig['scheme'] ?? '') !== KEY_SIGNATURE_SCHEME || typeof f.sig['signature'] !== 'string') return check(CHECK_NAMES.signature, null, 'not checked: no key-based signature to verify');
  if (f.recomputedPackageDigest === null) return check(CHECK_NAMES.signature, false, `no package digest to verify against (${f.chainError ?? 'the chain did not recompute'})`);
  const pem = String(c.partner['public_key_pem'] ?? '');
  if (verifySignature(pem, f.recomputedPackageDigest, f.sig['signature'])) return check(CHECK_NAMES.signature, true, `verified over ${f.recomputedPackageDigest} with the partner's key ${String(c.partner['key_id'])}`);
  const stated = typeof f.sig['package_digest'] === 'string' && HEX64.test(f.sig['package_digest']) ? (f.sig['package_digest'] as string) : null;
  if (stated !== null && stated !== f.recomputedPackageDigest && verifySignature(pem, stated, f.sig['signature'])) return check(CHECK_NAMES.signature, false, `the signature verifies over the stated package_digest ${stated}, not over the package's recomputed digest ${f.recomputedPackageDigest}: the content was altered after signing`);
  return check(CHECK_NAMES.signature, false, `the signature does not verify over ${f.recomputedPackageDigest} with the partner's key ${String(c.partner['key_id'])} (the manifest names ${f.keyId ?? '?'})`);
}

/** B15/B16: the closure's file — present, the digest and size the manifest names, the counts the manifest states, the same action. */
function linksFileCheck(s: StagedPackage, f: ManifestFacts): ImportCheck {
  if (f.manifest === null) return check(CHECK_NAMES.linksFile, null, 'not checked: the manifest did not parse');
  if (f.linksBlock === null) return check(CHECK_NAMES.linksFile, null, 'the package carries no relationship closure');
  const b = f.linksBlock;
  if (b['file'] !== LINKS_FILE) return check(CHECK_NAMES.linksFile, false, `package.links.file is ${JSON.stringify(b['file'])}, not ${LINKS_FILE}`);
  const e = s.entries.find((x) => x.name === LINKS_FILE);
  if (e === undefined) return check(CHECK_NAMES.linksFile, false, 'the manifest names a links file that is absent');
  if (!e.regular) return check(CHECK_NAMES.linksFile, false, `${LINKS_FILE} is not a regular file`);
  if (e.digest !== b['links_digest']) return check(CHECK_NAMES.linksFile, false, `${LINKS_FILE} digests to ${e.digest}, the manifest names ${String(b['links_digest'])}`);
  if (e.size !== Number(b['byte_length'])) return check(CHECK_NAMES.linksFile, false, `${LINKS_FILE} is ${e.size} bytes, the manifest names ${String(b['byte_length'])}`);
  // C5: a closure DRAINED after the manifest's own checks failed was never read — that is not a defect of the closure; the failing check names the cause.
  if (e.held === 'drained') return check(CHECK_NAMES.linksFile, null, `not checked: ${LINKS_FILE} arrived after the manifest checks failed and was drained (digest and size recorded, the content not read)`);
  const l = isObject(s.links) ? s.links : null;
  if (l === null) return check(CHECK_NAMES.linksFile, false, s.linksError ?? `${LINKS_FILE} does not parse as a JSON object`);
  if (!(IMPORT_LINKS_FORMATS as readonly string[]).includes(String(l['format']))) return check(CHECK_NAMES.linksFile, false, `the closure's format ${JSON.stringify(l['format'])} is not ${IMPORT_LINKS_FORMATS.join(' or ')}`);
  if (l['format'] !== b['format']) return check(CHECK_NAMES.linksFile, false, `the closure's format ${JSON.stringify(l['format'])} is not the manifest's package.links.format ${JSON.stringify(b['format'])}`);
  const arrays = ['claims', 'edges', 'entities', 'excluded'] as const;
  for (const k of arrays) if (!Array.isArray(l[k])) return check(CHECK_NAMES.linksFile, false, `the closure's ${k} is not a list`);
  const counts = arrays.map((k) => [k, (l[k] as unknown[]).length, Number(b[k])] as const);
  const off = counts.filter(([, have, want]) => have !== want);
  if (off.length > 0) return check(CHECK_NAMES.linksFile, false, `counts differ from the manifest's package.links: ${off.map(([k, have, want]) => `${k} ${have} (named ${want})`).join(', ')}`);
  const lp = isObject(l['package']) ? (l['package'] as Row) : {};
  if (lp['action_id'] !== f.pkg['action_id']) return check(CHECK_NAMES.linksFile, false, `the closure names action ${String(lp['action_id'])}, the manifest ${String(f.pkg['action_id'])}`);
  return check(CHECK_NAMES.linksFile, true, `${String(l['format'])}: ${plural((l['claims'] as unknown[]).length, 'claim version')}, ${plural((l['edges'] as unknown[]).length, 'edge')}, ${plural((l['entities'] as unknown[]).length, 'entity', 'entities')}, ${(l['excluded'] as unknown[]).length} excluded; ${e.size} bytes, ${e.digest}`);
}

/** The closure's consistency BY PAIR (D8; Codex B15-F1) — the same rule for a /1 and a /2 closure: an edge naming a version the closure does not carry fails here, never rebased. */
function linksPairsCheck(s: StagedPackage, f: ManifestFacts): ImportCheck {
  if (f.manifest === null) return check(CHECK_NAMES.linksPairs, null, 'not checked: the manifest did not parse');
  if (f.linksBlock === null) return check(CHECK_NAMES.linksPairs, null, 'the package carries no relationship closure');
  const l = isObject(s.links) ? s.links : null;
  if (s.entries.find((x) => x.name === LINKS_FILE)?.held === 'drained') return check(CHECK_NAMES.linksPairs, null, `not checked: ${LINKS_FILE} was drained after the manifest checks failed`);
  if (l === null || f.objects === null || !Array.isArray(l['claims']) || !Array.isArray(l['edges']) || !Array.isArray(l['entities'])) return check(CHECK_NAMES.linksPairs, null, 'not checked: the closure did not parse as the manifest counts it');
  const exported = new Map<string, string>();
  for (const o of f.objects) { const b = isObject(o['bytes']) ? (o['bytes'] as Row) : {}; exported.set(String(o['object_id']), String(b['content_digest'])); }
  const pairs = new Set<string>(); const offenders: string[] = [];
  for (const cl of l['claims'] as Row[]) {
    const pair = `${String(cl['object_id'])}@${String(cl['object_version'])}`;
    if (pairs.has(pair)) { offenders.push(`claim ${pair} appears twice`); continue; }
    pairs.add(pair);
    const rows = Array.isArray(cl['lineage']) ? (cl['lineage'] as Row[]) : [];
    if (rows.length === 0) { offenders.push(`claim ${pair} carries no lineage`); continue; }
    for (const r of rows) {
      const evd = String(r['evidence_object_id']); const digest = exported.get(evd);
      if (digest === undefined) offenders.push(`claim ${pair}: its lineage names ${evd}, which is not exported`);
      else if (digest !== r['evidence_digest']) offenders.push(`claim ${pair}: its lineage names ${evd} under digest ${String(r['evidence_digest']).slice(0, 12)}…, the exported bytes digest to ${digest.slice(0, 12)}…`);
    }
  }
  const entities = new Set((l['entities'] as Row[]).map((e) => String(e['entity_id'])));
  for (const e of l['edges'] as Row[]) {
    const id = String(e['edge_id']); const cl = isObject(e['claim']) ? (e['claim'] as Row) : {}; const ev = isObject(e['evidence']) ? (e['evidence'] as Row) : {};
    const pair = `${String(cl['object_id'])}@${String(cl['object_version'])}`;
    if (!pairs.has(pair)) offenders.push(`edge ${id} names claim ${pair}, which the closure does not carry (an edge is never rebased onto another version)`);
    if (!entities.has(String(e['subject_entity_id']))) offenders.push(`edge ${id}: its subject entity ${String(e['subject_entity_id'])} is not included`);
    if (!entities.has(String(e['object_entity_id']))) offenders.push(`edge ${id}: its object entity ${String(e['object_entity_id'])} is not included`);
    const digest = exported.get(String(ev['object_id']));
    if (digest === undefined) offenders.push(`edge ${id} names evidence ${String(ev['object_id'])}, which is not exported`);
    else if (digest !== ev['digest']) offenders.push(`edge ${id} names evidence ${String(ev['object_id'])} under another digest`);
  }
  if (offenders.length > 0) return check(CHECK_NAMES.linksPairs, false, few(offenders));
  return check(CHECK_NAMES.linksPairs, true, `the closure is consistent by pair: ${plural(pairs.size, 'claim version')}, ${plural((l['edges'] as Row[]).length, 'edge')}, ${plural(entities.size, 'entity', 'entities')} (${String(l['format'])})`);
}

/** D7: the intake contract's policy — active, an upload contract, rights confirmed; its ceiling is the gate every imported header meets or is excluded by. */
function policyCheck(s: StagedPackage, f: ManifestFacts, c: VerificationContext): ImportCheck {
  if (f.objects === null) return check(CHECK_NAMES.policy, null, 'not checked: the manifest did not parse');
  if (c.partner === null) return check(CHECK_NAMES.policy, null, 'not checked: no partner holds the key, so no intake contract applies');
  const k = c.contract;
  if (k === null) return check(CHECK_NAMES.policy, false, `the partner's intake source ${String(c.partner['intake_source_id'])}@${String(c.partner['intake_contract_version'])} is not recorded in this domain`);
  const label = `${String(k['source_key'] ?? k['source_id'])}@${String(k['contract_version'])}`;
  if (k['lifecycle_state'] !== 'active' || k['connector_kind'] !== 'upload' || k['rights_state'] !== 'confirmed') {
    return check(CHECK_NAMES.policy, false, `the intake source ${label} is not an active upload contract with confirmed rights (it is ${String(k['lifecycle_state'])}, ${String(k['connector_kind'])}, rights ${String(k['rights_state'])})`);
  }
  const ceiling = String(k['classification_ceiling'] ?? '');
  const above = (h: unknown): boolean => classificationRank(isObject(h) ? h['classification'] : undefined) > classificationRank(ceiling);
  let within = 0; let over = 0;
  for (const o of f.objects) { if (above(o['header'])) over += 1; else within += 1; }
  let claimsWithin = 0; let claimsOver = 0;
  const l = isObject(s.links) ? s.links : null;
  for (const cl of Array.isArray(l?.['claims']) ? (l?.['claims'] as Row[]) : []) { if (above(cl['header'])) claimsOver += 1; else claimsWithin += 1; }
  const detail = `the intake source ${label} is active with confirmed rights; ceiling ${ceiling}: ${plural(within, 'record')} and ${plural(claimsWithin, 'claim version')} within it, ${over + claimsOver} above it${over + claimsOver > 0 ? ' (excluded at admission, gate ceiling)' : ''}`;
  if (f.objects.length === 0) return check(CHECK_NAMES.policy, false, `${detail}; the package carries no record`);
  if (within === 0) return check(CHECK_NAMES.policy, false, `${detail}; no record is admissible under the ceiling`);
  return check(CHECK_NAMES.policy, true, detail);
}

function duplicateCheck(f: ManifestFacts, c: VerificationContext): ImportCheck {
  if (f.recomputedPackageDigest === null) return check(CHECK_NAMES.duplicate, null, 'not checked: no package digest');
  if (c.liveImport !== null) return check(CHECK_NAMES.duplicate, false, `package ${f.recomputedPackageDigest} is already imported into this domain as import ${String(c.liveImport['import_id'])} (state ${String(c.liveImport['state'])})`);
  return check(CHECK_NAMES.duplicate, true, `no live import of package ${f.recomputedPackageDigest} in this domain`);
}

/**
 * C2: what THIS installation knows — the origin's own record when the origin domain is here (known only when the recorded digest is the
 * presented one, N13) and the origin's revocation notice beside the package at the station — can PASS or FAIL the check; the sender's
 * exchange statement (delivery.json, the presented block) is unsigned and is a NOTE, never a verdict.
 */
function revocationCheck(s: StagedPackage, f: ManifestFacts, c: VerificationContext): ImportCheck {
  if (f.recomputedPackageDigest === null) return check(CHECK_NAMES.revocation, null, 'not checked: no package digest');
  const digest = f.recomputedPackageDigest;
  const r = s.revocation;
  if (r !== null && (r['package_digest'] === digest || r['package_digest'] === f.sig?.['package_digest'])) {
    return check(CHECK_NAMES.revocation, false, `the origin revoked this package at ${instantOf(r['revoked_at']) ?? 'an unstated instant'} (revocation.json at the station${typeof r['reason'] === 'string' ? `: ${String(r['reason']).slice(0, 120)}` : ''})`);
  }
  if (c.origin['known'] === true) {
    const revokedAt = instantOf(c.origin['revoked_at']); const expiresAt = instantOf(c.origin['expires_at']);
    if (revokedAt !== null) return check(CHECK_NAMES.revocation, false, `the origin revoked this package at ${revokedAt}`);
    if (expiresAt !== null && Date.parse(expiresAt) <= c.now.getTime()) return check(CHECK_NAMES.revocation, false, `the package expired at ${expiresAt} (the origin's record)`);
    return check(CHECK_NAMES.revocation, true, `the origin's record of package ${digest}: unrevoked, ${expiresAt === null ? 'no expiry' : `expires ${expiresAt}`}`);
  }
  const x = s.exchange;
  const expiry = x === null ? null : instantOf(x['expires_at']);
  const stated = expiry === null ? 'no expiry stated' : `names expiry ${expiry}${Date.parse(expiry) <= c.now.getTime() ? ' (past)' : ''}`;
  const ref = x === null ? 'no exchange statement was presented' : `delivery ${String(x['delivery_id'] ?? '?')} attempt ${String(x['attempt'] ?? '?')}`;
  return check(CHECK_NAMES.revocation, null, `not verifiable here — the sender's exchange statement ${stated} (unsigned; delivery.json / the presented exchange block: ${ref}); the origin's revocation reaches this domain only through its partner's notice`);
}

function exclusionsCheck(s: StagedPackage, f: ManifestFacts): ImportCheck {
  const fromManifest = f.excluded === null ? 0 : f.excluded.length;
  const l = isObject(s.links) ? s.links : null;
  const fromLinks = Array.isArray(l?.['excluded']) ? (l?.['excluded'] as unknown[]).length : 0;
  return check(CHECK_NAMES.exclusions, null, `${plural(fromManifest + fromLinks, 'item')} the origin excluded ${fromManifest + fromLinks === 1 ? 'is' : 'are'} recorded, not admitted (${fromManifest} of the manifest, ${fromLinks} of the closure)`);
}

/**
 * C5: the checks that need the MANIFEST ALONE — run before any further entry is stored; when any of them fails the remaining entries
 * are drained (digests and sizes recorded, nothing stored). `store` says whether the scan may go on storing.
 */
export function manifestChecks(s: Pick<StagedPackage, 'manifest' | 'manifestBytes' | 'manifestError'>, c: VerificationContext): { checks: ImportCheck[]; store: boolean } {
  const f = factsOf(s);
  const checks = [manifestCheck(s, f), originCheck(f, c), chainCheck(f), schemeCheck(f), partnerCheck(f, c), signatureCheck(f, c)];
  return { checks, store: checks.every((x) => x.ok !== false) };
}

/** §3.4: every check in its recorded order; `verified` = none failed. The manifest-level checks are the same functions the scan ran. */
export function verifyStaged(s: StagedPackage, c: VerificationContext): { checks: ImportCheck[]; verified: boolean; packageDigest: string | null } {
  const f = factsOf(s);
  const checks: ImportCheck[] = [
    archiveCheck(s), manifestCheck(s, f), originCheck(f, c), integrityCheck(s, f, c), reimportCheck(f), completenessCheck(s, f), chainCheck(f),
    schemeCheck(f), partnerCheck(f, c), signatureCheck(f, c), linksFileCheck(s, f), linksPairsCheck(s, f), policyCheck(s, f, c), duplicateCheck(f, c),
    revocationCheck(s, f, c), exclusionsCheck(s, f),
  ];
  return { checks, verified: checks.every((x) => x.ok !== false), packageDigest: f.recomputedPackageDigest };
}

/** The manifest's own facts for the import row's `origin` (what the manifest states; nulls when it did not parse). */
export function originOf(s: Pick<StagedPackage, 'manifest' | 'manifestBytes'>): Row {
  const f = factsOf(s);
  const linksBlock = f.linksBlock;
  return {
    tenant_id: f.pkg['tenant_id'] ?? null, domain_id: f.pkg['domain_id'] ?? null, action_id: f.pkg['action_id'] ?? null,
    format: f.manifest?.format ?? null, scheme: f.sig?.['scheme'] ?? null, key_id: f.keyId,
    package_digest: f.recomputedPackageDigest, stated_package_digest: f.sig?.['package_digest'] ?? null, objects_digest: f.recomputedObjectsDigest,
    manifest_digest: s.manifestBytes === null ? null : sha256Hex(s.manifestBytes),
    built_at: f.pkg['built_at'] ?? null, built_by: f.pkg['built_by'] ?? null,
    object_count: f.objects === null ? null : f.objects.length, excluded_count: f.excluded === null ? null : f.excluded.length,
    links: linksBlock,
  };
}

// ───────────────────────── the plan (D3, N3–N6) ─────────────────────────

export type ImportItemKind = 'record' | 'claim' | 'entity' | 'identifier_system' | 'identifier' | 'edge' | 'exclusion';
export interface PlannedItem {
  item_id: string; kind: ImportItemKind; origin_ref: string;
  /** N3: the origin's object id for a record or a claim (the reuse key across versions), null otherwise. */
  origin_object_id: string | null;
  origin: Row; staged: Row | null; planned: Row;
  disposition: 'staged' | 'excluded'; gate: string | null; reason: string | null; dependency_order: number;
}
export interface ImportPlan {
  items: PlannedItem[];
  /** Every origin uuid the plan gives a new id: record and claim object ids, manifest ids, entity ids, edge ids. */
  map: Map<string, string>;
  counts: Record<string, number>;
}
/** What the service looks up for the plan (N3, N4): earlier imports' items of this domain and the domain's authoritative identifiers. */
export interface PlanLookup {
  /** An item admitted or reused into this domain by an earlier import, by its origin OBJECT id — any version (records, claims). */
  priorByObject(kind: 'record' | 'claim', originObjectId: string): Row | null;
  /** The same origin ref (the exact pair for records and claims; entity:<id>, edge:<id> otherwise) admitted or reused earlier. */
  priorByRef(kind: ImportItemKind, originRef: string): Row | null;
  /** The ONE entity of this domain an AUTHORITATIVE (system_key, value) identifies, or null. */
  entityByIdentifier(systemKey: string, value: string): string | null;
}
const plannedIdOf = (prior: Row, key: string): string | null => {
  const planned = isObject(prior['planned']) ? (prior['planned'] as Row) : {};
  const admitted = isObject(prior['admitted']) ? (prior['admitted'] as Row) : {};
  const v = admitted[key] ?? planned[key];
  return typeof v === 'string' ? v : null;
};

/**
 * The items of the package with the ids minted HERE (the map is fixed at the open), in dependency order: records, claim versions,
 * identifier systems, entities, identifiers, edges (a superseding edge before the edge it supersedes), then the origin's exclusions
 * (settled at the open, C9). A planned reuse or a planned refusal travels inside `planned` (`reuse`, `refusal`) for the admission to act on.
 */
export function planOf(s: StagedPackage, c: VerificationContext, mint: () => string, lookup: PlanLookup): ImportPlan {
  void c;
  const f = factsOf(s);
  const map = new Map<string, string>();
  const items: PlannedItem[] = [];
  const seen = new Set<string>();
  let order = 0;
  const push = (item: Omit<PlannedItem, 'item_id' | 'dependency_order'>): PlannedItem | null => {
    const key = `${item.kind}:${item.origin_ref}`;
    if (seen.has(key)) return null;
    seen.add(key);
    const full: PlannedItem = { item_id: mint(), dependency_order: order, ...item };
    order += 1;
    items.push(full);
    return full;
  };
  const entryByName = new Map(s.entries.map((e) => [e.name, e]));

  // RECORDS — the manifest's objects, in the package's order.
  for (const o of f.objects ?? []) {
    if (!isObject(o)) continue;
    const objectId = String(o['object_id']); const version = Number(o['object_version']);
    const ref = `${objectId}@${version}`;
    const b = isObject(o['bytes']) ? (o['bytes'] as Row) : {}; const src = isObject(o['source']) ? (o['source'] as Row) : {};
    const file = String(b['file'] ?? ''); const entry = entryByName.get(file);
    const prior = lookup.priorByRef('record', ref); const priorObject = prior ?? lookup.priorByObject('record', objectId);
    const newObjectId = (priorObject === null ? null : plannedIdOf(priorObject, 'object_id')) ?? map.get(objectId) ?? mint();
    map.set(objectId, newObjectId);
    const originManifestId = String(o['manifest_id'] ?? '');
    const planned: Row = { object_id: newObjectId, manifest_id: null };
    if (prior !== null) {
      const po = isObject(prior['origin']) ? (prior['origin'] as Row) : {};
      const sameCanonical = po['content_digest'] === o['content_digest']; const sameBytes = po['bytes_digest'] === b['content_digest'];
      const priorManifest = plannedIdOf(prior, 'manifest_id');
      if (sameCanonical && sameBytes && priorManifest !== null) {
        planned['manifest_id'] = priorManifest;
        planned['reuse'] = { item_id: String(prior['item_id']), import_id: String(prior['import_id']), admitted: prior['admitted'] ?? null };
      } else {
        planned['manifest_id'] = mint();
        planned['refusal'] = { gate: 'integrity', reason: `${ref} was admitted into this domain by import ${String(prior['import_id'])} with canonical digest ${String(po['content_digest'])} and bytes digest ${String(po['bytes_digest'])}; this package carries canonical digest ${String(o['content_digest'])} and bytes digest ${String(b['content_digest'])} under the same origin version` };
      }
    } else {
      planned['manifest_id'] = mint();
    }
    if (UUID.test(originManifestId)) map.set(originManifestId, String(planned['manifest_id']));
    if (planned['refusal'] === undefined && planned['reuse'] === undefined) {
      if (entry === undefined) planned['refusal'] = { gate: 'evidence', reason: `the archive carries no entry ${file || '(unnamed)'} for ${ref}` };
      else if (entry.held === 'oversize') planned['refusal'] = { gate: 'oversize', reason: `${file} is ${entry.size} bytes, above the vault's blob ceiling; the bytes were hashed and not stored` };
      else if (entry.held === 'drained') planned['refusal'] = { gate: 'evidence', reason: `${file} was not stored: the package failed its manifest checks before the entry arrived` };
    }
    push({
      kind: 'record', origin_ref: ref, origin_object_id: objectId,
      origin: { object_id: objectId, object_version: version, object_type: o['object_type'] ?? null, schema_ref: isObject(o['header']) ? ((o['header'] as Row)['schema_ref'] ?? null) : null, content_digest: o['content_digest'] ?? null,
                manifest_id: originManifestId || null, file: file || null, bytes_digest: b['content_digest'] ?? null, byte_length: b['byte_length'] ?? null, media_type_declared: b['media_type_declared'] ?? null,
                classification: isObject(o['header']) ? ((o['header'] as Row)['classification'] ?? null) : null, source: { source_id: src['source_id'] ?? null, source_key: src['source_key'] ?? null, contract_version: src['contract_version'] ?? null, rights_state: src['rights_state'] ?? null } },
      staged: entry === undefined || entry.held !== 'quarantine' ? null : { quarantine_locator: entry.quarantineLocator, digest: entry.digest, size: entry.size, file },
      planned, disposition: 'staged', gate: null, reason: null,
    });
  }

  // THE CLOSURE — claims by pair (a /1 closure: the entry's version alone, N6), identifier systems, entities (N4), identifiers, edges (N5).
  const l = isObject(s.links) ? s.links : null;
  const linksFormat = l === null ? null : String(l['format'] ?? '');
  const claimEntries = Array.isArray(l?.['claims']) ? (l?.['claims'] as Row[]) : [];
  const versionExclusions: Array<{ ref: string; origin: Row; reason: string }> = [];
  for (const cl of claimEntries) {
    if (!isObject(cl)) continue;
    const objectId = String(cl['object_id']); const version = Number(cl['object_version']);
    const ref = `${objectId}@${version}`;
    const prior = lookup.priorByRef('claim', ref); const priorObject = prior ?? lookup.priorByObject('claim', objectId);
    const newObjectId = (priorObject === null ? null : plannedIdOf(priorObject, 'object_id')) ?? map.get(objectId) ?? mint();
    map.set(objectId, newObjectId);
    const rows = Array.isArray(cl['lineage']) ? (cl['lineage'] as Row[]).filter(isObject) : [];
    const own = rows.find((r) => Number(r['claim_version']) === version) ?? null;
    if (linksFormat === 'eye-customer-export-links/1') {
      for (const r of rows) if (r !== own) versionExclusions.push({ ref: `claim_version:${objectId}@${String(r['claim_version'])}`, origin: { kind: 'claim_version', object_id: objectId, object_version: r['claim_version'] ?? null, lineage: r }, reason: `a version of claim ${objectId} the links/1 closure does not carry (the entry's version ${version} alone is admitted)` });
    }
    const planned: Row = { object_id: newObjectId };
    if (prior !== null) {
      const po = isObject(prior['origin']) ? (prior['origin'] as Row) : {};
      if (po['content_digest'] === cl['content_digest']) planned['reuse'] = { item_id: String(prior['item_id']), import_id: String(prior['import_id']), admitted: prior['admitted'] ?? null };
      else planned['refusal'] = { gate: 'integrity', reason: `${ref} was admitted into this domain by import ${String(prior['import_id'])} with canonical digest ${String(po['content_digest'])}; this package carries ${String(cl['content_digest'])} under the same origin version` };
    } else if (own === null) {
      planned['refusal'] = { gate: 'record', reason: `the closure carries no lineage row for version ${version} of claim ${objectId}` };
    }
    push({
      kind: 'claim', origin_ref: ref, origin_object_id: objectId,
      origin: { object_id: objectId, object_version: version, object_type: cl['object_type'] ?? null, schema_ref: cl['schema_ref'] ?? (isObject(cl['header']) ? ((cl['header'] as Row)['schema_ref'] ?? null) : null), content_digest: cl['content_digest'] ?? null,
                classification: isObject(cl['header']) ? ((cl['header'] as Row)['classification'] ?? null) : null,
                evidence: own === null ? null : { object_id: own['evidence_object_id'] ?? null, digest: own['evidence_digest'] ?? null }, lineage: own, referenced_by: cl['referenced_by'] ?? null },
      staged: null, planned, disposition: 'staged', gate: null, reason: null,
    });
  }
  for (const sys of Array.isArray(l?.['identifier_systems']) ? (l?.['identifier_systems'] as Row[]) : []) {
    if (!isObject(sys) || typeof sys['system_key'] !== 'string') continue;
    push({ kind: 'identifier_system', origin_ref: `system:${sys['system_key']}`, origin_object_id: null,
           origin: { system_key: sys['system_key'], authority: sys['authority'] ?? null, description: sys['description'] ?? null, is_authoritative: sys['is_authoritative'] === true },
           staged: null, planned: {}, disposition: 'staged', gate: null, reason: null });
  }
  // Entities in DEPENDENCY order (N5): an entity's successor (superseded_by) and split origin (split_from) precede it when carried,
  // since the port admits a reference to an admitted entity of this domain only; then the closure's own order.
  const rawEntities = Array.isArray(l?.['entities']) ? (l?.['entities'] as Row[]).filter(isObject) : [];
  const entityIds = new Set(rawEntities.map((e) => String(e['entity_id'])));
  const entityDepth = (e: Row, hops = 0): number => {
    let d = 0;
    for (const k of ['superseded_by', 'split_from'] as const) {
      const ref = typeof e[k] === 'string' ? (e[k] as string) : null;
      if (ref === null || !entityIds.has(ref) || hops > rawEntities.length) continue;
      const next = rawEntities.find((x) => String(x['entity_id']) === ref);
      if (next !== undefined && next !== e) d = Math.max(d, 1 + entityDepth(next, hops + 1));
    }
    return d;
  };
  const entityEntries = rawEntities.map((e, i) => ({ e, d: entityDepth(e), i })).sort((x, y) => x.d - y.d || x.i - y.i).map((x) => x.e);
  for (const en of entityEntries) {
    const entityId = String(en['entity_id']);
    const identifiers = Array.isArray(en['identifiers']) ? (en['identifiers'] as Row[]).filter(isObject) : [];
    const prior = lookup.priorByRef('entity', `entity:${entityId}`);
    let planned: Row;
    const priorId = prior === null ? null : plannedIdOf(prior, 'entity_id');
    if (priorId !== null) planned = { entity_id: priorId, reuse: { item_id: String(prior?.['item_id']), import_id: String(prior?.['import_id']), admitted: prior?.['admitted'] ?? null } };
    else {
      let byIdentifier: { entity_id: string; system_key: string; value: string } | null = null;
      for (const idf of identifiers) {
        const found = lookup.entityByIdentifier(String(idf['system_key']), String(idf['value']));
        if (found !== null) { byIdentifier = { entity_id: found, system_key: String(idf['system_key']), value: String(idf['value']) }; break; }
      }
      planned = byIdentifier === null ? { entity_id: mint() } : { entity_id: byIdentifier.entity_id, reuse: { by: 'identifier', system_key: byIdentifier.system_key, value: byIdentifier.value, admitted: { entity_id: byIdentifier.entity_id } } };
    }
    map.set(entityId, String(planned['entity_id']));
    push({ kind: 'entity', origin_ref: `entity:${entityId}`, origin_object_id: null,
           origin: { entity_id: entityId, entity_type: en['entity_type'] ?? null, canonical_name: en['canonical_name'] ?? null, lifecycle_state: en['lifecycle_state'] ?? null, split_from: en['split_from'] ?? null, superseded_by: en['superseded_by'] ?? null, identifiers: identifiers.length },
           staged: null, planned, disposition: 'staged', gate: null, reason: null });
  }
  for (const en of entityEntries) {
    const entityId = String(en['entity_id']);
    for (const idf of Array.isArray(en['identifiers']) ? (en['identifiers'] as Row[]).filter(isObject) : []) {
      push({ kind: 'identifier', origin_ref: `identifier:${String(idf['system_key'])}:${String(idf['value'])}`, origin_object_id: null,
             origin: { entity_id: entityId, system_key: idf['system_key'] ?? null, value: idf['value'] ?? null, source_claim_object_id: idf['source_claim_object_id'] ?? null, source_evidence_object_id: idf['source_evidence_object_id'] ?? null },
             staged: null, planned: { identifier_id: mint(), entity_id: map.get(entityId) ?? null }, disposition: 'staged', gate: null, reason: null });
    }
  }
  const edgeEntries = Array.isArray(l?.['edges']) ? (l?.['edges'] as Row[]).filter(isObject) : [];
  const edgeIds = new Set(edgeEntries.map((e) => String(e['edge_id'])));
  const depth = (e: Row, hops = 0): number => {
    const succ = typeof e['superseded_by'] === 'string' ? (e['superseded_by'] as string) : null;
    if (succ === null || !edgeIds.has(succ) || hops > edgeEntries.length) return 0;
    const next = edgeEntries.find((x) => String(x['edge_id']) === succ);
    return next === undefined ? 0 : 1 + depth(next, hops + 1);
  };
  const ordered = edgeEntries.map((e) => ({ e, d: depth(e), id: String(e['edge_id']) })).sort((x, y) => x.d - y.d || (x.id < y.id ? -1 : x.id > y.id ? 1 : 0));
  for (const { e } of ordered) {
    const edgeId = String(e['edge_id']);
    const prior = lookup.priorByRef('edge', `edge:${edgeId}`);
    const priorId = prior === null ? null : plannedIdOf(prior, 'edge_id');
    const planned: Row = priorId === null ? { edge_id: mint() } : { edge_id: priorId, reuse: { item_id: String(prior?.['item_id']), import_id: String(prior?.['import_id']), admitted: prior?.['admitted'] ?? null } };
    map.set(edgeId, String(planned['edge_id']));
    push({ kind: 'edge', origin_ref: `edge:${edgeId}`, origin_object_id: null, origin: { ...e }, staged: null, planned, disposition: 'staged', gate: null, reason: null });
  }

  // THE ORIGIN'S EXCLUSIONS — the manifest's and the closure's, settled at the open (C9); a /1 closure's uncarried claim versions with them (N6).
  for (const x of f.excluded ?? []) {
    if (!isObject(x)) continue;
    const ref = `excluded:record:${String(x['manifest_id'] ?? x['object_id'] ?? 'unnamed')}`;
    push({ kind: 'exclusion', origin_ref: ref, origin_object_id: null, origin: { kind: 'record', ...x }, staged: null, planned: {}, disposition: 'excluded', gate: 'origin_excluded', reason: `the origin excluded it (${String(x['gate'] ?? '?')}: ${String(x['reason'] ?? '')})`.slice(0, 600) });
  }
  for (const x of Array.isArray(l?.['excluded']) ? (l?.['excluded'] as Row[]).filter(isObject) : []) {
    const kind = String(x['kind'] ?? 'item');
    const id = kind === 'edge' ? String(x['edge_id'] ?? '?') : kind === 'entity' ? String(x['entity_id'] ?? '?') : `${String(x['object_id'] ?? '?')}${x['object_version'] === undefined || x['object_version'] === null ? '' : `@${String(x['object_version'])}`}`;
    push({ kind: 'exclusion', origin_ref: `excluded:${kind}:${id}`, origin_object_id: null, origin: { ...x }, staged: null, planned: {}, disposition: 'excluded', gate: 'origin_excluded', reason: `the origin excluded it (${String(x['gate'] ?? '?')}: ${String(x['reason'] ?? '')})`.slice(0, 600) });
  }
  for (const v of versionExclusions) push({ kind: 'exclusion', origin_ref: `excluded:${v.ref}`, origin_object_id: null, origin: v.origin, staged: null, planned: {}, disposition: 'excluded', gate: 'origin_excluded', reason: v.reason });

  const counts: Record<string, number> = { records: 0, claims: 0, identifier_systems: 0, entities: 0, identifiers: 0, edges: 0, exclusions: 0, oversize: 0, drained: 0 };
  for (const it of items) {
    const k = it.kind === 'record' ? 'records' : it.kind === 'claim' ? 'claims' : it.kind === 'identifier_system' ? 'identifier_systems' : it.kind === 'entity' ? 'entities' : it.kind === 'identifier' ? 'identifiers' : it.kind === 'edge' ? 'edges' : 'exclusions';
    counts[k] = (counts[k] ?? 0) + 1;
  }
  for (const e of s.entries) { if (e.held === 'oversize') counts['oversize'] = (counts['oversize'] ?? 0) + 1; if (e.held === 'drained') counts['drained'] = (counts['drained'] ?? 0) + 1; }
  return { items, map, counts };
}

// ───────────────────────── the imported record (D3, N1) ─────────────────────────

const UUID_TOKEN = /(?<![0-9a-f-])[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![0-9a-f-])/gi;
/**
 * Every uuid TOKEN — bounded by characters outside [0-9a-f-] — in any string VALUE at any depth, replaced when the map has it (case-
 * insensitively; the replacement is the map's spelling). Object keys are left as they are; numbers, booleans and nulls pass through.
 */
export function remapUuids<T>(value: T, map: ReadonlyMap<string, string>): T {
  if (map.size === 0) return value;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') return v.replace(UUID_TOKEN, (m) => map.get(m) ?? map.get(m.toLowerCase()) ?? m);
    if (Array.isArray(v)) return v.map(walk);
    if (v !== null && typeof v === 'object') {
      const out: Row = {};
      for (const [k, x] of Object.entries(v as Row)) out[k] = walk(x);
      return out;
    }
    return v;
  };
  return walk(value) as T;
}

/** The import form of an origin schema_ref, or null when the schema has none (the item is refused, gate schema). */
export function importFormOf(schemaRef: unknown): string | null {
  return typeof schemaRef === 'string' ? (IMPORT_FORMS[schemaRef] ?? null) : null;
}

/**
 * D3, N1: the origin's 43-field header as the IMPORTING domain's — the identity block, the owner, the record time, the correlation and
 * the provenance reference are this domain's; the reference fields are remapped; every other field is carried verbatim (see the module
 * comment). Throws when the origin's schema has no import form — the caller refuses the item (gate schema) before calling.
 */
export function importedHeaderOf(origin: CanonicalHeader, a: { map: ReadonlyMap<string, string>; importId: string; tenantId: string; domainId: string; actor: string; correlationId: string; contentRef: string | null; recordedAt: string; provenanceRef: string }): CanonicalHeader {
  const form = importFormOf(origin.schema_ref);
  if (form === null) throw new Error(`schema ${String(origin.schema_ref)} has no import form`);
  const remap = (v: string | null): string | null => (v === null ? null : remapUuids(v, a.map));
  const remapAll = (v: string[]): string[] => remapUuids(v, a.map);
  const newId = a.map.get(origin.object_id) ?? origin.object_id;
  return {
    object_id: newId,
    object_type: origin.object_type,
    tenant_id: a.tenantId,
    domain_id: a.domainId,
    scope: 'DOMAIN',
    object_version: String(origin.object_version),
    lifecycle_state: origin.lifecycle_state,
    owning_component: origin.owning_component,
    accountable_owner: `principal:${a.actor}`,
    source_object_ids: [...remapAll(origin.source_object_ids), `import:${a.importId}`],
    event_time: origin.event_time,
    observation_time: origin.observation_time,
    valid_from: origin.valid_from,
    valid_to: origin.valid_to,
    recorded_at: a.recordedAt,
    time_precision: origin.time_precision,
    source_clock_quality: origin.source_clock_quality,
    truth_state: origin.truth_state,
    synthetic_state: origin.synthetic_state,
    confidence: origin.confidence,
    uncertainty: origin.uncertainty,
    evidence_refs: remapAll(origin.evidence_refs),
    provenance_ref: a.provenanceRef,
    method_ref: origin.method_ref,
    contradiction_refs: remapAll(origin.contradiction_refs),
    corroboration_refs: remapAll(origin.corroboration_refs),
    human_refs: remapAll(origin.human_refs),
    classification: origin.classification,
    purpose_scope: origin.purpose_scope,
    rights_profile: origin.rights_profile,
    residency_profile: origin.residency_profile,
    retention_profile: origin.retention_profile,
    access_policy_ref: origin.access_policy_ref,
    quality_profile: origin.quality_profile,
    quality_state: origin.quality_state,
    freshness_state: origin.freshness_state,
    schema_ref: form,
    ontology_ref: origin.ontology_ref,
    correction_of: remap(origin.correction_of),
    supersedes: remap(origin.supersedes),
    withdrawal_reason: origin.withdrawal_reason,
    audit_correlation_id: a.correlationId,
    content_ref: a.contentRef ?? remap(origin.content_ref),
  };
}

/** The provenance block every imported payload carries (`payload.imported_from`; the registry's IMPORTED_FROM_SCHEMA, exactly these members). */
export interface ImportedFrom {
  format: typeof IMPORT_PROVENANCE_FORMAT;
  import_id: string; partner_key: string; imported_at: string;
  package: { tenant_id: string | null; domain_id: string | null; action_id: string | null; package_digest: string | null; archive_digest: string | null; manifest_digest: string | null; built_at: string | null; signature: { scheme: string | null; key_id: string | null } };
  object: { object_id: string; object_version: number; object_type: string; schema_ref: string; content_digest: string };
  header: Row; payload: Row;
}
export function importedFromOf(a: { importId: string; partnerKey: string; importedAt: string; origin: Row; archiveDigest: string; object: { object_id: string; object_version: number; object_type: string; schema_ref: string; content_digest: string }; header: Row; payload: Row }): ImportedFrom {
  const o = a.origin;
  const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
  return {
    format: IMPORT_PROVENANCE_FORMAT, import_id: a.importId, partner_key: a.partnerKey, imported_at: a.importedAt,
    package: { tenant_id: str(o['tenant_id']), domain_id: str(o['domain_id']), action_id: str(o['action_id']), package_digest: str(o['package_digest']), archive_digest: a.archiveDigest, manifest_digest: str(o['manifest_digest']), built_at: str(o['built_at']), signature: { scheme: str(o['scheme']), key_id: str(o['key_id']) } },
    object: a.object, header: a.header, payload: a.payload,
  };
}

/** D3: the origin's payload remapped through the map, the caller's overrides (an EVD's manifest_id and locator) on top, `imported_from` last — verbatim, never remapped. */
export function importedPayloadOf(originPayload: Row, a: { map: ReadonlyMap<string, string>; provenance: ImportedFrom; overrides: Row }): Row {
  return { ...remapUuids(originPayload, a.map), ...a.overrides, imported_from: a.provenance as unknown as Row };
}

/** A local sha256 rather than the vault's, so this module stays free of every service import (unit-testable on fixtures). */
function sha256Hex(bytes: Uint8Array): string { return createHash('sha256').update(bytes).digest('hex'); }
