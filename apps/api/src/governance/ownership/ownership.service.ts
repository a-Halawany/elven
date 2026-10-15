/**
 * B107 §DR (0115_b107_x_dr) — DATA GOVERNANCE AND OWNERSHIP: the orchestration the ports do not do.
 *
 *   THE DATA AUTHORITY REGISTRY (V00-T-082, DP-04-001/-002, DAT-GV-01/-04): propose (a steward) → accept (the NAMED owner) → ratify (another
 *     named human — never the proposer, never the owner) → recertify (the owner); the duties RESOLVED LIVE (governance.dr_resolve).
 *   THE DOMAIN REGISTRY EXTENSION (DAT-GV-02): the accountable leader, the boundary, the extension contract, the governance mode.
 *   THE GAP REGISTER (DP-04-005, DP-01-005): reconcile (a steward, or the tick step `governance-ownership` in a REGISTERED domain) — gaps
 *     opened, held, escalated, resolved; a residual ACCEPTED by a named approver until a date; the tick DEGRADES a released product whose
 *     owner is lost or whose policy violation is recorded (DP-41-005 — products.degrade_product under the tick, its own statement).
 *   STEWARDSHIP CASES (DP-55-001/-002/-005, DAT-GV-07): open → review (segregated, distinct reviewers by consequence) → close | withdraw; the
 *     `stewardship.sla` timer (WorkflowTimerRegistry) and the tick step `governance-stewardship-sla` escalate, hold and expire.
 *   THE RESPONSIBILITY EVIDENCE RECORD (DP-01-006, DP-04-006, DP-55-006): assembled from the records, bound to the BUILD IDENTITY (head SHA
 *     from the environment, the policy bundle version, the migration head), attested and SIGNED (executive.signatures responsibility_matrix).
 *   THE PLATFORM SIDE (ES-04-001/-002, ES-11-001/-002/-005, DP-01-001/-002/-005/-006): the DAT capability inventory imported READ-ONLY from
 *     audit/requirements/v07.csv, reconciled against the database, admitted; component ownership by TRANSFER (proposed → accepted by the
 *     receiving owner → ratified and SIGNED — governance.signatures ownership_transfer); the components reconciled; the OWNED-CONTRACT LINT
 *     over this API's own routes (ES-11-002).
 *   THE CARRIED B90 RESIDUALS: the lineage-retirement port (DP-49-006) — the trust-and-hold stop of new consumption lives in the re-declared
 *     B90 ports themselves (DP-49-005).
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (this code + phase6-ownership-b107); DEMONSTRATED OPERATION (the act on SYNTHETIC NORDWERK
 * personas — every evidence record `claim = 'demonstration'`); REAL ACCEPTANCE / PRODUCTION ADMISSION (R1/R2/H2) — never claimed.
 */
import { HttpException, Injectable, Logger, RequestMethod, type OnModuleInit } from '@nestjs/common';
import { ModuleRef, ModulesContainer } from '@nestjs/core';
import type { Envelope } from '@eye/contracts';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { PdpService } from '../../policy/pdp.service.js';
import { AttentionTickRegistry, type AttentionTickContext } from '../../executive/attention/tick.js';
import { WorkflowTimerRegistry } from '../../executive/workflow/timers.js';
import { SignatureService, type SignatureSubjectKind } from '../../executive/signatures/signature.service.js';
import { BOUNDARY, derive, domainRoute, platformRoute, receipt, refuseGovernance, type GovernanceNoun } from '../seams.js';
import { OwnershipCap, type OwnershipCapability } from './ownership.capabilities.js';
import { DAT_REALIZATIONS, lintOwnedRoutes, parseDatRows, type Route } from './ownership-logic.js';
import { PlatformSigner } from './platform-signer.js';

