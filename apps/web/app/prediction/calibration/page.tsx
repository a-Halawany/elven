'use client';
/**
 * Calibration — the platform's own track record, by horizon and by method,
 * including where it has been wrong. The feature that makes the rest
 * defensible, and the one most systems omit because it is the one that can
 * embarrass them.
 *
 * When there is nothing to score it SAYS SO, in words, and what it shows
 * instead — backtests on held-out history — is labelled as exactly that.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { prediction, type Calibration } from '../../../lib/prediction';
import { Empty, LiveStatus, Mono, cardStyle, UnknownNote, fmtInstant } from '../../../components/observation';
import { tableStyle, Th, Td } from '../../../components/ui';

const pct = (v: unknown): string => { const n = Number(v); return Number.isFinite(n) ? `${(n * 100).toFixed(1)}%` : '—'; };
const num = (v: unknown): string => { const n = Number(v); return Number.isFinite(n) ? n.toFixed(3).replace(/\.?0+$/, '') : '—'; };
const met = (v: boolean | null): string => (v === null ? 'not scored' : v ? 'MET' : 'NOT MET');

export default function CalibrationPage() {
  const { scope } = useShell();
  const [c, setC] = useState<Calibration | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const r = await prediction.calibration(scope);
      if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the calibration record could not be read'); return; }
      setC(r.data.calibration);
    })();
  }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (c === null) return <Empty>reading the record…</Empty>;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Calibration</h1>
      <UnknownNote><strong>{c.statement}</strong></UnknownNote>

      <section aria-labelledby="out-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="out-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Scored outcomes — live and replay, separately labelled</h2>
        {c.outcomes.length === 0 ? <Empty>Nothing has been scored against a real outcome yet.</Empty> : (
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Series</Th><Th>Horizon</Th><Th>Method</Th><Th>Outcomes</Th><Th>80% coverage</Th><Th>Pinball</Th><Th>T1</Th><Th>Labels</Th></tr></thead>
            <tbody>
              {c.outcomes.map((o, i) => (
                <tr key={i}><Td>{o.series_key}</Td><Td mono>{o.horizon_code}</Td><Td mono>{o.method}</Td><Td mono>{o.outcomes}</Td>
                  <Td mono>{pct(o.coverage_80)}</Td><Td mono>{num(o.pinball_mean)}</Td><Td>{met(o.t1_met)}</Td><Td>{o.labels.join(', ')}</Td></tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="bt-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="bt-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Backtests on held-out history — the learned model against seasonal naive</h2>
        {c.backtests.length === 0 ? <Empty>No backtest has been run.</Empty> : (
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Series</Th><Th>Horizon</Th><Th>Mode</Th><Th>Origins</Th><Th>Coverage (model / naive)</Th><Th>Pinball (model / naive)</Th><Th>Skill</Th><Th>T1</Th><Th>T2</Th><Th>Window</Th></tr></thead>
            <tbody>
              {c.backtests.map((b) => (
                <tr key={b.backtest_id}>
                  <Td>{b.series_key}</Td><Td mono>{b.horizon_code}</Td><Td mono>{b.mode ?? 'retrospective'}</Td><Td mono>{b.origins}</Td>
                  <Td mono>{pct(b.coverage_80)} / {pct(b.baseline_coverage_80)}</Td>
                  <Td mono>{num(b.pinball_mean)} / {num(b.baseline_pinball_mean)}</Td>
                  <Td mono>{pct(b.skill_vs_baseline)}</Td><Td>{met(b.t1_met)}</Td><Td>{met(b.t2_met)}</Td>
                  <Td>{String(b.window_from).slice(0, 10)} → {String(b.window_to).slice(0, 10)}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {c.backtests.map((b) => <p key={`v-${b.backtest_id}`} style={{ fontSize: 'var(--eye-type-label-sm)' }}><Mono>{b.series_key} · {b.horizon_code}</Mono> — {b.verdict} <span style={{ color: 'var(--eye-color-ink-muted)' }}>({fmtInstant(b.computed_at)})</span></p>)}
      </section>

      <section aria-labelledby="t-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="t-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>The targets</h2>
        <dl>{Object.entries(c.targets).map(([k, v]) => <div key={k}><dt style={{ fontWeight: 650 }}>{k}</dt><dd>{v}</dd></div>)}</dl>
      </section>
    </>
  );
}
