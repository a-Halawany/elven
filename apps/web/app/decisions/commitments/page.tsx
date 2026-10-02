'use client';
/**
 * Commitments — THE COMMITMENT TRACKER AND THE GOVERNED EXECUTION HANDOFF (CP-6 B34 part C, migration 0090 §C; F-P6-05: CAP-EO-08 the
 * tracker, V03-T-366 the separately governed execution interface, V03-T-372 the execution timeline, FEX-18 partial effects and
 * compensation, OBJ-37 closure with the reviewer's co-sign, V02-T-117 an objective change re-tasks commitments).
 *
 * Every row is the SERVER's: the tracker's severity is C3 only with the reason it names (overdue, an undisposed residual) — no opaque
 * score; the residual is the server's per line, with its NAMED compensation owner; the timeline's five lanes are the server's. A handoff is
 * drafted by the item's owner and ISSUED (C3, human-gated) by a holder of execution_authority who is neither the drafter nor the decision's
 * committer, to a SYNTHETIC target — the synthetic ERP closes no real-ERP clause. The forms are shown to everyone; the server decides who
 * may, and its refusal is shown as it states it.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import {
  commitments as api, COMPENSATION_KINDS, attemptWords, byLane, effectWords, parseDeliverables, residualWords, severityMark, stateMark,
  type CommitmentDetail, type Handoff, type TrackerItem,
} from '../../../lib/commitments';
import { Empty, Mono, cardStyle, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td } from '../../../components/ui';

type Row = Record<string, unknown>;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : String(v ?? '—'));
const toIso = (v: string): string | null => { if (v.trim() === '') return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

function Mark({ m }: { m: { glyph: string; token: string; text: string } }) {
  return <span style={{ color: `var(${m.token})`, border: `1px solid var(${m.token})`, borderRadius: 'var(--eye-radius-sm)', paddingInline: 'var(--eye-space-4)', fontSize: 'var(--eye-type-label-sm)', fontWeight: 650, whiteSpace: 'nowrap' }}>
    <span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}

/** One handoff: its attempts, its effects per line, the residual, its compensations — and the governed acts on it. */
function HandoffCard({ h, onDone }: { h: Handoff; onDone: (msg: string) => void }) {
  const { scope } = useShell();
  const [kind, setKind] = useState<string>('reissue_residual'); const [owner, setOwner] = useState(''); const [due, setDue] = useState(''); const [note, setNote] = useState('');
  const run = async (p: Promise<{ ok: boolean; status: number; error?: { code: string; message: string } }>, what: string) => { const r = await p; onDone(r.ok ? `${what}: recorded` : refusal(r, what)); };
  return (
    <section aria-label={`handoff ${h.handoff_id}`} style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-12)' }}>
      <h4 style={{ marginBlock: 0 }}><Mono title={h.handoff_id}>{short(h.handoff_id)}</Mono> · {h.role} · <Mark m={stateMark(h.state)} />{h.failure_class !== null && <span> ({h.failure_class})</span>}</h4>
      <p style={muted}>target {String(h.target?.['target_key'] ?? '—')} {h.target?.['synthetic'] === true && <strong>(SYNTHETIC)</strong>} · digest <Mono title={h.payload_digest}>{short(h.payload_digest)}</Mono></p>
      <ul aria-label="attempts">{h.attempts.map((a) => <li key={String(a['attempt'])}>{attemptWords(a)}</li>)}</ul>
      {h.effects.length > 0 && <ul aria-label="effects">{h.effects.map((e) => <li key={String(e['line_key'])}>{effectWords(e)}</li>)}</ul>}
      <p><strong>Residual:</strong> {residualWords(h.residual.map((r) => ({ ...r, compensation: (h.compensations.at(-1) ?? null) as Row | null })))}</p>
      {h.state === 'drafted' && <GovernedButton label="Issue (C3 — execution authority)" pendingLabel="Issuing…" onRun={() => run(api.issue(scope, h.handoff_id, h.payload_digest), 'issue')} />}
      {h.compensations.map((c) => (
        <p key={String(c['compensation_id'])}>{String(c['kind'])} · owner <Mono title={String(c['owner_principal_id'])}>{short(c['owner_principal_id'])}</Mono> · due {fmtInstant(c['due_at'])} · <Mark m={stateMark(String(c['state']) === 'proposed' ? 'open' : String(c['state']) === 'accepted' ? 'done' : String(c['state']))} />
          {c['state'] === 'proposed' && <GovernedButton label="Co-sign the accepted residual (the reviewer)" pendingLabel="Co-signing…" onRun={() => run(api.cosignCompensation(scope, String(c['compensation_id']), 'the residual is accepted'), 'co-sign')} />}</p>
      ))}
      {(h.state === 'partially_effected' || h.state === 'failed') && (
        <fieldset style={{ border: '1px solid var(--eye-color-border-default)' }}>
          <legend>Assign the residual to a named compensation owner</legend>
          <label>kind <select value={kind} onChange={(e) => setKind(e.target.value)} style={inputStyle}>{COMPENSATION_KINDS.map((k) => <option key={k}>{k}</option>)}</select></label>{' '}
          <label>owner (principal id) <input value={owner} onChange={(e) => setOwner(e.target.value)} style={inputStyle} /></label>{' '}
          <label>due <input type="datetime-local" value={due} onChange={(e) => setDue(e.target.value)} style={inputStyle} /></label>
          <textarea aria-label="what is done about the residual" value={note} onChange={(e) => setNote(e.target.value)} style={textareaStyle} />
          <GovernedButton label="Assign" pendingLabel="Assigning…" disabled={toIso(due) === null} onRun={() => run(api.compensate(scope, h.handoff_id, { kind, owner: owner.trim(), dueAt: toIso(due) ?? '', note }), 'compensation')} />
        </fieldset>
      )}
      {h.state !== 'drafted' && h.state !== 'issuing' && h.state !== 'reconciled' && <GovernedButton variant="quiet" label="Reconcile" pendingLabel="Reconciling…" onRun={() => run(api.reconcile(scope, h.handoff_id), 'reconcile')} />}
    </section>
  );
}

