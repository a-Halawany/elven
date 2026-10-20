'use client';
/**
 * CP-6 B40 §CR — THE CONNECTOR CELL'S LIBRARY COMPONENTS (proposed; the Design System Authority approves each in the act): the cell's
 * boundary in words (D3, stated — never claimed), an adapter package (its manifest, digest, files and ledger), a requalification (its
 * cause, its contract tests, its ledger), and the transfer receipts as a real table (digests, sizes, destinations and decisions — never
 * content, D9). They render what the pure models of lib/connectors-b40.ts give them and infer nothing: an absent value reads as not recorded.
 * Styling through the library's classes and semantic tokens only. CONSTRUCTION only.
 */
import type { ReactNode } from 'react';
import { DataTable, DefinitionList } from './data';
import { Mono, fmtBytes, fmtInstant } from './observation';
import {
  CELL_BOUNDARY_STATEMENT, causeText, decisionText, destinationText,
  type PackageView, type ReceiptView, type RequalificationView,
} from '../lib/connectors-b40';

const shortDigest = (d: string | null): string => (d === null || d === '' ? 'none' : `${d.slice(0, 12)}…`);

/** D3 — the cell's confinement, and what it is NOT (network-level isolation is B103 / B109). */
export function CellBoundaryNote() {
  return (
    <aside aria-label="What the connector cell isolates, and what it does not" className="eye-help">
      <p>{CELL_BOUNDARY_STATEMENT}</p>
    </aside>
  );
}

/** One adapter package: who wrote it, what it may reach and for what, the digest a decision binds, its files and its ledger. */
export function AdapterPackageCard({ pkg, headingLevel = 3, children }: { pkg: PackageView; headingLevel?: 2 | 3; children?: ReactNode }) {
  const H = headingLevel === 2 ? 'h2' : 'h3';
  const id = `pkg-${pkg.id}`;
  return (
    <section aria-labelledby={id} className="eye-card">
      <H id={id}>{pkg.name} {pkg.version} — {pkg.state}</H>
      <DefinitionList label={`Adapter package ${pkg.name} ${pkg.version}`} items={[
        { term: 'Package digest', value: <Mono title={pkg.digest}>{shortDigest(pkg.digest)}</Mono>, copy: pkg.digest },
        { term: 'Author', value: pkg.author ?? 'not recorded' },
        { term: 'Declared destinations', value: pkg.destinations.length === 0 ? 'none declared' : pkg.destinations.join(', ') },
        { term: 'Purposes', value: pkg.purposes.join('; ') || 'none stated' },
        { term: 'Data classes', value: pkg.dataClasses.join('; ') || 'none stated' },
        { term: 'Cell protocol', value: pkg.protocol ?? 'not recorded' },
        { term: 'Registered', value: `${fmtInstant(pkg.registeredAt)} by ${pkg.registeredBy ?? 'not recorded'}` },
        { term: 'Decision', value: pkg.decidedAt === null ? 'not decided — a second person decides it' : `${pkg.state} at ${fmtInstant(pkg.decidedAt)} by ${pkg.decidedBy ?? 'not recorded'}: ${pkg.decisionReason ?? ''}` },
      ]} />
      <ul aria-label={`The files of ${pkg.name} ${pkg.version}`} className="eye-help">
        {pkg.files.map((f) => <li key={f.file}><Mono>{f.file}</Mono> · {f.bytes === null ? 'size not recorded' : fmtBytes(f.bytes)} · sha256 <Mono title={f.sha256}>{shortDigest(f.sha256)}</Mono></li>)}
      </ul>
      {pkg.events.length === 0 ? null : (
        <ul aria-label={`The ledger of ${pkg.name} ${pkg.version}`} className="eye-help">
          {pkg.events.map((e, i) => <li key={i}>{fmtInstant(e.at)} · {e.event} by <Mono>{e.actor ?? 'not recorded'}</Mono></li>)}
        </ul>
      )}
      {children}
    </section>
  );
}

