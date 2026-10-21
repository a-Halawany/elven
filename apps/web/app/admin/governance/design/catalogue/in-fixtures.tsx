'use client';
/**
 * CP-6 B40 §IN (integration) — the catalogue's section for THE INTAKE LIBRARY (components/intake.tsx; LIBRARY_B40.intake): its six components
 * from SYNTHETIC fixtures — the five scan outcomes in words (DESIGN D2: only clean admits), the verdicts of two engines (the content
 * inspector's findings by code, class and byte offset — never content; ClamAV's engine and signature-database identity, an UNADMITTED
 * evaluation image said so), the intake assessment with a consumer notice, and the three governed reads / acts shown INERT: the evidence
 * page's verdict read, the excerpt read (D9) and the held upload's decision (SP-22) sit in a disabled fieldset — the catalogue calls no
 * server, and the fixture says so. Construction evidence only.
 */
import { CaseExcerpt, InspectionOutcomeMark, InspectionPanel, IntakeAssessment, UploadApprovalReview, VerdictList } from '../../../../../components/intake';
import { LIBRARY_B40 } from '../../../../../lib/b40-seams';
import { INSPECTION_OUTCOMES, type Assessment, type UploadApproval, type Verdict } from '../../../../../lib/intake-b40';
import { Panel } from '../../../../../components/layers';

export const IN_RENDERED: readonly string[] = LIBRARY_B40.intake.exports;

const SCOPE = { tenantId: '01a0b840-0000-7000-8000-0000000000f1', domainId: '01a0b840-0000-7000-8000-0000000000f2' };
const CASE = '01a0b840-0000-7000-8000-00000000c0a1';
const VERDICTS: Verdict[] = [
  { verdict_id: '01a0b840-0000-7000-8000-00000000c101', engine: 'content-inspector', engine_version: '1.0.0', image_digest: null, rule_set_digest: 'b40e'.repeat(16), signature_databases: [],
    engine_config: { sandbox: 'node --permission (no network, the item only), 128 MiB, 5 s (fixture)' }, outcome: 'detected', detail: 'active content and a hidden instruction (fixture)',
    findings: [{ code: 'pdf.javascript', class: 'active_content', offset: 1184, length: 11, detail: 'a /JavaScript action (fixture)' },
               { code: 'text.hidden_instruction', class: 'hidden_instruction', offset: 2290, length: 48, detail: 'an instruction phrase in white text (fixture)' }],
    started_at: '2026-10-20T07:00:00Z', finished_at: '2026-10-20T07:00:01Z', decision: 'quarantine', decision_class: 'active_content', record_point: 'quarantined' },
  { verdict_id: '01a0b840-0000-7000-8000-00000000c102', engine: 'clamav', engine_version: 'ClamAV 1.5.4', image_digest: 'sha256:' + 'b40f'.repeat(16), rule_set_digest: null,
    signature_databases: [{ name: 'daily', version: '28159', buildTime: '2026-10-20T06:24:00Z', digest: 'b410'.repeat(16) }, { name: 'main', version: '63', buildTime: '2025-12-16T23:18:00Z', digest: 'b411'.repeat(16) }],
    engine_config: { db_source: 'the official CVD mirror through freshclam (fixture)', db_update_policy: 'deliberate — no background update (fixture)', admission: 'NOT ADMITTED — an evaluation image (fixture; DESIGN D2: the owner decides)' },
    outcome: 'clean', detail: null, findings: [], started_at: '2026-10-20T07:00:00Z', finished_at: '2026-10-20T07:00:02Z', decision: 'quarantine', decision_class: 'active_content', record_point: 'quarantined' },
];
const ASSESSMENT: Assessment = {
  decision: 'quarantine', decision_class: 'active_content', review_reason: 'safety', engines_required: ['content-inspector', 'clamav'],
  content_rules: { active_content: { rule: 'quarantine', reason: null }, hidden_instructions: { rule: 'quarantine', reason: null } },
  duplicate_state: 'none', duplicate_of: [], quality_score: 0.82, quality: { completeness: 1, parse_confidence: 0.64, duplication: 0, basis: ['the PDF parses (fixture)', 'one object stream could not be read (fixture)'], method: 'b40-in-quality-1' },
  manual_upload: true, uploader: 'principal:fixture-uploader',
  consumer_notice: { products: { forecasts: 2, warnings: 1 }, product_count: 3, notify_roles: ['collection_manager', 'forecast_owner'], steward: 'principal:fixture-steward', statement: 'a case opened on a source three products rest on (fixture)' },
  scanned_digest_verified: true, recorded_at: '2026-10-20T07:00:02Z',
};
const APPROVAL: UploadApproval = { approval_id: '01a0b840-0000-7000-8000-00000000c201', state: 'pending', requester: 'principal:fixture-uploader', purpose: 'supplier quality review',
  rule: { mode: 'within_limits', max_bytes: 65536 }, held_because: 'the upload is 182 340 bytes, over the auto-admit limit of 65 536 (fixture)', requested_at: '2026-10-20T07:00:02Z',
  decided_by: null, decided_at: null, decision_reason: null, media_type: 'application/pdf', byte_length: 182340 };

export function InCatalogue() {
  return (
    <Panel title="Intake inspection, verdicts, assessment, the held upload (B40 §IN — proposed)">
      <section aria-label="InspectionOutcomeMark — every outcome">
        <p className="eye-text-label">InspectionOutcomeMark — the five scan outcomes (only clean admits)</p>
        <ul className="eye-ev-lines">{INSPECTION_OUTCOMES.map((o) => <li key={o}><InspectionOutcomeMark outcome={o} /></li>)}</ul>
      </section>
      <section aria-label="VerdictList">
        <VerdictList verdicts={VERDICTS} caption="Fixture verdicts — two engines on one quarantined item" />
        <VerdictList verdicts={[]} />
      </section>
      <section aria-label="IntakeAssessment">
        <IntakeAssessment assessment={ASSESSMENT} />
        <IntakeAssessment assessment={null} />
      </section>
      <fieldset disabled aria-describedby="in-cat-inert" style={{ border: 0, padding: 0, margin: 0 }}>
        <legend className="eye-text-label">The governed reads and the decision — shown inert</legend>
        <p id="in-cat-inert" className="eye-ev-note">Fixture: these controls read or act through the server; the catalogue calls no server, so they are disabled here.</p>
        <section aria-label="InspectionPanel">
          <InspectionPanel scope={SCOPE} evdId="01a0b840-0000-7000-8000-00000000e0a1" version={1} />
        </section>
        <section aria-label="CaseExcerpt">
          <CaseExcerpt scope={SCOPE} caseId={CASE} finding={VERDICTS[0]!.findings[1]!} onClose={() => undefined} />
        </section>
        <section aria-label="UploadApprovalReview">
          <UploadApprovalReview scope={SCOPE} caseId={CASE} approval={APPROVAL} me={{ principalId: 'principal:fixture-reviewer', kind: 'human', roles: ['collection_manager'] }} onDecided={async () => undefined} />
          <UploadApprovalReview scope={SCOPE} caseId={CASE} approval={{ ...APPROVAL, state: 'approved', decided_by: 'principal:fixture-reviewer', decided_at: '2026-10-20T08:00:00Z', decision_reason: 'the delivery note matches the order (fixture)' }}
            me={{ principalId: 'principal:fixture-reviewer', kind: 'human', roles: ['collection_manager'] }} onDecided={async () => undefined} />
        </section>
      </fieldset>
    </Panel>
  );
}
