/**
 * CP-6 B40 §VA (0123_b40_x_va; F-P1-02) — THE VAULT'S AUTHENTICITY, EVIDENCE ATTRIBUTES AND OBLIGATION INHERITANCE, on the real database
 * through the real upload route, the real lifecycle and the real ports. Scene B40-2 (the Djibouti customs bulletin): the bulletin is signed
 * NOW with a key generated NOW (phase6-b40-fixtures: publisherKeyPair / signedBulletin / tamperedCopy / signJws) — no key literal anywhere.
 *   VA1  the publisher keys: declared by a data steward (the fingerprint computed by the port), the request id replayed, a rotation, a
 *        retirement; refused — an agent, a role without the act, a malformed key, a duplicate, an unknown source; RLS and the guarded read
 *   VA2  verification at intake (D6): VERIFIED (payload verified); a TAMPERED copy ADMITTED marked FAILED; an UNKNOWN signer QUARANTINED
 *        (unknown_signer); UNSIGNED admitted; a retired key's signature an unknown signer; JWS (EdDSA, detached + kid); v1–v3 untouched (D8)
 *   VA3  the decision-active use (D6): the failed version and a claim resting on it refused (authenticity_failed, 409) on every use; the
 *        verified one and its claim usable; the failed one still readable
 *   VA4  B82's trust layer: ev_evidence_state's authenticity + reason (contract_rights_state / rights_state unchanged); the provenance WEAK
 *        "authenticity failed" (provenance_strength, trust_envelope and display_truth agree), the verified claim not weakened by it
 *   VA5  the evidence attributes (side ledger, D11/D22): from the SRC@v4 declaration at intake; the steward's override supersedes with a
 *        reason; refusals; a v1–v3 version reads "not recorded before B40"
 *   VA6  most-restrictive inheritance + the transformation-rule register (ES-29-002): not_satisfied → a proposed rule relaxes nothing → the
 *        privacy officer approves (never the proposer) → relaxed_by_rule → retired → not_satisfied again; D22's NULL "carried"
 *   VA7  the per-tenant retention register (V02-T-038): a TENANT reader sees every domain's schedules, the evidence under each, the next
 *        expiry and the holds; a DOMAIN-bound reader is refused
 *   VA8  authenticity as a MEASURED coverage dimension (L1-C06)
 *   VA9  F47 — the authenticity check faults: recorded `unavailable`, never verified (fail closed)
 *   VA10 the V rows re-verified on this harness: V00-T-120, V00-T-122, AI-39-003, EVD, L1-I05 (custody, digests, versions, signature recorded)
 * Every row here is SYNTHETIC fixture data. CONSTRUCTION only — DEMONSTRATED OPERATION is the act's, REAL ACCEPTANCE never claimed.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import { canonicalHeaderDigest, type CanonicalHeader } from '@eye/contracts';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { APP_DB, COMMIT_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { UploadConnector } from '../../src/observation/connectors/upload.connector.js';
import { PdpService } from '../../src/policy/pdp.service.js';
import * as fault from '../../src/observation/fault-injection.js';
import { Phase4Harness } from './phase4-helpers.js';
import { inCommitContext } from './phase1-helpers.js';
import { fixtureBytes, publisherKeyPair, signedBulletin, signDetached, signJws, srcV4Contract, tamperedCopy, B40_FILES, type PublisherKeyPair } from './phase6-b40-fixtures.js';

type Row = Record<string, unknown>;
let h: Phase4Harness; let pdp: PdpService;
let aydin: AuthenticatedPrincipal; let steward2: AuthenticatedPrincipal; let haas: AuthenticatedPrincipal; let dualRole: AuthenticatedPrincipal;
let weber: AuthenticatedPrincipal; let auditor: AuthenticatedPrincipal; let lindqvist: AuthenticatedPrincipal; let decisionOwner: AuthenticatedPrincipal;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let va: any; let up: any; let obs: any;
const T = () => h.fx.tenantId; const D = () => h.fx.domainId;
const one = async (q: { execute: (db: never) => Promise<{ rows: unknown[] }> }) => ((await q.execute(h.su as never)).rows[0] ?? {}) as Row;
const rows = async (q: { execute: (db: never) => Promise<{ rows: unknown[] }> }) => (await q.execute(h.su as never)).rows as Row[];
const sha = (b: Uint8Array | string) => createHash('sha256').update(b).digest('hex');

/** A refusal: the HTTP status (the route's own, or the central mapping's — null while a §VA noun is unmapped), the RAW message, the SQLSTATE. */
const refusal = async (p: Promise<unknown>): Promise<{ status: number | null; message: string; code: string | null }> => {
  const e = await p.then(() => { throw new Error('the call should have been refused'); }, (err: unknown) => err);
  if (e instanceof HttpException) { const r = e.getResponse() as { message?: string; code?: string }; return { status: e.getStatus(), message: String(r.message ?? ''), code: r.code ?? null }; }
  const mapped = asObservationRefusal(e, 'harness');
  return { status: mapped?.getStatus() ?? null, message: e instanceof Error ? e.message : String(e), code: (e as { code?: string }).code ?? null };
};
/** The status the CLASS form takes under the central convention (what the integrator maps for the §VA nouns). */
const classStatus = (message: string): number | null => {
  const m = /^(publisher key|evidence authenticity|evidence attribute|transformation rule|obligations|retention register|object use) rejected \(([a-z_]+)\)/.exec(message);
  if (m === null) return null;
  const cls = m[2]!;
  if (m[1] === 'object use') return 409;
  if (['actor', 'authority', 'separation_of_duties', 'access'].includes(cls)) return 403;
  if (cls.startsWith('unknown_')) return 404;
  if (['state', 'stale', 'duplicate', 'held', 'expired', 'unchanged'].includes(cls)) return 409;
  return 422;
};

/* ───────────── the routes (in process) ───────────── */
const req = (as: AuthenticatedPrincipal, action: string, type: string, id: string | null) => h.req(as, action, type, id, 'observation');
const declareKey = (as: AuthenticatedPrincipal, payload: Row) => va.declareKey(req(as, 'observation.authenticity.key.declare', 'SRC', String(payload['sourceId'] ?? '')), T(), D(), { payload }) as Promise<{ key: Row }>;
const retireKey = (as: AuthenticatedPrincipal, keyId: string, reason: string) => va.retireKey(req(as, 'observation.authenticity.key.retire', 'PBK', keyId), T(), D(), keyId, { payload: { reason } }) as Promise<{ key: Row }>;
const readKeys = (as: AuthenticatedPrincipal, sourceId: string | null) => va.readKeys(req(as, 'observation.authenticity.read', sourceId === null ? 'PBK' : 'SRC', sourceId), T(), D(), { payload: { sourceId } }) as Promise<{ keys: Row & { sources: Row[] } }>;
const readEvd = (as: AuthenticatedPrincipal, evdId: string) => va.readEvidence(req(as, 'observation.authenticity.read', 'EVD', evdId), T(), D(), evdId) as Promise<{ authenticity: Row & { versions: Row[] } }>;
const setAttr = (as: AuthenticatedPrincipal, evdId: string, payload: Row) => va.setAttribute(req(as, 'observation.evidence.attribute.set', 'EVD', evdId), T(), D(), evdId, { payload }) as Promise<{ attribute: Row }>;
const obligations = (as: AuthenticatedPrincipal, type: string, id: string, version: number) => va.readObligations(req(as, 'objects.obligations.read', type, id), T(), D(), { payload: { type, id, version } }) as Promise<{ obligations: Row & { obligations: Row[] } }>;
const propose = (as: AuthenticatedPrincipal, payload: Row) => va.proposeRule(req(as, 'objects.transformation_rule.propose', 'TRR', null), T(), D(), { payload }) as Promise<{ rule: Row }>;
const decide = (as: AuthenticatedPrincipal, ruleId: string, decision: string, reason: string) => va.decideRule(req(as, 'objects.transformation_rule.decide', 'TRR', ruleId), T(), D(), ruleId, { payload: { decision, reason } }) as Promise<{ rule: Row }>;
const retireRule = (as: AuthenticatedPrincipal, ruleId: string, reason: string) => va.retireRule(req(as, 'objects.transformation_rule.retire', 'TRR', ruleId), T(), D(), ruleId, { payload: { reason } }) as Promise<{ rule: Row }>;
const readRules = (as: AuthenticatedPrincipal) => va.readRules(req(as, 'objects.obligations.read', 'TRR', null), T(), D()) as Promise<{ rules: Row & { rules: Row[] } }>;
const register = (as: AuthenticatedPrincipal) => va.readRegister({ eyeEnvelope: { ...h.env(as, 'retention.register.read', 'RET', null), scope: 'TENANT', domain_id: null }, eyePrincipal: as } as never, T()) as Promise<{ register: Row & { domains: Row[] } }>;
const usable = (type: string, id: string, version: number, use: string) => sql`select objects.assert_usable(${type}, ${id}::uuid, ${version}::int, ${use})`.execute(h.su);

