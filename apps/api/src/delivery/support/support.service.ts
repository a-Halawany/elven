/**
 * B94 §SA (0114_b94_x_sa) — RESPONSIBILITY, OWNERSHIP AND SUPPORT ACCESS: the orchestration the ports do not do.
 *
 *   THE MATRIX (IA-04-001/-003): propose (the implementation lead or the domain admin) → decide (the onboarding authority, on the digest;
 *     APPROVE is SIGNED first — SignatureService, subject `responsibility_matrix` — then the port verifies the signature and approves);
 *   THE OWNER REGISTRY (IA-04-005): every row resolved LIVE (service.owner_resolution); RECONCILIATION (IA-04-002): the observation READ FIRST
 *     (its own governed read), the findings computed (support-logic.ts), then the write (recorded only on change; gaps raised / closed live);
 *     the after-tick hook `responsibility-reconcile` does the same for every ticking domain;
 *   SUPPORT ACCESS (PR-69-003, PER-20 — B34/B34-F's collaborator-grant pattern): request (the engineer) → decide (the accountable owner of
 *     support.access, a named human domain admin; HELD while that owner is not resolved — the hold's gap item commits, then 409) → the
 *     diagnostic reads (live grant FIRST, every attempt logged — a refusal's log row commits, then 403) → revoke / withdraw / the LAPSE in
 *     three layers: (1) the engineer's sessions revoked by the IDENTITY authority once the grant ended (the route, then the hook for what a
 *     failure left), (2) service.live_grant on the database clock in every port, (3) the `support_access.expiry` timer (WorkflowTimerRegistry,
 *     fired by the tick) and the sweep (the after-tick hook `support-access`);
 *   DRILLS, the JOINT EXERCISE and the ADMISSION RECORD (IA-04-006, CAP-TR-12) — the admission record SIGNED (`admission_record`).
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (this code + phase6-support-b94); DEMONSTRATED OPERATION (the act on SYNTHETIC NORDWERK personas and a
 * SYNTHETIC vendor engineer); PRODUCTION ADMISSION / REAL CUSTOMER ACCEPTANCE (R1/R2) — never claimed. IA-04-004 parity → B111.
 */
