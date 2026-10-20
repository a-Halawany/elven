/**
 * CP-6 B40 §CR — THE CONNECTORS AND THE EGRESS RECEIPTS, as pure models (no React, no fetch; tested in node): the adapter package register,
 * the adapter contracts with their package in force, the requalifications, the credential bindings and the transfer receipts — each read
 * from the server's own answer (observation.connector_register_read / egress_receipts_read) and put into words. Nothing is inferred: an
 * absent value reads as not recorded; a receipt carries digests and byte counts, never content (D9).
 *
 * THE BINDINGS OF THE ACTS (said plainly — R1's rule):
 *   - deciding a PACKAGE and deciding a REQUALIFICATION bind the package digest the person reviewed, and the SERVER enforces it (the ports
 *     refuse a decision naming another digest: `(stale)`) — a server-enforced version binding;
 *   - REGISTERING a package, SUBMITTING a requalification and ROTATING a credential create a new record: what the person reviewed is the
 *     payload itself (the files' digest computed here, the package chosen, the reference and header typed) — a CLIENT-SIDE payload review;
 *     the server recomputes the package digest from the files it stores and runs the contract tests itself.
 * THREE CLAIMS: construction (this file and its tests); demonstrated operation and real acceptance — never claimed.
 */
import type { ConsequenceView, EligibilityFacts } from './authority-b81';

export type Row = Record<string, unknown>;
const s = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const rows = (v: unknown): Row[] => (Array.isArray(v) ? v.filter((x): x is Row => typeof x === 'object' && x !== null) : []);

/** D3, stated — never claimed: what the cell's confinement is, and what it is not. */
export const CELL_BOUNDARY_STATEMENT = 'Each run of an adapter is one child process under Node\'s permission model: it reads only the SDK and its own package, writes nothing, starts no process, holds no credential and no address. Its only intended way out is the run\'s egress gateway, which checks every request and writes a receipt. The permission model has no network switch: a direct connection from the cell is not prevented by the operating system here — network-level isolation is a later stage (B103, B109).';

