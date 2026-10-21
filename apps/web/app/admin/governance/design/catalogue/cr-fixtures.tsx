'use client';
/**
 * CP-6 B40 §AC — the catalogue's section for THE CONNECTOR CELL LIBRARY (components/connector-cell.tsx; LIBRARY_B40.connectors): its four
 * components from SYNTHETIC fixtures put through the page's own pure model (lib/connectors-b40.ts — toPackage, toRequalification, toReceipt):
 * the cell's boundary in words (D3 — stated, never claimed as network isolation); an adapter package APPROVED by a second person beside a
 * newer version still REGISTERED; a requalification SUBMITTED with its contract tests beside one still REQUIRED with none; the transfer
 * receipts — allowed (replay), BLOCKED for an unregistered host, BLOCKED for a changed destination identity — and the empty table. Digests
 * and byte counts only, never content (D9). The deciding acts are the connectors page's; the catalogue offers none and calls no server.
 * THREE CLAIMS: construction evidence only; demonstrated operation is the act's (SYNTHETIC); real acceptance — never claimed.
 */
import { AdapterPackageCard, CellBoundaryNote, EgressReceiptTable, RequalificationCard } from '../../../../../components/connector-cell';
import { LIBRARY_B40 } from '../../../../../lib/b40-seams';
import { toPackage, toReceipt, toRequalification } from '../../../../../lib/connectors-b40';
import { Panel } from '../../../../../components/layers';

export const CR_RENDERED: readonly string[] = LIBRARY_B40.connectors.exports;

const SRC = '01a0b840-0000-7000-8000-00000000e101';
const RUN = '01a0b840-0000-7000-8000-00000000e201';
const d = (n: string) => n.repeat(16);
const MANIFEST = { declared_destinations: ['consignments.partner.example'], purposes: ['corridor monitoring'], data_classes: ['consignment status'] };
const FILES = [{ file: 'adapter.json', sha256: d('c1a0'), byte_length: 412 }, { file: 'adapter.mjs', sha256: d('c1a1'), byte_length: 2310 }];
const APPROVED = toPackage({ package_id: '01a0b840-0000-7000-8000-00000000e301', name: 'partner-consignments (fixture)', version: '1.0.0', package_digest: d('c1a2'), state: 'approved',
  author: 'the partner firm\'s engineer (fixture, customer-written)', manifest: MANIFEST, protocol: 'eye-cell/1 (fixture)', sdk_version: '1.0.0', files: FILES, byte_length: 2722,
  registered_by: 'principal:fixture-manager', registered_at: '2026-10-20T07:00:00Z', decided_by: 'principal:fixture-admin', decided_at: '2026-10-20T07:30:00Z',
  decision_reason: 'manifest, digest and destinations read (fixture)',
  events: [{ event: 'adapter.registered', actor: 'principal:fixture-manager', at: '2026-10-20T07:00:00Z' }, { event: 'adapter.approved', actor: 'principal:fixture-admin', at: '2026-10-20T07:30:00Z' }] });
const REGISTERED = toPackage({ package_id: '01a0b840-0000-7000-8000-00000000e302', name: 'partner-consignments (fixture)', version: '1.0.1', package_digest: d('c1a3'), state: 'registered',
  author: null, manifest: MANIFEST, protocol: 'eye-cell/1 (fixture)', files: [{ file: 'adapter.json', sha256: d('c1a4'), byte_length: null }], registered_by: 'principal:fixture-manager',
  registered_at: '2026-10-20T09:00:00Z', decided_by: null, decided_at: null, decision_reason: null, events: [] });
