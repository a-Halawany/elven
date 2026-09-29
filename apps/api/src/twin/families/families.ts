/**
 * CP-6 B29 §A (0092) — THE TWIN FAMILIES (F-P5-01): the domain behaviour of each product kind — enterprise, market, competitor, product,
 * process, infrastructure, regulation, organisation — as a VALIDATOR (checked at version admission: the element keys and units conform to
 * the kind's element schema, and the family's own domain rules hold) and FAMILY-DERIVED MEASURES (read from a version's complete elements:
 * an enterprise's capacity utilisation from the capacities coupled in from its process twins, a process's line throughput per day, …).
 *
 * The element SCHEMA is the kind row's (twin.twin_kind_schemas.element_schema, 0092 §A.1) — read at admission, never duplicated here; an
 * x- kind registered by a domain (family `extension`) gets the schema check alone. A kind with an EMPTY schema (supply-chain, whose
 * elements the supply-flow model defines) is not checked — every twin that admitted before B29 admits exactly as it did.
 *
 * Pure: no clock, no I/O. `asOf` (a day) is passed where a measure needs one (regulation: in force).
 */

import { networkMeasures, networkRules } from '../supply-network/network.js'; // B29 §B (0092)

export const PRODUCT_FAMILIES = ['enterprise', 'market', 'competitor', 'product', 'process', 'infrastructure', 'regulation', 'organisation'] as const;
export type ProductFamily = (typeof PRODUCT_FAMILIES)[number];

export interface SchemaEntry { unit: string | null; description: string; required: boolean;
  /** B29 §B (0092): a unit FAMILY — the element's unit matches this pattern instead of equalling `unit` (which names the family, e.g. a
   *  supply network's capacity in <the material's unit>/day); the family's own rules then hold the unit consistent. */
  unit_pattern?: string }
export type ElementSchema = Record<string, SchemaEntry>;
/** One state element as a family reads it (a version's element row, reduced). */
export interface FamilyElement { key: string; value: unknown; unit: string | null; health?: string | null }
export type Measures = Record<string, number | string | boolean | null>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const prefixOf = (key: string): string => key.split(':')[0] as string;
const suffixOf = (key: string): string | null => (key.includes(':') ? key.slice(key.indexOf(':') + 1) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const round = (v: number, places = 4): number => Math.round(v * 10 ** places) / 10 ** places;

/** The complete elements only: an incomplete, unreadable or stale element measures nothing. */
function complete(elements: readonly FamilyElement[]): FamilyElement[] {
  return elements.filter((e) => e.health === undefined || e.health === null || e.health === 'complete');
}
/** Every numeric value of a prefix, by suffix ('' for the unsuffixed key). */
function byPrefix(elements: readonly FamilyElement[], prefix: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of complete(elements)) {
    if (prefixOf(e.key) !== prefix) continue;
    const n = num(e.value);
    if (n !== null) out.set(suffixOf(e.key) ?? '', n);
  }
  return out;
}
const sum = (m: Map<string, number>): number | null => (m.size === 0 ? null : [...m.values()].reduce((a, b) => a + b, 0));
const one = (elements: readonly FamilyElement[], prefix: string): number | null => sum(byPrefix(elements, prefix));

/**
 * THE SCHEMA CHECK every schema-bearing kind shares: each element's prefix is one the kind declares; its unit is the declared unit
 * exactly (a unit-less entry takes no unit); a quantity is a finite number, never negative; a ratio lies in [0, 1]; a `date` is a day.
 */
