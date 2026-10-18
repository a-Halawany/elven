'use client';
/**
 * CP-6 B81 §SI — THE FEDERATED SEARCH AND INTENT PAGE (F-P7-E-02: UX-13-001…005, PAT-15; WS-03 Research and Discovery — "preserve the query
 * snapshot and the policy-filtered scope"). The palette hands its Search, Ask and Command modes here (`?q=&mode=&review=`); a saved search
 * reopens here (`?saved=<id>`).
 *
 *   THE READING FIRST   the deterministic interpreter's reading of the words is shown BEFORE any result or review (lib/intent-b81 — no
 *                       model): the mode, the kind words, the phrases, the uncertainty. Once the governed reads answer, the reading is
 *                       checked against what the person may see; an AMBIGUOUS phrase asks a bounded clarification with every alternative
 *                       and NONE preselected — the person chooses, searches the words as typed, or cancels (each an intent record).
 *   THE READS           lib/search-b81 runFederated: graph search (per phrase, with B20's completeness), the strategy list, the catalog
 *                       search, the exposures list, the decision packages list — each its own audited read; a refused or failed leg is
 *                       DECLARED (§DG PartialResult) in the server's words, never dropped and never counted as hidden.
 *   A COMMAND           is offered only as a hand-off to its page's Command Review (`review=`); choosing it records the intent and opens the
 *                       review — nothing runs here.
 *   SAVING              keeps the exact result set; the port verifies each read's receipt and derives the policy version and the cutoff.
 *                       A reopened saved search shows the saved set EXACTLY, and a live re-run's drift BESIDE it — never in its place.
 *
 * Records shown in tests and walks are SYNTHETIC. THREE CLAIMS: construction; demonstrated operation (the act); real acceptance (H3) — never.
 */
import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useShell } from '../../layout';
import { INTERPRETER_VERSION, MODE_SPEC, disagreement, intentRecordOf, interpret, previewLine, type IntentOutcome, type PaletteMode, type Reading } from '../../../../lib/intent-b81';
import { LEGS, driftOf, legsOf, narrowTo, rankHits, readSearches, recordIntent, resultsOf, runFederated, saveSearch, type Drift, type Federated, type FederatedHit,
  type SavedSearchVersion, type SearchesRead } from '../../../../lib/search-b81';
import { PartialResult } from '../../../../components/recovery';
import { Field, Select } from '../../../../components/forms';
import { Button } from '../../../../components/actions';
import { Digest, Timestamp } from '../../../../components/text';
import { ErrorNote, Receipt } from '../../../../components/ui';

type Err = { code: string; message: string; correlationId: string } | null;
type Rcpt = { policyDecisionId: string; auditSeq: number } | null;
const MODES: ReadonlyArray<readonly [Exclude<PaletteMode, 'goto'>, string]> = [['search', MODE_SPEC.search.label], ['ask', MODE_SPEC.ask.label], ['command', MODE_SPEC.command.label]];
const modeOf = (v: string | null): Exclude<PaletteMode, 'goto'> => (v === 'search' || v === 'command' ? v : 'ask');

export default function FederatedSearchPage() {
  return <Suspense fallback={null}><FederatedSearch /></Suspense>;
}

function HitList({ hits, label }: { hits: readonly FederatedHit[]; label: string }) {
  if (hits.length === 0) return <p className="eye-help">{label}: none you may see.</p>;
  return (
    <ul className="eye-search-hits" aria-label={label}>
      {hits.map((h) => (
        <li key={`${h.leg}|${h.key}`} className="eye-search-hit">
          <Link href={h.href}>{h.label}</Link> <span className="eye-help">{h.kind} · {h.detail}</span>
          <div className="eye-help">matched because {h.matchedOn} · {LEGS[h.leg].label}{h.opens === 'list' ? ' · opens its list (this record\'s own page is declared for a later stage)' : ''}</div>
        </li>
      ))}
    </ul>
  );
}

