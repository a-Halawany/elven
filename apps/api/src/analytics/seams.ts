/**
 * B92 (0113 §0) — THE SHARED VOCABULARY of product analytics, the metric catalog and UX telemetry: the attention classes and subject kinds the
 * prelude added, the person dimensions no product metric may use (no employee-performance inference — PR-70-003), the purpose kinds, the
 * NOUNS every B92 refusal speaks in (`<noun> rejected (<class>): …`, mapped centrally in observation-errors.ts `B92 §0`), and the refusal helper.
 * Parts add nothing here — ask the integrator.
 */
import { HttpException } from '@nestjs/common';
import { errorBody } from '@eye/contracts';

export const B92_SIGNAL_CLASSES = ['analytics.metric', 'analytics.privacy', 'analytics.experience'] as const;
export const B92_SUBJECT_KINDS = ['metric_definition', 'metric_result', 'telemetry_definition', 'experience_finding', 'operating_review'] as const;
/** Mirrors analytics.person_dimensions() (0113 §0.5): never a cohort dimension, never a grouping. */
export const PERSON_DIMENSIONS = ['principal', 'principal_id', 'person', 'user', 'user_id', 'actor', 'actor_id', 'owner', 'owner_principal_id', 'acknowledged_by', 'approver', 'approved_by',
  'reviewer', 'reviewed_by', 'assignee', 'employee', 'login', 'login_name', 'email', 'display_name', 'decided_by', 'closed_by', 'created_by'] as const;
export const PURPOSE_KINDS = ['product_improvement', 'mission_outcome', 'governance', 'reliability', 'cost'] as const;

/** Every B92 noun (the error rows in observation-errors.ts `B92 §0` cover exactly these). */
export type AnalyticsNoun =
  | 'metric computation' | 'metric definition' | 'analytics purpose' | 'analytics scope' | 'metric use' | 'semantic object'
  | 'cohort comparison' | 'cost reconciliation'
  | 'telemetry definition' | 'telemetry event' | 'consent' | 'ux experiment' | 'experience finding' | 'experience action' | 'experience journey'
  | 'experience segment' | 'experience baseline' | 'analytics export'
  | 'operating review';

const CODE = (s: number) => (s === 403 ? 'EYE_AUT_001' : s === 404 ? 'EYE_STA_001' : s === 409 ? 'EYE_STA_002' : 'EYE_REQ_001');
/** A refusal in the class form, answered by a route before any port runs (the caller's own request). */
export function refuseAnalytics(noun: AnalyticsNoun, cls: string, message: string, correlationId: string, status = 422): HttpException {
  return new HttpException(errorBody(CODE(status) as never, correlationId, `${noun} rejected (${cls}): ${message}`), status);
}

/** The named periods (0113 §0.5 analytics.period_window): a calendar quarter, a calendar month, or N days ending with a day. */
export const PERIOD_RE = /^([0-9]{4}-Q[1-4]|[0-9]{4}-(0[1-9]|1[0-2])|R[0-9]{1,4}@[0-9]{4}-[0-9]{2}-[0-9]{2})$/;
/** The quarter before the one containing `at` (the scene's "last quarter"). */
export function previousQuarter(at: Date): string {
  const y = at.getUTCFullYear(); const q = Math.floor(at.getUTCMonth() / 3) + 1;
  return q === 1 ? `${y - 1}-Q4` : `${y}-Q${q - 1}`;
}
