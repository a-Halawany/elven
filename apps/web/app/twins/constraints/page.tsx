'use client';
/**
 * CP-6 B29 §D (0092) — CONSTRAINTS: the domain's constraint sets (topology, conservation, business rules — declared, versioned and
 * retired by their STEWARD; another steward is refused by the server), the PLAN CHECK (a plan's quantities per key per day against the
 * current set versions — a violated plan is REFUSED with every violation named, an indeterminate check is never shown as a pass) and the
 * recorded checks, each reproducible against the set versions it pinned. The server decides every act; its refusal is shown verbatim.
 * Every number is SYNTHETIC.
 */
import { useEffect, useState } from 'react';
import { useShell } from '../layout';
import {
  constraints as api, CAPACITY_TEMPLATE, appliesLine, constraintLine, dailyTotals, outcomeLine, parseConstraints, parsePlan, pinsLine,
  type CheckRow, type SetRow, type Verdict,
} from '../../../lib/constraints';
import { Empty, LiveStatus, Mono, UnknownNote, cardStyle, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type R = { policyDecisionId: string; auditSeq: number };
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const W42 = ['2026-10-12, 1650', '2026-10-13, 1720', '2026-10-14, 2350', '2026-10-15, 1780', '2026-10-16, 1600'].join('\n');

function OutcomeMark({ o }: { o: { outcome: Verdict['outcome']; violations: Verdict['violations']; indeterminate_reason?: string | null; indeterminateReason?: string } }) {
  const l = outcomeLine(o);
  return <span style={{ color: `var(${l.token})`, fontWeight: 650 }}><span aria-hidden="true">{l.glyph}</span> {l.text}</span>;
}

/** One set: its current version's constraints; for its steward (or a domain administrator), a new version and the retirement. */
function SetCard({ s, canChange, onDone }: { s: SetRow; canChange: boolean; onDone: (line: string, receipt: R | null) => Promise<void> }) {
  const { scope } = useShell();
  const [text, setText] = useState(JSON.stringify(s.current?.constraints ?? [], null, 2));
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <article style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-8)' }} aria-label={`constraint set ${s.set_key}`}>
      <h3 style={{ fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 }}>{s.title} <Mono>{s.set_key}</Mono> {s.state === 'retired' ? <span>(retired)</span> : null}</h3>
      <p>Version {s.current_version} · steward <Mono>{s.steward_principal_id.slice(0, 8)}…</Mono> · digest <Mono title={s.current?.digest}>{(s.current?.digest ?? '').slice(0, 12)}…</Mono>
        {s.current === null ? null : <> · {s.current.note} ({fmtInstant(s.current.declared_at)})</>}</p>
      {s.state === 'retired' ? <p>Retired {fmtInstant(s.retired_at)} — {s.retire_reason}. Its versions stay readable; nothing is checked against it.</p> : null}
      <ul>{(s.current?.constraints ?? []).map((c) => <li key={c.key}>{constraintLine(c)} <span style={{ color: 'var(--eye-color-ink-muted)' }}>— checks {appliesLine(c)}</span></li>)}</ul>
      {canChange && s.state === 'live' ? (
        <details>
          <summary>New version or retirement</summary>
          <label>Constraints (JSON)<textarea style={{ ...textareaStyle, minBlockSize: '10rem' }} value={text} onChange={(e) => setText(e.target.value)} /></label>
          <label>Why this version (3+ characters)<input type="text" style={inputStyle} value={note} onChange={(e) => setNote(e.target.value)} /></label>
          {problem === null ? null : <LiveStatus assertive>{problem}</LiveStatus>}
          <GovernedButton label={`Declare version ${s.current_version + 1}`} pendingLabel="versioning" disabled={note.trim().length < 3} onRun={async () => {
            const c = parseConstraints(text);
            if (!c.ok) { setProblem(c.problem); throw new Error(c.problem); }
            const r = await api.version(scope, s.set_id, { expectedVersion: s.current_version, constraints: c.value, note: note.trim() });
            if (!r.ok || r.data === undefined) { const m = refusal(r, 'the version was not answered'); setProblem(`not versioned — ${m}`); throw new Error(m); }
            setProblem(null); setNote('');
            await onDone(`${s.set_key} is at version ${String(r.data.set['version'])}`, r.data.receipt);
          }} />
          <label>Retire — why (8+ characters)<input type="text" style={inputStyle} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <GovernedButton variant="critical" label={`Retire ${s.set_key}`} pendingLabel="retiring" disabled={reason.trim().length < 8} onRun={async () => {
            const r = await api.retire(scope, s.set_id, reason.trim());
            if (!r.ok || r.data === undefined) { const m = refusal(r, 'the retirement was not answered'); setProblem(`not retired — ${m}`); throw new Error(m); }
            await onDone(`${s.set_key} retired`, r.data.receipt);
          }} />
        </details>
      ) : null}
    </article>
  );
}

