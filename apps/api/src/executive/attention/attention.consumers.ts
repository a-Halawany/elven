/**
 * THE FOUR B22 CONSUMERS (migration 0083) — registered with the subscription dispatcher like the seven graph consumers, each with its
 * own action, role and identity, each selecting only the event types it declares (graph.subscription_consumer_events):
 *
 *   observations   ObservationRecorded (L1-I03) → the TRANSFORMATION PLAN selected (intelligence.select_transformation_plan).
 *   source-health  SourceHealthChanged (L1-I04) → IMPACT MARKERS on the derived products (observation.mark_source_impact) and, while
 *                  degraded, the COVERAGE LOSS routed under the attention policy (source.coverage_loss; NOT-10).
 *   proposals      ClaimsExtracted / IntelligenceObjectAdmitted (L2-I02) → each proposed claim HELD FOR REVIEW routed to the review
 *                  queue (proposal.review); nothing promoted.
 *   attention      ForecastFitnessChanged, ScenarioCoherenceFailed, EarlyWarningRaised → routed under the policy; AttentionPolicyChanged
 *                  (L10-I05) → every live item re-evaluated and the POLICY CAUSE noted on every committed or monitored package (L9-I05).
 *
 * THE CONTRACT CHECK (the interface contracts' "quarantine invalid event"): each consumer reads its event's payload against the
 * contract its producers write; a payload that is not the contract resolves to ONE item, `event:<id>`, left UNRESOLVED with the class
 * invalid_event → human_review (effect event.quarantined) — never applied, never silently dropped; the committed publication is the
 * outbox row itself, which the dispatcher's reconciliation re-reads.
 *
 * A SIGNAL THAT NO LONGER STANDS — a replayed or late delivery whose forecast was withdrawn, superseded or is no longer unfit, whose
 * scenario was retired or passes its check, whose warning expired or was closed — is recorded on the delivery (signal.no_longer_stands),
 * never routed: the queue carries what needs a person now, and the delivery ledger keeps what was seen.
 *
 * The consumers live in the executive module (which imports the graph module's dispatcher): observation and intelligence cannot host
 * them (the graph module imports both — no cycles).
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { newId } from '../../shared/ids.js';
import { ExecutiveCapability, type AttentionSubscriberWrites } from '../executive.capabilities.js';
import type { FlatEvent, SubscriptionConsumer } from '../../graph/subscriptions/graph-change.js';
import { SubscriptionDispatcherService } from '../../graph/subscriptions/subscription-dispatcher.service.js';
import { readPolicyChanged } from './attention.service.js';

type Row = Record<string, unknown>;
type Scope = { tenantId: string; domainId: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const DEGRADED = ['degraded', 'failed', 'suspended', 'unknown'];

/** The quarantine item of an event whose payload is not the contract. */
const quarantineItem = (event: FlatEvent): string[] => [`event:${event.event_id}`];
const quarantined = (event: FlatEvent, why: string) => ({
  effect: 'event.quarantined', effectRef: null, details: { event_type: event.event_type, why },
  unresolved: { reason: `invalid event: ${event.event_type} ${event.event_id} is not the contract (${why}); quarantined for a person`, failureClass: 'invalid_event' as const, disposition: 'human_review' as const },
});

abstract class B22Consumer implements OnModuleInit {
  constructor(protected readonly dispatcher: SubscriptionDispatcherService) {}
  abstract readonly kind: 'observations' | 'source-health' | 'proposals' | 'attention';
  onModuleInit(): void { this.dispatcher.registerConsumer(this as unknown as SubscriptionConsumer<AttentionSubscriberWrites, FlatEvent>); }
  capability(tx: Parameters<typeof ExecutiveCapability.attentionSubscriber>[0], action: string): AttentionSubscriberWrites { return ExecutiveCapability.attentionSubscriber(tx, action); }
}

/* ─────────────────────────────── observations (L1-I03) ─────────────────────────────── */