/** One commitment: its items, the timeline in five lanes, the handoffs, the closure. */
function Detail({ id, onChanged }: { id: string; onChanged: () => void }) {
  const { scope } = useShell();
  const [d, setD] = useState<CommitmentDetail | null>(null); const [msg, setMsg] = useState<string>(''); const [deliv, setDeliv] = useState(''); const [stmt, setStmt] = useState('');
  const load = async () => { const r = await api.get(scope, id); if (r.ok && r.data !== undefined) setD(r.data.commitment); else setMsg(refusal(r, 'the commitment')); };
  useEffect(() => { void load(); }, [id]); // eslint-disable-line react-hooks/exhaustive-deps
  const done = (m: string) => { setMsg(m); void load(); onChanged(); };
  if (d === null) return <p role="status">{msg || 'Loading the commitment…'}</p>;
  const proposed = d.closures.find((c) => c['state'] === 'proposed');
  const closed = d.closures.find((c) => c['state'] === 'cosigned');
  return (
    <section aria-labelledby="cmt-detail" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
      <h2 id="cmt-detail" style={h2}>Commitment <Mono title={id}>{short(id)}</Mono></h2>
      {msg !== '' && <p role="status">{msg}</p>}
      <h3 style={h3}>The execution timeline</h3>
      {byLane(d.timeline).map((l) => (
        <div key={l.lane}><strong>{l.lane}</strong> <span style={muted}>({l.rows.length})</span>
          <ol>{l.rows.map((r, i) => <li key={`${r.ref}-${i}`}>{fmtInstant(r.at)} — {r.kind} <Mono title={r.ref}>{short(r.ref)}</Mono></li>)}</ol></div>
      ))}
      <h3 style={h3}>Handoffs to the execution target</h3>
      {d.handoffs.length === 0 ? <Empty>No handoff drafted.</Empty> : d.handoffs.map((h) => <HandoffCard key={h.handoff_id} h={h} onDone={done} />)}
      <h3 style={h3}>Closure</h3>
      {closed !== undefined ? <p><Mark m={stateMark('done')} /> closed — proposed by {short(closed['proposed_by'])}, co-signed by {short(closed['cosigned_by'])}</p>
        : proposed !== undefined ? <GovernedButton label="Co-sign the closure (the reviewer)" pendingLabel="Co-signing…" onRun={async () => { const r = await api.cosignClosure(scope, String(proposed['closure_id']), id); done(r.ok ? 'closure co-signed' : refusal(r, 'co-sign')); }} />
        : (
          <div>
            <p style={muted}>{d.blockers === null ? 'Nothing blocks the closure.' : `Blocked: ${d.blockers}`}</p>
            <textarea aria-label="deliverables, one per line: title — evidence" placeholder="Second source live — ERP receipts" value={deliv} onChange={(e) => setDeliv(e.target.value)} style={textareaStyle} />
            <textarea aria-label="the closure statement" value={stmt} onChange={(e) => setStmt(e.target.value)} style={textareaStyle} />
            <GovernedButton label="Propose the closure (the owner)" pendingLabel="Proposing…" onRun={async () => {
              const p = parseDeliverables(deliv);
              if (!p.ok) { setMsg(p.error); return; }
              const r = await api.proposeClosure(scope, id, p.deliverables, stmt); done(r.ok ? 'closure proposed' : refusal(r, 'closure'));
            }} />
          </div>
        )}
    </section>
  );
}