/* ── the packages ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface LedgerEntry { event: string; actor: string | null; at: string | null }
export interface PackageView {
  id: string; name: string; version: string; digest: string; state: 'registered' | 'approved' | 'rejected' | string; author: string | null;
  destinations: string[]; purposes: string[]; dataClasses: string[]; protocol: string | null; sdkVersion: string | null;
  files: Array<{ file: string; sha256: string; bytes: number | null }>; byteLength: number | null;
  registeredBy: string | null; registeredAt: string | null; decidedBy: string | null; decidedAt: string | null; decisionReason: string | null;
  events: LedgerEntry[];
}
const ledger = (v: unknown): LedgerEntry[] => rows(v).map((e) => ({ event: String(e['event'] ?? ''), actor: s(e['actor']), at: s(e['at']) }));
export function toPackage(r: Row): PackageView {
  const m = (r['manifest'] ?? {}) as Row;
  return {
    id: String(r['package_id'] ?? ''), name: String(r['name'] ?? ''), version: String(r['version'] ?? ''), digest: String(r['package_digest'] ?? ''),
    state: String(r['state'] ?? 'unknown'), author: s(r['author']), destinations: strs(m['declared_destinations']), purposes: strs(m['purposes']),
    dataClasses: strs(m['data_classes']), protocol: s(r['protocol']), sdkVersion: s(r['sdk_version']),
    files: rows(r['files']).map((f) => ({ file: String(f['file'] ?? ''), sha256: String(f['sha256'] ?? ''), bytes: n(f['byte_length']) })), byteLength: n(r['byte_length']),
    registeredBy: s(r['registered_by']), registeredAt: s(r['registered_at']), decidedBy: s(r['decided_by']), decidedAt: s(r['decided_at']),
    decisionReason: s(r['decision_reason']), events: ledger(r['events']),
  };
}

/* ── the requalifications ─────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface ContractTestCase { name: string; outcome: 'pass' | 'fail' | 'skipped' | string; detail: string }
export interface RequalificationView {
  id: string; sourceId: string; contractVersion: number | null; cause: string; causeDetail: string; causeRunId: string | null; causeReceiptId: string | null;
  state: 'required' | 'submitted' | 'approved' | 'rejected' | string; openedBy: string | null; openedAt: string | null; digestAtOpening: string | null;
  packageId: string | null; packageVersion: string | null; packageDigest: string | null;
  tests: { outcome: string; summary: string; cases: ContractTestCase[]; transport: string | null; ranAt: string | null } | null;
  submittedBy: string | null; submittedAt: string | null; submitReason: string | null; decidedBy: string | null; decidedAt: string | null; decisionReason: string | null;
  events: LedgerEntry[];
}
export function toRequalification(r: Row): RequalificationView {
  const t = r['contract_tests'];
  const tests = typeof t === 'object' && t !== null ? {
    outcome: String((t as Row)['outcome'] ?? 'unknown'), summary: String((t as Row)['summary'] ?? ''), transport: s((t as Row)['transport']), ranAt: s((t as Row)['ran_at']),
    cases: rows((t as Row)['cases']).map((c) => ({ name: String(c['name'] ?? ''), outcome: String(c['outcome'] ?? 'unknown'), detail: String(c['detail'] ?? '') })),
  } : null;
  return {
    id: String(r['requalification_id'] ?? ''), sourceId: String(r['source_id'] ?? ''), contractVersion: n(r['contract_version']), cause: String(r['cause'] ?? ''),
    causeDetail: String(r['cause_detail'] ?? ''), causeRunId: s(r['cause_run_id']), causeReceiptId: s(r['cause_receipt_id']), state: String(r['state'] ?? 'unknown'),
    openedBy: s(r['opened_by']), openedAt: s(r['opened_at']), digestAtOpening: s(r['digest_at_opening']), packageId: s(r['package_id']), packageVersion: s(r['package_version']),
    packageDigest: s(r['package_digest']), tests, submittedBy: s(r['submitted_by']), submittedAt: s(r['submitted_at']), submitReason: s(r['submit_reason']),
    decidedBy: s(r['decided_by']), decidedAt: s(r['decided_at']), decisionReason: s(r['decision_reason']), events: ledger(r['events']),
  };
}
export const CAUSE_WORDS: Readonly<Record<string, string>> = {
  unregistered_destination: 'the cell asked for a host the contract never registered',
  destination_identity_changed: 'a registered destination presented another TLS identity than the pinned one',
  package_integrity: 'the package\'s stored bytes did not verify against its registered digest',
  credential_rotated: 'the credential reference was rotated',
};
export const causeText = (c: string): string => CAUSE_WORDS[c] ?? c.replace(/_/g, ' ');

/* ── the adapter contracts and the credential bindings ────────────────────────────────────────────────────────────────────────────── */
export interface AdapterContractView {
  sourceId: string; contractVersion: number | null; sourceKey: string; name: string; state: string; mode: string; endpoints: string[];
  inForce: { packageId: string; version: string; digest: string; via: 'contract' | 'requalification' | string } | null; problem: string | null; open: RequalificationView | null;
}
export function toAdapterContract(r: Row): AdapterContractView {
  const f = r['package_in_force'];
  const inForce = typeof f === 'object' && f !== null && s((f as Row)['package_id']) !== null
    ? { packageId: String((f as Row)['package_id']), version: String((f as Row)['version'] ?? ''), digest: String((f as Row)['digest'] ?? ''), via: String((f as Row)['via'] ?? 'contract') } : null;
  const o = r['open_requalification'];
  return {
    sourceId: String(r['source_id'] ?? ''), contractVersion: n(r['contract_version']), sourceKey: String(r['source_key'] ?? ''), name: String(r['name'] ?? r['source_key'] ?? ''),
    state: String(r['lifecycle_state'] ?? 'unknown'), mode: String(r['acquisition_mode'] ?? 'unknown'), endpoints: strs(r['endpoints']), inForce,
    problem: s(r['package_problem']), open: typeof o === 'object' && o !== null ? toRequalification(o as Row) : null,
  };
}
export interface BindingView { sourceId: string; contractVersion: number | null; version: number | null; ref: string; header: string; state: string; reason: string; boundBy: string | null; boundAt: string | null; revokedAt: string | null }
export function toBinding(r: Row): BindingView {
  return { sourceId: String(r['source_id'] ?? ''), contractVersion: n(r['contract_version']), version: n(r['binding_version']), ref: String(r['ref'] ?? ''), header: String(r['header'] ?? ''),
    state: String(r['state'] ?? ''), reason: String(r['reason'] ?? ''), boundBy: s(r['bound_by']), boundAt: s(r['bound_at']), revokedAt: s(r['revoked_at']) };
}
export interface ConnectorRegisterView { packages: PackageView[]; contracts: AdapterContractView[]; requalifications: RequalificationView[]; bindings: BindingView[]; asOf: string | null }
export function toRegister(r: Row): ConnectorRegisterView {
  return { packages: rows(r['packages']).map(toPackage), contracts: rows(r['contracts']).map(toAdapterContract), requalifications: rows(r['requalifications']).map(toRequalification),
    bindings: rows(r['credential_bindings']).map(toBinding), asOf: s(r['as_of']) };
}

