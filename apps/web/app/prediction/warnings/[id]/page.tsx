'use client';
/**
 * CP-6 B81 §OB — THE WARNING'S OWN PAGE (UX-12-001, UX-25-001…003, PAT-01, PAT-12; the act's scene "opening the Bab el-Mandeb disruption
 * warning … comparing two warning versions aligns the changed evidence and the actor").
 *
 * `/prediction/warnings/<id>` opens EXACTLY the warning it names, under the canonical object header. A link to a missing, another tenant's
 * or an unauthorized warning answers the same words (nothing about existence leaks) and never shows another warning. The warning's VERSIONS
 * are its recorded instants (one per event of its append-only history, with who acted); two of them are COMPARED on the server's own as-of
 * reconstruction (B80's prediction.warning_as_of) and the context recorded in force at each instant (contradicting evidence, affected
 * objects, falsification, playbook) through the library's DiffViewer. A warning carries no approval, so the authority column reads "acted
 * by" (Q7). Opening, comparing and following an as-of link READ only — the reads leave their own access evidence; nothing is acknowledged.
 * The acts (acknowledge, set the context, close) stay on the warnings page behind their own gates. Records shown in tests are SYNTHETIC.
 */
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useShell } from '../../layout';
import { prediction, type WarningRow } from '../../../../lib/prediction';
import { warningLifecycle, originWords, type Lifecycle } from '../../../../lib/warning-lifecycle';
import { LINK_OUTCOME_WORDS, encodeDeepLink, warningAsOf } from '../../../../lib/shell-b80';
import { WARNING_COMPARE_FIELDS, routeId, warningCompareRecord, warningVersionPoints, type ObjectHeaderInput } from '../../../../lib/object-b81';
import { ObjectHeader } from '../../../../components/object';
import { DiffViewer, type DiffSide } from '../../../../components/data';
import { Button } from '../../../../components/actions';
import { Select } from '../../../../components/forms';
import { ErrorNote } from '../../../../components/ui';
import { Empty, fmtInstant } from '../../../../components/observation';
/* B81 integration (UX-11-005) */ import { RecoveryPanel } from '../../../../components/recovery'; import { recoveryOfRefusedLink } from '../../../../lib/degraded-b81'; /* end B81 integration */

/** B81 integration: ONE h1 per rendering (lib/layout-b81's REG-03 ratchet) — every branch (not opened, loading, the object) titles
 *  the page through this one element. */
function PageTitle({ children }: { children: import('react').ReactNode }) { return <h1>{children}</h1>; }


type Err = { code: string; message: string; correlationId: string } | null;
type Receipt = { policyDecisionId: string; auditSeq: number };
interface Compared { before: DiffSide; after: DiffSide; problems: string[] }

