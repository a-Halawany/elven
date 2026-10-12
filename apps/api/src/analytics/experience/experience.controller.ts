/**
 * B92 §UX (0113_b92_x_ux; UX-70-001..006, CAP-PD-09) — THE EXPERIENCE-QUALITY SURFACE. Base `/v1/tenants/:t/domains/:d/analytics/experience`.
 * One route, one port, one receipt per verb (UX-70-003: navigation, inspection, drafting, review, approval and effect stay distinct).
 *
 *   self/read                         analytics.consent.read — the caller's OWN consent per purpose + the instrumentation catalogue
 *   consent/grant · consent/withdraw  analytics.consent.grant | .withdraw (human-gated: the person's own act) — {purposeKey}
 *   telemetry/record                  analytics.telemetry.record (202) — {eventKey, outcome, durationMs?, fields?, deviceClass?, locale?, experimentId?}
 *   telemetry/define                  analytics.telemetry.define — {eventKey, title, journeyKey, stepKey, fields}
 *   telemetry/:id/review              analytics.telemetry.review (privacy officer) — {decision approve|reject, reason, digest}
 *   telemetry/:id/hold · /release     analytics.telemetry.hold | .release (privacy officer) — {reason}
 *   telemetry/:id/retire              analytics.telemetry.retire (privacy officer | owner) — {reason}
 *   telemetry/purge                   analytics.telemetry.purge (privacy officer) — {reason}
 *   journeys/declare                  analytics.experience.journey.declare — {key, title, purposeKey, objective, objectiveIds?, steps, floor?}
 *   segments/declare                  analytics.experience.segment.declare — {key, dimension role|device_class|locale, value, k?}
 *   baselines/record                  analytics.experience.baseline.record — {journeyKey, measure, stepKey?, segmentKey?, period}
 *   thresholds/propose                analytics.experience.threshold.propose — {journeyKey, measure, stepKey?, segmentKey?, bound min|max, value, rationale}
 *   thresholds/:id/decide             analytics.experience.threshold.decide | .retire (owner) — {decision approve|reject|retire, reason, digest?}
 *   experiments/propose               analytics.experiment.propose — {journeyKey, title, hypothesis, measure, stepKey?, variants, minSample}
 *   experiments/:id/approve           analytics.experiment.approve (owner | privacy officer) — {role, decision, reason, digest}
 *   experiments/:id/assignment        analytics.experiment.assignment.read — the caller's arm (the control without consent)
 *   experiments/:id/analyse           analytics.experiment.analyse
 *   experiments/:id/conclude          analytics.experiment.conclude (owner) — {conclusion adopt|no_change|inconclusive, arm?, analysisId, analysisDigest, reason}
 *   findings/propose                  analytics.experience.finding.propose (analyst | owner | attention agent) — {originKind, originId, journeyKey?, statement, evidence?}
 *   findings/:id/preview              analytics.read — the consequence preview {kind?, targetId?} (kind absent = the dismissal's)
 *   findings/:id/decide               analytics.experience.action.decide (owner) — {decision act|dismiss, kind?, targetId?, reason, findingDigest, previewDigest}
 *   exports/create                    analytics.export.create (owner) — {title}
 *   exports/:id/download              analytics.read — the canonical package and its digest, re-verified
 *   workspace                         analytics.read — the four-part anatomy per journey and everything above
 *
 * Refusals in the server's words: `<noun> rejected (<class>): …`.
 */
