/**
 * The Phase 6 agent's own session — the shape of Phase 1's AgentSessionService over
 * executive.agents: an identity-operation context, the registration must be active,
 * the principal must be an active agent principal. The run then acts as that agent
 * through the ordinary pipeline.
 *
 * Review of PR #46, item 7: the registration is looked up BY THE PORT, under the
 * identity-operation capability the session is opened with — a scheduled tick on a cold
 * process needs no reader, borrows no human's cached principal, and a restart needs no
 * operator to run first. The port returns the registration the run is bound to.
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

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
export class DecisionAgentGrantRefused extends Error { constructor(message: string) { super(message); } }

export interface AgentRegistration {
  principal_id: string; agent_kind: string; agent_version: string; code_digest: string;
  budgets: Record<string, unknown>; stop_conditions: Array<Record<string, unknown>>; escalation_principal_id: string; owner_principal_id: string;
}

@Injectable()
export class DecisionAgentSessionService {
  constructor(@Inject(EYE_CONFIG) private readonly cfg: EyeConfig, @Inject(IDENTITY_DB) private readonly identityDb: Db, private readonly identity: IdentityService) {}

  async openRunSession(a: { agentId: string; tenantId: string; domainId: string; correlationId: string }): Promise<{ principal: AuthenticatedPrincipal; registration: AgentRegistration }> {
    const sessionId = newId(); const familyId = newId();
    const refreshToken = `${newId()}.${randomBytes(24).toString('base64url')}`;
    const contextKey = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + Math.max(this.cfg['eye.identity.access_ttl_seconds'], 900) * 1000);
    let registration: AgentRegistration;
    try {
      registration = await this.identityDb.transaction().execute(async (tx) => {
        await sql`select ctx.issue_identity_op('identity.session.create', null::uuid, ${a.correlationId}::uuid, 60)`.execute(tx);
        const rows = await sql<{ r: AgentRegistration }>`select executive.decision_agent_run_open(${sessionId}::uuid, ${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid,
          ${sha256(refreshToken)}, ${sha256(contextKey)}, ${expiresAt}, ${familyId}::uuid) as r`.execute(tx);
        const r = rows.rows[0]?.r;
        if (r === undefined || typeof r.principal_id !== 'string') throw new DecisionAgentGrantRefused('agent session port returned no registration');
        await sql`select audit.commit_identity_event(${r.principal_id}::uuid, ${sessionId}::uuid, 'identity.agent_session_opened', 'identity.session.create', 'success', 'OK', ${a.correlationId}::uuid,
          ${JSON.stringify({ agent_id: a.agentId, agent_version: r.agent_version, code_digest: r.code_digest, assurance: 'agent_grant', family: 'executive' })}::jsonb)`.execute(tx);
        return r;
      });
    } catch (e) {
      if ((e as { code?: string }).code === '42501') throw new DecisionAgentGrantRefused('agent grant is not valid for this run');
      throw e;
    }
    const token = await this.identity.signAccess(registration.principal_id, sessionId, 'agent_grant', contextKey);
    const verified = await this.identity.verifyAccess(token);
    if (verified === null) throw new DecisionAgentGrantRefused('agent session could not be verified after issuance');
    return { principal: verified, registration };
  }
}
