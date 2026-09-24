'use client';
/**
 * B23 (0084) — GOVERNED REVIEWS (interface L10-I03 ReviewConvened), beside the attention queue.
 *
 * A review is convened by a NAMED HUMAN around a declared objective, decision, scenario, commitment or outcome of this domain. The
 * server checks the subject (declared here, at the version named or the current one), the chair and the reviewers (active humans),
 * and the convener's standing (executive, strategy_owner, decision_owner, decision_authority, domain_admin or platform_admin). The
 * convene key is the convener's idempotency key: the same key with the same review answers the recorded review; the same key with a
 * different review is refused. A new review is announced as ReviewConvened and reaches its chair as a review.convened item in the
 * queue. The chair concludes a review; the convener or the chair withdraws it. Every row and every refusal here is the server's.
 */
import { useEffect, useState } from 'react';
import { REVIEW_STATES, REVIEW_SUBJECT_KINDS, reviews as api, type ConveneForm, type Review } from '../../../lib/attention';
import type { Scope } from '../../../lib/observation';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
/** What an item of the queue pre-fills the form with (a material change's package is reviewed as a decision). */
export interface ConvenePrefill { kind: string; subjectId: string; causeItemId: string | null; title: string }
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : v === null || v === undefined || v === '' ? '—' : String(v));
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const input = (id: string, label: string, value: string, onChange: (v: string) => void, type = 'text') => (
  <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>
    <input id={id} type={type} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)} /></div>
);

