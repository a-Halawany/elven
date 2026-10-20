'use client';
/**
 * CP-6 B50 §TL — THE SOURCE-TO-PRODUCT TRACE of one product version (F-P3-04: PR-22-001/005, AT-22): `/graph/trace/<TYPE>/<id>?version=<n>`
 * opens EXACTLY the version it names (graph.timeline.read) — or says why the link cannot.
 *
 * What it shows, all in the server's words: B81's ObjectHeader of the product; the trace staged source → evidence → claims → product →
 * decision (§PV's explanation projected), each node with its clock and its later correction, a node withheld from you KEPT with its content
 * not shown; whether the trace is complete and EVERY reason it is not; the edges that do not resolve, kept; the missing intervals of the
 * sources it rests on; the CHAPTER CONTINUITY (B81's DegradedContractView — a degraded source with its contract in force, or undeclared);
 * the decision-time snapshots. The one act here — routing the reconciliation of an incomplete trace to the product's owner — is
 * human-gated by the server, which reads the trace itself; the page offers it only to the roles the rule admits and only while the trace is
 * incomplete, disabled with the reason otherwise. Nothing is optimistic: every answer is the receipt's.
 */
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useShell } from '../../../layout';
import { timelineApi, type Receipt as ReceiptT } from '../../../../../lib/timeline-api-b50';
import { continuityState, instantText, parseTraceLink, reconcileCommand, timelineHref, traceSummary, DEFAULT_WINDOW, type TraceView as TraceViewT } from '../../../../../lib/timeline-b50';
import { explainHref } from '../../../../../lib/provenance-b50';
import { rolesIn } from '../../../../../lib/authority-b81';
import type { ObjectHeaderInput } from '../../../../../lib/object-b81';
import { ObjectHeader } from '../../../../../components/object';
import { DegradedContractView } from '../../../../../components/recovery';
import { TraceView } from '../../../../../components/knowledge';
import { Empty, GovernedButton, LiveStatus, Mono, UnknownNote, cardStyle, textareaStyle } from '../../../../../components/observation';
import { Receipt } from '../../../../../components/ui';

type Row = Record<string, unknown>;
/** ONE h1 per rendering (lib/layout-b81's REG-03 ratchet): the ready page is titled by B81's ObjectHeader (level 1); every other branch here. */
function PageTitle({ children }: { children: ReactNode }) { return <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>{children}</h1>; }
const said = (r: { status: number; error?: { code: string; message: string } }, what: string) =>
  `${what} — HTTP ${r.status}${r.error?.code === undefined ? '' : ` ${r.error.code}`}: ${r.error?.message ?? 'no answer; reload the page to read it again'}`;
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000');

/** A typed reference (`TYP:<uuid>@<n>`) as a link to its own trace; anything else as text. */
function RefLink({ refText }: { refText: string }) {
  const m = /^([A-Z]{3}):([0-9a-f-]{36})@([1-9][0-9]*)$/i.exec(refText.replace(/^obj:/, ''));
  if (m === null) return <Mono>{refText}</Mono>;
  return <Link href={`/graph/trace/${m[1]!}/${m[2]!}?version=${m[3]!}`}>open the trace of {m[1]} v{m[3]}</Link>;
}

