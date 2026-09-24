/**
 * THE GOVERNED REVIEW — CP-6 B23 (migration 0084; interface L10-I03 ReviewConvened: "Opens a governed review around a declared
 * objective, decision, scenario, commitment, or outcome"; reliability "At-least-once delivery; consumer deduplication and
 * checkpoint"; failure "Quarantine invalid event; reconcile committed publication").
 *
 * A review is a NAMED HUMAN's act (human-gated at the PDP; the port compares the acting principal and the convening roles) around a
 * subject DECLARED in the domain, at the version it stands at (a named version that is not the current one is refused as stale), with
 * the question it answers, its chair and reviewers (active humans) and the instant it is due. The convener names a `convene_key` —
 * the idempotency boundary — and the review's content digest (SHA-256 over the canonical form of the subject, the question, the chair,
 * the reviewers, the due instant, the cause item and the room) is recorded with it: the same key with the same digest answers the
 * review already recorded (no second review, no second event); the same key with a different digest is refused (the executive.requests
 * idiom, 0066 §9). ReviewConvened@v1 is published from the write that recorded a NEW review; the attention subscriber routes it to the
 * chair (review.convened). The chair concludes it, the convener (or the chair) withdraws it — a closed review no longer stands.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { errorBody, jcsCanonicalize } from '@eye/contracts';
import type { ExecutiveReads, ReviewWrites } from '../executive.capabilities.js';
import type { OutboxRow } from '../../graph/subscriptions/change-events.js';

type Row = Record<string, unknown>;
export const REVIEW_SUBJECT_KINDS = ['objective', 'decision', 'scenario', 'commitment', 'outcome'] as const;
export type ReviewSubjectKind = (typeof REVIEW_SUBJECT_KINDS)[number];
export const REVIEW_STATES = ['convened', 'concluded', 'withdrawn'] as const;
export interface ConveneIntake {
  subjectKind: ReviewSubjectKind; subjectId: string; subjectVersion: number | null; question: string; chair: string; reviewers: string[];
  dueAt: string | null; conveneKey: string; causeItemId: string | null; roomId: string | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());

/** The intake of a convening (422 on a malformed request; the port decides the subject, the people, the key and the standing). */
export function validateConvene(p: Row, correlationId: string): ConveneIntake {
  const bad = (m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, m), 422); };
  const subject = (p['subject'] !== null && typeof p['subject'] === 'object' && !Array.isArray(p['subject']) ? p['subject'] : {}) as Row;
  const kind = String(subject['kind'] ?? '');
  if (!(REVIEW_SUBJECT_KINDS as readonly string[]).includes(kind)) bad(`subject.kind is one of ${REVIEW_SUBJECT_KINDS.join(', ')}`);
  if (typeof subject['id'] !== 'string' || !UUID.test(subject['id'])) bad('subject.id is the declared subject\'s id');
  const version = subject['version'] === undefined || subject['version'] === null ? null : subject['version'];
  if (version !== null && !(Number.isInteger(version) && Number(version) >= 1)) bad('subject.version is a positive integer (the version the review is about), or absent for the current one');
  const question = typeof p['question'] === 'string' ? p['question'].trim() : '';
  if (question.length < 8 || question.length > 2000) bad('question states what the review answers (8–2000 characters)');
  if (typeof p['chair'] !== 'string' || !UUID.test(p['chair'])) bad('chair is the principal id of the human who chairs the review');
  const reviewers = p['reviewers'] === undefined || p['reviewers'] === null ? [] : p['reviewers'];
  if (!Array.isArray(reviewers) || !reviewers.every((r) => typeof r === 'string' && UUID.test(r))) bad('reviewers is a list of principal ids');
  if ((reviewers as string[]).length > 20) bad('at most 20 reviewers');
  const key = typeof p['convene_key'] === 'string' ? p['convene_key'].trim() : '';
  if (key.length < 1 || key.length > 200) bad('convene_key (1–200 characters) is the convener\'s idempotency key for this review');
  const instantOrNull = (k: string): string | null => {
    const v = p[k]; if (v === undefined || v === null || v === '') return null;
    if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) bad(`${k} must be an instant`); return new Date(v as string).toISOString();
  };
  const uuidOrNull = (k: string): string | null => {
    const v = p[k]; if (v === undefined || v === null || v === '') return null;
    if (typeof v !== 'string' || !UUID.test(v)) bad(`${k} must be an id`); return v as string;
  };
  return { subjectKind: kind as ReviewSubjectKind, subjectId: subject['id'] as string, subjectVersion: version === null ? null : Number(version), question, chair: p['chair'] as string,
           reviewers: [...new Set(reviewers as string[])].sort(), dueAt: instantOrNull('due_at'), conveneKey: key, causeItemId: uuidOrNull('cause_item_id'), roomId: uuidOrNull('room_id') };
}

