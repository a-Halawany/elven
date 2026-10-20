/**
 * CP-6 B40 — the THROTTLE stage (§AP, F-P1-04: L1-I02, V03-T-073, ES-31-007, DP-10-005; §CR's egress gateway calls the same stage). OWNED BY
 * §AP: the class name, its `throttle` signature and its registration (intake-stages.ts; the types in intake-stage-types.ts) are the prelude's.
 *
 * Before EVERY request of an SRC@v4 contract — the command form, the stream form and §CR's gateway alike (AcquisitionContext.throttle):
 *   1. THE RIGHTS RE-CHECKED from current state (ES-31-007): the contract version still active, its rights not withdrawn, the rights terms
 *      neither withdrawn nor expired — a change that lands mid-run stops the NEXT request (refused `rights` / `licence` / `policy`);
 *   2. THE WINDOW re-checked (a window that closes mid-run stops the next request — `window_closed`);
 *   3. ROBOTS per request path, from the authorization's cached rules (an origin not yet seen is fetched and cached first) —
 *      `robots_disallowed`, or `unavailable` when robots.txt cannot be read (fail closed);
 *   4. THE PER-SOURCE TOKEN BUCKET in Redis (SRC@v4 rate) shared by every form and process: a token taken → the request goes; none free →
 *      the request waits for one, up to MAX_IN_RUN_WAIT_MS in a run; beyond that the run is refused `rate_limited` and the interval is
 *      recorded with the contract's backoff; an unreachable bucket refuses `unavailable` (F50 — fail closed).
 * And when a connector REPORTS a publisher's answer (`answered`, run-policy.ts — the rest connector reports a 429): the Retry-After is read
 * (F51: an unreadable one is `unparsed` and the contract's schedule applies — never sooner), the rate-limited interval is recorded with the
 * contract's backoff (observation.acquisition_rate_limits: attempt, schedule delay, applied delay, the HOLD, whether a retry is planned)
 * and the request is refused `rate_limited` with the hold as its retry-after — the run fails closed, the scheduler retries per the contract
 * (collection-worker.service.ts B40 ap), and every run during the hold is refused before egress by the authorize stage.
 * The rights / window / robots refusals raise IntakeStageRefused with their own class (the seam's ThrottleDecision names only rate_limited
 * and unavailable); the lifecycle records `throttle refused (<class>)` either way. A v1–v3 contract proceeds at once, and a reported answer
 * of a v1–v3 contract proceeds to the connector's recorded path (a 429 is still the transport failure it always was — D8).
 * CONSTRUCTION; the demonstrated throttling is the act's synthetic replay set (D10); real acceptance — never claimed.
 */
import { Injectable, Logger } from '@nestjs/common';
import { IntakeStageRefused, type IntakeStageContext, type ThrottleDecision, type ThrottleRequest, type ThrottleStage } from '../intake-stage-types.js';
import * as fault from '../../fault-injection.js';
import { MAX_IN_RUN_WAIT_MS, contractBackoff, originOf, parseRetryAfter, redactEndpoint, robotsVerdict, windowVerdict, type RetryAfter } from '../../acquisition-policy/policy-model.js';
import { AcquisitionPolicyStore } from '../../acquisition-policy/policy-store.js';
import { RateBucket } from '../../acquisition-policy/rate-bucket.js';
import { RobotsService } from '../../acquisition-policy/robots.service.js';
import { RunPolicyCache, answeredOf, policyOf, replaySetOf, runRefOf, type RunPolicy } from '../../acquisition-policy/run-policy.js';

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

@Injectable()
export class ThrottleStageAp implements ThrottleStage {
  private readonly log = new Logger('observation.acquisition-policy');

  constructor(
    private readonly store: AcquisitionPolicyStore,
    private readonly bucket: RateBucket,
    private readonly robots: RobotsService,
    private readonly runs: RunPolicyCache,
  ) {}

