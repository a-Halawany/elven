'use client';
/**
 * Requests — a person's TYPED REQUESTS (CP-6 B9, migration 0066 §9; interface L10-I04 ExecutiveActionRequested).
 *
 * A request is a command with an EXACTLY-ONCE institutional effect. The requester names a `request_key`; the server
 * records the request's digest with it: the same key with the same request returns the request already recorded (no
 * second effect, no second run, no second ExecutiveActionRequested — the repeat is noted on the request's events), the
 * same key with a different request is refused — and the refusal is shown here
 * as the server states it. The server ROUTES a request to the responsible capability (an analysis runs the briefing
 * agent under its own session; a scenario, a simulation or a decision waits on the owner's own governed act, which
 * names the request and fulfils it) or EFFECTS it in the write (a delegation, a suppression, a follow-up).
 *
 * Nothing here predicts a result: the list, the record, the run and every effect are rendered as the server returned
 * them, and a control resolves only on the server's answer.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useShell } from '../layout';
import { decisions as api, REQUEST_KINDS, type FollowUp, type OpenedRequest, type Package, type RequestDetail, type RequestIntake,
  type RequestKind, type RequestRow, type RequestRun, type RequestState } from '../../../lib/decisions';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type Row = Record<string, unknown>;
type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
/** The write results as lib/decisions.ts declares them (the fulfil, the withdrawal, a follow-up's completion). */
type Fulfilled = { request_id: string; kind: RequestKind; state: RequestState; routed_to: string; routed_ref: string };
type Withdrawn = { request_id: string; kind: RequestKind; state: RequestState; reversed: string | null };
type Completed = { follow_up_id: string; state: string; was_overdue: boolean };
const STATES = ['routed', 'fulfilled', 'refused', 'withdrawn'] as const;
const TASKS = ['briefing', 'draft', 'report', 'monitor'] as const;
const str = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : str(v));
/** A datetime-local value → an ISO instant (undefined when empty); the server validates the instant. */
const toIso = (local: string): string | undefined => (local.trim() === '' ? undefined : new Date(local).toISOString());
/** A failed call, as the server answered it: status, code and message verbatim (a network failure has no code). */
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
/** The purpose a request is made under: an analysis is the briefing agent's run (purpose `briefing`); every other kind is `decision`. */
const purposeOf = (kind: RequestKind) => (kind === 'analysis' ? 'briefing' : 'decision');

/** What the server requires of each kind (validateRequest and executive.open_request), stated beside the form. */
const KIND_NOTE: Record<RequestKind, string> = {
  analysis: 'routed to an agent run under the agent\'s own session (trigger kind request): the subject names the room (DRM) or the package (DPK) to brief; the task is briefing, draft, report or monitor; agent_id names the agent, else the domain\'s active agent of the task\'s kind runs. The run\'s outcome fulfils or refuses the request in the same answer.',
  scenario: 'routed to the forecast owner: their scenario declaration (prediction.scenario.declare) names the request and fulfils it; the subject may name the forecast (FCT). The request waits, state routed, until then.',
  simulation: 'routed to the twin owner: their simulation run (simulation.run) names the request and fulfils it. The request waits, state routed, until then.',
  decision: 'routed to the decision owner: a package declaration or review names the request and fulfils it; a subject naming a package (DPK) is checked — a package already committed, monitoring or closed is refused (stale_approval), a version named is checked against the current one (stale_version).',
  delegation: 'effected in the write: the requester lends their standing in the room (subject DRM) to the delegate until an instant in the future; the action defaults to decision.review. Only a member of the room lends it; the policy still decides the delegate\'s act.',
  suppression: 'effected in the write: the warning (subject WRN), raised or acknowledged and not already suppressed, is marked suppressed until an instant in the future; its state does not change.',
  follow_up: 'effected in the write: an owned, dated item on the package\'s (DPK) or room\'s (DRM) agenda, overdue after its date; the owner defaults to the requester; completed by its owner or its requester with a note.',
};

