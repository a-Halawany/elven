/**
 * CP-6 B40 — the AUTHENTICATE stage (§VA, F-P1-02). OWNED BY §VA: this file's body is replaced by the part; the class name, the
 * `authenticate` and `record` signatures and the registration (intake-stages.ts) are the prelude's.
 *
 * §0 PRELUDE: `not_evaluated` for every item — the evidence payload's content_authenticity stays `unknown`, exactly as before B40, and
 * nothing is recorded. §VA builds here the verification against the publisher keys in force (SRC@v4 authenticity: ed25519_detached /
 * jws; node:crypto and the existing jose — no new dependency): VERIFIED / FAILED / UNSIGNED / UNAVAILABLE recorded per EVD version in
 * observation.evidence_authenticity by `record`; a FAILED signature is ADMITTED marked (D6), an UNKNOWN signer quarantined
 * (`unknown_signer`). The EVD@v1 payload keeps its enum (verified | unknown | not_applicable): `payloadContentAuthenticity` is `verified`
 * only for a verified item. An unsigned / v1–v3 source keeps "content authenticity unknown" (the hosted journey 7's text).
 */
import { Injectable } from '@nestjs/common';
import type { AcquisitionWrites } from '../../observation.capabilities.js';
import type { AuthenticateInput, AuthenticateStage, AuthenticityDecision, IntakeRecordPoint, IntakeStageContext } from '../intake-stages.js';

@Injectable()
export class AuthenticateStageVa implements AuthenticateStage {
  async authenticate(_ctx: IntakeStageContext, _input: AuthenticateInput): Promise<AuthenticityDecision> {
    return { kind: 'not_evaluated' };
  }

  async record(_cap: AcquisitionWrites, _ctx: IntakeStageContext, _at: IntakeRecordPoint, _decision: AuthenticityDecision): Promise<void> {
    // §0: nothing is recorded (no authenticity ledger exists before §VA)
  }
}
