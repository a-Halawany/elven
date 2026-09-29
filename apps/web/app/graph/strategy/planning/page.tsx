'use client';
/**
 * Strategy and Planning workspace (WS-16) — CP-6 B36 part `planning` (0094 §P; F-P6-10: PR-45-001..006, CAP-EO-07, AT-45; V9 UX-45).
 *
 * THE PLAN: an objective set and a horizon, its budget against its AUTHORITY CEILING (both as the server's decimal strings in the plan's
 * currency — never a percentage), its baselines (each a SIGNED version: the signature rows shown with signer, key and instant), the open
 * breaches and the variances raised by the schedule. THE INITIATIVES: the Strategy Graph's INI objects in their planning view — objectives,
 * sponsor, owner, budget share, funded amount, state — each with the NEXT act its state admits and WHO holds it (the authority banner):
 * the lead aligns and prioritises; the executive or the decision authority funds (within authority) and approves (never the proposer);
 * the sponsor pauses and closes. THE SCENARIO SENSITIVITY: a chosen run's outputs on the plan's milestones, each at risk or on track under
 * that scenario at its date, the run's outputs digest named. THE REPLAY: the plan as of an instant (datetime-local).
 * Nothing here is computed on the client: every state, breach, variance and status is the server's, AS OF the instant the answer states.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../../layout';
import { graph, type StrategyRow } from '../../../../lib/graph';
import { planning, BREACH_LABEL, MILESTONE_LABEL, NEXT_ACT, SENSITIVITY_LABEL, STATE_LABEL, budgetLine, dayOf, money, varianceLine,
  type DependencyKind, type Horizon, type InitiativeRow, type PlanRow, type PlanView, type Sensitivity } from '../../../../lib/planning';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant } from '../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../form-bits';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const HORIZONS: Horizon[] = ['30d', '90d', '12m', '36m'];

export default function PlanningPage() {
  const { scope, me, isStrategyOwner } = useShell();
  const isExecutive = me.bindings.some((b) => (b.roleCode === 'executive' || b.roleCode === 'decision_authority' || b.roleCode === 'domain_admin') && b.domainId === me.homeDomainId);
  const isBaseliner = me.bindings.some((b) => (b.roleCode === 'executive' || b.roleCode === 'domain_admin') && b.domainId === me.homeDomainId);
  const [plans, setPlans] = useState<PlanRow[] | null>(null);
  const [planId, setPlanId] = useState('');
  const [view, setView] = useState<PlanView | null>(null);
  const [objects, setObjects] = useState<StrategyRow[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  // the acts' inputs
  const [reason, setReason] = useState('');
  const [amount, setAmount] = useState('');
  const [priority, setPriority] = useState('1');
  const [authority, setAuthority] = useState('');
  const [ackText, setAckText] = useState('');
  // the sensitivity and the replay
  const [runId, setRunId] = useState('');
  const [sensitivity, setSensitivity] = useState<Sensitivity | null>(null);
  const [asOf, setAsOf] = useState('');
  const [replay, setReplay] = useState<Record<string, unknown> | null>(null);
  // the declare form
  const [title, setTitle] = useState(''); const [statement, setStatement] = useState(''); const [horizon, setHorizon] = useState<Horizon>('12m');
  const [objectiveId, setObjectiveId] = useState(''); const [currency, setCurrency] = useState('EUR'); const [budgetTotal, setBudgetTotal] = useState(''); const [budgetAuthority, setBudgetAuthority] = useState('');
  // the propose form
  const [iniId, setIniId] = useState(''); const [iniObjective, setIniObjective] = useState(''); const [sponsor, setSponsor] = useState(''); const [owner, setOwner] = useState(''); const [share, setShare] = useState('0'); const [iniRationale, setIniRationale] = useState('');
  // the milestone / dependency / measure / run forms
  const [msInitiative, setMsInitiative] = useState(''); const [msName, setMsName] = useState(''); const [msDue, setMsDue] = useState(''); const [msMeasure, setMsMeasure] = useState(''); const [msTarget, setMsTarget] = useState('');
  const [depFrom, setDepFrom] = useState(''); const [depTo, setDepTo] = useState(''); const [depKind, setDepKind] = useState<DependencyKind>('finish_to_start'); const [depRationale, setDepRationale] = useState('');
  const [bindMeasure, setBindMeasure] = useState(''); const [bindKey, setBindKey] = useState(''); const [attachRunId, setAttachRunId] = useState('');

  const loadPlans = async () => {
    const [p, s] = await Promise.all([planning.list(scope), graph.listStrategy(scope)]);
    if (!p.ok || p.data === undefined) { setProblem(p.error?.message ?? 'the plans could not be read'); return; }
    setPlans(p.data.plans);
    if (s.ok && s.data !== undefined) setObjects(s.data.strategy);
    setPlanId((prev) => (prev === '' ? (p.data?.plans[0]?.plan_id ?? '') : prev));
  };
  const loadView = async () => {
    if (planId === '') { setView(null); return; }
    const r = await planning.get(scope, planId);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the plan could not be read'); return; }
    setView(r.data.plan);
    setAuthority((prev) => (prev === '' ? String(r.data!.plan.budget_authority) : prev));
  };
  useEffect(() => { void loadPlans(); }, [scope]);
  useEffect(() => { void loadView(); }, [scope, planId]);
  const reload = async () => { await loadPlans(); await loadView(); };
  const run = (f: () => Promise<{ ok: boolean; data?: { receipt: { policyDecisionId: string; auditSeq: number } }; error?: { message: string } }>) => async () => {
    const r = await f();
    if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the act was refused');
    setReceipt(r.data.receipt);
    await reload();
  };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (plans === null) return <Empty>reading the plans…</Empty>;
  const objectives = objects.filter((o) => o.object_type === 'OBJ' && o.status === 'active');
  const inis = objects.filter((o) => o.object_type === 'INI' && o.status === 'active');
  const measures = objects.filter((o) => o.object_type === 'MSR');
  const openBreaches = (view?.breaches ?? []).filter((b) => b.state === 'open');

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Strategy and Planning</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)' }}>
        A plan for an objective set and a horizon; its initiatives are the Strategy Graph&apos;s own (one object, two views). The lead proposes, aligns and
        prioritises; the executive funds and approves within authority; a baseline is a signed version; the sponsor pauses and closes. Every state here is the
        server&apos;s, as of {view === null ? 'the read' : fmtInstant(view.at)}.
      </p>

      <label htmlFor="plan">Plan</label>
      <select id="plan" style={inputStyle} value={planId} onChange={(e) => { setPlanId(e.target.value); setSensitivity(null); setReplay(null); setAuthority(''); }}>
        <option value="">— choose —</option>
        {plans.map((p) => <option key={p.plan_id} value={p.plan_id}>{p.title} · {p.horizon} · {p.state}{p.current_version > 0 ? ` v${p.current_version}` : ''}</option>)}
      </select>

      {view === null ? <Empty>{plans.length === 0 ? 'No plan is declared in this domain yet.' : 'Choose a plan.'}</Empty> : (
        <>
          <section aria-labelledby="plan-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
            <h2 id="plan-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{view.title}</h2>
            <dl>
              <DefinitionRow term="Statement">{view.statement}</DefinitionRow>
              <DefinitionRow term="Horizon · state">{view.horizon} · {view.state}{view.current_version > 0 ? ` · baseline v${view.current_version}` : ' · not yet baselined'}</DefinitionRow>
              <DefinitionRow term="Objectives">{view.objectives.map((o) => `${o.title} (${o.status})`).join(' · ') || 'none'}</DefinitionRow>
              <DefinitionRow term="Budget vs authority"><span aria-label="budget line">{budgetLine(view)}</span></DefinitionRow>
              <DefinitionRow term="Review">{view.last_reviewed_at === null ? 'never reviewed' : `last reviewed ${fmtInstant(view.last_reviewed_at)}`} · every {view.review_cadence_days} day(s)</DefinitionRow>
              <DefinitionRow term="Lead"><Mono>{view.owner_principal_id.slice(0, 8)}…</Mono></DefinitionRow>
            </dl>
            <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Baselines (signed versions)</h3>
            {view.versions.length === 0 ? <Empty>No baseline yet — a baseline binds approved initiatives as a signed version.</Empty> : (
              <ul aria-label="baselines" style={{ paddingInlineStart: '1rem' }}>
                {view.versions.map((v) => (
                  <li key={v.version_id}>
                    v{v.version} at {fmtInstant(v.baselined_at)} — digest <Mono>{v.digest.slice(0, 16)}…</Mono>
                    {v.signatures.length === 0 ? ' · UNSIGNED' : v.signatures.map((s) => <span key={s.signature_id}> · signed by <Mono>{s.signer.slice(0, 8)}…</Mono> ({s.key_id}) at {fmtInstant(s.signed_at)}</span>)}
                    {v.note ? ` — ${v.note}` : ''}
                  </li>
                ))}
              </ul>
            )}
            {isExecutive ? (
              <div style={{ display: 'grid', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-16)' }}>
                <label htmlFor="authority">Authority ceiling ({view.budget_currency}) — lowering it below the funded sum records a continuity breach, never a silent acceptance</label>
                <input id="authority" style={inputStyle} value={authority} onChange={(e) => setAuthority(e.target.value)} />
                <label htmlFor="reason">Reason (every act says why; 8 characters or more)</label>
                <input id="reason" style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} />
                <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
                  <GovernedButton label="Set authority" pendingLabel="setting" disabled={authority === '' || reason.trim().length < 8} onRun={run(() => planning.setAuthority(scope, view.plan_id, authority, reason))} />
                  <GovernedButton label="Record a review" pendingLabel="recording" disabled={reason.trim().length < 8} onRun={run(() => planning.review(scope, view.plan_id, reason))} />
                  {isBaseliner ? <GovernedButton label="Baseline (sign this version)" pendingLabel="baselining" disabled={view.state === 'closed'} onRun={run(() => planning.baseline(scope, view.plan_id, reason))} /> : null}
                </div>
              </div>
            ) : isStrategyOwner ? (
              <div style={{ display: 'grid', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-16)' }}>
                <label htmlFor="reason">Review note (8 characters or more)</label>
                <input id="reason" style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} />
                <div><GovernedButton label="Record a review" pendingLabel="recording" disabled={reason.trim().length < 8} onRun={run(() => planning.review(scope, view.plan_id, reason))} /></div>
              </div>
            ) : null}
          </section>

          <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Breaches</h2>
          {view.breaches.length === 0 ? <Empty>No breach is recorded on this plan.</Empty> : (
            <ul aria-label="breaches" style={{ paddingInlineStart: '1rem' }}>
              {view.breaches.map((b) => (
                <li key={b.breach_id} style={{ marginBlockEnd: 'var(--eye-space-8)' }}>
                  <strong>{b.state.toUpperCase()}</strong> — {BREACH_LABEL[b.kind]}<br />
                  <span>{b.detail}</span> · opened {fmtInstant(b.opened_at)}
                  {b.state === 'acknowledged' ? <> · acknowledged by <Mono>{String(b.acknowledged_by).slice(0, 8)}…</Mono>: {b.authorization_note}</> : null}
                  {b.state === 'resolved' ? <> · resolved {fmtInstant(b.resolved_at)}: {b.resolution}</> : null}
                  {b.state === 'open' ? <> · <em>a commitment on this plan&apos;s initiatives is HELD until the executive acknowledges this breach or it resolves</em></> : null}
                  {b.forecast_impact && Object.keys(b.forecast_impact).length > 0 ? <details><summary>forecast impact</summary><pre style={{ whiteSpace: 'pre-wrap', fontSize: 'var(--eye-type-label-sm)' }}>{JSON.stringify(b.forecast_impact, null, 1)}</pre></details> : null}
                  {b.state === 'open' && isExecutive ? (
                    <div style={{ display: 'grid', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-8)' }}>
                      <label htmlFor={`ack-${b.breach_id}`}>Acknowledge with the authority that permits commitments while the breach stands</label>
                      <input id={`ack-${b.breach_id}`} style={inputStyle} value={ackText} onChange={(e) => setAckText(e.target.value)} />
                      <div><GovernedButton label="Acknowledge breach" pendingLabel="acknowledging" disabled={ackText.trim().length < 8} onRun={run(() => planning.acknowledgeBreach(scope, b.breach_id, ackText))} /></div>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}

          <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Variances</h2>
          {view.variances.length === 0 ? <Empty>No variance has been raised by the schedule.</Empty> : (
            <ul aria-label="variances" style={{ paddingInlineStart: '1rem' }}>
              {view.variances.map((v) => (
                <li key={v.variance_id}>{varianceLine(v)} · raised {fmtInstant(v.raised_at)} · routed to <Mono>{v.owner_principal_id === null ? 'the class roles' : `${v.owner_principal_id.slice(0, 8)}…`}</Mono>
                  {v.basis_digest ? <> · run outputs <Mono>{v.basis_digest.slice(0, 12)}…</Mono></> : null}</li>
              ))}
            </ul>
          )}

          <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Initiatives</h2>
          {view.initiatives.length === 0 ? <Empty>No initiative is proposed into this plan.</Empty> : view.initiatives.map((i) => <InitiativeCard key={i.initiative_id} i={i} view={view} me={me.principalId} isExecutive={isExecutive} isLead={isStrategyOwner}
            reason={reason} setReason={setReason} amount={amount} setAmount={setAmount} priority={priority} setPriority={setPriority} run={run} />)}

          <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Dependencies</h2>
          {view.dependencies.length === 0 ? <Empty>No dependency is declared.</Empty> : (
            <ul aria-label="dependencies" style={{ paddingInlineStart: '1rem' }}>
              {view.dependencies.map((d) => <li key={d.dependency_id}>{d.from_title} → {d.to_title} · {d.kind.replace(/_/g, ' ')} — {d.rationale}</li>)}
            </ul>
          )}
          {isStrategyOwner ? (
            <div style={{ display: 'grid', gap: 'var(--eye-space-8)' }}>
              <label htmlFor="dep-from">Depends on (finishes first / shares the resource)</label>
              <select id="dep-from" style={inputStyle} value={depFrom} onChange={(e) => setDepFrom(e.target.value)}><option value="">— choose —</option>{view.initiatives.map((i) => <option key={i.initiative_id} value={i.initiative_id}>{i.title}</option>)}</select>
              <label htmlFor="dep-to">Dependent initiative</label>
              <select id="dep-to" style={inputStyle} value={depTo} onChange={(e) => setDepTo(e.target.value)}><option value="">— choose —</option>{view.initiatives.map((i) => <option key={i.initiative_id} value={i.initiative_id}>{i.title}</option>)}</select>
              <label htmlFor="dep-kind">Kind</label>
              <select id="dep-kind" style={inputStyle} value={depKind} onChange={(e) => setDepKind(e.target.value as DependencyKind)}><option value="finish_to_start">finish to start</option><option value="shares_resource">shares a resource</option></select>
              <label htmlFor="dep-why">Why (8 characters or more)</label>
              <input id="dep-why" style={inputStyle} value={depRationale} onChange={(e) => setDepRationale(e.target.value)} />
              <div><GovernedButton label="Declare dependency" pendingLabel="declaring" disabled={depFrom === '' || depTo === '' || depRationale.trim().length < 8} onRun={run(() => planning.declareDependency(scope, { from: depFrom, to: depTo, kind: depKind, rationale: depRationale }))} /></div>
            </div>
          ) : null}

          <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Measures (the Strategy Graph&apos;s, bound by id)</h2>
          {view.measures.length === 0 ? <Empty>No measure is bound to this plan.</Empty> : (
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Measure</Th><Th>Target</Th><Th>Latest</Th><Th>Run output key</Th><Th>Approval</Th></tr></thead>
              <tbody>{view.measures.map((m) => (
                <tr key={m.measure_id}><Td>{m.title}</Td><Td>{m.target_value} {m.unit} ({m.direction.replace('_', ' ')}){m.target_date ? ` by ${dayOf(m.target_date)}` : ''}</Td>
                  <Td>{m.last_value === null ? 'no observation' : `${m.last_value} ${m.unit} at ${fmtInstant(m.last_observed_at)}`}</Td><Td><Mono>{m.quantity_key ?? '— unmapped'}</Mono></Td><Td>{m.approval_state} (v{m.definition_version})</Td></tr>
              ))}</tbody>
            </table>
          )}
          {isStrategyOwner ? (
            <div style={{ display: 'grid', gap: 'var(--eye-space-8)' }}>
              <label htmlFor="bind-measure">Bind a measure</label>
              <select id="bind-measure" style={inputStyle} value={bindMeasure} onChange={(e) => setBindMeasure(e.target.value)}><option value="">— choose —</option>{measures.map((m) => <option key={m.strategy_object_id} value={m.strategy_object_id}>{m.title}</option>)}</select>
              <label htmlFor="bind-key">Run output key (the series column a scenario run answers for it, e.g. on_hand_end)</label>
              <input id="bind-key" style={inputStyle} value={bindKey} onChange={(e) => setBindKey(e.target.value)} />
              <div><GovernedButton label="Bind measure" pendingLabel="binding" disabled={bindMeasure === ''} onRun={run(() => planning.bindMeasure(scope, view.plan_id, bindMeasure, bindKey.trim() === '' ? null : bindKey.trim()))} /></div>
              <label htmlFor="ms-ini">Milestone — initiative</label>
              <select id="ms-ini" style={inputStyle} value={msInitiative} onChange={(e) => setMsInitiative(e.target.value)}><option value="">— choose —</option>{view.initiatives.map((i) => <option key={i.initiative_id} value={i.initiative_id}>{i.title}</option>)}</select>
              <label htmlFor="ms-name">Milestone name</label>
              <input id="ms-name" style={inputStyle} value={msName} onChange={(e) => setMsName(e.target.value)} />
              <label htmlFor="ms-due">Due date</label>
              <input id="ms-due" type="date" style={inputStyle} value={msDue} onChange={(e) => setMsDue(e.target.value)} />
              <label htmlFor="ms-measure">The measure that proves it</label>
              <select id="ms-measure" style={inputStyle} value={msMeasure} onChange={(e) => setMsMeasure(e.target.value)}><option value="">— choose —</option>{measures.map((m) => <option key={m.strategy_object_id} value={m.strategy_object_id}>{m.title}</option>)}</select>
              <label htmlFor="ms-target">Target value at the due date</label>
              <input id="ms-target" style={inputStyle} value={msTarget} onChange={(e) => setMsTarget(e.target.value)} />
              <div><GovernedButton label="Set milestone" pendingLabel="setting" disabled={msInitiative === '' || msName.trim().length < 2 || msDue === '' || msMeasure === '' || msTarget === ''} onRun={run(() => planning.setMilestone(scope, { initiativeId: msInitiative, name: msName, dueDate: msDue, measureId: msMeasure, targetValue: msTarget }))} /></div>
            </div>
          ) : null}

          <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Scenario sensitivity</h2>
          <p style={{ color: 'var(--eye-color-ink-muted)' }}>A run&apos;s output quantities applied to the plan&apos;s measures by key: each milestone at risk or on track under that scenario at its date. A read — nothing is recorded.</p>
          {isStrategyOwner ? (
            <div style={{ display: 'grid', gap: 'var(--eye-space-8)' }}>
              <label htmlFor="attach-run">Attach a completed run (its id) — the schedule reads attached runs for variances</label>
              <input id="attach-run" style={inputStyle} value={attachRunId} onChange={(e) => setAttachRunId(e.target.value)} />
              <div><GovernedButton label="Attach run" pendingLabel="attaching" disabled={attachRunId.trim().length < 32} onRun={run(() => planning.attachRun(scope, view.plan_id, attachRunId.trim()))} /></div>
            </div>
          ) : null}
          <label htmlFor="run">Run</label>
          <select id="run" style={inputStyle} value={runId} onChange={(e) => setRunId(e.target.value)}>
            <option value="">— choose an attached run —</option>
            {view.runs.map((r) => <option key={r.run_id} value={r.run_id}>{r.model_ref} · {r.component} · {fmtInstant(r.completed_at)} · {r.outputs_digest.slice(0, 12)}…</option>)}
          </select>
          <div><GovernedButton label="Read sensitivity" pendingLabel="reading" disabled={runId === ''} onRun={async () => {
            const r = await planning.sensitivity(scope, view.plan_id, runId);
            if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the sensitivity could not be read');
            setSensitivity(r.data.sensitivity); setReceipt(r.data.receipt);
          }} /></div>
          {sensitivity === null ? null : !sensitivity.available ? <LiveStatus>{sensitivity.reason}</LiveStatus> : (
            <section aria-labelledby="sens-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
              <h3 id="sens-h" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>Under run <Mono>{String(sensitivity.run_id).slice(0, 8)}…</Mono> ({sensitivity.model_ref}) — outputs digest <Mono>{sensitivity.outputs_digest}</Mono></h3>
              <LiveStatus>{sensitivity.summary?.line}</LiveStatus>
              <ul aria-label="sensitivity" style={{ paddingInlineStart: '1rem' }}>
                {(sensitivity.milestones ?? []).map((m) => <li key={m.milestone_id}>{m.name} ({m.initiative_title}, due {dayOf(m.due_date)}): {SENSITIVITY_LABEL[m.status]}{m.value !== null ? ` — ${m.value} ${m.unit} at ${dayOf(m.value_date)} vs target ${m.target_value}` : ''}</li>)}
              </ul>
            </section>
          )}

          <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Replay — the plan as of an instant</h2>
          <label htmlFor="asof">As of</label>
          <input id="asof" type="datetime-local" style={inputStyle} value={asOf} onChange={(e) => setAsOf(e.target.value)} />
          <div><GovernedButton label="Read as of" pendingLabel="reading" onRun={async () => {
            const r = await planning.asOf(scope, view.plan_id, asOf === '' ? null : new Date(asOf).toISOString());
            if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the replay could not be read');
            setReplay(r.data.replay); setReceipt(r.data.receipt);
          }} /></div>
          {replay === null ? null : (
            <section aria-labelledby="replay-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
              <h3 id="replay-h" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>As of {fmtInstant(replay['as_of'])}</h3>
              {replay['exists'] === false ? <Empty>The plan did not exist yet at that instant (declared {fmtInstant(replay['declared_at'])}).</Empty> : (
                <ul aria-label="replay" style={{ paddingInlineStart: '1rem' }}>
                  <li>state {String(replay['state'])} · baseline v{String(replay['current_version'])} · authority {String(replay['budget_authority'])} {String(replay['currency'])}</li>
                  {((replay['initiatives'] as Array<Record<string, unknown>> | undefined) ?? []).map((i) => <li key={String(i['initiative_id'])}>{String(i['title'])}: {String(i['state'])} (after {String(i['as_of_transition'])} at {fmtInstant(i['transition_at'])})</li>)}
                  <li>{((replay['breaches'] as unknown[] | undefined) ?? []).length} breach(es) · {((replay['variances'] as unknown[] | undefined) ?? []).length} variance(s) · {((replay['milestones'] as unknown[] | undefined) ?? []).length} milestone(s)</li>
                </ul>
              )}
            </section>
          )}
        </>
      )}

      {!isStrategyOwner ? (
        <UnknownNote>
          Declaring a plan and proposing an initiative into it are the strategy lead&apos;s acts (<Mono>strategy_owner</Mono>); a Planning Agent may propose, and nothing else.
          Funding and approval are the executive&apos;s or the decision authority&apos;s; the baseline is the executive&apos;s signed version; a pause or a close is the sponsor&apos;s.
        </UnknownNote>
      ) : (
        <>
          <section aria-labelledby="declare-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
            <h2 id="declare-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Declare a plan</h2>
            <label htmlFor="pl-title">Title</label><input id="pl-title" style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
            <label htmlFor="pl-stmt">Statement</label><input id="pl-stmt" style={inputStyle} value={statement} onChange={(e) => setStatement(e.target.value)} />
            <label htmlFor="pl-horizon">Horizon</label>
            <select id="pl-horizon" style={inputStyle} value={horizon} onChange={(e) => setHorizon(e.target.value as Horizon)}>{HORIZONS.map((h) => <option key={h} value={h}>{h}</option>)}</select>
            <label htmlFor="pl-obj">Objective (the set&apos;s first; a live OBJ)</label>
            <select id="pl-obj" style={inputStyle} value={objectiveId} onChange={(e) => setObjectiveId(e.target.value)}><option value="">— choose —</option>{objectives.map((o) => <option key={o.strategy_object_id} value={o.strategy_object_id}>{o.title}</option>)}</select>
            <label htmlFor="pl-cur">Currency (ISO-4217)</label><input id="pl-cur" style={inputStyle} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} />
            <label htmlFor="pl-total">Budget (a decimal string, e.g. 1200000.00)</label><input id="pl-total" style={inputStyle} value={budgetTotal} onChange={(e) => setBudgetTotal(e.target.value)} />
            <label htmlFor="pl-auth">Authority ceiling</label><input id="pl-auth" style={inputStyle} value={budgetAuthority} onChange={(e) => setBudgetAuthority(e.target.value)} />
            <GovernedButton label="Declare plan" pendingLabel="declaring" disabled={title.trim().length < 2 || statement.trim().length < 2 || objectiveId === '' || budgetTotal === '' || budgetAuthority === ''}
              onRun={run(() => planning.declare(scope, { title, statement, horizon, objectiveIds: [objectiveId], currency, budgetTotal, budgetAuthority }))} />
          </section>
          {view === null ? null : (
            <section aria-labelledby="propose-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
              <h2 id="propose-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Propose an initiative into {view.title}</h2>
              <label htmlFor="in-ini">Initiative (an INI object of the Strategy Graph)</label>
              <select id="in-ini" style={inputStyle} value={iniId} onChange={(e) => setIniId(e.target.value)}><option value="">— choose —</option>{inis.map((o) => <option key={o.strategy_object_id} value={o.strategy_object_id}>{o.title}</option>)}</select>
              <label htmlFor="in-obj">Objective (of the plan&apos;s set)</label>
              <select id="in-obj" style={inputStyle} value={iniObjective} onChange={(e) => setIniObjective(e.target.value)}><option value="">— choose —</option>{view.objectives.map((o) => <option key={o.objective_id} value={o.objective_id}>{o.title}</option>)}</select>
              <label htmlFor="in-sponsor">Sponsor (principal id — a named human)</label><input id="in-sponsor" style={inputStyle} value={sponsor} onChange={(e) => setSponsor(e.target.value)} />
              <label htmlFor="in-owner">Owner (principal id — receives the variances)</label><input id="in-owner" style={inputStyle} value={owner} onChange={(e) => setOwner(e.target.value)} />
              <label htmlFor="in-share">Budget share ({view.budget_currency})</label><input id="in-share" style={inputStyle} value={share} onChange={(e) => setShare(e.target.value)} />
              <label htmlFor="in-why">Why (8 characters or more)</label><input id="in-why" style={inputStyle} value={iniRationale} onChange={(e) => setIniRationale(e.target.value)} />
              <GovernedButton label="Propose initiative" pendingLabel="proposing" disabled={iniId === '' || iniObjective === '' || sponsor.length < 32 || owner.length < 32 || iniRationale.trim().length < 8}
                onRun={run(() => planning.propose(scope, { initiativeId: iniId, planId: view.plan_id, objectiveId: iniObjective, sponsor, owner, budgetShare: share, rationale: iniRationale }))} />
            </section>
          )}
        </>
      )}
      <Receipt receipt={receipt} />
    </>
  );
}

function InitiativeCard({ i, view, me, isExecutive, isLead, reason, setReason, amount, setAmount, priority, setPriority, run }: {
  i: InitiativeRow; view: PlanView; me: string; isExecutive: boolean; isLead: boolean;
  reason: string; setReason: (v: string) => void; amount: string; setAmount: (v: string) => void; priority: string; setPriority: (v: string) => void;
  run: (f: () => Promise<{ ok: boolean; data?: { receipt: { policyDecisionId: string; auditSeq: number } }; error?: { message: string } }>) => () => Promise<void>;
}) {
  const { scope } = useShell();
  const next = NEXT_ACT[i.state];
  const isSponsor = i.sponsor_principal_id === me;
  const leadAct = next.act === 'align' || next.act === 'prioritise';
  const execAct = next.act === 'fund' || next.act === 'approve';
  const mayAct = (leadAct && isLead) || (execAct && isExecutive);
  return (
    <section aria-labelledby={`ini-${i.initiative_id}`} style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
      <h3 id={`ini-${i.initiative_id}`} style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>{i.title}</h3>
      <dl>
        <DefinitionRow term="State"><span aria-label="initiative state">{STATE_LABEL[i.state]}</span>{i.priority !== null ? ` · priority ${i.priority}` : ''}</DefinitionRow>
        <DefinitionRow term="Objectives">{(i.objectives ?? []).map((o) => `${o.title} (${o.status})`).join(' · ')}</DefinitionRow>
        <DefinitionRow term="Sponsor · owner"><Mono>{i.sponsor_principal_id.slice(0, 8)}…</Mono> · <Mono>{i.owner_principal_id.slice(0, 8)}…</Mono></DefinitionRow>
        <DefinitionRow term="Budget share · funded">{money(i.budget_share, view.budget_currency)} · {money(i.funded_amount, view.budget_currency)}</DefinitionRow>
        <DefinitionRow term="Proposed by">{i.proposed_by_kind === 'agent' ? 'the Planning Agent (AI proposes; a named human approves)' : 'a person'} <Mono>{i.proposed_by.slice(0, 8)}…</Mono> at {fmtInstant(i.proposed_at)}</DefinitionRow>
        {i.approved_at !== null ? <DefinitionRow term="Approved">by <Mono>{String(i.approved_by).slice(0, 8)}…</Mono> at {fmtInstant(i.approved_at)}{i.approved_object_version !== null ? ` · INI object version ${i.approved_object_version}` : ''}</DefinitionRow> : null}
        {i.pause_reason !== null ? <DefinitionRow term="Paused">{i.pause_reason}</DefinitionRow> : null}
        {i.close_reason !== null ? <DefinitionRow term="Closed">{i.close_reason}</DefinitionRow> : null}
        <DefinitionRow term="Milestones">
          {(i.milestones ?? []).length === 0 ? 'none' : (
            <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>
              {(i.milestones ?? []).map((m) => <li key={m.milestone_id}>{m.name} — due {dayOf(m.due_date)} · {m.measure_title ?? m.measure_id.slice(0, 8)} reaches {m.target_value}{m.unit ? ` ${m.unit}` : ''} · {MILESTONE_LABEL[m.state]}</li>)}
            </ul>
          )}
        </DefinitionRow>
        <DefinitionRow term="Transitions">
          {(i.transitions ?? []).length === 0 ? 'none' : (
            <ul style={{ margin: 0, paddingInlineStart: '1rem' }}>
              {(i.transitions ?? []).map((t, n) => <li key={n}>{t.transition}: {t.from ?? '—'} → {t.to} by {t.actor_kind === 'agent' ? 'the agent' : 'a person'} <Mono>{t.actor.slice(0, 8)}…</Mono> at {fmtInstant(t.at)}{t.reason ? ` — ${t.reason}` : ''}</li>)}
            </ul>
          )}
        </DefinitionRow>
      </dl>
      <p aria-label="authority banner" style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>
        Next: {next.act === null ? next.by : `${next.act} — by ${next.by}`}.
      </p>
      {mayAct || (isSponsor && i.state !== 'closed') ? (
        <div style={{ display: 'grid', gap: 'var(--eye-space-8)' }}>
          <label htmlFor={`why-${i.initiative_id}`}>Why (8 characters or more)</label>
          <input id={`why-${i.initiative_id}`} style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} />
          {next.act === 'prioritise' && isLead ? <><label htmlFor={`prio-${i.initiative_id}`}>Priority (rank)</label><input id={`prio-${i.initiative_id}`} style={inputStyle} value={priority} onChange={(e) => setPriority(e.target.value)} /></> : null}
          {next.act === 'fund' && isExecutive ? <><label htmlFor={`amt-${i.initiative_id}`}>Amount ({view.budget_currency}; within the authority ceiling)</label><input id={`amt-${i.initiative_id}`} style={inputStyle} value={amount} onChange={(e) => setAmount(e.target.value)} /></> : null}
          <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
            {next.act === 'align' && isLead ? <GovernedButton label="Align" pendingLabel="aligning" disabled={reason.trim().length < 8} onRun={run(() => planning.align(scope, i.initiative_id, [], reason))} /> : null}
            {next.act === 'prioritise' && isLead ? <GovernedButton label="Prioritise" pendingLabel="prioritising" disabled={reason.trim().length < 8 || !/^\d+$/.test(priority)} onRun={run(() => planning.prioritise(scope, i.initiative_id, Number(priority), reason))} /> : null}
            {next.act === 'fund' && isExecutive ? <GovernedButton label="Fund" pendingLabel="funding" disabled={reason.trim().length < 8 || amount === ''} onRun={run(() => planning.fund(scope, i.initiative_id, amount, reason))} /> : null}
            {next.act === 'approve' && isExecutive ? <GovernedButton label="Approve" pendingLabel="approving" disabled={reason.trim().length < 8} onRun={run(() => planning.approve(scope, i.initiative_id, reason))} /> : null}
            {isSponsor && i.state !== 'paused' && i.state !== 'closed' ? <GovernedButton label="Pause (sponsor)" pendingLabel="pausing" disabled={reason.trim().length < 8} onRun={run(() => planning.pause(scope, i.initiative_id, reason))} /> : null}
            {isSponsor && i.state !== 'closed' ? <GovernedButton label="Close (sponsor)" pendingLabel="closing" disabled={reason.trim().length < 8} onRun={run(() => planning.close(scope, i.initiative_id, reason))} /> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
