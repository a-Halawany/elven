/**
 * THE THREE BOUNDED AGENTS — Phase 6 (L9), stage P6-M6.
 *
 *   Decision agent   assembles option cards from completed runs into a DRAFT package
 *                    version. It can draft and annotate; it can neither propose, approve,
 *                    dissent nor commit — its attempt is refused at the PDP (no grant) and
 *                    at the port (principal kind), and recorded on the run.
 *   Briefing agent   composes a room's briefing on the cadence or on demand, within a
 *                    budget of reads; a budget hit stops the run and escalates to the
 *                    named human; it evaluates the room's conditions first.
 *   Reporting agent  renders a report from stored records with attribution, classification
 *                    and truth states intact; it refuses an export its clearance does
 *                    not cover.
 * Every run is opened and closed by the agent under its own session, with its trigger;
 * every output carries the agent's identity, version and method. Nothing learns.
 *
 * Review of PR #46, item 7: the registration is read by the session port under the
 * identity-operation capability — no human's cached principal is borrowed, so a scheduled
 * tick runs on a cold process and after a restart. Every budget is checked BEFORE the work
 * it bounds (reads, elapsed time) on every task, the registered stop conditions are
 * evaluated before anything is admitted, and every stop is recorded and escalated.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody, type Envelope } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import type { ScopeContext } from '../../shared/scope.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { PrincipalsService } from '../../identity/principals.service.js';
import { PrincipalsCapability } from '../../shared/capabilities.js';
import { DecisionCapability } from '../../decision/decision.capabilities.js';
import { PackageService, type OptionIntake } from '../../decision/packages/package.service.js';
import { clearanceOf, covers } from '../../decision/clearance.js';
import { ExecutiveCapability, type AgentWrites, type ExecutiveReads } from '../executive.capabilities.js';
import { BriefingService, BudgetExceeded, StopCondition, type CompositionLimits } from '../briefings/briefing.service.js';
import { DecisionAgentGrantRefused, DecisionAgentSessionService } from './agent-session.service.js';

export type AgentKind = 'decision' | 'briefing' | 'reporting';
export type AgentTask = 'draft' | 'briefing' | 'report' | 'monitor';
const ROLE_OF: Record<AgentKind, string> = { decision: 'decision_agent', briefing: 'briefing_agent', reporting: 'reporting_agent' };
const METHOD_OF: Record<AgentKind, string> = { decision: 'decision-agent-option-cards@1.0.0', briefing: 'briefing-agent@1.0.0', reporting: 'reporting-agent@1.0.0' };
const CLEARANCE_RANK: Record<string, number> = { public: 0, internal: 1, confidential: 2, restricted: 3 };
/** The stop conditions this runtime implements; any other kind is refused at registration (here and at the port). */
export const SUPPORTED_STOP_CONDITIONS = ['max_items', 'on_degraded'] as const;
/** Which agent kinds enforce each condition in their task (registration refuses any other pairing, here and at the port). */
export const STOP_CONDITION_KINDS: Readonly<Record<string, readonly AgentKind[]>> = Object.freeze({ max_items: ['decision', 'briefing'], on_degraded: ['briefing'] });

