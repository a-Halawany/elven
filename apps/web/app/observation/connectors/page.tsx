'use client';
/**
 * CP-6 B40 §CR — THE CONNECTORS (F-P1-12; DP-14-003, IA-47-005; DESIGN D3, D12). The adapter contracts with the package each runs, the adapter
 * package register, the requalifications and the credential bindings — read from observation.connectors.read (metadata, digests and
 * references only; D9) — and the five human-gated acts, each through B81's CommandReview, each refused in the server's words, nothing
 * optimistic (after an act the page reads the register again):
 *   register a package       collection manager · the files' digest computed HERE and reviewed: a CLIENT-SIDE payload review (the
 *                            server recomputes the digest from the files it stores);
 *   decide a package         a SECOND person (domain admin or another collection manager) · binds the package digest — SERVER-ENFORCED;
 *   submit a requalification collection manager · the package chosen is reviewed client-side; the server runs the contract tests in a cell;
 *   decide a requalification a second person · binds the submitted package digest — SERVER-ENFORCED;
 *   rotate a credential      collection manager · a REFERENCE (EYE_SRC_*), never a value; the payload reviewed client-side.
 * One h1 in every state. THREE CLAIMS: construction (this page); demonstrated operation and real acceptance — never claimed.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useShell } from '../layout';
import { connectorsApi, type Receipt as ReceiptT } from '../../../lib/connectors-api-b40';
import {
  crConsequence, decidePackageFacts, decideRequalificationFacts, packageDigestInput, payloadDigest, registerFacts, rotateFacts, rotationProblems,
  selectionProblems, sha256Hex, submitFacts, toRegister,
  type AdapterContractView, type ConnectorRegisterView, type PackageView, type RequalificationView, type Viewer,
} from '../../../lib/connectors-b40';
import { eligibility } from '../../../lib/authority-b81';
import { CommandReview } from '../../../components/authority';
import { AdapterPackageCard, CellBoundaryNote, RequalificationCard } from '../../../components/connector-cell';
import { Empty, Mono, fmtInstant } from '../../../components/observation';
import { ErrorNote, Receipt, buttonStyle, inputStyle } from '../../../components/ui';

type Problem = { code: string; message: string; correlationId: string };
type Scope = { tenantId: string; domainId: string };
const h2 = { fontSize: 'var(--eye-type-heading-3)', marginBlockStart: 'var(--eye-space-24)' } as const;
const newId = (): string => globalThis.crypto.randomUUID();

/** Run one governed act: the server's answer, or its refusal in its own words (thrown, so the control reads as failed). */
async function act<T>(p: Promise<{ ok: boolean; data?: T; error?: { message: string } }>, onProblem: (m: string | null) => void): Promise<T> {
  const r = await p;
  if (!r.ok || r.data === undefined) { const m = r.error?.message ?? 'the server did not answer'; onProblem(m); throw new Error(m); }
  onProblem(null);
  return r.data;
}

