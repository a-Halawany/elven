/**
 * THE ACT TRANSITION — CP-6 B34 (0090 §A4; F-P6-07: "a consequential action launched from an item under the human gate"; PR-44-*, CAP-EO-06).
 *
 * An attention item of a class the ACT REGISTRY names (executive.attention_act_registry: signal class → governed action, human-gated)
 * may launch that governed action. Three governed writes, each audited as itself (the exposures sponsor chain's idiom, 0089 §R /
 * exposures.controller.ts):
 *   1. LAUNCH  executive.attention.item.act → executive.launch_attention_act: a named, active member who may act on the item; a
 *              registered action of its class; a live item; a rationale. The PDP's human gate refuses an agent here, before anything.
 *   2. THE GOVERNED ACTION — its OWN action, PDP rule and port, under the acting human's session (the act never widens what the person
 *              may do): opportunity.raised → prediction.exposure.sponsor (ExposureChanged@v1 described in the same write, as the exposures
 *              route does); warning.raised → prediction.warning.acknowledge.
 *   3. SETTLE  executive.attention.item.act → executive.act_on_attention_item: acted (the effect reference) or refused (the refusal the
 *              governed action met) — item.acted | item.act_refused on the item's log. A refused governed action is RECORDED, then answered
 *              with its own status.
 * health.change has NO act: "a score change triggers review, never action" (the registry refuses the row; the launch port says so).
 * commitment.breach's act is registered by the integrator once the commitments part's action exists (stated).
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { ExecutiveCapability } from '../executive.capabilities.js';
import { ExposuresCapability } from '../../prediction/exposures/exposures.capabilities.js';
import { exposureChangedEvent } from '../../prediction/exposures/exposure-events.js';
import { PredictionCapability } from '../../prediction/prediction.capabilities.js';
import { asObservationRefusal } from '../../observation/observation-errors.js';
/* B34 (0090) integrator */ import { CommitmentCapability } from '../../decision/commitments/commitment.capabilities.js'; /* end B34 integrator */

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

/** The act's intake: the registered action's key, the rationale, the governed action's own parameters; an act id to repeat idempotently. */
export interface ActIntake { actionKey: string; rationale: string; params: Row; actId: string | null }
export function validateAct(p: Row, correlationId: string): ActIntake {
  const bad = (m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, m), 422); };
  const actionKey = typeof p['action_key'] === 'string' ? p['action_key'].trim() : '';
  if (!/^[a-z][a-z0-9_]{2,40}$/.test(actionKey)) bad('payload.action_key names a registered act of the item\'s class (the act registry)');
  const rationale = typeof p['rationale'] === 'string' ? p['rationale'].trim() : '';
  if (rationale.length < 8) bad('payload.rationale says why the act is launched (at least 8 characters)');
  const params = p['params'] === undefined ? {} : p['params'];
  if (params === null || typeof params !== 'object' || Array.isArray(params)) bad('payload.params is the governed action\'s own parameters (an object)');
  const actId = p['act_id'] === undefined || p['act_id'] === null ? null : String(p['act_id']);
  if (actId !== null && !UUID.test(actId)) bad('payload.act_id is a uuid (a repeat of the same act)');
  return { actionKey, rationale, params: params as Row, actId };
}

/** What a governed action came to: its effect reference and a summary (never the whole answer), and the receipt of its own write. */
type Effect = { effectRef: string; effect: Row; receipt: Row };
type Performer = (a: { envelope: Envelope; principal: AuthenticatedPrincipal; tenantId: string; domainId: string; targetId: string; params: Row; rationale: string }) => Promise<Effect>;

