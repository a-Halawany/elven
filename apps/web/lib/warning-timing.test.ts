import { describe, expect, it } from 'vitest';
import { RESPONSE_TIMING_LABEL, RESPONSE_TIMING_TOKEN, responseTiming } from './warning-timing';

/**
 * The defect this closes: `response_timely === false` meant late and EVERYTHING
 * else rendered "acknowledged in time" — so a pre-0031 acknowledgement with a
 * NULL field, or a record without the field, gained a positive claim the record
 * never made.
 */
describe('response timeliness is three states', () => {
  it('true is in time', () => {
    expect(responseTiming({ response_timely: true })).toBe('in_time');
    expect(RESPONSE_TIMING_LABEL.in_time).toMatch(/in time/);
    expect(RESPONSE_TIMING_TOKEN.in_time).toBe('--eye-color-success');
  });
  it('false is late', () => {
    expect(responseTiming({ response_timely: false })).toBe('late');
    expect(RESPONSE_TIMING_LABEL.late).toMatch(/LATE/);
    expect(RESPONSE_TIMING_TOKEN.late).toBe('--eye-color-critical');
  });
  it('null is UNKNOWN, never in time', () => {
    expect(responseTiming({ response_timely: null })).toBe('unknown');
    expect(RESPONSE_TIMING_LABEL.unknown).not.toMatch(/in time/);
    expect(RESPONSE_TIMING_LABEL.unknown).toMatch(/unknown/);
    expect(RESPONSE_TIMING_TOKEN.unknown).toBe('--eye-color-ink-muted');
  });
  it('absent is UNKNOWN too — a record without the field made no claim', () => {
    expect(responseTiming({})).toBe('unknown');
    expect(responseTiming({ response_timely: undefined })).toBe('unknown');
  });
});
