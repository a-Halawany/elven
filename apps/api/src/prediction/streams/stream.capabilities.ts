/**
 * THE STREAM CAPABILITIES — CP-6 B28 (0088 §S, F-P4-11). The prediction capabilities' shape (one implementation, narrow interfaces,
 * every write a SECURITY DEFINER port asserting the caller's own bound action), kept in a file of its own so the stream engine's
 * surface is read in one place:
 *
 *   StreamReads            the rules, processors, windows, inputs, signals, checkpoints, the ledger, the candidates (prediction.read)
 *   StreamRuleWrites       define (prediction.stream.rule.define) and activate (prediction.stream.rule.activate) — a person's acts
 *   StreamProcessorWrites  start, recover, reconcile, retract (…processor.start / .recover / .reconcile, …signal.retract)
 *   StreamSubscriberWrites the stream-rules consumer: the evidence it reads (canonical rows, manifests, tombstones, tiers), the custody of
 *                          that read, the ingest (prediction.stream.subscription.apply)
 *   StreamSweepWrites      the sweep, a step of the attention tick (executive.attention.tick)
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface StreamReads {
  readonly action: string;
  readRules(): any;
  readProcessors(): any;
  readWindows(): any;
  readInputs(): any;
  readSignals(): any;
  readCheckpoints(): any;
  readProcessorEvents(): any;
  readCandidates(): any;
  readSeries(): any;
  readIncompleteRanges(): any;
}

export interface DefineRuleArgs {
  ruleId: string; tenantId: string; domainId: string; ruleKey: string; title: string; seriesKey: string; windowKind: string; windowDays: number;
  slideDays: number | null; windowOrigin: string; allowedLatenessHours: number; watermarkLagHours: number; stallAfterSeconds: number;
  predicate: Record<string, unknown>; consequenceClass: string; responseWindowHours: number | null; checkpointEvery: number; ownerPrincipalId: string;
  actor: string; correlationId: string;
}
export interface StreamRuleWrites extends StreamReads {
  defineRule(a: DefineRuleArgs): Promise<Record<string, unknown>>;
  activateRule(a: { ruleId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
}
export interface StreamProcessorWrites extends StreamReads {
  startProcessor(a: { processorId: string; tenantId: string; domainId: string; ruleId: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  recoverProcessor(a: { processorId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  reconcileProcessor(a: { processorId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  retractSignal(a: { signalId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
}
/** What the consumer's governed read of evidence needs (EvidenceService.retrieve's reads) and the custody of that read. */
export interface StreamEvidenceReads {
  readCanonicalObjects(): any;
  readTombstones(): any;
  readManifests(): any;
  readBlobTiers(): any;
  readSourceContracts(): any;
}
export interface IngestArgs {
  processorId: string; tenantId: string; domainId: string; evdObjectId: string; evdVersion: number; isFragment: boolean; parentEvdId: string | null;
  contentDigest: string | null; rows: Array<{ day: string; value: number }>; unreadable: string | null; outboxEventId: string | null; actor: string; correlationId: string;
}
export interface StreamSubscriberWrites extends StreamReads, StreamEvidenceReads {
  ingest(a: IngestArgs): Promise<Record<string, unknown>>;
  appendCustody(a: {
    eventId: string; tenantId: string; domainId: string; manifestId: string | null; obsObjectId: string | null; evdObjectId: string | null; sourceId: string;
    contractVersion: number; runId: string | null; event: string; actor: string; agentPrincipalId: string | null; agentVersion: string | null; codeDigest: string | null;
    connector: string | null; connectorVersion: string | null; methodRef: string | null; contentDigest: string | null; digestVerified: boolean | null;
    details: Record<string, unknown>; correlationId: string;
  }): Promise<void>;
}
export interface StreamSweepWrites {
  sweep(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
}

class StreamCapabilityImpl implements StreamRuleWrites, StreamProcessorWrites, StreamSubscriberWrites, StreamSweepWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  private from(relation: string): any { return this.#tx.selectFrom(relation as never); }
  private async one(q: ReturnType<typeof sql>): Promise<Record<string, unknown>> {
    const r = await q.execute(this.#tx);
    return ((r.rows[0] as { r?: Record<string, unknown> } | undefined)?.r) ?? {};
  }

  // reads — each names ONE fixed relation; the relation is never a parameter
  readRules(): any { return this.from('prediction.stream_rules'); }
  readProcessors(): any { return this.from('prediction.stream_processors'); }
  readWindows(): any { return this.from('prediction.stream_windows'); }
  readInputs(): any { return this.from('prediction.stream_inputs'); }
  readSignals(): any { return this.from('prediction.stream_signals'); }
  readCheckpoints(): any { return this.from('prediction.stream_checkpoints'); }
  readProcessorEvents(): any { return this.from('prediction.stream_processor_events'); }
  readCandidates(): any { return this.from('prediction.warning_candidates'); }
  readSeries(): any { return this.from('prediction.series_registry'); }
  readIncompleteRanges(): any { return this.from('observation.acquisition_incomplete_ranges'); }
  readCanonicalObjects(): any { return this.from('objects.canonical_objects'); }
  readTombstones(): any { return this.from('observation.blob_tombstones'); }
  readManifests(): any { return this.from('observation.blob_manifests'); }
  readBlobTiers(): any { return this.from('observation.blob_tier_records'); }
  readSourceContracts(): any { return this.from('observation.source_contracts_current'); }

  async defineRule(a: DefineRuleArgs): Promise<Record<string, unknown>> {
    return this.one(sql`select prediction.define_stream_rule(
      ${a.ruleId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.ruleKey}, ${a.title}, ${a.seriesKey}, ${a.windowKind}, ${a.windowDays}::int, ${a.slideDays}::int,
      ${a.windowOrigin}::date, make_interval(hours => ${a.allowedLatenessHours}::int), make_interval(hours => ${a.watermarkLagHours}::int),
      make_interval(secs => ${a.stallAfterSeconds}::double precision), ${JSON.stringify(a.predicate)}::jsonb, ${a.consequenceClass}, ${a.responseWindowHours}::int,
      ${a.checkpointEvery}::int, ${a.ownerPrincipalId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async activateRule(a: { ruleId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Record<string, unknown>> {
    return this.one(sql`select prediction.activate_stream_rule(${a.ruleId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async startProcessor(a: { processorId: string; tenantId: string; domainId: string; ruleId: string; actor: string; correlationId: string }): Promise<Record<string, unknown>> {
    return this.one(sql`select prediction.start_stream_processor(${a.processorId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.ruleId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async recoverProcessor(a: { processorId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Record<string, unknown>> {
    return this.one(sql`select prediction.recover_stream_processor(${a.processorId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async reconcileProcessor(a: { processorId: string; tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Record<string, unknown>> {
    return this.one(sql`select prediction.reconcile_stream_offsets(${a.processorId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async retractSignal(a: { signalId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Record<string, unknown>> {
    return this.one(sql`select prediction.retract_stream_signal(${a.signalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async ingest(a: IngestArgs): Promise<Record<string, unknown>> {
    return this.one(sql`select prediction.ingest_stream_input(${a.processorId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.evdObjectId}::uuid, ${a.evdVersion}::int,
      ${a.isFragment}, ${a.parentEvdId}::uuid, ${a.contentDigest}, ${JSON.stringify(a.rows)}::jsonb, ${a.unreadable}, ${a.outboxEventId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async appendCustody(a: Parameters<StreamSubscriberWrites['appendCustody']>[0]): Promise<void> {
    await sql`select prediction.stream_evidence_custody(${a.eventId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.manifestId}::uuid, ${a.obsObjectId}::uuid,
      ${a.evdObjectId}::uuid, ${a.sourceId}::uuid, ${a.contractVersion}::int, ${a.event}, ${a.actor}, ${a.contentDigest}, ${a.digestVerified},
      ${JSON.stringify(a.details ?? {})}::jsonb, ${a.correlationId}::uuid)`.execute(this.#tx);
  }
  async sweep(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Record<string, unknown>> {
    return this.one(sql`select prediction.sweep_stream_processors(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const StreamCapability = {
  read(tx: Tx, action: string): StreamReads { return new StreamCapabilityImpl(tx, action); },
  rules(tx: Tx, action: string): StreamRuleWrites { return new StreamCapabilityImpl(tx, action); },
  processor(tx: Tx, action: string): StreamProcessorWrites { return new StreamCapabilityImpl(tx, action); },
  subscriber(tx: Tx, action: string): StreamSubscriberWrites { return new StreamCapabilityImpl(tx, action); },
  sweep(tx: Tx, action: string): StreamSweepWrites { return new StreamCapabilityImpl(tx, action); },
};
