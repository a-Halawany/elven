/**
 * B107 §PG (0115_b107_x_pg) — THE PRODUCT-GOVERNANCE WORKSPACE: the orchestration the ports do not do (CAP-AU-12, PR-72-001).
 *
 *   THE HOME READ (governance.read, audited): the baseline and its inventory (owners, boundaries, orphans, duplicates, lapses), the decision
 *     rights, THE ONE exception registry with its ageing and repeat reviews — beside the READ-ONLY engineering (EXCEPTIONS.md) and supply-chain
 *     (C15 SCX) registers, expired entries REPORTED —, the conflicts, the change proposals with their impact, the governance records, the
 *     posture and its snapshots, the holds and the release candidates they hold, the ledger;
 *   THE PREVIEW (governance.read): an approval's exact digest, the caller's eligibility in words and the consequence — the port decides;
 *   THE ACTS (PLATFORM, each its own exact action): owners, rights, baseline, exceptions (propose / renew / decide / withdraw / close /
 *     sweep), remediation reviews, conflicts, change proposals, records, the posture snapshot. Every approval that the rows call a signature
 *     (baseline_decision, decision_rights, exception_approval, change_approval, conflict_resolution) is SIGNED FIRST through the shared
 *     platform signer — only for the version's own digest, only by a named human holding the role — and the port then verifies the row;
 *   THE EXPIRY in three places: every read and check on the database clock (an approved exception past expiry is never shown in force), the
 *     ATTENTION-TICK STEP `governance-exception-expiry` (every ticking domain: the PLATFORM rows through the definer port under the tick's own
 *     action, and a `governance.exception` item in a domain the exception's customer scope covers), and the steward's PLATFORM sweep route.
 *     (The `exception.expiry` WORKFLOW TIMER is not scheduled: executive.workflow_timers is DOMAIN-only with a closed owner list — a PLATFORM
 *     exception has no domain row to own one. Reported to the integrator.)
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (this code + phase6-workspace-b107); DEMONSTRATED OPERATION (the act — SYNTHETIC personas, every
 * record `claim = demonstration`); REAL ACCEPTANCE (named product owners, independent release authorities, executive attestation: H3 / R1) —
 * never claimed.
 */
import { Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { AttentionTickRegistry } from '../../executive/attention/tick.js';
import { BOUNDARY, governedRead, governedWrite, platformRoute, receipt, refuseGovernance, type GovernanceNoun } from '../seams.js';
import { WorkspaceCap, type WorkspaceCapability } from './workspace.capabilities.js';
import { PlatformSigner, type PlatformSignatureKind } from './platform-signing.js';
import { readRepositoryRegisters } from './repository-registers.js';
import { eligibility } from './workspace-logic.js';

type Row = Record<string, unknown>;
export const READ = 'governance.read';
export const EXPIRY_STEP = 'governance-exception-expiry';
export const WS_BOUNDARY = `${BOUNDARY} §PG: a signed baseline decision here is the executive baseline attestation of this CONSTRUCTION (a SYNTHETIC persona's key) — the real executive attestation and the independent release authorities are H3, production admission R1. EXCEPTIONS.md and the C15 SCX records are read only: expired entries are REPORTED, never renewed, closed or governed by the product (the owner's act).`;

@Injectable()
export class WorkspaceService implements OnModuleInit {
  private readonly log = new Logger('governance.workspace');
  readonly signer = new PlatformSigner();
  constructor(private readonly moduleRef: ModuleRef, private readonly pipeline: PipelineService) {}

  onModuleInit(): void {
    let ticks: AttentionTickRegistry | null = null;
    try { ticks = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { ticks = null; }
    if (ticks === null) { this.log.warn('no attention tick registry in this application: exceptions expire on the steward\'s sweep and at every read only'); return; }
    // inside the tick's write (bound to executive.attention.tick); nothing is written when nothing expired; the PLATFORM rows through the definer port
    ticks.register({ name: EXPIRY_STEP, order: 26, run: async (c) => WorkspaceCap(c.tx, 'executive.attention.tick')
      .sweep({ action: 'executive.attention.tick', t: c.tenantId, d: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId }) });
  }

  // ───────────────────────── the pipeline idiom ─────────────────────────
  private read<T>(env: Envelope, p: AuthenticatedPrincipal, objectType: string, objectId: string | null, fn: (cap: WorkspaceCapability) => Promise<T>) {
    return governedRead(this.pipeline, env, p, platformRoute(READ, objectType, objectId), WorkspaceCap, fn);
  }
  private write<T>(env: Envelope, p: AuthenticatedPrincipal, action: string, objectType: string, objectId: string | null, fn: (cap: WorkspaceCapability) => Promise<T>) {
    return governedWrite(this.pipeline, env, p, platformRoute(action, objectType, objectId), WorkspaceCap, async (cap) => ({ result: await fn(cap) }));
  }
  /** SIGN FIRST (only the version's own digest, only for a version still open, only by a named human holding one of the roles); otherwise no
   *  signature — and the port refuses in its own words (the approver test runs before the signature check). */
  private async signFirst(cap: WorkspaceCapability, p: AuthenticatedPrincipal, a: { action: string; kind: PlatformSignatureKind; id: string; version: number; digest: string;
                                                                                 shownDigest: string; open: boolean; roles: string[]; correlationId: string }): Promise<string | null> {
    if (!a.open || a.digest !== a.shownDigest) return null;
    if (!(await cap.isHuman(p.principalId))) return null;
    const held = await cap.platformRoles(p.principalId);
    const role = a.roles.find((r) => held.includes(r));
    if (role === undefined) return null;
    const s = await this.signer.sign(cap, { action: a.action, kind: a.kind, subjectId: a.id, subjectVersion: a.version, subjectDigest: a.digest, signerRole: role, actor: p.principalId, correlationId: a.correlationId });
    return String(s['signature_id'] ?? '') || null;
  }

  // ───────────────────────── THE HOME ─────────────────────────
  async home(env: Envelope, p: AuthenticatedPrincipal) {
    const out = await this.read(env, p, 'GWS', null, async (cap) => ({
      inventory: await cap.inventory(), owners: await cap.owners(), baselines: await cap.baselines(), rights: await cap.rights(),
      exceptions: await cap.exceptions(), ageing: await cap.ageing(), reviews: await cap.reviews(), conflicts: await cap.conflicts(), changes: await cap.changes(),
      records: await cap.records(), posture: await cap.posture(), snapshots: await cap.snapshots(), holds: await cap.holds(), release_candidates: await cap.releaseCandidates(),
      ledger: await cap.ledger(150), caller: { principal: p.principalId, roles: await cap.platformRoles(p.principalId), human: await cap.isHuman(p.principalId) }, read_at: await cap.now(),
    }));
    const registers = readRepositoryRegisters();
    return { ...out.result, repository_registers: registers,
             signer: this.signer.publicKey() === null ? { bound: false, note: `no executive signing key is bound (${this.signer.ref()}): every signed approval is refused` } : { bound: true, key_id: this.signer.publicKey()?.keyId },
             boundary: WS_BOUNDARY, receipt: receipt(out) };
  }

  /** THE IMPACT of changing artifacts (deterministic: the same live links, the same digest). */
  async impact(env: Envelope, p: AuthenticatedPrincipal, subjects: string[]) {
    const out = await this.read(env, p, 'GCP', null, async (cap) => {
      const impact = await cap.impact(subjects);
      return { impact, subjects: await cap.artifacts(subjects) };
    });
    return { ...out.result, receipt: receipt(out) };
  }

  /** THE PREVIEW of an approval: the exact version and digest, what the act does, and the caller's eligibility in words (the port decides). */
  async preview(env: Envelope, p: AuthenticatedPrincipal, kind: string, id: string, version: number) {
    const out = await this.read(env, p, 'GWS', id, async (cap) => {
      const roles = await cap.platformRoles(p.principalId); const human = await cap.isHuman(p.principalId); const callerKind = human ? 'human' : 'agent';
      if (kind === 'exception') {
        const e = await cap.exceptionVersion(id, version); if (e === null) return null;
        const held = e['open_review'] !== null ? [`the repeated exceptions against ${String(e['contract_key'])} are under remediation review ${String(e['open_review'])}`] : [];
        if (Date.parse(String(e['expires_at'])) <= Date.now()) held.push(`the window ended at ${String(e['expires_at'])}`);
        return { subject: e, digest: e['digest'], signature_kind: 'exception_approval',
                 consequence: e['renewal_of'] !== null ? `approving renews ${String(e['ref'])}: v${String(e['renewal_of'])} superseded; every hold its expiry opened is LIFTED (the affected promotion released)`
                                                      : `approving puts ${String(e['ref'])} in force until ${String(e['expires_at'])}; at expiry every affected artifact is HELD until a renewal with current evidence`,
                 eligibility: eligibility({ callerKind, caller: p.principalId, callerRoles: roles, requiredRoles: e['approver_roles'] as string[], proposer: String(e['proposed_by']),
                                             owner: String(e['owner_principal_id']), componentOwners: e['component_owners'] as string[], expands: e['expands_authority'] === true || e['removes_control'] === true,
                                             state: String(e['state']), openState: 'proposed', held, rights: await cap.rightsAllows('exception', 'approve', p.principalId) }) };
      }
      if (kind === 'change') {
        const c = await cap.changeVersion(id, version); if (c === null) return null;
        const open = (c['required_roles'] as string[]).filter((r) => !(c['approved_roles'] as string[]).includes(r));
        const held = (c['missing_plans'] as string[]).length > 0 ? [`plans missing: ${(c['missing_plans'] as string[]).join(', ')} (ES-72-003)`] : [];
        const now = await cap.impact(c['subjects'] as string[]);
        if (now['digest'] !== c['impact_digest']) held.push('the impact moved since the proposal — re-propose');
        if ((c['deciders'] as string[]).includes(p.principalId)) held.push('you have already decided this version');
        return { subject: c, digest: c['digest'], signature_kind: 'change_approval', awaiting: open,
                 consequence: open.length <= 1 ? 'approving APPROVES the change (the last required role)' : `approving records your role; still awaiting ${open.filter((r) => !roles.includes(r)).join(', ') || 'another role'}`,
                 eligibility: eligibility({ callerKind, caller: p.principalId, callerRoles: roles, requiredRoles: open.length > 0 ? open : (c['required_roles'] as string[]), proposer: String(c['proposed_by']),
                                             builders: c['builders'] as string[], state: String(c['state']), openState: 'proposed', held,
                                             // the chain: the product authority's step is the matrix's `change` approve row; independent assurance's its review row
                                             rights: await cap.rightsAllows('change', open.includes('product_authority') && roles.includes('product_authority') ? 'approve' : (roles.includes('independent_assurance') ? 'review' : 'approve'), p.principalId) }) };
      }
      if (kind === 'baseline') {
        const b = await cap.baselineVersion(id, version); if (b === null) return null;
        const held = ((b['gaps'] ?? []) as Row[]).map((g) => `authority unresolved — ${String(g['gap'])}`);
        return { subject: b, digest: b['digest'], signature_kind: 'baseline_decision',
                 consequence: `signing makes ${String(b['ref'])} v${String(b['version'])} THE controlled product baseline (${String(b['capabilities'])} capabilities), the previous signed baseline superseded — construction / demonstration only; the real executive attestation is H3`,
                 eligibility: eligibility({ callerKind, caller: p.principalId, callerRoles: roles, requiredRoles: ['product_authority'], proposer: String(b['proposed_by']), state: String(b['state']),
                                             openState: 'proposed', held, rights: await cap.rightsAllows('baseline', 'approve', p.principalId) }) };
      }
      if (kind === 'rights') {
        const r = await cap.rightsVersion(id, version); if (r === null) return null;
        return { subject: r, digest: r['digest'], signature_kind: 'decision_rights', consequence: 'approving puts this matrix in force: every governed approval is then checked against its approve rows (and live delegations)',
                 eligibility: eligibility({ callerKind, caller: p.principalId, callerRoles: roles, requiredRoles: ['product_authority'], proposer: String(r['proposed_by']), state: String(r['state']),
                                             openState: 'proposed', rights: await cap.rightsAllows('decision_rights', 'approve', p.principalId) }) };
      }
      if (kind === 'conflict') {
        const c = await cap.conflict(id); if (c === null) return null;
        return { subject: c, digest: c['digest'], signature_kind: 'conflict_resolution',
                 consequence: 'resolving closes the trace (the prevailing artifact governs every impacted one, supersedes the others) and LIFTS the release holds — closure keeps the highest authority; anything else is an amendment through an approved change proposal',
                 eligibility: eligibility({ callerKind, caller: p.principalId, callerRoles: roles, requiredRoles: ['product_authority'], proposer: String(c['raised_by']), state: String(c['state']),
                                             openState: 'open', rights: await cap.rightsAllows('conflict', 'approve', p.principalId) }) };
      }
      if (kind === 'record') {
        const r = await cap.recordVersion(id, version); if (r === null) return null;
        return { subject: r, digest: r['digest'], signature_kind: null, consequence: 'approving makes this version ACTIVE (a controlled amendment supersedes the active one); the review cadence starts',
                 eligibility: eligibility({ callerKind, caller: p.principalId, callerRoles: roles, requiredRoles: [String(r['approving_role'])], proposer: String(r['proposed_by']), owner: String(r['owner_principal_id']),
                                             state: String(r['state']), openState: 'proposed', rights: await cap.rightsAllows('record', 'approve', p.principalId) }) };
      }
      return null;
    });
    if (out.result === null) throw refuseGovernance(this.nounOf(kind), `unknown_${kind}`, `${id} v${version} is not a ${kind} of the registry`, env.correlation_id, 404);
    return { ...out.result, boundary: WS_BOUNDARY, receipt: receipt(out) };
  }
  private nounOf(kind: string): GovernanceNoun {
    return ({ exception: 'governance exception', change: 'change proposal', baseline: 'product baseline', rights: 'decision rights', conflict: 'conformance conflict', record: 'governance record' } as Record<string, GovernanceNoun>)[kind] ?? 'governance record';
  }

  // ───────────────────────── THE BASELINE ─────────────────────────
  async assignOwner(env: Envelope, p: AuthenticatedPrincipal, b: { capabilityId: string; owner: string; ownerRole: string; domainBoundary: string; reason: string }) {
    const out = await this.write(env, p, 'governance.baseline.owner.assign', 'CAP', b.capabilityId, (cap) => cap.assignOwner({ ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { owner: out.result, receipt: receipt(out) };
  }
  async proposeRights(env: Envelope, p: AuthenticatedPrincipal, b: { matrixId: string | null; rows: unknown[]; expectedVersion: number }) {
    const matrixId = b.matrixId ?? newId();
    const out = await this.write(env, p, 'governance.rights.propose', 'PDR', matrixId, (cap) => cap.proposeRights({ matrixId, rows: b.rows, expectedVersion: b.expectedVersion, actor: p.principalId, correlationId: env.correlation_id }));
    return { rights: out.result, receipt: receipt(out) };
  }
  async decideRights(env: Envelope, p: AuthenticatedPrincipal, matrixId: string, b: { version: number; decision: 'approve' | 'reject'; digest: string; reason: string }) {
    const action = 'governance.rights.decide';
    const out = await this.write(env, p, action, 'PDR', matrixId, async (cap) => {
      const v = b.decision === 'approve' ? await cap.rightsVersion(matrixId, b.version) : null;
      const sig = v === null ? null : await this.signFirst(cap, p, { action, kind: 'decision_rights', id: matrixId, version: b.version, digest: String(v['digest']), shownDigest: b.digest,
                                                                     open: v['state'] === 'proposed', roles: ['product_authority'], correlationId: env.correlation_id });
      return cap.decideRights({ matrixId, ...b, signatureId: sig, actor: p.principalId, correlationId: env.correlation_id });
    });
    return { rights: out.result, receipt: receipt(out) };
  }
  async proposeBaseline(env: Envelope, p: AuthenticatedPrincipal, b: { baselineId: string | null; title: string; scope: Row; expectedVersion: number }) {
    const baselineId = b.baselineId ?? newId();
    const out = await this.write(env, p, 'governance.baseline.propose', 'PBL', baselineId, (cap) => cap.proposeBaseline({ baselineId, title: b.title, scope: b.scope, expectedVersion: b.expectedVersion, actor: p.principalId, correlationId: env.correlation_id }));
    return { baseline: out.result, receipt: receipt(out) };
  }
  async decideBaseline(env: Envelope, p: AuthenticatedPrincipal, baselineId: string, b: { version: number; decision: 'sign' | 'reject'; digest: string; reason: string }) {
    const action = 'governance.baseline.decide';
    const out = await this.write(env, p, action, 'PBL', baselineId, async (cap) => {
      const v = b.decision === 'sign' ? await cap.baselineVersion(baselineId, b.version) : null;
      const sig = v === null || ((v['gaps'] ?? []) as unknown[]).length > 0 ? null
        : await this.signFirst(cap, p, { action, kind: 'baseline_decision', id: baselineId, version: b.version, digest: String(v['digest']), shownDigest: b.digest, open: v['state'] === 'proposed',
                                         roles: ['product_authority'], correlationId: env.correlation_id });
      return cap.decideBaseline({ baselineId, ...b, signatureId: sig, actor: p.principalId, correlationId: env.correlation_id });
    });
    return { baseline: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── THE EXCEPTION REGISTRY ─────────────────────────
  async proposeException(env: Envelope, p: AuthenticatedPrincipal, b: { exceptionId: string | null; body: Row; expectedVersion: number }) {
    const exceptionId = b.exceptionId ?? newId();
    const out = await this.write(env, p, 'governance.exception.propose', 'GEX', exceptionId, (cap) => cap.proposeException({ exceptionId, body: b.body, expectedVersion: b.expectedVersion, actor: p.principalId, correlationId: env.correlation_id }));
    return { exception: out.result, receipt: receipt(out) };
  }
  async decideException(env: Envelope, p: AuthenticatedPrincipal, exceptionId: string, b: { version: number; decision: 'approve' | 'reject'; digest: string; reason: string }) {
    const action = 'governance.exception.decide';
    const out = await this.write(env, p, action, 'GEX', exceptionId, async (cap) => {
      const v = b.decision === 'approve' ? await cap.exceptionVersion(exceptionId, b.version) : null;
      const sig = v === null || v['open_review'] !== null || Date.parse(String(v['expires_at'])) <= Date.now() ? null
        : await this.signFirst(cap, p, { action, kind: 'exception_approval', id: exceptionId, version: b.version, digest: String(v['digest']), shownDigest: b.digest, open: v['state'] === 'proposed',
                                         roles: v['approver_roles'] as string[], correlationId: env.correlation_id });
      return cap.decideException({ exceptionId, ...b, signatureId: sig, actor: p.principalId, correlationId: env.correlation_id });
    });
    return { exception: out.result, receipt: receipt(out) };
  }
  async withdrawException(env: Envelope, p: AuthenticatedPrincipal, exceptionId: string, b: { version: number; reason: string }) {
    const out = await this.write(env, p, 'governance.exception.withdraw', 'GEX', exceptionId, (cap) => cap.withdrawException({ exceptionId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { exception: out.result, receipt: receipt(out) };
  }
  async closeException(env: Envelope, p: AuthenticatedPrincipal, exceptionId: string, b: { version: number; evidence: unknown[]; reason: string }) {
    const out = await this.write(env, p, 'governance.exception.close', 'GEX', exceptionId, (cap) => cap.closeException({ exceptionId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { exception: out.result, receipt: receipt(out) };
  }
  /** The steward's PLATFORM sweep (the tick's step does the same in every ticking domain). */
  async sweep(env: Envelope, p: AuthenticatedPrincipal) {
    const out = await this.write(env, p, 'governance.exception.sweep', 'GEX', null, (cap) => cap.sweep({ action: 'governance.exception.sweep', t: null, d: null, actor: p.principalId, correlationId: env.correlation_id }));
    return { sweep: out.result, receipt: receipt(out) };
  }
  async decideReview(env: Envelope, p: AuthenticatedPrincipal, reviewId: string, b: { decision: string; body: Row; reason: string }) {
    const out = await this.write(env, p, 'governance.remediation.decide', 'GRR', reviewId, (cap) => cap.decideReview({ reviewId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { review: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── CONFLICTS ─────────────────────────
  async raiseConflict(env: Envelope, p: AuthenticatedPrincipal, body: Row) {
    const conflictId = newId();
    const out = await this.write(env, p, 'governance.conflict.raise', 'GCF', conflictId, (cap) => cap.raiseConflict({ conflictId, body, actor: p.principalId, correlationId: env.correlation_id }));
    return { conflict: out.result, receipt: receipt(out) };
  }
  async resolveConflict(env: Envelope, p: AuthenticatedPrincipal, conflictId: string, b: { body: Row; digest: string }) {
    const action = 'governance.conflict.resolve';
    const out = await this.write(env, p, action, 'GCF', conflictId, async (cap) => {
      const c = await cap.conflict(conflictId);
      const sig = c === null ? null : await this.signFirst(cap, p, { action, kind: 'conflict_resolution', id: conflictId, version: 1, digest: String(c['digest']), shownDigest: b.digest,
                                                                     open: c['state'] === 'open', roles: ['product_authority'], correlationId: env.correlation_id });
      return cap.resolveConflict({ conflictId, body: b.body, digest: b.digest, signatureId: sig, actor: p.principalId, correlationId: env.correlation_id });
    });
    return { conflict: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── CHANGE PROPOSALS ─────────────────────────
  async proposeChange(env: Envelope, p: AuthenticatedPrincipal, b: { proposalId: string | null; body: Row; expectedVersion: number }) {
    const proposalId = b.proposalId ?? newId();
    const out = await this.write(env, p, 'governance.change.propose', 'GCP', proposalId, (cap) => cap.proposeChange({ proposalId, body: b.body, expectedVersion: b.expectedVersion, actor: p.principalId, correlationId: env.correlation_id }));
    return { change: out.result, receipt: receipt(out) };
  }
  async decideChange(env: Envelope, p: AuthenticatedPrincipal, proposalId: string, b: { version: number; decision: 'approve' | 'reject'; digest: string; reason: string }) {
    const action = 'governance.change.decide';
    const out = await this.write(env, p, action, 'GCP', proposalId, async (cap) => {
      const v = b.decision === 'approve' ? await cap.changeVersion(proposalId, b.version) : null;
      let sig: string | null = null;
      if (v !== null && (v['missing_plans'] as string[]).length === 0 && !(v['deciders'] as string[]).includes(p.principalId)) {
        const open = (v['required_roles'] as string[]).filter((r) => !(v['approved_roles'] as string[]).includes(r));
        sig = await this.signFirst(cap, p, { action, kind: 'change_approval', id: proposalId, version: b.version, digest: String(v['digest']), shownDigest: b.digest, open: v['state'] === 'proposed',
                                             roles: open.length > 0 ? open : (v['required_roles'] as string[]), correlationId: env.correlation_id });
      }
      return cap.decideChange({ proposalId, ...b, signatureId: sig, actor: p.principalId, correlationId: env.correlation_id });
    });
    return { change: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── THE GOVERNANCE REGISTRY ─────────────────────────
  async proposeRecord(env: Envelope, p: AuthenticatedPrincipal, b: { recordId: string | null; body: Row; expectedVersion: number }) {
    const recordId = b.recordId ?? newId();
    const out = await this.write(env, p, 'governance.record.propose', 'GDR', recordId, (cap) => cap.proposeRecord({ recordId, body: b.body, expectedVersion: b.expectedVersion, actor: p.principalId, correlationId: env.correlation_id }));
    return { record: out.result, receipt: receipt(out) };
  }
  async decideRecord(env: Envelope, p: AuthenticatedPrincipal, recordId: string, b: { version: number; decision: 'approve' | 'reject'; digest: string; reason: string }) {
    const out = await this.write(env, p, 'governance.record.decide', 'GDR', recordId, (cap) => cap.decideRecord({ recordId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { record: out.result, receipt: receipt(out) };
  }
  async reviewRecord(env: Envelope, p: AuthenticatedPrincipal, recordId: string, b: { version: number; note: string }) {
    const out = await this.write(env, p, 'governance.record.review', 'GDR', recordId, (cap) => cap.reviewRecord({ recordId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { record: out.result, receipt: receipt(out) };
  }
  async closeRecord(env: Envelope, p: AuthenticatedPrincipal, recordId: string, b: { version: number; mode: string; evidence: unknown[]; successor: string | null; reason: string }) {
    const out = await this.write(env, p, 'governance.record.close', 'GDR', recordId, (cap) => cap.closeRecord({ recordId, ...b, actor: p.principalId, correlationId: env.correlation_id }));
    return { record: out.result, receipt: receipt(out) };
  }
  async recordPosture(env: Envelope, p: AuthenticatedPrincipal) {
    const out = await this.write(env, p, 'governance.posture.record', 'GPS', null, (cap) => cap.recordPosture({ actor: p.principalId, correlationId: env.correlation_id }));
    return { posture: out.result, receipt: receipt(out) };
  }

  /** A recorded platform signature verified against the bound key. */
  verifySignature(row: { key_id: string; signature: string; subject_digest: string }): boolean { return this.signer.verify(row); }
}
