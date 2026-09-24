'use client';
/**
 * Scenarios — a baseline and the branches that would replace it, each with the
 * indicator that flips it, a signpost, an owner and a consequence.
 *
 * A FLIP IS A FACT WITH A RECEIPT. A flipped branch shows the instant it flipped
 * and the event that recorded it; the state is never derived on this screen
 * from the latest number. Evaluating an indicator is a governed act and the
 * warnings it raises are listed with it.
 *
 * A REVIEW IS A PERSON'S ACT (0066 §8, L7-I05 ScenarioReviewed). Each scenario
 * carries its review state as the server records it — how many reviews, the
 * last, the next due, the retirement — and a review panel whose outcome is one
 * of the four the server accepts: continue, dissent (a position and a
 * rationale), promote a branch to simulation, retire. The result shown is the
 * review as the port recorded it, and a refusal is shown as the server states it.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useShell } from '../layout';
import { prediction, type ScenarioRow, type IndicatorRow, type ScenarioReview, type ScenarioReviewOutcome, type CoherenceCheck, type CoherenceFinding, type ScenarioCoherence } from '../../../lib/prediction';
import type { Scope } from '../../../lib/observation';
import { coherenceLabel } from '../../../lib/fitness';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const OUTCOMES: ReadonlyArray<{ value: ScenarioReviewOutcome; label: string }> = [
  { value: 'continue', label: 'continue — the branches stand; the next review falls due' },
  { value: 'dissent', label: 'dissent — a position and rationale recorded; nothing changes' },
  { value: 'promote_to_simulation', label: 'promote to simulation — the named branch becomes the candidate' },
  { value: 'retire', label: 'retire — the open branches close; the scenario leaves the portfolio' },
];
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
/** A datetime-local value → an ISO instant (null when empty); the server validates the instant. */
const toIso = (local: string): string | null => (local.trim() === '' ? null : new Date(local).toISOString());
/** A failed call, as the server answered it: status, code and message verbatim (a network failure has no code). */
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const when = (v: string | null | undefined, none: string) => (v === null || v === undefined || v === '' ? none : fmtInstant(v));

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}

function BranchState({ state }: { state: string }) {
  const map: Record<string, { glyph: string; token: string }> = {
    open: { glyph: '○', token: '--eye-color-ink-muted' }, flipped: { glyph: '⚑', token: '--eye-color-critical' }, closed: { glyph: '—', token: '--eye-color-ink-muted' },
  };
  const v = map[state] ?? (map['open'] as { glyph: string; token: string });
  return <span style={{ color: `var(${v.token})`, fontWeight: state === 'flipped' ? 650 : 400 }}><span aria-hidden="true">{v.glyph}</span> {state.toUpperCase()}</span>;
}

/** B21: the coherence flag as the row carries it — PASSED / FAILED / unchecked (glyph + label + token); a FAILED scenario is admitted, not decision-active. */
function CoherenceFlag({ state }: { state: unknown }) {
  const c = coherenceLabel(state);
  return <span style={{ color: `var(${c.token})`, fontWeight: 650 }}><span aria-hidden="true">{c.glyph}</span> {c.text}</span>;
}
/** The findings of a recorded check, verbatim: the FAIL rules first as the port ordered them, the notes beside. */
function Findings({ findings }: { findings: CoherenceFinding[] | undefined }) {
  if (findings === undefined || findings.length === 0) return <span style={muted}>no findings</span>;
  return (
    <ul style={{ margin: 0, paddingInlineStart: 'var(--eye-space-16)', ...small }}>
      {findings.map((f, i) => (
        <li key={i}>
          <strong style={{ color: f.severity === 'fail' ? 'var(--eye-color-critical)' : 'var(--eye-color-ink-muted)' }}>{f.severity === 'fail' ? '✕ FAIL' : '◍ note'}</strong>{' '}
          <Mono>{f.rule}</Mono> — {f.detail}{f.branch_id ? <> (branch <Mono>{f.branch_id.slice(0, 8)}…</Mono>{f.other_branch_id ? <> and <Mono>{f.other_branch_id.slice(0, 8)}…</Mono></> : null})</> : null}
        </li>
      ))}
    </ul>
  );
}
/**
 * B21 (0081, L7-I04 ScenarioCoherenceFailed): the scenario's coherence as the server records it. The list row carries the state and the
 * check's id; the recorded findings are read from the get on request; a reviewer's check (`prediction.scenario.check`, trigger operator)
 * records a new check — a FAILED outcome is recorded, never a refusal — and the answer is shown as the port returned it.
 */
