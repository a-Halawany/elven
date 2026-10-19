/**
 * CP-6 B82 §GM (0121_b82_x_gm; CMP-064, VIZ-16/17/18, DESIGN D4) — THE GEOGRAPHIC-REFERENCE SERVICE: the pipeline's audited read of the layer
 * (`graph.geo.read`) and the register's two human-gated acts — a named data steward DECLARES (or revises) a reference
 * (`graph.geo.declare`) and RETIRES one (`graph.geo.retire`). The intake is shaped here (TYPES only — every rule is the port's: the CRS,
 * the geometry, the key, the statements, the role, the version read).
 *
 * THE RETRY RULE (PAT-20): an act carries a request id (the command identity). A retry after an unknown outcome REUSES it and the port
 * answers the recorded version (`replayed: true`); a new act takes a new id.
 *
 * THE REFUSAL NOUN `geographic reference` (class form) is mapped HERE until the integrator maps it centrally (observation-errors.ts):
 * 403 actor|authority|separation_of_duties · 404 unknown_* · 409 stale|state|duplicate · 422 the rest — always in the port's own words.
 *
 * THREE CLAIMS: construction (this code and phase6-geography-b82, every reference SYNTHETIC); demonstrated operation (the act — F. Aydın,
 * SYNTHETIC); real acceptance — never claimed. No tiles, no network, no imported geodata (D4).
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService, type RouteInfo } from '../../pipeline/pipeline.service.js';
import { GeoCapability } from './geo.capabilities.js';

type Row = Record<string, unknown>;
export const GEO_ACTIONS = { read: 'graph.geo.read', declare: 'graph.geo.declare', retire: 'graph.geo.retire' } as const;
/** The refusal noun of this part — to be mapped centrally (observation-errors.ts) at integration. */
export const GEO_NOUN = 'geographic reference';
export const GEO_KINDS = ['chokepoint', 'port', 'site', 'route', 'area'] as const;
const OBJECT_TYPE = 'GEO';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = (s: number) => (s === 403 ? 'EYE_AUT_001' : s === 404 ? 'EYE_STA_001' : s === 409 ? 'EYE_STA_002' : 'EYE_REQ_001');

/** The class of a port's refusal → its HTTP answer, in the PORT's words. Anything else is re-thrown untouched. */
export function asGeoRefusal(e: unknown, correlationId: string): unknown {
  if (e instanceof HttpException || !(e instanceof Error)) return e;
  const m = /^geographic reference rejected \(([a-z_]+)\)/.exec(e.message);
  if (m === null) return e;
  const cls = m[1]!;
  const status = cls === 'actor' || cls === 'authority' || cls === 'separation_of_duties' ? 403
    : cls.startsWith('unknown_') ? 404 : ['stale', 'state', 'duplicate'].includes(cls) ? 409 : 422;
  return new HttpException(errorBody(CODE(status) as never, correlationId, e.message), status);
}
const mapped = async <T>(env: Envelope, f: () => Promise<T>): Promise<T> => { try { return await f(); } catch (e) { throw asGeoRefusal(e, env.correlation_id); } };

/** A refusal answered by the route before any port runs (the caller's own request shape). */
export function refuseGeo(cls: string, message: string, correlationId: string, status = 422): HttpException {
  return new HttpException(errorBody(CODE(status) as never, correlationId, `${GEO_NOUN} rejected (${cls}): ${message}`), status);
}

export type GeoScope = { tenantId: string; domainId: string };
const routeOf = (s: GeoScope, action: string, objectId: string | null): RouteInfo =>
  ({ scope: 'DOMAIN', tenantId: s.tenantId, domainId: s.domainId, action, objectType: OBJECT_TYPE, objectId });
const derive = (base: Envelope, action: string, objectId: string | null): Envelope =>
  ({ ...base, action, object_type: OBJECT_TYPE, object_id: objectId, side_effect_class: action === GEO_ACTIONS.read ? 'none' : 'reversible', message_id: newId() }) as Envelope;
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
const str = (p: Row, k: string): string | null => (typeof p[k] === 'string' && (p[k] as string).trim() !== '' ? (p[k] as string).trim() : null);
function idOf(v: unknown, cls: string, what: string, cid: string, status = 422): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseGeo(cls, `${what} is an id`, cid, status);
  return v.toLowerCase();
}
function versionOf(v: unknown, cid: string, min: number): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min) throw refuseGeo('version', `expectedVersion is the version the steward read (${min === 0 ? '0 for a new reference' : 'the current version'})`, cid);
  return v;
}

/** The layer's scope as the read takes it (the port validates the members; here only the shape is carried). */
export function layerScopeIntake(p: Row, cid: string): Row {
  const out: Row = {};
  for (const k of Object.keys(p)) {
    if (!['keys', 'kinds', 'referenceId', 'includeRetired'].includes(k)) throw refuseGeo('layer_scope', 'a layer is asked by keys, kinds, referenceId and includeRetired only', cid);
  }
  if (p['keys'] !== undefined) out['keys'] = p['keys'];
  if (p['kinds'] !== undefined) out['kinds'] = p['kinds'];
  if (p['referenceId'] !== undefined) out['reference_id'] = p['referenceId'];
  if (p['includeRetired'] !== undefined) out['include_retired'] = p['includeRetired'];
  return out;
}

