/**
 * CP-6 B40 §IN — THE INSPECTION ENGINE PORT (DESIGN D2; L1-C07, V03-T-074). Versioned engines behind one shape: each answers ONE verdict per
 * item — its identity (intake-stage-types.ts EngineIdentity: the engine, its version, the image digest, the rule-set digest, the signature
 * databases), its outcome (clean | detected | unavailable | failed | incomplete), its findings (codes and offsets, never content — D9) — and
 * the configuration it ran under (engineConfig: the sandbox flags, or the clamd address with the signature-database source and update policy
 * named explicitly). The verdict is recorded as evidence (observation.inspection_verdicts) beside the record it describes.
 *
 * The engines: `content-inspector` (engine 1: the sandboxed deterministic inspector, content-inspector.ts) and `clamav` (engine 2: a ClamAV
 * engine over clamd, clamd-adapter.ts). An SRC@v4 contract names the engines that must answer clean (content_policy.scan_engines); ONLY a
 * clean verdict from each passes (inspection-policy.ts). An engine this deployment does not configure answers `unavailable` — fail closed.
 */
import type { EngineVerdict, InspectionFinding } from '../acquisition/intake-stage-types.js';

/** A finding as recorded: the seam's code / offsets / detail and the CLASS it falls under (never content — D9). */
export type RecordedFinding = InspectionFinding & { class?: string };
/** A verdict as recorded: the seam's EngineVerdict plus the configuration the engine ran under (no secret, no content). */
export interface RecordedEngineVerdict extends EngineVerdict {
  findings: RecordedFinding[];
  engineConfig: Record<string, unknown>;
}

/** One inspection engine. `inspect` never throws: every way it can end is a verdict. */
export interface InspectionEngine {
  readonly name: string;
  inspect(bytes: Uint8Array, meta: { filename: string | null; declaredType: string | null }): Promise<RecordedEngineVerdict>;
}

/** The order a non-clean verdict decides the quarantine class in (the most serious first). */
export const OUTCOME_SEVERITY: Readonly<Record<string, number>> = Object.freeze({ detected: 4, failed: 3, incomplete: 2, unavailable: 1, clean: 0 });

/** A verdict for an engine the deployment does not provide — fail closed, never clean. */
export function unavailableVerdict(engine: string, detail: string, engineConfig: Record<string, unknown> = {}): RecordedEngineVerdict {
  const at = new Date().toISOString();
  return {
    identity: { engine, engineVersion: null, imageDigest: null, ruleSetDigest: null, signatureDatabases: [] },
    outcome: 'unavailable', findings: [], startedAt: at, finishedAt: at, detail, engineConfig,
  };
}
