/**
 * THE BRANCH-AWARE TWIN STATE STORE — the HTTP surface of CP-6 B30 part `branches` (0103 §BR; F-P5-03). Same envelope, capabilities and
 * receipts as the twin routes. Reads are `twin.read` (consequential, audited); every write its own exact action:
 *
 *   POST …/twin-branches/twins/:twinId/explorer                 twin.read            the explorer's record (branch tree, merges, freezes, policy, served state, freshness, confidence)
 *   POST …/twin-branches/twins/:twinId/versions/:v/freshness    twin.read            twin.version_freshness
 *   POST …/twin-branches/twins/:twinId/versions/:v/confidence   twin.read            twin.confidence_rollup
 *   POST …/twin-branches/twins/:twinId/versions/:v/diff         twin.read            the version against actual's head (or `against`)
 *   POST …/twin-branches/twins/:twinId/served                   twin.read            twin.served_state (asOf: an instant)
 *   POST …/twin-branches/twins/:twinId/freshness-policy         twin.freshness.policy
 *   POST …/twin-branches/twins/:twinId/merges/open              twin.branch.merge    (→ twin.reconciliation to the owner)
 *   POST …/twin-branches/merges/:mergeId/read                   twin.read
 *   POST …/twin-branches/merges/:mergeId/resolve                twin.branch.reconcile
 *   POST …/twin-branches/merges/:mergeId/complete               twin.branch.merge, then twin.version, twin.ground, twin.version.admit (four governed writes)
 *   POST …/twin-branches/merges/:mergeId/close                  twin.branch.merge    (refused | withdrawn)
 *   POST …/twin-branches/twins/:twinId/restore                  twin.version, then twin.branch.restore (two governed writes)
 *   POST …/twin-branches/twins/:twinId/freeze                   twin.snapshot.freeze
 *   POST …/twin-branches/freezes/:freezeId/lift                 twin.snapshot.freeze
 *   POST …/twin-branches/twins/:twinId/versions/:v/scenario-elements   twin.ground (the existing grounding port; kind `scenario`)
 *
 * Time travel is the existing POST …/twins/:twinId/as-of. The merge's admission publishes what every admission publishes (TwinStateChanged@v1
 * and GraphChanged/twin.state_changed) — the existing admit's events; this surface adds no event of its own.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { twinStateChangedGraphEvent } from '../../graph/subscriptions/change-events.js';
import { TwinService } from '../twins/twin.service.js';
import { twinStateChangedEvent } from '../twins/twin-events.js';
import { BranchCapability } from './branch.capabilities.js';
import { BranchService, assertUuid, assertVersion, validateFreeze, validatePolicy, validateResolution, validateScenarioElements } from './branch.service.js';

type Row = Record<string, unknown>;
const BRANCH = /^[a-z][a-z0-9-]{0,40}$/;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const bad = (correlationId: string, text: string, status = 422): never => {
  throw new HttpException(errorBody(status === 404 ? 'EYE_STA_001' : status === 409 ? 'EYE_STA_002' : status === 403 ? 'EYE_AUT_001' : 'EYE_REQ_001', correlationId, text), status);
};
const reasonOf = (v: unknown, correlationId: string, noun: string): string => {
  if (typeof v !== 'string' || v.trim().length < 8 || v.trim().length > 2000) bad(correlationId, `${noun} rejected (reason): say why (8 to 2000 characters)`);
  return (v as string).trim();
};

@Controller('/v1/tenants/:tenantId/domains/:domainId/twin-branches')
export class BranchesController {
  constructor(private readonly pipeline: PipelineService, private readonly branches: BranchService, private readonly twins: TwinService) {}

  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  /* ───────────── reads (twin.read) ───────────── */
  @Post('/twins/:twinId/explorer')
  async explorer(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(twinId, 'twin', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', twinId), BranchCapability.read,
      async (cap) => this.branches.explorer(cap, twinId));
    if (out.result === undefined) bad(envelope.correlation_id, 'no authorized twin matches', 404);
    return { explorer: out.result, receipt: receipt(out) };
  }

  @Post('/twins/:twinId/versions/:version/freshness')
  async freshness(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string, @Param('version') v: string) {
    const { envelope, principal } = ctx(req);
    const version = assertVersion(v, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', twinId), BranchCapability.read,
      async (cap) => cap.versionFreshness(twinId, version));
    if (out.result === null) bad(envelope.correlation_id, 'no authorized twin version matches', 404);
    return { freshness: out.result, receipt: receipt(out) };
  }

  @Post('/twins/:twinId/versions/:version/confidence')
  async confidence(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string, @Param('version') v: string) {
    const { envelope, principal } = ctx(req);
    const version = assertVersion(v, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', twinId), BranchCapability.read,
      async (cap) => cap.confidenceRollup(twinId, version));
    if (out.result === null) bad(envelope.correlation_id, 'no authorized twin version matches', 404);
    return { confidence: out.result, receipt: receipt(out) };
  }

  @Post('/twins/:twinId/versions/:version/diff')
  async diff(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string, @Param('version') v: string,
             @Body() body: { payload?: { against?: number } }) {
    const { envelope, principal } = ctx(req);
    const version = assertVersion(v, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', twinId), BranchCapability.read,
      async (cap) => {
        const versions = (await cap.twin.readVersions().select(['version', 'branch_id', 'state'] as never).where('twin_id' as never, '=', twinId as never).execute()) as Row[];
        if (!versions.some((x) => Number(x['version']) === version)) return null;
        const head = versions.filter((x) => x['branch_id'] === 'actual' && x['state'] === 'admitted').map((x) => Number(x['version']));
        const against = body.payload?.against ?? (head.length === 0 ? null : Math.max(...head));
        if (against === null || !versions.some((x) => Number(x['version']) === against)) return { version, against: null, keys: [] };
        return { version, against, keys: await cap.diff(twinId, version, against as number) };
      });
    if (out.result === null) bad(envelope.correlation_id, 'no authorized twin version matches', 404);
    return { diff: out.result, receipt: receipt(out) };
  }

  @Post('/twins/:twinId/served')
  async served(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string,
               @Body() body: { payload?: { asOf?: string } }) {
    const { envelope, principal } = ctx(req);
    const a = body.payload?.asOf;
    if (a !== undefined && a !== null && (typeof a !== 'string' || Number.isNaN(new Date(a).getTime()))) bad(envelope.correlation_id, 'asOf is an instant');
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', twinId), BranchCapability.read,
      async (cap) => cap.servedState(twinId, typeof a === 'string' ? new Date(a).toISOString() : null));
    if (out.result === null) bad(envelope.correlation_id, 'no authorized twin matches', 404);
    return { served: out.result, receipt: receipt(out) };
  }

  @Post('/merges/:mergeId/read')
  async readMerge(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('mergeId') mergeId: string) {
    const { envelope, principal } = ctx(req);
    assertUuid(mergeId, 'unknown_merge', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'twin.read', 'TWN', null), BranchCapability.read,
      async (cap) => this.branches.merge(cap, mergeId));
    if (out.result === undefined) bad(envelope.correlation_id, 'no authorized merge matches', 404);
    return { merge: out.result, receipt: receipt(out) };
  }

  /* ───────────── writes ───────────── */
  @Post('/twins/:twinId/freshness-policy')
  async policy(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    assertUuid(twinId, 'unknown_twin', envelope.correlation_id, 'freshness policy');
    const p = validatePolicy(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.freshness.policy', 'TWN', twinId), BranchCapability.policy,
      async (cap, scope) => ({ result: await this.branches.setPolicy(cap, scope, twinId, p, principal.principalId, envelope.correlation_id),
                               targetType: 'TWN', targetId: twinId, targetVersion: null, outboxEvent: null }));
    return { policy: out.result, receipt: receipt(out) };
  }

  @Post('/twins/:twinId/merges/open')
  async openMerge(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string,
                  @Body() body: { payload?: { sourceBranch?: string; reason?: string } }) {
    const { envelope, principal } = ctx(req);
    assertUuid(twinId, 'unknown_twin', envelope.correlation_id);
    const src = body.payload?.sourceBranch;
    if (typeof src !== 'string' || !BRANCH.test(src) || src === 'actual') bad(envelope.correlation_id, 'branch merge rejected (branch): sourceBranch names a branch other than actual');
    const reason = reasonOf(body.payload?.reason, envelope.correlation_id, 'branch merge');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.branch.merge', 'TWN', twinId), BranchCapability.merge,
      async (cap, scope) => {
        const r = await this.branches.openMerge(cap, scope, twinId, src as string, reason, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'TWN', targetId: twinId, targetVersion: null, outboxEvent: null };
      });
    return { merge: out.result, receipt: receipt(out) };
  }

  @Post('/merges/:mergeId/resolve')
  async resolve(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('mergeId') mergeId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    assertUuid(mergeId, 'unknown_merge', envelope.correlation_id);
    const r = validateResolution(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.branch.reconcile', 'TWN', null), BranchCapability.reconcile,
      async (cap, scope) => ({ result: await this.branches.resolve(cap, scope, mergeId, r, principal.principalId, envelope.correlation_id),
                               targetType: 'TWN', targetId: null, targetVersion: null, outboxEvent: null }));
    return { merge: out.result, receipt: receipt(out) };
  }

  @Post('/merges/:mergeId/close')
  async close(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('mergeId') mergeId: string,
              @Body() body: { payload?: { outcome?: string; reason?: string } }) {
    const { envelope, principal } = ctx(req);
    assertUuid(mergeId, 'unknown_merge', envelope.correlation_id);
    const outcome = body.payload?.outcome;
    if (outcome !== 'refused' && outcome !== 'withdrawn') bad(envelope.correlation_id, 'branch merge rejected (outcome): a merge is closed refused or withdrawn');
    const reason = reasonOf(body.payload?.reason, envelope.correlation_id, 'branch merge');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.branch.merge', 'TWN', null), BranchCapability.merge,
      async (cap, scope) => ({ result: await this.branches.closeMerge(cap, scope, mergeId, outcome as 'refused' | 'withdrawn', reason, principal.principalId, envelope.correlation_id),
                               targetType: 'TWN', targetId: null, targetVersion: null, outboxEvent: null }));
    return { merge: out.result, receipt: receipt(out) };
  }

  /**
   * COMPLETE A MERGE — four governed writes, each under its own bound action and receipt:
   *   1 twin.branch.merge   the port REFUSES while any diverging key is unresolved (merging the branch back is refused until reconciliation),
   *                         or when a head moved; otherwise it fixes the plan (completing) and answers it.
   *   2 twin.version        the draft on actual, carrying actual's head except the keys the plan changes (skipped when a resumed completion
   *                         finds the draft already open).
   *   3 twin.ground         the branch's elements and the reconciled values, through the existing grounding port (only those not grounded yet).
   *   4 twin.version.admit  the existing admit — TwinStateChanged@v1 and GraphChanged/twin.state_changed as every admission; the merge is
   *                         merged in this same transaction (tbr_merge_admitted), or the admission is refused if the draft is not the plan.
   * A step that fails leaves the merge completing; calling complete again resumes it; closing it releases actual. The request's envelope names
   * twin.branch.merge; each later step is a derived envelope naming its own action (the run route's precedent: simulation.run → .complete).
   */
  @Post('/merges/:mergeId/complete')
  async complete(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('mergeId') mergeId: string,
                 @Body() body: { payload?: { allowIncomplete?: boolean } }) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    assertUuid(mergeId, 'unknown_merge', corr);
    const receipts: Row[] = [];
    // 1 — the plan
    const w1 = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.branch.merge', 'TWN', null), BranchCapability.merge,
      async (cap, scope) => {
        const r = await cap.completeMerge({ mergeId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, eventId: newId(), correlationId: corr });
        const target = (await cap.twin.readVersions().select(['observed_through'] as never).where('twin_id' as never, '=', r['twin_id'] as never)
          .where('version' as never, '=', r['target_version'] as never).executeTakeFirst()) as Row | undefined;
        return { result: { ...r, target_observed_through: dayOf(target?.['observed_through']) }, targetType: 'TWN', targetId: String(r['twin_id']), targetVersion: null, outboxEvent: null };
      });
    receipts.push({ step: 'plan', ...receipt(w1) });
    const m = w1.result as Row;
    const twinId = String(m['twin_id']);
    const plan = m['plan'] as { carry_from: number; except: string[]; ground: Row[]; open_draft: number | null };
    // 2 — the draft on actual (the existing open port)
    let draft = plan.open_draft;
    if (draft === null || draft === undefined) {
      const w2 = await this.pipeline.write(step(envelope, 'twin.version'), principal, this.route(tenantId, domainId, 'twin.version', 'TWN', twinId), BranchCapability.draft,
        async (cap, scope) => {
          const knownAt = await cap.dbNow();
          const r = await this.twins.openVersion(cap.twinVersion, scope, twinId, { branchId: 'actual', forkedFromVersion: null, knownAt,
            observedThrough: (m['target_observed_through'] ?? null) as string | null, carryFrom: plan.carry_from, except: plan.except }, principal.principalId, corr);
          return { result: r, targetType: 'TWN', targetId: twinId, targetVersion: String(r.version), outboxEvent: null };
        });
      receipts.push({ step: 'draft', ...receipt(w2) });
      draft = w2.result.version;
    }
    // 3 — the planned elements (the existing grounding port)
    if (plan.ground.length > 0) {
      const w3 = await this.pipeline.write(step(envelope, 'twin.ground'), principal, this.route(tenantId, domainId, 'twin.ground', 'TWN', twinId), BranchCapability.ground,
        async (cap, scope) => {
          const keys = await this.branches.groundPlan(cap, scope, { twinId, sourceVersion: Number(m['source_version']), draftVersion: draft as number, ground: plan.ground }, principal.principalId, corr);
          return { result: keys, targetType: 'TWN', targetId: twinId, targetVersion: String(draft), outboxEvent: null };
        });
      receipts.push({ step: 'ground', ...receipt(w3) });
    }
    // 4 — the admission (the existing admit; the merge is merged in the same transaction)
    const w4 = await this.pipeline.write(step(envelope, 'twin.version.admit'), principal, this.route(tenantId, domainId, 'twin.version.admit', 'TWN', twinId), BranchCapability.admit,
      async (cap, scope) => {
        const { runs, ...r } = await this.twins.admit(cap.twinAdmit, scope, twinId, draft as number, body.payload?.allowIncomplete === true, envelope.purpose_id ?? 'twin', principal.principalId, corr);
        const now = await cap.dbNow();
        return {
          result: r, targetType: 'TWN', targetId: twinId, targetVersion: String(draft),
          outboxEvent: twinStateChangedEvent({
            twinId, version: draft as number, branchId: r.branchId, supersedes: r.supersedes, forkedFromVersion: r.forkedFrom, change: 'version.admitted',
            stateSetDigest: r.stateSetDigest, headerDigest: r.headerDigest, completeness: r.completeness, missingKeys: r.missingKeys, syntheticState: r.syntheticState,
            knownAt: r.knownAt, observedThrough: r.observedThrough, verificationState: 'verified', changedVariables: r.changedVariables, dependencyImpacts: r.dependencyImpacts,
            reason: null, causedBy: null, action: 'twin.version.admit', actor: principal.principalId, occurredAt: now,
          }),
          outboxEvents: [twinStateChangedGraphEvent({
            twinId, version: draft as number, supersedes: r.supersedes, branchId: r.branchId, changedVariables: r.changedVariables.length, runs,
            subscriptions: await cap.twin.changeSubscriptions({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, changeKind: 'twin.state_changed' }),
            actor: principal.principalId, occurredAt: now,
          })],
        };
      });
    receipts.push({ step: 'admit', ...receipt(w4) });
    const read = await this.pipeline.consequentialRead(step(envelope, 'twin.read'), principal, this.route(tenantId, domainId, 'twin.read', 'TWN', twinId), BranchCapability.read,
      async (cap) => this.branches.merge(cap, mergeId));
    return { merge: read.result, admitted: w4.result, receipts, receipt: receipt(read) };
  }

  /**
   * RESTORE A CHECKPOINT — two governed writes: twin.version opens the draft on the branch carrying from the named earlier admitted version
   * (refused first, before anything is written, when the actor is not the twin's own owner or the version is not earlier than the branch's
   * head); twin.branch.restore records the restore with its reason (the port verifies the draft's facts). A recording that fails leaves an
   * open draft its owner withdraws. The request's envelope names twin.branch.restore; the draft is a derived envelope naming twin.version.
   */
  @Post('/twins/:twinId/restore')
  async restore(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string,
                @Body() body: { payload?: { branchId?: string; fromVersion?: number; reason?: string } }) {
    const { envelope, principal } = ctx(req);
    const corr = envelope.correlation_id;
    assertUuid(twinId, 'unknown_twin', corr, 'checkpoint restore');
    const branchId = body.payload?.branchId;
    if (typeof branchId !== 'string' || !BRANCH.test(branchId)) bad(corr, 'checkpoint restore rejected (branch): branchId is a short lower-case name');
    const from = body.payload?.fromVersion;
    if (!Number.isInteger(from) || (from as number) < 1) bad(corr, 'checkpoint restore rejected (checkpoint): fromVersion is a positive integer');
    const reason = reasonOf(body.payload?.reason, corr, 'checkpoint restore');
    const w1 = await this.pipeline.write(step(envelope, 'twin.version'), principal, this.route(tenantId, domainId, 'twin.version', 'TWN', twinId), BranchCapability.draft,
      async (cap, scope) => {
        const twin = (await cap.twin.readTwins().select(['owner_principal_id'] as never).where('twin_id' as never, '=', twinId as never).executeTakeFirst()) as Row | undefined;
        if (twin === undefined) bad(corr, `checkpoint restore rejected (unknown_twin): ${twinId} is not a twin of this domain`, 404);
        if ((twin as Row)['owner_principal_id'] !== principal.principalId) bad(corr, 'checkpoint restore rejected (ownership): restoring a checkpoint is the act of the twin\'s own owner', 403);
        const vs = (await cap.twin.readVersions().select(['version', 'branch_id', 'state', 'observed_through'] as never).where('twin_id' as never, '=', twinId as never).execute()) as Row[];
        const f = vs.find((x) => Number(x['version']) === from);
        if (f === undefined || f['state'] !== 'admitted') bad(corr, `checkpoint restore rejected (unknown_checkpoint): version ${String(from)} is not an admitted version of this twin`, 404);
        const heads = vs.filter((x) => x['branch_id'] === branchId && x['state'] === 'admitted').map((x) => Number(x['version']));
        const head = heads.length === 0 ? null : Math.max(...heads);
        if (head !== null && (from as number) >= head) bad(corr, `checkpoint restore rejected (checkpoint): v${String(from)} is not earlier than the head v${head} of branch ${String(branchId)}; a restore returns to an earlier checkpoint`);
        const knownAt = await cap.dbNow();
        const r = await this.twins.openVersion(cap.twinVersion, scope, twinId, { branchId: branchId as string, forkedFromVersion: head === null ? from as number : null, knownAt,
          observedThrough: dayOf((f as Row)['observed_through']), carryFrom: from as number, except: [] }, principal.principalId, corr);
        return { result: r, targetType: 'TWN', targetId: twinId, targetVersion: String(r.version), outboxEvent: null };
      });
    const w2 = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.branch.restore', 'TWN', twinId), BranchCapability.restore,
      async (cap, scope) => ({ result: await this.branches.recordRestore(cap, scope, twinId, { branchId: branchId as string, fromVersion: from as number, draftVersion: w1.result.version, reason },
                                                                        principal.principalId, corr),
                               targetType: 'TWN', targetId: twinId, targetVersion: String(w1.result.version), outboxEvent: null }));
    return { restore: w2.result, receipts: [{ step: 'draft', ...receipt(w1) }, { step: 'restore', ...receipt(w2) }], receipt: receipt(w2) };
  }

  @Post('/twins/:twinId/freeze')
  async freeze(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    assertUuid(twinId, 'unknown_twin', envelope.correlation_id, 'snapshot');
    const f = validateFreeze(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.snapshot.freeze', 'TWN', twinId), BranchCapability.freeze,
      async (cap, scope) => ({ result: await this.branches.freeze(cap, scope, twinId, f, principal.principalId, envelope.correlation_id),
                               targetType: 'TWN', targetId: twinId, targetVersion: null, outboxEvent: null }));
    return { freeze: out.result, receipt: receipt(out) };
  }

  @Post('/freezes/:freezeId/lift')
  async lift(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('freezeId') freezeId: string,
             @Body() body: { payload?: { reason?: string } }) {
    const { envelope, principal } = ctx(req);
    assertUuid(freezeId, 'unknown_freeze', envelope.correlation_id, 'snapshot');
    const reason = reasonOf(body.payload?.reason, envelope.correlation_id, 'snapshot');
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.snapshot.freeze', 'TWN', null), BranchCapability.freeze,
      async (cap, scope) => ({ result: await this.branches.lift(cap, scope, freezeId, reason, principal.principalId, envelope.correlation_id),
                               targetType: 'TWN', targetId: null, targetVersion: null, outboxEvent: null }));
    return { freeze: out.result, receipt: receipt(out) };
  }

  @Post('/twins/:twinId/versions/:version/scenario-elements')
  async scenario(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('twinId') twinId: string, @Param('version') v: string,
                 @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const version = assertVersion(v, envelope.correlation_id);
    const els = validateScenarioElements(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'twin.ground', 'TWN', twinId), BranchCapability.ground,
      async (cap, scope) => ({ result: await this.branches.groundScenario(cap, scope, twinId, version, els, principal.principalId, envelope.correlation_id),
                               targetType: 'TWN', targetId: twinId, targetVersion: String(version), outboxEvent: null }));
    return { grounded: out.result, receipt: receipt(out) };
  }
}

/** A later governed write of the same request: the envelope with its own action and message id (the run route's precedent). */
function step<E extends { action: string; message_id: string }>(envelope: E, action: string): E { return { ...envelope, action, message_id: newId() }; }
function dayOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}
