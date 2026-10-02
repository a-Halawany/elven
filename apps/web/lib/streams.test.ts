import { describe, expect, it } from 'vitest';
import { LABEL_TEXT, completenessBadges, holdsText, intervalText, windowDays } from './streams';

/** CP-6 B28 (0088 §S): lateness and partiality are never hidden — the badges and words are the server's record, stated. */
describe('the stream page says what the record says', () => {
  it('a window is shown as the days it spans, its last day inclusive', () => {
    expect(windowDays({ window_start: '2024-02-06T00:00:00.000Z', window_end: '2024-02-11T00:00:00.000Z' })).toEqual({ from: '2024-02-06', through: '2024-02-10' });
  });
  it('LATE and PARTIAL are separate badges; a late input counts even on an otherwise complete window', () => {
    expect(completenessBadges({ completeness: 'complete' })).toEqual([]);
    expect(completenessBadges({ completeness: 'partial_incomplete_range' }).map((b) => b.text)).toEqual(['PARTIAL']);
    expect(completenessBadges({ completeness: 'partial_missing_days', late_inputs: 2 }).map((b) => b.text)).toEqual(['PARTIAL', 'LATE']);
    expect(completenessBadges({ completeness: 'late_revised', late_inputs: 5 })).toEqual([{ text: 'LATE', why: '5 input(s) arrived after the watermark passed; the window was revised' }]);
    expect(completenessBadges({ completeness: 'late_excluded', late_excluded: 1 })[0]?.why).toMatch(/beyond the allowed lateness: stored and shown, not evaluated/);
  });
  it('the predicate answers true, false or undetermined; intervals read in words', () => {
    expect(holdsText(true)).toBe('✓ holds');
    expect(holdsText(false)).toBe('✕ does not hold');
    expect(holdsText(null)).toMatch(/undetermined/);
    expect(intervalText({ days: 8 })).toBe('8 days');
    expect(intervalText('8 days')).toBe('8 days');
    expect(intervalText(null)).toBe('—');
    expect(LABEL_TEXT.late_window).toMatch(/^LATE window/);
    expect(LABEL_TEXT.partial_window).toMatch(/^PARTIAL window/);
  });
});
