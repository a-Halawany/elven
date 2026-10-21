/**
 * CP-6 B40 §0 — THE INTAKE SEAM'S COMPOSITION (MAP §3 §0 item 2): the four parts' stages injected into one object the lifecycle holds.
 * The stage contracts and the decision types are in intake-stage-types.ts (re-exported here); each part's stage is its own file under
 * stages/. The prelude owns this file; a part never edits it.
 */
import { Injectable } from '@nestjs/common';
import type { AcquisitionWrites } from '../observation.capabilities.js';
import type {
  AuthenticateInput, AuthenticityDecision, AuthorizeDecision, AuthorizeStage, InspectDecision, InspectInput, IntakeRecordPoint,
  IntakeStageContext, ThrottleDecision, ThrottleRequest, ThrottleStage,
} from './intake-stage-types.js';
import { AuthorizeStageAp } from './stages/authorize-ap.js';
import { ThrottleStageAp } from './stages/throttle-ap.js';
import { InspectStageIn } from './stages/inspect-in.js';
import { AuthenticateStageVa } from './stages/authenticate-va.js';
/* B40 integration */ import { IngressPolicyAp } from '../acquisition-policy/ingress-ap.js'; /* end B40 integration */

export * from './intake-stage-types.js';

/**
 * The composition the lifecycle holds: the four parts' stages, each injected from its own file. Nest constructs them, so a part's stage
 * may inject what it needs (the config, the database, Redis) in ITS OWN constructor without touching this file.
 */
@Injectable()
export class IntakeStages implements AuthorizeStage, ThrottleStage {
  constructor(
    private readonly authorizeAp: AuthorizeStageAp,
    private readonly throttleAp: ThrottleStageAp,
    private readonly inspectIn: InspectStageIn,
    private readonly authenticateVa: AuthenticateStageVa,
    /* B40 integration: §AP's ingress check (residency at ingress, response manipulation / duplicate detection) */ private readonly ingressAp: IngressPolicyAp,
  ) {}

  authorize(ctx: IntakeStageContext): Promise<AuthorizeDecision> { return this.authorizeAp.authorize(ctx); }
  throttle(ctx: IntakeStageContext, request: ThrottleRequest): Promise<ThrottleDecision> { return this.throttleAp.throttle(ctx, request); }
  /** B40 integration: §AP's ingress check AHEAD of §IN's engines (V03-T-072 `record` → residency_conflict, DP-10-005 → response_anomaly):
   *  a v1–v3 contract, an upload and a consistent response answer null and reach the engines unchanged; a held item is quarantined with
   *  §AP's class and no engine verdict (nothing scanned is claimed). */
  async inspect(ctx: IntakeStageContext, input: InspectInput): Promise<InspectDecision> {
    const ap = await this.ingressAp.evaluate(ctx, input.item);
    if (ap !== null) return { kind: 'quarantine', reasonClass: ap.reasonClass, reason: ap.reason, verdicts: [] };
    return this.inspectIn.inspect(ctx, input);
  }
  authenticate(ctx: IntakeStageContext, input: AuthenticateInput): Promise<AuthenticityDecision> { return this.authenticateVa.authenticate(ctx, input); }
  /** Both record hooks of the point, in a fixed order (inspection, then authenticity). */
  async recordAt(cap: AcquisitionWrites, ctx: IntakeStageContext, at: IntakeRecordPoint, d: { inspect: InspectDecision | null; authenticate: AuthenticityDecision | null }): Promise<void> {
    if (d.inspect !== null) await this.inspectIn.record(cap, ctx, at, d.inspect);
    if (d.authenticate !== null) await this.authenticateVa.record(cap, ctx, at, d.authenticate);
  }
}

/** The providers the observation module registers (the composition and the four stages). */
export const INTAKE_STAGE_PROVIDERS = [IntakeStages, AuthorizeStageAp, ThrottleStageAp, InspectStageIn, AuthenticateStageVa] as const;
