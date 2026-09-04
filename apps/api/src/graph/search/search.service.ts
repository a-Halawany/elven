/**
 * PERMISSION-AWARE SEARCH (C4).
 *
 * Search runs inside the caller's OWN governed read, against the same relations
 * under the same row-level security. A row outside the caller's tenant or domain
 * is not filtered late by code that could forget — it is not visible to the query
 * at all.
 *
 * THREE RULES, AND THEY ARE THE CRITERION:
 *
 *   1. A result the caller may not see is ABSENT. There is no redacted row, no
 *      placeholder and no "3 results hidden" — any of which would turn search
 *      into an existence oracle for objects the caller has no right to know about.
 *   2. The response SHAPE is identical whether nothing matched or everything that
 *      matched was invisible. Both return empty arrays and the same counts.
 *   3. Every hit says WHY it matched. A search result a reader cannot explain is
 *      a suggestion, and this system does not make suggestions it cannot defend.
 *
 * Search reads METADATA. It never reads evidence bytes: that is
 * `observation.evidence.retrieve`, a different action with its own decision and
 * its own custody record, and no amount of searching authorises it.
 */
import { Injectable } from '@nestjs/common';
import type { GraphReads } from '../graph.capabilities.js';
import { normalizeName } from '../entities/resolver.service.js';

export const MAX_RESULTS = 50;

export interface SearchHit {
  kind: 'entity' | 'claim' | 'evidence';
  id: string;
  label: string;
  detail: string;
  /** Why this matched, in words a person can check. */
  matched_on: string;
  recorded_at: string | null;
  extra: Record<string, unknown>;
}

export interface SearchResult {
  query: string;
  normalized: string;
  entities: SearchHit[];
  claims: SearchHit[];
  evidence: SearchHit[];
  total: number;
  /**
   * Stated on every response, matched or not, so a caller never has to wonder
   * whether an empty answer means "nothing" or "nothing you may see".
   */
  scope_note: string;
}

const SCOPE_NOTE =
  'results are limited to what this principal may see in this tenant and domain; '
  + 'anything outside it is absent rather than hidden, and an empty result is '
  + 'indistinguishable from one where nothing matched';

const CLAIM_TYPES = ['ENT', 'EVT', 'CLM', 'REL', 'ASM'];

@Injectable()
export class SearchService {
  async search(cap: GraphReads, rawQuery: string, limit = MAX_RESULTS): Promise<SearchResult> {
    const query = rawQuery.trim();
    const cap_ = Math.max(1, Math.min(limit, MAX_RESULTS));
    const empty: SearchResult = {
      query, normalized: normalizeName(query), entities: [], claims: [], evidence: [],
      total: 0, scope_note: SCOPE_NOTE,
    };
    if (query.length < 2) return empty;

    const needle = query.toLowerCase();
    const normalized = normalizeName(query);

    // ── entities ──
    const entityRows = (await cap.readEntities().selectAll()
      .limit(1_000).execute()) as Array<Record<string, unknown>>;
    const entities: SearchHit[] = entityRows
      .map((e): SearchHit | null => {
        const canonical = String(e['canonical_name']);
        const norm = String(e['normalized_name']);
        const why = norm === normalized ? 'normalised name is an exact match'
          : canonical.toLowerCase().includes(needle) ? 'canonical name contains the query'
          : norm.includes(normalized) && normalized.length > 0 ? 'normalised name contains the query'
          : null;
        if (why === null) return null;
        return {
          kind: 'entity' as const, id: String(e['entity_id']), label: canonical,
          detail: `${String(e['entity_type'])} — ${String(e['lifecycle_state'])}`,
          matched_on: why, recorded_at: String(e['updated_at']),
          extra: { entity_type: e['entity_type'], lifecycle_state: e['lifecycle_state'],
                   normalized_name: norm, split_from: e['split_from'] },
        };
      })
      .filter((x): x is SearchHit => x !== null)
      .slice(0, cap_);

    // ── claims and evidence, current version of each ──
    const objectRows = (await cap.readCanonicalObjects().selectAll()
      .orderBy('recorded_at' as never, 'desc')
      .limit(2_000).execute()) as Array<Record<string, unknown>>;
    const current = new Map<string, Record<string, unknown>>();
    for (const r of objectRows) {
      const id = String(r['object_id']);
      const prev = current.get(id);
      if (prev === undefined || Number(r['object_version']) > Number(prev['object_version'])) {
        current.set(id, r);
      }
    }

    const claims: SearchHit[] = [];
    const evidence: SearchHit[] = [];
    for (const r of current.values()) {
      const type = String(r['object_type']);
      const payload = (r['payload'] ?? {}) as Record<string, unknown>;
      if (CLAIM_TYPES.includes(type)) {
        const subject = String(payload['subject'] ?? '');
        const value = String(payload['object_value'] ?? '');
        const predicate = String(payload['predicate'] ?? '');
        const why = subject.toLowerCase().includes(needle) ? 'claim subject contains the query'
          : value.toLowerCase().includes(needle) ? 'claim value contains the query'
          : predicate.toLowerCase().includes(needle) ? 'claim predicate contains the query'
          : null;
        if (why === null) continue;
        const lineage = (payload['lineage'] ?? {}) as Record<string, unknown>;
        claims.push({
          kind: 'claim', id: String(r['object_id']),
          label: `${subject} ${predicate} ${value}`.trim(),
          detail: `${type} v${String(r['object_version'])} — ${String(r['truth_state'])}`,
          matched_on: why, recorded_at: String(r['recorded_at']),
          extra: {
            object_type: type, object_version: r['object_version'],
            confidence: payload['confidence'], truth_state: r['truth_state'],
            mode: lineage['mode'] ?? null,
            evidence_object_id: lineage['evidence_object_id'] ?? null,
            review: payload['review'] ?? null,
          },
        });
      } else if (type === 'EVD' || type === 'OBS') {
        const locator = String(payload['locator'] ?? '');
        const provenance = String(r['provenance_ref'] ?? '');
        const why = locator.toLowerCase().includes(needle) ? 'evidence locator contains the query'
          : provenance.toLowerCase().includes(needle) ? 'provenance reference contains the query'
          : null;
        if (why === null) continue;
        evidence.push({
          kind: 'evidence', id: String(r['object_id']), label: locator || String(r['object_id']),
          detail: `${type} v${String(r['object_version'])} — ${String(r['lifecycle_state'])}`,
          matched_on: why, recorded_at: String(r['recorded_at']),
          extra: {
            object_type: type, provenance_ref: r['provenance_ref'],
            // The DIGEST, never the bytes. Reading those is a different action.
            content_digest: payload['content_digest'] ?? null,
            note: 'metadata only; reading the preserved bytes is observation.evidence.retrieve',
          },
        });
      }
    }

    const cappedClaims = claims.slice(0, cap_);
    const cappedEvidence = evidence.slice(0, cap_);
    return {
      query, normalized, entities, claims: cappedClaims, evidence: cappedEvidence,
      total: entities.length + cappedClaims.length + cappedEvidence.length,
      scope_note: SCOPE_NOTE,
    };
  }
}
