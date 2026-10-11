'use client';
/**
 * THE DRILL-DOWN of a cited result — CP-6 B92 §OR. A MINIMAL LOCAL drill-down: §MD's `_catalog/result-drilldown.tsx` is not on this part's
 * branch; the integrator unifies the two (this one reads the same prelude route, `results/:id/read`, and shows the same chain).
 * definition → result → records: the definition version the result names, the result (state, value or the explained indeterminate, n, the
 * interval, window, clock, scope, source revision, computation), the records it rests on by role, its uses and its replays. Read under the
 * reader's own authority (analytics.read, audited). A slower answer for an earlier result is dropped.
 */
import { useEffect, useRef, useState } from 'react';
import type { Scope } from '../../../../../lib/observation';
import { intervalLine, reviews, sampleLine, stateMark, valueLine, windowLine, type DefinitionRowT, type ResultRow } from '../../../../../lib/analytics-or-b92';
import { Empty, LiveStatus, Mono, ScrollBox, DefinitionRow, fmtInstant } from '../../../../../components/observation';
import { tableStyle, Th, Td } from '../../../../../components/ui';

type Row = Record<string, unknown>;
type Loaded = ResultRow & { definition: DefinitionRowT; records: Row[]; uses: Row[]; replays: Row[]; scope_row: Row | null };

export function ResultDrilldown({ scope, resultId }: { scope: Scope; resultId: string }) {
  const [data, setData] = useState<Loaded | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const wanted = useRef('');
  useEffect(() => {
    wanted.current = resultId; setData(null); setProblem(null);
    const asked = resultId;
    void reviews.result(scope, asked).then((r) => {
      if (wanted.current !== asked) return;
      if (!r.ok || r.data?.result === undefined || r.data.result === null) { setProblem(`HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? 'the result could not be read'}`); return; }
      setData(r.data.result);
    });
  }, [scope, resultId]);
  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (data === null) return <Empty>reading the result and its records…</Empty>;
  const m = stateMark(data.state); const d = data.definition;
  return (
    <div aria-label={`Drill-down of result ${data.result_id}`} style={{ borderInlineStart: '3px solid var(--eye-color-border-strong)', paddingInlineStart: 'var(--eye-space-12)' }}>
      <DefinitionRow term="Definition">{d.title} — <Mono>{d.metric_key}</Mono> v{d.version} ({d.state})</DefinitionRow>
      <DefinitionRow term="Result"><span style={{ color: `var(${m.token})`, fontWeight: 650 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span> — {valueLine(data)}</DefinitionRow>
      {data.state !== 'determinate' && data.reasons.length > 1 ? <DefinitionRow term="Every reason"><ul style={{ margin: 0 }}>{data.reasons.map((x, i) => <li key={i}>{x}</li>)}</ul></DefinitionRow> : null}
      <DefinitionRow term="Sample">{sampleLine(data.n, d.floor_n, d.k_min)} · {intervalLine(data.kind, data.unit, data.uncertainty)}</DefinitionRow>
      <DefinitionRow term="Window">{data.period_key} {windowLine(data.window_from, data.window_to)} · clock {data.clock} · as of {fmtInstant(data.as_of)}</DefinitionRow>
      <DefinitionRow term="Scope">{data.scope_key === null ? 'the whole domain' : `${data.scope_key} v${data.scope_version}`}</DefinitionRow>
      <DefinitionRow term="Lineage">computation <Mono>{data.computation_key ?? '—'}</Mono> v{data.computation_version ?? '—'} · source revision <Mono>{data.source_revision.slice(0, 16)}…</Mono> · computed {fmtInstant(data.computed_at)} by a {data.computed_by_kind}</DefinitionRow>
      <DefinitionRow term="Records by role">{Object.entries(data.records_by_role ?? {}).map(([k, v]) => `${k} ${v}`).join(' · ') || 'none — nothing to measure, not a measured zero'}</DefinitionRow>
      <DefinitionRow term="Uses">{data.uses.length === 0 ? 'not cited anywhere yet' : data.uses.map((u) => `${String(u['used_in_kind'])} ${String(u['used_in_id']).slice(0, 8)}`).join(' · ')}</DefinitionRow>
      <DefinitionRow term="Replays">{data.replays.length === 0 ? 'not replayed' : data.replays.map((x) => String(x['verdict'])).join(' · ')}</DefinitionRow>
      {data.records.length === 0 ? <Empty>No record — the population was empty for this window and scope.</Empty> : (
        <ScrollBox label={`The records of result ${data.result_id}`}>
          <table style={tableStyle}>
            <thead><tr><Th>#</Th><Th>Record</Th><Th>Role</Th><Th>Reason / detail</Th></tr></thead>
            <tbody>{data.records.map((r) => (
              <tr key={String(r['ordinal'])}>
                <Td>{String(r['ordinal'])}</Td>
                <Td><Mono>{String(r['record_kind'])}</Mono> <Mono>{String(r['record_id'])}</Mono></Td>
                <Td>{String(r['role'])}</Td>
                <Td>{r['reason'] ? String(r['reason']) : ''}{r['detail'] && Object.keys(r['detail'] as Row).length > 0 ? <> <Mono>{JSON.stringify(r['detail'])}</Mono></> : null}</Td>
              </tr>
            ))}</tbody>
          </table>
        </ScrollBox>
      )}
    </div>
  );
}
