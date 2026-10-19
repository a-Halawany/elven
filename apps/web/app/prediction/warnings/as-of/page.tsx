'use client';
/**
 * CP-6 B80 §SH — THE DEEP LINK to a warning AS OF an instant (PAT-25, UX-15-001…005; the act's deep-link scene).
 *
 * `/prediction/warnings/as-of?warning=<id>&at=<ISO instant with its zone>[&from=<return token>]` opens EXACTLY the state the link names:
 * the warning's state recorded as of the instant, reconstructed by the server from the warning's own append-only events
 * (prediction.warning_as_of, 0118_b80_x_sh), the events up to it, and the VARIANCE against the current declared state. Opening, copying or
 * re-opening the link READS only — it acknowledges, approves and changes nothing (the read leaves its own access evidence, as every read
 * does). A link to a missing, another tenant's or an unauthorized warning answers the same words (nothing about existence leaks); an
 * instant before the warning's history, or in the future, is said in the server's words, with the current warnings offered instead.
 * The return path is the shell's (the `from=` token: "Return to …", with the focus it left from).
 */
import { Suspense, useEffect, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useShell } from '../../layout';
import { ErrorNote } from '../../../../components/ui';
import { TabSet, WorkspaceHeader } from '../../../../components/shell';
import {
  DEEP_LINK_TARGETS, LINK_OUTCOME_WORDS, decodeWarningLink, encodeDeepLink, linkOutcome, warningAsOf, type LinkOutcome, type WarningAsOf,
} from '../../../../lib/shell-b80';

type Err = { code: string; message: string; correlationId: string } | null;

export default function WarningAsOfPage() {
  return <Suspense fallback={null}><WarningAsOfView /></Suspense>;
}

