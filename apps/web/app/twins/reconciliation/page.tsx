'use client';
/**
 * Reconciliation — CP-6 B30 part `estimation` (0103 §ES; F-P5-02: twin state estimation and continuous reconciliation).
 *
 * A twin's estimated keys: the head's value, the DECLARED ESTIMATORS (the primary and its challengers), the PENDING proposal checks (new
 * telemetry, an upstream twin's change, an ontology revision — queued after the attention tick), the ESTIMATES — candidate state, never the
 * active snapshot: every estimator's candidate kept (the disagreement stated), the input QUALIFICATION (source health, cadence, unit, truth
 * state), the CONSTRAINT CHECK before publish, the range and the MATERIALITY — and the twin owner's decision: an APPROVAL opens a new
 * snapshot, a decline states its reason. The Reconciliation Agent proposes; it never approves. Requests for new observations of missing or
 * stale inputs are listed with how they travel (the collection scheduler, or the steward's queue). Everything is read from the server and
 * worded here; nothing is estimated on the client. Every figure is SYNTHETIC.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useShell } from '../layout';
import { twins as twinsApi, type Twin } from '../../../lib/twins';
import {
  estimation, estimateMark, proposalLine, candidateLine, spreadLine, qualificationLine, constraintLine, materialityLine, requestLine, eventLine,
  type Estimate, type Overview,
} from '../../../lib/estimation-b30';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const short = (id: string | null | undefined) => (id ? `${id.slice(0, 8)}…${id.slice(-6)}` : '—');
const val = (v: unknown): string => (v === null || v === undefined ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v));

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}
const txt = (id: string, value: string, onChange: (v: string) => void, type = 'text') => (
  <input id={id} type={type} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)} />
);

function EstimateMark({ state }: { state: string }) {
  const m = estimateMark(state);
  return <span aria-label="estimate state" style={{ color: `var(${m.token})`, fontWeight: 650 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}

/** DECLARE an estimator (the twin's owner): a method over inputs for one key; a re-declaration of the same name is its next version. */
function DeclarePanel({ scope, twinId, onDone }: { scope: { tenantId: string; domainId: string }; twinId: string; onDone: () => Promise<void> }) {
  const [key, setKey] = useState('corridor.capacity_share');
  const [name, setName] = useState('portwatch-ratio');
  const [role, setRole] = useState<'primary' | 'challenger'>('primary');
  const [method, setMethod] = useState('ratio_to_baseline');
  const [parameters, setParameters] = useState('{"baseline": 72, "scale": 100}');
  const [inputs, setInputs] = useState('[{"kind":"series","series_key":"portwatch:chokepoint4:n_total","unit":"transits/day","cadence_days":1}]');
  const [unit, setUnit] = useState('%');
  const [bounds, setBounds] = useState('{"min": 0, "max": 100}');
  const [materiality, setMateriality] = useState('0.05');
  const [ambiguity, setAmbiguity] = useState('0.1');
  const [sets, setSets] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  return (
    <section aria-labelledby="declare-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
      <h2 id="declare-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Declare an estimator</h2>
      <p style={{ ...small, ...muted }}>The twin owner declares; one primary per key, any number of challengers. The first input is the measured series.</p>
      <div style={grid}>
        <Field id="de-key" label="Element key">{(id) => txt(id, key, setKey)}</Field>
        <Field id="de-name" label="Estimator name">{(id) => txt(id, name, setName)}</Field>
        <Field id="de-role" label="Role">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={role} onChange={(e) => setRole(e.target.value as 'primary' | 'challenger')}><option value="primary">primary</option><option value="challenger">challenger</option></select>}</Field>
        <Field id="de-method" label="Method">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={method} onChange={(e) => setMethod(e.target.value)}>{['last_observation', 'moving_average', 'ratio_to_baseline', 'kalman_1d'].map((m) => <option key={m} value={m}>{m}</option>)}</select>}</Field>
        <Field id="de-unit" label="Unit of the estimate">{(id) => txt(id, unit, setUnit)}</Field>
        <Field id="de-materiality" label="Materiality (relative)">{(id) => txt(id, materiality, setMateriality, 'number')}</Field>
        <Field id="de-ambiguity" label="Ambiguity (relative spread)">{(id) => txt(id, ambiguity, setAmbiguity, 'number')}</Field>
        <Field id="de-sets" label="Constraint sets (comma-separated keys; empty: every live set)">{(id) => txt(id, sets, setSets)}</Field>
      </div>
      <Field id="de-parameters" label="Parameters (JSON)">{(id) => <textarea id={id} style={textareaStyle} value={parameters} onChange={(e) => setParameters(e.target.value)} />}</Field>
      <Field id="de-inputs" label="Inputs (JSON list)">{(id) => <textarea id={id} style={textareaStyle} value={inputs} onChange={(e) => setInputs(e.target.value)} />}</Field>
      <Field id="de-bounds" label="Bounds (JSON)">{(id) => <textarea id={id} style={textareaStyle} value={bounds} onChange={(e) => setBounds(e.target.value)} />}</Field>
      <Field id="de-note" label="Why (8+ characters)">{(id) => <textarea id={id} style={textareaStyle} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
      <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
        <GovernedButton label="Declare the estimator" pendingLabel="declaring" disabled={note.trim().length < 8} onRun={async () => {
          setProblem(null);
          let pa: unknown; let ip: unknown; let bo: unknown;
          try { pa = JSON.parse(parameters); ip = JSON.parse(inputs); bo = JSON.parse(bounds); } catch { const m = 'parameters, inputs and bounds are JSON'; setProblem(m); throw new Error(m); }
          const r = await estimation.declareEstimator(scope, { twinId, key: key.trim(), name: name.trim(), role, method, parameters: pa, inputs: ip, unit: unit.trim(), bounds: bo,
            materiality: Number(materiality), ambiguity: Number(ambiguity), constraintSets: sets.split(',').map((x) => x.trim()).filter((x) => x !== ''), note: note.trim() });
          if (!r.ok || r.data === undefined) { const m = refusal(r, 'the estimator was not declared'); setProblem(m); throw new Error(m); }
          setReceipt(r.data.receipt); setNote('');
          await onDone();
        }} />
      </div>
      {problem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not declared — {problem}</span></LiveStatus>}
      <Receipt receipt={receipt} />
    </section>
  );
}

