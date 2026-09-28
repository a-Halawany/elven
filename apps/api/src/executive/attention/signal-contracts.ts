/**
 * B34 (0090 §0) — THE PAYLOAD CONTRACTS of the three outbox events B34 adds, shared by their EMITTERS and their CONSUMER (the attention
 * consumer). Each is written by the owning TypeScript route into the pipeline's `outboxEvents` in the SAME governed write as the port
 * that changed the record (never by a trigger): ExposureChanged@v1 — the exposure ports (the exposures part); HealthScoreChanged@v1 —
 * the health compute route (the attention part); CommitmentChanged@v1 — the commitment and execution ports (the commitments part).
 * The consumer READS THE RECORD the event names; the payload is a hint and is never trusted for the item's facts.
 */
export const EXPOSURE_CHANGE_KINDS = ['assessment_accepted', 'hypothesis_declared', 'sponsored', 'appetite_breached', 'contested', 'outcome_recorded', 'closed'] as const;
export const COMMITMENT_CHANGE_KINDS = ['item.opened', 'item.due_soon', 'item.overdue', 'exception.raised', 'exception.resolved', 'handoff.issued', 'handoff.partial',
  'compensation.assigned', 'compensation.overdue', 'item.retasked', 'reviewer.reassigned', 'closure.proposed', 'closure.cosigned'] as const;
export type ExposureChangeKind = (typeof EXPOSURE_CHANGE_KINDS)[number];
export type CommitmentChangeKind = (typeof COMMITMENT_CHANGE_KINDS)[number];

interface Envelope { schema: string; schema_version: 1; temporal: { known_at: string }; cause: { action: string; actor: string; target_type: string; target_id: string } }

export interface ExposureChangedV1 extends Envelope {
  schema: 'ExposureChanged';
  exposure_id: string; polarity: 'risk' | 'opportunity'; category_key: string; version: number | null;
  change: { kind: ExposureChangeKind; event_id: string };
  owner: string; sponsor: string | null; state: string; objectives: string[];
}
export interface HealthScoreChangedV1 extends Envelope {
  schema: 'HealthScoreChanged';
  change_id: string; snapshot_id: string; prior_snapshot_id: string | null; definition_id: string; definition_version: number;
  subject: string; from_value: number | null; to_value: number | null; delta: number | null; from_band: string | null; to_band: string | null;
  triggers: string[]; direction: string | null; state: string;
}
export interface CommitmentChangedV1 extends Envelope {
  schema: 'CommitmentChanged';
  commitment_id: string; package_id: string; item_id: string | null;
  change: { kind: CommitmentChangeKind; event_id: string };
  owner: string | null; reviewer: string | null; due_at: string | null; severity: 'C1' | 'C2' | 'C3' | 'C4'; title: string; state: string;
}
