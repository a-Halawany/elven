'use client';
/**
 * CP-6 B40 §IN (F-P1-03) — THE INTAKE COMPONENTS of the shared library. Each renders what lib/intake-b40.ts says from the server's record;
 * the server decides everything that matters and refuses in its own words (shown as it says it). They compose the library's existing
 * pieces (DefinitionList, NumberValue, Timestamp, CommandReview, GovernedButton, Receipt) and never edit them.
 *
 *   InspectionOutcomeMark  one engine's outcome — a glyph and a word (never colour alone), its meaning in text; DESIGN D2's sentence.
 *   VerdictList            every engine's verdict on an item: the engine's identity (version, image digest, rule set, signature databases),
 *                          its configuration (the ClamAV database source and update policy, the sandbox), the findings by CODE, CLASS and
 *                          OFFSET — never content (D9). Mounted by the case page; the evidence page mounts InspectionPanel (the integrator).
 *   InspectionPanel        an evidence version's verdicts read on demand (observation.inspection.read), "not recorded before B40" otherwise.
 *   IntakeAssessment       the review reason, the duplicate state, the quality score with its basis, the content rules, the consumer notice.
 *   CaseExcerpt            the bytes around a finding, read under observation.evidence.retrieve (D9: only a role that already reads evidence
 *                          bytes — a refusal shown in the server's words); escaped printable text, the cited span in <mark>, never HTML.
 *   UploadApprovalReview   SP-22: a second person's decision on a held upload, through CommandReview with a CLIENT-SIDE PAYLOAD REVIEW
 *                          (CommandReview's `payloadReview`, lib/authority-b81.ts — the decide route binds no version, said on the control;
 *                          B40 integration: the shared binding replaced §IN's local key); a decline states what is kept.
 *
 * Accessibility: names on every control; reasons as text; logical properties; state never by colour alone. CONSTRUCTION — the walk
 * demonstrates on SYNTHETIC personas; real acceptance is B111's path, then H3/R2.
 */
import { useId, useState } from 'react';
import { DefinitionList } from './data';
import { NumberValue, Timestamp } from './text';
import { CommandReview } from './authority';
import { GovernedButton, LiveStatus } from './observation';
import { Receipt } from './ui';
import {
  D2_SENTENCE, approvalConsequence, approvalEligibility, duplicateWords, engineConfigLines, engineIdentityLine, excerptParts, findingLine, intake,
  outcomeWords, /* B40 integration */ approvalPayload, APPROVAL_SERVER_CONTRACT, /* end B40 integration */ reviewReasonLabel, scoreOf, NOT_RECORDED,
  type Assessment, type Finding, type Scope, type UploadApproval, type Verdict,
} from '../lib/intake-b40';

type Err = { code: string; message: string; correlationId: string };
const small = { color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)', marginBlock: 'var(--eye-space-4)' } as const;
const box = { border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)', padding: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-8)' } as const;

/* ───────────────────────── one outcome ───────────────────────── */
export function InspectionOutcomeMark({ outcome }: { outcome: string }) {
  const w = outcomeWords(outcome);
  return (
    <span className="eye-authority-tag" data-outcome={outcome} title={w.meaning}>
      <span aria-hidden="true">{w.mark} </span>{w.label}<span className="eye-visually-hidden"> — {w.meaning}</span>
    </span>
  );
}

