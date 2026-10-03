'use client';
/**
 * Decision review — CP-6 B35 part `reopen` (migration 0101 §P; F-P6-06; the B35 pieces of F-P4-08 / F-P4-09; §B36.12 row 11).
 *
 * One page for what happens AFTER a decision: the changes of conditions recorded against a commitment and the REOPEN on a recorded cause
 * (six kinds — an invalidated input, a breach, a policy change, an upheld challenge, an upheld appeal, a change of conditions); the scenarios a
 * reopened decision rests on, their owners asked to RE-VERSION them (the re-versioning itself is the scenario route's); the OUTCOME
 * ASSESSMENT in four separate fields (observed result, inferred contribution, counterfactual claim, changed conditions); the review terms
 * (baseline, replay horizon, evidence standard); a replay WITH its reason; the lessons linked to governed memory records; the DECISION
 * METRICS (completeness — the missing and disputed evidence named —, evidence coverage, time-to-decision, reversibility, outcome linkage);
 * each scenario set's REVIEW CADENCE and its misses; the scenarios live packages cite outside every active set with their relevance.
 *
 * Every number is the SERVER's. The forms are shown to everyone; the server decides who may, and its refusal is shown as it states it.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useShell } from '../layout';
import {
  review as api, BASELINE_KINDS, EVIDENCE_STANDARDS, INFERENCE_METHODS, REOPEN_CAUSES, causeWords, changedOf, completenessLine, evidenceOf, hoursWords, reversionMark,
  separationProblem, shareWords, type CitedRow, type Metrics, type PackageRow, type ReopenCause, type Review, type ReversionRow, type SetRow,
} from '../../../lib/reopen-b35';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
type Answer = { ok: boolean; status: number; error?: { code: string; message: string }; data?: { receipt: ReceiptT } };
const refusal = (r: Answer, fallback: string) => `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const toIso = (v: string): string | null => { if (v.trim() === '') return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };

function Mark({ m }: { m: { glyph: string; token: string; text: string } }) {
  return <span style={{ color: `var(${m.token})`, border: `1px solid var(${m.token})`, borderRadius: 'var(--eye-radius-sm)', paddingInline: 'var(--eye-space-4)', fontSize: 'var(--eye-type-label-sm)', fontWeight: 650, whiteSpace: 'nowrap' }}>
    <span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}
function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return <section aria-labelledby={id} style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-16)' }}><h2 id={id} style={h2}>{title}</h2>{children}</section>;
}

/** A governed act: the receipt kept, the server's refusal shown as it states it. */
function useAct(onDone: () => Promise<void>) {
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const act = async (label: string, run: () => Promise<Answer>) => {
    setProblem(null);
    const r = await run();
    if (!r.ok || r.data === undefined) { const m = `not ${label} — ${refusal(r, 'no answer')}`; setProblem(m); throw new Error(m); }
    setReceipt(r.data.receipt); await onDone();
  };
  const status = <>{problem !== null && <LiveStatus assertive><span style={critical}>{problem}</span></LiveStatus>}<Receipt receipt={receipt} /></>;
  return { act, status };
}

