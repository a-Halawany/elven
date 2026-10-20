/**
 * CP-6 B40 — the INSPECT stage (§IN, F-P1-03). OWNED BY §IN: this file's body is replaced by the part; the class name, the `inspect` and
 * `record` signatures and the registration (intake-stages.ts; the types in intake-stage-types.ts) are the prelude's.
 *
 * WHAT IT DOES for an SRC@v4 contract (DESIGN D2, D7; L1-C07, V03-T-042/-074/-268, DAT-IN-11, IC-19, SP-22):
 *   - runs EVERY engine the contract's content_policy.scan_engines names, side by side — engine 1 the content inspector in the §0 launcher's
 *     sandbox (inspection/content-inspector.ts: no fs but the one item, no write / spawn / worker / addon, 128 MiB, 5 s), engine 2 a ClamAV
 *     engine over clamd (inspection/clamd-adapter.ts, configured by the deployment — none configured is `unavailable`);
 *   - decides (inspection/inspection-policy.ts): ONLY a clean verdict from every engine admits — detected, failed, incomplete and unavailable
 *     quarantine with their class (QUARANTINE_CLASS_OF_OUTCOME); active content, macros, embedded files and hidden instructions quarantine
 *     unless the contract says admit_opaque (D7); a manual upload outside the contract's auto_admit rule is HELD for a second person (SP-22);
 *     the heuristic verdict of content-controls.ts is never weakened (the lifecycle keeps refusing what it refused);
 *   - `record`, inside the admission or the quarantine transaction, writes every engine's verdict WITH its engine identity (version, image
 *     digest, rule-set digest, the signature databases) and its findings (codes and offsets — never content, D9), the item's assessment
 *     (duplicate state, quality, the manual-upload facts, the consumer notice), custody.inspected, and a held upload's pending approval —
 *     observation.record_inspection (0123 §IN).
 * A v1–v3 contract keeps its recorded rule (D8): no engine runs, nothing is recorded — the DEF-03 PDF stays admitted as it was.
 *
 * CONSTRUCTION (this file, its harness phase6-intake-b40 and the unit test content-inspector-b40). The ClamAV image is NOT admitted (DESIGN
 * "D2 — the admission result"): the clamd verdicts proven on a real engine are the local evaluation engine's (phase6-clamav-engine-b40,
 * evidence/cp6/b40-clamav-evaluation.txt), EXC-P1-001 stays OPEN.
 */
import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { AcquisitionWrites } from '../../observation.capabilities.js';
import type { SrcV4ContentPolicy } from '../../sources/source-contract.js';
import type { InspectDecision, InspectInput, InspectStage, IntakeRecordPoint, IntakeStageContext } from '../intake-stage-types.js';
import { runContentInspector, CONTENT_INSPECTOR_ENGINE } from '../../inspection/content-inspector.js';
import { ClamdAdapter, CLAMAV_ENGINE, clamdConfigFromEnv } from '../../inspection/clamd-adapter.js';
import { unavailableVerdict, type RecordedEngineVerdict } from '../../inspection/engine-port.js';
import { decideInspection, type InspectExtras } from '../../inspection/inspection-policy.js';

@Injectable()
export class InspectStageIn implements InspectStage {
  /** What `record` needs beside the decision (the assessment): keyed by the decision object the lifecycle hands back. */
  private readonly extras = new WeakMap<InspectDecision, InspectExtras>();

  /** One engine's verdict on the item (never throws: an engine that cannot answer is `unavailable`). */
  private async run(engine: string, bytes: Uint8Array, meta: { filename: string | null; declaredType: string | null }): Promise<RecordedEngineVerdict> {
    if (engine === CONTENT_INSPECTOR_ENGINE) return runContentInspector(bytes, meta);
    if (engine === CLAMAV_ENGINE) {
      const { config, problem } = clamdConfigFromEnv();
      if (config === null) return unavailableVerdict(CLAMAV_ENGINE, problem ?? 'no clamd engine is configured', { configured: false });
      return new ClamdAdapter(config).inspect(bytes);
    }
    return unavailableVerdict(engine, `no inspection engine named ${engine} exists in this deployment`);
  }

