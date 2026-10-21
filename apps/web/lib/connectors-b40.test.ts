/**
 * CP-6 B40 §CR — the pure models of the connectors and the egress receipts (lib/connectors-b40.ts). SYNTHETIC rows in the shape the server
 * answers (observation.connector_register_read / egress_receipts_read).
 */
import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { eligibility } from './authority-b81';
import {
  BLOCKING_CLASSES, CELL_BOUNDARY_STATEMENT, CR_EFFECTS, REFUSAL_WORDS, causeText, crConsequence, decidePackageFacts, decideRequalificationFacts, decisionText,
  destinationText, packageDigestInput, payloadDigest, receiptCounts, registerFacts, rotationProblems, selectionProblems, sha256Hex, submitFacts, toReceipt, toRegister,
} from './connectors-b40';

const ME = '01000000-0000-7000-8000-000000000001';
const OTHER = '01000000-0000-7000-8000-000000000002';
const pkgRow = (over: Record<string, unknown> = {}) => ({
  package_id: 'p1', name: 'nordwerk-logistics-consignments', version: '1.0.0', package_digest: 'a'.repeat(64), state: 'registered', author: 'R. Haddad\'s firm (SYNTHETIC)',
  manifest: { declared_destinations: ['consignments.partner-logistics.synthetic.example'], purposes: ['corridor monitoring'], data_classes: ['consignment status (internal)'] },
  files: [{ file: 'adapter.json', sha256: 'b'.repeat(64), byte_length: 448, locator: 't/d/x' }], byte_length: 448, protocol: 'eye-cell/1', sdk_version: '1.0.0',
  registered_by: OTHER, registered_at: '2026-10-21T08:00:00Z', decided_by: null, decided_at: null, decision_reason: null,
  events: [{ event: 'adapter.registered', actor: OTHER, at: '2026-10-21T08:00:00Z' }], ...over,
});
const reqRow = (over: Record<string, unknown> = {}) => ({
  requalification_id: 'q1', source_id: 's1', contract_version: 1, cause: 'unregistered_destination', cause_detail: 'host track.unregistered-carrier.synthetic.example is not registered',
  state: 'submitted', package_id: 'p2', package_version: '1.0.1', package_digest: 'c'.repeat(64), submitted_by: OTHER,
  contract_tests: { outcome: 'pass', summary: '7 case(s) passed', transport: 'replay', ran_at: '2026-10-21T09:00:00Z', cases: [{ name: 'speaks eye-cell/1', outcome: 'pass', detail: '6 frame(s)' }] },
  events: [], ...over,
});

describe('the register in words', () => {
  it('packages, contracts, requalifications and bindings are read as the server says them; an absent value is not invented', () => {
    const v = toRegister({
      packages: [pkgRow()], requalifications: [reqRow()],
      contracts: [{ source_id: 's1', contract_version: 1, source_key: 'nordwerk-logistics-partner', name: 'NORDWERK logistics partner (SYNTHETIC)', lifecycle_state: 'suspended',
        acquisition_mode: 'replay', endpoints: ['https://consignments.partner-logistics.synthetic.example/v1/consignments?page=1'],
        package_in_force: { package_id: 'p1', version: '1.0.0', digest: 'a'.repeat(64), via: 'contract' }, package_problem: null, open_requalification: reqRow({ state: 'required' }) }],
      credential_bindings: [{ source_id: 's1', contract_version: 1, binding_version: 1, ref: 'EYE_SRC_PARTNER_KEY_2', header: 'x-partner-key', state: 'in_force', reason: 'scheduled rotation (SYNTHETIC)' }],
      as_of: '2026-10-21T10:00:00Z',
    });
    expect(v.packages[0]).toMatchObject({ id: 'p1', destinations: ['consignments.partner-logistics.synthetic.example'], decidedAt: null, files: [{ file: 'adapter.json', bytes: 448 }] });
    expect(v.contracts[0]).toMatchObject({ state: 'suspended', inForce: { version: '1.0.0', via: 'contract' }, problem: null, open: { state: 'required' } });
    expect(v.requalifications[0]!.tests).toMatchObject({ outcome: 'pass', transport: 'replay', cases: [{ name: 'speaks eye-cell/1', outcome: 'pass' }] });
    expect(v.bindings[0]).toMatchObject({ ref: 'EYE_SRC_PARTNER_KEY_2', state: 'in_force', revokedAt: null });
    expect(toRegister({})).toEqual({ packages: [], contracts: [], requalifications: [], bindings: [], asOf: null });
    expect(causeText('package_integrity')).toMatch(/did not verify/);
    expect(causeText('something_else')).toBe('something else');
  });
});