import { HttpException, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import type { Envelope } from '@eye/contracts';
import { sql } from 'kysely';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import type { Db, Tx } from '../../shared/db.js';
import { IDENTITY_DB } from '../../shared/shared.module.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { AttentionTickRegistry } from '../../executive/attention/tick.js';
import { WorkflowTimerRegistry } from '../../executive/workflow/timers.js';
import { SignatureService, type SignatureSubjectKind } from '../../executive/signatures/signature.service.js';
import { BOUNDARY, derive, domainRoute, receipt, refuseDelivery } from '../seams.js';
import { SupportCap, type SupportCapability } from './support.capabilities.js';
import { reconcileFindings } from './support-logic.js';

type Row = Record<string, unknown>;
export const READ = 'service.read';
export const SUPPORT_ACCESS_HOOK = 'support-access';
export const RECONCILE_HOOK = 'responsibility-reconcile';
export const EXPIRY_TIMER = 'support_access.expiry';
export const SA_BOUNDARY = `${BOUNDARY} §SA: an admission record signed here is construction evidence, never a production admission (R1); deployment-profile parity (IA-04-004) is B111; only local-dev is a real profile.`;
const textOf = (e: unknown): string => (e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : (e instanceof Error ? e.message : String(e)));

@Injectable()
export class SupportService implements OnModuleInit {
  private readonly log = new Logger('delivery.support');
  /** B94 §SA: the executive signer (stateless — the key by reference from the environment, as every B36 part signs). */
  readonly signer = new SignatureService();
  constructor(private readonly moduleRef: ModuleRef, private readonly pipeline: PipelineService, @Inject(IDENTITY_DB) private readonly identityDb: Db) {}

  onModuleInit(): void {
    let ticks: AttentionTickRegistry | null = null; let timers: WorkflowTimerRegistry | null = null;
    try { ticks = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { ticks = null; }
    try { timers = this.moduleRef.get(WorkflowTimerRegistry, { strict: false }); } catch { timers = null; }
    if (timers !== null) {
      // LAYER 3a: the expiry timer fired by the tick's workflow-timers step (inside the tick's write, under executive.attention.tick)
      timers.register({ kind: EXPIRY_TIMER, handle: async (c, t) => SupportCap(c.tx, 'executive.attention.tick').lapseByTimer({ timerId: t.timer_id, t: c.tenantId, d: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId }) });
    } else this.log.warn('no workflow timer registry in this application: support_access.expiry timers are not fired (the sweep still lapses)');
    if (ticks === null) { this.log.warn('no attention tick registry in this application: support grants are not swept and responsibility is not reconciled after the tick'); return; }
    ticks.registerAfter({ name: SUPPORT_ACCESS_HOOK, run: async (a) => this.afterTickSweep(a) });
    ticks.registerAfter({ name: RECONCILE_HOOK, run: async (a) => this.afterTickReconcile(a) });
  }

  // ───────────────────────── the pipeline idiom ─────────────────────────
  private read<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, objectType: string | null, objectId: string | null, fn: (cap: SupportCapability) => Promise<T>) {
    const route = domainRoute(t, d, action, objectType, objectId);
    return this.pipeline.consequentialRead(derive(env, action, objectType, objectId), p, route, SupportCap, async (cap) => fn(cap));
  }
  private write<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, objectType: string | null, objectId: string | null,
                   fn: (cap: SupportCapability) => Promise<{ result: T; evidence?: { outcome: 'success' | 'failure'; resultCode: string; metadata?: Row } }>) {
    const route = domainRoute(t, d, action, objectType, objectId);
    return this.pipeline.write(derive(env, action, objectType, objectId), p, route, SupportCap, async (cap) => {
      const r = await fn(cap);
      return { result: r.result, targetType: objectType, targetId: objectId, targetVersion: null, outboxEvent: null, ...(r.evidence === undefined ? {} : { evidence: r.evidence }) };
    });
  }
  /** A server-side envelope (the hooks): never client-supplied. */
  envelopeFor(principal: AuthenticatedPrincipal, t: string, d: string, action: string, objectType: string | null, objectId: string | null, correlationId: string): Envelope {
    return {
      message_id: newId(), scope: 'DOMAIN', tenant_id: t, domain_id: d, principal_id: `principal:${principal.principalId}`, purpose_id: 'service', action,
      side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C1', object_type: objectType, object_id: objectId,
      schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: correlationId, trace_id: 'delivery-support',
    } as unknown as Envelope;
  }
  private sign(cap: SupportCapability, a: { t: string; d: string; action: string; kind: string; id: string; version: number; digest: string; actor: string; correlationId: string }) {
    return this.signer.sign(cap, { tenantId: a.t, domainId: a.d, action: a.action, kind: a.kind as unknown as SignatureSubjectKind, subjectId: a.id, subjectVersion: a.version,
      subjectDigest: a.digest, actor: a.actor, correlationId: a.correlationId });
  }

  // ───────────────────────── THE CONTROL CENTER (CAP-TR-12) ─────────────────────────
  /** The customer control center's read: the matrices and their owners (gaps visible), the latest reconciliation, the grants (pending /
   *  live / ended), the access log, the drills, the joint exercises, the admission records, the open support/gap items, the residency, and
   *  where exports and signing keys are read (their own routes, read-only here). */
  async controlCenter(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, profile: string) {
    const out = await this.read(env, p, t, d, READ, 'RSM', null, async (cap) => {
      const matrices = await cap.matrices(null);
      const approved = matrices.find((m) => m['state'] === 'approved' && m['deployment_profile'] === profile) ?? null;
      const owners = approved === null ? [] : await Promise.all(((approved['rows'] ?? []) as Row[]).map(async (r) => ({ ...r, resolution: await cap.ownerResolution(t, d, String(r['responsibility_key']), profile) })));
      return {
        profile, matrices, approved, owners, support_access_owner: await cap.ownerResolution(t, d, 'support.access', profile),
        reconciliations: await cap.reconciliations(10), grants: await cap.grants(200, null), access_log: await cap.accessLog(100, null), drills: await cap.drills(50),
        exercises: await cap.exercises(50), admissions: await cap.admissions(50), items: await cap.items(), ledger: await cap.ledger(100), cases: await cap.cases(),
        residency: await cap.residency(t, d), read_at: await cap.now(),
      };
    });
    return { ...out.result, links: {
      exports: { route: `/v1/tenants/${t}/domains/${d}/retention/actions/list`, action: 'retention.read', note: 'export actions, downloads and deliveries — the retention workspace' },
      signing_keys: { route: `/v1/tenants/${t}/domains/${d}/retention/signing-keys/list`, action: 'retention.read', note: 'the export signing keys (by reference; no secret is ever shown)' },
      executive_signer: this.signer.publicKey() === null ? null : { key_id: this.signer.publicKey()?.keyId },
    }, boundary: SA_BOUNDARY, receipt: receipt(out) };
  }

  /** The owner registry alone (IA-04-005). */
  async owners(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, profile: string) {
    const out = await this.read(env, p, t, d, READ, 'RSM', null, async (cap) => {
      const approved = (await cap.matrices(profile)).find((m) => m['state'] === 'approved') ?? null;
      const rows = approved === null ? [] : ((approved['rows'] ?? []) as Row[]);
      return { matrix: approved === null ? null : { matrix_id: approved['matrix_id'], version: approved['version'], digest: approved['digest'] },
               owners: await Promise.all(rows.map(async (r) => ({ key: r['responsibility_key'], title: r['title'], owner_role: r['owner_role'], escalation_path: r['escalation_path'],
                                                                     resolution: await cap.ownerResolution(t, d, String(r['responsibility_key']), profile) }))),
               read_at: await cap.now() };
    });
    return { ...out.result, receipt: receipt(out) };
  }

  // ───────────────────────── THE MATRIX ─────────────────────────
  async proposeMatrix(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { matrixId: string | null; programmeId: string | null; profile: string; rows: Row[]; expectedVersion: number }) {
    const out = await this.write(env, p, t, d, 'service.matrix.propose', 'RSM', b.matrixId, async (cap) => ({
      result: await cap.proposeMatrix({ ...b, t, d, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { matrix: out.result, receipt: receipt(out) };
  }
  /** DECIDE: approve (signed first — the port verifies the signature) or reject; on the exact digest. */
  async decideMatrix(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, matrixId: string, b: { version: number; decision: 'approve' | 'reject'; digest: string; reason: string }) {
    const action = 'service.matrix.decide';
    const out = await this.write(env, p, t, d, action, 'RSM', matrixId, async (cap) => {
      let signatureId: string | null = null;
      if (b.decision === 'approve') {
        const v = await cap.matrixVersion(matrixId, b.version);
        // sign only the version's own digest, and only when the decision names it (the port refuses a stale digest either way)
        if (v !== null && v['state'] === 'proposed' && v['digest'] === b.digest) {
          const s = await this.sign(cap, { t, d, action, kind: 'responsibility_matrix', id: matrixId, version: b.version, digest: b.digest, actor: p.principalId, correlationId: env.correlation_id });
          signatureId = String(s['signature_id'] ?? '') || null;
        }
      }
      return { result: await cap.decideMatrix({ matrixId, version: b.version, t, d, decision: b.decision, digest: b.digest, reason: b.reason, signatureId, actor: p.principalId, correlationId: env.correlation_id }) };
    });
    return { matrix: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── RECONCILIATION ─────────────────────────
  /** READ FIRST (the observation, in its own governed read), the findings computed, then the write (recorded only on change). */
  async reconcile(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, profile: string, readAction = READ) {
    const observed = (await this.read(env, p, t, d, readAction, 'RSM', null, async (cap) => cap.observe(t, d, profile))).result;
    const findings = reconcileFindings(observed);
    const eventId = newId();
    const out = await this.write(env, p, t, d, 'service.responsibility.reconcile', 'RSM', null, async (cap) => ({
      result: await cap.recordReconciliation({ eventId, t, d, profile, observed, findings, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { reconciliation: { ...out.result, findings }, receipt: receipt(out) };
  }
  async afterTickReconcile(a: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string; correlationId: string }): Promise<Row> {
    const env = this.envelopeFor(a.principal, a.tenantId, a.domainId, READ, 'RSM', null, a.correlationId);
    const r = await this.reconcile(env, a.principal, a.tenantId, a.domainId, 'local-dev');
    const x = r.reconciliation as Row;
    return { recorded: x['recorded'] ?? false, gaps: x['gaps'] ?? null, drift: x['drift'] ?? null, raised: Array.isArray(x['raised']) ? (x['raised'] as unknown[]).length : 0,
             closed: Array.isArray(x['closed']) ? (x['closed'] as unknown[]).flat().length : 0 };
  }

  // ───────────────────────── SUPPORT ACCESS ─────────────────────────
  async requestGrant(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { caseId: string; purpose: string; sources: string[]; actions: string[]; minutes: number }) {
    const grantId = newId();
    const out = await this.write(env, p, t, d, 'service.grant.request', 'SGR', null, async (cap) => ({
      result: await cap.requestGrant({ grantId, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { grant: out.result, receipt: receipt(out) };
  }
  /** The approval's preview (service.read): the request, its digest, what it allows and never allows, the window, the owner of
   *  support.access, and the CALLER's eligibility in words (the port decides; this explains). */
  async preview(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, grantId: string) {
    const out = await this.read(env, p, t, d, READ, 'SGR', grantId, async (cap) => {
      const g = await cap.grant(grantId);
      if (g === null) return null;
      const owner = await cap.ownerResolution(t, d, 'support.access', 'local-dev');
      const reasons: string[] = [];
      if (p.kind !== 'human') reasons.push('a named human decides support access');
      if (!(await cap.holdsRole(p.principalId, t, d, ['domain_admin']))) reasons.push('you do not hold domain_admin in this domain');
      if (p.principalId === g['engineer_principal_id']) reasons.push('the engineer never approves their own access');
      if (await cap.holdsRole(p.principalId, t, d, ['implementation_lead'])) reasons.push('an implementation lead never approves on the customer\'s behalf');
      if (owner['state'] !== 'resolved') reasons.push(`HELD: the accountable owner of support.access is ${String(owner['state'])} — ${String(owner['reason'] ?? '')}`);
      else if (!((owner['principals'] ?? []) as string[]).includes(p.principalId)) reasons.push('you are not the accountable owner of support.access');
      if (g['state'] !== 'requested') reasons.push(`the grant is ${String(g['state'])}`);
      return { grant: g, owner, eligibility: { can_decide: reasons.length === 0, reasons }, read_at: await cap.now() };
    });
    if (out.result === null) throw refuseDelivery('support grant', 'unknown_grant', `${grantId} is not a grant of this domain`, env.correlation_id, 404);
    return { ...out.result, boundary: SA_BOUNDARY, receipt: receipt(out) };
  }
  /** DECIDE (approve | deny) on the digest. A HELD approval commits its hold (the gap item, the ledger event — the audit row reads failure)
   *  and is then refused 409 `held` with the blocking list. */
  async decideGrant(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, grantId: string, b: { decision: 'approve' | 'deny'; digest: string; reason: string }) {
    const out = await this.write(env, p, t, d, 'service.grant.decide', 'SGR', grantId, async (cap) => {
      const r = await cap.decideGrant({ grantId, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id });
      return r['held'] === true ? { result: r, evidence: { outcome: 'failure', resultCode: 'EYE-STA-002', metadata: { held: true, blocking: r['blocking'] } } } : { result: r };
    });
    if (out.result['held'] === true) {
      const blocking = (out.result['blocking'] ?? []) as Row[];
      const e = refuseDelivery('support grant', 'held', `support access cannot be approved — ${blocking.map((x) => `${String(x['responsibility'])} is ${String(x['state'])}: ${String(x['reason'] ?? '')}`).join('; ')}; the gap is raised and stays visible until the owner is filled`, env.correlation_id, 409);
      const body = e.getResponse() as Row;
      throw new HttpException({ ...body, held: { blocking, gap: out.result['gap'] ?? null, owner: out.result['owner'] ?? null }, receipt: receipt(out) }, 409);
    }
    return { grant: out.result, receipt: receipt(out) };
  }
  async revokeGrant(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, grantId: string, reason: string) {
    const out = await this.write(env, p, t, d, 'service.grant.revoke', 'SGR', grantId, async (cap) => ({ result: await cap.revokeGrant({ grantId, t, d, reason, actor: p.principalId, correlationId: env.correlation_id }) }));
    const access = await this.revokeSessions(String(out.result['engineer']), { principalId: p.principalId, sessionId: p.sessionId }, grantId, `support grant revoked: ${reason}`, env.correlation_id);
    return { grant: { ...out.result, access }, receipt: receipt(out) };
  }
  async withdrawGrant(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, grantId: string, reason: string) {
    const out = await this.write(env, p, t, d, 'service.grant.withdraw', 'SGR', grantId, async (cap) => ({ result: await cap.withdrawGrant({ grantId, t, d, reason, actor: p.principalId, correlationId: env.correlation_id }) }));
    // the engineer's own sessions are left for the tick's hook (a withdrawing engineer is signed in right now — the hook revokes them next)
    return { grant: { ...out.result, access: { pending: true, closed_by: `the next tick (${SUPPORT_ACCESS_HOOK})` } }, receipt: receipt(out) };
  }
  /** The engineer's OWN grants (support.grant.read — never another engineer's). */
  async myGrants(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.read(env, p, t, d, 'support.grant.read', 'SGR', null, async (cap) => ({ grants: await cap.grants(100, p.principalId), read_at: await cap.now() }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** A DIAGNOSTIC READ (support.diagnose.<what>): the port asks the live grant FIRST and logs every attempt; a refusal's log row is
   *  committed with the audit reading failure, then 403 `access` in the server's words. */
  async diagnose(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, what: string, b: { caseId: string | null; sourceId: string }) {
    const action = `support.diagnose.${what}`;
    const route = domainRoute(t, d, action, 'SRC', b.sourceId);
    const out = await this.pipeline.consequentialReadEvidenced(derive(env, action, 'SRC', b.sourceId), p, route, SupportCap,
      async (cap) => cap.diagnose({ t, d, caseId: b.caseId, sourceId: b.sourceId, actor: p.principalId, correlationId: env.correlation_id }),
      (r) => (r['refused'] === true ? { outcome: 'failure', resultCode: 'EYE-AUT-001', metadata: { refused: true, reason: r['reason'], log_id: r['log_id'] } }
                                    : { outcome: 'success', resultCode: 'OK', metadata: { grant_id: r['grant_id'], log_id: r['log_id'] } }));
    if (out.result['refused'] === true) {
      const e = refuseDelivery('support access', 'access', `${String(out.result['reason'])} — no data access without a live approved grant (the attempt is logged)`, env.correlation_id, 403);
      throw new HttpException({ ...(e.getResponse() as Row), logged: { log_id: out.result['log_id'], grant_id: out.result['grant_id'] ?? null }, receipt: receipt(out) }, 403);
    }
    return { diagnosis: out.result, receipt: receipt(out) };
  }

  // ───────────────────────── LAYER 1 + 3b: the identity revocation and the sweep ─────────────────────────
  /** The engineer's sessions revoked by the IDENTITY authority (ctx.issue_identity_op('identity.credential.revoke', <engineer>) — the 0091
   *  idiom; the engineer's credential is kept: a vendor engineer is a persistent principal whose access is the grant, not the login). */
  async revokeSessions(engineer: string, actor: { principalId: string; sessionId: string | null }, grantId: string | null, reason: string, correlationId: string): Promise<Row> {
    try {
      return await this.identityDb.transaction().execute(async (tx: Tx) => {
        await sql`select ctx.issue_identity_op('identity.credential.revoke', ${engineer}::uuid, ${correlationId}::uuid, 60)`.execute(tx);
        const n = Number((await sql<{ n: number }>`select identity.sessions_revoke_all_v2(${engineer}::uuid) as n`.execute(tx)).rows[0]?.n ?? 0);
        await sql`select audit.commit_identity_event(${actor.principalId}::uuid, ${actor.sessionId}::uuid, 'identity.support_access_revoked', 'identity.credential.revoke', 'success', 'OK',
          ${correlationId}::uuid, ${JSON.stringify({ subject: engineer, grant_id: grantId, reason, sessions_revoked: n })}::jsonb)`.execute(tx);
        return { pending: false, principal: engineer, sessions_revoked: n, epoch_bumped: true } as Row;
      });
    } catch (e) {
      return { pending: true, principal: engineer, error: textOf(e).slice(0, 300), closed_by: `the next tick (${SUPPORT_ACCESS_HOOK})` };
    }
  }
  /** The after-tick hook: the sweep (its own governed write) lapses every approved grant past its expiry, then each engineer still holding a
   *  session from before its grant ended is revoked by the identity authority. Never nested in the tick's write. */
  async afterTickSweep(a: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string; correlationId: string }): Promise<Row> {
    const env = this.envelopeFor(a.principal, a.tenantId, a.domainId, 'service.grant.sweep', 'SGR', null, a.correlationId);
    const out = await this.write(env, a.principal, a.tenantId, a.domainId, 'service.grant.sweep', 'SGR', null, async (cap) => ({ result: await cap.sweep({ t: a.tenantId, d: a.domainId, actor: a.principal.principalId, correlationId: a.correlationId }) }));
    const pending = (out.result['access_pending'] ?? []) as Row[];
    const revoked: Row[] = [];
    for (const x of pending) revoked.push({ ...(await this.revokeSessions(String(x['principal']), { principalId: a.principal.principalId, sessionId: a.principal.sessionId },
      typeof x['grant_id'] === 'string' ? x['grant_id'] : null, `the support grant is ${String(x['grant_state'])} (tick)`, a.correlationId)), grant_id: x['grant_id'] ?? null });
    return { lapsed: ((out.result['lapsed'] ?? []) as Row[]).map((g) => g['grant_id']), pending: pending.length, revoked };
  }

  // ───────────────────────── DRILLS, EXERCISES, ADMISSION ─────────────────────────
  async runDrill(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { kind: string; grantId: string; reason: string }) {
    const drillId = newId();
    const out = await this.write(env, p, t, d, 'service.drill.run', 'SGR', b.grantId, async (cap) => ({ result: await cap.runDrill({ drillId, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }) }));
    const access = b.kind === 'revoke_live_grant'
      ? await this.revokeSessions(String(out.result['engineer']), { principalId: p.principalId, sessionId: p.sessionId }, b.grantId, `customer-control drill: ${b.reason}`, env.correlation_id)
      : { note: 'nothing to revoke: the grant had already expired' };
    return { drill: { ...out.result, access }, receipt: receipt(out) };
  }
  async recordExercise(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { title: string; scenario: string; heldOn: string; customer: string[]; vendor: string[]; outcome: string; findings: string | null; evidence: unknown[] }) {
    const exerciseId = newId();
    const out = await this.write(env, p, t, d, 'service.exercise.record', 'SJX', exerciseId, async (cap) => ({ result: await cap.recordExercise({ exerciseId, t, d, ...b, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { exercise: out.result, receipt: receipt(out) };
  }
  async proposeAdmission(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { admissionId: string | null; profile: string; from: string; to: string; baselineDigest: string; exercises: string[]; expectedVersion: number }) {
    const admissionId = b.admissionId ?? newId();
    const out = await this.write(env, p, t, d, 'service.admission.propose', 'SAR', admissionId, async (cap) => ({ result: await cap.proposeAdmission({ ...b, admissionId, t, d, actor: p.principalId, correlationId: env.correlation_id }) }));
    return { admission: out.result, receipt: receipt(out) };
  }
  async decideAdmission(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, admissionId: string, b: { version: number; decision: 'sign' | 'reject'; digest: string; reason: string }) {
    const action = 'service.admission.decide';
    const out = await this.write(env, p, t, d, action, 'SAR', admissionId, async (cap) => {
      let signatureId: string | null = null;
      if (b.decision === 'sign') {
        const v = await cap.admissionVersion(admissionId, b.version);
        if (v !== null && v['state'] === 'proposed' && v['digest'] === b.digest) {
          const s = await this.sign(cap, { t, d, action, kind: 'admission_record', id: admissionId, version: b.version, digest: b.digest, actor: p.principalId, correlationId: env.correlation_id });
          signatureId = String(s['signature_id'] ?? '') || null;
        }
      }
      return { result: await cap.decideAdmission({ admissionId, version: b.version, t, d, decision: b.decision, digest: b.digest, reason: b.reason, signatureId, actor: p.principalId, correlationId: env.correlation_id }) };
    });
    return { admission: out.result, receipt: receipt(out) };
  }
  /** A recorded signature verified against the bound key (the control center shows it). */
  verifySignature(row: { key_id: string; signature: string; subject_digest: string }): boolean { return this.signer.verify(row); }
}

