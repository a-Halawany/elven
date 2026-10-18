/**
 * B81 §DG (0119_b81_x_dg; F-P7-E-19: HX-16, REL-12, UX-ADR-018, PAT-20, PAT-30, CNT-12) — THE DEGRADED-STATE SERVICE: the pipeline's audited
 * read of the degraded state (`shell.degraded.read` — every contract of the scope with its live signal and mode, the undeclared degraded
 * dependencies, the unavailable functions in force) and its governed, human-gated writes: a contract's declaration
 * (`shell.degraded.contract.declare` — the operations authority, or the domain administrator for its domain's dependencies) and the owner's
 * verified exit (`shell.degraded.exit`). The intake is shaped here (TYPES only); the ports decide every rule.
 *
 * THE AUDIT JOURNAL: the API process's journal (the one /readyz reports — shared/degraded-store.ts) is passed to the evaluator beside the
 * availability incident ledger; it can only ADD degradation, never hide it.
 *
 * THE RETRY RULE (PAT-20): a declaration and an exit carry a request id (the command identity). A retry after an unknown outcome REUSES it:
 * the port answers the recorded row (`replayed: true`) — no duplicate effect. A new act takes a new id.
 *
 * THREE CLAIMS: construction (this code and phase6-degraded-b81.test.ts, every persona SYNTHETIC); demonstrated operation (the act);
 * real acceptance (UX-19-006: the shared recording path at B111, then H3) — never claimed.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { degradedAudit } from '../../shared/degraded-store.js';
import { newId } from '../../shared/ids.js';
import { PipelineService, type RouteInfo } from '../../pipeline/pipeline.service.js';
import { DegradedCapability, type FunctionEntry, type JournalState } from './degraded.capabilities.js';

type Row = Record<string, unknown>;
export const DEGRADED_ACTIONS = { read: 'shell.degraded.read', declare: 'shell.degraded.contract.declare', exit: 'shell.degraded.exit' } as const;
/** The refusal noun of this part — to be mapped centrally (observation-errors.ts) at integration. */
export const DEGRADED_NOUN = 'degraded contract';
export const DEPENDENCY_KINDS = ['audit', 'partition', 'source', 'method', 'agent', 'model', 'network'] as const;
const OBJECT_TYPE = 'SDG';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CODE = (s: number) => (s === 403 ? 'EYE_AUT_001' : s === 404 ? 'EYE_STA_001' : s === 409 ? 'EYE_STA_002' : 'EYE_REQ_001');

/** The class of a port's refusal `degraded contract rejected (<class>): …` → its HTTP answer, in the PORT's words (403 actor|authority ·
 *  404 unknown_* · 409 stale|state|duplicate · 422 the rest). Anything else is re-thrown untouched. */
export function asDegradedRefusal(e: unknown, correlationId: string): unknown {
  if (e instanceof HttpException || !(e instanceof Error)) return e;
  const m = /^degraded contract rejected \(([a-z_]+)\)/.exec(e.message);
  if (m === null) return e;
  const cls = m[1]!;
  const status = cls === 'actor' || cls === 'authority' || cls === 'separation_of_duties' ? 403
    : cls.startsWith('unknown_') ? 404 : ['stale', 'state', 'duplicate'].includes(cls) ? 409 : 422;
  return new HttpException(errorBody(CODE(status) as never, correlationId, e.message), status);
}
const mapped = async <T>(env: Envelope, f: () => Promise<T>): Promise<T> => { try { return await f(); } catch (e) { throw asDegradedRefusal(e, env.correlation_id); } };

/** A refusal answered by the route before any port runs (the caller's own request). */
export function refuseDegraded(cls: string, message: string, correlationId: string, status = 422): HttpException {
  return new HttpException(errorBody(CODE(status) as never, correlationId, `${DEGRADED_NOUN} rejected (${cls}): ${message}`), status);
}

