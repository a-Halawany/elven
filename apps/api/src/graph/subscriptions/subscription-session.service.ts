/**
 * A SUBSCRIBER's own session (CP-6 B6, 0063) — the 0060 shape over graph.subscriptions: an identity-operation
 * context, the subscription active, the consumer's version and code digest as registered, the principal an active
 * agent principal; extended only by the delivery's progress (one extension per applied item), each extension
 * re-verifying the grant so a pause or revocation lands at the next item.
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
import { CONSUMER_VERSION, consumerCodeDigest, type ConsumerKind } from './graph-change.js';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
export class SubscriptionGrantRefused extends Error { constructor(message: string) { super(message); } }

@Injectable()
export class SubscriptionSessionService {
  constructor(@Inject(EYE_CONFIG) private readonly cfg: EyeConfig, @Inject(IDENTITY_DB) private readonly identityDb: Db, private readonly identity: IdentityService) {}

  runSessionSeconds(): number { return Math.max(this.cfg['eye.identity.access_ttl_seconds'], 900); }

  async openRunSession(a: { subscriptionId: string; kind: ConsumerKind; tenantId: string; domainId: string; correlationId: string }): Promise<AuthenticatedPrincipal> {
    const sessionId = newId(); const familyId = newId();
    const refreshToken = `${newId()}.${randomBytes(24).toString('base64url')}`;
    const contextKey = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + this.runSessionSeconds() * 1000);
    const digest = consumerCodeDigest(a.kind);
    let principalId: string;
    try {
      principalId = await this.identityDb.transaction().execute(async (tx) => {
        await sql`select ctx.issue_identity_op('identity.session.create', null::uuid, ${a.correlationId}::uuid, 60)`.execute(tx);
        const rows = await sql<{ principal_id: string }>`select graph.subscription_session_open(${sessionId}::uuid, ${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid,
          ${CONSUMER_VERSION}, ${digest}, ${sha256(refreshToken)}, ${sha256(contextKey)}, ${expiresAt}, ${familyId}::uuid) as principal_id`.execute(tx);
        const p = rows.rows[0]?.principal_id;
        if (typeof p !== 'string') throw new SubscriptionGrantRefused('subscriber session port returned no principal');
        await sql`select audit.commit_identity_event(${p}::uuid, ${sessionId}::uuid, 'identity.agent_session_opened', 'identity.session.create', 'success', 'OK', ${a.correlationId}::uuid,
          ${JSON.stringify({ subscription_id: a.subscriptionId, consumer_kind: a.kind, consumer_version: CONSUMER_VERSION, code_digest: digest, assurance: 'agent_grant', family: `graph.subscription.${a.kind}` })}::jsonb)`.execute(tx);
        return p;
      });
    } catch (e) {
      if ((e as { code?: string }).code === '42501') throw new SubscriptionGrantRefused('subscription grant is not valid for this delivery');
      throw e;
    }
    const token = await this.identity.signAccess(principalId, sessionId, 'agent_grant', contextKey);
    const verified = await this.identity.verifyAccess(token);
    if (verified === null) throw new SubscriptionGrantRefused('subscriber session could not be verified after issuance');
    return verified;
  }

  /** Extend on an APPLIED item; null when refused (paused, revoked, lapsed) — a typed governance answer. */
  async extendRunSession(a: { sessionId: string; principalId: string; subscriptionId: string; kind: ConsumerKind; tenantId: string; domainId: string; correlationId: string }): Promise<Date | null> {
    const until = new Date(Date.now() + this.runSessionSeconds() * 1000);
    const digest = consumerCodeDigest(a.kind);
    try {
      return await this.identityDb.transaction().execute(async (tx) => {
        await sql`select ctx.issue_identity_op('identity.session.refresh', null::uuid, ${a.correlationId}::uuid, 60)`.execute(tx);
        const rows = await sql<{ until: Date }>`select graph.subscription_session_extend(${a.sessionId}::uuid, ${a.subscriptionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${CONSUMER_VERSION}, ${digest}, ${until}) as until`.execute(tx);
        const next = rows.rows[0]?.until;
        if (next === undefined) throw new SubscriptionGrantRefused('subscriber session extension port returned no expiry');
        await sql`select audit.commit_identity_event(${a.principalId}::uuid, ${a.sessionId}::uuid, 'identity.agent_session_extended', 'identity.session.refresh', 'success', 'OK', ${a.correlationId}::uuid,
          ${JSON.stringify({ subscription_id: a.subscriptionId, consumer_kind: a.kind, consumer_version: CONSUMER_VERSION, code_digest: digest, expires_at: until.toISOString(), extended_by: 'delivery progress (item checkpoint)' })}::jsonb)`.execute(tx);
        return new Date(next);
      });
    } catch (e) {
      if ((e as { code?: string }).code === '42501') return null;
      throw e;
    }
  }
}
