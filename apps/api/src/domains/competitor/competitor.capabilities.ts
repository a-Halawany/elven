/**
 * B33 §CI (0111 §CI) — THE COMPETITOR CAPABILITIES: one implementation, narrow interfaces (the twin capability's shape); every
 * write is a SECURITY DEFINER port that asserts the caller's own bound action; reads go through the tables' row security and the INVOKER reads.
 *
 *   domain.competitor.read                  reads (the analysts, the strategy lead, the executives, the agent — audited)
 *   domain.competitor.declare               domain.dci_declare_competitor
 *   domain.competitor.propose               domain.dci_propose / dci_withdraw_proposal / dci_record_scan (a person, or the agent in its scan)
 *   domain.competitor.assessment.approve    domain.dci_decide_proposal + the CPF admission + dci_bind_profile_object (a named analyst; human-gated)
 *   domain.competitor.revalidate            domain.dci_revalidate (+ the CPF of a limited version)
 *   domain.competitor.compare               domain.dci_declare_basis / dci_compare
 *   domain.competitor.watchlist             domain.dci_declare_watchlist / dci_retire_watchlist
 *   domain.competitor.challenge             domain.dci_challenge (human-gated)
 *   domain.competitor.challenge.decide      domain.dci_decide_challenge (human-gated)
 *   domain.competitor.decision.cite         domain.dci_cite_in_decision (human-gated)
 *   domain.competitor.twin.bind             domain.dci_bind_twin (the twin's owner)
 *   domain.competitor.twin.decide           domain.dci_decide_twin_proposal (the twin's owner; human-gated)
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';

type Row = Record<string, unknown>;

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface CompetitorReads {
  readonly action: string;
  from(relation: string): any;
  /** the database's instant (every "as of now" is the database's) */
  now(): Promise<string>;
  manifest(tenantId: string, domainId: string, packageKey: string): Promise<Row>;
  packageState(tenantId: string, domainId: string, packageKey: string, fn: string | null): Promise<Row>;
  coverage(tenantId: string, domainId: string, competitorId: string): Promise<Row>;
  identity(tenantId: string, domainId: string, entityId: string, citations: unknown[]): Promise<Row>;
  diversity(tenantId: string, domainId: string, citations: unknown[], minPublishers: number): Promise<Row>;
  contradictions(tenantId: string, domainId: string, citations: unknown[]): Promise<Row[]>;
  /** the agent's backlog: claims on watched competitors recorded after each one's last scan mark (recorded_at as text, microseconds kept) */
  backlog(tenantId: string, domainId: string, limit: number): Promise<Row[]>;
  needsRevalidation(tenantId: string, domainId: string): Promise<Row[]>;
  /** the active Domain Intelligence Agents of the domain */
  domainAgents(): Promise<Row[]>;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

interface Who { tenantId: string; domainId: string; actor: string; correlationId: string }
export interface CompetitorWrites extends CompetitorReads {
  declare(a: Who & { competitorId: string; packageKey: string; entityId: string; name: string; owner: string }): Promise<Row>;
  propose(a: Who & { proposalId: string; competitorId: string; content: Row; agentId: string | null; runId: string | null }): Promise<Row>;
  withdraw(a: Who & { proposalId: string; reason: string }): Promise<Row>;
  recordScan(a: Who & { competitorId: string; agentId: string; runId: string; watermark: string; seen: number; proposed: number }): Promise<Row>;
  decide(a: Who & { proposalId: string; decision: 'approved' | 'declined'; digest: string; reason: string | null }): Promise<Row>;
  revalidate(a: Who & { competitorId: string }): Promise<Row>;
  /** objects.admit_version under the bound action (the CPF of a profile version) */
  admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }>;
  bindProfileObject(a: Who & { competitorId: string; version: number; digest: string }): Promise<Row>;
  declareBasis(a: Who & { packageKey: string; basisKey: string; title: string; metrics: unknown[] }): Promise<Row>;
  compare(a: Who & { comparisonId: string; basisKey: string; competitorIds: string[] }): Promise<Row>;
  declareWatchlist(a: Who & { watchlistId: string; packageKey: string; title: string; owner: string; competitorIds: string[]; rules: unknown[]; freshnessDays: number }): Promise<Row>;
  retireWatchlist(a: Who & { watchlistId: string; reason: string }): Promise<Row>;
  challenge(a: Who & { challengeId: string; assessmentId: string; reason: string; proposed: Row }): Promise<Row>;
  decideChallenge(a: Who & { challengeId: string; decision: 'upheld' | 'dismissed'; reason: string }): Promise<Row>;
  citeInDecision(a: Who & { useId: string; competitorId: string; version: number; packageId: string; note: string }): Promise<Row>;
  bindTwin(a: Who & { competitorId: string; twinId: string }): Promise<Row>;
  decideTwin(a: Who & { proposalId: string; decision: 'applied' | 'declined'; version: number | null; note: string | null }): Promise<Row>;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
