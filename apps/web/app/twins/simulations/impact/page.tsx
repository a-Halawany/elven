'use client';
/**
 * Impact analysis — CP-6 B31 part `impact` (0099 §I; F-P5-07; V00-T-062 "inspect assumptions, modify interventions, compare runs, challenge
 * model structure, and request sensitivity analysis"). For one completed run: the SENSITIVITY ANALYSIS on request (one at a time, ranked —
 * the tornado —, robust or not across seeds, the timing of its dated interventions), the SECOND-ORDER, distributional and timing effects
 * carried over the twin links (the delivery dates downstream), the run COMPARED with the others on its control, the run's simulated
 * frequency stated as a probability ONLY through an approved map; and the VALUE OF INFORMATION of a decision — wait or act, from the
 * governed branch probabilities. Every number is SYNTHETIC and computed by the server; this page lays it out and words it.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../../layout';
import { twins as twinsApi, type Run } from '../../../../lib/twins';
import { prediction, type ScenarioRow } from '../../../../lib/prediction';
import { quality, type FrequencyMap } from '../../../../lib/quality-b27';
import { decisions, type Package } from '../../../../lib/decisions';
import {
  impact as api, effectTiming, effectValues, probabilityLine, robustnessMark, tornadoRows, voiVerdict,
  type Assessment, type Information, type RunImpact,
} from '../../../../lib/impact-b31';
import { Empty, LiveStatus, Mono, cardStyle, GovernedButton, UnknownNote, fmtInstant, textareaStyle } from '../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../../components/ui';

type Rec = { policyDecisionId: string; auditSeq: number };
const short = (v: unknown): string => (typeof v === 'string' && v !== '' ? `${v.slice(0, 8)}…` : '—');
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const sectionStyle = { ...cardStyle, marginBlockStart: 'var(--eye-space-16)' };
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 };
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 'var(--eye-space-8)' } as const;

/** THE TORNADO: each factor's bar from the base line — the low move to one side, the high move to the other — scaled to the widest swing. */
function Tornado({ a }: { a: RunImpact['analyses'][number] }) {
  const rows = tornadoRows(a.factors);
  return (
    <figure aria-label={`tornado chart of ${a.metric}`} style={{ margin: 0 }}>
      <figcaption style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>
        {a.metric} at base {String(a.base_value)} · each parameter moved ±{Math.round(Number(a.relative) * 100)}%{a.timing_shift_days ? `, each dated intervention ±${a.timing_shift_days} day(s)` : ''} · widest first (SYNTHETIC)
      </figcaption>
      {rows.map((r) => (
        <div key={r.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(12rem, 18rem) 1fr', alignItems: 'center', gap: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-4)' }}>
          <span style={{ fontSize: 'var(--eye-type-label-sm)' }}>{r.rank}. <Mono>{r.key}</Mono>{r.kind === 'timing' ? ' (timing)' : ''}</span>
          <div role="img" aria-label={`${r.key}: low ${r.lowValue} moves the metric by ${r.lowDelta}; high ${r.highValue} by ${r.highDelta}`}
               style={{ position: 'relative', blockSize: '1.1rem', background: 'var(--eye-color-surface-sunken, transparent)', borderInline: '1px solid var(--eye-color-border-default)' }}>
            <span aria-hidden="true" style={{ position: 'absolute', insetBlock: 0, insetInlineStart: '50%', inlineSize: 1, background: 'var(--eye-color-ink-muted)' }} />
            {[{ pct: r.lowPct, token: '--eye-color-info, var(--eye-color-ink-muted)' }, { pct: r.highPct, token: '--eye-color-warning' }].map((b, i) => (
              <span key={i} aria-hidden="true" style={{ position: 'absolute', insetBlock: 2, background: `var(${b.token})`, opacity: i === 0 ? 0.6 : 0.85,
                ...(b.pct >= 0 ? { insetInlineStart: '50%', inlineSize: `${b.pct / 2}%` } : { insetInlineEnd: '50%', inlineSize: `${-b.pct / 2}%` }) }} />
            ))}
          </div>
        </div>
      ))}
    </figure>
  );
}

