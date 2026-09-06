/**
 * INVALIDATION PROPAGATION — the sentence Phase 1 could not write.
 *
 * Since Phase 1 every correction case has carried:
 *
 *   "downstream consumers not yet present (KG/dependency graph arrives Phase 3)"
 *
 * That was a true statement about the world at the time, not a label. This service
 * is what makes it stop being true: it walks the dependency graph from a changed
 * claim and reports what rested on it.
 *
 * IT REPORTS; IT DOES NOT DECIDE.
 *
 * Every affected assumption is marked UNVERIFIED — not false, not withdrawn. An
 * assumption whose evidence changed is one nobody has re-checked yet, and saying
 * anything stronger would be the system concluding something it has no standing
 * to conclude. Objectives, decisions and commitments are LISTED and left exactly
 * as they were: what to do about them is a person's judgement, and in a later
 * phase a decision package's.
 */
import { Injectable } from '@nestjs/common';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { GraphReads, ImpactWrites, OutstandingCursor } from '../graph.capabilities.js';

/** The walk is bounded: a dependency cycle must not become an infinite loop. */
const MAX_HOPS = 8;

export interface AffectedObject {
  strategy_object_id: string;
  object_type: string;
  title: string;
  /** How the walk reached it — never a bare id in a list. */
  reached_via: string;
  hop: number;
  /** The object the dependency came through (Phase 5: the port marks only versions that cite it). */
  via_id?: string;
}

export interface ImpactResult {
  invalidationId: string;
  triggerKind: string;
  triggerObjectId: string;
  correctionCaseId: string | null;
  assumptions: AffectedObject[];
  objectives: AffectedObject[];
  decisions: AffectedObject[];
  commitments: AffectedObject[];
  /**
   * Phase 4: forecasts, scenario trees and warnings that rest — directly or
   * through an assumption — on what changed. A reached forecast is MARKED FOR
   * ATTENTION by the port and surfaced; it is never re-issued by the walk.
   */
  forecasts: AffectedObject[];
  scenarios: AffectedObject[];
  warnings: AffectedObject[];
  /**
   * Phase 5: twins whose admitted versions cite what changed (marked UNVERIFIED by
   * event through the twin port) and simulation runs built on them (immutable,
   * surfaced with an event). Reached in the same walk, through the same table.
   */
  twins: AffectedObject[];
  simulations: AffectedObject[];
  /** Entities and edges the changed object reached on the way. */
  reachedEntities: string[];
  reachedEdges: string[];
  /**
   * The claims the trigger reached.
   *
   * For an evidence correction these are resolved through `claim_lineage` — the
   * evidence-to-derived-claim closure — rather than assumed to be the trigger
   * itself.
   */
  reachedClaims: string[];
  /**
   * TRUE when the traversal bound was reached before the graph was exhausted.
   *
   * A bounded walk that reports "assessed" without saying it stopped early is the
   * worst of both worlds: the correction looks handled and dependencies remain
   * unexamined. When this is true the assessment is INCOMPLETE and says so in its
   * own statement.
   */
  truncated: boolean;
  /** The frontier the walk did not follow, so the residual work is nameable. */
  unexplored: Array<{ kind: string; id: string; via: string }>;
  statement: string;
}