/* ───────────── an SRC@v4 upload source (registered by the analyst, approved by the manager, activated; its upload agent) ───────────── */
async function v4UploadSource(label: string, authenticity: Row, attributes?: Row): Promise<string> {
  const { ObservationController } = await import('../../src/observation/observation.controller.js');
  const controller = h.app.get(ObservationController);
  const key = `b40-va-${label}-${uuidv7().slice(-8)}`;
  const contract = srcV4Contract({ sourceKey: key, kind: 'upload', mediaTypes: ['application/json'],
    blocks: { authenticity: authenticity as never, ...(attributes === undefined ? {} : { evidence_attributes: attributes as never }) } });
  (contract['identity'] as Row)['source_identity'] = key;
  (contract['authority_and_rights'] as Row)['purposes'] = ['observation', 'corridor monitoring'];   // the upload route's purpose
  const r = await controller.registerSource(h.req(h.registrar, 'observation.source.register', 'SRC', null, 'observation'), T(), D(), { payload: { contract } }) as { source: { sourceId: string } };
  const sourceId = r.source.sourceId;
  for (const [action, fn] of [
    ['observation.source.approve', (cap: never) => (cap as { approveSource: (a: Row) => Promise<void> }).approveSource({ sourceId, contractVersion: 1, tenantId: T(), domainId: D(), decision: 'approve', reason: 'B40 §VA fixture (SYNTHETIC)', eventId: uuidv7(), correlationId: uuidv7() })],
    ['observation.source.transition', (cap: never) => (cap as { transitionContract: (a: Row) => Promise<void> }).transitionContract({ sourceId, contractVersion: 1, tenantId: T(), domainId: D(), target: 'active', reason: 'B40 §VA fixture: active', eventId: uuidv7(), correlationId: uuidv7() })],
  ] as const) {
    await h.pipeline.write(h.env(h.manager, action, 'SRC', sourceId), h.manager,
      { scope: 'DOMAIN', tenantId: T(), domainId: D(), action, objectType: 'SRC', objectId: sourceId }, ObservationCapability.registry,
      async (cap) => { await fn(cap as never); return { result: {}, targetType: 'SRC', targetId: sourceId, targetVersion: '1', outboxEvent: null }; });
  }
  const connector = new UploadConnector([]);
  const agentPrincipalId = uuidv7(); const agentId = uuidv7(); const run = agentId.slice(-8);
  await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
            values (${agentPrincipalId}::uuid, 'agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${`agent:${connector.name}@${connector.version}-${run}`}, null, 'active')`.execute(h.su);
  await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
            values (${uuidv7()}::uuid, ${agentPrincipalId}::uuid, 'collection_agent', 'DOMAIN', ${T()}::uuid, ${D()}::uuid)`.execute(h.su);
  await inCommitContext(h.app.get<Db>(COMMIT_DB), { sessionId: h.manager.sessionId, contextKey: h.manager.contextKey }, { tenantId: T(), domainId: D() },
    'observation.agent.register', agentId, async (tx) => {
      await sql`select observation.register_agent(${agentId}::uuid, ${T()}::uuid, ${D()}::uuid, ${agentPrincipalId}::uuid, 'observation', ${connector.name}, ${connector.version},
        ${connector.codeDigest}, ${h.fx.registrarId}::uuid, ${sourceId}::uuid,
        ${JSON.stringify({ maxRequestsPerRun: 25, maxBytesPerRun: 33554432, maxConcurrency: 1, timeoutMs: 60000, maxRetries: 0 })}::jsonb, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(tx as never);
    });
  return sourceId;
}

type Admitted = { kind: 'admitted'; id: string; version: number; bytesDigest: string; itemKey: string } | { kind: 'quarantined'; caseId: string; reasonClass: string; itemKey: string };
/** H. Weber uploads one file (with or without a detached signature) through the real upload route; the item's fate, found by its item key. */
async function upload(as: AuthenticatedPrincipal, sourceId: string, filename: string, bytes: Buffer, signature: string | null): Promise<Admitted> {
  const run = await up.upload(h.req(as, 'observation.run.trigger', 'RUN', null, 'observation'), T(), D(),
    { payload: { sourceId, contractVersion: 1, files: [{ filename, mediaType: 'application/json', base64: bytes.toString('base64'), ...(signature === null ? {} : { signature }) }] } });
  const itemKey = `upload:${filename}@${sha(bytes).slice(0, 16)}`;
  const e = await one(sql`select e.object_id::text id, e.object_version::int version, e.payload ->> 'content_digest' d from objects.canonical_objects e
      join objects.canonical_objects o on o.object_type = 'OBS' and e.source_object_ids @> to_jsonb(array['OBS:' || o.object_id::text])
     where e.object_type = 'EVD' and e.tenant_id = ${T()}::uuid and o.payload ->> 'item_key' = ${itemKey} order by e.recorded_at desc limit 1`);
  if (e['id'] !== undefined) return { kind: 'admitted', id: String(e['id']), version: Number(e['version']), bytesDigest: String(e['d']), itemKey };
  const q = await one(sql`select case_id::text c, reason_class r from observation.quarantine_current where item_key = ${itemKey} and tenant_id = ${T()}::uuid order by opened_at desc limit 1`);
  if (q['c'] === undefined) throw new Error(`upload of ${filename} left neither evidence nor a quarantine case: ${JSON.stringify(run)}`);
  return { kind: 'quarantined', caseId: String(q['c']), reasonClass: String(q['r']), itemKey };
}
const ledgerOf = (a: Admitted) => a.kind === 'admitted'
  ? one(sql`select * from observation.evidence_authenticity where evd_object_id = ${a.id}::uuid and evd_version = ${a.version}`)
  : one(sql`select * from observation.evidence_authenticity where case_id = ${a.caseId}::uuid`);
