'use client';
/**
 * Workspaces — COLLABORATION (CP-6 B34, migration 0090 §W4/§W5; F-P6-14; PR-46-001..005, CAP-EO-09, PER-22).
 *
 * A workspace serves one case (its subject) under one PURPOSE and a classification CEILING; its participants discuss, share artifacts and
 * review — participation is never room membership and never approver standing. Every request here is made under the workspace's purpose
 * (typed at the top): an external collaborator's grant is for that purpose and any other is refused.
 *
 * An EXTERNAL COLLABORATOR (a partner firm's person) is invited in TWO acts (B34-F1, migration 0091): the workspace's owner REQUESTS the
 * invitation — an audience ceiling at or below the workspace's, an expiry of at most 30 days — and an IDENTITY ADMINISTRATOR (a tenant or
 * platform administrator, never the requester) PROVISIONS it: the invitee's principal and its one-time credential are created by the
 * identity authority, and the invitation goes to the SYNTHETIC mailbox (no e-mail is sent). The grants are listed with their state and
 * time left; a lapsed or revoked grant has lost its access, and its holder's open tasks were reassigned (access lost). An external sees only
 * its own workspace and only what its audience ceiling covers. The review request carries a deadline and a named escalation principal:
 * when the deadline passes, the task escalates to them (the Tasks page shows the chain).
 */
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useShell } from '../layout';
import { collab as api, CLASSIFICATIONS, MAX_GRANT_DAYS, VERDICTS, deadlineWords, deliveryWords, grantWords, provisionable, taskMark, waitsOnWords, type Workspace, type WorkspaceDetail } from '../../../lib/workflow';
import { Empty, LiveStatus, Mono, cardStyle, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-2)' } as const;
const fs = { border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)', marginBlockEnd: 'var(--eye-space-12)' } as const;
const toIso = (v: string): string | null => { if (v.trim() === '') return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

export default function WorkspacesPage() {
  return <Suspense fallback={null}><Workspaces /></Suspense>;
}

function Workspaces() {
  const { scope, isExternal, externalGrant, me } = useShell();
  const params = useSearchParams();
  /* B36 (0094 §C1): an external's purpose is its grant's; `?workspace=` (the pickup's landing) opens that workspace */
  const [purpose, setPurpose] = useState(externalGrant?.purpose ?? 'collaboration.dual-sourcing-review');
  const wanted = params.get('workspace') ?? externalGrant?.workspace_id ?? null;
  const isIdentityAdmin = me.bindings.some((b) => b.roleCode === 'platform_admin' || b.roleCode === 'tenant_admin');
  const [mailbox, setMailbox] = useState<{ grant: string; subject: string; body: string } | null>(null);
  /* end B36 */
  const [list, setList] = useState<Workspace[] | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [d, setD] = useState<WorkspaceDetail | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  // the forms
  const [title, setTitle] = useState(''); const [subjectId, setSubjectId] = useState(''); const [ceiling, setCeiling] = useState('confidential');
  const [body, setBody] = useState(''); const [threadTitle, setThreadTitle] = useState(''); const [threadId, setThreadId] = useState('');
  const [aKey, setAKey] = useState(''); const [aTitle, setATitle] = useState(''); const [aClass, setAClass] = useState('internal'); const [aContent, setAContent] = useState('');
  const [reviewer, setReviewer] = useState(''); const [rTitle, setRTitle] = useState(''); const [deadline, setDeadline] = useState(''); const [escalateTo, setEscalateTo] = useState('');
  const [verdict, setVerdict] = useState('endorse'); const [statement, setStatement] = useState(''); const [taskId, setTaskId] = useState('');
  const [invName, setInvName] = useState(''); const [invContact, setInvContact] = useState(''); const [invCeiling, setInvCeiling] = useState('internal'); const [invDays, setInvDays] = useState('14');
  const [member, setMember] = useState(''); const [memberRole, setMemberRole] = useState('contributor');
  const [grantId, setGrantId] = useState(''); const [token, setToken] = useState(''); const [password, setPassword] = useState(''); const [revokeReason, setRevokeReason] = useState('');

  const done = (msg: string, rc: ReceiptT) => { setProblem(null); setStatus(msg); setReceipt(rc); void load(); if (sel !== null) void open(sel); };
  const load = async () => {
    const r = await api.list(scope, purpose);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the workspaces could not be read')); return; }
    setList(r.data.workspaces);
  };
  const open = async (id: string) => {
    setSel(id);
    const r = await api.get(scope, id, purpose);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the workspace could not be read')); setD(null); return; }
    setProblem(null); setD(r.data);
  };
  useEffect(() => { void load(); if (wanted !== null && sel === null) void open(wanted); }, [scope.tenantId, scope.domainId]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)' }}>Workspaces</h1>
      <p style={muted}>Participation is never room membership and never approver standing: a workspace discusses, shares and reviews; decisions are taken in the decision itself.</p>
      {/* B36 (0094 §C1): the external's surface says what bounds it */}
      {isExternal && externalGrant !== null && <p role="status" aria-label="your surface">You are an external collaborator: this workspace, under the purpose <strong>{externalGrant.purpose}</strong>, at or below audience <strong>{externalGrant.audience_ceiling}</strong>, until {String(externalGrant.expires_at ?? '').slice(0, 10)} — nothing beyond it.</p>}
      <label htmlFor="ws-purpose">Purpose (every request here is made under it)</label>
      <div style={{ display: 'flex', gap: 'var(--eye-space-8)' }}>
        <input id="ws-purpose" style={inputStyle} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        <button type="button" onClick={() => void load()}>Read</button>
      </div>
      {problem !== null && <p role="alert" style={{ color: 'var(--eye-color-critical)' }}>{problem}</p>}
      {status !== null && <LiveStatus>{status}</LiveStatus>}
      <Receipt receipt={receipt} />

      <h2 style={h2}>Your workspaces</h2>
      {list === null ? <p>Loading…</p> : list.length === 0 ? <Empty>No workspace is visible to you under this purpose.</Empty> : (
        <ul>{list.map((w) => <li key={w.workspace_id}><button type="button" aria-pressed={sel === w.workspace_id} onClick={() => void open(w.workspace_id)}>{w.title}</button>
          <span style={muted}> · {w.purpose} · ceiling {w.classification_ceiling} · {w.state}{w.grant !== undefined && w.grant !== null ? ` · your grant: ${grantWords(w.grant, new Date().toISOString())}` : ''}</span></li>)}</ul>
      )}

      {d !== null && (
        <section aria-label="The selected workspace" style={{ ...cardStyle, marginBlock: 'var(--eye-space-16)' }}>
          <h2 style={h2}>{d.workspace.title}</h2>
          <p>Subject <Mono>{String(d.workspace.subject['kind'])} {String(d.workspace.subject['id']).slice(0, 8)}…</Mono> · purpose {d.workspace.purpose} · ceiling {d.workspace.classification_ceiling}
            · you: {d.viewer.affiliation} (reading at {d.viewer.ceiling})</p>
          <h3>Participants</h3>
          <ul>{d.participants.map((p) => <li key={p.principal}><Mono>{p.principal.slice(0, 8)}…</Mono> · {p.role} · {p.affiliation}{p.removed_at !== null ? ` · removed (${p.removal_reason ?? ''})` : ''}</li>)}</ul>
          <h3>Grants</h3>
          {d.grants.length === 0 ? <Empty>No external collaborator.</Empty> : <ul>{d.grants.map((g) => <li key={g.grant_id}><Mono>{g.grant_id.slice(0, 8)}…</Mono> · {g.display_name !== null && g.display_name !== undefined ? `${g.display_name} · ` : ''}{g.contact_label} · audience {g.audience_ceiling} · {grantWords(g, d.now)} · expires {fmtInstant(g.expires_at)}
            {provisionable(g) && <GovernedButton label="Provision (identity administrator)" pendingLabel="provisioning" variant="quiet" onRun={async () => {
              const r = await api.provision(scope, g.grant_id, purpose);
              if (!r.ok) { setProblem(refusal(r, 'the provisioning was refused — an identity administrator (tenant or platform administrator) other than the requester provisions it')); return; }
              done(`provisioned — the invitee ${String(r.data?.grant['login_name'] ?? '')} was created by the identity authority; the invitation with its one-time pickup code is in the SYNTHETIC mailbox`, r.data?.receipt ?? null);
            }} />}
            {/* B36 (0094 §C3): the delivery's state (never the code); the provisioner re-drives a failed delivery; an identity administrator reads the SYNTHETIC mailbox */}
            {!isExternal && g.state !== 'requested' && <span aria-label={`delivery of ${g.grant_id}`}> · delivery: {deliveryWords(g.delivery, d.now)}</span>}
            {!isExternal && g.state === 'invited' && (g.delivery === null || g.delivery === undefined) && <GovernedButton label="Deliver again" pendingLabel="delivering" variant="quiet" onRun={async () => {
              const r = await api.deliver(scope, g.grant_id, purpose);
              if (!r.ok) { setProblem(refusal(r, 'the delivery was refused')); return; } done('delivered to the SYNTHETIC mailbox', null);
            }} />}
            {isIdentityAdmin && g.state === 'invited' && g.delivery !== null && g.delivery !== undefined && <GovernedButton label="Read the synthetic mailbox" pendingLabel="reading" variant="quiet" onRun={async () => {
              const r = await api.mailbox(scope, g.grant_id, purpose);
              if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the mailbox read was refused')); return; }
              setMailbox(r.data.message === null ? { grant: g.grant_id, subject: '(the message is not held by this process)', body: r.data.note } : { grant: g.grant_id, subject: r.data.message.subject, body: r.data.message.body });
            }} />}
            </li>)}</ul>}
          {mailbox !== null && <section aria-label="synthetic mailbox message" style={{ ...cardStyle, marginBlock: 'var(--eye-space-8)' }}><h4>SYNTHETIC mailbox — {mailbox.subject}</h4><pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--eye-font-mono)', fontSize: 'var(--eye-type-label-sm)' }}>{mailbox.body}</pre>
            <p style={muted}>The invitee opens <Mono>/login?invitation={mailbox.grant}</Mono> and enters the code; the material is answered once.</p></section>}
          {d.invitation_mail.length > 0 && <p style={muted}>Invitations placed in the SYNTHETIC mailbox: {d.invitation_mail.map((m) => m.subject).join('; ')} — {d.invitation_mail[0]?.note}</p>}
          <h3>Tasks</h3>
          {d.tasks.length === 0 ? <Empty>No task.</Empty> : <ul>{d.tasks.map((t) => <li key={t.task_id}>{t.title} · {taskMark(t.state, t.escalation_level).text} · {deadlineWords(t.deadline_at, d.now)} · <Mono>{t.task_id.slice(0, 8)}…</Mono>{t.waits_on !== undefined && t.waits_on.length > 0 ? <span> · {waitsOnWords(t.waits_on)}</span> : null}</li>)}</ul>}
          <h3>Discussion</h3>
          {d.threads.length === 0 ? <Empty>No thread.</Empty> : d.threads.map((t) => (
            <div key={t.thread_id}><h4>{t.title} <span style={muted}><Mono>{t.thread_id.slice(0, 8)}…</Mono></span></h4>
              <ul>{t.messages.map((m) => <li key={m.message_id}><Mono>{m.author.slice(0, 8)}…</Mono> ({m.affiliation}) {fmtInstant(m.posted_at)}: {m.body}</li>)}</ul></div>))}
          <h3>Artifacts</h3>
          {d.artifacts.length === 0 ? <Empty>No artifact you may read.</Empty> : <ul>{d.artifacts.map((a) => <li key={a.artifact_id}><strong>{a.title}</strong> v{a.version} · {a.classification}{a.withheld !== null ? ` · withheld: ${a.withheld}` : ` — ${a.content ?? JSON.stringify(a.object_ref)}`}</li>)}</ul>}
          <h3>Reviews</h3>
          {d.reviews.length === 0 ? <Empty>No review.</Empty> : <ul>{d.reviews.map((r) => <li key={r.review_id}><strong>{r.verdict}</strong> by <Mono>{r.reviewer.slice(0, 8)}…</Mono> ({r.affiliation}): {r.statement}</li>)}</ul>}

          <fieldset style={fs}><legend>Post a message</legend>
            <label htmlFor="m-thread">Thread id (empty: a new thread)</label><input id="m-thread" style={inputStyle} value={threadId} onChange={(e) => setThreadId(e.target.value)} />
            <label htmlFor="m-title">New thread's title</label><input id="m-title" style={inputStyle} value={threadTitle} onChange={(e) => setThreadTitle(e.target.value)} />
            <label htmlFor="m-body">Message</label><textarea id="m-body" style={textareaStyle} rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
            <GovernedButton label="Post" pendingLabel="posting" onRun={async () => {
              const r = await api.post(scope, d.workspace.workspace_id, purpose, body, threadId.trim() === '' ? null : threadId.trim(), threadTitle);
              if (!r.ok) { setProblem(refusal(r, 'the message was refused')); return; } setBody(''); done('posted', r.data?.receipt ?? null);
            }} /></fieldset>
          <fieldset style={fs}><legend>Add an artifact (at or below your ceiling)</legend>
            <label htmlFor="a-key">Key</label><input id="a-key" style={inputStyle} value={aKey} onChange={(e) => setAKey(e.target.value)} />
            <label htmlFor="a-title">Title</label><input id="a-title" style={inputStyle} value={aTitle} onChange={(e) => setATitle(e.target.value)} />
            <label htmlFor="a-class">Classification</label>
            <select id="a-class" style={inputStyle} value={aClass} onChange={(e) => setAClass(e.target.value)}>{CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
            <label htmlFor="a-content">Content</label><textarea id="a-content" style={textareaStyle} rows={3} value={aContent} onChange={(e) => setAContent(e.target.value)} />
            <GovernedButton label="Add" pendingLabel="adding" variant="quiet" onRun={async () => {
              const r = await api.artifact(scope, d.workspace.workspace_id, purpose, { key: aKey, title: aTitle, classification: aClass, content: aContent });
              if (!r.ok) { setProblem(refusal(r, 'the artifact was refused')); return; } done('artifact added', r.data?.receipt ?? null);
            }} /></fieldset>
          <fieldset style={fs}><legend>Record a review</legend>
            <label htmlFor="rv-task">Review task id (optional — completes it when you hold it)</label><input id="rv-task" style={inputStyle} value={taskId} onChange={(e) => setTaskId(e.target.value)} />
            <label htmlFor="rv-verdict">Verdict</label>
            <select id="rv-verdict" style={inputStyle} value={verdict} onChange={(e) => setVerdict(e.target.value)}>{VERDICTS.map((v) => <option key={v} value={v}>{v}</option>)}</select>
            <label htmlFor="rv-st">Statement</label><textarea id="rv-st" style={textareaStyle} rows={3} value={statement} onChange={(e) => setStatement(e.target.value)} />
            <GovernedButton label="Record the review" pendingLabel="recording" onRun={async () => {
              const r = await api.review(scope, d.workspace.workspace_id, purpose, { taskId: taskId.trim() === '' ? null : taskId.trim(), verdict, statement });
              if (!r.ok) { setProblem(refusal(r, 'the review was refused')); return; } done('review recorded', r.data?.receipt ?? null);
            }} /></fieldset>
          {d.viewer.affiliation === 'member' && (<>
            <fieldset style={fs}><legend>Request a review (a deadline; a named escalation principal)</legend>
              <label htmlFor="rq-rev">Reviewer (a participant)</label><input id="rq-rev" style={inputStyle} value={reviewer} onChange={(e) => setReviewer(e.target.value)} />
              <label htmlFor="rq-title">Title</label><input id="rq-title" style={inputStyle} value={rTitle} onChange={(e) => setRTitle(e.target.value)} />
              <label htmlFor="rq-dl">Deadline</label><input id="rq-dl" type="datetime-local" style={inputStyle} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
              <label htmlFor="rq-esc">Escalate to (a member)</label><input id="rq-esc" style={inputStyle} value={escalateTo} onChange={(e) => setEscalateTo(e.target.value)} />
              <GovernedButton label="Request" pendingLabel="requesting" onRun={async () => {
                const r = await api.requestReview(scope, d.workspace.workspace_id, purpose, { reviewer, title: rTitle, deadlineAt: toIso(deadline), escalateTo, requestKey: `web-${Date.now()}` });
                if (!r.ok) { setProblem(refusal(r, 'the review request was refused')); return; } done('review requested', r.data?.receipt ?? null);
              }} /></fieldset>
            <fieldset style={fs}><legend>Add a member participant (the owner's act)</legend>
              <label htmlFor="pm">Member (principal id)</label><input id="pm" style={inputStyle} value={member} onChange={(e) => setMember(e.target.value)} />
              <label htmlFor="pr">Role</label><select id="pr" style={inputStyle} value={memberRole} onChange={(e) => setMemberRole(e.target.value)}>{['contributor', 'reviewer', 'observer'].map((x) => <option key={x} value={x}>{x}</option>)}</select>
              <GovernedButton label="Add" pendingLabel="adding" variant="quiet" onRun={async () => {
                const r = await api.participant(scope, d.workspace.workspace_id, purpose, member, memberRole, 'add');
                if (!r.ok) { setProblem(refusal(r, 'the participant was refused')); return; } done('participant added', r.data?.receipt ?? null);
              }} /></fieldset>
            <fieldset style={fs}><legend>Request an invitation for an external collaborator (at most {MAX_GRANT_DAYS} days; an identity administrator provisions it)</legend>
              <label htmlFor="iv-name">Name</label><input id="iv-name" style={inputStyle} value={invName} onChange={(e) => setInvName(e.target.value)} />
              <label htmlFor="iv-contact">Contact label (SYNTHETIC — nothing is sent)</label><input id="iv-contact" style={inputStyle} value={invContact} onChange={(e) => setInvContact(e.target.value)} />
              <label htmlFor="iv-ceiling">Audience ceiling</label>
              <select id="iv-ceiling" style={inputStyle} value={invCeiling} onChange={(e) => setInvCeiling(e.target.value)}>{CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
              <label htmlFor="iv-days">Expires after (days)</label><input id="iv-days" type="number" min={1} max={MAX_GRANT_DAYS} style={inputStyle} value={invDays} onChange={(e) => setInvDays(e.target.value)} />
              <GovernedButton label="Request" pendingLabel="requesting" onRun={async () => {
                const r = await api.request(scope, d.workspace.workspace_id, purpose, { displayName: invName, contactLabel: invContact, ceiling: invCeiling, days: Number(invDays) });
                if (!r.ok) { setProblem(refusal(r, 'the invitation request was refused')); return; }
                done(`requested — an identity administrator provisions it; the grant expires ${fmtInstant(r.data?.grant['expires_at'])}`, r.data?.receipt ?? null);
              }} /></fieldset>
            <fieldset style={fs}><legend>Revoke a grant</legend>
              <label htmlFor="rv-g">Grant id</label><input id="rv-g" style={inputStyle} value={grantId} onChange={(e) => setGrantId(e.target.value)} />
              <label htmlFor="rv-r">Reason</label><input id="rv-r" style={inputStyle} value={revokeReason} onChange={(e) => setRevokeReason(e.target.value)} />
              <GovernedButton label="Revoke" pendingLabel="revoking" variant="critical" onRun={async () => {
                const r = await api.revoke(scope, grantId.trim(), purpose, revokeReason);
                if (!r.ok) { setProblem(refusal(r, 'the revocation was refused')); return; } done('revoked — the collaborator\'s open tasks were reassigned; its credentials and sessions revoked by the identity authority', r.data?.receipt ?? null);
              }} /></fieldset>
          </>)}
        </section>
      )}

      <h2 style={h2}>Open a workspace</h2>
      <fieldset style={fs}><legend>A new workspace</legend>
        <label htmlFor="ow-title">Title</label><input id="ow-title" style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
        <label htmlFor="ow-subject">The decision package it serves (id)</label><input id="ow-subject" style={inputStyle} value={subjectId} onChange={(e) => setSubjectId(e.target.value)} />
        <label htmlFor="ow-ceiling">Classification ceiling</label>
        <select id="ow-ceiling" style={inputStyle} value={ceiling} onChange={(e) => setCeiling(e.target.value)}>{CLASSIFICATIONS.map((c) => <option key={c} value={c}>{c}</option>)}</select>
        <GovernedButton label="Open" pendingLabel="opening" onRun={async () => {
          const r = await api.open(scope, { title, subject: { kind: 'decision_package', id: subjectId.trim() }, purpose, ceiling });
          if (!r.ok) { setProblem(refusal(r, 'the workspace was refused')); return; } done('workspace opened', r.data?.receipt ?? null);
        }} /></fieldset>

      <h2 style={h2}>Accept an invitation (the invitee, signed in with the invitation token)</h2>
      <fieldset style={fs}><legend>Accept</legend>
        <label htmlFor="ac-g">Grant id</label><input id="ac-g" style={inputStyle} value={grantId} onChange={(e) => setGrantId(e.target.value)} />
        <label htmlFor="ac-t">Invitation token</label><input id="ac-t" style={inputStyle} value={token} onChange={(e) => setToken(e.target.value)} />
        <label htmlFor="ac-p">Your new password (12+ characters; it expires with the grant)</label><input id="ac-p" type="password" style={inputStyle} value={password} onChange={(e) => setPassword(e.target.value)} />
        <GovernedButton label="Accept" pendingLabel="accepting" onRun={async () => {
          const r = await api.accept(scope, grantId.trim(), purpose, token.trim(), password);
          if (!r.ok) { setProblem(refusal(r, 'the acceptance was refused')); return; } setToken(''); setPassword(''); done('accepted — sign in again with your password', r.data?.receipt ?? null);
        }} /></fieldset>
    </div>
  );
}