export interface RegisterAgentIntake { kind: AgentKind; version: string; codeDigest: string; ownerPrincipalId: string; escalationPrincipalId: string; budgets: Record<string, unknown>; stopConditions: unknown[] }
export function validateRegisterAgent(m: Partial<RegisterAgentIntake>, correlationId: string): RegisterAgentIntake {
  const bad = (msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };
  if (m.kind !== 'decision' && m.kind !== 'briefing' && m.kind !== 'reporting') bad('kind is decision, briefing or reporting');
  if (typeof m.version !== 'string' || !/^[0-9]+\.[0-9]+\.[0-9]+$/.test(m.version)) bad('version must be semver');
  if (typeof m.codeDigest !== 'string' || !/^[0-9a-f]{64}$/.test(m.codeDigest)) bad('codeDigest must be 64 hex');
  if (typeof m.ownerPrincipalId !== 'string' || typeof m.escalationPrincipalId !== 'string') bad('ownerPrincipalId and escalationPrincipalId name humans');
  const b = m.budgets ?? {};
  if (typeof b !== 'object' || b === null || !Number.isInteger(b['max_reads']) || !Number.isInteger(b['max_gateway_calls']) || !Number.isInteger(b['max_elapsed_ms'])) bad('budgets name integer max_reads, max_gateway_calls and max_elapsed_ms');
  for (const k of ['max_reads', 'max_gateway_calls', 'max_elapsed_ms']) if (Number((b as Record<string, unknown>)[k]) < 0) bad(`budget ${k} is a non-negative integer`);
  const stops = Array.isArray(m.stopConditions) ? m.stopConditions : [];
  for (const s of stops) {
    const sc = (s !== null && typeof s === 'object' ? s : {}) as Record<string, unknown>;
    if (!SUPPORTED_STOP_CONDITIONS.includes(sc['kind'] as never)) bad(`stop condition ${JSON.stringify(sc['kind'] ?? s)} is not one this runtime supports (${SUPPORTED_STOP_CONDITIONS.join(', ')})`);
    // an accepted condition is one this agent kind's task ENFORCES: max_items on the decision draft and the briefing, on_degraded on the briefing
    const enforcedBy = STOP_CONDITION_KINDS[sc['kind'] as string] ?? [];
    if (!enforcedBy.includes(m.kind as AgentKind)) bad(`stop condition ${String(sc['kind'])} is not enforced by a ${m.kind} agent's task (enforced by: ${enforcedBy.join(', ')}); an unenforced control is not accepted`);
    if (sc['kind'] === 'max_items' && (!Number.isInteger(sc['value']) || Number(sc['value']) < 0)) bad('stop condition max_items names a non-negative integer value');
  }
  return { kind: m.kind as AgentKind, version: m.version as string, codeDigest: m.codeDigest as string, ownerPrincipalId: m.ownerPrincipalId as string, escalationPrincipalId: m.escalationPrincipalId as string,
           budgets: { clearance: 'internal', ...(b as Record<string, unknown>) }, stopConditions: stops };
}

export interface Refusal { action: string; code: string; reason: string; at: string }
export interface RunOutcome { runId: string; agentId: string; outcome: string; spent: Record<string, unknown>; stopReason: string | null; refusals: Refusal[]; outputs: Record<string, unknown>; escalatedTo: string | null }

/** The run's meter: every budget is checked BEFORE the unit of work it bounds, never after. */
class Meter {
  readonly spent: Record<string, number> = { reads: 0, gateway_calls: 0, elapsed_ms: 0 };
  constructor(private readonly budget: Record<string, number>, private readonly started: number) {}
  private elapsed(): number { return Date.now() - this.started; }
  /** Refuse further work when the elapsed budget is exhausted. */
  tick(): void {
    this.spent['elapsed_ms'] = this.elapsed();
    if (this.elapsed() >= Number(this.budget['max_elapsed_ms'] ?? 0)) throw new BudgetExceeded(`elapsed ${this.elapsed()} ms reaches the budget of ${String(this.budget['max_elapsed_ms'])} ms; the run stops before further work`);
  }
  /** Reserve one read: refused before the read happens when the budget would be exceeded. */
  read(what: string): void {
    this.tick();
    if (this.spent['reads'] as number >= Number(this.budget['max_reads'] ?? 0)) throw new BudgetExceeded(`read budget of ${String(this.budget['max_reads'])} reached before ${what}; ${String(this.spent['reads'])} read(s) spent`);
    this.spent['reads'] = (this.spent['reads'] as number) + 1;
  }
  remainingReads(): number { return Math.max(0, Number(this.budget['max_reads'] ?? 0) - (this.spent['reads'] as number)); }
  /** The instant the elapsed budget runs out (epoch ms): propagated into nested work so it is checked before reads and before admission. */
  deadline(): number { return this.started + Number(this.budget['max_elapsed_ms'] ?? 0); }
  close(): Record<string, number> { this.spent['elapsed_ms'] = this.elapsed(); return { ...this.spent }; }
}

@Injectable()
export class AgentsService {
  constructor(
    private readonly pipeline: PipelineService, private readonly principals: PrincipalsService, private readonly sessions: DecisionAgentSessionService,
    private readonly packages: PackageService, private readonly briefings: BriefingService,
  ) {}

