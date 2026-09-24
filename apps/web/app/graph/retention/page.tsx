'use client';
/**
 * Retention — the governed retention workspace (CP-6 B9/B10; migrations 0066 §4, 0067 §1, 0068 §2/§6; ES-29-004).
 *
 * A RETENTION ACTION is a durable workflow, not a delete: OPENED (by a person, or by the evaluation of a SCHEDULE for
 * what fell due), its SCOPE RESOLVED (every item the action would touch, each with a disposition — execute, held by a
 * legal hold, excluded, blocking — and a DIGEST of that ordered scope), APPROVED by the retention authority on the digest
 * they read (never by the opener), EXECUTED by the steward (never by an approver) in one transaction — a hold placed since
 * the approval rolls the whole execution back and pauses the action — and VERIFIED check by check against what the vault
 * observes. A review records that the item was reviewed and touches no bytes; only a deletion tombstones, and its bytes go
 * after the record committed; a log-floor move retires the outbox history below the served points. Since B11 (0070) an
 * archive moves the bytes to the archive tier and a customer export builds a signed package under the export namespace —
 * read and revoked through their own routes; a deletion whose evidence version is load-bearing pauses with the dependents named.
 * Since B12 (0072) a restore moves archived bytes back to the hot tier (opened on demand, never by a schedule), and the COLD-TIER
 * MANAGER — a per-domain policy: a daily byte budget, the opens per evaluation, the attempts before escalation, the escalation
 * age, the restore window — is read by the execution and the evaluation; its state and its declaration have a section here.
 * Since B13 (0073) a schedule is RETIRED by its own governed act (its history kept), and the customer export's DELIVERY is
 * real: a package is signed with the tenant's Ed25519 key — declared by a credential REFERENCE bound in the server's process,
 * the private key never answered, the PUBLIC key recorded and shown — carries an expiry and an ARCHIVE digest (one deterministic
 * tar of manifest.json and the object files); its archive is DOWNLOADED through a governed, audited act; it is DELIVERED,
 * human-gated, to a declared DESTINATION — a transfer station (a directory the product writes into and reads the recipient's
 * receipt from: the disconnected-transfer path) or an https endpoint (POSTed, its bearer credential by reference) — and the
 * exchange closes on the RECIPIENT'S ACKNOWLEDGEMENT (a receipt naming the same digests, verified), or is recorded MISMATCHED.
 * The signing keys and the destinations have a section here; the download, the delivery and the deliveries sit on the action's record.
 * Since B16 (0076) the exchange has its other half: an EXCHANGE PARTNER is the party whose key-signed packages this domain admits —
 * its Ed25519 public key and the INTAKE SOURCE CONTRACT the imported records are held under — and a governed IMPORT takes a partner's
 * package (inline, or read from a transfer station) into QUARANTINE, runs the ordered checks (the archive, the manifest, every file's
 * digest, the re-import compatibility of every object, the chain, the signature against the partner's key, the closure by exact
 * version, the intake's policy, a live duplicate, the origin's revocation and expiry as far as they are provable here), is APPROVED by
 * the retention authority on the package digest (never by the opener) and ADMITTED by the steward (never by the approver) under ids
 * this installation mints — the origin's identity carried as digest-bound provenance — or WITHDRAWN. A revocation notice now says what
 * the destination is known to HOLD: `confirmed` (it answered a receipt), `possible` (the body left before the fault) — a destination
 * that provably received nothing is not notified.
 * Since B17 (0077) the revocation REACHES the copies: every notice is SIGNED with the package's key (eye-revocation-notice/1); an
 * IMPORTING DOMAIN of the tenant is a recipient on the origin's ledger (the export's IMPORTERS and their notices are shown on the
 * action's record) and its copies are DESTROYED by the same act — or, when the acting principal holds no authority there, by the
 * importing domain's own REVOKE act on the import (from the origin's record on this installation, or from the origin's signed notice
 * at a transfer station, verified against the partner's key): the imported edges retracted, the entities retired, every imported
 * version withdrawn, the bytes tombstoned; a legal hold holds it (`revoking`, the refused items named) until lifted and retried.
 * The import's record shows the revocation as recorded, the items' outcomes and the `import.revocation_*` events.
 *
 * Nothing here predicts a state: every row, count, digest and check is rendered as the server returned it, and every
 * refusal — the opener's own approval, a wrong digest, an unresolved scope, a review's failed check, a budget exhausted, an
 * expired package, an unbound credential reference — is shown in the server's own words with its code. No credential VALUE
 * is ever shown, sent or held here: a reference's name and its readiness only.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { useShell } from '../layout';
import {
  retention, RETENTION_CLASSIFICATIONS, RETENTION_DESTINATION_KINDS, RETENTION_KEY_PURPOSES, RETENTION_KINDS, RETENTION_TARGET_KINDS,
  type RetentionActionDetail, type RetentionClassification, type RetentionDestinationIntake, type RetentionDestinationKind, type RetentionEvaluation, type RetentionExecutionResult, type RetentionExportDetail, type RetentionExportDownload, type RetentionKeyPurpose, type RetentionKind, type RetentionOpenIntake,
  type RetentionRow, type RetentionScheduleIntake, type RetentionScopeSummary, type RetentionSigningKeyIntake, type RetentionTargetKind, type RetentionTierPolicyIntake, type RetentionTierState, type RetentionVaultInventory, type RetentionVerdict,
  type RetentionImportCheck, type RetentionImportDetail, type RetentionImportOpened, type RetentionImportSource, type RetentionPartnerIntake,
  type RetentionNoticeRecipient, type RetentionRevocationSource,
} from '../../../lib/graph';
import { Empty, LiveStatus, Mono, ScrollBox, cardStyle, DefinitionRow, UnknownNote, GovernedButton, fmtInstant } from '../../../components/observation';
import { inputStyle, tableStyle, Th, Td, Receipt } from '../../../components/ui';

type Row = Record<string, unknown>;
type ReceiptT = { policyDecisionId: string; auditSeq: number } | null;
const str = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : String(v));
const short = (v: unknown) => (typeof v === 'string' && v.length > 12 ? `${v.slice(0, 8)}…` : str(v));
const rec = (v: unknown): Row => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : {});
const arr = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const json = (v: unknown) => JSON.stringify(v ?? {});
const yes = (v: unknown) => (v === true ? 'yes' : v === false ? 'no' : str(v));
/** A failed call, as the server answered it: status, code and message verbatim (a network failure has no code). */
const refusal = (r: { status: number; error?: { code: string; message: string } }, fallback: string) =>
  `HTTP ${r.status}${r.error?.code !== undefined && r.error.code !== '' ? ` ${r.error.code}` : ''} — ${r.error?.message ?? fallback}`;
/** An interval as the driver serves it: a string, or an object of non-zero units ({ days: 90 } → "90 days"). */
const fmtInterval = (v: unknown): string => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'string') return v;
  if (typeof v === 'object') {
    const parts = Object.entries(v as Row).filter(([, n]) => typeof n === 'number' && n !== 0).map(([k, n]) => `${String(n)} ${k}`);
    return parts.length === 0 ? '0 seconds' : parts.join(' ');
  }
  return String(v);
};
/** A selector as the server stores it: manifest_id / source_id / manifest_ids (a chosen object set), the export's classification_ceiling, destination and (B13) expires_after, or partition_key / to_seq. */
const selectorText = (v: unknown): string => {
  const s = rec(v);
  const parts = (['manifest_id', 'source_id', 'manifest_ids', 'classification_ceiling', 'destination', 'expires_after', 'partition_key', 'to_seq'] as const)
    .filter((k) => s[k] !== undefined && s[k] !== null)
    .map((k) => `${k} ${Array.isArray(s[k]) ? `${(s[k] as unknown[]).length} id(s): ${(s[k] as unknown[]).map(String).join(', ')}` : String(s[k])}`);
  return parts.length === 0 ? (Object.keys(s).length === 0 ? '(none)' : json(s)) : parts.join(' · ');
};
/** A blocking item's dependents (B11): kind:ref each, as the resolution named them. */
const dependentsText = (v: unknown): string => arr(v).map((d) => `${str(d['kind'])}:${str(d['ref'])}`).join(', ');
const residualsText = (v: unknown): string => {
  const rs = arr(v);
  return rs.length === 0 ? 'none' : rs.map((x) => `${str(x['kind'])} ×${str(x['count'])} (${str(x['status'])})`).join(', ');
};
/** The scope summary the resolution recorded: items / execute / held / blocking / excluded (since B11), and the residual inventory by kind. */
const scopeText = (v: unknown): string => {
  const s = rec(v);
  if (Object.keys(s).length === 0) return 'not resolved';
  return `${str(s['items'])} item(s): ${str(s['execute'])} execute, ${str(s['held'])} held, ${str(s['blocking'])} blocking${s['excluded'] !== undefined ? `, ${str(s['excluded'])} excluded` : ''}; residuals ${residualsText(s['residuals'])}`;
};
const failureText = (a: Row): string => {
  if (a['failure_class'] === null || a['failure_class'] === undefined) return '—';
  return `${str(a['failure_class'])} → ${str(a['disposition'])}${a['failure_reason'] !== null && a['failure_reason'] !== undefined ? ` — ${String(a['failure_reason'])}` : ''}`;
};
/** A schedule's last evaluation as the evaluation recorded it (B12): { at, opened, deferred }; `{}` until one has run. */
const lastEvaluationText = (v: unknown): string => {
  const e = rec(v);
  if (Object.keys(e).length === 0) return 'none recorded';
  return `opened ${str(e['opened'])}, deferred ${str(e['deferred'])} at ${fmtInstant(e['at'])}`;
};
/** A blob root's inventory as the controller listed it: the counts, or the error the listing raised (nulls then); B21.2: prefixed UNREACHABLE when the root's marker could not be read (the directory may still list — the marker is the rule). */
const inventoryText = (i: RetentionVaultInventory | undefined): string =>
  i === undefined ? '—' : `${i.reachable === false ? 'UNREACHABLE · ' : ''}${i.error !== undefined ? `not listed — ${i.error}` : `${str(i.blobs)} blob(s), ${str(i.staged)} staged, ${str(i.temp)} temp`}`;
/** A retirement as the row records it (B13: a schedule's, a key's, a destination's): the instant and the reason, or "no" while the row is not retired. */
const isRetired = (row: Row) => row['retired_at'] !== null && row['retired_at'] !== undefined;
const retiredText = (row: Row): string => (isRetired(row) ? `${fmtInstant(row['retired_at'])} — ${str(row['retire_reason'])}` : 'no');
/** A signature block as the manifest carries it (B11 scheme /1: the digest chain; B13 scheme /2: key-based, Ed25519): what names the scheme and, for /2, the key. */
const signatureText = (v: unknown): string => {
  const s = rec(v);
  if (Object.keys(s).length === 0) return 'none recorded';
  return `scheme ${str(s['scheme'])}${s['key_id'] !== undefined ? ` · key ${str(s['key_id'])} (${str(s['algorithm'])})` : ' · the digest chain, no key'}${s['purpose'] !== undefined ? ` · purpose ${str(s['purpose'])}` : ''}`;
};
/** The block's public key PEM, when the manifest or the download carries one (scheme /2); the export's record carries it under signing_key as well. */
const pemOf = (v: unknown): string | null => {
  const s = rec(v);
  return typeof s['public_key_pem'] === 'string' ? s['public_key_pem'] : null;
};
/** The tar's bytes as the answer carries them (base64 → the bytes): what the Blob is built from. */
const bytesOf = (base64: string): Uint8Array<ArrayBuffer> => {
  const s = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(s.length));
  for (let i = 0; i < s.length; i += 1) bytes[i] = s.charCodeAt(i);
  return bytes;
};
/** The receipt JSON a person pastes for the acknowledge act: an object, or null while it is not one (the server states what it refuses of the object). */
const receiptObjectOf = (text: string): Row | null => {
  try { const v: unknown = JSON.parse(text); return v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Row) : null; } catch { return null; }
};

interface Outcome<T> { result: T | null; receipt: ReceiptT; problem: string | null }
const none = <T,>(): Outcome<T> => ({ result: null, receipt: null, problem: null });

interface OpenDraft { kind: RetentionKind; targetKind: RetentionTargetKind; manifestId: string; sourceId: string; manifestIds: string; classificationCeiling: RetentionClassification; expiresAfter: string; partitionKey: string; toSeq: string; retentionProfile: string }
/** A chosen object set (B11): one id per line, blanks ignored — an archive's, a customer export's or (B12) a restore's selector. */
const manifestIdsOf = (text: string): string[] => text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l !== '');
const takesObjectSet = (kind: RetentionKind) => kind === 'archive' || kind === 'customer_export' || kind === 'restore';
const openOk = (d: OpenDraft) =>
  d.targetKind === 'evidence'
    ? d.manifestId.trim() !== '' || d.sourceId.trim() !== '' || (takesObjectSet(d.kind) && manifestIdsOf(d.manifestIds).length > 0)
    : d.partitionKey.trim() !== '' && d.toSeq.trim() !== '' && Number.isInteger(Number(d.toSeq));
function toOpenIntake(d: OpenDraft): RetentionOpenIntake {
  const profile = d.retentionProfile.trim() === '' ? {} : { retentionProfile: d.retentionProfile.trim() };
  if (d.targetKind === 'log_partition') return { kind: d.kind, targetKind: 'log_partition', selector: { partitionKey: d.partitionKey.trim(), toSeq: Number(d.toSeq) }, ...profile };
  const ids = takesObjectSet(d.kind) ? manifestIdsOf(d.manifestIds) : [];
  return {
    kind: d.kind, targetKind: 'evidence',
    selector: {
      ...(d.manifestId.trim() === '' ? {} : { manifestId: d.manifestId.trim() }), ...(d.sourceId.trim() === '' ? {} : { sourceId: d.sourceId.trim() }),
      ...(ids.length === 0 ? {} : { manifestIds: ids }),
      ...(d.kind === 'customer_export' ? { classificationCeiling: d.classificationCeiling, destination: 'export' as const, ...(d.expiresAfter.trim() === '' ? {} : { expiresAfter: d.expiresAfter.trim() }) } : {}),
    },
    ...profile,
  };
}

/** A signing key as a person declares it (B13): the credential reference's NAME and the purpose — never a value. */
interface KeyDraft { credentialRef: string; purpose: RetentionKeyPurpose }
const EMPTY_KEY: KeyDraft = { credentialRef: '', purpose: 'demonstration' };
const keyOk = (d: KeyDraft) => d.credentialRef.trim() !== '';
const toKeyIntake = (d: KeyDraft): RetentionSigningKeyIntake => ({ credentialRef: d.credentialRef.trim(), purpose: d.purpose });

/** A destination as a person declares it (B13; B14 the trust anchor): the credential reference and the trust anchor are an https destination's and are sent only when given. */
interface DestinationDraft { destinationKey: string; kind: RetentionDestinationKind; endpoint: string; credentialRef: string; trustAnchorPem: string; recipient: string; purpose: string }
const EMPTY_DESTINATION: DestinationDraft = { destinationKey: '', kind: 'transfer_station', endpoint: '', credentialRef: '', trustAnchorPem: '', recipient: '', purpose: '' };
const destinationOk = (d: DestinationDraft) => d.destinationKey.trim() !== '' && d.endpoint.trim() !== '' && d.recipient.trim() !== '' && d.purpose.trim() !== '';
function toDestinationIntake(d: DestinationDraft): RetentionDestinationIntake {
  return {
    destinationKey: d.destinationKey.trim(), kind: d.kind, endpoint: d.endpoint.trim(), recipient: d.recipient.trim(), purpose: d.purpose.trim(),
    ...(d.credentialRef.trim() === '' ? {} : { credentialRef: d.credentialRef.trim() }),
    ...(d.trustAnchorPem.trim() === '' ? {} : { trustAnchorPem: d.trustAnchorPem.trim() }),
  };
}
/** B16: an exchange partner as a person declares it — the party's PUBLIC key PEM (never a private value) and the intake contract of this domain. */
interface PartnerDraft { partnerKey: string; party: string; purpose: string; publicKeyPem: string; intakeSourceId: string; intakeContractVersion: string }
const EMPTY_PARTNER: PartnerDraft = { partnerKey: '', party: '', purpose: '', publicKeyPem: '', intakeSourceId: '', intakeContractVersion: '1' };
const partnerOk = (d: PartnerDraft) => d.partnerKey.trim() !== '' && d.party.trim() !== '' && d.purpose.trim() !== '' && d.publicKeyPem.includes('-----BEGIN PUBLIC KEY-----') && d.intakeSourceId.trim() !== '' && isInt(d.intakeContractVersion) && Number(d.intakeContractVersion) >= 1;
const toPartnerIntake = (d: PartnerDraft): RetentionPartnerIntake => ({ partnerKey: d.partnerKey.trim(), party: d.party.trim(), purpose: d.purpose.trim(), publicKeyPem: d.publicKeyPem.trim(), intakeSourceId: d.intakeSourceId.trim(), intakeContractVersion: Number(d.intakeContractVersion) });
/**
 * B16: an import as a person opens it — INLINE (a package file read in the browser as base64; the exchange statement pasted as JSON when
 * the sender gave one) or from a transfer STATION declared in this domain at the origin's tenant, domain and action. The inline ceiling is
 * the server's (64 MiB decoded, and the listener's body limit before it): a larger package goes to a station.
 */
interface ImportDraft { kind: 'inline' | 'station'; fileName: string; base64: string; byteLength: number; exchange: string; destinationKey: string; originTenantId: string; originDomainId: string; originActionId: string }
const EMPTY_IMPORT: ImportDraft = { kind: 'inline', fileName: '', base64: '', byteLength: 0, exchange: '', destinationKey: '', originTenantId: '', originDomainId: '', originActionId: '' };
const importOk = (d: ImportDraft) =>
  d.kind === 'inline'
    ? d.base64 !== '' && (d.exchange.trim() === '' || receiptObjectOf(d.exchange) !== null)
    : d.destinationKey.trim() !== '' && d.originTenantId.trim() !== '' && d.originDomainId.trim() !== '' && d.originActionId.trim() !== '';
function toImportSource(d: ImportDraft): RetentionImportSource {
  if (d.kind === 'station') return { kind: 'station', destinationKey: d.destinationKey.trim(), origin: { tenantId: d.originTenantId.trim(), domainId: d.originDomainId.trim(), actionId: d.originActionId.trim() } };
  const exchange = d.exchange.trim() === '' ? null : receiptObjectOf(d.exchange);
  return { kind: 'inline', base64: d.base64, ...(exchange === null ? {} : { exchange }) };
}
/** A file's bytes as standard base64 (built in chunks: a package of some MiB is not a single string concatenation). */
const base64OfBytes = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};
/** B16: a check of an import as the open act recorded it — passed / FAILED / a note (a fact the product cannot establish here, stated as such). */
const checkVerdict = (c: RetentionImportCheck): string => (c.ok === true ? 'passed' : c.ok === false ? 'FAILED' : 'note');
/** B14/B16: what a revocation notice says the destination HOLDS — confirmed (it answered a receipt), possible (the body left before the fault) — read from the notice as sent (`notice.delivery.held`). */
const heldOf = (x: Row): string => str(rec(rec(x['notice'])['delivery'])['held'] ?? rec(x['delivery'])['held']);
/** B17: who a notice went to — a destination by its key, or (`kind: 'importer'`) an importing domain of the tenant by the notice's own recipient (`import:<tenant>/<domain>/<import_id>`). */
const noticeRecipientOf = (x: Row): string => (x['kind'] === 'importer' || (x['destination_key'] === null && rec(x['importer'])['import_id'] !== undefined)
  ? str(x['recipient'] ?? rec(x['notice'])['recipient'] ?? `import:${str(rec(x['importer'])['domain_id'])}/${str(rec(x['importer'])['import_id'])}`)
  : str(x['destination_key']));
/** B17: the signature a notice carries, as recorded — the scheme and key id, or the server's own statement of why it is unsigned. */
const noticeSignatureOf = (x: Row): string => {
  const n = rec(x['notice']);
  const s = n['signature'];
  if (s !== null && typeof s === 'object' && !Array.isArray(s)) return `${str((s as Row)['scheme'])} · key ${str((s as Row)['key_id'])}`;
  return n['unsigned'] === undefined ? '—' : `unsigned — ${str(n['unsigned'])}`;
};
/** B17: the events of an import's revocation among its events (`import.revocation_notified` … `import.copies_refused`). */
const isRevocationEvent = (e: Row): boolean => /^import\.(revocation_|revoked|batch_revoked|copies_)/.test(String(e['event'] ?? ''));

