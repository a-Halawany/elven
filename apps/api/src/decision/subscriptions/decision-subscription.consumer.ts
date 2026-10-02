/**
 * The DECISION consumer (AU-MEM-0030: "… consumers for … decisions …"), registered by the decision module. What a
 * change means for a decision package, in the package's own terms (Phase 6, C-004): an INPUT it cites — the DEC
 * object the walk reached, a run, forecast, claim, evidence, assumption or warning an option's consequences cite —
 * changed, and that is RECORDED on the package (decision.note_input_invalidated, once per cause). The package's
 * state, its approvals, its commitment and its monitoring are never touched: a human decision is not rewritten by
 * a subscriber; the room shows the note and the owner decides.
 *
 * RECOMPUTATION CHANGING A RECOMMENDATION MATERIALLY (AU-MEM-0039, 0065). When a forecast an option cites is
 * SUPERSEDED by a recomputation (GraphChanged/forecast.superseded), the consumer MEASURES the change against the
 * subscription's declared materiality rule (budgets.materiality: relative_q50, default 0.10 — the relative shift of
 * the central estimate; and whether the new central estimate left the old q10–q90 band): a material change is
 * exposed on the package note with the class `material_change` — human review for an open package, compensation for
 * one whose decision was executed — with the measure; an immaterial one is noted with its measure and no failure
 * state. The choice, the options and the package state are never rewritten (V3 §32: no automatic rewrite of a human
 * decision).
 *
 * THE LIFECYCLE KINDS (0078, B18; D16, C7, C13). A forecast an option cites WITHDRAWN as unfit
 * (GraphChanged/forecast.withdrawn) or a run it cites INVALIDATED (GraphChanged/simulation.invalidated) is a CATEGORICAL
 * loss of the input — nothing is measured because nothing replaced it — and is exposed as `material_change` (human review
 * for an open package, compensation for one whose decision was executed) with a note built from the event's typed block
 * (never a second read of the forecast or the run); the ledger event stays `input.invalidated`. The exposure is ONE chain:
 * a lifecycle loss, else a material recomputation, else an executed package's changed input. A twin's OWN admission
 * (GraphChanged/twin.state_changed, whose objects.simulations are the SUPERSEDED version's runs) is noted on the packages
 * citing those runs WITHOUT exposure: the runs stand — a newer twin version exists and the owner judges whether to
 * re-simulate. A REOPENED package (0078, D11; C8) is open — its new draft hears of its inputs — and its standing commitment
 * is executed until it is re-committed.
 *
 * THE FITNESS KIND (0081, B21; D7). A forecast an option cites ASSESSED UNFIT (GraphChanged/forecast.fitness_changed — a
 * transition to unfit, or a class change while unfit) is exposed as `material_change` like the lifecycle kinds — human
 * review for an open package, compensation for one whose decision was executed — with a note built from the typed
 * `forecast_fitness` block (the class, the rule version, the window and the coverage): the forecast is NOT withdrawn, so the
 * owner decides whether the option stands; the ledger event stays `input.invalidated`. A new method, so a new identity.
 *
 * MATERIAL CHANGE AS AN EVENT (0084, B23; L10-I02). A `material_change` exposure on a NEW note (the note port answered true — once
 * per cause) publishes MaterialChangeRaised@v1 from the item's own write (0066 §2: the outbox row commits with the note or not at
 * all), with the transparent dimensions and the attention-policy version active at publication (material-change.ts); a redelivery or
 * a replay finds the note already recorded and publishes nothing. The attention subscriber routes it (decision.material_change); the
 * decisions consumer never routes anything itself. A new method, so a new identity.
 *
 * Items are package ids.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { sql } from 'kysely';
import { SubscriptionDispatcherService } from '../../graph/subscriptions/subscription-dispatcher.service.js';
import { touchedIds } from '../../graph/subscriptions/change-events.js';
import type { ChangeEvent, SubscriptionConsumer } from '../../graph/subscriptions/graph-change.js';
import { DecisionCapability, type DecisionSubscriberWrites } from '../decision.capabilities.js';
/* B23 (0084) attention */
import { materialChangeRaisedEvent, type MaterialBasis } from './material-change.js';
/* end B23 attention */

