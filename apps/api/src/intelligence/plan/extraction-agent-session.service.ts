/**
 * The EXTRACTION AGENT's own session (CP-6 B24, migration 0086 §P) — the shape of the propagation agent's session service (0060) over
 * intelligence.extraction_agents: an identity-operation context, the registration must be active, the executor's version and code
 * digest must be the registered ones, the principal must be an active agent principal. The plan worker then runs each execution as
 * that agent through the ordinary pipeline, and the session is moved forward only by the drain's PROGRESS — one extension per recorded
 * execution, each re-verifying the grant, so a revocation that lands mid-drain ends the drain's authority at its next execution.
 *
 * The session is NEVER the subscriber's: the observations subscriber only queues; the run is this agent's act.
 */
import { Inject, Injectable } from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { sql } from 'kysely';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { IDENTITY_DB } from '../../shared/shared.module.js';
import type { Db } from '../../shared/db.js';
import { IdentityService } from '../../identity/identity.service.js';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { PLAN_EXECUTOR } from './plan-executor.js';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
/** A typed governance answer: the grant does not cover this drain (revoked, another digest, no such agent). Never an infrastructure fault. */
export class ExtractionGrantRefused extends Error { constructor(message: string) { super(message); } }

@Injectable()
export class ExtractionAgentSessionService {
  constructor(@Inject(EYE_CONFIG) private readonly cfg: EyeConfig, @Inject(IDENTITY_DB) private readonly identityDb: Db, private readonly identity: IdentityService) {}

  /** How long a drain session lives past its opening, or past its latest recorded execution. */
  runSessionSeconds(): number { return Math.max(this.cfg['eye.identity.access_ttl_seconds'], 900); }

  async openRunSession(a: { agentId: string; tenantId: string; domainId: string; correlationId: string }): Promise<AuthenticatedPrincipal> {
    const sessionId = newId(); const familyId = newId();
    const refreshToken = `${newId()}.${randomBytes(24).toString('base64url')}`;
    const contextKey = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.runSessionSeconds() * 1000);
    let principalId: string;
    try {
      principalId = await this.identityDb.transaction().execute(async (tx) => {
        await sql`select ctx.issue_identity_op('identity.session.create', null::uuid, ${a.correlationId}::uuid, 60)`.execute(tx);
        const rows = await sql<{ principal_id: string }>`select intelligence.extraction_agent_session_open(${sessionId}::uuid, ${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid,
          ${PLAN_EXECUTOR.version}, ${PLAN_EXECUTOR.codeDigest}, ${sha256(refreshToken)}, ${sha256(contextKey)}, ${expiresAt}, ${familyId}::uuid) as principal_id`.execute(tx);
        const p = rows.rows[0]?.principal_id;
        if (typeof p !== 'string') throw new ExtractionGrantRefused('agent session port returned no principal');
        await sql`select audit.commit_identity_event(${p}::uuid, ${sessionId}::uuid, 'identity.agent_session_opened', 'identity.session.create', 'success', 'OK', ${a.correlationId}::uuid,
          ${JSON.stringify({ agent_id: a.agentId, agent_version: PLAN_EXECUTOR.version, code_digest: PLAN_EXECUTOR.codeDigest, assurance: 'agent_grant', family: PLAN_EXECUTOR.name })}::jsonb)`.execute(tx);
        return p;
      });
    } catch (e) {
      // The port's own words (revoked, digest, not registered) are the refusal the execution records.
      if ((e as { code?: string }).code === '42501') throw new ExtractionGrantRefused((e as Error).message);
      throw e;
    }
    const token = await this.identity.signAccess(principalId, sessionId, 'agent_grant', contextKey);
    const verified = await this.identity.verifyAccess(token);
    if (verified === null) throw new ExtractionGrantRefused('agent session could not be verified after issuance');
    return verified;
  }

  /**
   * Extend the drain session on the strength of a RECORDED EXECUTION. Returns the new expiry, or null when the extension was REFUSED —
   * the grant was revoked or the session lapsed — a typed governance answer the worker records on the executions it still holds.
   */
  async extendRunSession(a: { sessionId: string; principalId: string; agentId: string; tenantId: string; domainId: string; correlationId: string }): Promise<Date | null> {
    const until = new Date(Date.now() + this.runSessionSeconds() * 1000);
    try {
      return await this.identityDb.transaction().execute(async (tx) => {
        await sql`select ctx.issue_identity_op('identity.session.refresh', null::uuid, ${a.correlationId}::uuid, 60)`.execute(tx);
        const rows = await sql<{ until: Date }>`select intelligence.extraction_agent_session_extend(${a.sessionId}::uuid, ${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid,
          ${PLAN_EXECUTOR.version}, ${PLAN_EXECUTOR.codeDigest}, ${until}) as until`.execute(tx);
        const next = rows.rows[0]?.until;
        if (next === undefined) throw new ExtractionGrantRefused('agent session extension port returned no expiry');
        await sql`select audit.commit_identity_event(${a.principalId}::uuid, ${a.sessionId}::uuid, 'identity.agent_session_extended', 'identity.session.refresh', 'success', 'OK', ${a.correlationId}::uuid,
          ${JSON.stringify({ agent_id: a.agentId, agent_version: PLAN_EXECUTOR.version, code_digest: PLAN_EXECUTOR.codeDigest, expires_at: until.toISOString(), extended_by: 'drain progress (a recorded execution)' })}::jsonb)`.execute(tx);
        return new Date(next);
      });
    } catch (e) {
      if ((e as { code?: string }).code === '42501') return null;
      throw e;
    }
  }
}
