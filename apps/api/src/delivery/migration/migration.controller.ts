/**
 * B94 §MG (0114 §MG) — THE HTTP SURFACE OF GOVERNED MIGRATION (CAP-DL-06 / CAP-PD-06, JRN-23, WS-20). DOMAIN routes live in the TARGET domain
 * (`/v1/tenants/:t/domains/:d/onboarding/migration`); the tenant's overview and the domain ACTIVATION are TENANT routes
 * (`/v1/tenants/:t/onboarding/migration`).
 *
 *   list (TENANT: programmes + waves; DOMAIN: waves) · waves/:w/read · waves/:w/ledger · waves/:w/suggest · waves/:w/acceptance/candidate
 *                                                     onboarding.read (audited)
 *   waves/open · waves/:w/withdraw                   onboarding.wave.open / .withdraw — the implementation lead
 *   waves/:w/mappings/propose                        onboarding.mapping.propose — the lead (suggestions adopted by a human, never pre-approved)
 *   waves/:w/mappings/:v/decide                      onboarding.mapping.approve (human-gated) — the onboarding authority, on the digest, signed
 *   waves/:w/rehearsals/run                          onboarding.rehearsal.run — the lead (or an agent holding the lead's role): a dry run
 *   waves/:w/cutover/request · cutovers/:c/recheck   onboarding.cutover.request / .recheck — the holds evaluated and recorded
 *   cutovers/:c/approve                              onboarding.cutover.approve (human-gated) — the authority, on the plan digest; 409 held
 *   cutovers/:c/execute · cutovers/:c/reconcile      onboarding.cutover.execute / .reconcile — the lead or an agent, inside the approved plan
 *   cutovers/:c/rollback/rehearse                    onboarding.rollback.rehearse — the lead (the rollback proof)
 *   cutovers/:c/rollback/execute                     onboarding.rollback.execute (human-gated) — the authority, on the rehearsal's digest
 *   waves/:w/acceptance/decide                       onboarding.acceptance.decide (human-gated) — the authority: accept | withhold, signed
 *   (TENANT) domains/:d/activate                     tenancy.domain.activate — the tenant administrator, after a verified cutover
 *
 * Refusals in the server's words: `<noun> rejected (<class>): …`. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { refuseDelivery, type DeliveryNoun } from '../seams.js';
import { MigrationService } from './migration.service.js';
import { specProblems, type MappingSpec } from './legacy.js';

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
function id(v: unknown, what: string, noun: DeliveryNoun, cid: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseDelivery(noun, 'request', `${what} is an id`, cid);
  return v;
}
function digest(v: unknown, noun: DeliveryNoun, cid: string): string {
  if (typeof v !== 'string' || !HEX64.test(v)) throw refuseDelivery(noun, 'request', 'the digest seen is 64 hex characters (read the record again)', cid);
  return v;
}
function reason(p: Row, noun: DeliveryNoun, cid: string): string {
  const r = str(p, 'reason');
  if (r.length < 8) throw refuseDelivery(noun, 'reason', 'a reason of at least 8 characters is stated', cid);
  return r;
}
function texts(v: unknown, what: string, noun: DeliveryNoun, cid: string): string[] {
  if (!Array.isArray(v) || !v.every((x) => typeof x === 'string' && x.trim().length > 0)) throw refuseDelivery(noun, 'request', `${what} is a list of names`, cid);
  return [...new Set((v as string[]).map((x) => x.trim()))].sort();
}
function version(v: unknown, noun: DeliveryNoun, cid: string): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) throw refuseDelivery(noun, 'request', 'a version is a positive integer', cid);
  return n;
}
function spec(v: unknown, cid: string): MappingSpec {
  if (v === null || typeof v !== 'object' || Array.isArray(v)) throw refuseDelivery('migration mapping', 'spec', 'a mapping is {key_column, columns: [{column, field, transforms, ignore}]}', cid);
  const s = v as Row;
  const columns = Array.isArray(s['columns']) ? (s['columns'] as Row[]).map((c) => ({
    column: typeof c['column'] === 'string' ? c['column'].trim() : '', field: typeof c['field'] === 'string' && c['field'] !== '' ? c['field'] : null,
    transforms: Array.isArray(c['transforms']) ? (c['transforms'] as unknown[]).map(String) : [], ignore: c['ignore'] === true,
  })) : [];
  const m = { key_column: typeof s['key_column'] === 'string' ? s['key_column'].trim() : '', columns } as MappingSpec;
  const problems = specProblems(m);
  if (problems.length > 0) throw refuseDelivery('migration mapping', 'spec', problems.join('; '), cid);
  return m;
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/onboarding/migration')
export class MigrationController {
  constructor(private readonly svc: MigrationService) {}

  /* ───────────── reads ───────────── */
  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.list(envelope, principal, t, d);
  }
  @Post('/waves/:waveId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('waveId') w: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.detail(envelope, principal, t, d, id(w, 'the wave', 'migration wave', envelope.correlation_id));
  }
  @Post('/waves/:waveId/ledger')
  async ledger(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('waveId') w: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.ledger(envelope, principal, t, d, id(w, 'the wave', 'migration wave', envelope.correlation_id));
  }
  @Post('/waves/:waveId/suggest')
  async suggest(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('waveId') w: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.suggest(envelope, principal, t, d, id(w, 'the wave', 'migration mapping', cid), id(p['evidenceId'], 'evidenceId', 'migration mapping', cid));
  }
  @Post('/waves/:waveId/acceptance/candidate')
  async candidate(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('waveId') w: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const baseline = p['baselineDigest'] === undefined || p['baselineDigest'] === null || p['baselineDigest'] === '' ? null : digest(p['baselineDigest'], 'onboarding acceptance', cid);
    return this.svc.candidate(envelope, principal, t, d, id(w, 'the wave', 'onboarding acceptance', cid),
      { journeys: texts(p['journeys'], 'journeys', 'onboarding acceptance', cid), roles: texts(p['roles'], 'roles', 'onboarding acceptance', cid), baselineDigest: baseline });
  }

  /* ───────────── the wave and its mapping ───────────── */
  @Post('/waves/open')
  async open(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.open(envelope, principal, t, d, { programmeId: id(p['programmeId'], 'programmeId', 'migration wave', cid), key: str(p, 'key'), title: str(p, 'title'),
      sourceId: id(p['sourceId'], 'sourceId', 'migration wave', cid), identifierSystem: str(p, 'identifierSystem'), identifierAuthority: str(p, 'identifierAuthority') });
  }
  @Post('/waves/:waveId/withdraw')
  async withdraw(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('waveId') w: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.withdraw(envelope, principal, t, d, id(w, 'the wave', 'migration wave', cid), reason(p, 'migration wave', cid));
  }
  @Post('/waves/:waveId/mappings/propose')
  async propose(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('waveId') w: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const basis = str(p, 'basis') || 'manual';
    if (!['manual', 'adopted_suggestions'].includes(basis)) throw refuseDelivery('migration mapping', 'basis', 'manual or adopted_suggestions', cid);
    const rationale = str(p, 'rationale');
    if (rationale.length < 8) throw refuseDelivery('migration mapping', 'rationale', 'a proposal states its rationale (8+ characters)', cid);
    return this.svc.proposeMapping(envelope, principal, t, d, id(w, 'the wave', 'migration mapping', cid),
      { spec: spec(p['spec'], cid), basis, rationale, expectedVersion: p['expectedVersion'] === undefined || p['expectedVersion'] === null ? null : Number(p['expectedVersion']) });
  }
  @Post('/waves/:waveId/mappings/:version/decide')
  async decide(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('waveId') w: string, @Param('version') v: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const decision = str(p, 'decision');
    if (decision !== 'approve' && decision !== 'reject') throw refuseDelivery('migration mapping', 'decision', 'approve or reject', cid);
    return this.svc.decideMapping(envelope, principal, t, d, id(w, 'the wave', 'migration mapping', cid),
      { version: version(v, 'migration mapping', cid), digest: digest(p['digest'], 'migration mapping', cid), decision, reason: reason(p, 'migration mapping', cid) });
  }

  /* ───────────── rehearsal, cutover, execution ───────────── */
  @Post('/waves/:waveId/rehearsals/run')
  async rehearse(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('waveId') w: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.rehearse(envelope, principal, t, d, id(w, 'the wave', 'migration rehearsal', cid),
      { evidenceId: id(p['evidenceId'], 'evidenceId', 'migration rehearsal', cid), mappingVersion: p['mappingVersion'] === undefined || p['mappingVersion'] === null ? null : version(p['mappingVersion'], 'migration rehearsal', cid) });
  }
  @Post('/waves/:waveId/cutover/request')
  async request(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('waveId') w: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.requestCutover(envelope, principal, t, d, id(w, 'the wave', 'migration cutover', cid), id(p['rehearsalId'], 'rehearsalId', 'migration cutover', cid));
  }
  @Post('/cutovers/:cutoverId/recheck')
  async recheck(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('cutoverId') c: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.recheckCutover(envelope, principal, t, d, id(c, 'the cutover', 'migration cutover', envelope.correlation_id));
  }
  @Post('/cutovers/:cutoverId/approve')
  async approve(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('cutoverId') c: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.approveCutover(envelope, principal, t, d, id(c, 'the cutover', 'migration cutover', cid), { digest: digest(p['digest'], 'migration cutover', cid), reason: reason(p, 'migration cutover', cid) });
  }
  @Post('/cutovers/:cutoverId/execute')
  async execute(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('cutoverId') c: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.execute(envelope, principal, t, d, id(c, 'the cutover', 'migration cutover', envelope.correlation_id));
  }
  @Post('/cutovers/:cutoverId/reconcile')
  async reconcile(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('cutoverId') c: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.reconcile(envelope, principal, t, d, id(c, 'the cutover', 'migration cutover', envelope.correlation_id));
  }

  /* ───────────── rollback and acceptance ───────────── */
  @Post('/cutovers/:cutoverId/rollback/rehearse')
  async rehearseRollback(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('cutoverId') c: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.rehearseRollback(envelope, principal, t, d, id(c, 'the cutover', 'migration rollback', envelope.correlation_id));
  }
  @Post('/cutovers/:cutoverId/rollback/execute')
  async executeRollback(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('cutoverId') c: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.executeRollback(envelope, principal, t, d, id(c, 'the cutover', 'migration rollback', cid),
      { rehearsalId: id(p['rehearsalId'], 'rehearsalId (the rollback rehearsal)', 'migration rollback', cid), digest: digest(p['digest'], 'migration rollback', cid), reason: reason(p, 'migration rollback', cid) });
  }
  @Post('/waves/:waveId/acceptance/decide')
  async accept(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('waveId') w: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const decision = str(p, 'decision');
    if (decision !== 'accept' && decision !== 'withhold') throw refuseDelivery('onboarding acceptance', 'decision', 'accept or withhold', cid);
    const baseline = p['baselineDigest'] === undefined || p['baselineDigest'] === null || p['baselineDigest'] === '' ? null : digest(p['baselineDigest'], 'onboarding acceptance', cid);
    return this.svc.decideAcceptance(envelope, principal, t, d, id(w, 'the wave', 'onboarding acceptance', cid), {
      decision, journeys: texts(p['journeys'], 'journeys', 'onboarding acceptance', cid), roles: texts(p['roles'], 'roles', 'onboarding acceptance', cid), baselineDigest: baseline,
      digest: digest(p['digest'], 'onboarding acceptance', cid), reason: reason(p, 'onboarding acceptance', cid) });
  }
}

/** The TENANT surface: the tenant's programmes and waves; the DOMAIN ACTIVATION (tenancy.domain.activate — the tenant administrator). */
@Controller('/v1/tenants/:tenantId/onboarding/migration')
export class MigrationTenantController {
  constructor(private readonly svc: MigrationService) {}

  @Post('/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') t: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.list(envelope, principal, t, null);
  }
  @Post('/domains/:domainId/activate')
  async activate(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.activate(envelope, principal, t, id(d, 'the domain', 'migration cutover', cid), id(p['cutoverId'], 'cutoverId', 'migration cutover', cid));
  }
}
