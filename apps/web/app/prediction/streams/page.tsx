'use client';
/**
 * Streams — CP-6 B28 (0088 §S, F-P4-11): the event-time stream processors. A rule watches a series in EVENT TIME: its windows fire when
 * the WATERMARK (the highest event time seen minus the lag — never the wall clock) passes their end. This screen's one promise is that
 * LOW LATENCY NEVER CONCEALS ANYTHING: a window revised by data that arrived after it fired carries a LATE badge and says how late; a
 * window over an explicit incomplete range, or missing days, carries a PARTIAL badge and is never shown as complete; a processor that is
 * stalled, corrupt or suspended says so, and none of its signals is presented as current; a retracted signal stays on the record with
 * its reason.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import {
  streams, completenessBadges, holdsText, intervalText, windowDays, LABEL_TEXT,
  type StreamDetail, type StreamProcessor, type StreamSignal, type StreamWindow,
} from '../../../lib/streams';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

const STATE_TOKEN: Record<string, string> = {
  running: '--eye-color-success', suspended: '--eye-color-warning', stalled: '--eye-color-warning', corrupt: '--eye-color-critical',
  recovering: '--eye-color-warning', retired: '--eye-color-ink-muted',
};
/** A badge: glyph + text + colour, never colour alone. */
function Badge({ text, why, tone }: { text: string; why: string; tone: string }) {
  return (
    <span title={why} style={{ display: 'inline-block', marginInlineEnd: 'var(--eye-space-4)', padding: '0 var(--eye-space-4)', border: `1px solid var(${tone})`,
                                color: `var(${tone})`, fontWeight: 650, fontSize: 'var(--eye-type-label-sm)', borderRadius: 'var(--eye-radius-sm, 3px)' }}>
      {text === 'LATE' ? '⏱ ' : text === 'PARTIAL' ? '◐ ' : ''}{text}
    </span>
  );
}
function WindowBadges({ w }: { w: { completeness: StreamWindow['completeness']; late_inputs?: number; late_excluded?: number } }) {
  const badges = completenessBadges(w);
  if (badges.length === 0) return <span style={{ color: 'var(--eye-color-ink-muted)' }}>complete</span>;
  return <>{badges.map((b, i) => <Badge key={i} text={b.text} why={b.why} tone={b.text === 'LATE' ? '--eye-color-warning' : '--eye-color-critical'} />)}</>;
}
function StateLine({ p }: { p: StreamProcessor }) {
  return (
    <span style={{ color: `var(${STATE_TOKEN[p.state] ?? '--eye-color-ink-default'})`, fontWeight: p.state === 'running' ? 500 : 650 }}>
      {p.state === 'running' ? '● running' : p.state === 'corrupt' ? '✕ CORRUPT' : `⚑ ${p.state.toUpperCase()}`}
    </span>
  );
}
function Presented({ s }: { s: StreamSignal }) {
  const tone = s.presented_as === 'current' ? '--eye-color-success' : s.presented_as === 'retracted' ? '--eye-color-critical' : '--eye-color-ink-muted';
  return <span style={{ color: `var(${tone})`, fontWeight: s.presented_as === 'current' ? 500 : 650 }}>{s.presented_as === 'current' ? '● current' : s.presented_as}</span>;
}

