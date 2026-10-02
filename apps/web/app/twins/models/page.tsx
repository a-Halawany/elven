'use client';
/**
 * CP-6 B30 §EN (0103; F-P5-04) — BEHAVIOUR MODELS: each model's operating envelope, its STEWARDSHIP in this domain (proposed → approved →
 * deprecated → retired, set by a method steward; compatibility per twin kind), its CALIBRATIONS against observed outcomes (MAE, MAPE, bias
 * over n pairs; stable, drifting or insufficient against the declared tolerance — the model-fitness indicators), the runs OUTSIDE the
 * envelope (disabled for decision use; exploratory only by a twin owner's admission and a steward's concurrence) and the AI CONTEXT an
 * agent reads beside the twin's state. The server decides every act; its refusal is shown verbatim. Every number is SYNTHETIC.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { twins as twinApi, type Twin } from '../../../lib/twins';
import {
  envelope as api, calibrationLine, driftMark, exploratoryLine, lifecycleMark, nextStates, outsideKeys, toleranceOf,
  type AiContext, type EnvelopeEvent, type EnvelopeRun, type LifecycleState, type ModelRow,
} from '../../../lib/envelope-b30';
import { Empty, LiveStatus, Mono, UnknownNote, cardStyle, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type R = { policyDecisionId: string; auditSeq: number };
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const short = (v: unknown): string => (typeof v === 'string' && v !== '' ? `${v.slice(0, 8)}…` : '—');

function Mark({ m }: { m: { glyph: string; token: string; text: string } }) {
  return <span style={{ color: `var(${m.token})`, fontWeight: 650 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}

/** One model: the envelope, the stewardship, the calibrations; for a method steward, the next lifecycle step and a compatibility declaration. */
function ModelCard({ m, canSteward, onDone }: { m: ModelRow; canSteward: boolean; onDone: (line: string, receipt: R | null) => Promise<void> }) {
  const { scope } = useShell();
  const steps = nextStates(m.state);
  const [to, setTo] = useState<LifecycleState>(steps[0] ?? 'deprecated');
  const [reason, setReason] = useState('');
  const [kind, setKind] = useState('supply-chain');
  const [compatible, setCompatible] = useState<'true' | 'false'>('true');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const id = m.method_ref.replace(/[^a-z0-9]/g, '-');
  return (
    <article style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-8)' }} aria-label={`behaviour model ${m.method_ref}`}>
      <h3 style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}><Mono>{m.method_ref}</Mono> — {m.name} <span style={{ color: 'var(--eye-color-ink-muted)' }}>({m.family})</span></h3>
      <p><Mark m={lifecycleMark(m.state, m.implicit)} />{m.steward ? <> · steward <Mono>{short(m.steward)}</Mono></> : null}{m.reason && !m.implicit ? <> — {m.reason}</> : null}{m.updated_at ? <> ({fmtInstant(m.updated_at)})</> : null}</p>
      <p>Operating envelope: {Object.entries(m.operating_envelope).filter(([, v]) => Array.isArray(v)).map(([k, v]) => `${k} ∈ [${(v as unknown[]).join(', ')}]`).join('; ') || 'none declared'}
        {' '}· {m.runs} run(s) in this domain{m.pinned ? '' : ' · no implementation pinned'}</p>
      <p>Compatibility: {Object.keys(m.compatibility).length === 0 ? 'no declaration (every kind the twin registry allows)' : Object.entries(m.compatibility).map(([k, c]) => `${k} — ${c.compatible ? 'COMPATIBLE' : 'INCOMPATIBLE: runs refused'} (${c.note})`).join('; ')}</p>
      {m.calibrations.length === 0 ? <p style={{ color: 'var(--eye-color-ink-muted)' }}>No calibration recorded: its fitness against observed outcomes is unknown.</p> : (
        <ul aria-label={`calibrations of ${m.method_ref}`}>{m.calibrations.map((c) => (
          <li key={`${c.twin_id}-${c.key}`}><Mark m={driftMark(c.drift_state)} /> {c.twin_title} · <Mono>{c.key}</Mono> (#{c.seq}) — {calibrationLine(c)}</li>
        ))}</ul>
      )}
      {canSteward ? (
        <details>
          <summary>Stewardship of {m.method_ref}</summary>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' }}>
            <div><label htmlFor={`to-${id}`} style={{ display: 'block' }}>Next state</label>
              <select id={`to-${id}`} style={{ ...inputStyle, inlineSize: '100%' }} value={to} onChange={(e) => setTo(e.target.value as LifecycleState)}>{steps.map((s) => <option key={s} value={s}>{s}</option>)}</select></div>
            <div><label htmlFor={`reason-${id}`} style={{ display: 'block' }}>Reason (8+ characters)</label>
              <input id={`reason-${id}`} type="text" style={{ ...inputStyle, inlineSize: '100%' }} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
          </div>
          <GovernedButton label={`Set ${m.method_ref} ${to}`} pendingLabel="setting" variant={to === 'retired' ? 'critical' : 'primary'} disabled={reason.trim().length < 8} onRun={async () => {
            const r = await api.setState(scope, { modelRef: m.method_ref, state: to, reason: reason.trim() });
            if (!r.ok || r.data === undefined) { const msg = refusal(r, 'the change was not answered'); setProblem(`not changed — ${msg}`); throw new Error(msg); }
            setProblem(null); setReason('');
            await onDone(`${m.method_ref} is ${String(r.data.lifecycle['state']).toUpperCase()} in this domain`, r.data.receipt);
          }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-8)' }}>
            <div><label htmlFor={`kind-${id}`} style={{ display: 'block' }}>Twin kind</label>
              <input id={`kind-${id}`} type="text" style={{ ...inputStyle, inlineSize: '100%' }} value={kind} onChange={(e) => setKind(e.target.value)} /></div>
            <div><label htmlFor={`compat-${id}`} style={{ display: 'block' }}>Declaration</label>
              <select id={`compat-${id}`} style={{ ...inputStyle, inlineSize: '100%' }} value={compatible} onChange={(e) => setCompatible(e.target.value as 'true' | 'false')}>
                <option value="true">compatible</option><option value="false">incompatible — refuse its runs</option></select></div>
            <div><label htmlFor={`note-${id}`} style={{ display: 'block' }}>Note (8+ characters)</label>
              <input id={`note-${id}`} type="text" style={{ ...inputStyle, inlineSize: '100%' }} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          </div>
          <GovernedButton label="Declare compatibility" pendingLabel="declaring" variant="quiet" disabled={note.trim().length < 8 || kind.trim() === ''} onRun={async () => {
            const r = await api.compatibility(scope, { modelRef: m.method_ref, kind: kind.trim(), compatible: compatible === 'true', note: note.trim() });
            if (!r.ok || r.data === undefined) { const msg = refusal(r, 'the declaration was not answered'); setProblem(`not declared — ${msg}`); throw new Error(msg); }
            setProblem(null); setNote('');
            await onDone(`${m.method_ref} declared ${compatible === 'true' ? 'compatible' : 'INCOMPATIBLE'} with ${kind.trim()}`, r.data.receipt);
          }} />
          {problem === null ? null : <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>{problem}</span></LiveStatus>}
        </details>
      ) : null}
    </article>
  );
}

