'use client';
/**
 * CP-6 B50 §PV — THE CONTEST PATH of the domain's intelligence products (HX-14): knowledge challenges on claims, assessments, warnings and
 * forecasts in B21's shape — challenge, evidence, reviewer, status, escalation, outcome. `?subject=<id>` opens exactly that subject's
 * challenges (and the existing contest machinery on it: its B35 appeals, its B21 simulation challenges — read beside, never duplicated).
 *
 * Every act is the server's (graph.provenance.challenge.*, human-gated): opening (a decision or a run is ROUTED to its own path; the owner of
 * a product corrects it, never challenges it), evidence by a party, the review by a knowledge owner, data steward or domain administrator
 * who is neither the opener nor the owner, the decision by that reviewer alone, the withdrawal by the opener, the escalation once the review
 * is overdue on the server's clock. Each control is disabled with its reason when the person cannot take it; a refusal is shown in the
 * server's words; nothing is optimistic — the list is read again after every act.
 */
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useShell } from '../layout';
import { provenanceApi, type Receipt as ReceiptT } from '../../../lib/provenance-api-b50';
import { CHALLENGE_STATE_WORDS, challengeActs, challengeRoute, explainHref, type Challenge } from '../../../lib/provenance-b50';
import { rolesIn } from '../../../lib/authority-b81';
import { DefinitionRow, Empty, GovernedButton, LiveStatus, Mono, UnknownNote, cardStyle, textareaStyle } from '../../../components/observation';
import { Receipt, inputStyle } from '../../../components/ui';