/** The review's content digest: what the convene key is bound to. */
export function reviewDigest(i: ConveneIntake): string {
  return createHash('sha256').update(jcsCanonicalize({ subject: { kind: i.subjectKind, id: i.subjectId, version: i.subjectVersion }, question: i.question, chair: i.chair,
    reviewers: i.reviewers, due_at: i.dueAt, cause_item_id: i.causeItemId, room_id: i.roomId })).digest('hex');
}

/** ReviewConvened@v1 from the convening port's answer (a NEW review only — a repeat publishes nothing). */
export function reviewConvenedEvent(a: { review: Row; actor: string }): OutboxRow {
  const r = a.review;
  return {
    eventType: 'ReviewConvened',
    payload: {
      schema: 'ReviewConvened', schema_version: 'v1',
      review_id: String(r['review_id']),
      subject: { kind: String(r['subject_kind']), id: String(r['subject_id']), version: r['subject_version'] === null || r['subject_version'] === undefined ? null : Number(r['subject_version']), title: (r['subject_title'] ?? null) as string | null },
      question: String(r['question']), chair: String(r['chair']), reviewers: Array.isArray(r['reviewers']) ? (r['reviewers'] as unknown[]).map(String) : [],
      due_at: iso(r['due_at']), convened_by: String(r['convened_by']), convened_at: iso(r['convened_at']),
      convene_key: String(r['convene_key']), request_digest: String(r['request_digest']),
      cause_item_id: (r['cause_item_id'] ?? null) as string | null, room_id: (r['room_id'] ?? null) as string | null,
      temporal: { known_at: iso(r['convened_at']) },
      cause: { action: 'executive.review.convene', actor: a.actor, target_type: 'RVW', target_id: String(r['review_id']) },
    },
  };
}

export interface ReviewConvened { reviewId: string; subjectKind: string; subjectId: string; subjectTitle: string | null; question: string; chair: string; reviewers: string[]; dueAt: string | null }
/** The contract of a ReviewConvened payload, as the attention consumer reads it: a string says why it is not the contract (quarantined). */
export function readReviewConvened(p: Row): ReviewConvened | string {
  if (p['schema'] !== 'ReviewConvened' || p['schema_version'] !== 'v1') return 'not a ReviewConvened@v1 payload';
  if (typeof p['review_id'] !== 'string' || !UUID.test(p['review_id'])) return 'review_id is not a uuid';
  const s = p['subject'];
  if (s === null || typeof s !== 'object' || Array.isArray(s)) return 'subject is not an object';
  const subject = s as Row;
  if (!(REVIEW_SUBJECT_KINDS as readonly string[]).includes(String(subject['kind'])) || typeof subject['id'] !== 'string' || !UUID.test(subject['id'])) return 'subject is not {kind, id} of a reviewable subject';
  if (typeof p['chair'] !== 'string' || !UUID.test(p['chair'])) return 'chair is not a principal id';
  if (typeof p['question'] !== 'string' || p['question'].length === 0) return 'question is missing';
  if (p['due_at'] !== null && p['due_at'] !== undefined && (typeof p['due_at'] !== 'string' || Number.isNaN(Date.parse(p['due_at'])))) return 'due_at is not an instant or null';
  return { reviewId: p['review_id'], subjectKind: String(subject['kind']), subjectId: subject['id'], subjectTitle: typeof subject['title'] === 'string' ? subject['title'] : null,
           question: p['question'], chair: p['chair'], reviewers: Array.isArray(p['reviewers']) ? (p['reviewers'] as unknown[]).map(String) : [], dueAt: typeof p['due_at'] === 'string' ? p['due_at'] : null };
}