@Injectable()
export class ImpactService {
  /**
   * Resolve what a changed claim reaches, WITHOUT writing anything.
   *
   * Kept separate from `propagate` so the Impact screen can answer "what would
   * this affect?" before a person commits to marking anything — and so the walk
   * is testable on its own.
   */
  async walk(
    cap: GraphReads,
    a: { triggerKind: string; triggerObjectId: string },
  ): Promise<Omit<ImpactResult, 'invalidationId' | 'correctionCaseId' | 'statement'>> {
    const deps = (await cap.readDependencies().selectAll()
      .where('state' as never, '=', 'active' as never)
      .execute()) as Array<Record<string, unknown>>;
    const strategy = (await cap.readStrategy().selectAll()
      .execute()) as Array<Record<string, unknown>>;
    const byId = new Map(strategy.map((s) => [String(s['strategy_object_id']), s]));
    /*
     * PHASE 4 DEPENDENTS, in the same table. A forecast rests on assumptions and
     * on the evidence it read; a scenario rests on its forecast; a warning on its
     * scenario. They are looked up beside the strategy objects so one walk reaches
     * all of them — there is no second propagation.
     */
    const forecasts = new Map<string, Record<string, unknown>>(
      ((await cap.readForecasts().selectAll().execute()) as Array<Record<string, unknown>>)
        .map((f) => [String(f['forecast_id']), f]));
    const scenarios = new Map<string, Record<string, unknown>>(
      ((await cap.readScenarios().selectAll().execute()) as Array<Record<string, unknown>>)
        .map((f) => [String(f['scenario_id']), f]));
    const warnings = new Map<string, Record<string, unknown>>(
      ((await cap.readWarnings().selectAll().execute()) as Array<Record<string, unknown>>)
        .map((f) => [String(f['warning_id']), f]));
    const twins = new Map<string, Record<string, unknown>>(
      ((await cap.readTwins().selectAll().execute()) as Array<Record<string, unknown>>)
        .map((t) => [String(t['twin_id']), t]));
    const runs = new Map<string, Record<string, unknown>>(
      ((await cap.readRuns().selectAll().execute()) as Array<Record<string, unknown>>)
        .map((r) => [String(r['run_id']), r]));

    /*
     * THE CLOSURE FROM EVIDENCE TO WHAT WAS DERIVED FROM IT.
     *
     * A Phase 1 correction supersedes EVIDENCE objects — that is what
     * `observation.correction.apply` writes. The walk previously understood only
     * claim, entity, edge and split triggers, so the object a correction actually
     * changes had no way into the graph at all, and the demonstration had to be
     * handed a claim id by hand. `intelligence.claim_lineage` is the join that
     * closes it: every claim records the evidence object and digest it was
     * derived from, so an evidence correction reaches its claims, and each claim
     * then reaches its entities and edges exactly as before.
     */
    const reachedEntities = new Set<string>();
    const reachedEdges = new Set<string>();
    const reachedClaims = new Set<string>();

    const reachedEvidence = new Set<string>();
    if (a.triggerKind === 'evidence_correction') {
      const lineage = (await cap.readClaimLineage().selectAll()
        .where('evidence_object_id' as never, '=', a.triggerObjectId as never)
        .execute()) as Array<Record<string, unknown>>;
      for (const l of lineage) reachedClaims.add(String(l['claim_object_id']));
      // A forecast may rest on the corrected evidence DIRECTLY (its series read it).
      reachedEvidence.add(a.triggerObjectId);
    } else if (a.triggerKind === 'claim_correction' || a.triggerKind === 'claim_withdrawal') {
      reachedClaims.add(a.triggerObjectId);
    } else if (a.triggerKind === 'edge_retraction') {
      reachedEdges.add(a.triggerObjectId);
    } else if (a.triggerKind === 'entity_split') {
      reachedEntities.add(a.triggerObjectId);
    }

    // Every claim reached — directly or through the evidence behind it — widens
    // the walk to the entities it resolved to and the edges it asserted.
    for (const claimId of reachedClaims) {
      const resolutions = (await cap.readResolutions().selectAll()
        .where('claim_object_id' as never, '=', claimId as never)
        .where('state' as never, '=', 'accepted' as never)
        .execute()) as Array<Record<string, unknown>>;
      for (const r of resolutions) reachedEntities.add(String(r['entity_id']));
      const edges = (await cap.readEdges().selectAll()
        .where('claim_object_id' as never, '=', claimId as never)
        .execute()) as Array<Record<string, unknown>>;
      for (const e of edges) reachedEdges.add(String(e['edge_id']));
    }

    /*
     * SEEDS. A dependency on the claim itself is direct; a dependency on an entity
     * or edge the claim produced is one hop further out, and the reason is
     * recorded so a reader sees the chain rather than an unexplained list.
     */
    const seeds: Array<{ kind: string; id: string; via: string }> = [
      ...[...reachedClaims].map((id) => ({
        kind: 'claim', id,
        via: a.triggerKind === 'evidence_correction'
          ? 'rests on a claim derived from the corrected evidence'
          : 'rests on the changed claim directly' })),
      ...[...reachedEntities].map((id) => ({
        kind: 'entity', id, via: 'rests on an entity the changed claim resolved to' })),
      ...[...reachedEdges].map((id) => ({
        kind: 'edge', id, via: 'rests on an edge the changed claim asserted' })),
      ...[...reachedEvidence].map((id) => ({
        kind: 'evidence', id, via: 'a value it was fitted on was read from the corrected evidence' })),
    ];

    const found = new Map<string, AffectedObject>();
    let frontier: Array<{ kind: string; id: string; via: string }> = seeds;
    let hop = 1;
    for (; hop <= MAX_HOPS && frontier.length > 0; hop += 1) {
      const next: Array<{ kind: string; id: string; via: string }> = [];
      for (const seed of frontier) {
        for (const d of deps) {
          if (String(d['depends_on_kind']) !== seed.kind) continue;
          if (String(d['depends_on_id']) !== seed.id) continue;
          const dependent = String(d['dependent_object_id']);
          if (found.has(dependent)) continue;
          const s = byId.get(dependent);
          if (s !== undefined) {
            found.set(dependent, {
              strategy_object_id: dependent,
              object_type: String(s['object_type']),
              title: String(s['title']),
              reached_via: seed.via,
              hop,
            });
            next.push({
              kind: 'strategy', id: dependent,
              via: `rests on ${String(s['object_type'])} "${String(s['title'])}"`,
            });
            continue;
          }
          const f = forecasts.get(dependent);
          if (f !== undefined) {
            found.set(dependent, {
              strategy_object_id: dependent, object_type: 'FCT',
              title: `${String(f['series_key'])} · ${String(f['horizon_code'])} · ${String(f['method'])}`,
              reached_via: seed.via, hop,
            });
            next.push({ kind: 'forecast', id: dependent, via: `rests on the forecast for ${String(f['series_key'])}` });
            continue;
          }
          const sc = scenarios.get(dependent);
          if (sc !== undefined) {
            found.set(dependent, {
              strategy_object_id: dependent, object_type: 'SCN', title: String(sc['title']),
              reached_via: seed.via, hop,
            });
            next.push({ kind: 'strategy', id: dependent, via: `rests on scenario "${String(sc['title'])}"` });
            continue;
          }
          const w = warnings.get(dependent);
          if (w !== undefined) {
            found.set(dependent, {
              strategy_object_id: dependent, object_type: 'WRN', title: String(w['title']),
              reached_via: seed.via, hop,
            });
            continue;
          }
          const tw = twins.get(dependent);
          if (tw !== undefined) {
            found.set(dependent, {
              strategy_object_id: dependent, object_type: 'TWN', title: String(tw['title']),
              reached_via: seed.via, hop, via_id: seed.id,
            });
            next.push({ kind: 'twin', id: dependent, via: `rests on twin "${String(tw['title'])}"` });
            continue;
          }
          const rn = runs.get(dependent);
          if (rn !== undefined) {
            found.set(dependent, {
              strategy_object_id: dependent, object_type: 'SIM',
              title: `${String(rn['run_kind'])} run on twin version ${String(rn['twin_version'])} (${String(rn['component'])})`,
              reached_via: seed.via, hop, via_id: seed.id,
            });
            next.push({ kind: 'run', id: dependent, via: 'compared against a run that rests on changed state' });
          }
        }
      }
      frontier = next;
    }
    /*
     * THE FRONTIER THE BOUND CUT OFF.
     *
     * If anything is still queued when the loop ends, the walk stopped because of
     * `MAX_HOPS`, not because the graph was exhausted. Naming what was left makes
     * the residual work actionable instead of invisible.
     */
    const truncated = frontier.length > 0;
    const unexplored = frontier;

    const of = (t: string): AffectedObject[] =>
      [...found.values()].filter((x) => x.object_type === t)
        .sort((x, y) => x.hop - y.hop);

    return {
      triggerKind: a.triggerKind,
      triggerObjectId: a.triggerObjectId,
      assumptions: of('ASU'),
      objectives: of('OBJ'),
      decisions: of('DEC'),
      commitments: of('CMT'),
      forecasts: of('FCT'),
      scenarios: of('SCN'),
      warnings: of('WRN'),
      twins: of('TWN'),
      simulations: of('SIM'),
      reachedEntities: [...reachedEntities],
      reachedEdges: [...reachedEdges],
      reachedClaims: [...reachedClaims],
      truncated,
      unexplored,
    };
  }

