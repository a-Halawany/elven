/**
 * The MEMORY-MAPPINGS consumer (AU-MEM-0030: "… consumers for … memory mappings"). A mapping is the standing
 * relation between memory and the graph: an identifier bound to an entity, an edge asserted by a claim, a
 * resolution of a claim's mention to an entity. When the BASIS of a mapping moves — the claim that sourced an
 * identifier resolves elsewhere after a split or a decision, the claim behind an edge or a resolution is
 * corrected, the evidence a claim was derived from is corrected — the mapping is not rewritten by a subscriber:
 * a RECONCILIATION IS PROPOSED (once per subject and cause) and a person decides it under the resolution
 * manager's authority (graph.decide_mapping_reconciliation asserts graph.resolution.decide). Resolver rule 7,
 * kept: nothing is forced onto an entity automatically.
 *
 * Items are `identifier:<id>`, `edge:<id>`, `resolution:<id>`; each effect is one proposal.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { newId } from '../../../shared/ids.js';
import { GraphCapability, type GraphSubscriberWrites } from '../../graph.capabilities.js';
import type { ChangeEvent, SubscriptionConsumer } from '../graph-change.js';
import { SubscriptionDispatcherService } from '../subscription-dispatcher.service.js';

type Row = Record<string, unknown>;
interface Proposal { subjectKind: 'identifier' | 'edge' | 'resolution'; subjectId: string; fromEntityId: string | null; toEntityId: string | null; basis: string }

@Injectable()
export class MemoryMappingsConsumer implements SubscriptionConsumer<GraphSubscriberWrites>, OnModuleInit {
  readonly kind = 'memory-mappings' as const;
  readonly objectType = 'MRC';
  readonly purpose = 'graph';
  constructor(private readonly dispatcher: SubscriptionDispatcherService) {}
  onModuleInit(): void { this.dispatcher.registerConsumer(this); }
  capability(tx: Parameters<typeof GraphCapability.graphSubscriber>[0], action: string): GraphSubscriberWrites { return GraphCapability.graphSubscriber(tx, action); }

  /** What this event moves the basis of — computed the same way at resolve and at apply (the item carries only the subject). */
  private async proposals(cap: GraphSubscriberWrites, event: ChangeEvent): Promise<Proposal[]> {
    const out: Proposal[] = [];
    const seen = new Set<string>();
    const add = (p: Proposal) => { const k = `${p.subjectKind}:${p.subjectId}`; if (!seen.has(k)) { seen.add(k); out.push(p); } };
    if (event.event_type === 'GraphChanged') {
      const p = event.payload;
      if (p.change.kind === 'entity.split') {
        const origin = p.identities.find((i) => i.role === 'origin')?.entity_id ?? null;
        const successor = p.identities.find((i) => i.role === 'successor')?.entity_id ?? null;
        const movedClaims = new Set(p.relationships.resolutions.map((r) => r.claim_object_id));
        if (origin !== null && successor !== null && movedClaims.size > 0) {
          // Identifiers still bound to the origin but sourced from a claim whose resolution moved to the successor.
          const ids = (await cap.readEntityIdentifiers().selectAll().where('entity_id' as never, '=', origin as never).execute()) as Row[];
          for (const r of ids) {
            if (!movedClaims.has(String(r['source_claim_object_id']))) continue;
            add({ subjectKind: 'identifier', subjectId: String(r['identifier_id']), fromEntityId: origin, toEntityId: successor,
                  basis: `identifier ${String(r['system_key'])}=${String(r['identifier_value'])} is bound to the origin, but the claim that sourced it now resolves to the successor of split ${p.cause.target_id ?? origin}` });
          }
          // Edges on the origin asserted by a claim that moved.
          const edges = (await cap.readEdges().selectAll().where('state' as never, '=', 'asserted' as never).execute()) as Row[];
          for (const e of edges) {
            const subj = String(e['subject_entity_id']); const obj = String(e['object_entity_id']);
            if (subj !== origin && obj !== origin) continue;
            if (!movedClaims.has(String(e['claim_object_id']))) continue;
            add({ subjectKind: 'edge', subjectId: String(e['edge_id']), fromEntityId: origin, toEntityId: successor,
                  basis: `edge ${String(e['predicate'])} has the origin as its ${subj === origin ? 'subject' : 'object'}, but the claim that asserted it now resolves to the successor` });
          }
        }
      } else if (p.change.kind === 'entity.resolved') {
        // A claim now resolves to this entity: an identifier sourced from that claim but bound elsewhere has moved its basis.
        for (const r of p.relationships.resolutions) {
          const ids = (await cap.readEntityIdentifiers().selectAll().where('source_claim_object_id' as never, '=', r.claim_object_id as never).execute()) as Row[];
          for (const id of ids) {
            if (String(id['entity_id']) === r.entity_id) continue;
            add({ subjectKind: 'identifier', subjectId: String(id['identifier_id']), fromEntityId: String(id['entity_id']), toEntityId: r.entity_id,
                  basis: `identifier ${String(id['system_key'])}=${String(id['identifier_value'])} was sourced from claim ${r.claim_object_id}, which now resolves to another entity` });
          }
        }
      }
      return out;
    }
    // MemoryCorrected: every accepted resolution and every identifier whose claim (or the evidence behind it) was corrected.
    const m = event.payload;
    const claims = new Set<string>(m.claims);
    const evidence = new Set<string>();
    for (const o of m.objects) { if (o.object_type === 'EVD') evidence.add(o.object_id); else claims.add(o.object_id); }
    const versions = new Map(m.objects.map((o) => [o.object_id, o]));
    if (claims.size > 0) {
      const res = (await cap.readResolutions().selectAll().where('state' as never, '=', 'accepted' as never).where('claim_object_id' as never, 'in', [...claims] as never).execute()) as Row[];
      for (const r of res) {
        const claimId = String(r['claim_object_id']); const v = versions.get(claimId);
        const restsOn = v === undefined ? `a derivation of evidence corrected in case ${m.change.correction_case_id ?? '?'}` : `v${v.from_version} of a claim corrected to v${v.to_version}`;
        add({ subjectKind: 'resolution', subjectId: String(r['resolution_id']), fromEntityId: String(r['entity_id']), toEntityId: null,
              basis: `resolution of "${String(r['mention_text'])}" rests on ${restsOn} (${m.change.kind}); the mention may no longer name this entity` });
      }
      const ids = (await cap.readEntityIdentifiers().selectAll().where('source_claim_object_id' as never, 'in', [...claims] as never).execute()) as Row[];
      for (const id of ids) {
        add({ subjectKind: 'identifier', subjectId: String(id['identifier_id']), fromEntityId: String(id['entity_id']), toEntityId: null,
              basis: `identifier ${String(id['system_key'])}=${String(id['identifier_value'])} was sourced from a claim whose basis was corrected (${m.change.kind})` });
      }
    }
    if (evidence.size > 0) {
      const ids = (await cap.readEntityIdentifiers().selectAll().where('source_evidence_object_id' as never, 'in', [...evidence] as never).execute()) as Row[];
      for (const id of ids) {
        add({ subjectKind: 'identifier', subjectId: String(id['identifier_id']), fromEntityId: String(id['entity_id']), toEntityId: null,
              basis: `identifier ${String(id['system_key'])}=${String(id['identifier_value'])} was sourced from evidence corrected in case ${m.change.correction_case_id ?? '?'}` });
      }
    }
    return out;
  }

  async resolveItems(cap: GraphSubscriberWrites, _scope: { tenantId: string; domainId: string }, event: ChangeEvent): Promise<string[]> {
    return (await this.proposals(cap, event)).map((p) => `${p.subjectKind}:${p.subjectId}`);
  }

  async applyItem(cap: GraphSubscriberWrites, scope: { tenantId: string; domainId: string }, event: ChangeEvent, item: string, actor: string, correlationId: string, subscriptionId: string) {
    const p = (await this.proposals(cap, event)).find((x) => `${x.subjectKind}:${x.subjectId}` === item);
    if (p === undefined) return { effect: 'basis.unchanged', effectRef: null, details: { item, note: 'the basis this item was resolved on no longer holds at apply' } };
    const reconciliationId = newId();
    const id = await cap.proposeMappingReconciliation({ reconciliationId, tenantId: scope.tenantId, domainId: scope.domainId, subjectKind: p.subjectKind, subjectId: p.subjectId,
      fromEntityId: p.fromEntityId, toEntityId: p.toEntityId, basis: p.basis, causeEventId: event.event_id, subscriptionId, actor, correlationId });
    if (id === null) return { effect: 'reconciliation.already_proposed', effectRef: null, details: { subject: item } };
    return { effect: 'reconciliation.proposed', effectRef: id, details: { subject: item, from: p.fromEntityId, to: p.toEntityId } };
  }
}