export default function StreamsPage() {
  const { scope, isForecastOwner, isStrategyOwner } = useShell();
  const mayAct = isForecastOwner || isStrategyOwner;
  const [rows, setRows] = useState<StreamProcessor[] | null>(null);
  const [open, setOpen] = useState<StreamDetail | null>(null);
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);

  const load = async () => {
    const r = await streams.list(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the stream processors could not be read'); return; }
    setRows(r.data.processors);
  };
  const openOne = async (id: string) => {
    const r = await streams.get(scope, id);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the stream processor could not be read'); return; }
    setOpen(r.data.stream); setReason('');
  };
  useEffect(() => { void load(); }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rows === null) return <Empty>reading stream processors…</Empty>;

  const p = open?.processor ?? null;
  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Streams — event time</h1>
      <UnknownNote>Windows fire on EVENT TIME: when the watermark — the highest event time seen minus the rule&apos;s lag, never the wall clock —
        passes their end. Data that arrives after its window fired is stored, labelled and shown: the window is <strong>revised</strong> and marked
        <strong> LATE</strong> (or, beyond the allowed lateness, the input is shown as excluded). A window over an explicit incomplete range, or with
        missing days, is marked <strong>PARTIAL</strong> and never shown as complete.</UnknownNote>
      {rows.length === 0 ? <Empty>No stream processor has been started.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <caption style={{ captionSide: 'top', textAlign: 'start', color: 'var(--eye-color-ink-muted)' }}>{rows.length} processor(s)</caption>
          <thead><tr><Th>Processor</Th><Th>Rule</Th><Th>State</Th><Th>Watermark</Th><Th>Inputs</Th><Th>Signals</Th><Th>Outputs</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.processor_id}>
                <Td><button type="button" onClick={() => { void openOne(r.processor_id); }}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-default)', cursor: 'pointer', textDecoration: 'underline', textAlign: 'start' }}>
                  <Mono>{r.processor_identity.split('#')[0]}</Mono></button></Td>
                <Td>{r.rule?.title ?? '—'}{r.rule ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>v{r.rule.version} · {r.rule.state}</div> : null}</Td>
                <Td><StateLine p={r} />{r.state_reason && r.state !== 'running' ? <div style={{ fontSize: 'var(--eye-type-label-sm)' }}>{r.state_reason}</div> : null}</Td>
                <Td>{fmtInstant(r.watermark)}</Td>
                <Td mono>{r.inputs}</Td>
                <Td>{Object.entries(r.counts?.labels ?? {}).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(' · ') || '—'}</Td>
                <Td>{r.outputs_current ? <span style={{ color: 'var(--eye-color-success)' }}>current</span> : <strong style={{ color: 'var(--eye-color-warning)' }}>SUSPENDED — not current</strong>}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open === null || p === null ? null : (
        <section aria-labelledby="spr-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="spr-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{open.rule?.title ?? p.processor_identity}</h2>
          {p.state === 'running' ? null : (
            <p role="status" style={{ color: `var(${STATE_TOKEN[p.state] ?? '--eye-color-warning'})`, fontWeight: 650 }}>
              ⚑ OUTPUTS SUSPENDED — the processor is {p.state}: {p.state_reason ?? 'no reason recorded'}. No signal of this processor is presented as current until it is recovered.
            </p>
          )}
          <dl>
            <DefinitionRow term="State"><StateLine p={p} /> since {fmtInstant(p.state_since)}{p.state_reason ? <> — {p.state_reason}</> : null}</DefinitionRow>
            <DefinitionRow term="Watermark">{fmtInstant(p.watermark)} (highest event time {fmtInstant(p.max_event_time)}, lag {intervalText(open.rule?.watermark_lag)}) — event time, never the wall clock</DefinitionRow>
            <DefinitionRow term="Rule">
              <Mono>{open.rule?.rule_key}</Mono> v{open.rule?.version} — {open.rule?.window_kind} windows of {open.rule?.window_days} day(s)
              {open.rule?.window_kind === 'sliding' ? <> sliding by {open.rule.slide_days}</> : null} from {String(open.rule?.window_origin ?? '').slice(0, 10)};
              {' '}fires when at least {open.rule?.predicate.min_hits} day(s) are {open.rule?.predicate.comparator} {open.rule?.predicate.threshold};
              {' '}allowed lateness {intervalText(open.rule?.allowed_lateness)}; stalls after {intervalText(open.rule?.stall_after)}; consequence <Mono>{open.rule?.consequence_class}</Mono>
            </DefinitionRow>
            <DefinitionRow term="Identity"><Mono>{p.processor_identity}</Mono> · topology <Mono>{p.topology_version}</Mono> · rule digest <Mono>{p.rule_digest.slice(0, 12)}…</Mono></DefinitionRow>
            <DefinitionRow term="Source offsets">{p.source_offsets.diverged === true
              ? <strong style={{ color: 'var(--eye-color-critical)' }}>DIVERGED — {(p.source_offsets.missing ?? []).map((m) => `stream ${String(m['stream_id']).slice(0, 8)}… seq ${String(m['seq'])} (${String(m['range_from'])}..${String(m['range_to'])})`).join('; ')}</strong>
              : <>{(p.source_offsets.streams ?? []).map((s) => `${String(s['partition_key'])}: consumed through seq ${String(s['consumed_through'])} of ${String(s['max_seq'])}`).join('; ') || 'not yet reconciled'}</>}</DefinitionRow>
            <DefinitionRow term="Last checkpoint">{open.checkpoints[0] ? <>{open.checkpoints[0].reason} at {fmtInstant(open.checkpoints[0].taken_at)} — input {open.checkpoints[0].input_seq}, watermark {fmtInstant(open.checkpoints[0].watermark)}, digest <Mono>{open.checkpoints[0].state_digest.slice(0, 12)}…</Mono></> : 'none'}</DefinitionRow>
          </dl>

          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Windows</h3>
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Window (event time)</Th><Th>Status</Th><Th>Completeness</Th><Th>Observed days</Th><Th>Hits</Th><Th>Predicate</Th><Th>Revision</Th></tr></thead>
            <tbody>
              {open.windows.map((w) => {
                const d = windowDays(w);
                return (
                  <tr key={w.window_start}>
                    <Td mono>{d.from} → {d.through}</Td>
                    <Td>{w.status}</Td>
                    <Td><WindowBadges w={w} /></Td>
                    <Td mono>{w.value.n ?? 0} / {w.value.expected_days ?? '?'}</Td>
                    <Td mono>{w.value.hits ?? 0}</Td>
                    <Td>{w.status === 'open' ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>open — {holdsText(w.holds)} so far</span> : holdsText(w.holds)}</Td>
                    <Td mono>{w.revision < 0 ? '—' : w.revision}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Signals</h3>
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Window</Th><Th>Emission</Th><Th>Label</Th><Th>Predicate</Th><Th>Lateness</Th><Th>Presented as</Th><Th>Warning candidate</Th><Th>Act</Th></tr></thead>
            <tbody>
              {open.signals.map((s) => {
                const d = windowDays(s);
                return (
                  <tr key={s.signal_id}>
                    <Td mono>{d.from} → {d.through}</Td>
                    <Td>{s.emission} r{s.revision}</Td>
                    <Td>{s.label === 'late_window' ? <Badge text="LATE" why={LABEL_TEXT.late_window} tone="--eye-color-warning" /> : s.label === 'partial_window' ? <Badge text="PARTIAL" why={LABEL_TEXT.partial_window} tone="--eye-color-critical" /> : null}{LABEL_TEXT[s.label]}</Td>
                    <Td>{s.emission === 'retracted' ? '—' : holdsText(s.holds)}</Td>
                    <Td>{(s.lateness.late_inputs ?? 0) > 0 ? <>{s.lateness.late_inputs} late input(s), up to {intervalText(s.lateness.max_lateness)} behind the watermark</> : '—'}</Td>
                    <Td>{s.emission === 'retracted' ? <span style={{ color: 'var(--eye-color-critical)' }}>retraction ({s.retraction_kind === 'state_corrupt' ? 'state corrupt' : 'by a person'}): {s.reason}</span> : <Presented s={s} />}</Td>
                    <Td>{s.candidate ? <><Mono>{s.candidate.candidate_id.slice(0, 8)}…</Mono> {s.candidate.state}</> : s.holds === true && s.emission !== 'retracted' ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>owed</span> : '—'}</Td>
                    <Td>{mayAct && s.emission !== 'retracted' && s.retraction === null ? (
                      <GovernedButton label="Retract" pendingLabel="retracting" variant="critical" disabled={reason.trim().length < 8} onRun={async () => {
                        const r = await streams.retract(scope, s.signal_id, reason.trim());
                        if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the retraction was refused');
                        setReceipt(r.data.receipt); setLast(`retracted the signal of ${d.from} → ${d.through}`); await openOne(p.processor_id);
                      }} />) : null}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Late inputs</h3>
          {open.inputs.filter((i) => i.lateness !== 'on_time').length === 0 ? <Empty>No input arrived late.</Empty> : (
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Day</Th><Th>Value</Th><Th>Lateness</Th><Th>Behind the watermark</Th><Th>Disposition</Th><Th>Arrived</Th></tr></thead>
              <tbody>
                {open.inputs.filter((i) => i.lateness !== 'on_time').map((i) => (
                  <tr key={i.input_id}>
                    <Td mono>{i.event_time.slice(0, 10)}</Td>
                    <Td mono>{i.value}</Td>
                    <Td><Badge text="LATE" why={i.lateness} tone={i.lateness === 'late_beyond_allowance' ? '--eye-color-critical' : '--eye-color-warning'} />{i.lateness === 'late_beyond_allowance' ? 'beyond the allowance — excluded, shown' : 'within the allowance — its window revised'}</Td>
                    <Td>{intervalText(i.lateness_by)} (watermark {fmtInstant(i.watermark_at_arrival)})</Td>
                    <Td>{i.disposition}{i.prior_value === null ? '' : ` (was ${i.prior_value})`}</Td>
                    <Td>{fmtInstant(i.arrived_at)}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          {mayAct ? (
            <>
              <label htmlFor="spr-reason">Reason (recovery or retraction, at least 8 characters)</label>
              <input id="spr-reason" style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} />
              {['suspended', 'stalled', 'corrupt'].includes(p.state) ? (
                <GovernedButton label="Recover from the newest compatible checkpoint" pendingLabel="recovering" disabled={reason.trim().length < 8} onRun={async () => {
                  const r = await streams.recover(scope, p.processor_id, reason.trim());
                  if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the recovery was refused');
                  setReceipt(r.data.receipt); setLast(`recovery: ${String(r.data.recovery['state'])} (emitted ${String(r.data.recovery['emitted'])}, suppressed ${String(r.data.recovery['suppressed'])})`);
                  await openOne(p.processor_id); await load();
                }} />
              ) : null}
              {p.state !== 'retired' ? (
                <GovernedButton label="Reconcile source offsets" pendingLabel="reconciling" variant="quiet" onRun={async () => {
                  const r = await streams.reconcile(scope, p.processor_id);
                  if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the reconciliation was refused');
                  setReceipt(r.data.receipt); setLast(`offsets: ${(r.data.reconciliation['offsets'] as { diverged?: boolean } | undefined)?.diverged ? 'DIVERGED — outputs suspended' : 'reconciled'}`);
                  await openOne(p.processor_id); await load();
                }} />
              ) : null}
            </>
          ) : null}
          <Receipt receipt={receipt} />
        </section>
      )}
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
    </>
  );
}
