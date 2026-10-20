/**
 * B50 §LC (0120_b50_x_lc; F-P3-02: PR-06-001/002/003/005, CAP-AU-07, ADR-006; V03-T-021) — THE PURE LOGIC of the work-object lifecycle's
 * HTTP surface: the governed action names, the refusal nouns and their classes (403 actor|authority|separation_of_duties · 404 unknown_* ·
 * 409 state|stale|duplicate · 422 the rest), the intake shaping (TYPES only — the ports decide every rule), and the answer to a transition
 * the port KEPT but did not accept (rejected: its attempted command and the last authoritative version are in the ledger; the HTTP answer is
 * the refusal in the port's words, with the recorded outcome beside it). Unit-tested in test/unit/lifecycle-b50.test.ts.
 */
import { HttpException } from '@nestjs/common';
import { errorBody } from '@eye/contracts';

type Row = Record<string, unknown>;

export const LIFECYCLE_ACTIONS = {
  read: 'objects.lifecycle.read',
  author: 'objects.work_object.author',
  transition: 'objects.lifecycle.transition',
  propose: 'objects.lifecycle.propose',
  decide: 'objects.lifecycle.proposal.decide',
} as const;
/** The refusal nouns of this part — to be mapped centrally (observation-errors.ts) at integration; mapped here meanwhile. */
export const LIFECYCLE_NOUNS = ['lifecycle transition', 'lifecycle proposal', 'work object', 'lifecycle read'] as const;
/** The work-object types this machine moves (their profiles' governance = work_object). */
export const WORK_OBJECT_TYPES = ['ASM'] as const;
export const PROPOSAL_VIAS = ['view', 'agent', 'model', 'import', 'projection'] as const;
export const REENTRY_REASONS = ['contradiction', 'fitness_failure', 'policy_change', 'review_finding'] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TYPE = /^[A-Z]{3}$/;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:\d{2})$/;
const NOUN_RE = new RegExp(`^(${LIFECYCLE_NOUNS.join('|')}) rejected \\(([a-z_]+)\\)`);

/** The HTTP status of a refusal class. */
export function statusOfClass(cls: string): number {
  if (cls === 'actor' || cls === 'authority' || cls === 'separation_of_duties' || cls === 'access') return 403;
  if (cls.startsWith('unknown_')) return 404;
  if (['state', 'stale', 'duplicate', 'held', 'expired'].includes(cls)) return 409;
  return 422;
}
const CODE = (s: number) => (s === 403 ? 'EYE_AUT_001' : s === 404 ? 'EYE_STA_001' : s === 409 ? 'EYE_STA_002' : 'EYE_REQ_001') as 'EYE_AUT_001' | 'EYE_STA_001' | 'EYE_STA_002' | 'EYE_REQ_001';

/** A port's raised refusal `<noun> rejected (<class>): …` → its HTTP answer in the PORT's words. Anything else is returned untouched. */
export function asLifecycleRefusal(e: unknown, correlationId: string): unknown {
  if (e instanceof HttpException || !(e instanceof Error)) return e;
  const m = NOUN_RE.exec(e.message);
  if (m === null) return e;
  const status = statusOfClass(m[2]!);
  return new HttpException(errorBody(CODE(status), correlationId, e.message), status);
}

/** A refusal answered by the route before any port runs (the caller's own request). */
export function refuseLifecycle(noun: (typeof LIFECYCLE_NOUNS)[number], cls: string, message: string, correlationId: string): HttpException {
  const status = statusOfClass(cls);
  return new HttpException(errorBody(CODE(status), correlationId, `${noun} rejected (${cls}): ${message}`), status);
}

/** A transition the port KEPT but did not accept → the refusal in the port's words; the recorded outcome travels with it (PR-06-005). */
export function rejectionOf(outcome: Row, correlationId: string, receipt: { policyDecisionId: string; auditSeq: number }): HttpException | null {
  if (outcome['outcome'] !== 'rejected') return null;
  const refusal = (outcome['refusal'] ?? {}) as Row;
  const cls = typeof refusal['class'] === 'string' ? (refusal['class'] as string) : 'transition';
  const status = statusOfClass(cls);
  const message = typeof refusal['message'] === 'string' ? (refusal['message'] as string) : `lifecycle transition rejected (${cls})`;
  return new HttpException({ ...errorBody(CODE(status), correlationId, message), outcome, receipt }, status);
}

