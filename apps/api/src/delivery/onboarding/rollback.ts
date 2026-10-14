/**
 * B94 §ON (0114_b94_x_on) — THE PURE PART of the onboarding programme and the configuration baseline manager: the closed step list with the
 * governed act that realizes each step and the act that COMPENSATES it (PR-67-001 — reversible onboarding), the drift change type, and the
 * ROLLBACK PLAN: for each drifted pointer, the governed act that restores it (CAP-DL-05 "rollback evidence"). The plan is a READ — nothing here
 * writes; every restoring act runs through its own governed route, by the role that route names, and the next drift observation shows whether
 * it restored the pointer. The role census is counts only: the plan names the role and the delta, never a person.
 *
 * CONSTRUCTION only: a plan shown on the page or used in the act demonstrates the software; it restores nothing by itself.
 */

/** The step keys, in the order of JRN-01 then JRN-23 (the SQL's onboarding.step_keys()). */
export const STEP_KEYS = ['intent', 'domain', 'authority', 'policy', 'sources', 'packages', 'workflows', 'licence', 'responsibility', 'baseline',
  'mapping', 'rehearsal', 'reconciliation', 'training', 'cutover', 'acceptance'] as const;
export type StepKey = (typeof STEP_KEYS)[number];
export const STEP_STATES = ['planned', 'in_progress', 'done', 'held', 'reverted'] as const;
export type StepState = (typeof STEP_STATES)[number];
export const PROGRAMME_STATES = ['planned', 'in_progress', 'held', 'accepted', 'withdrawn'] as const;
export const PROFILES = ['local-dev', 'saas', 'private-cloud', 'on-premise'] as const;

/** The record kinds a step key admits (the SQL's onboarding.step_realization_kinds — the port is the authority; this mirrors it for the page). */
export const REALIZATION_KINDS: Record<StepKey, readonly string[]> = {
  intent: ['sponsor_intent'], domain: ['domain'], authority: ['principal', 'role_binding'], policy: ['attention_policy', 'analytics_purpose'],
  sources: ['source_contract'], packages: ['package_version'], workflows: ['workflow_definition'], licence: ['licence', 'contract'],
  responsibility: ['responsibility_matrix'], baseline: ['config_baseline'], mapping: ['mapping', 'migration_wave'], rehearsal: ['rehearsal', 'migration_wave'],
  reconciliation: ['reconciliation', 'migration_wave'], training: ['training_path', 'training_record', 'implementation_programme', 'readiness_gate'],
  cutover: ['cutover', 'migration_wave'], acceptance: ['acceptance', 'readiness_gate', 'implementation_programme'],
};

export interface Compensation { action: string; description: string }
/**
 * The DEFAULT realizing act and compensating act per step — what the page proposes and the act records (the lead may name another; the port
 * requires one before `done`). A compensation names a governed act that EXISTS; where none exists the description says what reverses the step
 * and what is missing.
 */
