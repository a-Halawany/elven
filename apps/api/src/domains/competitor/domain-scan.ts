/**
 * B33 §CI — THE DOMAIN INTELLIGENCE AGENT'S SCAN (task domain_scan; kind domain_intelligence, the prelude's), offered to the executive through
 * DomainScanBridge (seams.ts) and run by AgentsService.run under the agent's OWN session:
 *   0. DRIFT: a registration whose version/digest is not this runtime's is refused (recorded, escalated) — registered anew before it scans;
 *   1. ONE READ (domain.competitor.read): the backlog (claims on WATCHED competitors, resolved through the graph, after each one's scan mark),
 *      the package manifests, the head facts, and what needs revalidation — every read reserved on the run's meter first;
 *   2. per evidence item (at most the registered max_items; the rest wait and the competitor's scan mark stops before them): the deterministic
 *      reading (competitor-logic.ts) and ONE governed write — the PROPOSAL (domain.competitor.propose, the agent's own run);
 *   3. the scan marks (domain.competitor.propose): the watermark each competitor was read to;
 *   4. revalidation where the read found a mistaken identity, open conflict or stale coverage (domain.competitor.revalidate) — only then;
 *   5. the BOUNDARY exercised: its attempt to APPROVE the first proposal it made is refused at the PDP (no rule for its role) and recorded.
 * The meter's tick runs before every write: a run whose session nears its end STOPS before the next write (B25-R) and closes itself.
 */
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import type { PipelineService } from '../../pipeline/pipeline.service.js';
import { newId } from '../../shared/ids.js';
import type { DomainScanArgs, DomainScanEnv } from '../seams.js';
import { DOMAIN_INTELLIGENCE_AGENT_DIGEST, DOMAIN_INTELLIGENCE_AGENT_VERSION } from '../domain-intelligence-agent.js';
import { CompetitorCapability } from './competitor.capabilities.js';
import { DEFAULT_PREDICATE_MAP, draftFromEvidence, groupBacklog, watermarkOf, type BacklogClaim, type PredicateRule } from './competitor-logic.js';

type Row = Record<string, unknown>;
/** the backlog's bound per run (one read) */
export const SCAN_BACKLOG_LIMIT = 500;

/** The service surface the scan uses — STRUCTURAL (no import of competitor.service.ts, which imports this file: the boundaries gate). */
export interface ScanSurface {
  revalidate(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, competitorId: string, correlationId: string): Promise<Row>;
}
export interface ScanDeps extends DomainScanEnv { pipeline: PipelineService; service: ScanSurface }

const textOf = (e: unknown): string => (e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : (e instanceof Error ? e.message : String(e)));

export async function domainScan(d: ScanDeps, p: AuthenticatedPrincipal, a: DomainScanArgs): Promise<Row> {
  const provenance = { purpose: 'intelligence', package_id: null, room_id: null, classification: 'internal', contributors: [] as string[] };
  if (a.registration.agent_version !== DOMAIN_INTELLIGENCE_AGENT_VERSION || a.registration.code_digest !== DOMAIN_INTELLIGENCE_AGENT_DIGEST) {
    const reason = `domain scan refused (drift): the agent is registered as ${a.registration.agent_version} with code digest ${a.registration.code_digest.slice(0, 12)}…; this runtime's scan is `
      + `${DOMAIN_INTELLIGENCE_AGENT_VERSION} with ${DOMAIN_INTELLIGENCE_AGENT_DIGEST.slice(0, 12)}… — the agent is registered anew before it scans again`;
    a.refusals.push({ action: 'domain.competitor.propose', code: 'EYE-AUT-001', reason, at: new Date().toISOString() });
    return { refused: true, reason, marked: 'agent-produced', agent: a.identity, provenance };
  }
  const maxItems = a.stops.filter((s) => s['kind'] === 'max_items').map((s) => Number(s['value'])).reduce<number | null>((acc, v) => (acc === null ? v : Math.min(acc, v)), null);
  // 1. ONE READ — the backlog, the manifests, the head facts, the revalidation needs (B25-R: read before the governed writes)
  a.meter.read('the watched competitors\' backlog');
  const read = (await d.pipeline.consequentialRead(d.env('domain.competitor.read', 'DCI', null), p, d.route('domain.competitor.read', 'DCI', null), CompetitorCapability.read,
    async (cap) => {
      const backlog = await cap.backlog(a.tenantId, a.domainId, SCAN_BACKLOG_LIMIT);
      const ids = [...new Set(backlog.map((r) => String(r['competitor_id'])))];
      const heads = ids.length === 0 ? [] : (await cap.from('domain.competitor_profile_versions').select(['competitor_id', 'facts'] as never)
        .where('competitor_id' as never, 'in', ids as never).where('state' as never, '<>', 'superseded' as never).execute()) as Array<{ competitor_id: string; facts: Row[] }>;
      const packages = [...new Set(backlog.map((r) => String(r['package_key'])))];
      const manifests: Record<string, Row> = {};
      for (const k of packages) manifests[k] = await cap.manifest(a.tenantId, a.domainId, k);
      const needs = await cap.needsRevalidation(a.tenantId, a.domainId);
      return { backlog, heads: new Map(heads.map((h) => [String(h.competitor_id), (h.facts ?? []) as Row[]])), manifests, needs, today: (await cap.now()).slice(0, 10) };
    })).result;
  let remaining = maxItems ?? Number.POSITIVE_INFINITY;
  const proposed: Row[] = []; const waiting: Row[] = []; const failed: Row[] = []; const skipped: Row[] = []; const marks: Row[] = []; const revalidated: Row[] = [];
  // 2. per competitor and evidence item — the deterministic reading and one proposal each
  for (const comp of groupBacklog(read.backlog)) {
    const manifest = read.manifests[comp.packageKey] ?? {};
    const pmap = ({ ...DEFAULT_PREDICATE_MAP, ...((manifest['predicate_map'] ?? {}) as Record<string, PredicateRule>) });
    const done: BacklogClaim[][] = []; const held: BacklogClaim[][] = []; let made = 0;
    for (const group of comp.groups) {
      const draft = draftFromEvidence({ name: comp.name }, read.heads.get(comp.competitorId) ?? [], group, pmap, read.today);
      if (draft === null) { skipped.push({ competitor_id: comp.competitorId, evidence_id: group[0]!.evidence_id, reason: 'nothing the predicate map reads, or nothing that would change the profile' }); done.push(group); continue; }
      if (remaining <= 0) { waiting.push({ competitor_id: comp.competitorId, evidence_id: draft.evidenceId, reason: 'max_items reached: waits for the next run' }); held.push(group); continue; }
      a.meter.tick(`the proposal for ${comp.name} (evidence ${draft.evidenceId})`);
      const proposalId = newId();
      try {
        const w = await d.pipeline.write(d.env('domain.competitor.propose', 'DCP', proposalId), p, d.route('domain.competitor.propose', 'DCP', proposalId), CompetitorCapability.write,
          async (cap, scope) => ({ result: await cap.propose({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: p.principalId, correlationId: a.correlationId,
            proposalId, competitorId: comp.competitorId, content: draft.content, agentId: a.agentId, runId: a.runId }), targetType: 'DCP', targetId: proposalId, targetVersion: '1', outboxEvent: null }));
        proposed.push({ competitor_id: comp.competitorId, name: comp.name, proposal_id: proposalId, evidence_id: draft.evidenceId, claims: draft.claims, material: w.result['material'],
                        content_digest: w.result['content_digest'], unmapped: draft.unmapped, receipt: { policyDecisionId: w.policyDecisionId, auditSeq: w.auditSeq } });
        made += 1; remaining -= 1; done.push(group);
      } catch (e) {
        if (e instanceof HttpException && e.getStatus() === 403) throw e;
        if (e instanceof Error && e.constructor.name === 'BudgetExceeded') throw e;
        failed.push({ competitor_id: comp.competitorId, evidence_id: draft.evidenceId, reason: textOf(e).slice(0, 500) });
        done.push(group); // a refused proposal (a duplicate, a refused identity) is not read again; its refusal is on the run
      }
    }
    // 3. the scan mark: the watermark stops before the first evidence item left waiting
    const watermark = watermarkOf(done, held);
    if (watermark !== null) {
      a.meter.tick(`the scan mark of ${comp.name}`);
      await d.pipeline.write(d.env('domain.competitor.propose', 'DCI', comp.competitorId), p, d.route('domain.competitor.propose', 'DCI', comp.competitorId), CompetitorCapability.write,
        async (cap, scope) => ({ result: await cap.recordScan({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: p.principalId, correlationId: a.correlationId,
          competitorId: comp.competitorId, agentId: a.agentId, runId: a.runId, watermark, seen: done.flat().length, proposed: made }), targetType: 'DCI', targetId: comp.competitorId, targetVersion: null, outboxEvent: null }));
      marks.push({ competitor_id: comp.competitorId, watermark, seen: done.flat().length, proposed: made, waiting: held.length });
    }
  }
  // 4. revalidation where the read found something (a write only then)
  for (const n of read.needs) {
    a.meter.tick(`the revalidation of ${String(n['name'])}`);
    try {
      const r = await d.service.revalidate(d.env('domain.competitor.revalidate', 'DCI', String(n['competitor_id'])), p, a.tenantId, a.domainId, String(n['competitor_id']), a.correlationId);
      revalidated.push({ competitor_id: n['competitor_id'], name: n['name'], reasons: n['reasons'], version: r['version'] ?? null, routed: r['routed'] ?? [] });
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() === 403) throw e;
      if (e instanceof Error && e.constructor.name === 'BudgetExceeded') throw e;
      failed.push({ competitor_id: n['competitor_id'], revalidation: true, reason: textOf(e).slice(0, 500) });
    }
  }
  // 5. the boundary: the agent never approves — its attempt is refused at the PDP and recorded on the run
  const target = typeof proposed[0]?.['proposal_id'] === 'string' ? String(proposed[0]['proposal_id']) : null;
  if (target !== null) {
    try {
      await d.pipeline.write(d.env('domain.competitor.assessment.approve', 'DCP', target), p, d.route('domain.competitor.assessment.approve', 'DCP', target), CompetitorCapability.read,
        async () => ({ result: null, targetType: 'DCP', targetId: target, targetVersion: null, outboxEvent: null }));
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() === 403) {
        a.refusals.push({ action: 'domain.competitor.assessment.approve', code: String((e.getResponse() as { code?: string }).code ?? 'EYE-AUT-001'), reason: textOf(e), at: new Date().toISOString() });
      } else throw e;
    }
  }
  return { scanned: read.backlog.length, proposed, waiting, failed, skipped, marks, revalidated, max_items: maxItems,
           marked: 'agent-produced: proposed to the named analyst, never approved by the agent', agent: a.identity,
           provenance: { ...provenance, contributors: proposed.map((x) => `DCP:${String(x['proposal_id'])}`) } };
}
