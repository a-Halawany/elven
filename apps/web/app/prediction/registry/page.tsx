'use client';
/**
 * The forecasting portfolio — CP-6 B25 §MR (0108; F-P4-01). THE GOVERNED MODEL REGISTRY (every method entry with its family, kinds,
 * horizons, state and the reason it is unavailable; the two legacy methods as approved builtins), THE TARGETS, THE VERSIONED HORIZON POLICY
 * (per horizon the families allowed, the confidence language and the validation requirement), THE PLAN for a target at a horizon and THE
 * ROUTED ISSUE — a forecast whose method, kind and language change by horizon, or the governed refusal naming what is missing.
 *
 * The screen decides nothing: the named steward, the separation of duties and the policy are the server's, and every answer is shown as
 * sent. A forecast's validation is labelled for the claim it makes — empirical validation, a synthetic demonstration, or scenario language.
 */
import { useCallback, useEffect, useState, type CSSProperties, type FormEvent } from 'react';
import { useShell } from '../layout';
import { registry, headline, languageLabel, planLines, validationClaim, type Plan, type RegistryView, type RoutedForecast } from '../../../lib/registry-b25';
import { Empty, LiveStatus, Mono, UnknownNote, cardStyle, fmtInstant, textareaStyle } from '../../../components/observation';
import { Th, Td, buttonStyle, inputStyle, tableStyle } from '../../../components/ui';

const HORIZONS = ['30d', '90d', '180d', '1y', '3y', '5y'];
const section: CSSProperties = { ...cardStyle, marginBlockStart: 'var(--eye-space-16)' };
const h2: CSSProperties = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 };
const formRow: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 'var(--eye-space-8)', alignItems: 'end', marginBlockStart: 'var(--eye-space-8)' };
const parseJson = (s: string): Record<string, unknown> | null => { try { const v = JSON.parse(s) as unknown; return v !== null && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null; } catch { return null; } };