const SUBMITTED = toRequalification({ requalification_id: '01a0b840-0000-7000-8000-00000000e401', source_id: SRC, contract_version: 1, cause: 'unregistered_destination',
  cause_detail: 'the cell asked for an unregistered tracking host (fixture).', state: 'submitted', opened_by: 'principal:fixture-gateway', opened_at: '2026-10-20T08:00:00Z',
  digest_at_opening: d('c1a2'), package_id: '01a0b840-0000-7000-8000-00000000e302', package_version: '1.0.1', package_digest: d('c1a3'),
  contract_tests: { outcome: 'pass', summary: '3 of 3 passed', transport: 'replay', ran_at: '2026-10-20T09:10:00Z',
    cases: [{ name: 'emits framed items', outcome: 'pass', detail: '12 items (fixture)' }, { name: 'asks only registered hosts', outcome: 'pass', detail: 'no refusal (fixture)' },
            { name: 'sends no request body', outcome: 'pass', detail: 'GET only (fixture)' }] },
  submitted_by: 'principal:fixture-manager', submitted_at: '2026-10-20T09:10:00Z', submit_reason: 'the tracking call removed in 1.0.1 (fixture)',
  events: [{ event: 'requalification.required', actor: 'principal:fixture-gateway', at: '2026-10-20T08:00:00Z' }, { event: 'requalification.submitted', actor: 'principal:fixture-manager', at: '2026-10-20T09:10:00Z' }] });
const REQUIRED = toRequalification({ requalification_id: '01a0b840-0000-7000-8000-00000000e402', source_id: SRC, contract_version: 2, cause: 'credential_rotated',
  cause_detail: 'the credential reference was rotated (fixture).', state: 'required', opened_by: 'principal:fixture-manager', opened_at: '2026-10-20T10:00:00Z', digest_at_opening: d('c1a2'),
  contract_tests: null, events: [] });
const receipt = (seq: number, over: Record<string, unknown>) => toReceipt({ receipt_id: `01a0b840-0000-7000-8000-00000000e50${seq}`, source_id: SRC, source_key: 'partner-consignments (fixture)',
  contract_version: 1, run_id: RUN, seq, requested_at: `2026-10-20T08:0${seq}:00Z`, method: 'GET', purpose: 'corridor monitoring', data_class: 'consignment status',
  request_digest: d(`c2a${seq}`), request_bytes: 180, credential_injected: false, ...over });
const RECEIPTS = [
  receipt(3, { url_redacted: 'https://consignments.partner.example/v1/consignments', host: 'consignments.partner.example', decision: 'blocked', refusal_class: 'destination_identity_changed',
    reason: 'the TLS key differs from the pinned one (fixture)', destination: { mode: 'live', addresses: ['203.0.113.10'], pinned_address: '203.0.113.10', tls_spki_sha256: d('c3a0'), pin_state: 'changed' } }),
  receipt(2, { url_redacted: 'https://track.unregistered.example/[redacted]', host: 'track.unregistered.example', decision: 'blocked', refusal_class: 'unregistered_destination',
    reason: 'a host the contract does not register (fixture)', destination: { mode: 'none' } }),
  receipt(1, { url_redacted: 'https://consignments.partner.example/v1/consignments?page=1', host: 'consignments.partner.example', decision: 'allowed', response_status: 200,
    response_digest: d('c4a0'), response_bytes: 5120, destination: { mode: 'replay', replay_set: 'partner-logistics (fixture)', replay_entry_sha256: d('c5a0') } }),
];

export function CrCatalogue() {
  return (
    <Panel title="The connector cell: its boundary, adapter packages, requalifications, egress receipts (B40 §CR — proposed)">
      <section aria-label="CellBoundaryNote">
        <CellBoundaryNote />
      </section>
      <section aria-label="AdapterPackageCard">
        <AdapterPackageCard pkg={APPROVED} />
        <AdapterPackageCard pkg={REGISTERED}><p className="eye-ev-note">Fixture: deciding a package is the connectors page&apos;s act (a second person, bound to this digest) — not offered in the catalogue.</p></AdapterPackageCard>
      </section>
      <section aria-label="RequalificationCard">
        <RequalificationCard q={SUBMITTED} sourceLabel="partner-consignments (fixture)" />
        <RequalificationCard q={REQUIRED} sourceLabel="partner-consignments (fixture)" />
      </section>
      <section aria-label="EgressReceiptTable">
        <EgressReceiptTable receipts={RECEIPTS} label="Fixture egress receipts" asOf="2026-10-20T10:00:00Z" scopeLabel="the fixture domain" />
        <EgressReceiptTable receipts={[]} label="No receipt (fixture)" asOf="2026-10-20T10:00:00Z" scopeLabel="the fixture domain" />
      </section>
    </Panel>
  );
}