/* ── the transfer receipts ────────────────────────────────────────────────────────────────────────────────────────────────────────── */
export interface DestinationView {
  mode: 'live' | 'replay' | 'none' | string; addresses: string[]; pinnedAddress: string | null; spki: string | null; pinState: string | null; expected: string[];
  addressDrift: boolean | null; replaySet: string | null; replayEntry: string | null;
}
export interface ReceiptView {
  id: string; sourceId: string; sourceKey: string | null; contractVersion: number | null; runId: string; seq: number | null; requestedAt: string | null; method: string;
  url: string; host: string; purpose: string | null; dataClass: string | null; decision: 'allowed' | 'refused' | 'blocked' | string; refusalClass: string | null; reason: string | null;
  requestDigest: string; requestBytes: number | null; responseStatus: number | null; responseDigest: string | null; responseBytes: number | null;
  destination: DestinationView; credentialInjected: boolean; credentialRef: string | null; packageDigest: string | null;
}
export function toDestination(v: unknown): DestinationView {
  const d = (typeof v === 'object' && v !== null ? v : {}) as Row;
  return { mode: String(d['mode'] ?? 'none'), addresses: strs(d['addresses']), pinnedAddress: s(d['pinned_address']), spki: s(d['tls_spki_sha256']), pinState: s(d['pin_state']),
    expected: strs(d['expected_spki_sha256']), addressDrift: typeof d['address_drift'] === 'boolean' ? d['address_drift'] as boolean : null, replaySet: s(d['replay_set']),
    replayEntry: s(d['replay_entry_sha256']) };
}
export function toReceipt(r: Row): ReceiptView {
  return {
    id: String(r['receipt_id'] ?? ''), sourceId: String(r['source_id'] ?? ''), sourceKey: s(r['source_key']), contractVersion: n(r['contract_version']), runId: String(r['run_id'] ?? ''),
    seq: n(r['seq']), requestedAt: s(r['requested_at']), method: String(r['method'] ?? ''), url: String(r['url_redacted'] ?? ''), host: String(r['host'] ?? ''),
    purpose: s(r['purpose']), dataClass: s(r['data_class']), decision: String(r['decision'] ?? 'unknown'), refusalClass: s(r['refusal_class']), reason: s(r['reason']),
    requestDigest: String(r['request_digest'] ?? ''), requestBytes: n(r['request_bytes']), responseStatus: n(r['response_status']), responseDigest: s(r['response_digest']),
    responseBytes: n(r['response_bytes']), destination: toDestination(r['destination']), credentialInjected: r['credential_injected'] === true, credentialRef: s(r['credential_ref']),
    packageDigest: s(r['package_digest']),
  };
}
/** Every refusal class the gateway records, in words (0123_b40_x_cr egress_receipts.refusal_class). */
export const REFUSAL_WORDS: Readonly<Record<string, string>> = {
  cell_token: 'not this run\'s cell (no token)', request: 'not a readable request', scheme: 'a scheme the contract does not allow', method: 'not a GET (a cell sends nothing out)',
  unregistered_destination: 'a host the contract does not register', purpose: 'a purpose the package and the contract do not both name',
  data_class: 'a data class the package does not declare', budget: 'the run budget was spent', throttle: 'the rate stage refused it',
  destination_identity_changed: 'the destination presented another identity than the pinned one', address_not_public: 'the host resolves to a non-public address',
  dns_failure: 'the host could not be resolved', tls_failure: 'TLS verification failed', timeout: 'the destination did not answer in time', transport: 'a transport failure',
  response_too_large: 'the answer exceeded the contract budget', replay_missing: 'the replay set holds no recorded answer', contract_test: 'a contract test makes no live request',
};
export const BLOCKING_CLASSES: readonly string[] = ['unregistered_destination', 'destination_identity_changed'];
export function decisionText(r: Pick<ReceiptView, 'decision' | 'refusalClass' | 'responseStatus'>): string {
  if (r.decision === 'allowed') return r.responseStatus === null ? 'allowed' : `allowed — answered ${r.responseStatus}`;
  const why = r.refusalClass === null ? 'no class recorded' : REFUSAL_WORDS[r.refusalClass] ?? r.refusalClass.replace(/_/g, ' ');
  return `${r.decision === 'blocked' ? 'blocked' : 'refused'} — ${why}`;
}
const short = (v: string | null, k = 12): string => (v === null ? 'none' : v.length > k ? `${v.slice(0, k)}…` : v);
export function destinationText(d: DestinationView): string {
  if (d.mode === 'replay') return `replay set ${d.replaySet ?? 'unnamed'}${d.replayEntry === null ? '' : ` · recorded answer ${short(d.replayEntry)}`}`;
  if (d.mode === 'live') {
    const pin = d.pinState === null ? 'pin not evaluated' : { first_use: 'pinned on first use', matched: 'matches the pin', declared: 'matches a declared pin', changed: 'DIFFERS from the pin' }[d.pinState] ?? d.pinState;
    return `live · ${d.pinnedAddress ?? 'no address'}${d.addresses.length > 1 ? ` (of ${d.addresses.length})` : ''} · TLS key ${short(d.spki)} — ${pin}${d.addressDrift === true ? ' · the address set moved' : ''}`;
  }
  return 'no destination reached';
}
/** The counts by decision and class, in words, in a stable order (allowed first, then blocked, then refused). */
export function receiptCounts(counts: unknown): Array<{ key: string; label: string; n: number }> {
  const c = (typeof counts === 'object' && counts !== null ? counts : {}) as Row;
  const order = (k: string): number => (k === 'allowed' ? 0 : k.startsWith('blocked') ? 1 : 2);
  return Object.entries(c).filter(([, v]) => typeof v === 'number').map(([k, v]) => {
    const [decision, cls] = k.split(':');
    return { key: k, n: v as number, label: decision === 'allowed' ? 'allowed' : `${decision} — ${REFUSAL_WORDS[cls ?? ''] ?? (cls ?? '').replace(/_/g, ' ')}` };
  }).sort((a, b) => order(a.key) - order(b.key) || a.key.localeCompare(b.key));
}

