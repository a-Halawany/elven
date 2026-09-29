/**
 * THE COLLABORATION WORKSPACE AND ITS EXTERNAL COLLABORATORS — CP-6 B34 part `workflow` (migration 0090 §W4/§W5; F-P6-14; V8 PR-46-001..003,
 * PR-46-005 "when participants lose access … constrain access, preserve committed work and evidence … route reassignment", CAP-EO-09
 * "purpose-bound discussions, artifacts, tasks, and reviews … external-sharing tests", PER-22 "External collaborator … works within explicit
 * audience, purpose, expiry, and object scope; cannot discover or traverse beyond shared scope").
 *
 * A WORKSPACE has a subject (the decision case it serves), a purpose, a classification ceiling and an owner. Its PARTICIPANTS take part in
 * its threads, artifacts and reviews — and nothing more: participation is never room membership and never approver standing (no approval,
 * commit or room port reads it). Artifacts are classified at or below the ceiling; a member reads those their clearance covers.
 *
 * AN EXTERNAL COLLABORATOR (a partner firm's person) is INVITED in TWO acts (B34-F1, 0091): the workspace's owner REQUESTS the invitation
 * (the grant `requested` — no identity write), and an IDENTITY ADMINISTRATOR PROVISIONS it through the identity authority
 * (collab-identity.service.ts): a DOMAIN principal of affiliation `external` with the one role external_collaborator, bounded by a GRANT —
 * the workspace's purpose, an audience ceiling at or below the workspace's, an expiry at most 30 days out. The invitation goes through the
 * SYNTHETIC invitation mailbox (a local sink: the database keeps the subject and the body's digest; the message itself is held in this
 * process's synthetic sink — no e-mail is sent, a real provider is owner decision D6). It carries a one-time token that is also the
 * invitation credential (argon2id, expiring with the invitation window, issued by the identity ports); ACCEPTING it, signed in with the
 * token, the invitee sets their own password — the identity authority rotates the credential to one that EXPIRES WITH THE GRANT
 * (identity.service.ts refuses it once expired). Every collaboration port checks the LIVE grant (accepted, unexpired, unrevoked, the request's purpose the grant's); the reads
 * here show an external only the workspaces it holds a live grant on, and only the artifacts at or below its audience ceiling
 * (clearance.ts maps the role to the grant's ceiling). When the grant lapses or is revoked, its open tasks are reassigned with reason access_lost
 * and the identity authority revokes its credentials and sessions and bumps its epoch (B34-F1).
 */
import { createHash, randomBytes } from 'node:crypto';
/* B36 (0094 §C3) */ import { newPickupCode, pickupCodeHash, sealMaterial } from './invitation-sealing.js'; /* end B36 */
import { HttpException, Inject, Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';
import { errorBody } from '@eye/contracts';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { clearanceOf, covers, EXTERNAL_ROLE, isExternal } from '../../shared/clearance.js';
import { MIN_PASSWORD_LENGTH } from '../../identity/identity.service.js';
import type { WorkflowReads } from './workflow.capabilities.js';
import { taskOf } from './workflow.service.js';

type Row = Record<string, unknown>;
export const CLASSIFICATIONS = ['public', 'internal', 'confidential', 'restricted'] as const;
export const PARTICIPANT_ROLES = ['contributor', 'reviewer', 'observer'] as const;
export const ARTIFACT_KINDS = ['note', 'document', 'evidence_ref'] as const;
export const VERDICTS = ['endorse', 'endorse_with_conditions', 'concerns', 'object'] as const;
/** B34-F1 (0091): `requested` — the owner's request, awaiting an identity administrator's provisioning. */
export const GRANT_STATES = ['requested', 'invited', 'accepted', 'revoked', 'lapsed'] as const;
/** A grant expires at most this many days after its invitation (the port and the table enforce it too). */
export const MAX_GRANT_DAYS = 30;
/** The invitation window (the one-time credential's life), capped at the grant's expiry. */
export const INVITATION_WINDOW_HOURS = 72;
export const SYNTHETIC_INVITATION_NOTE = 'SYNTHETIC — the invitation is placed in the local invitation mailbox; no e-mail was sent (a real provider is owner decision D6)';
export { EXTERNAL_ROLE };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const iso = (v: unknown): string | null => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const bad = (correlationId: string, m: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, m), 422); };
const text = (p: Row, k: string): string => (typeof p[k] === 'string' ? (p[k] as string).trim() : '');
const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
const rank = (c: string): number => (CLASSIFICATIONS as readonly string[]).indexOf(c);
const uuidOf = (p: Row, k: string, correlationId: string, what: string): string => {
  const v = p[k];
  if (typeof v !== 'string' || !UUID.test(v)) bad(correlationId, `payload.${k} is ${what} (a uuid)`);
  return v as string;
};

