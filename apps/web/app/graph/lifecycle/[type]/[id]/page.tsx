'use client';
/**
 * CP-6 B50 §LC — A WORK OBJECT'S LIFECYCLE (F-P3-02: PR-06-002/005, CAP-AU-07; V03-T-021): `/graph/lifecycle/<TYPE>/<id>[?asOf=<instant>]` opens
 * EXACTLY the object it names or says it cannot. Every recorded version with its state read through the server's profile; every ATTEMPTED
 * transition — accepted, rejected (in the server's words, kept with the version that stayed authoritative), compensated — with its kind,
 * cause and re-entry reason; the proposals with the owner's decisions; what is UNRESOLVED (refused since the last acceptance, open proposals);
 * the REPLAY at an instant (the link's, or one chosen): the state recorded by then, the later versions and attempts counted, never folded in.
 * This page reads only; the acts live on the object's own page.
 */
import { Suspense, useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useShell } from '../../../layout';
import { isoInstant, routeId } from '../../../../../lib/object-b81';
import { LINK_OUTCOME_WORDS } from '../../../../../lib/shell-b80';
import { REENTRY_REASONS_WEB, lifecycle, lifecycleFromProfile, replayWords, type ServerProfile } from '../../../../../lib/lifecycle-b50';
import { ErrorNote, Receipt, inputStyle } from '../../../../../components/ui';
import { Empty, GovernedButton } from '../../../../../components/observation';
import { Timestamp } from '../../../../../components/text';
import { LifecycleHistory } from '../../../../../components/knowledge';

type Row = Record<string, unknown>;
type Err = { code: string; message: string; correlationId: string } | null;
const OBJECT_PAGES: Readonly<Record<string, (id: string) => string>> = { ASM: (id) => `/intelligence/assessments/${id}` };

/** ONE h1 per rendering (lib/layout-b81's REG-03 ratchet). */
function PageTitle({ children }: { children: import('react').ReactNode }) { return <h1>{children}</h1>; }

export default function LifecyclePage() { return <Suspense fallback={null}><Lifecycle /></Suspense>; }