export default function ConstraintsPage() {
  const { scope, me, isSimulationOperator, isTwinOwner, isStrategyOwner } = useShell();
  /* who may act — the server decides (the PDP rows; the port's stewardship); these flags only show the controls */
  const holds = (role: string) => me.bindings.some((b) => (b.roleCode === role && ((b.scope === 'DOMAIN' && b.domainId === scope.domainId) || b.scope === 'TENANT')) || (b.roleCode === 'platform_admin' && b.scope === 'PLATFORM'));
  const isAdmin = holds('domain_admin');
  const isSteward = holds('constraint_steward') || isAdmin;
  const canCheck = isSteward || isSimulationOperator || isTwinOwner || isStrategyOwner || holds('decision_owner');
  const [sets, setSets] = useState<SetRow[] | null>(null);
  const [checks, setChecks] = useState<CheckRow[]>([]);
  const [showRetired, setShowRetired] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<R | null>(null);
  /* declare */
  const [setKey, setSetKey] = useState('regensburg-capacity');
  const [title, setTitle] = useState('Regensburg warehouse capacity');
  const [declText, setDeclText] = useState(JSON.stringify(CAPACITY_TEMPLATE, null, 2));
  const [declNote, setDeclNote] = useState('the inbound dock takes at most 1800 pallets a day');
  const [declProblem, setDeclProblem] = useState<string | null>(null);
  /* the plan check */
  const [planKey, setPlanKey] = useState('replenishment-w42');
  const [qKey, setQKey] = useState('warehouse:regensburg.pallets');
  const [qUnit, setQUnit] = useState('pallets');
  const [planText, setPlanText] = useState(W42);
  const [checkSets, setCheckSets] = useState<string[]>([]);
  const [answer, setAnswer] = useState<{ check: CheckRow | null; verdict: Verdict | null; line: string } | null>(null);
  const [reproduction, setReproduction] = useState<string | null>(null);

  const load = async () => {
    const [s, c] = await Promise.all([api.sets(scope, showRetired ? null : 'live'), api.checks(scope, { limit: 20 })]);
    if (!s.ok || s.data === undefined) { setProblem(refusal(s, 'the constraint sets were not answered')); return; }
    setProblem(null);
    setSets(s.data.sets);
    if (c.ok && c.data !== undefined) setChecks(c.data.checks);
  };
  useEffect(() => { void load(); }, [scope, showRetired]);
  const after = async (line: string, r: R | null) => { setLast(line); setReceipt(r); await load(); };

  const parsed = parsePlan(planText, { key: qKey.trim(), unit: qUnit.trim() });
  const totals = parsed.ok ? dailyTotals(parsed.quantities, qKey.trim()) : [];
  const live = (sets ?? []).filter((s) => s.state === 'live');

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Constraints</h1>
      <UnknownNote><strong>Every number on this screen is SYNTHETIC.</strong> A constraint set is declared by its steward; a plan is checked against the
        current versions and REFUSED when it violates one. An indeterminate check — a missing input, an evaluation over its time budget — is never a pass.</UnknownNote>
      {problem === null ? null : <LiveStatus assertive>{problem}</LiveStatus>}
      {last === null ? null : <LiveStatus>{last}</LiveStatus>}
      <Receipt receipt={receipt} />

      <section aria-labelledby="sets-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="sets-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Constraint sets</h2>
        <label><input type="checkbox" checked={showRetired} onChange={(e) => setShowRetired(e.target.checked)} /> show retired sets</label>
        {sets === null ? <Empty>loading…</Empty> : sets.length === 0 ? <Empty>this domain declares no constraint set — a check of every live set is vacuously satisfied</Empty>
          : sets.map((s) => <SetCard key={s.set_id} s={s} canChange={s.steward_principal_id === me.principalId || isAdmin} onDone={after} />)}
        {isSteward ? (
          <details style={{ marginBlockStart: 'var(--eye-space-12)' }}>
            <summary>Declare a set</summary>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--eye-space-8)' }}>
              <label>Key<input type="text" style={inputStyle} value={setKey} onChange={(e) => setSetKey(e.target.value)} /></label>
              <label>Title<input type="text" style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} /></label>
              <label>Why (3+ characters)<input type="text" style={inputStyle} value={declNote} onChange={(e) => setDeclNote(e.target.value)} /></label>
            </div>
            <label>Constraints (JSON — topology, conservation or business_rule)<textarea style={{ ...textareaStyle, minBlockSize: '10rem' }} value={declText} onChange={(e) => setDeclText(e.target.value)} /></label>
            {declProblem === null ? null : <LiveStatus assertive>{declProblem}</LiveStatus>}
            <GovernedButton label="Declare" pendingLabel="declaring" disabled={setKey.trim() === '' || title.trim() === '' || declNote.trim().length < 3} onRun={async () => {
              const c = parseConstraints(declText);
              if (!c.ok) { setDeclProblem(c.problem); throw new Error(c.problem); }
              const r = await api.declare(scope, { setKey: setKey.trim(), title: title.trim(), constraints: c.value, note: declNote.trim() });
              if (!r.ok || r.data === undefined) { const m = refusal(r, 'the declaration was not answered'); setDeclProblem(`not declared — ${m}`); throw new Error(m); }
              setDeclProblem(null);
              await after(`${String(r.data.set['set_key'])} declared (version 1)`, r.data.receipt);
            }} />
          </details>
        ) : null}
      </section>

      {canCheck ? (
        <section aria-labelledby="check-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
          <h2 id="check-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Check a plan</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 'var(--eye-space-8)' }}>
            <label>Plan<input type="text" style={inputStyle} value={planKey} onChange={(e) => setPlanKey(e.target.value)} /></label>
            <label>Quantity key<input type="text" style={inputStyle} value={qKey} onChange={(e) => setQKey(e.target.value)} /></label>
            <label>Unit<input type="text" style={inputStyle} value={qUnit} onChange={(e) => setQUnit(e.target.value)} /></label>
            <label>Against<select multiple style={{ ...inputStyle, blockSize: 'auto' }} value={checkSets} onChange={(e) => setCheckSets([...e.target.selectedOptions].map((o) => o.value))}>
              {live.map((s) => <option key={s.set_id} value={s.set_key}>{s.set_key} v{s.current_version}</option>)}
            </select></label>
          </div>
          <p>{checkSets.length === 0 ? 'Checked against every live set.' : `Checked against ${checkSets.join(', ')}.`}</p>
          <label>Quantities — one per line, <Mono>date, value</Mono> (or <Mono>key, date, value, unit</Mono>)<textarea style={{ ...textareaStyle, minBlockSize: '8rem' }} value={planText} onChange={(e) => setPlanText(e.target.value)} /></label>
          {parsed.ok ? (
            <table style={tableStyle} aria-label="daily totals">
              <thead><tr><Th>Day</Th><Th>{qKey} ({qUnit})</Th></tr></thead>
              <tbody>{totals.map(([d, v]) => <tr key={d}><Td>{d}</Td><Td mono>{v}</Td></tr>)}</tbody>
            </table>
          ) : <LiveStatus assertive>{parsed.problem}</LiveStatus>}
          <GovernedButton label="Check the plan" pendingLabel="checking" disabled={!parsed.ok || planKey.trim() === ''} onRun={async () => {
            if (!parsed.ok) return;
            setReproduction(null);
            const r = await api.check(scope, { planKey: planKey.trim(), quantities: parsed.quantities, ...(checkSets.length === 0 ? {} : { setKeys: checkSets }) });
            if (r.ok && r.data !== undefined) {
              setAnswer({ check: r.data.check, verdict: r.data.verdict, line: `${planKey.trim()}: satisfied` });
              await after(`${planKey.trim()} checked — satisfied`, r.data.receipt);
              return;
            }
            /* 422 (the plan refused) and 409 (indeterminate) are recorded checks: the server's words, then the record itself */
            const said = refusal(r, 'the check was not answered');
            const rec = r.status === 422 || r.status === 409 ? await api.checks(scope, { subjectRef: planKey.trim(), limit: 1 }) : null;
            const check = rec !== null && rec.ok && rec.data !== undefined ? rec.data.checks[0] ?? null : null;
            setAnswer({ check, verdict: null, line: said });
            await after(r.status === 422 ? `${planKey.trim()} REFUSED` : r.status === 409 ? `${planKey.trim()} not judged (indeterminate)` : `${planKey.trim()} not checked`, null);
          }} />
          {answer === null ? null : (
            <div style={{ marginBlockStart: 'var(--eye-space-12)' }} aria-live="polite">
              <p><Mono>{answer.line}</Mono></p>
              {answer.check === null ? null : (
                <>
                  <p><OutcomeMark o={answer.check} /></p>
                  <p>Against {pinsLine(answer.check.sets)} · {answer.check.elapsed_ms} ms of {answer.check.budget_ms} ms · check <Mono>{answer.check.check_id.slice(0, 8)}…</Mono></p>
                  {answer.check.violations.length === 0 ? null : (
                    <table style={tableStyle} aria-label="violations">
                      <thead><tr><Th>Constraint</Th><Th>Bound</Th><Th>The plan has</Th><Th>In words</Th></tr></thead>
                      <tbody>{answer.check.violations.map((v, i) => (
                        <tr key={i}><Td mono>{v.constraintKey}</Td><Td>{v.bound}</Td><Td>{v.observed}</Td><Td>{v.message}</Td></tr>))}
                      </tbody>
                    </table>
                  )}
                </>
              )}
            </div>
          )}
        </section>
      ) : null}

      <section aria-labelledby="checks-h" style={{ ...cardStyle, marginBlockStart: 'var(--eye-space-16)' }}>
        <h2 id="checks-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Recorded plan checks</h2>
        {reproduction === null ? null : <LiveStatus>{reproduction}</LiveStatus>}
        {checks.length === 0 ? <Empty>no plan has been checked in this domain</Empty> : (
          <table style={tableStyle}>
            <thead><tr><Th>Plan</Th><Th>Outcome</Th><Th>Against</Th><Th>When</Th><Th>Reproduce</Th></tr></thead>
            <tbody>{checks.map((c) => (
              <tr key={c.check_id}>
                <Td mono>{c.subject_ref}</Td><Td><OutcomeMark o={c} /></Td><Td>{pinsLine(c.sets)}</Td><Td>{fmtInstant(c.checked_at)}{c.checked_via === 'gate' ? ' (gate)' : ''}</Td>
                <Td><GovernedButton variant="quiet" label="Reproduce" pendingLabel="re-deriving" onRun={async () => {
                  const r = await api.reproduce(scope, c.check_id);
                  if (!r.ok || r.data === undefined) { const m = refusal(r, 'the reproduction was not answered'); setReproduction(m); throw new Error(m); }
                  const x = r.data.reproduction;
                  setReproduction(!x.reproducible ? `${c.subject_ref}: not reproducible — ${x.reason ?? ''}`
                    : `${c.subject_ref}: re-derived against ${pinsLine(x.rederived?.sets ?? [])} — ${x.matches === true ? 'the same verdict' : `a different verdict (${x.note ?? ''})`}`
                      + `${(x.current_versions ?? []).length === 0 ? '' : `; the sets now stand at ${(x.current_versions ?? []).map((v) => `${v.set_key} v${v.version}`).join(', ')}`}`);
                }} /></Td>
              </tr>))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
