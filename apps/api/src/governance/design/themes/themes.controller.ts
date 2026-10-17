/**
 * B80 §TK (0118_b80_x_tk; F-P7-E-03) — THE HTTP SURFACE of the governed customer theme.
 *
 * TENANT — base /v1/tenants/:tenantId/governance/design/themes:
 *   read                    governance.design.theme.read (audited: the versions, certifications, activations, the theme in force, the ledger)
 *   in-force/read           governance.design.theme.in_force.read (every human role of the tenant — what ThemeScope applies; also on
 *                           /v1/tenants/:t/domains/:d/governance/design/themes/in-force/read for a domain-bound principal)
 *   :themeId/preview        governance.design.theme.preview (the matrix from the STORED mapping, the certification digest, the caller's eligibility)
 *   propose                 governance.design.theme.propose (the brand owner; human-gated)
 *   :themeId/certify        governance.design.theme.certify (the Design System Authority; human-gated; SIGNED; a refused outcome 409 `(contrast)`)
 *   :themeId/activate       governance.design.theme.activate (the brand owner; human-gated; a certified version only)
 *   rollback                governance.design.theme.rollback (the brand owner; human-gated; to the theme before it, or the core theme)
 *   :themeId/retire         governance.design.theme.retire (the brand owner; human-gated; never the theme in force)
 * PLATFORM:
 *   /v1/governance/design/themes/queue/read      governance.design.theme.read (the Design System Authority's certification queue)
 *   /v1/governance/design/library/lint           governance.design.evaluate (B107's rule — dg-lint-2 recorded through B107's evaluation port)
 *
 * Refusals in the server's words: `design theme rejected (<class>): …`. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../../shared/correlation.js';
import type { EyeRequest } from '../../../pipeline/http.js';
import { ThemesService } from './themes.service.js';
import { proposalProblem, refuseTheme } from './themes-logic.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const str = (p: Row, k: string): string => (typeof p[k] === 'string' ? String(p[k]).trim() : '');
function id(v: unknown, what: string, cid: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseTheme('request', `${what} is an id`, cid);
  return v;
}
function int(v: unknown, what: string, cid: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw refuseTheme('request', `${what} is a whole number`, cid);
  return v;
}
function reason(p: Row, cid: string): string {
  const r = str(p, 'reason');
  if (r.length < 8) throw refuseTheme('reason', 'a reason of at least 8 characters is stated', cid);
  return r;
}
function digest(p: Row, cid: string): string {
  const x = str(p, 'digest');
  if (!HEX64.test(x)) throw refuseTheme('digest', 'the act names the exact digest it was shown (64 hex)', cid);
  return x;
}

@Controller('/v1/tenants/:tenantId/governance/design/themes')
export class ThemesTenantController {
  constructor(private readonly svc: ThemesService) {}

  @Post('/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') t: string) { const { envelope, principal } = ctx(req); return this.svc.tenantRead(envelope, principal, id(t, 'tenantId', envelope.correlation_id)); }
  @Post('/in-force/read')
  async inForce(@Req() req: EyeRequest, @Param('tenantId') t: string) { const { envelope, principal } = ctx(req); return this.svc.inForce(envelope, principal, id(t, 'tenantId', envelope.correlation_id)); }
  @Post('/propose')
  async propose(@Req() req: EyeRequest, @Param('tenantId') t: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const problem = proposalProblem(p);
    if (problem !== null) throw refuseTheme('request', problem, cid);
    return this.svc.propose(envelope, principal, id(t, 'tenantId', cid), { themeId: p['themeId'] === undefined || p['themeId'] === null ? null : id(p['themeId'], 'themeId', cid),
      key: str(p, 'key'), expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', cid), title: str(p, 'title'), mapping: p['mapping'] as Row });
  }
  @Post('/rollback')
  async rollback(@Req() req: EyeRequest, @Param('tenantId') t: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.rollback(envelope, principal, id(t, 'tenantId', cid), { expectedActivation: id(p['expectedActivation'], 'expectedActivation', cid), reason: reason(p, cid) });
  }
  @Post('/:themeId/preview')
  async preview(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('themeId') themeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.preview(envelope, principal, id(t, 'tenantId', cid), id(themeId, 'themeId', cid), int(p['version'], 'version', cid));
  }
  @Post('/:themeId/certify')
  async certify(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('themeId') themeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.certify(envelope, principal, id(t, 'tenantId', cid), id(themeId, 'themeId', cid), { version: int(p['version'], 'version', cid), digest: digest(p, cid), reason: reason(p, cid) });
  }
  @Post('/:themeId/activate')
  async activate(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('themeId') themeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.activate(envelope, principal, id(t, 'tenantId', cid), id(themeId, 'themeId', cid), { version: int(p['version'], 'version', cid), digest: digest(p, cid), reason: reason(p, cid) });
  }
  @Post('/:themeId/retire')
  async retire(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('themeId') themeId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.retire(envelope, principal, id(t, 'tenantId', cid), id(themeId, 'themeId', cid), { version: int(p['version'], 'version', cid), reason: reason(p, cid) });
  }
}

/** The theme in force read from a DOMAIN workspace (a domain-bound principal holds no TENANT binding: the same action on a DOMAIN route). */
@Controller('/v1/tenants/:tenantId/domains/:domainId/governance/design/themes')
export class ThemesDomainController {
  constructor(private readonly svc: ThemesService) {}

  @Post('/in-force/read')
  async inForce(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.inForce(envelope, principal, id(t, 'tenantId', cid), id(d, 'domainId', cid));
  }
}

@Controller('/v1/governance/design')
export class ThemesPlatformController {
  constructor(private readonly svc: ThemesService) {}

  @Post('/themes/queue/read')
  async queue(@Req() req: EyeRequest) { const { envelope, principal } = ctx(req); return this.svc.queue(envelope, principal); }
  @Post('/library/lint')
  async lint(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    const files = Array.isArray(p['files']) ? (p['files'] as Row[]).filter((f) => typeof f['path'] === 'string' && typeof f['text'] === 'string').map((f) => ({ path: String(f['path']), text: String(f['text']) })) : null;
    return this.svc.lintLibrary(envelope, principal, files === null ? null : { files });
  }
}
