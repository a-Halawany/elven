'use client';
/**
 * B24 (0086 §markers) — THE SOURCE IMPACT ON ONE PACKAGE VERSION, and its ACKNOWLEDGEMENT (F-P6-07; V03-T-077).
 *
 * The markers that BEAR on the version shown — on the package itself, or on a forecast, run or warning its options cite (or its
 * baseline run) — each with the acknowledgement recorded for THIS version, if any, and the commitment gate that follows: the
 * server refuses the commitment while one is outstanding. A decision authority (the role that commits; the server decides and
 * refuses in its own words) selects the markers and says why the decision may rest on the degraded source; a new version needs
 * its own acknowledgement. Every row and every refusal here is the server's.
 */
import { useEffect, useState } from 'react';
import { sourceImpact as api, gateLine, healthMark, type Acknowledgement, type PackageBearing } from '../../lib/source-impact';
import type { Scope } from '../../lib/observation';
import { Empty, LiveStatus, Mono, GovernedButton, fmtInstant } from '../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const critical = { color: 'var(--eye-color-critical)' } as const;
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : v === null || v === undefined || v === '' ? '—' : String(v));
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
/** The version states the server accepts an acknowledgement for (decision.acknowledge_source_impact). */
const ACKNOWLEDGEABLE = ['draft', 'proposed', 'under_review', 'approved'];

export function SourceImpactControl({ scope, packageId, version, versionState, isAuthority, onChange }: {
  scope: Scope; packageId: string; version: number; versionState: string; isAuthority: boolean; onChange?: () => void;
}) {
  const [b, setB] = useState<PackageBearing | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [reason, setReason] = useState('');
  const [answer, setAnswer] = useState<Acknowledgement | null>(null);
  const [actProblem, setActProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);

  const load = async () => {
    const r = await api.bearing(scope, packageId, version);
    if (!r.ok || r.data === undefined) { setB(null); setProblem(refusal(r, 'the source impact could not be read')); return; }
    setProblem(null); setB(r.data.package);
    setSelected(Object.fromEntries(r.data.package.markers.filter((m) => !m.acknowledged).map((m) => [m.marker_id, true])));
  };
  useEffect(() => { setAnswer(null); setActProblem(null); setReceipt(null); void load(); }, [scope, packageId, version]);

  if (problem !== null) return <LiveStatus assertive><span style={critical}>source impact not read — {problem}</span></LiveStatus>;
  if (b === null) return <Empty>reading the source impact…</Empty>;
  const chosen = Object.entries(selected).filter(([, on]) => on).map(([id]) => id);
  const mayAct = isAuthority && ACKNOWLEDGEABLE.includes(versionState) && b.outstanding > 0;

  return (
    <div aria-labelledby="si-h" style={{ marginBlockStart: 'var(--eye-space-16)' }}>
      <h4 id="si-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>Source impact on version {b.version}</h4>
      <p style={{ fontSize: 'var(--eye-type-label-sm)', ...(b.gate === 'blocked' ? critical : {}) }}>
        {b.gate === 'blocked' ? <strong>⚑ COMMITMENT HELD — </strong> : null}{gateLine(b)}
      </p>
      {b.markers.length === 0 ? null : (
        <table className="eye-table" style={tableStyle}>
          <thead><tr><Th>Rests on</Th><Th>Health</Th><Th>Why it bears</Th><Th>Acknowledged for v{b.version}</Th>{mayAct ? <Th>Select</Th> : null}</tr></thead>
          <tbody>{b.markers.map((m) => {
            const h = healthMark(m.health_state);
            return (
              <tr key={m.marker_id}>
                <Td>{m.subject_title} <Mono>{short(m.subject_id)}</Mono></Td>
                <Td><span style={{ color: `var(${h.token})`, fontWeight: 650 }}>{h.glyph} {h.text}</span>{m.reason === null ? null : <div style={{ fontSize: 'var(--eye-type-label-sm)' }}>{m.reason}</div>}</Td>
                <Td>{m.bearing ?? '—'}</Td>
                <Td>{m.acknowledged ? <>● by <Mono>{short(m.acknowledged_by)}</Mono>{m.acknowledged_at === null ? null : <> at {fmtInstant(m.acknowledged_at)}</>}</> : <strong>○ NOT ACKNOWLEDGED</strong>}</Td>
                {mayAct ? <Td>{m.acknowledged ? '—' : (
                  <input type="checkbox" aria-label={`acknowledge the marker on ${m.subject_title}`} checked={selected[m.marker_id] === true}
                    onChange={(e) => setSelected((s) => ({ ...s, [m.marker_id]: e.target.checked }))} />
                )}</Td> : null}
              </tr>
            );
          })}</tbody>
        </table>
      )}
      {mayAct ? (
        <div style={{ display: 'grid', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-8)', maxInlineSize: '40rem' }}>
          <label htmlFor="si-reason">Why this decision may rest on the degraded source (8+ characters; recorded with your name for version {b.version})</label>
          <input id="si-reason" style={{ ...inputStyle, inlineSize: '100%' }} value={reason} onChange={(e) => setReason(e.target.value)} />
          <GovernedButton label={`Acknowledge ${chosen.length} marker(s) for version ${b.version}`} pendingLabel="acknowledging" disabled={chosen.length === 0 || reason.trim().length < 8}
            onRun={async () => {
              setActProblem(null); setAnswer(null);
              const r = await api.acknowledge(scope, packageId, b.version, chosen, reason);
              if (!r.ok || r.data === undefined) { const m = `not acknowledged — ${refusal(r, 'the acknowledgement was not answered')}`; setActProblem(m); throw new Error(m); }
              setAnswer(r.data.acknowledgement); setReceipt(r.data.receipt); setReason(''); await load(); onChange?.();
            }} />
        </div>
      ) : b.outstanding > 0 && !isAuthority ? (
        <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>A decision authority acknowledges the impact for this version; the server refuses the commitment until then.</p>
      ) : null}
      {actProblem !== null && <LiveStatus assertive><span style={critical}>{actProblem}</span></LiveStatus>}
      {answer !== null && (
        <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>
          {answer.repeated ? 'already acknowledged for this version — nothing new recorded' : <>{answer.acknowledged.length} marker(s) acknowledged for version {answer.version}</>}
          {answer.outstanding.length > 0 ? <> · <strong>{answer.outstanding.length} still outstanding</strong></> : <> · none outstanding</>}
        </p>
      )}
      <Receipt receipt={receipt} />
    </div>
  );
}
