'use client';
/**
 * Decisions — packages by state; a package's options side by side on their common
 * baseline with SYNTHETIC on every simulated consequence and the uncertainty in
 * words; the choice; dissent; approvers and their approvals; the commitment; the
 * monitoring conditions, breaches and outcomes; and Replay — five layers under their
 * cut-offs, unavailable artefacts marked. State is never told by colour alone;
 * receipts come only from authoritative responses.
 */
import { useEffect, useMemo, useState } from 'react';
import { useShell } from './layout';
import { decisions as api, type Package, type PackageVersion, type Option, type Replay } from '../../lib/decisions';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, fmtInstant } from '../../components/observation';
import { tableStyle, Th, Td, buttonStyle, Receipt as ReceiptNote, ErrorNote } from '../../components/ui';
// B24 (0086) markers
import { SourceImpactControl } from './source-impact-control';
// B34 (0090) gates
import { GateControl } from './gate-control';
/* B36 (0094) gates: the gate completed — signature, recusal, challenge, distribution, the validated fields, the one gate state */
import { GateCompletion } from './gate-completion';
/* end B36 gates */
import { CONDITION_KINDS, buildCondition, type TypedCondition } from '../../lib/gates';
/* B81 ha: the shared authority components — the frozen digest, the command review of the approval, the proposal and the withdrawal */
import { AuthorityBanner, CommandReview, DecisionDigest } from '../../components/authority';
import { ACT_ROLES, consequenceStated, decisionDigestView, eligibility, rolesIn } from '../../lib/authority-b81';
import { authorityApi } from '../../lib/authority-api-b81';
import { reviewDigest } from '../../lib/forms-b80';
/* end B81 ha */
/* B81 si: the palette's hand-off (UX-13-004) — `?package=<id>&review=<action>` opens that package with its Command Review in view */
import { reviewRequested } from '../../lib/authority-b81';
import { routeId } from '../../lib/object-b81';
/* end B81 si */
/* B82 ev: every option citation a CitationLink (CMP-026, UX-ADR-006) — resolved in one batch under graph.provenance.read, opened in a drawer on this page */
import { CitationLink } from '../../components/evidence';
import { useCitationResolutions } from '../../lib/evidence-api-b82';
import { citationKey, parseCitations } from '../../lib/evidence-b82';
/* end B82 ev */

const STATE_TEXT: Record<string, string> = { draft: '◌ DRAFT', proposed: '◍ PROPOSED', under_review: '◍ UNDER REVIEW', approved: '● APPROVED', committed: '■ COMMITTED', monitoring: '◉ MONITORING', closed: '□ CLOSED', rejected: '✕ REJECTED', withdrawn: '✕ WITHDRAWN',
  /* B34 (0090) gates */ deferred: '◷ DEFERRED', information_requested: '? INFORMATION REQUESTED' };
const day = (v: unknown): string => (typeof v === 'string' ? v.slice(0, 10) : v === null || v === undefined ? '—' : String(v).slice(0, 10));
const short = (v: unknown): string => (typeof v === 'string' ? `${v.slice(0, 8)}…` : '—');
type Err = { code: string; message: string; correlationId: string } | null;
type Rcpt = { policyDecisionId: string; auditSeq: number } | null;

function Uncertainty({ o }: { o: Option }) {
  const u = o.uncertainty ?? {};
  const parts: string[] = [];
  if (!o.simulated) parts.push(`UNSIMULATED — ${o.unsimulated_reason ?? 'no reason recorded'}`);
  if ((u.synthetic_inputs ?? 0) > 0) parts.push(`${u.synthetic_inputs} synthetic input(s)`);
  if ((u.unvalidated_runs ?? 0) > 0) parts.push(`${u.unvalidated_runs} run(s) not validated`);
  if ((u.outside_envelope_runs ?? 0) > 0) parts.push(`${u.outside_envelope_runs} run(s) outside the model envelope`);
  if ((u.truth_states ?? []).length > 0) parts.push(`truth states: ${(u.truth_states ?? []).join(', ')}`);
  return <span style={{ fontSize: 'var(--eye-type-label-sm)' }}>{parts.length === 0 ? 'no uncertainty derived' : parts.join(' · ')}</span>;
}

