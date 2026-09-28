'use client';
/**
 * Workflow — the DURABLE WORKFLOW ENGINE (CP-6 B34, migration 0090 §W1/§W2/§W6; F-P6-14; IA-41-001/-005, MS-12, SC-09, FM-23, CAP-EO-10).
 *
 * The definitions (every version, its digest, how many instances it pins), the instances (state, status, the PINNED version beside the
 * newest one — a definition change never re-points a running instance —, the lease), one instance's committed TRANSITIONS, its timers
 * (pending, fired once with the drift, cancelled), the REPLAY's verdict (the state refolded from the log under the pinned definition —
 * consistent or not, never assumed), its compensations and its drills; the domain's timers; the drills (restart_replay, duplicate_task,
 * duplicate_timer, definition_change) run and recorded with their verdict. Publishing a definition and running a drill are named humans'
 * acts; the server refuses what it must and the page shows it.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { workflow as api, DRILL_KINDS, parseSpec, timerWords, type Drill, type Transition, type WorkflowDefinition, type WorkflowInstance, type WorkflowTimer } from '../../../lib/workflow';
import { Empty, LiveStatus, Mono, cardStyle, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
type Row = Record<string, unknown>;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-2)' } as const;

export default function WorkflowPage() {
  const { scope } = useShell();
  const [defs, setDefs] = useState<WorkflowDefinition[]>([]);
  const [instances, setInstances] = useState<WorkflowInstance[]>([]);
  const [timers, setTimers] = useState<WorkflowTimer[]>([]);
  const [drills, setDrills] = useState<Drill[]>([]);
  const [now, setNow] = useState(new Date().toISOString());
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<{ instance: WorkflowInstance; transitions: Transition[]; timers: WorkflowTimer[]; drills: Drill[]; replay: Row | null; compensations: Row[] } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [defKey, setDefKey] = useState(''); const [specText, setSpecText] = useState(''); const [owner, setOwner] = useState(''); const [escalation, setEscalation] = useState(''); const [reason, setReason] = useState('');
  const [drillKind, setDrillKind] = useState<string>('restart_replay');

  const load = async () => {
    const [d, i, t, x] = await Promise.all([api.definitions(scope), api.instances(scope), api.timers(scope), api.drills(scope)]);
    if (!d.ok || !i.ok || !t.ok || !x.ok) { setProblem(refusal(!d.ok ? d : !i.ok ? i : !t.ok ? t : x, 'the workflow could not be read')); return; }
    setProblem(null); setDefs(d.data?.definitions ?? []); setInstances(i.data?.instances ?? []); setTimers(t.data?.timers ?? []); setDrills(x.data?.drills ?? []); setNow(t.data?.now ?? now);
  };
  const open = async (id: string) => {
    setSelected(id);
    const r = await api.instance(scope, id);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the instance could not be read')); return; }
    setDetail(r.data);
  };
  useEffect(() => { void load(); }, [scope.tenantId, scope.domainId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)' }}>Workflow</h1>
      <p style={muted}>The engine keeps orchestration state only: a business effect happens through its owning action. An instance runs to its end on the definition it started with.</p>
      {problem !== null && <p role="alert" style={{ color: 'var(--eye-color-critical)' }}>{problem}</p>}
      {status !== null && <LiveStatus>{status}</LiveStatus>}
      <Receipt receipt={receipt} />

      <h2 style={h2}>Instances</h2>
      {instances.length === 0 ? <Empty>No instance in this domain.</Empty> : (
        <table style={tableStyle}><thead><tr><Th>Instance</Th><Th>Definition (pinned)</Th><Th>State</Th><Th>Status</Th><Th>Seq</Th><Th>Lease</Th><Th> </Th></tr></thead>
          <tbody>{instances.map((i) => (
            <tr key={i.instance_id}>
              <Td mono>{i.instance_id.slice(0, 8)}…</Td>
              <Td>{i.def_key} v{i.def_version}{i.pinned_behind_newest && <span style={muted}> (newest v{i.newest?.version} — not applied: pinned)</span>}</Td>
              <Td>{i.state}</Td><Td>{i.status}</Td><Td>{i.last_seq}</Td>
              <Td>{i.lease.owner === null ? 'free' : `${i.lease.owner} ${i.lease.live ? 'until ' + fmtInstant(i.lease.until) : '(expired — the next worker resumes)'}`}</Td>
              <Td><button type="button" onClick={() => void open(i.instance_id)} aria-pressed={selected === i.instance_id}>Open</button></Td>
            </tr>))}</tbody></table>
      )}

      {detail !== null && (
        <section aria-label="The selected instance" style={{ ...cardStyle, marginBlock: 'var(--eye-space-16)' }}>
          <h3>{detail.instance.def_key} v{detail.instance.def_version} · <Mono title={detail.instance.def_digest}>{detail.instance.def_digest.slice(0, 12)}…</Mono></h3>
          <p>Replay: {detail.replay === null ? 'not available' : (detail.replay['consistent'] === true ? '✓ consistent — the committed transitions refold to the stored state' : '✕ NOT consistent — see the notes')}
            {detail.replay !== null && <span style={muted}> (replayed {String(detail.replay['replayed_state'])} @ {String(detail.replay['replayed_seq'])}; stored {String(detail.replay['stored_state'])} @ {String(detail.replay['stored_seq'])})</span>}</p>
          <table style={tableStyle}><thead><tr><Th>Seq</Th><Th>Kind</Th><Th>Event</Th><Th>From → to</Th><Th>Idempotency key</Th><Th>At</Th></tr></thead>
            <tbody>{detail.transitions.map((t) => <tr key={t.seq}><Td>{t.seq}</Td><Td>{t.kind}</Td><Td>{t.event}</Td><Td>{t.from ?? '—'} → {t.to}</Td><Td mono>{t.idempotency_key}</Td><Td>{fmtInstant(t.at)}</Td></tr>)}</tbody></table>
          <h4>Timers</h4>
          {detail.timers.length === 0 ? <Empty>No timer.</Empty> : <ul>{detail.timers.map((t) => <li key={t.timer_id}><Mono>{t.kind}</Mono> — {timerWords(t, now)}</li>)}</ul>}
          {detail.compensations.length > 0 && <><h4>Compensations</h4><ul>{detail.compensations.map((c) => <li key={String(c['for_seq'])}>seq {String(c['for_seq'])} ({String(c['for_event'])}): {String(c['outcome'])}{c['action'] !== null ? ` — ${String(c['action'])}` : ' — no declared compensation: escalated'}</li>)}</ul></>}
        </section>
      )}

      <h2 style={h2}>Drills</h2>
      <div style={{ display: 'flex', gap: 'var(--eye-space-8)', alignItems: 'end', flexWrap: 'wrap' }}>
        <label htmlFor="drill-kind">Drill</label>
        <select id="drill-kind" style={inputStyle} value={drillKind} onChange={(e) => setDrillKind(e.target.value)}>{DRILL_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
        <GovernedButton label={selected === null && drillKind !== 'duplicate_task' ? 'Run (open an instance first)' : 'Run the drill'} pendingLabel="running" variant="quiet"
          disabled={selected === null && drillKind !== 'duplicate_task'} onRun={async () => {
            const r = await api.drill(scope, drillKind, drillKind === 'duplicate_task' ? null : selected);
            if (!r.ok) { setProblem(refusal(r, 'the drill was refused')); return; }
            setStatus(`drill ${drillKind}: ${String(r.data?.drill.verdict).toUpperCase()}`); setReceipt(r.data?.receipt ?? null); void load(); if (selected !== null) void open(selected);
          }} />
      </div>
      {drills.length === 0 ? <Empty>No drill has run.</Empty> : <ul>{drills.map((d) => <li key={d.drill_id}>{fmtInstant(d.run_at)} · {d.kind} · <strong>{d.verdict.toUpperCase()}</strong>{d.instance_id !== null && <> · <Mono>{d.instance_id.slice(0, 8)}…</Mono></>}</li>)}</ul>}

      <h2 style={h2}>Timers</h2>
      {timers.length === 0 ? <Empty>No timer.</Empty> : (
        <table style={tableStyle}><thead><tr><Th>Kind</Th><Th>Owner</Th><Th>Due</Th><Th>State</Th><Th>Failures</Th></tr></thead>
          <tbody>{timers.slice(0, 50).map((t) => <tr key={t.timer_id}><Td mono>{t.kind}</Td><Td>{t.owner_kind} {t.owner_id.slice(0, 8)}…</Td><Td>{fmtInstant(t.due_at)}</Td><Td>{timerWords(t, now)}</Td><Td>{(t.failures ?? []).length}</Td></tr>)}</tbody></table>
      )}

      <h2 style={h2}>Definitions</h2>
      {defs.length === 0 ? <Empty>No definition.</Empty> : <ul>{defs.map((d) => <li key={d.definition_id}><strong>{d.def_key}</strong> v{d.version} · <Mono title={d.digest}>{d.digest.slice(0, 12)}…</Mono> · pins {d.running_pinned} running of {d.instances_pinned} · {d.reason}</li>)}</ul>}
      <fieldset style={{ border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)' }}>
        <legend>Publish a definition version</legend>
        <label htmlFor="wf-key">Key</label><input id="wf-key" style={inputStyle} value={defKey} onChange={(e) => setDefKey(e.target.value)} />
        <label htmlFor="wf-spec">Spec (JSON: states, initial, terminal, transitions, timeouts?, compensations?)</label>
        <textarea id="wf-spec" style={textareaStyle} rows={8} value={specText} onChange={(e) => setSpecText(e.target.value)} />
        <label htmlFor="wf-owner">Owner (a member)</label><input id="wf-owner" style={inputStyle} value={owner} onChange={(e) => setOwner(e.target.value)} />
        <label htmlFor="wf-esc">Escalation principal (a member — irreconcilable instances go to them)</label><input id="wf-esc" style={inputStyle} value={escalation} onChange={(e) => setEscalation(e.target.value)} />
        <label htmlFor="wf-reason">Reason</label><input id="wf-reason" style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} />
        <GovernedButton label="Publish" pendingLabel="publishing" onRun={async () => {
          const s = parseSpec(specText);
          if (!s.ok) { setProblem(s.error); return; }
          const r = await api.publish(scope, defKey, s.spec, owner.trim(), escalation.trim(), reason);
          if (!r.ok) { setProblem(refusal(r, 'the definition was refused')); return; }
          setStatus(`published ${defKey} v${String(r.data?.definition['version'])} — running instances keep their pin`); setReceipt(r.data?.receipt ?? null); void load();
        }} />
      </fieldset>
    </div>
  );
}
