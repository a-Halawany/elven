/**
 * CP-6 B40 — the AUTHORIZE stage (§AP, F-P1-04). OWNED BY §AP: this file's body is replaced by the part; the class name, its
 * `authorize` signature and its registration (intake-stages.ts; the types in intake-stage-types.ts) are the prelude's.
 *
 * §0 PRELUDE: PASS-THROUGH — every run proceeds with no recorded authorization, exactly as before B40. §AP builds here the acquisition
 * authorization the run cites (observation.acquisition_authorizations: the contract version, purpose, rights + terms in force, credential
 * reference, rate, residency verdict, collection window, robots verdict), refusing before egress with its class
 * (rights | licence | residency_refused | window_closed | robots_disallowed | policy | unavailable) — for an SRC@v4 contract
 * (`ctx.v4`); a v1–v3 contract keeps proceeding as today (D8).
 */
import { Injectable } from '@nestjs/common';
import type { AuthorizeDecision, AuthorizeStage, IntakeStageContext } from '../intake-stage-types.js';

@Injectable()
export class AuthorizeStageAp implements AuthorizeStage {
  async authorize(_ctx: IntakeStageContext): Promise<AuthorizeDecision> {
    return { kind: 'proceed', authorizationId: null };
  }
}
