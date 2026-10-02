/**
 * CP-6 B36 §D (0094) — THE PUBLISHING CLIENT (F-P6-13). A publication binds EXACT BYTES to an audience, a classification and channels; the
 * server renders, digests, signs, delivers and records. The helpers below only shape what is sent and word what the record says; nothing
 * here decides whether a publication may be approved, delivered or exported.
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';
type Receipt = { policyDecisionId: string; auditSeq: number };
type Row = Record<string, unknown>;

export const PUBLICATION_STATES = ['drafted', 'approved', 'delivered', 'corrected', 'withdrawn', 'archived'] as const;
export const PUBLICATION_FORMATS = ['html', 'md', 'json'] as const;
/** The formats a request may name: pdf-a is named so the server's answer says it is unsupported (never rendered silently). */
export const REQUESTABLE_FORMATS = ['html', 'md', 'json', 'pdf-a'] as const;
export const PUBLICATION_CHANNELS = ['in_app', 'email', 'teams'] as const;
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export const EXTERNAL_AUDIENCE_KINDS = ['partner', 'regulator', 'press', 'other'] as const;
export const GATE_VERDICTS = ['approved', 'rejected', 'information_requested'] as const;
export const SYNTHETIC_CHANNEL_NOTE = 'email and teams are SYNTHETIC: delivered to a local sink on this machine; no message leaves it (owner decision D6)';

export interface PublicationVersion {
  publication_id: string; version: number; source_kind: 'briefing' | 'report'; source_id: string; source_version: number; source_digest: string; format: string;
  bytes_digest: string; byte_length: number; vault_ref: string; render_method: string; state: string; drafted_by: string; drafted_at: string;
  correction_of: number | null; correction_reason: string | null; changed: Row | null; approved_by: string | null; approved_at: string | null; approval_digest: string | null;
  signature_id: string | null; pub_object_version: number | null; corrected_by_version: number | null; signatures: Row[];
}
export interface PublicationDelivery {
  delivery_id: string; publication_id: string; version: number; recipient_principal_id: string; channel: string; kind: string; state: string; receipt_id: string;
  receipt: Row | null; provider_ref: string | null; error: string | null; synthetic_state: boolean; delivered_by: string; delivered_at: string;
  acknowledged_by: string | null; acknowledged_at: string | null; acknowledgement_note: string | null;
}
export interface ExternalDraft {
  draft_id: string; publication_id: string; version: number; audience_kind: string; audience_name: string; drafted_by: string; gate_state: string; requested_at: string;
  reviewed_by: string | null; reviewed_at: string | null; review_note: string | null; review_digest: string | null; signature_id: string | null; signatures?: Row[];
}
export interface Publication {
  publication_id: string; title: string; audience: { roles?: string[]; recipients?: string[] }; classification: string; channels: string[]; format: string;
  accessibility: { plain_language: boolean; alt_text_present: boolean }; template: string; external: { kind: string; name: string } | null; drafted_by: string; drafted_at: string;
  current_version: number; state: string; withdrawn_by: string | null; withdrawn_at: string | null; withdrawal_reason: string | null; archived_by: string | null; archived_at: string | null; archive_ref: Row | null;
  versions?: PublicationVersion[]; deliveries?: PublicationDelivery[]; external_drafts?: ExternalDraft[]; events?: Row[]; reader?: 'privileged' | 'recipient';
}

