/**
 * CP-6 B40 — the AUTHENTICATE stage (§VA, F-P1-02: L1-C06, AI-39-003; DESIGN D6). OWNED BY §VA: this file's body is replaced by the part; the
 * class name, the `authenticate` and `record` signatures and the registration (intake-stages.ts; the types in intake-stage-types.ts) are the
 * prelude's.
 *
 * AFTER inspection passes, BEFORE admission, for an SRC@v4 contract (`ctx.v4`) — its `authenticity` block names the scheme (none |
 * ed25519_detached | jws), the key references and the TLS SPKI pins:
 *   - the signature the item was presented with: the detached one in `x-publisher-signature` (an operator upload carries what the operator
 *     supplied with the file; a replayed response its recorded header) or, for jws, an attached compact JWS body;
 *   - the publisher keys IN FORCE (observation.publisher_keys: not retired, valid now, one of the contract's key references when it names
 *     any) — read through observation.publisher_keys_for_intake (public key material only; the stage runs outside any request context);
 *   - the check (authenticity-b40/verify.ts: node:crypto Ed25519, the existing jose for JWS — no new dependency):
 *       VERIFIED → admitted, the EVD@v1 payload's content_authenticity `verified`;
 *       FAILED → ADMITTED MARKED (D6) — payload `unknown`, the ledger `failed`; refused at a decision-active use (`authenticity_failed`) and
 *                shown weak (graph.px_strength_of);
 *       UNKNOWN SIGNER (no key in force can be the signer) → QUARANTINED (`unknown_signer`, D6, the B16 rule);
 *       UNSIGNED (scheme none, or no signature presented) → admitted, payload `unknown`, the ledger `unsigned`;
 *       UNAVAILABLE (the key read or the check faulted — F47) → admitted MARKED `unavailable`, payload `unknown`: FAIL CLOSED means never
 *                verified and never silently trusted (PARTIAL in the provenance strength); the seam's quarantine is reserved for the
 *                unknown signer.
 * TLS SPKI pins: recorded on the outcome as DECLARED; the transport does not report the peer key, so the pin is not evaluated here — the
 * egress gateway (§CR) records destination identity (resolved addresses + SPKI). Stated on every outcome, never claimed.
 * `record` (inside the admission / quarantine transaction): the outcome in observation.evidence_authenticity (+ custody.authenticity_recorded)
 * and, for an admitted version, its evidence attributes from the contract (observation.evidence_attributes). A v1–v3 contract keeps EXACTLY
 * its recorded behaviour: `not_evaluated`, nothing recorded, the payload `unknown` (D8; the hosted journey 7's text).
 * CONSTRUCTION only; DEMONSTRATED OPERATION is the act's (SYNTHETIC); REAL ACCEPTANCE is never claimed.
 */
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { APP_DB } from '../../../shared/shared.module.js';
import type { Db } from '../../../shared/db.js';
import type { AcquisitionWrites } from '../../observation.capabilities.js';
import type { AuthenticateInput, AuthenticateStage, AuthenticityDecision, IntakeRecordPoint, IntakeStageContext } from '../intake-stage-types.js';
import { checkSignature, keysInForce, presentedSignature, signatureDigest, type IntakeKey, type SignatureScheme } from '../../authenticity-b40/verify.js';
import * as fault from '../../fault-injection.js';

export const AUTHENTICATE_STAGE_VERSION = 'authenticate-va@1.0.0';
const SCHEMES: SignatureScheme[] = ['none', 'ed25519_detached', 'jws'];

/** The contract's authenticity block as the stage reads it (a v4 contract always carries one — §0's schema requires it). */
export function authenticityOf(contract: Record<string, unknown>): { scheme: SignatureScheme; keyRefs: string[]; pins: string[] } {
  const a = (contract['authenticity'] ?? {}) as { scheme?: unknown; key_refs?: unknown; tls_spki_pins?: unknown };
  const scheme = SCHEMES.includes(a.scheme as SignatureScheme) ? a.scheme as SignatureScheme : 'none';
  const list = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
  return { scheme, keyRefs: list(a.key_refs), pins: list(a.tls_spki_pins) };
}

@Injectable()
export class AuthenticateStageVa implements AuthenticateStage {
  constructor(@Inject(APP_DB) private readonly db: Db) {}