function RegisterPackage({ scope, viewer, onChanged }: { scope: Scope; viewer: Viewer; onChanged: () => void }) {
  const [files, setFiles] = useState<Array<{ file: string; bytes: Uint8Array; sha256: string }>>([]);
  const [digest, setDigest] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | undefined>(undefined);
  const pick = async (list: FileList | null) => {
    const read = await Promise.all([...(list ?? [])].map(async (f) => { const bytes = new Uint8Array(await f.arrayBuffer()); return { file: f.name, bytes, sha256: await sha256Hex(bytes) }; }));
    setFiles(read);
    setDigest(read.length === 0 ? null : await sha256Hex(packageDigestInput(read)));
  };
  const problems = selectionProblems(files.map((f) => ({ file: f.file, bytes: f.bytes.byteLength })));
  return (
    <section aria-labelledby="reg-h" className="eye-card">
      <h3 id="reg-h">Register an adapter package</h3>
      <p className="eye-help">A collection manager registers a package; a second person decides it before any contract may run it. The digest below is computed in this page from the files you chose — the server computes it again from the files it stores.</p>
      <label htmlFor="reg-files">The package&apos;s files (its adapter.json and its .mjs module)</label>
      <input id="reg-files" type="file" multiple style={inputStyle} onChange={(e) => { void pick(e.target.files); setReviewed(null); }} />
      {files.length === 0 ? null : (
        <ul aria-label="The files chosen" className="eye-help">{files.map((f) => <li key={f.file}><Mono>{f.file}</Mono> · {f.bytes.byteLength} bytes · sha256 <Mono title={f.sha256}>{f.sha256.slice(0, 12)}…</Mono></li>)}</ul>
      )}
      <button type="button" style={buttonStyle} disabled={digest === null} onClick={() => setReviewed(digest)}>Review these files</button>
      <CommandReview action="observation.adapter.register" object={{ type: 'ADP', id: digest ?? 'none', version: null, title: 'A new adapter package', state: 'not registered' }}
        digest={reviewed} currentDigest={digest} eligibility={eligibility(registerFacts(viewer))} consequence={crConsequence('observation.adapter.register')}
        extraReasons={problems} actionLabel="Register the package" pendingLabel="Registering the package" problem={problem} {...(receipt === undefined ? {} : { receipt })}
        onRun={async () => {
          const toB64 = (b: Uint8Array) => { let s = ''; for (const x of b) s += String.fromCharCode(x); return btoa(s); };
          const r = await act(connectorsApi.registerPackage(scope, { files: files.map((f) => ({ file: f.file, base64: toB64(f.bytes) })), requestId: newId() }), setProblem);
          setReceipt(r.receipt); setFiles([]); setDigest(null); setReviewed(null); onChanged();
        }} />
    </section>
  );
}

function DecidePackage({ scope, viewer, pkg, onChanged }: { scope: Scope; viewer: Viewer; pkg: PackageView; onChanged: () => void }) {
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | undefined>(undefined);
  return (
    <CommandReview action="observation.adapter.approve" object={{ type: 'ADP', id: pkg.id, version: null, title: `${pkg.name} ${pkg.version}`, state: pkg.state }}
      digest={pkg.digest} eligibility={eligibility(decidePackageFacts(viewer, pkg))} consequence={crConsequence('observation.adapter.approve')}
      rationale={{ value: reason, onChange: setReason, min: 8, label: 'Your reason (what you reviewed: the manifest, the destinations, the code)' }}
      actionLabel={decision === 'approve' ? 'Approve the package' : 'Reject the package'} pendingLabel="Recording the decision" variant={decision === 'reject' ? 'critical' : 'primary'}
      problem={problem} {...(receipt === undefined ? {} : { receipt })}
      onRun={async () => {
        const r = await act(connectorsApi.decidePackage(scope, pkg.id, { decision, reason: reason.trim(), expectedDigest: pkg.digest, requestId: newId() }), setProblem);
        setReceipt(r.receipt); setReason(''); onChanged();
      }}>
      <label htmlFor={`dec-${pkg.id}`}>Your decision</label>
      <select id={`dec-${pkg.id}`} style={inputStyle} value={decision} onChange={(e) => setDecision(e.target.value === 'reject' ? 'reject' : 'approve')}>
        <option value="approve">approve — a contract may bind and run it</option>
        <option value="reject">reject — no contract may run it (a change is a new version)</option>
      </select>
    </CommandReview>
  );
}

