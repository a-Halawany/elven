'use client';
/**
 * THE DRILL-DOWN — definition → result → records (CP-6 B92 §MD; the scene's "each metric traceable to its definition and underlying records").
 * Exported for the metric catalog (§MD) and the operating review (§OR). It reads ONE result through the prelude's route (results/:id/read —
 * analytics.read, audited) and shows, in that order: the DEFINITION the result was computed on (key, version, digest, meaning, population,
 * numerator / denominator, window and clock, floor, k, threshold and its review action), the RESULT (its state in words — an indeterminate result
 * AS indeterminate with its reasons, n and floor, never 0; an unsupported one with its carrier; a preview marked), the uncertainty and the
 * distribution, the window, scope and cohort, the as-of, the computation and its digest, the SOURCE REVISION, the RECORDS by role and the
 * records table (kind, id, role, reason, detail), the uses and the replays (with a replay button for those allowed — the server decides).
 * A slower answer for an earlier result is dropped. Refusals are the server's words.
 */
import { useEffect, useRef, useState } from 'react';
import type { Scope } from '../../../../../lib/observation';
import {
  catalogApi, dayOf, intervalLine, recordedComputationLine, resultMark, roleCounts, thresholdLine, valueLine, versionsPair, windowLine, type ResultRead,
} from '../../../../../lib/analytics-md-b92';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, GovernedButton, fmtInstant } from '../../../../../components/observation';
import { tableStyle, Th, Td } from '../../../../../components/ui';

type Row = Record<string, unknown>;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const PAGE = 200;

