/**
 * THE STREAM PROCESSOR SERVICE — CP-6 B28 (0088 §S, F-P4-11: event-time stream processing and complex event rules).
 *
 * The routes' logic over the stream ports (the database decides every window, label and signal — see the migration's header):
 *
 *   rules       define a version (a draft; human-gated), activate it (human-gated; the prior active version superseded and its live
 *               processor retired — a rule change is a new processor)
 *   processors  start (one live per rule; its baseline of already-appended segments recorded; a start checkpoint), list, get (the
 *               windows with their LATE / PARTIAL completeness, the watermark, the state and its reason, the signals — each presented
 *               as current only while its processor runs and it is the standing emission of its window —, the retractions, the
 *               checkpoints, the ledger, the inputs with their lateness, the warning candidates submitted)
 *   recovery    recover (human-gated: the newest compatible checkpoint restored, the stored inputs after it replayed), reconcile the
 *               source offsets (a divergence suspends the outputs, the gap named), retract a signal (human-gated)
 *   the sweep   a step of the ATTENTION TICK (`stream-sweep`, order 40, executive.attention.tick): every running processor verified
 *               (a digest mismatch → corrupt, the signals after the last good checkpoint retracted) and checked for a stall on the
 *               database clock — registered here at module start through the tick registry (the host never names a section).
 *
 * The tick registry lives in the executive module, which the prediction module does not import (ES-04-003's direction is kept for
 * the module graph): it is resolved from the application container at module start (ModuleRef, strict: false). The type import of
 * the registry is a code dependency only.
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import { AttentionTickRegistry } from '../../executive/attention/tick.js';
import { StreamCapability, type StreamProcessorWrites, type StreamReads, type StreamRuleWrites } from './stream.capabilities.js';
import { ruleDefinitionProblem } from './stream-windows.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** An instant as the ports' UTC text (prediction.stream_ts): YYYY-MM-DDTHH:MM:SSZ. */
export const streamTs = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().replace(/\.\d{3}Z$/, 'Z');
};
/** The candidate origin key of a signal (prediction.stream_origin_key). */
export const streamOriginKey = (processorId: string, windowStart: unknown, revision: number): string => `${processorId}:${streamTs(windowStart)}:${revision}`;

const bad = (correlationId: string, message: string, status = 422): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, message), status); };
const scopeOf = (scope: ScopeContext) => ({ tenantId: scope.tenantId as string, domainId: scope.domainId as string });

@Injectable()
export class StreamProcessorService implements OnModuleInit {
  private readonly log = new Logger('prediction.streams');
  constructor(private readonly moduleRef: ModuleRef) {}

