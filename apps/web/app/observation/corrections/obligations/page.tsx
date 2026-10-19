'use client';
/**
 * B82-F cc — YOUR CORRECTION OBLIGATIONS: `/observation/corrections/obligations[?case=<caseId>]`. A correction's closure (B50 §CL) owes each
 * affected product's OWNER an act — acknowledge it, record its recompute, or grant a bounded exception — and that owner (a decision owner, an
 * executive, an executive operator, a decision approver …) may not read the case page (graph.read is not theirs). This page reads ONLY the
 * obligations the signed-in person answers for (graph.closure.obligation.read → graph.correction_obligations): the case, the corrected
 * objects, the consumer, its state, deadline, freeze marker and stall escalations, and the acts the SERVER says are open — never the case's
 * graph, its other consumers or any evidence. Each act stands behind B81's Command Review and the EXISTING port (graph.closure.acknowledge /
 * .except, human-gated), which re-checks everything; a refusal is shown in the server's words; nothing is optimistic — the obligations are
 * read again after every act. One h1 in every state (reading, refusal, empty, ready).
 */
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useShell } from '../../layout';
import { closureApi, type Receipt as ReceiptT } from '../../../../lib/closure-api-b50';
import { CLOSURE_ACTIONS, actConsequence } from '../../../../lib/closure-b50';
import {
  OBLIGATION_ACTS, actEligibility, escalationWords, latestActWords, obligationFormProblems, obligationStateWords, parseObligations, type Obligation, type ObligationAct,
} from '../../../../lib/closure-obligations-b82f';
import { CommandReview } from '../../../../components/authority';
import { DefinitionRow, Empty, LiveStatus, Mono, UnknownNote, cardStyle, textareaStyle } from '../../../../components/observation';
import { Receipt, inputStyle } from '../../../../components/ui';
import { Timestamp } from '../../../../components/text';

/** ONE h1 per rendering (lib/layout-b81's REG-03 ratchet): every branch titles the page through this element. */
function PageTitle({ children }: { children: ReactNode }) { return <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>{children}</h1>; }
const TITLE = 'Your correction obligations';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000');
const said = (r: { status: number; error?: { code: string; message: string } }, what: string) =>
  `${what} — HTTP ${r.status}${r.error?.code === undefined ? '' : ` ${r.error.code}`}: ${r.error?.message ?? 'no answer; reload the page to read it again'}`;
const ACT_LABEL: Readonly<Record<ObligationAct, string>> = { acknowledge: 'Acknowledge the consumer', recompute: 'Record the recompute', except: 'Grant a bounded exception' };
const keyOf = (o: Obligation) => `${o.case.case_id}|${o.consumer_ref}`;
const isoOf = (local: string) => { const t = Date.parse(local); return local === '' || Number.isNaN(t) ? '' : new Date(t).toISOString(); };

