'use client';
/**
 * THE EXECUTIVE HOME — WS-01 (CP-6 B36, 0094 §H; F-P6-11): priorities, intelligence, warnings, decisions, commitments, outcomes and the
 * cadence in ONE read under the reader's context, each section with its as-of, its count and the limitations the server declared; the
 * LOOP RESET (JRN-19) as the person's act — it closes the cycle with its closing record and opens the next (open board-class decisions
 * need the executive's confirmation with a reason; an operator's is refused); the CONTEXT SWITCHER; the SEARCH with explanation (a
 * governed act, on the access ledger); a SCENARIO ROOM / OBJECTIVE REVIEW with a deadline (the objective's owner refused); the chief of
 * staff's tooling (PER-03: the agenda, a gap escalated — the operator approves, decides, commits and publishes nothing, and the server
 * refuses it); the COMMAND VIEWS; the METRICS computed on read. Every act is its own governed write; every refusal is shown as the server
 * states it; every figure of the demonstration is SYNTHETIC.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../decisions/layout';
import { home as api, buildAgenda, contextLine, hitLine, metricLine, resetNeedsConfirmation, AGENDA_KINDS, CADENCE_PERIODS, HOME_SECTIONS, SUBJECT_ROOM_KINDS, type HomeRead, type MetricsRead, type SearchRead } from '../../lib/home';
import { Empty, GovernedButton, LiveStatus, Mono, cardStyle } from '../../components/observation';
import { inputStyle, Receipt } from '../../components/ui';
import { ContextSwitcher } from './context-switcher';
import { CommandViews } from './command-views';
import { HomeSections } from './sections';

type Row = Record<string, unknown>;
type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) => `HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const localInstant = (v: string): string | null => (v === '' ? null : new Date(v).toISOString());

export default function HomePage() {
  const { scope, me, isExecutive } = useShell();
  const holds = (role: string) => me.bindings.some((b) => b.roleCode === role && (b.scope === 'PLATFORM' || (b.scope === 'DOMAIN' && b.domainId === scope.domainId)));
  const isOperator = holds('executive_operator');
  const mayCadence = isExecutive || isOperator || holds('domain_admin') || holds('platform_admin');
  const [h, setH] = useState<HomeRead | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [act, setAct] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [period, setPeriod] = useState('weekly');
  const [confirmReason, setConfirmReason] = useState('');
  const [q, setQ] = useState('');
  const [search, setSearch] = useState<SearchRead | null>(null);
  const [room, setRoom] = useState({ kind: 'scenario', subjectId: '', title: '', deadline: '' });
  const [agendaRows, setAgendaRows] = useState<Array<{ kind: string; id: string; note: string }>>([{ kind: 'attention_item', id: '', note: '' }]);
  const [gap, setGap] = useState({ subjectKind: 'attention_item', subjectId: '', reason: '', to: '' });
  const [metrics, setMetrics] = useState<MetricsRead | null>(null);
  const load = async () => {
    const r = await api.read(scope);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the home could not be read')); return; }
    setProblem(null); setH(r.data.home);
  };
  useEffect(() => { void load(); }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = (r: ReceiptT) => { setReceipt(r); setAct(null); void load(); };
  if (problem !== null && h === null) return <><h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Executive home</h1><LiveStatus assertive><span style={critical}>{problem}</span></LiveStatus></>;
  if (h === null) return <><h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Executive home</h1><Empty>composing the home…</Empty></>;
  const cadence = h.sections.cadence;
  const open = (cadence.open ?? null) as Row | null;
  const boardOpen = resetNeedsConfirmation(cadence.closed_since);
  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Executive home</h1>
      <p style={{ ...small, ...muted }}>One cadence: priorities, intelligence, warnings, decisions, commitments, outcomes — and the loop reset. Composed as of <Mono>{h.as_of}</Mono> (read {h.read_at}), each section under the context named below; what a section could not show is said in its limitations.</p>
      <p style={small} aria-label="the home's context"><strong>Context:</strong> {contextLine(h.context, h.ceiling)}</p>
      {problem !== null && <p role="alert" style={critical}>{problem}</p>}
      {act !== null && <p role="alert" style={critical}>{act}</p>}
      <ContextSwitcher context={h.context} ceiling={h.ceiling} onChanged={done} />

      <section aria-labelledby="home-search" data-testid="home-search" style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-16)' }}>
        <h2 id="home-search" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>Search</h2>
        <p style={{ ...small, ...muted }}>Rooms, briefings, decisions, commitments, queue items, warnings and reviews you may open — each hit explained (the field, the terms, the as-of, the context filter). A search is a recorded access.</p>
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', alignItems: 'end', flexWrap: 'wrap' }}>
          <label>Search<br /><input aria-label="search query" style={{ ...inputStyle, inlineSize: '24rem' }} value={q} onChange={(e) => setQ(e.target.value)} /></label>
          <GovernedButton label="Search" pendingLabel="searching" disabled={q.trim().length < 2} onRun={async () => {
            const r = await api.search(scope, q.trim());
            if (!r.ok || r.data === undefined) { setAct(`Search refused — ${refusal(r, 'no answer')}`); return; }
            setAct(null); setSearch(r.data.search); setReceipt(r.data.receipt);
          }} />
        </div>
        {search !== null ? (
          <div data-testid="search-results" style={{ marginBlockStart: 'var(--eye-space-8)' }}>
            <p style={small} aria-label="search summary"><strong>{search.count} hit(s)</strong> for "{search.query}" as of {search.as_of} · {Object.entries(search.kinds).map(([k, n]) => `${k} ${n}`).join(', ') || 'no kind'} · {search.limitations.join(' · ')}</p>
            {search.hits.length === 0 ? <Empty>no hit you may open</Empty> : <ul aria-label="search hits" style={{ ...small, paddingInlineStart: 'var(--eye-space-16)' }}>{search.hits.map((x) => <li key={`${x.kind}-${x.id}`}>{hitLine(x)}</li>)}</ul>}
          </div>
        ) : null}
      </section>

      <HomeSections h={h} order={HOME_SECTIONS}>
        {(name) => name !== 'cadence' ? null : (
          <div style={{ marginBlockStart: 'var(--eye-space-8)', display: 'grid', gap: 'var(--eye-space-8)', maxInlineSize: '48rem' }}>
            {!mayCadence ? <p style={{ ...small, ...muted }}>The cadence is opened and reset by the executive or the chief of staff.</p> : open === null ? (
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)', alignItems: 'end', flexWrap: 'wrap' }}>
                <label>Period<br /><select aria-label="cadence period" style={inputStyle} value={period} onChange={(e) => setPeriod(e.target.value)}>{CADENCE_PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}</select></label>
                <GovernedButton label="Open the cadence" pendingLabel="opening" onRun={async () => {
                  const r = await api.openCadence(scope, period);
                  if (!r.ok || r.data === undefined) { setAct(`Open the cadence refused — ${refusal(r, 'no answer')}`); return; }
                  done(r.data.receipt);
                }} />
              </div>
            ) : (
              <>
                {boardOpen > 0 ? (<>
                  <p style={{ ...small, ...critical }}><strong>{boardOpen} board-class decision(s) remain open.</strong> The reset needs the executive's confirmation with a reason; the server refuses an operator's.</p>
                  <label htmlFor="reset-reason">Confirmation reason (8+ characters)</label>
                  <input id="reset-reason" style={{ ...inputStyle, inlineSize: '100%' }} value={confirmReason} onChange={(e) => setConfirmReason(e.target.value)} />
                </>) : null}
                <GovernedButton label={`Reset the loop (close ${String(open['period'])} cycle #${String(open['sequence'])}, open the next)`} pendingLabel="resetting" variant="critical" disabled={boardOpen > 0 && confirmReason.trim().length < 8} onRun={async () => {
                  const r = await api.resetCadence(scope, String(open['period']), boardOpen > 0 ? confirmReason.trim() : null);
                  if (!r.ok || r.data === undefined) { setAct(`Reset the loop refused — ${refusal(r, 'no answer')}`); return; }
                  setConfirmReason(''); done(r.data.receipt);
                }} />
                {isOperator || isExecutive || holds('domain_admin') ? (
                  <details data-testid="operator-tooling">
                    <summary>Chief of staff: curate the agenda, escalate a gap</summary>
                    <p style={{ ...small, ...muted }}>The agenda links the cycle's items in your order; a gap goes to a named executive as a queue item. Routing work (delegating an item, reassigning a task) is done through the Attention and Tasks pages' own acts. The operator approves, decides, commits and publishes nothing — the server refuses it.</p>
                    <div style={{ display: 'grid', gap: 'var(--eye-space-4)' }}>
                      {agendaRows.map((row, i) => (
                        <div key={i} style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
                          <label>Kind<br /><select aria-label={`agenda item ${i + 1} kind`} style={inputStyle} value={row.kind} onChange={(e) => setAgendaRows(agendaRows.map((x, j) => (j === i ? { ...x, kind: e.target.value } : x)))}>{AGENDA_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
                          <label>Object id<br /><input aria-label={`agenda item ${i + 1} id`} style={{ ...inputStyle, inlineSize: '22rem' }} value={row.id} onChange={(e) => setAgendaRows(agendaRows.map((x, j) => (j === i ? { ...x, id: e.target.value } : x)))} /></label>
                          <label>Note<br /><input aria-label={`agenda item ${i + 1} note`} style={inputStyle} value={row.note} onChange={(e) => setAgendaRows(agendaRows.map((x, j) => (j === i ? { ...x, note: e.target.value } : x)))} /></label>
                        </div>
                      ))}
                      <div style={{ display: 'flex', gap: 'var(--eye-space-8)' }}>
                        <button type="button" style={{ ...inputStyle, cursor: 'pointer' }} onClick={() => setAgendaRows([...agendaRows, { kind: 'attention_item', id: '', note: '' }])}>Add an agenda row</button>
                        <GovernedButton label="Set the agenda" pendingLabel="setting" disabled={buildAgenda(agendaRows).length === 0} onRun={async () => {
                          const r = await api.setAgenda(scope, String(open['cadence_id']), buildAgenda(agendaRows));
                          if (!r.ok || r.data === undefined) { setAct(`Set the agenda refused — ${refusal(r, 'no answer')}`); return; }
                          done(r.data.receipt);
                        }} />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gap: 'var(--eye-space-4)', marginBlockStart: 'var(--eye-space-8)' }}>
                      <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
                        <label>Gap subject kind<br /><select aria-label="gap subject kind" style={inputStyle} value={gap.subjectKind} onChange={(e) => setGap({ ...gap, subjectKind: e.target.value })}>{[...AGENDA_KINDS, 'cadence'].map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
                        <label>Gap subject id<br /><input aria-label="gap subject id" style={{ ...inputStyle, inlineSize: '22rem' }} value={gap.subjectId} onChange={(e) => setGap({ ...gap, subjectId: e.target.value })} /></label>
                        <label>To (executive's principal id)<br /><input aria-label="gap recipient" style={{ ...inputStyle, inlineSize: '22rem' }} value={gap.to} onChange={(e) => setGap({ ...gap, to: e.target.value })} /></label>
                      </div>
                      <label>The gap (8+ characters)<br /><input aria-label="gap reason" style={{ ...inputStyle, inlineSize: '100%' }} value={gap.reason} onChange={(e) => setGap({ ...gap, reason: e.target.value })} /></label>
                      <GovernedButton label="Escalate the gap" pendingLabel="escalating" disabled={gap.reason.trim().length < 8 || gap.subjectId === '' || gap.to === ''} onRun={async () => {
                        const r = await api.escalate(scope, { cadenceId: String(open['cadence_id']), subjectKind: gap.subjectKind, subjectId: gap.subjectId.trim(), reason: gap.reason.trim(), to: gap.to.trim() });
                        if (!r.ok || r.data === undefined) { setAct(`Escalate the gap refused — ${refusal(r, 'no answer')}`); return; }
                        setGap({ ...gap, reason: '', subjectId: '' }); done(r.data.receipt);
                      }} />
                    </div>
                  </details>
                ) : null}
              </>
            )}
          </div>
        )}
      </HomeSections>

      <section aria-labelledby="subject-room" data-testid="subject-room" style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-16)' }}>
        <h2 id="subject-room" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>Open a scenario room or an objective review</h2>
        <p style={{ ...small, ...muted }}>A room bound to a scenario or to an objective, with a deadline; past it, the attention tick raises an OVERDUE item. The objective's owner opens no review of it and chairs none (the server keeps the separation of duties).</p>
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', alignItems: 'end', flexWrap: 'wrap' }}>
          <label>Kind<br /><select aria-label="room kind" style={inputStyle} value={room.kind} onChange={(e) => setRoom({ ...room, kind: e.target.value })}>{SUBJECT_ROOM_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
          <label>Subject id<br /><input aria-label="room subject id" style={{ ...inputStyle, inlineSize: '22rem' }} value={room.subjectId} onChange={(e) => setRoom({ ...room, subjectId: e.target.value })} /></label>
          <label>Title<br /><input aria-label="room title" style={{ ...inputStyle, inlineSize: '18rem' }} value={room.title} onChange={(e) => setRoom({ ...room, title: e.target.value })} /></label>
          <label>Deadline<br /><input aria-label="room deadline" type="datetime-local" style={inputStyle} value={room.deadline} onChange={(e) => setRoom({ ...room, deadline: e.target.value })} /></label>
          <GovernedButton label="Open the room" pendingLabel="opening" disabled={room.subjectId === '' || room.title.trim().length < 2 || room.deadline === ''} onRun={async () => {
            const r = await api.openRoom(scope, { kind: room.kind, subjectId: room.subjectId.trim(), title: room.title.trim(), deadline: localInstant(room.deadline) ?? '' });
            if (!r.ok || r.data === undefined) { setAct(`Open the room refused — ${refusal(r, 'no answer')}`); return; }
            setRoom({ ...room, subjectId: '', title: '' }); done(r.data.receipt);
          }} />
        </div>
      </section>

      <CommandViews contextDigest={h.context.digest} />

      <section aria-labelledby="home-metrics" data-testid="home-metrics" style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-16)' }}>
        <h2 id="home-metrics" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>Metrics</h2>
        <p style={{ ...small, ...muted }}>Time-to-understanding, decision latency, review completion — computed on read from the ledgers over the last 90 days; nothing is stored; each names its population and its as-of.</p>
        <GovernedButton label="Read the metrics" pendingLabel="computing" variant="quiet" onRun={async () => {
          const r = await api.metrics(scope);
          if (!r.ok || r.data === undefined) { setAct(`Read the metrics refused — ${refusal(r, 'no answer')}`); return; }
          setAct(null); setMetrics(r.data.metrics); setReceipt(r.data.receipt);
        }} />
        {metrics !== null ? <ul aria-label="metrics" style={{ ...small, paddingInlineStart: 'var(--eye-space-16)' }}>{metrics.metrics.map((m) => <li key={m.name}>{metricLine(m)}</li>)}<li style={muted}>window {metrics.window.from} → {metrics.window.to} · stored: {metrics.stored ? 'yes' : 'no (computed on read)'}</li></ul> : null}
      </section>
      <Receipt receipt={receipt} />
    </>
  );
}
