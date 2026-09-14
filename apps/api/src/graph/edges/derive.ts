/**
 * THE BUILDER'S RULES, as one pure function. `GraphOrchestrator.runEdgeBuild` (the operator's run) and the
 * relationships subscription consumer (the automatic re-derivation of a pending inferred relationship, 0066 §2)
 * derive an edge from a REL claim by exactly the same rules, with exactly the same refusals — a claim the operator's
 * run would skip is a claim the consumer leaves unresolved, for the same stated reason:
 *
 *   1. a claim still queued for review, or rejected in review, is not promoted into the graph;
 *   2. each end must resolve to an accepted entity — by its normalised mention, to exactly ONE entity (an ambiguity is
 *      refused with a named reason, never settled by row order);
 *   3. both ends resolving to one entity is not a relationship;
 *   4. the claim must carry its evidence lineage (an edge without provenance is not admissible).
 */
import { normalizeName } from '../entities/resolver.service.js';

type Row = Record<string, unknown>;
export interface DerivedEdge {
  subject: string; object: string; predicate: string; validFrom: string; validTo: string | null;
  evidenceObjectId: string; evidenceDigest: string; runId: string | null; mode: string; confidence: number;
}
export type Derivation = { ok: true; edge: DerivedEdge } | { ok: false; reason: string };

/** Every entity each normalised accepted mention resolves to (a display name is not an identity: more than one is an ambiguity). */
export function entitiesByName(accepted: ReadonlyArray<Row>): Map<string, Set<string>> {
  const byName = new Map<string, Set<string>>();
  for (const r of accepted) {
    const key = normalizeName(String(r['mention_text']));
    const set = byName.get(key) ?? new Set<string>();
    set.add(String(r['entity_id']));
    byName.set(key, set);
  }
  return byName;
}

/**
 * The review decision that governs a claim version is the CASE's, not the claim's own payload: the extraction writes
 * `review.state = 'queued'` at admission and never rewrites it — the person's approval, correction or rejection is
 * recorded on the review case (intelligence.review_current). A claim approved in review is therefore graphed; a claim
 * rejected in review (or challenged and then rejected) is not, whatever its payload says (G2, B10).
 */
export function effectiveReviewState(claim: Row, caseState: string | null | undefined): string {
  const review = (claim['payload'] as Row | undefined)?.['review'] as Row | undefined;
  const own = String(review?.['state'] ?? 'not_required');
  if (caseState === 'approved') return 'approved';
  if (caseState === 'rejected' || caseState === 'queued') return caseState;
  if (caseState === 'corrected') return 'superseded'; // this version's case was corrected: the corrected version carries the relationship
  return own; // 'corrected' here is the corrected version's own payload — the correction itself, admitted
}

export function deriveEdgeFromClaim(claim: Row, byName: ReadonlyMap<string, ReadonlySet<string>>, caseState: string | null = null): Derivation {
  const payload = (claim['payload'] ?? {}) as Row;
  const lineage = (payload['lineage'] ?? {}) as Row;
  const reviewState = effectiveReviewState(claim, caseState);
  if (reviewState === 'superseded') return { ok: false, reason: 'this version of the relationship was corrected in review to a later version; the corrected version carries it' };
  if (reviewState === 'queued' || reviewState === 'rejected') {
    return { ok: false, reason: reviewState === 'queued'
      ? 'this relationship is still queued for review; a claim a person has not decided is not promoted into the graph'
      : 'this relationship was rejected in review and is not admitted to the graph' };
  }
  const subjectName = normalizeName(String(payload['subject'] ?? ''));
  const objectName = normalizeName(String(payload['object_value'] ?? ''));
  const subjectSet = byName.get(subjectName);
  const objectSet = byName.get(objectName);
  if (subjectSet === undefined || objectSet === undefined) {
    return { ok: false, reason: subjectSet === undefined && objectSet === undefined
      ? 'neither end of this relationship resolves to an entity yet'
      : subjectSet === undefined
        ? `the subject "${String(payload['subject'] ?? '')}" does not resolve to an entity yet`
        : `the object "${String(payload['object_value'] ?? '')}" does not resolve to an entity yet` };
  }
  if (subjectSet.size > 1 || objectSet.size > 1) {
    const which = subjectSet.size > 1 ? `"${String(payload['subject'] ?? '')}"` : `"${String(payload['object_value'] ?? '')}"`;
    const n = subjectSet.size > 1 ? subjectSet.size : objectSet.size;
    return { ok: false, reason: `${which} is ambiguous: more than one accepted entity (${n}) carries that `
      + 'normalised name, and an endpoint is not chosen by row order — resolve or split '
      + 'them before this relationship can be asserted' };
  }
  const subject = [...subjectSet][0] as string;
  const object = [...objectSet][0] as string;
  if (subject === object) return { ok: false, reason: 'both ends resolve to the same entity; a self-edge is not a relationship' };
  const q = (payload['qualifiers'] ?? {}) as Row;
  // The record instant is a Date under kysely: rendered as ISO, never as JavaScript's default string (which PostgreSQL refuses).
  const validFrom = isoOr(q['valid_from']) ?? isoOr(claim['event_time']) ?? isoOr(claim['recorded_at']) ?? new Date().toISOString();
  const validTo = isoOr(q['valid_to']);
  const evidenceObjectId = String(lineage['evidence_object_id'] ?? '');
  const evidenceDigest = String(lineage['evidence_digest'] ?? '');
  if (evidenceObjectId === '' || !/^[0-9a-f]{64}$/.test(evidenceDigest)) {
    return { ok: false, reason: 'the claim carries no evidence lineage; an edge without provenance is not admissible' };
  }
  return { ok: true, edge: {
    subject, object, predicate: String(payload['predicate'] ?? 'related_to'), validFrom, validTo, evidenceObjectId, evidenceDigest,
    runId: typeof lineage['run_id'] === 'string' ? (lineage['run_id'] as string) : null,
    mode: typeof lineage['mode'] === 'string' ? (lineage['mode'] as string) : 'replay',
    confidence: Number(payload['confidence'] ?? 0),
  } };
}

export function isoOr(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = new Date(v as string);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
