/**
 * THE BRANCH-AWARE TWIN STATE STORE — CP-6 B30 part `branches` (migration 0103 §BR; F-P5-03: V00-T-049/-050, ADR-0011 V4, V03-T-119/-121/
 * -122/-196/-314, AI-28-001/-003, INF-ST-08, SC-05, PR-36-003/-006, CAP-DS-07, AT-36, FEX-14, WS-14).
 *
 *   A BRANCH      is opened by the existing route (open a version on a new branch, forked from and carrying an admitted version).
 *   A CHECKPOINT  is restored by opening a draft on a branch carrying from a named EARLIER admitted version (the existing open port, under
 *                 twin.version), then recording the restore with its reason (twin.branch.restore — the port verifies the draft's facts).
 *   A MERGE       of branch X back into actual is OPENED (the server computes the diverging keys from the two admitted heads and the fork
 *                 point; twin.reconciliation routed to the owner), each diverging key RESOLVED by the twin's own owner (keep_target |
 *                 take_branch | reconciled — never a scenario value into actual), and COMPLETED — REFUSED until reconciliation; when every key
 *                 is resolved the plan is fixed (completing), a draft opened on actual carrying actual's head (twin.version), the branch's or
 *                 reconciled elements grounded through the existing port (twin.ground) and the draft admitted through the existing admit
 *                 (twin.version.admit) — the admission moves the merge to merged in its own transaction (tbr_merge_admitted). Each step is its
 *                 own governed write with its own receipt (one bound action per transaction); a step that fails leaves the merge completing,
 *                 and the next completion resumes it (or the owner closes it).
 *   FRESHNESS     is the head's age by the database's day against the owner's SLO, each element's staleness by age, and the dependency
 *                 uncertainty through the twin's links; a SNAPSHOT FREEZE serves the last validated version with its warning until its
 *                 expiry, after which a run on it is refused. The tick step `twin-freshness` (order 70) raises twin.freshness.
 *   CONFIDENCE    is rolled up per component and per kind (weakest link and mean of the stated confidences; nothing imputed).
 *   A SCENARIO    element (ADR-0011 V4) cites the scenario branch's assumption — an ASU linked to that branch — never evidence of the world.
 *
 * This service validates what a route hands in and assembles reads; the ports decide every rule. Every figure is SYNTHETIC.
 */
import { HttpException, Injectable, Logger, type OnModuleInit } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import { foldControls, type ControlInput } from '../../prediction/controls.js';
import { AttentionTickRegistry, type AttentionTickContext } from '../../executive/attention/tick.js';
import type { Citation, CitationKind } from '../twin.capabilities.js';
import { BranchCapability, type BranchReads, type ElementWrites, type FreezeWrites, type MergeWrites, type PolicyWrites, type ReconcileWrites, type RestoreWrites } from './branch.capabilities.js';

type Row = Record<string, unknown>;

export const FRESHNESS_STEP = 'twin-freshness';
export const FRESHNESS_ORDER = 70;
export const RESOLUTIONS = ['keep_target', 'take_branch', 'reconciled'] as const;
export const RECONCILED_KINDS = ['assumed', 'estimated'] as const;
export const MERGE_STATES = ['open', 'reconciled', 'completing', 'merged', 'refused', 'withdrawn'] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z][a-z0-9_.-]*(:[A-Za-z0-9_.-]+)?$/;
const BRANCH = /^[a-z][a-z0-9-]{0,40}$/;
const OBJECT_TYPE: Readonly<Record<string, string>> = Object.freeze({ evidence: 'EVD', assumption: 'ASU' });

const refuse = (correlationId: string, text: string, status = 422): never => {
  const code = status === 404 ? 'EYE_STA_001' : status === 409 ? 'EYE_STA_002' : status === 403 ? 'EYE_AUT_001' : 'EYE_REQ_001';
  throw new HttpException(errorBody(code, correlationId, text), status);
};
const isObject = (v: unknown): v is Row => v !== null && typeof v === 'object' && !Array.isArray(v);
const text = (v: unknown, min: number, max: number): string | null => (typeof v === 'string' && v.trim().length >= min && v.trim().length <= max ? v.trim() : null);
const day = (v: unknown): string | null => (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null);

