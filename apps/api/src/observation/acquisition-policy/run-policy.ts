/**
 * CP-6 B40 §AP — what the AUTHORIZE stage decided for a run, kept in this process for the THROTTLE stage's per-request checks (the robots
 * rules per origin, the residency verdict, the hold, the authorization id). It is a cache of a RECORDED decision (observation.
 * acquisition_authorizations is the authority): a throttle call for a run this process did not authorize (another process, a restart)
 * re-derives what it needs from the contract and current database state — never proceeds on a guess.
 *
 * And the REPORT the connectors (and §CR's gateway) hand the throttle seam with a publisher's answer: `answered` carries the status and the
 * raw Retry-After of a response the stage must decide on (a 429). The seam's ThrottleRequest is `{ endpoint }`; this is its §AP extension,
 * passed through the lifecycle unchanged (lifecycle.service.ts throttleFor) — an integrator may make it explicit in intake-stage-types.ts.
 */
import { Injectable } from '@nestjs/common';
import type { IntakeStageContext } from '../acquisition/intake-stage-types.js';
import type { SrcV4AcquisitionPolicy } from '../sources/source-contract.js';
import type { RobotsGroup, ResidencyVerdict } from './policy-model.js';
import type { RunRef } from './policy-store.js';

/** A publisher's answer reported to the throttle seam (the request it answered is `endpoint`). */
export interface PublisherAnswer { status: number; retryAfter: string | null }
export interface ThrottleReportAp { endpoint: string; answered?: PublisherAnswer }
/** The report as the connectors pass it through AcquisitionContext.throttle (`{ endpoint }` plus the §AP extension). */
export const reportAnswer = (endpoint: string, status: number, retryAfter: string | null | undefined): ThrottleReportAp =>
  ({ endpoint, answered: { status, retryAfter: retryAfter ?? null } });
export const answeredOf = (request: { endpoint: string }): PublisherAnswer | null => {
  const a = (request as ThrottleReportAp).answered;
  return a !== undefined && a !== null && typeof a.status === 'number' ? a : null;
};

export interface RunPolicy {
  authorizationId: string | null;
  policy: SrcV4AcquisitionPolicy;
  /** origin → its parsed groups ([] = no robots file); absent = not yet fetched for this contract version */
  robots: Map<string, RobotsGroup[]>;
  residency: ResidencyVerdict | null;
  mode: 'replay' | 'live';
  replaySet: string;
  endpoints: string[];
  /** IN THIS RUN: the hold a rate-limited request started (epoch ms) and why — every later request of the run is refused before egress. */
  heldUntil?: number | null;
  heldWhy?: string | null;
}

export const runRefOf = (ctx: IntakeStageContext): RunRef => ({
  tenantId: ctx.tenantId, domainId: ctx.domainId, sourceId: ctx.sourceId, contractVersion: ctx.contractVersion, runId: ctx.runId, correlationId: ctx.correlationId,
});
export const policyOf = (ctx: IntakeStageContext): SrcV4AcquisitionPolicy | null => {
  const p = (ctx.contract.contract as { acquisition_policy?: SrcV4AcquisitionPolicy }).acquisition_policy;
  return p !== undefined && p !== null && typeof p === 'object' ? p : null;
};
export const replaySetOf = (ctx: IntakeStageContext): string =>
  String((ctx.contract.contract as { security_and_operations?: { replay_set?: string } }).security_and_operations?.replay_set ?? ctx.contract.source_key);

@Injectable()
export class RunPolicyCache {
  private readonly runs = new Map<string, RunPolicy>();
  private static readonly MAX = 512;

  get(runId: string): RunPolicy | undefined { return this.runs.get(runId); }
  set(runId: string, p: RunPolicy): void {
    this.runs.delete(runId);
    this.runs.set(runId, p);
    while (this.runs.size > RunPolicyCache.MAX) {
      const oldest = this.runs.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.runs.delete(oldest);
    }
  }
}