function CoherencePanel({ s, scope, canCheck, onChanged }: { s: ScenarioRow; scope: Scope; canCheck: boolean; onChanged: () => Promise<void> }) {
  const [recorded, setRecorded] = useState<ScenarioCoherence | CoherenceCheck | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const state = s.coherence_state ?? 'unchecked';
  const outcomeOf = (c: ScenarioCoherence | CoherenceCheck): string => ('outcome' in c ? c.outcome : c.state);
  return (
    <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
      <p style={{ ...small, margin: 0 }}>
        coherence <CoherenceFlag state={state} />
        {s.coherence_check_id ? <> · check <Mono>{s.coherence_check_id.slice(0, 8)}…</Mono></> : null}
        {state === 'failed' ? <span style={muted}> — admitted, not decision-active: no branch of it is simulated and no review promotes it until the findings are resolved (retire it and declare a successor)</span>
          : state === 'unchecked' ? <span style={muted}> — nothing has checked this scenario (declared before 0081, or never reviewed since)</span> : null}
      </p>
      <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', marginBlockStart: 'var(--eye-space-4)' }}>
        {state === 'unchecked' ? null : (
          <GovernedButton label="Show the recorded check" pendingLabel="reading" variant="quiet" onRun={async () => {
            setProblem(null);
            const r = await prediction.getScenario(scope, s.scenario_id);
            if (!r.ok || r.data === undefined) { const m = refusal(r, 'the scenario could not be read'); setProblem(m); throw new Error(m); }
            setRecorded(r.data.scenario.coherence ?? { state: 'unchecked' });
          }} />
        )}
        {canCheck && s.state !== 'retired' ? (
          <GovernedButton label="Check coherence now" pendingLabel="checking" variant="quiet" onRun={async () => {
            setProblem(null);
            const r = await prediction.checkCoherence(scope, s.scenario_id);
            if (!r.ok || r.data === undefined) { const m = refusal(r, 'the check was not answered'); setRecorded(null); setReceipt(null); setProblem(m); throw new Error(m); }
            setRecorded(r.data.coherence); setReceipt(r.data.receipt);
            await onChanged();
          }} />
        ) : null}
      </div>
      {problem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not checked — {problem}</span></LiveStatus>}
      {recorded === null ? null : (
        <dl>
          <DefinitionRow term="Coherence check">
            outcome <CoherenceFlag state={outcomeOf(recorded)} />
            {'check_id' in recorded && recorded.check_id ? <> · check <Mono>{String(recorded.check_id).slice(0, 8)}…</Mono></> : null}
            {'rule_version' in recorded && recorded.rule_version ? <> · rule v{recorded.rule_version}</> : null}
            {'checked_at' in recorded && recorded.checked_at ? <> · {fmtInstant(recorded.checked_at)}</> : null}
            {'trigger' in recorded && recorded.trigger ? <> · trigger <Mono>{recorded.trigger}</Mono></> : null}
            {'changed' in recorded ? <> · {recorded.changed ? `changed (was ${recorded.prior_state})` : 'unchanged'}</> : null}
            <Findings findings={recorded.findings} />
          </DefinitionRow>
        </dl>
      )}
      <Receipt receipt={receipt} />
    </div>
  );
}

/** The scenario's review state, as the listing row carries it (0066 §8): counts and instants verbatim, nothing derived from the clock. */
function ReviewState({ s }: { s: ScenarioRow }) {
  return (
    <p style={{ ...muted, ...small }}>
      state <strong style={{ color: s.state === 'retired' ? 'var(--eye-color-critical)' : 'var(--eye-color-ink-default)' }}>{s.state.toUpperCase()}</strong>
      {' · '}reviews {s.reviews === undefined ? '—' : String(s.reviews)}
      {' · '}last reviewed {when(s.last_reviewed_at, 'never')}
      {' · '}next review due {when(s.next_review_due_at, s.state === 'retired' ? 'none (retired)' : 'not set')}
      {s.retired_at === null || s.retired_at === undefined ? null : <> · retired {fmtInstant(s.retired_at)}{s.retirement_reason ? <> — {s.retirement_reason}</> : null}</>}
    </p>
  );
}

