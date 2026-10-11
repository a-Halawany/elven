/**
 * B92 (0113 §0.6) — THE METRIC CONTRACT as TS data (D2; PR-70-002, App M "Contract"): what a definition version declares. It mirrors
 * analytics.metric_definitions. The computation parts (§MCA, §MCB) each export their metrics' contracts (`definitions-a.ts`, `definitions-b.ts`);
 * §MD's propose port admits them; a named product analytics owner approves them. A contract is DATA, proposed through the governed port — never
 * a SQL seed. The App M rows give meaning, scope, threshold, cadence and owner; the numerator, denominator, population, exclusions and window
 * are this product's READINGS of them (MAP.md section 2), each stated on the contract for the approver.
 */
export type MetricKind = 'rate' | 'duration' | 'ratio' | 'count' | 'score';
export type Direction = 'higher' | 'lower' | 'band' | 'track';
export type WindowKind = 'calendar_quarter' | 'calendar_month' | 'rolling_days';
export type PurposeKind = 'product_improvement' | 'mission_outcome' | 'governance' | 'reliability' | 'cost';

export interface MetricContract {
  /** `MET-001` … `MET-040`, or a further key of the same form (`V1-decision-cycle`, `ES40-commitment-visibility`) */
  metricKey: string;
  title: string;
  /** App M's MEASURED MEANING, faithfully */
  meaning: string;
  kind: MetricKind;
  unit: string;
  direction: Direction;
  /** {subject, inclusion, scope_rule, clock_note?} — the population as this product reads it */
  population: Record<string, unknown>;
  numerator: string | null;
  denominator: string | null;
  /** [{rule, reason}] — what is excluded and why (a replayed world-clock record, a synthetic channel …) */
  exclusions: Array<{ rule: string; reason: string }>;
  window: { kind: WindowKind; days?: number; clock: 'record' | 'world' };
  /** cohort dimensions the computation supports — never a person (analytics.person_dimensions) */
  dimensions: string[];
  privacyClass: 'aggregate' | 'pseudonymous_cohort';
  kMin: number;
  /** the minimum n for a determinate value */
  floorN: number;
  /** {target?} or {band: [lo, hi]} — and nothing else; the breach ACTION is `action` */
  threshold: { target?: number; band?: [number, number] } | Record<string, never>;
  /** an APPROVED purpose of the register (analytics.purposes) — `product-quality`, `mission-outcomes`, `governance-assurance` … (§MD names them) */
  purposeKey: string;
  /** V01-T-040: the objective(s) / decision class / value measure the metric serves */
  serves: { objective_ids?: string[]; decision_classes?: string[]; value_measure?: string; note?: string };
  cadence: string;
  /** App M's OWNER column (a role); the definition's owner_principal_id is the named human the act binds */
  ownerRole: string;
  /** the review workflow a breach opens — never an automatic or punitive decision */
  action: string;
  retirement: string;
  quality: Record<string, unknown>;
  costAllocation: Record<string, unknown>;
  /** the registered computation (0113 §0.7) — null with `unsupportedReason` (and its carrier) when the product holds no source */
  computationKey: string | null;
  params: Record<string, unknown>;
  unsupportedReason: string | null;
  /** App M / V1 / ES row ids this contract answers */
  sourceRefs: string[];
}