/* ───────────────────────── the verdicts ───────────────────────── */
export function VerdictList({ verdicts, onFinding, caption }: {
  verdicts: readonly Verdict[];
  /** a finding with an offset may offer its excerpt (the page decides; the read is the server's) */ onFinding?: (f: Finding) => void;
  caption?: string;
}) {
  const id = useId();
  if (verdicts.length === 0) return <p style={small}>No inspection verdict is recorded for this item — {NOT_RECORDED}.</p>;
  return (
    <section aria-labelledby={`${id}-h`}>
      <h3 id={`${id}-h`} style={{ fontSize: 'var(--eye-type-heading-4)', marginBlock: 'var(--eye-space-8) var(--eye-space-4)' }}>{caption ?? 'Inspection verdicts'}</h3>
      <p style={small}>{D2_SENTENCE} Findings are cited by code, class and byte offset — never by their content.</p>
      <ul style={{ listStyle: 'none', paddingInlineStart: 0, margin: 0, display: 'grid', gap: 'var(--eye-space-8)' }}>
        {verdicts.map((v) => (
          <li key={v.verdict_id} style={box} aria-label={`${v.engine}: ${outcomeWords(v.outcome).label}`}>
            <p style={{ margin: 0 }}><strong>{v.engine}</strong> — <InspectionOutcomeMark outcome={v.outcome} />{v.detail ? <span style={small}> · {v.detail}</span> : null}</p>
            <p style={small} className="eye-mono-wrap">{engineIdentityLine(v)}</p>
            {engineConfigLines(v.engine_config).length > 0 && (
              <ul style={{ ...small, paddingInlineStart: 'var(--eye-space-16)' }} aria-label={`${v.engine} configuration`}>
                {engineConfigLines(v.engine_config).map((l) => <li key={l}>{l}</li>)}
              </ul>
            )}
            <p style={small}>Scanned <Timestamp value={v.started_at} /> → <Timestamp value={v.finished_at} /> · recorded at the {v.record_point === 'admitted' ? 'admission' : 'quarantine case'} · decision {v.decision}{v.decision_class ? ` (${v.decision_class.replace(/_/g, ' ')})` : ''}</p>
            {v.findings.length === 0 ? <p style={small}>No finding.</p> : (
              <ul aria-label={`${v.engine} findings`} style={{ margin: 0, paddingInlineStart: 'var(--eye-space-16)' }}>
                {v.findings.map((f, i) => (
                  <li key={`${f.code}-${f.offset ?? 'x'}-${i}`}>
                    <span className="eye-mono-wrap">{findingLine(f)}</span>{f.detail ? <span style={small}> — {f.detail}</span> : null}
                    {onFinding !== undefined && f.offset !== undefined && (
                      <> {' '}<button type="button" className="eye-cld-btn-quiet eye-cld-btn-sm" onClick={() => onFinding(f)} aria-label={`Read the bytes at ${f.code}, byte ${f.offset}`}>Read the bytes here</button></>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ───────────────────────── an evidence version's verdicts (the evidence page's mount) ───────────────────────── */
export function InspectionPanel({ scope, evdId, version }: { scope: Scope; evdId: string; version: number | null }) {
  const [state, setState] = useState<{ verdicts: Verdict[]; assessment: Assessment | null; statement: string | null } | null>(null);
  const [error, setError] = useState<Err | null>(null);
  return (
    <section aria-label="Inspection verdicts of this evidence version">
      {state === null ? (
        <GovernedButton label="Read the inspection verdicts" pendingLabel="Reading" onRun={async () => {
          const r = await intake.verdicts(scope, evdId, version);
          if (!r.ok) { setError(r.error ?? null); throw new Error('refused'); }
          setError(null); setState(r.data?.inspection ?? null);
        }} />
      ) : (
        <>
          {state.statement !== null && <p style={small}>{state.statement}</p>}
          <VerdictList verdicts={state.verdicts} />
          {state.assessment !== null && <IntakeAssessment assessment={state.assessment} />}
        </>
      )}
      {error !== null && <p role="alert" className="eye-authority-critical">{error.message}</p>}
    </section>
  );
}

/* ───────────────────────── the assessment ───────────────────────── */
export function IntakeAssessment({ assessment }: { assessment: Assessment | null }) {
  if (assessment === null) return <p style={small}>Review reason, duplicate state and quality: {NOT_RECORDED}.</p>;
  const score = scoreOf(assessment.quality_score);
  const rules = Object.entries(assessment.content_rules ?? {});
  return (
    <>
      <DefinitionList label="Intake assessment" items={[
        { term: 'Review reason', value: assessment.review_reason === null ? 'none — the item passed every engine and rule' : reviewReasonLabel(assessment.review_reason) },
        { term: 'Engines required', value: assessment.engines_required.join(', ') || 'none named' },
        { term: 'Duplicate state', value: duplicateWords(assessment.duplicate_state) },
        { term: 'Quality score', value: <><NumberValue value={score} fractionDigits={3} /> <span style={small}>({assessment.quality.method})</span></> },
        { term: 'Quality basis', value: assessment.quality.basis.join('; ') || 'not stated' },
        { term: 'Bytes scanned', value: assessment.scanned_digest_verified ? 'the stored bytes — digest verified' : 'the digest of the scanned bytes did not match the stored digest' },
        { term: 'Manual upload', value: assessment.manual_upload ? 'yes — the uploader never reviews it (D9b)' : 'no — collected by its connector' },
        { term: 'Content rules', value: rules.length === 0 ? 'no content finding' : rules.map(([k, r]) => `${k.replace(/_/g, ' ')}: ${String((r as Record<string, unknown>)['rule']).replace(/_/g, ' ')}${(r as Record<string, unknown>)['reason'] ? ` — ${String((r as Record<string, unknown>)['reason'])}` : ''}`).join('; ') },
      ]} />
      {assessment.consumer_notice !== null && (
        <section aria-label="Consumer notice" className="eye-authority-warn" style={box}>
          <p style={{ margin: 0 }}><strong>Products rest on this source:</strong> <NumberValue value={assessment.consumer_notice.product_count} /> ({Object.entries(assessment.consumer_notice.products).map(([k, n]) => `${String(n)} ${k}`).join(', ')}).</p>
          <p style={small}>{assessment.consumer_notice.statement}. Notified: {assessment.consumer_notice.notify_roles.join(', ')}{assessment.consumer_notice.steward ? `; steward ${assessment.consumer_notice.steward}` : ''}.</p>
        </section>
      )}
    </>
  );
}

/* ───────────────────────── the excerpt (D9) ───────────────────────── */
export function CaseExcerpt({ scope, caseId, finding, onClose }: { scope: Scope; caseId: string; finding: Finding; onClose: () => void }) {
  const [parts, setParts] = useState<ReturnType<typeof excerptParts> | null>(null);
  const [meta, setMeta] = useState<{ start: number; end: number; receipt: { policyDecisionId: string; auditSeq: number } } | null>(null);
  const [error, setError] = useState<Err | null>(null);
  return (
    <section aria-label={`Bytes at ${finding.code}`} style={box}>
      <p style={small}>Reading the quarantined bytes is a read of evidence content: it is offered only to a role that already reads evidence bytes (observation.evidence.retrieve), the digest is verified on this read and the read is recorded in custody. At most 2 KiB around the finding is served.</p>
      {parts === null ? (
        <GovernedButton label="Read the bytes around this finding" pendingLabel="Reading" onRun={async () => {
          const r = await intake.excerpt(scope, caseId, finding.offset ?? 0, finding.length);
          if (!r.ok || r.data === undefined) { setError(r.error ?? null); throw new Error('refused'); }
          setError(null); setParts(excerptParts(r.data.excerpt)); setMeta({ ...r.data.excerpt.served, receipt: r.data.receipt });
        }} />
      ) : (
        <>
          <p style={small}>Bytes {meta?.start}–{meta?.end} of the item, shown as escaped text (never interpreted); the finding&apos;s span is marked.</p>
          <pre className="eye-mono-wrap" style={{ whiteSpace: 'pre-wrap', maxBlockSize: '20rem', overflow: 'auto', margin: 0 }} tabIndex={0} aria-label="Excerpt of the quarantined bytes">
            {parts.map((p, i) => (p.marked ? <mark key={i}>{p.text}</mark> : <span key={i}>{p.text}</span>))}
          </pre>
          <Receipt receipt={meta?.receipt ?? null} />
        </>
      )}
      {error !== null && <p role="alert" className="eye-authority-critical">{error.message}</p>}
      <button type="button" className="eye-cld-btn-quiet eye-cld-btn-sm" onClick={onClose}>Hide the excerpt</button>
    </section>
  );
}

/* ───────────────────────── the upload decision (SP-22) ───────────────────────── */
export function UploadApprovalReview({ scope, caseId, approval, me, onDecided }: {
  scope: Scope; caseId: string; approval: UploadApproval;
  me: { principalId: string; kind: string; roles: readonly string[] };
  onDecided: () => Promise<void>;
}) {
  const id = useId();
  const [decision, setDecision] = useState<'approve' | 'decline'>('approve');
  const [reason, setReason] = useState('');
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);
  const payload = approvalPayload({ approvalId: approval.approval_id, decision, reason });
  const elig = approvalEligibility(approval, me);
  const label = decision === 'approve' ? 'Approve the upload and release it' : 'Decline the upload and reject its case';
  return (
    <section aria-labelledby={`${id}-h`} style={box}>
      <h3 id={`${id}-h`} style={{ fontSize: 'var(--eye-type-heading-4)', marginBlock: 0 }}>Held for a second person&apos;s approval (SP-22)</h3>
      <DefinitionList label="Held upload" items={[
        { term: 'Held because', value: approval.held_because },
        { term: 'State', value: approval.state },
        { term: 'Requested', value: <Timestamp value={approval.requested_at} /> },
        { term: 'Purpose', value: approval.purpose },
        { term: 'Uploaded by', value: approval.requester, mono: true },
        ...(approval.decided_by !== null ? [{ term: 'Decided by', value: approval.decided_by, mono: true }, { term: 'Decision reason', value: approval.decision_reason ?? '' }] : []),
      ]} />
      {approval.state === 'pending' && (
        <CommandReview action="observation.upload.approve" object={{ type: 'QAR', id: caseId, version: null, title: 'Held upload', state: approval.state }}
          digest={null} payloadReview={{ payload, contract: APPROVAL_SERVER_CONTRACT }} eligibility={elig} consequence={approvalConsequence(decision)}
          actionLabel={label} pendingLabel={decision === 'approve' ? 'Approving' : 'Declining'} variant={decision === 'approve' ? 'primary' : 'critical'}
          extraReasons={reason.trim().length < 8 ? ['state the reason for your decision (8+ characters, recorded with your name)'] : []}
          receipt={receipt} problem={problem}
          onRun={async () => {
            setProblem(null); setOutcome(null);
            const r = await intake.decide(scope, approval.approval_id, decision, reason);
            if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'refused'); throw new Error('refused'); }
            setReceipt(r.data.receipt);
            setOutcome(r.data.review_refused !== undefined
              ? `the upload is ${String(r.data.approval['state'])}; the quarantine review then refused (${r.data.review_refused.status}): ${r.data.review_refused.message}`
              : `the upload is ${String(r.data.approval['state'])}; its case was ${decision === 'approve' ? 'released into evidence' : 'rejected — the bytes are kept in the quarantine volume'}`);
            setReason('');
            await onDecided();
          }}>
          <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
            <legend className="eye-authority-small">Your decision</legend>
            <label><input type="radio" name={`${id}-d`} checked={decision === 'approve'} onChange={() => setDecision('approve')} /> Approve — release it into evidence</label>{' '}
            <label><input type="radio" name={`${id}-d`} checked={decision === 'decline'} onChange={() => setDecision('decline')} /> Decline — reject its case (the bytes and the case are kept)</label>
          </fieldset>
          <label htmlFor={`${id}-r`} className="eye-authority-small">Reason for the decision — recorded with your name</label>
          <input id={`${id}-r`} className="eye-authority-input eye-authority-wide" value={reason} onChange={(e) => setReason(e.target.value)} />
        </CommandReview>
      )}
      {outcome !== null && <LiveStatus>{outcome}</LiveStatus>}
    </section>
  );
}