type Row = Record<string, unknown>;
/** Nest's route metadata keys (@nestjs/common constants PATH_METADATA / METHOD_METADATA). */
const PATH_METADATA = 'path';
const METHOD_METADATA = 'method';
export const READ = 'governance.ownership.read';
export const OWNERSHIP_STEP = 'governance-ownership';
export const OWNERSHIP_ORDER = 87;
export const STEWARDSHIP_STEP = 'governance-stewardship-sla';
export const STEWARDSHIP_ORDER = 88;
export const SLA_TIMER = 'stewardship.sla';
export const DR_BOUNDARY = `${BOUNDARY} §DR: a ratified authority, a ratified transfer and an attested evidence record are construction / demonstration records; production admission and continued operation (DP-01-006, DP-04-006, DP-55-006) are R1 and never claimed; a platform operator inspects customer content only under an approved support purpose (B94's support grant — PER-19).`;
const textOf = (e: unknown): string => (e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : (e instanceof Error ? e.message : String(e)));

/** The build identity an evidence record is bound to (the database adds the migration head): the head SHA from the environment (never
 *  inferred — `unbound` when the deployment names none), the policy bundle version the PDP evaluates with. */
let bundle: string | null = null;
export function buildIdentity(): Row {
  bundle ??= new PdpService().bundleVersion;
  const sha = process.env['EYE_HEAD_SHA'] ?? process.env['EYE_BUILD_SHA'] ?? null;
  return { head_sha: sha !== null && /^[0-9a-f]{7,40}$/.test(sha) ? sha : 'unbound (no EYE_HEAD_SHA in this deployment)', policy_bundle_version: bundle };
}

/** Where the requirement register lives (read-only): EYE_REPO_ROOT, or the nearest ancestor of the working directory holding it. */
export function requirementFile(name: string): string | null {
  const rel = join('audit', 'requirements', name);
  const fromEnv = process.env['EYE_REPO_ROOT'];
  if (fromEnv !== undefined && existsSync(join(fromEnv, rel))) return join(fromEnv, rel);
  let dir = resolve(process.cwd());
  for (let i = 0; i < 8; i++) {
    if (existsSync(join(dir, rel))) return join(dir, rel);
    const up = dirname(dir); if (up === dir) break; dir = up;
  }
  return null;
}

@Injectable()
export class OwnershipService implements OnModuleInit {
  private readonly log = new Logger('governance.ownership');
  readonly platformSigner = new PlatformSigner();
  readonly signer = new SignatureService();
  constructor(private readonly moduleRef: ModuleRef, private readonly pipeline: PipelineService, private readonly modules: ModulesContainer) {}

