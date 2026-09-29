/**
 * THE LOCAL INVITATION DELIVERY AND PICKUP — CP-6 B36 part `collab` (0094 §C3; F-P6-14 (t), the B34 review's condition).
 *
 * DELIVERY: once 0091 §F1's activation committed (the grant `invited`, the mailbox record written, the identity credential issued), the
 * identity administrator's provisioning DELIVERS the invitation: the pickup code's hash and the SEALED acceptance material go to
 * executive.invitation_deliveries through executive.deliver_invitation (the same bound action, executive.collab.provision); the message
 * with the CODE is placed in the SYNTHETIC sink (the demo mailbox is the local supported path — a real provider is owner decision D6). A
 * delivery that fails after the activation is answered `pending` and re-driven by the provisioner (`redeliver`) while the sink holds the
 * material.
 *
 * PICKUP: the ONE route reached WITHOUT A PRINCIPAL — the addressed person is not yet a principal, so the mailbox's one-time code is the
 * authority. It runs outside the pipeline in this service's own COMMIT transaction (executive.pickup_invitation asserts no bound action —
 * stated in the migration); the port never raises, so every attempt's ledger row COMMITS whatever the outcome, and the outcome is mapped to
 * its refusal here, after the commit. The token appears in NO log line (one line per attempt names the grant, the outcome and the address;
 * the material is returned, never printed) and in NO table (sealed at rest; opened here with the code the caller presented).
 */
import { HttpException, Inject, Injectable, Logger } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import { COMMIT_DB } from '../../shared/shared.module.js';
import type { Db } from '../../shared/db.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { CollabB36Capability } from './collab-b36.capabilities.js';
import { CollabService, type Invitation } from './collab.service.js';
import { normalizePickupCode, openMaterial, pickupCodeHash, PICKUP_FAILURES_TO_LOCK } from './invitation-sealing.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface PickupAnswer {
  invitation: { grant_id: string; tenant_id: string; domain_id: string; workspace_id: string; workspace_title: string; purpose: string; audience_ceiling: string; expires_at: string;
                invitation_expires_at: string; principal_id: string; display_name: string | null; login: string; token: string; picked_up_at: string;
                next: string; synthetic: true };
}

@Injectable()
export class InvitationDeliveryService {
  private readonly log = new Logger('executive.collab.invitation');
  constructor(@Inject(COMMIT_DB) private readonly commitDb: Db, private readonly pipeline: PipelineService, private readonly collab: CollabService) {}