export default function WarningObjectPage() {
  const { scope, isForecastOwner } = useShell();
  const params = useParams<{ id: string }>();
  const id = routeId(params.id);
  const [w, setW] = useState<WarningRow | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [life, setLife] = useState<Lifecycle | null>(null);
  const [lifeErr, setLifeErr] = useState<Err>(null);
  const [err, setErr] = useState<Err>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [compared, setCompared] = useState<Compared | null>(null);
  const [compareErr, setCompareErr] = useState<Err>(null);

  useEffect(() => {
    setW(null); setErr(null); setLife(null); setLifeErr(null); setCompared(null); setCompareErr(null);
    if (id === null) return;
    void (async () => {
      const r = await prediction.getWarning(scope, id);
      // the page opens EXACTLY what the link names: a different record in the answer is refused, never shown
      if (!r.ok || r.data === undefined || r.data.warning.warning_id !== id) { setErr(r.error ?? { code: 'EYE-OBJ', message: 'the answer did not name the warning the link names', correlationId: '—' }); return; }
      setW(r.data.warning); setReceipt(r.data.receipt);
      const l = await warningLifecycle.lifecycle(scope, id);
      if (l.ok && l.data !== undefined) setLife(l.data.lifecycle); else setLifeErr(l.error ?? null);
    })();
  }, [scope, id]);

  const points = useMemo(() => (life === null ? [] : warningVersionPoints(life.events)), [life]);
  useEffect(() => {
    if (points.length === 0) return;
    setFrom((p) => p || String(points[0]!.at ?? ''));
    setTo((p) => p || String(points[points.length - 1]!.at ?? ''));
  }, [points]);

  if (id === null) {
    return <><PageTitle>Warning</PageTitle><p role="alert"><strong>Not opened.</strong> {LINK_OUTCOME_WORDS.invalid}</p><p><Link href="/prediction/warnings">Open the current warnings instead</Link></p></>;
  }
  if (err !== null) {
    return (
      <>
        <PageTitle>Warning</PageTitle>
        <p><strong>Not opened.</strong> {LINK_OUTCOME_WORDS.unavailable}</p>
        <ErrorNote error={err} />
        <RecoveryPanel model={recoveryOfRefusedLink('warning')} />
        <p><Link href="/prediction/warnings">Open the current warnings instead</Link> (the nearest safe state).</p>
      </>
    );
  }
  if (w === null) return <Empty>reading the warning…</Empty>;

  const rec = w as unknown as Record<string, unknown>;
  const openAt = (at: string | null) => (at === null ? null : encodeDeepLink({ kind: 'warning', id, version: null, asOf: at, from: null }));
  const input: ObjectHeaderInput = {
    type: 'WRN', id: w.warning_id, title: w.title, version: null, versionCount: life === null ? null : points.length,
    owner: w.routed_to, ownerRole: 'routed owner', serverState: w.state, truth: null,
    synthetic: w.controls === null || w.controls === undefined ? null : w.controls.synthetic_state, classification: w.controls?.classification ?? null,
    time: [{ label: 'Raised as of', value: fmtInstant(w.raised_as_of ?? w.raised_at) }, { label: 'Window closes', value: fmtInstant(w.response_window_closes_at) },
      { label: 'Recorded', value: fmtInstant(w.raised_at) }],
    trust: `confidence ${Number(w.confidence).toFixed(2)} · origin ${originWords(rec['origin_kind'])}${life === null ? '' : ` · ${life.coverage_gaps.count} coverage gap(s) on the sources it rests on`}`,
    authority: `A warning carries no approval: each recorded instant below names who acted.${w.acknowledged_by === null ? ' Not acknowledged.' : ` Acknowledged by ${w.acknowledged_by}.`}`,
    relationships: [
      ...(w.forecast_id === null ? [] : [{ label: 'the forecast it was raised from', href: `/prediction/forecasts/${w.forecast_id}` }]),
      ...(life === null ? [] : [{ label: `${life.affected.objectives.length} affected objective(s), ${life.members.length} clustered report(s)`, href: null }]),
    ],
    provenance: [{ label: `${w.evidence.length} evidence reference(s) cited at the raise`, href: null }, { label: `origin: ${originWords(rec['origin_kind'])}`, href: null }],
    receipt, effective: { support: 'honoured', asOf: null },
    eligible: { review: { can: isForecastOwner, reason: isForecastOwner ? null : 'you hold no forecast_owner binding in this domain — the acknowledgement and the closure are refused from anyone else' } },
  };

  const pointAt = (at: string) => points.find((p) => p.at === at) ?? null;
  const compare = async () => {
    setCompared(null); setCompareErr(null);
    const a = pointAt(from); const b = pointAt(to);
    if (a === null || b === null || life === null) return;
    const [ra, rb] = await Promise.all([warningAsOf(scope, id, from), warningAsOf(scope, id, to)]);
    if (!ra.ok || ra.data === undefined) { setCompareErr(ra.error ?? null); return; }
    if (!rb.ok || rb.data === undefined) { setCompareErr(rb.error ?? null); return; }
    const ca = warningCompareRecord(ra.data.warning.as_of, life.events, from);
    const cb = warningCompareRecord(rb.data.warning.as_of, life.events, to);
    const side = (p: typeof a, c: typeof ca): DiffSide => ({
      record: c.record, title: `instant ${p.n} — ${p.event}`, source: 'the server\'s as-of reconstruction (prediction.warning_as_of) and the context recorded in force',
      author: c.actedBy, at: p.at, authority: `acted by ${c.actedBy ?? 'not recorded'} (a warning carries no approval)`,
    });
    setCompared({ before: side(a, ca), after: side(b, cb), problems: [ca.problem, cb.problem].filter((x): x is string => x !== null) });
  };

  return (
    <>
      <p className="eye-shell-meta"><Link href="/prediction/warnings">← Warnings</Link></p>
      <ObjectHeader input={input} version={{ compare: { label: 'Compare two recorded instants', anchor: 'warning-versions' } }} />

      <section aria-labelledby="warning-versions" className="eye-object-versions">
        <h2 id="warning-versions" style={{ fontSize: 'var(--eye-type-heading-2)' }}>Recorded instants</h2>
        {lifeErr !== null ? <><p>The event history could not be read, so no instant can be compared.</p><ErrorNote error={lifeErr} /></> : life === null ? <Empty>reading the event history…</Empty> : (
          <>
            <table className="eye-table">
              <caption>Every event of the warning&apos;s append-only history, oldest first — each is a recorded instant its state can be opened at. &quot;Acted by&quot; names the person or service that recorded it; a warning carries no approval.</caption>
              <thead><tr><th scope="col">#</th><th scope="col">Event</th><th scope="col">Recorded at</th><th scope="col">Acted by</th><th scope="col">Context version</th><th scope="col">Open</th></tr></thead>
              <tbody>
                {points.map((p) => {
                  const href = openAt(p.at);
                  return (
                    <tr key={`${p.n}-${p.at}`}>
                      <td data-label="#">{p.n}</td>
                      <td data-label="Event">{p.event}</td>
                      <td data-label="Recorded at"><bdi className="eye-mono">{p.at ?? 'not recorded'}</bdi></td>
                      <td data-label="Acted by"><bdi className="eye-mono-wrap">{p.actedBy}</bdi></td>
                      <td data-label="Context version">{p.contextVersion ?? '—'}</td>
                      <td data-label="Open">{href === null ? 'no instant recorded' : <Link href={href}>The state as of this instant</Link>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {points.length < 2 ? <p>Only one instant is recorded, so there is nothing to compare yet.</p> : (
              <div className="eye-object-pick">
                <Select id="wv-from" label="Compare from (the earlier instant)" value={from} onChange={(v) => { setFrom(v); setCompared(null); }}
                  options={points.map((p) => ({ value: String(p.at ?? ''), label: `${p.n} — ${p.event} at ${p.at ?? '?'}` }))} />
                <Select id="wv-to" label="Compare to" value={to} onChange={(v) => { setTo(v); setCompared(null); }}
                  options={points.map((p) => ({ value: String(p.at ?? ''), label: `${p.n} — ${p.event} at ${p.at ?? '?'}` }))} />
                <Button label="Compare the two instants" pendingLabel="reading both instants" variant="secondary" onClick={compare}
                  disabledReason={from === '' || to === '' ? 'choose two recorded instants' : from === to ? 'choose two different instants' : null} />
              </div>
            )}
            <ErrorNote error={compareErr} />
            {compared === null ? null : (
              <>
                {compared.problems.length === 0 ? null : (
                  <p role="status" className="eye-object-unresolved">INDETERMINATE — {compared.problems.join('; ')}. The fields below are the server&apos;s as-of state; the context column is not reconciled.</p>
                )}
                <DiffViewer label="The warning at two recorded instants — changed evidence, affected objects and the actor aligned" before={compared.before} after={compared.after} fields={[...WARNING_COMPARE_FIELDS]} />
              </>
            )}
          </>
        )}
      </section>
      <p className="eye-help">The acts on a warning — acknowledge, set its context, close it on a criterion — are on <Link href="/prediction/warnings">the warnings page</Link>, each behind its own gate. Closing (criterion &quot;no longer relevant&quot;) is the warning&apos;s withdrawal; nothing on this page changes the warning.</p>
    </>
  );
}