type Row = Record<string, unknown>;
// 0078 (C8): a reopened package is open — the draft the reopen carried hears of the inputs it cites.
const OPEN_STATES = ['draft', 'proposed', 'under_review', 'approved', 'committed', 'monitoring', 'reopened'];
/** States in which the decision has been executed on the world (committed, being monitored; reopened — the standing commitment is executed until re-committed, 0078): AU-MEM-0039's "committed action already executed". */
const EXECUTED_STATES = ['committed', 'monitoring', 'reopened'];
/** The default materiality rule: a relative shift of the central estimate at or above this is material; so is leaving the old band. */
const DEFAULT_RELATIVE_Q50 = 0.10;
interface Materiality { rule: { relative_q50: number; band: boolean }; old_q50: number | null; new_q50: number | null; relative: number | null; outside_band: boolean | null; material: boolean; superseded: string; superseding: string }

@Injectable()
export class DecisionSubscriptionConsumer implements SubscriptionConsumer<DecisionSubscriberWrites>, OnModuleInit {
  readonly kind = 'decisions' as const;
  readonly objectType = 'DPK';
  readonly purpose = 'decision';
  constructor(private readonly dispatcher: SubscriptionDispatcherService) {}
  onModuleInit(): void { this.dispatcher.registerConsumer(this); }
  capability(tx: Parameters<typeof DecisionCapability.subscriber>[0], action: string): DecisionSubscriberWrites { return DecisionCapability.subscriber(tx, action); }

  /**
   * The forecasts a recomputation event reaches, by the SUPERSESSION CHAIN: the event names the forecast just superseded;
   * every earlier forecast of the same question that was itself superseded along the chain is reached too, so a package
   * citing the forecast it decided on (three re-issues ago) still hears of the fourth recomputation.
   */
  private async supersessionChain(cap: DecisionSubscriberWrites, superseded: string): Promise<string[]> {
    const chain = [superseded]; const seen = new Set(chain);
    for (let cursor = superseded, hops = 0; hops < 500; hops += 1) {
      const prev = (await cap.readForecasts().select(['forecast_id'] as never).where('superseded_by' as never, '=', cursor as never).execute()) as Row[];
      const ids = prev.map((r) => String(r['forecast_id'])).filter((id) => !seen.has(id));
      if (ids.length === 0) break;
      for (const id of ids) { seen.add(id); chain.push(id); }
      cursor = ids[0]!;
    }
    return chain;
  }

  /** The packages this event reaches, each with the inputs it reaches them through, the forecast it cites on the chain (a recomputation), and whether its decision was already executed. */
  private async affected(cap: DecisionSubscriberWrites, event: ChangeEvent): Promise<Map<string, { via: string[]; state: string; executed: boolean; citedForecast: string | null }>> {
    const t = touchedIds(event);
    const recomputation = event.event_type === 'GraphChanged' && event.payload.change.kind === 'forecast.superseded' ? (event.payload.objects.forecasts[0] ?? null) : null;
    const chain = recomputation === null ? [] : await this.supersessionChain(cap, recomputation);
    const cited = new Set<string>([...t.claims, ...t.evidence, ...t.forecasts, ...t.runs, ...t.strategy, ...chain]);
    const packages = (await cap.readPackages().selectAll().where('state' as never, 'in', OPEN_STATES as never).execute()) as Row[];
    const out = new Map<string, { via: string[]; state: string; executed: boolean; citedForecast: string | null }>();
    for (const p of packages) {
      const id = String(p['package_id']); const via: string[] = []; let citedForecast: string | null = null;
      const dec = String(p['decision_object_id']);
      if (t.strategy.has(dec)) via.push(`decision object ${dec}`);
      const version = p['current_version'] == null ? null : Number(p['current_version']);
      if (version !== null && cited.size > 0) {
        const options = (await cap.readOptions().select(['key', 'consequences'] as never).where('package_id' as never, '=', id as never).where('version' as never, '=', version as never).execute()) as Row[];
        for (const o of options) {
          const cs = Array.isArray(o['consequences']) ? (o['consequences'] as Array<{ kind?: unknown; id?: unknown }>) : [];
          for (const c of cs) {
            if (!cited.has(String(c.id ?? ''))) continue;
            via.push(`option ${String(o['key'])} cites ${String(c.kind)} ${String(c.id)}`);
            if (chain.includes(String(c.id)) && citedForecast === null) citedForecast = String(c.id);
          }
        }
      }
      // A committed or monitored package has been EXECUTED: an input invalidated after the commitment is a condition a
      // person must route — compensation is the decision owner's — never a rewrite (C-004). Exposed on the note.
      const state = String(p['state']);
      if (via.length > 0) out.set(id, { via, state, executed: EXECUTED_STATES.includes(state), citedForecast });
    }
    return out;
  }

  async resolveItems(cap: DecisionSubscriberWrites, _scope: { tenantId: string; domainId: string }, event: ChangeEvent): Promise<string[]> {
    return [...(await this.affected(cap, event)).keys()].sort();
  }

