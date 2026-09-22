/**
 * DECISION EVENTS — CP-6 B18 (0078, L9-I02, L9-I04, L9-I05): the three published events of the decision lifecycle,
 * built PURE from what the write holds and enqueued by the transaction that makes the transition (ES-19-001):
 *
 *   DecisionPackageReady@v1   the propose route — the proposed version by digest: its objectives, the options with the
 *                             uncertainty the port DERIVED (0049: citations, synthetic inputs, unvalidated and
 *                             outside-envelope runs, truth states — never the caller's), the alternatives as cited
 *                             runs, the choice, the dissent recorded on the version, the provenance (every distinct
 *                             citation by kind, id and version), the approver policy, the monitoring conditions and,
 *                             after a reopen, the commitment the draft was carried from;
 *   DecisionCommitted@v1      the commit route — the commitment by id: who committed, the live approvals the port
 *                             counted, the C3 class and bound action, the policy decision, the instant, the CMT as the
 *                             commitment record with what it rests on, the conditions to monitor, the EXECUTION
 *                             HANDOFF stated honestly (the CMT is the record; no execution interface exists —
 *                             AU-DEC-0020 stays open) and the replay snapshot (the digest a replay reconstructs, on
 *                             demand through decision.replay);
 *   DecisionReopened@v1       the reopen route — the standing commitment, the new draft, the carried and DROPPED
 *                             options (each drop named with the port's reason: a withdrawn forecast, an invalidated
 *                             run), the exposed inputs. TWO cause keys, on purpose: `recorded_cause` is the RECORDED
 *                             cause the owner named (the input.invalidated note or the condition breach, as the port
 *                             read it); `cause` is the governed act, as on every event.
 *
 * Ids, versions and digests — never bodies; every list that can grow is cut at LIFECYCLE_EVENT_LIST_MAX with
 * `truncated` said (D20). No read happens here.
 */
import { LIFECYCLE_EVENT_LIST_MAX, type OutboxRow } from '../graph/subscriptions/change-events.js';

type Row = Record<string, unknown>;
const cut = <T>(xs: T[]): T[] => xs.slice(0, LIFECYCLE_EVENT_LIST_MAX);
const over = (xs: unknown[]): boolean => xs.length > LIFECYCLE_EVENT_LIST_MAX;
const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));
const str = (v: unknown): string | null => (v === null || v === undefined ? null : String(v));
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strArr = (v: unknown): string[] => arr(v).map(String);

/** One citation as an option records it (0049: kind, id, version, digest). */
export interface Consequence { kind: string; id: string; version: number }
/** An option as the propose write read it, with the uncertainty the port derived. */
export interface ReadyOption { key: string; kind: string; simulated: boolean; uncertainty: Row; consequences: Consequence[] }

/** A consequence as the event names it — kind, id and version; the digest is on the option row and the DPK header. */
const provenanceOf = (options: ReadyOption[]): Consequence[] => {
  const seen = new Set<string>(); const out: Consequence[] = [];
  for (const o of options) for (const c of o.consequences) {
    const k = `${c.kind}|${c.id}|${c.version}`;
    if (seen.has(k)) continue;
    seen.add(k); out.push({ kind: c.kind, id: c.id, version: Number(c.version) });
  }
  return out;
};

export function decisionPackageReadyEvent(a: {
  packageId: string; version: number; versionDigest: string; headerDigest: string; supersedes: number | null; decisionObjectId: string; title: string;
  knownAt: string; observedThrough: string | null; objectives: string[]; options: ReadyOption[]; choice: Row;
  dissent: Array<{ dissent_id: string; principal_id: string; position: string }>; approverPolicy: Row; monitoringConditions: unknown[];
  baselineRunId: string | null; syntheticState: boolean; reopenedFrom: { version: number; commitment_id: string | null } | null;
  actor: string; occurredAt: string;
}): OutboxRow {
  const provenance = provenanceOf(a.options);
  const dissentIds = a.dissent.map((d) => d.dissent_id);
  const options = a.options.map((o) => {
    const u = o.uncertainty ?? {};
    return {
      key: o.key, kind: o.kind, simulated: o.simulated,
      uncertainty: { citations: num(u['citations']), synthetic_inputs: num(u['synthetic_inputs']), unvalidated_runs: num(u['unvalidated_runs']), outside_envelope_runs: num(u['outside_envelope_runs']), truth_states: strArr(u['truth_states']) },
      cited_runs: o.consequences.filter((c) => c.kind === 'run').map((c) => c.id),
      cited: o.consequences.length,
    };
  });
  const policy = a.approverPolicy ?? {};
  const kinds = [...new Set(a.monitoringConditions.map((c) => str((c as Row)['kind']) ?? 'unknown'))].sort();
  return {
    eventType: 'DecisionPackageReady',
    payload: {
      schema: 'DecisionPackageReady', schema_version: 'v1',
      package_id: a.packageId, version: a.version, version_digest: a.versionDigest, header_digest: a.headerDigest, supersedes: a.supersedes,
      decision_object_id: a.decisionObjectId, title: a.title, known_at: a.knownAt, observed_through: a.observedThrough,
      objectives: { count: a.objectives.length, ids: cut(a.objectives) },
      options: cut(options),
      choice: {
        option_key: str(a.choice['option_key']), action_owner: str(a.choice['action_owner']), decision_deadline: str(a.choice['decision_deadline']),
        outcome_criteria: arr(a.choice['outcome_criteria']).length, accepted_trade_offs: arr(a.choice['accepted_trade_offs']).length,
      },
      dissent: { count: a.dissent.length, ids: cut(dissentIds) },
      provenance: cut(provenance),
      approver_policy: { quorum: num(policy['quorum']), roles: arr(policy['roles']).length, principals: arr(policy['principals']).length, expires_after_days: num(policy['expires_after_days']) },
      monitoring_conditions: { count: a.monitoringConditions.length, kinds },
      baseline_run_id: a.baselineRunId, synthetic_state: a.syntheticState, reopened_from: a.reopenedFrom,
      truncated: over(a.objectives) || over(options) || over(dissentIds) || over(provenance),
      temporal: { known_at: a.occurredAt },
      cause: { action: 'decision.package.propose', actor: a.actor, target_type: 'DPK', target_id: a.packageId },
    },
  };
}

