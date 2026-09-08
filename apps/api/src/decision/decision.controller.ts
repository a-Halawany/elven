/**
 * DECISIONS — the HTTP surface of Phase 6 (L9). Same envelope, same capabilities,
 * same receipts as every other workspace; reading and writing stay separate decisions.
 * Every write below is at most C2; the exact C3 commit arrives with 0042 and is a
 * different route, a different action and a different port.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import { requireCorrelation } from '../shared/correlation.js';
import { PipelineService } from '../pipeline/pipeline.service.js';
import type { EyeRequest } from '../pipeline/http.js';
import { DecisionCapability } from './decision.capabilities.js';
import { PackageService, validateOptionIntake, validatePackageIntake, validateTermsIntake } from './packages/package.service.js';
import { ApprovalService, validateApprovalIntake } from './approvals/approval.service.js';
import { ReplayService } from './replay/replay.service.js';
import { MonitoringService, validateOutcomeIntake } from './monitoring/monitoring.service.js';

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
  constructor(private readonly pipeline: PipelineService, private readonly packages: PackageService, private readonly approvals: ApprovalService, private readonly replays: ReplayService, private readonly monitoring: MonitoringService) {}

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
      envelope, principal, this.route(tenantId, domainId, 'decision.package.propose', 'DPK', packageId), DecisionCapability.propose,
      async (cap, scope) => {
        const r = await this.packages.propose(cap, scope, packageId, v, envelope.purpose_id ?? 'decision', principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(v), outboxEvent: null };
      });
    return { proposal: out.result, receipt: receipt(out) };
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
    @Body() body: { payload?: { versionDigest?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const v = versionOf(version, envelope.correlation_id);
    const commitmentId = newId();
    const out = await this.pipeline.write(
      envelope, principal,
      { ...this.route(tenantId, domainId, 'decision.commit', 'CMT', commitmentId), consequenceClass: 'C3', writableTargets: [commitmentId] },
      DecisionCapability.commit,
      async (cap, scope) => {
        const r = await this.approvals.commit(cap, scope, packageId, v, String(body.payload?.versionDigest ?? ''), principal.principalId, envelope.purpose_id ?? 'decision', envelope.correlation_id, commitmentId);
        return { result: r, targetType: 'CMT', targetId: commitmentId, targetVersion: '1', outboxEvent: null };
      });
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
        const r = await this.replays.replay(cap, scope, packageId, v, asOf, principal.principalId, envelope.purpose_id ?? 'decision', envelope.correlation_id, replayId);
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
      DecisionCapability.read, async (cap) => this.packages.list(cap));
    return { packages: out.result, receipt: receipt(out) };
  }

  @Post('/:packageId/get')
  async get(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('packageId') packageId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'decision.read', 'DPK', packageId),
      DecisionCapability.read, async (cap) => this.packages.get(cap, packageId));
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
}
