/**
 * CP-6 B40 §0 — the shared fixtures of the B40 harnesses (§RG, §VA, §IN, §AP, §CR, §AC) and the act. Everything is SYNTHETIC.
 *
 * KEYS ARE GENERATED AT RUN TIME — never a key literal in the repository (DESIGN D18 / D19; CP6 5157-5160): `publisherKeyPair()` makes a
 * fresh Ed25519 pair per call; `signedBulletin()` signs the committed (unsigned) customs bulletin with it; `tamperedCopy()` derives the
 * DEF-B40-02 copy (one value changed, the original signature kept). The HARMLESS DETECTION FIXTURE (the EICAR test string, DESIGN D2) is
 * ASSEMBLED here from parts at run time — no file in the repository is one a scanner flags.
 *
 * The committed sets live under fixtures/phase7/b40 (scripts/phase6/build-b40-fixtures.mjs). A replay contract reaches a B40 replay set
 * either with EYE_CONNECTOR_REPLAY_ROOT = B40_REPLAY_ROOT (a harness) or, under the deployment's default root (fixtures/phase1/replay — the
 * demo), with `replay_set: replaySetFromPhase1Root(<set>)`.
 */
import { createHash, generateKeyPairSync, sign, verify, type KeyObject } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SourceContractV1 } from '../../src/observation/sources/source-contract.js';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const B40_FIXTURES = join(REPO, 'fixtures', 'phase7', 'b40');
export const B40_REPLAY_ROOT = join(B40_FIXTURES, 'replay');
const PHASE1_REPLAY_ROOT = join(REPO, 'fixtures', 'phase1', 'replay');
/** A `replay_set` that reaches a B40 replay set from the deployment's default replay root (fixtures/phase1/replay). */
export const replaySetFromPhase1Root = (set: string): string => relative(PHASE1_REPLAY_ROOT, join(B40_REPLAY_ROOT, set));

export const fixtureBytes = (rel: string): Buffer => readFileSync(join(B40_FIXTURES, rel));
export const fixtureManifest = (dir: string): Record<string, unknown> => JSON.parse(readFileSync(join(B40_FIXTURES, dir, 'MANIFEST.json'), 'utf8')) as Record<string, unknown>;
export const sha256 = (b: Uint8Array | string): string => createHash('sha256').update(b).digest('hex');

export const B40_FILES = {
  shippingNotices: 'replay/red-sea-shipping-notices/feed.xml',
  vesselCalls: 'replay/djibouti-port-vessel-calls/vessel-calls-2026-10-20.json',
  bulletin: 'customs/djibouti-transshipment-bulletin-2026-10-19.json',
  cleanPdf: 'uploads/regensburg-bearings-delivery-note.pdf',
  supplierPdf: 'uploads/regensburg-bearings-supplier-quality-report.pdf',
  macroDocm: 'uploads/regensburg-bearings-inspection-checklist.docm',
} as const;
export const B40_HOSTS = {
  shippingNotices: 'https://notices.red-sea.synthetic.example/navarea-ix/rss',
  vesselCalls: 'https://api.port-djibouti.synthetic.example/v1/vessel-calls?date=2026-10-20',
  partner: 'https://consignments.partner-logistics.synthetic.example/v1/consignments?page=1',
  unregistered: 'https://track.unregistered-carrier.synthetic.example/NWL-7703',
} as const;

/* ── keys and signatures, made at run time ─────────────────────────────────────────────────────────────────────────────────────── */
export interface PublisherKeyPair { publicKeyPem: string; privateKey: KeyObject; publicKey: KeyObject; fingerprint: string }
/** A FRESH Ed25519 pair (never persisted by this module). `fingerprint` = sha256 (hex) of the SubjectPublicKeyInfo DER — a key reference, not key material. */
export function publisherKeyPair(): PublisherKeyPair {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const der = publicKey.export({ type: 'spki', format: 'der' });
  return { publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }).toString(), privateKey, publicKey, fingerprint: sha256(der) };
}
/** A detached Ed25519 signature (base64) over the exact bytes. */
export const signDetached = (bytes: Uint8Array, privateKey: KeyObject): string => sign(null, bytes, privateKey).toString('base64');
export const verifyDetached = (bytes: Uint8Array, signatureB64: string, publicKey: KeyObject): boolean =>
  verify(null, bytes, publicKey, Buffer.from(signatureB64, 'base64'));
/** A compact JWS (EdDSA) over the bytes, through the existing `jose` dependency. */
export async function signJws(bytes: Uint8Array, privateKey: KeyObject, kid: string): Promise<string> {
  const { CompactSign } = await import('jose');
  return new CompactSign(bytes).setProtectedHeader({ alg: 'EdDSA', kid }).sign(privateKey);
}

