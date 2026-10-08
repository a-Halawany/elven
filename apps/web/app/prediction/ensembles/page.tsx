'use client';
/**
 * Ensembles — CP-6 B25 part `ensembles` (0108 §EN; F-P4-02; L6-C04, V00-T-053, V03-T-129, V03-T-132, V03-T-326, V03-T-327, PER-07).
 *
 * THE RUN: the manager's state (admitted → running → completed | failed), its ledger, attempts and budget, the owner every escalation reaches.
 * THE MEMBERS: each method's own distribution as issued, its validation, the assumptions it is tied to, its weight — inspectable one by one.
 * THE ENSEMBLE: the combined distribution (MODEL OUTPUT) under its declared, versioned combination rule.
 * THE DISAGREEMENT: the level the server measured, the pair that drives it and THE ASSUMPTIONS THAT SPLIT THE MEMBERS — never hidden.
 * THE EXCLUDED PATHS: every planned method the ensemble lost, with why.
 * THE JUDGEMENT: a named forecast owner's overlay, labelled JUDGEMENT, versioned apart from the model's distribution which stays beside it.
 * Nothing here combines, measures or judges: every value is the server's.
 */
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useShell } from '../layout';
import { prediction, type SeriesRow } from '../../../lib/prediction';
import { graph, type StrategyRow } from '../../../lib/graph';
import { ensembles, disagreementMark, exclusionLine, overlayLine, pinLine, quantileLine, routeLine, runStateMark, semanticsLine, splitLine, weightLine, type EnsemblePackage, type Quantiles, type RunSummary } from '../../../lib/ensembles-b25';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, GovernedButton, UnknownNote, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 } as const;
const HORIZONS = ['30d', '90d', '180d', '1y', '3y', '5y'] as const;
/** A datetime-local value → the instant (ISO-8601) the server takes; empty → null (the server's now). */
const instantOf = (local: string): string | null => (local === '' ? null : new Date(local).toISOString());
const fail = (r: { ok: boolean; status: number; error?: { code: string; message: string } }, what: string): never => {
  throw new Error(`HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? what}`);
};

export default function EnsemblesPage() {
  return <Suspense fallback={null}><Ensembles /></Suspense>;
}

