/**
 * DECISIONS — the HTTP surface of Phase 6 (L9). Same envelope, same capabilities,
 * same receipts as every other workspace; reading and writing stay separate decisions.
 * Every write below is at most C2; the exact C3 commit arrives with 0042 and is a
 * different route, a different action and a different port.
 *
 * B18 (0078): the lifecycle ANNOUNCED — the proposal publishes DecisionPackageReady, the
 * commit DecisionCommitted, the reopen DecisionReopened, each from the transaction that
 * made the transition; the reopen route is the owner's re-entry into a committed
 * decision's lifecycle on a recorded cause.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import { requireCorrelation } from '../shared/correlation.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import type { EyeRequest } from '../pipeline/http.js';
import type { WriteEffect } from '../pipeline/pipeline.service.js';
import { DecisionCapability } from './decision.capabilities.js';
import { decisionCommittedEvent, decisionPackageReadyEvent, decisionReopenedEvent } from './decision-events.js';
import { PackageService, validateOptionIntake, validatePackageIntake, validateTermsIntake } from './packages/package.service.js';
import { ApprovalService, validateApprovalIntake, type CommitAnswer } from './approvals/approval.service.js';
import { ReplayService } from './replay/replay.service.js';
import { MonitoringService, validateOutcomeIntake } from './monitoring/monitoring.service.js';
/* B34 (0090) commitments */
import { commitWithTracker, rootOpenedEvents } from './commitments/commit-tracker.js';
/* end B34 commitments */
// B24 (0086) markers
import { SourceImpactCapability } from '../observation/impact/source-impact.capabilities.js';
import { SourceImpactService } from '../observation/impact/source-impact.service.js';
// B34 (0090) gates
import { GateCapability } from './gates/gate.capabilities.js';
import { GateService, gateActOf, gateActionOf } from './gates/gate.service.js';
/* B36 (0094) gates: the gate completed — the signature, recusal, challenge, distribution, the validated fields, the board, the one gate state */
import { GateCompletionCapability } from './gates/gate-completion.capabilities.js';
import { GateCompletionService, boardActOf, boardActionOf, signActionOf, validateSignIntake } from './gates/gate-completion.service.js';
import { GateCapability as GateActCapability } from './gates/gate.capabilities.js';
/* end B36 gates */

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) {
    throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  }
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
function instant(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? fallback : d.toISOString();
}
const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);
const versionOf = (v: string, correlationId: string): number => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'version must be a positive integer'), 422);
  return n;
};