/** ObservationRecorded, in its three producers' shapes (the admission, the quarantine release, the governed import): the evidence is required. */
function readObservation(p: Row): { evd: string; version: number | null; source: string | null; mode: string | null } | string {
  if (!isUuid(p['evd_object_id'])) return 'evd_object_id is not a uuid';
  const version = p['evd_version'] === undefined || p['evd_version'] === null ? null : Number(p['evd_version']);
  if (version !== null && !(Number.isInteger(version) && version >= 1)) return 'evd_version is not a positive integer';
  if (p['source_id'] !== undefined && p['source_id'] !== null && !isUuid(p['source_id'])) return 'source_id is not a uuid';
  return { evd: p['evd_object_id'], version, source: (p['source_id'] as string | null | undefined) ?? null, mode: typeof p['acquisition_mode'] === 'string' ? p['acquisition_mode'] : null };
}

@Injectable()
export class ObservationsConsumer extends B22Consumer implements SubscriptionConsumer<AttentionSubscriberWrites, FlatEvent> {
  readonly kind = 'observations' as const;
  readonly objectType = 'EVD';
  readonly purpose = 'intelligence';
  constructor(dispatcher: SubscriptionDispatcherService) { super(dispatcher); }
  async resolveItems(_cap: AttentionSubscriberWrites, _scope: Scope, event: FlatEvent): Promise<string[]> {
    const o = readObservation(event.payload);
    return typeof o === 'string' ? quarantineItem(event) : [`evidence:${o.evd}`];
  }
  async applyItem(cap: AttentionSubscriberWrites, scope: Scope, event: FlatEvent, item: string, actor: string, correlationId: string) {
    const o = readObservation(event.payload);
    if (typeof o === 'string' || item.startsWith('event:')) return quarantined(event, typeof o === 'string' ? o : 'resolved as quarantined');
    const r = await cap.selectPlan({ tenantId: scope.tenantId, domainId: scope.domainId, eventId: event.event_id, evdObjectId: o.evd, evdVersion: o.version, sourceId: o.source, mode: o.mode, actor, correlationId });
    return { effect: r['outcome'] === 'selected' ? 'plan.selected' : 'plan.none', effectRef: String(r['selection_id']),
             details: { evd_object_id: o.evd, evd_version: o.version, source_id: o.source, outcome: r['outcome'], methods: r['methods'], reason: r['reason'], repeated: r['repeated'] === true } };
  }
}

/* ─────────────────────────────── source-health (L1-I04) ─────────────────────────────── */

/**
 * SourceHealthChanged in its two producers' shapes: the coverage evaluation ({prior_state, new_state, reason, decision_use_constraint})
 * and the lifecycle transition ({state: active | suspended | …, reason}); a transition to `active` reads as healthy.
 */
function readHealth(p: Row): { source: string; state: string; prior: string | null; reason: string | null; constraint: unknown } | string {
  if (!isUuid(p['source_id'])) return 'source_id is not a uuid';
  const raw = typeof p['new_state'] === 'string' ? p['new_state'] : typeof p['state'] === 'string' ? p['state'] : null;
  if (raw === null) return 'neither new_state nor state names the health';
  // a lifecycle transition to active reads healthy, to retired as suspended; another lifecycle state (draft, approved) is a valid event
  // that is not a health signal — applied as such, never quarantined (the contract is the shape, not the vocabulary of a state).
  const state = raw === 'active' ? 'healthy' : raw === 'retired' ? 'suspended' : raw;
  return { source: p['source_id'], state, prior: typeof p['prior_state'] === 'string' ? p['prior_state'] : null, reason: typeof p['reason'] === 'string' && p['reason'].length > 0 ? p['reason'] : null, constraint: p['decision_use_constraint'] ?? null };
}