function ObligationsBody() {
  const { scope, me } = useShell();
  const params = useSearchParams();
  const raw = params.get('case');
  const caseFilter = raw !== null && UUID.test(raw) ? raw.toLowerCase() : null;
  const badLink = raw !== null && caseFilter === null;
  const [answer, setAnswer] = useState<ReturnType<typeof parseObligations> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [actProblem, setActProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | null>(null);
  const [selected, setSelected] = useState('');
  const [act, setAct] = useState<ObligationAct>('acknowledge');
  const [note, setNote] = useState('');
  const [recomputeRef, setRecomputeRef] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [owner, setOwner] = useState(me.principalId);
  const [ackId, setAckId] = useState(newId);

  const load = useCallback(async () => {
    const r = await closureApi.obligations(scope, caseFilter);
    if (!r.ok || r.data === undefined) { setProblem(said(r, 'Your correction obligations were not read')); return; }
    setProblem(null); setAnswer(parseObligations(r.data.obligations));
  }, [scope, caseFilter]);
  useEffect(() => { if (!badLink) void load(); }, [load, badLink]);

  if (badLink) {
    return (<><PageTitle>{TITLE}</PageTitle><LiveStatus assertive>This link names no correction case id (a uuid); all your obligations are listed without it.</LiveStatus>
      <p><Link href="/observation/corrections/obligations">All your correction obligations</Link></p></>);
  }
  if (answer === null) {
    return (<><PageTitle>{TITLE}</PageTitle>{problem === null ? <Empty>reading your correction obligations…</Empty> : <LiveStatus assertive>{problem}</LiveStatus>}</>);
  }

  const obligations = answer.obligations;
  const chosen = obligations.find((o) => keyOf(o) === selected) ?? null;
  const run = async () => {
    if (chosen === null) return;
    const r = act === 'except'
      ? await closureApi.except(scope, chosen.case.case_id, { consumerRef: chosen.consumer_ref, reason: note.trim(), expiresAt: isoOf(expiresAt), ownerPrincipalId: owner.trim().toLowerCase(), ackId })
      : await closureApi.acknowledge(scope, chosen.case.case_id, { consumerRef: chosen.consumer_ref, state: act === 'recompute' ? 'recomputed' : 'acknowledged', note: note.trim(), recomputeRef: act === 'recompute' ? recomputeRef.trim() : null, ackId });
    if (!r.ok || r.data === undefined) { const m = said(r, act === 'except' ? 'The exception was not recorded' : 'The acknowledgement was not recorded'); setActProblem(m); throw new Error(m); }
    setActProblem(null); setReceipt(r.data.receipt); setNote(''); setRecomputeRef(''); setAckId(newId()); await load();
  };

  return (
    <>
      <p className="eye-shell-meta"><Link href="/observation/corrections">← Corrections</Link></p>
      <PageTitle>{TITLE}</PageTitle>
      <UnknownNote>A correction changed something your product rests on. Until you acknowledge it, record its recompute or grant a bounded exception, the
        correction case stays open, and once its window passes the product is frozen. Only the obligations you answer for are listed here; the case&apos;s
        full graph, its other consumers and its evidence stay with the readers of the case.</UnknownNote>
      {caseFilter === null ? null : <p>Correction case <Mono>{caseFilter.slice(0, 8)}…</Mono> only — <Link href="/observation/corrections/obligations">all your correction obligations</Link></p>}
      {answer.dropped > 0 ? <LiveStatus assertive>{answer.dropped} row(s) of the answer were malformed and are not shown; reload the page to read them again.</LiveStatus> : null}

      {obligations.length === 0 ? <Empty>No open correction obligation is yours{caseFilter === null ? '' : ' in this case'}.</Empty> : obligations.map((o) => {
        const words = obligationStateWords(o, answer.contractVersion);
        const esc = escalationWords(o);
        return (
          <section key={keyOf(o)} style={cardStyle} aria-labelledby={`ob-${o.state_digest.slice(0, 12)}`}>
            <h2 id={`ob-${o.state_digest.slice(0, 12)}`} style={{ fontSize: 'var(--eye-type-heading-3)' }}>{o.title ?? o.consumer_ref}</h2>
            <dl>
              <DefinitionRow term="Consumer"><Mono>{o.consumer_ref}</Mono>{o.class === null ? '' : ` — ${o.class.replace(/_/g, ' ')}`}</DefinitionRow>
              <DefinitionRow term="State">{words.state} — {words.next}</DefinitionRow>
              <DefinitionRow term="Deadline">{words.deadline}</DefinitionRow>
              <DefinitionRow term="Freeze">{o.frozen ? 'FROZEN by this correction case — its publication, delivery and export are refused until the case closes' : 'not frozen'}</DefinitionRow>
              <DefinitionRow term="Why you">{o.basis ?? 'the server answered that you answer for it'}</DefinitionRow>
              <DefinitionRow term="Latest act">{latestActWords(o)}</DefinitionRow>
              <DefinitionRow term="Correction case"><Mono>{o.case.case_id.slice(0, 8)}…</Mono> — {o.case.kind}, {o.case.closure_state}: {o.case.reason}</DefinitionRow>
              <DefinitionRow term="Applied"><Timestamp value={o.case.applied_at} /></DefinitionRow>
              <DefinitionRow term="Corrected">{o.corrected.length === 0 ? 'none recorded' : o.corrected.map((c) => `${c.object_id.slice(0, 8)}… v${c.from_version ?? '?'} → v${c.to_version ?? '?'}`).join('; ')}</DefinitionRow>
              <DefinitionRow term="Escalations">{esc.length === 0 ? 'none — the consumer has not stalled' : esc.join(' · ')}</DefinitionRow>
            </dl>
          </section>
        );
      })}

      {obligations.length === 0 ? null : (
        <section style={cardStyle} aria-labelledby="ob-act-h">
          <h2 id="ob-act-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>Act on one of your obligations</h2>
          <label htmlFor="ob-ref" style={{ display: 'block' }}>Obligation</label>
          <select id="ob-ref" value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">choose one of your obligations</option>
            {obligations.map((o) => <option key={keyOf(o)} value={keyOf(o)}>{o.title ?? o.consumer_ref} ({o.state.replace(/_/g, ' ')})</option>)}
          </select>
          <label htmlFor="ob-act" style={{ display: 'block' }}>Act</label>
          <select id="ob-act" value={act} onChange={(e) => setAct(e.target.value as ObligationAct)}>
            {OBLIGATION_ACTS.map((a) => <option key={a} value={a}>{ACT_LABEL[a]}{chosen === null || chosen.acts[a].allowed ? '' : ' (not open to you now)'}</option>)}
          </select>
          <CommandReview action={CLOSURE_ACTIONS[act]} object={{ type: 'COR', id: chosen?.case.case_id ?? 'not chosen yet', version: null, title: chosen?.title ?? 'one of your obligations', state: chosen === null ? null : chosen.state }}
            digest={chosen?.state_digest ?? null}
            eligibility={chosen === null ? { can: false, reason: 'choose one of your obligations', role: null, basis: 'not eligible' } : actEligibility(chosen, act)}
            consequence={actConsequence(act, chosen?.consumer_ref ?? 'the consumer')}
            extraReasons={chosen === null ? [] : obligationFormProblems(chosen, act, { note, recomputeRef, expiresAt: isoOf(expiresAt), owner })}
            actionLabel={ACT_LABEL[act]} pendingLabel="recording" onRun={run} problem={actProblem}>
            <label htmlFor="ob-note" style={{ display: 'block' }}>{act === 'except' ? 'Reason the consumer cannot close now (16 to 2000 characters)' : 'What was reviewed (8 to 2000 characters)'}</label>
            <textarea id="ob-note" style={textareaStyle} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
            {act === 'recompute' ? (<><label htmlFor="ob-rr" style={{ display: 'block' }}>The re-run record</label>
              <input id="ob-rr" style={inputStyle} value={recomputeRef} onChange={(e) => setRecomputeRef(e.target.value)} autoComplete="off" /></>) : null}
            {act === 'except' ? (<>
              <label htmlFor="ob-exp" style={{ display: 'block' }}>Expires at (your local time; within {chosen?.acts.except.exception_max_days ?? 30} day(s))</label>
              <input id="ob-exp" type="datetime-local" style={inputStyle} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              <label htmlFor="ob-own" style={{ display: 'block' }}>Who answers for the exception (a principal id — yours by default{chosen?.acts.except.record_authority_owner_required ? '; under a legal hold, a record authority' : ''})</label>
              <input id="ob-own" style={inputStyle} value={owner} onChange={(e) => setOwner(e.target.value)} autoComplete="off" />
            </>) : null}
          </CommandReview>
        </section>
      )}

      <Receipt receipt={receipt} />
      {problem === null ? null : <LiveStatus assertive>{problem}</LiveStatus>}
    </>
  );
}

export default function CorrectionObligationsPage() {
  return <Suspense fallback={<><PageTitle>{TITLE}</PageTitle><Empty>reading the link…</Empty></>}><ObligationsBody /></Suspense>;
}
