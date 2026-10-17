/**
 * B80 §CL-F (0118_b80_x_clf; PAT-03) — THE FORM DRAFTS CLIENT: the caller's own versioned drafts of a form (`shell.draft.read`,
 * `shell.draft.save`, `shell.draft.discard`), every response returned verbatim. A draft is never a submission: the form's act is its own
 * governed call with its own receipt. A refusal is shown in the server's words (`form draft rejected (<class>): …`).
 */
import { call, type ApiResult } from './api';
import type { Scope } from './observation';

type Row = Record<string, unknown>;
export interface Receipt { policyDecisionId: string; auditSeq: number }
export interface DraftRead { state: 'none' | 'live' | 'expired' | 'discarded'; read_at: string; form_key: string; subject_key: string;
  draft: (Row & { draft_id: string; version: number; payload: Row | null; payload_digest: string | null; saved_at: string; expires_at: string }) | null;
  versions: Array<{ version: number; kind: string; payload_digest: string | null; saved_at: string; expires_at: string }> }
export interface DraftSaved { draft_id: string; version: number; supersedes: number | null; payload_digest: string; saved_at: string; expires_at: string; unchanged: boolean; submission: false }
export interface DraftListed { draft_id: string; version: number; form_key: string; subject_key: string; summary: string | null; step: number | null; saved_at: string; expires_at: string; state: 'live' | 'expired' }

const base = (s: Scope) => `/v1/tenants/${s.tenantId}/domains/${s.domainId}/shell/drafts`;
const env = (s: Scope, action: string, purpose: string, id: string | null = null) => ({
  scope: 'DOMAIN' as const, tenant_id: s.tenantId, domain_id: s.domainId, action, object_type: 'SDR', object_id: id, purpose_id: purpose,
  side_effect_class: action === 'shell.draft.read' ? 'none' as const : 'reversible' as const, consequence_class: action === 'shell.draft.read' ? 'C1' as const : 'C2' as const,
});

export const drafts = {
  read: (s: Scope, purpose: string, formKey: string, subjectKey = '-'): Promise<ApiResult<{ draft: DraftRead; receipt: Receipt }>> =>
    call(`${base(s)}/read`, env(s, 'shell.draft.read', purpose), { formKey, subjectKey }),
  list: (s: Scope, purpose: string, formKey: string | null = null): Promise<ApiResult<{ drafts: DraftListed[]; receipt: Receipt }>> =>
    call(`${base(s)}/list`, env(s, 'shell.draft.read', purpose), formKey === null ? {} : { formKey }),
  save: (s: Scope, purpose: string, a: { formKey: string; subjectKey?: string; schemaVersion: string; payload: Row; summary: string | null; step: number | null; expectedVersion: number | null; ttlSeconds?: number }):
    Promise<ApiResult<{ draft: DraftSaved; receipt: Receipt }>> => call(`${base(s)}/save`, env(s, 'shell.draft.save', purpose), { subjectKey: '-', ...a }),
  discard: (s: Scope, purpose: string, draftId: string, expectedVersion: number): Promise<ApiResult<{ draft: Row; receipt: Receipt }>> =>
    call(`${base(s)}/${draftId}/discard`, env(s, 'shell.draft.discard', purpose, draftId), { expectedVersion }),
};