/* ───────────── the metrics (ES-39-008) ───────────── */
function MetricsCard({ m }: { m: Metrics }) {
  const c = m.completeness;
  return (
    <Section id="rv-metrics" title="Decision metrics">
      <p><strong>Completeness</strong>: {completenessLine(c)}{c.appeals_open > 0 && <span style={critical}> · {c.appeals_open} appeal(s) open</span>}</p>
      <ul aria-label="completeness criteria">
        {c.criteria.map((x) => <li key={x.key}><span aria-hidden="true">{x.met ? '●' : '○'}</span> {x.met ? 'met' : 'NOT MET'} — {x.key.replace(/_/g, ' ')}: <span style={muted}>{x.detail}</span></li>)}
      </ul>
      {c.disputed.length > 0 && <><h3 style={h3}>Disputed or withdrawn evidence</h3><ul>{c.disputed.map((d) => <li key={`${d.option_key}-${d.id}`}>{d.standing.toUpperCase()} — {d.kind} <Mono>{d.id}</Mono> (option {d.option_key})</li>)}</ul></>}
      {c.missing.length > 0 && <><h3 style={h3}>Missing</h3><ul>{c.missing.map((x, i) => <li key={i}>{String(x['what'] ?? '')}{x['detail'] !== undefined ? <span style={muted}> — {String(x['detail'])}</span> : null}</li>)}</ul></>}
      {c.post_commitment_notes.length > 0 && <p>{c.post_commitment_notes.length} note(s) recorded after the commitment (a recorded cause a reopen may name).</p>}
      <div style={grid}>
        <div><strong>Evidence coverage</strong><p>{c.disputed.length === 0 ? 'every citation stands' : `${shareWords(m.evidence_coverage.share)} of ${m.evidence_coverage.citations} citations stand`}; {m.evidence_coverage.decision_grade_runs} of {m.evidence_coverage.runs} runs decision-grade; standard {m.evidence_coverage.standard ?? 'not set'}{m.evidence_coverage.meets_standard === null ? '' : m.evidence_coverage.meets_standard ? ' — MET' : ' — NOT MET'}</p></div>
        <div><strong>Time to decision</strong><p>{m.time_to_decision.hours !== null ? hoursWords(m.time_to_decision.hours) : `open for ${hoursWords(m.time_to_decision.open_hours)}`}; reopened {m.time_to_decision.reopens} time(s)</p></div>
        <div><strong>Reversibility</strong><p>{m.reversibility.stated ?? 'not stated'}; {m.reversibility.options_stating} option(s) state theirs{m.reversibility.last_cause !== null ? `; last reopened because ${causeWords(m.reversibility.last_cause)}` : ''}</p></div>
        <div><strong>Outcome linkage</strong><p>{m.outcome_linkage.outcomes_recorded} of {m.outcome_linkage.criteria} criteria observed ({shareWords(m.outcome_linkage.share)}); {m.outcome_linkage.assessments} assessment(s), {m.outcome_linkage.lessons} lesson(s){m.outcome_linkage.linked ? ' — LINKED' : ''}</p></div>
      </div>
      <p style={muted}>as of {fmtInstant(m.as_of)} (the database's clock)</p>
    </Section>
  );
}

/* ───────────── a package's review ───────────── */
function PackageReview({ pkg, onChanged }: { pkg: string; onChanged: () => Promise<void> }) {
  const { scope } = useShell();
  const [rv, setRv] = useState<Review | null>(null);
  const [m, setM] = useState<Metrics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api.get(scope, pkg);
    if (!r.ok || r.data === undefined) { setErr(refusal(r as Answer, 'no review')); return; }
    setErr(null); setRv(r.data.review); setM(r.data.metrics);
  }, [scope, pkg]);
  useEffect(() => { void load(); }, [load]);
  const done = async () => { await load(); await onChanged(); };
  const { act, status } = useAct(done);
  // forms
  const [chTitle, setChTitle] = useState(''); const [chStatement, setChStatement] = useState(''); const [chEvidence, setChEvidence] = useState('');
  const [causeKind, setCauseKind] = useState<ReopenCause>('conditions_changed'); const [causeRef, setCauseRef] = useState('');
  const [bKind, setBKind] = useState('stated'); const [bRef, setBRef] = useState(''); const [bStatement, setBStatement] = useState(''); const [horizon, setHorizon] = useState('180');
  const [standard, setStandard] = useState('reviewed'); const [stdNote, setStdNote] = useState('');
  const [oIds, setOIds] = useState(''); const [oStatement, setOStatement] = useState(''); const [iStatement, setIStatement] = useState(''); const [iMethod, setIMethod] = useState('attribution_rule');
  const [iConf, setIConf] = useState('0.6'); const [cfClaim, setCfClaim] = useState(''); const [cfKind, setCfKind] = useState('stated_model'); const [cfBasis, setCfBasis] = useState(''); const [changed, setChanged] = useState('');
  const [replayReason, setReplayReason] = useState(''); const [lessonAssessment, setLessonAssessment] = useState(''); const [lessonKind, setLessonKind] = useState<'hypothesis' | 'lesson'>('lesson'); const [lessonItem, setLessonItem] = useState('');
  if (err !== null) return <p style={critical}>{err}</p>;
  if (rv === null) return <Empty>loading the review…</Empty>;
  const committed = rv.committed_version;
  const latestTerms = rv.review_terms.filter((t) => t.version === rv.current_version).at(-1) ?? null;
  const latestAssessment = rv.outcome_assessments.filter((a) => a.version === committed).at(-1) ?? null;
  const sep = separationProblem({ observed: oStatement, inferred: iStatement, counterfactual: cfClaim, changed: changedOf(changed).map((c) => c.condition) });
  return (
    <>
      <h2 style={h2}>{rv.title} <span style={muted}>— {rv.state}, version {rv.current_version ?? '—'}{committed !== null ? `, committed v${committed}` : ''}{rv.reopens > 0 ? `, reopened ${rv.reopens}×` : ''}</span></h2>
      {rv.reopen_cause !== null && <p>Last reopened because {causeWords(String(rv.reopen_cause['kind']))} (<Mono>{String(rv.reopen_cause['ref'])}</Mono>).</p>}
      {status}
      {m !== null && <MetricsCard m={m} />}

      <Section id="rv-change" title="Changes of conditions and the reopen">
        {rv.condition_changes.length === 0 ? <Empty>no change of conditions is recorded</Empty> : (
          <ul>{rv.condition_changes.map((c) => <li key={c.change_id}><strong>{c.title}</strong> — {c.statement} <span style={muted}>({fmtInstant(c.recorded_at)}; against v{c.committed_version}; evidence {c.evidence.map((e) => `${e.kind} ${e.id.slice(0, 8)}…`).join(', ')}; id <Mono>{c.change_id}</Mono>)</span></li>)}</ul>
        )}
        <div style={grid}>
          <Field id="rv-ch-title" label="The change (its name)">{(id) => <input id={id} style={inputStyle} value={chTitle} onChange={(e) => setChTitle(e.target.value)} />}</Field>
          <Field id="rv-ch-statement" label="What changed">{(id) => <textarea id={id} style={textareaStyle} value={chStatement} onChange={(e) => setChStatement(e.target.value)} />}</Field>
          <Field id="rv-ch-evidence" label="Evidence (one per line: kind:id note)">{(id) => <textarea id={id} style={textareaStyle} value={chEvidence} onChange={(e) => setChEvidence(e.target.value)} placeholder="warning:… the corridor reopens" />}</Field>
        </div>
        <GovernedButton label="Record the change of conditions" pendingLabel="recording" onRun={() => act('recorded', () => api.recordChange(scope, pkg, { title: chTitle, statement: chStatement, evidence: evidenceOf(chEvidence) }) as Promise<Answer>)} />
        <h3 style={h3}>Reopen on a recorded cause</h3>
        <div style={grid}>
          <Field id="rv-cause" label="Cause">{(id) => <select id={id} style={inputStyle} value={causeKind} onChange={(e) => setCauseKind(e.target.value as ReopenCause)}>{REOPEN_CAUSES.map((k) => <option key={k} value={k}>{causeWords(k)}</option>)}</select>}</Field>
          <Field id="rv-cause-ref" label="The recorded cause's id">{(id) => <input id={id} style={inputStyle} value={causeRef} onChange={(e) => setCauseRef(e.target.value.trim())} />}</Field>
        </div>
        <GovernedButton label="Reopen the decision" pendingLabel="reopening" variant="critical" onRun={() => act('reopened', () => api.reopen(scope, pkg, { kind: causeKind, ref: causeRef }) as Promise<Answer>)} />
      </Section>

      <Section id="rv-reversions" title="Scenarios to re-version">
        {rv.reversion_requests.length === 0 ? <Empty>no scenario was asked to re-version for this decision</Empty> : (
          <ScrollBox label="reversion requests"><table style={tableStyle}><thead><tr><Th>State</Th><Th>Scenario</Th><Th>Version then → now</Th><Th>Cause</Th><Th>Requested</Th></tr></thead><tbody>
            {rv.reversion_requests.map((r) => <tr key={r.request_id}><Td><Mark m={reversionMark(r.state)} /></Td><Td>{r.scenario_title ?? r.scenario_id}</Td>
              <Td>v{r.scenario_version_at_request} → v{r.scenario_version_now ?? '—'}</Td><Td>{causeWords(String((r as unknown as { cause: Record<string, unknown> }).cause?.['kind'] ?? r.cause_kind ?? ''))}</Td><Td>{fmtInstant(r.requested_at)}</Td></tr>)}
          </tbody></table></ScrollBox>
        )}
      </Section>

      <Section id="rv-terms" title="Review terms (baseline, replay horizon, evidence standard)">
        {latestTerms === null ? <Empty>no review terms on version {rv.current_version}</Empty> :
          <p>v{latestTerms.terms_version}: baseline {latestTerms.baseline.kind}{latestTerms.baseline.ref !== null ? ` ${latestTerms.baseline.ref}` : ''} — {latestTerms.baseline.statement}; replay horizon {latestTerms.replay_horizon_days} days; evidence standard <strong>{latestTerms.evidence_standard}</strong> — {latestTerms.evidence_note}</p>}
        <div style={grid}>
          <Field id="rv-b-kind" label="Baseline kind">{(id) => <select id={id} style={inputStyle} value={bKind} onChange={(e) => setBKind(e.target.value)}>{BASELINE_KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}</select>}</Field>
          <Field id="rv-b-ref" label="Baseline reference (run id or criterion key)">{(id) => <input id={id} style={inputStyle} value={bRef} onChange={(e) => setBRef(e.target.value.trim())} />}</Field>
          <Field id="rv-b-statement" label="Baseline statement">{(id) => <input id={id} style={inputStyle} value={bStatement} onChange={(e) => setBStatement(e.target.value)} />}</Field>
          <Field id="rv-horizon" label="Replay horizon (days after the commitment)">{(id) => <input id={id} type="number" min={1} max={3650} style={inputStyle} value={horizon} onChange={(e) => setHorizon(e.target.value)} />}</Field>
          <Field id="rv-standard" label="Evidence standard">{(id) => <select id={id} style={inputStyle} value={standard} onChange={(e) => setStandard(e.target.value)}>{EVIDENCE_STANDARDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}</select>}</Field>
          <Field id="rv-std-note" label="What the standard requires">{(id) => <input id={id} style={inputStyle} value={stdNote} onChange={(e) => setStdNote(e.target.value)} />}</Field>
        </div>
        <GovernedButton label="Set the review terms" pendingLabel="setting" onRun={() => act('set', () => api.setTerms(scope, pkg, rv.current_version ?? 1, {
          baseline: { kind: bKind, ref: bKind === 'stated' ? null : bRef, statement: bStatement }, replayHorizonDays: Number(horizon), evidenceStandard: standard, evidenceNote: stdNote,
          expectedVersion: latestTerms?.terms_version ?? null }) as Promise<Answer>)} />
      </Section>

      <Section id="rv-outcome" title="Outcome assessment — four separate fields">
        {latestAssessment === null ? <Empty>no outcome assessment of the committed version</Empty> : (
          <div style={grid}>
            <div><h3 style={h3}>Observed result</h3><p>{latestAssessment.observed.statement}</p><ul>{latestAssessment.observed.outcomes.map((o) => <li key={o.outcome_id}>{o.criterion_key}: {String(o.observed_value)} {o.unit ?? ''} (target {o.comparator} {o.target}) — {o.met ? 'met' : 'NOT met'}</li>)}</ul></div>
            <div><h3 style={h3}>Inferred contribution</h3><p>{latestAssessment.inferred.statement}</p><p style={muted}>method {latestAssessment.inferred.method.replace(/_/g, ' ')}; confidence {latestAssessment.inferred.confidence}</p></div>
            <div><h3 style={h3}>Counterfactual claim</h3><p>{latestAssessment.counterfactual.claim}</p><p style={muted}>basis: {latestAssessment.counterfactual.basis.kind === 'run' ? `run ${latestAssessment.counterfactual.basis.run_id}` : latestAssessment.counterfactual.basis.model}</p></div>
            <div><h3 style={h3}>Changed conditions</h3>{latestAssessment.changed_conditions.length === 0 ? <Empty>none recorded</Empty> : <ul>{latestAssessment.changed_conditions.map((c, i) => <li key={i}>{c.condition}{c.effect !== null ? ` — ${c.effect}` : ''}</li>)}</ul>}</div>
            <p style={muted}>v{latestAssessment.assessment_version} by <Mono>{latestAssessment.assessed_by}</Mono> at {fmtInstant(latestAssessment.assessed_at)}; id <Mono>{latestAssessment.assessment_id}</Mono></p>
          </div>
        )}
        <fieldset><legend>Observed result</legend>
          <Field id="rv-o-ids" label="Recorded outcome ids (one per line)">{(id) => <textarea id={id} style={textareaStyle} value={oIds} onChange={(e) => setOIds(e.target.value)} />}</Field>
          <Field id="rv-o-statement" label="What was observed">{(id) => <textarea id={id} style={textareaStyle} value={oStatement} onChange={(e) => setOStatement(e.target.value)} />}</Field>
        </fieldset>
        <fieldset><legend>Inferred contribution</legend>
          <Field id="rv-i-statement" label="What the decision is inferred to have contributed">{(id) => <textarea id={id} style={textareaStyle} value={iStatement} onChange={(e) => setIStatement(e.target.value)} />}</Field>
          <div style={grid}>
            <Field id="rv-i-method" label="Method">{(id) => <select id={id} style={inputStyle} value={iMethod} onChange={(e) => setIMethod(e.target.value)}>{INFERENCE_METHODS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}</select>}</Field>
            <Field id="rv-i-conf" label="Confidence (0 to 1)">{(id) => <input id={id} type="number" min={0} max={1} step={0.05} style={inputStyle} value={iConf} onChange={(e) => setIConf(e.target.value)} />}</Field>
          </div>
        </fieldset>
        <fieldset><legend>Counterfactual claim</legend>
          <Field id="rv-cf-claim" label="What would have happened without the decision">{(id) => <textarea id={id} style={textareaStyle} value={cfClaim} onChange={(e) => setCfClaim(e.target.value)} />}</Field>
          <div style={grid}>
            <Field id="rv-cf-kind" label="Basis">{(id) => <select id={id} style={inputStyle} value={cfKind} onChange={(e) => setCfKind(e.target.value)}><option value="stated_model">a stated model</option><option value="run">a run</option></select>}</Field>
            <Field id="rv-cf-basis" label={cfKind === 'run' ? 'Run id' : 'The stated model'}>{(id) => <input id={id} style={inputStyle} value={cfBasis} onChange={(e) => setCfBasis(e.target.value)} />}</Field>
          </div>
        </fieldset>
        <fieldset><legend>Changed conditions</legend>
          <Field id="rv-changed" label="One per line (condition — effect)">{(id) => <textarea id={id} style={textareaStyle} value={changed} onChange={(e) => setChanged(e.target.value)} />}</Field>
        </fieldset>
        {sep !== null && oStatement !== '' && <p style={critical}>{sep}: the four fields are separate statements.</p>}
        <GovernedButton label="Record the assessment" pendingLabel="recording" disabled={committed === null} onRun={() => act('assessed', () => api.assess(scope, pkg, committed ?? 1, {
          observed: { outcomeIds: oIds.split('\n').map((x) => x.trim()).filter((x) => x !== ''), statement: oStatement },
          inferred: { statement: iStatement, method: iMethod, confidence: Number(iConf) },
          counterfactual: { claim: cfClaim, basis: cfKind === 'run' ? { kind: 'run', runId: cfBasis.trim() } : { kind: 'stated_model', model: cfBasis } },
          changedConditions: changedOf(changed), supersedes: latestAssessment?.assessment_id ?? null }) as Promise<Answer>)} />
      </Section>

      <Section id="rv-lessons" title="Hypotheses and lessons (governed memory)">
        {rv.lessons.length === 0 ? <Empty>no lesson is linked</Empty> : <ul>{rv.lessons.map((l) => <li key={l.lesson_id}>{l.kind.toUpperCase()}: {l.title} <span style={muted}>(memory record <Mono>{l.memory_item_id}</Mono> v{l.memory_version})</span></li>)}</ul>}
        <p style={muted}>Record the lesson as a memory record naming this decision (Graph → Memory), then link it here.</p>
        <div style={grid}>
          <Field id="rv-l-assessment" label="Assessment">{(id) => <select id={id} style={inputStyle} value={lessonAssessment} onChange={(e) => setLessonAssessment(e.target.value)}><option value="">— choose —</option>{rv.outcome_assessments.map((a) => <option key={a.assessment_id} value={a.assessment_id}>v{a.version} assessment {a.assessment_version}</option>)}</select>}</Field>
          <Field id="rv-l-kind" label="Kind">{(id) => <select id={id} style={inputStyle} value={lessonKind} onChange={(e) => setLessonKind(e.target.value as 'hypothesis' | 'lesson')}><option value="lesson">lesson</option><option value="hypothesis">hypothesis</option></select>}</Field>
          <Field id="rv-l-item" label="Memory record id">{(id) => <input id={id} style={inputStyle} value={lessonItem} onChange={(e) => setLessonItem(e.target.value.trim())} />}</Field>
        </div>
        <GovernedButton label="Link the lesson" pendingLabel="linking" onRun={() => act('linked', () => api.linkLesson(scope, lessonAssessment, lessonKind, lessonItem) as Promise<Answer>)} />
      </Section>

      <Section id="rv-replays" title="Replays — initiator and reason">
        {rv.replays.length === 0 ? <Empty>no replay of this package</Empty> : (
          <ScrollBox label="replays"><table style={tableStyle}><thead><tr><Th>Version</Th><Th>Replayed</Th><Th>Initiator</Th><Th>Reason</Th><Th>Within horizon</Th></tr></thead><tbody>
            {rv.replays.map((r) => <tr key={r.replay_id}><Td>v{r.version}</Td><Td>{fmtInstant(r.replayed_at)}</Td><Td>{r.initiator === null ? 'not recorded' : <Mono>{r.initiator}</Mono>}</Td><Td>{r.reason ?? 'no reason recorded'}</Td>
              <Td>{r.within_horizon === null ? '—' : r.within_horizon ? 'yes' : 'BEYOND THE HORIZON'}</Td></tr>)}
          </tbody></table></ScrollBox>
        )}
        <Field id="rv-replay-reason" label="Why replay the committed version">{(id) => <input id={id} style={inputStyle} value={replayReason} onChange={(e) => setReplayReason(e.target.value)} />}</Field>
        <GovernedButton label="Replay with this reason" pendingLabel="replaying" variant="quiet" disabled={committed === null} onRun={() => act('replayed', () => api.replay(scope, pkg, committed ?? 1, replayReason) as Promise<Answer>)} />
      </Section>

      <Section id="rv-ledger" title="The review ledger">
        {rv.events.length === 0 ? <Empty>nothing recorded</Empty> : <ol>{rv.events.map((e, i) => <li key={i}>{fmtInstant(e.at)} — {e.event}</li>)}</ol>}
      </Section>
    </>
  );
}