@Injectable()
export class AttentionActService {
  /** THE PERFORMERS of the registered actions (by the registry's action key): each one governed write under its own action. */
  private readonly performers: Record<string, Performer> = {
    sponsor: async (a) => {
      const version = Number(a.params['version']);
      const digest = typeof a.params['digest'] === 'string' ? a.params['digest'] : '';
      const terms = a.params['terms'];
      if (!Number.isInteger(version) || version < 1 || !/^[0-9a-f]{64}$/.test(digest) || terms === null || typeof terms !== 'object' || Array.isArray(terms)) {
        throw new HttpException(errorBody('EYE_REQ_001', a.envelope.correlation_id, 'params are the sponsorship: {version, digest (the exact version\'s), terms {option_key, rationale, conditions, budget?, objective_id?}}'), 422);
      }
      const action = 'prediction.exposure.sponsor';
      const env = this.chained(a.envelope, action, 'RSK', a.targetId, 'prediction');
      const out = await this.pipeline.write(env, a.principal, this.route(a.tenantId, a.domainId, action, 'RSK', a.targetId), ExposuresCapability.sponsor,
        async (cap, scope) => ({ result: await cap.sponsor({ exposureId: a.targetId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, version, digest, terms: terms as Row, actor: a.principal.principalId, correlationId: env.correlation_id }),
                                 targetType: 'RSK', targetId: a.targetId, targetVersion: String(version),
                                 outboxEvent: await exposureChangedEvent(cap, { exposureId: a.targetId, kind: 'sponsored', correlationId: env.correlation_id, action, actor: a.principal.principalId }) }));
      return { effectRef: `RSK:${a.targetId}@v${version}:sponsored`, effect: { governed_action: action, state: out.result['state'] ?? null, version, digest,
                 evaluation_owed: out.result['evaluation_owed'] ?? true, resume: 'the evaluation (a DEC and its package) is opened from the exposure: POST …/prediction/exposures/:id/decisions/open (kind exploit)' },
               receipt: receipt(out) };
    },
    acknowledge_warning: async (a) => {
      const note = typeof a.params['note'] === 'string' && a.params['note'].trim().length >= 4 ? a.params['note'].trim() : a.rationale;
      const action = 'prediction.warning.acknowledge';
      const env = this.chained(a.envelope, action, 'WRN', a.targetId, 'prediction');
      const out = await this.pipeline.write(env, a.principal, this.route(a.tenantId, a.domainId, action, 'WRN', a.targetId), PredictionCapability.acknowledge,
        async (cap, scope) => ({ result: await cap.acknowledgeWarning({ warningId: a.targetId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, note, asOf: null, actor: a.principal.principalId, eventId: newId(), correlationId: env.correlation_id }),
                                 targetType: 'WRN', targetId: a.targetId, targetVersion: '1', outboxEvent: null }));
      return { effectRef: `WRN:${a.targetId}:${String(out.result)}`, effect: { governed_action: action, state: out.result, note }, receipt: receipt(out) };
    },
    /* B34 (0090 §I) the integrator: a commitment BREACH (an overdue item) — its owner proposes an EXTENSION of the item's open
       deadline_missed exception (decision.commitment.exception.decide, act propose_extension); the item's reviewer co-signs it on the
       tracker (a separate act of a second person — never here). params {newDueAt (ISO), note?}. */
    propose_extension: async (a) => {
      const newDueAt = typeof a.params['newDueAt'] === 'string' && !Number.isNaN(Date.parse(a.params['newDueAt'])) ? new Date(a.params['newDueAt']).toISOString() : null;
      if (newDueAt === null) throw new HttpException(errorBody('EYE_REQ_001', a.envelope.correlation_id, 'params are the extension: {newDueAt (ISO instant), note?}'), 422);
      const note = typeof a.params['note'] === 'string' && a.params['note'].trim().length >= 8 ? a.params['note'].trim() : a.rationale;
      const action = 'decision.commitment.exception.decide';
      const env = this.chained(a.envelope, action, 'CMI', a.targetId, 'decision');
      const out = await this.pipeline.write(env, a.principal, this.route(a.tenantId, a.domainId, action, 'CMI', a.targetId), CommitmentCapability.item,
        async (cap, scope) => {
          const open = (await cap.readExceptions().selectAll().where('item_id' as never, '=', a.targetId as never).where('state' as never, '=', 'open' as never)
            .where('kind' as never, '=', 'deadline_missed' as never).orderBy('raised_at' as never, 'desc').executeTakeFirst()) as Row | undefined;
          if (open === undefined) throw new HttpException(errorBody('EYE_STA_002', env.correlation_id, 'commitment exception rejected (state): the item has no open deadline_missed exception to extend'), 409);
          const r = await cap.decideException({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, exceptionId: String(open['exception_id']), act: 'propose_extension',
                                                newDueAt, note, actor: a.principal.principalId, correlationId: env.correlation_id });
          return { result: { ...r, exception_id: String(open['exception_id']) } as Row, targetType: 'CMX', targetId: String(open['exception_id']), targetVersion: null, outboxEvent: null };
        });
      return { effectRef: `CMX:${String(out.result['exception_id'])}:extension_proposed`, effect: { governed_action: action, act: 'propose_extension', new_due_at: newDueAt,
                 state: out.result['state'] ?? null, owed: 'the item\'s reviewer co-signs the extension (decision.commitment.exception.decide, act cosign)' }, receipt: receipt(out) };
    },
    /* end B34 integrator */
  };

  constructor(private readonly pipeline: PipelineService) {}

  /** The action keys this runtime can perform (a registry row with no performer is refused before any write — stated, never guessed). */
  performable(): string[] { return Object.keys(this.performers).sort(); }