export function assertUuid(v: unknown, what: string, correlationId: string, noun = 'branch merge'): string {
  if (typeof v !== 'string' || !UUID.test(v)) refuse(correlationId, `${noun} rejected (${what}): a uuid is required`);
  return v as string;
}
export function assertVersion(v: unknown, correlationId: string): number {
  const n = typeof v === 'string' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < 1) refuse(correlationId, 'version must be a positive integer', 400);
  return n as number;
}

/* ───────────── the intakes (shape only; the ports judge) ───────────── */
export interface PolicyIntake { maxAgeDays: number; keyMaxAge: Record<string, number>; nearExpiryHours: number | null; note: string }
export function validatePolicy(p: Row, correlationId: string): PolicyIntake {
  const m = p['maxAgeDays'];
  if (typeof m !== 'number' || !Number.isInteger(m) || m < 0 || m > 3650) refuse(correlationId, 'freshness policy rejected (max_age): maxAgeDays is a whole number of days in [0, 3650]');
  const k = p['keyMaxAge'] ?? {};
  if (!isObject(k) || !Object.entries(k).every(([key, d]) => KEY.test(key) && typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 3650)) {
    refuse(correlationId, 'freshness policy rejected (key_max_age): keyMaxAge is {key prefix: whole days in [0, 3650]}');
  }
  const h = p['nearExpiryHours'];
  if (h !== undefined && h !== null && (typeof h !== 'number' || !Number.isInteger(h) || h < 1 || h > 720)) refuse(correlationId, 'freshness policy rejected (near_expiry): nearExpiryHours is 1 to 720');
  const note = text(p['note'], 8, 2000);
  if (note === null) refuse(correlationId, 'freshness policy rejected (note): a policy says why (8 to 2000 characters)');
  return { maxAgeDays: m as number, keyMaxAge: k as Record<string, number>, nearExpiryHours: (h ?? null) as number | null, note: note as string };
}

export interface CitationIntake { kind: 'evidence' | 'assumption'; id: string; version: number | null }
function citationsOf(v: unknown, correlationId: string, noun: string): CitationIntake[] {
  if (!Array.isArray(v) || v.length === 0 || v.length > 20) refuse(correlationId, `${noun} rejected (citations): cite 1 to 20 objects { kind: evidence | assumption, id, version? }`);
  return (v as unknown[]).map((c) => {
    if (!isObject(c) || !(c['kind'] === 'evidence' || c['kind'] === 'assumption') || typeof c['id'] !== 'string' || !UUID.test(c['id'])
        || (c['version'] != null && (!Number.isInteger(c['version']) || (c['version'] as number) < 1))) {
      refuse(correlationId, `${noun} rejected (citations): every citation is { kind: evidence | assumption, id, version? }`);
    }
    const x = c as Row;
    return { kind: x['kind'] as 'evidence' | 'assumption', id: x['id'] as string, version: (x['version'] ?? null) as number | null };
  });
}

export interface ResolutionIntake { key: string; resolution: typeof RESOLUTIONS[number]; kind: string | null; value: unknown; unit: string | null; citations: CitationIntake[]; note: string }
export function validateResolution(p: Row, correlationId: string): ResolutionIntake {
  const key = p['key'];
  if (typeof key !== 'string' || !KEY.test(key)) refuse(correlationId, 'branch merge rejected (key): name the diverging key to resolve');
  const r = p['resolution'];
  if (typeof r !== 'string' || !(RESOLUTIONS as readonly string[]).includes(r)) refuse(correlationId, 'branch merge rejected (resolution): a key is resolved keep_target, take_branch or reconciled');
  const note = text(p['note'], 8, 2000);
  if (note === null) refuse(correlationId, 'branch merge rejected (note): a resolution says why (8 to 2000 characters)');
  if (r !== 'reconciled') {
    if (p['value'] !== undefined || p['kind'] !== undefined || p['citations'] !== undefined) refuse(correlationId, 'branch merge rejected (resolution): only a reconciled key states a value, a kind and citations');
    return { key: key as string, resolution: r as ResolutionIntake['resolution'], kind: null, value: null, unit: null, citations: [], note: note as string };
  }
  const kind = p['kind'];
  if (typeof kind !== 'string' || !(RECONCILED_KINDS as readonly string[]).includes(kind)) refuse(correlationId, 'branch merge rejected (kind): a reconciled value is assumed or estimated — the owner\'s judgement, never observed');
  if (p['value'] === undefined || p['value'] === null) refuse(correlationId, 'branch merge rejected (value): a reconciled key states its value');
  const unit = p['unit'] === undefined || p['unit'] === null ? null : (typeof p['unit'] === 'string' && p['unit'].length <= 64 ? p['unit'] : refuse(correlationId, 'branch merge rejected (unit): a unit is a short text'));
  return { key: key as string, resolution: 'reconciled', kind: kind as string, value: p['value'], unit: unit as string | null,
           citations: citationsOf(p['citations'], correlationId, 'branch merge'), note: note as string };
}