export function validateOpenWorkspace(p: Row, correlationId: string): { title: string; subject: Row; purpose: string; ceiling: string } {
  const title = text(p, 'title');
  if (title.length < 3 || title.length > 300) bad(correlationId, 'payload.title is 3–300 characters');
  const subject = p['subject'] as Row | undefined;
  if (subject === undefined || subject === null || typeof subject !== 'object' || typeof subject['kind'] !== 'string' || typeof subject['id'] !== 'string') bad(correlationId, 'payload.subject is {kind, id} — the case the workspace serves');
  const purpose = text(p, 'purpose');
  if (purpose.length < 3 || purpose.length > 100) bad(correlationId, 'payload.purpose names the workspace\'s purpose (3–100 characters) — every external act is made under it');
  const ceiling = text(p, 'classification_ceiling');
  if (!(CLASSIFICATIONS as readonly string[]).includes(ceiling)) bad(correlationId, `payload.classification_ceiling is one of ${CLASSIFICATIONS.join(', ')}`);
  return { title, subject: subject as Row, purpose, ceiling };
}

export function validateParticipant(p: Row, correlationId: string): { principal: string; role: string | null; op: 'add' | 'remove' } {
  const op = p['op'];
  if (op !== 'add' && op !== 'remove') bad(correlationId, 'payload.op is add or remove');
  const role = text(p, 'role');
  if (op === 'add' && !(PARTICIPANT_ROLES as readonly string[]).includes(role)) bad(correlationId, `payload.role is one of ${PARTICIPANT_ROLES.join(', ')}`);
  return { principal: uuidOf(p, 'principal', correlationId, 'the member'), role: op === 'add' ? role : null, op: op as 'add' | 'remove' };
}

export function validateMessage(p: Row, correlationId: string): { threadId: string | null; newThreadTitle: string | null; body: string; bodyDigest: string; mentions: string[] } {
  const body = typeof p['body'] === 'string' ? p['body'] : '';
  if (body.trim().length < 1 || body.length > 8000) bad(correlationId, 'payload.body is 1–8000 characters');
  const thread = p['thread_id'];
  if (thread !== undefined && thread !== null && (typeof thread !== 'string' || !UUID.test(thread))) bad(correlationId, 'payload.thread_id is a uuid');
  const title = text(p, 'thread_title');
  if ((thread === undefined || thread === null) && (title.length < 3 || title.length > 300)) bad(correlationId, 'a new thread has payload.thread_title (3–300 characters)');
  const mentions = p['mentions'] ?? [];
  if (!Array.isArray(mentions) || mentions.length > 20 || mentions.some((m) => typeof m !== 'string' || !UUID.test(m))) bad(correlationId, 'payload.mentions is at most 20 participant ids');
  return { threadId: (thread as string | undefined) ?? null, newThreadTitle: thread === undefined || thread === null ? title : null, body, bodyDigest: sha256(body), mentions: [...new Set(mentions as string[])] };
}

