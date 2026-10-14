/**
 * B107 §RG (0115_b107_x_rg) — THE HTTP SURFACE of the registries, traceability, change impact, the verification record and the fixture
 * registry. PLATFORM routes (the vendor's registries), base `/v1/governance/registries`:
 *
 *   read · artifacts/resolve · artifacts/search · trace · orphans · lint · impact/preview · inheritance/read · admission/check · snapshot ·
 *   verification/:recordId/read                                        governance.read (audited)
 *   import                                                             governance.registry.import — the conformance steward (READ-ONLY sources)
 *   artifacts/register                                                 governance.registry.register — the steward
 *   links/record · links/:linkId/retire                                governance.trace.link — the steward
 *   inheritance/reconcile                                              governance.trace.check — the steward (holds opened / lifted)
 *   impact/record                                                      governance.impact.record — the steward, on the digest shown
 *   verification/ingest                                                governance.verification.ingest — the steward
 *   verification/:recordId/review                                      governance.verification.review (human-gated) — independent assurance
 *   fixtures/register · fixtures/:fixtureId/quarantine · fixtures/sweep governance.fixture.register / .quarantine — the steward
 *   fixtures/:fixtureId/approve                                        governance.fixture.approve (human-gated) — independent assurance
 *
 * Refusals in the server's words: `<noun> rejected (<class>): …`. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { refuseGovernance, type GovernanceNoun } from '../seams.js';
import { RegistriesService, SOURCE_NAMES, type SourceName } from './registries.service.js';
import { ReportError } from './reports.js';

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
const opt = (p: Row, k: string): string | null => (str(p, k) === '' ? null : str(p, k));
function id(v: unknown, what: string, noun: GovernanceNoun, cid: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseGovernance(noun, 'request', `${what} is an id`, cid);
  return v.toLowerCase();
}
const optId = (v: unknown, what: string, noun: GovernanceNoun, cid: string): string | null => (v === undefined || v === null || v === '' ? null : id(v, what, noun, cid));
function int(v: unknown, what: string, noun: GovernanceNoun, cid: string, lo = 0, hi = 1_000_000): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < lo || v > hi) throw refuseGovernance(noun, 'request', `${what} is a whole number between ${lo} and ${hi}`, cid);
  return v;
}
function reason(p: Row, noun: GovernanceNoun, cid: string): string {
  const r = str(p, 'reason');
  if (r.length < 8) throw refuseGovernance(noun, 'reason', 'a reason of at least 8 characters is stated', cid);
  return r;
}
function asOf(p: Row, cid: string): string | null {
  const v = opt(p, 'asOf');
  if (v === null) return null;
  if (Number.isNaN(Date.parse(v))) throw refuseGovernance('trace link', 'as_of', 'asOf is an instant (ISO 8601)', cid);
  return new Date(v).toISOString();
}
/** An artifact named by id, or by kind + key. */
function ref(p: Row, noun: GovernanceNoun, cid: string): { artifactId: string | null; kind: string | null; key: string | null } {
  if (p['artifactId'] !== undefined && p['artifactId'] !== null) return { artifactId: id(p['artifactId'], 'artifactId', noun, cid), kind: null, key: null };
  const kind = str(p, 'kind'); const key = str(p, 'key');
  if (kind === '' || key === '') throw refuseGovernance(noun, 'request', 'name the artifact by artifactId, or by kind and key', cid);
  return { artifactId: null, kind, key };
}
function changes(p: Row, cid: string) {
  const c = p['changes'];
  if (!Array.isArray(c) || c.length === 0 || c.length > 500) throw refuseGovernance('change impact', 'changes', 'name 1–500 changed artifacts', cid);
  return (c as Row[]).map((x) => {
    const r = ref(x ?? {}, 'change impact', cid);
    const d = opt(x ?? {}, 'proposedDigest');
    if (d !== null && !HEX64.test(d)) throw refuseGovernance('change impact', 'digest', 'a proposed digest is 64 hex', cid);
    return { ...r, proposedDigest: d };
  });
}
function strings(v: unknown, what: string, noun: GovernanceNoun, cid: string, max = 200): string[] {
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || v.length > max || !v.every((x) => typeof x === 'string' && x.length > 0 && x.length <= 200)) throw refuseGovernance(noun, 'request', `${what} is a list of up to ${max} strings`, cid);
  return [...new Set(v as string[])];
}

@Controller('/v1/governance/registries')
export class RegistriesController {
  constructor(private readonly svc: RegistriesService) {}

  /* ───────────── reads ───────────── */
  @Post('/read')
  async read(@Req() req: EyeRequest) { const { envelope, principal } = ctx(req); return this.svc.overview(envelope, principal); }