export const STEP_DEFAULTS: Record<StepKey, { realizes: string; compensation: Compensation }> = {
  intent: { realizes: 'onboarding.intent.record', compensation: { action: 'onboarding.intent.record', description: 'the sponsor records a revised intent (a new version supersedes; nothing is deleted)' } },
  domain: { realizes: 'tenancy.domain.draft', compensation: { action: 'onboarding.programme.withdraw', description: 'the draft domain is never activated: withdrawing the programme leaves it draft (no domain-retirement port exists)' } },
  authority: { realizes: 'identity.principal.create', compensation: { action: 'identity.credential.revoke', description: 'the principal provisioned for the onboarding is revoked by the tenant administrator' } },
  policy: { realizes: 'executive.attention.policy.publish', compensation: { action: 'executive.attention.policy.publish', description: 'the prior attention policy rules are published again as the next version' } },
  sources: { realizes: 'observation.source.approve', compensation: { action: 'observation.source.transition', description: 'the source contract is suspended or retired by its collection manager' } },
  packages: { realizes: 'domain.package.activate', compensation: { action: 'domain.package.retire', description: 'the package is retired by its owner (its versions are kept)' } },
  workflows: { realizes: 'executive.workflow.define', compensation: { action: 'executive.workflow.define', description: 'the prior workflow definition is published again as the next version' } },
  licence: { realizes: 'commercial.licence.issue', compensation: { action: 'commercial.licence.issue', description: 'the vendor re-issues the prior licence terms as the next version (a vendor act the customer requests)' } },
  responsibility: { realizes: 'service.matrix.decide', compensation: { action: 'service.matrix.decide', description: 'a superseding responsibility matrix version is proposed and approved (a change is a new version)' } },
  baseline: { realizes: 'onboarding.baseline.decide', compensation: { action: 'onboarding.baseline.decide', description: 'a promoted baseline version is approved in its place (the prior version stays on record)' } },
  mapping: { realizes: 'onboarding.mapping.decide', compensation: { action: 'onboarding.mapping.decide', description: 'a corrected mapping version is approved in its place' } },
  rehearsal: { realizes: 'onboarding.rehearsal.run', compensation: { action: 'onboarding.rehearsal.run', description: 'a new rehearsal over the corrected mapping or file supersedes it' } },
  reconciliation: { realizes: 'onboarding.rehearsal.run', compensation: { action: 'onboarding.rehearsal.run', description: 'the reconciliation of a new rehearsal supersedes it' } },
  training: { realizes: 'implementation.training.record', compensation: { action: 'implementation.training.record', description: 'a superseding training record is recorded (records are never deleted)' } },
  cutover: { realizes: 'onboarding.cutover.execute', compensation: { action: 'onboarding.rollback.execute', description: 'the migrated records are withdrawn append-only and the activation re-recorded (the governed rollback)' } },
  acceptance: { realizes: 'onboarding.acceptance.record', compensation: { action: 'onboarding.acceptance.record', description: 'acceptance is withheld by a superseding record; the domain keeps its prior safe operation' } },
};

export type DriftSection = 'attention_policy' | 'analytics_purposes' | 'packages' | 'workflow_definitions' | 'source_contracts' | 'role_census' | 'licence';
export interface DriftChange { section: DriftSection | string; key: string | null; change: 'added' | 'removed' | 'changed'; baseline: unknown; observed: unknown }
export interface RollbackStep {
  section: string; key: string | null; change: DriftChange['change'];
  /** the governed act that restores the pointer (its own route; never performed by the plan) */
  action: string;
  /** who performs it */
  role: string;
  /** what it restores, in words */
  restores: string;
  /** a restoring act that no route offers today — said, never hidden */
  gap: string | null;
}

const fmt = (v: unknown): string => (v === null || v === undefined ? 'nothing' : typeof v === 'object' ? JSON.stringify(v) : String(v));
const ver = (v: unknown): string => {
  if (v !== null && typeof v === 'object' && 'version' in (v as Record<string, unknown>)) return `v${String((v as Record<string, unknown>)['version'])}`;
  return fmt(v);
};

