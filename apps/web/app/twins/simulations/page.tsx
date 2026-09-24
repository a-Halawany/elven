'use client';
/**
 * Simulations — runs against admitted twin versions: a CONTROL, then interventions
 * compared on that common baseline; the assumptions carrying the result; and
 * reproduction from the stored contract. Every value is SYNTHETIC and says so.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { twins as api, type Run, type Twin, type Challenge, type ChallengeKind } from '../../../lib/twins';
import { prediction, type ScenarioRow } from '../../../lib/prediction';
import type { Scope } from '../../../lib/observation';
import { envelopeKeyLines, envelopeLine, fitnessLabel } from '../../../lib/fitness';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

const money = (v: unknown): string => (typeof v === 'string' ? `€${Number(v).toLocaleString('en-GB', { minimumFractionDigits: 2 })}` : '—');
const iv = (r: Run): string => r.interventions.map((i) => (i['type'] === 'none' ? 'none' : `${String(i['type'])}${i['shipment'] ? ` ${String(i['shipment'])}` : ''}${i['weeks'] ? ` ${String(i['weeks'])}w` : ''}`)).join(' + ');
const short = (v: unknown): string => (typeof v === 'string' && v !== '' ? `${v.slice(0, 8)}…` : '—');
/** A failed call, as the server answered it: status, code and message verbatim (a network failure has no code). */
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const CHALLENGE_KINDS: ReadonlyArray<{ value: ChallengeKind; label: string }> = [
  { value: 'assumptions', label: 'assumptions — the state the run rested on' },
  { value: 'model', label: 'model — the behaviour model or its parameters' },
  { value: 'constraints', label: 'constraints — the horizon, the budget, the interventions admitted' },
  { value: 'interpretation', label: 'interpretation — what the result is taken to mean' },
];
/** B21: a run's fitness flag (fit for a use by a promotion; unfit by an invalidation; a dash otherwise) as glyph + label + token. */
function RunFitness({ r }: { r: Run }) {
  const f = fitnessLabel(r, 'run');
  return <span style={{ color: `var(${f.token})`, fontWeight: 650 }}><span aria-hidden="true">{f.glyph}</span> {f.text}</span>;
}
/**
 * B21 (0081, L8-I04 ChallengeSimulation): one challenge with the acts its state admits — a re-run request (open → rerun_requested), a
 * decision (upheld | dismissed; human-gated; neither the opener nor the run's operator), a withdrawal (the opener, while live). Every
 * route is bound to the RUN (C6: …/simulations/:runId/challenges/:challengeId/…); the port refuses a challenge that is not the run's.
 */
