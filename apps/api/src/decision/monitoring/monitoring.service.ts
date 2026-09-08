/**
 * MONITORING AND OUTCOMES — Phase 6 (L9), stage P6-M5.
 *
 * The committed version's conditions are evaluated against what was recorded after
 * the decision (the port does it, once per breach); an outcome is a human's OUT for
 * one criterion of the approved choice, citing an admitted observed twin element and,
 * where the chosen option was simulated, the reconciliation of the chosen run's
 * simulated element against it; closure records the lessons as text.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { canonicalHeaderDigest, errorBody, validateHeader, type CanonicalHeader } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import type { ScopeContext } from '../../shared/scope.js';
import type { CloseWrites, DecisionReads, MonitorWrites, OutcomeWrites } from '../decision.capabilities.js';

const bad = (correlationId: string, msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface OutcomeIntake { criterionKey: string; twinId: string; twinVersion: number; elementKey: string; reconciliationId: string | null; note: string | null }
export function validateOutcomeIntake(m: Partial<OutcomeIntake>, correlationId: string): OutcomeIntake {
  if (typeof m.criterionKey !== 'string' || m.criterionKey.trim().length === 0) bad(correlationId, 'criterionKey names one of the approved choice\'s outcome criteria');
  if (typeof m.twinId !== 'string' || !UUID.test(m.twinId)) bad(correlationId, 'twinId must be a twin id');
  if (!Number.isInteger(m.twinVersion) || (m.twinVersion as number) < 1) bad(correlationId, 'twinVersion must be a positive integer');
  if (typeof m.elementKey !== 'string' || m.elementKey.trim().length === 0) bad(correlationId, 'elementKey names the observed element');
  if (m.reconciliationId !== undefined && m.reconciliationId !== null && (typeof m.reconciliationId !== 'string' || !UUID.test(m.reconciliationId))) bad(correlationId, 'reconciliationId must be a reconciliation id');
  return { criterionKey: m.criterionKey as string, twinId: m.twinId as string, twinVersion: m.twinVersion as number, elementKey: m.elementKey as string, reconciliationId: m.reconciliationId ?? null, note: typeof m.note === 'string' ? m.note : null };
}

@Injectable()
export class MonitoringService {
  async evaluate(cap: MonitorWrites, ctx: ScopeContext, packageId: string, actor: string, correlationId: string) {
    return cap.evaluateConditions({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, actor, correlationId });
  }

  async recordOutcome(cap: OutcomeWrites, ctx: ScopeContext, packageId: string, intake: OutcomeIntake, actor: string, purposeId: string, correlationId: string, outcomeId: string = newId()) {
    const p = (await cap.readPackages().selectAll().where('package_id' as never, '=', packageId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (p === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized package matches'), 404);
    if (!['committed', 'monitoring'].includes(String(p['state']))) throw new HttpException(errorBody('EYE_STA_001', correlationId, `package is ${String(p['state'])}; outcomes are recorded on a committed decision`), 409);
    const version = Number(p['committed_version']);
    const v = (await cap.readVersions().selectAll().where('package_id' as never, '=', packageId as never).where('version' as never, '=', version as never).executeTakeFirst()) as Record<string, unknown>;
    const commitment = (await cap.readCommitments().selectAll().where('package_id' as never, '=', packageId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (commitment === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'the package has no commitment'), 409);
    const choice = v['choice'] as Record<string, unknown>;
    const criterion = (choice['outcome_criteria'] as Array<Record<string, unknown>>).find((k) => k['key'] === intake.criterionKey);
    if (criterion === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `${intake.criterionKey} is not an outcome criterion of the approved choice`), 404);
    const element = (await cap.readElements().selectAll().where('twin_id' as never, '=', intake.twinId as never).where('version' as never, '=', intake.twinVersion as never).where('key' as never, '=', intake.elementKey as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    if (element === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, `no element ${intake.elementKey} in twin ${intake.twinId}@${intake.twinVersion}`), 404);
    const value = element['value'];
    const target = Number(criterion['target']);
    const cmp = String(criterion['comparator']);
    const met = typeof value === 'number' ? (cmp === '<=' ? value <= target : cmp === '>=' ? value >= target : cmp === '=' ? value === target : cmp === '<' ? value < target : value > target) : null;
    const rec = intake.reconciliationId === null ? undefined : (await cap.readReconciliations().selectAll().where('reconciliation_id' as never, '=', intake.reconciliationId as never).executeTakeFirst()) as Record<string, unknown> | undefined;
    const title = `Outcome: ${String(criterion['quantity'])} — ${String(value)} ${String(criterion['unit'])} (target ${cmp} ${target}${met === null ? '' : met ? ', met' : ', not met'})`;
    const statement = `${String(criterion['quantity'])} observed as ${String(value)} ${String(criterion['unit'])} on twin ${intake.twinId} version ${intake.twinVersion} element ${intake.elementKey}; the approved choice ${String(choice['option_key'])} targeted ${cmp} ${target} ${String(criterion['unit'])} by ${String(criterion['by'])}.${intake.note === null ? '' : ` ${intake.note}`}`;
    const now = new Date().toISOString();
    const payload = {
      strategy_kind: 'outcome', title, statement, status: 'active', horizon: String(criterion['by']), owner: `principal:${actor}`, parent_objective_id: null,
      verification: { state: 'not_applicable', reason: null, at: null },
      rests_on: [
        { kind: 'strategy', id: String(commitment['commitment_id']), rationale: `the outcome of commitment ${String(commitment['commitment_id'])} on criterion ${intake.criterionKey}` },
        { kind: 'strategy', id: String(p['decision_object_id']), rationale: 'the decision the outcome closes the loop on' },
      ],
      metrics: { package_id: packageId, package_version: version, criterion, observed_value: value, met, observed_on: { twin_id: intake.twinId, version: intake.twinVersion, key: intake.elementKey },
                 reconciliation: rec === undefined ? null : { reconciliation_id: String(rec['reconciliation_id']), from_version: rec['from_version'], against_version: rec['against_version'], from_value: rec['from_value'], against_value: rec['against_value'], difference: rec['difference'] } },
    };
    const header: CanonicalHeader = {
      object_id: outcomeId, object_type: 'OUT', tenant_id: ctx.tenantId, domain_id: ctx.domainId, scope: 'DOMAIN', object_version: '1', lifecycle_state: 'active',
      owning_component: 'CP-DEC-01', accountable_owner: `principal:${actor}`,
      source_object_ids: [`DPK:${packageId}@${version}`, `CMT:${String(commitment['commitment_id'])}@1`, `TWN:${intake.twinId}@${intake.twinVersion}`],
      event_time: typeof criterion['by'] === 'string' ? `${String(criterion['by']).slice(0, 10)}T00:00:00.000Z` : null, observation_time: now, valid_from: null, valid_to: null, recorded_at: now,
      time_precision: 'day', source_clock_quality: 'trusted', truth_state: 'observed', synthetic_state: element['synthetic_state'] === true, confidence: null, uncertainty: null,
      evidence_refs: ((element['citations'] as Array<{ kind: string; id: string; version?: number }>) ?? []).filter((c) => c.kind === 'evidence').map((c) => `EVD:${c.id}@${c.version ?? 1}`),
      provenance_ref: `principal:${actor}`, method_ref: 'decision-outcome@1.0.0', contradiction_refs: [], corroboration_refs: [], human_refs: [`principal:${actor}`],
      classification: 'internal', purpose_scope: purposeId, rights_profile: null, residency_profile: null, retention_profile: null, access_policy_ref: null,
      quality_profile: null, quality_state: { met, reconciled: rec !== undefined }, freshness_state: null, schema_ref: 'OUT@v1', ontology_ref: null,
      correction_of: null, supersedes: null, withdrawal_reason: null, audit_correlation_id: correlationId, content_ref: null,
    };
    const check = validateHeader(header);
    if (!check.ok) bad(correlationId, `outcome header invalid: ${(check.errors ?? []).join('; ')}`);
    const headerDigest = canonicalHeaderDigest(header, payload);
    await cap.admitObject(header, payload, headerDigest);
    const r = await cap.recordOutcome({ outcomeId, tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, criterionKey: intake.criterionKey, twinId: intake.twinId, twinVersion: intake.twinVersion,
      elementKey: intake.elementKey, reconciliationId: intake.reconciliationId, title, statement, headerDigest, actor, eventId: newId(), correlationId });
    return { outcomeId, packageId, version, criterionKey: intake.criterionKey, met: r.met, observedValue: r.observed_value, target: r.target, comparator: r.comparator, simulated: r.simulated, reconciliationId: r.reconciliation_id, title };
  }

  async close(cap: CloseWrites, ctx: ScopeContext, packageId: string, lessons: string, actor: string, correlationId: string) {
    if (typeof lessons !== 'string' || lessons.trim().length < 8) bad(correlationId, 'lessons are recorded as text, at least eight characters');
    const r = await cap.closePackage({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, lessons, actor, eventId: newId(), correlationId });
    return { packageId, state: r.state, outcomesRecorded: Number(r.outcomes_recorded), criteria: Number(r.criteria) };
  }

  async outcomes(cap: DecisionReads, packageId: string) {
    const outcomes = (await cap.readOutcomes().selectAll().where('package_id' as never, '=', packageId as never).orderBy('recorded_at' as never).execute()) as Array<Record<string, unknown>>;
    const breaches = (await cap.readBreaches().selectAll().where('package_id' as never, '=', packageId as never).orderBy('detected_at' as never).execute()) as Array<Record<string, unknown>>;
    return { outcomes, breaches };
  }
}
