'use client';
/**
 * Warnings — evidence, consequence, confidence, and the response window, routed
 * to a named owner. The window is the product: a warning that arrives after the
 * option closed is a report, and this screen shows how much of the window is
 * left — or that it closed unanswered.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { prediction, type WarningRow } from '../../../lib/prediction';
import { ControlsLine } from '../forecasts/page';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

/**
 * The RESPONSE, on the warning's own clock. A replayed warning's window is dated
 * in the replay, so no countdown against the wall clock is shown for it; a live
 * warning's is. Whether the answer came before the window closed is the record's
 * `response_timely`, never inferred here.
 */
function WindowState({ w, now }: { w: WarningRow; now: number }) {
  const replay = (w.timing_mode ?? 'live') === 'replay';
  if (w.state === 'acknowledged') {
    const late = w.response_timely === false;
    return (
      <span style={{ color: late ? 'var(--eye-color-critical)' : 'var(--eye-color-success)', fontWeight: late ? 650 : 400 }}>
        {late ? '✕ acknowledged LATE' : '● acknowledged in time'} — as of {fmtInstant(w.acknowledged_as_of ?? w.acknowledged_at)}
        {replay ? <> (recorded {fmtInstant(w.acknowledged_at)})</> : null}
      </span>
    );
  }
  if (w.state === 'expired') {
    return <span style={{ color: 'var(--eye-color-critical)', fontWeight: 650 }}>✕ window closed unanswered{w.expired_as_of ? <> — expired as of {fmtInstant(w.expired_as_of)}</> : null}</span>;
  }
  if (replay) return <span style={{ color: 'var(--eye-color-warning)', fontWeight: 650 }}>⚑ open in the replay — closes {fmtInstant(w.response_window_closes_at)} (replay clock)</span>;
  const left = new Date(w.response_window_closes_at).getTime() - now;
  if (left <= 0) return <span style={{ color: 'var(--eye-color-critical)', fontWeight: 650 }}>✕ window closed — not yet swept as expired</span>;
  const hours = Math.floor(left / 3_600_000); const mins = Math.floor((left % 3_600_000) / 60_000);
  return <span style={{ color: 'var(--eye-color-warning)', fontWeight: 650 }}>⚑ open — {hours} h {mins} min left</span>;
}

/**
 * T3 on screen: raised AS OF, the decision deadline, and whether the one was
 * before the other. A replayed warning's window is dated in the replay, and
 * the audit clock is shown beside it so the two are never confused.
 */
function Timing({ w }: { w: WarningRow }) {
  const mode = w.timing_mode ?? 'live';
  const timely = w.timely === undefined || w.timely === null
    ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>T3 unmeasured — no decision deadline declared</span>
    : w.timely
      ? <span style={{ color: 'var(--eye-color-success)' }}>● issued before the decision deadline {fmtInstant(w.decision_deadline)}</span>
      : <span style={{ color: 'var(--eye-color-critical)', fontWeight: 650 }}>✕ DECISION MISSED — issued at or after the deadline {fmtInstant(w.decision_deadline)}; a report, not a warning</span>;
  return (
    <span style={{ fontSize: 'var(--eye-type-label-sm)' }}>
      {mode === 'replay' ? <strong style={{ color: 'var(--eye-color-warning)' }}>REPLAY · </strong> : null}
      raised as of {fmtInstant(w.raised_as_of ?? w.raised_at)}
      {mode === 'replay' ? <> (recorded {fmtInstant(w.raised_at)})</> : null} · {timely}
    </span>
  );
}

