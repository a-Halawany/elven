/**
 * B33 §PK (0111) — THE MANIFEST of a domain package version (PK1; PR-31-002: domain package, ontology extension, source set, indicator,
 * model, assessment, watchlist, risk, opportunity, forecast, scenario, control, owner, release). The manifest REFERENCES the core's objects
 * (sources by key, forecast methods by registry ref, behaviour models, series, the risk taxonomy's categories) — it never forks them
 * (PR-31-001). Its FORM is checked by the port (domain.dpk_assert_manifest); what it CLAIMS is measured by the conformance suite.
 *
 * BOUNDARY (R7): signing and publisher identity → B77; extension namespaces in every layer → B78; marketplace and purchase → B112;
 * cross-profile parity → B111; the signed acceptance record → R2.
 */
import { createHash } from 'node:crypto';

export const SECTIONS = ['ontology', 'methodology', 'assessment', 'escalation', 'use_boundary'] as const;
export type Section = typeof SECTIONS[number];
export const FUNCTIONS = ['assess', 'event', 'watch', 'alert', 'forecast', 'scenario', 'exposure', 'indicator'] as const;
export type PackageFunction = typeof FUNCTIONS[number];
/** The core's fixed entity types (0024:133-135) — a package maps onto them. */
export const CORE_TYPES = ['organization', 'place', 'asset', 'product', 'vessel', 'route', 'person', 'other'] as const;
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export const HORIZONS = ['30d', '90d', '180d', '1y', '3y', '5y'] as const;
export const LONG_HORIZONS = ['3y', '5y'] as const;

export interface Mapping { type: string; maps_to: string; label?: string }
export interface Predicate { predicate: string; subject_types?: string[]; object_types?: string[] }
export interface SourceEntry { source_key: string; purposes: string[]; required?: boolean; functions?: PackageFunction[]; role?: string }
export interface IndicatorEntry {
  key: string; series_key: string; definition: string; freshness_days?: number;
  /** financial: the calculation evidence — the inputs (series keys), the method and the digest of both (reproducible) */
  calculation?: { inputs: string[]; method: string; digest: string };
}
export interface ModelEntry {
  kind: 'forecast' | 'behaviour'; ref: string; series_key?: string; target_key?: string; functions?: PackageFunction[];
  /** forecast: the horizons claimed and the claim — `validated` needs a passing B25 validation at that horizon; `scenario_language` claims none */
  horizons?: string[]; claim?: 'validated' | 'scenario_language' | 'unvalidated';
}
export interface TemplateEntry { key: string; title?: string; min_publishers?: number; material?: boolean }
export interface InputsStatement { real_public: string[]; synthetic: string[]; licensed_for_acceptance: string[] }
export interface Manifest {
  ontology_extension: { namespace: string; mappings: Mapping[]; predicates: Predicate[]; event_kinds?: string[] };
  source_set: SourceEntry[];
  indicators: IndicatorEntry[];
  models: ModelEntry[];
  assessment_templates: TemplateEntry[];
  watchlist_templates: Array<{ key: string; title: string; rules: unknown[] }>;
  escalation?: Record<string, unknown>;
  controls: {
    purposes: string[]; classification_ceiling: typeof CLASSIFICATIONS[number]; retention?: string;
    scope?: { entities?: string[]; geography?: string[]; horizon?: string; description?: string };
    inputs?: InputsStatement;
    evidence_diversity?: { min_share: number };
    false_positive?: { min_precision: number; min_n: number };
    timing?: { max_lag_days: number };
  };
  risk_meaning: Array<{ category_key: string; meaning: string }>;
  release: {
    semver: string; core?: { ontology?: string };
    requires?: Array<{ package_key: string; range: string }>; conflicts?: Array<{ package_key: string; range: string }>;
    migration?: string | null; boundary?: string;
  };
}

/** A canonical JSON text (sorted keys, no whitespace) — the digest form of the TS side (the port digests its own jsonb text). */
export function stableStringify(v: unknown): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map((x) => stableStringify(x)).join(',')}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}
export const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
export const digestOf = (v: unknown): string => sha256(stableStringify(v));

/** The calculation digest a financial indicator declares: the sorted inputs and the method (reproducible by anyone holding the declaration). */
export function calculationDigest(c: { inputs: string[]; method: string }): string {
  return digestOf({ inputs: [...c.inputs].sort(), method: c.method });
}

export const CLASSIFICATION_RANK: Record<string, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };
