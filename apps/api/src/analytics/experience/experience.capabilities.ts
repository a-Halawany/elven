/**
 * B92 §UX (0113_b92_x_ux) — THE EXPERIENCE CAPABILITIES: thin bindings to the definer ports (consent, telemetry definitions and their privacy
 * review, hold / release / retire, ingestion, journeys, segments, baselines, thresholds, experiments, findings, actions, the purge, the export)
 * and the reads (the person's own state, the assignment, the workspace, the consequence preview, an export). Nothing here decides a rule a
 * port decides. The telemetry RECORD binding passes no id and no correlation: nothing ties a stored event to the request that carried it.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);

export interface ExperienceReads {
  readonly action: string; readonly tx: Tx;
  now(): Promise<string>;
  self(t: string, d: string): Promise<Row>;
  assignment(t: string, d: string, experimentId: string): Promise<Row | null>;
  workspace(t: string, d: string): Promise<Row>;
  preview(t: string, d: string, findingId: string, kind: string | null, targetId: string | null): Promise<Row | null>;
  exportRead(exportId: string): Promise<Row | null>;
}
export interface ExperienceWrites extends ExperienceReads {
  consent(a: { id: string; t: string; d: string; purposeKey: string; decision: 'granted' | 'withdrawn'; actor: string; correlationId: string }): Promise<Row>;
  define(a: { id: string; t: string; d: string; eventKey: string; title: string; journeyKey: string; stepKey: string; fields: Row; actor: string; correlationId: string }): Promise<Row>;
  review(a: { id: string; t: string; d: string; decision: string; reason: string; digest: string; actor: string; correlationId: string }): Promise<Row>;
  hold(a: { id: string; t: string; d: string; hold: boolean; reason: string; actor: string; correlationId: string }): Promise<Row>;
  retire(a: { id: string; t: string; d: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  record(a: { t: string; d: string; eventKey: string; outcome: string | null; durationMs: number | null; fields: Row; deviceClass: string | null; locale: string | null; experimentId: string | null; actor: string }): Promise<Row>;
  journey(a: { id: string; t: string; d: string; key: string; title: string; purposeKey: string; objective: string; objectiveIds: string[]; steps: string[]; floor: number | null; actor: string; correlationId: string }): Promise<Row>;
  segment(a: { id: string; t: string; d: string; key: string; dimension: string; value: string; k: number | null; actor: string; correlationId: string }): Promise<Row>;
  baseline(a: { id: string; t: string; d: string; journeyKey: string; measure: string; stepKey: string | null; segmentKey: string | null; period: string; actor: string; correlationId: string }): Promise<Row>;
  proposeThreshold(a: { id: string; t: string; d: string; journeyKey: string; measure: string; stepKey: string | null; segmentKey: string | null; bound: string; value: number; rationale: string; actor: string; correlationId: string }): Promise<Row>;
  decideThreshold(a: { id: string; t: string; d: string; decision: string; reason: string; digest: string | null; actor: string; correlationId: string }): Promise<Row>;
  proposeExperiment(a: { id: string; t: string; d: string; journeyKey: string; title: string; hypothesis: string; measure: string; stepKey: string | null; variants: unknown[]; minSample: number; actor: string; correlationId: string }): Promise<Row>;
  approveExperiment(a: { id: string; t: string; d: string; experimentId: string; role: string; decision: string; reason: string; digest: string; actor: string; correlationId: string }): Promise<Row>;
  analyse(a: { id: string; t: string; d: string; experimentId: string; actor: string; correlationId: string }): Promise<Row>;
  conclude(a: { t: string; d: string; experimentId: string; conclusion: string; arm: string | null; analysisId: string; analysisDigest: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  proposeFinding(a: { id: string; t: string; d: string; originKind: string; originId: string; journeyKey: string | null; statement: string; evidence: Row; actor: string; correlationId: string }): Promise<Row>;
  decideAction(a: { id: string; t: string; d: string; findingId: string; decision: string; kind: string | null; targetId: string | null; reason: string; findingDigest: string; previewDigest: string; actor: string; correlationId: string }): Promise<Row>;
  purge(a: { id: string; t: string; d: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  exportCreate(a: { id: string; t: string; d: string; title: string; actor: string; correlationId: string }): Promise<Row>;
}

class ExperienceCapabilityImpl implements ExperienceWrites {
  constructor(readonly tx: Tx, readonly action: string) {}
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const row = ((await q.execute(this.tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  private async maybe(q: ReturnType<typeof sql>): Promise<Row | null> { return ((await q.execute(this.tx)).rows as Array<{ r: Row | null }>)[0]?.r ?? null; }
  async now(): Promise<string> { const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.tx); return (r.rows[0]?.now ?? new Date()).toISOString(); }
  self(t: string, d: string) { return this.one(sql`select analytics.experience_self(${t}::uuid, ${d}::uuid) as r`, 'experience_self'); }
  assignment(t: string, d: string, e: string) { return this.maybe(sql`select analytics.experiment_assignment(${t}::uuid, ${d}::uuid, ${e}::uuid) as r`); }
  workspace(t: string, d: string) { return this.one(sql`select analytics.experience_workspace(${t}::uuid, ${d}::uuid) as r`, 'experience_workspace'); }
  preview(t: string, d: string, f: string, kind: string | null, target: string | null) {
    return this.maybe(sql`select analytics.action_preview(${t}::uuid, ${d}::uuid, ${f}::uuid, ${kind}::text, ${target}::uuid) as r`);
  }
  exportRead(id: string) { return this.maybe(sql`select analytics.export_read(${id}::uuid) as r`); }

  consent(a: Parameters<ExperienceWrites['consent']>[0]) {
    return this.one(sql`select analytics.record_consent(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.purposeKey}, ${a.decision}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_consent');
  }
  define(a: Parameters<ExperienceWrites['define']>[0]) {
    return this.one(sql`select analytics.define_telemetry(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.eventKey}, ${a.title}, ${a.journeyKey}, ${a.stepKey}, ${j(a.fields)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'define_telemetry');
  }
  review(a: Parameters<ExperienceWrites['review']>[0]) {
    return this.one(sql`select analytics.review_telemetry(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.decision}, ${a.reason}, ${a.digest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'review_telemetry');
  }
  hold(a: Parameters<ExperienceWrites['hold']>[0]) {
    return this.one(sql`select analytics.hold_telemetry(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.hold}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'hold_telemetry');
  }
  retire(a: Parameters<ExperienceWrites['retire']>[0]) {
    return this.one(sql`select analytics.retire_telemetry(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'retire_telemetry');
  }
  record(a: Parameters<ExperienceWrites['record']>[0]) {
    return this.one(sql`select analytics.record_telemetry(${a.t}::uuid, ${a.d}::uuid, ${a.eventKey}, ${a.outcome}, ${a.durationMs}::int, ${j(a.fields)}::jsonb, ${a.deviceClass}, ${a.locale},
      ${a.experimentId}::uuid, ${a.actor}::uuid) as r`, 'record_telemetry');
  }
  journey(a: Parameters<ExperienceWrites['journey']>[0]) {
    return this.one(sql`select analytics.declare_journey(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.key}, ${a.title}, ${a.purposeKey}, ${a.objective}, ${a.objectiveIds}::uuid[], ${a.steps}::text[],
      ${a.floor}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_journey');
  }
  segment(a: Parameters<ExperienceWrites['segment']>[0]) {
    return this.one(sql`select analytics.declare_segment(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.key}, ${a.dimension}, ${a.value}, ${a.k}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'declare_segment');
  }
  baseline(a: Parameters<ExperienceWrites['baseline']>[0]) {
    return this.one(sql`select analytics.record_baseline(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.journeyKey}, ${a.measure}, ${a.stepKey}, ${a.segmentKey}, ${a.period}, ${a.actor}::uuid,
      ${a.correlationId}::uuid) as r`, 'record_baseline');
  }
  proposeThreshold(a: Parameters<ExperienceWrites['proposeThreshold']>[0]) {
    return this.one(sql`select analytics.propose_threshold(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.journeyKey}, ${a.measure}, ${a.stepKey}, ${a.segmentKey}, ${a.bound}, ${a.value}::numeric,
      ${a.rationale}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_threshold');
  }
  decideThreshold(a: Parameters<ExperienceWrites['decideThreshold']>[0]) {
    return this.one(sql`select analytics.decide_threshold(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.decision}, ${a.reason}, ${a.digest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_threshold');
  }
  proposeExperiment(a: Parameters<ExperienceWrites['proposeExperiment']>[0]) {
    return this.one(sql`select analytics.propose_experiment(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.journeyKey}, ${a.title}, ${a.hypothesis}, ${a.measure}, ${a.stepKey}, ${j(a.variants)}::jsonb,
      ${a.minSample}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_experiment');
  }
  approveExperiment(a: Parameters<ExperienceWrites['approveExperiment']>[0]) {
    return this.one(sql`select analytics.approve_experiment(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.experimentId}::uuid, ${a.role}, ${a.decision}, ${a.reason}, ${a.digest}, ${a.actor}::uuid,
      ${a.correlationId}::uuid) as r`, 'approve_experiment');
  }
  analyse(a: Parameters<ExperienceWrites['analyse']>[0]) {
    return this.one(sql`select analytics.analyse_experiment(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.experimentId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'analyse_experiment');
  }
  conclude(a: Parameters<ExperienceWrites['conclude']>[0]) {
    return this.one(sql`select analytics.conclude_experiment(${a.t}::uuid, ${a.d}::uuid, ${a.experimentId}::uuid, ${a.conclusion}, ${a.arm}, ${a.analysisId}::uuid, ${a.analysisDigest}, ${a.reason},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'conclude_experiment');
  }
  proposeFinding(a: Parameters<ExperienceWrites['proposeFinding']>[0]) {
    return this.one(sql`select analytics.propose_finding(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.originKind}, ${a.originId}::uuid, ${a.journeyKey}, ${a.statement}, ${j(a.evidence)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_finding');
  }
  decideAction(a: Parameters<ExperienceWrites['decideAction']>[0]) {
    return this.one(sql`select analytics.decide_action(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.findingId}::uuid, ${a.decision}, ${a.kind}::text, ${a.targetId}::uuid, ${a.reason}, ${a.findingDigest},
      ${a.previewDigest}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_action');
  }
  purge(a: Parameters<ExperienceWrites['purge']>[0]) {
    return this.one(sql`select analytics.purge_telemetry(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'purge_telemetry');
  }
  exportCreate(a: Parameters<ExperienceWrites['exportCreate']>[0]) {
    return this.one(sql`select analytics.create_export(${a.id}::uuid, ${a.t}::uuid, ${a.d}::uuid, ${a.title}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'create_export');
  }
}

export const ExperienceCapability = {
  read(tx: Tx, action: string): ExperienceReads { return new ExperienceCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): ExperienceWrites { return new ExperienceCapabilityImpl(tx, action); },
};
