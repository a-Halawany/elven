/**
 * B80 §SH (0118_b80_x_sh) — THE NAVIGATION SERVICE: the intake shaped (types only — the port decides every rule), the pipeline idiom (an
 * audited consequential read; a governed write with its receipt), the refusals in the class form `<noun> rejected (<class>): …`.
 *
 *   navigation state   save (`shell.navigation.save`) · read (`shell.navigation.read`) — PLATFORM (the admin workspace) or DOMAIN
 *   warning as-of      the deep link's read (`prediction.read` — the warning readers' own action: who may read the warnings list may read a
 *                      warning's recorded past; the port adds the scope check and the denial privacy)
 *
 * Opening a deep link performs READS only: the read leaves its own access evidence (POL + AUD of a `*.read` action — every read of the Eye
 * does) and changes no business record — nothing is acknowledged, approved or advanced by opening, copying or restoring a link.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService, type RouteInfo } from '../../pipeline/pipeline.service.js';
import { NavigationCapability } from './navigation.capabilities.js';

type Row = Record<string, unknown>;
export type NavigationNoun = 'navigation state' | 'warning as-of';
/** The nouns this part's refusals speak in — to be mapped centrally (observation-errors.ts) at integration. */
export const NAVIGATION_NOUNS: readonly NavigationNoun[] = ['navigation state', 'warning as-of'];
export const NAV_SAVE = 'shell.navigation.save';
export const NAV_READ = 'shell.navigation.read';
export const WARNING_AS_OF_READ = 'prediction.read';
export const WORKSPACES = ['admin', 'home', 'decisions', 'graph', 'intelligence', 'observation', 'prediction', 'twins'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const CODE = (s: number) => (s === 403 ? 'EYE_AUT_001' : s === 404 ? 'EYE_STA_001' : s === 409 ? 'EYE_STA_002' : 'EYE_REQ_001');

/** A refusal in the class form, answered by the route before any port runs (the caller's own request). */
export function refuseNavigation(noun: NavigationNoun, cls: string, message: string, correlationId: string, status = 422): HttpException {
  return new HttpException(errorBody(CODE(status) as never, correlationId, `${noun} rejected (${cls}): ${message}`), status);
}

export interface SaveIntake { workspace: string; expectedVersion: number; location: Row; returnPath: string | null; focus: string | null; recent: Row[]; favorites: Row[] }

const isObj = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
/** The save's intake: the TYPES of what the port validates key by key (the port is the authority on every rule). */
export function validateSave(p: Row, cid: string): SaveIntake {
  const workspace = typeof p['workspace'] === 'string' ? p['workspace'] : '';
  if (!(WORKSPACES as readonly string[]).includes(workspace)) throw refuseNavigation('navigation state', 'workspace', `the workspace is one of ${WORKSPACES.join(', ')}`, cid);
  const ev = p['expectedVersion'];
  if (typeof ev !== 'number' || !Number.isInteger(ev) || ev < 0) throw refuseNavigation('navigation state', 'version', 'expectedVersion is the version the client read (0 when there was none)', cid);
  if (!isObj(p['location'])) throw refuseNavigation('navigation state', 'location', 'the location is an object {route, section?, query?, filters?, view?, selection?, object?, task?, title?}', cid);
  const str = (k: string): string | null => (p[k] === undefined || p[k] === null || p[k] === '' ? null : typeof p[k] === 'string' ? (p[k] as string) : '\u0000');
  const returnPath = str('returnPath'); const focus = str('focus');
  if (returnPath === '\u0000') throw refuseNavigation('navigation state', 'return_path', 'the return path is an in-app location', cid);
  if (focus === '\u0000') throw refuseNavigation('navigation state', 'focus', 'the focus target is an element id', cid);
  const list = (k: string): Row[] => {
    const v = p[k];
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || !v.every(isObj)) throw refuseNavigation('navigation state', k, `${k} is a list of {route, title}`, cid);
    return v as Row[];
  };
  return { workspace, expectedVersion: ev, location: p['location'] as Row, returnPath, focus, recent: list('recent'), favorites: list('favorites') };
}

