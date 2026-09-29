import { describe, expect, it } from 'vitest';
import { COMPENSATION_KINDS, EXCEPTION_KINDS, HANDOFF_STATES, ITEM_STATES, TIMELINE_LANES, attemptWords, byLane, effectWords, parseDeliverables, residualWords, severityMark, stateMark, transportWords } from './commitments';

/** CP-6 B34 part C (0090 §C): the tracker, the handoff and the timeline are the server's; the page words them. */
describe('the commitment tracker is worded, never invented on the client', () => {
  it('the vocabularies are the migration\'s CHECKs', () => {
    expect([...ITEM_STATES]).toEqual(['open', 'in_progress', 'exception', 'retask_required', 'done', 'waived', 'cancelled']);
    expect([...EXCEPTION_KINDS]).toEqual(['deadline_missed', 'blocked', 'partial_effect', 'objective_changed', 'scope_change']);
    expect([...HANDOFF_STATES]).toEqual(['drafted', 'issuing', 'effected', 'partially_effected', 'failed', 'reconciled']);
    expect([...COMPENSATION_KINDS]).toEqual(['reissue_residual', 'cancel_effected', 'alternate_source', 'accept_residual']);
    expect([...TIMELINE_LANES]).toEqual(['commitment', 'resource', 'operational', 'deviation', 'governance']);
  });
  it('a C3 names its reason; a C2 lists what the server said', () => {
    expect(severityMark({ severity: 'C3', reasons: ['undisposed_residual', 'open_exception'] }).text).toBe('C3 — undisposed_residual');
    expect(severityMark({ severity: 'C3', reasons: ['overdue'] }).glyph).toBe('▲');
    expect(severityMark({ severity: 'C2', reasons: [] }).text).toBe('C2');
    expect(severityMark({ severity: 'C2', reasons: ['objective_changed'] }).text).toBe('C2 — objective_changed');
  });
  it('the residual carries its compensation owner (FEX-18)', () => {
    expect(residualWords(null)).toBe('no residual');
    expect(residualWords([{ line_key: 'NDFEB-N52', residual: 500, compensation: null }])).toBe('NDFEB-N52: 500 outstanding — no compensation owner yet');
    // the get route's compensation row names its owner owner_principal_id (the demonstration's walk showed `undefined`, 2026-09-29)
    expect(residualWords([{ line_key: 'brg-6205', residual: 200, compensation: { kind: 'reissue_residual', owner_principal_id: '01a084f6-aaaa', state: 'done' } }])).toBe('brg-6205: 200 outstanding — reissue_residual by 01a084f6… (done)');
    expect(residualWords([{ line_key: 'NDFEB-N52', residual: 500, compensation: { kind: 'reissue_residual', owner: '0190abcd-0000-7000-8000-000000000001', state: 'assigned' } }]))
      .toBe('NDFEB-N52: 500 outstanding — reissue_residual by 0190abcd… (assigned)');
    expect(effectWords({ line_key: 'QUAL-LOT', requested_quantity: '4', effected_quantity: '2', status: 'partial' })).toBe('QUAL-LOT: 2 of 4 effected (2 residual) — partial');
  });
  it('states in three channels; an unbound receipt is evidence, never an effect', () => {
    expect(stateMark('partially_effected').text).toBe('PARTIALLY EFFECTED — RESIDUAL');
    expect(stateMark('retask_required').text).toBe('RE-TASK REQUIRED — OBJECTIVE CHANGED');
    expect(stateMark('in_progress').text).toBe('IN PROGRESS');
    expect(attemptWords({ attempt: 2, outcome: 'unbound', http_status: 200, by_tick: true })).toBe('attempt 2 (the tick): unbound (HTTP 200) — the receipt named another handoff or attempt — kept as evidence, not an effect');
  });
  it('B34-F2: the attempt names the path that carried it (the server\'s record, never inferred)', () => {
    expect(attemptWords({ attempt: 1, outcome: 'partial', http_status: 200, by_tick: false, transport: 'synthetic-loopback' }))
      .toBe('attempt 1: partial (HTTP 200) — part of the lines effected · via the SYNTHETIC loopback path (the deployment switch on; a synthetic target, no real ERP)');
    expect(attemptWords({ attempt: 1, outcome: 'transport', http_status: null, by_tick: false, transport: 'production' })).toBe('attempt 1: transport — no receipt — retried with backoff · via the production egress (vetted)');
    expect(transportWords(null)).toBe('');
    expect(transportWords('anything else')).toBe('');
  });
  it('the timeline in the five lanes, each in time order', () => {
    const lanes = byLane([{ lane: 'operational', at: '2026-09-28T10:00:02Z' }, { lane: 'governance', at: '2026-09-28T09:00:00Z' }, { lane: 'operational', at: '2026-09-28T10:00:01Z' }]);
    expect(lanes.map((l) => l.lane)).toEqual(['commitment', 'resource', 'operational', 'deviation', 'governance']);
    expect(lanes[2]!.rows.map((r) => r.at)).toEqual(['2026-09-28T10:00:01Z', '2026-09-28T10:00:02Z']);
  });
  it('deliverables are "title — evidence"; a line without evidence is refused', () => {
    expect(parseDeliverables('Second source live — ERP receipts SYN-PR')).toEqual({ ok: true, deliverables: [{ title: 'Second source live', evidence: 'ERP receipts SYN-PR' }] });
    expect(parseDeliverables('').ok).toBe(false);
    expect(parseDeliverables('Second source live').ok).toBe(false);
  });
});