function SubmitRequalification({ scope, viewer, q, packages, onChanged }: { scope: Scope; viewer: Viewer; q: RequalificationView; packages: PackageView[]; onChanged: () => void }) {
  const approved = packages.filter((p) => p.state === 'approved');
  const [packageId, setPackageId] = useState<string>(approved[approved.length - 1]?.id ?? '');
  const [reason, setReason] = useState('');
  const [reviewed, setReviewed] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | undefined>(undefined);
  const chosen = approved.find((p) => p.id === packageId) ?? null;
  return (
    <CommandReview action="observation.connector.requalification.submit" object={{ type: 'RQL', id: q.id, version: null, title: `Requalification ${q.id.slice(0, 8)}`, state: q.state }}
      digest={reviewed} currentDigest={chosen?.digest ?? null} eligibility={eligibility(submitFacts(viewer, q))} consequence={crConsequence('observation.connector.requalification.submit')}
      rationale={{ value: reason, onChange: setReason, min: 8, label: 'What changed (8+ characters)' }} extraReasons={chosen === null ? ['choose an approved package to submit'] : []}
      actionLabel="Run the contract tests and submit" pendingLabel="Running the contract tests" problem={problem} {...(receipt === undefined ? {} : { receipt })}
      onRun={async () => {
        const r = await act(connectorsApi.submitRequalification(scope, q.id, { packageId: chosen?.id ?? null, reason: reason.trim(), requestId: newId() }), setProblem);
        setReceipt(r.receipt); setReason(''); setReviewed(null); onChanged();
      }}>
      <label htmlFor={`sub-${q.id}`}>The package to put in force (approved packages)</label>
      <select id={`sub-${q.id}`} style={inputStyle} value={packageId} onChange={(e) => { setPackageId(e.target.value); setReviewed(null); }}>
        <option value="">choose a package</option>
        {approved.map((p) => <option key={p.id} value={p.id}>{p.name} {p.version} — {p.digest.slice(0, 12)}…</option>)}
      </select>
      <button type="button" style={buttonStyle} disabled={chosen === null} onClick={() => setReviewed(chosen?.digest ?? null)}>Review this package</button>
    </CommandReview>
  );
}

function DecideRequalification({ scope, viewer, q, onChanged }: { scope: Scope; viewer: Viewer; q: RequalificationView; onChanged: () => void }) {
  const [decision, setDecision] = useState<'approve' | 'reject'>('approve');
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | undefined>(undefined);
  return (
    <CommandReview action="observation.connector.requalification.approve" object={{ type: 'RQL', id: q.id, version: null, title: `Requalification ${q.id.slice(0, 8)} — ${q.packageVersion ?? 'no package'}`, state: q.state }}
      digest={q.packageDigest} eligibility={eligibility(decideRequalificationFacts(viewer, q))} consequence={crConsequence('observation.connector.requalification.approve')}
      rationale={{ value: reason, onChange: setReason, min: 8, label: 'Your reason (the package, its digest and its contract tests)' }}
      extraReasons={q.tests?.outcome === 'pass' ? [] : ['the contract tests did not pass']}
      actionLabel={decision === 'approve' ? 'Approve the requalification' : 'Reject the requalification'} pendingLabel="Recording the decision" variant={decision === 'reject' ? 'critical' : 'primary'}
      problem={problem} {...(receipt === undefined ? {} : { receipt })}
      onRun={async () => {
        const r = await act(connectorsApi.decideRequalification(scope, q.id, { decision, reason: reason.trim(), expectedDigest: q.packageDigest ?? '', requestId: newId() }), setProblem);
        setReceipt(r.receipt); setReason(''); onChanged();
      }}>
      <label htmlFor={`rqd-${q.id}`}>Your decision</label>
      <select id={`rqd-${q.id}`} style={inputStyle} value={decision} onChange={(e) => setDecision(e.target.value === 'reject' ? 'reject' : 'approve')}>
        <option value="approve">approve — the package goes in force; a manager may then reactivate the contract</option>
        <option value="reject">reject — the requalification stays open; it may be submitted again</option>
      </select>
    </CommandReview>
  );
}

