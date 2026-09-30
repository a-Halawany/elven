'use client';
/**
 * Scenario anatomy — CP-6 B27 part `anatomy` (0097 §A; F-P4-07). /prediction/scenarios/anatomy?scenario=<id>
 *
 * WHAT A SCENARIO IS MADE OF. Its drivers (exogenous or endogenous), actors (their agency), mechanisms (cause → effect), interventions
 * (who acts, on which driver or mechanism) and impacts (on which entity or objective, how hard, by when) — of the whole scenario and of
 * each branch, each with its version; the intervention → mechanism → impact map as the server composed it; the ASSUMPTION REGISTER, each
 * link critical or not, with the condition that invalidates it and the assumption's verification state as the Knowledge Graph records it;
 * the narrative, implication and option records.
 *
 * A SUSPENDED BRANCH IS NOT LIVE. When a critical assumption is invalidated the branch it names is suspended by the server in the same act,
 * and its owner is tasked. The banner states the cause, when and by whom, as recorded; the owner (or the scenario's owner) reinstates it
 * with a note, and the server refuses while a critical linked assumption is still invalidated — its refusal is shown as it states it.
 */
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useShell } from '../../layout';
import { prediction, type ScenarioRow } from '../../../../lib/prediction';
import type { Scope } from '../../../../lib/observation';
import {
  anatomy as api, ELEMENT_KINDS, ELEMENT_KIND_LABEL, RECORD_KINDS, attributesLine, branchStateMark, conditionLine, linkStanding, pathLine, reinstatementLine, suspensionBanner,
  type Anatomy, type AnatomyBranch, type AnatomyElement, type ElementKind, type InterventionPath, type RecordKind,
} from '../../../../lib/anatomy-b27';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant, textareaStyle } from '../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}

export default function AnatomyPage() {
  return <Suspense fallback={null}><AnatomyView /></Suspense>;
}

