'use client';
/**
 * B24 (0086) — DELIVERIES AND RECEIPTS of one attention item, BESIDE its acknowledgement.
 *
 * The attention timer (the attention agent, on a schedule) delivers every routed, escalated or unrouted item on the channels of the
 * item's own policy version, to its owner and the holders of its roles. Each attempt is listed with its state and the channel's
 * RECEIPT, the machine proof of placement. A failed attempt is retried after 1, 5, 25 … minutes and abandoned after the last one. An
 * abandoned delivery does not change the item, which still escalates by its deadline.
 *
 * A receipt is not an acknowledgement. The acknowledgement is the person's act on the item (receipt of the item, not agreement), and
 * the two are shown side by side because neither sets the other. The demo-mailbox channel is SYNTHETIC: a local sink inside the
 * product. Nothing in it was sent by email, SMS or Teams; a real provider is owner decision D6. Every row here is the server's.
 */
import { useEffect, useState } from 'react';
import { deliveries as api, channelLabel, deliveryStateMark, receiptLine, type ItemDeliveries, type MailMessage } from '../../../lib/attention';
import type { Scope } from '../../../lib/observation';
import { DefinitionRow, Empty, LiveStatus, Mono, ScrollBox, fmtInstant } from '../../../components/observation';
import { tableStyle, Th, Td } from '../../../components/ui';

const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : v === null || v === undefined || v === '' ? '—' : String(v));
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const linkButton = { font: 'inherit', background: 'none', border: 'none', color: 'var(--eye-color-accent-strong)', cursor: 'pointer', padding: 0, textDecoration: 'underline' } as const;
const synthetic = {
  color: 'var(--eye-color-synthetic)', border: '1px solid var(--eye-color-synthetic)', borderRadius: 'var(--eye-radius-sm)', paddingInline: 'var(--eye-space-4)',
  fontSize: 'var(--eye-type-label-sm)', fontWeight: 650, whiteSpace: 'nowrap',
} as const;

/** The SYNTHETIC mark of the demo mailbox: glyph, word and colour — never shown without it. */
function SyntheticChannel({ channel }: { channel: string }) {
  if (channel !== 'demo-mailbox') return <Mono>{channel}</Mono>;
  return <span><Mono>demo-mailbox</Mono> <span style={synthetic} title={channelLabel(channel)}>⬡ SYNTHETIC</span></span>;
}
function StateWord({ state }: { state: string }) {
  const s = deliveryStateMark(state);
  return <span style={{ color: `var(${s.token})`, fontWeight: 650, fontSize: 'var(--eye-type-label-sm)', whiteSpace: 'nowrap' }}><span aria-hidden="true">{s.glyph}</span> {s.text}</span>;
}