  /**
   * The evidence roots a correction case recorded as affected.
   *
   * A case that superseded three objects has three roots, and walking one of them
   * says nothing about the other two. The roots come from the case's OWN
   * `affected_resolved` record rather than from whatever the caller passed, so a
   * caller cannot shrink the work by naming fewer of them.
   */
  async rootsOf(cap: GraphReads, caseId: string): Promise<string[]> {
    const row = (await cap.readCorrections().selectAll()
      .where('case_id' as never, '=', caseId as never)
      .executeTakeFirst()) as Record<string, unknown> | undefined;
    if (row === undefined) return [];
    const resolved = row['affected_resolved'];
    const arr = Array.isArray(resolved) ? resolved
      : typeof resolved === 'string' ? (JSON.parse(resolved) as unknown[]) : [];
    return [...new Set(arr
      .map((x) => (x as Record<string, unknown>)?.['object_id'])
      .filter((x): x is string => typeof x === 'string'))];
  }

  /**
   * Open the invalidation, mark every affected assumption unverified, and record
   * the assessment.
   *
   * WHETHER THE CASE IS COMPLETE IS NOT THIS METHOD'S CALL. It walks ONE root.
   * `graph.record_impact` compares every root the case recorded against every
   * root walked without truncation, and only then decides what the case's state
   * is — because the database is the only place that can see all the walks.
   */
  async propagate(
    cap: ImpactWrites, ctx: ScopeContext,
    a: {
      triggerKind: string; triggerObjectId: string; correctionCaseId: string | null;
      actor: string; correlationId: string;
    },
  ): Promise<ImpactResult> {
    const tenantId = ctx.tenantId as string;
    const domainId = ctx.domainId as string;
    const walked = await this.walk(cap, a);
    const invalidationId = newId();

    await cap.openInvalidation({
      invalidationId, tenantId, domainId, triggerKind: a.triggerKind,
      triggerObjectId: a.triggerObjectId, correctionCaseId: a.correctionCaseId,
      actor: a.actor, eventId: newId(), correlationId: a.correlationId,
    });

    for (const asu of walked.assumptions) {
      await cap.setAssumptionState({
        objectId: asu.strategy_object_id, tenantId, domainId, state: 'unverified',
        reason: `an object it rests on changed (${a.triggerKind}); ${asu.reached_via}`,
        actor: a.actor, eventId: newId(), correlationId: a.correlationId,
      });
    }

    const statement = buildStatement(invalidationId, walked);
    await cap.recordImpact({
      invalidationId, tenantId, domainId,
      assumptions: walked.assumptions, objectives: walked.objectives,
      decisions: walked.decisions, commitments: walked.commitments,
      forecasts: walked.forecasts.map((f) => ({ forecast_id: f.strategy_object_id, reached_via: f.reached_via, hop: f.hop })),
      twins: walked.twins.map((t) => ({ twin_id: t.strategy_object_id, via_id: t.via_id ?? null, reached_via: t.reached_via, hop: t.hop })),
      simulations: walked.simulations.map((r) => ({ run_id: r.strategy_object_id, reached_via: r.reached_via, hop: r.hop })),
      statement, truncated: walked.truncated, unexplored: walked.unexplored,
      actor: a.actor, eventId: newId(), correlationId: a.correlationId,
    });

    return { ...walked, invalidationId, correctionCaseId: a.correctionCaseId, statement };
  }

