'use client';
/**
 * Prediction overview — what the platform expects, what it is watching for,
 * who has been warned, and how honest its record is.
 *
 * EVERY COUNT ON THIS SCREEN NAMES ITS VALIDATION. A forecast that is a replay
 * demonstration or that no backtest has scored is counted as such, and the
 * screen never presents "issued" as "trustworthy".
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useShell } from './layout';
import { prediction, type Overview } from '../../lib/prediction';
import { Empty, LiveStatus, cardStyle, UnknownNote } from '../../components/observation';

function Stat({ label, value, detail }: { label: string; value: number | string; detail?: string }) {
  return (
    <div style={{ ...cardStyle, minInlineSize: '11rem' }}>
      <div style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>{label}</div>
      <div style={{ fontSize: 'var(--eye-type-heading-1)', fontFamily: 'var(--eye-font-mono)' }}>{value}</div>
      {detail === undefined ? null : <div style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>{detail}</div>}
    </div>
  );
}

const fmt = (m: Record<string, number>): string =>
  Object.entries(m).map(([k, v]) => `${v} ${k.replace(/_/g, ' ')}`).join(' · ') || 'none';

export default function PredictionOverview() {
  const { scope } = useShell();
  const [o, setO] = useState<Overview | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await prediction.overview(scope);
      if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the overview could not be read'); return; }
      setO(r.data.overview);
    })();
  }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (o === null) return <Empty>reading…</Empty>;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Prediction</h1>
      <div style={{ display: 'flex', gap: 'var(--eye-space-16)', flexWrap: 'wrap' }}>
        <Stat label="Series" value={o.series} detail="registered, deterministic parsers" />
        <Stat label="Forecasts" value={o.forecasts.total} detail={fmt(o.forecasts.by_state)} />
        <Stat label="Validation" value={o.forecasts.by_validation['validated'] ?? 0}
              detail={`validated · ${fmt(o.forecasts.by_validation)}`} />
        <Stat label="Needing attention" value={o.forecasts.attention} detail="an assumption they rest on changed" />
        <Stat label="Scenario branches" value={o.scenarios.branches} detail={`${o.scenarios.flipped} flipped`} />
        <Stat label="Warnings" value={o.warnings.total} detail={fmt(o.warnings.by_state)} />
        <Stat label="Outcomes scored" value={o.outcomes} detail={`${o.backtests} backtest(s)`} />
      </div>
      <UnknownNote>
        <strong>{o.forecasts.by_label['replay demonstration'] ?? 0} forecast(s) are replay demonstrations</strong> and
        {' '}{o.forecasts.by_label['live'] ?? 0} are live. A replay demonstration proves the pipeline runs; it says nothing
        about forecast quality, and the <Link href="/prediction/calibration">Calibration</Link> screen is where that is
        measured — or where it says it cannot be yet.
      </UnknownNote>
    </>
  );
}
