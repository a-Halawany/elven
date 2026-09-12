/**
 * DECISION PACKAGES — Phase 6 (L9), stage P6-M1.
 *
 * A package is what a named human is asked to approve. It binds to a DEC a strategy
 * owner declared through Phase 3's port; it never declares one. Its options cite
 * exact object versions — completed runs, forecasts, claims, evidence, assumptions,
 * warnings — and every citation is resolved HERE, under the caller's read authority,
 * to the id, version and content digest the database will bind. An option's
 * uncertainty is DERIVED from what those objects say about themselves (validation
 * status, envelope, truth state, synthetic state); it is never taken from the caller.
 *
 * The choice — which option, why, by when, at what accepted trade-off, owned by whom,
 * judged against which measurable outcomes — is set on a draft and proposed with it:
 * a different choice is a different version, and an approval (0042) signs the digest
 * that includes it.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import { foldControls, type Controls, type ControlInput } from '../../prediction/controls.js';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { assertClearance, assertPurpose, clearanceOf, covers } from '../clearance.js';
import type {
  ChoiceWrites, Citation, CitedObjectRow, ConsequenceKind, DeclareWrites, DecisionReads, DissentWrites, OptionWrites, ProposeWrites, TermsWrites, VersionWrites, WithdrawWrites,
} from '../decision.capabilities.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KINDS: readonly ConsequenceKind[] = ['run', 'forecast', 'claim', 'evidence', 'assumption', 'warning'] as const;
const OBJECT_TYPE_OF: Readonly<Record<ConsequenceKind, string>> = Object.freeze({
  run: 'SIM', forecast: 'FCT', claim: 'CLM', evidence: 'EVD', assumption: 'ASU', warning: 'WRN',
});
const DEPENDS_ON_KIND: Readonly<Record<ConsequenceKind, string>> = Object.freeze({
  run: 'run', forecast: 'forecast', claim: 'claim', evidence: 'evidence', assumption: 'strategy', warning: 'forecast',
});

export interface PackageIntake { decisionObjectId: string; title: string; statement: string; owner: string }
export interface OptionIntake {
  key: string; title: string; kind: 'intervention' | 'status_quo';
  consequences: Array<{ kind: ConsequenceKind; id: string; version?: number | null }>;
  unsimulatedReason: string | null; secondOrder: unknown[]; risks: unknown[]; opportunities: unknown[]; reversibility: string | null;
}
export interface TermsIntake {
  objectives: string[]; constraints: unknown[]; approverPolicy: Record<string, unknown>; monitoringConditions: unknown[];
  reversibility: string | null; informationValue: string | null; secondOrder: unknown[]; risks: unknown[]; opportunities: unknown[];
}

const bad = (correlationId: string, msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };
const strList = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v.trim().length > 0 ? v : null);

export function validatePackageIntake(m: Partial<PackageIntake>, correlationId: string): PackageIntake {
  if (typeof m.decisionObjectId !== 'string' || !UUID.test(m.decisionObjectId)) bad(correlationId, 'decisionObjectId must name the DEC a strategy owner declared');
  if (typeof m.title !== 'string' || m.title.trim().length < 2 || m.title.length > 256) bad(correlationId, 'title must be between 2 and 256 characters');
  if (typeof m.statement !== 'string' || m.statement.trim().length < 2 || m.statement.length > 4096) bad(correlationId, 'statement must be between 2 and 4096 characters');
  if (typeof m.owner !== 'string' || !UUID.test(m.owner)) bad(correlationId, 'owner must be a principal id');
  return { decisionObjectId: m.decisionObjectId as string, title: m.title as string, statement: m.statement as string, owner: m.owner as string };
}

export function validateOptionIntake(m: Partial<OptionIntake>, correlationId: string): OptionIntake {
  if (typeof m.key !== 'string' || !/^[a-z][a-z0-9_-]{0,40}$/.test(m.key)) bad(correlationId, 'key must be like reroute-cape or status-quo');
  if (typeof m.title !== 'string' || m.title.trim().length < 2 || m.title.length > 256) bad(correlationId, 'title must be between 2 and 256 characters');
  if (m.kind !== 'intervention' && m.kind !== 'status_quo') bad(correlationId, "kind must be 'intervention' or 'status_quo'");
  if (!Array.isArray(m.consequences)) bad(correlationId, 'consequences must be an array of { kind, id, version? }');
  for (const c of m.consequences as unknown[]) {
    const x = c as Partial<Citation>;
    if (x === null || typeof x !== 'object' || !KINDS.includes(x.kind as ConsequenceKind)) bad(correlationId, `consequence kind must be one of ${KINDS.join(', ')}`);
    if (typeof x.id !== 'string' || !UUID.test(x.id)) bad(correlationId, 'consequence id must be a uuid');
    if (x.version !== undefined && x.version !== null && (!Number.isInteger(x.version) || (x.version as number) < 1)) bad(correlationId, 'consequence version must be a positive integer');
  }
  const reason = strOrNull(m.unsimulatedReason);
  if (reason !== null && reason.trim().length < 8) bad(correlationId, 'unsimulatedReason must say, in at least eight characters, why the option was not simulated');
  return {
    key: m.key as string, title: m.title as string, kind: m.kind as OptionIntake['kind'],
    consequences: (m.consequences as OptionIntake['consequences']).map((c) => ({ kind: c.kind, id: c.id, version: c.version ?? null })),
    unsimulatedReason: reason, secondOrder: arr(m.secondOrder), risks: arr(m.risks), opportunities: arr(m.opportunities), reversibility: strOrNull(m.reversibility),
  };
}

export function validateTermsIntake(m: Partial<TermsIntake>, correlationId: string): TermsIntake {
  const objectives = strList(m.objectives);
  if (objectives.length === 0 || !objectives.every((o) => UUID.test(o))) bad(correlationId, 'objectives must list at least one OBJ id');
  if (typeof m.approverPolicy !== 'object' || m.approverPolicy === null || Array.isArray(m.approverPolicy)) bad(correlationId, 'approverPolicy must be an object { quorum, principals?, roles?, expires_after_days? }');
  if (!Array.isArray(m.monitoringConditions)) bad(correlationId, 'monitoringConditions must be an array');
  return {
    objectives, constraints: arr(m.constraints), approverPolicy: m.approverPolicy as Record<string, unknown>, monitoringConditions: m.monitoringConditions as unknown[],
    reversibility: strOrNull(m.reversibility), informationValue: strOrNull(m.informationValue),
    secondOrder: arr(m.secondOrder), risks: arr(m.risks), opportunities: arr(m.opportunities),
  };
}

/** A fold of folds: a joined profile ('a; b') is split back into its values so the next fold does not repeat them. */
export function unfoldProfiles(inputs: ControlInput[]): ControlInput[] {
  const out: ControlInput[] = [];
  for (const i of inputs) {
    const split = (v: unknown): string[] => (typeof v === 'string' ? v.split('; ').filter((x) => x.length > 0) : []);
    const rights = split(i.rights_profile); const residency = split(i.residency_profile); const retention = split(i.retention_profile); const access = split(i.access_policy_ref);
    const n = Math.max(1, rights.length, residency.length, retention.length, access.length);
    for (let k = 0; k < n; k += 1) {
      out.push({ synthetic_state: i.synthetic_state, classification: i.classification, rights_profile: rights[k] ?? null, residency_profile: residency[k] ?? null, retention_profile: retention[k] ?? null, access_policy_ref: access[k] ?? null });
    }
  }
  return out;
}