type Row = Record<string, unknown>;
function PageTitle({ children }: { children: ReactNode }) { return <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>{children}</h1>; }
const said = (r: { status: number; error?: { code: string; message: string } }, what: string) =>
  `${what} — HTTP ${r.status}${r.error?.code === undefined ? '' : ` ${r.error.code}`}: ${r.error?.message ?? 'no answer; reload the page to read it again'}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000');

function ChallengeCard({ ch, me, onDone }: { ch: Challenge & Row; me: { principalId: string; steward: boolean; domainAdmin: boolean }; onDone: (r: ReceiptT) => Promise<void> }) {
  const { scope } = useShell();
  const acts = challengeActs(ch, me);
  const [note, setNote] = useState('');
  const [evRef, setEvRef] = useState(''); const [evDigest, setEvDigest] = useState(''); const [evNote, setEvNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const run = async (p: Promise<{ ok: boolean; status: number; data?: { receipt: ReceiptT }; error?: { code: string; message: string } }>, what: string) => {
    setProblem(null);
    const r = await p;
    if (!r.ok || r.data === undefined) { const m = said(r, what); setProblem(m); throw new Error(m); }
    setNote(''); await onDone(r.data.receipt);
  };
  const reason = (a: keyof typeof acts) => (acts[a].reason === null ? null : <span style={{ color: 'var(--eye-color-ink-muted)' }}> — not available: {acts[a].reason}</span>);
  const events = Array.isArray(ch['events']) ? (ch['events'] as Row[]) : [];
  const evidence = Array.isArray(ch['evidence']) ? (ch['evidence'] as Row[]) : [];
  const id = ch.challenge_id;
  return (
    <article style={cardStyle} aria-labelledby={`kch-${id}`}>
      <h2 id={`kch-${id}`} style={{ fontSize: 'var(--eye-type-heading-3)' }}>Challenge of {ch.subject.type} v{ch.subject.version}: {CHALLENGE_STATE_WORDS[ch.state]}</h2>
      <dl>
        <DefinitionRow term="Subject"><Link href={explainHref(ch.subject.type, ch.subject.id, ch.subject.version)}>open the explanation of {ch.subject.type} v{ch.subject.version}</Link> <Mono>{ch.subject.id}</Mono></DefinitionRow>
        <DefinitionRow term="Challenge">{ch.grounds} — opened by <Mono>{ch.opened_by}</Mono></DefinitionRow>
        <DefinitionRow term="Evidence">{evidence.length === 0 ? 'none submitted' : evidence.map((e) => `${String(e['ref'])} (${String(e['party'])}): ${String(e['note'])}`).join('; ')}</DefinitionRow>
        <DefinitionRow term="Reviewer">{ch.reviewer === null ? 'not assigned — a knowledge owner, data steward or domain administrator who is neither the opener nor the owner takes it' : <Mono>{ch.reviewer}</Mono>}</DefinitionRow>
        <DefinitionRow term="Escalation">{ch.overdue ? `OVERDUE — the review was due by ${ch.review_by}` : `review due by ${ch.review_by}`}{ch.escalations > 0 ? ` · escalated ${ch.escalations} time(s) to the domain administrators` : ''}</DefinitionRow>
        <DefinitionRow term="Outcome">{ch.state === 'upheld' || ch.state === 'dismissed' ? `${ch.state} by ${String(ch.decided_by)}: ${String(ch['decision_note'] ?? '')}` : ch.state === 'withdrawn' ? `withdrawn: ${String(ch['withdrawal_reason'] ?? '')}` : 'not decided'}</DefinitionRow>
      </dl>
      <details><summary>The events ({events.length}; append-only)</summary><ol>{events.map((e, i) => <li key={i}>{String(e['event'])} — {String(e['at'])} by <Mono>{String(e['actor'])}</Mono></li>)}</ol></details>
      <div style={{ display: 'grid', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-8)' }}>
        <div><GovernedButton label="Start the review" pendingLabel="starting" variant="quiet" disabled={!acts.review.enabled} onRun={() => run(provenanceApi.review(scope, id), 'The review was not started')} />{reason('review')}</div>
        <label htmlFor={`kch-note-${id}`}>Decision note or withdrawal reason (the decision states its reasons in 16+ characters)</label>
        <textarea id={`kch-note-${id}`} style={textareaStyle} value={note} maxLength={4000} onChange={(e) => setNote(e.target.value)} />
        <div>
          <GovernedButton label="Uphold the challenge" pendingLabel="recording" disabled={!acts.decide.enabled || note.trim().length < 16} onRun={() => run(provenanceApi.decide(scope, id, 'upheld', note.trim()), 'The decision was not recorded')} />{' '}
          <GovernedButton label="Dismiss the challenge" pendingLabel="recording" variant="quiet" disabled={!acts.decide.enabled || note.trim().length < 16} onRun={() => run(provenanceApi.decide(scope, id, 'dismissed', note.trim()), 'The decision was not recorded')} />
          {reason('decide')}
        </div>
        <p style={{ color: 'var(--eye-color-ink-muted)' }}>Withdrawing cannot be undone; the challenge, its evidence and its events stay recorded.</p>
        <div><GovernedButton label="Withdraw the challenge" pendingLabel="withdrawing" variant="critical" disabled={!acts.withdraw.enabled || note.trim().length < 8} onRun={() => run(provenanceApi.withdraw(scope, id, note.trim()), 'The challenge was not withdrawn')} />{reason('withdraw')}</div>
        <div><GovernedButton label="Escalate the challenge" pendingLabel="escalating" variant="quiet" disabled={!acts.escalate.enabled} onRun={() => run(provenanceApi.escalate(scope, id), 'The challenge was not escalated')} />{reason('escalate')}</div>
        <fieldset>
          <legend>Submit evidence (a recorded object of this domain under its digest)</legend>
          <label htmlFor={`kch-evref-${id}`}>Evidence reference (TYPE:id@version)</label>
          <input id={`kch-evref-${id}`} style={inputStyle} value={evRef} onChange={(e) => setEvRef(e.target.value)} />
          <label htmlFor={`kch-evdg-${id}`}>Its content digest (64 hexadecimal characters)</label>
          <input id={`kch-evdg-${id}`} style={inputStyle} value={evDigest} onChange={(e) => setEvDigest(e.target.value)} />
          <label htmlFor={`kch-evnote-${id}`}>What it shows</label>
          <input id={`kch-evnote-${id}`} style={inputStyle} value={evNote} onChange={(e) => setEvNote(e.target.value)} />
          <GovernedButton label="Submit the evidence" pendingLabel="submitting" variant="quiet" disabled={!acts.evidence.enabled || evRef.trim() === '' || evDigest.trim().length !== 64 || evNote.trim().length < 8}
            onRun={() => run(provenanceApi.evidence(scope, id, evRef.trim(), evDigest.trim(), evNote.trim()), 'The evidence was not submitted')} />{reason('evidence')}
        </fieldset>
        {problem === null ? null : <LiveStatus assertive>{problem}</LiveStatus>}
      </div>
    </article>
  );
}

function ChallengesBody() {
  const { scope, me } = useShell();
  const search = useSearchParams();
  const subjectParam = search.get('subject');
  const subject = subjectParam !== null && UUID.test(subjectParam) ? subjectParam.toLowerCase() : null;
  const [state, setState] = useState('live');
  const [rows, setRows] = useState<Array<Challenge & Row> | null>(null);
  const [appeals, setAppeals] = useState<Row[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | null>(null);
  const [form, setForm] = useState({ type: 'CLM', id: subject ?? '', version: '1', grounds: '' });
  const [requestId, setRequestId] = useState(newId);
  const [openProblem, setOpenProblem] = useState<string | null>(null);
  const roles = rolesIn(me.bindings, scope);
  const who = { principalId: me.principalId, steward: roles.some((r) => ['knowledge_owner', 'data_steward', 'domain_admin'].includes(r)), domainAdmin: roles.includes('domain_admin') };

  const load = useCallback(async () => {
    const r = await provenanceApi.challenges(scope, subject, state === '' ? null : state);
    if (!r.ok || r.data === undefined) { setProblem(said(r, 'The challenges were not read')); return; }
    setProblem(null); setRows(r.data.challenges.challenges); setAppeals(r.data.challenges.appeals);
  }, [scope, subject, state]);
  useEffect(() => { void load(); }, [load]);
  const after = async (rc: ReceiptT) => { setReceipt(rc); await load(); };

  const route = challengeRoute(form.type);
  const version = Number(form.version);
  const openable = route.allowed && UUID.test(form.id.trim()) && Number.isSafeInteger(version) && version >= 1 && form.grounds.trim().length >= 16;
  return (
    <>
      <PageTitle>Knowledge challenges</PageTitle>
      {subjectParam !== null && subject === null ? <LiveStatus assertive>This link names no subject id (a uuid); check the link you followed — the domain&apos;s challenges are shown instead.</LiveStatus> : null}
      <UnknownNote>A challenge contests a claim, an assessment, a warning or a forecast: grounds, evidence, a reviewer who is neither the opener nor the
        owner, an outcome. An upheld challenge enters the product&apos;s fitness evaluation; the mark itself stays a knowledge owner&apos;s act. A decision is
        contested through its appeal or gate challenge, a run through its simulation challenge.</UnknownNote>

      <section style={cardStyle} aria-labelledby="kch-open-h">
        <h2 id="kch-open-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>Open a challenge</h2>
        <label htmlFor="kch-type" style={{ display: 'block' }}>Product type</label>
        <select id="kch-type" value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}>
          {['CLM', 'ENT', 'EVT', 'REL', 'ASM', 'WRN', 'FCT', 'DPK', 'SIM'].map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <p>{route.statement}.</p>
        <label htmlFor="kch-id" style={{ display: 'block' }}>Product id</label>
        <input id="kch-id" style={inputStyle} value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} />
        <label htmlFor="kch-version" style={{ display: 'block' }}>Version</label>
        <input id="kch-version" style={inputStyle} inputMode="numeric" value={form.version} onChange={(e) => setForm({ ...form, version: e.target.value })} />
        <label htmlFor="kch-grounds" style={{ display: 'block' }}>Grounds (16 to 4000 characters)</label>
        <textarea id="kch-grounds" style={textareaStyle} value={form.grounds} maxLength={4000} onChange={(e) => setForm({ ...form, grounds: e.target.value })} />
        <GovernedButton label="Open the challenge" pendingLabel="opening" disabled={!openable}
          onRun={async () => {
            setOpenProblem(null);
            const r = await provenanceApi.open(scope, { type: form.type, id: form.id.trim().toLowerCase(), version, grounds: form.grounds.trim(), disputed: [], requestId });
            if (!r.ok || r.data === undefined) { const m = said(r, 'The challenge was not opened'); setOpenProblem(m); throw new Error(m); }
            setRequestId(newId()); setForm({ ...form, grounds: '' }); await after(r.data.receipt);
          }} />
        {route.allowed ? null : <p style={{ color: 'var(--eye-color-ink-muted)' }}>Not available here: {route.statement}.</p>}
        {openProblem === null ? null : <LiveStatus assertive>{openProblem}</LiveStatus>}
      </section>

      <section aria-labelledby="kch-list-h">
        <h2 id="kch-list-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>{subject === null ? 'The domain\'s challenges' : 'The challenges of this subject'}</h2>
        <label htmlFor="kch-state">Show</label>{' '}
        <select id="kch-state" value={state} onChange={(e) => setState(e.target.value)}>
          <option value="live">live (open or under review)</option><option value="">all</option>
          <option value="upheld">upheld</option><option value="dismissed">dismissed</option><option value="withdrawn">withdrawn</option>
        </select>
        <Receipt receipt={receipt} />
        {problem === null ? null : <LiveStatus assertive>{problem}</LiveStatus>}
        {rows === null ? <Empty>reading the challenges…</Empty> : rows.length === 0 ? <Empty>No challenge in this view.</Empty>
          : rows.map((c) => <ChallengeCard key={c.challenge_id} ch={c} me={who} onDone={after} />)}
        {appeals === null ? null : (
          <p>The subject&apos;s appeals (B35, the decision side&apos;s contest path): {appeals.length === 0 ? 'none recorded' : appeals.map((a) => `${String(a['case_id'])} ${String(a['state'])}${a['outcome'] === null ? '' : ` (${String(a['outcome'])})`}`).join('; ')}.</p>
        )}
      </section>
    </>
  );
}

export default function ChallengesPage() {
  return <Suspense fallback={<Empty>reading the link…</Empty>}><ChallengesBody /></Suspense>;
}