@Injectable()
export class SourceHealthConsumer extends B22Consumer implements SubscriptionConsumer<AttentionSubscriberWrites, FlatEvent> {
  readonly kind = 'source-health' as const;
  readonly objectType = 'SRC';
  readonly purpose = 'observation';
  constructor(dispatcher: SubscriptionDispatcherService) { super(dispatcher); }
  async resolveItems(_cap: AttentionSubscriberWrites, _scope: Scope, event: FlatEvent): Promise<string[]> {
    const h = readHealth(event.payload);
    return typeof h === 'string' ? quarantineItem(event) : [`source:${h.source}`];
  }
  async applyItem(cap: AttentionSubscriberWrites, scope: Scope, event: FlatEvent, item: string, actor: string, correlationId: string) {
    const h = readHealth(event.payload);
    if (typeof h === 'string' || item.startsWith('event:')) return quarantined(event, typeof h === 'string' ? h : 'resolved as quarantined');
    if (!['healthy', ...DEGRADED].includes(h.state)) return { effect: 'not_a_health_signal', effectRef: null, details: { source_id: h.source, state: h.state, note: 'a lifecycle state that is not a health state (draft, approved): no marker moves' } };
    const marks = await cap.markSourceImpact({ tenantId: scope.tenantId, domainId: scope.domainId, sourceId: h.source, healthState: h.state, reason: h.reason, eventId: event.event_id, actor, correlationId });
    const affected = [...(Array.isArray(marks['set']) ? marks['set'] : []), ...(Array.isArray(marks['kept']) ? marks['kept'] : [])] as Row[];
    let routed: Row | null = null;
    if (DEGRADED.includes(h.state)) {
      // The coverage loss is a signal for its accountable roles (NOT-10): consequence C2 when a derived product rests on the source, C1
      // otherwise; confidence from how definite the state is (failed/suspended certain, degraded likely, unknown uncertain).
      const contract = ((await cap.readSourceContracts().select(['name', 'source_key'] as never).where('source_id' as never, '=', h.source as never).orderBy('contract_version' as never, 'desc').limit(1).execute()) as Row[])[0];
      const name = String(contract?.['name'] ?? contract?.['source_key'] ?? h.source);
      const confidence = h.state === 'failed' || h.state === 'suspended' ? 1 : h.state === 'degraded' ? 0.8 : 0.5;
      routed = await cap.routeItem({ itemId: newId(), tenantId: scope.tenantId, domainId: scope.domainId, signalClass: 'source.coverage_loss', subjectKind: 'source', subjectId: h.source,
        causeEventId: event.event_id, causeEventType: event.event_type, owner: null,
        dims: { consequence: affected.length > 0 ? 'C2' : 'C1', confidence, hours_to_window: null, affected_products: affected.length, health_state: h.state },
        title: `Source ${name} is ${h.state}${h.reason === null ? '' : ` — ${h.reason.slice(0, 160)}`}`,
        details: { source_id: h.source, prior_state: h.prior, state: h.state, reason: h.reason, decision_use_constraint: h.constraint, affected: affected.slice(0, 50) }, actor, correlationId });
    }
    return { effect: DEGRADED.includes(h.state) ? 'markers.set' : 'markers.cleared', effectRef: routed === null ? null : String(routed['item_id']),
             details: { source_id: h.source, state: h.state, set: marks['set'], kept: marks['kept'], cleared: marks['cleared'], attention: routed === null ? null : { item_id: routed['item_id'], outcome: routed['outcome'], state: routed['state'], policy_version: routed['policy_version'] } } };
  }
}

/* ─────────────────────────────── proposals (L2-I02) ─────────────────────────────── */