/** `refreshKey` changes when the item changes (an acknowledgement, an escalation): the receipts are read again. */
export function DeliveriesPanel({ scope, itemId, me, refreshKey }: { scope: Scope; itemId: string; me: { principalId: string }; refreshKey?: string }) {
  const [data, setData] = useState<ItemDeliveries | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [mail, setMail] = useState<MailMessage[] | null>(null);
  const [mailNote, setMailNote] = useState<string | null>(null);
  const [mailProblem, setMailProblem] = useState<string | null>(null);

  const load = async () => {
    const r = await api.forItem(scope, itemId);
    if (!r.ok || r.data === undefined) { setData(null); setProblem(refusal(r, 'the deliveries could not be read')); return; }
    setProblem(null); setData(r.data);
  };
  const loadMail = async (recipient: string | null) => {
    const r = await api.mailbox(scope, recipient);
    if (!r.ok || r.data === undefined) { setMail(null); setMailProblem(refusal(r, 'the demo mailbox could not be read')); return; }
    setMailProblem(null); setMail(r.data.messages); setMailNote(r.data.note);
  };
  useEffect(() => { setMail(null); void load(); }, [scope, itemId, refreshKey]);

  const ack = data?.acknowledgement ?? null;
  return (
    <>
      <h3 style={h3}>Deliveries and receipts{data === null ? '' : ` (${data.deliveries.length})`}</h3>
      <p style={muted}>
        A <strong>receipt</strong> is the channel's proof that the item was placed with a recipient. An <strong>acknowledgement</strong> is
        a person's act on the item: a receipt of the item, not an agreement. They are shown side by side because neither sets the other.
        The <Mono>demo-mailbox</Mono> channel is <strong>SYNTHETIC</strong>. It is a local sink inside the product: no email, SMS or Teams
        message is sent (a real provider is owner decision D6). A failed attempt is retried after 1, 5 and 25 minutes, then abandoned.
        An abandoned delivery leaves the item as it is, and it still escalates by its deadline.
      </p>
      {problem !== null && <LiveStatus assertive><span style={critical}>not read — {problem}</span></LiveStatus>}
      {data === null ? (problem === null ? <Empty>reading the deliveries…</Empty> : null) : (
        <>
          <dl style={{ margin: 0 }}>
            <DefinitionRow term="Acknowledgement (the person's act)">
              {ack === null || !ack.acknowledged ? 'not acknowledged — a delivery\'s receipt is not an acknowledgement'
                : <>{fmtInstant(ack.acknowledged_at)} by <Mono>{short(ack.acknowledged_by)}</Mono>{ack.acknowledged_by === me.principalId ? ' (you)' : ''} (receipt of the item, not agreement)</>}
            </DefinitionRow>
            <DefinitionRow term="Receipts (the channels' proofs)">
              {(['delivered', 'sent', 'queued', 'failed', 'abandoned'] as const).map((s) => `${s} ${data.counts[s] ?? 0}`).join(' · ')}
            </DefinitionRow>
          </dl>
          {data.deliveries.length === 0 ? <Empty>No delivery is planned for this item. The attention timer plans deliveries for routed, escalated and unrouted items on its next tick.</Empty> : (
            <ScrollBox label="item deliveries">
              <table className="eye-table" style={tableStyle}>
                <thead><tr><Th>Channel</Th><Th>Recipient</Th><Th>For</Th><Th>Attempt</Th><Th>State</Th><Th>Receipt</Th><Th>Attempted</Th><Th>Next attempt</Th></tr></thead>
                <tbody>{data.deliveries.map((d) => (
                  <tr key={d.delivery_id}>
                    <Td><SyntheticChannel channel={d.channel} /></Td>
                    <Td mono>{short(d.recipient)}{d.recipient === me.principalId ? ' (you)' : ''}</Td>
                    <Td mono>{d.item_event}</Td>
                    <Td mono>{d.attempt} of {d.max_attempts}</Td>
                    <Td><StateWord state={String(d.state)} /></Td>
                    <Td>{receiptLine(d)}</Td>
                    <Td>{d.attempted_at === null ? '—' : fmtInstant(d.attempted_at)}</Td>
                    <Td>{d.next_attempt_at === null ? '—' : fmtInstant(d.next_attempt_at)}</Td>
                  </tr>
                ))}</tbody>
              </table>
            </ScrollBox>
          )}
          <p style={{ ...muted, fontSize: 'var(--eye-type-label-sm)' }}>{data.note}</p>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--eye-space-8)' }}>
            <button type="button" style={linkButton} onClick={() => { void loadMail(me.principalId); }}>Show my synthetic demo mailbox</button>
            <button type="button" style={linkButton} onClick={() => { void loadMail(null); }}>Show the domain's synthetic demo mailbox</button>
          </div>
          {mailProblem !== null && <LiveStatus assertive><span style={critical}>not read — {mailProblem}</span></LiveStatus>}
          {mail !== null && (
            <>
              <p><span style={synthetic}>⬡ SYNTHETIC</span> {mailNote}</p>
              {mail.length === 0 ? <Empty>The demo mailbox holds no message for this reading.</Empty> : (
                <ScrollBox label="synthetic demo mailbox">
                  <table className="eye-table" style={tableStyle}>
                    <thead><tr><Th>Delivered</Th><Th>Recipient</Th><Th>Subject</Th><Th>Body digest</Th><Th>Delivery</Th></tr></thead>
                    <tbody>{mail.map((m) => (
                      <tr key={m.message_id}>
                        <Td>{fmtInstant(m.delivered_at)}</Td>
                        <Td mono>{short(m.recipient)}{m.recipient === me.principalId ? ' (you)' : ''}</Td>
                        <Td>{m.subject}</Td>
                        <Td mono>{short(m.body_digest)}</Td>
                        <Td mono>{short(m.delivery_id)}</Td>
                      </tr>
                    ))}</tbody>
                  </table>
                </ScrollBox>
              )}
            </>
          )}
        </>
      )}
    </>
  );
}
