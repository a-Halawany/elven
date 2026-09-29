'use client';
/**
 * Briefings — a room's members and cadence, review overdue in words, and briefings
 * composed from stored records under a bound baseline: what changed, why it matters,
 * who owns it, which window is closing. Degraded or blocked sources never render as
 * normal; a narrative is labelled and cites only included items.
 *
 * CP-6 B36 (0094 §B): THE STUDIO — BRF@v3. The composer sets the AUDIENCE CONTRACT (roles, locale, accessibility, channels; the
 * disputed / indicator sections excludable), the PURPOSE and the EXPIRY (datetime-local → an instant); the edition renders the band
 * beside every conclusion (computed by the server, never here), the OMISSIONS declared with their count, the items SUPPRESSED under
 * policy, the DISPUTED and INDICATOR sections with their as-of, the items RETAINED from the prior edition under an outage with their
 * original as-of, and EXPIRED when the server says so. An executive publishes the suppression policy here. Every state is the record's.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { decisions as api, type Room, type Briefing, type BriefingPolicy } from '../../../lib/decisions';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, fmtInstant, textareaStyle } from '../../../components/observation';
import { tableStyle, Th, Td, buttonStyle, inputStyle, Receipt as ReceiptNote, ErrorNote } from '../../../components/ui';
/* B23 (0084) attention */
import { bandMark as attentionBandMark } from '../../../lib/attention';
import type { BriefingAttention, BriefingAttentionItem } from '../../../lib/decisions';
/* end B23 attention */
/* B36 briefing */
import {
  AUDIENCE_CHANNELS, AUDIENCE_ROLES, DEFAULT_AUDIENCE_FORM, DEFAULT_POLICY_FORM, EXCLUDABLE, ITEM_KINDS, LOCALES, audiencePayload, audienceProblem, bandMark, defaultExpiryLocal, disputedLine, expiryLine,
  fromDatetimeLocal, isBoardAudience, omissionLine, omissionsCount, policyLines, policyRulesPayload, suppressionLine, uncertaintyLine, type AudienceForm, type PolicyForm,
} from '../../../lib/briefings';
/* end B36 briefing */

const short = (v: unknown): string => (typeof v === 'string' ? `${v.slice(0, 8)}…` : '—');
const SOURCE_TEXT: Record<string, string> = { live: '● live', replayed: '◍ REPLAYED', degraded: '◍ DEGRADED', blocked: '✕ BLOCKED', 'operator-upload': '⇧ operator upload', internal: '◦ internal record' };
const left = (s: number): string => (s < 0 ? `overdue by ${Math.round(-s / 3600)} h` : s < 86_400 ? `${Math.round(s / 3600)} h left` : `${Math.round(s / 86_400)} d left`);

/* B23 (0084) attention: BRF@v2's ATTENTION SECTION — the routed items as of the edition's known_at (their state THEN, the policy version THEN,
   the confidence band in three channels), every state counted, the material changes since the prior edition. A v1 edition says it has none. */