function MarkText({ m }: { m: { glyph: string; token: string; text: string } }) {
  return <span style={{ color: `var(${m.token})`, fontWeight: 650 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}
const j = (v: unknown): string => (v === null || v === undefined ? '—none—' : typeof v === 'string' ? v : JSON.stringify(v));

export function ResultDrilldown({ scope, resultId, canReplay = false, onReplayed }: { scope: Scope; resultId: string; canReplay?: boolean; onReplayed?: (replayId: string) => void }) {
  const [r, setR] = useState<ResultRead | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [limit, setLimit] = useState(PAGE);
  const [roleFilter, setRoleFilter] = useState<string>('');
  const wanted = useRef('');
  const load = async (lim: number) => {
    wanted.current = `${resultId}:${lim}`;
    const asked = wanted.current;
    const a = await catalogApi.result(scope, resultId, lim);
    if (wanted.current !== asked) return;   // the result chosen LAST wins
    if (!a.ok || a.data === undefined || a.data.result === null) { setR(null); setProblem(a.error?.message ?? 'the result could not be read'); return; }
    setProblem(null); setR(a.data.result);
  };
  useEffect(() => { setR(null); setLimit(PAGE); setRoleFilter(''); void load(PAGE); }, [scope, resultId]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (r === null) return <Empty>reading the result and its records…</Empty>;
  const d = (r.definition ?? {}) as Row;
  const floor = typeof d['floor_n'] === 'number' ? Number(d['floor_n']) : null;
  const win = (d['window_spec'] ?? {}) as Row;
  const records = roleFilter === '' ? r.records : r.records.filter((x) => x.role === roleFilter);
  const dist = r.distribution;

  return (
    <section aria-label={`Result ${r.metric_key} ${r.period_key}`} style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-12)' }}>
      <h3 style={{ marginBlockStart: 0 }}>{String(d['title'] ?? r.metric_key)} — {r.period_key}{r.scope_key ? ` · ${r.scope_key} v${r.scope_version}` : ' · the whole domain'}</h3>

      <h4>The definition</h4>
      <dl>
        <DefinitionRow term="Metric">{r.metric_key} — {versionsPair(r.definition_version, r)} <Mono title={r.definition_digest}>{r.definition_digest.slice(0, 12)}…</Mono>{d['state'] !== 'approved' ? <> — the definition is now <strong>{String(d['state']).toUpperCase()}</strong></> : null}</DefinitionRow>
        <DefinitionRow term="Meaning">{String(d['meaning'] ?? '—')}</DefinitionRow>
        <DefinitionRow term="Population">{j(d['population'])}</DefinitionRow>
        {r.kind === 'rate' ? <DefinitionRow term="Numerator / denominator">{String(d['numerator'] ?? '—')} / {String(d['denominator'] ?? '—')}</DefinitionRow> : null}
        <DefinitionRow term="Exclusions">{j(d['exclusions'])}</DefinitionRow>
        <DefinitionRow term="Window and clock">{windowLine(r.window_from, r.window_to)} — {r.period_key} ({String(win['kind'] ?? r.period_kind)}); clock <strong>{r.clock}</strong> ({r.clock === 'record' ? 'when the product recorded it' : 'the subject\'s own time'})</DefinitionRow>
        <DefinitionRow term="Floor · k">n ≥ {floor ?? '—'} for a determinate value · cohorts of at least {String(d['k_min'] ?? '—')} distinct principals</DefinitionRow>
        <DefinitionRow term="Threshold">{thresholdLine(r.threshold_eval)}</DefinitionRow>
      </dl>

      <h4>The result</h4>
      <p><MarkText m={resultMark(r)} /> — <strong>{valueLine(r, floor)}</strong></p>
      {r.reasons.length > 0 ? (
        <ul aria-label="Why the result is not determinate">{r.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul>
      ) : null}
      <dl>
        {r.kind === 'rate' && r.state === 'determinate' ? <DefinitionRow term="Counts">{String(r.numerator)} of {String(r.denominator)}</DefinitionRow> : null}
        <DefinitionRow term="Uncertainty">{intervalLine(r.uncertainty, r.kind, r.unit) || (r.state === 'determinate' ? 'not stated' : 'not computed (indeterminate)')}</DefinitionRow>
        {dist !== null ? <DefinitionRow term="Distribution">p50 {String(dist['p50'])} · p90 {String(dist['p90'])} · min {String(dist['min'])} · max {String(dist['max'])} · n {String(dist['n'])}</DefinitionRow> : null}
        <DefinitionRow term="Cohort">{Object.keys(r.cohort ?? {}).length === 0 ? 'the whole population' : j(r.cohort)}</DefinitionRow>
        <DefinitionRow term="As of">{fmtInstant(r.as_of)} (computed {fmtInstant(r.computed_at)} by a {r.computed_by_kind})</DefinitionRow>
        <DefinitionRow term="Computation">{recordedComputationLine(r, r.computation_now)}</DefinitionRow>
        <DefinitionRow term="Source revision"><Mono title={r.source_revision}>{r.source_revision}</Mono> over {r.records_count} record(s)</DefinitionRow>
        {Object.keys(r.quality ?? {}).length > 0 ? <DefinitionRow term="Quality">{j(r.quality)}</DefinitionRow> : null}
        {Array.isArray((r.evaluation ?? {})['checks']) && ((r.evaluation as Row)['checks'] as unknown[]).length > 0 ? <DefinitionRow term="Standing evaluation">{j((r.evaluation as Row)['checks'])}</DefinitionRow> : null}
      </dl>

      <h4>The records</h4>
      {r.records_count === 0 ? <Empty>No record — {r.state === 'unsupported' ? 'the product holds no source for this metric' : 'nothing in the population for this window and scope (not a measured zero)'}.</Empty> : (
        <>
          <p>
            {roleCounts(r.records_by_role).map((x) => (
              <button key={x.role} type="button" aria-pressed={roleFilter === x.role} onClick={() => setRoleFilter(roleFilter === x.role ? '' : x.role)}
                style={{ marginInlineEnd: 'var(--eye-space-8)' }}>{x.role}: {x.count}</button>
            ))}
            <span style={muted}>{roleFilter === '' ? ' (all roles)' : ` (showing ${roleFilter})`}</span>
          </p>
          <ScrollBox label="Result records">
            <table style={tableStyle}>
              <thead><tr><Th>#</Th><Th>Kind</Th><Th>Record</Th><Th>Role</Th><Th>Reason</Th><Th>Detail</Th></tr></thead>
              <tbody>{records.map((x) => (
                <tr key={x.ordinal}><Td>{x.ordinal}</Td><Td>{x.record_kind}</Td><Td mono>{x.record_id}</Td><Td>{x.role}</Td><Td>{x.reason ?? ''}</Td><Td mono>{Object.keys(x.detail ?? {}).length === 0 ? '' : JSON.stringify(x.detail)}</Td></tr>
              ))}</tbody>
            </table>
          </ScrollBox>
          {r.records.length < r.records_count ? (
            <p>{r.records.length} of {r.records_count} shown. <button type="button" onClick={() => { const n = Math.min(limit * 4, 20000); setLimit(n); void load(n); }}>Show more</button></p>
          ) : null}
        </>
      )}

      <h4>Uses and replays</h4>
      {r.uses.length === 0 ? <p style={muted}>Not cited anywhere yet.</p> : (
        <ul>{r.uses.map((u) => <li key={String(u['use_id'])}>{String(u['used_in_kind']).replace(/_/g, ' ')} <Mono>{String(u['used_in_id'])}</Mono> · {dayOf(u['used_at'])}{u['note'] ? ` — ${String(u['note'])}` : ''}</li>)}</ul>
      )}
      {r.replays.length === 0 ? <p style={muted}>Never replayed.</p> : (
        <ul>{r.replays.map((x) => <li key={x.result_id}>{x.verdict === 'reproduced' ? 'REPRODUCED' : 'MISMATCH'} at {fmtInstant(x.computed_at)} — revision <Mono>{x.source_revision.slice(0, 12)}…</Mono></li>)}</ul>
      )}
      {canReplay && r.replay_of === null ? (
        <GovernedButton label="Replay at its own as-of" pendingLabel="Replaying…" variant="quiet" onRun={async () => {
          const a = await catalogApi.replay(scope, r.result_id);
          if (!a.ok || a.data === undefined) { setProblem(`HTTP ${a.status}${a.error?.code ? ` ${a.error.code}` : ''} — ${a.error?.message ?? 'the replay was refused'}`); throw new Error('replay'); }
          onReplayed?.(String(a.data.replay.result_id)); await load(limit);
        }} />
      ) : null}
      {r.replay_of !== null ? <p>This result is a REPLAY of <Mono>{r.replay_of}</Mono> — {r.replay_verdict === 'reproduced' ? 'REPRODUCED' : 'MISMATCH'}.</p> : null}
    </section>
  );
}

export default ResultDrilldown;