  /** THE SWEEP as a step of the attention tick (order 40: after escalate 10, rebalance 20 and deliveries 30). */
  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: the stream sweep is not scheduled'); return; }
    registry.register({
      name: 'stream-sweep', order: 40,
      run: async (ctx) => StreamCapability.sweep(ctx.tx, 'executive.attention.tick')
        .sweep({ tenantId: ctx.tenantId, domainId: ctx.domainId, actor: ctx.agentPrincipalId, correlationId: ctx.correlationId }),
    });
  }

  // ───────────────────────── rules ─────────────────────────

  async defineRule(cap: StreamRuleWrites, scope: ScopeContext, p: Row, actor: string, correlationId: string): Promise<Row> {
    const problem = ruleDefinitionProblem(p);
    if (problem !== null) bad(correlationId, `stream rule rejected: ${problem}`);
    return cap.defineRule({
      ruleId: newId(), ...scopeOf(scope), ruleKey: String(p['ruleKey']), title: String(p['title']).trim(), seriesKey: String(p['seriesKey']),
      windowKind: String(p['windowKind']), windowDays: Number(p['windowDays']), slideDays: p['slideDays'] === undefined || p['slideDays'] === null ? null : Number(p['slideDays']),
      windowOrigin: String(p['windowOrigin']), allowedLatenessHours: Number(p['allowedLatenessHours']), watermarkLagHours: Number(p['watermarkLagHours']),
      stallAfterSeconds: Number(p['stallAfterSeconds']), predicate: p['predicate'] as Row, consequenceClass: String(p['consequenceClass']),
      responseWindowHours: p['responseWindowHours'] === undefined || p['responseWindowHours'] === null ? null : Number(p['responseWindowHours']),
      checkpointEvery: p['checkpointEvery'] === undefined ? 5 : Number(p['checkpointEvery']), ownerPrincipalId: String(p['ownerPrincipalId']), actor, correlationId,
    });
  }

  async activateRule(cap: StreamRuleWrites, scope: ScopeContext, ruleId: string, p: Row, actor: string, correlationId: string): Promise<Row> {
    if (!UUID.test(ruleId)) bad(correlationId, 'stream rule rejected: ruleId must be a rule id');
    if (typeof p['reason'] !== 'string' || p['reason'].trim().length < 8) bad(correlationId, 'stream rule rejected: a reason of at least 8 characters says why the rule is activated');
    return cap.activateRule({ ruleId, ...scopeOf(scope), reason: String(p['reason']).trim(), actor, correlationId });
  }

  async listRules(cap: StreamReads): Promise<Row[]> {
    return (await cap.readRules().selectAll().orderBy('rule_key' as never).orderBy('version' as never, 'desc').execute()) as Row[];
  }

  // ───────────────────────── processors ─────────────────────────

  async start(cap: StreamProcessorWrites, scope: ScopeContext, p: Row, actor: string, correlationId: string): Promise<Row> {
    const ruleId = p['ruleId'];
    if (typeof ruleId !== 'string' || !UUID.test(ruleId)) bad(correlationId, 'stream processor rejected: ruleId names the active rule the processor runs');
    return cap.startProcessor({ processorId: newId(), ...scopeOf(scope), ruleId: ruleId as string, actor, correlationId });
  }

  async recover(cap: StreamProcessorWrites, scope: ScopeContext, processorId: string, p: Row, actor: string, correlationId: string): Promise<Row> {
    if (!UUID.test(processorId)) bad(correlationId, 'stream processor rejected: processorId must be a processor id');
    if (typeof p['reason'] !== 'string' || p['reason'].trim().length < 8) bad(correlationId, 'stream processor rejected: a reason of at least 8 characters says why the processor is recovered');
    return cap.recoverProcessor({ processorId, ...scopeOf(scope), reason: String(p['reason']).trim(), actor, correlationId });
  }

  async reconcile(cap: StreamProcessorWrites, scope: ScopeContext, processorId: string, actor: string, correlationId: string): Promise<Row> {
    if (!UUID.test(processorId)) bad(correlationId, 'stream processor rejected: processorId must be a processor id');
    return cap.reconcileProcessor({ processorId, ...scopeOf(scope), actor, correlationId });
  }

  async retract(cap: StreamProcessorWrites, scope: ScopeContext, signalId: string, p: Row, actor: string, correlationId: string): Promise<Row> {
    if (!UUID.test(signalId)) bad(correlationId, 'stream signal rejected: signalId must be a signal id');
    if (typeof p['reason'] !== 'string' || p['reason'].trim().length < 8) bad(correlationId, 'stream signal rejected: a reason of at least 8 characters says why the signal is retracted');
    return cap.retractSignal({ signalId, ...scopeOf(scope), reason: String(p['reason']).trim(), actor, correlationId });
  }

  /** Every processor with its rule, its latest state and its counts (the list the page opens on). */
  async list(cap: StreamReads): Promise<{ processors: Row[]; rules: Row[] }> {
    const processors = (await cap.readProcessors().selectAll().orderBy('started_at' as never, 'desc').execute()) as Row[];
    const rules = await this.listRules(cap);
    const byRule = new Map(rules.map((r) => [String(r['rule_id']), r]));
    const out: Row[] = [];
    for (const pr of processors) {
      const id = String(pr['processor_id']);
      const signals = (await cap.readSignals().select(['emission', 'label', 'holds', 'retracts'] as never).where('processor_id' as never, '=', id as never).execute()) as Row[];
      const windows = (await cap.readWindows().select(['status', 'completeness'] as never).where('processor_id' as never, '=', id as never).execute()) as Row[];
      const count = (rows: Row[], k: string) => rows.reduce<Record<string, number>>((acc, r) => { const v = String(r[k]); acc[v] = (acc[v] ?? 0) + 1; return acc; }, {});
      out.push({ ...pr, rule: byRule.get(String(pr['rule_id'])) ?? null, outputs_current: pr['state'] === 'running',
                 counts: { signals: count(signals, 'emission'), labels: count(signals.filter((s) => s['emission'] !== 'retracted'), 'label'), windows: count(windows, 'status'), completeness: count(windows, 'completeness') } });
    }
    return { processors: out, rules };
  }

  /** One processor, whole: the windows, the signals as they are presented, the checkpoints, the ledger, the inputs, the candidates. */
  async get(cap: StreamReads, processorId: string): Promise<Row | undefined> {
    if (!UUID.test(processorId)) return undefined;
    const pr = (await cap.readProcessors().selectAll().where('processor_id' as never, '=', processorId as never).executeTakeFirst()) as Row | undefined;
    if (pr === undefined) return undefined;
    const rule = (await cap.readRules().selectAll().where('rule_id' as never, '=', pr['rule_id'] as never).executeTakeFirst()) as Row | undefined;
    const windows = (await cap.readWindows().selectAll().where('processor_id' as never, '=', processorId as never).orderBy('window_start' as never).execute()) as Row[];
    const signals = (await cap.readSignals().selectAll().where('processor_id' as never, '=', processorId as never).orderBy('signal_seq' as never).execute()) as Row[];
    const candidates = (await cap.readCandidates().selectAll().where('origin_kind' as never, '=', 'stream_rule' as never)
      .where('origin_key' as never, 'like', `${processorId}:%` as never).execute()) as Row[];
    const checkpoints = (await cap.readCheckpoints().select(['checkpoint_id', 'checkpoint_seq', 'watermark', 'max_event_time', 'input_seq', 'signal_hw', 'source_offsets', 'state_digest',
      'rule_digest', 'topology_version', 'reason', 'taken_at'] as never).where('processor_id' as never, '=', processorId as never).orderBy('checkpoint_seq' as never, 'desc').limit(20).execute()) as Row[];
    const events = (await cap.readProcessorEvents().selectAll().where('processor_id' as never, '=', processorId as never).orderBy('ledger_seq' as never, 'desc').limit(200).execute()) as Row[];
    const inputs = (await cap.readInputs().selectAll().where('processor_id' as never, '=', processorId as never).orderBy('input_seq' as never, 'desc').limit(300).execute()) as Row[];
    const retractionOf = new Map(signals.filter((s) => s['emission'] === 'retracted').map((s) => [String(s['retracts']), s]));
    const candidateOf = new Map(candidates.map((c) => [String(c['origin_key']), c]));
    const latestOf = new Map<string, number>();
    for (const s of signals) if (s['emission'] !== 'retracted') latestOf.set(String(streamTs(s['window_start'])), Number(s['signal_seq']));
    const running = pr['state'] === 'running';
    const presented = signals.map((s) => {
      if (s['emission'] === 'retracted') return { ...s, presented_as: 'retraction' };
      const retraction = retractionOf.get(String(s['signal_id'])) ?? null;
      const latest = latestOf.get(String(streamTs(s['window_start']))) === Number(s['signal_seq']);
      const presentedAs = retraction !== null ? 'retracted' : !latest ? 'superseded' : running ? 'current' : `suspended (processor ${String(pr['state'])})`;
      return { ...s, presented_as: presentedAs, current: presentedAs === 'current',
               retraction: retraction === null ? null : { signal_id: retraction['signal_id'], reason: retraction['reason'], kind: retraction['retraction_kind'], at: retraction['emitted_at'] },
               candidate: candidateOf.get(streamOriginKey(processorId, s['window_start'], Number(s['revision']))) ?? null };
    });
    return { processor: { ...pr, outputs_current: running }, rule: rule ?? null, windows, signals: presented, checkpoints, events, inputs, candidates };
  }
}
