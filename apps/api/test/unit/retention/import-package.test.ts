/**
 * The governed import's PURE rules on fixtures (CP-6 B16; §3.1, §3.2, §3.4): the stream scanner against the deterministic builder,
 * the uuid remap, the imported header, the ordered checks on a real key-signed package (an Ed25519 pair generated here, the chain
 * computed by the product's own functions) with one thing wrong at a time, and the plan's map. No database, no disk: what the
 * harness proves end to end on a fresh database, this holds at the function boundary.
 */
import { describe, expect, it } from 'vitest';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import { Readable } from 'node:stream';
import { canonicalHeaderDigest, contentDigest, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { buildUstar, scanUstarStream, ExportArchiveError, type ScannedEntry } from '../../../src/retention/export-archive.js';
import { objectsDigestOf, packageDigestOf } from '../../../src/retention/export-package.js';
import { keyIdOf } from '../../../src/retention/export-signing.js';
import { CHECK_NAMES, IMPORT_CHECKS, IMPORT_FORMS, importedHeaderOf, importedPayloadOf, importedFromOf, manifestChecks, planOf, remapUuids, verifyStaged,
         type StagedEntry, type StagedPackage, type VerificationContext } from '../../../src/retention/import-package.js';

type Row = Record<string, unknown>;
const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');
let counter = 0;
/** A deterministic uuid-shaped id for fixtures (the product mints uuidv7; the shape is what matters here). */
const uid = (): string => { counter += 1; const h = counter.toString(16).padStart(12, '0'); return `0190a1b2-c3d4-7000-8000-${h}`; };
const T1 = uid(); const D1 = uid(); const T2 = T1; const D2 = uid(); const ACTION = uid();

function headerOf(a: { objectId: string; type: string; schemaRef: string; version?: number; classification?: string; contentRef?: string | null; evidenceRefs?: string[]; sourceObjectIds?: string[] }): CanonicalHeader {
  return {
    object_id: a.objectId, object_type: a.type, tenant_id: T1, domain_id: D1, scope: 'DOMAIN', object_version: String(a.version ?? 1), lifecycle_state: 'admitted',
    owning_component: 'CP-OBS-01', accountable_owner: 'principal:origin', source_object_ids: a.sourceObjectIds ?? [],
    event_time: '2026-03-01T10:00:00.000Z', observation_time: '2026-03-01T10:05:00.000Z', valid_from: null, valid_to: null, recorded_at: '2026-03-01T10:06:00.000Z',
    time_precision: 'exact', source_clock_quality: 'trusted', truth_state: 'observed', synthetic_state: false, confidence: null, uncertainty: null,
    evidence_refs: a.evidenceRefs ?? [], provenance_ref: 'SRC:origin-source@1', method_ref: 'method:origin', contradiction_refs: [], corroboration_refs: [], human_refs: [],
    classification: a.classification ?? 'internal', purpose_scope: 'observation', rights_profile: 'internal', residency_profile: 'EU', retention_profile: 'default', access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: a.schemaRef, ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null,
    audit_correlation_id: uid(), content_ref: a.contentRef ?? null,
  };
}

/** A key-signed package (eye-customer-export/2) with one record, a two-version claim, two entities, one edge and one exclusion — the fixture every check reads. */
function fixture(opts: { scheme?: 'chain' | 'key'; edgeVersion?: number; originTenant?: string; originDomain?: string; recordClassification?: string; linksFormat?: '1' | '2' } = {}) {
  counter = 100;
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const keyId = keyIdOf(publicKey.export({ type: 'spki', format: 'der' }));
  const evdId = uid(); const manifestId = uid(); const claimId = uid(); const entA = uid(); const entB = uid(); const edgeId = uid();
  const bytes = Buffer.from('col_a,col_b\n1,2\n3,4\n', 'utf8'); const bytesDigest = sha256(bytes);
  const evdPayload: Row = { obs_object_id: uid(), manifest_id: manifestId, locator: `${T1}/${D1}/${manifestId}`, content_digest: bytesDigest, byte_length: bytes.byteLength, vault: 'evidence', acquisition_mode: 'live', media_type_declared: 'text/csv', media_type_sniffed: null, active_content_risk: false, parent_evd_id: null, fragment: null, authenticity: { byte_integrity: 'verified' } };
  const evdHeader = headerOf({ objectId: evdId, type: 'EVD', schemaRef: 'EVD@v1', classification: opts.recordClassification ?? 'internal', contentRef: `vault:evidence/${T1}/${D1}/${manifestId}`, evidenceRefs: [`blob:${manifestId}`], sourceObjectIds: [`OBS:${String(evdPayload['obs_object_id'])}`] });
  const evdDigest = canonicalHeaderDigest(evdHeader, evdPayload);
  const claim = (version: number, confidence: number) => {
    const payload: Row = { subject: entA, object: entB, predicate: 'supplies', confidence: { value: confidence }, evidence: { object_id: evdId } };
    const header = headerOf({ objectId: claimId, type: 'REL', schemaRef: 'REL@v1', version, evidenceRefs: [`EVD:${evdId}`] });
    return { object_id: claimId, object_version: version, object_type: 'REL', schema_ref: 'REL@v1', content_digest: canonicalHeaderDigest(header, payload), header, payload,
             lineage: [{ claim_version: version, evidence_object_id: evdId, evidence_digest: bytesDigest, byte_start: 0, byte_end: 12, run_id: uid(), method_id: uid(), call_id: uid(), mode: 'local-live', confidence, retrieval_decision_id: uid(), retrieval_audit_seq: 7 }],
             referenced_by: { lineage: true, edges: version === 1 ? 1 : 0 } };
  };
  const c1 = claim(1, 0.8); const c2 = claim(2, 0.9);
  const linksFormat = opts.linksFormat === '1' ? 'eye-customer-export-links/1' : 'eye-customer-export-links/2';
  const claims = linksFormat === 'eye-customer-export-links/1' ? [{ ...c2, lineage: [...c1.lineage, ...c2.lineage] }] : [c1, c2];
  const links: Row = {
    format: linksFormat, package: { action_id: ACTION, tenant_id: T1, domain_id: D1 }, evidence: [evdId], claims,
    edges: [{ edge_id: edgeId, predicate: 'supplies', subject_entity_id: entA, object_entity_id: entB, valid_from: '2026-01-01T00:00:00.000Z', valid_to: null, asserted_at: '2026-03-01T10:07:00.000Z', retracted_at: null, superseded_at: null, state: 'asserted',
              claim: { object_id: claimId, object_version: opts.edgeVersion ?? 1 }, evidence: { object_id: evdId, digest: bytesDigest }, confidence: 0.8, mode: 'local-live', superseded_by: null, retraction_reason: null, run_id: null, method_id: null, asserted_by: uid(), retracted_by: null }],
    entities: [
      { entity_id: entA, entity_type: 'organization', canonical_name: 'Nordwerk GmbH', lifecycle_state: 'active', split_from: null, superseded_by: null, identifiers: [{ system_key: 'lei', value: 'LEI-NORDWERK-1', source_claim_object_id: claimId, source_evidence_object_id: evdId }] },
      { entity_id: entB, entity_type: 'organization', canonical_name: 'Baltic Steel AS', lifecycle_state: 'active', split_from: null, superseded_by: null, identifiers: [] },
    ],
    identifier_systems: [{ system_key: 'lei', authority: 'GLEIF', description: 'Legal Entity Identifier', is_authoritative: true }],
    excluded: [{ kind: 'claim', object_id: uid(), object_version: 1, gate: 'redaction', reason: 'classification restricted above the ceiling internal' }],
    counts: { claims: claims.length, edges: 1, entities: 2, excluded: 1 },
  };
  const linksBytes = Buffer.from(`${JSON.stringify(links, null, 2)}\n`, 'utf8');
  const objects: Row[] = [{ object_id: evdId, object_version: 1, content_digest: evdDigest, header: evdHeader as unknown as Row, payload: evdPayload, manifest_id: manifestId,
    bytes: { file: `${manifestId}.bin`, content_digest: bytesDigest, byte_length: bytes.byteLength, media_type_declared: 'text/csv' }, source: { source_id: uid(), source_key: 'origin-source', contract_version: 1, rights_state: 'confirmed' } }];
  const excluded: Row[] = [{ manifest_id: uid(), object_id: uid(), object_version: 1, gate: 'redaction', reason: 'above the ceiling' }];
  const body = {
    format: 'eye-customer-export/1',
    package: { action_id: ACTION, tenant_id: opts.originTenant ?? T1, domain_id: opts.originDomain ?? D1, destination: 'export', locator_prefix: `${T1}/${D1}/${ACTION}/`, built_at: '2026-03-02T09:00:00.000Z', built_by: 'principal:origin-steward',
               links: { file: 'links.json', links_digest: sha256(linksBytes), byte_length: linksBytes.byteLength, format: linksFormat, claims: claims.length, edges: 1, entities: 2, excluded: 1 } },
    authorization: { scope_digest: 'a'.repeat(64), approval_id: uid(), approver: 'principal:authority', approved_at: '2026-03-02T08:00:00.000Z', rationale: 'fixture', opened_by: 'principal:origin-steward' },
    gates: { approval: 'live approval on the resolved scope digest', redaction: { classification_ceiling: 'internal' }, format: 'json-manifest+raw-bytes', destination: 'export' },
    objects, excluded,
  };
  const boundTo = { action_id: ACTION, scope_digest: body.authorization.scope_digest, approval_id: body.authorization.approval_id };
  const statement = 'fixture statement';
  const packageDigest = packageDigestOf({ ...body, signature: { bound_to: boundTo, statement } });
  let signature: Row = { scheme: 'eye-digest-chain/1', objects_digest: objectsDigestOf(objects), package_digest: packageDigest, bound_to: boundTo, statement };
  if (opts.scheme !== 'chain') signature = { ...signature, scheme: 'eye-customer-export/2', key_id: keyId, algorithm: 'Ed25519', signature: sign(null, Buffer.from(packageDigest, 'utf8'), privateKey).toString('base64') };
  const manifestBytes = Buffer.from(`${JSON.stringify({ ...body, signature }, null, 2)}\n`, 'utf8');
  const tar = buildUstar([{ name: 'manifest.json', bytes: manifestBytes }, { name: `${manifestId}.bin`, bytes }, { name: 'links.json', bytes: linksBytes }], Math.floor(Date.parse(body.package.built_at) / 1000));
  const partner: Row = { partner_id: uid(), partner_key: 'nordwerk-origin', party: 'NORDWERK', key_id: keyId, public_key_pem: publicKeyPem, intake_source_id: uid(), intake_contract_version: 1, declared_at: '2026-03-01T00:00:00.000Z', retired_at: null };
  const contract: Row = { source_id: partner['intake_source_id'], contract_version: 1, source_key: 'nordwerk-exchange-intake', lifecycle_state: 'active', connector_kind: 'upload', rights_state: 'confirmed', classification_ceiling: 'internal', residency: 'EU', acquisition_mode: 'live' };
  return { tar, manifestBytes, linksBytes, bytes, bytesDigest, packageDigest, keyId, publicKeyPem, partner, contract, ids: { evdId, manifestId, claimId, entA, entB, edgeId }, links, objects, evdHeader, evdPayload, c1, c2 };
}

/** The staging as the service performs it, from the tar: every entry scanned, the manifest and the closure kept, a locator per stored entry. */
async function stageOf(tar: Buffer, a: { exchange?: Row | null; revocation?: Row | null; oversizeAbove?: number } = {}): Promise<StagedPackage> {
  const scanned = scanUstarStream(Readable.from([tar]));
  const entries: StagedEntry[] = []; let first: string | null = null;
  let manifestBytes: Buffer | null = null; let manifest: Row | null = null; let manifestError: string | null = null; let linksBytes: Buffer | null = null; let links: Row | null = null;
  let n = 0;
  for await (const e of scanned.entries) {
    const parts: Buffer[] = []; for await (const c of e.body) parts.push(c);
    const b = Buffer.concat(parts); n += 1;
    if (first === null) first = e.name;
    const oversize = a.oversizeAbove !== undefined && b.byteLength > a.oversizeAbove;
    entries.push({ name: e.name, size: b.byteLength, digest: sha256(b), regular: e.regular, quarantineLocator: oversize ? null : `${T2}/${D2}/0190a1b2-c3d4-7000-8000-${n.toString(16).padStart(12, '0')}`, held: oversize ? 'oversize' : 'quarantine' });
    if (e.name === 'manifest.json') { manifestBytes = b; try { manifest = JSON.parse(b.toString('utf8')) as Row; } catch { manifestError = 'manifest.json does not parse'; } }
    if (e.name === 'links.json') { linksBytes = b; links = JSON.parse(b.toString('utf8')) as Row; }
  }
  return { archiveDigest: await scanned.digest(), archiveSize: await scanned.size(), archiveError: null, firstEntry: first, manifestBytes, manifest, manifestError, linksBytes, links, linksError: null, entries, exchange: a.exchange ?? null, revocation: a.revocation ?? null };
}
function contextOf(fx: ReturnType<typeof fixture>, over: Partial<VerificationContext> = {}): VerificationContext {
  return { partner: fx.partner, contract: fx.contract, origin: { known: true, revoked_at: null, expires_at: '2027-01-01T00:00:00.000Z' }, liveImport: null, importingDomain: { tenantId: T2, domainId: D2 }, now: new Date('2026-03-03T00:00:00.000Z'), vaultMaxBytes: 64 * 1024 * 1024, ...over };
}
const byName = (checks: Array<{ name: string; ok: boolean | null; detail: string | null }>, name: string) => { const c = checks.find((x) => x.name === name); if (c === undefined) throw new Error(`no check ${name}`); return c; };
const lookupNone = { priorByObject: () => null, priorByRef: () => null, entityByIdentifier: () => null };

describe('scanUstarStream — the verifier\'s scanner as a stream, against buildUstar', () => {
  it('yields the entries buildUstar wrote, in order, with their bytes; the digest and size are the archive\'s', async () => {
    const entries = [{ name: 'manifest.json', bytes: Buffer.from('{"a":1}') }, { name: `${uid()}.bin`, bytes: Buffer.alloc(1000, 7) }, { name: 'links.json', bytes: Buffer.alloc(512, 9) }];
    const tar = buildUstar(entries, 1_700_000_000);
    const scanned = scanUstarStream(Readable.from([tar.subarray(0, 700), tar.subarray(700, 701), tar.subarray(701)]));
    const seen: Array<{ name: string; size: number; regular: boolean; bytes: Buffer }> = [];
    for await (const e of scanned.entries) { const parts: Buffer[] = []; for await (const c of e.body) parts.push(c); seen.push({ name: e.name, size: e.size, regular: e.regular, bytes: Buffer.concat(parts) }); }
    expect(seen.map((s) => s.name)).toEqual(entries.map((e) => e.name));
    for (let i = 0; i < entries.length; i += 1) { expect(seen[i]?.size).toBe(entries[i]?.bytes.byteLength); expect(seen[i]?.regular).toBe(true); expect(seen[i]?.bytes.equals(entries[i]?.bytes as Buffer)).toBe(true); }
    expect(await scanned.digest()).toBe(sha256(tar));
    expect(await scanned.size()).toBe(tar.byteLength);
  });
  it('a body the consumer does not read is drained before the next entry (one pass, constant memory)', async () => {
    const tar = buildUstar([{ name: 'manifest.json', bytes: Buffer.from('{}') }, { name: 'a.bin', bytes: Buffer.alloc(5000, 1) }, { name: 'links.json', bytes: Buffer.from('[]') }], 1);
    const scanned = scanUstarStream(Readable.from([tar]));
    const names: string[] = [];
    for await (const e of scanned.entries) names.push(e.name);
    expect(names).toEqual(['manifest.json', 'a.bin', 'links.json']);
    expect(await scanned.digest()).toBe(sha256(tar));
  });
  it('the malformed cases: truncated, a lone zero block, bytes after the trailer, a duplicate name, an empty source, no magic', async () => {
    const good = buildUstar([{ name: 'manifest.json', bytes: Buffer.from('{}') }, { name: 'b.bin', bytes: Buffer.alloc(100, 2) }], 1);
    const drain = async (buf: Buffer): Promise<string> => {
      const s = scanUstarStream(Readable.from([buf]));
      try { for await (const e of s.entries) { for await (const _c of e.body) { /* drained */ } } } catch (e) { expect(e).toBeInstanceOf(ExportArchiveError); expect((e as ExportArchiveError).reason).toBe('malformed'); await expect(s.digest()).rejects.toBeInstanceOf(ExportArchiveError); return (e as Error).message; }
      throw new Error('expected a malformed archive');
    };
    expect(await drain(good.subarray(0, good.byteLength - 1024))).toMatch(/without the two-block end-of-archive trailer/);
    expect(await drain(good.subarray(0, 512 + 300))).toMatch(/truncated/);
    expect(await drain(good.subarray(0, good.byteLength - 512))).toMatch(/single zero block/);
    expect(await drain(Buffer.concat([good, Buffer.from([1])]))).toMatch(/after the end-of-archive trailer/);
    const dup = buildUstar([{ name: 'manifest.json', bytes: Buffer.from('{}') }, { name: 'manifest.json', bytes: Buffer.from('{}') }], 1);
    expect(await drain(dup)).toMatch(/appears twice/);
    expect(await drain(Buffer.alloc(0))).toMatch(/empty/);
    const noMagic = Buffer.from(good); noMagic.write('xxxxx', 257, 'latin1');
    expect(await drain(noMagic)).toMatch(/no ustar magic/);
    // Zero padding after the trailer is accepted, as the verifier accepts it.
    const padded = Buffer.concat([good, Buffer.alloc(1024, 0)]);
    const s = scanUstarStream(Readable.from([padded]));
    for await (const e of s.entries) { for await (const _c of e.body) { /* drained */ } }
    expect(await s.size()).toBe(padded.byteLength);
  });
  it('a non-regular entry is yielded with regular: false and its body still hashed', async () => {
    const tar = buildUstar([{ name: 'manifest.json', bytes: Buffer.from('{}') }, { name: 'link', bytes: Buffer.alloc(10, 3) }], 1);
    tar[512 + 512 + 156] = 0x32; // typeflag '2': a symlink
    let sum = 0; for (let i = 0; i < 512; i += 1) sum += i >= 148 && i < 156 ? 0x20 : (tar[1024 + i] as number);
    tar.write(`${sum.toString(8).padStart(6, '0')}\0 `, 1024 + 148, 'ascii');
    const seen: ScannedEntry[] = [];
    const s = scanUstarStream(Readable.from([tar]));
    for await (const e of s.entries) { seen.push(e); for await (const _c of e.body) { /* drained */ } }
    expect(seen.map((e) => [e.name, e.regular])).toEqual([['manifest.json', true], ['link', false]]);
    expect(await s.digest()).toBe(sha256(tar));
  });
});

describe('remapUuids — every uuid token in any string value, at any depth', () => {
  it('replaces tokens inside longer strings and arrays, leaves unknown ids, keys and non-strings alone, and matches case-insensitively', () => {
    const a = uid(); const b = uid(); const c = uid();
    const map = new Map([[a, b]]);
    const input = { id: a, ref: `blob:${a}`, path: `vault:evidence/${c}/${a}`, list: [a, c, 3, null], nested: { [a]: a.toUpperCase() }, hexRun: `${a}abcdef`, n: 1, t: true };
    const out = remapUuids(input, map);
    expect(out['id']).toBe(b); expect(out['ref']).toBe(`blob:${b}`); expect(out['path']).toBe(`vault:evidence/${c}/${b}`);
    expect(out['list']).toEqual([b, c, 3, null]);
    expect(Object.keys(out['nested'] as Row)).toEqual([a]); expect((out['nested'] as Row)[a]).toBe(b);
    expect(out['hexRun']).toBe(`${a}abcdef`); // not a token: the run continues in hex
    expect(out['n']).toBe(1); expect(out['t']).toBe(true);
    expect(input['id']).toBe(a); // the input is not mutated
  });
});

describe('importedHeaderOf — the importing domain\'s identity, everything else verbatim', () => {
  it('maps the id, the domain, the owner, the record time, the correlation and the provenance reference; remaps the refs; keeps the four times, the truth state and the policy labels; the result validates and digests', () => {
    const fx = fixture();
    const newEvd = uid(); const newManifest = uid();
    const map = new Map([[fx.ids.evdId, newEvd], [fx.ids.manifestId, newManifest]]);
    const importId = uid(); const corr = uid();
    const h = importedHeaderOf(fx.evdHeader, { map, importId, tenantId: T2, domainId: D2, actor: 'steward2', correlationId: corr, contentRef: `vault:evidence/${T2}/${D2}/${newManifest}`, recordedAt: '2026-03-03T00:00:00.000Z', provenanceRef: 'SRC:intake@1' });
    expect(h.object_id).toBe(newEvd); expect(h.tenant_id).toBe(T2); expect(h.domain_id).toBe(D2); expect(h.scope).toBe('DOMAIN');
    expect(h.object_version).toBe('1'); expect(h.accountable_owner).toBe('principal:steward2'); expect(h.recorded_at).toBe('2026-03-03T00:00:00.000Z'); expect(h.audit_correlation_id).toBe(corr);
    expect(h.provenance_ref).toBe('SRC:intake@1'); expect(h.schema_ref).toBe('EVD@v2');
    expect(h.source_object_ids).toEqual([...fx.evdHeader.source_object_ids, `import:${importId}`]);
    expect(h.evidence_refs).toEqual([`blob:${newManifest}`]); expect(h.content_ref).toBe(`vault:evidence/${T2}/${D2}/${newManifest}`);
    for (const k of ['event_time', 'observation_time', 'valid_from', 'valid_to', 'time_precision', 'source_clock_quality', 'truth_state', 'synthetic_state', 'classification', 'purpose_scope', 'rights_profile', 'residency_profile', 'retention_profile', 'lifecycle_state', 'owning_component', 'method_ref', 'ontology_ref', 'withdrawal_reason'] as const) expect(h[k]).toEqual(fx.evdHeader[k]);
    expect(validateHeader(h).ok).toBe(true);
    expect(Object.keys(h).length).toBe(43);
    expect(canonicalHeaderDigest(h, {})).toMatch(/^[0-9a-f]{64}$/);
  });
  it('a schema without an import form is refused before any header is built; every form maps to the +imported_from form', () => {
    const fx = fixture();
    expect(() => importedHeaderOf({ ...fx.evdHeader, schema_ref: 'OBS@v1' }, { map: new Map(), importId: uid(), tenantId: T2, domainId: D2, actor: 'x', correlationId: uid(), contentRef: null, recordedAt: '2026-03-03T00:00:00.000Z', provenanceRef: 'SRC:i@1' })).toThrow(/no import form/);
    expect(IMPORT_FORMS['CLM@v2']).toBe('CLM@v3'); expect(IMPORT_FORMS['REL@v2']).toBe('REL@v2'); expect(IMPORT_FORMS['OBS@v1']).toBeUndefined();
  });
  it('importedPayloadOf remaps the payload, applies the overrides and places imported_from last — verbatim, never remapped', () => {
    const fx = fixture();
    const newEvd = uid(); const map = new Map([[fx.ids.evdId, newEvd]]);
    const provenance = importedFromOf({ importId: uid(), partnerKey: 'nordwerk-origin', importedAt: '2026-03-03T00:00:00.000Z', origin: { tenant_id: T1, domain_id: D1, action_id: ACTION, package_digest: fx.packageDigest, manifest_digest: sha256(fx.manifestBytes), built_at: '2026-03-02T09:00:00.000Z', scheme: 'eye-customer-export/2', key_id: fx.keyId }, archiveDigest: sha256(fx.tar),
      object: { object_id: fx.ids.claimId, object_version: 1, object_type: 'REL', schema_ref: 'REL@v1', content_digest: fx.c1.content_digest }, header: fx.c1.header as unknown as Row, payload: fx.c1.payload });
    const p = importedPayloadOf(fx.c1.payload, { map, provenance, overrides: { note: 'x' } });
    expect((p['evidence'] as Row)['object_id']).toBe(newEvd);
    expect(p['note']).toBe('x');
    const from = p['imported_from'] as Row;
    expect(Object.keys(from).sort()).toEqual(['format', 'header', 'import_id', 'imported_at', 'object', 'package', 'partner_key', 'payload']);
    expect(from['format']).toBe('eye-import-provenance/1');
    expect(((from['payload'] as Row)['evidence'] as Row)['object_id']).toBe(fx.ids.evdId); // the origin's, verbatim
    expect((from['object'] as Row)['object_id']).toBe(fx.ids.claimId);
  });
});

describe('verifyStaged — the ordered checks on a key-signed package', () => {
  it('a well-formed package from a declared partner verifies: sixteen checks in the recorded order, none failed, the closure consistent by pair, the origin\'s record read', async () => {
    const fx = fixture();
    const staged = await stageOf(fx.tar);
    const r = verifyStaged(staged, contextOf(fx));
    expect(r.checks.map((c) => c.name)).toEqual([...IMPORT_CHECKS]);
    expect(r.checks.filter((c) => c.ok === false)).toEqual([]);
    expect(r.verified).toBe(true);
    expect(r.packageDigest).toBe(fx.packageDigest);
    expect(byName(r.checks, CHECK_NAMES.linksPairs).ok).toBe(true);
    expect(byName(r.checks, CHECK_NAMES.linksPairs).detail).toMatch(/2 claim versions, 1 edge, 2 entities/);
    expect(byName(r.checks, CHECK_NAMES.revocation).ok).toBe(true);
    expect(byName(r.checks, CHECK_NAMES.revocation).detail).toMatch(/the origin's record/);
    expect(byName(r.checks, CHECK_NAMES.policy).detail).toMatch(/ceiling internal: 1 record and 2 claim versions within it, 0 above it/);
    expect(byName(r.checks, CHECK_NAMES.exclusions).ok).toBeNull();
    expect(byName(r.checks, CHECK_NAMES.exclusions).detail).toMatch(/2 items the origin excluded/);
  });
  it('no partner holds the key: the partner check fails, the signature is not checked, manifestChecks says nothing more is stored', async () => {
    const fx = fixture();
    const staged = await stageOf(fx.tar);
    const c = contextOf(fx, { partner: null, contract: null });
    const r = verifyStaged(staged, c);
    expect(r.verified).toBe(false);
    expect(byName(r.checks, CHECK_NAMES.partner).ok).toBe(false);
    expect(byName(r.checks, CHECK_NAMES.partner).detail).toMatch(new RegExp(`no exchange partner of this domain holds key ${fx.keyId}; declare the partner`));
    expect(byName(r.checks, CHECK_NAMES.signature).ok).toBeNull();
    expect(byName(r.checks, CHECK_NAMES.policy).ok).toBeNull();
    expect(manifestChecks(staged, c).store).toBe(false);
    expect(manifestChecks(staged, contextOf(fx)).store).toBe(true);
  });
  it('a digest-chain-only (/1) package fails the scheme check: an import admits key-signed packages only', async () => {
    const fx = fixture({ scheme: 'chain' });
    const r = verifyStaged(await stageOf(fx.tar), contextOf(fx, { partner: null, contract: null }));
    expect(byName(r.checks, CHECK_NAMES.scheme).ok).toBe(false);
    expect(byName(r.checks, CHECK_NAMES.scheme).detail).toMatch(/the digest chain alone \(eye-digest-chain\/1\); an import admits key-signed packages only/);
    expect(byName(r.checks, CHECK_NAMES.chain).ok).toBe(true);
    expect(byName(r.checks, CHECK_NAMES.partner).ok).toBeNull();
  });
  it('a package built by the importing domain itself fails the origin check (N14)', async () => {
    const fx = fixture({ originTenant: T2, originDomain: D2 });
    const staged = await stageOf(fx.tar);
    const r = verifyStaged(staged, contextOf(fx));
    expect(byName(r.checks, CHECK_NAMES.origin).ok).toBe(false);
    expect(byName(r.checks, CHECK_NAMES.origin).detail).toMatch(/a domain does not import its own export/);
    expect(manifestChecks(staged, contextOf(fx)).store).toBe(false);
  });
  it('a record whose bytes were altered fails integrity and, with the signature intact, nothing else', async () => {
    const fx = fixture();
    const staged = await stageOf(fx.tar);
    const e = staged.entries.find((x) => x.name.endsWith('.bin')) as StagedEntry;
    e.digest = 'f'.repeat(64);
    const r = verifyStaged(staged, contextOf(fx));
    expect(byName(r.checks, CHECK_NAMES.integrity).ok).toBe(false);
    expect(byName(r.checks, CHECK_NAMES.integrity).detail).toMatch(/digests to f{64}, listed/);
    expect(byName(r.checks, CHECK_NAMES.signature).ok).toBe(true);
    expect(r.checks.filter((c) => c.ok === false).map((c) => c.name)).toEqual([CHECK_NAMES.integrity]);
  });
  it('a manifest altered after signing: the chain fails and the signature is reported as verifying over the stated digest only', async () => {
    const fx = fixture();
    const staged = await stageOf(fx.tar);
    const m = staged.manifest as Row;
    (m['gates'] as Row)['redaction'] = { classification_ceiling: 'public' };
    const r = verifyStaged(staged, contextOf(fx));
    expect(byName(r.checks, CHECK_NAMES.chain).ok).toBe(false);
    expect(byName(r.checks, CHECK_NAMES.signature).ok).toBe(false);
    expect(byName(r.checks, CHECK_NAMES.signature).detail).toMatch(/altered after signing/);
  });
  it('the closure\'s pair rule (B15-F1): an edge naming a version the closure does not carry fails, never rebased', async () => {
    const fx = fixture({ edgeVersion: 3 });
    const r = verifyStaged(await stageOf(fx.tar), contextOf(fx));
    expect(byName(r.checks, CHECK_NAMES.linksFile).ok).toBe(true);
    expect(byName(r.checks, CHECK_NAMES.linksPairs).ok).toBe(false);
    expect(byName(r.checks, CHECK_NAMES.linksPairs).detail).toMatch(new RegExp(`edge ${fx.ids.edgeId} names claim ${fx.ids.claimId}@3, which the closure does not carry`));
  });
  it('a /1 closure is checked by the same pair rule: its edge on the entry\'s version passes; an edge on another version fails', async () => {
    const ok = fixture({ linksFormat: '1', edgeVersion: 2 });
    expect(byName(verifyStaged(await stageOf(ok.tar), contextOf(ok)).checks, CHECK_NAMES.linksPairs).ok).toBe(true);
    const bad = fixture({ linksFormat: '1', edgeVersion: 1 });
    expect(byName(verifyStaged(await stageOf(bad.tar), contextOf(bad)).checks, CHECK_NAMES.linksPairs).ok).toBe(false);
  });
  it('links.json tampered: the file check fails on the digest the manifest names', async () => {
    const fx = fixture();
    const staged = await stageOf(fx.tar);
    const e = staged.entries.find((x) => x.name === 'links.json') as StagedEntry;
    e.digest = '0'.repeat(64);
    const r = verifyStaged(staged, contextOf(fx));
    expect(byName(r.checks, CHECK_NAMES.linksFile).ok).toBe(false);
    expect(byName(r.checks, CHECK_NAMES.linksFile).detail).toMatch(/links.json digests to 0{64}, the manifest names/);
  });
  it('the intake contract\'s policy: an inactive contract fails; a record above the ceiling is counted and excluded at admission; no admissible record fails', async () => {
    const fx = fixture();
    const staged = await stageOf(fx.tar);
    const inactive = verifyStaged(staged, contextOf(fx, { contract: { ...fx.contract, lifecycle_state: 'suspended' } }));
    expect(byName(inactive.checks, CHECK_NAMES.policy).ok).toBe(false);
    expect(byName(inactive.checks, CHECK_NAMES.policy).detail).toMatch(/is not an active upload contract with confirmed rights \(it is suspended, upload, rights confirmed\)/);
    const above = fixture({ recordClassification: 'confidential' });
    const r = verifyStaged(await stageOf(above.tar), contextOf(above));
    expect(byName(r.checks, CHECK_NAMES.policy).ok).toBe(false);
    expect(byName(r.checks, CHECK_NAMES.policy).detail).toMatch(/0 records and 2 claim versions within it, 1 above it \(excluded at admission, gate ceiling\); no record is admissible/);
    const wide = verifyStaged(await stageOf(above.tar), contextOf(above, { contract: { ...above.contract, classification_ceiling: 'confidential' } }));
    expect(byName(wide.checks, CHECK_NAMES.policy).ok).toBe(true);
  });
  it('a live import of the same package fails the duplicate check by the import id', async () => {
    const fx = fixture();
    const r = verifyStaged(await stageOf(fx.tar), contextOf(fx, { liveImport: { import_id: 'imp-1', state: 'approved' } }));
    expect(byName(r.checks, CHECK_NAMES.duplicate).ok).toBe(false);
    expect(byName(r.checks, CHECK_NAMES.duplicate).detail).toMatch(/already imported into this domain as import imp-1 \(state approved\)/);
  });
  it('revocation (C2): the origin\'s record fails it when revoked or expired; an unknown origin is a NOTE naming the unsigned exchange statement; revocation.json at the station fails it', async () => {
    const fx = fixture();
    const staged = await stageOf(fx.tar, { exchange: { delivery_id: 'dlv-1', attempt: 2, expires_at: '2027-06-01T00:00:00.000Z' } });
    const revoked = verifyStaged(staged, contextOf(fx, { origin: { known: true, revoked_at: '2026-03-02T12:00:00.000Z', expires_at: null } }));
    expect(byName(revoked.checks, CHECK_NAMES.revocation).ok).toBe(false);
    expect(byName(revoked.checks, CHECK_NAMES.revocation).detail).toMatch(/the origin revoked this package at 2026-03-02T12:00:00.000Z/);
    const expired = verifyStaged(staged, contextOf(fx, { origin: { known: true, revoked_at: null, expires_at: '2026-03-02T23:00:00.000Z' } }));
    expect(byName(expired.checks, CHECK_NAMES.revocation).ok).toBe(false);
    expect(byName(expired.checks, CHECK_NAMES.revocation).detail).toMatch(/expired at 2026-03-02T23:00:00.000Z \(the origin's record\)/);
    const unknown = verifyStaged(staged, contextOf(fx, { origin: { known: false } }));
    const note = byName(unknown.checks, CHECK_NAMES.revocation);
    expect(note.ok).toBeNull();
    expect(note.detail).toMatch(/not verifiable here — the sender's exchange statement names expiry 2027-06-01T00:00:00.000Z \(unsigned; delivery.json \/ the presented exchange block: delivery dlv-1 attempt 2\); the origin's revocation reaches this domain only through its partner's notice/);
    expect(unknown.verified).toBe(true); // a note is not a failure
    const bare = verifyStaged(await stageOf(fx.tar), contextOf(fx, { origin: { known: false } }));
    expect(byName(bare.checks, CHECK_NAMES.revocation).detail).toMatch(/no expiry stated/);
    const station = verifyStaged(await stageOf(fx.tar, { revocation: { package_digest: fx.packageDigest, revoked_at: '2026-03-02T13:00:00.000Z', reason: 'rights withdrawn by the source' } }), contextOf(fx, { origin: { known: false } }));
    expect(byName(station.checks, CHECK_NAMES.revocation).ok).toBe(false);
    expect(byName(station.checks, CHECK_NAMES.revocation).detail).toMatch(/revoked this package at 2026-03-02T13:00:00.000Z \(revocation.json at the station: rights withdrawn/);
  });
  it('a package whose first entry is not manifest.json fails the archive check with the C5 detail; a malformed archive fails it with the scanner\'s words', async () => {
    const fx = fixture();
    const staged = await stageOf(fx.tar);
    const reordered: StagedPackage = { ...staged, firstEntry: 'links.json' };
    const r = verifyStaged(reordered, contextOf(fx));
    expect(byName(r.checks, CHECK_NAMES.archive).ok).toBe(false);
    expect(byName(r.checks, CHECK_NAMES.archive).detail).toMatch(/the first entry is "links.json", not manifest.json — the product writes manifest.json first/);
    const malformed: StagedPackage = { ...staged, archiveError: 'the archive ends at 1536 byte(s) without the two-block end-of-archive trailer' };
    expect(byName(verifyStaged(malformed, contextOf(fx)).checks, CHECK_NAMES.archive).detail).toMatch(/without the two-block end-of-archive trailer/);
  });
  it('an entry above the vault ceiling keeps its integrity (hashed as it passed) and is named for the admission\'s oversize refusal', async () => {
    const fx = fixture();
    const staged = await stageOf(fx.tar, { oversizeAbove: 10 });
    const r = verifyStaged(staged, contextOf(fx));
    expect(byName(r.checks, CHECK_NAMES.integrity).ok).toBe(true);
    expect(byName(r.checks, CHECK_NAMES.integrity).detail).toMatch(/1 file above the vault's blob ceiling of 67108864 bytes hashed and not stored — refused at admission, gate oversize/);
    const plan = planOf(staged, contextOf(fx), uid, lookupNone);
    const record = plan.items.find((i) => i.kind === 'record');
    expect((record?.planned['refusal'] as Row)['gate']).toBe('oversize');
    expect(record?.staged).toBeNull();
  });
});

describe('planOf — one new id per origin id, versions preserved, reuse by origin object id and by authoritative identifier', () => {
  it('records, claim versions, systems, entities, identifiers, edges and the exclusions, in dependency order; C@1 and C@2 under ONE new id; the map covers object, manifest, entity and edge ids', async () => {
    const fx = fixture();
    const staged = await stageOf(fx.tar);
    const plan = planOf(staged, contextOf(fx), uid, lookupNone);
    expect(plan.items.map((i) => i.kind)).toEqual(['record', 'claim', 'claim', 'identifier_system', 'entity', 'entity', 'identifier', 'edge', 'exclusion', 'exclusion']);
    expect(plan.items.map((i) => i.dependency_order)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
    const [record, c1, c2] = plan.items as [typeof plan.items[0], typeof plan.items[0], typeof plan.items[0]];
    expect(record.origin_ref).toBe(`${fx.ids.evdId}@1`); expect(record.origin_object_id).toBe(fx.ids.evdId);
    expect(record.staged).toMatchObject({ digest: fx.bytesDigest, size: fx.bytes.byteLength, file: `${fx.ids.manifestId}.bin` });
    expect(String(record.planned['object_id'])).not.toBe(fx.ids.evdId); expect(String(record.planned['manifest_id'])).not.toBe(fx.ids.manifestId);
    expect(c1.origin_ref).toBe(`${fx.ids.claimId}@1`); expect(c2.origin_ref).toBe(`${fx.ids.claimId}@2`);
    expect(c1.planned['object_id']).toBe(c2.planned['object_id']); expect(c1.planned['object_id']).not.toBe(fx.ids.claimId);
    expect((c1.origin['evidence'] as Row)['object_id']).toBe(fx.ids.evdId); expect((c1.origin['evidence'] as Row)['digest']).toBe(fx.bytesDigest);
    expect(plan.map.get(fx.ids.evdId)).toBe(record.planned['object_id']); expect(plan.map.get(fx.ids.manifestId)).toBe(record.planned['manifest_id']);
    expect(plan.map.get(fx.ids.claimId)).toBe(c1.planned['object_id']);
    expect(plan.map.get(fx.ids.entA)).toBeDefined(); expect(plan.map.get(fx.ids.entB)).toBeDefined(); expect(plan.map.get(fx.ids.edgeId)).toBeDefined();
    expect(new Set(plan.map.values()).size).toBe(plan.map.size);
    const identifier = plan.items.find((i) => i.kind === 'identifier');
    expect(identifier?.origin_ref).toBe('identifier:lei:LEI-NORDWERK-1'); expect(identifier?.planned['entity_id']).toBe(plan.map.get(fx.ids.entA));
    const exclusions = plan.items.filter((i) => i.kind === 'exclusion');
    expect(exclusions.every((x) => x.disposition === 'excluded' && x.gate === 'origin_excluded')).toBe(true);
    expect(exclusions.map((x) => x.origin_ref.split(':')[1])).toEqual(['record', 'claim']);
    expect(plan.counts).toMatchObject({ records: 1, claims: 2, identifier_systems: 1, entities: 2, identifiers: 1, edges: 1, exclusions: 2 });
    // The same package planned twice with the same minting gives the same shape; a second plan with fresh ids never repeats an id of the first.
    const again = planOf(staged, contextOf(fx), uid, lookupNone);
    expect([...again.map.values()].some((v) => [...plan.map.values()].includes(v))).toBe(false);
  });
  it('N3: an origin object id admitted earlier keeps the id minted then; the same version with the same digests is a planned reuse, with other bytes a planned integrity refusal', async () => {
    const fx = fixture();
    const staged = await stageOf(fx.tar);
    const earlierObject = uid(); const earlierManifest = uid(); const earlierClaim = uid();
    const priorRecord: Row = { item_id: uid(), import_id: 'imp-0', kind: 'record', origin_ref: `${fx.ids.evdId}@1`, origin: { object_id: fx.ids.evdId, object_version: 1, content_digest: fx.objects[0]?.['content_digest'], bytes_digest: fx.bytesDigest }, planned: { object_id: earlierObject, manifest_id: earlierManifest }, admitted: { object_id: earlierObject, object_version: 1, manifest_id: earlierManifest, locator: 'x' } };
    const priorClaim1: Row = { item_id: uid(), import_id: 'imp-0', kind: 'claim', origin_ref: `${fx.ids.claimId}@1`, origin: { object_id: fx.ids.claimId, object_version: 1, content_digest: 'not-the-same' }, planned: { object_id: earlierClaim }, admitted: { object_id: earlierClaim, object_version: 1 } };
    const lookup = {
      priorByObject: (kind: string, id: string) => (kind === 'record' && id === fx.ids.evdId ? priorRecord : kind === 'claim' && id === fx.ids.claimId ? priorClaim1 : null),
      priorByRef: (kind: string, ref: string) => (kind === 'record' && ref === `${fx.ids.evdId}@1` ? priorRecord : kind === 'claim' && ref === `${fx.ids.claimId}@1` ? priorClaim1 : null),
      entityByIdentifier: () => null,
    };
    const plan = planOf(staged, contextOf(fx), uid, lookup);
    const record = plan.items.find((i) => i.kind === 'record');
    expect(record?.planned['object_id']).toBe(earlierObject); expect(record?.planned['manifest_id']).toBe(earlierManifest);
    expect((record?.planned['reuse'] as Row)['import_id']).toBe('imp-0');
    expect(plan.map.get(fx.ids.manifestId)).toBe(earlierManifest);
    const [c1, c2] = plan.items.filter((i) => i.kind === 'claim');
    expect(c1?.planned['object_id']).toBe(earlierClaim); expect(c2?.planned['object_id']).toBe(earlierClaim);
    expect((c1?.planned['refusal'] as Row)['gate']).toBe('integrity');
    expect(String((c1?.planned['refusal'] as Row)['reason'])).toMatch(/not-the-same/);
    expect(c2?.planned['refusal']).toBeUndefined(); expect(c2?.planned['reuse']).toBeUndefined();
  });
  it('N4: an entity whose authoritative identifier already identifies an entity of the importing domain is a planned reuse; the identifier and the edge follow it', async () => {
    const fx = fixture();
    const staged = await stageOf(fx.tar);
    const existing = uid();
    const plan = planOf(staged, contextOf(fx), uid, { ...lookupNone, entityByIdentifier: (k, v) => (k === 'lei' && v === 'LEI-NORDWERK-1' ? existing : null) });
    const entA = plan.items.find((i) => i.origin_ref === `entity:${fx.ids.entA}`);
    expect(entA?.planned['entity_id']).toBe(existing); expect((entA?.planned['reuse'] as Row)['by']).toBe('identifier');
    expect(plan.map.get(fx.ids.entA)).toBe(existing);
    expect(plan.items.find((i) => i.kind === 'identifier')?.planned['entity_id']).toBe(existing);
    expect(remapUuids(fx.links['edges'], plan.map)).toMatchObject([{ subject_entity_id: existing }]);
  });
  it('N5/N6: edges are ordered so that a superseding edge precedes the one it supersedes; a /1 closure admits the entry\'s version and records the other lineage rows as exclusions', async () => {
    const fx = fixture();
    const staged = await stageOf(fx.tar);
    const l = staged.links as Row; const first = (l['edges'] as Row[])[0] as Row;
    const e2 = uid(); const e3 = uid();
    l['edges'] = [{ ...first, edge_id: e3, state: 'superseded', superseded_by: first['edge_id'] }, { ...first, edge_id: e2, state: 'superseded', superseded_by: e3 }, first];
    const plan = planOf(staged, contextOf(fx), uid, lookupNone);
    expect(plan.items.filter((i) => i.kind === 'edge').map((i) => i.origin_ref)).toEqual([`edge:${String(first['edge_id'])}`, `edge:${e3}`, `edge:${e2}`]);
    const one = fixture({ linksFormat: '1', edgeVersion: 2 });
    const p1 = planOf(await stageOf(one.tar), contextOf(one), uid, lookupNone);
    const claims = p1.items.filter((i) => i.kind === 'claim');
    expect(claims.map((c) => c.origin_ref)).toEqual([`${one.ids.claimId}@2`]);
    expect((claims[0]?.origin['lineage'] as Row)['claim_version']).toBe(2);
    const versionExclusion = p1.items.find((i) => i.origin_ref === `excluded:claim_version:${one.ids.claimId}@1`);
    expect(versionExclusion?.disposition).toBe('excluded');
    expect(versionExclusion?.reason).toMatch(/links\/1 closure does not carry/);
  });
  it('N5: entities are ordered so that a successor or a split origin precedes the entity naming it, whatever the closure\'s order', async () => {
    const fx = fixture();
    const staged = await stageOf(fx.tar);
    const l = staged.links as Row; const [a, b] = l['entities'] as [Row, Row];
    const c = uid();
    l['entities'] = [{ ...a, lifecycle_state: 'superseded', superseded_by: c }, { ...b, split_from: c }, { entity_id: c, entity_type: 'organization', canonical_name: 'Nordwerk Holding', lifecycle_state: 'active', split_from: null, superseded_by: null, identifiers: [] }];
    const plan = planOf(staged, contextOf(fx), uid, lookupNone);
    expect(plan.items.filter((i) => i.kind === 'entity').map((i) => i.origin_ref)).toEqual([`entity:${c}`, `entity:${fx.ids.entA}`, `entity:${fx.ids.entB}`]);
    expect(plan.map.get(c)).toBeDefined();
  });
  it('a claim entry whose closure carries no lineage row for its own version is a planned refusal (gate record)', async () => {
    const fx = fixture();
    const staged = await stageOf(fx.tar);
    const l = staged.links as Row; ((l['claims'] as Row[])[1] as Row)['lineage'] = [];
    const plan = planOf(staged, contextOf(fx), uid, lookupNone);
    const c2 = plan.items.find((i) => i.origin_ref === `${fx.ids.claimId}@2`);
    expect((c2?.planned['refusal'] as Row)['gate']).toBe('record');
    expect(contentDigest(plan.counts)).toMatch(/^[0-9a-f]{64}$/);
  });
});
