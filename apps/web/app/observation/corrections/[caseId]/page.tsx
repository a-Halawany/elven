'use client';
/**
 * CP-6 B50 §CL — ONE CORRECTION CASE and its propagation closure (V03-T-297, V03-T-301, DP-24-002, DP-24-005, PR-24-001/-002/-003, CAP-UM-12,
 * JRN-05, HX-18): `/observation/corrections/<caseId>` opens EXACTLY the case it names (graph.read) — or says why the link cannot.
 *
 * What it shows, all in the server's words: the case (identity, the authority who applied it, the target versions, the reason, the effective
 * time, the propagation state — and that an APPLIED case is not a CLOSED one); every consumer (each affected product with its class, owner,
 * state, deadline and freeze; each subscription consumer with its delivery); the freezes (the frozen product stays visible, with its marker);
 * the escalations; the closure record once written; and the correction impact NOTICE (the original, the correction, the affected products,
 * the decisions, the required review, the closure on one record). The acts — acknowledge, record the recompute, grant a bounded exception,
 * freeze, lift a freeze, close, adopt, sweep — each stand behind B81's Command Review and the server's own port (graph.closure.*,
 * human-gated): a control is disabled with its reason when the person cannot take it; a refusal is shown in the server's words; nothing is
 * optimistic — the case is read again after every act.
 */
import { Suspense, useCallback, useEffect, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useShell } from '../../layout';
import { closureApi, type Receipt as ReceiptT } from '../../../../lib/closure-api-b50';
import { CLOSURE_ACTIONS, actConsequence, closeReadiness, closureStateWords, consumerActs, noticeSections, toClosureRecord, type ClosureActKey, type ClosureConsumer } from '../../../../lib/closure-b50';
import { rolesIn, typedPhrase, type Eligibility } from '../../../../lib/authority-b81';
import { AcknowledgementList, ClosureRecordView, FreezeMarker } from '../../../../components/knowledge';
import { CommandReview } from '../../../../components/authority';
import { DefinitionRow, Empty, LiveStatus, Mono, UnknownNote, cardStyle, textareaStyle } from '../../../../components/observation';
import { Receipt, inputStyle } from '../../../../components/ui';
import { Timestamp } from '../../../../components/text';

