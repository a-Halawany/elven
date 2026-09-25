'use client';
/**
 * B24 (0086 §G4) — THE QUEUE EVALUATED (PR-44-006, CAP-EO-06), beside the attention queue.
 *
 * A named person (executive, domain_admin or platform_admin — the server decides) measures the queue over a window: precision and
 * recall by class (from the dispositions people recorded), ranking stability (Kendall tau-b of the items' rank at the window's start and
 * end), severe-item visibility (C3/C4: acknowledged before the deadline, delivered before it where a delivery ledger exists, never
 * deprioritized for overload, the time to acknowledgement) and escalation latency. Every measure is computed by the server from the
 * ledgers in the write; any may ABSTAIN — below the sample floor, without a rank, without a delivery ledger — and the page shows the
 * server's reason, never a number it did not record.
 */
import { useEffect, useState } from 'react';
import { EVALUATOR_ROLES, governance as api, measuresOf, ratioWords, verdictMark, type QueueEvaluation } from '../../../lib/attention-governance';
import type { Scope } from '../../../lib/observation';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const toIso = (v: string): string | null => { if (v.trim() === '') return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
const secs = (v: number | undefined | null) => (typeof v === 'number' ? `${v.toFixed(1)} s` : '—');

function EvaluationView({ e }: { e: QueueEvaluation }) {
  const m = measuresOf(e);
  const v = verdictMark(String(e.verdict));
  const classes = Object.entries(m.classes ?? {});
  return (
    <div>
      <p><span style={{ color: `var(${v.token})`, fontWeight: 650 }} aria-hidden>{v.glyph}</span> <strong>{v.text}</strong> — {e.reason}</p>
      <h4>Precision and recall by class</h4>
      {classes.length === 0 ? <Empty>No item was created in the window.</Empty> : (
        <ScrollBox label="precision and recall by class">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Class</Th><Th>Items</Th><Th>Positives</Th><Th>False alarms</Th><Th>Misses</Th><Th>Late</Th><Th>Undisposed</Th><Th>Precision</Th><Th>Recall</Th></tr></thead>
            <tbody>
              {classes.map(([k, c]) => (
                <tr key={k}><Td mono>{k}</Td><Td>{c.items}</Td><Td>{c.true_positive}</Td><Td>{c.false_positive}</Td><Td>{c.missed}</Td><Td>{c.late}</Td><Td>{c.undisposed}</Td><Td>{ratioWords(c.precision)}</Td><Td>{ratioWords(c.recall)}</Td></tr>
              ))}
              {m.overall === undefined ? null : <tr><Td><strong>all classes</strong></Td><Td>{m.overall.items}</Td><Td>{m.overall.true_positive}</Td><Td>{m.overall.false_positive}</Td><Td>{m.overall.missed}</Td><Td>{m.overall.late}</Td><Td>{m.overall.undisposed}</Td><Td>{ratioWords(m.overall.precision)}</Td><Td>{ratioWords(m.overall.recall)}</Td></tr>}
            </tbody>
          </table>
        </ScrollBox>
      )}
      <h4>Ranking stability</h4>
      <p>{m.ranking_stability === undefined ? 'not reported' : m.ranking_stability.abstained ? <>abstained — {m.ranking_stability.reason}</> : <>Kendall tau-b <Mono>{String(m.ranking_stability.value)}</Mono> over {m.ranking_stability.ranked} ranked item(s) ({m.ranking_stability.concordant} concordant, {m.ranking_stability.discordant} discordant pairs)</>}</p>
      <h4>Severe items (C3/C4)</h4>
      {m.severe === undefined ? <p>not reported</p> : (
        <>
          <p>
            {m.severe.items} in the window; {m.severe.acknowledged_before_deadline} of {m.severe.routed} acknowledged before their first deadline;
            time to acknowledgement p50 {secs(m.severe.time_to_acknowledge_seconds?.p50)}, p90 {secs(m.severe.time_to_acknowledge_seconds?.p90)};
            {m.severe.never_overload_deprioritized ? ' none deprioritized for overload' : <strong style={critical}> {m.severe.overload_deprioritized} deprioritized for overload</strong>};
            delivery: {m.severe.delivered_before_deadline.measurable ? `${String(m.severe.delivered_before_deadline.delivered_before_deadline)} of ${String(m.severe.delivered_before_deadline.of)} delivered before the deadline` : m.severe.delivered_before_deadline.reason}.
          </p>
          {m.severe.breaches.length === 0 ? <p style={muted}>No breach.</p> : (
            <ul aria-label="severe-item breaches">{m.severe.breaches.map((b) => (
              <li key={`${b.item_id}-${b.breach}`} style={critical}><Mono>{b.item_id.slice(0, 8)}…</Mono> {b.consequence} {b.signal_class}: {b.breach === 'overload_deprioritized' ? 'deprioritized for overload' : `not acknowledged before its deadline${b.deadline ? ` (${fmtInstant(b.deadline)})` : ''}`}</li>
            ))}</ul>
          )}
        </>
      )}
      <h4>Escalation latency</h4>
      <p>{m.escalation_latency === undefined ? 'not reported' : m.escalation_latency.abstained ? <>abstained — {m.escalation_latency.reason}</> : <>{m.escalation_latency.escalations} escalation(s) after a missed deadline: p50 {secs(m.escalation_latency.p50_seconds)}, p90 {secs(m.escalation_latency.p90_seconds)}, max {secs(m.escalation_latency.max_seconds)}</>}</p>
    </div>
  );
}

export function EvaluationPanel({ scope, mayEvaluate }: { scope: Scope; mayEvaluate: boolean }) {
  const [rows, setRows] = useState<QueueEvaluation[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [minSample, setMinSample] = useState('5');
  const [latest, setLatest] = useState<QueueEvaluation | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [actProblem, setActProblem] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = async () => {
    const r = await api.evaluations(scope);
    if (!r.ok || r.data === undefined) { setRows(null); setProblem(refusal(r, 'the evaluations could not be read')); return; }
    setProblem(null); setRows(r.data.evaluations);
  };
  useEffect(() => { void load(); }, [scope]);

  return (
    <section aria-labelledby="evaluation-h" style={cardStyle}>
      <h2 id="evaluation-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Queue evaluation</h2>
      <p style={muted}>
        Measures how well the queue did over a window, from what people recorded about each item. Only <Mono>{EVALUATOR_ROLES.join(', ')}</Mono> may
        run it{mayEvaluate ? '' : '; you hold none of these, so the server will refuse'}. A measure with too small a sample abstains and says so.
      </p>
      <div style={rowStyle}>
        <div><label htmlFor="ev-from" style={{ display: 'block' }}>From (optional — 30 days before the end)</label>
          <input id="ev-from" type="datetime-local" style={{ ...inputStyle, inlineSize: '100%' }} value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label htmlFor="ev-to" style={{ display: 'block' }}>To (optional — now)</label>
          <input id="ev-to" type="datetime-local" style={{ ...inputStyle, inlineSize: '100%' }} value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div><label htmlFor="ev-min" style={{ display: 'block' }}>Minimum sample per measure</label>
          <input id="ev-min" inputMode="numeric" style={{ ...inputStyle, inlineSize: '100%' }} value={minSample} onChange={(e) => setMinSample(e.target.value)} /></div>
      </div>
      <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
        <GovernedButton label="Evaluate the queue" pendingLabel="evaluating"
          onRun={async () => {
            setActProblem(null); setLatest(null);
            const r = await api.evaluate(scope, { from: toIso(from), to: toIso(to), minSample });
            if (!r.ok || r.data === undefined) { const m = `not evaluated — ${refusal(r, 'the evaluation was not answered')}`; setActProblem(m); throw new Error(m); }
            setLatest(r.data.evaluation); setReceipt(r.data.receipt); await load();
          }} />
      </div>
      {actProblem !== null && <LiveStatus assertive><span style={critical}>{actProblem}</span></LiveStatus>}
      {latest !== null && <EvaluationView e={latest} />}
      <Receipt receipt={receipt} />

      <h3 style={h3}>Evaluations</h3>
      {problem !== null && <LiveStatus assertive><span style={critical}>not listed — {problem}</span></LiveStatus>}
      {rows === null ? (problem === null ? <Empty>reading the evaluations…</Empty> : null) : rows.length === 0 ? <Empty>The queue has not been evaluated yet.</Empty> : (
        <ScrollBox label="queue evaluations">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Evaluated</Th><Th>Window</Th><Th>Min sample</Th><Th>Verdict</Th><Th>Measures</Th></tr></thead>
            <tbody>{rows.map((e) => (
              <tr key={e.evaluation_id}>
                <Td>{e.evaluated_at === null ? '—' : fmtInstant(e.evaluated_at)} by <Mono>{e.evaluated_by.slice(0, 8)}…</Mono></Td>
                <Td>{e.window_from === undefined || e.window_from === null ? '—' : fmtInstant(e.window_from)} – {e.window_to === undefined || e.window_to === null ? '—' : fmtInstant(e.window_to)}</Td>
                <Td>{e.min_sample}</Td>
                <Td><strong>{verdictMark(String(e.verdict)).text}</strong></Td>
                <Td>
                  <button type="button" aria-expanded={open === e.evaluation_id} style={{ ...inputStyle, cursor: 'pointer' }} onClick={() => setOpen(open === e.evaluation_id ? null : e.evaluation_id)}>
                    {open === e.evaluation_id ? 'hide' : 'show'}
                  </button>
                  {open === e.evaluation_id && <EvaluationView e={e} />}
                </Td>
              </tr>
            ))}</tbody>
          </table>
        </ScrollBox>
      )}
    </section>
  );
}