  @Post('/artifacts/resolve')
  async resolve(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const kind = str(p, 'kind'); const key = str(p, 'key');
    if (kind === '' || key === '') throw refuseGovernance('requirement registry', 'request', 'name the kind and the key', cid);
    return this.svc.resolve(envelope, principal, kind, key, asOf(p, cid));
  }
  @Post('/artifacts/search')
  async search(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const q = str(p, 'q');
    if (q.length < 2 || q.length > 200) throw refuseGovernance('requirement registry', 'request', 'a search names 2–200 characters', cid);
    return this.svc.search(envelope, principal, q, opt(p, 'kind'), p['limit'] === undefined ? 50 : int(p['limit'], 'limit', 'requirement registry', cid, 1, 200));
  }
  @Post('/trace')
  async trace(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.trace(envelope, principal, ref(p, 'trace link', cid), p['depth'] === undefined ? 4 : int(p['depth'], 'depth', 'trace link', cid, 1, 12), asOf(p, cid));
  }
  @Post('/orphans')
  async orphans(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const rule = opt(p, 'rule');
    if (rule !== null && !/^RG-[OV]\d{2}$/.test(rule)) throw refuseGovernance('trace link', 'rule', 'a rule is RG-Onn or RG-Vnn', cid);
    return this.svc.orphans(envelope, principal, rule, p['limit'] === undefined ? 25 : int(p['limit'], 'limit', 'trace link', cid, 0, 500),
      p['offset'] === undefined ? 0 : int(p['offset'], 'offset', 'trace link', cid, 0, 1_000_000));
  }
  @Post('/lint')
  async lint(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    return this.svc.lint(envelope, principal, p['limit'] === undefined ? 50 : int(p['limit'], 'limit', 'trace link', envelope.correlation_id, 1, 500));
  }
  @Post('/impact/preview')
  async impactPreview(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.impactPreview(envelope, principal, changes(p, cid), p['depth'] === undefined ? 8 : int(p['depth'], 'depth', 'change impact', cid, 1, 12));
  }
  @Post('/inheritance/read')
  async inheritance(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); return this.svc.inheritance(envelope, principal, ref(body.payload ?? {}, 'trace link', envelope.correlation_id));
  }
  @Post('/admission/check')
  async admission(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); return this.svc.admission(envelope, principal, ref(body.payload ?? {}, 'trace link', envelope.correlation_id));
  }
  @Post('/snapshot')
  async snapshot(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {};
    const kinds = strings(p['kinds'], 'kinds', 'requirement registry', envelope.correlation_id, 30);
    return this.svc.snapshot(envelope, principal, kinds.length === 0 ? ['requirement'] : kinds);
  }
  @Post('/verification/:recordId/read')
  async verificationRead(@Req() req: EyeRequest, @Param('recordId') recordId: string) {
    const { envelope, principal } = ctx(req);
    return this.svc.verificationRead(envelope, principal, id(recordId, 'recordId', 'verification record', envelope.correlation_id));
  }

  /* ───────────── the steward's acts ───────────── */
  @Post('/import')
  async import(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const names = strings(p['sources'], 'sources', 'requirement registry', cid, 6);
    if (!names.every((n) => (SOURCE_NAMES as readonly string[]).includes(n))) throw refuseGovernance('requirement registry', 'source', `a source is one of ${SOURCE_NAMES.join(', ')}`, cid);
    return this.svc.importRegisters(envelope, principal, names.length === 0 ? SOURCE_NAMES : (names as SourceName[]));
  }
  @Post('/artifacts/register')
  async register(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const attributes = p['attributes'] ?? {};
    if (attributes === null || typeof attributes !== 'object' || Array.isArray(attributes)) throw refuseGovernance('requirement registry', 'attributes', 'attributes are an object', cid);
    return this.svc.register(envelope, principal, {
      kind: str(p, 'kind'), key: str(p, 'key'), expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', 'requirement registry', cid), title: str(p, 'title'),
      authorityClass: str(p, 'authorityClass'), volume: opt(p, 'volume'), lifecycle: str(p, 'lifecycle') || 'active', attributes: attributes as Row,
      supersedes: optId(p['supersedes'], 'supersedes', 'requirement registry', cid), parent: optId(p['parent'], 'parent', 'requirement registry', cid),
      owner: optId(p['owner'], 'owner', 'requirement registry', cid), ownerRole: opt(p, 'ownerRole'),
    });
  }
  @Post('/links/record')
  async link(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const attributes = p['attributes'] ?? {};
    if (attributes === null || typeof attributes !== 'object' || Array.isArray(attributes)) throw refuseGovernance('trace link', 'attributes', 'attributes are an object', cid);
    return this.svc.link(envelope, principal, { from: id(p['from'], 'from', 'trace link', cid), to: id(p['to'], 'to', 'trace link', cid), relation: str(p, 'relation'),
                                               attributes: attributes as Row, reason: reason(p, 'trace link', cid) });
  }
  @Post('/links/:linkId/retire')
  async retire(@Req() req: EyeRequest, @Param('linkId') linkId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const cid = envelope.correlation_id;
    return this.svc.retireLink(envelope, principal, id(linkId, 'linkId', 'trace link', cid), reason(body.payload ?? {}, 'trace link', cid));
  }
  @Post('/inheritance/reconcile')
  async reconcile(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const list = p['artifacts'];
    if (!Array.isArray(list) || list.length === 0 || list.length > 200) throw refuseGovernance('trace link', 'artifacts', 'name 1–200 artifacts', cid);
    return this.svc.reconcile(envelope, principal, (list as Row[]).map((x) => ref(x ?? {}, 'trace link', cid)));
  }
  @Post('/impact/record')
  async impactRecord(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const digest = str(p, 'expectedDigest');
    if (!HEX64.test(digest)) throw refuseGovernance('change impact', 'digest', 'the record names the impact digest it was shown (64 hex)', cid);
    const trigger = str(p, 'trigger') || 'change';
    if (trigger !== 'change' && trigger !== 'proposal') throw refuseGovernance('change impact', 'trigger', 'an impact is recorded for a change or a proposal', cid);
    return this.svc.impactRecord(envelope, principal, changes(p, cid), p['depth'] === undefined ? 8 : int(p['depth'], 'depth', 'change impact', cid, 1, 12), digest, trigger);
  }
  @Post('/verification/ingest')
  async ingest(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const format = str(p, 'format');
    if (!['vitest', 'playwright', 'gate_receipt'].includes(format)) throw refuseGovernance('verification record', 'format', 'the report is vitest, playwright or gate_receipt', cid);
    const name = str(p, 'name');
    if (name.length < 1 || name.length > 200) throw refuseGovernance('verification record', 'name', 'the report is named (1–200 characters)', cid);
    const raw = typeof p['report'] === 'string' ? (p['report'] as string) : p['report'] !== undefined && p['report'] !== null && typeof p['report'] === 'object' ? JSON.stringify(p['report']) : '';
    if (raw === '') throw refuseGovernance('verification record', 'report', 'the report is the JSON the runner wrote (a string or an object)', cid);
    const claim = str(p, 'claim') || 'construction';
    if (claim !== 'construction' && claim !== 'demonstration') throw refuseGovernance('verification record', 'claim', 'a record is construction or demonstration evidence — never acceptance', cid);
    let report;
    try { report = this.svc.normalise(format, name, raw, strings(p['cite'], 'cite', 'verification record', cid, 100), strings(p['fixtures'], 'fixtures', 'verification record', cid, 50)); } catch (e) {
      if (e instanceof ReportError) throw refuseGovernance('verification record', 'report', e.message, cid);
      throw e;
    }
    return this.svc.ingest(envelope, principal, { report, validDays: p['validDays'] === undefined ? 30 : int(p['validDays'], 'validDays', 'verification record', cid, 1, 400), claim,
                                                  runnerPrincipal: optId(p['runnerPrincipal'], 'runnerPrincipal', 'verification record', cid) });
  }
  @Post('/verification/:recordId/review')
  async review(@Req() req: EyeRequest, @Param('recordId') recordId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const decision = str(p, 'decision');
    if (decision !== 'accepted' && decision !== 'rejected') throw refuseGovernance('verification record', 'decision', 'the review is accepted or rejected', cid);
    const digest = str(p, 'digest');
    if (!HEX64.test(digest)) throw refuseGovernance('verification record', 'digest', 'the review names the record\'s exact digest (64 hex)', cid);
    return this.svc.review(envelope, principal, id(recordId, 'recordId', 'verification record', cid), { decision, digest, reason: reason(p, 'verification record', cid) });
  }
  @Post('/fixtures/register')
  async registerFixture(@Req() req: EyeRequest, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const attributes = p['attributes'] ?? {};
    if (attributes === null || typeof attributes !== 'object' || Array.isArray(attributes)) throw refuseGovernance('governance fixture', 'attributes', 'attributes are an object', cid);
    return this.svc.registerFixture(envelope, principal, { key: str(p, 'key'), expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', 'governance fixture', cid), title: str(p, 'title'),
                                                          attributes: attributes as Row, reason: reason(p, 'governance fixture', cid) });
  }
  @Post('/fixtures/:fixtureId/approve')
  async approveFixture(@Req() req: EyeRequest, @Param('fixtureId') fixtureId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    const digest = str(p, 'digest');
    if (!HEX64.test(digest)) throw refuseGovernance('governance fixture', 'digest', 'the approval names the version\'s exact digest (64 hex)', cid);
    return this.svc.approveFixture(envelope, principal, id(fixtureId, 'fixtureId', 'governance fixture', cid),
      { version: int(p['version'], 'version', 'governance fixture', cid, 1), digest, reason: reason(p, 'governance fixture', cid) });
  }
  @Post('/fixtures/:fixtureId/quarantine')
  async quarantineFixture(@Req() req: EyeRequest, @Param('fixtureId') fixtureId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req); const p = body.payload ?? {}; const cid = envelope.correlation_id;
    return this.svc.quarantineFixture(envelope, principal, id(fixtureId, 'fixtureId', 'governance fixture', cid), { reasonClass: str(p, 'reasonClass'), reason: reason(p, 'governance fixture', cid) });
  }
  @Post('/fixtures/sweep')
  async sweep(@Req() req: EyeRequest) { const { envelope, principal } = ctx(req); return this.svc.sweepFixtures(envelope, principal); }
}
