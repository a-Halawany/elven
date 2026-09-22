/**
 * The decision lifecycle's three published events at the function boundary (CP-6 B18; design §2.5, D20): DecisionPackageReady
 * pinned key by key on a two-option fixture (the derived uncertainty counts, the cited runs, the distinct provenance, the
 * choice, the dissent, the policy and conditions) and cut at 200 provenance citations with `truncated` said; DecisionCommitted
 * with the CMT as the commitment record, the conditions, the handoff statement and the replay snapshot; DecisionReopened from
 * the port's answer with its TWO cause keys (the recorded cause and the governed act). No database.
 */
import { describe, expect, it } from 'vitest';
import { decisionCommittedEvent, decisionPackageReadyEvent, decisionReopenedEvent, type ReadyOption } from '../../../src/decision/decision-events.js';

let counter = 0;
const uid = (): string => { counter += 1; const h = counter.toString(16).padStart(12, '0'); return `0190b1c2-d3e4-7000-8000-${h}`; };
const P = uid(); const DEC = uid(); const OBJ = uid(); const CTL = uid(); const RER = uid(); const FCT = uid(); const EVD = uid(); const OWNER = uid(); const AUTH = uid();
const APR = uid(); const APPROVER = uid(); const CMT = uid(); const IND = uid(); const DIS = uid(); const NOTE = uid(); const POL = uid();
const AT = '2026-09-17T10:00:00.000Z'; const DIGEST = 'c'.repeat(64); const HEADER = 'd'.repeat(64);

const uncertainty = (over: Record<string, unknown> = {}) => ({ method: 'derived-at-port@2', citations: 2, synthetic_inputs: 2, unvalidated_runs: 0, outside_envelope_runs: 0, truth_states: ['asserted', 'observed'], basis: [{ kind: 'run' }], ...over });
const options = (): ReadyOption[] => [
  { key: 'reroute', kind: 'intervention', simulated: true, uncertainty: uncertainty({ citations: 3 }), consequences: [{ kind: 'run', id: RER, version: 1 }, { kind: 'forecast', id: FCT, version: 1 }, { kind: 'evidence', id: EVD, version: 2 }] },
  { key: 'status-quo', kind: 'status_quo', simulated: true, uncertainty: uncertainty({ citations: 1, truth_states: ['asserted'] }), consequences: [{ kind: 'run', id: CTL, version: 1 }] },
];
const choice = () => ({ option_key: 'reroute', rationale: 'The reroute keeps the line running.', decision_deadline: '2024-01-19', accepted_trade_offs: ['+14 days', '+48,100'], action_owner: OWNER, outcome_criteria: [{ key: 'line_stop_days' }] });
const conditions = () => [{ kind: 'indicator', indicator_id: IND, owner: OWNER, note: 'corridor transits below 40' }, { kind: 'review', every_days: 7, owner: OWNER }];

