'use client';
/**
 * B36 (0094 §G) — THE GATE COMPLETED on one version (F-P6-04; ADR-003; JRN-17 sign, distribute).
 *
 * What the server records, shown as it records it: the ONE uniform gate state (the same badge a source contract and a merge wear), the
 * signatures beyond the audit chain on each approval and on the decision — signer, key id, VERIFIED as the server verified it —, the
 * recusals ("recused" beside the approver's name), the challenges and their resolutions, the PDP denials ("denied: who tried what — the
 * rule"), the distributions with their receipts (the SYNTHETIC channels said), and the validated fields (missing information, expected
 * effects) with the builder on a draft. Then the distinct acts the page OFFERS for the signed-in person's roles — sign (the digest shown),
 * recuse, challenge, resolve, distribute, set the fields — each a governed write; every refusal is the server's, shown in its words.
 */
import { useEffect, useState } from 'react';
import { gatesB36 as api, boardActsFor, buildExpectedEffect, buildMissingInformation, denialLine, distributionLine, gateStateMark, signatureLine, EFFECT_DIRECTIONS, EFFECT_HORIZONS,
  type ExpectedEffect, type GateRecord, type GateStateRow, type MissingInformation } from '../../lib/gates-b36';
import type { Scope } from '../../lib/observation';
import { Empty, LiveStatus, Mono, GovernedButton, fmtInstant } from '../../components/observation';
import { inputStyle, Receipt } from '../../components/ui';

type Row = Record<string, unknown>;
type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const critical = { color: 'var(--eye-color-critical)' } as const;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : v === null || v === undefined || v === '' ? '—' : String(v));
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;

/** The ONE badge (ADR-003): a glyph, a word and the token — for a decision version, a source contract or a merge alike. */
export function GateStateBadge({ gate }: { gate: GateStateRow | null }) {
  if (gate === null) return <span style={small}>gate state unknown</span>;
  const m = gateStateMark(gate.state);
  return (
    <span data-testid="gate-state" style={{ color: `var(${m.token})`, border: `1px solid var(${m.token})`, borderRadius: 'var(--eye-radius-sm)', paddingInline: 'var(--eye-space-4)', fontSize: 'var(--eye-type-label-sm)', fontWeight: 650, whiteSpace: 'nowrap' }}
      title={`${gate.kind} ${gate.id} — ${gate.basis ?? ''}`}>
      <span aria-hidden="true">{m.glyph}</span> {m.text}{gate.since ? ` · since ${fmtInstant(gate.since)}` : ''}{gate.by ? ` by ${short(gate.by)}` : ''}
    </span>
  );
}

