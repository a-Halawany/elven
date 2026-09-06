'use client';
/**
 * Forecasts — the distribution, the drivers, the assumptions, and the evidence
 * under every one of them.
 *
 * WHAT A FORECAST IS ALLOWED TO CLAIM IS ON SCREEN BEFORE ITS NUMBER. The
 * validation state and the label come first, verbatim from the record; the
 * band is shown as a band, never as a point; and "Source: ECB statistics." (or
 * whatever the publisher requires) is rendered wherever a value from that
 * publisher appears.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { prediction, type ForecastRow, type SeriesRow } from '../../../lib/prediction';
import { graph, type StrategyRow } from '../../../lib/graph';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

export function ValidationBadge({ state, label }: { state: ForecastRow['validation_state']; label: ForecastRow['label'] }) {
  const map: Record<string, { glyph: string; token: string; text: string }> = {
    validated: { glyph: '●', token: '--eye-color-success', text: 'VALIDATED — backtested under historical knowledge on the history it was fitted on' },
    validated_retrospective: { glyph: '◐', token: '--eye-color-warning', text: 'VALIDATED RETROSPECTIVELY — one evidence vintage cut by publisher date; not historical-knowledge validation' },
    unvalidated: { glyph: '◍', token: '--eye-color-warning', text: 'UNVALIDATED — no applicable backtest has scored it' },
    validation_impossible: { glyph: '✕', token: '--eye-color-critical', text: 'CANNOT BE VALIDATED — history too short' },
  };
  const v = map[state] ?? (map['unvalidated'] as { glyph: string; token: string; text: string });
  return (
    <span style={{ display: 'inline-flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'baseline', fontSize: 'var(--eye-type-label-sm)' }}>
      <span style={{ color: `var(${v.token})` }}><span aria-hidden="true">{v.glyph}</span> {v.text}</span>
      <span style={{ color: label === 'live' ? 'var(--eye-color-ink-muted)' : 'var(--eye-color-warning)', fontWeight: 650 }}>
        {label === 'live' ? 'live' : 'REPLAY DEMONSTRATION'}
      </span>
    </span>
  );
}

/** The controls a derived object inherited from its evidence — shown before its number, never after. */
export function ControlsLine({ controls }: { controls: { synthetic_state: boolean; classification: string; rights_profile: string | null;
  residency_profile: string | null; retention_profile: string | null; inputs?: number } | null | undefined }) {
  if (controls === null || controls === undefined) return <span style={{ color: 'var(--eye-color-ink-muted)' }}>controls not recorded (issued before they were inherited)</span>;
  return (
    <span style={{ fontSize: 'var(--eye-type-label-sm)' }}>
      {controls.synthetic_state ? <strong style={{ color: 'var(--eye-color-critical)' }}>SYNTHETIC · </strong> : null}
      classification <Mono>{controls.classification}</Mono>
      {controls.rights_profile === null ? null : <> · rights <Mono>{controls.rights_profile}</Mono></>}
      {controls.residency_profile === null ? null : <> · residency <Mono>{controls.residency_profile}</Mono></>}
      {controls.retention_profile === null ? null : <> · retention <Mono>{controls.retention_profile}</Mono></>}
    </span>
  );
}

const num = (v: unknown): string => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(3).replace(/\.?0+$/, '') : '—'; };
const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : String(v ?? '—').slice(0, 10));