  /** The envelope an agent's governed operation needs. Built server-side; never client-supplied. */
  private env(principal: AuthenticatedPrincipal, tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null, correlationId: string, purpose = 'agent'): Envelope {
    return {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${principal.principalId}`, purpose_id: purpose, action,
      side_effect_class: action.includes('.read') || action === 'report.render' ? 'none' : 'reversible', consequence_class: 'C1', object_type: objectType, object_id: objectId,
      schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: correlationId, trace_id: `agent-${objectType.toLowerCase()}`,
    } as unknown as Envelope;
  }
  private route(tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null) { return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId }; }

  /** Register: the principal on the identity authority (kind agent, its role), then the registration on the commit authority. */
  async register(envelope: Envelope, actor: AuthenticatedPrincipal, tenantId: string, domainId: string, intake: RegisterAgentIntake) {
    const principalId = newId(); const agentId = newId();
    await this.pipeline.write({ ...envelope, action: 'identity.principal.create', message_id: newId() }, actor,
      { scope: 'DOMAIN', tenantId, domainId, action: 'identity.principal.create', objectType: 'PRN', objectId: principalId, authority: 'identity' }, PrincipalsCapability.write,
      async (cap) => {
        await this.principals.createPrincipal(cap, { principalId, correlationId: envelope.correlation_id, kind: 'agent', scope: 'DOMAIN', tenantId, domainId,
          displayName: `agent:${intake.kind}@${intake.version} (${intake.codeDigest.slice(0, 12)})`, loginName: `agent-${intake.kind}-${intake.version}-${intake.codeDigest.slice(0, 12)}-${principalId.slice(-6)}`, roleCode: ROLE_OF[intake.kind] });
        return { result: { principalId }, targetType: 'PRN', targetId: principalId, targetVersion: '1', outboxEvent: null };
      });
    const out = await this.pipeline.write({ ...envelope, action: 'agent.register', message_id: newId() }, actor, this.route(tenantId, domainId, 'agent.register', 'AGT', agentId), ExecutiveCapability.agent,
      async (cap) => {
        const r = await cap.registerAgent({ agentId, tenantId, domainId, principalId, kind: intake.kind, version: intake.version, codeDigest: intake.codeDigest, owner: intake.ownerPrincipalId,
          escalation: intake.escalationPrincipalId, budgets: intake.budgets, stopConditions: intake.stopConditions, actor: actor.principalId, correlationId: envelope.correlation_id });
        return { result: { agentId, principalId, kind: r.kind, role: ROLE_OF[intake.kind] }, targetType: 'AGT', targetId: agentId, targetVersion: '1', outboxEvent: null };
      });
    return { agent: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /** The registry and the recent runs; a run's outputs are withheld from a reader whose clearance does not cover the package they concern. */
  async list(cap: ExecutiveReads, reader: AuthenticatedPrincipal | null = null, target: { tenantId: string | null; domainId: string | null } | null = null) {
    const agents = (await cap.readAgents().selectAll().orderBy('created_at' as never).execute()) as Array<Record<string, unknown>>;
    const runs = (await cap.readAgentRuns().selectAll().orderBy('started_at' as never, 'desc').limit(200).execute()) as Array<Record<string, unknown>>;
    if (reader === null || target === null) return { agents, runs };
    const clearance = clearanceOf(reader, target);
    const classificationOf = new Map<string, string>();
    const packageIds = [...new Set(runs.map((r) => r['package_id']).filter((x): x is string => typeof x === 'string'))];
    const roomIds = [...new Set(runs.map((r) => r['room_id']).filter((x): x is string => typeof x === 'string'))];
    if (roomIds.length > 0) {
      const rooms = (await cap.readRooms().select(['room_id', 'package_id'] as never).where('room_id' as never, 'in', roomIds as never).execute()) as Array<{ room_id: string; package_id: string }>;
      for (const r of rooms) packageIds.push(r.package_id);
      for (const run of runs) if (typeof run['room_id'] === 'string' && run['package_id'] === null) run['package_id_of_room'] = rooms.find((x) => x.room_id === run['room_id'])?.package_id ?? null;
    }
    if (packageIds.length > 0) {
      const pkgs = (await cap.readPackages().select(['package_id', 'controls'] as never).where('package_id' as never, 'in', [...new Set(packageIds)] as never).execute()) as Array<{ package_id: string; controls: Record<string, unknown> | null }>;
      for (const p of pkgs) classificationOf.set(p.package_id, String(p.controls?.['classification'] ?? 'internal'));
    }
    // a run's room: a stored output is read by the room's members (residual review R4d), whatever the reader's role
    const membership = new Map<string, boolean>();
    for (const rid of roomIds) membership.set(rid, await cap.isMember({ roomId: rid, principal: reader.principalId }));
    const roomOfPackage = new Map<string, string>();
    if (packageIds.length > 0) {
      const rooms = (await cap.readRooms().select(['room_id', 'package_id'] as never).where('package_id' as never, 'in', [...new Set(packageIds)] as never).execute()) as Array<{ room_id: string; package_id: string }>;
      for (const r of rooms) { roomOfPackage.set(r.package_id, r.room_id); if (!membership.has(r.room_id)) membership.set(r.room_id, await cap.isMember({ roomId: r.room_id, principal: reader.principalId })); }
    }
    const redacted = runs.map((run) => {
      const pid = typeof run['package_id'] === 'string' ? run['package_id'] : (typeof run['package_id_of_room'] === 'string' ? run['package_id_of_room'] : null);
      const classification = pid === null ? 'internal' : (classificationOf.get(pid) ?? 'restricted');
      const roomId = typeof run['room_id'] === 'string' ? run['room_id'] : (pid === null ? null : (roomOfPackage.get(pid) ?? null));
      const { package_id_of_room: _drop, ...rest } = run;
      if (!covers(clearance, classification)) return { ...rest, outputs: { withheld: `the run's package is classified ${classification}; the reader's clearance in this domain is ${clearance}` } };
      if (roomId !== null && membership.get(roomId) !== true) return { ...rest, outputs: { withheld: 'the run belongs to a room the reader is not a member of' } };
      return rest;
    });
    return { agents, runs: redacted };
  }

  /**
   * RUN. The agent opens its own session and its run (trigger recorded), does the one
   * thing its contract allows, spends its budget, and closes the run — finished,
   * stopped (escalated), refused (escalated) or faulted (escalated).
   */
  async run(a: { agentId: string; tenantId: string; domainId: string; task: AgentTask; trigger: { kind: 'operator' | 'scheduler'; principalId: string | null; ref: string | null };
                 roomId: string | null; packageId: string | null; version: number | null; correlationId: string }): Promise<RunOutcome> {
    const T = a.tenantId; const D = a.domainId;
    let principal: AuthenticatedPrincipal; let registration: Awaited<ReturnType<DecisionAgentSessionService['openRunSession']>>['registration'];
    try {
      ({ principal, registration } = await this.sessions.openRunSession({ agentId: a.agentId, tenantId: T, domainId: D, correlationId: a.correlationId }));
    } catch (e) {
      if (e instanceof DecisionAgentGrantRefused) throw new HttpException(errorBody('EYE_AUT_001', a.correlationId, e.message), 403);
      throw e;
    }
    const runId = newId();
    const opened = await this.pipeline.write(this.env(principal, T, D, 'agent.run', 'RUN', runId, a.correlationId), principal, this.route(T, D, 'agent.run', 'RUN', runId), ExecutiveCapability.agent,
      async (cap) => {
        const r = await cap.openAgentRun({ runId, tenantId: T, domainId: D, agentId: a.agentId, task: a.task, triggerKind: a.trigger.kind, triggerPrincipal: a.trigger.principalId, triggerRef: a.trigger.ref, roomId: a.roomId, packageId: a.packageId, correlationId: a.correlationId });
        return { result: r, targetType: 'RUN', targetId: runId, targetVersion: '1', outboxEvent: null };
      });
    const budget = opened.result.budget as Record<string, number>;
    const stops = (opened.result.stop_conditions ?? []) as Array<Record<string, unknown>>;
    const meter = new Meter(budget, Date.now());
    const refusals: Refusal[] = [];
    let outcome: 'finished' | 'stopped' | 'refused' | 'faulted' = 'finished'; let stopReason: string | null = null; let outputs: Record<string, unknown> = {};
    const identity = { agent_id: a.agentId, agent_kind: registration.agent_kind, agent_version: registration.agent_version, code_digest: registration.code_digest, method: METHOD_OF[registration.agent_kind as AgentKind], principal_id: principal.principalId };
    try {
      if (a.task === 'draft') outputs = await this.draft(principal, T, D, a.packageId, a.version, meter, stops, refusals, a.correlationId, identity);
      else if (a.task === 'briefing' || a.task === 'monitor') outputs = await this.brief(principal, T, D, a.roomId, a.task, meter, stops, a.correlationId, identity);
      else outputs = await this.report(principal, T, D, a.packageId, budget, meter, a.correlationId, identity);
      if (outputs['refused'] === true) { outcome = 'refused'; stopReason = String(outputs['reason']); }
    } catch (e) {
      if (e instanceof BudgetExceeded) { outcome = 'stopped'; stopReason = `budget: ${e.message}`; }
      else if (e instanceof StopCondition) { outcome = 'stopped'; stopReason = e.message; }
      else if (e instanceof HttpException && e.getStatus() === 403) { outcome = 'refused'; stopReason = String((e.getResponse() as { message?: string }).message ?? 'refused'); refusals.push({ action: a.task, code: String((e.getResponse() as { code?: string }).code ?? 'EYE-AUT-001'), reason: stopReason, at: new Date().toISOString() }); }
      else { outcome = 'faulted'; stopReason = `fault: ${(e as Error).message}`.slice(0, 500); }
    }
    const spent = meter.close();
    if (outcome === 'finished' && Number(spent['elapsed_ms']) > Number(budget['max_elapsed_ms'])) { outcome = 'stopped'; stopReason = `budget: elapsed ${String(spent['elapsed_ms'])} ms exceeds the budget of ${String(budget['max_elapsed_ms'])} ms`; }
    const closed = await this.pipeline.write(this.env(principal, T, D, 'agent.run', 'RUN', runId, a.correlationId), principal, this.route(T, D, 'agent.run', 'RUN', runId), ExecutiveCapability.agent,
      async (cap) => {
        const r = await cap.closeAgentRun({ runId, tenantId: T, domainId: D, outcome, spent, stopReason, refusals, outputs: { ...outputs, agent: identity }, correlationId: a.correlationId });
        return { result: r, targetType: 'RUN', targetId: runId, targetVersion: '1', outboxEvent: null };
      });
    return { runId, agentId: a.agentId, outcome, spent, stopReason, refusals, outputs: { ...outputs, agent: identity }, escalatedTo: closed.result.escalated_to ?? null };
  }

  // ───────────────────────── the decision agent ─────────────────────────
  private async draft(p: AuthenticatedPrincipal, T: string, D: string, packageId: string | null, version: number | null, meter: Meter, stops: Array<Record<string, unknown>>, refusals: Refusal[], correlationId: string, identity: Record<string, unknown>) {
    if (packageId === null || version === null) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'the draft task names a package and a draft version'), 422);
    meter.read('the completed runs and the draft\'s options');
    const read = await this.pipeline.consequentialRead(this.env(p, T, D, 'decision.read', 'DPK', packageId, correlationId), p, this.route(T, D, 'decision.read', 'DPK', packageId), DecisionCapability.read, async (cap) => {
      const runs = (await cap.readRuns().selectAll().where('state' as never, '=', 'completed' as never).orderBy('completed_at' as never).limit(200).execute()) as Array<Record<string, unknown>>;
      const existing = (await cap.readOptions().select(['key' as never]).where('package_id' as never, '=', packageId as never).where('version' as never, '=', version as never).execute()) as Array<{ key: string }>;
      return { runs, existing: new Set(existing.map((o) => o.key)) };
    });
    // the option cards: the first control with interventions on it is the common baseline; each intervention is a card
    const controls = read.result.runs.filter((r) => r['run_kind'] === 'control');
    const picked = controls.map((c) => ({ c, interventions: read.result.runs.filter((r) => r['run_kind'] === 'intervention' && String(r['control_run_id']) === String(c['run_id'])) })).filter((x) => x.interventions.length > 0)[0];
    const cards: OptionIntake[] = [];
    if (picked !== undefined) {
      cards.push({ key: 'status-quo', title: 'Do nothing (the control run)', kind: 'status_quo', consequences: [{ kind: 'run', id: String(picked.c['run_id']), version: 1 }], unsimulatedReason: null, secondOrder: [], risks: [], opportunities: [], reversibility: null });
      picked.interventions.forEach((r, i) => {
        const type = String(((r['interventions'] as Array<Record<string, unknown>>)?.[0]?.['type']) ?? 'intervention').replace(/[^a-z0-9]+/gi, '-').toLowerCase();
        cards.push({ key: `${type}-${i + 1}`, title: `${type.replace(/-/g, ' ')} (run ${String(r['run_id']).slice(0, 8)})`, kind: 'intervention', consequences: [{ kind: 'run', id: String(r['run_id']), version: 1 }], unsimulatedReason: null, secondOrder: [], risks: [], opportunities: [], reversibility: null });
      });
    }
    const drafted: string[] = [];
    // the registered stop condition applies to THIS task too (residual review R7c): checked before any card is written
    const toWrite = cards.filter((card) => !read.result.existing.has(card.key));
    const maxItems = stops.filter((s) => s['kind'] === 'max_items').map((s) => Number(s['value'])).reduce<number | null>((acc, v) => (acc === null ? v : Math.min(acc, v)), null);
    if (maxItems !== null && toWrite.length > maxItems) throw new StopCondition(`stop condition max_items: the draft would write ${toWrite.length} option cards, the agent stops at ${maxItems}`);
    for (const card of toWrite) {
      meter.tick();
      await this.pipeline.write(this.env(p, T, D, 'decision.package.draft', 'DPK', packageId, correlationId), p, this.route(T, D, 'decision.package.draft', 'DPK', packageId), DecisionCapability.option,
        async (cap, scope) => {
          const r = await this.packages.setOption(cap, scope, packageId, version, card, p.principalId, correlationId);
          return { result: r, targetType: 'DPK', targetId: packageId, targetVersion: String(version), outboxEvent: null };
        });
      drafted.push(card.key);
    }
    // The agent's contract ends at the draft. Its attempt to PROPOSE is refused at the PDP and recorded.
    try {
      await this.pipeline.write(this.env(p, T, D, 'decision.package.propose', 'DPK', packageId, correlationId), p, this.route(T, D, 'decision.package.propose', 'DPK', packageId), DecisionCapability.propose,
        async () => ({ result: null, targetType: 'DPK', targetId: packageId, targetVersion: String(version), outboxEvent: null }));
    } catch (e) {
      if (e instanceof HttpException && e.getStatus() === 403) refusals.push({ action: 'decision.package.propose', code: String((e.getResponse() as { code?: string }).code ?? 'EYE-AUT-001'), reason: String((e.getResponse() as { message?: string }).message ?? ''), at: new Date().toISOString() });
      else throw e;
    }
    return { package_id: packageId, version, drafted, marked: 'agent-produced', agent: identity };
  }

  // ───────────────────────── the briefing agent ─────────────────────────
  private async brief(p: AuthenticatedPrincipal, T: string, D: string, roomId: string | null, task: 'briefing' | 'monitor', meter: Meter, stops: Array<Record<string, unknown>>, correlationId: string, identity: Record<string, unknown>) {
    if (roomId === null) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'the briefing task names a room'), 422);
    meter.read('the room');
    const room = await this.pipeline.consequentialRead(this.env(p, T, D, 'room.read', 'DRM', roomId, correlationId), p, this.route(T, D, 'room.read', 'DRM', roomId), ExecutiveCapability.read,
      async (cap) => (await cap.readRooms().selectAll().where('room_id' as never, '=', roomId as never).executeTakeFirst()) as Record<string, unknown> | undefined);
    if (room.result === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no such room'), 404);
    const packageId = String(room.result['package_id']);
    // the room's conditions first (a committed package), then the briefing — the evaluation reads the package's conditions and is metered as a read
    meter.read('the package\'s monitoring conditions');
    let monitoring: Record<string, unknown> | null = null;
    try {
      const m = await this.pipeline.write(this.env(p, T, D, 'decision.monitor', 'DPK', packageId, correlationId), p, this.route(T, D, 'decision.monitor', 'DPK', packageId), DecisionCapability.monitor,
        async (cap) => ({ result: await cap.evaluateConditions({ tenantId: T, domainId: D, packageId, actor: p.principalId, correlationId }), targetType: 'DPK', targetId: packageId, targetVersion: '0', outboxEvent: null }));
      monitoring = m.result;
    } catch (e) {
      // a package that is not committed is not monitored: that is a state, not a fault
      if (!(e instanceof Error && /watched after commitment/.test(e.message))) throw e;
    }
    if (task === 'monitor') return { room_id: roomId, package_id: packageId, monitoring, marked: 'agent-produced', agent: identity };
    meter.tick();
    const briefingId = newId();
    const maxItems = stops.filter((s) => s['kind'] === 'max_items').map((s) => Number(s['value'])).reduce<number | null>((acc, v) => (acc === null ? v : Math.min(acc, v)), null);
    const limits: CompositionLimits = { maxReads: meter.remainingReads(), maxItems, stopOnDegraded: stops.some((s) => s['kind'] === 'on_degraded'), reserve: (what) => meter.read(what), deadline: meter.deadline() };
    const out = await this.pipeline.write(this.env(p, T, D, 'briefing.compose', 'BRF', briefingId, correlationId), p, { ...this.route(T, D, 'briefing.compose', 'BRF', briefingId), writableTargets: [briefingId] }, ExecutiveCapability.briefing,
      async (cap, scope: ScopeContext) => {
        const r = await this.briefings.compose(cap, scope, { roomId, knownAt: new Date().toISOString(), priorBriefingId: undefined, narrative: null, narrativeCites: [] }, p.principalId, 'agent', String(identity['agent_id']), 'briefing', correlationId, briefingId, limits);
        return { result: r, targetType: 'BRF', targetId: briefingId, targetVersion: '1', outboxEvent: null };
      });
    return { room_id: roomId, package_id: packageId, briefing_id: briefingId, content_digest: out.result.contentDigest, items: out.result.items.length, degraded: out.result.degraded, monitoring, marked: 'agent-produced', agent: identity };
  }

  // ───────────────────────── the reporting agent ─────────────────────────
  private async report(p: AuthenticatedPrincipal, T: string, D: string, packageId: string | null, budget: Record<string, unknown>, meter: Meter, correlationId: string, identity: Record<string, unknown>) {
    if (packageId === null) throw new HttpException(errorBody('EYE_REQ_001', correlationId, 'the report task names a package'), 422);
    meter.read('the package and its records');
    // the report is rendered under the purpose the package was admitted for; an agent is no room member — its stored output is read by the members (list)
    const out = await this.pipeline.consequentialRead(this.env(p, T, D, 'report.render', 'DPK', packageId, correlationId, 'decision'), p, this.route(T, D, 'report.render', 'DPK', packageId), DecisionCapability.read,
      async (cap) => renderReport(cap, packageId, String(budget['clearance'] ?? 'internal'), identity, correlationId, { purpose: 'decision', member: null }));
    if (out.result.refused === true) return { package_id: packageId, refused: true, reason: out.result.reason, marked: 'agent-produced', agent: identity };
    return { package_id: packageId, report: out.result, marked: 'agent-produced', agent: identity };
  }
}

/** A report from stored records: attribution, classification and truth states intact; refused when the reader's clearance does not cover the package's classification. */
export async function renderReport(cap: ReturnType<typeof DecisionCapability.read>, packageId: string, clearance: string, renderedBy: Record<string, unknown>, correlationId: string,
                                   authority: { purpose: string | null; member: string | null } = { purpose: null, member: null }): Promise<Record<string, unknown> & { refused?: boolean; reason?: string }> {
  const p = (await cap.readPackages().selectAll().where('package_id' as never, '=', packageId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
  if (p === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized package matches'), 404);
  const classification = String((p['controls'] as Record<string, unknown> | null)?.['classification'] ?? 'internal');
  if ((CLEARANCE_RANK[classification] ?? 3) > (CLEARANCE_RANK[clearance] ?? 0)) {
    return { refused: true, reason: `the package is classified ${classification}; the reader's clearance is ${clearance}; the export is refused` };
  }
  // the export is governed like the detail view (residual review R4c): the admitted purpose, and the room's membership for a human reader
  if (authority.purpose !== null && p['current_version'] !== null && p['current_version'] !== undefined) {
    const dpk = (await cap.readCanonicalObjects().select(['purpose_scope' as never]).where('object_type' as never, '=', 'DPK' as never).where('object_id' as never, '=', packageId as never)
      .orderBy('object_version' as never, 'desc').limit(1).executeTakeFirst()) as { purpose_scope: string | null } | undefined;
    if (dpk?.purpose_scope !== undefined && dpk.purpose_scope !== null && dpk.purpose_scope !== authority.purpose) {
      return { refused: true, reason: `a report is rendered under the purpose the package was admitted for (${dpk.purpose_scope}); this render states ${authority.purpose}` };
    }
  }
  if (authority.member !== null) {
    const room = (await cap.readRooms().select(['room_id' as never]).where('package_id' as never, '=', packageId as never).executeTakeFirst()) as { room_id: string } | undefined;
    if (room !== undefined && !(await cap.isMember({ roomId: room.room_id, principal: authority.member }))) {
      return { refused: true, reason: 'a report of a package with a room is rendered for the room\'s members; the reader is not a member' };
    }
  }
  const version = p['current_version'] === null ? null : Number(p['current_version']);
  const v = version === null ? undefined : (await cap.readVersions().selectAll().where('package_id' as never, '=', packageId as never).where('version' as never, '=', version as never).executeTakeFirst()) as Record<string, unknown> | undefined;
  const options = version === null ? [] : (await cap.readOptions().selectAll().where('package_id' as never, '=', packageId as never).where('version' as never, '=', version as never).orderBy('key' as never).execute()) as Array<Record<string, unknown>>;
  const dissent = (await cap.readDissent().selectAll().where('package_id' as never, '=', packageId as never).execute()) as Array<Record<string, unknown>>;
  const approvals = (await cap.readApprovals().selectAll().where('package_id' as never, '=', packageId as never).execute()) as Array<Record<string, unknown>>;
  const dec = (await cap.readStrategy().selectAll().where('strategy_object_id' as never, '=', String(p['decision_object_id']) as never).executeTakeFirst()) as Record<string, unknown> | undefined;
  return {
    rendered_at: new Date().toISOString(), rendered_by: renderedBy, marked: 'agent-produced',
    package: { package_id: packageId, title: p['title'], statement: p['statement'], state: p['state'], owner: p['owner_principal_id'], synthetic_state: p['synthetic_state'] === true, classification, controls: p['controls'], decision: dec === undefined ? null : { id: dec['strategy_object_id'], title: dec['title'], status: dec['status'] } },
    version: v === undefined ? null : { version, state: v['state'], known_at: v['known_at'], observed_through: v['observed_through'], choice: v['choice'], version_digest: v['version_digest'] },
    options: options.map((o) => ({ key: o['key'], title: o['title'], kind: o['kind'], simulated: o['simulated'], unsimulated_reason: o['unsimulated_reason'], synthetic_state: o['synthetic_state'] === true,
      marks: [...(o['synthetic_state'] === true ? ['SYNTHETIC'] : []), ...(o['simulated'] === true ? ['simulated'] : ['unsimulated'])],
      consequences: (o['consequences'] as Array<Record<string, unknown>>).map((c) => ({ ...c })), uncertainty: o['uncertainty'] })),
    dissent: dissent.map((d) => ({ dissent_id: d['dissent_id'], principal_id: d['principal_id'], position: d['position'], rationale: d['rationale'], recorded_at: d['recorded_at'] })),
    approvals: approvals.map((a) => ({ approval_id: a['approval_id'], approver: a['approver_principal_id'], decision: a['decision'], revoked: a['revoked_at'] !== null, recorded_at: a['recorded_at'] })),
    attribution: 'Real sources stay attributed to their publishers; the company, the runs and the decision are marked synthetic.',
  };
}
