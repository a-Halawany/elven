/**
 * THE COMMITMENT TRACKER AND THE GOVERNED EXECUTION HANDOFF — CP-6 B34 part C (0090 §C, F-P6-05).
 *
 * The routes' logic over the tracker's ports (the database decides every state, separation and binding — see the migration's header):
 *
 *   tracker    the cross-package read (CAP-EO-08): every item with its open exceptions, its residual and its transparent severity reasons;
 *              one commitment's detail — items, exceptions, handoffs with their attempts, effects and compensations, closures, the
 *              closure's blockers and THE EXECUTION TIMELINE (V03-T-372)
 *   items      declare (children; resources mirrored CMT → RSC), accept, complete; exceptions raised and decided (an extension or a
 *              waiver proposed by the owner and CO-SIGNED by the reviewer)
 *   gateway    SYNTHETIC execution targets (a real ERP is an owner decision); a handoff DRAFTED by the item's owner and ISSUED by a
 *              holder of execution_authority (C3, human-gated; never the drafter nor the committer); the transport is the B14 egress
 *              (http-client.ts `deliver`: the address resolved and vetted, then the pinned POST verified against the target's declared
 *              trust anchor, the credential by reference on the one hop, no redirect) — its provider `ExecutionEgress`, which a harness
 *              substitutes with the client's own `deliverPinned` on a loopback synthetic ERP and nothing else (the B14 substitution); the
 *              receipt echoes the handoff id, the attempt and the payload digest — the database refuses to call any other answer an effect;
 *              B34-F2 (0091): THE SYNTHETIC LOOPBACK PATH — under the deployment switch eye.execution.synthetic_loopback = on, a target
 *              recorded synthetic whose endpoint host is an IPv4 loopback literal and whose trust anchor is declared is carried over the
 *              client's pinned transport to that literal (no substitution: the product's own path); everything else — and everything
 *              with the switch off — goes through the unchanged production vetting; each attempt records which path carried it
 *   FEX-18     partial effects per line, the residual, compensation with a named owner (accept_residual co-signed), reconciliation
 *   closure    proposed by the owner with deliverables, co-signed by the reviewer → CMT version 2 (status closed) admitted under
 *              decision.commitment.close
 *   the tick   two steps of the ATTENTION TICK (executive.attention.tick): `commitment-deadlines` (order 45: due_soon / overdue once)
 *              and `execution-deliveries` (order 50: the due retries, attempts 2..5); an AFTER-TICK hook publishes the CommitmentChanged
 *              events the two steps recorded, in its own governed write (decision.commitment.signal.publish — the tick's write cannot
 *              enqueue: the outbox is the pipeline's, and every event is the owning write's)
 *
 * The tick registry lives in the executive module, which imports this one: it is resolved from the application container at module
 * start (ModuleRef, strict: false), the stream processor's precedent.
 */
import { HttpException, Inject, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { canonicalHeaderDigest, errorBody, validateHeader, type Envelope } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { AttentionTickRegistry, type AttentionTickContext } from '../../executive/attention/tick.js';
import { deliver, deliverPinned, EgressRefused, type DeliveryRequest, type EgressPolicy, type EgressResult } from '../../observation/connectors/http-client.js';
import { EYE_CONFIG } from '../../config/config.module.js';
import type { EyeConfig } from '../../config/config.js';
import { sha256 } from '../../observation/vault/vault.service.js';
import { DestinationCredentialStore } from '../../retention/export-signing.js';
import type { CommitmentChangeKind } from '../../executive/attention/signal-contracts.js';
import { nextVersionHeader } from '../../graph/strategy/next-version.js';
import { commitmentChangedEvent, commitmentChangeKindOf } from '../commitment-events.js';
import { CommitmentCapability, type AttemptRecorder, type ClosureWrites, type CommitmentReads, type CompensationWrites, type ExecutionTargetWrites,
  type HandoffDraftWrites, type HandoffIssueWrites, type ItemWrites } from './commitment.capabilities.js';

type Row = Record<string, unknown>;
type OutboxRow = { eventType: string; payload: Row };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const COMMITMENT_DEADLINES_STEP = 'commitment-deadlines';
export const EXECUTION_DELIVERIES_STEP = 'execution-deliveries';
/** The execution egress's fixed policy — the B14 delivery's: https only, no redirect, 30 s, an answer of at most 1 MiB. */
const EXECUTION_POLICY: Omit<EgressPolicy, 'hostAllowlist'> = { schemeAllowlist: ['https'], maxRedirects: 0, timeoutMs: 30_000, maxResponseBytes: 1024 * 1024, maxDecompressedBytes: 1024 * 1024 };

const bad = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, message), 422); };
const absent = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_STA_001', correlationId, message), 404); };
const conflict = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_STA_002', correlationId, message), 409); };
const scopeOf = (s: ScopeContext) => ({ tenantId: s.tenantId as string, domainId: s.domainId as string });
const iso = (v: unknown): string | null => {
  if (v === null || v === undefined || v === '') return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
};
const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** An item row (decision.commitment_items) as the port's item answer. */
export const itemAnswerOf = (r: Row): Row => ({
  item_id: r['item_id'], commitment_id: r['commitment_id'], package_id: r['package_id'], parent_item_id: r['parent_item_id'] ?? null, kind: r['kind'], title: r['title'],
  owner: r['owner_principal_id'] ?? r['owner'], reviewer: r['reviewer_principal_id'] ?? r['reviewer'] ?? null, reviewer_basis: r['reviewer_basis'], due_at: iso(r['due_at']), state: r['state'], version: r['version'],
});

