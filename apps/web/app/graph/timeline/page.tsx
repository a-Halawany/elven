'use client';
/**
 * CP-6 B50 §TL — THE TIMELINE AND AS-OF EXPLORER (F-P3-04: PR-22-001/002/003, CAP-UM-10): `/graph/timeline?type=<TYPE>&id=<id>` or
 * `?scope=<key>`, with `&axis=&from=&to=&asOf=` — what happened, what was known, what was believed and what changed, over ONE object or ONE
 * approved governed scope (B92's), on one axis (event | observation | valid | record), as known at an instant on RECORD time (the scrubber
 * steps over the record instants the answer carries; none: the live read). A deep link opens exactly what it names or says why it cannot.
 *
 * What it shows, all in the server's words: the DISCLOSURE first and always (missing intervals, policy filtering counted, clock skew, broken
 * lineage, later corrections, versions with no time on the axis, the bound); every version with its four times, its clock (a glyph and a
 * word), whether it was believed at the instant and the correction recorded later; the event ledgers; the existing as-of reads. Reading is
 * the only thing this page does — it records the access (the receipt) and changes nothing. Nothing is optimistic.
 */
import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useShell } from '../layout';
import { timelineApi, type Receipt as ReceiptT } from '../../../lib/timeline-api-b50';
import {
  AXES, AXIS_WORDS, DEFAULT_WINDOW, boundInstant, instantText, itemLine, parseTimelineLink, scrubberStops, stopIndex, timelineHref, traceHref,
  type Stop, type TimelineAsk, type TimelineView,
} from '../../../lib/timeline-b50';
import { TimelineDisclosureNote, TimelineScrubber } from '../../../components/knowledge';
import { DefinitionRow, Empty, LiveStatus, Mono, UnknownNote, cardStyle } from '../../../components/observation';
import { Receipt, Td, Th, tableStyle } from '../../../components/ui';

type Row = Record<string, unknown>;
/** ONE h1 per rendering (lib/layout-b81's REG-03 ratchet): every branch titles the page through this element. */
function PageTitle({ children }: { children: ReactNode }) { return <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>{children}</h1>; }
const said = (r: { status: number; error?: { code: string; message: string } }, what: string) =>
  `${what} — HTTP ${r.status}${r.error?.code === undefined ? '' : ` ${r.error.code}`}: ${r.error?.message ?? 'no answer; reload the page to read it again'}`;
const day = (iso: string) => iso.slice(0, 10);

