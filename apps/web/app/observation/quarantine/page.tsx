'use client';
/**
 * Quarantine queue — and, since B40 §IN (F-P1-03: PR-16-001/-002, CAP-OB-11), THE INTAKE REVIEW QUEUE.
 *
 * The heading states the fact the operator most needs: quarantined bytes are NOT
 * admitted, they live in the quarantine volume, and they never reach evidence.
 * Quarantine and evidence are separate volumes, not separate folders.
 *
 * Release and discard both open a dialog that requires a reason. Neither button
 * acts directly, and neither succeeds for an operator without the
 * collection_manager binding — the rule is enforced in the pipeline, so the
 * refusal is real rather than cosmetic.
 *
 * B40 §IN: each case now carries what the server recorded about it (observation.intake_review_queue): its review reason (safety,
 * authenticity, policy, duplicate, quality, rights, integrity, schema, identity), every engine's outcome in brief (DESIGN D2: only a clean
 * scan admits), the duplicate state and the quality score — or "not recorded before B40" for an earlier case —, a manual upload's
 * reviewer rule (D9b: the uploader's own controls are disabled with the reason, and the server refuses regardless), a held upload awaiting a
 * second person's approval (SP-22), and an open case past its expiry ("not expired by the sweeper" — D16: shown, never touched). The case's
 * WHY (verdicts, findings by offset, the excerpt under evidence.retrieve, the approval) is its own page. The hosted journey 8's selectors
 * are kept: one <article> per case, newest first; "Release…" / "Discard…"; the reason label; the "Discard" confirmation; the receipt.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useShell } from '../layout';
import { observation } from '../../../lib/observation';
import {
  Empty, GovernedButton, LiveStatus, Mono, UnknownNote,
  badgeRowStyle, cardStyle, fmtBytes, textareaStyle,
} from '../../../components/observation';
import { ErrorNote, Receipt } from '../../../components/ui';
/* B81 re: the local definition-row `Field` (a fork of the library's name — dg-lint-2's ratchet) migrated onto the library's DefinitionList */
import { DefinitionList } from '../../../components/data';
/* end B81 re */
/* B40 in */
import { NumberValue, Timestamp } from '../../../components/text';
import { InspectionOutcomeMark } from '../../../components/intake';
import { D2_SENTENCE, classLabel, duplicateWords, intake, reviewControls, reviewReasonLabel, scoreOf, type QueueCase } from '../../../lib/intake-b40';
/* end B40 in */

type CaseRow = Record<string, unknown> & Partial<QueueCase>;

