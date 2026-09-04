/**
 * THE RESOLVER — deterministic first, and never its own judge.
 *
 * The eight authority rules the owner froze for Phase 3 are enforced in migration
 * 0024, not here: this service DECIDES WHAT TO PROPOSE and the database decides
 * what a proposal is allowed to become. That split is deliberate. A resolver bug
 * can produce a wrong proposal; it cannot produce a wrong acceptance, because the
 * only path to acceptance without a person is an authoritative identifier match
 * that the port re-checks against the identifier registry itself.
 *
 * The order of attempts is the order of authority:
 *
 *   1. AUTHORITATIVE IDENTIFIER. The mention carries an identifier from a system
 *      registered as authoritative in this domain, and that identifier already
 *      names exactly one entity. Score 1, and the only automatic resolution.
 *   2. FIRST SIGHTING OF AN IDENTIFIER. Same identifier, no entity holds it yet:
 *      a new entity is created, the identifier is attached, and the resolution
 *      then goes through path 1 against the entity that now holds it.
 *   3. EXACTLY ONE NORMALISED NAME MATCH. A proposal for a person. Never
 *      automatic — rule 2 — however confident the string comparison is.
 *   4. MORE THAN ONE NAME MATCH. Ambiguous. The Model Gateway may RANK the
 *      candidates (rule 3); the ranking is evidence attached to a proposal
 *      (rule 4) and carries its full lineage (rule 5).
 *   5. NOTHING MATCHED. A new entity is proposed, and the mention stays
 *      unresolved until a person accepts it (rule 7). No best match is forced.
 */
import { Injectable } from '@nestjs/common';

/** The resolver ruleset identity. Every resolution records which one ran. */
export const RESOLVER_RULE_VERSION = '1';

/**
 * Corporate and legal-form suffixes that carry no identity. Removing them is what
 * makes "NORDWERK ANTRIEBSTECHNIK GmbH" and "Nordwerk Antriebstechnik" the same
 * normalised string — and it is a DETERMINISTIC, versioned transformation, stored
 * with the entity, so a later change to this list cannot silently re-explain a
 * resolution that was made under the old one.
 */
const LEGAL_SUFFIXES = new Set([
  'gmbh', 'ag', 'ltd', 'limited', 'plc', 'inc', 'incorporated', 'llc', 'lp', 'llp',
  'sa', 'sas', 'sarl', 'bv', 'nv', 'ab', 'as', 'oy', 'spa', 'srl', 'pte', 'pty',
  'co', 'corp', 'corporation', 'company', 'holding', 'holdings', 'group',
]);

/** Words that carry no identity in a place or asset name. */
const GENERIC_WORDS = new Set(['the', 'of', 'and', 'de', 'del', 'la', 'le', 'el', 'al']);

/** Unicode combining marks, as an escape rather than a literal. */
const COMBINING_MARKS = /[\u0300-\u036f]/g;

/**
 * The normalised form of a mention.
 *
 * Lower-cased, stripped of diacritics and punctuation, collapsed whitespace, and
 * with legal forms and generic connectives removed. It is EXPLICITLY not a
 * similarity metric: two strings normalise to the same value or they do not, and
 * "nearly the same" is precisely the case rule 2 refuses to resolve.
 */
export function normalizeName(raw: string): string {
  const stripped = raw
    .normalize('NFKD')
    .replace(COMBINING_MARKS, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const words = stripped.split(' ')
    .filter((w) => w.length > 0 && !LEGAL_SUFFIXES.has(w) && !GENERIC_WORDS.has(w));
  return words.length === 0 ? stripped : words.join(' ');
}

export interface EntityCandidate {
  entity_id: string;
  entity_type: string;
  canonical_name: string;
  normalized_name: string;
  lifecycle_state: string;
}

export interface Mention {
  claimObjectId: string;
  claimVersion: number;
  text: string;
  entityType: string;
  /** system_key to value, taken from the claim's own qualifiers. */
  identifiers: Readonly<Record<string, string>>;
  evidenceObjectId: string;
  evidenceDigest: string;
}

export type ResolverOutcome =
  | { kind: 'identifier'; entityId: string; systemKey: string; value: string;
      score: 1; evidence: Record<string, unknown>; candidates: EntityCandidate[] }
  | { kind: 'new_identifier'; systemKey: string; value: string;
      evidence: Record<string, unknown> }
  | { kind: 'single_name'; entityId: string; score: number;
      evidence: Record<string, unknown>; candidates: EntityCandidate[] }
  | { kind: 'ambiguous'; candidates: EntityCandidate[]; evidence: Record<string, unknown> }
  | { kind: 'unmatched'; evidence: Record<string, unknown> }
  | { kind: 'conflict'; reason: string; evidence: Record<string, unknown> };

/**
 * Read an ENT claim as a mention.
 *
 * `qualifiers.identifiers` is where a claim declares the external identifiers it
 * saw. Anything that is not a string keyed by a well-formed system key is IGNORED
 * rather than coerced: an identifier the extractor could not state cleanly is not
 * an identifier this resolver will act on.
 */
export function mentionOf(claim: Record<string, unknown>): Mention | null {
  const payload = claim['payload'] as Record<string, unknown> | undefined;
  if (payload === undefined) return null;
  const subject = payload['subject'];
  if (typeof subject !== 'string' || subject.trim().length === 0) return null;
  const lineage = payload['lineage'] as Record<string, unknown> | undefined;
  const evidenceObjectId = typeof lineage?.['evidence_object_id'] === 'string'
    ? (lineage['evidence_object_id'] as string) : null;
  const evidenceDigest = typeof lineage?.['evidence_digest'] === 'string'
    ? (lineage['evidence_digest'] as string) : null;
  if (evidenceObjectId === null || evidenceDigest === null) return null;

  const q = payload['qualifiers'] as Record<string, unknown> | undefined;
  const identifiers: Record<string, string> = {};
  const raw = q?.['identifiers'];
  if (raw !== null && raw !== undefined && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === 'string' && v.trim().length > 0
        && /^[a-z0-9][a-z0-9_.:-]{1,63}$/.test(k)) {
        identifiers[k] = v.trim();
      }
    }
  }
  const t = q?.['entity_type'];
  const entityType = typeof t === 'string'
    && ['organization', 'place', 'asset', 'product', 'vessel', 'route', 'person', 'other'].includes(t)
    ? t : 'other';

  return {
    claimObjectId: String(claim['object_id']),
    claimVersion: Number(claim['object_version']),
    text: subject.trim(),
    entityType,
    identifiers,
    evidenceObjectId,
    evidenceDigest,
  };
}

