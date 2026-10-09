/**
 * B33 §CI — COMPETITOR INTELLIGENCE: the service behind /v1/tenants/:t/domains/:d/domain-competitors (JRN-10: resolve → collect → compare →
 * assess → review → alert → update → replay; CAP-FW-06; PR-29-001..006). The ports decide (0111_b33_x_competitor.sql); this service composes
 * the reads, admits the CPF object of every profile version a write creates (in the SAME transaction, then binds it), offers the Domain
 * Intelligence Agent's scan through DomainScanBridge, and registers the after-tick hook `domain-competitor-scan` (B25-R: STARTED, never awaited
 * past `scanAwaitMs`; one scan per agent in flight; only when the backlog or a revalidation is pending).
 *
 * Nothing here DECIDES a response: a competitor's move is the executives' decision in the decision layer — the workspace links there and the
 * decision-use record says which package cited which profile version.
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader, type Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import type { ScopeContext } from '../../shared/scope.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { AttentionTickRegistry } from '../../executive/attention/tick.js';
import { AgentsService } from '../../executive/agents/agents.service.js';
import { DomainScanBridge } from '../seams.js';
import { CompetitorCapability, type CompetitorReads, type CompetitorWrites } from './competitor.capabilities.js';
import { dayOf } from './competitor-logic.js';
import { domainScan } from './domain-scan.js';

type Row = Record<string, unknown>;
export const COMPETITOR_HOOK = 'domain-competitor-scan';
/** B25-R: how long the attention tick waits on the scan it started before it returns (the scan goes on and closes its own run). */
export const SCAN_AWAIT_MS = 30_000;
const CPF_SCHEMA = 'CPF@v1';
const PROFILE_DAYS = ['effective_from'] as const;
const EVENT_DAYS = ['effective_date'] as const;
const days = (r: Row, cols: readonly string[]): Row => { const o = { ...r }; for (const c of cols) if (c in o) o[c] = dayOf(o[c]); return o; };
const textOf = (e: unknown): string => (e instanceof HttpException ? String((e.getResponse() as { message?: string }).message ?? e.message) : (e instanceof Error ? e.message : String(e)));

@Injectable()
export class CompetitorService implements OnModuleInit {
  private readonly log = new Logger('domain.competitor');
  private readonly inFlight = new Map<string, { since: string; done: Promise<Row> }>();
  scanAwaitMs = SCAN_AWAIT_MS;
  constructor(private readonly moduleRef: ModuleRef, private readonly pipeline: PipelineService) {}

  /** The Domain Intelligence Agent's scan offered to the executive (the bridge), and the after-tick hook. */
  onModuleInit(): void {
    DomainScanBridge.setScanner((deps, p, a) => domainScan({ ...deps, pipeline: this.pipeline, service: this }, p, a));
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: the domain scan is not scheduled'); return; }
    try { registry.registerAfter({ name: COMPETITOR_HOOK, run: async (a) => this.afterTick(a) }); }
    catch (e) { this.log.warn(`after-tick hook ${COMPETITOR_HOOK}: ${textOf(e)}`); }
  }

