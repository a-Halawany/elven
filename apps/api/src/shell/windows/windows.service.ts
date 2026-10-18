/**
 * B81 §LY-M (0119_b81_x_lym) — THE WINDOWS SERVICE: the intakes shaped (types only — the ports decide every rule: the human, the current
 * session, the same person, single use, expiry, the one control surface, the location's keys, the stale check), the pipeline idiom (an
 * audited consequential read; a governed write with its receipt), the refusals in the class form.
 *
 *   session handoff      offer (`shell.handoff.offer`) · claim (`shell.handoff.claim`) · revoke (`shell.handoff.revoke`) · read (`shell.handoff.read`)
 *                        — PLATFORM (the admin workspace) or DOMAIN
 *   presentation state   publish (`shell.presentation.publish`) · read (`shell.presentation.read`) — DOMAIN only (a display shows a domain's work)
 *
 * NOTHING HERE EXECUTES AN ACT. A handoff moves a person's review context between their OWN signed-in sessions and carries no authority —
 * the claiming session acts only with its own roles, re-read at the claim. A presentation state names what a display shows; a display
 * commands nothing.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService, type RouteInfo } from '../../pipeline/pipeline.service.js';
import { WindowCapability } from './windows.capabilities.js';

type Row = Record<string, unknown>;
export type WindowNoun = 'session handoff' | 'presentation state';
/** The nouns this part's refusals speak in — to be mapped centrally (observation-errors.ts) at integration. */
export const WINDOW_NOUNS: readonly WindowNoun[] = ['session handoff', 'presentation state'];
export const HANDOFF_OFFER = 'shell.handoff.offer';
export const HANDOFF_CLAIM = 'shell.handoff.claim';
export const HANDOFF_REVOKE = 'shell.handoff.revoke';
export const HANDOFF_READ = 'shell.handoff.read';
export const PRESENTATION_PUBLISH = 'shell.presentation.publish';
export const PRESENTATION_READ = 'shell.presentation.read';
export const AUDIENCES = ['private', 'briefing_room', 'operations_centre', 'kiosk'] as const;
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
const DISPLAY = /^[a-z][a-z0-9_.-]{1,60}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/;
const CODE = (s: number) => (s === 403 ? 'EYE_AUT_001' : s === 404 ? 'EYE_STA_001' : s === 409 ? 'EYE_STA_002' : 'EYE_REQ_001');

/** A refusal in the class form, answered by the route before any port runs (the caller's own request). */
export function refuseWindow(noun: WindowNoun, cls: string, message: string, correlationId: string, status = 422): HttpException {
  return new HttpException(errorBody(CODE(status) as never, correlationId, `${noun} rejected (${cls}): ${message}`), status);
}
const isObj = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const optText = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v : null);

export interface OfferIntake { workspace: string; location: Row; viewContext: Row; display: string | null; targetDevice: string | null; expiresIn: number | null }
/** The offer's intake: the TYPES of what the port validates (the port is the authority on every rule). */
export function validateOffer(p: Row, cid: string): OfferIntake {
  const workspace = typeof p['workspace'] === 'string' ? p['workspace'] : '';
  if (workspace === '') throw refuseWindow('session handoff', 'workspace', 'a handoff names the workspace of the review it moves', cid);
  if (!isObj(p['location'])) throw refuseWindow('session handoff', 'location', 'the location is an object {route, section?, query?, filters?, view?, selection?, object?, task?, title?}', cid);
  const vc = p['viewContext'];
  if (vc !== undefined && vc !== null && !isObj(vc)) throw refuseWindow('session handoff', 'context', 'the view context is an object of the context-bar dimensions', cid);
  const display = optText(p['display']);
  if (display !== null && !DISPLAY.test(display)) throw refuseWindow('session handoff', 'display', 'a display is named in lower case (operations-room, briefing-wall)', cid);
  const e = p['expiresInSeconds'];
  if (e !== undefined && e !== null && (typeof e !== 'number' || !Number.isInteger(e))) throw refuseWindow('session handoff', 'expiry', 'expiresInSeconds is a whole number of seconds (60–1800)', cid);
  return { workspace, location: p['location'], viewContext: isObj(vc) ? vc : {}, display, targetDevice: optText(p['targetDevice']), expiresIn: typeof e === 'number' ? e : null };
}
export function validateHandoffRef(p: Row, cid: string): { handoffId: string; reason: string | null } {
  const id = typeof p['handoffId'] === 'string' ? p['handoffId'] : '';
  if (!UUID.test(id)) throw refuseWindow('session handoff', 'handoff', 'name the handoff by its id', cid);
  const reason = p['reason'];
  if (reason !== undefined && reason !== null && typeof reason !== 'string') throw refuseWindow('session handoff', 'reason', 'a reason is a short text', cid);
  return { handoffId: id.toLowerCase(), reason: optText(reason) };
}
export interface PublishIntake { display: string; expectedVersion: number; status: 'presenting' | 'ended'; location: Row | null; viewContext: Row; watermark: string | null;
  classification: string | null; audience: string | null }
