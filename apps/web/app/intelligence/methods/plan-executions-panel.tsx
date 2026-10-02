'use client';
/**
 * PLAN EXECUTIONS (CP-6 B24, 0086 §P) — the selected transformation plans, executed.
 *
 * When evidence is recorded, the observations subscriber selects the active methods that read its source and queues ONE execution per
 * method and evidence version. The domain's EXTRACTION AGENT runs them — never the subscriber, never the person looking at this screen.
 * The panel shows what is pending, done, refused or failed per evidence, and the agent that runs them — or that there is none, in which
 * case the executions wait, pending and visible, until one is registered.
 *
 * Registering (and revoking) the agent is a named human's act, human-gated at the server: the extraction manager or the domain
 * administrator names the agent principal an administrator provisioned; a tenant administrator may leave it blank and have one created.
 * The control is OFFERED to those roles; the server decides.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { intelligence, type PlanExecutionRow, type PlanStatus } from '../../../lib/intelligence';
import { DefinitionRow, Empty, GovernedButton, LiveStatus, Mono, ScrollBox, cardStyle, fmtInstant, textareaStyle } from '../../../components/observation';

const STATES: Array<PlanExecutionRow['state']> = ['pending', 'running', 'done', 'refused', 'failed'];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const inputStyle = { ...textareaStyle, minBlockSize: 'auto', blockSize: 'var(--eye-size-control-md)' };
const cell = { padding: 'var(--eye-space-4) var(--eye-space-8)', borderBlockEnd: '1px solid var(--eye-color-border-default)', textAlign: 'start' as const, verticalAlign: 'top' as const };

export function PlanExecutionsPanel() {
  const { scope, me, isExtractionManager } = useShell();
  const canRegister = isExtractionManager || me.bindings.some((b) => ['domain_admin', 'tenant_admin', 'platform_admin'].includes(b.roleCode));
  const [plan, setPlan] = useState<PlanStatus | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [principalId, setPrincipalId] = useState('');
  const [escalationId, setEscalationId] = useState('');
  const [reason, setReason] = useState('');

  const load = async () => {
    const r = await intelligence.planStatus(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the plan executions could not be read'); return; }
    setPlan(r.data);
  };
  useEffect(() => { void load(); }, [scope]);

  const registerAgent = async () => {
    setProblem(null);
    const r = await intelligence.registerExtractionAgent(scope, {
      ownerPrincipalId: me.principalId,
      ...(principalId.trim() === '' ? {} : { principalId: principalId.trim() }),
      ...(escalationId.trim() === '' ? {} : { escalationPrincipalId: escalationId.trim() }),
    });
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the registration was refused'); throw new Error('refused'); }
    setStatus(`extraction agent registered — ${r.data.agent.pending} execution(s) pending, ${r.data.agent.requeued} re-queued; its drain runs now and every ${r.data.served.everySeconds}s · POL ${r.data.receipt.policyDecisionId.slice(0, 8)}… · audit #${r.data.receipt.auditSeq}`);
    setPrincipalId(''); setEscalationId('');
    await load();
  };
  const revokeAgent = async (agentId: string) => {
    setProblem(null);
    const r = await intelligence.revokeExtractionAgent(scope, agentId, reason);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the revocation was refused'); throw new Error('refused'); }
    setStatus(`extraction agent revoked — its next drain is refused and recorded; ${r.data.agent.pending} execution(s) pending · POL ${r.data.receipt.policyDecisionId.slice(0, 8)}… · audit #${r.data.receipt.auditSeq}`);
    setReason('');
    await load();
  };

  // Per evidence: its executions, newest evidence first (the server orders by queued_at, newest first).
  const byEvidence = new Map<string, PlanExecutionRow[]>();
  for (const x of plan?.executions ?? []) byEvidence.set(x.evd_object_id, [...(byEvidence.get(x.evd_object_id) ?? []), x]);

  return (
    <section aria-labelledby="plan-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
      <h2 id="plan-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Plan executions</h2>
      <p style={{ color: 'var(--eye-color-ink-muted)', maxInlineSize: '66ch' }}>
        Every recorded evidence that an active method above reads queues one execution per method and evidence version. The domain&apos;s
        {' '}<strong>extraction agent</strong> runs them under its own session — a repeated or replayed observation never runs twice.
      </p>
      {status === null ? null : <LiveStatus>{status}</LiveStatus>}
      {problem === null ? null : <LiveStatus assertive>{problem}</LiveStatus>}
      {plan === null ? (problem === null ? <Empty>reading the plan executions…</Empty> : null) : (
        <>
          <p style={{ display: 'flex', gap: 'var(--eye-space-16)', flexWrap: 'wrap' }} aria-label="executions by state">
            {STATES.map((s) => <span key={s}><strong>{plan.counts[s] ?? 0}</strong> {s}</span>)}
          </p>

          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Extraction agent</h3>
          {plan.agent === null ? (
            <LiveStatus>{plan.note ?? 'no extraction agent is registered in this domain'}</LiveStatus>
          ) : (
            <dl>
              <DefinitionRow term="Agent"><Mono>{plan.agent.agent_id}</Mono></DefinitionRow>
              <DefinitionRow term="Principal"><Mono>{plan.agent.principal_id}</Mono></DefinitionRow>
              <DefinitionRow term="Executor"><Mono>{plan.executor.name}@{plan.agent.agent_version}</Mono>{' '}<Mono title={plan.agent.code_digest}>{plan.agent.code_digest.slice(0, 16)}…</Mono></DefinitionRow>
              <DefinitionRow term="Owner"><Mono>{plan.agent.owner_principal_id}</Mono></DefinitionRow>
              <DefinitionRow term="Escalation"><Mono>{plan.agent.escalation_principal_id}</Mono></DefinitionRow>
              <DefinitionRow term="Budgets">{plan.agent.budgets.max_executions_per_drain} per drain · {plan.agent.budgets.max_attempts} attempts · every {plan.agent.budgets.drain_every_seconds}s</DefinitionRow>
              <DefinitionRow term="Registered">{fmtInstant(plan.agent.created_at)}</DefinitionRow>
              <DefinitionRow term="This process">{plan.runtime.worker_running ? 'serves the domain\'s drain' : plan.runtime.scheduler_enabled ? 'does not serve the drain yet' : 'runs no scheduler'}</DefinitionRow>
            </dl>
          )}

          {!canRegister ? null : plan.agent === null ? (
            <div style={{ display: 'grid', gap: 'var(--eye-space-8)', maxInlineSize: '40rem' }}>
              <label htmlFor="plan-principal">Agent principal <span style={{ color: 'var(--eye-color-ink-muted)' }}>(provisioned by an administrator, role extraction_agent; blank asks the server to create one — a tenant administrator&apos;s act)</span></label>
              <input id="plan-principal" value={principalId} onChange={(e) => setPrincipalId(e.target.value)} style={inputStyle} autoComplete="off" spellCheck={false} />
              <label htmlFor="plan-escalation">Escalation principal <span style={{ color: 'var(--eye-color-ink-muted)' }}>(optional; you when blank)</span></label>
              <input id="plan-escalation" value={escalationId} onChange={(e) => setEscalationId(e.target.value)} style={inputStyle} autoComplete="off" spellCheck={false} />
              <div>
                <GovernedButton label="Register extraction agent" pendingLabel="registering" onRun={registerAgent}
                  disabled={(principalId.trim() !== '' && !UUID.test(principalId.trim())) || (escalationId.trim() !== '' && !UUID.test(escalationId.trim()))} />
              </div>
            </div>
          ) : (
            <div style={{ display: 'grid', gap: 'var(--eye-space-8)', maxInlineSize: '40rem' }}>
              <label htmlFor="plan-revoke">Revocation reason <span style={{ color: 'var(--eye-color-ink-muted)' }}>(required, at least 8 characters)</span></label>
              <textarea id="plan-revoke" value={reason} onChange={(e) => setReason(e.target.value)} style={textareaStyle} rows={2} />
              <div>
                <GovernedButton label="Revoke extraction agent" pendingLabel="revoking" variant="critical" onRun={() => revokeAgent(plan.agent!.agent_id)} disabled={reason.trim().length < 8} />
              </div>
            </div>
          )}

          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Per evidence</h3>
          {byEvidence.size === 0 ? <Empty>No plan execution has been queued in this domain.</Empty> : (
            <ScrollBox label="plan executions per evidence">
              <table style={{ borderCollapse: 'collapse', inlineSize: '100%', fontSize: 'var(--eye-type-body-sm)' }}>
                <thead>
                  <tr>
                    <th scope="col" style={cell}>Evidence</th><th scope="col" style={cell}>Method</th><th scope="col" style={cell}>State</th>
                    <th scope="col" style={cell}>Attempts</th><th scope="col" style={cell}>Run</th><th scope="col" style={cell}>Claims</th><th scope="col" style={cell}>Why</th>
                  </tr>
                </thead>
                <tbody>
                  {[...byEvidence.entries()].flatMap(([evd, rows]) => rows.map((x, i) => (
                    <tr key={x.execution_id}>
                      <td style={cell}>{i === 0 ? <><Mono title={evd}>{evd.slice(0, 8)}…</Mono> v{x.evd_version}</> : null}</td>
                      <td style={cell}><Mono>{x.method_key}@{x.method_version}</Mono></td>
                      <td style={cell}><strong>{x.state}</strong>{x.outcome.exhausted === true ? ' (attempts exhausted)' : ''}</td>
                      <td style={cell}>{x.attempts}</td>
                      <td style={cell}>{x.run_id === null ? '—' : <Mono title={x.run_id}>{x.run_id.slice(0, 8)}…</Mono>}{x.outcome.mode === undefined ? null : <> · {x.outcome.mode}</>}</td>
                      <td style={cell}>{x.state === 'done' ? `${x.outcome.claims_admitted ?? 0}${(x.outcome.idempotent_hits ?? 0) > 0 ? ` (${x.outcome.idempotent_hits} already extracted)` : ''}` : '—'}</td>
                      <td style={cell}>{x.last_error ?? (x.state === 'pending' ? `queued ${fmtInstant(x.queued_at)}` : '')}</td>
                    </tr>
                  )))}
                </tbody>
              </table>
            </ScrollBox>
          )}
        </>
      )}
    </section>
  );
}
