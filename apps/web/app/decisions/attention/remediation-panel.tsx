'use client';
/**
 * B28 (0088 §R) — THE REMEDIATION OF A SOURCE'S COVERAGE LOSS, beside the source-impact markers (the B24 carryover (a)).
 *
 * A source.coverage_loss item selected in the queue opens a REMEDIATION here: its owner (a collection manager or domain administrator;
 * you, when none is named), the GAP it answers (the loss window from the item's arrival and the source's blind-spot / degraded-region
 * measurements — or their declared absence) and the STEPS — a fallback source (an active, healthy source of the domain), a re-collection
 * (NAMES a collection run of this source started since the opening: trigger it on the source's page, Collect now — nothing here starts
 * one), the gap ACCEPTED (by a second person, never the owner). It closes RECOVERED only while the source is healthy — the source-health
 * subscriber closes it automatically when it applies the recovery — or GAP ACCEPTED only through the accepted step. One remediation per
 * source is open at a time. The server judges who may and refuses in its own words; every row here is the server's.
 */
import { useEffect, useState } from 'react';
import {
  CLOSURE_KINDS, STEP_KINDS, closureLine, isOpen, measurementLine, remediation as api, remediationMark, stepLine,
  type ClosureKind, type Remediation, type SourceRemediations, type StepKind,
} from '../../../lib/coverage-remediation';
import type { Scope } from '../../../lib/observation';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : v === null || v === undefined || v === '' ? '—' : String(v));
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const input = (id: string, label: string, value: string, onChange: (v: string) => void) => (
  <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>
    <input id={id} type="text" style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)} /></div>
);

function StateMark({ state }: { state: string }) {
  const m = remediationMark(state);
  return <span style={{ color: `var(${m.token})`, fontWeight: 650, fontSize: 'var(--eye-type-label-sm)' }}>{m.glyph} {m.text}</span>;
}