  private route(tenantId: string, domainId: string, action: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType: 'CGR', objectId };
  }

  /** The delivery after the activation (the provisioner's governed write; its own envelope message). Never logs the code or the token. */
  async deliver(envelope: Envelope, admin: AuthenticatedPrincipal, tenantId: string, domainId: string, inv: Pick<Invitation, 'grantId' | 'pickup'>): Promise<Row> {
    const out = await this.pipeline.write({ ...envelope, message_id: newId() }, admin, this.route(tenantId, domainId, 'executive.collab.provision', inv.grantId), CollabB36Capability.delivery,
      async (cap) => ({ result: await cap.deliver({ deliveryId: newId(), tenantId, domainId, grantId: inv.grantId, codeHash: inv.pickup.codeHash, sealed: inv.pickup.sealed, codeExpiresAt: inv.pickup.codeExpiresAt,
                                                    actor: admin.principalId, correlationId: envelope.correlation_id }),
                        targetType: 'CGR', targetId: inv.grantId, targetVersion: null, outboxEvent: null }));
    this.log.log(`invitation delivered: grant ${inv.grantId}, channel demo-mailbox (SYNTHETIC), code expires ${inv.pickup.codeExpiresAt} — the code and the token are not logged`);
    return { ...out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /** The delivery re-driven by the provisioner while this process's sink still holds the material (a delivery that failed after the activation). */
  async redeliver(envelope: Envelope, admin: AuthenticatedPrincipal, tenantId: string, domainId: string, grantId: string): Promise<Row> {
    const m = this.collab.deliveryMaterial(grantId);
    if (m === null) {
      throw new HttpException(errorBody('EYE_STA_002', envelope.correlation_id, 'invitation rejected (not_in_sink): this process holds no material for the grant — the owner revokes the grant and requests the invitation again'), 409);
    }
    return this.deliver(envelope, admin, tenantId, domainId, { grantId, pickup: { code: '', codeHash: m.codeHash, sealed: m.sealed, codeExpiresAt: m.codeExpiresAt } });
  }

  /** THE PICKUP (no principal): the code presented by the addressed person; every attempt recorded; the material answered ONCE. */
  async pickup(correlationId: string, invitationId: unknown, code: unknown, from: string): Promise<PickupAnswer> {
    if (typeof invitationId !== 'string' || !UUID.test(invitationId)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'payload.invitationId is the invitation (grant) id — a uuid'), 422);
    const normalized = typeof code === 'string' ? normalizePickupCode(code) : null;
    if (normalized === null) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'payload.code is the one-time pickup code from the invitation message (12 symbols, three groups)'), 422);
    const grantId = invitationId.toLowerCase();
    const outcome = await this.commitDb.transaction().execute(async (tx) =>
      CollabB36Capability.pickup(tx).pickup({ grantId, codeHash: pickupCodeHash(grantId, normalized), from, correlationId }));
    const o = String(outcome['outcome']);
    this.log.log(`invitation pickup: grant ${grantId} outcome ${o} from ${from} (failures ${String(outcome['failures'] ?? 0)}/${PICKUP_FAILURES_TO_LOCK}) — the code and the material are not logged`);
    switch (o) {
      case 'picked_up': {
        const material = openMaterial(grantId, normalized, String(outcome['sealed_material']));
        if (material === null) throw new HttpException(errorBody('EYE_STA_002', correlationId, 'invitation rejected (seal): the sealed material did not open under the code that matched its hash'), 409);
        const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : String(v));
        return { invitation: {
          grant_id: grantId, tenant_id: String(outcome['tenant_id']), domain_id: String(outcome['domain_id']), workspace_id: String(outcome['workspace_id']), workspace_title: String(outcome['workspace_title'] ?? ''),
          purpose: String(outcome['purpose']), audience_ceiling: String(outcome['audience_ceiling']), expires_at: iso(outcome['expires_at']), invitation_expires_at: iso(outcome['invitation_expires_at']),
          principal_id: String(outcome['principal_id']), display_name: (outcome['display_name'] ?? null) as string | null, login: material.login, token: material.token, picked_up_at: iso(outcome['picked_up_at']),
          next: 'sign in with the login and the token, accept the invitation with the token and your new password, then sign in with the password', synthetic: true } };
      }
      case 'wrong_code':
        throw new HttpException(errorBody('EYE_AUT_001', correlationId, `invitation rejected (code): the pickup code does not match (${String(outcome['failures'])} of ${PICKUP_FAILURES_TO_LOCK} failures; ${String(outcome['remaining'])} left before the invitation locks)`), 403);
      case 'locked':
        throw new HttpException(errorBody('EYE_STA_002', correlationId, 'invitation rejected (locked): five wrong codes locked this invitation — the workspace\'s owner revokes the grant and requests a new invitation'), 409);
      case 'already_picked_up':
        throw new HttpException(errorBody('EYE_STA_002', correlationId, 'invitation rejected (picked_up): the material of this invitation was picked up already; it is answered once'), 409);
      case 'expired':
        throw new HttpException(errorBody('EYE_STA_002', correlationId, 'invitation rejected (expired): the pickup code, the invitation window or the grant expired'), 409);
      case 'not_delivered':
        throw new HttpException(errorBody('EYE_STA_002', correlationId, 'invitation rejected (not_delivered): the invitation was not delivered to the mailbox yet'), 409);
      case 'grant_not_open':
        throw new HttpException(errorBody('EYE_STA_002', correlationId, 'invitation rejected (state): the grant is no longer awaiting its pickup'), 409);
      default:
        throw new HttpException(errorBody('EYE_STA_001', correlationId, 'invitation rejected (unknown_invitation): no such invitation'), 404);
    }
  }
}
