/**
 * B92 §MCB — THE INPUTS of two computations-B metrics. Base `/v1/tenants/:t/domains/:d/analytics`.
 *
 *   temporal-requirements/declare   analytics.temporal.declare (human-gated) — {objectType, requiredFields[] | retire: true, reason, expectedVersion}
 *   temporal-requirements/list      analytics.read — the requirement in force per object type and the history
 *   search-reviews/record           analytics.search.review (human-gated) — {searchId, verdict: relevant | not_relevant, queryClass, reason}
 *   search-reviews/list             analytics.read — recorded searches (query, hits, kinds — never who searched) with their review
 *
 * The metrics themselves are computed through the prelude's `metrics/compute` (the computations are registered in 0113_b92_x_mcb.sql) and
 * read through `results/:id/read`. Refusals in the server's words: `metric definition rejected (<class>): …` (a temporal requirement is an
 * input a definition declares) and `metric computation rejected (<class>): …` (a search review is an input a computation reads).
 */
import { Body, Controller, HttpException, Post, Param, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { refuseAnalytics } from '../seams.js';
import { AnalyticsComputationsBService } from './computations-b.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const TIME_FIELDS = ['event_time', 'observation_time', 'valid_from', 'valid_to'] as const;
export const QUERY_CLASSES = ['entity', 'event', 'evidence', 'decision', 'strategy', 'forecast', 'warning', 'memory', 'other'] as const;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const str = (p: Row, k: string): string | null => (typeof p[k] === 'string' && String(p[k]).trim() !== '' ? String(p[k]).trim() : null);

/** The request shape of a temporal declaration (pure; the port re-checks every rule). */
export function parseTemporalDeclaration(p: Row): { ok: true; value: { objectType: string; required: string[]; retire: boolean; reason: string; expectedVersion: number } } | { ok: false; cls: string; message: string } {
  const objectType = str(p, 'objectType');
  if (objectType === null || !/^[A-Z]{3}$/.test(objectType)) return { ok: false, cls: 'object_type', message: 'payload.objectType is an object type (three capitals, e.g. OBS)' };
  const retire = p['retire'] === true;
  const raw = p['requiredFields'];
  const required = Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  if (!retire && (required.length === 0 || required.length !== (Array.isArray(raw) ? raw.length : -1) || required.some((f) => !(TIME_FIELDS as readonly string[]).includes(f)))) {
    return { ok: false, cls: 'fields', message: `payload.requiredFields is a non-empty subset of ${TIME_FIELDS.join(', ')} (recorded_at is required of every record by construction)` };
  }
  if (retire && Array.isArray(raw) && raw.length > 0) return { ok: false, cls: 'fields', message: 'a retirement names no required fields' };
  const reason = str(p, 'reason');
  if (reason === null || reason.length < 8) return { ok: false, cls: 'reason', message: 'payload.reason states why (8+ characters)' };
  const ev = p['expectedVersion'];
  if (typeof ev !== 'number' || !Number.isInteger(ev) || ev < 0) return { ok: false, cls: 'request', message: 'payload.expectedVersion is the version you read (0 when none)' };
  return { ok: true, value: { objectType, required: retire ? [] : [...new Set(required)].sort(), retire, reason, expectedVersion: ev } };
}

/** The request shape of a search review (pure; the port re-checks every rule). */
export function parseSearchReview(p: Row): { ok: true; value: { searchId: string; verdict: string; queryClass: string; reason: string } } | { ok: false; cls: string; message: string } {
  const searchId = str(p, 'searchId');
  if (searchId === null || !UUID.test(searchId)) return { ok: false, cls: 'request', message: 'payload.searchId is the id of a recorded search' };
  const verdict = str(p, 'verdict');
  if (verdict !== 'relevant' && verdict !== 'not_relevant') return { ok: false, cls: 'verdict', message: 'payload.verdict is relevant or not_relevant' };
  const queryClass = str(p, 'queryClass');
  if (queryClass === null || !(QUERY_CLASSES as readonly string[]).includes(queryClass)) return { ok: false, cls: 'query_class', message: `payload.queryClass is one of ${QUERY_CLASSES.join(', ')}` };
  const reason = str(p, 'reason');
  if (reason === null || reason.length < 8) return { ok: false, cls: 'reason', message: 'payload.reason states why (8+ characters)' };
  return { ok: true, value: { searchId, verdict, queryClass, reason } };
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/analytics')
export class AnalyticsComputationsBController {
  constructor(private readonly svc: AnalyticsComputationsBService) {}

  @Post('/temporal-requirements/declare')
  async declareTemporal(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const r = parseTemporalDeclaration(body.payload ?? {});
    if (!r.ok) throw refuseAnalytics('metric definition', r.cls, r.message, envelope.correlation_id);
    return this.svc.declareTemporal(envelope, principal, t, d, r.value);
  }

  @Post('/temporal-requirements/list')
  async temporalRequirements(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.temporalRequirements(envelope, principal, t, d);
  }

  @Post('/search-reviews/record')
  async reviewSearch(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const r = parseSearchReview(body.payload ?? {});
    if (!r.ok) throw refuseAnalytics('metric computation', r.cls, r.message, envelope.correlation_id);
    return this.svc.reviewSearch(envelope, principal, t, d, r.value);
  }

  @Post('/search-reviews/list')
  async searchReviews(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    const limit = typeof p['limit'] === 'number' && Number.isInteger(p['limit']) ? Math.min(Math.max(Number(p['limit']), 1), 500) : 100;
    return this.svc.searchReviews(envelope, principal, t, d, limit);
  }
}
