'use client';
/**
 * The twin state and branch explorer — CP-6 B30 part `branches` (0103 §BR; F-P5-03: WS-14, CAP-DS-07, FEX-14, AT-36).
 *
 * One twin at a time: the FRESHNESS BANNER (the served snapshot's age by the database's day against the owner's SLO — “5 days stale”), the
 * SERVED STATE (the head, or the last validated snapshot frozen with its warning and expiry), the BRANCH TREE (fork points, heads, drafts),
 * TIME TRAVEL (a branch's state at an instant, through the existing as-of route) with its DIFF against actual, the MERGES with the server's
 * diverging keys and the owner's resolutions (merging a branch back is refused until every key is reconciled), the CONFIDENCE ROLL-UP per
 * component and per kind, the per-element staleness and the dependency uncertainty, and the ledger. The owner's acts — open, reconcile,
 * complete or refuse a merge; restore a checkpoint; freeze or lift the served snapshot; set the freshness SLO — are offered when the record
 * admits them; the server decides each one. Everything is read from the server and worded here. Every figure is SYNTHETIC.
 *
 * B33 twin (0111 §TW1/§TW3; F-P5-03): a merge may target ANOTHER non-actual branch ("Merge into …"); the SCENARIO-ELEMENT FORM grounds a
 * scenario value into the owner's open draft of a non-actual branch, citing the branch's assumption, the scenario itself (the SCN object
 * with its branch), or both — the server judges each and its refusal is shown in its own words. A twin chosen while another was loading
 * never shows the earlier answer (the stale response is dropped). DATEs are sent and shown as the days they name.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useShell } from '../layout';
import { twins as twinsApi, type Twin } from '../../../lib/twins';
import {
  branches, branchEventLine, confidenceLine, dependencyLine, divergingLine, freshnessBanner, instantOfLocal, mergeStateMark, resolutionLine, servedLine,
  type Diverging, type Explorer, type Merge,
  /* B33 twin */ branchesB33, groundedScenarioLine, mergeTargets, scenarioElementPayload, type ScenarioElementForm, /* end B33 twin */
} from '../../../lib/branches-b30';
/* B33 twin */ import { prediction, type ScenarioRow } from '../../../lib/prediction'; /* end B33 twin */
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
type Answer = { ok: boolean; status: number; data?: { receipt: ReceiptT } & Record<string, unknown>; error?: { code: string; message: string } };
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const grid = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const short = (id: string | null | undefined) => (id ? `${id.slice(0, 8)}…${id.slice(-6)}` : '—');
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 } as const;
const section = { ...cardStyle, marginBlockStart: 'var(--eye-space-16)' } as const;

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}
const txt = (id: string, value: string, onChange: (v: string) => void, type = 'text') => (
  <input id={id} type={type} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)} />
);

function DiffTable({ keys, label }: { keys: Diverging[]; label: string }) {
  if (keys.length === 0) return <Empty>No key differs.</Empty>;
  const v = (s: Diverging['source']) => (s === null ? 'absent' : `${JSON.stringify(s.value)}${s.unit ? ` ${s.unit}` : ''} (${s.kind})`);
  return (
    <ScrollBox label={label}>
      <table aria-label={label} style={tableStyle}><thead><tr><Th>Key</Th><Th>This version</Th><Th>Actual</Th><Th>Change</Th></tr></thead>
        <tbody>{keys.map((k) => <tr key={k.key}><Td><Mono>{k.key}</Mono></Td><Td>{v(k.source)}</Td><Td>{v(k.target)}</Td><Td>{k.change}</Td></tr>)}</tbody></table>
    </ScrollBox>
  );
}