function RotateCredential({ scope, viewer, c, onChanged }: { scope: Scope; viewer: Viewer; c: AdapterContractView; onChanged: () => void }) {
  const [ref, setRef] = useState('');
  const [header, setHeader] = useState('authorization');
  const [reason, setReason] = useState('');
  const [digest, setDigest] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | undefined>(undefined);
  useEffect(() => { void payloadDigest({ sourceId: c.sourceId, contractVersion: c.contractVersion, ref: ref.trim(), header: header.trim(), reason: reason.trim() }).then(setDigest); }, [c, ref, header, reason]);
  return (
    <CommandReview action="observation.connector.credential.rotate" object={{ type: 'SRC', id: c.sourceId, version: c.contractVersion, title: `${c.name} — the credential the gateway injects`, state: c.state }}
      digest={reviewed} currentDigest={digest} eligibility={eligibility(rotateFacts(viewer))} consequence={crConsequence('observation.connector.credential.rotate')}
      extraReasons={rotationProblems(ref, header, reason)} actionLabel="Rotate the credential reference" pendingLabel="Rotating the credential reference" variant="critical"
      problem={problem} {...(receipt === undefined ? {} : { receipt })}
      onRun={async () => {
        const r = await act(connectorsApi.rotateCredential(scope, c.sourceId, { contractVersion: c.contractVersion ?? 1, ref: ref.trim(), header: header.trim(), reason: reason.trim(), requestId: newId() }), setProblem);
        setReceipt(r.receipt); setRef(''); setReason(''); setReviewed(null); onChanged();
      }}>
      <p className="eye-help">What is kept: the revoked binding stays in the record; the contract&apos;s cursor, checkpoint and custody are untouched.</p>
      <label htmlFor={`rot-ref-${c.sourceId}`}>The new credential reference (EYE_SRC_…; never the value)</label>
      <input id={`rot-ref-${c.sourceId}`} style={inputStyle} value={ref} autoComplete="off" spellCheck={false} onChange={(e) => { setRef(e.target.value); setReviewed(null); }} />
      <label htmlFor={`rot-h-${c.sourceId}`}>The header the gateway injects it in</label>
      <input id={`rot-h-${c.sourceId}`} style={inputStyle} value={header} autoComplete="off" onChange={(e) => { setHeader(e.target.value); setReviewed(null); }} />
      <label htmlFor={`rot-r-${c.sourceId}`}>Why (8+ characters)</label>
      <input id={`rot-r-${c.sourceId}`} style={inputStyle} value={reason} onChange={(e) => { setReason(e.target.value); setReviewed(null); }} />
      <button type="button" style={buttonStyle} disabled={digest === null} onClick={() => setReviewed(digest)}>Review this rotation</button>
    </CommandReview>
  );
}

