/**
 * THE STRATEGY GRAPH — objectives, assumptions, decisions, commitments, outcomes.
 *
 * These are CANONICAL objects, not a side table. They carry the 43-column header,
 * they version, they are corrected rather than edited, and they are admitted
 * through the same `objects.admit_version` path a claim is — under an action that
 * may write these five types and nothing else.
 *
 * `rests_on` IS MANDATORY IN THE SCHEMA, and that is the whole point of the phase.
 * An objective nobody linked to anything is an objective no correction can ever
 * reach; requiring the link at admission is what makes invalidation possible at
 * all, rather than a feature that works when someone remembered to use it.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader,
  type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { GraphReads, StrategyWrites } from '../graph.capabilities.js';

export const STRATEGY_TYPES = ['OBJ', 'ASU', 'DEC', 'CMT', 'OUT'] as const;
export type StrategyType = (typeof STRATEGY_TYPES)[number];

const KIND_OF: Readonly<Record<StrategyType, string>> = Object.freeze({
  OBJ: 'objective', ASU: 'assumption', DEC: 'decision', CMT: 'commitment', OUT: 'outcome',
});

/**
 * A decision is `decided`; everything else a person declares is `asserted`.
 * Neither is `inferred` or `assessed`: nothing here was derived by the system, and
 * the truth state must not suggest it was.
 */
const TRUTH_OF: Readonly<Record<StrategyType, string>> = Object.freeze({
  OBJ: 'asserted', ASU: 'asserted', DEC: 'decided', CMT: 'asserted', OUT: 'asserted',
});

export interface RestsOn {
  kind: 'claim' | 'entity' | 'edge' | 'strategy';
  id: string;
  rationale: string;
}

export interface StrategyIntake {
  objectType: StrategyType;
  title: string;
  statement: string;
  status: 'active' | 'closed' | 'withdrawn';
  horizon: string | null;
  parentObjectiveId: string | null;
  restsOn: RestsOn[];
  metrics: Record<string, unknown>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Validation refuses rather than repairs, and each refusal names its own reason. */
export function validateStrategy(
  m: Partial<StrategyIntake>, correlationId: string,
): StrategyIntake {
  const bad = (msg: string): never => {
    throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422);
  };
  if (typeof m.objectType !== 'string'
    || !(STRATEGY_TYPES as readonly string[]).includes(m.objectType)) {
    bad(`object_type must be one of ${STRATEGY_TYPES.join(', ')}`);
  }
  if (typeof m.title !== 'string' || m.title.trim().length < 2 || m.title.length > 256) {
    bad('title must be between 2 and 256 characters');
  }
  if (typeof m.statement !== 'string' || m.statement.trim().length < 2 || m.statement.length > 4096) {
    bad('statement must be between 2 and 4096 characters');
  }
  const status = m.status ?? 'active';
  if (!['active', 'closed', 'withdrawn'].includes(status)) {
    bad("status must be 'active', 'closed' or 'withdrawn'");
  }
  const rests = Array.isArray(m.restsOn) ? m.restsOn : [];
  if (rests.length === 0) {
    bad('rests_on is required: a strategy object that names nothing it rests on can never be reached by a correction');
  }
  if (rests.length > 64) bad('rests_on may name at most 64 dependencies');
  for (const r of rests) {
    if (r === null || typeof r !== 'object') bad('every rests_on entry must be an object');
    if (!['claim', 'entity', 'edge', 'strategy'].includes(r.kind)) {
      bad("rests_on kind must be 'claim', 'entity', 'edge' or 'strategy'");
    }
    if (typeof r.id !== 'string' || !UUID.test(r.id)) bad('rests_on id must be a uuid');
    if (typeof r.rationale !== 'string' || r.rationale.trim().length < 8) {
      bad('every dependency needs a rationale of at least 8 characters: an unexplained link is not a dependency');
    }
  }
  const parent = m.parentObjectiveId ?? null;
  if (parent !== null && !UUID.test(parent)) bad('parent_objective_id must be a uuid');
  return {
    objectType: m.objectType as StrategyType,
    title: m.title as string, statement: m.statement as string,
    status: status as StrategyIntake['status'],
    horizon: m.horizon ?? null, parentObjectiveId: parent,
    restsOn: rests, metrics: m.metrics ?? {},
  };
}