describe('B18 · decisionPackageReadyEvent', () => {
  const args = () => ({
    packageId: P, version: 1, versionDigest: DIGEST, headerDigest: HEADER, supersedes: null, decisionObjectId: DEC, title: 'Reroute SYN-SHIP-4472',
    knownAt: '2024-01-17T12:00:00.000Z', observedThrough: '2024-01-17', objectives: [OBJ], options: options(), choice: choice(),
    dissent: [{ dissent_id: DIS, principal_id: APPROVER, position: 'against' }], approverPolicy: { quorum: 1, principals: [APPROVER], expires_after_days: 14 },
    monitoringConditions: conditions(), baselineRunId: CTL, syntheticState: true, reopenedFrom: null, actor: OWNER, occurredAt: AT,
  });
  it('the proposal announced, key by key: the derived uncertainty counts, the cited runs, the choice, the dissent, the distinct provenance, the policy and the conditions', () => {
    const row = decisionPackageReadyEvent(args());
    expect(row.eventType).toBe('DecisionPackageReady');
    expect(row.payload).toEqual({
      schema: 'DecisionPackageReady', schema_version: 'v1',
      package_id: P, version: 1, version_digest: DIGEST, header_digest: HEADER, supersedes: null, decision_object_id: DEC, title: 'Reroute SYN-SHIP-4472',
      known_at: '2024-01-17T12:00:00.000Z', observed_through: '2024-01-17',
      objectives: { count: 1, ids: [OBJ] },
      options: [
        { key: 'reroute', kind: 'intervention', simulated: true, uncertainty: { citations: 3, synthetic_inputs: 2, unvalidated_runs: 0, outside_envelope_runs: 0, truth_states: ['asserted', 'observed'] }, cited_runs: [RER], cited: 3 },
        { key: 'status-quo', kind: 'status_quo', simulated: true, uncertainty: { citations: 1, synthetic_inputs: 2, unvalidated_runs: 0, outside_envelope_runs: 0, truth_states: ['asserted'] }, cited_runs: [CTL], cited: 1 },
      ],
      choice: { option_key: 'reroute', action_owner: OWNER, decision_deadline: '2024-01-19', outcome_criteria: 1, accepted_trade_offs: 2 },
      dissent: { count: 1, ids: [DIS] },
      provenance: [{ kind: 'run', id: RER, version: 1 }, { kind: 'forecast', id: FCT, version: 1 }, { kind: 'evidence', id: EVD, version: 2 }, { kind: 'run', id: CTL, version: 1 }],
      approver_policy: { quorum: 1, roles: 0, principals: 1, expires_after_days: 14 },
      monitoring_conditions: { count: 2, kinds: ['indicator', 'review'] },
      baseline_run_id: CTL, synthetic_state: true, reopened_from: null, truncated: false,
      temporal: { known_at: AT },
      cause: { action: 'decision.package.propose', actor: OWNER, target_type: 'DPK', target_id: P },
    });
  });
  it('a reopened draft names the commitment it was carried from; a port count arriving as a string is a number', () => {
    const p = decisionPackageReadyEvent({ ...args(), version: 2, supersedes: 1, reopenedFrom: { version: 1, commitment_id: CMT },
      options: [{ key: 'wait', kind: 'intervention', simulated: false, uncertainty: uncertainty({ citations: '1', synthetic_inputs: '0' }), consequences: [{ kind: 'assumption', id: OBJ, version: 1 }] }] }).payload;
    expect(p).toMatchObject({ version: 2, supersedes: 1, reopened_from: { version: 1, commitment_id: CMT } });
    expect(p['options']).toEqual([{ key: 'wait', kind: 'intervention', simulated: false, uncertainty: { citations: 1, synthetic_inputs: 0, unvalidated_runs: 0, outside_envelope_runs: 0, truth_states: ['asserted', 'observed'] }, cited_runs: [], cited: 1 }]);
  });
  it('the ceiling: 250 distinct provenance citations → 200 listed, truncated said; a repeated citation counts once', () => {
    const many: ReadyOption[] = [{ key: 'wide', kind: 'intervention', simulated: false, uncertainty: uncertainty(), consequences: Array.from({ length: 250 }, () => ({ kind: 'evidence', id: uid(), version: 1 })) }];
    const first = (many[0] as ReadyOption).consequences[0] as { kind: string; id: string; version: number };
    const p = decisionPackageReadyEvent({ ...args(), options: [...many, { key: 'status-quo', kind: 'status_quo', simulated: false, uncertainty: uncertainty(), consequences: [{ ...first }] }] }).payload;
    expect(p['provenance']).toHaveLength(200);
    expect(p['truncated']).toBe(true);
    expect((p['options'] as unknown[]).length).toBe(2);
  });
});

