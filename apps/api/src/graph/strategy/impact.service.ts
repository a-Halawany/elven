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
import { createHash } from 'node:crypto';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { GraphReads, ImpactWrites, OutstandingCursor } from '../graph.capabilities.js';

/** The walk is bounded: a dependency cycle must not become an infinite loop. */
const MAX_HOPS = 8;

/**
 * The reads the walk calls — exactly these, as a structural pick of GraphReads (0077, B17). A capability of another
 * module that carries the same reads (retention's, for the walk an import revocation seeds from the withdrawn records)
 * can run THIS walk without a second walker and without holding a graph capability; every GraphReads satisfies it, so
 * no existing caller changes.
 */
export type WalkReads = Pick<GraphReads, 'readDependencies' | 'readStrategy' | 'readForecasts' | 'readScenarios' | 'readWarnings' | 'readTwins' | 'readRuns' | 'readBriefings' | 'readMemoryItems' | 'readClaimLineage' | 'readResolutions' | 'readEdges'
  /* B50 ci */ | 'readProductCitations' /* end B50 ci */>;

/* B50 ci */
/**
 * B50 §CI (0120 §CI.1): the seven triggers a steward records through its own seeding port and the domain's propagation agent walks
 * (graph/impact/impact-triggers.service.ts). Each names ONE object of the domain; the walk starts from it by its TYPE.
 */
export const B50_TRIGGER_KINDS = ['legal_request', 'model_incident', 'ontology_correction', 'data_quality_finding', 'rights_change', 'integrity_failure', 'human_challenge'] as const;
/** The dependency kind (graph.dependencies.depends_on_kind) a trigger object of each type seeds; evidence, claims, entities and edges have their own closure. */
const SEED_KIND_OF: Record<string, string> = { FCT: 'forecast', WRN: 'warning', SIM: 'run', TWN: 'twin' };
const TYPE_OF_TRIGGER: Record<string, string> = { evidence_correction: 'EVD', claim_correction: 'CLM', claim_withdrawal: 'CLM', edge_retraction: 'REL', entity_split: 'ENT' };
/** The walk's product buckets beyond graph.dependencies (graph.walk_product_citations' product kinds → the result's bucket). */
const PRODUCT_BUCKET: Record<string, 'decisionPackages' | 'publications' | 'exportPackages' | 'evaluationDatasets' | 'lessons'> = {
  decision_package: 'decisionPackages', publication: 'publications', export_package: 'exportPackages',
  information_set: 'evaluationDatasets', backtest: 'evaluationDatasets', method_validation: 'evaluationDatasets', lesson: 'lessons',
};
/** The bound on one IN-list of the product read (the reached ids are queried in slices). */
const IN_SLICE = 2000;
/* end B50 ci */

/**
 * The AUTOMATIC walker's identity (CP-6 B1, migration 0060), on the connector precedent:
 * the propagation agent registered in a domain is bound to this version and code digest,
 * and its session port refuses a walker whose identity has drifted from the registration.
 * The digest names the walk's method — a change to the walk is a new walker, registered
 * anew; it is never client-supplied.
 */
/*
 * B50 ci (0120 §CI; DESIGN D10): WALKER 1.1.0 — the seven trigger kinds seeded by the object's type, the product buckets (decision packages,
 * publications, export packages, evaluation datasets, lessons) reached through graph.walk_product_citations, every reached product carrying
 * its path, and every bucket CLASSED by graph.record_impact under affected-class@1. A changed walk is a new walker: the registry's session
 * port refuses an agent registered at 1.0.0 (its digest drifted), so the domain's agent is revoked and re-registered at 1.1.0.
 */
const WALK_METHOD_REF = `graph.impact.walk@1.1.0:evidence_correction|claim_correction|claim_withdrawal|edge_retraction|entity_split|${'legal_request|model_incident|ontology_correction|data_quality_finding|rights_change|integrity_failure|human_challenge'}`
  + `→claim_lineage→resolutions/edges→dependencies(bfs,max_hops=${MAX_HOPS})→product_citations(decision_packages,publications,export_packages,evaluation_datasets,lessons;max_rounds=${MAX_HOPS})`
  + '→classes(affected-class@1)';
export const PROPAGATION_WALKER = Object.freeze({
  name: 'graph.propagation',
  version: '1.1.0',
  codeDigest: createHash('sha256').update(`graph.propagation@1.1.0:${WALK_METHOD_REF}`, 'utf8').digest('hex'),
});

