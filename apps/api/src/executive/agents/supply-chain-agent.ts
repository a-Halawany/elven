/**
 * CP-6 B29 §B (0092) — THE SUPPLY CHAIN AGENT: reads the domain's supply-network twins and PROPOSES capacity and bottleneck findings to
 * the twin's owner (twin.proposal.draft); it never admits a version and never writes another twin.
 *
 * Its IDENTITY: registered with the version and the code digest of THIS runtime's scan; a run whose registration names another digest is a
 * DRIFTED agent — its scan is refused, recorded on the run and escalated to the named human (the Risk Agent's precedent,
 * exposure-agent-identity.ts). A changed method is a new digest: the agent is registered anew.
 *
 * Its SCAN (task supply_scan), under its own session:
 *   1. one read (twin.read): the BACKLOG — the latest admitted version on `actual` of each supply-network twin of the domain that this agent
 *      has not read through (twin.agent_scans), oldest twin first;
 *   2. per version, one read (twin.read): its elements → the network's analysis (twin/supply-network/network.ts) → the findings
 *      (bottleneck, coverage gaps, single sources), and which of them the owner has already been shown with the same numbers;
 *   3. per version, ONE governed write (twin.proposal.draft → twin.draft_agent_proposals): the new findings — at most the registered
 *      max_items across the run; a version cut short stays in the backlog, the rest WAIT for the next run — and the scan mark;
 *   4. the boundary exercised, not assumed: its attempt to ADMIT the version it read is refused at the PDP (its role holds no twin.version
 *      rule) and recorded on the run.
 * Every read is reserved on the run's meter BEFORE it happens and the elapsed budget is checked before every write; a run stopped midway
 * (a budget, a fault) leaves every committed version marked and the next run resumes from the backlog — nothing is drafted twice.
 */
import { createHash } from 'node:crypto';
import { HttpException } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import type { PipelineService } from '../../pipeline/pipeline.service.js';
import { SupplyNetworkCapability } from '../../twin/supply-network/supply-network.capabilities.js';
import { backlogOf, elementsOf, newFindings } from '../../twin/supply-network/supply-network.service.js';
import { analyseNetwork, findingsOf } from '../../twin/supply-network/network.js';

export const SUPPLY_CHAIN_AGENT_VERSION = '1.0.0';
export const SUPPLY_CHAIN_AGENT_METHOD = `supply-chain-agent@${SUPPLY_CHAIN_AGENT_VERSION}`;

/** What a run does, in words: the digest is taken over this text. */
const METHOD_TEXT = 'one run under the Supply Chain Agent\'s own session, task supply_scan: the backlog of the domain\'s supply-network twins '
  + '(each twin\'s latest admitted version on actual not yet read through by this agent) read under twin.read; per version the network analysed '
  + '(tier coverage; the capacity bottleneck — the one capacity whose relief raises the throughput to the terminal site the most; single-source '
  + 'exposure) and its findings drafted to the twin\'s owner under twin.proposal.draft (bottleneck, coverage_gap, single_source — the same measure '
  + 'never twice; at most the registered max_items; the rest wait); the agent admits no version and writes no element (its attempt is refused at '
  + 'the PDP and recorded on the run)';
export const SUPPLY_CHAIN_AGENT_DIGEST = createHash('sha256').update(`twin.supply_chain.agent@${SUPPLY_CHAIN_AGENT_VERSION}:${METHOD_TEXT}`, 'utf8').digest('hex');

type Row = Record<string, unknown>;
interface Refusal { action: string; code: string; reason: string; at: string }
/** The run's meter (agents.service.ts): every budget checked BEFORE the unit of work it bounds. */
export interface ScanMeter { read(what: string): void; tick(what?: string): void }
export interface ScanDeps {
  pipeline: PipelineService;
  env(action: string, objectType: string, objectId: string | null): Envelope;
  route(action: string, objectType: string, objectId: string | null): { scope: 'DOMAIN'; tenantId: string; domainId: string; action: string; objectType: string; objectId: string | null };
}