  async list(cap: GraphReads, limit = 100): Promise<Array<Record<string, unknown>>> {
    return (await cap.readInvalidations().selectAll()
      .orderBy('opened_at' as never, 'desc')
      .limit(Math.min(limit, 500)).execute()) as Array<Record<string, unknown>>;
  }

  /**
   * Applied corrections whose propagation is NOT COMPLETE.
   *
   * There is no consumer wiring `CorrectionApplied` to a dependency walk — the
   * outbox publishes the event and no worker subscribes — so propagation happens
   * only when a person asks for it. Until that consumer exists, the honest
   * product behaviour is to make the outstanding obligation VISIBLE rather than
   * let a correction sit silently unpropagated: this is the queue of corrections
   * whose downstream impact nobody has finished assessing.
   *
   * `cursor` is opaque to the caller and issued only by this method; it encodes
   * BOTH key columns of the last row so a page boundary inside a run of tied
   * timestamps loses nothing (see `correctionsOutstanding`).
   */
  async awaitingPropagation(
    cap: GraphReads, limit = 100, cursor: string | null = null,
  ): Promise<{ cases: Array<Record<string, unknown>>; total: number; nextCursor: string | null }> {
    const page = Math.min(limit, 500);
    const got = await cap.correctionsOutstanding({ limit: page, cursor: decodeCursor(cursor) });
    /*
     * FILTERED IN THE QUERY, THEN PAGED.
     *
     * The first version took a page of the newest corrections and filtered
     * afterwards, so an old outstanding case behind a hundred newer rejected ones
     * simply was not in the page and therefore was not in the answer. Outstanding
     * work is exactly the thing a list must not lose to recency.
     */
    /*
     * TRUTHFUL CURRENT STATUS, WITHOUT REWRITING PHASE 1's COLUMN.
     *
     * A case nothing has walked still carries Phase 1's original
     * `propagation_unresolved` — "downstream consumers not yet present" — which
     * described a world with no dependency graph and is no longer accurate. That
     * stored text is Phase 1's and stays as the historical record it is; the
     * outstanding-work surface states the CURRENT status beside it.
     *
     * "No walk has run" is said ONLY when no assessment is linked to the case. A
     * case that carries an assessment but still reads `pending` is one the 0027
     * reconciliation has not seen — which should not happen after it — and is
     * reported as exactly that rather than as never walked.
     */
    const withStatus = got.rows.map((c) => {
      const state = String(c['propagation_state'] ?? 'pending');
      const assessment = c['propagation_assessment_id'] ?? null;
      const unwalked = state === 'pending' && assessment === null;
      const status = unwalked
        ? 'propagation incomplete: no dependency walk has run against this correction'
        : state === 'pending'
          ? `propagation state unreconciled: assessment ${String(assessment)} is linked to this `
            + 'case but its coverage has not been reconciled; treat the case as partial until it is'
          : String(c['propagation_unresolved']);
      const { cursor_received_at: _c, ...row } = c;
      return {
        ...row,
        propagation_status: status,
        historical_sentence: unwalked ? String(c['propagation_unresolved']) : null,
      };
    });
    const last = got.rows[got.rows.length - 1];
    return {
      cases: withStatus,
      total: got.total,
      nextCursor: got.rows.length < page || last === undefined
        ? null
        : encodeCursor({ receivedAt: String(last['cursor_received_at'] ?? last['received_at']),
                         caseId: String(last['case_id']) }),
    };
  }