function Mark({ m }: { m: { glyph: string; token: string; text: string } }) {
  return <span style={{ color: `var(${m.token})`, fontWeight: 650 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}

function Ensembles() {
  const { scope, isForecastOwner } = useShell();
  const params = useSearchParams();
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [runId, setRunId] = useState<string>(params.get('run') ?? '');
  const [pkg, setPkg] = useState<EnsemblePackage | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [asus, setAsus] = useState<StrategyRow[]>([]);
  // the issue form
  const [seriesKey, setSeriesKey] = useState(''); const [horizon, setHorizon] = useState<string>('30d');
  const [observedThrough, setObservedThrough] = useState(''); const [cutoff, setCutoff] = useState('');
  const [shared, setShared] = useState(''); const [tieSn, setTieSn] = useState(''); const [tieHw, setTieHw] = useState('');
  const [combination, setCombination] = useState<'linear_pool@1' | 'quantile_average@1'>('linear_pool@1'); const [weighting, setWeighting] = useState<'equal' | 'skill'>('equal');
  // the overlay form
  const [oq10, setOq10] = useState(''); const [oq50, setOq50] = useState(''); const [oq90, setOq90] = useState('');
  const [rationale, setRationale] = useState(''); const [evidenceAsu, setEvidenceAsu] = useState(''); const [withdrawReason, setWithdrawReason] = useState('');

  const loadList = async () => {
    const r = await ensembles.list(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the ensemble runs could not be read'); return; }
    setRuns(r.data.runs);
    setRunId((prev) => (prev === '' ? (r.data?.runs[0]?.run_id ?? '') : prev));
  };
  const loadRun = async () => {
    if (runId === '') { setPkg(null); return; }
    const r = await ensembles.read(scope, runId);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the ensemble could not be read'); return; }
    setProblem(null); setPkg(r.data.ensemble);
  };
  useEffect(() => {
    void loadList();
    void prediction.listSeries(scope).then((r) => { if (r.ok && r.data !== undefined) { setSeries(r.data.series); setSeriesKey((p) => (p === '' ? (r.data?.series[0]?.series_key ?? '') : p)); } });
    void graph.listStrategy(scope).then((r) => { if (r.ok && r.data !== undefined) setAsus(r.data.strategy.filter((s) => s.object_type === 'ASU' && s.status === 'active')); });
  }, [scope]);
  useEffect(() => { void loadRun(); }, [scope, runId]);

  if (runs === null) return problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : <Empty>reading ensembles…</Empty>;
  const unit = series.find((s) => s.series_key === pkg?.run.series_key)?.unit ?? '';
  const title = (id: string) => asus.find((a) => a.strategy_object_id === id)?.title ?? `${id.slice(0, 8)}…`;
  const ensembleId = pkg?.ensemble?.forecast_id ?? null;
  const standing = pkg?.standing_overlay ?? null;
  const overlayInput = () => ({
    adjustment: { kind: 'quantiles', q10: Number(oq10), q50: Number(oq50), q90: Number(oq90) }, rationale: rationale.trim(),
    evidence: evidenceAsu === '' ? [] : [{ kind: 'strategy' as const, id: evidenceAsu }],
  });

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Ensembles</h1>
      <p style={muted}>
        An ensemble combines the methods the router planned for a question, each member tied to the assumptions it rests on. Every member&apos;s
        distribution stays inspectable; the disagreement between them is measured and stated with the assumptions that split them; a method path
        that could not take part is excluded and disclosed; a forecast owner&apos;s judgement is shown as JUDGEMENT beside the model&apos;s output, never in its place.
      </p>
      <label htmlFor="en-run" style={{ display: 'block' }}>Run</label>
      <select id="en-run" style={inputStyle} value={runId} onChange={(e) => setRunId(e.target.value)}>
        <option value="">— choose a run —</option>
        {runs.map((r) => <option key={r.run_id} value={r.run_id}>{r.series_key} · {r.horizon_code} · {r.state} · {fmtInstant(r.admitted_at)}</option>)}
      </select>
      {problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : null}
      <Receipt receipt={receipt} />

      {pkg === null ? <Empty>No run chosen.</Empty> : (
        <>
          <section aria-labelledby="en-state" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
            <h2 id="en-state" style={h2}>{pkg.run.series_key} at {pkg.run.horizon_code}</h2>
            <p role="status"><Mark m={runStateMark(pkg.run.state)} />{pkg.run.state_reason === null ? null : <> — {pkg.run.state_reason}</>}</p>
            <DefinitionRow term="Combination">{pkg.run.combination_rule} · {String(pkg.run.outcome?.['weighting_used'] ?? pkg.run.weighting)} weights</DefinitionRow>
            <DefinitionRow term="Cut-off">{fmtInstant(pkg.run.known_at)}{pkg.run.observed_through === null ? null : <> · observed through {String(pkg.run.observed_through).slice(0, 10)}</>} · {pkg.run.label}</DefinitionRow>
            <DefinitionRow term="Budget">{pkg.run.budget.members} member(s) · {pkg.run.budget.attempts} attempt(s) each · {pkg.run.budget.compute_ms} ms</DefinitionRow>
            <DefinitionRow term="Owner">the forecast owner <Mono>{pkg.run.owner_principal_id.slice(0, 8)}…</Mono>{pkg.run.escalation === null ? null : <> — ESCALATED ({pkg.run.escalation.channel === 'attention_item' ? 'attention item' : 'recorded on the run\'s ledger'}): {pkg.run.escalation.reason}</>}</DefinitionRow>
            {(pkg.run.state === 'admitted' || pkg.run.state === 'running') && isForecastOwner ? (
              <GovernedButton label="Resume the run" pendingLabel="resuming…" onRun={async () => {
                const r = await ensembles.resume(scope, pkg.run.run_id);
                if (!r.ok || r.data === undefined) fail(r, 'the resume was refused');
                setPkg(r.data!.ensemble); await loadList();
              }} />
            ) : null}
          </section>

          <section aria-labelledby="en-ensemble" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
            <h2 id="en-ensemble" style={h2}>The ensemble — MODEL OUTPUT</h2>
            {pkg.ensemble === null ? <p style={muted}>No ensemble forecast was issued under this run.</p> : (
              <>
                <p style={{ fontWeight: 650 }}>{quantileLine(pkg.ensemble.quantiles, unit)}</p>
                <p>{pkg.ensemble.statement}</p>
                <DefinitionRow term="Validation">{pkg.ensemble.validation_state.replace(/_/g, ' ')}</DefinitionRow>
                <DefinitionRow term="Forecast">{pkg.ensemble.state} · <Mono>{pkg.ensemble.forecast_id.slice(0, 8)}…</Mono>{typeof pkg.ensemble['superseded_by'] === 'string' ? <> — superseded by <Mono>{String(pkg.ensemble['superseded_by']).slice(0, 8)}…</Mono></> : null}</DefinitionRow>
              </>
            )}
          </section>

          <section aria-labelledby="en-members" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
            <h2 id="en-members" style={h2}>Members</h2>
            <ScrollBox label="the ensemble's members">
              <table className="eye-table" style={tableStyle} aria-label="the ensemble's members">
                <thead><tr><Th>#</Th><Th>Method</Th><Th>Distribution</Th><Th>Weight</Th><Th>Tied to</Th><Th>Validation</Th><Th>What it forecasts</Th><Th>Pins</Th><Th>State</Th></tr></thead>
                <tbody>
                  {pkg.members.map((m) => (
                    <tr key={m.ordinal}>
                      <Td>{m.ordinal}</Td>
                      <Td><Mono>{m.method_ref}</Mono> <span style={muted}>({m.family})</span></Td>
                      <Td>{m.state === 'issued' ? quantileLine(m.quantiles as Quantiles, unit) : <span style={muted}>—</span>}</Td>
                      <Td>{weightLine(m.weight)}</Td>
                      <Td>{m.tied_assumptions.length === 0 ? <span style={muted}>the shared assumptions only</span> : m.tied_assumptions.map(title).join('; ')}</Td>
                      <Td>{m.validation_state === null ? '—' : m.validation_state.replace(/_/g, ' ')}</Td>
                      <Td>{m.state === 'issued' ? semanticsLine(m.outcome_spec?.semantics) : <span style={muted}>—</span>}</Td>
                      <Td>{m.state === 'issued' ? <span style={small}>{pinLine(m)}</span> : <span style={muted}>—</span>}</Td>
                      <Td>{m.state === 'excluded' ? <strong>EXCLUDED</strong> : m.state}{m.attempts > 1 ? <span style={muted}> ({m.attempts} attempts)</span> : null}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollBox>
          </section>

          <section aria-labelledby="en-route" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
            <h2 id="en-route" style={h2}>The route</h2>
            {(pkg.routes ?? []).length === 0 ? <p style={muted}>No route was recorded for this run (planned without the registry router).</p>
              : <ul aria-label="the run's routes">{(pkg.routes ?? []).map((r) => <li key={r.route_id}>{routeLine(r)}</li>)}</ul>}
            {isForecastOwner && (pkg.run.state === 'completed' || pkg.run.state === 'failed') && (pkg.routes ?? []).some((r) => r.outcome === 'planned') ? (
              <GovernedButton label="Reconcile the route" pendingLabel="reconciling…" onRun={async () => {
                const r = await ensembles.reconcileRoute(scope, pkg.run.run_id);
                if (!r.ok || r.data === undefined) fail(r, 'the reconciliation was refused');
                setReceipt(r.data!.receipt); await loadRun();
              }} />
            ) : null}
          </section>

          <section aria-labelledby="en-disagreement" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
            <h2 id="en-disagreement" style={h2}>Disagreement</h2>
            {pkg.disagreement === null ? <p style={muted}>Not measured: the run issued no ensemble.</p> : (
              <>
                <p role="status"><Mark m={disagreementMark(pkg.disagreement.level)} /> — max gap ratio {pkg.disagreement.max_gap_ratio}, min overlap {pkg.disagreement.min_overlap} ({pkg.disagreement.rule}, measured by the server)</p>
                {pkg.disagreement.analysis === null ? null : (
                  <>
                    <DefinitionRow term="What splits them">{splitLine(pkg.disagreement.analysis.splitting_assumptions)}</DefinitionRow>
                    <DefinitionRow term="The methods' own">{pkg.disagreement.analysis.structural.map((s) => `${s.method_ref}: ${s.assumption}`).join(' · ') || '—'}</DefinitionRow>
                    <p style={small}>{pkg.disagreement.analysis.statement}</p>
                  </>
                )}
              </>
            )}
          </section>

          <section aria-labelledby="en-excluded" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
            <h2 id="en-excluded" style={h2}>Excluded method paths</h2>
            {pkg.excluded_models.length === 0 ? <p style={muted}>No planned method path was lost.</p>
              : <ul aria-label="the excluded method paths">{pkg.excluded_models.map((x) => <li key={x.ordinal}>{exclusionLine(x)}</li>)}</ul>}
          </section>

          <section aria-labelledby="en-judgement" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
            <h2 id="en-judgement" style={h2}>Judgement overlay</h2>
            {pkg.ensemble !== null ? <p style={small}>The model&apos;s own distribution, unchanged by any judgement: {quantileLine(pkg.ensemble.quantiles, unit)} (MODEL OUTPUT).</p> : null}
            {pkg.overlays.length === 0 ? <p style={muted}>No judgement is laid over this ensemble.</p> : (
              <ul aria-label="the judgement overlays">{pkg.overlays.map((o) => (
                <li key={`${o.overlay_id}-${o.version}`}>
                  <strong>{overlayLine(o)}</strong> — {o.author_name ?? <Mono>{o.author_principal_id.slice(0, 8)}…</Mono>}, {fmtInstant(o.created_at)}: {o.rationale}
                  {o.state === 'withdrawn' ? <> — withdrawn: {o.withdrawal_reason}</> : null}
                </li>
              ))}</ul>
            )}
            {isForecastOwner && ensembleId !== null && pkg.ensemble?.state === 'issued' ? (
              <form aria-labelledby="en-judgement-form" onSubmit={(e) => e.preventDefault()} style={{ marginBlockStart: 'var(--eye-space-12)' }}>
                <h3 id="en-judgement-form" style={{ fontSize: 'var(--eye-type-heading-3)' }}>{standing === null ? 'Add a judgement' : `Revise the judgement (version ${standing.version})`}</h3>
                <label htmlFor="ov-q10" style={{ display: 'block' }}>Judged 10% quantile</label>
                <input id="ov-q10" style={inputStyle} inputMode="decimal" value={oq10} onChange={(e) => setOq10(e.target.value)} />
                <label htmlFor="ov-q50" style={{ display: 'block' }}>Judged median</label>
                <input id="ov-q50" style={inputStyle} inputMode="decimal" value={oq50} onChange={(e) => setOq50(e.target.value)} />
                <label htmlFor="ov-q90" style={{ display: 'block' }}>Judged 90% quantile</label>
                <input id="ov-q90" style={inputStyle} inputMode="decimal" value={oq90} onChange={(e) => setOq90(e.target.value)} />
                <label htmlFor="ov-rationale" style={{ display: 'block' }}>Rationale</label>
                <textarea id="ov-rationale" style={textareaStyle} value={rationale} onChange={(e) => setRationale(e.target.value)} />
                <label htmlFor="ov-evidence" style={{ display: 'block' }}>The assumption it rests on</label>
                <select id="ov-evidence" style={inputStyle} value={evidenceAsu} onChange={(e) => setEvidenceAsu(e.target.value)}>
                  <option value="">— choose —</option>
                  {asus.map((a) => <option key={a.strategy_object_id} value={a.strategy_object_id}>{a.title}</option>)}
                </select>
                <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                  <GovernedButton label={standing === null ? 'Add the judgement' : 'Revise the judgement'} pendingLabel="recording…" onRun={async () => {
                    const r = standing === null ? await ensembles.addOverlay(scope, ensembleId, overlayInput())
                      : await ensembles.reviseOverlay(scope, ensembleId, standing.overlay_id, { ...overlayInput(), expectedVersion: standing.version });
                    if (!r.ok || r.data === undefined) fail(r, 'the judgement was refused');
                    setReceipt(r.data!.receipt); await loadRun();
                  }} />
                </div>
                {standing !== null ? (
                  <>
                    <label htmlFor="ov-withdraw" style={{ display: 'block', marginBlockStart: 'var(--eye-space-8)' }}>Reason to withdraw</label>
                    <input id="ov-withdraw" style={inputStyle} value={withdrawReason} onChange={(e) => setWithdrawReason(e.target.value)} />
                    <GovernedButton label="Withdraw the judgement" pendingLabel="withdrawing…" variant="critical" onRun={async () => {
                      const r = await ensembles.withdrawOverlay(scope, ensembleId, standing.overlay_id, withdrawReason.trim());
                      if (!r.ok || r.data === undefined) fail(r, 'the withdrawal was refused');
                      setReceipt(r.data!.receipt); await loadRun();
                    }} />
                  </>
                ) : null}
              </form>
            ) : <UnknownNote>A judgement is laid, revised or withdrawn by a named forecast owner on an issued forecast; an agent never authors one.</UnknownNote>}
          </section>

          <section aria-labelledby="en-ledger" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
            <h2 id="en-ledger" style={h2}>The run&apos;s ledger</h2>
            <ul aria-label="the run's events">{pkg.events.map((e) => <li key={e.event_id}>{fmtInstant(e.occurred_at)} — {e.event}</li>)}</ul>
            <p style={small}>{pkg.attempts.length} attempt(s): {pkg.attempts.map((a) => `${a.method_ref} #${a.attempt} ${a.outcome}${a.error === null ? '' : ` (${a.error})`}`).join('; ') || 'none recorded'}</p>
          </section>
        </>
      )}

      {isForecastOwner ? (
        <section aria-labelledby="en-issue" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="en-issue" style={h2}>Issue an ensemble</h2>
          <form onSubmit={(e) => e.preventDefault()}>
            <label htmlFor="ei-series" style={{ display: 'block' }}>Series</label>
            <select id="ei-series" style={inputStyle} value={seriesKey} onChange={(e) => setSeriesKey(e.target.value)}>
              {series.map((s) => <option key={s.series_key} value={s.series_key}>{s.series_key} ({s.unit})</option>)}
            </select>
            <label htmlFor="ei-horizon" style={{ display: 'block' }}>Horizon</label>
            <select id="ei-horizon" style={inputStyle} value={horizon} onChange={(e) => setHorizon(e.target.value)}>
              {HORIZONS.map((h) => <option key={h} value={h}>{h}</option>)}
            </select>
            <label htmlFor="ei-through" style={{ display: 'block' }}>Observed through (a day; empty: everything known)</label>
            <input id="ei-through" type="date" style={inputStyle} value={observedThrough} onChange={(e) => setObservedThrough(e.target.value)} />
            <label htmlFor="ei-cutoff" style={{ display: 'block' }}>Cut-off (empty: now)</label>
            <input id="ei-cutoff" type="datetime-local" style={inputStyle} value={cutoff} onChange={(e) => setCutoff(e.target.value)} />
            <label htmlFor="ei-shared" style={{ display: 'block' }}>The assumption every member rests on</label>
            <select id="ei-shared" style={inputStyle} value={shared} onChange={(e) => setShared(e.target.value)}>
              <option value="">— choose —</option>
              {asus.map((a) => <option key={a.strategy_object_id} value={a.strategy_object_id}>{a.title}</option>)}
            </select>
            <label htmlFor="ei-tie-sn" style={{ display: 'block' }}>Seasonal naive is tied to</label>
            <select id="ei-tie-sn" style={inputStyle} value={tieSn} onChange={(e) => setTieSn(e.target.value)}>
              <option value="">— the shared assumption only —</option>
              {asus.map((a) => <option key={a.strategy_object_id} value={a.strategy_object_id}>{a.title}</option>)}
            </select>
            <label htmlFor="ei-tie-hw" style={{ display: 'block' }}>Holt-Winters is tied to</label>
            <select id="ei-tie-hw" style={inputStyle} value={tieHw} onChange={(e) => setTieHw(e.target.value)}>
              <option value="">— the shared assumption only —</option>
              {asus.map((a) => <option key={a.strategy_object_id} value={a.strategy_object_id}>{a.title}</option>)}
            </select>
            <label htmlFor="ei-combination" style={{ display: 'block' }}>Combination rule</label>
            <select id="ei-combination" style={inputStyle} value={combination} onChange={(e) => setCombination(e.target.value as 'linear_pool@1' | 'quantile_average@1')}>
              <option value="linear_pool@1">linear_pool@1 — the members mixed (keeps their disagreement)</option>
              <option value="quantile_average@1">quantile_average@1 — the quantiles averaged (refused when more precise than the members agree)</option>
            </select>
            <label htmlFor="ei-weighting" style={{ display: 'block' }}>Weighting</label>
            <select id="ei-weighting" style={inputStyle} value={weighting} onChange={(e) => setWeighting(e.target.value as 'equal' | 'skill')}>
              <option value="equal">equal</option>
              <option value="skill">skill — by each member&apos;s backtest pinball (equal when a member has none)</option>
            </select>
            <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
              <GovernedButton label="Issue the ensemble" pendingLabel="issuing…" disabled={seriesKey === '' || shared === ''} onRun={async () => {
                // a tie is sent only when chosen: an untied member rests on the shared assumption, whatever the router plans
                const members = [...(tieSn === '' ? [] : [{ methodRef: 'seasonal_naive@1', assumptions: [tieSn] }]), ...(tieHw === '' ? [] : [{ methodRef: 'holt_winters@1', assumptions: [tieHw] }])];
                const r = await ensembles.issue(scope, { seriesKey, horizon, observedThrough: observedThrough === '' ? null : observedThrough, knownAt: instantOf(cutoff),
                  assumptions: [shared], members, combination, weighting });
                if (!r.ok || r.data === undefined) fail(r, 'the ensemble was refused');
                setPkg(r.data!.ensemble); setRunId(r.data!.ensemble.run.run_id); await loadList();
              }} />
            </div>
          </form>
        </section>
      ) : null}
    </>
  );
}