function WarningAsOfView() {
  const params = useSearchParams();
  const router = useRouter();
  const { scope } = useShell();
  const search = params.toString();
  const decoded = decodeWarningLink(search);
  const [w, setW] = useState<WarningAsOf | null>(null);
  const [err, setErr] = useState<Err>(null);
  const [outcome, setOutcome] = useState<LinkOutcome | null>(null);
  const [instant, setInstant] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const link = 'link' in decoded ? decoded.link : null;

  useEffect(() => {
    setW(null); setErr(null); setOutcome(null); setCopied(null);
    if (link === null) { setOutcome('invalid'); return; }
    setInstant(link.asOf ?? '');
    void (async () => {
      const r = await warningAsOf(scope, link.id, link.asOf as string);
      if (r.ok && r.data !== undefined) { setW(r.data.warning); setOutcome(linkOutcome(r, r.data.warning.variance)); }
      else { setErr(r.error ?? null); setOutcome(linkOutcome(r)); }
    })();
    // the link's own parameters are the whole input: a new link is a new read
  }, [scope, search]); // eslint-disable-line react-hooks/exhaustive-deps

  const reopen = (e: FormEvent) => {
    e.preventDefault();
    if (link === null) return;
    const href = encodeDeepLink({ ...link, asOf: instant.trim() });
    if (href === null) { setCopied('That instant cannot be opened: give an ISO instant with its zone, e.g. 2026-10-17T09:30:00Z.'); return; }
    router.push(href);   // navigation only: a new link, a new read
  };
  const copy = async () => {
    if (link === null) return;
    const href = encodeDeepLink({ ...link, from: null });
    if (href === null) return;
    try { await navigator.clipboard.writeText(`${window.location.origin}${href}`); setCopied('Copied. The link opens this exact recorded state; it carries no command and acknowledges nothing.'); }
    catch { setCopied(`Copy this link: ${href}`); }
  };

  const canonical = DEEP_LINK_TARGETS.warning.canonical;
  return (
    <>
      <WorkspaceHeader
        title="Warning as of an instant"
        scope={<>a recorded state, read from the warning&apos;s own event history · opening it reads only{link?.asOf ? <> · as of <bdi className="eye-mono">{link.asOf}</bdi></> : null}</>}
        actions={<><button type="button" className="eye-link-button" onClick={() => void copy()} disabled={link === null}>Copy the link to this state</button>
          <Link href={canonical}>The current warnings</Link></>}
      />
      {outcome !== null && <p className="eye-shell-meta"><strong>{outcome === 'exact' || outcome === 'drifted' ? 'Opened.' : 'Not opened.'}</strong> {LINK_OUTCOME_WORDS[outcome]}</p>}
      <ErrorNote error={err} />
      {outcome !== null && outcome !== 'exact' && outcome !== 'drifted' && <p><Link href={canonical}>Open the current warnings instead</Link> (the nearest safe state).</p>}
      {copied !== null && <p aria-live="polite" className="eye-shell-meta">{copied}</p>}
      {w !== null && (
        <>
          <p><strong>{w.as_of.title ?? w.current.title}</strong> — as of <bdi className="eye-mono">{w.at}</bdi>: <strong>{w.as_of.state.toUpperCase()}</strong>
            {' · '}level {w.as_of.level ?? 'not recorded at the raise'} · context version {w.as_of.context_version} · {w.as_of.event_count} event(s) up to the instant</p>
          <p className="eye-shell-meta">{w.variance.statement}. Read at <bdi className="eye-mono">{w.read_at}</bdi>; the history begins at <bdi className="eye-mono">{w.first_event_at}</bdi>. {w.claim}.</p>
          <TabSet label="The warning as of the instant" idBase="wao" tabs={[
            { id: 'variance', label: 'Variance against current', panel: (
              w.variance.changed.length === 0 ? <p>No field differs from the current declared state.</p> : (
                <table className="eye-table">
                  <caption>fields that differ between the instant and the current declared state</caption>
                  <thead><tr><th scope="col">field</th><th scope="col">as of the instant</th><th scope="col">current declared</th></tr></thead>
                  <tbody>{w.variance.changed.map((c) => (
                    <tr key={c.field}><td data-label="field">{c.field}</td><td data-label="as of the instant">{String(c.as_of ?? 'none recorded')}</td><td data-label="current declared">{String(c.current ?? 'none recorded')}</td></tr>
                  ))}</tbody>
                </table>)) },
            { id: 'events', label: `Events up to the instant (${w.as_of.event_count})`, panel: (
              <table className="eye-table">
                <caption>the warning&apos;s recorded events up to the instant, oldest first</caption>
                <thead><tr><th scope="col">event</th><th scope="col">recorded at</th><th scope="col">event id</th></tr></thead>
                <tbody>{w.as_of.events.map((e) => (
                  <tr key={e.event_id}><td data-label="event">{e.event}</td><td data-label="recorded at"><bdi className="eye-mono">{e.occurred_at}</bdi></td><td data-label="event id"><bdi className="eye-mono">{e.event_id.slice(0, 8)}…</bdi></td></tr>
                ))}</tbody>
              </table>) },
            { id: 'current', label: 'Current declared state', panel: (
              <p>{w.current.state.toUpperCase()} · level {w.current.level ?? 'none'} · context version {w.current.context_version} · {w.current.event_count} event(s) in all
                {w.current.last_event !== null && <> · last: {w.current.last_event.event} at <bdi className="eye-mono">{w.current.last_event.occurred_at}</bdi></>}
                {w.current.attention_state !== 'none' && <> · marked for attention: {w.current.attention_state}</>}</p>) },
          ]} />
        </>
      )}
      {link !== null && (
        <form onSubmit={reopen} className="eye-history-row">
          <label htmlFor="wao-at">Open at another instant (ISO, with its zone)</label>
          <input id="wao-at" className="eye-palette-input" value={instant} onChange={(e) => setInstant(e.target.value)} inputMode="text" spellCheck={false} />
          <button type="submit" className="eye-link-button">Open this instant</button>
        </form>
      )}
    </>
  );
}
