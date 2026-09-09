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
 */
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, contentDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import { foldControls, type Controls, type ControlInput } from '../../prediction/controls.js';
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

const hoursBetween = (a: string, b: string): number => Math.round(((new Date(b).getTime() - new Date(a).getTime()) / 3_600_000) * 100) / 100;

@Injectable()
export class BriefingService {
  /** The state of every active source in the domain, from stored records alone (the shape of the readiness register). */
  private async sourceStates(cap: ExecutiveReads): Promise<Array<{ source_id: string; contract_version: number; source_key: string; name: string; acquisition_mode: string; data_origin: string; state: SourceState; reason: string }>> {
    const contracts = (await cap.readSourceContracts().selectAll().where('lifecycle_state' as never, '=', 'active' as never).orderBy('source_key' as never).execute()) as Array<Record<string, unknown>>;
    const out: Array<{ source_id: string; contract_version: number; source_key: string; name: string; acquisition_mode: string; data_origin: string; state: SourceState; reason: string }> = [];
    for (const c of contracts) {
      const sourceId = String(c['source_id']);
      const contract = c['contract'] as Record<string, unknown>;
      const so = (contract['security_and_operations'] ?? {}) as Record<string, unknown>;
      const credentialRef = typeof so['credential_ref'] === 'string' ? so['credential_ref'] : null;
      const mode = String(c['acquisition_mode']);
      const rights = String(c['rights_state']);
      const health = (await cap.readHealthEvents().select(['new_state' as never]).where('source_id' as never, '=', sourceId as never).orderBy('evaluated_at' as never, 'desc').limit(1).executeTakeFirst()) as { new_state: string } | undefined;
      const lastAttempt = (await cap.readScheduledAttempts().select(['outcome' as never]).where('source_id' as never, '=', sourceId as never).orderBy('started_at' as never, 'desc').limit(1).executeTakeFirst()) as { outcome: string } | undefined;
      let state: SourceState; let reason: string;
      if (c['connector_kind'] === 'upload') { state = 'operator-upload'; reason = 'records the operator uploaded'; }
      else if (credentialRef !== null) { state = 'blocked'; reason = `the contract names credential ${credentialRef}, which this deployment does not bind`; }
      else if (rights !== 'confirmed') { state = 'blocked'; reason = `reuse rights are ${rights}`; }
      else if (health !== undefined && ['degraded', 'failed', 'suspended'].includes(health.new_state)) { state = 'degraded'; reason = `the latest recorded health verdict is ${health.new_state}`; }
      else if (lastAttempt !== undefined && ['failed', 'faulted', 'budget_exceeded'].includes(lastAttempt.outcome)) { state = 'degraded'; reason = `the latest scheduled attempt ${lastAttempt.outcome}`; }
      else if (mode === 'live') { state = 'live'; reason = 'live collection under the source\'s cadence'; }
      else { state = 'replayed'; reason = 'replayed from the recorded bytes; not a live observation'; }
      out.push({ source_id: sourceId, contract_version: Number(c['contract_version']), source_key: String(c['source_key']), name: String(c['name']), acquisition_mode: mode, data_origin: String(c['data_origin']), state, reason });
    }
    return out.sort((a, b) => (a.source_key < b.source_key ? -1 : a.source_key > b.source_key ? 1 : a.contract_version - b.contract_version));
  }