export function conformsToSchema(schema: ElementSchema, elements: readonly FamilyElement[]): string[] {
  const errors: string[] = [];
  if (Object.keys(schema).length === 0) return errors;
  for (const e of elements) {
    const entry = schema[prefixOf(e.key)];
    if (entry === undefined) { errors.push(`${e.key}: not an element this kind declares (declared: ${Object.keys(schema).sort().join(', ')})`); continue; }
    const unit = e.unit ?? null;
    if (typeof entry.unit_pattern === 'string') { // B29 §B (0092)
      if (unit === null || !new RegExp(entry.unit_pattern).test(unit)) { errors.push(`${e.key}: unit ${unit === null ? '(none)' : unit} — the kind declares a unit of the form ${entry.unit_pattern}`); continue; }
    } else if (unit !== entry.unit) { errors.push(`${e.key}: unit ${unit === null ? '(none)' : unit} — the kind declares ${entry.unit === null ? 'no unit' : entry.unit}`); continue; }
    if (entry.unit === null) continue;
    if (entry.unit === 'date') {
      if (typeof e.value !== 'string' || !DAY.test(e.value) || Number.isNaN(new Date(`${e.value}T00:00:00Z`).getTime())) errors.push(`${e.key}: a date is a day, YYYY-MM-DD`);
      continue;
    }
    const n = num(e.value);
    if (n === null) { errors.push(`${e.key}: a quantity in ${entry.unit} is a finite number`); continue; }
    if (n < 0) errors.push(`${e.key}: ${n} ${entry.unit} is negative`);
    if (entry.unit === 'ratio' && n > 1) errors.push(`${e.key}: a ratio lies between 0 and 1 (got ${n})`);
  }
  return errors;
}

export interface FamilyDefinition {
  /** The family's own domain rules, beyond the schema (run on every element of the version, complete or not). */
  rules(elements: readonly FamilyElement[]): string[];
  measures(elements: readonly FamilyElement[], asOf: string | null): Measures;
}

/** Σ over suffixes of min(line capacity, supply capacity when coupled) — the capacity a set of processes can actually run at. */
function effectiveCapacity(line: Map<string, number>, supply: Map<string, number>): number | null {
  if (line.size === 0) return null;
  let total = 0;
  for (const [k, cap] of line) {
    const s = supply.get(k);
    total += s === undefined ? cap : Math.min(cap, s);
  }
  return total;
}