export interface AffectedObject {
  strategy_object_id: string;
  object_type: string;
  title: string;
  /** How the walk reached it — never a bare id in a list. */
  reached_via: string;
  hop: number;
  /** The object the dependency came through (Phase 5: the port marks the versions that cite it). */
  via_id?: string;
  /**
   * EVERY object a twin or run was reached through. A twin cited both the corrected
   * evidence and a claim derived from it is one affected object with two routes; a
   * version citing either must be marked, so none of the routes is dropped.
   */
  via_ids?: string[];
  /* B50 ci */
  /** B50 §CI: the refs (`<TYPE>:<id>`) from the changed object to this one, in order — the path a closure and an explanation show. */
  path?: string[];
  /** B50 §CI: a product's own version (a package version, a publication version), when the bucket is versioned. */
  version?: number | null;
  /** B50 §CI: the product kind of a new bucket's row (decision_package, publication, export_package, information_set, backtest, method_validation, lesson, claim, entity, edge). */
  product_kind?: string;
  /* end B50 ci */
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
  /** 0065 §8 (AU-MEM-0031): briefings composed on what changed — re-flagged by event through the port, never rewritten. */
  briefings: AffectedObject[];
  /** 0066 §3 (AU-MEM-0031, AU-MEM-0065): memory items resting on what changed — marked for the owner's attention through the port, never rewritten. */
  memoryItems: AffectedObject[];
  /* B32 (0089) graph */
  /**
   * 0089 §G: the six new strategy types the walk reached — capabilities, initiatives, resources, measures, stakeholders and
   * risks/opportunities. The walk already FOLLOWED them (a strategy object of any type is pushed to the frontier); these buckets
   * stop it DROPPING them from the answer. LISTED for human review and recorded on the invalidation (affected_strategy_nodes),
   * exactly as objectives are — nothing is marked on them. Optional in the type (every walk fills them) so a hand-built walk
   * written before B32 still type-checks.
   */
  capabilities?: AffectedObject[];
  initiatives?: AffectedObject[];
  resources?: AffectedObject[];
  measures?: AffectedObject[];
  stakeholders?: AffectedObject[];
  exposures?: AffectedObject[];
  /* end B32 graph */
  /* B50 ci */
  /**
   * B50 §CI (0120): the products beyond graph.dependencies — decision package VERSIONS (an option cites what changed, or the package is for a
   * reached decision), publication VERSIONS (they publish a reached briefing or package), export packages (they shipped a manifest of the
   * changed evidence), evaluation datasets (frozen information sets, backtests and method validations of a reached series — or, for a model
   * incident, of the method) and lessons (learned from a reached package). Optional in the type (every walk fills them), as B32's are.
   * graphState: the claims, entities and edges the walk reached, as products (ES-30-003's "dependent graph state").
   */
  decisionPackages?: AffectedObject[];
  publications?: AffectedObject[];
  exportPackages?: AffectedObject[];
  evaluationDatasets?: AffectedObject[];
  lessons?: AffectedObject[];
  graphState?: AffectedObject[];
  /* end B50 ci */
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
   * is testable on its own. The capability is the pick of reads the walk makes
   * (WalkReads), never the whole graph capability: the import revocation (0077)
   * runs it on retention's.
   */
  async walk(
    cap: WalkReads,
    a: { triggerKind: string; triggerObjectId: string; /* B50 ci: the trigger object's type (a B50 trigger names it) */ triggerObjectType?: string },
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
    const briefings = new Map<string, Record<string, unknown>>(
      ((await cap.readBriefings().select(['briefing_id', 'room_id', 'known_at', 'composed_at'] as never).execute()) as Array<Record<string, unknown>>)
        .map((b) => [String(b['briefing_id']), b]));
    const memoryItems = new Map<string, Record<string, unknown>>(
      ((await cap.readMemoryItems().select(['item_id', 'title', 'record_class', 'state', 'recorded_at'] as never).execute()) as Array<Record<string, unknown>>)
        .map((m) => [String(m['item_id']), m]));

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
    /* B50 ci: every node remembers what it was reached through, so each product carries its path from the changed object. */
    const parentOf = new Map<string, string>();
    const refOf = new Map<string, string>();
    const triggerType = a.triggerObjectType ?? TYPE_OF_TRIGGER[a.triggerKind] ?? 'object';
    refOf.set(a.triggerObjectId, `${triggerType}:${a.triggerObjectId}`);
    const directSeeds: Array<{ kind: string; id: string; via: string }> = [];
    const triggerFound: AffectedObject[] = [];
    /* end B50 ci */
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
    } /* B50 ci */ else if ((B50_TRIGGER_KINDS as readonly string[]).includes(a.triggerKind)) {
      /*
       * A B50 TRIGGER names one object of the domain; the walk starts from it by its type. Evidence (a legal request, a data-quality finding,
       * a rights change, an integrity failure) reaches its claims through claim_lineage and is a seed itself, as a corrected one is; a claim or
       * an assessment is a claim seed; an entity or edge (an ontology correction) is the graph seed it is; a forecast, warning, run or twin
       * (a model incident, a human challenge) is a dependency seed AND an affected product itself (hop 0); a strategy object likewise.
       */
      const t = triggerType;
      if (t === 'EVD') {
        const lineage = (await cap.readClaimLineage().selectAll()
          .where('evidence_object_id' as never, '=', a.triggerObjectId as never)
          .execute()) as Array<Record<string, unknown>>;
        for (const l of lineage) reachedClaims.add(String(l['claim_object_id']));
        reachedEvidence.add(a.triggerObjectId);
      } else if (t === 'CLM' || t === 'ASM' || t === 'EVT') {
        reachedClaims.add(a.triggerObjectId);
      } else if (t === 'ENT') {
        reachedEntities.add(a.triggerObjectId);
      } else if (t === 'REL') {
        reachedEdges.add(a.triggerObjectId);
      } else {
        const id = a.triggerObjectId;
        const f = forecasts.get(id); const w = warnings.get(id); const rn = runs.get(id); const tw = twins.get(id); const st = byId.get(id);
        const self = (object_type: string, title: string): void => {
          triggerFound.push({ strategy_object_id: id, object_type, title, reached_via: `the object the ${a.triggerKind.replace(/_/g, ' ')} names`, hop: 0, path: [`${object_type}:${id}`] });
        };
        if (f !== undefined) self('FCT', `${String(f['series_key'])} · ${String(f['horizon_code'])} · ${String(f['method'])}`);
        else if (w !== undefined) self('WRN', String(w['title']));
        else if (rn !== undefined) self('SIM', `${String(rn['run_kind'])} run on twin version ${String(rn['twin_version'])} (${String(rn['component'])})`);
        else if (tw !== undefined) self('TWN', String(tw['title']));
        else if (st !== undefined) self(String(st['object_type']), String(st['title']));
        directSeeds.push({ kind: SEED_KIND_OF[t] ?? 'strategy', id, via: `rests on the ${t} the ${a.triggerKind.replace(/_/g, ' ')} names` });
      }
    } /* end B50 ci */

