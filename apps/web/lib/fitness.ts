/**
 * CP-6 B21 (0081) — the fitness, coherence and envelope vocabularies as the SERVER states them, rendered as glyph + label +
 * token (never colour alone, GLB-09). Nothing here derives a state: a row from a server before 0081 carries no state and
 * reads as the honest default (`none` / `unchecked` / `unrecorded`); the words below are the register's own —
 * fitness `none | fit | unfit | indeterminate`, the classes `calibration_failure | drift | data_shift | envelope_breach`,
 * coherence `unchecked | passed | failed`, the envelope `inside | outside | unchecked | unrecorded`.
 */

export const FITNESS_STATES = ['none', 'fit', 'unfit', 'indeterminate'] as const;
export type FitnessState = (typeof FITNESS_STATES)[number];
export const FITNESS_CLASSES = ['calibration_failure', 'drift', 'data_shift', 'envelope_breach'] as const;
export type FitnessClass = (typeof FITNESS_CLASSES)[number];
export const COHERENCE_STATES = ['unchecked', 'passed', 'failed'] as const;
export type CoherenceState = (typeof COHERENCE_STATES)[number];
export const ENVELOPE_STATES = ['inside', 'outside', 'unchecked', 'unrecorded'] as const;
export type EnvelopeState = (typeof ENVELOPE_STATES)[number];

export interface Badge { glyph: string; token: string; text: string }

/** The state as the row carries it; anything else (absent, null, a word outside the vocabulary) is `none` — the server never said. */
export function fitnessOf(v: unknown): FitnessState {
  return (FITNESS_STATES as readonly string[]).includes(String(v)) ? (v as FitnessState) : 'none';
}
export function coherenceOf(v: unknown): CoherenceState {
  return (COHERENCE_STATES as readonly string[]).includes(String(v)) ? (v as CoherenceState) : 'unchecked';
}
export function envelopeOf(v: unknown): EnvelopeState {
  return (ENVELOPE_STATES as readonly string[]).includes(String(v)) ? (v as EnvelopeState) : 'unrecorded';
}

/**
 * The fitness flag of one of the three foresight objects. A twin version's `unfit` disables its behaviours (no run opens on it);
 * a forecast's `unfit` names its class; a run's `fit` names the use it was promoted for (OBJ-29) and its `unfit` is an invalidation.
 */
export function fitnessLabel(
  row: { fitness_state?: unknown; fitness_class?: unknown; promoted_for?: unknown } | null | undefined,
  subject: 'twin' | 'forecast' | 'run',
): Badge {
  const state = fitnessOf(row?.fitness_state);
  if (state === 'fit') {
    return subject === 'run'
      ? { glyph: '●', token: '--eye-color-success', text: `fit for ${String(row?.promoted_for ?? 'a use the row does not name')}` }
      : { glyph: '●', token: '--eye-color-success', text: 'FIT' };
  }
  if (state === 'unfit') {
    return subject === 'twin' ? { glyph: '✕', token: '--eye-color-critical', text: 'UNFIT — behaviours disabled' }
      : subject === 'forecast' ? { glyph: '✕', token: '--eye-color-critical', text: `UNFIT (${String(row?.fitness_class ?? 'class not recorded')})` }
      : { glyph: '✕', token: '--eye-color-critical', text: 'UNFIT' };
  }
  if (state === 'indeterminate') return { glyph: '◍', token: '--eye-color-warning', text: 'INDETERMINATE' };
  return subject === 'twin' ? { glyph: '◍', token: '--eye-color-ink-muted', text: 'not validated' }
    : subject === 'forecast' ? { glyph: '◍', token: '--eye-color-ink-muted', text: 'not assessed' }
    : { glyph: '—', token: '--eye-color-ink-muted', text: '—' };
}

/** A scenario's coherence flag: a FAILED scenario is admitted, never refused, and is not decision-active until a review resolves it. */
export function coherenceLabel(state: unknown): Badge {
  const s = coherenceOf(state);
  if (s === 'passed') return { glyph: '●', token: '--eye-color-success', text: 'PASSED' };
  if (s === 'failed') return { glyph: '✕', token: '--eye-color-critical', text: 'FAILED' };
  return { glyph: '◍', token: '--eye-color-ink-muted', text: 'unchecked' };
}

/**
 * A run's OWN contract against the behaviour model's operating envelope (twin.envelope_check at open_run) — a different fact from
 * the sensitivity's `outside_envelope` (a perturbation left the envelope). `outside` is admitted only under a recorded acknowledgement.
 */
export function envelopeLine(row: { envelope_state?: unknown; envelope_ack?: unknown } | null | undefined): string {
  const s = envelopeOf(row?.envelope_state);
  if (s === 'outside') {
    const ack = (row?.envelope_ack ?? null) as { acknowledged_by?: unknown; reason?: unknown } | null;
    const by = typeof ack?.acknowledged_by === 'string' ? `${ack.acknowledged_by.slice(0, 8)}…` : 'nobody named';
    return `envelope OUTSIDE (acknowledged by ${by}${typeof ack?.reason === 'string' ? `: ${ack.reason}` : ''})`;
  }
  if (s === 'inside') return 'envelope inside';
  if (s === 'unchecked') return 'envelope unchecked (no numeric value to judge)';
  return 'envelope unrecorded (opened before 0081)';
}

/** One line per envelope key of a recorded check, verbatim from the port: `key = value verdict [lo, hi] (from source)`. */
export function envelopeKeyLines(envelope: { keys?: unknown } | null | undefined): string[] {
  const keys = (envelope?.keys ?? {}) as Record<string, { range?: unknown; value?: unknown; source?: unknown; verdict?: unknown }>;
  return Object.keys(keys).sort().map((k) => {
    const e = keys[k] ?? {};
    const range = Array.isArray(e.range) && e.range.length === 2 ? `[${String(e.range[0])}, ${String(e.range[1])}]` : '[no range]';
    const value = e.value === null || e.value === undefined ? 'no value' : String(e.value);
    return `${k} = ${value} ${String(e.verdict ?? 'unchecked')} ${range}${e.source === null || e.source === undefined ? '' : ` (from ${String(e.source)})`}`;
  });
}
