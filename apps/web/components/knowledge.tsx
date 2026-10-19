/**
 * B50 — THE KNOWLEDGE CORE's library components (B107's inventory reads top-level components/*.tsx; LIBRARY_B50 in lib/b50-seams.ts
 * declares each part's exports). One marked block per part (§HD, §LC, §PV, §CI, §CL, §TL), folded by the integrator; each arrives
 * `proposed` and the DSA approves it in the act. The decisions are each part's pure model (lib/<name>-b50.ts); a component only renders.
 */

/* B50 hd */
/* §HD (F-P3-01; ES-05-001, ES-26-001/-004) — the TIME VALUE text role and the DECLARED ABSENCE text role: what a header carries, in the
   record's own words (lib/header-b50.ts). A time is stated with its kind, bounds (the days they name, in the zone they were stated in),
   precision, zone and source — an unknown, recurring or conflicting time says so and is never shown as an instant. An absence is shown
   with its state and reason — never blank, never "unresolved"; a version recorded before B50 says so. Both are plain text roles on the
   type tokens (.eye-text-*): no colour carries the meaning, so forced-colors and 200% zoom keep it; logical properties only. */
import { PRE_B50, fieldText, timeValueText } from '../lib/header-b50';
import type { DeclaredAbsence, TimeValue } from '../lib/b50-seams';

export function TimeValueText({ value, label }: { value: TimeValue; label?: string }) {
  const text = timeValueText(value);
  const instant = value.kind === 'exact' || value.kind === 'approximate' ? value.instant ?? null : value.kind === 'bounded' ? value.earliest ?? null : null;
  return (
    <span className="eye-text-timestamp" data-time-kind={value.kind} aria-label={label === undefined ? text : `${label}: ${text}`}>
      {instant !== null && value.kind !== 'bounded' ? <time dateTime={instant}>{text}</time> : text}
    </span>
  );
}

/** A header field that carries no value: its declared absence in words, or "recorded before B50 — not populated" (`absence` null). */
export function DeclaredAbsenceText({ absence, field }: { absence: DeclaredAbsence | null; field?: string }) {
  const text = absence === null ? PRE_B50 : fieldText({ kind: 'absent', absence });
  return (
    <span className="eye-text-fact" data-absence={absence === null ? 'pre_b50' : absence.state} aria-label={field === undefined ? text : `${field}: ${text}`}>
      {text}
    </span>
  );
}
/* end B50 hd */