/** The review as the port recorded it — VERBATIM. */
function RecordedReview({ r }: { r: ScenarioReview }) {
  const links = r.links ?? { forecast_id: null, decision_objects: [], dependents: [], simulation_runs: [] };
  return (
    <dl>
      <DefinitionRow term="Recorded">review <Mono>{String(r.review_ordinal)}</Mono> of scenario <Mono>{r.scenario_id}</Mono> · outcome <Mono>{r.outcome}</Mono> · state after <strong>{r.state_after}</strong></DefinitionRow>
      <DefinitionRow term="Branch">{r.branch === null ? 'none named' : <><Mono>{r.branch.branch_id}</Mono> · {r.branch.kind} · state after <strong>{r.branch.state_after}</strong></>}</DefinitionRow>
      <DefinitionRow term="Next review due">{r.next_review_due_at === null ? (r.outcome === 'retire' ? 'none — the scenario is retired' : 'not set (the cadence names no interval)') : fmtInstant(r.next_review_due_at)} · cadence {r.cadence ?? '—'}</DefinitionRow>
      <DefinitionRow term="Branches closed">{String(r.branches_closed)}</DefinitionRow>
      <DefinitionRow term="Links named in ScenarioReviewed">
        forecast {links.forecast_id === null ? 'none' : <Mono>{links.forecast_id}</Mono>}
        {' · '}{links.decision_objects.length} decision object(s){links.decision_objects.length > 0 ? <> (<Mono>{links.decision_objects.join(', ')}</Mono>)</> : null}
        {' · '}{links.dependents.length} dependent(s){links.dependents.length > 0 ? <> (<Mono>{links.dependents.map((d) => `${d.type} ${d.id}`).join(', ')}</Mono>)</> : null}
        {' · '}{links.simulation_runs.length} simulation run(s){links.simulation_runs.length > 0 ? <> (<Mono>{links.simulation_runs.join(', ')}</Mono>)</> : null}
      </DefinitionRow>
      {/* B21: a continuation or a promotion re-checked the scenario first; a dissent or a retirement checked nothing. */}
      {r.coherence === undefined ? null : (
        <DefinitionRow term="Coherence (re-checked by this review)">
          {r.coherence === null ? <span style={muted}>not checked by this outcome</span> : <>
            outcome <CoherenceFlag state={r.coherence.outcome} /> · check <Mono>{r.coherence.check_id.slice(0, 8)}…</Mono> · rule v{r.coherence.rule_version} · {r.coherence.changed ? `changed (was ${r.coherence.prior_state})` : 'unchanged'}
            <Findings findings={r.coherence.findings} />
          </>}
        </DefinitionRow>
      )}
    </dl>
  );
}

/**
 * The review panel of one scenario. The outcome names the fields it needs: a dissent its position and rationale, a
 * promotion its branch; a continuation may name the next review. Only the note's length is gated here (the exemplar's
 * rule for a reason); everything else is the server's to refuse, and its refusal is shown as it states it.
 */