function FederatedSearch() {
  const { scope } = useShell();
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const [mode, setMode] = useState<Exclude<PaletteMode, 'goto'>>(modeOf(params.get('mode')));
  const savedParam = params.get('saved');
  const [preview, setPreview] = useState<Reading | null>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  const [fed, setFed] = useState<Federated | null>(null);
  const [choice, setChoice] = useState<string | null>(null);
  const [resolved, setResolved] = useState<{ outcome: IntentOutcome; choice: string | null; intentId: string | null } | null>(null);
  const [name, setName] = useState('');
  const [saved, setSaved] = useState<SavedSearchVersion | null>(null);
  const [mine, setMine] = useState<SearchesRead | null>(null);
  const [exact, setExact] = useState<SavedSearchVersion | null>(null);
  const [drift, setDrift] = useState<{ live: Federated; drift: Drift } | null>(null);
  const [err, setErr] = useState<Err>(null);
  const [rcpt, setRcpt] = useState<Rcpt>(null);
  const [busy, setBusy] = useState(false);

  const loadMine = async () => {
    const r = await readSearches(scope, savedParam);
    if (!r.ok || r.data === undefined) { setErr(r.error ?? null); return; }
    setMine(r.data.searches); setExact(r.data.searches.exact);
  };
  useEffect(() => { void loadMine(); }, [scope.tenantId, scope.domainId, savedParam]); // eslint-disable-line react-hooks/exhaustive-deps

  /** The reading first (no read yet), then the governed reads, then the reading checked against what they returned. */
  const run = async (text = q, m = mode) => {
    if (text.trim() === '') return;
    setBusy(true); setErr(null); setRcpt(null); setSaved(null); setChoice(null); setResolved(null); setFed(null); setReading(null);
    const first = interpret(text, { mode: m });
    setPreview(first);
    const f = await runFederated(scope, first.phrases.length > 0 ? first.phrases : [text.trim()]);
    setFed(f); setReading(interpret(text, { mode: m, hits: f.hits })); setName(text.trim().slice(0, 120)); setBusy(false);
  };
  useEffect(() => { if (savedParam === null && (params.get('q') ?? '') !== '') void run(params.get('q') ?? '', modeOf(params.get('mode'))); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  /** The person's act on the reading — RECORDED (shell.intent.record) before anything follows; a command opens its review, nothing runs. */
  const resolve = async (outcome: IntentOutcome, pick: string | null, then?: string) => {
    if (reading === null) return;
    const intake = intentRecordOf(reading, { outcome, choice: pick });
    if (typeof intake === 'string') { setErr({ code: 'EYE-REQ-001', message: intake, correlationId: '—' }); return; }
    setBusy(true); setErr(null);
    const r = await recordIntent(scope, intake as unknown as Record<string, unknown>);
    setBusy(false);
    if (!r.ok || r.data === undefined) { setErr(r.error ?? null); return; }
    setRcpt(r.data.receipt); setResolved({ outcome, choice: pick, intentId: r.data.intent.intent_id });
    if (then !== undefined) router.push(then);
  };

  const shown = fed === null || reading === null ? [] : resolved?.outcome === 'cancelled' ? [] : narrowTo(fed.hits, reading, resolved?.outcome === 'chosen' ? resolved.choice : null);
  const ranked = rankHits(shown, reading?.kinds ?? []);
  const ambiguousOpen = reading?.kind === 'ambiguous' && resolved === null;
  const saveBlocked = fed === null ? 'run the search first' : ambiguousOpen ? 'answer the clarification first (choose, search the words as typed, or cancel)'
    : resolved?.outcome === 'cancelled' ? 'the clarification was cancelled — nothing to save' : name.trim() === '' ? 'name the saved search' : null;
  const current = mine?.saved.find((s) => s.name.trim().toLowerCase() === name.trim().toLowerCase()) ?? null;

  const save = async () => {
    if (fed === null || reading === null) return;
    setBusy(true); setErr(null);
    const r = await saveSearch(scope, {
      name: name.trim(), expectedVersion: current?.versions ?? 0, query: q, results: resultsOf(shown), legs: legsOf(fed.legs), intentRecordId: resolved?.intentId ?? null,
      intent: { mode, interpreter: reading.interpreter, kind: reading.kind, scoped_query: reading.scopedQuery, kinds: reading.kinds, terms: reading.phrases, choice: resolved?.choice ?? null },
      filters: reading.kinds.length > 0 ? { kinds: reading.kinds } : null,
    });
    setBusy(false);
    if (!r.ok || r.data === undefined) { setErr(r.error ?? null); return; }
    setSaved(r.data.savedSearch); setRcpt(r.data.receipt); void loadMine();
  };

  /** D10: the saved set stays as saved; the live re-run is read beside it and compared (added · no longer returned · another version). */
  const rerun = async () => {
    if (exact === null) return;
    setBusy(true);
    const terms = Array.isArray(exact.intent['terms']) ? (exact.intent['terms'] as string[]) : [];
    const live = await runFederated(scope, terms.length > 0 ? terms : [exact.query]);
    setBusy(false);
    setDrift({ live, drift: driftOf(exact.results, resultsOf(live.hits)) });
  };
  const reread = exact === null ? null : (() => {
    const was = String(exact.intent['interpreter'] ?? '');
    if (was === '' || was === INTERPRETER_VERSION) return null;
    const now = interpret(exact.query, { mode: modeOf(String(exact.intent['mode'] ?? 'ask')) });
    const then = { ...now, interpreter: was as Reading['interpreter'], kind: String(exact.intent['kind'] ?? 'search') as Reading['kind'], kinds: (exact.intent['kinds'] as string[] | undefined) ?? [],
      scopedQuery: (exact.intent['scoped_query'] as string | null | undefined) ?? null };
    return disagreement(then, now);
  })();

  return (
    <>
      <h1>Search and intent</h1>
      <p className="eye-help">Within what you may see in this domain. Each source below is its own governed read; nothing here changes a record — a command opens its Command Review on its own page.</p>

      {savedParam !== null ? (
        <section aria-labelledby="saved-h">
          <h2 id="saved-h">Saved search</h2>
          {exact === null ? (err === null ? <p>reading the saved search…</p> : <><p><strong>Not opened.</strong> No saved search of yours in this domain matches this link.</p><ErrorNote error={err} /><p><Link href="/graph/search/all">Open the search instead</Link></p></>) : (
            <>
              <p><strong>{exact.name}</strong> · version {exact.version}{exact.latest_version !== undefined && exact.latest_version > exact.version ? ` (a newer version ${exact.latest_version} exists)` : ''} · the query as typed: “{exact.query}”</p>
              <p className="eye-help">Exactly as saved: {exact.result_count} result(s), read under policy {exact.policy_version}, the reads made between <Timestamp value={exact.read_from} /> and the cutoff <Timestamp value={exact.cutoff} />. Result-set digest <Digest value={exact.result_digest} />{exact.digest_ok === false ? ' — DOES NOT MATCH its results' : ''}.</p>
              <ul className="eye-search-legs" aria-label="The reads it was made of">{exact.legs.map((l, i) => <li key={i} data-state={l.state}>{LEGS[l.leg]?.label ?? l.leg}: {l.state}{l.note ? ` — ${l.note}` : ''}</li>)}</ul>
              {reread === null ? null : <p className="eye-palette-reason">{reread.clarification} The saved result set below is unchanged either way.</p>}
              <div className="eye-search-columns">
                <section aria-labelledby="saved-set-h"><h3 id="saved-set-h">The saved result set (at the cutoff)</h3>
                  <ul className="eye-search-hits">{exact.results.map((r) => <li key={`${r.leg}|${r.kind}|${r.id}`} className="eye-search-hit">{r.label} <span className="eye-help">{r.kind} · {LEGS[r.leg as keyof typeof LEGS]?.label ?? r.leg}{r.version === null ? '' : ` · v${r.version}`}</span></li>)}</ul>
                </section>
                <section aria-labelledby="drift-h"><h3 id="drift-h">The live re-run, beside it</h3>
                  <Button label="Re-run the search live" pendingLabel="reading" onClick={rerun} disabledReason={busy ? 'a read is under way' : null} />
                  {drift === null ? <p className="eye-help">Not re-run yet. A re-run never replaces the saved set.</p> : (
                    <>
                      <p role="status">{drift.drift.statement}</p>
                      <PartialResult declaration={drift.live.partial} />
                      {drift.drift.added.length > 0 && <p>Added since the cutoff: {drift.drift.added.map((r) => r.label).join(', ')}</p>}
                      {drift.drift.removed.length > 0 && <p>No longer returned: {drift.drift.removed.map((r) => r.label).join(', ')}</p>}
                      {drift.drift.changed.map((c) => <p key={c.key}>{c.label}: saved at v{String(c.saved)}, now v{String(c.live)}</p>)}
                    </>
                  )}
                </section>
              </div>
              <p><Link href="/graph/search/all">Start a new search</Link></p>
            </>
          )}
        </section>
      ) : (
        <>
          <form onSubmit={(e) => { e.preventDefault(); void run(); }} className="eye-search-form">
            <Field id="si-q" label="Search words" value={q} onChange={setQ} type="search" help="For example: Bab el-Mandeb exposure Regensburg" />
            <Select id="si-mode" label="Mode" value={mode} onChange={(v) => setMode(modeOf(v))} options={MODES} help={MODE_SPEC[mode].says} />
            <Button type="submit" label="Run the search" pendingLabel="reading" disabledReason={q.trim() === '' ? 'type the words first' : busy ? 'a read is under way' : null} />
          </form>

          {preview === null ? null : (
            <section aria-labelledby="reading-h" className="eye-search-clarify">
              <h2 id="reading-h">The reading</h2>
              <p>“{preview.input}” — {MODE_SPEC[preview.mode].label} mode, read by {preview.interpreter} (deterministic; no model).</p>
              <p role="status">{previewLine(reading ?? preview)}</p>
              {(reading ?? preview).uncertainty.length > 0 && <ul>{(reading ?? preview).uncertainty.map((u, i) => <li key={i}>{u}</li>)}</ul>}
              {reading === null ? <p className="eye-help">reading what you may see…</p> : null}
              {reading !== null && reading.kind === 'ambiguous' && resolved === null && (
                <fieldset>
                  <legend>{reading.clarification}</legend>
                  {reading.alternatives.map((a) => (
                    <label key={a.key}><input type="radio" name="si-choice" value={a.key} checked={choice === a.key} onChange={() => setChoice(a.key)} /> {a.label} <span className="eye-help">({a.kind})</span></label>
                  ))}
                  <div className="eye-ws-actions">
                    <Button label={reading.command === null ? 'Use the chosen reading' : 'Open the chosen review'} pendingLabel="recording" disabledReason={choice === null ? 'choose one — nothing is chosen for you' : busy ? 'recording' : null}
                      onClick={() => resolve(reading.command === null ? 'chosen' : 'command_review', choice, reading.command === null ? undefined : reading.alternatives.find((a) => a.key === choice)?.target)} />
                    <Button label="Search the words as typed" variant="secondary" pendingLabel="recording" onClick={() => resolve('literal', null)} disabledReason={busy ? 'recording' : null} />
                    <Button label="Cancel the clarification" variant="secondary" pendingLabel="recording" onClick={() => resolve('cancelled', null)} disabledReason={busy ? 'recording' : null} />
                  </div>
                  <p className="eye-help">Cancelling: your words and this reading stay recorded (they are kept); nothing else changes.</p>
                </fieldset>
              )}
              {reading !== null && reading.kind === 'command' && resolved === null && (
                <div>
                  <p>{reading.command?.label}: each opens the Command Review on its page, where the effect, your eligibility and the digest are shown before you decide. Nothing runs here.</p>
                  <ul>{reading.alternatives.map((a) => (
                    <li key={a.key}><Button label={`Open the review: ${a.label}`} variant="secondary" pendingLabel="opening" onClick={() => resolve('command_review', a.key, a.target)} disabledReason={busy ? 'recording' : null} /></li>
                  ))}</ul>
                </div>
              )}
              {reading !== null && reading.kind === 'none' && resolved === null && (
                <Button label="Record the unsupported request" variant="secondary" pendingLabel="recording" onClick={() => resolve('unsupported', null)} disabledReason={busy ? 'recording' : null} />
              )}
              {resolved !== null && <p role="status">Recorded: {resolved.outcome.replace('_', ' ')}{resolved.choice === null ? '' : ` — ${reading?.alternatives.find((a) => a.key === resolved.choice)?.label ?? resolved.choice}`}.</p>}
            </section>
          )}

          {fed === null ? null : (
            <section aria-labelledby="results-h">
              <h2 id="results-h">Results</h2>
              <ul className="eye-search-legs" aria-label="The reads">{fed.legs.map((l, i) => <li key={i} data-state={l.state}>{LEGS[l.leg].label}{l.phrase === null ? '' : ` “${l.phrase}”`}: {l.state}{l.state === 'refused' || l.state === 'failed' ? '' : ` · ${l.count}`}</li>)}</ul>
              <PartialResult declaration={fed.partial} />
              {ambiguousOpen ? <p className="eye-help">Every match is shown until you answer the clarification above; nothing is chosen for you.</p> : null}
              {resolved?.outcome === 'cancelled' ? <p>The clarification was cancelled; no results are shown for it. Run the search again to start over.</p> : (
                <>
                  {(reading?.kinds.length ?? 0) > 0 && <HitList hits={ranked.scoped} label={`The kinds you named (${reading!.kinds.join(', ')})`} />}
                  <HitList hits={(reading?.kinds.length ?? 0) > 0 ? ranked.other : ranked.scoped} label={(reading?.kinds.length ?? 0) > 0 ? 'Other matches' : 'Matches'} />
                </>
              )}
              <h3>Save this search</h3>
              <Field id="si-name" label="Saved search name" value={name} onChange={setName} help={current === null ? 'a new saved search' : `saves version ${current.versions + 1} of “${current.name}” — the earlier versions stay as they were`} />
              <Button label="Save this search" pendingLabel="saving" onClick={save} disabledReason={busy ? 'a read or a record is under way' : saveBlocked} />
              <p className="eye-help">Saving keeps exactly these results, their versions and digest, with the policy version and the cutoff the server reads from your searches. You can reopen it later; it is never overwritten.</p>
              {saved === null ? null : <p role="status">Saved “{saved.name}” version {saved.version}: {saved.result_count} result(s), digest <Digest value={saved.result_digest} />, policy {saved.policy_version}, cutoff <Timestamp value={saved.cutoff} />. <Link href={`/graph/search/all?saved=${saved.saved_search_id}`}>Reopen the saved result set</Link></p>}
            </section>
          )}
        </>
      )}

      <ErrorNote error={savedParam !== null && exact === null ? null : err} />
      <Receipt receipt={rcpt} />

      <section aria-labelledby="mine-h">
        <h2 id="mine-h">Your saved searches</h2>
        {mine === null ? <p className="eye-help">reading your saved searches…</p> : mine.saved.length === 0 ? <p className="eye-help">None saved in this domain yet.</p> : (
          <ul>{mine.saved.map((s) => (
            <li key={s.name}><Link href={`/graph/search/all?saved=${s.current.saved_search_id}`}>{s.name}</Link> <span className="eye-help">v{s.current.version} of {s.versions} · {s.current.result_count} result(s) · cutoff <Timestamp value={s.current.cutoff} /> · policy {s.current.policy_version}</span></li>
          ))}</ul>
        )}
      </section>
    </>
  );
}