export interface DraftForm {
  title: string; sourceKind: 'briefing' | 'report'; sourceId: string; sourceVersion: string; sourceDigest: string; roles: string; recipients: string; classification: string;
  channels: string[]; format: string; plainLanguage: boolean; altTextPresent: boolean; template: string; externalKind: string; externalName: string;
}
/** The draft payload as the server's intake reads it, or the reason it is not one yet (the server re-validates and refuses in its own words). */
export function buildDraft(f: DraftForm): Row | string {
  const title = f.title.trim();
  if (title.length < 4) return 'a title is 4 to 300 characters';
  if (f.sourceKind !== 'briefing' && f.sourceKind !== 'report') return 'the source is a briefing edition or a report of a package version';
  if (!/^[0-9a-f-]{36}$/i.test(f.sourceId.trim())) return 'the source names the briefing id or the package id';
  const sourceVersion = f.sourceKind === 'briefing' ? 1 : Number(f.sourceVersion);
  if (!Number.isInteger(sourceVersion) || sourceVersion < 1) return 'a report names the package version it renders';
  if (!/^[0-9a-f]{64}$/.test(f.sourceDigest.trim())) return 'the snapshot\'s content digest (64 hex characters) is presented as read';
  if (f.format === 'pdf-a') return 'pdf-a is not renderable today (html, md and json are): the server refuses it as unsupported';
  if (!(PUBLICATION_FORMATS as readonly string[]).includes(f.format)) return 'the format is html, md or json';
  if (!(CLASSIFICATIONS as readonly string[]).includes(f.classification)) return 'the classification is public, internal, confidential or restricted';
  const roles = f.roles.split(/[,\s]+/).map((r) => r.trim()).filter((r) => r !== '');
  const recipients = f.recipients.split(/[,\s]+/).map((r) => r.trim()).filter((r) => r !== '');
  if (recipients.some((r) => !/^[0-9a-f-]{36}$/i.test(r))) return 'recipients are principal ids';
  const external = f.externalName.trim() === '' ? null : { kind: f.externalKind, name: f.externalName.trim() };
  if (external !== null && !(EXTERNAL_AUDIENCE_KINDS as readonly string[]).includes(external.kind)) return 'an external audience is a partner, a regulator, the press or other';
  if (external !== null && (f.classification === 'confidential' || f.classification === 'restricted')) return 'an external communication is at most internal';
  if (roles.length === 0 && recipients.length === 0 && external === null) return 'the audience names roles or recipients (or an external audience)';
  const channels = [...new Set(['in_app', ...f.channels])].filter((c) => (PUBLICATION_CHANNELS as readonly string[]).includes(c));
  return { title, sourceKind: f.sourceKind, sourceId: f.sourceId.trim().toLowerCase(), sourceVersion, sourceDigest: f.sourceDigest.trim(), audience: { roles, recipients: recipients.map((r) => r.toLowerCase()) },
           classification: f.classification, channels, format: f.format, accessibility: { plain_language: f.plainLanguage, alt_text_present: f.altTextPresent }, template: f.template.trim() === '' ? 'board-pack@1' : f.template.trim(), external };
}

/** A publication's state in words — glyph and word, never colour alone. */
export function stateLine(p: Pick<Publication, 'state' | 'current_version' | 'withdrawal_reason' | 'external'>): string {
  const ext = p.external === null ? '' : ` · EXTERNAL (${p.external.kind}: ${p.external.name})`;
  switch (p.state) {
    case 'drafted': return `○ DRAFTED — version ${p.current_version} awaits the approve-digest${ext}`;
    case 'approved': return `◐ APPROVED — version ${p.current_version} signed by digest; not yet delivered${ext}`;
    case 'delivered': return `● DELIVERED — version ${p.current_version} with receipts${ext}`;
    case 'corrected': return `◍ CORRECTED — version ${p.current_version} drafted; the prior version reads corrected${ext}`;
    case 'withdrawn': return `✕ WITHDRAWN — ${p.withdrawal_reason ?? 'no reason recorded'}; the bytes are retained${ext}`;
    case 'archived': return `▣ ARCHIVED — versions, receipts and signatures carried under the source's controls${ext}`;
    default: return p.state;
  }
}

/** One delivery in words: the channel, the receipt (the machine proof of placement) and the acknowledgement (the person's act) side by side. */
export function deliveryLine(d: Pick<PublicationDelivery, 'channel' | 'kind' | 'state' | 'synthetic_state' | 'provider_ref' | 'error' | 'acknowledged_at'>): string {
  const what = d.kind === 'publication' ? 'the publication' : d.kind === 'correction_notice' ? 'a CORRECTION notice' : 'a WITHDRAWAL notice';
  const placed = d.state === 'delivered' ? `● placed (receipt ${d.provider_ref ?? 'recorded'})` : `✕ FAILED — ${d.error ?? 'no reason recorded'}`;
  const ack = d.state !== 'delivered' ? '' : d.acknowledged_at === null ? ' · not acknowledged' : ` · acknowledged ${d.acknowledged_at}`;
  return `${d.channel}${d.synthetic_state ? ' (SYNTHETIC sink)' : ''}: ${what} — ${placed}${ack}`;
}

