/**
 * B33 §PK (0111) — THE HTTP SURFACE OF THE DOMAIN-PACKAGE FRAMEWORK (F-P4-15 ch.31/36; WS-10). Base `/v1/tenants/:t/domains/:d/domain-packages`.
 *
 *   list · definitions                         domain.package.read (audited) — the packages, the four definitions with their inputs statement
 *   declare                                    domain.package.declare — key, kind, title, owner
 *   :id/read · :id/facts · gate                domain.package.read — the workspace's package view; the facts a suite reads; the gate's answer
 *   :id/versions/propose                       domain.package.version — the manifest at a semver (+ its DPG object)
 *   :id/sections/approve                       domain.package.approve (human-gated) — one section at its digest, by a named domain specialist
 *   :id/conformance/run                        domain.package.conformance — the suite (certification | diagnostic)
 *   :id/versions/:v/certify                    domain.package.certify (human-gated)
 *   :id/versions/:v/activate                   domain.package.activate (human-gated; the owner) (+ its DPG object)
 *   :id/retire                                 domain.package.retire (human-gated)
 *   :id/health/run                             domain.package.health — the re-check (also the after-tick hook `domain-package-health`)
 *   :id/versions/:v/enable                     domain.package.enable (human-gated; a specialist after a passing re-run)
 *   :id/acceptance/run                         domain.package.acceptance — the kind's acceptance focus, MEASURED
 *   assessments/propose · :aid/decide · :aid/limit · :aid/read (as-of replay)   domain.assessment.*
 *   watchlists/declare · :wid/retire · :wid/resolve                             domain.watchlist.declare / .retire, domain.alert.resolve
 *   events/record · :eid/confirm                                                domain.event.record / .confirm
 *   alerts/:alid/adjudicate                                                     domain.alert.adjudicate
 *   links/declare · links/:lid/withdraw                                         domain.link.declare / .withdraw
 *
 * Refusals in the server's words: `<noun> rejected (<class>): …`. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { PackagesService, refuse, type Noun } from './packages.service.js';
import { packageDefinitions } from './definitions.js';
import { FUNCTIONS, SECTIONS } from './manifest.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS = ['competitor', 'supply_chain', 'geopolitical', 'technology', 'cyber', 'financial'];

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const str = (p: Row, k: string): string => (typeof p[k] === 'string' ? String(p[k]).trim() : '');
function id(v: unknown, what: string, noun: Noun, cid: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuse(noun, 'request', `${what} is an id`, cid);
  return v;
}
function ids(v: unknown, what: string, noun: Noun, cid: string, allowEmpty = false): string[] {
  if (!Array.isArray(v) || (!allowEmpty && v.length === 0) || !v.every((x) => typeof x === 'string' && UUID.test(x))) throw refuse(noun, 'request', `${what} is a list of ids`, cid);
  return [...new Set(v as string[])];
}
function int(v: unknown, what: string, noun: Noun, cid: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v)) throw refuse(noun, 'request', `${what} is an integer`, cid);
  return v;
}
function reason(p: Row, noun: Noun, cid: string, k = 'reason'): string {
  const r = str(p, k);
  if (r.length < 8) throw refuse(noun, k, `a ${k} of at least 8 characters is stated`, cid);
  return r;
}
function evidence(v: unknown, noun: Noun, cid: string): unknown[] {
  if (!Array.isArray(v) || v.length === 0) throw refuse(noun, 'evidence', 'it cites at least one evidence object {kind: evidence, id, version, digest}', cid);
  return v;
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/domain-packages')
export class PackagesController {
  constructor(private readonly svc: PackagesService) {}

  /* ───────────── the workspace's reads ───────────── */
  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.list(envelope, principal, t, d);
  }
  @Post('/definitions')
  definitions() {
    return { definitions: packageDefinitions(), note: 'the four package definitions (tenant data, declared through the ports): each states its real public feeds, its synthetic inputs and the licensed provider a real acceptance needs' };
  }
  @Post('/:packageId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('packageId') packageId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.detail(envelope, principal, t, d, id(packageId, 'packageId', 'domain package', envelope.correlation_id));
  }
  @Post('/:packageId/facts')
  async facts(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('packageId') packageId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const v = body.payload?.['version'];
    return this.svc.facts(envelope, principal, t, d, id(packageId, 'packageId', 'domain package', envelope.correlation_id), v === undefined || v === null ? null : int(v, 'version', 'domain package', envelope.correlation_id));
  }
  @Post('/gate')
  async gate(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const key = str(p, 'packageKey'); const fn = p['function'] === undefined || p['function'] === null ? null : str(p, 'function');
    if (key === '') throw refuse('domain package', 'request', 'packageKey names the package', envelope.correlation_id);
    if (fn !== null && !(FUNCTIONS as readonly string[]).includes(fn)) throw refuse('domain package', 'request', `function is one of ${FUNCTIONS.join(', ')}`, envelope.correlation_id);
    const noun = p['assertFor'] === undefined ? null : str(p, 'assertFor') as Noun;
    return this.svc.gateState(envelope, principal, t, d, key, fn, noun);
  }

  /* ───────────── PK1: declare, propose ───────────── */
  @Post('/declare')
  async declare(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const kind = str(p, 'kind');
    if (!KINDS.includes(kind)) throw refuse('domain package', 'kind', `the kind is ${KINDS.join(', ')}`, cid);
    return this.svc.declare(envelope, principal, t, d, { key: str(p, 'key'), kind, title: str(p, 'title'), owner: id(p['owner'] ?? principal.principalId, 'owner', 'domain package', cid) });
  }
  @Post('/:packageId/versions/propose')
  async propose(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('packageId') packageId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const manifest = p['manifest'];
    if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) throw refuse('domain package', 'manifest', 'the manifest is an object', cid);
    return this.svc.propose(envelope, principal, t, d, id(packageId, 'packageId', 'domain package', cid), str(p, 'semver'), manifest as Row);
  }

  /* ───────────── PK2: sections, certification, activation ───────────── */
  @Post('/:packageId/sections/approve')
  async approve(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('packageId') packageId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const section = str(p, 'section');
    if (!(SECTIONS as readonly string[]).includes(section)) throw refuse('domain package', 'section', `the section is one of ${SECTIONS.join(', ')}`, cid);
    const decision = str(p, 'decision') || 'approved';
    if (!['approved', 'rejected'].includes(decision)) throw refuse('domain package', 'decision', 'the decision is approved or rejected', cid);
    const digest = str(p, 'digest');
    if (!/^[0-9a-f]{64}$/.test(digest)) throw refuse('domain package', 'digest', 'the decision names the section digest it read (64 hex)', cid);
    return this.svc.approve(envelope, principal, t, d, id(packageId, 'packageId', 'domain package', cid), {
      version: int(p['version'], 'version', 'domain package', cid), section, digest, decision, reason: reason(p, 'domain package', cid),
      validDays: p['validDays'] === undefined ? 365 : int(p['validDays'], 'validDays', 'domain package', cid),
    });
  }
  @Post('/:packageId/conformance/run')
  async conformance(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('packageId') packageId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const mode = str(p, 'mode') || 'certification';
    if (mode !== 'certification' && mode !== 'diagnostic') throw refuse('package conformance', 'mode', 'the mode is certification or diagnostic', cid);
    return this.svc.conformance(envelope, principal, t, d, id(packageId, 'packageId', 'package conformance', cid), int(p['version'], 'version', 'package conformance', cid), mode);
  }
  @Post('/:packageId/acceptance/run')
  async acceptance(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('packageId') packageId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.acceptance(envelope, principal, t, d, id(packageId, 'packageId', 'package conformance', envelope.correlation_id));
  }
  @Post('/:packageId/versions/:version/certify')
  async certify(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('packageId') packageId: string, @Param('version') version: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.certify(envelope, principal, t, d, id(packageId, 'packageId', 'domain package', cid), int(Number(version), 'version', 'domain package', cid), reason(body.payload ?? {}, 'domain package', cid));
  }
  @Post('/:packageId/versions/:version/activate')
  async activate(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('packageId') packageId: string, @Param('version') version: string) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.activate(envelope, principal, t, d, id(packageId, 'packageId', 'domain package', cid), int(Number(version), 'version', 'domain package', cid));
  }
  @Post('/:packageId/retire')
  async retire(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('packageId') packageId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.retire(envelope, principal, t, d, id(packageId, 'packageId', 'domain package', cid), reason(body.payload ?? {}, 'domain package', cid));
  }

  /* ───────────── PK4: health ───────────── */
  @Post('/:packageId/health/run')
  async health(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('packageId') packageId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.health(envelope, principal, t, d, id(packageId, 'packageId', 'domain package', envelope.correlation_id));
  }
  @Post('/:packageId/versions/:version/enable')
  async enable(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('packageId') packageId: string, @Param('version') version: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const fns = p['functions'] === undefined ? [] : p['functions'];
    if (!Array.isArray(fns) || !fns.every((f) => typeof f === 'string' && (FUNCTIONS as readonly string[]).includes(f))) throw refuse('domain package', 'functions', `functions are among ${FUNCTIONS.join(', ')}`, cid);
    return this.svc.enable(envelope, principal, t, d, id(packageId, 'packageId', 'domain package', cid), {
      version: int(Number(version), 'version', 'domain package', cid), functions: fns as string[], clearConflict: p['clearConflict'] === true, reason: reason(p, 'domain package', cid),
    });
  }

  /* ───────────── PK5: assessments ───────────── */
  @Post('/assessments/propose')
  async proposeAssessment(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const conf = p['confidence'];
    if (typeof conf !== 'number' || conf < 0 || conf > 1) throw refuse('domain assessment', 'confidence', 'the confidence is a number between 0 and 1', cid);
    return this.svc.proposeAssessment(envelope, principal, t, d, {
      assessmentId: p['assessmentId'] === undefined || p['assessmentId'] === null ? null : id(p['assessmentId'], 'assessmentId', 'domain assessment', cid),
      key: str(p, 'packageKey'), template: str(p, 'template'), subjects: ids(p['subjects'], 'subjects', 'domain assessment', cid), statement: str(p, 'statement'), confidence: conf,
      evidence: evidence(p['evidence'], 'domain assessment', cid), material: typeof p['material'] === 'boolean' ? p['material'] : null,
    });
  }
  @Post('/assessments/:assessmentId/decide')
  async decideAssessment(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('assessmentId') assessmentId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const decision = str(p, 'decision');
    if (decision !== 'approve' && decision !== 'reject') throw refuse('domain assessment', 'decision', 'the decision is approve or reject', cid);
    return this.svc.decideAssessment(envelope, principal, t, d, id(assessmentId, 'assessmentId', 'domain assessment', cid), { version: int(p['version'], 'version', 'domain assessment', cid), decision, note: reason(p, 'domain assessment', cid, 'note') });
  }
  @Post('/assessments/:assessmentId/limit')
  async limitAssessment(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('assessmentId') assessmentId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.limitAssessment(envelope, principal, t, d, id(assessmentId, 'assessmentId', 'domain assessment', cid), reason(body.payload ?? {}, 'domain assessment', cid));
  }
  @Post('/assessments/:assessmentId/read')
  async readAssessment(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('assessmentId') assessmentId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    const at = body.payload?.['asOf'];
    let asOf: string | null = null;
    if (at !== undefined && at !== null) {
      const ms = Date.parse(String(at));
      if (Number.isNaN(ms)) throw refuse('domain assessment', 'request', 'asOf is an instant', cid);
      asOf = new Date(ms).toISOString();
    }
    return this.svc.assessment(envelope, principal, t, d, id(assessmentId, 'assessmentId', 'domain assessment', cid), asOf);
  }

  /* ───────────── PK5: watchlists, events, alerts, links ───────────── */
  @Post('/watchlists/declare')
  async declareWatchlist(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    if (!Array.isArray(p['rules'])) throw refuse('watchlist', 'rules', 'rules is a list', cid);
    return this.svc.declareWatchlist(envelope, principal, t, d, {
      watchlistId: p['watchlistId'] === undefined || p['watchlistId'] === null ? null : id(p['watchlistId'], 'watchlistId', 'watchlist', cid),
      key: str(p, 'packageKey'), title: str(p, 'title'), entities: p['entities'] === undefined ? [] : ids(p['entities'], 'entities', 'watchlist', cid, true),
      indicators: Array.isArray(p['indicators']) ? (p['indicators'] as unknown[]).map(String) : [], rules: p['rules'] as unknown[],
      freshnessDays: p['freshnessDays'] === undefined ? 30 : int(p['freshnessDays'], 'freshnessDays', 'watchlist', cid),
      expectedVersion: p['expectedVersion'] === undefined ? 0 : int(p['expectedVersion'], 'expectedVersion', 'watchlist', cid),
    });
  }
  @Post('/watchlists/:watchlistId/retire')
  async retireWatchlist(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('watchlistId') watchlistId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.retireWatchlist(envelope, principal, t, d, id(watchlistId, 'watchlistId', 'watchlist', cid), reason(body.payload ?? {}, 'watchlist', cid));
  }
  @Post('/watchlists/:watchlistId/resolve')
  async resolveAlerts(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('watchlistId') watchlistId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.resolveAlerts(envelope, principal, t, d, id(watchlistId, 'watchlistId', 'watchlist', cid), reason(body.payload ?? {}, 'watchlist', cid));
  }
  @Post('/events/record')
  async recordEvent(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const day = str(p, 'occurredOn');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw refuse('domain event', 'date', 'occurredOn is the day it occurred (YYYY-MM-DD)', cid);
    return this.svc.recordEvent(envelope, principal, t, d, { key: str(p, 'packageKey'), kind: str(p, 'kind'), title: str(p, 'title'), subjects: ids(p['subjects'], 'subjects', 'domain event', cid),
                                                             occurredOn: day, evidence: evidence(p['evidence'], 'domain event', cid) });
  }
  @Post('/events/:eventId/confirm')
  async confirmEvent(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('eventId') eventId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const decision = str(p, 'decision');
    if (decision !== 'confirm' && decision !== 'reject') throw refuse('domain event', 'decision', 'the decision is confirm or reject', cid);
    return this.svc.confirmEvent(envelope, principal, t, d, id(eventId, 'eventId', 'domain event', cid), { decision, note: reason(p, 'domain event', cid, 'note') });
  }
  @Post('/alerts/:alertId/adjudicate')
  async adjudicate(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('alertId') alertId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const a = str(p, 'adjudication');
    if (a !== 'true_positive' && a !== 'false_positive') throw refuse('watchlist', 'adjudication', 'true_positive or false_positive', cid);
    return this.svc.adjudicateAlert(envelope, principal, t, d, id(alertId, 'alertId', 'watchlist', cid), { adjudication: a, note: reason(p, 'watchlist', cid, 'note') });
  }
  @Post('/links/declare')
  async declareLink(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const kind = str(p, 'kind');
    if (!['exposure', 'forecast', 'scenario', 'indicator'].includes(kind)) throw refuse('domain package', 'link', 'the link kind is exposure, forecast, scenario or indicator', cid);
    return this.svc.declareLink(envelope, principal, t, d, { key: str(p, 'packageKey'), kind, targetId: id(p['targetId'], 'targetId', 'domain package', cid),
      assessmentId: p['assessmentId'] === undefined || p['assessmentId'] === null ? null : id(p['assessmentId'], 'assessmentId', 'domain package', cid), note: str(p, 'note') });
  }
  @Post('/links/:linkId/withdraw')
  async withdrawLink(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('linkId') linkId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.withdrawLink(envelope, principal, t, d, id(linkId, 'linkId', 'domain package', cid), reason(body.payload ?? {}, 'domain package', cid));
  }
}