@Injectable()
export class StrategyService {
  /**
   * Declare one strategy object and its dependencies in ONE governed operation.
   *
   * The canonical object, the projection row and every dependency link commit
   * together or not at all. A half-linked objective would be the worst of both
   * worlds: it exists, so people rely on it, and it is invisible to the walk that
   * would tell them when what it rests on changed.
   */
  async declare(
    cap: StrategyWrites, ctx: ScopeContext,
    a: {
      objectId: string; intake: StrategyIntake; owner: string; actor: string;
      correlationId: string; purposeId: string;
    },
  ): Promise<{ objectId: string; objectType: StrategyType; version: number; links: number }> {
    const tenantId = ctx.tenantId as string;
    const domainId = ctx.domainId as string;
    const m = a.intake;
    const now = new Date().toISOString();
    const verification = m.objectType === 'ASU' ? 'unverified' : 'not_applicable';

    const payload = {
      strategy_kind: KIND_OF[m.objectType],
      title: m.title,
      statement: m.statement,
      status: m.status,
      horizon: m.horizon,
      owner: `principal:${a.owner}`,
      parent_objective_id: m.parentObjectiveId,
      verification: {
        state: verification,
        reason: m.objectType === 'ASU'
          ? 'declared but not yet checked against the evidence it rests on' : null,
        at: null,
      },
      rests_on: m.restsOn.map((r) => ({ kind: r.kind, id: r.id, rationale: r.rationale })),
      metrics: m.metrics,
    };

    const header: CanonicalHeader = {
      object_id: a.objectId,
      object_type: m.objectType,
      tenant_id: ctx.tenantId,
      domain_id: ctx.domainId,
      scope: 'DOMAIN',
      object_version: '1',
      lifecycle_state: 'active',
      owning_component: 'CP-GRA-01',
      accountable_owner: `principal:${a.owner}`,
      // Only CLAIMS are canonical objects; entities and edges are governed
      // identities in the graph schema and are referenced, not sourced.
      source_object_ids: m.restsOn.filter((r) => r.kind === 'claim').map((r) => r.id),
      event_time: null,
      observation_time: now,
      valid_from: null,
      valid_to: null,
      recorded_at: now,
      time_precision: 'exact',
      source_clock_quality: 'trusted',
      truth_state: TRUTH_OF[m.objectType],
      synthetic_state: false,
      confidence: null,
      uncertainty: null,
      evidence_refs: m.restsOn.map((r) => `${r.kind}:${r.id}`),
      provenance_ref: `principal:${a.owner}`,
      method_ref: 'human-declaration@1.0.0',
      contradiction_refs: [],
      corroboration_refs: [],
      human_refs: [`principal:${a.owner}`],
      classification: 'internal',
      purpose_scope: a.purposeId,
      rights_profile: null,
      residency_profile: null,
      retention_profile: null,
      access_policy_ref: null,
      quality_profile: null,
      quality_state: null,
      freshness_state: null,
      schema_ref: `${m.objectType}@v1`,
      ontology_ref: null,
      correction_of: null,
      supersedes: null,
      withdrawal_reason: null,
      audit_correlation_id: a.correlationId,
      content_ref: null,
    };
    const v = validateHeader(header);
    if (!v.ok) {
      throw new HttpException(
        errorBody('EYE_REQ_001', a.correlationId,
          `strategy header invalid: ${(v.errors ?? []).join('; ')}`), 422);
    }
    await cap.admitObject(header, payload, canonicalHeaderDigest(header, payload));
    await cap.declareStrategy({
      objectId: a.objectId, tenantId, domainId, objectType: m.objectType, version: 1,
      title: m.title, statement: m.statement, status: m.status, verification,
      parent: m.parentObjectiveId, owner: a.owner, actor: a.actor,
      eventId: newId(), correlationId: a.correlationId,
    });
    for (const r of m.restsOn) {
      await cap.linkDependency({
        dependencyId: newId(), tenantId, domainId, dependent: a.objectId,
        dependentType: m.objectType, kind: r.kind, target: r.id, rationale: r.rationale,
        actor: a.actor, eventId: newId(), correlationId: a.correlationId,
      });
    }
    return { objectId: a.objectId, objectType: m.objectType, version: 1, links: m.restsOn.length };
  }

  async list(cap: GraphReads, limit = 200): Promise<Array<Record<string, unknown>>> {
    return (await cap.readStrategy().selectAll()
      .orderBy('declared_at' as never, 'desc')
      .limit(Math.min(limit, 1000)).execute()) as Array<Record<string, unknown>>;
  }

  async get(cap: GraphReads, objectId: string): Promise<Record<string, unknown> | undefined> {
    return (await cap.readStrategy().selectAll()
      .where('strategy_object_id' as never, '=', objectId as never)
      .executeTakeFirst()) as Record<string, unknown> | undefined;
  }

  async events(cap: GraphReads, objectId: string): Promise<Array<Record<string, unknown>>> {
    return (await cap.readStrategyEvents().selectAll()
      .where('strategy_object_id' as never, '=', objectId as never)
      .orderBy('occurred_at' as never).execute()) as Array<Record<string, unknown>>;
  }

  async dependencies(cap: GraphReads, objectId: string): Promise<Array<Record<string, unknown>>> {
    return (await cap.readDependencies().selectAll()
      .where('dependent_object_id' as never, '=', objectId as never)
      .where('state' as never, '=', 'active' as never)
      .execute()) as Array<Record<string, unknown>>;
  }
}