function ChallengeRow({ c, runId, scope, canAct, canDecide, onDone }: { c: Challenge; runId: string; scope: Scope; canAct: boolean; canDecide: boolean; onDone: (line: string, receipt: { policyDecisionId: string; auditSeq: number }) => Promise<void> }) {
  const [note, setNote] = useState('');
  const [decision, setDecision] = useState<'upheld' | 'dismissed'>('dismissed');
  const [problem, setProblem] = useState<string | null>(null);
  const live = c.state === 'open' || c.state === 'rerun_requested';
  return (
    <div style={{ borderBlockEnd: '1px solid var(--eye-color-border-default)', paddingBlock: 'var(--eye-space-8)' }}>
      <div style={{ fontSize: 'var(--eye-type-label-sm)' }}>
        <strong style={{ color: c.state === 'upheld' ? 'var(--eye-color-critical)' : live ? 'var(--eye-color-warning)' : 'var(--eye-color-ink-muted)' }}>{c.state.toUpperCase().replace('_', ' ')}</strong>
        {' · '}<Mono>{c.kind}</Mono> · opened {fmtInstant(c.opened_at)} by <Mono>{short(c.opened_by)}</Mono> · challenge <Mono>{short(c.challenge_id)}</Mono>
        {c.disputed.length > 0 ? <> · disputes <Mono>{c.disputed.join(', ')}</Mono></> : null}
      </div>
      <div>{c.statement}</div>
      <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>
        {c.rerun_requested_at ? <>re-run requested {fmtInstant(c.rerun_requested_at)} by <Mono>{short(c.rerun_requested_by)}</Mono> · </> : null}
        {c.rerun_run_id ? <>re-run <Mono>{short(c.rerun_run_id)}</Mono> (a governed run naming this challenge; compare it on the common control) · </> : c.state === 'rerun_requested' ? 'awaiting its re-run (open a governed run with this challenge as the one it answers) · ' : null}
        {c.decided_at ? <>decided {fmtInstant(c.decided_at)} by <Mono>{short(c.decided_by)}</Mono> — {c.decision_note}</> : null}
        {c.withdrawn_at ? <>withdrawn {fmtInstant(c.withdrawn_at)} — {c.withdrawal_reason}</> : null}
      </div>
      {live && (canAct || canDecide) ? (
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', alignItems: 'center', marginBlockStart: 'var(--eye-space-4)' }}>
          <input type="text" aria-label={`note for challenge ${c.challenge_id.slice(0, 8)}`} placeholder="note (8+ characters for a decision or a withdrawal)" style={{ ...inputStyle, minInlineSize: '18rem' }} value={note} onChange={(e) => setNote(e.target.value)} />
          {canAct && c.state === 'open' ? (
            <GovernedButton label="Request re-run" pendingLabel="requesting" variant="quiet" onRun={async () => {
              setProblem(null);
              const r = await api.rerunChallenge(scope, runId, c.challenge_id, note.trim());
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'the request was not answered'); setProblem(m); throw new Error(m); }
              await onDone(`challenge ${c.challenge_id.slice(0, 8)}… ${r.data.challenge.state}`, r.data.receipt);
            }} />
          ) : null}
          {canDecide ? (
            <>
              <select aria-label={`decision on challenge ${c.challenge_id.slice(0, 8)}`} style={inputStyle} value={decision} onChange={(e) => setDecision(e.target.value as 'upheld' | 'dismissed')}>
                <option value="dismissed">dismiss — the result stands</option>
                <option value="upheld">uphold — the run is invalidated in the same write (trigger challenge)</option>
              </select>
              <GovernedButton label="Decide" pendingLabel="deciding" variant={decision === 'upheld' ? 'critical' : 'primary'} disabled={note.trim().length < 8} onRun={async () => {
                setProblem(null);
                const r = await api.decideChallenge(scope, runId, c.challenge_id, { decision, note: note.trim() });
                if (!r.ok || r.data === undefined) { const m = refusal(r, 'the decision was not answered'); setProblem(m); throw new Error(m); }
                const inv = r.data.invalidation ?? null;
                await onDone(`challenge ${c.challenge_id.slice(0, 8)}… ${r.data.challenge.state}${inv !== null && inv.withdrawnVersion !== undefined ? ` — the run is INVALIDATED (trigger challenge; SIM version ${inv.withdrawnVersion} withdrawn)` : r.data.invalidation_withheld ? ` — invalidation withheld: ${r.data.invalidation_withheld}` : ''}`, r.data.receipt);
              }} />
            </>
          ) : null}
          {canAct ? (
            <GovernedButton label="Withdraw" pendingLabel="withdrawing" variant="quiet" disabled={note.trim().length < 8} onRun={async () => {
              setProblem(null);
              const r = await api.withdrawChallenge(scope, runId, c.challenge_id, note.trim());
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'the withdrawal was not answered'); setProblem(m); throw new Error(m); }
              await onDone(`challenge ${c.challenge_id.slice(0, 8)}… ${r.data.challenge.state}`, r.data.receipt);
            }} />
          ) : null}
        </div>
      ) : null}
      {problem !== null ? <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>refused — {problem}</span></LiveStatus> : null}
    </div>
  );
}