export function validateArtifact(p: Row, correlationId: string): { key: string; title: string; kind: string; classification: string; content: string | null; objectRef: Row | null; contentDigest: string } {
  const key = text(p, 'key');
  if (!/^[a-z0-9][a-z0-9_.-]{1,63}$/.test(key)) bad(correlationId, 'payload.key is the artifact\'s key (lower-case, 2–64 characters); a new version keeps it');
  const title = text(p, 'title');
  if (title.length < 3 || title.length > 300) bad(correlationId, 'payload.title is 3–300 characters');
  const kind = text(p, 'kind');
  if (!(ARTIFACT_KINDS as readonly string[]).includes(kind)) bad(correlationId, `payload.kind is one of ${ARTIFACT_KINDS.join(', ')}`);
  const classification = text(p, 'classification');
  if (!(CLASSIFICATIONS as readonly string[]).includes(classification)) bad(correlationId, `payload.classification is one of ${CLASSIFICATIONS.join(', ')}`);
  if (kind === 'evidence_ref') {
    const ref = p['object_ref'] as Row | undefined;
    if (ref === undefined || ref === null || typeof ref !== 'object' || typeof ref['object_id'] !== 'string' || !UUID.test(ref['object_id'])) bad(correlationId, 'an evidence_ref names payload.object_ref {object_id, version?}');
    const objectRef = { object_id: (ref as Row)['object_id'], ...(typeof (ref as Row)['version'] === 'number' ? { version: (ref as Row)['version'] } : {}) };
    return { key, title, kind, classification, content: null, objectRef, contentDigest: sha256(JSON.stringify(objectRef)) };
  }
  const content = typeof p['content'] === 'string' ? p['content'] : '';
  if (content.trim().length < 1 || content.length > 20000) bad(correlationId, 'payload.content is 1–20000 characters');
  return { key, title, kind, classification, content, objectRef: null, contentDigest: sha256(content) };
}

/** The intake of a review request: the reviewer (a participant), a deadline, the escalation {principal, roles?, max_escalations, extend_minutes} and the request's key. */
export function validateReviewRequest(p: Row, correlationId: string): { reviewer: string; title: string; deadlineAt: string | null; escalation: Row; requestKey: string } {
  const title = text(p, 'title');
  if (title.length < 3 || title.length > 300) bad(correlationId, 'payload.title is 3–300 characters');
  const d = p['deadline_at'];
  if (d !== undefined && d !== null && (typeof d !== 'string' || Number.isNaN(Date.parse(d)))) bad(correlationId, 'payload.deadline_at is an instant (ISO 8601)');
  const e = (p['escalation'] ?? {}) as Row;
  if (typeof e !== 'object' || e === null || Array.isArray(e)) bad(correlationId, 'payload.escalation is {principal, roles?, max_escalations, extend_minutes}');
  const escalation: Row = {};
  if (e['principal'] !== undefined && e['principal'] !== null) { if (typeof e['principal'] !== 'string' || !UUID.test(e['principal'])) bad(correlationId, 'payload.escalation.principal is a member (a uuid)'); escalation['principal'] = e['principal']; }
  if (e['roles'] !== undefined) { if (!Array.isArray(e['roles']) || e['roles'].some((r) => typeof r !== 'string')) bad(correlationId, 'payload.escalation.roles is a list of role codes'); escalation['roles'] = e['roles']; }
  const max = e['max_escalations'] ?? 1;
  if (typeof max !== 'number' || !Number.isInteger(max) || max < 0 || max > 5) bad(correlationId, 'payload.escalation.max_escalations is 0..5');
  const ext = e['extend_minutes'] ?? 1440;
  if (typeof ext !== 'number' || !Number.isInteger(ext) || ext < 1 || ext > 43200) bad(correlationId, 'payload.escalation.extend_minutes is 1..43200');
  const requestKey = text(p, 'request_key');
  if (requestKey.length < 3 || requestKey.length > 120) bad(correlationId, 'payload.request_key is the request\'s idempotency key (3–120 characters)');
  return { reviewer: uuidOf(p, 'reviewer', correlationId, 'the reviewing participant'), title, deadlineAt: d === undefined || d === null ? null : new Date(d as string).toISOString(),
           escalation: { ...escalation, max_escalations: max, extend_minutes: ext }, requestKey };
}