  async throttle(ctx: IntakeStageContext, request: ThrottleRequest): Promise<ThrottleDecision> {
    const policy = policyOf(ctx);
    if (!ctx.v4 || policy === null) return { kind: 'proceed' }; // D8
    const answered = answeredOf(request);
    if (answered !== null) return answered.status === 429 ? this.publisherRateLimited(ctx, request.endpoint, answered.retryAfter) : { kind: 'proceed' };

    const run = runRefOf(ctx);
    // 1. the rights from current state, before this request (ES-31-007)
    let rights: Awaited<ReturnType<AcquisitionPolicyStore['rightsNow']>>;
    try { rights = await this.store.rightsNow(run); } catch (e) {
      return { kind: 'refuse', reasonClass: 'unavailable', reason: `the rights could not be re-checked before the request (${(e as Error).message.slice(0, 160)}); it was not sent` };
    }
    if (!rights.ok) throw new IntakeStageRefused('throttle', rights.class ?? 'rights', `${rights.reason} — the request to ${redactEndpoint(request.endpoint)} was not sent`);
    // 2. the window, at this request
    const w = windowVerdict(policy.window, new Date());
    if (!w.open) throw new IntakeStageRefused('throttle', 'window_closed', `${w.reason} — the request to ${redactEndpoint(request.endpoint)} was not sent`);
    // 3. robots for this request's path
    const p = this.policyFor(ctx);
    if (policy.robots.mode === 'evaluate') {
      const origin = originOf(request.endpoint);
      let groups = p.robots.get(origin);
      if (groups === undefined) {
        const got = await this.robots.fetch(run, origin, { mode: p.mode, replaySet: p.replaySet, endpoints: [...p.endpoints, request.endpoint] });
        if (got.outcome === 'unavailable') return { kind: 'refuse', reasonClass: 'unavailable', reason: got.reason };
        groups = got.groups; p.robots.set(origin, groups);
      }
      const v = robotsVerdict(groups, request.endpoint);
      if (!v.allowed) throw new IntakeStageRefused('throttle', 'robots_disallowed', `robots.txt of ${origin} disallows ${v.path} (${v.matched ?? ''}) — the request was not sent`);
    }
    // 4. the per-source bucket, shared by every form and process
    const started = Date.now();
    for (;;) {
      const got = await this.bucket.take(ctx.sourceId, policy.rate);
      if (got.kind === 'taken') return { kind: 'proceed' };
      if (got.kind === 'unavailable') return { kind: 'refuse', reasonClass: 'unavailable', reason: `${got.reason} — the request was not sent` };
      if (Date.now() - started + got.waitMs <= MAX_IN_RUN_WAIT_MS) { await sleep(got.waitMs); continue; }
      // the contract's own rate cannot serve this run in time: the run stops, the interval and the contract's backoff are recorded
      const waitSeconds = Math.ceil(got.waitMs / 1000);
      const rec = await this.store.recordRateLimit(run, { origin: 'contract_rate', endpoint: redactEndpoint(request.endpoint), status: null, retryAfterRaw: null, retryAfterSeconds: waitSeconds },
        (attempt) => contractBackoff(policy.backoff, attempt, null, waitSeconds)).catch((e: unknown) => { this.log.warn(`run ${ctx.runId}: the rate-limited interval could not be recorded: ${(e as Error).message.slice(0, 200)}`); return null; });
      return { kind: 'refuse', reasonClass: 'rate_limited', retryAfterSeconds: waitSeconds,
        reason: `the contract's rate (${policy.rate.requests} per ${policy.rate.per_seconds} s, burst ${policy.rate.burst}) frees a token in ${waitSeconds} s, beyond the run's wait of ${MAX_IN_RUN_WAIT_MS / 1000} s; ${rec === null ? 'the interval could not be recorded' : `the source is held until ${String(rec.until)} (attempt ${rec.attempt})`} — the request was not sent` };
    }
  }

  /** A publisher's 429: Retry-After read (F51 → unparsed, the schedule applies), the interval and the contract's backoff recorded, the run refused. */
  private async publisherRateLimited(ctx: IntakeStageContext, endpoint: string, retryAfterRaw: string | null): Promise<ThrottleDecision> {
    const policy = policyOf(ctx)!;
    let ra: RetryAfter;
    try {
      fault.at('f51.retry_after_parse');
      ra = parseRetryAfter(retryAfterRaw, new Date());
    } catch {
      ra = { state: 'unparsed', seconds: null, raw: retryAfterRaw === null ? null : retryAfterRaw.slice(0, 64) };
    }
    let applied = 0;
    const rec = await this.store.recordRateLimit(runRefOf(ctx), { origin: 'publisher_429', endpoint: redactEndpoint(endpoint), status: 429, retryAfterRaw: ra.raw, retryAfterSeconds: ra.seconds },
      (attempt) => { const b = contractBackoff(policy.backoff, attempt, ra); applied = b.appliedDelaySeconds; return b; })
      .catch((e: unknown) => { this.log.warn(`run ${ctx.runId}: the rate-limited interval could not be recorded: ${(e as Error).message.slice(0, 200)}`); return null; });
    const asked = ra.state === 'parsed' ? `Retry-After ${ra.seconds} s` : ra.state === 'unparsed' ? `an unreadable Retry-After ("${ra.raw ?? ''}")` : 'no Retry-After';
    return { kind: 'refuse', reasonClass: 'rate_limited', ...(applied > 0 ? { retryAfterSeconds: applied } : ra.seconds !== null ? { retryAfterSeconds: ra.seconds } : {}),
      reason: `the publisher answered 429 Too Many Requests with ${asked}; ${rec === null
        ? 'the rate-limited interval could not be recorded — no further request was sent'
        : `the contract's backoff holds the source ${applied} s until ${String(rec.until)} (attempt ${rec.attempt} of ${policy.backoff.max_attempts}${rec.exhausted ? ', retries exhausted' : rec.retry_planned ? ', a retry planned' : ''})`}` };
  }

  /** The run's authorization as this process cached it — or, for a run it did not authorize, re-derived from the contract (robots fetched afresh). */
  private policyFor(ctx: IntakeStageContext): RunPolicy {
    const cached = this.runs.get(ctx.runId);
    if (cached !== undefined) return cached;
    const p: RunPolicy = { authorizationId: null, policy: policyOf(ctx)!, robots: new Map(), residency: null, mode: ctx.contract.acquisition_mode,
      replaySet: replaySetOf(ctx), endpoints: ctx.contract.endpoints };
    this.runs.set(ctx.runId, p);
    return p;
  }
}
