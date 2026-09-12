/**
 * GOVERNED RETENTION (0066 §4; ES-29-004): the durable workflow behind every retention act — scope resolution, holds,
 * approvals, execution with evidence, residual inventory and verification. Nothing here deletes on its own: each state
 * moves by one governed route, and the only destructive effect (superseded evidence bytes) happens inside an executing
 * action, through the observation port that refuses a held manifest, with the tombstone row as its record and the bytes
 * removed only after the transaction that recorded the execution committed.
 *
 * Events: RetentionActionDue (L3-I04) when an action opens — by a person or by the schedule evaluation;
 * DeletionVerified (L3-I05) when an action verifies, carrying the scope digest, the approvals, what executed, what was
 * held, and the residual inventory.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../shared/ids.js';
import { VaultService } from '../observation/vault/vault.service.js';
import type { RetentionReads, RetentionWrites } from './retention.capabilities.js';

/** An execution whose scope changed since the approval (a hold placed): the caller rolls back and pauses the action. */
export class RetentionScopeChanged extends Error { constructor(readonly actionId: string, message: string) { super(message); } }

type Row = Record<string, unknown>;
export const RETENTION_KINDS = ['review', 'deletion', 'archive', 'log_floor', 'customer_export'] as const;
export const RETENTION_TARGETS = ['evidence', 'log_partition'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const bad = (correlationId: string, message: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, message), 422); };

export interface OpenActionIntake { kind: (typeof RETENTION_KINDS)[number]; targetKind: (typeof RETENTION_TARGETS)[number]; selector: Row; retentionProfile: string | null }
export function validateOpenAction(p: Row, correlationId: string): OpenActionIntake {
  const kind = String(p['kind'] ?? '');
  if (!(RETENTION_KINDS as readonly string[]).includes(kind)) bad(correlationId, `kind is one of ${RETENTION_KINDS.join(', ')}`);
  const targetKind = String(p['targetKind'] ?? '');
  if (!(RETENTION_TARGETS as readonly string[]).includes(targetKind)) bad(correlationId, `targetKind is one of ${RETENTION_TARGETS.join(', ')}`);
  const sel = (p['selector'] ?? {}) as Row;
  if (typeof sel !== 'object' || Array.isArray(sel)) bad(correlationId, 'selector is an object');
  if (targetKind === 'evidence') {
    const manifestId = sel['manifestId'] === undefined ? null : String(sel['manifestId']);
    const sourceId = sel['sourceId'] === undefined ? null : String(sel['sourceId']);
    if (manifestId === null && sourceId === null) bad(correlationId, 'an evidence selector names a manifestId or a sourceId (superseded versions of that source)');
    if (manifestId !== null && !UUID.test(manifestId)) bad(correlationId, 'selector.manifestId is an id');
    if (sourceId !== null && !UUID.test(sourceId)) bad(correlationId, 'selector.sourceId is an id');
    return { kind: kind as OpenActionIntake['kind'], targetKind: 'evidence', selector: { ...(manifestId === null ? {} : { manifest_id: manifestId }), ...(sourceId === null ? {} : { source_id: sourceId }) }, retentionProfile: p['retentionProfile'] === undefined ? null : String(p['retentionProfile']) };
  }
  const partitionKey = String(sel['partitionKey'] ?? '');
  const toSeq = Number(sel['toSeq']);
  if (!/^tenant:[0-9a-f-]{36}$/i.test(partitionKey)) bad(correlationId, 'selector.partitionKey is tenant:<tenant id>');
  if (!Number.isInteger(toSeq) || toSeq < 2) bad(correlationId, 'selector.toSeq is the sequence the floor moves to (2 or more)');
  if (kind !== 'log_floor') bad(correlationId, 'the log partition takes the log_floor action');
  return { kind: 'log_floor', targetKind: 'log_partition', selector: { partition_key: partitionKey, to_seq: toSeq }, retentionProfile: p['retentionProfile'] === undefined ? null : String(p['retentionProfile']) };
}

@Injectable()
export class RetentionService {
  constructor(private readonly vault: VaultService) {}

  /** RetentionActionDue@v1 — the event an opened action announces (stable references, no replicas). */
  dueEvent(a: { actionId: string; tenantId: string; domainId: string; kind: string; targetKind: string; selector: Row; retentionProfile: string | null; scheduleId: string | null; dueFrom: string; openedBy: string; action: string }): { eventType: string; payload: Row } {
    return { eventType: 'RetentionActionDue', payload: {
      schema: 'RetentionActionDue', schema_version: 'v1', action_id: a.actionId, kind: a.kind, target_kind: a.targetKind, selector: a.selector,
      retention_profile: a.retentionProfile, schedule_id: a.scheduleId, due_from: a.dueFrom, opened_by: a.openedBy,
      temporal: { known_at: new Date().toISOString() }, cause: { action: a.action, actor: a.openedBy, target_type: 'RTA', target_id: a.actionId },
    } };
  }

