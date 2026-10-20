/**
 * CP-6 B40 §AP (DP-10-005, V03-T-072) — THE INGRESS CHECK of an SRC@v4 contract's fetched item, after fetch and before admission:
 *   * RESIDENCY at ingress: a run authorized with a residency CONFLICT under `residency_check: record` (the run went out and the conflict was
 *     recorded on its authorization) quarantines what it fetched — `residency_conflict`, for a human to decide; under `enforce` the run never
 *     went out (the authorize stage refused it);
 *   * MANIPULATION / DUPLICATE DETECTION on responses: the response's identity and shape (media type, root type, the top-level field set, its
 *     size — never content, D9) compared with the last consistent response of the same poll key; a departure is an anomaly — quarantined
 *     `response_anomaly` (the fingerprint recorded either way: observation.acquisition_response_fingerprints). Identical bytes for the same
 *     poll key remain the lifecycle's own audited no-op (unchanged); a framed child is judged through its parent, an upload is not a response.
 * The decision is §AP's; WHERE it runs is the intake seam's composition — the integrator folds it into IntakeStages.inspect before §IN's
 * engines (one line: `const ap = await this.ingressAp.evaluate(ctx, input.item); if (ap !== null) return { kind: 'quarantine', ...ap,
 * verdicts: [] };`). Until that fold it is reached through this service (the harness composes it exactly so). A v1–v3 contract: null (D8).
 */
import { Injectable, Logger } from '@nestjs/common';
import type { IntakeStageContext } from '../acquisition/intake-stage-types.js';
import type { AcquiredItem } from '../connectors/sdk.js';
import { responseAnomalies, responseFingerprint, type Fingerprint } from './policy-model.js';
import { AcquisitionPolicyStore } from './policy-store.js';
import { RunPolicyCache, policyOf, runRefOf } from './run-policy.js';

export interface IngressQuarantine { reasonClass: 'response_anomaly' | 'residency_conflict'; reason: string }

@Injectable()
export class IngressPolicyAp {
  private readonly log = new Logger('observation.acquisition-policy');

  constructor(private readonly store: AcquisitionPolicyStore, private readonly runs: RunPolicyCache) {}

  async evaluate(ctx: IntakeStageContext, item: AcquiredItem): Promise<IngressQuarantine | null> {
    if (!ctx.v4 || policyOf(ctx) === null || ctx.contract.connector_kind === 'upload') return null;
    const run = this.runs.get(ctx.runId);
    if (run?.residency !== null && run?.residency !== undefined && run.residency.verdict !== 'match' && !run.residency.refuse) {
      return { reasonClass: 'residency_conflict', reason: `residency at ingress: ${run.residency.reason} — held for a person to decide` };
    }
    if (item.fragment != null) return null;            // a framed child is judged through its parent
    const pollKey = item.pollKey ?? (item.deterministic === true ? item.itemKey : null);
    if (pollKey === null) return null;
    const ref = runRefOf(ctx);
    const cur = responseFingerprint(Buffer.from(item.bytes.buffer, item.bytes.byteOffset, item.bytes.byteLength), item.declaredMediaType);
    let prev: Fingerprint | null = null;
    try {
      const row = await this.store.lastFingerprint(ref, pollKey);
      prev = row === null ? null : { mediaType: row['media_type'] as string | null, rootType: row['root_type'] as Fingerprint['rootType'], keysDigest: row['keys_digest'] as string | null,
        keyCount: row['key_count'] as number | null, byteLength: Number(row['byte_length']), contentDigest: String(row['content_digest']) };
    } catch (e) {
      // the comparison could not be made: the response is not shown to be consistent — held, never admitted on a guess (fail closed)
      return { reasonClass: 'response_anomaly', reason: `the response could not be compared with the last consistent one (${(e as Error).message.slice(0, 160)}) — held for review` };
    }
    const anomalies = responseAnomalies(prev, cur);
    const verdict = prev === null ? 'baseline' : anomalies.length > 0 ? 'anomaly' : 'consistent';
    await this.store.recordFingerprint(ref, { pollKey, mediaType: cur.mediaType, rootType: cur.rootType, keysDigest: cur.keysDigest, keyCount: cur.keyCount,
      bytes: cur.byteLength, digest: cur.contentDigest, verdict, anomaly: anomalies }).catch((e: unknown) => {
      this.log.warn(`run ${ctx.runId}: the response fingerprint could not be recorded: ${(e as Error).message.slice(0, 200)}`);
    });
    if (anomalies.length === 0) return null;
    return { reasonClass: 'response_anomaly', reason: `the response departs from the last consistent one for this poll: ${anomalies.map((a) => `${a.code} (${a.detail})`).join('; ')}` };
  }
}