export async function supplyScan(d: ScanDeps, p: AuthenticatedPrincipal, a: {
  tenantId: string; domainId: string; agentId: string; runId: string; registration: { agent_version: string; code_digest: string };
  meter: ScanMeter; stops: Array<Record<string, unknown>>; refusals: Refusal[]; correlationId: string; identity: Record<string, unknown>;
}): Promise<Row> {
  const provenance = { purpose: 'twin', package_id: null, room_id: null, classification: 'internal', contributors: [] as string[] };
  if (a.registration.agent_version !== SUPPLY_CHAIN_AGENT_VERSION || a.registration.code_digest !== SUPPLY_CHAIN_AGENT_DIGEST) {
    const reason = `supply scan refused (drift): the agent is registered as ${a.registration.agent_version} with code digest ${a.registration.code_digest.slice(0, 12)}…; this runtime's scan is `
      + `${SUPPLY_CHAIN_AGENT_VERSION} with ${SUPPLY_CHAIN_AGENT_DIGEST.slice(0, 12)}… — the agent is registered anew before it scans again`;
    a.refusals.push({ action: 'twin.proposal.draft', code: 'EYE-AUT-001', reason, at: new Date().toISOString() });
    return { refused: true, reason, marked: 'agent-produced', agent: a.identity, provenance };
  }
  const maxItems = a.stops.filter((s) => s['kind'] === 'max_items').map((s) => Number(s['value'])).reduce<number | null>((acc, v) => (acc === null ? v : Math.min(acc, v)), null);
  a.meter.read('the domain\'s supply-network backlog');
  const backlog = (await d.pipeline.consequentialRead(d.env('twin.read', 'TWN', null), p, d.route('twin.read', 'TWN', null), SupplyNetworkCapability.read,
    async (cap) => backlogOf(cap, a.agentId))).result;
  let remaining = maxItems ?? Number.POSITIVE_INFINITY;
  const scanned: Row[] = []; const drafted: Row[] = []; const waiting: Row[] = []; const receipts: Row[] = [];
  let unchanged = 0;
  for (const item of backlog) {
    if (remaining <= 0) { waiting.push({ twin_id: item.twin_id, version: item.version, reason: 'max_items reached: waits for the next run' }); continue; }
    a.meter.read(`twin ${item.twin_id} version ${item.version}`);
    const read = (await d.pipeline.consequentialRead(d.env('twin.read', 'TWN', item.twin_id), p, d.route('twin.read', 'TWN', item.twin_id), SupplyNetworkCapability.read,
      async (cap) => {
        const findings = findingsOf(analyseNetwork(await elementsOf(cap, item.twin_id, item.version)));
        return { findings, ...(await newFindings(cap, item.twin_id, findings)) };
      })).result;
    const take = read.fresh.slice(0, Number.isFinite(remaining) ? remaining : undefined);
    const complete = take.length === read.fresh.length;
    a.meter.tick(`the draft of twin ${item.twin_id} version ${item.version}`);
    const w = await d.pipeline.write(d.env('twin.proposal.draft', 'TWN', item.twin_id), p, d.route('twin.proposal.draft', 'TWN', item.twin_id), SupplyNetworkCapability.draft,
      async (cap, scope) => ({ result: await cap.draft({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, twinId: item.twin_id, version: item.version,
        findings: [...read.unchanged, ...take], complete, agentId: a.agentId, runId: a.runId, actor: p.principalId, correlationId: a.correlationId }),
        targetType: 'TWN', targetId: item.twin_id, targetVersion: String(item.version), outboxEvent: null }));
    const out = w.result as { drafted?: Row[]; unchanged?: Row[]; superseded?: Row[] };
    remaining -= (out.drafted ?? []).length;
    unchanged += (out.unchanged ?? []).length;
    drafted.push(...(out.drafted ?? []).map((x) => ({ ...x, twin_id: item.twin_id, version: item.version, owner: item.owner })));
    scanned.push({ twin_id: item.twin_id, version: item.version, findings: read.findings.length, drafted: (out.drafted ?? []).length, unchanged: (out.unchanged ?? []).length,
                   superseded: (out.superseded ?? []).length, complete });
    receipts.push({ twin_id: item.twin_id, policyDecisionId: w.policyDecisionId, auditSeq: w.auditSeq });
    if (!complete) waiting.push({ twin_id: item.twin_id, version: item.version, reason: `max_items reached: ${read.fresh.length - take.length} finding(s) wait for the next run` });
  }
  // The agent proposes; the version is the OWNER's to admit. Its attempt is refused at the PDP (no grant) and recorded — the boundary exercised.
  const target = typeof scanned[0]?.['twin_id'] === 'string' ? String(scanned[0]['twin_id']) : null;
  if (target !== null) {
    try {
      await d.pipeline.write(d.env('twin.version.admit', 'TWN', target), p, d.route('twin.version.admit', 'TWN', target), SupplyNetworkCapability.read,
        async () => ({ result: null, targetType: 'TWN', targetId: target, targetVersion: null, outboxEvent: null }));
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() === 403) a.refusals.push({ action: 'twin.version.admit', code: String((e.getResponse() as { code?: string }).code ?? 'EYE-AUT-001'), reason: String((e.getResponse() as { message?: string }).message ?? ''), at: new Date().toISOString() });
      else throw e;
    }
  }
  return { backlog: backlog.length, scanned, drafted, unchanged, waiting, max_items: maxItems, receipts,
           marked: 'agent-produced: proposed to the twin\'s owner, never admitted by the agent', agent: a.identity,
           provenance: { ...provenance, contributors: scanned.map((s) => `TWN:${String(s['twin_id'])}@${String(s['version'])}`) } };
}
