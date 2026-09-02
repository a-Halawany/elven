'use client';
/**
 * Quarantine queue.
 *
 * The heading states the fact the operator most needs: quarantined bytes are NOT
 * admitted, they live in the quarantine volume, and they never reach evidence.
 * Quarantine and evidence are separate volumes, not separate folders.
 *
 * Release and discard both open a dialog that requires a reason. Neither button
 * acts directly, and neither succeeds for an operator without the
 * collection_manager binding — the rule is enforced in the pipeline, so the
 * refusal is real rather than cosmetic.
 */
import { useCallback, useEffect, useState } from 'react';
import { useShell } from '../layout';
import { observation } from '../../../lib/observation';
import {
  Empty, GovernedButton, LiveStatus, Mono, ScrollBox, UnknownNote,
  badgeRowStyle, cardStyle, fmtBytes, fmtInstant, textareaStyle,
} from '../../../components/observation';
import { ErrorNote, Receipt } from '../../../components/ui';

const REASON_LABEL: Record<string, string> = {
  path_traversal: 'Archive entry escapes the extraction root',
  type_mismatch: 'Declared and sniffed types disagree',
  schema_drift: 'Schema drift beyond the contract’s tolerance',
  expansion_limit: 'Declared expansion exceeds the limit',
  entry_limit: 'Archive declares too many entries',
  compression_ratio: 'Declared compression ratio is implausible',
  malformed_archive: 'Archive structure is unreadable',
  oversize: 'Payload exceeds the contract ceiling',
};

export default function QuarantinePage() {
  const { scope, isCollectionManager } = useShell();
  const [cases, setCases] = useState<Array<Record<string, unknown>> | null>(null);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [open, setOpen] = useState<{ caseId: string; decision: 'release' | 'discard' } | null>(null);
  const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await observation.listQuarantine(scope, 'open');
    if (r.ok && r.data !== undefined) { setCases(r.data.cases); setError(null); }
    else setError(r.error ?? null);
  }, [scope]);

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

      {cases === null ? <Empty>Loading the quarantine queue…</Empty>
        : cases.length === 0 ? <Empty>No item is currently quarantined.</Empty> : (
        <div style={{ display: 'grid', gap: 'var(--eye-space-12)' }}>
          {cases.map((c) => {
            const caseId = String(c['case_id']);
            const reasonClass = String(c['reason_class'] ?? 'unknown');
            return (
              <article key={caseId} style={cardStyle} aria-labelledby={`q-${caseId}`}>
                <h2 id={`q-${caseId}`} style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>
                  <span style={{ color: 'var(--eye-color-warning)' }} aria-hidden="true">⊘ </span>
                  {REASON_LABEL[reasonClass] ?? reasonClass}
                </h2>
                <p style={{ margin: 0 }}>{String(c['reason'])}</p>
                <dl style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))', gap: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-8)' }}>
                  <Field term="Item"><Mono>{String(c['item_key']).slice(0, 64)}</Mono></Field>
                  <Field term="Declared type">{String(c['declared_type'] ?? 'none')}</Field>
                  <Field term="Sniffed type">{String(c['sniffed_type'] ?? 'unrecognised')}</Field>
                  <Field term="Bytes">{fmtBytes(c['byte_length'])}</Field>
                  <Field term="Digest"><Mono>{String(c['content_digest'] ?? '').slice(0, 16)}…</Mono></Field>
                  <Field term="Opened"><Mono>{fmtInstant(c['opened_at'])}</Mono></Field>
                  <Field term="Expires"><Mono>{fmtInstant(c['expires_at'])}</Mono></Field>
                </dl>

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
                    >
                      Release…
                    </button>
                    <button
                      type="button"
                      onClick={() => { setOpen({ caseId, decision: 'discard' }); setReason(''); }}
                      style={quietButton}
                    >
                      Discard…
                    </button>
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

function Field({ term, children }: { term: string; children: React.ReactNode }) {
  return (
    <div>
      <dt style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)', textTransform: 'uppercase' }}>{term}</dt>
      <dd style={{ margin: 0 }}>{children}</dd>
    </div>
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
