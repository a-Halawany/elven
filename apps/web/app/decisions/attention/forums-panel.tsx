'use client';
/**
 * B36 (0094 §A6) attention — GOVERNANCE FORUMS over the same memory (V01-T-028): a forum is a room of kind forum convened by the executive
 * operator (members, a cadence period, a context); its members review the SAME attention items under the forum's context — no copy: one
 * item, one acceptance, whichever forum looks. The server decides who may convene and who is a member.
 */
import { useEffect, useState } from 'react';
import { attentionB36 as api, CLASSIFICATIONS, FORUM_CONVENER_ROLES, FORUM_PERIODS, HORIZONS, filteredLine, type Forum, type ForumForm, type QueueItem, type QueueCounts } from '../../../lib/attention-b36';
import type { Scope } from '../../../lib/observation';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type Me = { bindings: Array<{ roleCode: string; scope: string; domainId: string | null }> };
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3)', marginBlockEnd: 'var(--eye-space-2)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;

export function ForumsPanel({ scope, me }: { scope: Scope; me: Me }) {
  const [forums, setForums] = useState<Forum[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [form, setForm] = useState<ForumForm>({ title: '', members: '', period: 'monthly', objectiveId: '', horizon: '90d', scenarioId: '', classification: 'internal' });
  const [said, setSaid] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [queue, setQueue] = useState<{ items: QueueItem[]; counts: QueueCounts; context: Record<string, unknown> } | null>(null);
  const [queueProblem, setQueueProblem] = useState<string | null>(null);
  const set = (k: keyof ForumForm) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const load = async () => {
    const r = await api.forums(scope);
    if (!r.ok || r.data === undefined) { setForums(null); setProblem(refusal(r, 'the forums could not be read')); return; }
    setProblem(null); setForums(r.data.forums);
  };
  const openForum = async (roomId: string) => {
    if (open === roomId) { setOpen(null); setQueue(null); return; }
    setOpen(roomId); setQueue(null); setQueueProblem(null);
    const r = await api.forumQueue(scope, roomId);
    if (!r.ok || r.data === undefined) { setQueueProblem(refusal(r, 'the forum\'s queue could not be read')); return; }
    setQueue({ items: r.data.items, counts: r.data.counts, context: r.data.context });
  };
  useEffect(() => { void load(); }, [scope]);
  const mayConvene = me.bindings.some((b) => (FORUM_CONVENER_ROLES as readonly string[]).includes(b.roleCode) && (b.scope === 'PLATFORM' || (b.scope === 'DOMAIN' && b.domainId === scope.domainId)));

  return (
    <section aria-labelledby="forums-h" style={cardStyle}>
      <h2 id="forums-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Forums</h2>
      <p style={muted}>
        A forum&apos;s members review the same attention items under the forum&apos;s context — nothing is copied: an item accepted in one forum reads
        accepted in every other. Only <Mono>{FORUM_CONVENER_ROLES.join(', ')}</Mono> may convene one{mayConvene ? '' : '; you hold none of these, so the server will refuse'}.
      </p>
      {problem !== null && <LiveStatus assertive><span style={critical}>not listed — {problem}</span></LiveStatus>}
      {forums === null ? (problem === null ? <Empty>reading the forums…</Empty> : null) : forums.length === 0 ? <Empty>No forum is convened in this domain.</Empty> : (
        <ScrollBox label="forums">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Forum</Th><Th>Cadence</Th><Th>Context</Th><Th>Members</Th><Th>Next review</Th><Th>Queue</Th></tr></thead>
            <tbody>{forums.map((f) => (
              <tr key={f.room_id} data-testid="forum-row">
                <Td>{f.title}</Td><Td>{f.forum_context.period} ({f.review_every_days} d)</Td>
                <Td>{f.forum_context.objective_id === null ? 'the whole domain' : <Mono>{f.forum_context.objective_id.slice(0, 8)}…</Mono>} · {f.forum_context.horizon} · {f.forum_context.classification}</Td>
                <Td>{f.members.length}</Td><Td>{fmtInstant(f.next_review_at)}</Td>
                <Td><button type="button" aria-expanded={open === f.room_id} style={{ ...inputStyle, cursor: 'pointer' }} onClick={() => void openForum(f.room_id)}>{open === f.room_id ? 'hide' : 'read'}</button></Td>
              </tr>
            ))}</tbody>
          </table>
        </ScrollBox>
      )}
      {open !== null && (
        <div data-testid="forum-queue" style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <h3 style={h3}>The forum&apos;s queue</h3>
          {queueProblem !== null && <LiveStatus assertive><span style={critical}>not read — {queueProblem}</span></LiveStatus>}
          {queue === null ? (queueProblem === null ? <Empty>reading…</Empty> : null) : (
            <>
              <p style={muted}>{filteredLine(queue.counts)} — under the forum&apos;s context (digest <Mono>{String(queue.context['digest'] ?? '').slice(0, 12)}…</Mono>).</p>
              {queue.items.length === 0 ? <Empty>No item is served under this forum&apos;s context.</Empty> : (
                <ScrollBox label="the forum's items">
                  <table className="eye-table" style={tableStyle}>
                    <thead><tr><Th>#</Th><Th>Item</Th><Th>Class</Th><Th>State</Th><Th>Priority accepted</Th><Th>Linkage</Th></tr></thead>
                    <tbody>{queue.items.map((it) => (
                      <tr key={it.item_id} data-testid="forum-item"><Td>{it.rank_position}</Td><Td>{it.title}</Td><Td mono>{it.signal_class}</Td><Td>{it.state}</Td>
                        <Td>{it.priority_accepted === null ? '—' : <>by <Mono>{it.priority_accepted.accepted_by.slice(0, 8)}…</Mono> at {fmtInstant(it.priority_accepted.accepted_at)}</>}</Td><Td>{it.linkage}</Td></tr>
                    ))}</tbody>
                  </table>
                </ScrollBox>
              )}
            </>
          )}
        </div>
      )}
      <h3 style={h3}>Convene a forum</h3>
      <div style={rowStyle}>
        <label>Title <input style={{ ...inputStyle, inlineSize: '100%' }} value={form.title} onChange={(e) => set('title')(e.target.value)} placeholder="the forum's name" /></label>
        <label>Members (principal ids, one per line) <textarea style={{ ...inputStyle, inlineSize: '100%' }} rows={3} value={form.members} onChange={(e) => set('members')(e.target.value)} /></label>
        <label>Cadence <select style={{ ...inputStyle, inlineSize: '100%' }} value={form.period} onChange={(e) => set('period')(e.target.value)}>{FORUM_PERIODS.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
        <label>Objective (optional) <input style={{ ...inputStyle, inlineSize: '100%' }} value={form.objectiveId} onChange={(e) => set('objectiveId')(e.target.value)} placeholder="a strategy object id, or empty for the whole domain" /></label>
        <label>Horizon <select style={{ ...inputStyle, inlineSize: '100%' }} value={form.horizon} onChange={(e) => set('horizon')(e.target.value)}>{HORIZONS.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
        <label>Scenario (optional) <input style={{ ...inputStyle, inlineSize: '100%' }} value={form.scenarioId} onChange={(e) => set('scenarioId')(e.target.value)} placeholder="a scenario id, or empty" /></label>
        <label>Classification <select style={{ ...inputStyle, inlineSize: '100%' }} value={form.classification} onChange={(e) => set('classification')(e.target.value)}>{CLASSIFICATIONS.map((o) => <option key={o} value={o}>{o}</option>)}</select></label>
      </div>
      <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
        <GovernedButton label="Convene the forum" pendingLabel="convening" disabled={form.title.trim().length < 2 || form.members.trim() === ''}
          onRun={async () => {
            setSaid(null);
            const r = await api.convene(scope, form);
            if (!r.ok || r.data === undefined) { const m = refusal(r, 'the forum was not convened'); setSaid(m); throw new Error(m); }
            setReceipt(r.data.receipt); setSaid(`convened: ${String((r.data.forum as Record<string, unknown>)['title'] ?? '')}`); setForm((f) => ({ ...f, title: '', members: '' })); await load();
          }} />
      </div>
      {said !== null && <p role="status">{said}</p>}
      <Receipt receipt={receipt} />
    </section>
  );
}