  async compose(cap: BriefingWrites, ctx: ScopeContext, a: { roomId: string | null; knownAt: string; priorBriefingId: string | null | undefined; narrative: string | null; narrativeCites: string[] },
                composer: string, via: 'human' | 'agent', agentId: string | null, purposeId: string, correlationId: string, briefingId: string = newId(), maxReads: number | null = null) {
    const tenantId = ctx.tenantId as string; const domainId = ctx.domainId as string;
    const knownAt = new Date(a.knownAt).toISOString();
    let room: Record<string, unknown> | null = null; let pkg: Record<string, unknown> | null = null;
    if (a.roomId !== null) {
      room = (await cap.readRooms().selectAll().where('room_id' as never, '=', a.roomId as never).executeTakeFirst()) as Record<string, unknown> | undefined ?? null;
      if (room === null) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized room matches'), 404);
      if (via === 'human' && !(await cap.isMember({ roomId: a.roomId, principal: composer }))) throw new HttpException(errorBody('EYE_AUT_001', correlationId, 'a room briefing is composed by a member of the room'), 403);
      pkg = (await cap.readPackages().selectAll().where('package_id' as never, '=', String(room['package_id']) as never).executeTakeFirst()) as Record<string, unknown> | undefined ?? null;
    }
    // The prior: bound by id. `undefined` = the room's (or domain's) latest; `null` = none.
    let prior: Record<string, unknown> | null = null;
    if (a.priorBriefingId === undefined) {
      let q = cap.readBriefings().selectAll().orderBy('composed_at' as never, 'desc').limit(1);
      q = a.roomId === null ? q.where('room_id' as never, 'is', null) : q.where('room_id' as never, '=', a.roomId as never);
      prior = (await q.executeTakeFirst()) as Record<string, unknown> | undefined ?? null;
    } else if (a.priorBriefingId !== null) {
      prior = (await cap.readBriefings().selectAll().where('briefing_id' as never, '=', a.priorBriefingId as never).executeTakeFirst()) as Record<string, unknown> | undefined ?? null;
      if (prior === null) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'the prior briefing does not exist in this domain'), 404);
    }
    const since = prior === null ? null : iso(prior['composed_at']);
    const inWindow = (t: unknown): boolean => { const x = iso(t); return (since === null || x > since) && x <= knownAt; };
    const sourceStates = await this.sourceStates(cap);
    const stateOfSource = (sourceId: string): SourceState => sourceStates.find((s) => s.source_id === sourceId)?.state ?? 'internal';
    const items: BriefingItem[] = [];
    const sources = new Set<string>();
    const controlInputs: ControlInput[] = [];
    const push = (i: Omit<BriefingItem, 'item_id' | 'freshness' | 'matters'> & { matters?: BriefingItem['matters'] }) => {
      items.push({ ...i, item_id: `${i.kind}:${i.id}${i.version === null ? '' : `@${i.version}`}`, freshness: { recorded_at: i.at, age_hours: hoursBetween(i.at, knownAt) }, matters: i.matters ?? [] });
      sources.add(`${i.kind}:${i.id}${i.version === null ? '' : `@${i.version}`}`);
    };
    // what changed: evidence and claims admitted
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
    // runs completed
    const runs = (await cap.readRuns().selectAll().where('state' as never, '=', 'completed' as never).where('completed_at' as never, '<=', knownAt as never)
      .$if(since !== null, (q: { where: (...x: unknown[]) => unknown }) => q.where('completed_at' as never, '>', since as never)).orderBy('completed_at' as never).limit(200).execute()) as Array<Record<string, unknown>>;
    for (const r of runs) {
      push({ kind: 'run', id: String(r['run_id']), version: 1, title: `${String(r['run_kind'])} run on twin ${String(r['twin_id'])}@${String(r['twin_version'])}`, at: iso(r['completed_at']), truth_state: 'synthetic', synthetic_state: true,
             source_state: 'internal', source: null, owner: String(r['operator_principal_id']), details: { run_kind: r['run_kind'], control_run_id: r['control_run_id'], outputs_digest: r['outputs_digest'], outside_envelope: r['outside_envelope'] } });
    }
    // branches flipped or closed
    const flips = (await cap.readScenarioEvents().selectAll().where('event' as never, 'in', ['branch.flipped', 'branch.closed'] as never).where('occurred_at' as never, '<=', knownAt as never)
      .$if(since !== null, (q: { where: (...x: unknown[]) => unknown }) => q.where('occurred_at' as never, '>', since as never)).orderBy('occurred_at' as never).limit(200).execute()) as Array<Record<string, unknown>>;
    for (const e of flips) {
      const b = (await cap.readBranches().selectAll().where('branch_id' as never, '=', String(e['branch_id']) as never).executeTakeFirst()) as Record<string, unknown> | undefined;
      push({ kind: 'branch', id: String(e['branch_id']), version: null, title: `${String(e['event'])}: ${String(b?.['name'] ?? '')}`, at: iso(e['occurred_at']), truth_state: 'inferred', synthetic_state: false,
             source_state: 'internal', source: null, owner: b === undefined ? null : String(b['owner_principal_id']), details: { event: e['event'], scenario_id: e['scenario_id'], details: e['details'] } });
    }
    // warnings raised or acknowledged
    const warnings = (await cap.readWarnings().selectAll().orderBy('raised_at' as never).limit(500).execute()) as Array<Record<string, unknown>>;
    for (const w of warnings) {
      if (inWindow(w['raised_at'])) push({ kind: 'warning', id: String(w['warning_id']), version: null, title: `raised: ${String(w['title'])}`, at: iso(w['raised_at']), truth_state: 'inferred', synthetic_state: false,
        source_state: 'internal', source: null, owner: String(w['routed_to']), details: { state: w['state'], consequence: w['consequence'], response_window_closes_at: isoOrNull(w['response_window_closes_at']) } });
      if (w['acknowledged_at'] !== null && w['acknowledged_at'] !== undefined && inWindow(w['acknowledged_at'])) push({ kind: 'warning-acknowledged', id: String(w['warning_id']), version: null, title: `acknowledged: ${String(w['title'])}`, at: iso(w['acknowledged_at']), truth_state: 'asserted', synthetic_state: false,
        source_state: 'internal', source: null, owner: String(w['acknowledged_by']), details: { acknowledgement: w['acknowledgement'] } });
    }
    // packages moved (the room's, or every package in the domain) — dissent is a package event too, and is shown
    let pe = cap.readPackageEvents().selectAll().where('event' as never, 'not in', ['replay.recorded'] as never).where('occurred_at' as never, '<=', knownAt as never).orderBy('occurred_at' as never).limit(500);
    if (since !== null) pe = pe.where('occurred_at' as never, '>', since as never);
    if (pkg !== null) pe = pe.where('package_id' as never, '=', String(pkg['package_id']) as never);
    const pevents = (await pe.execute()) as Array<Record<string, unknown>>;
    for (const e of pevents) {
      const p = (await cap.readPackages().selectAll().where('package_id' as never, '=', String(e['package_id']) as never).executeTakeFirst()) as Record<string, unknown> | undefined;
      push({ kind: e['event'] === 'dissent.recorded' ? 'dissent' : 'package', id: String(e['event_id']), version: null, title: `${String(e['event'])}: ${String(p?.['title'] ?? e['package_id'])}`, at: iso(e['occurred_at']), truth_state: 'asserted',
             synthetic_state: p?.['synthetic_state'] === true, source_state: 'internal', source: null, owner: p === undefined ? null : String(p['owner_principal_id']),
             details: { package_id: e['package_id'], event: e['event'], actor: e['actor_principal_id'], version: (e['details'] as Record<string, unknown>)?.['version'] ?? null } });
    }
    // why it matters: what rests on what changed
    const changedIds = [...new Set(items.filter((i) => ['evidence', 'claim', 'run'].includes(i.kind)).map((i) => i.id))];
    if (changedIds.length > 0) {
      const deps = (await cap.readDependencies().selectAll().where('depends_on_id' as never, 'in', changedIds as never).where('state' as never, '=', 'active' as never).execute()) as Array<Record<string, unknown>>;
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
    // which window is closing
    const windows: BriefingWindow[] = [];
    const secondsLeft = (closesAt: string): number => Math.round((new Date(closesAt).getTime() - new Date(knownAt).getTime()) / 1000);
    for (const w of warnings) {
      if (w['state'] === 'raised' && w['response_window_closes_at'] !== null) {
        const c = iso(w['response_window_closes_at']);
        windows.push({ kind: 'warning-response', id: String(w['warning_id']), title: String(w['title']), closes_at: c, time_left_seconds: secondsLeft(c), overdue: c < knownAt, owner: String(w['routed_to']) });
      }
    }
    if (room !== null) {
      const c = iso(room['next_review_at']);
      windows.push({ kind: 'review', id: String(room['room_id']), title: `next review of ${String(room['title'])}`, closes_at: c, time_left_seconds: secondsLeft(c), overdue: c < knownAt, owner: String(room['owner_principal_id']) });
    }
    if (pkg !== null) {
      const current = pkg['current_version'] === null ? null : Number(pkg['current_version']);
      if (current !== null) {
        const v = (await cap.readVersions().selectAll().where('package_id' as never, '=', String(pkg['package_id']) as never).where('version' as never, '=', current as never).executeTakeFirst()) as Record<string, unknown> | undefined;
        if (v !== undefined && ['proposed', 'under_review', 'approved'].includes(String(v['state']))) {
          for (const ap of await cap.liveApprovals({ packageId: String(pkg['package_id']), version: current })) {
            windows.push({ kind: 'approval-expiry', id: ap.approval_id, title: `approval by principal:${ap.approver_principal_id} expires`, closes_at: ap.expires_at, time_left_seconds: secondsLeft(ap.expires_at), overdue: ap.expires_at < knownAt, owner: ap.approver_principal_id });
          }
          const choice = v['choice'] as Record<string, unknown> | null;
          if (choice !== null && typeof choice['decision_deadline'] === 'string') {
            const c = `${choice['decision_deadline'].slice(0, 10)}T00:00:00.000Z`;
            windows.push({ kind: 'decision-deadline', id: `${String(pkg['package_id'])}@${current}`, title: `decision deadline of ${String(pkg['title'])}`, closes_at: c, time_left_seconds: secondsLeft(c), overdue: c < knownAt, owner: String(choice['action_owner'] ?? pkg['owner_principal_id']) });
          }
        }
      }
    }
    windows.sort((x, y) => (x.closes_at < y.closes_at ? -1 : x.closes_at > y.closes_at ? 1 : x.id < y.id ? -1 : 1));
    const degraded = items.some((i) => i.source_state === 'degraded' || i.source_state === 'blocked');
    const watermark = { prior_briefing_id: prior === null ? null : String(prior['briefing_id']), prior_composed_at: since, known_at: knownAt };
    if (room !== null) sources.add(`room:${String(room['room_id'])}`);
    if (pkg !== null) sources.add(`DPK:${String(pkg['package_id'])}@${String(pkg['current_version'] ?? 0)}`);
    for (const s of sourceStates) sources.add(`SRC:${s.source_id}@${s.contract_version}`);
    const sourceList = [...sources].sort();
    if (maxReads !== null && sourceList.length > maxReads) throw new BudgetExceeded(`the briefing would read ${sourceList.length} source records; the agent's remaining budget is ${maxReads}`);
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
    const controls: Controls = controlInputs.length === 0 ? foldControls([{ synthetic_state: false, classification: 'internal' }]) : foldControls(controlInputs);
    const now = new Date().toISOString();
    const payload = { ...content, content_digest: digest, narrative, narrative_cites: cites, composed_via: via, agent_id: agentId };
    const header: CanonicalHeader = {
      object_id: briefingId, object_type: 'BRF', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN', object_version: '1', lifecycle_state: 'active',
      owning_component: 'CP-EXE-01', accountable_owner: `principal:${room === null ? composer : String(room['owner_principal_id'])}`,
      source_object_ids: sourceList.filter((s) => /^(EVD|CLM|DPK|SRC|run):/.test(s)).map((s) => s.replace(/^run:/, 'SIM:')).slice(0, 200),
      event_time: null, observation_time: null, valid_from: null, valid_to: null, recorded_at: now, time_precision: 'exact', source_clock_quality: 'trusted',
      truth_state: 'asserted', synthetic_state: items.some((i) => i.synthetic_state), confidence: null, uncertainty: null, evidence_refs: [],
      provenance_ref: `principal:${composer}`, method_ref: `briefing-composer@1.0.0${via === 'agent' ? `/agent:${agentId}` : ''}`, contradiction_refs: [], corroboration_refs: [],
      human_refs: via === 'human' ? [`principal:${composer}`] : [`principal:${room === null ? composer : String(room['owner_principal_id'])}`],
      classification: controls.classification, purpose_scope: purposeId, rights_profile: controls.rights_profile, residency_profile: controls.residency_profile, retention_profile: controls.retention_profile, access_policy_ref: controls.access_policy_ref,
      quality_profile: null, quality_state: { degraded, items: items.length, windows: windows.length, narrative: narrative === null ? 'none' : 'labelled' }, freshness_state: null, schema_ref: 'BRF@v1', ontology_ref: null,
      correction_of: null, supersedes: prior === null ? null : `BRF:${String(prior['briefing_id'])}@1`, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    };
    const check = validateHeader(header);
    if (!check.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `briefing header invalid: ${(check.errors ?? []).join('; ')}`), 422);
    const headerDigest = canonicalHeaderDigest(header, payload);
    await cap.admitObject(header, payload, headerDigest);
    await cap.composeBriefing({ briefingId, tenantId, domainId, roomId: a.roomId, packageId: pkg === null ? null : String(pkg['package_id']), composer, via, agentId, knownAt, prior: watermark.prior_briefing_id,
      watermark, sources: sourceList, items, windows, sourceStates, degraded, narrative, narrativeCites: cites, contentDigest: digest, headerDigest, controls, eventId: newId(), correlationId });
    return { briefingId, roomId: a.roomId, packageId: pkg === null ? null : String(pkg['package_id']), knownAt, watermark, contentDigest: digest, headerDigest, items, windows, sourceStates, sources: sourceList, degraded, narrative, narrativeCites: cites, composedVia: via, agentId };
  }

  /** Retrieval is governed like composition: a room briefing is read by the room's members, under the reader's authority NOW. */
  async get(cap: ExecutiveReads, briefingId: string, reader: string, correlationId: string): Promise<Record<string, unknown>> {
    const b = (await cap.readBriefings().selectAll().where('briefing_id' as never, '=', briefingId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (b === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized briefing matches'), 404);
    if (b['room_id'] !== null && !(await cap.isMember({ roomId: String(b['room_id']), principal: reader }))) {
      throw new HttpException(errorBody('EYE_AUT_001', correlationId, 'a room briefing is read by the room\'s members; a stored snapshot lends no reader the composer\'s authority'), 403);
    }
    return { ...b, composed_at: iso(b['composed_at']), known_at: iso(b['known_at']) };
  }

  async list(cap: ExecutiveReads, reader: string, roomId: string | null): Promise<Array<Record<string, unknown>>> {
    let q = cap.readBriefings().select(['briefing_id', 'room_id', 'package_id', 'composed_by', 'composed_via', 'agent_id', 'known_at', 'prior_briefing_id', 'content_digest', 'degraded', 'composed_at'] as never).orderBy('composed_at' as never, 'desc').limit(200);
    if (roomId !== null) q = q.where('room_id' as never, '=', roomId as never);
    const rows = (await q.execute()) as Array<Record<string, unknown>>;
    const out: Array<Record<string, unknown>> = [];
    for (const b of rows) {
      if (b['room_id'] !== null && !(await cap.isMember({ roomId: String(b['room_id']), principal: reader }))) continue;
      out.push({ ...b, composed_at: iso(b['composed_at']), known_at: iso(b['known_at']) });
    }
    return out;
  }
}
