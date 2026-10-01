'use client';
/**
 * Recommendations — the decision case's RATIONALE VIEW (CP-6 B35 part `recommendation`, migration 0101 §R; F-P6-02: CAP-DS-09/-10, OBJ-33,
 * FEX-15, WS-15, HX-08; F-P4-09's and F-P5-06's B35 pieces; ES-37-008).
 *
 * A recommendation is its own explained object: what, for whom, by when; what could make it wrong (always shown); the missing evidence; the
 * value judgments, policy constraints, analytical assumptions and model outputs SEPARATED, each with its source. The Decision Agent's
 * recommendations stand BESIDE the named humans' (side by side, the AI named as such); a named human who is not the author accepts one FOR
 * CONSIDERATION — never a decision. A flag (the option resting on a scenario that fails its quality evaluation, or on a run whose stability
 * or constraint indicators failed) is shown and needs the reviewer's stated override. An incomplete version shows its gaps; its owner may
 * attest the human-led mode and a second human acknowledge it — the analysis then proceeds WITHOUT recommendation. Every figure is the
 * server's; the forms are offered to everyone and the server refuses whoever may not act, and its refusal is shown as it states it.
 */
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { useShell } from '../layout';
import {
  recommendations as api, authorMark, COMPONENT_LABELS, completenessWords, coverageWords, flagWords, linesOf, sourcedOf, stateMark,
  type Completeness, type PackageRow, type PackageView, type Recommendation, type Verdict,
} from '../../../lib/recommendation-b35';
import { Empty, LiveStatus, Mono, cardStyle, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, Receipt } from '../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const short = (v: string | null | undefined) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : (v ?? '—'));

function Mark({ m }: { m: { glyph: string; token: string; text: string } }) {
  return <span style={{ color: `var(${m.token})`, border: `1px solid var(${m.token})`, borderRadius: 'var(--eye-radius-sm)', paddingInline: 'var(--eye-space-4)', fontSize: 'var(--eye-type-label-sm)', fontWeight: 650 }}>
    <span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}
function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div style={{ marginBlockEnd: 'var(--eye-space-8)' }}><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}