import { Body, Controller, HttpCode, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { PERSON_DIMENSIONS, refuseAnalytics } from '../seams.js';
import { ExperienceService } from './experience.service.js';
import {
  ACTION_KINDS, DEVICE_CLASSES, MEASURES, ORIGIN_KINDS, OUTCOMES, SEGMENT_DIMENSIONS, STEP, UUID, eventFieldProblems, needId, needKey, needReason, obj, oneOf, optId, optInt, optStr,
  period, personFields, str, variantShapeOk,
} from './experience-logic.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal, cid: envelope.correlation_id };
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/analytics/experience')
export class ExperienceController {
  constructor(private readonly svc: ExperienceService) {}

  /* ───────────── the person's own ───────────── */
  @Post('/self/read')
  async self(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.self(envelope, principal, t, d);
  }
  @Post('/consent/grant')
  async grant(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    if (p['principalId'] !== undefined || p['forPrincipal'] !== undefined) throw refuseAnalytics('consent', 'person', 'consent is given by the person themselves — nobody grants it for another', cid, 403);
    return this.svc.consent(envelope, principal, t, d, needKey(p, 'purposeKey', 'consent', cid), 'granted');
  }
  @Post('/consent/withdraw')
  async withdraw(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    if (p['principalId'] !== undefined || p['forPrincipal'] !== undefined) throw refuseAnalytics('consent', 'person', 'consent is withdrawn by the person themselves — nobody withdraws it for another', cid, 403);
    return this.svc.consent(envelope, principal, t, d, needKey(p, 'purposeKey', 'consent', cid), 'withdrawn');
  }
  @Post('/telemetry/record')
  @HttpCode(202)
  async record(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    const eventKey = needKey(p, 'eventKey', 'telemetry event', cid);
    const fields = obj(p['fields'], 'payload.fields', 'telemetry event', cid);
    const person = personFields(fields);
    if (person.length > 0) throw refuseAnalytics('telemetry event', 'person', `an event never carries a person (${person.join(', ')}): telemetry is pseudonymous`, cid, 403);
    const problems = eventFieldProblems(fields);
    if (problems.length > 0) throw refuseAnalytics('telemetry event', 'minimisation', problems.join('; '), cid);
    const outcome = optStr(p, 'outcome');
    if (outcome !== null && !(OUTCOMES as readonly string[]).includes(outcome)) throw refuseAnalytics('telemetry event', 'request', `payload.outcome is one of ${OUTCOMES.join(', ')}`, cid);
    const deviceClass = optStr(p, 'deviceClass');
    if (deviceClass !== null && !(DEVICE_CLASSES as readonly string[]).includes(deviceClass)) throw refuseAnalytics('telemetry event', 'request', `payload.deviceClass is one of ${DEVICE_CLASSES.join(', ')}`, cid);
    return this.svc.record(envelope, principal, t, d, { eventKey, outcome, durationMs: optInt(p['durationMs'], 'payload.durationMs', 'telemetry event', cid), fields, deviceClass,
      locale: optStr(p, 'locale'), experimentId: optId(p['experimentId'], 'payload.experimentId', 'telemetry event', cid) });
  }
  @Post('/experiments/:experimentId/assignment')
  async assignment(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('experimentId') e: string) {
    const { envelope, principal, cid } = ctx(req);
    return this.svc.assignment(envelope, principal, t, d, needId(e, 'the experiment', 'ux experiment', cid));
  }

  /* ───────────── telemetry definitions ───────────── */
  @Post('/telemetry/define')
  async define(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    const fields = obj(p['fields'], 'payload.fields', 'telemetry definition', cid);
    const person = personFields(fields);
    if (person.length > 0) throw refuseAnalytics('telemetry definition', 'person', `a telemetry field never names a person (${person.join(', ')}): no employee-performance inference`, cid, 403);
    return this.svc.define(envelope, principal, t, d, { eventKey: needKey(p, 'eventKey', 'telemetry definition', cid), title: str(p, 'title'), journeyKey: needKey(p, 'journeyKey', 'telemetry definition', cid),
      stepKey: needKey(p, 'stepKey', 'telemetry definition', cid, STEP), fields });
  }
  @Post('/telemetry/:definitionId/review')
  async review(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('definitionId') id: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.review(envelope, principal, t, d, needId(id, 'the definition', 'telemetry definition', cid), {
      decision: oneOf(p['decision'], ['approve', 'reject'] as const, 'payload.decision', 'telemetry definition', cid, 'decision'), reason: needReason(p, 'telemetry definition', cid), digest: str(p, 'digest') });
  }
  @Post('/telemetry/:definitionId/hold')
  async hold(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('definitionId') id: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.hold(envelope, principal, t, d, needId(id, 'the definition', 'telemetry definition', cid), true, needReason(p, 'telemetry definition', cid));
  }
  @Post('/telemetry/:definitionId/release')
  async release(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('definitionId') id: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.hold(envelope, principal, t, d, needId(id, 'the definition', 'telemetry definition', cid), false, needReason(p, 'telemetry definition', cid));
  }
  @Post('/telemetry/:definitionId/retire')
  async retire(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('definitionId') id: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.retire(envelope, principal, t, d, needId(id, 'the definition', 'telemetry definition', cid), needReason(p, 'telemetry definition', cid));
  }
  @Post('/telemetry/purge')
  async purge(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.purge(envelope, principal, t, d, needReason(p, 'telemetry definition', cid));
  }

  /* ───────────── journeys, segments, baselines, thresholds ───────────── */
  @Post('/journeys/declare')
  async journey(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    const steps = p['steps'];
    if (!Array.isArray(steps) || !steps.every((s) => typeof s === 'string' && STEP.test(s))) throw refuseAnalytics('experience journey', 'steps', 'payload.steps is a list of step keys ^[a-z][a-z0-9_]{1,40}$', cid);
    const oids = p['objectiveIds'] ?? [];
    if (!Array.isArray(oids) || !oids.every((x) => typeof x === 'string' && UUID.test(x))) throw refuseAnalytics('experience journey', 'request', 'payload.objectiveIds is a list of ids', cid);
    return this.svc.journey(envelope, principal, t, d, { key: needKey(p, 'key', 'experience journey', cid), title: str(p, 'title'), purposeKey: needKey(p, 'purposeKey', 'experience journey', cid),
      objective: str(p, 'objective'), objectiveIds: oids as string[], steps: steps as string[], floor: optInt(p['floor'], 'payload.floor', 'experience journey', cid) });
  }
  @Post('/segments/declare')
  async segment(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    const dimension = str(p, 'dimension');
    if ((PERSON_DIMENSIONS as readonly string[]).includes(dimension)) throw refuseAnalytics('experience segment', 'person', `a segment is never a person (${dimension}): no employee-performance inference`, cid, 403);
    return this.svc.segment(envelope, principal, t, d, { key: needKey(p, 'key', 'experience segment', cid), dimension: oneOf(dimension, SEGMENT_DIMENSIONS, 'payload.dimension', 'experience segment', cid, 'dimension'),
      value: str(p, 'value'), k: optInt(p['k'], 'payload.k', 'experience segment', cid) });
  }
  @Post('/baselines/record')
  async baseline(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.baseline(envelope, principal, t, d, { journeyKey: needKey(p, 'journeyKey', 'experience baseline', cid), measure: oneOf(p['measure'], MEASURES, 'payload.measure', 'experience baseline', cid, 'measure'),
      stepKey: optStr(p, 'stepKey'), segmentKey: optStr(p, 'segmentKey'), period: period(p, 'experience baseline', cid) });
  }
  @Post('/thresholds/propose')
  async proposeThreshold(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    if (typeof p['value'] !== 'number' || !Number.isFinite(p['value'])) throw refuseAnalytics('experience baseline', 'threshold', 'payload.value is a number', cid);
    return this.svc.proposeThreshold(envelope, principal, t, d, { journeyKey: needKey(p, 'journeyKey', 'experience baseline', cid), measure: oneOf(p['measure'], MEASURES, 'payload.measure', 'experience baseline', cid, 'measure'),
      stepKey: optStr(p, 'stepKey'), segmentKey: optStr(p, 'segmentKey'), bound: oneOf(p['bound'], ['min', 'max'] as const, 'payload.bound', 'experience baseline', cid, 'threshold'),
      value: Number(p['value']), rationale: needReason(p, 'experience baseline', cid, 'rationale') });
  }
  @Post('/thresholds/:thresholdId/decide')
  async decideThreshold(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('thresholdId') id: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.decideThreshold(envelope, principal, t, d, needId(id, 'the threshold', 'experience baseline', cid), {
      decision: oneOf(p['decision'], ['approve', 'reject', 'retire'] as const, 'payload.decision', 'experience baseline', cid, 'decision'), reason: needReason(p, 'experience baseline', cid), digest: optStr(p, 'digest') });
  }

  /* ───────────── experiments ───────────── */
  @Post('/experiments/propose')
  async proposeExperiment(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    const measure = str(p, 'measure');
    if (!(MEASURES as readonly string[]).includes(measure)) throw refuseAnalytics('ux experiment', 'engagement', `the primary measure is an experience measure (${MEASURES.join(', ')}) — never an engagement proxy`, cid);
    if (!variantShapeOk(p['variants'])) throw refuseAnalytics('ux experiment', 'variants', 'payload.variants is 2–4 {key, kind, description}, the control first', cid);
    const minSample = optInt(p['minSample'], 'payload.minSample', 'ux experiment', cid);
    if (minSample === null) throw refuseAnalytics('ux experiment', 'sample', 'payload.minSample (per arm) is stated', cid);
    return this.svc.proposeExperiment(envelope, principal, t, d, { journeyKey: needKey(p, 'journeyKey', 'ux experiment', cid), title: str(p, 'title'), hypothesis: str(p, 'hypothesis'), measure,
      stepKey: optStr(p, 'stepKey'), variants: p['variants'] as unknown[], minSample });
  }
  @Post('/experiments/:experimentId/approve')
  async approveExperiment(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('experimentId') e: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.approveExperiment(envelope, principal, t, d, needId(e, 'the experiment', 'ux experiment', cid), {
      role: oneOf(p['role'], ['product_analytics_owner', 'privacy_officer'] as const, 'payload.role', 'ux experiment', cid, 'role'),
      decision: oneOf(p['decision'], ['approve', 'reject'] as const, 'payload.decision', 'ux experiment', cid, 'decision'), reason: needReason(p, 'ux experiment', cid), digest: str(p, 'digest') });
  }
  @Post('/experiments/:experimentId/analyse')
  async analyse(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('experimentId') e: string) {
    const { envelope, principal, cid } = ctx(req);
    return this.svc.analyse(envelope, principal, t, d, needId(e, 'the experiment', 'ux experiment', cid));
  }
  @Post('/experiments/:experimentId/conclude')
  async conclude(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('experimentId') e: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.conclude(envelope, principal, t, d, needId(e, 'the experiment', 'ux experiment', cid), {
      conclusion: oneOf(p['conclusion'], ['adopt', 'no_change', 'inconclusive'] as const, 'payload.conclusion', 'ux experiment', cid, 'conclusion'), arm: optStr(p, 'arm'),
      analysisId: needId(p['analysisId'], 'payload.analysisId', 'ux experiment', cid), analysisDigest: str(p, 'analysisDigest'), reason: needReason(p, 'ux experiment', cid) });
  }

  /* ───────────── findings → actions ───────────── */
  @Post('/findings/propose')
  async proposeFinding(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    return this.svc.proposeFinding(envelope, principal, t, d, { originKind: oneOf(p['originKind'], ORIGIN_KINDS, 'payload.originKind', 'experience finding', cid, 'origin'),
      originId: needId(p['originId'], 'payload.originId', 'experience finding', cid), journeyKey: optStr(p, 'journeyKey'), statement: str(p, 'statement'),
      evidence: obj(p['evidence'], 'payload.evidence', 'experience finding', cid) });
  }
  @Post('/findings/:findingId/preview')
  async preview(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('findingId') f: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    const kind = optStr(p, 'kind');
    if (kind !== null) oneOf(kind, ACTION_KINDS, 'payload.kind', 'experience action', cid, 'kind');
    return this.svc.preview(envelope, principal, t, d, needId(f, 'the finding', 'experience action', cid), kind, optId(p['targetId'], 'payload.targetId', 'experience action', cid));
  }
  @Post('/findings/:findingId/decide')
  async decide(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('findingId') f: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req); const p = body.payload ?? {};
    const decision = oneOf(p['decision'], ['act', 'dismiss'] as const, 'payload.decision', 'experience action', cid, 'decision');
    const kind = decision === 'act' ? oneOf(p['kind'], ACTION_KINDS, 'payload.kind', 'experience action', cid, 'kind') : null;
    return this.svc.decideAction(envelope, principal, t, d, needId(f, 'the finding', 'experience action', cid), { decision, kind, targetId: optId(p['targetId'], 'payload.targetId', 'experience action', cid),
      reason: needReason(p, 'experience action', cid), findingDigest: str(p, 'findingDigest'), previewDigest: str(p, 'previewDigest') });
  }

  /* ───────────── the export and the workspace ───────────── */
  @Post('/exports/create')
  async exportCreate(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    return this.svc.exportCreate(envelope, principal, t, d, str(p, 'title'));
  }
  @Post('/exports/:exportId/download')
  async exportRead(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('exportId') x: string) {
    const { envelope, principal, cid } = ctx(req);
    return this.svc.exportRead(envelope, principal, t, d, needId(x, 'the export', 'analytics export', cid));
  }
  @Post('/workspace')
  async workspace(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.workspace(envelope, principal, t, d);
  }
}