type Row = Record<string, unknown>;
/** ONE h1 per rendering (lib/layout-b81's REG-03 ratchet): every branch titles the page through this element. */
function PageTitle({ children }: { children: ReactNode }) { return <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>{children}</h1>; }
const said = (r: { status: number; error?: { code: string; message: string } }, what: string) =>
  `${what} — HTTP ${r.status}${r.error?.code === undefined ? '' : ` ${r.error.code}`}: ${r.error?.message ?? 'no answer; reload the page to read it again'}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const newId = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : '00000000-0000-4000-8000-000000000000');
const elig = (a: { enabled: boolean; reason: string | null }, basis: string): Eligibility => (a.enabled ? { can: true, reason: null, role: null, basis } : { can: false, reason: a.reason, role: null, basis: 'not eligible' });
const CONSUMER_ACTS: ReadonlyArray<{ key: 'acknowledge' | 'recompute' | 'except' | 'freeze'; label: string }> = [
  { key: 'acknowledge', label: 'Acknowledge the consumer' }, { key: 'recompute', label: 'Record the recompute' },
  { key: 'except', label: 'Grant a bounded exception' }, { key: 'freeze', label: 'Freeze the product' },
];

function CaseBody() {
  const { scope, me } = useShell();
  const params = useParams<{ caseId: string }>();
  const caseId = typeof params.caseId === 'string' && UUID.test(params.caseId) ? params.caseId.toLowerCase() : null;
  const [view, setView] = useState<Row | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [actProblem, setActProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | null>(null);
  const [checked, setChecked] = useState(false);
  const [ref, setRef] = useState('');
  const [act, setAct] = useState<'acknowledge' | 'recompute' | 'except' | 'freeze'>('acknowledge');
  const [note, setNote] = useState('');
  const [recomputeRef, setRecomputeRef] = useState('');
  const [expiresAt, setExpiresAt] = useState('');
  const [exceptionOwner, setExceptionOwner] = useState('');
  const [ackId, setAckId] = useState(newId);
  const [liftId, setLiftId] = useState('');
  const [liftReason, setLiftReason] = useState('');
  const [statement, setStatement] = useState('');
  const [adoptReason, setAdoptReason] = useState('');
  const roles = rolesIn(me.bindings, scope);

  const load = useCallback(async (check: boolean) => {
    if (caseId === null) return;
    const r = await closureApi.read(scope, caseId, check);
    if (!r.ok || r.data === undefined) { setProblem(said(r, 'The correction case was not read')); return; }
    setProblem(null); setView(r.data.closure); setChecked(check);
  }, [scope, caseId]);
  useEffect(() => { void load(false); }, [load]);

  if (caseId === null) {
    return (<><PageTitle>Correction case</PageTitle><LiveStatus assertive>This link names no correction case id (a uuid); open the case from the corrections list.</LiveStatus>
      <p><Link href="/observation/corrections">The corrections list</Link></p></>);
  }
  if (view === null) {
    return (<><PageTitle>Correction case {caseId.slice(0, 8)}…</PageTitle>{problem === null ? <Empty>reading the case…</Empty> : <LiveStatus assertive>{problem}</LiveStatus>}</>);
  }

  const k = (view['case'] ?? {}) as Row;
  const closure = (view['closure'] ?? null) as Row | null;
  const contract = (view['contract'] ?? null) as Row | null;
  const consumers = (Array.isArray(view['consumers']) ? view['consumers'] : []) as ClosureConsumer[];
  const freezes = (Array.isArray(view['freezes']) ? view['freezes'] : []) as Row[];
  const escalations = (Array.isArray(view['escalations']) ? view['escalations'] : []) as Row[];
  const record = toClosureRecord(closure, (view['record'] ?? null) as Row | null);
  const digest = typeof view['state_digest'] === 'string' ? (view['state_digest'] as string) : null;
  const caseClosed = closure !== null && closure['state'] === 'closed';
  const actor = { principalId: me.principalId, roles, appliedBy: typeof k['applied_by'] === 'string' ? (k['applied_by'] as string) : null };
  const selected = consumers.find((c) => c.consumer_ref === ref) ?? null;
  const acts = selected === null ? null : consumerActs(selected, actor, caseClosed);
  const ready = closeReadiness(view as never, actor);
  const authority = roles.includes('collection_manager') || roles.includes('domain_admin');
  const contractVersion = contract === null ? null : Number(contract['version']);
  const liveFreezes = freezes.filter((f) => f['lifted_at'] === null);
  const after = async (r: { ok: boolean; status: number; data?: { receipt: ReceiptT }; error?: { code: string; message: string } }, what: string) => {
    if (!r.ok || r.data === undefined) { const m = said(r, what); setActProblem(m); throw new Error(m); }
    setActProblem(null); setReceipt(r.data.receipt); setNote(''); setAckId(newId()); await load(false);
  };
  const runConsumerAct = async () => {
    if (selected === null) return;
    if (act === 'acknowledge' || act === 'recompute') {
      await after(await closureApi.acknowledge(scope, caseId, { consumerRef: selected.consumer_ref, state: act === 'recompute' ? 'recomputed' : 'acknowledged', note: note.trim(), recomputeRef: act === 'recompute' ? recomputeRef.trim() : null, ackId }), 'The acknowledgement was not recorded');
    } else if (act === 'except') {
      await after(await closureApi.except(scope, caseId, { consumerRef: selected.consumer_ref, reason: note.trim(), expiresAt: new Date(expiresAt).toISOString(), ownerPrincipalId: exceptionOwner.trim().toLowerCase(), ackId }), 'The exception was not recorded');
    } else {
      await after(await closureApi.freeze(scope, caseId, selected.consumer_ref, note.trim()), 'The freeze was not recorded');
    }
  };
  const actExtra: string[] = [];
  if (selected === null) actExtra.push('choose a consumer of the case');
  if (act === 'except' ? note.trim().length < 16 : act === 'freeze' ? note.trim().length < 16 : note.trim().length < 8) actExtra.push(act === 'except' || act === 'freeze' ? 'state the reason (16+ characters)' : 'say what was reviewed (8+ characters)');
  if (act === 'recompute' && recomputeRef.trim() === '') actExtra.push('name the re-run record (TYPE:<id>@<version>, or export_package:<id>)');
  if (act === 'except' && (expiresAt === '' || Number.isNaN(Date.parse(expiresAt)))) actExtra.push('enter the instant the exception expires');
  if (act === 'except' && !UUID.test(exceptionOwner.trim())) actExtra.push('name the exception\'s owner (a principal id)');

  return (
    <>
      <p className="eye-shell-meta"><Link href="/observation/corrections">← Corrections</Link></p>
      <PageTitle>Correction case {caseId.slice(0, 8)}… — {String(k['kind'] ?? 'correction')}</PageTitle>
      <UnknownNote>An applied correction is not a closed one: the case closes only when every material consumer is acknowledged, recomputed or under a bounded
        exception, its impact scope is known and the projections reconcile. Until then its products stay marked; a stalled case freezes their publication.</UnknownNote>

      <section style={cardStyle} aria-labelledby="cl-case-h">
        <h2 id="cl-case-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>The case</h2>
        <dl>
          <DefinitionRow term="Closure">{view['tracked'] === true ? closureStateWords(String(closure?.['state'] ?? 'open')) : closureStateWords('not_tracked')}</DefinitionRow>
          <DefinitionRow term="Reason">{String(k['reason'] ?? '')}</DefinitionRow>
          <DefinitionRow term="Received">{<Timestamp value={typeof k['received_at'] === 'string' ? (k['received_at'] as string) : null} />}</DefinitionRow>
          <DefinitionRow term="Applied (effective)">{<Timestamp value={typeof k['applied_at'] === 'string' ? (k['applied_at'] as string) : null} />} by <Mono>{String(k['applied_by'] ?? 'not recorded')}</Mono> — the apply instant, not the closure</DefinitionRow>
          <DefinitionRow term="Target versions">{(Array.isArray(k['target_versions']) ? (k['target_versions'] as Row[]) : []).map((t) => `${String(t['object_id'])} v${String(t['from'] ?? '?')} → v${String(t['to'] ?? '?')}`).join('; ') || 'none recorded'}</DefinitionRow>
          <DefinitionRow term="Propagation">{String(k['propagation_state'] ?? 'pending')} — {String(k['propagation_statement'] ?? '')}</DefinitionRow>
          <DefinitionRow term="Contract">{contract === null ? 'no closure contract is declared in this domain: no consumer stalls by time (a failed delivery still does)' : `version ${String(contract['version'])}${contract['synthetic'] === true ? ' (SYNTHETIC demonstration windows)' : ''}`}</DefinitionRow>
        </dl>
      </section>

      <section aria-labelledby="cl-consumers-h">
        <h2 id="cl-consumers-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>The consumers</h2>
        {consumers.length === 0 ? <Empty>No consumer is recorded for this case yet (its walk has not reached any product).</Empty>
          : <AcknowledgementList caseId={caseId} consumers={consumers} contractVersion={contractVersion} caption={`The consumers of correction case ${caseId.slice(0, 8)}…`} />}
      </section>

      {caseClosed || view['tracked'] !== true ? null : (
        <section style={cardStyle} aria-labelledby="cl-act-h">
          <h2 id="cl-act-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>An act on one consumer</h2>
          <label htmlFor="cl-ref" style={{ display: 'block' }}>Consumer</label>
          <select id="cl-ref" value={ref} onChange={(e) => setRef(e.target.value)}>
            <option value="">choose a consumer</option>
            {consumers.filter((c) => c.material).map((c) => <option key={c.consumer_ref} value={c.consumer_ref}>{c.title ?? c.consumer_ref} ({String(c.state).replace(/_/g, ' ')})</option>)}
          </select>
          <label htmlFor="cl-act" style={{ display: 'block' }}>Act</label>
          <select id="cl-act" value={act} onChange={(e) => setAct(e.target.value as typeof act)}>
            {CONSUMER_ACTS.map((a) => <option key={a.key} value={a.key}>{a.label}{acts === null || acts[a.key].enabled ? '' : ' (not available to you)'}</option>)}
          </select>
          {selected?.frozen ? <p><FreezeMarker state={{ frozen: true, caseId }} /></p> : null}
          <CommandReview action={CLOSURE_ACTIONS[act]} object={{ type: 'COR', id: caseId, version: null, title: selected?.title ?? 'a consumer of the case', state: selected === null ? null : String(selected.state) }}
            digest={digest} eligibility={acts === null ? { can: false, reason: 'choose a consumer of the case', role: null, basis: 'not eligible' } : elig(acts[act], 'the server re-checks the owner, the role and the separation')}
            consequence={actConsequence(act as ClosureActKey, selected?.consumer_ref ?? 'the consumer')} extraReasons={actExtra}
            actionLabel={CONSUMER_ACTS.find((a) => a.key === act)!.label} pendingLabel="recording" variant={act === 'freeze' ? 'critical' : 'primary'}
            onRun={runConsumerAct} problem={actProblem}>
            <label htmlFor="cl-note" style={{ display: 'block' }}>{act === 'except' || act === 'freeze' ? 'Reason (16 to 2000 characters)' : 'What was reviewed (8 to 2000 characters)'}</label>
            <textarea id="cl-note" style={textareaStyle} value={note} maxLength={2000} onChange={(e) => setNote(e.target.value)} />
            {act === 'recompute' ? (<><label htmlFor="cl-rr" style={{ display: 'block' }}>The re-run record</label>
              <input id="cl-rr" style={inputStyle} value={recomputeRef} onChange={(e) => setRecomputeRef(e.target.value)} autoComplete="off" /></>) : null}
            {act === 'except' ? (<>
              <label htmlFor="cl-exp" style={{ display: 'block' }}>Expires at (your local time; within the contract&apos;s limit)</label>
              <input id="cl-exp" type="datetime-local" style={inputStyle} value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
              <label htmlFor="cl-own" style={{ display: 'block' }}>The exception&apos;s owner (a principal id; a record authority under a legal hold)</label>
              <input id="cl-own" style={inputStyle} value={exceptionOwner} onChange={(e) => setExceptionOwner(e.target.value)} autoComplete="off" />
            </>) : null}
          </CommandReview>
        </section>
      )}

      <section aria-labelledby="cl-freezes-h">
        <h2 id="cl-freezes-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>The freezes ({liveFreezes.length} live)</h2>
        {freezes.length === 0 ? <Empty>No product of this case is frozen.</Empty> : (
          <ul>{freezes.map((f) => <li key={String(f['freeze_id'])}>{String(f['product_ref'])}: {String(f['reason_kind']).replace(/_/g, ' ')} — {String(f['reason'])} (frozen <Timestamp value={String(f['frozen_at'])} />{f['lifted_at'] === null ? '; LIVE' : <>; lifted <Timestamp value={String(f['lifted_at'])} /> ({String(f['lift_kind']).replace(/_/g, ' ')})</>})</li>)}</ul>
        )}
        {liveFreezes.length === 0 || caseClosed ? null : (
          <CommandReview action={CLOSURE_ACTIONS.lift} object={{ type: 'CFZ', id: liftId === '' ? caseId : liftId, version: null, title: 'a freeze of this case', state: 'live' }} digest={digest}
            eligibility={authority ? { can: true, reason: null, role: null, basis: 'the correction authority or the domain administrator (the server re-checks that what it guards is resolved)' } : { can: false, reason: 'a freeze is lifted by the correction authority (collection manager) or the domain administrator', role: null, basis: 'not eligible' }}
            consequence={actConsequence('lift', liveFreezes.find((f) => f['freeze_id'] === liftId)?.['product_ref'] as string ?? 'the product')}
            extraReasons={[...(liftId === '' ? ['choose a live freeze'] : []), ...(liftReason.trim().length < 16 ? ['state why the freeze lifts now (16+ characters)'] : [])]}
            actionLabel="Lift the freeze" pendingLabel="lifting" onRun={async () => { await after(await closureApi.lift(scope, liftId, liftReason.trim()), 'The freeze was not lifted'); setLiftId(''); setLiftReason(''); }} problem={actProblem}>
            <label htmlFor="cl-lift" style={{ display: 'block' }}>Freeze</label>
            <select id="cl-lift" value={liftId} onChange={(e) => setLiftId(e.target.value)}>
              <option value="">choose a live freeze</option>
              {liveFreezes.map((f) => <option key={String(f['freeze_id'])} value={String(f['freeze_id'])}>{String(f['product_ref'])}</option>)}
            </select>
            <label htmlFor="cl-lift-r" style={{ display: 'block' }}>Why it lifts now (16 to 2000 characters)</label>
            <textarea id="cl-lift-r" style={textareaStyle} value={liftReason} maxLength={2000} onChange={(e) => setLiftReason(e.target.value)} />
          </CommandReview>
        )}
      </section>

      <section aria-labelledby="cl-esc-h">
        <h2 id="cl-esc-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>The escalations</h2>
        {escalations.length === 0 ? <Empty>No consumer of this case has stalled.</Empty> : (
          <ul>{escalations.map((e) => <li key={String(e['item_id'])}>{String(e['title'])} — {String(e['state'])}{Number(e['escalations']) > 0 ? `, escalated ${String(e['escalations'])} time(s)` : ''}; owner <Mono>{String(e['owner'] ?? 'none — routed to its roles')}</Mono>; due <Timestamp value={typeof e['due_at'] === 'string' ? (e['due_at'] as string) : null} /> (item <Mono>{String(e['item_id']).slice(0, 8)}…</Mono> in <Link href="/decisions/attention">the attention queue</Link>)</li>)}</ul>
        )}
        {authority ? (
          <CommandReview action={CLOSURE_ACTIONS.sweep} object={{ type: 'COR', id: caseId, version: null, title: 'the domain\'s open correction cases', state: null }} digest={digest}
            eligibility={{ can: true, reason: null, role: null, basis: 'the correction authority or the domain administrator' }} consequence={actConsequence('sweep', 'the domain')}
            actionLabel="Sweep the open corrections" pendingLabel="sweeping" onRun={async () => { await after(await closureApi.sweep(scope), 'The sweep was not run'); }} problem={actProblem} />
        ) : null}
      </section>

      <section style={cardStyle} aria-labelledby="cl-close-h">
        <h2 id="cl-close-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>The closure</h2>
        {record !== null ? <ClosureRecordView record={record} /> : view['tracked'] !== true ? (
          <>
            <p>This case was applied before B50 and has no closure record. Adopting it tracks its closure from now on; its windows run from its apply instant, so consumers already past them stall the case at the next sweep. The case and its history are kept.</p>
            <CommandReview action={CLOSURE_ACTIONS.adopt} object={{ type: 'COR', id: caseId, version: null, title: `correction case ${caseId.slice(0, 8)}…`, state: String(k['state'] ?? '') }} digest={digest}
              eligibility={authority ? { can: true, reason: null, role: null, basis: 'the correction authority or the domain administrator' } : { can: false, reason: 'an older case is adopted by the correction authority (collection manager) or the domain administrator', role: null, basis: 'not eligible' }}
              consequence={actConsequence('adopt', caseId)} extraReasons={adoptReason.trim().length < 16 ? ['state why the case is tracked now (16+ characters)'] : []}
              actionLabel="Adopt the correction case" pendingLabel="adopting" onRun={async () => { await after(await closureApi.adopt(scope, caseId, adoptReason.trim()), 'The case was not adopted'); setAdoptReason(''); }} problem={actProblem}>
              <label htmlFor="cl-adopt" style={{ display: 'block' }}>Why it is tracked now (16 to 2000 characters)</label>
              <textarea id="cl-adopt" style={textareaStyle} value={adoptReason} maxLength={2000} onChange={(e) => setAdoptReason(e.target.value)} />
            </CommandReview>
          </>
        ) : (
          <>
            <p>Closing writes the closure record with its audit digest; it cannot be undone. The case, every acknowledgement and every freeze are kept; the freezes lift.</p>
            {checked ? null : <p><button type="button" onClick={() => { void load(true); }}>Run the projection check</button> (an audited read: the projections against their logs, now)</p>}
            <CommandReview action={CLOSURE_ACTIONS.close} object={{ type: 'COR', id: caseId, version: null, title: `correction case ${caseId.slice(0, 8)}…`, state: String(closure?.['state'] ?? 'open') }} digest={digest}
              eligibility={authority ? { can: true, reason: null, role: null, basis: 'the correction authority or the domain administrator (the server re-checks every condition)' } : { can: false, reason: 'a case is closed by the correction authority (collection manager) or the domain administrator', role: null, basis: 'not eligible' }}
              consequence={actConsequence('close', caseId)} typedPhrase={typedPhrase({ digest })}
              extraReasons={[...ready.reasons.filter((r) => !r.startsWith('a case is closed by')), ...(statement.trim().length < 16 ? ['state what was reconciled (16+ characters)'] : [])]}
              actionLabel="Close the correction case" pendingLabel="closing" variant="critical" onRun={async () => { await after(await closureApi.close(scope, caseId, statement.trim()), 'The case was not closed'); setStatement(''); }} problem={actProblem}>
              <label htmlFor="cl-stmt" style={{ display: 'block' }}>What was reconciled (16 to 2000 characters)</label>
              <textarea id="cl-stmt" style={textareaStyle} value={statement} maxLength={2000} onChange={(e) => setStatement(e.target.value)} />
            </CommandReview>
          </>
        )}
      </section>

      <section style={cardStyle} aria-labelledby="cl-notice-h">
        <h2 id="cl-notice-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>The correction impact notice</h2>
        {noticeSections((view['notice'] ?? null) as Row | null).map((s) => (
          <div key={s.key}><h3 style={{ fontSize: 'var(--eye-type-heading-4)' }}>{s.heading}</h3>{s.items.length === 0 ? <p>none</p> : <ul>{s.items.map((x, i) => <li key={`${s.key}:${i}`}>{x}</li>)}</ul>}</div>
        ))}
        <p className="eye-help">An affected product listed here does not claim current completeness until its consumer is closed. Delivering this notice to its recipients is the notification center&apos;s (B84).</p>
      </section>

      <Receipt receipt={receipt} />
      {problem === null ? null : <LiveStatus assertive>{problem}</LiveStatus>}
    </>
  );
}

export default function CorrectionCasePage() {
  return <Suspense fallback={<Empty>reading the link…</Empty>}><CaseBody /></Suspense>;
}
