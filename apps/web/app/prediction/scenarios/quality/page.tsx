'use client';
/**
 * Scenario quality — CP-6 B27 part `quality` (0097 §Q; F-P4-09; AI-49-003/-004; FEX-12).
 *
 * THE MEASURES AND THE FINDINGS: the latest quality evaluation (its rule version, trigger, instant and outcome) with each finding naming
 * the branches it concerns — distinctiveness, collapse, prohibited contradiction, the temporal ordering of elements, the indicators missing
 * or stale (FAIL); coverage, bias, shared signposts, review timeliness (NOTE) — and the same measures AS OF NOW beside them. A failed
 * evaluation, like a failed coherence check, makes the scenario NOT DECISION-ACTIVE; the reasons are the server's.
 * THE INDICATOR FRESHNESS: per branch the indicator, its last observation, its cadence and the state the server judged (fresh, awaiting,
 * STALE, MISSING), with its reason in words.
 * THE PROBABILITIES: each branch's governed band with its method and basis (a frequency map's band, an elicitation record, a model run) —
 * never derived from narrative text —, the live lows' sum (a suspended branch's shown, not summed); the owner's set and withdraw.
 * THE MAPS: the domain's frequency-to-probability maps (named, versioned, owned) and the declaration of a map (or its next version).
 * Nothing here computes a finding, a freshness or a band: every value is the server's, AS OF the instant the answer states.
 */
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useShell } from '../../layout';
import { prediction, type ScenarioRow } from '../../../../lib/prediction';
import { quality, bandLine, basisLine, decisionActiveLine, findingMark, freshnessMark, ratioLine, ruleLabel, type Band, type ProbabilityMethod, type QualityFinding, type ScenarioQualityView,
  type QualityEvaluation } from '../../../../lib/quality-b27';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, GovernedButton, UnknownNote, fmtInstant, textareaStyle } from '../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 } as const;
const METHODS: ReadonlyArray<{ value: ProbabilityMethod; label: string }> = [
  { value: 'frequency_map', label: 'frequency map — the band computed from a map and an observed frequency' },
  { value: 'expert_elicitation', label: 'expert elicitation — the named experts, the question, the record' },
  { value: 'model', label: 'model — a completed simulation run' },
];
/** A datetime-local value → the instant (ISO-8601) the server takes; empty → null. */
const instantOf = (local: string): string | null => (local === '' ? null : new Date(local).toISOString());
/** "label, min, max, low, high" per line → the bands (max may be empty or "∞" for the last band); the server judges them. */
const bandsOf = (text: string): Band[] => text.split('\n').map((l) => l.trim()).filter((l) => l !== '').map((l) => {
  const [label, min, max, low, high] = l.split(',').map((x) => x.trim());
  return { frequency_label: label ?? '', min_per_year: Number(min), max_per_year: max === undefined || max === '' || max === '∞' ? null : Number(max), probability_low: Number(low), probability_high: Number(high) };
});

export default function ScenarioQualityPage() {
  return <Suspense fallback={null}><ScenarioQuality /></Suspense>;
}

