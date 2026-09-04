'use client';
/**
 * The review queue.
 *
 * Low-confidence output and abstentions land here and cannot be cleared from
 * anywhere else. Two things the screen refuses to blur:
 *
 *  * an ABSTENTION is shown as an abstention, with no claim and no confidence —
 *    never as an empty result or a zero-confidence claim;
 *  * a decision needs a written reason, and the button stays disabled until there
 *    is one. The server refuses a reasonless decision regardless; this only makes
 *    the rule visible before the round trip.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { intelligence, type ReviewCase } from '../../../lib/intelligence';
import { Empty, GovernedButton, LiveStatus, Mono, ScrollBox, cardStyle,
  textareaStyle, fmtInstant } from '../../../components/observation';

export default function ReviewPage() {
  const { scope, isExtractionManager } = useShell();
  const [queue, setQueue] = useState<ReviewCase[] | null>(null);
  const [active, setActive] = useState<ReviewCase | null>(null);
  const [reason, setReason] = useState('');
  const [value, setValue] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = async () => {
    const r = await intelligence.reviewQueue(scope);
    if (!r.ok || r.data === undefined) {
      setProblem(r.error?.message ?? 'the review queue could not be read');
      return;
    }
    setQueue(r.data.queue);
  };

  useEffect(() => { void load(); }, [scope]);

  const decide = async (decision: 'approve' | 'correct' | 'reject') => {
    if (active === null) return;
    setProblem(null);
    const corrected = decision === 'correct' && value.trim().length > 0
      ? { object_value: value.trim() } : undefined;
    const r = await intelligence.decideReview(scope, active.case_id, decision, reason, corrected);
    if (!r.ok || r.data === undefined) {
      setProblem(r.error?.message ?? 'the decision was refused');
      return;
    }
    setReceipt(
      `${r.data.review.state}${r.data.review.newVersion === null ? ''
        : ` — the claim is now version ${r.data.review.newVersion}; the prior version is unchanged`}`
      + ` · committed — POL ${r.data.receipt.policyDecisionId.slice(0, 8)}… · audit #${r.data.receipt.auditSeq}`,
    );
    setActive(null); setReason(''); setValue('');
    await load();
  };

  if (problem !== null && queue === null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (queue === null) return <Empty>reading the review queue…</Empty>;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Review</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)', maxInlineSize: '62ch' }}>
        Output below the method’s review threshold, and every abstention, waits here for a person.
        A correction admits a new version of the claim; the prior version stays retrievable.
      </p>

      {receipt === null ? null : <LiveStatus>{receipt}</LiveStatus>}
      {problem === null ? null : <LiveStatus assertive>{problem}</LiveStatus>}

      {queue.length === 0 ? (
        <Empty>Nothing is waiting for review.</Empty>
      ) : (
        <table className="eye-table" style={{ inlineSize: '100%', borderCollapse: 'collapse' }}>
          <caption style={{ captionSide: 'top', textAlign: 'start', color: 'var(--eye-color-ink-muted)' }}>
            {queue.length} case(s), least confident first
          </caption>
          <thead>
            <tr>
              <th scope="col">Why</th><th scope="col">Confidence</th>
              <th scope="col">Claim</th><th scope="col">Opened</th><th scope="col">Decide</th>
            </tr>
          </thead>
          <tbody>
            {queue.map((c) => (
              <tr key={c.case_id}>
                <td data-label="Why">
                  {c.queued_reason === 'abstained' ? (
                    <span>
                      <span aria-hidden="true">⊘ </span>the model abstained
                    </span>
                  ) : 'below the review threshold'}
                </td>
                <td data-label="Confidence">
                  {c.confidence === null
                    ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>none — an abstention has no confidence</span>
                    : <Mono>{Number(c.confidence).toFixed(2)}</Mono>}
                </td>
                <td data-label="Claim">
                  {c.claim_object_id === null
                    ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>no claim was made</span>
                    : <Mono title={c.claim_object_id}>{c.claim_object_id.slice(0, 12)}…</Mono>}
                </td>
                <td data-label="Opened">{fmtInstant(c.opened_at)}</td>
                <td data-label="Decide">
                  <button
                    type="button"
                    onClick={() => { setActive(c); setReason(''); setValue(''); }}
                    disabled={!isExtractionManager}
                    title={isExtractionManager ? undefined
                      : 'deciding a review case needs the extraction_manager role in this domain'}
                    style={{ background: 'none', border: '1px solid var(--eye-color-border-default)',
                             borderRadius: 'var(--eye-radius-md)', padding: '0.25rem 0.6rem',
                             cursor: isExtractionManager ? 'pointer' : 'not-allowed' }}
                  >
                    Open
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {active === null ? null : (
        <section aria-labelledby="dec-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="dec-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>
            Decide this case
          </h2>
          <ScrollBox label="The case as stored">{JSON.stringify(active, null, 2)}</ScrollBox>
          <label htmlFor="reason" style={{ display: 'block', marginBlockStart: 'var(--eye-space-16)' }}>
            Reason <span style={{ color: 'var(--eye-color-ink-muted)' }}>(required, at least 8 characters)</span>
          </label>
          <textarea
            id="reason" value={reason} onChange={(e) => setReason(e.target.value)}
            style={textareaStyle} rows={3}
          />
          {active.claim_object_id === null ? null : (
            <>
              <label htmlFor="value" style={{ display: 'block', marginBlockStart: 'var(--eye-space-8)' }}>
                Corrected value <span style={{ color: 'var(--eye-color-ink-muted)' }}>(only for a correction)</span>
              </label>
              <textarea
                id="value" value={value} onChange={(e) => setValue(e.target.value)}
                style={textareaStyle} rows={2}
              />
            </>
          )}
          <div style={{ display: 'flex', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-16)', flexWrap: 'wrap' }}>
            <GovernedButton
              label="Approve as extracted" pendingLabel="approving…"
              onRun={() => decide('approve')} disabled={reason.trim().length < 8}
            />
            {active.claim_object_id === null ? null : (
              <GovernedButton
                label="Correct — admits a new version" pendingLabel="correcting…"
                onRun={() => decide('correct')} disabled={reason.trim().length < 8}
              />
            )}
            <GovernedButton
              label="Reject" pendingLabel="rejecting…" variant="critical"
              onRun={() => decide('reject')} disabled={reason.trim().length < 8}
            />
            <button type="button" onClick={() => setActive(null)}
              style={{ background: 'none', border: 'none', color: 'var(--eye-color-accent-default)', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </section>
      )}
    </>
  );
}