const CLAIM_TYPES = ['CLM', 'ENT', 'EVT', 'REL', 'ASM'];
/** ClaimsExtracted {claims: [id…]} or IntelligenceObjectAdmitted {object_id, object_type, object_version} — the proposed candidates. */
function readProposals(event: FlatEvent): string[] | { skip: string } | string {
  const p = event.payload;
  if (event.event_type === 'ClaimsExtracted') {
    if (!Array.isArray(p['claims']) || !p['claims'].every(isUuid)) return 'claims is not a list of ids';
    return p['claims'] as string[];
  }
  if (!isUuid(p['object_id']) || typeof p['object_type'] !== 'string') return 'object_id / object_type missing';
  if (!CLAIM_TYPES.includes(p['object_type'])) return { skip: `a ${p['object_type']} object is not an intelligence candidate` };
  return [p['object_id']];
}

@Injectable()
export class ProposalsConsumer extends B22Consumer implements SubscriptionConsumer<AttentionSubscriberWrites, FlatEvent> {
  readonly kind = 'proposals' as const;
  readonly objectType = 'CLM';
  readonly purpose = 'intelligence';
  constructor(dispatcher: SubscriptionDispatcherService) { super(dispatcher); }
  async resolveItems(_cap: AttentionSubscriberWrites, _scope: Scope, event: FlatEvent): Promise<string[]> {
    const r = readProposals(event);
    if (typeof r === 'string') return quarantineItem(event);
    if (!Array.isArray(r)) return [];
    return [...new Set(r)].sort().map((id) => `claim:${id}`);
  }
  async applyItem(cap: AttentionSubscriberWrites, scope: Scope, event: FlatEvent, item: string, actor: string, correlationId: string) {
    const r = readProposals(event);
    if (typeof r === 'string' || item.startsWith('event:')) return quarantined(event, typeof r === 'string' ? r : 'resolved as quarantined');
    const claimId = item.replace(/^claim:/, '');
    const review = ((await cap.readReviewCases().selectAll().where('claim_object_id' as never, '=', claimId as never).orderBy('opened_at' as never, 'desc').limit(1).execute()) as Row[])[0] ?? null;
    if (review === null) return { effect: 'no_review_required', effectRef: null, details: { claim_object_id: claimId, note: 'no review case — admitted without review; nothing to route' } };
    if (String(review['state']) !== 'queued') return { effect: 'review_decided', effectRef: null, details: { claim_object_id: claimId, review_state: review['state'] } };
    const confidence = typeof review['confidence'] === 'number' ? review['confidence'] : review['confidence'] === null || review['confidence'] === undefined ? 0.5 : Number(review['confidence']);
    const routed = await cap.routeItem({ itemId: newId(), tenantId: scope.tenantId, domainId: scope.domainId, signalClass: 'proposal.review', subjectKind: 'claim', subjectId: claimId,
      causeEventId: event.event_id, causeEventType: event.event_type, owner: null,
      // The HOLD is a fact (a queued review case), so the signal's confidence is 1; the claim's own confidence is carried beside it —
      // a low-confidence claim is exactly what review is for, never a reason to deprioritize its review.
      dims: { consequence: 'C1', confidence: 1, hours_to_window: null, claim_confidence: Number.isFinite(confidence) ? confidence : null, queued_reason: review['queued_reason'] },
      title: `Claim ${claimId.slice(0, 8)}… held for review (${String(review['queued_reason'] ?? 'queued')})`,
      details: { claim_object_id: claimId, review_case_id: review['case_id'] ?? null, queued_reason: review['queued_reason'] ?? null, promoted: false }, actor, correlationId });
    return { effect: 'review.routed', effectRef: String(routed['item_id']), details: { claim_object_id: claimId, outcome: routed['outcome'], state: routed['state'], policy_version: routed['policy_version'], repeated: routed['repeated'] === true } };
  }
}

/* ─────────────────────────────── attention (L10-I05 and the foresight signals) ─────────────────────────────── */

type Signal =
  | { kind: 'forecast'; id: string; unfit: boolean; fitClass: string | null; outcomes: number | null; required: number | null; series: string; horizon: string }
  | { kind: 'scenario'; id: string; owner: string | null; title: string; findings: number }
  | { kind: 'warning'; id: string; owner: string | null; closesAt: string | null; consequence: string | null }
  | { kind: 'policy'; policyId: string; version: number; changedSections: string[]; changedClasses: string[] };
