'use client';
/**
 * Briefings — a room's members and cadence, review overdue in words, and briefings
 * composed from stored records under a bound baseline: what changed, why it matters,
 * who owns it, which window is closing. Degraded or blocked sources never render as
 * normal; a narrative is labelled and cites only included items.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { decisions as api, type Room, type Briefing } from '../../../lib/decisions';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, fmtInstant } from '../../../components/observation';
import { tableStyle, Th, Td, buttonStyle, Receipt as ReceiptNote, ErrorNote } from '../../../components/ui';

const short = (v: unknown): string => (typeof v === 'string' ? `${v.slice(0, 8)}…` : '—');
const SOURCE_TEXT: Record<string, string> = { live: '● live', replayed: '◍ REPLAYED', degraded: '◍ DEGRADED', blocked: '✕ BLOCKED', 'operator-upload': '⇧ operator upload', internal: '◦ internal record' };
const left = (s: number): string => (s < 0 ? `overdue by ${Math.round(-s / 3600)} h` : s < 86_400 ? `${Math.round(s / 3600)} h left` : `${Math.round(s / 86_400)} d left`);

export default function BriefingsPage() {
  const { scope, isExecutive, isDecisionOwner, isApprover, isAuthority } = useShell();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => { void (async () => { const r = await api.rooms(scope); if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the rooms could not be read'); return; } setRooms(r.data.rooms); })(); }, [scope]);
  const openRoom = async (id: string) => {
    const r = await api.room(scope, id);
    if (!r.ok || r.data === undefined) { setError(r.error ?? null); return; }
    setRoom(r.data.room); setBriefing(null); setError(null); setReceipt(null);
  };
  const openBriefing = async (id: string) => {
    const r = await api.briefing(scope, id);
    if (!r.ok || r.data === undefined) { setError(r.error ?? null); return; }
    setBriefing(r.data.briefing); setError(null); setReceipt(r.data.receipt);
  };
  const compose = async () => {
    if (room === null) return;
    setBusy(true); const r = await api.compose(scope, room.room_id); setBusy(false);
    if (!r.ok || r.data === undefined) { setError(r.error ?? null); return; }
    setReceipt(r.data.receipt); setBriefing(r.data.briefing); await openRoom(room.room_id); setBriefing(r.data.briefing);
  };
  const review = async () => {
    if (room === null) return;
    setBusy(true); const r = await api.review(scope, room.room_id, 'Reviewed in the room at the cadence.'); setBusy(false);
    if (!r.ok || r.data === undefined) { setError(r.error ?? null); return; }
    setReceipt(r.data.receipt); await openRoom(room.room_id);
  };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rooms === null) return <Empty>reading rooms…</Empty>;
  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Briefings</h1>
      {rooms.length === 0 ? <Empty>No decision room is open.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <caption style={{ captionSide: 'top', textAlign: 'start', color: 'var(--eye-color-ink-muted)' }}>{rooms.length} room(s)</caption>
          <thead><tr><Th>Room</Th><Th>State</Th><Th>Cadence</Th><Th>Review</Th><Th>Membership</Th></tr></thead>
          <tbody>{rooms.map((r) => (
            <tr key={r.room_id}>
              <Td><button type="button" onClick={() => void openRoom(r.room_id)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-default)', cursor: 'pointer', textDecoration: 'underline', textAlign: 'start' }}>{r.title}</button></Td>
              <Td>{r.state}</Td><Td mono>every {r.review_every_days} day(s)</Td>
              <Td>{r.review_overdue ? <strong style={{ color: 'var(--eye-color-critical)' }}>REVIEW OVERDUE since {fmtInstant(r.next_review_at)}</strong> : `next review due ${fmtInstant(r.next_review_at)}`}</Td>
              <Td>{r.member ? 'member' : 'not a member — the room and its briefings are read by members'}</Td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <ErrorNote error={error} />
      {room === null ? null : (
        <section aria-labelledby="room-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="room-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{room.title}</h2>
          <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>room state <strong>{room.state}</strong> · package <strong>{room.package_title ?? short(room.package_id)}</strong> ({room.package_state ?? '—'}) · owner <Mono>{short(room.owner_principal_id)}</Mono> · <strong>{room.review_status ?? (room.review_overdue ? 'review overdue' : 'review on cadence')}</strong></p>
          <dl>
            <DefinitionRow term="Members">{(room.members ?? []).filter((m) => m.live).map((m) => <span key={m.principal_id}><Mono>{short(m.principal_id)}</Mono> ({m.role}) </span>)}</DefinitionRow>
            <DefinitionRow term="Briefings">{(room.briefings ?? []).length === 0 ? 'none composed' : (room.briefings ?? []).map((b) => (
              <button key={String(b['briefing_id'])} type="button" onClick={() => void openBriefing(String(b['briefing_id']))} style={{ border: '1px solid var(--eye-color-border-default)', background: 'none', padding: '4px 8px', cursor: 'pointer', borderRadius: 6, marginInlineEnd: 6 }}>
                {fmtInstant(b['composed_at'])} · {String(b['composed_via'])}{b['degraded'] === true ? ' · DEGRADED' : ''}
              </button>
            ))}</DefinitionRow>
          </dl>
          <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
            {(isExecutive || isDecisionOwner) && room.member ? <button type="button" style={buttonStyle} disabled={busy} onClick={() => void compose()}>Compose a briefing now</button> : null}
            {(isExecutive || isDecisionOwner || isApprover || isAuthority) && room.member ? <button type="button" style={buttonStyle} disabled={busy} onClick={() => void review()}>Record a review</button> : null}
          </div>
          <ReceiptNote receipt={receipt} />
          {briefing === null ? null : (
            <section aria-labelledby="brf-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
              <h3 id="brf-h" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>Briefing {fmtInstant(briefing.composed_at)} — composed by {briefing.composed_via === 'agent' ? <strong>the briefing agent (agent-produced)</strong> : 'a person'}</h3>
              <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>
                baseline: {briefing.watermark.prior_briefing_id ? <>since what the prior briefing knew at <Mono>{fmtInstant(briefing.watermark.prior_known_at ?? briefing.watermark.prior_composed_at)}</Mono></> : 'no prior briefing'} · read under <Mono>{fmtInstant(briefing.known_at)}</Mono> · content digest <Mono>{briefing.content_digest.slice(0, 16)}…</Mono>
                {briefing.degraded ? <> · <strong style={{ color: 'var(--eye-color-critical)' }}>DEGRADED OR BLOCKED SOURCES INSIDE</strong></> : null}
              </p>
              <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Sources</h4>
              <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>{briefing.source_states.map((s) => <span key={`${s.source_key}`}><strong>{SOURCE_TEXT[s.state] ?? s.state}</strong> {s.name} ({s.acquisition_mode}) — {s.reason}; </span>)}</p>
              <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Which window is closing</h4>
              {briefing.windows.length === 0 ? <Empty>No window is closing.</Empty> : (
                <ol>{briefing.windows.map((w) => <li key={`${w.kind}:${w.id}`} style={{ fontSize: 'var(--eye-type-label-sm)' }}>{w.overdue ? <strong style={{ color: 'var(--eye-color-critical)' }}>OVERDUE </strong> : null}{w.title} — closes <Mono>{fmtInstant(w.closes_at)}</Mono> ({left(w.time_left_seconds)}) · owner <Mono>{short(w.owner)}</Mono></li>)}</ol>
              )}
              <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>What changed · why it matters · who owns it</h4>
              {briefing.items.length === 0 ? <Empty>Nothing changed since the baseline.</Empty> : (
                <table className="eye-table" style={tableStyle}>
                  <thead><tr><Th>Kind</Th><Th>What</Th><Th>Truth</Th><Th>Source</Th><Th>Freshness</Th><Th>Why it matters</Th><Th>Owner</Th></tr></thead>
                  <tbody>{briefing.items.map((i) => (
                    <tr key={i.item_id}>
                      <Td>{i.kind}</Td><Td>{i.title}</Td>
                      <Td>{i.synthetic_state ? <strong style={{ color: 'var(--eye-color-critical)' }}>SYNTHETIC </strong> : null}{i.truth_state}</Td>
                      <Td><strong style={{ color: ['degraded', 'blocked'].includes(i.source_state) ? 'var(--eye-color-critical)' : undefined }}>{SOURCE_TEXT[i.source_state] ?? i.source_state}</strong></Td>
                      <Td mono>{i.freshness.age_hours} h old</Td>
                      <Td>{i.matters.length === 0 ? '—' : i.matters.map((m) => `${m.dependent_type} ${m.dependent_object_id.slice(0, 8)}…`).join(', ')}</Td>
                      <Td mono>{short(i.owner)}</Td>
                    </tr>
                  ))}</tbody>
                </table>
              )}
              {briefing.narrative === null ? null : <UnknownNote><strong>NARRATIVE (labelled; cites {briefing.narrative_cites.length} item(s)).</strong> {briefing.narrative}</UnknownNote>}
            </section>
          )}
        </section>
      )}
    </>
  );
}
