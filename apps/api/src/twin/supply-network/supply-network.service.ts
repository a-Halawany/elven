/**
 * CP-6 B29 §B (0092) — the multi-tier SUPPLY NETWORK twin's reads (a version's network, its analysis and findings, the agent's backlog and
 * proposals) and the owner's decision on a proposal, read by the routes (supply-network.controller.ts) and by the Supply Chain Agent
 * (executive/agents/supply-chain-agent.ts — it calls the exported functions under its own capability; the executive module does not
 * inject this service).
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { FamilyElement } from '../families/families.js';
import { analyseNetwork, findingsOf, SUPPLY_NETWORK_FAMILY_NAME, type Finding, type NetworkAnalysis } from './network.js';
import type { ProposalDecideWrites, SupplyNetworkReads } from './supply-network.capabilities.js';

type Row = Record<string, unknown>;
export const PROPOSAL_STATES = ['proposed', 'accepted', 'dismissed', 'superseded'] as const;

/** The domain's supply-network twins' latest ADMITTED versions on `actual` this agent has not read through yet (oldest twin first). */
export async function backlogOf(cap: SupplyNetworkReads, agentId: string): Promise<Array<{ twin_id: string; version: number; title: string; owner: string }>> {
  const kinds = ((await cap.readKinds().select(['kind'] as never).where('family' as never, '=', SUPPLY_NETWORK_FAMILY_NAME as never).execute()) as Array<{ kind: string }>).map((k) => k.kind);
  if (kinds.length === 0) return [];
  const twins = (await cap.readTwins().select(['twin_id', 'title', 'owner_principal_id', 'declared_at'] as never).where('kind' as never, 'in', kinds as never)
    .orderBy('declared_at' as never).orderBy('twin_id' as never).execute()) as Row[];
  const out: Array<{ twin_id: string; version: number; title: string; owner: string }> = [];
  for (const t of twins) {
    const v = (await cap.readVersions().select(['version'] as never).where('twin_id' as never, '=', t['twin_id'] as never).where('branch_id' as never, '=', 'actual' as never)
      .where('state' as never, '=', 'admitted' as never).orderBy('version' as never, 'desc').limit(1).executeTakeFirst()) as { version: number } | undefined;
    if (v === undefined) continue;
    const read = await cap.readScans().select(['scan_id'] as never).where('agent_id' as never, '=', agentId as never).where('twin_id' as never, '=', t['twin_id'] as never)
      .where('twin_version' as never, '=', Number(v.version) as never).where('complete' as never, '=', true as never).limit(1).executeTakeFirst();
    if (read === undefined) out.push({ twin_id: String(t['twin_id']), version: Number(v.version), title: String(t['title']), owner: String(t['owner_principal_id']) });
  }
  return out;
}

/** A version's elements as the family reads them. */
export async function elementsOf(cap: SupplyNetworkReads, twinId: string, version: number): Promise<FamilyElement[]> {
  const els = (await cap.readElements().select(['key', 'value', 'unit', 'health'] as never).where('twin_id' as never, '=', twinId as never)
    .where('version' as never, '=', version as never).orderBy('key' as never).execute()) as Row[];
  return els.map((e) => ({ key: String(e['key']), value: e['value'], unit: (e['unit'] as string | null) ?? null, health: (e['health'] as string | null) ?? null }));
}

/** Structural equality of two measures (key order aside) — what the port's digest decides, read ahead so max_items counts only new drafts. */
export function sameMeasure(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((x, i) => sameMeasure(x, b[i]));
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  const ka = Object.keys(a).sort(); const kb = Object.keys(b).sort();
  return ka.length === kb.length && ka.every((k, i) => k === kb[i] && sameMeasure((a as Row)[k], (b as Row)[k]));
}

