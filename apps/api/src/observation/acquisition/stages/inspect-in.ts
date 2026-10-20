/**
 * CP-6 B40 — the INSPECT stage (§IN, F-P1-03). OWNED BY §IN: this file's body is replaced by the part; the class name, the `inspect` and
 * `record` signatures and the registration (intake-stages.ts; the types in intake-stage-types.ts) are the prelude's.
 *
 * §0 PRELUDE: PASS-THROUGH — every item passes with no finding and nothing is recorded, exactly as before B40 (the heuristic verdict of
 * content-controls.ts still decides, as today). §IN builds here the inspection engine port (versioned engines; engine 1 the content
 * inspector in the §0 launcher's sandbox — sandbox/spawn-confined.ts; engine 2 a REAL ClamAV engine over clamd — DESIGN D2, the owner's
 * word: its image is admitted by a separate builder through C15's own process; the in-harness stand-in serves adapter unit tests only) and
 * applies the SRC@v4 content_policy (active content, macros, embedded files, hidden instructions → quarantine unless `admit_opaque`; D7;
 * `scan_engines` — every engine named must answer `clean`). Outcomes: clean | detected | unavailable | failed | incomplete — ONLY clean
 * admits (QUARANTINE_CLASS_OF_OUTCOME). `record` writes observation.inspection_verdicts inside the admission / quarantine transaction —
 * every verdict WITH its engine identity (image digest, engine version, signature-database versions / build times / digests) and its
 * findings (offsets and codes, never content — D9). A v1–v3 contract keeps its recorded rule (the DEF-03 PDF stays admitted — D8).
 */
import { Injectable } from '@nestjs/common';
import type { AcquisitionWrites } from '../../observation.capabilities.js';
import type { InspectDecision, InspectInput, InspectStage, IntakeRecordPoint, IntakeStageContext } from '../intake-stage-types.js';

@Injectable()
export class InspectStageIn implements InspectStage {
  async inspect(_ctx: IntakeStageContext, _input: InspectInput): Promise<InspectDecision> {
    return { kind: 'pass', verdicts: [] };
  }

  async record(_cap: AcquisitionWrites, _ctx: IntakeStageContext, _at: IntakeRecordPoint, _decision: InspectDecision): Promise<void> {
    // §0: nothing is recorded (no verdict ledger exists before §IN)
  }
}