export function validatePublish(p: Row, cid: string): PublishIntake {
  const display = typeof p['display'] === 'string' ? p['display'] : '';
  if (!DISPLAY.test(display)) throw refuseWindow('presentation state', 'display', 'a display is named in lower case (operations-room, briefing-wall)', cid);
  const ev = p['expectedVersion'];
  if (typeof ev !== 'number' || !Number.isInteger(ev) || ev < 0) throw refuseWindow('presentation state', 'version', 'expectedVersion is the version the client read (0 when there was none)', cid);
  const status = p['status'];
  if (status !== 'presenting' && status !== 'ended') throw refuseWindow('presentation state', 'status', 'a display is presenting or ended', cid);
  const l = p['location'];
  if (l !== undefined && l !== null && !isObj(l)) throw refuseWindow('presentation state', 'location', 'the location is an object {route, …}', cid);
  const vc = p['viewContext'];
  if (vc !== undefined && vc !== null && !isObj(vc)) throw refuseWindow('presentation state', 'context', 'the view context is an object of the context-bar dimensions', cid);
  const w = optText(p['watermark']);
  if (w !== null && (!ISO.test(w) || Number.isNaN(Date.parse(w)))) throw refuseWindow('presentation state', 'watermark', 'the data watermark is an ISO instant', cid);
  const c = optText(p['classification']);
  if (c !== null && !(CLASSIFICATIONS as readonly string[]).includes(c)) throw refuseWindow('presentation state', 'classification', 'the classification is public, internal, confidential or restricted', cid);
  const a = optText(p['audience']);
  if (a !== null && !(AUDIENCES as readonly string[]).includes(a)) throw refuseWindow('presentation state', 'audience', `the audience is ${AUDIENCES.join(', ')}`, cid);
  return { display, expectedVersion: ev, status, location: isObj(l) ? l : null, viewContext: isObj(vc) ? vc : {}, watermark: w, classification: c, audience: a };
}

type Scope = { tenantId: string | null; domainId: string | null };
const routeOf = (s: Scope, action: string, objectType: string, objectId: string | null): RouteInfo =>
  (s.tenantId === null ? { scope: 'PLATFORM', tenantId: null, domainId: null, action, objectType, objectId } : { scope: 'DOMAIN', tenantId: s.tenantId, domainId: s.domainId, action, objectType, objectId });
