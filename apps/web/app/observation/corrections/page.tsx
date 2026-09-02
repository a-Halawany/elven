'use client';
/**
 * Corrections and withdrawals.
 *
 * The propagation scope is the honest part of this screen. Phase 1 has no
 * dependency graph, so it cannot know what consumed an object. Every case
 * therefore states what it RESOLVED and, in words, what it did not:
 *
 *   "downstream consumers not yet present (KG/dependency graph arrives Phase 3)"
 *
 * That sentence is stored on the case, not rendered here — so it survives into
 * the record rather than living only in the interface that displayed it.
 */
import { useCallback, useEffect, useState } from 'react';
import { useShell } from '../layout';
import { observation, type SourceSummary } from '../../../lib/observation';
import {
  Empty, GovernedButton, LiveStatus, Mono, ScrollBox, UnknownNote,
  badgeRowStyle, cardStyle, fmtInstant, textareaStyle,
} from '../../../components/observation';
import { ErrorNote, Receipt } from '../../../components/ui';

export default function CorrectionsPage() {
  const { scope, isCollectionManager } = useShell();
  const [cases, setCases] = useState<Array<Record<string, unknown>> | null>(null);
  const [sources, setSources] = useState<SourceSummary[]>([]);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [outcome, setOutcome] = useState<string | null>(null);

  // submission form
  const [sourceId, setSourceId] = useState('');
  const [kind, setKind] = useState<'correction' | 'withdrawal' | 'supersession'>('correction');
  const [channel, setChannel] = useState('operator');
  const [publisherRef, setPublisherRef] = useState('');
  const [reason, setReason] = useState('');
  const [affected, setAffected] = useState<string[]>([]);
  const [evidenceChoices, setEvidenceChoices] = useState<Array<Record<string, unknown>>>([]);

  const load = useCallback(async () => {
    const [c, s] = await Promise.all([observation.listCorrections(scope), observation.listSources(scope)]);
    if (c.ok && c.data !== undefined) { setCases(c.data.corrections); setError(null); } else setError(c.error ?? null);
    if (s.ok && s.data !== undefined) setSources(s.data.sources);
  }, [scope]);

  useEffect(() => { void load(); }, [load]);

  const loadEvidenceFor = useCallback(async (id: string) => {
    setAffected([]);
    if (id === '') { setEvidenceChoices([]); return; }
    const r = await observation.listEvidence(scope, id);
    setEvidenceChoices(r.ok && r.data !== undefined ? r.data.evidence : []);
  }, [scope]);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Corrections &amp; withdrawals</h1>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      {outcome !== null && <LiveStatus assertive>{outcome}</LiveStatus>}

      {/* ── submit ─────────────────────────────────────────────────── */}
      <section aria-labelledby="submit" style={cardStyle}>
        <h2 id="submit" style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>Submit a correction or withdrawal</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-12)' }}>
          <label style={labelStyle}>
            <span>Source</span>
            <select
              value={sourceId}
              onChange={(e) => { setSourceId(e.target.value); void loadEvidenceFor(e.target.value); }}
              style={controlStyle}
            >
              <option value="">choose a source…</option>
              {sources.map((s) => <option key={s.source_id} value={s.source_id}>{s.name}</option>)}
            </select>
          </label>
          <label style={labelStyle}>
            <span>Kind</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as typeof kind)} style={controlStyle}>
              <option value="correction">correction</option>
              <option value="withdrawal">withdrawal</option>
              <option value="supersession">supersession</option>
            </select>
          </label>
          <label style={labelStyle}>
            <span>Channel</span>
            <input value={channel} onChange={(e) => setChannel(e.target.value)} style={controlStyle} />
          </label>
          <label style={labelStyle}>
            <span>Publisher reference</span>
            <input value={publisherRef} onChange={(e) => setPublisherRef(e.target.value)} style={controlStyle} />
          </label>
        </div>

        <label style={{ ...labelStyle, marginBlockStart: 'var(--eye-space-8)' }}>
          <span>Reason — recorded on the case</span>
          <textarea value={reason} onChange={(e) => setReason(e.target.value)} style={textareaStyle} />
        </label>

        {evidenceChoices.length > 0 && (
          <fieldset style={{ border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)', marginBlock: 'var(--eye-space-8)' }}>
            <legend style={{ fontSize: 'var(--eye-type-label-sm)', textTransform: 'uppercase', color: 'var(--eye-color-ink-muted)' }}>
              Affected evidence — the claim is verified against what this domain holds
            </legend>
            <div style={{ maxBlockSize: '12rem', overflowY: 'auto' }}>
              {evidenceChoices.map((e) => {
                const id = String(e['object_id']);
                return (
                  <label key={id} style={{ display: 'flex', gap: 'var(--eye-space-8)', alignItems: 'center', paddingBlock: 'var(--eye-space-4)' }}>
                    <input
                      type="checkbox"
                      checked={affected.includes(id)}
                      onChange={(ev) => setAffected(ev.target.checked ? [...affected, id] : affected.filter((x) => x !== id))}
                    />
                    <Mono>{id.slice(0, 8)}…</Mono>
                    <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
                      v{Number(e['object_version'])} · {String(e['lifecycle_state'])}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
        )}

        <GovernedButton
          label="Submit" pendingLabel="Submitting"
          disabled={sourceId === '' || reason.trim().length < 8}
          onRun={async () => {
            const r = await observation.submitCorrection(scope, {
              sourceId, kind, channel,
              publisherRef: publisherRef === '' ? null : publisherRef,
              reason, affectedEvdIds: affected,
            });
            if (!r.ok) { setError(r.error ?? null); throw new Error('refused'); }
            setReceipt(r.data?.receipt ?? null);
            setOutcome('correction case opened; it is not applied until a collection manager reviews it');
            setReason(''); setAffected([]);
            await load();
          }}
        />
      </section>

      {/* ── cases ──────────────────────────────────────────────────── */}
      <section aria-labelledby="cases" style={{ marginBlockStart: 'var(--eye-space-24)' }}>
        <h2 id="cases" style={{ fontSize: 'var(--eye-type-heading-3)' }}>Cases</h2>
        {cases === null ? <Empty>Loading correction cases…</Empty>
          : cases.length === 0 ? <Empty>No correction has been received in this domain.</Empty> : (
          <div style={{ display: 'grid', gap: 'var(--eye-space-12)' }}>
            {cases.map((c) => (
              <CorrectionCase
                key={String(c['case_id'])}
                c={c}
                canApply={isCollectionManager}
                onApplied={async (msg, rec) => { setOutcome(msg); setReceipt(rec); await load(); }}
                onError={(e) => setError(e)}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function CorrectionCase({ c, canApply, onApplied, onError }: {
  c: Record<string, unknown>;
  canApply: boolean;
  onApplied: (msg: string, receipt: { policyDecisionId: string; auditSeq: number } | null) => Promise<void>;
  onError: (e: { code: string; message: string; correlationId: string } | null) => void;
}) {
  const { scope } = useShell();
  const caseId = String(c['case_id']);
  const state = String(c['state']);
  const resolved = (c['affected_resolved'] ?? []) as Array<Record<string, unknown>>;
  const [reason, setReason] = useState('');
  const [claims, setClaims] = useState<string[]>([]);
  const [choices, setChoices] = useState<Array<Record<string, unknown>>>([]);

  useEffect(() => {
    if (state !== 'received' && state !== 'validated') return;
    void (async () => {
      const r = await observation.listEvidence(scope, String(c['source_id']));
      if (r.ok && r.data !== undefined) {
        setChoices(r.data.evidence);
        setClaims(r.data.evidence.map((e) => String(e['object_id'])));
      }
    })();
  }, [scope, c, state]);

  const openForReview = state === 'received' || state === 'validated';

  return (
    <article style={cardStyle} aria-labelledby={`c-${caseId}`}>
      <h3 id={`c-${caseId}`} style={{ marginBlockStart: 0, fontSize: 'var(--eye-type-heading-3)' }}>
        {String(c['kind'])} · <Mono>{caseId.slice(0, 8)}…</Mono>{' '}
        <span style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>{state}</span>
      </h3>
      <p style={{ margin: 0 }}>{String(c['reason'])}</p>
      <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)', marginBlock: 'var(--eye-space-4)' }}>
        received <Mono>{fmtInstant(c['received_at'])}</Mono> via {String(c['channel'])}
        {c['publisher_ref'] != null && <> · publisher ref <Mono>{String(c['publisher_ref'])}</Mono></>}
      </p>

      {resolved.length > 0 && (
        <ScrollBox label={`Objects superseded by case ${caseId}`}>
          <table className="eye-table">
            <caption>Objects this case superseded. The prior version stays retrievable.</caption>
            <thead><tr><th scope="col">Object</th><th scope="col">From</th><th scope="col">To</th></tr></thead>
            <tbody>
              {resolved.map((r, i) => (
                <tr key={i}>
                  <td data-label="Object"><Mono>{String(r['object_id']).slice(0, 8)}…</Mono></td>
                  <td data-label="From">v{Number(r['from'])}</td>
                  <td data-label="To">v{Number(r['to'])}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
      )}

      <UnknownNote>
        <strong>Propagation scope.</strong> Resolved: {resolved.length} object{resolved.length === 1 ? '' : 's'}.
        Unresolved: {String(c['propagation_unresolved'])}. Nothing downstream is claimed to be corrected, because
        nothing downstream exists yet to correct.
      </UnknownNote>

      {openForReview && (
        <div style={{ borderBlockStart: '1px solid var(--eye-color-border-default)', paddingBlockStart: 'var(--eye-space-8)' }}>
          {!canApply && (
            <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
              Applying a correction requires the <strong>collection_manager</strong> binding in this domain.
            </p>
          )}
          <fieldset style={{ border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)' }}>
            <legend style={{ fontSize: 'var(--eye-type-label-sm)', textTransform: 'uppercase', color: 'var(--eye-color-ink-muted)' }}>
              Objects to supersede
            </legend>
            <div style={{ maxBlockSize: '10rem', overflowY: 'auto' }}>
              {choices.map((e) => {
                const id = String(e['object_id']);
                return (
                  <label key={id} style={{ display: 'flex', gap: 'var(--eye-space-8)', alignItems: 'center', paddingBlock: 'var(--eye-space-4)' }}>
                    <input
                      type="checkbox"
                      checked={claims.includes(id)}
                      onChange={(ev) => setClaims(ev.target.checked ? [...claims, id] : claims.filter((x) => x !== id))}
                    />
                    <Mono>{id.slice(0, 8)}…</Mono>
                    <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
                      v{Number(e['object_version'])}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>
          <label style={{ ...labelStyle, marginBlockStart: 'var(--eye-space-8)' }}>
            <span>Review reason</span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} style={textareaStyle} />
          </label>
          <div style={badgeRowStyle}>
            <GovernedButton
              label="Apply" pendingLabel="Applying"
              disabled={claims.length === 0}
              onRun={async () => {
                const r = await observation.applyCorrection(scope, caseId, 'apply', claims, reason);
                if (!r.ok) { onError(r.error ?? null); throw new Error('refused'); }
                const applied = r.data?.correction as Record<string, unknown> | undefined;
                await onApplied(
                  `case ${caseId.slice(0, 8)}… ${String(applied?.['state'] ?? 'processed')}`,
                  r.data?.receipt ?? null);
              }}
            />
            <GovernedButton
              label="Reject" pendingLabel="Rejecting" variant="critical"
              onRun={async () => {
                const r = await observation.applyCorrection(scope, caseId, 'reject', [], reason);
                if (!r.ok) { onError(r.error ?? null); throw new Error('refused'); }
                await onApplied(`case ${caseId.slice(0, 8)}… rejected`, r.data?.receipt ?? null);
              }}
            />
          </div>
        </div>
      )}
    </article>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'grid',
  gap: 'var(--eye-space-4)',
  fontSize: 'var(--eye-type-label-sm)',
  textTransform: 'uppercase',
  color: 'var(--eye-color-ink-muted)',
};

const controlStyle: React.CSSProperties = {
  blockSize: 'var(--eye-size-control-md)',
  border: '1px solid var(--eye-color-border-default)',
  borderRadius: 'var(--eye-radius-md)',
  paddingInline: 'var(--eye-space-8)',
  background: 'var(--eye-color-surface-primary)',
  color: 'var(--eye-color-ink-default)',
  fontSize: 'var(--eye-type-body-md)',
  textTransform: 'none',
};