function ReviewPanel({ s, scope, onRecorded }: { s: ScenarioRow; scope: Scope; onRecorded: () => Promise<void> }) {
  const idp = `rv-${s.scenario_id}`;
  const [outcome, setOutcome] = useState<ScenarioReviewOutcome>('continue');
  const [branchId, setBranchId] = useState('');
  const [note, setNote] = useState('');
  const [position, setPosition] = useState('');
  const [rationale, setRationale] = useState('');
  const [nextReviewBy, setNextReviewBy] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [recorded, setRecorded] = useState<ScenarioReview | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const sel = (id: string, value: string, onChange: (v: string) => void, options: ReactNode) => (
    <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)}>{options}</select>
  );
  const txt = (id: string, value: string, onChange: (v: string) => void, type = 'text') => (
    <input id={id} type={type} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)} />
  );

  if (s.state === 'retired') {
    return (
      <section aria-labelledby={`${idp}-h`} style={{ marginBlockStart: 'var(--eye-space-16)' }}>
        <h3 id={`${idp}-h`} style={h3}>Review</h3>
        <p style={muted}>
          Retired {when(s.retired_at, 'at an instant the row does not carry')}: a retired scenario is not reviewed again (declare a successor). Its history stays as recorded.
        </p>
        {/* The retirement this panel recorded (the listing reloads to the retired row; the review and its receipt stay shown). */}
        {recorded !== null && <RecordedReview r={recorded} />}
        <Receipt receipt={receipt} />
      </section>
    );
  }

  return (
    <section aria-labelledby={`${idp}-h`} style={{ marginBlockStart: 'var(--eye-space-16)' }}>
      <h3 id={`${idp}-h`} style={h3}>Review — {s.title}</h3>
      <p style={muted}>
        A person's act under the purpose <Mono>prediction</Mono>, human-gated: the server accepts a strategy owner, a forecast owner, a domain
        administrator or a platform administrator and refuses a workload principal. The review is recorded on the scenario's log and published as <Mono>ScenarioReviewed</Mono>{' '}
        naming the scenario's links. Cadence <Mono>{s.review_cadence}</Mono>: without a named instant the next review falls due by the cadence's
        interval (daily, weekly, monthly, quarterly; another cadence leaves it open).
      </p>
      <div style={rowStyle}>
        <Field id={`${idp}-outcome`} label="Outcome">
          {/* B21: a promotion of a FAILED scenario is refused by the server (a failed coherence check prohibits promotion); the option says so and is disabled. */}
          {(id) => sel(id, outcome, (v) => setOutcome(v as ScenarioReviewOutcome), OUTCOMES.map((o) => (
            <option key={o.value} value={o.value} disabled={o.value === 'promote_to_simulation' && s.coherence_state === 'failed'}>
              {o.label}{o.value === 'promote_to_simulation' && s.coherence_state === 'failed' ? ' — refused: the scenario failed its coherence check; resolve the findings and review again' : ''}
            </option>
          )))}
        </Field>
        {outcome === 'retire' ? null : (
          <Field id={`${idp}-branch`} label={outcome === 'promote_to_simulation' ? 'Branch (a promotion names the branch it promotes)' : 'Branch (optional; a dissent may name the branch it dissents on)'}>
            {(id) => sel(id, branchId, setBranchId, [
              <option key="" value="">{outcome === 'promote_to_simulation' ? '— name a branch —' : '— none (the scenario as a whole) —'}</option>,
              ...s.branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.name} · {b.kind} · {b.state}{b.simulation_candidate_at ? ' · already a simulation candidate' : ''}</option>),
            ])}
          </Field>
        )}
        {outcome === 'retire' ? null : (
          <Field id={`${idp}-next`} label="Next review by (optional; otherwise the cadence names it)">
            {(id) => txt(id, nextReviewBy, setNextReviewBy, 'datetime-local')}
          </Field>
        )}
      </div>
      {outcome === 'dissent' ? (
        <div style={{ ...rowStyle, marginBlockStart: 'var(--eye-space-8)' }}>
          <Field id={`${idp}-pos`} label="Position (4+ characters; the server refuses a dissent without one)">{(id) => txt(id, position, setPosition)}</Field>
          <Field id={`${idp}-rat`} label="Rationale (8+ characters)">{(id) => txt(id, rationale, setRationale)}</Field>
        </div>
      ) : null}
      <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
        <Field id={`${idp}-note`} label={outcome === 'retire' ? 'Note (8+ characters; recorded as the retirement reason)' : 'Note (8+ characters)'}>
          {(id) => <textarea id={id} style={textareaStyle} value={note} onChange={(e) => setNote(e.target.value)} />}
        </Field>
      </div>
      <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
        <GovernedButton label={outcome === 'retire' ? 'Retire the scenario' : 'Record the review'} pendingLabel="recording"
          variant={outcome === 'retire' ? 'critical' : 'primary'} disabled={note.trim().length < 8}
          onRun={async () => {
            setProblem(null);
            const r = await prediction.reviewScenario(scope, s.scenario_id, {
              outcome, note: note.trim(),
              branch_id: outcome === 'retire' || branchId === '' ? null : branchId,
              dissent: outcome === 'dissent' ? { position: position.trim(), rationale: rationale.trim() } : null,
              next_review_by: outcome === 'retire' ? null : toIso(nextReviewBy),
            });
            if (!r.ok || r.data === undefined) { const m = refusal(r, 'the review was not answered'); setRecorded(null); setReceipt(null); setProblem(m); throw new Error(m); }
            setRecorded(r.data.review); setReceipt(r.data.receipt);
            setNote(''); setPosition(''); setRationale(''); setNextReviewBy(''); setBranchId('');
            await onRecorded();
          }} />
      </div>
      {problem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not recorded — {problem}</span></LiveStatus>}
      {recorded !== null && <RecordedReview r={recorded} />}
      <Receipt receipt={receipt} />
    </section>
  );
}