describe('the receipts in words (D9: digests and counts, never content)', () => {
  it('a decision, a destination identity and the counts — every refusal class has its words, the blocking ones named', () => {
    const allowed = toReceipt({ receipt_id: 'r1', decision: 'allowed', response_status: 200, host: 'consignments.partner-logistics.synthetic.example', request_digest: 'd'.repeat(64),
      destination: { mode: 'live', addresses: ['203.0.113.7', '203.0.113.8'], pinned_address: '203.0.113.7', tls_spki_sha256: 'K'.repeat(43) + '=', pin_state: 'first_use' },
      credential_injected: true, credential_ref: 'EYE_SRC_PARTNER_KEY' });
    expect(decisionText(allowed)).toBe('allowed — answered 200');
    expect(destinationText(allowed.destination)).toBe('live · 203.0.113.7 (of 2) · TLS key KKKKKKKKKKKK… — pinned on first use');
    const blocked = toReceipt({ decision: 'blocked', refusal_class: 'destination_identity_changed', destination: { mode: 'live', pinned_address: '203.0.113.7', tls_spki_sha256: 'Z'.repeat(43) + '=', pin_state: 'changed' } });
    expect(decisionText(blocked)).toBe('blocked — the destination presented another identity than the pinned one');
    expect(destinationText(blocked.destination)).toMatch(/DIFFERS from the pin$/);
    expect(destinationText(toReceipt({ destination: { mode: 'replay', replay_set: 'nordwerk-logistics-partner', replay_entry_sha256: 'e'.repeat(64) } }).destination))
      .toBe('replay set nordwerk-logistics-partner · recorded answer eeeeeeeeeeee…');
    expect(destinationText(toReceipt({}).destination)).toBe('no destination reached');
    for (const c of ['cell_token', 'request', 'scheme', 'method', 'unregistered_destination', 'purpose', 'data_class', 'budget', 'throttle', 'destination_identity_changed',
      'address_not_public', 'dns_failure', 'tls_failure', 'timeout', 'transport', 'response_too_large', 'replay_missing', 'contract_test']) expect(REFUSAL_WORDS[c], c).toBeTruthy();
    expect(BLOCKING_CLASSES).toEqual(['unregistered_destination', 'destination_identity_changed']);
    expect(receiptCounts({ 'refused:purpose': 1, allowed: 4, 'blocked:unregistered_destination': 2 })).toEqual([
      { key: 'allowed', n: 4, label: 'allowed' }, { key: 'blocked:unregistered_destination', n: 2, label: 'blocked — a host the contract does not register' },
      { key: 'refused:purpose', n: 1, label: 'refused — a purpose the package and the contract do not both name' }]);
    expect(Object.keys(allowed)).not.toContain('body');
  });
});

