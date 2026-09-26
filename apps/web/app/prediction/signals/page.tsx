'use client';
/**
 * Weak signals — the workbench (CP-6 B28, 0088 §S; F-P4-10: WS-08, UX-33-001..006, JRN-06, OBJ-17/-18, CAP-FW-01/-02).
 *
 * The queue of weak signals with their evidence pattern, baseline and novelty, the independence verdicts, the disposition form (a falsify
 * condition with `monitor`), the escalation that submits a warning candidate, the detections (held ones with their reasons — a degraded
 * input is shown, never hidden), the detectors (the ABSENT ones with their reasons, the false-positive controls on SYNTHETIC fixtures) and
 * the indicator registry's governance. Three things this screen never does, because the server decides them: it never sets a maturity
 * (only independent corroboration moves it), it never lets the nominator's own disposition through (the server refuses it and the refusal
 * is shown as it is stated), and it raises no warning (an escalation is a candidate; the early-warning lifecycle clusters or raises it).
 * What a control offers is courtesy; what the server refuses is shown verbatim.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import { signals, MATURITY_LABEL, INDEPENDENCE_LABEL, DISPOSITION_LABEL, corroborationLine, nominatorLabel,
         type Queue, type SignalDetail, type DetectorRow, type ControlRow, type IndicatorGovernanceRow, type Condition } from '../../../lib/signals';
import { Empty, LiveStatus, Mono, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type R = { policyDecisionId: string; auditSeq: number } | null;
const brief = (v: unknown): string => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

export default function SignalsPage() {
  const { scope, me, isStrategyOwner, isForecastOwner } = useShell();
  const isAnalyst = me.bindings.some((b) => b.roleCode === 'domain_analyst' && b.domainId === scope.domainId) || isStrategyOwner || isForecastOwner;
  const [queue, setQueue] = useState<Queue | null>(null);
  const [open, setOpen] = useState<SignalDetail | null>(null);
  const [det, setDet] = useState<{ detectors: DetectorRow[]; absent: Array<{ detector: string; reason: string }>; controls: ControlRow[] } | null>(null);
  const [inds, setInds] = useState<IndicatorGovernanceRow[] | null>(null);
  const [pairs, setPairs] = useState<Array<{ a: string; b: string; verdict: string; reasons: string[] }> | null>(null);
  const [asOf, setAsOf] = useState('');
  const [evidence, setEvidence] = useState({ objectId: '', objectVersion: '', stance: 'supporting' as 'supporting' | 'contradicting' });
  const [disp, setDisp] = useState({ disposition: 'monitor' as 'confirm' | 'monitor' | 'dismiss', note: '', falsify: '', reviewBy: '' });
  const [esc, setEsc] = useState({ note: '', consequence: 'C2' as 'C1' | 'C2' | 'C3' | 'C4', windowHours: '72' });
  const [strengthen, setStrengthen] = useState('');
  const [gov, setGov] = useState({ id: '', expiresAt: '', reviewEveryDays: '', classification: '', reason: '' });
  const [problem, setProblem] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<R>(null);

  const load = async () => {
    const [q, d, i] = await Promise.all([signals.queue(scope), signals.detectors(scope), signals.indicators(scope)]);
    if (!q.ok || q.data === undefined) { setProblem(q.error?.message ?? 'the weak signals could not be read'); return; }
    setQueue(q.data);
    if (d.ok && d.data !== undefined) setDet(d.data);
    if (i.ok && i.data !== undefined) setInds(i.data.indicators);
  };
  const reopen = async (id: string) => {
    const r = await signals.get(scope, id);
    if (!r.ok || r.data === undefined) throw new Error(r.error?.message ?? 'the signal could not be read');
    setOpen(r.data.signal); setPairs(null);
  };
  useEffect(() => { void load(); }, [scope]);
  /** Every governed act: the server's answer or its refusal, verbatim. */
  const act = async <T,>(what: string, run: () => Promise<{ ok: boolean; data?: T & { receipt?: R }; error?: { message: string } }>, after?: (d: T) => Promise<void> | void) => {
    const r = await run();
    if (!r.ok || r.data === undefined) { const m = r.error?.message ?? `${what} was refused`; setProblem(m); throw new Error(m); }
    setProblem(null); setReceipt(r.data.receipt ?? null); setLast(what);
    if (after) await after(r.data);
    await load();
  };

  if (queue === null) return problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : <Empty>reading the weak signals…</Empty>;
  const falsify = (): Condition[] | undefined => (disp.falsify.trim().length >= 8 ? [{ text: disp.falsify.trim(), kind: 'observation' }] : undefined);

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Weak signals</h1>
      <p style={{ color: 'var(--eye-color-ink-muted)' }}>
        {queue.counts.total} signal(s) · {Object.entries(queue.counts.by_maturity).map(([k, v]) => `${v} ${k}`).join(' · ') || 'none'} ·
        nominated by {Object.entries(queue.counts.by_nominator).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}
      </p>
      {problem === null ? null : <LiveStatus assertive>{problem}</LiveStatus>}

      {isAnalyst ? (
        <section aria-labelledby="scan-h" style={cardStyle}>
          <h2 id="scan-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Run the detectors</h2>
          <label htmlFor="asof">As of an observation day (event time; empty: each subject&apos;s latest)</label>
          <input id="asof" style={inputStyle} value={asOf} onChange={(e) => setAsOf(e.target.value)} placeholder="YYYY-MM-DD" />
          <GovernedButton label="Run the detectors" pendingLabel="reading" onRun={() => act('the detectors ran', () => signals.scan(scope, asOf.trim() === '' ? undefined : asOf.trim()))} />{' '}
          <GovernedButton label="Rank the signals" pendingLabel="ranking" variant="quiet" onRun={() => act('the signals were ranked', () => signals.rank(scope))} />
          <UnknownNote>A detector (or the Weak Signal Agent) NOMINATES; it never disposes. Every reading is recorded once per detector version, subject and day.</UnknownNote>
        </section>
      ) : null}

      <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>The queue</h2>
      {queue.signals.length === 0 ? <Empty>No weak signal has been nominated.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <thead><tr><Th>Signal</Th><Th>Maturity</Th><Th>Corroboration</Th><Th>Novelty</Th><Th>Disposition</Th><Th>Nominated by</Th><Th>As of</Th></tr></thead>
          <tbody>
            {queue.signals.map((s) => s.withheld !== undefined ? (
              <tr key={s.signal_id}><Td mono>{s.signal_id.slice(0, 8)}…</Td><Td>{MATURITY_LABEL[s.maturity]}</Td><Td>{s.withheld}</Td><Td>—</Td><Td>—</Td><Td>—</Td><Td>—</Td></tr>
            ) : (
              <tr key={s.signal_id}>
                <Td><button type="button" onClick={() => void reopen(s.signal_id).catch((e: Error) => setProblem(e.message))}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-default)', cursor: 'pointer', textDecoration: 'underline', textAlign: 'start' }}>{s.title}</button>
                  {s.synthetic_state ? <div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-warning)' }}>SYNTHETIC evidence in its basis</div> : null}</Td>
                <Td>{MATURITY_LABEL[s.maturity]}</Td>
                <Td>{corroborationLine(s)}</Td>
                <Td mono>{s.novelty === null || s.novelty === undefined ? 'no measure' : Number(s.novelty).toFixed(2)}</Td>
                <Td>{s.disposition ? `${DISPOSITION_LABEL[s.disposition]} ${String(s.disposition_by).slice(0, 8)}…` : 'awaiting a person'}</Td>
                <Td>{nominatorLabel(s.nominator_kind)}{s.detector_key ? <> · <Mono>{s.detector_key}</Mono></> : null}</Td>
                <Td>{s.as_of ?? '—'}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {queue.ranking === null ? null : (
        <section aria-labelledby="rank-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h3 id="rank-h" style={{ marginBlockStart: 0 }}>The latest ranking — by {queue.ranking.ranker_kind === 'agent' ? 'the Weak Signal Agent' : 'an analyst'}, {fmtInstant(queue.ranking.ranked_at)}</h3>
          <ol>{queue.ranking.ordering.map((p) => <li key={p.signal_id}>{p.withheld ?? <>{p.title} — <span style={{ color: 'var(--eye-color-ink-muted)' }}>{p.explanation}</span></>}</li>)}</ol>
          <UnknownNote>{queue.ranking.rule}</UnknownNote>
        </section>
      )}

      {open === null ? null : open.withheld !== undefined ? <LiveStatus>{open.withheld}</LiveStatus> : (
        <section aria-labelledby="sig-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="sig-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{open.title}</h2>
          <p>{open.statement}</p>
          <p><strong>{MATURITY_LABEL[open.maturity]}</strong> · {corroborationLine(open, (open.independence?.unknown ?? 0) + (open.independence?.dependent ?? 0))} · version {open.version}</p>
          <dl>
            <DefinitionRow term="Nominated by">{nominatorLabel(open.nominator_kind)} <Mono>{String(open.nominated_by).slice(0, 8)}…</Mono>{open.detector_key ? <> — detector <Mono>{open.detector_key}@{open.detector_version}</Mono>, as of {open.as_of}</> : null}</DefinitionRow>
            <DefinitionRow term="Observation"><Mono>{brief(open.observation)}</Mono></DefinitionRow>
            <DefinitionRow term="Baseline"><Mono>{brief(open.baseline)}</Mono></DefinitionRow>
            <DefinitionRow term="Novelty basis"><Mono>{brief(open.novelty_basis)}</Mono></DefinitionRow>
            <DefinitionRow term="Strengthen if">{(open.strengthen_conditions ?? []).map((c) => c.text).join(' · ') || 'none stated'}</DefinitionRow>
            <DefinitionRow term="Falsify if">{(open.falsify_conditions ?? []).map((c) => c.text).join(' · ') || 'none stated'}</DefinitionRow>
            <DefinitionRow term="Disposition">{open.disposition ? <>{DISPOSITION_LABEL[open.disposition]} <Mono>{String(open.disposition_by).slice(0, 8)}…</Mono> — {open.disposition_note}{open.review_by ? <> · next review {fmtInstant(open.review_by)}</> : null}</> : 'none yet — a named human decides'}</DefinitionRow>
            {open.candidate ? <DefinitionRow term="Warning candidate"><Mono>{open.candidate.candidate_id}</Mono> — {open.candidate.state}{open.candidate.warning_id ? <> → warning <Mono>{open.candidate.warning_id}</Mono></> : ' (the early-warning lifecycle clusters or raises it)'}</DefinitionRow> : null}
          </dl>
          <h3>The evidence pattern</h3>
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Object</Th><Th>Source · publisher</Th><Th>Origin</Th><Th>Stance</Th><Th>Independence (when added)</Th></tr></thead>
            <tbody>{(open.evidence ?? []).map((e) => (
              <tr key={e.evidence_id}>
                <Td mono>{e.object_type} {e.object_id.slice(0, 8)}…@{e.object_version}</Td>
                <Td>{e.source_key ?? 'no source'} · {e.publisher ?? 'no publisher'}</Td>
                <Td>{e.synthetic ? <strong style={{ color: 'var(--eye-color-warning)' }}>SYNTHETIC</strong> : e.data_origin}</Td>
                <Td>{e.stance} ({e.role})</Td>
                <Td>{INDEPENDENCE_LABEL[e.independence]}<div style={{ fontSize: 'var(--eye-type-label-sm)', color: 'var(--eye-color-ink-muted)' }}>{e.independence_reasons.join('; ')}</div></Td>
              </tr>))}</tbody>
          </table>
          {isAnalyst ? (
            <>
              <GovernedButton label="Test source independence" pendingLabel="testing" variant="quiet"
                onRun={() => act('source independence was tested', () => signals.testIndependence(scope, open.signal_id), (d) => { setPairs(d.independence.pairs); })} />
              {pairs === null ? null : (
                <ul>{pairs.map((p) => <li key={`${p.a}-${p.b}`}><Mono>{p.a.slice(0, 8)}…</Mono> × <Mono>{p.b.slice(0, 8)}…</Mono>: <strong>{p.verdict}</strong> — {p.reasons.join('; ')}</li>)}</ul>
              )}
              <h3>Add evidence</h3>
              <label htmlFor="ev-id">Evidence (EVD) or claim (CLM) object id</label>
              <input id="ev-id" style={inputStyle} value={evidence.objectId} onChange={(e) => setEvidence({ ...evidence, objectId: e.target.value })} />
              <label htmlFor="ev-v">Version (empty: the latest)</label>
              <input id="ev-v" style={inputStyle} value={evidence.objectVersion} onChange={(e) => setEvidence({ ...evidence, objectVersion: e.target.value })} />
              <label htmlFor="ev-s">Stance</label>
              <select id="ev-s" style={inputStyle} value={evidence.stance} onChange={(e) => setEvidence({ ...evidence, stance: e.target.value as 'supporting' | 'contradicting' })}>
                <option value="supporting">supporting</option><option value="contradicting">contradicting</option>
              </select>
              <GovernedButton label="Add the evidence" pendingLabel="judging its independence" onRun={() => act('the evidence was added', () => signals.addEvidence(scope, open.signal_id,
                { objectId: evidence.objectId.trim(), ...(evidence.objectVersion.trim() === '' ? {} : { objectVersion: Number(evidence.objectVersion) }), stance: evidence.stance, expectedVersion: open.version }), () => reopen(open.signal_id))} />
              <h3>Disposition — a named human&apos;s act (never the nominator&apos;s)</h3>
              <label htmlFor="d-kind">Disposition</label>
              <select id="d-kind" style={inputStyle} value={disp.disposition} onChange={(e) => setDisp({ ...disp, disposition: e.target.value as 'confirm' | 'monitor' | 'dismiss' })}>
                <option value="monitor">monitor</option><option value="confirm">confirm</option><option value="dismiss">dismiss</option>
              </select>
              <label htmlFor="d-note">Why (8..2000 characters)</label>
              <input id="d-note" style={inputStyle} value={disp.note} onChange={(e) => setDisp({ ...disp, note: e.target.value })} />
              <label htmlFor="d-f">What would falsify it (required with monitor unless one is already stated)</label>
              <input id="d-f" style={inputStyle} value={disp.falsify} onChange={(e) => setDisp({ ...disp, falsify: e.target.value })} />
              <label htmlFor="d-r">Next review (an instant, optional)</label>
              <input id="d-r" style={inputStyle} value={disp.reviewBy} onChange={(e) => setDisp({ ...disp, reviewBy: e.target.value })} placeholder="YYYY-MM-DDTHH:MM:SSZ" />
              <GovernedButton label="Record the disposition" pendingLabel="recording" onRun={() => act('the disposition was recorded', () => signals.dispose(scope, open.signal_id,
                { disposition: disp.disposition, note: disp.note, ...(falsify() ? { falsify: falsify() } : {}), ...(disp.reviewBy.trim() === '' ? {} : { reviewBy: disp.reviewBy.trim() }), expectedVersion: open.version }), () => reopen(open.signal_id))} />
              <h3>What would strengthen it</h3>
              <input aria-label="A strengthen condition" style={inputStyle} value={strengthen} onChange={(e) => setStrengthen(e.target.value)} />
              <GovernedButton label="State the condition" pendingLabel="recording" variant="quiet" onRun={() => act('the conditions were set', () => signals.setConditions(scope, open.signal_id,
                { strengthen: [...(open.strengthen_conditions ?? []), { text: strengthen.trim(), kind: 'observation' }], expectedVersion: open.version }), () => reopen(open.signal_id))} />
              <h3>Escalate — submits a warning candidate</h3>
              <label htmlFor="e-c">Consequence class</label>
              <select id="e-c" style={inputStyle} value={esc.consequence} onChange={(e) => setEsc({ ...esc, consequence: e.target.value as 'C1' | 'C2' | 'C3' | 'C4' })}>
                <option>C1</option><option>C2</option><option>C3</option><option>C4</option>
              </select>
              <label htmlFor="e-w">Response window (hours)</label>
              <input id="e-w" style={inputStyle} value={esc.windowHours} onChange={(e) => setEsc({ ...esc, windowHours: e.target.value })} />
              <label htmlFor="e-n">Why (8..2000 characters)</label>
              <input id="e-n" style={inputStyle} value={esc.note} onChange={(e) => setEsc({ ...esc, note: e.target.value })} />
              <GovernedButton label="Escalate" pendingLabel="submitting" variant="critical" disabled={open.maturity === 'invalid'} onRun={() => act('the escalation submitted a warning candidate', () => signals.escalate(scope, open.signal_id,
                { note: esc.note, consequence: esc.consequence, windowHours: Number(esc.windowHours), expectedVersion: open.version }), () => reopen(open.signal_id))} />
            </>
          ) : null}
          <h3>The signal&apos;s record</h3>
          <ol>{(open.events ?? []).map((e, i) => <li key={i}>v{e.signal_version} · <Mono>{e.event}</Mono> · {fmtInstant(e.occurred_at)} · <Mono>{e.actor_principal_id.slice(0, 8)}…</Mono></li>)}</ol>
          <Receipt receipt={receipt} />
        </section>
      )}

      <h2 style={{ fontSize: 'var(--eye-type-heading-2)' }}>Detections</h2>
      {queue.detections.length === 0 ? <Empty>No detector has read anything yet.</Empty> : (
        <table className="eye-table" style={tableStyle}>
          <thead><tr><Th>Detector</Th><Th>Subject</Th><Th>As of</Th><Th>Measure</Th><Th>Reading</Th><Th>By</Th></tr></thead>
          <tbody>{queue.detections.slice(0, 40).map((d) => (
            <tr key={d.detection_id}>
              <Td mono>{d.detector_key}@{d.detector_version}</Td><Td mono>{d.subject_kind} {d.subject_id.slice(0, 8)}…</Td><Td>{d.as_of}</Td><Td mono>{d.measure === null ? '—' : String(d.measure)}</Td>
              <Td>{d.held_reason !== null ? <span style={{ color: 'var(--eye-color-warning)', fontWeight: 650 }}>⏸ HELD — {d.held_reason}: {String(d.held_detail ?? '')}</span> : d.fired ? '● fired' : '○ quiet'}</Td>
              <Td>{d.trigger === 'agent' ? 'the agent' : 'a person'}</Td>
            </tr>))}</tbody>
        </table>
      )}

      {det === null ? null : (
        <section aria-labelledby="det-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="det-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>The detectors</h2>
          <ul>{det.detectors.map((d) => <li key={`${d.detector_key}@${d.detector_version}`}><Mono>{d.detector_key}@{d.detector_version}</Mono> — {d.status === 'available' ? <>{d.method} · <em>{d.code_state}</em></> : <strong>ABSENT: {d.absent_reason}</strong>}</li>)}</ul>
          <h3>False-positive controls (SYNTHETIC fixtures)</h3>
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Fixture</Th><Th>Detector</Th><Th>Expected</Th><Th>Answer</Th></tr></thead>
            <tbody>{det.controls.map((c) => <tr key={`${c.fixture}-${c.detector}`}><Td>{c.description}</Td><Td mono>{c.detector}</Td><Td mono>{c.expected}</Td><Td>{c.passed ? '● ' : '✕ FAILED — '}<Mono>{c.got}</Mono></Td></tr>)}</tbody>
          </table>
        </section>
      )}

      {inds === null ? null : (
        <section aria-labelledby="ind-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-24)' }}>
          <h2 id="ind-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>The indicator registry</h2>
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Indicator</Th><Th>State</Th><Th>Classification</Th><Th>Expiry</Th><Th>Review</Th><Th>Lineage</Th></tr></thead>
            <tbody>{inds.map((i) => i.withheld !== undefined ? <tr key={i.indicator_id}><Td mono>{i.indicator_id.slice(0, 8)}…</Td><Td>{i.state}</Td><Td>{i.classification}</Td><Td>{i.withheld}</Td><Td>—</Td><Td>—</Td></tr> : (
              <tr key={i.indicator_id}>
                <Td>{i.description}<div><Mono>{i.indicator_id.slice(0, 8)}…</Mono></div></Td>
                <Td>{i.governance_state}</Td><Td>{i.classification}</Td>
                <Td>{i.expires_at ? <>{fmtInstant(i.expires_at)}{i.expired ? <strong style={{ color: 'var(--eye-color-critical)' }}> — EXPIRED</strong> : null}</> : 'none declared'}</Td>
                <Td>every {i.review_every_days} days · next {fmtInstant(i.next_review_at)}{i.review_overdue ? <strong style={{ color: 'var(--eye-color-warning)' }}> — OVERDUE</strong> : null}</Td>
                <Td><Mono>{brief(i.lineage)}</Mono></Td>
              </tr>))}</tbody>
          </table>
          {isStrategyOwner || isForecastOwner ? (
            <>
              <h3>Govern an indicator (a steward&apos;s act)</h3>
              <label htmlFor="g-id">Indicator id</label>
              <input id="g-id" style={inputStyle} value={gov.id} onChange={(e) => setGov({ ...gov, id: e.target.value })} />
              <label htmlFor="g-e">Expires at (an instant)</label>
              <input id="g-e" style={inputStyle} value={gov.expiresAt} onChange={(e) => setGov({ ...gov, expiresAt: e.target.value })} placeholder="YYYY-MM-DDTHH:MM:SSZ" />
              <label htmlFor="g-r">Review every (days)</label>
              <input id="g-r" style={inputStyle} value={gov.reviewEveryDays} onChange={(e) => setGov({ ...gov, reviewEveryDays: e.target.value })} />
              <label htmlFor="g-c">Classification</label>
              <select id="g-c" style={inputStyle} value={gov.classification} onChange={(e) => setGov({ ...gov, classification: e.target.value })}>
                <option value="">(unchanged)</option><option>public</option><option>internal</option><option>confidential</option><option>restricted</option>
              </select>
              <label htmlFor="g-why">Reason (renew, retire)</label>
              <input id="g-why" style={inputStyle} value={gov.reason} onChange={(e) => setGov({ ...gov, reason: e.target.value })} />
              <GovernedButton label="Govern" pendingLabel="recording" onRun={() => act('the indicator was governed', () => signals.govern(scope, gov.id.trim(), {
                ...(gov.expiresAt.trim() === '' ? {} : { expiresAt: gov.expiresAt.trim() }), ...(gov.reviewEveryDays.trim() === '' ? {} : { reviewEveryDays: Number(gov.reviewEveryDays) }),
                ...(gov.classification === '' ? {} : { classification: gov.classification }) }))} />{' '}
              <GovernedButton label="Renew" pendingLabel="renewing" variant="quiet" onRun={() => act('the indicator was renewed', () => signals.renew(scope, gov.id.trim(), gov.expiresAt.trim(), gov.reason))} />{' '}
              <GovernedButton label="Retire" pendingLabel="retiring" variant="critical" onRun={() => act('the indicator was retired', () => signals.retire(scope, gov.id.trim(), gov.reason))} />
            </>
          ) : null}
          <UnknownNote>An expired or retired indicator is not evaluated and not read by the detectors; a renewal resumes it from its last evaluated observation.</UnknownNote>
        </section>
      )}
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
    </>
  );
}
