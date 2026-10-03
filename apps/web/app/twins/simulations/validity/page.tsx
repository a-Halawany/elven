'use client';
/**
 * Simulation validity — CP-6 B31 part `validity` (0099 §V; F-P5-09; the B31 pieces of F-P4-07/-09).
 *
 * THE DECISION USE: every run reads DECISION-GRADE, DIAGNOSTIC ONLY (partial, unpromoted, challenged, on a suspended or failing scenario) or
 * REFUSED FOR DECISION (invalidated, failed, unfinished), with the server's reasons; a comparison says whether it rests on decision-grade
 * results only. THE PACKAGE: each option's cited runs with their validity — an option citing an invalidated run is marked INPUT
 * INVALIDATED and is refused at its next derivation. THE POLICY: the domain's decision-use gate (a named person sets it). THE REACH: what a
 * corrected twin version reaches — runs, packages, commitments, evaluation results — and the owners tasked. THE BRANCH: its binding to a
 * baseline twin state, initial conditions, a constraint set and the factors its assumptions move; the sensitivity to its material
 * assumptions. Every value is the server's and SYNTHETIC on the demonstration.
 */
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useShell } from '../../layout';
import { prediction, type ScenarioRow } from '../../../../lib/prediction';
import { validity, conditionsOf, factorsOf, optionMarkLine, reasonsLine, useMark, type AssumptionSensitivity, type BindingView, type PackageValidity, type Policy, type Reach,
  type RunRow, type RunUse, type Verdict } from '../../../../lib/validity-b31';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, GovernedButton, fmtInstant, textareaStyle } from '../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 } as const;
const section = { ...cardStyle, marginBlockStart: 'var(--eye-space-16)' } as const;
// B31 walk-found: a uuidv7's first 8 characters are its timestamp, shared by runs opened together — the label carries the tail too.
const short = (id: string | null | undefined) => (id === null || id === undefined ? '—' : `${id.slice(0, 8)}…${id.slice(-6)}`);
const failed = (r: { ok: boolean; status: number; error?: { code: string; message: string } }, what: string) =>
  new Error(`HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? `${what} was refused`}`);

