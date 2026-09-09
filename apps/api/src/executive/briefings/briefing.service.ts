/**
 * EXECUTIVE BRIEFINGS — Phase 6 (L9), stage P6-M4.
 *
 * A briefing is composed DETERMINISTICALLY from stored records, for a room or a
 * domain, under the reader's known_at, since a BOUND prior briefing (or none):
 *   what changed      — evidence and claims admitted, runs completed, branches
 *                       flipped, warnings raised or acknowledged, packages moved,
 *                       dissent recorded — each with its truth state, its freshness
 *                       and the state of its source (live / replayed / degraded /
 *                       blocked / operator-upload / internal)
 *   why it matters    — what rests on what changed, through graph.dependencies
 *   who owns it       — the owners on warnings, runs, packages and the room
 *   which window is closing — warning response windows, the room's next review,
 *                       approval expiries, the decision deadline, ordered by time left
 * The content digest is over the watermark, the items, the windows, the source
 * states and the source records — so recomposition under the same watermark and
 * known_at yields the same digest. A narrative is optional, labelled, cites only
 * included items, and is stored beside the content (not inside the digest). No
 * model is called here: the Model Gateway may add a narrative through this same
 * contract, and can neither add, rank nor remove an item.
 *
 * Review of PR #46 (items 3, 4, 5): every mutable state the briefing reads — a
 * warning's state, the room's next review, the approvals that stand, a source's
 * health — is read AS OF known_at from the record's own events, so a later
 * acknowledgement, verdict or review does not rewrite an earlier digest; the interval
 * a briefing covers is (prior.known_at, known_at]; the controls fold every contributing
 * source (evidence, claims, runs, warnings, branches, packages); retrieval is under the
 * reader's authority NOW — membership, the purpose the snapshot was admitted for, a
 * clearance that covers its classification — with availability now reported apart.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, contentDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { foldControls, type Controls, type ControlInput } from '../../prediction/controls.js';
import { assertClearance, assertPurpose, clearanceOf, covers, denyRead } from '../../decision/clearance.js';
import type { BriefingWrites, ExecutiveReads } from '../executive.capabilities.js';

const iso = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const isoOrNull = (v: unknown): string | null => (v === null || v === undefined ? null : iso(v));
type SourceState = 'live' | 'replayed' | 'degraded' | 'blocked' | 'operator-upload' | 'internal';

export interface BriefingItem {
  item_id: string; kind: string; id: string; version: number | null; title: string; at: string; truth_state: string; synthetic_state: boolean;
  freshness: { recorded_at: string; age_hours: number }; source_state: SourceState; source: Record<string, unknown> | null;
  owner: string | null; matters: Array<{ dependent_object_id: string; dependent_type: string; rationale: string }>; details: Record<string, unknown>;
}
export interface BriefingWindow { kind: string; id: string; title: string; closes_at: string; time_left_seconds: number; overdue: boolean; owner: string | null }

/** A budget hit: the composition is abandoned before anything is admitted; the caller records the stop and escalates. */
export class BudgetExceeded extends Error { constructor(message: string) { super(message); } }
/** A registered stop condition met: the composition is abandoned before anything is admitted; the caller records the stop and escalates. */
export class StopCondition extends Error { constructor(message: string) { super(message); } }

/**
 * What bounds an agent's composition: `reserve` is called BEFORE every unit of read work (it throws BudgetExceeded
 * when the run's allowance is spent); `deadline` (epoch ms) is checked before every unit and before admission; the
 * stop conditions are evaluated before admission. `maxReads` remains the coarse pre-0049 bound for callers without a meter.
 */
export interface CompositionLimits { maxReads: number | null; maxItems: number | null; stopOnDegraded: boolean; reserve?: (what: string) => void; deadline?: number }

const hoursBetween = (a: string, b: string): number => Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 3_600_000) * 100) / 100;
const WARNING_STATE_OF: Readonly<Record<string, string>> = Object.freeze({ 'warning.raised': 'raised', 'warning.acknowledged': 'acknowledged', 'warning.expired': 'expired', 'warning.closed': 'closed' });