/** B14: a destination's trust anchor as the server shows it — the certificates by subject and fingerprint, or "the deployment's trust store". */
function trustAnchorText(d: Record<string, unknown>): string {
  const a = d['trust_anchor'] as { declared?: boolean; certificates?: Array<Record<string, unknown>> } | null | undefined;
  if (a === null || a === undefined || a.declared !== true) return d['kind'] === 'https' ? 'the deployment\'s trust store' : '—';
  return (a.certificates ?? []).map((c) => `${String(c['subject'] ?? '?')} · ${String(c['fingerprint256'] ?? '?').slice(0, 23)}… · until ${String(c['valid_to'] ?? '?')}`).join('; ');
}

/** The archive as downloaded (B13 D7): the answer's record and the object URL of the Blob the person's browser saves — revoked after the click (the url then '' and the link gone), or when another download or selection replaces it. */
interface Downloaded { filename: string; byteLength: number; archiveDigest: string; packageDigest: string; manifestDigest: string; signature: Row; expiresAt: string | null; url: string }

interface ScheduleDraft { retentionProfile: string; targetKind: RetentionTargetKind; actionKind: RetentionKind; dueAfter: string; sourceId: string; ownerPrincipalId: string }
const EMPTY_SCHEDULE: ScheduleDraft = { retentionProfile: '', targetKind: 'evidence', actionKind: 'review', dueAfter: '', sourceId: '', ownerPrincipalId: '' };
const scheduleOk = (d: ScheduleDraft) => d.retentionProfile.trim() !== '' && d.dueAfter.trim() !== '';
function toScheduleIntake(d: ScheduleDraft): RetentionScheduleIntake {
  return {
    retentionProfile: d.retentionProfile.trim(), targetKind: d.targetKind, actionKind: d.actionKind, dueAfter: d.dueAfter.trim(),
    ...(d.sourceId.trim() === '' ? {} : { selector: { source_id: d.sourceId.trim() } }),
    ...(d.ownerPrincipalId.trim() === '' ? {} : { ownerPrincipalId: d.ownerPrincipalId.trim() }),
  };
}

/** The cold tier's policy as a person drafts it (B12): the five fields, shown with the server's defaults; a blank budget is sent as null (unbounded). */
interface PolicyDraft { budgetBytesPerDay: string; maxOpensPerEvaluation: string; maxAttempts: string; escalateAfter: string; restoreHotFor: string }
const DEFAULT_POLICY: PolicyDraft = { budgetBytesPerDay: '', maxOpensPerEvaluation: '200', maxAttempts: '3', escalateAfter: '7 days', restoreHotFor: '30 days' };
const isInt = (s: string) => s.trim() !== '' && Number.isInteger(Number(s));
const policyOk = (d: PolicyDraft) =>
  (d.budgetBytesPerDay.trim() === '' || isInt(d.budgetBytesPerDay)) && isInt(d.maxOpensPerEvaluation) && isInt(d.maxAttempts)
  && d.escalateAfter.trim() !== '' && d.restoreHotFor.trim() !== '';
function toPolicyIntake(d: PolicyDraft): RetentionTierPolicyIntake {
  return {
    budgetBytesPerDay: d.budgetBytesPerDay.trim() === '' ? null : Number(d.budgetBytesPerDay),
    maxOpensPerEvaluation: Number(d.maxOpensPerEvaluation), maxAttempts: Number(d.maxAttempts),
    escalateAfter: d.escalateAfter.trim(), restoreHotFor: d.restoreHotFor.trim(),
  };
}

const h3 = { fontSize: 'var(--eye-type-heading-3)' } as const;
const muted = { color: 'var(--eye-color-ink-muted)' } as const;
const critical = { color: 'var(--eye-color-critical)' } as const;
const rowStyle = { display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))', gap: 'var(--eye-space-8)' } as const;
const controlRow = { marginBlockStart: 'var(--eye-space-8)' } as const;
const wide = { ...inputStyle, inlineSize: '100%' } as const;

