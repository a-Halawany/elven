'use client';
/**
 * EXPLANATIONS — the unified explanation surface (CP-6 B35 part `explanation`, 0101 §E; F-P6-03: App. L, AI-04-001..004, AI-63-005,
 * AI-64-002..004, AG-040, AR-019, V10-T-007/-008).
 *
 * A subject (a package version, an option, a forecast, a run; a recommendation or an analysis when those parts are installed) with the
 * explanation the SERVER generated from its preserved state: the read-time state (current, stale — the subject moved —, superseded;
 * contested, corrected), the conclusion, the four uncertainty questions kept apart (likelihood | impact | confidence | evidence quality) and
 * the disagreement, the items separated by category, the counter-evidence and the competing hypotheses, the App. L contract field by field,
 * the renderings with their faithfulness, and every contest or appeal case on it (for a forecast, also on its source). A named human (or the
 * decision agent, which renders only) renders it — the preview runs the faithfulness check v1, the server decides. A person with standing
 * opens a case; the bench assigns an adjudicator; the adjudicator adjudicates and closes; the appellant may withdraw. Every refusal is shown
 * as the server states it. Deep link: ?kind=<subject kind>&id=<uuid>&version=<n>.
 */
import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useShell } from '../layout';
import {
  explanationB35 as api, APPEAL_SUBJECT_KINDS, EXPLANATION_SUBJECT_KINDS, caseLine, categoryMark, checkFaithfulness, contractLine, effectLine, groupByCategory, instantOf, parseSentences, statusLine,
  type AppealCase, type AppealSubjectKind, type Explanation, type ExplanationSubjectKind, type Surface,
} from '../../../lib/explanation-b35';
import { Empty, LiveStatus, Mono, cardStyle, GovernedButton, fmtInstant, textareaStyle } from '../../../components/observation';
import { inputStyle, Receipt } from '../../../components/ui';

type Row = Record<string, unknown>;
type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const small = { fontSize: 'var(--eye-type-label-sm)' } as const;
const muted = { ...small, color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const h2 = { fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 0 } as const;
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : v === null || v === undefined || v === '' ? '—' : String(v));
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
const words = (v: unknown) => (typeof v === 'string' ? v.replace(/_/g, ' ') : '—');
const appealKindFor = (k: ExplanationSubjectKind): AppealSubjectKind | null => (k === 'package_version' ? 'package' : k === 'forecast' ? 'forecast' : k === 'recommendation' ? 'recommendation' : null);

function Uncertainty({ x }: { x: Explanation }) {
  const u = x.uncertainty;
  const box = (title: string, v: Row) => (
    <div style={{ ...cardStyle, padding: 'var(--eye-space-8)' }}>
      <h4 style={{ margin: 0, fontSize: 'var(--eye-type-label-md)' }}>{title}</h4>
      <p style={small}>{words(v['kind'] ?? v['level'] ?? v['grade'])}{typeof v['statement'] === 'string' ? ` — ${String(v['statement'])}` : ''}</p>
    </div>
  );
  return (
    <section aria-label="uncertainty, the questions kept apart" style={{ display: 'grid', gap: 'var(--eye-space-8)', gridTemplateColumns: 'repeat(auto-fit, minmax(12rem, 1fr))' }}>
      {box('Likelihood', u.likelihood)}{box('Impact', u.impact)}{box('Confidence (what the method claims)', u.confidence)}{box('Evidence quality (where the inputs come from)', u.evidence_quality)}
      <div style={{ ...cardStyle, padding: 'var(--eye-space-8)' }}><h4 style={{ margin: 0, fontSize: 'var(--eye-type-label-md)' }}>Disagreement</h4>
        <p style={small}>{Object.entries(u.disagreement).map(([k, v]) => `${words(k)}: ${String(v)}`).join(' · ')}</p></div>
    </section>
  );
}