export default function RegistryPage() {
  const { scope, isForecastOwner } = useShell();
  const [view, setView] = useState<RegistryView | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  // the plan / issue form
  const [targetKey, setTargetKey] = useState(''); const [seriesKey, setSeriesKey] = useState(''); const [horizon, setHorizon] = useState('30d');
  const [knownAt, setKnownAt] = useState(''); const [observedThrough, setObservedThrough] = useState(''); const [assumptions, setAssumptions] = useState(''); const [methodRef, setMethodRef] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null); const [issued, setIssued] = useState<RoutedForecast | null>(null);
  // the governance forms
  const [proposal, setProposal] = useState('{\n  "methodKey": "",\n  "family": "event",\n  "horizons": ["30d"],\n  "description": "",\n  "steward": "",\n  "declarations": {}\n}');
  const [targetJson, setTargetJson] = useState('{\n  "targetKey": "",\n  "kind": "event",\n  "unit": "probability",\n  "title": "",\n  "definition": { "series_key": "" }\n}');
  const [policyJson, setPolicyJson] = useState('{\n  "riskClass": "standard",\n  "statement": "",\n  "steward": "",\n  "rules": {}\n}');
  const [decideId, setDecideId] = useState(''); const [decideNote, setDecideNote] = useState('');

  const load = useCallback(async () => {
    const r = await registry.read(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the registry could not be read'); return; }
    setView(r.data); setProblem(null);
  }, [scope]);
  useEffect(() => { void load(); }, [load]);

  const say = (ok: boolean, okText: string, err?: { message: string }) => setAnswer(ok ? okText : err?.message ?? 'refused');
  const planPayload = () => ({ ...(targetKey.trim() === '' ? {} : { targetKey: targetKey.trim() }), ...(seriesKey.trim() === '' ? {} : { seriesKey: seriesKey.trim() }), horizon,
    ...(knownAt === '' ? {} : { knownAt: new Date(knownAt).toISOString() }), ...(observedThrough === '' ? {} : { observedThrough }) });

  async function onPlan(e: FormEvent) {
    e.preventDefault(); setIssued(null);
    const r = await registry.plan(scope, planPayload());
    if (!r.ok || r.data === undefined) { setAnswer(r.error?.message ?? 'the plan could not be read'); setPlan(null); return; }
    setPlan(r.data.plan); setAnswer(null);
  }
  async function onIssue() {
    const r = await registry.issue(scope, { ...planPayload(), assumptions: assumptions.split(/[\s,]+/).filter((x) => x !== ''), ...(methodRef.trim() === '' ? {} : { methodRef: methodRef.trim() }), label: 'replay demonstration' });
    if (!r.ok || r.data === undefined) { setIssued(null); setAnswer(r.error?.message ?? 'refused'); await load(); return; }
    setIssued(r.data.forecast); setPlan(r.data.plan); setAnswer(null); await load();
  }
  async function onJson(kind: 'propose' | 'target' | 'policy') {
    const text = kind === 'propose' ? proposal : kind === 'target' ? targetJson : policyJson;
    const body = parseJson(text);
    if (body === null) { setAnswer('the form is not a JSON object'); return; }
    const r = kind === 'propose' ? await registry.propose(scope, body) : kind === 'target' ? await registry.declareTarget(scope, body) : await registry.publishPolicy(scope, body);
    say(r.ok, kind === 'propose' ? 'proposed — its named steward decides it' : kind === 'target' ? 'declared — a named human who did not declare it approves it' : 'published — its named steward concurs before it is active', r.error);
    await load();
  }
  async function onDecide(what: 'method' | 'target' | 'policy', decision: string) {
    const r = what === 'method' ? await registry.decide(scope, decideId.trim(), decision as 'approve' | 'reject', decideNote)
      : what === 'target' ? await registry.decideTarget(scope, decideId.trim(), decision as 'approve' | 'reject', decideNote)
      : await registry.concur(scope, decideId.trim(), decision as 'concur' | 'reject', decideNote);
    say(r.ok, `${what} ${decision === 'concur' ? 'concurred' : `${decision}d`}`, r.error); await load();
  }

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (view === null) return <Empty>reading the registry…</Empty>;
  const active = view.policies.filter((p) => p.state === 'active');

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Forecasting portfolio</h1>
      <UnknownNote>Methods, targets and horizon policies are governed: an entry is approved by the method steward it names, a policy is active only on that steward’s concurrence, and a horizon the policy does not support is <strong>refused, naming what is missing</strong>. Long horizons speak scenario language; nothing here is more precise than its validation.</UnknownNote>
      {answer !== null && <LiveStatus assertive>{answer}</LiveStatus>}

      <section aria-labelledby="plan-h" style={section}>
        <h2 id="plan-h" style={h2}>Plan and issue — the method by horizon</h2>
        <form onSubmit={(e) => void onPlan(e)} style={formRow}>
          <label>Target <input style={inputStyle} value={targetKey} onChange={(e) => setTargetKey(e.target.value)} placeholder="corridor.transit_delay" /></label>
          <label>or series <input style={inputStyle} value={seriesKey} onChange={(e) => setSeriesKey(e.target.value)} /></label>
          <label>Horizon <select style={inputStyle} value={horizon} onChange={(e) => setHorizon(e.target.value)}>{HORIZONS.map((h) => <option key={h} value={h}>{h}</option>)}</select></label>
          <label>Known at <input type="datetime-local" style={inputStyle} value={knownAt} onChange={(e) => setKnownAt(e.target.value)} /></label>
          <label>Observed through <input type="date" style={inputStyle} value={observedThrough} onChange={(e) => setObservedThrough(e.target.value)} /></label>
          <button type="submit" style={buttonStyle}>Plan</button>
        </form>
        {plan !== null && (
          <div aria-label="the plan">
            <p>Kind <Mono>{plan.forecast_kind}</Mono> · language: {languageLabel(plan.confidence_language)} · policy {plan.policy.policy_id === null ? 'none published (the legacy rule)' : `${plan.policy.risk_class} v${plan.policy.version}`}{plan.treatment === null ? '' : ` — ${plan.treatment}`}</p>
            <ul>{planLines(plan).map((l) => <li key={l}>{l}</li>)}</ul>
          </div>
        )}
        {isForecastOwner && (
          <div style={formRow}>
            <label>Assumptions (ASU ids) <input style={{ ...inputStyle, minInlineSize: '24rem' }} value={assumptions} onChange={(e) => setAssumptions(e.target.value)} /></label>
            <label>Method (optional) <input style={inputStyle} value={methodRef} onChange={(e) => setMethodRef(e.target.value)} placeholder="key@version" /></label>
            <button type="button" style={buttonStyle} onClick={() => void onIssue()}>Issue through the portfolio</button>
          </div>
        )}
        {issued !== null && (
          <div aria-label="the routed forecast" style={{ marginBlockStart: 'var(--eye-space-8)' }}>
            <p><strong>{headline(issued)}</strong> — <Mono>{issued.method_ref}</Mono> ({issued.family}, {issued.forecast_kind}) · {validationClaim(issued.validation_state, issued.validation_note).text}</p>
            <p style={{ fontSize: 'var(--eye-type-body-sm)' }}>{issued.statement}</p>
          </div>
        )}
      </section>

      <section aria-labelledby="m-h" style={section}>
        <h2 id="m-h" style={h2}>The registry</h2>
        <table className="eye-table" style={tableStyle}>
          <thead><tr><Th>Method</Th><Th>Family</Th><Th>Kinds</Th><Th>Horizons</Th><Th>State</Th><Th>Steward</Th><Th>Entry</Th></tr></thead>
          <tbody>
            {view.methods.map((m) => (
              <tr key={m.method_ref}>
                <Td mono>{m.method_ref}{m.builtin ? ' (builtin)' : ''}</Td><Td>{m.family}</Td><Td>{m.forecast_kinds.join(', ')}</Td><Td mono>{m.horizons.join(' ')}</Td>
                <Td>{m.state}{m.state_reason === null ? '' : ` — ${m.state_reason}`}</Td><Td mono>{m.steward_principal_id === null ? '—' : `${m.steward_principal_id.slice(0, 8)}…`}</Td>
                <Td mono>{m.method_id ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={formRow}>
          <label>Entry, target or policy id <input style={{ ...inputStyle, minInlineSize: '22rem' }} value={decideId} onChange={(e) => setDecideId(e.target.value)} /></label>
          <label>Note <input style={{ ...inputStyle, minInlineSize: '18rem' }} value={decideNote} onChange={(e) => setDecideNote(e.target.value)} /></label>
          <button type="button" style={buttonStyle} onClick={() => void onDecide('method', 'approve')}>Approve entry</button>
          <button type="button" style={buttonStyle} onClick={() => void onDecide('method', 'reject')}>Reject entry</button>
          <button type="button" style={buttonStyle} onClick={() => void onDecide('target', 'approve')}>Approve target</button>
          <button type="button" style={buttonStyle} onClick={() => void onDecide('policy', 'concur')}>Concur with policy</button>
        </div>
        <label style={{ display: 'block', marginBlockStart: 'var(--eye-space-8)' }}>Propose an entry (JSON)<textarea style={{ ...textareaStyle, minBlockSize: '8rem', inlineSize: '100%' }} value={proposal} onChange={(e) => setProposal(e.target.value)} /></label>
        <button type="button" style={buttonStyle} onClick={() => void onJson('propose')}>Propose</button>
      </section>

      <section aria-labelledby="t-h" style={section}>
        <h2 id="t-h" style={h2}>Targets</h2>
        {view.targets.length === 0 ? <Empty>No target is declared in this domain.</Empty> : (
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Target</Th><Th>Version</Th><Th>Kind</Th><Th>Unit</Th><Th>Title</Th><Th>State</Th><Th>Id</Th></tr></thead>
            <tbody>{view.targets.map((t) => <tr key={t.target_id}><Td mono>{t.target_key}</Td><Td mono>{t.version}</Td><Td>{t.kind}</Td><Td>{t.unit}</Td><Td>{t.title}</Td><Td>{t.state}</Td><Td mono>{t.target_id}</Td></tr>)}</tbody>
          </table>
        )}
        <label style={{ display: 'block' }}>Declare a target (JSON)<textarea style={{ ...textareaStyle, minBlockSize: '7rem', inlineSize: '100%' }} value={targetJson} onChange={(e) => setTargetJson(e.target.value)} /></label>
        <button type="button" style={buttonStyle} onClick={() => void onJson('target')}>Declare</button>
      </section>

      <section aria-labelledby="p-h" style={section}>
        <h2 id="p-h" style={h2}>Horizon policy</h2>
        {active.length === 0 ? <Empty>No horizon policy is active: the legacy rule applies (the statistical methods at every horizon, quantity forecasts only).</Empty> : active.map((p) => (
          <div key={p.policy_id}>
            <p><strong>{p.risk_class} v{p.version}</strong> — {p.statement}</p>
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Horizon</Th><Th>Treatment</Th><Th>Families</Th><Th>By kind: language · validation</Th></tr></thead>
              <tbody>{HORIZONS.map((h) => {
                const r = (p.rules[h] ?? null) as Record<string, unknown> | null;
                if (r === null) return <tr key={h}><Td mono>{h}</Td><Td>no rule — refused</Td><Td>—</Td><Td>—</Td></tr>;
                if (typeof r['unsupported'] === 'string') return <tr key={h}><Td mono>{h}</Td><Td>{String(r['treatment'] ?? '')}</Td><Td>—</Td><Td>UNSUPPORTED: {r['unsupported'] as string}</Td></tr>;
                const kinds = Object.entries((r['kinds'] ?? {}) as Record<string, Record<string, unknown>>);
                return <tr key={h}><Td mono>{h}</Td><Td>{String(r['treatment'] ?? '')}</Td><Td>{((r['allowed_families'] ?? []) as string[]).join(', ')}</Td>
                  <Td>{kinds.map(([k, v]) => `${k}: ${String(v['confidence_language'])} · ${(v['validation'] as Record<string, unknown> | undefined)?.['required'] === true ? `requires ${String((v['validation'] as Record<string, unknown>)['kind'])} ≥ ${String((v['validation'] as Record<string, unknown>)['min_origins'])} origins` : 'no validation required'}`).join('; ')}</Td></tr>;
              })}</tbody>
            </table>
          </div>
        ))}
        <label style={{ display: 'block' }}>Publish a policy version (JSON)<textarea style={{ ...textareaStyle, minBlockSize: '7rem', inlineSize: '100%' }} value={policyJson} onChange={(e) => setPolicyJson(e.target.value)} /></label>
        <button type="button" style={buttonStyle} onClick={() => void onJson('policy')}>Publish</button>
      </section>

      <section aria-labelledby="v-h" style={section}>
        <h2 id="v-h" style={h2}>Validations — per target and horizon</h2>
        {view.validations.length === 0 ? <Empty>No validation is recorded.</Empty> : (
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Method</Th><Th>Series</Th><Th>Horizon</Th><Th>Kind</Th><Th>Mode</Th><Th>Origins</Th><Th>Passed</Th><Th>Claim</Th><Th>Recorded</Th></tr></thead>
            <tbody>{view.validations.map((v) => <tr key={v.validation_id}><Td mono>{v.method_ref}</Td><Td>{v.series_key}</Td><Td mono>{v.horizon_code}</Td><Td>{v.kind}</Td><Td>{v.mode}</Td><Td mono>{v.origins} / {v.min_origins}</Td>
              <Td>{v.passed ? 'PASSED' : 'not passed'}</Td><Td>{v.synthetic ? 'synthetic demonstration' : v.passed ? 'empirical validation' : '—'}</Td><Td mono>{fmtInstant(v.computed_at)}</Td></tr>)}</tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="r-h" style={section}>
        <h2 id="r-h" style={h2}>Routes — planned, issued, refused</h2>
        {view.routes.length === 0 ? <Empty>No routed request yet.</Empty> : (
          <ul>{view.routes.map((r) => <li key={r.route_id}><Mono>{fmtInstant(r.requested_at)}</Mono> {r.target_key ?? r.series_key} at <Mono>{r.horizon_code}</Mono> — <strong>{r.outcome}</strong>{r.method_ref === null ? '' : ` by ${r.method_ref}`}{r.refusal === null ? '' : `: ${r.refusal}`}</li>)}</ul>
        )}
      </section>
    </>
  );
}