  /** The measure of a recomputation: the central estimate of the forecast the package CITES against the superseding one's, under the declared rule. */
  private async materiality(cap: DecisionSubscriberWrites, event: ChangeEvent, policy: Record<string, unknown> | undefined, citedForecast: string | null): Promise<Materiality | null> {
    if (event.event_type !== 'GraphChanged' || event.payload.change.kind !== 'forecast.superseded') return null;
    const superseded = citedForecast ?? event.payload.objects.forecasts[0] ?? null; const superseding = event.payload.cause.target_id;
    if (superseded === null || superseding === null) return null;
    const m = (policy?.['materiality'] ?? {}) as { relative_q50?: unknown; band?: unknown };
    const rule = { relative_q50: typeof m.relative_q50 === 'number' && Number.isFinite(m.relative_q50) && m.relative_q50 > 0 ? m.relative_q50 : DEFAULT_RELATIVE_Q50, band: m.band !== false };
    const rows = (await cap.readForecasts().select(['forecast_id', 'quantiles'] as never).where('forecast_id' as never, 'in', [superseded, superseding] as never).execute()) as Row[];
    const q = (id: string) => (rows.find((r) => String(r['forecast_id']) === id)?.['quantiles'] ?? null) as { q10?: number; q50?: number; q90?: number } | null;
    const oldQ = q(superseded); const newQ = q(superseding);
    const oldQ50 = typeof oldQ?.q50 === 'number' ? oldQ.q50 : null; const newQ50 = typeof newQ?.q50 === 'number' ? newQ.q50 : null;
    if (oldQ50 === null || newQ50 === null) return { rule, old_q50: oldQ50, new_q50: newQ50, relative: null, outside_band: null, material: true, superseded, superseding };
    const relative = Math.abs(newQ50 - oldQ50) / Math.max(Math.abs(oldQ50), 1e-9);
    const outsideBand = typeof oldQ?.q10 === 'number' && typeof oldQ?.q90 === 'number' ? (newQ50 < oldQ.q10 || newQ50 > oldQ.q90) : null;
    const material = relative >= rule.relative_q50 || (rule.band && outsideBand === true);
    return { rule, old_q50: oldQ50, new_q50: newQ50, relative: Math.round(relative * 10_000) / 10_000, outside_band: outsideBand, material, superseded, superseding };
  }

