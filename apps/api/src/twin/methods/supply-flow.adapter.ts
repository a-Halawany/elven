/**
 * CP-6 B29 §C (0092): supply-flow@1 IN THE METHOD REGISTRY, UNCHANGED — family `flow`, its bytes and digest pinned where they
 * always were (twin/models/supply-flow.ts, supply-flow.digest.ts; the unit pin phase5-supply-flow.test.ts). This file only DESCRIBES
 * it as a MethodAdapter: the runtime keeps executing supply-flow@1 on its own path (simulation.service.ts — the parameters derived
 * from the twin's snapshot for one component, the sensitivity sweep, the §6b outputs), so its runs, digests and records are
 * byte-identical to before B29. `run` here maps a MethodInput whose params carry { params, options, interventions } — the
 * contract as contractOf() derives it — onto simulateSupplyFlow, for a caller that holds one; the runtime does not.
 */
import type { MethodAdapter, MethodInput, MethodOutput } from './types.js';
import { simulateSupplyFlow, validateParams, SUPPLY_FLOW_METHOD_REF, type Intervention, type SupplyFlowOptions, type SupplyFlowParams } from '../models/supply-flow.js';
import { SUPPLY_FLOW_IMPLEMENTATION_DIGEST } from '../models/supply-flow.digest.js';

/** supply-flow@1's required inputs, as 0032 registered them (twin.behaviour_models.required_inputs). */
export const SUPPLY_FLOW_REQUIRED_INPUTS: readonly string[] = Object.freeze(['inventory.on_hand', 'inventory.safety_stock', 'consumption.weekly', 'shipment', 'route.inland_days',
  'route.reroute_delay_days', 'terms.reroute_cost_per_container', 'terms.units_per_container', 'terms.air_cost_per_kg', 'terms.kg_per_unit', 'terms.air_lead_days',
  'terms.line_stop_cost_per_day', 'shock.corridor_delay_days', 'production.policy']);

function contract(input: MethodInput): { params: SupplyFlowParams; options: SupplyFlowOptions; interventions: Intervention[] } | null {
  const p = input.params ?? {};
  if (typeof p['params'] !== 'object' || p['params'] === null || typeof p['options'] !== 'object' || p['options'] === null || !Array.isArray(p['interventions'])) return null;
  return { params: p['params'] as SupplyFlowParams, options: p['options'] as SupplyFlowOptions, interventions: p['interventions'] as Intervention[] };
}

export const supplyFlowAdapter: MethodAdapter = {
  modelRef: SUPPLY_FLOW_METHOD_REF, family: 'flow', digest: SUPPLY_FLOW_IMPLEMENTATION_DIGEST, requiredInputs: SUPPLY_FLOW_REQUIRED_INPUTS,
  validate(input: MethodInput): string[] {
    const c = contract(input);
    return c === null ? ['supply-flow@1 takes { params, options, interventions } — the contract its runtime derives from the twin (contractOf)'] : validateParams(c.params, c.options, c.interventions);
  },
  run(input: MethodInput): MethodOutput {
    const c = contract(input);
    if (c === null) throw new Error('supply-flow@1 input invalid: { params, options, interventions } expected');
    const out = simulateSupplyFlow(c.params, c.options, c.interventions);
    return {
      series: out.days.map((d) => ({ ...d })),
      summary: { line_stop_days: out.totals.line_stop_days, total_cost: out.totals.cost.total },
    };
  },
};