interface Draft {
  kind: RequestKind; requestKey: string; instruction: string;
  objectType: string; objectId: string; version: string;
  task: (typeof TASKS)[number]; agentId: string; action: string;
  delegate: string; owner: string; dueAt: string; until: string;
}
const EMPTY: Draft = { kind: 'analysis', requestKey: '', instruction: '', objectType: 'DRM', objectId: '', version: '', task: 'briefing', agentId: '', action: 'decision.review', delegate: '', owner: '', dueAt: '', until: '' };
/** The object type each kind conventionally names (the server's checks name it); editable. */
const DEFAULT_TYPE: Record<RequestKind, string> = { analysis: 'DRM', scenario: 'FCT', simulation: '', decision: 'DPK', delegation: 'DRM', suppression: 'WRN', follow_up: 'DPK' };
const needsUntil = (k: RequestKind) => k === 'delegation' || k === 'suppression';
const draftOk = (d: Draft) => {
  const key = d.requestKey.trim(); const ins = d.instruction.trim();
  if (key.length < 1 || key.length > 200 || ins.length < 4 || ins.length > 4096) return false;
  if (d.kind === 'delegation' && (d.delegate.trim() === '' || d.until.trim() === '')) return false;
  if (d.kind === 'suppression' && d.until.trim() === '') return false;
  if (d.kind === 'follow_up' && d.dueAt.trim() === '') return false;
  return true;
};
function toIntake(d: Draft): RequestIntake {
  const subject: Row = {};
  if (d.objectType.trim() !== '') subject['object_type'] = d.objectType.trim();
  if (d.objectId.trim() !== '') subject['object_id'] = d.objectId.trim();
  if (d.version.trim() !== '') subject['version'] = Number(d.version);
  if (d.kind === 'analysis') { subject['task'] = d.task; if (d.agentId.trim() !== '') subject['agent_id'] = d.agentId.trim(); }
  if (d.kind === 'delegation' && d.action.trim() !== '') subject['action'] = d.action.trim();
  const intake: RequestIntake = { kind: d.kind, request_key: d.requestKey.trim(), subject, instruction: d.instruction.trim() };
  if (d.kind === 'delegation' && d.delegate.trim() !== '') intake.delegate = d.delegate.trim();
  if (d.kind === 'follow_up' && d.owner.trim() !== '') intake.owner = d.owner.trim();
  if (d.kind === 'follow_up') { const due = toIso(d.dueAt); if (due !== undefined) intake.due_at = due; }
  if (needsUntil(d.kind)) { const until = toIso(d.until); if (until !== undefined) intake.until = until; }
  return intake;
}

const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const linkButton = { font: 'inherit', background: 'none', border: 'none', color: 'var(--eye-color-accent-strong)', cursor: 'pointer', padding: 0, textDecoration: 'underline' } as const;

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}
const txt = (id: string, value: string, onChange: (v: string) => void, type = 'text') => (
  <input id={id} type={type} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)} />
);
const sel = (id: string, value: string, options: readonly string[], onChange: (v: string) => void, blank?: string) => (
  <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)}>
    {blank !== undefined && <option value="">{blank}</option>}
    {options.map((o) => <option key={o} value={o}>{o}</option>)}
  </select>
);

/** A state, three channels: glyph, uppercase word, colour. */
function StateBadge({ state }: { state: string }) {
  const m: Record<string, { glyph: string; token: string }> = {
    routed: { glyph: '→', token: '--eye-color-uncertain' }, fulfilled: { glyph: '✓', token: '--eye-color-success' },
    refused: { glyph: '✕', token: '--eye-color-critical' }, withdrawn: { glyph: '⊘', token: '--eye-color-ink-muted' },
    open: { glyph: '○', token: '--eye-color-uncertain' }, overdue: { glyph: '⚑', token: '--eye-color-critical' }, done: { glyph: '✓', token: '--eye-color-success' },
  };
  const s = m[state] ?? { glyph: '?', token: '--eye-color-ink-muted' };
  return <span style={{ color: `var(${s.token})`, border: `1px solid var(${s.token})`, borderRadius: 'var(--eye-radius-sm)', paddingInline: 'var(--eye-space-4)', fontSize: 'var(--eye-type-label-sm)', fontWeight: 650, whiteSpace: 'nowrap' }}>{s.glyph} {state.toUpperCase()}</span>;
}

/** A value the server returned, rendered as it is: an instant, an identifier, a nested record, or nothing. */
function Value({ v }: { v: unknown }) {
  if (v === null || v === undefined || v === '') return <>—</>;
  if (typeof v === 'boolean' || typeof v === 'number') return <Mono>{String(v)}</Mono>;
  if (typeof v === 'string') {
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(v)) return <>{fmtInstant(v)} (<Mono>{v}</Mono>)</>;
    return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v) ? <Mono>{v}</Mono> : <span style={{ whiteSpace: 'pre-wrap' }}>{v}</span>;
  }
  return <Mono>{JSON.stringify(v)}</Mono>;
}
/** Every field of a record the server returned, in the order it returned them. */
function RecordFields({ r }: { r: Row }) {
  const keys = Object.keys(r);
  return keys.length === 0 ? <Empty>an empty record</Empty> : <dl style={{ margin: 0 }}>{keys.map((k) => <DefinitionRow key={k} term={k}><Value v={r[k]} /></DefinitionRow>)}</dl>;
}