export default function DecisionsPage() {
  const { scope, me, isApprover, isAuthority, isDecisionOwner, isExecutive, /* B36 (0094) gates */ isBoardMember, isAuditor /* end B36 gates */ } = useShell();
  const [rows, setRows] = useState<Package[] | null>(null);
  const [open, setOpen] = useState<Package | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt>(null);
  const [replay, setReplay] = useState<Replay | null>(null);
  const [monitoring, setMonitoring] = useState<{ outcomes: Array<Record<string, unknown>>; breaches: Array<Record<string, unknown>> } | null>(null);
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);
  /* B34 (0090) gates: the condition builder on the approval */
  const [conditions, setConditions] = useState<TypedCondition[]>([]);
  const [cond, setCond] = useState<{ kind: string; ref: string; expected: string; label: string }>({ kind: 'assumption_holds', ref: '', expected: '', label: '' });
  const [condProblem, setCondProblem] = useState<string | null>(null);
  /* B81 ha: the proposal's review digest (PAT-04: the draft frozen as REVIEWED — a change after the review holds the proposal), the withdrawal's reason */
  const [draftDigest, setDraftDigest] = useState<string | null>(null);
  const [withdrawReason, setWithdrawReason] = useState('');
  const [authProblem, setAuthProblem] = useState<string | null>(null);
  /* end B81 ha */

  const load = async () => {
    const r = await api.list(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the packages could not be read'); return; }
    setRows(r.data.packages);
  };
  useEffect(() => { void load(); }, [scope]);
  /* B81 si: THE PALETTE'S HAND-OFF (UX-13-004, UX-ADR-008) — `/decisions?package=<id>&review=<action>` opens THAT package so its Command
     Review is on screen; nothing is preselected, approved or run: the review renders its own gate (eligibility, digest, consequence,
     rationale) and the person acts deliberately — or not at all. A package the link names but the server refuses is said in its words. */
  const [handoff, setHandoff] = useState<{ action: string | null; packageId: string | null } | null>(null);
  useEffect(() => {
    const sp = typeof window === 'undefined' ? '' : window.location.search;
    const action = reviewRequested(sp); const pkg = routeId(new URLSearchParams(sp).get('package'));
    if (action === null && pkg === null) return;
    setHandoff({ action, packageId: pkg });
    if (pkg !== null) void openPackage(pkg);
  }, [scope]); // eslint-disable-line react-hooks/exhaustive-deps
  /* end B81 si */
  const openPackage = async (id: string) => {
    const r = await api.get(scope, id);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the package could not be read'); return; }
    setOpen(r.data.package); setReplay(null); setError(null); setReceipt(null);
    setVersion(r.data.package.committed_version ?? r.data.package.current_version ?? null);
    const m = await api.outcomes(scope, id);
    setMonitoring(m.ok && m.data !== undefined ? { outcomes: m.data.outcomes, breaches: m.data.breaches } : null);
  };
  const act = async (fn: () => Promise<{ ok: boolean; data?: { receipt: { policyDecisionId: string; auditSeq: number } } | undefined; error?: { code: string; message: string; correlationId: string } | null }>) => {
    setBusy(true); setError(null); setReceipt(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok || r.data === undefined) { setError(r.error ?? { code: 'EYE-UNKNOWN', message: 'refused', correlationId: '' }); return false; }
    setReceipt(r.data.receipt);
    return true;
  };

  /* B81 ha: the body a proposal freezes — the draft version as the record serves it (options, terms, choice), digested as reviewed */
  const draftBody = (pv: PackageVersion) => ({ version: pv.version, options: pv.options.map((o) => ({ key: o.key, title: o.title, kind: o.kind, consequences: o.consequences })), choice: pv.choice,
    objectives: pv.objectives, constraints: pv.constraints, approver_policy: pv.approver_policy, monitoring_conditions: pv.monitoring_conditions, reversibility: pv.reversibility });
  const draftOf = open === null || version === null ? null : open.versions.find((x) => x.version === version && x.state === 'draft') ?? null;
  useEffect(() => { setDraftDigest(null); if (draftOf !== null) void reviewDigest(draftBody(draftOf)).then(setDraftDigest); }, [open, version]);
  /* end B81 ha */

  /* B82 ev */
  const evRefs = useMemo(() => {
    const vv = open === null || version === null ? null : open.versions.find((x) => x.version === version) ?? null;
    return vv === null ? [] : parseCitations(vv.options.flatMap((o) => o.consequences)).refs;
  }, [open, version]);
  const evRes = useCitationResolutions(scope, evRefs);
  /* end B82 ev */
  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rows === null) return <Empty>reading decisions…</Empty>;
  const v: PackageVersion | null = open === null || version === null ? null : open.versions.find((x) => x.version === version) ?? null;
  const chosen = v?.choice?.option_key ?? null;
  /* B81 ha: eligibility in words (the server re-judges each rule): the roles here, the approver policy, separation of duties (0042) */
  const roleCodes = rolesIn(me.bindings, scope);
  const authorId = v === null ? null : String((v as unknown as Record<string, unknown>)['author_principal_id'] ?? '') || null;
  const sod = open === null ? [] : [
    { principal: open.owner_principal_id, why: 'you own this package — an owner never approves their own version (0042)' },
    ...(authorId !== null && authorId !== open.owner_principal_id ? [{ principal: authorId, why: 'you authored this version — an author never approves it' }] : []),
  ];
  const approveElig = v === null ? null : eligibility({ action: 'decision.approve', me: me.principalId, isHuman: true, roles: roleCodes, requiredRoles: ACT_ROLES['decision.approve']!,
    policy: v.approver_policy, excluded: sod, state: v.state, openStates: ['proposed', 'under_review', 'approved'] });
  const proposeElig = v === null || open === null ? null : eligibility({ action: 'decision.package.propose', me: me.principalId, isHuman: true, roles: roleCodes, requiredRoles: ACT_ROLES['decision.package.propose']!,
    state: v.state, openStates: ['draft'], excluded: open.owner_principal_id === me.principalId ? [] : [{ principal: me.principalId, why: 'the package owner proposes its version' }] });
  const reviewersOf = (pv: PackageVersion) => [...(pv.approver_policy.principals ?? []).map((x) => `principal ${x.slice(0, 8)}…`), ...(pv.approver_policy.roles ?? []).map((x) => `role ${x}`)];
  const withdrawable = open !== null && !['committed', 'monitoring', 'closed', 'withdrawn'].includes(open.state) && open.committed_version === null;
  const withdrawnEvent = open === null ? null : (open.events ?? []).find((e) => e['event'] === 'package.withdrawn') ?? null;
  /* end B81 ha */

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Decisions</h1>
      {/* B81 si: the hand-off, said — nothing has been done */}
      {handoff === null ? null : (
        <p role="status" className="eye-palette-reason">
          You came from the palette to review {handoff.action === null ? 'an act' : <strong>{handoff.action}</strong>}{handoff.packageId === null ? ' — choose the package below; its Command Review opens with it' : ' on the package opened below'}.
          Nothing has been done: the Command Review shows the effect, your eligibility and the exact digest before you decide.
        </p>
      )}
      {/* end B81 si */}
      <p style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>
        A package is complete or refused; what is approved is the <strong>choice</strong>, never a menu; a commitment is one exact C3 act by a named human authority who is not an approver. No model recommends an option here.
      </p>
      {rows.length === 0 ? <Empty>No decision package has been declared.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <caption style={{ captionSide: 'top', textAlign: 'start', color: 'var(--eye-color-ink-muted)' }}>{rows.length} package(s)</caption>
          <thead><tr><Th>Package</Th><Th>State</Th><Th>World</Th><Th>Version</Th><Th>Decided</Th></tr></thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.package_id}>
                <Td><button type="button" onClick={() => void openPackage(r.package_id)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-default)', cursor: 'pointer', textDecoration: 'underline', textAlign: 'start' }}>{r.title}</button></Td>
                <Td>{STATE_TEXT[r.state] ?? r.state}</Td>
                <Td>{r.synthetic_state ? <strong style={{ color: 'var(--eye-color-critical)' }}>SYNTHETIC</strong> : 'observed world'}</Td>
                <Td mono>{r.committed_version !== null ? `v${r.committed_version} committed` : r.current_version !== null ? `v${r.current_version}` : '—'}</Td>
                <Td mono>{r.decided_at ? fmtInstant(r.decided_at) : '—'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {open === null ? null : (
        <section aria-labelledby="dpk-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="dpk-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{open.title}</h2>
          <p>{open.statement}</p>
          <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>
            {open.synthetic_state ? <strong style={{ color: 'var(--eye-color-critical)' }}>SYNTHETIC DECISION — </strong> : null}
            state <strong>{STATE_TEXT[open.state] ?? open.state}</strong>{open.decision_class === 'board' ? <strong> · ▣ BOARD DECISION</strong> : null} · decides <strong>{open.decision?.title ?? short(open.decision_object_id)}</strong> · owner <Mono>{short(open.owner_principal_id)}</Mono>
            {open.decided_at ? <> · decided at <Mono>{fmtInstant(open.decided_at)}</Mono></> : null}
          </p>
          <dl>
            <DefinitionRow term="Versions">
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
                {open.versions.map((x) => (
                  <button key={x.version} type="button" onClick={() => { setVersion(x.version); setReplay(null); }}
                    style={{ border: `1px solid var(${x.version === version ? '--eye-color-accent-default' : '--eye-color-border-default'})`, background: 'none', padding: '4px 8px', cursor: 'pointer', borderRadius: 6 }}>
                    v{x.version} · {x.state}{x.supersedes ? ` (supersedes v${x.supersedes})` : ''}
                  </button>
                ))}
              </div>
            </DefinitionRow>
          </dl>
          {v === null ? <Empty>No version.</Empty> : (
            <>
              <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Version {v.version} · {v.state}</h3>
              <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>
                <strong>Cut-offs:</strong> observations through <Mono>{day(v.observed_through)}</Mono>, read at record time <Mono>{fmtInstant(v.known_at)}</Mono>
                {' · '}baseline {v.baseline_run_id ? <Mono>{short(v.baseline_run_id)}</Mono> : 'none'} · digest <Mono>{v.version_digest ? `${v.version_digest.slice(0, 16)}…` : 'not yet bound'}</Mono>
                {' · '}approver policy: quorum {v.approver_policy.quorum ?? '—'} of {[...(v.approver_policy.principals ?? []).map((x) => `principal ${x.slice(0, 8)}…`), ...(v.approver_policy.roles ?? []).map((x) => `role ${x}`)].join(', ') || 'nobody named'}
              </p>
              {/* B81 ha: the DECISION DIGEST (CMP-047) — the frozen version whole; a newer version named, never shown in place */}
              {decisionDigestView(open, v.version) === null ? null : <DecisionDigest digest={decisionDigestView(open, v.version)!} />}
              {/* PAT-04: SUBMIT FOR REVIEW — the draft as reviewed (its digest), the named required reviewers; it approves nothing */}
              {isDecisionOwner && v.state === 'draft' && proposeElig !== null ? (
                <>
                  <AuthorityBanner act="submit this version for review" eligibility={proposeElig} reviewers={reviewersOf(v)} quorum={v.approver_policy.quorum !== undefined ? { live: 0, required: v.approver_policy.quorum } : null} />
                  <CommandReview action="decision.package.propose" object={{ type: 'decision package', id: open.package_id, version: v.version, title: open.title, state: v.state }}
                    digest={draftDigest} eligibility={proposeElig} consequence={consequenceStated('decision.package.propose')}
                    extraReasons={v.choice === null ? ['the version has no choice yet — a menu of options is not a proposal'] : []}
                    actionLabel="Submit this version for review" pendingLabel="proposing" problem={authProblem}
                    onRun={async () => {
                      setAuthProblem(null);
                      const now = await api.get(scope, open.package_id);
                      const cur = now.ok && now.data !== undefined ? now.data.package.versions.find((x) => x.version === v.version) ?? null : null;
                      const curDigest = cur === null ? null : await reviewDigest(draftBody(cur));
                      if (curDigest === null || curDigest !== draftDigest) { setAuthProblem('The draft changed since your review — read it again before submitting it.'); void openPackage(open.package_id); throw new Error('stale'); }
                      const ok = await act(() => authorityApi.propose(scope, open.package_id, v.version));
                      if (!ok) throw new Error('refused');
                      void openPackage(open.package_id);
                    }} />
                </>
              ) : null}
              {/* end B81 ha */}
              <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Options on one baseline</h4>
              {/* B82 ev */}{evRes.state === 'refused' && <><p className="eye-ev-note">The citations below were not resolved on this read:</p><ErrorNote error={evRes.error} /></>}{/* end B82 ev */}
              <table className="eye-table" style={tableStyle}>
                <thead><tr><Th>Option</Th><Th>Kind</Th><Th>Consequences</Th><Th>Uncertainty</Th><Th>Choice</Th></tr></thead>
                <tbody>
                  {v.options.map((o) => (
                    <tr key={o.option_id}>
                      <Td>{o.title} <Mono>{o.key}</Mono></Td>
                      <Td>{o.kind === 'status_quo' ? 'status quo (do nothing)' : 'intervention'}</Td>
                      <Td>
                        {o.consequences.length === 0 ? '—' : o.consequences.map((c) => (
                          <div key={`${c.kind}:${c.id}@${c.version}`} style={{ fontSize: 'var(--eye-type-label-sm)' }}>
                            {c.kind === 'run' ? <strong style={{ color: 'var(--eye-color-critical)' }}>SYNTHETIC </strong> : null}
                            {/* B82 ev */}<CitationLink citation={c} scope={scope} resolution={evRes.state === 'ready' ? evRes.byKey.get(citationKey(c)) ?? null : evRes.state === 'refused' ? null : undefined} />{/* end B82 ev */}
                          </div>
                        ))}
                        {o.synthetic_state ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-critical)', fontWeight: 650 }}>SYNTHETIC</div> : null}
                      </Td>
                      <Td><Uncertainty o={o} /></Td>
                      <Td>{chosen === o.key ? <strong>■ CHOSEN</strong> : ''}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {v.choice === null ? <UnknownNote>No choice yet: a menu of alternatives is not a proposal.</UnknownNote> : (
                <dl>
                  <DefinitionRow term="The choice">option <Mono>{v.choice.option_key}</Mono> — “{v.choice.rationale}”</DefinitionRow>
                  <DefinitionRow term="Deadline · action owner">{v.choice.decision_deadline} · principal <Mono>{short(v.choice.action_owner)}</Mono></DefinitionRow>
                  <DefinitionRow term="Accepted trade-offs">{v.choice.accepted_trade_offs.join('; ') || 'none stated'}</DefinitionRow>
                  <DefinitionRow term="Outcome criteria">{v.choice.outcome_criteria.map((k) => `${k.quantity} ${k.comparator} ${k.target} ${k.unit} by ${k.by} (observed on ${k.observed_on}${k.twin_id ? ` of twin ${k.twin_id.slice(0, 8)}…` : ''}${k.period ? `, ${k.period.from} to ${k.period.to}` : ''})`).join('; ')}</DefinitionRow>
                  <DefinitionRow term="Monitoring">{v.monitoring_conditions.map((m, i) => <span key={i}>{String(m['kind'])}{m['every_days'] ? ` every ${String(m['every_days'])} days` : ''} → owner <Mono>{short(m['owner'])}</Mono>; </span>)}</DefinitionRow>
                </dl>
              )}
              <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Dissent (every version of this package — never removed by approval or by a change of choice)</h4>
              {open.versions.every((x) => x.dissent.length === 0) ? <Empty>No dissent recorded.</Empty> : open.versions.flatMap((x) => x.dissent.map((d) => (
                <p key={d.dissent_id} style={{ fontSize: 'var(--eye-type-label-sm)' }}><strong>{d.position}</strong> — {d.rationale} <span style={{ color: 'var(--eye-color-ink-muted)' }}>(on v{x.version}, principal {short(d.principal_id)}, {fmtInstant(d.recorded_at)})</span></p>
              )))}
              <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Approvals</h4>
              {v.approvals.length === 0 ? <Empty>No approval recorded.</Empty> : (
                <table className="eye-table" style={tableStyle}>
                  <thead><tr><Th>Approver</Th><Th>Decision</Th><Th>Standing</Th><Th>Expires</Th><Th>Recorded</Th></tr></thead>
                  <tbody>{v.approvals.map((a) => (
                    <tr key={a.approval_id}><Td mono>{short(a.approver_principal_id)}</Td><Td>{a.decision}</Td>
                      <Td>{a.revoked_at ? `REVOKED — ${a.revoked_reason ?? ''}` : a.live ? '● live' : 'not counted (expired, another digest, or the approver is no longer eligible)'}</Td>
                      <Td mono>{fmtInstant(a.expires_at)}</Td><Td mono>{fmtInstant(a.recorded_at)}</Td></tr>
                  ))}</tbody>
                </table>
              )}
              {open.commitment ? (
                <p style={{ fontSize: 'var(--eye-type-label-sm)' }}><strong>■ COMMITTED</strong> under <Mono>{String(open.commitment['bound_action'])}</Mono> at class <Mono>{String(open.commitment['op_class'])}</Mono> by principal <Mono>{short(open.commitment['committed_by'])}</Mono> at <Mono>{fmtInstant(open.commitment['committed_at'])}</Mono>; the CMT <Mono>{short(open.commitment['commitment_id'])}</Mono> names the approved option.</p>
              ) : null}
              {monitoring !== null && (monitoring.breaches.length > 0 || monitoring.outcomes.length > 0) ? (
                <>
                  <h4 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Monitoring and outcomes</h4>
                  {monitoring.breaches.map((b) => <p key={String(b['breach_id'])} style={{ fontSize: 'var(--eye-type-label-sm)' }}><strong>⚠ BREACH</strong> condition {String(b['condition_index'])} · warning <Mono>{short(b['warning_id'])}</Mono> · routed to <Mono>{short(b['routed_to'])}</Mono> · window closes <Mono>{fmtInstant(b['response_window_closes_at'])}</Mono></p>)}
                  {monitoring.outcomes.map((o) => <p key={String(o['outcome_id'])} style={{ fontSize: 'var(--eye-type-label-sm)' }}><strong>{o['met'] === true ? '● OUTCOME MET' : '○ OUTCOME NOT MET'}</strong> {String(o['criterion_key'])}: observed <Mono>{String(o['observed_value'])} {String(o['unit'] ?? '')}</Mono> against target {String(o['comparator'])} {String(o['target'])}{o['reconciliation_id'] ? <> · reconciled against the chosen run (<Mono>{short(o['reconciliation_id'])}</Mono>)</> : null}</p>)}
                </>
              ) : null}
              {/* B24 (0086) markers: the source impact on this version and its acknowledgement (the commitment is refused while one is outstanding) */}
              <SourceImpactControl scope={scope} packageId={open.package_id} version={v.version} versionState={v.state} isAuthority={isAuthority} />
              {/* end B24 markers */}
              {/* B34 (0090) gates: the authority banner, the distinct acts, the override, the delegation, the preview and the commit */}
              <GateControl scope={scope} packageId={open.package_id} version={v.version} versionState={v.state} versionDigest={v.version_digest}
                roles={{ isApprover, isAuthority, isDecisionOwner, isExecutive }} onChange={() => void openPackage(open.package_id)}
                /* B81 ha */ authority={{ me: me.principalId, roleCodes, ownerId: open.owner_principal_id, authorId, policy: v.approver_policy }} /* end B81 ha */ />
              {/* end B34 gates */}
              {/* B36 (0094) gates: the gate's record — the one state badge, the signatures verified, recusals, challenges, denials, distributions, the fields */}
              <GateCompletion scope={scope} packageId={open.package_id} version={v.version} versionState={v.state} me={me.principalId}
                roles={{ isApprover, isAuthority, isDecisionOwner, isExecutive, isBoardMember, isAuditor }} onChange={() => void openPackage(open.package_id)}
                /* B81 ha */ withdrawal={open.state === 'withdrawn' ? (withdrawnEvent ?? {}) : null} /* end B81 ha */ />
              {/* end B36 gates */}
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', marginBlockStart: 'var(--eye-space-16)' }}>
                {isApprover && ['proposed', 'under_review', 'approved', 'deferred', 'information_requested'].includes(v.state) && v.version_digest !== null && approveElig !== null ? (
                  /* B81 ha: the DELIBERATE APPROVAL (PAT-07) through the COMMAND REVIEW — eligibility (the policy, separation of duties), the exact
                     digest, the stated consequence, the rationale; one item, never a batch; the signature follows in the gate's record */
                  <CommandReview action="decision.approve" object={{ type: 'decision package', id: open.package_id, version: v.version, title: open.title, state: v.state }}
                    digest={v.version_digest} eligibility={approveElig} consequence={consequenceStated('decision.approve')}
                    rationale={{ value: rationale, onChange: setRationale, min: 8, label: 'Approval rationale' }}
                    actionLabel="Approve this digest" pendingLabel="approving"
                    onRun={async () => {
                      const ok = await act(() => api.approve(scope, open.package_id, v.version, { decision: 'approve', versionDigest: v.version_digest as string, rationale, conditions }));
                      if (!ok) throw new Error('refused');
                      setConditions([]); void openPackage(open.package_id);
                    }}>
                    {/* B34 (0090) gates: the condition builder — typed conditions evaluated at commitment and in monitoring */}
                    <fieldset style={{ border: '1px solid var(--eye-color-border-default)', borderRadius: 6, padding: 8 }}>
                      <legend style={{ fontSize: 'var(--eye-type-label-sm)' }}>Approve only if… ({conditions.length} condition(s))</legend>
                      <select aria-label="Condition kind" value={cond.kind} onChange={(e) => setCond({ ...cond, kind: e.target.value })}>{CONDITION_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
                      <input aria-label="Condition reference id" value={cond.ref} onChange={(e) => setCond({ ...cond, ref: e.target.value })} placeholder="the assumption / indicator / claim / branch id" />
                      <input aria-label="Condition expected" value={cond.expected} onChange={(e) => setCond({ ...cond, expected: e.target.value })} placeholder="expected (clear | breached, a truth state, an instant)" />
                      <input aria-label="Condition label" value={cond.label} onChange={(e) => setCond({ ...cond, label: e.target.value })} placeholder="e.g. only if customs pre-clearance holds" />
                      <button type="button" style={buttonStyle} onClick={() => { const c = buildCondition({ kind: cond.kind, ref: cond.ref, expected: cond.expected || undefined, label: cond.label }); if (typeof c === 'string') { setCondProblem(c); return; } setCondProblem(null); setConditions([...conditions, c]); }}>Add condition</button>
                      {condProblem === null ? null : <span role="alert" style={{ color: 'var(--eye-color-critical)' }}> {condProblem}</span>}
                      {conditions.map((c, i) => <div key={i} style={{ fontSize: 'var(--eye-type-label-sm)' }}>“{c.label}” — {c.kind} {c.ref ? `${c.ref.slice(0, 8)}…` : c.expected}</div>)}
                    </fieldset>
                  </CommandReview>
                  /* end B81 ha */
                ) : null}
                {/* B81 ha: the WITHDRAWAL (PAT-11) — the owner's, with its reason; nothing is erased (the record below keeps who, why, who had it) */}
                {isDecisionOwner && withdrawable && open.owner_principal_id === me.principalId ? (
                  <CommandReview action="decision.package.withdraw" object={{ type: 'decision package', id: open.package_id, version: v.version, title: open.title, state: open.state }}
                    digest={v.version_digest ?? `draft:${v.version}`} eligibility={{ can: true, reason: null, role: 'decision_owner', basis: 'the package owner' }} consequence={consequenceStated('decision.package.withdraw')}
                    rationale={{ value: withdrawReason, onChange: setWithdrawReason, min: 8, label: 'Withdrawal reason' }}
                    actionLabel="Withdraw the package" pendingLabel="withdrawing" variant="critical"
                    onRun={async () => { const ok = await act(() => authorityApi.withdraw(scope, open.package_id, withdrawReason.trim())); if (!ok) throw new Error('refused'); setWithdrawReason(''); void openPackage(open.package_id); }}>
                    <p className="eye-help">Withdrawing ends this package&apos;s review and cannot be undone; its versions, approvals and this reason are kept on the record.</p>
                  </CommandReview>
                ) : null}
                {/* end B81 ha */}
                {/* B34 (0090) gates: the Commit lives in the gate below — Preview first; the commit carries its digest */}
                {(isExecutive || isDecisionOwner || isApprover || isAuthority) && open.committed_version === v.version ? (
                  <button type="button" style={buttonStyle} disabled={busy} onClick={() => void (async () => { setBusy(true); const r = await api.replay(scope, open.package_id, v.version, null); setBusy(false); if (!r.ok || r.data === undefined) { setError(r.error ?? null); return; } setReplay(r.data.replay); setReceipt(r.data.receipt); })()}>Replay what we knew</button>
                ) : null}
              </div>
              <ErrorNote error={error} />
              <ReceiptNote receipt={receipt} />
              {replay === null ? null : (
                <section aria-labelledby="rpl-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
                  <h3 id="rpl-h" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>Replay — five layers under their cut-offs</h3>
                  <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>
                    known / believed: recorded at or before <Mono>{String(replay.cutoffs['known_at'])}</Mono>, observed through <Mono>{String(replay.cutoffs['observed_through'] ?? '—')}</Mono> · tested / decided: at or before <Mono>{String(replay.cutoffs['decided_at'])}</Mono> · observed: after that and at or before <Mono>{String(replay.cutoffs['as_of'])}</Mono>
                    {' · '}content digest <Mono>{replay.contentDigest.slice(0, 16)}…</Mono> (the same for anyone under these cut-offs)
                  </p>
                  {replay.unavailable.length > 0 ? <UnknownNote><strong>UNAVAILABLE NOW.</strong> {replay.unavailable.map((u, i) => <span key={i}>{String(u['layer'])}: {String(u['id']).slice(0, 8)}…@{String(u['version'])} — {String(u['reason'])}; </span>)} Nothing later was substituted.</UnknownNote> : null}
                  <dl>
                    <DefinitionRow term="Known">{replay.layers.known.length} evidence version(s): {replay.layers.known.map((k) => <Mono key={`${String(k['id'])}@${String(k['version'])}`}>{String(k['id']).slice(0, 8)}…@{String(k['version'])} ({String(k['truth_state'])}{k['synthetic_state'] === true ? ', SYNTHETIC' : ''}) </Mono>)}</DefinitionRow>
                    <DefinitionRow term="Believed">
                      {(replay.layers.believed['assumptions'] ?? []).map((a) => <span key={String(a['id'])}>assumption {String(a['id']).slice(0, 8)}… was <strong>{String(a['verification_at_known_at'])}</strong>; </span>)}
                      {(replay.layers.believed['branches'] ?? []).map((b) => <span key={String(b['branch_id'])}>branch {String(b['name'])} was <strong>{String(b['state_as_of'])}</strong>; </span>)}
                      {(replay.layers.believed['twins'] ?? []).map((t) => <span key={String(t['twin_id'])}>twin <strong>{String(t['validation_status'])}</strong>; </span>)}
                      {(replay.layers.believed['forecasts'] ?? []).map((f) => <span key={String(f['id'])}>forecast {String(f['id']).slice(0, 8)}… <strong>{String(f['validation_state'] ?? f['truth_state'])}</strong>; </span>)}
                    </DefinitionRow>
                    <DefinitionRow term="Tested">{(replay.layers.tested['runs'] ?? []).length} run(s) with their digests · {(replay.layers.tested['reproductions'] ?? []).length} reproduction verdict(s) before the decision · twin version(s) {(replay.layers.tested['twin_versions'] ?? []).map((t) => `${String(t['twin_id']).slice(0, 8)}…@${String(t['version'])} (${String(t['verification_at_decided_at'])})`).join(', ')}</DefinitionRow>
                    <DefinitionRow term="Decided">version digest <Mono>{String((replay.layers.decided['version'] as Record<string, unknown>)?.['version_digest'] ?? '').slice(0, 16)}…</Mono> · {((replay.layers.decided['dissent'] as unknown[]) ?? []).length} dissent on this version, {((replay.layers.decided['prior_dissent'] as unknown[]) ?? []).length} on earlier versions · {((replay.layers.decided['approvals'] as unknown[]) ?? []).length} approval(s) · commitment at class <Mono>{String((replay.layers.decided['commitment'] as Record<string, unknown>)?.['op_class'])}</Mono> · policy decision <Mono>{short((replay.layers.decided['policy'] as Record<string, unknown> | null)?.['policy_decision_id'])}</Mono> · audit seq <Mono>{String((replay.layers.decided['audit'] as Record<string, unknown> | null)?.['audit_seq'] ?? '—')}</Mono></DefinitionRow>
                    {/* B34 (0090) gates: the controls in force at the decision instant */}
                    <DefinitionRow term="Controls in force when decided">{(replay.controlsInForce?.controls ?? []).length === 0 ? 'no policy revision or control decision recorded by then' : (replay.controlsInForce?.controls ?? []).map((c) => `${String(c['control_key'])} v${String(c['version'])} (${String(c['kind'])})`).join(' · ')}</DefinitionRow>
                    {/* B36 (0094) gates: the PDP denials on the package's versions, beside the content */}
                    <DefinitionRow term="Denied acts (the PDP)">{(replay.denials ?? []).length === 0 ? 'no decision act was refused by the policy decision point' : (replay.denials ?? []).map((d) => `${String(d['principal_id']).slice(0, 8)}… tried ${String(d['action'])} — ${String(d['reason'])}`).join(' · ')}</DefinitionRow>
                    <DefinitionRow term="Observed (after the decision)">{Object.entries(replay.layers.observed).filter(([, arr]) => arr.length > 0).map(([k, arr]) => `${k}: ${arr.length}`).join(' · ') || 'nothing yet'}</DefinitionRow>
                  </dl>
                </section>
              )}
            </>
          )}
        </section>
      )}
    </>
  );
}
