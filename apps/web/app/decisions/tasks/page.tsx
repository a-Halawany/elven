'use client';
/**
 * Tasks — the HUMAN TASK INBOX (CP-6 B34, migration 0090 §W3; F-P6-14; RU-06 "escalate and preserve deadline", MS-05 "named authority,
 * deadline, and escalation", PR-46-001/-003).
 *
 * The tasks the signed-in person holds — assigned to them, or unassigned with a candidate role they hold here — soonest deadline first (a
 * task without a deadline last; no score orders them). Each shows its deadline against the server's clock and its ESCALATION CHAIN (the
 * assignment ledger: opened, escalated by the timer, reassigned, access lost). REASSIGN moves the work to another member (a gate task's
 * stored eligibility is re-checked by the server: reassignment moves work, never authority). COMPLETE is offered only where a task
 * completes here: a gate or commitment task completes through its OWNING action (the approval, the checkpoint …) — the server refuses it
 * too. Every refusal is shown as the server states it.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { tasks as api, chainWords, completableHere, deadlineWords, taskMark, type HumanTask } from '../../../lib/workflow';
import { Empty, LiveStatus, Mono, cardStyle, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;

function Mark({ m }: { m: { glyph: string; token: string; text: string } }) {
  return <span style={{ color: `var(${m.token})`, border: `1px solid var(${m.token})`, borderRadius: 'var(--eye-radius-sm)', paddingInline: 'var(--eye-space-4)', fontSize: 'var(--eye-type-label-sm)', fontWeight: 650, whiteSpace: 'nowrap' }}>
    <span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}

function TaskCard({ t, now, onDone }: { t: HumanTask; now: string; onDone: (msg: string, receipt: ReceiptT) => void }) {
  const { scope } = useShell();
  const [to, setTo] = useState(''); const [reason, setReason] = useState('');
  const [outcome, setOutcome] = useState('done'); const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const overdue = t.deadline_at !== null && t.deadline_at < now && (t.state === 'open' || t.state === 'escalated');
  const live = t.state === 'open' || t.state === 'escalated';
  return (
    <section aria-labelledby={`task-${t.task_id}`} style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-16)' }}>
      <h2 id={`task-${t.task_id}`} style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>{t.title}</h2>
      <p><Mark m={taskMark(t.state, t.escalation_level)} /> · <Mono>{t.kind}</Mono> · subject <Mono title={String(t.subject['id'] ?? '')}>{String(t.subject['kind'] ?? '')} {String(t.subject['id'] ?? '').slice(0, 8)}…</Mono></p>
      <p style={overdue ? { color: 'var(--eye-color-critical)', fontWeight: 650 } : undefined}>Deadline: {t.deadline_at === null ? 'none' : fmtInstant(t.deadline_at)} — {deadlineWords(t.deadline_at, now)}</p>
      <p>Escalation chain: {chainWords(t.escalation_chain)}</p>
      {typeof t.escalation['principal'] === 'string' && <p style={muted}>Escalates to <Mono>{String(t.escalation['principal']).slice(0, 8)}…</Mono> (at most {String(t.escalation['max_escalations'] ?? 0)} time(s), {String(t.escalation['extend_minutes'] ?? 1440)} min each)</p>}
      {problem !== null && <p role="alert" style={{ color: 'var(--eye-color-critical)' }}>{problem}</p>}
      {live && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))', gap: 'var(--eye-space-12)' }}>
          <fieldset style={{ border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)' }}>
            <legend>Reassign (moves the work, never the authority)</legend>
            <label htmlFor={`to-${t.task_id}`}>To (a member's principal id)</label>
            <input id={`to-${t.task_id}`} style={inputStyle} value={to} onChange={(e) => setTo(e.target.value)} />
            <label htmlFor={`why-${t.task_id}`}>Reason</label>
            <input id={`why-${t.task_id}`} style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} />
            <GovernedButton label="Reassign" pendingLabel="reassigning" variant="quiet" onRun={async () => {
              const r = await api.reassign(scope, t.task_id, to, reason);
              if (!r.ok) { setProblem(refusal(r, 'the reassignment was refused')); return; }
              setProblem(null); onDone(`reassigned to ${to.slice(0, 8)}…`, r.data?.receipt ?? null);
            }} />
          </fieldset>
          {completableHere(t.kind) ? (
            <fieldset style={{ border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)' }}>
              <legend>Complete</legend>
              <label htmlFor={`out-${t.task_id}`}>Outcome</label>
              <input id={`out-${t.task_id}`} style={inputStyle} value={outcome} onChange={(e) => setOutcome(e.target.value)} />
              <label htmlFor={`note-${t.task_id}`}>Evidence (what was done)</label>
              <input id={`note-${t.task_id}`} style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />
              <GovernedButton label="Complete" pendingLabel="completing" onRun={async () => {
                const r = await api.complete(scope, t.task_id, outcome, note);
                if (!r.ok) { setProblem(refusal(r, 'the completion was refused')); return; }
                setProblem(null); onDone('completed', r.data?.receipt ?? null);
              }} />
            </fieldset>
          ) : <p style={muted}>A {t.kind} task completes through its owning action (the approval, the review, the checkpoint) — not here.</p>}
        </div>
      )}
    </section>
  );
}

export default function TasksPage() {
  const { scope } = useShell();
  const [rows, setRows] = useState<HumanTask[] | null>(null);
  const [now, setNow] = useState(new Date().toISOString());
  const [all, setAll] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const load = async () => {
    const r = await api.inbox(scope, all);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the inbox could not be read')); return; }
    setProblem(null); setRows(r.data.tasks); setNow(r.data.now);
  };
  useEffect(() => { void load(); }, [scope.tenantId, scope.domainId, all]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)' }}>Tasks</h1>
      <p style={muted}>The tasks you hold — soonest deadline first. A deadline that passes escalates the task to its named escalation principal (the attention timer fires it once).</p>
      <label><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> include closed tasks</label>
      {problem !== null && <p role="alert" style={{ color: 'var(--eye-color-critical)' }}>{problem}</p>}
      {status !== null && <LiveStatus>{status}</LiveStatus>}
      <Receipt receipt={receipt} />
      {rows === null ? <p>Loading…</p> : rows.length === 0 ? <Empty>No task is yours.</Empty>
        : rows.map((t) => <TaskCard key={t.task_id} t={t} now={now} onDone={(m, rc) => { setStatus(m); setReceipt(rc); void load(); }} />)}
    </div>
  );
}