export default function WarningsPage() {
  const { scope, me, isForecastOwner } = useShell();
  const [rows, setRows] = useState<WarningRow[] | null>(null);
  const [open, setOpen] = useState<WarningRow | null>(null);
  const [note, setNote] = useState('');
  const [asOf, setAsOf] = useState('');
  const [last, setLast] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const now = Date.now();

  const load = async () => {
    const r = await prediction.listWarnings(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the warnings could not be read'); return; }
    setRows(r.data.warnings);
  };
  useEffect(() => { void load(); }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rows === null) return <Empty>reading warnings…</Empty>;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Warnings</h1>
      {rows.length === 0 ? <Empty>No warning has been raised.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <caption style={{ captionSide: 'top', textAlign: 'start', color: 'var(--eye-color-ink-muted)' }}>{rows.length} warning(s)</caption>
          <thead><tr><Th>Warning</Th><Th>Routed to</Th><Th>Raised as of</Th><Th>Window closes</Th><Th>Response</Th><Th>Issuance</Th><Th>Confidence</Th></tr></thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.warning_id}>
                <Td><button type="button" onClick={() => { setOpen(w); setNote(''); }}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-default)', cursor: 'pointer', textDecoration: 'underline', textAlign: 'start' }}>
                  {w.title}</button></Td>
                <Td mono>{w.routed_to.slice(0, 8)}…{w.routed_to === me.principalId ? ' (you)' : ''}</Td>
                <Td>{fmtInstant(w.raised_as_of ?? w.raised_at)}{(w.timing_mode ?? 'live') === 'replay' ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-warning)' }}>REPLAY</div> : null}</Td>
                <Td>{fmtInstant(w.response_window_closes_at)}</Td>
                <Td><WindowState w={w} now={now} /></Td>
                <Td>{w.timely === undefined || w.timely === null ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>unmeasured</span> : w.timely ? <span style={{ color: 'var(--eye-color-success)' }}>● issued in time</span> : <span style={{ color: 'var(--eye-color-critical)', fontWeight: 650 }}>✕ decision missed</span>}</Td>
                <Td mono>{Number(w.confidence).toFixed(2)}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open === null ? null : (
        <section aria-labelledby="wrn-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="wrn-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{open.title}</h2>
          <WindowState w={open} now={now} />
          <p><Timing w={open} /></p>
          <p><ControlsLine controls={open.controls} /></p>
          <dl>
            <DefinitionRow term="Consequence">{open.consequence}</DefinitionRow>
            <DefinitionRow term="Evidence">
              <ul style={{ margin: 0, paddingInlineStart: '1.2rem' }}>
                {open.evidence.map((e, i) => <li key={i}><Mono>{JSON.stringify(e)}</Mono></li>)}
              </ul>
            </DefinitionRow>
            <DefinitionRow term="Response window">{fmtInstant(open.response_window_opens_at)} → {fmtInstant(open.response_window_closes_at)}</DefinitionRow>
            <DefinitionRow term="Routed to"><Mono>{open.routed_to}</Mono></DefinitionRow>
            {open.flip_event_id === undefined || open.flip_event_id === null ? null : <DefinitionRow term="Flip event"><Mono>{open.flip_event_id}</Mono> — one warning per flip</DefinitionRow>}
            {open.acknowledgement === null ? null : <DefinitionRow term="Acknowledgement">{open.acknowledgement} — <Mono>{String(open.acknowledged_by).slice(0, 8)}…</Mono></DefinitionRow>}
          </dl>
          {isForecastOwner && open.state === 'raised' ? (
            <>
              <label htmlFor="ack">What you did about it</label>
              <input id="ack" style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
              {(open.timing_mode ?? 'live') === 'replay' ? (
                <>
                  <label htmlFor="ack-asof">Answered as of (replay instant, e.g. 2024-01-18T09:00:00Z)</label>
                  <input id="ack-asof" style={inputStyle} value={asOf} onChange={(e) => setAsOf(e.target.value)} placeholder="YYYY-MM-DDTHH:MM:SSZ" />
                </>
              ) : null}
              <GovernedButton label="Acknowledge" pendingLabel="recording" onRun={async () => {
                const r = await prediction.acknowledgeWarning(scope, open.warning_id, note, (open.timing_mode ?? 'live') === 'replay' ? asOf : undefined);
                if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the acknowledgement was refused');
                setReceipt(r.data.receipt); setLast(`${r.data.warning.state.replace(/_/g, ' ')} — ${open.title}`); await load(); setOpen(null);
              }} />
            </>
          ) : null}
          {isForecastOwner && open.state === 'expired' ? (
            <p style={{ color: 'var(--eye-color-critical)' }}>This window closed without an answer; the record keeps it as expired. An acknowledgement now is refused as such.</p>
          ) : null}
          <Receipt receipt={receipt} />
        </section>
      )}
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
      <UnknownNote>A warning nobody acknowledged before its window closed is recorded as <strong>expired</strong> — a failure the record shows, not silence.
        {' '}Issuance and response are judged separately: a warning issued at or after its decision deadline is a <strong>missed decision</strong>;
        an answer after its window closed is <strong>late</strong>. A replayed warning is answered as of a replay instant; the audit clock is kept beside it.</UnknownNote>
    </>
  );
}
