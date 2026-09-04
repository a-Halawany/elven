'use client';
/**
 * The methods registry.
 *
 * A method's PIN is the whole point of this screen: model, weights digest,
 * runtime, prompt version, decoding digest and mode. Change any one of them and
 * every extraction under it has a different identity — so they are shown together,
 * not tucked behind a detail view.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { intelligence, type MethodSummary } from '../../../lib/intelligence';
import { Empty, GovernedButton, LiveStatus, Mono, ModeBadge, cardStyle,
  DefinitionRow, textareaStyle, fmtInstant } from '../../../components/observation';

export default function MethodsPage() {
  const { scope, isExtractionManager } = useShell();
  const [methods, setMethods] = useState<MethodSummary[] | null>(null);
  const [active, setActive] = useState<MethodSummary | null>(null);
  const [reason, setReason] = useState('');
  const [status, setStatus] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = async () => {
    const r = await intelligence.listMethods(scope);
    if (!r.ok || r.data === undefined) {
      setProblem(r.error?.message ?? 'the methods could not be read');
      return;
    }
    setMethods(r.data.methods);
  };
  useEffect(() => { void load(); }, [scope]);

  const act = async (kind: 'approve' | 'activate') => {
    if (active === null) return;
    setProblem(null);
    const r = kind === 'approve'
      ? await intelligence.approveMethod(scope, active.method_id, reason)
      : await intelligence.transitionMethod(scope, active.method_id, 'active', reason);
    if (!r.ok || r.data === undefined) {
      setProblem(r.error?.message ?? 'the request was refused');
      return;
    }
    setStatus(`${r.data.method.state} · committed — POL ${r.data.receipt.policyDecisionId.slice(0, 8)}… · audit #${r.data.receipt.auditSeq}`);
    setActive(null); setReason('');
    await load();
  };

  if (problem !== null && methods === null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (methods === null) return <Empty>reading the methods registry…</Empty>;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Methods</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)', maxInlineSize: '62ch' }}>
        An extraction method declares what it reads and exactly what reads it. It is registered by
        one operator and approved by another, and it cannot run until it is active.
      </p>
      {status === null ? null : <LiveStatus>{status}</LiveStatus>}
      {problem === null ? null : <LiveStatus assertive>{problem}</LiveStatus>}

      {methods.length === 0 ? <Empty>No extraction method is registered.</Empty> : methods.map((m) => (
        <section key={m.method_id} style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-16)' }}>
          <h2 style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>
            {m.name}{' '}
            <span style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>
              {m.lifecycle_state}
            </span>
          </h2>
          <dl>
            <DefinitionRow term="Key"><Mono>{m.method_key}</Mono></DefinitionRow>
            <DefinitionRow term="Mode"><ModeBadge mode={m.gateway_mode} /></DefinitionRow>
            <DefinitionRow term="Model"><Mono>{m.model_id}</Mono></DefinitionRow>
            <DefinitionRow term="Weights digest">
              <Mono title={m.model_weights_digest}>{m.model_weights_digest.slice(0, 32)}…</Mono>
            </DefinitionRow>
            <DefinitionRow term="Runtime"><Mono>{m.runtime_version}</Mono></DefinitionRow>
            <DefinitionRow term="Prompt">
              <Mono>{m.prompt_ref}@{m.prompt_version}</Mono>{' '}
              <Mono title={m.prompt_digest}>{m.prompt_digest.slice(0, 16)}…</Mono>
            </DefinitionRow>
            <DefinitionRow term="Decoding digest">
              <Mono title={m.decoding_digest}>{m.decoding_digest.slice(0, 32)}…</Mono>
            </DefinitionRow>
            <DefinitionRow term="Produces">{m.target_types.join(', ')}</DefinitionRow>
            <DefinitionRow term="Confidence floor">{Number(m.confidence_floor).toFixed(2)}</DefinitionRow>
            <DefinitionRow term="Review below">{Number(m.review_below).toFixed(2)}</DefinitionRow>
            <DefinitionRow term="Budgets">{m.budget_calls} calls · {m.budget_seconds}s</DefinitionRow>
            <DefinitionRow term="Registered">{fmtInstant(m.registered_at)}</DefinitionRow>
          </dl>
          {!isExtractionManager || m.lifecycle_state === 'active' ? null : (
            <button
              type="button"
              onClick={() => { setActive(m); setReason(''); }}
              style={{ background: 'none', border: '1px solid var(--eye-color-border-default)',
                       borderRadius: 'var(--eye-radius-md)', padding: '0.25rem 0.6rem', cursor: 'pointer' }}
            >
              {m.lifecycle_state === 'draft' ? 'Approve' : 'Activate'}
            </button>
          )}
        </section>
      ))}

      {active === null ? null : (
        <section aria-labelledby="act-h" style={cardStyle}>
          <h2 id="act-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>
            {active.lifecycle_state === 'draft' ? 'Approve' : 'Activate'} {active.method_key}
          </h2>
          <label htmlFor="mreason" style={{ display: 'block' }}>
            Reason <span style={{ color: 'var(--eye-color-ink-muted)' }}>(required, at least 8 characters)</span>
          </label>
          <textarea id="mreason" value={reason} onChange={(e) => setReason(e.target.value)}
            style={textareaStyle} rows={3} />
          <div style={{ display: 'flex', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-16)' }}>
            <GovernedButton
              label={active.lifecycle_state === 'draft' ? 'Approve this method' : 'Activate this method'}
              pendingLabel={active.lifecycle_state === 'draft' ? 'approving…' : 'activating…'}
              onRun={() => act(active.lifecycle_state === 'draft' ? 'approve' : 'activate')}
              disabled={reason.trim().length < 8}
            />
            <button type="button" onClick={() => setActive(null)}
              style={{ background: 'none', border: 'none', color: 'var(--eye-color-accent-default)', cursor: 'pointer' }}>
              Cancel
            </button>
          </div>
        </section>
      )}
    </>
  );
}