function Lifecycle() {
  const { scope } = useShell();
  const params = useParams<{ type: string; id: string }>();
  const search = useSearchParams();
  const type = typeof params.type === 'string' && /^[A-Z]{3}$/.test(params.type) ? params.type : null;
  const id = routeId(params.id);
  const linkAsOf = search.get('asOf');
  const asOf = linkAsOf === null ? null : isoInstant(linkAsOf);
  const [life, setLife] = useState<Row | null>(null); const [receipt, setReceipt] = useState<{ policyDecisionId: string; auditSeq: number } | null>(null);
  const [profile, setProfile] = useState<ServerProfile | null>(null); const [err, setErr] = useState<Err>(null);
  const [replay, setReplay] = useState<Row | null>(null); const [replayErr, setReplayErr] = useState<string | null>(null); const [at, setAt] = useState(asOf ?? '');

  const load = useCallback(async () => {
    if (type === null || id === null) return;
    const [h, p] = await Promise.all([lifecycle.history(scope, type, id), lifecycle.profiles(scope)]);
    if (!h.ok || h.data === undefined || (h.data.lifecycle['object'] as Row | undefined)?.['object_id'] !== id) {
      setErr(h.error ?? { code: 'EYE-OBJ', message: 'the answer did not name the object the link names', correlationId: '—' }); return;
    }
    setLife(h.data.lifecycle); setReceipt(h.data.receipt); setErr(null);
    if (p.ok && p.data !== undefined) setProfile(p.data.profiles.find((x) => x.object_type === type) ?? null);
    if (asOf !== null) {
      const r = await lifecycle.replay(scope, type, id, asOf);
      if (r.ok && r.data !== undefined) setReplay(r.data.replay); else setReplayErr(r.error?.message ?? 'The replay was not read. Check the instant, then try again.');
    }
  }, [scope, type, id, asOf]);
  useEffect(() => { void load(); }, [load]);

  if (type === null || id === null || (linkAsOf !== null && asOf === null)) {
    return <><PageTitle>Lifecycle</PageTitle><p role="alert"><strong>Not opened.</strong> {LINK_OUTCOME_WORDS.invalid}</p><p><Link href="/graph/lifecycle">Open the lifecycle register instead</Link></p></>;
  }
  if (err !== null) return <><PageTitle>Lifecycle</PageTitle><p><strong>Not opened.</strong> {LINK_OUTCOME_WORDS.unavailable}</p><ErrorNote error={err} /><p><Link href="/graph/lifecycle">Open the lifecycle register instead</Link> (the nearest safe state).</p></>;
  if (life === null) return <Empty>reading the lifecycle…</Empty>;

  const o = life['object'] as Row; const reading = lifecycleFromProfile(profile, String(o['state']));
  const unresolved = (life['unresolved'] ?? {}) as Row; const refusedSince = (unresolved['refused_since_last'] ?? []) as Row[];
  const proposals = (life['proposals'] ?? []) as Row[];
  const page = OBJECT_PAGES[type];
  return (
    <>
      <PageTitle>Lifecycle of {String(o['title'] ?? `${type} ${id.slice(0, 8)}…`)}</PageTitle>
      <p className="eye-shell-meta">{type} <bdi dir="ltr" className="eye-mono-wrap">{id}</bdi> · version {String(o['version'])} · <span aria-hidden="true">{reading.glyph}</span> {reading.label}{reading.code === null ? null : ` (${reading.code})`}
        {' · '}{life['governed_here'] === true ? 'moved through the work-object lifecycle' : `moved by ${profile?.owning_port ?? 'its own port'}`} · the ledger {String(life['agreement']).replace(/_/g, ' ')}
        {page === undefined ? null : <> · <Link href={page(id)}>Open the object&apos;s page (its acts)</Link></>}</p>
      {receipt === null ? null : <Receipt receipt={receipt} />}

      <section aria-labelledby="unresolved-h">
        <h2 id="unresolved-h">Unresolved</h2>
        {refusedSince.length === 0 && Number(unresolved['open_proposals'] ?? 0) === 0 ? <p>Nothing is unresolved: no attempt was refused since the last accepted transition and no proposal is open.</p> : (
          <ul>
            {refusedSince.map((r) => <li key={String(r['transition_id'])}>{String(r['action'])} refused at <Timestamp value={String(r['at'])} /> — {String(r['message'])}</li>)}
            {Number(unresolved['open_proposals'] ?? 0) > 0 ? <li>{String(unresolved['open_proposals'])} proposal(s) await the owner&apos;s decision.</li> : null}
          </ul>
        )}
      </section>

      <section aria-labelledby="replay-h">
        <h2 id="replay-h">Replay at an instant</h2>
        {replay === null ? null : <p role="status">{replayWords(replay)}</p>}
        {replayErr === null ? null : <p role="alert">{replayErr}</p>}
        <label htmlFor="lc-asof">The instant (ISO 8601 with its zone, e.g. 2026-10-19T09:00:00Z)</label>
        <input id="lc-asof" style={inputStyle} value={at} onChange={(e) => setAt(e.target.value)} autoComplete="off" />
        <GovernedButton label="Read the state at that instant" pendingLabel="reading…" disabled={isoInstant(at.trim()) === null}
          onRun={async () => {
            setReplayErr(null);
            const r = await lifecycle.replay(scope, type, id, at.trim());
            if (r.ok && r.data !== undefined) setReplay(r.data.replay); else setReplayErr(r.error?.message ?? 'The replay was not read. Check the instant, then try again.');
          }} />
      </section>

      <h2>The record</h2>
      <LifecycleHistory type={type} id={id} profile={profile} versions={(life['versions'] ?? []) as Row[]} transitions={(life['transitions'] ?? []) as Row[]} />
      {((life['transitions'] ?? []) as Row[]).some((t) => t['kind'] !== 'forward') ? (
        <ul className="eye-help" aria-label="Re-entries and compensations">
          {((life['transitions'] ?? []) as Row[]).filter((t) => t['kind'] !== 'forward' && t['outcome'] !== 'rejected').map((t) => (
            <li key={String(t['transition_id'])}>{String(t['kind']).replace(/_/g, ' ')} {String(t['action'])}: {t['reentry_reason'] === null || t['reentry_reason'] === undefined ? '' : `${REENTRY_REASONS_WEB[String(t['reentry_reason'])] ?? String(t['reentry_reason'])}; `}
              caused by <bdi dir="ltr" className="eye-mono-wrap">{String(t['causation_id'] ?? t['compensates'] ?? '—')}</bdi></li>
          ))}
        </ul>
      ) : null}

      <section aria-labelledby="proposals-h">
        <h2 id="proposals-h">Proposals</h2>
        {proposals.length === 0 ? <p>No proposal is recorded for this object.</p> : (
          <table className="eye-table">
            <caption>Proposed transitions — never authoritative; the owner decides</caption>
            <thead><tr><th scope="col">Proposed</th><th scope="col">By</th><th scope="col">Why</th><th scope="col">Decision</th></tr></thead>
            <tbody>{proposals.map((p) => {
              const d = (p['decision'] ?? null) as Row | null;
              return (
                <tr key={String(p['proposal_id'])}>
                  <td>{String(p['action'])} on v{String(p['base_version'])} (<Timestamp value={String(p['proposed_at'])} />)</td>
                  <td>{String(p['via'])} · {String(p['proposer_kind'])}</td>
                  <td>{String(p['reason'])}</td>
                  <td>{d === null ? 'open — awaiting the owner' : `${String(d['decision'])}: ${String(d['reason'])}`}</td>
                </tr>
              );
            })}</tbody>
          </table>
        )}
      </section>
    </>
  );
}
