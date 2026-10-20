/**
 * CP-6 B40 — the AUTHORIZE stage (§AP, F-P1-04: V03-T-266 30.1, L1-I02, V03-T-072, V03-T-073, ES-31-007, V04-T-019). OWNED BY §AP: the class
 * name, its `authorize` signature and its registration (intake-stages.ts; the types in intake-stage-types.ts) are the prelude's.
 *
 * At the PRE-EGRESS revalidation of every run of an SRC@v4 contract (command and stream form), ONE acquisition authorization is decided
 * from CURRENT database state and RECORDED (observation.acquisition_authorizations — the record the run cites): the contract version and
 * its purpose; the RIGHTS — the contract's rights state AND the rights terms in force (D4's two sources); the LICENCE of the terms (what
 * the contract collects for ∈ the terms' purposes, none prohibited, not expired); the CREDENTIAL REFERENCE (B11 — never a value); the RATE
 * (the bucket must be reachable — F50); the RESIDENCY verdict (the contract's residency against the domain's profile — F53); the COLLECTION
 * WINDOW; the BACKOFF hold in force (a rate-limited interval still open); the ROBOTS verdict per endpoint (fetched through the vetted client
 * or the replay set, cached per contract version — F52). A refusal cancels the run BEFORE any request, with its class:
 *   rights | licence | residency_refused | window_closed | robots_disallowed | policy (the contract not active; the backoff holding) |
 *   unavailable (the facts could not be read, the bucket or robots.txt unreachable — fail closed).
 * Robots.txt is fetched only for a run nothing else refused (a refused run makes no request at all). A v1–v3 contract proceeds exactly as
 * before with no authorization recorded (D8: "not recorded before SRC@v4").
 * CONSTRUCTION; demonstrated operation is the act's (SYNTHETIC); real acceptance — never claimed.
 */
import { Injectable, Logger } from '@nestjs/common';
import type { AuthorizeDecision, AuthorizeRefusalClass, AuthorizeStage, IntakeStageContext } from '../intake-stage-types.js';
import * as fault from '../../fault-injection.js';
import { licenceVerdict, originOf, residencyVerdict, robotsVerdict, windowVerdict, type ResidencyVerdict, type RobotsGroup, type TermsView } from '../../acquisition-policy/policy-model.js';
import { AcquisitionPolicyStore } from '../../acquisition-policy/policy-store.js';
import { RateBucket } from '../../acquisition-policy/rate-bucket.js';
import { RobotsService } from '../../acquisition-policy/robots.service.js';
import { RunPolicyCache, policyOf, replaySetOf, runRefOf } from '../../acquisition-policy/run-policy.js';

type Row = Record<string, unknown>;
interface Inputs {
  at: string;
  contract: { lifecycle_state: string; rights_state: string; acquisition_mode: 'replay' | 'live'; residency: string; purposes: string[]; effective_to: string | null;
              credential_ref: string | null; licence: string | null };
  terms: (TermsView & { recorded_state: string }) | null;
  residency: { profile: string | null; profile_of: string; regions: string[] | null };
  robots: Array<{ origin: string; outcome: string; rules: RobotsGroup[]; robots_id: string; fetched_at: string }>;
  hold: { rate_limit_id: string; until: string; attempt: number; max_attempts: number; origin: string; retry_after_seconds: number | null; exhausted: boolean; retry_planned: boolean } | null;
}

@Injectable()
export class AuthorizeStageAp implements AuthorizeStage {
  private readonly log = new Logger('observation.acquisition-policy');

  constructor(
    private readonly store: AcquisitionPolicyStore,
    private readonly bucket: RateBucket,
    private readonly robots: RobotsService,
    private readonly runs: RunPolicyCache,
  ) {}