export function GateCompletion({ scope, packageId, version, versionState, me, roles, onChange }: {
  scope: Scope; packageId: string; version: number; versionState: string; me: string;
  roles: { isApprover: boolean; isAuthority: boolean; isDecisionOwner: boolean; isExecutive: boolean; isBoardMember: boolean; isAuditor: boolean }; onChange?: () => void;
}) {
  const [r, setR] = useState<GateRecord | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [actProblem, setActProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [channels, setChannels] = useState<string[]>(['in_app']);
  const [recipient, setRecipient] = useState('');
  const [missing, setMissing] = useState<MissingInformation[]>([]);
  const [effects, setEffects] = useState<ExpectedEffect[]>([]);
  const [mi, setMi] = useState({ what: '', owner: '', needed_by: '' });
  const [ee, setEe] = useState({ effect: '', measure: '', direction: 'down', horizon: '90d', basis: '' });
  const [fieldProblem, setFieldProblem] = useState<string | null>(null);
  const [lastDistribution, setLastDistribution] = useState<Row | null>(null);

  const load = async () => {
    const x = await api.record(scope, packageId, version);
    if (!x.ok || x.data === undefined) { setR(null); setProblem(refusal(x, 'the gate record could not be read')); return; }
    setProblem(null); setR(x.data.record); setMissing(x.data.record.missing_information ?? []); setEffects(x.data.record.expected_effects ?? []);
  };
  useEffect(() => { setActProblem(null); setReceipt(null); setLastDistribution(null); void load(); }, [scope, packageId, version, versionState]);
  const done = async <T extends { receipt: ReceiptT }>(x: { ok: boolean; status: number; data?: T; error?: { code: string; message: string } }, what: string): Promise<T> => {
    if (!x.ok || x.data === undefined) { const m = `${what} refused — ${refusal(x, 'no answer')}`; setActProblem(m); throw new Error(m); }
    setActProblem(null); setReceipt(x.data.receipt); await load(); onChange?.();
    return x.data;
  };

  if (problem !== null) return <LiveStatus assertive><span style={critical}>gate record not read — {problem}</span></LiveStatus>;
  if (r === null) return <Empty>reading the gate record…</Empty>;
  const ownApproval = r.approvals.find((a) => a.approver === me && a.revoked_at === null && a.decision === 'approve') ?? null;
  const openChallenge = r.challenges.find((c) => c['resolved_at'] === null || c['resolved_at'] === undefined) ?? null;
  const committed = r.commitment !== null;
  const mayRecuse = (roles.isApprover || roles.isBoardMember) && ['proposed', 'under_review', 'approved', 'deferred', 'information_requested'].includes(versionState) && !r.recusals.some((x) => x['approver_principal_id'] === me);
  const mayChallenge = (roles.isApprover || roles.isAuthority || roles.isDecisionOwner || roles.isExecutive || roles.isAuditor) && !['draft', 'rejected', 'superseded'].includes(versionState) && openChallenge === null;
  const maySignDecision = (roles.isDecisionOwner || roles.isAuthority) && committed && r.header_digest !== null && !r.decision_signatures.some((s) => s['signer'] === me);
  const mayDistribute = (roles.isDecisionOwner || roles.isAuthority) && committed;

  return (
    <div aria-labelledby="gate-b36-h" style={{ marginBlockStart: 'var(--eye-space-16)', borderBlockStart: '1px solid var(--eye-color-border-default)', paddingBlockStart: 'var(--eye-space-8)' }}>
      <h4 id="gate-b36-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>The gate's record — <GateStateBadge gate={r.gate} /></h4>

      <p style={small}><strong>Signatures beyond the audit chain</strong>{r.signing_key ? <> (this deployment signs with <Mono>{r.signing_key.keyId}</Mono>)</> : ' (no signing key is bound here)'}:</p>
      <ul style={small} aria-label="approval signatures">
        {r.approvals.length === 0 ? <li>no approval on this version</li> : r.approvals.map((a) => (
          <li key={a.approval_id}>approval by <Mono>{short(a.approver)}</Mono> ({a.decision}{a.revoked_at ? `, voided: ${String(a['revoked_reason'] ?? 'revoked')}` : ''}){a.recused ? <strong style={critical}> — RECUSED</strong> : null}
            {a.header_digest ? <> · digest <Mono>{a.header_digest.slice(0, 16)}…</Mono></> : null}
            {a.signatures.length === 0 ? ' · not signed' : a.signatures.map((s) => <span key={String(s['signature_id'])}> · {signatureLine(s)}</span>)}
            {roles.isApprover && a.approver === me && a.revoked_at === null && a.decision === 'approve' && a.header_digest !== null && a.signatures.length === 0 ? (
              <GovernedButton label="Sign my approval" pendingLabel="signing" variant="quiet"
                onRun={async () => { await done(await api.sign(scope, packageId, version, 'approval', a.header_digest as string, a.approval_id), 'the signature'); }} />
            ) : null}
          </li>
        ))}
      </ul>
      <p style={small} aria-label="decision signatures"><strong>The decision:</strong> {committed ? <>committed <Mono>{short(r.commitment?.commitment_id)}</Mono> by <Mono>{short(r.commitment?.committed_by)}</Mono>{r.header_digest ? <> · header digest <Mono>{r.header_digest.slice(0, 16)}…</Mono></> : null}</> : 'not committed — a decision is signed after its commitment'}
        {r.decision_signatures.length === 0 ? (committed ? ' · not signed yet' : '') : r.decision_signatures.map((s) => <span key={String(s['signature_id'])}> · {signatureLine(s)}</span>)}
      </p>
      {maySignDecision ? <GovernedButton label="Sign the decision" pendingLabel="signing" onRun={async () => { await done(await api.sign(scope, packageId, version, 'decision', r.header_digest as string, null), 'the signature'); }} /> : null}

      {r.recusals.length === 0 ? null : <p style={small}><strong>Recusals:</strong> {r.recusals.map((x) => `${short(x['approver_principal_id'])} recused at ${fmtInstant(x['recused_at'])} (${String(x['reason'])}; quorum ${String(x['quorum'])}, live ${String(x['live_before'])} → ${String(x['live_after'])}${x['state_before'] !== x['state_after'] ? `; ${String(x['state_before'])} → ${String(x['state_after'])}` : ''})`).join(' · ')}</p>}
      {r.challenges.length === 0 ? null : <ul style={small} aria-label="challenges">{r.challenges.map((c) => (
        <li key={String(c['challenge_id'])}><strong>{c['resolved_at'] ? `CHALLENGE ${String(c['resolution']).toUpperCase()}` : 'CHALLENGE OPEN — the commitment is held'}</strong> by {short(c['challenger_principal_id'])} ({String(c['standing'])}{c['after_commitment'] === true ? ', after the commitment' : ''}) at {fmtInstant(c['raised_at'])}: {String(c['reason'])}
          {c['resolved_at'] ? <> — resolved by {short(c['resolved_by'])} at {fmtInstant(c['resolved_at'])}: {String(c['resolution_note'])}{(c['effect'] as Row | null)?.['kind'] === 'reopen_required' ? <strong style={critical}> · REOPEN REQUIRED (the commitment stands; the owner reopens on a recorded cause)</strong> : (c['effect'] as Row | null)?.['kind'] === 'withdrawn' ? ' · the version was withdrawn' : ''}</> : null}
          {roles.isDecisionOwner && !c['resolved_at'] && c['challenger_principal_id'] !== me ? (
            <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', marginBlockStart: 4 }}>
              <input aria-label="Resolution note" style={{ ...inputStyle, inlineSize: '20rem' }} value={note} onChange={(e) => setNote(e.target.value)} placeholder="why (8+ characters)" />
              <GovernedButton label="Dismiss the challenge" pendingLabel="resolving" variant="quiet" disabled={note.trim().length < 8} onRun={async () => { await done(await api.resolveChallenge(scope, packageId, version, String(c['challenge_id']), 'dismissed', note), 'the resolution'); setNote(''); }} />
              <GovernedButton label="Uphold the challenge" pendingLabel="resolving" variant="critical" disabled={note.trim().length < 8} onRun={async () => { await done(await api.resolveChallenge(scope, packageId, version, String(c['challenge_id']), 'upheld', note), 'the resolution'); setNote(''); }} />
            </div>
          ) : null}
        </li>))}</ul>}
      {r.denials.length === 0 ? null : <ul style={small} aria-label="denials">{r.denials.map((d) => <li key={String(d['denial_id'])}><span style={critical}>{denialLine(d)}</span> · at {fmtInstant(d['denied_at'])}{d['package_version'] ? ` · version ${String(d['package_version'])} at the time` : ''}</li>)}</ul>}
      {r.distributions.length === 0 ? null : <ul style={small} aria-label="distributions">{r.distributions.map((d) => <li key={String(d['delivery_id'])}>{distributionLine(d)} · record <Mono>{String(d['record_digest']).slice(0, 16)}…</Mono> · at {fmtInstant(d['distributed_at'])}</li>)}</ul>}
      {lastDistribution !== null ? <LiveStatus><span style={small}>distributed — {(lastDistribution['rows'] as Row[]).length} row(s): {(lastDistribution['rows'] as Row[]).map((x) => `${String(x['channel'])} ${String(x['state'])}`).join(', ')} · {String(lastDistribution['synthetic_note'])}</span></LiveStatus> : null}

      <p style={small}><strong>Missing information:</strong> {missing.length === 0 ? 'none declared' : missing.map((m, i) => <span key={i}>“{m.what}” — owner {short(m.owner)}, needed by {m.needed_by}; </span>)}
        <br /><strong>Expected effects:</strong> {effects.length === 0 ? 'none declared' : effects.map((e, i) => <span key={i}>“{e.effect}” on {e.measure} {e.direction} over {e.horizon} ({e.basis}); </span>)}</p>
      {roles.isDecisionOwner && versionState === 'draft' ? (
        <fieldset style={{ border: '1px solid var(--eye-color-border-default)', borderRadius: 6, padding: 8, marginBlockStart: 4 }}>
          <legend style={small}>The fields (validated by the server when set and again at the proposal)</legend>
          <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
            <input aria-label="Missing information: what" style={inputStyle} value={mi.what} onChange={(e) => setMi({ ...mi, what: e.target.value })} placeholder="what is missing" />
            <input aria-label="Missing information: owner" style={inputStyle} value={mi.owner} onChange={(e) => setMi({ ...mi, owner: e.target.value })} placeholder="owner (principal id)" />
            <input aria-label="Missing information: needed by" type="date" style={inputStyle} value={mi.needed_by} onChange={(e) => setMi({ ...mi, needed_by: e.target.value })} />
            <button type="button" onClick={() => { const b = buildMissingInformation(mi); if (typeof b === 'string') { setFieldProblem(b); return; } setFieldProblem(null); setMissing([...missing, b]); setMi({ what: '', owner: '', needed_by: '' }); }}>Add missing information</button>
          </div>
          <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', marginBlockStart: 4 }}>
            <input aria-label="Expected effect" style={inputStyle} value={ee.effect} onChange={(e) => setEe({ ...ee, effect: e.target.value })} placeholder="the effect expected" />
            <input aria-label="Expected effect: measure" style={inputStyle} value={ee.measure} onChange={(e) => setEe({ ...ee, measure: e.target.value })} placeholder="the measure" />
            <label>direction <select aria-label="Expected effect: direction" value={ee.direction} onChange={(e) => setEe({ ...ee, direction: e.target.value })} style={inputStyle}>{EFFECT_DIRECTIONS.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
            <label>horizon <select aria-label="Expected effect: horizon" value={ee.horizon} onChange={(e) => setEe({ ...ee, horizon: e.target.value })} style={inputStyle}>{EFFECT_HORIZONS.map((d) => <option key={d} value={d}>{d}</option>)}</select></label>
            <input aria-label="Expected effect: basis" style={inputStyle} value={ee.basis} onChange={(e) => setEe({ ...ee, basis: e.target.value })} placeholder="the basis" />
            <button type="button" onClick={() => { const b = buildExpectedEffect(ee); if (typeof b === 'string') { setFieldProblem(b); return; } setFieldProblem(null); setEffects([...effects, b]); setEe({ effect: '', measure: '', direction: 'down', horizon: '90d', basis: '' }); }}>Add expected effect</button>
          </div>
          {fieldProblem === null ? null : <span role="alert" style={critical}>{fieldProblem}</span>}
          <GovernedButton label="Set the fields" pendingLabel="setting" onRun={async () => { await done(await api.setFields(scope, packageId, version, missing, effects), 'the fields'); }} />
        </fieldset>
      ) : null}

      {mayRecuse || mayChallenge ? (
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', marginBlockStart: 'var(--eye-space-8)', alignItems: 'center' }}>
          <input aria-label="Reason" style={{ ...inputStyle, inlineSize: '24rem' }} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="reason (8+ characters), recorded with your name" />
          {mayRecuse ? <GovernedButton label={ownApproval === null ? 'Recuse myself' : 'Recuse myself (voids my approval)'} pendingLabel="recusing" variant="critical" disabled={reason.trim().length < 8} onRun={async () => { await done(await api.recuse(scope, packageId, version, reason), 'the recusal'); setReason(''); }} /> : null}
          {mayChallenge ? <GovernedButton label="Challenge this decision" pendingLabel="challenging" variant="critical" disabled={reason.trim().length < 8} onRun={async () => { await done(await api.challenge(scope, packageId, version, reason), 'the challenge'); setReason(''); }} /> : null}
        </div>
      ) : null}

      {mayDistribute ? (
        <div style={{ display: 'grid', gap: 'var(--eye-space-8)', maxInlineSize: '40rem', marginBlockStart: 'var(--eye-space-8)' }}>
          <p style={small}><strong>Distribute the decision record</strong> to the room and the named recipients — in-app always; email / SMS / Teams are <strong>SYNTHETIC</strong> (local sinks; no real provider).</p>
          <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
            {(['email', 'sms', 'teams'] as const).map((c) => (
              <label key={c}><input type="checkbox" checked={channels.includes(c)} onChange={(e) => setChannels(e.target.checked ? [...channels, c] : channels.filter((x) => x !== c))} /> {c} (synthetic)</label>
            ))}
          </div>
          <input aria-label="Named recipient principal id" style={inputStyle} value={recipient} onChange={(e) => setRecipient(e.target.value)} placeholder="a named recipient's principal id (optional)" />
          <GovernedButton label="Distribute" pendingLabel="distributing" onRun={async () => { const d = await done(await api.distribute(scope, packageId, version, channels, recipient.length === 36 ? [recipient] : []), 'the distribution'); setLastDistribution(d.distribution); }} />
        </div>
      ) : null}
      {roles.isBoardMember ? <p style={small}>Board acts (approve, reject, defer) are made from the <a href="/decisions/board">board page</a>. {boardActsFor(versionState, ownApproval === null ? null : 'approve', r.recusals.some((x) => x['approver_principal_id'] === me)).join(', ') || 'none offered for this state'}.</p> : null}
      {actProblem !== null && <LiveStatus assertive><span style={critical}>{actProblem}</span></LiveStatus>}
      <Receipt receipt={receipt} />
    </div>
  );
}
