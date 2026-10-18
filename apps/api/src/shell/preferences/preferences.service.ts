/**
 * B81 §LY-G (0119_b81_x_lyg) — THE PREFERENCES SERVICE: the intake shaped (types only — the port decides every rule: the layout's keys, the
 * region boundary, the stale check, the human), the pipeline idiom (an audited consequential read; a governed write with its receipt), the
 * refusals in the class form `layout preference rejected (<class>): …`.
 *
 *   layout preference   save (`shell.preferences.save`) · read (`shell.preferences.read`) — PLATFORM (the admin workspace) or DOMAIN
 *
 * PRESENTATION ONLY: a density or a layout changes how things are shown — never what they mean, who may act, or what an act does. Saving
 * one is the person's own choice, recorded and versioned; it acknowledges, approves and advances nothing.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService, type RouteInfo } from '../../pipeline/pipeline.service.js';
import { PreferenceCapability } from './preferences.capabilities.js';

type Row = Record<string, unknown>;
export type PreferenceNoun = 'layout preference';
/** The noun this part's refusals speak in — to be mapped centrally (observation-errors.ts) at integration. */
export const PREFERENCE_NOUNS: readonly PreferenceNoun[] = ['layout preference'];
export const PREF_SAVE = 'shell.preferences.save';
export const PREF_READ = 'shell.preferences.read';
export const DENSITIES = ['DEN-01', 'DEN-02', 'DEN-03'] as const;
const COMPOSITION = /^[a-z][a-z0-9_.-]{1,80}$/;
const CODE = (s: number) => (s === 403 ? 'EYE_AUT_001' : s === 404 ? 'EYE_STA_001' : s === 409 ? 'EYE_STA_002' : 'EYE_REQ_001');

/** A refusal in the class form, answered by the route before any port runs (the caller's own request). */
export function refusePreference(cls: string, message: string, correlationId: string, status = 422): HttpException {
  return new HttpException(errorBody(CODE(status) as never, correlationId, `layout preference rejected (${cls}): ${message}`), status);
}

export interface PreferenceIntake { composition: string; expectedVersion: number; density: string | null; layout: Row }
const isObj = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);

/** The save's intake: the TYPES of what the port validates key by key (the port is the authority on every rule). */
export function validatePreferenceSave(p: Row, cid: string): PreferenceIntake {
  const composition = typeof p['composition'] === 'string' ? p['composition'] : '';
  if (!COMPOSITION.test(composition)) throw refusePreference('composition', 'a composition is named in lower case (default, prediction.warnings, home.operations-room)', cid);
  const ev = p['expectedVersion'];
  if (typeof ev !== 'number' || !Number.isInteger(ev) || ev < 0) throw refusePreference('version', 'expectedVersion is the version the client read (0 when there was none)', cid);
  const d = p['density'];
  if (d !== undefined && d !== null && (typeof d !== 'string' || !(DENSITIES as readonly string[]).includes(d))) {
    throw refusePreference('density', 'the density is DEN-01 (strategic), DEN-02 (operational), DEN-03 (inspection) — or null for the default', cid);
  }
  const l = p['layout'];
  if (l !== undefined && l !== null && !isObj(l)) throw refusePreference('layout', 'the layout is an object {viewport_class?, grid?, regions?, panel?, rail?, focus_region?, overflow?}', cid);
  return { composition, expectedVersion: ev, density: typeof d === 'string' ? d : null, layout: isObj(l) ? l : {} };
}

type Scope = { tenantId: string | null; domainId: string | null };
const routeOf = (s: Scope, action: string, objectType: string, objectId: string | null): RouteInfo =>
  (s.tenantId === null ? { scope: 'PLATFORM', tenantId: null, domainId: null, action, objectType, objectId } : { scope: 'DOMAIN', tenantId: s.tenantId, domainId: s.domainId, action, objectType, objectId });
const derive = (base: Envelope, action: string, objectType: string, objectId: string | null): Envelope =>
  ({ ...base, action, object_type: objectType, object_id: objectId, side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', message_id: newId() } as Envelope);
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

@Injectable()
export class PreferencesService {
  constructor(private readonly pipeline: PipelineService) {}

  /** The principal's OWN preferences (the port refuses any other principal); `composition` null = every composition. */
  async read(env: Envelope, p: AuthenticatedPrincipal, s: Scope, body: Row) {
    const c = typeof body['composition'] === 'string' && body['composition'] !== '' ? body['composition'] : null;
    if (c !== null && !COMPOSITION.test(c)) throw refusePreference('composition', 'a composition is named in lower case', env.correlation_id);
    const history = typeof body['history'] === 'number' && Number.isInteger(body['history']) ? Math.max(0, Math.min(50, body['history'])) : 5;
    const out = await this.pipeline.consequentialRead(derive(env, PREF_READ, 'PRF', null), p, routeOf(s, PREF_READ, 'PRF', null), PreferenceCapability.read,
      async (cap, scope) => cap.preferencesOf({ principalId: p.principalId, tenantId: scope.tenantId ?? null, domainId: scope.domainId ?? null, composition: c, history }));
    return { preferences: out.result, receipt: receipt(out) };
  }

  /** A new version of the person's preference for one composition (append-only; a save that read an older version is refused `(stale)`). */
  async save(env: Envelope, p: AuthenticatedPrincipal, s: Scope, body: Row) {
    const intake = validatePreferenceSave(body, env.correlation_id);
    const preferenceId = newId();
    const out = await this.pipeline.write(derive(env, PREF_SAVE, 'PRF', preferenceId), p, routeOf(s, PREF_SAVE, 'PRF', preferenceId), PreferenceCapability.write,
      async (cap, scope) => {
        const r = await cap.save({ preferenceId, tenantId: scope.tenantId ?? null, domainId: scope.domainId ?? null, ...intake, actor: p.principalId, correlationId: env.correlation_id });
        return { result: r, targetType: 'PRF', targetId: String(r['preference_id'] ?? preferenceId), targetVersion: String(r['version'] ?? ''), outboxEvent: null };
      });
    return { preference: out.result, receipt: receipt(out) };
  }
}