  async authorize(ctx: IntakeStageContext): Promise<AuthorizeDecision> {
    const policy = policyOf(ctx);
    if (!ctx.v4 || policy === null) return { kind: 'proceed', authorizationId: null }; // D8: a v1–v3 contract proceeds as before
    const run = runRefOf(ctx);
    let inputs: Inputs;
    try {
      inputs = await this.store.runInputs(run) as unknown as Inputs;
    } catch (e) {
      // the facts could not be read: nothing is known, so nothing goes out (fail closed); the cancellation carries the reason
      return { kind: 'refuse', reasonClass: 'unavailable', authorizationId: null,
        reason: `the acquisition policy's facts could not be read (${(e as Error).message.slice(0, 200)}); nothing was requested` };
    }
    const at = new Date(inputs.at);
    const c = inputs.contract;
    let refusal: { cls: AuthorizeRefusalClass; reason: string } | null = null;
    const refuse = (cls: AuthorizeRefusalClass, reason: string) => { if (refusal === null) refusal = { cls, reason }; };

    // ── the rights: the contract's (D4's first source) ───────────────────────────────────────────────────────────────────────────────
    const rightsOk = c.rights_state === 'confirmed' || (c.rights_state === 'pending' && c.acquisition_mode === 'replay');
    if (c.lifecycle_state !== 'active') refuse('policy', `the contract version is ${c.lifecycle_state}, not active`);
    if (!rightsOk) refuse('rights', `the contract's rights are ${c.rights_state} for a ${c.acquisition_mode} contract`);
    if (c.effective_to !== null && Date.parse(c.effective_to) <= at.getTime()) refuse('licence', `the contract's effective period ended at ${c.effective_to}`);
    // ── the rights terms in force: D4's second source, and the licence they grant ───────────────────────────────────────────────────
    const licence = licenceVerdict(c.purposes, ctx.purposeId, inputs.terms === null ? null : { ...inputs.terms, purposes: inputs.terms.purposes ?? [], prohibited_uses: inputs.terms.prohibited_uses ?? [] });
    if (!licence.ok && licence.class !== null) refuse(licence.class, licence.reason);
    // ── residency at ingress (F53: a lookup that fails is unavailable, never a pass) ─────────────────────────────────────────────────
    let residency: ResidencyVerdict | null = null;
    try {
      fault.at('f53.residency_lookup');
      residency = residencyVerdict(c.residency, inputs.residency.profile, inputs.residency.regions, policy.residency_check);
      if (residency.refuse) refuse('residency_refused', residency.reason);
    } catch (e) {
      refuse('unavailable', `the residency profile could not be resolved (${(e as Error).message.slice(0, 160)}) — nothing was requested`);
    }
    // ── the collection window ───────────────────────────────────────────────────────────────────────────────────────────────────────
    const window = windowVerdict(policy.window, at);
    if (!window.open) refuse('window_closed', window.reason);
    // ── the contract's backoff: a rate-limited interval still open holds collection ──────────────────────────────────────────────────
    if (inputs.hold !== null) {
      refuse('policy', `rate_limited: the contract's backoff holds collection until ${inputs.hold.until} (attempt ${inputs.hold.attempt} of ${inputs.hold.max_attempts}, ${inputs.hold.origin.replace('_', ' ')}) — no request before the hold ends`);
    }
    // ── the rate: the bucket must answer (F50) ──────────────────────────────────────────────────────────────────────────────────────
    const ping = refusal === null ? await this.bucket.ping() : { ok: true as const };
    if (!ping.ok) refuse('unavailable', `${ping.reason} — no request goes out without its rate`);
    // ── robots, per endpoint, only for a run nothing else refused (F52) ─────────────────────────────────────────────────────────────
    const robotsMap = new Map<string, RobotsGroup[]>();
    for (const r of inputs.robots) robotsMap.set(r.origin, Array.isArray(r.rules) ? r.rules : []);
    const robotsRecord: Row = { mode: policy.robots.mode };
    if (policy.robots.mode === 'not_applicable') {
      robotsRecord['verdict'] = 'not_applicable';
      robotsRecord['reason'] = `not applicable — the contract says why: ${policy.robots.reason ?? ''}`;
    } else if (refusal === null) {
      const endpoints: Row[] = [];
      for (const endpoint of ctx.contract.endpoints) {
        const origin = originOf(endpoint);
        let groups = robotsMap.get(origin);
        let source = 'cache';
        if (groups === undefined) {
          const got = await this.robots.fetch(run, origin, { mode: ctx.contract.acquisition_mode, replaySet: replaySetOf(ctx), endpoints: ctx.contract.endpoints });
          if (got.outcome === 'unavailable') { refuse('unavailable', got.reason); endpoints.push({ endpoint, origin, verdict: 'unavailable', reason: got.reason }); break; }
          groups = got.groups; robotsMap.set(origin, groups); source = got.outcome;
        }
        const v = robotsVerdict(groups, endpoint);
        endpoints.push({ origin, path: v.path, allowed: v.allowed, group: v.group, matched: v.matched, from: source });
        if (!v.allowed) refuse('robots_disallowed', `robots.txt of ${origin} disallows ${v.path} (${v.matched ?? ''}) for ${v.group === '*' ? 'every agent' : v.group}`);
      }
      robotsRecord['verdict'] = refusal === null ? 'allowed' : (refusal as { cls: string }).cls === 'robots_disallowed' ? 'disallowed' : 'not_evaluated';
      robotsRecord['endpoints'] = endpoints;
    } else {
      robotsRecord['verdict'] = 'not_evaluated';
      robotsRecord['reason'] = 'not fetched: the run was refused before any request';
    }

    const decided = refusal as { cls: AuthorizeRefusalClass; reason: string } | null;
    const reason = decided === null
      ? `authorized: rights ${c.rights_state}${inputs.terms === null ? '' : ` + terms v${inputs.terms.version} ${inputs.terms.state}`}; ${licence.reason}; ${residency?.reason ?? ''}; ${window.reason}; rate ${policy.rate.requests} per ${policy.rate.per_seconds} s (burst ${policy.rate.burst})`
      : decided.reason;
    const record: Row = {
      rights: { contract_rights_state: c.rights_state, lifecycle_state: c.lifecycle_state, acquisition_mode: c.acquisition_mode, effective_to: c.effective_to,
                terms: inputs.terms === null ? null : { terms_id: inputs.terms.terms_id, version: inputs.terms.version, state: inputs.terms.state, expires_at: inputs.terms.expires_at },
                verdict: rightsOk && c.lifecycle_state === 'active' ? 'in_force' : 'refused' },
      licence: { ok: licence.ok, class: licence.class, reason: licence.reason, use_purposes: licence.usePurposes, acquisition_purpose: ctx.purposeId, contract_licence: c.licence },
      credential_ref: c.credential_ref,
      rate: { ...policy.rate, bucket: ping.ok ? 'reachable' : 'unavailable' },
      residency: residency === null ? { verdict: 'unavailable' } : { ...residency, profile_of: inputs.residency.profile_of },
      window: { ...window, declared: policy.window },
      robots: robotsRecord,
      backoff: { declared: policy.backoff, hold: inputs.hold },
    };
    let authorizationId: string | null = null;
    try {
      authorizationId = await this.store.recordAuthorization(run, { form: ctx.form, purposeId: ctx.purposeId, decision: decided === null ? 'proceed' : 'refuse',
        refusalClass: decided === null ? null : decided.cls, reason, record });
    } catch (e) {
      this.log.warn(`run ${ctx.runId}: the acquisition authorization could not be recorded: ${(e as Error).message.slice(0, 200)}`);
      // a run that cannot cite its authorization does not go out (fail closed)
      return { kind: 'refuse', reasonClass: 'unavailable', authorizationId: null,
        reason: `the acquisition authorization could not be recorded (${(e as Error).message.slice(0, 160)}); nothing was requested` };
    }
    if (decided !== null) return { kind: 'refuse', reasonClass: decided.cls, reason: decided.reason, authorizationId };
    this.runs.set(ctx.runId, { authorizationId, policy, robots: robotsMap, residency, mode: ctx.contract.acquisition_mode, replaySet: replaySetOf(ctx), endpoints: ctx.contract.endpoints });
    return { kind: 'proceed', authorizationId };
  }
}