export function validateReview(p: Row, correlationId: string): { taskId: string | null; artifactId: string | null; verdict: string; statement: string } {
  const verdict = text(p, 'verdict');
  if (!(VERDICTS as readonly string[]).includes(verdict)) bad(correlationId, `payload.verdict is one of ${VERDICTS.join(', ')}`);
  const statement = text(p, 'statement');
  if (statement.length < 8 || statement.length > 8000) bad(correlationId, 'payload.statement states the review\'s case (8–8000 characters)');
  const t = p['task_id']; const a = p['artifact_id'];
  if (t !== undefined && t !== null && (typeof t !== 'string' || !UUID.test(t))) bad(correlationId, 'payload.task_id is the review task (a uuid)');
  if (a !== undefined && a !== null && (typeof a !== 'string' || !UUID.test(a))) bad(correlationId, 'payload.artifact_id is a uuid');
  return { taskId: (t as string | undefined) ?? null, artifactId: (a as string | undefined) ?? null, verdict, statement };
}

/** The intake of an invitation: who (a display name, a contact label — SYNTHETIC), the audience ceiling, the expiry (≤ 30 days). */
export function validateInvite(p: Row, correlationId: string, nowMs: number): { displayName: string; contactLabel: string; ceiling: string; expiresAt: string } {
  const displayName = text(p, 'display_name');
  if (displayName.length < 3 || displayName.length > 200) bad(correlationId, 'payload.display_name is 3–200 characters');
  const contactLabel = text(p, 'contact_label');
  if (contactLabel.length < 3 || contactLabel.length > 200) bad(correlationId, 'payload.contact_label names the invitee\'s contact (a SYNTHETIC label; nothing is sent to it)');
  const ceiling = text(p, 'audience_ceiling');
  if (!(CLASSIFICATIONS as readonly string[]).includes(ceiling)) bad(correlationId, `payload.audience_ceiling is one of ${CLASSIFICATIONS.join(', ')}`);
  let expiresAt: string;
  if (typeof p['expires_in_days'] === 'number') {
    const days = p['expires_in_days'];
    if (!Number.isInteger(days) || days < 1 || days > MAX_GRANT_DAYS) bad(correlationId, `payload.expires_in_days is 1..${MAX_GRANT_DAYS}`);
    expiresAt = new Date(nowMs + days * 86_400_000 - 60_000).toISOString();
  } else {
    const v = p['expires_at'];
    if (typeof v !== 'string' || Number.isNaN(Date.parse(v))) bad(correlationId, `payload.expires_at (an instant at most ${MAX_GRANT_DAYS} days out) or payload.expires_in_days`);
    expiresAt = new Date(v as string).toISOString();
  }
  return { displayName, contactLabel, ceiling, expiresAt };
}

export function validateAccept(p: Row, correlationId: string): { token: string; password: string } {
  const token = typeof p['token'] === 'string' ? p['token'] : '';
  if (token.length < 16 || token.length > 200) bad(correlationId, 'payload.token is the invitation token');
  const password = typeof p['password'] === 'string' ? p['password'] : '';
  if (password.length < MIN_PASSWORD_LENGTH || password.length > 200) bad(correlationId, `payload.password is at least ${MIN_PASSWORD_LENGTH} characters`);
  return { token, password };
}

/**
 * What one invitation is made of: the ids, the one-time token (the acceptance material — B36 (t): SEALED under the pickup code, never in
 * the message), its hashes, the PICKUP CODE (the one-time code the synthetic message carries — B36 (t)) and its hash, the sealed material,
 * the message and its digest.
 */
export interface Invitation {
  grantId: string; principalId: string; loginName: string; token: string; tokenHash: string; credentialHash: string; invitationExpiresAt: string;
  mail: { subject: string; body: string; bodyDigest: string };
  /* B36 (0094 §C3) */ pickup: { code: string; codeHash: string; sealed: string; codeExpiresAt: string }; /* end B36 */
}