function Field({ id, label, children }: { id: string; label: string; children: (id: string) => ReactNode }) {
  return <div><label htmlFor={id} style={{ display: 'block' }}>{label}</label>{children(id)}</div>;
}
function Sel<T extends string>({ id, value, options, onChange }: { id: string; value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <select id={id} style={wide} value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
function Txt({ id, value, onChange, type }: { id: string; value: string; onChange: (v: string) => void; type?: string }) {
  return <input id={id} type={type ?? 'text'} style={wide} value={value} onChange={(e) => onChange(e.target.value)} />;
}
function Problem({ verb, problem }: { verb: string; problem: string | null }) {
  return problem === null ? null : <LiveStatus assertive><span style={critical}>{verb} — {problem}</span></LiveStatus>;
}
/** Preformatted text as the server sent it — a public key PEM, a signature block, a receipt — never reflowed. */
function Block({ label, text }: { label: string; text: string }) {
  return (
    <ScrollBox label={label}>
      <pre style={{ background: 'var(--eye-color-surface-secondary)', border: '1px solid var(--eye-color-border-default)', borderRadius: 'var(--eye-radius-md)', padding: 'var(--eye-space-8)', fontFamily: 'var(--eye-font-mono)', fontSize: 'var(--eye-type-mono-sm)', margin: 0, maxBlockSize: '18rem', overflow: 'auto', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{text}</pre>
    </ScrollBox>
  );
}
/** A retirement's control (B13): the reason and the governed button, on a row that is not retired; the server refuses a second retirement and a reason under 8 characters. */
function Retire({ id, reason, onReason, onRun }: { id: string; reason: string; onReason: (v: string) => void; onRun: () => Promise<void> }) {
  return (
    <span style={{ display: 'inline-flex', gap: 'var(--eye-space-4)', alignItems: 'center' }}>
      <input aria-label={`reason to retire ${id} (at least 8 characters)`} placeholder="reason (8+ characters)" style={{ ...inputStyle, inlineSize: '12rem' }} value={reason} onChange={(e) => onReason(e.target.value)} />
      <GovernedButton label="Retire" pendingLabel="retiring" variant="critical" disabled={reason.trim().length < 8} onRun={onRun} />
    </span>
  );
}

/** The verdict a verification returned, VERBATIM: each check and, on a pass, the scope the DeletionVerified event carries. */
function Verdict({ v }: { v: RetentionVerdict }) {
  return (
    <>
      <p>
        <strong>{v.verified ? 'verified' : 'not verified'}</strong> · the action is now <Mono>{str(v.state)}</Mono>
        {v.executed !== undefined && <> · executed {String(v.executed)}, held {String(v.held)}, excluded {String(v.excluded)}</>}
        {v.authorized_by !== undefined && <> · authorised by {v.authorized_by.length === 0 ? 'no live approval' : v.authorized_by.map((a) => short(a)).join(', ')}</>}
        {v.residual !== undefined && <> · residual {residualsText(v.residual)}</>}
        {v.kind === 'review' && v.verified && <> · a review's verification is its own record: no DeletionVerified is published for it</>}
      </p>
      {v.checks.length === 0 ? <Empty>The verification ran no check.</Empty> : (
        <ScrollBox label="verification checks">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Item</Th><Th>Kind</Th><Th>Disposition</Th><Th>Passed</Th></tr></thead>
            <tbody>{v.checks.map((c, i) => (
              <tr key={i}><Td mono>{str(c.item)}</Td><Td>{str(c.kind)}</Td><Td>{str(c.disposition)}</Td><Td><strong>{yes(c.passed)}</strong></Td></tr>
            ))}</tbody>
          </table>
        </ScrollBox>
      )}
    </>
  );
}

function Execution({ e }: { e: RetentionExecutionResult }) {
  if (e.retried === true) {
    return (
      <p>
        the action was already executed: its <strong>pending bytes residuals</strong> ({String(e.pending)}) were tried again —
        {' '}removed {e.bytes.removed.length === 0 ? 'none' : e.bytes.removed.map((l) => <Mono key={l}>{l} </Mono>)},
        {' '}failed {e.bytes.failed.length === 0 ? 'none' : e.bytes.failed.map((l) => <Mono key={l}>{l} </Mono>)}; verification closes what is gone
      </p>
    );
  }
  return (
    <p>
      executed <strong>{String(e.executed)}</strong>, held {String(e.held)}, refused {String(e.refused)}
      {e.floor !== null && <> · the floor of <Mono>{str(e.floor['partition_key'])}</Mono> moved from {str(e.floor['floor_before'])} to {str(e.floor['floor_after'])} (next sequence {str(e.floor['next_seq'])})</>}
      {e.package !== null && e.package !== undefined && <> · the package built under <Mono>{str(e.package['locator_prefix'])}</Mono>: {str(e.package['objects'])} object(s), {str(e.package['excluded'])} excluded, {str(e.package['bytes'])} bytes, package digest <Mono>{str(e.package['package_digest'])}</Mono></>}
      {' · '}bytes removed after the commit: {e.bytes.removed.length === 0 ? 'none' : e.bytes.removed.map((l) => <Mono key={l}>{l} </Mono>)}
      {e.bytes.failed.length > 0 && <>; <span style={critical}>the vault refused {e.bytes.failed.length} removal(s)</span>, recorded as pending residuals on the action: {e.bytes.failed.map((l) => <Mono key={l}>{l} </Mono>)}</>}
    </p>
  );
}

function Resolved({ s }: { s: RetentionScopeSummary }) {
  return (
    <p>
      the scope resolved to <strong>{str(s.state)}</strong> · {String(s.items)} item(s): {String(s.execute)} execute, {String(s.held)} held, {String(s.blocking)} blocking{s.excluded !== undefined && <>, {String(s.excluded)} excluded</>}
      {' · '}residuals {residualsText(s.residuals)} · digest <Mono>{str(s.scope_digest)}</Mono>
    </p>
  );
}

/** The action's record as the get route serves it: the scope items in dependency order, approvals, executions, residuals, verifications, events. */
function ActionRecord({ d }: { d: RetentionActionDetail }) {
  const a = d.action;
  return (
    <>
      <dl>
        <DefinitionRow term="Action"><Mono>{str(a['action_id'])}</Mono> · <strong>{str(a['kind'])}</strong> on {str(a['target_kind'])} · state <strong>{str(a['state'])}</strong></DefinitionRow>
        <DefinitionRow term="Selector"><Mono>{selectorText(a['selector'])}</Mono></DefinitionRow>
        <DefinitionRow term="Retention profile">{str(a['retention_profile'])}{a['schedule_id'] !== null && a['schedule_id'] !== undefined ? <> · schedule <Mono>{String(a['schedule_id'])}</Mono></> : ' · opened by a person, not a schedule'}</DefinitionRow>
        <DefinitionRow term="Opened">by <Mono>{short(a['opened_by'])}</Mono> at {fmtInstant(a['opened_at'])} · due from {fmtInstant(a['due_from'])}</DefinitionRow>
        <DefinitionRow term="Timeline">resolved {fmtInstant(a['resolved_at'])} · approved {fmtInstant(a['approved_at'])} · executed {fmtInstant(a['executed_at'])} · verified {fmtInstant(a['verified_at'])} · closed {fmtInstant(a['closed_at'])}</DefinitionRow>
        <DefinitionRow term="Scope">{scopeText(a['scope_summary'])}</DefinitionRow>
        <DefinitionRow term="Scope digest">{a['scope_digest'] === null || a['scope_digest'] === undefined ? 'none — the scope has not been resolved' : <Mono>{String(a['scope_digest'])}</Mono>}</DefinitionRow>
        <DefinitionRow term="Failure">{failureText(a)}</DefinitionRow>
        <DefinitionRow term="Attempts">{str(a['attempts'])} execution(s) begun under the tier policy (a re-resolution of an escalated action restarts the count)</DefinitionRow>
        <DefinitionRow term="Escalated">{a['escalated_at'] === null || a['escalated_at'] === undefined ? 'no' : <>{fmtInstant(a['escalated_at'])} — for human review; the approvals were revoked</>}</DefinitionRow>
        <DefinitionRow term="Residual summary">{arr(a['residual_summary']).length === 0 ? 'none recorded' : arr(a['residual_summary']).map((x, i) => <span key={i}>{str(x['kind'])} ×{str(x['count'])} ({str(x['status'])}){x['note'] !== null && x['note'] !== undefined ? ` — ${String(x['note'])}` : ''}; </span>)}</DefinitionRow>
      </dl>

      <h3 style={h3}>Scope items ({d.items.length})</h3>
      {d.items.length === 0 ? <Empty>No scope item: the scope has not been resolved, or the selector resolves to nothing.</Empty> : (
        <ScrollBox label="retention scope items">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Order</Th><Th>Kind</Th><Th>Ref</Th><Th>Disposition</Th><Th>Hold</Th><Th>Tier</Th><Th>Reason</Th><Th>Dependents</Th><Th>Details</Th></tr></thead>
            <tbody>{d.items.map((i) => (
              <tr key={String(i['item_id'])}>
                <Td mono>{str(i['dependency_order'])}</Td><Td>{str(i['item_kind'])}</Td><Td mono>{str(i['ref'])}</Td>
                <Td><strong>{str(i['disposition'])}</strong></Td><Td mono>{i['hold_id'] === null || i['hold_id'] === undefined ? '—' : String(i['hold_id'])}</Td>
                <Td>{str(rec(i['details'])['tier'])}</Td>
                <Td>{str(i['reason'])}</Td><Td mono>{i['disposition'] === 'blocking' ? dependentsText(rec(i['details'])['dependents']) : '—'}</Td><Td mono>{json(i['details'])}</Td>
              </tr>))}</tbody>
          </table>
        </ScrollBox>
      )}

      <h3 style={h3}>Approvals ({d.approvals.length})</h3>
      {d.approvals.length === 0 ? <Empty>No approval is recorded.</Empty> : (
        <ScrollBox label="retention approvals">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Approval</Th><Th>Approver</Th><Th>Digest approved</Th><Th>Rationale</Th><Th>Recorded</Th><Th>Expires</Th><Th>Revoked</Th></tr></thead>
            <tbody>{d.approvals.map((p) => (
              <tr key={String(p['approval_id'])}>
                <Td mono>{short(p['approval_id'])}</Td><Td mono>{short(p['approver_principal_id'])}</Td><Td mono>{str(p['scope_digest'])}</Td><Td>{str(p['rationale'])}</Td>
                <Td>{fmtInstant(p['recorded_at'])}</Td><Td>{fmtInstant(p['expires_at'])}</Td>
                <Td>{p['revoked_at'] === null || p['revoked_at'] === undefined ? 'live' : `${fmtInstant(p['revoked_at'])} — ${str(p['revoke_reason'])}`}</Td>
              </tr>))}</tbody>
          </table>
        </ScrollBox>
      )}

      <h3 style={h3}>Executions ({d.executions.length})</h3>
      {d.executions.length === 0 ? <Empty>Nothing has been executed.</Empty> : (
        <ScrollBox label="retention executions">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Item</Th><Th>Port</Th><Th>Outcome</Th><Th>Evidence</Th><Th>Executed by</Th><Th>Executed at</Th></tr></thead>
            <tbody>{d.executions.map((e) => (
              <tr key={String(e['execution_id'])}>
                <Td mono>{e['item_id'] === null || e['item_id'] === undefined ? '—' : short(e['item_id'])}</Td><Td mono>{str(e['port'])}</Td>
                <Td><strong>{str(e['outcome'])}</strong></Td><Td mono>{json(e['evidence'])}</Td>
                <Td mono>{short(e['executed_by'])}</Td><Td>{fmtInstant(e['executed_at'])}</Td>
              </tr>))}</tbody>
          </table>
        </ScrollBox>
      )}

      <h3 style={h3}>Residual inventory ({d.residuals.length})</h3>
      {d.residuals.length === 0 ? <Empty>No residual: nothing the action leaves behind is recorded.</Empty> : (
        <ScrollBox label="retention residual inventory">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Kind</Th><Th>Ref</Th><Th>Count</Th><Th>Status</Th><Th>Note</Th><Th>Recorded</Th></tr></thead>
            <tbody>{d.residuals.map((x) => (
              <tr key={String(x['residual_id'])}>
                <Td>{str(x['kind'])}</Td><Td mono>{str(x['ref'])}</Td><Td mono>{str(x['count'])}</Td><Td><strong>{str(x['status'])}</strong></Td><Td>{str(x['note'])}</Td><Td>{fmtInstant(x['recorded_at'])}</Td>
              </tr>))}</tbody>
          </table>
        </ScrollBox>
      )}

      <h3 style={h3}>Verifications ({d.verifications.length})</h3>
      {d.verifications.length === 0 ? <Empty>No verification check is recorded.</Empty> : (
        <ScrollBox label="retention verifications">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Check</Th><Th>Expected</Th><Th>Observed</Th><Th>Passed</Th><Th>Verified by</Th><Th>Verified at</Th></tr></thead>
            <tbody>{d.verifications.map((v) => (
              <tr key={String(v['verification_id'])}>
                <Td>{str(v['check_name'])}</Td><Td mono>{json(v['expected'])}</Td><Td mono>{json(v['observed'])}</Td>
                <Td><strong>{yes(v['passed'])}</strong></Td><Td mono>{short(v['verified_by'])}</Td><Td>{fmtInstant(v['verified_at'])}</Td>
              </tr>))}</tbody>
          </table>
        </ScrollBox>
      )}

      <h3 style={h3}>Events ({d.events.length})</h3>
      {d.events.length === 0 ? <Empty>No event.</Empty> : (
        <ScrollBox label="retention action events">
          <table className="eye-table" style={tableStyle}>
            <thead><tr><Th>Event</Th><Th>Actor</Th><Th>Occurred</Th><Th>Details</Th></tr></thead>
            <tbody>{d.events.map((e) => (
              <tr key={String(e['event_id'])}>
                <Td>{str(e['event'])}</Td><Td mono>{short(e['actor_principal_id'])}</Td><Td>{fmtInstant(e['occurred_at'])}</Td><Td mono>{json(e['details'])}</Td>
              </tr>))}</tbody>
          </table>
        </ScrollBox>
      )}
    </>
  );
}

export default function RetentionPage() {
  const { scope } = useShell();
  const [schedules, setSchedules] = useState<RetentionRow[] | null>(null);
  const [scheduleProblem, setScheduleProblem] = useState<string | null>(null);
  const [actions, setActions] = useState<RetentionRow[] | null>(null);
  const [partitions, setPartitions] = useState<Row[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [detail, setDetail] = useState<RetentionActionDetail | null>(null);
  const [detailProblem, setDetailProblem] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState<ScheduleDraft>(EMPTY_SCHEDULE);
  const [declared, setDeclared] = useState<Outcome<{ scheduleId: string }>>(none);
  const [evaluated, setEvaluated] = useState<Outcome<RetentionEvaluation>>(none);
  const [tier, setTier] = useState<RetentionTierState | null>(null);
  const [tierProblem, setTierProblem] = useState<string | null>(null);
  const [policyDraft, setPolicyDraft] = useState<PolicyDraft>(DEFAULT_POLICY);
  const [policyDeclared, setPolicyDeclared] = useState<Outcome<Row>>(none);
  const [openDraft, setOpenDraft] = useState<OpenDraft>(() => ({ kind: 'review', targetKind: 'evidence', manifestId: '', sourceId: '', manifestIds: '', classificationCeiling: 'internal', expiresAfter: '', partitionKey: `tenant:${scope.tenantId}`, toSeq: '', retentionProfile: '' }));
  const [opened, setOpened] = useState<Outcome<{ actionId: string; kind: string; targetKind: string; state: string }>>(none);
  const [resolved, setResolved] = useState<Outcome<RetentionScopeSummary>>(none);
  const [rationale, setRationale] = useState('');
  const [approved, setApproved] = useState<Outcome<{ approvalId: string; actionId: string; state: string }>>(none);
  const [executed, setExecuted] = useState<Outcome<RetentionExecutionResult>>(none);
  const [verified, setVerified] = useState<Outcome<RetentionVerdict>>(none);
  const [wdReason, setWdReason] = useState('');
  const [withdrawn, setWithdrawn] = useState<Outcome<{ actionId: string; state: string }>>(none);
  const [exported, setExported] = useState<{ detail: RetentionExportDetail | null; problem: string | null }>({ detail: null, problem: null });
  const [rvReason, setRvReason] = useState('');
  const [revoked, setRevoked] = useState<Outcome<{ revocation: Record<string, unknown>; notices: RetentionRow[]; importers: RetentionRow[]; bytes: { removed: boolean; error?: string }; stations: RetentionRow[] }>>(none);
  // B14 (0074 §3): the selected export's revocation notices, a further notice, the notice's receipt collected or presented.
  const [notices, setNotices] = useState<{ rows: RetentionRow[] | null; problem: string | null }>({ rows: null, problem: null });
  const [noticeKey, setNoticeKey] = useState('');
  // B17: a further notice to an IMPORTING DOMAIN of the tenant (its domain and import id) instead of a destination.
  const [noticeTo, setNoticeTo] = useState<'destination' | 'importer'>('destination');
  const [noticeImporterDomain, setNoticeImporterDomain] = useState('');
  const [noticeImporterImport, setNoticeImporterImport] = useState('');
  const [notified, setNotified] = useState<Outcome<RetentionRow & { importer?: RetentionRow }>>(none);
  const [noticeCollected, setNoticeCollected] = useState<Outcome<RetentionRow>>(none);
  const [ackNoticeId, setAckNoticeId] = useState('');
  const [ackNoticeReceipt, setAckNoticeReceipt] = useState('');
  const [noticeAcknowledged, setNoticeAcknowledged] = useState<Outcome<RetentionRow>>(none);
  // B13: the schedules' retirement, the signing keys, the destinations, and the selected export's download, delivery and deliveries.
  const [retireReasons, setRetireReasons] = useState<Record<string, string>>({});
  const [scheduleRetired, setScheduleRetired] = useState<Outcome<RetentionRow>>(none);
  const [keys, setKeys] = useState<RetentionRow[] | null>(null);
  const [keysProblem, setKeysProblem] = useState<string | null>(null);
  const [keyDraft, setKeyDraft] = useState<KeyDraft>(EMPTY_KEY);
  const [keyDeclared, setKeyDeclared] = useState<Outcome<RetentionRow>>(none);
  const [keyRetired, setKeyRetired] = useState<Outcome<RetentionRow>>(none);
  const [destinations, setDestinations] = useState<RetentionRow[] | null>(null);
  const [destinationsProblem, setDestinationsProblem] = useState<string | null>(null);
  const [destinationDraft, setDestinationDraft] = useState<DestinationDraft>(EMPTY_DESTINATION);
  const [destinationDeclared, setDestinationDeclared] = useState<Outcome<RetentionRow>>(none);
  const [destinationRetired, setDestinationRetired] = useState<Outcome<RetentionRow>>(none);
  const [deliveries, setDeliveries] = useState<{ rows: RetentionRow[] | null; problem: string | null }>({ rows: null, problem: null });
  const [downloaded, setDownloaded] = useState<Outcome<Downloaded>>(none);
  const [destinationKey, setDestinationKey] = useState('');
  const [delivered, setDelivered] = useState<Outcome<RetentionRow>>(none);
  const [collected, setCollected] = useState<Outcome<RetentionRow>>(none);
  const [ackDeliveryId, setAckDeliveryId] = useState('');
  const [ackReceipt, setAckReceipt] = useState('');
  const [acknowledged, setAcknowledged] = useState<Outcome<RetentionRow>>(none);
  // B16 (0076 §3/§4): the exchange partners and the imports of this domain; the selected import's record and its acts.
  const [partners, setPartners] = useState<RetentionRow[] | null>(null);
  const [partnersProblem, setPartnersProblem] = useState<string | null>(null);
  const [partnerDraft, setPartnerDraft] = useState<PartnerDraft>(EMPTY_PARTNER);
  const [partnerDeclared, setPartnerDeclared] = useState<Outcome<RetentionRow>>(none);
  const [partnerRetired, setPartnerRetired] = useState<Outcome<RetentionRow>>(none);
  const [imports, setImports] = useState<RetentionRow[] | null>(null);
  const [importsProblem, setImportsProblem] = useState<string | null>(null);
  const [importDraft, setImportDraft] = useState<ImportDraft>(EMPTY_IMPORT);
  const [importOpened, setImportOpened] = useState<Outcome<RetentionImportOpened>>(none);
  const [selectedImport, setSelectedImport] = useState<string | null>(null);
  const [importDetail, setImportDetail] = useState<RetentionImportDetail | null>(null);
  const [importProblem, setImportProblem] = useState<string | null>(null);
  const [importRationale, setImportRationale] = useState('');
  const [importApproved, setImportApproved] = useState<Outcome<RetentionRow>>(none);
  const [importAdmitted, setImportAdmitted] = useState<Outcome<{ import: RetentionRow; batches: Row[] }>>(none);
  const [importWdReason, setImportWdReason] = useState('');
  const [importWithdrawn, setImportWithdrawn] = useState<Outcome<{ import: RetentionRow; quarantine: Row }>>(none);
  // B17 (0077 §7): the selected import's revocation — the source (the origin's record here, or the origin's signed notice at a station) and the act's answer.
  const [importRevokeKind, setImportRevokeKind] = useState<RetentionRevocationSource['kind']>('origin');
  const [importRevokeStation, setImportRevokeStation] = useState('');
  const [importRevoked, setImportRevoked] = useState<Outcome<{ import: RetentionRow; revocation: Row; batches: Row[] }>>(none);

  const loadSchedules = async () => {
    const r = await retention.listSchedules(scope);
    if (!r.ok || r.data === undefined) { setScheduleProblem(refusal(r, 'the schedules could not be listed')); return; }
    setScheduleProblem(null); setSchedules(r.data.schedules);
  };
  /** B13: the tenant's signing keys and the domain's destinations — read with the lists and again after their acts; each row carries a reference NAME and its readiness, never a value. */
  const loadKeys = async () => {
    const r = await retention.listSigningKeys(scope);
    if (!r.ok || r.data === undefined) { setKeysProblem(refusal(r, 'the signing keys could not be listed')); return; }
    setKeysProblem(null); setKeys(r.data.keys);
  };
  const loadDestinations = async () => {
    const r = await retention.listDestinations(scope);
    if (!r.ok || r.data === undefined) { setDestinationsProblem(refusal(r, 'the destinations could not be listed')); return; }
    setDestinationsProblem(null); setDestinations(r.data.destinations);
  };
  /** B13: the action's deliveries as recorded — read beside the package, and still read when the package is revoked (its deliveries stay recorded). B14: its revocation notices likewise. */
  const loadDeliveries = async (actionId: string) => {
    const r = await retention.listDeliveries(scope, actionId);
    if (!r.ok || r.data === undefined) { setDeliveries({ rows: null, problem: refusal(r, 'the deliveries could not be listed') }); return; }
    setDeliveries({ rows: r.data.deliveries, problem: null });
    const n = await retention.listRevocationNotices(scope, actionId);
    if (!n.ok || n.data === undefined) { setNotices({ rows: null, problem: refusal(n, 'the revocation notices could not be listed') }); return; }
    setNotices({ rows: n.data.notices, problem: null });
  };
  /** B16: the exchange partners and the imports — read with the lists and again after their acts; the selected import's record re-read after each of its acts. */
  const loadPartners = async () => {
    const r = await retention.listPartners(scope);
    if (!r.ok || r.data === undefined) { setPartnersProblem(refusal(r, 'the exchange partners could not be listed')); return; }
    setPartnersProblem(null); setPartners(r.data.partners);
  };
  const loadImports = async () => {
    const r = await retention.listImports(scope);
    if (!r.ok || r.data === undefined) { setImportsProblem(refusal(r, 'the imports could not be listed')); return; }
    setImportsProblem(null); setImports(r.data.imports);
  };
  const loadImportDetail = async (importId: string) => {
    const r = await retention.getImport(scope, importId);
    if (!r.ok || r.data === undefined) { setImportDetail(null); setImportProblem(refusal(r, 'the import could not be read')); return; }
    setImportProblem(null); setImportDetail(r.data);
  };
  /** Selecting an import resets what its acts answered: nothing shown belongs to another import. */
  const selectImport = (importId: string) => {
    setSelectedImport(importId); setImportDetail(null); setImportProblem(null);
    setImportRationale(''); setImportApproved(none()); setImportAdmitted(none()); setImportWdReason(''); setImportWithdrawn(none());
    setImportRevokeKind('origin'); setImportRevokeStation(''); setImportRevoked(none());
    void loadImportDetail(importId);
  };
  /** The object URL of a downloaded archive is the browser's to hold until the click; it is released when the download is replaced or the selection changes. */
  const releaseDownload = () => {
    if (downloaded.result !== null && downloaded.result.url !== '') URL.revokeObjectURL(downloaded.result.url);
    setDownloaded(none());
  };
  const loadActions = async () => {
    const r = await retention.listActions(scope);
    if (!r.ok || r.data === undefined) { setProblem(refusal(r, 'the retention actions could not be listed')); return; }
    setProblem(null); setActions(r.data.actions); setPartitions(r.data.partitions);
  };
  /** B12: the cold tier's state — read with the lists and again after every act (an execution moves bytes and spends budget; an evaluation defers and escalates; a declaration changes the policy in force). */
  const loadTier = async () => {
    const r = await retention.tierState(scope);
    if (!r.ok || r.data === undefined) { setTierProblem(refusal(r, 'the cold tier\'s state could not be read')); return; }
    setTierProblem(null); setTier(r.data.state);
  };
  /** B11: the export package of a customer-export action — read beside the record; a revoked package answers 409, kept as the server's words. */
  const loadExport = async (actionId: string, kind: unknown) => {
    if (kind !== 'customer_export') { setExported({ detail: null, problem: null }); setDeliveries({ rows: null, problem: null }); return; }
    const r = await retention.getExport(scope, actionId);
    if (!r.ok || r.data === undefined) setExported({ detail: null, problem: refusal(r, 'the export package could not be read') });
    else setExported({ detail: r.data, problem: null });
    await loadDeliveries(actionId);
  };
  const loadDetail = async (actionId: string) => {
    const r = await retention.getAction(scope, actionId);
    if (!r.ok || r.data === undefined) { setDetail(null); setDetailProblem(refusal(r, 'the action could not be read')); return; }
    setDetailProblem(null); setDetail(r.data);
    await loadExport(actionId, r.data.action['kind']);
  };
  const select = (actionId: string) => {
    setSelected(actionId); setDetail(null); setDetailProblem(null); setExported({ detail: null, problem: null }); setDeliveries({ rows: null, problem: null });
    setResolved(none()); setRationale(''); setApproved(none()); setExecuted(none()); setVerified(none()); setWdReason(''); setWithdrawn(none()); setRvReason(''); setRevoked(none());
    releaseDownload(); setDestinationKey(''); setDelivered(none()); setCollected(none()); setAckDeliveryId(''); setAckReceipt(''); setAcknowledged(none());
    setNotices({ rows: null, problem: null }); setNoticeKey(''); setNoticeTo('destination'); setNoticeImporterDomain(''); setNoticeImporterImport(''); setNotified(none()); setNoticeCollected(none()); setAckNoticeId(''); setAckNoticeReceipt(''); setNoticeAcknowledged(none());
    void loadDetail(actionId);
  };
  useEffect(() => { void loadSchedules(); void loadActions(); void loadTier(); void loadKeys(); void loadDestinations(); void loadPartners(); void loadImports(); }, [scope]);

  if (problem !== null) return <LiveStatus assertive>{problem}</LiveStatus>;
  if (actions === null) return <Empty>reading the retention actions…</Empty>;

  const current = selected === null ? null : actions.find((a) => String(a['action_id']) === selected) ?? null;
  const servedDigest = detail !== null && typeof detail.action['scope_digest'] === 'string' ? detail.action['scope_digest'] : null;

  /** B16: one governed act on an import: the refusal is kept verbatim; the imports list and, when one is selected, its record are re-read from the server after. */
  const importAct = async <T,>(set: (o: Outcome<T>) => void, verb: string, run: () => Promise<{ ok: boolean; status: number; data?: { receipt: ReceiptT } & Record<string, unknown>; error?: { code: string; message: string } }>, pick: (d: Record<string, unknown>) => T) => {
    set(none());
    const r = await run();
    if (!r.ok || r.data === undefined) {
      const m = refusal(r, `the ${verb} was not answered`);
      set({ result: null, receipt: null, problem: m });
      await loadImports();
      if (selectedImport !== null) await loadImportDetail(selectedImport);
      throw new Error(m);
    }
    set({ result: pick(r.data), receipt: r.data.receipt, problem: null });
    await loadImports();
    if (selectedImport !== null) await loadImportDetail(selectedImport);
  };
  /** One governed act on the selected action: the refusal is kept verbatim; the list, the record and the cold tier's state are re-read from the server after. */
  const act = async <T,>(set: (o: Outcome<T>) => void, verb: string, run: () => Promise<{ ok: boolean; status: number; data?: { receipt: ReceiptT } & Record<string, unknown>; error?: { code: string; message: string } }>, pick: (d: Record<string, unknown>) => T) => {
    set(none());
    const r = await run();
    if (!r.ok || r.data === undefined) {
      const m = refusal(r, `the ${verb} was not answered`);
      set({ result: null, receipt: null, problem: m });
      if (selected !== null) await loadDetail(selected);
      await loadActions();
      await loadTier();
      throw new Error(m);
    }
    set({ result: pick(r.data), receipt: r.data.receipt, problem: null });
    await loadActions();
    if (selected !== null) await loadDetail(selected);
    await loadTier();
  };

  return (
    <>
      <h1 style={{ fontSize: 'var(--eye-type-heading-1)', marginBlockStart: 0 }}>Retention</h1>
      <UnknownNote>
        A retention action is a <strong>durable workflow</strong>, not a delete. It is <strong>opened</strong> (by a person or by a schedule's
        evaluation), its <strong>scope resolved</strong> — every item it would touch with a disposition: execute, held by a legal hold,
        excluded, blocking — under a <strong>digest</strong> of that ordered scope; <strong>approved</strong> by the retention authority on the
        digest they read (never by the opener); <strong>executed</strong> by the steward (never by an approver) in one transaction — a hold placed
        since the approval rolls the execution back whole and pauses the action; and <strong>verified</strong> check by check against what the
        vault observes. A review records the review and touches no bytes; a deletion tombstones, its bytes removed after the record committed;
        a log-floor move retires outbox history below the served points; an archive moves bytes to the cold tier and a <strong>restore</strong> moves
        them back. The <strong>cold-tier manager</strong> is the domain's policy — a daily byte budget, the opens per evaluation, the attempts before
        escalation, the escalation age, the restore window — read by every execution and evaluation. A customer export's package is <strong>signed</strong> with
        the tenant's key (declared by a reference; its public key shown), carries an <strong>expiry</strong>, is <strong>downloaded</strong> through an audited act and
        <strong>delivered</strong>, human-gated, to a declared <strong>destination</strong>, the exchange closing on the recipient's <strong>acknowledgement</strong>.
        Every count, digest and refusal below is the server's; no credential value is ever shown.
      </UnknownNote>

      <section aria-labelledby="sched-h" style={cardStyle}>
        <h2 id="sched-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Schedules ({schedules === null ? '…' : schedules.length})</h2>
        {scheduleProblem !== null && <LiveStatus assertive><span style={critical}>not listed — {scheduleProblem}</span></LiveStatus>}
        {schedules === null ? (scheduleProblem === null ? <Empty>reading the schedules…</Empty> : null) : schedules.length === 0 ? <Empty>No schedule is declared in this domain: nothing falls due on its own.</Empty> : (
          <ScrollBox label="retention schedules">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Schedule</Th><Th>Retention profile</Th><Th>Target</Th><Th>Action kind</Th><Th>Due after</Th><Th>Selector</Th><Th>State</Th><Th>Owner</Th><Th>Declared</Th><Th>Last evaluated</Th><Th>Last evaluation</Th><Th>Retired</Th><Th>Retire</Th></tr></thead>
              <tbody>{schedules.map((s) => {
                const id = String(s['schedule_id']);
                return (
                  <tr key={id}>
                    <Td mono>{short(s['schedule_id'])}</Td><Td mono>{str(s['retention_profile'])}</Td><Td>{str(s['target_kind'])}</Td><Td>{str(s['action_kind'])}</Td>
                    <Td mono>{fmtInterval(s['due_after'])}</Td><Td mono>{selectorText(s['selector'])}</Td><Td><strong>{str(s['state'])}</strong></Td><Td mono>{short(s['owner_principal_id'])}</Td>
                    <Td>{fmtInstant(s['declared_at'])}</Td><Td>{fmtInstant(s['last_evaluated_at'])}</Td><Td>{lastEvaluationText(s['last_evaluation'])}</Td>
                    <Td>{retiredText(s)}{isRetired(s) && s['retired_by'] !== null && s['retired_by'] !== undefined ? <> by <Mono>{short(s['retired_by'])}</Mono></> : null}</Td>
                    <Td>{s['state'] === 'active' ? (
                      <Retire id={`schedule ${short(id)}`} reason={retireReasons[id] ?? ''} onReason={(v) => setRetireReasons({ ...retireReasons, [id]: v })}
                        onRun={async () => {
                          try {
                            await act(setScheduleRetired, 'retirement', () => retention.retireSchedule(scope, id, (retireReasons[id] ?? '').trim()), (d) => rec(d['schedule']));
                            setRetireReasons({ ...retireReasons, [id]: '' });
                          } finally {
                            // The retirement changes the row's state and the cold tier's view of it: the schedules are re-read whether or not the act was answered.
                            await loadSchedules();
                          }
                        }} />
                    ) : '—'}</Td>
                  </tr>
                );
              })}</tbody>
            </table>
          </ScrollBox>
        )}
        <p style={muted}>
          B13: a domain admin's act, <Mono>retention.schedule.retire</Mono> — a schedule is retired once, with a reason, and its history is kept: the row, its last
          evaluation, the actions it opened and their events stay as they are; a retired schedule opens nothing at the next evaluation. The server refuses a second
          retirement and a reason under 8 characters.
        </p>
        <Problem verb="not retired" problem={scheduleRetired.problem} />
        {scheduleRetired.result !== null && <p>schedule <Mono>{str(scheduleRetired.result['schedule_id'])}</Mono> is now <strong>{str(scheduleRetired.result['state'])}</strong> · retired {retiredText(scheduleRetired.result)}</p>}
        <Receipt receipt={scheduleRetired.receipt} />

        <h3 style={h3}>Evaluate the schedules</h3>
        <p style={muted}>
          The steward's act: every evidence manifest of a schedule's profile past its due-after that no open action of that kind covers raises an
          action (a RetentionActionDue each) — oldest due first, at most the tier policy's opens per evaluation per schedule, the rest deferred to
          the next evaluation; a restored manifest falls due for its archive schedule at the restore's instant plus the restore window. Nothing is
          deleted by an evaluation. Only evidence schedules are evaluated. The cold-tier manager's pass rides the same act: an action paused for
          retry longer than the policy's escalate-after is escalated for human review (its approvals revoked).
        </p>
        <div style={controlRow}>
          <GovernedButton label="Evaluate schedules" pendingLabel="evaluating"
            onRun={async () => {
              try {
                await act(setEvaluated, 'evaluation', () => retention.evaluateSchedules(scope), (d) => d['evaluation'] as RetentionEvaluation);
              } finally {
                // The evaluation stamps last_evaluated_at and last_evaluation on every active schedule: the schedules are re-read whether or not the act was answered.
                await loadSchedules();
              }
            }} />
        </div>
        <Problem verb="not evaluated" problem={evaluated.problem} />
        {evaluated.result !== null && (
          <>
            {evaluated.result.opened.length === 0 ? <p>the evaluation opened no action: nothing of any active schedule fell due that an open action does not already cover · deferred {str(evaluated.result.deferred)}</p> : (
              <>
                <p>the evaluation opened <strong>{evaluated.result.opened.length}</strong> action(s) · deferred <strong>{str(evaluated.result.deferred)}</strong> to the next evaluation (the policy's opens per evaluation):</p>
                <ScrollBox label="actions opened by the evaluation">
                  <table className="eye-table" style={tableStyle}>
                    <thead><tr><Th>Action</Th><Th>Kind</Th><Th>Target</Th><Th>Selector</Th><Th>Schedule</Th><Th>Retention profile</Th><Th>Due from</Th></tr></thead>
                    <tbody>{evaluated.result.opened.map((o) => (
                      <tr key={String(o['action_id'])}>
                        <Td mono>{str(o['action_id'])}</Td><Td>{str(o['kind'])}</Td><Td>{str(o['target_kind'])}</Td><Td mono>{selectorText(o['selector'])}</Td>
                        <Td mono>{short(o['schedule_id'])}</Td><Td mono>{str(o['retention_profile'])}</Td><Td>{fmtInstant(o['due_from'])}</Td>
                      </tr>))}</tbody>
                  </table>
                </ScrollBox>
              </>
            )}
            {evaluated.result.escalated.length === 0 ? <p>the cold-tier manager escalated no action: none paused for retry is older than the policy's escalate-after</p> : (
              <>
                <p>the cold-tier manager escalated <strong>{evaluated.result.escalated.length}</strong> action(s) for human review:</p>
                <ScrollBox label="actions escalated by the evaluation">
                  <table className="eye-table" style={tableStyle}>
                    <thead><tr><Th>Action</Th><Th>Kind</Th><Th>Paused at</Th><Th>Reason</Th></tr></thead>
                    <tbody>{evaluated.result.escalated.map((o) => (
                      <tr key={String(o['action_id'])}>
                        <Td mono>{str(o['action_id'])}</Td><Td>{str(o['kind'])}</Td><Td>{fmtInstant(o['paused_at'])}</Td><Td>{str(o['reason'])}</Td>
                      </tr>))}</tbody>
                  </table>
                </ScrollBox>
              </>
            )}
          </>
        )}
        <Receipt receipt={evaluated.receipt} />

        <h3 style={h3}>Declare a schedule</h3>
        <p style={muted}>A domain admin's act. The due-after is an interval such as <Mono>90 days</Mono> (seconds, minutes, hours, days, months or years); the owner defaults to the declarer. A restore is opened on demand, never by a schedule: the server refuses that kind here.</p>
        <div style={rowStyle}>
          <Field id="sd-profile" label="Retention profile (required)">{(id) => <Txt id={id} value={scheduleDraft.retentionProfile} onChange={(v) => setScheduleDraft({ ...scheduleDraft, retentionProfile: v })} />}</Field>
          <Field id="sd-target" label="Target kind">{(id) => <Sel id={id} value={scheduleDraft.targetKind} options={RETENTION_TARGET_KINDS} onChange={(v) => setScheduleDraft({ ...scheduleDraft, targetKind: v })} />}</Field>
          <Field id="sd-kind" label="Action kind">{(id) => <Sel id={id} value={scheduleDraft.actionKind} options={RETENTION_KINDS} onChange={(v) => setScheduleDraft({ ...scheduleDraft, actionKind: v })} />}</Field>
          <Field id="sd-due" label="Due after (required, e.g. 90 days)">{(id) => <Txt id={id} value={scheduleDraft.dueAfter} onChange={(v) => setScheduleDraft({ ...scheduleDraft, dueAfter: v })} />}</Field>
          <Field id="sd-source" label="Source id (optional; narrows the evaluation to that source's manifests)">{(id) => <Txt id={id} value={scheduleDraft.sourceId} onChange={(v) => setScheduleDraft({ ...scheduleDraft, sourceId: v })} />}</Field>
          <Field id="sd-owner" label="Owner principal id (optional)">{(id) => <Txt id={id} value={scheduleDraft.ownerPrincipalId} onChange={(v) => setScheduleDraft({ ...scheduleDraft, ownerPrincipalId: v })} />}</Field>
        </div>
        <div style={controlRow}>
          <GovernedButton label="Declare schedule" pendingLabel="declaring" disabled={!scheduleOk(scheduleDraft)}
            onRun={async () => {
              await act(setDeclared, 'declaration', () => retention.declareSchedule(scope, toScheduleIntake(scheduleDraft)), (d) => rec(d['schedule']) as unknown as { scheduleId: string });
              setScheduleDraft(EMPTY_SCHEDULE);
              await loadSchedules();
            }} />
        </div>
        <Problem verb="not declared" problem={declared.problem} />
        {declared.result !== null && <p>declared schedule <Mono>{str(declared.result.scheduleId)}</Mono></p>}
        <Receipt receipt={declared.receipt} />
      </section>

      <section aria-labelledby="tier-h" style={cardStyle}>
        <h2 id="tier-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Cold tier</h2>
        <p style={muted}>
          The cold-tier manager's observable state, as the server returned it: the policy in force (the defaults until one is declared), the
          manifests and bytes per tier, the moves of the last 24 hours, the daily byte budget and the instant its rolling window frees, the
          actions by state, the restored manifests awaiting their re-archive, and the vault's inventory of both roots. An audited read.
        </p>
        {tierProblem !== null && <LiveStatus assertive><span style={critical}>not read — {tierProblem}</span></LiveStatus>}
        {tier === null ? (tierProblem === null ? <Empty>reading the cold tier's state…</Empty> : null) : (
          <>
            <dl>
              <DefinitionRow term="Policy in force">
                {tier.policy.declared ? <>version <strong>{str(tier.policy.version)}</strong>{tier.policy.policy_id !== undefined && tier.policy.policy_id !== null ? <> · <Mono>{short(tier.policy.policy_id)}</Mono></> : null}</> : <>the defaults — no policy is declared for this domain</>}
                {' · '}budget {tier.policy.budget_bytes_per_day === null ? 'unbounded (null)' : `${str(tier.policy.budget_bytes_per_day)} bytes per day`}
                {' · '}opens per evaluation {str(tier.policy.max_opens_per_evaluation)} · attempts {str(tier.policy.max_attempts)}
                {' · '}escalate after <Mono>{fmtInterval(tier.policy.escalate_after)}</Mono> · restore window <Mono>{fmtInterval(tier.policy.restore_hot_for)}</Mono>
              </DefinitionRow>
              <DefinitionRow term="Tiers">hot {str(tier.tiers.hot.manifests)} manifest(s), {str(tier.tiers.hot.bytes)} bytes · archive {str(tier.tiers.archive.manifests)} manifest(s), {str(tier.tiers.archive.bytes)} bytes</DefinitionRow>
              <DefinitionRow term="Moves, last 24 hours">archived {str(tier.moves_24h.archived.count)} ({str(tier.moves_24h.archived.bytes)} bytes) · restored {str(tier.moves_24h.restored.count)} ({str(tier.moves_24h.restored.bytes)} bytes)</DefinitionRow>
              <DefinitionRow term="Budget">
                {tier.budget.bytes_per_day === null ? 'unbounded (null)' : `${str(tier.budget.bytes_per_day)} bytes per day`} · used {str(tier.budget.used_24h)}
                {' · '}remaining {tier.budget.remaining === null ? 'unbounded (null)' : str(tier.budget.remaining)} · window resets {tier.budget.window_resets_at === null ? 'never (nothing moved in the window)' : fmtInstant(tier.budget.window_resets_at)}
              </DefinitionRow>
              <DefinitionRow term="Actions">
                executing {str(tier.actions.executing)} · paused for retry {str(tier.actions.paused_retry)} · paused for human review {str(tier.actions.paused_human_review)}
                {' · '}escalated <strong>{str(tier.actions.escalated)}</strong> · pending bytes residuals {str(tier.actions.pending_bytes_residuals)}
              </DefinitionRow>
              <DefinitionRow term="Restored, awaiting re-archive">{str(tier.restored_awaiting_rearchive)} hot manifest(s) whose latest tier record is a restore</DefinitionRow>
              <DefinitionRow term="Vault inventory">evidence root: {inventoryText(tier.vault.evidence)} · archive root: {inventoryText(tier.vault.archive)}</DefinitionRow>
            </dl>
            <h3 style={h3}>Schedules as the manager sees them ({tier.schedules.length})</h3>
            {tier.schedules.length === 0 ? <Empty>No schedule: nothing returns to the cold tier on its own.</Empty> : (
              <ScrollBox label="cold tier schedules">
                <table className="eye-table" style={tableStyle}>
                  <thead><tr><Th>Schedule</Th><Th>Action kind</Th><Th>Retention profile</Th><Th>Due after</Th><Th>State</Th><Th>Last evaluated</Th><Th>Last evaluation</Th><Th>Retired at</Th></tr></thead>
                  <tbody>{tier.schedules.map((s) => (
                    <tr key={String(s.schedule_id)}>
                      <Td mono>{short(s.schedule_id)}</Td><Td>{str(s.action_kind)}</Td><Td mono>{str(s.retention_profile)}</Td><Td mono>{fmtInterval(s.due_after)}</Td>
                      <Td>{str(s.state)}</Td><Td>{fmtInstant(s.last_evaluated_at)}</Td><Td>{lastEvaluationText(s.last_evaluation)}</Td>
                      <Td>{s.retired_at === null || s.retired_at === undefined ? '—' : fmtInstant(s.retired_at)}</Td>
                    </tr>))}</tbody>
                </table>
              </ScrollBox>
            )}
          </>
        )}

        <h3 style={h3}>Declare the tier policy</h3>
        <p style={muted}>
          A domain admin's act (the tenant's or the platform's admin as well), the next version of this domain's policy. The budget is the bytes an
          archive or a restore may move in a rolling day (blank: unbounded; an execution above it is refused before it begins and the action paused for
          retry, the instant the window frees named); the opens per evaluation bound what an evaluation opens per schedule (1–200, oldest due first);
          the attempts bound the executions begun before an action is escalated for human review (1–10); the escalate-after is the age at which an
          action paused for retry is escalated by the evaluation; the restore window is how long a restored record stays hot before its archive
          schedule takes it back. Intervals are spelled as a due-after. The defaults are shown; the server states what it refuses.
        </p>
        <div style={rowStyle}>
          <Field id="tp-budget" label="Budget, bytes per day (blank: unbounded)">{(id) => <Txt id={id} type="number" value={policyDraft.budgetBytesPerDay} onChange={(v) => setPolicyDraft({ ...policyDraft, budgetBytesPerDay: v })} />}</Field>
          <Field id="tp-opens" label="Opens per evaluation (1 to 200)">{(id) => <Txt id={id} type="number" value={policyDraft.maxOpensPerEvaluation} onChange={(v) => setPolicyDraft({ ...policyDraft, maxOpensPerEvaluation: v })} />}</Field>
          <Field id="tp-attempts" label="Attempts before escalation (1 to 10)">{(id) => <Txt id={id} type="number" value={policyDraft.maxAttempts} onChange={(v) => setPolicyDraft({ ...policyDraft, maxAttempts: v })} />}</Field>
          <Field id="tp-escalate" label="Escalate after (e.g. 7 days)">{(id) => <Txt id={id} value={policyDraft.escalateAfter} onChange={(v) => setPolicyDraft({ ...policyDraft, escalateAfter: v })} />}</Field>
          <Field id="tp-window" label="Restore window (e.g. 30 days)">{(id) => <Txt id={id} value={policyDraft.restoreHotFor} onChange={(v) => setPolicyDraft({ ...policyDraft, restoreHotFor: v })} />}</Field>
        </div>
        <div style={controlRow}>
          <GovernedButton label="Declare tier policy" pendingLabel="declaring" disabled={!policyOk(policyDraft)}
            onRun={async () => {
              await act(setPolicyDeclared, 'declaration', () => retention.declareTierPolicy(scope, toPolicyIntake(policyDraft)), (d) => rec(d['policy']));
              setPolicyDraft(DEFAULT_POLICY);
            }} />
        </div>
        <Problem verb="not declared" problem={policyDeclared.problem} />
        {policyDeclared.result !== null && (
          <p>
            declared tier policy version <strong>{str(policyDeclared.result['version'])}</strong> <Mono>{short(policyDeclared.result['policy_id'])}</Mono>
            {' · '}budget {policyDeclared.result['budget_bytes_per_day'] === null ? 'unbounded (null)' : `${str(policyDeclared.result['budget_bytes_per_day'])} bytes per day`}
            {' · '}opens per evaluation {str(policyDeclared.result['max_opens_per_evaluation'])} · attempts {str(policyDeclared.result['max_attempts'])}
            {' · '}escalate after <Mono>{fmtInterval(policyDeclared.result['escalate_after'])}</Mono> · restore window <Mono>{fmtInterval(policyDeclared.result['restore_hot_for'])}</Mono>
            {' · '}declared at {fmtInstant(policyDeclared.result['declared_at'])}
          </p>
        )}
        <Receipt receipt={policyDeclared.receipt} />
      </section>

      <section aria-labelledby="xd-h" style={cardStyle}>
        <h2 id="xd-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Export delivery</h2>
        <p style={muted}>
          B13 (0073): what a customer export's package is signed with and where it is delivered. A <strong>signing key</strong> is the tenant's Ed25519 key,
          declared by a credential <strong>reference</strong> bound in the server's process environment — the private key never leaves it and no answer carries
          it; the server derives and records the <strong>public key</strong>, which a customer fetches to verify a package. The latest key not retired is the
          active one: every export built while it is active carries scheme <Mono>eye-customer-export/2</Mono> and its key id; an export is refused at execution
          while the active key's reference is not bound where the server runs. A key's <strong>purpose</strong> — demonstration or production — is shown wherever
          its signature is. A <strong>destination</strong> is a declared exchange party of this domain: a <strong>transfer station</strong> (an absolute directory
          outside the vault's roots — the disconnected-transfer path: the product writes the package, its signature and the exchange identity there and reads the
          recipient's receipt back) or an <strong>https</strong> endpoint (the package POSTed with its digests and signature in headers; the bearer credential by
          reference, never recorded; readiness <Mono>blocked-credential</Mono> while its reference is not bound). The download, the delivery and the deliveries of a
          package sit on its action's record below. Every row and readiness here is the server's; no credential value is ever shown.
        </p>

        <h3 style={h3}>Signing keys ({keys === null ? '…' : keys.length})</h3>
        {keysProblem !== null && <LiveStatus assertive><span style={critical}>not listed — {keysProblem}</span></LiveStatus>}
        {keys === null ? (keysProblem === null ? <Empty>reading the signing keys…</Empty> : null) : keys.length === 0 ? <Empty>No signing key is declared for this tenant: a package is signed by the digest chain (scheme eye-customer-export/1) until one is.</Empty> : (
          <ScrollBox label="export signing keys">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Key</Th><Th>Algorithm</Th><Th>Purpose</Th><Th>State</Th><Th>Credential reference</Th><Th>Readiness</Th><Th>Declared</Th><Th>Retired</Th><Th>Retire</Th></tr></thead>
              <tbody>{keys.map((k) => {
                const id = String(k['key_id']);
                return (
                  <tr key={id}>
                    <Td mono>{id}</Td><Td>{str(k['algorithm'])}</Td><Td><strong>{str(k['purpose'])}</strong></Td><Td><strong>{str(k['state'])}</strong></Td>
                    <Td mono>{str(k['credential_ref'])}</Td><Td>{str(k['readiness'])}</Td>
                    <Td>by <Mono>{short(k['declared_by'])}</Mono> at {fmtInstant(k['declared_at'])}</Td><Td>{retiredText(k)}</Td>
                    <Td>{isRetired(k) ? '—' : (
                      <Retire id={`key ${id}`} reason={retireReasons[id] ?? ''} onReason={(v) => setRetireReasons({ ...retireReasons, [id]: v })}
                        onRun={async () => {
                          try {
                            await act(setKeyRetired, 'retirement', () => retention.retireSigningKey(scope, id, (retireReasons[id] ?? '').trim()), (d) => rec(d['key']));
                            setRetireReasons({ ...retireReasons, [id]: '' });
                          } finally {
                            await loadKeys();
                          }
                        }} />
                    )}</Td>
                  </tr>
                );
              })}</tbody>
            </table>
          </ScrollBox>
        )}
        <Problem verb="not retired" problem={keyRetired.problem} />
        {keyRetired.result !== null && <p>key <Mono>{str(keyRetired.result['key_id'])}</Mono> retired {retiredText(keyRetired.result)} — its public key stays recorded: a package it signed still verifies</p>}
        <Receipt receipt={keyRetired.receipt} />

        <h3 style={h3}>Declare a signing key</h3>
        <p style={muted}>
          The tenant's administrator's act (or the platform's), human-gated. The reference names an environment binding of the server —
          <Mono>EYE_EXPORT_SIGNING_KEY_&lt;NAME&gt;</Mono> — whose value is the private key; it is resolved where the server runs and never sent from here.
          The server refuses a reference it does not bind, a value that is not an Ed25519 private key and a key already declared. A demonstration key is
          declared as such; production activation is a production key generated under the owner's key custody, declared with purpose production, and the
          demonstration key retired.
        </p>
        <div style={rowStyle}>
          <Field id="sk-ref" label="Credential reference (required; EYE_EXPORT_SIGNING_KEY_<NAME>)">{(id) => <Txt id={id} value={keyDraft.credentialRef} onChange={(v) => setKeyDraft({ ...keyDraft, credentialRef: v })} />}</Field>
          <Field id="sk-purpose" label="Purpose">{(id) => <Sel id={id} value={keyDraft.purpose} options={RETENTION_KEY_PURPOSES} onChange={(v) => setKeyDraft({ ...keyDraft, purpose: v })} />}</Field>
        </div>
        <div style={controlRow}>
          <GovernedButton label="Declare signing key" pendingLabel="declaring" disabled={!keyOk(keyDraft)}
            onRun={async () => {
              try {
                await act(setKeyDeclared, 'declaration', () => retention.declareSigningKey(scope, toKeyIntake(keyDraft)), (d) => rec(d['key']));
                setKeyDraft(EMPTY_KEY);
              } finally {
                await loadKeys();
              }
            }} />
        </div>
        <Problem verb="not declared" problem={keyDeclared.problem} />
        {keyDeclared.result !== null && (
          <>
            <p>declared key <Mono>{str(keyDeclared.result['key_id'])}</Mono> · {str(keyDeclared.result['algorithm'])} · purpose <strong>{str(keyDeclared.result['purpose'])}</strong> · reference <Mono>{str(keyDeclared.result['credential_ref'])}</Mono> · declared at {fmtInstant(keyDeclared.result['declared_at'])}</p>
            {pemOf(keyDeclared.result) !== null && <Block label="the declared key's public key" text={pemOf(keyDeclared.result) ?? ''} />}
          </>
        )}
        <Receipt receipt={keyDeclared.receipt} />

        <h3 style={h3}>Destinations ({destinations === null ? '…' : destinations.length})</h3>
        {destinationsProblem !== null && <LiveStatus assertive><span style={critical}>not listed — {destinationsProblem}</span></LiveStatus>}
        {destinations === null ? (destinationsProblem === null ? <Empty>reading the destinations…</Empty> : null) : destinations.length === 0 ? <Empty>No destination is declared in this domain: a package can be downloaded but delivered nowhere.</Empty> : (
          <ScrollBox label="export destinations">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Key</Th><Th>Kind</Th><Th>Endpoint</Th><Th>Recipient</Th><Th>Purpose</Th><Th>Credential reference</Th><Th>Trust anchor</Th><Th>Readiness</Th><Th>Declared</Th><Th>Retired</Th><Th>Retire</Th></tr></thead>
              <tbody>{destinations.map((d) => {
                const id = String(d['destination_id']);
                return (
                  <tr key={id}>
                    <Td mono>{str(d['destination_key'])}</Td><Td>{str(d['kind'])}</Td><Td mono>{str(d['endpoint'])}</Td><Td>{str(d['recipient'])}</Td><Td>{str(d['purpose'])}</Td>
                    <Td mono>{str(d['credential_ref'])}</Td><Td>{trustAnchorText(d)}</Td><Td><strong>{str(d['readiness'])}</strong></Td>
                    <Td>by <Mono>{short(d['declared_by'])}</Mono> at {fmtInstant(d['declared_at'])}</Td><Td>{retiredText(d)}</Td>
                    <Td>{isRetired(d) ? '—' : (
                      <Retire id={`destination ${str(d['destination_key'])}`} reason={retireReasons[id] ?? ''} onReason={(v) => setRetireReasons({ ...retireReasons, [id]: v })}
                        onRun={async () => {
                          try {
                            await act(setDestinationRetired, 'retirement', () => retention.retireDestination(scope, id, (retireReasons[id] ?? '').trim()), (d2) => rec(d2['destination']));
                            setRetireReasons({ ...retireReasons, [id]: '' });
                          } finally {
                            await loadDestinations();
                          }
                        }} />
                    )}</Td>
                  </tr>
                );
              })}</tbody>
            </table>
          </ScrollBox>
        )}
        <Problem verb="not retired" problem={destinationRetired.problem} />
        {destinationRetired.result !== null && <p>destination <Mono>{str(destinationRetired.result['destination_key'])}</Mono> retired {retiredText(destinationRetired.result)} — a delivery to it is refused from now on; its recorded deliveries stay</p>}
        <Receipt receipt={destinationRetired.receipt} />

        <h3 style={h3}>Declare a destination</h3>
        <p style={muted}>
          A domain admin's act, human-gated. The key is unique among the domain's active destinations (<Mono>a-z 0-9 -</Mono>, 2 to 64 characters). A transfer
          station's endpoint is an absolute directory that exists where the server runs and lies outside the vault's roots; an https destination's endpoint is an
          <Mono>https://</Mono> URL and may name a credential reference <Mono>EYE_DST_&lt;NAME&gt;</Mono> (carried as a bearer at egress, resolved where the server
          runs, never recorded) and a trust anchor (B14: the PEM certificates its server certificate must chain to — a customer endpoint on its own PKI; TLS
          verification is never disabled either way, the anchor narrows trust to the declared party). The recipient is the exchange identity — who receives; the
          purpose is the exchange's. The server states what it refuses.
        </p>
        <div style={rowStyle}>
          <Field id="ds-key" label="Destination key (required)">{(id) => <Txt id={id} value={destinationDraft.destinationKey} onChange={(v) => setDestinationDraft({ ...destinationDraft, destinationKey: v })} />}</Field>
          <Field id="ds-kind" label="Kind">{(id) => <Sel id={id} value={destinationDraft.kind} options={RETENTION_DESTINATION_KINDS} onChange={(v) => setDestinationDraft({ ...destinationDraft, kind: v })} />}</Field>
          <Field id="ds-endpoint" label={destinationDraft.kind === 'https' ? 'Endpoint (required; an https:// URL)' : 'Endpoint (required; an absolute directory outside the vault\'s roots)'}>{(id) => <Txt id={id} value={destinationDraft.endpoint} onChange={(v) => setDestinationDraft({ ...destinationDraft, endpoint: v })} />}</Field>
          {destinationDraft.kind === 'https' && (
            <Field id="ds-ref" label="Credential reference (optional; EYE_DST_<NAME>)">{(id) => <Txt id={id} value={destinationDraft.credentialRef} onChange={(v) => setDestinationDraft({ ...destinationDraft, credentialRef: v })} />}</Field>
          )}
          {destinationDraft.kind === 'https' && (
            <Field id="ds-anchor" label="Trust anchor (optional; one or more PEM certificates the endpoint's certificate must chain to — the deployment's trust store otherwise)">{(id) => <textarea id={id} style={{ ...wide, minBlockSize: '6rem', fontFamily: 'var(--eye-font-mono)' }} value={destinationDraft.trustAnchorPem} onChange={(e) => setDestinationDraft({ ...destinationDraft, trustAnchorPem: e.target.value })} />}</Field>
          )}
          <Field id="ds-recipient" label="Recipient (required; who receives)">{(id) => <Txt id={id} value={destinationDraft.recipient} onChange={(v) => setDestinationDraft({ ...destinationDraft, recipient: v })} />}</Field>
          <Field id="ds-purpose" label="Purpose (required)">{(id) => <Txt id={id} value={destinationDraft.purpose} onChange={(v) => setDestinationDraft({ ...destinationDraft, purpose: v })} />}</Field>
        </div>
        <div style={controlRow}>
          <GovernedButton label="Declare destination" pendingLabel="declaring" disabled={!destinationOk(destinationDraft)}
            onRun={async () => {
              try {
                // A credential reference belongs to an https destination only: one typed under a transfer station is not sent.
                await act(setDestinationDeclared, 'declaration', () => retention.declareDestination(scope, toDestinationIntake(destinationDraft.kind === 'https' ? destinationDraft : { ...destinationDraft, credentialRef: '', trustAnchorPem: '' })), (d) => rec(d['destination']));
                setDestinationDraft(EMPTY_DESTINATION);
              } finally {
                await loadDestinations();
              }
            }} />
        </div>
        <Problem verb="not declared" problem={destinationDeclared.problem} />
        {destinationDeclared.result !== null && (
          <p>
            declared destination <Mono>{str(destinationDeclared.result['destination_key'])}</Mono> <Mono>{short(destinationDeclared.result['destination_id'])}</Mono> · {str(destinationDeclared.result['kind'])} at <Mono>{str(destinationDeclared.result['endpoint'])}</Mono>
            {' · '}recipient {str(destinationDeclared.result['recipient'])} · readiness <strong>{str(destinationDeclared.result['readiness'])}</strong> · declared at {fmtInstant(destinationDeclared.result['declared_at'])}
          </p>
        )}
        <Receipt receipt={destinationDeclared.receipt} />
      </section>

      <section aria-labelledby="xp-h" style={cardStyle}>
        <h2 id="xp-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Exchange partners ({partners === null ? '…' : partners.length})</h2>
        <p style={muted}>
          B16 (0076 §3): the other half of the exchange. A <strong>partner</strong> is the party whose key-signed packages (<Mono>eye-customer-export/2</Mono>) this
          domain admits: its Ed25519 <strong>public key</strong> (a SubjectPublicKeyInfo PEM the party handed over; the server derives the key id exactly as the
          export's own signing key is named), the party, the purpose, and the <strong>intake source contract</strong> of this domain the imported records are held
          under — an active upload contract with confirmed rights, whose classification ceiling is the import's policy gate. A package signed by a key no active
          partner holds is quarantined, never admitted. Retiring a partner keeps its row and its imports; its key resolves nothing until a partner holds it again.
        </p>
        {partnersProblem !== null && <LiveStatus assertive><span style={critical}>not listed — {partnersProblem}</span></LiveStatus>}
        {partners === null ? (partnersProblem === null ? <Empty>reading the exchange partners…</Empty> : null) : partners.length === 0 ? <Empty>No exchange partner is declared in this domain: no inbound package can be admitted until one is.</Empty> : (
          <ScrollBox label="exchange partners">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Partner</Th><Th>Party</Th><Th>Purpose</Th><Th>Key</Th><Th>Intake contract</Th><Th>State</Th><Th>Declared</Th><Th>Retired</Th><Th>Retire</Th></tr></thead>
              <tbody>{partners.map((p) => {
                const id = String(p['partner_id']); const intake = rec(p['intake']);
                return (
                  <tr key={id}>
                    <Td mono>{str(p['partner_key'])}</Td><Td>{str(p['party'])}</Td><Td>{str(p['purpose'])}</Td><Td mono>{str(p['key_id'])}</Td>
                    <Td>{Object.keys(intake).length === 0 ? <Mono>{short(p['intake_source_id'])}@{str(p['intake_contract_version'])}</Mono> : <><Mono>{str(intake['source_key'])}@{str(intake['contract_version'])}</Mono> · {str(intake['connector_kind'])}, {str(intake['lifecycle_state'])}, rights {str(intake['rights_state'])}, ceiling {str(intake['classification_ceiling'])}</>}</Td>
                    <Td><strong>{str(p['state'])}</strong></Td>
                    <Td>by <Mono>{short(p['declared_by'])}</Mono> at {fmtInstant(p['declared_at'])}</Td><Td>{retiredText(p)}</Td>
                    <Td>{isRetired(p) ? '—' : (
                      <Retire id={`partner ${str(p['partner_key'])}`} reason={retireReasons[id] ?? ''} onReason={(v) => setRetireReasons({ ...retireReasons, [id]: v })}
                        onRun={async () => {
                          try {
                            await importAct(setPartnerRetired, 'retirement', () => retention.retirePartner(scope, id, (retireReasons[id] ?? '').trim()), (d) => rec(d['partner']));
                            setRetireReasons({ ...retireReasons, [id]: '' });
                          } finally {
                            await loadPartners();
                          }
                        }} />
                    )}</Td>
                  </tr>
                );
              })}</tbody>
            </table>
          </ScrollBox>
        )}
        <Problem verb="not retired" problem={partnerRetired.problem} />
        {partnerRetired.result !== null && <p>partner <Mono>{str(partnerRetired.result['partner_key'])}</Mono> retired {retiredText(partnerRetired.result)} — its imports stay recorded; a package signed by its key is quarantined until a partner holds the key again</p>}
        <Receipt receipt={partnerRetired.receipt} />

        <h3 style={h3}>Declare a partner</h3>
        <p style={muted}>
          An administrator's act, human-gated. The partner key is unique among the domain's active partners (<Mono>a-z 0-9 -</Mono>, 2 to 64 characters). The
          public key is the party's Ed25519 key as a PEM (<Mono>-----BEGIN PUBLIC KEY-----</Mono>); the intake source is one of this domain's upload contracts —
          active, its rights confirmed — by its source id and contract version (the sources page lists them). The server states what it refuses: a key or a
          partner key already declared, a contract that is not an active upload contract with confirmed rights, a PEM that is not an Ed25519 public key.
        </p>
        <div style={rowStyle}>
          <Field id="xp-key" label="Partner key (required)">{(id) => <Txt id={id} value={partnerDraft.partnerKey} onChange={(v) => setPartnerDraft({ ...partnerDraft, partnerKey: v })} />}</Field>
          <Field id="xp-party" label="Party (required; who signs)">{(id) => <Txt id={id} value={partnerDraft.party} onChange={(v) => setPartnerDraft({ ...partnerDraft, party: v })} />}</Field>
          <Field id="xp-purpose" label="Purpose (required; why this domain accepts the party's packages)">{(id) => <Txt id={id} value={partnerDraft.purpose} onChange={(v) => setPartnerDraft({ ...partnerDraft, purpose: v })} />}</Field>
          <Field id="xp-source" label="Intake source id (required; an active upload contract of this domain with confirmed rights)">{(id) => <Txt id={id} value={partnerDraft.intakeSourceId} onChange={(v) => setPartnerDraft({ ...partnerDraft, intakeSourceId: v })} />}</Field>
          <Field id="xp-version" label="Intake contract version (1 or more)">{(id) => <Txt id={id} type="number" value={partnerDraft.intakeContractVersion} onChange={(v) => setPartnerDraft({ ...partnerDraft, intakeContractVersion: v })} />}</Field>
          <Field id="xp-pem" label="Public key (required; the party's Ed25519 public key as a SubjectPublicKeyInfo PEM)">{(id) => <textarea id={id} style={{ ...wide, minBlockSize: '6rem', fontFamily: 'var(--eye-font-mono)' }} value={partnerDraft.publicKeyPem} onChange={(e) => setPartnerDraft({ ...partnerDraft, publicKeyPem: e.target.value })} />}</Field>
        </div>
        <div style={controlRow}>
          <GovernedButton label="Declare partner" pendingLabel="declaring" disabled={!partnerOk(partnerDraft)}
            onRun={async () => {
              try {
                await importAct(setPartnerDeclared, 'declaration', () => retention.declarePartner(scope, toPartnerIntake(partnerDraft)), (d) => rec(d['partner']));
                setPartnerDraft(EMPTY_PARTNER);
              } finally {
                await loadPartners();
              }
            }} />
        </div>
        <Problem verb="not declared" problem={partnerDeclared.problem} />
        {partnerDeclared.result !== null && (
          <>
            <p>declared partner <Mono>{str(partnerDeclared.result['partner_key'])}</Mono> <Mono>{short(partnerDeclared.result['partner_id'])}</Mono> · {str(partnerDeclared.result['party'])} · key <Mono>{str(partnerDeclared.result['key_id'])}</Mono> ({str(partnerDeclared.result['algorithm'])}) · intake <Mono>{short(partnerDeclared.result['intake_source_id'])}@{str(partnerDeclared.result['intake_contract_version'])}</Mono> · declared at {fmtInstant(partnerDeclared.result['declared_at'])}</p>
            {pemOf(partnerDeclared.result) !== null && <Block label="the partner's public key as recorded" text={pemOf(partnerDeclared.result) ?? ''} />}
          </>
        )}
        <Receipt receipt={partnerDeclared.receipt} />
      </section>

      <section aria-labelledby="im-h" style={cardStyle}>
        <h2 id="im-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Imports ({imports === null ? '…' : imports.length})</h2>
        <p style={muted}>
          B16 (0076 §4): a partner's package taken into this domain by four governed acts and three people. <strong>Open</strong> (the steward): the package —
          inline, or read from a transfer station — is QUARANTINED as vault blobs and checked: the archive, the manifest, every file's digest and size, the
          re-import compatibility of every object, the digest chain, the signature against the partner's key, the closure by exact claim version (an edge
          asserted on C@1 is never satisfied by C@2), the intake contract's policy, a live duplicate, the origin's revocation and expiry as far as they are
          provable here (a note when they are not). The row is <Mono>verified</Mono> with the plan of ids this installation will mint, or <Mono>quarantined</Mono>
          with the failed checks named — its evidence kept. <strong>Approve</strong> (the retention authority, human-gated, never the opener) on the package
          digest they read. <strong>Admit</strong> (the steward, human-gated, never the approver): the records, the claim versions, the entities, the identifiers
          and the edges admitted under NEW ids in batches — the origin's identity carried inside each object as <Mono>imported_from</Mono> — each item settled on
          its own (excluded by the intake's ceiling, refused by the port, an edge whose claim version is not admitted); the quarantine copies of the admitted
          records removed after the commit. <strong>Withdraw</strong>: a quarantined, verified, approved or admitting import; its ledger stays, its copies go.
        </p>
        {importsProblem !== null && <LiveStatus assertive><span style={critical}>not listed — {importsProblem}</span></LiveStatus>}
        {imports === null ? (importsProblem === null ? <Empty>reading the imports…</Empty> : null) : imports.length === 0 ? <Empty>No import has been opened in this domain.</Empty> : (
          <ScrollBox label="imports">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Import</Th><Th>State</Th><Th>Origin</Th><Th>Intake</Th><Th>Package digest</Th><Th>Archive</Th><Th>Opened</Th><Th>Counts</Th></tr></thead>
              <tbody>{imports.map((i) => {
                const id = String(i['import_id']); const origin = rec(i['origin']); const intake = rec(i['intake']);
                return (
                  <tr key={id} aria-selected={selectedImport === id} style={selectedImport === id ? { outline: '2px solid var(--eye-color-accent-strong)' } : undefined}>
                    <Td mono><button type="button" onClick={() => selectImport(id)} style={{ font: 'inherit', background: 'none', border: 'none', color: 'var(--eye-color-accent-strong)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>{short(id)}</button></Td>
                    <Td><strong>{str(i['state'])}</strong></Td>
                    <Td mono>{short(origin['domain_id'])} · action {short(origin['action_id'])}</Td>
                    <Td>{str(intake['kind'])}{intake['destination_key'] !== undefined ? <> · <Mono>{str(intake['destination_key'])}</Mono></> : null}</Td>
                    <Td mono>{short(i['package_digest'])}</Td><Td mono>{short(i['archive_digest'])} · {str(i['archive_size'])} bytes</Td>
                    <Td>by <Mono>{short(i['opened_by'])}</Mono> at {fmtInstant(i['opened_at'])}</Td><Td mono>{json(i['counts'])}</Td>
                  </tr>
                );
              })}</tbody>
            </table>
          </ScrollBox>
        )}

        <h3 style={h3}>Open an import</h3>
        <div style={rowStyle}>
          <Field id="im-kind" label="Source">{(id) => <Sel id={id} value={importDraft.kind} options={['inline', 'station'] as const} onChange={(v) => setImportDraft({ ...importDraft, kind: v })} />}</Field>
          {importDraft.kind === 'inline' ? (
            <>
              <Field id="im-file" label="Package (a .tar the origin's product built; read here as base64 — at most 64 MiB decoded, and the listener's body limit before it; a larger package goes to a transfer station)">{(id) => (
                <input id={id} type="file" style={wide} onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (f === undefined) { setImportDraft({ ...importDraft, fileName: '', base64: '', byteLength: 0 }); return; }
                  const bytes = new Uint8Array(await f.arrayBuffer());
                  setImportDraft({ ...importDraft, fileName: f.name, base64: base64OfBytes(bytes), byteLength: bytes.byteLength });
                }} />
              )}</Field>
              <Field id="im-exchange" label="Exchange statement (optional; the sender's delivery.json, or the stream's headers, as a JSON object)">{(id) => <textarea id={id} style={{ ...wide, minBlockSize: '6rem', fontFamily: 'var(--eye-font-mono)' }} value={importDraft.exchange} onChange={(e) => setImportDraft({ ...importDraft, exchange: e.target.value })} />}</Field>
            </>
          ) : (
            <>
              <Field id="im-station" label="Transfer station (a destination of this domain, by key)">{(id) => (
                <select id={id} style={wide} value={importDraft.destinationKey} onChange={(e) => setImportDraft({ ...importDraft, destinationKey: e.target.value })}>
                  <option value="">— choose a station —</option>
                  {(destinations ?? []).filter((d) => d['kind'] === 'transfer_station' && !isRetired(d)).map((d) => <option key={String(d['destination_id'])} value={String(d['destination_key'])}>{str(d['destination_key'])} · {str(d['endpoint'])}</option>)}
                </select>
              )}</Field>
              <Field id="im-o-tenant" label="Origin tenant id (the package's path at the station: <tenant>/<domain>/<action>/package.tar)">{(id) => <Txt id={id} value={importDraft.originTenantId} onChange={(v) => setImportDraft({ ...importDraft, originTenantId: v })} />}</Field>
              <Field id="im-o-domain" label="Origin domain id">{(id) => <Txt id={id} value={importDraft.originDomainId} onChange={(v) => setImportDraft({ ...importDraft, originDomainId: v })} />}</Field>
              <Field id="im-o-action" label="Origin action id">{(id) => <Txt id={id} value={importDraft.originActionId} onChange={(v) => setImportDraft({ ...importDraft, originActionId: v })} />}</Field>
            </>
          )}
        </div>
        {importDraft.kind === 'inline' && importDraft.fileName !== '' && <p style={muted}>{importDraft.fileName}: {importDraft.byteLength} bytes read; the package is sent as base64 inside the governed payload</p>}
        <div style={controlRow}>
          <GovernedButton label="Open import" pendingLabel="opening (the package is quarantined and checked)" disabled={!importOk(importDraft)}
            onRun={async () => {
              try {
                await importAct(setImportOpened, 'opening', () => retention.openImport(scope, toImportSource(importDraft)), (d) => d as unknown as RetentionImportOpened);
              } finally {
                await loadImports();
              }
            }} />
        </div>
        <Problem verb="not opened" problem={importOpened.problem} />
        {importOpened.result !== null && (
          <p>
            import <Mono>{str(importOpened.result.import['import_id'])}</Mono> — <strong>{str(importOpened.result.import['state'])}</strong>
            {' · '}{importOpened.result.checks.filter((c) => c.ok === false).length} check(s) failed, {importOpened.result.checks.filter((c) => c.ok === null).length} note(s) · package digest <Mono>{str(importOpened.result.import['package_digest'])}</Mono>
            {' '}<button type="button" onClick={() => { if (importOpened.result !== null) selectImport(String(importOpened.result.import['import_id'])); }}
              style={{ font: 'inherit', background: 'none', border: 'none', color: 'var(--eye-color-accent-strong)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>select it</button>
          </p>
        )}
        <Receipt receipt={importOpened.receipt} />

        {selectedImport !== null && (
          <>
            <h3 style={h3}>The import's record — {short(selectedImport)}</h3>
            {importProblem !== null && <LiveStatus assertive><span style={critical}>{importProblem}</span></LiveStatus>}
            {importDetail === null ? (importProblem === null ? <Empty>reading the import…</Empty> : null) : (
              <>
                <dl>
                  <DefinitionRow term="Import"><Mono>{str(importDetail.import['import_id'])}</Mono> · state <strong>{str(importDetail.import['state'])}</strong> · {importDetail.import['verified'] === true ? 'verified at the open' : 'quarantined at the open'}</DefinitionRow>
                  <DefinitionRow term="Origin">tenant <Mono>{str(rec(importDetail.import['origin'])['tenant_id'])}</Mono> · domain <Mono>{str(rec(importDetail.import['origin'])['domain_id'])}</Mono> · action <Mono>{str(rec(importDetail.import['origin'])['action_id'])}</Mono> · format {str(rec(importDetail.import['origin'])['format'])} · scheme {str(rec(importDetail.import['origin'])['scheme'])} · key <Mono>{str(rec(importDetail.import['origin'])['key_id'])}</Mono></DefinitionRow>
                  <DefinitionRow term="Partner">{importDetail.partner === null ? 'none — no active partner held the package\'s key' : <><Mono>{str(importDetail.partner['partner_key'])}</Mono> · {str(importDetail.partner['party'])}</>}</DefinitionRow>
                  <DefinitionRow term="Intake"><Mono>{json(importDetail.import['intake'])}</Mono></DefinitionRow>
                  <DefinitionRow term="Exchange statement">{importDetail.import['exchange'] === null || importDetail.import['exchange'] === undefined ? 'none presented' : <Mono>{json(importDetail.import['exchange'])}</Mono>}</DefinitionRow>
                  <DefinitionRow term="Digests">package <Mono>{str(importDetail.import['package_digest'])}</Mono> · archive <Mono>{str(importDetail.import['archive_digest'])}</Mono> ({str(importDetail.import['archive_size'])} bytes)</DefinitionRow>
                  <DefinitionRow term="Timeline">opened by <Mono>{short(importDetail.import['opened_by'])}</Mono> at {fmtInstant(importDetail.import['opened_at'])} · approved {fmtInstant(importDetail.import['approved_at'])}{importDetail.import['approval_rationale'] !== null && importDetail.import['approval_rationale'] !== undefined ? ` — ${String(importDetail.import['approval_rationale'])}` : ''} · admitted {fmtInstant(importDetail.import['admitted_at'])} ({str(importDetail.import['attempts'])} attempt(s)) · withdrawn {fmtInstant(importDetail.import['withdrawn_at'])}{importDetail.import['withdraw_reason'] !== null && importDetail.import['withdraw_reason'] !== undefined ? ` — ${String(importDetail.import['withdraw_reason'])}` : ''}</DefinitionRow>
                  <DefinitionRow term="Counts"><Mono>{json(importDetail.import['counts'])}</Mono></DefinitionRow>
                  <DefinitionRow term="Import receipt"><Mono>{json(importDetail.importReceipt)}</Mono></DefinitionRow>
                  <DefinitionRow term="Revocation">
                    {importDetail.import['revocation_attempts'] === undefined ? 'not known to this server (before 0077)'
                      : Number(importDetail.import['revocation_attempts'] ?? 0) === 0 && importDetail.import['state'] !== 'revoked' ? 'none — the copies stand'
                        : <>
                          state <strong>{str(importDetail.import['state'])}</strong> · {str(importDetail.import['revocation_attempts'])} attempt(s)
                          {' · '}revoked {fmtInstant(importDetail.import['revoked_at'])}{importDetail.import['revoked_by'] === null || importDetail.import['revoked_by'] === undefined ? '' : <> by <Mono>{short(importDetail.import['revoked_by'])}</Mono></>}
                          {importDetail.import['revocation'] !== null && importDetail.import['revocation'] !== undefined ? <> · as recorded <Mono>{json(importDetail.import['revocation'])}</Mono></> : <> · in progress: a legal hold refused a record, or an attempt did not finish — the revoke act below retries it</>}
                          {' · '}{importDetail.events.filter(isRevocationEvent).length} revocation event(s): {importDetail.events.filter(isRevocationEvent).map((e) => str(e['event'])).join(', ') || '—'} (the events table below)
                        </>}
                  </DefinitionRow>
                </dl>

                <h3 style={h3}>Checks ({importDetail.checks.length})</h3>
                {importDetail.checks.length === 0 ? <Empty>No check is recorded.</Empty> : (
                  <ScrollBox label="import checks">
                    <table className="eye-table" style={tableStyle}>
                      <thead><tr><Th>Check</Th><Th>Outcome</Th><Th>Detail</Th></tr></thead>
                      <tbody>{importDetail.checks.map((c, i) => (
                        <tr key={i}><Td>{c.name}</Td><Td><strong>{checkVerdict(c)}</strong></Td><Td>{str(c.detail)}</Td></tr>
                      ))}</tbody>
                    </table>
                  </ScrollBox>
                )}

                <h3 style={h3}>Items ({importDetail.items.length})</h3>
                {importDetail.items.length === 0 ? <Empty>No item: the package listed nothing this domain could plan.</Empty> : (
                  <ScrollBox label="import items">
                    <table className="eye-table" style={tableStyle}>
                      <thead><tr><Th>Order</Th><Th>Kind</Th><Th>Origin</Th><Th>Planned here</Th><Th>Disposition</Th><Th>Gate</Th><Th>Reason</Th><Th>Admitted</Th><Th>Revocation</Th></tr></thead>
                      <tbody>{importDetail.items.map((i) => (
                        <tr key={String(i['item_id'])}>
                          <Td mono>{str(i['dependency_order'])}</Td><Td>{str(i['kind'])}</Td><Td mono>{str(i['origin_ref'])}</Td><Td mono>{json(i['planned'])}</Td>
                          <Td><strong>{str(i['disposition'])}</strong></Td><Td>{str(i['gate'])}</Td><Td>{str(i['reason'])}</Td>
                          <Td mono>{i['admitted'] === null || i['admitted'] === undefined ? '—' : json(i['admitted'])}</Td>
                          <Td>{i['revocation'] === null || i['revocation'] === undefined ? '—' : <><strong>{str(rec(i['revocation'])['outcome'])}</strong> at {fmtInstant(i['revoked_at'])}{rec(i['revocation'])['reason'] === undefined ? '' : ` — ${str(rec(i['revocation'])['reason'])}`}</>}</Td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </ScrollBox>
                )}

                <h3 style={h3}>Events ({importDetail.events.length})</h3>
                {importDetail.events.length === 0 ? <Empty>No event.</Empty> : (
                  <ScrollBox label="import events">
                    <table className="eye-table" style={tableStyle}>
                      <thead><tr><Th>Event</Th><Th>Actor</Th><Th>Occurred</Th><Th>Details</Th></tr></thead>
                      <tbody>{importDetail.events.map((e) => (
                        <tr key={String(e['event_id'])}>
                          <Td>{str(e['event'])}</Td><Td mono>{short(e['actor_principal_id'])}</Td><Td>{fmtInstant(e['occurred_at'])}</Td><Td mono>{json(e['details'])}</Td>
                        </tr>
                      ))}</tbody>
                    </table>
                  </ScrollBox>
                )}

                <h3 style={h3}>Approve</h3>
                <p style={muted}>
                  The retention authority's act, human-gated: on the <strong>package digest</strong> restated here from the verified import — <Mono>{str(importDetail.import['package_digest'])}</Mono> — with a
                  rationale (8+ characters). The opener never approves; only a verified import is approved. The server's words otherwise.
                </p>
                <Field id="im-rationale" label="Rationale (at least 8 characters, required)">{(id) => <Txt id={id} value={importRationale} onChange={setImportRationale} />}</Field>
                <div style={controlRow}>
                  <GovernedButton label="Approve the import" pendingLabel="approving" disabled={importRationale.trim().length < 8 || typeof importDetail.import['package_digest'] !== 'string'}
                    onRun={async () => { await importAct(setImportApproved, 'approval', () => retention.approveImport(scope, selectedImport, String(importDetail.import['package_digest']), importRationale.trim()), (d) => rec(d['import'])); }} />
                </div>
                <Problem verb="not approved" problem={importApproved.problem} />
                {importApproved.result !== null && <p>import <Mono>{short(importApproved.result['import_id'])}</Mono> is now <strong>{str(importApproved.result['state'])}</strong> · approved by <Mono>{short(importApproved.result['approved_by'])}</Mono> at {fmtInstant(importApproved.result['approved_at'])}</p>}
                <Receipt receipt={importApproved.receipt} />

                <h3 style={h3}>Admit</h3>
                <p style={muted}>The steward's act, human-gated (never the approver): the approved import admitted in batches under ids this installation mints; each item settled on its own; an admission interrupted resumes with the same act.</p>
                <div style={controlRow}>
                  <GovernedButton label="Admit the import" pendingLabel="admitting (batch by batch)"
                    onRun={async () => { await importAct(setImportAdmitted, 'admission', () => retention.admitImport(scope, selectedImport), (d) => ({ import: rec(d['import']), batches: arr(d['batches']) })); }} />
                </div>
                <Problem verb="not admitted" problem={importAdmitted.problem} />
                {importAdmitted.result !== null && (
                  <p>
                    import <Mono>{short(importAdmitted.result.import['import_id'])}</Mono> is now <strong>{str(importAdmitted.result.import['state'])}</strong>
                    {' · '}{importAdmitted.result.batches.length} batch(es): {importAdmitted.result.batches.map((b) => `${str(b['kind'])} ×${str(b['count'])}`).join(', ')} · counts <Mono>{json(importAdmitted.result.import['counts'])}</Mono>
                  </p>
                )}
                <Receipt receipt={importAdmitted.receipt} />

                <h3 style={h3}>Withdraw</h3>
                <p style={muted}>The steward's act: a quarantined, verified, approved or admitting import withdrawn once with a reason; its ledger stays, its quarantine copies are removed after the commit. An admitted import stands.</p>
                <Field id="im-wd-reason" label="Reason (at least 8 characters, required)">{(id) => <Txt id={id} value={importWdReason} onChange={setImportWdReason} />}</Field>
                <div style={controlRow}>
                  <GovernedButton label="Withdraw the import" pendingLabel="withdrawing" variant="critical" disabled={importWdReason.trim().length < 8}
                    onRun={async () => { await importAct(setImportWithdrawn, 'withdrawal', () => retention.withdrawImport(scope, selectedImport, importWdReason.trim()), (d) => ({ import: rec(d['import']), quarantine: rec(d['quarantine']) })); }} />
                </div>
                <Problem verb="not withdrawn" problem={importWithdrawn.problem} />
                {importWithdrawn.result !== null && <p>import <Mono>{short(importWithdrawn.result.import['import_id'])}</Mono> is now <strong>{str(importWithdrawn.result.import['state'])}</strong> · quarantine copies: <Mono>{json(importWithdrawn.result.quarantine)}</Mono></p>}
                <Receipt receipt={importWithdrawn.receipt} />

                <h3 style={h3}>Revoke</h3>
                <p style={muted}>
                  B17: the origin's revocation executed here, human-gated (<Mono>retention.import.revoke</Mono>: the tenant's retention authority or administrator, this domain's steward or
                  administrator) on an ADMITTED import — from the <strong>origin's record</strong> on this installation (a domain of this tenant whose package is revoked), or from the
                  origin's <strong>signed notice</strong> (<Mono>revocation.json</Mono>) at a transfer station declared here, verified against the import's partner key before anything is
                  destroyed (an unsigned notice, another party's key or another package: refused, nothing destroyed, the refusal recorded). The imported edges are retracted, the entities
                  retired (their identifiers kept: a person decides), every imported version withdrawn by a new version naming the revocation, the bytes tombstoned and removed after
                  the commit; the receipt answers the origin. A record under a <strong>legal hold</strong> is refused and the import stays <Mono>revoking</Mono> until the hold is lifted
                  and this act is retried; a copy another admitted import still holds is left and said so. A revoked import answers <Mono>retried</Mono>.
                </p>
                <div style={rowStyle}>
                  <Field id="im-rv-kind" label="Source">{(id) => <Sel id={id} value={importRevokeKind} options={['origin', 'station'] as const} onChange={setImportRevokeKind} />}</Field>
                  {importRevokeKind === 'station' && (
                    <Field id="im-rv-station" label="Transfer station (a destination of this domain, kind transfer_station)">{(id) => (
                      <select id={id} style={wide} value={importRevokeStation} onChange={(e) => setImportRevokeStation(e.target.value)}>
                        <option value="">— choose a station —</option>
                        {(destinations ?? []).filter((d) => d['kind'] === 'transfer_station' && !isRetired(d)).map((d) => <option key={String(d['destination_id'])} value={String(d['destination_key'])}>{str(d['destination_key'])} · {str(d['endpoint'])}</option>)}
                      </select>
                    )}</Field>
                  )}
                </div>
                <div style={controlRow}>
                  <GovernedButton label="Revoke the import" pendingLabel="revoking (batch by batch)" variant="critical" disabled={importRevokeKind === 'station' && importRevokeStation === ''}
                    onRun={async () => {
                      const source: RetentionRevocationSource = importRevokeKind === 'origin' ? { kind: 'origin' } : { kind: 'station', destinationKey: importRevokeStation };
                      await importAct(setImportRevoked, 'revocation', () => retention.revokeImport(scope, selectedImport, source), (d) => ({ import: rec(d['import']), revocation: rec(d['revocation']), batches: arr(d['batches']) }));
                    }} />
                </div>
                <Problem verb="not revoked" problem={importRevoked.problem} />
                {importRevoked.result !== null && (
                  <>
                    <p>
                      import <Mono>{short(importRevoked.result.import['import_id'])}</Mono> is now <strong>{str(importRevoked.result.import['state'])}</strong> · the attempt answered <strong>{str(importRevoked.result.revocation['state'])}</strong>
                      {' '}(attempt {str(importRevoked.result.revocation['attempt'])}; source {str(rec(importRevoked.result.revocation['source'])['kind'])})
                      {importRevoked.result.revocation['destroyed'] !== undefined ? <> · destroyed <Mono>{json(importRevoked.result.revocation['destroyed'])}</Mono>{importRevoked.result.revocation['cumulative'] !== undefined ? <> (every attempt: <Mono>{json(importRevoked.result.revocation['cumulative'])}</Mono>)</> : null} · left {str(importRevoked.result.revocation['left'])} · refused {arr(importRevoked.result.revocation['refused']).length}</> : null}
                      {importRevoked.result.revocation['reason'] !== undefined ? <> · {str(importRevoked.result.revocation['reason'])}</> : null}
                    </p>
                    {/* B18 (Codex B17-F1): the bytes as the cleanup found and verified them — a resumed attempt removes an earlier attempt's residual; a locator still present after the removal is said, never reported destroyed. */}
                    {importRevoked.result.revocation['bytes'] !== null && importRevoked.result.revocation['bytes'] !== undefined && (
                      <p>bytes: removed {arr(rec(importRevoked.result.revocation['bytes'])['removed']).length}
                        {arr(rec(importRevoked.result.revocation['bytes'])['residual']).length > 0 ? <> (of which the residual of an earlier attempt: {arr(rec(importRevoked.result.revocation['bytes'])['residual']).map((l) => <Mono key={str(l)}>{str(l)} </Mono>)})</> : null}
                        {' · '}failed {arr(rec(importRevoked.result.revocation['bytes'])['failed']).length}
                        {arr(rec(importRevoked.result.revocation['bytes'])['remaining']).length > 0 ? <> · <span style={critical}>still present after the removal:</span> {arr(rec(importRevoked.result.revocation['bytes'])['remaining']).map((l) => <Mono key={str(l)}>{str(l)} </Mono>)} — the ledger's revocation stands; revoke again to remove them</> : null}
                      </p>
                    )}
                    {arr(importRevoked.result.revocation['refused']).length > 0 && (
                      <p><span style={critical}>held:</span> {arr(importRevoked.result.revocation['refused']).map((x) => `${str(x['kind'])} ${str(x['origin_ref'])} — ${str(x['reason'])}${x['hold_id'] === null || x['hold_id'] === undefined ? '' : ` (hold ${short(x['hold_id'])})`}`).join('; ')} — lift the hold and revoke again</p>
                    )}
                    {importRevoked.result.revocation['receipt'] !== null && importRevoked.result.revocation['receipt'] !== undefined && (
                      <p>receipt: copies destroyed <strong>{yes(rec(importRevoked.result.revocation['receipt'])['copies_destroyed'])}</strong>
                        {' · '}the origin answered: {importRevoked.result.revocation['answered'] === null || importRevoked.result.revocation['answered'] === undefined ? '—' : rec(importRevoked.result.revocation['answered'])['answered'] === true ? <><strong>{str(rec(importRevoked.result.revocation['answered'])['state'])}</strong> (notice attempt {str(rec(importRevoked.result.revocation['answered'])['attempt'])})</> : <>not answered here — {str(rec(importRevoked.result.revocation['answered'])['reason'])}</>}
                        {importRevoked.result.revocation['station_receipt'] !== null && importRevoked.result.revocation['station_receipt'] !== undefined ? <> · the station receipt: <Mono>{json(importRevoked.result.revocation['station_receipt'])}</Mono></> : null}
                      </p>
                    )}
                    {importRevoked.result.batches.length > 0 && <p>{importRevoked.result.batches.length} write(s): {importRevoked.result.batches.map((b) => `${str(b['kind'])} ×${str(b['count'])}`).join(', ')}</p>}
                  </>
                )}
                <Receipt receipt={importRevoked.receipt} />
              </>
            )}
          </>
        )}
      </section>

      <section aria-labelledby="acts-h" style={cardStyle}>
        <h2 id="acts-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Actions ({actions.length})</h2>
        {partitions.map((p) => (
          <p key={String(p['partition_key'])} style={muted}>
            log partition <Mono>{str(p['partition_key'])}</Mono>: last sequence {str(p['last_seq'])}, pending {str(p['pending'])}, dead letters {str(p['dead_letters'])},
            {' '}retained from sequence <strong>{str(p['retained_from_seq'])}</strong> ({str(p['retention_policy'])}){p['retention_note'] !== null && p['retention_note'] !== undefined ? <> — {String(p['retention_note'])}</> : null}
          </p>
        ))}
        {actions.length === 0 ? <Empty>No retention action has been opened in this domain.</Empty> : (
          <ScrollBox label="retention actions">
            <table className="eye-table" style={tableStyle}>
              <thead><tr><Th>Select</Th><Th>Kind</Th><Th>Target</Th><Th>Selector</Th><Th>State</Th><Th>Scope</Th><Th>Failure</Th><Th>Profile</Th><Th>Opened by</Th><Th>Opened at</Th><Th>Closed</Th></tr></thead>
              <tbody>
                {actions.map((a) => {
                  const id = String(a['action_id']); const isSel = id === selected;
                  return (
                    <tr key={id} aria-selected={isSel}>
                      <Td>
                        <button type="button" aria-pressed={isSel} onClick={() => select(id)}
                          style={{ font: 'inherit', background: 'none', border: 'none', color: 'var(--eye-color-accent-strong)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
                          {isSel ? 'selected' : 'select'}
                        </button>
                      </Td>
                      <Td mono>{str(a['kind'])}</Td><Td>{str(a['target_kind'])}</Td><Td mono>{selectorText(a['selector'])}</Td>
                      <Td><strong>{str(a['state'])}</strong></Td><Td>{scopeText(a['scope_summary'])}</Td><Td>{failureText(a)}</Td>
                      <Td mono>{str(a['retention_profile'])}{a['schedule_id'] !== null && a['schedule_id'] !== undefined ? ' (scheduled)' : ''}</Td>
                      <Td mono>{short(a['opened_by'])}</Td><Td>{fmtInstant(a['opened_at'])}</Td><Td>{fmtInstant(a['closed_at'])}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </ScrollBox>
        )}
      </section>

      {current !== null && selected !== null && (
        <>
          <section aria-labelledby="rec-h" style={cardStyle}>
            <h2 id="rec-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>The action's record — {str(current['kind'])} on {str(current['target_kind'])}</h2>
            {detailProblem !== null && <LiveStatus assertive><span style={critical}>not read — {detailProblem}</span></LiveStatus>}
            {detail === null ? (detailProblem === null ? <Empty>reading the record…</Empty> : null) : <ActionRecord d={detail} />}
            {current['kind'] === 'customer_export' && (
              <>
                <h3 style={h3}>The export package</h3>
                {exported.problem !== null && <p><span style={critical}>not read — {exported.problem}</span></p>}
                {exported.detail === null ? (exported.problem === null ? <Empty>No package is recorded: the export has not executed.</Empty> : null) : (
                  <dl>
                    <DefinitionRow term="Package"><Mono>{str(exported.detail.package['locator_prefix'])}</Mono> · {str(exported.detail.package['object_count'])} object(s), {str(exported.detail.package['excluded_count'])} excluded, {str(exported.detail.package['byte_total'])} bytes · ceiling {str(exported.detail.package['classification_ceiling'])}</DefinitionRow>
                    <DefinitionRow term="Digests">package <Mono>{str(exported.detail.package['package_digest'])}</Mono> · manifest.json <Mono>{str(exported.detail.package['manifest_digest'])}</Mono> · archive <Mono>{exported.detail.archive_digest === null || exported.detail.archive_digest === undefined ? str(exported.detail.package['archive_digest']) : exported.detail.archive_digest}</Mono> (the tar's sha256, recorded at the build; none for a package built before B13)</DefinitionRow>
                    <DefinitionRow term="Signature">
                      {signatureText(exported.detail.package['signature'])}
                      {exported.detail.signing_key !== null && exported.detail.signing_key !== undefined && <> · the key is <strong>{str(exported.detail.signing_key.state)}</strong>, purpose <strong>{str(exported.detail.signing_key.purpose)}</strong>{exported.detail.signing_key.state === 'retired' ? ' (a package signed by a key retired since still verifies against its recorded public key)' : ''}</>}
                      {exported.detail.signing_key === null && <> · no key: the digest chain (a package built while no key was active)</>}
                    </DefinitionRow>
                    <DefinitionRow term="Graph links">
                      {(() => {
                        const links = ((exported.detail.manifest as Record<string, unknown> | null)?.['package'] as Record<string, unknown> | undefined)?.['links'] as Record<string, unknown> | null | undefined;
                        if (links === null || links === undefined) return <>none — a package built before B15 carries no relationship closure</>;
                        return <><Mono>{str(links['file'])}</Mono> ({str(links['byte_length'])} bytes, sha256 <Mono>{str(links['links_digest'])}</Mono>, inside the digest chain): {str(links['claims'])} claim(s) by lineage, {str(links['edges'])} edge(s), {str(links['entities'])} entit{links['entities'] === 1 ? 'y' : 'ies'} with their identifiers, {str(links['excluded'])} excluded under the ceiling</>;
                      })()}
                    </DefinitionRow>
                    <DefinitionRow term="Expires">
                      {exported.detail.expires_at === null ? 'never (a package built before B13 carries no expiry)' : exported.detail.expires_at === undefined ? str(exported.detail.package['expires_at']) : fmtInstant(exported.detail.expires_at)}
                      {exported.detail.expired === true && <> · <strong style={critical}>expired</strong> — the download and the delivery are refused</>}
                      {exported.detail.expired === false && <> · not expired</>}
                    </DefinitionRow>
                    <DefinitionRow term="Built">by <Mono>{short(exported.detail.package['built_by'])}</Mono> at {fmtInstant(exported.detail.package['built_at'])} under approval <Mono>{short(exported.detail.package['approval_id'])}</Mono></DefinitionRow>
                    <DefinitionRow term="Revoked">{exported.detail.package['revoked_at'] === null || exported.detail.package['revoked_at'] === undefined ? 'no' : `${fmtInstant(exported.detail.package['revoked_at'])} — ${str(exported.detail.package['revoke_reason'])}`}</DefinitionRow>
                    <DefinitionRow term="Files">{exported.detail.files.length === 0 ? 'none on disk' : exported.detail.files.map((f) => <Mono key={f}>{f} </Mono>)}</DefinitionRow>
                    <DefinitionRow term="Deliveries">{exported.detail.deliveries === undefined ? '—' : `${exported.detail.deliveries.length} recorded (below)`}</DefinitionRow>
                    <DefinitionRow term="Importers">{exported.detail.importers === undefined ? 'not known to this server (before 0077)' : exported.detail.importers.length === 0 ? 'none — no domain of this tenant has admitted this package' : `${exported.detail.importers.length} admitted import(s) in the tenant's domains (below)`}</DefinitionRow>
                  </dl>
                )}
                {exported.detail !== null && exported.detail.signing_key !== null && exported.detail.signing_key !== undefined && (
                  <>
                    <p style={muted}>The public key of <Mono>{str(exported.detail.signing_key.key_id)}</Mono>, as recorded at its declaration — what a customer passes to <Mono>scripts/retention/verify-export.mjs --public-key</Mono> to verify the signature:</p>
                    <Block label="the signing key's public key" text={exported.detail.signing_key.public_key_pem} />
                  </>
                )}
                {exported.detail !== null && exported.detail.importers !== undefined && exported.detail.importers.length > 0 && (
                  <>
                    <h3 style={h3}>Importers ({exported.detail.importers.length})</h3>
                    <p style={muted}>
                      B17: the domains of this tenant that ADMITTED this package (the mirror of an exchange within one installation) — the recipients the revocation reaches on the
                      origin's own ledger: revoking the package notifies each and destroys its copies through <Mono>retention.import.revoke</Mono>; a domain of another tenant, or
                      another installation, is a foreign recipient told through its transfer station.
                    </p>
                    <ScrollBox label="importers of the package">
                      <table className="eye-table" style={tableStyle}>
                        <thead><tr><Th>Import</Th><Th>Domain</Th><Th>State</Th><Th>Partner</Th><Th>Admitted</Th><Th>Revoked</Th><Th>Attempts</Th><Th>Counts</Th></tr></thead>
                        <tbody>{exported.detail.importers.map((im) => (
                          <tr key={String(im['import_id'])}>
                            <Td mono>{short(im['import_id'])}</Td><Td mono>{short(im['domain_id'])}</Td><Td><strong>{str(im['state'])}</strong></Td><Td mono>{str(im['partner_key'])}</Td>
                            <Td>{fmtInstant(im['admitted_at'])}</Td><Td>{fmtInstant(im['revoked_at'])}</Td><Td mono>{str(im['revocation_attempts'])}</Td><Td mono>{json(im['counts'])}</Td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </ScrollBox>
                  </>
                )}
              </>
            )}
          </section>

          <section aria-labelledby="resolve-h" style={cardStyle}>
            <h2 id="resolve-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Resolve the scope</h2>
            <p style={muted}>
              The steward's act: every item the action would touch is recorded with its disposition — execute, held (a legal hold takes precedence),
              excluded (a deletion retires corrected, superseded or withdrawn evidence only; a restore moves archived bytes only, so a manifest already
              in the hot tier is excluded), blocking (a cursor or unpublished row below a floor) — and the digest the approval signs is computed over
              that ordered scope. A paused, held or escalated action is resolved again by the same act; the re-resolution of an escalated one restarts
              its attempts (recorded on the resolution's event).
            </p>
            <div style={controlRow}>
              <GovernedButton label="Resolve scope" pendingLabel="resolving"
                onRun={() => act(setResolved, 'resolution', () => retention.resolveAction(scope, selected), (d) => d['scope'] as RetentionScopeSummary)} />
            </div>
            <Problem verb="not resolved" problem={resolved.problem} />
            {resolved.result !== null && <Resolved s={resolved.result} />}
            <Receipt receipt={resolved.receipt} />
          </section>

          <section aria-labelledby="approve-h" style={cardStyle}>
            <h2 id="approve-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Approve</h2>
            <p style={muted}>
              The retention authority's act, human-gated, on the digest of the resolved scope as this page read it: the server refuses a digest that is
              not the resolved scope's, a scope that is not resolved (paused, held), the opener's own approval, and a principal without the authority.
              An approval expires after 30 days and is revoked when an execution is rolled back.
            </p>
            <p>
              Digest submitted: {servedDigest === null ? <span style={critical}>none — the scope has not been resolved, so there is nothing to approve</span> : <Mono>{servedDigest}</Mono>}
            </p>
            <Field id="ap-why" label="Rationale (at least 8 characters, required)">{(id) => <Txt id={id} value={rationale} onChange={setRationale} />}</Field>
            <div style={controlRow}>
              <GovernedButton label="Approve on this digest" pendingLabel="approving" disabled={servedDigest === null || rationale.trim().length < 8}
                onRun={() => act(setApproved, 'approval', () => retention.approveAction(scope, selected, servedDigest ?? '', rationale.trim()), (d) => rec(d['approval']) as unknown as { approvalId: string; actionId: string; state: string })} />
            </div>
            <Problem verb="not approved" problem={approved.problem} />
            {approved.result !== null && <p>approval <Mono>{str(approved.result.approvalId)}</Mono> recorded; the action is now <strong>{str(approved.result.state)}</strong></p>}
            <Receipt receipt={approved.receipt} />
          </section>

          <section aria-labelledby="exec-h" style={cardStyle}>
            <h2 id="exec-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Execute</h2>
            <p style={muted}>
              The steward's act, human-gated; an approver never executes. The approved scope runs in one transaction: a review records each item as reviewed
              and removes nothing; a deletion tombstones each executing manifest and its bytes go after the commit; a log-floor move declares the floor.
              A hold placed since the approval refuses the item, and the whole execution is rolled back and the action paused for re-resolution (a 409).
              Every kind executes: an archive moves the bytes to the archive tier; a restore moves them back to the hot tier; a customer export builds a
              signed package under the export namespace. The cold-tier manager refuses, before anything moves, an archive or a restore above the domain's
              daily byte budget (the action paused for retry, the instant the window frees named) and any execution past the policy's attempts (the action
              escalated for human review; a re-resolution restarts the count) — each a 409 in the server's words.
              On an already executed action this act retries the pending bytes residuals.
            </p>
            <div style={controlRow}>
              <GovernedButton label="Execute the approved scope" pendingLabel="executing" variant="critical"
                onRun={() => act(setExecuted, 'execution', () => retention.executeAction(scope, selected), (d) => d['execution'] as RetentionExecutionResult)} />
            </div>
            <Problem verb="not executed" problem={executed.problem} />
            {executed.result !== null && <Execution e={executed.result} />}
            <Receipt receipt={executed.receipt} />
          </section>

          <section aria-labelledby="verify-h" style={cardStyle}>
            <h2 id="verify-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Verify</h2>
            <p style={muted}>
              Only an executed action is verified. Each item is checked against what the vault observes: a deleted manifest tombstoned and its bytes gone; a held
              one untouched and its bytes present; a reviewed one untouched, its bytes present and the review recorded; a moved floor standing at its sequence;
              a restored one recorded hot, its bytes in the hot tier under its digest, absent from the archive tier and no staged copy in either root.
              A pass closes the action verified (with residuals when bytes are still pending) and, for a deletion or a floor move, publishes DeletionVerified;
              a review's verification is its own record and publishes none.
            </p>
            <div style={controlRow}>
              <GovernedButton label="Verify" pendingLabel="verifying"
                onRun={() => act(setVerified, 'verification', () => retention.verifyAction(scope, selected), (d) => d['verification'] as RetentionVerdict)} />
            </div>
            <Problem verb="not verified" problem={verified.problem} />
            {verified.result !== null && <Verdict v={verified.result} />}
            <Receipt receipt={verified.receipt} />
          </section>

          <section aria-labelledby="wd-h" style={cardStyle}>
            <h2 id="wd-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Withdraw</h2>
            <p style={muted}>An opened, resolved, held, paused or approved action is withdrawn with a reason; an executing or executed one is not.</p>
            <Field id="wd-reason" label="Reason (at least 8 characters, required)">{(id) => <Txt id={id} value={wdReason} onChange={setWdReason} />}</Field>
            <div style={controlRow}>
              <GovernedButton label="Withdraw" pendingLabel="withdrawing" variant="critical" disabled={wdReason.trim().length < 8}
                onRun={() => act(setWithdrawn, 'withdrawal', () => retention.withdrawAction(scope, selected, wdReason.trim()), (d) => rec(d['action']) as unknown as { actionId: string; state: string })} />
            </div>
            <Problem verb="not withdrawn" problem={withdrawn.problem} />
            {withdrawn.result !== null && <p>action <Mono>{str(withdrawn.result.actionId)}</Mono> is now <strong>{str(withdrawn.result.state)}</strong></p>}
            <Receipt receipt={withdrawn.receipt} />
          </section>

          {current['kind'] === 'customer_export' && (
            <section aria-labelledby="dl-h" style={cardStyle}>
              <h2 id="dl-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Download the package</h2>
              <p style={muted}>
                A governed, audited act (<Mono>retention.export.download</Mono>: the event is recorded on the action with the reader and the digest; the bytes ride the
                same answer). The package's ARCHIVE is one deterministic tar — manifest.json first, then the object files by name — rebuilt from the files and compared
                with the digest recorded at the build before it is served: a mismatch is refused, never served. Refused once the package is revoked or expired. The browser
                saves <Mono>&lt;action id&gt;.tar</Mono> when the link below is clicked; verify it with <Mono>scripts/retention/verify-export.mjs --tar</Mono> and, for a
                key-based signature, <Mono>--public-key</Mono>. This answer holds the archive whole (its ceiling 256 MiB); a LARGER package is served by the stream route
                <Mono>POST …/export/stream</Mono> (B15) — the raw tar with its length and digests in headers, of any size under 64 GiB, assembled from the files as it is
                sent — for the customer's tool, not the browser.
              </p>
              <div style={controlRow}>
                <GovernedButton label="Download the archive" pendingLabel="downloading"
                  onRun={async () => {
                    releaseDownload();
                    await act(setDownloaded, 'download', () => retention.downloadExport(scope, selected), (d) => {
                      // The answer's base64 becomes a Blob the person's browser saves under the answer's filename; nothing is decoded or shown beyond its record.
                      const dl = d['download'] as RetentionExportDownload;
                      const url = URL.createObjectURL(new Blob([bytesOf(dl.base64)], { type: 'application/x-tar' }));
                      return { filename: dl.filename, byteLength: dl.byteLength, archiveDigest: dl.archiveDigest, packageDigest: dl.packageDigest, manifestDigest: dl.manifestDigest, signature: rec(dl.signature), expiresAt: dl.expiresAt, url };
                    });
                  }} />
              </div>
              <Problem verb="not downloaded" problem={downloaded.problem} />
              {downloaded.result !== null && (
                <>
                  <p>
                    {downloaded.result.url === '' ? <>saved as <Mono>{downloaded.result.filename}</Mono> (download again for a fresh link)</> : (
                      <a href={downloaded.result.url} download={downloaded.result.filename} style={{ color: 'var(--eye-color-accent-strong)', fontWeight: 600 }}
                        onClick={() => {
                          // The object URL is released once the browser has taken the bytes, and the link gives way to the statement; the record of the download stays.
                          const url = downloaded.result?.url;
                          if (url === undefined || url === '') return;
                          setTimeout(() => {
                            URL.revokeObjectURL(url);
                            setDownloaded((cur) => (cur.result !== null && cur.result.url === url ? { ...cur, result: { ...cur.result, url: '' } } : cur));
                          }, 1000);
                        }}>
                        save {downloaded.result.filename}
                      </a>
                    )}
                    {' '}· {String(downloaded.result.byteLength)} bytes · archive digest <Mono>{downloaded.result.archiveDigest}</Mono>
                    {' · '}package <Mono>{downloaded.result.packageDigest}</Mono> · manifest.json <Mono>{downloaded.result.manifestDigest}</Mono>
                    {' · '}expires {downloaded.result.expiresAt === null ? 'never' : fmtInstant(downloaded.result.expiresAt)}
                    {' · '}{signatureText(downloaded.result.signature)}
                  </p>
                  <Block label="the archive's signature block" text={JSON.stringify(downloaded.result.signature, null, 2)} />
                </>
              )}
              <Receipt receipt={downloaded.receipt} />
            </section>
          )}

          {current['kind'] === 'customer_export' && (
            <section aria-labelledby="dv-h" style={cardStyle}>
              <h2 id="dv-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Deliver the package</h2>
              <p style={muted}>
                The retention authority's act, human-gated: the VERIFIED, unrevoked, unexpired package is delivered to one of this domain's active destinations, the
                rights of every exported source re-checked first (a right withdrawn since the build refuses the delivery) — the server refuses an executed but unverified
                export, a package whose archive does not rebuild to its recorded digest, and a package without a key-based signature while the tenant now has an active
                key (build the export again). A delivery that failed is a recorded fact with its class — destination retired, credential unbound, egress refused, transport,
                receipt invalid, write failed — not a rolled-back one. To a transfer station the package, its signature and the exchange identity are written and the
                delivery waits for the recipient's receipt; to an https endpoint the package is POSTed and the endpoint's answer is its receipt.
              </p>
              {destinations !== null && destinations.filter((d) => !isRetired(d)).length === 0 && <p style={muted}>no active destination is declared in this domain — declare one under Export delivery above</p>}
              <div style={rowStyle}>
                <Field id="dv-dest" label="Destination (by key; the readiness as listed)">{(id) => (
                  <select id={id} style={wide} value={destinationKey} onChange={(e) => setDestinationKey(e.target.value)}>
                    <option value="">— choose a destination —</option>
                    {(destinations ?? []).filter((d) => !isRetired(d)).map((d) => (
                      <option key={String(d['destination_id'])} value={String(d['destination_key'])}>{str(d['destination_key'])} · {str(d['kind'])} · {str(d['readiness'])} · {str(d['recipient'])}</option>
                    ))}
                  </select>
                )}</Field>
              </div>
              <div style={controlRow}>
                <GovernedButton label="Deliver to the destination" pendingLabel="delivering" variant="critical" disabled={destinationKey === ''}
                  onRun={() => act(setDelivered, 'delivery', () => retention.deliverExport(scope, selected, destinationKey), (d) => rec(d['delivery']))} />
              </div>
              <Problem verb="not delivered" problem={delivered.problem} />
              {delivered.result !== null && (
                <p>
                  delivery <Mono>{str(delivered.result['delivery_id'])}</Mono> attempt {str(delivered.result['attempt'])} is <strong>{str(delivered.result['state'])}</strong>
                  {delivered.result['failure_class'] !== null && delivered.result['failure_class'] !== undefined && <> · <span style={critical}>failed: {str(delivered.result['failure_class'])}</span></>}
                  {' · '}archive <Mono>{str(delivered.result['archive_digest'])}</Mono> · delivered at {fmtInstant(delivered.result['delivered_at'])}
                  {delivered.result['signing_key_state'] !== undefined && <> · the signing key is {str(delivered.result['signing_key_state'])}</>}
                </p>
              )}
              <Receipt receipt={delivered.receipt} />

              <h3 style={h3}>Deliveries ({deliveries.rows === null ? '…' : deliveries.rows.length})</h3>
              <p style={muted}>
                The Content and Export Delivery Receipt: each delivery as recorded — the attempt, the destination, the state, the recipient's receipt as received (or the failure)
                and its digest. A transfer-station delivery in state <Mono>delivered</Mono> waits for the recipient's <Mono>receipt.json</Mono> beside the package: collect it here;
                a receipt carried out-of-band is presented to the acknowledge act below. The exchange closes <strong>acknowledged</strong> on a receipt naming the same archive and
                package digests with <Mono>verified</Mono> true; other digests or <Mono>verified</Mono> false record it <strong>mismatched</strong> — the exchange denied, the
                request and evidence preserved. A receipt naming another delivery neither acknowledges nor denies (B14): it is kept as evidence and the exchange stays
                open for the proper receipt. A revoked package's deliveries stay recorded, and every destination that received it is told (the revocation notices below).
              </p>
              {deliveries.problem !== null && <p><span style={critical}>not listed — {deliveries.problem}</span></p>}
              {deliveries.rows === null ? (deliveries.problem === null ? <Empty>reading the deliveries…</Empty> : null) : deliveries.rows.length === 0 ? <Empty>No delivery is recorded for this export.</Empty> : (
                <ScrollBox label="export deliveries">
                  <table className="eye-table" style={tableStyle}>
                    <thead><tr><Th>Delivery</Th><Th>Attempt</Th><Th>Destination</Th><Th>State</Th><Th>Delivered</Th><Th>Acknowledged</Th><Th>Receipt digest</Th><Th>Failure</Th><Th>Receipt</Th><Th>Collect</Th></tr></thead>
                    <tbody>{deliveries.rows.map((x) => {
                      const id = String(x['delivery_id']);
                      const dest = (destinations ?? []).find((d) => d['destination_id'] === x['destination_id']);
                      const kind = x['kind'] ?? x['destination_kind'] ?? dest?.['kind'];
                      const key = x['destination_key'] ?? dest?.['destination_key'];
                      return (
                        <tr key={id}>
                          <Td mono>{short(id)}</Td><Td mono>{str(x['attempt'])}</Td>
                          <Td>{key === undefined ? <Mono>{short(x['destination_id'])}</Mono> : <><Mono>{str(key)}</Mono> ({str(kind)})</>}</Td>
                          <Td><strong>{str(x['state'])}</strong></Td><Td>{fmtInstant(x['delivered_at'])}</Td><Td>{fmtInstant(x['acknowledged_at'])}</Td>
                          <Td mono>{str(x['receipt_digest'])}</Td><Td>{str(x['failure_class'])}</Td>
                          <Td mono>{x['receipt'] === null || x['receipt'] === undefined ? 'none yet' : json(x['receipt'])}</Td>
                          <Td>{x['state'] === 'delivered' && kind === 'transfer_station' ? (
                            <GovernedButton label="Collect receipt" pendingLabel="collecting"
                              onRun={() => act(setCollected, 'collection', () => retention.collectReceipt(scope, selected, id), (d) => rec(d['delivery']))} />
                          ) : '—'}</Td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </ScrollBox>
              )}
              <Problem verb="receipt not collected" problem={collected.problem} />
              {collected.result !== null && (
                <>
                  <p>delivery <Mono>{str(collected.result['delivery_id'])}</Mono> is now <strong>{str(collected.result['state'])}</strong>{collected.result['acknowledged_at'] !== null && collected.result['acknowledged_at'] !== undefined ? <> · acknowledged at {fmtInstant(collected.result['acknowledged_at'])}</> : null} · receipt digest <Mono>{str(collected.result['receipt_digest'])}</Mono></p>
                  <Block label="the receipt as recorded" text={JSON.stringify(collected.result['receipt'] ?? null, null, 2)} />
                </>
              )}
              <Receipt receipt={collected.receipt} />

              <h3 style={h3}>Acknowledge a delivery</h3>
              <p style={muted}>
                The same act, for a receipt presented out-of-band — an https recipient that answered without verifying, a transfer station's receipt carried by hand — on a
                delivery in state delivered. The receipt is a JSON object: <Mono>receipt_id</Mono>, <Mono>recipient</Mono>, <Mono>received_at</Mono>, <Mono>archive_digest</Mono>,
                <Mono>package_digest</Mono>, <Mono>verified</Mono>, and the <Mono>delivery_id</Mono> and <Mono>attempt</Mono> it answers (a receipt naming another delivery is refused);
                anything else is kept as received.
              </p>
              <div style={rowStyle}>
                <Field id="ak-delivery" label="Delivery (in state delivered)">{(id) => (
                  <select id={id} style={wide} value={ackDeliveryId} onChange={(e) => setAckDeliveryId(e.target.value)}>
                    <option value="">— choose a delivery —</option>
                    {(deliveries.rows ?? []).filter((x) => x['state'] === 'delivered').map((x) => (
                      <option key={String(x['delivery_id'])} value={String(x['delivery_id'])}>{short(x['delivery_id'])} · attempt {str(x['attempt'])} · {fmtInstant(x['delivered_at'])}</option>
                    ))}
                  </select>
                )}</Field>
                <Field id="ak-receipt" label="Receipt (JSON object)">{(id) => <textarea id={id} style={{ ...wide, minBlockSize: '8rem', fontFamily: 'var(--eye-font-mono)' }} value={ackReceipt} onChange={(e) => setAckReceipt(e.target.value)} />}</Field>
              </div>
              <div style={controlRow}>
                <GovernedButton label="Acknowledge on this receipt" pendingLabel="acknowledging" disabled={ackDeliveryId === '' || receiptObjectOf(ackReceipt) === null}
                  onRun={async () => {
                    await act(setAcknowledged, 'acknowledgement', () => retention.acknowledgeDelivery(scope, selected, ackDeliveryId, receiptObjectOf(ackReceipt) ?? {}), (d) => rec(d['delivery']));
                    setAckDeliveryId(''); setAckReceipt('');
                  }} />
              </div>
              <Problem verb="not acknowledged" problem={acknowledged.problem} />
              {acknowledged.result !== null && (
                <>
                  <p>delivery <Mono>{str(acknowledged.result['delivery_id'])}</Mono> is now <strong>{str(acknowledged.result['state'])}</strong>{acknowledged.result['acknowledged_at'] !== null && acknowledged.result['acknowledged_at'] !== undefined ? <> · acknowledged at {fmtInstant(acknowledged.result['acknowledged_at'])}</> : null} · receipt digest <Mono>{str(acknowledged.result['receipt_digest'])}</Mono></p>
                  <Block label="the receipt as recorded" text={JSON.stringify(acknowledged.result['receipt'] ?? null, null, 2)} />
                </>
              )}
              <Receipt receipt={acknowledged.receipt} />
            </section>
          )}

          {current['kind'] === 'customer_export' && (
            <section aria-labelledby="rv-h" style={cardStyle}>
              <h2 id="rv-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Revoke the export package</h2>
              <p style={muted}>
                The retention authority's act, human-gated: the package is revoked once with a reason and its bytes are removed after the commit; the read route, the download and
                a further delivery refuse it from then on. Its recorded deliveries stay. B14: in the same act every destination that received the package is sent a
                <strong>revocation notice</strong> — the package's digests, the delivery it holds, the reason, the instant and the obligation (destroy every copy, confirm) — a
                transfer station by <Mono>revocation.json</Mono> beside the package (the product's own copies there removed after the commit), an https endpoint by a JSON POST
                under the delivery's egress and credential rules. Every outcome is recorded: <Mono>notified</Mono>, <Mono>acknowledged</Mono> (the receipt names the package
                digest with <Mono>copies_destroyed</Mono> true), <Mono>mismatched</Mono> (the obligation refused), <Mono>failed</Mono> with its class — a failed notice is a fact,
                the revocation stands, and a further notice is sent below. B17: every notice is <strong>signed</strong> with the package's key (the tenant's active key, said so
                inside the signed bytes, when the package's is not bound here; unsigned and said so when neither can sign); each <strong>importing domain</strong> of the tenant is
                notified on this ledger and its copies destroyed by the same act — <Mono>revoked</Mono>, <Mono>held</Mono> by a legal hold there, or <Mono>pending</Mono> for its
                own steward when the acting principal holds no authority in that domain.
              </p>
              <Field id="rv-reason" label="Reason (at least 8 characters, required)">{(id) => <Txt id={id} value={rvReason} onChange={setRvReason} />}</Field>
              <div style={controlRow}>
                <GovernedButton label="Revoke the package" pendingLabel="revoking" variant="critical" disabled={rvReason.trim().length < 8}
                  onRun={async () => {
                    try {
                      await act(setRevoked, 'revocation', () => retention.revokeExport(scope, selected, rvReason.trim()), (d) => ({ revocation: rec(d['revocation']), notices: (d['notices'] as RetentionRow[] | undefined) ?? [], importers: (d['importers'] as RetentionRow[] | undefined) ?? [], bytes: rec(d['bytes']) as unknown as { removed: boolean; error?: string }, stations: (d['stations'] as RetentionRow[] | undefined) ?? [] }));
                    } finally {
                      await loadDeliveries(selected);
                      await loadImports();
                    }
                  }} />
              </div>
              <Problem verb="not revoked" problem={revoked.problem} />
              {revoked.result !== null && (
                <>
                  <p>package <Mono>{str(revoked.result.revocation['package_digest'])}</Mono> revoked at {fmtInstant(revoked.result.revocation['revoked_at'])}; bytes removed: {yes(revoked.result.bytes.removed)}{revoked.result.bytes.error !== undefined ? ` — ${revoked.result.bytes.error}` : ''}</p>
                  <p>notices sent: {revoked.result.notices.length === 0 ? 'none — no destination received, or is known to hold, this package' : revoked.result.notices.map((n) => `${str((n['destination'] as Record<string, unknown> | undefined)?.['destination_key'])} (holds: ${heldOf(n)}) → ${str(n['state'])}${n['failure_class'] === null || n['failure_class'] === undefined ? '' : ` (${str(n['failure_class'])})`}`).join('; ')}
                    {revoked.result.stations.length > 0 ? <> · the product's copies at the stations: {revoked.result.stations.map((st) => `${str(st['destination_key'])}: removed ${json(st['removed'])}${json(st['failed']) === '[]' ? '' : `, failed ${json(st['failed'])}`}`).join('; ')}</> : null}</p>
                  <p>importing domains: {revoked.result.importers.length === 0 ? 'none — no domain of this tenant holds an admitted import of this package' : revoked.result.importers.map((im) => {
                    const rv = rec(im['revocation']); const notice = rec(im['notice']);
                    return `import ${short(im['import_id'])} in domain ${short(im['domain_id'])}: notice ${str(notice['state'])} (attempt ${str(notice['attempt'])}) → revocation ${str(rv['state'])}${rv['destroyed'] !== undefined ? ` — destroyed ${json(rv['destroyed'])}, left ${str(rv['left'])}, refused ${arr(rv['refused']).length}` : ''}${rv['reason'] !== undefined ? ` — ${str(rv['reason'])}` : ''}${rec(rv['answered'])['state'] !== undefined ? `; the origin's ledger answered ${str(rec(rv['answered'])['state'])}` : ''}`;
                  }).join('; ')}</p>
                </>
              )}
              <Receipt receipt={revoked.receipt} />

              <h3 style={h3}>Revocation notices ({notices.rows === null ? '…' : notices.rows.length})</h3>
              {notices.problem !== null && <p><span style={critical}>not listed — {notices.problem}</span></p>}
              {notices.rows === null ? (notices.problem === null ? <Empty>reading the notices…</Empty> : null) : notices.rows.length === 0 ? <Empty>No revocation notice is recorded for this export.</Empty> : (
                <ScrollBox label="revocation notices">
                  <table className="eye-table" style={tableStyle}>
                    <thead><tr><Th>Notice</Th><Th>Attempt</Th><Th>Recipient</Th><Th>Delivery held</Th><Th>Held</Th><Th>State</Th><Th>Signature</Th><Th>Notified</Th><Th>Acknowledged</Th><Th>Failure</Th><Th>Receipt</Th><Th>Collect</Th></tr></thead>
                    <tbody>{notices.rows.map((x) => {
                      const id = String(x['notice_id']);
                      const importer = x['kind'] === 'importer' || (x['destination_key'] === null && rec(x['importer'])['import_id'] !== undefined);
                      return (
                        <tr key={id}>
                          <Td mono>{short(id)}</Td><Td mono>{str(x['attempt'])}</Td>
                          <Td><Mono>{noticeRecipientOf(x)}</Mono> ({importer ? 'importer' : str(x['kind'])})</Td><Td mono>{importer ? `import ${short(rec(x['importer'])['import_id'])}` : short(x['delivery_id'])}</Td><Td><strong>{heldOf(x)}</strong></Td>
                          <Td><strong>{str(x['state'])}</strong></Td><Td>{noticeSignatureOf(x)}</Td><Td>{fmtInstant(x['notified_at'])}</Td><Td>{fmtInstant(x['acknowledged_at'])}</Td><Td>{str(x['failure_class'])}</Td>
                          <Td mono>{x['receipt'] === null || x['receipt'] === undefined ? 'none yet' : json(x['receipt'])}</Td>
                          <Td>{x['state'] === 'notified' && x['kind'] === 'transfer_station' ? (
                            <GovernedButton label="Collect receipt" pendingLabel="collecting"
                              onRun={async () => { try { await act(setNoticeCollected, 'collection', () => retention.collectRevocationReceipt(scope, selected, id), (d) => rec(d['notice'])); } finally { await loadDeliveries(selected); } }} />
                          ) : '—'}</Td>
                        </tr>
                      );
                    })}</tbody>
                  </table>
                </ScrollBox>
              )}
              <Problem verb="receipt not collected" problem={noticeCollected.problem} />
              {noticeCollected.result !== null && <p>notice <Mono>{str(noticeCollected.result['notice_id'])}</Mono> is now <strong>{str(noticeCollected.result['state'])}</strong> · receipt digest <Mono>{str(noticeCollected.result['receipt_digest'])}</Mono></p>}
              <Receipt receipt={noticeCollected.receipt} />

              <h3 style={h3}>Send a further notice</h3>
              <p style={muted}>
                The retention authority's act, human-gated (<Mono>retention.export.notify</Mono>): a further notice to one destination that received the revoked package — the retry of a
                failed notice, or a second attempt after a mismatched answer. The server refuses it while the package is not revoked or the destination never received it. B17: or to an
                importing domain of the tenant by its domain and import id — the notice recorded here and that domain's revocation executed after the commit; refused when the import
                holds no admitted copy of this package.
              </p>
              <div style={rowStyle}>
                <Field id="nt-to" label="Recipient">{(id) => <Sel id={id} value={noticeTo} options={['destination', 'importer'] as const} onChange={setNoticeTo} />}</Field>
                {noticeTo === 'destination' ? (
                  <Field id="nt-destination" label="Destination">{(id) => (
                    <select id={id} style={wide} value={noticeKey} onChange={(e) => setNoticeKey(e.target.value)}>
                      <option value="">— choose a destination —</option>
                      {(destinations ?? []).map((d) => <option key={String(d['destination_id'])} value={String(d['destination_key'])}>{str(d['destination_key'])} · {str(d['kind'])}{isRetired(d) ? ' · retired' : ''}</option>)}
                    </select>
                  )}</Field>
                ) : (
                  <>
                    <Field id="nt-importer-domain" label="Importing domain (a domain id of this tenant)">{(id) => <Txt id={id} value={noticeImporterDomain} onChange={setNoticeImporterDomain} />}</Field>
                    <Field id="nt-importer-import" label="Import id (its admitted import of this package)">{(id) => <Txt id={id} value={noticeImporterImport} onChange={setNoticeImporterImport} />}</Field>
                  </>
                )}
              </div>
              <div style={controlRow}>
                <GovernedButton label="Send the notice" pendingLabel="notifying" disabled={noticeTo === 'destination' ? noticeKey === '' : noticeImporterDomain.trim() === '' || noticeImporterImport.trim() === ''}
                  onRun={async () => {
                    const to: RetentionNoticeRecipient = noticeTo === 'destination' ? { destinationKey: noticeKey } : { importer: { domainId: noticeImporterDomain.trim(), importId: noticeImporterImport.trim() } };
                    try { await act(setNotified, 'notice', () => retention.notifyRevocation(scope, selected, to), (d) => ({ ...rec(d['notice']), ...(d['importer'] === undefined ? {} : { importer: rec(d['importer']) }) })); }
                    finally { await loadDeliveries(selected); await loadImports(); }
                  }} />
              </div>
              <Problem verb="not notified" problem={notified.problem} />
              {notified.result !== null && (
                <p>
                  notice <Mono>{str(notified.result['notice_id'])}</Mono> attempt {str(notified.result['attempt'])} to <Mono>{notified.result.importer === undefined ? str((notified.result['destination'] as Record<string, unknown> | undefined)?.['destination_key']) : noticeRecipientOf(notified.result)}</Mono> — <strong>{str(notified.result['state'])}</strong>{notified.result['failure_class'] === null || notified.result['failure_class'] === undefined ? '' : ` (${str(notified.result['failure_class'])})`} · the recipient holds the package: <strong>{heldOf(notified.result)}</strong> · signature: {noticeSignatureOf(notified.result)}
                  {notified.result.importer !== undefined && <> · the importing domain's revocation: <strong>{str(rec(notified.result.importer['revocation'])['state'])}</strong>{rec(notified.result.importer['revocation'])['reason'] !== undefined ? ` — ${str(rec(notified.result.importer['revocation'])['reason'])}` : ''}</>}
                </p>
              )}
              <Receipt receipt={notified.receipt} />

              <h3 style={h3}>Acknowledge a notice</h3>
              <p style={muted}>A notice's receipt presented out of band, on a notice in state notified: a JSON object naming <Mono>package_digest</Mono> and <Mono>copies_destroyed</Mono> (and the <Mono>notice_id</Mono> it answers — a receipt naming another notice is refused).</p>
              <div style={rowStyle}>
                <Field id="nt-ack" label="Notice (in state notified)">{(id) => (
                  <select id={id} style={wide} value={ackNoticeId} onChange={(e) => setAckNoticeId(e.target.value)}>
                    <option value="">— choose a notice —</option>
                    {(notices.rows ?? []).filter((x) => x['state'] === 'notified').map((x) => <option key={String(x['notice_id'])} value={String(x['notice_id'])}>{short(x['notice_id'])} · attempt {str(x['attempt'])} · {str(x['destination_key'])}</option>)}
                  </select>
                )}</Field>
                <Field id="nt-receipt" label="Receipt (JSON object)">{(id) => <textarea id={id} style={{ ...wide, minBlockSize: '6rem', fontFamily: 'var(--eye-font-mono)' }} value={ackNoticeReceipt} onChange={(e) => setAckNoticeReceipt(e.target.value)} />}</Field>
              </div>
              <div style={controlRow}>
                <GovernedButton label="Acknowledge the notice" pendingLabel="acknowledging" disabled={ackNoticeId === '' || receiptObjectOf(ackNoticeReceipt) === null}
                  onRun={async () => {
                    try { await act(setNoticeAcknowledged, 'acknowledgement', () => retention.acknowledgeRevocationNotice(scope, selected, ackNoticeId, receiptObjectOf(ackNoticeReceipt) ?? {}), (d) => rec(d['notice'])); setAckNoticeId(''); setAckNoticeReceipt(''); }
                    finally { await loadDeliveries(selected); }
                  }} />
              </div>
              <Problem verb="not acknowledged" problem={noticeAcknowledged.problem} />
              {noticeAcknowledged.result !== null && <p>notice <Mono>{str(noticeAcknowledged.result['notice_id'])}</Mono> is now <strong>{str(noticeAcknowledged.result['state'])}</strong></p>}
              <Receipt receipt={noticeAcknowledged.receipt} />
            </section>
          )}
        </>
      )}

      <section aria-labelledby="open-h" style={cardStyle}>
        <h2 id="open-h" style={{ fontSize: 'var(--eye-type-heading-2)', marginBlockStart: 0 }}>Open an action</h2>
        <p style={muted}>
          The steward's act, under the purpose <Mono>retention</Mono>: the workflow's first durable state, announced by RetentionActionDue. An evidence
          selector names a manifest id or a source id (that source's superseded versions) — an archive, a restore or a customer export may name a chosen
          object set instead (manifest ids, one per line; a restore names the archived manifests to move back to the hot tier), and a customer export names
          its classification ceiling (its redaction gate; the export namespace is where its package is built — its delivery to a declared destination is its
          own act) and may name how long the package stays downloadable and deliverable (an interval, 1 hour to 1 year; the server's default is 30 days);
          a log partition names this tenant's partition key and the sequence the floor moves to, and takes the <Mono>log_floor</Mono> kind only. The server
          states what it refuses.
        </p>
        <div style={rowStyle}>
          <Field id="op-kind" label="Kind">{(id) => <Sel id={id} value={openDraft.kind} options={RETENTION_KINDS} onChange={(v) => setOpenDraft({ ...openDraft, kind: v })} />}</Field>
          <Field id="op-target" label="Target kind">{(id) => <Sel id={id} value={openDraft.targetKind} options={RETENTION_TARGET_KINDS} onChange={(v) => setOpenDraft({ ...openDraft, targetKind: v })} />}</Field>
          <Field id="op-profile" label="Retention profile (optional)">{(id) => <Txt id={id} value={openDraft.retentionProfile} onChange={(v) => setOpenDraft({ ...openDraft, retentionProfile: v })} />}</Field>
        </div>
        {openDraft.targetKind === 'evidence' ? (
          <div style={rowStyle}>
            <Field id="op-manifest" label={takesObjectSet(openDraft.kind) ? 'Manifest id (or a source id, or manifest ids below)' : 'Manifest id (one of the two)'}>{(id) => <Txt id={id} value={openDraft.manifestId} onChange={(v) => setOpenDraft({ ...openDraft, manifestId: v })} />}</Field>
            <Field id="op-source" label={takesObjectSet(openDraft.kind) ? 'Source id (or a manifest id, or manifest ids below)' : 'Source id (one of the two)'}>{(id) => <Txt id={id} value={openDraft.sourceId} onChange={(v) => setOpenDraft({ ...openDraft, sourceId: v })} />}</Field>
            {takesObjectSet(openDraft.kind) && (
              <Field id="op-manifest-ids" label="Manifest ids (a chosen object set — an archive's, a restore's or a customer export's; one id per line, 1 to 200)">{(id) => <textarea id={id} style={{ ...wide, minBlockSize: '6rem' }} value={openDraft.manifestIds} onChange={(e) => setOpenDraft({ ...openDraft, manifestIds: e.target.value })} />}</Field>
            )}
            {openDraft.kind === 'customer_export' && (
              <>
                <Field id="op-ceiling" label="Classification ceiling (the redaction gate: objects above it are excluded)">{(id) => <Sel id={id} value={openDraft.classificationCeiling} options={RETENTION_CLASSIFICATIONS} onChange={(v) => setOpenDraft({ ...openDraft, classificationCeiling: v })} />}</Field>
                <Field id="op-expires" label="Expires after (optional, e.g. 30 days; 1 hour to 1 year — the package's download and delivery are refused after)">{(id) => <Txt id={id} value={openDraft.expiresAfter} onChange={(v) => setOpenDraft({ ...openDraft, expiresAfter: v })} />}</Field>
              </>
            )}
          </div>
        ) : (
          <div style={rowStyle}>
            <Field id="op-partition" label="Partition key (this tenant's, from the session's scope)">{(id) => <Txt id={id} value={openDraft.partitionKey} onChange={(v) => setOpenDraft({ ...openDraft, partitionKey: v })} />}</Field>
            <Field id="op-toseq" label="To sequence (the floor moves to it; 2 or more)">{(id) => <Txt id={id} type="number" value={openDraft.toSeq} onChange={(v) => setOpenDraft({ ...openDraft, toSeq: v })} />}</Field>
          </div>
        )}
        <div style={controlRow}>
          <GovernedButton label="Open action" pendingLabel="opening" disabled={!openOk(openDraft)}
            onRun={async () => {
              await act(setOpened, 'opening', () => retention.openAction(scope, toOpenIntake(openDraft)), (d) => rec(d['action']) as unknown as { actionId: string; kind: string; targetKind: string; state: string });
            }} />
        </div>
        <Problem verb="not opened" problem={opened.problem} />
        {opened.result !== null && (
          <p>
            opened action <Mono>{str(opened.result.actionId)}</Mono> — {str(opened.result.kind)} on {str(opened.result.targetKind)}, state <strong>{str(opened.result.state)}</strong>
            {' '}<button type="button" onClick={() => { if (opened.result !== null) select(opened.result.actionId); }}
              style={{ font: 'inherit', background: 'none', border: 'none', color: 'var(--eye-color-accent-strong)', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>select it</button>
          </p>
        )}
        <Receipt receipt={opened.receipt} />
      </section>
    </>
  );
}