/** The open route's answer, VERBATIM: the request as recorded (or repeated) and, for an analysis, the run that answered it. */
function Opened({ request, run }: { request: OpenedRequest; run: RequestRun | null }) {
  return (
    <>
      <p>
        {request.repeated
          ? <><strong>repeated</strong> — the key was already used for this same request: the server returned request <Mono>{request.request_id}</Mono> as recorded; no second effect, no second run, no second ExecutiveActionRequested — the repeat is noted on the request's events.</>
          : <><strong>recorded</strong> request <Mono>{request.request_id}</Mono> at {fmtInstant(request.requested_at)}.</>}
      </p>
      <dl style={{ margin: 0 }}>
        <DefinitionRow term="Kind / state"><Mono>{request.kind}</Mono> · <StateBadge state={request.state} /></DefinitionRow>
        <DefinitionRow term="Routed to"><Mono>{request.routed_to}</Mono></DefinitionRow>
        <DefinitionRow term="Routed ref">{request.routed_ref === null ? (request.state === 'routed' ? 'none yet — the request waits on the responsible owner\'s act' : 'none') : <Mono>{request.routed_ref}</Mono>}</DefinitionRow>
        <DefinitionRow term="Request digest"><Mono>{request.request_digest}</Mono></DefinitionRow>
        <DefinitionRow term="Effect">{Object.keys(request.effect).length === 0 ? 'none in this write' : <RecordFields r={request.effect} />}</DefinitionRow>
      </dl>
      {run !== null && (
        <>
          <h4 style={h3}>The agent run the request triggered</h4>
          <dl style={{ margin: 0 }}>
            <DefinitionRow term="Run"><Mono>{run.run_id}</Mono> by agent <Mono>{run.agent_id}</Mono></DefinitionRow>
            <DefinitionRow term="Outcome"><strong>{str(run.outcome)}</strong>{run.stop_reason !== null ? <> — stopped: {String(run.stop_reason)}</> : null}</DefinitionRow>
            <DefinitionRow term="Refusals during the run"><Value v={run.refusals} /></DefinitionRow>
            <DefinitionRow term="Escalated to"><Value v={run.escalated_to} /></DefinitionRow>
            <DefinitionRow term="Fulfilment recorded"><RecordFields r={run.fulfilment} /></DefinitionRow>
          </dl>
        </>
      )}
    </>
  );
}

