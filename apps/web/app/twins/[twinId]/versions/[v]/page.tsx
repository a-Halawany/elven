'use client';
/**
 * CP-6 B81 §OB — A TWIN SNAPSHOT'S OWN PAGE (UX-12-001…005, UX-25-001…005, PAT-01, PAT-12; the act's scene: a T. Nakamura twin snapshot under
 * the same header grammar as the warning, the forecast and the package).
 *
 * `/twins/<twinId>/versions/<v>` opens EXACTLY that version of the twin (`latest` opens the highest version the twin records and SAYS which
 * one it resolved to; the durable reference names the number). A version the twin does not record is said, never replaced; a missing,
 * another tenant's or an unauthorized twin answers the server's words. The header's authority is the version's own record (admitted by its
 * owner on its state-set digest, validated by a named person) — never inferred. Comparing with another version reads the server's own
 * compare (twin.read …/compare: same, only-in, differing, with the fields that changed) and aligns the element records in the library's
 * DiffViewer. Simulated values are SYNTHETIC and shown as such. Reads only; validation, admission and runs stay in the explorer.
 */
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useShell } from '../../../layout';
import { twins, type Twin, type TwinVersion } from '../../../../../lib/twins';
import { LINK_OUTCOME_WORDS } from '../../../../../lib/shell-b80';
import { routeId, routeVersion, twinCompareRecord, type ObjectHeaderInput } from '../../../../../lib/object-b81';
import { ObjectHeader } from '../../../../../components/object';
import { DiffViewer } from '../../../../../components/data';
import { Button } from '../../../../../components/actions';
import { Select } from '../../../../../components/forms';
import { ErrorNote } from '../../../../../components/ui';
import { Empty, fmtInstant } from '../../../../../components/observation';
/* B81 integration (UX-11-005) */ import { RecoveryPanel } from '../../../../../components/recovery'; import { recoveryOfRefusedLink } from '../../../../../lib/degraded-b81'; /* end B81 integration */
/* B82 ev: each element's citations a CitationLink, resolved when opened (CMP-026, UX-ADR-006) */ import { CitationLink } from '../../../../../components/evidence'; /* end B82 ev */

/** B81 integration: ONE h1 per rendering (lib/layout-b81's REG-03 ratchet) — every branch (not opened, loading, the object) titles
 *  the page through this one element. */
function PageTitle({ children }: { children: import('react').ReactNode }) { return <h1>{children}</h1>; }


type Err = { code: string; message: string; correlationId: string } | null;
type Receipt = { policyDecisionId: string; auditSeq: number };
interface ServerCompare { same: number; only_in_a: string[]; only_in_b: string[]; differing: Array<{ key: string; changed: string[] }> }

