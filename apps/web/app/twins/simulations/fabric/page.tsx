'use client';
/**
 * The method-fabric experiments — CP-6 B30 part `experiments` (0103 §EX; F-P5-06: L8-C06, PR-35-001, V03-T-354, ES-38-007/-009, V04-T-034;
 * F-P5-07: V02-T-167, AI-50-004).
 *
 * What the simulation center (B31) runs, governed further: the method fabric's SEEDED methods (discrete-event, counterfactual, war-gaming)
 * now execute in chunks — each path one execution of the adapter with its own per-path seed, out of process; an experiment declares what
 * an UNSTABLE, violated or indeterminate checkpoint does to it (stop, pause or none) and the server ACTS on it — the experiment stopped or
 * paused, a diverging adapter QUARANTINED, a review routed to the declarer and the method stewards; a finished run or experiment is
 * RETIRED by a named human with its reason and its reach (the packages citing it, the analyses resting on it, the runs comparing against
 * it). Per run: the NONLINEAR RESPONSE across the behaviour model's operating envelope (response curves, thresholds, hidden dependencies)
 * and the VALIDATION against an observed or benchmark sample (model discrepancy, rare-event tail, convergence). Everything is read from the
 * server and worded here; nothing is computed on the client. Every figure is SYNTHETIC.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useShell } from '../../layout';
import {
  fabricExperiments, policyText, healthLine, actionLine, reachLine, retirementLine, sweepFactorLine, interactionLine, validationLine, tailLine, convergenceLine, parseValues, short,
  type Overview, type RunRetirement, type UnstablePolicy,
} from '../../../../lib/experiments-b30';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant, textareaStyle } from '../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
type Answer = { ok: boolean; status: number; data?: { receipt: ReceiptT }; error?: { code: string; message: string } };
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)', alignItems: 'end' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 } as const;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}
const txt = (id: string, value: string, onChange: (v: string) => void, type = 'text') => (
  <input id={id} type={type} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)} />
);
const pick = (id: string, value: string, onChange: (v: string) => void, options: Array<[string, string]>) => (
  <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
);

export default function FabricExperimentsPage() {
  const { scope, me } = useShell();
  const roles = useMemo(() => new Set(me.bindings.filter((b) => b.domainId === scope.domainId || b.scope !== 'DOMAIN').map((b) => b.roleCode)), [me, scope.domainId]);
  const canOperate = ['twin_owner', 'simulation_operator', 'domain_admin', 'platform_admin'].some((r) => roles.has(r));
  const isSteward = ['method_steward', 'platform_admin'].some((r) => roles.has(r));
  const canAnalyse = canOperate || isSteward || ['strategy_owner', 'decision_owner', 'decision_authority', 'domain_analyst'].some((r) => roles.has(r));
  const [o, setO] = useState<Overview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  // the forms
  const [qModel, setQModel] = useState('discrete-event@1'); const [qReason, setQReason] = useState(''); const [qRun, setQRun] = useState('');
  const [pPolicy, setPPolicy] = useState<UnstablePolicy>('stop'); const [pReason, setPReason] = useState(''); const [xReason, setXReason] = useState('');
  const [runId, setRunId] = useState(''); const [run, setRun] = useState<RunRetirement | null>(null);
  const [rReason, setRReason] = useState(''); const [rBy, setRBy] = useState('');
  const [sMetric, setSMetric] = useState('line_stop_days'); const [sPoints, setSPoints] = useState('9');
  const [bMeasure, setBMeasure] = useState('total_cost'); const [bKind, setBKind] = useState<'benchmark' | 'observed'>('benchmark'); const [bValues, setBValues] = useState('');
  const [bBasis, setBBasis] = useState(''); const [bThreshold, setBThreshold] = useState(''); const [bTolerance, setBTolerance] = useState('0.1'); const [bCitations, setBCitations] = useState('[]');

  const load = async () => {
    const r = await fabricExperiments.list(scope);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the method-fabric experiments could not be read')); return; }
    setO(r.data); setProblem(null);
  };
  const openRun = async (id: string) => {
    const r = await fabricExperiments.readRun(scope, id);
    if (!r.ok || r.data === undefined) { setRun(null); setProblem(refusal(r, 'the run could not be read')); return; }
    setRun(r.data.run); setProblem(null);
  };
  useEffect(() => { void load(); }, [scope.tenantId, scope.domainId]);
  const act = async (what: string, call: () => Promise<Answer>, after?: () => Promise<void>) => {
    setProblem(null);
    const r = await call();
    if (!r.ok || r.data === undefined) { const m = refusal(r, `${what} was not answered`); setProblem(m); throw new Error(m); }
    setReceipt(r.data.receipt); setLast(`${what}: recorded`);
    await load(); if (after) await after();
  };

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Method-fabric experiments</h1>
      <UnknownNote><strong>Every number on this screen is SYNTHETIC</strong> — seeded paths of declared methods on declared state. A stopped or partial run is diagnostic only; a retired run is no longer analysed nor compared against.</UnknownNote>
      <p style={small}><a href="/twins/simulations/orchestration">← Simulation center (declare, approve, start, pause, resume)</a></p>

      <section aria-labelledby="methods-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="methods-h" style={h2}>Chunkable methods</h2>
        <p style={{ ...small, ...muted }}>Each path of a fabric experiment is one execution of the adapter with its own seed (seed ^ imul(path + 1, 0x9e3779b1)) — a chunk is the same paths in any process.</p>
        {o === null || o.methods.length === 0 ? <Empty>No chunkable method is registered.</Empty> : (
          <table aria-label="chunkable methods" style={tableStyle}><thead><tr><Th>Method</Th><Th>Family</Th><Th>Adapter</Th></tr></thead>
            <tbody>{o.methods.map((m) => <tr key={m.method_ref}><Td><Mono>{m.method_ref}</Mono></Td><Td>{m.family}</Td><Td>{healthLine(m.health, m.containment)}</Td></tr>)}</tbody></table>
        )}
        {isSteward ? (
          <div style={{ ...grid, marginBlockStart: 'var(--eye-space-12)' }}>
            <Field id="q-model" label="Adapter to quarantine">{(id) => pick(id, qModel, setQModel, (o?.methods ?? []).filter((m) => m.containment['isolated'] === true).map((m) => [m.method_ref, m.method_ref]))}</Field>
            <Field id="q-run" label="The run that showed it (optional)">{(id) => txt(id, qRun, setQRun)}</Field>
            <Field id="q-reason" label="Reason (8+ characters)">{(id) => txt(id, qReason, setQReason)}</Field>
            <GovernedButton label="Quarantine the adapter" pendingLabel="quarantining" variant="critical" disabled={qReason.trim().length < 8}
              onRun={() => act('the quarantine', () => fabricExperiments.quarantine(scope, qModel, qReason.trim(), qRun.trim() === '' ? null : qRun.trim()) as never)} />
          </div>
        ) : null}
      </section>

      <section aria-labelledby="exp-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="exp-h" style={h2}>Experiments — the checkpoint policy and what the server did</h2>
        {o === null || o.experiments.length === 0 ? <Empty>No experiment has been declared in this domain.</Empty> : (
          <ul aria-label="experiments" style={{ listStyle: 'none', paddingInlineStart: 0 }}>
            {o.experiments.map((e) => (
              <li key={e.experiment_id} style={{ marginBlockEnd: 'var(--eye-space-12)' }}>
                <strong>{e.title}</strong> · <Mono>{e.method_ref}</Mono> · {e.state.toUpperCase()} · {e.progress.paths_done}/{e.paths} paths{e.run_id ? <> · run <Mono>{short(e.run_id)}</Mono></> : null}
                <div style={small}>On an unstable checkpoint: {policyText(e.on_unstable)}</div>
                {e.actions.length === 0 ? null : <ul aria-label={`actions of ${e.title}`} style={small}>{e.actions.map((a, i) => <li key={i}>{fmtInstant(a.occurred_at)} — {actionLine(a)}</li>)}</ul>}
                {e.state === 'declared' && canOperate ? (
                  <div style={grid}>
                    <Field id={`pol-${e.experiment_id}`} label="Policy on an unstable checkpoint">{(id) => pick(id, pPolicy, (v) => setPPolicy(v as UnstablePolicy), [['stop', 'stop'], ['pause', 'pause'], ['none', 'none']])}</Field>
                    <Field id={`polr-${e.experiment_id}`} label="Why (8+ characters)">{(id) => txt(id, pReason, setPReason)}</Field>
                    <GovernedButton label="Set the policy" pendingLabel="setting" disabled={pReason.trim().length < 8} onRun={() => act('the policy', () => fabricExperiments.policy(scope, e.experiment_id, pPolicy, pReason.trim()) as never)} />
                  </div>
                ) : null}
                {['completed', 'partial', 'failed', 'cancelled'].includes(e.state) && canOperate ? (
                  <div style={grid}>
                    <Field id={`xr-${e.experiment_id}`} label="Retirement reason (8+ characters)">{(id) => txt(id, xReason, setXReason)}</Field>
                    <GovernedButton label="Retire the experiment" pendingLabel="retiring" variant="critical" disabled={xReason.trim().length < 8}
                      onRun={() => act('the retirement', () => fabricExperiments.retireExperiment(scope, e.experiment_id, xReason.trim()) as never)} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="run-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="run-h" style={h2}>A run — its retirement, its envelope sweep, its validation</h2>
        <div style={grid}>
          <Field id="run-id" label="Run id">{(id) => txt(id, runId, setRunId)}</Field>
          <GovernedButton label="Read the run" pendingLabel="reading" variant="quiet" disabled={!UUID.test(runId.trim())} onRun={() => openRun(runId.trim())} />
        </div>
        {run === null ? null : (
          <div style={{ marginBlockStart: 'var(--eye-space-12)' }}>
            <DefinitionRow term="Run"><Mono>{short(run.run_id)}</Mono> · {run.model_ref} · {run.state.toUpperCase()}{run.retired_at ? <span aria-label="retired"> · RETIRED {fmtInstant(run.retired_at)} — “{run.retire_reason}”</span> : null}</DefinitionRow>
            <DefinitionRow term="Reach (as it stands)"><span aria-label="reach">{reachLine(run.reach)}</span></DefinitionRow>
            {(run.reach?.packages ?? []).length === 0 ? null : <ul aria-label="packages citing the run" style={small}>{(run.reach?.packages ?? []).map((p, i) => <li key={i}>{p.title} v{p.version} — {p.option_key ? `option “${p.option_key}”${p.recommended ? ' (recommended)' : ''}` : 'the baseline run'}</li>)}</ul>}
            {run.retired_at === null && canOperate && ['completed', 'partial', 'failed'].includes(run.state) ? (
              <div style={grid}>
                <Field id="rr-reason" label="Retirement reason (8+ characters)">{(id) => txt(id, rReason, setRReason)}</Field>
                <Field id="rr-by" label="Superseded by run (optional)">{(id) => txt(id, rBy, setRBy)}</Field>
                <GovernedButton label="Retire the run" pendingLabel="retiring" variant="critical" disabled={rReason.trim().length < 8}
                  onRun={() => act('the retirement', () => fabricExperiments.retireRun(scope, run.run_id, rReason.trim(), rBy.trim() === '' ? null : rBy.trim()) as never, () => openRun(run.run_id))} />
              </div>
            ) : null}
            {canAnalyse && run.retired_at === null && run.state === 'completed' ? (
              <>
                <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Sweep the operating envelope</h3>
                <div style={grid}>
                  <Field id="sw-metric" label="Metric">{(id) => pick(id, sMetric, setSMetric, [['line_stop_days', 'line-stop days'], ['total_cost', 'total cost'], ['days_below_safety_stock', 'days below safety stock']])}</Field>
                  <Field id="sw-points" label="Grid points (3–25)">{(id) => txt(id, sPoints, setSPoints, 'number')}</Field>
                  <GovernedButton label="Sweep the envelope" pendingLabel="sweeping" onRun={() => act('the sweep', () => fabricExperiments.sweep(scope, run.run_id, sMetric, Number(sPoints)) as never, () => openRun(run.run_id))} />
                </div>
                <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Validate against a sample</h3>
                <div style={grid}>
                  <Field id="bv-measure" label="Measure">{(id) => pick(id, bMeasure, setBMeasure, [['total_cost', 'total cost'], ['line_stop_days', 'line-stop days'], ['days_below_safety_stock', 'days below safety stock']])}</Field>
                  <Field id="bv-kind" label="Sample">{(id) => pick(id, bKind, (v) => setBKind(v as 'benchmark' | 'observed'), [['benchmark', 'a benchmark (basis stated)'], ['observed', 'observed (evidence cited)']])}</Field>
                  <Field id="bv-threshold" label="Rare-event threshold (optional)">{(id) => txt(id, bThreshold, setBThreshold, 'number')}</Field>
                  <Field id="bv-tolerance" label="Tolerance (fraction)">{(id) => txt(id, bTolerance, setBTolerance, 'number')}</Field>
                </div>
                <Field id="bv-values" label="Values (comma-separated)">{(id) => <textarea id={id} style={textareaStyle} value={bValues} onChange={(e) => setBValues(e.target.value)} />}</Field>
                <Field id="bv-basis" label="Basis (16+ characters)">{(id) => txt(id, bBasis, setBBasis)}</Field>
                {bKind === 'observed' ? <Field id="bv-citations" label="Citations (JSON: [{kind, id, version, digest}])">{(id) => <textarea id={id} style={textareaStyle} value={bCitations} onChange={(e) => setBCitations(e.target.value)} />}</Field> : null}
                <GovernedButton label="Validate" pendingLabel="validating" disabled={parseValues(bValues) === null || bBasis.trim().length < 16} onRun={async () => {
                  let citations: unknown = [];
                  try { citations = bKind === 'observed' ? JSON.parse(bCitations) : []; } catch { const m = 'the citations are JSON'; setProblem(m); throw new Error(m); }
                  await act('the validation', () => fabricExperiments.benchmark(scope, run.run_id, { measure: bMeasure, kind: bKind, values: parseValues(bValues) ?? [], basis: bBasis.trim(),
                    citations: citations as Array<Record<string, unknown>>, tolerance: Number(bTolerance), tailThreshold: bThreshold.trim() === '' ? null : Number(bThreshold) }) as never, () => openRun(run.run_id));
                }} />
              </>
            ) : null}
            {run.sweeps.length === 0 ? null : (
              <>
                <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Envelope sweeps</h3>
                {run.sweeps.map((s) => (
                  <div key={s.sweep_id} aria-label={`sweep of ${s.metric}`} style={small}>
                    <p>{fmtInstant(s.swept_at)} — {s.metric} on a {s.grid_points}-point grid · {s.nonlinear_factors} nonlinear factor(s) · {s.thresholds} threshold(s) · {s.hidden_dependencies} hidden dependenc{s.hidden_dependencies === 1 ? 'y' : 'ies'}</p>
                    <ul aria-label="responses">{s.factors.map((f) => <li key={f.key}>{sweepFactorLine(f)}</li>)}</ul>
                    <ScrollBox label={`response grid of ${s.metric}`}>
                      <table style={tableStyle}><thead><tr><Th>Factor</Th>{(s.factors[0]?.grid ?? []).map((_, i) => <Th key={i}>#{i + 1}</Th>)}</tr></thead>
                        <tbody>{s.factors.map((f) => <tr key={f.key}><Td>{f.key}</Td>{f.grid.map((g, i) => <Td key={i}>{g.value} → {g.metric}</Td>)}</tr>)}</tbody></table>
                    </ScrollBox>
                    <ul aria-label="interactions">{s.interactions.map((i) => <li key={i.factors.join('×')}>{interactionLine(i)}</li>)}</ul>
                  </div>
                ))}
              </>
            )}
            {run.validations.length === 0 ? null : (
              <>
                <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Validations</h3>
                <ul aria-label="validations" style={small}>{run.validations.map((v) => (
                  <li key={v.validation_id}>{validationLine(v)}<br />{tailLine(v.tail)}<br />{convergenceLine(v.convergence)}<br /><span style={muted}>basis: {v.benchmark.basis}</span></li>
                ))}</ul>
              </>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="ret-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="ret-h" style={h2}>Retirements</h2>
        {o === null || o.retirements.length === 0 ? <Empty>Nothing has been retired in this domain.</Empty> : (
          <ul aria-label="retirements" style={small}>{o.retirements.map((r) => <li key={r.retirement_id}>{fmtInstant(r.retired_at)} — {retirementLine(r)}</li>)}</ul>
        )}
      </section>

      {problem !== null ? <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>{problem}</span></LiveStatus> : null}
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
      <Receipt receipt={receipt} />
    </>
  );
}
