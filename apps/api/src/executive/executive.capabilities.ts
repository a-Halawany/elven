/**
 * EXECUTIVE CAPABILITIES — Phase 6 (L9 Executive OS), stage P6-M4.
 *
 * Rooms, membership, cadence, reviews and briefings. The reads a briefing is
 * composed from cross every phase's schema — under RLS, in the composer's own
 * transaction — and are enumerated in the briefing's source list.
 */
import { sql } from 'kysely';
import type { Tx } from '../shared/db.js';
import type { ProjectionName } from '../graph/projections/projection-state.js';

abstract class ExecutiveCore {
  readonly #tx: Tx;
  readonly #action: string;
  protected constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  protected from(relation: string): any {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return this.#tx.selectFrom(relation as never);
  }
  protected async call<T>(q: ReturnType<typeof sql>): Promise<T[]> {
    const r = await q.execute(this.#tx);
    return r.rows as T[];
  }
  /** B21 (D1.5): the graph capability's savepoint (graph.capabilities.ts:46-57, byte for byte) — the shared fallback reader runs its canonical statements under one so a failure leaves the composer's transaction usable (B9-F2's idiom). */
  async withSavepoint<T>(name: string, run: () => Promise<T>): Promise<T> {
    const sp = name.replace(/[^a-z0-9_]/gi, '');
    await sql.raw(`savepoint ${sp}`).execute(this.#tx);
    try {
      const out = await run();
      await sql.raw(`release savepoint ${sp}`).execute(this.#tx);
      return out;
    } catch (e) {
      await sql.raw(`rollback to savepoint ${sp}`).execute(this.#tx);
      throw e;
    }
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ExecutiveReads {
  readonly action: string;
  readRooms(): any;
  readMembers(): any;
  readRoomEvents(): any;
  readBriefings(): any;
  /** 0065 §8: what reached a briefing after its composition. */
  readBriefingEvents(): any;
  readAgents(): any;
  readAgentRuns(): any;
  readPackages(): any;
  readVersions(): any;
  readDissent(): any;
  readApprovals(): any;
  readPackageEvents(): any;
  readCanonicalObjects(): any;
  readRuns(): any;
  readTwins(): any;
  readScenarioEvents(): any;
  readBranches(): any;
  readWarnings(): any;
  readWarningEvents(): any;
  readScenarios(): any;
  readOptions(): any;
  readDependencies(): any;
  readStrategy(): any;
  readSourceContracts(): any;
  readSchedulerEntries(): any;
  readScheduledAttempts(): any;
  readHealthEvents(): any;
  readSourceContractEvents(): any;
  readTombstones(): any;
  readManifests(): any;
  /** 0066 §9 (L10-I04): the typed requests, their log, the delegations, follow-ups and warning suppressions they effected. */
  readRequests(): any;
  readRequestEvents(): any;
  readDelegations(): any;
  readFollowUps(): any;
  readWarningSuppressions(): any;
  /** B10: the memory items a composition may read (their records; the content is a version in objects.canonical_objects). */
  readMemoryItems(): any;
  /** B10-F3: the items' event ledger (a withdrawal's instant). */
  readMemoryItemEvents(): any;
  /**
   * B20 (0080; D12): the six partitions' state with the DERIVED watermark — graph.projection_state() under the established context
   * (briefing.compose is among the actions it admits). The composer reads it to say whether memory_items_current is withdrawn.
   */
  projectionState(): Promise<Array<Record<string, unknown>>>;
  /**
   * B20 (0080): the ONE derivation of a projection from its log, read as the CALLER under the event tables' forced RLS — the
   * graph capability's `expected` copied, so the shared fallback reader (graph/projections/fallback.ts memoryItemsFromLog)
   * composes the memory items from their log for a briefing while the partition is withdrawn.
   */
  expected(projection: ProjectionName, a: { tenantId: string; domainId: string }): Promise<Array<Record<string, unknown>>>;
  /** B21: the fallback reader's pick (ExpectedReads) names withSavepoint — the memory step's canonical statements run under one. */
  withSavepoint<T>(name: string, run: () => Promise<T>): Promise<T>;
  /**
   * B20: the four graph projections beside readStrategy — the fallback reader's structural pick (ExpectedReads) names them, so
   * the executive capability satisfies it without a cast; the briefing composer reads the memory items alone, under RLS as ever.
   */
  readEntities(): any;
  readEdges(): any;
  readResolutions(): any;
  readInvalidations(): any;
  /** B22 (0083): the attention policy's versions, the queue and its log, the source-health markers, the plan selections — and the reads the four consumers resolve their items with. */
  readAttentionPolicies(): any;
  readAttentionItems(): any;
  readAttentionItemEvents(): any;
  readSourceImpactMarkers(): any;
  readPlanSelections(): any;
  readForecasts(): any;
  readReviewCases(): any;
  readSubscriptions(): any;
  /* B23 (0084) attention: the governed reviews and their log (L10-I03). */
  readReviews(): any;
  readReviewEvents(): any;
  /* end B23 attention */
  isMember(a: { roomId: string; principal: string }): Promise<boolean>;
  liveApprovals(a: { packageId: string; version: number }): Promise<Array<{ approval_id: string; approver_principal_id: string; expires_at: string }>>;
  /** The approvals that STOOD at an instant, the approver's eligibility reconstructed then (0049). */
  liveApprovalsAsOf(a: { packageId: string; version: number; at: string }): Promise<Array<{ approval_id: string; approver_principal_id: string; expires_at: string; eligible_by: string }>>;
  now(): Promise<string>;
  workflowOf(a: { packageId: string }): Promise<unknown[]>;
}
export interface AgentWrites extends ExecutiveReads {
  registerAgent(a: { agentId: string; tenantId: string; domainId: string; principalId: string; kind: string; version: string; codeDigest: string; owner: string; escalation: string; budgets: unknown; stopConditions: unknown[]; actor: string; correlationId: string }): Promise<{ agent_id: string; principal_id: string; kind: string }>;
  revokeAgent(a: { agentId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<void>;
  openAgentRun(a: { runId: string; tenantId: string; domainId: string; agentId: string; task: string; triggerKind: string; triggerPrincipal: string | null; triggerRef: string | null; roomId: string | null; packageId: string | null; correlationId: string }): Promise<{ run_id: string; budget: unknown; stop_conditions: unknown[]; escalation_principal_id: string }>;
  closeAgentRun(a: { runId: string; tenantId: string; domainId: string; outcome: string; spent: unknown; stopReason: string | null; refusals: unknown[]; outputs: unknown; correlationId: string }): Promise<{ run_id: string; outcome: string; escalated_to: string | null }>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

/** 0066 §9 (L10-I04 ExecutiveActionRequested): the ports of a typed request. */
export interface RequestWrites extends ExecutiveReads {
  openRequest(a: { requestId: string; tenantId: string; domainId: string; kind: string; requestKey: string; requestDigest: string; subject: Record<string, unknown>; instruction: string; delegate: string | null; owner: string | null; dueAt: string | null; until: string | null; requester: string; correlationId: string }): Promise<Record<string, unknown>>;
  fulfilRequest(a: { requestId: string; tenantId: string; domainId: string; routedRef: string; note: string | null; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  withdrawRequest(a: { requestId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  /** 0067 §2: a routed request whose act was refused — recorded refused with the reason. */
  refuseRequest(a: { requestId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  completeFollowUp(a: { followUpId: string; tenantId: string; domainId: string; note: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
}

/** B22 (0083, L10-I05): the attention policy's publication and the queue's human acts — each port asserts its own bound action. */
export interface AttentionWrites extends ExecutiveReads {
  publishPolicy(a: { policyId: string; tenantId: string; domainId: string; rules: Record<string, unknown>; reason: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  acknowledgeItem(a: { itemId: string; tenantId: string; domainId: string; note: string | null; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  suppressItem(a: { itemId: string; tenantId: string; domainId: string; until: string; reason: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  closeItem(a: { itemId: string; tenantId: string; domainId: string; note: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  escalateDue(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
}
/** B22 (0083): the four consumers' ports (each asserts the subscriber's own action); the ledger ports come from the dispatcher. */
export interface AttentionSubscriberWrites extends ExecutiveReads {
  routeItem(a: { itemId: string; tenantId: string; domainId: string; signalClass: string; subjectKind: string; subjectId: string; causeEventId: string; causeEventType: string; owner: string | null;
                 dims: Record<string, unknown>; title: string; details: Record<string, unknown>; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  reevaluateItem(a: { itemId: string; tenantId: string; domainId: string; causeEventId: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  escalateDue(a: { tenantId: string; domainId: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  notePolicyChanged(a: { packageId: string; tenantId: string; domainId: string; policyId: string; toVersion: number; details: Record<string, unknown>; outboxEventId: string; subscriptionId: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  markSourceImpact(a: { tenantId: string; domainId: string; sourceId: string; healthState: string; reason: string | null; eventId: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  selectPlan(a: { tenantId: string; domainId: string; eventId: string; evdObjectId: string; evdVersion: number | null; sourceId: string | null; mode: string | null; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
}

/* B23 (0084) attention: the governed review's ports (L10-I03) — each asserts its own bound action. */
export interface ReviewWrites extends ExecutiveReads {
  conveneReview(a: { reviewId: string; tenantId: string; domainId: string; subjectKind: string; subjectId: string; subjectVersion: number | null; question: string; chair: string; reviewers: string[];
                     dueAt: string | null; conveneKey: string; requestDigest: string; causeItemId: string | null; roomId: string | null; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
  closeReview(a: { reviewId: string; tenantId: string; domainId: string; disposition: 'concluded' | 'withdrawn'; note: string; actor: string; correlationId: string }): Promise<Record<string, unknown>>;
}
/* end B23 attention */

export interface RoomWrites extends ExecutiveReads {
  openRoom(a: { roomId: string; tenantId: string; domainId: string; packageId: string; title: string; reviewEveryDays: number; actor: string; eventId: string; correlationId: string }): Promise<{ room_id: string; next_review_at: string }>;
  setMembership(a: { roomId: string; tenantId: string; domainId: string; principal: string; role: string; op: 'add' | 'remove'; actor: string; eventId: string; correlationId: string }): Promise<void>;
  setCadence(a: { roomId: string; tenantId: string; domainId: string; everyDays: number; nextReviewAt: string | null; actor: string; eventId: string; correlationId: string }): Promise<{ review_every_days: number; next_review_at: string }>;
  recordReview(a: { roomId: string; tenantId: string; domainId: string; note: string; actor: string; eventId: string; correlationId: string }): Promise<{ reviewed_at: string; next_review_at: string; was_overdue: boolean }>;
}
export interface BriefingWrites extends ExecutiveReads {
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  /** B10 (AU-MEM-0065, the agent's retrieval): a memory item read into a composition is an AUDITED access under the composer's purpose — the ledger row in the composition's own transaction. */
  recordMemoryAccess(a: { itemId: string; tenantId: string; domainId: string; version: number; purpose: string; reader: string; asOf: string | null; correlationId: string }): Promise<string>;
  composeBriefing(a: { briefingId: string; tenantId: string; domainId: string; roomId: string | null; packageId: string | null; composer: string; via: 'human' | 'agent'; agentId: string | null;
                       knownAt: string; prior: string | null; watermark: Record<string, unknown>; sources: unknown[]; items: unknown[]; windows: unknown[]; sourceStates: unknown[]; degraded: boolean;
                       narrative: string | null; narrativeCites: string[]; contentDigest: string; headerDigest: string; memoryAccesses?: Array<{ item_id: string; version: number; access_id: string }>; controls: unknown; eventId: string; correlationId: string;
                       /* B23 (0084) attention: BRF@v2 — the edition's schema version and its attention section (null on a v1 edition). */
                       schemaVersion: 'v1' | 'v2'; attention: Record<string, unknown> | null /* end B23 attention */ }): Promise<{ briefing_id: string; content_digest: string }>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class ExecutiveCapabilityImpl extends ExecutiveCore implements RoomWrites, BriefingWrites, AgentWrites, AttentionWrites, AttentionSubscriberWrites, ReviewWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  readRooms(): any { return this.from('executive.rooms_current'); }
  readMembers(): any { return this.from('executive.room_members'); }
  readRoomEvents(): any { return this.from('executive.room_events'); }
  readBriefings(): any { return this.from('executive.briefings'); }
  readBriefingEvents(): any { return this.from('executive.briefing_events'); }
  readAgents(): any { return this.from('executive.agents'); }
  readAgentRuns(): any { return this.from('executive.agent_runs'); }
  readPackages(): any { return this.from('decision.packages_current'); }
  readVersions(): any { return this.from('decision.package_versions'); }
  readDissent(): any { return this.from('decision.dissent'); }
  readApprovals(): any { return this.from('decision.approvals'); }
  readPackageEvents(): any { return this.from('decision.package_events'); }
  readCanonicalObjects(): any { return this.from('objects.canonical_objects'); }
  readRuns(): any { return this.from('simulation.runs_current'); }
  readTwins(): any { return this.from('twin.twins_current'); }
  readScenarioEvents(): any { return this.from('prediction.scenario_events'); }
  readBranches(): any { return this.from('prediction.branches_current'); }
  readWarnings(): any { return this.from('prediction.warnings_current'); }
  readWarningEvents(): any { return this.from('prediction.warning_events'); }
  readScenarios(): any { return this.from('prediction.scenarios_current'); }
  readOptions(): any { return this.from('decision.options'); }
  readDependencies(): any { return this.from('graph.dependencies'); }
  readStrategy(): any { return this.from('graph.strategy_current'); }
  readSourceContracts(): any { return this.from('observation.source_contracts_current'); }
  readSchedulerEntries(): any { return this.from('observation.scheduler_entries'); }
  readScheduledAttempts(): any { return this.from('observation.scheduled_attempts'); }
  readHealthEvents(): any { return this.from('observation.source_health_events'); }
  readSourceContractEvents(): any { return this.from('observation.source_contract_events'); }
  readTombstones(): any { return this.from('observation.blob_tombstones'); }
  readManifests(): any { return this.from('observation.blob_manifests'); }

  readRequests(): any { return this.from('executive.requests'); }
  readRequestEvents(): any { return this.from('executive.request_events'); }
  readDelegations(): any { return this.from('executive.delegations'); }
  readFollowUps(): any { return this.from('executive.follow_ups'); }
  readWarningSuppressions(): any { return this.from('prediction.warning_suppressions'); }
  readMemoryItems(): any { return this.from('memory.items_current'); }
  readMemoryItemEvents(): any { return this.from('memory.item_events'); }
  readEntities(): any { return this.from('graph.entities_current'); }
  readEdges(): any { return this.from('graph.edges_current'); }
  readResolutions(): any { return this.from('graph.resolutions_current'); }
  readInvalidations(): any { return this.from('graph.invalidations_current'); }
  readAttentionPolicies(): any { return this.from('executive.attention_policies'); }
  readAttentionItems(): any { return this.from('executive.attention_items'); }
  readAttentionItemEvents(): any { return this.from('executive.attention_item_events'); }
  readSourceImpactMarkers(): any { return this.from('observation.source_impact_markers'); }
  readPlanSelections(): any { return this.from('intelligence.plan_selections'); }
  readForecasts(): any { return this.from('prediction.forecasts_current'); }
  readReviewCases(): any { return this.from('intelligence.review_current'); }
  readSubscriptions(): any { return this.from('graph.subscriptions'); }
  /* B23 (0084) attention */
  readReviews(): any { return this.from('executive.reviews'); }
  readReviewEvents(): any { return this.from('executive.review_events'); }
  /* end B23 attention */
  async projectionState(): Promise<Array<Record<string, unknown>>> {
    return this.call<Record<string, unknown>>(sql`select * from graph.projection_state()`);
  }
  async expected(projection: ProjectionName, a: { tenantId: string; domainId: string }): Promise<Array<Record<string, unknown>>> {
    switch (projection) {
      case 'entities_current': return this.call<Record<string, unknown>>(sql`select * from graph.expected_entities(${a.tenantId}::uuid, ${a.domainId}::uuid)`);
      case 'resolutions_current': return this.call<Record<string, unknown>>(sql`select * from graph.expected_resolutions(${a.tenantId}::uuid, ${a.domainId}::uuid)`);
      case 'edges_current': return this.call<Record<string, unknown>>(sql`select * from graph.expected_edges(${a.tenantId}::uuid, ${a.domainId}::uuid)`);
      case 'strategy_current': return this.call<Record<string, unknown>>(sql`select * from graph.expected_strategy(${a.tenantId}::uuid, ${a.domainId}::uuid)`);
      case 'invalidations_current': return this.call<Record<string, unknown>>(sql`select * from graph.expected_invalidations(${a.tenantId}::uuid, ${a.domainId}::uuid)`);
      case 'memory_items_current': return this.call<Record<string, unknown>>(sql`select * from memory.expected_items(${a.tenantId}::uuid, ${a.domainId}::uuid)`);
      default: {
        const never: never = projection;
        throw new Error(`${String(never)} is not a projection of this domain`);
      }
    }
  }
  async recordMemoryAccess(a: { itemId: string; tenantId: string; domainId: string; version: number; purpose: string; reader: string; asOf: string | null; correlationId: string }): Promise<string> {
    const rows = await this.call<{ id: string }>(sql`select memory.record_access(${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.purpose}, ${a.reader}::uuid, ${a.asOf}::timestamptz, ${a.correlationId}::uuid) as id`);
    return String(rows[0]?.id);
  }

  async openRequest(a: Parameters<RequestWrites['openRequest']>[0]): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select executive.open_request(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.kind}, ${a.requestKey}, ${a.requestDigest}, ${JSON.stringify(a.subject)}::jsonb, ${a.instruction},
      ${a.delegate}::uuid, ${a.owner}::uuid, ${a.dueAt}::timestamptz, ${a.until}::timestamptz, ${a.requester}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r; if (r === undefined) throw new Error('open_request returned no row'); return r;
  }
  async fulfilRequest(a: Parameters<RequestWrites['fulfilRequest']>[0]): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select executive.fulfil_request(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.routedRef}::uuid, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r; if (r === undefined) throw new Error('fulfil_request returned no row'); return r;
  }
  async withdrawRequest(a: Parameters<RequestWrites['withdrawRequest']>[0]): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select executive.withdraw_request(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r; if (r === undefined) throw new Error('withdraw_request returned no row'); return r;
  }
  async refuseRequest(a: Parameters<RequestWrites['refuseRequest']>[0]): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select executive.refuse_request(${a.requestId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r; if (r === undefined) throw new Error('refuse_request returned no row'); return r;
  }
  async completeFollowUp(a: Parameters<RequestWrites['completeFollowUp']>[0]): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(sql`select executive.complete_follow_up(${a.followUpId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r; if (r === undefined) throw new Error('complete_follow_up returned no row'); return r;
  }

  private async one(q: ReturnType<typeof sql>, what: string): Promise<Record<string, unknown>> {
    const rows = await this.call<{ r: Record<string, unknown> }>(q);
    const r = rows[0]?.r; if (r === undefined || r === null) throw new Error(`${what} returned no row`); return r;
  }
  async publishPolicy(a: Parameters<AttentionWrites['publishPolicy']>[0]) {
    return this.one(sql`select executive.publish_attention_policy(${a.policyId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${JSON.stringify(a.rules)}::jsonb, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'publish_attention_policy');
  }
  async acknowledgeItem(a: Parameters<AttentionWrites['acknowledgeItem']>[0]) {
    return this.one(sql`select executive.acknowledge_attention_item(${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'acknowledge_attention_item');
  }
  async suppressItem(a: Parameters<AttentionWrites['suppressItem']>[0]) {
    return this.one(sql`select executive.suppress_attention_item(${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.until}::timestamptz, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'suppress_attention_item');
  }
  async closeItem(a: Parameters<AttentionWrites['closeItem']>[0]) {
    return this.one(sql`select executive.close_attention_item(${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'close_attention_item');
  }
  async escalateDue(a: Parameters<AttentionWrites['escalateDue']>[0]) {
    return this.one(sql`select executive.escalate_attention_due(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'escalate_attention_due');
  }
  async routeItem(a: Parameters<AttentionSubscriberWrites['routeItem']>[0]) {
    return this.one(sql`select executive.route_attention_item(${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.signalClass}, ${a.subjectKind}, ${a.subjectId}::uuid, ${a.causeEventId}::uuid, ${a.causeEventType},
      ${a.owner}::uuid, ${JSON.stringify(a.dims)}::jsonb, ${a.title}, ${JSON.stringify(a.details)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'route_attention_item');
  }
  async reevaluateItem(a: Parameters<AttentionSubscriberWrites['reevaluateItem']>[0]) {
    return this.one(sql`select executive.reevaluate_attention_item(${a.itemId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.causeEventId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'reevaluate_attention_item');
  }
  async notePolicyChanged(a: Parameters<AttentionSubscriberWrites['notePolicyChanged']>[0]) {
    return this.one(sql`select decision.note_policy_changed(${a.packageId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.policyId}::uuid, ${a.toVersion}::int, ${JSON.stringify(a.details)}::jsonb, ${a.outboxEventId}::uuid, ${a.subscriptionId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'note_policy_changed');
  }
  async markSourceImpact(a: Parameters<AttentionSubscriberWrites['markSourceImpact']>[0]) {
    return this.one(sql`select observation.mark_source_impact(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.sourceId}::uuid, ${a.healthState}, ${a.reason}, ${a.eventId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'mark_source_impact');
  }
  async selectPlan(a: Parameters<AttentionSubscriberWrites['selectPlan']>[0]) {
    return this.one(sql`select intelligence.select_transformation_plan(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.eventId}::uuid, ${a.evdObjectId}::uuid, ${a.evdVersion}::int, ${a.sourceId}::uuid, ${a.mode}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'select_transformation_plan');
  }
  /* B23 (0084) attention */
  async conveneReview(a: Parameters<ReviewWrites['conveneReview']>[0]) {
    return this.one(sql`select executive.convene_review(${a.reviewId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.subjectKind}, ${a.subjectId}::uuid, ${a.subjectVersion}::int, ${a.question},
      ${a.chair}::uuid, ${a.reviewers}::uuid[], ${a.dueAt}::timestamptz, ${a.conveneKey}, ${a.requestDigest}, ${a.causeItemId}::uuid, ${a.roomId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'convene_review');
  }
  async closeReview(a: Parameters<ReviewWrites['closeReview']>[0]) {
    return this.one(sql`select executive.close_review(${a.reviewId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.disposition}, ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'close_review');
  }
  /* end B23 attention */

  async isMember(a: { roomId: string; principal: string }): Promise<boolean> {
    const rows = await this.call<{ m: boolean }>(sql`select executive.is_member(${a.roomId}::uuid, ${a.principal}::uuid) as m`);
    return rows[0]?.m === true;
  }
  async liveApprovals(a: { packageId: string; version: number }) {
    return this.call<{ approval_id: string; approver_principal_id: string; expires_at: string }>(sql`select la.approval_id::text, la.approver_principal_id::text, decision.iso(a.expires_at) as expires_at
      from decision.live_approvals(${a.packageId}::uuid, ${a.version}::int) la join decision.approvals a on a.approval_id = la.approval_id`);
  }
  async liveApprovalsAsOf(a: { packageId: string; version: number; at: string }) {
    return this.call<{ approval_id: string; approver_principal_id: string; expires_at: string; eligible_by: string }>(sql`select approval_id::text, approver_principal_id::text, decision.iso(expires_at) as expires_at, eligible_by
      from decision.live_approvals_as_of(${a.packageId}::uuid, ${a.version}::int, ${a.at}::timestamptz)`);
  }
  async now(): Promise<string> {
    const rows = await this.call<{ t: string }>(sql`select decision.iso(clock_timestamp()) as t`);
    return String(rows[0]?.t);
  }
  async workflowOf(a: { packageId: string }): Promise<unknown[]> {
    const rows = await this.call<{ w: unknown[] }>(sql`select executive.workflow_of(${a.packageId}::uuid) as w`);
    return (rows[0]?.w ?? []) as unknown[];
  }
  async registerAgent(a: Parameters<AgentWrites['registerAgent']>[0]) {
    const rows = await this.call<{ r: { agent_id: string; principal_id: string; kind: string } }>(sql`select executive.register_agent(${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.principalId}::uuid, ${a.kind}, ${a.version}, ${a.codeDigest},
      ${a.owner}::uuid, ${a.escalation}::uuid, ${JSON.stringify(a.budgets)}::jsonb, ${JSON.stringify(a.stopConditions)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r; if (r === undefined) throw new Error('register_agent returned no row'); return r;
  }
  async revokeAgent(a: Parameters<AgentWrites['revokeAgent']>[0]): Promise<void> {
    await this.call(sql`select executive.revoke_agent(${a.agentId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid)`);
  }
  async openAgentRun(a: Parameters<AgentWrites['openAgentRun']>[0]) {
    const rows = await this.call<{ r: { run_id: string; budget: unknown; stop_conditions: unknown[]; escalation_principal_id: string } }>(sql`select executive.open_agent_run(${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.agentId}::uuid, ${a.task}, ${a.triggerKind}, ${a.triggerPrincipal}::uuid, ${a.triggerRef}, ${a.roomId}::uuid, ${a.packageId}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r; if (r === undefined) throw new Error('open_agent_run returned no row'); return r;
  }
  async closeAgentRun(a: Parameters<AgentWrites['closeAgentRun']>[0]) {
    const rows = await this.call<{ r: { run_id: string; outcome: string; escalated_to: string | null } }>(sql`select executive.close_agent_run(${a.runId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.outcome}, ${JSON.stringify(a.spent)}::jsonb, ${a.stopReason}, ${JSON.stringify(a.refusals)}::jsonb, ${JSON.stringify(a.outputs)}::jsonb, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r; if (r === undefined) throw new Error('close_agent_run returned no row'); return r;
  }

  async openRoom(a: Parameters<RoomWrites['openRoom']>[0]) {
    const rows = await this.call<{ r: { room_id: string; next_review_at: string } }>(sql`select executive.open_room(${a.roomId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageId}::uuid, ${a.title}, ${a.reviewEveryDays}::int, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r; if (r === undefined) throw new Error('open_room returned no row'); return r;
  }
  async setMembership(a: Parameters<RoomWrites['setMembership']>[0]): Promise<void> {
    await this.call(sql`select executive.set_membership(${a.roomId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.principal}::uuid, ${a.role}, ${a.op}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid)`);
  }
  async setCadence(a: Parameters<RoomWrites['setCadence']>[0]) {
    const rows = await this.call<{ r: { review_every_days: number; next_review_at: string } }>(sql`select executive.set_cadence(${a.roomId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.everyDays}::int, ${a.nextReviewAt}::timestamptz, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r; if (r === undefined) throw new Error('set_cadence returned no row'); return r;
  }
  async recordReview(a: Parameters<RoomWrites['recordReview']>[0]) {
    const rows = await this.call<{ r: { reviewed_at: string; next_review_at: string; was_overdue: boolean } }>(sql`select executive.record_review(${a.roomId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.note}, ${a.actor}::uuid, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r; if (r === undefined) throw new Error('record_review returned no row'); return r;
  }
  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const rows = await this.call<{ content_digest: string }>(sql`select content_digest from objects.admit_version(${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`);
    const r = rows[0]; if (r === undefined) throw new Error('admission returned no row'); return { contentDigest: r.content_digest };
  }
  async composeBriefing(a: Parameters<BriefingWrites['composeBriefing']>[0]) {
    const rows = await this.call<{ r: { briefing_id: string; content_digest: string } }>(sql`select executive.compose_briefing(
      ${a.briefingId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.roomId}::uuid, ${a.packageId}::uuid, ${a.composer}::uuid, ${a.via}, ${a.agentId}::uuid, ${a.knownAt}::timestamptz,
      ${a.prior}::uuid, ${JSON.stringify(a.watermark)}::jsonb, ${JSON.stringify(a.sources)}::jsonb, ${JSON.stringify(a.items)}::jsonb, ${JSON.stringify(a.windows)}::jsonb, ${JSON.stringify(a.sourceStates)}::jsonb, ${a.degraded},
      ${a.narrative}, ${JSON.stringify(a.narrativeCites)}::jsonb, ${a.contentDigest}, ${a.headerDigest}, ${JSON.stringify(a.controls ?? {})}::jsonb, ${a.eventId}::uuid, ${a.correlationId}::uuid,
      ${JSON.stringify(a.memoryAccesses ?? [])}::jsonb,
      /* B23 (0084) attention */ ${a.schemaVersion}, ${a.attention === null ? null : JSON.stringify(a.attention)}::jsonb /* end B23 attention */) as r`);
    const r = rows[0]?.r; if (r === undefined) throw new Error('compose_briefing returned no row'); return r;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const ExecutiveCapability = {
  read(tx: Tx, action: string): ExecutiveReads { return new ExecutiveCapabilityImpl(tx, action); },
  room(tx: Tx, action: string): RoomWrites { return new ExecutiveCapabilityImpl(tx, action); },
  briefing(tx: Tx, action: string): BriefingWrites { return new ExecutiveCapabilityImpl(tx, action); },
  agent(tx: Tx, action: string): AgentWrites { return new ExecutiveCapabilityImpl(tx, action); },
  request(tx: Tx, action: string): RequestWrites { return new ExecutiveCapabilityImpl(tx, action); },
  /** B22 (0083): the attention policy and the queue's human acts. */
  attention(tx: Tx, action: string): AttentionWrites { return new ExecutiveCapabilityImpl(tx, action); },
  /** B22 (0083): the four consumers' capability (observations, source-health, proposals, attention) — the subscriber's own action. */
  attentionSubscriber(tx: Tx, action: string): AttentionSubscriberWrites { return new ExecutiveCapabilityImpl(tx, action); },
  /* B23 (0084) attention: the governed review's convening and closure (L10-I03). */
  review(tx: Tx, action: string): ReviewWrites { return new ExecutiveCapabilityImpl(tx, action); },
  /* end B23 attention */
};
