/**
 * THE LEARN STEP CAPABILITY — CP-6 B36 part `collab` (0094 §C5; F-P4-13 (j): JRN-09 learn, PR-28-001/-002, CAP-FW-05). One class for the
 * port prediction.record_exposure_learning (prediction.exposure.learn) and the read of a lineage's learnings. The exposures capability's
 * discipline (exposures.capabilities.ts): a route receives exactly the capability its action names.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

export interface ExposureLearningWrites {
  readonly action: string;
  recordLearning(a: { learningId: string; exposureId: string; tenantId: string; domainId: string; reviewId: string; expectedNote: string; observedNote: string; basisChange: string; actor: string; correlationId: string }): Promise<Row>;
  learningsOf(exposureId: string): Promise<Row[]>;
}

class ExposureLearningImpl implements ExposureLearningWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  async recordLearning(a: Parameters<ExposureLearningWrites['recordLearning']>[0]): Promise<Row> {
    const r = await sql<{ r: Row | null }>`select prediction.record_exposure_learning(${a.learningId}::uuid, ${a.exposureId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reviewId}::uuid,
      ${a.expectedNote}, ${a.observedNote}, ${a.basisChange}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`.execute(this.#tx);
    const row = r.rows[0]?.r;
    if (row === undefined || row === null) throw new Error('record_exposure_learning returned no row');
    return row;
  }
  async learningsOf(exposureId: string): Promise<Row[]> {
    const r = await sql<Row>`select learning_id, exposure_id, review_id, response_id, basis_version, expected, observed, basis_change, recorded_by, recorded_at
      from prediction.exposure_learnings where exposure_id = ${exposureId}::uuid order by recorded_at, learning_id`.execute(this.#tx);
    return r.rows;
  }
}

export const ExposureLearningCapability = {
  learn(tx: Tx, action: string): ExposureLearningWrites { return new ExposureLearningImpl(tx, action); },
};