function Band({ band }: { band: string }) {
  const m = attentionBandMark(band);
  return <span style={{ color: `var(${m.token})`, fontWeight: 650, fontSize: 'var(--eye-type-label-sm)', whiteSpace: 'nowrap' }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}
function AttentionRows({ rows, caption }: { rows: BriefingAttentionItem[]; caption: string }) {
  return (
    <table className="eye-table" style={tableStyle}>
      <caption style={{ captionSide: 'top', textAlign: 'start', color: 'var(--eye-color-ink-muted)' }}>{caption}</caption>
      <thead><tr><Th>Class</Th><Th>What</Th><Th>State then</Th><Th>Consequence</Th><Th>Confidence</Th><Th>Hours to window</Th><Th>Policy then</Th><Th>Owner</Th></tr></thead>
      <tbody>{rows.map((x) => (
        <tr key={x.item_id}>
          <Td mono>{x.signal_class}</Td><Td>{x.title}</Td><Td>{x.state.toUpperCase()}</Td><Td mono>{x.consequence ?? '—'}</Td>
          <Td><Band band={x.confidence_band} />{x.confidence === null ? null : <> <Mono>{x.confidence}</Mono></>}</Td>
          <Td mono>{x.hours_to_window === null ? '—' : x.hours_to_window}</Td><Td mono>{x.policy_version === null ? 'none' : `v${x.policy_version}`}</Td><Td mono>{short(x.owner)}</Td>
        </tr>
      ))}</tbody>
    </table>
  );
}
function AttentionSection({ version, attention }: { version: string | undefined; attention: BriefingAttention | null | undefined }) {
  if ((version !== 'v2' && version !== 'v3') || attention === null || attention === undefined) {
    return <p style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>No attention section (v1 edition): this briefing was composed before the attention section existed; its content and digest are what they were.</p>;
  }
  const counted = Object.entries(attention.counts).filter(([, n]) => n > 0).map(([k, n]) => `${k} ${n}`).join(' · ');
  return (
    <>
      <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>
        as of <Mono>{fmtInstant(attention.as_of)}</Mono> (the edition's known_at — a later acknowledgement or closure does not rewrite it) · policy {attention.policy_version === null ? 'none in force' : <Mono>v{attention.policy_version}</Mono>} · {counted === '' ? 'no item in the queue then' : counted}
      </p>
      {attention.items.length === 0 ? <Empty>No item was routed at known_at.</Empty> : <AttentionRows rows={attention.items} caption={`${attention.items.length} routed item(s) at known_at`} />}
      <h5 style={{ fontSize: 'var(--eye-type-label-md)', marginBlockEnd: 0 }}>Material changes {attention.since === null ? '(no prior edition — every one up to known_at)' : <>since the prior edition (<Mono>{fmtInstant(attention.since)}</Mono>)</>}</h5>
      {attention.material_changes_since_prior.length === 0 ? <Empty>No material change on a decision in the interval.</Empty> : <AttentionRows rows={attention.material_changes_since_prior} caption={`${attention.material_changes_since_prior.length} material change(s)`} />}
    </>
  );
}
/* end B23 attention */

/* B36 briefing: the band beside a conclusion — the server's band, the rules on hover */
function ItemBand({ item }: { item: Briefing['items'][number] }) {
  if (item.uncertainty === undefined) return <span style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>no band (pre-v3)</span>;
  const m = bandMark(item.uncertainty.band);
  return <span title={uncertaintyLine(item.uncertainty)} style={{ color: `var(${m.token})`, fontWeight: 650, fontSize: 'var(--eye-type-label-sm)', whiteSpace: 'nowrap' }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}
const checkLabel = { display: 'inline-flex', gap: 4, alignItems: 'center', marginInlineEnd: 10, fontSize: 'var(--eye-type-label-sm)' } as const;
/* end B36 briefing */

export default function BriefingsPage() {
  const { scope, isExecutive, isDecisionOwner, isApprover, isAuthority } = useShell();
  const [rooms, setRooms] = useState<Room[] | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [briefing, setBriefing] = useState<Briefing | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<{ code: string; message: string; correlationId: string } | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [busy, setBusy] = useState(false);
  /* B36 briefing: the studio's contract, the policy panel */
  const [audience, setAudience] = useState<AudienceForm>(DEFAULT_AUDIENCE_FORM);
  const [purpose, setPurpose] = useState('');
  const [expiry, setExpiry] = useState(() => defaultExpiryLocal(Date.now()));
  const [disputedNote, setDisputedNote] = useState('');
  const [formProblem, setFormProblem] = useState<string | null>(null);
  const [policy, setPolicy] = useState<BriefingPolicy | null>(null);
  const [policyForm, setPolicyForm] = useState<PolicyForm>(DEFAULT_POLICY_FORM);
  const [policyProblem, setPolicyProblem] = useState<string | null>(null);
  /* end B36 briefing */

  useEffect(() => { void (async () => { const r = await api.rooms(scope); if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the rooms could not be read'); return; } setRooms(r.data.rooms); })(); }, [scope]);
  useEffect(() => { void (async () => { const r = await api.briefingPolicy(scope); if (r.ok && r.data !== undefined) setPolicy(r.data.policy); })(); }, [scope]);
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
    const ap = audienceProblem(audience);
    const expiresAt = fromDatetimeLocal(expiry);
    if (ap !== null) { setFormProblem(ap); return; }
    if (expiresAt === null) { setFormProblem('the expiry is an instant'); return; }
    if (purpose.trim().length > 0 && purpose.trim().length < 8) { setFormProblem('a purpose says something (8 characters or more), or is left to the default'); return; }
    setFormProblem(null);
    setBusy(true);
    const r = await api.compose(scope, room.room_id, { audience: audiencePayload(audience), expiresAt, ...(purpose.trim().length >= 8 ? { purpose: purpose.trim() } : {}), ...(disputedNote.trim().length >= 8 ? { disputedNote: disputedNote.trim() } : {}) });
    setBusy(false);
    if (!r.ok || r.data === undefined) { setError(r.error ?? null); return; }
    setReceipt(r.data.receipt); setBriefing(r.data.briefing); await openRoom(room.room_id); setBriefing(r.data.briefing);
  };
  const review = async () => {
    if (room === null) return;
    setBusy(true); const r = await api.review(scope, room.room_id, 'Reviewed in the room at the cadence.'); setBusy(false);
    if (!r.ok || r.data === undefined) { setError(r.error ?? null); return; }
    setReceipt(r.data.receipt); await openRoom(room.room_id);
  };
  const publishPolicy = async () => {
    const p = policyRulesPayload(policyForm);
    if ('problem' in p) { setPolicyProblem(p.problem); return; }
    setPolicyProblem(null); setBusy(true);
    const r = await api.setBriefingPolicy(scope, p.rules, 'Published from the briefing studio: prefer silence over false certainty.');
    setBusy(false);
    if (!r.ok || r.data === undefined) { setError(r.error ?? null); return; }
    setReceipt(r.data.receipt); setError(null);
    const again = await api.briefingPolicy(scope); if (again.ok && again.data !== undefined) setPolicy(again.data.policy);
  };
  const toggle = (list: string[], v: string): string[] => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rooms === null) return <Empty>reading rooms…</Empty>;
  const board = isBoardAudience(audience.roles);
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
      {/* B36 briefing: the suppression policy — read by every reader, published by an executive */}
      <section aria-labelledby="pol-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="pol-h" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>Suppression policy — prefer silence over false certainty</h2>
        <ul style={{ fontSize: 'var(--eye-type-label-sm)', marginBlockStart: 0 }}>{policyLines(policy).map((l) => <li key={l}>{l}</li>)}</ul>
        {isExecutive ? (
          <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={{ fontSize: 'var(--eye-type-label-sm)' }}>Minimum independent sources <input style={inputStyle} inputMode="numeric" value={policyForm.minSources} onChange={(e) => setPolicyForm({ ...policyForm, minSources: e.target.value })} /></label>
            <label style={{ fontSize: 'var(--eye-type-label-sm)' }}>Maximum staleness (hours) <input style={inputStyle} inputMode="numeric" value={policyForm.maxStalenessHours} onChange={(e) => setPolicyForm({ ...policyForm, maxStalenessHours: e.target.value })} /></label>
            <label style={{ fontSize: 'var(--eye-type-label-sm)' }}>Minimum confidence (0–1, empty for none) <input style={inputStyle} inputMode="decimal" value={policyForm.minConfidence} onChange={(e) => setPolicyForm({ ...policyForm, minConfidence: e.target.value })} /></label>
            <label style={{ fontSize: 'var(--eye-type-label-sm)' }}>Class override
              <select style={inputStyle} value="" onChange={(e) => { if (e.target.value !== '') setPolicyForm({ ...policyForm, classOverrides: [...policyForm.classOverrides, { kind: e.target.value, minSources: '', maxStalenessHours: '', minConfidence: '' }] }); }}>
                <option value="">add a class…</option>{ITEM_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>
            </label>
            <button type="button" style={buttonStyle} disabled={busy} onClick={() => void publishPolicy()}>Publish the suppression policy</button>
          </div>
        ) : null}
        {isExecutive && policyForm.classOverrides.length > 0 ? policyForm.classOverrides.map((o, i) => (
          <div key={`${o.kind}-${i}`} style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', alignItems: 'flex-end', marginBlockStart: 'var(--eye-space-8)' }}>
            <Mono>{o.kind}</Mono>
            <label style={{ fontSize: 'var(--eye-type-label-sm)' }}>{o.kind} minimum sources <input style={inputStyle} inputMode="numeric" value={o.minSources} onChange={(e) => setPolicyForm({ ...policyForm, classOverrides: policyForm.classOverrides.map((x, j) => (j === i ? { ...x, minSources: e.target.value } : x)) })} /></label>
            <label style={{ fontSize: 'var(--eye-type-label-sm)' }}>{o.kind} maximum staleness (hours) <input style={inputStyle} inputMode="numeric" value={o.maxStalenessHours} onChange={(e) => setPolicyForm({ ...policyForm, classOverrides: policyForm.classOverrides.map((x, j) => (j === i ? { ...x, maxStalenessHours: e.target.value } : x)) })} /></label>
            <label style={{ fontSize: 'var(--eye-type-label-sm)' }}>{o.kind} minimum confidence <input style={inputStyle} inputMode="decimal" value={o.minConfidence} onChange={(e) => setPolicyForm({ ...policyForm, classOverrides: policyForm.classOverrides.map((x, j) => (j === i ? { ...x, minConfidence: e.target.value } : x)) })} /></label>
            <button type="button" style={buttonStyle} onClick={() => setPolicyForm({ ...policyForm, classOverrides: policyForm.classOverrides.filter((_, j) => j !== i) })}>Remove {o.kind} override</button>
          </div>
        )) : null}
        {policyProblem === null ? null : <LiveStatus assertive>{policyProblem}</LiveStatus>}
      </section>
      {/* end B36 briefing */}
      {room === null ? null : (
        <section aria-labelledby="room-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="room-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{room.title}</h2>
          <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>room state <strong>{room.state}</strong> · package <strong>{room.package_title ?? short(room.package_id)}</strong> ({room.package_state ?? '—'}) · owner <Mono>{short(room.owner_principal_id)}</Mono> · <strong>{room.review_status ?? (room.review_overdue ? 'review overdue' : 'review on cadence')}</strong></p>
          <dl>
            <DefinitionRow term="Members">{(room.members ?? []).filter((m) => m.live).map((m) => <span key={m.principal_id}><Mono>{short(m.principal_id)}</Mono> ({m.role}) </span>)}</DefinitionRow>
            <DefinitionRow term="Briefings">{(room.briefings ?? []).length === 0 ? 'none composed' : (room.briefings ?? []).map((b) => (
              <button key={String(b['briefing_id'])} type="button" onClick={() => void openBriefing(String(b['briefing_id']))} style={{ border: '1px solid var(--eye-color-border-default)', background: 'none', padding: '4px 8px', cursor: 'pointer', borderRadius: 6, marginInlineEnd: 6 }}>
                {fmtInstant(b['composed_at'])} · {String(b['composed_via'])}{b['degraded'] === true ? ' · DEGRADED' : ''}{b['schema_version'] === 'v3' ? ' · v3' : ''}
              </button>
            ))}</DefinitionRow>
          </dl>
          {/* B36 briefing: THE STUDIO — the contract the next edition is composed under */}
          {(isExecutive || isDecisionOwner) && room.member ? (
            <section aria-labelledby="studio-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-8)' }}>
              <h3 id="studio-h" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>Compose the next edition (BRF@v3)</h3>
              <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
                <legend style={{ fontSize: 'var(--eye-type-label-sm)', fontWeight: 650 }}>Audience roles</legend>
                {AUDIENCE_ROLES.map((r) => <label key={r} style={checkLabel}><input type="checkbox" checked={audience.roles.includes(r)} onChange={() => setAudience({ ...audience, roles: toggle(audience.roles, r) })} /> {r}</label>)}
              </fieldset>
              {board ? <UnknownNote>A BOARD audience: the disputed section is carried only with the owner's note below.</UnknownNote> : null}
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', alignItems: 'flex-end', marginBlockStart: 'var(--eye-space-8)' }}>
                <label style={{ fontSize: 'var(--eye-type-label-sm)' }}>Locale <select style={inputStyle} value={audience.locale} onChange={(e) => setAudience({ ...audience, locale: e.target.value })}>{LOCALES.map((l) => <option key={l} value={l}>{l}</option>)}</select></label>
                <label style={checkLabel}><input type="checkbox" checked={audience.plainLanguage} onChange={() => setAudience({ ...audience, plainLanguage: !audience.plainLanguage })} /> plain language</label>
                <label style={checkLabel}><input type="checkbox" checked={audience.screenReader} onChange={() => setAudience({ ...audience, screenReader: !audience.screenReader })} /> screen reader</label>
              </div>
              <fieldset style={{ border: 'none', padding: 0, margin: 0, marginBlockStart: 'var(--eye-space-8)' }}>
                <legend style={{ fontSize: 'var(--eye-type-label-sm)', fontWeight: 650 }}>Channels</legend>
                {AUDIENCE_CHANNELS.map((c) => <label key={c} style={checkLabel}><input type="checkbox" checked={audience.channels.includes(c)} onChange={() => setAudience({ ...audience, channels: toggle(audience.channels, c) })} /> {c}</label>)}
              </fieldset>
              <fieldset style={{ border: 'none', padding: 0, margin: 0, marginBlockStart: 'var(--eye-space-8)' }}>
                <legend style={{ fontSize: 'var(--eye-type-label-sm)', fontWeight: 650 }}>Exclude sections</legend>
                {EXCLUDABLE.map((x) => <label key={x} style={checkLabel}><input type="checkbox" checked={audience.exclude.includes(x)} onChange={() => setAudience({ ...audience, exclude: toggle(audience.exclude, x) })} /> exclude {x} items</label>)}
              </fieldset>
              <label style={{ display: 'block', fontSize: 'var(--eye-type-label-sm)', marginBlockStart: 'var(--eye-space-8)' }}>Purpose (empty for the standing purpose)
                <textarea style={textareaStyle} rows={2} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
              </label>
              <label style={{ display: 'block', fontSize: 'var(--eye-type-label-sm)', marginBlockStart: 'var(--eye-space-8)' }}>Expires at
                <input type="datetime-local" style={inputStyle} value={expiry} onChange={(e) => setExpiry(e.target.value)} />
              </label>
              <label style={{ display: 'block', fontSize: 'var(--eye-type-label-sm)', marginBlockStart: 'var(--eye-space-8)' }}>Owner's note on disputed items (8 characters or more; a board audience carries disputed items only with it)
                <textarea style={textareaStyle} rows={2} value={disputedNote} onChange={(e) => setDisputedNote(e.target.value)} />
              </label>
              {formProblem === null ? null : <LiveStatus assertive>{formProblem}</LiveStatus>}
            </section>
          ) : null}
          {/* end B36 briefing */}
          <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', marginBlockStart: 'var(--eye-space-8)' }}>
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
                {briefing.watermark.projection?.memory_content === 'unavailable' ? <> · <strong style={{ color: 'var(--eye-color-critical)' }}>the memory items were omitted: the memory projection was withdrawn and the content tier did not answer (EYE-DEG-001)</strong></> : null}
              </p>
              {/* B36 briefing: the contract, the expiry, the omissions */}
              {briefing.schema_version === 'v3' ? (
                <>
                  {briefing.expired === true ? <LiveStatus assertive><strong>EXPIRED</strong> — {expiryLine(briefing, fmtInstant)}; a later edition supersedes it.</LiveStatus> : null}
                  <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>
                    <strong>Audience</strong> {(briefing.audience?.roles ?? []).join(', ')} · locale <Mono>{briefing.audience?.locale ?? '—'}</Mono> · {briefing.audience?.accessibility.plain_language ? 'plain language' : 'standard language'}{briefing.audience?.accessibility.screen_reader ? ' · screen reader' : ''} · channels {(briefing.audience?.channels ?? []).join(', ')}{(briefing.audience?.exclude ?? []).length > 0 ? ` · excludes ${(briefing.audience?.exclude ?? []).join(', ')}` : ''}
                    <br /><strong>Purpose</strong> {briefing.purpose} · <strong>{expiryLine(briefing, fmtInstant)}</strong> · policy {briefing.policy_version === null || briefing.policy_version === undefined ? 'none in force at known_at' : <Mono>v{briefing.policy_version}</Mono>}
                  </p>
                  <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Omissions — {omissionsCount((briefing.omissions ?? []).length)}</h4>
                  {(briefing.omissions ?? []).length === 0 ? <Empty>Nothing the edition could not include.</Empty> : <ul style={{ fontSize: 'var(--eye-type-label-sm)' }}>{(briefing.omissions ?? []).map((o, i) => <li key={`${o.kind}-${i}`}>{omissionLine(o)}</li>)}</ul>}
                  {(briefing.suppressed ?? []).length === 0 ? null : (
                    <>
                      <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Suppressed under policy — {(briefing.suppressed ?? []).length} item(s) not rendered</h4>
                      <ul style={{ fontSize: 'var(--eye-type-label-sm)' }}>{(briefing.suppressed ?? []).map((s) => <li key={s.item_id}>{suppressionLine(s)}</li>)}</ul>
                    </>
                  )}
                </>
              ) : <p style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>An edition before BRF@v3: no audience contract, purpose, expiry or omissions ledger; its content and digest are what they were.</p>}
              {/* end B36 briefing */}
              <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Sources</h4>
              <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>{briefing.source_states.map((s) => <span key={`${s.source_key}`}><strong>{SOURCE_TEXT[s.state] ?? s.state}</strong> {s.name} ({s.acquisition_mode}) — {s.reason}; </span>)}</p>
              <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Which window is closing</h4>
              {briefing.windows.length === 0 ? <Empty>No window is closing.</Empty> : (
                <ol>{briefing.windows.map((w) => <li key={`${w.kind}:${w.id}`} style={{ fontSize: 'var(--eye-type-label-sm)' }}>{w.overdue ? <strong style={{ color: 'var(--eye-color-critical)' }}>OVERDUE </strong> : null}{w.title} — closes <Mono>{fmtInstant(w.closes_at)}</Mono> ({left(w.time_left_seconds)}) · owner <Mono>{short(w.owner)}</Mono></li>)}</ol>
              )}
              {/* B23 (0084) attention */}
              <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>What needs attention (BRF@{briefing.schema_version ?? 'v1'})</h4>
              <AttentionSection version={briefing.schema_version} attention={briefing.attention} />
              {/* end B23 attention */}
              {/* B36 briefing: the disputed and indicator sections, with their as-of */}
              {briefing.schema_version === 'v3' ? (
                <>
                  <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Disputed assessments</h4>
                  {(briefing.disputed ?? []).length === 0 ? <Empty>{(briefing.audience?.exclude ?? []).includes('disputed') ? 'Excluded by the audience contract.' : isBoardAudience(briefing.audience?.roles ?? []) ? 'A board audience: disputed items are carried only with the owner\'s note.' : 'No package under challenge, no standing dissent, no contradiction ref at known_at.'}</Empty>
                    : <ul style={{ fontSize: 'var(--eye-type-label-sm)' }}>{(briefing.disputed ?? []).map((d) => <li key={d.item_id}>{disputedLine(d)}</li>)}</ul>}
                  <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Emerging indicators</h4>
                  {briefing.items.filter((i) => i.kind === 'indicator').length === 0 ? <Empty>{(briefing.audience?.exclude ?? []).includes('indicator') ? 'Excluded by the audience contract.' : 'No weak signal nominated and no stream rule fired in the interval.'}</Empty>
                    : <ul style={{ fontSize: 'var(--eye-type-label-sm)' }}>{briefing.items.filter((i) => i.kind === 'indicator').map((i) => <li key={i.item_id}>{i.title} — as of <Mono>{fmtInstant(i.at)}</Mono> · <ItemBand item={i} /></li>)}</ul>}
                </>
              ) : null}
              {/* end B36 briefing */}
              <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>What changed · why it matters · who owns it</h4>
              {(briefing.items_withheld ?? 0) > 0 ? <UnknownNote><strong>{briefing.items_withheld} item(s) withheld from you</strong> — outside the audience of the memory version cited; the snapshot and its digest are unchanged.</UnknownNote> : null}
              {briefing.availability !== undefined && (briefing.availability.unavailable.length > 0 || briefing.availability.corrected.length > 0) ? (
                <UnknownNote><strong>Availability now</strong> (checked {fmtInstant(briefing.availability.checked_at)}; the content keeps what it cited):{' '}
                  {briefing.availability.unavailable.map((u) => `${u.kind} ${u.id.slice(0, 8)}…${u.version === null ? '' : `@${u.version}`} — ${u.reason}`).concat(briefing.availability.corrected.map((c) => `${c.kind} ${c.id.slice(0, 8)}…@${c.version} — ${c.reason} (version ${c.by_version})`)).join(' · ')}
                </UnknownNote>
              ) : null}
              {briefing.items.length === 0 ? <Empty>Nothing changed since the baseline.</Empty> : (
                <table className="eye-table" style={tableStyle}>
                  <thead><tr><Th>Kind</Th><Th>What</Th><Th>Truth</Th><Th>Uncertainty</Th><Th>Source</Th><Th>Freshness</Th><Th>Why it matters</Th><Th>Owner</Th></tr></thead>
                  <tbody>{briefing.items.map((i) => (
                    <tr key={i.item_id}>
                      <Td>{i.kind}</Td>
                      <Td>{i.title}{i.retained_from ? <> <strong style={{ color: 'var(--eye-color-warning)' }}>RETAINED</strong> from the prior edition, as of <Mono>{fmtInstant(i.retained_as_of)}</Mono> (not re-derived)</> : null}</Td>
                      <Td>{i.synthetic_state ? <strong style={{ color: 'var(--eye-color-critical)' }}>SYNTHETIC </strong> : null}{i.truth_state}</Td>
                      <Td><ItemBand item={i} /></Td>
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