/* ── who may act (the server re-checks every rule) ────────────────────────────────────────────────────────────────────────────────── */
export interface Viewer { principalId: string; kind: string; roles: readonly string[] }
const external = (v: Viewer): boolean => v.roles.includes('external_collaborator');
export function registerFacts(v: Viewer): EligibilityFacts {
  return { action: 'observation.adapter.register', me: v.principalId, isHuman: v.kind === 'human' && !external(v), roles: v.roles, requiredRoles: ['collection_manager'] };
}
export function decidePackageFacts(v: Viewer, p: PackageView): EligibilityFacts {
  return { action: 'observation.adapter.approve', me: v.principalId, isHuman: v.kind === 'human' && !external(v), roles: v.roles, requiredRoles: ['domain_admin', 'collection_manager'],
    excluded: p.registeredBy === null ? [] : [{ principal: p.registeredBy, why: 'you registered this package — a second person decides it' }], state: p.state, openStates: ['registered'] };
}
export function submitFacts(v: Viewer, q: RequalificationView): EligibilityFacts {
  return { action: 'observation.connector.requalification.submit', me: v.principalId, isHuman: v.kind === 'human' && !external(v), roles: v.roles, requiredRoles: ['collection_manager'],
    state: q.state, openStates: ['required', 'rejected'] };
}
export function decideRequalificationFacts(v: Viewer, q: RequalificationView): EligibilityFacts {
  return { action: 'observation.connector.requalification.approve', me: v.principalId, isHuman: v.kind === 'human' && !external(v), roles: v.roles,
    requiredRoles: ['domain_admin', 'collection_manager'], excluded: q.submittedBy === null ? [] : [{ principal: q.submittedBy, why: 'you submitted this requalification — a second person decides it' }],
    state: q.state, openStates: ['submitted'] };
}
export function rotateFacts(v: Viewer): EligibilityFacts {
  return { action: 'observation.connector.credential.rotate', me: v.principalId, isHuman: v.kind === 'human' && !external(v), roles: v.roles, requiredRoles: ['collection_manager'] };
}

