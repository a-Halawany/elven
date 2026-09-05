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
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

function WindowState({ w, now }: { w: WarningRow; now: number }) {
  const closes = new Date(w.response_window_closes_at).getTime();
  const left = closes - now;
  if (w.state === 'acknowledged') return <span style={{ color: 'var(--eye-color-success)' }}>● acknowledged {fmtInstant(w.acknowledged_at)}</span>;
  if (w.state === 'expired' || left <= 0) return <span style={{ color: 'var(--eye-color-critical)', fontWeight: 650 }}>✕ window closed unanswered</span>;
  const hours = Math.floor(left / 3_600_000); const mins = Math.floor((left % 3_600_000) / 60_000);
  return <span style={{ color: 'var(--eye-color-warning)', fontWeight: 650 }}>⚑ open — {hours} h {mins} min left</span>;
}

export default function WarningsPage() {
  const { scope, me, isForecastOwner } = useShell();
  const [rows, setRows] = useState<WarningRow[] | null>(null);
  const [open, setOpen] = useState<WarningRow | null>(null);
  const [note, setNote] = useState('');
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
          <thead><tr><Th>Warning</Th><Th>Routed to</Th><Th>Raised</Th><Th>Window closes</Th><Th>Response</Th><Th>Confidence</Th></tr></thead>
          <tbody>
            {rows.map((w) => (
              <tr key={w.warning_id}>
                <Td><button type="button" onClick={() => { setOpen(w); setNote(''); }}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-default)', cursor: 'pointer', textDecoration: 'underline', textAlign: 'start' }}>
                  {w.title}</button></Td>
                <Td mono>{w.routed_to.slice(0, 8)}…{w.routed_to === me.principalId ? ' (you)' : ''}</Td>
                <Td>{fmtInstant(w.raised_at)}</Td>
                <Td>{fmtInstant(w.response_window_closes_at)}</Td>
                <Td><WindowState w={w} now={now} /></Td>
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
          <dl>
            <DefinitionRow term="Consequence">{open.consequence}</DefinitionRow>
            <DefinitionRow term="Evidence">
              <ul style={{ margin: 0, paddingInlineStart: '1.2rem' }}>
                {open.evidence.map((e, i) => <li key={i}><Mono>{JSON.stringify(e)}</Mono></li>)}
              </ul>
            </DefinitionRow>
            <DefinitionRow term="Response window">{fmtInstant(open.response_window_opens_at)} → {fmtInstant(open.response_window_closes_at)}</DefinitionRow>
            <DefinitionRow term="Routed to"><Mono>{open.routed_to}</Mono></DefinitionRow>
            {open.acknowledgement === null ? null : <DefinitionRow term="Acknowledgement">{open.acknowledgement} — <Mono>{String(open.acknowledged_by).slice(0, 8)}…</Mono></DefinitionRow>}
          </dl>
          {isForecastOwner && open.state === 'raised' ? (
            <>
              <label htmlFor="ack">What you did about it</label>
              <input id="ack" style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
              <GovernedButton label="Acknowledge" pendingLabel="recording" onRun={async () => {
                const r = await prediction.acknowledgeWarning(scope, open.warning_id, note);
                if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the acknowledgement was refused');
                setReceipt(r.data.receipt); await load(); setOpen(null);
              }} />
            </>
          ) : null}
          <Receipt receipt={receipt} />
        </section>
      )}
      <UnknownNote>A warning nobody acknowledged before its window closed is recorded as <strong>expired</strong> — a failure the record shows, not silence.</UnknownNote>
    </>
  );
}