/** The committed customs bulletin, signed NOW with a fresh key (scene B40-2). */
export function signedBulletin(key: PublisherKeyPair = publisherKeyPair()): { bytes: Buffer; signature: string; key: PublisherKeyPair } {
  const bytes = fixtureBytes(B40_FILES.bulletin);
  return { bytes, signature: signDetached(bytes, key.privateKey), key };
}
/** DEF-B40-02: the tampered copy — consignments[0].status cleared → held — byte-for-byte otherwise; the ORIGINAL signature no longer verifies. */
export function tamperedCopy(bytes: Buffer): Buffer {
  const text = bytes.toString('utf8');
  const at = text.indexOf('"status": "cleared"');
  if (at < 0) throw new Error('the bulletin fixture no longer carries the value DEF-B40-02 changes');
  return Buffer.from(`${text.slice(0, at)}"status": "held"${text.slice(at + '"status": "cleared"'.length)}`, 'utf8');
}

/* ── the harmless detection fixture (DESIGN D2), assembled at run time ─────────────────────────────────────────────────────────── */
/**
 * The EICAR anti-malware test string — harmless by design, detected by every signature engine. Built from parts so no committed file
 * carries it; written by a harness only into a temporary file or a request body, and removed after use.
 */
export function eicarTestBytes(): Buffer {
  const parts = ['X5O!P%@AP[4\\PZX54(P^)7CC)7}', '$EICAR-STANDARD-', 'ANTIVIRUS-TEST-', 'FILE!$H+H*'];
  return Buffer.from(parts.join(''), 'ascii');
}

/* ── the adapter packages (scene B40-5) ────────────────────────────────────────────────────────────────────────────────────────── */
export function adapterPackage(version: '1.0.0' | '1.0.1'): { dir: string; descriptor: Record<string, unknown>; files: Array<{ file: string; sha256: string }>; packageDigest: string } {
  const rel = `adapter/nordwerk-logistics-consignments-${version}`;
  const m = fixtureManifest(rel) as { files: Array<{ file: string; sha256: string }>; package_digest: string };
  for (const f of m.files) if (sha256(fixtureBytes(`${rel}/${f.file}`)) !== f.sha256) throw new Error(`adapter fixture ${rel}/${f.file} does not match its MANIFEST`);
  return { dir: join(B40_FIXTURES, rel), descriptor: JSON.parse(fixtureBytes(`${rel}/adapter.json`).toString('utf8')) as Record<string, unknown>, files: m.files, packageDigest: m.package_digest };
}

/* ── SRC@v4 contracts ──────────────────────────────────────────────────────────────────────────────────────────────────────────── */
/** The six v4 blocks with the defaults the demonstration uses (D7: active content quarantined; D2: only a clean verdict admits). */
export function v4Blocks(over: Partial<Pick<SourceContractV1, 'acquisition_policy' | 'authenticity' | 'content_policy' | 'economics' | 'stewardship' | 'evidence_attributes'>> = {}) {
  return {
    acquisition_policy: {
      rate: { requests: 6, per_seconds: 60, burst: 2 },
      backoff: { schedule_seconds: [60, 300, 900], max_attempts: 4, honour_retry_after: true },
      robots: { mode: 'evaluate' as const, reason: null },
      window: { days: ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as Array<'mon' | 'tue' | 'wed' | 'thu' | 'fri' | 'sat' | 'sun'>, hours_utc: { from: 0, to: 24 }, blackout: [] },
      residency_check: 'enforce' as const,
    },
    authenticity: { scheme: 'none' as const, key_refs: [], tls_spki_pins: [] },
    content_policy: {
      scan_engines: ['content-inspector'] as Array<'content-inspector' | 'clamav'>,
      active_content: 'quarantine' as const, macros: 'quarantine' as const, embedded_files: 'quarantine' as const, hidden_instructions: 'quarantine' as const,
      admit_opaque_reason: null, auto_admit: { mode: 'never' as const, max_bytes: null, media_types: [] },
    },
    economics: { cost_per_run: 0, budget_per_period: 0, period: 'month' as const, currency: 'EUR', owner: 'observation.operations (SYNTHETIC)' },
    stewardship: { steward: 'F. Aydın (data steward, SYNTHETIC)', review_due: '2027-04-30' },
    evidence_attributes: { geographic_scope: ['Red Sea', 'Gulf of Aden'], language: 'en', sensitivity: 'commercial' as const },
    ...over,
  };
}

