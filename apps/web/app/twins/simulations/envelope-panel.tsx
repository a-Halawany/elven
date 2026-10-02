'use client';
/**
 * CP-6 B30 §EN (0103; F-P5-04) — THE ENVELOPE PANEL of an open run: a run whose own contract lies OUTSIDE its model's operating envelope
 * is DISABLED for decision use; only a twin owner admits it as EXPLORATORY (the domain administrator is refused by the server), and a method
 * steward's CONCURRENCE (a second named human) comes before any promotion. Nothing renders for a run inside its envelope. The server
 * decides every act; its refusal is shown verbatim.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { envelope as api, exploratoryLine, outsideKeys, type EnvelopeRun } from '../../../lib/envelope-b30';
import { LiveStatus, Mono, cardStyle, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle } from '../../../components/ui';

type R = { policyDecisionId: string; auditSeq: number };
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;

export function EnvelopePanel({ runId, envelopeState, onDone }: { runId: string; envelopeState: string | undefined; onDone: (line: string, receipt: R) => Promise<void> }) {
  const { scope, me, isTwinOwner } = useShell();
  const isSteward = me.bindings.some((b) => b.roleCode === 'method_steward' && b.scope === 'DOMAIN' && b.domainId === scope.domainId);
  const [run, setRun] = useState<EnvelopeRun | null>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const read = async () => { const r = await api.run(scope, runId); setRun(r.ok && r.data !== undefined ? r.data.run : null); };
  useEffect(() => { setRun(null); setProblem(null); if (envelopeState === 'outside') void read(); }, [runId, envelopeState, scope]);
  if (envelopeState !== 'outside' || run === null) return null;
  const a = run.admission;
  return (
    <section aria-labelledby="env-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)', borderInlineStart: '4px solid var(--eye-color-critical)' }}>
      <h3 id="env-h" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>Outside the operating envelope</h3>
      <p><strong style={{ color: 'var(--eye-color-critical)' }}>{run.decision_use.label}</strong></p>
      <p>{exploratoryLine(run)}</p>
      <p style={{ fontSize: 'var(--eye-type-label-sm)' }}><Mono>{run.model_ref}</Mono>: {outsideKeys(run.envelope_check).join('; ')}
        {run.envelope_ack ? <> · acknowledged at opening by <Mono>{String(run.envelope_ack['acknowledged_by'] ?? '').slice(0, 8)}…</Mono> — {String(run.envelope_ack['reason'] ?? '')}</> : null}</p>
      {a !== null ? (
        <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>Admitted as exploratory {fmtInstant(a.admitted_at)} by <Mono>{a.admitted_by.slice(0, 8)}…</Mono> — {a.reason}
          {a.concurred_at !== null ? <> · concurred {fmtInstant(a.concurred_at)} by <Mono>{String(a.concurred_by).slice(0, 8)}…</Mono> — {a.concurrence_note}</> : null}</p>
      ) : null}
      {a === null && isTwinOwner && (run.state === 'completed' || run.state === 'partial') ? (
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', alignItems: 'end' }}>
          <div><label htmlFor="xa-reason" style={{ display: 'block' }}>Why admit it as exploratory (8+ characters)</label>
            <input id="xa-reason" type="text" style={{ ...inputStyle, minInlineSize: '22rem' }} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          <GovernedButton label="Admit as exploratory" pendingLabel="admitting" disabled={reason.trim().length < 8} onRun={async () => {
            const r = await api.admit(scope, runId, reason.trim());
            if (!r.ok || r.data === undefined) { const m = refusal(r, 'the admission was not answered'); setProblem(m); throw new Error(m); }
            setProblem(null); setReason(''); await read();
            await onDone(`run ${runId.slice(0, 8)}… admitted as EXPLORATORY — ${r.data.admission.decision_use.label}`, r.data.receipt);
          }} />
        </div>
      ) : null}
      {a !== null && a.concurred_at === null && isSteward ? (
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', alignItems: 'end' }}>
          <div><label htmlFor="xa-note" style={{ display: 'block' }}>Concurrence note (8+ characters)</label>
            <input id="xa-note" type="text" style={{ ...inputStyle, minInlineSize: '22rem' }} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <GovernedButton label="Concur" pendingLabel="concurring" disabled={note.trim().length < 8} onRun={async () => {
            const r = await api.concur(scope, runId, note.trim());
            if (!r.ok || r.data === undefined) { const m = refusal(r, 'the concurrence was not answered'); setProblem(m); throw new Error(m); }
            setProblem(null); setNote(''); await read();
            await onDone(`run ${runId.slice(0, 8)}… exploratory admission concurred — ${r.data.concurrence.decision_use.label}`, r.data.receipt);
          }} />
        </div>
      ) : null}
      {problem !== null ? <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>refused — {problem}</span></LiveStatus> : null}
    </section>
  );
}
