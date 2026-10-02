/**
 * CP-6 B30 §ES (0103) — THE RECONCILIATION AGENT (F-P5-02: "Reconciliation Agent proposes only"; the Supply Chain Agent's precedent, 0092
 * §B): reads the domain's PENDING proposal checks (the triggers the attention agent queued after its tick — telemetry, an upstream twin's
 * change, an ontology revision) and, per twin × key, PROPOSES the estimate its declared estimators compute from qualified inputs
 * (twin.estimate.propose) — or, when the primary's inputs are missing or stale, REQUESTS new observations (twin.observation.request). It never
 * approves (the twin owner decides; its attempt is refused at the PDP and recorded on the run) and never writes a twin version (its role holds
 * no twin.version, twin.ground or twin.version.admit rule; twin.agent_write_boundary refuses it at the port whatever it holds).
 *
 * Its IDENTITY: registered with the version and the code digest of THIS runtime's scan; a drifted registration's run is refused, recorded
 * and escalated (the agent identity rule). Its SCAN (task reconcile_scan), under its own session:
 *   1. one read (twin.estimation.read): the pending twin × keys, oldest first;
 *   2. per twin × key (at most the registered max_items): the computation (reads only — the series through the Phase 4 path, the
 *      qualification, the candidates, the constraint check) and ONE governed write: the proposal, or the observation requests;
 *   3. the boundary exercised: its attempt to DECIDE the first estimate it proposed is refused at the PDP and recorded.
 * Every read is reserved on the run's meter before it happens and the elapsed budget is checked before every write.
 */
import { HttpException } from '@nestjs/common';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import type { PipelineService } from '../../pipeline/pipeline.service.js';
import { digestOf } from './estimators.js';
import { EstimationCapability } from './estimation.capabilities.js';
import type { ScanArgs, ScanEnv } from './reconciliation-bridge.js';
import type { EstimationService } from './estimation.service.js';

export const RECONCILIATION_AGENT_VERSION = '1.0.0';
export const RECONCILIATION_AGENT_METHOD = `reconciliation-agent@${RECONCILIATION_AGENT_VERSION}`;

/** What a run does, in words: the digest is taken over this text. */
const METHOD_TEXT = 'one run under the Reconciliation Agent\'s own session, task reconcile_scan: the domain\'s pending proposal checks (triggers queued after the '
  + 'attention tick: telemetry, upstream twin change, ontology revision) read under twin.estimation.read; per twin and key, the declared estimators\' '
  + 'candidates computed from QUALIFIED inputs only (source health, cadence, unit, truth state; the Phase 4 series path), the spread kept, the '
  + 'constraint engine run on the estimate\'s quantities before publish, and the estimate PROPOSED to the twin\'s owner under twin.estimate.propose '
  + '(at most the registered max_items; the rest wait) — or, when the primary\'s inputs are missing or stale, new observations requested under '
  + 'twin.observation.request; the agent approves nothing and writes no twin version (its attempt to decide is refused at the PDP and recorded on the run)';
export const RECONCILIATION_AGENT_DIGEST = digestOf(`twin.reconciliation.agent@${RECONCILIATION_AGENT_VERSION}:${METHOD_TEXT}`);

type Row = Record<string, unknown>;
export interface ReconcileDeps extends ScanEnv { estimation: EstimationService; pipeline: PipelineService }

