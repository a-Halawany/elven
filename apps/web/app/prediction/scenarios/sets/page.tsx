'use client';
/**
 * Scenario sets — CP-6 B27 part `sets` (0097 §S; F-P4-08).
 *
 * A SET IS PLURAL OR IT DOES NOT GATE A RECOMMENDATION (ADR-012). The set's plurality verdict is the server's: which kinds its policy
 * requires, which it is missing (a missing STRESS branch named), how many LIVE branches it counts — a suspended or closed branch is shown
 * beside the others and marked "not counted" with the reason. A package bound to a set whose check fails is not proposed; the refusal is
 * shown on the package as the server states it.
 *
 * THE COMPARATOR (CAP-DS-02) lays the set's branches side by side — kind, state, statement, divergence, assumptions, the anatomy's
 * elements when recorded, the indicator with its freshness, the consequence and its class, a governed probability when one was set — all
 * read from the server; nothing is derived here.
 *
 * THE PORTFOLIO REVIEW is a named human's act: relevance and consequence per member, the option × branch payoffs; ROBUSTNESS (the worst
 * payoff) and REGRET (best-in-branch minus the option's payoff, at its largest) are COMPUTED BY THE SERVER and shown as it returned them.
 * LIVING SCENARIOS: the relevance the tick scored and the signposts it notified. CREATION TRIGGERS: proposals from a forecast shift, a weak
 * signal, a risk or a planning cycle — accepting one declares nothing.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useShell } from '../../layout';
import { prediction, type ScenarioRow } from '../../../../lib/prediction';
import { sets, setStateMark, pluralityLine, policyLine, branchStateLine, freshnessLine, payoffCell, reviewVerdictLine, proposalSourceLine, proposalStateLine,
  type Comparison, type ProposalKind, type ProposalRow, type RelevanceRow, type SetRow, type SetView } from '../../../../lib/sets-b27';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant, textareaStyle } from '../../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../../components/ui';

type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const KINDS = ['baseline', 'upside', 'downside', 'disruption', 'stress', 'adversarial', 'counterfactual', 'user-defined'] as const;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const short = (id: string | null | undefined) => (id ? `${id.slice(0, 8)}…` : '—');

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}
const txt = (id: string, value: string, onChange: (v: string) => void, type = 'text') => (
  <input id={id} type={type} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)} />
);
const sel = (id: string, value: string, onChange: (v: string) => void, options: ReactNode) => (
  <select id={id} style={{ ...inputStyle, inlineSize: '100%' }} value={value} onChange={(e) => onChange(e.target.value)}>{options}</select>
);

function StateMark({ state }: { state: string }) {
  const m = setStateMark(state);
  return <span aria-label="set state" style={{ color: `var(${m.token})`, fontWeight: 650 }}><span aria-hidden="true">{m.glyph}</span> {m.text}</span>;
}

/** DECLARE a set (a named human): the policy's required kinds as checkboxes, the counts, the package it serves. */
function DeclarePanel({ scope, onDeclared }: { scope: { tenantId: string; domainId: string }; onDeclared: (id: string) => Promise<void> }) {
  const [title, setTitle] = useState('');
  const [purpose, setPurpose] = useState('');
  const [require, setRequire] = useState<string[]>(['baseline', 'stress']);
  const [minBranches, setMinBranches] = useState('2');
  const [minAdverse, setMinAdverse] = useState('1');
  const [packageId, setPackageId] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  return (
    <section aria-labelledby="declare-set-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
      <h2 id="declare-set-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Declare a scenario set</h2>
      <div style={rowStyle}>
        <Field id="ds-title" label="Title">{(id) => txt(id, title, setTitle)}</Field>
        <Field id="ds-package" label="Decision package it serves (optional id)">{(id) => txt(id, packageId, setPackageId)}</Field>
        <Field id="ds-minb" label="Minimum live branches">{(id) => txt(id, minBranches, setMinBranches, 'number')}</Field>
        <Field id="ds-mina" label="Minimum adverse branches">{(id) => txt(id, minAdverse, setMinAdverse, 'number')}</Field>
      </div>
      <Field id="ds-purpose" label="Purpose (8+ characters)">{(id) => <textarea id={id} style={textareaStyle} value={purpose} onChange={(e) => setPurpose(e.target.value)} />}</Field>
      <fieldset style={{ border: 'none', padding: 0, marginBlockStart: 'var(--eye-space-8)' }}>
        <legend>Required kinds (the plurality policy)</legend>
        {KINDS.map((k) => (
          <label key={k} style={{ marginInlineEnd: 'var(--eye-space-12)' }}>
            <input type="checkbox" checked={require.includes(k)} onChange={(e) => setRequire(e.target.checked ? [...require, k] : require.filter((x) => x !== k))} /> {k}
          </label>
        ))}
      </fieldset>
      <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
        <GovernedButton label="Declare the set" pendingLabel="declaring" disabled={title.trim().length < 2 || purpose.trim().length < 8} onRun={async () => {
          setProblem(null);
          const r = await sets.declare(scope, { title: title.trim(), purpose: purpose.trim(), policy: { require, min_branches: Number(minBranches), min_adverse: Number(minAdverse) }, packageId: packageId.trim() === '' ? null : packageId.trim() });
          if (!r.ok || r.data === undefined) { const m = refusal(r, 'the set was not declared'); setProblem(m); throw new Error(m); }
          setReceipt(r.data.receipt); setTitle(''); setPurpose('');
          await onDeclared(r.data.set.set_id);
        }} />
      </div>
      {problem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not declared — {problem}</span></LiveStatus>}
      <Receipt receipt={receipt} />
    </section>
  );
}