@Injectable()
export class BriefingService {
  /**
   * The state of every source of the domain AS OF known_at, from stored records alone (the shape of the readiness
   * register): the contract versions active at known_at — and, for a windowed briefing, those active at the prior
   * cut-off that have since been suspended, superseded or retired, so a withdrawal INSIDE the interval is represented
   * there — with the reuse rights each had THEN, reconstructed from the recorded rights events (the registration and
   * every rights update), never from the current projection (residual review R5c). Where the record cannot establish
   * the rights at known_at, the state is `unknown` and the source is blocked.
   */
  private async sourceStates(cap: ExecutiveReads, knownAt: string, since: string | null, reserve: (what: string) => void): Promise<Array<{ source_id: string; contract_version: number; source_key: string; name: string; acquisition_mode: string; data_origin: string; state: SourceState; reason: string; rights_state: string }>> {
    reserve('the source contract history');
    const events = (await cap.readSourceContractEvents().select(['source_id', 'contract_version', 'event', 'occurred_at', 'details'] as never).where('occurred_at' as never, '<=', knownAt as never).orderBy('occurred_at' as never).orderBy('event_id' as never).execute()) as Array<{ source_id: string; contract_version: number; event: string; occurred_at: unknown; details: Record<string, unknown> | null }>;
    const activeAt = (t: string): Map<string, { event: string; at: string }> => {
      const active = new Map<string, { event: string; at: string }>();
      for (const e of events) {
        const at = iso(e.occurred_at);
        if (at > t) break;
        const key = `${e.source_id}@${e.contract_version}`;
        if (e.event === 'contract.activated' || e.event === 'contract.reactivated') active.set(key, { event: e.event, at });
        else if (e.event === 'contract.superseded' || e.event === 'contract.retired' || e.event === 'contract.suspended' || e.event === 'contract.rejected') active.delete(key);
      }
      return active;
    };
    const activeNow = activeAt(knownAt);
    const activeThen = since === null ? new Map<string, { event: string; at: string }>() : activeAt(since);
    // the rights each version had at known_at: the latest recorded rights state by then (registration or rights update)
    const rightsAt = new Map<string, { state: string; at: string }>();
    const closedAt = new Map<string, { event: string; at: string }>();
    for (const e of events) {
      const key = `${e.source_id}@${e.contract_version}`;
      const rs = e.details?.['rights_state'];
      if (typeof rs === 'string' && (e.event === 'contract.registered' || e.details?.['kind'] === 'rights_update')) rightsAt.set(key, { state: rs, at: iso(e.occurred_at) });
      if (e.event === 'contract.superseded' || e.event === 'contract.retired' || e.event === 'contract.suspended' || e.event === 'contract.rejected') closedAt.set(key, { event: e.event, at: iso(e.occurred_at) });
    }
    const all = (await cap.readSourceContracts().selectAll().orderBy('source_key' as never).execute()) as Array<Record<string, unknown>>;
    const contracts = all.filter((c) => activeNow.has(`${String(c['source_id'])}@${Number(c['contract_version'])}`) || activeThen.has(`${String(c['source_id'])}@${Number(c['contract_version'])}`));
    const out: Array<{ source_id: string; contract_version: number; source_key: string; name: string; acquisition_mode: string; data_origin: string; state: SourceState; reason: string; rights_state: string }> = [];
    reserve('the source health verdicts and attempts');
    for (const c of contracts) {
      const sourceId = String(c['source_id']);
      const key = `${sourceId}@${Number(c['contract_version'])}`;
      const contract = c['contract'] as Record<string, unknown>;
      const so = (contract['security_and_operations'] ?? {}) as Record<string, unknown>;
      const credentialRef = typeof so['credential_ref'] === 'string' ? so['credential_ref'] : null;
      const mode = String(c['acquisition_mode']);
      const rights = rightsAt.get(key)?.state ?? 'unknown';
      const health = (await cap.readHealthEvents().select(['new_state' as never]).where('source_id' as never, '=', sourceId as never).where('evaluated_at' as never, '<=', knownAt as never)
        .orderBy('evaluated_at' as never, 'desc').limit(1).executeTakeFirst()) as { new_state: string } | undefined;
      // an attempt's outcome is known when it FINISHES (residual review R5b): one still running at known_at is no verdict then
      const lastAttempt = (await cap.readScheduledAttempts().select(['outcome' as never]).where('source_id' as never, '=', sourceId as never).where('finished_at' as never, '<=', knownAt as never)
        .orderBy('finished_at' as never, 'desc').limit(1).executeTakeFirst()) as { outcome: string } | undefined;
      let state: SourceState; let reason: string;
      const closed = activeNow.has(key) ? undefined : closedAt.get(key);
      if (closed !== undefined) {
        state = 'blocked';
        reason = rights === 'withdrawn' ? `reuse rights were withdrawn at ${rightsAt.get(key)?.at ?? closed.at} (the contract was ${closed.event.replace('contract.', '')} then)` : `the contract was ${closed.event.replace('contract.', '')} at ${closed.at}`;
      }
      else if (c['connector_kind'] === 'upload') { state = 'operator-upload'; reason = 'records the operator uploaded'; }
      else if (credentialRef !== null) { state = 'blocked'; reason = `the contract names credential ${credentialRef}, which this deployment does not bind`; }
      else if (rights === 'unknown') { state = 'blocked'; reason = 'the reuse rights at known_at cannot be established from the recorded rights events'; }
      else if (rights !== 'confirmed') { state = 'blocked'; reason = `reuse rights were ${rights} as of known_at (recorded at ${rightsAt.get(key)?.at ?? 'an unknown time'})`; }
      else if (health !== undefined && ['degraded', 'failed', 'suspended'].includes(health.new_state)) { state = 'degraded'; reason = `the latest health verdict recorded by known_at is ${health.new_state}`; }
      else if (lastAttempt !== undefined && ['failed', 'faulted', 'budget_exceeded'].includes(lastAttempt.outcome)) { state = 'degraded'; reason = `the latest scheduled attempt by known_at ${lastAttempt.outcome}`; }
      else if (mode === 'live') { state = 'live'; reason = 'live collection under the source\'s cadence'; }
      else { state = 'replayed'; reason = 'replayed from the recorded bytes; not a live observation'; }
      out.push({ source_id: sourceId, contract_version: Number(c['contract_version']), source_key: String(c['source_key']), name: String(c['name']), acquisition_mode: mode, data_origin: String(c['data_origin']), state, reason, rights_state: rights });
    }
    return out.sort((a, b) => (a.source_key < b.source_key ? -1 : a.source_key > b.source_key ? 1 : a.contract_version - b.contract_version));
  }

  /** The controls a canonical record carries, as a fold input (fail-closed when the record is not readable). */
  private async controlsOfObject(cap: ExecutiveReads, objectType: string, id: string, version: number | null): Promise<ControlInput> {
    let q = cap.readCanonicalObjects().select(['synthetic_state', 'classification', 'rights_profile', 'residency_profile', 'retention_profile', 'access_policy_ref'] as never)
      .where('object_type' as never, '=', objectType as never).where('object_id' as never, '=', id as never).orderBy('object_version' as never, 'desc').limit(1);
    if (version !== null) q = q.where('object_version' as never, '=', version as never);
    const row = (await q.executeTakeFirst()) as ControlInput | undefined;
    return row ?? { synthetic_state: true, classification: 'restricted' };
  }

