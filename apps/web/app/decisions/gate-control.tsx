'use client';
/**
 * B34 (0090 §G) — THE HUMAN GATE ON ONE VERSION (F-P6-04; HX-09 the authority banner, HX-12 distinct acts, HX-13 the preview).
 *
 * The gate as the server records it: the decision class (a BOARD badge), whether an independent decision-ready is required, the
 * approval conditions evaluated now (holds / does not hold / waived), the gate tasks and their deadlines, the acts, the overrides and
 * their review, the delegations; then the acts the page offers for the version's state — review, acknowledge, ready (on the
 * information package digest shown), defer / request information (with the next review), reject, resume — the override dialog, the
 * delegation, the board reservation of a draft, and the PREVIEW before the Commit: the commit carries the preview's digest, and a
 * failing condition answers with the HELD banner (recorded by the server; nothing committed). Every refusal is the server's.
 */
import { useEffect, useState } from 'react';
import { gates as api, GATE_ACTS, actsFor, conditionLine, gatePayload, heldLine, previewMinutesLeft, type GateSegment, type GateStatus, type Preview } from '../../lib/gates';
import type { Scope } from '../../lib/observation';
import { Empty, LiveStatus, Mono, GovernedButton, fmtInstant } from '../../components/observation';
import { inputStyle, Receipt } from '../../components/ui';
/* B81 ha: the shared authority components (the banner, the command review over the gate acts and the commit, the review records) */
import { AuthorityBanner, CommandReview, ReviewRecord } from '../../components/authority';
import { ACT_ROLES, consequenceFromPreview, consequenceStated, deferIntake, deferLine, eligibility, reviewRecordView, typedPhrase, type Eligibility } from '../../lib/authority-b81';
import { gatesB36, type GateRecord } from '../../lib/gates-b36';
/* end B81 ha */

type Row = Record<string, unknown>;
type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const critical = { color: 'var(--eye-color-critical)' } as const;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : v === null || v === undefined || v === '' ? '—' : String(v));
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const LABEL: Record<GateSegment, string> = { review: 'Review', acknowledge: 'Acknowledge', ready: 'Mark decision-ready', defer: 'Defer', reject: 'Reject', 'request-information': 'Request information', resume: 'Resume' };

/* B81 ha: what the authority banner needs beyond the gate status (all optional: the gate renders without it, the banner says what it lacks) */
export interface GateAuthority { me: string; roleCodes: readonly string[]; ownerId: string | null; authorId: string | null; policy: { principals?: readonly string[]; roles?: readonly string[]; quorum?: number } | null }
/* end B81 ha */