function readSignal(event: FlatEvent): Signal | string {
  const p = event.payload;
  switch (event.event_type) {
    case 'ForecastFitnessChanged': {
      if (p['schema'] !== 'ForecastFitnessChanged' || !isUuid(p['forecast_id'])) return 'not a ForecastFitnessChanged@v1 payload';
      const to = (p['to'] ?? {}) as Row; const w = ((p['measures'] ?? {}) as Row)['window'] as Row | undefined;
      return { kind: 'forecast', id: p['forecast_id'], unfit: to['state'] === 'unfit', fitClass: typeof to['class'] === 'string' ? to['class'] : null,
               outcomes: typeof w?.['outcomes'] === 'number' ? w['outcomes'] : null, required: typeof w?.['required'] === 'number' ? w['required'] : null,
               series: String(p['series_key'] ?? ''), horizon: String(p['horizon'] ?? '') };
    }
    case 'ScenarioCoherenceFailed':
      if (p['schema'] !== 'ScenarioCoherenceFailed' || !isUuid(p['scenario_id'])) return 'not a ScenarioCoherenceFailed@v1 payload';
      return { kind: 'scenario', id: p['scenario_id'], owner: isUuid(p['owner']) ? p['owner'] : null, title: String(p['title'] ?? p['scenario_id']), findings: Array.isArray(p['findings']) ? p['findings'].length : 0 };
    case 'EarlyWarningRaised':
      if (!isUuid(p['warning_id'])) return 'warning_id is not a uuid';
      return { kind: 'warning', id: p['warning_id'], owner: isUuid(p['routed_to']) ? p['routed_to'] : null, closesAt: typeof p['closes_at'] === 'string' ? p['closes_at'] : null,
               consequence: typeof p['consequence_class'] === 'string' ? p['consequence_class'] : null };
    case 'AttentionPolicyChanged': {
      const c = readPolicyChanged(p);
      return c === null ? 'not an AttentionPolicyChanged@v1 payload' : { kind: 'policy', ...c };
    }
    default: return `the attention consumer does not read ${event.event_type}`;
  }
}

@Injectable()
export class AttentionConsumer extends B22Consumer implements SubscriptionConsumer<AttentionSubscriberWrites, FlatEvent> {
  readonly kind = 'attention' as const;
  readonly objectType = 'ATI';
  readonly purpose = 'executive';
  constructor(dispatcher: SubscriptionDispatcherService) { super(dispatcher); }

  async resolveItems(cap: AttentionSubscriberWrites, _scope: Scope, event: FlatEvent): Promise<string[]> {
    const s = readSignal(event);
    if (typeof s === 'string') return quarantineItem(event);
    if (s.kind === 'policy') {
      // A policy change reaches every LIVE item (re-evaluated under the new version) and every committed or monitored package (the cause).
      const items = (await cap.readAttentionItems().select(['item_id'] as never).where('state' as never, '<>', 'closed' as never).execute()) as Row[];
      const packages = (await cap.readPackages().select(['package_id'] as never).where('state' as never, 'in', ['committed', 'monitoring'] as never).execute()) as Row[];
      return [...items.map((r) => `item:${String(r['item_id'])}`).sort(), ...packages.map((r) => `package:${String(r['package_id'])}`).sort()];
    }
    return [`${s.kind}:${s.id}`];
  }

