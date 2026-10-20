'use client';
/**
 * CP-6 B50 §LC — ONE ASSESSMENT (F-P3-02: PR-06-001/003/005, ADR-006; DESIGN D5): `/intelligence/assessments/<id>` opens EXACTLY the work object
 * it names (the lifecycle history route, objects.lifecycle.read) or says it cannot. B81's ObjectHeader carries its identity, version, owner and
 * the authority statement read from the record (the review, the approval — or that none is recorded); the lifecycle reading beside it comes
 * from the SERVER'S PROFILE. The acts (review, approve, publish, correct, supersede, withdraw, archive, retire, reopen, undo) are offered
 * from the current state, each with whether you may take it and why not, and run behind the Command Review: the version you read, your
 * rationale, the typed confirmation of a publication, a withdrawal and a retirement. The server decides; a refused attempt is KEPT in the
 * record (shown below, in the server's words). A person who may not act PROPOSES to the owner; the owner accepts or declines here.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useShell } from '../../layout';
import { routeId, type ObjectHeaderInput } from '../../../../lib/object-b81';
import { LINK_OUTCOME_WORDS } from '../../../../lib/shell-b80';
import { rolesIn, typedPhrase, type Eligibility } from '../../../../lib/authority-b81';
import { degraded as degradedApi, type DegradedState } from '../../../../lib/degraded-b81';
import { REENTRY_REASONS_WEB, commandKey, consequenceOf, cycleFacts, lifecycle, lifecycleFromProfile, offers, type Offer, type ServerProfile } from '../../../../lib/lifecycle-b50';
import { ObjectHeader } from '../../../../components/object';
import { CommandReview, TypedConfirmation } from '../../../../components/authority';
import { ErrorNote, inputStyle } from '../../../../components/ui';
import { Empty } from '../../../../components/observation';
import { LifecycleHistory, TransitionOutcomeNote } from '../../../../components/knowledge';

type Row = Record<string, unknown>;
type Err = { code: string; message: string; correlationId: string } | null;

/** ONE h1 per rendering (lib/layout-b81's REG-03 ratchet): every branch titles the page through this element. */
function PageTitle({ children }: { children: import('react').ReactNode }) { return <h1>{children}</h1>; }

