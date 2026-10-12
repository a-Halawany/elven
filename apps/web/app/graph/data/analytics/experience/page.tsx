'use client';
/**
 * Experience quality — CP-6 B92 §UX (0113_b92_x_ux; UX-70-001..006, CAP-PD-09; DESIGN D12–D14).
 *
 * YOUR CONSENT first: per telemetry purpose, your own state, its version and history, grant or withdraw — nothing of yours is collected
 * without it, and an experiment always shows you the current design without it. Then, PER JOURNEY, the four-part anatomy the chapter asks
 * for, in its order: (1) the QUALITY OBJECTIVE; (2) the METRICS with their lineage (the baseline's value and interval, or the explained
 * indeterminate with its reasons, n, the floor and k; the definitions it rests on; its source revision); (3) the SEGMENTS with their
 * uncertainty (below k SUPPRESSED, never shown); (4) the DECISIONS and their follow-through (findings, the action a named owner decided against
 * the consequence preview, experiments with their two approvals, analyses and conclusion). Then the telemetry DEFINITIONS with the privacy
 * review, hold, release and retirement and the collection tallies; the routed reviews; the purge and the exports. A held definition puts the
 * journey in a visible DEGRADED state: its measures are qualified and the unsafe acts (approving or adopting an experiment) are disabled.
 * Every act has its own route and receipt; refusals are the server's words. Nothing here measures, approves or decides.
 * INSTRUMENTED: this page's own journey (open → act), durations and outcomes only, under the server's catalogue and your consent.
 * BOUNDARY: software capability; the demo is SYNTHETIC; the signed acceptance (UX-70-006) → R2 / B107; accessibility conformance → B107/H3.
 */
import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useShell } from '../../../layout';
import {
  approvalsLine, baselineLine, claimLine, collectionLine, consentLine, dayOf, experience, fieldsLine, heldOn, intervalLine, measureValue, stateMark, verdictLine,
  type Baseline, type Definition, type Experiment, type Finding, type JourneyView, type Mark, type SelfState, type Threshold, type Workspace,
} from '../../../../../lib/analytics-ux-b92';
import { EXPERIENCE_PAGE, useJourney } from '../../../../../lib/telemetry-b92';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, GovernedButton, fmtInstant, textareaStyle } from '../../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../../../components/ui';

type Row = Record<string, unknown>;
type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
type Res = { ok: boolean; status: number; error?: { code: string; message: string }; data?: { receipt?: ReceiptT } };
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3, 1.05rem)', marginBlockEnd: 'var(--eye-space-8)' } as const;
const section = { ...cardStyle, marginBlockStart: 'var(--eye-space-16)' } as const;
const row = { display: 'flex', flexWrap: 'wrap', gap: 'var(--eye-space-8)', alignItems: 'center', marginBlockStart: 'var(--eye-space-8)' } as const;
const MEASURES = ['task_success_rate', 'step_p50_ms', 'error_recovery_rate'];
const KINDS = ['backlog_item', 'design_change_proposal', 'research_request', 'hold_collection', 'retire_measure'];
const prevQuarter = (d: Date) => { const q = Math.floor(d.getUTCMonth() / 3) + 1; return q === 1 ? `${d.getUTCFullYear() - 1}-Q4` : `${d.getUTCFullYear()}-Q${q - 1}`; };

