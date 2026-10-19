/**
 * B80 §CL-F (0118_b80_x_clf; PAT-03) — THE FORM DRAFTS' HTTP SURFACE. Base `/v1/tenants/:t/domains/:d/shell/drafts`.
 *
 *   read · list                 shell.draft.read     the caller's OWN draft of one form (the payload only while live) · the caller's drafts
 *   save                        shell.draft.save     a new version superseding the one the form read (human-gated; the port re-checks)
 *   :draftId/discard            shell.draft.discard  a tombstone; the content is no longer offered (human-gated)
 *
 * A draft is never a submission and is never labelled an approval: the form's act is its own governed route. Refusals in the server's
 * words: `form draft rejected (<class>): …`. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { DraftsService } from './drafts.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal, cid: envelope.correlation_id };
}
const refuse = (cls: string, message: string, cid: string) => new HttpException(errorBody('EYE_REQ_001', cid, `form draft rejected (${cls}): ${message}`), 422);
const optStr = (p: Row, k: string): string | null => (typeof p[k] === 'string' && String(p[k]).trim() !== '' ? String(p[k]).trim() : null);
function optInt(p: Row, k: string, cid: string): number | null {
  const v = p[k];
  if (v === undefined || v === null) return null;
  if (typeof v !== 'number' || !Number.isInteger(v)) throw refuse(k, `${k} is an integer or null`, cid);
  return v;
}
function optId(v: unknown, what: string, cid: string): string | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !UUID.test(v)) throw refuse('request', `${what} is an id`, cid);
  return v;
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/shell/drafts')
export class DraftsController {
  constructor(private readonly svc: DraftsService) {}

  @Post('/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req);
    const p = body.payload ?? {};
    const draftId = optId(p['draftId'], 'draftId', cid);
    const formKey = optStr(p, 'formKey');
    if (draftId === null && formKey === null) throw refuse('request', 'name the form (formKey) or the draft (draftId)', cid);
    return this.svc.read(envelope, principal, t, d, { formKey, subjectKey: optStr(p, 'subjectKey'), draftId });
  }

  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    return this.svc.list(envelope, principal, t, d, optStr(body.payload ?? {}, 'formKey'));
  }

  @Post('/save')
  async save(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req);
    const p = body.payload ?? {};
    const formKey = optStr(p, 'formKey');
    if (formKey === null) throw refuse('form_key', 'name the form (formKey)', cid);
    const content = p['payload'];
    if (content === null || typeof content !== 'object' || Array.isArray(content)) throw refuse('payload', 'the draft is the form\'s state as one object', cid);
    return this.svc.save(envelope, principal, t, d, {
      formKey, subjectKey: optStr(p, 'subjectKey') ?? '-', schemaVersion: optStr(p, 'schemaVersion'), payload: content as Row,
      summary: optStr(p, 'summary'), step: optInt(p, 'step', cid), expectedVersion: optInt(p, 'expectedVersion', cid), ttlSeconds: optInt(p, 'ttlSeconds', cid),
    });
  }

  @Post('/:draftId/discard')
  async discard(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('draftId') draftId: string, @Body() body: Payload) {
    const { envelope, principal, cid } = ctx(req);
    const p = body.payload ?? {};
    const id = optId(draftId, 'draftId', cid);
    if (id === null) throw refuse('request', 'draftId is an id', cid);
    return this.svc.discard(envelope, principal, t, d, { draftId: id, expectedVersion: optInt(p, 'expectedVersion', cid), reason: optStr(p, 'reason') });
  }
}
