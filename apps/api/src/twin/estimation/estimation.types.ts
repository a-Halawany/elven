/**
 * B30 §ES — the estimation types shared by the service and the Reconciliation Agent's scan, in their own file so the scan does not import
 * estimation.service.ts (the service imports the scan): the boundaries gate (dependency-cruiser no-circular) refuses that cycle.
 */
import type { Candidate, EstimatorDecl } from './estimators.js';

type Row = Record<string, unknown>;

export interface Computed {
  twin: Row; head: Row | null; headElements: Row[]; estimators: EstimatorDecl[]; now: string;
  facts: Record<string, Row[]>; qualification: Array<{ estimator_id: string; version: number; inputs: Row[] }>;
  candidates: Candidate[]; primary: Candidate | null; asOf: string | null;
  constraint: { outcome: 'satisfied' | 'violated' | 'indeterminate'; pins: unknown[]; violations: unknown[]; applied: string[]; vacuous: boolean; reason: string | null; subject: unknown };
  /** The primary's disqualified inputs with their reasons (what an observation request is for). */
  unqualified: Array<{ estimator_id: string; index: number; input: Row; reasons: string[]; reason_class: 'missing' | 'stale' | 'disqualified' }>;
}

export interface RequestIntake { twinId: string; key: string | null; estimatorId: string | null; input: Row; reasonClass: string; note: string }