  async applyItem(cap: DecisionSubscriberWrites, scope: { tenantId: string; domainId: string }, event: ChangeEvent, item: string, actor: string, correlationId: string, subscriptionId: string, policy?: Record<string, unknown>) {
    const a = (await this.affected(cap, event)).get(item) ?? { via: [], state: 'unknown', executed: false, citedForecast: null };
    const measure = await this.materiality(cap, event, policy, a.citedForecast);
    // 0078 (B18): the lifecycle kinds are read from the event's typed block — the withdrawal, the invalidation, the admission; 0081 (B21): the fitness kind.
    const p = event.event_type === 'GraphChanged' ? event.payload : null;
    const lifecycle = p !== null && (p.change.kind === 'forecast.withdrawn' || p.change.kind === 'simulation.invalidated' || p.change.kind === 'forecast.fitness_changed') ? p : null;
    // The admission is keyed on the KIND (C13): its typed block is read for the note; the objects.twins entry names the twin either way.
    const admission = p !== null && p.change.kind === 'twin.state_changed'
      ? { twin_id: p.twin?.twin_id ?? p.objects.twins[0] ?? null, version: p.twin?.version ?? null, supersedes: p.twin?.supersedes ?? null, branch_id: p.twin?.branch_id ?? null }
      : null;
    const lifecycleDetails = lifecycle === null
      ? admission === null ? null : { kind: 'twin.state_changed', twin_id: admission.twin_id, version: admission.version, supersedes: admission.supersedes }
      : lifecycle.change.kind === 'forecast.withdrawn'
        ? { kind: 'forecast.withdrawn', ref: lifecycle.forecast?.forecast_id ?? null, reason: lifecycle.forecast?.reason ?? null, unfit_class: lifecycle.forecast?.unfit_class ?? null }
        : lifecycle.change.kind === 'forecast.fitness_changed'
          ? { kind: 'forecast.fitness_changed', ref: lifecycle.forecast_fitness?.forecast_id ?? lifecycle.objects.forecasts[0] ?? null, class: lifecycle.forecast_fitness?.class ?? null, state: lifecycle.forecast_fitness?.state ?? 'unfit' }
          : { kind: 'simulation.invalidated', ref: lifecycle.simulation?.run_id ?? null, reason: lifecycle.simulation?.reason ?? null, trigger: lifecycle.simulation?.trigger ?? null };
    let exposure: { failureClass: 'executed_action' | 'material_change'; disposition: 'compensation' | 'human_review'; note: string } | undefined;
    if (lifecycle !== null && lifecycle.change.kind === 'forecast.fitness_changed') {
      // 0081 (B21, D7): the forecast the option cites was ASSESSED UNFIT — not withdrawn (that stays the owner's act), so the option
      // is not lost; it rests on a forecast the rule found unfit. Exposed as material like the lifecycle kinds; the note is the block's.
      const ff = lifecycle.forecast_fitness;
      const cov = ff?.measures.coverage?.['observed'];
      const what = `forecast ${ff?.forecast_id ?? lifecycle.objects.forecasts[0]} (the one the option cites) was ASSESSED UNFIT (${ff?.class}) under rule v${ff?.rule_version}: ${ff?.measures.outcomes ?? 0} outcome(s), coverage ${cov === null || cov === undefined ? 'n/a' : String(cov)} — not withdrawn; the owner decides whether the option stands`;
      exposure = { failureClass: 'material_change', disposition: a.executed ? 'compensation' : 'human_review',
                   note: `${what}; routed as material because the option citing it may no longer be the recommendation — ${a.executed ? 'the decision was executed: compensation, challenge or a reopen (decision.package.reopen) is the owner\'s' : 'the owner reviews the package'}` };
    } else if (lifecycle !== null) {
      // A CATEGORICAL loss of a cited input (0078, D16): the forecast withdrawn as unfit, the run's result invalidated — routed as
      // material because nothing replaced it and the change cannot be shown immaterial. The note is the block's, never a re-read.
      const what = lifecycle.change.kind === 'forecast.withdrawn'
        ? `forecast ${lifecycle.forecast?.forecast_id} (the one the option cites) was WITHDRAWN as unfit (${lifecycle.forecast?.unfit_class}): ${lifecycle.forecast?.reason}`
        : `run ${lifecycle.simulation?.run_id} (the one the option cites) was INVALIDATED (${lifecycle.simulation?.trigger}): ${lifecycle.simulation?.reason}`;
      exposure = { failureClass: 'material_change', disposition: a.executed ? 'compensation' : 'human_review',
                   note: `${what} — a categorical loss of a cited input, routed as material because it cannot be shown immaterial; ${a.executed ? 'the decision was executed: compensation, challenge or a reopen (decision.package.reopen) is the owner\'s' : 'the owner reviews the package'}` };
    } else if (admission !== null) {
      // A twin's OWN admission (0078, C13): the cited runs rest on the superseded version and STAND — noted, no exposure; the
      // owner judges whether to re-simulate. Not an executed package's changed input: nothing the package rests on changed.
    } else if (measure !== null && measure.material) {
      // A recomputation changed the recommendation's basis MATERIALLY: exposed with its measure; the route depends on whether the
      // decision was executed. Nothing is rewritten — the owner re-opens a version or compensates.
      exposure = { failureClass: 'material_change', disposition: a.executed ? 'compensation' : 'human_review',
                   note: measure.relative === null
                     ? `a recomputation superseded forecast ${measure.superseded} (the one the option cites) with ${measure.superseding}, and the change is UNMEASURABLE (a central estimate is missing on one side: ${measure.old_q50} → ${measure.new_q50}) — routed as material because it cannot be shown immaterial; ${a.executed ? 'the decision was executed: compensation or challenge is the owner\'s' : 'the owner reviews the package'}`
                     : `a recomputation superseded forecast ${measure.superseded} (the one the option cites) with ${measure.superseding}: the central estimate moved ${measure.old_q50} → ${measure.new_q50} (${(measure.relative * 100).toFixed(1)} %${measure.outside_band ? ', outside the cited q10–q90 band' : ''}) — at or beyond the declared rule (relative_q50 ${measure.rule.relative_q50}); the option citing it may no longer be the recommendation — ${a.executed ? 'the decision was executed: compensation or challenge is the owner\'s' : 'the owner reviews the package'}` };
    } else if (a.executed && measure === null) {
      exposure = { failureClass: 'executed_action', disposition: 'compensation', note: `the package is ${a.state}: its decision has been executed; an input it rested on changed after the commitment — compensation or challenge is the decision owner's, nothing here is reversed` };
    }
    const details = { event_type: event.event_type, change_kind: event.payload.change.kind, via: a.via, package_state: a.state, executed: a.executed,
                      ...(measure === null ? {} : { recomputation: measure }),
                      ...(lifecycleDetails === null ? {} : { lifecycle: lifecycleDetails }),
                      ...(exposure === undefined ? {} : { failure_class: exposure.failureClass, disposition: exposure.disposition }),
                      note: exposure?.note ?? (admission !== null
                                                 ? `twin ${admission.twin_id} has a newer admitted version ${admission.version} (branch ${admission.branch_id}); the cited runs rest on version ${admission.supersedes} and stand; the owner judges whether to re-simulate`
                                                 : measure === null ? 'an input this package cites changed; the package, its approvals and its commitment are unchanged — the owner decides'
                                                                    : `a recomputation superseded forecast ${measure.superseded} (the one the option cites) with ${measure.superseding}; the change (${measure.relative === null ? 'unmeasurable' : `${(measure.relative * 100).toFixed(1)} %`}) is within the declared rule — noted, no review routed`) };
    const noted = await cap.noteInputInvalidated({ packageId: item, tenantId: scope.tenantId, domainId: scope.domainId, details, outboxEventId: event.event_id, subscriptionId, actor, correlationId });
    const effect = measure === null ? 'input.invalidated' : measure.material ? 'input.recomputed_materially' : 'input.recomputed';
    const base = noted ? { effect, effectRef: item, details: { via: a.via, package_state: a.state, executed: a.executed, ...(measure === null ? {} : { recomputation: measure }), ...(lifecycleDetails === null ? {} : { lifecycle: lifecycleDetails }) } }
                       : { effect: 'input.already_noted', effectRef: item, details: { package_state: a.state, executed: a.executed } };
    /* B23 (0084) attention: a material_change exposure on a NEW note → MaterialChangeRaised@v1 in this item's transaction (once per cause). */
    if (noted && exposure !== undefined && exposure.failureClass === 'material_change') {
      const basis: MaterialBasis = lifecycle !== null ? (lifecycle.change.kind === 'forecast.fitness_changed' ? 'assessed_unfit' : 'categorical_loss')
        : measure !== null && measure.relative === null ? 'unmeasurable' : 'measured';
      const raised = await this.materialChangeRaised(cap, event, item, a, exposure, basis, actor);
      return { ...base, details: { ...base.details, material_change_raised: { dims: raised.payload['dims'], policy_version: raised.payload['policy_version'] } }, exposure, outboxEvents: [raised] };
    }
    /* end B23 attention */
    return exposure === undefined ? base : { ...base, exposure };
  }

