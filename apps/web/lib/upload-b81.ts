/**
 * CP-6 B81 §RE — FILE INTAKE'S UPLOAD MODE PLACED (F-P7-E-05: CMP-040): an operator-upload source's evidence upload on its own page, within
 * the connector's limits (lib/forms-b80.ts UPLOAD_LIMITS — apps/api/src/observation/sources/upload.controller.ts) AND the source contract's
 * declared media types, with the quarantine / rights disclosure shown before anything is sent. Pure functions + the one client call
 * (the EXISTING governed route `POST …/observation/upload`, action `observation.run.trigger` — the bytes inside the digest-bound envelope).
 *
 *   · Before sending: each file accepted or refused with its reason (the connector's limits, then the contract's media types).
 *   · Nothing looks admitted before the server says so: the outcome is the RUN's (admitted / quarantined / no-op, its own reason) — an
 *     uploaded file takes the same admission path as collected data (quarantine, content controls, custody); no gentler path.
 *   · Only an ACTIVE upload contract offers the action; otherwise it is shown disabled with the reason (the server refuses regardless).
 *
 * THREE CLAIMS: construction (here, upload-b81.test.ts, the source page's block); demonstrated operation (the act / walk on SYNTHETIC
 * records); real acceptance (H3) — never claimed.
 */
import { call, type ApiResult } from './api';
import { UPLOAD_LIMITS } from './forms-b80';

const EXT_OF: Readonly<Record<string, string>> = {
  'application/pdf': '.pdf', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx', 'text/csv': '.csv',
};
/** The media types this source's contract expects (security_and_operations.expected_schema.media_types), lower-cased, parameters dropped. */
export function contractMediaTypes(source: Record<string, unknown>): string[] {
  const c = (source['contract'] ?? {}) as Record<string, Record<string, unknown> | undefined>;
  const raw = (c['security_and_operations']?.['expected_schema'] as { media_types?: unknown } | undefined)?.media_types;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string').map((x) => x.split(';')[0]!.trim().toLowerCase()) : [];
}
export interface UploadScope { extensions: string[]; mediaTypes: string[]; outside: string[]; statement: string }
/**
 * The intake's scope: the connector's media types the contract also expects (a contract that names none takes the connector's own set).
 * A type the contract names but the connector cannot take is stated (`outside`) — never silently widened.
 */
export function uploadScope(source: Record<string, unknown>): UploadScope {
  const connector = Object.keys(UPLOAD_LIMITS.mediaTypes);
  const declared = contractMediaTypes(source);
  const both = declared.length === 0 ? connector : connector.filter((m) => declared.includes(m));
  const outside = declared.filter((m) => !connector.includes(m));
  const ext = both.map((m) => EXT_OF[m]!).filter((x) => x !== undefined);
  const names = both.map((m) => UPLOAD_LIMITS.mediaTypes[m]).join(', ') || 'none';
  return {
    extensions: ext, mediaTypes: both, outside,
    statement: declared.length === 0 ? `this contract names no media type; the connector's own set applies (${names})`
      : `this contract expects ${declared.join(', ')}; the intake takes ${names}${outside.length > 0 ? ` (not by this connector: ${outside.join(', ')})` : ''}`,
  };
}
/** The CONTRACT's check, after the connector's (FileIntake): a file whose extension the contract does not expect is refused before sending. */
export function contractCheck(files: ReadonlyArray<{ name: string }>, scope: UploadScope): { accepted: string[]; refused: Array<{ name: string; reason: string }> } {
  const accepted: string[] = []; const refused: Array<{ name: string; reason: string }> = [];
  for (const f of files) {
    const ext = (/\.[a-z0-9]+$/i.exec(f.name)?.[0] ?? '').toLowerCase();
    if (scope.extensions.includes(ext)) accepted.push(f.name);
    else refused.push({ name: f.name, reason: `${ext || 'no extension'} is not a media type this source's contract expects (${scope.extensions.join(', ') || 'none'})` });
  }
  return { accepted, refused };
}
/** May this source take an upload now? (The server decides; the page says why it will refuse.) */
export function uploadAvailability(s: { connectorKind: string; lifecycle: string }): { available: boolean; reason: string | null } {
  if (s.connectorKind !== 'upload') return { available: false, reason: 'this source is collected by its connector, not uploaded' };
  if (s.lifecycle !== 'active') return { available: false, reason: `the contract is ${s.lifecycle}; an upload is taken only by an active contract` };
  return { available: true, reason: null };
}

/** Bytes → base64 (chunked: a large file never builds one giant argument list). */
export function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
/** A DATE (the day it names) as the document time the connector records — the day's start in UTC, never shifted by the viewer's zone. */
export function documentTimeOf(date: string): string | null {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? `${date}T00:00:00Z` : null;
}
export interface UploadFilePayload { filename: string; mediaType: string | null; base64: string; documentTime: string | null }
export function uploadPayload(sourceId: string, contractVersion: number, files: ReadonlyArray<{ name: string; type: string; bytes: Uint8Array }>, documentDate: string):
  { sourceId: string; contractVersion: number; files: UploadFilePayload[] } {
  const documentTime = documentTimeOf(documentDate);
  return { sourceId, contractVersion, files: files.map((f) => ({ filename: f.name, mediaType: f.type === '' ? null : f.type, base64: bytesToBase64(f.bytes), documentTime })) };
}
export interface UploadRun { runId: string; state: string; admitted: number; quarantined: number; noop: number; reason?: string }
/** The run's outcome in words — the server's counts and its own reason; never "uploaded" by inference. */
export function runWords(run: UploadRun | undefined): string {
  if (run === undefined) return 'the upload returned no run — nothing is shown as admitted';
  return `run ${run.state}: ${run.admitted} admitted · ${run.quarantined} quarantined · ${run.noop} no-op${run.reason !== undefined ? ` — ${run.reason}` : ''}`;
}

/** THE CLIENT: the existing governed route (the bytes inside the envelope's payload digest). */
export function uploadEvidence(scope: { tenantId: string; domainId: string }, payload: ReturnType<typeof uploadPayload>): Promise<ApiResult<{ run: UploadRun }>> {
  return call(`/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/observation/upload`, {
    scope: 'DOMAIN', tenant_id: scope.tenantId, domain_id: scope.domainId, action: 'observation.run.trigger', object_type: 'RUN', object_id: null,
    purpose_id: 'observation', side_effect_class: 'reversible',
  }, payload);
}