const payloadCa = async (a: { id: string; version: number }) => String((await one(sql`select payload #>> '{authenticity,content_authenticity}' ca from objects.canonical_objects where object_id = ${a.id}::uuid and object_version = ${a.version}`))['ca']);
const variant = (n: string) => Buffer.from(fixtureBytes(B40_FILES.bulletin).toString('utf8').replace('DJ-CUS-2026-1019-07', `DJ-CUS-2026-1019-${n}`), 'utf8');
const asEvd = (a: Admitted) => { if (a.kind !== 'admitted') throw new Error(`expected admission, got quarantine ${a.kind === 'quarantined' ? a.reasonClass : ''}`); return a; };

/** A claim version as the extraction admits it (the B82 harness idiom): the canonical object and its lineage row to the evidence bytes. */
async function plantClaim(evidence: { id: string; version: number; bytesDigest: string }, classification = 'internal'): Promise<{ id: string; version: number }> {
  const id = uuidv7(); const version = 1; const now = new Date().toISOString();
  const payload: Row = { claim_kind: 'claim', subject: 'NWL-7701 transshipment status (Regensburg supply)', predicate: 'is', object_value: 'cleared (SYNTHETIC)', confidence: 0.9, review: { state: 'approved', reason: 'fixture', decider: null } };
  const refs = [`EVD:${evidence.id}@${evidence.version}`];
  const header: CanonicalHeader = {
    object_id: id, object_type: 'CLM', tenant_id: T(), domain_id: D(), scope: 'DOMAIN', object_version: String(version), lifecycle_state: 'active', owning_component: 'CP-INT-01', accountable_owner: 'agent:fixture-extraction',
    source_object_ids: [evidence.id], event_time: null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
    truth_state: 'extracted', synthetic_state: true, confidence: 0.9 as unknown as CanonicalHeader['confidence'], uncertainty: null, evidence_refs: refs, provenance_ref: null, method_ref: 'fixture-extraction@1.0.0',
    contradiction_refs: [], corroboration_refs: [], human_refs: [], classification, purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
    quality_profile: null, quality_state: null, freshness_state: null, schema_ref: 'CLM@v1', ontology_ref: null, correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: uuidv7(), content_ref: null,
  };
  const digest = canonicalHeaderDigest(header, payload);
  await sql`insert into objects.canonical_objects (object_id, object_type, tenant_id, domain_id, scope, object_version, lifecycle_state, owning_component, accountable_owner, source_object_ids, observation_time, recorded_at, time_precision, source_clock_quality, truth_state, synthetic_state, confidence, evidence_refs, method_ref, contradiction_refs, corroboration_refs, human_refs, classification, purpose_scope, schema_ref, correction_of, audit_correlation_id, payload, content_digest)
    values (${id}::uuid, 'CLM', ${T()}::uuid, ${D()}::uuid, 'DOMAIN', ${version}, 'active', 'CP-INT-01', 'agent:fixture-extraction', ${JSON.stringify(header.source_object_ids)}::jsonb, ${now}::timestamptz, ${now}::timestamptz, 'exact', 'trusted', 'extracted', true, '0.9'::jsonb,
            ${JSON.stringify(refs)}::jsonb, 'fixture-extraction@1.0.0', '[]'::jsonb, '[]'::jsonb, '[]'::jsonb, ${classification}, 'intelligence', 'CLM@v1', null, ${header.audit_correlation_id}::uuid, ${JSON.stringify(payload)}::jsonb, ${digest})`.execute(h.su);
  await sql`insert into intelligence.claim_lineage (claim_object_id, claim_version, scope, tenant_id, domain_id, claim_type, run_id, method_id, call_id, mode, evidence_object_id, evidence_digest, byte_start, byte_end, confidence, retrieval_decision_id, retrieval_audit_seq, admission_decision_id, correlation_id)
    values (${id}::uuid, ${version}, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, 'CLM', ${uuidv7()}::uuid, ${uuidv7()}::uuid, null, 'replay', ${evidence.id}::uuid, ${evidence.bytesDigest}, 2, 40, 0.9, ${uuidv7()}::uuid, 1, ${uuidv7()}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
  return { id, version };
}

let customs = ''; let jwsSource = ''; let noKeySource = ''; let key: PublisherKeyPair; let keyRow: Row = {};
let signed: Admitted; let tampered: Admitted; let unknownSigner: Admitted; let unsigned: Admitted;
const USES = ['decision_option', 'publication', 'export', 'gate'];

beforeAll(async () => {
  h = await Phase4Harness.boot();
  pdp = h.app.get(PdpService);
  const { AuthenticityController } = await import('../../src/observation/authenticity-b40/authenticity.controller.js');
  const { UploadController } = await import('../../src/observation/sources/upload.controller.js');
  const { ObservationController } = await import('../../src/observation/observation.controller.js');
  va = h.app.get(AuthenticityController); up = h.app.get(UploadController); obs = h.app.get(ObservationController);
  aydin = await h.humanWithSession(['data_steward'], 'b40-f-aydin');
  steward2 = await h.humanWithSession(['data_steward'], 'b40-steward2');
  haas = await h.humanWithSession(['privacy_officer'], 'b40-l-haas');
  dualRole = await h.humanWithSession(['data_steward', 'privacy_officer'], 'b40-dual');
  weber = await h.humanWithSession(['domain_analyst'], 'b40-h-weber');
  lindqvist = await h.humanWithSession(['auditor'], 'b40-e-lindqvist', 'TENANT');
  auditor = lindqvist;
  decisionOwner = await h.humanWithSession(['decision_owner'], 'b40-decision-owner');
  customs = await v4UploadSource('customs', { scheme: 'ed25519_detached', key_refs: ['djibouti-customs-2026'], tls_spki_pins: [] },
    { geographic_scope: ['Djibouti', 'Horn of Africa'], language: 'en', sensitivity: 'commercial' });
  jwsSource = await v4UploadSource('jws', { scheme: 'jws', key_refs: [], tls_spki_pins: [] });
  noKeySource = await v4UploadSource('nokey', { scheme: 'ed25519_detached', key_refs: [], tls_spki_pins: [] });
  key = publisherKeyPair();
}, 600_000);
afterEach(() => { fault.disarm(); });
afterAll(async () => { await h?.close(); });

describe('VA1 · the publisher keys — declared and retired by a named data steward or collection manager (human-gated, never an agent)', () => {
  it('declared by the data steward: the port computes the fingerprint, the key is in force, the ledger records it; the request id replays', async () => {
    const requestId = uuidv7();
    const payload = { sourceId: customs, keyRef: 'djibouti-customs-2026', kind: 'signing_key', publicKeyPem: key.publicKeyPem, reason: 'the publisher key page of Djibouti customs (SYNTHETIC)', requestId };
    const r = await declareKey(aydin, payload);
    keyRow = r.key;
    expect(r.key).toMatchObject({ source_id: customs, key_ref: 'djibouti-customs-2026', kind: 'signing_key', algorithm: 'Ed25519', state: 'in_force', replayed: false, declared_by: aydin.principalId,
      fingerprint: `ed25519:${key.fingerprint.slice(0, 16)}` });
    expect((await declareKey(aydin, payload)).key).toMatchObject({ key_id: r.key['key_id'], replayed: true });
    const dup = await refusal(declareKey(steward2, payload));
    expect(dup.message).toMatch(/^publisher key rejected \(duplicate\): request .* already recorded another act/);
    expect(await rows(sql`select event from observation.publisher_key_events where key_id = ${String(r.key['key_id'])}::uuid`)).toEqual([{ event: 'key.declared' }]);
  });
  it('refused: an agent (the human gate), a role without the act, a malformed key, a key already declared, an unknown source, a pin with a PEM', async () => {
    const agent = { ...aydin, kind: 'agent' as const };
    expect((await refusal(declareKey(agent, { sourceId: customs, keyRef: 'x-agent', kind: 'signing_key', publicKeyPem: publisherKeyPair().publicKeyPem, reason: 'an agent never declares a key' }))).status).toBe(403);
    expect((await refusal(declareKey(weber, { sourceId: customs, keyRef: 'x-analyst', kind: 'signing_key', publicKeyPem: publisherKeyPair().publicKeyPem, reason: 'an analyst holds no key act' }))).status).toBe(403);
    const bad = await refusal(declareKey(aydin, { sourceId: customs, keyRef: 'x-bad', kind: 'signing_key', publicKeyPem: '-----BEGIN PUBLIC KEY-----\nAAAA\n-----END PUBLIC KEY-----\n', reason: 'a malformed key (SYNTHETIC)' }));
    expect(bad.message).toMatch(/^publisher key rejected \(key\): a signing key is an Ed25519 SubjectPublicKeyInfo/); expect(classStatus(bad.message)).toBe(422);
    const again = await refusal(declareKey(aydin, { sourceId: customs, keyRef: 'djibouti-customs-2026', kind: 'signing_key', publicKeyPem: key.publicKeyPem, reason: 'the same key a second time' }));
    expect(again.message).toMatch(/^publisher key rejected \(duplicate\): key ed25519:[0-9a-f]{16} is already declared for this source/); expect(classStatus(again.message)).toBe(409);
    const nosrc = await refusal(declareKey(aydin, { sourceId: uuidv7(), keyRef: 'x', kind: 'signing_key', publicKeyPem: publisherKeyPair().publicKeyPem, reason: 'an unknown source (SYNTHETIC)' }));
    expect(nosrc.message).toMatch(/^publisher key rejected \(unknown_source\)/); expect(classStatus(nosrc.message)).toBe(404);
    const pin = await refusal(declareKey(aydin, { sourceId: customs, keyRef: 'x-pin', kind: 'tls_spki_pin', pin: 'A'.repeat(43) + '=', publicKeyPem: publisherKeyPair().publicKeyPem, reason: 'a pin with a PEM' }));
    expect(pin.message).toMatch(/^publisher key rejected \(key\): a TLS SPKI pin/);
  });
  it('a TLS SPKI pin is declared beside the signing key (a pin verifies no signature — recorded as declared)', async () => {
    const pin = createHash('sha256').update(publisherKeyPair().publicKey.export({ type: 'spki', format: 'der' })).digest('base64');
    const r = await declareKey(aydin, { sourceId: customs, keyRef: 'djibouti-customs-tls', kind: 'tls_spki_pin', pin, reason: 'the TLS key of the customs portal (SYNTHETIC)' });
    expect(r.key).toMatchObject({ kind: 'tls_spki_pin', algorithm: 'sha256-spki', fingerprint: pin, public_key_pem: null, state: 'in_force' });
  });
  it('a mistyped key is retired by its steward with a reason (once); a rotation retires the key it replaces in the same act', async () => {
    const wrong = await declareKey(aydin, { sourceId: customs, keyRef: 'djibouti-customs-2026', kind: 'signing_key', publicKeyPem: publisherKeyPair().publicKeyPem, reason: 'a key typed against the wrong source (SYNTHETIC)' });
    const ret = await retireKey(aydin, String(wrong.key['key_id']), 'mistyped — the key belongs to another publisher (SYNTHETIC)');
    expect(ret.key).toMatchObject({ state: 'retired', retired_by: aydin.principalId });
    const twice = await refusal(retireKey(aydin, String(wrong.key['key_id']), 'retired a second time'));
    expect(twice.message).toMatch(/^publisher key rejected \(state\): key .* was retired at/); expect(classStatus(twice.message)).toBe(409);
    const old = await declareKey(steward2, { sourceId: jwsSource, keyRef: 'jws-2025', kind: 'signing_key', publicKeyPem: publisherKeyPair().publicKeyPem, reason: 'the 2025 JWS key (SYNTHETIC)' });
    const next = await declareKey(steward2, { sourceId: jwsSource, keyRef: 'jws-2026', kind: 'signing_key', publicKeyPem: publisherKeyPair().publicKeyPem, rotatedFrom: old.key['key_id'], reason: 'the publisher rotated to its 2026 key (SYNTHETIC)' });
    expect(next.key['rotated_from']).toBe(old.key['key_id']);
    const o = await one(sql`select retired_at is not null r, retire_reason from observation.publisher_keys where key_id = ${String(old.key['key_id'])}::uuid`);
    expect(o).toMatchObject({ r: true, retire_reason: expect.stringMatching(/^rotated to key ed25519:[0-9a-f]{16} \(jws-2026\)/) });
    expect((await rows(sql`select event from observation.publisher_key_events where key_id = ${String(old.key['key_id'])}::uuid order by occurred_at`)).map((x) => x['event'])).toEqual(['key.declared', 'key.rotated']);
    expect((await refusal(declareKey(steward2, { sourceId: jwsSource, keyRef: 'jws-x', kind: 'signing_key', publicKeyPem: publisherKeyPair().publicKeyPem, rotatedFrom: old.key['key_id'], reason: 'rotate a retired key' }))).message)
      .toMatch(/^publisher key rejected \(state\)/);
    // the row takes no other change (retire-only)
    expect((await refusal(sql`update observation.publisher_keys set reason = 'rewritten' where key_id = ${String(next.key['key_id'])}::uuid`.execute(h.su))).message).toMatch(/a publisher key is retired once/);
  });
  it('the key register is a guarded read (scope first; FORCE RLS answers no row without a context) and names each source\'s declared scheme', async () => {
    const r = await readKeys(lindqvist, customs);
    const s = r.keys.sources[0] as Row & { versions: Row[]; keys: Row[] };
    expect(s.versions[0]).toMatchObject({ v4: true, scheme: 'ed25519_detached', key_refs: ['djibouti-customs-2026'] });
    expect(s.keys.map((k) => k['state']).sort()).toEqual(['in_force', 'in_force', 'retired']);
    const app = h.app.get<Db>(APP_DB);   // the API's runtime role, no bound context
    const noCtx = {
      n: (await sql<{ n: number }>`select count(*)::int n from observation.publisher_keys`.execute(app)).rows[0]?.n,
      e: await sql`select observation.publisher_keys_read(${T()}::uuid, ${D()}::uuid, null)`.execute(app).then(() => null, (x: unknown) => (x as Error).message),
    };
    expect(noCtx.n).toBe(0);
    expect(noCtx.e).toMatch(/^read rejected \(scope\)/);
  });
});

describe('VA2 · verification at intake (DESIGN D6) — the Djibouti customs bulletin', () => {
  it('the SIGNED bulletin verifies: admitted, payload content_authenticity verified, the outcome recorded with its key, custody.authenticity_recorded', async () => {
    const s = signedBulletin(key);
    signed = await upload(weber, customs, 'djibouti-transshipment-bulletin-2026-10-19.json', s.bytes, s.signature);
    const e = asEvd(signed);
    expect(await payloadCa(e)).toBe('verified');
    expect(await ledgerOf(signed)).toMatchObject({ outcome: 'verified', scheme: 'ed25519_detached', key_id: keyRow['key_id'], key_ref: 'djibouti-customs-2026',
      signature: s.signature, signature_digest: sha(s.signature), content_digest: e.bytesDigest });
    const cu = await one(sql`select details, actor from observation.custody_events where evd_object_id = ${e.id}::uuid and event = 'custody.authenticity_recorded'`);
    expect(cu['details']).toMatchObject({ outcome: 'verified', scheme: 'ed25519_detached', key_fingerprint: keyRow['fingerprint'], signature_digest: sha(s.signature) });
  }, 120_000);
  it('the TAMPERED copy (one value changed, the same signature) is ADMITTED marked FAILED — not quarantined, never verified (D6)', async () => {
    const s = signedBulletin(key);
    tampered = await upload(weber, customs, 'djibouti-transshipment-bulletin-2026-10-19.json', tamperedCopy(s.bytes), s.signature);
    const e = asEvd(tampered);
    expect(await payloadCa(e)).toBe('unknown');
    expect(await ledgerOf(tampered)).toMatchObject({ outcome: 'failed', key_id: null, detail: expect.objectContaining({ statement: expect.stringMatching(/did not verify with any of the 1 publisher key\(s\) in force/) }) });
  }, 120_000);
  it('a signature from a key that is NOT the publisher\'s, while the publisher\'s key is in force, is FAILED (admitted marked) — a detached Ed25519 signature names no key', async () => {
    const bytes = variant('07');
    const other = await upload(weber, customs, 'djibouti-bulletin-07.json', bytes, signDetached(bytes, publisherKeyPair().privateKey));
    expect(await ledgerOf(other)).toMatchObject({ outcome: 'failed' });
  }, 120_000);
  it('an UNKNOWN signer (no publisher key of the source in force) is QUARANTINED unknown_signer — no evidence admitted; the outcome recorded on the case', async () => {
    const other = publisherKeyPair();
    const bytes = variant('08');
    unknownSigner = await upload(weber, noKeySource, 'djibouti-bulletin-08.json', bytes, signDetached(bytes, other.privateKey));
    expect(unknownSigner).toMatchObject({ kind: 'quarantined', reasonClass: 'unknown_signer' });
    expect(await ledgerOf(unknownSigner)).toMatchObject({ outcome: 'unknown_signer', evd_object_id: null, scheme: 'ed25519_detached' });
  }, 120_000);
  it('UNSIGNED (the contract declares a scheme, no signature presented): admitted, payload unknown, recorded unsigned — never verified', async () => {
    unsigned = await upload(weber, customs, 'djibouti-bulletin-09.json', variant('09'), null);
    expect(await payloadCa(asEvd(unsigned))).toBe('unknown');
    expect(await ledgerOf(unsigned)).toMatchObject({ outcome: 'unsigned', signature: null });
  }, 120_000);
  it('a RETIRED key verifies nothing new: an item signed only with it is an unknown signer (quarantined)', async () => {
    const k2 = publisherKeyPair();
    const d = await declareKey(aydin, { sourceId: noKeySource, keyRef: 'nokey-2026', kind: 'signing_key', publicKeyPem: k2.publicKeyPem, reason: 'a key declared, then retired below (SYNTHETIC)' });
    const before = variant('15');
    expect(await ledgerOf(await upload(weber, noKeySource, 'djibouti-bulletin-15.json', before, signDetached(before, k2.privateKey)))).toMatchObject({ outcome: 'verified', key_ref: 'nokey-2026' });
    await retireKey(aydin, String(d.key['key_id']), 'the publisher withdrew this key (SYNTHETIC)');
    const bytes = variant('10');
    expect(await upload(weber, noKeySource, 'djibouti-bulletin-10.json', bytes, signDetached(bytes, k2.privateKey))).toMatchObject({ kind: 'quarantined', reasonClass: 'unknown_signer' });
  }, 120_000);
  it('JWS (EdDSA, detached, kid = the key reference): verified with the rotated-to key; another kid → unknown signer; other bytes → failed', async () => {
    const k = publisherKeyPair();
    await declareKey(steward2, { sourceId: jwsSource, keyRef: 'jws-2026b', kind: 'signing_key', publicKeyPem: k.publicKeyPem, reason: 'the publisher\'s JWS key (SYNTHETIC)' });
    const detached = async (b: Buffer, kid: string, pk = k.privateKey) => { const [h0, , s0] = (await signJws(b, pk, kid)).split('.'); return `${h0}..${s0}`; };
    const b1 = variant('11');
    const ok = await upload(weber, jwsSource, 'jws-11.json', b1, await detached(b1, 'jws-2026b'));
    expect(await ledgerOf(ok)).toMatchObject({ outcome: 'verified', scheme: 'jws', key_ref: 'jws-2026b' });
    expect(await payloadCa(asEvd(ok))).toBe('verified');
    const b2 = variant('12');
    expect(await upload(weber, jwsSource, 'jws-12.json', b2, await detached(b2, 'not-a-declared-key'))).toMatchObject({ kind: 'quarantined', reasonClass: 'unknown_signer' });
    const b3 = variant('13');
    const bad = await upload(weber, jwsSource, 'jws-13.json', b3, await detached(variant('14'), 'jws-2026b'));
    expect(await ledgerOf(bad)).toMatchObject({ outcome: 'failed', scheme: 'jws' });
  }, 180_000);
  it('a v1–v3 contract keeps EXACTLY its recorded behaviour (D8): admitted, content authenticity unknown, nothing recorded', async () => {
    const [u] = await h.upload([{ filename: 'b40-va-v1.csv', text: 'a,b\n1,2\n' }]);
    expect(await payloadCa(u!)).toBe('unknown');
    expect(await one(sql`select count(*)::int n from observation.evidence_authenticity where evd_object_id = ${u!.id}::uuid`)).toEqual({ n: 0 });
    expect(await one(sql`select count(*)::int n from observation.evidence_attributes where evd_object_id = ${u!.id}::uuid`)).toEqual({ n: 0 });
    const r = await readEvd(lindqvist, u!.id);
    expect(r.authenticity.versions[0]).toMatchObject({ v4: false, authenticity: { outcome: 'not_recorded', statement: expect.stringMatching(/^not recorded before B40/) },
      attributes: { recorded: false, statement: expect.stringMatching(/^not recorded before B40/) } });
  }, 120_000);
});

describe('VA3 · the decision-active use (D6) — the failed version is refused, stays admitted and readable', () => {
  let failedClaim = { id: '', version: 1 }; let verifiedClaim = { id: '', version: 1 };
  it('the tampered version is refused at every decision-active use (authenticity_failed, 409); the verified and the unsigned are usable', async () => {
    const t = asEvd(tampered);
    for (const use of USES) {
      const r = await refusal(usable('EVD', t.id, t.version, use));
      expect(r.message).toMatch(new RegExp(`^object use rejected \\(authenticity_failed\\): EVD ${t.id} v${t.version} rests on EVD ${t.id} v${t.version}, whose publisher signature FAILED verification at its admission \\(ed25519_detached, recorded \\d{4}-\\d{2}-\\d{2}T[0-9:]{8}Z, authenticity record [0-9a-f-]{36}\\) — admitted marked and readable, never established as the publisher's content; it is not used for ${use}$`));
      expect(r.status).toBe(409);
    }
    for (const a of [asEvd(signed), asEvd(unsigned)]) for (const use of USES) await usable('EVD', a.id, a.version, use);
  });
  it('a claim resting on the tampered version is refused too (through its lineage); the claim on the signed version is usable', async () => {
    failedClaim = await plantClaim(asEvd(tampered)); verifiedClaim = await plantClaim(asEvd(signed));
    const r = await refusal(usable('CLM', failedClaim.id, 1, 'decision_option'));
    expect(r.message).toMatch(/^object use rejected \(authenticity_failed\): CLM .* rests on EVD .*, whose publisher signature FAILED/); expect(r.status).toBe(409);
    for (const use of USES) await usable('CLM', verifiedClaim.id, 1, use);
  });
  it('readable as before (D9 — no read changes): the evidence detail and its custody are served; the lifecycle stays active', async () => {
    const t = asEvd(tampered);
    const d = await obs.getEvidence(h.req(h.manager, 'observation.read.evidence', 'EVD', t.id, 'observation'), T(), D(), t.id, {}) as Row;
    expect((d['evidence'] as Row)['lifecycle_state']).toBe('admitted');
    expect(((d['custody'] ?? []) as Row[]).map((c) => c['event'])).toContain('custody.authenticity_recorded');
  });
  it('VA4 · B82\'s trust layer: ev_evidence_state carries the authenticity and the reason (rights fields unchanged); the claim reads WEAK "authenticity failed"', async () => {
    const t = asEvd(tampered); const s = asEvd(signed);
    const st = (await one(sql`select graph.ev_evidence_state(${T()}::uuid, ${D()}::uuid, ${t.id}::uuid, ${t.version}, null, null, clock_timestamp()) s`))['s'] as Row;
    expect(st).toMatchObject({ outcome: 'unverifiable', authenticity: { outcome: 'failed', scheme: 'ed25519_detached', key_ref: null } });
    expect(st['reasons']).toContain('authenticity_failed');
    expect(Object.keys(st)).toEqual(expect.arrayContaining(['contract_rights_state', 'rights_state', 'rights', 'integrity_failed', 'tombstoned', 'unreachable']));
    expect(st['contract_rights_state']).toBe('confirmed');
    const ok = (await one(sql`select graph.ev_evidence_state(${T()}::uuid, ${D()}::uuid, ${s.id}::uuid, ${s.version}, null, null, clock_timestamp()) s`))['s'] as Row;
    expect(ok).toMatchObject({ outcome: 'resolved', authenticity: { outcome: 'verified', key_ref: 'djibouti-customs-2026' } });
    const weak = (await one(sql`select graph.provenance_strength(${T()}::uuid, ${D()}::uuid, 'CLM', ${failedClaim.id}::uuid, 1) s`))['s'] as Row & { reasons: Row[] };
    expect(weak['strength']).toBe('weak');
    expect(weak.reasons.find((r) => r['code'] === 'authenticity_failed')).toMatchObject({ rule: 'b40-va-authenticity-1', detail: expect.stringMatching(/authenticity failed — its publisher signature \(ed25519_detached\) did not verify/) });
    const strong = (await one(sql`select graph.provenance_strength(${T()}::uuid, ${D()}::uuid, 'CLM', ${verifiedClaim.id}::uuid, 1) s`))['s'] as Row & { reasons: Row[] };
    expect(strong.reasons.map((r) => r['code'])).not.toContain('authenticity_failed');
    expect(['strong', 'partial']).toContain(strong['strength']);
    const env = (await one(sql`select graph.trust_envelope(${T()}::uuid, ${D()}::uuid, 'CLM', ${failedClaim.id}::uuid, 1) s`))['s'] as Row;
    expect((env['provenance'] as Row)['strength']).toBe('weak');
    const dt = ((await one(sql`select objects.display_truth(${T()}::uuid, ${D()}::uuid, ${JSON.stringify([{ type: 'CLM', id: failedClaim.id, version: 1 }])}::jsonb) s`))['s'] as Array<Row & { reasons: Row[] }>)[0]!;
    expect(dt.reasons.find((r) => r['code'] === 'weak_provenance')?.['detail']).toMatch(/provenance strength WEAK \(.*authenticity failed/);
  });
  it('the use refusal is §0\'s internal hook, replaced whole: STABLE, invoker, the same search path, no runtime grant', async () => {
    const f = await one(sql`select p.provolatile v, p.prosecdef d, array_to_string(p.proconfig, ',') cfg, has_function_privilege('eye_app', p.oid, 'EXECUTE') app, has_function_privilege('public', p.oid, 'EXECUTE') pub
      from pg_proc p where p.oid = 'observation._va_use_refusal(uuid, uuid, uuid, int)'::regprocedure`);
    expect(f).toEqual({ v: 's', d: false, cfg: 'search_path=observation, pg_catalog, pg_temp', app: false, pub: false });
  });
});

