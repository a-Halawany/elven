/**
 * The PROPAGATION AGENT's own session (CP-6 B1, migration 0060) — the shape of Phase 1's
 * AgentSessionService and Phase 6's DecisionAgentSessionService over graph.propagation_agents:
 * an identity-operation context, the registration must be active, the walker's version and
 * code digest must be the registered ones, the principal must be an active agent principal.
 * The walk then acts as that agent through the ordinary pipeline, and the session is moved
 * forward only by the walk's PROGRESS — one extension per committed root (0057's rule), each
 * re-verifying the grant, so a revocation that lands mid-walk ends the walk's authority at
 * its next root.
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
import { PROPAGATION_WALKER } from '../strategy/impact.service.js';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
/** A typed governance answer: the grant does not cover this walk. Never an infrastructure fault. */
export class PropagationGrantRefused extends Error { constructor(message: string) { super(message); } }

@Injectable()
export class PropagationAgentSessionService {
  constructor(@Inject(EYE_CONFIG) private readonly cfg: EyeConfig, @Inject(IDENTITY_DB) private readonly identityDb: Db, private readonly identity: IdentityService) {}

  /** How long a walk session lives past its opening, or past its latest committed root. */
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
        const rows = await sql<{ principal_id: string }>`select graph.propagation_agent_session_open(${sessionId}::uuid, ${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid,
          ${PROPAGATION_WALKER.version}, ${PROPAGATION_WALKER.codeDigest}, ${sha256(refreshToken)}, ${sha256(contextKey)}, ${expiresAt}, ${familyId}::uuid) as principal_id`.execute(tx);
        const p = rows.rows[0]?.principal_id;
        if (typeof p !== 'string') throw new PropagationGrantRefused('agent session port returned no principal');
        await sql`select audit.commit_identity_event(${p}::uuid, ${sessionId}::uuid, 'identity.agent_session_opened', 'identity.session.create', 'success', 'OK', ${a.correlationId}::uuid,
          ${JSON.stringify({ agent_id: a.agentId, agent_version: PROPAGATION_WALKER.version, code_digest: PROPAGATION_WALKER.codeDigest, assurance: 'agent_grant', family: PROPAGATION_WALKER.name })}::jsonb)`.execute(tx);
        return p;
      });
    } catch (e) {
      if ((e as { code?: string }).code === '42501') throw new PropagationGrantRefused('agent grant is not valid for this walk');
      throw e;
    }
    const token = await this.identity.signAccess(principalId, sessionId, 'agent_grant', contextKey);
    const verified = await this.identity.verifyAccess(token);
    if (verified === null) throw new PropagationGrantRefused('agent session could not be verified after issuance');
    return verified;
  }

  /**
   * Extend the walk session on the strength of a COMMITTED ROOT. Returns the new expiry, or
   * null when the extension was REFUSED — the grant was revoked or the session lapsed — a
   * typed governance answer the consumer records on the attempt. Infrastructure faults propagate.
   */
  async extendRunSession(a: { sessionId: string; principalId: string; agentId: string; tenantId: string; domainId: string; correlationId: string }): Promise<Date | null> {
    const until = new Date(Date.now() + this.runSessionSeconds() * 1000);
    try {
      return await this.identityDb.transaction().execute(async (tx) => {
        await sql`select ctx.issue_identity_op('identity.session.refresh', null::uuid, ${a.correlationId}::uuid, 60)`.execute(tx);
        const rows = await sql<{ until: Date }>`select graph.propagation_agent_session_extend(${a.sessionId}::uuid, ${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid,
          ${PROPAGATION_WALKER.version}, ${PROPAGATION_WALKER.codeDigest}, ${until}) as until`.execute(tx);
        const next = rows.rows[0]?.until;
        if (next === undefined) throw new PropagationGrantRefused('agent session extension port returned no expiry');
        await sql`select audit.commit_identity_event(${a.principalId}::uuid, ${a.sessionId}::uuid, 'identity.agent_session_extended', 'identity.session.refresh', 'success', 'OK', ${a.correlationId}::uuid,
          ${JSON.stringify({ agent_id: a.agentId, agent_version: PROPAGATION_WALKER.version, code_digest: PROPAGATION_WALKER.codeDigest, expires_at: until.toISOString(), extended_by: 'walk progress (root checkpoint)' })}::jsonb)`.execute(tx);
        return new Date(next);
      });
    } catch (e) {
      if ((e as { code?: string }).code === '42501') return null;
      throw e;
    }
  }
}