export default function ExperiencePage() {
  return <Suspense fallback={null}><ExperienceQuality /></Suspense>;
}
function MarkView({ m }: { m: Mark }) {
  return <span style={{ color: `var(${m.token})`, fontWeight: 650 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}

function ExperienceQuality() {
  const { scope, me } = useShell();
  const roles = new Set(me.bindings.filter((b) => b.domainId === scope.domainId || b.scope === 'TENANT').map((b) => b.roleCode));
  const isAnalyst = roles.has('product_analyst') || roles.has('product_analytics_owner');
  const isOwner = roles.has('product_analytics_owner'); const isPrivacy = roles.has('privacy_officer');
  const [self, setSelf] = useState<SelfState | null>(null);
  const [ws, setWs] = useState<Workspace | null>(null);
  const [wsProblem, setWsProblem] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [journeyKey, setJourneyKey] = useState('');
  const [reason, setReason] = useState('');
  const track = useJourney(scope, EXPERIENCE_PAGE);

  const loadSelf = async () => { const r = await experience.self(scope); if (r.ok && r.data !== undefined) setSelf(r.data); else setProblem(r.error?.message ?? 'your consent could not be read'); };
  const loadWs = async () => {
    const r = await experience.workspace(scope);
    if (!r.ok || r.data === undefined) { setWsProblem(`HTTP ${r.status} — ${r.error?.message ?? 'the experience workspace could not be read'}`); return; }
    setWsProblem(null); setWs(r.data); setJourneyKey((prev) => (prev === '' ? (r.data?.journeys[0]?.journey.journey_key ?? '') : prev));
  };
  useEffect(() => { void loadSelf(); void loadWs(); }, [scope]);

  /** Every command: the server's words on a refusal, the receipt on success, the state read again; the page's own journey step recorded. */
  const act = async (fn: () => Promise<Res>, what: string, tab: string) => {
    const r = await fn();
    if (!r.ok) { setProblem(`HTTP ${r.status}${r.error?.code ? ` ${r.error.code}` : ''} — ${r.error?.message ?? what}`); track.end('act', 'failure', { tab }); throw new Error(what); }
    setProblem(null); setReceipt(r.data?.receipt ?? null); setReason('');
    track.end('act', 'success', { tab });
    await Promise.all([loadSelf(), loadWs()]);
  };
  const reasonOk = reason.trim().length >= 8;
  const j = ws?.journeys.find((x) => x.journey.journey_key === journeyKey) ?? null;
  const held = ws === null || j === null ? [] : heldOn(ws.definitions, j.journey.journey_key);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Experience quality</h1>
      <p style={muted}>
        How well people accomplish their work here — task success, step latency, error recovery — measured only under an approved purpose and each
        person&apos;s own consent, pseudonymously (a daily pseudonym, never an identity), and never below five people. Metrics advise product
        improvement; a named product analytics owner decides what follows, never an agent, never automatically. No measure here ranks or scores a person.
      </p>
      <p style={{ ...muted, fontSize: 'var(--eye-type-label-sm)' }}>{ws?.boundary ?? 'Software capability; the demonstration data are SYNTHETIC; the signed acceptance (UX-70-006) belongs to R2 / B107.'} <Link href="/graph/data/analytics">Metric catalog →</Link></p>

      {problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : null}
      <Receipt receipt={receipt} />

      <section aria-labelledby="ux-consent" style={section}>
        <h2 id="ux-consent" style={h2}>Your consent</h2>
        <p style={muted}>Only you can give or withdraw it, for yourself. Without it nothing of yours is collected and experiments show you the current design.</p>
        {self === null ? <Empty>reading your consent…</Empty> : self.purposes.length === 0 ? <Empty>No telemetry purpose is approved in this domain: nothing is collected.</Empty> : (
          self.purposes.map((p) => (
            <div key={p.purpose_key} style={{ borderBlockStart: '1px solid var(--eye-color-border-subtle)', paddingBlock: 'var(--eye-space-8)' }}>
              <strong>{p.title}</strong> <Mono>{p.purpose_key} v{p.version}</Mono>
              <p style={{ margin: 'var(--eye-space-4) 0' }}>{p.description}</p>
              <p style={{ margin: 0 }}><MarkView m={p.consented ? stateMark('approved') : stateMark('proposed')} /> {consentLine(p)}</p>
              {p.history.length > 0 ? <p style={{ ...muted, margin: 0 }}>History: {p.history.map((x) => `${x.decision} (v${x.purpose_version}, ${fmtInstant(x.recorded_at)})`).join(' · ')}</p> : null}
              <div style={row}>
                {p.consented
                  ? <GovernedButton label="Withdraw my consent" pendingLabel="Withdrawing" variant="critical" onRun={() => act(() => experience.withdraw(scope, p.purpose_key), 'withdraw', 'journeys')} />
                  : <GovernedButton label="Give my consent" pendingLabel="Recording" onRun={() => act(() => experience.grant(scope, p.purpose_key), 'grant', 'journeys')} />}
              </div>
            </div>
          ))
        )}
      </section>

      {wsProblem !== null ? <section style={section}><LiveStatus>{wsProblem}</LiveStatus><p style={muted}>The workspace is open to the product analytics roles, the executives and the decision, strategy, risk and forecast owners.</p></section> : null}
      {ws === null ? (wsProblem === null ? <Empty>reading the experience workspace…</Empty> : null) : (
        <>
          <section aria-labelledby="ux-journey" style={section}>
            <h2 id="ux-journey" style={h2}>Journeys</h2>
            {ws.journeys.length === 0 ? <Empty>No journey is declared in this domain.</Empty> : (
              <>
                <label htmlFor="ux-journey-pick">Journey</label>{' '}
                <select id="ux-journey-pick" style={inputStyle} value={journeyKey} onChange={(e) => setJourneyKey(e.target.value)}>
                  {ws.journeys.map((x) => <option key={x.journey.journey_key} value={x.journey.journey_key}>{x.journey.title} ({x.journey.journey_key} v{x.journey.version})</option>)}
                </select>
              </>
            )}
          </section>
          {j === null ? null : <JourneyAnatomy j={j} ws={ws} held={held} isAnalyst={isAnalyst} isOwner={isOwner} isPrivacy={isPrivacy} reason={reason} setReason={setReason} reasonOk={reasonOk} act={act} />}
          <Definitions ws={ws} isAnalyst={isAnalyst} isOwner={isOwner} isPrivacy={isPrivacy} reason={reason} setReason={setReason} reasonOk={reasonOk} act={act} />
          <Reviews ws={ws} />
          <PurgeAndExport ws={ws} isAnalyst={isAnalyst} isOwner={isOwner} isPrivacy={isPrivacy} reason={reason} setReason={setReason} reasonOk={reasonOk} act={act} />
        </>
      )}
    </>
  );
}

type ActFn = (fn: () => Promise<Res>, what: string, tab: string) => Promise<void>;
type Common = { ws: Workspace; isAnalyst: boolean; isOwner: boolean; isPrivacy: boolean; reason: string; setReason: (s: string) => void; reasonOk: boolean; act: ActFn };

function ReasonBox({ reason, setReason, id }: { reason: string; setReason: (s: string) => void; id: string }) {
  return (
    <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
      <label htmlFor={id}>Reason (8+ characters, recorded with your decision)</label>
      <textarea id={id} style={textareaStyle} value={reason} onChange={(e) => setReason(e.target.value)} rows={2} />
    </div>
  );
}

function BaselineRow({ b }: { b: Baseline }) {
  const l = baselineLine(b);
  return (
    <tr>
      <Td>{b.measure}{b.step_key ? <> · <Mono>{b.step_key}</Mono></> : null}{b.segment_key ? <> · segment <Mono>{b.segment_key}</Mono> ({b.segment?.dimension} = {b.segment?.value})</> : null}</Td>
      <Td>{b.period_key} <span style={muted}>({dayOf(b.window_from)} – {dayOf(b.window_to)}, UTC days)</span></Td>
      <Td><MarkView m={l.mark} /><div>{l.text}</div></Td>
      <Td>{b.definitions_used.map((d) => `${String(d['event_key'])} v${String(d['version'])}`).join(', ') || '—'}<div style={muted}>revision <Mono title={b.source_revision}>{b.source_revision.slice(0, 12)}…</Mono> · {fmtInstant(b.recorded_at)}</div></Td>
    </tr>
  );
}

function JourneyAnatomy({ j, ws, held, isAnalyst, isOwner, isPrivacy, reason, setReason, reasonOk, act }: Common & { j: JourneyView; held: Definition[] }) {
  const { scope } = useShell();
  const [measure, setMeasure] = useState('task_success_rate'); const [step, setStep] = useState(''); const [segmentKey, setSegmentKey] = useState('');
  const [period, setPeriod] = useState(prevQuarter(new Date()));
  const [tBound, setTBound] = useState<'min' | 'max'>('min'); const [tValue, setTValue] = useState('0.8');
  const degraded = held.length > 0;
  const segments = ws.segments.filter((s) => s['state'] === 'active');
  return (
    <>
      {degraded ? (
        <div role="alert" style={{ ...section, borderColor: 'var(--eye-color-critical)' }}>
          <strong>Degraded: collection is held on this journey.</strong> {held.map((d) => `${d.event_key} v${d.version} — ${d.hold_reason ?? ''}`).join('; ')}.
          Its measures are qualified (indeterminate while held), its experiments are invalidated, and approving or adopting an experiment is disabled
          until the privacy officer releases it.
        </div>
      ) : null}

      <section aria-labelledby="ux-objective" style={section}>
        <h2 id="ux-objective" style={h2}>1 · Quality objective</h2>
        <p style={{ marginBlockStart: 0 }}>{j.objective.statement}</p>
        <DefinitionRow term="Journey">{j.journey.title} <Mono>{j.journey.journey_key} v{j.journey.version}</Mono> — {j.journey.steps.join(' → ')}</DefinitionRow>
        <DefinitionRow term="Purpose">{j.objective.purpose_key} (the purpose its telemetry is collected under)</DefinitionRow>
        <DefinitionRow term="Serves objectives">{j.objective.objective_ids.length === 0 ? 'none named' : j.objective.objective_ids.map((o) => <Mono key={o}>{o}</Mono>)}</DefinitionRow>
        <DefinitionRow term="Floor">a baseline needs n ≥ {j.journey.floor_n} and k ≥ 5 distinct people</DefinitionRow>
      </section>

      <section aria-labelledby="ux-metrics" style={section}>
        <h2 id="ux-metrics" style={h2}>2 · Metrics and lineage</h2>
        {j.metrics.length === 0 ? <Empty>No baseline is recorded for this journey — nothing is shown as measured.</Empty> : (
          <ScrollBox label="Baselines of the journey">
            <table style={tableStyle}><thead><tr><Th>Measure</Th><Th>Period</Th><Th>Value or state</Th><Th>Lineage</Th></tr></thead>
              <tbody>{j.metrics.map((b) => <BaselineRow key={b.baseline_id} b={b} />)}</tbody></table>
          </ScrollBox>
        )}
        {isAnalyst ? (
          <div style={row}>
            <label htmlFor="ux-measure">Measure</label>
            <select id="ux-measure" style={inputStyle} value={measure} onChange={(e) => setMeasure(e.target.value)}>{MEASURES.map((m) => <option key={m} value={m}>{m}</option>)}</select>
            {measure === 'step_p50_ms' ? (<><label htmlFor="ux-step">Step</label>
              <select id="ux-step" style={inputStyle} value={step} onChange={(e) => setStep(e.target.value)}><option value="">— step —</option>{j.journey.steps.map((s) => <option key={s} value={s}>{s}</option>)}</select></>) : null}
            <label htmlFor="ux-seg">Segment</label>
            <select id="ux-seg" style={inputStyle} value={segmentKey} onChange={(e) => setSegmentKey(e.target.value)}><option value="">the whole journey</option>{segments.map((s) => <option key={String(s['segment_key'])} value={String(s['segment_key'])}>{String(s['segment_key'])} ({String(s['dimension'])} = {String(s['value'])})</option>)}</select>
            <label htmlFor="ux-period">Period</label>
            <input id="ux-period" style={inputStyle} value={period} onChange={(e) => setPeriod(e.target.value)} aria-describedby="ux-period-hint" />
            <span id="ux-period-hint" style={muted}>2026-Q3, 2026-09 or R90@2026-10-12</span>
            <GovernedButton label="Record a baseline" pendingLabel="Measuring" onRun={() => act(() => experience.baseline(scope, { journeyKey: j.journey.journey_key, measure, stepKey: measure === 'step_p50_ms' ? step : null, segmentKey: segmentKey || null, period }), 'baseline', 'journeys')} />
          </div>
        ) : null}
        <h3 style={h3}>Thresholds</h3>
        {j.thresholds.length === 0 ? <Empty>No threshold — a crossing would open a review, never an automatic decision.</Empty> : (
          <ul>{j.thresholds.map((t: Threshold) => (
            <li key={t.threshold_id}><MarkView m={stateMark(t.state)} /> {t.measure}{t.step_key ? ` (${t.step_key})` : ''}{t.segment_key ? ` [${t.segment_key}]` : ''} {t.bound} {measureValue(t.measure, t.value)} — {t.rationale}
              {isOwner && t.state === 'proposed' ? (<span style={row}>
                <GovernedButton label="Approve" pendingLabel="Approving" disabled={!reasonOk} onRun={() => act(() => experience.decideThreshold(scope, t.threshold_id, { decision: 'approve', reason, digest: t.digest }), 'threshold', 'journeys')} />
                <GovernedButton label="Reject" pendingLabel="Rejecting" variant="quiet" disabled={!reasonOk} onRun={() => act(() => experience.decideThreshold(scope, t.threshold_id, { decision: 'reject', reason, digest: t.digest }), 'threshold', 'journeys')} /></span>) : null}
              {isOwner && t.state === 'approved' ? <span style={row}><GovernedButton label="Retire" pendingLabel="Retiring" variant="quiet" disabled={!reasonOk} onRun={() => act(() => experience.decideThreshold(scope, t.threshold_id, { decision: 'retire', reason }), 'threshold', 'journeys')} /></span> : null}
            </li>))}</ul>
        )}
        {isAnalyst ? (
          <div style={row}>
            <span>Propose: {measure}</span>
            <select aria-label="Bound" style={inputStyle} value={tBound} onChange={(e) => setTBound(e.target.value as 'min' | 'max')}><option value="min">min</option><option value="max">max</option></select>
            <input aria-label="Threshold value (a rate 0–1, a latency in ms)" style={inputStyle} value={tValue} onChange={(e) => setTValue(e.target.value)} />
            <GovernedButton label="Propose threshold" pendingLabel="Proposing" variant="quiet" disabled={!reasonOk || Number.isNaN(Number(tValue))}
              onRun={() => act(() => experience.proposeThreshold(scope, { journeyKey: j.journey.journey_key, measure, stepKey: measure === 'step_p50_ms' ? step : null, segmentKey: segmentKey || null, bound: tBound, value: Number(tValue), rationale: reason }), 'threshold', 'journeys')} />
          </div>
        ) : null}
        {isOwner || isAnalyst ? <ReasonBox reason={reason} setReason={setReason} id="ux-reason-metrics" /> : null}
      </section>

      <section aria-labelledby="ux-segments" style={section}>
        <h2 id="ux-segments" style={h2}>3 · Segments and uncertainty</h2>
        <p style={muted}>A role, a device class or a language — never a person. A segment resting on fewer than five people is SUPPRESSED: its value and n are withheld.</p>
        {j.segments.length === 0 ? <Empty>No segment baseline is recorded.</Empty> : (
          <ScrollBox label="Segment baselines"><table style={tableStyle}><thead><tr><Th>Measure · segment</Th><Th>Period</Th><Th>Value or state</Th><Th>Lineage</Th></tr></thead>
            <tbody>{j.segments.map((b) => <BaselineRow key={b.baseline_id} b={b} />)}</tbody></table></ScrollBox>
        )}
      </section>

      <section aria-labelledby="ux-decisions" style={section}>
        <h2 id="ux-decisions" style={h2}>4 · Decisions and follow-through</h2>
        <Findings j={j} ws={ws} isAnalyst={isAnalyst} isOwner={isOwner} isPrivacy={isPrivacy} reason={reason} setReason={setReason} reasonOk={reasonOk} act={act} />
        <h3 style={h3}>Experiments</h3>
        <p style={muted}>Approved design alternatives only (layout, wording, ordering, default visibility); two approvals by two people; the control for anyone who has not consented.</p>
        {j.experiments.length === 0 ? <Empty>No experiment on this journey.</Empty> : j.experiments.map((e) => (
          <ExperimentCard key={e.experiment_id} e={e} degraded={degraded} ws={ws} isAnalyst={isAnalyst} isOwner={isOwner} isPrivacy={isPrivacy} reason={reason} setReason={setReason} reasonOk={reasonOk} act={act} />
        ))}
      </section>
    </>
  );
}

function ExperimentCard({ e, degraded, isAnalyst, isOwner, isPrivacy, reason, setReason, reasonOk, act }: Common & { e: Experiment; degraded: boolean }) {
  const { scope } = useShell();
  const latest = e.analyses[0];
  const better = latest?.verdict === 'valid' ? latest.comparisons.filter((c) => c['claim'] === 'better').map((c) => String(c['arm'])) : [];
  return (
    <div style={{ borderBlockStart: '1px solid var(--eye-color-border-subtle)', paddingBlock: 'var(--eye-space-8)' }}>
      <strong>{e.title}</strong> <MarkView m={stateMark(e.state)} />
      <p style={{ margin: 'var(--eye-space-4) 0' }}>{e.hypothesis}</p>
      <DefinitionRow term="Primary measure">{e.primary_measure}{e.step_key ? ` (${e.step_key})` : ''} · minimum {e.min_sample_per_arm} per arm</DefinitionRow>
      <DefinitionRow term="Variants">{e.variants.map((v) => `${v.key} (${v.kind}): ${v.description}`).join(' | ')}</DefinitionRow>
      <DefinitionRow term="Approvals">{approvalsLine(e)}</DefinitionRow>
      {e.invalidation ? <DefinitionRow term="Invalidated">{String(e.invalidation['cause'])} — {(e.invalidation['reasons'] as string[] | undefined)?.join(' · ')}</DefinitionRow> : null}
      {latest ? (
        <>
          <DefinitionRow term="Latest analysis"><MarkView m={verdictLine(latest).mark} /> {verdictLine(latest).text}</DefinitionRow>
          <ul>{latest.arms.map((a) => <li key={String(a['key'])}>{String(a['key'])}: {a['suppressed'] ? `SUPPRESSED (${String(a['suppressed'])})` : `${measureValue(e.primary_measure, a['value'])} · ${intervalLine(e.primary_measure, a['uncertainty'] as Row)} · n = ${String(a['n'])}`}</li>)}</ul>
          {latest.comparisons.map((c) => <p key={String(c['arm'])} style={{ margin: 0 }}>{claimLine(c)}</p>)}
        </>
      ) : <p style={muted}>No analysis yet.</p>}
      {e.conclusion ? <DefinitionRow term="Conclusion">{String(e.conclusion['conclusion'])}{e.conclusion['arm'] ? ` ${String(e.conclusion['arm'])}` : ''} — {String(e.conclusion['reason'])} <span style={muted}>({String(e.conclusion['advisory'])})</span></DefinitionRow> : null}
      <div style={row}>
        {e.state === 'proposed' && isOwner ? <GovernedButton label="Approve as product analytics owner" pendingLabel="Approving" disabled={!reasonOk || degraded} onRun={() => act(() => experience.approveExperiment(scope, e.experiment_id, { role: 'product_analytics_owner', decision: 'approve', reason, digest: e.digest }), 'approve', 'experiments')} /> : null}
        {e.state === 'proposed' && isPrivacy ? <GovernedButton label="Approve as privacy officer" pendingLabel="Approving" disabled={!reasonOk || degraded} onRun={() => act(() => experience.approveExperiment(scope, e.experiment_id, { role: 'privacy_officer', decision: 'approve', reason, digest: e.digest }), 'approve', 'experiments')} /> : null}
        {e.state === 'proposed' && (isOwner || isPrivacy) ? <GovernedButton label="Reject" pendingLabel="Rejecting" variant="critical" disabled={!reasonOk} onRun={() => act(() => experience.approveExperiment(scope, e.experiment_id, { role: isOwner ? 'product_analytics_owner' : 'privacy_officer', decision: 'reject', reason, digest: e.digest }), 'reject', 'experiments')} /> : null}
        {e.state === 'running' && isAnalyst ? <GovernedButton label="Analyse" pendingLabel="Analysing" variant="quiet" onRun={() => act(() => experience.analyse(scope, e.experiment_id), 'analyse', 'experiments')} /> : null}
        {(e.state === 'running' || e.state === 'invalidated') && isOwner && latest ? (
          <>
            {better.map((arm) => <GovernedButton key={arm} label={`Adopt ${arm}`} pendingLabel="Concluding" disabled={!reasonOk || degraded || e.state === 'invalidated'} onRun={() => act(() => experience.conclude(scope, e.experiment_id, { conclusion: 'adopt', arm, analysisId: latest.analysis_id, analysisDigest: latest.digest, reason }), 'conclude', 'experiments')} />)}
            <GovernedButton label="Conclude: no change" pendingLabel="Concluding" variant="quiet" disabled={!reasonOk} onRun={() => act(() => experience.conclude(scope, e.experiment_id, { conclusion: 'no_change', analysisId: latest.analysis_id, analysisDigest: latest.digest, reason }), 'conclude', 'experiments')} />
            <GovernedButton label="Conclude: inconclusive" pendingLabel="Concluding" variant="quiet" disabled={!reasonOk} onRun={() => act(() => experience.conclude(scope, e.experiment_id, { conclusion: 'inconclusive', analysisId: latest.analysis_id, analysisDigest: latest.digest, reason }), 'conclude', 'experiments')} />
          </>
        ) : null}
      </div>
      {(e.state === 'proposed' && (isOwner || isPrivacy)) || ((e.state === 'running' || e.state === 'invalidated') && isOwner) ? <ReasonBox reason={reason} setReason={setReason} id={`ux-reason-${e.experiment_id}`} /> : null}
    </div>
  );
}

function Findings({ j, ws, isAnalyst, isOwner, reason, setReason, reasonOk, act }: Common & { j: JourneyView }) {
  const { scope, me } = useShell();
  const [choice, setChoice] = useState<{ findingId: string; kind: string; targetId: string }>({ findingId: '', kind: '', targetId: '' });
  const [preview, setPreview] = useState<Row | null>(null); const [pvProblem, setPvProblem] = useState<string | null>(null);
  const [statement, setStatement] = useState(''); const [origin, setOrigin] = useState('');
  // the preview asked for LAST wins (a slower answer for an earlier choice is dropped)
  const wanted = useRef('');
  useEffect(() => {
    const key = `${choice.findingId}|${choice.kind}|${choice.targetId}`; wanted.current = key; setPreview(null); setPvProblem(null);
    if (choice.findingId === '') return;
    void experience.preview(scope, choice.findingId, choice.kind === '' ? null : choice.kind, choice.targetId === '' ? null : choice.targetId).then((r) => {
      if (wanted.current !== key) return;
      if (r.ok && r.data !== undefined) setPreview(r.data.preview); else setPvProblem(`HTTP ${r.status} — ${r.error?.message ?? 'the preview could not be read'}`);
    });
  }, [scope, choice.findingId, choice.kind, choice.targetId]);
  const targets = choice.kind === 'hold_collection' ? ws.definitions.filter((d) => d.state === 'approved' && d.journey_key === j.journey.journey_key).map((d) => ({ id: d.definition_id, label: `${d.event_key} v${d.version}` }))
    : choice.kind === 'retire_measure' ? [...j.thresholds.filter((t) => t.state === 'approved').map((t) => ({ id: t.threshold_id, label: `threshold ${t.measure} ${t.bound} ${String(t.value)}` })),
                                         ...ws.definitions.filter((d) => d.state === 'approved' && d.journey_key === j.journey.journey_key).map((d) => ({ id: d.definition_id, label: `definition ${d.event_key} v${d.version}` }))] : [];
  const f = j.findings.find((x) => x.finding_id === choice.findingId) ?? null;
  const ownFinding = f !== null && f.proposed_by === me.principalId;
  return (
    <>
      <h3 style={h3}>Findings → actions</h3>
      <p style={muted}>An analyst or an agent proposes a finding; a named product analytics owner — never its proposer, never an agent — decides the action against the consequence preview. Nothing happens automatically.</p>
      {j.findings.length === 0 ? <Empty>No finding on this journey.</Empty> : (
        <ul>{j.findings.map((x: Finding) => (
          <li key={x.finding_id}>
            <MarkView m={stateMark(x.state)} /> {x.statement} <span style={muted}>({x.origin_kind}, proposed by {x.proposed_by_kind === 'agent' ? 'an agent' : 'a person'}, {fmtInstant(x.proposed_at)})</span>
            {x.action ? <div>Decided: <strong>{x.action.decision === 'act' ? String(x.action.kind).replace(/_/g, ' ') : 'dismissed'}</strong> — {x.action.reason} <span style={muted}>({fmtInstant(x.action.decided_at)}; effect {JSON.stringify(x.action.effect)})</span></div> : null}
            {isOwner && x.state === 'proposed' ? <div><button type="button" onClick={() => setChoice({ findingId: x.finding_id, kind: '', targetId: '' })} aria-pressed={choice.findingId === x.finding_id}>Decide…</button></div> : null}
          </li>))}</ul>
      )}
      {isOwner && f !== null ? (
        <div style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-8)' }}>
          <strong>Deciding:</strong> {f.statement}
          {ownFinding ? <LiveStatus>You proposed this finding: its action is decided by another product analytics owner.</LiveStatus> : null}
          <div style={row}>
            <label htmlFor="ux-kind">Action</label>
            <select id="ux-kind" style={inputStyle} value={choice.kind} onChange={(e) => setChoice({ ...choice, kind: e.target.value, targetId: '' })}>
              <option value="">— dismiss the finding —</option>{KINDS.map((k) => <option key={k} value={k}>{k.replace(/_/g, ' ')}</option>)}
            </select>
            {targets.length > 0 ? (<><label htmlFor="ux-target">Target</label>
              <select id="ux-target" style={inputStyle} value={choice.targetId} onChange={(e) => setChoice({ ...choice, targetId: e.target.value })}><option value="">— choose —</option>{targets.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></>) : null}
          </div>
          {pvProblem !== null ? <LiveStatus>{pvProblem}</LiveStatus> : null}
          {preview === null ? <Empty>reading the consequence preview…</Empty> : (
            <div aria-live="polite">
              <p style={{ marginBlockEnd: 0 }}><strong>Consequence preview</strong> (what deciding does — {preview['automatic'] === false ? 'nothing is automatic' : ''}):</p>
              <ul>{(preview['effects'] as string[]).map((x) => <li key={x}>{x}</li>)}</ul>
              {preview['admissible'] === false ? <LiveStatus>{String(preview['problem'])}</LiveStatus> : null}
              <p style={muted}>Preview <Mono>{String(preview['preview_digest']).slice(0, 12)}…</Mono> · finding <Mono>{String(preview['finding_digest']).slice(0, 12)}…</Mono></p>
              <ReasonBox reason={reason} setReason={setReason} id="ux-reason-action" />
              <div style={row}>
                <GovernedButton label={choice.kind === '' ? 'Dismiss the finding' : `Decide: ${choice.kind.replace(/_/g, ' ')}`} pendingLabel="Deciding" variant={choice.kind === 'hold_collection' || choice.kind === 'retire_measure' ? 'critical' : 'primary'}
                  disabled={!reasonOk || ownFinding || preview['admissible'] === false}
                  onRun={() => act(() => experience.decide(scope, f.finding_id, { decision: choice.kind === '' ? 'dismiss' : 'act', kind: choice.kind === '' ? null : choice.kind, targetId: choice.targetId === '' ? null : choice.targetId,
                    reason, findingDigest: f.digest, previewDigest: String(preview['preview_digest']) }), 'decide', 'findings').then(() => setChoice({ findingId: '', kind: '', targetId: '' }))} />
                <button type="button" onClick={() => setChoice({ findingId: '', kind: '', targetId: '' })}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      ) : null}
      {isAnalyst && j.metrics.length > 0 ? (
        <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <label htmlFor="ux-origin">Propose a finding from a baseline</label>
          <select id="ux-origin" style={inputStyle} value={origin} onChange={(e) => setOrigin(e.target.value)}><option value="">— baseline —</option>{j.metrics.map((b) => <option key={b.baseline_id} value={b.baseline_id}>{b.measure} {b.period_key} ({b.state})</option>)}</select>
          <textarea aria-label="What was found (16+ characters)" style={textareaStyle} value={statement} onChange={(e) => setStatement(e.target.value)} rows={2} />
          <GovernedButton label="Propose finding" pendingLabel="Proposing" variant="quiet" disabled={origin === '' || statement.trim().length < 16}
            onRun={() => act(() => experience.proposeFinding(scope, { originKind: 'baseline', originId: origin, journeyKey: j.journey.journey_key, statement }), 'finding', 'findings').then(() => setStatement(''))} />
        </div>
      ) : null}
    </>
  );
}

function Definitions({ ws, isAnalyst, isOwner, isPrivacy, reason, setReason, reasonOk, act }: Common) {
  const { scope, me } = useShell();
  const [form, setForm] = useState({ eventKey: '', title: '', journeyKey: '', stepKey: '', fields: '{}' });
  const fieldsOk = (() => { try { const v = JSON.parse(form.fields) as unknown; return typeof v === 'object' && v !== null && !Array.isArray(v); } catch { return false; } })();
  return (
    <section aria-labelledby="ux-defs" style={section}>
      <h2 id="ux-defs" style={h2}>Telemetry definitions</h2>
      <p style={muted}>Each event is a journey step with a whitelist of enumerations, bounded numbers, durations and flags — no text, no content, no identifier. A named privacy officer (never the proposer) reviews each version; collection can be held while a question is open.</p>
      {ws.definitions.length === 0 ? <Empty>No telemetry definition: nothing is collected.</Empty> : (
        <ScrollBox label="Telemetry definitions">
          <table style={tableStyle}><thead><tr><Th>Event</Th><Th>Journey · step</Th><Th>Fields (whitelist)</Th><Th>State</Th><Th>Collected</Th><Th>Acts</Th></tr></thead>
            <tbody>{ws.definitions.map((d) => {
              const c = collectionLine(d); const t = ws.collection[d.definition_id];
              return (
                <tr key={d.definition_id}>
                  <Td><Mono>{d.event_key}</Mono> v{d.version}<div style={muted}>{d.title}</div></Td>
                  <Td>{d.journey_key} · {d.step_key}<div style={muted}>{d.purpose_key}</div></Td>
                  <Td>{fieldsLine(d.fields)}</Td>
                  <Td><MarkView m={c.mark} /><div>{c.text}</div>{d.decision_reason ? <div style={muted}>review: {d.decision_reason}</div> : null}</Td>
                  <Td>{t === undefined ? '—' : `${t.stored} stored over ${t.days} day(s); purged ${t.purged}; not collected: ${Object.entries(t.not_collected).map(([k, v]) => `${k.replace(/_/g, ' ')} ${v}`).join(', ') || 'none'}`}</Td>
                  <Td>
                    {isPrivacy && d.state === 'proposed' && d.proposed_by !== me.principalId ? (<>
                      <GovernedButton label="Approve" pendingLabel="Reviewing" disabled={!reasonOk} onRun={() => act(() => experience.review(scope, d.definition_id, { decision: 'approve', reason, digest: d.digest }), 'review', 'definitions')} />
                      <GovernedButton label="Reject" pendingLabel="Reviewing" variant="quiet" disabled={!reasonOk} onRun={() => act(() => experience.review(scope, d.definition_id, { decision: 'reject', reason, digest: d.digest }), 'review', 'definitions')} /></>) : null}
                    {isPrivacy && d.state === 'approved' && d.collection === 'open' ? <GovernedButton label="Hold collection" pendingLabel="Holding" variant="critical" disabled={!reasonOk} onRun={() => act(() => experience.hold(scope, d.definition_id, reason), 'hold', 'definitions')} /> : null}
                    {isPrivacy && d.state === 'approved' && d.collection === 'held' ? <GovernedButton label="Release collection" pendingLabel="Releasing" disabled={!reasonOk} onRun={() => act(() => experience.release(scope, d.definition_id, reason), 'release', 'definitions')} /> : null}
                    {(isPrivacy || isOwner) && (d.state === 'approved' || d.state === 'proposed') ? <GovernedButton label="Retire" pendingLabel="Retiring" variant="quiet" disabled={!reasonOk} onRun={() => act(() => experience.retire(scope, d.definition_id, reason), 'retire', 'definitions')} /> : null}
                  </Td>
                </tr>);
            })}</tbody></table>
        </ScrollBox>
      )}
      {isPrivacy || isOwner ? <ReasonBox reason={reason} setReason={setReason} id="ux-reason-defs" /> : null}
      {isAnalyst ? (
        <div style={{ marginBlockStart: 'var(--eye-space-12)' }}>
          <h3 style={h3}>Define an event (a new version for the privacy review)</h3>
          <div style={row}>
            <input aria-label="Event key" placeholder="operating-review.open" style={inputStyle} value={form.eventKey} onChange={(e) => setForm({ ...form, eventKey: e.target.value })} />
            <input aria-label="Title" placeholder="title" style={inputStyle} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            <select aria-label="Journey" style={inputStyle} value={form.journeyKey} onChange={(e) => setForm({ ...form, journeyKey: e.target.value, stepKey: '' })}><option value="">— journey —</option>{ws.journeys.map((x) => <option key={x.journey.journey_key} value={x.journey.journey_key}>{x.journey.journey_key}</option>)}</select>
            <select aria-label="Step" style={inputStyle} value={form.stepKey} onChange={(e) => setForm({ ...form, stepKey: e.target.value })}><option value="">— step —</option>{(ws.journeys.find((x) => x.journey.journey_key === form.journeyKey)?.journey.steps ?? []).map((s) => <option key={s} value={s}>{s}</option>)}</select>
          </div>
          <label htmlFor="ux-fields">Field whitelist (JSON: {'{"view": {"type": "enum", "values": ["list", "detail"]}}'})</label>
          <textarea id="ux-fields" style={textareaStyle} rows={3} value={form.fields} onChange={(e) => setForm({ ...form, fields: e.target.value })} aria-invalid={!fieldsOk} />
          {!fieldsOk ? <LiveStatus>The whitelist is a JSON object.</LiveStatus> : null}
          <GovernedButton label="Propose the definition" pendingLabel="Proposing" disabled={!fieldsOk || form.eventKey === '' || form.journeyKey === '' || form.stepKey === ''}
            onRun={() => act(() => experience.define(scope, { eventKey: form.eventKey, title: form.title, journeyKey: form.journeyKey, stepKey: form.stepKey, fields: JSON.parse(form.fields) as Row }), 'define', 'definitions')} />
        </div>
      ) : null}
    </section>
  );
}

function Reviews({ ws }: { ws: Workspace }) {
  return (
    <section aria-labelledby="ux-items" style={section}>
      <h2 id="ux-items" style={h2}>Routed reviews</h2>
      <p style={muted}>Threshold crossings, proposed findings and invalidated experiments go to the product analytics owner; held collection to the privacy officer — reviews, never automatic decisions.</p>
      {ws.items.length === 0 ? <Empty>No review is routed.</Empty> : (
        <ul>{ws.items.slice(0, 30).map((i) => <li key={i.item_id}><MarkView m={stateMark(i.state === 'closed' ? 'superseded' : 'proposed')} /> {i.title} <span style={muted}>({i.signal_class}, {i.state}, to {i.route_roles.join(', ') || 'unrouted'}, {fmtInstant(i.created_at)})</span></li>)}</ul>
      )}
      <p style={muted}>Consent, as counts (never who): {ws.consent_counts.map((c) => `${c.purpose_key}: ${c.consenting_now} consenting, ${c.withdrawals_recorded} withdrawal(s)`).join(' · ') || 'none recorded'}</p>
    </section>
  );
}

function PurgeAndExport({ ws, isOwner, isPrivacy, reason, setReason, reasonOk, act }: Common) {
  const { scope } = useShell();
  const [title, setTitle] = useState('');
  const [download, setDownload] = useState<Row | null>(null); const [dlProblem, setDlProblem] = useState<string | null>(null);
  const wanted = useRef('');
  const fetchExport = async (id: string) => {
    wanted.current = id; setDownload(null); setDlProblem(null);
    const r = await experience.exportDownload(scope, id);
    if (wanted.current !== id) return;
    if (r.ok && r.data !== undefined) setDownload(r.data.export); else setDlProblem(`HTTP ${r.status} — ${r.error?.message ?? 'the export could not be read'}`);
  };
  const save = () => {
    if (download === null) return;
    const url = URL.createObjectURL(new Blob([String(download['canonical'])], { type: 'application/json' }));
    const a = document.createElement('a'); a.href = url; a.download = `experience-export-${String(download['export_id'])}.json`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <section aria-labelledby="ux-retention" style={section}>
      <h2 id="ux-retention" style={h2}>Retention and export</h2>
      <h3 style={h3}>Purges</h3>
      {ws.purges.length === 0 ? <Empty>No purge recorded.</Empty> : (
        <ul>{ws.purges.map((g) => <li key={String(g['purge_id'])}>{fmtInstant(g['purged_at'])}: {String(g['total_deleted'])} event(s) older than their retention deleted — {String(g['reason'])} ({(g['counts'] as Row[]).map((c) => `${String(c['event_key'])} v${String(c['version'])}: ${String(c['deleted'])}`).join(', ')})</li>)}</ul>
      )}
      {isPrivacy ? <div style={row}><GovernedButton label="Purge events past their retention" pendingLabel="Purging" variant="critical" disabled={!reasonOk} onRun={() => act(() => experience.purge(scope, reason), 'purge', 'exports')} /></div> : null}
      <h3 style={h3}>Exports (aggregates only — no event, no pseudonym, no person; below k suppressed)</h3>
      {ws.exports.length === 0 ? <Empty>No export.</Empty> : (
        <ul>{ws.exports.map((x) => <li key={String(x['export_id'])}>{String(x['title'])} · {String(x['canonical_bytes'])} bytes · sha256 <Mono>{String(x['digest']).slice(0, 16)}…</Mono> · {fmtInstant(x['created_at'])} <button type="button" onClick={() => void fetchExport(String(x['export_id']))}>Read</button></li>)}</ul>
      )}
      {dlProblem !== null ? <LiveStatus>{dlProblem}</LiveStatus> : null}
      {download !== null ? <p>{download['verified'] === true ? 'Digest re-verified at the read.' : 'THE DIGEST DOES NOT MATCH — do not use this package.'} <button type="button" onClick={save} disabled={download['verified'] !== true}>Save the package</button></p> : null}
      {isOwner ? (
        <div style={row}>
          <input aria-label="Export title" placeholder="Experience quality, 2026-Q3" style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
          <GovernedButton label="Create an export" pendingLabel="Exporting" disabled={title.trim().length < 4} onRun={() => act(() => experience.exportCreate(scope, title), 'export', 'exports')} />
        </div>
      ) : null}
      {isPrivacy ? <ReasonBox reason={reason} setReason={setReason} id="ux-reason-retention" /> : null}
    </section>
  );
}