export type DgScope = { tenantId: string | null; domainId: string | null };
const routeOf = (s: DgScope, action: string, objectId: string | null): RouteInfo =>
  (s.tenantId === null ? { scope: 'PLATFORM', tenantId: null, domainId: null, action, objectType: OBJECT_TYPE, objectId }
    : { scope: 'DOMAIN', tenantId: s.tenantId, domainId: s.domainId, action, objectType: OBJECT_TYPE, objectId });
const derive = (base: Envelope, action: string, objectId: string | null): Envelope =>
  ({ ...base, action, object_type: OBJECT_TYPE, object_id: objectId, side_effect_class: action === DEGRADED_ACTIONS.read ? 'none' : 'reversible', message_id: newId() }) as Envelope;
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

/** The process journal, as /readyz reports it. */
export function journalNow(): JournalState { const a = degradedAudit.state(); return { degraded: a.degraded, incidents: a.incidents, since: a.since }; }

const str = (p: Row, k: string): string | null => (typeof p[k] === 'string' && (p[k] as string).trim() !== '' ? (p[k] as string).trim() : null);
function functions(p: Row, k: string, cid: string): FunctionEntry[] {
  const v = p[k];
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v) || !v.every((e) => e !== null && typeof e === 'object' && typeof (e as Row)['action'] === 'string' && typeof (e as Row)['label'] === 'string')) {
    throw refuseDegraded('functions', `${k} is a list of {action, label}`, cid);
  }
  return (v as Row[]).map((e) => ({ action: String(e['action']), label: String(e['label']) }));
}
function durationOf(p: Row, cid: string): number {
  const v = p['maxDurationSeconds'];
  if (typeof v !== 'number' || !Number.isInteger(v)) throw refuseDegraded('max_duration', 'maxDurationSeconds is a whole number of seconds', cid);
  return v;
}
function idOf(v: unknown, cls: string, what: string, cid: string, status = 422): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseDegraded(cls, `${what} is an id`, cid, status);
  return v;
}

@Injectable()
export class DegradedService {
  constructor(private readonly pipeline: PipelineService) {}

  /** THE STATE of the scope (optionally one dependency kind / key — a corridor view asks for its source). Reads only. */
  async state(env: Envelope, p: AuthenticatedPrincipal, s: DgScope, body: Row) {
    const kind = str(body, 'kind'); const key = str(body, 'key');
    if (kind !== null && !(DEPENDENCY_KINDS as readonly string[]).includes(kind)) throw refuseDegraded('kind', `the kind is one of ${DEPENDENCY_KINDS.join(', ')}`, env.correlation_id);
    const journal = journalNow();
    const out = await mapped(env, () => this.pipeline.consequentialRead(derive(env, DEGRADED_ACTIONS.read, null), p, routeOf(s, DEGRADED_ACTIONS.read, null), DegradedCapability.read,
      async (cap) => cap.state({ tenantId: s.tenantId, domainId: s.domainId, journal, kind, key })));
    return { degraded: out.result, receipt: receipt(out) };
  }

  /** One contract's versions and exits. */
  async history(env: Envelope, p: AuthenticatedPrincipal, s: DgScope, contractIdRaw: string) {
    const contractId = idOf(contractIdRaw, 'unknown_contract', 'the contract', env.correlation_id, 404);
    const out = await mapped(env, () => this.pipeline.consequentialRead(derive(env, DEGRADED_ACTIONS.read, contractId), p, routeOf(s, DEGRADED_ACTIONS.read, contractId), DegradedCapability.read,
      async (cap) => cap.history({ tenantId: s.tenantId, domainId: s.domainId, contractId })));
    return { contract: out.result, receipt: receipt(out) };
  }