function TraceBody() {
  const { scope, me } = useShell();
  const params = useParams<{ type: string; id: string }>();
  const search = useSearchParams();
  const link = parseTraceLink(params.type, params.id, search.get('version'));
  const [trace, setTrace] = useState<TraceViewT | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [itemId, setItemId] = useState(newId);
  const [actProblem, setActProblem] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Row | null>(null);
  const [actReceipt, setActReceipt] = useState<ReceiptT | null>(null);

  const load = useCallback(async () => {
    if (!link.ok) return;
    const r = await timelineApi.trace(scope, link.type, link.id, link.version);
    if (r.ok && r.data !== undefined) { setTrace(r.data.trace); setReceipt(r.data.receipt); setProblem(null); } else setProblem(said(r, 'The trace was not read'));
  }, [scope, link.ok, link.ok ? link.type : '', link.ok ? link.id : '', link.ok ? link.version : 0]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { void load(); }, [load]);

  if (!link.ok) return (<><PageTitle>Source-to-product trace</PageTitle><LiveStatus assertive>This link cannot open a trace: {link.reason}. Open the timeline to choose a version instead.</LiveStatus><p><Link href="/graph/timeline">Open the timeline</Link></p></>);
  if (trace === null && problem !== null) return (<><PageTitle>Source-to-product trace of {link.type} v{link.version}</PageTitle><LiveStatus assertive>{problem}</LiveStatus><p><Link href="/graph/timeline">Open the timeline</Link> (the nearest safe state).</p></>);
  if (trace === null) return (<><PageTitle>Source-to-product trace of {link.type} v{link.version}</PageTitle><Empty>reading the trace…</Empty></>);

  const s = trace.subject;
  const owner = typeof s['owner'] === 'string' ? String(s['owner']) : null;
  const isOwner = owner !== null && owner.replace(/^principal:/, '') === me.principalId;
  const cmd = reconcileCommand(trace, rolesIn(me.bindings, scope), me.kind === 'human', isOwner, note);
  const sum = traceSummary(trace);
  const input: ObjectHeaderInput = {
    type: link.type, id: link.id, title: typeof s['title'] === 'string' ? String(s['title']) : null, version: link.version,
    versionCount: typeof s['versions'] === 'number' ? Number(s['versions']) : null, latestVersion: typeof s['latest'] === 'number' ? Number(s['latest']) : null,
    owner, ownerRole: 'accountable owner', serverState: typeof s['lifecycle'] === 'string' ? String(s['lifecycle']) : null,
    conditions: { degraded: trace.continuity.state === 'degraded' },
    truth: typeof s['truth_state'] === 'string' ? String(s['truth_state']) : null, synthetic: s['synthetic'] === true, classification: typeof s['classification'] === 'string' ? String(s['classification']) : null,
    time: [{ label: 'Event time', value: instantText(s['event_time'] as string | null) }, { label: 'Observation time', value: instantText(s['observed_at'] as string | null) },
           { label: 'Record time', value: instantText(s['recorded_at'] as string | null) }],
    trust: `the trace is ${sum.complete ? 'complete' : 'INCOMPLETE'} (${trace.method}, over ${String(trace.disclosure['examined'] ?? '?')} recorded objects)`,
    authority: 'No approval is read here: the trace reads what was recorded and approves, certifies or changes nothing.',
    relationships: [{ label: 'its timeline — every version, as known at any instant', href: timelineHref({ subjectType: link.type, subjectId: link.id, scopeKey: null, axis: 'record', from: DEFAULT_WINDOW.from, to: DEFAULT_WINDOW.to, asOf: null }) },
                    { label: 'its explanation — the backward path, the fitness, the forward preview', href: explainHref(link.type, link.id, link.version) }],
    provenance: [{ label: `${trace.sources.length} source(s) the trace rests on`, href: null }, { label: `${trace.unresolvedEdges.length} edge(s) that do not resolve`, href: null }],
    receipt, effective: { support: 'live_only', asOf: null },
  };
  const dg = continuityState(trace);

  return (
    <>
      <p className="eye-shell-meta"><Link href="/graph/timeline">← Timeline and as-of explorer</Link></p>
      <ObjectHeader input={input} />
      {problem === null ? null : <LiveStatus>{problem}</LiveStatus>}

      {dg === null ? null : (
        <section style={cardStyle} aria-labelledby="tl-cont-h">
          <h2 id="tl-cont-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>The chapter continuity</h2>
          <UnknownNote>{String(trace.continuity['basis'] ?? 'the degraded state of the sources the trace rests on')}</UnknownNote>
          <DegradedContractView state={dg} />
        </section>
      )}

      <section style={cardStyle}><TraceView trace={trace} renderRef={(ref) => <RefLink refText={ref} />} /></section>

      <section style={cardStyle} aria-labelledby="tl-miss-h">
        <h2 id="tl-miss-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>Missing intervals of its sources ({trace.missingIntervals.length})</h2>
        {trace.missingIntervals.length === 0 ? <p>None open for the sources this trace rests on.</p> : (
          <ul>{trace.missingIntervals.map((m, i) => <li key={i}>{String(m['source_key'])}: {instantText(String(m['from'] ?? ''))} to {m['to'] === null || m['to'] === undefined ? 'open' : instantText(String(m['to']))} — {String(m['reason'])}{m['detail'] === undefined ? '' : ` (${String(m['detail'])})`}</li>)}</ul>
        )}
      </section>

      <section style={cardStyle} aria-labelledby="tl-rec-h">
        <h2 id="tl-rec-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>Reconciliation</h2>
        {trace.reconciliation.length === 0 ? <p>No reconciliation has been routed for this product.</p> : (
          <ul aria-label="The reconciliations routed">{trace.reconciliation.map((r) => <li key={String(r['item_id'])}>routed {instantText(String(r['created_at']))} — {String(r['state'])}{r['owner'] === null ? ', owned by the knowledge roles (no owner is an active person)' : `, owned by ${String(r['owner'])}`}</li>)}</ul>
        )}
        <UnknownNote>Routing raises ONE attention item to the product&apos;s accountable owner; the server reads the trace itself and routes only an
          incomplete one. Nothing in the product changes — the reconciliation is the owner&apos;s to do, and the item stays recorded.</UnknownNote>
        <label htmlFor="tl-note" style={{ display: 'block' }}>What the owner should reconcile (8 to 2000 characters)</label>
        <textarea id="tl-note" style={textareaStyle} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
        <GovernedButton label="Route the reconciliation to the owner" pendingLabel="routing" disabled={!cmd.enabled}
          onRun={async () => {
            setActProblem(null); setAnswer(null);
            const r = await timelineApi.reconcile(scope, link.type, link.id, link.version, note.trim(), itemId);
            if (!r.ok || r.data === undefined) { const m = said(r, 'The reconciliation was not routed; read the trace again, then route it'); setActProblem(m); throw new Error(m); }
            setAnswer(r.data.reconciliation); setActReceipt(r.data.receipt); setItemId(newId()); setNote('');
            await load();
          }} />
        {cmd.reason === null ? null : <p style={{ color: 'var(--eye-color-ink-muted)' }}>Not available: {cmd.reason}.</p>}
        {actProblem === null ? null : <LiveStatus assertive>{actProblem}</LiveStatus>}
        {answer === null ? null : <LiveStatus>{answer['repeated'] === true ? 'This problem set was already routed: the same item is answered.' : 'Routed.'} Item <Mono>{String(answer['item_id'])}</Mono> — {String(answer['state'])}.</LiveStatus>}
        <Receipt receipt={actReceipt} />
      </section>
      <p className="eye-help">{trace.claim}</p>
    </>
  );
}

export default function TracePage() {
  return <Suspense fallback={<Empty>reading the link…</Empty>}><TraceBody /></Suspense>;
}