/** A complete SRC@v4 contract (v1 fields + the six blocks; `adapter` for the adapter kind). Validates with validateSourceContract and the registry's SRC@v4 row. */
export function srcV4Contract(a: {
  sourceKey: string; name?: string; kind: 'upload' | 'rss' | 'rest' | 'adapter'; endpoints?: string[]; replaySet?: string; mode?: 'replay' | 'live';
  mediaTypes?: string[]; adapter?: { package_id: string; version: string; digest: string }; version?: number; supersedes?: number | null;
  blocks?: Parameters<typeof v4Blocks>[0];
}): Record<string, unknown> {
  const upload = a.kind === 'upload';
  return {
    source_key: a.sourceKey, name: a.name ?? `${a.sourceKey} (SYNTHETIC)`, publisher: 'B40 fixture publisher (SYNTHETIC; does not exist)',
    authority_class: 'observational', connector_kind: a.kind, acquisition_mode: a.mode ?? 'replay', data_origin: 'synthetic',
    identity: { source_identity: a.sourceKey, publisher_identity: 'B40 fixture publisher (synthetic entity)', endpoints: upload ? [] : a.endpoints ?? [],
                scheme_allowlist: ['https'], cadence_seconds: 3_600, jitter_seconds: 0, collection_window: null },
    authority_and_rights: {
      owner: 'observation.operations', steward: 'B40 fixture steward', authority: 'Synthetic publisher terms (B40 fixture)', legal_basis: 'Synthetic data created for tests',
      rights_state: 'confirmed', licence: 'synthetic-test-licence', permitted_use: ['internal analysis'], robots_policy: 'evaluated per SRC@v4 acquisition_policy.robots',
      purposes: ['corridor monitoring'], classification_ceiling: 'internal', residency: 'EU', retention: '24 months', deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: null, authentication_method: upload ? 'operator upload under an authenticated session' : 'none (public synthetic feed)',
      authenticity_method: { transport_endpoint: 'TLS to the declared host', byte_integrity: 'SHA-256 verified pre-store, post-store and on every read',
                             source_origin: 'the declared host allowlist', content_authenticity: 'per SRC@v4 authenticity' },
      budgets: { max_requests_per_run: 25, max_bytes_per_run: 33_554_432, max_concurrency: 1, timeout_ms: 60_000, max_retries: 0 },
      expected_schema: { media_types: a.mediaTypes ?? ['application/json'], required_fields: [], drift_tolerance: 0 },
      freshness_expectation: { threshold_seconds: 86_400, expected_interval: 'daily' },
      coverage_expectations: { universe_version: 'v1', denominator_derivation: 'one response per poll', expected_items_per_window: null },
      correction_channel: 'a later notice from the publisher',
      ...(a.replaySet === undefined ? {} : { replay_set: a.replaySet }),
    },
    lifecycle: { contract_version: a.version ?? 1, effective_from: '2026-10-20T00:00:00Z', effective_to: null, supersedes_version: a.supersedes ?? null },
    ...v4Blocks(a.blocks),
    ...(a.kind === 'adapter' ? { adapter: a.adapter } : {}),
  };
}

/* ── B40 integration — §RG's evaluation gate (DESIGN D5) ───────────────────────────────────────────────────────────────────────────── */
/**
 * An SRC@v4 contract is APPROVED only on a recorded evaluation of THAT version recommending approval (0123 §RG approve_source; v1–v3 keep
 * their path). The harnesses of §VA, §IN, §AP and §CR approve v4 contracts: each records the evaluation FIRST through this one helper —
 * §RG's own port (observation.source.evaluate, the evaluation capability) by a collection manager who did not register the version (the
 * harness's manager, never the registrar). Everything recorded is SYNTHETIC.
 */
export async function evaluateForApproval(
  h: { pipeline: { write: (...a: never[]) => Promise<{ result: unknown }> }; env: (p: never, action: string, type: string, id: string | null) => unknown },
  evaluator: { principalId: string },
  a: { tenantId: string; domainId: string; sourceId: string; contractVersion: number; label?: string },
): Promise<Record<string, unknown>> {
  const { RegistryB40Capability } = await import('../../src/observation/registry-b40/registry.capabilities.js');
  const { uuidv7 } = await import('uuidv7');
  const label = a.label ?? 'B40 fixture';
  const write = h.pipeline.write as unknown as (env: unknown, principal: unknown, route: unknown, factory: unknown,
    handler: (cap: { evaluate: (x: Record<string, unknown>) => Promise<Record<string, unknown>> }) => Promise<unknown>) => Promise<{ result: Record<string, unknown> }>;
  const out = await write.call(h.pipeline, h.env(evaluator as never, 'observation.source.evaluate', 'SRC', a.sourceId), evaluator,
    { scope: 'DOMAIN', tenantId: a.tenantId, domainId: a.domainId, action: 'observation.source.evaluate', objectType: 'SRC', objectId: a.sourceId },
    RegistryB40Capability.evaluation,
    async (cap) => ({ result: await cap.evaluate({ requestId: uuidv7(), tenantId: a.tenantId, domainId: a.domainId, sourceId: a.sourceId, contractVersion: a.contractVersion,
      authority: `${label}: the publisher is a SYNTHETIC fixture publisher of this harness`, rightsEvidence: `${label}: the fixture's terms permit internal monitoring use (SYNTHETIC)`,
      coverageFit: `${label}: the fixture covers what the harness exercises (SYNTHETIC)`, cost: 'none (fixture)', risks: [],
      contractTests: [{ name: 'fixture contract parses', outcome: 'pass', note: null }], recommendation: 'approve',
      reason: `${label}: evaluated before its approval — §RG's gate (D5), SYNTHETIC`, actor: evaluator.principalId, correlationId: uuidv7() }),
      targetType: 'SRC', targetId: a.sourceId, targetVersion: String(a.contractVersion), outboxEvent: null }));
  return out.result;
}