export async function reconcileScan(d: ReconcileDeps, p: AuthenticatedPrincipal, a: ScanArgs): Promise<Row> {
  const provenance = { purpose: 'twin', package_id: null, room_id: null, classification: 'internal', contributors: [] as string[] };
  if (a.registration.agent_version !== RECONCILIATION_AGENT_VERSION || a.registration.code_digest !== RECONCILIATION_AGENT_DIGEST) {
    const reason = `reconcile scan refused (drift): the agent is registered as ${a.registration.agent_version} with code digest ${a.registration.code_digest.slice(0, 12)}…; this runtime's scan is `
      + `${RECONCILIATION_AGENT_VERSION} with ${RECONCILIATION_AGENT_DIGEST.slice(0, 12)}… — the agent is registered anew before it scans again`;
    a.refusals.push({ action: 'twin.estimate.propose', code: 'EYE-AUT-001', reason, at: new Date().toISOString() });
    return { refused: true, reason, marked: 'agent-produced', agent: a.identity, provenance };
  }
  const maxItems = a.stops.filter((s) => s['kind'] === 'max_items').map((s) => Number(s['value'])).reduce<number | null>((acc, v) => (acc === null ? v : Math.min(acc, v)), null);
  a.meter.read('the domain\'s pending proposal checks');
  const pending = (await d.pipeline.consequentialRead(d.env('twin.estimation.read', 'TWE', null), p, d.route('twin.estimation.read', 'TWE', null), EstimationCapability.read,
    async (cap) => cap.pending())).result;
  let remaining = maxItems ?? Number.POSITIVE_INFINITY;
  const proposed: Row[] = []; const requested: Row[] = []; const waiting: Row[] = []; const failed: Row[] = [];
  for (const item of pending) {
    const twinId = String(item['twin_id']); const key = String(item['key']);
    if (remaining <= 0) { waiting.push({ twin_id: twinId, key, reason: 'max_items reached: waits for the next run' }); continue; }
    a.meter.read(`twin ${twinId} key ${key}`);
    const base = d.env('twin.estimation.read', 'TWN', twinId);
    const trigger = { kinds: item['kinds'], triggers: item['triggers'], oldest: item['oldest'], run_id: a.runId };
    try {
      const computed = await d.estimation.compute(base, p, a.tenantId, a.domainId, twinId, key);
      a.meter.tick(`the proposal for twin ${twinId} key ${key}`);
      if (computed.primary === null || computed.primary.value === null) {
        // the primary's inputs are missing or stale: new observations are requested (a standing request answers again; nothing is proposed)
        for (const u of computed.unqualified) {
          const inp = u.input;
          const input = inp['kind'] === 'series' ? { kind: 'series', series_key: inp['series_key'] } : { kind: 'element', key: inp['key'] };
          const w = await d.pipeline.write(d.env('twin.observation.request', 'TWE', null), p, d.route('twin.observation.request', 'TWE', null), EstimationCapability.request,
            async (cap, scope) => ({ result: await d.estimation.request(cap, scope, { twinId, key, estimatorId: u.estimator_id, input, reasonClass: u.reason_class,
              note: `Reconciliation Agent: the primary estimator's input is ${u.reason_class} — ${u.reasons.join('; ')}`.slice(0, 2000) }, { agentId: a.agentId, runId: a.runId }, p.principalId, a.correlationId),
              targetType: 'TWE', targetId: null, targetVersion: null, outboxEvent: null }));
          requested.push({ twin_id: twinId, key, ...w.result, reasons: u.reasons });
        }
        waiting.push({ twin_id: twinId, key, reason: 'no qualified primary candidate: new observations requested' });
        remaining -= 1;
        continue;
      }
      const r = await d.estimation.propose(base, p, a.tenantId, a.domainId, twinId, key, { agentId: a.agentId, runId: a.runId }, trigger);
      proposed.push({ twin_id: twinId, key, estimate_id: r.estimate['estimate_id'], value: r.estimate['value'], unit: r.estimate['unit'], material: r.estimate['material'],
                      ambiguous: r.estimate['ambiguous'], routed: r.estimate['routed'], constraint: r.estimate['constraint'], receipt: r.receipt });
      remaining -= 1;
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() === 403) throw e;
      if (e instanceof Error && e.constructor.name === 'BudgetExceeded') throw e;
      failed.push({ twin_id: twinId, key, reason: (e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : (e as Error).message ?? String(e)).slice(0, 500) });
    }
  }
  // The agent proposes; the estimate is the OWNER's to decide. Its attempt is refused at the PDP (no grant) and recorded — the boundary exercised.
  const target = typeof proposed[0]?.['estimate_id'] === 'string' ? String(proposed[0]['estimate_id']) : null;
  if (target !== null) {
    try {
      await d.pipeline.write(d.env('twin.estimate.decide', 'TWE', target), p, d.route('twin.estimate.decide', 'TWE', target), EstimationCapability.read,
        async () => ({ result: null, targetType: 'TWE', targetId: target, targetVersion: null, outboxEvent: null }));
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() === 403) {
        a.refusals.push({ action: 'twin.estimate.decide', code: String((e.getResponse() as { code?: string }).code ?? 'EYE-AUT-001'), reason: String((e.getResponse() as { message?: string }).message ?? ''), at: new Date().toISOString() });
      } else throw e;
    }
  }
  return { pending: pending.length, proposed, requested, waiting, failed, max_items: maxItems,
           marked: 'agent-produced: proposed to the twin\'s owner, never approved by the agent', agent: a.identity,
           provenance: { ...provenance, contributors: proposed.map((x) => `TWE:${String(x['estimate_id'])}`) } };
}
