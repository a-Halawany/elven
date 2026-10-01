'use client';
/**
 * The simulation center — CP-6 B31 part `orchestration` (0099 §O; F-P5-06: WS-13, JRN-14, CAP-DS-05).
 *
 * An EXPERIMENT is a declared, seeded, budgeted execution of a run contract in chunks of paths, run IN THE BACKGROUND by the domain's
 * attention agent after its tick. Its journey: declare (the question, the contract, the paths, the seed, the budget, the stop conditions)
 * → a named human OTHER THAN THE DECLARER approves exactly the budget shown (its digest) → an operator starts it (the admission —
 * determinism, capacity, feasibility — recorded either way) → chunks execute, each one checkpointed with the indicators the server
 * computed → pause and resume between chunks → it ends COMPLETED (the run with its manifest), PARTIAL (stopped by the budget, a failed
 * chunk, convergence or an operator: the run is diagnostic only and says what is missing) or FAILED. Compare the produced runs below.
 * Everything is read from the server and worded here; nothing is computed on the client. Every figure is SYNTHETIC.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useShell } from '../../layout';
import { twins as twinsApi, type Twin } from '../../../../lib/twins';
import { orchestration, stateMark, budgetUseLine, progressLine, stabilityLine, admissionLine, runLine, eventLine, type Experiment } from '../../../../lib/orchestration-b31';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant, textareaStyle } from '../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
// B31 walk-found: a uuidv7's first 8 characters are its timestamp, shared by runs opened together — the label carries the tail too.
const short = (id: string | null | undefined) => (id ? `${id.slice(0, 8)}…${id.slice(-6)}` : '—');
const money = (v: unknown): string => (typeof v === 'string' ? `€${Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2 })}` : '—');

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}
const txt = (id: string, value: string, onChange: (v: string) => void, type = 'text') => (
  <input id={id} type={type} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)} />
);

function StateMark({ state }: { state: string }) {
  const m = stateMark(state);
  return <span aria-label="experiment state" style={{ color: `var(${m.token})`, fontWeight: 650 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}

/** DECLARE an experiment: the run contract (a control, or an intervention on a completed control), the paths in chunks, the seed, the jitter, the budget. */
function DeclarePanel({ scope, onDeclared }: { scope: { tenantId: string; domainId: string }; onDeclared: (id: string) => Promise<void> }) {
  const [twins, setTwins] = useState<Twin[]>([]);
  const [twinId, setTwinId] = useState('');
  const [version, setVersion] = useState('');
  const [title, setTitle] = useState('');
  const [question, setQuestion] = useState('');
  const [component, setComponent] = useState('SYN-PART-MAG');
  const [runKind, setRunKind] = useState<'control' | 'intervention'>('control');
  const [controlRunId, setControlRunId] = useState('');
  const [interventions, setInterventions] = useState('[{"type":"reroute","shipment":"SYN-SHIP-4472"}]');
  const [shock, setShock] = useState(true);
  const [scenarioId, setScenarioId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [horizon, setHorizon] = useState('90');
  const [paths, setPaths] = useState('5000');
  const [chunk, setChunk] = useState('500');
  const [seed, setSeed] = useState('31');
  const [jitter, setJitter] = useState('{"0":0.5,"3":0.3,"7":0.2}');
  const [maxPaths, setMaxPaths] = useState('5000');
  const [maxWall, setMaxWall] = useState('600');
  const [maxChunks, setMaxChunks] = useState('12');
  const [perTick, setPerTick] = useState('1');
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  useEffect(() => { void twinsApi.list(scope).then((r) => { if (r.ok && r.data !== undefined) { setTwins(r.data.twins); if (r.data.twins[0] !== undefined) setTwinId(r.data.twins[0].twin_id); } }); }, [scope.tenantId, scope.domainId]);
  const twin = twins.find((t) => t.twin_id === twinId);
  const admitted = (twin?.versions ?? []).filter((v) => v.state === 'admitted');
  return (
    <section aria-labelledby="declare-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
      <h2 id="declare-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Declare an experiment</h2>
      <p style={{ ...small, ...muted }}>supply-flow@1 only (a seeded stream executes exactly in chunks). The budget is approved by someone else before the experiment can start.</p>
      <div style={grid}>
        <Field id="dx-title" label="Title">{(id) => txt(id, title, setTitle)}</Field>
        <Field id="dx-twin" label="Twin">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={twinId} onChange={(e) => { setTwinId(e.target.value); setVersion(''); }}>{twins.map((t) => <option key={t.twin_id} value={t.twin_id}>{t.title}</option>)}</select>}</Field>
        <Field id="dx-version" label="Admitted version">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={version} onChange={(e) => setVersion(e.target.value)}><option value="">choose</option>{admitted.map((v) => <option key={v.version} value={v.version}>v{v.version} · {v.branch_id}</option>)}</select>}</Field>
        <Field id="dx-component" label="Component">{(id) => txt(id, component, setComponent)}</Field>
        <Field id="dx-kind" label="Run kind">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={runKind} onChange={(e) => setRunKind(e.target.value as 'control' | 'intervention')}><option value="control">control (intervention: none)</option><option value="intervention">intervention (on a completed control)</option></select>}</Field>
        {runKind === 'intervention' ? <Field id="dx-control" label="Control run id">{(id) => txt(id, controlRunId, setControlRunId)}</Field> : null}
        <Field id="dx-scenario" label="Scenario id (optional)">{(id) => txt(id, scenarioId, setScenarioId)}</Field>
        <Field id="dx-branch" label="Scenario branch id (with the scenario)">{(id) => txt(id, branchId, setBranchId)}</Field>
        <Field id="dx-horizon" label="Horizon (days)">{(id) => txt(id, horizon, setHorizon, 'number')}</Field>
        <Field id="dx-paths" label="Paths">{(id) => txt(id, paths, setPaths, 'number')}</Field>
        <Field id="dx-chunk" label="Paths per chunk">{(id) => txt(id, chunk, setChunk, 'number')}</Field>
        <Field id="dx-seed" label="Seed">{(id) => txt(id, seed, setSeed, 'number')}</Field>
        <Field id="dx-max-paths" label="Budget: max paths">{(id) => txt(id, maxPaths, setMaxPaths, 'number')}</Field>
        <Field id="dx-max-wall" label="Budget: max wall seconds">{(id) => txt(id, maxWall, setMaxWall, 'number')}</Field>
        <Field id="dx-max-chunks" label="Budget: max chunk executions">{(id) => txt(id, maxChunks, setMaxChunks, 'number')}</Field>
        <Field id="dx-pace" label="Chunks per tick">{(id) => txt(id, perTick, setPerTick, 'number')}</Field>
      </div>
      <label style={{ display: 'block', marginBlockStart: 'var(--eye-space-8)' }}><input type="checkbox" checked={shock} onChange={(e) => setShock(e.target.checked)} /> shock (the bound branch is flipped, or a hypothetical)</label>
      {runKind === 'intervention' ? <Field id="dx-interventions" label="Interventions (JSON list)">{(id) => <textarea id={id} style={textareaStyle} value={interventions} onChange={(e) => setInterventions(e.target.value)} />}</Field> : null}
      <Field id="dx-jitter" label="Lead-time jitter distribution (JSON: days → probability)">{(id) => <textarea id={id} style={textareaStyle} value={jitter} onChange={(e) => setJitter(e.target.value)} />}</Field>
      <Field id="dx-question" label="The question it answers (8+ characters)">{(id) => <textarea id={id} style={textareaStyle} value={question} onChange={(e) => setQuestion(e.target.value)} />}</Field>
      <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
        <GovernedButton label="Declare the experiment" pendingLabel="declaring" disabled={title.trim().length < 4 || question.trim().length < 8 || version === ''} onRun={async () => {
          setProblem(null);
          let iv: unknown; let jt: unknown;
          try { iv = runKind === 'control' ? [{ type: 'none' }] : JSON.parse(interventions); jt = JSON.parse(jitter); } catch { const m = 'the interventions and the jitter are JSON'; setProblem(m); throw new Error(m); }
          const r = await orchestration.declare(scope, {
            title: title.trim(), question: question.trim(), paths: Number(paths), chunkSize: Number(chunk), seed: Number(seed), jitter: jt as Record<string, number>,
            budget: { max_paths: Number(maxPaths), max_wall_seconds: Number(maxWall), max_chunks: Number(maxChunks) }, pace: { chunks_per_tick: Number(perTick) },
            run: { twinId, twinVersion: Number(version), runKind, controlRunId: runKind === 'control' ? null : controlRunId.trim(), shock, component: component.trim(), interventions: iv, horizonDays: Number(horizon),
                   ...(scenarioId.trim() === '' ? {} : { scenarioId: scenarioId.trim(), scenarioBranchId: branchId.trim() }) },
          });
          if (!r.ok || r.data === undefined) { const m = refusal(r, 'the experiment was not declared'); setProblem(m); throw new Error(m); }
          setReceipt(r.data.receipt); setTitle(''); setQuestion('');
          await onDeclared(r.data.experiment.experiment_id);
        }} />
      </div>
      {problem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not declared — {problem}</span></LiveStatus>}
      <Receipt receipt={receipt} />
    </section>
  );
}

