'use client';
/**
 * The operating review — CP-6 B92 §OR (0113_b92_x_or; PR-70-001: the governed, role-appropriate measurement capability's accountable business
 * review; the NORDWERK scene: loop-closure rate, warning acknowledgement latency and forecast calibration for the Red Sea corridor over the
 * last quarter, each traceable to its definition and underlying records).
 *
 * THE REVIEWS: each with its period, scope, state (draft / held / closed), chair and what is still not computed. ONE REVIEW, per metric: the
 * DEFINITION (title, meaning, population, numerator / denominator, window and clock, floor, owner — linked to the catalog), the cited RESULT —
 * its value, or its EXPLAINED indeterminate / unsupported state with every reason, n against the floor and the interval (never 0, never a dash
 * that reads like zero) — the QUARTERLY SERIES with sparse history explicit (no history / not computed are said), the DRILL-DOWN to the
 * records; then the NOTES, the FOLLOW-THROUGH (an action with its owner and due date, or no action — the chair's) and the chair's SIGNED CLOSE
 * (the digest as read). Refusals are the server's words. Nothing here computes or decides: assembling CITES results; the chair decides.
 * BOUNDARY: a review over synthetic records demonstrates the software; the signed acceptance of the business review is R2's.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useShell } from '../../../layout';
import {
  dayOf, followLine, intervalLine, openFollowthrough, periodCell, populationLine, reviewMark, reviews, sampleLine, stateMark, thresholdLine, valueLine, windowLine,
  type Mark, type MetricBlock, type ReviewListRow, type ReviewView,
} from '../../../../../lib/analytics-or-b92';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, GovernedButton, fmtInstant, textareaStyle } from '../../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../../../components/ui';
import { ResultDrilldown } from '../_catalog/result-drilldown';
import { computationNowLine, recordedComputationLine, registeredAfterDecision, versionsPair } from '../../../../../lib/analytics-md-b92';
import { OPERATING_REVIEW, useJourney } from '../../../../../lib/telemetry-b92';   // B92 integration: §UX's journey (durations and outcomes only, under consent)   // B92 integration: the one drill-down (§MD's), shared with the catalog

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 } as const;
const section = { ...cardStyle, marginBlockStart: 'var(--eye-space-16)' } as const;
const CHAIR_ROLES = ['executive', 'strategy_owner', 'product_analytics_owner'];
const OPENER_ROLES = ['product_analyst', 'product_analytics_owner', 'executive', 'strategy_owner'];

export default function OperatingReviewPage() {
  return <Suspense fallback={null}><OperatingReview /></Suspense>;
}

function MarkText({ m }: { m: Mark }) {
  return <span style={{ color: `var(${m.token})`, fontWeight: 650 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}

function OperatingReview() {
  const { scope, me } = useShell();
  const params = useSearchParams();
  const roles = new Set(me.bindings.filter((b) => b.domainId === scope.domainId || b.scope === 'TENANT').map((b) => b.roleCode));
  const canOpen = OPENER_ROLES.some((r) => roles.has(r));
  const [list, setList] = useState<ReviewListRow[] | null>(null);
  const [reviewId, setReviewId] = useState<string>(params.get('review') ?? '');
  const [view, setView] = useState<ReviewView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [drill, setDrill] = useState<string | null>(null);
  const journey = useJourney(scope, OPERATING_REVIEW);   // B92 integration: open → drill_down → done (the server decides whether it is collected)
  // open form
  const [title, setTitle] = useState(''); const [period, setPeriod] = useState(''); const [scopeKey, setScopeKey] = useState('');
  const [metricText, setMetricText] = useState(''); const [chairId, setChairId] = useState(''); const [rolesText, setRolesText] = useState('product_analyst, executive, risk_owner, forecast_owner');
  // note / decide / close forms
  const [noteMetric, setNoteMetric] = useState(''); const [noteBody, setNoteBody] = useState('');
  const [fMetric, setFMetric] = useState(''); const [fKind, setFKind] = useState<'action' | 'no_action'>('no_action'); const [fAction, setFAction] = useState('');
  const [fOwner, setFOwner] = useState(''); const [fDue, setFDue] = useState(''); const [fReason, setFReason] = useState('');
  const [statement, setStatement] = useState('');

  const loadList = async () => {
    const r = await reviews.list(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the operating reviews could not be read'); return; }
    setList(r.data.reviews);
    setReviewId((prev) => (prev === '' ? (r.data?.reviews[0]?.review_id ?? '') : prev));
  };
  // the review chosen LAST wins: a slower answer for an earlier choice is dropped
  const wanted = useRef<string>('');
  const loadReview = async () => {
    wanted.current = reviewId;
    if (reviewId === '') { setView(null); return; }
    const asked = reviewId;
    const r = await reviews.read(scope, asked);
    if (wanted.current !== asked) return;
    if (!r.ok || r.data === undefined) { setProblem(`HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? 'the review could not be read'}`); setView(null); return; }
    setProblem(null); setView(r.data.review); journey.end('open', 'success');
  };
  useEffect(() => { void loadList(); }, [scope]);
  useEffect(() => { setDrill(null); void loadReview(); }, [scope, reviewId]);

  /** Every command: the server's words on a refusal, the receipt on success, the review read again. */
  const act = async (fn: () => Promise<{ ok: boolean; status: number; error?: { code: string; message: string }; data?: { receipt?: ReceiptT } }>, what: string) => {
    const r = await fn();
    if (!r.ok) { setProblem(`HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? what}`); throw new Error(what); }
    setProblem(null); setReceipt(r.data?.receipt ?? null);
    await loadList(); await loadReview();
  };

  if (list === null) return problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : <Empty>reading the operating reviews…</Empty>;
  const v = view;
  const isChair = v !== null && v.chair_principal_id === me.principalId;
  const missing = v === null ? [] : openFollowthrough(v.metric_keys, v.followthrough);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Operating review</h1>
      <p style={muted}>
        The accountable business review of product metrics: a named chair reviews approved metrics for a named period and scope. Assembling a
        review CITES the latest computed result of each metric — it computes nothing; a metric with no result is listed as not computed. An
        indeterminate result is shown as indeterminate with its reasons, its n against the floor and what is missing — never as zero. Every value
        traces to its definition and the records it rests on. The chair decides the follow-through and signs the close; no metric decides anything.
      </p>
      <p style={{ ...muted, fontSize: 'var(--eye-type-label-sm)' }}>Boundary: a review over synthetic records demonstrates the software; the signed acceptance of the business review (R2) is not part of this page. No person is ranked or scored: participants are named by role.</p>
      <p><Link href="/graph/data/analytics">The metric catalog →</Link></p>
      {problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : null}
      <Receipt receipt={receipt} />

      <section aria-labelledby="or-list" style={section}>
        <h2 id="or-list" style={h2}>Reviews</h2>
        {list.length === 0 ? <Empty>No operating review has been opened in this domain.</Empty> : (
          <ScrollBox label="Operating reviews">
            <table style={tableStyle}>
              <thead><tr><Th>Review</Th><Th>Period</Th><Th>Scope</Th><Th>State</Th><Th>Chair</Th><Th>Not computed</Th><Th>Follow-through</Th></tr></thead>
              <tbody>{list.map((r) => (
                <tr key={r.review_id}>
                  <Td><button type="button" onClick={() => setReviewId(r.review_id)} aria-pressed={r.review_id === reviewId} style={{ all: 'unset', cursor: 'pointer', textDecoration: 'underline' }}>{r.title}</button></Td>
                  <Td>{r.period_key}</Td>
                  <Td>{r.scope_key ?? 'the whole domain'}</Td>
                  <Td><MarkText m={reviewMark(r.state)} /></Td>
                  <Td>{r.chair_name ?? '—'}</Td>
                  <Td>{r.assembly === 0 ? 'not assembled' : `${r.not_computed} of ${r.metric_keys.length}`}</Td>
                  <Td>{r.followthrough} decision(s)</Td>
                </tr>
              ))}</tbody>
            </table>
          </ScrollBox>
        )}
      </section>

      {canOpen ? (
        <section aria-labelledby="or-open" style={section}>
          <h2 id="or-open" style={h2}>Open a review</h2>
          <p style={muted}>A named calendar quarter (2026-Q3) or month (2026-09); an approved scope key (or none: the whole domain); approved metric keys; the chair (an executive, strategy owner or product analytics owner — a principal id); participants by ROLE.</p>
          <label>Title <input style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} /></label>{' '}
          <label>Period <input style={inputStyle} value={period} onChange={(e) => setPeriod(e.target.value)} placeholder="2026-Q3" /></label>{' '}
          <label>Scope key <input style={inputStyle} value={scopeKey} onChange={(e) => setScopeKey(e.target.value)} placeholder="red-sea-corridor" /></label>
          <div><label>Metric keys <input style={inputStyle} value={metricText} onChange={(e) => setMetricText(e.target.value)} placeholder="MET-001, MET-022, MET-024" /></label></div>
          <div><label>Chair (principal id) <input style={inputStyle} value={chairId} onChange={(e) => setChairId(e.target.value)} placeholder={CHAIR_ROLES.some((r) => roles.has(r)) ? me.principalId : ''} /></label>{' '}
            <label>Participant roles <input style={inputStyle} value={rolesText} onChange={(e) => setRolesText(e.target.value)} /></label></div>
          <GovernedButton label="Open the review" pendingLabel="Opening" disabled={title.trim().length < 4 || period.trim() === '' || metricText.trim() === ''}
            onRun={() => act(() => reviews.open(scope, {
              title: title.trim(), period: period.trim(), scopeKey: scopeKey.trim() === '' ? null : scopeKey.trim(),
              metricKeys: metricText.split(/[\s,]+/).filter((x) => x !== ''), chair: chairId.trim() === '' ? me.principalId : chairId.trim(),
              participantRoles: rolesText.split(/[\s,]+/).filter((x) => x !== ''),
            }), 'the review could not be opened')} />
        </section>
      ) : null}

      {v === null ? (reviewId !== '' && problem === null ? <Empty>reading the review…</Empty> : null) : (
        <>
          <section aria-labelledby="or-head" style={section}>
            <h2 id="or-head" style={h2}>{v.title}</h2>
            <DefinitionRow term="State"><MarkText m={reviewMark(v.state)} /></DefinitionRow>
            <DefinitionRow term="Period">{v.period_key} {windowLine(v.window_from, v.window_to)}</DefinitionRow>
            <DefinitionRow term="Scope">{v.scope_row === null ? 'the whole domain' : <>{v.scope_row.title} — <Mono>{v.scope_key}</Mono> v{v.scope_version}{v.scope_row.geographies?.length ? ` · ${v.scope_row.geographies.join(', ')}` : ''}{v.scope_row.series_keys?.length ? <> · series <Mono>{v.scope_row.series_keys.join(', ')}</Mono></> : null}</>}</DefinitionRow>
            <DefinitionRow term="Chair">{v.chair_name ?? v.chair_principal_id}{isChair ? ' (you)' : ''}</DefinitionRow>
            <DefinitionRow term="Participants (roles)">{v.participant_roles.join(', ')}</DefinitionRow>
            <DefinitionRow term="Citations">{v.assembly === 0 ? 'NOT ASSEMBLED — no result is cited yet' : `assembly ${v.assembly} at ${fmtInstant(v.assembled_at)} · ${v.uses} result use(s) recorded`}</DefinitionRow>
            <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', marginBlockStart: 'var(--eye-space-8)' }}>
              {v.state === 'draft' ? <GovernedButton label={v.assembly === 0 ? 'Assemble (cite the latest results)' : 'Re-assemble'} pendingLabel="Assembling" variant="quiet" onRun={() => act(() => reviews.assemble(scope, v.review_id), 'the review could not be assembled')} /> : null}
              {v.state === 'draft' && isChair ? <GovernedButton label="Hold the review (freeze the citations)" pendingLabel="Holding" disabled={v.assembly === 0} onRun={() => act(() => reviews.hold(scope, v.review_id), 'the review could not be held')} /> : null}
            </div>
          </section>

          {v.metrics.map((m) => <MetricCard key={m.metric_key} m={m} drill={drill} setDrill={(x) => { if (x === null) journey.end('drill_down', 'success'); else journey.start('drill_down'); setDrill(x); }} scope={scope} />)}

          <section aria-labelledby="or-notes" style={section}>
            <h2 id="or-notes" style={h2}>Notes</h2>
            {v.notes.length === 0 ? <Empty>No note yet.</Empty> : (
              <ul>{v.notes.map((n) => <li key={n.note_id}>{n.metric_key !== null ? <><Mono>{n.metric_key}</Mono> — </> : null}{n.body} <span style={muted}>— {n.author_name ?? n.author_principal_id}, {fmtInstant(n.created_at)}</span></li>)}</ul>
            )}
            {v.state !== 'closed' ? (
              <div>
                <label>Metric <select style={inputStyle} value={noteMetric} onChange={(e) => setNoteMetric(e.target.value)}><option value="">the review as a whole</option>{v.metric_keys.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
                <textarea aria-label="Note" style={textareaStyle} value={noteBody} onChange={(e) => setNoteBody(e.target.value)} />
                <GovernedButton label="Add the note" pendingLabel="Adding" variant="quiet" disabled={noteBody.trim().length < 4}
                  onRun={() => act(() => reviews.note(scope, v.review_id, { metricKey: noteMetric === '' ? null : noteMetric, body: noteBody.trim() }), 'the note could not be added').then(() => setNoteBody(''))} />
              </div>
            ) : null}
          </section>

          <section aria-labelledby="or-follow" style={section}>
            <h2 id="or-follow" style={h2}>Follow-through</h2>
            <p style={muted}>The chair decides, per metric: an action with its owner and due date (routed to that owner), or no action with its reason. A breached threshold or an indeterminate result opens this review — never an automatic or punitive decision.</p>
            {v.followthrough.length === 0 ? <Empty>No follow-through decided yet.</Empty> : (
              <ul>{v.followthrough.map((f) => <li key={f.followup_id}>{f.metric_key !== null ? <><Mono>{f.metric_key}</Mono> — </> : 'The review — '}{followLine(f)}{f.item !== null ? <span style={muted}> (item {f.item.state})</span> : null}</li>)}</ul>
            )}
            {v.state === 'held' && missing.length > 0 ? <p><strong>Still to decide:</strong> {missing.join(', ')}</p> : null}
            {v.state === 'held' && isChair ? (
              <div>
                <label>Metric <select style={inputStyle} value={fMetric} onChange={(e) => setFMetric(e.target.value)}><option value="">the review as a whole</option>{v.metric_keys.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>{' '}
                <label>Decision <select style={inputStyle} value={fKind} onChange={(e) => setFKind(e.target.value as 'action' | 'no_action')}><option value="no_action">no action</option><option value="action">an action</option></select></label>
                {fKind === 'action' ? (
                  <div>
                    <label>Action <input style={inputStyle} value={fAction} onChange={(e) => setFAction(e.target.value)} /></label>{' '}
                    <label>Owner (principal id) <input style={inputStyle} value={fOwner} onChange={(e) => setFOwner(e.target.value)} /></label>{' '}
                    <label>Due <input type="date" style={inputStyle} value={fDue} onChange={(e) => setFDue(e.target.value)} /></label>
                  </div>
                ) : null}
                <div><label>Reason <input style={inputStyle} value={fReason} onChange={(e) => setFReason(e.target.value)} /></label></div>
                <GovernedButton label="Decide" pendingLabel="Deciding" disabled={fReason.trim().length < 8}
                  onRun={() => act(() => reviews.decide(scope, v.review_id, fKind === 'action'
                    ? { metricKey: fMetric === '' ? null : fMetric, kind: 'action', action: fAction.trim(), owner: fOwner.trim(), dueOn: fDue, reason: fReason.trim() }
                    : { metricKey: fMetric === '' ? null : fMetric, kind: 'no_action', reason: fReason.trim() }), 'the follow-through could not be decided').then(() => { setFReason(''); setFAction(''); })} />
              </div>
            ) : null}
          </section>

          <section aria-labelledby="or-close" style={section}>
            <h2 id="or-close" style={h2}>The chair&apos;s close</h2>
            {v.signature !== null ? (
              <>
                <DefinitionRow term="Closed">by {v.signature.closed_by_name ?? v.signature.closed_by} at {fmtInstant(v.signature.closed_at)}</DefinitionRow>
                <DefinitionRow term="Statement">{v.signature.statement}</DefinitionRow>
                <DefinitionRow term="Signed digest"><Mono>{v.signature.digest}</Mono> — {v.signature.verified ? 'VERIFIED (the review recomputes to the signed digest)' : 'DOES NOT VERIFY — the review no longer recomputes to the signed digest'}</DefinitionRow>
                <DefinitionRow term="Kind">{v.signature.kind}</DefinitionRow>
              </>
            ) : (
              <>
                <DefinitionRow term="Digest now"><Mono>{v.digest_now}</Mono> — what the chair signs: the cited results&apos; source revisions, the notes and the follow-through as they stand</DefinitionRow>
                {v.state === 'held' && isChair ? (
                  <div>
                    <label>Statement <input style={inputStyle} value={statement} onChange={(e) => setStatement(e.target.value)} /></label>{' '}
                    <GovernedButton label="Sign and close" pendingLabel="Closing" variant="critical" disabled={statement.trim().length < 8 || missing.length > 0}
                      onRun={async () => { try { await act(() => reviews.close(scope, v.review_id, { digest: v.digest_now, statement: statement.trim() }), 'the review could not be closed'); journey.end('done', 'success'); } catch (e) { journey.end('done', 'failure'); throw e; } }} />
                  </div>
                ) : <Empty>{v.state === 'draft' ? 'The review is a draft: it is assembled and held before the chair closes it.' : 'Only the chair closes the review.'}</Empty>}
              </>
            )}
          </section>

          <section aria-labelledby="or-ledger" style={section}>
            <h2 id="or-ledger" style={h2}>Ledger</h2>
            <ul>{v.events.map((e, i) => <li key={i}><Mono>{e.event}</Mono> — {fmtInstant(e.occurred_at)}</li>)}</ul>
          </section>
        </>
      )}
    </>
  );
}

