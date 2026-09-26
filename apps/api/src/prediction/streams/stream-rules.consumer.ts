/**
 * THE STREAM-RULES CONSUMER — CP-6 B28 (0088 §0 declares the kind, its role stream_rule_subscriber and its event ObservationRecorded;
 * §S is its engine). Registered by the prediction module into the graph's dispatcher like the forecast and scenario consumers: its own
 * action (prediction.stream.subscription.apply), its own role, its own identity (graph-change.ts METHOD_REF), at-least-once delivery
 * under the dispatcher's per-item checkpoint, per-domain FIFO.
 *
 * What an ObservationRecorded means for a stream: the admitted evidence version, when its source is the source of a LIVE processor's
 * rule, is READ through the governed retrieval (EvidenceService.retrieve — manifest-resolved, digest-verified, tier-aware — with its
 * custody written by prediction.stream_evidence_custody in this item's transaction: every byte read is in custody), PARSED by the
 * series' registered deterministic parser into (day, value) points — the EVENT TIME is the publisher's day in the bytes — and INGESTED
 * (prediction.ingest_stream_input): the state verified, each point labelled with its lateness and disposition, the watermark moved, the
 * due windows fired, a late input's window revised, a holding predicate's warning candidate submitted through the 0088 §0 intake.
 *
 * Items are `<processor id>/evd:<evidence id>@<version | latest>` — one per live processor of the source. A payload that is not the
 * contract resolves to ONE item, `event:<id>`, left UNRESOLVED (invalid_event → human_review), never applied (the B22 contract check).
 * Evidence the reader cannot be served (withdrawn, governed-deleted, integrity refused, a tier unreachable) is recorded unreadable on
 * the processor — consumed, never guessed at; the offsets reconciliation counts it.
 */
import { HttpException, Injectable, type OnModuleInit } from '@nestjs/common';
import { SubscriptionDispatcherService } from '../../graph/subscriptions/subscription-dispatcher.service.js';
import type { FlatEvent, SubscriptionConsumer } from '../../graph/subscriptions/graph-change.js';
import { EvidenceService } from '../../observation/vault/evidence.service.js';
import type { AcquisitionWrites } from '../../observation/observation.capabilities.js';
import type { Tx } from '../../shared/db.js';
import { parserFor } from '../series/parsers.js';
import { StreamCapability, type StreamSubscriberWrites } from './stream.capabilities.js';

