'use client';
/**
 * PRODUCT TERMINOLOGY — CP-6 B81 §CT (0119_b81_x_ct; F-P7-E-18: UX-69-001…006, UX-ADR-021, GLB-20, CNT-01…07/10/14/15/16). Status FIRST:
 * the content version and the published canonical terms (each rendered with Term — hover or focus shows the audience explanation); then the
 * registry's versions with their automated checks (dilution, the reading grade of every explanation against its audience's ceiling, the
 * cited terms not yet published); the governed acts — propose, correct (original / replacement / impact / action), review, approve,
 * publish, retire — each showing the caller's eligibility, the exact digest and the consequence, and needing a deliberate confirmation;
 * the content lint dg-lint-3 with its ratchet.
 *
 * Everything renders from the server's answer; a refusal is shown in the server's words; a proposal is never styled like a published term.
 * On a demonstration every persona and term is SYNTHETIC; audience comprehension evidence is B111's shared path, then H3.
 */
import { useCallback, useEffect, useState } from 'react';
import { ErrorNote, Receipt, Td, Th, tableStyle } from '../../../../components/ui';
import { Panel } from '../../../../components/layers';
import { GovernedButton, Mono } from '../../../../components/observation';
import { Field, Select, TextArea } from '../../../../components/forms';
import { HelpPanel, Term } from '../../../../components/help';
import { correctionView, readingCheck, termFromCatalogue, type CorrectionRecord } from '../../../../lib/content-b81';
import { entryFromForm, termStateText, terms, type LintRun, type Receipt as Rcpt, type Registry, type TermPreview } from '../../../../lib/terms-b81';
import type { Audience } from '../../../../lib/b81-seams';

type Row = Record<string, unknown>;
type Err = { code: string; message: string; correlationId: string } | null;
const EMPTY = { key: '', category: 'concept', label: '', definition: '', executive: '', analyst: '', operator: '', example: '', protectedWords: '', synonyms: '', conditions: '', cites: '', glossaryKeys: '' };
const CATEGORIES: ReadonlyArray<readonly [string, string]> = [['truth_state', 'Truth state'], ['lifecycle_state', 'Lifecycle state'], ['action', 'Action'], ['object', 'Object'], ['concept', 'Concept'],
  ['instruction', 'Instruction'], ['error', 'Error'], ['warning', 'Warning'], ['label', 'Label']];
const muted = { color: 'var(--eye-color-ink-muted)', fontSize: 'var(--eye-type-body-sm)' };

