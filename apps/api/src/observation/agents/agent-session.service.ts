/**
 * Agent session issuance — PHASE1_PLAN §11.
 *
 * "reauthorized at execution time (full pipeline auth per run — queued jobs carry
 * no authority)".
 *
 * A queued collection job carries a scoped opaque identifier and nothing else: no
 * credential, no token, no delegated authority. At execution the worker asks for
 * a session for the agent principal it claims to be, and the database port —
 * identity.agent_session_open — grants one ONLY if that agent is still registered,
 * still active, still this version and still this code digest in this domain. So
 * the authority a run holds is re-derived from the registry every time, and
 * revoking an agent while its job sits in the queue takes effect at the moment
 * the job runs.
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

export class AgentGrantRefused extends Error {
  constructor(message: string) {
    super(message);
  }
}

@Injectable()
export class AgentSessionService {
  constructor(
    @Inject(EYE_CONFIG) private readonly cfg: EyeConfig,
    @Inject(IDENTITY_DB) private readonly identityDb: Db,
    private readonly identity: IdentityService,
  ) {}

  /**
   * Open a run session for a registered agent. The session and its audit event
   * commit in ONE identity-pool transaction: if the audit append fails, the
   * session never existed.
   */
  async openRunSession(a: {
    agentId: string;
    tenantId: string;
    domainId: string;
    agentVersion: string;
    codeDigest: string;
    correlationId: string;
  }): Promise<AuthenticatedPrincipal> {
    const sessionId = newId();
    const familyId = newId();
    const refreshToken = `${newId()}.${randomBytes(24).toString('base64url')}`;
    const contextKey = randomBytes(32).toString('base64url');
    // A run session lives only as long as a run may: it is not a standing credential.
    const expiresAt = new Date(Date.now() + Math.max(this.cfg['eye.identity.access_ttl_seconds'], 900) * 1000);

    let principalId: string;
    try {
      principalId = await this.identityDb.transaction().execute(async (tx) => {
        await sql`select ctx.issue_identity_op('identity.session.create', null::uuid,
          ${a.correlationId}::uuid, 60)`.execute(tx);
        const rows = await sql<{ agent_session_open: string }>`select identity.agent_session_open(
          ${sessionId}::uuid, ${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid,
          ${a.agentVersion}, ${a.codeDigest}, ${sha256(refreshToken)}, ${sha256(contextKey)},
          ${expiresAt}, ${familyId}::uuid) as agent_session_open`.execute(tx);
        const pid = rows.rows[0]?.agent_session_open;
        if (pid === undefined) throw new AgentGrantRefused('agent session port returned no principal');
        await sql`select audit.commit_identity_event(
          ${pid}::uuid, ${sessionId}::uuid, 'identity.agent_session_opened',
          'identity.session.create', 'success', 'OK', ${a.correlationId}::uuid,
          ${JSON.stringify({
            agent_id: a.agentId, agent_version: a.agentVersion,
            code_digest: a.codeDigest, assurance: 'agent_grant',
          })}::jsonb)`.execute(tx);
        return pid;
      });
    } catch (e) {
      // A refused grant is an AUTHORIZATION outcome — the run does not start, and
      // the reason never carries database text outward.
      if ((e as { code?: string }).code === '42501') {
        throw new AgentGrantRefused('agent grant is not valid for this run');
      }
      throw e;
    }

    // The worker holds the same shape any authenticated caller holds, so the
    // pipeline treats a run exactly like any other governed operation.
    const token = await this.identity.signAccess(principalId, sessionId, 'agent_grant', contextKey);
    const verified = await this.identity.verifyAccess(token);
    if (verified === null) {
      throw new AgentGrantRefused('agent session could not be verified after issuance');
    }
    return verified;
  }
}
