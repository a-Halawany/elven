/**
 * CONTRADICTION DETECTION (0066 §5; interface L2-I03 ContradictionDetected; AU-INT-0025; V03-T-286).
 *
 * Two admitted assertions about the same SUBJECT and PREDICATE whose values are incompatible are a contradiction. The
 * product LINKS them and collapses neither: a contradiction row names both (object id and version each), the newer claim
 * is queued for a person's review with the reason `contradiction`, its header names the other in `contradiction_refs`,
 * and ContradictionDetected is published from the write that admitted it — the extraction's admission, or a review
 * correction that produced a contradicting version. Each assertion keeps its own truth state; a person adjudicates
 * (both stand; one withdrawn; superseded) through the review route, and the adjudication is the only mutation the row
 * ever takes.
 *
 * The rule (claim.value): the same normalised subject and predicate, the same claim kind, a different object value (a
 * relationship claim's object is an entity mention: two different objects for one subject and predicate contradict too).
 * Values are compared as trimmed, case-folded strings; a numeric pair compares as numbers.
 */
import { Injectable } from '@nestjs/common';
import { sql } from 'kysely';
import { newId } from '../../shared/ids.js';
import type { IntelligenceReads } from '../intelligence.capabilities.js';

type Row = Record<string, unknown>;
export interface Conflict { objectId: string; version: number; objectType: string; subject: string; predicate: string; value: string | null; truthState: string; recordedAt: string }
export interface ContradictionRecord { contradictionId: string; kind: 'claim.value'; a: { objectId: string; version: number; value: string | null }; b: { objectId: string; version: number; value: string | null }; subject: string; predicate: string; basis: Row }

const norm = (v: unknown): string => String(v ?? '').normalize('NFKD').toLowerCase().replace(/\s+/g, ' ').trim();
export function valuesConflict(a: unknown, b: unknown): boolean {
  const x = norm(a); const y = norm(b);
  if (x === y) return false;
  const nx = Number(x.replace(/,/g, '')); const ny = Number(y.replace(/,/g, ''));
  if (x !== '' && y !== '' && Number.isFinite(nx) && Number.isFinite(ny) && /^-?[\d.,]+$/.test(x) && /^-?[\d.,]+$/.test(y)) return nx !== ny;
  return true;
}

@Injectable()
export class ContradictionService {
  /**
   * The admitted claims (latest version each, not withdrawn or rejected) with the same subject and predicate and an
   * incompatible value — the assertions the candidate contradicts. Read under the writer's own capability (RLS).
   */
  async findConflicts(cap: IntelligenceReads, a: { claimKind: string; subject: string; predicate: string; objectValue: unknown; excludeObjectId?: string | null }): Promise<Conflict[]> {
    const subject = norm(a.subject); const predicate = norm(a.predicate);
    if (subject === '' || predicate === '') return [];
    // The candidates are selected in the database by the normalised subject and predicate (no window: every admitted
    // assertion about this subject and predicate is compared — B9 review), read under the writer's capability (RLS).
    const rows = (await cap.readCanonicalObjects().selectAll()
      .where('object_type' as never, 'in', ['ENT', 'EVT', 'CLM', 'REL', 'ASM'] as never)
      .where('lifecycle_state' as never, 'in', ['active', 'corrected'] as never)
      .where(sql`lower(regexp_replace(btrim(coalesce(payload ->> 'subject', '')), '\\s+', ' ', 'g'))` as never, '=', subject as never)
      .where(sql`lower(regexp_replace(btrim(coalesce(payload ->> 'predicate', '')), '\\s+', ' ', 'g'))` as never, '=', predicate as never)
      .orderBy('recorded_at' as never, 'desc').execute()) as Row[];
    const latest = new Map<string, Row>();
    for (const r of rows) {
      const id = String(r['object_id']); const prev = latest.get(id);
      if (prev === undefined || Number(r['object_version']) > Number(prev['object_version'])) latest.set(id, r);
    }
    // A claim a person REJECTED in review is no assertion (the decision lives on the review case, not on the claim's payload — B9 review).
    const rejected = new Set<string>();
    if (latest.size > 0) {
      const cases = (await cap.readReviewCases().select(['claim_object_id', 'claim_version', 'state'] as never)
        .where('claim_object_id' as never, 'in', [...latest.keys()] as never).where('state' as never, '=', 'rejected' as never).execute()) as Row[];
      for (const c of cases) { const r = latest.get(String(c['claim_object_id'])); if (r !== undefined && Number(c['claim_version']) === Number(r['object_version'])) rejected.add(String(c['claim_object_id'])); }
    }
    const out: Conflict[] = [];
    for (const r of latest.values()) {
      if (a.excludeObjectId !== undefined && a.excludeObjectId !== null && String(r['object_id']) === a.excludeObjectId) continue;
      if (rejected.has(String(r['object_id']))) continue;
      const p = (r['payload'] ?? {}) as Row;
      const review = (p['review'] ?? {}) as Row;
      if (String(review['state'] ?? '') === 'rejected') continue;
      if (norm(p['claim_kind']) !== norm(a.claimKind)) continue;
      if (norm(p['subject']) !== subject || norm(p['predicate']) !== predicate) continue;
      if (!valuesConflict(p['object_value'], a.objectValue)) continue;
      out.push({ objectId: String(r['object_id']), version: Number(r['object_version']), objectType: String(r['object_type']), subject: String(p['subject'] ?? ''), predicate: String(p['predicate'] ?? ''),
                 value: p['object_value'] === undefined || p['object_value'] === null ? null : String(p['object_value']), truthState: String(r['truth_state'] ?? ''), recordedAt: r['recorded_at'] instanceof Date ? (r['recorded_at'] as Date).toISOString() : String(r['recorded_at']) });
    }
    return out;
  }