/** One recommendation in full: the object, its four separated components, what it rests on now, its reviews, the review form. */
function RecommendationCard({ r, onDone }: { r: Recommendation; onDone: () => void }) {
  const { scope } = useShell();
  const [verdict, setVerdict] = useState<Verdict>('accept_for_consideration');
  const [rationale, setRationale] = useState(''); const [override, setOverride] = useState(''); const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null); const [receipt, setReceipt] = useState<ReceiptT>(null);
  const a = authorMark(r.author_kind);
  const live = r.state === 'proposed' || r.state === 'accepted_for_consideration';
  return (
    <article aria-label={`recommendation ${r.recommendation_id}`} style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-16)' }}>
      <p><strong><span aria-hidden="true">{a.glyph}</span> {a.text}</strong> · <Mark m={stateMark(r.state)} /> · option <Mono>{r.option_key}</Mono>{r.option_title !== null && ` — ${r.option_title}`} · v{r.version}</p>
      <p style={{ fontSize: 'var(--eye-type-heading-3)', margin: 0 }}>{r.what}</p>
      <p>For <strong>{r.for_whom}</strong> · by <strong>{r.by_when}</strong></p>
      <h4>What could make it wrong</h4>
      <ul>{r.what_could_make_it_wrong.map((w, i) => <li key={i}>{w.statement}{w.signpost !== undefined && <span style={muted}> (signpost: {w.signpost})</span>}</li>)}</ul>
      {r.assumptions.length > 0 && <><h4>Assumptions</h4><ul>{r.assumptions.map((x, i) => <li key={i}>{x.statement}</li>)}</ul></>}
      <h4>Missing evidence</h4>
      {r.missing_evidence.length === 0 ? <Empty>none named</Empty> : <ul>{r.missing_evidence.map((x, i) => <li key={i}>{x.what}</li>)}</ul>}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' }}>
        {COMPONENT_LABELS.map(([k, label]) => (
          <section key={k} aria-label={label} style={{ border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)', padding: 'var(--eye-space-8)' }}>
            <h5 style={{ margin: 0 }}>{label}</h5>
            {r.components[k].length === 0 ? <Empty>none</Empty> : <ul>{r.components[k].map((x, i) => (
              <li key={i}>{x.statement} <span style={muted}>— source {x.source.kind}: <Mono>{x.source.ref}</Mono>{x.decision_use !== undefined && ` · ${x.decision_use.label}`}</span></li>))}</ul>}
          </section>
        ))}
      </div>
      <h4>What the option rests on now</h4>
      {r.flags.length === 0 ? <p>no flag stands</p> : <ul>{r.flags.map((f, i) => <li key={i} style={critical}><span aria-hidden="true">⚑</span> {flagWords(f)}</li>)}</ul>}
      {r.option_runs.length === 0 ? <Empty>the option cites no run</Empty> : <ul>{r.option_runs.map((o) => <li key={o.run_id}>run <Mono>{short(o.run_id)}</Mono> — {o.label ?? o.use}</li>)}</ul>}
      <p>{coverageWords(r.coverage)}</p>
      <h4>Reviews</h4>
      {r.reviews.length === 0 ? <Empty>not reviewed yet</Empty> : <ul>{r.reviews.map((v) => (
        <li key={v.review_id}>{v.verdict.replace(/_/g, ' ')} by <Mono>{short(v.reviewer_principal_id)}</Mono> at {fmtInstant(v.reviewed_at)} — {v.rationale}
          {v.override !== null && <span> · override: {v.override}</span>} · compared with {v.compared} other recommendation(s)</li>))}</ul>}
      {r.state === 'proposed' && (
        <fieldset style={{ border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)' }}>
          <legend>Review (a named human who is not the author)</legend>
          <div role="radiogroup" aria-label="verdict">
            {(['accept_for_consideration', 'decline', 'request_changes'] as const).map((v) => (
              <label key={v} style={{ marginInlineEnd: 'var(--eye-space-12)' }}><input type="radio" name={`verdict-${r.recommendation_id}`} checked={verdict === v} onChange={() => setVerdict(v)} /> {v.replace(/_/g, ' ')}</label>))}
          </div>
          <Field id={`rat-${r.recommendation_id}`} label="Rationale">{(id) => <textarea id={id} style={textareaStyle} value={rationale} onChange={(e) => setRationale(e.target.value)} />}</Field>
          {r.flags.length > 0 && <Field id={`ovr-${r.recommendation_id}`} label="Override (required to accept while a flag stands)">{(id) => <textarea id={id} style={textareaStyle} value={override} onChange={(e) => setOverride(e.target.value)} />}</Field>}
          <GovernedButton label="Record the review" pendingLabel="Recording…" onRun={async () => {
            const res = await api.review(scope, r.recommendation_id, { verdict, rationale, override: override.trim() === '' ? null : override, expectedDigest: r.digest });
            if (!res.ok) { setMsg(refusal(res, 'the review was refused')); return; }
            setMsg(`reviewed: ${verdict.replace(/_/g, ' ')}`); setReceipt(res.data?.receipt ?? null); onDone();
          }} />
        </fieldset>
      )}
      {live && (
        <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <Field id={`wd-${r.recommendation_id}`} label="Withdrawal reason (the author or the package owner)">{(id) => <input id={id} style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <GovernedButton variant="quiet" label="Withdraw" pendingLabel="Withdrawing…" onRun={async () => {
            const res = await api.withdraw(scope, r.recommendation_id, reason);
            if (!res.ok) { setMsg(refusal(res, 'the withdrawal was refused')); return; }
            setMsg('withdrawn'); setReceipt(res.data?.receipt ?? null); onDone();
          }} />
        </div>
      )}
      {msg !== null && <LiveStatus assertive={msg.startsWith('HTTP')}>{msg}</LiveStatus>}
      <Receipt receipt={receipt} />
    </article>
  );
}

/** The version's completeness (FEX-15): the gaps, the attestation; attest (the owner) and acknowledge (a second human). */
function CompletenessCard({ pkg, c, onDone }: { pkg: PackageView; c: Completeness; onDone: () => void }) {
  const { scope } = useShell();
  const [reason, setReason] = useState(''); const [note, setNote] = useState(''); const [msg, setMsg] = useState<string | null>(null); const [receipt, setReceipt] = useState<ReceiptT>(null);
  return (
    <section aria-labelledby="completeness" style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-16)' }}>
      <h3 id="completeness" style={h3}>Completeness of version {c.version} ({c.version_state})</h3>
      <p style={c.complete ? undefined : critical}>{completenessWords(c)}</p>
      {c.gaps.length > 0 && <ul>{c.gaps.map((g) => <li key={g.key}><strong>{g.category}</strong> — {g.detail} <span style={muted}>(<Mono>{g.key}</Mono>)</span></li>)}</ul>}
      {c.attestation !== null && <p>Attestation <Mono>{short(c.attestation.attestation_id)}</Mono> — {c.attestation.state}; by <Mono>{short(c.attestation.attested_by)}</Mono>: {c.attestation.reason}
        {c.attestation.acknowledged_by !== null && <> · acknowledged by <Mono>{short(c.attestation.acknowledged_by)}</Mono>: {c.attestation.acknowledgement_note}</>}</p>}
      {!c.complete && c.version_state === 'draft' && c.mode !== 'human_led' && (
        <fieldset style={{ border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)' }}>
          <legend>Human-led mode — analysis without recommendation</legend>
          <Field id="att-reason" label="Why the decision proceeds human-led (the owner names every gap above)">{(id) => <textarea id={id} style={textareaStyle} value={reason} onChange={(e) => setReason(e.target.value)} />}</Field>
          <GovernedButton label="Attest the human-led mode" pendingLabel="Attesting…" onRun={async () => {
            const res = await api.attest(scope, pkg.package_id, c.version, { missing: c.gaps.map((g) => ({ key: g.key, category: g.category })), reason });
            if (!res.ok) { setMsg(refusal(res, 'the attestation was refused')); return; }
            setMsg('attested — a second human acknowledges'); setReceipt(res.data?.receipt ?? null); onDone();
          }} />
          {c.attestation !== null && c.attestation.state === 'attested' && <>
            <Field id="ack-note" label="Acknowledgement note (a second human, not the attester)">{(id) => <input id={id} style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
            <GovernedButton variant="quiet" label="Acknowledge" pendingLabel="Acknowledging…" onRun={async () => {
              const res = await api.acknowledge(scope, c.attestation!.attestation_id, note);
              if (!res.ok) { setMsg(refusal(res, 'the acknowledgement was refused')); return; }
              setMsg('acknowledged — the version proceeds human-led'); setReceipt(res.data?.receipt ?? null); onDone();
            }} />
          </>}
        </fieldset>
      )}
      {msg !== null && <LiveStatus assertive={msg.startsWith('HTTP')}>{msg}</LiveStatus>}
      <Receipt receipt={receipt} />
    </section>
  );
}

/** RECORD a recommendation on the current version (a named human; the Decision Agent records through the same route). */
function RecordForm({ pkg, onDone }: { pkg: PackageView; onDone: () => void }) {
  const { scope } = useShell();
  const current = pkg.versions.find((v) => v.version === pkg.current_version) ?? pkg.versions[0];
  const [optionKey, setOptionKey] = useState(''); const [what, setWhat] = useState(''); const [forWhom, setForWhom] = useState(''); const [byWhen, setByWhen] = useState('');
  const [wrong, setWrong] = useState(''); const [assume, setAssume] = useState(''); const [missing, setMissing] = useState('');
  const [vj, setVj] = useState(''); const [pc, setPc] = useState(''); const [aa, setAa] = useState(''); const [mo, setMo] = useState('');
  const [msg, setMsg] = useState<string | null>(null); const [receipt, setReceipt] = useState<ReceiptT>(null);
  if (current === undefined) return null;
  return (
    <section aria-labelledby="record" style={{ ...cardStyle, marginBlockEnd: 'var(--eye-space-16)' }}>
      <h3 id="record" style={h3}>Record a recommendation on version {current.version}</h3>
      <Field id="rec-option" label="Option">{(id) => <select id={id} style={inputStyle} value={optionKey} onChange={(e) => setOptionKey(e.target.value)}>
        <option value="">choose an option</option>{current.options.map((o) => <option key={o.key} value={o.key}>{o.key} — {o.title} ({o.kind.replace('_', ' ')})</option>)}</select>}</Field>
      <Field id="rec-what" label="What is recommended">{(id) => <textarea id={id} style={textareaStyle} value={what} onChange={(e) => setWhat(e.target.value)} />}</Field>
      <Field id="rec-whom" label="For whom">{(id) => <input id={id} style={inputStyle} value={forWhom} onChange={(e) => setForWhom(e.target.value)} />}</Field>
      <Field id="rec-by" label="By when (a day)">{(id) => <input id={id} type="date" style={inputStyle} value={byWhen} onChange={(e) => setByWhen(e.target.value)} />}</Field>
      <Field id="rec-wrong" label="What could make it wrong (one per line — at least one)">{(id) => <textarea id={id} style={textareaStyle} value={wrong} onChange={(e) => setWrong(e.target.value)} />}</Field>
      <Field id="rec-assume" label="Assumptions (one per line)">{(id) => <textarea id={id} style={textareaStyle} value={assume} onChange={(e) => setAssume(e.target.value)} />}</Field>
      <Field id="rec-missing" label="Missing evidence (one per line)">{(id) => <textarea id={id} style={textareaStyle} value={missing} onChange={(e) => setMissing(e.target.value)} />}</Field>
      <p style={muted}>Each component line reads <Mono>kind:ref | statement</Mono> — value judgments principal|objective|stated, policy constraints policy|constraint|obligation|regulation|stated, analytical assumptions assumption|stated, model outputs run|forecast|voi.</p>
      <Field id="rec-vj" label="Value judgments">{(id) => <textarea id={id} style={textareaStyle} value={vj} onChange={(e) => setVj(e.target.value)} />}</Field>
      <Field id="rec-pc" label="Policy constraints">{(id) => <textarea id={id} style={textareaStyle} value={pc} onChange={(e) => setPc(e.target.value)} />}</Field>
      <Field id="rec-aa" label="Analytical assumptions">{(id) => <textarea id={id} style={textareaStyle} value={aa} onChange={(e) => setAa(e.target.value)} />}</Field>
      <Field id="rec-mo" label="Model outputs">{(id) => <textarea id={id} style={textareaStyle} value={mo} onChange={(e) => setMo(e.target.value)} />}</Field>
      <GovernedButton label="Record the recommendation" pendingLabel="Recording…" onRun={async () => {
        const res = await api.record(scope, pkg.package_id, current.version, {
          optionKey, what, forWhom, byWhen, whatCouldMakeItWrong: linesOf(wrong).map((statement) => ({ statement })), assumptions: linesOf(assume).map((statement) => ({ statement })),
          missingEvidence: linesOf(missing).map((w) => ({ what: w })),
          components: { valueJudgments: sourcedOf(vj), policyConstraints: sourcedOf(pc), analyticalAssumptions: sourcedOf(aa), modelOutputs: sourcedOf(mo, 'run') },
        });
        if (!res.ok) { setMsg(refusal(res, 'the recommendation was refused')); return; }
        setMsg(`recorded (${String(res.data?.recommendation['author_kind'])}); it awaits a review`); setReceipt(res.data?.receipt ?? null); onDone();
      }} />
      {msg !== null && <LiveStatus assertive={msg.startsWith('HTTP')}>{msg}</LiveStatus>}
      <Receipt receipt={receipt} />
    </section>
  );
}

export default function RecommendationsPage() {
  const { scope } = useShell();
  const [rows, setRows] = useState<PackageRow[] | null>(null); const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState<PackageView | null>(null); const [problem, setProblem] = useState<string | null>(null);
  const load = useCallback(async () => {
    const r = await api.list(scope);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the packages could not be read')); return; }
    setRows(r.data.packages);
  }, [scope]);
  const open = useCallback(async (id: string) => {
    setSelected(id);
    const r = await api.view(scope, id);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the package could not be read')); setView(null); return; }
    setProblem(null); setView(r.data.package);
  }, [scope]);
  useEffect(() => {
    void load();
    try { const q = new URLSearchParams(window.location.search).get('package'); if (q !== null) void open(q); } catch { /* no query */ }
  }, [load, open]);
  const refresh = () => { if (selected !== null) void open(selected); void load(); };
  const cur = view?.side_by_side.version ?? null;
  const byId = new Map((view?.recommendations ?? []).map((r) => [r.recommendation_id, r]));
  const others = (view?.recommendations ?? []).filter((r) => !(r.version === cur && (r.state === 'proposed' || r.state === 'accepted_for_consideration')));
  return (
    <main style={{ padding: 'var(--eye-space-24)' }}>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)' }}>Recommendations</h1>
      <p style={muted}>A recommendation informs a decision; it never makes one. The Decision Agent drafts; a named human who is not the author accepts a recommendation for consideration.</p>
      {problem !== null && <p role="alert" style={critical}>{problem}</p>}
      <section aria-labelledby="packages" style={{ marginBlockEnd: 'var(--eye-space-16)' }}>
        <h2 id="packages" style={h2}>Packages</h2>
        {rows === null ? <Empty>reading…</Empty> : rows.length === 0 ? <Empty>no decision package in this domain</Empty> : (
          <ul>{rows.map((p) => <li key={p.package_id}><button type="button" onClick={() => void open(p.package_id)} aria-pressed={selected === p.package_id}
            style={{ background: 'none', border: 'none', color: 'var(--eye-color-accent-strong)', cursor: 'pointer', padding: 0 }}>{p.title}</button>
            <span style={muted}> · {p.state} · v{p.current_version ?? '—'} · {p.live} live recommendation(s), {p.agent} by the Decision Agent</span></li>)}</ul>)}
      </section>
      {view !== null && (
        <>
          <h2 style={h2}>{view.title}</h2>
          <p>{view.statement}</p>
          <p style={muted}>owner <Mono>{short(view.owner_principal_id)}</Mono> · {view.state} · current version {cur ?? '—'}</p>
          {view.completeness !== null && <CompletenessCard pkg={view} c={view.completeness} onDone={refresh} />}
          <h3 style={h3}>Side by side — version {cur ?? '—'}</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(22rem, 1fr))', gap: 'var(--eye-space-16)' }}>
            <section aria-label="the Decision Agent's recommendations">
              <h4>Decision Agent (AI)</h4>
              {view.side_by_side.agent.length === 0 ? <Empty>none live</Empty> : view.side_by_side.agent.map((id) => { const r = byId.get(id); return r === undefined ? null : <RecommendationCard key={id} r={r} onDone={refresh} />; })}
            </section>
            <section aria-label="the named humans' recommendations">
              <h4>Named humans</h4>
              {view.side_by_side.human.length === 0 ? <Empty>none live</Empty> : view.side_by_side.human.map((id) => { const r = byId.get(id); return r === undefined ? null : <RecommendationCard key={id} r={r} onDone={refresh} />; })}
            </section>
          </div>
          <RecordForm pkg={view} onDone={refresh} />
          <section aria-labelledby="history">
            <h3 id="history" style={h3}>Earlier and closed recommendations</h3>
            {others.length === 0 ? <Empty>none</Empty> : others.map((r) => <RecommendationCard key={r.recommendation_id} r={r} onDone={refresh} />)}
          </section>
        </>
      )}
    </main>
  );
}