const instantOf = (v: unknown): string => (v instanceof Date ? v.toISOString() : new Date(String(v)).toISOString());
const dayOf = (v: unknown): string | null => (v === null || v === undefined ? null : (v instanceof Date ? v.toISOString().slice(0, 10) : String(v).slice(0, 10)));

@Injectable()
export class PackageService {
  async declare(cap: DeclareWrites, ctx: ScopeContext, intake: PackageIntake, actor: string, correlationId: string, packageId: string = newId()): Promise<{ packageId: string }> {
    const dec = (await cap.readStrategy().selectAll().where('strategy_object_id' as never, '=', intake.decisionObjectId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (dec === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'the package must bind to a DEC a strategy owner declared in this domain; none is readable'), 404);
    if (dec['object_type'] !== 'DEC') throw new HttpException(errorBody('EYE_REQ_001', correlationId, `strategy object is a ${String(dec['object_type'])}, not a DEC; a package never declares the decision itself`), 422);
    await cap.declarePackage({
      packageId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, decisionObjectId: intake.decisionObjectId,
      title: intake.title, statement: intake.statement, owner: intake.owner, actor, eventId: newId(), correlationId,
    });
    return { packageId };
  }

  async openVersion(cap: VersionWrites, ctx: ScopeContext, packageId: string, a: { knownAt: string; observedThrough: string | null; carryFrom: number | null }, actor: string, correlationId: string): Promise<{ packageId: string; version: number }> {
    const p = (await cap.readPackages().selectAll().where('package_id' as never, '=', packageId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (p === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized package matches'), 404);
    const version = await cap.openVersion({ packageId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, knownAt: a.knownAt, observedThrough: a.observedThrough, carryFrom: a.carryFrom, actor, eventId: newId(), correlationId });
    return { packageId, version };
  }

  /**
   * Resolve every citation to the exact object version and digest, under the
   * caller's own read authority. A citation that names nothing readable, or a run
   * that is not completed, refuses the option — an option whose consequences cannot
   * be read is not an option.
   */
  private async resolveCitations(cap: DecisionReads, cites: OptionIntake['consequences'], correlationId: string, key: string): Promise<{ citations: Citation[]; rows: CitedObjectRow[]; runs: Array<Record<string, unknown>> }> {
    const citations: Citation[] = []; const rows: CitedObjectRow[] = []; const runs: Array<Record<string, unknown>> = [];
    for (const c of cites) {
      const row = await cap.citedObject({ objectType: OBJECT_TYPE_OF[c.kind], id: c.id, version: c.version ?? null });
      if (row === undefined) bad(correlationId, `${key}: ${c.kind} ${c.id}${c.version ? `@${c.version}` : ''} is not a readable ${OBJECT_TYPE_OF[c.kind]} in this domain`);
      const r = row as CitedObjectRow;
      if (r.lifecycle_state === 'withdrawn' || r.lifecycle_state === 'deleted') bad(correlationId, `${key}: ${c.kind} ${c.id}@${r.object_version} is ${r.lifecycle_state}; a consequence cannot rest on it`);
      if (c.kind === 'run') {
        const run = (await cap.readRuns().selectAll().where('run_id' as never, '=', c.id as never).executeTakeFirst()) as Record<string, unknown> | undefined;
        if (run === undefined) bad(correlationId, `${key}: run ${c.id} is not readable in this domain`);
        if ((run as Record<string, unknown>)['state'] !== 'completed') bad(correlationId, `${key}: run ${c.id} is ${String((run as Record<string, unknown>)['state'])}, not completed; only a completed run states a consequence`);
        runs.push(run as Record<string, unknown>);
      }
      citations.push({ kind: c.kind, id: c.id, version: Number(r.object_version), digest: r.content_digest });
      rows.push(r);
    }
    return { citations, rows, runs };
  }

  /**
   * The option. Citations are resolved here under the caller's read authority so a refusal
   * is answered before the port is called; the PORT binds them again — identity, digest,
   * both cut-offs, the run's own cut-offs — and DERIVES the uncertainty, controls and
   * synthetic state from the cited records (review of PR #46, item 2). What the caller
   * sends as uncertainty or controls is never consulted; what the port derived is returned.
   */
  async setOption(cap: OptionWrites, ctx: ScopeContext, packageId: string, version: number, intake: OptionIntake, actor: string, correlationId: string): Promise<{ optionId: string; key: string; simulated: boolean; uncertainty: Record<string, unknown>; syntheticState: boolean; controls: Record<string, unknown> }> {
    const v = (await cap.readVersions().selectAll().where('package_id' as never, '=', packageId as never).where('version' as never, '=', version as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (v === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized package version matches'), 404);
    if (v['state'] !== 'draft') throw new HttpException(errorBody('EYE_STA_001', correlationId, `version ${version} is ${String(v['state'])} and immutable; open a new version`), 409);
    const { citations } = await this.resolveCitations(cap, intake.consequences, correlationId, intake.key);
    const simulated = citations.some((c) => c.kind === 'run');
    if (!simulated && intake.unsimulatedReason === null) bad(correlationId, `${intake.key}: no consequence cites a completed run; say why the option is unsimulated (unsimulatedReason)`);
    const optionId = newId();
    const derived = await cap.setOption({
      optionId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, key: intake.key, title: intake.title, kind: intake.kind,
      consequences: citations, simulated, unsimulatedReason: simulated ? null : intake.unsimulatedReason, uncertainty: {}, secondOrder: intake.secondOrder, risks: intake.risks,
      opportunities: intake.opportunities, reversibility: intake.reversibility, syntheticState: false, controls: {}, actor, eventId: newId(), correlationId,
    });
    return { optionId, key: intake.key, simulated: derived.simulated, uncertainty: derived.uncertainty, syntheticState: derived.synthetic_state, controls: derived.controls };
  }

  async setTerms(cap: TermsWrites, ctx: ScopeContext, packageId: string, version: number, intake: TermsIntake, actor: string, correlationId: string): Promise<{ packageId: string; version: number }> {
    await cap.setTerms({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, ...intake, actor, eventId: newId(), correlationId });
    return { packageId, version };
  }

  async setChoice(cap: ChoiceWrites, ctx: ScopeContext, packageId: string, version: number, choice: Record<string, unknown>, actor: string, correlationId: string): Promise<{ packageId: string; version: number }> {
    if (typeof choice['option_key'] !== 'string') bad(correlationId, 'choice.option_key names the chosen option');
    if (typeof choice['rationale'] !== 'string' || choice['rationale'].trim().length < 8) bad(correlationId, 'choice.rationale is the human\'s own words, at least eight characters');
    if (typeof choice['action_owner'] !== 'string' || !UUID.test(choice['action_owner'])) bad(correlationId, 'choice.action_owner must be a principal id');
    if (!Array.isArray(choice['outcome_criteria']) || choice['outcome_criteria'].length === 0) bad(correlationId, 'choice.outcome_criteria must list at least one measurable criterion');
    await cap.setChoice({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, choice, actor, eventId: newId(), correlationId });
    return { packageId, version };
  }

  async recordDissent(cap: DissentWrites, ctx: ScopeContext, packageId: string, version: number, a: { position: string; rationale: string; citation: OptionIntake['consequences'][number] | null }, principal: string, correlationId: string): Promise<{ dissentId: string }> {
    if (typeof a.position !== 'string' || a.position.trim().length < 2) bad(correlationId, 'position is required');
    if (typeof a.rationale !== 'string' || a.rationale.trim().length < 8) bad(correlationId, 'rationale must be at least eight characters');
    let citation: Citation | null = null;
    if (a.citation !== null) {
      const r = await this.resolveCitations(cap, [a.citation], correlationId, 'dissent');
      citation = r.citations[0] as Citation;
    }
    const dissentId = newId();
    await cap.recordDissent({ dissentId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version, principal, position: a.position, rationale: a.rationale, citation, eventId: newId(), correlationId });
    return { dissentId };
  }

  /**
   * PROPOSE: the canonical DPK version and the bound state in one transaction. The
   * digest the header carries is what an approval will sign.
   */
  async propose(cap: ProposeWrites, ctx: ScopeContext, packageId: string, version: number, purposeId: string, actor: string, correlationId: string): Promise<{ packageId: string; version: number; versionDigest: string; baselineRunId: string | null; syntheticState: boolean }> {
    const p = (await cap.readPackages().selectAll().where('package_id' as never, '=', packageId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    const v = (await cap.readVersions().selectAll().where('package_id' as never, '=', packageId as never).where('version' as never, '=', version as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (p === undefined || v === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized package version matches'), 404);
    if (v['state'] !== 'draft') throw new HttpException(errorBody('EYE_STA_001', correlationId, `version ${version} is already proposed`), 409);
    const options = (await cap.readOptions().selectAll().where('package_id' as never, '=', packageId as never).where('version' as never, '=', version as never).orderBy('key' as never).execute()) as Array<Record<string, unknown>>;
    if (options.length < 2) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'a decision compares at least two options; the draft has fewer'), 409);
    if (options.filter((o) => o['kind'] === 'status_quo').length !== 1) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'exactly one option is the explicit status quo (do nothing)'), 409);
    if (v['choice'] === null || v['choice'] === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'the choice is what is proposed; the draft has none'), 409);
    if ((v['objectives'] as unknown[]).length === 0) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'the draft names no objective'), 409);
    // One common baseline: every simulated consequence rests on the same control run.
    const runIds = [...new Set(options.flatMap((o) => (o['consequences'] as Citation[]).filter((c) => c.kind === 'run').map((c) => c.id)))];
    const baselines = new Set<string>();
    for (const id of runIds) {
      const run = (await cap.readRuns().selectAll().where('run_id' as never, '=', id as never).executeTakeFirst()) as Record<string, unknown> | undefined;
      if (run === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `run ${id} cited by an option is no longer readable`), 409);
      baselines.add(String(run['control_run_id'] ?? run['run_id']));
    }
    if (baselines.size > 1) throw new HttpException(errorBody('EYE_STA_001', correlationId, `the options' simulated consequences rest on ${baselines.size} different baselines; one control run is the common baseline`), 409);
    const baselineRunId = baselines.size === 1 ? [...baselines][0] as string : null;
    // The version's baseline is bound by the port before the digest is computed; digest what it will bind.
    const citations: Citation[] = options.flatMap((o) => o['consequences'] as Citation[]);
    const controlInputs = options.map((o) => o['controls'] as ControlInput).filter((c) => c !== null && typeof c === 'object' && Object.keys(c).length > 0);
    const controls: Controls = controlInputs.length === 0 ? foldControls([{ synthetic_state: false, classification: 'internal' }]) : foldControls(unfoldProfiles(controlInputs));
    const syntheticState = options.some((o) => o['synthetic_state'] === true);
    const dependencies = new Map<string, { kind: string; id: string; key: string }>();
    for (const o of options) for (const c of o['consequences'] as Citation[]) {
      const k = `${DEPENDS_ON_KIND[c.kind]}|${c.id}`;
      if (!dependencies.has(k)) dependencies.set(k, { kind: DEPENDS_ON_KIND[c.kind], id: c.id, key: String(o['key']) });
    }
    const knownAt = instantOf(v['known_at']);
    const observedThrough = dayOf(v['observed_through']);
    const supersedes = v['supersedes'] === null || v['supersedes'] === undefined ? null : Number(v['supersedes']);
    // The digest is computed AFTER the baseline is set: the port binds the baseline first, then recomputes and compares.
    const expected = await cap.versionDigest({ packageId, version });
    const payload = {
      decision_object_id: String(p['decision_object_id']), title: p['title'], statement: p['statement'], owner: `principal:${String(p['owner_principal_id'])}`,
      version, supersedes, known_at: knownAt, observed_through: observedThrough,
      objectives: v['objectives'], constraints: v['constraints'],
      options: options.map((o) => ({
        key: o['key'], title: o['title'], kind: o['kind'], consequences: o['consequences'], simulated: o['simulated'] === true, unsimulated_reason: o['unsimulated_reason'] ?? null,
        uncertainty: o['uncertainty'], second_order: o['second_order'], risks: o['risks'], opportunities: o['opportunities'], reversibility: o['reversibility'] ?? null, synthetic_state: o['synthetic_state'] === true })),
      choice: v['choice'], approver_policy: v['approver_policy'], monitoring_conditions: v['monitoring_conditions'],
      reversibility: v['reversibility'] ?? null, information_value: v['information_value'] ?? null, second_order: v['second_order'], risks: v['risks'], opportunities: v['opportunities'],
      version_digest: expected, baseline_run_id: baselineRunId, synthetic_world: syntheticState,
    };
    const now = new Date().toISOString();
    const header: CanonicalHeader = {
      object_id: packageId, object_type: 'DPK', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN',
      object_version: String(version), lifecycle_state: 'active', owning_component: 'CP-DEC-01',
      accountable_owner: `principal:${String(p['owner_principal_id'])}`,
      source_object_ids: [...new Set([`DEC:${String(p['decision_object_id'])}@1`, ...citations.map((c) => `${OBJECT_TYPE_OF[c.kind]}:${c.id}@${c.version}`)])],
      event_time: null, observation_time: observedThrough === null ? null : `${observedThrough}T00:00:00.000Z`,
      valid_from: null, valid_to: null, recorded_at: now, time_precision: observedThrough === null ? 'exact' : 'day',
      source_clock_quality: 'trusted', truth_state: 'asserted', synthetic_state: syntheticState, confidence: null, uncertainty: null,
      evidence_refs: [...new Set(citations.filter((c) => c.kind === 'evidence').map((c) => `EVD:${c.id}@${c.version}`))],
      provenance_ref: `principal:${String(p['owner_principal_id'])}`, method_ref: 'decision-package@1.0.0',
      contradiction_refs: [], corroboration_refs: [], human_refs: [...new Set([`principal:${String(p['owner_principal_id'])}`, `principal:${actor}`])],
      classification: controls.classification, purpose_scope: purposeId, rights_profile: controls.rights_profile,
      residency_profile: controls.residency_profile, retention_profile: controls.retention_profile, access_policy_ref: controls.access_policy_ref,
      quality_profile: null, quality_state: { completeness: 'complete', verification: 'proposed', baseline: baselineRunId === null ? 'none' : 'one-control-run' },
      freshness_state: null, schema_ref: 'DPK@v1', ontology_ref: null,
      correction_of: null, supersedes: supersedes === null ? null : `DPK:${packageId}@${supersedes}`, withdrawal_reason: null,
      audit_correlation_id: correlationId, content_ref: null,
    };
    const check = validateHeader(header);
    if (!check.ok) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `package header invalid: ${(check.errors ?? []).join('; ')}`), 422);
    const headerDigest = canonicalHeaderDigest(header, payload);
    await cap.admitObject(header, payload, headerDigest);
    const r = await cap.proposeVersion({
      packageId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, version, expectedDigest: expected, headerDigest, baselineRunId,
      syntheticState, controls, dependencies: [...dependencies.values()], actor, eventId: newId(), correlationId,
    });
    return { packageId, version, versionDigest: r.version_digest, baselineRunId: r.baseline_run_id, syntheticState };
  }

  async withdraw(cap: WithdrawWrites, ctx: ScopeContext, packageId: string, reason: string, actor: string, correlationId: string): Promise<{ packageId: string }> {
    if (typeof reason !== 'string' || reason.trim().length < 4) bad(correlationId, 'a reason is required');
    await cap.withdrawPackage({ packageId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, reason, actor, eventId: newId(), correlationId });
    return { packageId };
  }

  /**
   * The list is governed like the detail view (residual review R4): a package the reader's clearance in this
   * domain does not cover, or whose admitted purpose is not the reader's, is not listed. Drafts that were never
   * proposed carry no admitted record yet and are listed under their folded controls alone.
   */
  async list(cap: DecisionReads, reader: AuthenticatedPrincipal | null = null, purpose: string | null = null, target: { tenantId: string | null; domainId: string | null } | null = null): Promise<Array<Record<string, unknown>>> {
    const packages = (await cap.readPackages().selectAll().orderBy('declared_at' as never, 'desc').execute()) as Array<Record<string, unknown>>;
    const versions = (await cap.readVersions().selectAll().orderBy('version' as never).execute()) as Array<Record<string, unknown>>;
    let allowed = packages;
    if (reader !== null && target !== null) {
      const clearance = clearanceOf(reader, target);
      const ids = packages.map((p) => String(p['package_id']));
      const admitted = ids.length === 0 ? [] : (await cap.readCanonicalObjects().select(['object_id', 'purpose_scope'] as never).where('object_type' as never, '=', 'DPK' as never)
        .where('object_id' as never, 'in', ids as never).execute()) as Array<{ object_id: string; purpose_scope: string | null }>;
      const purposeOf = new Map(admitted.map((a) => [String(a.object_id), a.purpose_scope]));
      allowed = packages.filter((p) => {
        if (!covers(clearance, String((p['controls'] as Record<string, unknown> | null)?.['classification'] ?? 'internal'))) return false;
        const admittedFor = purposeOf.get(String(p['package_id'])) ?? null;
        return purpose === null || admittedFor === null || admittedFor === purpose;
      });
    }
    return allowed.map((p) => ({ ...p, versions: versions.filter((v) => String(v['package_id']) === String(p['package_id'])).map((v) => ({ ...v, observed_through: dayOf(v['observed_through']) })) }));
  }

  /**
   * Retrieval under the reader's authority NOW (review of PR #46, items 1 and 4): the reader's
   * clearance covers the package's folded classification and their purpose is the one the
   * package was proposed for; an approval's standing is the port's own recount, never a
   * local re-derivation.
   */
  async get(cap: DecisionReads, packageId: string, reader: AuthenticatedPrincipal | null = null, purpose: string | null = null, correlationId: string = newId(), target: { tenantId: string | null; domainId: string | null } | null = null): Promise<Record<string, unknown> | undefined> {
    const p = (await cap.readPackages().selectAll().where('package_id' as never, '=', packageId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (p === undefined) return undefined;
    if (reader !== null) {
      assertClearance(reader, target ?? { tenantId: String(p['tenant_id']), domainId: String(p['domain_id']) }, String((p['controls'] as Record<string, unknown> | null)?.['classification'] ?? 'internal'), 'package', correlationId);
      if (purpose !== null && p['current_version'] !== null && p['current_version'] !== undefined) {
        const dpk = (await cap.readCanonicalObjects().select(['purpose_scope' as never]).where('object_type' as never, '=', 'DPK' as never).where('object_id' as never, '=', packageId as never)
          .orderBy('object_version' as never, 'desc').limit(1).executeTakeFirst()) as { purpose_scope: string | null } | undefined;
        assertPurpose(purpose, dpk?.purpose_scope ?? null, 'package', correlationId);
      }
    }
    const versions = (await cap.readVersions().selectAll().where('package_id' as never, '=', packageId as never).orderBy('version' as never).execute()) as Array<Record<string, unknown>>;
    const options = (await cap.readOptions().selectAll().where('package_id' as never, '=', packageId as never).orderBy('key' as never).execute()) as Array<Record<string, unknown>>;
    const dissent = (await cap.readDissent().selectAll().where('package_id' as never, '=', packageId as never).orderBy('recorded_at' as never).execute()) as Array<Record<string, unknown>>;
    const events = (await cap.readEvents().selectAll().where('package_id' as never, '=', packageId as never).orderBy('occurred_at' as never).execute()) as Array<Record<string, unknown>>;
    const dec = (await cap.readStrategy().selectAll().where('strategy_object_id' as never, '=', String(p['decision_object_id']) as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    const approvals = (await cap.readApprovals().selectAll().where('package_id' as never, '=', packageId as never).orderBy('recorded_at' as never).execute()) as Array<Record<string, unknown>>;
    const commitment = (await cap.readCommitments().selectAll().where('package_id' as never, '=', packageId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    const live = new Set<string>();
    for (const v of versions) {
      if (!['proposed', 'under_review', 'approved', 'committed'].includes(String(v['state']))) continue;
      for (const a of await cap.liveApprovals({ packageId, version: Number(v['version']) })) live.add(a.approval_id);
    }
    return {
      ...p, decision: dec ?? null,
      versions: versions.map((v) => ({
        ...v, observed_through: dayOf(v['observed_through']),
        options: options.filter((o) => Number(o['version']) === Number(v['version'])),
        dissent: dissent.filter((d) => Number(d['version']) === Number(v['version'])),
        approvals: approvals.filter((a) => Number(a['version']) === Number(v['version'])).map((a) => ({
          ...a,
          /* The port's own recount: decision, revocation, expiry, digest AND the approver's eligibility now. */
          live: live.has(String(a['approval_id'])),
        })),
      })),
      commitment: commitment ?? null,
      events,
    };
  }
}