export default function RequestsPage() {
  const { scope, me } = useShell();
  const [rows, setRows] = useState<RequestRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState('');
  const [kindFilter, setKindFilter] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RequestDetail | null>(null);
  const [detailProblem, setDetailProblem] = useState<string | null>(null);
  const [fulfilRef, setFulfilRef] = useState('');
  const [fulfilNote, setFulfilNote] = useState('');
  const [fulfilled, setFulfilled] = useState<Fulfilled | null>(null);
  const [fulfilReceipt, setFulfilReceipt] = useState<ReceiptT>(null);
  const [fulfilProblem, setFulfilProblem] = useState<string | null>(null);
  const [wdReason, setWdReason] = useState('');
  const [withdrawn, setWithdrawn] = useState<Withdrawn | null>(null);
  const [wdReceipt, setWdReceipt] = useState<ReceiptT>(null);
  const [wdProblem, setWdProblem] = useState<string | null>(null);
  const [doneNote, setDoneNote] = useState('');
  const [done, setDone] = useState<Completed | null>(null);
  const [doneReceipt, setDoneReceipt] = useState<ReceiptT>(null);
  const [doneProblem, setDoneProblem] = useState<string | null>(null);
  const [packages, setPackages] = useState<Package[] | null>(null);
  const [packagesProblem, setPackagesProblem] = useState<string | null>(null);
  const [packageId, setPackageId] = useState('');
  const [agenda, setAgenda] = useState<FollowUp[] | null>(null);
  const [agendaProblem, setAgendaProblem] = useState<string | null>(null);
  const [agendaNotes, setAgendaNotes] = useState<Record<string, string>>({});
  const [agendaDone, setAgendaDone] = useState<Completed | null>(null);
  const [agendaReceipt, setAgendaReceipt] = useState<ReceiptT>(null);
  const [agendaDoneProblem, setAgendaDoneProblem] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(EMPTY);
  const [opened, setOpened] = useState<{ request: OpenedRequest; run: RequestRun | null } | null>(null);
  const [openReceipt, setOpenReceipt] = useState<ReceiptT>(null);
  const [openProblem, setOpenProblem] = useState<string | null>(null);

  const load = async () => {
    const r = await api.requests(scope, { state: stateFilter === '' ? null : stateFilter, kind: kindFilter === '' ? null : kindFilter });
    if (!r.ok || r.data === undefined) { setRows(null); setProblem(refusal(r, 'the requests could not be listed')); return; }
    setProblem(null); setRows(r.data.requests);
  };
  const loadDetail = async (id: string) => {
    const r = await api.request(scope, id);
    if (!r.ok || r.data === undefined) { setDetail(null); setDetailProblem(refusal(r, 'the request could not be read')); return; }
    setDetailProblem(null); setDetail(r.data.request);
  };
  const loadAgenda = async (pkg: string) => {
    if (pkg === '') { setAgenda(null); setAgendaProblem(null); return; }
    const r = await api.workflow(scope, pkg);
    if (!r.ok || r.data === undefined) { setAgenda(null); setAgendaProblem(refusal(r, 'the package\'s agenda could not be read')); return; }
    setAgendaProblem(null); setAgenda(r.data.follow_ups);
  };
  const select = (id: string) => {
    setSelected(id); setDetail(null); setDetailProblem(null);
    setFulfilRef(''); setFulfilNote(''); setFulfilled(null); setFulfilReceipt(null); setFulfilProblem(null);
    setWdReason(''); setWithdrawn(null); setWdReceipt(null); setWdProblem(null);
    setDoneNote(''); setDone(null); setDoneReceipt(null); setDoneProblem(null);
    void loadDetail(id);
  };
  const setKind = (kind: RequestKind) => setDraft({ ...draft, kind, objectType: DEFAULT_TYPE[kind] });
  useEffect(() => { void load(); }, [scope, stateFilter, kindFilter]);
  useEffect(() => {
    void (async () => {
      const r = await api.list(scope);
      if (!r.ok || r.data === undefined) { setPackagesProblem(refusal(r, 'the packages could not be listed')); return; }
      setPackagesProblem(null); setPackages(r.data.packages);
    })();
  }, [scope]);

  const current = selected === null ? null : rows?.find((r) => r.request_id === selected) ?? null;
  const repeats = detail === null ? 0 : detail.events.filter((e) => e.event === 'request.repeated').length;
  const followUp = detail?.effect.follow_up ?? null;
  const mine = detail !== null && detail.requester_principal_id === me.principalId;
  /** What executive.withdraw_request can grant: a routed request, or a fulfilled in-write effect (a delegation, a suppression, a follow-up); a fulfilled routed act stands. */
  const withdrawable = detail !== null && (detail.state === 'routed' || (detail.state === 'fulfilled' && (detail.kind === 'delegation' || detail.kind === 'suppression' || detail.kind === 'follow_up')));

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Requests</h1>
      <UnknownNote>
        A typed request is a person's command with an <strong>exactly-once</strong> institutional effect. The requester's
        <strong> request key</strong> is the boundary: the same key with the same request returns the request already recorded (no
        second effect, no second run, no second ExecutiveActionRequested — the repeat is noted on the request's events); the same key
        with a different request is <strong>refused</strong>. The server <strong>routes</strong> a
        request to the responsible capability (an analysis runs the briefing agent under its own session; a scenario, a simulation or a
        decision waits on the owner's own act, which names the request and fulfils it) or <strong>effects</strong> it in the write (a
        delegation, a suppression, a follow-up). A withdrawal reverses an in-write effect; an act already done stands. Everything below is
        the server's record, and each refusal is shown as the server states it.
      </UnknownNote>

      <section aria-labelledby="list-h" style={cardStyle}>
        <h2 id="list-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Requests{rows === null ? '' : ` (${rows.length})`}</h2>
        <div style={rowStyle}>
          <Field id="f-state" label="State">{(id) => sel(id, stateFilter, STATES, setStateFilter, 'any state')}</Field>
          <Field id="f-kind" label="Kind">{(id) => sel(id, kindFilter, REQUEST_KINDS, setKindFilter, 'any kind')}</Field>
        </div>
        {problem !== null && <LiveStatus assertive><span style={critical}>not listed — {problem}</span></LiveStatus>}
        {rows === null ? (problem === null ? <Empty>reading the requests…</Empty> : null) : rows.length === 0 ? <Empty>No request matches in this domain.</Empty> : (
          <ScrollBox label="requests">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Select</Th><Th>Kind</Th><Th>State</Th><Th>Routed to</Th><Th>Routed ref</Th><Th>Key</Th><Th>Requester</Th><Th>Instruction</Th><Th>Subject</Th><Th>Requested</Th><Th>Answered / withdrawn</Th><Th>Refusal or reason</Th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const isSel = r.request_id === selected;
                  return (
                    <tr key={r.request_id} aria-selected={isSel}>
                      <Td><button type="button" aria-pressed={isSel} onClick={() => select(r.request_id)} style={linkButton}>{isSel ? 'selected' : 'select'}</button></Td>
                      <Td mono>{r.kind}</Td>
                      <Td><StateBadge state={r.state} /></Td>
                      <Td mono>{str(r.routed_to)}</Td>
                      <Td mono>{short(r.routed_ref)}</Td>
                      <Td mono>{r.request_key}</Td>
                      <Td mono>{short(r.requester_principal_id)}{r.requester_principal_id === me.principalId ? ' (you)' : ''}</Td>
                      <Td>{r.instruction}</Td>
                      <Td mono>{str(r.subject['object_type'])} {short(r.subject['object_id'])}</Td>
                      <Td>{fmtInstant(r.requested_at)}</Td>
                      <Td>{r.fulfilled_at !== null ? `fulfilled ${fmtInstant(r.fulfilled_at)}` : r.withdrawn_at !== null ? `withdrawn ${fmtInstant(r.withdrawn_at)}` : '—'}</Td>
                      <Td>{str(r.refusal)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollBox>
        )}
      </section>

      {selected !== null && (
        <section aria-labelledby="req-h" style={cardStyle}>
          <h2 id="req-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Request <Mono>{selected}</Mono>{current !== null ? <> — {current.kind}</> : null}</h2>
          {detailProblem !== null && <LiveStatus assertive><span style={critical}>not read — {detailProblem}</span></LiveStatus>}
          {detail === null ? (detailProblem === null ? <Empty>reading the request…</Empty> : null) : (
            <>
              <dl style={{ margin: 0 }}>
                <DefinitionRow term="Kind / state"><Mono>{detail.kind}</Mono> · <StateBadge state={detail.state} /></DefinitionRow>
                <DefinitionRow term="Routed to"><Mono>{detail.routed_to}</Mono></DefinitionRow>
                <DefinitionRow term="Routed ref">{detail.routed_ref === null ? 'none — no act has answered the request' : <Mono>{detail.routed_ref}</Mono>}</DefinitionRow>
                <DefinitionRow term="Repeated">{repeats === 0 ? 'never — no repeat of the key is recorded on the events' : `${repeats} time(s) — the same key with the same request, each returning this record (no second effect)`}</DefinitionRow>
                <DefinitionRow term="Request key / digest"><Mono>{detail.request_key}</Mono> · <Mono>{detail.request_digest}</Mono></DefinitionRow>
                <DefinitionRow term="Requester"><Mono>{detail.requester_principal_id}</Mono>{mine ? ' (you)' : ''}</DefinitionRow>
                <DefinitionRow term="Instruction"><span style={{ whiteSpace: 'pre-wrap' }}>{detail.instruction}</span></DefinitionRow>
                <DefinitionRow term="Subject">{Object.keys(detail.subject).length === 0 ? 'none named' : <RecordFields r={detail.subject} />}</DefinitionRow>
                <DefinitionRow term="Delegate / owner">delegate <Value v={detail.delegate_principal_id} /> · owner <Value v={detail.owner_principal_id} /></DefinitionRow>
                <DefinitionRow term="Due / until">due <Value v={detail.due_at} /> · until <Value v={detail.until_at} /></DefinitionRow>
                <DefinitionRow term="Requested">{fmtInstant(detail.requested_at)}</DefinitionRow>
                <DefinitionRow term="Fulfilled">{detail.fulfilled_at === null ? 'not fulfilled' : <>{fmtInstant(detail.fulfilled_at)} by <Mono>{str(detail.fulfilled_by)}</Mono></>}</DefinitionRow>
                <DefinitionRow term="Withdrawn">{detail.withdrawn_at === null ? 'not withdrawn' : fmtInstant(detail.withdrawn_at)}</DefinitionRow>
                <DefinitionRow term="Refusal or withdrawal reason"><Value v={detail.refusal} /></DefinitionRow>
                <DefinitionRow term="Correlation"><Mono>{detail.correlation_id}</Mono></DefinitionRow>
              </dl>

              <h3 style={h3}>Effect</h3>
              {'delegation' in detail.effect && (detail.effect.delegation === null || detail.effect.delegation === undefined ? <Empty>No delegation row is recorded for this request.</Empty> : <><p style={muted}>The delegation, as recorded (membership-level: the delegate stands as a member of the room within the window; the policy decides the act).</p><RecordFields r={detail.effect.delegation} /></>)}
              {'suppression' in detail.effect && (detail.effect.suppression === null || detail.effect.suppression === undefined ? <Empty>No suppression row is recorded for this request.</Empty> : <><p style={muted}>The warning suppression, as recorded (the warning's state does not change; the list and the briefing mark it suppressed until the instant).</p><RecordFields r={detail.effect.suppression} /></>)}
              {'follow_up' in detail.effect && (followUp === null ? <Empty>No follow-up row is recorded for this request.</Empty> : (
                <>
                  <p style={muted}>The follow-up, as recorded.</p>
                  <RecordFields r={{ ...followUp }} />
                  {followUp.state === 'open' && (
                    <>
                      <h4 style={h3}>Complete the follow-up</h4>
                      <p style={muted}>Its owner's or its requester's act, with a note saying what was done (at least 4 characters); the server says whether it was overdue.</p>
                      <Field id="done-note" label="Note">{(id) => txt(id, doneNote, setDoneNote)}</Field>
                      <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                        <GovernedButton label="Complete" pendingLabel="completing" disabled={doneNote.trim().length < 4}
                          onRun={async () => {
                            setDoneProblem(null);
                            const r = await api.completeFollowUp(scope, followUp.follow_up_id, doneNote.trim());
                            if (!r.ok || r.data === undefined) { const m = refusal(r, 'the completion was not answered'); setDoneProblem(m); throw new Error(m); }
                            setDone(r.data.follow_up); setDoneReceipt(r.data.receipt);
                            await loadDetail(selected); await load(); if (packageId !== '') await loadAgenda(packageId);
                          }} />
                      </div>
                      {doneProblem !== null && <LiveStatus assertive><span style={critical}>not completed — {doneProblem}</span></LiveStatus>}
                    </>
                  )}
                  {done !== null && <p>follow-up <Mono>{done.follow_up_id}</Mono> is now {done.state}; was overdue: <Mono>{String(done.was_overdue)}</Mono></p>}
                  <Receipt receipt={doneReceipt} />
                </>
              ))}
              {!('delegation' in detail.effect) && !('suppression' in detail.effect) && !('follow_up' in detail.effect) && <Empty>A {detail.kind} request has no in-write effect: it is answered by the responsible owner's own act, named as the routed ref.</Empty>}

              <h3 style={h3}>Events ({detail.events.length})</h3>
              {detail.events.length === 0 ? <Empty>No event.</Empty> : (
                <ScrollBox label="request events">
                  <table className="eye-table" style={tableStyle}>
                    <thead><tr><Th>Event</Th><Th>Actor</Th><Th>Occurred</Th><Th>Details</Th></tr></thead>
                    <tbody>{detail.events.map((e, i) => (
                      <tr key={i}>
                        <Td mono>{e.event}</Td><Td mono>{short(e.actor_principal_id)}</Td><Td>{fmtInstant(e.occurred_at)}</Td><Td mono>{JSON.stringify(e.details ?? {})}</Td>
                      </tr>))}</tbody>
                  </table>
                </ScrollBox>
              )}

              {detail.state === 'routed' && (
                <>
                  <h3 style={h3}>Fulfil — name the act that answered it</h3>
                  <p style={muted}>
                    The responsible owner's act (a run, a scenario, a simulation run, a package) answered this routed request without naming it: name it
                    here by its id. The server binds the act to the request's kind and refuses an id of another kind or of another domain.
                  </p>
                  <div style={rowStyle}>
                    <Field id="ful-ref" label="Routed ref (the answering act's uuid)">{(id) => txt(id, fulfilRef, setFulfilRef)}</Field>
                    <Field id="ful-note" label="Note (optional)">{(id) => txt(id, fulfilNote, setFulfilNote)}</Field>
                  </div>
                  <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                    <GovernedButton label="Fulfil" pendingLabel="fulfilling" disabled={fulfilRef.trim() === ''}
                      onRun={async () => {
                        setFulfilProblem(null);
                        const r = await api.fulfilRequest(scope, selected, fulfilRef.trim(), fulfilNote.trim() === '' ? null : fulfilNote.trim());
                        if (!r.ok || r.data === undefined) { const m = refusal(r, 'the fulfilment was not answered'); setFulfilProblem(m); throw new Error(m); }
                        setFulfilled(r.data.request); setFulfilReceipt(r.data.receipt);
                        await loadDetail(selected); await load();
                      }} />
                  </div>
                  {fulfilProblem !== null && <LiveStatus assertive><span style={critical}>not fulfilled — {fulfilProblem}</span></LiveStatus>}
                </>
              )}
              {fulfilled !== null && <p>request <Mono>{fulfilled.request_id}</Mono> is now {fulfilled.state}, answered by <Mono>{fulfilled.routed_ref}</Mono></p>}
              <Receipt receipt={fulfilReceipt} />

              {withdrawable && (
                <>
                  <h3 style={h3}>Withdraw</h3>
                  <p style={muted}>
                    The requester's act, with a reason (at least 4 characters). A routed request is withdrawn; an in-write effect is reversed — the
                    delegation revoked, the suppression lifted, the follow-up withdrawn. An act already done stands and the server refuses.
                    {mine ? '' : ' You are not this request\'s requester; the server refuses a withdrawal by anyone else.'}
                  </p>
                  <Field id="wd-reason" label="Reason">{(id) => txt(id, wdReason, setWdReason)}</Field>
                  <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                    <GovernedButton label="Withdraw" pendingLabel="withdrawing" variant="critical" disabled={wdReason.trim().length < 4}
                      onRun={async () => {
                        setWdProblem(null);
                        const r = await api.withdrawRequest(scope, selected, wdReason.trim());
                        if (!r.ok || r.data === undefined) { const m = refusal(r, 'the withdrawal was not answered'); setWdProblem(m); throw new Error(m); }
                        setWithdrawn(r.data.request); setWdReceipt(r.data.receipt);
                        await loadDetail(selected); await load(); if (packageId !== '') await loadAgenda(packageId);
                      }} />
                  </div>
                  {wdProblem !== null && <LiveStatus assertive><span style={critical}>not withdrawn — {wdProblem}</span></LiveStatus>}
                </>
              )}
              {withdrawn !== null && <p>request <Mono>{withdrawn.request_id}</Mono> is now {withdrawn.state}; reversed: {str(withdrawn.reversed)}</p>}
              <Receipt receipt={wdReceipt} />
            </>
          )}
        </section>
      )}

      <section aria-labelledby="agenda-h" style={cardStyle}>
        <h2 id="agenda-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Follow-ups on a package's agenda</h2>
        <p style={muted}>
          The follow-ups a package carries, read from its workflow: overdue is the server's reading against now, never a state written by a
          clock. A follow-up on a room's agenda is listed under the room's package.
        </p>
        {packagesProblem !== null && <LiveStatus assertive><span style={critical}>packages not listed — {packagesProblem}</span></LiveStatus>}
        <Field id="agenda-pkg" label="Package">
          {(id) => (
            <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={packageId} onChange={(e) => { setPackageId(e.target.value); setAgendaDone(null); setAgendaReceipt(null); setAgendaDoneProblem(null); void loadAgenda(e.target.value); }}>
              <option value="">{packages === null ? 'reading the packages…' : 'choose a package'}</option>
              {(packages ?? []).map((p) => <option key={p.package_id} value={p.package_id}>{p.title} ({p.state}) — {p.package_id.slice(0, 8)}…</option>)}
            </select>
          )}
        </Field>
        {agendaProblem !== null && <LiveStatus assertive><span style={critical}>not read — {agendaProblem}</span></LiveStatus>}
        {packageId !== '' && agenda !== null && (agenda.length === 0 ? <Empty>No follow-up is on this package's agenda.</Empty> : (
          <ScrollBox label="follow-ups">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Status</Th><Th>Instruction</Th><Th>Owner</Th><Th>Due</Th><Th>Request</Th><Th>Done</Th><Th>Note</Th><Th>Complete</Th></tr></thead>
              <tbody>{agenda.map((f) => (
                <tr key={f.follow_up_id}>
                  <Td><StateBadge state={f.status ?? f.state} /></Td>
                  <Td>{f.instruction}</Td>
                  <Td mono>{short(f.owner_principal_id)}{f.owner_principal_id === me.principalId ? ' (you)' : ''}</Td>
                  <Td>{fmtInstant(f.due_at)}</Td>
                  <Td><button type="button" onClick={() => select(f.request_id)} style={linkButton}>{short(f.request_id)}</button></Td>
                  <Td>{f.done_at === null ? '—' : <>{fmtInstant(f.done_at)} by <Mono>{short(f.done_by)}</Mono></>}</Td>
                  <Td>{str(f.note)}</Td>
                  <Td>
                    {f.state === 'open' ? (
                      <span style={{ display: 'flex', gap: 'var(--eye-space-8)', alignItems: 'center' }}>
                        <input aria-label={`note for follow-up ${f.follow_up_id}`} style={{ ...inputStyle, inlineSize: '14rem' }} value={agendaNotes[f.follow_up_id] ?? ''} onChange={(e) => setAgendaNotes({ ...agendaNotes, [f.follow_up_id]: e.target.value })} placeholder="what was done (4+ characters)" />
                        <GovernedButton label="Complete" pendingLabel="completing" variant="quiet" disabled={(agendaNotes[f.follow_up_id] ?? '').trim().length < 4}
                          onRun={async () => {
                            setAgendaDoneProblem(null);
                            const r = await api.completeFollowUp(scope, f.follow_up_id, (agendaNotes[f.follow_up_id] ?? '').trim());
                            if (!r.ok || r.data === undefined) { const m = refusal(r, 'the completion was not answered'); setAgendaDoneProblem(m); throw new Error(m); }
                            setAgendaDone(r.data.follow_up); setAgendaReceipt(r.data.receipt);
                            await loadAgenda(packageId); await load(); if (selected === f.request_id) await loadDetail(selected);
                          }} />
                      </span>
                    ) : '—'}
                  </Td>
                </tr>
              ))}</tbody>
            </table>
          </ScrollBox>
        ))}
        {agendaDoneProblem !== null && <LiveStatus assertive><span style={critical}>not completed — {agendaDoneProblem}</span></LiveStatus>}
        {agendaDone !== null && <p>follow-up <Mono>{agendaDone.follow_up_id}</Mono> is now {agendaDone.state}; was overdue: <Mono>{String(agendaDone.was_overdue)}</Mono></p>}
        <Receipt receipt={agendaReceipt} />
      </section>

      <section aria-labelledby="new-h" style={cardStyle}>
        <h2 id="new-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Open a request</h2>
        <p style={muted}>
          Human-gated, under the purpose <Mono>{purposeOf(draft.kind)}</Mono>. The request key is yours: reuse it only to repeat this same request
          (the server returns the recorded one); a new request takes a new key. Object ids are uuids; the server refuses what it cannot bind and its
          reason is shown here as it states it.
        </p>
        <div style={rowStyle}>
          <Field id="new-kind" label="Kind">{(id) => sel(id, draft.kind, REQUEST_KINDS, (v) => setKind(v as RequestKind))}</Field>
          <Field id="new-key" label="Request key (1–200 characters)">{(id) => txt(id, draft.requestKey, (v) => setDraft({ ...draft, requestKey: v }))}</Field>
        </div>
        <p style={muted}>{KIND_NOTE[draft.kind]}</p>
        <Field id="new-ins" label="Instruction (4–4096 characters)">
          {(id) => <textarea id={id} style={textareaStyle} value={draft.instruction} onChange={(e) => setDraft({ ...draft, instruction: e.target.value })} />}
        </Field>
        <h4 style={h3}>Subject</h4>
        <div style={rowStyle}>
          <Field id="new-otype" label="Object type (three letters, optional)">{(id) => txt(id, draft.objectType, (v) => setDraft({ ...draft, objectType: v }))}</Field>
          <Field id="new-oid" label="Object id (uuid, optional)">{(id) => txt(id, draft.objectId, (v) => setDraft({ ...draft, objectId: v }))}</Field>
          <Field id="new-over" label="Version (optional; checked against the current one)">{(id) => txt(id, draft.version, (v) => setDraft({ ...draft, version: v }), 'number')}</Field>
          {draft.kind === 'analysis' && <Field id="new-task" label="Task">{(id) => sel(id, draft.task, TASKS, (v) => setDraft({ ...draft, task: v as Draft['task'] }))}</Field>}
          {draft.kind === 'analysis' && <Field id="new-agent" label="Agent id (optional; else the domain's active agent of the task's kind)">{(id) => txt(id, draft.agentId, (v) => setDraft({ ...draft, agentId: v }))}</Field>}
          {draft.kind === 'delegation' && <Field id="new-action" label="Action lent (default decision.review)">{(id) => txt(id, draft.action, (v) => setDraft({ ...draft, action: v }))}</Field>}
        </div>
        {(draft.kind === 'delegation' || draft.kind === 'suppression' || draft.kind === 'follow_up') && (
          <>
            <h4 style={h3}>{draft.kind === 'delegation' ? 'Delegation' : draft.kind === 'suppression' ? 'Suppression' : 'Follow-up'}</h4>
            <div style={rowStyle}>
              {draft.kind === 'delegation' && <Field id="new-del" label="Delegate (principal id, required)">{(id) => txt(id, draft.delegate, (v) => setDraft({ ...draft, delegate: v }))}</Field>}
              {needsUntil(draft.kind) && <Field id="new-until" label="Until (required; in the future)">{(id) => txt(id, draft.until, (v) => setDraft({ ...draft, until: v }), 'datetime-local')}</Field>}
              {draft.kind === 'follow_up' && <Field id="new-owner" label="Owner (principal id, optional; defaults to you)">{(id) => txt(id, draft.owner, (v) => setDraft({ ...draft, owner: v }))}</Field>}
              {draft.kind === 'follow_up' && <Field id="new-due" label="Due at (required)">{(id) => txt(id, draft.dueAt, (v) => setDraft({ ...draft, dueAt: v }), 'datetime-local')}</Field>}
            </div>
          </>
        )}
        <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <GovernedButton label={draft.kind === 'analysis' ? 'Request the analysis (runs the agent)' : 'Open the request'} pendingLabel={draft.kind === 'analysis' ? 'requesting — the agent runs' : 'opening'} disabled={!draftOk(draft)}
            onRun={async () => {
              setOpenProblem(null);
              const r = await api.openRequest(scope, toIntake(draft));
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'the request was not answered'); setOpened(null); setOpenReceipt(null); setOpenProblem(m); await load(); throw new Error(m); }
              setOpened({ request: r.data.request, run: r.data.run }); setOpenReceipt(r.data.receipt);
              await load(); if (packageId !== '') await loadAgenda(packageId);
            }} />
        </div>
        {openProblem !== null && <LiveStatus assertive><span style={critical}>not recorded — {openProblem}</span></LiveStatus>}
        {opened !== null && <Opened request={opened.request} run={opened.run} />}
        <Receipt receipt={openReceipt} />
      </section>
    </>
  );
}
