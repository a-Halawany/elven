/**
 * The DECISION consumer (AU-MEM-0030: "… consumers for … decisions …"), registered by the decision module. What a
 * change means for a decision package, in the package's own terms (Phase 6, C-004): an INPUT it cites — the DEC
 * object the walk reached, a run, forecast, claim, evidence, assumption or warning an option's consequences cite —
 * changed, and that is RECORDED on the package (decision.note_input_invalidated, once per cause). The package's
 * state, its approvals, its commitment and its monitoring are never touched: a human decision is not rewritten by
 * a subscriber; the room shows the note and the owner decides.
 *
 * Items are package ids.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { SubscriptionDispatcherService } from '../../graph/subscriptions/subscription-dispatcher.service.js';
import { touchedIds } from '../../graph/subscriptions/change-events.js';
import type { ChangeEvent, SubscriptionConsumer } from '../../graph/subscriptions/graph-change.js';
import { DecisionCapability, type DecisionSubscriberWrites } from '../decision.capabilities.js';

type Row = Record<string, unknown>;
const OPEN_STATES = ['draft', 'proposed', 'under_review', 'approved', 'committed', 'monitoring'];
/** States in which the decision has been executed on the world (committed, being monitored): AU-MEM-0039's "committed action already executed". */
const EXECUTED_STATES = ['committed', 'monitoring'];

@Injectable()
export class DecisionSubscriptionConsumer implements SubscriptionConsumer<DecisionSubscriberWrites>, OnModuleInit {
  readonly kind = 'decisions' as const;
  readonly objectType = 'DPK';
  readonly purpose = 'decision';
  constructor(private readonly dispatcher: SubscriptionDispatcherService) {}
  onModuleInit(): void { this.dispatcher.registerConsumer(this); }
  capability(tx: Parameters<typeof DecisionCapability.subscriber>[0], action: string): DecisionSubscriberWrites { return DecisionCapability.subscriber(tx, action); }

  /** The packages this event reaches, each with the inputs it reaches them through and whether its decision was already executed. */
  private async affected(cap: DecisionSubscriberWrites, event: ChangeEvent): Promise<Map<string, { via: string[]; state: string; executed: boolean }>> {
    const t = touchedIds(event);
    const cited = new Set<string>([...t.claims, ...t.evidence, ...t.forecasts, ...t.runs, ...t.strategy]);
    const packages = (await cap.readPackages().selectAll().where('state' as never, 'in', OPEN_STATES as never).execute()) as Row[];
    const out = new Map<string, { via: string[]; state: string; executed: boolean }>();
    for (const p of packages) {
      const id = String(p['package_id']); const via: string[] = [];
      const dec = String(p['decision_object_id']);
      if (t.strategy.has(dec)) via.push(`decision object ${dec}`);
      const version = p['current_version'] == null ? null : Number(p['current_version']);
      if (version !== null && cited.size > 0) {
        const options = (await cap.readOptions().select(['key', 'consequences'] as never).where('package_id' as never, '=', id as never).where('version' as never, '=', version as never).execute()) as Row[];
        for (const o of options) {
          const cs = Array.isArray(o['consequences']) ? (o['consequences'] as Array<{ kind?: unknown; id?: unknown }>) : [];
          for (const c of cs) if (cited.has(String(c.id ?? ''))) via.push(`option ${String(o['key'])} cites ${String(c.kind)} ${String(c.id)}`);
        }
      }
      // A committed or monitored package has been EXECUTED: an input invalidated after the commitment is a condition a
      // person must route — compensation is the decision owner's — never a rewrite (C-004). Exposed on the note.
      const state = String(p['state']);
      if (via.length > 0) out.set(id, { via, state, executed: EXECUTED_STATES.includes(state) });
    }
    return out;
  }

  async resolveItems(cap: DecisionSubscriberWrites, _scope: { tenantId: string; domainId: string }, event: ChangeEvent): Promise<string[]> {
    return [...(await this.affected(cap, event)).keys()].sort();
  }

  async applyItem(cap: DecisionSubscriberWrites, scope: { tenantId: string; domainId: string }, event: ChangeEvent, item: string, actor: string, correlationId: string, subscriptionId: string) {
    const a = (await this.affected(cap, event)).get(item) ?? { via: [], state: 'unknown', executed: false };
    const exposure = a.executed
      ? { failureClass: 'executed_action' as const, disposition: 'compensation' as const, note: `the package is ${a.state}: its decision has been executed; an input it rested on changed after the commitment — compensation or challenge is the decision owner's, nothing here is reversed` }
      : undefined;
    const details = { event_type: event.event_type, change_kind: event.payload.change.kind, via: a.via, package_state: a.state, executed: a.executed,
                      ...(exposure === undefined ? {} : { failure_class: exposure.failureClass, disposition: exposure.disposition }),
                      note: exposure?.note ?? 'an input this package cites changed; the package, its approvals and its commitment are unchanged — the owner decides' };
    const noted = await cap.noteInputInvalidated({ packageId: item, tenantId: scope.tenantId, domainId: scope.domainId, details, outboxEventId: event.event_id, subscriptionId, actor, correlationId });
    const base = noted ? { effect: 'input.invalidated', effectRef: item, details: { via: a.via, package_state: a.state, executed: a.executed } } : { effect: 'input.already_noted', effectRef: item, details: { package_state: a.state, executed: a.executed } };
    return exposure === undefined ? base : { ...base, exposure };
  }
}