export default function TwinVersionPage() {
  const { scope, isTwinOwner } = useShell();
  const params = useParams<{ twinId: string; v: string }>();
  const twinId = routeId(params.twinId);
  const asked = routeVersion(params.v);
  const [twin, setTwin] = useState<Twin | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [err, setErr] = useState<Err>(null);
  const [other, setOther] = useState('');
  const [server, setServer] = useState<ServerCompare | null>(null);
  const [cmpErr, setCmpErr] = useState<Err>(null);

  useEffect(() => {
    setTwin(null); setErr(null); setServer(null); setCmpErr(null);
    if (twinId === null || asked === null) return;
    void (async () => {
      const r = await twins.get(scope, twinId);
      if (!r.ok || r.data === undefined || r.data.twin.twin_id !== twinId) { setErr(r.error ?? { code: 'EYE-OBJ', message: 'the answer did not name the twin the link names', correlationId: '—' }); return; }
      setTwin(r.data.twin); setReceipt(r.data.receipt);
    })();
  }, [scope, twinId, asked]);

  if (twinId === null || asked === null) {
    return <><PageTitle>Twin snapshot</PageTitle><p role="alert"><strong>Not opened.</strong> {LINK_OUTCOME_WORDS.invalid} A twin snapshot is addressed by its twin and its version number.</p><p><Link href="/twins">Open the twins instead</Link></p></>;
  }
  if (err !== null) {
    return <><PageTitle>Twin snapshot</PageTitle><p><strong>Not opened.</strong> {LINK_OUTCOME_WORDS.unavailable}</p><ErrorNote error={err} /><RecoveryPanel model={recoveryOfRefusedLink('twin snapshot')} /><p><Link href="/twins">Open the twins instead</Link> (the nearest safe state).</p></>;
  }
  if (twin === null) return <Empty>reading the twin…</Empty>;

  const versions = [...twin.versions].sort((a, b) => a.version - b.version);
  const latest = versions.length === 0 ? null : versions[versions.length - 1]!.version;
  const number = asked === 'latest' ? latest : asked;
  const v: TwinVersion | null = versions.find((x) => x.version === number) ?? null;
  if (v === null) {
    return (
      <>
        <PageTitle>{twin.title}</PageTitle>
        <p role="alert"><strong>Not opened.</strong> {asked === 'latest' ? 'The twin records no version yet.' : `The link names version ${String(asked)}, which this twin does not record (${versions.length} version(s) are recorded).`} No other version is shown in its place.</p>
        {latest === null ? null : <p><Link href={`/twins/${twinId}/versions/${latest}`}>Open the latest recorded version (v{latest}) instead</Link></p>}
      </>
    );
  }

  const els = v.elements ?? [];
  const events = (twin.events ?? []).filter((e) => Number((e['details'] as Record<string, unknown> | undefined)?.['version'] ?? NaN) === v.version);
  const admittedBy = events.find((e) => String(e['event']).includes('admit'))?.['actor_principal_id'];
  const fitness = v.fitness;
  const input: ObjectHeaderInput = {
    type: 'TWN', id: twin.twin_id, title: `${twin.title} — v${v.version}`, version: v.version, versionCount: versions.length, latestVersion: latest,
    owner: twin.owner_principal_id, ownerRole: 'twin owner', serverState: v.state, truth: null, synthetic: v.synthetic_state, classification: null,
    time: [{ label: 'Known at', value: fmtInstant(v.known_at) }, { label: 'Observed through', value: v.observed_through }, { label: 'Admitted', value: v.admitted_at === null ? 'not admitted' : fmtInstant(v.admitted_at) }],
    trust: `${v.completeness}${v.missing_keys.length > 0 ? ` (missing ${v.missing_keys.join(', ')})` : ''} · ${v.verification_state} · fitness ${fitness?.state ?? 'not assessed (before 0081)'}`,
    authority: v.state === 'admitted'
      ? `Admitted on state-set digest ${v.state_set_digest?.slice(0, 12) ?? 'not recorded'}…${admittedBy === undefined ? ' (the admitting person is in the twin\'s event history)' : ` by ${String(admittedBy)}`}${fitness !== undefined && fitness.state !== 'none' ? `; validated ${fitness.verdict ?? fitness.state} by ${fitness.validated_by ?? 'not recorded'}` : '; not validated'}`
      : v.state === 'withdrawn' ? `Withdrawn by ${v.withdrawn_by ?? 'not recorded'} — ${v.withdrawal_reason ?? 'no reason recorded'}; its elements are kept` : 'A draft: nothing has admitted it',
    relationships: [
      { label: `branch ${v.branch_id}${v.forked_from_version === null ? '' : ` · forked from v${v.forked_from_version}`}${v.supersedes === null ? '' : ` · supersedes v${v.supersedes}`}`, href: null },
      { label: 'the twin\'s runs', href: '/twins/simulations' },
    ],
    provenance: [{ label: `${els.reduce((n, e) => n + e.citations.length, 0)} citation(s) across ${els.length} element(s) (evidence, claims, entities, forecasts, assumptions, runs)`, href: null }],
    receipt, effective: { support: 'live_only', asOf: null },
    eligible: { review: { can: isTwinOwner, reason: isTwinOwner ? null : 'you hold no twin_owner binding in this domain' } },
  };
  const otherV = versions.find((x) => String(x.version) === other) ?? null;
  const compare = async () => {
    setServer(null); setCmpErr(null);
    if (otherV === null) return;
    const r = await twins.compare(scope, twinId, otherV.version, v.version);
    if (!r.ok || r.data === undefined) { setCmpErr(r.error ?? null); return; }
    setServer(r.data.comparison as unknown as ServerCompare);
  };

  return (
    <>
      <p className="eye-shell-meta"><Link href="/twins">← Twins</Link>{asked === 'latest' ? <> · <strong>latest</strong> resolved to v{v.version} at this read</> : null}</p>
      <ObjectHeader input={input} version={{ compare: { label: 'Compare with another version', anchor: 'twin-versions' } }} />
      <p>{twin.statement}</p>
      <section aria-labelledby="twin-elements">
        <h2 id="twin-elements" style={{ fontSize: 'var(--eye-type-heading-2)' }}>State at v{v.version}</h2>
        {els.length === 0 ? <p>This version records no element.</p> : (
          <table className="eye-table">
            <caption>The {els.length} element(s) of this version — kind, value with its unit, validity, health and citations as recorded.{v.synthetic_state ? ' SYNTHETIC — simulated or assumed state, never observed.' : ''}</caption>
            <thead><tr><th scope="col">Element</th><th scope="col">Kind</th><th scope="col">Value</th><th scope="col">Valid</th><th scope="col">Health</th><th scope="col">Citations</th></tr></thead>
            <tbody>{els.map((e) => (
              <tr key={e.element_id}>
                <td data-label="Element"><bdi className="eye-mono">{e.key}</bdi></td>
                <td data-label="Kind">{e.kind}{e.basis_truth_state === null ? '' : ` (${e.basis_truth_state})`}{e.synthetic_state ? ' · SYNTHETIC' : ''}</td>
                <td data-label="Value">{typeof e.value === 'string' ? e.value : JSON.stringify(e.value)}{e.unit === null ? '' : ` ${e.unit}`}</td>
                <td data-label="Valid">{e.valid_from ?? '—'} … {e.valid_to ?? '—'}</td>
                <td data-label="Health">{e.health}</td>
                <td data-label="Citations">{/* B82 ev */}{e.citations.length === 0 ? 'cites nothing' : e.citations.map((c) => <div key={`${c.kind}:${c.id}@${c.version}`}><CitationLink citation={c} scope={scope} resolution="on_open" /></div>)}{/* end B82 ev */}</td>
              </tr>
            ))}</tbody>
          </table>
        )}
      </section>
      <section aria-labelledby="twin-versions" className="eye-object-versions">
        <h2 id="twin-versions" style={{ fontSize: 'var(--eye-type-heading-2)' }}>Versions</h2>
        <ul className="eye-object-links">
          {versions.map((x) => <li key={x.version}>{x.version === v.version ? <strong>v{x.version} ({x.state}) — shown</strong> : <Link href={`/twins/${twinId}/versions/${x.version}`}>v{x.version} ({x.state})</Link>}</li>)}
        </ul>
        {versions.length < 2 ? <p>Only one version is recorded, so there is nothing to compare yet.</p> : (
          <div className="eye-object-pick">
            <Select id="tv-other" label={`Compare v${v.version} with`} value={other} onChange={(x) => { setOther(x); setServer(null); }}
              options={[{ value: '', label: 'choose a version' }, ...versions.filter((x) => x.version !== v.version).map((x) => ({ value: String(x.version), label: `v${x.version} (${x.state})` }))]} />
            <Button label="Compare the two versions" pendingLabel="reading the server's compare" variant="secondary" onClick={compare} disabledReason={otherV === null ? 'choose another version' : null} />
          </div>
        )}
        <ErrorNote error={cmpErr} />
        {server === null || otherV === null ? null : (
          <>
            <p>The server&apos;s compare of v{otherV.version} → v{v.version}: {server.same} element(s) the same, {server.differing.length} differing ({server.differing.map((d) => `${d.key}: ${d.changed.join(', ')}`).join('; ') || 'none'}), {server.only_in_a.length} only in v{otherV.version}, {server.only_in_b.length} only in v{v.version}.</p>
            <DiffViewer label={`Twin v${otherV.version} against v${v.version} — element by element`}
              before={{ record: twinCompareRecord(otherV.elements ?? []), title: `v${otherV.version} (${otherV.state})`, source: 'twin.read — the version\'s recorded elements', author: twin.owner_principal_id, at: otherV.known_at, authority: otherV.state === 'admitted' ? 'admitted by the twin owner' : otherV.state }}
              after={{ record: twinCompareRecord(els), title: `v${v.version} (${v.state})`, source: 'twin.read — the version\'s recorded elements', author: twin.owner_principal_id, at: v.known_at, authority: v.state === 'admitted' ? 'admitted by the twin owner' : v.state }} />
          </>
        )}
      </section>
      <p className="eye-help">Grounding, admission, validation and runs are in <Link href="/twins/explorer">the twin explorer</Link> and <Link href="/twins/simulations">simulations</Link>, each behind its own gate; this page changes nothing.</p>
    </>
  );
}