export default function QuarantinePage() {
  const { scope, isCollectionManager } = useShell();
  const [cases, setCases] = useState<CaseRow[] | null>(null);
  const [counts, setCounts] = useState<{ open: number; past_expiry: number; held_uploads: number } | null>(null);
  const [stateShown, setStateShown] = useState<'open' | 'all'>('open');
  const [degraded, setDegraded] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [open, setOpen] = useState<{ caseId: string; decision: 'release' | 'discard' } | null>(null);
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<string | null>(null);

  const load = useCallback(async () => {
    /* B40 in: the intake review read first (the reasons, verdicts and assessments); the plain quarantine list when it is not available */
    const q = await intake.queue(scope, stateShown);
    if (q.ok && q.data !== undefined) {
      setCases(q.data.queue.cases as CaseRow[]); setCounts(q.data.queue.counts); setDegraded(null); setError(null); return;
    }
    const r = await observation.listQuarantine(scope, stateShown === 'all' ? null : 'open');
    if (r.ok && r.data !== undefined) {
      setCases(r.data.cases); setCounts(null); setError(null);
      setDegraded(`the intake review read answered ${q.error?.code ?? 'an error'} (${q.error?.message ?? 'no reason given'}) — the cases are listed without their reasons and verdicts`);
    } else setError(r.error ?? null);
    /* end B40 in */
  }, [scope, stateShown]);

  useEffect(() => { void load(); }, [load]);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Quarantine</h1>
      <UnknownNote>
        <strong>Quarantined — not admitted.</strong> These bytes are stored in the quarantine volume and are never in
        the evidence volume. They are preserved so the refusal itself is reviewable: what arrived, and why it was
        refused, is evidence too.
      </UnknownNote>

      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      {outcome !== null && <LiveStatus assertive>{outcome}</LiveStatus>}

      {!isCollectionManager && (
        <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
          Releasing or discarding a quarantined item requires the <strong>collection_manager</strong> binding in this
          domain, which you do not hold. The controls remain visible because the rule is enforced by the pipeline —
          an attempt will be refused, with the reason shown.
        </p>
      )}

      {/* B40 in: the review queue's frame — the scan rule, the counts, the cases shown */}
      <section aria-label="Intake review" style={{ marginBlock: 'var(--eye-space-8)' }}>
        <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)', margin: 0 }}>
          {D2_SENTENCE} A manual upload is never reviewed by the person who uploaded it; an upload held by its contract waits for a second person&apos;s approval.
        </p>
        {counts !== null && (
          <p style={{ fontSize: 'var(--eye-type-body-sm)', marginBlock: 'var(--eye-space-4)' }}>
            Open: <NumberValue value={counts.open} /> · past expiry: <NumberValue value={counts.past_expiry} /> · uploads awaiting approval: <NumberValue value={counts.held_uploads} />
          </p>
        )}
        <label htmlFor="q-shown" style={{ fontSize: 'var(--eye-type-body-sm)' }}>Cases shown </label>
        <select id="q-shown" value={stateShown} onChange={(e) => setStateShown(e.target.value === 'all' ? 'all' : 'open')}>
          <option value="open">open cases</option>
          <option value="all">every case (closed ones kept as recorded)</option>
        </select>
        {degraded !== null && <p role="status" style={{ color: 'var(--eye-color-warning)', fontSize: 'var(--eye-type-body-sm)' }}>⚠ {degraded}</p>}
      </section>
      {/* end B40 in */}

      {cases === null ? <Empty>Loading the quarantine queue…</Empty>
        : cases.length === 0 ? <Empty>No item is currently quarantined.</Empty> : (
        <div style={{ display: 'grid', gap: 'var(--eye-space-12)' }}>
          {cases.map((c) => {
            const caseId = String(c['case_id']);
            const reasonClass = String(c['reason_class'] ?? 'unknown');
            /* B40 in: what a reviewer may do here — the role note above stays (the pipeline refuses), D9b and the held upload are said on the control */
            const ctl = reviewControls({ state: String(c['state'] ?? 'open'), you_uploaded: c.you_uploaded === true, upload_approval: c.upload_approval ?? null }, true);
            const verdicts = Array.isArray(c.verdicts) ? c.verdicts : [];
            const a = c.assessment ?? null;
            /* end B40 in */
            return (
              <article key={caseId} style={cardStyle} aria-labelledby={`q-${caseId}`}>
                <h2 id={`q-${caseId}`} style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>
                  <span style={{ color: 'var(--eye-color-warning)' }} aria-hidden="true">⊘ </span>
                  {classLabel(reasonClass)}
                </h2>
                <p style={{ margin: 0 }}>{String(c['reason'])}</p>
                <DefinitionList label="Quarantined item" items={[
                  { term: 'Item', value: <Mono>{String(c['item_key']).slice(0, 64)}</Mono> },
                  { term: 'Declared type', value: String(c['declared_type'] ?? 'none') },
                  { term: 'Sniffed type', value: String(c['sniffed_type'] ?? 'unrecognised') },
                  { term: 'Bytes', value: fmtBytes(c['byte_length']) },
                  { term: 'Digest', value: <Mono>{String(c['content_digest'] ?? '').slice(0, 16)}…</Mono> },
                  { term: 'Opened', value: <Timestamp value={String(c['opened_at'] ?? '') || null} /> },
                  { term: 'Expires', value: <>{<Timestamp value={String(c['expires_at'] ?? '') || null} />}{c.past_expiry === true ? <strong> — {c.expiry_statement}</strong> : null}</> },
                  /* B40 in */
                  ...(c.review_reason !== undefined ? [{ term: 'Review reason', value: reviewReasonLabel(c.review_reason) }] : []),
                  ...(c.schema_ref !== undefined ? [{ term: 'Contract', value: `${String(c.source_name ?? c.source_key ?? c['source_id'])} v${String(c['contract_version'])} (${c.schema_ref})` }] : []),
                  ...(c.recorded !== undefined ? [{ term: 'Inspection', value: verdicts.length === 0 ? (c.not_recorded_statement ?? 'no verdict recorded') : (
                      <span>{verdicts.map((v, i) => <span key={`${v.engine}-${i}`}>{i > 0 ? ' · ' : ''}{v.engine} <InspectionOutcomeMark outcome={v.outcome} />{v.finding_codes.length > 0 ? ` (${v.finding_codes.length} finding code${v.finding_codes.length === 1 ? '' : 's'})` : ''}</span>)}</span>) }] : []),
                  ...(a !== null ? [{ term: 'Duplicate state', value: duplicateWords(a.duplicate_state) },
                                    { term: 'Quality score', value: <NumberValue value={scoreOf(a.quality_score)} fractionDigits={3} /> }] : []),
                  ...(c.manual_upload === true ? [{ term: 'Manual upload', value: c.you_uploaded === true ? 'uploaded by you — a second person reviews it (D9b)' : 'uploaded by another person' }] : []),
                  ...(c.upload_approval ? [{ term: 'Upload approval', value: `${c.upload_approval.state} — ${c.upload_approval.held_because}` }] : []),
                  ...(a?.consumer_notice ? [{ term: 'Products resting on the source', value: a.consumer_notice.statement }] : []),
                  /* end B40 in */
                ]} />
                {/* B40 in: the case's why — the verdicts, the findings by offset, the excerpt, the approval */}
                <p style={{ marginBlock: 'var(--eye-space-4)' }}><Link href={`/observation/quarantine/${caseId}`}>Open the case&apos;s review</Link></p>
                {/* end B40 in */}

                {open?.caseId === caseId ? (
                  <div style={{ borderBlockStart: '1px solid var(--eye-color-border-default)', paddingBlockStart: 'var(--eye-space-8)' }}>
                    <label htmlFor={`reason-${caseId}`} style={{ display: 'block', fontSize: 'var(--eye-type-label-sm)', textTransform: 'uppercase', color: 'var(--eye-color-ink-muted)' }}>
                      Reason for {open.decision === 'release' ? 'releasing' : 'discarding'} — recorded with the decision
                    </label>
                    <textarea
                      id={`reason-${caseId}`}
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      style={textareaStyle}
                      aria-describedby={`reason-help-${caseId}`}
                    />
                    <p id={`reason-help-${caseId}`} style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)', marginBlock: 'var(--eye-space-4)' }}>
                      At least eight characters. The reason is stored on the case and cannot be edited afterwards.
                      {open.decision === 'discard' ? ' Discarding rejects the item; its bytes are kept in the quarantine volume and the case stays recorded.' : ''}
                    </p>
                    <div style={badgeRowStyle}>
                      <GovernedButton
                        label={open.decision === 'release' ? 'Release into evidence' : 'Discard'}
                        pendingLabel={open.decision === 'release' ? 'Releasing' : 'Discarding'}
                        variant={open.decision === 'release' ? 'primary' : 'critical'}
                        disabled={reason.trim().length < 8}
                        onRun={async () => {
                          const r = await observation.reviewQuarantine(scope, caseId, open.decision, reason);
                          if (!r.ok) { setError(r.error ?? null); setOutcome(null); throw new Error('refused'); }
                          setReceipt(r.data?.receipt ?? null);
                          setOutcome(`case ${caseId.slice(0, 8)}… ${open.decision === 'release' ? 'released into evidence' : 'discarded'}`);
                          setOpen(null); setReason('');
                          await load();
                        }}
                      />
                      <button
                        type="button"
                        onClick={() => { setOpen(null); setReason(''); }}
                        style={{ background: 'none', border: 'none', color: 'var(--eye-color-accent-default)', cursor: 'pointer' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div style={badgeRowStyle}>
                    <button
                      type="button"
                      onClick={() => { setOpen({ caseId, decision: 'release' }); setReason(''); }}
                      style={quietButton}
                      disabled={!ctl.release.enabled}
                      aria-describedby={ctl.release.enabled ? undefined : `rel-why-${caseId}`}
                    >
                      Release…
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOpen({ caseId, decision: 'discard' }); setReason(''); }}
                      style={quietButton}
                      disabled={!ctl.discard.enabled}
                      aria-describedby={ctl.discard.enabled ? undefined : `dis-why-${caseId}`}
                    >
                      Discard…
                    </button>
                    {/* B40 in: why a control is not available (D9b, the held upload) — in words, tied to the control */}
                    {!ctl.release.enabled && <span id={`rel-why-${caseId}`} style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>Release unavailable: {ctl.release.reason}</span>}
                    {!ctl.discard.enabled && <span id={`dis-why-${caseId}`} style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>Discard unavailable: {ctl.discard.reason}</span>}
                    {/* end B40 in */}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}

const quietButton: React.CSSProperties = {
  blockSize: 'var(--eye-size-control-md)',
  border: '1px solid var(--eye-color-border-strong)',
  borderRadius: 'var(--eye-radius-md)',
  paddingInline: 'var(--eye-space-12)',
  background: 'var(--eye-color-surface-primary)',
  color: 'var(--eye-color-ink-default)',
  fontWeight: 600,
  cursor: 'pointer',
};