/* ───────────── the sets and the cited scenarios ───────────── */
function SetsCard({ sets, cited, onChanged }: { sets: SetRow[]; cited: CitedRow[]; onChanged: () => Promise<void> }) {
  const { scope } = useShell();
  const { act, status } = useAct(onChanged);
  const [setId, setSetId] = useState(''); const [every, setEvery] = useState('30'); const [anchor, setAnchor] = useState(''); const [rationale, setRationale] = useState('');
  const chosen = sets.find((s) => s.set_id === setId) ?? null;
  return (
    <Section id="rv-sets" title="Scenario sets — review cadence">
      {status}
      {sets.length === 0 ? <Empty>no scenario set in this domain</Empty> : (
        <ScrollBox label="scenario sets"><table style={tableStyle}><thead><tr><Th>Set</Th><Th>State</Th><Th>Cadence</Th><Th>Review due</Th></tr></thead><tbody>
          {sets.map((s) => <tr key={s.set_id}><Td>{s.title}</Td><Td>{s.state}</Td><Td>{s.due === null ? 'none' : `every ${s.due.every_days} d (v${s.due.cadence_version})`}</Td>
            <Td>{s.due === null ? '—' : <>{fmtInstant(s.due.due_at)}{s.due.overdue && <strong style={critical}> · OVERDUE</strong>}</>}</Td></tr>)}
        </tbody></table></ScrollBox>
      )}
      <div style={grid}>
        <Field id="rv-set" label="Set">{(id) => <select id={id} style={inputStyle} value={setId} onChange={(e) => setSetId(e.target.value)}><option value="">— choose —</option>{sets.map((s) => <option key={s.set_id} value={s.set_id}>{s.title}</option>)}</select>}</Field>
        <Field id="rv-every" label="Every (days)">{(id) => <input id={id} type="number" min={1} max={366} style={inputStyle} value={every} onChange={(e) => setEvery(e.target.value)} />}</Field>
        <Field id="rv-anchor" label="Last review held (optional)">{(id) => <input id={id} type="datetime-local" style={inputStyle} value={anchor} onChange={(e) => setAnchor(e.target.value)} />}</Field>
        <Field id="rv-rationale" label="Why this often">{(id) => <input id={id} style={inputStyle} value={rationale} onChange={(e) => setRationale(e.target.value)} />}</Field>
      </div>
      <GovernedButton label="Set the cadence" pendingLabel="setting" disabled={setId === ''} onRun={() => act('set', () => api.setCadence(scope, setId, { everyDays: Number(every), anchorAt: toIso(anchor), rationale,
        expectedVersion: chosen?.due?.cadence_version ?? null }) as Promise<Answer>)} />{' '}
      <GovernedButton label="Check the cadences now" pendingLabel="checking" variant="quiet" onRun={() => act('checked', () => api.sweep(scope) as Promise<Answer>)} />
      <h3 style={h3}>Scenarios cited outside every active set</h3>
      {cited.length === 0 ? <Empty>every scenario a live package cites is in an active set (or none is cited)</Empty> : (
        <ul>{cited.map((c) => <li key={c.scenario_id}><strong>{c.title}</strong> — relevance {c.score === null ? 'not scored' : c.score} {c.scored_at !== null && <span style={muted}>({fmtInstant(c.scored_at)}, {c.trigger})</span>}; cited by {c.cited_by.length} package(s)</li>)}</ul>
      )}
      <GovernedButton label="Score the cited scenarios now" pendingLabel="scoring" variant="quiet" onRun={() => act('scored', () => api.scoreCited(scope) as Promise<Answer>)} />
    </Section>
  );
}