  /** EXECUTE: the approved scope, item by item, in dependency order; the record of each; the bytes after the commit. */
  async execute(cap: RetentionWrites, a: { actionId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<{ executed: number; held: number; refused: number; locatorsToRemove: Array<{ ref: string; locator: string }>; floor: Row | null }> {
    const action = ((await cap.readActions().selectAll().where('action_id' as never, '=', a.actionId as never).execute()) as Row[])[0] ?? null;
    if (action === null) throw new HttpException(errorBody('EYE_STA_001', a.correlationId, 'no authorized retention action matches'), 404);
    const kind = String(action['kind']);
    const items = await cap.beginExecution({ actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, actor: a.actor, correlationId: a.correlationId });
    let executed = 0; let held = 0; let refused = 0; const locators: Array<{ ref: string; locator: string }> = []; let floor: Row | null = null; const refusals: string[] = [];
    for (const item of items) {
      const itemKind = String(item['item_kind']); const disposition = String(item['disposition']); const ref = String(item['ref']); const itemId = String(item['item_id']);
      const details = (item['details'] ?? {}) as Row;
      if (disposition === 'held') {
        // The hold is honoured by NOT calling the port; the record says so (and the port itself would refuse).
        held += 1;
        await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'none', outcome: 'skipped', evidence: { reason: 'held by a legal hold', hold_id: item['hold_id'] ?? null }, actor: a.actor, correlationId: a.correlationId });
        continue;
      }
      if (disposition !== 'execute') continue;
      // The action's KIND decides what executing an item means (B9 review): a REVIEW records that the item was reviewed and
      // touches no bytes; a DELETION tombstones; the LOG FLOOR moves the floor. (An archive or a customer export is refused at begin_execution.)
      if (kind === 'review') {
        await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'none', outcome: 'done', evidence: { reviewed: true, note: 'a review action records the review of the item; nothing is removed' }, actor: a.actor, correlationId: a.correlationId });
        executed += 1;
        continue;
      }
      if (itemKind === 'manifest' && kind === 'deletion') {
        const tombstoneId = newId();
        await cap.savepoint('retention_item');
        try {
          const inserted = await cap.tombstoneManifest({ tombstoneId, tenantId: a.tenantId, domainId: a.domainId, manifestId: ref, reason: `retention action ${a.actionId}: superseded evidence past its retention`, correlationId: a.correlationId });
          await cap.releaseSavepoint('retention_item');
          await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'observation.tombstone_blob', outcome: 'done',
                                      evidence: { tombstone_id: inserted ? tombstoneId : null, already_tombstoned: !inserted, locator: details['locator'] ?? null, byte_length_before: details['byte_length'] ?? null }, actor: a.actor, correlationId: a.correlationId });
          executed += 1;
          if (typeof details['locator'] === 'string') locators.push({ ref, locator: details['locator'] });
        } catch (e) {
          // A hold placed since the scope was resolved: the port refuses; the refusal is the record, the action fails closed.
          await cap.rollbackToSavepoint('retention_item');
          const message = (e as Error).message.slice(0, 300);
          await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'observation.tombstone_blob', outcome: 'refused', evidence: { reason: message }, actor: a.actor, correlationId: a.correlationId });
          refused += 1; refusals.push(`${ref}: ${message}`);
        }
      } else if (itemKind === 'outbox_range' && kind === 'log_floor') {
        const partitionKey = ref.split(':').slice(0, 2).join(':'); // the ref is <partition_key>:<from>-<to-1>
        const r = await cap.declareFloor({ partitionKey, toSeq: Number(details['to_seq']), actionId: a.actionId });
        await cap.recordExecution({ executionId: newId(), actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, itemId, port: 'objects.outbox_declare_floor', outcome: 'done', evidence: r, actor: a.actor, correlationId: a.correlationId });
        executed += 1; floor = r;
      }
    }
    // A refusal at execution means the scope changed since the approval (a hold placed): NOTHING of this execution stands —
    // the transaction is rolled back whole by the throw, the controller records the pause, the scope is resolved again (B9 review).
    if (refused > 0) throw new RetentionScopeChanged(a.actionId, `${refused} item(s) refused at execution — a hold placed since the scope was resolved: ${refusals.join('; ').slice(0, 800)}; the scope is resolved again`);
    await cap.finishExecution({ actionId: a.actionId, tenantId: a.tenantId, domainId: a.domainId, outcome: 'executed', reason: null, actor: a.actor, correlationId: a.correlationId });
    return { executed, held, refused, locatorsToRemove: locators, floor };
  }

  /** The bytes of an executed action whose removal the vault refused after the commit (a pending bytes residual): tried again; verification closes what is gone. */
  async retryBytes(cap: RetentionReads, scope: { tenantId: string; domainId: string }, actionId: string): Promise<{ removed: string[]; failed: string[]; pending: number }> {
    const pending = (await cap.readResiduals().selectAll().where('action_id' as never, '=', actionId as never).where('kind' as never, '=', 'bytes_present' as never).where('status' as never, '=', 'pending' as never).execute()) as Row[];
    const items = (await cap.readScopeItems().selectAll().where('action_id' as never, '=', actionId as never).where('item_kind' as never, '=', 'manifest' as never).execute()) as Row[];
    const locators = pending.map((r) => { const it = items.find((i) => String(i['ref']) === String(r['ref'])); return typeof ((it?.['details'] ?? {}) as Row)['locator'] === 'string' ? String(((it?.['details'] ?? {}) as Row)['locator']) : null; }).filter((l): l is string => l !== null);
    const r = await this.removeBytes(scope, locators);
    return { ...r, pending: pending.length };
  }

  /** The bytes go after the record committed (the sweeper's discipline): a failure here leaves the tombstone true and the bytes orphaned for the sweeper. */
  async removeBytes(scope: { tenantId: string; domainId: string }, locators: string[]): Promise<{ removed: string[]; failed: string[] }> {
    const removed: string[] = []; const failed: string[] = [];
    for (const l of locators) {
      try { await this.vault.tombstone('evidence', scope, l); removed.push(l); } catch { failed.push(l); }
    }
    return { removed, failed };
  }

  /** VERIFY: what the vault observes per manifest in scope, handed to the port with the record's own checks. */
  async observeForVerification(cap: RetentionReads, scope: { tenantId: string; domainId: string }, actionId: string): Promise<Row> {
    const items = (await cap.readScopeItems().selectAll().where('action_id' as never, '=', actionId as never).execute()) as Row[];
    const observed: Row = {};
    for (const i of items) {
      if (String(i['item_kind']) !== 'manifest') continue;
      const locator = ((i['details'] ?? {}) as Row)['locator'];
      const present = typeof locator === 'string' ? await this.vault.exists('evidence', scope, locator) : null;
      observed[String(i['ref'])] = { bytes_present: present };
    }
    return observed;
  }

  deletionVerifiedEvent(a: { actionId: string; tenantId: string; domainId: string; verdict: Row; actor: string }): { eventType: string; payload: Row } {
    return { eventType: 'DeletionVerified', payload: {
      schema: 'DeletionVerified', schema_version: 'v1', action_id: a.actionId, kind: a.verdict['kind'], target_kind: a.verdict['target_kind'], selector: a.verdict['selector'],
      scope_digest: a.verdict['scope_digest'], authorized_by: a.verdict['authorized_by'], executed: a.verdict['executed'], held: a.verdict['held'], excluded: a.verdict['excluded'], residual: a.verdict['residual'],
      state: a.verdict['state'], checks: a.verdict['checks'], verified_at: new Date().toISOString(), verified_by: a.actor,
      temporal: { known_at: new Date().toISOString() }, cause: { action: 'retention.action.verify', actor: a.actor, target_type: 'RTA', target_id: a.actionId },
    } };
  }

  async action(cap: RetentionReads, actionId: string): Promise<Row | null> {
    const a = ((await cap.readActions().selectAll().where('action_id' as never, '=', actionId as never).execute()) as Row[])[0];
    if (a === undefined) return null;
    const [events, items, approvals, executions, residuals, verifications] = await Promise.all([
      cap.readActionEvents().selectAll().where('action_id' as never, '=', actionId as never).orderBy('occurred_at' as never).execute(),
      cap.readScopeItems().selectAll().where('action_id' as never, '=', actionId as never).orderBy('dependency_order' as never).execute(),
      cap.readApprovals().selectAll().where('action_id' as never, '=', actionId as never).execute(),
      cap.readExecutions().selectAll().where('action_id' as never, '=', actionId as never).orderBy('executed_at' as never).execute(),
      cap.readResiduals().selectAll().where('action_id' as never, '=', actionId as never).execute(),
      cap.readVerifications().selectAll().where('action_id' as never, '=', actionId as never).orderBy('verified_at' as never).execute(),
    ]) as [Row[], Row[], Row[], Row[], Row[], Row[]];
    return { action: a, events, items, approvals, executions, residuals, verifications };
  }
  async list(cap: RetentionReads, limit = 200): Promise<Row[]> {
    return (await cap.readActions().selectAll().orderBy('opened_at' as never, 'desc').limit(limit).execute()) as Row[];
  }
  async schedules(cap: RetentionReads): Promise<Row[]> {
    return (await cap.readSchedules().selectAll().orderBy('declared_at' as never).execute()) as Row[];
  }
}
