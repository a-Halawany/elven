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
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle,
  textareaStyle, fmtInstant } from '../../../components/observation';
/* B81 har (PAT-06): the decision through the library's COMMAND REVIEW, labelled with the authority its PDP rule gives it — extraction review
   authority, never decision authority — and the decided case as a REVIEW RECORD */
import { CommandReview, ReviewRecord } from '../../../components/authority';
import { eligibility, rolesIn, type ReviewRecordModel } from '../../../lib/authority-b81';
import { HAR_ACT_ROLES, INTELLIGENCE_DECISIONS, INTELLIGENCE_LABEL, INTELLIGENCE_REVIEW_AUTHORITY, extractionReviewRecord, statedConsequence, type IntelligenceDecision } from '../../../lib/authority-har-b81';
import { reviewDigest } from '../../../lib/forms-b80';
/* end B81 har */

export default function ReviewPage() {
  const { scope, me, isExtractionManager } = useShell();
  const [queue, setQueue] = useState<ReviewCase[] | null>(null);
  const [active, setActive] = useState<ReviewCase | null>(null);
  const [reason, setReason] = useState('');
  const [value, setValue] = useState('');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  /* B81 har: the decision chosen (approve, correct, reject — distinct acts, HX-12), the digest of the case AS SHOWN, the last decided record */
  const [decision, setDecision] = useState<IntelligenceDecision>('approve');
  const [caseDigest, setCaseDigest] = useState<string | null>(null);
  const [record, setRecord] = useState<ReviewRecordModel | null>(null);
  useEffect(() => { setCaseDigest(null); if (active !== null) void reviewDigest(active).then(setCaseDigest); }, [active]);
  /* end B81 har */

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
      const m = r.error?.message ?? 'the decision was refused';
      setProblem(m);
      throw new Error(m);
    }
    /* B81 har: the decided case as a review record — the reviewer is the acting principal the receipt binds; the state is the server's */
    setRecord(extractionReviewRecord(active, r.data.review, me.principalId, reason.trim(), caseDigest));
    /* end B81 har */
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
      {/* B81 har */}{record === null ? null : <ReviewRecord record={record} />}{/* end B81 har */}
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
                    onClick={() => { setActive(c); setReason(''); setValue(''); setDecision('approve'); }}
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
          {/* B81 har: the decision through the COMMAND REVIEW — the case as shown (its digest), the stated consequence of the chosen act,
              the authority its PDP rule gives (extraction review — NOT decision authority), eligibility; the reason the server requires */}
          <p className="eye-authority-small"><strong>Authority:</strong> {INTELLIGENCE_REVIEW_AUTHORITY.label} ({INTELLIGENCE_REVIEW_AUTHORITY.rule} — {INTELLIGENCE_REVIEW_AUTHORITY.basis}). {INTELLIGENCE_REVIEW_AUTHORITY.scope}.</p>
          <CommandReview action={INTELLIGENCE_REVIEW_AUTHORITY.rule} object={{ type: 'review case', id: active.case_id, version: active.claim_version, title: active.queued_reason === 'abstained' ? 'An abstention (no claim was made)' : `A claim ${active.queued_reason.replace(/_/g, ' ')}`, state: active.state }}
            digest={caseDigest} eligibility={eligibility({ action: INTELLIGENCE_REVIEW_AUTHORITY.rule, me: me.principalId, isHuman: true, roles: rolesIn(me.bindings, scope), requiredRoles: HAR_ACT_ROLES[INTELLIGENCE_REVIEW_AUTHORITY.rule]!, state: active.state, openStates: ['queued'] })}
            consequence={statedConsequence(`${INTELLIGENCE_REVIEW_AUTHORITY.rule}:${decision}`)}
            extraReasons={reason.trim().length < 8 ? ['state your reason (at least 8 characters)'] : []}
            actionLabel={INTELLIGENCE_LABEL[decision]} pendingLabel="deciding…" variant={decision === 'reject' ? 'critical' : 'primary'}
            onRun={() => decide(decision)}>
            <fieldset style={{ border: 'none', padding: 0, marginBlockStart: 'var(--eye-space-8)' }}>
              <legend>The decision (each is its own recorded act)</legend>
              {INTELLIGENCE_DECISIONS.filter((d) => d !== 'correct' || active.claim_object_id !== null).map((d) => (
                <label key={d} style={{ marginInlineEnd: 'var(--eye-space-12)' }}><input type="radio" name="review-decision" checked={decision === d} onChange={() => setDecision(d)} /> {INTELLIGENCE_LABEL[d]}</label>
              ))}
            </fieldset>
          </CommandReview>
          <button type="button" onClick={() => setActive(null)}
            style={{ background: 'none', border: 'none', color: 'var(--eye-color-accent-default)', cursor: 'pointer' }}>
            Cancel
          </button>
          {/* end B81 har */}
        </section>
      )}
    </>
  );
}