export default function CommitmentsPage() {
  const { scope } = useShell();
  const [items, setItems] = useState<TrackerItem[] | null>(null); const [summary, setSummary] = useState<Record<string, number>>({}); const [err, setErr] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const load = async () => { const r = await api.tracker(scope); if (r.ok && r.data !== undefined) { setItems(r.data.tracker.items); setSummary(r.data.tracker.summary); } else setErr(refusal(r, 'the tracker')); };
  useEffect(() => { void load(); }, [scope.tenantId, scope.domainId]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)' }}>Commitments</h1>
      <p style={muted}>The cross-package tracker: owners, reviewers, deadlines, exceptions and the residual of every handoff. Severity is the server&apos;s, with its reason. Execution targets are SYNTHETIC.</p>
      {err !== '' && <p role="alert">{err}</p>}
      {items === null ? <p role="status">Loading the tracker…</p> : items.length === 0 ? <Empty>No commitment is tracked in this domain.</Empty> : (
        <>
          <p>{summary['items'] ?? 0} items in {summary['commitments'] ?? 0} commitments · {summary['overdue'] ?? 0} overdue · {summary['exceptions'] ?? 0} with an exception · {summary['with_residual'] ?? 0} with a residual · {summary['retask_required'] ?? 0} to re-task</p>
          <table style={tableStyle}>
            <thead><tr><Th>Item</Th><Th>Package</Th><Th>Owner / reviewer</Th><Th>Due</Th><Th>State</Th><Th>Severity</Th><Th>Residual</Th><Th>Open</Th></tr></thead>
            <tbody>{items.map((i) => (
              <tr key={i.item_id}>
                <Td>{i.parent_item_id === null ? <strong>{i.title}</strong> : <span>↳ {i.title}</span>} <span style={muted}>({i.kind})</span></Td>
                <Td>{i.package_title}</Td>
                <Td mono>{short(i.owner)} / {short(i.reviewer)} <span style={muted}>({i.reviewer_basis})</span></Td>
                <Td>{fmtInstant(i.due_at)}{i.overdue && <strong> — overdue</strong>}</Td>
                <Td><Mark m={stateMark(i.state)} />{i.open_exceptions > 0 && <span> · {i.open_exceptions} exception(s)</span>}</Td>
                <Td><Mark m={severityMark(i)} /></Td>
                <Td>{residualWords(i.residual)}</Td>
                <Td><button type="button" onClick={() => setOpen(i.commitment_id)} aria-label={`open commitment ${i.commitment_id}`}>Open</button></Td>
              </tr>
            ))}</tbody>
          </table>
        </>
      )}
      {open !== null && <Detail id={open} onChanged={() => void load()} />}
    </main>
  );
}