  async applyItem(cap: AttentionSubscriberWrites, scope: Scope, event: FlatEvent, item: string, actor: string, correlationId: string, subscriptionId: string) {
    const s = readSignal(event);
    if (typeof s === 'string' || item.startsWith('event:')) return quarantined(event, typeof s === 'string' ? s : 'resolved as quarantined');
    // The overdue are escalated at every delivery (deterministic, bounded; there is no timer host — stated).
    const escalated = await cap.escalateDue({ tenantId: scope.tenantId, domainId: scope.domainId, actor, correlationId });
    const esc = (Array.isArray(escalated['escalated']) && escalated['escalated'].length > 0) || (Array.isArray(escalated['lapsed']) && escalated['lapsed'].length > 0) ? escalated : null;
    const base = { tenantId: scope.tenantId, domainId: scope.domainId, causeEventId: event.event_id, causeEventType: event.event_type, actor, correlationId };
    if (s.kind === 'policy') {
      if (item.startsWith('item:')) {
        const r = await cap.reevaluateItem({ itemId: item.slice(5), tenantId: scope.tenantId, domainId: scope.domainId, causeEventId: event.event_id, actor, correlationId });
        return { effect: r['changed'] === true ? 'item.reevaluated' : 'item.unchanged', effectRef: item.slice(5), details: { ...r, escalation: esc } };
      }
      const r = await cap.notePolicyChanged({ packageId: item.slice(8), tenantId: scope.tenantId, domainId: scope.domainId, policyId: s.policyId, toVersion: s.version,
        details: { changed_sections: s.changedSections, changed_classes: s.changedClasses, note: `the attention policy changed to version ${s.version} (${s.changedSections.join(', ') || 'no section'}) after the commitment; the owner may reopen the decision on this cause` },
        outboxEventId: event.event_id, subscriptionId, actor, correlationId });
      return { effect: r['noted'] === true ? 'policy.noted' : 'policy.not_noted', effectRef: (r['note_id'] as string | undefined) ?? null, details: { package_id: item.slice(8), ...r, escalation: esc } };
    }
    if (s.kind === 'forecast') {
      if (!s.unfit) return { effect: 'not_a_signal', effectRef: null, details: { forecast_id: s.id, note: 'a fit or indeterminate verdict is not an attention signal', escalation: esc } };
      const f = ((await cap.readForecasts().select(['forecast_id', 'issued_by', 'series_key', 'horizon_code', 'state', 'fitness_state'] as never).where('forecast_id' as never, '=', s.id as never).execute()) as Row[])[0] ?? null;
      // A signal that NO LONGER STANDS (a replayed or late delivery: the forecast withdrawn or superseded since, or no longer unfit) is recorded, not routed.
      if (f === null || String(f['state']) !== 'issued' || String(f['fitness_state']) !== 'unfit') {
        return { effect: 'signal.no_longer_stands', effectRef: null, details: { forecast_id: s.id, state: f?.['state'] ?? null, fitness_state: f?.['fitness_state'] ?? null, escalation: esc } };
      }
      // CONSEQUENCE: C2 when a live scenario or a package option rests on the forecast (a decision-active use), C1 otherwise.
      const scenarios = (await cap.readScenarios().select(['scenario_id'] as never).where('forecast_id' as never, '=', s.id as never).where('state' as never, '<>', 'retired' as never).execute()) as Row[];
      const options = (await cap.readOptions().select(['package_id', 'consequences'] as never).execute()) as Row[];
      const citing = options.filter((o) => Array.isArray(o['consequences']) && (o['consequences'] as Row[]).some((c) => String(c['id'] ?? '') === s.id)).map((o) => String(o['package_id']));
      // CONFIDENCE: a structural class (data_shift, envelope_breach) is certain; a measured one (calibration_failure, drift) as sure as its window is full.
      const measured = s.fitClass === 'calibration_failure' || s.fitClass === 'drift';
      const confidence = measured && s.outcomes !== null && s.required !== null && s.required > 0 ? Math.min(1, s.outcomes / s.required) : 1;
      const r = await cap.routeItem({ itemId: newId(), ...base, signalClass: 'forecast.unfit', subjectKind: 'forecast', subjectId: s.id,
        owner: f === null ? null : (f['issued_by'] as string | null),
        dims: { consequence: scenarios.length + citing.length > 0 ? 'C2' : 'C1', confidence, hours_to_window: null, fitness_class: s.fitClass, scenarios: scenarios.length, packages: [...new Set(citing)].length },
        title: `Forecast ${s.series || String(f?.['series_key'] ?? s.id)} ${s.horizon || String(f?.['horizon_code'] ?? '')} assessed UNFIT (${s.fitClass ?? 'unclassed'})`,
        details: { forecast_id: s.id, fitness_class: s.fitClass, forecast_state: f?.['state'] ?? null, scenarios: scenarios.map((x) => x['scenario_id']).slice(0, 50), packages: [...new Set(citing)].slice(0, 50) } });
      return { effect: 'attention.routed', effectRef: String(r['item_id']), details: { signal: 'forecast.unfit', ...r, escalation: esc } };
    }
    if (s.kind === 'scenario') {
      const sc = ((await cap.readScenarios().select(['scenario_id', 'state', 'coherence_state'] as never).where('scenario_id' as never, '=', s.id as never).execute()) as Row[])[0] ?? null;
      if (sc === null || String(sc['state']) === 'retired' || String(sc['coherence_state']) !== 'failed') {
        return { effect: 'signal.no_longer_stands', effectRef: null, details: { scenario_id: s.id, state: sc?.['state'] ?? null, coherence_state: sc?.['coherence_state'] ?? null, escalation: esc } };
      }
      const r = await cap.routeItem({ itemId: newId(), ...base, signalClass: 'scenario.incoherent', subjectKind: 'scenario', subjectId: s.id, owner: s.owner,
        dims: { consequence: 'C2', confidence: 1, hours_to_window: null, findings: s.findings },
        title: `Scenario "${s.title.slice(0, 200)}" failed its coherence check (${s.findings} finding${s.findings === 1 ? '' : 's'})`,
        details: { scenario_id: s.id, findings: s.findings, check_id: event.payload['check_id'] ?? null, rule_version: event.payload['rule_version'] ?? null } });
      return { effect: 'attention.routed', effectRef: String(r['item_id']), details: { signal: 'scenario.incoherent', ...r, escalation: esc } };
    }
    // warning
    const w = ((await cap.readWarnings().select(['warning_id', 'title', 'confidence', 'consequence_class', 'response_window_closes_at', 'routed_to', 'level', 'urgency', 'state'] as never).where('warning_id' as never, '=', s.id as never).execute()) as Row[])[0] ?? null;
    if (w === null || !['raised', 'acknowledged'].includes(String(w['state']))) {
      return { effect: 'signal.no_longer_stands', effectRef: null, details: { warning_id: s.id, state: w?.['state'] ?? null, escalation: esc } };
    }
    const closes = w?.['response_window_closes_at'] ?? s.closesAt;
    const hours = closes === null || closes === undefined ? null : Math.round(((new Date(String(closes instanceof Date ? closes.toISOString() : closes)).getTime() - Date.now()) / 3_600_000) * 10) / 10;
    const r = await cap.routeItem({ itemId: newId(), ...base, signalClass: 'warning.raised', subjectKind: 'warning', subjectId: s.id, owner: (w?.['routed_to'] as string | null | undefined) ?? s.owner,
      dims: { consequence: (w?.['consequence_class'] as string | null | undefined) ?? s.consequence, confidence: w === null ? null : Number(w['confidence']), hours_to_window: hours, level: w?.['level'] ?? null, urgency: w?.['urgency'] ?? null },
      title: `Warning: ${String(w?.['title'] ?? s.id).slice(0, 300)}`,
      details: { warning_id: s.id, level: w?.['level'] ?? null, urgency: w?.['urgency'] ?? null } });
    return { effect: 'attention.routed', effectRef: String(r['item_id']), details: { signal: 'warning.raised', ...r, escalation: esc } };
  }
}