export interface FreezeIntake { branchId: string; version: number | null; warning: string; expiresAt: string }
export function validateFreeze(p: Row, correlationId: string): FreezeIntake {
  const b = p['branchId'] ?? 'actual';
  if (typeof b !== 'string' || !BRANCH.test(b)) refuse(correlationId, 'snapshot rejected (branch): branchId is a short lower-case name');
  const v = p['version'];
  if (v !== undefined && v !== null && (!Number.isInteger(v) || (v as number) < 1)) refuse(correlationId, 'snapshot rejected (version): version is a positive integer (the last validated snapshot)');
  const warning = text(p['warning'], 8, 1000);
  if (warning === null) refuse(correlationId, 'snapshot rejected (warning): a frozen snapshot carries its freshness warning (8 to 1000 characters)');
  const e = p['expiresAt'];
  if (typeof e !== 'string' || Number.isNaN(new Date(e).getTime())) refuse(correlationId, 'snapshot rejected (expiry): expiresAt is an instant');
  return { branchId: b as string, version: (v ?? null) as number | null, warning: warning as string, expiresAt: new Date(e as string).toISOString() };
}

export interface ScenarioElementIntake {
  key: string; value: unknown; unit: string | null; scenarioId: string; scenarioBranchId: string;
  assumption: { id: string; version: number | null }; validFrom: string | null; validTo: string | null; confidence: number | null;
}
export function validateScenarioElements(p: Row, correlationId: string): ScenarioElementIntake[] {
  const els = p['elements'];
  if (!Array.isArray(els) || els.length === 0 || els.length > 50) refuse(correlationId, 'scenario element rejected (elements): ground 1 to 50 scenario elements');
  return (els as unknown[]).map((x) => {
    if (!isObject(x)) return refuse(correlationId, 'scenario element rejected (elements): each element is an object');
    const key = x['key'];
    if (typeof key !== 'string' || !KEY.test(key)) refuse(correlationId, 'scenario element rejected (key): a key like shock.corridor_delay_days');
    if (x['value'] === undefined || x['value'] === null) refuse(correlationId, `scenario element rejected (value): ${String(key)} states its scenario value`);
    const scenarioId = assertUuid(x['scenarioId'], 'scenario', correlationId, 'scenario element');
    const scenarioBranchId = assertUuid(x['scenarioBranchId'], 'scenario_branch', correlationId, 'scenario element');
    const a = x['assumption'];
    if (!isObject(a) || typeof a['id'] !== 'string' || !UUID.test(a['id']) || (a['version'] != null && (!Number.isInteger(a['version']) || (a['version'] as number) < 1))) {
      refuse(correlationId, `scenario element rejected (basis): ${String(key)} cites the scenario branch's assumption { id, version? } — a scenario value rests on its scenario, not on the world`);
    }
    const c = x['confidence'];
    if (c !== undefined && c !== null && (typeof c !== 'number' || c < 0 || c > 1)) refuse(correlationId, 'scenario element rejected (confidence): a confidence is in [0, 1]');
    return {
      key: key as string, value: x['value'], unit: typeof x['unit'] === 'string' ? x['unit'] : null, scenarioId, scenarioBranchId,
      assumption: { id: (a as Row)['id'] as string, version: ((a as Row)['version'] ?? null) as number | null },
      validFrom: day(x['validFrom']), validTo: day(x['validTo']), confidence: (c ?? null) as number | null,
    };
  });
}