class CompetitorCapabilityImpl implements CompetitorWrites {
  readonly #tx: Tx;
  readonly #action: string;
  constructor(tx: Tx, action: string) { this.#tx = tx; this.#action = action; }
  get action(): string { return this.#action; }
  from(relation: string): any { return this.#tx.selectFrom(relation as never); }
  private async one(q: ReturnType<typeof sql>): Promise<Row> {
    const r = await q.execute(this.#tx);
    return ((r.rows[0] as { r?: Row } | undefined)?.r) ?? {};
  }
  async now(): Promise<string> {
    const r = await sql<{ n: string }>`select to_char(clock_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as n`.execute(this.#tx);
    return String(r.rows[0]?.n);
  }
  async manifest(t: string, d: string, k: string) { return this.one(sql`select domain.dci_manifest(${t}::uuid, ${d}::uuid, ${k}) as r`); }
  async packageState(t: string, d: string, k: string, fn: string | null) { return this.one(sql`select domain.package_function_state(${t}::uuid, ${d}::uuid, ${k}, ${fn}) as r`); }
  async coverage(t: string, d: string, c: string) { return this.one(sql`select domain.dci_coverage(${t}::uuid, ${d}::uuid, ${c}::uuid) as r`); }
  async identity(t: string, d: string, e: string, citations: unknown[]) { return this.one(sql`select domain.dci_identity(${t}::uuid, ${d}::uuid, ${e}::uuid, ${JSON.stringify(citations)}::jsonb) as r`); }
  async diversity(t: string, d: string, citations: unknown[], min: number) {
    return this.one(sql`select domain.dci_source_diversity(${t}::uuid, ${d}::uuid, ${JSON.stringify(citations)}::jsonb, ${min}::int) as r`);
  }
  async contradictions(t: string, d: string, citations: unknown[]): Promise<Row[]> {
    const r = await sql<{ r: Row[] }>`select domain.dci_contradictions(${t}::uuid, ${d}::uuid, ${JSON.stringify(citations)}::jsonb) as r`.execute(this.#tx);
    return r.rows[0]?.r ?? [];
  }
  async backlog(t: string, d: string, limit: number): Promise<Row[]> {
    const r = await sql<Row>`select competitor_id::text, package_key, entity_id::text, name,
        case when watermark = '-infinity'::timestamptz then null else to_char(watermark at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') end as watermark,
        claim_id::text, claim_version::int, claim_type, claim_digest, payload, to_char(recorded_at at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as recorded_at,
        evidence_id::text, evidence_version::int, evidence_digest, places
      from domain.dci_scan_backlog(${t}::uuid, ${d}::uuid, ${limit}::int)`.execute(this.#tx);
    return r.rows;
  }
  async needsRevalidation(t: string, d: string): Promise<Row[]> {
    const r = await sql<Row>`select competitor_id::text, name, reasons from domain.dci_needs_revalidation(${t}::uuid, ${d}::uuid) order by name`.execute(this.#tx);
    return r.rows;
  }
  async domainAgents(): Promise<Row[]> {
    const r = await sql<Row>`select agent_id::text, principal_id::text from executive.agents where agent_kind = 'domain_intelligence' and status = 'active' order by created_at`.execute(this.#tx);
    return r.rows;
  }

  async declare(a: Parameters<CompetitorWrites['declare']>[0]) {
    return this.one(sql`select domain.dci_declare_competitor(${a.competitorId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageKey}, ${a.entityId}::uuid, ${a.name},
      ${a.owner}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async propose(a: Parameters<CompetitorWrites['propose']>[0]) {
    return this.one(sql`select domain.dci_propose(${a.proposalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.competitorId}::uuid, ${JSON.stringify(a.content)}::jsonb,
      ${a.agentId}::uuid, ${a.runId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async withdraw(a: Parameters<CompetitorWrites['withdraw']>[0]) {
    return this.one(sql`select domain.dci_withdraw_proposal(${a.proposalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async recordScan(a: Parameters<CompetitorWrites['recordScan']>[0]) {
    return this.one(sql`select domain.dci_record_scan(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.competitorId}::uuid, ${a.agentId}::uuid, ${a.runId}::uuid, ${a.watermark}::timestamptz,
      ${a.seen}::int, ${a.proposed}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async decide(a: Parameters<CompetitorWrites['decide']>[0]) {
    return this.one(sql`select domain.dci_decide_proposal(${a.proposalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.digest}, ${a.reason},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async revalidate(a: Parameters<CompetitorWrites['revalidate']>[0]) {
    return this.one(sql`select domain.dci_revalidate(${a.competitorId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async admitObject(header: unknown, payload: unknown, digest: string): Promise<{ contentDigest: string }> {
    const r = await sql<{ content_digest: string }>`select content_digest from objects.admit_version(${JSON.stringify(header)}::jsonb, ${JSON.stringify(payload)}::jsonb, ${digest})`.execute(this.#tx);
    return { contentDigest: String(r.rows[0]?.content_digest) };
  }
  async bindProfileObject(a: Parameters<CompetitorWrites['bindProfileObject']>[0]) {
    return this.one(sql`select domain.dci_bind_profile_object(${a.competitorId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.version}::int, ${a.digest}, ${a.actor}::uuid) as r`);
  }
  async declareBasis(a: Parameters<CompetitorWrites['declareBasis']>[0]) {
    return this.one(sql`select domain.dci_declare_basis(${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageKey}, ${a.basisKey}, ${a.title}, ${JSON.stringify(a.metrics)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async compare(a: Parameters<CompetitorWrites['compare']>[0]) {
    return this.one(sql`select domain.dci_compare(${a.comparisonId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.basisKey}, ${a.competitorIds}::uuid[], ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async declareWatchlist(a: Parameters<CompetitorWrites['declareWatchlist']>[0]) {
    return this.one(sql`select domain.dci_declare_watchlist(${a.watchlistId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.packageKey}, ${a.title}, ${a.owner}::uuid,
      ${a.competitorIds}::uuid[], ${JSON.stringify(a.rules)}::jsonb, ${a.freshnessDays}::int, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async retireWatchlist(a: Parameters<CompetitorWrites['retireWatchlist']>[0]) {
    return this.one(sql`select domain.dci_retire_watchlist(${a.watchlistId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async challenge(a: Parameters<CompetitorWrites['challenge']>[0]) {
    return this.one(sql`select domain.dci_challenge(${a.challengeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.assessmentId}::uuid, ${a.reason}, ${JSON.stringify(a.proposed)}::jsonb,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async decideChallenge(a: Parameters<CompetitorWrites['decideChallenge']>[0]) {
    return this.one(sql`select domain.dci_decide_challenge(${a.challengeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async citeInDecision(a: Parameters<CompetitorWrites['citeInDecision']>[0]) {
    return this.one(sql`select domain.dci_cite_in_decision(${a.useId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.competitorId}::uuid, ${a.version}::int, ${a.packageId}::uuid,
      ${a.note}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async bindTwin(a: Parameters<CompetitorWrites['bindTwin']>[0]) {
    return this.one(sql`select domain.dci_bind_twin(${a.competitorId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.twinId}::uuid, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
  async decideTwin(a: Parameters<CompetitorWrites['decideTwin']>[0]) {
    return this.one(sql`select domain.dci_decide_twin_proposal(${a.proposalId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.version}::int, ${a.note},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`);
  }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export const CompetitorCapability = {
  read(tx: Tx, action: string): CompetitorReads { return new CompetitorCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): CompetitorWrites { return new CompetitorCapabilityImpl(tx, action); },
};