  async compose(cap: BriefingWrites, ctx: ScopeContext, a: { roomId: string | null; knownAt: string; priorBriefingId: string | null | undefined; narrative: string | null; narrativeCites: string[] },
                composer: string, via: 'human' | 'agent', agentId: string | null, purposeId: string, correlationId: string, briefingId: string = newId(), limits: CompositionLimits | number | null = null,
                /** The composer's clearance in the target context, for a HUMAN composer: the response is a read of the fold, refused before admission when it is not covered (residual review R4a). */
                composerClearance: string | null = null) {
    const lim: CompositionLimits = typeof limits === 'number' ? { maxReads: limits, maxItems: null, stopOnDegraded: false } : (limits ?? { maxReads: null, maxItems: null, stopOnDegraded: false });
    // every unit of read work is reserved BEFORE it happens; the deadline is checked with it and again before admission (residual review R7)
    const reserve = (what: string): void => {
      if (lim.deadline !== undefined && Date.now() >= lim.deadline) throw new BudgetExceeded(`the elapsed budget ran out before ${what}; the composition stops before further work`);
      if (lim.reserve !== undefined) lim.reserve(what);
    };
    const tenantId = ctx.tenantId as string; const domainId = ctx.domainId as string;
    const knownAt = new Date(a.knownAt).toISOString();
    let room: Record<string, unknown> | null = null; let pkg: Record<string, unknown> | null = null;
    if (a.roomId !== null) {
      reserve('the room and its package');
      room = (await cap.readRooms().selectAll().where('room_id' as never, '=', a.roomId as never).executeTakeFirst()) as Record<string, unknown> | undefined ?? null;
      if (room === null) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized room matches'), 404);
      if (via === 'human' && !(await cap.isMember({ roomId: a.roomId, principal: composer }))) throw new HttpException(errorBody('EYE_AUT_001', correlationId, 'a room briefing is composed by a member of the room'), 403);
      pkg = (await cap.readPackages().selectAll().where('package_id' as never, '=', String(room['package_id']) as never).executeTakeFirst()) as Record<string, unknown> | undefined ?? null;
    }
    // The prior: bound by id. `undefined` = the room's (or domain's) latest; `null` = none.
    let prior: Record<string, unknown> | null = null;
    reserve('the prior briefing');
    if (a.priorBriefingId === undefined) {
      let q = cap.readBriefings().selectAll().orderBy('composed_at' as never, 'desc').limit(1);
      q = a.roomId === null ? q.where('room_id' as never, 'is', null) : q.where('room_id' as never, '=', a.roomId as never);
      prior = (await q.executeTakeFirst()) as Record<string, unknown> | undefined ?? null;
    } else if (a.priorBriefingId !== null) {
      prior = (await cap.readBriefings().selectAll().where('briefing_id' as never, '=', a.priorBriefingId as never).executeTakeFirst()) as Record<string, unknown> | undefined ?? null;
      if (prior === null) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'the prior briefing does not exist in this domain'), 404);
    }
    // The interval: (prior.known_at, known_at] — what the prior KNEW, not when it was composed.
    const since = prior === null ? null : iso(prior['known_at']);
    const inWindow = (t: unknown): boolean => { const x = iso(t); return (since === null || x > since) && x <= knownAt; };
    const sourceStates = await this.sourceStates(cap, knownAt, since, reserve);
    const stateOfSource = (sourceId: string): SourceState => sourceStates.find((s) => s.source_id === sourceId)?.state ?? 'internal';
    const items: BriefingItem[] = [];
    const sources = new Set<string>();
    const controlInputs: ControlInput[] = [];
    const push = (i: Omit<BriefingItem, 'item_id' | 'freshness' | 'matters'> & { matters?: BriefingItem['matters'] }) => {
      items.push({ ...i, item_id: `${i.kind}:${i.id}${i.version === null ? '' : `@${i.version}`}`, freshness: { recorded_at: i.at, age_hours: hoursBetween(i.at, knownAt) }, matters: i.matters ?? [] });
      sources.add(`${i.kind}:${i.id}${i.version === null ? '' : `@${i.version}`}`);
    };
    // what changed: evidence and claims admitted
    reserve('the evidence and claims admitted');
    const objs = (await cap.readCanonicalObjects().selectAll().where('object_type' as never, 'in', ['EVD', 'CLM'] as never).where('recorded_at' as never, '<=', knownAt as never)
      .$if(since !== null, (q: { where: (...x: unknown[]) => unknown }) => q.where('recorded_at' as never, '>', since as never)).orderBy('recorded_at' as never).limit(500).execute()) as Array<Record<string, unknown>>;
    for (const o of objs) {
      const prov = String(o['provenance_ref'] ?? '');
      const m = /^SRC:([0-9a-f-]{36})@(\d+)$/i.exec(prov);
      const sourceId = m?.[1] ?? null;
      controlInputs.push({ synthetic_state: o['synthetic_state'], classification: o['classification'], rights_profile: o['rights_profile'], residency_profile: o['residency_profile'], retention_profile: o['retention_profile'], access_policy_ref: o['access_policy_ref'] });
      push({ kind: o['object_type'] === 'EVD' ? 'evidence' : 'claim', id: String(o['object_id']), version: Number(o['object_version']), title: prov || String(o['object_type']), at: iso(o['recorded_at']),
             truth_state: String(o['truth_state']), synthetic_state: o['synthetic_state'] === true, source_state: sourceId === null ? 'internal' : stateOfSource(sourceId),
             source: sourceId === null ? null : { source_id: sourceId, contract_version: Number(m?.[2]) }, owner: null,
             details: { lifecycle_state: o['lifecycle_state'], classification: o['classification'], correction_of: o['correction_of'] } });
    }
    // runs completed — the SIM record carries the controls the run inherited from its twin version
    reserve('the runs completed');
    const runs = (await cap.readRuns().selectAll().where('state' as never, '=', 'completed' as never).where('completed_at' as never, '<=', knownAt as never)
      .$if(since !== null, (q: { where: (...x: unknown[]) => unknown }) => q.where('completed_at' as never, '>', since as never)).orderBy('completed_at' as never).limit(200).execute()) as Array<Record<string, unknown>>;
    for (const r of runs) {
      controlInputs.push(await this.controlsOfObject(cap, 'SIM', String(r['run_id']), 1));
      push({ kind: 'run', id: String(r['run_id']), version: 1, title: `${String(r['run_kind'])} run on twin ${String(r['twin_id'])}@${String(r['twin_version'])}`, at: iso(r['completed_at']), truth_state: 'synthetic', synthetic_state: true,
             source_state: 'internal', source: null, owner: String(r['operator_principal_id']), details: { run_kind: r['run_kind'], control_run_id: r['control_run_id'], outputs_digest: r['outputs_digest'], outside_envelope: r['outside_envelope'] } });
    }
    // branches flipped or closed — the scenario's forecast carries the controls the branch rests on
    reserve('the branch flips');
    const flips = (await cap.readScenarioEvents().selectAll().where('event' as never, 'in', ['branch.flipped', 'branch.closed'] as never).where('occurred_at' as never, '<=', knownAt as never)
      .$if(since !== null, (q: { where: (...x: unknown[]) => unknown }) => q.where('occurred_at' as never, '>', since as never)).orderBy('occurred_at' as never).limit(200).execute()) as Array<Record<string, unknown>>;
    for (const e of flips) {
      const b = (await cap.readBranches().selectAll().where('branch_id' as never, '=', String(e['branch_id']) as never).executeTakeFirst()) as Record<string, unknown> | undefined;
      const scn = b === undefined ? undefined : (await cap.readScenarios().select(['forecast_id' as never]).where('scenario_id' as never, '=', String(b['scenario_id']) as never).executeTakeFirst()) as { forecast_id: string | null } | undefined;
      const fc = scn?.forecast_id === null || scn?.forecast_id === undefined ? { synthetic_state: true, classification: 'restricted' } : await this.controlsOfObject(cap, 'FCT', String(scn.forecast_id), null);
      controlInputs.push(fc);
      push({ kind: 'branch', id: String(e['branch_id']), version: null, title: `${String(e['event'])}: ${String(b?.['name'] ?? '')}`, at: iso(e['occurred_at']), truth_state: 'inferred', synthetic_state: fc.synthetic_state !== false,
             source_state: 'internal', source: null, owner: b === undefined ? null : String(b['owner_principal_id']), details: { event: e['event'], scenario_id: e['scenario_id'], details: e['details'] } });
    }
    // warnings raised or acknowledged — each with the state it had AS OF known_at, from its own events; the WRN record carries its controls
    reserve('the warnings and their events');
    const warnings = (await cap.readWarnings().selectAll().where('raised_at' as never, '<=', knownAt as never).orderBy('raised_at' as never).limit(500).execute()) as Array<Record<string, unknown>>;
    const stateAsOf = new Map<string, string>();
    if (warnings.length > 0) {
      const events = (await cap.readWarningEvents().select(['warning_id', 'event', 'occurred_at'] as never).where('warning_id' as never, 'in', warnings.map((w) => String(w['warning_id'])) as never)
        .where('occurred_at' as never, '<=', knownAt as never).orderBy('occurred_at' as never).execute()) as Array<{ warning_id: string; event: string; occurred_at: unknown }>;
      for (const e of events) stateAsOf.set(String(e.warning_id), WARNING_STATE_OF[e.event] ?? 'closed');
    }
    const warningState = (w: Record<string, unknown>): string => stateAsOf.get(String(w['warning_id'])) ?? 'raised';
    for (const w of warnings) {
      const raisedIn = inWindow(w['raised_at']);
      const ackIn = w['acknowledged_at'] !== null && w['acknowledged_at'] !== undefined && inWindow(w['acknowledged_at']);
      if (raisedIn || ackIn) controlInputs.push(await this.controlsOfObject(cap, 'WRN', String(w['warning_id']), null));
      const wc = raisedIn || ackIn ? controlInputs[controlInputs.length - 1] as ControlInput : null;
      if (raisedIn) push({ kind: 'warning', id: String(w['warning_id']), version: null, title: `raised: ${String(w['title'])}`, at: iso(w['raised_at']), truth_state: 'inferred', synthetic_state: wc?.synthetic_state !== false,
        source_state: 'internal', source: null, owner: String(w['routed_to']), details: { state: warningState(w), consequence: w['consequence'], response_window_closes_at: isoOrNull(w['response_window_closes_at']) } });
      if (ackIn) push({ kind: 'warning-acknowledged', id: String(w['warning_id']), version: null, title: `acknowledged: ${String(w['title'])}`, at: iso(w['acknowledged_at']), truth_state: 'asserted', synthetic_state: wc?.synthetic_state !== false,
        source_state: 'internal', source: null, owner: String(w['acknowledged_by']), details: { acknowledgement: w['acknowledgement'] } });
    }
    // packages moved (the room's, or every package in the domain) — dissent is a package event too, and is shown; the package's fold is inherited
    reserve('the package events');
    let pe = cap.readPackageEvents().selectAll().where('event' as never, 'not in', ['replay.recorded'] as never).where('occurred_at' as never, '<=', knownAt as never).orderBy('occurred_at' as never).limit(500);
    if (since !== null) pe = pe.where('occurred_at' as never, '>', since as never);
    if (pkg !== null) pe = pe.where('package_id' as never, '=', String(pkg['package_id']) as never);
    const pevents = (await pe.execute()) as Array<Record<string, unknown>>;
    const pkgCache = new Map<string, Record<string, unknown> | undefined>();
    for (const e of pevents) {
      const pid = String(e['package_id']);
      if (!pkgCache.has(pid)) pkgCache.set(pid, (await cap.readPackages().selectAll().where('package_id' as never, '=', pid as never).executeTakeFirst()) as Record<string, unknown> | undefined);
      const p = pkgCache.get(pid);
      const pc = (p?.['controls'] ?? {}) as ControlInput;
      controlInputs.push({ ...pc, synthetic_state: p?.['synthetic_state'] === true || pc.synthetic_state === true, classification: typeof pc.classification === 'string' ? pc.classification : 'internal' });
      push({ kind: e['event'] === 'dissent.recorded' ? 'dissent' : 'package', id: String(e['event_id']), version: null, title: `${String(e['event'])}: ${String(p?.['title'] ?? e['package_id'])}`, at: iso(e['occurred_at']), truth_state: 'asserted',
             synthetic_state: p?.['synthetic_state'] === true, source_state: 'internal', source: null, owner: p === undefined ? null : String(p['owner_principal_id']),
             details: { package_id: e['package_id'], event: e['event'], actor: e['actor_principal_id'], version: (e['details'] as Record<string, unknown>)?.['version'] ?? null } });
    }
    // why it matters: what rests on what changed
    const changedIds = [...new Set(items.filter((i) => ['evidence', 'claim', 'run'].includes(i.kind)).map((i) => i.id))];
    if (changedIds.length > 0) {
      reserve('what rests on what changed');
      const deps = (await cap.readDependencies().selectAll().where('depends_on_id' as never, 'in', changedIds as never).where('state' as never, '=', 'active' as never).where('created_at' as never, '<=', knownAt as never).execute()) as Array<Record<string, unknown>>;
      for (const i of items) {
        i.matters = deps.filter((d) => String(d['depends_on_id']) === i.id).map((d) => ({ dependent_object_id: String(d['dependent_object_id']), dependent_type: String(d['dependent_type']), rationale: String(d['rationale']) }))
          .sort((x, y) => (x.dependent_object_id < y.dependent_object_id ? -1 : 1));
      }
    }
    if (pkg !== null) {
      const dec = (await cap.readStrategy().selectAll().where('strategy_object_id' as never, '=', String(pkg['decision_object_id']) as never).executeTakeFirst()) as Record<string, unknown> | undefined;
      for (const i of items) if (i.kind === 'package' || i.kind === 'dissent') i.matters = dec === undefined ? [] : [{ dependent_object_id: String(dec['strategy_object_id']), dependent_type: 'DEC', rationale: `the package decides ${String(dec['title'])}` }];
    }
    items.sort((x, y) => (x.at < y.at ? -1 : x.at > y.at ? 1 : x.item_id < y.item_id ? -1 : 1));
    // which window is closing — every window as it stood AT known_at
    const windows: BriefingWindow[] = [];
    const secondsLeft = (closesAt: string): number => Math.round((new Date(closesAt).getTime() - new Date(knownAt).getTime()) / 1000);
    for (const w of warnings) {
      if (warningState(w) === 'raised' && w['response_window_closes_at'] !== null) {
        const c = iso(w['response_window_closes_at']);
        windows.push({ kind: 'warning-response', id: String(w['warning_id']), title: String(w['title']), closes_at: c, time_left_seconds: secondsLeft(c), overdue: c < knownAt, owner: String(w['routed_to']) });
        // a warning shown for its open window is a contributor whatever its age (residual review R3a): its controls enter the fold and it is a cited source
        if (!sources.has(`warning:${String(w['warning_id'])}`)) {
          sources.add(`warning:${String(w['warning_id'])}`);
          controlInputs.push(await this.controlsOfObject(cap, 'WRN', String(w['warning_id']), null));
        }
      }
    }
    if (room !== null) {
      // the room's next review as of known_at: the last cadence or review recorded by then
      reserve('the room events');
      const last = (await cap.readRoomEvents().select(['details' as never]).where('room_id' as never, '=', String(room['room_id']) as never)
        .where('event' as never, 'in', ['room.opened', 'cadence.set', 'review.recorded'] as never).where('occurred_at' as never, '<=', knownAt as never)
        .orderBy('occurred_at' as never, 'desc').limit(1).executeTakeFirst()) as { details: Record<string, unknown> } | undefined;
      const next = last?.details['next_review_at'];
      const c = iso(typeof next === 'string' ? next : room['next_review_at']);
      windows.push({ kind: 'review', id: String(room['room_id']), title: `next review of ${String(room['title'])}`, closes_at: c, time_left_seconds: secondsLeft(c), overdue: c < knownAt, owner: String(room['owner_principal_id']) });
    }
    let versionAsOf: number | null = null;
    if (pkg !== null) {
      // the version open to approval as of known_at: the latest proposed by then, unless committed, rejected or superseded by then
      reserve('the package version and its approvals');
      const versions = (await cap.readVersions().selectAll().where('package_id' as never, '=', String(pkg['package_id']) as never).where('proposed_at' as never, '<=', knownAt as never)
        .orderBy('version' as never, 'desc').execute()) as Array<Record<string, unknown>>;
      const v = versions[0];
      if (v !== undefined) {
        versionAsOf = Number(v['version']);
        const closing = (await cap.readPackageEvents().select(['event', 'details'] as never).where('package_id' as never, '=', String(pkg['package_id']) as never)
          .where('event' as never, 'in', ['package.committed', 'version.rejected', 'package.withdrawn'] as never).where('occurred_at' as never, '<=', knownAt as never).execute()) as Array<{ event: string; details: Record<string, unknown> }>;
        const closed = closing.some((e) => e.event === 'package.withdrawn' || Number(e.details['version']) === versionAsOf);
        if (!closed) {
          // the approvals that STOOD at known_at — decision, revocation, expiry, digest AND the approver's eligibility reconstructed then (0049)
          for (const ap of await cap.liveApprovalsAsOf({ packageId: String(pkg['package_id']), version: versionAsOf, at: knownAt })) {
            const expires = iso(ap.expires_at);
            windows.push({ kind: 'approval-expiry', id: ap.approval_id, title: `approval by principal:${ap.approver_principal_id} expires`, closes_at: expires, time_left_seconds: secondsLeft(expires), overdue: false, owner: ap.approver_principal_id });
          }
          const choice = v['choice'] as Record<string, unknown> | null;
          if (choice !== null && typeof choice['decision_deadline'] === 'string') {
            const c = `${choice['decision_deadline'].slice(0, 10)}T00:00:00.000Z`;
            windows.push({ kind: 'decision-deadline', id: `${String(pkg['package_id'])}@${versionAsOf}`, title: `decision deadline of ${String(pkg['title'])}`, closes_at: c, time_left_seconds: secondsLeft(c), overdue: c < knownAt, owner: String(choice['action_owner'] ?? pkg['owner_principal_id']) });
          }
        }
      }
    }
    windows.sort((x, y) => (x.closes_at < y.closes_at ? -1 : x.closes_at > y.closes_at ? 1 : x.id < y.id ? -1 : 1));
    const degraded = items.some((i) => i.source_state === 'degraded' || i.source_state === 'blocked');
    const watermark = { prior_briefing_id: prior === null ? null : String(prior['briefing_id']), prior_known_at: since, prior_composed_at: prior === null ? null : iso(prior['composed_at']), known_at: knownAt };
    if (room !== null) sources.add(`room:${String(room['room_id'])}`);
    if (pkg !== null) sources.add(`DPK:${String(pkg['package_id'])}@${String(versionAsOf ?? 0)}`);
    for (const s of sourceStates) sources.add(`SRC:${s.source_id}@${s.contract_version}`);
    const sourceList = [...sources].sort();
    // the agent's bounds, checked before anything is admitted
    if (lim.deadline !== undefined && Date.now() >= lim.deadline) throw new BudgetExceeded('the elapsed budget ran out before admission; the composition is abandoned');
    if (lim.reserve === undefined && lim.maxReads !== null && sourceList.length > lim.maxReads) throw new BudgetExceeded(`the briefing would read ${sourceList.length} source records; the agent's remaining budget is ${lim.maxReads}`);
    if (lim.maxItems !== null && items.length > lim.maxItems) throw new StopCondition(`stop condition max_items: the briefing would carry ${items.length} items, the agent stops at ${lim.maxItems}`);
    if (lim.stopOnDegraded && degraded) throw new StopCondition('stop condition on_degraded: a source the briefing rests on is degraded or blocked');
    const content = { room_id: a.roomId, package_id: pkg === null ? null : String(pkg['package_id']), watermark, sources: sourceList, items, windows, source_states: sourceStates, degraded };
    const digest = contentDigest(content);
    // the narrative: labelled, cites only included items, outside the content digest
    const narrative = a.narrative === null || a.narrative.trim().length === 0 ? null : a.narrative;
    const cites = narrative === null ? [] : a.narrativeCites;
    if (narrative !== null) {
      const ids = new Set(items.map((i) => i.item_id));
      const bad = cites.filter((c) => !ids.has(c));
      if (cites.length === 0 || bad.length > 0) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `a narrative cites the items it summarises; ${bad.length > 0 ? `unknown item(s): ${bad.join(', ')}` : 'none cited'}`), 422);
    }
    // the controls: every contributing source, with the package's own fold where the briefing is a room's
    if (pkg !== null) {
      const pc = (pkg['controls'] ?? {}) as ControlInput;
      controlInputs.push({ ...pc, synthetic_state: pkg['synthetic_state'] === true || pc.synthetic_state === true, classification: typeof pc.classification === 'string' ? pc.classification : 'internal' });
    }
    const controls: Controls = controlInputs.length === 0 ? foldControls([{ synthetic_state: false, classification: 'internal' }]) : foldControls(controlInputs);
    // the composer RECEIVES the composition: a human whose clearance does not cover the fold is refused here, before anything is
    // admitted, and learns the classification alone — no item, title or value (residual review R4a)
    if (composerClearance !== null && !covers(composerClearance, controls.classification)) {
      denyRead(correlationId, `the briefing folds to ${controls.classification}; the composer's clearance in this domain is ${composerClearance}; nothing is admitted or returned`);
    }
    const now = new Date().toISOString();
    const payload = { ...content, content_digest: digest, narrative, narrative_cites: cites, composed_via: via, agent_id: agentId };
    const header: CanonicalHeader = {
      object_id: briefingId, object_type: 'BRF', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN', object_version: '1', lifecycle_state: 'active',
      owning_component: 'CP-EXE-01', accountable_owner: `principal:${room === null ? composer : String(room['owner_principal_id'])}`,
      source_object_ids: sourceList.filter((s) => /^(EVD|CLM|DPK|SRC|run):/.test(s)).map((s) => s.replace(/^run:/, 'SIM:')).slice(0, 200),
      event_time: null, observation_time: null, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
      truth_state: 'asserted', synthetic_state: controls.synthetic_state, confidence: null, uncertainty: null, evidence_refs: [],
      provenance_ref: `principal:${composer}`, method_ref: `briefing-composer@1.1.0${via === 'agent' ? `/agent:${agentId}` : ''}`, contradiction_refs: [], corroboration_refs: [],
      human_refs: via === 'human' ? [`principal:${composer}`] : [`principal:${room === null ? composer : String(room['owner_principal_id'])}`],
      classification: controls.classification, purpose_scope: purposeId, rights_profile: controls.rights_profile, residency_profile: controls.residency_profile, retention_profile: controls.retention_profile, access_policy_ref: controls.access_policy_ref,
      quality_profile: null, quality_state: { degraded, items: items.length, windows: windows.length, narrative: narrative === null ? 'none' : 'labelled', controls_inputs: controls.inputs }, freshness_state: null, schema_ref: 'BRF@v1', ontology_ref: null,
      correction_of: null, supersedes: prior === null ? null : `BRF:${String(prior['briefing_id'])}@1`, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    };
    const check = validateHeader(header);
    if (!check.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `briefing header invalid: ${(check.errors ?? []).join('; ')}`), 422);
    const headerDigest = canonicalHeaderDigest(header, payload);
    if (lim.deadline !== undefined && Date.now() >= lim.deadline) throw new BudgetExceeded('the elapsed budget ran out before admission; the composition is abandoned');
    await cap.admitObject(header, payload, headerDigest);
    await cap.composeBriefing({ briefingId, tenantId, domainId, roomId: a.roomId, packageId: pkg === null ? null : String(pkg['package_id']), composer, via, agentId, knownAt, prior: watermark.prior_briefing_id,
      watermark, sources: sourceList, items, windows, sourceStates, degraded, narrative, narrativeCites: cites, contentDigest: digest, headerDigest, controls, eventId: newId(), correlationId });
    return { briefingId, roomId: a.roomId, packageId: pkg === null ? null : String(pkg['package_id']), knownAt, watermark, contentDigest: digest, headerDigest, items, windows, sourceStates, sources: sourceList, degraded, narrative, narrativeCites: cites, composedVia: via, agentId, controls };
  }

  /** The BRF record's admitted purpose and classification (the header the snapshot was admitted with). */
  private async admitted(cap: ExecutiveReads, briefingId: string): Promise<{ purpose_scope: string | null; classification: string }> {
    const row = (await cap.readCanonicalObjects().select(['purpose_scope', 'classification'] as never).where('object_type' as never, '=', 'BRF' as never).where('object_id' as never, '=', briefingId as never)
      .orderBy('object_version' as never, 'desc').limit(1).executeTakeFirst()) as { purpose_scope: string | null; classification: string } | undefined;
    return { purpose_scope: row?.purpose_scope ?? null, classification: row?.classification ?? 'restricted' };
  }

  /** Availability NOW of the sources a stored snapshot cites — apart from the content, which keeps its digest. */
  private async availability(cap: ExecutiveReads, b: Record<string, unknown>, clearance: string): Promise<{ checked_at: string; checked: Record<string, number>; unavailable: Array<Record<string, unknown>> }> {
    const unavailable: Array<Record<string, unknown>> = [];
    const checked = { evidence: 0, claims: 0, runs: 0, warnings: 0, sources: 0 };
    for (const s of (b['sources'] as string[]) ?? []) {
      // a source contract the snapshot rested on: its reuse rights and lifecycle NOW (residual review R5c) — the content keeps what they were then
      const sm = /^SRC:([0-9a-f-]{36})@(\d+)$/i.exec(s);
      if (sm !== null) {
        checked.sources += 1;
        const row = (await cap.readSourceContracts().select(['rights_state', 'lifecycle_state'] as never).where('source_id' as never, '=', sm[1] as never).where('contract_version' as never, '=', Number(sm[2]) as never).executeTakeFirst()) as { rights_state: string; lifecycle_state: string } | undefined;
        if (row === undefined) unavailable.push({ kind: 'source', id: sm[1], version: Number(sm[2]), reason: 'not accessible to the reader or not recorded' });
        else if (row.rights_state === 'withdrawn') unavailable.push({ kind: 'source', id: sm[1], version: Number(sm[2]), reason: 'reuse rights withdrawn now; what the snapshot rested on may not be used further', lifecycle_state: row.lifecycle_state });
        else if (row.lifecycle_state === 'suspended' || row.lifecycle_state === 'retired') unavailable.push({ kind: 'source', id: sm[1], version: Number(sm[2]), reason: `the contract is ${row.lifecycle_state} now`, lifecycle_state: row.lifecycle_state });
        continue;
      }
      // runs and warnings: readable now, or listed (residual review R4)
      const rm = /^run:([0-9a-f-]{36})@\d+$/i.exec(s);
      if (rm !== null) {
        checked.runs += 1;
        const run = (await cap.readRuns().select(['run_id', 'state'] as never).where('run_id' as never, '=', rm[1] as never).executeTakeFirst()) as { state: string } | undefined;
        if (run === undefined) unavailable.push({ kind: 'run', id: rm[1], version: 1, reason: 'not accessible to the reader or not recorded' });
        continue;
      }
      const wm = /^warning(?:-acknowledged)?:([0-9a-f-]{36})$/i.exec(s);
      if (wm !== null) {
        checked.warnings += 1;
        const wr = (await cap.readWarnings().select(['warning_id'] as never).where('warning_id' as never, '=', wm[1] as never).executeTakeFirst()) as { warning_id: string } | undefined;
        if (wr === undefined) unavailable.push({ kind: 'warning', id: wm[1], version: null, reason: 'not accessible to the reader or not recorded' });
        continue;
      }
      const m = /^(evidence|claim):([0-9a-f-]{36})@(\d+)$/i.exec(s);
      if (m === null) continue;
      if (m[1] === 'evidence') checked.evidence += 1; else checked.claims += 1;
      const objectType = m[1] === 'evidence' ? 'EVD' : 'CLM'; const id = m[2] as string; const version = Number(m[3]);
      const rows = (await cap.readCanonicalObjects().select(['object_version', 'lifecycle_state', 'classification', 'withdrawal_reason', 'payload'] as never).where('object_type' as never, '=', objectType as never).where('object_id' as never, '=', id as never)
        .orderBy('object_version' as never).execute()) as Array<{ object_version: number; lifecycle_state: string; classification: string; withdrawal_reason: string | null; payload: Record<string, unknown> | null }>;
      const cited = rows.find((r) => Number(r.object_version) === version);
      if (cited === undefined) { unavailable.push({ kind: m[1], id, version, reason: 'not accessible to the reader or not recorded' }); continue; }
      const later = rows.find((r) => Number(r.object_version) > version && r.lifecycle_state === 'withdrawn');
      if (cited.lifecycle_state === 'withdrawn' || cited.lifecycle_state === 'deleted' || later !== undefined) {
        unavailable.push({ kind: m[1], id, version, reason: 'withdrawn', by_version: later === undefined ? version : Number(later.object_version), withdrawal_reason: (later ?? cited).withdrawal_reason ?? null });
        continue;
      }
      // a governed deletion of the bytes is a tombstone on the blob manifest, not a canonical lifecycle state
      const manifestId = typeof cited.payload?.['manifest_id'] === 'string' ? String(cited.payload['manifest_id']) : null;
      if (manifestId !== null) {
        const t = (await cap.readTombstones().select(['tombstoned_at', 'reason'] as never).where('manifest_id' as never, '=', manifestId as never).executeTakeFirst()) as { tombstoned_at: unknown; reason: string } | undefined;
        if (t !== undefined) { unavailable.push({ kind: m[1], id, version, reason: 'governed-deleted', at: iso(t.tombstoned_at), tombstone_reason: t.reason }); continue; }
      }
      if (!covers(clearance, cited.classification)) unavailable.push({ kind: m[1], id, version, reason: `classified ${cited.classification}, above the reader's clearance ${clearance}` });
    }
    return { checked_at: new Date().toISOString(), checked, unavailable };
  }

  /**
   * Retrieval is governed like composition, under the reader's authority NOW: a room briefing is
   * read by the room's members; the purpose is the one the snapshot was admitted for; the
   * reader's clearance covers its classification. The historical content is returned unchanged;
   * availability now is reported beside it.
   */
  async get(cap: ExecutiveReads, briefingId: string, reader: AuthenticatedPrincipal | string, correlationId: string, purpose: string | null = null, target: { tenantId: string | null; domainId: string | null } | null = null): Promise<Record<string, unknown>> {
    const readerId = typeof reader === 'string' ? reader : reader.principalId;
    const b = (await cap.readBriefings().selectAll().where('briefing_id' as never, '=', briefingId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (b === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized briefing matches'), 404);
    if (b['room_id'] !== null && !(await cap.isMember({ roomId: String(b['room_id']), principal: readerId }))) {
      denyRead(correlationId, 'a room briefing is read by the room\'s members; a stored snapshot lends no reader the composer\'s authority');
    }
    const admitted = await this.admitted(cap, briefingId);
    if (purpose !== null) assertPurpose(purpose, admitted.purpose_scope, 'briefing', correlationId);
    const clearance = typeof reader === 'string' ? 'restricted' : assertClearance(reader, target ?? { tenantId: String(b['tenant_id']), domainId: String(b['domain_id']) }, admitted.classification, 'briefing', correlationId);
    const availability = await this.availability(cap, b, clearance);
    return { ...b, composed_at: iso(b['composed_at']), known_at: iso(b['known_at']), admitted_for: admitted.purpose_scope, classification: admitted.classification, availability };
  }

  async list(cap: ExecutiveReads, reader: AuthenticatedPrincipal | string, roomId: string | null, purpose: string | null = null, target: { tenantId: string | null; domainId: string | null } | null = null): Promise<Array<Record<string, unknown>>> {
    const readerId = typeof reader === 'string' ? reader : reader.principalId;
    const clearance = typeof reader === 'string' ? 'restricted' : (target === null ? 'internal' : clearanceOf(reader, target));
    let q = cap.readBriefings().select(['briefing_id', 'room_id', 'package_id', 'composed_by', 'composed_via', 'agent_id', 'known_at', 'prior_briefing_id', 'content_digest', 'degraded', 'composed_at', 'controls'] as never).orderBy('composed_at' as never, 'desc').limit(200);
    if (roomId !== null) q = q.where('room_id' as never, '=', roomId as never);
    const rows = (await q.execute()) as Array<Record<string, unknown>>;
    const out: Array<Record<string, unknown>> = [];
    for (const b of rows) {
      if (b['room_id'] !== null && !(await cap.isMember({ roomId: String(b['room_id']), principal: readerId }))) continue;
      const admitted = await this.admitted(cap, String(b['briefing_id']));
      if (!covers(clearance, admitted.classification)) continue;
      if (purpose !== null && admitted.purpose_scope !== null && admitted.purpose_scope !== purpose) continue;
      out.push({ ...b, composed_at: iso(b['composed_at']), known_at: iso(b['known_at']), classification: admitted.classification });
    }
    return out;
  }
}
