'use client';
/**
 * B36 (0094 §A1, §A2) attention — ACCEPT-PRIORITY and THE RESUME, beside the act panel of the selected item.
 *
 * Accept-priority is the accountable person's DISTINCT act: "I accept this item's rank and take it" — the server records the DIGEST of the
 * evaluation accepted, the CONSEQUENCE preview (what accepting commits the person to: the response window, the escalation) and a SIGNATURE
 * (Ed25519 by key reference, kind queue_transition) in the same write; an agent is refused at the gate, a second acceptance at the port.
 * The resume: an act whose settle FAILED after its governed action committed is shown as such and RESUMED by its launcher or the executive
 * operator — the server re-runs the settle from the audit chain and never performs the governed action again (it says so: re_executed false).
 */
import { useEffect, useState } from 'react';
import { attentionB36 as api, actStateLine, canResume, consequenceLines, type Acceptance, type Resumption, type Signature } from '../../../lib/attention-b36';
import type { Scope } from '../../../lib/observation';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type Row = Record<string, unknown>;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3)', marginBlockEnd: 'var(--eye-space-2)' } as const;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  r.error === undefined ? `${fallback} (HTTP ${r.status})` : `${r.error.code}: ${r.error.message}`;

export function PriorityPanel({ scope, item, refreshKey, onChanged }: { scope: Scope; item: { item_id: string; title: string; state: string }; refreshKey?: string; onChanged?: () => void }) {
  const [acceptance, setAcceptance] = useState<Acceptance | null>(null);
  const [signatures, setSignatures] = useState<Signature[]>([]);
  const [acts, setActs] = useState<Row[]>([]);
  const [resumptions, setResumptions] = useState<Resumption[]>([]);
  const [signing, setSigning] = useState<{ bound: boolean; key: string | null } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);

  const load = async () => {
    const r = await api.acceptance(scope, item.item_id);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the acceptance could not be read')); return; }
    setProblem(null); setAcceptance(r.data.acceptance); setSignatures(r.data.signatures); setActs(r.data.acts); setResumptions(r.data.resumptions); setSigning(r.data.signing);
  };
  useEffect(() => { setSaid(null); setReceipt(null); void load(); }, [scope, item.item_id, refreshKey]);
  const live = ['open', 'escalated', 'unrouted', 'acknowledged'].includes(item.state);
  const failed = acts.filter((a) => canResume(String(a['state'])));

  return (
    <section aria-labelledby="priority-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-3)' }}>
      <h3 id="priority-h" style={h3}>Accept the priority</h3>
      <p style={muted}>
        A distinct act of the item&apos;s accountable person (its owner, or a holder of its routed roles): you accept this item&apos;s rank and take it. The server
        records the digest of the evaluation you accept, what accepting commits you to, and signs the transition
        {signing !== null && (signing.bound ? <> with key <Mono>{signing.key}</Mono></> : <strong style={critical}> — no signing key is bound: the server will refuse rather than sign nothing</strong>)}.
      </p>
      {problem !== null && <LiveStatus assertive><span style={critical}>not read — {problem}</span></LiveStatus>}
      {acceptance !== null ? (
        <div data-testid="acceptance">
          <p><strong>Accepted</strong> by <Mono>{acceptance.accepted_by.slice(0, 8)}…</Mono> at {fmtInstant(acceptance.accepted_at)} — evaluation digest <Mono>{acceptance.evaluation_digest.slice(0, 16)}…</Mono>{acceptance.note !== null && <> — “{acceptance.note}”</>}</p>
          <ul aria-label="the consequence accepted">{consequenceLines(acceptance.consequence).map((l, i) => <li key={i}>{l}</li>)}</ul>
          {signatures.length === 0 ? <p style={critical}>No signature is recorded for this acceptance.</p> : (
            <ul aria-label="signatures">{signatures.map((s) => (
              <li key={s.signature_id} data-testid="acceptance-signature">
                Signed by <Mono>{s.signer.slice(0, 8)}…</Mono> at {fmtInstant(s.signed_at)} — {s.algorithm} key <Mono>{s.key_id}</Mono>, signature <Mono>{s.signature.slice(0, 16)}…</Mono>
                {' '}{s.verified === true ? <span style={{ color: 'var(--eye-color-healthy)', fontWeight: 650 }}>verified against the bound key</span> : <span style={critical}>not verified by this deployment&apos;s key</span>}
              </li>
            ))}</ul>
          )}
        </div>
      ) : !live ? <Empty>A {item.state} item&apos;s priority is not accepted.</Empty> : (
        <>
          <label>Note (optional) <input style={{ ...inputStyle, inlineSize: '24rem' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="what you take on, in your words" /></label>
          <div style={{ marginBlockStart: 'var(--eye-space-4)' }}>
            <GovernedButton label="Accept this item's priority" pendingLabel="accepting"
              onRun={async () => {
                setSaid(null);
                const r = await api.acceptPriority(scope, item.item_id, note);
                await load();
                if (!r.ok || r.data === undefined) { const m = refusal(r, 'the acceptance was refused'); setSaid(m); throw new Error(m); }
                setReceipt(r.data.receipt); setSaid(`accepted and signed (${String((r.data.signature as Row)['key_id'] ?? '')})`); onChanged?.();
              }} />
          </div>
        </>
      )}
      {said !== null && <p role="status">{said}</p>}
      <Receipt receipt={receipt} />

      {failed.length > 0 && (
        <div data-testid="resume-block" style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <h3 style={h3}>Resume a settle that failed</h3>
          <p style={muted}>
            The governed action of this act COMMITTED and the settle that records it failed. The launcher or the executive operator resumes the
            settle: the server settles the act from the audit chain&apos;s record of the committed action and never performs the action again.
          </p>
          {failed.map((a) => (
            <div key={String(a['act_id'])} style={{ display: 'flex', gap: 'var(--eye-space-8)', alignItems: 'center', flexWrap: 'wrap' }}>
              <span><Mono>{String(a['action_key'])}</Mono> — {actStateLine(a as never)}</span>
              <GovernedButton label={`Resume: ${String(a['action_key'])}`} pendingLabel="resuming" variant="quiet"
                onRun={async () => {
                  setSaid(null);
                  const r = await api.resume(scope, String(a['act_id']));
                  await load();
                  if (!r.ok || r.data === undefined) { const m = refusal(r, 'the resume was refused'); setSaid(m); throw new Error(m); }
                  setReceipt(r.data.receipt); setSaid(`resumed — ${actStateLine(r.data.act as never)}; re-executed: ${String(r.data.re_executed)}`); onChanged?.();
                }} />
            </div>
          ))}
        </div>
      )}
      {resumptions.length > 0 && (
        <ScrollBox label="resumptions of this item's acts">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Act</Th><Th>From</Th><Th>Failure</Th><Th>Committed action</Th><Th>Resumed</Th></tr></thead>
            <tbody>{resumptions.map((r) => (
              <tr key={r.resumption_id} data-testid="resumption-row"><Td mono>{r.act_id.slice(0, 8)}…</Td><Td>{r.from_state}</Td><Td>{String((r.failure ?? {})['reason'] ?? '—')}</Td><Td mono>audit #{String(r.action_receipt['auditSeq'] ?? '?')} — not re-executed</Td><Td>{fmtInstant(r.resumed_at)} by <Mono>{r.resumed_by.slice(0, 8)}…</Mono></Td></tr>
            ))}</tbody>
          </table>
        </ScrollBox>
      )}
    </section>
  );
}
