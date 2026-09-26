'use client';
/**
 * B24 (0086) — THE DEPRIORITIZED VIEW, beside the attention queue (V00-T-069 "see what was deprioritized … understand why an item is
 * elevated"; PR-44-005 / UX-44-005: overload declared, ranking reasons exposed, severe items never hidden).
 *
 * Three lists, all the server's: the items WAITING FOR CAPACITY (material, held by the enforced overload rule because their owner is at
 * the cap — each with the load, the window, the items holding the capacity and its rank), the items BELOW THE THRESHOLDS or abstained on
 * (each with the engine's own reasons, the further dimensions and its rank), and the RECENT ELEVATIONS with the server's explanation of
 * why each one left the waiting list. The rank is lexicographic over transparent dimensions — never a score. C3 and C4 items are never
 * held for capacity. The rebalance runs on the attention tick's schedule; an operator (domain_admin, executive) may run it now — the
 * control is shown to everyone and the server's refusal is shown as it states it.
 */
import { useEffect, useState } from 'react';
import { materiality as api, REBALANCE_ROLES, furtherLine, overloadRuleLine, rankLine, waitingWhy, type DeprioritizedRow, type DeprioritizedView, type Rebalanced } from '../../../lib/attention';
import type { Scope } from '../../../lib/observation';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, GovernedButton, fmtInstant } from '../../../components/observation';
import { tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : v === null || v === undefined || v === '' ? '—' : String(v));
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;

function Rows({ rows, caption, why }: { rows: DeprioritizedRow[]; caption: string; why: boolean }) {
  return (
    <ScrollBox>
      <table style={tableStyle}>
        <caption style={{ textAlign: 'start', ...muted }}>{caption}</caption>
        <thead><tr><Th>#</Th><Th>Item</Th><Th>Owner</Th><Th>Why it waits</Th><Th>Rank (lexicographic)</Th><Th>Further dimensions</Th></tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={r.item_id}>
              <Td><Mono>{i + 1}</Mono></Td>
              <Td><span style={{ fontWeight: 650 }}>{r.title}</span><br /><Mono>{r.signal_class}</Mono> · <Mono>{short(r.item_id)}</Mono></Td>
              <Td><Mono>{short(r.owner_principal_id)}</Mono></Td>
              <Td>{waitingWhy(r)}{why && r.overload !== null && r.overload.displaced_by.length > 0 && <><br /><span style={muted}>holding the capacity: {r.overload.displaced_by.map(short).join(', ')}</span></>}</Td>
              <Td>{rankLine(r.rank)}</Td>
              <Td><span style={muted}>{furtherLine(r.dimensions)}</span></Td>
            </tr>
          ))}
        </tbody>
      </table>
    </ScrollBox>
  );
}

export function DeprioritizedPanel({ scope, me }: { scope: Scope; me: { bindings: Array<{ roleCode: string; scope: string; domainId?: string | null }> } }) {
  const [view, setView] = useState<DeprioritizedView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [answer, setAnswer] = useState<Rebalanced | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [actProblem, setActProblem] = useState<string | null>(null);

  const load = async () => {
    const r = await api.deprioritized(scope);
    if (!r.ok || r.data === undefined) { setView(null); setProblem(refusal(r, 'the deprioritized view could not be read')); return; }
    setProblem(null); setView(r.data);
  };
  useEffect(() => { void load(); }, [scope]);
  const mayRebalance = me.bindings.some((b) => (REBALANCE_ROLES as readonly string[]).includes(b.roleCode) && b.scope === 'DOMAIN' && b.domainId === scope.domainId);

  return (
    <section aria-labelledby="deprioritized-h" style={cardStyle}>
      <h2 id="deprioritized-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Deprioritized — and why</h2>
      <p style={muted}>
        Nothing here is hidden or dropped. An item <strong>waits for capacity</strong> when its owner already holds the most open items the
        policy allows; consequence C3 and C4 never wait. An item <strong>below the thresholds</strong> carries the engine&apos;s own reasons.
        Both are ordered by their <strong>rank</strong>: consequence first, then the time left to act, then confidence, exposure and strategic
        relevance — the first one that differs decides; there is no score.
      </p>
      {problem !== null && <LiveStatus assertive><span style={critical}>not listed — {problem}</span></LiveStatus>}
      {view === null && problem === null && <Empty>reading the deprioritized view…</Empty>}
      {view !== null && (
        <>
          <p><strong>Overload rule:</strong> {overloadRuleLine(view.overload)}</p>
          <h3 style={h3}>Waiting for capacity ({view.waiting.length})</h3>
          {view.waiting.length === 0 ? <Empty>No item waits for capacity.</Empty> : <Rows rows={view.waiting} caption="Held by the overload rule, highest rank first" why />}
          <div style={{ marginBlock: 'var(--eye-space-8)' }}>
            <GovernedButton label="Rebalance now" pendingLabel="rebalancing" disabled={view.waiting.length === 0}
              onRun={async () => {
                setActProblem(null); setAnswer(null); setReceipt(null);
                const r = await api.rebalance(scope);
                if (!r.ok || r.data === undefined) { setActProblem(refusal(r, 'the rebalance was refused')); return; }
                setAnswer(r.data.rebalance); setReceipt(r.data.receipt); await load();
              }} />
            {!mayRebalance && <span style={{ ...muted, marginInlineStart: 'var(--eye-space-8)' }}>the server admits domain_admin and executive; the attention tick rebalances on its own schedule</span>}
          </div>
          {actProblem !== null && <LiveStatus assertive><span style={critical}>{actProblem}</span></LiveStatus>}
          {answer !== null && (
            <LiveStatus>
              {answer.elevated.length === 0 ? 'Nothing elevated: every owner with a waiting item is still at the cap.' : `${answer.elevated.length} item(s) elevated.`}
              {answer.waiting.length > 0 && ` ${answer.waiting.length} still waiting.`} <span style={muted}>at {fmtInstant(answer.at)}</span>
              <Receipt receipt={receipt} />
            </LiveStatus>
          )}
          <h3 style={h3}>Below the thresholds or abstained ({view.below.length})</h3>
          {view.below.length === 0 ? <Empty>No item is below the thresholds.</Empty> : <Rows rows={view.below} caption="The engine's reasons under the version each was judged by, highest rank first" why={false} />}
          <h3 style={h3}>Why elevated — the latest elevations ({view.elevated.length})</h3>
          {view.elevated.length === 0 ? <Empty>No item has been elevated yet.</Empty> : (
            <ScrollBox>
              <table style={tableStyle}>
                <thead><tr><Th>When</Th><Th>Item</Th><Th>To</Th><Th>Why elevated</Th><Th>Now</Th></tr></thead>
                <tbody>
                  {view.elevated.map((e) => (
                    <tr key={`${e.item_id}-${e.occurred_at ?? ''}`}>
                      <Td>{e.occurred_at === null ? '—' : fmtInstant(e.occurred_at)}</Td>
                      <Td><span style={{ fontWeight: 650 }}>{e.title ?? '—'}</span><br /><Mono>{short(e.item_id)}</Mono></Td>
                      <Td><Mono>{e.to_state ?? '—'}</Mono>{e.exempt && <> · exempt</>}</Td>
                      <Td>{e.explanation ?? 'no explanation recorded'}</Td>
                      <Td><Mono>{e.state_now ?? '—'}</Mono></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollBox>
          )}
        </>
      )}
    </section>
  );
}
