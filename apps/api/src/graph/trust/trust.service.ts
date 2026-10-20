/**
 * CP-6 B82 §PX (0121_b82_x_px; UX-57-001…005, CMP-022, WS-18, UX-27-004/005) — THE TRUST SERVICE: the pipeline's audited reads (the trust
 * envelope, the provenance strength, the Trust and Governance overview — `graph.trust.read`) and the four human-gated acts: VERIFY AGAIN a
 * facet (`graph.trust.verify` — the server computes the outcome; for a signature the deployment's verifier answers verified / failed /
 * UNAVAILABLE per recorded signature and the port records it), ATTEST what one inspected (`graph.trust.attest`; never an approval, never
 * the producer's or owner's), WITHDRAW one's own attestation (`graph.trust.withdraw`), OPEN AN INVESTIGATION (`graph.trust.investigate` —
 * an attention item to the product's owner). The intake is shaped here (TYPES only — every rule is the port's).
 *
 * THE RETRY RULE (PAT-20): an act carries a request id (an investigation its item id); a retry after an unknown outcome REUSES it and the
 * port answers the recorded act (`replayed` / `repeated`); a new act takes a new id.
 *
 * Refusals are the ports' words; the nouns `trust verification`, `trust attestation`, `trust investigation` (and B50's `provenance` for the
 * reads) are mapped centrally (observation-errors.ts). THREE CLAIMS: construction (this code and phase6-trust-b82, SYNTHETIC); demonstrated
 * operation (the act — SYNTHETIC personas); real acceptance — never claimed.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService, type RouteInfo } from '../../pipeline/pipeline.service.js';
import { SignatureService } from '../../executive/signatures/signature.service.js';
import { TRUST_FACETS } from '../b82-seams.js';
import { TrustCapability, type TrustSubject } from './trust.capabilities.js';

type Row = Record<string, unknown>;
export const TRUST_ACTIONS = {
  read: 'graph.trust.read', verify: 'graph.trust.verify', attest: 'graph.trust.attest', withdraw: 'graph.trust.withdraw', investigate: 'graph.trust.investigate',
} as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE = /^[A-Z]{3}$/;
const DIGEST = /^[0-9a-f]{64}$/;

/** A refusal answered by the route before any port runs (the caller's own request shape), in the class form. */
export function refuseTrust(noun: string, cls: string, message: string, correlationId: string, status = 422): HttpException {
  return new HttpException(errorBody((status === 404 ? 'EYE_STA_001' : 'EYE_REQ_001') as never, correlationId, `${noun} rejected (${cls}): ${message}`), status);
}

export type TrustScope = { tenantId: string; domainId: string };
const routeOf = (s: TrustScope, action: string, objectType: string, objectId: string | null): RouteInfo =>
  ({ scope: 'DOMAIN', tenantId: s.tenantId, domainId: s.domainId, action, objectType, objectId });
const derive = (base: Envelope, action: string, objectType: string, objectId: string | null): Envelope =>
  ({ ...base, action, object_type: objectType, object_id: objectId, side_effect_class: action === TRUST_ACTIONS.read ? 'none' : 'reversible', message_id: newId() }) as Envelope;
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const str = (p: Row, k: string): string | null => (typeof p[k] === 'string' && (p[k] as string).trim() !== '' ? (p[k] as string).trim() : null);

/** The subject {type, id, version} of a request (the port re-checks it is recorded in the caller's domain). */
export function subjectOf(noun: string, p: Row, cid: string): { type: string; id: string; version: number } {
  const type = p['type']; const id = p['id']; const version = p['version'];
  if (typeof type !== 'string' || !TYPE.test(type) || typeof id !== 'string' || !UUID.test(id) || typeof version !== 'number' || !Number.isSafeInteger(version) || version < 1) {
    throw refuseTrust(noun, 'subject', 'the subject is a recorded product named by type (three capitals), id (a uuid) and version (1 or more)', cid);
  }
  return { type, id: id.toLowerCase(), version };
}
function idOf(noun: string, v: unknown, cls: string, what: string, cid: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseTrust(noun, cls, `${what} is an id (a uuid)`, cid);
  return v.toLowerCase();
}
/** The overview's scope as the read takes it (the read validates the members). */
export function overviewScopeIntake(p: Row, cid: string): Row {
  for (const k of Object.keys(p)) if (!['types', 'limit', 'days'].includes(k)) throw refuseTrust('provenance', 'overview_scope', 'the overview is asked by types, limit and days only', cid);
  return { ...p };
}

