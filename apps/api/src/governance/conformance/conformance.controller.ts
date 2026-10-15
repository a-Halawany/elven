/**
 * B107 §CM (0115_b107_x_cm) — THE HTTP SURFACE of conformance (PLATFORM: the vendor's registries). Base `/v1/governance/conformance`.
 *
 *   read                                   governance.read (audited) — the workspace: build identity, committed vs registered manifest,
 *                                          candidates, findings, monitor runs, the state per component, the closure gap report, the ledger
 *   manifest/read                          governance.read — the committed manifest's units and logical components (filter: layer, kind)
 *   manifest/register                      governance.conformance.manifest.register — the conformance steward; the SERVER reads the committed file
 *   candidates/assemble                    governance.conformance.candidate.assemble — the steward (a new candidate, or an amendment over renewed evidence)
 *   candidates/:candidateId/check          governance.conformance.candidate.check — the steward; refusals answered after the verdict commits
 *   candidates/:candidateId/preview        governance.read — the attestation's preview: the exact digest, the caller's eligibility, the consequence
 *   candidates/:candidateId/attest         governance.conformance.candidate.attest (human-gated) — independent assurance, on the digest, SIGNED
 *   candidates/:candidateId/withdraw       governance.conformance.candidate.withdraw — the steward or the product authority
 *   monitor/run                            governance.conformance.monitor — the steward (the attention tick runs the same after every tick)
 *
 * Refusals in the server's words: `<noun> rejected (<class>): …`. A release candidate is NOT a release (B65 substituted); nothing here is
 * production admission (R1) or real acceptance (R2).
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { refuseGovernance, type GovernanceNoun } from '../seams.js';
import { ConformanceService } from './conformance.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const LAYER = /^L(10|[1-9])$/;
const KINDS = ['api_composition_root', 'api_module', 'worker', 'web_app', 'package', 'infrastructure_service'];
const NOUN: GovernanceNoun = 'release candidate';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope; const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const str = (p: Row, k: string): string => (typeof p[k] === 'string' ? String(p[k]).trim() : '');
function uuid(v: unknown, what: string, cid: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseGovernance(NOUN, 'request', `${what} is an id`, cid);
  return v.toLowerCase();
}
function int(v: unknown, what: string, cid: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) throw refuseGovernance(NOUN, 'request', `${what} is a whole number`, cid);
  return v;
}
function reason(p: Row, cid: string): string {
  const r = str(p, 'reason');
  if (r.length < 8) throw refuseGovernance(NOUN, 'reason', 'a reason of at least 8 characters is stated', cid);
  return r;
}

@Controller('/v1/governance/conformance')
export class ConformanceController {
  constructor(private readonly svc: ConformanceService) {}

  @Post('/read')
  async workspace(@Req() req: EyeRequest) {
    const { envelope, principal } = ctx(req);
    return this.svc.workspace(envelope, principal);
  }

  @Post('/manifest/read')
  async manifest(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    const layer = str(p, 'layer') || null; const kind = str(p, 'kind') || null;
    if (layer !== null && !LAYER.test(layer)) throw refuseGovernance('conformance manifest', 'request', 'the layer is L1 … L10', envelope.correlation_id);
    if (kind !== null && !KINDS.includes(kind)) throw refuseGovernance('conformance manifest', 'request', `the unit kind is one of ${KINDS.join(', ')}`, envelope.correlation_id);
    return this.svc.manifestView(envelope, principal, { layer, kind });
  }

  @Post('/manifest/register')
  async register(@Req() req: EyeRequest) {
    const { envelope, principal } = ctx(req);
    return this.svc.registerManifest(envelope, principal);
  }

  @Post('/candidates/assemble')
  async assemble(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const candidateId = p['candidateId'] === undefined || p['candidateId'] === null ? null : uuid(p['candidateId'], 'candidateId', cid);
    const expectedVersion = int(p['expectedVersion'] ?? 0, 'expectedVersion', cid);
    const label = str(p, 'label');
    if (label.length < 3) throw refuseGovernance(NOUN, 'label', 'a candidate is labelled (3+ characters)', cid);
    const from = str(p, 'periodFrom'); const to = str(p, 'periodTo');
    if (!DAY.test(from) || !DAY.test(to)) throw refuseGovernance(NOUN, 'period', 'the period under review names two days (YYYY-MM-DD)', cid);
    const scope = (p['scope'] ?? { kind: 'platform' }) as Row;
    if (typeof scope !== 'object' || scope === null) throw refuseGovernance(NOUN, 'scope', 'the customer scope is { kind: platform } or { kind: tenants, tenants: [...], domains: [...] }', cid);
    const evidence = p['evidence'];
    if (!Array.isArray(evidence) || !evidence.every((e) => typeof e === 'object' && e !== null)) throw refuseGovernance(NOUN, 'evidence', 'the evidence is a list of items', cid);
    const builders = p['builders'] === undefined ? [] : p['builders'];
    if (!Array.isArray(builders) || !builders.every((b) => typeof b === 'string' && UUID.test(b))) throw refuseGovernance(NOUN, 'builders', 'the builders are principal ids', cid);
    return this.svc.assemble(envelope, principal, { candidateId, expectedVersion, label, scope, from, to, evidence: evidence as Row[], builders: [...new Set(builders as string[])] });
  }

  @Post('/candidates/:candidateId/check')
  async check(@Req() req: EyeRequest, @Param('candidateId') id: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.check(envelope, principal, uuid(id, 'the candidate', cid), int((body.payload ?? {})['version'], 'version', cid));
  }

  @Post('/candidates/:candidateId/preview')
  async preview(@Req() req: EyeRequest, @Param('candidateId') id: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.preview(envelope, principal, uuid(id, 'the candidate', envelope.correlation_id));
  }

  @Post('/candidates/:candidateId/attest')
  async attest(@Req() req: EyeRequest, @Param('candidateId') id: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const digest = str(p, 'digest');
    if (!HEX64.test(digest)) throw refuseGovernance(NOUN, 'digest', 'the attestation names the exact digest it was shown (64 hex)', cid);
    return this.svc.attest(envelope, principal, uuid(id, 'the candidate', cid), { version: int(p['version'], 'version', cid), digest, reason: reason(p, cid) });
  }

  @Post('/candidates/:candidateId/withdraw')
  async withdraw(@Req() req: EyeRequest, @Param('candidateId') id: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.withdraw(envelope, principal, uuid(id, 'the candidate', cid), { version: int(p['version'], 'version', cid), reason: reason(p, cid) });
  }

  @Post('/monitor/run')
  async monitor(@Req() req: EyeRequest) {
    const { envelope, principal } = ctx(req);
    return this.svc.monitor(envelope, principal, 'steward', null);
  }
}
