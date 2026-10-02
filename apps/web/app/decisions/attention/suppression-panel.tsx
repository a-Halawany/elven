'use client';
/**
 * B24 (0086 §G) — SUPPRESSION APPROVAL, ITEM DELEGATION and DISPOSITIONS, beside the attention queue.
 *
 * Where the class rule of an item's own policy version says approval_required, a suppression is a REQUEST: the item stays live and keeps
 * escalating until a SECOND person approves or refuses it. The server refuses the requester deciding their own request (separation of
 * duties) and anyone holding none of the version's approver roles; an approved expiry is capped at the decision + the class maximum; a
 * request whose instant passes undecided is shown LAPSED and the sweep records it expired.
 *
 * A person who acts on an item in their own right DELEGATES it to an active human holding an acknowledgement role, for a window, with a
 * reason; the delegate may then act on it; the owner stays accountable. The request key is your idempotency key: the same key with the
 * same delegation answers the one recorded; with a different one it is refused. A DISPOSITION records what the item turned out to be —
 * the evaluation below reads them. Every row and every refusal here is the server's.
 */
import { useEffect, useState } from 'react';
import { DISPOSITIONS, REQUEST_STATES, governance as api, requestMark, type Disposition, type DispositionRecorded, type ItemDelegation, type SuppressionRequest } from '../../../lib/attention-governance';
import type { Scope } from '../../../lib/observation';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : v === null || v === undefined || v === '' ? '—' : String(v));
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const input = (id: string, label: string, value: string, onChange: (v: string) => void, type = 'text') => (
  <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>
    <input id={id} type={type} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)} /></div>
);
const toIso = (v: string): string | null => { if (v.trim() === '') return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

export function SuppressionPanel({ scope, me, item }: { scope: Scope; me: { principalId: string }; item: { itemId: string; title: string } | null }) {
  const [requests, setRequests] = useState<SuppressionRequest[] | null>(null);
  const [delegations, setDelegations] = useState<ItemDelegation[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState('pending');
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [actProblem, setActProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [dTo, setDTo] = useState(''); const [dReason, setDReason] = useState(''); const [dUntil, setDUntil] = useState(''); const [dKey, setDKey] = useState('');
  const [disp, setDisp] = useState<Disposition>('actioned'); const [dispNote, setDispNote] = useState('');
  const [recorded, setRecorded] = useState<DispositionRecorded | null>(null);

  const load = async () => {
    const [r, d] = await Promise.all([api.requests(scope, { state: stateFilter }), api.delegations(scope)]);
    if (!r.ok || r.data === undefined) { setRequests(null); setProblem(refusal(r, 'the suppression requests could not be read')); } else { setProblem(null); setRequests(r.data.requests); }
    if (d.ok && d.data !== undefined) setDelegations(d.data.delegations); else setDelegations(null);
  };
  useEffect(() => { void load(); }, [scope, stateFilter]);
  useEffect(() => { if (item !== null) setDKey(`delegate-${item.itemId.slice(0, 8)}-${Date.now().toString(36)}`); setRecorded(null); }, [item?.itemId]);
  const fail = (m: string): never => { setActProblem(m); throw new Error(m); };

  return (
    <section aria-labelledby="governance-h" style={cardStyle}>
      <h2 id="governance-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Suppression approval and delegation</h2>
      <p style={muted}>
        Where the policy asks for approval, a suppression waits here for a second person; the item stays live and keeps escalating until then.
        You cannot approve your own request. An undecided request lapses at its instant and the sweep records it expired.
      </p>

      <h3 style={h3}>Suppression requests</h3>
      <div style={{ display: 'flex', gap: 'var(--eye-space-8)', alignItems: 'end', flexWrap: 'wrap' }}>
        <div><label htmlFor="sr-state" style={{ display: 'block' }}>State</label>
          <select id="sr-state" style={inputStyle} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
            <option value="">any state</option>{REQUEST_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select></div>
        <GovernedButton label="Record lapsed requests as expired" pendingLabel="sweeping" variant="quiet"
          onRun={async () => {
            setActProblem(null); setSaid(null);
            const r = await api.expire(scope);
            if (!r.ok || r.data === undefined) fail(`not swept — ${refusal(r, 'the sweep was not answered')}`);
            else { setSaid(`${r.data.expiry.expired.length} lapsed request(s) recorded expired`); setReceipt(r.data.receipt); await load(); }
          }} />
      </div>
      {problem !== null && <LiveStatus assertive><span style={critical}>not listed — {problem}</span></LiveStatus>}
      {requests === null ? (problem === null ? <Empty>reading the requests…</Empty> : null) : requests.length === 0 ? <Empty>No suppression request in this state.</Empty> : (
        <ScrollBox label="suppression requests">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Item</Th><Th>State</Th><Th>Requested</Th><Th>Until</Th><Th>Reason</Th><Th>Approver roles (policy version)</Th><Th>Decision</Th></tr></thead>
            <tbody>{requests.map((q) => {
              const m = requestMark(String(q.state), q.lapsed);
              return (
                <tr key={q.request_id}>
                  <Td mono>{short(q.item_id)}</Td>
                  <Td><span style={{ color: `var(${m.token})`, fontWeight: 650 }} aria-hidden>{m.glyph}</span> <strong>{m.text}</strong></Td>
                  <Td>{q.requested_at === null ? '—' : fmtInstant(q.requested_at)} by <Mono>{short(q.requested_by)}</Mono>{q.requested_by === me.principalId ? ' (you)' : ''}</Td>
                  <Td>{q.until === null ? '—' : fmtInstant(q.until)}{q.approved_until !== null ? <> — approved until {fmtInstant(q.approved_until)}{q.capped === true ? ' (capped at the class maximum)' : ''}</> : null}</Td>
                  <Td>{q.reason}</Td>
                  <Td><Mono>{q.approver_roles.join(', ')}</Mono> (v{String(q.policy_version ?? '—')})</Td>
                  <Td>{q.state !== 'pending' ? <>{q.decided_by === null ? 'expired undecided' : <>by <Mono>{short(q.decided_by)}</Mono>: {q.decision_reason}</>}</> : q.requested_by === me.principalId ? <span style={muted}>your own request — another person decides it</span> : (
                    <div style={{ display: 'grid', gap: 'var(--eye-space-4)' }}>
                      <label htmlFor={`sr-reason-${q.request_id}`} style={{ fontSize: 'var(--eye-type-label-sm)' }}>Reason (8+ characters)</label>
                      <input id={`sr-reason-${q.request_id}`} style={inputStyle} value={reasons[q.request_id] ?? ''} onChange={(e) => setReasons((x) => ({ ...x, [q.request_id]: e.target.value }))} />
                      {(['approve', 'refuse'] as const).map((d) => (
                        <GovernedButton key={d} label={d === 'approve' ? 'Approve the suppression' : 'Refuse it'} pendingLabel={d === 'approve' ? 'approving' : 'refusing'} variant={d === 'approve' ? 'primary' : 'critical'}
                          disabled={(reasons[q.request_id] ?? '').trim().length < 8}
                          onRun={async () => {
                            setActProblem(null); setSaid(null);
                            const r = await api.decide(scope, q.request_id, d, reasons[q.request_id] ?? '');
                            if (!r.ok || r.data === undefined) fail(`not decided — ${refusal(r, 'the decision was not answered')}`);
                            else { setSaid(`request ${short(q.request_id)} ${r.data.request.state}; the item is ${r.data.request.item_state}`); setReceipt(r.data.receipt); await load(); }
                          }} />
                      ))}
                    </div>
                  )}</Td>
                </tr>
              );
            })}</tbody>
          </table>
        </ScrollBox>
      )}

      <h3 style={h3}>Delegations</h3>
      {delegations === null ? <Empty>reading the delegations…</Empty> : delegations.length === 0 ? <Empty>No item is delegated in this domain.</Empty> : (
        <ScrollBox label="item delegations">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Item</Th><Th>From → to</Th><Th>Owner (accountable)</Th><Th>Window</Th><Th>Reason</Th><Th>State</Th><Th>End</Th></tr></thead>
            <tbody>{delegations.map((g) => (
              <tr key={g.delegation_id}>
                <Td mono>{short(g.item_id)}</Td>
                <Td><Mono>{short(g.from)}</Mono> → <Mono>{short(g.to)}</Mono>{g.to === me.principalId ? ' (you)' : ''}</Td>
                <Td mono>{short(g.owner)}</Td>
                <Td>{g.from_at === null ? '—' : fmtInstant(g.from_at)} – {g.until === null ? '—' : fmtInstant(g.until)}</Td>
                <Td>{g.reason}</Td>
                <Td><strong>{g.state === 'active' ? (g.in_force === true ? 'ACTIVE' : 'ACTIVE — WINDOW PASSED') : 'ENDED'}</strong>{g.end_reason === null ? null : <> — {g.end_reason}</>}</Td>
                <Td>{g.state !== 'active' ? '—' : (
                  <div style={{ display: 'grid', gap: 'var(--eye-space-4)' }}>
                    <label htmlFor={`dl-end-${g.delegation_id}`} style={{ fontSize: 'var(--eye-type-label-sm)' }}>Reason (8+ characters)</label>
                    <input id={`dl-end-${g.delegation_id}`} style={inputStyle} value={reasons[g.delegation_id] ?? ''} onChange={(e) => setReasons((x) => ({ ...x, [g.delegation_id]: e.target.value }))} />
                    <GovernedButton label="End the delegation" pendingLabel="ending" variant="critical" disabled={(reasons[g.delegation_id] ?? '').trim().length < 8}
                      onRun={async () => {
                        setActProblem(null); setSaid(null);
                        const r = await api.endDelegation(scope, g.delegation_id, reasons[g.delegation_id] ?? '');
                        if (!r.ok || r.data === undefined) fail(`not ended — ${refusal(r, 'the end was not answered')}`);
                        else { setSaid(`delegation ${short(g.delegation_id)} ended`); setReceipt(r.data.receipt); await load(); }
                      }} />
                  </div>
                )}</Td>
              </tr>
            ))}</tbody>
          </table>
        </ScrollBox>
      )}

      {item === null ? <p style={muted}>Open an item in the queue to delegate it or record its disposition.</p> : (
        <>
          <h3 style={h3}>Delegate <em>{item.title}</em></h3>
          <p style={muted}>The delegate must be an active person holding a role that may acknowledge in this domain; an agent is never a delegate. You remain the owner of record.</p>
          <div style={rowStyle}>
            {input('dl-to', 'Delegate (principal id)', dTo, setDTo)}
            {input('dl-until', 'Until (within 30 days)', dUntil, setDUntil, 'datetime-local')}
            {input('dl-key', 'Request key (your idempotency key)', dKey, setDKey)}
          </div>
          {input('dl-reason', 'Reason (8+ characters)', dReason, setDReason)}
          <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
            <GovernedButton label="Delegate the item" pendingLabel="delegating" disabled={dTo.trim() === '' || dReason.trim().length < 8 || toIso(dUntil) === null || dKey.trim() === ''}
              onRun={async () => {
                setActProblem(null); setSaid(null);
                const r = await api.delegate(scope, item.itemId, { to: dTo, reason: dReason, until: toIso(dUntil), key: dKey });
                if (!r.ok || r.data === undefined) fail(`not delegated — ${refusal(r, 'the delegation was not answered')}`);
                else { setSaid(r.data.delegation.repeated === true ? 'already recorded under this key (repeated — nothing new)' : `delegated to ${short(r.data.delegation.to)} until ${fmtInstant(String(r.data.delegation.until))}`); setReceipt(r.data.receipt); await load(); }
              }} />
          </div>

          <h3 style={h3}>Record the disposition of <em>{item.title}</em></h3>
          <p style={muted}><Mono>missed</Mono> records an item the engine judged below its thresholds (or abstained on) that mattered; the server refuses it on an item routed as material.</p>
          <div style={rowStyle}>
            <div><label htmlFor="disp-kind" style={{ display: 'block' }}>Disposition</label>
              <select id="disp-kind" style={{ ...inputStyle, inlineSize: '100%' }} value={disp} onChange={(e) => setDisp(e.target.value as Disposition)}>
                {DISPOSITIONS.map((d) => <option key={d} value={d}>{d.replace('_', ' ')}</option>)}
              </select></div>
            {input('disp-note', 'Note (optional)', dispNote, setDispNote)}
          </div>
          <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
            <GovernedButton label="Record the disposition" pendingLabel="recording" variant="quiet"
              onRun={async () => {
                setActProblem(null); setRecorded(null);
                const r = await api.disposition(scope, item.itemId, disp, dispNote);
                if (!r.ok || r.data === undefined) fail(`not recorded — ${refusal(r, 'the disposition was not answered')}`);
                else { setRecorded(r.data.disposition); setReceipt(r.data.receipt); }
              }} />
          </div>
          {recorded !== null && <p>{recorded.repeated ? 'the same disposition was already recorded (repeated — nothing new)' : <>recorded <strong>{recorded.disposition.replace('_', ' ')}</strong>{recorded.previous === null ? '' : ` (it was ${recorded.previous.replace('_', ' ')})`}</>}</p>}
        </>
      )}
      {said !== null && <LiveStatus><span>{said}</span></LiveStatus>}
      {actProblem !== null && <LiveStatus assertive><span style={critical}>{actProblem}</span></LiveStatus>}
      <Receipt receipt={receipt} />
    </section>
  );
}