  /** The rows to record for a newly admitted (or corrected) assertion `b` against each conflict `a`. */
  records(b: { objectId: string; version: number; subject: string; predicate: string; value: unknown }, conflicts: Conflict[]): ContradictionRecord[] {
    return conflicts.map((c) => ({
      contradictionId: newId(), kind: 'claim.value' as const,
      a: { objectId: c.objectId, version: c.version, value: c.value }, b: { objectId: b.objectId, version: b.version, value: b.value === undefined || b.value === null ? null : String(b.value) },
      subject: b.subject, predicate: b.predicate,
      basis: { rule: 'same subject and predicate, incompatible object value', a_truth_state: c.truthState, a_recorded_at: c.recordedAt },
    }));
  }

  /** ContradictionDetected@v1 — both assertions by stable reference, the basis, the review case that will adjudicate. */
  event(a: { tenantId: string; domainId: string; record: ContradictionRecord; assertions: [Row, Row]; reviewCaseId: string | null; action: string; actor: string }): { eventType: string; payload: Row } {
    const ref = (r: Row) => ({ object_id: r['object_id'], object_version: r['object_version'], object_type: r['object_type'], subject: (r['payload'] as Row | undefined)?.['subject'] ?? null, predicate: (r['payload'] as Row | undefined)?.['predicate'] ?? null,
      object_value: (r['payload'] as Row | undefined)?.['object_value'] ?? null, truth_state: r['truth_state'] ?? null, evidence_object_id: ((r['payload'] as Row | undefined)?.['lineage'] as Row | undefined)?.['evidence_object_id'] ?? null,
      method_id: ((r['payload'] as Row | undefined)?.['lineage'] as Row | undefined)?.['method_id'] ?? null, event_time: r['event_time'] ?? null });
    return { eventType: 'ContradictionDetected', payload: {
      schema: 'ContradictionDetected', schema_version: 'v1', contradiction_id: a.record.contradictionId, kind: a.record.kind,
      assertions: [ref(a.assertions[0]), ref(a.assertions[1])], basis: a.record.basis, state: 'open', review_case_id: a.reviewCaseId,
      temporal: { known_at: new Date().toISOString() }, cause: { action: a.action, actor: a.actor, target_type: 'CTR', target_id: a.record.contradictionId },
    } };
  }
}
