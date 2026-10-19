'use client';
/**
 * CP-6 B81 §OB — THE DECISION PACKAGE'S OWN PAGE (UX-12-001…005, UX-25-001…005, PAT-01, PAT-12; the act's scene: the reroute package under
 * the same header grammar as the warning, the forecast and the twin snapshot; "the package's versions show the actual approvers").
 *
 * `/decisions/packages/<id>[?v=<n>]` opens EXACTLY the package and the version it names: a version the package does not record is SAID, never
 * replaced by another one; a missing, another tenant's or an unauthorized package answers the server's words and nothing about existence.
 * The header's authority is the approvals RECORDED on the shown version (who, on which digest, live or not) — never inferred. Two versions
 * are compared field by field (choice, options, approvals, dissent, policy, digest) through the library's DiffViewer, from ONE read, so the
 * two sides are the same record. The governed acts (propose, approve, commit, sign, dissent, replay) stay on the decisions page behind their
 * gates and the Command Review (§HA); this page reads only — the read leaves its own access evidence. Records shown in tests are SYNTHETIC.
 */
import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useShell } from '../../layout';
import { decisions, type Package, type PackageVersion } from '../../../../lib/decisions';
import { gates, type GateStatus } from '../../../../lib/gates';
import { LINK_OUTCOME_WORDS } from '../../../../lib/shell-b80';
import { PACKAGE_COMPARE_FIELDS, packageCompareRecord, routeId, routeVersion, type ObjectHeaderInput } from '../../../../lib/object-b81';
import { ObjectHeader } from '../../../../components/object';
import { DiffViewer } from '../../../../components/data';
import { Select } from '../../../../components/forms';
import { Digest } from '../../../../components/text';
import { ErrorNote } from '../../../../components/ui';
import { Empty, fmtInstant } from '../../../../components/observation';
/* B81 har: the CONTEST PATH on the package version (HX-14) */ import { SubjectContest } from '../../contest-panel'; import { rolesIn } from '../../../../lib/authority-b81'; /* end B81 har */
/* B81 integration (UX-11-005) */ import { RecoveryPanel } from '../../../../components/recovery'; import { recoveryOfRefusedLink } from '../../../../lib/degraded-b81'; /* end B81 integration */
/* B82 ev: the option citations resolved at the point of use (CMP-026, UX-ADR-006, HX-01) */
import { CitationLink, EvidenceDisclosure } from '../../../../components/evidence';
import { useCitationResolutions } from '../../../../lib/evidence-api-b82';
import { citationKey, evidenceDisclosure, parseCitations } from '../../../../lib/evidence-b82';
/* end B82 ev */

/** B81 integration: ONE h1 per rendering (lib/layout-b81's REG-03 ratchet) — every branch (not opened, loading, the object) titles
 *  the page through this one element. */
function PageTitle({ children }: { children: import('react').ReactNode }) { return <h1>{children}</h1>; }


type Err = { code: string; message: string; correlationId: string } | null;
type Receipt = { policyDecisionId: string; auditSeq: number };

export default function PackageObjectPage() {
  return <Suspense fallback={null}><PackageObjectView /></Suspense>;
}