    // Every claim reached — directly or through the evidence behind it — widens
    // the walk to the entities it resolved to and the edges it asserted.
    for (const claimId of reachedClaims) {
      const resolutions = (await cap.readResolutions().selectAll()
        .where('claim_object_id' as never, '=', claimId as never)
        .where('state' as never, '=', 'accepted' as never)
        .execute()) as Array<Record<string, unknown>>;
      for (const r of resolutions) {
        reachedEntities.add(String(r['entity_id']));
        /* B50 ci */ if (!parentOf.has(String(r['entity_id'])) && String(r['entity_id']) !== a.triggerObjectId) parentOf.set(String(r['entity_id']), claimId); /* end B50 ci */
      }
      const edges = (await cap.readEdges().selectAll()
        .where('claim_object_id' as never, '=', claimId as never)
        .execute()) as Array<Record<string, unknown>>;
      for (const e of edges) {
        reachedEdges.add(String(e['edge_id']));
        /* B50 ci */ if (!parentOf.has(String(e['edge_id'])) && String(e['edge_id']) !== a.triggerObjectId) parentOf.set(String(e['edge_id']), claimId); /* end B50 ci */
      }
    }
    /* B50 ci: the graph state's refs and parents (a claim hangs off the changed object, an entity or edge off its claim) */
    for (const c of reachedClaims) { refOf.set(c, `CLM:${c}`); if (c !== a.triggerObjectId) parentOf.set(c, a.triggerObjectId); }
    for (const e of reachedEntities) { refOf.set(e, `ENT:${e}`); if (e !== a.triggerObjectId && !parentOf.has(e)) parentOf.set(e, a.triggerObjectId); }
    for (const e of reachedEdges) { refOf.set(e, `REL:${e}`); if (e !== a.triggerObjectId && !parentOf.has(e)) parentOf.set(e, a.triggerObjectId); }
    for (const e of reachedEvidence) refOf.set(e, `EVD:${e}`);
    /* end B50 ci */

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
        kind: 'evidence', id, via: a.triggerKind === 'evidence_correction' ? 'a value it was fitted on was read from the corrected evidence'
          : /* B50 ci */ `a value it was fitted on was read from the evidence the ${a.triggerKind.replace(/_/g, ' ')} names` /* end B50 ci */ })),
      /* B50 ci */ ...directSeeds, /* end B50 ci */
    ];

    const found = new Map<string, AffectedObject>();
    /* B50 ci */ for (const x of triggerFound) { found.set(x.strategy_object_id, x); refOf.set(x.strategy_object_id, `${x.object_type}:${x.strategy_object_id}`); } /* end B50 ci */
    let frontier: Array<{ kind: string; id: string; via: string }> = seeds;
    let hop = 1;
    for (; hop <= MAX_HOPS && frontier.length > 0; hop += 1) {
      const next: Array<{ kind: string; id: string; via: string }> = [];
      for (const seed of frontier) {
        for (const d of deps) {
          if (String(d['depends_on_kind']) !== seed.kind) continue;
          if (String(d['depends_on_id']) !== seed.id) continue;
          const dependent = String(d['dependent_object_id']);
          /* B50 ci */ if (!found.has(dependent) && dependent !== a.triggerObjectId && !parentOf.has(dependent)) parentOf.set(dependent, seed.id); /* end B50 ci */
          const already = found.get(dependent);
          if (already !== undefined) {
            if (already.via_ids !== undefined && !already.via_ids.includes(seed.id)) already.via_ids.push(seed.id);
            continue;
          }
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
            // What cites the warning (a briefing, 0065 §8) rests on it.
            next.push({ kind: 'warning', id: dependent, via: `rests on warning "${String(w['title'])}"` });
            continue;
          }
          const tw = twins.get(dependent);
          if (tw !== undefined) {
            found.set(dependent, {
              strategy_object_id: dependent, object_type: 'TWN', title: String(tw['title']),
              reached_via: seed.via, hop, via_id: seed.id, via_ids: [seed.id],
            });
            next.push({ kind: 'twin', id: dependent, via: `rests on twin "${String(tw['title'])}"` });
            continue;
          }
          const rn = runs.get(dependent);
          if (rn !== undefined) {
            found.set(dependent, {
              strategy_object_id: dependent, object_type: 'SIM',
              title: `${String(rn['run_kind'])} run on twin version ${String(rn['twin_version'])} (${String(rn['component'])})`,
              reached_via: seed.via, hop, via_id: seed.id, via_ids: [seed.id],
            });
            next.push({ kind: 'run', id: dependent, via: 'compared against a run that rests on changed state' });
            continue;
          }
          // A briefing composed on what changed (0065 §8): terminal — it cites, nothing rests on it.
          const br = briefings.get(dependent);
          if (br !== undefined) {
            found.set(dependent, {
              strategy_object_id: dependent, object_type: 'BRF', title: `briefing composed ${String(br['composed_at'] instanceof Date ? (br['composed_at'] as Date).toISOString() : br['composed_at'])} (known at ${String(br['known_at'] instanceof Date ? (br['known_at'] as Date).toISOString() : br['known_at'])})`,
              reached_via: seed.via, hop, via_id: seed.id, via_ids: [seed.id],
            });
          }
          // A memory item resting on what changed (0066 §3): terminal — a record cites, nothing rests on it.
          const mi = memoryItems.get(dependent);
          if (mi !== undefined && String(mi['state']) === 'active') {
            found.set(dependent, {
              strategy_object_id: dependent, object_type: 'MEM', title: `${String(mi['record_class'])} memory item "${String(mi['title'])}"`,
              reached_via: seed.via, hop, via_id: seed.id, via_ids: [seed.id],
            });
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
    /* B50 ci */
    for (const x of found.values()) refOf.set(x.strategy_object_id, `${x.object_type}:${x.strategy_object_id}`);
    const pathOf = (id: string): string[] => {
      const out: string[] = []; const seen = new Set<string>(); let cur: string | undefined = id;
      while (cur !== undefined && !seen.has(cur) && out.length < 32) { seen.add(cur); out.push(refOf.get(cur) ?? `object:${cur}`); cur = parentOf.get(cur); }
      return out.reverse();
    };
    for (const x of found.values()) x.path = pathOf(x.strategy_object_id);
    const products = await this.productReach(cap, a, { found, forecasts, runs, reachedClaims, reachedEntities, reachedEdges, reachedEvidence, parentOf, refOf, pathOf });
    /* end B50 ci */
    const truncated = frontier.length > 0 /* B50 ci */ || products.unexplored.length > 0 /* end B50 ci */;
    const unexplored = /* B50 ci */ [...frontier, ...products.unexplored] /* end B50 ci */;

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
      briefings: of('BRF'),
      memoryItems: of('MEM'),
      /* B32 (0089) graph */
      capabilities: of('CAP'), initiatives: of('INI'), resources: of('RSC'), measures: of('MSR'), stakeholders: of('STK'), exposures: of('RSK'),
      /* end B32 graph */
      /* B50 ci */
      decisionPackages: products.buckets.decisionPackages, publications: products.buckets.publications, exportPackages: products.buckets.exportPackages,
      evaluationDatasets: products.buckets.evaluationDatasets, lessons: products.buckets.lessons,
      graphState: [
        ...[...reachedClaims].map((id) => ({ strategy_object_id: id, object_type: 'CLM', product_kind: 'claim', title: `claim ${id}`, hop: 0, path: pathOf(id),
          reached_via: id === a.triggerObjectId ? `the claim the ${a.triggerKind.replace(/_/g, ' ')} names` : 'derived from the changed evidence (claim_lineage)' })),
        ...[...reachedEntities].map((id) => ({ strategy_object_id: id, object_type: 'ENT', product_kind: 'entity', title: `entity ${id}`, hop: id === a.triggerObjectId ? 0 : 1, path: pathOf(id),
          reached_via: id === a.triggerObjectId ? `the entity the ${a.triggerKind.replace(/_/g, ' ')} names` : 'a reached claim resolved to it' })),
        ...[...reachedEdges].map((id) => ({ strategy_object_id: id, object_type: 'REL', product_kind: 'edge', title: `edge ${id}`, hop: id === a.triggerObjectId ? 0 : 1, path: pathOf(id),
          reached_via: id === a.triggerObjectId ? `the edge the ${a.triggerKind.replace(/_/g, ' ')} names` : 'a reached claim asserted it' })),
      ],
      /* end B50 ci */
      reachedEntities: [...reachedEntities],
      reachedEdges: [...reachedEdges],
      reachedClaims: [...reachedClaims],
      truncated,
      unexplored,
    };
  }

  /* B50 ci */
  /**
   * THE PRODUCT BUCKETS (0120 §CI.4): what cites a reached node through graph.walk_product_citations — rounds of "what cites anything reached
   * so far" (a publication cites a reached briefing or package, a lesson a reached package, a validation a reached backtest), bounded by
   * MAX_HOPS rounds like the dependency walk; a frontier still queued at the bound is UNEXPLORED (the walk then reads truncated). The series a
   * reached forecast or frozen information set is about widens the walk to that series' evaluation records; for a MODEL INCIDENT the method
   * of the object named does too. Nothing is marked here: the classes are the port's (graph.record_impact → graph._classify_walk).
   */
  private async productReach(
    cap: WalkReads,
    a: { triggerKind: string; triggerObjectId: string; triggerObjectType?: string },
    g: { found: Map<string, AffectedObject>; forecasts: Map<string, Record<string, unknown>>; runs: Map<string, Record<string, unknown>>;
         reachedClaims: Set<string>; reachedEntities: Set<string>; reachedEdges: Set<string>; reachedEvidence: Set<string>;
         parentOf: Map<string, string>; refOf: Map<string, string>; pathOf: (id: string) => string[] },
  ): Promise<{ buckets: Record<'decisionPackages' | 'publications' | 'exportPackages' | 'evaluationDatasets' | 'lessons', AffectedObject[]>; unexplored: Array<{ kind: string; id: string; via: string }> }> {
    const buckets = { decisionPackages: [] as AffectedObject[], publications: [] as AffectedObject[], exportPackages: [] as AffectedObject[], evaluationDatasets: [] as AffectedObject[], lessons: [] as AffectedObject[] };
    const hopOf = new Map<string, number>();
    const reached = new Set<string>([a.triggerObjectId, ...g.reachedClaims, ...g.reachedEntities, ...g.reachedEdges, ...g.reachedEvidence]);
    for (const x of g.found.values()) { reached.add(x.strategy_object_id); hopOf.set(x.strategy_object_id, x.hop); }
    // The series a reached forecast is about (its evaluation records rest on the same history); the method, for a model incident only.
    const seriesVia = new Map<string, string>();
    for (const x of g.found.values()) {
      const f = x.object_type === 'FCT' ? g.forecasts.get(x.strategy_object_id) : undefined;
      if (f !== undefined && typeof f['series_key'] === 'string' && !seriesVia.has(f['series_key'])) seriesVia.set(f['series_key'], x.strategy_object_id);
    }
    const methodVia = new Map<string, string>();
    if (a.triggerKind === 'model_incident') {
      const f = g.forecasts.get(a.triggerObjectId); const r = g.runs.get(a.triggerObjectId);
      if (f !== undefined) for (const m of [f['method'], f['method_ref'], `${String(f['method'])}@${String(f['method_version'])}`]) if (typeof m === 'string' && m !== '') methodVia.set(m, a.triggerObjectId);
      if (r !== undefined && typeof r['model_ref'] === 'string') methodVia.set(r['model_ref'], a.triggerObjectId);
    }
    const products = new Map<string, AffectedObject>();
    const short = (id: string): string => `${id.slice(0, 8)}…`;
    const rests = (id: string | null): string => (id === a.triggerObjectId ? 'that changed' : 'that rests on what changed');
    let ids = [...reached]; let series = [...seriesVia.keys()]; let methods = [...methodVia.keys()];
    let round = 1;
    for (; round <= MAX_HOPS && ids.length + series.length + methods.length > 0; round += 1) {
      const rows: Array<Record<string, unknown>> = [];
      for (let i = 0; i < Math.max(ids.length, 1); i += IN_SLICE) {
        const slice = ids.slice(i, i + IN_SLICE);
        const sl = i === 0 ? series : []; const ml = i === 0 ? methods : [];
        if (slice.length + sl.length + ml.length === 0) continue;
        rows.push(...((await cap.readProductCitations().selectAll()
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          .where((eb: any) => eb.or([
            ...(slice.length > 0 ? [eb('cites_id', 'in', slice)] : []),
            ...(sl.length > 0 ? [eb.and([eb('cites_kind', '=', 'series'), eb('cites_ref', 'in', sl)])] : []),
            ...(ml.length > 0 ? [eb.and([eb('cites_kind', '=', 'method'), eb('cites_ref', 'in', ml)])] : []),
          ]))
          .execute()) as Array<Record<string, unknown>>));
      }
      const nextIds: string[] = []; const nextSeries: string[] = [];
      // deterministic: the citations in a stable order, so the same graph gives the same answer
      rows.sort((x, y) => `${String(x['product_kind'])}:${String(x['product_id'])}:${String(x['product_version'] ?? '')}:${String(x['cites_kind'])}:${String(x['cites_id'] ?? x['cites_ref'])}`
        .localeCompare(`${String(y['product_kind'])}:${String(y['product_id'])}:${String(y['product_version'] ?? '')}:${String(y['cites_kind'])}:${String(y['cites_id'] ?? y['cites_ref'])}`));
      for (const r of rows) {
        const kind = String(r['product_kind']); const id = String(r['product_id']);
        const version = r['product_version'] === null || r['product_version'] === undefined ? null : Number(r['product_version']);
        const key = `${kind}:${id}:${version ?? ''}`;
        if (products.has(key)) continue;
        const citesKind = String(r['cites_kind']);
        const citesId = r['cites_id'] === null || r['cites_id'] === undefined ? null : String(r['cites_id']);
        const citesRef = r['cites_ref'] === null || r['cites_ref'] === undefined ? null : String(r['cites_ref']);
        const via = citesKind === 'series' ? (citesRef !== null ? seriesVia.get(citesRef) ?? null : null)
          : citesKind === 'method' ? (citesRef !== null ? methodVia.get(citesRef) ?? null : null) : citesId;
        if (via === null || (citesKind !== 'series' && citesKind !== 'method' && !reached.has(via))) continue;
        const type = String(r['object_type']);
        const cv = r['cited_version'] === null || r['cited_version'] === undefined ? '' : ` at version ${String(r['cited_version'])}`;
        const reachedVia = kind === 'decision_package'
          ? (citesKind === 'strategy' ? `the package is for decision "${g.found.get(via)?.title ?? short(via)}" ${rests(via)}`
            : `version ${String(version)}'s option cites the ${citesKind} ${short(via)}${cv} ${rests(via)}`)
          : kind === 'publication' ? `version ${String(version)} publishes the ${citesKind === 'briefing' ? 'briefing' : 'decision package (report)'} ${short(via)} ${rests(via)}`
          : kind === 'export_package' ? `it exported manifest ${citesRef ?? '?'} of the evidence ${short(via)}${cv} ${rests(via)}`
          : kind === 'information_set' ? (citesKind === 'forecast' ? `the forecast ${short(via)} ${rests(via)} pins it` : `it froze the evidence ${short(via)}${cv} ${rests(via)}`)
          : kind === 'lesson' ? (citesKind === 'memory_item' ? `it is recorded as the memory item ${short(via)} ${rests(via)}` : `it was learned from the decision package ${short(via)} ${rests(via)}`)
          : citesKind === 'series' ? `it validated the series ${citesRef ?? '?'}, whose forecast ${short(via)} ${rests(via)}`
          : citesKind === 'method' ? `it validated the method ${citesRef ?? '?'} under the model incident`
          : `it rests on the ${citesKind.replace(/_/g, ' ')} ${short(via)} ${rests(via)}`;
        const hop = (hopOf.get(via) ?? 0) + 1;
        const ref = `${type}:${id}${version === null ? '' : `@${version}`}`;
        const viaPath = citesKind === 'series' || citesKind === 'method' ? g.pathOf(via) : g.pathOf(via);
        const row: AffectedObject = { strategy_object_id: id, object_type: type, title: String(r['title'] ?? ref), reached_via: reachedVia, hop, version, path: [...viaPath, ref], product_kind: kind, via_id: via };
        products.set(key, row);
        const bucket = PRODUCT_BUCKET[kind];
        if (bucket !== undefined) buckets[bucket].push(row);
        if (!reached.has(id)) { reached.add(id); hopOf.set(id, hop); g.refOf.set(id, `${type}:${id}`); if (!g.parentOf.has(id)) g.parentOf.set(id, via); nextIds.push(id); }
        const subject = r['subject_ref'];
        if (typeof subject === 'string' && subject !== '' && !seriesVia.has(subject)) { seriesVia.set(subject, id); nextSeries.push(subject); }
      }
      ids = nextIds; series = nextSeries; methods = [];
    }
    const unexplored = round > MAX_HOPS
      ? [...ids.map((id) => ({ kind: 'product', id, via: 'a product the bounded walk reached; what cites it was not read' })),
         ...series.map((sk) => ({ kind: 'series', id: sk, via: 'a series a reached product is about; its evaluation records were not read' }))]
      : [];
    for (const b of Object.values(buckets)) b.sort((x, y) => x.hop - y.hop || x.strategy_object_id.localeCompare(y.strategy_object_id) || (x.version ?? 0) - (y.version ?? 0));
    return { buckets, unexplored };
  }
  /* end B50 ci */

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
      /* B50 ci */ triggerObjectType?: string; /* end B50 ci */
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
      forecasts: walked.forecasts.map((f) => ({ forecast_id: f.strategy_object_id, reached_via: f.reached_via, hop: f.hop, /* B50 ci */ path: f.path ?? [] /* end B50 ci */ })),
      twins: walked.twins.map((t) => ({ twin_id: t.strategy_object_id, via_id: t.via_id ?? null, via_ids: t.via_ids ?? (t.via_id ? [t.via_id] : []), reached_via: t.reached_via, hop: t.hop, /* B50 ci */ path: t.path ?? [] /* end B50 ci */ })),
      simulations: walked.simulations.map((r) => ({ run_id: r.strategy_object_id, reached_via: r.reached_via, hop: r.hop, /* B50 ci */ path: r.path ?? [] /* end B50 ci */ })),
      warnings: walked.warnings.map((w) => ({ warning_id: w.strategy_object_id, reached_via: w.reached_via, hop: w.hop, /* B50 ci */ path: w.path ?? [] /* end B50 ci */ })),
      briefings: walked.briefings.map((b) => ({ briefing_id: b.strategy_object_id, reached_via: b.reached_via, hop: b.hop, /* B50 ci */ path: b.path ?? [] /* end B50 ci */ })),
      memoryItems: walked.memoryItems.map((m) => ({ item_id: m.strategy_object_id, reached_via: m.reached_via, hop: m.hop, /* B50 ci */ path: m.path ?? [] /* end B50 ci */ })),
      /* B32 (0089) graph */ strategyNodes: strategyNodesOf(walked), /* end B32 graph */
      /* B50 ci */ products: productItemsOf(walked), /* end B50 ci */
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
   * Where a domain has a registered propagation agent (0060), `CorrectionApplied`
   * is consumed and the walk runs automatically; where it has none, or the automatic
   * walk was refused, failed or truncated, propagation happens when a person asks
   * for it. Either way the outstanding obligation is VISIBLE rather than a
   * correction sitting silently unpropagated: this is the queue of corrections
   * whose downstream impact nothing has finished assessing, each row carrying the
   * latest automatic attempt's state and reason under `automatic`.
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
      const automatic = c['automatic_state'] === null || c['automatic_state'] === undefined ? null : {
        state: String(c['automatic_state']),
        deliveries: Number(c['automatic_deliveries'] ?? 0),
        attempts: Number(c['automatic_attempts'] ?? 0),
        last_error: (c['automatic_last_error'] as string | null) ?? null,
        last_delivered_at: c['automatic_last_delivered_at'] ?? null,
        agent_id: (c['automatic_agent_id'] as string | null) ?? null,
        event_id: (c['automatic_event_id'] as string | null) ?? null,
      };
      const base = unwalked
        ? 'propagation incomplete: no dependency walk has run against this correction'
        : state === 'pending'
          ? `propagation state unreconciled: assessment ${String(assessment)} is linked to this `
            + 'case but its coverage has not been reconciled; treat the case as partial until it is'
          : String(c['propagation_unresolved']);
      // The automatic attempt's outcome is stated beside the case's own status, never instead of it.
      const status = automatic === null ? base
        : automatic.state === 'failed'
          ? `${base}; automatic propagation failed: ${automatic.last_error ?? 'no reason recorded'}; operator-initiated propagation remains available`
          : automatic.state === 'partial'
            ? `${base}; automatic propagation was partial: ${automatic.last_error ?? 'the walk did not cover the case'}; operator-initiated propagation remains available`
            : `${base}; automatic propagation ${automatic.state}`;
      const { cursor_received_at: _c, automatic_state: _s, automatic_deliveries: _d, automatic_attempts: _a, automatic_last_error: _e,
              automatic_last_delivered_at: _l, automatic_agent_id: _g, automatic_event_id: _v, ...row } = c;
      return {
        ...row,
        propagation_status: status,
        historical_sentence: unwalked ? String(c['propagation_unresolved']) : null,
        automatic,
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
/* B32 (0089) graph */
/** The six new strategy types the walk reached, as graph.record_impact records them (affected_strategy_nodes): one list, each with its type. */
export function strategyNodesOf(w: Pick<ImpactResult, 'capabilities' | 'initiatives' | 'resources' | 'measures' | 'stakeholders' | 'exposures'>):
  Array<{ strategy_object_id: string; object_type: string; title: string; reached_via: string; hop: number; /* B50 ci */ path?: string[] /* end B50 ci */ }> {
  return [...(w.capabilities ?? []), ...(w.initiatives ?? []), ...(w.resources ?? []), ...(w.measures ?? []), ...(w.stakeholders ?? []), ...(w.exposures ?? [])]
    .map((x) => ({ strategy_object_id: x.strategy_object_id, object_type: x.object_type, title: x.title, reached_via: x.reached_via, hop: x.hop,
                   /* B50 ci */ ...(x.path === undefined ? {} : { path: x.path }) /* end B50 ci */ }));
}
/* end B32 graph */

/* B50 ci */
/**
 * B50 §CI: the items graph.record_impact's p_products carries — the scenarios (reached since Phase 4, recorded nowhere until now), the graph
 * state, and the new buckets; each { bucket, product_kind, object_type, product_id, product_version, title, reached_via, hop, path }. The port
 * classes them (and the existing buckets) from the facts it reads; the walk never states a class.
 */
export function productItemsOf(w: Pick<ImpactResult, 'scenarios' | 'decisionPackages' | 'publications' | 'exportPackages' | 'evaluationDatasets' | 'lessons' | 'graphState'>):
  Array<{ bucket: string; product_kind: string; object_type: string; product_id: string; product_version: number | null; title: string; reached_via: string; hop: number; path: string[] }> {
  const item = (bucket: string, kind: string, x: AffectedObject) => ({ bucket, product_kind: kind, object_type: x.object_type, product_id: x.strategy_object_id,
    product_version: x.version ?? null, title: x.title, reached_via: x.reached_via, hop: x.hop, path: x.path ?? [] });
  return [
    ...w.scenarios.map((x) => item('scenarios', 'scenario', x)),
    ...(w.graphState ?? []).map((x) => item('graph_state', x.product_kind ?? 'claim', x)),
    ...(w.decisionPackages ?? []).map((x) => item('decision_packages', 'decision_package', x)),
    ...(w.publications ?? []).map((x) => item('publications', 'publication', x)),
    ...(w.exportPackages ?? []).map((x) => item('export_packages', 'export_package', x)),
    ...(w.evaluationDatasets ?? []).map((x) => item('evaluation_datasets', x.product_kind ?? 'backtest', x)),
    ...(w.lessons ?? []).map((x) => item('lessons', 'lesson', x)),
  ];
}
/* end B50 ci */

function buildStatement(
  invalidationId: string,
  w: Omit<ImpactResult, 'invalidationId' | 'correctionCaseId' | 'statement'>,
): string {
  /* B32 (0089) graph */ const b32 = strategyNodesOf(w); /* end B32 graph */
  /* B50 ci */
  const b50 = ([[w.decisionPackages, 'decision package version(s)'], [w.publications, 'publication version(s)'], [w.exportPackages, 'export package(s)'],
                [w.evaluationDatasets, 'evaluation dataset(s)'], [w.lessons, 'lesson(s)']] as Array<[AffectedObject[] | undefined, string]>)
    .filter(([xs]) => (xs ?? []).length > 0).map(([xs, words]) => `${(xs ?? []).length} ${words}`);
  const b50n = (w.decisionPackages ?? []).length + (w.publications ?? []).length + (w.exportPackages ?? []).length + (w.evaluationDatasets ?? []).length + (w.lessons ?? []).length;
  /* end B50 ci */
  const total = w.assumptions.length + w.objectives.length + w.decisions.length + w.commitments.length
    + w.forecasts.length + w.scenarios.length + w.warnings.length + w.twins.length + w.simulations.length + w.briefings.length + w.memoryItems.length
    /* B32 (0089) graph */ + b32.length /* end B32 graph */ /* B50 ci */ + b50n /* end B50 ci */;
  const reach = `reached ${w.reachedClaims.length} claim(s), ${w.reachedEntities.length} `
    + `entity(ies) and ${w.reachedEdges.length} edge(s)`;
  const phase4 = w.forecasts.length + w.scenarios.length + w.warnings.length === 0 ? ''
    : `; ${w.forecasts.length} forecast(s) marked for attention, ${w.scenarios.length} scenario(s) reported, ${w.warnings.length} warning(s) marked for attention`;
  const phase5 = w.twins.length + w.simulations.length === 0 ? ''
    : `; ${w.twins.length} twin(s) whose citing versions are marked unverified and ${w.simulations.length} simulation run(s) surfaced`;
  const phase6 = (w.briefings.length === 0 ? '' : `; ${w.briefings.length} briefing(s) composed on what changed re-flagged`)
    + (w.memoryItems.length === 0 ? '' : `; ${w.memoryItems.length} memory item(s) resting on what changed marked for attention`)
    /* B32 (0089) graph: the new types, counted per type, reported for human review (nothing marked) */
    + (b32.length === 0 ? '' : `; ${[['CAP', 'capability(ies)'], ['INI', 'initiative(s)'], ['RSC', 'resource(s)'], ['MSR', 'measure(s)'], ['STK', 'stakeholder(s)'], ['RSK', 'risk(s)/opportunity(ies)']]
      .map(([t, words]) => [b32.filter((x) => x.object_type === t).length, words] as const).filter(([n]) => n > 0).map(([n, words]) => `${n} ${words}`).join(', ')} reported for human review`)
    /* end B32 graph */
    /* B50 ci: the new buckets, counted, each product classed by the port for its owner */
    + (b50.length === 0 ? '' : `; ${b50.join(', ')} reached — each classed for its owner`)
    /* end B50 ci */;
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
    + `${w.commitments.length} commitment(s) reported for human review${phase4}${phase5}${phase6}; `
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