/** The produced runs of finished experiments compared on the existing comparator (the runs must share a control). */
function ComparePanel({ scope, experiments }: { scope: { tenantId: string; domainId: string }; experiments: Experiment[] }) {
  const done = experiments.filter((e) => e.run_id !== null && (e.state === 'completed' || e.state === 'partial'));
  const [picked, setPicked] = useState<string[]>([]);
  const [rows, setRows] = useState<Array<{ run_id: string; run_kind: string; totals: { line_stop_days: number; cost: { total: string } } }> | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  if (done.length === 0) return null;
  return (
    <section aria-labelledby="cmp-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
      <h2 id="cmp-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Compare produced runs</h2>
      <p style={{ ...small, ...muted }}>A partial run compares as a diagnostic: its totals are the deterministic trajectory; its paths are incomplete.</p>
      {done.map((e) => (
        <label key={e.experiment_id} style={{ display: 'block' }}>
          <input type="checkbox" checked={picked.includes(String(e.run_id))} onChange={(x) => setPicked(x.target.checked ? [...picked, String(e.run_id)] : picked.filter((p) => p !== e.run_id))} /> {e.title} — run {short(e.run_id)} ({e.state})
        </label>
      ))}
      <GovernedButton label="Compare" pendingLabel="comparing" variant="quiet" disabled={picked.length < 2} onRun={async () => {
        setProblem(null);
        const r = await twinsApi.compareRuns(scope, picked);
        if (!r.ok || r.data === undefined) { const m = refusal(r, 'the comparison was refused'); setProblem(m); throw new Error(m); }
        setRows(r.data.comparison.runs);
      }} />
      {problem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not compared — {problem}</span></LiveStatus>}
      {rows === null ? null : (
        <table style={tableStyle}><thead><tr><Th>Run</Th><Th>Kind</Th><Th>Line-stop days</Th><Th>Total cost</Th></tr></thead>
          <tbody>{rows.map((r) => <tr key={r.run_id}><Td><Mono>{short(r.run_id)}</Mono></Td><Td>{r.run_kind}</Td><Td>{r.totals.line_stop_days}</Td><Td>{money(r.totals.cost.total)}</Td></tr>)}</tbody></table>
      )}
    </section>
  );
}

