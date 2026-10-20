/**
 * B81 §CT (0119_b81_x_ct; F-P7-E-18) — THE HTTP SURFACE of the governed product language.
 *
 * PLATFORM — base /v1/governance/design/terms:
 *   read                 governance.design.term.read (audited: every version, the reviews, the ledger, the published catalogue, the content version)
 *   :termId/preview      governance.design.term.read (one version, its checks recomputed, the caller's eligibility)
 *   propose              governance.design.term.propose (a contributor; human-gated)
 *   :termId/correct      governance.design.term.correct (a contributor; human-gated; original / replacement / impact / action)
 *   :termId/review       governance.design.term.review (the Design System Authority or the conformance steward; never the proposer; human-gated)
 *   :termId/approve      governance.design.term.approve (the Design System Authority; never the proposer, never an agent; human-gated)
 *   :termId/publish      governance.design.term.publish (the Design System Authority; held while a cited term is unpublished; human-gated)
 *   :termId/retire       governance.design.term.retire (the Design System Authority; human-gated)
 *   content-lint         governance.design.evaluate (B107's rule — dg-lint-3 recorded through B107's evaluation port; the ratchet)
 *   catalogue/read       governance.design.term.catalogue.read (also on /v1/tenants/:t/… and /v1/tenants/:t/domains/:d/… — the domain glossary beside)
 *
 * Refusals in the server's words: `design term rejected (<class>): …`. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../../shared/correlation.js';
import type { EyeRequest } from '../../../pipeline/http.js';
import { TermsService } from './terms.service.js';
import { entryProblem, proposalProblem, refuseProblem, refuseTerm } from './terms-logic.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;
const LOCALE = /^[a-z]{2}(-[A-Z]{2})?$/;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const str = (p: Row, k: string): string => (typeof p[k] === 'string' ? String(p[k]).trim() : '');
function id(v: unknown, what: string, cid: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseTerm('request', `${what} is an id`, cid);
  return v;
}
function int(v: unknown, what: string, cid: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw refuseTerm('request', `${what} is a whole number`, cid);
  return v;
}
function text(p: Row, k: string, what: string, cid: string): string {
  const r = str(p, k);
  if (r.length < 8) throw refuseTerm(k === 'notes' || k === 'reason' ? 'reason' : 'correction', `${what} of at least 8 characters is stated`, cid);
  return r;
}
function digest(p: Row, cid: string): string {
  const x = str(p, 'digest');
  if (!HEX64.test(x)) throw refuseTerm('digest', 'the act names the exact digest it was shown (64 hex)', cid);
  return x;
}
function locale(p: Row, cid: string): string {
  const l = p['locale'] === undefined || p['locale'] === null ? 'en' : str(p, 'locale');
  if (!LOCALE.test(l)) throw refuseTerm('locale', 'a locale is a language code (en, en-GB …)', cid);
  return l;
}

@Controller('/v1/governance/design/terms')
export class TermsPlatformController {
  constructor(private readonly svc: TermsService) {}

  @Post('/read')
  async read(@Req() req: EyeRequest) { const { envelope, principal } = ctx(req); return this.svc.registry(envelope, principal); }
  @Post('/catalogue/read')
  async catalogue(@Req() req: EyeRequest, @Body() body: Payload) { const { envelope, principal } = ctx(req); return this.svc.catalogue(envelope, principal, locale(body.payload ?? {}, envelope.correlation_id)); }
  @Post('/content-lint')
  async lint(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    const files = Array.isArray(p['files']) ? (p['files'] as Row[]).filter((f) => typeof f['path'] === 'string' && typeof f['text'] === 'string').map((f) => ({ path: String(f['path']), text: String(f['text']) })) : null;
    return this.svc.lintContent(envelope, principal, files === null ? null : { files });
  }
  @Post('/propose')
  async propose(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const problem = proposalProblem(p);
    if (problem !== null) throw refuseProblem(problem, cid);
    return this.svc.propose(envelope, principal, { termId: p['termId'] === undefined || p['termId'] === null ? null : id(p['termId'], 'termId', cid),
      key: str(p, 'key'), locale: locale(p, cid), expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', cid), entry: p['entry'] as Row });
  }
  @Post('/:termId/preview')
  async preview(@Req() req: EyeRequest, @Param('termId') termId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.preview(envelope, principal, id(termId, 'termId', cid), int(p['version'], 'version', cid));
  }
  @Post('/:termId/correct')
  async correct(@Req() req: EyeRequest, @Param('termId') termId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const problem = entryProblem(p['entry']);
    if (problem !== null) throw refuseProblem(problem, cid);
    return this.svc.correct(envelope, principal, id(termId, 'termId', cid), { expectedVersion: int(p['expectedVersion'], 'expectedVersion', cid), entry: p['entry'] as Row,
      impact: text(p, 'impact', 'the impact', cid), action: text(p, 'action', 'the action readers take', cid) });
  }
  @Post('/:termId/review')
  async review(@Req() req: EyeRequest, @Param('termId') termId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const outcome = str(p, 'outcome');
    if (outcome !== 'ready' && outcome !== 'changes_requested') throw refuseTerm('outcome', 'a review is ready or changes_requested', cid);
    return this.svc.review(envelope, principal, id(termId, 'termId', cid), { version: int(p['version'], 'version', cid), digest: digest(p, cid), outcome, notes: text(p, 'notes', 'review notes', cid) });
  }
  @Post('/:termId/approve')
  async approve(@Req() req: EyeRequest, @Param('termId') termId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.approve(envelope, principal, id(termId, 'termId', cid), { version: int(p['version'], 'version', cid), digest: digest(p, cid), reason: text(p, 'reason', 'a reason', cid) });
  }
  @Post('/:termId/publish')
  async publish(@Req() req: EyeRequest, @Param('termId') termId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.publish(envelope, principal, id(termId, 'termId', cid), { version: int(p['version'], 'version', cid), digest: digest(p, cid), reason: text(p, 'reason', 'a reason', cid) });
  }
  @Post('/:termId/retire')
  async retire(@Req() req: EyeRequest, @Param('termId') termId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.retire(envelope, principal, id(termId, 'termId', cid), { version: int(p['version'], 'version', cid), reason: text(p, 'reason', 'a reason', cid) });
  }
}

/** The published catalogue read from a TENANT workspace. */
@Controller('/v1/tenants/:tenantId/governance/design/terms')
export class TermsTenantController {
  constructor(private readonly svc: TermsService) {}

  @Post('/catalogue/read')
  async catalogue(@Req() req: EyeRequest, @Param('tenantId') t: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.catalogue(envelope, principal, locale(body.payload ?? {}, cid), id(t, 'tenantId', cid));
  }
}

/** The published catalogue read from a DOMAIN workspace — with the domain glossary's linked entries beside each term (B90; never merged). */
@Controller('/v1/tenants/:tenantId/domains/:domainId/governance/design/terms')
export class TermsDomainController {
  constructor(private readonly svc: TermsService) {}

  @Post('/catalogue/read')
  async catalogue(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.catalogue(envelope, principal, locale(body.payload ?? {}, cid), id(t, 'tenantId', cid), id(d, 'domainId', cid));
  }
}