/** B34-F2 (0091): which path carried an attempt — recorded on the attempt (egress.transport; the column decision.execution_attempts.transport). */
export type ExecutionTransport = 'synthetic-loopback' | 'production';
export interface ExecutionPath { transport: ExecutionTransport; switch: 'on' | 'off'; pinned: string | null; basis: string }
/** An IPv4 loopback LITERAL (127.0.0.0/8, each octet 0..255) — a name (localhost included) never is: a name is resolved, and resolving is the vetting's. */
export function isLoopbackLiteral(host: string): boolean {
  const m = /^127\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  return m !== null && [m[1], m[2], m[3]].every((o) => Number(o) <= 255);
}
/**
 * B34-F2 (0091) — THE PATH A TARGET'S ATTEMPT TAKES (pure). `synthetic-loopback` only when ALL hold: the deployment switch is on; the
 * target is recorded synthetic; its endpoint is an https URL without userinfo whose host is an IPv4 loopback literal; its trust anchor is
 * declared (the TLS identity is the declared party's, never the deployment's store). Otherwise `production` — the unchanged vetting, which
 * refuses every loopback, private, link-local and reserved address. The basis says why, for the attempt's record.
 */
export function executionPathOf(target: Row, switchOn: boolean): ExecutionPath {
  const sw = switchOn ? 'on' : 'off';
  const production = (basis: string): ExecutionPath => ({ transport: 'production', switch: sw, pinned: null, basis });
  if (!switchOn) return production('the synthetic loopback switch is off');
  if (target['synthetic'] !== true) return production('the target is not recorded synthetic');
  let u: URL;
  try { u = new URL(String(target['endpoint'])); } catch { return production('the endpoint is not a URL'); }
  if (u.protocol !== 'https:' || u.username !== '' || u.password !== '') return production('the endpoint is not an https URL without userinfo');
  if (!isLoopbackLiteral(u.hostname)) return production('the endpoint host is not an IPv4 loopback literal');
  const anchor = target['trust_anchor_pem'];
  if (typeof anchor !== 'string' || anchor.trim() === '') return production('the target declares no trust anchor');
  return { transport: 'synthetic-loopback', switch: sw, pinned: u.hostname, basis: 'a synthetic target on a loopback literal, the switch on, the declared anchor verified' };
}

/**
 * THE EXECUTION EGRESS as a provider (the B14 DeliveryEgress precedent): production is http-client.ts `deliver` (the host allowlist, the
 * address resolved and VETTED — every loopback, private, link-local and reserved address refused — then the pinned POST). The B34 harness
 * that drives the synthetic ERP on a loopback NAME substitutes `deliver` with the client's own `deliverPinned(req, '127.0.0.1')` and nothing
 * else: the TLS verification against the declared anchor, the headers, the credential and the answer's handling stay the product's.
 *
 * B34-F2 (0091): `deliverSyntheticLoopback` is the SUPPORTED synthetic path, not a substitution: the same `deliverPinned`, to the endpoint's
 * own loopback literal, only under the deployment switch; it re-checks its preconditions and refuses (address_not_public) otherwise.
 */
@Injectable()
export class ExecutionEgress {
  constructor(@Inject(EYE_CONFIG) private readonly cfg: EyeConfig) {}
  deliver(req: DeliveryRequest): Promise<EgressResult> { return deliver(req); }
  /** The deployment switch, read at each attempt (the attempt records what it was). */
  syntheticLoopback(): boolean { return this.cfg['eye.execution.synthetic_loopback'] === 'on'; }
  deliverSyntheticLoopback(req: DeliveryRequest, pinned: string): Promise<EgressResult> {
    let host = '';
    try { host = new URL(req.url).hostname; } catch { host = ''; }
    if (!this.syntheticLoopback() || !isLoopbackLiteral(host) || pinned !== host || req.policy.trustAnchorPem === undefined) {
      return Promise.reject(new EgressRefused('address_not_public', 'the synthetic loopback path is for a synthetic target on a loopback literal with a declared anchor, under the switch'));
    }
    return deliverPinned(req, pinned);
  }
}