export default function SimulationCenterPage() {
  const { scope, me } = useShell();
  const roles = useMemo(() => new Set(me.bindings.filter((b) => b.domainId === scope.domainId || b.scope !== 'DOMAIN').map((b) => b.roleCode)), [me, scope.domainId]);
  const canOperate = ['twin_owner', 'simulation_operator', 'platform_admin'].some((r) => roles.has(r));
  const canApprove = ['domain_admin', 'strategy_owner', 'twin_owner', 'platform_admin'].some((r) => roles.has(r));
  const [list, setList] = useState<Experiment[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<Experiment | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');

  const loadList = async (pick?: string) => {
    const r = await orchestration.list(scope);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the experiments could not be read')); return; }
    setList(r.data.experiments);
    const id = pick ?? selected ?? r.data.experiments[0]?.experiment_id ?? null;
    setSelected(id);
    if (id !== null) await open(id);
  };
  const open = async (id: string) => {
    const r = await orchestration.read(scope, id);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the experiment could not be read')); return; }
    setView(r.data.experiment); setProblem(null);
  };
  useEffect(() => { void loadList(); }, [scope.tenantId, scope.domainId]);
  // While an experiment runs in the background, its record is re-read every ten seconds (the worker advances it after each tick).
  useEffect(() => {
    if (view === null || (view.state !== 'running' && view.state !== 'paused')) return;
    const t = setInterval(() => { void open(view.experiment_id); }, 10_000);
    return () => clearInterval(t);
  }, [view?.experiment_id, view?.state]);

  const act = async (what: string, run: () => Promise<{ ok: boolean; status: number; data?: { experiment: Experiment; receipt: ReceiptT }; error?: { code: string; message: string } }>) => {
    setProblem(null);
    const r = await run();
    if (!r.ok || r.data === undefined) { const m = refusal(r, `${what} was not answered`); setProblem(m); throw new Error(m); }
    setReceipt(r.data.receipt); setLast(`${what}: ${stateMark(r.data.experiment.state).text}`); setNote(''); setReason('');
    await loadList(r.data.experiment.experiment_id);
  };

  const v = view;
  const stab = v?.indicators?.numerical_stability ?? {};
  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Simulation center</h1>
      <UnknownNote><strong>Every number on this screen is SYNTHETIC</strong> — paths of a declared model on a declared state, executed in the background in seeded chunks and reproducible from the run’s stored contract and the manifest. A partial run is diagnostic only.</UnknownNote>
      <p style={small}><a href="/twins/simulations">← Simulations (single runs, challenges, promotion)</a></p>
      <section aria-labelledby="list-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="list-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Experiments</h2>
        {list.length === 0 ? <Empty>No experiment has been declared in this domain.</Empty> : (
          <ScrollBox label="experiments">
            <table aria-label="experiments" style={tableStyle}><thead><tr><Th>Experiment</Th><Th>State</Th><Th>Paths</Th><Th>Run</Th><Th>Declared</Th></tr></thead>
              <tbody>{list.map((e) => (
                <tr key={e.experiment_id} aria-selected={e.experiment_id === selected}>
                  <Td><button type="button" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-strong)', cursor: 'pointer', textAlign: 'start' }} onClick={() => { setSelected(e.experiment_id); void open(e.experiment_id); }}>{e.title}</button></Td>
                  <Td><StateMark state={e.state} /></Td>
                  <Td>{e.progress.paths_done}/{e.paths}</Td>
                  <Td>{e.run === null || e.run === undefined ? '—' : `${short(e.run.run_id)} ${e.run.state}`}</Td>
                  <Td>{fmtInstant(e.declared_at)}</Td>
                </tr>))}</tbody></table>
          </ScrollBox>
        )}
      </section>

      {v === null ? null : (
        <section aria-labelledby="exp-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="exp-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{v.title}</h2>
          <div><StateMark state={v.state} /></div>
          <p>{v.question}</p>
          <DefinitionRow term="Contract">{v.method_ref} on twin <Mono>{short(v.twin_id)}</Mono> v{v.twin_version}{v.scenario_id ? <> · scenario <Mono>{short(v.scenario_id)}</Mono> branch <Mono>{short(v.scenario_branch_id)}</Mono></> : ' · no scenario (a shock is hypothetical)'} · seed {v.seed} · {v.paths} paths in chunks of {v.chunk_size}</DefinitionRow>
          <DefinitionRow term="Budget"><span aria-label="budget use">{budgetUseLine(v.budget_use)}</span> · digest <Mono>{v.budget_digest.slice(0, 12)}…</Mono>{v.approved_by ? <span aria-label="approval"> · approved by <Mono>{short(v.approved_by)}</Mono> {fmtInstant(v.approved_at)} — {v.approval_note}</span> : <span aria-label="approval"> · NOT APPROVED</span>}</DefinitionRow>
          <DefinitionRow term="Stop conditions">{v.stop_conditions.paths} paths{v.stop_conditions.converged ? ` · or converged: ${v.stop_conditions.converged.measure} half-width ≤ ${v.stop_conditions.converged.ci_half_width} after ${v.stop_conditions.converged.min_paths} paths (stops PARTIAL)` : ''} · the budget</DefinitionRow>
          <DefinitionRow term="Admission"><span aria-label="admission">{admissionLine(v.admission)}</span></DefinitionRow>
          <DefinitionRow term="Executor">{v.executor?.active ? `${v.executor.kind} — active` : 'NO ACTIVE ATTENTION AGENT in this domain: nothing executes until one is registered'}</DefinitionRow>
          <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
            <label htmlFor="exp-progress" style={{ display: 'block' }}>Progress — {progressLine(v)}</label>
            <progress id="exp-progress" max={v.paths} value={v.progress.paths_done} style={{ inlineSize: '100%' }} />
          </div>
          <DefinitionRow term="Produced run"><span aria-label="produced run">{runLine(v.run)}</span></DefinitionRow>
          {v.stop_pending ? <DefinitionRow term="Stopping">{v.stop_pending.outcome} ({v.stop_pending.reason}) — written by the worker after its next tick</DefinitionRow> : null}

          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Indicators (the latest checkpoint)</h3>
          {Object.keys(stab).length === 0 ? <Empty>No checkpoint yet.</Empty> : (
            <ul aria-label="indicators" style={small}>
              {Object.values(stab).map((s) => <li key={s.measure}>{stabilityLine(s)}</li>)}
              <li>constraint satisfaction: {v.indicators.constraint_satisfaction?.outcome ?? '—'}{v.indicators.constraint_satisfaction?.note ? ` — ${v.indicators.constraint_satisfaction.note}` : ''}</li>
              <li>latency: last chunk {v.indicators.latency?.chunk_wall_ms ?? '—'} ms ({v.indicators.latency?.ms_per_path ?? '—'} ms/path)</li>
              <li>failure containment: {v.indicators.failure_containment?.chunk_failures ?? 0} chunk failure(s) — {v.indicators.failure_containment?.executor ?? ''}</li>
            </ul>
          )}

          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Checkpoints</h3>
          {(v.checkpoints ?? []).length === 0 ? <Empty>No checkpoint yet.</Empty> : (
            <ScrollBox label="checkpoints">
              <table aria-label="checkpoints" style={tableStyle}><thead><tr><Th>#</Th><Th>Chunk</Th><Th>Paths done</Th><Th>Digest (chained)</Th><Th>At</Th></tr></thead>
                <tbody>{(v.checkpoints ?? []).map((k) => <tr key={k.seq}><Td>{k.seq}</Td><Td>{k.chunk_index}</Td><Td>{k.paths_done}</Td><Td><Mono>{k.digest.slice(0, 12)}…</Mono></Td><Td>{fmtInstant(k.created_at)}</Td></tr>)}</tbody></table>
            </ScrollBox>
          )}
          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Chunks</h3>
          {(v.chunks ?? []).length === 0 ? <Empty>No chunk is queued (the experiment has not started).</Empty> : (
            <ScrollBox label="chunks">
              <table aria-label="chunks" style={tableStyle}><thead><tr><Th>Chunk</Th><Th>Paths (seed offset)</Th><Th>State</Th><Th>Attempts</Th><Th>Wall ms</Th><Th>Digest / error</Th></tr></thead>
                <tbody>{(v.chunks ?? []).map((c) => <tr key={c.chunk_index}><Td>{c.chunk_index}</Td><Td>{c.first_path}–{c.first_path + c.paths - 1}</Td><Td>{c.state}</Td><Td>{c.attempts}</Td><Td>{c.wall_ms ?? '—'}</Td><Td>{c.digest ? <Mono>{c.digest.slice(0, 12)}…</Mono> : (c.error ?? '—')}</Td></tr>)}</tbody></table>
            </ScrollBox>
          )}
          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Ledger</h3>
          <ul aria-label="ledger" style={small}>{(v.events ?? []).map((e) => <li key={e.event_id}>{fmtInstant(e.occurred_at)} — {eventLine(e)} · <Mono>{short(e.actor)}</Mono></li>)}</ul>
          {v.manifest === null ? null : (
            <details aria-label="manifest"><summary>Manifest (versions, seed, every chunk's seed offset and digest, the checkpoint head, the approved budget)</summary>
              <pre style={{ ...small, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{JSON.stringify(v.manifest, null, 2)}</pre></details>
          )}

          {/* THE ACTS the record admits now — the server decides each one */}
          {v.state === 'declared' && canApprove ? (
            <div style={{ marginBlockStart: 'var(--eye-space-12)' }}>
              <Field id="ap-note" label="Approval note (8+ characters) — you approve the budget shown above, by its digest">{(id) => txt(id, note, setNote)}</Field>
              <GovernedButton label="Approve the budget" pendingLabel="approving" disabled={note.trim().length < 8} onRun={() => act('the approval', () => orchestration.approve(scope, v.experiment_id, v.budget_digest, note.trim()) as never)} />
            </div>
          ) : null}
          {v.state === 'approved' && canOperate ? (
            <div style={{ marginBlockStart: 'var(--eye-space-12)' }}><GovernedButton label="Start (admission, then the run opens)" pendingLabel="starting" onRun={() => act('the start', () => orchestration.start(scope, v.experiment_id) as never)} /></div>
          ) : null}
          {['declared', 'approved', 'running', 'paused'].includes(v.state) && canOperate ? (
            <div style={{ ...grid, marginBlockStart: 'var(--eye-space-12)', alignItems: 'end' }}>
              <Field id="op-reason" label="Reason (a pause 4+, a cancellation 8+ characters)">{(id) => txt(id, reason, setReason)}</Field>
              {v.state === 'running' ? <GovernedButton label="Pause" pendingLabel="pausing" variant="quiet" disabled={reason.trim().length < 4} onRun={() => act('the pause', () => orchestration.pause(scope, v.experiment_id, reason.trim()) as never)} /> : null}
              {v.state === 'paused' ? <GovernedButton label="Resume" pendingLabel="resuming" onRun={() => act('the resumption', () => orchestration.resume(scope, v.experiment_id, reason.trim()) as never)} /> : null}
              <GovernedButton label="Cancel the experiment" pendingLabel="cancelling" variant="critical" disabled={reason.trim().length < 8} onRun={() => act('the cancellation', () => orchestration.cancel(scope, v.experiment_id, reason.trim()) as never)} />
            </div>
          ) : null}
        </section>
      )}
      <ComparePanel scope={scope} experiments={list} />
      {canOperate ? <DeclarePanel scope={scope} onDeclared={async (id) => { await loadList(id); }} /> : null}
      {problem !== null ? <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>{problem}</span></LiveStatus> : null}
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
      <Receipt receipt={receipt} />
    </>
  );
}
