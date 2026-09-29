'use client';
/**
 * B36 (0094 §A5) attention — THE CONTEXT STRIP (UX-44-002): the active objective, horizon, scenario, classification, effective time and
 * the policy in force are EXPLICIT above the queue; what the context filters is counted, never dropped; and (0094 §A3) the HOLD BANNER —
 * a queue held by its evaluation is read-only until the executive releases it with a reason. Every line is the server's.
 */
import { useEffect, useState } from 'react';
import { attentionB36 as api, contextLine, filteredLine, holdLine, policyLine, RELEASE_ROLES, type QueueRead } from '../../../lib/attention-b36';
import type { Scope } from '../../../lib/observation';
import { LiveStatus, Mono, cardStyle, GovernedButton } from '../../../components/observation';
import { inputStyle, Receipt } from '../../../components/ui';

type Me = { bindings: Array<{ roleCode: string; scope: string; domainId: string | null }> };
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;

export function ContextStrip({ scope, me, refreshKey, onChanged }: { scope: Scope; me: Me; refreshKey?: string; onChanged?: () => void }) {
  const [q, setQ] = useState<QueueRead | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [said, setSaid] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const load = async () => {
    const r = await api.queue(scope, 500);
    if (!r.ok || r.data === undefined) { setQ(null); setProblem(refusal(r, 'the queue context could not be read')); return; }
    setProblem(null); setQ(r.data);
  };
  useEffect(() => { void load(); }, [scope, refreshKey]);
  const mayRelease = me.bindings.some((b) => (RELEASE_ROLES as readonly string[]).includes(b.roleCode) && (b.scope === 'PLATFORM' || (b.scope === 'DOMAIN' && b.domainId === scope.domainId)));
  const hold = q?.hold ?? null;
  return (
    <section aria-labelledby="context-h" style={{ ...cardStyle, borderInlineStart: `4px solid var(${hold === null ? '--eye-color-accent-strong' : '--eye-color-critical'})` }}>
      <h2 id="context-h" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>The queue&apos;s context</h2>
      {problem !== null && <LiveStatus assertive><span style={critical}>not read — {problem}</span></LiveStatus>}
      {q !== null && (
        <>
          <p data-testid="context-line"><strong>Context:</strong> {contextLine(q.context)}{q.context.digest !== null && <> · digest <Mono>{q.context.digest.slice(0, 12)}…</Mono></>}</p>
          <p data-testid="policy-line"><strong>Policy:</strong> {policyLine(q.policy)}</p>
          <p style={muted} data-testid="filtered-line">{filteredLine(q.counts)}. Ranked under context digest <Mono>{q.ranking.context_digest === null ? 'none (the default context)' : `${q.ranking.context_digest.slice(0, 12)}…`}</Mono>.</p>
          {q.filtered.length > 0 && (
            <details><summary>What the context filtered ({q.filtered.length})</summary>
              <ul aria-label="items filtered by the context">{q.filtered.map((f) => <li key={f.item_id}><Mono>{f.item_id.slice(0, 8)}…</Mono> {f.title} — {f.filtered_by.join(', ')} (linkage: {f.linkage})</li>)}</ul>
            </details>
          )}
          {hold !== null && (
            <div role="alert" data-testid="hold-banner" style={{ marginBlockStart: 'var(--eye-space-8)', padding: 'var(--eye-space-8)', border: '1px solid var(--eye-color-critical)', borderRadius: 'var(--eye-radius-sm)' }}>
              <p style={{ ...critical, fontWeight: 650, marginBlockStart: 0 }}>{holdLine(hold)}</p>
              <p style={muted}>Hold <Mono>{hold.hold_id}</Mono>; the governance item routed to the executive: <Mono>{hold.governance_item_id ?? '—'}</Mono>. Only <Mono>{RELEASE_ROLES.join(', ')}</Mono> may release{mayRelease ? '' : '; you hold none of these, so the server will refuse'}.</p>
              <label>Release reason <input style={{ ...inputStyle, inlineSize: '24rem' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="why the hold is released (8+ characters)" /></label>
              <div style={{ marginBlockStart: 'var(--eye-space-4)' }}>
                <GovernedButton label="Release the hold" pendingLabel="releasing" disabled={reason.trim().length < 8}
                  onRun={async () => {
                    setSaid(null);
                    const r = await api.release(scope, hold.hold_id, reason);
                    if (!r.ok || r.data === undefined) { const m = refusal(r, 'the release was refused'); setSaid(m); throw new Error(m); }
                    setReceipt(r.data.receipt); setSaid(`released: ${String((r.data.hold as Record<string, unknown>)['release_reason'] ?? '')}`); setReason(''); await load(); onChanged?.();
                  }} />
              </div>
              {said !== null && <p role="status">{said}</p>}
              <Receipt receipt={receipt} />
            </div>
          )}
        </>
      )}
    </section>
  );
}