/** What one attempt's transport came to — the record port classifies it (the receipt's binding is the database's check). */
export interface AttemptTransport { httpStatus: number | null; receipt: Row | null; failureDetail: string | null; egress: Row | null; transport?: ExecutionTransport | null }

@Injectable()
export class CommitmentService implements OnModuleInit {
  private readonly log = new Logger('decision.commitments');
  private readonly credentials = new DestinationCredentialStore();
  constructor(private readonly moduleRef: ModuleRef, private readonly pipeline: PipelineService, private readonly egress: ExecutionEgress) {}

  /** The two tick steps and the after-tick publication (the host never names a section). */
  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: the commitment sweep and the execution retries are not scheduled'); return; }
    registry.register({ name: COMMITMENT_DEADLINES_STEP, order: 45, run: async (c: AttentionTickContext) => this.sweep(c) });
    registry.register({ name: EXECUTION_DELIVERIES_STEP, order: 50, run: async (c: AttentionTickContext) => this.retry(c) });
    registry.registerAfter({
      name: 'commitment-signals',
      run: async (a) => {
        const ids = [COMMITMENT_DEADLINES_STEP, EXECUTION_DELIVERIES_STEP].flatMap((s) => arr(((a.steps[s] ?? {}) as Row)['events']).map((e) => String((e as Row)['event_id'])))
          .filter((id) => UUID.test(id));
        if (ids.length === 0) return { published: 0 };
        return this.publishSignals(a.principal, a.tenantId, a.domainId, ids, a.correlationId);
      },
    });
  }

  // ───────────────────────── the tick ─────────────────────────

  private async sweep(c: AttentionTickContext): Promise<Row> {
    return CommitmentCapability.tick(c.tx, 'executive.attention.tick').sweepDeadlines({ tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId });
  }

  /** The due retries (attempts 2..5), each transported by the product's egress and recorded by the port inside the tick's write. */
  private async retry(c: AttentionTickContext): Promise<Row> {
    const cap = CommitmentCapability.tick(c.tx, 'executive.attention.tick');
    const due = await cap.dueHandoffs({ tenantId: c.tenantId, domainId: c.domainId });
    const attempted: Row[] = []; const events: unknown[] = [];
    for (const d of due) {
      const target = (d['target'] ?? {}) as Row;
      const t = target['state'] === 'active' ? await this.transport(target, d['payload'] as Row, String(d['handoff_id']), Number(d['attempt']), String(d['payload_digest']))
                                             : { httpStatus: null, receipt: null, failureDetail: 'the target is retired', egress: null };
      const r = await this.recordAttempt(cap, { tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId }, String(d['handoff_id']), Number(d['attempt']), t);
      attempted.push({ handoff_id: d['handoff_id'], attempt: d['attempt'], outcome: r['outcome'], state: r['state'], transport: t.transport ?? null });
      events.push(...arr(r['events']));
    }
    return { due: due.length, attempted, events };
  }

  /** The after-tick publication: the recorded events read back under decision.commitment.signal.publish and enqueued as CommitmentChanged@v1. */
  private async publishSignals(principal: AuthenticatedPrincipal, tenantId: string, domainId: string, eventIds: string[], correlationId: string): Promise<Row> {
    const envelope = {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${principal.principalId}`,
      purpose_id: 'decision', action: 'decision.commitment.signal.publish', side_effect_class: 'reversible', consequence_class: 'C2',
      object_type: 'CMI', object_id: null, schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted',
      correlation_id: correlationId, trace_id: 'attention-after-tick',
    } as unknown as Envelope;
    const out = await this.pipeline.write(envelope, principal, { scope: 'DOMAIN' as const, tenantId, domainId, action: 'decision.commitment.signal.publish', objectType: 'CMI', objectId: null },
      CommitmentCapability.signals,
      async (cap) => {
        const rows = await cap.signals({ tenantId, domainId, eventIds });
        const outboxEvents = rows.flatMap((s) => {
          const kind = commitmentChangeKindOf(String(s['event']));
          return kind === null ? [] : [commitmentChangedEvent({ kind, eventId: String(s['event_id']), item: (s['item'] ?? {}) as Row, severity: (s['severity'] ?? null) as 'C2' | 'C3' | null,
            action: 'executive.attention.tick', actor: principal.principalId, ...(iso(s['occurred_at']) === null ? {} : { occurredAt: iso(s['occurred_at']) as string }) })];
        });
        return { result: { published: outboxEvents.length, events: rows.map((s) => ({ event_id: s['event_id'], event: s['event'] })) }, targetType: 'CMI', targetId: null, targetVersion: null, outboxEvents };
      });
    return out.result;
  }

  // ───────────────────────── the transport (the B14 egress discipline) ─────────────────────────

  /** One POST of the handoff to its target: the payload with the attempt and the digest; the answer parsed; nothing thrown — every outcome is recorded. */
  async transport(target: Row, payload: Row, handoffId: string, attempt: number, payloadDigest: string): Promise<AttemptTransport> {
    // B34-F2 (0091): the path first — recorded on every attempt, whatever it came to (egress.transport, the switch, the basis)
    const path = executionPathOf(target, this.egress.syntheticLoopback());
    const via: Row = { transport: path.transport, synthetic_loopback_switch: path.switch, transport_basis: path.basis };
    let url: URL;
    try { url = new URL(String(target['endpoint'])); } catch { return { httpStatus: null, receipt: null, failureDetail: 'the endpoint is not a URL', egress: via, transport: path.transport }; }
    const credentialRef = target['credential_ref'] === null || target['credential_ref'] === undefined ? null : String(target['credential_ref']);
    if (credentialRef !== null && !this.credentials.has(credentialRef)) {
      return { httpStatus: null, receipt: null, failureDetail: `the target names credential ${credentialRef}, and this deployment binds none under that name; nothing left the process`,
               egress: { ...via, credential_unbound: credentialRef }, transport: path.transport };
    }
    const credential = credentialRef === null ? null : this.credentials.resolve(credentialRef);
    const body = Buffer.from(JSON.stringify({ ...payload, attempt, payload_digest: payloadDigest }), 'utf8');
    const anchor = target['trust_anchor_pem'] === null || target['trust_anchor_pem'] === undefined ? null : String(target['trust_anchor_pem']);
    const policy: EgressPolicy = { ...EXECUTION_POLICY, hostAllowlist: [url.hostname.toLowerCase()], ...(anchor === null ? {} : { trustAnchorPem: anchor }) };
    let res: EgressResult;
    try {
      const req: DeliveryRequest = { url: url.toString(), body, contentType: 'application/json', policy,
        headers: { 'x-eye-handoff-id': handoffId, 'x-eye-attempt': String(attempt), 'x-eye-payload-digest': payloadDigest, 'x-eye-synthetic': 'true' },
        ...(credential === null ? {} : { credentials: { authorization: `Bearer ${credential}` } }) };
      res = path.transport === 'synthetic-loopback' ? await this.egress.deliverSyntheticLoopback(req, path.pinned as string) : await this.egress.deliver(req);
    } catch (e) {
      const detail = e instanceof EgressRefused ? `${e.refusalClass}: ${e.message}` : String((e as Error)?.message ?? e);
      return { httpStatus: e instanceof EgressRefused && typeof e.status === 'number' ? e.status : null, receipt: null, failureDetail: detail.slice(0, 300),
               egress: { ...via, refused: e instanceof EgressRefused ? e.refusalClass : null, request_sent: e instanceof EgressRefused ? (e.requestSent ?? null) : null }, transport: path.transport };
    }
    const egress: Row = { ...via, status: res.status, pinned_address: res.pinnedAddress, tls_verified: res.tlsVerified, hops: res.hops, body_digest: sha256(res.body), body_length: res.body.byteLength,
                          request_sent: res.requestSent };
    let parsed: unknown;
    try { parsed = JSON.parse(res.body.toString('utf8')); } catch { parsed = undefined; }
    const receipt = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Row) : null;
    return { httpStatus: res.status, receipt, failureDetail: res.status >= 200 && res.status < 300 ? (receipt === null ? 'the answer is not a JSON object' : null) : `the target answered ${res.status}`, egress,
             transport: path.transport };
  }

  private async recordAttempt(cap: AttemptRecorder, s: { tenantId: string; domainId: string; actor: string; correlationId: string }, handoffId: string, attempt: number, t: AttemptTransport): Promise<Row> {
    return cap.recordAttempt({ ...s, attemptId: newId(), handoffId, attempt, httpStatus: t.httpStatus, failureDetail: t.failureDetail, receipt: t.receipt, egress: t.egress });
  }

  // ───────────────────────── reads ─────────────────────────

  async tracker(cap: CommitmentReads, scope: ScopeContext, at: string | null): Promise<Row> {
    const items = await cap.tracker({ ...scopeOf(scope), at });
    const count = (f: (r: Row) => boolean) => items.filter(f).length;
    return { at: at ?? new Date().toISOString(), items,
      summary: { items: items.length, overdue: count((r) => r['overdue'] === true), exceptions: count((r) => Number(r['open_exceptions'] ?? 0) > 0),
                 with_residual: count((r) => arr(r['residual']).length > 0), retask_required: count((r) => r['state'] === 'retask_required'),
                 commitments: new Set(items.map((r) => String(r['commitment_id']))).size } };
  }

  async commitment(cap: CommitmentReads, scope: ScopeContext, commitmentId: string, at: string | null, correlationId: string): Promise<Row> {
    if (!UUID.test(commitmentId)) absent(correlationId, 'no authorized commitment matches');
    const c = (await cap.readCommitments().selectAll().where('commitment_id' as never, '=', commitmentId as never).executeTakeFirst()) as Row | undefined;
    if (c === undefined) absent(correlationId, 'no authorized commitment matches');
    const items = (await cap.readItems().selectAll().where('commitment_id' as never, '=', commitmentId as never).orderBy('created_at' as never).execute()) as Row[];
    const itemIds = items.map((i) => String(i['item_id']));
    const exceptions = itemIds.length === 0 ? [] : (await cap.readExceptions().selectAll().where('item_id' as never, 'in', itemIds as never).orderBy('raised_at' as never).execute()) as Row[];
    const handoffs = (await cap.readHandoffs().selectAll().where('commitment_id' as never, '=', commitmentId as never).orderBy('drafted_at' as never).execute()) as Row[];
    const hIds = handoffs.map((h) => String(h['handoff_id']));
    const attempts = hIds.length === 0 ? [] : (await cap.readAttempts().select(['attempt_id', 'handoff_id', 'attempt', 'outcome', 'http_status', 'failure_detail', 'receipt', 'by_tick', 'attempted_at', 'transport'] as never)
      .where('handoff_id' as never, 'in', hIds as never).orderBy('attempted_at' as never).execute()) as Row[];
    const effects = hIds.length === 0 ? [] : (await cap.readEffects().selectAll().where('handoff_id' as never, 'in', hIds as never).orderBy('line_key' as never).execute()) as Row[];
    const compensations = hIds.length === 0 ? [] : (await cap.readCompensations().selectAll().where('handoff_id' as never, 'in', hIds as never).orderBy('created_at' as never).execute()) as Row[];
    const closures = (await cap.readClosures().selectAll().where('commitment_id' as never, '=', commitmentId as never).orderBy('proposed_at' as never).execute()) as Row[];
    const timeline = await cap.timeline({ ...scopeOf(scope), commitmentId, at });
    const blockers = await cap.closureBlockers(commitmentId);
    const targets = (await cap.readTargets().select(['target_id', 'target_key', 'label', 'endpoint', 'synthetic', 'state'] as never).execute()) as Row[];
    return {
      commitment: c, items, exceptions, closures, blockers, timeline,
      handoffs: handoffs.map((h) => {
        const id = String(h['handoff_id']);
        const eff = effects.filter((e) => String(e['handoff_id']) === id);
        return { ...h, target: targets.find((t) => String(t['target_id']) === String(h['target_id'])) ?? null, attempts: attempts.filter((a) => String(a['handoff_id']) === id), effects: eff,
                 residual: eff.filter((e) => Number(e['effected_quantity']) < Number(e['requested_quantity'])).map((e) => ({ line_key: e['line_key'], residual: Number(e['requested_quantity']) - Number(e['effected_quantity']) })),
                 compensations: compensations.filter((x) => String(x['handoff_id']) === id) };
      }),
    };
  }

  private async item(cap: CommitmentReads, itemId: string): Promise<Row> {
    const r = (await cap.readItems().selectAll().where('item_id' as never, '=', itemId as never).executeTakeFirst()) as Row | undefined;
    return r === undefined ? { item_id: itemId } : itemAnswerOf(r);
  }
  /** The CommitmentChanged events of a port's answer (its `events` list: {event_id, kind, item_id}). */
  private async eventsOf(cap: CommitmentReads, list: unknown, action: string, actor: string): Promise<OutboxRow[]> {
    const out: OutboxRow[] = [];
    for (const e of arr(list)) {
      const x = e as Row; const kind = commitmentChangeKindOf(String(x['kind']));
      if (kind === null || x['event_id'] === null || x['event_id'] === undefined) continue;
      out.push(commitmentChangedEvent({ kind, eventId: String(x['event_id']), item: await this.item(cap, String(x['item_id'])), action, actor }));
    }
    return out;
  }
  private one(kind: CommitmentChangeKind, eventId: unknown, item: Row, action: string, actor: string): OutboxRow[] {
    return eventId === null || eventId === undefined ? [] : [commitmentChangedEvent({ kind, eventId: String(eventId), item, action, actor })];
  }

  // ───────────────────────── items and exceptions ─────────────────────────

  async declareItem(cap: ItemWrites, scope: ScopeContext, commitmentId: string, p: Row, actor: string, correlationId: string) {
    if (!UUID.test(commitmentId)) absent(correlationId, 'no authorized commitment matches');
    const kind = text(p['kind']); const title = text(p['title']); const owner = text(p['owner']); const reviewer = p['reviewer'] === undefined || p['reviewer'] === null ? null : text(p['reviewer']);
    const dueAt = iso(p['dueAt']);
    if (!['obligation', 'milestone', 'deliverable', 'handoff'].includes(kind)) bad(correlationId, 'commitment item rejected (kind): obligation, milestone, deliverable or handoff');
    if (title.length < 2 || title.length > 256) bad(correlationId, 'commitment item rejected (title): 2 to 256 characters');
    if (!UUID.test(owner)) bad(correlationId, 'commitment item rejected (owner): owner is a principal id');
    if (reviewer !== null && !UUID.test(reviewer)) bad(correlationId, 'commitment item rejected (reviewer): reviewer is a principal id');
    if (dueAt === null) bad(correlationId, 'commitment item rejected (due_at): dueAt is an instant');
    const resourceIds = arr(p['resourceIds']).map(String);
    if (resourceIds.some((r) => !UUID.test(r)) || resourceIds.length > 20) bad(correlationId, 'commitment item rejected (resource): resourceIds are up to 20 RSC ids');
    const parent = p['parentItemId'] === undefined || p['parentItemId'] === null ? null : text(p['parentItemId']);
    if (parent !== null && !UUID.test(parent)) bad(correlationId, 'commitment item rejected (parent): parentItemId is an item id');
    const r = await cap.declareItem({ ...scopeOf(scope), itemId: newId(), commitmentId, parentItemId: parent, kind, title, owner, reviewer, dueAt: dueAt as string, resourceIds,
      deliverables: arr(p['deliverables']), actor, correlationId });
    return { result: r, events: this.one('item.opened', r['event_id'], r, 'decision.commitment.item.declare', actor) };
  }

  async acceptItem(cap: ItemWrites, scope: ScopeContext, itemId: string, p: Row, actor: string, correlationId: string) {
    if (!UUID.test(itemId)) absent(correlationId, 'no authorized item matches');
    const r = await cap.acceptItem({ ...scopeOf(scope), itemId, note: text(p['note']) || null, actor, correlationId });
    return { result: r, events: [] as OutboxRow[] };
  }

  async completeItem(cap: ItemWrites, scope: ScopeContext, itemId: string, p: Row, actor: string, correlationId: string) {
    if (!UUID.test(itemId)) absent(correlationId, 'no authorized item matches');
    const r = await cap.completeItem({ ...scopeOf(scope), itemId, evidence: text(p['evidence']), deliverables: p['deliverables'] === undefined ? null : arr(p['deliverables']), actor, correlationId });
    return { result: r, events: [] as OutboxRow[] };
  }

  async raiseException(cap: ItemWrites, scope: ScopeContext, itemId: string, p: Row, actor: string, correlationId: string) {
    if (!UUID.test(itemId)) absent(correlationId, 'no authorized item matches');
    const r = await cap.raiseException({ ...scopeOf(scope), itemId, kind: text(p['kind']), detail: text(p['detail']), actor, correlationId });
    return { result: r, events: this.one('exception.raised', r['event_id'], await this.item(cap, itemId), 'decision.commitment.exception.raise', actor) };
  }

  async decideException(cap: ItemWrites, scope: ScopeContext, exceptionId: string, p: Row, actor: string, correlationId: string) {
    if (!UUID.test(exceptionId)) absent(correlationId, 'no authorized exception matches');
    const act = text(p['act']);
    if (!['resolve', 'propose_extension', 'propose_waiver', 'cosign', 'reject'].includes(act)) bad(correlationId, 'commitment exception rejected (act): resolve, propose_extension, propose_waiver, cosign or reject');
    const r = await cap.decideException({ ...scopeOf(scope), exceptionId, act, newDueAt: iso(p['newDueAt']), note: text(p['note']), actor, correlationId });
    const events = r['change'] === 'exception.resolved' ? this.one('exception.resolved', r['event_id'], (r['item'] ?? {}) as Row, 'decision.commitment.exception.decide', actor) : [];
    return { result: r, events };
  }

  // ───────────────────────── the gateway ─────────────────────────

  checkAnchor(pem: string, correlationId: string): string {
    const blocks = pem.match(/-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/g) ?? [];
    if (blocks.length === 0 || Buffer.byteLength(pem, 'utf8') > 65536) bad(correlationId, 'execution target rejected (trust_anchor): one or more PEM certificates, at most 64 KiB');
    return `${blocks.map((b) => b.trim()).join('\n')}\n`;
  }

  async declareTarget(cap: ExecutionTargetWrites, scope: ScopeContext, p: Row, actor: string, correlationId: string) {
    const endpoint = text(p['endpoint']);
    let u: URL | null = null;
    try { u = new URL(endpoint); } catch { u = null; }
    if (u === null || u.protocol !== 'https:' || u.username !== '' || u.password !== '') bad(correlationId, 'execution target rejected (endpoint): an https:// URL without userinfo');
    const anchor = text(p['trustAnchorPem']) === '' ? null : this.checkAnchor(String(p['trustAnchorPem']), correlationId);
    const credentialRef = text(p['credentialRef']) === '' ? null : text(p['credentialRef']);
    return cap.declareTarget({ ...scopeOf(scope), targetId: newId(), targetKey: text(p['targetKey']), label: text(p['label']), endpoint, trustAnchorPem: anchor, credentialRef,
      synthetic: p['synthetic'] === true, actor, correlationId });
  }

  async retireTarget(cap: ExecutionTargetWrites, scope: ScopeContext, targetKey: string, p: Row, actor: string, correlationId: string) {
    return cap.retireTarget({ ...scopeOf(scope), targetKey, reason: text(p['reason']), actor, correlationId });
  }

  async draftHandoff(cap: HandoffDraftWrites, scope: ScopeContext, itemId: string, p: Row, actor: string, correlationId: string, handoffId: string) {
    if (!UUID.test(itemId)) absent(correlationId, 'no authorized item matches');
    const lines = arr(p['lines']);
    if (lines.length < 1 || lines.length > 50) bad(correlationId, 'execution handoff rejected (lines): 1 to 50 lines');
    const compensationId = p['compensationId'] === undefined || p['compensationId'] === null ? null : text(p['compensationId']);
    if (compensationId !== null && !UUID.test(compensationId)) bad(correlationId, 'execution handoff rejected (compensation): compensationId is a compensation id');
    return cap.draftHandoff({ ...scopeOf(scope), handoffId, itemId, targetKey: text(p['targetKey']), lines, compensationId, actor, correlationId });
  }

  /** THE ISSUE and its FIRST attempt, in the one C3 write: handoff.issued, and handoff.partial / exception.raised when the answer says so. */
  async issue(cap: HandoffIssueWrites, scope: ScopeContext, handoffId: string, p: Row, actor: string, correlationId: string) {
    if (!UUID.test(handoffId)) absent(correlationId, 'no authorized handoff matches');
    const digest = text(p['payloadDigest']);
    if (!/^[0-9a-f]{64}$/.test(digest)) bad(correlationId, 'execution issue rejected (digest): payloadDigest is the draft\'s sha-256 (64 hex)');
    const issued = await cap.issueHandoff({ ...scopeOf(scope), handoffId, payloadDigest: digest, actor, correlationId });
    const t = await this.transport((issued['target'] ?? {}) as Row, issued['payload'] as Row, handoffId, 1, digest);
    const attempt = await this.recordAttempt(cap, { ...scopeOf(scope), actor, correlationId }, handoffId, 1, t);
    const item = await this.item(cap, String(issued['item_id']));
    const events = [...this.one('handoff.issued', issued['event_id'], item, 'decision.execution.issue', actor), ...(await this.eventsOf(cap, attempt['events'], 'decision.execution.issue', actor))];
    const { target, ...rest } = issued;
    const tgt = target as Row;
    return { result: { ...rest, target: { target_key: tgt['target_key'], endpoint: tgt['endpoint'], synthetic: tgt['synthetic'], trust_anchor_declared: tgt['trust_anchor_pem'] !== null },
                       attempt, transport: t.transport ?? null, egress: t.egress, receipt: t.receipt }, events };
  }

  async assignCompensation(cap: CompensationWrites, scope: ScopeContext, handoffId: string, p: Row, actor: string, correlationId: string) {
    if (!UUID.test(handoffId)) absent(correlationId, 'no authorized handoff matches');
    const dueAt = iso(p['dueAt']);
    if (dueAt === null) bad(correlationId, 'execution compensation rejected (due_at): dueAt is an instant');
    if (!UUID.test(text(p['owner']))) bad(correlationId, 'execution compensation rejected (owner): owner is a principal id');
    const r = await cap.assignCompensation({ ...scopeOf(scope), compensationId: newId(), handoffId, kind: text(p['kind']), owner: text(p['owner']), dueAt: dueAt as string, note: text(p['note']), actor, correlationId });
    return { result: r, events: this.one('compensation.assigned', r['event_id'], await this.item(cap, String(r['item_id'])), 'decision.execution.compensation.assign', actor) };
  }

  async cosignCompensation(cap: CompensationWrites, scope: ScopeContext, compensationId: string, p: Row, actor: string, correlationId: string) {
    if (!UUID.test(compensationId)) absent(correlationId, 'no authorized compensation matches');
    return { result: await cap.cosignCompensation({ ...scopeOf(scope), compensationId, note: text(p['note']), actor, correlationId }), events: [] as OutboxRow[] };
  }

  async reconcile(cap: CompensationWrites, scope: ScopeContext, handoffId: string, actor: string, correlationId: string) {
    if (!UUID.test(handoffId)) absent(correlationId, 'no authorized handoff matches');
    const r = await cap.reconcileHandoff({ ...scopeOf(scope), handoffId, actor, correlationId });
    const resolved = arr(r['exceptions_resolved']);
    return { result: r, events: resolved.length > 0 ? this.one('exception.resolved', r['event_id'], (r['item'] ?? {}) as Row, 'decision.execution.reconcile', actor) : [] };
  }

  // ───────────────────────── closure ─────────────────────────

  async proposeClosure(cap: ClosureWrites, scope: ScopeContext, commitmentId: string, p: Row, actor: string, correlationId: string) {
    if (!UUID.test(commitmentId)) absent(correlationId, 'no authorized commitment matches');
    const r = await cap.proposeClosure({ ...scopeOf(scope), closureId: newId(), commitmentId, deliverables: arr(p['deliverables']), statement: text(p['statement']), actor, correlationId });
    return { result: r, events: this.one('closure.proposed', r['event_id'], await this.item(cap, String(r['item_id'])), 'decision.commitment.closure.propose', actor) };
  }

  /** THE CO-SIGN: CMT version 2 (status closed) admitted under decision.commitment.close, then the port (its checks roll the admission back). */
  async cosignClosure(cap: ClosureWrites, scope: ScopeContext, closureId: string, actor: string, purposeId: string, correlationId: string) {
    if (!UUID.test(closureId)) absent(correlationId, 'no authorized closure matches');
    const c = (await cap.readClosures().selectAll().where('closure_id' as never, '=', closureId as never).executeTakeFirst()) as Row | undefined;
    if (c === undefined) absent(correlationId, 'no authorized closure matches');
    const closure = c as Row;
    if (closure['state'] !== 'proposed') conflict(correlationId, `commitment closure rejected (state): closure ${closureId} is ${String(closure['state'])}`);
    const prev = await cap.canonicalLatest({ objectType: 'CMT', objectId: String(closure['commitment_id']) });
    if (prev === undefined) conflict(correlationId, 'commitment closure rejected (canonical): the commitment has no canonical version readable here');
    const pv = prev as Row;
    const now = new Date().toISOString();
    const header = nextVersionHeader(pv, { actor, methodRef: 'commitment-close@1.0.0', purposeId, correlationId, now, humanRefs: [`principal:${String(closure['proposed_by'])}`] });
    const prevPayload = (pv['payload'] ?? {}) as Row;
    const payload = { ...prevPayload, status: 'closed',
      metrics: { ...((prevPayload['metrics'] ?? {}) as Row), closure: { closure_id: closureId, proposed_by: closure['proposed_by'], cosigned_by: actor, deliverables: closure['deliverables'], statement: closure['statement'] } } };
    const check = validateHeader(header);
    if (!check.ok) bad(correlationId, `commitment closure rejected (header): ${(check.errors ?? []).join('; ')}`);
    const digest = canonicalHeaderDigest(header, payload);
    try { await cap.admitObject(header, payload, digest); } catch (e) {
      if ((e as { code?: string }).code === '23505') conflict(correlationId, 'commitment closure rejected (state): the commitment moved past its version while this co-sign was being written');
      throw e;
    }
    const r = await cap.cosignClosure({ ...scopeOf(scope), closureId, cmtHeaderDigest: digest, actor, correlationId });
    return { result: { ...r, cmt_header_digest: digest } as Row, events: this.one('closure.cosigned', r['event_id'], await this.item(cap, String(r['item_id'])), 'decision.commitment.close', actor), version: Number(header.object_version) };
  }
}