export function GateControl({ scope, packageId, version, versionState, versionDigest, roles, onChange, authority }: {
  scope: Scope; packageId: string; version: number; versionState: string; versionDigest: string | null;
  roles: { isApprover: boolean; isAuthority: boolean; isDecisionOwner: boolean; isExecutive: boolean }; onChange?: () => void;
  /* B81 ha */ authority?: GateAuthority;
}) {
  const [g, setG] = useState<GateStatus | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [segment, setSegment] = useState<GateSegment>('review');
  const [rationale, setRationale] = useState('');
  const [nextReview, setNextReview] = useState('');
  const [infoRequest, setInfoRequest] = useState('');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [held, setHeld] = useState<string | null>(null);
  const [overrideKind, setOverrideKind] = useState<'normal' | 'emergency'>('normal');
  const [overrideWhy, setOverrideWhy] = useState('');
  const [delegateTo, setDelegateTo] = useState('');
  const [delegateUntil, setDelegateUntil] = useState('');
  const [boardCharter, setBoardCharter] = useState('');
  const [actProblem, setActProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  /* B81 ha: the defer's conditions (one per line) and the next review's owner (blank: you); the gate record for the banner's recusals */
  const [deferConditions, setDeferConditions] = useState('');
  const [deferOwner, setDeferOwner] = useState('');
  const [rec, setRec] = useState<GateRecord | null>(null);
  const [recProblem, setRecProblem] = useState<string | null>(null);
  /* end B81 ha */

  const load = async () => {
    const r = await api.status(scope, packageId, version);
    if (!r.ok || r.data === undefined) { setG(null); setProblem(refusal(r, 'the gate could not be read')); return; }
    setProblem(null); setG(r.data.gate);
    /* B81 ha: the record (recusals, approvals, the one gate state) for the authority banner — a refusal is said, the gate still renders */
    const x = await gatesB36.record(scope, packageId, version);
    if (!x.ok || x.data === undefined) { setRec(null); setRecProblem(refusal(x, 'the gate record could not be read')); } else { setRec(x.data.record); setRecProblem(null); }
    /* end B81 ha */
  };
  useEffect(() => { setPreview(null); setHeld(null); setActProblem(null); setReceipt(null); void load(); }, [scope, packageId, version, versionState]);
  const done = async <T extends { receipt: ReceiptT }>(r: { ok: boolean; status: number; data?: T; error?: { code: string; message: string } }, what: string): Promise<T> => {
    if (!r.ok || r.data === undefined) { const m = `${what} refused — ${refusal(r, 'no answer')}`; setActProblem(m); throw new Error(m); }
    setActProblem(null); setReceipt(r.data.receipt); await load(); onChange?.();
    return r.data;
  };

  if (problem !== null) return <LiveStatus assertive><span style={critical}>gate not read — {problem}</span></LiveStatus>;
  if (g === null) return <Empty>reading the gate…</Empty>;
  const acts = actsFor(versionState);
  const mayAct = roles.isApprover || roles.isAuthority || roles.isDecisionOwner || roles.isExecutive;
  const left = preview === null ? 0 : previewMinutesLeft(String(preview.preview['previewed_at'] ?? ''));
  /* B81 ha: eligibility in words (the server re-judges every rule) — the banner's primary act for this person, each gate act, the commit */
  const me = authority?.me ?? '';
  const roleCodes = authority?.roleCodes ?? [];
  const approverIds = (rec?.approvals ?? []).filter((a) => a.decision === 'approve' && a.revoked_at === null).map((a) => a.approver);
  const recusedIds = (rec?.recusals ?? []).map((x) => String(x['approver_principal_id']));
  const sod = [
    ...(authority?.ownerId ? [{ principal: authority.ownerId, why: 'you own this package — an owner never approves their own version (0042)' }] : []),
    ...(authority?.authorId && authority.authorId !== authority.ownerId ? [{ principal: authority.authorId, why: 'you authored this version — an author never approves it' }] : []),
  ];
  const commitElig: Eligibility = eligibility({ action: 'decision.commit', me, isHuman: true, roles: roleCodes, requiredRoles: ACT_ROLES['decision.commit']!, state: versionState, openStates: ['approved', 'under_review', 'proposed'],
    excluded: approverIds.map((a) => ({ principal: a, why: 'you approved this version — an approver never commits it; a decision authority who is not an approver commits (D3)' })) });
  const approveElig: Eligibility = eligibility({ action: 'decision.approve', me, isHuman: true, roles: roleCodes, requiredRoles: ACT_ROLES['decision.approve']!, policy: authority?.policy ?? null,
    state: versionState, openStates: ['proposed', 'under_review', 'approved'], excluded: sod, recused: recusedIds, delegations: g.delegations.map((d) => ({ delegator: String(d['delegator_principal_id']), delegate: String(d['delegate_principal_id']), live: d['live'] === true })) });
  const banner = roles.isAuthority ? { act: 'commit this version', e: commitElig } : roles.isApprover ? { act: 'approve this version', e: approveElig }
    : { act: 'act at this gate (review, defer, reject)', e: eligibility({ action: 'decision.gate.defer', me, isHuman: true, roles: roleCodes, requiredRoles: ACT_ROLES['decision.gate.defer']!, state: versionState, openStates: ['proposed', 'under_review', 'approved', 'deferred', 'information_requested'] }) };
  const reviewers = [...(authority?.policy?.principals ?? []).map((x) => `principal ${x.slice(0, 8)}…${recusedIds.includes(x) ? ' (recused)' : ''}`), ...(authority?.policy?.roles ?? []).map((x) => `role ${x}`)];
  const live = (rec?.approvals ?? []).filter((a) => a.decision === 'approve' && a.revoked_at === null && !a.recused).length;
  const actAction: string = GATE_ACTS[segment];
  const actElig = eligibility({ action: actAction, me, isHuman: true, roles: roleCodes, requiredRoles: ACT_ROLES[actAction] ?? [], state: versionState, openStates: ['proposed', 'under_review', 'approved', 'deferred', 'information_requested'] });
  const deferBody = segment === 'defer' ? deferIntake({ rationale, nextReviewAt: nextReview, conditions: deferConditions.split('\n'), owner: deferOwner }) : null;
  const actReasons = [
    ...(rationale.trim().length < 8 ? ['state your rationale (8+ characters, recorded with your name)'] : []),
    ...(typeof deferBody === 'string' && rationale.trim().length >= 8 ? [deferBody] : []),
    ...(segment === 'request-information' && nextReview === '' ? ['name the next review'] : []),
  ];
  /* end B81 ha */

  return (
    <div aria-labelledby="gate-h" style={{ marginBlockStart: 'var(--eye-space-16)' }}>
      <h4 id="gate-h" style={{ fontSize: 'var(--eye-type-heading-3)' }}>
        The gate on version {g.version}{g.decision_class === 'board' ? <strong style={{ marginInlineStart: 8 }}> ▣ BOARD DECISION</strong> : null}
      </h4>
      <p style={small}>
        {g.decision_class === 'board' ? <>reserved for <strong>{String(g.board?.['charter'] ?? 'the board')}</strong> (quorum {String(g.board?.['quorum'] ?? '—')}; never overridden, never delegated) · </> : null}
        {g.requires_ready ? <>an INDEPENDENT decision-ready is required (information package <Mono>{g.information_package_digest.slice(0, 16)}…</Mono>) · </> : null}
        {g.conditions.conditions.length === 0 ? 'no typed approval condition' : `${g.conditions.conditions.length} approval condition(s), ${g.conditions.failed} failing now`}
      </p>
      {g.conditions.conditions.length === 0 ? null : <ul style={small}>{g.conditions.conditions.map((c, i) => <li key={i}>{conditionLine(c)}</li>)}</ul>}
      {/* B81 ha: the AUTHORITY BANNER (HX-09 / CMP-046) — eligibility, the required reviewers, delegation, recusal, the one gate state */}
      {authority === undefined ? null : (
        <AuthorityBanner act={banner.act} eligibility={banner.e} reviewers={reviewers} quorum={authority.policy?.quorum !== undefined ? { live, required: authority.policy.quorum } : null}
          delegations={g.delegations} recusals={rec?.recusals ?? []} gate={rec?.gate ?? null}>
          {recProblem !== null ? <p style={small}>recusals and the gate state not read — {recProblem}</p> : null}
        </AuthorityBanner>
      )}
      {/* end B81 ha */}
      {g.tasks.length === 0 ? null : (
        <p style={small}><strong>Gate tasks:</strong> {g.tasks.map((t) => `${String(t['kind'])} ${String(t['state']).toUpperCase()}${t['deadline_at'] ? ` due ${fmtInstant(t['deadline_at'])}` : ''}${t['assignee'] ? ` → ${short(t['assignee'])}` : ` → ${(t['candidate_roles'] as string[] | undefined)?.join('/') ?? ''}`}`).join(' · ')}</p>
      )}
      {g.actions.length === 0 ? null : <p style={small}><strong>Acts:</strong> {g.actions.map((a) => `${String(a['action'])} by ${short(a['actor_principal_id'])} (${String(a['from_state'])} → ${String(a['to_state'])}${a['next_review_at'] ? `, next review ${fmtInstant(a['next_review_at'])}` : ''})${/* B81 ha */ a['action'] === 'defer' ? ` — ${deferLine(a)}` : '' /* end B81 ha */}`).join(' · ')}</p>}
      {/* B81 ha: the REVIEW RECORDS (PAT-06) — reviewer, version, evidence, findings; not decision authority */}
      {g.actions.map((a) => reviewRecordView(a, versionDigest)).filter((x) => x !== null).map((r, i) => <ReviewRecord key={i} record={r!} />)}
      {/* end B81 ha */}
      {g.overrides.length === 0 ? null : <p style={small}><strong>Overrides:</strong> {g.overrides.map((o) => `${String(o['kind']).toUpperCase()} by ${short(o['granted_by'])}${o['quorum_shortfall'] ? ` covering ${String(o['quorum_shortfall'])} approval(s)` : ''}${o['kind'] === 'emergency' ? (o['reviewed_at'] ? `, reviewed: ${String(o['review_outcome'])}` : `, AFTER-THE-FACT REVIEW due ${fmtInstant(o['review_due_at'])}`) : ''}`).join(' · ')}</p>}
      {g.delegations.length === 0 ? null : <p style={small}><strong>Delegations:</strong> {g.delegations.map((d) => `${short(d['delegator_principal_id'])} → ${short(d['delegate_principal_id'])} until ${fmtInstant(d['expires_at'])}${d['live'] === true ? ' (live)' : ' (ended)'}`).join(' · ')}</p>}
      {held !== null ? <LiveStatus assertive><strong style={critical}>⚑ {held}</strong></LiveStatus> : null}

      {mayAct && acts.length > 0 ? (
        /* B81 ha: each gate act through the COMMAND REVIEW — its consequence (stated for defer / reject / resume), eligibility, the exact digest;
           the defer captures its conditions, the next review's owner and the next review (PAT-08) */
        <CommandReview action={actAction} object={{ type: 'decision package', id: packageId, version, title: `The gate on version ${version}`, state: versionState }}
          digest={versionDigest} eligibility={actElig} consequence={consequenceStated(actAction)} extraReasons={actReasons}
          actionLabel={LABEL[segment]} pendingLabel="recording" variant={segment === 'reject' ? 'critical' : 'primary'}
          onRun={async () => {
            const payload = segment === 'defer' && typeof deferBody === 'object' && deferBody !== null ? deferBody
              : gatePayload(segment, { rationale, nextReviewAt: nextReview, infoRequest, informationPackageDigest: g.information_package_digest });
            await done(await api.act(scope, packageId, version, segment, payload), LABEL[segment]);
            setRationale(''); setNextReview(''); setInfoRequest(''); setDeferConditions(''); setDeferOwner('');
          }}>
          <div style={{ display: 'grid', gap: 'var(--eye-space-8)', maxInlineSize: '40rem', marginBlockStart: 'var(--eye-space-8)' }}>
            <label htmlFor="gate-act">Gate act (each is its own recorded action)</label>
            <select id="gate-act" value={segment} onChange={(e) => setSegment(e.target.value as GateSegment)} style={inputStyle}>
              {acts.map((a) => <option key={a} value={a}>{LABEL[a]}</option>)}
            </select>
            <label htmlFor="gate-why">Rationale (8+ characters; recorded with your name)</label>
            <input id="gate-why" style={{ ...inputStyle, inlineSize: '100%' }} value={rationale} onChange={(e) => setRationale(e.target.value)} />
            {segment === 'defer' || segment === 'request-information' ? (<>
              <label htmlFor="gate-next">Next review</label>
              <input id="gate-next" type="datetime-local" style={inputStyle} value={nextReview} onChange={(e) => setNextReview(e.target.value)} />
            </>) : null}
            {segment === 'defer' ? (<>
              <label htmlFor="gate-conditions">Conditions for the next review (one per line, at least one)</label>
              <textarea id="gate-conditions" rows={3} style={{ ...inputStyle, inlineSize: '100%', blockSize: 'auto' }} value={deferConditions} onChange={(e) => setDeferConditions(e.target.value)} />
              <label htmlFor="gate-owner">Owner of the next review (a principal id with standing at this gate; blank: you)</label>
              <input id="gate-owner" style={inputStyle} value={deferOwner} onChange={(e) => setDeferOwner(e.target.value)} />
            </>) : null}
            {segment === 'request-information' ? (<>
              <label htmlFor="gate-info">What is asked</label>
              <input id="gate-info" style={{ ...inputStyle, inlineSize: '100%' }} value={infoRequest} onChange={(e) => setInfoRequest(e.target.value)} />
            </>) : null}
          </div>
        </CommandReview>
        /* end B81 ha */
      ) : null}

      {roles.isAuthority && versionDigest !== null && ['approved', 'under_review', 'proposed'].includes(versionState) ? (
        <div style={{ marginBlockStart: 'var(--eye-space-16)' }}>
          <GovernedButton label="Preview the consequences" pendingLabel="previewing" variant="quiet"
            onRun={async () => { const d = await done(await api.preview(scope, packageId, version, versionDigest), 'the preview'); setPreview(d.preview); setHeld(null); }} />
          {preview === null ? <p style={small}>The commitment carries the digest of your preview (valid {30} minutes): preview first.</p> : (
            /* B81 ha: the COMMAND REVIEW of the commit — the server's preview (CMP-045, read: obtained), the exact version digest, the
               authority who is not an approver, and the TYPED confirmation (PAT-16: the commit cannot be undone) */
            <CommandReview action="decision.commit" object={{ type: 'decision package', id: packageId, version, title: `Commit version ${version}`, state: versionState }}
              digest={versionDigest} eligibility={left === 0 ? { can: false, reason: 'the preview expired (30 minutes) — preview the consequences again', role: null, basis: '' } : authority === undefined ? { can: true, reason: null, role: 'decision_authority', basis: 'role decision_authority' } : commitElig}
              consequence={consequenceFromPreview(preview.preview)} consequenceRead typedPhrase={typedPhrase({ digest: versionDigest })}
              actionLabel="Commit (decision.commit, C3)" pendingLabel="committing"
              onRun={async () => {
                const d = await done(await api.commit(scope, packageId, version, versionDigest, preview.preview_digest), 'the commitment');
                setHeld(d.commitment === null ? heldLine(d.held) : null);
              }}>
              <p style={small}>preview <Mono>{preview.preview_digest.slice(0, 16)}…</Mono> · {left} minute(s) left</p>
            </CommandReview>
            /* end B81 ha */
          )}
        </div>
      ) : null}

      {(roles.isAuthority || roles.isExecutive) && g.decision_class !== 'board' && ['approved', 'under_review', 'proposed'].includes(versionState) ? (
        <details style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <summary>Override the gate (recorded; never by its committer)</summary>
          <div role="group" aria-label="Override" /* B81 ha: an inline group, not a dialog (the B80 layer ratchet shrinks) */ style={{ display: 'grid', gap: 'var(--eye-space-8)', maxInlineSize: '40rem' }}>
            <select aria-label="Override kind" value={overrideKind} onChange={(e) => setOverrideKind(e.target.value as 'normal' | 'emergency')} style={inputStyle}>
              <option value="normal">normal — a decision authority waives the failing conditions only</option>
              <option value="emergency">emergency — an executive; covers a quorum shortfall; reviewed within 72 hours</option>
            </select>
            <input aria-label="Override rationale" style={{ ...inputStyle, inlineSize: '100%' }} value={overrideWhy} onChange={(e) => setOverrideWhy(e.target.value)} placeholder="why (20+ characters)" />
            <GovernedButton label={`Grant a ${overrideKind} override`} pendingLabel="recording" variant="critical" disabled={overrideWhy.trim().length < 20}
              onRun={async () => { await done(await api.override(scope, packageId, version, overrideKind, overrideWhy), 'the override'); setOverrideWhy(''); }} />
          </div>
        </details>
      ) : null}
      {(roles.isAuthority || roles.isExecutive) ? g.overrides.filter((o) => o['kind'] === 'emergency' && !o['reviewed_at']).map((o) => (
        <GovernedButton key={String(o['override_id'])} label={`Uphold the emergency override ${short(o['override_id'])} (after the fact)`} pendingLabel="reviewing" variant="quiet"
          onRun={async () => { await done(await api.reviewOverride(scope, packageId, String(o['override_id']), 'upheld', 'Reviewed after the fact; the emergency was real'), 'the review'); }} />
      )) : null}

      {roles.isApprover && g.decision_class !== 'board' && acts.length > 0 ? (
        <details style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <summary>Delegate your approval of this package (≤ 30 days)</summary>
          <div style={{ display: 'grid', gap: 'var(--eye-space-8)', maxInlineSize: '40rem' }}>
            <input aria-label="Delegate principal id" style={inputStyle} value={delegateTo} onChange={(e) => setDelegateTo(e.target.value)} placeholder="the delegate's principal id" />
            <input aria-label="Delegation expiry" type="datetime-local" style={inputStyle} value={delegateUntil} onChange={(e) => setDelegateUntil(e.target.value)} />
            <GovernedButton label="Delegate" pendingLabel="recording" disabled={delegateTo.length !== 36 || delegateUntil === '' || rationale.trim().length < 8}
              onRun={async () => { await done(await api.delegate(scope, packageId, delegateTo, delegateUntil, rationale), 'the delegation'); }} />
            <p style={small}>The rationale above is the delegation's reason. {g.delegations.filter((d) => d['live'] === true).map((d) => (
              <button key={String(d['delegation_id'])} type="button" onClick={() => void api.endDelegation(scope, packageId, String(d['delegation_id']), rationale.trim().length >= 8 ? rationale : 'ended from the decisions page', null).then((r) => done(r, 'the end'))}>
                End delegation to {short(d['delegate_principal_id'])}</button>
            ))}</p>
          </div>
        </details>
      ) : null}

      {roles.isExecutive && versionState === 'draft' && g.decision_class !== 'board' ? (
        <div style={{ display: 'grid', gap: 'var(--eye-space-8)', maxInlineSize: '40rem', marginBlockStart: 'var(--eye-space-8)' }}>
          <input aria-label="Board charter" style={inputStyle} value={boardCharter} onChange={(e) => setBoardCharter(e.target.value)} placeholder="the board that holds this decision" />
          <GovernedButton label="Reserve for the board (quorum 2)" pendingLabel="reserving" disabled={boardCharter.trim().length < 8}
            onRun={async () => { await done(await api.reserveBoard(scope, packageId, boardCharter, 2, `Reserved from the decisions page: ${boardCharter}`), 'the reservation'); }} />
        </div>
      ) : null}
      {actProblem !== null && <LiveStatus assertive><span style={critical}>{actProblem}</span></LiveStatus>}
      <Receipt receipt={receipt} />
    </div>
  );
}