@Injectable()
export class GeoService {
  constructor(private readonly pipeline: PipelineService) {}

  /** THE LAYER (graph.geo.read, audited): the current references, the history of one on request, the bounds and the map's statement. */
  async layer(env: Envelope, p: AuthenticatedPrincipal, s: GeoScope, body: Row) {
    const scope = layerScopeIntake(body, env.correlation_id);
    const objectId = typeof scope['reference_id'] === 'string' && UUID.test(scope['reference_id']) ? (scope['reference_id'] as string).toLowerCase() : null;
    const out = await mapped(env, () => this.pipeline.consequentialRead(derive(env, GEO_ACTIONS.read, objectId), p, routeOf(s, GEO_ACTIONS.read, objectId), GeoCapability.read,
      async (cap) => cap.layer({ tenantId: s.tenantId, domainId: s.domainId, scope })));
    return { layer: out.result, receipt: receipt(out) };
  }

  /** DECLARE a new reference (no referenceId, expectedVersion 0) or REVISE one (its id, the version read) — human-gated, data steward. */
  async declare(env: Envelope, p: AuthenticatedPrincipal, s: GeoScope, body: Row, referenceIdRaw: string | null) {
    const cid = env.correlation_id;
    const requestId = idOf(body['requestId'], 'request', 'requestId (the command identity a retry reuses)', cid);
    const referenceId = referenceIdRaw === null ? null : idOf(referenceIdRaw, 'unknown_reference', 'the reference', cid, 404);
    const expectedVersion = versionOf(body['expectedVersion'], cid, referenceId === null ? 0 : 1);
    const geometry = body['geometry'];
    if (geometry === null || typeof geometry !== 'object' || Array.isArray(geometry)) throw refuseGeo('geometry', 'the geometry is a GeoJSON object {type, coordinates}', cid);
    const u = body['uncertaintyM'];
    if (typeof u !== 'number' || !Number.isFinite(u)) throw refuseGeo('uncertainty', 'uncertaintyM is the positional uncertainty in metres (a number)', cid);
    const linked = body['linked'];
    let linkedType: string | null = null; let linkedId: string | null = null;
    if (linked !== undefined && linked !== null) {
      if (typeof linked !== 'object' || typeof (linked as Row)['type'] !== 'string' || typeof (linked as Row)['id'] !== 'string') throw refuseGeo('linked', 'linked is {type, id} of a recorded object', cid);
      linkedType = (linked as Row)['type'] as string; linkedId = idOf((linked as Row)['id'], 'linked', 'the linked object', cid);
    }
    const intake = {
      requestId, tenantId: s.tenantId, domainId: s.domainId, referenceId, expectedVersion,
      key: str(body, 'key') ?? '', label: str(body, 'label') ?? '', kind: str(body, 'kind') ?? '', geometry: geometry as Row, crs: str(body, 'crs') ?? '',
      uncertaintyM: u, sourceStatement: str(body, 'sourceStatement') ?? '', licenceStatement: str(body, 'licenceStatement') ?? '',
      linkedType, linkedId, chokepointKey: str(body, 'chokepointKey'), reason: str(body, 'reason') ?? '', actor: p.principalId, correlationId: cid,
    };
    const action = GEO_ACTIONS.declare;
    const out = await mapped(env, () => this.pipeline.write(derive(env, action, referenceId), p, routeOf(s, action, referenceId), GeoCapability.write, async (cap) => {
      const r = await cap.declare(intake);
      return { result: r, targetType: OBJECT_TYPE, targetId: String(r['reference_id']), targetVersion: String(r['version']), outboxEvent: null };
    }));
    return { reference: out.result, receipt: receipt(out) };
  }

  /** RETIRE a reference at the version read — human-gated, data steward; the reason says what was wrong. */
  async retire(env: Envelope, p: AuthenticatedPrincipal, s: GeoScope, referenceIdRaw: string, body: Row) {
    const cid = env.correlation_id;
    const referenceId = idOf(referenceIdRaw, 'unknown_reference', 'the reference', cid, 404);
    const requestId = idOf(body['requestId'], 'request', 'requestId (the command identity a retry reuses)', cid);
    const expectedVersion = versionOf(body['expectedVersion'], cid, 1);
    const intake = { requestId, tenantId: s.tenantId, domainId: s.domainId, referenceId, expectedVersion, reason: str(body, 'reason') ?? '', actor: p.principalId, correlationId: cid };
    const out = await mapped(env, () => this.pipeline.write(derive(env, GEO_ACTIONS.retire, referenceId), p, routeOf(s, GEO_ACTIONS.retire, referenceId), GeoCapability.write, async (cap) => {
      const r = await cap.retire(intake);
      return { result: r, targetType: OBJECT_TYPE, targetId: referenceId, targetVersion: String(r['version']), outboxEvent: null };
    }));
    return { reference: out.result, receipt: receipt(out) };
  }
}

/** The route's envelope and principal, or the request refusal (as every controller of the Eye answers it). */
export function requestOf(req: { eyeEnvelope?: Envelope; eyePrincipal?: AuthenticatedPrincipal }, cid: string) {
  if (req.eyeEnvelope === undefined || req.eyePrincipal === undefined) throw new HttpException(errorBody('EYE_REQ_001', cid), 400);
  return { envelope: req.eyeEnvelope, principal: req.eyePrincipal };
}