export default function ReconciliationPage() {
  const { scope, me, isTwinOwner } = useShell();
  const roles = useMemo(() => new Set(me.bindings.filter((b) => b.domainId === scope.domainId || b.scope !== 'DOMAIN').map((b) => b.roleCode)), [me, scope.domainId]);
  const canPropose = ['twin_owner', 'domain_analyst', 'simulation_operator'].some((r) => roles.has(r));
  const [twins, setTwins] = useState<Twin[]>([]);
  const [twinId, setTwinId] = useState('');
  const [ov, setOv] = useState<Overview | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<Estimate | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [note, setNote] = useState('');
  const [reqSeries, setReqSeries] = useState('');
  const [reqReason, setReqReason] = useState<'missing' | 'stale' | 'disqualified'>('stale');
  const [reqNote, setReqNote] = useState('');

  useEffect(() => { void twinsApi.list(scope).then((r) => { if (r.ok && r.data !== undefined) { setTwins(r.data.twins); if (r.data.twins[0] !== undefined) setTwinId((t) => t || (r.data?.twins[0]?.twin_id ?? '')); } }); }, [scope.tenantId, scope.domainId]);
  const load = async (pick?: string | null) => {
    if (twinId === '') return;
    const r = await estimation.overview(scope, twinId);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the twin could not be read')); return; }
    setOv(r.data.overview);
    const id = pick ?? selected ?? r.data.overview.estimates.find((e) => e.state === 'proposed')?.estimate_id ?? r.data.overview.estimates[0]?.estimate_id ?? null;
    setSelected(id);
    if (id !== null) await open(id); else setView(null);
  };
  const open = async (id: string) => {
    const r = await estimation.read(scope, id);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the estimate could not be read')); return; }
    setView(r.data.estimate); setProblem(null);
  };
  useEffect(() => { setSelected(null); setView(null); void load(null); }, [twinId]);

  const twin = twins.find((t) => t.twin_id === twinId);
  const isOwner = ov !== null && ov.twin.owner_principal_id === me.principalId;
  const keys = [...new Set((ov?.estimators ?? []).map((e) => e.key))];
  const v = view;
  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Reconciliation</h1>
      <UnknownNote><strong>Every number on this screen is SYNTHETIC</strong> — an estimate is CANDIDATE state: the twin’s active snapshot does not change until its owner approves the estimate into a new snapshot.</UnknownNote>
      <section aria-labelledby="twin-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="twin-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Twin</h2>
        <Field id="rc-twin" label="Twin">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={twinId} onChange={(e) => setTwinId(e.target.value)}>{twins.map((t) => <option key={t.twin_id} value={t.twin_id}>{t.title}</option>)}</select>}</Field>
        {ov === null ? null : (
          <>
            <DefinitionRow term="Head on actual">{ov.head === null ? 'no admitted version' : <span aria-label="head">v{ov.head.version} · observed through {ov.head.observed_through ?? '—'} · {ov.head.completeness}</span>}</DefinitionRow>
            <DefinitionRow term="Owner"><Mono>{short(ov.twin.owner_principal_id)}</Mono>{isOwner ? ' (you)' : ''}</DefinitionRow>
            {ov.head_elements.length === 0 ? null : (
              <ul aria-label="head values" style={small}>{ov.head_elements.map((e) => <li key={e.key}>{e.key} = {val(e.value)} {e.unit ?? ''} — {e.kind}, {e.health}</li>)}</ul>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="estimators-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="estimators-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Estimators</h2>
        {(ov?.estimators ?? []).length === 0 ? <Empty>No estimator is declared for this twin.</Empty> : (
          <ScrollBox label="estimators">
            <table aria-label="estimators" style={tableStyle}><thead><tr><Th>Key</Th><Th>Name</Th><Th>Role</Th><Th>Method</Th><Th>Unit</Th><Th>Version</Th></tr></thead>
              <tbody>{(ov?.estimators ?? []).map((e) => <tr key={`${e.estimator_id}-${e.version}`}><Td>{e.key}</Td><Td>{e.name}</Td><Td>{e.role}</Td><Td>{e.method}</Td><Td>{e.unit}</Td><Td>v{e.version}</Td></tr>)}</tbody></table>
          </ScrollBox>
        )}
        <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Pending proposal checks</h3>
        {(ov?.pending ?? []).length === 0 ? <Empty>Nothing pending: no new telemetry, upstream change or ontology revision since the last proposal.</Empty> : (
          <ul aria-label="pending checks" style={small}>{(ov?.pending ?? []).map((p) => <li key={p.key}>{p.key}: {p.triggers} trigger(s) — {p.kinds.join(', ')} since {fmtInstant(p.oldest)}</li>)}</ul>
        )}
        {canPropose && keys.length > 0 ? (
          <div style={{ ...grid, marginBlockStart: 'var(--eye-space-8)' }}>
            {keys.map((k) => <GovernedButton key={k} label={`Propose an estimate of ${k}`} pendingLabel="estimating" onRun={async () => {
              setProblem(null);
              const r = await estimation.propose(scope, twinId, k);
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'no estimate was proposed'); setProblem(m); throw new Error(m); }
              setReceipt(r.data.receipt); setLast(`proposed ${String(r.data.estimate['value'])} ${String(r.data.estimate['unit'])}`);
              await load(String(r.data.estimate['estimate_id']));
            }} />)}
          </div>
        ) : null}
      </section>

      <section aria-labelledby="estimates-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="estimates-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Estimates</h2>
        {(ov?.estimates ?? []).length === 0 ? <Empty>No estimate has been proposed for this twin.</Empty> : (
          <ScrollBox label="estimates">
            <table aria-label="estimates" style={tableStyle}><thead><tr><Th>Estimate</Th><Th>Value</Th><Th>State</Th><Th>Proposed by</Th><Th>At</Th></tr></thead>
              <tbody>{(ov?.estimates ?? []).map((e) => (
                <tr key={e.estimate_id} aria-selected={e.estimate_id === selected}>
                  <Td><button type="button" style={{ background: 'none', border: 'none', padding: 0, color: 'var(--eye-color-accent-strong)', cursor: 'pointer', textAlign: 'start' }} onClick={() => { setSelected(e.estimate_id); void open(e.estimate_id); }}>{e.key} · {short(e.estimate_id)}</button></Td>
                  <Td>{val(e.proposed_value)} {e.unit}</Td>
                  <Td>{e.state}</Td>
                  <Td>{e.proposer_kind === 'agent' ? 'Reconciliation Agent' : <Mono>{short(e.proposed_by)}</Mono>}</Td>
                  <Td>{fmtInstant(e.proposed_at)}</Td>
                </tr>))}</tbody></table>
          </ScrollBox>
        )}
      </section>

      {v === null ? null : (
        <section aria-labelledby="estimate-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="estimate-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Estimate {short(v.estimate_id)}</h2>
          <div><EstimateMark state={v.state} /></div>
          <DefinitionRow term="Proposal"><span aria-label="proposal">{proposalLine(v)}</span></DefinitionRow>
          <DefinitionRow term="Proposed by">{v.proposer_kind === 'agent' ? <>the Reconciliation Agent (run <Mono>{short(v.run_id)}</Mono>) — it proposes only</> : <Mono>{short(v.proposed_by)}</Mono>}</DefinitionRow>
          <DefinitionRow term="Constraint check before publish"><span aria-label="constraint check">{constraintLine(v.constraint_check, v.constraint_outcome)}</span></DefinitionRow>
          <DefinitionRow term="Range">{v.range_check.verdict === 'inside' ? 'inside' : 'OUTSIDE'} the declared bounds [{val(v.range_check.min)}, {val(v.range_check.max)}]</DefinitionRow>
          <DefinitionRow term="Materiality"><span aria-label="materiality">{materialityLine(v)}</span></DefinitionRow>
          <DefinitionRow term="Disagreement"><span aria-label="spread">{spreadLine(v.spread)}</span></DefinitionRow>
          {v.applied_version !== null ? <DefinitionRow term="Snapshot"><span aria-label="snapshot">published as v{v.applied_version}</span></DefinitionRow> : null}
          {v.decision_note ? <DefinitionRow term="Decision note">{v.decision_note}</DefinitionRow> : null}
          {v.attention_item ? <DefinitionRow term="Review item">{v.attention_item.signal_class} — {v.attention_item.state}</DefinitionRow> : null}
          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Candidates (every estimator, kept)</h3>
          <ul aria-label="candidates" style={small}>{v.candidates.map((c) => <li key={`${c.estimator_id}-${c.version}`}>{candidateLine(c)}</li>)}</ul>
          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Input qualification</h3>
          {(v.qualifications ?? []).length === 0 ? <Empty>No qualification recorded.</Empty> : (
            <ul aria-label="qualification" style={small}>{(v.qualifications ?? []).map((q, i) => <li key={q.qualification_id ?? i}>{qualificationLine(q)}</li>)}</ul>
          )}
          <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Ledger</h3>
          <ul aria-label="ledger" style={small}>{(v.events ?? []).map((e) => <li key={e.event_id}>{fmtInstant(e.occurred_at)} — {eventLine(e)} · <Mono>{short(e.actor_principal_id)}</Mono></li>)}</ul>
          {v.state === 'proposed' && isTwinOwner && isOwner ? (
            <div style={{ ...grid, marginBlockStart: 'var(--eye-space-12)', alignItems: 'end' }}>
              <Field id="dc-note" label="Decision note (a decline, or an ambiguous approval: 8+ characters)">{(id) => txt(id, note, setNote)}</Field>
              <GovernedButton label="Approve into a new snapshot" pendingLabel="approving" onRun={async () => {
                setProblem(null);
                const r = await estimation.decide(scope, v.estimate_id, 'approved', note.trim() === '' ? null : note.trim());
                if (!r.ok || r.data === undefined) { const m = refusal(r, 'the approval was refused'); setProblem(m); throw new Error(m); }
                setReceipt(r.data.receipt); setLast(`approved — snapshot v${String(r.data.snapshot?.['version'] ?? '?')}`); setNote('');
                await load(v.estimate_id);
              }} />
              <GovernedButton label="Decline" pendingLabel="declining" variant="critical" disabled={note.trim().length < 8} onRun={async () => {
                setProblem(null);
                const r = await estimation.decide(scope, v.estimate_id, 'declined', note.trim());
                if (!r.ok || r.data === undefined) { const m = refusal(r, 'the decline was refused'); setProblem(m); throw new Error(m); }
                setReceipt(r.data.receipt); setLast('declined'); setNote('');
                await load(v.estimate_id);
              }} />
            </div>
          ) : null}
        </section>
      )}

      <section aria-labelledby="requests-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="requests-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Requests for new observations</h2>
        {(ov?.requests ?? []).length === 0 ? <Empty>No request for new observations.</Empty> : (
          <ul aria-label="observation requests" style={small}>{(ov?.requests ?? []).map((r) => <li key={r.request_id}>{requestLine(r)} · {fmtInstant(r.requested_at)}</li>)}</ul>
        )}
        {canPropose && twin !== undefined ? (
          <div style={{ ...grid, marginBlockStart: 'var(--eye-space-8)', alignItems: 'end' }}>
            <Field id="rq-series" label="Series key">{(id) => txt(id, reqSeries, setReqSeries)}</Field>
            <Field id="rq-reason" label="The input is">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={reqReason} onChange={(e) => setReqReason(e.target.value as 'missing' | 'stale' | 'disqualified')}><option value="missing">missing</option><option value="stale">stale</option><option value="disqualified">disqualified</option></select>}</Field>
            <Field id="rq-note" label="What is missing or stale (8+ characters)">{(id) => txt(id, reqNote, setReqNote)}</Field>
            <GovernedButton label="Request new observations" pendingLabel="requesting" disabled={reqSeries.trim() === '' || reqNote.trim().length < 8} onRun={async () => {
              setProblem(null);
              const r = await estimation.request(scope, { twinId, input: { kind: 'series', series_key: reqSeries.trim() }, reasonClass: reqReason, note: reqNote.trim() });
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'the request was refused'); setProblem(m); throw new Error(m); }
              setReceipt(r.data.receipt); setLast(r.data.request['standing'] === true ? 'a request for this input is already open' : 'new observations requested'); setReqNote('');
              await load(selected);
            }} />
          </div>
        ) : null}
      </section>

      {isTwinOwner && isOwner && twinId !== '' ? <DeclarePanel scope={scope} twinId={twinId} onDone={async () => { await load(selected); }} /> : null}
      {problem !== null ? <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>{problem}</span></LiveStatus> : null}
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
      <Receipt receipt={receipt} />
    </>
  );
}