function UseBadge({ use }: { use: string }) {
  const m = useMark(use);
  return <span style={{ color: `var(${m.token})`, fontWeight: 650 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}

export default function ValidityPage() {
  return <Suspense fallback={null}><Validity /></Suspense>;
}

function Validity() {
  const { scope, isTwinOwner, isStrategyOwner } = useShell();
  const params = useSearchParams();
  const [runs, setRuns] = useState<RunRow[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [runId, setRunId] = useState<string>(params.get('run') ?? '');
  const [use, setUse] = useState<{ use: RunUse; assumptionSensitivity: AssumptionSensitivity | null } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [verdict, setVerdict] = useState<{ runs: RunUse[]; verdict: Verdict } | null>(null);
  const [packageId, setPackageId] = useState<string>(params.get('package') ?? '');
  const [pkg, setPkg] = useState<PackageValidity | null>(null);
  const [pkgProblem, setPkgProblem] = useState<string | null>(null);
  const [policy, setPolicy] = useState<{ current: Policy | null; history: Policy[] } | null>(null);
  const [require, setRequire] = useState(true);
  const [rationale, setRationale] = useState('');
  const [twinId, setTwinId] = useState<string>(params.get('twin') ?? '');
  const [twinVersion, setTwinVersion] = useState<string>(params.get('version') ?? '');
  const [reaches, setReaches] = useState<{ reaches: Reach[]; now: Record<string, unknown> | null } | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [branchId, setBranchId] = useState<string>(params.get('branch') ?? '');
  const [binding, setBinding] = useState<BindingView | null>(null);
  const [bTwin, setBTwin] = useState(''); const [bVersion, setBVersion] = useState(''); const [bConds, setBConds] = useState(''); const [bSet, setBSet] = useState('');
  const [bFactors, setBFactors] = useState(''); const [bRationale, setBRationale] = useState(''); const [bRetire, setBRetire] = useState('');

  const loadRuns = async () => {
    const r = await validity.runs(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the runs could not be read'); return; }
    setProblem(null); setRuns(r.data.runs);
  };
  const loadUse = async () => {
    if (runId === '') { setUse(null); return; }
    const r = await validity.use(scope, runId);
    setUse(r.ok && r.data !== undefined ? { use: r.data.use, assumptionSensitivity: r.data.assumptionSensitivity } : null);
  };
  const loadPolicy = async () => { const r = await validity.policy(scope); if (r.ok && r.data !== undefined) setPolicy({ current: r.data.current, history: r.data.history }); };
  const loadPackage = async () => {
    if (packageId.trim() === '') { setPkg(null); return; }
    const r = await validity.packageValidity(scope, packageId.trim());
    if (!r.ok || r.data === undefined) { setPkg(null); setPkgProblem(r.error?.message ?? 'the package could not be read'); return; }
    setPkgProblem(null); setPkg(r.data.package);
  };
  const loadReach = async () => {
    const v = Number(twinVersion);
    const r = await validity.reaches(scope, twinId.trim() === '' ? {} : { twinId: twinId.trim(), ...(Number.isInteger(v) && v > 0 ? { version: v } : {}) });
    if (r.ok && r.data !== undefined) setReaches({ reaches: r.data.reaches, now: r.data.now });
  };
  const loadBinding = async () => {
    if (branchId === '') { setBinding(null); return; }
    const r = await validity.binding(scope, branchId);
    setBinding(r.ok && r.data !== undefined ? r.data.binding : null);
  };
  useEffect(() => {
    void loadRuns(); void loadPolicy(); void loadReach();
    void prediction.listScenarios(scope).then((r) => { if (r.ok && r.data !== undefined) setScenarios(r.data.scenarios.filter((s) => s.state === 'active')); });
  }, [scope]);
  useEffect(() => { void loadUse(); }, [scope, runId]);
  useEffect(() => { void loadPackage(); }, [scope]);
  useEffect(() => { void loadBinding(); }, [scope, branchId]);

  const after = async (r: { policyDecisionId: string; auditSeq: number }) => { setReceipt(r); await Promise.all([loadRuns(), loadPolicy(), loadReach(), loadBinding(), loadPackage()]); };

  if (problem !== null && runs === null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (runs === null) return <Empty>reading runs…</Empty>;
  const branches = scenarios.flatMap((s) => s.branches.filter((b) => b.state !== 'closed').map((b) => ({ ...b, scenarioTitle: s.title })));

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Simulation validity</h1>
      <p style={muted}>
        A result is decision-grade only when it is completed, valid, promoted by a reviewer other than its operator and undisputed. A partial or
        unpromoted result is diagnostic only; an invalidated, failed or unfinished one is refused for decision use. The values are the server&apos;s
        (SYNTHETIC on the demonstration).
      </p>
      <Receipt receipt={receipt} />

      <section aria-labelledby="v-runs" style={section}>
        <h2 id="v-runs" style={h2}>Runs and their decision use</h2>
        {runs.length === 0 ? <Empty>No run is recorded in this domain.</Empty> : (
          <ScrollBox label="runs with their decision use">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Compare</Th><Th>Run</Th><Th>Kind</Th><Th>State</Th><Th>Decision use</Th><Th>Why</Th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.run_id}>
                    <Td><input type="checkbox" aria-label={`compare run ${short(r.run_id)}`} checked={selected.includes(r.run_id)}
                      onChange={(e) => setSelected((s) => (e.target.checked ? [...s, r.run_id] : s.filter((x) => x !== r.run_id)))} /></Td>
                    <Td><button type="button" onClick={() => setRunId(r.run_id)} aria-label={`open run ${r.run_id}`}><Mono>{short(r.run_id)}</Mono></button></Td>
                    <Td>{r.run_kind}</Td>
                    <Td>{r.state}{r.validity === 'invalidated' ? <strong> · INVALIDATED</strong> : null}</Td>
                    <Td><UseBadge use={r.decision_use.use} /></Td>
                    <Td><span style={small}>{r.decision_use.label}</span></Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollBox>
        )}
        <GovernedButton label="Compare the selected runs" pendingLabel="comparing…" disabled={selected.length === 0} onRun={async () => {
          const r = await validity.compare(scope, selected);
          if (!r.ok || r.data === undefined) throw failed(r, 'the comparison');
          setVerdict({ runs: r.data.runs, verdict: r.data.verdict }); setReceipt(r.data.receipt);
        }} />
        {verdict !== null ? <p role="status" style={{ fontWeight: 650 }}>{verdict.verdict.label}</p> : null}
      </section>

      {use !== null ? (
        <section aria-labelledby="v-run" style={section}>
          <h2 id="v-run" style={h2}>Run <Mono>{short(use.use.run_id)}</Mono></h2>
          <p role="status"><UseBadge use={use.use.use} /> — {use.use.label}</p>
          <DefinitionRow term="Reasons">{reasonsLine(use.use.reasons)}</DefinitionRow>
          <DefinitionRow term="State">{use.use.state} · {use.use.validity} · fitness {use.use.fitness_state}</DefinitionRow>
          {use.use.promoted_for !== null ? <DefinitionRow term="Promoted for">{use.use.promoted_for}</DefinitionRow> : null}
          {use.use.invalidated_at !== null ? <DefinitionRow term="Invalidated">{fmtInstant(use.use.invalidated_at)} — {String(use.use.invalidation?.['trigger'] ?? '')}: {String(use.use.invalidation?.['reason'] ?? '')}</DefinitionRow> : null}
          {use.assumptionSensitivity !== null && use.assumptionSensitivity.assumptions.length > 0 ? (
            <>
              <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Sensitivity to the branch&apos;s critical assumptions</h3>
              <p style={small}>Factors from {use.assumptionSensitivity.source === 'analysis' ? 'the latest sensitivity analysis' : 'the run\'s own one-at-a-time sensitivity'}.</p>
              <table className="eye-table" style={tableStyle}>
                <thead><tr><Th>Assumption</Th><Th>Condition met</Th><Th>Factor</Th><Th>Rank</Th><Th>Reading</Th></tr></thead>
                <tbody>{use.assumptionSensitivity.assumptions.map((a) => (
                  <tr key={a.assumption_id}><Td>{a.title}</Td><Td>{a.condition_met ? 'YES' : 'no'}</Td><Td>{a.factor_key ?? '—'}</Td><Td>{a.rank ?? '—'}</Td>
                    <Td>{a.material === true ? <strong>{a.note}</strong> : a.note}</Td></tr>
                ))}</tbody>
              </table>
            </>
          ) : null}
        </section>
      ) : null}

      <section aria-labelledby="v-pkg" style={section}>
        <h2 id="v-pkg" style={h2}>A package&apos;s inputs</h2>
        <label htmlFor="v-pkg-id" style={{ display: 'block' }}>Package id</label>
        <input id="v-pkg-id" style={inputStyle} value={packageId} onChange={(e) => setPackageId(e.target.value)} />
        <GovernedButton label="Read the package's run validity" pendingLabel="reading…" disabled={packageId.trim() === ''} onRun={loadPackage} />
        {pkgProblem !== null ? <LiveStatus assertive>{pkgProblem}</LiveStatus> : null}
        {pkg !== null ? (
          <>
            <p role="status" style={{ fontWeight: 650, color: pkg.input_invalidated ? 'var(--eye-color-critical)' : 'var(--eye-color-ink-default)' }}>
              {pkg.title} — {pkg.state}{pkg.input_invalidated ? ' — INPUT INVALIDATED' : ''}
            </p>
            {pkg.versions.map((v) => (
              <div key={v.version}>
                <p style={small}>Version {v.version} ({v.state}) · recommended option {v.recommended_option ?? '—'}</p>
                <table className="eye-table" style={tableStyle}>
                  <thead><tr><Th>Option</Th><Th>Cited runs</Th><Th>Mark</Th></tr></thead>
                  <tbody>{v.options.map((o) => (
                    <tr key={o.option_id}>
                      <Td>{o.title} <Mono>{o.key}</Mono>{o.recommended ? <strong> (recommended)</strong> : null}</Td>
                      <Td>{o.runs.length === 0 ? <span style={muted}>none</span> : o.runs.map((r) => <div key={r.run_id}><Mono>{short(r.run_id)}</Mono> <UseBadge use={r.use} /> {r.validity === 'invalidated' ? <strong>INVALIDATED</strong> : null}</div>)}</Td>
                      <Td>{optionMarkLine(o.marked, o.refused_on_next_derivation)}</Td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ))}
          </>
        ) : null}
      </section>

      <section aria-labelledby="v-policy" style={section}>
        <h2 id="v-policy" style={h2}>The domain&apos;s decision-use policy</h2>
        {policy?.current === null || policy === null ? <p style={muted}>No policy is set: a package may still cite a diagnostic result (each is labelled).</p> : (
          <DefinitionRow term={`Version ${policy.current.version}`}>{policy.current.require_decision_use ? 'A DECISION-GRADE result is required at proposal and commitment' : 'Not required'} — {policy.current.rationale} (set {fmtInstant(policy.current.set_at)} by <Mono>{short(policy.current.set_by)}</Mono>)</DefinitionRow>
        )}
        <label style={{ display: 'block' }}><input type="checkbox" checked={require} onChange={(e) => setRequire(e.target.checked)} /> Require a decision-grade result</label>
        <label htmlFor="v-policy-why" style={{ display: 'block' }}>Rationale</label>
        <textarea id="v-policy-why" style={textareaStyle} value={rationale} onChange={(e) => setRationale(e.target.value)} />
        <GovernedButton label="Set the policy" pendingLabel="setting…" disabled={rationale.trim().length < 16} onRun={async () => {
          const r = await validity.setPolicy(scope, { require, rationale: rationale.trim(), expectedVersion: policy?.current?.version ?? null });
          if (!r.ok || r.data === undefined) throw failed(r, 'the policy');
          setRationale(''); await after(r.data.receipt);
        }} />
      </section>

      <section aria-labelledby="v-reach" style={section}>
        <h2 id="v-reach" style={h2}>The reach of a twin correction</h2>
        <label htmlFor="v-twin" style={{ display: 'block' }}>Twin id</label>
        <input id="v-twin" style={inputStyle} value={twinId} onChange={(e) => setTwinId(e.target.value)} />
        <label htmlFor="v-twin-version" style={{ display: 'block' }}>Version</label>
        <input id="v-twin-version" style={inputStyle} inputMode="numeric" value={twinVersion} onChange={(e) => setTwinVersion(e.target.value)} />
        <GovernedButton label="Read the reach" pendingLabel="reading…" onRun={loadReach} />
        {isTwinOwner ? (
          <GovernedButton label="Identify the reach again" pendingLabel="identifying…" disabled={twinId.trim() === '' || !(Number(twinVersion) > 0)} onRun={async () => {
            const r = await validity.identifyReach(scope, twinId.trim(), Number(twinVersion));
            if (!r.ok || r.data === undefined) throw failed(r, 'the identification');
            await after(r.data.receipt);
          }} />
        ) : null}
        {reaches === null || reaches.reaches.length === 0 ? <p style={muted}>No correction&apos;s reach is recorded{twinId.trim() === '' ? '' : ' for this twin'}.</p> : (
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Identified</Th><Th>Twin version</Th><Th>Runs</Th><Th>Packages</Th><Th>Commitments</Th><Th>Evaluation results</Th><Th>Owners tasked</Th></tr></thead>
            <tbody>{reaches.reaches.map((x) => (
              <tr key={x.reach_id}>
                <Td>{fmtInstant(x.identified_at)} ({x.trigger.replace('_', ' ')})</Td><Td><Mono>{short(x.twin_id)}</Mono> v{x.twin_version}</Td><Td>{x.runs.length}</Td>
                <Td>{x.packages.map((p) => String(p['title'])).join(' · ') || '—'}</Td><Td>{x.commitments.length}</Td>
                <Td>{x.evaluation_results.outcomes.length} outcome(s) · {x.evaluation_results.twin_validations.length} validation(s)</Td><Td>{x.items.length}</Td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>

      <section aria-labelledby="v-branch" style={section}>
        <h2 id="v-branch" style={h2}>A branch&apos;s twin binding</h2>
        <label htmlFor="v-branch-id" style={{ display: 'block' }}>Branch</label>
        <select id="v-branch-id" style={inputStyle} value={branchId} onChange={(e) => setBranchId(e.target.value)}>
          <option value="">— choose a branch —</option>
          {branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.scenarioTitle} — {b.name} ({b.state})</option>)}
        </select>
        {binding === null ? null : binding.active === null ? <p style={muted}>Branch &quot;{binding.branch.name}&quot; is not bound: its runs are not held to a state.</p> : (
          <>
            <DefinitionRow term={`Bound (v${binding.active.version})`}>twin <Mono>{short(binding.active.twin_id)}</Mono> version {binding.active.twin_version} · state <Mono>{binding.active.initial_state_digest.slice(0, 12)}…</Mono></DefinitionRow>
            <DefinitionRow term="Initial conditions">{binding.active.initial_conditions.map((c) => `${c.key} = ${JSON.stringify(c.value)}${c.unit ? ` ${c.unit}` : ''}`).join(' · ')}</DefinitionRow>
            <DefinitionRow term="Constraint set">{binding.active.constraint_set_id === null ? 'none' : <><Mono>{short(binding.active.constraint_set_id)}</Mono> v{binding.active.constraint_set_version}</>}</DefinitionRow>
            <DefinitionRow term="Assumption factors">{binding.active.assumption_factors.length === 0 ? 'none mapped' : binding.active.assumption_factors.map((f) => `${short(f.assumption_id)} → ${f.factor_key}`).join(' · ')}</DefinitionRow>
            <DefinitionRow term="Runs on the branch">{binding.runs.length === 0 ? 'none' : binding.runs.map((r) => `${short(r.run_id)} ${r.from_bound_state ? 'from the bound state' : 'NOT from the bound state'}`).join(' · ')}</DefinitionRow>
          </>
        )}
        {branchId !== '' && (isStrategyOwner || isTwinOwner) ? (
          <div>
            <label htmlFor="v-b-twin" style={{ display: 'block' }}>Twin id</label>
            <input id="v-b-twin" style={inputStyle} value={bTwin} onChange={(e) => setBTwin(e.target.value)} />
            <label htmlFor="v-b-version" style={{ display: 'block' }}>Twin version</label>
            <input id="v-b-version" style={inputStyle} inputMode="numeric" value={bVersion} onChange={(e) => setBVersion(e.target.value)} />
            <label htmlFor="v-b-conds" style={{ display: 'block' }}>Initial conditions (one key=value per line; a bare key takes the bound state&apos;s value)</label>
            <textarea id="v-b-conds" style={textareaStyle} value={bConds} onChange={(e) => setBConds(e.target.value)} />
            <label htmlFor="v-b-set" style={{ display: 'block' }}>Constraint set id (optional)</label>
            <input id="v-b-set" style={inputStyle} value={bSet} onChange={(e) => setBSet(e.target.value)} />
            <label htmlFor="v-b-factors" style={{ display: 'block' }}>Assumption factors (one assumptionId=factorKey per line)</label>
            <textarea id="v-b-factors" style={textareaStyle} value={bFactors} onChange={(e) => setBFactors(e.target.value)} />
            <label htmlFor="v-b-why" style={{ display: 'block' }}>Rationale</label>
            <textarea id="v-b-why" style={textareaStyle} value={bRationale} onChange={(e) => setBRationale(e.target.value)} />
            <GovernedButton label={binding?.active ? 'Rebind the branch' : 'Bind the branch'} pendingLabel="binding…" disabled={bTwin.trim() === '' || !(Number(bVersion) > 0) || bRationale.trim().length < 8} onRun={async () => {
              const r = await validity.bind(scope, branchId, { twinId: bTwin.trim(), twinVersion: Number(bVersion), initialConditions: conditionsOf(bConds), constraintSetId: bSet.trim() === '' ? null : bSet.trim(),
                assumptionFactors: factorsOf(bFactors), rationale: bRationale.trim(), expectedVersion: binding?.active?.version ?? null });
              if (!r.ok || r.data === undefined) throw failed(r, 'the binding');
              setBRationale(''); await after(r.data.receipt);
            }} />
            {binding?.active ? (
              <>
                <label htmlFor="v-b-retire" style={{ display: 'block' }}>Reason to retire the binding</label>
                <textarea id="v-b-retire" style={textareaStyle} value={bRetire} onChange={(e) => setBRetire(e.target.value)} />
                <GovernedButton label="Retire the binding" pendingLabel="retiring…" disabled={bRetire.trim().length < 16} onRun={async () => {
                  const r = await validity.retire(scope, branchId, bRetire.trim());
                  if (!r.ok || r.data === undefined) throw failed(r, 'the retirement');
                  setBRetire(''); await after(r.data.receipt);
                }} />
              </>
            ) : null}
          </div>
        ) : null}
      </section>
    </>
  );
}
