'use client';
/**
 * Strategic health — the DECOMPOSABLE Strategic Health Score (CP-6 B32, migration 0089 §H; F-P6-08; VIZ-12: "gauge without
 * decomposition" is the anti-pattern; UX-43-001..006).
 *
 * Every number on this page is the SERVER's, computed in the database from the health input contract under a definition one person
 * proposed and ANOTHER approved. The order is the chapter's: STATUS and COVERAGE come before any number; an INDETERMINATE score shows no
 * number at all; each dimension decomposes into its components — weight, score, contribution, evidence, confidence, trend, a freshness
 * badge ("9 d stale"), the reason an input was excluded, the sensitivity — and names the decisions it informs. A score change is
 * ACKNOWLEDGED (a receipt) or CHALLENGED and decided by someone who is neither the challenger nor the definition's approver; its anti-gaming
 * flags are shown and gate nothing. The score informs attention; it authorizes nothing (UX-43-004).
 *
 * The one computation here is the alternative-weight VIEW (lib/health.ts `whatIf`), labelled as a view: nothing is recorded; a weight
 * becomes real only as a new definition version two people approve. The forms are shown to everyone; the server decides who may, and its
 * refusal is shown as it states it.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useShell } from '../layout';
import {
  health as api, APPROVER_ROLES, CHALLENGE_KINDS, PROPOSER_ROLES, barPercent, changeMark, coverageWords, freshnessBadge, gamingFlagWords, parseModel, scoreWords, sensitivityWords,
  statusMark, trendWords, whatIf,
  type Comparison, type HealthChange, type HealthComponent, type HealthDefinition, type HealthDimension, type HealthResult, type HealthSnapshot,
} from '../../../lib/health';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
type Detail = HealthSnapshot & { result: HealthResult; components: HealthComponent[]; changes: HealthChange[] };
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const short = (v: string | null | undefined) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : (v ?? '—'));
const toIso = (v: string): string | null => { if (v.trim() === '') return null; const d = new Date(v); return Number.isNaN(d.getTime()) ? null : d.toISOString(); };
const num = (v: number | null | undefined, digits = 2) => (typeof v === 'number' ? String(Math.round(v * 10 ** digits) / 10 ** digits) : '—');

function Mark({ m }: { m: { glyph: string; token: string; text: string } }) {
  return <span style={{ color: `var(${m.token})`, border: `1px solid var(${m.token})`, borderRadius: 'var(--eye-radius-sm)', paddingInline: 'var(--eye-space-4)', fontSize: 'var(--eye-type-label-sm)', fontWeight: 650, whiteSpace: 'nowrap' }}>
    <span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}
function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}

/** The 0–100 bar with the band floors marked; no bar at all for an indeterminate value. The words beside it carry the same facts. */
function ScoreBar({ value, bands, label }: { value: number | null; bands: Array<{ key: string; min: number }>; label: string }) {
  const pct = barPercent(value);
  if (pct === null) return <p style={muted}>no bar: the value is indeterminate</p>;
  return (
    <div role="img" aria-label={`${label}: ${pct} of 100; band floors ${bands.map((b) => `${b.key} ${b.min}`).join(', ')}`}
      style={{ position: 'relative', blockSize: '0.9rem', background: 'var(--eye-color-surface-secondary)', border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-sm)', marginBlock: 'var(--eye-space-4)' }}>
      <div style={{ position: 'absolute', insetBlock: 0, insetInlineStart: 0, inlineSize: `${pct}%`, background: 'var(--eye-color-accent-default)', borderRadius: 'var(--eye-radius-sm)' }} />
      {bands.filter((b) => b.min > 0).map((b) => (
        <div key={b.key} title={`${b.key} ≥ ${b.min}`} style={{ position: 'absolute', insetBlock: '-0.2rem', insetInlineStart: `${b.min}%`, inlineSize: '2px', background: 'var(--eye-color-ink-strong)' }} />
      ))}
    </div>
  );
}

/** One dimension DECOMPOSED: status and coverage first, then the value; the components with every fact the server recorded; the view. */
function DimensionCard({ d, components, minCoverage }: { d: HealthDimension; components: HealthComponent[]; minCoverage: number }) {
  const [weights, setWeights] = useState<Record<string, string>>({});
  const mine = components.filter((c) => c.dimension === d.key);
  const typed = Object.fromEntries(Object.entries(weights).filter(([, v]) => v.trim() !== '' && Number.isFinite(Number(v))).map(([k, v]) => [k, Number(v)]));
  const view = whatIf(mine, typed, minCoverage);
  return (
    <section aria-labelledby={`dim-${d.key}`} style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-16)' }}>
      <h3 id={`dim-${d.key}`} style={h3}>{d.label} <span style={muted}>(weight {d.weight})</span></h3>
      <p><Mark m={statusMark(d.status)} /> · {coverageWords(d.coverage)}{d.critical_failures.length > 0 && <strong style={critical}> · critical failure: {d.critical_failures.join(', ')}</strong>}</p>
      <p style={{ fontSize: 'var(--eye-type-heading-2)', margin: 0 }}>
        {scoreWords(d.value, d.status)}{d.band !== null && <span style={{ fontSize: 'var(--eye-type-body)' }}> — band <strong>{d.band}</strong></span>}
        <span style={{ fontSize: 'var(--eye-type-body)', ...muted }}> · trend {trendWords(d.trend)}</span>
      </p>
      <ScoreBar value={d.status === 'indeterminate' ? null : d.value} bands={d.bands} label={d.label} />
      <p style={muted}>{d.band_basis}. Were every excluded component at 0: {num(d.bounds.if_excluded_at_0)}; at 100: {num(d.bounds.if_excluded_at_100)}.</p>
      {d.reasons.length > 0 && <ul aria-label={`${d.label}: what qualifies it`}>{d.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
      {(d.decision_links ?? []).length > 0 && <p>Informs: {(d.decision_links ?? []).map((l) => <span key={l.decision_id}><Mono title={l.decision_id}>{l.title}</Mono> </span>)}</p>}
      <ScrollBox label={`${d.label} components`}>
        <table className="eye-table" style={tableStyle}>
          <thead><tr><Th>Component</Th><Th>Input</Th><Th>Value</Th><Th>Score</Th><Th>Weight</Th><Th>Contribution</Th><Th>Evidence</Th><Th>Confidence</Th><Th>Trend</Th><Th>Freshness</Th><Th>Sensitivity</Th><Th>What-if weight</Th></tr></thead>
          <tbody>{mine.map((c) => {
            const f = freshnessBadge(c);
            return (
              <tr key={c.key}>
                <Td><strong>{c.label}</strong>{c.critical && <span style={critical}> · critical{c.critical_failure ? ' — FAILING' : ''}</span>}{c.reason !== null && <div style={muted}>{c.reason}</div>}</Td>
                <Td><Mono title={c.input_id}>{c.input_kind} {short(c.input_id)}</Mono></Td>
                <Td>{c.value === null ? '—' : `${num(c.value)}${c.unit ? ` ${c.unit}` : ''}`}</Td>
                <Td>{c.normalised === null ? <span style={muted}>excluded</span> : num(c.normalised)}</Td>
                <Td>{c.weight}</Td>
                <Td>{c.contribution === null ? '—' : num(c.contribution)}</Td>
                <Td>{c.evidence.length === 0 ? <span style={muted}>none recorded</span> : c.evidence.map((e) => <Mono key={`${e.object_id}-${e.version}`} title={e.object_id}>{short(e.object_id)}@{e.version} </Mono>)}</Td>
                <Td>{c.confidence === null ? <span style={muted}>no input</span> : <>{c.confidence}{c.low_confidence && <strong style={critical}> low</strong>}</>}</Td>
                <Td>{trendWords(c.trend)}</Td>
                <Td><span style={{ color: `var(${f.token})`, fontWeight: 650 }}>{f.text}</span></Td>
                <Td>{sensitivityWords(c.sensitivity)}</Td>
                <Td><input aria-label={`what-if weight for ${c.label}`} inputMode="decimal" style={{ ...inputStyle, inlineSize: '5rem' }} placeholder={String(c.weight)}
                  value={weights[c.key] ?? ''} onChange={(e) => setWeights({ ...weights, [c.key]: e.target.value })} /></Td>
              </tr>
            );
          })}</tbody>
        </table>
      </ScrollBox>
      <p aria-live="polite" style={{ marginBlockEnd: 0 }}>
        <em>Alternative-weight view (a view, not a score — nothing is recorded):</em> {view.value === null ? `no value — ${Math.round(view.coverage * 1000) / 10} % covered is below the floor ${minCoverage}` : `${view.value} at ${Math.round(view.coverage * 1000) / 10} % coverage`} (typed weights total {view.total}).
      </p>
    </section>
  );
}

function ChangeRow({ c, onDone, scope }: { c: HealthChange; onDone: () => Promise<void>; scope: ReturnType<typeof useShell>['scope'] }) {
  const [note, setNote] = useState(''); const [kind, setKind] = useState<string>('input'); const [statement, setStatement] = useState('');
  const [receipt, setReceipt] = useState<ReceiptT>(null); const [problem, setProblem] = useState<string | null>(null);
  const act = async (label: string, run: () => Promise<{ ok: boolean; status: number; error?: { code: string; message: string }; data?: { change: HealthChange; receipt: ReceiptT } }>) => {
    setProblem(null);
    const r = await run();
    if (!r.ok || r.data === undefined) { const m = `not ${label} — ${refusal(r, 'no answer')}`; setProblem(m); throw new Error(m); }
    setReceipt(r.data.receipt); await onDone();
  };
  return (
    <li style={{ marginBlockEnd: 'var(--eye-space-16)' }}>
      <p><Mark m={changeMark(String(c.state))} /> <strong>{c.subject_label}</strong>: {c.from_value === null ? 'no score' : c.from_value} → {c.to_value === null ? 'no score' : c.to_value}
        {c.delta !== null && <> ({c.delta > 0 ? '+' : ''}{c.delta})</>}{c.from_band !== null && c.to_band !== null && c.from_band !== c.to_band && <> · band {c.from_band} → {c.to_band}</>} · {c.triggers.join(', ')}
        <span style={muted}> · a change triggers review, never action</span></p>
      {c.gaming_flags.length > 0 && <ul aria-label="anti-gaming flags (shown; they gate nothing)">{c.gaming_flags.map((f) => <li key={`${f.flag}-${f.component ?? f.band ?? ''}`} style={{ color: 'var(--eye-color-warning)' }}>⚠ {gamingFlagWords(f)}</li>)}</ul>}
      {c.challenge_statement !== null && <p style={muted}>Challenged ({c.challenge_kind}) by <Mono>{short(c.challenged_by)}</Mono>: {c.challenge_statement}{c.decision_note !== null && <> — decided: {c.decision_note}</>}{c.withdrawal_reason !== null && <> — withdrawn: {c.withdrawal_reason}</>}</p>}
      {c.state === 'raised' && (
        <div style={rowStyle}>
          <Field id={`ack-${c.change_id}`} label="Acknowledge (a receipt — optional note)">{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          <div style={{ alignSelf: 'end' }}><GovernedButton label="Acknowledge" pendingLabel="acknowledging" variant="quiet" onRun={() => act('acknowledged', () => api.acknowledge(scope, c.change_id, note))} /></div>
        </div>
      )}
      {(c.state === 'raised' || c.state === 'acknowledged') && (
        <div style={rowStyle}>
          <Field id={`chk-${c.change_id}`} label="Challenge — what it disputes">{(id) => (
            <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={kind} onChange={(e) => setKind(e.target.value)}>{CHALLENGE_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}</select>
          )}</Field>
          <Field id={`chs-${c.change_id}`} label="The case (8+ characters)">{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={statement} onChange={(e) => setStatement(e.target.value)} />}</Field>
          <div style={{ alignSelf: 'end' }}><GovernedButton label="Challenge" pendingLabel="challenging" onRun={() => act('challenged', () => api.challenge(scope, c.change_id, kind, statement))} /></div>
        </div>
      )}
      {c.state === 'challenged' && (
        <div style={rowStyle}>
          <Field id={`dn-${c.change_id}`} label="Decision note or withdrawal reason (8+ characters)">{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          <div style={{ alignSelf: 'end', display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
            <GovernedButton label="Uphold" pendingLabel="deciding" variant="critical" onRun={() => act('decided', () => api.decide(scope, c.change_id, 'upheld', note))} />
            <GovernedButton label="Dismiss" pendingLabel="deciding" onRun={() => act('decided', () => api.decide(scope, c.change_id, 'dismissed', note))} />
            <GovernedButton label="Withdraw (the challenger)" pendingLabel="withdrawing" variant="quiet" onRun={() => act('withdrawn', () => api.withdraw(scope, c.change_id, note))} />
          </div>
        </div>
      )}
      {problem !== null && <LiveStatus assertive><span style={critical}>{problem}</span></LiveStatus>}
      <Receipt receipt={receipt} />
    </li>
  );
}

function DefinitionsPanel({ onChanged }: { onChanged: () => Promise<void> }) {
  const { scope } = useShell();
  const [active, setActive] = useState<HealthDefinition | null>(null); const [pending, setPending] = useState<HealthDefinition | null>(null); const [all, setAll] = useState<HealthDefinition[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [modelText, setModelText] = useState(''); const [reason, setReason] = useState('');
  const [note, setNote] = useState(''); const [review, setReview] = useState(''); const [refuseReason, setRefuseReason] = useState('');
  const [receipt, setReceipt] = useState<ReceiptT>(null); const [actProblem, setActProblem] = useState<string | null>(null);
  const load = async () => {
    const r = await api.definitions(scope);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the definitions could not be read')); return; }
    setProblem(null); setActive(r.data.active); setPending(r.data.pending); setAll(r.data.definitions);
    if (modelText === '' && r.data.active !== null) setModelText(JSON.stringify(r.data.active.model, null, 2));
  };
  useEffect(() => { void load(); }, [scope]);
  const done = async (r: { ok: boolean; status: number; error?: { code: string; message: string }; data?: { receipt: ReceiptT } }, what: string) => {
    if (!r.ok || r.data === undefined) { const m = `not ${what} — ${refusal(r, 'no answer')}`; setActProblem(m); throw new Error(m); }
    setActProblem(null); setReceipt(r.data.receipt); await load(); await onChanged();
  };
  return (
    <section aria-labelledby="defs-h" style={cardStyle}>
      <h2 id="defs-h" style={h2}>The definition — two people</h2>
      <p style={muted}>One person proposes a version (<Mono>{PROPOSER_ROLES.join(', ')}</Mono>); ANOTHER approves or refuses it (<Mono>{APPROVER_ROLES.join(', ')}</Mono>) — never the proposer. A weight or threshold moved beyond the anti-gaming policy needs the approver&apos;s written review.</p>
      {problem !== null && <LiveStatus assertive><span style={critical}>not listed — {problem}</span></LiveStatus>}
      <p>Active: {active === null ? <strong style={critical}>none — no score can be computed</strong> : <>version <strong>{active.version}</strong> ({active.formula_version}, digest <Mono>{active.model_digest.slice(0, 12)}…</Mono>), proposed by <Mono>{short(active.proposed_by)}</Mono>, approved by <Mono>{short(active.approved_by)}</Mono>{active.gaming_review_note !== null && <> — anti-gaming review: {active.gaming_review_note}</>}</>}</p>
      {pending !== null && (
        <div style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-8)' }}>
          <p><strong>Proposal — version {pending.version}</strong> by <Mono>{short(pending.proposed_by)}</Mono>: {pending.reason}. Changes: {pending.changed_sections.join(', ') || 'none'}.</p>
          {pending.gaming_review_required && <ul aria-label="why the proposal needs an anti-gaming review" style={{ color: 'var(--eye-color-warning)' }}>{pending.gaming_reasons.map((g, i) => <li key={i}>{JSON.stringify(g)}</li>)}</ul>}
          <div style={rowStyle}>
            <Field id="def-note" label="Approval note (8+ characters)">{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
            <Field id="def-review" label={pending.gaming_review_required ? 'Anti-gaming review (required, 8+ characters)' : 'Anti-gaming review (not required)'}>{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={review} onChange={(e) => setReview(e.target.value)} />}</Field>
            <div style={{ alignSelf: 'end' }}><GovernedButton label="Approve" pendingLabel="approving" onRun={async () => done(await api.approve(scope, pending.definition_id, note, review), 'approved')} /></div>
          </div>
          <div style={rowStyle}>
            <Field id="def-refuse" label="Refusal reason (8+ characters)">{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={refuseReason} onChange={(e) => setRefuseReason(e.target.value)} />}</Field>
            <div style={{ alignSelf: 'end' }}><GovernedButton label="Refuse" pendingLabel="refusing" variant="critical" onRun={async () => done(await api.refuse(scope, pending.definition_id, refuseReason), 'refused')} /></div>
          </div>
        </div>
      )}
      <h3 style={h3}>Propose a version</h3>
      <Field id="def-model" label="The model (JSON: dimensions, components, min_coverage, change_points, min_confidence)">{(id) => <textarea id={id} rows={10} style={{ ...textareaStyle, fontFamily: 'var(--eye-font-mono)' }} value={modelText} onChange={(e) => setModelText(e.target.value)} />}</Field>
      <Field id="def-reason" label="Why it changes (8+ characters)">{(id) => <input id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
      <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
        <GovernedButton label="Propose" pendingLabel="proposing" onRun={async () => {
          const m = parseModel(modelText);
          if (!m.ok) { setActProblem(m.error); throw new Error(m.error); }
          await done(await api.propose(scope, m.model, reason), 'proposed');
        }} />
      </div>
      {actProblem !== null && <LiveStatus assertive><span style={critical}>{actProblem}</span></LiveStatus>}
      <Receipt receipt={receipt} />
      {all !== null && all.length > 0 && (
        <ScrollBox label="definition versions">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Version</Th><Th>State</Th><Th>Proposed</Th><Th>Decided</Th><Th>Reason</Th></tr></thead>
            <tbody>{all.map((d) => (
              <tr key={d.definition_id}><Td>{d.version}</Td><Td><strong>{d.state.toUpperCase()}</strong></Td><Td><Mono>{short(d.proposed_by)}</Mono> {d.proposed_at === null ? '' : fmtInstant(d.proposed_at)}</Td>
                <Td>{d.approved_by !== null ? <>approved by <Mono>{short(d.approved_by)}</Mono></> : d.refused_by !== null ? <>refused by <Mono>{short(d.refused_by)}</Mono>: {d.refusal_reason}</> : '—'}</Td><Td>{d.reason}</Td></tr>
            ))}</tbody>
          </table>
        </ScrollBox>
      )}
    </section>
  );
}

function ComparePanel({ snapshot, snapshots }: { snapshot: HealthSnapshot; snapshots: HealthSnapshot[] }) {
  const { scope } = useShell();
  const [baseline, setBaseline] = useState(''); const [cmp, setCmp] = useState<Comparison | null>(null); const [problem, setProblem] = useState<string | null>(null);
  return (
    <section aria-labelledby="cmp-h" style={cardStyle}>
      <h2 id="cmp-h" style={h2}>Compare with a baseline</h2>
      <p style={muted}>Only snapshots of the same definition and formula are compared (the server refuses the rest); an indeterminate side is withheld, never compared. No peer comparison exists in this product — it is declared absent, never invented.</p>
      <div style={rowStyle}>
        <Field id="cmp-base" label="Baseline (default: the definition's first snapshot)">{(id) => (
          <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={baseline} onChange={(e) => setBaseline(e.target.value)}>
            <option value="">the first current snapshot</option>
            {snapshots.filter((s) => s.snapshot_id !== snapshot.snapshot_id).map((s) => <option key={s.snapshot_id} value={s.snapshot_id}>v{s.definition_version} · {s.at === null ? '' : fmtInstant(s.at)} · {s.kind} · {s.status}</option>)}
          </select>
        )}</Field>
        <div style={{ alignSelf: 'end' }}><GovernedButton label="Compare" pendingLabel="comparing" variant="quiet" onRun={async () => {
          setCmp(null);
          const r = await api.compare(scope, snapshot.snapshot_id, baseline === '' ? null : baseline);
          if (!r.ok || r.data === undefined) { const m = `not compared — ${refusal(r, 'no answer')}`; setProblem(m); throw new Error(m); }
          setProblem(null); setCmp(r.data.comparison);
        }} /></div>
      </div>
      {problem !== null && <LiveStatus assertive><span style={critical}>{problem}</span></LiveStatus>}
      {cmp !== null && (
        <>
          <p>Aggregate: {cmp.aggregate.withheld ?? `${num(cmp.aggregate.from)} → ${num(cmp.aggregate.to)} (${num(cmp.aggregate.delta)})`}{cmp.aggregate.qualified ? <span style={muted}> — {cmp.aggregate.qualified}</span> : null}</p>
          <ul>{cmp.dimensions.map((d) => <li key={d.key}>{d.label}: {d.withheld ?? `${num(d.from)} → ${num(d.to)} (${num(d.delta)})`}{d.from_band !== null && d.to_band !== null && d.from_band !== d.to_band ? `, band ${d.from_band} → ${d.to_band}` : ''}{d.qualified ? ` — ${d.qualified}` : ''}</li>)}</ul>
          <p style={muted}>Peer: none — {cmp.peer.reason}.</p>
        </>
      )}
    </section>
  );
}

export default function HealthPage() {
  const { scope } = useShell();
  const [snapshots, setSnapshots] = useState<HealthSnapshot[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [detailProblem, setDetailProblem] = useState<string | null>(null);
  const [at, setAt] = useState('');
  const [computeReceipt, setComputeReceipt] = useState<ReceiptT>(null); const [computeProblem, setComputeProblem] = useState<string | null>(null);
  const [computed, setComputed] = useState<string | null>(null);

  const loadDetail = async (id: string) => {
    const r = await api.snapshot(scope, id);
    if (!r.ok || r.data === undefined) { setDetail(null); setDetailProblem(refusal(r, 'the snapshot could not be read')); return; }
    setDetailProblem(null); setDetail(r.data.snapshot);
  };
  const load = async (prefer: string | null = null) => {
    const r = await api.snapshots(scope);
    if (!r.ok || r.data === undefined) { setSnapshots(null); setProblem(refusal(r, 'the snapshots could not be read')); return; }
    setProblem(null); setSnapshots(r.data.snapshots);
    const pick = prefer ?? selected ?? r.data.snapshots.find((s) => s.kind === 'current')?.snapshot_id ?? null;
    setSelected(pick);
    if (pick !== null) await loadDetail(pick);
  };
  useEffect(() => { void load(); }, [scope]);

  const result = detail?.result;
  return (
    <div>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Strategic health</h1>
      <p style={muted}>A decomposable score: every number below is the server&apos;s, and each one opens into the measures, weights, evidence and freshness behind it. The score informs attention; it never authorizes an action.</p>

      <section aria-labelledby="compute-h" style={cardStyle}>
        <h2 id="compute-h" style={h2}>Compute</h2>
        <div style={rowStyle}>
          <Field id="h-at" label="At an earlier instant (optional — a replay; empty is now)">{(id) => <input id={id} type="datetime-local" style={{ ...inputStyle, inlineSize: '100%' }} value={at} onChange={(e) => setAt(e.target.value)} />}</Field>
          <div style={{ alignSelf: 'end' }}><GovernedButton label="Compute the score" pendingLabel="computing" onRun={async () => {
            setComputed(null);
            const r = await api.compute(scope, toIso(at));
            if (!r.ok || r.data === undefined) { const m = `not computed — ${refusal(r, 'no answer')}`; setComputeProblem(m); throw new Error(m); }
            setComputeProblem(null); setComputeReceipt(r.data.receipt);
            const s = r.data.snapshot;
            setComputed(`${s.kind === 'as_of' ? `as_of replay${s.replay_of !== null ? ` of ${short(s.replay_of)} — ${s.reproduced ? 'REPRODUCED' : 'NOT reproduced'}` : ''}` : 'current'} · ${statusMark(s.status).text} · ${s.changes.length} change(s) raised`);
            await load(s.snapshot_id);
          }} /></div>
        </div>
        {computeProblem !== null && <LiveStatus assertive><span style={critical}>{computeProblem}</span></LiveStatus>}
        {computed !== null && <LiveStatus>{computed}</LiveStatus>}
        <Receipt receipt={computeReceipt} />
      </section>

      <section aria-labelledby="snaps-h" style={cardStyle}>
        <h2 id="snaps-h" style={h2}>Snapshots</h2>
        {problem !== null && <LiveStatus assertive><span style={critical}>not listed — {problem}</span></LiveStatus>}
        {snapshots === null ? (problem === null ? <Empty>reading the snapshots…</Empty> : null) : snapshots.length === 0 ? <Empty>No score has been computed. A definition must be active first.</Empty> : (
          <ScrollBox label="health score snapshots">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>At</Th><Th>Kind</Th><Th>Definition</Th><Th>Status</Th><Th>Coverage</Th><Th>Score</Th><Th>Decomposition</Th></tr></thead>
              <tbody>{snapshots.map((s) => (
                <tr key={s.snapshot_id} aria-selected={s.snapshot_id === selected}>
                  <Td>{s.at === null ? '—' : fmtInstant(s.at)}</Td>
                  <Td>{s.kind}{s.replay_of !== null && <> of <Mono>{short(s.replay_of)}</Mono> — {s.reproduced ? 'reproduced' : 'NOT reproduced'}</>}</Td>
                  <Td>v{s.definition_version} · <Mono>{s.formula_version}</Mono></Td>
                  <Td><Mark m={statusMark(s.status)} /></Td>
                  <Td>{coverageWords(s.coverage)}</Td>
                  <Td>{scoreWords(s.aggregate, s.status)}</Td>
                  <Td><button type="button" style={{ ...inputStyle, cursor: 'pointer' }} onClick={() => { setSelected(s.snapshot_id); void loadDetail(s.snapshot_id); }}>decompose</button></Td>
                </tr>
              ))}</tbody>
            </table>
          </ScrollBox>
        )}
      </section>

      {detailProblem !== null && <LiveStatus assertive><span style={critical}>not read — {detailProblem}</span></LiveStatus>}
      {detail !== null && result !== undefined && (
        <>
          <section aria-labelledby="score-h" style={cardStyle}>
            <h2 id="score-h" style={h2}>The score at {detail.at === null ? '—' : fmtInstant(detail.at)} <span style={muted}>(definition v{detail.definition_version}, {detail.formula_version})</span></h2>
            {/* STATUS and COVERAGE before the number; an indeterminate score shows none */}
            <p><Mark m={statusMark(detail.status)} /> · {coverageWords(detail.coverage)} · {result.counts['stale'] ?? 0} stale, {result.counts['missing'] ?? 0} missing, {result.counts['inconsistent'] ?? 0} inconsistent, {result.counts['no_confidence_input'] ?? 0} without a confidence input</p>
            <p style={{ fontSize: 'var(--eye-type-heading-1)', margin: 0 }}>{scoreWords(detail.aggregate, detail.status)}{detail.status !== 'indeterminate' && <span style={{ fontSize: 'var(--eye-type-body)', ...muted }}> · trend {trendWords(result.aggregate_trend)}</span>}</p>
            {result.reasons.length > 0 && <ul aria-label="what qualifies the score">{result.reasons.map((r) => <li key={r}>{r}</li>)}</ul>}
            <p style={muted}>{result.rule}. Peer comparison: none — {result.peer.reason}.</p>
          </section>
          {result.dimensions.map((d) => <DimensionCard key={`${detail.snapshot_id}-${d.key}`} d={d} components={detail.components} minCoverage={result.min_coverage} />)}
          <section aria-labelledby="changes-h" style={cardStyle}>
            <h2 id="changes-h" style={h2}>Score changes raised by this snapshot</h2>
            {detail.changes.length === 0 ? <Empty>This snapshot raised no change (an as_of replay never does).</Empty> : (
              <ul style={{ listStyle: 'none', padding: 0 }}>{detail.changes.map((c) => <ChangeRow key={c.change_id} c={c} scope={scope} onDone={async () => loadDetail(detail.snapshot_id)} />)}</ul>
            )}
          </section>
          {snapshots !== null && <ComparePanel snapshot={detail} snapshots={snapshots} />}
        </>
      )}
      <DefinitionsPanel onChanged={async () => load()} />
    </div>
  );
}
