/**
 * CP-6 B40 §VA (L1-C06) — AUTHENTICITY AS A MEASURED COVERAGE DIMENSION. Pure: from the source's recorded outcomes in the window
 * (observation.authenticity_measure) to the coverage dimension. Nothing recorded (a v1–v3 source, or no admission in the window) answers NULL —
 * the caller keeps its own `unknown` (content authenticity unknown is the honest default, never inferred). Recorded outcomes are MEASURED:
 * the share VERIFIED of the versions admitted in the window, with the failed / unsigned / unavailable counts in words — never one score that
 * hides a failure (a failed signature is named first).
 */
import type { AuthenticityMeasure } from '../observation.capabilities.js';

/** The coverage dimension's shape (coverage.service.ts DimensionResult — restated structurally here: coverage.service imports this file). */
export interface AuthenticityDimensionResult {
  dimension: 'authenticity'; state: 'measured'; valueNumeric: number; valueText: string; denominator: number; naReason: null; errorClass: string | null; confidence: string;
}

export function authenticityDimension(m: AuthenticityMeasure | null | undefined): AuthenticityDimensionResult | null {
  if (m === null || m === undefined || !(m.recorded > 0)) return null;
  const pct = Math.round((m.verified / m.recorded) * 10_000) / 100;
  const parts = [
    m.failed > 0 ? `${m.failed} FAILED signature check(s) — admitted marked, refused at decision-active use` : null,
    `${m.verified} verified`,
    m.unsigned > 0 ? `${m.unsigned} unsigned` : null,
    m.unavailable > 0 ? `${m.unavailable} not checkable (unavailable)` : null,
  ].filter((x): x is string => x !== null);
  return {
    dimension: 'authenticity', state: 'measured', valueNumeric: pct,
    valueText: `content authenticity of ${m.recorded} admitted version(s) in the window (publisher signature, ${m.schemes.join(' / ') || 'no scheme'}): ${parts.join('; ')}. TLS and digests establish transport and byte integrity only.`,
    denominator: m.recorded, naReason: null, errorClass: m.failed > 0 ? 'authenticity_failed' : null, confidence: 'recorded-per-version',
  };
}