export function ReviewsPanel({ scope, me, prefill }: { scope: Scope; me: { principalId: string }; prefill: ConvenePrefill | null }) {
  const [rows, setRows] = useState<Review[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState('');
  const [form, setForm] = useState<ConveneForm>({ kind: 'decision', subjectId: '', version: '', question: '', chair: me.principalId, reviewers: '', due: null, key: '', causeItemId: null });
  const [due, setDue] = useState('');
  const [answer, setAnswer] = useState<Review | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [actProblem, setActProblem] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    const r = await api.list(scope, { state: stateFilter });
    if (!r.ok || r.data === undefined) { setRows(null); setProblem(refusal(r, 'the reviews could not be read')); return; }
    setProblem(null); setRows(r.data.reviews);
  };
  useEffect(() => { void load(); }, [scope, stateFilter]);
  useEffect(() => {
    if (prefill === null) return;
    setForm((f) => ({ ...f, kind: prefill.kind, subjectId: prefill.subjectId, causeItemId: prefill.causeItemId, key: `from-${(prefill.causeItemId ?? prefill.subjectId).slice(0, 8)}-${Date.now().toString(36)}` }));
  }, [prefill]);
  const set = (k: keyof ConveneForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const ready = form.subjectId.trim() !== '' && form.question.trim().length >= 8 && form.chair.trim() !== '' && form.key.trim() !== '';

  return (
    <section aria-labelledby="reviews-h" style={cardStyle}>
      <h2 id="reviews-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Governed reviews</h2>
      <p style={muted}>
        A review answers one question about a declared objective, decision, scenario, commitment or outcome, chaired by a named person.
        The server checks the subject, the people and your standing, and announces a new review to its chair through the queue.
      </p>
      <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Convene a review{prefill === null ? '' : <> — from the item on <em>{prefill.title}</em></>}</h3>
      <div style={rowStyle}>
        <div><label htmlFor="rv-kind" style={{ display: 'block' }}>Subject kind</label>
          <select id="rv-kind" style={{ ...inputStyle, inlineSize: '100%' }} value={form.kind} onChange={(e) => set('kind')(e.target.value)}>
            {REVIEW_SUBJECT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
          </select></div>
        {input('rv-subject', 'Subject id', form.subjectId, set('subjectId'))}
        {input('rv-version', 'Version (optional — the current one when empty)', form.version, set('version'))}
        {input('rv-chair', 'Chair (principal id)', form.chair, set('chair'))}
        {input('rv-reviewers', 'Reviewers (principal ids, comma-separated)', form.reviewers, set('reviewers'))}
        {input('rv-due', 'Due (optional)', due, setDue, 'datetime-local')}
        {input('rv-key', 'Convene key (your idempotency key)', form.key, set('key'))}
      </div>
      {input('rv-question', 'Question the review answers (8–2000 characters)', form.question, set('question'))}
      <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
        <GovernedButton label="Convene the review" pendingLabel="convening" disabled={!ready}
          onRun={async () => {
            setActProblem(null); setAnswer(null);
            const r = await api.convene(scope, { ...form, due: due.trim() === '' ? null : new Date(due).toISOString() });
            if (!r.ok || r.data === undefined) { const m = `not convened — ${refusal(r, 'the convening was not answered')}`; setActProblem(m); throw new Error(m); }
            setAnswer(r.data.review); setReceipt(r.data.receipt); await load();
          }} />
      </div>
      {answer !== null && <p>review <Mono>{answer.review_id}</Mono> {answer.repeated ? <strong>already recorded under this key (repeated — nothing new announced)</strong> : 'convened and announced to its chair'} · {answer.subject_kind} <em>{answer.subject_title ?? short(answer.subject_id)}</em> at version <Mono>{String(answer.subject_version ?? '—')}</Mono></p>}

      <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Reviews</h3>
      <div style={{ ...rowStyle, maxInlineSize: '20rem' }}>
        <div><label htmlFor="rv-state" style={{ display: 'block' }}>State</label>
          <select id="rv-state" style={{ ...inputStyle, inlineSize: '100%' }} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">any state</option>{REVIEW_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></div>
      </div>
      {problem !== null && <LiveStatus assertive><span style={critical}>not listed — {problem}</span></LiveStatus>}
      {rows === null ? (problem === null ? <Empty>reading the reviews…</Empty> : null) : rows.length === 0 ? <Empty>No review matches in this domain.</Empty> : (
        <ScrollBox label="governed reviews">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Subject</Th><Th>Question</Th><Th>State</Th><Th>Chair</Th><Th>Reviewers</Th><Th>Due</Th><Th>Convened</Th><Th>Close</Th></tr></thead>
            <tbody>{rows.map((r) => (
              <tr key={r.review_id}>
                <Td>{r.subject_kind} <em>{r.subject_title ?? short(r.subject_id)}</em> <Mono>v{String(r.subject_version ?? '—')}</Mono></Td>
                <Td>{r.question}</Td>
                <Td><strong>{String(r.state).toUpperCase()}</strong>{r.closing_note === null ? null : <> — {r.closing_note}</>}</Td>
                <Td mono>{short(r.chair)}{r.chair === me.principalId ? ' (you)' : ''}</Td>
                <Td mono>{r.reviewers.length === 0 ? '—' : r.reviewers.map(short).join(', ')}</Td>
                <Td>{r.due_at === null ? '—' : fmtInstant(r.due_at)}</Td>
                <Td>{fmtInstant(r.convened_at)} by <Mono>{short(r.convened_by)}</Mono></Td>
                <Td>{r.state !== 'convened' ? '—' : (
                  <div style={{ display: 'grid', gap: 'var(--eye-space-4)' }}>
                    <label htmlFor={`rv-note-${r.review_id}`} style={{ fontSize: 'var(--eye-type-label-sm)' }}>Note (8+ characters)</label>
                    <input id={`rv-note-${r.review_id}`} style={inputStyle} value={notes[r.review_id] ?? ''} onChange={(e) => setNotes((n) => ({ ...n, [r.review_id]: e.target.value }))} />
                    <GovernedButton label="Conclude (the chair)" pendingLabel="concluding" variant="quiet" disabled={(notes[r.review_id] ?? '').trim().length < 8}
                      onRun={async () => {
                        setActProblem(null);
                        const x = await api.conclude(scope, r.review_id, (notes[r.review_id] ?? '').trim());
                        if (!x.ok || x.data === undefined) { const m = `not concluded — ${refusal(x, 'the conclusion was not answered')}`; setActProblem(m); throw new Error(m); }
                        setReceipt(x.data.receipt); await load();
                      }} />
                    <GovernedButton label="Withdraw (the convener or the chair)" pendingLabel="withdrawing" variant="critical" disabled={(notes[r.review_id] ?? '').trim().length < 8}
                      onRun={async () => {
                        setActProblem(null);
                        const x = await api.withdraw(scope, r.review_id, (notes[r.review_id] ?? '').trim());
                        if (!x.ok || x.data === undefined) { const m = `not withdrawn — ${refusal(x, 'the withdrawal was not answered')}`; setActProblem(m); throw new Error(m); }
                        setReceipt(x.data.receipt); await load();
                      }} />
                  </div>
                )}</Td>
              </tr>
            ))}</tbody>
          </table>
        </ScrollBox>
      )}
      {actProblem !== null && <LiveStatus assertive><span style={critical}>{actProblem}</span></LiveStatus>}
      <Receipt receipt={receipt} />
    </section>
  );
}