describe('VA5 · the evidence attributes — a side ledger (D11, D22): from the SRC@v4 declaration at intake, a steward\'s override with a reason', () => {
  it('recorded at intake from the contract: geographic scope, language, sensitivity, and the licence (no rights terms declared → the contract\'s licence)', async () => {
    const s = asEvd(signed);
    const r = await readEvd(lindqvist, s.id);
    const v = r.authenticity.versions[0] as Row & { attributes: Row & { current: Record<string, Row> } };
    expect(v['v4']).toBe(true);
    expect(v.attributes.recorded).toBe(true);
    expect(v.attributes.current['geographic_scope']).toMatchObject({ value: ['Djibouti', 'Horn of Africa'], basis: 'source_contract', basis_ref: `SRC:${customs}@1` });
    expect(v.attributes.current['language']).toMatchObject({ value: 'en', basis: 'source_contract' });
    expect(v.attributes.current['sensitivity']).toMatchObject({ value: 'commercial', basis: 'source_contract' });
    expect(v.attributes.current['licence']).toMatchObject({ value: { contract_licence: 'synthetic-test-licence' }, basis: 'source_contract' });
    expect(v['authenticity']).toMatchObject({ outcome: 'verified', key: { key_ref: 'djibouti-customs-2026', state: 'in_force' } });
    // no header field: the canonical header carries none of these (D22)
    const hdr = await one(sql`select to_jsonb(o) - 'payload' h from objects.canonical_objects o where object_id = ${s.id}::uuid and object_version = ${s.version}`);
    expect(Object.keys(hdr['h'] as Row)).not.toEqual(expect.arrayContaining(['sensitivity', 'language', 'geographic_scope']));
  });
  it('the data steward overrides the language with a reason: it supersedes (the earlier row kept); the request id replays', async () => {
    const s = asEvd(signed); const requestId = uuidv7();
    const r = await setAttr(aydin, s.id, { version: s.version, attribute: 'language', value: 'fr', reason: 'the bulletin is published in French (SYNTHETIC)', requestId });
    expect(r.attribute).toMatchObject({ attribute: 'language', value: 'fr', basis: 'steward', basis_ref: `principal:${aydin.principalId}`, replayed: false, superseded: { value: 'en', basis: 'source_contract' } });
    expect((await setAttr(aydin, s.id, { version: s.version, attribute: 'language', value: 'fr', reason: 'the bulletin is published in French (SYNTHETIC)', requestId })).attribute['replayed']).toBe(true);
    const v = (await readEvd(lindqvist, s.id)).authenticity.versions[0] as Row & { attributes: Row & { current: Record<string, Row>; history: Row[] } };
    expect(v.attributes.current['language']).toMatchObject({ value: 'fr', basis: 'steward' });
    expect(v.attributes.history.filter((x) => x['attribute'] === 'language').map((x) => x['value'])).toEqual(['en', 'fr']);
  });
  it('refused: an analyst (no override act), an unchanged value, an invalid value, an unknown evidence version, no reason', async () => {
    const s = asEvd(signed);
    expect((await refusal(setAttr(weber, s.id, { version: s.version, attribute: 'language', value: 'de', reason: 'an analyst overriding' }))).status).toBe(403);
    const same = await refusal(setAttr(aydin, s.id, { version: s.version, attribute: 'language', value: 'fr', reason: 'the same value again' }));
    expect(same.message).toMatch(/^evidence attribute rejected \(unchanged\)/); expect(classStatus(same.message)).toBe(409);
    const bad = await refusal(setAttr(aydin, s.id, { version: s.version, attribute: 'sensitivity', value: 'secret', reason: 'an invalid sensitivity' }));
    expect(bad.message).toMatch(/^evidence attribute rejected \(value\): sensitivity is none, commercial, personal or special_category/);
    const nov = await refusal(setAttr(aydin, s.id, { version: 99, attribute: 'language', value: 'de', reason: 'a version never admitted' }));
    expect(nov.message).toMatch(/^evidence attribute rejected \(unknown_evidence\)/);
    expect((await refusal(setAttr(aydin, s.id, { version: s.version, attribute: 'language', value: 'de', reason: 'short' }))).message).toMatch(/^evidence attribute rejected \(reason\)/);
  });
  it('D9: the authenticity read grants no evidence content — the data steward reads metadata, never the bytes', () => {
    const ctx = { scope: 'DOMAIN' as const, tenantId: T(), domainId: D() };
    const decide = (role: string, action: string) => pdp.evaluate({ principal: { principalId: uuidv7(), kind: 'human', assurance: 'password', bindings: [{ roleCode: role, scope: 'DOMAIN', tenantId: T(), domainId: D() }] },
      delegationId: null, action, objectType: 'EVD', objectId: null, purposeId: 'observation', context: ctx as never, consequenceClass: 'C1', environment: { deployment: 'local-dev', clockQuality: 'trusted' } } as never).decision;
    expect(decide('data_steward', 'observation.authenticity.read')).toMatch(/^allow/);
    expect(decide('data_steward', 'observation.evidence.retrieve')).not.toMatch(/^allow/);
    expect(decide('collection_agent', 'observation.authenticity.read')).not.toMatch(/^allow/);
    for (const role of ['decision_owner', 'executive']) for (const a of ['observation.authenticity.read', 'observation.evidence.retrieve']) expect(decide(role, a)).not.toMatch(/^allow/);
  });
});