/** B82-F mt: the computation the definition's key names NOW beside the definition version (and said when it was registered after the decision). */
function ComputedBy({ m }: { m: MetricBlock }) {
  const after = registeredAfterDecision(m.computation_now, m.definition?.decided_at);
  return <>{computationNowLine(m.computation_now, m.definition?.computation_key ?? m.result?.computation_key ?? null)}{after !== null ? <> — <strong>{after}</strong></> : null}</>;
}

function MetricCard({ m, drill, setDrill, scope }: { m: MetricBlock; drill: string | null; setDrill: (v: string | null) => void; scope: { tenantId: string; domainId: string } }) {
  const d = m.definition; const r = m.result;
  const mark = stateMark(r === null ? null : r.state, r === null ? 'not_computed' : undefined);
  const kind = d?.kind ?? r?.kind ?? 'rate'; const unit = d?.unit ?? r?.unit ?? '';
  return (
    <section aria-labelledby={`or-m-${m.metric_key}`} style={section}>
      <h2 id={`or-m-${m.metric_key}`} style={h2}>{d?.title ?? m.metric_key} <Mono>{m.metric_key}</Mono></h2>
      {d !== null ? (
        <>
          <DefinitionRow term="Meaning">{d.meaning}</DefinitionRow>
          <DefinitionRow term="Population">{populationLine(d.population)}</DefinitionRow>
          {d.numerator !== null ? <DefinitionRow term="Numerator / denominator">{d.numerator} ÷ {d.denominator}</DefinitionRow> : null}
          <DefinitionRow term="Window and clock">{d.window_spec.kind.replace(/_/g, ' ')} · clock {d.window_spec.clock ?? 'record'}</DefinitionRow>
          <DefinitionRow term="Floor and k">floor {d.floor_n} · k ≥ {d.k_min} · {thresholdLine(d.threshold, kind, unit, d.direction)}</DefinitionRow>
          <DefinitionRow term="Computed by"><ComputedBy m={m} /></DefinitionRow>
          <DefinitionRow term="Owner">{d.owner_name ?? d.owner_principal_id} · definition v{d.version} ({d.state}){m.definition_current_version !== null && m.definition_current_version !== d.version ? ` — the current approved version is v${m.definition_current_version}` : ''} · <Link href={`/graph/data/analytics?metric=${encodeURIComponent(m.metric_key)}`}>in the catalog</Link></DefinitionRow>
        </>
      ) : <Empty>No definition is readable.</Empty>}
      <DefinitionRow term="Result"><MarkText m={mark} /> — {valueLine(r, m.citation?.note ?? null)}</DefinitionRow>
      {r !== null && r.state !== 'determinate' && r.reasons.length > 0 ? <DefinitionRow term="Why"><ul style={{ margin: 0 }}>{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul></DefinitionRow> : null}
      {r !== null ? (
        <>
          <DefinitionRow term="Sample and interval">{sampleLine(r.n, d?.floor_n, d?.k_min)} · {intervalLine(r.kind, r.unit, r.uncertainty)}</DefinitionRow>
          {r.kind === 'rate' && r.numerator !== null ? <DefinitionRow term="Counts">{String(r.numerator)} of {String(r.denominator)}</DefinitionRow> : null}
          <DefinitionRow term="Versions">{versionsPair(r.definition_version, r)} — {recordedComputationLine(r, m.computation_now)}</DefinitionRow>
          <DefinitionRow term="Window">{r.period_key} {windowLine(r.window_from, r.window_to)} · clock {r.clock} · scope {r.scope_key ?? 'the whole domain'} · as of {fmtInstant(r.as_of)}{m.citation?.pinned ? ' · PINNED' : ''}</DefinitionRow>
          {r.threshold_eval !== null ? <DefinitionRow term="Threshold">{r.threshold_eval.breach === true ? `BREACHED — opens a review: ${r.threshold_eval.action}` : r.threshold_eval.breach === false ? 'within' : 'not evaluated'}</DefinitionRow> : null}
          <GovernedButton label={drill === r.result_id ? 'Hide the records' : 'Drill down: definition → result → records'} pendingLabel="Reading" variant="quiet"
            onRun={async () => setDrill(drill === r.result_id ? null : r.result_id)} />
          {drill === r.result_id ? <ResultDrilldown scope={scope} resultId={r.result_id} /> : null}
        </>
      ) : null}
      <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>The series{m.series.scope_key !== null ? ` (${m.series.scope_key})` : ''}</h3>
      <ScrollBox label={`The series of ${m.metric_key}`}>
        <table style={tableStyle}>
          <thead><tr>{m.series.periods.map((p) => <Th key={p.period}>{p.period}</Th>)}</tr></thead>
          <tbody><tr>{m.series.periods.map((p) => {
            const pm = stateMark(p.state, p.status);
            return <Td key={p.period}><MarkText m={pm} /><div>{periodCell(p)}</div>{p.status === 'computed' ? <div style={muted}>{versionsPair(p.definition_version, p)}</div> : null}{p.status === 'computed' && p.state !== 'determinate' && p.reasons[0] ? <div style={muted}>{p.reasons[0]}</div> : null}</Td>;
          })}</tr></tbody>
        </table>
      </ScrollBox>
      {m.series.history.origin !== null ? <p style={muted}>The deployment&apos;s first record of this population: {dayOf(m.series.history.origin)} ({m.series.history.source}).</p>
        : <p style={muted}>The history origin is not established{m.series.history.why ? `: ${m.series.history.why}` : ''}.</p>}
      {!m.series.comparable ? <p><strong>Not comparable:</strong> {m.series.comparability_note}</p> : null}
      {m.series.computation_note ? <p><strong>Computation versions:</strong> {m.series.computation_note}.</p> : null}
    </section>
  );
}