/** The restoring act of ONE drifted pointer. */
export function restoringAct(c: DriftChange): RollbackStep {
  const base = { section: c.section, key: c.key, change: c.change, gap: null as string | null };
  const k = c.key ?? '';
  switch (c.section) {
    case 'attention_policy':
      return { ...base, action: 'executive.attention.policy.publish', role: 'domain_admin',
               restores: c.baseline === null ? 'the domain had no attention policy at the baseline: none can be unpublished — the next version restates the baseline\'s intent'
                 : `publish the rules of attention policy ${ver(c.baseline)} again as the next version (the observed ${ver(c.observed)} stays on record)`,
               gap: c.baseline === null ? 'no port retires an attention policy' : null };
    case 'analytics_purposes':
      if (c.change === 'added') return { ...base, action: 'analytics.purpose.retire', role: 'privacy_officer', restores: `retire purpose ${k} (approved after the baseline)` };
      return { ...base, action: 'analytics.purpose.propose → analytics.purpose.decide', role: 'product_analyst → privacy_officer',
               restores: `propose and approve purpose ${k} at version ${fmt(c.baseline)}'s content again (the observed ${fmt(c.observed)} stays on record)` };
    case 'packages':
      if (c.change === 'added') return { ...base, action: 'domain.package.retire', role: 'domain_admin', restores: `retire package ${k} (activated after the baseline)` };
      return { ...base, action: 'domain.package.activate', role: 'domain_admin',
               restores: `activate package ${k} at ${ver(c.baseline)} again (a retained version, or the same manifest proposed and certified anew)` };
    case 'workflow_definitions':
      if (c.change === 'added') return { ...base, action: 'executive.workflow.define', role: 'domain_admin', restores: `definition ${k} was published after the baseline: no port retires a definition — its use is stopped by the next definition`, gap: 'no port retires a workflow definition' };
      return { ...base, action: 'executive.workflow.define', role: 'domain_admin', restores: `publish definition ${k} v${fmt(c.baseline)}'s spec again as the next version (definitions are append-only)` };
    case 'source_contracts':
      if (c.change === 'added') return { ...base, action: 'observation.source.transition', role: 'collection_manager', restores: `suspend or retire source ${k} (activated after the baseline)` };
      return { ...base, action: 'observation.source.transition', role: 'collection_manager', restores: `activate source ${k} at contract v${fmt(c.baseline)} again (the observed v${fmt(c.observed)} suspended)` };
    case 'role_census': {
      const b = Number(c.baseline ?? 0); const o = Number(c.observed ?? 0);
      if (o > b) return { ...base, action: 'identity.credential.revoke', role: 'tenant_admin',
                          restores: `${o - b} more holder(s) of ${k} than the baseline's ${b}: the tenant administrator reviews them; a principal provisioned beyond the baseline is revoked`,
                          gap: 'no port revokes a single role binding; revocation is per principal' };
      return { ...base, action: 'identity.principal.create', role: 'tenant_admin', restores: `${b - o} fewer holder(s) of ${k} than the baseline's ${b}: the tenant administrator provisions the role again` };
    }
    case 'licence':
      return { ...base, action: 'commercial.licence.issue', role: 'commercial_authority',
               restores: `the vendor re-issues the terms of licence ${ver(c.baseline)} as the next version (a vendor act; the customer requests it)` };
    default:
      return { ...base, action: 'none', role: 'none', restores: `no restoring act is known for section ${c.section}`, gap: `section ${c.section} has no governed restoring act` };
  }
}

/** THE ROLLBACK PLAN: one restoring act per drifted pointer, in the drift's order. Empty when the domain is in line. */
export function rollbackPlan(changes: readonly DriftChange[]): RollbackStep[] {
  return changes.map(restoringAct);
}

/** The step graph's next legal moves (the page disables what the port would refuse, with the reason). */
export function stepMoves(state: StepState, programmeState: string): Array<{ to: string; allowed: boolean; reason: string | null }> {
  const closed = programmeState === 'withdrawn' || programmeState === 'accepted';
  const held = programmeState === 'held';
  const why = closed ? `the programme is ${programmeState}` : null;
  return [
    { to: 'in_progress', allowed: !closed && !held && state !== 'done', reason: why ?? (held ? 'the programme is held' : state === 'done' ? 'a done step changes only by its revert' : null) },
    { to: 'done', allowed: !closed && !held && state !== 'done', reason: why ?? (held ? 'the programme is held' : state === 'done' ? 'already done' : null) },
    { to: 'held', allowed: !closed && (state === 'planned' || state === 'in_progress'), reason: why ?? (state === 'planned' || state === 'in_progress' ? null : `a ${state} step is not held`) },
    { to: 'reverted', allowed: !closed && state === 'done', reason: why ?? (state === 'done' ? null : 'only a done step is reverted') },
  ];
}