/** A requalification: why the connector was suspended, the package submitted and its contract tests, who decided, the ledger. */
export function RequalificationCard({ q, sourceLabel, children }: { q: RequalificationView; sourceLabel: string; children?: ReactNode }) {
  const id = `rq-${q.id}`;
  return (
    <section aria-labelledby={id} className="eye-card">
      <h3 id={id}>Requalification of {sourceLabel} v{q.contractVersion ?? '?'} — {q.state}</h3>
      <p className="eye-help">Cause: {causeText(q.cause)}. {q.causeDetail}</p>
      <DefinitionList label={`Requalification ${q.id}`} items={[
        { term: 'Opened', value: `${fmtInstant(q.openedAt)} by ${q.openedBy ?? 'not recorded'}` },
        { term: 'Digest when suspended', value: <Mono title={q.digestAtOpening ?? ''}>{shortDigest(q.digestAtOpening)}</Mono> },
        { term: 'Package submitted', value: q.packageId === null ? 'none yet' : <>{q.packageVersion ?? '?'} · <Mono title={q.packageDigest ?? ''}>{shortDigest(q.packageDigest)}</Mono></> },
        { term: 'Submitted', value: q.submittedAt === null ? 'not submitted' : `${fmtInstant(q.submittedAt)} by ${q.submittedBy ?? 'not recorded'}: ${q.submitReason ?? ''}` },
        { term: 'Decision', value: q.decidedAt === null ? 'not decided — a second person decides it' : `${q.state} at ${fmtInstant(q.decidedAt)} by ${q.decidedBy ?? 'not recorded'}: ${q.decisionReason ?? ''}` },
      ]} />
      {q.tests === null ? <p className="eye-help">No contract tests are recorded yet: they run when the requalification is submitted.</p> : (
        <div role="region" aria-label={`Contract tests of requalification ${q.id}`} tabIndex={0} className="eye-ev-scroll">
          <table className="eye-table">
            <caption>Contract tests — {q.tests.outcome} ({q.tests.summary}){q.tests.ranAt === null ? '' : `, run ${fmtInstant(q.tests.ranAt)}`} against {q.tests.transport === 'replay' ? 'the replay set' : 'no publisher (no live request)'}</caption>
            <thead><tr><th scope="col">Case</th><th scope="col">Outcome</th><th scope="col">Detail</th></tr></thead>
            <tbody>{q.tests.cases.map((c) => <tr key={c.name}><th scope="row">{c.name}</th><td>{c.outcome}</td><td>{c.detail}</td></tr>)}</tbody>
          </table>
        </div>
      )}
      {q.events.length === 0 ? null : (
        <ul aria-label={`The ledger of requalification ${q.id}`} className="eye-help">
          {q.events.map((e, i) => <li key={i}>{fmtInstant(e.at)} · {e.event} by <Mono>{e.actor ?? 'not recorded'}</Mono></li>)}
        </ul>
      )}
      {children}
    </section>
  );
}

/** The transfer receipts as a real table: one row per request a cell asked the gateway for — never the bytes, only what proves the exchange. */
export function EgressReceiptTable({ receipts, label, asOf, scopeLabel }: { receipts: readonly ReceiptView[]; label: string; asOf: string; scopeLabel: string }) {
  return (
    <DataTable<ReceiptView>
      label={label} noun="receipts" rows={receipts} rowId={(r) => r.id}
      caption={`${label} — newest first; digests and byte counts, never content`}
      exportAs={{ name: 'egress-receipts', label: { scope: scopeLabel, classificationCeiling: 'the contracts\' ceilings (receipts carry no content)', asOf } }}
      empty={{ scope: scopeLabel, evidence: 'none_recorded', permission: 'full', nextStep: 'a run of an adapter contract writes its receipts here' }}
      columns={[
        { key: 'at', label: 'Requested', value: (r) => r.requestedAt, sortable: true, render: (r) => fmtInstant(r.requestedAt) },
        { key: 'source', label: 'Source', value: (r) => r.sourceKey ?? r.sourceId, filterable: true, render: (r) => <>{r.sourceKey ?? <Mono>{r.sourceId}</Mono>} v{r.contractVersion ?? '?'}</> },
        { key: 'run', label: 'Run · request', value: (r) => `${r.runId}#${r.seq ?? 0}`, render: (r) => <><Mono title={r.runId}>{r.runId.slice(0, 8)}</Mono> #{r.seq ?? '?'}</> },
        { key: 'host', label: 'Destination host', value: (r) => r.host, filterable: true, sortable: true },
        { key: 'decision', label: 'Decision', value: (r) => decisionText(r), filterable: true, groupable: true },
        { key: 'identity', label: 'Destination identity', value: (r) => destinationText(r.destination) },
        { key: 'purpose', label: 'Purpose · data class', value: (r) => `${r.purpose ?? 'none'} · ${r.dataClass ?? 'none'}` },
        { key: 'credential', label: 'Credential', value: (r) => (r.credentialInjected ? `injected by the gateway — ${r.credentialRef ?? 'reference not recorded'}` : 'none injected') },
        { key: 'request', label: 'Request digest', value: (r) => r.requestDigest, render: (r) => <Mono title={r.requestDigest}>{shortDigest(r.requestDigest)}</Mono> },
        { key: 'response', label: 'Response', value: (r) => r.responseDigest, render: (r) => r.responseDigest === null ? 'no answer taken' : <><Mono title={r.responseDigest}>{shortDigest(r.responseDigest)}</Mono> · {r.responseBytes === null ? 'size not recorded' : fmtBytes(r.responseBytes)}</> },
        { key: 'reason', label: 'Reason', value: (r) => r.reason ?? '' },
      ]}
    />
  );
}