export default function ProductTerminologyPage() {
  const [reg, setReg] = useState<Registry | null>(null);
  const [error, setError] = useState<Err>(null);
  const [receipt, setReceipt] = useState<Rcpt | null>(null);
  const [audience, setAudience] = useState<Audience>('executive');
  const [form, setForm] = useState(EMPTY);
  const [correcting, setCorrecting] = useState<{ id: string; version: number } | null>(null);
  const [impact, setImpact] = useState(''); const [action, setAction] = useState('');
  const [pick, setPick] = useState<{ id: string; version: number } | null>(null);
  const [preview, setPreview] = useState<TermPreview['preview'] | null>(null);
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [lint, setLint] = useState<LintRun | null>(null);

  const load = useCallback(async () => {
    const r = await terms.registry();
    if (r.ok && r.data !== undefined) setReg(r.data); else setError(r.error ?? null);
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    setConfirmed(false); setPreview(null);
    if (pick === null) return;
    let live = true;
    void terms.preview(pick.id, pick.version).then((r) => { if (!live) return; if (r.ok && r.data !== undefined) setPreview(r.data.preview); else setError(r.error ?? null); });
    return () => { live = false; };
  }, [pick]);

  const after = async (r: { ok: boolean; data?: { receipt: Rcpt }; error?: { code: string; message: string; correlationId: string } }) => {
    if (r.ok && r.data !== undefined) { setReceipt(r.data.receipt); setError(null); setReason(''); setConfirmed(false); setPick(null); await load(); }
    else { setError(r.error ?? null); await load(); throw new Error(r.error?.message ?? 'refused'); }
  };
  const set = (k: keyof typeof EMPTY) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const published = (reg?.catalogue.terms ?? []).map((row) => termFromCatalogue(row));
  const versions = reg?.terms ?? [];
  const latestOf = (key: string) => versions.filter((v) => v['term_key'] === key && v['locale'] === 'en').sort((a, b) => Number(b['version']) - Number(a['version']))[0] ?? null;
  const reasonOk = reason.trim().length >= 8;
  const entry = entryFromForm(form);
  const draftReading = readingCheck({ executive: form.executive, analyst: form.analyst, operator: form.operator });

  /** One governed act on the selected version: eligibility, digest, consequence, a deliberate confirmation — or why it is disabled. */
  const actBox = (act: 'review' | 'approve' | 'publish' | 'retire', label: string, run: () => Promise<void>, critical = false) => {
    if (preview === null) return null;
    const blocked = preview.eligibility[act];
    return (
      <div key={act} data-testid={`term-${act}`} style={{ marginBlock: 'var(--eye-space-8)' }}>
        <ul style={muted}>{(preview.consequence[act] ?? []).map((c) => <li key={c}>{c}</li>)}</ul>
        {blocked.length > 0 ? <p role="status">You cannot take this act: {blocked.join('; ')}</p> : null}
        <GovernedButton label={label} pendingLabel={`${label} in progress`} variant={critical ? 'critical' : 'primary'} disabled={blocked.length > 0 || !reasonOk || !confirmed} onRun={run} />
      </div>
    );
  };

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', color: 'var(--eye-color-ink-strong)' }}>Product terminology</h1>
      <ErrorNote error={error} />
      <Receipt receipt={receipt} />
      <HelpPanel title="Canonical terms" level={2}
        explanation="Each concept has one canonical term. Its explanations for executives, analysts and operators clarify it without changing its meaning."
        example="ASSESSED: a reviewed analytical judgment with uncertainty — every explanation keeps the word uncertainty."
        conditions={['A term is reviewed, then approved and published by the Design System Authority — never by its proposer, never by an agent.',
          'An explanation that drops the canonical term or a protected word is refused.']} />

      <Panel title="Published terms">
        <p style={muted} data-testid="content-version">Content version <Mono>{reg?.content_version.value ?? 'not read yet'}</Mono> (the published terms and the message catalogue)</p>
        <Select id="ct-audience" label="Explain terms for" value={audience} onChange={(v) => setAudience(v as Audience)}
          options={[['executive', 'Executives'], ['analyst', 'Analysts'], ['operator', 'Operators']]} />
        {published.length === 0 ? <p style={muted}>No term is published yet.</p> : (
          <ul>{published.map((t) => <li key={t.term.key}><Term term={t} audience={audience} /> <span style={muted}>· {t.term.key} v{t.term.version}</span>
            {t.term.synonyms.length > 0 ? <span style={muted}> · not canonical: {t.term.synonyms.join(', ')}</span> : null}</li>)}</ul>
        )}
      </Panel>

      <Panel title="Term versions">
        <table style={tableStyle}>
          <thead><tr><Th>Term</Th><Th>Version</Th><Th>State</Th><Th>Reading grades</Th><Th>Proposed by</Th><Th>Select</Th></tr></thead>
          <tbody>{versions.map((v) => (
            <tr key={`${String(v['term_id'])}-${String(v['version'])}`} className="eye-ct-registry-row" data-state={String(v['state'])}>
              <Td>{String(v['label'])} <span style={muted}>({String(v['term_key'])}@{String(v['locale'])})</span></Td>
              <Td mono>v{String(v['version'])}</Td>
              <Td>{termStateText(String(v['state']))}</Td>
              <Td>{Object.entries((v['reading_levels'] ?? {}) as Record<string, number>).map(([a, g]) => `${a} ${g}`).join(' · ')}</Td>
              <Td>{String(v['proposed_by_name'] ?? v['proposed_by'])}</Td>
              <Td><button type="button" className="eye-cld-btn-quiet" onClick={() => setPick({ id: String(v['term_id']), version: Number(v['version']) })}>Select version {String(v['version'])} of {String(v['label'])}</button></Td>
            </tr>))}
          </tbody>
        </table>
      </Panel>

      {pick !== null ? (
        <Panel title="The selected version">
          {preview === null ? <p style={muted}>Reading the version…</p> : (
            <div data-testid="term-preview">
              <p>{String(preview['term_key'])} v{String(preview['version'])} — {termStateText(String(preview['state']))}</p>
              <p>Exact digest: <Mono>{String(preview['digest'])}</Mono></p>
              <p>Checks: dilution {String(((preview.checks as Row)['dilution'] ?? 'none found'))}; reading {((preview.checks as Row)['reading_pass'] === true) ? 'within every ceiling' : 'above a ceiling'};
                unpublished cited terms {(((preview.checks as Row)['unpublished_cites'] ?? []) as string[]).join(', ') || 'none'}</p>
              {correctionView((preview['correction'] ?? null) as CorrectionRecord | null)?.map((c) => <p key={c.label}><strong>{c.label}:</strong> {c.value}</p>)}
              <TextArea id="ct-reason" label="Reason or review notes (8+ characters)" value={reason} onChange={setReason} maxChars={600} rows={2} />
              <label><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /> I have read the digest, the checks and the consequence; this is my act</label>
              {actBox('review', 'Review this term ready', async () => after(await terms.review(pick.id, { version: pick.version, digest: String(preview['digest']), outcome: 'ready', notes: reason })))}
              {actBox('review', 'Return this term for changes', async () => after(await terms.review(pick.id, { version: pick.version, digest: String(preview['digest']), outcome: 'changes_requested', notes: reason })))}
              {actBox('approve', 'Approve this term version', async () => after(await terms.approve(pick.id, { version: pick.version, digest: String(preview['digest']), reason })))}
              {actBox('publish', 'Publish this term version', async () => after(await terms.publish(pick.id, { version: pick.version, digest: String(preview['digest']), reason })))}
              <p style={muted}>Retiring cannot be undone: the version is no longer offered and its history is kept.</p>
              {actBox('retire', 'Retire this term version', async () => after(await terms.retire(pick.id, { version: pick.version, reason })), true)}
              {preview.eligibility.correct.length === 0 ? <button type="button" className="eye-cld-btn-quiet" onClick={() => setCorrecting({ id: pick.id, version: Number(latestOf(String(preview['term_key']))?.['version'] ?? pick.version) })}>Start a correction of this term</button> : null}
            </div>
          )}
        </Panel>
      ) : null}

      <Panel title={correcting === null ? 'A new term proposal' : 'A correction of a published term'}>
        <p style={muted}>A proposal is not a published term: it is reviewed, approved and published by others.</p>
        {correcting === null ? <Field id="ct-key" label="Term key (e.g. truth.assessed)" value={form.key} onChange={set('key')} required /> : null}
        <Select id="ct-category" label="Category" value={form.category} onChange={set('category')} options={CATEGORIES} />
        <Field id="ct-label" label="Canonical label" value={form.label} onChange={set('label')} required />
        <TextArea id="ct-definition" label="Definition" value={form.definition} onChange={set('definition')} maxChars={1000} rows={2} required />
        {(['executive', 'analyst', 'operator'] as const).map((a) => (
          <TextArea key={a} id={`ct-${a}`} label={`Explanation for ${a}s (keeps the canonical label and every protected word)`} value={form[a]} onChange={set(a)} maxChars={600} rows={2} required
            help={draftReading.find((x) => x.audience === a) !== undefined ? `Reading grade ${draftReading.find((x) => x.audience === a)!.grade} (ceiling ${draftReading.find((x) => x.audience === a)!.ceiling})` : undefined} />
        ))}
        <TextArea id="ct-example" label="Example" value={form.example} onChange={set('example')} maxChars={600} rows={2} required />
        <TextArea id="ct-protected" label="Protected words (one per line)" value={form.protectedWords} onChange={set('protectedWords')} maxChars={800} rows={2} />
        <TextArea id="ct-synonyms" label="Non-canonical synonyms (one per line)" value={form.synonyms} onChange={set('synonyms')} maxChars={800} rows={2} />
        <TextArea id="ct-conditions" label="Required conditions (one per line)" value={form.conditions} onChange={set('conditions')} maxChars={1200} rows={2} />
        <TextArea id="ct-cites" label="Cited term keys (one per line)" value={form.cites} onChange={set('cites')} maxChars={800} rows={2} />
        <TextArea id="ct-glossary" label="Linked domain glossary keys (one per line; linked, never merged)" value={form.glossaryKeys} onChange={set('glossaryKeys')} maxChars={800} rows={2} />
        {correcting !== null ? (
          <>
            <TextArea id="ct-impact" label="Impact of the correction" value={impact} onChange={setImpact} maxChars={600} rows={2} required />
            <TextArea id="ct-action" label="Action readers take" value={action} onChange={setAction} maxChars={600} rows={2} required />
            <GovernedButton label="Propose this correction" pendingLabel="Proposing the correction" onRun={async () => {
              await after(await terms.correct(correcting.id, { expectedVersion: correcting.version, entry, impact, action })); setCorrecting(null); setForm(EMPTY); }} />
            <button type="button" className="eye-cld-btn-quiet" onClick={() => setCorrecting(null)}>Cancel</button>
          </>
        ) : (
          <GovernedButton label="Propose this term" pendingLabel="Proposing the term" onRun={async () => {
            const cur = latestOf(form.key.trim());
            await after(await terms.propose({ key: form.key.trim(), expectedVersion: cur === null ? 0 : Number(cur['version']), entry })); setForm(EMPTY); }} />
        )}
      </Panel>

      <Panel title="Content lint">
        <p style={muted}>The content lint (dg-lint-3) checks command labels, destructive commands, error texts, explanations and titles. Today&apos;s findings are committed; the list may only shrink.</p>
        <GovernedButton label="Run the content lint" pendingLabel="Running the content lint" variant="quiet" onRun={async () => {
          const r = await terms.lint();
          if (r.ok && r.data !== undefined) { setLint(r.data); setReceipt(r.data.receipt); } else { setError(r.error ?? null); throw new Error('refused'); } }} />
        {lint !== null ? (
          <p data-testid="lint-ratchet">Verdict {String(lint.evaluation['verdict'])}: {lint.ratchet.current} findings against {lint.ratchet.baseline} committed —
            {lint.ratchet.holds ? ' the ratchet holds' : ` ${lint.ratchet.regressions.length} new finding(s): the ratchet is broken`}; {lint.ratchet.resolved} resolved.</p>
        ) : null}
      </Panel>
      <p style={muted}>{reg?.boundary}</p>
    </>
  );
}