  /** The source's keys that are not retired (public material only); the stage decides "in force" at the instant. */
  private async keysOf(ctx: IntakeStageContext): Promise<IntakeKey[]> {
    const r = await sql<{ k: IntakeKey[] }>`select observation.publisher_keys_for_intake(${ctx.tenantId}::uuid, ${ctx.domainId}::uuid, ${ctx.sourceId}::uuid) as k`.execute(this.db);
    return r.rows[0]?.k ?? [];
  }

  async authenticate(ctx: IntakeStageContext, input: AuthenticateInput): Promise<AuthenticityDecision> {
    if (!ctx.v4) return { kind: 'not_evaluated' };   // D8: a v1–v3 contract keeps its recorded behaviour
    const { scheme, keyRefs, pins } = authenticityOf(ctx.contract.contract);
    const tls = { pins_declared: pins.length, observed: null,
      statement: pins.length === 0 ? 'no TLS SPKI pin is declared' : 'the TLS SPKI pins are declared on the contract; the transport does not report the peer key here — the egress gateway records destination identity (§CR)' };
    const base = { scheme, stage: AUTHENTICATE_STAGE_VERSION, tls_identity: tls };
    let signature: string | null = null;
    try {
      fault.at('f47.authenticity_check');
      signature = presentedSignature(scheme, input.item.bytes, input.item.transport.retainedHeaders ?? {});
      const keys = scheme === 'none' || signature === null ? [] : keysInForce(await this.keysOf(ctx), new Date(), keyRefs);
      const r = await checkSignature({ scheme, bytes: input.item.bytes, signature, keys });
      const sigFields = signature === null ? { signature: null, signature_digest: null } : { signature, signature_digest: signatureDigest(signature) };
      if (r.outcome === 'unknown_signer') {
        return { kind: 'quarantine', reasonClass: 'unknown_signer', reason: `content authenticity: ${r.statement}`,
                 detail: { ...base, ...sigFields, statement: r.statement, tried: r.tried, key_refs: keyRefs } };
      }
      return { kind: 'admit', outcome: r.outcome, payloadContentAuthenticity: r.outcome === 'verified' ? 'verified' : 'unknown',
               detail: { ...base, ...sigFields, statement: r.statement, tried: r.tried, key_refs: keyRefs,
                         ...(r.outcome === 'verified' ? { key_id: r.key.key_id, key_fingerprint: r.key.fingerprint, key_ref: r.key.key_ref } : {}) } };
    } catch (e) {
      // FAIL CLOSED (F47): the check could not be made — never verified, never silently trusted; admitted MARKED `unavailable`
      const why = e instanceof Error ? e.message : String(e);
      return { kind: 'admit', outcome: 'unavailable', payloadContentAuthenticity: 'unknown',
               detail: { ...base, signature: signature, signature_digest: signature === null ? null : signatureDigest(signature),
                         statement: `the publisher signature could not be checked (${why.slice(0, 300)}) — neither verified nor refuted; content authenticity unknown` } };
    }
  }

  async record(cap: AcquisitionWrites, ctx: IntakeStageContext, at: IntakeRecordPoint, decision: AuthenticityDecision): Promise<void> {
    if (!ctx.v4 || decision.kind === 'not_evaluated') return;   // D8: nothing is recorded for a v1–v3 contract
    const d = decision.detail;
    const str = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
    await cap.recordEvidenceAuthenticity({
      tenantId: ctx.tenantId, domainId: ctx.domainId, correlationId: ctx.correlationId,
      record: {
        source_id: ctx.sourceId, contract_version: ctx.contractVersion, run_id: ctx.runId,
        ...(at.kind === 'admitted' ? { evd_object_id: at.evdObjectId, evd_version: at.evdVersion } : { case_id: at.caseId }),
        manifest_id: at.manifestId, content_digest: at.contentDigest, item_key: at.itemKey,
        outcome: decision.kind === 'admit' ? decision.outcome : 'unknown_signer',
        scheme: str(d['scheme']) ?? 'none', key_id: str(d['key_id']), signature: str(d['signature']),
        detail: { statement: str(d['statement']), stage: str(d['stage']) ?? AUTHENTICATE_STAGE_VERSION, tried: typeof d['tried'] === 'number' ? d['tried'] : null,
                  key_refs: Array.isArray(d['key_refs']) ? d['key_refs'] : [], tls_identity: d['tls_identity'] ?? null, form: ctx.form },
      },
    });
    if (at.kind === 'admitted') {
      await cap.recordEvidenceAttributes({ tenantId: ctx.tenantId, domainId: ctx.domainId, evdObjectId: at.evdObjectId, evdVersion: at.evdVersion, correlationId: ctx.correlationId });
    }
  }
}