/* ───────────── pure helpers (unit-tested) ───────────── */
/** The branch tree of a twin from its versions: per branch the versions, the admitted head, the open draft and the fork point. */
export function branchTree(versions: Row[]): Array<{ branch_id: string; forked_from: number | null; head: number | null; draft: number | null; versions: number[]; withdrawn: number[] }> {
  const by = new Map<string, Row[]>();
  for (const v of [...versions].sort((a, b) => Number(a['version']) - Number(b['version']))) {
    const b = String(v['branch_id']);
    by.set(b, [...(by.get(b) ?? []), v]);
  }
  const out = [...by.entries()].map(([branch_id, vs]) => {
    const admitted = vs.filter((v) => v['state'] === 'admitted').map((v) => Number(v['version']));
    const first = vs[0] as Row;
    return {
      branch_id,
      forked_from: first['forked_from_version'] === null || first['forked_from_version'] === undefined ? null : Number(first['forked_from_version']),
      head: admitted.length === 0 ? null : Math.max(...admitted),
      draft: (vs.find((v) => v['state'] === 'draft')?.['version'] ?? null) as number | null,
      versions: vs.map((v) => Number(v['version'])),
      withdrawn: vs.filter((v) => v['state'] === 'withdrawn').map((v) => Number(v['version'])),
    };
  });
  return out.sort((a, b) => (a.branch_id === 'actual' ? -1 : b.branch_id === 'actual' ? 1 : a.branch_id.localeCompare(b.branch_id)));
}

/** The elements the plan grounds into the merge's draft that the draft does not hold yet (a resumed completion grounds only the rest). */
export function pendingGround(plan: Array<{ key: string }>, grounded: string[]): Array<{ key: string }> {
  const have = new Set(grounded);
  return plan.filter((p) => !have.has(p.key));
}

@Injectable()
export class BranchService implements OnModuleInit {
  private readonly log = new Logger('twin.branches');
  constructor(private readonly moduleRef: ModuleRef) {}

  /** The tick step (the scenario-quality idiom: the registry found when the executive module is loaded). */
  onModuleInit(): void {
    let registry: AttentionTickRegistry | null = null;
    try { registry = this.moduleRef.get(AttentionTickRegistry, { strict: false }); } catch { registry = null; }
    if (registry === null) { this.log.warn('no attention tick registry in this application: twin freshness is not swept by the tick'); return; }
    registry.register({ name: FRESHNESS_STEP, order: FRESHNESS_ORDER, run: async (c: AttentionTickContext) => this.sweep(c) });
  }
  private async sweep(c: AttentionTickContext): Promise<Row> {
    return BranchCapability.tick(c.tx, 'executive.attention.tick').sweep({ tenantId: c.tenantId, domainId: c.domainId, actor: c.agentPrincipalId, correlationId: c.correlationId });
  }

