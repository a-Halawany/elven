/**
 * EXECUTIVE CAPABILITIES — Phase 6 (L9 Executive OS), stage P6-M4.
 *
 * Rooms, membership, cadence, reviews and briefings. The reads a briefing is
 * composed from cross every phase's schema — under RLS, in the composer's own
 * transaction — and are enumerated in the briefing's source list.
 */
import { sql } from 'kysely';
import type { Tx } from '../shared/db.js';

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
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface ExecutiveReads {
  readonly action: string;
  readRooms(): any;
  readMembers(): any;
  readRoomEvents(): any;
  readBriefings(): any;
  readAgents(): any;
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
  readDependencies(): any;
  readStrategy(): any;
  readSourceContracts(): any;
  readSchedulerEntries(): any;
  readScheduledAttempts(): any;
  readHealthEvents(): any;
  isMember(a: { roomId: string; principal: string }): Promise<boolean>;
  liveApprovals(a: { packageId: string; version: number }): Promise<Array<{ approval_id: string; approver_principal_id: string; expires_at: string }>>;
  now(): Promise<string>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface RoomWrites extends ExecutiveReads {
  openRoom(a: { roomId: string; tenantId: string; domainId: string; packageId: string; title: string; reviewEveryDays: number; actor: string; eventId: string; correlationId: string }): Promise<{ room_id: string; next_review_at: string }>;
  setMembership(a: { roomId: string; tenantId: string; domainId: string; principal: string; role: string; op: 'add' | 'remove'; actor: string; eventId: string; correlationId: string }): Promise<void>;
  setCadence(a: { roomId: string; tenantId: string; domainId: string; everyDays: number; nextReviewAt: string | null; actor: string; eventId: string; correlationId: string }): Promise<{ review_every_days: number; next_review_at: string }>;
  recordReview(a: { roomId: string; tenantId: string; domainId: string; note: string; actor: string; eventId: string; correlationId: string }): Promise<{ reviewed_at: string; next_review_at: string; was_overdue: boolean }>;
}
export interface BriefingWrites extends ExecutiveReads {
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  composeBriefing(a: { briefingId: string; tenantId: string; domainId: string; roomId: string | null; packageId: string | null; composer: string; via: 'human' | 'agent'; agentId: string | null;
                       knownAt: string; prior: string | null; watermark: Record<string, unknown>; sources: unknown[]; items: unknown[]; windows: unknown[]; sourceStates: unknown[]; degraded: boolean;
                       narrative: string | null; narrativeCites: string[]; contentDigest: string; headerDigest: string; controls: unknown; eventId: string; correlationId: string }): Promise<{ briefing_id: string; content_digest: string }>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class ExecutiveCapabilityImpl extends ExecutiveCore implements RoomWrites, BriefingWrites {
  constructor(tx: Tx, action: string) { super(tx, action); }
  readRooms(): any { return this.from('executive.rooms_current'); }
  readMembers(): any { return this.from('executive.room_members'); }
  readRoomEvents(): any { return this.from('executive.room_events'); }
  readBriefings(): any { return this.from('executive.briefings'); }
  readAgents(): any { return this.from('executive.agents'); }
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
  readDependencies(): any { return this.from('graph.dependencies'); }
  readStrategy(): any { return this.from('graph.strategy_current'); }
  readSourceContracts(): any { return this.from('observation.source_contracts_current'); }
  readSchedulerEntries(): any { return this.from('observation.scheduler_entries'); }
  readScheduledAttempts(): any { return this.from('observation.scheduled_attempts'); }
  readHealthEvents(): any { return this.from('observation.source_health_events'); }

  async isMember(a: { roomId: string; principal: string }): Promise<boolean> {
    const rows = await this.call<{ m: boolean }>(sql`select executive.is_member(${a.roomId}::uuid, ${a.principal}::uuid) as m`);
    return rows[0]?.m === true;
  }
  async liveApprovals(a: { packageId: string; version: number }) {
    return this.call<{ approval_id: string; approver_principal_id: string; expires_at: string }>(sql`select la.approval_id::text, la.approver_principal_id::text, decision.iso(a.expires_at) as expires_at
      from decision.live_approvals(${a.packageId}::uuid, ${a.version}::int) la join decision.approvals a on a.approval_id = la.approval_id`);
  }
  async now(): Promise<string> {
    const rows = await this.call<{ t: string }>(sql`select decision.iso(clock_timestamp()) as t`);
    return String(rows[0]?.t);
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
      ${a.narrative}, ${JSON.stringify(a.narrativeCites)}::jsonb, ${a.contentDigest}, ${a.headerDigest}, ${JSON.stringify(a.controls ?? {})}::jsonb, ${a.eventId}::uuid, ${a.correlationId}::uuid) as r`);
    const r = rows[0]?.r; if (r === undefined) throw new Error('compose_briefing returned no row'); return r;
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const ExecutiveCapability = {
  read(tx: Tx, action: string): ExecutiveReads { return new ExecutiveCapabilityImpl(tx, action); },
  room(tx: Tx, action: string): RoomWrites { return new ExecutiveCapabilityImpl(tx, action); },
  briefing(tx: Tx, action: string): BriefingWrites { return new ExecutiveCapabilityImpl(tx, action); },
};
