'use client';
/**
 * CP-6 B50 §LC — THE ASSESSMENTS (F-P3-02: PR-06-001; DESIGN D5): the person-authored assessment work objects of the working domain, each
 * with its lifecycle state read through the server's profile and whether the ledger agrees, and the act that authors a new one as a DRAFT
 * (objects.work_object.author — human-gated; the author is its accountable owner). A draft is the author's own work until it is reviewed;
 * nothing here publishes. Every row opens the assessment's page, where its lifecycle acts live behind their Command Review.
 */
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useShell } from '../layout';
import { lifecycle, lifecycleFromProfile, commandKey, type ServerProfile } from '../../../lib/lifecycle-b50';
import { GovernedButton, Empty } from '../../../components/observation';
import { ErrorNote, Receipt, inputStyle } from '../../../components/ui';
import { Timestamp } from '../../../components/text';
import { TransitionOutcomeNote } from '../../../components/knowledge';

type Row = Record<string, unknown>;
type Err = { code: string; message: string; correlationId: string } | null;

export default function AssessmentsPage() {
  const { scope, me } = useShell();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [profile, setProfile] = useState<ServerProfile | null>(null);
  const [err, setErr] = useState<Err>(null);
  const [title, setTitle] = useState(''); const [statement, setStatement] = useState(''); const [scopeText, setScopeText] = useState('');
  const [classification, setClassification] = useState('internal'); const [synthetic, setSynthetic] = useState(true);
  const [answer, setAnswer] = useState<Row | null>(null); const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [key, setKey] = useState(() => commandKey('author'));

  const load = useCallback(async () => {
    const [l, p] = await Promise.all([lifecycle.list(scope, 'ASM'), lifecycle.profiles(scope)]);
    if (!l.ok || l.data === undefined) { setErr(l.error ?? null); return; }
    setRows(l.data.objects); setErr(null);
    if (p.ok && p.data !== undefined) setProfile(p.data.profiles.find((x) => x.object_type === 'ASM') ?? null);
  }, [scope]);
  useEffect(() => { void load(); }, [load]);

  const authors = ['domain_specialist', 'domain_analyst', 'knowledge_owner', 'risk_owner', 'strategy_owner', 'forecast_owner', 'executive'];
  const canAuthor = me.kind === 'human' && me.bindings.some((b) => authors.includes(b.roleCode) && b.domainId === scope.domainId);
  const missing = [title.trim().length < 8 ? 'a title of 8+ characters' : null, statement.trim().length < 16 ? 'the assessment itself (16+ characters)' : null].filter((x): x is string => x !== null);

  return (
    <>
      <h1>Assessments</h1>
      <p className="eye-help">Assessments written by a named person. Each moves through one governed lifecycle — draft, reviewed, approved, published, corrected, withdrawn, archived, retired — and every attempt, refused ones included, stays recorded.</p>
      {err === null ? null : <ErrorNote error={err} />}
      {rows === null && err === null ? <Empty>reading the assessments…</Empty> : null}
      {rows === null ? null : (
        <table className="eye-table">
          <caption>The assessments of this domain, newest first</caption>
          <thead><tr><th scope="col">Assessment</th><th scope="col">Lifecycle</th><th scope="col">Version</th><th scope="col">Ledger</th><th scope="col">Recorded</th></tr></thead>
          <tbody>
            {rows.length === 0 ? <tr><td colSpan={5}>No assessment is recorded in this domain yet.</td></tr> : rows.map((r) => {
              const l = lifecycleFromProfile(profile, String(r['state']));
              return (
                <tr key={String(r['object_id'])}>
                  <td><Link href={`/intelligence/assessments/${String(r['object_id'])}`}>{String(r['title'] ?? 'untitled')}</Link>{r['synthetic'] === true ? <span className="eye-help"> (SYNTHETIC)</span> : null}</td>
                  <td><span aria-hidden="true">{l.glyph}</span> {l.label}{l.code === null ? null : ` (${l.code})`}</td>
                  <td>v{String(r['version'])}</td>
                  <td>{r['ledger'] === 'agrees' ? 'agrees with the record' : r['ledger'] === 'absent' ? 'NOT RECORDED in the lifecycle ledger' : 'DISAGREES with the record — reconcile it'}</td>
                  <td><Timestamp value={String(r['recorded_at'])} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      <section aria-labelledby="author-h">
        <h2 id="author-h">A new assessment</h2>
        <p className="eye-help">You become its accountable owner. It starts as your draft: nobody else sees it as reviewed or published until a reviewer records a review and you publish it.</p>
        <div className="eye-form-grid">
          <label htmlFor="asm-title">Title (what is assessed)</label>
          <input id="asm-title" style={inputStyle} value={title} onChange={(e) => setTitle(e.target.value)} />
          <label htmlFor="asm-statement">The assessment</label>
          <textarea id="asm-statement" style={inputStyle} rows={4} value={statement} onChange={(e) => setStatement(e.target.value)} />
          <label htmlFor="asm-scope">Scope (e.g. the corridor it concerns)</label>
          <input id="asm-scope" style={inputStyle} value={scopeText} onChange={(e) => setScopeText(e.target.value)} />
          <label htmlFor="asm-class">Classification</label>
          <select id="asm-class" style={inputStyle} value={classification} onChange={(e) => setClassification(e.target.value)}>
            <option value="public">public</option><option value="internal">internal</option><option value="confidential">confidential</option><option value="restricted">restricted</option>
          </select>
          <label htmlFor="asm-synthetic"><input id="asm-synthetic" type="checkbox" checked={synthetic} onChange={(e) => setSynthetic(e.target.checked)} /> Mark it SYNTHETIC (a demonstration record, never an observation)</label>
        </div>
        {!canAuthor ? <p className="eye-help">Authoring is offered to the domain specialist, analyst, knowledge owner, the risk, strategy and forecast owners and the executive — you hold none of these roles here.</p> : null}
        {missing.length > 0 ? <p className="eye-help">Still needed: {missing.join('; ')}.</p> : null}
        <GovernedButton label="Record the draft assessment" pendingLabel="recording the draft…" disabled={!canAuthor || missing.length > 0}
          onRun={async () => {
            setProblem(null); setAnswer(null);
            const r = await lifecycle.author(scope, { title: title.trim(), statement: statement.trim(), body: scopeText.trim() === '' ? {} : { scope: scopeText.trim() }, evidenceRefs: [],
              classification, purposeScope: 'intelligence', synthetic, idempotencyKey: key });
            if (!r.ok || r.data === undefined) { setProblem(r.error?.message ?? 'The draft was not recorded. Read the reason, then try again.'); return; }
            setAnswer(r.data.transition); setReceipt(r.data.receipt); setKey(commandKey('author')); setTitle(''); setStatement(''); setScopeText('');
            await load();
          }} />
        <TransitionOutcomeNote outcome={answer} problem={problem} />
        {answer === null ? null : <p><Link href={`/intelligence/assessments/${String(answer['object_id'])}`}>Open the draft you recorded</Link></p>}
        {receipt === null ? null : <Receipt receipt={receipt} />}
      </section>
    </>
  );
}
