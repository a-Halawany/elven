/**
 * CP-6 B40 — the THROTTLE stage (§AP, F-P1-04; §CR's egress gateway calls the same stage). OWNED BY §AP: this file's body is replaced by
 * the part; the class name, its `throttle` signature and its registration (intake-stages.ts) are the prelude's.
 *
 * §0 PRELUDE: PASS-THROUGH — every request proceeds at once, exactly as before B40. The connectors (rest, rss) already call it before
 * each request through AcquisitionContext.throttle, next to the budget meter. §AP builds here the per-source token bucket in Redis
 * (SRC@v4 acquisition_policy.rate: requests per per_seconds, burst), shared by the command and stream forms and the gateway; a stage that
 * cannot reach its bucket answers `refuse` / `unavailable` (fail closed). A v1–v3 contract proceeds as today (D8).
 */
import { Injectable } from '@nestjs/common';
import type { IntakeStageContext, ThrottleDecision, ThrottleRequest, ThrottleStage } from '../intake-stages.js';

@Injectable()
export class ThrottleStageAp implements ThrottleStage {
  async throttle(_ctx: IntakeStageContext, _request: ThrottleRequest): Promise<ThrottleDecision> {
    return { kind: 'proceed' };
  }
}
