'use client';
/**
 * Scenarios — a baseline and the branches that would replace it, each with the
 * indicator that flips it, a signpost, an owner and a consequence.
 *
 * A FLIP IS A FACT WITH A RECEIPT. A flipped branch shows the instant it flipped
 * and the event that recorded it; the state is never derived on this screen
 * from the latest number. Evaluating an indicator is a governed act and the
 * warnings it raises are listed with it.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { prediction, type ScenarioRow, type IndicatorRow } from '../../../lib/prediction';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant } from '../../../components/observation';
import { tableStyle, Th, Td, Receipt } from '../../../components/ui';

function BranchState({ state }: { state: string }) {
  const map: Record<string, { glyph: string; token: string }> = {
    open: { glyph: '○', token: '--eye-color-ink-muted' }, flipped: { glyph: '⚑', token: '--eye-color-critical' }, closed: { glyph: '—', token: '--eye-color-ink-muted' },
  };
  const v = map[state] ?? (map['open'] as { glyph: string; token: string });
  return <span style={{ color: `var(${v.token})`, fontWeight: state === 'flipped' ? 650 : 400 }}><span aria-hidden="true">{v.glyph}</span> {state.toUpperCase()}</span>;
}

export default function ScenariosPage() {
  const { scope, isForecastOwner } = useShell();
  const [rows, setRows] = useState<ScenarioRow[] | null>(null);
  const [indicators, setIndicators] = useState<IndicatorRow[]>([]);
  const [open, setOpen] = useState<ScenarioRow | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [lastEval, setLastEval] = useState<string | null>(null);

  const load = async () => {
    const [s, i] = await Promise.all([prediction.listScenarios(scope), prediction.listIndicators(scope)]);
    if (!s.ok || s.data === undefined) { setProblem(s.error?.message ?? 'the scenarios could not be read'); return; }
    setRows(s.data.scenarios);
    if (i.ok && i.data !== undefined) setIndicators(i.data.indicators);
  };
  useEffect(() => { void load(); }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rows === null) return <Empty>reading scenarios…</Empty>;

  const ind = (id: string | null) => indicators.find((x) => x.indicator_id === id) ?? null;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Scenarios</h1>
      {rows.length === 0 ? <Empty>No scenario tree has been declared yet.</Empty> : rows.map((s) => (
        <section key={s.scenario_id} aria-labelledby={`scn-${s.scenario_id}`} style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id={`scn-${s.scenario_id}`} style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{s.title}</h2>
          <p>{s.statement}</p>
          <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>
            owner <Mono>{s.owner_principal_id.slice(0, 8)}…</Mono> · review {s.review_cadence} · declared {fmtInstant(s.declared_at)}
            {s.forecast_id === null ? null : <> · built on forecast <Mono>{s.forecast_id.slice(0, 8)}…</Mono></>}
          </p>
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Branch</Th><Th>Kind</Th><Th>State</Th><Th>Indicator</Th><Th>Signpost</Th><Th>Owner</Th><Th>Window · deadline</Th><Th>Consequence</Th></tr></thead>
            <tbody>
              {s.branches.map((b) => {
                const i = ind(b.indicator_id);
                return (
                  <tr key={b.branch_id}>
                    <Td>{b.name}</Td>
                    <Td mono>{b.kind}</Td>
                    <Td><BranchState state={b.state} />{b.flipped_at === null ? null : <div style={{ fontSize: 'var(--eye-type-label-sm)' }}>{fmtInstant(b.flipped_at)} · event <Mono>{String(b.flip_event_id).slice(0, 8)}…</Mono></div>}
                      {b.warning_state === 'owed' ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-critical)', fontWeight: 650 }}>⚠ WARNING OWED — the raise failed; the next evaluation retries it</div> : null}</Td>
                    <Td>{i === null ? '—' : <>{i.series_key} {i.comparator} {i.threshold} for {i.consecutive_days} day(s){i.breached ? ' · BREACHED' : ` · streak ${i.streak}`}</>}</Td>
                    <Td>{b.signpost ?? '—'}</Td>
                    <Td mono>{b.owner_principal_id.slice(0, 8)}…</Td>
                    <Td>{b.response_window_hours} h{b.decision_deadline === undefined || b.decision_deadline === null ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>no deadline · T3 unmeasured</div> : <div style={{ fontSize: 'var(--eye-type-label-sm)' }}>by {fmtInstant(b.decision_deadline)}</div>}</Td>
                    <Td>{b.consequence}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {isForecastOwner ? s.branches.filter((b) => b.indicator_id !== null).map((b) => (
            <GovernedButton key={b.branch_id} label={`Evaluate "${b.name}" against what is known now`} pendingLabel="evaluating" variant="quiet"
              onRun={async () => {
                const r = await prediction.evaluateIndicator(scope, b.indicator_id as string);
                if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the evaluation was refused');
                setReceipt(r.data.receipt);
                setLastEval(`${r.data.evaluation.evaluated} new observation(s) evaluated · streak ${r.data.evaluation.streak} · `
                  + (r.data.evaluation.flips.length === 0 ? 'no flip' : `${r.data.evaluation.flips.length} flip(s), ${r.data.warnings.length} warning(s) raised`)
                  + (r.data.evaluation.owedRecovered > 0 ? ` · ${r.data.evaluation.owedRecovered} owed warning(s) recovered` : ''));
                await load();
              }} />
          )) : null}
        </section>
      ))}
      {lastEval === null ? null : <LiveStatus>{lastEval}</LiveStatus>}
      <Receipt receipt={receipt} />
      <UnknownNote>A branch flips only when its indicator has been breached for the declared run of consecutive observations, and every
        flip raises a warning to the branch owner with a response window. Nothing here re-renders a state from the latest number.</UnknownNote>
    </>
  );
}
