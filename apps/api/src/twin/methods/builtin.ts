/**
 * CP-6 B29 §C (0092): THE PRODUCT'S METHODS — every adapter this build carries, with the fixed PROBE input the fabric runs after a
 * fault. Plain data (no DI): the registry (method-registry.ts) and the out-of-process worker (method-worker.ts) both read it, so the
 * process that validates a run and the process that executes it resolve a model reference to the SAME implementation.
 */
import type { MethodAdapter, MethodInput } from './types.js';
import { supplyFlowAdapter } from './supply-flow.adapter.js';
import { DISCRETE_EVENT_PROBE, discreteEventAdapter } from './discrete-event.js';
import { SYSTEM_DYNAMICS_PROBE, systemDynamicsAdapter } from './system-dynamics.js';
import { AGENT_BASED_PROBE, agentBasedAdapter } from './agent-based.js';
import { OPTIMISATION_PROBE, optimisationAdapter } from './optimisation.js';
import { WAR_GAMING_PROBE, warGamingAdapter } from './war-gaming.js';
import { COUNTERFACTUAL_PROBE, counterfactualAdapter } from './counterfactual.js';

export interface BuiltinMethod { adapter: MethodAdapter; probe: MethodInput | null }

export const BUILTIN_METHODS: readonly BuiltinMethod[] = Object.freeze([
  // supply-flow@1 runs on its own path in the runtime, never contained: it has no probe (0092 §C keeps its registry row's containment `{"isolated": false}`).
  { adapter: supplyFlowAdapter, probe: null },
  { adapter: discreteEventAdapter, probe: DISCRETE_EVENT_PROBE },
  { adapter: systemDynamicsAdapter, probe: SYSTEM_DYNAMICS_PROBE },
  { adapter: agentBasedAdapter, probe: AGENT_BASED_PROBE },
  { adapter: optimisationAdapter, probe: OPTIMISATION_PROBE },
  { adapter: warGamingAdapter, probe: WAR_GAMING_PROBE },
  { adapter: counterfactualAdapter, probe: COUNTERFACTUAL_PROBE },
]);

export function builtinMethod(modelRef: string): BuiltinMethod | undefined {
  return BUILTIN_METHODS.find((m) => m.adapter.modelRef === modelRef);
}
