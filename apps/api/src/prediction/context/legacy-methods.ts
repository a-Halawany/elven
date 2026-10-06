/**
 * B25 §CX (0108; V03-T-196) — the two LEGACY forecasting methods registered in the forecast-environment register: their implementation
 * digest (sha-256 over the bytes of src/prediction/models/models.ts, pinned here and recomputed by a unit control — change the models,
 * change this digest and the method version together, never the constant alone) and their deterministic compute, in the exact shape the
 * issue path stores (quantiles and path rounded to 4 places — forecasting.service.ts `round`), so a replay recomputes what was stored.
 * Registered under the models' own names (`seasonal-naive@1`, `holt-winters-additive@1`, what a forecast row's method/method_version
 * spell) and the registry's spelling (`seasonal_naive@1`, `holt_winters@1`, the seams' default plan).
 */
import { registerForecastMethod, type ReplayableOutput } from '../../shared/forecast-environment.js';
import { forecastWith, HOLT_WINTERS, MODEL_VERSION, SEASONAL_NAIVE } from '../models/models.js';

export const MODELS_IMPLEMENTATION_DIGEST = '7da8dc6d086417600f198d4da9a14edcab9d498234532d09342bf59c1b29d051';

const round = (x: number, p = 4): number => Number(x.toFixed(p));

/** The stored shape of a legacy method's output (forecasting.service.ts issue: quantiles and every path step rounded). */
export function legacyOutput(method: string, points: Array<{ date: string; value: number }>, steps: number, season: number): ReplayableOutput {
  const out = forecastWith(method, points, steps, season);
  return {
    quantiles: { q10: round(out.quantiles.q10), q50: round(out.quantiles.q50), q90: round(out.quantiles.q90) },
    path: out.path.map((p) => ({ ...p, q10: round(p.q10), q50: round(p.q50), q90: round(p.q90) })),
  };
}

export const LEGACY_METHOD_REFS: Readonly<Record<string, string>> = Object.freeze({
  [`${SEASONAL_NAIVE}@${MODEL_VERSION}`]: SEASONAL_NAIVE,
  [`${HOLT_WINTERS}@${MODEL_VERSION}`]: HOLT_WINTERS,
  'seasonal_naive@1': SEASONAL_NAIVE,
  'holt_winters@1': HOLT_WINTERS,
});

let registered = false;
/** Idempotent: the context part's providers call it once at construction. */
export function registerLegacyMethods(): void {
  if (registered) return;
  for (const [ref, method] of Object.entries(LEGACY_METHOD_REFS)) {
    registerForecastMethod(ref, { implementationDigest: MODELS_IMPLEMENTATION_DIGEST, compute: (points, steps, season) => legacyOutput(method, points, steps, season) });
  }
  registered = true;
}
