/**
 * B94 §SV (0114_b94_x_sv) — THE SERVICE PORTAL'S SERVICE (F-P7-F-06: PR-69-001/002/005/006, CAP-DL-09/10, AT-69; carryover a: premium
 * support routing). The orchestration the ports do not do:
 *
 *   · every read is an audited consequential read (`service.read`, or the engineer's `service.case.support_read`); every act a governed
 *     write under its own action. A support engineer's act without a live grant is REFUSED AND LOGGED: the port logs the attempt and
 *     ANSWERS the refusal (it never raises it), the write commits (its audit row marked failure), and the route answers 403 after the
 *     commit — the access log keeps every attempt (PR-69-003's audit trail, read by §SA's control center).
 *   · the SLA timers (`sla.response`, `sla.resolution`) are fired by the B34 timer step of the attention tick: this service registers their
 *     handler on the WorkflowTimerRegistry (moduleRef, never an import of the executive module); a breach is escalated BY SEVERITY.
 *   · the after-tick hook `service-sla` (D14): its READ first (consequentialRead, service.read — what is past due and not recorded), then its
 *     write (service.sla.sweep) only when there is something to record — never one long statement past a context (B33-H).
 *   · the customer-success read model and the value review: the model is READ FIRST, then the review's write carries the inputs and their
 *     digest (the port re-checks the digest and reads the value status itself).
 *
 * THREE CLAIMS: construction (this code and its harness), demonstrated operation (the act on SYNTHETIC records), real customer acceptance
 * (AT-69 / PR-69-006 and joint value-review acceptance — R2, never claimed).
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { errorBody, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { AttentionTickRegistry } from '../../executive/attention/tick.js';
import { WorkflowTimerRegistry } from '../../executive/workflow/timers.js';
import { BOUNDARY, derive, domainRoute, receipt, refuseDelivery, type DeliveryNoun } from '../seams.js';
import { ServiceCapability, fireSlaTimer, type ServiceReads, type ServiceWrites } from './service.capabilities.js';
import { assembleSuccess, slaStatus } from './sla.js';

type Row = Record<string, unknown>;
export const SLA_HOOK = 'service-sla';
export const READ = 'service.read';
const textOf = (e: unknown): string => (e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : (e instanceof Error ? e.message : String(e)));

@Injectable()
export class ServicePortalService implements OnModuleInit {
  private readonly log = new Logger('delivery.service');
  constructor(private readonly moduleRef: ModuleRef, private readonly pipeline: PipelineService) {}

  onModuleInit(): void {
    let timers: WorkflowTimerRegistry | null = null;
    try { timers = this.moduleRef.get(WorkflowTimerRegistry, { strict: false }); } catch { timers = null; }
    if (timers === null) this.log.warn('no workflow timer registry in this application: SLA timers are not fired here');
    else {
      for (const kind of ['sla.response', 'sla.resolution']) {
        timers.register({ kind, handle: async (c, t) => fireSlaTimer(c.tx, { timerId: t.timer_id, tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId }) });
      }
    }
    let ticks: AttentionTickRegistry | null = null;
    try { ticks = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { ticks = null; }
    if (ticks === null) { this.log.warn('no attention tick registry in this application: the SLA sweep does not run after the tick'); return; }
    ticks.registerAfter({ name: SLA_HOOK, run: async (a) => this.afterTick(a) });
  }

  // ───────────────────────── the pipeline idiom ─────────────────────────
  private read<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, objectType: string | null, objectId: string | null, fn: (cap: ServiceReads) => Promise<T>) {
    return this.pipeline.consequentialRead(derive(env, READ, objectType, objectId), p, domainRoute(t, d, READ, objectType, objectId), ServiceCapability.read, async (cap) => fn(cap));
  }
  /** A governed write; a port's ANSWERED refusal ({refused: {status, message}}) commits (its log row with it), is audited as a failure and
   *  is thrown after the commit in the port's own words. */
  private async write(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, objectType: string, objectId: string | null, fn: (cap: ServiceWrites) => Promise<Row>) {
    const out = await this.pipeline.write(derive(env, action, objectType, objectId), p, domainRoute(t, d, action, objectType, objectId), ServiceCapability.write, async (cap) => {
      const result = await fn(cap);
      const refused = result['refused'] as { status?: number; message?: string } | undefined;
      return {
        result, targetType: objectType, targetId: objectId, targetVersion: null, outboxEvent: null,
        ...(refused === undefined ? {} : { evidence: { outcome: 'failure' as const, resultCode: 'EYE_AUT_001', metadata: { refusal: String(refused.message ?? 'refused'), logged: true } } }),
      };
    });
    const refused = out.result['refused'] as { status?: number; message?: string } | undefined;
    if (refused !== undefined) {
      const status = Number(refused.status ?? 403);
      throw new HttpException(errorBody(status === 403 ? 'EYE_AUT_001' : 'EYE_REQ_001', env.correlation_id, String(refused.message ?? 'refused')), status);
    }
    return { result: out.result, receipt: receipt(out) };
  }
  /** A server-side envelope (the hook): never client-supplied. */
  envelopeFor(principal: AuthenticatedPrincipal, tenantId: string, domainId: string, action: string, correlationId: string): Envelope {
    return {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${principal.principalId}`, purpose_id: 'service', action,
      side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C1', object_type: 'service_case', object_id: null,
      schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: correlationId, trace_id: 'service-sla',
    } as unknown as Envelope;
  }

  // ───────────────────────── reads ─────────────────────────
  async listCases(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, state: string | null) {
    const out = await this.read(env, p, t, d, 'service_case', null, async (cap) => {
      const now = await cap.now();
      const cases = (await cap.cases({ state, limit: 200 })).map((c) => ({ ...c, sla: slaStatus(c, now, c['first_grant_at'] === null ? null : new Date(String(c['first_grant_at'])).toISOString()) }));
      return { cases, breaches: await cap.breaches(null, 50), commitments: await cap.commitments(null), policies: await cap.policies(), routing: await cap.routingPreview(t, d), read_at: now };
    });
    return { ...out.result, boundary: BOUNDARY, receipt: receipt(out) };
  }

  async caseDetail(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string) {
    const out = await this.read(env, p, t, d, 'service_case', caseId, async (cap) => {
      const c = await cap.caseRow(caseId);
      if (c === null) return null;
      const now = await cap.now();
      const commitments = await cap.commitments(caseId);
      const bundles = await cap.bundles(caseId);
      return {
        case: c, sla: slaStatus(c, now, await cap.firstGrantAt(caseId)), notes: await cap.notes(caseId), bundles, commitments, breaches: await cap.breaches(caseId, 100),
        drills: await cap.drills(caseId), timers: await cap.timers(caseId), tasks: await cap.tasks(caseId), items: await cap.items(caseId), grants: await cap.grants(caseId),
        access_log: await cap.accessLog(caseId, 200), ledger: await cap.ledger([caseId, ...commitments.map((m) => String(m['commitment_id']))], 500), read_at: now,
      };
    });
    if (out.result === null) throw refuseDelivery('service case', 'unknown_case', `${caseId} is not a case of this domain`, env.correlation_id, 404);
    return { ...out.result, boundary: BOUNDARY, receipt: receipt(out) };
  }

  async problems(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.read(env, p, t, d, 'service_problem', null, async (cap) => {
      const problems = await cap.problems();
      return { problems, links: await cap.problemCases(), known_errors: await cap.knownErrors(), known_error_uses: await cap.knownErrorUses(), changes: await cap.changes(),
               ledger: await cap.ledger(problems.map((x) => String(x['problem_id'])), 500), read_at: await cap.now() };
    });
    return { ...out.result, receipt: receipt(out) };
  }

  async policies(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.read(env, p, t, d, 'service_case', null, async (cap) => ({ policies: await cap.policies(), routing: await cap.routingPreview(t, d), read_at: await cap.now() }));
    return { ...out.result, governance: 'premium support changes objectives and named support only — never an approval, a grant or a gate; opening a case is never licence-gated', receipt: receipt(out) };
  }

  /** THE CUSTOMER-SUCCESS READ MODEL (CAP-DL-10). */
  async success(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.read(env, p, t, d, 'value_review', null, async (cap) => this.successInputs(cap, t, d));
    return { success: assembleSuccess(out.result), inputs_digest: out.result.digest, inputs: out.result.inputs, receipt: receipt(out) };
  }
  private async successInputs(cap: ServiceReads, t: string, d: string) {
    const now = await cap.now();
    const routing = await cap.routingPreview(t, d);
    const parts = {
      health: await cap.health(), adoption: await cap.metricResults('ADP-', []), outcomes: await cap.metricResults(null, ['ADP-', 'MET-040']), value: await cap.valueStatus(t, d),
      licence: await cap.entitlement(t), routing: (routing['S2'] as Row | undefined) ?? null, cases: await cap.cases({ state: null, limit: 500 }), breaches: await cap.breaches(null, 500),
      commitments: await cap.commitments(null), reviews: await cap.valueReviews(), read_at: now,
    };
    // the INPUTS a value review rests on (a compact, digestable view; the port re-checks the digest over exactly this object)
    const inputs: Row = {
      health: parts.health.map((h) => ({ definition_id: h['definition_id'], version: h['definition_version'], status: h['status'], aggregate: h['aggregate'], coverage: h['coverage'], computed_at: iso(h['computed_at']) })),
      adoption: parts.adoption.map((a) => ({ metric_key: a['metric_key'], version: a['version'], state: a['state'] ?? 'not computed', value: a['value'] ?? null, n: a['n'] ?? null })),
      outcomes: parts.outcomes.map((a) => ({ metric_key: a['metric_key'], version: a['version'], state: a['state'] ?? 'not computed', value: a['value'] ?? null })),
      value: parts.value,
      licence: { state: parts.licence?.['state'] ?? null, licence: ((parts.licence?.['licence'] as Row | null) ?? null) === null ? null
        : { version: (parts.licence?.['licence'] as Row)['version'], state: (parts.licence?.['licence'] as Row)['state'], effective_to: iso((parts.licence?.['licence'] as Row)['effective_to']) } },
      cases: { open: parts.cases.filter((c) => c['state'] !== 'closed').length, closed: parts.cases.filter((c) => c['state'] === 'closed').length,
               breaches: parts.breaches.filter((b) => b['drill'] !== true).length, routing_tier: parts.routing?.['tier'] ?? null },
    };
    return { ...parts, inputs, digest: await cap.digest(inputs) };
  }

  // ───────────────────────── the case acts ─────────────────────────
  async open(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { title: string; severity: string; capability: string; objects: Row[]; description: string }) {
    const caseId = newId();
    const r = await this.write(env, p, t, d, 'service.case.open', 'service_case', caseId, async (cap) => cap.openCase({ caseId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async triage(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string, b: { expectedVersion: number; severity: string | null; note: string }) {
    const r = await this.write(env, p, t, d, 'service.case.triage', 'service_case', caseId, async (cap) => cap.triage({ caseId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async note(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string, b: { kind: string; body: string }) {
    const r = await this.write(env, p, t, d, 'service.case.note', 'service_case', caseId, async (cap) => cap.note({ noteId: newId(), caseId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async progress(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string, b: { expectedVersion: number; to: string; statement: string }) {
    const r = await this.write(env, p, t, d, 'service.case.progress', 'service_case', caseId, async (cap) => cap.progress({ caseId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async proposeWorkaround(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string, b: { expectedVersion: number; steps: string; act: Row; risk: string | null }) {
    const r = await this.write(env, p, t, d, 'service.case.workaround.propose', 'service_case', caseId, async (cap) => cap.proposeWorkaround({ caseId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async executeWorkaround(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string, b: { expectedVersion: number; policyDecisionId: string; note: string | null }) {
    const r = await this.write(env, p, t, d, 'service.case.workaround.execute', 'service_case', caseId, async (cap) => cap.executeWorkaround({ caseId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async reuseKnownError(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string, b: { expectedVersion: number; knownErrorId: string }) {
    const r = await this.write(env, p, t, d, 'service.case.known_error.reuse', 'service_case', caseId, async (cap) => cap.reuseKnownError({ caseId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async bundle(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string) {
    const r = await this.write(env, p, t, d, 'service.case.bundle', 'service_case', caseId, async (cap) => cap.assembleBundle({ bundleId: newId(), caseId, tenantId: t, domainId: d, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async close(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string, b: { expectedVersion: number; outcome: string; note: string }) {
    const r = await this.write(env, p, t, d, 'service.case.close', 'service_case', caseId, async (cap) => cap.confirmClosure({ caseId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async reopen(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string, b: { expectedVersion: number; regression: string }) {
    const r = await this.write(env, p, t, d, 'service.case.reopen', 'service_case', caseId, async (cap) => cap.reopen({ caseId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  /** The engineer's case read: a consequential read under service.case.support_read whose port logs (and answers a refusal, committed). */
  async supportRead(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string) {
    const action = 'service.case.support_read';
    const out = await this.pipeline.consequentialRead(derive(env, action, 'service_case', caseId), p, domainRoute(t, d, action, 'service_case', caseId), ServiceCapability.write,
      async (cap) => cap.supportRead({ caseId, tenantId: t, domainId: d, actor: p.principalId, correlationId: env.correlation_id }));
    const refused = out.result['refused'] as { status?: number; message?: string } | undefined;
    if (refused !== undefined) throw new HttpException(errorBody('EYE_AUT_001', env.correlation_id, String(refused.message ?? 'refused')), Number(refused.status ?? 403));
    return { ...out.result, receipt: receipt(out) };
  }

  // ───────────────────────── commitments, drill ─────────────────────────
  async recordCommitment(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string, b: { kind: string; statement: string; dueAt: string }) {
    const commitmentId = newId();
    const r = await this.write(env, p, t, d, 'service.commitment.record', 'service_commitment', commitmentId, async (cap) => cap.recordCommitment({ commitmentId, caseId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async settleCommitment(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, commitmentId: string, b: { outcome: string; note: string }) {
    const r = await this.write(env, p, t, d, 'service.commitment.settle', 'service_commitment', commitmentId, async (cap) => cap.settleCommitment({ commitmentId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async drill(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string, b: { objective: string; reason: string }) {
    const r = await this.write(env, p, t, d, 'service.sla.drill', 'service_case', caseId, async (cap) => cap.drill({ drillId: newId(), caseId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }

  // ───────────────────────── problems, known errors, changes ─────────────────────────
  async openProblem(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { title: string; statement: string; cases: string[] }) {
    const problemId = newId();
    const r = await this.write(env, p, t, d, 'service.problem.open', 'service_problem', problemId, async (cap) => cap.openProblem({ problemId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async linkProblem(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, problemId: string, b: { caseId: string; reason: string }) {
    const r = await this.write(env, p, t, d, 'service.problem.link', 'service_problem', problemId, async (cap) => cap.linkProblem({ problemId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async publishKnownError(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, problemId: string, b: { title: string; symptom: string; workaround: string; act: Row }) {
    const knownErrorId = newId();
    const r = await this.write(env, p, t, d, 'service.problem.known_error', 'known_error', knownErrorId, async (cap) => cap.publishKnownError({ knownErrorId, problemId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async closeProblem(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, problemId: string, b: { outcome: string; rootCause: string | null; reason: string }) {
    const r = await this.write(env, p, t, d, 'service.problem.close', 'service_problem', problemId, async (cap) => cap.closeProblem({ problemId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async proposeChange(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { problemId: string; title: string; description: string; effect: string }) {
    const changeId = newId();
    const r = await this.write(env, p, t, d, 'service.change.propose', 'service_change', changeId, async (cap) => cap.proposeChange({ changeId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async decideChange(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, changeId: string, b: { expectedVersion: number | null; decision: string; reason: string }) {
    const r = await this.write(env, p, t, d, 'service.change.decide', 'service_change', changeId, async (cap) => cap.decideChange({ changeId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }
  async recordChange(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, changeId: string, b: { outcome: string; evidence: string }) {
    const r = await this.write(env, p, t, d, 'service.change.record', 'service_change', changeId, async (cap) => cap.recordChange({ changeId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }

  // ───────────────────────── the value review ─────────────────────────
  /** RECORD: the customer-success model READ FIRST (its own audited read), then the write carrying those inputs and the digest of the view
   *  the recorder SAW (inputs_digest of the success read); the port recomputes the inputs' digest and refuses (stale) when they differ. */
  async recordValueReview(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { from: string; to: string; outcomes: string; inputsDigest: string }) {
    const read = await this.read(env, p, t, d, 'value_review', null, async (cap) => this.successInputs(cap, t, d));
    const inputs = read.result.inputs;
    const reviewId = newId();
    // the inputs read NOW, and the digest of the view the recorder SAW: the port refuses (stale) when they differ
    const r = await this.write(env, p, t, d, 'service.value_review.record', 'value_review', reviewId, async (cap) =>
      cap.recordValueReview({ reviewId, tenantId: t, domainId: d, from: b.from, to: b.to, inputs, inputsDigest: b.inputsDigest, outcomes: b.outcomes, actor: p.principalId, correlationId: env.correlation_id }));
    return { ...answer(r), read_receipt: receipt(read) };
  }
  async decideValueReview(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, reviewId: string, b: { digest: string; decision: string; note: string }) {
    const r = await this.write(env, p, t, d, 'service.value_review.acknowledge', 'value_review', reviewId, async (cap) => cap.decideValueReview({ reviewId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return answer(r);
  }

  // ───────────────────────── the after-tick hook `service-sla` ─────────────────────────
  async afterTick(a: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string; correlationId: string }): Promise<Row> {
    try {
      const env = this.envelopeFor(a.principal, a.tenantId, a.domainId, READ, a.correlationId);
      const found = await this.read(env, a.principal, a.tenantId, a.domainId, 'service_case', null, async (cap) => cap.sweepCandidates(a.tenantId, a.domainId));
      const n = found.result.commitments.length + found.result.objectives.length;
      if (n === 0) return { swept: 0, note: 'nothing past due and unrecorded' };
      const wenv = this.envelopeFor(a.principal, a.tenantId, a.domainId, 'service.sla.sweep', a.correlationId);
      const r = await this.write(wenv, a.principal, a.tenantId, a.domainId, 'service.sla.sweep', 'service_case', null,
        async (cap) => cap.sweep({ tenantId: a.tenantId, domainId: a.domainId, actor: a.principal.principalId, correlationId: a.correlationId }));
      return { swept: Number(r.result['count'] ?? 0), breaches: r.result['breaches'], receipt: r.receipt };
    } catch (e) {
      return { error: textOf(e).slice(0, 500) };
    }
  }
}

type Receipt = { policyDecisionId: string; auditSeq: number };
/** A port's answer with the write's receipt. */
const answer = (r: { result: Row; receipt: Receipt }): Row & { receipt: Receipt } => ({ ...r.result, receipt: r.receipt });
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));
export type { DeliveryNoun };