function PackageObjectView() {
  const { scope, me, isDecisionOwner } = useShell();
  const params = useParams<{ id: string }>();
  const search = useSearchParams();
  const id = routeId(params.id);
  const vParam = search.get('v');
  const asked = vParam === null ? null : routeVersion(vParam);
  const [pkg, setPkg] = useState<Package | null>(null);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [err, setErr] = useState<Err>(null);
  const [gate, setGate] = useState<GateStatus | null>(null);
  const [gateErr, setGateErr] = useState<Err>(null);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  useEffect(() => {
    setPkg(null); setErr(null);
    if (id === null) return;
    void (async () => {
      const r = await decisions.get(scope, id);
      if (!r.ok || r.data === undefined || r.data.package.package_id !== id) { setErr(r.error ?? { code: 'EYE-OBJ', message: 'the answer did not name the package the link names', correlationId: '—' }); return; }
      setPkg(r.data.package); setReceipt(r.data.receipt);
      const vs = [...r.data.package.versions].sort((a, b) => a.version - b.version);
      setFrom(String(vs.length > 1 ? vs[vs.length - 2]!.version : vs[0]?.version ?? '')); setTo(String(vs[vs.length - 1]?.version ?? ''));
    })();
  }, [scope, id]);

  const versions = pkg === null ? [] : [...pkg.versions].sort((a, b) => a.version - b.version);
  const latest = versions.length === 0 ? null : versions[versions.length - 1]!.version;
  const shownNumber = asked === null || asked === 'latest' ? (pkg?.current_version ?? latest) : asked;
  const shown: PackageVersion | null = versions.find((v) => v.version === shownNumber) ?? null;
  /* B82 ev */
  const evRefs = useMemo(() => (shown === null ? [] : parseCitations(shown.options.flatMap((o) => o.consequences)).refs), [shown]);
  const evRes = useCitationResolutions(scope, evRefs);
  /* end B82 ev */

  useEffect(() => {
    setGate(null); setGateErr(null);
    if (id === null || shown === null) return;
    void (async () => {
      const g = await gates.status(scope, id, shown.version);
      if (g.ok && g.data !== undefined) setGate(g.data.gate); else setGateErr(g.error ?? null);
    })();
  }, [scope, id, shown?.version]); // eslint-disable-line react-hooks/exhaustive-deps

  if (id === null || (vParam !== null && asked === null)) {
    return <><PageTitle>Decision package</PageTitle><p role="alert"><strong>Not opened.</strong> {LINK_OUTCOME_WORDS.invalid}</p><p><Link href="/decisions">Open the decision packages instead</Link></p></>;
  }
  if (err !== null) {
    return <><PageTitle>Decision package</PageTitle><p><strong>Not opened.</strong> {LINK_OUTCOME_WORDS.unavailable}</p><ErrorNote error={err} /><RecoveryPanel model={recoveryOfRefusedLink('decision package')} /><p><Link href="/decisions">Open the decision packages instead</Link> (the nearest safe state).</p></>;
  }
  if (pkg === null) return <Empty>reading the decision package…</Empty>;
  if (shown === null) {
    return (
      <>
        <PageTitle>{pkg.title}</PageTitle>
        <p role="alert"><strong>Not opened.</strong> The link names version {String(shownNumber)}, which this package does not record ({versions.length} version(s) are recorded). No other version is shown in its place.</p>
        <p><Link href={`/decisions/packages/${id}`}>Open the package&apos;s current version instead</Link></p>
      </>
    );
  }

  const cmp = packageCompareRecord(shown);
  const controls = pkg.controls as Record<string, unknown>;
  const cited = shown.options.reduce((n, o) => n + o.consequences.length, 0);
  const held = gate?.conditions?.held === true;
  const input: ObjectHeaderInput = {
    type: 'DPK', id: pkg.package_id, title: pkg.title, version: shown.version, versionCount: versions.length, latestVersion: latest,
    owner: pkg.owner_principal_id, ownerRole: 'decision owner', serverState: shown.state, conditions: { blocked: held }, truth: null,
    synthetic: pkg.synthetic_state, classification: typeof controls['classification'] === 'string' ? controls['classification'] as string : null,
    time: [{ label: 'Declared', value: fmtInstant(pkg.declared_at) }, { label: 'Version proposed', value: shown.proposed_at === null ? null : fmtInstant(shown.proposed_at) },
      { label: 'Version known at', value: fmtInstant(shown.known_at) }, { label: 'Decided', value: pkg.decided_at === null ? 'not decided' : fmtInstant(pkg.decided_at) }],
    trust: gate === null ? (gateErr === null ? 'reading the gate status…' : `gate status not read — ${gateErr.message}`)
      : `${pkg.decision_class ?? 'standard'} decision · gate ${gate.state}${held ? ' · COMMITMENT HELD — an approval condition does not hold' : ''} · ${gate.conditions.failed} failed condition(s)`,
    authority: `${cmp.authority}. Approver policy: quorum ${String(shown.approver_policy.quorum ?? 'not stated')}${(shown.approver_policy.roles ?? []).length > 0 ? `, roles ${(shown.approver_policy.roles ?? []).join(', ')}` : ''}. The owner and the proposer never approve their own version.`,
    relationships: [
      { label: `package state: ${pkg.state.replace(/_/g, ' ')}${pkg.committed_version === null ? '' : ` · committed version v${pkg.committed_version}`}`, href: null },
      ...(pkg.decision === null || pkg.decision === undefined ? [] : [{ label: `decision: ${pkg.decision.title} (${pkg.decision.status})`, href: null }]),
    ],
    provenance: [{ label: `${cited} cited consequence(s) across ${shown.options.length} option(s) (runs, forecasts, claims, evidence — each version- and digest-bound)`, href: /* B82 ev */ '#package-citations' /* end B82 ev */ },
      ...(shown.baseline_run_id === null ? [] : [{ label: 'the baseline run', href: null }])],
    receipt, effective: { support: 'live_only', asOf: null },
    eligible: { propose: { can: isDecisionOwner, reason: isDecisionOwner ? null : 'you hold no decision_owner binding in this domain' } },
  };
  const a = versions.find((v) => String(v.version) === from) ?? null;
  const b = versions.find((v) => String(v.version) === to) ?? null;
  const side = (v: PackageVersion) => { const c = packageCompareRecord(v); return { record: c.record, title: `v${v.version} (${v.state})`, source: 'decision.read — one read of the package', author: pkg.owner_principal_id, at: v.proposed_at ?? v.known_at, authority: c.authority }; };

  return (
    <>
      <p className="eye-shell-meta"><Link href="/decisions">← Decision packages</Link></p>
      <ObjectHeader input={input} version={{ compare: { label: 'Compare two versions', anchor: 'package-versions' } }} />
      <p>{pkg.statement}</p>
      {shown.version_digest === null ? <p className="eye-object-unresolved">This version carries no digest yet (it is a draft): nothing can be approved against it.</p>
        : <p>Version digest <Digest value={shown.version_digest} /> — an approval binds exactly this digest.</p>}

      <section aria-labelledby="package-versions" className="eye-object-versions">
        <h2 id="package-versions" style={{ fontSize: 'var(--eye-type-heading-2)' }}>Versions</h2>
        <table className="eye-table">
          <caption>Every version of the package, oldest first, with the approvals actually recorded on it.</caption>
          <thead><tr><th scope="col">Version</th><th scope="col">State</th><th scope="col">Digest</th><th scope="col">Proposed</th><th scope="col">Approvals (the approvers)</th><th scope="col">Dissent</th><th scope="col">Open</th></tr></thead>
          <tbody>
            {versions.map((v) => (
              <tr key={v.version}>
                <td data-label="Version">v{v.version}{v.version === shown.version ? ' (shown)' : ''}</td>
                <td data-label="State">{v.state.replace(/_/g, ' ')}</td>
                <td data-label="Digest">{v.version_digest === null ? 'none (draft)' : <bdi className="eye-mono">{v.version_digest.slice(0, 12)}…</bdi>}</td>
                <td data-label="Proposed">{v.proposed_at === null ? 'not proposed' : fmtInstant(v.proposed_at)}</td>
                <td data-label="Approvals (the approvers)">{packageCompareRecord(v).authority}</td>
                <td data-label="Dissent">{v.dissent.length}</td>
                <td data-label="Open">{v.version === shown.version ? 'shown' : <Link href={`/decisions/packages/${id}?v=${v.version}`}>Open v{v.version}</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {versions.length < 2 ? <p>Only one version is recorded, so there is nothing to compare yet.</p> : (
          <>
            <div className="eye-object-pick">
              <Select id="pv-from" label="Compare from" value={from} onChange={setFrom} options={versions.map((v) => ({ value: String(v.version), label: `v${v.version} (${v.state})` }))} />
              <Select id="pv-to" label="Compare to" value={to} onChange={setTo} options={versions.map((v) => ({ value: String(v.version), label: `v${v.version} (${v.state})` }))} />
            </div>
            {a === null || b === null || a.version === b.version ? <p>Choose two different versions.</p>
              : <DiffViewer label={`Package v${a.version} against v${b.version} — fields, approvers and dissent aligned`} before={side(a)} after={side(b)} fields={[...PACKAGE_COMPARE_FIELDS]} />}
          </>
        )}
      </section>
      {/* B82 ev — every option's citations resolved to their exact evidence on this page (a drawer per citation; the bytes behind the existing evidence read) */}
      <section aria-labelledby="package-citations" className="eye-object-versions">
        <h2 id="package-citations" style={{ fontSize: 'var(--eye-type-heading-2)' }}>Citations of v{shown.version}</h2>
        {evRes.state === 'refused' && <><p className="eye-ev-note">The citations were not resolved on this read:</p><ErrorNote error={evRes.error} /></>}
        {evRes.state === 'ready' && <EvidenceDisclosure model={evidenceDisclosure([...evRes.byKey.values()], { digest: evRes.digests[0] ?? null })} />}
        {shown.options.length === 0 ? <p>This version records no option, so it cites nothing.</p> : (
          <ul className="eye-ev-lines">
            {shown.options.map((o) => (
              <li key={o.option_id}>
                <strong>{o.title}</strong> ({o.key}) — {o.consequences.length === 0 ? 'cites nothing' : `${o.consequences.length} citation(s):`}
                {o.consequences.length > 0 && (
                  <ul className="eye-ev-lines">
                    {o.consequences.map((c) => (
                      <li key={citationKey(c)}><CitationLink citation={c} scope={scope} resolution={evRes.state === 'ready' ? evRes.byKey.get(citationKey(c)) ?? null : evRes.state === 'refused' ? null : undefined} /></li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      {/* end B82 ev */}
      {/* B81 har: the CONTEST PATH (HX-14) — the challenges on the shown version and the appeal cases on the package */}
      <SubjectContest scope={scope} roles={rolesIn(me.bindings, scope)} type="DPK" appealKind="package" subjectId={pkg.package_id} explanation={{ kind: 'package_version', version: shown.version }}
        challenges={{ packageId: pkg.package_id, version: shown.version }} />
      {/* end B81 har */}
      <p className="eye-help">Proposing, approving, committing and signing are on <Link href="/decisions">the decisions page</Link>, behind the package&apos;s gates; this page changes nothing.</p>
    </>
  );
}
