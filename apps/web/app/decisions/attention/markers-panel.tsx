'use client';
/**
 * B24 (0086 §markers) — SOURCE-IMPACT MARKERS (F-P6-07; V03-T-077 "no UI shows markers"), beside the attention queue.
 *
 * A source whose health is degraded, failed, suspended or unknown MARKS the products derived from it: the issued forecasts of its
 * series, the open warnings on them, the scenarios declared on them, the runs bound to those scenarios, and the decision packages
 * whose current version cites one of those forecasts or runs. The marks clear when the source recovers. Each marker is listed on
 * the product it sits on (named by the server), under the source it carries, with what it constrains: a run on a failed or
 * suspended source is refused; a package version commits only once a decision authority acknowledges the impact for that version
 * (on the package's page). Every row here is the server's; nothing is computed on the client.
 */
import { useEffect, useState } from 'react';
import { sourceImpact as api, constraintLine, healthMark, type SourceGroup } from '../../../lib/source-impact';
import type { Scope } from '../../../lib/observation';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : v === null || v === undefined || v === '' ? '—' : String(v));
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;

function Health({ state }: { state: string }) {
  const m = healthMark(state);
  return <span style={{ color: `var(${m.token})`, fontWeight: 650, fontSize: 'var(--eye-type-label-sm)' }}>{m.glyph} {m.text}</span>;
}

export function MarkersPanel({ scope }: { scope: Scope }) {
  const [groups, setGroups] = useState<SourceGroup[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [stateFilter, setStateFilter] = useState('active');
  const [receipt, setReceipt] = useState<ReceiptT>(null);

  const load = async () => {
    const r = await api.markers(scope, { state: stateFilter });
    if (!r.ok || r.data === undefined) { setGroups(null); setProblem(refusal(r, 'the markers could not be read')); return; }
    setProblem(null); setGroups(r.data.sources); setReceipt(r.data.receipt);
  };
  useEffect(() => { void load(); }, [scope, stateFilter]);

  return (
    <section aria-labelledby="markers-h" style={cardStyle}>
      <h2 id="markers-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Source-impact markers</h2>
      <p style={muted}>
        A product resting on a source that is degraded, failed, suspended or of unknown health carries a marker until the source recovers.
        A run on a scenario resting on a failed or suspended source is refused; on a degraded or unknown one it is admitted with the impact
        declared. A decision package version resting on a marked product commits only once a decision authority acknowledges the impact for
        that version — on the package&apos;s page.
      </p>
      <div style={{ maxInlineSize: '16rem' }}>
        <label htmlFor="mk-state" style={{ display: 'block' }}>Markers</label>
        <select id="mk-state" style={{ ...inputStyle, inlineSize: '100%' }} value={stateFilter} onChange={(e) => setStateFilter(e.target.value)}>
          <option value="active">active</option><option value="cleared">cleared</option><option value="all">all</option>
        </select>
      </div>
      {problem !== null && <LiveStatus assertive><span style={critical}>not listed — {problem}</span></LiveStatus>}
      {groups === null ? (problem === null ? <Empty>reading the markers…</Empty> : null) : groups.length === 0 ? (
        <Empty>{stateFilter === 'active' ? 'No product of this domain rests on a degraded source.' : 'No marker matches.'}</Empty>
      ) : groups.map((g) => (
        <div key={g.source_id} style={{ marginBlockStart: 'var(--eye-space-16)' }}>
          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>
            {g.source_name ?? 'source'} <Mono>{g.source_key ?? short(g.source_id)}</Mono> — <Health state={g.worst_state} />
            <span style={{ ...muted, fontSize: 'var(--eye-type-label-sm)' }}> · {Object.entries(g.counts).map(([k, n]) => `${n} ${k}${n === 1 ? '' : 's'}`).join(', ')}</span>
          </h3>
          <ScrollBox label={`markers of ${g.source_name ?? g.source_id}`}>
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Product</Th><Th>Health</Th><Th>What it constrains</Th><Th>Set</Th><Th>State</Th></tr></thead>
              <tbody>{g.markers.map((m) => (
                <tr key={m.marker_id}>
                  <Td>{m.subject_title} <Mono>{short(m.subject_id)}</Mono></Td>
                  <Td><Health state={m.health_state} />{m.reason === null ? null : <div style={{ fontSize: 'var(--eye-type-label-sm)' }}>{m.reason}</div>}</Td>
                  <Td>{m.state === 'active' ? constraintLine(m.subject_kind, m.health_state) : '—'}</Td>
                  <Td>{m.set_at === null ? '—' : fmtInstant(m.set_at)}</Td>
                  <Td>{m.state === 'active' ? <strong>● ACTIVE</strong> : <>○ CLEARED{m.cleared_at === null ? null : <> at {fmtInstant(m.cleared_at)}</>}{m.cleared_state === null ? null : <> (source {m.cleared_state})</>}</>}</Td>
                </tr>
              ))}</tbody>
            </table>
          </ScrollBox>
        </div>
      ))}
      <Receipt receipt={receipt} />
    </section>
  );
}
