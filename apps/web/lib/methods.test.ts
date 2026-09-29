import { describe, expect, it } from 'vitest';
import { containmentLine, familyLabel, healthLine, paramsTemplate, parseParams, summaryLines, verdictLine } from './methods';

describe('B29 §C method fabric client helpers', () => {
  it('says the containment and the health as the record states them', () => {
    expect(containmentLine({ isolated: true, timeout_ms: 20000, max_old_space_mb: 256, quarantine_after: 3 })).toBe('out of process · 20 s · 256 MB heap · quarantined after 3 consecutive faults');
    expect(containmentLine({ isolated: false, timeout_ms: 30000, max_old_space_mb: 256, quarantine_after: 3 })).toBe('in process (not contained)');
    expect(healthLine({ state: 'quarantined', consecutive_faults: 3, total_faults: 3, last_fault: { kind: 'memory', message: 'm', run_id: null, probe_id: null, at: 't' } }).text).toMatch(/^QUARANTINED after 3 consecutive faults \(last: memory\)/);
    expect(healthLine({ state: 'healthy', consecutive_faults: 1, total_faults: 4, last_fault: { kind: 'timeout', message: 'm', run_id: null, probe_id: null, at: 't' } }).text).toBe('healthy · 1 consecutive fault (last: timeout)');
    expect(healthLine({ state: 'healthy', consecutive_faults: 0, total_faults: 0 }).text).toBe('healthy');
    expect(familyLabel('system-dynamics')).toBe('system dynamics');
    expect(familyLabel('x-custom')).toBe('x-custom');
  });

  it('never shows an indeterminate verdict as a pass', () => {
    expect(verdictLine({ outcome: 'indeterminate', setId: null, setVersion: null, violations: [], reason: 'timed out' })).toBe('constraints INDETERMINATE — not a pass: timed out');
    expect(verdictLine({ outcome: 'violated', setId: 's', setVersion: 1, violations: [{ constraintKey: 'warehouse:regensburg', bound: '≤ 1800 pallets', observed: '2350' }], reason: null }))
      .toBe('constraints VIOLATED: warehouse:regensburg — bound ≤ 1800 pallets, observed 2350');
    expect(verdictLine(null)).toBe('no constraint verdict recorded');
  });

  it('templates and parses the parameters', () => {
    expect(JSON.parse(paramsTemplate('discrete-event@1'))).toEqual({ start_date: '2026-10-05', shortage: { start_day: 7, days: 21, fraction: 0.4 } });
    expect(paramsTemplate('unknown@1')).toBe('{}');
    expect(parseParams('{"a":1}')).toEqual({ ok: true, value: { a: 1 } });
    expect(parseParams('[1]')).toEqual({ ok: false, problem: 'the parameters are a JSON object' });
    expect(parseParams('{')).toMatchObject({ ok: false });
    expect(parseParams('')).toEqual({ ok: true, value: {} });
    expect(summaryLines({ line_stop_days: 18, verdict: null })).toEqual([['line stop days', '18'], ['verdict', '—']]);
  });
});
