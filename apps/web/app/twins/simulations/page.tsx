'use client';
/**
 * Simulations — runs against admitted twin versions: a CONTROL, then interventions
 * compared on that common baseline; the assumptions carrying the result; and
 * reproduction from the stored contract. Every value is SYNTHETIC and says so.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { twins as api, type Run, type Twin } from '../../../lib/twins';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

const money = (v: unknown): string => (typeof v === 'string' ? `€${Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2 })}` : '—');
const iv = (r: Run): string => r.interventions.map((i) => (i['type'] === 'none' ? 'none' : `${String(i['type'])}${i['shipment'] ? ` ${String(i['shipment'])}` : ''}${i['weeks'] ? ` ${String(i['weeks'])}w` : ''}`)).join(' + ');

export default function SimulationsPage() {
  const { scope, isSimulationOperator } = useShell();
  const [twinsList, setTwins] = useState<Twin[]>([]);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [open, setOpen] = useState<Run | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [twinId, setTwinId] = useState('');
  const [twinVersion, setTwinVersion] = useState('');
  const [runKind, setRunKind] = useState<'control' | 'intervention'>('control');
  const [controlRunId, setControlRunId] = useState('');
  const [intervention, setIntervention] = useState('reroute:SYN-SHIP-4472');
  const [shock, setShock] = useState(true);
  const [comparison, setComparison] = useState<{ control_run_id: string; runs: Array<{ run_id: string; run_kind: string; interventions: Array<Record<string, unknown>>; totals: Run['outputs'] extends infer _ ? { line_stop_days: number; days_below_safety_stock: number; cost: { total: string } } : never; carrying: string[] }> } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);

  const load = async () => {
    const [t, r] = await Promise.all([api.list(scope), api.runs(scope, null)]);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the runs could not be read'); return; }
    setRuns(r.data.runs);
    if (t.ok && t.data !== undefined) { setTwins(t.data.twins); setTwinId((p) => p || (t.data?.twins[0]?.twin_id ?? '')); }
  };
  useEffect(() => { void load(); }, [scope]);
  const openRun = async (id: string) => { const r = await api.run(scope, id); if (r.ok && r.data !== undefined) setOpen(r.data.run); };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (runs === null) return <Empty>reading runs…</Empty>;
  const twin = twinsList.find((t) => t.twin_id === twinId);
  const admitted = (twin?.versions ?? []).filter((v) => v.state === 'admitted' && v.completeness === 'complete');
  const controls = runs.filter((r) => r.run_kind === 'control' && r.state === 'completed');

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Simulations</h1>
      <UnknownNote><strong>Every number on this screen is SYNTHETIC</strong> — the output of a declared model on a declared state, reproducible from its stored contract. It is not an observation and not a forecast. Interventions are compared only against a compatible control on the same initial state.</UnknownNote>
      {isSimulationOperator ? (
        <section aria-labelledby="run-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="run-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Run</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--eye-space-8)' }}>
            <label>Twin<select style={inputStyle} value={twinId} onChange={(e) => { setTwinId(e.target.value); setTwinVersion(''); }}>{twinsList.map((t) => <option key={t.twin_id} value={t.twin_id}>{t.title}</option>)}</select></label>
            <label>Admitted, complete version<select style={inputStyle} value={twinVersion} onChange={(e) => setTwinVersion(e.target.value)}><option value="">choose</option>{admitted.map((v) => <option key={v.version} value={v.version}>v{v.version} · {v.branch_id}{v.verification_state === 'unverified' ? ' · UNVERIFIED' : ''}</option>)}</select></label>
            <label>Kind<select style={inputStyle} value={runKind} onChange={(e) => setRunKind(e.target.value as 'control' | 'intervention')}><option value="control">control (intervention: none)</option><option value="intervention">intervention (needs a control)</option></select></label>
            {runKind === 'intervention' ? (
              <>
                <label>Control run<select style={inputStyle} value={controlRunId} onChange={(e) => setControlRunId(e.target.value)}><option value="">choose</option>{controls.map((c) => <option key={c.run_id} value={c.run_id}>{c.run_id.slice(0, 8)}… v{c.twin_version} {c.shock ? 'shock' : 'no shock'}</option>)}</select></label>
                <label>Intervention<select style={inputStyle} value={intervention} onChange={(e) => setIntervention(e.target.value)}>
                  <option value="reroute:SYN-SHIP-4472">reroute SYN-SHIP-4472 via the Cape</option>
                  <option value="reroute:SYN-SHIP-4475">reroute SYN-SHIP-4475 via the Cape</option>
                  <option value="air">air bridge — one week of SYN-PART-MAG, decided 2024-01-17</option>
                  <option value="draw_down">draw down safety stock (consume to zero)</option>
                  <option value="draw_down+reroute:SYN-SHIP-4472">draw down + reroute SYN-SHIP-4472</option>
                </select></label>
              </>
            ) : null}
            <label><input type="checkbox" checked={shock} onChange={(e) => setShock(e.target.checked)} /> apply the flipped scenario branch (corridor delay)</label>
          </div>
          <GovernedButton label={runKind === 'control' ? 'Run control' : 'Run intervention'} pendingLabel="running" onRun={async () => {
            const parts = intervention.split('+');
            const interventions = runKind === 'control' ? [{ type: 'none' }] : parts.map((p) => {
              if (p === 'air') return { type: 'air_bridge', component: 'SYN-PART-MAG', weeks: 1, decision_date: '2024-01-17' };
              if (p === 'draw_down') return { type: 'draw_down', component: 'SYN-PART-MAG', from: '2024-01-11', to: '2024-04-09' };
              return { type: 'reroute', shipment: p.split(':')[1] };
            });
            const r = await api.simulate(scope, { twinId, twinVersion: Number(twinVersion), runKind, controlRunId: runKind === 'control' ? null : controlRunId, shock, component: 'SYN-PART-MAG',
              interventions, horizonDays: 90, stochastic: { mode: 'deterministic' } });
            if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the run was refused');
            setReceipt(r.data.receipt); setLast(`run ${r.data.run.runId.slice(0, 8)}… ${r.data.run.state}: ${r.data.run.totals.line_stop_days} line-stop day(s), total ${money(r.data.run.totals.cost.total)} — SYNTHETIC`); await load();
          }} />
        </section>
      ) : null}
      {runs.length === 0 ? <Empty>No run has been made.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <caption style={{ captionSide: 'top', textAlign: 'start', color: 'var(--eye-color-ink-muted)' }}>{runs.length} run(s) — SYNTHETIC</caption>
          <thead><tr><Th>Select</Th><Th>Run</Th><Th>Kind</Th><Th>Twin version</Th><Th>Shock</Th><Th>Interventions</Th><Th>Line-stop days</Th><Th>Total cost</Th><Th>State</Th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.run_id}>
                <Td><input type="checkbox" aria-label={`select ${r.run_id.slice(0, 8)}`} checked={selected.includes(r.run_id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, r.run_id] : s.filter((x) => x !== r.run_id))} /></Td>
                <Td><button type="button" onClick={() => void openRun(r.run_id)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-default)', cursor: 'pointer', textDecoration: 'underline' }}><Mono>{r.run_id.slice(0, 8)}…</Mono></button></Td>
                <Td mono>{r.run_kind}{r.control_run_id ? ` → ${r.control_run_id.slice(0, 8)}…` : ''}</Td>
                <Td mono>v{r.twin_version} · {r.branch_id}</Td>
                <Td>{r.shock ? 'corridor delay applied' : 'none'}</Td>
                <Td>{iv(r)}</Td>
                <Td mono>{r.outputs?.totals?.line_stop_days ?? '—'}</Td>
                <Td mono>{money(r.outputs?.totals?.cost.total)}</Td>
                <Td>{r.state === 'failed' ? <strong style={{ color: 'var(--eye-color-critical)' }}>FAILED — {r.failure}</strong> : r.state}{r.validation_status.includes('UNVERIFIED') ? <div style={{ color: 'var(--eye-color-critical)', fontSize: 'var(--eye-type-label-sm)' }}>twin version UNVERIFIED</div> : null}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <GovernedButton label={`Compare ${selected.length} selected on their common control`} pendingLabel="comparing" variant="quiet" onRun={async () => {
        const r = await api.compareRuns(scope, selected);
        if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the comparison was refused');
        setComparison(r.data.comparison as never); setReceipt(r.data.receipt);
      }} />
      {comparison === null ? null : (
        <section aria-labelledby="cmp-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="cmp-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Comparison on control <Mono>{comparison.control_run_id.slice(0, 8)}…</Mono> — SYNTHETIC</h2>
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Run</Th><Th>Interventions</Th><Th>Line-stop days</Th><Th>Days below safety stock</Th><Th>Total cost</Th><Th>Carrying assumptions</Th></tr></thead>
            <tbody>
              {comparison.runs.map((r) => (
                <tr key={r.run_id}><Td mono>{r.run_id.slice(0, 8)}… ({r.run_kind})</Td><Td>{r.interventions.map((i) => String(i['type'])).join(' + ')}</Td>
                  <Td mono>{r.totals.line_stop_days}</Td><Td mono>{r.totals.days_below_safety_stock}</Td><Td mono>{money(r.totals.cost.total)}</Td><Td mono>{r.carrying.join(', ')}</Td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {open === null ? null : (
        <section aria-labelledby="run-d" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="run-d" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Run <Mono>{open.run_id}</Mono> — SYNTHETIC</h2>
          <dl>
            <DefinitionRow term="Contract">twin v{open.twin_version} ({open.branch_id}) · {open.run_kind}{open.control_run_id ? <> on control <Mono>{open.control_run_id.slice(0, 8)}…</Mono></> : ''} · {iv(open)} · shock {open.shock ? 'applied' : 'not applied'}</DefinitionRow>
            <DefinitionRow term="Cut-offs">observations through <Mono>{String(open.observed_through ?? '').slice(0, 10)}</Mono>, read at record time <Mono>{fmtInstant(open.known_at)}</Mono></DefinitionRow>
            <DefinitionRow term="Bound"><Mono>{open.model_ref}</Mono> impl <Mono>{open.implementation_digest.slice(0, 16)}…</Mono> · env <Mono>{open.environment_digest.slice(0, 16)}…</Mono> · {open.stochastic_mode}{open.stochastic_mode === 'seeded' ? ` (${open.rng}, seed ${open.seed}, ${open.samples} samples)` : ''}</DefinitionRow>
            <DefinitionRow term="Digests">initial state <Mono>{open.initial_state_digest.slice(0, 16)}…</Mono> · inputs <Mono>{open.inputs_digest.slice(0, 16)}…</Mono> · outputs <Mono>{String(open.outputs_digest ?? '').slice(0, 16)}…</Mono></DefinitionRow>
            <DefinitionRow term="Totals">{open.outputs?.totals ? <>{open.outputs.totals.line_stop_days} line-stop day(s) from {open.outputs.totals.first_line_stop_date ?? 'never'} · {open.outputs.totals.days_below_safety_stock} day(s) below safety stock · min on-hand {open.outputs.totals.min_on_hand} · cost {money(open.outputs.totals.cost.total)} (reroute {money(open.outputs.totals.cost.reroute)}, air {money(open.outputs.totals.cost.air)}, line stop {money(open.outputs.totals.cost.line_stop)})</> : '—'}</DefinitionRow>
            <DefinitionRow term="Assumptions carrying the result">{(open.sensitivity?.factors ?? []).slice(0, 4).map((f) => <div key={f.key}><Mono>{f.key}</Mono> — cost spread {money(f.cost_spread)}</div>)}{open.sensitivity?.outside_envelope ? <strong style={{ color: 'var(--eye-color-critical)' }}>a perturbation left the validated operating envelope</strong> : null}</DefinitionRow>
            <DefinitionRow term="Validation">{open.validation_status}</DefinitionRow>
            <DefinitionRow term="Reproductions">{(open.reproductions ?? []).length === 0 ? 'none yet' : (open.reproductions ?? []).map((r, i) => <div key={i}><strong style={{ color: r.verdict === 'reproduced' ? 'var(--eye-color-success)' : 'var(--eye-color-critical)' }}>{r.verdict.toUpperCase()}</strong> {fmtInstant(r.reproduced_at)}{r.cold_process ? ' (cold process)' : ''} — {r.reason}</div>)}</DefinitionRow>
          </dl>
          {isSimulationOperator && open.state === 'completed' ? (
            <GovernedButton label="Reproduce from the stored contract" pendingLabel="re-executing" onRun={async () => {
              const r = await api.reproduce(scope, open.run_id);
              if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the reproduction was refused');
              setReceipt(r.data.receipt); setLast(`reproduction ${r.data.reproduction.verdict.toUpperCase()} — ${r.data.reproduction.reason}`); await openRun(open.run_id);
            }} />
          ) : null}
        </section>
      )}
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
      <Receipt receipt={receipt} />
    </>
  );
}