  /* ───────────── reads ───────────── */
  /** The EXPLORER: the twin, its branch tree, the merges (their diverging keys, current resolutions and what is unresolved), the freezes, the
   *  freshness policy, the served state now, actual head's freshness and confidence, and the ledger (latest 100). */
  async explorer(cap: BranchReads, twinId: string): Promise<Row | undefined> {
    const twin = (await cap.twin.readTwins().selectAll().where('twin_id' as never, '=', twinId as never).executeTakeFirst()) as Row | undefined;
    if (twin === undefined) return undefined;
    const versions = (await cap.twin.readVersions().select(['twin_id', 'version', 'branch_id', 'forked_from_version', 'supersedes', 'state', 'known_at', 'observed_through',
      'completeness', 'element_count', 'verification_state', 'fitness_state', 'opened_by', 'opened_at', 'admitted_at'] as never)
      .where('twin_id' as never, '=', twinId as never).orderBy('version' as never).execute()) as Row[];
    const merges = (await cap.readMerges().selectAll().where('twin_id' as never, '=', twinId as never).orderBy('opened_at' as never, 'desc').execute()) as Row[];
    const mergesOut: Row[] = [];
    for (const m of merges) mergesOut.push(await this.mergeView(cap, m));
    const freezes = (await cap.readFreezes().selectAll().where('twin_id' as never, '=', twinId as never).orderBy('frozen_at' as never, 'desc').execute()) as Row[];
    const policies = (await cap.readPolicies().selectAll().where('twin_id' as never, '=', twinId as never).orderBy('version' as never, 'desc').execute()) as Row[];
    const events = (await cap.readEvents().selectAll().where('twin_id' as never, '=', twinId as never).orderBy('occurred_at' as never, 'desc').limit(100).execute()) as Row[];
    const tree = branchTree(versions);
    const head = tree.find((b) => b.branch_id === 'actual')?.head ?? null;
    return {
      twin: { twin_id: twin['twin_id'], title: twin['title'], kind: twin['kind'], owner_principal_id: twin['owner_principal_id'], behaviour_model_ref: twin['behaviour_model_ref'],
              synthetic_state: twin['synthetic_state'] },
      branches: tree, versions: versions.map(dated), merges: mergesOut, freezes: freezes.map(strip), policy: policies[0] === undefined ? null : strip(policies[0]),
      policies: policies.map(strip),
      served: await cap.servedState(twinId, null),
      head_freshness: head === null ? null : await cap.versionFreshness(twinId, head),
      head_confidence: head === null ? null : await cap.confidenceRollup(twinId, head),
      restores: events.filter((e) => e['event'] === 'checkpoint.restored').map(strip),
      events: events.map(strip),
      read_at: await cap.dbNow(),
    };
  }
  async mergeView(cap: BranchReads, m: Row): Promise<Row> {
    const id = String(m['merge_id']);
    return { ...strip(m), resolutions: await cap.currentResolutions(id), unresolved: await cap.unresolved(id) };
  }
  async merge(cap: BranchReads, mergeId: string): Promise<Row | undefined> {
    const m = (await cap.readMerges().selectAll().where('merge_id' as never, '=', mergeId as never).executeTakeFirst()) as Row | undefined;
    if (m === undefined) return undefined;
    const events = (await cap.readEvents().selectAll().where('subject_id' as never, '=', mergeId as never).orderBy('occurred_at' as never).execute()) as Row[];
    return { ...(await this.mergeView(cap, m)), expected: await cap.mergeExpected(mergeId), events: events.map(strip) };
  }

  /* ───────────── writes (each the port's) ───────────── */
  async setPolicy(cap: PolicyWrites, ctx: ScopeContext, twinId: string, p: PolicyIntake, actor: string, correlationId: string): Promise<Row> {
    return cap.setPolicy({ twinId, ...scope(ctx), ...p, actor, eventId: newId(), correlationId });
  }
  async openMerge(cap: MergeWrites, ctx: ScopeContext, twinId: string, sourceBranch: string, reason: string, actor: string, correlationId: string): Promise<Row> {
    return cap.openMerge({ mergeId: newId(), twinId, sourceBranch, reason, ...scope(ctx), actor, eventId: newId(), correlationId });
  }
  async resolve(cap: ReconcileWrites, ctx: ScopeContext, mergeId: string, r: ResolutionIntake, actor: string, correlationId: string): Promise<Row> {
    const citations: Citation[] = [];
    for (const c of r.citations) citations.push(await this.cite(cap, c, correlationId, 'branch merge'));
    return cap.resolveKey({ mergeId, key: r.key, resolution: r.resolution, kind: r.kind, value: r.value, unit: r.unit, citations, note: r.note, ...scope(ctx), actor, eventId: newId(), correlationId });
  }
  async closeMerge(cap: MergeWrites, ctx: ScopeContext, mergeId: string, outcome: 'refused' | 'withdrawn', reason: string, actor: string, correlationId: string): Promise<Row> {
    return cap.closeMerge({ mergeId, outcome, reason, ...scope(ctx), actor, eventId: newId(), correlationId });
  }
  async freeze(cap: FreezeWrites, ctx: ScopeContext, twinId: string, f: FreezeIntake, actor: string, correlationId: string): Promise<Row> {
    return cap.freeze({ freezeId: newId(), twinId, ...f, ...scope(ctx), actor, eventId: newId(), correlationId });
  }
  async lift(cap: FreezeWrites, ctx: ScopeContext, freezeId: string, reason: string, actor: string, correlationId: string): Promise<Row> {
    return cap.lift({ freezeId, reason, ...scope(ctx), actor, eventId: newId(), correlationId });
  }
  async recordRestore(cap: RestoreWrites, ctx: ScopeContext, twinId: string, a: { branchId: string; fromVersion: number; draftVersion: number; reason: string }, actor: string, correlationId: string): Promise<Row> {
    return cap.restore({ twinId, ...a, ...scope(ctx), actor, eventId: newId(), correlationId });
  }