const derive = (base: Envelope, action: string, objectType: string, objectId: string | null): Envelope =>
  ({ ...base, action, object_type: objectType, object_id: objectId, side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', message_id: newId() } as Envelope);
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

@Injectable()
export class WindowsService {
  constructor(private readonly pipeline: PipelineService) {}

  /** The principal's OWN handoffs (newest first), each with its state at the database clock. */
  async handoffs(env: Envelope, p: AuthenticatedPrincipal, s: Scope, body: Row) {
    const limit = typeof body['limit'] === 'number' && Number.isInteger(body['limit']) ? Math.max(1, Math.min(100, body['limit'])) : 20;
    const out = await this.pipeline.consequentialRead(derive(env, HANDOFF_READ, 'HND', null), p, routeOf(s, HANDOFF_READ, 'HND', null), WindowCapability.read,
      async (cap, scope) => cap.handoffsOf({ principalId: p.principalId, tenantId: scope.tenantId ?? null, domainId: scope.domainId ?? null, limit }));
    return { handoffs: out.result, receipt: receipt(out) };
  }

  /** OFFER the review context from this session (PAT-45) — expiry bounded; no role, no grant. */
  async offer(env: Envelope, p: AuthenticatedPrincipal, s: Scope, body: Row) {
    const intake = validateOffer(body, env.correlation_id);
    const handoffId = newId();
    const out = await this.pipeline.write(derive(env, HANDOFF_OFFER, 'HND', handoffId), p, routeOf(s, HANDOFF_OFFER, 'HND', handoffId), WindowCapability.write,
      async (cap, scope) => {
        const r = await cap.offer({ handoffId, tenantId: scope.tenantId ?? null, domainId: scope.domainId ?? null, ...intake, actor: p.principalId, correlationId: env.correlation_id });
        return { result: r, targetType: 'HND', targetId: handoffId, targetVersion: '1', outboxEvent: null };
      });
    return { handoff: out.result, receipt: receipt(out) };
  }

  /** CLAIM it from another of the same person's signed-in sessions — single use; the claiming session's own roles re-read. */
  async claim(env: Envelope, p: AuthenticatedPrincipal, s: Scope, body: Row) {
    const { handoffId } = validateHandoffRef(body, env.correlation_id);
    const receiptId = newId();
    const out = await this.pipeline.write(derive(env, HANDOFF_CLAIM, 'HND', handoffId), p, routeOf(s, HANDOFF_CLAIM, 'HND', handoffId), WindowCapability.write,
      async (cap) => ({ result: await cap.claim({ handoffId, receiptId, actor: p.principalId, correlationId: env.correlation_id }), targetType: 'HND', targetId: handoffId, targetVersion: '2', outboxEvent: null }));
    return { handoff: out.result, receipt: receipt(out) };
  }

  /** REVOKE an open offer (the offer and its revocation stay recorded). */
  async revoke(env: Envelope, p: AuthenticatedPrincipal, s: Scope, body: Row) {
    const { handoffId, reason } = validateHandoffRef(body, env.correlation_id);
    const receiptId = newId();
    const out = await this.pipeline.write(derive(env, HANDOFF_REVOKE, 'HND', handoffId), p, routeOf(s, HANDOFF_REVOKE, 'HND', handoffId), WindowCapability.write,
      async (cap) => ({ result: await cap.revoke({ handoffId, receiptId, reason, actor: p.principalId, correlationId: env.correlation_id }), targetType: 'HND', targetId: handoffId, targetVersion: '2', outboxEvent: null }));
    return { handoff: out.result, receipt: receipt(out) };
  }

  /** The principal's OWN displays (current state per display + its history). DOMAIN only. */
  async presentations(env: Envelope, p: AuthenticatedPrincipal, s: Scope, body: Row) {
    const d = optText(body['display']);
    if (d !== null && !DISPLAY.test(d)) throw refuseWindow('presentation state', 'display', 'a display is named in lower case', env.correlation_id);
    const history = typeof body['history'] === 'number' && Number.isInteger(body['history']) ? Math.max(0, Math.min(50, body['history'])) : 5;
    const out = await this.pipeline.consequentialRead(derive(env, PRESENTATION_READ, 'PRS', null), p, routeOf(s, PRESENTATION_READ, 'PRS', null), WindowCapability.read,
      async (cap, scope) => cap.presentationOf({ principalId: p.principalId, tenantId: scope.tenantId ?? null, domainId: scope.domainId ?? null, display: d, history }));
    return { presentations: out.result, receipt: receipt(out) };
  }

  /** PUBLISH what a display shows (a new version; only from its control surface; `(stale)` when it read an older version). DOMAIN only. */
  async publish(env: Envelope, p: AuthenticatedPrincipal, s: Scope, body: Row) {
    const intake = validatePublish(body, env.correlation_id);
    const stateId = newId();
    const out = await this.pipeline.write(derive(env, PRESENTATION_PUBLISH, 'PRS', stateId), p, routeOf(s, PRESENTATION_PUBLISH, 'PRS', stateId), WindowCapability.write,
      async (cap, scope) => {
        const r = await cap.publish({ stateId, tenantId: scope.tenantId ?? null, domainId: scope.domainId ?? null, ...intake, actor: p.principalId, correlationId: env.correlation_id });
        return { result: r, targetType: 'PRS', targetId: String(r['state_id'] ?? stateId), targetVersion: String(r['version'] ?? ''), outboxEvent: null };
      });
    return { presentation: out.result, receipt: receipt(out) };
  }
}