@Injectable()
export class CollabService {
  /**
   * THE SYNTHETIC INVITATION SINK (this process): the placed messages — their bodies carry the PICKUP CODE (B36 (t)); the token is kept
   * beside them for the TEST control read only (the B34-F1 harness signs the invitee in with it). Nothing leaves the process.
   */
  private readonly sink = new Map<string, { to: string; login: string; subject: string; body: string; token: string; code: string; sealed: string; codeHash: string; codeExpiresAt: string; placedAt: string }>();

  constructor(@Inject(EYE_CONFIG) private readonly cfg: EyeConfig) {}

  /**
   * Builds an invitation: the principal's login name, the token and its two hashes, the PICKUP CODE (B36 (t): random, hashed at rest,
   * expiring with the invitation window) under which the token is SEALED, and the synthetic message — it carries the code and the pickup
   * route, NEVER the token — with its digest.
   */
  async buildInvitation(a: { grantId: string; principalId: string; workspaceTitle: string; purpose: string; expiresAt: string; nowMs: number; inviterLabel: string }): Promise<Invitation> {
    const loginName = `ext-${a.principalId.replace(/-/g, '').slice(-12)}`;
    const token = randomBytes(24).toString('base64url');
    const invitationExpiresAt = new Date(Math.min(a.nowMs + INVITATION_WINDOW_HOURS * 3_600_000, new Date(a.expiresAt).getTime() - 1_000)).toISOString();
    /* B36 (0094 §C3): the pickup code and the sealed acceptance material */
    const code = newPickupCode();
    const codeHash = pickupCodeHash(a.grantId, code);
    const sealed = sealMaterial(a.grantId, code, { login: loginName, token });
    const codeExpiresAt = invitationExpiresAt;
    /* end B36 */
    const subject = `[THE EYE · collaboration] You are invited to review: ${a.workspaceTitle}`.slice(0, 300);
    const body = [
      `You are invited by ${a.inviterLabel} to the collaboration workspace "${a.workspaceTitle}" for the purpose ${a.purpose}.`,
      `Your access ends at ${a.expiresAt}. Before ${invitationExpiresAt}, open the sign-in page with the invitation ${a.grantId} and enter this one-time pickup code:`,
      code,
      `The pickup answers your sign-in material once (as ${loginName}); five wrong codes lock the invitation. Then accept the invitation and set your own password.`,
      'You will see only this workspace and only what its owner shared with your audience; you cannot approve, commit or join a decision room.',
      SYNTHETIC_INVITATION_NOTE,
    ].join('\n');
    return { grantId: a.grantId, principalId: a.principalId, loginName, token, tokenHash: sha256(token), credentialHash: await argon2.hash(token, { type: argon2.argon2id }), invitationExpiresAt,
             mail: { subject, body, bodyDigest: sha256(body) }, pickup: { code, codeHash, sealed, codeExpiresAt } };
  }

  /** Places the invitation in the synthetic sink AFTER its governed write committed (the database keeps the subject and the digest). */
  place(inv: Invitation): void {
    this.sink.set(inv.grantId, { to: inv.principalId, login: inv.loginName, subject: inv.mail.subject, body: inv.mail.body, token: inv.token,
      code: inv.pickup.code, sealed: inv.pickup.sealed, codeHash: inv.pickup.codeHash, codeExpiresAt: inv.pickup.codeExpiresAt, placedAt: new Date().toISOString() });
  }

  /**
   * TEST CONTROL ONLY (in process, never a route): the synthetic message of a grant with the token beside it — the B34-F1 harness signs the
   * invitee in with the token directly. This runtime is local or test (config.ts); a deployment with a real provider (owner decision D6)
   * replaces the sink, not this read.
   */
  syntheticInvitation(grantId: string): { to: string; login: string; subject: string; body: string; token: string; code: string; placedAt: string; runtime: string } | null {
    const m = this.sink.get(grantId);
    return m === undefined ? null : { to: m.to, login: m.login, subject: m.subject, body: m.body, token: m.token, code: m.code, placedAt: m.placedAt, runtime: this.cfg['eye.runtime.env'] };
  }