  private route(tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  private chained(envelope: Envelope, action: string, objectType: string, objectId: string | null, purpose?: string): Envelope {
    return { ...envelope, action, message_id: newId(), object_type: objectType, object_id: objectId, ...(purpose === undefined ? {} : { purpose_id: purpose }) } as Envelope;
  }

  async act(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, itemId: string, intake: ActIntake): Promise<Row> {
    const performer = this.performers[intake.actionKey];
    if (performer === undefined) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, `attention act rejected (no_act): ${intake.actionKey} has no performer in this runtime (${this.performable().join(', ')})`), 422);
    }
    const actId = intake.actId ?? newId();
    const act = 'executive.attention.item.act';
    /* 1. LAUNCH (the human gate at the PDP; the port's checks) */
    const launched = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, act, 'ATI', itemId), ExecutiveCapability.attentionAct,
      async (cap, scope) => ({ result: await cap.launchAct({ actId, itemId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, actionKey: intake.actionKey, rationale: intake.rationale, actor: principal.principalId, correlationId: envelope.correlation_id }),
                               targetType: 'ATI', targetId: itemId, targetVersion: null, outboxEvent: null }));
    const l = launched.result;
    if (l['state'] !== 'launched') return { act: l, receipts: { launch: receipt(launched) }, note: 'a repeat of a settled act: nothing performed again' };
    /* 2. THE GOVERNED ACTION — its own write */
    let effect: Effect | null = null; let refusal: { status: number; code: string | null; message: string } | null = null;
    try {
      effect = await performer({ envelope, principal, tenantId, domainId, targetId: String(l['target_id']), params: intake.params, rationale: intake.rationale });
    } catch (e) {
      const mapped = e instanceof HttpException ? e : asObservationRefusal(e, envelope.correlation_id);
      if (mapped === null) throw e;
      const body = mapped.getResponse() as { code?: string; message?: string };
      refusal = { status: mapped.getStatus(), code: body.code ?? null, message: String(body.message ?? (e instanceof Error ? e.message : 'refused')) };
    }
    /* 3. SETTLE — acted with the effect, or refused with what the governed action answered */
    const settleEnv = this.chained(envelope, act, 'ATI', itemId);
    let settled: { result: Row; policyDecisionId: string; auditSeq: number };
    try {
      settled = await this.pipeline.write(settleEnv, principal, this.route(tenantId, domainId, act, 'ATI', itemId), ExecutiveCapability.attentionAct,
        async (cap, scope) => ({ result: await cap.settleAct({ actId, tenantId: scope.tenantId as string, domainId: scope.domainId as string, outcome: effect === null ? 'refused' : 'acted',
                                                                effectRef: effect?.effectRef ?? null, effect: effect?.effect ?? null,
                                                                refusal: refusal === null ? null : `${l['governed_action'] as string} answered ${refusal.status}${refusal.code === null ? '' : ` ${refusal.code}`}: ${refusal.message}`,
                                                                actor: principal.principalId, correlationId: settleEnv.correlation_id }),
                                 targetType: 'ATI', targetId: itemId, targetVersion: null, outboxEvent: null }));
    } catch (e) {
      // the governed action's outcome stands; the act stays `launched` (visible) — the settle is owed
      if (refusal !== null) throw new HttpException(errorBody(refusal.code === null ? 'EYE_STA_002' : (refusal.code.replace(/-/g, '_') as never), envelope.correlation_id, refusal.message), refusal.status);
      return { act: l, effect: effect?.effect ?? null, effect_ref: effect?.effectRef ?? null, settle: { state: 'owed', reason: e instanceof Error ? e.message : String(e) }, receipts: { launch: receipt(launched), action: effect?.receipt ?? null } };
    }
    if (refusal !== null) {
      throw new HttpException(errorBody(refusal.code === null ? 'EYE_STA_002' : (refusal.code.replace(/-/g, '_') as never), envelope.correlation_id,
        `the act ${actId} was recorded refused: ${refusal.message}`), refusal.status);
    }
    return { act: settled.result, receipts: { launch: receipt(launched), action: effect?.receipt ?? null, settle: receipt(settled) } };
  }

  /** The registry (what each class may launch; this runtime's performers) and an item's acts. */
  async registry(cap: import('../executive.capabilities.js').ExecutiveReads): Promise<Row> {
    const rows = (await cap.readAttentionActRegistry().selectAll().orderBy('signal_class' as never).orderBy('action_key' as never).execute()) as Row[];
    return { acts: rows.map((r) => ({ ...r, performable: this.performers[String(r['action_key'])] !== undefined })), no_act: { 'health.change': 'a score change triggers review, never action' } };
  }
}