export const FAMILIES: Readonly<Record<ProductFamily, FamilyDefinition>> = Object.freeze({
  enterprise: {
    rules: () => [],
    /** Capacity utilisation: demand per day over the effective capacity of the processes coupled in (line capacity bounded by supply). */
    measures(elements) {
      const demand = one(elements, 'demand.per_day');
      const capacity = effectiveCapacity(byPrefix(elements, 'process.line_capacity_per_day'), byPrefix(elements, 'process.supply_capacity_per_day'));
      return {
        demand_per_day: demand, effective_capacity_per_day: capacity,
        capacity_utilisation: demand === null || capacity === null || capacity === 0 ? null : round(demand / capacity),
        processes: byPrefix(elements, 'process.line_capacity_per_day').size,
      };
    },
  },
  process: {
    rules(elements) {
      const errors: string[] = [];
      for (const [k, v] of byPrefix(elements, 'line.capacity_per_day')) if (v === 0) errors.push(`line.capacity_per_day${k === '' ? '' : `:${k}`}: a line with no capacity is not a line — retire it from the process`);
      return errors;
    },
    /** Line throughput per day: the lines' capacity at their availability, bounded by the supply capacity reaching the process. */
    measures(elements) {
      const line = sum(byPrefix(elements, 'line.capacity_per_day'));
      const availability = one(elements, 'line.availability');
      const supply = one(elements, 'supply.capacity_per_day');
      const lineOutput = line === null ? null : line * (availability ?? 1);
      const throughput = lineOutput === null ? null : supply === null ? lineOutput : Math.min(lineOutput, supply);
      return {
        line_capacity_per_day: line, supply_capacity_per_day: supply,
        throughput_per_day: throughput === null ? null : round(throughput, 2),
        bottleneck: throughput === null ? null : supply !== null && supply < (lineOutput as number) ? 'supply' : 'line',
      };
    },
  },
  market: {
    rules: () => [],
    measures(elements) {
      const volume = one(elements, 'demand.volume_per_month');
      const share = one(elements, 'share.own');
      return { volume_per_month: volume, own_share: share, own_volume_per_month: volume === null || share === null ? null : round(volume * share, 2) };
    },
  },
  competitor: {
    rules: () => [],
    measures(elements) {
      const capacity = one(elements, 'capacity.per_month');
      const share = one(elements, 'share');
      return { capacity_per_month: capacity, share, price_index: one(elements, 'price.index') };
    },
  },
  product: {
    rules: () => [],
    measures(elements) {
      const cost = one(elements, 'unit.cost');
      const price = one(elements, 'unit.price');
      return {
        unit_cost: cost, unit_price: price, unit_margin: cost === null || price === null ? null : round(price - cost, 2),
        margin_ratio: cost === null || price === null || price === 0 ? null : round((price - cost) / price),
        components: byPrefix(elements, 'bom.component').size,
      };
    },
  },
  infrastructure: {
    rules: () => [],
    /** Utilisation: load over the capacity available (an overloaded asset reads above 1 — that is the finding, not an error). */
    measures(elements) {
      const capacity = one(elements, 'asset.capacity');
      const load = one(elements, 'asset.load');
      const available = capacity === null ? null : capacity * (one(elements, 'asset.availability') ?? 1);
      return { available_capacity: available, load, utilisation: available === null || load === null || available === 0 ? null : round(load / available) };
    },
  },
  regulation: {
    rules: () => [],
    /** In force as of a day (the version's world cut-off when the caller gives none), and the days until it is. */
    measures(elements, asOf) {
      const from = complete(elements).find((e) => prefixOf(e.key) === 'rule.effective_from')?.value;
      if (typeof from !== 'string' || !DAY.test(from) || asOf === null) return { effective_from: typeof from === 'string' ? from : null, in_force: null, days_until_effective: null };
      const days = Math.round((Date.parse(`${from}T00:00:00Z`) - Date.parse(`${asOf}T00:00:00Z`)) / 86_400_000);
      return { effective_from: from, as_of: asOf, in_force: days <= 0, days_until_effective: Math.max(days, 0) };
    },
  },
  organisation: {
    rules(elements) {
      const headcount = one(elements, 'headcount');
      const filled = sum(byPrefix(elements, 'roles.filled'));
      return headcount !== null && filled !== null && filled > headcount ? [`roles.filled: ${filled} roles filled by a headcount of ${headcount}`] : [];
    },
    measures(elements) {
      const required = sum(byPrefix(elements, 'roles.required'));
      const filled = sum(byPrefix(elements, 'roles.filled'));
      return { headcount: one(elements, 'headcount'), role_coverage: required === null || filled === null || required === 0 ? null : round(filled / required) };
    },
  },
});

export const isProductFamily = (f: unknown): f is ProductFamily => typeof f === 'string' && (PRODUCT_FAMILIES as readonly string[]).includes(f);

/* B29 §B (0092): the SUPPLY-NETWORK family (twin/supply-network/network.ts — tiers, sites, materials, routes, capacities), registered
   beside the eight: its validator runs at admission and its measures are read the same way. */
const MORE_FAMILIES: Readonly<Record<string, FamilyDefinition>> = Object.freeze({
  'supply-network': { rules: networkRules, measures: (elements) => networkMeasures(elements) },
});
function definitionOf(family: string | null): FamilyDefinition | null {
  if (isProductFamily(family)) return FAMILIES[family];
  return family !== null && Object.prototype.hasOwnProperty.call(MORE_FAMILIES, family) ? (MORE_FAMILIES[family] as FamilyDefinition) : null;
}
/* end B29 §B */

/** THE VALIDATOR a version of a kind is admitted under: the schema check, then the family's own rules (an x- kind: the schema alone). */
export function validateFamily(family: string | null, schema: ElementSchema, elements: readonly FamilyElement[]): string[] {
  if (Object.keys(schema).length === 0) return [];
  const errors = conformsToSchema(schema, elements);
  const def = definitionOf(family); // B29 §B (0092): the eight and the supply network
  if (errors.length === 0 && def !== null) errors.push(...def.rules(elements));
  return errors;
}

/** The family-derived measures of a version's elements; an extension or a schema-less kind derives none. */
export function familyMeasures(family: string | null, elements: readonly FamilyElement[], asOf: string | null = null): Measures {
  return definitionOf(family)?.measures(elements, asOf) ?? {}; // B29 §B (0092)
}