  // ───────────────────────── envelopes ─────────────────────────
  envelopeFor(principal: AuthenticatedPrincipal, tenantId: string, domainId: string, action: string, objectType: string, objectId: string | null, correlationId: string): Envelope {
    return {
      message_id: newId(), scope: 'DOMAIN', tenant_id: tenantId, domain_id: domainId, principal_id: `principal:${principal.principalId}`, purpose_id: 'intelligence', action,
      side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', consequence_class: 'C1', object_type: objectType, object_id: objectId,
      schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: correlationId, trace_id: 'domain-competitor',
    } as unknown as Envelope;
  }
  private route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }

  // ───────────────────────── reads ─────────────────────────
  /** The workspace's list: every competitor with its head, its coverage, its package's state per function and its open items. */
  async overview(cap: CompetitorReads, tenantId: string, domainId: string): Promise<Row> {
    const competitors = (await cap.from('domain.competitors').selectAll().orderBy('name' as never).execute()) as Row[];
    const heads = (await cap.from('domain.competitor_profile_versions').selectAll().where('state' as never, '<>', 'superseded' as never).execute()) as Row[];
    const revalidations = (await cap.from('domain.competitor_revalidations').selectAll().where('state' as never, '=', 'open' as never).execute()) as Row[];
    const proposals = (await cap.from('domain.competitor_proposals').select(['proposal_id', 'competitor_id', 'material', 'proposed_via', 'proposed_at'] as never)
      .where('state' as never, '=', 'proposed' as never).execute()) as Row[];
    const packages = [...new Set(competitors.map((c) => String(c['package_key'])))];
    const packageStates: Record<string, Row> = {};
    for (const k of packages) {
      const fns: Row = {};
      for (const fn of ['profile', 'collect', 'assess', 'compare', 'alert', 'twin']) fns[fn] = await cap.packageState(tenantId, domainId, k, fn);
      packageStates[k] = fns;
    }
    const out: Row[] = [];
    for (const c of competitors) {
      const id = String(c['competitor_id']);
      const head = heads.find((h) => String(h['competitor_id']) === id) ?? null;
      const coverage = await cap.coverage(tenantId, domainId, id);
      const open = revalidations.filter((r) => String(r['competitor_id']) === id);
      out.push({ ...c, head: head === null ? null : days(head, PROFILE_DAYS), coverage, open_revalidations: open, open_proposals: proposals.filter((p) => String(p['competitor_id']) === id).length,
                 presented: this.presented(head, coverage, open) });
    }
    const agents = await cap.domainAgents();
    return { competitors: out, packages: packageStates, agents, now: await cap.now() };
  }

  /** What a reader is SHOWN: never current-and-complete when the head is limited, coverage stale or a revalidation open (PR-29-005). */
  private presented(head: Row | null, coverage: Row, open: Row[]): Row {
    const reasons: string[] = [];
    if (head === null) return { state: 'none', reasons: ['no approved profile yet'] };
    if (head['state'] === 'limited') reasons.push(...((head['limited_reasons'] ?? []) as Row[]).map((r) => String(r['reason'] ?? r['class'])));
    if (coverage['state'] !== 'fresh') reasons.push(`coverage ${String(coverage['state'])} (no evidence within ${String(coverage['freshness_days'])} days)`);
    for (const r of open) reasons.push(`revalidation open (${String(r['reason_class'])})`);
    return { state: reasons.length === 0 ? 'current' : 'limited', reasons };
  }

  /** One competitor: every version, event, assessment, proposal, alert, challenge, decision use, twin proposal and its ledger. */
  async competitor(cap: CompetitorReads, tenantId: string, domainId: string, competitorId: string): Promise<Row | null> {
    const c = (await cap.from('domain.competitors').selectAll().where('competitor_id' as never, '=', competitorId as never).executeTakeFirst()) as Row | undefined;
    if (c === undefined) return null;
    const by = (rel: string, order: string, dir: 'asc' | 'desc' = 'desc') => cap.from(rel).selectAll().where('competitor_id' as never, '=', competitorId as never).orderBy(order as never, dir).execute() as Promise<Row[]>;
    const versions = (await by('domain.competitor_profile_versions', 'version')).map((v) => days(v, PROFILE_DAYS));
    const events = (await by('domain.competitor_events', 'effective_date')).map((e) => days(e, EVENT_DAYS));
    const assessments = await by('domain.competitor_assessments', 'approved_at');
    const proposals = await by('domain.competitor_proposals', 'proposed_at');
    const alerts = await by('domain.competitor_alerts', 'raised_at');
    const revalidations = await by('domain.competitor_revalidations', 'opened_at');
    const uses = await by('domain.competitor_decision_uses', 'cited_at');
    const twin = await by('domain.competitor_twin_proposals', 'proposed_at');
    const ledger = await by('domain.competitor_ledger', 'occurred_at');
    const ids = assessments.map((a) => String(a['assessment_id']));
    const challenges = ids.length === 0 ? [] : (await cap.from('domain.competitor_challenges').selectAll().where('assessment_id' as never, 'in', [...new Set(ids)] as never)
      .orderBy('opened_at' as never, 'desc').execute()) as Row[];
    const items = (await cap.from('executive.attention_items').select(['item_id', 'signal_class', 'subject_kind', 'subject_id', 'title', 'state', 'outcome', 'owner_principal_id', 'route_roles', 'policy_version', 'created_at', 'closed_at'] as never)
      .where('signal_class' as never, '=', 'domain.alert' as never).where('subject_kind' as never, '=', 'competitor_profile' as never)
      .where('subject_id' as never, 'in', [competitorId, ...revalidations.map((r) => String(r['revalidation_id']))] as never).orderBy('created_at' as never, 'desc').execute()) as Row[];
    const coverage = await cap.coverage(tenantId, domainId, competitorId);
    const head = versions.find((v) => v['state'] !== 'superseded') ?? null;
    return { competitor: c, head, presented: this.presented(head, coverage, revalidations.filter((r) => r['state'] === 'open')), coverage, versions, events, assessments, proposals,
             alerts, items, revalidations, challenges, decision_uses: uses, twin_proposals: twin, ledger };
  }

  /**
   * AS-OF REPLAY (CI7): what was BELIEVED at `knownAt` (record time — the version recorded latest at or before it, with its state AS IT WAS
   * then: a version superseded later reads as the head it was) and, separately, which facts HELD on `effectiveOn` (effective time — the
   * version believed at knownAt whose effective_from is on or before that day). Both are reads of immutable versions; nothing is recomputed.
   */
  async asOf(cap: CompetitorReads, competitorId: string, knownAt: string | null, effectiveOn: string | null): Promise<Row | null> {
    const c = (await cap.from('domain.competitors').selectAll().where('competitor_id' as never, '=', competitorId as never).executeTakeFirst()) as Row | undefined;
    if (c === undefined) return null;
    const at = knownAt ?? await cap.now();
    const believed = ((await cap.from('domain.competitor_profile_versions').selectAll().where('competitor_id' as never, '=', competitorId as never)
      .where('recorded_at' as never, '<=', at as never).orderBy('version' as never, 'desc').execute()) as Row[]).map((v) => days(v, PROFILE_DAYS));
    const version = believed[0] ?? null;
    const held = effectiveOn === null ? version : (believed.find((v) => String(v['effective_from']) <= effectiveOn) ?? null);
    const atMs = new Date(at).getTime();
    // the state a version had AT knownAt: one superseded only later was the head then (limited when it carried limits, else approved)
    const asOfState = (v: Row | null) => {
      if (v === null) return null;
      const sup = v['superseded_at'] === null || v['superseded_at'] === undefined ? null : new Date(v['superseded_at'] as string).getTime();
      const then = v['state'] === 'superseded' && sup !== null && sup > atMs
        ? (Array.isArray(v['limited_reasons']) && (v['limited_reasons'] as unknown[]).length > 0 ? 'limited' : 'approved') : v['state'];
      return { ...v, state_then: then };
    };
    const events = ((await cap.from('domain.competitor_events').selectAll().where('competitor_id' as never, '=', competitorId as never)
      .where('recorded_at' as never, '<=', at as never).orderBy('effective_date' as never).execute()) as Row[]).map((e) => days(e, EVENT_DAYS))
      .filter((e) => effectiveOn === null || String(e['effective_date']) <= effectiveOn);
    return { competitor: c, known_at: at, effective_on: effectiveOn, believed: asOfState(version), held: asOfState(held), events,
             note: 'replayed from the immutable profile versions recorded at or before known_at; effective time read from their effective_from' };
  }

  async proposal(cap: CompetitorReads, proposalId: string): Promise<Row | null> {
    const p = (await cap.from('domain.competitor_proposals').selectAll().where('proposal_id' as never, '=', proposalId as never).executeTakeFirst()) as Row | undefined;
    return p ?? null;
  }
  async comparisons(cap: CompetitorReads): Promise<Row> {
    const bases = (await cap.from('domain.competitor_comparison_bases').selectAll().orderBy('basis_key' as never).orderBy('version' as never, 'desc').execute()) as Row[];
    const comparisons = (await cap.from('domain.competitor_comparisons').selectAll().orderBy('compared_at' as never, 'desc').limit(100).execute()) as Row[];
    return { bases, comparisons };
  }
  async watchlists(cap: CompetitorReads): Promise<Row[]> {
    return (await cap.from('domain.competitor_watchlists').selectAll().orderBy('created_at' as never, 'desc').execute()) as Row[];
  }

  // ───────────────────────── the CPF of a profile version ─────────────────────────
  /** Admit the CPF canonical object of the version a port just wrote, then bind its digest to the version (one transaction). */
  private async admitCpf(cap: CompetitorWrites, scope: ScopeContext, principal: AuthenticatedPrincipal, cpf: Row, ownerId: string, correlationId: string, method: string): Promise<Row> {
    const version = Number(cpf['version']);
    const competitorId = String(cpf['competitor_id']);
    const facts = (cpf['facts'] ?? []) as Row[];
    const evidence = [...new Set(facts.flatMap((f) => ((f['citations'] ?? []) as Row[]).filter((x) => x['kind'] === 'evidence').map((x) => `EVD:${String(x['id'])}`)))];
    const header: CanonicalHeader = {
      object_id: competitorId, object_type: 'CPF', tenant_id: scope.tenantId, domain_id: scope.domainId, scope: 'DOMAIN', object_version: String(version), lifecycle_state: 'active',
      owning_component: 'CP-DOM-CI', accountable_owner: `principal:${ownerId}`, source_object_ids: [],
      event_time: null, observation_time: null, valid_from: `${String(cpf['effective_from'])}T00:00:00Z`, valid_to: null, recorded_at: new Date().toISOString(), time_precision: 'day',
      source_clock_quality: 'trusted', truth_state: 'assessed', synthetic_state: false, confidence: null, uncertainty: null,
      evidence_refs: evidence, provenance_ref: `principal:${principal.principalId}`, method_ref: method,
      contradiction_refs: [], corroboration_refs: [], human_refs: [...new Set([`principal:${ownerId}`, `principal:${principal.principalId}`])],
      classification: 'internal', purpose_scope: 'intelligence', rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
      quality_profile: null, quality_state: { state: cpf['state'], limited_reasons: cpf['limited_reasons'] }, freshness_state: null, schema_ref: CPF_SCHEMA, ontology_ref: null,
      correction_of: null, supersedes: cpf['supersedes'] === null || cpf['supersedes'] === undefined ? null : `CPF:${competitorId}@${String(cpf['supersedes'])}`,
      withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    } as CanonicalHeader;
    const check = validateHeader(header);
    if (!check.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `competitor profile header invalid: ${(check.errors ?? []).join('; ')}`), 422);
    const admitted = await cap.admitObject(header, cpf, canonicalHeaderDigest(header, cpf));
    await cap.bindProfileObject({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, correlationId, competitorId, version, digest: admitted.contentDigest });
    return { object_type: 'CPF', object_id: competitorId, object_version: version, content_digest: admitted.contentDigest, schema_ref: CPF_SCHEMA };
  }

  // ───────────────────────── writes ─────────────────────────
  /** THE MATERIAL ASSESSMENT APPROVAL (or the decline): the port decides; an approval's new profile version is admitted as CPF in the same transaction. */
  async decide(cap: CompetitorWrites, scope: ScopeContext, principal: AuthenticatedPrincipal, proposalId: string, competitorId: string, decision: 'approved' | 'declined', digest: string, reason: string | null,
               correlationId: string): Promise<Row> {
    const p = (await cap.from('domain.competitor_proposals').select(['competitor_id'] as never).where('proposal_id' as never, '=', proposalId as never).executeTakeFirst()) as Row | undefined;
    if (p !== undefined && String(p['competitor_id']) !== competitorId) {
      throw new HttpException(errorBody('EYE_REQ_001', correlationId, `competitor assessment rejected (request): proposal ${proposalId} is of competitor ${String(p['competitor_id'])}, not ${competitorId}`), 422);
    }
    const r = await cap.decide({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, correlationId, proposalId, decision, digest, reason });
    if (r['state'] !== 'approved') return r;
    const owner = (await cap.from('domain.competitors').select(['owner_principal_id'] as never).where('competitor_id' as never, '=', String(r['competitor_id']) as never).executeTakeFirst()) as Row;
    const cpf = await this.admitCpf(cap, scope, principal, r['cpf'] as Row, String(owner['owner_principal_id']), correlationId, 'domain.competitor.assessment.approve/1');
    return { ...r, cpf: undefined, object: cpf };
  }

  /** REVALIDATE one competitor (the analyst's route, or the agent's scan): a limited version found → its CPF admitted in the same transaction. */
  async revalidate(envelope: Envelope, principal: AuthenticatedPrincipal, tenantId: string, domainId: string, competitorId: string, correlationId: string): Promise<Row> {
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'domain.competitor.revalidate', 'DCI', competitorId), CompetitorCapability.write,
      async (cap, scope) => {
        const r = await cap.revalidate({ tenantId: scope.tenantId as string, domainId: scope.domainId as string, actor: principal.principalId, correlationId, competitorId });
        let object: Row | null = null;
        if (r['version'] !== null && r['version'] !== undefined) {
          const owner = (await cap.from('domain.competitors').select(['owner_principal_id'] as never).where('competitor_id' as never, '=', competitorId as never).executeTakeFirst()) as Row;
          object = await this.admitCpf(cap, scope, principal, r['cpf'] as Row, String(owner['owner_principal_id']), correlationId, 'domain.competitor.revalidate/1');
        }
        return { result: { ...r, cpf: undefined, object }, targetType: 'DCI', targetId: competitorId, targetVersion: r['version'] === null ? null : String(r['version']), outboxEvent: null };
      });
    return { ...out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  // ───────────────────────── the after-tick hook (B25-R) ─────────────────────────
  /**
   * THE HOOK: when the domain has an active Domain Intelligence Agent AND something is pending (claims on watched competitors after their scan
   * marks, or a revalidation the read finds), the agent's scan is STARTED — never awaited past `scanAwaitMs`; one scan per agent in flight
   * (a second tick says so and the backlog waits). The pending read runs under the attention agent's session (domain.competitor.read).
   */
  async afterTick(a: { principal: AuthenticatedPrincipal; tenantId: string; domainId: string; correlationId: string }): Promise<Row> {
    const read = await this.pipeline.consequentialRead(this.envelopeFor(a.principal, a.tenantId, a.domainId, 'domain.competitor.read', 'DCI', null, a.correlationId), a.principal,
      this.route(a.tenantId, a.domainId, 'domain.competitor.read', 'DCI', null), CompetitorCapability.read, async (cap) => ({
        agents: await cap.domainAgents(), backlog: (await cap.backlog(a.tenantId, a.domainId, 1)).length, needs: (await cap.needsRevalidation(a.tenantId, a.domainId)).length,
      }));
    const { agents, backlog, needs } = read.result;
    if (agents.length === 0) return { scan: null, reason: 'no active Domain Intelligence Agent in this domain' };
    if (backlog === 0 && needs === 0) return { scan: null, reason: 'nothing pending: no new claims on watched competitors, nothing to revalidate' };
    const agentId = String(agents[0]!['agent_id']);
    const live = this.inFlight.get(agentId);
    if (live !== undefined) return { scan: { skipped: `a domain scan of agent ${agentId} is in flight since ${live.since}; the backlog waits for it`, agent_id: agentId, in_flight_since: live.since } };
    let agents_: AgentsService;
    try { agents_ = this.moduleRef.get(AgentsService, { strict: false }); } catch { return { scan: { skipped: 'no agent runtime in this application' } }; }
    const since = new Date().toISOString();
    const done: Promise<Row> = agents_.run({ agentId, tenantId: a.tenantId, domainId: a.domainId, task: 'domain_scan', trigger: { kind: 'scheduler', principalId: a.principal.principalId, ref: COMPETITOR_HOOK },
                                             roomId: null, packageId: null, version: null, correlationId: a.correlationId })
      .then((r): Row => ({ run_id: r.runId, agent_id: r.agentId, outcome: r.outcome, stop_reason: r.stopReason }), (err: unknown): Row => ({ error: textOf(err).slice(0, 500) }))
      .finally(() => { this.inFlight.delete(agentId); });
    this.inFlight.set(agentId, { since, done });
    let timer: NodeJS.Timeout | undefined;
    const first = await Promise.race([done, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), this.scanAwaitMs); })]);
    clearTimeout(timer);
    if (first !== null) return { pending: { backlog, needs }, scan: first };
    void done.then((r) => { this.log.log(`domain scan of agent ${agentId} (started ${since}) ended after the tick: ${JSON.stringify(r).slice(0, 300)}`); });
    return { pending: { backlog, needs }, scan: { in_flight: true, agent_id: agentId, since, note: `the scan goes on after the tick (waited ${this.scanAwaitMs} ms); its run closes itself` } };
  }

  /** The scan in flight for an agent (the harness awaits it to prove the bound). */
  inFlightOf(agentId: string): Promise<Row> | null { return this.inFlight.get(agentId)?.done ?? null; }
}