@Injectable()
export class ResolverService {
  /**
   * Score one mention against what the domain already holds.
   *
   * This performs NO writes and reaches nothing outside its arguments, which is
   * what makes it testable in isolation and what keeps the acceptance decision in
   * the database where it belongs.
   */
  score(
    mention: Mention,
    entities: readonly EntityCandidate[],
    /** "system value" to entity_id, for every identifier registered in this domain. */
    identifierIndex: ReadonlyMap<string, string>,
    authoritativeSystems: ReadonlySet<string>,
  ): ResolverOutcome {
    // ── 1 and 2: authoritative identifiers ──
    const authoritative = Object.entries(mention.identifiers)
      .filter(([system]) => authoritativeSystems.has(system));
    const held = authoritative
      .map(([system, value]) => ({ system, value, entityId: identifierIndex.get(`${system} ${value}`) }))
      .filter((x) => x.entityId !== undefined) as Array<{ system: string; value: string; entityId: string }>;

    const distinct = new Set(held.map((h) => h.entityId));
    if (distinct.size > 1) {
      /*
       * CONFLICTING IDENTIFIERS. Two authoritative identifiers on one mention that
       * name different entities is a contradiction in the source data, not a
       * tie-break for the resolver to settle. Rule 2 says it never auto-resolves
       * and rule 7 says nothing is forced: it stays unresolved and is reported.
       */
      return {
        kind: 'conflict',
        reason: 'two authoritative identifiers on this mention name different entities',
        evidence: {
          identifiers: held.map((h) => ({ system: h.system, value: h.value, entity_id: h.entityId })),
          rule: 'identifier-conflict', rule_version: RESOLVER_RULE_VERSION,
        },
      };
    }
    if (held.length > 0) {
      const h = held[0] as { system: string; value: string; entityId: string };
      return {
        kind: 'identifier', entityId: h.entityId, systemKey: h.system, value: h.value, score: 1,
        evidence: {
          basis: 'exact match on an authoritative external identifier',
          identifier_system: h.system, identifier_value: h.value,
          rule: 'identifier-exact', rule_version: RESOLVER_RULE_VERSION,
        },
        candidates: entities.filter((e) => e.entity_id === h.entityId),
      };
    }
    if (authoritative.length > 0) {
      const first = authoritative[0] as [string, string];
      return {
        kind: 'new_identifier', systemKey: first[0], value: first[1],
        evidence: {
          basis: 'first sighting of an authoritative identifier no entity holds yet',
          identifier_system: first[0], identifier_value: first[1],
          rule: 'identifier-first-sighting', rule_version: RESOLVER_RULE_VERSION,
        },
      };
    }

    // ── 3, 4 and 5: names ──
    const normalized = normalizeName(mention.text);
    const matches = entities.filter(
      (e) => e.lifecycle_state === 'active' && e.normalized_name === normalized);

    if (matches.length === 1) {
      const m = matches[0] as EntityCandidate;
      return {
        kind: 'single_name', entityId: m.entity_id,
        // A name match is never 1: 1 is reserved for the identifier path, and the
        // CHECK constraint uses that reservation to tell the two apart.
        score: 0.9,
        evidence: {
          basis: 'exactly one active entity carries this normalised name',
          normalized, matched_name: m.canonical_name,
          rule: 'name-exact-single', rule_version: RESOLVER_RULE_VERSION,
          note: 'a name match never resolves automatically (resolver rule 2)',
        },
        candidates: matches,
      };
    }
    if (matches.length > 1) {
      return {
        kind: 'ambiguous', candidates: matches,
        evidence: {
          basis: 'more than one active entity carries this normalised name',
          normalized, candidate_count: matches.length,
          rule: 'name-exact-ambiguous', rule_version: RESOLVER_RULE_VERSION,
        },
      };
    }
    return {
      kind: 'unmatched',
      evidence: {
        basis: 'no existing entity matched by identifier or normalised name',
        normalized, rule: 'no-match', rule_version: RESOLVER_RULE_VERSION,
      },
    };
  }
}