/** The findings of a version that the port would DRAFT (a changed or a new measure), in the findings' order; the rest are unchanged. */
export async function newFindings(cap: SupplyNetworkReads, twinId: string, findings: readonly Finding[]): Promise<{ fresh: Finding[]; unchanged: Finding[] }> {
  const rows = (await cap.readProposals().select(['finding_kind', 'subject', 'measure', 'state', 'drafted_at', 'proposal_id'] as never).where('twin_id' as never, '=', twinId as never)
    .where('state' as never, '<>', 'superseded' as never).orderBy('drafted_at' as never, 'desc').orderBy('proposal_id' as never, 'desc').execute()) as Row[];
  const latest = new Map<string, Row>();
  for (const r of rows) { const k = `${String(r['finding_kind'])}|${String(r['subject'])}`; if (!latest.has(k)) latest.set(k, r); }
  const fresh: Finding[] = []; const unchanged: Finding[] = [];
  for (const f of findings) {
    const prior = latest.get(`${f.finding_kind}|${f.subject}`);
    // the JSON round trip is the port's: a measure is compared as it will be stored
    if (prior !== undefined && sameMeasure(prior['measure'], JSON.parse(JSON.stringify(f.measure)))) unchanged.push(f); else fresh.push(f);
  }
  return { fresh, unchanged };
}

export interface DecisionIntake { decision: 'accepted' | 'dismissed'; note: string | null }
export function validateDecisionIntake(p: Record<string, unknown>, correlationId: string): DecisionIntake {
  const bad = (msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };
  if (p['decision'] !== 'accepted' && p['decision'] !== 'dismissed') bad('decision is accepted or dismissed');
  const note = typeof p['note'] === 'string' && p['note'].trim().length > 0 ? p['note'].trim() : null;
  if (note !== null && note.length > 2000) bad('note is at most 2000 characters');
  if (p['decision'] === 'dismissed' && (note === null || note.length < 8)) bad('a dismissed finding states its reason (note, at least 8 characters)');
  return { decision: p['decision'] as 'accepted' | 'dismissed', note };
}

@Injectable()
export class SupplyNetworkService {
  /** The ANALYSIS of a version (the latest admitted on `actual` when none is named) and the findings a scan would propose from it. */
  async analysis(cap: SupplyNetworkReads, twinId: string, version: number | null): Promise<(Row & { analysis: NetworkAnalysis | null; findings: Finding[] }) | null> {
    const twin = (await cap.readTwins().select(['twin_id', 'kind', 'owner_principal_id'] as never).where('twin_id' as never, '=', twinId as never).executeTakeFirst()) as Row | undefined;
    if (twin === undefined) return null;
    const kind = (await cap.readKinds().select(['family'] as never).where('kind' as never, '=', twin['kind'] as never).executeTakeFirst()) as { family: string | null } | undefined;
    if (kind?.family !== SUPPLY_NETWORK_FAMILY_NAME) return { twin_id: twinId, kind: twin['kind'], family: kind?.family ?? null, version: null, analysis: null, findings: [], note: 'not a supply-network twin' };
    let vq = cap.readVersions().select(['version', 'state'] as never).where('twin_id' as never, '=', twinId as never);
    vq = version === null ? vq.where('branch_id' as never, '=', 'actual' as never).where('state' as never, '=', 'admitted' as never).orderBy('version' as never, 'desc')
                          : vq.where('version' as never, '=', version as never);
    const v = (await vq.executeTakeFirst()) as { version: number; state: string } | undefined;
    if (v === undefined) return { twin_id: twinId, kind: twin['kind'], family: kind.family, version: null, analysis: null, findings: [] };
    const analysis = analyseNetwork(await elementsOf(cap, twinId, Number(v.version)));
    return { twin_id: twinId, kind: twin['kind'], family: kind.family, owner: twin['owner_principal_id'], version: Number(v.version), state: v.state, analysis, findings: findingsOf(analysis) };
  }

  async listProposals(cap: SupplyNetworkReads, twinId: string | null, state: string | null): Promise<Row[]> {
    let q = cap.readProposals().selectAll();
    if (twinId !== null) q = q.where('twin_id' as never, '=', twinId as never);
    if (state !== null) q = q.where('state' as never, '=', state as never);
    return (await q.orderBy('drafted_at' as never, 'desc').orderBy('proposal_id' as never).execute()) as Row[];
  }

  async decide(cap: ProposalDecideWrites, ctx: ScopeContext, proposalId: string, intake: DecisionIntake, actor: string, correlationId: string): Promise<Row> {
    return cap.decide({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, proposalId, decision: intake.decision, note: intake.note, actor, eventId: newId(), correlationId });
  }
}