/** The digest shown for confirmation: the first sixteen and the last eight characters, never the whole (the whole is what is sent). */
export function digestShort(d: string | null | undefined): string {
  return typeof d === 'string' && d.length === 64 ? `${d.slice(0, 16)}…${d.slice(-8)}` : '—';
}

/** The acts a reader may offer on a publication in its state (the server decides; this only hides what cannot apply). */
export function actsFor(p: Pick<Publication, 'state' | 'external'>, reviewApproved: boolean): Array<'approve' | 'deliver' | 'correct' | 'withdraw' | 'archive' | 'export' | 'review'> {
  const acts: Array<'approve' | 'deliver' | 'correct' | 'withdraw' | 'archive' | 'export' | 'review'> = [];
  if ((p.state === 'drafted' || p.state === 'corrected') && p.external !== null && !reviewApproved) acts.push('review');
  if (p.state === 'drafted' || p.state === 'corrected') acts.push('approve');
  if (p.state === 'approved' || p.state === 'delivered') acts.push('deliver');
  if (p.state === 'approved' || p.state === 'delivered') acts.push('correct');
  if (p.state !== 'withdrawn' && p.state !== 'archived') acts.push('withdraw');
  if (p.state === 'delivered' || p.state === 'withdrawn') acts.push('archive');
  if (p.state === 'archived') acts.push('export');
  return acts;
}

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/publications`;
async function p<T>(s: Scope, path: string, action: string, payload: Row = {}, objectId: string | null = null): Promise<ApiResult<T>> {
  const read = action.endsWith('.read');
  return call<T>(`${base(s)}${path}`, { scope: 'DOMAIN', tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'PUB', object_id: objectId, purpose_id: 'decision',
    side_effect_class: read ? 'none' : 'reversible', consequence_class: read ? 'C1' : 'C2' }, payload);
}

export const publications = {
  list: (s: Scope) => p<{ publications: Publication[]; receipt: Receipt }>(s, '/list', 'executive.publication.read'),
  get: (s: Scope, id: string) => p<{ publication: Publication; receipt: Receipt }>(s, `/${id}/get`, 'executive.publication.read', {}, id),
  bytes: (s: Scope, id: string, version: number) => p<{ bytes: { format: string; bytes_digest: string; verified: boolean; text: string | null; reason: string | null; byte_length?: number }; receipt: Receipt }>(s, `/${id}/versions/${version}/bytes/get`, 'executive.publication.read', {}, id),
  draft: (s: Scope, payload: Row) => p<{ publication: Row; receipt: Receipt }>(s, '/draft', 'executive.publication.draft', payload),
  approve: (s: Scope, id: string, version: number, digest: string) => p<{ approval: Row; receipt: Receipt }>(s, `/${id}/versions/${version}/approve`, 'executive.publication.approve', { digest }, id),
  deliver: (s: Scope, id: string, version: number) => p<{ delivery: Row; receipt: Receipt }>(s, `/${id}/versions/${version}/deliver`, 'executive.publication.deliver', {}, id),
  acknowledge: (s: Scope, deliveryId: string, note: string) => p<{ acknowledgement: Row; receipt: Receipt }>(s, `/deliveries/${deliveryId}/acknowledge`, 'executive.publication.acknowledge', { note }, deliveryId),
  correct: (s: Scope, id: string, payload: { reason: string; sourceDigest: string; sourceId?: string; sourceVersion?: number }) => p<{ correction: Row; receipt: Receipt }>(s, `/${id}/correct`, 'executive.publication.correct', payload, id),
  withdraw: (s: Scope, id: string, reason: string) => p<{ withdrawal: Row; receipt: Receipt }>(s, `/${id}/withdraw`, 'executive.publication.withdraw', { reason }, id),
  archive: (s: Scope, id: string) => p<{ archive: Row; receipt: Receipt }>(s, `/${id}/archive`, 'executive.publication.archive', {}, id),
  exportGet: (s: Scope, id: string) => p<{ export: Row; receipt: Receipt }>(s, `/${id}/export/get`, 'executive.publication.export', {}, id),
  externalDrafts: (s: Scope) => p<{ external_drafts: ExternalDraft[]; receipt: Receipt }>(s, '/external-drafts/list', 'executive.publication.read'),
  review: (s: Scope, draftId: string, payload: { verdict: string; note: string; digest: string }) => p<{ review: Row; receipt: Receipt }>(s, `/external-drafts/${draftId}/review`, 'executive.external_draft.review', payload, draftId),
};