/** THE COMPARATOR: the branches side by side, as the server lists them (live first). */
function ComparisonTable({ c }: { c: Comparison }) {
  return (
    <section aria-labelledby="cmp-h" style={{ marginBlockStart: 'var(--eye-space-16)' }}>
      <h3 id="cmp-h" style={h3}>Side by side</h3>
      <p style={{ ...muted, ...small }}>as of {fmtInstant(c.as_of)} · anatomy {c.anatomy_available ? 'recorded where declared' : 'not available on this server'} · governed probabilities {c.probability_available ? 'shown where set' : 'not available on this server'}</p>
      {c.branches.length === 0 ? <Empty>The set has no member yet.</Empty> : (
        <ScrollBox label="the set's branches side by side">
          <table className="eye-table" style={tableStyle} aria-label="comparison">
            <thead><tr><Th>Branch</Th><Th>Kind</Th><Th>State</Th><Th>Statement</Th><Th>Divergence · assumptions</Th><Th>Elements</Th><Th>Indicator · freshness</Th><Th>Consequence</Th><Th>Probability</Th></tr></thead>
            <tbody>
              {c.branches.map((b) => (
                <tr key={b.branch_id} aria-label={`branch ${b.name}`}>
                  <Td>{b.name}<div style={{ ...small, ...muted }}>{b.scenario_title}{b.coherence_state === 'failed' ? ' · coherence FAILED' : ''}</div></Td>
                  <Td><Mono>{b.kind}</Mono>{b.kind_label ? <div style={small}>“{b.kind_label}”</div> : null}</Td>
                  <Td><span style={{ color: b.live ? 'var(--eye-color-ink-default)' : 'var(--eye-color-critical)', fontWeight: b.live ? 400 : 650 }}>{branchStateLine(b)}</span>
                    {b.suspended_at ? <div style={small}>suspended {fmtInstant(b.suspended_at)}</div> : null}</Td>
                  <Td>{b.statement}</Td>
                  <Td>{b.divergence ?? <span style={muted}>{b.kind === 'baseline' ? 'the baseline' : 'diverges by its indicator'}</span>}
                    {Array.isArray(b.assumptions) && b.assumptions.length > 0 ? <ul style={{ margin: 0, paddingInlineStart: 'var(--eye-space-16)', ...small }}>{b.assumptions.map((a, i) => <li key={i}>{a.statement}</li>)}</ul> : null}</Td>
                  <Td>{b.elements === null ? <span style={muted}>—</span> : Array.isArray(b.elements) ? (b.elements.length === 0 ? <span style={muted}>none recorded</span>
                    : <ul style={{ margin: 0, paddingInlineStart: 'var(--eye-space-16)', ...small }}>{b.elements.map((e, i) => <li key={i}>{String(e['kind'])}: {String(e['name'])}</li>)}</ul>) : <span style={muted}>{String((b.elements as Record<string, unknown>)['unavailable'] ?? '—')}</span>}</Td>
                  <Td>{b.indicator === null ? <span style={muted}>—</span> : <>{b.indicator.series_key} {b.indicator.comparator} {b.indicator.threshold}</>}
                    <div style={{ ...small, color: b.indicator?.freshness === 'fresh' || b.indicator === null ? 'var(--eye-color-ink-muted)' : 'var(--eye-color-critical)' }}>{freshnessLine(b.indicator, c.stale_after_days)}</div></Td>
                  <Td>{b.consequence}{b.consequence_class ? <div style={{ ...small, ...muted }}>class <Mono>{b.consequence_class}</Mono></div> : null}</Td>
                  <Td>{b.probability === null ? <span style={muted}>not set</span> : <Mono>{JSON.stringify({ low: b.probability['probability_low'], high: b.probability['probability_high'], method: b.probability['method'] })}</Mono>}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollBox>
      )}
    </section>
  );
}

/** THE PORTFOLIO REVIEW: the latest as recorded, and the form (members rated, payoffs per option × live branch). */
function ReviewPanel({ scope, set, c, onRecorded }: { scope: { tenantId: string; domainId: string }; set: SetView; c: Comparison; onRecorded: () => Promise<void> }) {
  const current = set.members.filter((m) => m.removed_at === null);
  const live = c.branches.filter((b) => b.live);
  const latest = set.reviews[0] ?? null;
  const [ratings, setRatings] = useState<Record<string, { relevance: string; consequence: string }>>({});
  const [optionsText, setOptionsText] = useState('');
  const [payoffs, setPayoffs] = useState<Record<string, string>>({});
  const [unit, setUnit] = useState('EUR k');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const named = optionsText.split('\n').map((l) => l.trim()).filter((l) => l !== '').map((l) => { const [k, ...t] = l.split(':'); return { key: (k ?? '').trim(), title: t.join(':').trim() }; });
  const keys = named.length > 0 ? named.map((o) => o.key) : (latest?.options.map((o) => o.key) ?? []);
  return (
    <section aria-labelledby="rev-h" style={{ marginBlockStart: 'var(--eye-space-16)' }}>
      <h3 id="rev-h" style={h3}>Portfolio review</h3>
      {latest === null ? <p style={muted}>No portfolio review is recorded for this set.</p> : (
        <>
          <p aria-label="review verdict"><strong>{reviewVerdictLine(latest)}</strong></p>
          <p style={{ ...muted, ...small }}>reviewed {fmtInstant(latest.reviewed_at)} by <Mono>{short(latest.reviewer)}</Mono> · set version {latest.set_version}{latest.package_id ? <> · package <Mono>{short(latest.package_id)}</Mono> v{latest.package_version}</> : null}
            {latest.missing_kinds.length > 0 ? <> · missing kinds <strong style={{ color: 'var(--eye-color-critical)' }}>{latest.missing_kinds.join(', ')}</strong></> : null} — {latest.note}</p>
          <ScrollBox label="payoff matrix">
            <table className="eye-table" style={tableStyle} aria-label="payoff matrix">
              <thead><tr><Th>Option</Th>{latest.branches.map((b) => <Th key={b.branch_id}>{b.name} ({b.kind})</Th>)}<Th>Robustness (worst)</Th><Th>Max regret</Th></tr></thead>
              <tbody>
                {latest.options.map((o) => (
                  <tr key={o.key}>
                    <Td><Mono>{o.key}</Mono> {o.title}</Td>
                    {latest.branches.map((b) => {
                      const best = Math.max(...latest.options.map((x) => latest.payoffs[x.key]?.[b.branch_id] ?? Number.NEGATIVE_INFINITY));
                      return <Td key={b.branch_id}>{payoffCell(latest.payoffs[o.key]?.[b.branch_id], best)}</Td>;
                    })}
                    <Td>{String(latest.robustness[o.key])}{latest.most_robust.includes(o.key) ? ' — most robust' : ''}</Td>
                    <Td>{String(latest.regret[o.key])}{latest.least_regret.includes(o.key) ? ' — least regret' : ''}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </ScrollBox>
          {latest.retirements_proposed.length > 0 ? <ul aria-label="retirements proposed" style={small}>{latest.retirements_proposed.map((r, i) => <li key={i}>retire <Mono>{short(r.scenario_id)}</Mono> — {r.note} ({r.act})</li>)}</ul> : null}
        </>
      )}
      {set.state !== 'active' ? null : (
        <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <p style={{ ...muted, ...small }}>Rate every current member; name the options (one per line, <Mono>key: title</Mono>) or leave them empty to weigh the bound package's options; give a payoff for every option and every LIVE branch. The server computes robustness and regret.</p>
          <ScrollBox label="member ratings">
            <table className="eye-table" style={tableStyle} aria-label="member ratings">
              <thead><tr><Th>Member</Th><Th>Relevance</Th><Th>Consequence</Th></tr></thead>
              <tbody>{current.map((m) => (
                <tr key={m.member_id}>
                  <Td>{m.scenario_title}{m.branch_name ? ` — ${m.branch_name}` : ' (every live branch)'}</Td>
                  <Td>{sel(`rv-rel-${m.member_id}`, ratings[m.member_id]?.relevance ?? 'medium', (v) => setRatings({ ...ratings, [m.member_id]: { relevance: v, consequence: ratings[m.member_id]?.consequence ?? 'C2' } }),
                    ['low', 'medium', 'high'].map((x) => <option key={x} value={x}>{x}</option>))}</Td>
                  <Td>{sel(`rv-con-${m.member_id}`, ratings[m.member_id]?.consequence ?? 'C2', (v) => setRatings({ ...ratings, [m.member_id]: { relevance: ratings[m.member_id]?.relevance ?? 'medium', consequence: v } }),
                    ['C0', 'C1', 'C2', 'C3', 'C4'].map((x) => <option key={x} value={x}>{x}</option>))}</Td>
                </tr>))}</tbody>
            </table>
          </ScrollBox>
          <div style={rowStyle}>
            <Field id="rv-options" label="Options (key: title per line; empty = the bound package's)">{(id) => <textarea id={id} style={textareaStyle} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} />}</Field>
            <Field id="rv-unit" label="Payoff unit">{(id) => txt(id, unit, setUnit)}</Field>
          </div>
          {keys.length === 0 ? <p style={{ ...muted, ...small }}>Name the options to enter their payoffs (or leave them empty once the bound package's options are known from a recorded review).</p> : (
            <ScrollBox label="payoffs">
              <table className="eye-table" style={tableStyle} aria-label="payoffs">
                <thead><tr><Th>Option</Th>{live.map((b) => <Th key={b.branch_id}>{b.name}</Th>)}</tr></thead>
                <tbody>{keys.map((k) => (
                  <tr key={k}><Td><Mono>{k}</Mono></Td>{live.map((b) => (
                    <Td key={b.branch_id}><input aria-label={`payoff of ${k} under ${b.name}`} type="number" style={{ ...inputStyle, inlineSize: '6rem' }} value={payoffs[`${k}|${b.branch_id}`] ?? ''}
                      onChange={(e) => setPayoffs({ ...payoffs, [`${k}|${b.branch_id}`]: e.target.value })} /></Td>))}</tr>))}</tbody>
              </table>
            </ScrollBox>
          )}
          <Field id="rv-note" label="Conclusion (8+ characters)">{(id) => <textarea id={id} style={textareaStyle} value={note} onChange={(e) => setNote(e.target.value)} />}</Field>
          <GovernedButton label="Record the portfolio review" pendingLabel="recording" disabled={note.trim().length < 8} onRun={async () => {
            setProblem(null);
            const matrix: Record<string, Record<string, number>> = {};
            for (const k of keys) { matrix[k] = {}; for (const b of live) { const v = payoffs[`${k}|${b.branch_id}`]; if (v !== undefined && v !== '') (matrix[k] as Record<string, number>)[b.branch_id] = Number(v); } }
            const r = await sets.review(scope, set.set_id, {
              members: current.map((m) => ({ member_id: m.member_id, relevance: (ratings[m.member_id]?.relevance ?? 'medium') as 'low' | 'medium' | 'high', consequence: ratings[m.member_id]?.consequence ?? 'C2' })),
              options: named.length > 0 ? named : null, payoffs: matrix, unit: unit.trim(), note: note.trim(),
            });
            if (!r.ok || r.data === undefined) { const m = refusal(r, 'the review was not recorded'); setProblem(m); throw new Error(m); }
            setReceipt(r.data.receipt); setNote('');
            await onRecorded();
          }} />
          {problem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>not recorded — {problem}</span></LiveStatus>}
          <Receipt receipt={receipt} />
        </div>
      )}
    </section>
  );
}

/** LIVING SCENARIOS: the relevance of each member scenario (the server's newest score and its basis) and the signposts notified. */
function RelevancePanel({ scope, rows, canScore, onScored }: { scope: { tenantId: string; domainId: string }; rows: RelevanceRow[]; canScore: boolean; onScored: () => Promise<void> }) {
  const [line, setLine] = useState<string | null>(null);
  return (
    <section aria-labelledby="rel-h" style={{ marginBlockStart: 'var(--eye-space-16)' }}>
      <h3 id="rel-h" style={h3}>Relevance (living scenarios)</h3>
      {rows.length === 0 ? <Empty>No member scenario.</Empty> : (
        <ul aria-label="relevance" style={small}>
          {rows.map((r) => (
            <li key={r.scenario_id}>
              <strong>{r.title}</strong> — {r.latest === null ? 'not scored yet (the tick scores the members of an active set)' : <>score <Mono>{String(r.latest.score)}</Mono> · movement {String(r.latest.basis.movement)} · signposts breached {r.latest.basis.signposts_breached} · review {r.latest.basis.review_due ? 'DUE' : 'not due'} · {fmtInstant(r.latest.scored_at)} ({r.latest.trigger})</>}
              {r.signposts_notified.length > 0 ? <> · owner notified of {r.signposts_notified.length} signpost breach(es)</> : null}
            </li>
          ))}
        </ul>
      )}
      {canScore ? <GovernedButton label="Score relevance now" pendingLabel="scoring" variant="quiet" onRun={async () => {
        const r = await sets.score(scope);
        if (!r.ok || r.data === undefined) throw new Error(refusal(r, 'the scoring was refused'));
        setLine(`${r.data.relevance.scored} scenario(s) scored · ${r.data.relevance.changed} changed · ${r.data.relevance.signposts_notified} signpost notification(s)`);
        await onScored();
      }} /> : null}
      {line === null ? null : <LiveStatus>{line}</LiveStatus>}
    </section>
  );
}

/** CREATION TRIGGERS: the proposals, the proposer's form, the strategy owner's resolution. */
function ProposalsPanel({ scope, me, canPropose, canResolve }: { scope: { tenantId: string; domainId: string }; me: string; canPropose: boolean; canResolve: boolean }) {
  const [rows, setRows] = useState<ProposalRow[] | null>(null);
  const [kind, setKind] = useState<ProposalKind>('forecast_shift');
  const [sourceId, setSourceId] = useState('');
  const [band, setBand] = useState('0.1');
  const [title, setTitle] = useState('');
  const [rationale, setRationale] = useState('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const load = async () => { const r = await sets.proposals(scope); if (r.ok && r.data !== undefined) setRows(r.data.proposals); };
  useEffect(() => { void load(); }, [scope.tenantId, scope.domainId]);
  const field = { forecast_shift: 'forecast_id', weak_signal: 'signal_id', risk: 'exposure_id', planning_cycle: 'cadence_id' }[kind];
  return (
    <section aria-labelledby="prop-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
      <h2 id="prop-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Scenario proposals</h2>
      {rows === null ? <Empty>reading proposals…</Empty> : rows.length === 0 ? <Empty>No proposal has been made.</Empty> : (
        <ul aria-label="proposals" style={{ paddingInlineStart: 'var(--eye-space-16)' }}>
          {rows.map((p) => (
            <li key={p.proposal_id} style={{ marginBlockEnd: 'var(--eye-space-8)' }}>
              <strong>{p.title}</strong> <span style={small}>({p.kind.replace('_', ' ')}) — {proposalSourceLine(p)}</span>
              <div style={small}>{proposalStateLine(p)} · proposed {fmtInstant(p.proposed_at)} by <Mono>{short(p.proposed_by)}</Mono> ({p.proposed_kind}){p.related_scenario_id ? <> · scenario <Mono>{short(p.related_scenario_id)}</Mono></> : null}</div>
              {p.state === 'open' && canResolve && p.proposed_by !== me ? (
                <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', alignItems: 'end' }}>
                  <Field id={`pr-note-${p.proposal_id}`} label="Resolution note (8+ characters)">{(id) => txt(id, notes[p.proposal_id] ?? '', (v) => setNotes({ ...notes, [p.proposal_id]: v }))}</Field>
                  {(['accepted', 'dismissed'] as const).map((res) => (
                    <GovernedButton key={res} label={res === 'accepted' ? 'Accept' : 'Dismiss'} pendingLabel="recording" variant={res === 'accepted' ? 'primary' : 'quiet'} disabled={(notes[p.proposal_id] ?? '').trim().length < 8} onRun={async () => {
                      const r = await sets.resolve(scope, p.proposal_id, res, (notes[p.proposal_id] ?? '').trim());
                      if (!r.ok || r.data === undefined) { const m = refusal(r, 'the resolution was refused'); setProblem(m); throw new Error(m); }
                      setReceipt(r.data.receipt); await load();
                    }} />
                  ))}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canPropose ? (
        <div style={{ marginBlockStart: 'var(--eye-space-8)' }}>
          <h3 style={h3}>Propose a scenario</h3>
          <div style={rowStyle}>
            <Field id="pp-kind" label="Source kind">{(id) => sel(id, kind, (v) => setKind(v as ProposalKind), [
              <option key="forecast_shift" value="forecast_shift">forecast shift — a forecast's median moved beyond a band</option>,
              <option key="weak_signal" value="weak_signal">weak signal — an escalated signal</option>,
              <option key="risk" value="risk">risk — an accepted exposure above appetite</option>,
              <option key="planning_cycle" value="planning_cycle">planning cycle — a cadence reset</option>])}</Field>
            <Field id="pp-source" label={`Source (${field})`}>{(id) => txt(id, sourceId, setSourceId)}</Field>
            {kind === 'forecast_shift' ? <Field id="pp-band" label="Band (a fraction of the earlier median)">{(id) => txt(id, band, setBand, 'number')}</Field> : null}
            <Field id="pp-title" label="Proposed scenario title">{(id) => txt(id, title, setTitle)}</Field>
          </div>
          <Field id="pp-rationale" label="Rationale (8+ characters)">{(id) => <textarea id={id} style={textareaStyle} value={rationale} onChange={(e) => setRationale(e.target.value)} />}</Field>
          <GovernedButton label="Propose" pendingLabel="proposing" disabled={title.trim().length < 4 || rationale.trim().length < 8 || sourceId.trim() === ''} onRun={async () => {
            setProblem(null);
            const source: Record<string, unknown> = { [field]: sourceId.trim(), ...(kind === 'forecast_shift' ? { band_pct: Number(band) } : {}) };
            const r = await sets.propose(scope, { kind, source, title: title.trim(), rationale: rationale.trim() });
            if (!r.ok || r.data === undefined) { const m = refusal(r, 'the proposal was refused'); setProblem(m); throw new Error(m); }
            setReceipt(r.data.receipt); setTitle(''); setRationale(''); setSourceId('');
            await load();
          }} />
        </div>
      ) : null}
      {problem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>{problem}</span></LiveStatus>}
      <Receipt receipt={receipt} />
    </section>
  );
}

export default function ScenarioSetsPage() {
  const { scope, me } = useShell();
  const roles = useMemo(() => new Set(me.bindings.filter((b) => b.domainId === scope.domainId || b.scope !== 'DOMAIN').map((b) => b.roleCode)), [me, scope.domainId]);
  const owns = ['strategy_owner', 'forecast_owner', 'decision_owner', 'domain_admin', 'platform_admin'].some((r) => roles.has(r));
  const [list, setList] = useState<SetRow[] | null>(null);
  const [chosen, setChosen] = useState<string>('');
  const [view, setView] = useState<SetView | null>(null);
  const [relevance, setRelevance] = useState<RelevanceRow[]>([]);
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioRow[]>([]);
  const [addScenario, setAddScenario] = useState('');
  const [addBranch, setAddBranch] = useState('');
  const [bindPackage, setBindPackage] = useState('');
  const [retireReason, setRetireReason] = useState('');
  const [removeReason, setRemoveReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);

  const loadList = async (pick?: string) => {
    const r = await sets.list(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'the sets could not be read'); return; }
    setList(r.data.sets);
    const id = pick ?? (chosen !== '' ? chosen : r.data.sets[0]?.set_id ?? '');
    setChosen(id);
  };
  const loadSet = async (id: string) => {
    if (id === '') { setView(null); setCmp(null); return; }
    const [a, b] = await Promise.all([sets.read(scope, id), sets.compare(scope, id)]);
    if (!a.ok || a.data === undefined) { setProblem(refusal(a, 'the set could not be read')); return; }
    setView(a.data.set); setRelevance(a.data.relevance);
    if (b.ok && b.data !== undefined) setCmp(b.data.comparison);
  };
  useEffect(() => { void loadList(); void prediction.listScenarios(scope).then((r) => { if (r.ok && r.data !== undefined) setScenarios(r.data.scenarios.filter((s) => s.state === 'active')); }); }, [scope.tenantId, scope.domainId]);
  useEffect(() => { void loadSet(chosen); }, [chosen]);
  const reload = async () => { await loadList(chosen); await loadSet(chosen); };
  const act = async (label: string, run: () => Promise<{ ok: boolean; status: number; data?: { receipt: ReceiptT } & Record<string, unknown>; error?: { code: string; message: string } }>) => {
    setProblem(null); setStatus(null);
    const r = await run();
    if (!r.ok || r.data === undefined) { const m = refusal(r, `${label} was refused`); setProblem(m); throw new Error(m); }
    setReceipt(r.data.receipt ?? null); setStatus(`${label} — recorded`);
    await reload();
  };

  if (list === null && problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (list === null) return <Empty>reading scenario sets…</Empty>;
  const scenarioOf = scenarios.find((s) => s.scenario_id === addScenario) ?? null;
  const plural = cmp?.plurality ?? null;

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Scenario sets</h1>
      <p style={muted}>A set of scenarios and branches a decision is weighed against. Its plurality policy names the kinds a recommendation must have seen; a package bound to a set is not proposed while the set is not plural.</p>
      <div style={rowStyle}>
        <Field id="set-choice" label="Scenario set">{(id) => sel(id, chosen, setChosen, [
          <option key="" value="">— choose a set —</option>,
          ...list.map((s) => <option key={s.set_id} value={s.set_id}>{s.title} · {s.state} · v{s.version}{s.last_check_outcome ? ` · ${s.last_check_outcome}` : ''}</option>)])}</Field>
      </div>
      {view === null ? (list.length === 0 ? <Empty>No scenario set has been declared.</Empty> : null) : (
        <section aria-labelledby="set-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="set-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>{view.title}</h2>
          <p>{view.purpose}</p>
          <dl>
            <DefinitionRow term="State"><StateMark state={view.state} /> · version <Mono>{String(view.version)}</Mono> · owner <Mono>{short(view.owner_principal_id)}</Mono>{view.retirement_reason ? <> — {view.retirement_reason}</> : null}</DefinitionRow>
            <DefinitionRow term="Plurality policy"><span aria-label="policy line">{policyLine(view.plurality_policy)}</span></DefinitionRow>
            <DefinitionRow term="Plurality verdict">
              {plural === null ? <span style={muted}>not read</span> : <strong aria-label="plurality verdict" style={{ color: plural.passed ? 'var(--eye-color-success)' : 'var(--eye-color-critical)' }}>{pluralityLine(plural)}</strong>}
              {plural !== null && plural.missing_kinds.length > 0 ? <div aria-label="missing kinds" style={small}>missing: {plural.missing_kinds.map((k) => <Mono key={k}>{k} </Mono>)}</div> : null}
              {view.checks[0] ? <div style={{ ...small, ...muted }}>last recorded check {fmtInstant(view.checks[0].as_of)} ({view.checks[0].trigger}) — {view.checks[0].outcome}{view.checks[0].item_id ? <> · the owner was tasked (item <Mono>{short(view.checks[0].item_id)}</Mono>)</> : null}</div> : null}
            </DefinitionRow>
            <DefinitionRow term="Bound packages">{view.bindings.length === 0 ? <span style={muted}>none — the set gates no recommendation yet</span>
              : <ul aria-label="bindings" style={{ margin: 0, paddingInlineStart: 'var(--eye-space-16)' }}>{view.bindings.map((b) => <li key={b.binding_id}>{b.package_title ?? short(b.package_id)} · {b.package_state} · v{b.current_version ?? '—'} · bound {fmtInstant(b.bound_at)}</li>)}</ul>}</DefinitionRow>
          </dl>
          {owns ? (
            <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap', alignItems: 'end' }}>
              {view.state === 'draft' ? <GovernedButton label="Activate the set" pendingLabel="activating" onRun={() => act('activation', () => sets.activate(scope, view.set_id) as never)} /> : null}
              {view.state === 'active' ? <GovernedButton label="Check plurality now" pendingLabel="checking" variant="quiet" onRun={() => act('the check', () => sets.check(scope, view.set_id) as never)} /> : null}
              {view.state === 'active' ? <>
                <Field id="bind-pkg" label="Bind to package (id)">{(id) => txt(id, bindPackage, setBindPackage)}</Field>
                <GovernedButton label="Bind" pendingLabel="binding" variant="quiet" disabled={bindPackage.trim() === ''} onRun={() => act('the binding', () => sets.bind(scope, view.set_id, bindPackage.trim()) as never)} />
              </> : null}
              {view.state !== 'retired' ? <>
                <Field id="retire-reason" label="Retirement reason (8+ characters)">{(id) => txt(id, retireReason, setRetireReason)}</Field>
                <GovernedButton label="Retire the set" pendingLabel="retiring" variant="critical" disabled={retireReason.trim().length < 8} onRun={() => act('the retirement', () => sets.retire(scope, view.set_id, retireReason.trim()) as never)} />
              </> : null}
            </div>
          ) : null}
          {problem !== null && <LiveStatus assertive><span style={{ color: 'var(--eye-color-critical)' }}>{problem}</span></LiveStatus>}
          {status !== null && <LiveStatus>{status}</LiveStatus>}
          <Receipt receipt={receipt} />

          <section aria-labelledby="mem-h" style={{ marginBlockStart: 'var(--eye-space-16)' }}>
            <h3 id="mem-h" style={h3}>Members</h3>
            <ScrollBox label="members">
              <table className="eye-table" style={tableStyle} aria-label="members">
                <thead><tr><Th>Scenario</Th><Th>Branch</Th><Th>Added</Th><Th>Removed</Th>{owns && view.state !== 'retired' ? <Th>Remove</Th> : null}</tr></thead>
                <tbody>{view.members.map((m) => (
                  <tr key={m.member_id}>
                    <Td>{m.scenario_title}{m.scenario_state !== 'active' ? <div style={{ ...small, color: 'var(--eye-color-critical)' }}>{m.scenario_state}</div> : null}</Td>
                    <Td>{m.branch_name ? <>{m.branch_name} (<Mono>{m.branch_kind ?? ''}</Mono>)</> : <span style={muted}>every live branch</span>}</Td>
                    <Td>{fmtInstant(m.added_at)} · v{m.added_in_version} · <Mono>{short(m.added_by)}</Mono></Td>
                    <Td>{m.removed_at === null ? '—' : <>{fmtInstant(m.removed_at)} · v{m.removed_in_version} — {m.removal_reason}</>}</Td>
                    {owns && view.state !== 'retired' ? <Td>{m.removed_at === null ? <GovernedButton label="Remove" pendingLabel="removing" variant="quiet" disabled={removeReason.trim().length < 8}
                      onRun={() => act('the removal', () => sets.removeMember(scope, view.set_id, m.member_id, removeReason.trim()) as never)} /> : null}</Td> : null}
                  </tr>))}</tbody>
              </table>
            </ScrollBox>
            {owns && view.state !== 'retired' ? (
              <div style={rowStyle}>
                <Field id="add-scn" label="Add a scenario">{(id) => sel(id, addScenario, (v) => { setAddScenario(v); setAddBranch(''); }, [
                  <option key="" value="">— an active scenario —</option>, ...scenarios.map((s) => <option key={s.scenario_id} value={s.scenario_id}>{s.title}</option>)])}</Field>
                <Field id="add-brn" label="Branch (optional: one branch only)">{(id) => sel(id, addBranch, setAddBranch, [
                  <option key="" value="">— every live branch —</option>, ...(scenarioOf?.branches ?? []).map((b) => <option key={b.branch_id} value={b.branch_id}>{b.name} · {b.kind}</option>)])}</Field>
                <div style={{ alignSelf: 'end' }}><GovernedButton label="Add the member" pendingLabel="adding" disabled={addScenario === ''} onRun={() => act('the member', () => sets.addMember(scope, view.set_id, addScenario, addBranch === '' ? null : addBranch) as never)} /></div>
                <Field id="rm-reason" label="Removal reason (8+ characters)">{(id) => txt(id, removeReason, setRemoveReason)}</Field>
              </div>
            ) : null}
          </section>
          {cmp === null ? null : <ComparisonTable c={cmp} />}
          {cmp === null ? null : <ReviewPanel scope={scope} set={view} c={cmp} onRecorded={reload} />}
          <RelevancePanel scope={scope} rows={relevance} canScore={['strategy_owner', 'forecast_owner', 'domain_admin', 'platform_admin'].some((r) => roles.has(r))} onScored={reload} />
        </section>
      )}
      {owns ? <DeclarePanel scope={scope} onDeclared={async (id) => { await loadList(id); }} /> : null}
      <ProposalsPanel scope={scope} me={me.principalId} canPropose={['strategy_owner', 'forecast_owner', 'decision_owner', 'executive', 'domain_analyst', 'domain_admin', 'platform_admin'].some((r) => roles.has(r))}
        canResolve={['strategy_owner', 'domain_admin', 'platform_admin'].some((r) => roles.has(r))} />
      <UnknownNote>The plurality verdict, the live-branch counts, the freshness of each indicator, the robustness and the regret are the server's.
        A suspended or closed branch is listed and not counted. A retirement a review proposes is still the scenario owner's review.</UnknownNote>
    </>
  );
}