function ReversionsCard({ rows, onChanged }: { rows: ReversionRow[]; onChanged: () => Promise<void> }) {
  const { scope } = useShell();
  const { act, status } = useAct(onChanged);
  const [note, setNote] = useState<Record<string, string>>({});
  const open = rows.filter((r) => r.state === 'open');
  return (
    <Section id="rv-open-reversions" title="Re-versioning asked of scenario owners">
      {status}
      {open.length === 0 ? <Empty>no open reversion request</Empty> : (
        <ul>{open.map((r) => (
          <li key={r.request_id} style={{ marginBlockEnd: 'var(--eye-space-8)' }}>
            <Mark m={reversionMark(r.state)} /> <strong>{r.scenario_title ?? r.scenario_id}</strong> — the decision &quot;{r.package_title}&quot; was reopened ({causeWords(r.cause_kind)}); the scenario was at v{r.scenario_version_at_request}, now v{r.scenario_version_now ?? '—'}.
            <Field id={`rv-note-${r.request_id}`} label="Resolution note">{(id) => <input id={id} style={inputStyle} value={note[r.request_id] ?? ''} onChange={(e) => setNote({ ...note, [r.request_id]: e.target.value })} />}</Field>
            <GovernedButton label="Mark re-versioned" pendingLabel="resolving" onRun={() => act('resolved', () => api.resolveReversion(scope, r.request_id, 'reversioned', note[r.request_id] ?? '') as Promise<Answer>)} />{' '}
            <GovernedButton label="Decline" pendingLabel="declining" variant="quiet" onRun={() => act('declined', () => api.resolveReversion(scope, r.request_id, 'declined', note[r.request_id] ?? '') as Promise<Answer>)} />
          </li>))}</ul>
      )}
    </Section>
  );
}

