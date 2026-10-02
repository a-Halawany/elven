'use client';
/**
 * CP-6 B28 (0088 §W) — THE WARNING EVALUATION: how the warnings did over a window, from what people recorded about them — the feedback
 * rates BY ORIGIN (false, late, missed, duplicated, useful), T3 (the share raised before the decision deadline, over the warnings that
 * declare one) and the acknowledgement latency on each warning's own clock — every measure ABSTAINING below its sample floor, with the
 * server's reason; the deduplication's own counts beside them. A named human's act (the executive or a domain administrator); every past
 * evaluation stays (append-only). Nothing is computed here: the server measures, the page words it.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../../layout';
import { EVALUATOR_ROLES, evaluatePayload, originWords, ratioWords, verdictMark, warningLifecycle as api, type WarningEvaluation } from '../../../../lib/warning-lifecycle';
import { Empty, GovernedButton, LiveStatus, Mono, UnknownNote, cardStyle, fmtInstant } from '../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../../components/ui';

function Evaluation({ e }: { e: WarningEvaluation }) {
  const m = e.measures;
  const v = verdictMark(e.verdict);
  return (
    <section style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }} aria-label={`evaluation ${e.evaluation_id}`}>
      <p><strong>{v.glyph} {v.text}</strong> — {e.reason}</p>
      <p style={{ color: 'var(--eye-color-ink-muted)' }}>window {fmtInstant(e.window_from)} → {fmtInstant(e.window_to)}; min_sample {e.min_sample}; by <Mono>{e.evaluated_by.slice(0, 8)}…</Mono> at {fmtInstant(e.evaluated_at)}</p>
      {m === undefined ? null : (
        <>
          <table className="eye-table" style={tableStyle}>
            <caption style={{ captionSide: 'top', textAlign: 'start', color: 'var(--eye-color-ink-muted)' }}>Feedback rates by origin</caption>
            <thead><tr><Th>Origin</Th><Th>Raised</Th><Th>With feedback</Th><Th>False</Th><Th>Late</Th><Th>Missed</Th><Th>Duplicated</Th><Th>Useful</Th></tr></thead>
            <tbody>
              {Object.entries(m.by_origin).map(([k, o]) => (
                <tr key={k}>
                  <Td>{originWords(k)}</Td><Td mono>{o.raised}</Td><Td mono>{o.with_feedback}</Td>
                  <Td>{ratioWords(o.false_rate)}</Td><Td>{ratioWords(o.late_rate)}</Td><Td>{ratioWords(o.missed_rate)}</Td><Td>{ratioWords(o.duplicated_rate)}</Td><Td>{ratioWords(o.useful_rate)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
          <p><strong>T3</strong> (raised before the decision deadline): {ratioWords(m.t3)}; {m.t3.unmeasured} warning(s) declare no deadline (unmeasured).</p>
          <p><strong>Acknowledgement</strong>: {m.acknowledgement.abstained ? `abstained — ${m.acknowledgement.reason ?? ''}` : `p50 ${m.acknowledgement.p50_seconds} s, p90 ${m.acknowledgement.p90_seconds} s (n = ${m.acknowledgement.sample})`};
            {' '}{m.acknowledgement.acknowledged_late} answered late, {m.acknowledgement.expired_unanswered} expired unanswered.</p>
          <p><strong>Deduplication</strong>: {m.clusters.duplicates_absorbed} duplicate(s) folded, {m.clusters.storm_members} storm member(s) in {m.clusters.storm_leads} lead(s), {m.clusters.contradicting_reports} contradicting report(s) kept.</p>
        </>
      )}
    </section>
  );
}

export default function WarningEvaluationPage() {
  const { scope, me } = useShell();
  const [rows, setRows] = useState<WarningEvaluation[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [from, setFrom] = useState(''); const [to, setTo] = useState(''); const [minSample, setMinSample] = useState('');
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const evaluator = me.bindings.some((b) => (EVALUATOR_ROLES as readonly string[]).includes(b.roleCode));

  const load = async () => {
    const r = await api.evaluations(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the evaluations could not be read'); return; }
    setRows(r.data.evaluations); setProblem(null);
  };
  useEffect(() => { void load(); }, [scope]);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Warning evaluation</h1>
      {evaluator ? (
        <fieldset style={{ border: 'none', padding: 0 }}>
          <legend style={{ fontWeight: 650 }}>Evaluate the warnings</legend>
          <label htmlFor="we-from">Window from (ISO 8601; empty: 30 days before the end)</label>
          <input id="we-from" style={inputStyle} value={from} onChange={(e) => setFrom(e.target.value)} placeholder="2026-09-01T00:00:00Z" />
          <label htmlFor="we-to">Window to (empty: now)</label>
          <input id="we-to" style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)} />
          <label htmlFor="we-min">Minimum sample (empty: 5)</label>
          <input id="we-min" style={inputStyle} value={minSample} onChange={(e) => setMinSample(e.target.value)} inputMode="numeric" />
          <GovernedButton label="Evaluate" pendingLabel="measuring" onRun={async () => {
            const r = await api.evaluate(scope, evaluatePayload({ from: from || null, to: to || null, minSample }));
            if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the evaluation was refused');
            setReceipt(r.data.receipt); setLast(`evaluated — ${r.data.evaluation.verdict}`); await load();
          }} />
        </fieldset>
      ) : <p style={{ color: 'var(--eye-color-ink-muted)' }}>Only <Mono>{EVALUATOR_ROLES.join(', ')}</Mono> evaluate the warnings; the record is readable here.</p>}
      <Receipt receipt={receipt} />
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
      {problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : rows === null ? <Empty>reading the evaluations…</Empty>
        : rows.length === 0 ? <Empty>No evaluation has been recorded.</Empty> : rows.map((e) => <Evaluation key={e.evaluation_id} e={e} />)}
      <UnknownNote>A measure with fewer judged warnings than the minimum sample <strong>abstains</strong> and says so — it is never shown as a number.
        {' '}T3 is measured only over warnings that declare a decision deadline; the others are counted as unmeasured. The feedback is a person&apos;s verdict on the Warnings screen.</UnknownNote>
    </>
  );
}
