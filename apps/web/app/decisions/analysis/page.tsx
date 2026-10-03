'use client';
/**
 * Decision analysis — CP-6 B35 part `analysis` (migration 0101 §A; F-P6-01, F-P5-07's adversarial-response sensitivity and the value of
 * information on the decision page, F-P4-08's reversibility and option value across futures).
 *
 * Every number here is the SERVER's (decision.package_analysis): the criteria with their EXPOSED weights and the named owner of the value
 * judgment, the assessments with their basis (computed from a cited record, or entered by a person with its basis), the scores and the
 * ranking, the WEIGHT SENSITIVITY (the weight at which another option takes the lead), the trade-offs, the constraints and stakeholder
 * obligations evaluated per option, the value of information, the validated second-order effects of the cited runs, robustness and regret
 * across the reviewed futures, the adversarial rank changes, the generated candidates and the assembled inputs. The forms are shown to
 * everyone; the server decides who may (a weight is a named human's value judgment, never an agent's) and its refusal is shown as stated.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import {
  analysisApi as api, POSTURES, flipWords, mergedWeights, rankChangeWords, resultMark, testWords,
  type Actor, type PackageAnalysis, type PackageRow,
} from '../../../lib/analysis-b35';
import { Empty, LiveStatus, Mono, cardStyle, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const short = (v: string | null | undefined) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : (v ?? '—'));
const section = { ...cardStyle, marginBlockStart: 'var(--eye-space-16)' } as const;
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)', alignItems: 'end' } as const;

function Mark({ m }: { m: { glyph: string; token: string; text: string } }) {
  return <span style={{ color: `var(${m.token})`, border: `1px solid var(${m.token})`, borderRadius: 'var(--eye-radius-sm)', paddingInline: 'var(--eye-space-4)', fontSize: 'var(--eye-type-label-sm)', fontWeight: 650, whiteSpace: 'nowrap' }}>
    <span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}

export default function AnalysisPage() {
  const { scope, me } = useShell();
  const [rows, setRows] = useState<PackageRow[] | null>(null);
  const [pkg, setPkg] = useState<string>('');
  const [a, setA] = useState<PackageAnalysis | null>(null);
  const [actors, setActors] = useState<Actor[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  // the weights editor
  const [typed, setTyped] = useState<Record<string, string>>({});
  const [rationale, setRationale] = useState('');
  const [criteriaJson, setCriteriaJson] = useState('');
  // an assessment
  const [aOption, setAOption] = useState(''); const [aCriterion, setACriterion] = useState(''); const [aValue, setAValue] = useState(''); const [aBasis, setABasis] = useState('');
  const [aKind, setAKind] = useState('entered'); const [aCitedId, setACitedId] = useState(''); const [aMeasure, setAMeasure] = useState('');
  // an obligation
  const [oKey, setOKey] = useState(''); const [oKind, setOKind] = useState('obligation'); const [oStakeholder, setOStakeholder] = useState(''); const [oStatement, setOStatement] = useState('');
  const [oCriterion, setOCriterion] = useState(''); const [oOp, setOOp] = useState('<='); const [oValue, setOValue] = useState(''); const [oJudgment, setOJudgment] = useState(false);
  // an adversarial response
  const [rOption, setROption] = useState(''); const [rActor, setRActor] = useState(''); const [rResponse, setRResponse] = useState(''); const [rEffects, setREffects] = useState(''); const [rBasis, setRBasis] = useState('');

  const load = async () => {
    const r = await api.list(scope);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the packages could not be read')); return; }
    setRows(r.data.packages);
  };
  useEffect(() => { void load(); }, [scope]);
  const open = async (id: string) => {
    setPkg(id); setStatus(null);
    if (id === '') { setA(null); return; }
    const r = await api.read(scope, id);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the analysis could not be read')); setA(null); return; }
    setProblem(null); setA(r.data.analysis); setActors(r.data.actors); setTyped({});
  };
  const done = async (r: { ok: boolean; status: number; error?: { code: string; message: string }; data?: { receipt: ReceiptT } }, what: string) => {
    if (!r.ok) { setStatus(refusal(r, `${what} was refused`)); return; }
    setStatus(`${what} recorded`); setReceipt(r.data?.receipt ?? null);
    await open(pkg);
  };

  if (problem !== null && rows === null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rows === null) return <Empty>reading packages…</Empty>;
  const v = a?.version.version ?? null;
  const optionKeys = a?.options.map((o) => o.key) ?? [];
  const criterionKeys = a?.criteria.map((c) => c.key) ?? [];

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Decision analysis</h1>
      <p style={{ fontSize: 'var(--eye-type-label-sm)', ...muted }}>
        Options scored against explicit criteria whose weights are shown and owned by a named person; the weight at which the ranking changes; trade-offs, obligations,
        the value of information and the futures. The analysis informs the choice; it never makes it.
      </p>
      <label htmlFor="dsa-pkg" style={{ display: 'block' }}>Package</label>
      <select id="dsa-pkg" value={pkg} onChange={(e) => void open(e.target.value)} style={inputStyle}>
        <option value="">— choose a package —</option>
        {rows.map((r) => <option key={r.package_id} value={r.package_id}>{r.title} · {r.state}{r.current_version !== null ? ` · v${r.current_version}` : ''}</option>)}
      </select>
      {problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : null}
      {status !== null ? <LiveStatus>{status}</LiveStatus> : null}
      <Receipt receipt={receipt} />

      {a === null || v === null ? null : (
        <>
          <section aria-labelledby="dsa-rank" style={section}>
            <h2 id="dsa-rank" style={h2}>{a.package.title} — version {v} ({a.version.state})</h2>
            {a.package.synthetic_state ? <p><strong style={{ color: 'var(--eye-color-critical)' }}>SYNTHETIC</strong></p> : null}
            <p style={muted}>{a.method}</p>
            {a.criteria.length === 0 ? <Empty>No criteria yet: the owner sets them below.</Empty> : (
              <table className="eye-table" style={tableStyle}>
                <caption style={{ captionSide: 'top', textAlign: 'start', ...muted }}>Criteria set v{a.criteria_version} — weights are a value judgment owned by <Mono>{short(a.criteria[0]?.value_owner)}</Mono></caption>
                <thead><tr><Th>Rank</Th><Th>Option</Th><Th>Score</Th>{a.criteria.map((c) => <Th key={c.key}>{c.title} ({c.direction === 'max' ? '↑' : '↓'} {c.unit}; weight {String(c.weight)})</Th>)}</tr></thead>
                <tbody>
                  {a.options.map((o) => (
                    <tr key={o.key}>
                      <Td mono>{o.rank ?? '—'}</Td>
                      <Td>{o.title} <Mono>{o.key}</Mono></Td>
                      <Td mono>{o.score === null ? `not ranked (missing ${o.missing.join(', ')})` : String(o.score)}</Td>
                      {a.criteria.map((c) => <Td key={c.key} mono>{o.values[c.key] === undefined || o.values[c.key] === null ? '—' : `${String(o.values[c.key])} (${o.bases[c.key] ?? '—'})`}</Td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section aria-labelledby="dsa-sens" style={section}>
            <h2 id="dsa-sens" style={h2}>Weight sensitivity</h2>
            {a.sensitivity.criteria.length === 0 ? <Empty>{a.sensitivity.note ?? 'Nothing to show yet.'}</Empty> : (
              <>
                <p>Leader: <strong>{a.sensitivity.leader}</strong>{a.sensitivity.most_sensitive !== null ? <> · the ranking is most sensitive to <strong>{a.sensitivity.most_sensitive}</strong> ({String(a.sensitivity.most_sensitive_change_pct)}% away)</> : null}</p>
                <table className="eye-table" style={tableStyle}>
                  <thead><tr><Th>Criterion</Th><Th>Weight</Th><Th>Raising it</Th><Th>Lowering it</Th><Th>First swap of any pair</Th></tr></thead>
                  <tbody>{a.sensitivity.criteria.map((c) => (
                    <tr key={c.key}><Td>{c.title}</Td><Td mono>{String(c.weight)}</Td><Td>{flipWords(c.flip_up, 'up')}</Td><Td>{flipWords(c.flip_down, 'down')}</Td>
                      <Td>{c.order_up !== null ? `↑ at ${String(c.order_up.weight)}: ${c.order_up.between.join(' / ')}` : '↑ none'}; {c.order_down !== null ? `↓ at ${String(c.order_down.weight)}: ${c.order_down.between.join(' / ')}` : '↓ none'}</Td></tr>
                  ))}</tbody>
                </table>
              </>
            )}
            <h3 style={h3}>Change the weights</h3>
            <div style={grid}>
              {a.criteria.map((c) => (
                <div key={c.key}><label htmlFor={`w-${c.key}`} style={{ display: 'block' }}>Weight of {c.title}</label>
                  <input id={`w-${c.key}`} type="number" min="0" step="any" placeholder={String(c.weight)} value={typed[c.key] ?? ''} onChange={(e) => setTyped({ ...typed, [c.key]: e.target.value })} style={inputStyle} /></div>
              ))}
            </div>
            <label htmlFor="w-why" style={{ display: 'block' }}>Why this weighting</label>
            <textarea id="w-why" value={rationale} onChange={(e) => setRationale(e.target.value)} style={textareaStyle} />
            <label htmlFor="w-json" style={{ display: 'block' }}>Or the whole set (JSON list of {'{key, title, objectiveId, direction, weight, scale, unit}'})</label>
            <textarea id="w-json" value={criteriaJson} onChange={(e) => setCriteriaJson(e.target.value)} style={textareaStyle} />
            <GovernedButton label="Record the criteria" pendingLabel="Recording…" onRun={async () => {
              let criteria: Array<Record<string, unknown>> | null = null;
              if (criteriaJson.trim() !== '') { try { criteria = JSON.parse(criteriaJson) as Array<Record<string, unknown>>; } catch { setStatus('the set is not valid JSON'); return; } }
              else criteria = mergedWeights(a.criteria, typed);
              if (criteria === null) { setStatus('every weight is a positive number'); return; }
              await done(await api.criteria(scope, pkg, v, { criteria, valueOwner: a.criteria[0]?.value_owner ?? me.principalId, rationale, expectedVersion: a.criteria_version }), 'the criteria');
            }} />
            {a.criteria_history.length > 0 ? (
              <details><summary>History of the weights ({a.criteria_history.length} set(s))</summary>
                <ul>{a.criteria_history.map((h) => <li key={h.criteria_version}>v{h.criteria_version} · {fmtInstant(h.set_at)} by <Mono>{short(h.set_by)}</Mono> · {Object.entries(h.weights).map(([k, w]) => `${k} ${w}`).join(', ')} — {h.rationale}</li>)}</ul>
              </details>
            ) : null}
          </section>

          <section aria-labelledby="dsa-assess" style={section}>
            <h2 id="dsa-assess" style={h2}>Assess an option</h2>
            <div style={grid}>
              <div><label htmlFor="as-o" style={{ display: 'block' }}>Option</label><select id="as-o" value={aOption} onChange={(e) => setAOption(e.target.value)} style={inputStyle}><option value="">—</option>{optionKeys.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
              <div><label htmlFor="as-c" style={{ display: 'block' }}>Criterion</label><select id="as-c" value={aCriterion} onChange={(e) => setACriterion(e.target.value)} style={inputStyle}><option value="">—</option>{criterionKeys.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
              <div><label htmlFor="as-k" style={{ display: 'block' }}>Basis</label><select id="as-k" value={aKind} onChange={(e) => setAKind(e.target.value)} style={inputStyle}>
                <option value="entered">entered by me</option><option value="run">computed from a run</option><option value="forecast">computed from a forecast</option><option value="voi">computed from a value-of-information assessment</option><option value="portfolio_review">computed from a portfolio review</option></select></div>
              {aKind === 'entered'
                ? <div><label htmlFor="as-v" style={{ display: 'block' }}>Value</label><input id="as-v" type="number" step="any" value={aValue} onChange={(e) => setAValue(e.target.value)} style={inputStyle} /></div>
                : <><div><label htmlFor="as-id" style={{ display: 'block' }}>Cited record id</label><input id="as-id" value={aCitedId} onChange={(e) => setACitedId(e.target.value)} style={inputStyle} /></div>
                    <div><label htmlFor="as-m" style={{ display: 'block' }}>Measure</label><input id="as-m" value={aMeasure} onChange={(e) => setAMeasure(e.target.value)} style={inputStyle} /></div></>}
            </div>
            <label htmlFor="as-b" style={{ display: 'block' }}>What the value rests on</label>
            <textarea id="as-b" value={aBasis} onChange={(e) => setABasis(e.target.value)} style={textareaStyle} />
            <GovernedButton label="Record the assessment" pendingLabel="Recording…" onRun={async () => {
              const payload = aKind === 'entered' ? { option: aOption, criterion: aCriterion, value: aValue.trim() === '' ? null : Number(aValue), basis: aBasis }
                : { option: aOption, criterion: aCriterion, cited: { kind: aKind, id: aCitedId.trim(), measure: aMeasure.trim() }, basis: aBasis.trim() === '' ? null : aBasis };
              await done(await api.assess(scope, pkg, v, payload), 'the assessment');
            }} />
          </section>

          <section aria-labelledby="dsa-obl" style={section}>
            <h2 id="dsa-obl" style={h2}>Constraints and stakeholder obligations</h2>
            {a.violations.length > 0 ? <p role="alert"><strong style={{ color: 'var(--eye-color-critical)' }}>Violated:</strong> {a.violations.map((x) => `${x.option} breaches ${x.obligation}${x.stakeholder ? ` (owed to ${x.stakeholder})` : ''}`).join('; ')}</p> : null}
            {a.obligations.length === 0 ? <Empty>No constraint or obligation declared.</Empty> : (
              <table className="eye-table" style={tableStyle}>
                <thead><tr><Th>Obligation</Th><Th>Test</Th>{optionKeys.map((k) => <Th key={k}>{k}</Th>)}</tr></thead>
                <tbody>{a.obligations.map((o) => (
                  <tr key={o.key}><Td>{o.kind === 'obligation' ? `Owed to ${o.stakeholder ?? '—'}: ` : 'Constraint: '}{o.statement} <Mono>{o.key}</Mono></Td><Td>{testWords(o.test)}</Td>
                    {optionKeys.map((k) => <Td key={k}><Mark m={resultMark(o.evaluations[k]?.result)} /></Td>)}</tr>
                ))}</tbody>
              </table>
            )}
            <GovernedButton label="Evaluate the obligations" pendingLabel="Evaluating…" variant="quiet" onRun={async () => { await done(await api.evaluate(scope, pkg, v), 'the evaluation'); }} />
            <h3 style={h3}>Declare one</h3>
            <div style={grid}>
              <div><label htmlFor="ob-k" style={{ display: 'block' }}>Key</label><input id="ob-k" value={oKey} onChange={(e) => setOKey(e.target.value)} style={inputStyle} /></div>
              <div><label htmlFor="ob-kind" style={{ display: 'block' }}>Kind</label><select id="ob-kind" value={oKind} onChange={(e) => setOKind(e.target.value)} style={inputStyle}><option value="obligation">stakeholder obligation</option><option value="constraint">constraint</option></select></div>
              <div><label htmlFor="ob-s" style={{ display: 'block' }}>Stakeholder</label><input id="ob-s" value={oStakeholder} onChange={(e) => setOStakeholder(e.target.value)} style={inputStyle} /></div>
              <div><label htmlFor="ob-j" style={{ display: 'block' }}>Judged by its owner</label><input id="ob-j" type="checkbox" checked={oJudgment} onChange={(e) => setOJudgment(e.target.checked)} /></div>
              {oJudgment ? null : <>
                <div><label htmlFor="ob-c" style={{ display: 'block' }}>Criterion tested</label><select id="ob-c" value={oCriterion} onChange={(e) => setOCriterion(e.target.value)} style={inputStyle}><option value="">—</option>{criterionKeys.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
                <div><label htmlFor="ob-op" style={{ display: 'block' }}>Comparison</label><select id="ob-op" value={oOp} onChange={(e) => setOOp(e.target.value)} style={inputStyle}>{['<=', '>=', '<', '>', '='].map((x) => <option key={x} value={x}>{x}</option>)}</select></div>
                <div><label htmlFor="ob-v" style={{ display: 'block' }}>Threshold</label><input id="ob-v" type="number" step="any" value={oValue} onChange={(e) => setOValue(e.target.value)} style={inputStyle} /></div>
              </>}
            </div>
            <label htmlFor="ob-st" style={{ display: 'block' }}>What is owed</label>
            <textarea id="ob-st" value={oStatement} onChange={(e) => setOStatement(e.target.value)} style={textareaStyle} />
            <GovernedButton label="Declare" pendingLabel="Declaring…" onRun={async () => {
              const test = oJudgment ? { kind: 'judgment' } : { kind: 'threshold', criterion: oCriterion, op: oOp, value: Number(oValue) };
              await done(await api.obligation(scope, pkg, { key: oKey, kind: oKind, stakeholder: oStakeholder.trim() === '' ? null : oStakeholder, statement: oStatement, test, owner: me.principalId }), 'the obligation');
            }} />
          </section>

          <section aria-labelledby="dsa-trade" style={section}>
            <h2 id="dsa-trade" style={h2}>Trade-offs</h2>
            <p>Not dominated: {a.tradeoffs.non_dominated.join(', ') || '—'}{a.tradeoffs.dominance.length > 0 ? <> · {a.tradeoffs.dominance.map((d) => `${d.dominant} dominates ${d.dominated}`).join('; ')}</> : null}</p>
            {a.tradeoffs.given_up.length === 0 ? <Empty>Choosing the leader gives up nothing another ranked option offers.</Empty> : (
              <ul>{a.tradeoffs.given_up.map((g) => <li key={g.option}>Choosing <strong>{a.tradeoffs.leader}</strong> over <strong>{g.option}</strong> gives up: {g.criteria.map((c) => `${c.title} (${String(c.leader_value)} vs ${String(c.other_value)} ${c.unit})`).join('; ')}</li>)}</ul>
            )}
          </section>

          <section aria-labelledby="dsa-fut" style={section}>
            <h2 id="dsa-fut" style={h2}>Futures, reversibility and the value of information</h2>
            <p style={muted}>{a.futures.review === null ? 'No portfolio review covers this package\'s futures.' : `Portfolio review of ${fmtInstant(a.futures.review.reviewed_at)} over ${a.futures.review.branches} future(s), in ${a.futures.review.payoff_unit}.`}</p>
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Option</Th><Th>Worst payoff (robustness)</Th><Th>Largest regret</Th><Th>Reversibility</Th></tr></thead>
              <tbody>{a.futures.options.map((o) => <tr key={o.key}><Td>{o.title}{o.most_robust ? ' · most robust' : ''}{o.least_regret ? ' · least regret' : ''}</Td><Td mono>{o.robustness === null ? '—' : String(o.robustness)}</Td><Td mono>{o.regret === null ? '—' : String(o.regret)}</Td><Td>{o.reversibility ?? '—'}</Td></tr>)}</tbody>
            </table>
            <p>{a.futures.option_value === null ? 'No value-of-information assessment: the value of waiting is not known.' : `Option value (waiting for "${a.futures.option_value.information}"): net ${String(a.futures.option_value.net_value_of_waiting)} ${a.futures.option_value.payoff_unit} — ${a.futures.option_value.recommendation === 'wait' ? 'WAIT' : 'ACT now'}`}</p>
            {a.value_of_information.length > 0 ? <ul>{a.value_of_information.map((x) => <li key={x.assessment_id}>{fmtInstant(x.recorded_at)} · "{x.information}" · EVPI {String(x.evpi)}, EVSI {String(x.evsi)}, delay cost {String(x.delay_cost)}, net {String(x.net_value)} {x.payoff_unit} → {x.recommendation.toUpperCase()}</li>)}</ul> : null}
            <h3 style={h3}>Second-order effects of the cited runs</h3>
            {a.second_order.length === 0 ? <Empty>No option cites a run.</Empty> : (
              <ul>{a.second_order.map((s) => <li key={`${s.option}-${s.run_id}`}>{s.option} · run <Mono>{short(s.run_id)}</Mono> · {s.validated ? `validated: ${s.effects.map((e) => `${e.entity} ${e.metric} p50 ${e.values.p50} ${e.unit}`).join('; ') || 'no effect'}` : `not used — ${s.reason ?? s.validity}`}</li>)}</ul>
            )}
          </section>

          <section aria-labelledby="dsa-adv" style={section}>
            <h2 id="dsa-adv" style={h2}>Adversarial responses</h2>
            {a.adversarial.length === 0 ? <Empty>No response modelled.</Empty> : (
              <ul>{a.adversarial.map((x) => <li key={x.assessment_id}><strong>{x.actor}</strong> ({x.agency} agency) — {x.response}: <strong>{x.option}</strong> {rankChangeWords(x.base_rank, x.response_rank)} (score {String(x.base_score)} → {String(x.response_score)})</li>)}</ul>
            )}
            <div style={grid}>
              <div><label htmlFor="ad-o" style={{ display: 'block' }}>Option</label><select id="ad-o" value={rOption} onChange={(e) => setROption(e.target.value)} style={inputStyle}><option value="">—</option>{optionKeys.map((k) => <option key={k} value={k}>{k}</option>)}</select></div>
              <div><label htmlFor="ad-a" style={{ display: 'block' }}>Actor</label><select id="ad-a" value={rActor} onChange={(e) => setRActor(e.target.value)} style={inputStyle}><option value="">—</option>{actors.map((x) => <option key={x.element_id} value={x.element_id}>{x.name} ({x.agency}) — {x.scenario_title}</option>)}</select></div>
            </div>
            <label htmlFor="ad-r" style={{ display: 'block' }}>The actor&apos;s response</label>
            <textarea id="ad-r" value={rResponse} onChange={(e) => setRResponse(e.target.value)} style={textareaStyle} />
            <label htmlFor="ad-e" style={{ display: 'block' }}>Its effect on the option (JSON list of {'{criterion, op: add | multiply | set, value}'})</label>
            <textarea id="ad-e" value={rEffects} onChange={(e) => setREffects(e.target.value)} style={textareaStyle} />
            <label htmlFor="ad-b" style={{ display: 'block' }}>The basis of the response model</label>
            <textarea id="ad-b" value={rBasis} onChange={(e) => setRBasis(e.target.value)} style={textareaStyle} />
            <GovernedButton label="Assess the response" pendingLabel="Assessing…" onRun={async () => {
              let effects: Array<{ criterion: string; op: string; value: number }>;
              try { effects = JSON.parse(rEffects) as typeof effects; } catch { setStatus('the effects are not valid JSON'); return; }
              await done(await api.adversarial(scope, pkg, v, { option: rOption, actorElementId: rActor, response: rResponse, effects, basis: rBasis }), 'the adversarial assessment');
            }} />
          </section>

          <section aria-labelledby="dsa-gen" style={section}>
            <h2 id="dsa-gen" style={h2}>Candidate options and the package&apos;s inputs</h2>
            <p style={muted}>Candidates are drafts generated by declared rules; the owner adopts one by setting an option with its key on the decision page. Found inputs are not cited until the owner cites them.</p>
            <div style={{ display: 'flex', gap: 'var(--eye-space-8)' }}>
              <GovernedButton label="Generate candidates" pendingLabel="Generating…" variant="quiet" onRun={async () => { await done(await api.generate(scope, pkg, v), 'the candidates'); }} />
              <GovernedButton label="Assemble the inputs" pendingLabel="Assembling…" variant="quiet" onRun={async () => { await done(await api.assemble(scope, pkg, v), 'the assembly'); }} />
            </div>
            {a.candidates.length === 0 ? <Empty>No candidates generated.</Empty> : (
              <ul>{a.candidates.map((c) => <li key={c.candidate_id}><strong>{POSTURES[c.posture] ?? c.posture}</strong>: {c.title} <Mono>{c.key}</Mono> — {c.rationale} <span style={muted}>({c.rule}{c.adopted_as !== null ? `; adopted ${fmtInstant(c.adopted_at)}` : ''})</span></li>)}</ul>
            )}
            {a.assembly === null ? null : (
              <table className="eye-table" style={tableStyle}>
                <caption style={{ captionSide: 'top', textAlign: 'start', ...muted }}>Inputs found {fmtInstant(a.assembly.assembled_at)}</caption>
                <thead><tr><Th>Kind</Th><Th>Input</Th><Th>State</Th><Th>Why it was found</Th></tr></thead>
                <tbody>{a.assembly.items.map((i) => <tr key={`${i.kind}-${i.id}`}><Td>{i.kind.replace(/_/g, ' ')}</Td><Td>{i.title}</Td><Td>{i.state}</Td><Td>{i.why.join('; ')}</Td></tr>)}</tbody>
              </table>
            )}
          </section>
        </>
      )}
    </>
  );
}