/** One merge: its state, the diverging keys with each key's resolution, and the owner's acts. */
function MergeCard({ scope, m, isOwner, act }: { scope: { tenantId: string; domainId: string }; m: Merge; isOwner: boolean; act: (what: string, run: () => Promise<Answer>) => Promise<void> }) {
  const mark = mergeStateMark(m);   // B33 twin: the record's target_branch words it
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [picks, setPicks] = useState<Record<string, string>>({});
  const [values, setValues] = useState<Record<string, string>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const live = ['open', 'reconciled'].includes(m.state);
  const byKey = new Map(m.resolutions.map((r) => [r.key, r]));
  /* B33 twin: the merge's target (actual for B30's merges — every word there unchanged) */
  const target = m.target_branch ?? 'actual';
  const intoActual = target === 'actual';
  /* end B33 twin */
  return (
    <article aria-label={intoActual ? `merge of ${m.source_branch}` : `merge of ${m.source_branch} into ${target}`} style={{ borderBlockStart: '1px solid var(--eye-color-border-subtle)', paddingBlockStart: 'var(--eye-space-8)', marginBlockStart: 'var(--eye-space-8)' }}>
      <div><strong>{m.source_branch} v{m.source_version} → {target} v{m.target_version}</strong>{!intoActual && m.base_version !== null ? <span style={{ ...small, ...muted }}> · common version v{m.base_version}</span> : null} <span style={{ ...small, ...muted }}>opened by <Mono>{short(m.opened_by)}</Mono> {fmtInstant(m.opened_at)}</span></div>
      <div aria-label="merge state" style={{ color: `var(${mark.token})`, fontWeight: 650 }}><span aria-hidden="true">{mark.glyph}</span> {mark.text}</div>
      <p style={small}>{m.reason}</p>
      <ul aria-label="diverging keys" style={small}>
        {m.diverging.map((d) => (
          <li key={d.key}>
            {divergingLine(d, target)} — <em>{resolutionLine(byKey.get(d.key))}</em>
            {live && isOwner ? (
              <div style={{ ...grid, marginBlockStart: 'var(--eye-space-4)', alignItems: 'end' }}>
                <Field id={`rs-${m.merge_id}-${d.key}`} label={`Resolve ${d.key}`}>{(id) => (
                  <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={picks[d.key] ?? ''} onChange={(e) => setPicks({ ...picks, [d.key]: e.target.value })}>
                    <option value="">choose</option><option value="keep_target">keep {target}&apos;s value</option>
                    <option value="take_branch" disabled={intoActual && d.source?.kind === 'scenario'}>take the branch&apos;s element{intoActual && d.source?.kind === 'scenario' ? ' (a scenario value never becomes actual)' : ''}</option>
                    <option value="reconciled">reconcile (state the value, cite evidence)</option>
                  </select>)}</Field>
                {picks[d.key] === 'reconciled' ? <>
                  <Field id={`rv-${m.merge_id}-${d.key}`} label={`Reconciled value of ${d.key} (assumed)`}>{(id) => txt(id, values[d.key] ?? '', (x) => setValues({ ...values, [d.key]: x }))}</Field>
                  <Field id={`re-${m.merge_id}-${d.key}`} label="Evidence id it rests on">{(id) => txt(id, evidence[d.key] ?? '', (x) => setEvidence({ ...evidence, [d.key]: x }))}</Field>
                </> : null}
                <GovernedButton label={`Record the resolution of ${d.key}`} pendingLabel="recording" variant="quiet" disabled={(picks[d.key] ?? '') === '' || note.trim().length < 8}
                  onRun={() => act(`the resolution of ${d.key}`, () => branches.resolve(scope, m.merge_id, {
                    key: d.key, resolution: picks[d.key] as string, note: note.trim(),
                    ...(picks[d.key] === 'reconciled' ? { kind: 'assumed', value: Number.isNaN(Number(values[d.key])) ? values[d.key] : Number(values[d.key]), unit: d.target?.unit ?? undefined,
                                                         citations: [{ kind: 'evidence', id: (evidence[d.key] ?? '').trim() }] } : {}),
                  }) as never)} />
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      {live && isOwner ? <Field id={`rn-${m.merge_id}`} label="Why (the resolution note, 8+ characters)">{(id) => txt(id, note, setNote)}</Field> : null}
      {m.state === 'merged' ? <DefinitionRow term="Merged">{target} v{m.merged_version} at {fmtInstant(m.merged_at)}</DefinitionRow> : null}
      {m.closed_at ? <DefinitionRow term="Closed">{m.state} by <Mono>{short(m.closed_by)}</Mono> — {m.close_reason}</DefinitionRow> : null}
      {['open', 'reconciled', 'completing'].includes(m.state) && isOwner ? (
        <div style={{ ...grid, marginBlockStart: 'var(--eye-space-8)', alignItems: 'end' }}>
          <GovernedButton label={intoActual ? 'Merge the branch back into actual' : `Merge the branch into ${target}`} pendingLabel="merging" onRun={() => act('the merge', () => branches.complete(scope, m.merge_id) as never)} />
          <Field id={`cr-${m.merge_id}`} label="Reason to refuse or withdraw (8+ characters)">{(id) => txt(id, reason, setReason)}</Field>
          <GovernedButton label="Refuse the merge" pendingLabel="refusing" variant="critical" disabled={reason.trim().length < 8} onRun={() => act('the refusal', () => branches.close(scope, m.merge_id, 'refused', reason.trim()) as never)} />
        </div>
      ) : null}
    </article>
  );
}

export default function TwinExplorerPage() {
  const { scope, me } = useShell();
  const [list, setList] = useState<Twin[]>([]);
  const [twinId, setTwinId] = useState('');
  const [x, setX] = useState<Explorer | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  // time travel
  const [ttBranch, setTtBranch] = useState('actual');
  const [ttAt, setTtAt] = useState('');
  const [tt, setTt] = useState<{ version: Record<string, unknown> | null; asOf: string; keys: Diverging[] | null } | null>(null);
  // the owner's forms
  const [mergeBranch, setMergeBranch] = useState('');
  const [mergeReason, setMergeReason] = useState('');
  const [rsBranch, setRsBranch] = useState('');
  const [rsFrom, setRsFrom] = useState('');
  const [rsReason, setRsReason] = useState('');
  const [fzWarning, setFzWarning] = useState('');
  const [fzUntil, setFzUntil] = useState('');
  const [liftReason, setLiftReason] = useState('');
  const [slo, setSlo] = useState('2');
  const [sloNote, setSloNote] = useState('');
  /* B33 twin: the merge target; the scenario-element form; the newest explorer request (a stale answer is dropped) */
  const [mergeTarget, setMergeTarget] = useState('actual');
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [seDraft, setSeDraft] = useState('');
  const emptyForm: ScenarioElementForm = { key: '', value: '', unit: '', scenarioId: '', scenarioBranchId: '', basis: 'scenario', assumptionId: '', validFrom: '', validTo: '', confidence: '' };
  const [se, setSe] = useState<ScenarioElementForm>(emptyForm);
  const [seDone, setSeDone] = useState<string | null>(null);
  const latest = useRef(0);
  /* end B33 twin */

  useEffect(() => { void twinsApi.list(scope).then((r) => {
    if (r.ok && r.data !== undefined) { setList(r.data.twins); if (twinId === '' && r.data.twins[0] !== undefined) setTwinId(r.data.twins[0].twin_id); }
    else setProblem(refusal(r, 'the twins could not be read'));
  }); }, [scope.tenantId, scope.domainId]);
  const load = async (id: string) => {
    if (id === '') return;
    const ticket = ++latest.current;   // B33 twin: the twin chosen LAST wins — an earlier, slower answer is dropped
    const r = await branches.explorer(scope, id);
    if (ticket !== latest.current) return;
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the explorer could not be read')); setX(null); return; }
    setX(r.data.explorer); setProblem(null);
  };
  /* B33 twin: the domain's scenarios (with their branches) for the scenario-element form — prediction.read */
  useEffect(() => { let alive = true; void prediction.listScenarios(scope).then((r) => { if (alive && r.ok && r.data !== undefined) setScenarios(r.data.scenarios.filter((s) => s.state === 'active')); });
    return () => { alive = false; }; }, [scope.tenantId, scope.domainId]);
  /* end B33 twin */
  useEffect(() => { setTt(null); setSeDone(null); setSeDraft(''); setMergeBranch(''); setMergeTarget('actual'); void load(twinId); }, [twinId, scope.tenantId, scope.domainId]);

  const isOwner = x !== null && (x.twin.owner_principal_id === me.principalId);
  const act = async (what: string, run: () => Promise<Answer>) => {
    setProblem(null);
    const r = await run();
    if (!r.ok || r.data === undefined) { const m = refusal(r, `${what} was not answered`); setProblem(m); throw new Error(m); }
    setReceipt(r.data.receipt); setLast(`${what}: recorded`);
    await load(twinId);
  };
  const banner = freshnessBanner(x?.head_freshness ?? (x?.served?.freshness ?? null));
  const branchesWithHead = useMemo(() => (x?.branches ?? []).filter((b) => b.branch_id !== 'actual' && b.head !== null), [x]);
  const standing = (x?.freezes ?? []).find((f) => f.lifted_at === null) ?? null;
  /* B33 twin */
  const openDrafts = useMemo(() => (x?.branches ?? []).filter((b) => b.branch_id !== 'actual' && b.draft !== null), [x]);
  const seScenario = scenarios.find((s) => s.scenario_id === se.scenarioId) ?? null;
  const sePayload = scenarioElementPayload(se);
  /* end B33 twin */

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Twin state and branch explorer</h1>
      <UnknownNote><strong>Every number on this screen is SYNTHETIC</strong> — a twin&apos;s admitted states, branch by branch; the server judges freshness by the database&apos;s day against the owner&apos;s SLO, computes the diverging keys and refuses a merge until it is reconciled.</UnknownNote>
      <div style={{ ...grid, marginBlockStart: 'var(--eye-space-12)' }}>
        <Field id="ex-twin" label="Twin">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={twinId} onChange={(e) => setTwinId(e.target.value)}>{list.map((t) => <option key={t.twin_id} value={t.twin_id}>{t.title}</option>)}</select>}</Field>
      </div>
      {list.length === 0 ? <Empty>No twin is declared in this domain.</Empty> : null}

      {x === null ? null : (<>
        {/* THE FRESHNESS BANNER */}
        <div role={banner.level === 'stale' ? 'alert' : 'status'} aria-label="freshness" style={{ ...section, borderInlineStart: `4px solid var(${banner.token})` }}>
          <strong style={{ color: `var(${banner.token})` }}><span aria-hidden="true">{banner.glyph}</span> {banner.text}</strong>
          {x.head_freshness ? (
            <p style={{ ...small, marginBlockEnd: 0 }}>
              {x.head_freshness.stale_elements} element(s) stale or expired · dependency: <span aria-label="dependency">{dependencyLine(x.head_freshness.dependency)}</span>
            </p>) : null}
        </div>

        <section aria-labelledby="sv-h" style={section}>
          <h2 id="sv-h" style={h2}>{x.twin.title}</h2>
          <DefinitionRow term="Served state"><span aria-label="served state">{servedLine(x.served)}</span></DefinitionRow>
          <DefinitionRow term="Owner"><Mono>{short(x.twin.owner_principal_id)}</Mono>{isOwner ? ' (you)' : ''} · model {x.twin.behaviour_model_ref}</DefinitionRow>
          <DefinitionRow term="Freshness SLO">{x.policy === null ? 'none set' : `${x.policy.max_age_days} day(s) for the head (v${x.policy.version})${Object.keys(x.policy.key_max_age).length === 0 ? '' : ` · per key: ${Object.entries(x.policy.key_max_age).map(([k, d]) => `${k} ${d}d`).join(', ')}`} — ${x.policy.note}`}</DefinitionRow>
          <DefinitionRow term="Read at">{fmtInstant(x.read_at)} (the database&apos;s instant)</DefinitionRow>
        </section>

        <section aria-labelledby="br-h" style={section}>
          <h2 id="br-h" style={h2}>Branches</h2>
          <ScrollBox label="branch tree">
            <table aria-label="branch tree" style={tableStyle}><thead><tr><Th>Branch</Th><Th>Forked from</Th><Th>Head</Th><Th>Open draft</Th><Th>Versions</Th></tr></thead>
              <tbody>{x.branches.map((b) => (
                <tr key={b.branch_id}><Td><strong>{b.branch_id}</strong></Td><Td>{b.forked_from === null ? '—' : `v${b.forked_from}`}</Td><Td>{b.head === null ? '—' : `v${b.head}`}</Td>
                  <Td>{b.draft === null ? '—' : `v${b.draft}`}</Td><Td>{b.versions.map((v) => `v${v}${b.withdrawn.includes(v) ? ' (withdrawn)' : ''}`).join(', ')}</Td></tr>))}</tbody></table>
          </ScrollBox>
          {(x.restores ?? []).length === 0 ? null : (
            <ul aria-label="checkpoint restores" style={small}>{x.restores.map((r) => <li key={r.event_id}>{fmtInstant(r.occurred_at)} — {branchEventLine({ event: 'checkpoint.restored', details: r.details })}</li>)}</ul>
          )}
        </section>

        {/* TIME TRAVEL */}
        <section aria-labelledby="tt-h" style={section}>
          <h2 id="tt-h" style={h2}>Time travel</h2>
          <div style={{ ...grid, alignItems: 'end' }}>
            <Field id="tt-branch" label="Branch">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={ttBranch} onChange={(e) => setTtBranch(e.target.value)}>{x.branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_id}</option>)}</select>}</Field>
            <Field id="tt-at" label="As of (your local time)">{(id) => txt(id, ttAt, setTtAt, 'datetime-local')}</Field>
            <GovernedButton label="Show the state as of then" pendingLabel="reading" variant="quiet" disabled={instantOfLocal(ttAt) === null} onRun={async () => {
              const at = instantOfLocal(ttAt) as string;
              const r = await branches.asOf(scope, twinId, ttBranch, at);
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'the state as of then could not be read'); setProblem(m); throw new Error(m); }
              const v = r.data.version;
              let keys: Diverging[] | null = null;
              if (v !== null) { const d = await branches.diff(scope, twinId, Number(v['version'])); keys = d.ok && d.data !== undefined ? d.data.diff.keys : null; }
              setTt({ version: v, asOf: r.data.asOf, keys });
            }} />
          </div>
          {tt === null ? null : tt.version === null ? <Empty>No admitted version on {ttBranch} at {fmtInstant(tt.asOf)}.</Empty> : (
            <div aria-label="state as of">
              <p>As of {fmtInstant(tt.asOf)}, {ttBranch} stood at <strong>v{String(tt.version['version'])}</strong> (admitted {fmtInstant(tt.version['admitted_at'])}; observed through {String(tt.version['observed_through'] ?? '—')}; {String(tt.version['verification_state'] ?? '')}).</p>
              <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Against actual&apos;s head</h3>
              <DiffTable keys={tt.keys ?? []} label="diff against actual" />
            </div>
          )}
        </section>

        {/* MERGES */}
        <section aria-labelledby="mg-h" style={section}>
          <h2 id="mg-h" style={h2}>Merges</h2>
          {x.merges.length === 0 ? <Empty>No merge has been opened.</Empty> : x.merges.map((m) => <MergeCard key={m.merge_id} scope={scope} m={m} isOwner={isOwner} act={act} />)}
          {branchesWithHead.length > 0 && me.bindings.some((b) => b.roleCode === 'twin_owner' || b.roleCode === 'platform_admin') ? (
            <div style={{ ...grid, marginBlockStart: 'var(--eye-space-12)', alignItems: 'end' }}>
              <Field id="mg-branch" label="Branch to merge back">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={mergeBranch} onChange={(e) => { setMergeBranch(e.target.value); setMergeTarget('actual'); }}><option value="">choose</option>{branchesWithHead.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_id}</option>)}</select>}</Field>
              {/* B33 twin: the target — actual, or another branch with an admitted head */}
              <Field id="mg-target" label="Merge into">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={mergeTarget} onChange={(e) => setMergeTarget(e.target.value)} disabled={mergeBranch === ''}>{mergeTargets(x.branches, mergeBranch).map((b) => <option key={b} value={b}>{b}</option>)}</select>}</Field>
              <Field id="mg-reason" label="Why merge it (8+ characters)">{(id) => txt(id, mergeReason, setMergeReason)}</Field>
              <GovernedButton label="Open the merge" pendingLabel="opening" disabled={mergeBranch === '' || mergeReason.trim().length < 8}
                onRun={() => act('the merge request', () => (mergeTarget === 'actual' ? branches.openMerge(scope, twinId, mergeBranch, mergeReason.trim()) : branchesB33.openMerge(scope, twinId, mergeBranch, mergeTarget, mergeReason.trim())) as never)} />
            </div>
          ) : null}
        </section>

        {/* B33 twin (0111 §TW3): THE SCENARIO-ELEMENT FORM — the owner, on an open draft of a non-actual branch */}
        {isOwner ? (
          <section aria-labelledby="se-h" style={section}>
            <h2 id="se-h" style={h2}>Scenario elements</h2>
            <p style={{ ...small, ...muted }}>A scenario element is a value of a SCENARIO branch — never observed, estimated or assumed state of the world; a merge never takes it into actual. It cites the scenario branch&apos;s assumption, the scenario itself (its SCN version and branch), or both; the server checks each.</p>
            {openDrafts.length === 0 ? <Empty>No open draft on a non-actual branch — open one (a version on the branch) to ground a scenario element.</Empty> : (<>
              <div style={{ ...grid, alignItems: 'end' }}>
                <Field id="se-draft" label="Open draft (non-actual branch)">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={seDraft} onChange={(e) => setSeDraft(e.target.value)}><option value="">choose</option>{openDrafts.map((b) => <option key={b.branch_id} value={String(b.draft)}>{b.branch_id} · draft v{b.draft}</option>)}</select>}</Field>
                <Field id="se-key" label="Element key">{(id) => txt(id, se.key, (v) => setSe({ ...se, key: v }))}</Field>
                <Field id="se-value" label="Scenario value">{(id) => txt(id, se.value, (v) => setSe({ ...se, value: v }))}</Field>
                <Field id="se-unit" label="Unit">{(id) => txt(id, se.unit, (v) => setSe({ ...se, unit: v }))}</Field>
                <Field id="se-scenario" label="Scenario">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={se.scenarioId} onChange={(e) => setSe({ ...se, scenarioId: e.target.value, scenarioBranchId: '' })}><option value="">choose</option>{scenarios.map((s) => <option key={s.scenario_id} value={s.scenario_id}>{s.title}{s.current_version === undefined ? '' : ` (v${s.current_version})`}</option>)}</select>}</Field>
                <Field id="se-scenario-branch" label="Scenario branch">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={se.scenarioBranchId} onChange={(e) => setSe({ ...se, scenarioBranchId: e.target.value })} disabled={seScenario === null}><option value="">choose</option>{(seScenario?.branches ?? []).map((b) => <option key={b.branch_id} value={b.branch_id}>{b.name} · {b.kind} · {b.state}</option>)}</select>}</Field>
                <Field id="se-basis" label="Basis">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={se.basis} onChange={(e) => setSe({ ...se, basis: e.target.value as ScenarioElementForm['basis'] })}><option value="scenario">the scenario itself (its SCN version and branch)</option><option value="assumption">the scenario branch&apos;s assumption</option><option value="both">both</option></select>}</Field>
                {se.basis === 'scenario' ? null : <Field id="se-assumption" label="Assumption id (an ASU linked to the scenario branch)">{(id) => txt(id, se.assumptionId, (v) => setSe({ ...se, assumptionId: v }))}</Field>}
                <Field id="se-from" label="Valid from (a day)">{(id) => txt(id, se.validFrom, (v) => setSe({ ...se, validFrom: v }), 'date')}</Field>
                <Field id="se-to" label="Valid to (a day)">{(id) => txt(id, se.validTo, (v) => setSe({ ...se, validTo: v }), 'date')}</Field>
                <Field id="se-confidence" label="Confidence (0 to 1, stated — optional)">{(id) => txt(id, se.confidence, (v) => setSe({ ...se, confidence: v }), 'number')}</Field>
                <GovernedButton label="Ground the scenario element" pendingLabel="grounding" disabled={seDraft === '' || !sePayload.ok}
                  onRun={async () => {
                    if (!sePayload.ok) return;
                    setSeDone(null);
                    await act('the scenario element', async () => {
                      const r = await branchesB33.groundScenario(scope, twinId, Number(seDraft), [sePayload.payload]);
                      if (r.ok && r.data !== undefined) setSeDone((r.data.grounded as Array<Record<string, unknown>>).map((g) => groundedScenarioLine(g as never)).join('; '));
                      return r as never;
                    });
                    setSe({ ...emptyForm, scenarioId: se.scenarioId, scenarioBranchId: se.scenarioBranchId, basis: se.basis, assumptionId: se.assumptionId });
                  }} />
              </div>
              {sePayload.ok ? null : <p style={{ ...small, ...muted }} aria-label="scenario element missing">Still needed: {sePayload.why}</p>}
              {seDone === null ? null : <p aria-label="scenario element grounded" style={small}>{seDone}</p>}
            </>)}
          </section>
        ) : null}
        {/* end B33 twin */}

        {/* CONFIDENCE AND STALENESS */}
        <section aria-labelledby="cf-h" style={section}>
          <h2 id="cf-h" style={h2}>Confidence and staleness of the head</h2>
          {x.head_confidence === null ? <Empty>No admitted head.</Empty> : (<>
            <p aria-label="overall confidence">Overall: {confidenceLine({ ...x.head_confidence.overall, coverage: x.head_confidence.overall.coverage ?? 0 })}</p>
            <ScrollBox label="confidence by component">
              <table aria-label="confidence by component" style={tableStyle}><thead><tr><Th>Component</Th><Th>Elements</Th><Th>Confidence (stated only)</Th><Th>Kinds</Th></tr></thead>
                <tbody>{x.head_confidence.components.map((c) => <tr key={c.component}><Td>{c.component}</Td><Td>{c.elements}</Td><Td>{confidenceLine(c)}</Td><Td>{(c.kinds ?? []).join(', ')}</Td></tr>)}</tbody></table>
            </ScrollBox>
            <p style={{ ...small, ...muted }}>{x.head_confidence.method}</p>
          </>)}
          {x.head_freshness === null ? null : (
            <details aria-label="element staleness"><summary>Element staleness ({x.head_freshness.elements.length} elements)</summary>
              <ul style={small}>{x.head_freshness.elements.map((e) => <li key={e.key}><Mono>{e.key}</Mono> — {e.state.toUpperCase()} · {e.age_days} day(s){e.max_age_days === null ? '' : ` (max ${e.max_age_days})`}{e.valid_to ? ` · valid to ${e.valid_to}` : ''}</li>)}</ul>
              <p style={{ ...small, ...muted }}>{x.head_freshness.method}</p>
            </details>
          )}
        </section>

        {/* THE OWNER'S ACTS */}
        {isOwner ? (
          <section aria-labelledby="ow-h" style={section}>
            <h2 id="ow-h" style={h2}>The owner&apos;s acts</h2>
            <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Freeze the last validated snapshot</h3>
            {standing ? (
              <div style={{ ...grid, alignItems: 'end' }}>
                <p>v{standing.version} frozen until {fmtInstant(standing.expires_at)} — {standing.warning}</p>
                <Field id="fz-lift" label="Why lift it (8+ characters)">{(id) => txt(id, liftReason, setLiftReason)}</Field>
                <GovernedButton label="Lift the freeze" pendingLabel="lifting" variant="quiet" disabled={liftReason.trim().length < 8} onRun={() => act('the lift', () => branches.lift(scope, standing.freeze_id, liftReason.trim()) as never)} />
              </div>
            ) : (
              <div style={{ ...grid, alignItems: 'end' }}>
                <Field id="fz-warning" label="Freshness warning shown with it (8+ characters)">{(id) => txt(id, fzWarning, setFzWarning)}</Field>
                <Field id="fz-until" label="Expires (your local time)">{(id) => txt(id, fzUntil, setFzUntil, 'datetime-local')}</Field>
                <GovernedButton label="Freeze the validated snapshot" pendingLabel="freezing" disabled={fzWarning.trim().length < 8 || instantOfLocal(fzUntil) === null}
                  onRun={() => act('the freeze', () => branches.freeze(scope, twinId, { warning: fzWarning.trim(), expiresAt: instantOfLocal(fzUntil) as string }) as never)} />
              </div>
            )}
            <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Restore a checkpoint</h3>
            <div style={{ ...grid, alignItems: 'end' }}>
              <Field id="rs-branch" label="Onto branch">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={rsBranch} onChange={(e) => setRsBranch(e.target.value)}><option value="">choose</option>{x.branches.map((b) => <option key={b.branch_id} value={b.branch_id}>{b.branch_id}</option>)}</select>}</Field>
              <Field id="rs-from" label="Earlier admitted version">{(id) => <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={rsFrom} onChange={(e) => setRsFrom(e.target.value)}><option value="">choose</option>{x.versions.filter((v) => v.state === 'admitted').map((v) => <option key={v.version} value={v.version}>v{v.version} · {v.branch_id}</option>)}</select>}</Field>
              <Field id="rs-reason" label="Why restore it (8+ characters)">{(id) => txt(id, rsReason, setRsReason)}</Field>
              <GovernedButton label="Restore the checkpoint" pendingLabel="restoring" variant="quiet" disabled={rsBranch === '' || rsFrom === '' || rsReason.trim().length < 8}
                onRun={() => act('the restore', () => branches.restore(scope, twinId, rsBranch, Number(rsFrom), rsReason.trim()) as never)} />
            </div>
            <h3 style={{ fontSize: 'var(--eye-type-heading-3)' }}>Freshness SLO</h3>
            <div style={{ ...grid, alignItems: 'end' }}>
              <Field id="slo-days" label="Maximum age of the head (days)">{(id) => txt(id, slo, setSlo, 'number')}</Field>
              <Field id="slo-note" label="Why (8+ characters)">{(id) => <textarea id={id} style={textareaStyle} value={sloNote} onChange={(e) => setSloNote(e.target.value)} />}</Field>
              <GovernedButton label="Set the freshness SLO" pendingLabel="setting" variant="quiet" disabled={sloNote.trim().length < 8 || !/^\d+$/.test(slo)}
                onRun={() => act('the freshness SLO', () => branches.setPolicy(scope, twinId, { maxAgeDays: Number(slo), note: sloNote.trim() }) as never)} />
            </div>
          </section>
        ) : null}

        <section aria-labelledby="lg-h" style={section}>
          <h2 id="lg-h" style={h2}>Ledger</h2>
          {x.events.length === 0 ? <Empty>Nothing recorded yet.</Empty> : (
            <ul aria-label="branch ledger" style={small}>{x.events.map((e) => <li key={e.event_id}>{fmtInstant(e.occurred_at)} — {branchEventLine(e)} · <Mono>{short(e.actor_principal_id)}</Mono></li>)}</ul>
          )}
        </section>
      </>)}
      {problem !== null ? <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>{problem}</span></LiveStatus> : null}
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
      <Receipt receipt={receipt} />
    </>
  );
}
