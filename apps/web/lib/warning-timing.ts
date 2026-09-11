/**
 * RESPONSE TIMELINESS has three states, not two.
 *
 * `response_timely` was added by migration 0031 as a nullable column. An
 * acknowledgement recorded before it — or any record that simply lacks the
 * field — carries NO claim about whether the answer came before the window
 * closed. Reading "not false" as "in time" would put a positive assertion on a
 * record that never made it. So: true is in time, false is late, and null or
 * absent is acknowledged with the response timing UNKNOWN. Nothing is inferred
 * from the audit clock, and the timestamps are shown as recorded.
 */
export type ResponseTiming = 'in_time' | 'late' | 'unknown';

export function responseTiming(w: { response_timely?: boolean | null }): ResponseTiming {
  if (w.response_timely === true) return 'in_time';
  if (w.response_timely === false) return 'late';
  return 'unknown';
}

export const RESPONSE_TIMING_LABEL: Readonly<Record<ResponseTiming, string>> = Object.freeze({
  in_time: '● acknowledged in time',
  late: '✕ acknowledged LATE',
  unknown: '◍ acknowledged — response timing unknown (not recorded)',
});

export const RESPONSE_TIMING_TOKEN: Readonly<Record<ResponseTiming, string>> = Object.freeze({
  in_time: '--eye-color-success',
  late: '--eye-color-critical',
  unknown: '--eye-color-ink-muted',
});