export default function DecisionReviewPage() {
  const { scope } = useShell();
  const [packages, setPackages] = useState<PackageRow[]>([]);
  const [reversions, setReversions] = useState<ReversionRow[]>([]);
  const [sets, setSets] = useState<SetRow[]>([]);
  const [cited, setCited] = useState<CitedRow[]>([]);
  const [pkg, setPkg] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api.index(scope);
    if (!r.ok || r.data === undefined) { setErr(refusal(r as Answer, 'no index')); return; }
    setErr(null); setPackages(r.data.packages); setReversions(r.data.reversions); setSets(r.data.sets); setCited(r.data.cited);
  }, [scope]);
  useEffect(() => { void load(); }, [load]);
  return (
    <main aria-labelledby="rv-title">
      <h1 id="rv-title">Decision review</h1>
      <p style={muted}>After a decision: changes of conditions, the reopen on a recorded cause, the scenarios to re-version, the outcome assessed in four separate fields, the review terms, replays with their reasons, lessons, the decision metrics — and the review cadence of every scenario set.</p>
      {err !== null && <p style={critical}>{err}</p>}
      <ReversionsCard rows={reversions} onChanged={load} />
      <section aria-labelledby="rv-pick" style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-16)' }}>
        <h2 id="rv-pick" style={h2}>A decision</h2>
        <label style={{ display: 'block' }}>Package{' '}
          <select style={inputStyle} value={pkg} onChange={(e) => setPkg(e.target.value)}>
            <option value="">— choose a package —</option>
            {packages.map((p) => <option key={p.package_id} value={p.package_id}>{p.title} ({p.state}{p.committed_version !== null ? `, committed v${p.committed_version}` : ''})</option>)}
          </select>
        </label>
      </section>
      {pkg !== '' && <PackageReview key={pkg} pkg={pkg} onChanged={load} />}
      <SetsCard sets={sets} cited={cited} onChanged={load} />
    </main>
  );
}