describe('B18 · decisionCommittedEvent', () => {
  it('the commitment announced: the CMT as the commitment record with what it rests on, the conditions, the handoff statement, the replay snapshot, the cause on the CMT', () => {
    const row = decisionCommittedEvent({
      packageId: P, version: 1, versionDigest: DIGEST, commitmentId: CMT, committedBy: AUTH, approvals: [{ approval_id: APR, approver: APPROVER }], opClass: 'C3', boundAction: 'decision.commit',
      policyDecisionId: POL, decidedAt: '2026-09-17T10:00:00.123456+00:00', choice: choice(), decisionObjectId: DEC, objectives: [OBJ], runs: [RER], baselineRunId: CTL,
      monitoringConditions: conditions(), cmtHeaderDigest: HEADER, reopenedFrom: null, actor: AUTH,
    });
    expect(row.eventType).toBe('DecisionCommitted');
    expect(row.payload).toEqual({
      schema: 'DecisionCommitted', schema_version: 'v1',
      package_id: P, version: 1, version_digest: DIGEST, commitment_id: CMT, committed_by: AUTH, approvals: [{ approval_id: APR, approver: APPROVER }],
      op_class: 'C3', bound_action: 'decision.commit', policy_decision_id: POL, decided_at: '2026-09-17T10:00:00.123456+00:00',
      choice: { option_key: 'reroute', action_owner: OWNER, decision_deadline: '2024-01-19', outcome_criteria: 1 },
      commitments: [{ strategy_object_id: CMT, object_type: 'CMT', rests_on: { decision: DEC, objectives: [OBJ], runs: [RER], baseline_run_id: CTL } }],
      monitoring_conditions: [{ index: 0, kind: 'indicator', ref: IND, owner: OWNER }, { index: 1, kind: 'review', ref: null, owner: OWNER }],
      execution_handoff: { bound_action: 'decision.commit', op_class: 'C3', interface: null, statement: 'the CMT is the handoff record; no execution interface exists (AU-DEC-0020: the open execution-interface unit)' },
      replay_snapshot: { as_of: '2026-09-17T10:00:00.123456+00:00', version_digest: DIGEST, cmt_header_digest: HEADER, recorded_on_demand: 'decision.replay' },
      reopened_from: null, truncated: false,
      temporal: { known_at: '2026-09-17T10:00:00.123456+00:00' },
      cause: { action: 'decision.commit', actor: AUTH, target_type: 'CMT', target_id: CMT },
    });
  });
  it('a second commitment after a reopen carries the port\'s reopened_from; a branch condition\'s ref is its branch', () => {
    const p = decisionCommittedEvent({
      packageId: P, version: 2, versionDigest: DIGEST, commitmentId: CMT, committedBy: AUTH, approvals: [], opClass: 'C3', boundAction: 'decision.commit', policyDecisionId: null, decidedAt: AT,
      choice: choice(), decisionObjectId: DEC, objectives: [], runs: [], baselineRunId: null, monitoringConditions: [{ kind: 'branch', branch_id: IND }], cmtHeaderDigest: HEADER,
      reopenedFrom: { version: 1, reopens: 1, cause: { kind: 'input_invalidated', ref: NOTE } }, actor: AUTH,
    }).payload;
    expect(p).toMatchObject({ version: 2, reopened_from: { version: 1, reopens: 1, cause: { kind: 'input_invalidated', ref: NOTE } }, policy_decision_id: null, monitoring_conditions: [{ index: 0, kind: 'branch', ref: IND, owner: null }] });
  });
});

describe('B18 · decisionReopenedEvent', () => {
  it('from the port\'s answer: the standing commitment, the new draft, the carried and dropped options, the exposed inputs; recorded_cause beside the governed cause', () => {
    const reopened = {
      package_id: P, committed_version: 1, commitment_id: CMT, committed_at: '2026-09-17T09:00:00.000000+00:00', new_version: 2,
      cause: { kind: 'input_invalidated', ref: NOTE, recorded_at: '2026-09-17T09:30:00+00:00', change_kind: 'forecast.withdrawn', via: [{ kind: 'forecast', id: FCT }], failure_class: 'material_change', disposition: 'compensation', note: 'forecast withdrawn', outbox_event_id: uid() },
      exposed_inputs: [{ kind: 'forecast', id: FCT }], options_carried: ['status-quo'], options_dropped: [{ key: 'reroute', reason: 'reopen: carried option reroute: run x was invalidated at y (reproduction: unreproducible)' }],
      reopened_at: AT, reopens: 1, known_at: '2026-09-17T10:00:00+00:00', observed_through: '2024-01-17',
    };
    const row = decisionReopenedEvent({ reopened, packageId: P, decisionObjectId: DEC, actor: OWNER, occurredAt: AT });
    expect(row.eventType).toBe('DecisionReopened');
    expect(row.payload).toEqual({
      schema: 'DecisionReopened', schema_version: 'v1',
      package_id: P, decision_object_id: DEC, committed_version: 1, commitment_id: CMT, committed_at: '2026-09-17T09:00:00.000000+00:00', new_version: 2,
      recorded_cause: reopened.cause,
      exposed_inputs: [{ kind: 'forecast', id: FCT }], options_carried: ['status-quo'], options_dropped: [{ key: 'reroute', reason: 'reopen: carried option reroute: run x was invalidated at y (reproduction: unreproducible)' }],
      reopens: 1, known_at: '2026-09-17T10:00:00+00:00', observed_through: '2024-01-17', truncated: false,
      temporal: { known_at: AT },
      cause: { action: 'decision.package.reopen', actor: OWNER, target_type: 'DPK', target_id: P },
    });
    // the two cause keys are distinct on purpose: the recorded one names the note, the governed one the act
    expect((row.payload['recorded_cause'] as { ref: string }).ref).toBe(NOTE);
    expect((row.payload['cause'] as { action: string }).action).toBe('decision.package.reopen');
  });
});