@Controller('/v1/tenants/:tenantId/domains/:domainId/decisions')
export class DecisionController {
  constructor(private readonly pipeline: PipelineService, private readonly packages: PackageService, private readonly approvals: ApprovalService, private readonly replays: ReplayService, private readonly monitoring: MonitoringService,
              /* B36 (0094) gates */ private readonly completion: GateCompletionService /* end B36 gates */) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  @Post('/declare')
  async declare(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validatePackageIntake((body.payload ?? {}) as never, envelope.correlation_id);
    const packageId = newId();
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'decision.package.declare', 'DPK', packageId), DecisionCapability.declare,
      async (cap, scope) => {
        const r = await this.packages.declare(cap, scope, intake, principal.principalId, envelope.correlation_id, packageId);
        return { result: r, targetType: 'DPK', targetId: r.packageId, targetVersion: '0', outboxEvent: null };
      });
    return { package: out.result, receipt: receipt(out) };
  }

  @Post('/:packageId/versions/open')
  async openVersion(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string,
    @Body() body: { payload?: { knownAt?: string; observedThrough?: string | null; carryFrom?: number | null } },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'decision.package.version', 'DPK', packageId), DecisionCapability.version,
      async (cap, scope) => {
        const r = await this.packages.openVersion(cap, scope, packageId, {
          knownAt: instant(p.knownAt, new Date().toISOString()), observedThrough: day(p.observedThrough),
          carryFrom: Number.isInteger(p.carryFrom) ? (p.carryFrom as number) : null,
        }, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(r.version), outboxEvent: null };
      });
    return { version: out.result, receipt: receipt(out) };
  }

  @Post('/:packageId/versions/:version/options')
  async setOption(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const intake = validateOptionIntake((body.payload ?? {}) as never, envelope.correlation_id);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'decision.package.option', 'DPK', packageId), DecisionCapability.option,
      async (cap, scope) => {
        const r = await this.packages.setOption(cap, scope, packageId, v, intake, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { option: out.result, receipt: receipt(out) };
  }

  @Post('/:packageId/versions/:version/terms')
  async setTerms(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const intake = validateTermsIntake((body.payload ?? {}) as never, envelope.correlation_id);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'decision.package.terms', 'DPK', packageId), DecisionCapability.terms,
      async (cap, scope) => {
        const r = await this.packages.setTerms(cap, scope, packageId, v, intake, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { terms: out.result, receipt: receipt(out) };
  }

  @Post('/:packageId/versions/:version/choice')
  async setChoice(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const choice = (body.payload ?? {}) as Record<string, unknown>;
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'decision.package.choice', 'DPK', packageId), DecisionCapability.choice,
      async (cap, scope) => {
        const r = await this.packages.setChoice(cap, scope, packageId, v, choice, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { choice: out.result, receipt: receipt(out) };
  }

  @Post('/:packageId/versions/:version/dissent')
  async dissent(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Body() body: { payload?: { position?: string; rationale?: string; citation?: { kind: string; id: string; version?: number | null } | null } },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const p = body.payload ?? {};
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'decision.dissent', 'DPK', packageId), DecisionCapability.dissent,
      async (cap, scope) => {
        const r = await this.packages.recordDissent(cap, scope, packageId, v, { position: String(p.position ?? ''), rationale: String(p.rationale ?? ''), citation: (p.citation ?? null) as never }, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { dissent: out.result, receipt: receipt(out) };
  }

  @Post('/:packageId/versions/:version/propose')
  async propose(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'decision.package.propose', 'DPK', packageId),
      /* B36 (0094) gates: the proposal's capability beside the fields' validator (the same transaction, the same bound action) */
      (tx, action) => ({ propose: DecisionCapability.propose(tx, action), fields: GateCompletionCapability.fields(tx, action) }),
      async ({ propose: cap, fields }, scope) => {
        /* B36 (0094) gates (l3): missing_information and expected_effects validated at the proposal — version.fields_validated recorded; a malformed field refused naming it */
        const validated = await fields.validateVersionFieldsAtPropose({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, packageId, version: v, actor: principal.principalId, eventId: newId(), correlationId: envelope.correlation_id });
        /* end B36 gates */
        const { ready, ...r0 } = await this.packages.propose(cap, scope, packageId, v, envelope.purpose_id ?? 'decision', principal.principalId, envelope.correlation_id);
        const r = { ...r0, fieldsValidated: validated };
        // B18 (0078, L9-I02): the proposal ANNOUNCED from its own transaction; the answer keeps its keys.
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v),
                 outboxEvent: decisionPackageReadyEvent({ ...ready, actor: principal.principalId, occurredAt: new Date().toISOString() }) };
      });
    return { proposal: out.result, receipt: receipt(out) };
  }

  /** B18 (0078, L9-I05): the owner REOPENS a committed decision on a recorded cause; the commitment stands; a new draft follows the cycle. */
  @Post('/:packageId/reopen')
  async reopen(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string,
    @Body() body: { payload?: { cause?: { kind?: string; ref?: string }; knownAt?: string; observedThrough?: string | null } },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const cause = typeof p.cause === 'object' && p.cause !== null ? p.cause : {};
    const now = new Date().toISOString();
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'decision.package.reopen', 'DPK', packageId), DecisionCapability.reopen,
      async (cap, scope) => {
        const r = await this.packages.reopen(cap, scope, packageId, {
          cause: { kind: String(cause.kind ?? ''), ref: String(cause.ref ?? '') },
          knownAt: typeof p.knownAt === 'string' ? instant(p.knownAt, now) : null, observedThrough: day(p.observedThrough),
        }, principal.principalId, envelope.correlation_id);
        return { result: r.reopened, targetType: 'DPK', targetId: packageId, targetVersion: String(r.reopened['new_version']),
                 outboxEvent: decisionReopenedEvent({ reopened: r.reopened, packageId, decisionObjectId: r.decisionObjectId, actor: principal.principalId, occurredAt: now }) };
      });
    return { reopened: out.result, receipt: receipt(out) };
  }

  @Post('/:packageId/withdraw')
  async withdraw(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string,
    @Body() body: { payload?: { reason?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'decision.package.withdraw', 'DPK', packageId), DecisionCapability.withdraw,
      async (cap, scope) => {
        const r = await this.packages.withdraw(cap, scope, packageId, String(body.payload?.reason ?? ''), principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: '0', outboxEvent: null };
      });
    return { package: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── P6-M2: approvals and the exact C3 commit ─────────────────────────

  @Post('/:packageId/versions/:version/approve')
  async approve(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const intake = validateApprovalIntake((body.payload ?? {}) as never, envelope.correlation_id);
    const approvalId = newId();
    const out = await this.pipeline.write(
      envelope, principal, { ...this.route(tenantId, domainId, 'decision.approve', 'APR', approvalId), writableTargets: [approvalId] }, DecisionCapability.approve,
      async (cap, scope) => {
        const r = await this.approvals.approve(cap, scope, packageId, v, intake, principal.principalId, envelope.purpose_id ?? 'decision', envelope.correlation_id, approvalId);
        return { result: r, targetType: 'APR', targetId: approvalId, targetVersion: '1', outboxEvent: null };
      });
    return { approval: out.result, receipt: receipt(out) };
  }

  @Post('/:packageId/approvals/:approvalId/revoke')
  async revoke(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('approvalId') approvalId: string,
    @Body() body: { payload?: { reason?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'decision.approve.revoke', 'APR', approvalId), DecisionCapability.approve,
      async (cap, scope) => {
        const r = await this.approvals.revoke(cap, scope, approvalId, String(body.payload?.reason ?? ''), envelope.correlation_id);
        return { result: { ...r, packageId }, targetType: 'APR', targetId: approvalId, targetVersion: '1', outboxEvent: null };
      });
    return { revocation: out.result, receipt: receipt(out) };
  }

  /**
   * THE COMMIT. The route PINS consequence class C3 — the envelope does not choose it —
   * and declares the CMT it will write. The policy rule is exact; the PEP discharges
   * the human gate; the port verifies the class and the bound action in the context.
   */
  @Post('/:packageId/versions/:version/commit')
  async commit(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Body() body: { payload?: { versionDigest?: string; previewDigest?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const commitmentId = newId();
    // B34 (0090) gates: the commit carries its preview's digest; a failing approval condition HOLDS it (recorded; 200 {commitment: null, held}).
    const previewDigest = typeof body.payload?.previewDigest === 'string' ? body.payload.previewDigest : '';
    const out = await this.pipeline.write(
      envelope, principal,
      { ...this.route(tenantId, domainId, 'decision.commit', 'CMT', commitmentId), consequenceClass: 'C3', writableTargets: [commitmentId] },
      /* B34 (0090) commitments: the commit capability with the tracker's read (the seeded root item) */ commitWithTracker /* end B34 commitments */,
      async (cap, scope): Promise<WriteEffect<CommitAnswer>> => {
        const r = await this.approvals.commit(cap, scope, packageId, v, String(body.payload?.versionDigest ?? ''), principal.principalId, envelope.purpose_id ?? 'decision', envelope.correlation_id, commitmentId, previewDigest);
        if (r.held !== null) return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
        // B18 (0078, L9-I04): the commitment ANNOUNCED from the C3 transaction — the CMT, the conditions, the handoff statement, the replay snapshot.
        return { result: r, targetType: 'CMT', targetId: commitmentId, targetVersion: '1',
                 outboxEvent: decisionCommittedEvent({
                   packageId, version: v, versionDigest: r.versionDigest, commitmentId: r.commitmentId, committedBy: principal.principalId, approvals: r.approvals,
                   opClass: r.opClass, boundAction: r.boundAction, policyDecisionId: r.policyDecisionId, decidedAt: r.decidedAt, choice: r.choice, decisionObjectId: r.decisionObjectId,
                   objectives: r.objectives, runs: r.runs, baselineRunId: r.baselineRunId, monitoringConditions: r.monitoringConditions, cmtHeaderDigest: r.cmtHeaderDigest,
                   reopenedFrom: r.reopenedFrom, actor: principal.principalId,
                 }),
                 /* B34 (0090) commitments: the tracker's ROOT item, seeded by the commitment's insert, announced — CommitmentChanged item.opened */
                 outboxEvents: await rootOpenedEvents(cap, r.commitmentId, principal.principalId) /* end B34 commitments */ };
      });
    if (out.result.held !== null) return { commitment: null, held: out.result.held, receipt: receipt(out) };
    return { commitment: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── P6-M3: replay ─────────────────────────

  /** A replay is a governed WRITE: it records what it reconstructed, for whom, when, and what was unavailable then. */
  @Post('/:packageId/versions/:version/replay')
  async replay(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Body() body: { payload?: { asOf?: string | null } },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const asOf = typeof body.payload?.asOf === 'string' && !Number.isNaN(new Date(body.payload.asOf).getTime()) ? new Date(body.payload.asOf).toISOString() : null;
    const replayId = newId();
    const out = await this.pipeline.write(
      envelope, principal, { ...this.route(tenantId, domainId, 'decision.replay', 'RPL', replayId), writableTargets: [replayId] }, DecisionCapability.replay,
      async (cap, scope) => {
        const r = await this.replays.replay(cap, scope, packageId, v, asOf, principal, envelope.purpose_id ?? 'decision', envelope.correlation_id, replayId);
        return { result: r, targetType: 'RPL', targetId: replayId, targetVersion: '1', outboxEvent: null };
      });
    return { replay: out.result, receipt: receipt(out) };
  }

  @Post('/:packageId/replays/list')
  async listReplays(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.read', 'DPK', packageId),
      DecisionCapability.read, async (cap) => cap.readReplays().selectAll().where('package_id' as never, '=', packageId as never).orderBy('replayed_at' as never).execute());
    return { replays: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── P6-M5: monitoring, outcomes, closure ─────────────────────────

  @Post('/:packageId/monitor')
  async monitor(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.monitor', 'DPK', packageId), DecisionCapability.monitor,
      async (cap, scope) => {
        const r = await this.monitoring.evaluate(cap, scope, packageId, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(r['version'] ?? 0), outboxEvent: null };
      });
    return { monitoring: out.result, receipt: receipt(out) };
  }

  /** The OUT: the second bounded write into the strategy graph, under decision.outcome, declared before the capability is minted. */
  @Post('/:packageId/outcomes')
  async outcome(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateOutcomeIntake((body.payload ?? {}) as never, envelope.correlation_id);
    const outcomeId = newId();
    const out = await this.pipeline.write(envelope, principal, { ...this.route(tenantId, domainId, 'decision.outcome', 'OUT', outcomeId), writableTargets: [outcomeId] }, DecisionCapability.outcome,
      async (cap, scope) => {
        const r = await this.monitoring.recordOutcome(cap, scope, packageId, intake, principal.principalId, envelope.purpose_id ?? 'decision', envelope.correlation_id, outcomeId);
        return { result: r, targetType: 'OUT', targetId: outcomeId, targetVersion: '1', outboxEvent: null };
      });
    return { outcome: out.result, receipt: receipt(out) };
  }

  @Post('/:packageId/close')
  async close(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Body() body: { payload?: { lessons?: string } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.close', 'DPK', packageId), DecisionCapability.close,
      async (cap, scope) => {
        const r = await this.monitoring.close(cap, scope, packageId, String(body.payload?.lessons ?? ''), principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: '0', outboxEvent: null };
      });
    return { closure: out.result, receipt: receipt(out) };
  }

  @Post('/:packageId/outcomes/list')
  async listOutcomes(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.read', 'DPK', packageId), DecisionCapability.read, async (cap) => this.monitoring.outcomes(cap, packageId));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.read', 'DPK', null),
      DecisionCapability.read, async (cap, scope) => this.packages.list(cap, principal, envelope.purpose_id ?? null, { tenantId: scope.tenantId, domainId: scope.domainId }));
    return { packages: out.result, receipt: receipt(out) };
  }

  @Post('/:packageId/get')
  async get(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.read', 'DPK', packageId),
      DecisionCapability.read, async (cap, scope) => this.packages.get(cap, packageId, principal, envelope.purpose_id ?? null, envelope.correlation_id, { tenantId: scope.tenantId, domainId: scope.domainId }));
    if (out.result === undefined) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized package matches'), 404);
    return { package: out.result, receipt: receipt(out) };
  }

  @Post('/projections/rebuild')
  async rebuild(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.read', 'DPK', null),
      DecisionCapability.read, async (cap) => cap.rebuildProjections());
    return { projections: out.result, receipt: receipt(out) };
  }

  /* B24 (0086) markers */
  // F-P6-07 (V03-T-077): the markers on a source's derived products CONSTRAIN the commitment (decision.commit_package refuses
  // `commitment rejected (source_impact)` while an active marker bearing on the version is not acknowledged for it). The service is
  // stateless (the capability carries the transaction), so it is held here rather than injected.
  private readonly sourceImpact = new SourceImpactService();

  /**
   * THE ACKNOWLEDGEMENT of a source impact, for ONE version: a named human holding decision_authority (the role that commits — the
   * person who answers for committing on a degraded source; the exact PDP rule `decision.source_impact.acknowledge`, human-gated)
   * names the active markers that bear on that version and says why. Recorded as `source_impact.acknowledged`; a new version needs
   * its own. The port judges the person, the markers and the version.
   */
  @Post('/:packageId/source-impact/acknowledge')
  async acknowledgeSourceImpact(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string,
    @Body() body: { payload?: { version?: unknown; markerIds?: unknown; reason?: unknown } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(
      envelope, principal, this.route(tenantId, domainId, 'decision.source_impact.acknowledge', 'DPK', packageId), SourceImpactCapability.acknowledge,
      async (cap, scope) => {
        const r = await this.sourceImpact.acknowledge(cap, scope, packageId, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(r.version), outboxEvent: null };
      });
    return { acknowledgement: out.result, receipt: receipt(out) };
  }
  /* end B24 markers */

  /* B34 (0090) gates */
  // F-P6-04 — the human gate made complete. Every act below is a named member's, human-gated at the PDP (an EXACT rule per action; no
  // prefix rule matches `decision.gate.`, `decision.override.`, `decision.delegation.`, `decision.board.`, `decision.control.` or
  // `decision.commit.preview`); the ports judge the person, the separation of duties and the record. Stateless, held here like the
  // markers' service.
  private readonly gates = new GateService();

  /** The gate as it stands for one version: conditions evaluated now, the acts, overrides, delegations, previews, holds and gate tasks. */
  @Post('/:packageId/versions/:version/gate/status')
  async gateStatus(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.read', 'DPK', packageId), GateCapability.read,
      async (cap, scope) => this.gates.status(cap, scope, packageId, v));
    if (out.result === undefined) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized package version matches'), 404);
    return { gate: out.result, receipt: receipt(out) };
  }

  /** The seven DISTINCT gate acts (HX-12): review, acknowledge, ready, defer, reject, request-information, resume — each its own PDP action. */
  @Post('/:packageId/versions/:version/gate/:act')
  async gateAct(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Param('act') segment: string, @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const act = gateActOf(segment, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, gateActionOf(act), 'DPK', packageId), GateCapability.act,
      async (cap, scope) => {
        const r = await this.gates.act(cap, scope, packageId, v, act, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { gate: out.result, receipt: receipt(out) };
  }

  /** THE CONSEQUENCE PREVIEW (HX-13): the committing authority's recorded reading; the commit carries its digest within 30 minutes. */
  @Post('/:packageId/versions/:version/preview')
  async preview(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.commit.preview', 'DPK', packageId), GateCapability.preview,
      async (cap, scope) => {
        const r = await this.gates.preview(cap, scope, packageId, v, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { preview: out.result, receipt: receipt(out) };
  }

  /** OVERRIDE as a recorded object: normal (a decision authority; the failing conditions only) or emergency (an executive; + the quorum shortfall; a review task). */
  @Post('/:packageId/versions/:version/override')
  async grantOverride(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.override.grant', 'DPK', packageId), GateCapability.override,
      async (cap, scope) => {
        const r = await this.gates.grantOverride(cap, scope, packageId, v, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { override: out.result, receipt: receipt(out) };
  }

  /** The mandatory after-the-fact review of an emergency override (never its grantor). */
  @Post('/:packageId/overrides/:overrideId/review')
  async reviewOverride(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('overrideId') overrideId: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.override.review', 'DPK', packageId), GateCapability.override,
      async (cap, scope) => {
        const r = await this.gates.reviewOverride(cap, scope, overrideId, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: { ...r, packageId }, targetType: 'DPK', targetId: packageId, targetVersion: '0', outboxEvent: null };
      });
    return { review: out.result, receipt: receipt(out) };
  }

  /** An approver DELEGATES their approval of this package to a named member until an expiry (≤ 30 days). */
  @Post('/:packageId/delegations')
  async delegate(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.delegation.grant', 'DPK', packageId), GateCapability.delegate,
      async (cap, scope) => {
        const r = await this.gates.delegate(cap, scope, packageId, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: '0', outboxEvent: null };
      });
    return { delegation: out.result, receipt: receipt(out) };
  }

  /** The delegator ENDS a delegation, or REASSIGNS it (reassignTo) to another member. */
  @Post('/:packageId/delegations/:delegationId/end')
  async endDelegation(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('delegationId') delegationId: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.delegation.end', 'DPK', packageId), GateCapability.delegate,
      async (cap, scope) => {
        const r = await this.gates.endDelegation(cap, scope, delegationId, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: { ...r, packageId }, targetType: 'DPK', targetId: packageId, targetVersion: '0', outboxEvent: null };
      });
    return { delegation: out.result, receipt: receipt(out) };
  }

  /** An executive reserves a DRAFT package for the board (PER-01): never overridden, never delegated, decision-ready required. */
  @Post('/:packageId/board/reserve')
  async reserveBoard(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.board.reserve', 'DPK', packageId), GateCapability.board,
      async (cap, scope) => {
        const r = await this.gates.reserveBoard(cap, scope, packageId, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: '0', outboxEvent: null };
      });
    return { board: out.result, receipt: receipt(out) };
  }

  /** A policy revision or a control decision, VERSIONED per key (each superseding the one before); linked to a package when named. */
  @Post('/controls')
  async recordControl(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const pkg = typeof body.payload?.['packageId'] === 'string' ? body.payload['packageId'] : null;
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.control.record', 'DPK', pkg), GateCapability.control,
      async (cap, scope) => {
        const r = await this.gates.recordControl(cap, scope, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: pkg, targetVersion: String(r['version'] ?? 1), outboxEvent: null };
      });
    return { control: out.result, receipt: receipt(out) };
  }

  /** The controls IN FORCE at an instant (default now): per key, the latest version recorded and effective by then. */
  @Post('/controls/as-of')
  async controlsAsOf(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: { at?: string } }) {
    const { envelope, principal } = ctx(req);
    const at = instant(body.payload?.at, new Date().toISOString());
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.read', 'DPK', null), GateCapability.read,
      async (cap, scope) => cap.controlsAsOf({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, at }));
    return { at, controls: out.result, receipt: receipt(out) };
  }
  /* end B34 gates */
  // ───────────────────────── B36 (0094 §G): the human gate COMPLETED (F-P6-04) ─────────────────────────
  // Every act below is a named member's, human-gated at the PDP by an EXACT rule (decision.sign.approval / .decision, decision.recuse,
  // decision.challenge, decision.challenge.resolve, decision.distribute, decision.board.approve / .reject / .defer, decision.board.read);
  // the ports judge the person, the record and the rule. The board member reaches the gate ONLY through the decision.board.* routes: no
  // standard action admits the role, and decision.board_gate_check refuses a standard package before the act runs.

  /** k1 THE SIGNATURE beyond the audit chain: {kind: approval | decision, digest, approvalId?} — the action is the kind's (decision.sign.<kind>). */
  @Post('/:packageId/versions/:version/sign')
  async sign(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const i = validateSignIntake(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, signActionOf(i.kind), 'DPK', packageId), GateCompletionCapability.sign,
      async (cap, scope) => {
        const r = await this.completion.sign(cap, scope, packageId, v, i, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { signature: out.result, receipt: receipt(out) };
  }

  /** l1 RECUSAL: the approver's own withdrawal from the version, with a reason; the standing approval voided, the quorum re-read. */
  @Post('/:packageId/versions/:version/recuse')
  async recuse(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.recuse', 'DPK', packageId), GateCompletionCapability.recuse,
      async (cap, scope) => {
        const r = await this.completion.recuse(cap, scope, packageId, v, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { recusal: out.result, receipt: receipt(out) };
  }

  /** l2 CHALLENGE: a room member or the auditor, before or after commitment; the gate reads `challenged`, a commitment is held. */
  @Post('/:packageId/versions/:version/challenge')
  async challenge(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.challenge', 'DPK', packageId), GateCompletionCapability.challenge,
      async (cap, scope) => {
        const r = await this.completion.challenge(cap, scope, packageId, v, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { challenge: out.result, receipt: receipt(out) };
  }

  /** l2 THE RESOLUTION: the owner (never the challenger) upholds (the withdrawal chain / reopen required) or dismisses (the state returns). */
  @Post('/:packageId/versions/:version/resolve-challenge')
  async resolveChallenge(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.challenge.resolve', 'DPK', packageId), GateCompletionCapability.challenge,
      async (cap, scope) => {
        const r = await this.completion.resolveChallenge(cap, scope, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { resolution: out.result, receipt: receipt(out) };
  }

  /** k2 DISTRIBUTION after commitment: in_app always; email / sms / teams SYNTHETIC (the local sinks); receipts recorded; never an external. */
  @Post('/:packageId/versions/:version/distribute')
  async distribute(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.distribute', 'DPK', packageId), GateCompletionCapability.distribute,
      async (cap, scope) => {
        const r = await this.completion.distribute(cap, scope, packageId, v, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { distribution: out.result, receipt: receipt(out) };
  }

  /** l3 THE VALIDATED FIELDS on a draft (under the terms' authority): {missingInformation: [{what, owner, needed_by}], expectedEffects: [{effect, measure, direction, horizon, basis}]}. */
  @Post('/:packageId/versions/:version/fields')
  async setFields(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'decision.package.terms', 'DPK', packageId), GateCompletionCapability.fields,
      async (cap, scope) => {
        const r = await this.completion.setFields(cap, scope, packageId, v, body.payload ?? {}, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { fields: out.result, receipt: receipt(out) };
  }

  /** The gate's completion record for one version: signatures VERIFIED, recusals, challenges, PDP denials, distributions, the fields, the uniform state. */
  @Post('/:packageId/versions/:version/gate-record')
  async gateRecord(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.read', 'DPK', packageId), GateCompletionCapability.read,
      async (cap) => this.completion.record(cap, packageId, v));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized package version matches'), 404);
    return { record: out.result, receipt: receipt(out) };
  }

  /** l6 ONE uniform human-gate state (ADR-003) for a decision version, a source contract or a merge: {kind, id, version?} → {kind, id, state, since, by}. */
  @Post('/gate-state')
  async gateState(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.read', 'DPK', typeof body.payload?.['id'] === 'string' ? (body.payload['id'] as string) : null), GateCompletionCapability.read,
      async (cap) => this.completion.gateState(cap, body.payload ?? {}, envelope.correlation_id));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'gate state rejected (unknown_subject): no such subject is visible in this domain'), 404);
    return { gate: out.result, receipt: receipt(out) };
  }

  /** l4 THE BOARD SURFACE (PER-01): the board-class packages with their gate state, approvals (live, recused), signatures and the reader's own standing. */
  @Post('/board/list')
  async boardList(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.board.read', 'DPK', null), GateCompletionCapability.read,
      async (cap, scope) => this.completion.board(cap, scope, principal.principalId));
    return { board: out.result, receipt: receipt(out) };
  }

  /**
   * l4 THE BOARD MEMBER'S OWN ACTS on a board-class package, through the gate: approve / reject (an approval record under the board's
   * policy) and defer (a gate act) — each under its EXACT action decision.board.<act>; the class and the standing judged by the port first.
   */
  @Post('/board/:packageId/versions/:version/:act')
  async boardAct(
    @Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string, @Param('version') version: string,
    @Param('act') segment: string, @Body() body: { payload?: Record<string, unknown> },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const act = boardActOf(segment, envelope.correlation_id);
    if (act === 'defer') {
      const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, boardActionOf(act), 'DPK', packageId),
        (tx, action) => ({ board: GateCompletionCapability.board(tx, action), gate: GateActCapability.act(tx, action) }),
        async ({ board, gate }, scope) => {
          await this.completion.boardCheck(board, scope, packageId, v, act, principal.principalId);
          const r = await this.gates.act(gate, scope, packageId, v, 'defer', body.payload ?? {}, principal.principalId, envelope.correlation_id);
          return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
        });
      return { board: out.result, receipt: receipt(out) };
    }
    const intake = validateApprovalIntake({ ...(body.payload ?? {}), decision: act } as never, envelope.correlation_id);
    const approvalId = newId();
    const out = await this.pipeline.write(envelope, principal, { ...this.route(tenantId, domainId, boardActionOf(act), 'APR', approvalId), writableTargets: [approvalId] },
      (tx, action) => ({ board: GateCompletionCapability.board(tx, action), approve: DecisionCapability.approve(tx, action) }),
      async ({ board, approve }, scope) => {
        await this.completion.boardCheck(board, scope, packageId, v, act, principal.principalId);
        const r = await this.approvals.approve(approve, scope, packageId, v, intake, principal.principalId, envelope.purpose_id ?? 'decision', envelope.correlation_id, approvalId);
        return { result: r, targetType: 'APR', targetId: approvalId, targetVersion: '1', outboxEvent: null };
      });
    return { board: out.result, receipt: receipt(out) };
  }
  /* end B36 gates */
}