  async get(cap: GraphReads, invalidationId: string): Promise<Record<string, unknown> | undefined> {
    return (await cap.readInvalidations().selectAll()
      .where('invalidation_id' as never, '=', invalidationId as never)
      .executeTakeFirst()) as Record<string, unknown> | undefined;
  }
}

/**
 * The propagation statement, in words.
 *
 * It is stored rather than rendered, exactly as Phase 1's unresolved sentence was,
 * so it survives into the record and does not depend on a screen to exist. When
 * the walk found nothing it says so plainly — "nothing rested on it" is a real
 * answer and must never be presented as absence of the feature.
 */
function buildStatement(
  invalidationId: string,
  w: Omit<ImpactResult, 'invalidationId' | 'correctionCaseId' | 'statement'>,
): string {
  const total = w.assumptions.length + w.objectives.length + w.decisions.length + w.commitments.length
    + w.forecasts.length + w.scenarios.length + w.warnings.length + w.twins.length + w.simulations.length;
  const reach = `reached ${w.reachedClaims.length} claim(s), ${w.reachedEntities.length} `
    + `entity(ies) and ${w.reachedEdges.length} edge(s)`;
  const phase4 = w.forecasts.length + w.scenarios.length + w.warnings.length === 0 ? ''
    : `; ${w.forecasts.length} forecast(s) marked for attention, ${w.scenarios.length} scenario(s) and `
      + `${w.warnings.length} warning(s) reported`;
  const phase5 = w.twins.length + w.simulations.length === 0 ? ''
    : `; ${w.twins.length} twin(s) whose citing versions are marked unverified and ${w.simulations.length} simulation run(s) surfaced`;
  /*
   * AN INCOMPLETE WALK SAYS SO, FIRST.
   *
   * The word "assessed" carries an implication of completeness, so a truncated
   * walk leads with the truncation rather than burying it after the counts.
   */
  const truncation = w.truncated
    ? ` — INCOMPLETE: the traversal bound was reached and ${w.unexplored.length} `
      + 'dependency path(s) were not followed; this assessment is partial and the '
      + 'residual work is recorded on the invalidation'
    : '';
  if (total === 0) {
    return `dependency propagation assessed by invalidation ${invalidationId}: `
      + `the dependency graph was walked (${reach}) and nothing declared rests on this object`
      + truncation;
  }
  return `dependency propagation assessed by invalidation ${invalidationId}: `
    + `${w.assumptions.length} assumption(s) marked unverified; `
    + `${w.objectives.length} objective(s), ${w.decisions.length} decision(s) and `
    + `${w.commitments.length} commitment(s) reported for human review${phase4}${phase5}; `
    + reach + truncation;
}

/**
 * The continuation token for the outstanding-work list.
 *
 * Opaque by design: a caller cannot construct one by hand from a timestamp and
 * thereby reintroduce the single-column, precision-losing cursor this replaced.
 */
export function encodeCursor(c: OutstandingCursor): string {
  return Buffer.from(JSON.stringify(c), 'utf8').toString('base64url');
}

export function decodeCursor(s: string | null): OutstandingCursor | null {
  if (s === null || s === '') return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(s, 'base64url').toString('utf8'));
  } catch {
    throw new Error('cursor is not one this list issued');
  }
  const c = parsed as Record<string, unknown> | null;
  if (c === null || typeof c !== 'object'
      || typeof c['receivedAt'] !== 'string' || typeof c['caseId'] !== 'string'
      || Number.isNaN(new Date(c['receivedAt']).getTime())) {
    throw new Error('cursor is not one this list issued');
  }
  return { receivedAt: c['receivedAt'], caseId: c['caseId'] };
}