export default function ConnectorsPage() {
  const { scope, me } = useShell();
  const viewer: Viewer = useMemo(() => ({ principalId: me.principalId, kind: me.kind,
    roles: me.bindings.filter((b) => b.scope !== 'DOMAIN' || b.domainId === scope.domainId).map((b) => b.roleCode) }), [me, scope]);
  const [data, setData] = useState<ConnectorRegisterView | null>(null);
  const [receipt, setReceipt] = useState<ReceiptT | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [rev, setRev] = useState(0);
  const load = useCallback(async () => {
    const r = await connectorsApi.register(scope);
    if (!r.ok || r.data === undefined) { setProblem(r.error ?? { code: `HTTP ${r.status}`, message: 'The connectors were not read; reload the page to read them again.', correlationId: '' }); return; }
    setProblem(null); setReceipt(r.data.receipt); setData(toRegister(r.data.connectors));
  }, [scope]);
  useEffect(() => { void load(); }, [load, rev]);
  const changed = () => setRev((x) => x + 1);
  const labelOf = (sourceId: string): string => data?.contracts.find((c) => c.sourceId === sourceId)?.name ?? sourceId.slice(0, 8);
  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Connectors</h1>
      <p className="eye-help">The adapter contracts of this domain, the packages they run, their requalifications and credential bindings. Every request a cell makes is on a receipt: <Link href="/observation/egress">open the egress receipts</Link>.</p>
      <CellBoundaryNote />
      {problem !== null ? <ErrorNote error={problem} /> : data === null ? <Empty>Reading the connectors of this domain…</Empty> : (
        <>
          <p className="eye-help">Read at {fmtInstant(data.asOf)}.</p>
          <Receipt receipt={receipt} />

          <h2 style={h2}>Adapter contracts</h2>
          {data.contracts.length === 0 ? <Empty>No contract of kind adapter is registered in this domain.</Empty> : (
            <div role="region" aria-label="The adapter contracts" tabIndex={0} className="eye-ev-scroll">
              <table className="eye-table">
                <caption>Each adapter contract version, the package it runs and what holds it</caption>
                <thead><tr>{['Source', 'State', 'Mode', 'Registered destinations', 'Package in force', 'Can it run?'].map((x) => <th key={x} scope="col">{x}</th>)}</tr></thead>
                <tbody>{data.contracts.map((c) => (
                  <tr key={`${c.sourceId}:${c.contractVersion ?? 0}`}>
                    <th scope="row"><Link href={`/observation/sources/${c.sourceId}`}>{c.name}</Link> v{c.contractVersion ?? '?'}</th>
                    <td>{c.state}</td><td>{c.mode}</td><td>{c.endpoints.join(', ') || 'none'}</td>
                    <td>{c.inForce === null ? 'none bound' : <>{c.inForce.version} · <Mono title={c.inForce.digest}>{c.inForce.digest.slice(0, 12)}…</Mono> ({c.inForce.via === 'requalification' ? 'by its requalification' : 'as the contract binds it'})</>}</td>
                    <td>{c.open !== null ? `held — requalification ${c.open.state} (${c.open.cause.replace(/_/g, ' ')})` : c.problem !== null ? `no — ${c.problem}` : 'yes, while the contract is active'}</td>
                  </tr>))}</tbody>
              </table>
            </div>
          )}

          <h2 style={h2}>Adapter packages</h2>
          <RegisterPackage scope={scope} viewer={viewer} onChanged={changed} />
          {data.packages.length === 0 ? <Empty>No adapter package is registered in this domain.</Empty>
            : data.packages.map((p) => (
              <AdapterPackageCard key={p.id} pkg={p}>
                {p.state === 'registered' ? <DecidePackage scope={scope} viewer={viewer} pkg={p} onChanged={changed} /> : null}
              </AdapterPackageCard>
            ))}

          <h2 style={h2}>Requalifications</h2>
          {data.requalifications.length === 0 ? <Empty>No connector of this domain has been held for requalification.</Empty>
            : data.requalifications.map((q) => {
              const contract = data.contracts.find((c) => c.sourceId === q.sourceId);
              const sameName = contract?.inForce === null || contract === undefined ? data.packages
                : data.packages.filter((p) => p.name === data.packages.find((x) => x.id === contract.inForce?.packageId)?.name);
              return (
                <RequalificationCard key={q.id} q={q} sourceLabel={labelOf(q.sourceId)}>
                  {q.state === 'required' || q.state === 'rejected' ? <SubmitRequalification scope={scope} viewer={viewer} q={q} packages={sameName} onChanged={changed} /> : null}
                  {q.state === 'submitted' ? <DecideRequalification scope={scope} viewer={viewer} q={q} onChanged={changed} /> : null}
                </RequalificationCard>
              );
            })}

          <h2 style={h2}>Credential bindings</h2>
          <p className="eye-help">References only: the value is read from the deployment at the moment of a request and injected by the gateway — never shown, never in the cell.</p>
          {data.bindings.length === 0 ? <Empty>No credential of an adapter contract has been rotated; each runs on its contract&apos;s own reference.</Empty> : (
            <ul aria-label="The credential bindings" className="eye-help">
              {data.bindings.map((b) => <li key={`${b.sourceId}:${b.version ?? 0}`}>{labelOf(b.sourceId)} v{b.contractVersion ?? '?'} · binding v{b.version ?? '?'} · <Mono>{b.ref}</Mono> in {b.header} · {b.state}{b.revokedAt === null ? '' : ` since ${fmtInstant(b.revokedAt)}`} · {b.reason}</li>)}
            </ul>
          )}
          {data.contracts.filter((c) => c.state === 'active' || c.state === 'suspended' || c.state === 'approved').map((c) => (
            <section key={`rot-${c.sourceId}`} aria-label={`Rotate the credential of ${c.name}`} className="eye-card">
              <h3>Rotate the credential of {c.name} v{c.contractVersion ?? '?'}</h3>
              <RotateCredential scope={scope} viewer={viewer} c={c} onChanged={changed} />
            </section>
          ))}
        </>
      )}
    </>
  );
}
