'use client';
/**
 * CP-6 B40 §IN (F-P1-03: PR-16-001/-002, CAP-OB-11/-12, SP-22) — ONE INTAKE CASE: WHY IT IS QUARANTINED. What the server recorded
 * (observation.intake_case_read, observation.inspection.read — metadata only): the case and its reason, every engine's verdict with its
 * identity (version, image digest, rule set, the signature databases) and its configuration (the ClamAV database source and update
 * policy; the sandbox), the findings by code, class and byte offset — never content (D9) —, the assessment (review reason, duplicate
 * state, quality with its basis, the content rules, the consumer notice), a held upload and its approval (SP-22), the case's events and the
 * custody of its bytes. The bytes around a finding are a SEPARATE read under observation.evidence.retrieve (D9: only a role that already
 * reads evidence bytes; a refusal shown in the server's words). Release and rejection stay on the queue (the hosted journey's path); the
 * held upload's decision is here, through CommandReview. Nothing optimistic: every state shown is the server's answer.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useShell } from '../../layout';
import { Empty, Mono, UnknownNote, fmtBytes } from '../../../../components/observation';
import { ErrorNote } from '../../../../components/ui';
import { DefinitionList } from '../../../../components/data';
import { Timestamp } from '../../../../components/text';
import { CaseExcerpt, IntakeAssessment, UploadApprovalReview, VerdictList } from '../../../../components/intake';
import { classLabel, intake, reviewReasonLabel, type CaseRead, type Finding } from '../../../../lib/intake-b40';

export default function IntakeCasePage() {
  const { scope, me } = useShell();
  const params = useParams<{ caseId: string }>();
  const caseId = String(params?.caseId ?? '');
  const [data, setData] = useState<CaseRead | null>(null);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);
  const [finding, setFinding] = useState<Finding | null>(null);

  const load = useCallback(async () => {
    const r = await intake.readCase(scope, caseId);
    if (r.ok && r.data !== undefined) { setData(r.data.intake); setError(null); } else setError(r.error ?? null);
  }, [scope, caseId]);
  useEffect(() => { void load(); }, [load]);

  const c = data?.case;
  return (
    <>
      <p style={{ marginBlock: 0 }}><Link href="/observation/quarantine">Back to the quarantine queue</Link></p>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 'var(--eye-space-8)' }}>Intake case</h1>
      <UnknownNote>
        <strong>Quarantined — not admitted.</strong> This page shows why: the engines&apos; verdicts and the rules that applied, cited by code and
        byte offset. The bytes themselves are read only on request, by a role that already reads evidence bytes.
      </UnknownNote>
      <ErrorNote error={error} />
      {data === null || c === undefined ? (error === null ? <Empty>Loading the case…</Empty> : null) : (
        <>
          <section aria-label="The case">
            <h2 style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockEnd: 'var(--eye-space-4)' }}>{classLabel(c.reason_class)}</h2>
            <p style={{ margin: 0 }}>{c.reason}</p>
            <DefinitionList label="Case" items={[
              { term: 'State', value: c.state },
              { term: 'Review reason', value: reviewReasonLabel(c.review_reason) },
              { term: 'Source', value: data.source === null ? String(c.source_id) : `${data.source.name} (${data.source.source_key}) v${c.contract_version} — ${data.source.schema_ref}` },
              { term: 'Item', value: <Mono>{c.item_key.slice(0, 96)}</Mono> },
              { term: 'Declared / sniffed type', value: `${c.declared_type ?? 'none'} / ${c.sniffed_type ?? 'unrecognised'}` },
              { term: 'Bytes', value: fmtBytes(c.byte_length) },
              { term: 'Digest', value: c.content_digest ?? 'not recorded', mono: true },
              { term: 'Opened', value: <Timestamp value={c.opened_at} /> },
              { term: 'Expires', value: <><Timestamp value={c.expires_at} />{c.past_expiry ? <strong> — past expiry, not expired by the sweeper</strong> : null}</> },
              ...(c.closed_at !== null ? [{ term: 'Closed', value: <><Timestamp value={c.closed_at} /> by <Mono>{String(c.review_actor ?? '')}</Mono>: {c.review_reason_text ?? ''}</> }] : []),
              { term: 'Manual upload', value: data.manual_upload ? (data.you_uploaded ? 'uploaded by you — a second person reviews it (D9b)' : 'uploaded by another person — you may review it if you hold collection_manager') : 'no — collected by its connector' },
            ]} />
          </section>

          <VerdictList verdicts={data.verdicts} onFinding={(f) => setFinding(f)} caption="Why: every engine's verdict" />
          {finding !== null && <CaseExcerpt scope={scope} caseId={caseId} finding={finding} onClose={() => setFinding(null)} />}

          <section aria-label="Assessment">
            <h3 style={{ fontSize: 'var(--eye-type-heading-4)' }}>Assessment</h3>
            {data.not_recorded_statement !== null && <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>{data.not_recorded_statement}</p>}
            <IntakeAssessment assessment={data.assessment} />
          </section>

          {data.upload_approval !== null && (
            <UploadApprovalReview scope={scope} caseId={caseId} approval={data.upload_approval}
              me={{ principalId: me.principalId, kind: me.kind, roles: me.bindings.filter((b) => b.domainId === scope.domainId || b.scope === 'TENANT').map((b) => b.roleCode) }}
              onDecided={load} />
          )}
          {data.upload_approval_events.length > 0 && (
            <section aria-label="Upload approval events">
              <h3 style={{ fontSize: 'var(--eye-type-heading-4)' }}>Approval history</h3>
              <ol>{data.upload_approval_events.map((e, i) => <li key={i}>{e.event} — <Mono>{e.actor}</Mono>, <Timestamp value={e.occurred_at} /></li>)}</ol>
            </section>
          )}

          <section aria-label="Case events and custody">
            <h3 style={{ fontSize: 'var(--eye-type-heading-4)' }}>Case events and custody</h3>
            <ol aria-label="Case events">{data.events.map((e, i) => <li key={`e-${i}`}>{String(e['event'])} — <Mono>{String(e['actor'])}</Mono>, <Timestamp value={String(e['occurred_at'] ?? '') || null} /></li>)}</ol>
            <ol aria-label="Custody of the bytes">{data.custody.map((e, i) => <li key={`c-${i}`}>{e.event} — <Mono>{e.actor}</Mono>, <Timestamp value={e.occurred_at} />{e.digest_verified === true ? ' · digest verified' : e.digest_verified === false ? ' · digest NOT verified' : ''}</li>)}</ol>
            <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>Release and rejection are on the quarantine queue; the case, its verdicts and its bytes are kept whatever the decision.</p>
          </section>
        </>
      )}
    </>
  );
}