describe('who may act — the second person, never an agent, never an external collaborator (the server re-checks every rule)', () => {
  const manager = { principalId: ME, kind: 'human', roles: ['collection_manager'] };
  it('the registrant may not decide the package; another manager or a domain admin may; an agent and an external collaborator never', () => {
    const p = toRegister({ packages: [pkgRow({ registered_by: ME })] }).packages[0]!;
    expect(eligibility(decidePackageFacts(manager, p))).toMatchObject({ can: false, reason: 'separation of duties: you registered this package — a second person decides it' });
    expect(eligibility(decidePackageFacts({ principalId: OTHER, kind: 'human', roles: ['domain_admin'] }, p))).toMatchObject({ can: true, role: 'domain_admin' });
    expect(eligibility(decidePackageFacts({ principalId: OTHER, kind: 'agent', roles: ['collection_manager'] }, p)).can).toBe(false);
    expect(eligibility(decidePackageFacts({ principalId: OTHER, kind: 'human', roles: ['collection_manager', 'external_collaborator'] }, p)).can).toBe(false);
    expect(eligibility(decidePackageFacts({ principalId: OTHER, kind: 'human', roles: ['domain_admin'] }, { ...p, state: 'approved' }))).toMatchObject({ can: false });
    expect(eligibility(registerFacts({ principalId: OTHER, kind: 'human', roles: ['domain_analyst'] })).reason).toMatch(/collection_manager/);
  });
  it('the submitter may not decide the requalification; submission is offered on a required or rejected one only', () => {
    const q = toRegister({ requalifications: [reqRow({ submitted_by: ME })] }).requalifications[0]!;
    expect(eligibility(decideRequalificationFacts(manager, q)).reason).toBe('separation of duties: you submitted this requalification — a second person decides it');
    expect(eligibility(decideRequalificationFacts({ principalId: OTHER, kind: 'human', roles: ['domain_admin'] }, q)).can).toBe(true);
    expect(eligibility(submitFacts(manager, q)).can).toBe(false);
    expect(eligibility(submitFacts(manager, { ...q, state: 'required' })).can).toBe(true);
  });
  it('every act has its consequence stated (no server preview exists for them) — and the cell\'s boundary is stated, not claimed', () => {
    for (const a of ['observation.adapter.register', 'observation.adapter.approve', 'observation.connector.requalification.submit', 'observation.connector.requalification.approve',
      'observation.connector.credential.rotate']) expect(crConsequence(a)).toMatchObject({ source: 'stated', blockers: [] });
    expect(crConsequence('observation.read')).toBeNull();
    expect(Object.keys(CR_EFFECTS)).toHaveLength(5);
    expect(CELL_BOUNDARY_STATEMENT).toMatch(/has no network switch/);
    expect(CELL_BOUNDARY_STATEMENT).toMatch(/B103, B109/);
  });
});

describe('the payloads reviewed client-side', () => {
  it('the package digest computed here equals the SDK\'s (files sorted by name in byte order)', async () => {
    const files = [{ file: 'index.mjs', sha256: '8a5e74363a9062eb4ac1655f2b63a91292be1553b0b05b123facc97297f6e31a' }, { file: 'adapter.json', sha256: 'f201217344aa1482ba0ed5e0324541446f7b748644656f2ce4cf43c859096441' }];
    expect(await sha256Hex(packageDigestInput(files))).toBe('25b6f8fb926877662bbdefbe584d3b9c42117facbc0e66dfc59d39926bac346d');   // the 1.0.0 fixture's package digest
    expect(await sha256Hex('x')).toBe(createHash('sha256').update('x').digest('hex'));
  });
  it('a payload digest is canonical (key order does not matter) and changes with any value — a changed input voids the review', async () => {
    const a = await payloadDigest({ ref: 'EYE_SRC_A', header: 'x-key', reason: 'scheduled rotation' });
    expect(await payloadDigest({ reason: 'scheduled rotation', header: 'x-key', ref: 'EYE_SRC_A' })).toBe(a);
    expect(await payloadDigest({ ref: 'EYE_SRC_B', header: 'x-key', reason: 'scheduled rotation' })).not.toBe(a);
  });
  it('what the register and the rotation will refuse is said before sending', () => {
    expect(selectionProblems([])).toEqual(['choose the package\'s files (its adapter.json and its .mjs module)']);
    expect(selectionProblems([{ file: '../x.mjs', bytes: 1 }, { file: '../x.mjs', bytes: 1 }])).toEqual([
      'each file is a plain name (letters, digits, dot, underscore, hyphen)', 'each file is named once', 'the package carries its manifest as adapter.json']);
    expect(selectionProblems([{ file: 'adapter.json', bytes: 448 }, { file: 'index.mjs', bytes: 1317 }])).toEqual([]);
    expect(rotationProblems('sk-live-value', 'x key', 'short')).toHaveLength(3);
    expect(rotationProblems('EYE_SRC_PARTNER_KEY_2', 'x-partner-key', 'scheduled rotation (SYNTHETIC)')).toEqual([]);
  });
});