  /* B36 (0094 §C3): THE MAILBOX as the addressed person reads it — the message (the code inside it), NEVER the token; and the delivery
     material the provisioner re-delivers with. */
  mailboxMessage(grantId: string): { to: string; login: string; subject: string; body: string; placedAt: string; channel: 'demo-mailbox'; synthetic: true; runtime: string } | null {
    const m = this.sink.get(grantId);
    return m === undefined ? null : { to: m.to, login: m.login, subject: m.subject, body: m.body, placedAt: m.placedAt, channel: 'demo-mailbox', synthetic: true, runtime: this.cfg['eye.runtime.env'] };
  }
  deliveryMaterial(grantId: string): { codeHash: string; sealed: string; codeExpiresAt: string } | null {
    const m = this.sink.get(grantId);
    return m === undefined ? null : { codeHash: m.codeHash, sealed: m.sealed, codeExpiresAt: m.codeExpiresAt };
  }
  /* end B36 */

  /** The invitation token's hash the acceptance port compares (B34-F1: the new password is hashed by the identity half, never here). */
  tokenHash(token: string): string { return sha256(token); }

  // ───────────────────────── the reads (executive.collab.read) ─────────────────────────
  /**
   * The caller's view of the domain's workspaces. A MEMBER sees every workspace of the domain; an EXTERNAL collaborator sees only those it
   * holds a LIVE grant on (accepted, unexpired, the request's purpose the grant's) — nothing else is listed, not even by title.
   */
  async workspaces(cap: WorkflowReads, principal: AuthenticatedPrincipal, target: { tenantId: string; domainId: string }, purpose: string | null): Promise<Row> {
    const now = await cap.now();
    const rows = (await cap.readWorkspaces().selectAll().orderBy('opened_at' as never, 'desc').execute()) as Row[];
    const external = isExternal(principal, target);
    const grants = external ? await this.liveGrants(cap, principal.principalId, purpose, now) : [];
    const visible = external ? rows.filter((w) => grants.some((g) => g['workspace_id'] === w['workspace_id'])) : rows;
    const parts = (await cap.readParticipants().selectAll().execute()) as Row[];
    return {
      now, viewer: { affiliation: external ? 'external' : 'member', principal: principal.principalId },
      workspaces: visible.map((w) => ({
        workspace_id: w['workspace_id'], title: w['title'], subject: w['subject'], purpose: w['purpose'], classification_ceiling: w['classification_ceiling'], owner: w['owner_principal_id'],
        state: w['state'], opened_at: iso(w['opened_at']),
        participants: parts.filter((x) => x['workspace_id'] === w['workspace_id'] && (x['removed_at'] === null || x['removed_at'] === undefined)).length,
        ...(external ? { grant: this.grantOf(grants.find((g) => g['workspace_id'] === w['workspace_id']) as Row, now) } : {}),
      })),
    };
  }