  /* B23 (0084) attention: the event's material — the package as it stands, its current version's decision deadline, the note just
     recorded, and the attention-policy version active now (null: no policy — the engine abstains at delivery). */
  private async materialChangeRaised(cap: DecisionSubscriberWrites, event: ChangeEvent, packageId: string, a: { via: string[]; state: string; executed: boolean },
                                     exposure: { disposition: string; note: string }, basis: MaterialBasis, actor: string) {
    const p = ((await cap.readPackages().select(['package_id', 'title', 'owner_principal_id', 'current_version', 'state'] as never).where('package_id' as never, '=', packageId as never).execute()) as Row[])[0] ?? null;
    const version = p === null || p['current_version'] == null ? null : Number(p['current_version']);
    const v = version === null ? null : ((await cap.readVersions().select(['choice'] as never).where('package_id' as never, '=', packageId as never).where('version' as never, '=', version as never).execute()) as Row[])[0] ?? null;
    const choice = (v?.['choice'] ?? null) as Row | null;
    const deadline = choice !== null && typeof choice['decision_deadline'] === 'string' ? choice['decision_deadline'] : null;
    const note = ((await cap.readEvents().select(['event_id'] as never).where('package_id' as never, '=', packageId as never).where('event' as never, '=', 'input.invalidated' as never)
      .where(sql`details ->> 'outbox_event_id'` as never, '=', event.event_id as never).execute()) as Row[])[0] ?? null;
    const policy = ((await cap.readAttentionPolicies().select(['version'] as never).where('state' as never, '=', 'active' as never).execute()) as Row[])[0] ?? null;
    return materialChangeRaisedEvent({
      packageId, version, packageState: String(p?.['state'] ?? a.state), title: String(p?.['title'] ?? packageId), owner: (p?.['owner_principal_id'] as string | null | undefined) ?? null,
      executed: a.executed, disposition: exposure.disposition,
      trigger: { eventId: event.event_id, eventType: event.event_type, changeKind: String(event.payload.change.kind), noteId: note === null ? null : String(note['event_id']), via: a.via },
      basis, deadline, policyVersion: policy === null ? null : Number(policy['version']), note: exposure.note, actor, occurredAt: new Date(),
    });
  }
  /* end B23 attention */
}
