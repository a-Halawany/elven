'use client';
/**
 * CP-6 B36 §D (0094) — THE PUBLISHING AND DISTRIBUTION CENTER (F-P6-13). A publication binds EXACT BYTES (their sha256 shown and confirmed
 * at approval) to an audience, a classification and channels; the approve-digest is signed; the deliveries carry the sinks' receipts beside
 * the recipients' own acknowledgements; a correction versions the publication and notifies every recipient; a withdrawal keeps the bytes
 * and says so; an external communication is reviewed by an executive who is not its drafter before it is approved; the archive carries the
 * source's controls and the export refuses a legal hold or a residency restriction. Every word on this page is the record's.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, fmtInstant } from '../../../components/observation';
import { tableStyle, Th, Td, buttonStyle, inputStyle, Receipt as ReceiptNote, ErrorNote } from '../../../components/ui';
import { actsFor, buildDraft, deliveryLine, digestShort, publications as api, stateLine, CLASSIFICATIONS, EXTERNAL_AUDIENCE_KINDS, GATE_VERDICTS, REQUESTABLE_FORMATS, SYNTHETIC_CHANNEL_NOTE,
  type DraftForm, type Publication } from '../../../lib/publications';

const short = (v: unknown): string => (typeof v === 'string' ? `${v.slice(0, 8)}…` : '—');
type Err = { code: string; message: string; correlationId: string } | null;
type Rcpt = { policyDecisionId: string; auditSeq: number } | null;
const EMPTY_FORM: DraftForm = { title: '', sourceKind: 'report', sourceId: '', sourceVersion: '1', sourceDigest: '', roles: 'board_member', recipients: '', classification: 'internal', channels: ['email'], format: 'html',
  plainLanguage: true, altTextPresent: true, template: 'board-pack@1', externalKind: 'partner', externalName: '' };

export default function PublicationsPage() {
  const { scope, me, isExecutive, isAuthority, isDecisionOwner } = useShell();
  const holds = (role: string) => me.bindings.some((b) => b.roleCode === role && (b.scope === 'PLATFORM' || (b.scope === 'DOMAIN' && b.domainId === scope.domainId)));
  const isOperator = holds('executive_operator');
  const [list, setList] = useState<Publication[] | null>(null);
  const [pub, setPub] = useState<Publication | null>(null);
  const [bytes, setBytes] = useState<{ version: number; format: string; verified: boolean; text: string | null; reason: string | null; bytes_digest: string } | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<DraftForm>(EMPTY_FORM);
  const [formProblem, setFormProblem] = useState<string | null>(null);
  const [confirmDigest, setConfirmDigest] = useState('');
  const [reason, setReason] = useState('');
  const [correctionDigest, setCorrectionDigest] = useState('');
  const [reviewVerdict, setReviewVerdict] = useState<string>('approved');
  const [reviewNote, setReviewNote] = useState('');
  const [lastAnswer, setLastAnswer] = useState<Record<string, unknown> | null>(null);

  const reload = async () => { const r = await api.list(scope); if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the publications could not be read'); return; } setList(r.data.publications); };
  useEffect(() => { void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [scope]);
  const open = async (id: string) => {
    const r = await api.get(scope, id);
    if (!r.ok || r.data === undefined) { setError(r.error ?? null); return; }
    setPub(r.data.publication); setBytes(null); setError(null); setReceipt(r.data.receipt); setConfirmDigest(''); setLastAnswer(null);
  };
  const act = async <T,>(run: () => Promise<{ ok: boolean; data?: T; error?: Err extends null ? never : NonNullable<Err> }>, after?: (d: T) => void) => {
    setBusy(true); const r = await run(); setBusy(false);
    if (!r.ok || r.data === undefined) { setError(r.error ?? null); return; }
    setError(null); setReceipt((r.data as { receipt: Rcpt }).receipt); after?.(r.data);
    await reload(); if (pub !== null) await open(pub.publication_id);
  };
  const draft = async () => {
    const payload = buildDraft(form);
    if (typeof payload === 'string') { setFormProblem(payload); return; }
    setFormProblem(null);
    await act(() => api.draft(scope, payload), (d) => { setLastAnswer(d.publication); void open(String(d.publication['publication_id'])); });
  };
  const current = pub === null ? null : (pub.versions ?? []).find((v) => v.version === pub.current_version) ?? null;
  const reviewApproved = pub === null || current === null ? false : (pub.external_drafts ?? []).some((d) => d.version === current.version && d.gate_state === 'approved');
  const pendingDraft = pub === null || current === null ? null : (pub.external_drafts ?? []).find((d) => d.version === current.version && (d.gate_state === 'review_requested' || d.gate_state === 'information_requested')) ?? null;
  const acts = pub === null ? [] : actsFor(pub, reviewApproved);
  const mayDraft = isOperator || isExecutive || isDecisionOwner;
  const mayApprove = isExecutive || isAuthority;
  const mayDeliver = isOperator || isExecutive || isAuthority;
  const readBytes = async (version: number) => {
    if (pub === null) return;
    const r = await api.bytes(scope, pub.publication_id, version);
    if (!r.ok || r.data === undefined) { setError(r.error ?? null); return; }
    setBytes({ version, ...r.data.bytes });
  };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (list === null) return <Empty>reading publications…</Empty>;
  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Publications</h1>
      <p style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>A publication binds exact bytes (their sha256) to an audience, a classification and channels. {SYNTHETIC_CHANNEL_NOTE}.</p>
      {list.length === 0 ? <Empty>No publication is drafted in this domain.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <caption style={{ captionSide: 'top', textAlign: 'start', color: 'var(--eye-color-ink-muted)' }}>{list.length} publication(s)</caption>
          <thead><tr><Th>Title</Th><Th>State</Th><Th>Classification</Th><Th>Channels</Th><Th>Format</Th><Th>Drafted</Th></tr></thead>
          <tbody>{list.map((x) => (
            <tr key={x.publication_id}>
              <Td><button type="button" onClick={() => void open(x.publication_id)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-default)', cursor: 'pointer', textDecoration: 'underline', textAlign: 'start' }}>{x.title}</button></Td>
              <Td>{stateLine(x)}</Td><Td mono>{x.classification}</Td><Td mono>{x.channels.join(', ')}</Td><Td mono>{x.format}</Td><Td mono>{fmtInstant(x.drafted_at)}</Td>
            </tr>
          ))}</tbody>
        </table>
      )}
      <ErrorNote error={error} />
      <ReceiptNote receipt={receipt} />

      {mayDraft ? (
        <section aria-labelledby="draft-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="draft-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Draft a publication</h2>
          <div style={{ display: 'grid', gap: 'var(--eye-space-8)', gridTemplateColumns: 'repeat(auto-fit, minmax(16rem, 1fr))' }}>
            <label>Title <input style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
            <label>Source kind <select style={inputStyle} value={form.sourceKind} onChange={(e) => setForm({ ...form, sourceKind: e.target.value as DraftForm['sourceKind'] })}><option value="report">report of a package version</option><option value="briefing">briefing edition</option></select></label>
            <label>Source id (briefing id or package id) <input style={inputStyle} value={form.sourceId} onChange={(e) => setForm({ ...form, sourceId: e.target.value })} /></label>
            <label>Package version <input style={inputStyle} value={form.sourceVersion} onChange={(e) => setForm({ ...form, sourceVersion: e.target.value })} disabled={form.sourceKind === 'briefing'} /></label>
            <label>Snapshot content digest (as read) <input style={inputStyle} value={form.sourceDigest} onChange={(e) => setForm({ ...form, sourceDigest: e.target.value })} /></label>
            <label>Audience roles (comma-separated) <input style={inputStyle} value={form.roles} onChange={(e) => setForm({ ...form, roles: e.target.value })} /></label>
            <label>Named recipients (principal ids) <input style={inputStyle} value={form.recipients} onChange={(e) => setForm({ ...form, recipients: e.target.value })} /></label>
            <label>Classification <select style={inputStyle} value={form.classification} onChange={(e) => setForm({ ...form, classification: e.target.value })}>{CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select></label>
            <label>Format <select style={inputStyle} value={form.format} onChange={(e) => setForm({ ...form, format: e.target.value })}>{REQUESTABLE_FORMATS.map((f) => <option key={f} value={f}>{f}{f === 'pdf-a' ? ' (unsupported today — refused in words)' : ''}</option>)}</select></label>
            <label>Template <input style={inputStyle} value={form.template} onChange={(e) => setForm({ ...form, template: e.target.value })} /></label>
            <label>External audience kind <select style={inputStyle} value={form.externalKind} onChange={(e) => setForm({ ...form, externalKind: e.target.value })}>{EXTERNAL_AUDIENCE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
            <label>External audience name (empty = internal) <input style={inputStyle} value={form.externalName} onChange={(e) => setForm({ ...form, externalName: e.target.value })} /></label>
          </div>
          <div style={{ display: 'flex', gap: 'var(--eye-space-16)', flexWrap: 'wrap', marginBlockStart: 'var(--eye-space-8)' }}>
            <label><input type="checkbox" checked={form.channels.includes('email')} onChange={(e) => setForm({ ...form, channels: e.target.checked ? [...form.channels, 'email'] : form.channels.filter((c) => c !== 'email') })} /> email (SYNTHETIC sink)</label>
            <label><input type="checkbox" checked={form.channels.includes('teams')} onChange={(e) => setForm({ ...form, channels: e.target.checked ? [...form.channels, 'teams'] : form.channels.filter((c) => c !== 'teams') })} /> teams (SYNTHETIC sink)</label>
            <label><input type="checkbox" checked={form.plainLanguage} onChange={(e) => setForm({ ...form, plainLanguage: e.target.checked })} /> plain language</label>
            <label><input type="checkbox" checked={form.altTextPresent} onChange={(e) => setForm({ ...form, altTextPresent: e.target.checked })} /> alternative text present</label>
          </div>
          {formProblem === null ? null : <p role="alert" style={{ color: 'var(--eye-color-critical)' }}>{formProblem}</p>}
          <button type="button" style={buttonStyle} disabled={busy} onClick={() => void draft()}>Draft the publication</button>
        </section>
      ) : null}

      {pub === null ? null : (
        <section aria-labelledby="pub-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="pub-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{pub.title}</h2>
          <p style={{ fontSize: 'var(--eye-type-label-sm)' }}><strong>{stateLine(pub)}</strong></p>
          <dl>
            <DefinitionRow term="Publication"><Mono>{pub.publication_id}</Mono></DefinitionRow>
            <DefinitionRow term="Classification"><Mono>{pub.classification}</Mono> · channels <Mono>{pub.channels.join(', ')}</Mono> · format <Mono>{pub.format}</Mono> · template <Mono>{pub.template}</Mono></DefinitionRow>
            <DefinitionRow term="Audience">roles {(pub.audience.roles ?? []).join(', ') || '—'} · recipients {(pub.audience.recipients ?? []).map(short).join(', ') || '—'}{pub.external === null ? '' : ` · EXTERNAL ${pub.external.kind}: ${pub.external.name} (SYNTHETIC delivery)`}</DefinitionRow>
            <DefinitionRow term="Accessibility">plain language {pub.accessibility.plain_language ? 'yes' : 'no'} · alternative text {pub.accessibility.alt_text_present ? 'present' : 'absent'}</DefinitionRow>
            <DefinitionRow term="Drafted"><Mono>{short(pub.drafted_by)}</Mono> at <Mono>{fmtInstant(pub.drafted_at)}</Mono></DefinitionRow>
            {pub.archive_ref === null ? null : <DefinitionRow term="Archive">controls {JSON.stringify(pub.archive_ref['controls'] ?? {})} · holds {JSON.stringify(pub.archive_ref['holds'] ?? [])}</DefinitionRow>}
          </dl>

          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Versions — the exact bytes</h3>
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Version</Th><Th>State</Th><Th>Source</Th><Th>Bytes sha256</Th><Th>Length</Th><Th>Approval</Th><Th>Signatures</Th><Th>Correction</Th><Th>Read</Th></tr></thead>
            <tbody>{(pub.versions ?? []).map((v) => (
              <tr key={v.version}>
                <Td mono>{v.version}</Td><Td>{v.state.toUpperCase()}{v.corrected_by_version === null ? '' : ` — corrected by version ${v.corrected_by_version}`}</Td>
                <Td mono>{v.source_kind} {short(v.source_id)}@{v.source_version} · {digestShort(v.source_digest)}</Td>
                <Td><Mono title={v.bytes_digest}>{digestShort(v.bytes_digest)}</Mono></Td><Td mono>{v.byte_length} B</Td>
                <Td>{v.approved_at === null ? '— not approved' : <>by <Mono>{short(v.approved_by)}</Mono> at <Mono>{fmtInstant(v.approved_at)}</Mono> · digest confirmed <Mono>{digestShort(v.approval_digest)}</Mono> · PUB@{v.pub_object_version}</>}</Td>
                <Td>{v.signatures.length === 0 ? '—' : v.signatures.map((s) => <span key={String(s['signature_id'])}><Mono>{String(s['key_id'])}</Mono> by <Mono>{short(s['signer'])}</Mono> </span>)}</Td>
                <Td>{v.correction_of === null ? '—' : `of version ${v.correction_of}: ${v.correction_reason ?? ''}`}</Td>
                <Td><button type="button" style={buttonStyle} onClick={() => void readBytes(v.version)}>Read the bytes</button></Td>
              </tr>
            ))}</tbody>
          </table>
          {bytes === null ? null : (
            <section aria-labelledby="bytes-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-8)' }}>
              <h4 id="bytes-h" style={{ fontSize: 'var(--eye-type-label-md)', marginBlockStart: 0 }}>Version {bytes.version} bytes ({bytes.format}) — {bytes.verified ? '● VERIFIED against the recorded digest' : `✕ NOT VERIFIED — ${bytes.reason ?? ''}`}</h4>
              {bytes.text === null ? <Empty>nothing is served as the record</Empty> : <pre style={{ maxBlockSize: '24rem', overflow: 'auto', fontSize: 'var(--eye-type-label-sm)' }}>{bytes.text}</pre>}
            </section>
          )}

          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Deliveries — receipts and acknowledgements</h3>
          {(pub.deliveries ?? []).length === 0 ? <Empty>No delivery yet.</Empty> : (
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Version</Th><Th>Recipient</Th><Th>Delivery</Th><Th>Receipt id</Th><Th>Delivered</Th><Th>Acknowledge</Th></tr></thead>
              <tbody>{(pub.deliveries ?? []).map((d) => (
                <tr key={d.delivery_id}>
                  <Td mono>{d.version}</Td><Td mono>{short(d.recipient_principal_id)}</Td><Td>{deliveryLine(d)}</Td><Td mono>{short(d.receipt_id)}</Td><Td mono>{fmtInstant(d.delivered_at)}</Td>
                  <Td>{d.recipient_principal_id === me.principalId && d.state === 'delivered' && d.acknowledged_at === null ? <button type="button" style={buttonStyle} disabled={busy} onClick={() => void act(() => api.acknowledge(scope, d.delivery_id, 'read (receipt, not agreement)'))}>Acknowledge</button> : d.acknowledged_at === null ? '—' : 'acknowledged'}</Td>
                </tr>
              ))}</tbody>
            </table>
          )}
          <UnknownNote>A receipt is the channel's machine proof of placement; an acknowledgement is the recipient's own act (receipt, not agreement). Neither sets the other.</UnknownNote>

          {(pub.external_drafts ?? []).length === 0 ? null : (
            <>
              <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>External communication review (TC-12)</h3>
              <ul>{(pub.external_drafts ?? []).map((d) => <li key={d.draft_id} style={{ fontSize: 'var(--eye-type-label-sm)' }}>version {d.version} → {d.audience_kind}: {d.audience_name} — <strong>{d.gate_state.toUpperCase()}</strong>{d.reviewed_by === null ? '' : ` by ${short(d.reviewed_by)} at ${fmtInstant(d.reviewed_at)} · digest ${digestShort(d.review_digest)}`}{d.review_note ? ` — ${d.review_note}` : ''}</li>)}</ul>
            </>
          )}

          {pub.reader === 'privileged' ? (
            <section aria-labelledby="acts-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
              <h3 id="acts-h" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>Acts</h3>
              {acts.includes('review') && pendingDraft !== null && isExecutive && current !== null ? (
                <div style={{ marginBlockEnd: 'var(--eye-space-8)' }}>
                  <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>Review the external draft for <strong>{pendingDraft.audience_name}</strong>: confirm the bytes' digest <Mono title={current.bytes_digest}>{digestShort(current.bytes_digest)}</Mono> (an executive who is not the drafter).</p>
                  <label>Verdict <select style={inputStyle} value={reviewVerdict} onChange={(e) => setReviewVerdict(e.target.value)}>{GATE_VERDICTS.map((v) => <option key={v} value={v}>{v}</option>)}</select></label>{' '}
                  <label>Note <input style={inputStyle} value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} /></label>{' '}
                  <button type="button" style={buttonStyle} disabled={busy} onClick={() => void act(() => api.review(scope, pendingDraft.draft_id, { verdict: reviewVerdict, note: reviewNote, digest: current.bytes_digest }), (d) => setLastAnswer(d.review))}>Record the review</button>
                </div>
              ) : null}
              {acts.includes('approve') && mayApprove && current !== null ? (
                <div style={{ marginBlockEnd: 'var(--eye-space-8)' }}>
                  <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>Approve by digest: the bytes of version {current.version} are <Mono title={current.bytes_digest}>{current.bytes_digest}</Mono>. Type the digest to confirm it byte-for-byte; the approval is signed with the tenant's key.</p>
                  <label>Digest confirmed <input style={{ ...inputStyle, inlineSize: '40rem', maxInlineSize: '100%' }} value={confirmDigest} onChange={(e) => setConfirmDigest(e.target.value.trim())} /></label>{' '}
                  <button type="button" style={buttonStyle} disabled={busy || confirmDigest.length !== 64} onClick={() => void act(() => api.approve(scope, pub.publication_id, current.version, confirmDigest), (d) => setLastAnswer(d.approval))}>Approve and sign</button>
                </div>
              ) : null}
              {acts.includes('deliver') && mayDeliver && current !== null ? <p><button type="button" style={buttonStyle} disabled={busy} onClick={() => void act(() => api.deliver(scope, pub.publication_id, current.version), (d) => setLastAnswer(d.delivery))}>Deliver version {current.version} (in-app + the synthetic channels)</button></p> : null}
              {acts.includes('correct') && mayDraft ? (
                <div style={{ marginBlockEnd: 'var(--eye-space-8)' }}>
                  <label>Corrected snapshot digest <input style={{ ...inputStyle, inlineSize: '40rem', maxInlineSize: '100%' }} value={correctionDigest} onChange={(e) => setCorrectionDigest(e.target.value.trim())} /></label>{' '}
                  <label>Reason <input style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} /></label>{' '}
                  <button type="button" style={buttonStyle} disabled={busy || correctionDigest.length !== 64 || reason.trim().length < 8} onClick={() => void act(() => api.correct(scope, pub.publication_id, { reason, sourceDigest: correctionDigest }), (d) => setLastAnswer(d.correction))}>Correct (new version; recipients notified)</button>
                </div>
              ) : null}
              {acts.includes('withdraw') && (mayDeliver || pub.drafted_by === me.principalId) ? (
                <div style={{ marginBlockEnd: 'var(--eye-space-8)' }}>
                  <label>Withdrawal reason <input style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} /></label>{' '}
                  <button type="button" style={buttonStyle} disabled={busy || reason.trim().length < 8} onClick={() => void act(() => api.withdraw(scope, pub.publication_id, reason), (d) => setLastAnswer(d.withdrawal))}>Withdraw (bytes retained; recipients notified)</button>
                </div>
              ) : null}
              {acts.includes('archive') && mayDeliver ? <p><button type="button" style={buttonStyle} disabled={busy} onClick={() => void act(() => api.archive(scope, pub.publication_id), (d) => setLastAnswer(d.archive))}>Archive under the source's controls</button></p> : null}
              {acts.includes('export') && mayApprove ? <p><button type="button" style={buttonStyle} disabled={busy} onClick={() => void act(() => api.exportGet(scope, pub.publication_id), (d) => setLastAnswer(d.export))}>Export (refused under a legal hold or a residency restriction)</button></p> : null}
              {lastAnswer === null ? null : <pre style={{ maxBlockSize: '18rem', overflow: 'auto', fontSize: 'var(--eye-type-label-sm)' }}>{JSON.stringify(lastAnswer, null, 2)}</pre>}
            </section>
          ) : null}
        </section>
      )}
    </>
  );
}