@Injectable()
export class TrustService {
  constructor(private readonly pipeline: PipelineService, private readonly signatures: SignatureService) {}

  /** THE ENVELOPE (graph.trust.read, audited): facets never a score, the strength, attestations, verifications, investigations, the digest. */
  async envelope(env: Envelope, p: AuthenticatedPrincipal, s: TrustScope, body: Row) {
    const sub = subjectOf('provenance', body, env.correlation_id);
    const out = await this.pipeline.consequentialRead(derive(env, TRUST_ACTIONS.read, sub.type, sub.id), p, routeOf(s, TRUST_ACTIONS.read, sub.type, sub.id), TrustCapability.read,
      async (cap) => cap.envelope({ ...s, ...sub }));
    return { envelope: out.result, receipt: receipt(out) };
  }

  /** THE STRENGTH (graph.trust.read, audited) — B81's `weak_provenance` failure state reads it. */
  async strength(env: Envelope, p: AuthenticatedPrincipal, s: TrustScope, body: Row) {
    const sub = subjectOf('provenance', body, env.correlation_id);
    const out = await this.pipeline.consequentialRead(derive(env, TRUST_ACTIONS.read, sub.type, sub.id), p, routeOf(s, TRUST_ACTIONS.read, sub.type, sub.id), TrustCapability.read,
      async (cap) => cap.strength({ ...s, ...sub }));
    return { strength: out.result, receipt: receipt(out) };
  }

  /** THE TRUST AND GOVERNANCE OVERVIEW (graph.trust.read, audited) — WS-18. */
  async overview(env: Envelope, p: AuthenticatedPrincipal, s: TrustScope, body: Row) {
    const scope = overviewScopeIntake(body, env.correlation_id);
    const out = await this.pipeline.consequentialRead(derive(env, TRUST_ACTIONS.read, 'TRS', null), p, routeOf(s, TRUST_ACTIONS.read, 'TRS', null), TrustCapability.read,
      async (cap) => cap.overview({ ...s, scope }));
    return { overview: out.result, receipt: receipt(out) };
  }

  /** VERIFY AGAIN one facet (graph.trust.verify; a named person). A signature is verified HERE with the deployment's key, per recorded signature. */
  async verify(env: Envelope, p: AuthenticatedPrincipal, s: TrustScope, body: Row) {
    const cid = env.correlation_id; const noun = 'trust verification';
    const sub = subjectOf(noun, body, cid);
    const requestId = idOf(noun, body['requestId'], 'request', 'requestId (the command identity a retry reuses)', cid);
    const facet = str(body, 'facet');
    if (facet === null || !(TRUST_FACETS as readonly string[]).includes(facet)) throw refuseTrust(noun, 'facet', `the facet is one of ${TRUST_FACETS.join(', ')}`, cid);
    const out = await this.pipeline.write(derive(env, TRUST_ACTIONS.verify, sub.type, sub.id), p, routeOf(s, TRUST_ACTIONS.verify, sub.type, sub.id), TrustCapability.verify, async (cap) => {
      const subject: TrustSubject = { ...s, ...sub };
      let sigs: Row[] | null = null;
      if (facet === 'signature') {
        // the verifier's answer per RECORDED signature (verified | failed | unavailable — a key not on file is unavailable, never failed)
        sigs = (await cap.signatures(subject)).map((r) => {
          const o = this.signatures.verifyOutcome({ key_id: String(r['key_id'] ?? ''), signature: String(r['signature'] ?? ''), subject_digest: String(r['subject_digest'] ?? '') });
          return { signature_id: r['signature_id'], key_id: r['key_id'], subject_kind: r['subject_kind'], outcome: o.outcome, reason: o.reason };
        });
      }
      const r = await cap.verify({ ...subject, requestId, facet, signatures: sigs, actor: p.principalId, correlationId: cid });
      return { result: r, targetType: sub.type, targetId: sub.id, targetVersion: String(sub.version), outboxEvent: null };
    });
    return { verification: out.result, receipt: receipt(out) };
  }