export default function ForecastsPage() {
  const { scope, isForecastOwner } = useShell();
  const [rows, setRows] = useState<ForecastRow[] | null>(null);
  const [series, setSeries] = useState<SeriesRow[]>([]);
  const [assumptions, setAssumptions] = useState<StrategyRow[]>([]);
  const [open, setOpen] = useState<ForecastRow | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [knownAt, setKnownAt] = useState('');
  const [seriesKey, setSeriesKey] = useState('');
  const [horizon, setHorizon] = useState('30d');
  const [assumptionId, setAssumptionId] = useState('');
  const [label, setLabel] = useState<'replay demonstration' | 'live'>('replay demonstration');

  const load = async (asOf?: string) => {
    const [f, s, g] = await Promise.all([prediction.listForecasts(scope, asOf), prediction.listSeries(scope), graph.listStrategy(scope)]);
    if (!f.ok || f.data === undefined) { setProblem(f.error?.message ?? 'the forecasts could not be read'); return; }
    setRows(f.data.forecasts);
    if (s.ok && s.data !== undefined) { setSeries(s.data.series); setSeriesKey((p) => p || (s.data?.series[0]?.series_key ?? '')); }
    if (g.ok && g.data !== undefined) {
      const asu = g.data.strategy.filter((x) => x.object_type === 'ASU');
      setAssumptions(asu); setAssumptionId((p) => p || (asu[0]?.strategy_object_id ?? ''));
    }
  };
  useEffect(() => { void load(); }, [scope]);

  const openOne = async (id: string) => {
    const r = await prediction.getForecast(scope, id);
    if (r.ok && r.data !== undefined) setOpen(r.data.forecast);
  };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rows === null) return <Empty>reading forecasts…</Empty>;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Forecasts</h1>

      <section aria-labelledby="asof-h" style={cardStyle}>
        <h2 id="asof-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>As known at</h2>
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', alignItems: 'center' }}>
          <input type="datetime-local" aria-label="known at" style={inputStyle} value={knownAt} onChange={(e) => setKnownAt(e.target.value)} />
          <GovernedButton label="Show what was believed then" pendingLabel="reading" variant="quiet"
            onRun={async () => { await load(knownAt === '' ? undefined : new Date(knownAt).toISOString()); }} />
          <GovernedButton label="Now" pendingLabel="reading" variant="quiet" onRun={async () => { setKnownAt(''); await load(); }} />
        </div>
      </section>

      {rows.length === 0 ? <Empty>No forecast has been issued yet.</Empty> : (
        <table className="eye-table" style={{ ...tableStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <caption style={{ captionSide: 'top', textAlign: 'start', color: 'var(--eye-color-ink-muted)' }}>{rows.length} forecast(s)</caption>
          <thead><tr><Th>Series</Th><Th>Horizon</Th><Th>Target</Th><Th>10 / 50 / 90</Th><Th>Method</Th><Th>Validation</Th><Th>State</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.forecast_id}>
                <Td><button type="button" onClick={() => void openOne(r.forecast_id)}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-default)', cursor: 'pointer', textDecoration: 'underline', textAlign: 'start' }}>
                  {r.series_key}</button></Td>
                <Td mono>{r.horizon_code}</Td>
                <Td>{day(r.target_at)}</Td>
                <Td mono>{num(r.quantiles.q10)} / {num(r.quantiles.q50)} / {num(r.quantiles.q90)}</Td>
                <Td mono>{r.method}</Td>
                <Td><ValidationBadge state={r.validation_state} label={r.label} /></Td>
                <Td>{r.state}{r.attention_state === 'none' ? '' : ' · NEEDS ATTENTION'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {open === null ? null : (
        <section aria-labelledby="fct-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="fct-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{open.series_key} · {open.horizon_code}</h2>
          <ValidationBadge state={open.validation_state} label={open.label} />
          <p>{open.validation_note}</p>
          <p><ControlsLine controls={open.controls} /></p>
          {open.attention_state === 'none' ? null : (
            <UnknownNote><strong>This forecast needs attention.</strong> {open.attention_reason}</UnknownNote>
          )}
          <dl>
            <DefinitionRow term="Statement">{open.statement}</DefinitionRow>
            <DefinitionRow term="Distribution">
              q10 <Mono>{num(open.quantiles.q10)}</Mono> · q50 <Mono>{num(open.quantiles.q50)}</Mono> · q90 <Mono>{num(open.quantiles.q90)}</Mono> {open.unit ?? ''}
            </DefinitionRow>
            <DefinitionRow term="Origin · known at · target">
              {day(open.origin_at)} · {fmtInstant(open.known_at)} · {day(open.target_at)}
            </DefinitionRow>
            <DefinitionRow term="Method">
              <Mono>{open.method}@{open.method_version}</Mono> — compared against <Mono>{open.baseline_method}</Mono>
              {open.skill === null ? ' (no applicable backtest on record)' : ` · applicable backtest (${String(open.skill['mode'] ?? 'retrospective')}) · skill vs baseline ${num(open.skill['skill_vs_baseline'])} · coverage ${num(open.skill['coverage_80'])}`}
            </DefinitionRow>
            <DefinitionRow term="Drivers">
              <ul style={{ margin: 0, paddingInlineStart: '1.2rem' }}>
                {open.drivers.map((d, i) => (
                  <li key={i}>{d.series_key} — {d.role}; evidence <Mono>{d.evidence_object_id.slice(0, 8)}…@{d.evidence_version}</Mono>
                    {d.attribution === null ? null : <> · <em>{d.attribution}</em></>}</li>
                ))}
              </ul>
            </DefinitionRow>
            <DefinitionRow term="Assumptions">
              {open.assumptions.map((a) => {
                const asu = assumptions.find((x) => x.strategy_object_id === a);
                return <div key={a}>{asu === undefined ? <Mono>{a}</Mono> : `${asu.title} (${asu.verification_state})`}</div>;
              })}
            </DefinitionRow>
            <DefinitionRow term="Evidence">{open.evidence_refs.length} evidence version(s), digest-bound</DefinitionRow>
            {open.attribution === null || open.attribution === undefined ? null : (
              <DefinitionRow term="Attribution"><em>{open.attribution}</em> Shown as published; the statistics are not modified.</DefinitionRow>
            )}
            {(open.outcomes ?? []).length === 0 ? null : (
              <DefinitionRow term="Outcome">
                {(open.outcomes ?? []).map((o, i) => (
                  <div key={i}>observed <Mono>{num(o['observed_value'])}</Mono> — {o['covered'] === true ? 'inside the 10–90 band' : 'OUTSIDE the 10–90 band'} · pinball {num(o['pinball_mean'])}</div>
                ))}
              </DefinitionRow>
            )}
          </dl>
          {isForecastOwner && open.state === 'issued' ? (
            <GovernedButton label="Score against the outcome" pendingLabel="scoring" variant="quiet"
              onRun={async () => {
                const r = await prediction.recordOutcome(scope, open.forecast_id);
                if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the outcome could not be recorded');
                setReceipt(r.data.receipt); await openOne(open.forecast_id); await load();
              }} />
          ) : null}
        </section>
      )}

      {isForecastOwner ? (
        <section aria-labelledby="issue-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="issue-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Issue a forecast</h2>
          <div style={{ display: 'grid', gap: 'var(--eye-space-8)', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))' }}>
            <div><label htmlFor="ser">Series</label>
              <select id="ser" style={inputStyle} value={seriesKey} onChange={(e) => setSeriesKey(e.target.value)}>
                {series.map((s) => <option key={s.series_key} value={s.series_key}>{s.series_key}</option>)}
              </select></div>
            <div><label htmlFor="hz">Horizon</label>
              <select id="hz" style={inputStyle} value={horizon} onChange={(e) => setHorizon(e.target.value)}>
                {['30d', '90d', '180d', '1y', '3y', '5y'].map((h) => <option key={h} value={h}>{h}</option>)}
              </select></div>
            <div><label htmlFor="asu">Rests on assumption</label>
              <select id="asu" style={inputStyle} value={assumptionId} onChange={(e) => setAssumptionId(e.target.value)}>
                {assumptions.map((a) => <option key={a.strategy_object_id} value={a.strategy_object_id}>{a.title}</option>)}
              </select></div>
            <div><label htmlFor="lbl">Label</label>
              <select id="lbl" style={inputStyle} value={label} onChange={(e) => setLabel(e.target.value as 'live' | 'replay demonstration')}>
                <option value="replay demonstration">replay demonstration</option><option value="live">live</option>
              </select></div>
          </div>
          <GovernedButton label="Issue" pendingLabel="fitting" onRun={async () => {
            const r = await prediction.issueForecast(scope, { seriesKey, horizon, assumptions: [assumptionId], label });
            if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the forecast was refused');
            setReceipt(r.data.receipt); await load(); await openOne(r.data.forecast.forecastId);
          }} />
          <GovernedButton label="Run the backtest for this series and horizon" pendingLabel="backtesting" variant="quiet" onRun={async () => {
            const r = await prediction.runBacktest(scope, { seriesKey, horizon });
            if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the backtest was refused');
            setReceipt(r.data.receipt);
          }} />
          <Receipt receipt={receipt} />
          <UnknownNote>A forecast rests on an assumption or it is refused: one that rests on nothing can never be reached by a correction.
            The method is chosen by the backtest record — the learned model only when it beat seasonal naive by 15%.</UnknownNote>
        </section>
      ) : null}
    </>
  );
}