describe('VA6 · most-restrictive inheritance and the transformation-rule register (ES-29-002; D22)', () => {
  let claim = { id: '', version: 1 }; let ruleId = '';
  const status = async (o: string) => ((await obligations(decisionOwner, 'CLM', claim.id, 1)).obligations.obligations.find((x) => x['obligation'] === o)) as Row;
  it('a claim marked PUBLIC on INTERNAL evidence does not satisfy its inherited classification; residency carried (D22\'s NULL), sensitivity carried', async () => {
    claim = await plantClaim(asEvd(signed), 'public');
    const r = (await obligations(decisionOwner, 'CLM', claim.id, 1)).obligations;
    expect(r).toMatchObject({ ref: `CLM:${claim.id}@1`, rule_version: 'b40-va-inherit-1', inputs: { evidence: 1, truncated: false } });
    expect(await status('classification')).toMatchObject({ inherited: 'internal', header: 'public', status: 'not_satisfied', imposed_by: expect.arrayContaining([`EVD:${asEvd(signed).id}@${asEvd(signed).version}`]) });
    expect(await status('residency')).toMatchObject({ inherited: 'EU', header: null, status: 'carried' });
    expect(await status('sensitivity')).toMatchObject({ inherited: 'commercial', status: 'carried' });
    expect(await status('licence')).toMatchObject({ status: 'carried' });
    expect(r['open_findings']).toBe(1);
    expect(r['limitations']).toEqual(expect.arrayContaining([expect.stringMatching(/B62/)]));
  });
  it('the data steward proposes a rule; a PROPOSED rule relaxes nothing; its proposer cannot approve it (separation) nor can an agent; the privacy officer approves', async () => {
    const p = await propose(dualRole, { obligation: 'classification', transformation: 'aggregation', from: 'internal', to: 'public', objectTypes: ['CLM'],
      rationale: 'an aggregate across many consignments discloses no single consignment (SYNTHETIC)' });
    ruleId = String(p.rule['rule_id']);
    expect(p.rule).toMatchObject({ state: 'proposed', proposed_by: dualRole.principalId });
    expect((await status('classification'))['status']).toBe('not_satisfied');
    const self = await refusal(decide(dualRole, ruleId, 'approve', 'approving my own rule'));
    expect(self.message).toMatch(/^transformation rule rejected \(separation_of_duties\)/); expect(classStatus(self.message)).toBe(403);
    expect((await refusal(decide({ ...haas, kind: 'agent' }, ruleId, 'approve', 'an agent approving'))).status).toBe(403);
    expect((await refusal(decide(aydin, ruleId, 'approve', 'a steward approving'))).status).toBe(403);
    const ok = await decide(haas, ruleId, 'approve', 'reviewed: the aggregate holds no single record (SYNTHETIC)');
    expect(ok.rule).toMatchObject({ state: 'approved', decided_by: haas.principalId });
    expect(await status('classification')).toMatchObject({ status: 'relaxed_by_rule', rule: { rule_id: ruleId, transformation: 'aggregation' } });
    expect((await refusal(decide(haas, ruleId, 'reject', 'deciding twice'))).message).toMatch(/^transformation rule rejected \(state\)/);
  });
  it('refused proposals: a tightening, evidence as a derived type, a short rationale; the register lists the rule with its ledger', async () => {
    expect((await refusal(propose(aydin, { obligation: 'classification', transformation: 'aggregation', from: 'public', to: 'internal', objectTypes: ['CLM'], rationale: 'a rule that tightens is not a rule' }))).message)
      .toMatch(/^transformation rule rejected \(relaxation\)/);
    expect((await refusal(propose(aydin, { obligation: 'sensitivity', transformation: 'anonymisation', from: 'personal', to: 'none', objectTypes: ['EVD'], rationale: 'evidence is never a derived object here' }))).message)
      .toMatch(/^transformation rule rejected \(object_types\)/);
    expect((await refusal(propose(aydin, { obligation: 'sensitivity', transformation: 'anonymisation', from: 'personal', to: 'none', objectTypes: ['CLM'], rationale: 'too short' }))).message)
      .toMatch(/^transformation rule rejected \(rationale\)/);
    const reg = (await readRules(lindqvist)).rules.rules as Array<Row & { events: Row[] }>;
    expect(reg.find((r) => r['rule_id'] === ruleId)?.events.map((e) => e['event'])).toEqual(['rule.proposed', 'rule.approved']);
  });
  it('a sensitivity rule relaxes the carried sensitivity for its types; retiring the classification rule restores not_satisfied', async () => {
    const p = await propose(aydin, { obligation: 'sensitivity', transformation: 'aggregation', from: 'commercial', to: 'none', objectTypes: ['CLM', 'FCT'], rationale: 'aggregated consignment counts carry no commercial detail (SYNTHETIC)' });
    await decide(haas, String(p.rule['rule_id']), 'approve', 'reviewed (SYNTHETIC)');
    expect(await status('sensitivity')).toMatchObject({ status: 'relaxed_by_rule', rule: { to_value: 'none' } });
    await retireRule(haas, ruleId, 'the aggregation threshold was found too low (SYNTHETIC)');
    expect((await status('classification'))['status']).toBe('not_satisfied');
    expect((await refusal(retireRule(haas, ruleId, 'retiring twice'))).message).toMatch(/^transformation rule rejected \(state\)/);
    expect((await refusal(sql`update objects.transformation_rules set rationale = 'rewritten rationale text here' where rule_id = ${ruleId}::uuid`.execute(h.su))).message).toMatch(/a transformation rule moves proposed/);
  });
  it('unknown and malformed subjects are refused in the class form', async () => {
    expect((await refusal(obligations(decisionOwner, 'CLM', uuidv7(), 1))).message).toMatch(/^obligations rejected \(unknown_object\)/);
  });
});