function RenderForm({ x, onDone }: { x: Explanation; onDone: (r: ReceiptT) => void }) {
  const { scope } = useShell();
  const [role, setRole] = useState('executive');
  const [language, setLanguage] = useState('en');
  const [text, setText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const sentences = parseSentences(text);
  const preview = checkFaithfulness(x.items, sentences);
  return (
    <section aria-labelledby={`render-${x.explanation_id}`} style={{ display: 'grid', gap: 'var(--eye-space-8)', maxInlineSize: '48rem' }}>
      <h3 id={`render-${x.explanation_id}`} style={{ margin: 0, fontSize: 'var(--eye-type-label-md)' }}>Render for an audience</h3>
      <label htmlFor="render-role">Audience role</label>
      <input id="render-role" style={inputStyle} value={role} onChange={(e) => setRole(e.target.value)} />
      <label htmlFor="render-language">Language</label>
      <input id="render-language" style={inputStyle} value={language} onChange={(e) => setLanguage(e.target.value)} />
      <label htmlFor="render-sentences">Sentences — one per line, each ending with the items it cites, e.g. "The corridor forecast is unvalidated. [I2, I5]"</label>
      <textarea id="render-sentences" rows={6} style={textareaStyle} value={text} onChange={(e) => setText(e.target.value)} />
      <p style={small} aria-live="polite">{sentences.length === 0 ? 'No sentence yet.' : preview.faithful ? 'Preview: FAITHFUL under check v1 (the server decides).' : `Preview: UNFAITHFUL — ${preview.findings.map((f) => `${f.sentence === null ? '' : `sentence ${f.sentence} `}${f.rule}`).join('; ')}`}</p>
      {problem !== null && <p role="alert" style={critical}>{problem}</p>}
      <GovernedButton label="Record the rendering" pendingLabel="checking" disabled={sentences.length === 0 || role.trim().length < 2 || language.trim().length < 2}
        onRun={async () => {
          const r = await api.render(scope, x.explanation_id, { role: role.trim(), language: language.trim() }, sentences);
          if (!r.ok || r.data === undefined) { setProblem(`Rendering refused — ${refusal(r, 'no answer')}`); return; }
          setProblem(null); setText(''); onDone(r.data.receipt);
        }} />
    </section>
  );
}

function OpenCase({ kind, subjectId, subjectVersion, explanationId, onDone }: { kind: AppealSubjectKind; subjectId: string; subjectVersion: number | null; explanationId: string | null; onDone: (r: ReceiptT) => void }) {
  const { scope } = useShell();
  const [subjectKind, setSubjectKind] = useState<AppealSubjectKind>(kind);
  const [target, setTarget] = useState(subjectId);
  const [statement, setStatement] = useState('');
  const [items, setItems] = useState('');
  const [grounds, setGrounds] = useState('');
  const [deadline, setDeadline] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  return (
    <section aria-labelledby="open-case" style={{ display: 'grid', gap: 'var(--eye-space-8)', maxInlineSize: '48rem' }}>
      <h3 id="open-case" style={{ margin: 0, fontSize: 'var(--eye-type-label-md)' }}>Contest it — open a case</h3>
      <label htmlFor="case-kind">What is contested</label>
      <select id="case-kind" style={inputStyle} value={subjectKind} onChange={(e) => setSubjectKind(e.target.value as AppealSubjectKind)}>{APPEAL_SUBJECT_KINDS.map((k) => <option key={k} value={k}>{words(k)}</option>)}</select>
      <label htmlFor="case-subject">Its id (the subject, its source, or this explanation)</label>
      <input id="case-subject" style={{ ...inputStyle, inlineSize: '100%' }} value={target} onChange={(e) => setTarget(e.target.value.trim())} />
      <label htmlFor="case-scope">Scope — what exactly is contested</label>
      <input id="case-scope" style={{ ...inputStyle, inlineSize: '100%' }} value={statement} onChange={(e) => setStatement(e.target.value)} />
      <label htmlFor="case-items">Contested explanation items (optional, e.g. I2, I4)</label>
      <input id="case-items" style={inputStyle} value={items} onChange={(e) => setItems(e.target.value)} />
      <label htmlFor="case-grounds">Grounds (16+ characters)</label>
      <textarea id="case-grounds" rows={3} style={textareaStyle} value={grounds} onChange={(e) => setGrounds(e.target.value)} />
      <label htmlFor="case-deadline">Response deadline (empty: 14 days)</label>
      <input id="case-deadline" type="datetime-local" style={inputStyle} value={deadline} onChange={(e) => setDeadline(e.target.value)} />
      {problem !== null && <p role="alert" style={critical}>{problem}</p>}
      <GovernedButton label="Open the case" pendingLabel="opening" disabled={statement.trim().length < 8 || grounds.trim().length < 16 || target === ''}
        onRun={async () => {
          const itemIds = items.split(/[,\s]+/).map((v) => v.trim()).filter((v) => v.length > 0);
          const r = await api.openAppeal(scope, { subjectKind, subjectId: target, subjectVersion: subjectKind === kind && target === subjectId ? subjectVersion : null,
            explanationId, scope: itemIds.length > 0 ? { statement, items: itemIds } : { statement }, grounds, deadlineAt: instantOf(deadline) });
          if (!r.ok || r.data === undefined) { setProblem(`The case was refused — ${refusal(r, 'no answer')}`); return; }
          setProblem(null); setStatement(''); setGrounds(''); setItems(''); onDone(r.data.receipt);
        }} />
      <p style={muted}>Standing v1: a room member, a holder of a role the rule names for this kind, or the auditor. The subject is never altered by a case.</p>
    </section>
  );
}

function CaseCard({ c, onDone }: { c: AppealCase; onDone: (r: ReceiptT) => void }) {
  const { scope, me, isAuthority, isExecutive, isAuditor } = useShell();
  const [adjudicator, setAdjudicator] = useState('');
  const [outcome, setOutcome] = useState<'upheld' | 'dismissed' | 'partly_upheld'>('upheld');
  const [rationale, setRationale] = useState('');
  const [correction, setCorrection] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const mine = me.principalId;
  const open = c.state === 'opened' || c.state === 'under_review';
  const canAssign = open && (isAuthority || isExecutive || isAuditor) && mine !== c.appellant_principal_id && !c.subject_owners.includes(mine);
  const canAdjudicate = c.state === 'under_review' && c.adjudicator_principal_id === mine;
  const canClose = (c.state === 'adjudicated' && c.adjudicator_principal_id === mine) || (open && c.appellant_principal_id === mine);
  const run = async (what: string, f: () => ReturnType<typeof api.close>) => {
    const r = await f();
    if (!r.ok || r.data === undefined) { setProblem(`${what} refused — ${refusal(r, 'no answer')}`); return; }
    setProblem(null); onDone(r.data.receipt);
  };
  return (
    <li style={{ ...cardStyle, listStyle: 'none', marginBlockEnd: 'var(--eye-space-8)' }} aria-label={`case ${c.case_id}`}>
      <p style={{ margin: 0 }}><strong>{words(c.subject_kind)}</strong> — {c.subject_title} · <strong>{caseLine(c)}</strong>{c.overdue ? <strong style={critical}> ⚑</strong> : null}</p>
      <p style={small}>Scope: {c.contest_scope.statement}{Array.isArray(c.contest_scope['items']) && (c.contest_scope['items'] as string[]).length > 0 ? ` (items ${(c.contest_scope['items'] as string[]).join(', ')})` : ''} · grounds: {c.grounds}</p>
      <p style={muted}>appellant <Mono>{short(c.appellant_principal_id)}</Mono> ({c.standing.basis}) · adjudicator {c.adjudicator_principal_id === null ? 'not assigned' : <Mono>{short(c.adjudicator_principal_id)}</Mono>} · opened {fmtInstant(c.opened_at)}{c.decided ? ' · a DECIDED subject' : ''}</p>
      {c.outcome !== null ? <p style={small}><strong>{words(c.outcome).toUpperCase()}</strong>: {c.rationale}{c.correction !== null ? ` — correction: ${c.correction}` : ''} · <strong>{effectLine(c.effect)}</strong></p> : null}
      {c.closure_note !== null ? <p style={muted}>Closed: {c.closure_note}</p> : null}
      {problem !== null && <p role="alert" style={critical}>{problem}</p>}
      {canAssign ? (<div style={{ display: 'grid', gap: 'var(--eye-space-4)', maxInlineSize: '40rem' }}>
        <label htmlFor={`adj-${c.case_id}`}>Adjudicator (a principal id of the bench; neither the appellant nor a subject owner)</label>
        <input id={`adj-${c.case_id}`} style={inputStyle} value={adjudicator} onChange={(e) => setAdjudicator(e.target.value.trim())} />
        <GovernedButton label="Assign the adjudicator" pendingLabel="assigning" variant="quiet" disabled={adjudicator === ''} onRun={() => run('The assignment', () => api.assign(scope, c.case_id, adjudicator))} />
      </div>) : null}
      {canAdjudicate ? (<div style={{ display: 'grid', gap: 'var(--eye-space-4)', maxInlineSize: '40rem' }}>
        <label htmlFor={`out-${c.case_id}`}>Outcome</label>
        <select id={`out-${c.case_id}`} style={inputStyle} value={outcome} onChange={(e) => setOutcome(e.target.value as typeof outcome)}>
          <option value="upheld">Upheld</option><option value="partly_upheld">Partly upheld</option><option value="dismissed">Dismissed</option></select>
        <label htmlFor={`rat-${c.case_id}`}>Rationale (16+ characters)</label>
        <textarea id={`rat-${c.case_id}`} rows={2} style={textareaStyle} value={rationale} onChange={(e) => setRationale(e.target.value)} />
        {outcome !== 'dismissed' ? (<><label htmlFor={`cor-${c.case_id}`}>Correction and the owning layer that makes it</label>
          <input id={`cor-${c.case_id}`} style={{ ...inputStyle, inlineSize: '100%' }} value={correction} onChange={(e) => setCorrection(e.target.value)} /></>) : null}
        <GovernedButton label="Record the adjudication" pendingLabel="recording" disabled={rationale.trim().length < 16 || (outcome !== 'dismissed' && correction.trim().length < 8)}
          onRun={() => run('The adjudication', () => api.adjudicate(scope, c.case_id, outcome, rationale, outcome === 'dismissed' ? null : correction))} />
      </div>) : null}
      {canClose ? (<div style={{ display: 'grid', gap: 'var(--eye-space-4)', maxInlineSize: '40rem' }}>
        <label htmlFor={`note-${c.case_id}`}>{c.state === 'adjudicated' ? 'Closure note (the outcome is notified)' : 'Why you withdraw the case'}</label>
        <input id={`note-${c.case_id}`} style={{ ...inputStyle, inlineSize: '100%' }} value={note} onChange={(e) => setNote(e.target.value)} />
        <GovernedButton label={c.state === 'adjudicated' ? 'Close the case' : 'Withdraw the case'} pendingLabel="closing" variant="quiet" disabled={note.trim().length < 8} onRun={() => run('The closure', () => api.close(scope, c.case_id, note))} />
      </div>) : null}
    </li>
  );
}

function ExplanationView({ x, onDone }: { x: Explanation; onDone: (r: ReceiptT) => void }) {
  const counter = x.items.filter((i) => x.counter_evidence.includes(i.id));
  const competing = x.items.filter((i) => x.competing_hypotheses.includes(i.id));
  return (
    <section aria-labelledby="the-explanation" style={{ ...cardStyle, display: 'grid', gap: 'var(--eye-space-12)' }}>
      <h2 id="the-explanation" style={h2}>Explanation v{x.explanation_version} — {x.subject_title}</h2>
      <p style={x.status.state === 'current' ? small : { ...small, ...critical }}><strong>{statusLine(x.status)}</strong></p>
      {x.status.stale_reason !== null ? <p role="note" style={{ ...small, ...critical }}>{x.status.stale_reason}</p> : null}
      <p style={muted}>generated by the server ({x.generator}) at {fmtInstant(x.generated_at)} on the request of <Mono>{short(x.generated_by)}</Mono> · integrity <Mono>{x.integrity_digest.slice(0, 16)}…</Mono> · subject state <Mono>{x.subject_digest.slice(0, 16)}…</Mono></p>
      <p><strong>Conclusion:</strong> {String(x.conclusion['statement'] ?? '—')}</p>
      <Uncertainty x={x} />
      {groupByCategory(x.items).map((g) => (
        <section key={g.category} aria-label={categoryMark(g.category).text}>
          <h3 style={{ margin: 0, fontSize: 'var(--eye-type-label-md)' }}>{categoryMark(g.category).glyph} {categoryMark(g.category).text} ({g.items.length})</h3>
          {g.items.length === 0 ? <p style={muted}>none in this explanation</p> : (
            <ul style={small}>{g.items.map((i) => <li key={i.id}><Mono>{i.id}</Mono> [{words(i.role)}]{i.material ? <strong> MATERIAL</strong> : null} {i.statement}</li>)}</ul>)}
        </section>
      ))}
      <section aria-label="counter-evidence"><h3 style={{ margin: 0, fontSize: 'var(--eye-type-label-md)' }}>Counter-evidence and dissent ({counter.length})</h3>
        {counter.length === 0 ? <p style={muted}>none recorded</p> : <ul style={small}>{counter.map((i) => <li key={i.id}><Mono>{i.id}</Mono> {i.statement}</li>)}</ul>}</section>
      <section aria-label="competing hypotheses"><h3 style={{ margin: 0, fontSize: 'var(--eye-type-label-md)' }}>Competing hypotheses ({competing.length})</h3>
        {competing.length === 0 ? <p style={muted}>none recorded</p> : <ul style={small}>{competing.map((i) => <li key={i.id}><Mono>{i.id}</Mono> {i.statement}</li>)}</ul>}</section>
      <details><summary>The App. L contract, field by field</summary>
        <ul style={small}>{Object.entries(x.contract).map(([k, v]) => <li key={k}><strong>{words(k)}</strong>: {contractLine(v)}</li>)}</ul></details>
      <section aria-label="renderings"><h3 style={{ margin: 0, fontSize: 'var(--eye-type-label-md)' }}>Renderings ({x.renderings?.length ?? 0})</h3>
        {(x.renderings ?? []).length === 0 ? <p style={muted}>no rendering yet — the structured explanation is authoritative</p> : (
          <ul style={small}>{(x.renderings ?? []).map((r) => (
            <li key={r.rendering_id}><strong>{r.state === 'withdrawn' ? 'WITHDRAWN — UNFAITHFUL' : 'FAITHFUL'}</strong> · for {r.audience.role} ({r.audience.language}) by {r.renderer_kind === 'agent' ? 'the decision agent (renders only)' : 'a named human'} · {fmtInstant(r.rendered_at)}
              <ol>{r.sentences.map((s, k) => <li key={k}>{s.text} <Mono>[{s.cites.join(', ')}]</Mono></li>)}</ol></li>))}</ul>)}</section>
      {x.status.state === 'current' ? <RenderForm x={x} onDone={onDone} /> : <p style={muted}>A stale or superseded explanation is not rendered: generate it again.</p>}
    </section>
  );
}

function Explanations() {
  const { scope } = useShell();
  const params = useSearchParams();
  const [kind, setKind] = useState<ExplanationSubjectKind>((EXPLANATION_SUBJECT_KINDS as readonly string[]).includes(params.get('kind') ?? '') ? (params.get('kind') as ExplanationSubjectKind) : 'package_version');
  const [subjectId, setSubjectId] = useState(params.get('id') ?? '');
  const [version, setVersion] = useState(params.get('version') ?? '');
  const [surface, setSurface] = useState<Surface | null>(null);
  const [cases, setCases] = useState<AppealCase[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT>(null);
  const v = version.trim() === '' ? null : Number(version);
  const loadCases = async () => {
    const r = await api.appeals(scope);
    if (r.ok && r.data !== undefined) setCases(r.data.cases);
  };
  const load = async () => {
    if (subjectId === '') { setSurface(null); return; }
    const r = await api.surface(scope, kind, subjectId, v);
    if (!r.ok || r.data === undefined) { setSurface(null); setProblem(refusal(r, 'the explanation surface could not be read')); return; }
    setProblem(null); setSurface(r.data.surface);
  };
  useEffect(() => { void load(); void loadCases(); }, [scope]);
  const done = (r: ReceiptT) => { setReceipt(r); void load(); void loadCases(); };
  const x = surface?.explanation ?? null;
  const caseKind = appealKindFor(kind);
  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Explanations</h1>
      <p style={muted}>The governed explanation of a decision product, generated by the server from its preserved state — never free text — with its renderings and every contest or appeal on it. A rendering stands only when every sentence cites the items it rests on.</p>
      <section aria-labelledby="pick" style={{ ...cardStyle, display: 'grid', gap: 'var(--eye-space-8)', maxInlineSize: '48rem' }}>
        <h2 id="pick" style={h2}>The subject</h2>
        <label htmlFor="subject-kind">Kind</label>
        <select id="subject-kind" style={inputStyle} value={kind} onChange={(e) => setKind(e.target.value as ExplanationSubjectKind)}>{EXPLANATION_SUBJECT_KINDS.map((k) => <option key={k} value={k}>{words(k)}</option>)}</select>
        <label htmlFor="subject-id">Id</label>
        <input id="subject-id" style={{ ...inputStyle, inlineSize: '100%' }} value={subjectId} onChange={(e) => setSubjectId(e.target.value.trim())} />
        <label htmlFor="subject-version">Version (a package version or an analysis)</label>
        <input id="subject-version" style={inputStyle} inputMode="numeric" value={version} onChange={(e) => setVersion(e.target.value)} />
        <div style={{ display: 'flex', gap: 'var(--eye-space-8)', flexWrap: 'wrap' }}>
          <GovernedButton label="Read the explanation" pendingLabel="reading" variant="quiet" disabled={subjectId === ''} onRun={load} />
          <GovernedButton label="Generate the explanation" pendingLabel="generating" disabled={subjectId === ''}
            onRun={async () => {
              const r = await api.generate(scope, kind, subjectId, v);
              if (!r.ok || r.data === undefined) { setProblem(`Generation refused — ${refusal(r, 'no answer')}`); return; }
              setProblem(null); setReceipt(r.data.receipt); await load();
            }} />
        </div>
      </section>
      {problem !== null ? <LiveStatus assertive><span style={critical}>{problem}</span></LiveStatus> : null}
      {surface !== null ? (
        <>
          <p style={small}>Subject now: <strong>{String(surface.subject?.['title'] ?? '—')}</strong> · state {String(surface.subject?.['state'] ?? '—')} · digest <Mono>{String(surface.subject?.['digest'] ?? '—').slice(0, 16)}…</Mono>{surface.versions.length > 1 ? ` · ${surface.versions.length} explanation versions` : ''}</p>
          {x === null ? <Empty>No explanation is generated for this subject yet.</Empty> : <ExplanationView x={x} onDone={done} />}
          <section aria-labelledby="subject-cases" style={cardStyle}>
            <h2 id="subject-cases" style={h2}>Cases on this subject ({surface.cases.length})</h2>
            {surface.cases.length === 0 ? <p style={muted}>no case</p> : <ul style={{ paddingInlineStart: 0 }}>{surface.cases.map((c) => <CaseCard key={c.case_id} c={c} onDone={done} />)}</ul>}
            <OpenCase kind={caseKind ?? 'explanation'} subjectId={caseKind === null ? (x?.explanation_id ?? '') : subjectId} subjectVersion={kind === 'package_version' ? v : null} explanationId={x?.explanation_id ?? null} onDone={done} />
          </section>
        </>
      ) : null}
      <section aria-labelledby="all-cases" style={cardStyle}>
        <h2 id="all-cases" style={h2}>Every case in this domain ({cases?.length ?? 0})</h2>
        {cases === null ? <Empty>reading the cases…</Empty> : cases.length === 0 ? <p style={muted}>no case</p> : <ul style={{ paddingInlineStart: 0 }}>{cases.map((c) => <CaseCard key={c.case_id} c={c} onDone={done} />)}</ul>}
      </section>
      <Receipt receipt={receipt} />
    </>
  );
}

export default function ExplanationsPage() {
  return <Suspense fallback={null}><Explanations /></Suspense>;
}
