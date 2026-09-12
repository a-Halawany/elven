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
 * Under GraphChanged the basis moves by a split or a resolution accepted elsewhere; under MemoryCorrected it moves for
 * the resolutions of a corrected claim, the edges a corrected claim asserted (or that rest on corrected evidence) and
 * the identifiers sourced from either — all three mappings, on both branches (AU-MEM-0114).
 *
 * PROVENANCE PATH INCOMPLETE (AU-MEM-0039, 0065). A proposal about an edge says what moved under it; that requires the
 * path corrected evidence → claim lineage → the claim the edge names to be ESTABLISHED. An edge that names the corrected
 * evidence as its basis while the claim it names carries no lineage on that evidence (no lineage row for the claim
 * version, or a lineage naming other evidence) has an incomplete provenance path: the item is left UNRESOLVED with the
 * class `provenance_incomplete` (human review), the check recorded, and is re-checked at every re-drive — the edge is
 * neither proposed nor touched until the path is established (the lineage recorded, or the edge retracted) or a person
 * decides. Partial work is preserved: the other items of the delivery apply.
 *
 * Items are `identifier:<id>`, `edge:<id>`, `resolution:<id>`; each effect is one proposal.
 */
import { Injectable, type OnModuleInit } from '@nestjs/common';
import { newId } from '../../../shared/ids.js';
import { GraphCapability, type GraphSubscriberWrites } from '../../graph.capabilities.js';
import type { ChangeEvent, SubscriptionConsumer } from '../graph-change.js';
import { SubscriptionDispatcherService } from '../subscription-dispatcher.service.js';