  /** ATTEST what one inspected (graph.trust.attest; a named person, never the producer or owner) against the envelope digest one read. */
  async attest(env: Envelope, p: AuthenticatedPrincipal, s: TrustScope, body: Row) {
    const cid = env.correlation_id; const noun = 'trust attestation';
    const sub = subjectOf(noun, body, cid);
    const requestId = idOf(noun, body['requestId'], 'request', 'requestId (the command identity a retry reuses)', cid);
    const facets = body['facets'];
    if (!Array.isArray(facets) || facets.length === 0 || facets.some((f) => typeof f !== 'string')) throw refuseTrust(noun, 'facets', 'facets lists the facets inspected', cid);
    const digest = body['envelopeDigest'];
    if (typeof digest !== 'string' || !DIGEST.test(digest)) throw refuseTrust(noun, 'digest', 'envelopeDigest is the digest of the envelope the attester read (64 hex)', cid);
    const out = await this.pipeline.write(derive(env, TRUST_ACTIONS.attest, sub.type, sub.id), p, routeOf(s, TRUST_ACTIONS.attest, sub.type, sub.id), TrustCapability.attest, async (cap) => {
      const r = await cap.attest({ ...s, ...sub, requestId, facets: facets as string[], statement: str(body, 'statement') ?? '', envelopeDigest: digest, actor: p.principalId, correlationId: cid });
      return { result: r, targetType: 'TAT', targetId: String(r['attestation_id']), targetVersion: '1', outboxEvent: null };
    });
    return { attestation: out.result, receipt: receipt(out) };
  }

  /** WITHDRAW one's own attestation (graph.trust.withdraw), with the reason. */
  async withdraw(env: Envelope, p: AuthenticatedPrincipal, s: TrustScope, attestationRaw: string, body: Row) {
    const cid = env.correlation_id; const noun = 'trust attestation';
    if (!UUID.test(attestationRaw)) throw refuseTrust(noun, 'unknown_attestation', 'the attestation is named by its id (a uuid)', cid, 404);
    const attestationId = attestationRaw.toLowerCase();
    const requestId = idOf(noun, body['requestId'], 'request', 'requestId (the command identity a retry reuses)', cid);
    const out = await this.pipeline.write(derive(env, TRUST_ACTIONS.withdraw, 'TAT', attestationId), p, routeOf(s, TRUST_ACTIONS.withdraw, 'TAT', attestationId), TrustCapability.attest, async (cap) => {
      const r = await cap.withdraw({ ...s, requestId, attestationId, reason: str(body, 'reason') ?? '', actor: p.principalId, correlationId: cid });
      return { result: r, targetType: 'TAT', targetId: attestationId, targetVersion: '1', outboxEvent: null };
    });
    return { attestation: out.result, receipt: receipt(out) };
  }

  /** OPEN AN INVESTIGATION (graph.trust.investigate; a named person) — an attention item to the product's owner; nothing in the product changes. */
  async investigate(env: Envelope, p: AuthenticatedPrincipal, s: TrustScope, body: Row) {
    const cid = env.correlation_id; const noun = 'trust investigation';
    const sub = subjectOf(noun, body, cid);
    const itemId = idOf(noun, body['itemId'], 'request', 'itemId (the attention item a retry reuses)', cid);
    const facet = body['facet'] === undefined || body['facet'] === null ? null : str(body, 'facet');
    const out = await this.pipeline.write(derive(env, TRUST_ACTIONS.investigate, sub.type, sub.id), p, routeOf(s, TRUST_ACTIONS.investigate, sub.type, sub.id), TrustCapability.investigate, async (cap) => {
      const r = await cap.investigate({ ...s, ...sub, itemId, facet, note: str(body, 'note') ?? '', actor: p.principalId, correlationId: cid });
      return { result: r, targetType: 'ATI', targetId: String(r['item_id']), targetVersion: '1', outboxEvent: null };
    });
    return { investigation: out.result, receipt: receipt(out) };
  }
}

/** The route's envelope and principal, or the request refusal (as every controller of the Eye answers it). */
export function requestOf(req: { eyeEnvelope?: Envelope; eyePrincipal?: AuthenticatedPrincipal }, cid: string) {
  if (req.eyeEnvelope === undefined || req.eyePrincipal === undefined) throw new HttpException(errorBody('EYE_REQ_001', cid), 400);
  return { envelope: req.eyeEnvelope, principal: req.eyePrincipal };
}