export default function ModelsPage() {
  const { scope, me, isTwinOwner } = useShell();
  const holds = (role: string) => me.bindings.some((b) => b.roleCode === role && b.scope === 'DOMAIN' && b.domainId === scope.domainId);
  const isSteward = holds('method_steward');
  const canCalibrate = isTwinOwner || isSteward || holds('domain_admin');
  const [models, setModels] = useState<ModelRow[] | null>(null);
  const [events, setEvents] = useState<EnvelopeEvent[]>([]);
  const [runs, setRuns] = useState<EnvelopeRun[]>([]);
  const [twinsList, setTwins] = useState<Twin[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<R | null>(null);
  const [twinId, setTwinId] = useState('');
  const [key, setKey] = useState('outcome.line_stop_days:SYN-LINE-A1');
  const [metric, setMetric] = useState<'mape' | 'mae'>('mape');
  const [tol, setTol] = useState('20');
  const [minN, setMinN] = useState('');
  const [calProblem, setCalProblem] = useState<string | null>(null);
  const [ctxVersion, setCtxVersion] = useState('');
  const [ctx, setCtx] = useState<AiContext | null>(null);

  const load = async () => {
    const [m, r, t] = await Promise.all([api.models(scope), api.runs(scope), twinApi.list(scope)]);
    if (!m.ok || m.data === undefined) { setProblem(m.error?.message ?? 'the behaviour models could not be read'); return; }
    setModels(m.data.models); setEvents(m.data.events);
    if (r.ok && r.data !== undefined) setRuns(r.data.runs);
    if (t.ok && t.data !== undefined) { setTwins(t.data.twins); setTwinId((p) => p || (t.data?.twins[0]?.twin_id ?? '')); }
  };
  useEffect(() => { void load(); }, [scope]);
  const onDone = async (line: string, r: R | null) => { setLast(line); setReceipt(r); await load(); };

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (models === null) return <Empty>reading the behaviour models…</Empty>;
  const twin = twinsList.find((t) => t.twin_id === twinId);
  const admitted = (twin?.versions ?? []).filter((v) => v.state === 'admitted');

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Behaviour models</h1>
      <UnknownNote><strong>Every number on this screen is SYNTHETIC.</strong> A behaviour outside its model’s operating envelope is <strong>disabled for decision use</strong>;
        a model’s fitness is what its calibrations against LATER observed outcomes say, and an insufficient calibration is not evidence of accuracy.</UnknownNote>

      <section aria-labelledby="models-h" style={{ marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="models-h" style={{ fontSize: 'var(--eye-type-heading-2)' }}>Models, stewardship and calibration</h2>
        {models.map((m) => <ModelCard key={m.method_ref} m={m} canSteward={isSteward} onDone={onDone} />)}
      </section>

      <section aria-labelledby="outside-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="outside-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Runs outside the envelope</h2>
        {runs.length === 0 ? <Empty>No run lies outside its operating envelope.</Empty> : (
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Run</Th><Th>Twin</Th><Th>Outside</Th><Th>Decision use</Th><Th>Exploratory</Th></tr></thead>
            <tbody>{runs.map((r) => (
              <tr key={r.run_id}>
                <Td mono>{short(r.run_id)}</Td><Td>{r.twin_title} v{r.twin_version} · <Mono>{r.model_ref}</Mono></Td>
                <Td mono>{outsideKeys(r.envelope_check).join('; ')}</Td>
                <Td><strong style={{ color: 'var(--eye-color-critical)' }}>{r.decision_use.label}</strong></Td>
                <Td>{exploratoryLine(r)}</Td>
              </tr>
            ))}</tbody>
          </table>
        )}
        <p style={{ fontSize: 'var(--eye-type-label-sm)' }}><a href="/twins/simulations">Admit or concur from the run on the Simulations page →</a></p>
      </section>

      <section aria-labelledby="cal-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="cal-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Calibrate against observed outcomes</h2>
        <p style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>The server pairs the model’s predictions (control runs inside the envelope, simulated or predicted elements, recorded
          reconciliations) with LATER observed values of the key and computes the error; below the minimum number of pairs the state is insufficient.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' }}>
          <div><label htmlFor="cal-twin" style={{ display: 'block' }}>Twin</label>
            <select id="cal-twin" style={{ ...inputStyle, inlineSize: '100%' }} value={twinId} onChange={(e) => { setTwinId(e.target.value); setCtx(null); setCtxVersion(''); }}>{twinsList.map((t) => <option key={t.twin_id} value={t.twin_id}>{t.title}</option>)}</select></div>
          <div><label htmlFor="cal-key" style={{ display: 'block' }}>Element key</label>
            <input id="cal-key" type="text" style={{ ...inputStyle, inlineSize: '100%' }} value={key} onChange={(e) => setKey(e.target.value)} /></div>
          <div><label htmlFor="cal-metric" style={{ display: 'block' }}>Tolerance metric</label>
            <select id="cal-metric" style={{ ...inputStyle, inlineSize: '100%' }} value={metric} onChange={(e) => setMetric(e.target.value as 'mape' | 'mae')}>
              <option value="mape">MAPE (per cent)</option><option value="mae">MAE (the key's unit)</option></select></div>
          <div><label htmlFor="cal-tol" style={{ display: 'block' }}>Tolerance</label>
            <input id="cal-tol" type="text" inputMode="decimal" style={{ ...inputStyle, inlineSize: '100%' }} value={tol} onChange={(e) => setTol(e.target.value)} /></div>
          <div><label htmlFor="cal-minn" style={{ display: 'block' }}>Minimum pairs (optional, default 3)</label>
            <input id="cal-minn" type="text" inputMode="numeric" style={{ ...inputStyle, inlineSize: '100%' }} value={minN} onChange={(e) => setMinN(e.target.value)} /></div>
        </div>
        {canCalibrate && twin !== undefined ? (
          <GovernedButton label={`Calibrate ${twin.behaviour_model_ref} on ${twin.title}`} pendingLabel="calibrating" onRun={async () => {
            const t = toleranceOf(metric, tol, minN);
            if ('problem' in t) { setCalProblem(t.problem); throw new Error(t.problem); }
            const r = await api.calibrate(scope, { twinId: twin.twin_id, modelRef: twin.behaviour_model_ref, key: key.trim(), tolerance: t });
            if (!r.ok || r.data === undefined) { const msg = refusal(r, 'the calibration was not answered'); setCalProblem(`not calibrated — ${msg}`); throw new Error(msg); }
            setCalProblem(null);
            await onDone(`${twin.behaviour_model_ref} on ${twin.title}, ${key.trim()}: ${calibrationLine(r.data.calibration)}`, r.data.receipt);
          }} />
        ) : null}
        {calProblem === null ? null : <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>{calProblem}</span></LiveStatus>}
      </section>

      <section aria-labelledby="ctx-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="ctx-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>What an AI consumer is told</h2>
        <div><label htmlFor="ctx-version" style={{ display: 'block' }}>Version of {twin?.title ?? 'the twin'}</label>
          <select id="ctx-version" style={inputStyle} value={ctxVersion} onChange={(e) => setCtxVersion(e.target.value)}>
            <option value="">the latest admitted on actual</option>{admitted.map((v) => <option key={v.version} value={v.version}>v{v.version} · {v.branch_id}</option>)}</select></div>
        {twin !== undefined ? <GovernedButton label="Read the AI context" pendingLabel="reading" variant="quiet" onRun={async () => {
          const r = await api.aiContext(scope, twin.twin_id, ctxVersion === '' ? undefined : Number(ctxVersion));
          if (!r.ok || r.data === undefined) { const msg = refusal(r, 'the context was not answered'); setLast(msg); throw new Error(msg); }
          setCtx(r.data.context); setReceipt(r.data.receipt);
        }} /> : null}
        {ctx === null ? null : (
          <dl aria-label="AI context">
            <dt>Envelope</dt><dd><strong style={{ color: ctx.envelope.check.state === 'outside' ? 'var(--eye-color-critical)' : 'inherit' }}>{ctx.envelope.check.state.toUpperCase()}</strong>
              {outsideKeys(ctx.envelope.check as unknown as Record<string, unknown>).length > 0 ? <> — {outsideKeys(ctx.envelope.check as unknown as Record<string, unknown>).join('; ')}</> : null} · model <Mono>{ctx.model.model_ref}</Mono> <Mark m={lifecycleMark(ctx.model.lifecycle_state)} /></dd>
            <dt>Stale variables</dt><dd>{ctx.stale_variables.length === 0 ? 'none' : ctx.stale_variables.map((s) => `${s.key} (${s.reason})`).join('; ')}</dd>
            <dt>Sensitivity</dt><dd>{ctx.sensitivity === null ? 'no analysis of a run on this version' : `${ctx.sensitivity.metric}: ${ctx.sensitivity.factors.map((f) => String(f['key'])).join(', ')} (robustness ${ctx.sensitivity.robustness_verdict})`}</dd>
            <dt>Fitness</dt><dd>version {ctx.fitness.version_fitness}{ctx.fitness.calibrations.map((c) => ` · ${c.key}: ${driftMark(c.drift_state).text}`).join('')}</dd>
            <dt>Cut-offs</dt><dd>observed through <Mono>{ctx.cutoffs.observed_through ?? '—'}</Mono> ({ctx.cutoffs.observation_age_days ?? '—'} days ago)</dd>
            <dt>Instructions</dt><dd><ul>{ctx.instructions.map((i) => <li key={i}>{i}</li>)}</ul></dd>
          </dl>
        )}
      </section>

      <section aria-labelledby="ledger-h" style={{ marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="ledger-h" style={{ fontSize: 'var(--eye-type-heading-2)' }}>The envelope ledger</h2>
        {events.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>When</Th><Th>Event</Th><Th>Model</Th><Th>By</Th></tr></thead>
            <tbody>{events.map((e) => <tr key={e.event_id}><Td>{fmtInstant(e.occurred_at)}</Td><Td mono>{e.event}</Td><Td mono>{e.method_ref ?? '—'}</Td><Td mono>{short(e.actor_principal_id)}</Td></tr>)}</tbody>
          </table>
        )}
      </section>
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
      <Receipt receipt={receipt} />
    </>
  );
}