type Row = Record<string, unknown>;
interface Proposal { subjectKind: 'identifier' | 'edge' | 'resolution'; subjectId: string; fromEntityId: string | null; toEntityId: string | null; basis: string;
  /** 0065: the provenance path from the corrected object to this subject could NOT be established — the reason, with what was expected. */
  provenance?: { reason: string; expected: Record<string, unknown> } }

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
    // MemoryCorrected: every accepted resolution, every asserted edge and every identifier whose claim (or the evidence
    // behind it) was corrected — the three mappings memory holds into the graph, each with the basis that moved.
    const m = event.payload;
    const claims = new Set<string>(m.claims);
    const evidence = new Set<string>();
    for (const o of m.objects) { if (o.object_type === 'EVD') evidence.add(o.object_id); else claims.add(o.object_id); }
    const versions = new Map(m.objects.map((o) => [o.object_id, o]));
    const edgeBasis = (e: Row): string | null => {
      const claimId = String(e['claim_object_id']); const v = versions.get(claimId);
      if (v !== undefined) return `edge ${String(e['predicate'])} was asserted by v${String(e['claim_version'])} of a claim corrected to v${v.to_version} (${m.change.kind}); the relationship may no longer hold as asserted`;
      if (claims.has(claimId)) return `edge ${String(e['predicate'])} was asserted by a claim derived from evidence corrected in case ${m.change.correction_case_id ?? '?'} (${m.change.kind})`;
      if (evidence.has(String(e['evidence_object_id']))) return `edge ${String(e['predicate'])} rests on evidence corrected in case ${m.change.correction_case_id ?? '?'} (${m.change.kind})`;
      return null;
    };
    if (claims.size > 0 || evidence.size > 0) {
      const edges = (await cap.readEdges().selectAll().where('state' as never, '=', 'asserted' as never).execute()) as Row[];
      const candidates = edges.map((e) => ({ e, basis: edgeBasis(e) })).filter((x): x is { e: Row; basis: string } => x.basis !== null);
      // THE PROVENANCE PATH, checked for every candidate edge: the lineage of the claim version the edge names.
      const lineage = candidates.length === 0 ? [] : (await cap.readClaimLineage().select(['claim_object_id', 'claim_version', 'evidence_object_id', 'evidence_digest'] as never)
        .where('claim_object_id' as never, 'in', [...new Set(candidates.map((c) => String(c.e['claim_object_id'])))] as never).execute()) as Row[];
      const lineageOf = (claimId: string, version: number) => lineage.find((l) => String(l['claim_object_id']) === claimId && Number(l['claim_version']) === version) ?? null;
      for (const { e, basis } of candidates) {
        const claimId = String(e['claim_object_id']); const version = Number(e['claim_version']); const edgeEvidence = String(e['evidence_object_id']);
        const l = lineageOf(claimId, version);
        let provenance: Proposal['provenance'];
        if (l === null) {
          provenance = { reason: `provenance path incomplete: the edge names claim ${claimId} v${version} as its assertion, but no lineage records which evidence that claim version was extracted from — the path from the corrected object to this edge cannot be established`,
                         expected: { claim_object_id: claimId, claim_version: version, lineage: 'a row in intelligence.claim_lineage for this claim version', edge_evidence_object_id: edgeEvidence } };
        } else if (m.change.kind === 'evidence.corrected' && !evidence.has(String(l['evidence_object_id']))) {
          provenance = { reason: `provenance path incomplete: the edge names evidence ${edgeEvidence} as its basis, but the lineage of claim ${claimId} v${version} names evidence ${String(l['evidence_object_id'])} — the corrected evidence does not reach this edge through its claim`,
                         expected: { claim_object_id: claimId, claim_version: version, lineage_evidence_object_id: String(l['evidence_object_id']), edge_evidence_object_id: edgeEvidence, corrected_evidence: [...evidence] } };
        } else if (String(l['evidence_object_id']) !== edgeEvidence) {
          provenance = { reason: `provenance path incomplete: the edge names evidence ${edgeEvidence} but the lineage of the claim it names records evidence ${String(l['evidence_object_id'])} — the edge's provenance contradicts its claim's`,
                         expected: { claim_object_id: claimId, claim_version: version, lineage_evidence_object_id: String(l['evidence_object_id']), edge_evidence_object_id: edgeEvidence } };
        }
        add({ subjectKind: 'edge', subjectId: String(e['edge_id']), fromEntityId: String(e['subject_entity_id']), toEntityId: String(e['object_entity_id']), basis, ...(provenance === undefined ? {} : { provenance }) });
      }
    }
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
    if (p.provenance !== undefined) {
      // The check is the effect's record; the item stays open (re-checked on every re-drive) with its class and route.
      return { effect: 'provenance.incomplete', effectRef: null, details: { subject: item, basis: p.basis, expected: p.provenance.expected },
               unresolved: { reason: p.provenance.reason, failureClass: 'provenance_incomplete' as const, disposition: 'human_review' as const } };
    }
    const reconciliationId = newId();
    const id = await cap.proposeMappingReconciliation({ reconciliationId, tenantId: scope.tenantId, domainId: scope.domainId, subjectKind: p.subjectKind, subjectId: p.subjectId,
      fromEntityId: p.fromEntityId, toEntityId: p.toEntityId, basis: p.basis, causeEventId: event.event_id, subscriptionId, actor, correlationId });
    if (id === null) return { effect: 'reconciliation.already_proposed', effectRef: null, details: { subject: item } };
    // 0065 §7 (TT-04): an edge whose inference record's basis moved under a MEMORY change is opened for REASSESSMENT on the
    // relationship itself — closed when the builder re-derives it, a person retracts it or decides this proposal.
    let reassessment: boolean | null = null;
    if (p.subjectKind === 'edge' && event.event_type === 'MemoryCorrected') {
      reassessment = await cap.openEdgeReassessment({ edgeId: p.subjectId, tenantId: scope.tenantId, domainId: scope.domainId, trigger: event.payload.change.kind === 'claim.corrected' ? 'claim' : 'evidence',
        reason: `${p.basis}; reconciliation ${id} proposed`, causeId: event.event_id, actor, correlationId });
    }
    return { effect: 'reconciliation.proposed', effectRef: id, details: { subject: item, from: p.fromEntityId, to: p.toEntityId, ...(reassessment === null ? {} : { reassessment_opened: reassessment }) } };
  }
}