export default function ImpactPage() {
  const { scope } = useShell();
  const [runs, setRuns] = useState<Run[]>([]);
  const [runId, setRunId] = useState('');
  const [view, setView] = useState<RunImpact | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Rec | null>(null);
  // the sensitivity request
  const [metric, setMetric] = useState('total_cost');
  const [relative, setRelative] = useState('0.2');
  const [seeds, setSeeds] = useState('11, 12, 13');
  const [samples, setSamples] = useState('100');
  const [jitter, setJitter] = useState('{"0": 0.5, "3": 0.3, "7": 0.2}');
  const [shift, setShift] = useState('7');
  const [parameters, setParameters] = useState('');
  // the comparison
  const [compared, setCompared] = useState<Array<{ run_id: string; run_kind: string; totals: { line_stop_days: number; days_below_safety_stock: number; cost: { total: string } }; carrying: string[] }> | null>(null);
  // the probability statement
  const [maps, setMaps] = useState<FrequencyMap[]>([]);
  const [mapId, setMapId] = useState('');
  const [evMetric, setEvMetric] = useState('line_stop_days');
  const [evOp, setEvOp] = useState('>');
  const [evThreshold, setEvThreshold] = useState('0');
  const [evLabel, setEvLabel] = useState('the Regensburg line stops at least one day');
  // the value of information
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [packages, setPackages] = useState<Package[]>([]);
  const [assessments, setAssessments] = useState<Assessment[]>([]);
  const [scenarioId, setScenarioId] = useState('');
  const [packageId, setPackageId] = useState('');
  const [reviewId, setReviewId] = useState('');
  const [infoLabel, setInfoLabel] = useState('one more week of transit data');
  const [delayDays, setDelayDays] = useState('7');
  const [delayCost, setDelayCost] = useState('0');
  const [signals, setSignals] = useState('');
  const [likelihoodBasis, setLikelihoodBasis] = useState('');
  const [options, setOptions] = useState('');
  const [payoffs, setPayoffs] = useState('');
  const [unit, setUnit] = useState('k€');
  const [payoffBasis, setPayoffBasis] = useState('');

  const loadRun = async (id: string) => {
    if (id === '') { setView(null); return; }
    const r = await api.read(scope, id);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the run\'s impact could not be read')); setView(null); return; }
    setProblem(null); setView(r.data.impact);
  };
  const load = async () => {
    const [rs, ms, sc, pk, as] = await Promise.all([twinsApi.runs(scope, null), quality.maps(scope), prediction.listScenarios(scope), decisions.list(scope), api.assessments(scope)]);
    if (rs.ok && rs.data !== undefined) setRuns(rs.data.runs.filter((x) => x.state === 'completed'));
    if (ms.ok && ms.data !== undefined) setMaps(ms.data.maps.filter((m) => m.state === 'active'));
    if (sc.ok && sc.data !== undefined) setScenarios(sc.data.scenarios.filter((s) => s.state === 'active'));
    if (pk.ok && pk.data !== undefined) setPackages(pk.data.packages);
    if (as.ok && as.data !== undefined) setAssessments(as.data.assessments);
  };
  useEffect(() => { void load(); }, [scope]);
  useEffect(() => { void loadRun(runId); setCompared(null); }, [runId]);
  const done = async (line: string, r: Rec) => { setLast(line); setReceipt(r); await loadRun(runId); };

  const run = runs.find((r) => r.run_id === runId);
  const latest = view?.analyses[0] ?? null;
  const rob = robustnessMark(latest?.robustness ?? null);
  const scenario = scenarios.find((s) => s.scenario_id === scenarioId);
  const peers = run === undefined ? [] : runs.filter((r) => r.run_id !== run.run_id && (r.control_run_id === (run.control_run_id ?? run.run_id) || r.run_id === run.control_run_id));

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Impact analysis</h1>
      <UnknownNote><strong>Every number on this screen is SYNTHETIC</strong> — produced by the pinned model from a run&apos;s stored contract, or computed by the server from governed records. A simulated frequency is never a probability unless an approved map says so; a future is weighed only by its governed probability.</UnknownNote>

      <section aria-labelledby="run-h" style={sectionStyle}>
        <h2 id="run-h" style={h2}>Run</h2>
        <label>Completed run<select style={inputStyle} value={runId} onChange={(e) => setRunId(e.target.value)}>
          <option value="">choose</option>
          {runs.map((r) => <option key={r.run_id} value={r.run_id}>{r.run_id.slice(0, 8)}… {r.run_kind} · {r.model_ref ?? 'supply-flow@1'} · v{r.twin_version}{r.shock ? ' · shock' : ''}{r.scenario_branch_id ? ' · on a branch' : ''}</option>)}
        </select></label>
        {view === null ? (runId === '' ? <Empty>choose a completed run</Empty> : null) : (
          <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>
            run <Mono>{short(view.run.run_id)}</Mono> · {view.run.run_kind} · {view.run.model_ref} · {view.run.stochastic_mode}{view.run.samples ? ` (${view.run.samples} samples)` : ''} · state <strong>{view.run.state}</strong> · validity <strong>{view.run.validity}</strong>
            {view.run.validity === 'invalidated' ? ' — an invalidated result is not analysed' : ''} · fitness {view.run.fitness_state}{view.run.promoted_for ? ` (fit for ${view.run.promoted_for})` : ''}
          </p>
        )}
        {problem !== null ? <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>{problem}</span></LiveStatus> : null}
      </section>

      {view === null ? null : (
        <>
          <section aria-labelledby="sens-h" style={sectionStyle}>
            <h2 id="sens-h" style={h2}>Sensitivity and robustness</h2>
            <div style={grid}>
              <label>Metric<select style={inputStyle} value={metric} onChange={(e) => setMetric(e.target.value)}>
                <option value="total_cost">total cost (€)</option><option value="line_stop_days">line-stop days</option><option value="days_below_safety_stock">days below safety stock</option>
              </select></label>
              <label>Step (fraction moved, 0–1)<input type="number" step="0.05" min="0.05" max="1" style={inputStyle} value={relative} onChange={(e) => setRelative(e.target.value)} /></label>
              <label>Seeds for robustness (3+, blank: none)<input type="text" style={inputStyle} value={seeds} onChange={(e) => setSeeds(e.target.value)} /></label>
              <label>Samples per seed<input type="number" style={inputStyle} value={samples} onChange={(e) => setSamples(e.target.value)} /></label>
              <label>Lead-time jitter (a deterministic run declares one)<input type="text" style={inputStyle} value={jitter} onChange={(e) => setJitter(e.target.value)} /></label>
              <label>Move dated interventions by ± days (blank: no timing)<input type="number" style={inputStyle} value={shift} onChange={(e) => setShift(e.target.value)} /></label>
              <label>Parameters to move (comma-separated keys or paths; blank: all)<input type="text" style={inputStyle} value={parameters} onChange={(e) => setParameters(e.target.value)} /></label>
            </div>
            <GovernedButton label="Analyse sensitivity" pendingLabel="analysing" onRun={async () => {
              const sd = seeds.split(',').map((x) => x.trim()).filter((x) => x !== '').map(Number);
              let jt: Record<string, number> | null = null;
              if (sd.length > 0 && view.run.stochastic_mode !== 'seeded') { try { jt = JSON.parse(jitter) as Record<string, number>; } catch { throw new Error('the jitter is not JSON'); } }
              const r = await api.sensitivity(scope, view.run.run_id, { metric, relative: Number(relative), seeds: sd.length === 0 ? null : sd, samples: Number(samples), jitter: jt, timingShiftDays: shift.trim() === '' ? null : Number(shift),
                parameters: parameters.trim() === '' ? null : parameters.split(',').map((x) => x.trim()).filter((x) => x !== '') });
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'the analysis was not answered'); setProblem(m); throw new Error(m); }
              setProblem(null);
              await done(`sensitivity analysis ${short(r.data.analysis.analysis_id)} recorded — widest: ${r.data.analysis.factors[0]?.key ?? '—'}; ${r.data.analysis.robustness_verdict}`, r.data.receipt);
            }} />
            {latest === null ? <Empty>no sensitivity analysis of this run yet</Empty> : (
              <>
                <p aria-label="robustness verdict"><span style={{ color: `var(${rob.token})`, fontWeight: 650 }}><span aria-hidden="true">{rob.glyph}</span> {rob.text}</span>
                  {latest.seeds ? <> · seeds <Mono>{latest.seeds.join(', ')}</Mono></> : null} · analysed {fmtInstant(latest.analysed_at)} · <Mono>{short(latest.analysis_id)}</Mono></p>
                <Tornado a={latest} />
                <table style={tableStyle} aria-label="sensitivity factors">
                  <thead><tr><Th>Rank</Th><Th>Factor (twin element)</Th><Th>Base</Th><Th>Low → metric</Th><Th>High → metric</Th><Th>Swing</Th></tr></thead>
                  <tbody>{latest.factors.map((f) => (
                    <tr key={f.key}><Td>{f.rank}</Td><Td><Mono>{f.key}</Mono>{f.element_kind ? ` (${f.element_kind})` : ''}{f.outside_envelope ? ' · leaves the envelope' : ''}</Td><Td>{String(f.base_value)}</Td>
                      <Td>{String(f.low.value)} → {f.low.metric} ({f.delta_low >= 0 ? '+' : ''}{f.delta_low})</Td><Td>{String(f.high.value)} → {f.high.metric} ({f.delta_high >= 0 ? '+' : ''}{f.delta_high})</Td><Td>{f.swing}</Td></tr>
                  ))}</tbody>
                </table>
              </>
            )}
          </section>

          <section aria-labelledby="so-h" style={sectionStyle}>
            <h2 id="so-h" style={h2}>Second-order effects</h2>
            <p style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>The run&apos;s lost production days against its counterfactual (the same contract without the shock), carried over every live twin link to the delivery dates downstream (rule second-order@1).</p>
            <GovernedButton label="Derive second-order effects" pendingLabel="deriving" onRun={async () => {
              const r = await api.secondOrder(scope, view.run.run_id);
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'the derivation was not answered'); setProblem(m); throw new Error(m); }
              setProblem(null);
              await done(`second-order effects derived over ${r.data.secondOrder.links_traversed} link(s)`, r.data.receipt);
            }} />
            {view.second_order.length === 0 ? <Empty>no second-order derivation of this run yet</Empty> : (
              <table style={tableStyle} aria-label="second-order effects">
                <thead><tr><Th>Depth</Th><Th>Twin</Th><Th>Effect</Th><Th>Values</Th><Th>Timing</Th></tr></thead>
                <tbody>{view.second_order.map((e) => (
                  <tr key={e.effect_id ?? `${e.depth}-${e.entity_twin_id}`}><Td>{e.depth}</Td><Td>{e.entity_label}{e.via_link_id ? <> · via link <Mono>{short(e.via_link_id)}</Mono></> : ''}</Td>
                    <Td>{e.metric === 'delivery_date_shift_days' ? 'delivery dates shift' : 'production days lost'}</Td><Td>{effectValues(e)}</Td><Td>{effectTiming(e)}</Td></tr>
                ))}</tbody>
              </table>
            )}
          </section>

          <section aria-labelledby="cmp-h" style={sectionStyle}>
            <h2 id="cmp-h" style={h2}>Compare runs on the common control</h2>
            {peers.length === 0 ? <Empty>no other run shares this run&apos;s control</Empty> : (
              <GovernedButton label="Compare" pendingLabel="comparing" variant="quiet" onRun={async () => {
                const r = await twinsApi.compareRuns(scope, [view.run.run_id, ...peers.map((x) => x.run_id)]);
                if (!r.ok || r.data === undefined) { const m = refusal(r, 'the comparison was not answered'); setProblem(m); throw new Error(m); }
                setCompared(r.data.comparison.runs);
              }} />
            )}
            {compared === null ? null : (
              <table style={tableStyle} aria-label="run comparison">
                <thead><tr><Th>Run</Th><Th>Kind</Th><Th>Line-stop days</Th><Th>Total cost</Th><Th>Carried by</Th></tr></thead>
                <tbody>{compared.map((c) => <tr key={c.run_id}><Td><Mono>{short(c.run_id)}</Mono></Td><Td>{c.run_kind}</Td><Td>{c.totals.line_stop_days}</Td><Td>{c.totals.cost.total}</Td><Td>{c.carrying.join(', ')}</Td></tr>)}</tbody>
              </table>
            )}
          </section>

          <section aria-labelledby="prob-h" style={sectionStyle}>
            <h2 id="prob-h" style={h2}>A simulated frequency as a probability</h2>
            <div style={grid}>
              <label>Approved frequency map<select style={inputStyle} value={mapId} onChange={(e) => setMapId(e.target.value)}><option value="">none — the server refuses without one</option>{maps.map((m) => <option key={m.map_id} value={m.map_id}>{m.name} v{m.version} ({m.horizon})</option>)}</select></label>
              <label>Event metric<select style={inputStyle} value={evMetric} onChange={(e) => setEvMetric(e.target.value)}><option value="line_stop_days">line-stop days</option><option value="days_below_safety_stock">days below safety stock</option><option value="total_cost">total cost</option></select></label>
              <label>Comparison<select style={inputStyle} value={evOp} onChange={(e) => setEvOp(e.target.value)}><option value=">">greater than</option><option value=">=">at least</option></select></label>
              <label>Threshold<input type="number" style={inputStyle} value={evThreshold} onChange={(e) => setEvThreshold(e.target.value)} /></label>
              <label>Event in words<input type="text" style={inputStyle} value={evLabel} onChange={(e) => setEvLabel(e.target.value)} /></label>
            </div>
            <GovernedButton label="State as probability" pendingLabel="stating" variant="quiet" onRun={async () => {
              const r = await api.probability(scope, view.run.run_id, { mapId: mapId === '' ? null : mapId, event: { metric: evMetric, op: evOp, threshold: Number(evThreshold), label: evLabel.trim() } });
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'the statement was not answered'); setProblem(m); throw new Error(m); }
              setProblem(null);
              await done(probabilityLine(r.data.statement), r.data.receipt);
            }} />
            {view.probabilities.length === 0 ? <Empty>no probability stated for this run</Empty> : <ul aria-label="probability statements">{view.probabilities.map((s) => <li key={s.statement_id}>{probabilityLine(s)} — <span style={{ color: 'var(--eye-color-ink-muted)' }}>{s.conversion}</span></li>)}</ul>}
          </section>
        </>
      )}

      <section aria-labelledby="voi-h" style={sectionStyle}>
        <h2 id="voi-h" style={h2}>Value of information</h2>
        <p style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>Is the information worth waiting for? The futures are weighed by their GOVERNED probabilities only (refused when a branch has none); the payoffs come from a portfolio review or are entered with their basis; the server computes EVPI, EVSI and the recommendation.</p>
        <div style={grid}>
          <label>Scenario<select style={inputStyle} value={scenarioId} onChange={(e) => setScenarioId(e.target.value)}><option value="">choose</option>{scenarios.map((s) => <option key={s.scenario_id} value={s.scenario_id}>{s.title}</option>)}</select></label>
          <label>Decision package<select style={inputStyle} value={packageId} onChange={(e) => setPackageId(e.target.value)}><option value="">none</option>{packages.map((p) => <option key={p.package_id} value={p.package_id}>{p.title} ({p.state})</option>)}</select></label>
          <label>Portfolio review id (or enter the payoffs)<input type="text" style={inputStyle} value={reviewId} onChange={(e) => setReviewId(e.target.value.trim())} /></label>
          <label>Information<input type="text" style={inputStyle} value={infoLabel} onChange={(e) => setInfoLabel(e.target.value)} /></label>
          <label>Days to obtain it<input type="number" style={inputStyle} value={delayDays} onChange={(e) => setDelayDays(e.target.value)} /></label>
          <label>Cost of waiting (payoff unit)<input type="number" style={inputStyle} value={delayCost} onChange={(e) => setDelayCost(e.target.value)} /></label>
          <label>Payoff unit<input type="text" style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
        </div>
        {scenario === undefined ? null : <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>branches: {scenario.branches.map((b) => <span key={b.branch_id}><Mono>{b.branch_id}</Mono> {b.name} ({b.state}); </span>)}</p>}
        <label>Signals — how the information could read: [{'{'}"key", "label", "likelihoods": {'{'}branch_id: P(signal | branch){'}'}{'}'}]<textarea style={textareaStyle} rows={4} value={signals} onChange={(e) => setSignals(e.target.value)} /></label>
        <label>The likelihood model, stated<input type="text" style={inputStyle} value={likelihoodBasis} onChange={(e) => setLikelihoodBasis(e.target.value)} /></label>
        {reviewId === '' ? (
          <>
            <label>Options [{'{'}"key", "title"{'}'}]<textarea style={textareaStyle} rows={2} value={options} onChange={(e) => setOptions(e.target.value)} /></label>
            <label>Payoffs {'{'}option_key: {'{'}branch_id: number{'}'}{'}'}<textarea style={textareaStyle} rows={3} value={payoffs} onChange={(e) => setPayoffs(e.target.value)} /></label>
            <label>Basis of the payoffs (the runs or record they come from)<input type="text" style={inputStyle} value={payoffBasis} onChange={(e) => setPayoffBasis(e.target.value)} /></label>
          </>
        ) : null}
        <GovernedButton label="Assess value of information" pendingLabel="assessing" onRun={async () => {
          let sig: Information['signals']; let opts = null; let pay = null;
          try { sig = JSON.parse(signals) as Information['signals']; if (reviewId === '') { opts = JSON.parse(options); pay = JSON.parse(payoffs); } } catch { const m = 'the signals, options or payoffs are not JSON'; setProblem(m); throw new Error(m); }
          const r = await api.assess(scope, { scenarioId, packageId: packageId === '' ? null : packageId, reviewId: reviewId === '' ? null : reviewId, options: opts, payoffs: pay,
            unit: reviewId === '' ? unit : null, payoffBasis: reviewId === '' ? payoffBasis : null,
            information: { label: infoLabel.trim(), delay_days: Number(delayDays), delay_cost: Number(delayCost), signals: sig, likelihood_basis: likelihoodBasis.trim() } });
          if (!r.ok || r.data === undefined) { const m = refusal(r, 'the assessment was not answered'); setProblem(m); throw new Error(m); }
          setProblem(null); setLast(voiVerdict(r.data.assessment).text); setReceipt(r.data.receipt);
          const as = await api.assessments(scope); if (as.ok && as.data !== undefined) setAssessments(as.data.assessments);
        }} />
        {assessments.length === 0 ? <Empty>no value-of-information assessment yet</Empty> : (
          <ul aria-label="value of information assessments">{assessments.map((a) => { const v = voiVerdict(a); return (
            <li key={a.assessment_id} style={{ marginBlock: 'var(--eye-space-8)' }}>
              <span style={{ color: `var(${v.token})`, fontWeight: 650 }}><span aria-hidden="true">{v.glyph}</span> {v.text}</span>
              <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>
                {a.package_title ? `${a.package_title} · ` : ''}{a.scenario_title ?? short(a.scenario_id)} · futures {a.branches.map((b) => `${b.name} ${b.low}–${b.high} (${b.method}; weight ${b.weight})`).join(', ')} · payoffs from {a.source === 'portfolio_review' ? `review ${short(a.review_id)}` : 'an entered matrix'} · recorded {fmtInstant(a.recorded_at)}{a.item_id ? ' · routed to the package owner' : ''}
              </div>
            </li>); })}</ul>
        )}
      </section>
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
      <Receipt receipt={receipt} />
    </>
  );
}