export default function AssessmentPage() {
  const { scope, me } = useShell();
  const params = useParams<{ id: string }>();
  const id = routeId(params.id);
  const [life, setLife] = useState<Row | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [profile, setProfile] = useState<ServerProfile | null>(null);
  const [dg, setDg] = useState<DegradedState | null>(null);
  const [err, setErr] = useState<Err>(null);
  const [actName, setActName] = useState('');
  const [reason, setReason] = useState(''); const [reentry, setReentry] = useState(''); const [cause, setCause] = useState(''); const [newStatement, setNewStatement] = useState('');
  const [typed, setTyped] = useState('');
  const [answer, setAnswer] = useState<Row | null>(null); const [problem, setProblem] = useState<string | null>(null);
  const [proposeWhy, setProposeWhy] = useState(''); const [decideWhy, setDecideWhy] = useState('');

  const load = useCallback(async () => {
    if (id === null) return;
    const [h, p, d] = await Promise.all([lifecycle.history(scope, 'ASM', id), lifecycle.profiles(scope), degradedApi.state(scope, 'intelligence')]);
    if (!h.ok || h.data === undefined || (h.data.lifecycle['object'] as Row | undefined)?.['object_id'] !== id) {
      setErr(h.error ?? { code: 'EYE-OBJ', message: 'the answer did not name the assessment the link names', correlationId: '—' }); return;
    }
    setLife(h.data.lifecycle); setReceipt(h.data.receipt); setErr(null);
    if (p.ok && p.data !== undefined) setProfile(p.data.profiles.find((x) => x.object_type === 'ASM') ?? null);
    setDg(d.ok && d.data !== undefined ? d.data.degraded : null);
  }, [scope, id]);
  useEffect(() => { void load(); }, [load]);

  const o = (life?.['object'] ?? null) as Row | null;
  const transitions = (life?.['transitions'] ?? []) as Row[];
  const facts = useMemo(() => cycleFacts(transitions), [transitions]);
  const ownerId = typeof o?.['owner'] === 'string' ? String(o['owner']).replace(/^principal:/, '') : null;
  const roles = rolesIn(me.bindings, scope);
  const all: Offer[] = profile === null || o === null ? [] : offers(profile, {
    me: me.principalId, isHuman: me.kind === 'human', roles, owner: ownerId, author: facts.author, reviewer: facts.reviewer, state: String(o['state']),
    governedHere: life?.['governed_here'] === true, degraded: dg, last: facts.last,
  });
  const act = all.find((x) => x.action === actName) ?? all.find((x) => x.can) ?? all[0] ?? null;

  if (id === null) return <><PageTitle>Assessment</PageTitle><p role="alert"><strong>Not opened.</strong> {LINK_OUTCOME_WORDS.invalid}</p><p><Link href="/intelligence/assessments">Open the assessments instead</Link></p></>;
  if (err !== null) return <><PageTitle>Assessment</PageTitle><p><strong>Not opened.</strong> {LINK_OUTCOME_WORDS.unavailable}</p><ErrorNote error={err} /><p><Link href="/intelligence/assessments">Open the assessments instead</Link> (the nearest safe state).</p></>;
  if (o === null) return <Empty>reading the assessment…</Empty>;

  const version = Number(o['version']); const title = String(o['title'] ?? 'Assessment');
  const review = (o['review'] ?? null) as Row | null; const approval = (o['approval'] ?? null) as Row | null;
  const reading = lifecycleFromProfile(profile, String(o['state']));
  const authority = [
    review === null ? 'No review is recorded for this version\'s cycle.' : `Reviewed by ${String(review['reviewer'])} on version ${String(review['version'])} — a reading, not an approval.`,
    approval === null ? 'No approval is recorded (an approval is optional before the owner publishes).' : `Approved by ${String(approval['approver'])} on version ${String(approval['version'])}.`,
  ].join(' ');
  const input: ObjectHeaderInput = {
    type: 'ASM', id, title, version, versionCount: ((life?.['versions'] ?? []) as Row[]).length, latestVersion: version,
    owner: typeof o['owner'] === 'string' ? String(o['owner']) : null, ownerRole: 'accountable owner', serverState: String(o['state']),
    truth: typeof o['truth_state'] === 'string' ? String(o['truth_state']) : null, synthetic: o['synthetic'] === true, classification: typeof o['classification'] === 'string' ? String(o['classification']) : null,
    time: [{ label: 'Recorded', value: String(o['recorded_at']) }],
    trust: `the ${profile === null ? 'ASM' : `ASM v${profile.version}`} lifecycle profile — the ledger ${String(life?.['agreement'] ?? 'unknown').replace(/_/g, ' ')}`,
    authority, relationships: [{ label: 'its lifecycle — every version, every attempt, the replay', href: `/graph/lifecycle/ASM/${id}` }],
    provenance: [{ label: `${((o['evidence_refs'] ?? []) as unknown[]).length} evidence reference(s)`, href: null }], receipt, effective: { support: 'live_only', asOf: null },
  };
  const elig: Eligibility = act === null ? { can: false, reason: 'no transition is offered from this state', role: null, basis: 'not eligible' }
    : { can: act.can, reason: act.reason, role: act.actor, basis: act.can ? `the ${act.actor} of this transition (re-checked by the server)` : 'not eligible' };
  const phrase = typedPhrase({ digest: typeof o['content_digest'] === 'string' ? String(o['content_digest']) : null });
  const extra = act === null ? [] : [
    act.typed && typed.trim() !== phrase ? `type ${phrase} to confirm — this act is seen by every reader` : null,
    act.kind === 're_entry' && reentry === '' ? 'choose the re-entry reason' : null,
    act.kind === 're_entry' && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cause.trim()) ? 'name the event that caused the re-entry (its id)' : null,
    act.changes && newStatement.trim().length < 16 ? 'state the corrected assessment (16+ characters)' : null,
  ].filter((x): x is string => x !== null);
  const openProposals = ((life?.['proposals'] ?? []) as Row[]).filter((p) => p['decision'] === null);
  const isOwner = ownerId === me.principalId;

  const run = async (f: () => ReturnType<typeof lifecycle.transition>) => {
    setProblem(null); setAnswer(null);
    const r = await f();
    if (!r.ok || r.data === undefined) setProblem(r.error?.message ?? 'The act was not recorded. Re-read the assessment, then decide again.');
    else setAnswer(r.data.transition);
    setReason(''); setTyped(''); setNewStatement(''); setReentry(''); setCause('');
    await load();
  };

  return (
    <>
      <p className="eye-shell-meta"><Link href="/intelligence/assessments">← Assessments</Link></p>
      <ObjectHeader input={input}>
        <span className="eye-lifecycle" data-ls={reading.code ?? 'none'}><span className="eye-lifecycle-term">Profile reading</span> <span aria-hidden="true">{reading.glyph}</span> {reading.label}{reading.code === null ? null : ` (${reading.code})`}{reading.note === null ? null : <span className="eye-help"> ({reading.note})</span>}</span>
      </ObjectHeader>
      <h2>The assessment</h2>
      <p>{String(o['statement'] ?? '')}</p>

      <section aria-labelledby="acts-h">
        <h2 id="acts-h">Lifecycle acts</h2>
        {all.length === 0 ? <p className="eye-help">No transition is offered from {String(o['state'])}.</p> : (
          <ul className="eye-help" aria-label="The transitions from this state">
            {all.map((x) => <li key={x.action}>{x.label} → {x.kind === 'compensation' ? 'the prior state' : x.to}: {x.can ? 'available to you' : `not available — ${x.reason ?? ''}`}</li>)}
          </ul>
        )}
        {act === null ? null : (
          <CommandReview action="objects.lifecycle.transition" object={{ type: 'ASM', id, version, title, state: String(o['state']) }} digest={typeof o['content_digest'] === 'string' ? String(o['content_digest']) : null}
            eligibility={elig} consequence={consequenceOf(act, title, version)} extraReasons={extra}
            rationale={act.needsReason === null ? null : { value: reason, onChange: setReason, min: 8, label: `Your ${act.needsReason}` }}
            actionLabel={act.label} pendingLabel={act.pending} variant={act.typed ? 'critical' : 'primary'}
            onRun={() => run(() => lifecycle.transition(scope, 'ASM', id, { expectedVersion: version, action: act.action, idempotencyKey: commandKey(act.action), reason: reason.trim() === '' ? null : reason.trim(),
              reentryReason: act.kind === 're_entry' ? reentry : null, causationId: act.kind === 're_entry' ? cause.trim() : act.kind === 'compensation' ? facts.last?.transitionId ?? null : null,
              changes: act.changes ? { statement: newStatement.trim() } : {} }))}>
            <label htmlFor="lc-act">Transition (each is its own recorded act)</label>
            <select id="lc-act" style={inputStyle} value={act.action} onChange={(e) => { setActName(e.target.value); setTyped(''); }}>
              {all.map((x) => <option key={x.action} value={x.action}>{x.label}</option>)}
            </select>
            {act.kept === null ? null : <p className="eye-help">What is kept: {act.kept}.</p>}
            {act.kind === 're_entry' ? (
              <>
                <label htmlFor="lc-reentry">Re-entry reason</label>
                <select id="lc-reentry" style={inputStyle} value={reentry} onChange={(e) => setReentry(e.target.value)}>
                  <option value="">choose a reason</option>{act.reentryReasons.map((r) => <option key={r} value={r}>{REENTRY_REASONS_WEB[r] ?? r}</option>)}
                </select>
                <label htmlFor="lc-cause">The causing event (its id — a correction, an invalidation, a policy change)</label>
                <input id="lc-cause" style={inputStyle} value={cause} onChange={(e) => setCause(e.target.value)} autoComplete="off" />
              </>
            ) : null}
            {act.changes ? (<><label htmlFor="lc-new">The corrected assessment</label><textarea id="lc-new" style={inputStyle} rows={3} value={newStatement} onChange={(e) => setNewStatement(e.target.value)} /></>) : null}
            {act.typed ? <TypedConfirmation phrase={phrase} value={typed} onChange={setTyped} what={act.label.toLowerCase()} /> : null}
          </CommandReview>
        )}
        <TransitionOutcomeNote outcome={answer} problem={problem} />
      </section>

      {!isOwner && act !== null && !act.can && act.actor === 'owner' ? (
        <section aria-labelledby="propose-h">
          <h2 id="propose-h">A proposal to the owner</h2>
          <p className="eye-help">You may not take this act; you may propose it. A proposal is never authoritative: the owner accepts or declines it, with why.</p>
          <label htmlFor="lc-propose-why">Why you propose {act.label.toLowerCase()} (8+ characters)</label>
          <input id="lc-propose-why" style={inputStyle} value={proposeWhy} onChange={(e) => setProposeWhy(e.target.value)} />
          <CommandReview action="objects.lifecycle.propose" object={{ type: 'ASM', id, version, title, state: String(o['state']) }} digest={typeof o['content_digest'] === 'string' ? String(o['content_digest']) : null}
            eligibility={{ can: me.kind === 'human' || me.kind === 'agent', reason: null, role: null, basis: 'a proposal, decided by the owner' }} consequence={null}
            extraReasons={proposeWhy.trim().length < 8 ? ['say why (8+ characters)'] : []} actionLabel={`Propose: ${act.label.toLowerCase()}`} pendingLabel="Proposing…"
            onRun={async () => {
              setProblem(null);
              const r = await lifecycle.propose(scope, 'ASM', id, { requestId: crypto.randomUUID(), baseVersion: version, action: act.action, reason: proposeWhy.trim(), via: 'view' });
              if (!r.ok) setProblem(r.error?.message ?? 'The proposal was not recorded. Re-read the assessment, then try again.');
              setProposeWhy(''); await load();
            }} />
        </section>
      ) : null}

      {openProposals.length === 0 ? null : (
        <section aria-labelledby="proposals-h">
          <h2 id="proposals-h">Open proposals</h2>
          {openProposals.map((p) => (
            <div key={String(p['proposal_id'])} className="eye-authority-review">
              <p>{String(p['via'])} proposal by <bdi dir="ltr" className="eye-mono-wrap">{String(p['proposer_principal_id']).slice(0, 8)}…</bdi>: {String(p['action'])} on version {String(p['base_version'])} — {String(p['reason'])}</p>
              {!isOwner ? <p className="eye-help">Only the accountable owner decides a proposal.</p> : (
                <>
                  <label htmlFor={`lc-dec-${String(p['proposal_id'])}`}>Your decision&apos;s reason (8+ characters)</label>
                  <input id={`lc-dec-${String(p['proposal_id'])}`} style={inputStyle} value={decideWhy} onChange={(e) => setDecideWhy(e.target.value)} />
                  <CommandReview action="objects.lifecycle.proposal.decide" object={{ type: 'ASM', id, version, title, state: String(o['state']) }} digest={typeof o['content_digest'] === 'string' ? String(o['content_digest']) : null}
                    eligibility={{ can: true, reason: null, role: 'owner', basis: 'the accountable owner (re-checked by the server)' }} consequence={null}
                    extraReasons={[decideWhy.trim().length < 8 ? 'say why (8+ characters)' : null, Number(p['base_version']) !== version ? `the proposal read version ${String(p['base_version'])}; the assessment is at ${version} — decline it` : null].filter((x): x is string => x !== null)}
                    actionLabel="Accept the proposal" pendingLabel="Accepting…"
                    onRun={() => run(async () => {
                      const r = await lifecycle.decide(scope, 'ASM', id, String(p['proposal_id']), { requestId: crypto.randomUUID(), decision: 'accept', reason: decideWhy.trim(), expectedVersion: version, idempotencyKey: commandKey('decide') });
                      return { ...r, data: r.data === undefined ? undefined : { transition: (r.data.decision['transition'] ?? r.data.decision) as Row, receipt: r.data.receipt } };
                    })} />
                  <CommandReview action="objects.lifecycle.proposal.decide" object={{ type: 'ASM', id, version, title, state: String(o['state']) }} digest={typeof o['content_digest'] === 'string' ? String(o['content_digest']) : null}
                    eligibility={{ can: true, reason: null, role: 'owner', basis: 'the accountable owner (re-checked by the server)' }} consequence={null}
                    extraReasons={decideWhy.trim().length < 8 ? ['say why (8+ characters)'] : []} actionLabel="Decline the proposal" pendingLabel="Declining…"
                    onRun={async () => {
                      setProblem(null);
                      const r = await lifecycle.decide(scope, 'ASM', id, String(p['proposal_id']), { requestId: crypto.randomUUID(), decision: 'decline', reason: decideWhy.trim() });
                      if (!r.ok) setProblem(r.error?.message ?? 'The decision was not recorded. Re-read the proposal, then decide again.');
                      setDecideWhy(''); await load();
                    }} />
                </>
              )}
            </div>
          ))}
        </section>
      )}

      <h2>The record</h2>
      <LifecycleHistory type="ASM" id={id} profile={profile} versions={(life?.['versions'] ?? []) as Row[]} transitions={transitions} />
      <p className="eye-help">The replay at any instant and the domain&apos;s reconciliation are on <Link href={`/graph/lifecycle/ASM/${id}`}>the lifecycle page</Link>.</p>
    </>
  );
}