export function decisionCommittedEvent(a: {
  packageId: string; version: number; versionDigest: string; commitmentId: string; committedBy: string;
  approvals: Array<{ approval_id: string; approver: string }>; opClass: string; boundAction: string; policyDecisionId: string | null; decidedAt: string;
  choice: Row; decisionObjectId: string; objectives: string[]; runs: string[]; baselineRunId: string | null; monitoringConditions: unknown[];
  cmtHeaderDigest: string; reopenedFrom: Row | null; actor: string;
}): OutboxRow {
  const conditions = a.monitoringConditions.map((c, i) => {
    const r = c as Row;
    return { index: i, kind: str(r['kind']), ref: str(r['indicator_id']) ?? str(r['branch_id']) ?? null, owner: str(r['owner']) };
  });
  return {
    eventType: 'DecisionCommitted',
    payload: {
      schema: 'DecisionCommitted', schema_version: 'v1',
      package_id: a.packageId, version: a.version, version_digest: a.versionDigest, commitment_id: a.commitmentId, committed_by: a.committedBy,
      approvals: cut(a.approvals), op_class: a.opClass, bound_action: a.boundAction, policy_decision_id: a.policyDecisionId, decided_at: a.decidedAt,
      choice: { option_key: str(a.choice['option_key']), action_owner: str(a.choice['action_owner']), decision_deadline: str(a.choice['decision_deadline']), outcome_criteria: arr(a.choice['outcome_criteria']).length },
      commitments: [{ strategy_object_id: a.commitmentId, object_type: 'CMT', rests_on: { decision: a.decisionObjectId, objectives: cut(a.objectives), runs: cut(a.runs), baseline_run_id: a.baselineRunId } }],
      monitoring_conditions: cut(conditions),
      execution_handoff: { bound_action: a.boundAction, op_class: a.opClass, interface: null, statement: 'the CMT is the handoff record; no execution interface exists (AU-DEC-0020: the open execution-interface unit)' },
      replay_snapshot: { as_of: a.decidedAt, version_digest: a.versionDigest, cmt_header_digest: a.cmtHeaderDigest, recorded_on_demand: 'decision.replay' },
      reopened_from: a.reopenedFrom,
      truncated: over(a.approvals) || over(a.objectives) || over(a.runs) || over(conditions),
      temporal: { known_at: a.decidedAt },
      cause: { action: 'decision.commit', actor: a.actor, target_type: 'CMT', target_id: a.commitmentId },
    },
  };
}

/**
 * The reopen, from the port's answer (decision.reopen_package): `recorded_cause` is the cause the owner NAMED and the
 * port read (the note or the breach, with what it recorded); `cause` is the governed act.
 */
export function decisionReopenedEvent(a: { reopened: Row; packageId: string; decisionObjectId: string; actor: string; occurredAt: string }): OutboxRow {
  const r = a.reopened;
  const carried = strArr(r['options_carried']);
  const dropped = arr(r['options_dropped']).map((d) => ({ key: str((d as Row)['key']), reason: str((d as Row)['reason']) }));
  const exposed = arr(r['exposed_inputs']);
  return {
    eventType: 'DecisionReopened',
    payload: {
      schema: 'DecisionReopened', schema_version: 'v1',
      package_id: a.packageId, decision_object_id: a.decisionObjectId,
      committed_version: num(r['committed_version']), commitment_id: str(r['commitment_id']), committed_at: str(r['committed_at']), new_version: num(r['new_version']),
      recorded_cause: (r['cause'] ?? null) as Row | null,
      exposed_inputs: cut(exposed), options_carried: cut(carried), options_dropped: cut(dropped),
      reopens: num(r['reopens']), known_at: str(r['known_at']), observed_through: str(r['observed_through']),
      truncated: over(exposed) || over(carried) || over(dropped),
      temporal: { known_at: a.occurredAt },
      cause: { action: 'decision.package.reopen', actor: a.actor, target_type: 'DPK', target_id: a.packageId },
    },
  };
}