function AnatomyView() {
  const params = useSearchParams();
  const { scope, me, isForecastOwner, isStrategyOwner } = useShell();
  const scenarioId = params.get('scenario');
  const [scenarios, setScenarios] = useState<ScenarioRow[] | null>(null);
  const [data, setData] = useState<Anatomy | null>(null);
  const [at, setAt] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const canWrite = isForecastOwner || isStrategyOwner;

  const load = async () => {
    if (scenarioId === null) {
      const s = await prediction.listScenarios(scope);
      if (!s.ok || s.data === undefined) { setProblem(s.error?.message ?? 'the scenarios could not be read'); return; }
      setScenarios(s.data.scenarios); return;
    }
    const r = await api.read(scope, scenarioId);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the anatomy could not be read')); return; }
    setProblem(null); setData(r.data.anatomy); setAt(r.data.at);
  };
  useEffect(() => { void load(); }, [scope, scenarioId]);
  const done = async (message: string, rc: ReceiptT) => { setNotice(message); setReceipt(rc); await load(); };

  if (scenarioId === null) {
    return (
      <>
        <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Scenario anatomy</h1>
        {problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : scenarios === null ? <Empty>reading scenarios…</Empty>
          : scenarios.length === 0 ? <Empty>No scenario tree has been declared yet.</Empty> : (
            <ul aria-label="scenarios">{scenarios.map((s) => <li key={s.scenario_id}><Link href={`/prediction/scenarios/anatomy?scenario=${s.scenario_id}`}>{s.title}</Link></li>)}</ul>
          )}
      </>
    );
  }
  if (problem !== null && data === null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (data === null) return <Empty>reading the anatomy…</Empty>;
  const s = data.scenario;

  return (
    <>
      <p style={small}><Link href="/prediction/scenarios">← Scenarios</Link></p>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Anatomy: {s.title}</h1>
      <p>{s.statement}</p>
      <p style={{ ...muted, ...small }}>owner {s.owner_name ?? <Mono>{s.owner_principal_id.slice(0, 8)}…</Mono>} · state {s.state} · version <Mono>{String(s.current_version)}</Mono> · coherence {s.coherence_state} · as of {at === null ? '—' : fmtInstant(at)}</p>
      {problem !== null ? <LiveStatus assertive>{problem}</LiveStatus> : null}
      {notice !== null ? <LiveStatus>{notice}</LiveStatus> : null}

      <section aria-labelledby="whole" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="whole" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>The whole scenario</h2>
        <ElementsByKind label="the whole scenario" groups={data.scenario_wide.elements_by_kind} />
        <MapList label="the whole scenario" paths={data.scenario_wide.map} />
      </section>

      {data.branches.map((b) => (
        <BranchSection key={b.branch_id} b={b} scope={scope} scenarioOwner={s.owner_principal_id} me={me.principalId} canWrite={canWrite}
          onDone={done} onProblem={setProblem} />
      ))}

      <Register data={data} scope={scope} canWrite={canWrite} onDone={done} onProblem={setProblem} />
      <Records data={data} scope={scope} canWrite={canWrite} onDone={done} onProblem={setProblem} />
      {canWrite ? <DeclareElement data={data} scope={scope} onDone={done} onProblem={setProblem} /> : null}
      <Receipt receipt={receipt} />
      <UnknownNote>An element is versioned: a revision names the version it read and a retirement states why; nothing is deleted. The map
        follows each intervention to the drivers and mechanisms it acts on and the impacts resting on them, as the server composed it; an
        intervention that reaches no impact is named, not hidden.</UnknownNote>
      <UnknownNote>A branch whose CRITICAL assumption is invalidated is suspended in the same act as the invalidation, and its owner is tasked.
        A non-critical link is only noted. A suspended branch does not flip, is not simulated and is not decision-active until its owner (or
        the scenario's) reinstates it — which the server refuses while a critical linked assumption is still invalidated.</UnknownNote>
    </>
  );
}

function ElementsByKind({ label, groups }: { label: string; groups: Record<ElementKind, AnatomyElement[]> }) {
  const any = ELEMENT_KINDS.some((k) => groups[k].length > 0);
  if (!any) return <p style={muted}>No element is declared for {label}.</p>;
  return (
    <ScrollBox label={`elements of ${label}`}>
      <table className="eye-table" style={tableStyle}>
        <thead><tr><Th>Kind</Th><Th>Element</Th><Th>Attributes</Th><Th>Rests on</Th><Th>Version</Th></tr></thead>
        <tbody>
          {ELEMENT_KINDS.flatMap((k) => groups[k].map((e) => (
            <tr key={e.element_id}>
              <Td>{ELEMENT_KIND_LABEL[k]}</Td>
              <Td><strong>{e.name}</strong><div style={small}>{e.description}</div></Td>
              <Td>{attributesLine(e)}</Td>
              <Td>{e.graph_refs.length === 0 ? '—' : e.graph_refs.map((r) => r.label ?? `${r.kind} ${r.id.slice(0, 8)}…`).join('; ')}</Td>
              <Td>v{e.version} · {fmtInstant(e.updated_at)}</Td>
            </tr>
          )))}
        </tbody>
      </table>
    </ScrollBox>
  );
}

function MapList({ label, paths }: { label: string; paths: InterventionPath[] }) {
  if (paths.length === 0) return null;
  return (
    <div>
      <h3 style={h3}>Interventions → mechanisms → impacts ({label})</h3>
      <ul aria-label={`intervention map of ${label}`}>{paths.map((p) => <li key={p.intervention.element_id}>{pathLine(p)}</li>)}</ul>
    </div>
  );
}

function BranchSection({ b, scope, scenarioOwner, me, canWrite, onDone, onProblem }: {
  b: AnatomyBranch; scope: Scope; scenarioOwner: string; me: string; canWrite: boolean;
  onDone: (m: string, r: ReceiptT) => Promise<void>; onProblem: (p: string | null) => void;
}) {
  const mark = branchStateMark(b.state);
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const mayReinstate = me === b.owner_principal_id || me === scenarioOwner;
  const idp = `brn-${b.branch_id}`; // the FULL id: uuidv7 branches minted in one declaration share their first 8 characters (the B27 browser gate found the duplicate ids)
  return (
    <section aria-labelledby={idp} style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
      <h2 id={idp} style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Branch: {b.name}</h2>
      <p style={small}><Mono>{b.kind}</Mono>{b.kind_label ? ` “${b.kind_label}”` : ''} · <span style={{ color: `var(${mark.token})`, fontWeight: 650 }}><span aria-hidden="true">{mark.glyph}</span> {mark.text}</span>
        {' · '}owner {b.owner_name ?? `${b.owner_principal_id.slice(0, 8)}…`} · {b.decision_active ? 'decision-active' : 'NOT decision-active'}</p>
      <p>{b.statement}</p>
      {b.suspension !== null && b.suspension.current ? (
        <div role="alert" aria-label={`suspension of ${b.name}`} style={{ border: '1px solid var(--eye-color-warning)', borderRadius: 'var(--eye-radius-md)', padding: 'var(--eye-space-12)' }}>
          <strong>⏸ This branch is suspended.</strong> {suspensionBanner(b.suspension)}
          {b.open_items.length > 0 ? <div style={small}>The owner is tasked: {b.open_items.map((i) => `${i.state} item due ${i.due_at === null ? '—' : fmtInstant(i.due_at)}`).join('; ')}.</div> : null}
          {mayReinstate ? (
            <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
              <Field id={`${idp}-note`} label="Reinstatement note (why the branch holds again; 16+ characters)">{(id) =>
                <textarea id={id} value={note} onChange={(e) => setNote(e.target.value)} style={textareaStyle} />}</Field>
              <GovernedButton label={`Reinstate "${b.name}"`} pendingLabel="reinstating" disabled={note.trim().length < 16} onRun={async () => {
                const r = await api.reinstate(scope, b.branch_id, note.trim());
                if (!r.ok || r.data === undefined) { onProblem(refusal(r, 'the reinstatement was refused')); throw new Error('refused'); }
                onProblem(null); setNote('');
                await onDone(`"${b.name}" reinstated to ${String(r.data.reinstatement['state'])}`, r.data.receipt);
              }} />
            </div>
          ) : <p style={muted}>The branch's owner or the scenario's owner reinstates it.</p>}
        </div>
      ) : null}
      {b.suspension !== null && !b.suspension.current && reinstatementLine(b.suspension) !== null ? <p style={small}>{reinstatementLine(b.suspension)}</p> : null}
      <ElementsByKind label={b.name} groups={b.elements_by_kind} />
      <MapList label={b.name} paths={b.map} />
      {canWrite && b.live ? (
        <details>
          <summary>Suspend this branch (a person's act, with a reason)</summary>
          <Field id={`${idp}-reason`} label="Reason (16+ characters)">{(id) => <textarea id={id} value={reason} onChange={(e) => setReason(e.target.value)} style={textareaStyle} />}</Field>
          <GovernedButton label={`Suspend "${b.name}"`} pendingLabel="suspending" variant="critical" disabled={reason.trim().length < 16} onRun={async () => {
            const r = await api.suspend(scope, b.branch_id, reason.trim());
            if (!r.ok || r.data === undefined) { onProblem(refusal(r, 'the suspension was refused')); throw new Error('refused'); }
            onProblem(null); setReason('');
            await onDone(`"${b.name}" suspended; its owner is tasked`, r.data.receipt);
          }} />
        </details>
      ) : null}
    </section>
  );
}

function Register({ data, scope, canWrite, onDone, onProblem }: { data: Anatomy; scope: Scope; canWrite: boolean; onDone: (m: string, r: ReceiptT) => Promise<void>; onProblem: (p: string | null) => void }) {
  const branchName = (id: string | null) => (id === null ? 'the whole scenario' : data.branches.find((b) => b.branch_id === id)?.name ?? `${id.slice(0, 8)}…`);
  const [asu, setAsu] = useState(''); const [branch, setBranch] = useState(''); const [critical, setCritical] = useState(true);
  const [kind, setKind] = useState<'state' | 'claim' | 'indicator'>('state'); const [ref, setRef] = useState(''); const [text, setText] = useState(''); const [rationale, setRationale] = useState('');
  const [unlinkReason, setUnlinkReason] = useState('');
  return (
    <section aria-labelledby="register" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
      <h2 id="register" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Assumption register</h2>
      {data.assumptions.length === 0 ? <p style={muted}>No assumption of the Knowledge Graph is linked yet.</p> : (
        <ScrollBox label="assumption register">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Assumption</Th><Th>Branch</Th><Th>Standing</Th><Th>Invalidation condition</Th><Th>Rationale</Th><Th>Version</Th>{canWrite ? <Th>Unlink</Th> : null}</tr></thead>
            <tbody>
              {data.assumptions.map((l) => (
                <tr key={l.link_id}>
                  <Td><strong>{l.assumption?.title ?? l.assumption_id}</strong>{l.assumption?.verification_reason ? <div style={small}>{l.assumption.verification_reason}</div> : null}</Td>
                  <Td>{branchName(l.branch_id)}</Td>
                  <Td><span style={{ fontWeight: l.critical ? 650 : 400, color: l.invalidated ? 'var(--eye-color-critical)' : undefined }}>{linkStanding(l)}</span></Td>
                  <Td>{conditionLine(l.invalidation_condition)}</Td>
                  <Td>{l.rationale}{l.state === 'unlinked' ? <div style={small}>unlinked {l.unlinked_at === null ? '' : fmtInstant(l.unlinked_at)}: {l.unlink_reason}</div> : null}</Td>
                  <Td>v{l.version}</Td>
                  {canWrite ? <Td>{l.state === 'linked' ? (
                    <GovernedButton label={`Unlink "${l.assumption?.title ?? 'assumption'}"`} pendingLabel="unlinking" variant="quiet" disabled={unlinkReason.trim().length < 16} onRun={async () => {
                      const r = await api.unlink(scope, data.scenario.scenario_id, l.link_id, unlinkReason.trim());
                      if (!r.ok || r.data === undefined) { onProblem(refusal(r, 'the unlink was refused')); throw new Error('refused'); }
                      onProblem(null); setUnlinkReason('');
                      await onDone('the assumption was unlinked', r.data.receipt);
                    }} />) : '—'}</Td> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
      )}
      {canWrite ? (
        <>
          <Field id="unlink-reason" label="Unlink reason (16+ characters; used by the unlink buttons)">{(id) => <input id={id} value={unlinkReason} onChange={(e) => setUnlinkReason(e.target.value)} style={inputStyle} />}</Field>
          <details>
            <summary>Link an assumption of the Knowledge Graph</summary>
            <div style={rowStyle}>
              <Field id="link-asu" label="Assumption (ASU id)">{(id) => <input id={id} value={asu} onChange={(e) => setAsu(e.target.value)} style={inputStyle} />}</Field>
              <Field id="link-branch" label="Branch">{(id) => (
                <select id={id} value={branch} onChange={(e) => setBranch(e.target.value)} style={inputStyle}>
                  <option value="">the whole scenario</option>
                  {data.branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.name}</option>)}
                </select>)}</Field>
              <label><input type="checkbox" checked={critical} onChange={(e) => setCritical(e.target.checked)} /> critical (its invalidation suspends the branch)</label>
              <Field id="link-kind" label="Invalidated when">{(id) => (
                <select id={id} value={kind} onChange={(e) => setKind(e.target.value as 'state' | 'claim' | 'indicator')} style={inputStyle}>
                  <option value="state">the assumption is invalidated</option><option value="claim">a claim is disputed or withdrawn</option><option value="indicator">an indicator is breached</option>
                </select>)}</Field>
              {kind === 'state' ? null : <Field id="link-ref" label={kind === 'claim' ? 'Claim id' : 'Indicator id'}>{(id) => <input id={id} value={ref} onChange={(e) => setRef(e.target.value)} style={inputStyle} />}</Field>}
              <Field id="link-text" label="Condition in words (8+ characters)">{(id) => <input id={id} value={text} onChange={(e) => setText(e.target.value)} style={inputStyle} />}</Field>
              <Field id="link-rationale" label="Why the scenario rests on it (8+ characters)">{(id) => <input id={id} value={rationale} onChange={(e) => setRationale(e.target.value)} style={inputStyle} />}</Field>
            </div>
            <GovernedButton label="Link the assumption" pendingLabel="linking" disabled={asu.trim() === '' || text.trim().length < 8 || rationale.trim().length < 8} onRun={async () => {
              const condition = { kind, text: text.trim(), ...(kind === 'claim' ? { claimId: ref.trim() } : kind === 'indicator' ? { indicatorId: ref.trim() } : {}) };
              const r = await api.link(scope, data.scenario.scenario_id, { assumptionId: asu.trim(), branchId: branch === '' ? null : branch, critical, condition, rationale: rationale.trim() });
              if (!r.ok || r.data === undefined) { onProblem(refusal(r, 'the link was refused')); throw new Error('refused'); }
              onProblem(null); setAsu(''); setText(''); setRationale('');
              await onDone(`the assumption was linked (version ${r.data.link.version})`, r.data.receipt);
            }} />
          </details>
        </>
      ) : null}
    </section>
  );
}

function Records({ data, scope, canWrite, onDone, onProblem }: { data: Anatomy; scope: Scope; canWrite: boolean; onDone: (m: string, r: ReceiptT) => Promise<void>; onProblem: (p: string | null) => void }) {
  const [kind, setKind] = useState<RecordKind>('narrative'); const [branch, setBranch] = useState(''); const [title, setTitle] = useState(''); const [body, setBody] = useState('');
  const latest = data.records.filter((r) => r.latest);
  return (
    <section aria-labelledby="records" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
      <h2 id="records" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Narrative, implications and options</h2>
      {latest.length === 0 ? <p style={muted}>No record yet.</p> : (
        <dl>{latest.map((r) => (
          <DefinitionRow key={r.record_id} term={`${r.kind} · ${r.title}`}>
            {r.body}
            <div style={small}>by {r.author_name ?? `${r.author_principal_id.slice(0, 8)}…`} · {fmtInstant(r.recorded_at)} · version {r.version}
              {r.branch_id === null ? ' · the whole scenario' : ` · ${data.branches.find((b) => b.branch_id === r.branch_id)?.name ?? 'a branch'}`}
              {r.cites.length > 0 ? ` · cites ${r.cites.map((c) => `${c.kind} ${c.id.slice(0, 8)}…`).join(', ')}` : ''}</div>
          </DefinitionRow>))}</dl>
      )}
      {canWrite ? (
        <details>
          <summary>Add a record</summary>
          <div style={rowStyle}>
            <Field id="rec-kind" label="Kind">{(id) => (
              <select id={id} value={kind} onChange={(e) => setKind(e.target.value as RecordKind)} style={inputStyle}>
                {RECORD_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
              </select>)}</Field>
            <Field id="rec-branch" label="Branch">{(id) => (
              <select id={id} value={branch} onChange={(e) => setBranch(e.target.value)} style={inputStyle}>
                <option value="">the whole scenario</option>
                {data.branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.name}</option>)}
              </select>)}</Field>
            <Field id="rec-title" label="Title">{(id) => <input id={id} value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />}</Field>
          </div>
          <Field id="rec-body" label="Body (8+ characters)">{(id) => <textarea id={id} value={body} onChange={(e) => setBody(e.target.value)} style={textareaStyle} />}</Field>
          <GovernedButton label="Add the record" pendingLabel="adding" disabled={title.trim().length < 2 || body.trim().length < 8} onRun={async () => {
            const r = await api.addRecord(scope, data.scenario.scenario_id, { kind, title: title.trim(), body: body.trim(), branchId: branch === '' ? null : branch });
            if (!r.ok || r.data === undefined) { onProblem(refusal(r, 'the record was refused')); throw new Error('refused'); }
            onProblem(null); setTitle(''); setBody('');
            await onDone(`the ${kind} record was added`, r.data.receipt);
          }} />
        </details>
      ) : null}
    </section>
  );
}

function DeclareElement({ data, scope, onDone, onProblem }: { data: Anatomy; scope: Scope; onDone: (m: string, r: ReceiptT) => Promise<void>; onProblem: (p: string | null) => void }) {
  const [kind, setKind] = useState<ElementKind>('driver'); const [branch, setBranch] = useState(''); const [name, setName] = useState(''); const [description, setDescription] = useState('');
  const [exogenous, setExogenous] = useState(true); const [agency, setAgency] = useState('medium'); const [cause, setCause] = useState(''); const [effect, setEffect] = useState('');
  const [by, setBy] = useState(''); const [expected, setExpected] = useState(''); const [picked, setPicked] = useState<string[]>([]);
  const [onKind, setOnKind] = useState('entity'); const [onId, setOnId] = useState(''); const [direction, setDirection] = useState('adverse'); const [magnitude, setMagnitude] = useState('moderate'); const [horizon, setHorizon] = useState('30d');
  const visible = data.elements.filter((e) => e.state === 'active' && (e.branch_id === null || e.branch_id === (branch === '' ? null : branch)));
  const attributes = (): Record<string, unknown> => {
    const deps = picked.filter((id) => visible.some((e) => e.element_id === id));
    switch (kind) {
      case 'driver': return { exogenous, ...(deps.length ? { dependencies: deps } : {}) };
      case 'actor': return { agency, ...(deps.length ? { dependencies: deps } : {}) };
      case 'mechanism': return { cause, effect, ...(deps.length ? { dependencies: deps } : {}) };
      case 'intervention': return { by, expected_effect: expected, targets: deps.filter((id) => ['driver', 'mechanism'].includes(visible.find((e) => e.element_id === id)?.kind ?? '')) };
      case 'impact': return { on: { kind: onKind, id: onId.trim() }, direction, magnitude, horizon, ...(deps.length ? { dependencies: deps } : {}) };
    }
  };
  return (
    <section aria-labelledby="declare" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
      <h2 id="declare" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Declare an element</h2>
      <div style={rowStyle}>
        <Field id="el-kind" label="Kind">{(id) => (
          <select id={id} value={kind} onChange={(e) => setKind(e.target.value as ElementKind)} style={inputStyle}>{ELEMENT_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>)}</Field>
        <Field id="el-branch" label="Of">{(id) => (
          <select id={id} value={branch} onChange={(e) => setBranch(e.target.value)} style={inputStyle}>
            <option value="">the whole scenario</option>{data.branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.name}</option>)}
          </select>)}</Field>
        <Field id="el-name" label="Name">{(id) => <input id={id} value={name} onChange={(e) => setName(e.target.value)} style={inputStyle} />}</Field>
        <Field id="el-desc" label="Description (8+ characters)">{(id) => <input id={id} value={description} onChange={(e) => setDescription(e.target.value)} style={inputStyle} />}</Field>
        {kind === 'driver' ? <label><input type="checkbox" checked={exogenous} onChange={(e) => setExogenous(e.target.checked)} /> exogenous (a shock from outside the system)</label> : null}
        {kind === 'actor' ? <Field id="el-agency" label="Agency">{(id) => <select id={id} value={agency} onChange={(e) => setAgency(e.target.value)} style={inputStyle}>{['high', 'medium', 'low'].map((a) => <option key={a} value={a}>{a}</option>)}</select>}</Field> : null}
        {kind === 'mechanism' ? <>
          <Field id="el-cause" label="Cause">{(id) => <input id={id} value={cause} onChange={(e) => setCause(e.target.value)} style={inputStyle} />}</Field>
          <Field id="el-effect" label="Effect">{(id) => <input id={id} value={effect} onChange={(e) => setEffect(e.target.value)} style={inputStyle} />}</Field></> : null}
        {kind === 'intervention' ? <>
          <Field id="el-by" label="Who acts">{(id) => <input id={id} value={by} onChange={(e) => setBy(e.target.value)} style={inputStyle} />}</Field>
          <Field id="el-expected" label="Expected effect">{(id) => <input id={id} value={expected} onChange={(e) => setExpected(e.target.value)} style={inputStyle} />}</Field></> : null}
        {kind === 'impact' ? <>
          <Field id="el-on-kind" label="Falls on">{(id) => <select id={id} value={onKind} onChange={(e) => setOnKind(e.target.value)} style={inputStyle}><option value="entity">an entity</option><option value="strategy">an objective (strategy object)</option></select>}</Field>
          <Field id="el-on-id" label="Its id">{(id) => <input id={id} value={onId} onChange={(e) => setOnId(e.target.value)} style={inputStyle} />}</Field>
          <Field id="el-direction" label="Direction">{(id) => <select id={id} value={direction} onChange={(e) => setDirection(e.target.value)} style={inputStyle}>{['adverse', 'favourable', 'mixed'].map((a) => <option key={a} value={a}>{a}</option>)}</select>}</Field>
          <Field id="el-magnitude" label="Magnitude">{(id) => <select id={id} value={magnitude} onChange={(e) => setMagnitude(e.target.value)} style={inputStyle}>{['low', 'moderate', 'high', 'severe'].map((a) => <option key={a} value={a}>{a}</option>)}</select>}</Field>
          <Field id="el-horizon" label="Horizon">{(id) => <input id={id} value={horizon} onChange={(e) => setHorizon(e.target.value)} style={inputStyle} />}</Field></> : null}
      </div>
      {visible.length === 0 ? null : (
        <fieldset>
          <legend>{kind === 'intervention' ? 'Acts on (drivers and mechanisms)' : 'Rests on (other elements)'}</legend>
          {visible.filter((e) => kind !== 'intervention' || e.kind === 'driver' || e.kind === 'mechanism').map((e) => (
            <label key={e.element_id} style={{ display: 'block' }}><input type="checkbox" checked={picked.includes(e.element_id)}
              onChange={(ev) => setPicked(ev.target.checked ? [...picked, e.element_id] : picked.filter((x) => x !== e.element_id))} /> {e.kind} “{e.name}”</label>
          ))}
        </fieldset>
      )}
      <GovernedButton label="Declare the element" pendingLabel="declaring" disabled={name.trim().length < 2 || description.trim().length < 8} onRun={async () => {
        const r = await api.declareElement(scope, data.scenario.scenario_id, { kind, name: name.trim(), description: description.trim(), branchId: branch === '' ? null : branch, attributes: attributes() });
        if (!r.ok || r.data === undefined) { onProblem(refusal(r, 'the element was refused')); throw new Error('refused'); }
        onProblem(null); setName(''); setDescription(''); setPicked([]);
        await onDone(`the ${kind} "${r.data.element.name}" was declared (version ${r.data.element.version})`, r.data.receipt);
      }} />
    </section>
  );
}