  async inspect(ctx: IntakeStageContext, input: InspectInput): Promise<InspectDecision> {
    // D8: a v1–v3 contract keeps its recorded rule — no engine runs, nothing is recorded
    if (!ctx.v4) return { kind: 'pass', verdicts: [] };
    const policy = ctx.contract.contract['content_policy'] as SrcV4ContentPolicy | undefined;
    const bytes = input.item.bytes;
    const scannedDigest = createHash('sha256').update(bytes).digest('hex');
    const meta = { filename: input.item.filename ?? null, declaredType: input.item.declaredMediaType ?? null };
    if (policy === undefined || !Array.isArray(policy.scan_engines) || policy.scan_engines.length === 0) {
      // a v4 contract without its content policy cannot be inspected as declared: fail closed (the registry refuses such a contract anyway)
      const v = unavailableVerdict(CONTENT_INSPECTOR_ENGINE, 'the SRC@v4 contract declares no content policy; nothing can be inspected as declared');
      const d: InspectDecision = { kind: 'quarantine', reasonClass: 'inspection_unavailable', reason: 'the contract declares no content policy — fail closed (D2)', verdicts: [v] };
      this.extras.set(d, { enginesRequired: [], contentRules: {}, quality: { completeness: 0, parse_confidence: 0, basis: ['no content policy'] }, hold: null, scannedDigest });
      return d;
    }
    // the bytes the engines scan are the bytes stored and verified at steps 5–6; a disagreement is an engine that cannot vouch for them
    const verdicts = scannedDigest === input.stored.contentDigest
      ? await Promise.all(policy.scan_engines.map((e) => this.run(e, bytes, meta)))
      : policy.scan_engines.map((e) => ({ ...unavailableVerdict(e, 'the bytes in hand do not match the stored digest; nothing was scanned'), outcome: 'failed' as const }));
    const { decision, extras } = decideInspection({
      connectorKind: ctx.contract.connector_kind, contentPolicy: policy,
      item: { byteLength: bytes.byteLength, declaredType: meta.declaredType, sniffedType: input.heuristic.sniffedType, filename: meta.filename },
      heuristic: { ok: input.heuristic.ok, class: input.heuristic.class, sniffedType: input.heuristic.sniffedType, declaredType: input.heuristic.declaredType },
      verdicts, purpose: ctx.purposeId, scannedDigest,
    });
    this.extras.set(decision, extras);
    return decision;
  }

  async record(cap: AcquisitionWrites, ctx: IntakeStageContext, at: IntakeRecordPoint, decision: InspectDecision): Promise<void> {
    // nothing ran (a v1–v3 contract): nothing is recorded — its items read "not recorded before B40" (no back-fill)
    if (decision.verdicts.length === 0) return;
    const extras = this.extras.get(decision);
    await cap.recordInspection({
      tenantId: ctx.tenantId, domainId: ctx.domainId, sourceId: ctx.sourceId, contractVersion: ctx.contractVersion, runId: ctx.runId,
      point: at.kind === 'admitted'
        ? { kind: 'admitted', evdObjectId: at.evdObjectId, evdVersion: at.evdVersion, manifestId: at.manifestId, contentDigest: at.contentDigest, itemKey: at.itemKey }
        : { kind: 'quarantined', caseId: at.caseId, manifestId: at.manifestId, contentDigest: at.contentDigest, itemKey: at.itemKey },
      decision: decision.kind, decisionClass: decision.kind === 'quarantine' ? decision.reasonClass : null,
      verdicts: (decision.verdicts as RecordedEngineVerdict[]).map((v) => ({
        engine: v.identity.engine, engineVersion: v.identity.engineVersion, imageDigest: v.identity.imageDigest, ruleSetDigest: v.identity.ruleSetDigest,
        signatureDatabases: v.identity.signatureDatabases, engineConfig: v.engineConfig ?? {}, outcome: v.outcome,
        findings: v.findings.map((f) => ({ code: f.code, ...(f.class === undefined ? {} : { class: f.class }), ...(f.offset === undefined ? {} : { offset: f.offset }),
                                           ...(f.length === undefined ? {} : { length: f.length }), ...(f.detail === undefined ? {} : { detail: f.detail }) })),
        detail: v.detail ?? null, startedAt: v.startedAt, finishedAt: v.finishedAt,
      })),
      assessment: {
        enginesRequired: extras?.enginesRequired ?? [], contentRules: extras?.contentRules ?? {}, quality: extras?.quality ?? { completeness: 0, parse_confidence: 0, basis: [] },
        scannedDigest: extras?.scannedDigest ?? null, hold: extras?.hold ?? null,
      },
      correlationId: ctx.correlationId,
    });
  }
}
