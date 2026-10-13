/**
 * B94 §ON (0114_b94_x_on) — THE ONBOARDING PROGRAMME AND THE CONFIGURATION BASELINE MANAGER (V01-T-033's managed configurations; PR-67-001,
 * PR-67-002 [programme, responsibility pointer, baseline], CAP-DL-04/-05, PER-21, JRN-01; UX-66-001/-002, CAP-PD-04/-05).
 *
 *   the programme (TENANT): open → planned · revise · hold / resume · withdraw — every change a new version with its digest; it leaves
 *     `planned` only with the customer sponsor's recorded intent; the sponsor intent is the sponsor's OWN record (never a lead, never an agent);
 *   the steps (JRN-01 + JRN-23): planned → in_progress → done (the realizing record VALIDATED, the compensating act named) | held → reverted
 *     (the compensating act RECORDED by reference, never performed here);
 *   the draft domain: tenancy.create_domain_draft (a tenant administrator, through the programme) — `draft`; activation is §MG's;
 *   the baselines (DOMAIN): capture / promote (the lead) → propose (the lead) → decide (THE ONBOARDING AUTHORITY, on the digest, SIGNED in the
 *     same write — subject kind config_baseline); drift = observed vs approved, recorded only on change by the after-tick hook
 *     `onboarding-drift` (its READ first, its write after — B33-H); the rollback plan is a read.
 *
 * Every rule is a port's; a refusal is the port's text in the class form `<noun> rejected (<class>): …`. THREE CLAIMS: this is CONSTRUCTION;
 * an approval by a SYNTHETIC persona in the act is DEMONSTRATED OPERATION; real customer acceptance is R2.
 */
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { AttentionTickRegistry } from '../../executive/attention/tick.js';
import { SignatureService, type SignatureSubjectKind } from '../../executive/signatures/signature.service.js';
import { BOUNDARY, domainRoute, governedRead, governedWrite, receipt, refuseDelivery, tenantRoute } from '../seams.js';
import { OnboardingCapability, type OnboardingReads, type OnboardingWrites } from './onboarding.capabilities.js';
import { rollbackPlan, STEP_DEFAULTS, STEP_KEYS, type DriftChange } from './rollback.js';
import { replayProgramme } from './replay.js';

type Row = Record<string, unknown>;
export const READ = 'onboarding.read';
export const DRIFT_HOOK = 'onboarding-drift';
/* The prelude's signature subject kind (0114 §0.3); SignatureService's TS union predates it — the port's CHECK is the authority. */
const CONFIG_BASELINE = 'config_baseline' as unknown as SignatureSubjectKind;
const textOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