  onModuleInit(): void {
    let ticks: AttentionTickRegistry | null = null; let timers: WorkflowTimerRegistry | null = null;
    try { ticks = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { ticks = null; }
    try { timers = this.moduleRef.get(WorkflowTimerRegistry, { strict: false }); } catch { timers = null; }
    if (timers !== null) {
      // the SLA timer of ONE case, fired by the tick's workflow-timers step (inside the tick's write, under executive.attention.tick)
      timers.register({ kind: SLA_TIMER, handle: async (c, t) => OwnershipCap(c.tx, 'executive.attention.tick').sweepCases({ t: c.tenantId, d: c.domainId, caseId: t.owner_id, actor: c.agentPrincipalId, correlationId: c.correlationId }) });
    } else this.log.warn('no workflow timer registry in this application: stewardship.sla timers are not fired (the sweep still escalates)');
    if (ticks === null) { this.log.warn('no attention tick registry in this application: ownership is not reconciled and stewardship cases are not swept by the tick'); return; }
    ticks.register({ name: OWNERSHIP_STEP, order: OWNERSHIP_ORDER, run: async (c) => this.tickOwnership(c) });
    ticks.register({ name: STEWARDSHIP_STEP, order: STEWARDSHIP_ORDER, run: async (c) => OwnershipCap(c.tx, 'executive.attention.tick').sweepCases({ t: c.tenantId, d: c.domainId, caseId: null, actor: c.agentPrincipalId, correlationId: c.correlationId }) });
  }

  /** THE TICK STEP: only a REGISTERED domain (a ratified registry entry) is reconciled by the tick (a steward reconciles any domain); then the
   *  products the reconciliation names are DEGRADED with their declared cause (DP-41-005) — each its own statement, after the reconciliation. */
  async tickOwnership(c: AttentionTickContext): Promise<Row> {
    const cap = OwnershipCap(c.tx, 'executive.attention.tick');
    const look = await cap.reconcileDue(c.tenantId, c.domainId);
    if (look['registered'] !== true) return { skipped: 'the domain has no ratified registry entry (DAT-GV-02): a steward reconciles it on demand' };
    const r = await cap.reconcileDomain({ runId: newId(), t: c.tenantId, d: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId });
    const degraded: Row[] = [];
    for (const p of ((r['degrade'] ?? []) as Row[])) {
      const d = await cap.degradeProduct({ productId: String(p['product_id']), t: c.tenantId, d: c.domainId, reason: String(p['reason']), actor: c.agentPrincipalId, eventId: newId(), correlationId: c.correlationId });
      degraded.push({ product_id: p['product_id'], product_key: p['product_key'], cause: p['cause'], notified: Array.isArray(d['notified']) ? (d['notified'] as unknown[]).length : 0 });
    }
    return { mode: r['mode'], opened: (r['opened'] as unknown[]).length, reopened: (r['reopened'] as unknown[]).length, resolved: (r['resolved'] as unknown[]).length,
             escalated: (r['escalated'] as unknown[]).length, open: r['open'], degraded };
  }

  // ───────────────────────── the pipeline idiom ─────────────────────────
  private read<T>(env: Envelope, p: AuthenticatedPrincipal, scope: { t: string; d: string } | null, action: string, objectType: string | null, objectId: string | null, fn: (cap: OwnershipCapability) => Promise<T>) {
    const route = scope === null ? platformRoute(action, objectType, objectId) : domainRoute(scope.t, scope.d, action, objectType, objectId);
    return this.pipeline.consequentialRead(derive(env, action, objectType, objectId), p, route, OwnershipCap, async (cap) => fn(cap));
  }
  private write<T>(env: Envelope, p: AuthenticatedPrincipal, scope: { t: string; d: string } | null, action: string, objectType: string | null, objectId: string | null,
                   fn: (cap: OwnershipCapability) => Promise<{ result: T; evidence?: { outcome: 'success' | 'failure'; resultCode: string; metadata?: Row } }>) {
    const route = scope === null ? platformRoute(action, objectType, objectId) : domainRoute(scope.t, scope.d, action, objectType, objectId);
    return this.pipeline.write(derive(env, action, objectType, objectId), p, route, OwnershipCap, async (cap) => {
      const r = await fn(cap);
      return { result: r.result, targetType: objectType, targetId: objectId, targetVersion: null, outboxEvent: null, ...(r.evidence === undefined ? {} : { evidence: r.evidence }) };
    });
  }
  private notFound(noun: GovernanceNoun, cls: string, what: string, cid: string): never { throw refuseGovernance(noun, cls, what, cid, 404); }

  // ───────────────────────── DOMAIN: the portal and the reads ─────────────────────────
  /** THE RESPONSIBILITY PORTAL (DAT-GV-10): the customer's and the platform's duties, approvals, evidence, escalations; the cases, the gaps,
   *  the domain's registry entry and its ledger — one audited read. */
  async portal(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, profile: string) {
    const out = await this.read(env, p, { t, d }, READ, 'GDR', null, async (cap) => ({
      portal: await cap.portal(t, d, profile), cases: await cap.cases(200), gaps: await cap.gaps(200), domain_entries: await cap.domainEntries(d), evidence: await cap.evidence(20),
      ledger: await cap.ledger(null, 60), read_at: await cap.now(),
    }));
    return { ...out.result, boundary: DR_BOUNDARY, receipt: receipt(out) };
  }
  /** THE OWNERSHIP SERVICE (DAT-GV-04): one asset's duties resolved live, its versions, holds and ledger. */
  async resolve(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, assetId: string) {
    const out = await this.read(env, p, { t, d }, READ, 'GDA', assetId, async (cap) => {
      const r = await cap.resolve(t, d, assetId);
      return r === null ? null : { resolution: r, versions: await cap.authorityVersions(assetId), holds: await cap.holdsOf(assetId), ledger: await cap.ledger(assetId, 50), read_at: await cap.now() };
    });
    if (out.result === null) this.notFound('data authority', 'unknown_asset', `${assetId} is not a catalog asset of this domain`, env.correlation_id);
    return { ...out.result, boundary: DR_BOUNDARY, receipt: receipt(out) };
  }
  /** THE DATA PRODUCT REGISTRY VIEW (DAT-GV-03). */
  async products(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.read(env, p, { t, d }, READ, 'PDP', null, async (cap) => ({ products: await cap.products(t, d), read_at: await cap.now() }));
    return { ...out.result, receipt: receipt(out) };
  }
  /** A case's approval preview: the case, its digest, the review rule, and the CALLER's eligibility in words (the port decides; this explains). */
  async casePreview(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string) {
    const out = await this.read(env, p, { t, d }, READ, 'STW', caseId, async (cap) => {
      const c = await cap.case(caseId);
      if (c === null) return null;
      const kind = String(c['kind']);
      const roles = kind === 'access' || kind === 'classification' ? ['data_steward', 'domain_admin', 'privacy_officer'] : ['data_steward', 'domain_admin'];
      const reasons: string[] = [];
      if (p.kind !== 'human') reasons.push('a named human decides a stewardship case');
      if (!(await cap.holdsRole(p.principalId, t, d, roles))) reasons.push(`you hold none of ${roles.join(', ')} here`);
      if (p.principalId === c['opened_by']) reasons.push('the one who opened a case never reviews it');
      if ((kind === 'access' || kind === 'data_exception') && p.principalId === c['owner_principal_id']) reasons.push('the subject\'s owner never decides an access or exception case on its own data');
      if (((c['reviews'] ?? []) as Row[]).some((r) => r['reviewer'] === p.principalId)) reasons.push('you have reviewed this case already');
      if (c['owner_principal_id'] === null) reasons.push('HELD: the case lacks an accountable owner — it can be rejected, not approved');
      if (!['open', 'in_review'].includes(String(c['state']))) reasons.push(`the case is ${String(c['state'])}`);
      return { case: c, eligibility: { can_review: reasons.length === 0 || (reasons.length === 1 && reasons[0]!.startsWith('HELD')), reasons }, holds: await cap.holdsOf(String(c['subject_id'])), read_at: await cap.now() };
    });
    if (out.result === null) this.notFound('stewardship case', 'unknown_case', `${caseId} is not a stewardship case of this domain`, env.correlation_id);
    return { ...out.result, receipt: receipt(out) };
  }

  // ───────────────────────── DOMAIN: the authority registry ─────────────────────────
  async proposeAuthority(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { assetId: string; expected: number; duties: Row }) {
    const out = await this.write(env, p, { t, d }, 'governance.ownership.authority.propose', 'GDA', b.assetId, async (cap) => ({
      result: await cap.proposeAuthority({ authorityId: b.assetId, t, d, expected: b.expected, duties: b.duties, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { authority: out.result, receipt: receipt(out) };
  }
  async acceptAuthority(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, assetId: string, b: { version: number; digest: string }) {
    const out = await this.write(env, p, { t, d }, 'governance.ownership.authority.accept', 'GDA', assetId, async (cap) => ({
      result: await cap.acceptAuthority({ authorityId: assetId, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { authority: out.result, receipt: receipt(out) };
  }
  async decideAuthority(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, assetId: string, b: { version: number; digest: string; decision: string; reason: string }) {
    const out = await this.write(env, p, { t, d }, 'governance.ownership.authority.ratify', 'GDA', assetId, async (cap) => ({
      result: await cap.decideAuthority({ authorityId: assetId, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { authority: out.result, receipt: receipt(out) };
  }
  async recertifyAuthority(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, assetId: string) {
    const out = await this.write(env, p, { t, d }, 'governance.ownership.authority.recertify', 'GDA', assetId, async (cap) => ({
      result: await cap.recertifyAuthority({ authorityId: assetId, t, d, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { authority: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── DOMAIN: the domain registry ─────────────────────────
  async proposeDomain(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { expected: number; leader: string; boundary: string; contract: Row }) {
    const out = await this.write(env, p, { t, d }, 'governance.ownership.domain.propose', 'GDM', d, async (cap) => ({
      result: await cap.proposeDomain({ t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { entry: out.result, receipt: receipt(out) };
  }
  async decideDomain(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { version: number; digest: string; decision: string; reason: string }) {
    const out = await this.write(env, p, { t, d }, 'governance.ownership.domain.ratify', 'GDM', d, async (cap) => ({
      result: await cap.decideDomain({ t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { entry: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── DOMAIN: reconciliation and the gap register ─────────────────────────
  async reconcile(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.write(env, p, { t, d }, 'governance.ownership.reconcile', 'GDR', null, async (cap) => ({
      result: await cap.reconcileDomain({ runId: newId(), t, d, actor: p.principalId, correlationId: env.correlation_id }) }));
    // DP-41-005: the products named are degraded by the TICK (the product's own declaration, `by` its cause), never by this steward's act
    return { reconciliation: { ...out.result, degrade_note: 'the products listed under degrade are degraded by the next attention tick of a registered domain, with their cause' }, receipt: receipt(out) };
  }
  async acceptGap(env: Envelope, p: AuthenticatedPrincipal, scope: { t: string; d: string } | null, gapId: string, b: { until: string; reason: string }) {
    const action = scope === null ? 'governance.ownership.platform_gap.accept' : 'governance.ownership.gap.accept';
    const out = await this.write(env, p, scope, action, 'GOG', gapId, async (cap) => ({
      result: await cap.acceptGap({ gapId, t: scope?.t ?? null, d: scope?.d ?? null, ...b, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { gap: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── DOMAIN: stewardship cases ─────────────────────────
  async openCase(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { kind: string; subjectKind: string; subjectId: string; title: string; action: string; evidence: unknown[]; consequence: string }) {
    const caseId = newId();
    const out = await this.write(env, p, { t, d }, 'governance.ownership.case.open', 'STW', caseId, async (cap) => ({
      result: await cap.openCase({ caseId, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { case: out.result, receipt: receipt(out) };
  }
  async reviewCase(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string, b: { digest: string; outcome: string; note: string; conditions: string[] | null; expiresAt: string | null }) {
    const out = await this.write(env, p, { t, d }, 'governance.ownership.case.review', 'STW', caseId, async (cap) => ({
      result: await cap.reviewCase({ caseId, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { case: out.result, receipt: receipt(out) };
  }
  async closeCase(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string, b: { note: string; evidence: unknown[] }) {
    const out = await this.write(env, p, { t, d }, 'governance.ownership.case.close', 'STW', caseId, async (cap) => ({
      result: await cap.closeCase({ caseId, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { case: out.result, receipt: receipt(out) };
  }
  async withdrawCase(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, caseId: string, reason: string) {
    const out = await this.write(env, p, { t, d }, 'governance.ownership.case.withdraw', 'STW', caseId, async (cap) => ({
      result: await cap.withdrawCase({ caseId, t, d, reason, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { case: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── DOMAIN: the responsibility evidence record ─────────────────────────
  async assembleEvidence(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { profile: string; from: string; to: string }) {
    const recordId = newId();
    const out = await this.write(env, p, { t, d }, 'governance.ownership.evidence.assemble', 'GRE', recordId, async (cap) => ({
      result: await cap.assembleEvidence({ recordId, t, d, ...b, bound: buildIdentity(), actor: p.principalId, correlationId: env.correlation_id }) }));
    return { record: out.result, receipt: receipt(out) };
  }
  /** ATTEST: signed first (executive.signatures `responsibility_matrix` over the record's digest — the record IS the matrix's evidence), then
   *  the port verifies the signature and attests; REJECT is unsigned. */
  async attestEvidence(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, recordId: string, b: { digest: string; decision: string; reason: string }) {
    const action = 'governance.ownership.evidence.attest';
    const out = await this.write(env, p, { t, d }, action, 'GRE', recordId, async (cap) => {
      let signatureId: string | null = null;
      if (b.decision === 'attest') {
        const r = await cap.evidenceRecord(recordId);
        if (r !== null && r['state'] === 'assembled' && r['digest'] === b.digest && r['assembled_by'] !== p.principalId) {
          const s = await this.signer.sign(cap, { tenantId: t, domainId: d, action, kind: 'responsibility_matrix' as SignatureSubjectKind, subjectId: recordId, subjectVersion: 1, subjectDigest: b.digest,
                                                  actor: p.principalId, correlationId: env.correlation_id });
          signatureId = String(s['signature_id'] ?? '') || null;
        }
      }
      return { result: await cap.attestEvidence({ recordId, t, d, ...b, signatureId, actor: p.principalId, correlationId: env.correlation_id }) };
    });
    return { record: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── DOMAIN: the carried B90 residual (DP-49-006) ─────────────────────────
  async retireLineage(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, edgeId: string, b: { reason: string; evidence: Row | null }) {
    const out = await this.write(env, p, { t, d }, 'products.catalog.lineage.retire', 'KLE', edgeId, async (cap) => ({
      result: await cap.retireLineage({ edgeId, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { edge: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── PLATFORM: the registry read ─────────────────────────
  async platform(env: Envelope, p: AuthenticatedPrincipal) {
    const out = await this.read(env, p, null, READ, 'GCO', null, async (cap) => ({
      capabilities: await cap.capabilities(), components: await cap.components(), transfers: await cap.transfers(100), gaps: await cap.platformGaps(200), read_at: await cap.now(),
    }));
    return { ...out.result, signer: this.platformSigner.publicKeyId(), boundary: DR_BOUNDARY, receipt: receipt(out) };
  }
  /** A transfer's preview: the transfer, its signatures, and the CALLER's eligibility in words. */
  async transferPreview(env: Envelope, p: AuthenticatedPrincipal, transferId: string) {
    const out = await this.read(env, p, null, READ, 'GCT', transferId, async (cap) => {
      const tr = await cap.transfer(transferId);
      if (tr === null) return null;
      const to = String(((tr['proposal'] ?? {}) as Row)['accountable'] ?? '');
      const reasons: string[] = [];
      if (p.kind !== 'human') reasons.push('a named human ratifies an ownership transfer');
      if (!(await cap.holdsRole(p.principalId, null, null, ['product_authority', 'operations_authority']))) reasons.push('you hold neither product_authority nor operations_authority');
      if (p.principalId === tr['proposed_by']) reasons.push('the proposer never ratifies');
      if (p.principalId === tr['from_accountable'] || p.principalId === to) reasons.push('a party of the transfer (the outgoing or the receiving owner) never ratifies it');
      if (tr['state'] !== 'accepted') reasons.push(tr['state'] === 'proposed' ? 'the receiving owner has not accepted it yet' : `the transfer is ${String(tr['state'])}`);
      return { transfer: tr, signatures: await cap.platformSignatures(transferId), eligibility: { can_ratify: reasons.length === 0, can_accept: p.principalId === to && tr['state'] === 'proposed', reasons }, read_at: await cap.now() };
    });
    if (out.result === null) this.notFound('ownership record', 'unknown_transfer', `${transferId} is not a transfer`, env.correlation_id);
    return { ...out.result, receipt: receipt(out) };
  }
  /** ES-11-002 — THE OWNED-CONTRACT LINT over THIS API's routes (read from the Nest container) against the ratified owned contracts that are
   *  route prefixes: every route under no owner's contract is listed (a convenience endpoint outside every owner), never hidden. */
  async lint(env: Envelope, p: AuthenticatedPrincipal) {
    const out = await this.read(env, p, null, READ, 'GCO', null, async (cap) => ({ owners: await cap.ownedContracts(), read_at: await cap.now() }));
    const routes = this.routes();
    const result = lintOwnedRoutes(routes, out.result.owners);
    return { lint: { ...result, unowned_count: result.unowned.length, unowned: result.unowned.slice(0, 500) }, owners: out.result.owners.length, read_at: out.result.read_at, receipt: receipt(out) };
  }
  /** Every HTTP route this application serves (method + path), read from the controllers' Nest metadata. */
  routes(): Route[] {
    const out: Route[] = [];
    for (const mod of this.modules.values()) {
      for (const wrapper of mod.controllers.values()) {
        const cls = wrapper.metatype as (new (...a: unknown[]) => unknown) | null;
        if (cls === null || cls === undefined || typeof cls !== 'function') continue;
        const base = Reflect.getMetadata(PATH_METADATA, cls) as string | string[] | undefined;
        const bases = Array.isArray(base) ? base : [base ?? ''];
        for (const name of Object.getOwnPropertyNames(cls.prototype)) {
          if (name === 'constructor') continue;
          const fn = (cls.prototype as Record<string, unknown>)[name];
          if (typeof fn !== 'function') continue;
          const path = Reflect.getMetadata(PATH_METADATA, fn) as string | string[] | undefined;
          const method = Reflect.getMetadata(METHOD_METADATA, fn) as number | undefined;
          if (path === undefined || method === undefined) continue;
          for (const b of bases) for (const pth of Array.isArray(path) ? path : [path]) out.push({ method: RequestMethod[method] ?? String(method), path: `${b}/${pth}` });
        }
      }
    }
    return out;
  }

  // ───────────────────────── PLATFORM: the data capability inventory ─────────────────────────
  /** THE IMPORT (the conformance steward): the DAT rows of audit/requirements/v07.csv READ (never written; its digest recorded on every
   *  declaration), filtered by a key prefix; each declared through the port — idempotent (an unchanged row answers `unchanged`). The DAT-GV
   *  capabilities this build implements carry their realization (and the owner named here); the others are declared `planned`. */
  async importCapabilities(env: Envelope, p: AuthenticatedPrincipal, b: { prefix: string; owner: string | null; ownerRole: string | null }) {
    const file = requirementFile('v07.csv');
    if (file === null) throw refuseGovernance('data authority', 'source', 'the requirement register (audit/requirements/v07.csv) is not readable from this deployment (set EYE_REPO_ROOT)', env.correlation_id);
    const text = readFileSync(file, 'utf8');
    const digest = createHash('sha256').update(text).digest('hex');
    const rows = parseDatRows(text).filter((r) => r.key.startsWith(b.prefix));
    if (rows.length === 0) throw refuseGovernance('data authority', 'prefix', `no DAT row of v07.csv starts with ${b.prefix}`, env.correlation_id);
    const out = await this.write(env, p, null, 'governance.ownership.capability.declare', 'GDC', null, async (cap) => {
      const declared: Row[] = [];
      for (const r of rows) {
        const real = DAT_REALIZATIONS[r.key];
        const cur = await cap.capabilityByKey(r.key);
        const x = await cap.declareCapability({ capabilityId: cur === null ? null : String(cur['capability_id']), key: r.key, title: r.name, group: r.group, layer: r.layer, authorityClass: r.authorityClass,
          purpose: r.purpose || null, lifecycle: real === undefined ? 'planned' : 'implemented', deploymentScope: 'DOMAIN', owner: real === undefined ? null : b.owner, ownerRole: real === undefined ? null : b.ownerRole,
          realization: real === undefined ? { schemas: [], relations: [], functions: [] } : { ...real }, source: { file: 'audit/requirements/v07.csv', digest, row: r.row, read_only: true },
          expected: cur === null ? 0 : Number(cur['version']), actor: p.principalId, correlationId: env.correlation_id });
        declared.push({ key: r.key, version: x['version'], unchanged: x['unchanged'], lifecycle: x['lifecycle'] });
      }
      return { result: { file: 'audit/requirements/v07.csv', digest, rows: rows.length, declared, changed: declared.filter((x) => x['unchanged'] !== true).length } };
    });
    return { import: out.result, receipt: receipt(out) };
  }
  async reconcileCapability(env: Envelope, p: AuthenticatedPrincipal, capabilityId: string) {
    const out = await this.write(env, p, null, 'governance.ownership.capability.reconcile', 'GDC', capabilityId, async (cap) => ({
      result: await cap.reconcileCapability({ capabilityId, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { capability: out.result, receipt: receipt(out) };
  }
  async acceptCapability(env: Envelope, p: AuthenticatedPrincipal, capabilityId: string, b: { version: number; digest: string }) {
    const out = await this.write(env, p, null, 'governance.ownership.capability.accept', 'GDC', capabilityId, async (cap) => ({
      result: await cap.acceptCapability({ capabilityId, ...b, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { capability: out.result, receipt: receipt(out) };
  }
  async admitCapability(env: Envelope, p: AuthenticatedPrincipal, capabilityId: string, b: { version: number; digest: string; reason: string }) {
    const out = await this.write(env, p, null, 'governance.ownership.capability.admit', 'GDC', capabilityId, async (cap) => ({
      result: await cap.admitCapability({ capabilityId, ...b, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { capability: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── PLATFORM: component ownership ─────────────────────────
  async proposeTransfer(env: Envelope, p: AuthenticatedPrincipal, b: { componentId: string; expected: number; proposal: Row; checklist: Row }) {
    const transferId = newId();
    const out = await this.write(env, p, null, 'governance.ownership.component.propose', 'GCT', transferId, async (cap) => ({
      result: await cap.proposeTransfer({ transferId, ...b, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { transfer: out.result, receipt: receipt(out) };
  }
  async acceptTransfer(env: Envelope, p: AuthenticatedPrincipal, transferId: string, digest: string) {
    const out = await this.write(env, p, null, 'governance.ownership.component.accept', 'GCT', transferId, async (cap) => ({
      result: await cap.acceptTransfer({ transferId, digest, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { transfer: out.result, receipt: receipt(out) };
  }
  /** RATIFY (signed first — the PLATFORM signer, governance.signatures `ownership_transfer` over the transfer's digest; the port verifies it)
   *  or REJECT (unsigned). The signature is written only when the transfer stands accepted on the very digest decided. */
  async decideTransfer(env: Envelope, p: AuthenticatedPrincipal, transferId: string, b: { digest: string; decision: string; reason: string }) {
    const action = 'governance.ownership.component.ratify';
    const out = await this.write(env, p, null, action, 'GCT', transferId, async (cap) => {
      let signatureId: string | null = null;
      if (b.decision === 'ratify') {
        const tr = await cap.transfer(transferId);
        if (tr !== null && tr['state'] === 'accepted' && tr['digest'] === b.digest && tr['proposed_by'] !== p.principalId) {
          const s = await this.platformSigner.sign(cap, { action, kind: 'ownership_transfer', subjectId: transferId, subjectVersion: 1, subjectDigest: b.digest, actor: p.principalId, correlationId: env.correlation_id });
          signatureId = String(s['signature_id'] ?? '') || null;
        }
      }
      return { result: await cap.decideTransfer({ transferId, ...b, signatureId, actor: p.principalId, correlationId: env.correlation_id }) };
    });
    return { transfer: out.result, receipt: receipt(out) };
  }
  async withdrawTransfer(env: Envelope, p: AuthenticatedPrincipal, transferId: string, reason: string) {
    const out = await this.write(env, p, null, 'governance.ownership.component.withdraw', 'GCT', transferId, async (cap) => ({
      result: await cap.withdrawTransfer({ transferId, reason, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { transfer: out.result, receipt: receipt(out) };
  }
  async reconcileComponents(env: Envelope, p: AuthenticatedPrincipal) {
    const out = await this.write(env, p, null, 'governance.ownership.component.reconcile', 'GCO', null, async (cap) => ({
      result: await cap.reconcileComponents({ runId: newId(), actor: p.principalId, correlationId: env.correlation_id }) }));
    return { reconciliation: out.result, receipt: receipt(out) };
  }
  /** A recorded PLATFORM signature verified against the bound key. */
  verifyPlatformSignature(row: { key_id: string; signature: string; subject_digest: string }): boolean { return this.platformSigner.verify(row); }
  describeError(e: unknown): string { return textOf(e); }
}