  /** DECLARE (or revise) the degraded contract of one dependency — human-gated; the port re-checks the authority, the owner, the version. */
  async declare(env: Envelope, p: AuthenticatedPrincipal, s: DgScope, body: Row) {
    const cid = env.correlation_id;
    const requestId = idOf(body['requestId'], 'request', 'requestId (the command identity a retry reuses)', cid);
    const kind = str(body, 'kind');
    if (kind === null || !(DEPENDENCY_KINDS as readonly string[]).includes(kind)) throw refuseDegraded('kind', `the kind is one of ${DEPENDENCY_KINDS.join(', ')}`, cid);
    const key = str(body, 'key');
    if (key === null) throw refuseDegraded('key', 'name the dependency (key)', cid);
    const ev = body['expectedVersion'];
    if (typeof ev !== 'number' || !Number.isInteger(ev) || ev < 0) throw refuseDegraded('version', 'expectedVersion is the version the declarer read (0 when there was none)', cid);
    const lim = body['limitations'];
    if (!Array.isArray(lim) || !lim.every((x) => typeof x === 'string')) throw refuseDegraded('limitations', 'limitations is a list of sentences', cid);
    const owner = idOf(body['ownerPrincipalId'], 'owner', 'the owner (ownerPrincipalId)', cid);
    const intake = {
      requestId, tenantId: s.tenantId, domainId: s.domainId, kind, key, expectedVersion: ev,
      available: functions(body, 'available', cid), unavailable: functions(body, 'unavailable', cid), limitations: lim as string[],
      maxDurationSeconds: durationOf(body, cid), ownerPrincipalId: owner,
      exitEvidence: str(body, 'exitEvidence') ?? '', reason: str(body, 'reason') ?? '', actor: p.principalId, correlationId: cid,
    };
    const out = await mapped(env, () => this.pipeline.write(derive(env, DEGRADED_ACTIONS.declare, null), p, routeOf(s, DEGRADED_ACTIONS.declare, null), DegradedCapability.write, async (cap) => {
      const r = await cap.declare(intake);
      return { result: r, targetType: OBJECT_TYPE, targetId: String(r['contract_id']), targetVersion: String(r['version']), outboxEvent: null };
    }));
    return { contract: out.result, receipt: receipt(out) };
  }

  /** EXIT: the owner's verified recovery of the contract version read — human-gated; refused while the signal still reads degraded. */
  async exit(env: Envelope, p: AuthenticatedPrincipal, s: DgScope, contractIdRaw: string, body: Row) {
    const cid = env.correlation_id;
    const contractId = idOf(contractIdRaw, 'unknown_contract', 'the contract', cid, 404);
    const requestId = idOf(body['requestId'], 'request', 'requestId (the command identity a retry reuses)', cid);
    const cv = body['contractVersion'];
    if (typeof cv !== 'number' || !Number.isInteger(cv) || cv < 1) throw refuseDegraded('version', 'contractVersion is the version of the contract the owner read', cid);
    const refs = body['evidenceRefs'] ?? [];
    if (!Array.isArray(refs) || !refs.every((x) => typeof x === 'string')) throw refuseDegraded('evidence_refs', 'evidenceRefs is a list of references', cid);
    const intake = { requestId, tenantId: s.tenantId, domainId: s.domainId, contractId, contractVersion: cv, evidence: str(body, 'evidence') ?? '', evidenceRefs: refs as string[],
      journal: journalNow(), actor: p.principalId, correlationId: cid };
    const out = await mapped(env, () => this.pipeline.write(derive(env, DEGRADED_ACTIONS.exit, contractId), p, routeOf(s, DEGRADED_ACTIONS.exit, contractId), DegradedCapability.write, async (cap) => {
      const r = await cap.exit(intake);
      return { result: r, targetType: OBJECT_TYPE, targetId: contractId, targetVersion: String(r['contract_version']), outboxEvent: null };
    }));
    return { exit: out.result, receipt: receipt(out) };
  }
}

/** The route's envelope and principal, or the request refusal (as every controller of the Eye answers it). */
export function requestOf(req: { eyeEnvelope?: Envelope; eyePrincipal?: AuthenticatedPrincipal }, cid: string) {
  if (req.eyeEnvelope === undefined || req.eyePrincipal === undefined) throw new HttpException(errorBody('EYE_REQ_001', cid), 400);
  return { envelope: req.eyeEnvelope, principal: req.eyePrincipal };
}