type Row = Record<string, unknown>;
type Scope = { tenantId: string; domainId: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const ITEM = /^([0-9a-f-]{36})\/evd:([0-9a-f-]{36})@(\d+|latest)$/i;

/** ObservationRecorded in its producers' shapes (the admission, the quarantine release, the governed import): the evidence and its source are required. */
function readObservation(p: Row): { evd: string; version: number | null; source: string } | string {
  if (!isUuid(p['evd_object_id'])) return 'evd_object_id is not a uuid';
  const version = p['evd_version'] === undefined || p['evd_version'] === null ? null : Number(p['evd_version']);
  if (version !== null && !(Number.isInteger(version) && version >= 1)) return 'evd_version is not a positive integer';
  if (!isUuid(p['source_id'])) return 'source_id is not a uuid';
  return { evd: p['evd_object_id'], version, source: p['source_id'] };
}

@Injectable()
export class StreamRulesConsumer implements SubscriptionConsumer<StreamSubscriberWrites, FlatEvent>, OnModuleInit {
  readonly kind = 'stream-rules' as const;
  readonly objectType = 'SPR';
  readonly purpose = 'prediction';
  constructor(private readonly dispatcher: SubscriptionDispatcherService, private readonly evidence: EvidenceService) {}
  onModuleInit(): void { this.dispatcher.registerConsumer(this); }
  capability(tx: Tx, action: string): StreamSubscriberWrites { return StreamCapability.subscriber(tx, action); }

  async resolveItems(cap: StreamSubscriberWrites, _scope: Scope, event: FlatEvent): Promise<string[]> {
    const o = readObservation(event.payload);
    if (typeof o === 'string') return [`event:${event.event_id}`];
    const live = (await cap.readProcessors().select(['processor_id'] as never).where('source_id' as never, '=', o.source as never)
      .where('state' as never, '<>', 'retired' as never).execute()) as Row[];
    return live.map((p) => `${String(p['processor_id'])}/evd:${o.evd}@${o.version ?? 'latest'}`).sort();
  }

  async applyItem(cap: StreamSubscriberWrites, scope: Scope, event: FlatEvent, item: string, actor: string, correlationId: string) {
    const o = readObservation(event.payload);
    const m = ITEM.exec(item);
    if (typeof o === 'string' || m === null) {
      const why = typeof o === 'string' ? o : `item ${item} is not <processor>/evd:<id>@<version>`;
      return { effect: 'event.quarantined', effectRef: null, details: { event_type: event.event_type, why },
               unresolved: { reason: `invalid event: ${event.event_type} ${event.event_id} is not the contract (${why}); quarantined for a person`, failureClass: 'invalid_event' as const, disposition: 'human_review' as const } };
    }
    const processorId = m[1] as string; const evdId = m[2] as string;
    const pr = (await cap.readProcessors().selectAll().where('processor_id' as never, '=', processorId as never).executeTakeFirst()) as Row | undefined;
    if (pr === undefined || pr['state'] === 'retired') {
      return { effect: 'stream.processor_retired', effectRef: pr === undefined ? null : processorId,
               details: { processor_id: processorId, note: 'the processor was retired since the event was resolved: nothing is ingested into a retired processor' } };
    }
    const rule = (await cap.readRules().selectAll().where('rule_id' as never, '=', pr['rule_id'] as never).executeTakeFirst()) as Row;
    const series = (await cap.readSeries().selectAll().where('series_key' as never, '=', rule['series_key'] as never).executeTakeFirst()) as Row | undefined;
    // THE EVIDENCE VERSION (the latest when the producer named none).
    let q = cap.readCanonicalObjects().selectAll().where('object_type' as never, '=', 'EVD' as never).where('object_id' as never, '=', evdId as never);
    if (m[3] !== 'latest') q = q.where('object_version' as never, '=', Number(m[3]) as never);
    const evd = (await q.orderBy('object_version' as never, 'desc').limit(1).executeTakeFirst()) as Row | undefined;
    const version = evd === undefined ? (m[3] === 'latest' ? 1 : Number(m[3])) : Number(evd['object_version']);
    const payload = (evd?.['payload'] ?? {}) as Row;
    const isFragment = payload['fragment'] !== null && payload['fragment'] !== undefined && typeof payload['fragment'] === 'object';
    const parentEvdId = isUuid(payload['parent_evd_id']) ? payload['parent_evd_id'] : null;
    const base = { processorId, tenantId: scope.tenantId, domainId: scope.domainId, evdObjectId: evdId, evdVersion: version, isFragment, parentEvdId,
                   contentDigest: typeof payload['content_digest'] === 'string' ? payload['content_digest'] : null, outboxEventId: event.event_id, actor, correlationId };
    const unreadable = async (reason: string) => {
      const r = await cap.ingest({ ...base, rows: [], unreadable: reason });
      return { effect: 'stream.evidence_unreadable', effectRef: processorId, details: { processor_id: processorId, evd_object_id: evdId, evd_version: version, reason, answer: r } };
    };
    if (evd === undefined) return unreadable('no authorized evidence object matches');
    if (series === undefined) return unreadable(`the rule's series ${String(rule['series_key'])} is no longer registered: no parser to read the bytes with`);
    // THE GOVERNED READ: the vault's discipline, its custody written by the stream's own port in this transaction.
    let bytes: Buffer;
    try {
      const got = await this.evidence.retrieve(cap as unknown as AcquisitionWrites, { scope: 'DOMAIN', tenantId: scope.tenantId, domainId: scope.domainId }, `principal:${actor}`, evdId, correlationId,
        { read_for: 'prediction.stream', processor_id: processorId, rule_key: String(rule['rule_key']), rule_version: String(rule['version']), series_key: String(series['series_key']) }, version);
      if (got.integrity === 'unavailable') return unreadable(`degraded (EYE-DEG-001): ${got.degraded.label}`);
      if (got.integrity === 'failed') return unreadable(`refused: ${got.refusal.message}`);
      bytes = Buffer.from(got.base64, 'base64');
    } catch (e) {
      const msg = e instanceof HttpException ? String((e.getResponse() as { message?: string })?.message ?? e.message) : (e as Error).message;
      if (e instanceof HttpException && e.getStatus() < 500) return unreadable(`refused (${e.getStatus()}): ${msg.slice(0, 300)}`);
      throw e;
    }
    // THE EVENT TIME AND THE VALUE, addressed by the series' deterministic parser (the publisher's day; never interpreted).
    const rows = parserFor(String(series['parser_ref']))(bytes, String(series['value_field']), series['selector'] === null ? null : String(series['selector']))
      .map((r) => ({ day: r.date, value: r.value }));
    const r = await cap.ingest({ ...base, rows, unreadable: null });
    const step = (r['step'] ?? null) as Row | null;
    return { effect: 'stream.ingested', effectRef: processorId,
             details: { processor_id: processorId, evd_object_id: evdId, evd_version: version, is_fragment: isFragment, rows: rows.length, recorded: r['recorded'], repeated: r['repeated'],
                        covered: r['covered'], lateness: r['lateness'], disposition: r['disposition'], state: r['state'], watermark: r['watermark'],
                        fired: step?.['fired'] ?? [], revised: step?.['revised'] ?? [], suppressed: step?.['suppressed'] ?? [], owed_submitted: r['owed_submitted'] ?? [] } };
  }
}