  /**
   * One workspace, as the caller may see it: participants, threads with their messages, the artifacts the caller's ceiling covers (an
   * external's is its grant's audience ceiling — an artifact above it is not listed at all; a member's clearance withholds the content of
   * one above it, and says so), reviews, the workspace's tasks (an external sees its own), the grants with their expiry (an external its
   * own) and, for a member, the synthetic invitation mailbox's record.
   */
  async workspace(cap: WorkflowReads, principal: AuthenticatedPrincipal, target: { tenantId: string; domainId: string }, purpose: string | null, workspaceId: string, correlationId: string): Promise<Row> {
    if (!UUID.test(workspaceId)) bad(correlationId, 'the workspace id is a uuid');
    const now = await cap.now();
    const w = ((await cap.readWorkspaces().selectAll().where('workspace_id' as never, '=', workspaceId as never).execute()) as Row[])[0];
    const external = isExternal(principal, target);
    let grant: Row | undefined;
    if (external) {
      const all = (await cap.readGrants().selectAll().where('principal_id' as never, '=', principal.principalId as never).where('workspace_id' as never, '=', workspaceId as never).orderBy('invited_at' as never, 'desc').execute()) as Row[];
      grant = all[0];
      // an external cannot discover a workspace it was never granted: the same answer as a workspace that does not exist
      if (w === undefined || grant === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized workspace matches'), 404);
      const why = this.grantRefusal(grant, purpose, now);
      if (why !== null) throw new HttpException(errorBody('EYE_AUT_001', correlationId, `collaboration rejected (${why}): the grant on this workspace is not live — access is lost`), 403);
    }
    if (w === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized workspace matches'), 404);
    const ceiling = external ? String(grant?.['audience_ceiling']) : String(w['classification_ceiling']);
    const clearance = clearanceOf(principal, target, external ? ceiling : null);
    const parts = (await cap.readParticipants().selectAll().where('workspace_id' as never, '=', workspaceId as never).orderBy('added_at' as never).execute()) as Row[];
    const threads = (await cap.readThreads().selectAll().where('workspace_id' as never, '=', workspaceId as never).orderBy('opened_at' as never).execute()) as Row[];
    const messages = (await cap.readMessages().selectAll().where('workspace_id' as never, '=', workspaceId as never).orderBy('posted_at' as never).execute()) as Row[];
    const artifacts = (await cap.readArtifacts().selectAll().where('workspace_id' as never, '=', workspaceId as never).orderBy('artifact_key' as never).orderBy('version' as never, 'desc').execute()) as Row[];
    const reviews = (await cap.readReviews().selectAll().where('workspace_id' as never, '=', workspaceId as never).orderBy('recorded_at' as never).execute()) as Row[];
    const tasks = ((await cap.readTasks().selectAll().where('kind' as never, 'in', ['collab.review', 'collab.contribute'] as never).orderBy('opened_at' as never).execute()) as Row[])
      .filter((t) => (t['subject'] as Row)['id'] === workspaceId && (!external || t['assignee_principal_id'] === principal.principalId));
    const grants = ((await cap.readGrants().selectAll().where('workspace_id' as never, '=', workspaceId as never).orderBy('invited_at' as never).execute()) as Row[])
      .filter((g) => !external || g['principal_id'] === principal.principalId);
    const mail = external ? [] : (await cap.readInvitationMail().selectAll().orderBy('placed_at' as never).execute()) as Row[];
    const visibleArtifacts = artifacts.filter((a) => !external || rank(String(a['classification'])) <= rank(ceiling));
    return {
      now, viewer: { affiliation: external ? 'external' : 'member', principal: principal.principalId, ceiling, clearance },
      workspace: { workspace_id: w['workspace_id'], title: w['title'], subject: w['subject'], purpose: w['purpose'], classification_ceiling: w['classification_ceiling'], owner: w['owner_principal_id'],
                   state: w['state'], opened_at: iso(w['opened_at']) },
      participants: parts.map((x) => ({ principal: x['principal_id'], role: x['role'], affiliation: x['affiliation'], grant_id: x['grant_id'] ?? null, added_at: iso(x['added_at']),
        removed_at: iso(x['removed_at']), removal_reason: x['removal_reason'] ?? null, standing: 'participation only — never room membership, never approver standing' })),
      threads: threads.map((t) => ({ thread_id: t['thread_id'], title: t['title'], opened_by: t['opened_by'], opened_at: iso(t['opened_at']),
        messages: messages.filter((m) => m['thread_id'] === t['thread_id']).map((m) => ({ message_id: m['message_id'], author: m['author_principal_id'], affiliation: m['author_affiliation'], body: m['body'],
          mentions: m['mentions'], posted_at: iso(m['posted_at']) })) })),
      artifacts: visibleArtifacts.map((a) => {
        const readable = covers(clearance, String(a['classification'])) && rank(String(a['classification'])) <= rank(ceiling);
        return { artifact_id: a['artifact_id'], key: a['artifact_key'], version: a['version'], title: a['title'], kind: a['kind'], classification: a['classification'], content_digest: a['content_digest'],
          added_by: a['added_by'], added_at: iso(a['added_at']), content: readable ? a['content'] ?? null : null, object_ref: readable ? a['object_ref'] ?? null : null,
          withheld: readable ? null : `classified ${String(a['classification'])}; the reader's clearance here is ${clearance}` };
      }),
      reviews: reviews.map((r) => ({ review_id: r['review_id'], reviewer: r['reviewer_principal_id'], affiliation: r['reviewer_affiliation'], verdict: r['verdict'], statement: r['statement'],
        task_id: r['task_id'] ?? null, artifact_id: r['artifact_id'] ?? null, recorded_at: iso(r['recorded_at']) })),
      tasks: await Promise.all(tasks.map(async (t) => ({ ...taskOf(t), /* B36 (0094 §C2) */ waits_on: t['state'] === 'open' || t['state'] === 'escalated' ? await cap.unmetDependencies(String(t['task_id'])) : [] /* end B36 */ }))),
      grants: await Promise.all(grants.map(async (g) => ({ ...this.grantOf(g, now), /* B36 (0094 §C3) */ delivery: external ? null : await cap.invitationDelivery(String(g['grant_id'])) /* end B36 */ }))),
      invitation_mail: mail.filter((m) => grants.some((g) => g['grant_id'] === m['grant_id'])).map((m) => ({ grant_id: m['grant_id'], to: m['recipient_principal_id'], channel: m['channel'], subject: m['subject'],
        body_digest: m['body_digest'], synthetic: m['synthetic_state'] === true, placed_at: iso(m['placed_at']), note: SYNTHETIC_INVITATION_NOTE })),
    };
  }

  private async liveGrants(cap: WorkflowReads, principalId: string, purpose: string | null, now: string): Promise<Row[]> {
    const rows = (await cap.readGrants().selectAll().where('principal_id' as never, '=', principalId as never).execute()) as Row[];
    return rows.filter((g) => this.grantRefusal(g, purpose, now) === null);
  }

  /** Why a grant is not live for this request (null when it is): the port's own reasons, in its words. */
  grantRefusal(g: Row, purpose: string | null, now: string): string | null {
    if (g['state'] === 'revoked' || g['state'] === 'lapsed') return `grant_${String(g['state'])}`;
    if ((iso(g['expires_at']) ?? '') <= now) return 'grant_expired';
    if (g['state'] !== 'accepted') return 'grant_not_accepted';
    if (purpose !== g['purpose']) return 'purpose';
    return null;
  }

  private grantOf(g: Row, now: string): Row {
    const expires = iso(g['expires_at']);
    return {
      grant_id: g['grant_id'], principal: g['principal_id'], purpose: g['purpose'], audience_ceiling: g['audience_ceiling'], state: g['state'], expires_at: expires,
      invitation_expires_at: iso(g['invitation_expires_at']), invited_by: g['invited_by'], invited_at: iso(g['invited_at']), accepted_at: iso(g['accepted_at']), revoked_at: iso(g['revoked_at']),
      revoke_reason: g['revoke_reason'] ?? null, lapsed_at: iso(g['lapsed_at']), contact_label: g['contact_label'],
      /* B34-F1 (0091) */ display_name: g['display_name'] ?? null, login_name: g['login_name'] ?? null, provisioned_by: g['provisioned_by'] ?? null, provisioned_at: iso(g['provisioned_at']),
      live: (g['state'] === 'accepted' || g['state'] === 'invited') && expires !== null && expires > now,
      days_left: expires === null ? null : Math.max(0, Math.round(((new Date(expires).getTime() - new Date(now).getTime()) / 86_400_000) * 10) / 10),
    };
  }
}