export default function ScenariosPage() {
  const { scope, isForecastOwner, isStrategyOwner } = useShell();
  const [rows, setRows] = useState<ScenarioRow[] | null>(null);
  const [indicators, setIndicators] = useState<IndicatorRow[]>([]);
  const [open, setOpen] = useState<ScenarioRow | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [lastEval, setLastEval] = useState<string | null>(null);

  const load = async () => {
    const [s, i] = await Promise.all([prediction.listScenarios(scope), prediction.listIndicators(scope)]);
    if (!s.ok || s.data === undefined) { setProblem(s.error?.message ?? 'the scenarios could not be read'); return; }
    setRows(s.data.scenarios);
    if (i.ok && i.data !== undefined) setIndicators(i.data.indicators);
  };
  useEffect(() => { void load(); }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (rows === null) return <Empty>reading scenarios…</Empty>;

  const ind = (id: string | null) => indicators.find((x) => x.indicator_id === id) ?? null;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Scenarios</h1>
      {rows.length === 0 ? <Empty>No scenario tree has been declared yet.</Empty> : rows.map((s) => (
        <section key={s.scenario_id} aria-labelledby={`scn-${s.scenario_id}`} style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id={`scn-${s.scenario_id}`} style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{s.title}</h2>
          <p>{s.statement}</p>
          <p style={{ color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-label-sm)' }}>
            owner <Mono>{s.owner_principal_id.slice(0, 8)}…</Mono> · review {s.review_cadence} · declared {fmtInstant(s.declared_at)}
            {s.forecast_id === null ? null : <> · built on forecast <Mono>{s.forecast_id.slice(0, 8)}…</Mono></>}
          </p>
          <ReviewState s={s} />
          <CoherencePanel s={s} scope={scope} canCheck={isForecastOwner || isStrategyOwner} onChanged={load} />
          <ScrollBox label={`branches of ${s.title}`}>
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Branch</Th><Th>Kind</Th><Th>Divergence · assumptions</Th><Th>State</Th><Th>Indicator</Th><Th>Signpost</Th><Th>Owner</Th><Th>Window · deadline</Th><Th>Consequence</Th><Th>Simulation candidate</Th></tr></thead>
            <tbody>
              {s.branches.map((b) => {
                const i = ind(b.indicator_id);
                return (
                  <tr key={b.branch_id}>
                    <Td>{b.name}</Td>
                    {/* The kind is a member of the versioned vocabulary (v1: the eight of Volume 0 ch. 14); a
                        user-defined kind shows the name it gave itself beside the vocabulary word. */}
                    <Td><Mono>{b.kind}</Mono>{b.kind === 'user-defined' && b.kind_label ? <div style={{ fontSize: 'var(--eye-type-label-sm)' }}>“{b.kind_label}”</div> : null}
                      {b.kind_vocabulary_version === undefined || b.kind_vocabulary_version === null ? null : <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>vocabulary v{b.kind_vocabulary_version}</div>}</Td>
                    <Td>{b.divergence ? <div>{b.divergence}</div> : <div style={{ color: 'var(--eye-color-ink-muted)' }}>{b.kind === 'baseline' ? 'the baseline' : 'diverges by its indicator'}</div>}
                      {Array.isArray(b.assumptions) && b.assumptions.length > 0 ? (
                        <ul aria-label={`assumptions of ${b.name}`} style={{ margin: 'var(--eye-space-4) 0 0', paddingInlineStart: 'var(--eye-space-16)', fontSize: 'var(--eye-type-label-sm)' }}>
                          {b.assumptions.map((a, k) => <li key={k}>{a.statement}{a.basis ? <span style={{ color: 'var(--eye-color-ink-muted)' }}> — {a.basis}</span> : null}</li>)}
                        </ul>) : <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>no assumptions declared</div>}</Td>
                    <Td><BranchState state={b.state} />{b.flipped_at === null ? null : <div style={{ fontSize: 'var(--eye-type-label-sm)' }}>{fmtInstant(b.flipped_at)} · event <Mono>{String(b.flip_event_id).slice(0, 8)}…</Mono></div>}
                      {b.warning_state === 'owed' ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-critical)', fontWeight: 650 }}>⚠ WARNING OWED — the raise failed; the next evaluation retries it</div> : null}</Td>
                    <Td>{i === null ? '—' : <>{i.series_key} {i.comparator} {i.threshold} for {i.consecutive_days} day(s){i.observes_from ? ` · from ${String(i.observes_from).slice(0, 10)}` : ''}{i.breached ? ' · BREACHED' : ` · streak ${i.streak}`}</>}</Td>
                    <Td>{b.signpost ?? '—'}</Td>
                    <Td mono>{b.owner_principal_id.slice(0, 8)}…</Td>
                    <Td>{b.response_window_hours} h{b.decision_deadline === undefined || b.decision_deadline === null ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>no deadline · T3 unmeasured</div> : <div style={{ fontSize: 'var(--eye-type-label-sm)' }}>by {fmtInstant(b.decision_deadline)}</div>}</Td>
                    <Td>{b.consequence}{b.consequence_class ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>class <Mono>{b.consequence_class}</Mono> (declared)</div>
                      : <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>class not declared — a warning assumes C2 and says so</div>}</Td>
                    {/* 0066 §8: the instant a review promoted the branch to simulation, as the row carries it; nothing is derived. */}
                    <Td>{b.simulation_candidate_at === null || b.simulation_candidate_at === undefined
                      ? <span style={{ color: 'var(--eye-color-ink-muted)' }}>not promoted</span>
                      : <>candidate since {fmtInstant(b.simulation_candidate_at)}</>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </ScrollBox>
          {isForecastOwner ? s.branches.filter((b) => b.indicator_id !== null).map((b) => (
            <GovernedButton key={b.branch_id} label={`Evaluate "${b.name}" against what is known now`} pendingLabel="evaluating" variant="quiet"
              onRun={async () => {
                const r = await prediction.evaluateIndicator(scope, b.indicator_id as string);
                if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the evaluation was refused');
                setReceipt(r.data.receipt);
                setLastEval(`${r.data.evaluation.evaluated} new observation(s) evaluated · streak ${r.data.evaluation.streak} · `
                  + (r.data.evaluation.flips.length === 0 ? 'no flip' : `${r.data.evaluation.flips.length} flip(s), ${r.data.warnings.length} warning(s) raised`)
                  + (r.data.evaluation.owedRecovered > 0 ? ` · ${r.data.evaluation.owedRecovered} owed warning(s) recovered` : ''));
                await load();
              }} />
          )) : null}
          <ReviewPanel s={s} scope={scope} onRecorded={load} />
        </section>
      ))}
      {lastEval === null ? null : <LiveStatus>{lastEval}</LiveStatus>}
      <Receipt receipt={receipt} />
      <UnknownNote>A branch flips only when its indicator has been breached for the declared run of consecutive observations, and every
        flip raises a warning to the branch owner with a response window. Nothing here re-renders a state from the latest number.</UnknownNote>
      <UnknownNote>A review is a person's act: the review state and each branch's simulation candidacy above are the server's records, and
        a recorded review is shown as the port returned it. A dissent changes nothing on the scenario; a retirement closes the open
        branches (a flipped branch keeps its history) and a retired scenario is not reviewed again.</UnknownNote>
      <UnknownNote>Coherence (0081) is a versioned, structural check over what the product holds — duplicate branches, an assumption whose claim
        basis was withdrawn, rejected, contradicted or superseded, a forecast withdrawn or assessed unfit, a decision due before its indicator
        observes, a retired subject — run at declaration, before a continuation or a promotion, by the scenario consumer, and on request. A
        free-text assumption is noted, never judged; coverage is a note for the review. A FAILED scenario is admitted and not decision-active.</UnknownNote>
    </>
  );
}