describe('VA7 · the per-tenant retention register (V02-T-038) — a TENANT read', () => {
  it('the auditor (TENANT) reads every domain: its schedules with the evidence under each, the next expiry, the holds; the unscheduled profiles', async () => {
    const profile = String((await one(sql`select retention_profile p from observation.blob_manifests where source_id = ${customs}::uuid and vault = 'evidence' limit 1`))['p']);
    const sid = uuidv7();
    await sql`insert into retention.schedules (schedule_id, scope, tenant_id, domain_id, retention_profile, target_kind, action_kind, due_after, selector, owner_principal_id, declared_by, correlation_id)
      values (${sid}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${profile}, 'evidence', 'review', interval '400 days', ${JSON.stringify({ source_id: customs })}::jsonb, ${aydin.principalId}::uuid, ${aydin.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const m = String((await one(sql`select payload ->> 'manifest_id' m from objects.canonical_objects where object_id = ${asEvd(signed).id}::uuid`))['m']);
    await sql`insert into observation.legal_holds (hold_id, scope, tenant_id, domain_id, manifest_id, evd_object_id, reason, placed_by, correlation_id)
      values (${uuidv7()}::uuid, 'DOMAIN', ${T()}::uuid, ${D()}::uuid, ${m}::uuid, ${asEvd(signed).id}::uuid, 'a customs inquiry (SYNTHETIC fixture)', ${aydin.principalId}::uuid, ${uuidv7()}::uuid)`.execute(h.su);
    const r = (await register(auditor)).register;
    const dom = r.domains.find((d) => d['domain_id'] === D()) as Row & { schedules: Row[]; unscheduled_profiles: Row[] };
    expect(dom).toBeDefined();
    const s = dom.schedules.find((x) => x['schedule_id'] === sid)!;
    const n = Number((await one(sql`select count(*)::int n from observation.blob_manifests where source_id = ${customs}::uuid and vault = 'evidence'`))['n']);
    expect(s).toMatchObject({ retention_profile: profile, action_kind: 'review', state: 'active', evidence: n, overdue: 0, held: 1, open_actions: 0 });
    expect(Date.parse(String(s['next_expiry']))).toBeGreaterThan(Date.now());
    expect(dom['holds']).toBeGreaterThanOrEqual(1);
    expect(Array.isArray(dom.unscheduled_profiles)).toBe(true);
  });
  it('a DOMAIN-bound reader is refused (the register is the tenant\'s); the port refuses a DOMAIN-bound context too', async () => {
    expect((await refusal(register(aydin))).status).toBe(403);
  });
});

describe('VA8 · authenticity as a MEASURED coverage dimension (L1-C06)', () => {
  it('the customs source\'s coverage measures authenticity from the recorded outcomes (failed named first); a v1–v3 source keeps unknown', async () => {
    const { CollectionOrchestrator } = await import('../../src/observation/acquisition/orchestrator.service.js');
    const orch = h.app.get(CollectionOrchestrator);
    const measure = async (sourceId: string) => {
      const out = await orch.evaluateCoverage({ envelope: h.env(h.manager, 'observation.coverage.measure', 'SRC', sourceId), principal: h.manager,
        tenantId: T(), domainId: D(), sourceId, windowStart: null, windowEnd: null, evaluatedAt: null }) as { coverage: { dimensions: Row[] } };
      return out.coverage.dimensions;
    };
    const a = (await measure(customs)).find((d) => d['dimension'] === 'authenticity')!;
    expect(a).toMatchObject({ state: 'measured', errorClass: 'authenticity_failed', confidence: 'recorded-per-version' });
    expect(String(a['valueText'])).toMatch(/^content authenticity of \d+ admitted version\(s\) in the window \(publisher signature, ed25519_detached\): 2 FAILED signature check\(s\) — admitted marked, refused at decision-active use; 1 verified; 1 unsigned\./);
    const legacy = (await measure(h.fx.sourceId)).find((d) => d['dimension'] === 'authenticity')!;
    expect(legacy['state']).not.toBe('measured');
  }, 120_000);
});

describe('VA9 · F47 — the authenticity check faults: fail closed (never verified, never silently trusted)', () => {
  it('armed: the signed item is recorded UNAVAILABLE, payload unknown; its claim reads PARTIAL with the reason; disarmed, the same signature verifies', async () => {
    const bytes = variant('20'); const sig = signDetached(bytes, key.privateKey);
    fault.arm(['f47.authenticity_check'], 'test');
    const a = asEvd(await upload(weber, customs, 'djibouti-bulletin-20.json', bytes, sig));
    fault.disarm();
    expect(await payloadCa(a)).toBe('unknown');
    expect(await ledgerOf(a)).toMatchObject({ outcome: 'unavailable', detail: expect.objectContaining({ statement: expect.stringMatching(/could not be checked \(injected fault at f47\.authenticity_check\)/) }) });
    const c = await plantClaim(a);
    const st = (await one(sql`select graph.provenance_strength(${T()}::uuid, ${D()}::uuid, 'CLM', ${c.id}::uuid, 1) s`))['s'] as Row & { reasons: Row[] };
    expect(st.reasons.map((r) => r['code'])).toContain('authenticity_unavailable');
    expect(st['strength']).not.toBe('strong');
    const b2 = variant('21');
    expect(await ledgerOf(await upload(weber, customs, 'djibouti-bulletin-21.json', b2, signDetached(b2, key.privateKey)))).toMatchObject({ outcome: 'verified' });
  }, 180_000);
});

describe('VA10 · the V rows re-verified on this harness (V00-T-120, V00-T-122, AI-39-003, EVD, L1-I05)', () => {
  it('original evidence preserved with its digest verified pre-store, post-store and on the candidate; versions and digests traceable; the signature recorded', async () => {
    const s = asEvd(signed);
    const adm = await one(sql`select details, content_digest, code_digest, connector, connector_version, method_ref from observation.custody_events where evd_object_id = ${s.id}::uuid and event = 'custody.admitted'`);
    expect(adm).toMatchObject({ content_digest: s.bytesDigest, connector: 'collection.upload', connector_version: '1.0.0', method_ref: expect.stringMatching(/^operator-upload-framing@/) });
    expect((adm['details'] as Row)['verified']).toEqual(['pre-store', 'post-store', 'candidate-post-copy']);
    expect(String(adm['code_digest'])).toMatch(/^[0-9a-f]{64}$/);
    const src = await one(sql`select o.schema_ref r from objects.canonical_objects o where o.object_type = 'SRC' and o.object_id = ${customs}::uuid and o.object_version = 1`);
    expect(src).toEqual({ r: 'SRC@v4' });
    const ob = await one(sql`select o.payload -> 'transport' -> 'retained_headers' h from objects.canonical_objects o join objects.canonical_objects e on e.source_object_ids @> to_jsonb(array['OBS:' || o.object_id::text])
      where e.object_id = ${s.id}::uuid and o.object_type = 'OBS'`);
    expect((ob['h'] as Row)['x-publisher-signature']).toMatch(/^[A-Za-z0-9+/]+={0,2}$/);   // AI-39-003: the signature where available, preserved with the request
    const bytesOk = await one(sql`select bm.content_digest = ${s.bytesDigest} ok from observation.blob_manifests bm where bm.manifest_id = (select (payload ->> 'manifest_id')::uuid from objects.canonical_objects where object_id = ${s.id}::uuid)`);
    expect(bytesOk).toEqual({ ok: true });
  });
});
