/**
 * B92 §MD (0113_b92_x_md) — THE PURE LOGIC of the definitions part: a MetricContract (the TS form §MCA / §MCB export) as the port's contract
 * jsonb, the request-shape test of a contract a route admits before any port runs, the performance-purpose word test (a MIRROR of
 * analytics.states_performance_purpose — the port decides; the mirror lets a client say why before it asks), and the qualification test
 * ES-40-008 applies to a briefing's or publication's citation of an indeterminate result (again the port decides).
 * Nothing here approves, computes or decides; a refusal is always the port's text.
 */
import type { MetricContract } from '../contract.js';
import { PERSON_DIMENSIONS } from '../seams.js';

type Row = Record<string, unknown>;

/** Where a result may be cited (analytics.metric_uses.used_in_kind). */
export const USED_IN_KINDS = ['operating_review', 'decision_package', 'briefing', 'publication', 'export', 'finding'] as const;
export type UsedInKind = (typeof USED_IN_KINDS)[number];
/** Where a B90 metric serving may be cited (products.metric_serving_uses.used_in_kind — DP-44-005). */
export const SERVING_USE_KINDS = ['decision_package', 'briefing', 'publication'] as const;
export type ServingUseKind = (typeof SERVING_USE_KINDS)[number];
/** The kinds whose citation of an indeterminate / unsupported result must be QUALIFIED (ES-40-008). */
export const QUALIFIED_KINDS: readonly string[] = ['briefing', 'publication'];

/** Mirrors analytics.performance_purpose_terms() (0113_b92_x_md §MD.1). */
export const PERFORMANCE_TERMS = ['performance review', 'performance evaluation', 'performance appraisal', 'performance management', 'employee performance', 'staff performance',
  'individual performance', 'worker performance', 'personal performance', 'employee scoring', 'employee score', 'scoring employees', 'score employees',
  'scoring staff', 'score staff', 'productivity scoring', 'productivity score', 'ranking staff', 'rank staff', 'ranking employees', 'rank employees',
  'employee ranking', 'staff ranking', 'monitor employees', 'monitoring employees', 'track employees', 'tracking employees', 'employee surveillance',
  'surveillance of staff', 'surveil', 'disciplinary', 'appraisal of staff', 'appraise employees'] as const;

/**
 * The phrase of a text that STATES a purpose of evaluating, scoring, ranking or watching people — or null. A phrase negated earlier in its own
 * clause ("never for employee performance, ranking or surveillance") is a disclaimer and passes; a clause ends at . ; : ! ? or a dash between
 * words. Hyphens, underscores and slashes read as spaces. The longest matching phrase is answered (the port's order).
 */
export function statesPerformancePurpose(text: string | null | undefined): string | null {
  const clauses = String(text ?? '').toLowerCase().replace(/[.;:!?\u2014\u2013]|\s-+\s/g, '|').split('|').map((c) => c.replace(/[-_/]+/g, ' ').replace(/\s+/g, ' '));
  const negated = /\b(no|not|never|without|nor|excluding|excludes)\b/;
  const hits = PERFORMANCE_TERMS.filter((t) => clauses.some((c) => { const at = c.indexOf(t); return at >= 0 && !negated.test(c.slice(0, at)); }));
  return hits.sort((a, b) => b.length - a.length)[0] ?? null;
}

/** A cohort dimension that names a person (the port's two tests: the prelude's list, and the role-of-a-person name pattern). */
export function personDimension(d: string): boolean {
  return (PERSON_DIMENSIONS as readonly string[]).includes(d) || /(^|_)(employee|person|people|principal|user|actor|owner|assignee|reviewer|approver|staff|worker)s?(_|$)/i.test(d);
}

/**
 * A MetricContract (camelCase, §0's contract.ts) as the port's contract (snake_case — the columns of analytics.metric_definitions). The named
 * owner is the human the act binds (`ownerPrincipalId`); App M's owner column (`ownerRole`) travels in quality.owner_role, where the port maps
 * it onto a role of this product (analytics.owner_role_map) and checks the named owner holds it (or product_analytics_owner).
 */
export function contractPayload(c: MetricContract, ownerPrincipalId: string): Row {
  return {
    metric_key: c.metricKey, title: c.title, meaning: c.meaning, kind: c.kind, unit: c.unit, direction: c.direction, population: c.population,
    numerator: c.numerator, denominator: c.denominator, exclusions: c.exclusions,
    window_spec: { kind: c.window.kind, clock: c.window.clock, ...(c.window.days === undefined ? {} : { days: c.window.days }) },
    dimensions: c.dimensions, privacy_class: c.privacyClass, k_min: c.kMin, floor_n: c.floorN, threshold: c.threshold, purpose_key: c.purposeKey, serves: c.serves,
    cadence: c.cadence, owner_principal_id: ownerPrincipalId, action: c.action, retirement: c.retirement,
    quality: { ...c.quality, owner_role: c.ownerRole }, cost_allocation: c.costAllocation, computation_key: c.computationKey, params: c.params,
    unsupported_reason: c.unsupportedReason, source_refs: c.sourceRefs,
  };
}

const isObj = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
/**
 * The REQUEST's shape (the route's own 422 `(request)` before any port runs): the camelCase form (a MetricContract — converted with the owner
 * named) or the snake_case form (already the port's). Answers the port's contract, or the reason the request is malformed. The CONTRACT's
 * rules (purpose approved, dimensions, threshold, serves, owner…) are the port's alone.
 */
export function contractOfRequest(raw: unknown, ownerPrincipalId: string | null): { contract: Row } | { problem: string } {
  if (!isObj(raw)) return { problem: 'payload.contract is the definition contract (an object)' };
  if (typeof raw['metricKey'] === 'string') {
    if (ownerPrincipalId === null) return { problem: 'payload.ownerPrincipalId names the definition\'s owner (a named human)' };
    const c = raw as unknown as MetricContract;
    if (!isObj(c.window) || !Array.isArray(c.dimensions) || !Array.isArray(c.exclusions) || !Array.isArray(c.sourceRefs) || !isObj(c.quality) || !isObj(c.params) || !isObj(c.costAllocation)) {
      return { problem: 'a camelCase contract carries window {kind, clock}, dimensions[], exclusions[], sourceRefs[], quality{}, params{} and costAllocation{}' };
    }
    return { contract: contractPayload(c, ownerPrincipalId) };
  }
  if (typeof raw['metric_key'] === 'string') {
    const out: Row = { ...raw };
    if (ownerPrincipalId !== null && out['owner_principal_id'] === undefined) out['owner_principal_id'] = ownerPrincipalId;
    for (const k of ['exclusions', 'dimensions', 'source_refs']) if (out[k] === undefined) out[k] = [];
    for (const k of ['quality', 'cost_allocation', 'params', 'threshold']) if (out[k] === undefined) out[k] = {};
    return { contract: out };
  }
  return { problem: 'payload.contract names its metric (metricKey or metric_key)' };
}

/** ES-40-008's qualification (the port's rule, mirrored): a briefing or publication citing a non-determinate result says so in its note. */
export function qualificationProblem(kind: string, resultState: string, qualified: boolean, note: string | null | undefined): string | null {
  if (!QUALIFIED_KINDS.includes(kind) || resultState === 'determinate') return null;
  if (!qualified) return `the result is ${resultState}: a ${kind} cites it only qualified (qualified: true and a note saying it is ${resultState})`;
  const n = String(note ?? '').trim();
  if (n.length < 16 || !n.toLowerCase().includes(resultState)) return `the qualification note states that the result is ${resultState} (16+ characters naming the state)`;
  return null;
}
