'use client';
/**
 * CP-6 B29 §C (0092) — THE METHOD FABRIC panel of the Simulations screen: the method portfolio (seven registry rows — the six
 * families and supply-flow@1 — with their containment, the pinned digest and whether this server carries it, each adapter's health
 * in the domain), a twin's BINDINGS (bound and unbound by the twin's owner; the server refuses a family outside the twin's approved
 * uses), a METHOD-FABRIC RUN (a control run of a bound method with its parameters — executed out of process; the answer says where,
 * and §D's constraint verdict, an indeterminate one never shown as a pass) and, for a METHOD STEWARD, the probe and the
 * reinstatement of a quarantined adapter. The server decides every act; its refusal is shown verbatim. Every number is SYNTHETIC.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { twins as twinApi, type Twin } from '../../../lib/twins';
import { methods as api, containmentLine, familyLabel, healthLine, paramsTemplate, parseParams, summaryLines, verdictLine, type Binding, type MethodRow, type MethodRunAnswer } from '../../../lib/methods';
import { Empty, LiveStatus, Mono, cardStyle, GovernedButton, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type R = { policyDecisionId: string; auditSeq: number };
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;

export function MethodPanel() {
  const { scope, me, isTwinOwner, isSimulationOperator } = useShell();
  /* who may act — the server decides (the PDP rows, the ports' ownership and separation of duties); these flags only show the controls */
  const isMethodSteward = me.bindings.some((b) => (b.roleCode === 'method_steward' && b.scope === 'DOMAIN' && b.domainId === scope.domainId) || (b.roleCode === 'platform_admin' && b.scope === 'PLATFORM'));
  const [rows, setRows] = useState<MethodRow[] | null>(null);
  const [twinsList, setTwins] = useState<Twin[]>([]);
  const [twinId, setTwinId] = useState('');
  const [bindings, setBindings] = useState<Binding[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<R | null>(null);
  const [bindRef, setBindRef] = useState('');
  const [bindReason, setBindReason] = useState('');
  const [unbindReason, setUnbindReason] = useState('');
  const [runRef, setRunRef] = useState('');
  const [version, setVersion] = useState('');
  const [component, setComponent] = useState('bearing');
  const [horizon, setHorizon] = useState('42');
  const [seed, setSeed] = useState('');
  const [params, setParams] = useState('');
  const [answer, setAnswer] = useState<MethodRunAnswer | null>(null);
  const [runProblem, setRunProblem] = useState<string | null>(null);
  const [reinstateReason, setReinstateReason] = useState('');

  const load = async () => {
    const [m, t] = await Promise.all([api.list(scope), twinApi.list(scope)]);
    if (!m.ok || m.data === undefined) { setProblem(refusal(m, 'the method portfolio was not answered')); return; }
    setRows(m.data.methods);
    if (t.ok && t.data !== undefined) {
      setTwins(t.data.twins);
      if (twinId === '' && t.data.twins[0] !== undefined) setTwinId(t.data.twins[0].twin_id);
    }
  };
  const loadBindings = async (id: string) => {
    if (id === '') { setBindings([]); return; }
    const b = await api.bindings(scope, id);
    if (b.ok && b.data !== undefined) setBindings(b.data.bindings);
  };
  useEffect(() => { void load(); }, [scope]);
  useEffect(() => { void loadBindings(twinId); }, [scope, twinId]);
  const after = async (line: string, r: R) => { setLast(line); setReceipt(r); await load(); await loadBindings(twinId); };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rows === null) return <Empty>reading the method portfolio…</Empty>;
  const twin = twinsList.find((t) => t.twin_id === twinId);
  const admitted = (twin?.versions ?? []).filter((v) => v.state === 'admitted' && v.completeness === 'complete');
  const active = bindings.filter((b) => b.state === 'active');
  const runnable = twin === undefined ? [] : [twin.behaviour_model_ref, ...active.map((b) => b.model_ref)].filter((m) => m !== 'supply-flow@1');
  const bindable = rows.filter((m) => twin !== undefined && m.method_ref !== twin.behaviour_model_ref && !active.some((b) => b.model_ref === m.method_ref));
  const quarantined = rows.filter((m) => m.health.state === 'quarantined');

  return (
    <section aria-labelledby="methods-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
      <h2 id="methods-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Methods</h2>
      <p style={{ color: 'var(--eye-color-ink-muted)', marginBlockStart: 0 }}>
        The simulation methods this domain can run: each a pinned implementation of one family, run out of process under time and memory bounds.
        An adapter that faults repeatedly is quarantined here until a method steward probes it and reinstates it. These are the product&rsquo;s own
        in-process implementations — no external solver is connected.
      </p>
      <table style={tableStyle}>
        <thead><tr><Th>Method</Th><Th>Family</Th><Th>Containment</Th><Th>Implementation</Th><Th>Health in this domain</Th></tr></thead>
        <tbody>
          {rows.map((m) => {
            const hl = healthLine(m.health);
            return (
              <tr key={m.method_ref}>
                <Td mono>{m.method_ref}</Td>
                <Td>{familyLabel(m.family)}</Td>
                <Td>{containmentLine(m.containment)}</Td>
                <Td><Mono title={m.implementation_digest ?? 'no pinned implementation'}>{m.implementation_digest === null ? '—' : `${m.implementation_digest.slice(0, 12)}…`}</Mono>{' '}
                  {m.carried_digest_matches ? '· this server runs these bytes' : m.carried ? '· this server runs OTHER bytes — runs refused' : '· not carried by this server'}</Td>
                <Td><span style={{ color: `var(${hl.token})`, fontWeight: 650 }}><span aria-hidden="true">{hl.glyph}</span> {hl.text}</span></Td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Bindings</h3>
      <label>Twin<select style={inputStyle} value={twinId} onChange={(e) => { setTwinId(e.target.value); setVersion(''); setRunRef(''); }}>
        {twinsList.map((t) => <option key={t.twin_id} value={t.twin_id}>{t.title}</option>)}
      </select></label>
      {twin === undefined ? <Empty>no twin in this domain</Empty> : (
        <>
          <p>Its own behaviour model <Mono>{twin.behaviour_model_ref}</Mono> is bound implicitly.</p>
          {bindings.length === 0 ? <Empty>no other method has been bound to this twin</Empty> : (
            <table style={tableStyle}>
              <thead><tr><Th>Method</Th><Th>Family</Th><Th>State</Th><Th>Bound</Th><Th>Unbound</Th></tr></thead>
              <tbody>{bindings.map((b) => (
                <tr key={b.binding_id}>
                  <Td mono>{b.model_ref}</Td><Td>{familyLabel(b.family)}</Td><Td>{b.state}</Td><Td>{b.bound_at}{b.reason === null ? '' : ` — ${b.reason}`}</Td>
                  <Td>{b.unbound_at === null ? '—' : `${b.unbound_at} — ${b.unbind_reason ?? ''}`}</Td>
                </tr>))}
              </tbody>
            </table>
          )}
          {isTwinOwner ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-8)' }}>
              <label>Bind a method<select style={inputStyle} value={bindRef} onChange={(e) => setBindRef(e.target.value)}>
                <option value="">choose</option>{bindable.map((m) => <option key={m.method_ref} value={m.method_ref}>{m.method_ref} ({familyLabel(m.family)})</option>)}
              </select></label>
              <label>Why (optional)<input type="text" style={inputStyle} value={bindReason} onChange={(e) => setBindReason(e.target.value)} /></label>
              <GovernedButton label="Bind" pendingLabel="binding" disabled={bindRef === ''} onRun={async () => {
                const r = await api.bind(scope, twinId, bindRef, bindReason.trim());
                if (!r.ok || r.data === undefined) { const m = refusal(r, 'the binding was not answered'); setLast(`not bound — ${m}`); throw new Error(m); }
                setBindRef(''); setBindReason('');
                await after(`${r.data.binding.model_ref} bound to ${twin.title}`, r.data.receipt);
              }} />
              <label>Unbind — why (8+ characters)<input type="text" style={inputStyle} value={unbindReason} onChange={(e) => setUnbindReason(e.target.value)} /></label>
              {active.map((b) => (
                <GovernedButton key={b.binding_id} variant="quiet" label={`Unbind ${b.model_ref}`} pendingLabel="unbinding" disabled={unbindReason.trim().length < 8} onRun={async () => {
                  const r = await api.unbind(scope, twinId, b.model_ref, unbindReason.trim());
                  if (!r.ok || r.data === undefined) { const m = refusal(r, 'the unbinding was not answered'); setLast(`not unbound — ${m}`); throw new Error(m); }
                  setUnbindReason('');
                  await after(`${b.model_ref} unbound from ${twin.title}`, r.data.receipt);
                }} />
              ))}
            </div>
          ) : null}
        </>
      )}

      {isSimulationOperator && twin !== undefined ? (
        <>
          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Run a method</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--eye-space-8)' }}>
            <label>Method<select style={inputStyle} value={runRef} onChange={(e) => { setRunRef(e.target.value); setParams(paramsTemplate(e.target.value)); }}>
              <option value="">choose</option>{runnable.map((m) => <option key={m} value={m}>{m}</option>)}
            </select></label>
            <label>Admitted, complete version<select style={inputStyle} value={version} onChange={(e) => setVersion(e.target.value)}>
              <option value="">choose</option>{admitted.map((v) => <option key={v.version} value={String(v.version)}>v{v.version} · {v.branch_id}</option>)}
            </select></label>
            <label>Component<input type="text" style={inputStyle} value={component} onChange={(e) => setComponent(e.target.value)} /></label>
            <label>Horizon (days or turns)<input type="number" min={1} max={365} style={inputStyle} value={horizon} onChange={(e) => setHorizon(e.target.value)} /></label>
            <label>Seed (empty: deterministic)<input type="number" style={inputStyle} value={seed} onChange={(e) => setSeed(e.target.value)} /></label>
          </div>
          <label>Parameters (JSON — the method&rsquo;s adapter judges them)<textarea style={{ ...textareaStyle, fontFamily: 'var(--eye-font-mono, monospace)' }} rows={6} value={params} onChange={(e) => setParams(e.target.value)} /></label>
          <GovernedButton label="Run" pendingLabel="running out of process" disabled={runRef === '' || version === ''} onRun={async () => {
            setRunProblem(null); setAnswer(null);
            const parsed = parseParams(params);
            if (!parsed.ok) { setRunProblem(parsed.problem); throw new Error(parsed.problem); }
            const r = await api.run(scope, {
              twinId, twinVersion: Number(version), runKind: 'control', controlRunId: null, shock: false, component: component.trim(), interventions: [{ type: 'none' }],
              horizonDays: Number(horizon), stochastic: seed.trim() === '' ? { mode: 'deterministic' } : { mode: 'seeded', seed: Number(seed), samples: 1, jitter: {} },
              modelRef: runRef, params: parsed.value,
            });
            if (!r.ok || r.data === undefined) { const m = refusal(r, 'the run was not answered'); setRunProblem(m); await load(); throw new Error(m); }
            setAnswer(r.data.run);
            await after(`run ${r.data.run.runId.slice(0, 8)}… of ${r.data.run.modelRef} completed`, r.data.receipt);
          }} />
          {runProblem !== null ? <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not run — {runProblem}</span></LiveStatus> : null}
          {answer === null ? null : (
            <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
              <p><strong>SYNTHETIC</strong> — run <Mono>{answer.runId}</Mono> of <Mono>{answer.modelRef}</Mono>, {answer.days} steps,{' '}
                {answer.isolated ? `executed out of process (pid ${String(answer.pid)})` : 'executed in process'}; outputs digest <Mono>{answer.outputsDigest.slice(0, 16)}…</Mono></p>
              <p>At opening: {verdictLine(answer.openingConstraint)}. On the outputs: {verdictLine(answer.constraint)}.</p>
              <table style={tableStyle}><tbody>{summaryLines(answer.summary).map(([k, v]) => <tr key={k}><Th>{k}</Th><Td>{v}</Td></tr>)}</tbody></table>
            </div>
          )}
        </>
      ) : null}

      {isMethodSteward ? (
        <>
          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Quarantined adapters</h3>
          {quarantined.length === 0 ? <Empty>no adapter is quarantined in this domain</Empty> : (
            <>
              <label>Reason for a reinstatement (8+ characters)<input type="text" style={inputStyle} value={reinstateReason} onChange={(e) => setReinstateReason(e.target.value)} /></label>
              {quarantined.map((m) => (
                <div key={m.method_ref} style={{ display: 'flex', gap: 'var(--eye-space-8)', alignItems: 'center', marginBlockStart: 'var(--eye-space-8)' }}>
                  <Mono>{m.method_ref}</Mono>
                  <GovernedButton variant="quiet" label="Probe" pendingLabel="probing out of process" onRun={async () => {
                    const r = await api.probe(scope, m.method_ref);
                    if (!r.ok || r.data === undefined) { const x = refusal(r, 'the probe was not answered'); setLast(`not probed — ${x}`); throw new Error(x); }
                    await after(`probe of ${m.method_ref}: ${r.data.probe.passed ? 'passed' : 'FAILED (a fault)'}`, r.data.receipt);
                  }} />
                  <GovernedButton variant="critical" label="Reinstate" pendingLabel="reinstating" disabled={reinstateReason.trim().length < 8} onRun={async () => {
                    const r = await api.reinstate(scope, m.method_ref, reinstateReason.trim());
                    if (!r.ok || r.data === undefined) { const x = refusal(r, 'the reinstatement was not answered'); setLast(`not reinstated — ${x}`); throw new Error(x); }
                    setReinstateReason('');
                    await after(`${m.method_ref} reinstated`, r.data.receipt);
                  }} />
                </div>
              ))}
            </>
          )}
        </>
      ) : null}
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
      <Receipt receipt={receipt} />
    </section>
  );
}