export default function SimulationsPage() {
  const { scope, isSimulationOperator, isTwinOwner, isStrategyOwner } = useShell();
  /* B21: who may act — the server decides (the PDP rows, the ports' separation of duties); these flags only show the controls. */
  const canChallenge = isSimulationOperator || isStrategyOwner;
  const canDecide = isTwinOwner || isStrategyOwner;
  const canPromote = isTwinOwner || isStrategyOwner;
  const [twinsList, setTwins] = useState<Twin[]>([]);
  const [runs, setRuns] = useState<Run[] | null>(null);
  const [open, setOpen] = useState<Run | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [twinId, setTwinId] = useState('');
  const [twinVersion, setTwinVersion] = useState('');
  const [runKind, setRunKind] = useState<'control' | 'intervention'>('control');
  const [controlRunId, setControlRunId] = useState('');
  const [intervention, setIntervention] = useState('reroute:SYN-SHIP-4472');
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  /** The scenario branch a run binds: "" for none. A FLIPPED branch applies the shock; an open branch none; without a scenario a shock is a HYPOTHETICAL. */
  const [branchKey, setBranchKey] = useState('');
  const [hypothetical, setHypothetical] = useState(false);
  const [comparison, setComparison] = useState<{ control_run_id: string; runs: Array<{ run_id: string; run_kind: string; interventions: Array<Record<string, unknown>>; totals: Run['outputs'] extends infer _ ? { line_stop_days: number; days_below_safety_stock: number; cost: { total: string } } : never; carrying: string[] }> } | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  /* B21: the run form's envelope acknowledgement and the challenge a re-run answers; the domain's challenges awaiting a re-run. */
  const [ackEnvelope, setAckEnvelope] = useState(false);
  const [ackReason, setAckReason] = useState('');
  const [answerChallenge, setAnswerChallenge] = useState('');
  const [awaiting, setAwaiting] = useState<Challenge[]>([]);
  /* B21: the "Challenge this result" and "Promote as fit for" forms and their refusals, in the server's words. */
  const [chKind, setChKind] = useState<ChallengeKind>('interpretation');
  const [chStatement, setChStatement] = useState('');
  const [chDisputed, setChDisputed] = useState('');
  const [chProblem, setChProblem] = useState<string | null>(null);
  const [prFor, setPrFor] = useState('');
  const [prLimitations, setPrLimitations] = useState('');
  const [prNote, setPrNote] = useState('');
  const [prProblem, setPrProblem] = useState<string | null>(null);

  const load = async () => {
    const [t, r, sc, ch] = await Promise.all([api.list(scope), api.runs(scope, null), prediction.listScenarios(scope), api.challenges(scope, null)]);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the runs could not be read'); return; }
    setRuns(r.data.runs);
    if (t.ok && t.data !== undefined) { setTwins(t.data.twins); setTwinId((p) => p || (t.data?.twins[0]?.twin_id ?? '')); }
    if (sc.ok && sc.data !== undefined) setScenarios(sc.data.scenarios);
    // a server before 0081 answers no challenge list: the select stays empty, nothing else changes
    if (ch.ok && ch.data !== undefined) setAwaiting(ch.data.challenges.filter((c) => c.state === 'rerun_requested' && c.rerun_run_id === null));
  };
  useEffect(() => { void load(); }, [scope]);
  const openRun = async (id: string) => { const r = await api.run(scope, id); if (r.ok && r.data !== undefined) setOpen(r.data.run); };
  /** After a challenge act: the line, the receipt, the run re-read (its challenges and validity are the server's), the list re-read. */
  const afterAct = async (line: string, r: { policyDecisionId: string; auditSeq: number }) => { setLast(line); setReceipt(r); if (open !== null) await openRun(open.run_id); await load(); };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (runs === null) return <Empty>reading runs…</Empty>;
  const twin = twinsList.find((t) => t.twin_id === twinId);
  const admitted = (twin?.versions ?? []).filter((v) => v.state === 'admitted' && v.completeness === 'complete');
  const controls = runs.filter((r) => r.run_kind === 'control' && r.state === 'completed');

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Simulations</h1>
      <UnknownNote><strong>Every number on this screen is SYNTHETIC</strong> — the output of a declared model on a declared state, reproducible from its stored contract. It is not an observation and not a forecast. Interventions are compared only against a compatible control on the same initial state.</UnknownNote>
      {isSimulationOperator ? (
        <section aria-labelledby="run-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="run-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Run</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--eye-space-8)' }}>
            <label>Twin<select style={inputStyle} value={twinId} onChange={(e) => { setTwinId(e.target.value); setTwinVersion(''); }}>{twinsList.map((t) => <option key={t.twin_id} value={t.twin_id}>{t.title}</option>)}</select></label>
            <label>Admitted, complete version<select style={inputStyle} value={twinVersion} onChange={(e) => setTwinVersion(e.target.value)}><option value="">choose</option>{admitted.map((v) => <option key={v.version} value={v.version}>v{v.version} · {v.branch_id}{v.verification_state === 'unverified' ? ' · UNVERIFIED' : ''}</option>)}</select></label>
            <label>Kind<select style={inputStyle} value={runKind} onChange={(e) => setRunKind(e.target.value as 'control' | 'intervention')}><option value="control">control (intervention: none)</option><option value="intervention">intervention (needs a control)</option></select></label>
            {runKind === 'intervention' ? (
              <>
                <label>Control run<select style={inputStyle} value={controlRunId} onChange={(e) => setControlRunId(e.target.value)}><option value="">choose</option>{controls.map((c) => <option key={c.run_id} value={c.run_id}>{c.run_id.slice(0, 8)}… v{c.twin_version} {c.shock ? 'shock' : 'no shock'}</option>)}</select></label>
                <label>Intervention<select style={inputStyle} value={intervention} onChange={(e) => setIntervention(e.target.value)}>
                  <option value="reroute:SYN-SHIP-4472">reroute SYN-SHIP-4472 via the Cape</option>
                  <option value="reroute:SYN-SHIP-4475">reroute SYN-SHIP-4475 via the Cape</option>
                  <option value="air">air bridge — one week of SYN-PART-MAG, decided 2024-01-17</option>
                  <option value="draw_down">draw down safety stock (consume to zero)</option>
                  <option value="draw_down+reroute:SYN-SHIP-4472">draw down + reroute SYN-SHIP-4472</option>
                </select></label>
              </>
            ) : null}
            <label>Scenario branch<select style={inputStyle} value={branchKey} onChange={(e) => { setBranchKey(e.target.value); if (e.target.value !== '') setHypothetical(false); }}>
              <option value="">none — no scenario bound</option>
              {scenarios.flatMap((sc) => sc.branches.map((b) => <option key={b.branch_id} value={`${sc.scenario_id}|${b.branch_id}`}>{sc.title} · {b.name} ({b.state}{b.state === 'flipped' ? ': the shock applies' : ': no shock'})</option>))}
            </select></label>
            {branchKey === '' ? <label><input type="checkbox" checked={hypothetical} onChange={(e) => setHypothetical(e.target.checked)} /> apply a HYPOTHETICAL corridor delay (no scenario branch supports it; the run says so)</label> : null}
            {/* B21 (D3 b): a run whose OWN contract lies outside the behaviour model's operating envelope is admitted only under a twin owner's or the
                domain administrator's acknowledgement, recorded on the run; the server refuses everyone else and every run without one. */}
            <label><input type="checkbox" checked={ackEnvelope} onChange={(e) => setAckEnvelope(e.target.checked)} /> acknowledge an envelope breach (a twin owner’s or the domain administrator’s; recorded on the run)</label>
            {ackEnvelope ? <label>Reason for the acknowledgement (8+ characters)<input type="text" style={inputStyle} value={ackReason} onChange={(e) => setAckReason(e.target.value)} /></label> : null}
            {/* B21 (L8-I04): a re-run answering a challenge names it; the challenged run becomes the one this run corrects. */}
            <label>Challenge to answer<select style={inputStyle} value={answerChallenge} onChange={(e) => setAnswerChallenge(e.target.value)}>
              <option value="">none — an ordinary run</option>
              {awaiting.map((c) => <option key={c.challenge_id} value={c.challenge_id}>{c.challenge_id.slice(0, 8)}… ({c.kind}) on run {c.run_id.slice(0, 8)}… — awaiting its re-run</option>)}
            </select></label>
          </div>
          <GovernedButton label={runKind === 'control' ? 'Run control' : 'Run intervention'} pendingLabel="running" onRun={async () => {
            const parts = intervention.split('+');
            const interventions = runKind === 'control' ? [{ type: 'none' }] : parts.map((p) => {
              if (p === 'air') return { type: 'air_bridge', component: 'SYN-PART-MAG', weeks: 1, decision_date: '2024-01-17' };
              if (p === 'draw_down') return { type: 'draw_down', component: 'SYN-PART-MAG', from: '2024-01-11', to: '2024-04-09' };
              return { type: 'reroute', shipment: p.split(':')[1] };
            });
            const [scenarioId, scenarioBranchId] = branchKey === '' ? [null, null] : branchKey.split('|');
            const bound = scenarios.flatMap((sc) => sc.branches).find((b) => b.branch_id === scenarioBranchId);
            const shock = bound !== undefined ? bound.state === 'flipped' : hypothetical;
            const answered = awaiting.find((c) => c.challenge_id === answerChallenge);
            const r = await api.simulate(scope, { twinId, twinVersion: Number(twinVersion), runKind, controlRunId: runKind === 'control' ? null : controlRunId, shock, scenarioId, scenarioBranchId, component: 'SYN-PART-MAG',
              interventions, horizonDays: 90, stochastic: { mode: 'deterministic' },
              ...(ackEnvelope ? { envelope: { acknowledge: true, reason: ackReason.trim() } } : {}),
              ...(answered !== undefined ? { challengeId: answered.challenge_id, correctsRunId: answered.run_id } : {}) });
            if (!r.ok || r.data === undefined) throw new Error(`${r.error?.code ?? ''} ${r.error?.message ?? 'the run was refused'}`.trim());
            setReceipt(r.data.receipt);
            setLast(`run ${r.data.run.runId.slice(0, 8)}… ${r.data.run.state}: ${r.data.run.totals.line_stop_days} line-stop day(s), total ${money(r.data.run.totals.cost.total)} — SYNTHETIC`
              + `${r.data.run.twinFitness !== undefined ? ` · twin fitness at opening ${r.data.run.twinFitness}` : ''}${r.data.run.envelope !== undefined ? ` · envelope ${r.data.run.envelope.state}${r.data.run.envelopeAck ? ' (acknowledged)' : ''}` : ''}${r.data.run.challengeId ? ` · answers challenge ${r.data.run.challengeId.slice(0, 8)}…` : ''}`);
            setAnswerChallenge(''); await load();
          }} />
        </section>
      ) : null}
      {runs.length === 0 ? <Empty>No run has been made.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <caption style={{ captionSide: 'top', textAlign: 'start', color: 'var(--eye-color-ink-muted)' }}>{runs.length} run(s) — SYNTHETIC</caption>
          <thead><tr><Th>Select</Th><Th>Run</Th><Th>Kind</Th><Th>Twin version</Th><Th>Shock</Th><Th>Interventions</Th><Th>Line-stop days</Th><Th>Total cost</Th><Th>State</Th><Th>Fitness</Th></tr></thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.run_id}>
                <Td><input type="checkbox" aria-label={`select ${r.run_id.slice(0, 8)}`} checked={selected.includes(r.run_id)} onChange={(e) => setSelected((s) => e.target.checked ? [...s, r.run_id] : s.filter((x) => x !== r.run_id))} /></Td>
                <Td><button type="button" onClick={() => void openRun(r.run_id)} style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-default)', cursor: 'pointer', textDecoration: 'underline' }}><Mono>{r.run_id.slice(0, 8)}…</Mono></button></Td>
                <Td mono>{r.run_kind}{r.control_run_id ? ` → ${r.control_run_id.slice(0, 8)}…` : ''}</Td>
                <Td mono>v{r.twin_version} · {r.branch_id}</Td>
                <Td>{r.shock_basis === 'scenario-branch-flipped' ? 'corridor delay — flipped branch' : r.shock_basis === 'hypothetical' ? <strong>corridor delay — HYPOTHETICAL</strong> : r.shock ? 'corridor delay (basis unrecorded)' : 'none'}</Td>
                <Td>{iv(r)}</Td>
                <Td mono>{r.outputs?.totals?.line_stop_days ?? '—'}</Td>
                <Td mono>{money(r.outputs?.totals?.cost.total)}</Td>
                <Td>{r.state === 'failed' ? <strong style={{ color: 'var(--eye-color-critical)' }}>FAILED — {r.failure}</strong> : r.state}{r.validation_status.includes('UNVERIFIED') ? <div style={{ color: 'var(--eye-color-critical)', fontSize: 'var(--eye-type-label-sm)' }}>twin version UNVERIFIED</div> : null}{r.validity === 'invalidated' ? <div style={{ color: 'var(--eye-color-critical)', fontSize: 'var(--eye-type-label-sm)' }}>INVALIDATED ({r.invalidation?.trigger ?? 'trigger unrecorded'})</div> : null}</Td>
                {/* B21: the run's fitness (a promotion's use / an invalidation), its own envelope state when outside, the live challenges. */}
                <Td><RunFitness r={r} />
                  {r.envelope_state === 'outside' ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-critical)' }}>{envelopeLine(r)}</div> : null}
                  {(r.live_challenges ?? 0) > 0 ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-warning)' }}>{r.live_challenges} live challenge(s)</div> : null}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <GovernedButton label={`Compare ${selected.length} selected on their common control`} pendingLabel="comparing" variant="quiet" onRun={async () => {
        const r = await api.compareRuns(scope, selected);
        if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the comparison was refused');
        setComparison(r.data.comparison as never); setReceipt(r.data.receipt);
      }} />
      {comparison === null ? null : (
        <section aria-labelledby="cmp-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="cmp-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Comparison on control <Mono>{comparison.control_run_id.slice(0, 8)}…</Mono> — SYNTHETIC</h2>
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Run</Th><Th>Interventions</Th><Th>Line-stop days</Th><Th>Days below safety stock</Th><Th>Total cost</Th><Th>Carrying assumptions</Th></tr></thead>
            <tbody>
              {comparison.runs.map((r) => (
                <tr key={r.run_id}><Td mono>{r.run_id.slice(0, 8)}… ({r.run_kind})</Td><Td>{r.interventions.map((i) => String(i['type'])).join(' + ')}</Td>
                  <Td mono>{r.totals.line_stop_days}</Td><Td mono>{r.totals.days_below_safety_stock}</Td><Td mono>{money(r.totals.cost.total)}</Td><Td mono>{r.carrying.join(', ')}</Td></tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
      {open === null ? null : (
        <section aria-labelledby="run-d" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="run-d" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Run <Mono>{open.run_id}</Mono> — SYNTHETIC</h2>
          <dl>
            <DefinitionRow term="Contract">twin v{open.twin_version} ({open.branch_id}) · {open.run_kind}{open.control_run_id ? <> on control <Mono>{open.control_run_id.slice(0, 8)}…</Mono></> : ''} · {iv(open)} · shock {open.shock ? 'applied' : 'not applied'}</DefinitionRow>
            <DefinitionRow term="Cut-offs">observations through <Mono>{String(open.observed_through ?? '').slice(0, 10)}</Mono>, read at record time <Mono>{fmtInstant(open.known_at)}</Mono></DefinitionRow>
            <DefinitionRow term="Shock">{open.shock_basis === 'scenario-branch-flipped'
              ? <>corridor delay applied — the bound scenario branch is <strong>FLIPPED</strong> (scenario <Mono>{String(open.scenario_id ?? '').slice(0, 8)}…</Mono> version {open.scenario_version ?? '?'}, branch <Mono>{String(open.scenario_branch_id ?? '').slice(0, 8)}…</Mono>)</>
              : open.shock_basis === 'hypothetical' ? <><strong>HYPOTHETICAL</strong> corridor delay — no scenario branch supports it</>
              : open.shock ? 'corridor delay applied — basis unrecorded (opened before the binding existed)'
              : open.scenario_id ? <>none — bound to scenario <Mono>{String(open.scenario_id).slice(0, 8)}…</Mono> version {open.scenario_version ?? '?'}, branch {open.scenario_branch_state ?? '?'}</> : 'none'}</DefinitionRow>
            <DefinitionRow term="Bound"><Mono>{open.model_ref}</Mono> impl <Mono>{open.implementation_digest.slice(0, 16)}…</Mono> · env <Mono>{open.environment_digest.slice(0, 16)}…</Mono> · {open.stochastic_mode}{open.stochastic_mode === 'seeded' ? ` (${open.rng}, seed ${open.seed}, ${open.samples} samples)` : ''}</DefinitionRow>
            <DefinitionRow term="Digests">initial state <Mono>{open.initial_state_digest.slice(0, 16)}…</Mono> · inputs <Mono>{open.inputs_digest.slice(0, 16)}…</Mono> · outputs <Mono>{String(open.outputs_digest ?? '').slice(0, 16)}…</Mono></DefinitionRow>
            <DefinitionRow term="Totals">{open.outputs?.totals ? <>{open.outputs.totals.line_stop_days} line-stop day(s) from {open.outputs.totals.first_line_stop_date ?? 'never'} · {open.outputs.totals.days_below_safety_stock} day(s) below safety stock · min on-hand {open.outputs.totals.min_on_hand} · cost {money(open.outputs.totals.cost.total)} (reroute {money(open.outputs.totals.cost.reroute)}, air {money(open.outputs.totals.cost.air)}, line stop {money(open.outputs.totals.cost.line_stop)})</> : '—'}</DefinitionRow>
            <DefinitionRow term="Assumptions carrying the result">{(open.sensitivity?.factors ?? []).slice(0, 4).map((f) => <div key={f.key}><Mono>{f.key}</Mono> — cost spread {money(f.cost_spread)}</div>)}{open.sensitivity?.outside_envelope ? <strong style={{ color: 'var(--eye-color-critical)' }}>a perturbation left the envelope (a sensitivity fact; the run’s own contract is the Envelope row)</strong> : null}</DefinitionRow>
            <DefinitionRow term="Validation">{open.validation_status}</DefinitionRow>
            {/* B21 (0081): the run's fitness and the promotion or invalidation it rests on; the twin version's fitness COPIED at opening; the run's OWN envelope state. */}
            <DefinitionRow term="Fitness">
              <RunFitness r={open} />
              {open.promotion ? <div style={{ fontSize: 'var(--eye-type-label-sm)' }}>promoted {fmtInstant(open.promotion.promoted_at)} by <Mono>{short(open.promotion.promoted_by)}</Mono> for <strong>{open.promotion.promoted_for}</strong> — {open.promotion.note}{open.promotion.limitations.length > 0 ? <> · limitations: {open.promotion.limitations.join('; ')}</> : null} · validation restated <Mono>{JSON.stringify(open.promotion.validation)}</Mono></div> : null}
              {open.validity === 'invalidated' ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-critical)' }}>INVALIDATED {open.invalidated_at ? fmtInstant(open.invalidated_at) : ''} — trigger <Mono>{open.invalidation?.trigger ?? 'unrecorded'}</Mono>{open.invalidation?.trigger_ref ? <> (<Mono>{short(open.invalidation.trigger_ref)}</Mono>)</> : null}{open.invalidation?.reason ? <> — {open.invalidation.reason}</> : null}</div> : null}
              {open.fitness_state === undefined ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>this server records no run fitness (before 0081)</div> : null}
            </DefinitionRow>
            <DefinitionRow term="Twin fitness at opening">{open.twin_fitness === undefined ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>not recorded (before 0081)</span> : open.twin_fitness === 'none' ? 'none — opened before any validation of the version' : <strong>{open.twin_fitness}</strong>}</DefinitionRow>
            <DefinitionRow term="Envelope">
              {envelopeLine(open)}
              {envelopeKeyLines(open.envelope_check).map((l) => <div key={l} style={{ fontSize: 'var(--eye-type-label-sm)' }}><Mono>{l}</Mono></div>)}
            </DefinitionRow>
            {open.challenge_id ? <DefinitionRow term="Answers challenge"><Mono>{open.challenge_id}</Mono>{open.corrects_run_id ? <> — a re-run of <Mono>{short(open.corrects_run_id)}</Mono>; compare both on the common control</> : null}</DefinitionRow> : null}
            <DefinitionRow term="Challenges">
              {(open.challenges ?? []).length === 0 ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>none opened</span>
                : (open.challenges ?? []).map((c) => <ChallengeRow key={c.challenge_id} c={c} runId={open.run_id} scope={scope} canAct={canChallenge} canDecide={canDecide} onDone={afterAct} />)}
            </DefinitionRow>
            <DefinitionRow term="Reproductions">{(open.reproductions ?? []).length === 0 ? 'none yet' : (open.reproductions ?? []).map((r, i) => <div key={i}><strong style={{ color: r.verdict === 'reproduced' ? 'var(--eye-color-success)' : 'var(--eye-color-critical)' }}>{r.verdict.toUpperCase()}</strong> {fmtInstant(r.reproduced_at)}{r.cold_process ? ' (cold process)' : ''} — {r.reason}</div>)}</DefinitionRow>
          </dl>
          {isSimulationOperator && open.state === 'completed' ? (
            <GovernedButton label="Reproduce from the stored contract" pendingLabel="re-executing" onRun={async () => {
              const r = await api.reproduce(scope, open.run_id);
              if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the reproduction was refused');
              setReceipt(r.data.receipt); setLast(`reproduction ${r.data.reproduction.verdict.toUpperCase()} — ${r.data.reproduction.reason}`); await openRun(open.run_id);
            }} />
          ) : null}
          {/* B21 (L8-I04): a typed dispute of a completed valid run — one live challenge per run per opener; decided by someone else. */}
          {canChallenge && open.state === 'completed' && open.validity !== 'invalidated' ? (
            <section aria-labelledby="ch-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
              <h3 id="ch-h" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>Challenge this result</h3>
              <p style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>
                A person’s typed case against what this run assumed, modelled, constrained or is taken to mean; someone other than you and the run’s
                operator decides it (upheld invalidates the run; dismissed leaves it standing), after a re-run if one is requested. Published as ChallengeSimulation@v1.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' }}>
                <div><label htmlFor="ch-kind" style={{ display: 'block' }}>Kind</label>
                  <select id="ch-kind" style={{ ...inputStyle, inlineSize: '100%' }} value={chKind} onChange={(e) => setChKind(e.target.value as ChallengeKind)}>{CHALLENGE_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}</select></div>
                <div><label htmlFor="ch-disputed" style={{ display: 'block' }}>Disputed keys, parameters or interpretation (optional; separated by ,)</label>
                  <input id="ch-disputed" type="text" style={{ ...inputStyle, inlineSize: '100%' }} value={chDisputed} onChange={(e) => setChDisputed(e.target.value)} /></div>
              </div>
              <div style={{ marginBlockStart: 'var(--eye-space-8)' }}><label htmlFor="ch-statement" style={{ display: 'block' }}>Statement (8+ characters)</label>
                <textarea id="ch-statement" style={textareaStyle} value={chStatement} onChange={(e) => setChStatement(e.target.value)} /></div>
              <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                <GovernedButton label="Open the challenge" pendingLabel="opening" disabled={chStatement.trim().length < 8} onRun={async () => {
                  setChProblem(null);
                  const r = await api.challenge(scope, open.run_id, { kind: chKind, statement: chStatement.trim(), disputed: chDisputed.split(',').map((x) => x.trim()).filter((x) => x !== '') });
                  if (!r.ok || r.data === undefined) { const m = refusal(r, 'the challenge was not answered'); setChProblem(m); throw new Error(m); }
                  setChStatement(''); setChDisputed('');
                  await afterAct(`challenge ${r.data.challenge.challenge_id.slice(0, 8)}… ${r.data.challenge.state} (${r.data.challenge.kind})`, r.data.receipt);
                }} />
              </div>
              {chProblem !== null ? <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not opened — {chProblem}</span></LiveStatus> : null}
            </section>
          ) : null}
          {/* B21 (OBJ-29): the reviewer's promotion — fit for a stated use, once; refused for the operator, while a challenge is live, or once invalidated. */}
          {canPromote && open.state === 'completed' && open.validity !== 'invalidated' && !open.promotion ? (
            <section aria-labelledby="pr-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
              <h3 id="pr-h" style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>Promote as fit for a stated use</h3>
              <p style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>
                A reviewer other than the run’s operator marks the result fit for a use, restating the run’s validation, sensitivity and limitations from the
                record (never re-computed); the server refuses the operator, a disputed result and a second promotion. No event is published — the state rides this page.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' }}>
                <div><label htmlFor="pr-for" style={{ display: 'block' }}>Fit for (8+ characters)</label>
                  <input id="pr-for" type="text" style={{ ...inputStyle, inlineSize: '100%' }} value={prFor} onChange={(e) => setPrFor(e.target.value)} /></div>
                <div><label htmlFor="pr-lim" style={{ display: 'block' }}>Limitations (optional; separated by ;)</label>
                  <input id="pr-lim" type="text" style={{ ...inputStyle, inlineSize: '100%' }} value={prLimitations} onChange={(e) => setPrLimitations(e.target.value)} /></div>
              </div>
              <div style={{ marginBlockStart: 'var(--eye-space-8)' }}><label htmlFor="pr-note" style={{ display: 'block' }}>Note (8+ characters)</label>
                <textarea id="pr-note" style={textareaStyle} value={prNote} onChange={(e) => setPrNote(e.target.value)} /></div>
              <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
                <GovernedButton label="Promote the result" pendingLabel="promoting" disabled={prFor.trim().length < 8 || prNote.trim().length < 8} onRun={async () => {
                  setPrProblem(null);
                  const lims = prLimitations.split(';').map((x) => x.trim()).filter((x) => x !== '');
                  const r = await api.promote(scope, open.run_id, { promotedFor: prFor.trim(), note: prNote.trim(), ...(lims.length > 0 ? { limitations: lims } : {}) });
                  if (!r.ok || r.data === undefined) { const m = refusal(r, 'the promotion was not answered'); setPrProblem(m); throw new Error(m); }
                  setPrFor(''); setPrLimitations(''); setPrNote('');
                  await afterAct(`run ${open.run_id.slice(0, 8)}… promoted: fit for ${r.data.promotion.promoted_for}`, r.data.receipt);
                }} />
              </div>
              {prProblem !== null ? <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not promoted — {prProblem}</span></LiveStatus> : null}
            </section>
          ) : null}
        </section>
      )}
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
      <Receipt receipt={receipt} />
    </>
  );
}