  /**
   * THE MERGE'S GROUNDING (twin.ground): into the draft the completion opened on actual, each planned element not grounded yet — the branch's
   * element as it stands (kind, basis, value, unit, citations, health, validity, confidence, controls; the existing port re-checks materiality
   * and citations), or the owner's reconciled value (complete; its controls folded from what it cites).
   */
  async groundPlan(cap: ElementWrites, ctx: ScopeContext, m: { twinId: string; sourceVersion: number; draftVersion: number; ground: Row[] }, actor: string, correlationId: string): Promise<string[]> {
    const grounded = ((await cap.twin.readElements().select(['key'] as never).where('twin_id' as never, '=', m.twinId as never)
      .where('version' as never, '=', m.draftVersion as never).execute()) as Row[]).map((e) => String(e['key']));
    const todo = pendingGround(m.ground.map((g) => ({ ...g, key: String(g['key']) })), grounded) as Row[];
    const out: string[] = [];
    for (const g of todo) {
      const key = String(g['key']);
      if (g['resolution'] === 'take_branch') {
        const e = (await cap.twin.readElements().selectAll().where('twin_id' as never, '=', m.twinId as never).where('version' as never, '=', m.sourceVersion as never)
          .where('key' as never, '=', key as never).executeTakeFirst()) as Row | undefined;
        if (e === undefined) refuse(correlationId, `branch merge rejected (state): the branch element ${key} of v${m.sourceVersion} is not readable`, 409);
        const x = e as Row;
        await cap.groundElement({ elementId: newId(), ...scope(ctx), twinId: m.twinId, version: m.draftVersion, key, kind: String(x['kind']),
          basisTruthState: (x['basis_truth_state'] ?? null) as string | null, value: x['value'], unit: (x['unit'] ?? null) as string | null, citations: x['citations'] as Citation[],
          health: String(x['health']), validFrom: dayOf(x['valid_from']), validTo: dayOf(x['valid_to']), confidence: x['confidence'] === null || x['confidence'] === undefined ? null : Number(x['confidence']),
          syntheticState: x['synthetic_state'] === true, controls: x['controls'] ?? {}, inheritedValidation: (x['inherited_validation'] ?? null) as string | null,
          actor, eventId: newId(), correlationId });
      } else {
        const citations = g['citations'] as Citation[];
        const controls = await this.controlsOf(cap, citations);
        await cap.groundElement({ elementId: newId(), ...scope(ctx), twinId: m.twinId, version: m.draftVersion, key, kind: String(g['kind']), basisTruthState: null,
          value: g['value'], unit: (g['unit'] ?? null) as string | null, citations, health: 'complete', validFrom: null, validTo: null, confidence: null,
          syntheticState: controls.synthetic_state, controls, inheritedValidation: null, actor, eventId: newId(), correlationId });
      }
      out.push(key);
    }
    return out;
  }