@Injectable()
export class ReviewsService {
  async convene(cap: ReviewWrites, scope: { tenantId: string; domainId: string }, reviewId: string, i: ConveneIntake, actor: string, correlationId: string): Promise<{ review: Row; event: OutboxRow | null }> {
    const digest = reviewDigest(i);
    const r = await cap.conveneReview({ reviewId, tenantId: scope.tenantId, domainId: scope.domainId, subjectKind: i.subjectKind, subjectId: i.subjectId, subjectVersion: i.subjectVersion, question: i.question,
      chair: i.chair, reviewers: i.reviewers, dueAt: i.dueAt, conveneKey: i.conveneKey, requestDigest: digest, causeItemId: i.causeItemId, roomId: i.roomId, actor, correlationId });
    const review = this.view(r);
    return { review, event: r['repeated'] === true ? null : reviewConvenedEvent({ review: r, actor }) };
  }

  async close(cap: ReviewWrites, scope: { tenantId: string; domainId: string }, reviewId: string, disposition: 'concluded' | 'withdrawn', note: string, actor: string, correlationId: string): Promise<Row> {
    return this.view(await cap.closeReview({ reviewId, tenantId: scope.tenantId, domainId: scope.domainId, disposition, note, actor, correlationId }));
  }

  /** The domain's reviews, newest first; filters on state, subject kind and subject. */
  async list(cap: ExecutiveReads, p: { state?: unknown; subjectKind?: unknown; subjectId?: unknown; limit?: unknown }): Promise<Row[]> {
    let q = cap.readReviews().selectAll();
    if (typeof p.state === 'string' && (REVIEW_STATES as readonly string[]).includes(p.state)) q = q.where('state' as never, '=', p.state as never);
    if (typeof p.subjectKind === 'string' && (REVIEW_SUBJECT_KINDS as readonly string[]).includes(p.subjectKind)) q = q.where('subject_kind' as never, '=', p.subjectKind as never);
    if (typeof p.subjectId === 'string' && UUID.test(p.subjectId)) q = q.where('subject_id' as never, '=', p.subjectId as never);
    const limit = Math.min(Math.max(Number(p.limit ?? 200) || 200, 1), 500);
    return ((await q.orderBy('convened_at' as never, 'desc').limit(limit).execute()) as Row[]).map((r) => this.view(r));
  }

  async get(cap: ExecutiveReads, reviewId: string, correlationId: string): Promise<Row> {
    if (!UUID.test(reviewId)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'the review id is a uuid'), 422);
    const r = ((await cap.readReviews().selectAll().where('review_id' as never, '=', reviewId as never).execute()) as Row[])[0];
    if (r === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized review matches'), 404);
    const events = (await cap.readReviewEvents().selectAll().where('review_id' as never, '=', reviewId as never).orderBy('occurred_at' as never, 'asc').execute()) as Row[];
    // the attention items the review raised (review.convened, subject = the review) — the queue's answer beside the record
    const items = (await cap.readAttentionItems().select(['item_id', 'signal_class', 'state', 'outcome', 'policy_version', 'owner_principal_id', 'due_at'] as never)
      .where('subject_kind' as never, '=', 'review' as never).where('subject_id' as never, '=', reviewId as never).execute()) as Row[];
    return { ...this.view(r), events: events.map((e) => ({ event: e['event'], actor: e['actor_principal_id'], details: e['details'], occurred_at: iso(e['occurred_at']) })),
             attention: items.map((x) => ({ ...x, due_at: iso(x['due_at']) })) };
  }

  private view(r: Row): Row {
    const chair = r['chair'] ?? r['chair_principal_id'];
    return {
      review_id: r['review_id'], repeated: r['repeated'] === true, state: r['state'], subject_kind: r['subject_kind'], subject_id: r['subject_id'], subject_version: r['subject_version'] ?? null,
      subject_title: r['subject_title'] ?? null, question: r['question'], chair, reviewers: Array.isArray(r['reviewers']) ? r['reviewers'] : [], due_at: iso(r['due_at']),
      convened_by: r['convened_by'], convened_at: iso(r['convened_at']), convene_key: r['convene_key'], request_digest: r['request_digest'],
      cause_item_id: r['cause_item_id'] ?? null, room_id: r['room_id'] ?? null, closed_at: iso(r['closed_at']), closed_by: r['closed_by'] ?? null, closing_note: r['closing_note'] ?? null,
    };
  }
}
