/**
 * B50 §LC (0120_b50_x_lc; F-P3-02: PR-06-001/002/003/005/006, CAP-AU-07, AT-06, ADR-006; F-P3-01: V03-T-021, V04-T-006) — THE WORK-OBJECT
 * LIFECYCLE SERVICE: the pipeline's audited reads (`objects.lifecycle.read` — the profiles, a type's work objects, one object's history with
 * every attempted transition and its proposals, the replay at an instant, the domain's reconciliation, the export and its re-import
 * verification) and its governed writes — the person-authored draft (`objects.work_object.author`), the transition
 * (`objects.lifecycle.transition`), the proposal (`objects.lifecycle.propose` — views, agents, models, imports, projections) and the owner's
 * decision on it (`objects.lifecycle.proposal.decide`). The intake is shaped here (types only); the ports decide every rule.
 *
 * A REJECTED TRANSITION IS KEPT: the port records the attempted command and the last authoritative version and RETURNS (a raise would roll
 * the record back); the pipeline commits that record beside a FAILURE audit row (EYE-STA-002 — no business effect was stamped), and the route
 * then answers the refusal in the port's words with the recorded outcome beside it. A repeated idempotency key answers the FIRST result.
 *
 * THREE CLAIMS: construction (this code and phase6-lifecycle-b50.test.ts, every persona SYNTHETIC); demonstrated operation (the act); real
 * acceptance (PR-06-006 / AT-06: the shared recording path at B111, then R2) — never claimed.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService, type RouteInfo } from '../../pipeline/pipeline.service.js';
import { LifecycleCapability, type LifecycleReads, type LifecycleWrites } from './lifecycle.capabilities.js';
import {
  LIFECYCLE_ACTIONS, asLifecycleRefusal, asOfOf, authorIntake, decideIntake, idOf, proposeIntake, refuseLifecycle, rejectionOf, transitionIntake, typeOf,
} from './lifecycle-logic.js';

type Row = Record<string, unknown>;
export type LcScope = { tenantId: string; domainId: string };

const routeOf = (s: LcScope, action: string, objectType: string | null, objectId: string | null): RouteInfo =>
  ({ scope: 'DOMAIN', tenantId: s.tenantId, domainId: s.domainId, action, objectType, objectId });
const derive = (base: Envelope, action: string, objectType: string | null, objectId: string | null): Envelope =>
  ({ ...base, action, object_type: objectType ?? 'OLC', object_id: objectId, side_effect_class: action === LIFECYCLE_ACTIONS.read ? 'none' : 'reversible', message_id: newId() }) as Envelope;
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const mapped = async <T>(env: Envelope, f: () => Promise<T>): Promise<T> => { try { return await f(); } catch (e) { throw asLifecycleRefusal(e, env.correlation_id); } };

@Injectable()
export class LifecycleService {
  constructor(private readonly pipeline: PipelineService) {}

  private read<T>(env: Envelope, p: AuthenticatedPrincipal, s: LcScope, type: string | null, id: string | null, f: (cap: LifecycleReads) => Promise<T>) {
    return mapped(env, () => this.pipeline.consequentialRead(derive(env, LIFECYCLE_ACTIONS.read, type, id), p, routeOf(s, LIFECYCLE_ACTIONS.read, type, id), LifecycleCapability.read,
      async (cap) => f(cap)));
  }

  /* ───────────────────────── reads ───────────────────────── */
  async profiles(env: Envelope, p: AuthenticatedPrincipal, s: LcScope) {
    const out = await this.read(env, p, s, null, null, (cap) => cap.profiles());
    return { profiles: out.result, receipt: receipt(out) };
  }
  async list(env: Envelope, p: AuthenticatedPrincipal, s: LcScope, typeRaw: string, body: Row) {
    const type = typeOf(typeRaw, 'lifecycle read', env.correlation_id);
    const limit = typeof body['limit'] === 'number' && Number.isInteger(body['limit']) ? (body['limit'] as number) : 50;
    const out = await this.read(env, p, s, type, null, (cap) => cap.objects({ ...s, objectType: type, limit }));
    return { objects: out.result, receipt: receipt(out) };
  }
  async history(env: Envelope, p: AuthenticatedPrincipal, s: LcScope, typeRaw: string, idRaw: string) {
    const type = typeOf(typeRaw, 'lifecycle read', env.correlation_id);
    const id = idOf(idRaw, 'lifecycle read', 'unknown_object', 'the object', env.correlation_id);
    const out = await this.read(env, p, s, type, id, (cap) => cap.history({ ...s, objectId: id }));
    const object = (out.result['object'] ?? {}) as Row;
    if (object['object_type'] !== type) throw refuseLifecycle('lifecycle read', 'unknown_object', `${id} is not a ${type} object`, env.correlation_id);
    return { lifecycle: out.result, receipt: receipt(out) };
  }
  async replay(env: Envelope, p: AuthenticatedPrincipal, s: LcScope, typeRaw: string, idRaw: string, body: Row) {
    const type = typeOf(typeRaw, 'lifecycle read', env.correlation_id);
    const id = idOf(idRaw, 'lifecycle read', 'unknown_object', 'the object', env.correlation_id);
    const asOf = asOfOf(body['asOf'], env.correlation_id);
    const out = await this.read(env, p, s, type, id, (cap) => cap.replay({ ...s, objectId: id, asOf }));
    return { replay: out.result, receipt: receipt(out) };
  }
  async reconcile(env: Envelope, p: AuthenticatedPrincipal, s: LcScope) {
    const out = await this.read(env, p, s, null, null, (cap) => cap.reconcile(s));
    return { reconciliation: out.result, receipt: receipt(out) };
  }
  async exportDoc(env: Envelope, p: AuthenticatedPrincipal, s: LcScope, typeRaw: string, idRaw: string) {
    const type = typeOf(typeRaw, 'lifecycle read', env.correlation_id);
    const id = idOf(idRaw, 'lifecycle read', 'unknown_object', 'the object', env.correlation_id);
    const out = await this.read(env, p, s, type, id, (cap) => cap.exportDoc({ ...s, objectId: id }));
    return { document: out.result, receipt: receipt(out) };
  }
  async verifyExport(env: Envelope, p: AuthenticatedPrincipal, s: LcScope, body: Row) {
    const doc = body['document'];
    if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) throw refuseLifecycle('lifecycle read', 'document', 'document is the exported lifecycle document', env.correlation_id);
    const out = await this.read(env, p, s, null, null, (cap) => cap.verifyExport(doc as Row));
    return { verification: out.result, receipt: receipt(out) };
  }

  /* ───────────────────────── writes ───────────────────────── */
  /** AUTHOR a work object (the draft, version 1) — human-gated; the author is its accountable owner. */
  async author(env: Envelope, p: AuthenticatedPrincipal, s: LcScope, body: Row) {
    const cid = env.correlation_id;
    const i = authorIntake(body, cid);
    const objectId = newId();   // Gate-2.2 C6: the target is fixed BEFORE the capability is minted
    const route = routeOf(s, LIFECYCLE_ACTIONS.author, i.objectType, objectId);
    const out = await mapped(env, () => this.pipeline.write(derive(env, route.action, i.objectType, objectId), p, route, LifecycleCapability.write, async (cap: LifecycleWrites) => {
      const r = await cap.author({ ...s, ...i, objectId, actor: p.principalId, correlationId: cid });
      const repeated = r['repeated'] === true;
      return { result: r, targetType: i.objectType, targetId: String(r['object_id']), targetVersion: '1',
        outboxEvent: repeated ? null : { eventType: 'WorkObjectAuthored', payload: { schema_version: 'v1', object_id: r['object_id'], object_type: i.objectType, object_version: 1, transition_id: r['transition_id'] } } };
    }));
    return { transition: out.result, receipt: receipt(out) };
  }

  /** TRANSITION a work object — human-gated; the port decides accepted | rejected | compensated and KEEPS every attempt. */
  async transition(env: Envelope, p: AuthenticatedPrincipal, s: LcScope, typeRaw: string, idRaw: string, body: Row) {
    const cid = env.correlation_id;
    const type = typeOf(typeRaw, 'lifecycle transition', cid);
    const id = idOf(idRaw, 'lifecycle transition', 'unknown_object', 'the object', cid);
    const i = transitionIntake(body, cid);
    const route = routeOf(s, LIFECYCLE_ACTIONS.transition, type, id);
    const out = await mapped(env, () => this.pipeline.write(derive(env, route.action, type, id), p, route, LifecycleCapability.write, async (cap: LifecycleWrites) => {
      const r = await cap.transition({ ...s, objectType: type, objectId: id, ...i, actor: p.principalId, correlationId: cid });
      return this.effectOf(r, type, id);
    }));
    const refused = rejectionOf(out.result, cid, receipt(out));
    if (refused !== null) throw refused;
    return { transition: out.result, receipt: receipt(out) };
  }

  /** PROPOSE a transition — a view, an agent, a model, an import or a projection; never authoritative. */
  async propose(env: Envelope, p: AuthenticatedPrincipal, s: LcScope, typeRaw: string, idRaw: string, body: Row) {
    const cid = env.correlation_id;
    const type = typeOf(typeRaw, 'lifecycle proposal', cid);
    const id = idOf(idRaw, 'lifecycle proposal', 'unknown_object', 'the object', cid);
    const i = proposeIntake(body, cid);
    const route = routeOf(s, LIFECYCLE_ACTIONS.propose, type, id);
    const out = await mapped(env, () => this.pipeline.write(derive(env, route.action, type, id), p, route, LifecycleCapability.write, async (cap: LifecycleWrites) => {
      const r = await cap.propose({ ...s, objectType: type, objectId: id, ...i, actor: p.principalId, correlationId: cid });
      return { result: r, targetType: type, targetId: id, targetVersion: String(r['base_version']), outboxEvent: null };
    }));
    return { proposal: out.result, receipt: receipt(out) };
  }

  /** DECIDE a proposal — the accountable owner only (re-checked in the port); accept performs the transition through the same rules. */
  async decide(env: Envelope, p: AuthenticatedPrincipal, s: LcScope, typeRaw: string, idRaw: string, proposalRaw: string, body: Row) {
    const cid = env.correlation_id;
    const type = typeOf(typeRaw, 'lifecycle proposal', cid);
    const id = idOf(idRaw, 'lifecycle proposal', 'unknown_object', 'the object', cid);
    const proposalId = idOf(proposalRaw, 'lifecycle proposal', 'unknown_proposal', 'the proposal', cid);
    const i = decideIntake(body, cid);
    const route = routeOf(s, LIFECYCLE_ACTIONS.decide, type, id);
    const out = await mapped(env, () => this.pipeline.write(derive(env, route.action, type, id), p, route, LifecycleCapability.write, async (cap: LifecycleWrites) => {
      const r = await cap.decide({ ...s, objectId: id, proposalId, ...i, actor: p.principalId, correlationId: cid });
      const t = (r['transition'] ?? null) as Row | null;
      if (t !== null) {
        const e = this.effectOf(t, type, id);
        return { ...e, result: r };
      }
      return { result: r, targetType: type, targetId: id, targetVersion: null, outboxEvent: null };
    }));
    const t = (out.result['transition'] ?? null) as Row | null;
    const refused = t === null ? null : rejectionOf(t, cid, receipt(out));
    if (refused !== null) throw refused;
    return { decision: out.result, receipt: receipt(out) };
  }

  /** The write's effect: an accepted / compensated transition wrote a version and announces it; a rejected one is evidence only. */
  private effectOf(r: Row, type: string, id: string) {
    const outcome = String(r['outcome']);
    const repeated = r['repeated'] === true;
    if (outcome === 'rejected') {
      return { result: r, targetType: type, targetId: id, targetVersion: r['last_authoritative_version'] === null || r['last_authoritative_version'] === undefined ? null : String(r['last_authoritative_version']),
        outboxEvent: null,
        evidence: { outcome: 'failure' as const, resultCode: 'EYE-STA-002', metadata: { lifecycle: 'rejected', refusal_code: (r['refusal'] as Row | null)?.['code'] ?? null, repeated } } };
    }
    return { result: r, targetType: type, targetId: id, targetVersion: String(r['object_version']),
      outboxEvent: repeated ? null : { eventType: 'WorkObjectLifecycleTransitioned', payload: { schema_version: 'v1', object_id: id, object_type: type, object_version: r['object_version'],
        transition_id: r['transition_id'], action: r['action'], kind: r['kind'], outcome, from: r['from'], to: r['to'] } } };
  }
}

/** The route's envelope and principal, or the request refusal (as every controller of the Eye answers it). */
export function requestOf(req: { eyeEnvelope?: Envelope; eyePrincipal?: AuthenticatedPrincipal }, cid: string) {
  if (req.eyeEnvelope === undefined || req.eyePrincipal === undefined) throw new HttpException(errorBody('EYE_REQ_001', cid), 400);
  return { envelope: req.eyeEnvelope, principal: req.eyePrincipal };
}
