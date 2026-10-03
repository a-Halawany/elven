import { describe, expect, it } from 'vitest';
import { admissionLine, budgetUseLine, eventLine, partialLine, progressLine, runLine, stabilityLine, stateMark } from './orchestration-b31';

/** CP-6 B31 §O (0099): the simulation center WORDS the server's record — it never counts a path, judges stability or decides a stop. SYNTHETIC. */
describe('the simulation center is worded, never judged on the client', () => {
  it('a state is a glyph, a token and words — never colour alone', () => {
    expect(stateMark('declared').text).toMatch(/other than the declarer/);
    expect(stateMark('paused')).toMatchObject({ glyph: '❚❚', token: '--eye-color-warning', text: expect.stringMatching(/last checkpoint/) });
    expect(stateMark('partial').text).toMatch(/diagnostic only/);
    expect(stateMark('odd').text).toBe('ODD');
  });
  it('the budget, the progress and the admission are the server\'s counts', () => {
    expect(budgetUseLine({ paths: { done: 2500, declared: 5000, approved_max: 5000 }, wall_seconds: { used: 3.2, approved_max: 900 }, chunk_executions: { used: 5, approved_max: 14 } }))
      .toBe('paths 2500/5000 (approved ≤ 5000) · wall 3.2 s of 900 s · chunk executions 5 of 14');
    expect(budgetUseLine(undefined)).toBe('no budget use recorded');
    expect(progressLine({ paths: 5000, chunks_total: 10, progress: { paths_done: 2500, chunks_done: 5, executions: 5, wall_ms: 3200, failures: 0 } })).toBe('2500 of 5000 paths (50%) · 5 of 10 chunks · 0 chunk failure(s)');
    expect(admissionLine({ admitted: true, reasons: [], capacity: 2, in_use: 0, deterministic: true, chunks: 10, checked_at: 'x' })).toBe('ADMITTED — deterministic (10 chunks), capacity 0/2 in use before this one');
    expect(admissionLine({ admitted: false, reasons: ['capacity: 2 of 2 concurrent experiments of this domain are running or paused'], capacity: 2, in_use: 2, deterministic: true, chunks: 2, checked_at: 'x' })).toMatch(/^REFUSED — capacity: 2 of 2/);
    expect(admissionLine(null)).toBe('not yet admitted');
  });
  it('numerical stability keeps the server\'s verdict and figures', () => {
    expect(stabilityLine({ measure: 'total_cost', n: 12, state: 'indeterminate', rule: 'sio-stability@1' })).toBe('total_cost: INDETERMINATE (12 path(s); at least 30 are needed)');
    expect(stabilityLine({ measure: 'line_stop_days', n: 2500, mean: 21.4, ci_half_width: 0.31, relative_half_width: 0.0145, change_since_previous: 0.004, state: 'stable', rule: 'sio-stability@1' }))
      .toBe('line_stop_days: STABLE — mean 21.4 ± 0.31 (95%; 1.45% of the mean) over 2500 paths · moved 0.40% since the previous checkpoint');
    expect(stabilityLine(undefined)).toBe('not measured yet');
  });
  it('a partial run says why it stopped and what is missing — the server\'s declaration', () => {
    const p = { reason: 'budget_exceeded', completed_paths: 750, declared_paths: 1000, missing_paths: [{ chunk_index: 3, from_path: 750, to_path: 999, state: 'failed' }], missing_outputs: ['x'], decision_use: 'diagnostic only: a partial run is never decision-active' };
    expect(partialLine(p)).toBe('PARTIAL (budget_exceeded) — 750 of 1000 paths completed; missing paths 750–999; diagnostic only: a partial run is never decision-active');
    expect(runLine({ run_id: '0190f3e2-aaaa-7000-8000-000000000001', state: 'partial', validity: 'valid', fitness_state: 'none', partial: p, outputs_digest: 'a'.repeat(64), samples: 1000, seed: 31, failure: null }))
      .toMatch(/^run 0190f3e2…000001 PARTIAL — PARTIAL \(budget_exceeded\)/);
    expect(runLine({ run_id: '0190f3e2-aaaa-7000-8000-000000000001', state: 'completed', validity: 'invalidated', fitness_state: 'unfit', partial: null, outputs_digest: 'b'.repeat(64), samples: 5000, seed: 31, failure: null }))
      .toBe('run 0190f3e2…000001 COMPLETED · INVALIDATED — 5000 paths, outputs bbbbbbbbbbbb…');
    expect(runLine(null)).toBe('no run opened yet');
  });
  it('the ledger in words', () => {
    expect(eventLine({ event: 'checkpointed', details: { seq: 5, chunk_index: 4, paths_done: 2500, declared_paths: 5000 } })).toBe('checkpoint 5 — chunk 4, 2500/5000 paths');
    expect(eventLine({ event: 'chunk_failed', details: { chunk_index: 1, attempt: 3, final: true, error: 'boom' } })).toBe('chunk 1 failed (attempt 3, final) — boom');
    expect(eventLine({ event: 'paused', details: { reason: 'halfway review' } })).toBe('paused — halfway review');
    expect(eventLine({ event: 'run_opened', details: {} })).toBe('run opened');
  });
});