function TimelineBody() {
  const { scope } = useShell();
  const router = useRouter();
  const search = useSearchParams();
  const link = parseTimelineLink(search);
  const [mode, setMode] = useState<'subject' | 'scope'>(link.ok === true && link.ask.scopeKey !== null ? 'scope' : 'subject');
  const [type, setType] = useState(link.ok === true ? (link.ask.subjectType ?? '') : '');
  const [id, setId] = useState(link.ok === true ? (link.ask.subjectId ?? '') : '');
  const [scopeKey, setScopeKey] = useState(link.ok === true ? (link.ask.scopeKey ?? '') : '');
  const [axis, setAxis] = useState(link.ok === true ? link.ask.axis : 'record');
  const [from, setFrom] = useState(day(link.ok === true ? link.ask.from : DEFAULT_WINDOW.from));
  const [to, setTo] = useState(day(link.ok === true ? link.ask.to : DEFAULT_WINDOW.to));
  const [scopes, setScopes] = useState<Row[] | null>(null);
  const [view, setView] = useState<TimelineView | null>(null);
  const [stops, setStops] = useState<Stop[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | null>(null);
  const [reading, setReading] = useState(false);

  useEffect(() => {
    void timelineApi.scopes(scope).then((r) => { setScopes(r.ok && r.data !== undefined ? r.data.scopes : []); if (!r.ok) setProblem(said(r, 'The governed scopes were not read')); });
  }, [scope]);

  const read = useCallback(async (ask: TimelineAsk, keepStops: boolean) => {
    setReading(true); setProblem(null);
    const r = await timelineApi.read(scope, ask);
    setReading(false);
    if (!r.ok || r.data === undefined) { setView(null); setProblem(said(r, 'The timeline was not read')); return; }
    setView(r.data.timeline); setReceipt(r.data.receipt);
    if (!keepStops || ask.asOf === null) setStops(scrubberStops(r.data.timeline));
    router.replace(timelineHref(ask));
  }, [scope, router]);

  const linkKey = link.ok === true ? timelineHref(link.ask) : '';
  useEffect(() => {
    if (link.ok === true && view === null) void read({ ...link.ask, asOf: null }, false).then(() => { if (link.ask.asOf !== null) void read(link.ask, true); });
  }, [linkKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const formAsk = (): TimelineAsk | string => {
    const f = boundInstant(from); const t = boundInstant(to);
    if (f === null || t === null) return 'enter the window as two days (YYYY-MM-DD)';
    if (new Date(t).getTime() <= new Date(f).getTime()) return 'choose a window that ends after it starts';
    if (mode === 'scope') return scopeKey === '' ? 'choose a governed scope' : { subjectType: null, subjectId: null, scopeKey, axis, from: f, to: t, asOf: null };
    if (!/^[A-Z]{3}$/.test(type)) return 'enter the object type (three capitals, e.g. CLM)';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim())) return 'enter the object id (a uuid)';
    return { subjectType: type, subjectId: id.trim().toLowerCase(), scopeKey: null, axis, from: f, to: t, asOf: null };
  };
  const ask = formAsk();
  const idx = useMemo(() => stopIndex(stops, view?.live === false ? view.asOf : null), [stops, view]);

  return (
    <>
      <PageTitle>Timeline and as-of explorer</PageTitle>
      <UnknownNote>A timeline reconstructs what was recorded, as it was known at an instant on record time. It never rewrites or hides: a later
        correction is shown, a missing interval is shown, a policy filter is counted, a clock divergence is flagged.</UnknownNote>
      {link.ok === false ? <LiveStatus assertive>This link cannot open a timeline: {link.reason}. Choose what to read below.</LiveStatus> : null}

      <form style={cardStyle} aria-labelledby="tl-ask-h" onSubmit={(e) => { e.preventDefault(); if (typeof ask !== 'string') void read(ask, false); }}>
        <h2 id="tl-ask-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>What to read</h2>
        <label htmlFor="tl-mode" style={{ display: 'block' }}>Read over</label>
        <select id="tl-mode" value={mode} onChange={(e) => setMode(e.target.value as 'subject' | 'scope')}>
          <option value="subject">one object (every version)</option>
          <option value="scope">a governed scope (its members and what cites them)</option>
        </select>
        {mode === 'subject' ? (
          <>
            <label htmlFor="tl-type" style={{ display: 'block' }}>Object type (three capitals)</label>
            <input id="tl-type" value={type} maxLength={3} onChange={(e) => setType(e.target.value.toUpperCase())} />
            <label htmlFor="tl-id" style={{ display: 'block' }}>Object id</label>
            <input id="tl-id" value={id} dir="ltr" size={40} onChange={(e) => setId(e.target.value)} />
          </>
        ) : (
          <>
            <label htmlFor="tl-scope" style={{ display: 'block' }}>Governed scope</label>
            <select id="tl-scope" value={scopeKey} onChange={(e) => setScopeKey(e.target.value)}>
              <option value="">{scopes === null ? 'reading the scopes…' : scopes.length === 0 ? 'no approved governed scope in this domain' : 'choose a scope'}</option>
              {(scopes ?? []).map((s) => <option key={String(s['scope_key'])} value={String(s['scope_key'])}>{String(s['title'])} ({String(s['scope_key'])} v{String(s['version'])})</option>)}
            </select>
          </>
        )}
        <label htmlFor="tl-axis" style={{ display: 'block' }}>Axis</label>
        <select id="tl-axis" value={axis} onChange={(e) => setAxis(e.target.value as typeof axis)}>
          {AXES.map((a) => <option key={a} value={a}>{AXIS_WORDS[a].label} — {AXIS_WORDS[a].meaning}</option>)}
        </select>
        <label htmlFor="tl-from" style={{ display: 'block' }}>Window from (a day, UTC)</label>
        <input id="tl-from" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        <label htmlFor="tl-to" style={{ display: 'block' }}>Window to (a day, UTC; not included)</label>
        <input id="tl-to" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <button type="submit" disabled={typeof ask === 'string' || reading} aria-describedby={typeof ask === 'string' ? 'tl-ask-why' : undefined}>Read the timeline</button>
          {typeof ask === 'string' ? <p id="tl-ask-why" style={{ color: 'var(--eye-color-ink-muted)' }}>Not available: {ask}.</p> : null}
        </div>
      </form>

      {problem === null ? null : <LiveStatus assertive>{problem}</LiveStatus>}
      {reading ? <Empty>reading the timeline…</Empty> : null}

      {view === null ? null : (
        <>
          <section style={cardStyle} aria-labelledby="tl-at-h">
            <h2 id="tl-at-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>{view.live ? 'Live — as recorded now' : `As known at ${instantText(view.asOf)}`}</h2>
            <dl>
              <DefinitionRow term="Over">{view.subject['kind'] === 'scope' ? `the governed scope ${String(view.subject['scope_key'])} v${String(view.subject['version'])} — ${String(view.subject['title'])}` : <Mono>{`${String(view.subject['type'])}:${String(view.subject['id'])}`}</Mono>}</DefinitionRow>
              <DefinitionRow term="Axis">{AXIS_WORDS[view.window.axis].label} — {AXIS_WORDS[view.window.axis].meaning}</DefinitionRow>
              <DefinitionRow term="Window">{instantText(view.window.from)} to {instantText(view.window.to)}</DefinitionRow>
              <DefinitionRow term="Read at">{instantText(view.readAt)} under {view.method}, your clearance {view.clearance}</DefinitionRow>
            </dl>
            {stops.length > 1 ? (
              <TimelineScrubber stops={stops} index={idx} onChange={(i) => {
                const s = stops[i]; if (s === undefined) return;
                const base: TimelineAsk = { subjectType: view.subject['kind'] === 'scope' ? null : String(view.subject['type']), subjectId: view.subject['kind'] === 'scope' ? null : String(view.subject['id']),
                  scopeKey: view.subject['kind'] === 'scope' ? String(view.subject['scope_key']) : null, axis: view.window.axis, from: view.window.from, to: view.window.to, asOf: s.at === 'now' ? null : s.at };
                void read(base, true);
              }} />
            ) : null}
            <Receipt receipt={receipt} />
          </section>

          <section style={cardStyle}><TimelineDisclosureNote disclosure={view.disclosure} /></section>

          <section style={cardStyle} aria-labelledby="tl-items-h">
            <h2 id="tl-items-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>The versions ({view.items.length})</h2>
            {view.items.length === 0 ? <p>No version is placed in this window on this axis, as known at the instant (the disclosure above says what is not shown).</p> : (
              <table className="eye-table" style={tableStyle}>
                <caption>Each version as recorded, in the order of its {AXIS_WORDS[view.window.axis].label.toLowerCase()}</caption>
                <thead><tr><Th>Version</Th><Th>Times</Th><Th>Clock</Th><Th>At the instant</Th><Th>Later</Th></tr></thead>
                <tbody>
                  {view.items.map((i) => {
                    const l = itemLine(i);
                    return (
                      <tr key={i.ref}>
                        <Td><Link href={traceHref(i.objectType, i.objectId, i.version)}>{l.title}</Link><br /><Mono>{i.ref}</Mono></Td>
                        <Td><ul style={{ margin: 0, paddingInlineStart: 'var(--eye-space-16)' }}>{l.times.map((t) => <li key={t.label}>{t.label}: {t.value}</li>)}</ul>{i.timeStated ? null : <span className="eye-help">recorded before B50 — the time qualifiers are not populated</span>}</Td>
                        <Td><span title={l.clock.meaning}><span aria-hidden="true">{l.clock.glyph}</span> {l.clock.word}</span></Td>
                        <Td>{l.believed}</Td>
                        <Td>{l.correction ?? 'no later version recorded'}{l.broken.length === 0 ? null : <ul aria-label="Citations that do not resolve">{l.broken.map((b) => <li key={b}>{b}</li>)}</ul>}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </section>

          <section style={cardStyle} aria-labelledby="tl-ev-h">
            <h2 id="tl-ev-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>The event ledgers ({view.events.length})</h2>
            {view.events.length === 0 ? <p>No ledger event in this window, as known at the instant.</p> : (
              <ol>{view.events.map((e, n) => <li key={`${String(e['ledger'])}-${n}`}>{instantText(String(e['at']))} — {String(e['ledger'])}: {String(e['event'])} <Mono>{String(e['ref'])}</Mono></li>)}</ol>
            )}
          </section>

          {Object.keys(view.asOfReads).length === 0 ? null : (
            <section style={cardStyle} aria-labelledby="tl-reads-h">
              <h2 id="tl-reads-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>The as-of reads</h2>
              <dl>
                {Object.entries(view.asOfReads).map(([k, v]) => (
                  <DefinitionRow key={k} term={k.replace(/_/g, ' ')}>{typeof (v as Row)['statement'] === 'string' ? String((v as Row)['statement']) : <Mono>{JSON.stringify(v).slice(0, 400)}</Mono>}</DefinitionRow>
                ))}
              </dl>
            </section>
          )}
          <p className="eye-help">{view.claim}</p>
        </>
      )}
    </>
  );
}

export default function TimelinePage() {
  return <Suspense fallback={<Empty>reading the link…</Empty>}><TimelineBody /></Suspense>;
}
