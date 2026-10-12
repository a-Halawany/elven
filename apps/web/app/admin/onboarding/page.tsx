'use client';
/**
 * THE CUSTOMER ONBOARDING WORKSPACE — CP-6 B94 §ON (0114_b94_x_on; CAP-DL-04 / CAP-PD-04, CAP-DL-05 / CAP-PD-05, UX-66-001/-002, JRN-01,
 * PR-67-001/-002, PER-21). In the order UX-66-001 sets: STATUS FIRST (the programme's state and held reasons, the step graph with each
 * step's state, realizing record and compensation), then the SPONSOR INTENT, then the TARGET DOMAIN (draft until §MG's cutover activates it)
 * with its CONFIGURATION BASELINES, DRIFT and ROLLBACK PLAN; the versions and the ledger last. Every object shows its version, digest,
 * effective time and the freshness of the read; every act answers with its receipt; a refusal is shown in the server's words.
 *
 * The page never approves on inference: the approval control states who may approve (the onboarding authority — never the proposer, never
 * an implementation lead, never an agent), the EXACT digest it approves and the consequence; proposals are styled as proposals. Every
 * record here in the demonstration is SYNTHETIC; an approval by a synthetic persona demonstrates the software (real acceptance is R2).
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { getSession } from '../../../lib/api';
import {
  onboarding, programmeMark, stepMark, baselineMark, driftMark, short, freshness, changeLine, pointerSummary, decisionEligibility, consequencePreview, stepMoves, latestOnly,
  type Programme, type ProgrammeDetail, type Receipt as Rcpt, type Step, type Baseline,
} from '../../../lib/delivery-on-b94';
import { ErrorNote, Panel, Receipt, Td, Th, inputStyle, tableStyle } from '../../../components/ui';
import { GovernedButton, Mono, fmtInstant } from '../../../components/observation';

type Err = { code: string; message: string; correlationId: string } | null;
type Res = { ok: boolean; data?: unknown; error?: { code: string; message: string; correlationId: string } };

function Badge({ m }: { m: { glyph: string; token: string; text: string } }) {
  return <strong style={{ color: `var(${m.token})` }}><span aria-hidden="true">{m.glyph}</span> {m.text}</strong>;
}
function Meta({ version, digest, at, label = 'effective' }: { version: number; digest: string; at: string | null | undefined; label?: string }) {
  return <span style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}> v{version} · digest <Mono title={digest}>{short(digest)}</Mono> · {label} {fmtInstant(at)}</span>;
}

export default function OnboardingPage() {
  const session = getSession();
  const tenantId = session?.scope?.tenantId ?? '';
  const me = { principalId: session?.principalId ?? '', bindings: session?.bindings ?? [] };
  const holds = (role: string) => me.bindings.some((b) => b.roleCode === role && b.tenantId === tenantId);
  const [programmes, setProgrammes] = useState<Programme[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [detail, setDetail] = useState<ProgrammeDetail | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt | null>(null);
  const [now, setNow] = useState(Date.now());
  const guard = useRef(latestOnly());
  // forms
  const [reason, setReason] = useState('');
  const [key, setKey] = useState(''); const [title, setTitle] = useState('');
  const [domainName, setDomainName] = useState('');
  const [objectives, setObjectives] = useState(''); const [scopeText, setScopeText] = useState(''); const [measures, setMeasures] = useState(''); const [constraints, setConstraints] = useState('');
  const [targetName, setTargetName] = useState('');
  const [stepKey, setStepKey] = useState('intent');
  const [decisionDigest, setDecisionDigest] = useState('');

  useEffect(() => { const i = setInterval(() => setNow(Date.now()), 5000); return () => clearInterval(i); }, []);
  const loadList = useCallback(async () => {
    if (tenantId === '') return;
    const r = await onboarding.list(tenantId);
    if (r.ok && r.data !== undefined) setProgrammes(r.data.programmes); else setError(r.error ?? null);
  }, [tenantId]);
  const loadDetail = useCallback(async (id: string) => {
    if (tenantId === '' || id === '') { setDetail(null); return; }
    const n = guard.current.next();
    const r = await onboarding.read(tenantId, id);
    if (!guard.current.current(n)) return;            // a newer selection answered first — this response is stale
    if (r.ok && r.data !== undefined) setDetail(r.data); else { setDetail(null); setError(r.error ?? null); }
  }, [tenantId]);
  useEffect(() => { void loadList(); }, [loadList]);
  useEffect(() => { void loadDetail(selected); }, [selected, loadDetail]);

  const after = async (r: Res) => {
    if (r.ok && r.data !== undefined) { setReceipt((r.data as { receipt: Rcpt }).receipt); setError(null); setReason(''); await loadList(); await loadDetail(selected); }
    else { setError(r.error ?? null); throw new Error(r.error?.message ?? 'refused'); }
  };
  const p = detail?.programme ?? null;
  const approved = useMemo(() => detail?.baselines.find((b) => b.state === 'approved') ?? null, [detail]);
  const open = useMemo(() => detail?.baselines.find((b) => b.state === 'draft' || b.state === 'proposed') ?? null, [detail]);
  const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter((x) => x.length > 0);
  const okReason = reason.trim().length >= 8;

  if (tenantId === '') return <p>This workspace is the tenant&apos;s: sign in with a tenant or domain session.</p>;
  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Customer onboarding</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' }}>
        Tenant <Mono>{tenantId}</Mono> · your roles: {me.bindings.filter((b) => b.tenantId === tenantId).map((b) => `${b.roleCode} (${b.scope})`).join(', ') || 'none'}. The customer&apos;s authority approves;
        the implementation lead coordinates and never approves; automation acts only inside the approved plan. An approval here by a SYNTHETIC persona demonstrates the software — real customer acceptance is R2.
      </p>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />

      <Panel title="Programmes">
        <label>Programme{' '}
          <select style={inputStyle} value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="programme">
            <option value="">choose a programme</option>
            {programmes.map((x) => <option key={x.programme_id} value={x.programme_id}>{x.programme_key} — {programmeMark(x.state).text} (v{x.version})</option>)}
          </select>
        </label>
        {holds('implementation_lead') || holds('tenant_admin') ? (
          <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', alignItems: 'end', marginBlockStart: 'var(--eye-space-8)' }}>
            <label>Key<input style={inputStyle} value={key} onChange={(e) => setKey(e.target.value)} placeholder="nordwerk-polska" /></label>
            <label>Title<input style={{ ...inputStyle, minInlineSize: '20rem' }} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
            <GovernedButton label="Open a programme" pendingLabel="opening" disabled={key.trim().length < 3 || title.trim().length < 4}
              onRun={async () => { const r = await onboarding.open(tenantId, { key: key.trim(), title: title.trim() }); await after(r); if (r.ok && r.data) setSelected(r.data.programme.programme_id); }} />
          </div>
        ) : <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>Opening a programme is the implementation lead&apos;s or the tenant administrator&apos;s act.</p>}
      </Panel>

      {p === null || detail === null ? (selected === '' ? null : <p>Loading the programme…</p>) : (
        <>
          {/* ───── STATUS FIRST (UX-66-001) ───── */}
          <Panel title="Status">
            <p><Badge m={programmeMark(p.state)} /> <strong>{p.title}</strong><Meta version={p.version} digest={p.digest} at={p.effective_from} /> · {freshness(detail.read_at, now)}</p>
            {p.state === 'held' ? (
              <div role="alert" style={{ border: '1px solid var(--eye-color-warning)', padding: 'var(--eye-space-8)' }}>
                <strong>HELD — no step is recorded until it resumes.</strong>
                <ul>{p.held_reasons.map((h, i) => <li key={i}>{h.reason} — {h.held_by_roles.join(', ') || 'held'} at {fmtInstant(h.held_at)}</li>)}</ul>
                {p.held_reasons.some((h) => h.held_by_roles.includes('customer_sponsor') || h.held_by_roles.includes('onboarding_authority'))
                  ? <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>A hold placed by the customer&apos;s sponsor or authority is released only by them.</p> : null}
              </div>
            ) : null}
            {p.state === 'planned' && detail.intent === null ? <p role="status">The programme leaves PLANNED only after the customer sponsor records the intent (JRN-01).</p> : null}
            <label>Reason (8+ characters)<input style={{ ...inputStyle, minInlineSize: '24rem' }} value={reason} onChange={(e) => setReason(e.target.value)} /></label>{' '}
            <GovernedButton label="Hold" pendingLabel="holding" variant="quiet" disabled={!okReason || p.state === 'withdrawn' || p.state === 'accepted'}
              onRun={async () => after(await onboarding.transition(tenantId, p.programme_id, 'hold', { expectedVersion: p.version, reason: reason.trim() }))} />{' '}
            <GovernedButton label="Resume" pendingLabel="resuming" variant="quiet" disabled={!okReason || p.state !== 'held'}
              onRun={async () => after(await onboarding.transition(tenantId, p.programme_id, 'resume', { expectedVersion: p.version, reason: reason.trim() }))} />{' '}
            <GovernedButton label="Withdraw (sponsor or tenant admin)" pendingLabel="withdrawing" variant="critical"
              disabled={!okReason || !(holds('customer_sponsor') || holds('tenant_admin')) || p.state === 'withdrawn' || p.state === 'accepted'}
              onRun={async () => after(await onboarding.transition(tenantId, p.programme_id, 'withdraw', { expectedVersion: p.version, reason: reason.trim() }))} />
          </Panel>

          <Panel title="Steps (JRN-01 → JRN-23)">
            <table style={tableStyle} aria-label="step graph">
              <thead><tr><Th>#</Th><Th>Step</Th><Th>State</Th><Th>Realized by</Th><Th>Compensation (reverses it)</Th><Th>Version · digest</Th><Th>Next</Th></tr></thead>
              <tbody>{detail.steps.map((s: Step) => (
                <tr key={s.step_id}>
                  <Td>{s.ordinal}</Td><Td>{s.step_key}</Td>
                  <Td><Badge m={stepMark(s.state)} />{s.held_reason !== null ? <div>{s.held_reason}</div> : null}</Td>
                  <Td>{s.realized_by === null ? '—' : <>{String(s.realized_by['kind'])} <Mono>{String(s.realized_by['label'] ?? s.realized_by['id'])}</Mono> by <Mono>{String(s.realized_by['action'])}</Mono></>}
                    {s.reverted_by !== null ? <div>reverted by <Mono>{String(s.reverted_by['action'])}</Mono> ({String(s.reverted_by['label'] ?? '')})</div> : null}</Td>
                  <Td>{s.compensation === null ? <em>not named — required before done</em> : <><Mono>{s.compensation.action}</Mono>: {s.compensation.description}</>}</Td>
                  <Td><Mono title={s.digest}>v{s.version} {short(s.digest)}</Mono></Td>
                  <Td>{stepMoves(s.state, p.state).map((m) => <div key={m.to} style={{ color: m.allowed ? 'inherit' : 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>{m.to}{m.allowed ? '' : ` — ${m.reason}`}</div>)}</Td>
                </tr>))}</tbody>
            </table>
            {holds('implementation_lead') || holds('tenant_admin') ? (
              <div style={{ display: 'flex', gap: 'var(--eye-space-8)', alignItems: 'end', marginBlockStart: 'var(--eye-space-8)' }}>
                <label>Plan a step<select style={inputStyle} value={stepKey} onChange={(e) => setStepKey(e.target.value)}>
                  {Object.keys(detail.step_defaults).filter((k) => !detail.steps.some((s) => s.step_key === k)).map((k) => <option key={k} value={k}>{k}</option>)}
                </select></label>
                <GovernedButton label="Plan (with its default compensation)" pendingLabel="planning" variant="quiet" disabled={p.state === 'withdrawn' || p.state === 'accepted'}
                  onRun={async () => after(await onboarding.planStep(tenantId, p.programme_id, { stepKey, compensation: detail.step_defaults[stepKey]?.compensation }))} />
              </div>
            ) : null}
          </Panel>

          <Panel title="Sponsor intent (the customer sponsor's own record)">
            {detail.intent === null ? <p>No intent recorded yet.</p> : (
              <>
                <p>By {detail.intent.sponsor_name ?? <Mono>{detail.intent.sponsor_principal_id}</Mono>}<Meta version={detail.intent.version} digest={detail.intent.digest} at={detail.intent.recorded_at} label="recorded" /></p>
                <p><strong>Objectives:</strong> {detail.intent.objectives.join(' · ')}</p>
                <p><strong>Scope:</strong> {detail.intent.scope_statement}</p>
                <p><strong>Success measures:</strong> {detail.intent.success_measures.join(' · ')}</p>
                <p><strong>Constraints:</strong> {detail.intent.constraints.join(' · ') || 'none stated'} · target domain «{detail.intent.target_domain_name}» · profile {detail.intent.deployment_profile}</p>
              </>
            )}
            {holds('customer_sponsor') && !holds('implementation_lead') ? (
              <div style={{ display: 'grid', gap: 'var(--eye-space-8)', maxInlineSize: '40rem' }}>
                <label>Objectives (one per line)<textarea style={inputStyle} value={objectives} onChange={(e) => setObjectives(e.target.value)} /></label>
                <label>Scope statement<textarea style={inputStyle} value={scopeText} onChange={(e) => setScopeText(e.target.value)} /></label>
                <label>Success measures (one per line)<textarea style={inputStyle} value={measures} onChange={(e) => setMeasures(e.target.value)} /></label>
                <label>Constraints (one per line)<textarea style={inputStyle} value={constraints} onChange={(e) => setConstraints(e.target.value)} /></label>
                <label>Target domain name<input style={inputStyle} value={targetName} onChange={(e) => setTargetName(e.target.value)} /></label>
                <GovernedButton label={detail.intent === null ? 'Record the intent' : `Record intent v${detail.intent.version + 1}`} pendingLabel="recording"
                  disabled={lines(objectives).length === 0 || scopeText.trim().length < 16 || lines(measures).length === 0 || targetName.trim().length < 2}
                  onRun={async () => after(await onboarding.intent(tenantId, p.programme_id, { expectedVersion: detail.intent?.version ?? 0, objectives: lines(objectives), scopeStatement: scopeText.trim(),
                    successMeasures: lines(measures), constraints: lines(constraints), targetDomainName: targetName.trim(), deploymentProfile: p.deployment_profile }))} />
              </div>
            ) : <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>The intent is recorded by the customer sponsor only (never an implementation lead, never an agent).</p>}
          </Panel>

          <Panel title="Target domain and configuration baselines">
            {detail.domain === null ? (
              <>
                <p>No target domain yet. The tenant administrator drafts it through this programme; it stays DRAFT until the cutover activates it.</p>
                {holds('tenant_admin') ? (
                  <div style={{ display: 'flex', gap: 'var(--eye-space-8)', alignItems: 'end' }}>
                    <label>Domain name<input style={{ ...inputStyle, minInlineSize: '20rem' }} value={domainName} onChange={(e) => setDomainName(e.target.value)} /></label>
                    <GovernedButton label="Draft the domain" pendingLabel="drafting" disabled={domainName.trim().length < 2} onRun={async () => after(await onboarding.draftDomain(tenantId, p.programme_id, domainName.trim()))} />
                  </div>
                ) : null}
              </>
            ) : (
              <>
                <p>Domain «{String(detail.domain['name'] ?? detail.domain.id)}» — <strong>{String(detail.domain['status'] ?? '?').toUpperCase()}</strong>{detail.domain['status'] === 'draft' ? ' (not active: §MG\'s cutover activates it)' : ''} · <Mono>{detail.domain.id}</Mono></p>
                <p><Badge m={driftMark(detail.drift)} />{detail.drift?.observed_digest ? <> · observed <Mono title={detail.drift.observed_digest}>{short(detail.drift.observed_digest)}</Mono></> : null}</p>
                {detail.drift !== null && detail.drift.changes.length > 0 ? (
                  <>
                    <ul aria-label="drift">{detail.drift.changes.map((c, i) => <li key={i}>{changeLine(c)}</li>)}</ul>
                    <p><strong>Rollback plan</strong> (the governed acts that restore each pointer — none is performed by this page):</p>
                    <ol>{detail.rollback_plan.map((r, i) => <li key={i}><Mono>{r.action}</Mono> by {r.role}: {r.restores}{r.gap !== null ? <em> — gap: {r.gap}</em> : null}</li>)}</ol>
                  </>
                ) : null}
                <table style={tableStyle} aria-label="baselines">
                  <thead><tr><Th>Version</Th><Th>State</Th><Th>Pointers</Th><Th>Proposed / decided</Th><Th>Signature</Th></tr></thead>
                  <tbody>{detail.baselines.map((b: Baseline) => (
                    <tr key={b.version} style={{ borderInlineStart: b.state === 'approved' ? '3px solid var(--eye-color-success)' : '3px dashed var(--eye-color-border-strong)' }}>
                      <Td><Mono title={b.digest}>v{b.version} {short(b.digest)}</Mono><div style={{ fontSize: 'var(--eye-type-label-sm)' }}>{b.basis}{b.promoted_from !== null ? ` from v${b.promoted_from}` : ''} · captured {fmtInstant(b.captured_at)}</div></Td>
                      <Td><Badge m={baselineMark(b.state)} />{b.effective_from !== null ? <div>effective {fmtInstant(b.effective_from)}</div> : null}</Td>
                      <Td><ul style={{ margin: 0, paddingInlineStart: '1rem' }}>{pointerSummary(b.pointers).map((x) => <li key={x}>{x}</li>)}</ul></Td>
                      <Td>{b.proposed_by_name ?? b.proposed_by ?? '—'} {b.proposed_at !== null ? `at ${fmtInstant(b.proposed_at)}` : ''}<div>{b.decided_by !== null ? `${b.decided_by_name ?? b.decided_by}: ${b.decision_reason ?? ''}` : ''}</div></Td>
                      <Td>{b.signatures.length === 0 ? '—' : b.signatures.map((s) => <div key={s.signature_id}><Mono>{s.algorithm} {s.key_id}</Mono> at {fmtInstant(s.signed_at)}</div>)}</Td>
                    </tr>))}</tbody>
                </table>
                {holds('implementation_lead') ? (
                  <div style={{ display: 'flex', gap: 'var(--eye-space-8)', marginBlock: 'var(--eye-space-8)' }}>
                    <GovernedButton label="Capture v1 from the observed configuration" pendingLabel="capturing" variant="quiet" disabled={detail.baselines.length > 0}
                      onRun={async () => after(await onboarding.capture(tenantId, detail.domain!.id, p.programme_id))} />
                    <GovernedButton label="Promote the observed state (next version)" pendingLabel="promoting" variant="quiet" disabled={approved === null || open !== null || detail.drift?.state !== 'drifted'}
                      onRun={async () => after(await onboarding.promote(tenantId, detail.domain!.id))} />
                    {open !== null && open.state === 'draft' ? <GovernedButton label={`Propose v${open.version} at ${short(open.digest)}`} pendingLabel="proposing" variant="quiet"
                      onRun={async () => after(await onboarding.propose(tenantId, detail.domain!.id, open.baseline_id, open.version, open.digest))} /> : null}
                  </div>
                ) : null}
                {open !== null && open.state === 'proposed' ? (() => {
                  const el = decisionEligibility(open, me, tenantId);
                  return (
                    <div style={{ border: '1px dashed var(--eye-color-warning)', padding: 'var(--eye-space-8)' }} aria-label="baseline decision">
                      <p><strong>Decision on PROPOSED v{open.version}</strong> — the exact digest: <Mono>{open.digest}</Mono></p>
                      <p>Eligibility: {el.eligible ? 'you may decide (a named human holding onboarding_authority, not the proposer, not a lead).' : el.reasons.join('; ')}</p>
                      <ul aria-label="consequence">{consequencePreview(open, approved, detail.drift?.changes ?? []).map((x) => <li key={x}>{x}</li>)}</ul>
                      <label>Type the digest you read to confirm<input style={{ ...inputStyle, minInlineSize: '36rem' }} value={decisionDigest} onChange={(e) => setDecisionDigest(e.target.value)} /></label>{' '}
                      <GovernedButton label="Approve and sign" pendingLabel="approving" disabled={!el.eligible || !okReason || decisionDigest.trim() !== open.digest}
                        onRun={async () => after(await onboarding.decide(tenantId, detail.domain!.id, open.baseline_id, open.version, { decision: 'approve', digest: decisionDigest.trim(), reason: reason.trim() }))} />{' '}
                      <GovernedButton label="Reject" pendingLabel="rejecting" variant="critical" disabled={!el.eligible || !okReason}
                        onRun={async () => after(await onboarding.decide(tenantId, detail.domain!.id, open.baseline_id, open.version, { decision: 'reject', digest: open.digest, reason: reason.trim() }))} />
                    </div>
                  );
                })() : null}
              </>
            )}
          </Panel>

          <Panel title="Versions and ledger">
            <p style={{ fontSize: 'var(--eye-type-label-sm)' }}>Programme versions: {detail.versions.map((v) => `v${v.version} ${v.state}`).join(' · ')} — none deleted. Receipt of this read: <Mono>{detail.receipt.policyDecisionId}</Mono> #{detail.receipt.auditSeq}.</p>
            <ol style={{ fontSize: 'var(--eye-type-body-sm)' }}>{detail.ledger.map((e) => <li key={e.event_id}>{fmtInstant(e.occurred_at)} — {e.event} {e.version !== null ? `v${e.version}` : ''} ({e.subject_kind}) by {e.actor_name ?? e.actor_principal_id}</li>)}</ol>
            <p style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>{detail.boundary}</p>
          </Panel>
        </>
      )}
    </>
  );
}