/** The as-of instant of a link: an ISO instant with its zone (never a local wall-clock time the server would have to guess). */
export function validateInstant(v: unknown, cid: string): string {
  if (typeof v !== 'string' || !ISO.test(v) || Number.isNaN(Date.parse(v))) throw refuseNavigation('warning as-of', 'instant', 'the link names an ISO instant with its zone (…Z or ±hh:mm)', cid);
  return v;
}
export function validateWarningId(v: unknown, cid: string): string {
  // a malformed id answers the SAME words as an unknown or unauthorized one (denial privacy) — but with the request class it is
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseNavigation('warning as-of', 'unknown_warning', 'no authorized warning matches this link', cid, 404);
  return v;
}

type Scope = { tenantId: string | null; domainId: string | null };
const routeOf = (s: Scope, action: string, objectType: string, objectId: string | null): RouteInfo =>
  (s.tenantId === null ? { scope: 'PLATFORM', tenantId: null, domainId: null, action, objectType, objectId } : { scope: 'DOMAIN', tenantId: s.tenantId, domainId: s.domainId, action, objectType, objectId });
const derive = (base: Envelope, action: string, objectType: string, objectId: string | null): Envelope =>
  ({ ...base, action, object_type: objectType, object_id: objectId, side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', message_id: newId() } as Envelope);
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

@Injectable()
export class NavigationService {
  constructor(private readonly pipeline: PipelineService) {}

  /** The principal's OWN navigation states (the port refuses any other principal); `workspace` null = every workspace of this scope. */
  async read(env: Envelope, p: AuthenticatedPrincipal, s: Scope, body: Row) {
    const ws = typeof body['workspace'] === 'string' && body['workspace'] !== '' ? body['workspace'] : null;
    if (ws !== null && !(WORKSPACES as readonly string[]).includes(ws)) throw refuseNavigation('navigation state', 'workspace', `the workspace is one of ${WORKSPACES.join(', ')}`, env.correlation_id);
    const history = typeof body['history'] === 'number' && Number.isInteger(body['history']) ? Math.max(0, Math.min(50, body['history'])) : 5;
    const out = await this.pipeline.consequentialRead(derive(env, NAV_READ, 'NAV', null), p, routeOf(s, NAV_READ, 'NAV', null), NavigationCapability.read,
      async (cap, scope) => cap.statesOf({ principalId: p.principalId, tenantId: scope.tenantId ?? null, domainId: scope.domainId ?? null, workspace: ws, history }));
    return { navigation: out.result, receipt: receipt(out) };
  }

  /** A new version of the principal's position in one workspace (append-only; a save that read an older version is refused `(stale)`). */
  async save(env: Envelope, p: AuthenticatedPrincipal, s: Scope, body: Row) {
    const intake = validateSave(body, env.correlation_id);
    const stateId = newId();
    const out = await this.pipeline.write(derive(env, NAV_SAVE, 'NAV', stateId), p, routeOf(s, NAV_SAVE, 'NAV', stateId), NavigationCapability.write,
      async (cap, scope) => {
        const r = await cap.save({ stateId, tenantId: scope.tenantId ?? null, domainId: scope.domainId ?? null, ...intake, actor: p.principalId, correlationId: env.correlation_id });
        return { result: r, targetType: 'NAV', targetId: stateId, targetVersion: String(r['version'] ?? ''), outboxEvent: null };
      });
    return { navigation: out.result, receipt: receipt(out) };
  }

  /** THE DEEP LINK's read: a warning AS OF an instant, the exact events up to it and the variance against the current declared state. */
  async warningAsOf(env: Envelope, p: AuthenticatedPrincipal, tenantId: string, domainId: string, warningIdRaw: unknown, atRaw: unknown) {
    const warningId = validateWarningId(warningIdRaw, env.correlation_id);
    const at = validateInstant(atRaw, env.correlation_id);
    const out = await this.pipeline.consequentialRead(derive(env, WARNING_AS_OF_READ, 'WRN', warningId), p, routeOf({ tenantId, domainId }, WARNING_AS_OF_READ, 'WRN', warningId),
      NavigationCapability.read, async (cap) => cap.warningAsOf({ warningId, at }));
    return { warning: out.result, receipt: receipt(out) };
  }
}

/** The route's envelope and principal, or the request refusal (as every controller of the Eye answers it). */
export function requestOf(req: { eyeEnvelope?: Envelope; eyePrincipal?: AuthenticatedPrincipal }, cid: string) {
  if (req.eyeEnvelope === undefined || req.eyePrincipal === undefined) throw new HttpException(errorBody('EYE_REQ_001', cid), 400);
  return { envelope: req.eyeEnvelope, principal: req.eyePrincipal };
}