/** The item is a coverage-loss item of the queue (its subject the source), or nothing is selected. */
export function RemediationPanel({ scope, me, item }: { scope: Scope; me: { principalId: string }; item: { itemId: string; sourceId: string; title: string } | null }) {
  const [data, setData] = useState<SourceRemediations | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [actProblem, setActProblem] = useState<string | null>(null);
  const [said, setSaid] = useState<string | null>(null);
  const [owner, setOwner] = useState(''); const [reason, setReason] = useState('');
  const [kind, setKind] = useState<StepKind>('fallback_source'); const [ref, setRef] = useState(''); const [stepReason, setStepReason] = useState('');
  const [closeKind, setCloseKind] = useState<ClosureKind>('recovered'); const [note, setNote] = useState(''); const [wReason, setWReason] = useState('');

  const load = async () => {
    if (item === null) { setData(null); return; }
    const r = await api.list(scope, item.sourceId);
    if (!r.ok || r.data === undefined) { setData(null); setProblem(refusal(r, 'the remediations could not be read')); return; }
    setProblem(null); setData(r.data); setReceipt(r.data.receipt);
  };
  useEffect(() => { setSaid(null); setActProblem(null); void load(); }, [scope, item?.itemId]);
  const fail = (m: string): never => { setActProblem(m); throw new Error(m); };
  const open: Remediation | null = data?.remediations.find((x) => isOpen(x.state)) ?? null;
  const acted = async (what: string, r: { ok: boolean; status: number; data?: { remediation: { state: string }; receipt: { policyDecisionId: string; auditSeq: number } }; error?: { code: string; message: string } }) => {
    if (!r.ok || r.data === undefined) fail(`not ${what} — ${refusal(r, 'the server did not answer')}`);
    else { setSaid(`${what}: the remediation is ${r.data.remediation.state}`); setReceipt(r.data.receipt); await load(); }
  };

  return (
    <section aria-labelledby="remediation-h" style={cardStyle}>
      <h2 id="remediation-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Coverage remediation</h2>
      <p style={muted}>
        A source that lost its coverage is remediated here, from its coverage-loss item: a fallback source, a named re-collection run, or the gap
        accepted by a second person (never the owner). It closes recovered only once the source is healthy — automatically when the recovery is
        applied — or on the accepted gap. One remediation per source is open at a time.
      </p>
      {item === null ? <Empty>Select a source coverage-loss item in the queue to remediate it.</Empty> : (
        <>
          <p>Item <Mono>{short(item.itemId)}</Mono> — {item.title}</p>
          {problem !== null && <LiveStatus assertive><span style={critical}>not listed — {problem}</span></LiveStatus>}
          {data !== null && (
            <p>Source {data.source_name ?? 'source'} <Mono>{data.source_key ?? short(data.source_id)}</Mono> is <strong>{data.health_now.state}</strong> now
              <span style={muted}> (per {data.health_now.basis}{data.health_now.at === null ? '' : ` at ${fmtInstant(data.health_now.at)}`})</span></p>
          )}
          {data !== null && data.remediations.length > 0 && (
            <ScrollBox label="the source's remediations">
              <table className="eye-table" style={tableStyle}>
                <thead><tr><Th>Remediation</Th><Th>State</Th><Th>Owner</Th><Th>Gap</Th><Th>Steps</Th><Th>Closure</Th></tr></thead>
                <tbody>{data.remediations.map((x) => (
                  <tr key={x.remediation_id}>
                    <Td><Mono>{short(x.remediation_id)}</Mono><div style={{ fontSize: 'var(--eye-type-label-sm)' }}>{x.reason}</div></Td>
                    <Td><StateMark state={x.state} /></Td>
                    <Td><Mono>{short(x.owner_principal_id)}</Mono>{x.owner_principal_id === me.principalId ? ' (you)' : null}</Td>
                    <Td>
                      <div>{x.gap_from === null ? '—' : fmtInstant(x.gap_from)} → {x.gap_to === null ? 'open' : fmtInstant(x.gap_to)}</div>
                      {Object.entries(x.gap.measurements ?? {}).map(([dim, m]) => <div key={dim} style={{ fontSize: 'var(--eye-type-label-sm)' }}>{measurementLine(dim, m)}</div>)}
                    </Td>
                    <Td>{x.steps.length === 0 ? '—' : <ol style={{ margin: 0, paddingInlineStart: 'var(--eye-space-16)' }}>{x.steps.map((s) => <li key={s.step}>{stepLine(s)} — {s.reason} <span style={muted}>(<Mono>{short(s.by)}</Mono>)</span></li>)}</ol>}</Td>
                    <Td>{closureLine(x.closure)}{x.closed_at === null ? null : <div style={muted}>{fmtInstant(x.closed_at)}</div>}</Td>
                  </tr>
                ))}</tbody>
              </table>
            </ScrollBox>
          )}
          {data !== null && data.remediations.length === 0 && <Empty>No remediation of this source yet.</Empty>}

          {open === null ? (
            <>
              <h3 style={h3}>Open a remediation</h3>
              <div style={rowStyle}>
                {input('rm-owner', 'Owner (a principal id; you when empty)', owner, setOwner)}
                {input('rm-reason', 'Reason (8+ characters)', reason, setReason)}
              </div>
              <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                <GovernedButton label="Open the remediation" pendingLabel="opening" disabled={reason.trim().length < 8}
                  onRun={async () => { setActProblem(null); setSaid(null); await acted('opened', await api.open(scope, item.sourceId, item.itemId, owner, reason)); }} />
              </div>
            </>
          ) : (
            <>
              <h3 style={h3}>Add a step to <Mono>{short(open.remediation_id)}</Mono></h3>
              <div style={rowStyle}>
                <div><label htmlFor="rm-kind" style={{ display: 'block' }}>Step</label>
                  <select id="rm-kind" style={{ ...inputStyle, inlineSize: '100%' }} value={kind} onChange={(e) => setKind(e.target.value as StepKind)}>
                    {STEP_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select></div>
                {kind === 'accept_gap' ? null : input('rm-ref', kind === 'fallback_source' ? 'Fallback source id' : 'Collection run id (trigger it on the source page)', ref, setRef)}
                {input('rm-step-reason', 'Reason (8+ characters)', stepReason, setStepReason)}
              </div>
              <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                <GovernedButton label="Record the step" pendingLabel="recording" disabled={stepReason.trim().length < 8}
                  onRun={async () => { setActProblem(null); setSaid(null); await acted('step recorded', await api.step(scope, item.sourceId, open.remediation_id, kind, stepReason, ref)); }} />
              </div>
              <h3 style={h3}>Close or withdraw</h3>
              <div style={rowStyle}>
                <div><label htmlFor="rm-close" style={{ display: 'block' }}>Closure</label>
                  <select id="rm-close" style={{ ...inputStyle, inlineSize: '100%' }} value={closeKind} onChange={(e) => setCloseKind(e.target.value as ClosureKind)}>
                    {CLOSURE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                  </select></div>
                {input('rm-note', 'Note (optional)', note, setNote)}
                {input('rm-withdraw', 'Withdrawal reason (8+ characters)', wReason, setWReason)}
              </div>
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
                <GovernedButton label="Close" pendingLabel="closing"
                  onRun={async () => { setActProblem(null); setSaid(null); await acted('closed', await api.close(scope, item.sourceId, open.remediation_id, closeKind, note)); }} />
                <GovernedButton label="Withdraw" pendingLabel="withdrawing" variant="critical" disabled={wReason.trim().length < 8}
                  onRun={async () => { setActProblem(null); setSaid(null); await acted('withdrawn', await api.withdraw(scope, item.sourceId, open.remediation_id, wReason)); }} />
              </div>
            </>
          )}
          {actProblem !== null && <LiveStatus assertive><span style={critical}>{actProblem}</span></LiveStatus>}
          {said !== null && <LiveStatus><span>{said}</span></LiveStatus>}
        </>
      )}
      <Receipt receipt={receipt} />
    </section>
  );
}