@Injectable()
export class OnboardingService implements OnModuleInit {
  private readonly log = new Logger('delivery.onboarding');
  /** the signer is stateless (the key by reference from the environment) — held privately so the module needs no executive import */
  private readonly signatures = new SignatureService();
  /** one drift re-check in flight per domain (a tick never starts a second) */
  private readonly inFlight = new Map<string, Promise<Row>>();
  constructor(private readonly moduleRef: ModuleRef, private readonly pipeline: PipelineService) {}

  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: configuration drift is not re-checked after the tick'); return; }
    registry.registerAfter({ name: DRIFT_HOOK, run: async (a) => this.afterTick(a) });
  }

  // ───────────────────────── the idiom ─────────────────────────
  private tRead<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, objectId: string | null, fn: (c: OnboardingReads) => Promise<T>) {
    return governedRead(this.pipeline, env, p, tenantRoute(t, READ, 'OBP', objectId), OnboardingCapability.read, fn);
  }
  private dRead<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, objectId: string | null, fn: (c: OnboardingReads) => Promise<T>) {
    return governedRead(this.pipeline, env, p, domainRoute(t, d, READ, 'OCB', objectId), OnboardingCapability.read, fn);
  }
  private tWrite<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, action: string, type: string, objectId: string | null, fn: (c: OnboardingWrites) => Promise<T>) {
    return governedWrite(this.pipeline, env, p, tenantRoute(t, action, type, objectId), OnboardingCapability.write, async (c) => ({ result: await fn(c) }));
  }
  private dWrite<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, objectId: string | null, fn: (c: OnboardingWrites) => Promise<T>) {
    return governedWrite(this.pipeline, env, p, domainRoute(t, d, action, 'OCB', objectId), OnboardingCapability.write, async (c) => ({ result: await fn(c) }));
  }
  /** A server-side envelope (the hook): never client-supplied. */
  envelopeFor(principal: AuthenticatedPrincipal, tenantId: string, domainId: string, action: string, correlationId: string): Envelope {
    return {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${principal.principalId}`, purpose_id: 'onboarding', action,
      side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C1', object_type: 'OCB', object_id: null,
      schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: correlationId, trace_id: 'onboarding-drift',
    } as unknown as Envelope;
  }

  // ───────────────────────── reads (the workspace: CAP-DL-04, UX-66-001/-002) ─────────────────────────
  async list(env: Envelope, p: AuthenticatedPrincipal, t: string) {
    const out = await this.tRead(env, p, t, null, async (c) => ({ programmes: await c.programmes(), read_at: await c.now() }));
    return { ...out.result, step_keys: STEP_KEYS, step_defaults: STEP_DEFAULTS, boundary: BOUNDARY, receipt: receipt(out) };
  }

  /** One programme as the workspace shows it, STATUS FIRST (UX-66-001): the current version and its held reasons, the step graph, then the
   *  sponsor intent, then the target domain (draft / active), its baselines, drift and rollback plan, then the versions and the ledger. */
  async detail(env: Envelope, p: AuthenticatedPrincipal, t: string, programmeId: string) {
    const out = await this.tRead(env, p, t, programmeId, async (c) => {
      const versions = await c.programmeVersions(programmeId);
      if (versions.length === 0) return null;
      const current = versions[0]!;
      const steps = await c.steps(programmeId);
      const intents = await c.intents(programmeId);
      const target = current['target_domain_id'] === null ? null : String(current['target_domain_id']);
      let domain: Row | null = null; let baselines: Row[] = []; let drift: Row | null = null; let driftEvents: Row[] = []; let items: Row[] = [];
      if (target !== null) {
        domain = { ...(await c.domain(target) ?? { id: target }), lifecycle: await c.lifecycle(target) };
        baselines = await c.baselines(target);
        drift = await c.drift(t, target);
        driftEvents = await c.driftEvents(target, 50);
        items = await c.items(baselines.length === 0 ? [] : [String(baselines[0]!['baseline_id'])]);
      }
      const ledger = await c.ledger([programmeId, ...steps.map((s) => String(s['step_id'])), ...intents.map((i) => String(i['intent_id'])), ...(target === null ? [] : [target])], 1000);
      return { programme: current, versions, steps, intent: intents[0] ?? null, intents, domain, baselines, drift, rollback_plan: drift === null ? [] : rollbackPlan((drift['changes'] ?? []) as DriftChange[]),
               drift_events: driftEvents, items, ledger, read_at: await c.now() };
    });
    if (out.result === null) throw refuseDelivery('onboarding programme', 'unknown_programme', `${programmeId} is not an onboarding programme of this tenant`, env.correlation_id, 404);
    return { ...out.result, step_defaults: STEP_DEFAULTS, boundary: BOUNDARY, receipt: receipt(out) };
  }

  /** THE REPLAY: the ledger folded into the version chain, compared with the stored versions. */
  async history(env: Envelope, p: AuthenticatedPrincipal, t: string, programmeId: string) {
    const out = await this.tRead(env, p, t, programmeId, async (c) => ({ versions: await c.programmeVersions(programmeId), ledger: await c.ledger([programmeId], 2000), read_at: await c.now() }));
    if (out.result.versions.length === 0) throw refuseDelivery('onboarding programme', 'unknown_programme', `${programmeId} is not an onboarding programme of this tenant`, env.correlation_id, 404);
    return { replay: replayProgramme(out.result.ledger, out.result.versions), ledger: out.result.ledger, read_at: out.result.read_at, receipt: receipt(out) };
  }

  /** The baseline manager of one domain (DOMAIN read): every version with its signatures, the observed pointers, the drift, the rollback plan,
   *  the drift observations and the open drift items. */
  async baselines(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.dRead(env, p, t, d, null, async (c) => {
      const baselines = await c.baselines(d);
      const drift = await c.drift(t, d);
      return { domain: await c.domain(d), baselines, drift, rollback_plan: rollbackPlan((drift['changes'] ?? []) as DriftChange[]), drift_events: await c.driftEvents(d, 100),
               items: await c.items(baselines.length === 0 ? [] : [String(baselines[0]!['baseline_id'])]),
               ledger: await c.ledger(baselines.length === 0 ? [] : [String(baselines[0]!['baseline_id'])], 500), read_at: await c.now() };
    });
    return { ...out.result, boundary: BOUNDARY, receipt: receipt(out) };
  }

  // ───────────────────────── the programme (TENANT writes) ─────────────────────────
  async open(env: Envelope, p: AuthenticatedPrincipal, t: string, b: { key: string; title: string; profile: string | null; plan: Row | null; owner: string | null }) {
    const programmeId = newId();
    const out = await this.tWrite(env, p, t, 'onboarding.programme.open', 'OBP', programmeId, (c) => c.open({ programmeId, tenantId: t, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { programme: out.result, receipt: receipt(out) };
  }
  async revise(env: Envelope, p: AuthenticatedPrincipal, t: string, programmeId: string, b: { expectedVersion: number; title: string | null; plan: Row | null; profile: string | null; reason: string }) {
    const out = await this.tWrite(env, p, t, 'onboarding.programme.revise', 'OBP', programmeId, (c) => c.revise({ programmeId, tenantId: t, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { programme: out.result, receipt: receipt(out) };
  }
  async transition(env: Envelope, p: AuthenticatedPrincipal, t: string, programmeId: string, act: 'hold' | 'resume' | 'withdraw', b: { expectedVersion: number; reason: string }) {
    const out = await this.tWrite(env, p, t, `onboarding.programme.${act}`, 'OBP', programmeId, (c) => c[act]({ programmeId, tenantId: t, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { programme: out.result, receipt: receipt(out) };
  }
  async recordIntent(env: Envelope, p: AuthenticatedPrincipal, t: string, programmeId: string,
                     b: { expectedVersion: number; objectives: string[]; scopeStatement: string; successMeasures: string[]; constraints: string[]; targetDomainName: string; deploymentProfile: string }) {
    const out = await this.tWrite(env, p, t, 'onboarding.intent.record', 'OSI', programmeId, (c) => c.recordIntent({ tenantId: t, programmeId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { intent: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the steps ─────────────────────────
  async planStep(env: Envelope, p: AuthenticatedPrincipal, t: string, programmeId: string, b: { stepKey: string; compensation: Row | null }) {
    const stepId = newId();
    const out = await this.tWrite(env, p, t, 'onboarding.step.plan', 'OST', stepId, (c) => c.planStep({ stepId, tenantId: t, programmeId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { step: out.result, receipt: receipt(out) };
  }
  async recordStep(env: Envelope, p: AuthenticatedPrincipal, t: string, stepId: string, b: { expectedVersion: number; state: string; realizedBy: Row | null; evidence: Row[] | null; compensation: Row | null }) {
    const out = await this.tWrite(env, p, t, 'onboarding.step.record', 'OST', stepId, (c) => c.recordStep({ stepId, tenantId: t, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { step: out.result, receipt: receipt(out) };
  }
  async holdStep(env: Envelope, p: AuthenticatedPrincipal, t: string, stepId: string, b: { expectedVersion: number; reason: string }) {
    const out = await this.tWrite(env, p, t, 'onboarding.step.hold', 'OST', stepId, (c) => c.holdStep({ stepId, tenantId: t, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { step: out.result, receipt: receipt(out) };
  }
  async revertStep(env: Envelope, p: AuthenticatedPrincipal, t: string, stepId: string, b: { expectedVersion: number; compensating: Row; reason: string }) {
    const out = await this.tWrite(env, p, t, 'onboarding.step.revert', 'OST', stepId, (c) => c.revertStep({ stepId, tenantId: t, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { step: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── the draft domain (D4) ─────────────────────────
  /** A tenant administrator creates the programme's target domain DRAFT (tenancy.domain.draft; the bound target is the new domain's id). */
  async draftDomain(env: Envelope, p: AuthenticatedPrincipal, t: string, programmeId: string, name: string) {
    const domainId = newId();
    const out = await this.tWrite(env, p, t, 'tenancy.domain.draft', 'CID', domainId, (c) => c.draftDomain({ domainId, tenantId: t, name, programmeId, correlationId: env.correlation_id }));
    return { ...(out.result as Row), receipt: receipt(out) };
  }

  // ───────────────────────── the baselines (DOMAIN writes) ─────────────────────────
  async capture(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, programmeId: string | null) {
    const baselineId = newId();
    const out = await this.dWrite(env, p, t, d, 'onboarding.baseline.capture', baselineId, (c) => c.capture({ baselineId, tenantId: t, domainId: d, programmeId, actor: p.principalId, correlationId: env.correlation_id }));
    return { baseline: out.result, receipt: receipt(out) };
  }
  async promote(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.dWrite(env, p, t, d, 'onboarding.baseline.promote', null, (c) => c.promote({ tenantId: t, domainId: d, actor: p.principalId, correlationId: env.correlation_id }));
    return { baseline: out.result, receipt: receipt(out) };
  }
  async propose(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, baselineId: string, version: number, digest: string) {
    const out = await this.dWrite(env, p, t, d, 'onboarding.baseline.propose', baselineId, (c) => c.propose({ baselineId, tenantId: t, domainId: d, version, digest, actor: p.principalId, correlationId: env.correlation_id }));
    return { baseline: out.result, receipt: receipt(out) };
  }
  /** DECIDE: an approval is SIGNED by the approver over the version's digest, in the same write, under this action; the port verifies the
   *  signature row and re-checks the approver (assert_approver), the state and the digest. A rejection is not signed. */
  async decide(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, baselineId: string, b: { version: number; decision: 'approve' | 'reject'; digest: string; reason: string }) {
    const action = 'onboarding.baseline.decide';
    const out = await this.dWrite(env, p, t, d, action, baselineId, async (c) => {
      let signatureId: string | null = null; let signature: Row | null = null;
      if (b.decision === 'approve') {
        signature = await this.signatures.sign(c, { tenantId: t, domainId: d, action, kind: CONFIG_BASELINE, subjectId: baselineId, subjectVersion: b.version, subjectDigest: b.digest,
                                                     actor: p.principalId, correlationId: env.correlation_id });
        signatureId = String(signature['signature_id']);
      }
      const r = await c.decide({ baselineId, tenantId: t, domainId: d, ...b, signatureId, actor: p.principalId, correlationId: env.correlation_id });
      return { ...r, signature };
    });
    return { baseline: out.result, receipt: receipt(out) };
  }
  /** VERIFY a baseline version's signatures against the bound key (offline verification of the approval). */
  verifySignature(row: { key_id: string; signature: string; subject_digest: string }): boolean { return this.signatures.verify(row); }

  /** RECORD DRIFT: the drift READ first (its own audited read), then the write naming the observed digest it read (moved → 409 stale). */
  async recordDrift(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const read = await this.dRead({ ...env, action: READ } as Envelope, p, t, d, null, (c) => c.drift(t, d));
    const drift = read.result;
    if (drift['state'] === 'no_baseline') return { drift: { recorded: false, state: 'no_baseline', reason: drift['reason'] }, receipt: receipt(read) };
    const eventId = newId();
    const out = await this.dWrite(env, p, t, d, 'onboarding.baseline.drift', eventId, (c) => c.recordDrift({ eventId, tenantId: t, domainId: d, observedDigest: String(drift['observed_digest']), actor: p.principalId, correlationId: env.correlation_id }));
    return { drift: out.result, rollback_plan: rollbackPlan((drift['changes'] ?? []) as DriftChange[]), receipt: receipt(out) };
  }

  /** The after-tick hook `onboarding-drift`: the domain's drift re-checked under the attention agent's session (read first, write after); one
   *  in flight per domain; a domain without an approved baseline is skipped (drift is never inferred). */
  async afterTick(a: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string; correlationId: string }): Promise<Row> {
    const key = `${a.tenantId}:${a.domainId}`;
    if (this.inFlight.has(key)) return { skipped: 'a drift re-check of this domain is in flight' };
    const run = (async (): Promise<Row> => {
      try {
        const r = await this.recordDrift(this.envelopeFor(a.principal, a.tenantId, a.domainId, 'onboarding.baseline.drift', a.correlationId), a.principal, a.tenantId, a.domainId);
        return r.drift as Row;
      } catch (e) { return { error: textOf(e).slice(0, 500) }; }
    })().finally(() => { this.inFlight.delete(key); });
    this.inFlight.set(key, run);
    return run;
  }
}