function Findings({ findings, names }: { findings: QualityFinding[]; names: (id: string) => string }) {
  if (findings.length === 0) return <p style={muted}>No finding: every quality rule of this version passed and no note was raised.</p>;
  return (
    <ScrollBox label="the quality findings">
      <table className="eye-table" style={tableStyle}>
        <thead><tr><Th>Outcome</Th><Th>Rule</Th><Th>Branches</Th><Th>Detail</Th></tr></thead>
        <tbody>
          {findings.map((f, i) => {
            const m = findingMark(f.outcome);
            return (
              <tr key={`${f.rule}-${i}`}>
                <Td><span style={{ color: `var(${m.token})`, fontWeight: f.outcome === 'fail' ? 650 : 400 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span></Td>
                <Td>{ruleLabel(f.rule)}</Td>
                <Td>{f.branch_ids.length === 0 ? <span style={muted}>the scenario</span> : f.branch_ids.map(names).join(' · ')}</Td>
                <Td>{f.detail}</Td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </ScrollBox>
  );
}

function ScenarioQuality() {
  const { scope, me, isForecastOwner, isStrategyOwner } = useShell();
  const params = useSearchParams();
  const [scenarios, setScenarios] = useState<ScenarioRow[] | null>(null);
  const [scenarioId, setScenarioId] = useState<string>(params.get('scenario') ?? '');
  const [view, setView] = useState<ScenarioQualityView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [lastEvaluation, setLastEvaluation] = useState<QualityEvaluation | null>(null);
  // the probability form
  const [branchId, setBranchId] = useState('');
  const [method, setMethod] = useState<ProbabilityMethod>('frequency_map');
  const [low, setLow] = useState(''); const [high, setHigh] = useState('');
  const [mapId, setMapId] = useState(''); const [frequency, setFrequency] = useState(''); const [observation, setObservation] = useState('');
  const [experts, setExperts] = useState(''); const [question, setQuestion] = useState(''); const [elicitedAt, setElicitedAt] = useState(''); const [record, setRecord] = useState('');
  const [runId, setRunId] = useState('');
  const [withdrawReason, setWithdrawReason] = useState('');
  // the map form
  const [mapName, setMapName] = useState(''); const [mapHorizon, setMapHorizon] = useState('the next 12 months'); const [mapBands, setMapBands] = useState('');

  const loadList = async () => {
    const r = await prediction.listScenarios(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the scenarios could not be read'); return; }
    setScenarios(r.data.scenarios);
    setScenarioId((prev) => (prev === '' ? (r.data?.scenarios.find((s) => s.state === 'active')?.scenario_id ?? '') : prev));
  };
  const loadView = async () => {
    if (scenarioId === '') { setView(null); return; }
    const r = await quality.read(scope, scenarioId);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the scenario\'s quality could not be read'); return; }
    setProblem(null);
    setView(r.data);
    setBranchId((prev) => (prev === '' || !r.data!.branches.some((b) => b.branch_id === prev) ? (r.data!.branches[0]?.branch_id ?? '') : prev));
    setMapId((prev) => (prev === '' ? (r.data!.maps[0]?.map_id ?? '') : prev));
  };
  useEffect(() => { void loadList(); }, [scope]);
  useEffect(() => { void loadView(); }, [scope, scenarioId]);

  const run = (f: () => Promise<{ ok: boolean; status: number; data?: { receipt: { policyDecisionId: string; auditSeq: number } }; error?: { code: string; message: string } }>) => async () => {
    const r = await f();
    if (!r.ok || r.data === undefined) throw new Error(`HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? 'the act was refused'}`);
    setReceipt(r.data.receipt);
    await loadView();
  };

  if (problem !== null && view === null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (scenarios === null) return <Empty>reading scenarios…</Empty>;
  const names = (id: string) => view?.branches.find((b) => b.branch_id === id)?.name ?? `${id.slice(0, 8)}…`;
  const mayEvaluate = isForecastOwner || isStrategyOwner;
  const isOwner = view !== null && (view.scenario.owner === me.principalId || view.branches.some((b) => b.owner === me.principalId));
  const maySet = mayEvaluate || isOwner;
  const branch = view?.branches.find((b) => b.branch_id === branchId) ?? null;

  const basis = (): Record<string, unknown> => {
    if (method === 'frequency_map') return { frequency_per_year: Number(frequency), observation: observation.trim() };
    if (method === 'expert_elicitation') {
      const at = instantOf(elicitedAt);
      if (at === null) throw new Error('the elicitation instant is required');
      return { elicitation: { experts: experts.split(',').map((x) => x.trim()).filter((x) => x !== ''), question: question.trim(), elicited_at: at, record: record.trim() } };
    }
    return { run_id: runId.trim() };
  };

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Scenario quality</h1>
      <p style={muted}>
        The quality rules (version {view?.rule.version ?? '1'}) judge distinctiveness, collapse to one forecast, prohibited contradictions, the
        ordering of timed elements and the freshness of each branch&apos;s indicator — separately from the coherence check. A failed evaluation makes the
        scenario not decision-active. A probability is set by a named person with a method and its basis, never from the narrative.
      </p>
      <label htmlFor="qsc" style={{ display: 'block' }}>Scenario</label>
      <select id="qsc" style={inputStyle} value={scenarioId} onChange={(e) => { setScenarioId(e.target.value); setLastEvaluation(null); }}>
        <option value="">— choose a scenario —</option>
        {scenarios.map((s) => <option key={s.scenario_id} value={s.scenario_id}>{s.title} ({s.state})</option>)}
      </select>
      {problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : null}
      <Receipt receipt={receipt} />
      {view === null ? <Empty>No scenario chosen.</Empty> : (
        <>
          <section aria-labelledby="q-state" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
            <h2 id="q-state" style={h2}>{view.scenario.title}</h2>
            <p>{view.scenario.statement}</p>
            <p role="status" style={{ fontWeight: 650, color: view.decision_active.value ? 'var(--eye-color-success)' : 'var(--eye-color-critical)' }}>
              <span aria-hidden="true">{view.decision_active.value ? '●' : '⚑'}</span> {decisionActiveLine(view.decision_active)}
            </p>
            <DefinitionRow term="Quality">{view.quality_state.toUpperCase()}{view.latest === null ? ' — no evaluation recorded yet' : <> — evaluated {fmtInstant(view.latest.evaluated_at)} ({view.latest.trigger}) on version <Mono>{String(view.latest.scenario_version ?? '—')}</Mono></>}</DefinitionRow>
            <DefinitionRow term="Coherence (v1)">{view.scenario.coherence_state.toUpperCase()}</DefinitionRow>
            <DefinitionRow term="Scenario">{view.scenario.state} · version <Mono>{String(view.scenario.current_version ?? 1)}</Mono> · owner <Mono>{view.scenario.owner.slice(0, 8)}…</Mono></DefinitionRow>
            {mayEvaluate && view.scenario.state === 'active' ? (
              <GovernedButton label="Evaluate the quality now" pendingLabel="evaluating…" onRun={async () => {
                const r = await quality.evaluate(scope, view.scenario.scenario_id);
                if (!r.ok || r.data === undefined) throw new Error(`HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? 'the evaluation was refused'}`);
                setReceipt(r.data.receipt); setLastEvaluation(r.data.evaluation); await loadView();
              }} />
            ) : null}
            {lastEvaluation !== null ? (
              <LiveStatus>Recorded: {lastEvaluation.outcome.toUpperCase()}{lastEvaluation.new_failure ? ' — a new failure; the owner is notified' : ''}.</LiveStatus>
            ) : null}
          </section>

          <section aria-labelledby="q-findings" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
            <h2 id="q-findings" style={h2}>Findings</h2>
            {view.latest === null ? <p style={muted}>No evaluation is recorded; the measures below are as of now.</p> : (
              <>
                <p style={small}>The latest evaluation — {view.latest.outcome.toUpperCase()} under rule version {view.latest.rule_version}:</p>
                <Findings findings={view.latest.findings} names={names} />
              </>
            )}
            <p style={small}>As of {fmtInstant(view.at)} — {view.live.outcome.toUpperCase()}:</p>
            <Findings findings={view.live.findings} names={names} />
          </section>

          <section aria-labelledby="q-measures" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
            <h2 id="q-measures" style={h2}>Measures</h2>
            <DefinitionRow term="Live branches">{view.live.measures.live_branches} ({view.live.measures.suspended_branches} suspended, not judged)</DefinitionRow>
            <DefinitionRow term="Assumption coverage">{view.live.measures.assumption_coverage.with_assumption} of {view.live.measures.assumption_coverage.live} — {ratioLine(view.live.measures.assumption_coverage.ratio)}</DefinitionRow>
            <DefinitionRow term="Branch diversity">{view.live.measures.branch_diversity.kinds} kind(s) over {view.live.measures.branch_diversity.live} branch(es) — {ratioLine(view.live.measures.branch_diversity.ratio)}</DefinitionRow>
            <DefinitionRow term="Signpost discrimination">{view.live.measures.signpost_discrimination.distinct_indicators} indicator(s) over {view.live.measures.signpost_discrimination.branches_with_indicator} watched branch(es) — {ratioLine(view.live.measures.signpost_discrimination.ratio)}</DefinitionRow>
            <DefinitionRow term="Coverage">present {view.live.measures.coverage.present.join(', ') || 'none'}{view.live.measures.coverage.missing.length > 0 ? <> · <strong>missing {view.live.measures.coverage.missing.join(', ')}</strong></> : null}</DefinitionRow>
            <DefinitionRow term="Bias">{view.live.measures.bias === null ? 'none noted' : view.live.measures.bias.replace('_', ' ')}</DefinitionRow>
            <DefinitionRow term="Review">{view.live.measures.review_timeliness.next_review_due_at === null ? 'no review due' : <>due {fmtInstant(view.live.measures.review_timeliness.next_review_due_at)}{view.live.measures.review_timeliness.overdue ? <strong> — OVERDUE</strong> : null}</>}</DefinitionRow>
          </section>

          <section aria-labelledby="q-fresh" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
            <h2 id="q-fresh" style={h2}>Indicator freshness</h2>
            <p style={small}>{view.live.measures.indicators.missing} missing · {view.live.measures.indicators.stale} stale. An indicator is stale when its last observation is older than its cadence (consecutive days × the series step) plus {String((view.rule['params'] as Record<string, unknown> | undefined)?.['freshness_grace_days'] ?? 7)} days; a branch that needs a signpost and names none is missing.</p>
            <ScrollBox label="indicator freshness by branch">
              <table className="eye-table" style={tableStyle}>
                <thead><tr><Th>Branch</Th><Th>Kind</Th><Th>Indicator</Th><Th>Last observation</Th><Th>Cadence</Th><Th>Freshness</Th><Th>Reason</Th></tr></thead>
                <tbody>
                  {view.live.measures.indicator_freshness.map((f) => {
                    const m = freshnessMark(f.state);
                    return (
                      <tr key={f.branch_id}>
                        <Td>{f.name}{f.live ? null : <span style={muted}> ({f.branch_state})</span>}</Td>
                        <Td>{f.kind}</Td>
                        <Td>{f.indicator_id === null ? <span style={muted}>none</span> : <><Mono>{f.series_key ?? ''}</Mono> <Mono>{f.indicator_id.slice(0, 8)}…</Mono></>}</Td>
                        <Td>{f.last_observation_at ?? '—'}</Td>
                        <Td>{f.cadence_days === null ? '—' : `${f.cadence_days} d (max age ${String(f.max_age_days)} d)`}</Td>
                        <Td><span style={{ color: `var(${m.token})`, fontWeight: f.state === 'stale' || f.state === 'missing' ? 650 : 400 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span></Td>
                        <Td>{f.reason}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </ScrollBox>
          </section>

          <section aria-labelledby="q-prob" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
            <h2 id="q-prob" style={h2}>Branch probabilities</h2>
            <p style={small}>The live branches&apos; lows sum to {bandLine(view.probability_sum.live_low, view.probability_sum.live_low)} (at most 100%); {view.probability_sum.not_summed} suspended branch probability(ies) shown, not summed.</p>
            <ScrollBox label="the governed probabilities by branch">
              <table className="eye-table" style={tableStyle}>
                <thead><tr><Th>Branch</Th><Th>State</Th><Th>Band</Th><Th>Method and basis</Th><Th>Set by</Th></tr></thead>
                <tbody>
                  {view.branches.map((b) => (
                    <tr key={b.branch_id}>
                      <Td>{b.name} <span style={muted}>({b.kind_label ?? b.kind})</span></Td>
                      <Td>{b.state}{b.live ? null : <span style={muted}> — not summed</span>}</Td>
                      <Td>{b.probability === null ? <span style={muted}>none set</span> : <strong>{bandLine(Number(b.probability.probability_low), Number(b.probability.probability_high))}</strong>}</Td>
                      <Td>{b.probability === null ? '—' : basisLine(b.probability.method, b.probability.basis)}</Td>
                      <Td>{b.probability === null ? '—' : <><Mono>{b.probability.set_by.slice(0, 8)}…</Mono> {fmtInstant(b.probability.set_at)}</>}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollBox>
            {maySet ? (
              <form aria-labelledby="q-prob-set" onSubmit={(e) => e.preventDefault()} style={{ marginBlockStart: 'var(--eye-space-12)' }}>
                <h3 id="q-prob-set" style={{ fontSize: 'var(--eye-type-heading-3)' }}>Set or withdraw a probability</h3>
                <label htmlFor="qp-branch" style={{ display: 'block' }}>Branch</label>
                <select id="qp-branch" style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
                  {view.branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.name} ({b.state})</option>)}
                </select>
                <label htmlFor="qp-method" style={{ display: 'block' }}>Method</label>
                <select id="qp-method" style={inputStyle} value={method} onChange={(e) => setMethod(e.target.value as ProbabilityMethod)}>
                  {METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
                {method === 'frequency_map' ? (
                  <>
                    <label htmlFor="qp-map" style={{ display: 'block' }}>Map</label>
                    <select id="qp-map" style={inputStyle} value={mapId} onChange={(e) => setMapId(e.target.value)}>
                      <option value="">— choose a map —</option>
                      {view.maps.map((m) => <option key={m.map_id} value={m.map_id}>{m.name} v{m.version} ({m.horizon})</option>)}
                    </select>
                    <label htmlFor="qp-freq" style={{ display: 'block' }}>Observed frequency per year</label>
                    <input id="qp-freq" style={inputStyle} inputMode="decimal" value={frequency} onChange={(e) => setFrequency(e.target.value)} />
                    <label htmlFor="qp-obs" style={{ display: 'block' }}>Where the frequency was observed</label>
                    <input id="qp-obs" style={inputStyle} value={observation} onChange={(e) => setObservation(e.target.value)} />
                  </>
                ) : (
                  <>
                    <label htmlFor="qp-low" style={{ display: 'block' }}>Low (0–1)</label>
                    <input id="qp-low" style={inputStyle} inputMode="decimal" value={low} onChange={(e) => setLow(e.target.value)} />
                    <label htmlFor="qp-high" style={{ display: 'block' }}>High (0–1)</label>
                    <input id="qp-high" style={inputStyle} inputMode="decimal" value={high} onChange={(e) => setHigh(e.target.value)} />
                  </>
                )}
                {method === 'expert_elicitation' ? (
                  <>
                    <label htmlFor="qp-experts" style={{ display: 'block' }}>Experts (comma-separated names)</label>
                    <input id="qp-experts" style={inputStyle} value={experts} onChange={(e) => setExperts(e.target.value)} />
                    <label htmlFor="qp-question" style={{ display: 'block' }}>Question put to them</label>
                    <input id="qp-question" style={inputStyle} value={question} onChange={(e) => setQuestion(e.target.value)} />
                    <label htmlFor="qp-at" style={{ display: 'block' }}>Elicited at</label>
                    <input id="qp-at" type="datetime-local" style={inputStyle} value={elicitedAt} onChange={(e) => setElicitedAt(e.target.value)} />
                    <label htmlFor="qp-record" style={{ display: 'block' }}>The elicitation record</label>
                    <textarea id="qp-record" style={textareaStyle} value={record} onChange={(e) => setRecord(e.target.value)} />
                  </>
                ) : null}
                {method === 'model' ? (
                  <>
                    <label htmlFor="qp-run" style={{ display: 'block' }}>Simulation run id</label>
                    <input id="qp-run" style={inputStyle} value={runId} onChange={(e) => setRunId(e.target.value)} />
                  </>
                ) : null}
                <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                  <GovernedButton label="Set the probability" pendingLabel="setting…" disabled={branch === null} onRun={run(() => quality.setProbability(scope, branchId, {
                    method, basis: basis(), mapId: method === 'frequency_map' ? (mapId === '' ? null : mapId) : null,
                    low: method === 'frequency_map' ? null : Number(low), high: method === 'frequency_map' ? null : Number(high),
                  }))} />
                </div>
                <label htmlFor="qp-reason" style={{ display: 'block', marginBlockStart: 'var(--eye-space-8)' }}>Reason to withdraw</label>
                <input id="qp-reason" style={inputStyle} value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)} />
                <GovernedButton label="Withdraw the probability" pendingLabel="withdrawing…" variant="critical" disabled={branch === null || branch.probability === null}
                  onRun={run(() => quality.withdrawProbability(scope, branchId, withdrawReason.trim()))} />
              </form>
            ) : <UnknownNote>A probability is set or withdrawn by the scenario&apos;s owner, the branch&apos;s owner or an administrator.</UnknownNote>}
          </section>

          <section aria-labelledby="q-maps" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
            <h2 id="q-maps" style={h2}>Frequency-to-probability maps</h2>
            {view.maps.length === 0 ? <p style={muted}>No map is declared in this domain.</p> : view.maps.map((m) => (
              <div key={m.map_id} style={{ marginBlockEnd: 'var(--eye-space-12)' }}>
                <p style={{ fontWeight: 650 }}>{m.name} — version {m.version} · {m.horizon} · declared {fmtInstant(m.declared_at)}</p>
                <table className="eye-table" style={tableStyle}>
                  <thead><tr><Th>Frequency</Th><Th>Per year</Th><Th>Probability</Th></tr></thead>
                  <tbody>{m.bands.map((b) => (
                    <tr key={b.frequency_label}><Td>{b.frequency_label}</Td><Td>{b.min_per_year} to {b.max_per_year === null ? '∞' : b.max_per_year}</Td><Td>{bandLine(b.probability_low, b.probability_high)}</Td></tr>
                  ))}</tbody>
                </table>
              </div>
            ))}
            {maySet ? (
              <form aria-labelledby="q-map-declare" onSubmit={(e) => e.preventDefault()}>
                <h3 id="q-map-declare" style={{ fontSize: 'var(--eye-type-heading-3)' }}>Declare a map (or the next version of one)</h3>
                <label htmlFor="qm-name" style={{ display: 'block' }}>Name</label>
                <input id="qm-name" style={inputStyle} value={mapName} onChange={(e) => setMapName(e.target.value)} />
                <label htmlFor="qm-horizon" style={{ display: 'block' }}>Horizon</label>
                <input id="qm-horizon" style={inputStyle} value={mapHorizon} onChange={(e) => setMapHorizon(e.target.value)} />
                <label htmlFor="qm-bands" style={{ display: 'block' }}>Bands — one per line: label, min per year, max per year (empty for the last), low, high</label>
                <textarea id="qm-bands" style={textareaStyle} value={mapBands} onChange={(e) => setMapBands(e.target.value)} />
                <GovernedButton label="Declare the map" pendingLabel="declaring…" onRun={run(() => quality.declareMap(scope, { name: mapName.trim(), horizon: mapHorizon.trim(), bands: bandsOf(mapBands) }))} />
              </form>
            ) : null}
          </section>

          <section aria-labelledby="q-history" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
            <h2 id="q-history" style={h2}>Evaluations</h2>
            {view.evaluations.length === 0 ? <p style={muted}>None recorded.</p> : (
              <ul>{view.evaluations.map((e) => (
                <li key={e.evaluation_id}>{fmtInstant(e.evaluated_at)} — {e.outcome.toUpperCase()} ({e.trigger}, version {String(e.scenario_version ?? '—')}){e.new_failure ? ' — a new failure; the owner was notified' : ''}</li>
              ))}</ul>
            )}
          </section>
        </>
      )}
    </>
  );
}
