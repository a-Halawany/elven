/**
 * B92 §OR (0113_b92_x_or) — THE OPERATING REVIEW SURFACE. Base `/v1/tenants/:t/domains/:d/analytics`.
 *
 *   reviews/list                   analytics.read — {period?, state?, limit?}
 *   reviews/open                   analytics.review.open — {title, period (2026-Q3 | 2026-09), scopeKey?, metricKeys[], chair, participantRoles[]}
 *   reviews/series                 analytics.read — {metricKey, scopeKey?, through? (default: the last complete quarter), count? (1–12, default 4)}
 *   reviews/:reviewId/read         analytics.read — the review: per metric the definition, the cited result (or not computed), its drill-down
 *                                  (results/:id/read), the series; the notes, the follow-through, the ledger, the signature, digest_now
 *   reviews/:reviewId/assemble     analytics.review.assemble — {pins?: {metricKey: resultId}} — cites, computes nothing
 *   reviews/:reviewId/hold         analytics.review.hold (the chair; human-gated)
 *   reviews/:reviewId/notes/add    analytics.review.note — {metricKey?, body}
 *   reviews/:reviewId/decide       analytics.review.decide (the chair; human-gated) — {metricKey?, kind: action|no_action, action?, owner?, dueOn?, reason}
 *   reviews/:reviewId/close        analytics.review.close (the chair; human-gated) — {digest (digest_now as read), statement}
 *
 * Refusals in the server's words: `operating review rejected (<class>): …`.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { refuseAnalytics } from '../seams.js';
import { AnalyticsReviewService } from './review.service.js';
import { DIGEST_RE, METRIC_KEY_RE, ROLE_RE, SCOPE_KEY_RE, UUID_RE, isReviewPeriod, parseFollowthrough, parsePins } from './review-logic.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const optStr = (p: Row, k: string): string | null => (typeof p[k] === 'string' && String(p[k]).trim() !== '' ? String(p[k]).trim() : null);
const strArray = (v: unknown): string[] | null => (Array.isArray(v) && v.every((x) => typeof x === 'string') ? (v as string[]).map((x) => x.trim()) : null);
const R = 'operating review' as const;

@Controller('/v1/tenants/:tenantId/domains/:domainId/analytics')
export class AnalyticsReviewController {
  constructor(private readonly svc: AnalyticsReviewService) {}

  private reviewId(id: string, cid: string): string {
    if (!UUID_RE.test(id)) throw refuseAnalytics(R, 'request', 'the review is an id', cid);
    return id;
  }

  @Post('/reviews/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    const period = optStr(p, 'period'); const state = optStr(p, 'state');
    if (period !== null && !isReviewPeriod(period)) throw refuseAnalytics(R, 'period', 'payload.period is a calendar quarter or month (2026-Q3, 2026-09)', envelope.correlation_id);
    if (state !== null && !['draft', 'held', 'closed'].includes(state)) throw refuseAnalytics(R, 'request', 'payload.state is draft, held or closed', envelope.correlation_id);
    const limit = typeof p['limit'] === 'number' && Number.isInteger(p['limit']) ? Number(p['limit']) : 50;
    return this.svc.list(envelope, principal, t, d, { period, state, limit });
  }

  @Post('/reviews/open')
  async open(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const title = optStr(p, 'title'); const period = optStr(p, 'period'); const scopeKey = optStr(p, 'scopeKey'); const chair = optStr(p, 'chair');
    const metricKeys = strArray(p['metricKeys']); const participantRoles = strArray(p['participantRoles']);
    if (title === null || title.length < 4 || title.length > 200) throw refuseAnalytics(R, 'title', 'payload.title has 4–200 characters', cid);
    if (period === null || !isReviewPeriod(period)) throw refuseAnalytics(R, 'period', 'payload.period is a named calendar quarter or month (2026-Q3, 2026-09)', cid);
    if (scopeKey !== null && !SCOPE_KEY_RE.test(scopeKey)) throw refuseAnalytics(R, 'request', 'payload.scopeKey names an approved scope (red-sea-corridor)', cid);
    if (metricKeys === null || metricKeys.length < 1 || metricKeys.length > 20 || !metricKeys.every((k) => METRIC_KEY_RE.test(k))) throw refuseAnalytics(R, 'metrics', 'payload.metricKeys lists 1–20 metric keys (MET-001)', cid);
    if (chair === null || !UUID_RE.test(chair)) throw refuseAnalytics(R, 'chair', 'payload.chair is the chair\'s principal id (a named human)', cid);
    if (participantRoles === null || participantRoles.length < 1 || participantRoles.length > 20 || !participantRoles.every((r) => ROLE_RE.test(r))) {
      throw refuseAnalytics(R, 'participants', 'payload.participantRoles lists 1–20 role codes — participants are named by role, never by person', cid);
    }
    return this.svc.open(envelope, principal, t, d, { title, period, scopeKey, metricKeys, chair, participantRoles });
  }

  @Post('/reviews/series')
  async series(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const metricKey = optStr(p, 'metricKey'); const scopeKey = optStr(p, 'scopeKey'); const through = optStr(p, 'through');
    if (metricKey === null || !METRIC_KEY_RE.test(metricKey)) throw refuseAnalytics(R, 'request', 'payload.metricKey names a metric (MET-001)', cid);
    if (scopeKey !== null && !SCOPE_KEY_RE.test(scopeKey)) throw refuseAnalytics(R, 'request', 'payload.scopeKey names a scope', cid);
    if (through !== null && !isReviewPeriod(through)) throw refuseAnalytics(R, 'period', 'payload.through is a named calendar quarter or month (2026-Q3, 2026-09)', cid);
    const count = p['count'] === undefined ? 4 : Number(p['count']);
    if (!Number.isInteger(count) || count < 1 || count > 12) throw refuseAnalytics(R, 'request', 'payload.count is 1–12 periods', cid);
    return this.svc.series(envelope, principal, t, d, { metricKey, scopeKey, through, count });
  }

  @Post('/reviews/:reviewId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('reviewId') id: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.svc.review(envelope, principal, t, d, this.reviewId(id, envelope.correlation_id));
    if (out.review === null) throw refuseAnalytics(R, 'unknown_review', `${id} is not an operating review of this domain`, envelope.correlation_id, 404);
    return out;
  }

  @Post('/reviews/:reviewId/assemble')
  async assemble(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('reviewId') id: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    const pins = parsePins(p['pins']);
    if (!pins.ok) throw refuseAnalytics(R, 'request', pins.message, envelope.correlation_id);
    return this.svc.assemble(envelope, principal, t, d, this.reviewId(id, envelope.correlation_id), pins.value);
  }

  @Post('/reviews/:reviewId/hold')
  async hold(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('reviewId') id: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.hold(envelope, principal, t, d, this.reviewId(id, envelope.correlation_id));
  }

  @Post('/reviews/:reviewId/notes/add')
  async note(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('reviewId') id: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const metricKey = optStr(p, 'metricKey'); const text = optStr(p, 'body');
    if (metricKey !== null && !METRIC_KEY_RE.test(metricKey)) throw refuseAnalytics(R, 'request', 'payload.metricKey names a metric of the review, or is absent', cid);
    if (text === null || text.length < 4 || text.length > 4000) throw refuseAnalytics(R, 'note', 'a note has 4–4000 characters', cid);
    return this.svc.note(envelope, principal, t, d, this.reviewId(id, cid), { metricKey, body: text });
  }

  @Post('/reviews/:reviewId/decide')
  async decide(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('reviewId') id: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    const f = parseFollowthrough(body.payload ?? {});
    if (!f.ok) throw refuseAnalytics(R, f.cls, f.message, cid);
    const v = f.value;
    return this.svc.decide(envelope, principal, t, d, this.reviewId(id, cid), v.kind === 'action'
      ? { metricKey: v.metricKey, kind: v.kind, action: v.action, owner: v.owner, dueOn: v.dueOn, reason: v.reason }
      : { metricKey: v.metricKey, kind: v.kind, action: null, owner: null, dueOn: null, reason: v.reason });
  }

  @Post('/reviews/:reviewId/close')
  async close(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('reviewId') id: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const digest = optStr(p, 'digest'); const statement = optStr(p, 'statement');
    if (digest === null || !DIGEST_RE.test(digest)) throw refuseAnalytics(R, 'digest', 'payload.digest is the review\'s digest as read (digest_now, 64 hex characters) — the chair signs what the chair read', cid);
    if (statement === null || statement.length < 8) throw refuseAnalytics(R, 'statement', 'the close carries the chair\'s statement (8+ characters)', cid);
    return this.svc.close(envelope, principal, t, d, this.reviewId(id, cid), { digest, statement });
  }
}