/* ───────────────────────── the intake (types only) ───────────────────────── */
const str = (p: Row, k: string): string | null => (typeof p[k] === 'string' && (p[k] as string).trim() !== '' ? (p[k] as string).trim() : null);
export function typeOf(v: unknown, noun: (typeof LIFECYCLE_NOUNS)[number], cid: string): string {
  if (typeof v !== 'string' || !TYPE.test(v)) throw refuseLifecycle(noun, 'type', 'the object type is three capital letters (e.g. ASM)', cid);
  return v;
}
export function idOf(v: unknown, noun: (typeof LIFECYCLE_NOUNS)[number], cls: string, what: string, cid: string): string {
  if (typeof v !== 'string' || !UUID.test(v)) throw refuseLifecycle(noun, cls, `${what} is an id`, cid);
  return v.toLowerCase();
}
const optId = (p: Row, k: string, noun: (typeof LIFECYCLE_NOUNS)[number], cid: string): string | null => (p[k] === undefined || p[k] === null ? null : idOf(p[k], noun, k.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`), k, cid));
function keyOf(p: Row, noun: (typeof LIFECYCLE_NOUNS)[number], cid: string): string {
  const k = str(p, 'idempotencyKey');
  if (k === null || k.length < 8 || k.length > 200) throw refuseLifecycle(noun, 'idempotency', 'idempotencyKey (8 to 200 characters) is the command identity a retry reuses', cid);
  return k;
}
function versionOf(v: unknown, noun: (typeof LIFECYCLE_NOUNS)[number], what: string, cid: string): number {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < 1) throw refuseLifecycle(noun, 'version', `${what} is the version you read (a whole number ≥ 1)`, cid);
  return v;
}

export function authorIntake(body: Row, cid: string) {
  const noun = 'work object' as const;
  const refs = body['evidenceRefs'] ?? [];
  if (!Array.isArray(refs) || !refs.every((x) => typeof x === 'string')) throw refuseLifecycle(noun, 'evidence', 'evidenceRefs is a list of references', cid);
  const b = body['body'] ?? {};
  if (b === null || typeof b !== 'object' || Array.isArray(b)) throw refuseLifecycle(noun, 'content', 'body is an object of named sections', cid);
  return {
    objectType: typeOf(body['objectType'] ?? 'ASM', noun, cid), title: str(body, 'title') ?? '', statement: str(body, 'statement') ?? '', body: b as Row,
    evidenceRefs: refs as string[], classification: str(body, 'classification') ?? '', purposeScope: str(body, 'purposeScope') ?? '',
    synthetic: body['synthetic'] === true, idempotencyKey: keyOf(body, noun, cid),
  };
}

export function transitionIntake(body: Row, cid: string) {
  const noun = 'lifecycle transition' as const;
  const action = str(body, 'action');
  if (action === null) throw refuseLifecycle(noun, 'transition', 'name the transition (action: review, approve, publish, correct, supersede, withdraw, archive, retire, reopen, compensate)', cid);
  const changes = body['changes'] ?? {};
  if (changes === null || typeof changes !== 'object' || Array.isArray(changes)) throw refuseLifecycle(noun, 'changes', 'changes is an object (title, statement, body, evidence_refs)', cid);
  const rr = str(body, 'reentryReason');
  if (rr !== null && !(REENTRY_REASONS as readonly string[]).includes(rr)) throw refuseLifecycle(noun, 'reentry', `the re-entry reason is one of ${REENTRY_REASONS.join(', ')}`, cid);
  const cref = str(body, 'correlationRef');
  if (cref !== null && cref.length > 200) throw refuseLifecycle(noun, 'correlation', 'correlationRef is at most 200 characters', cid);
  return {
    expectedVersion: versionOf(body['expectedVersion'], noun, 'expectedVersion', cid), action, to: str(body, 'to'), reason: str(body, 'reason'),
    idempotencyKey: keyOf(body, noun, cid), causationId: optId(body, 'causationId', noun, cid), correlationRef: cref, reentryReason: rr, changes: changes as Row,
  };
}

export function proposeIntake(body: Row, cid: string) {
  const noun = 'lifecycle proposal' as const;
  const via = str(body, 'via') ?? 'view';
  if (!(PROPOSAL_VIAS as readonly string[]).includes(via)) throw refuseLifecycle(noun, 'via', `via is one of ${PROPOSAL_VIAS.join(', ')}`, cid);
  const action = str(body, 'action');
  if (action === null) throw refuseLifecycle(noun, 'transition', 'name the transition proposed (action)', cid);
  return {
    requestId: idOf(body['requestId'], noun, 'request', 'requestId (the command identity a retry reuses)', cid), baseVersion: versionOf(body['baseVersion'], noun, 'baseVersion', cid),
    action, reason: str(body, 'reason') ?? '', via, reentryReason: str(body, 'reentryReason'), causationId: optId(body, 'causationId', noun, cid),
  };
}

export function decideIntake(body: Row, cid: string) {
  const noun = 'lifecycle proposal' as const;
  const decision = str(body, 'decision');
  if (decision !== 'accept' && decision !== 'decline') throw refuseLifecycle(noun, 'decision', 'the owner accepts or declines (decision: accept | decline)', cid);
  return {
    requestId: idOf(body['requestId'], noun, 'request', 'requestId (the command identity a retry reuses)', cid), decision, reason: str(body, 'reason') ?? '',
    expectedVersion: decision === 'accept' ? versionOf(body['expectedVersion'], noun, 'expectedVersion', cid) : null,
    idempotencyKey: decision === 'accept' ? keyOf(body, noun, cid) : null,
  };
}

export function asOfOf(v: unknown, cid: string): string {
  if (typeof v !== 'string' || !ISO.test(v) || Number.isNaN(Date.parse(v))) throw refuseLifecycle('lifecycle read', 'as_of', 'asOf is an ISO instant with its zone (e.g. 2026-10-19T09:00:00Z)', cid);
  return v;
}