  /**
   * A SCENARIO ELEMENT (ADR-0011 V4; twin.ground): into an open draft, a value of a scenario branch, citing that branch's ASSUMPTION — an ASU
   * object of this domain linked (and still linked) to the named scenario branch, or to the whole scenario. The element's kind is `scenario`:
   * it is never observed, estimated or assumed state of the world; a merge never takes it into actual.
   */
  async groundScenario(cap: ElementWrites, ctx: ScopeContext, twinId: string, version: number, els: ScenarioElementIntake[], actor: string, correlationId: string): Promise<Row[]> {
    const v = (await cap.twin.readVersions().select(['state'] as never).where('twin_id' as never, '=', twinId as never).where('version' as never, '=', version as never).executeTakeFirst()) as Row | undefined;
    if (v === undefined) refuse(correlationId, 'scenario element rejected (unknown_version): no authorized twin version matches', 404);
    if ((v as Row)['state'] !== 'draft') refuse(correlationId, `scenario element rejected (state): version ${version} is ${String((v as Row)['state'])}; a scenario element goes into an open draft`, 409);
    const out: Row[] = [];
    for (const e of els) {
      const link = (await cap.readScenarioAssumptions().select(['link_id', 'branch_id', 'state', 'critical'] as never)
        .where('scenario_id' as never, '=', e.scenarioId as never).where('assumption_id' as never, '=', e.assumption.id as never)
        .where('state' as never, '=', 'linked' as never).execute()) as Row[];
      const bound = link.find((l) => l['branch_id'] === null || l['branch_id'] === e.scenarioBranchId);
      if (bound === undefined) {
        refuse(correlationId, `scenario element rejected (basis): assumption ${e.assumption.id} is not linked to scenario ${e.scenarioId} branch ${e.scenarioBranchId}; a scenario element cites its scenario branch's assumption`);
      }
      const citation = await this.cite(cap, { kind: 'assumption', id: e.assumption.id, version: e.assumption.version }, correlationId, 'scenario element');
      const controls = await this.controlsOf(cap, [citation]);
      const material = await cap.groundElement({ elementId: newId(), ...scope(ctx), twinId, version, key: e.key, kind: 'scenario', basisTruthState: null, value: e.value, unit: e.unit,
        citations: [citation], health: 'complete', validFrom: e.validFrom, validTo: e.validTo, confidence: e.confidence, syntheticState: controls.synthetic_state, controls,
        inheritedValidation: null, actor, eventId: newId(), correlationId });
      out.push({ key: e.key, kind: 'scenario', material, scenario_id: e.scenarioId, scenario_branch_id: e.scenarioBranchId, assumption: citation, link_id: (bound as Row)['link_id'] });
    }
    return out;
  }

  /** A citation bound to the exact object it names (id, version, digest) — the twin capability's own resolution, under row security. */
  private async cite(cap: BranchReads, c: { kind: string; id: string; version: number | null }, correlationId: string, noun: string): Promise<Citation> {
    const row = await cap.twin.citedObject({ objectType: OBJECT_TYPE[c.kind] as string, id: c.id, version: c.version });
    if (row === undefined) refuse(correlationId, `${noun} rejected (unknown_citation): ${c.kind} ${c.id}${c.version === null ? '' : `@${c.version}`} is not an authorized object of this domain`, 404);
    const r = row as NonNullable<typeof row>;
    return { kind: c.kind as CitationKind, id: r.object_id, version: r.object_version, digest: r.content_digest };
  }
  private async controlsOf(cap: BranchReads, citations: Citation[]) {
    const inputs: ControlInput[] = [];
    for (const c of citations) {
      if (c.kind === 'entity') continue;
      const row = await cap.twin.citedObject({ objectType: c.kind === 'evidence' ? 'EVD' : c.kind === 'assumption' ? 'ASU' : 'EVD', id: c.id, version: c.version });
      if (row !== undefined) inputs.push({ synthetic_state: row.synthetic_state, classification: row.classification, rights_profile: row.rights_profile,
                                           residency_profile: row.residency_profile, retention_profile: row.retention_profile, access_policy_ref: row.access_policy_ref });
    }
    return foldControls(inputs);
  }
}

function scope(ctx: ScopeContext): { tenantId: string; domainId: string } { return { tenantId: ctx.tenantId as string, domainId: ctx.domainId as string }; }
function strip(r: Row): Row { const { scope: _s, tenant_id: _t, domain_id: _d, ...rest } = r; return rest; }
function dayOf(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  // the driver hands a DATE back as a Date at LOCAL midnight: render the day it names (the twin service's rule)
  if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
}
/** A version row with its DATE as the day it names (never shifted by a time zone). */
function dated(v: Row): Row { return { ...strip(v), observed_through: dayOf(v['observed_through']) }; }