/** The effects the acts have, STATED (no server preview exists for them) — what changes, who it reaches, what is kept. */
export const CR_EFFECTS: Readonly<Record<string, Omit<ConsequenceView, 'source' | 'blockers'>>> = {
  'observation.adapter.register': { effect: 'stores the package\'s files in the vault and records it REGISTERED — it runs nowhere until a second person approves it and a contract binds it', affected: ['a new adapter package (registered)'], users: ['a domain admin or another collection manager (the decider)'], reversibility: 'a registered package is decided once; a change is a new version — nothing is deleted', residualRisk: 'none until approved', audit: 'adapter.registered on the package ledger and the audit chain' },
  'observation.adapter.approve': { effect: 'records your decision on THIS package digest (approve: a contract may run it; reject: none may) — the server refuses it for any other digest', affected: ['this package version'], users: ['the collection managers who bind it to a contract'], reversibility: 'decided once — a change is a new version', residualRisk: 'an approved package runs only through its cell and the egress gateway', audit: 'adapter.approved or adapter.rejected, the audit chain' },
  'observation.connector.requalification.submit': { effect: 'runs the chosen package\'s contract tests in a cell against the contract (no publisher request) and, when they pass, submits the requalification — it reactivates nothing', affected: ['this requalification'], users: ['a domain admin or another collection manager (the decider)'], reversibility: 'a rejected submission is submitted again; the record keeps every step', residualRisk: 'the contract stays suspended until a second person approves', audit: 'requalification.submitted with the tests, the audit chain' },
  'observation.connector.requalification.approve': { effect: 'records your decision on THIS submitted package digest — approve makes it the package in force (a manager may then reactivate); reject sends it back', affected: ['this requalification', 'the contract version it holds'], users: ['the collection managers', 'the source\'s stewards'], reversibility: 'decided once per submission', residualRisk: 'reactivation is a separate act by a manager', audit: 'requalification.approved or .rejected, contract.requalified, the audit chain' },
  'observation.connector.credential.rotate': { effect: 'binds a NEW credential reference to this adapter contract, revokes the one in force, SUSPENDS the contract and requires its requalification', affected: ['this contract version', 'its credential binding'], users: ['the collection managers', 'the run\'s agent (its next run uses the new reference)'], reversibility: 'rotated again — the revoked binding stays in the record', residualRisk: 'collection stops until the requalification is approved and the contract reactivated', audit: 'contract.credential_rotated, contract.suspended, requalification.required, the audit chain' },
};
export function crConsequence(action: string): ConsequenceView | null {
  const c = CR_EFFECTS[action];
  return c === undefined ? null : { ...c, source: 'stated', blockers: [] };
}

/* ── the payloads reviewed client-side (register, submit, rotate) ─────────────────────────────────────────────────────────────────── */
/** The SDK's package digest: sha256 over "<file>\0<sha256>\n" for the files sorted by name in byte order (UTF-8 code-unit order here). */
export function packageDigestInput(files: ReadonlyArray<{ file: string; sha256: string }>): string {
  const enc = new TextEncoder();
  const cmp = (a: string, b: string): number => { const x = enc.encode(a); const y = enc.encode(b); for (let i = 0; i < Math.min(x.length, y.length); i += 1) if (x[i] !== y[i]) return x[i]! - y[i]!; return x.length - y.length; };
  return [...files].sort((a, b) => cmp(a.file, b.file)).map((f) => `${f.file}\0${f.sha256}\n`).join('');
}
export async function sha256Hex(bytes: Uint8Array | string): Promise<string> {
  const data = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const buf = await globalThis.crypto.subtle.digest('SHA-256', data as BufferSource);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
/** The digest of a payload the person reviewed (canonical: keys sorted) — bound client-side only; the server binds none for a new record. */
export async function payloadDigest(payload: Row): Promise<string> {
  const canon = (v: unknown): unknown => Array.isArray(v) ? v.map(canon) : typeof v === 'object' && v !== null ? Object.fromEntries(Object.keys(v as Row).sort().map((k) => [k, canon((v as Row)[k])])) : v;
  return sha256Hex(JSON.stringify(canon(payload)));
}
const FILE_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
/** What the register will refuse about a selection of files, said before sending (the server re-checks every rule). */
export function selectionProblems(files: ReadonlyArray<{ file: string; bytes: number }>): string[] {
  const p: string[] = [];
  if (files.length === 0) p.push('choose the package\'s files (its adapter.json and its .mjs module)');
  if (files.length > 64) p.push('a package is at most 64 files');
  if (files.some((f) => !FILE_RE.test(f.file))) p.push('each file is a plain name (letters, digits, dot, underscore, hyphen)');
  if (new Set(files.map((f) => f.file)).size !== files.length) p.push('each file is named once');
  if (files.length > 0 && !files.some((f) => f.file === 'adapter.json')) p.push('the package carries its manifest as adapter.json');
  if (files.reduce((t, f) => t + f.bytes, 0) > 4 * 1024 * 1024) p.push('a package is at most 4 MiB');
  return p;
}
const REF_RE = /^EYE_SRC_[A-Z0-9_]{1,64}$/;
export function rotationProblems(ref: string, header: string, reason: string): string[] {
  const p: string[] = [];
  if (!REF_RE.test(ref.trim())) p.push('name the credential by its deployment reference EYE_SRC_<NAME> — never by its value');
  if (!/^[A-Za-z0-9-]{1,64}$/.test(header.trim())) p.push('the header is 1 to 64 letters, digits or hyphens');
  if (reason.trim().length < 8) p.push('say why the credential is rotated (8+ characters)');
  return p;
}
