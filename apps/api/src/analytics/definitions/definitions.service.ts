/**
 * B92 §MD (0113_b92_x_md) — THE DEFINITIONS SERVICE: the governed register of product-metric PURPOSES (approved by a named privacy officer),
 * SCOPES ("the corridor", approved by a named product analytics owner), DEFINITIONS (the App M contract, proposed by a named human analyst or
 * owner — never an agent — and approved at the digest seen by a named product analytics owner who did not propose it), the USES of results
 * (ES-40-008: an indeterminate result is cited in a briefing or publication only qualified) and of B90 metric SERVINGS (DP-44-005: a withdrawal
 * lists them), and the reads: the catalog (CAP-DL-11), a definition's versions with their field-level diff, its results by period, its uses.
 * Every rule is the port's; a refusal is the port's text in the class form `<noun> rejected (<class>): …`.
 *
 * CLAIMS: software capability, proven on SYNTHETIC harness rows; a synthetic demonstration (NORDWERK) never closes a clause that needs the real
 * integration; the signed acceptance of the catalog (PR-70-006 / AT-70) is R2's.
 */
import { Injectable } from '@nestjs/common';
import type { Envelope } from '@eye/contracts';
import type { AuthenticatedPrincipal } from '../../shared/auth-types.js';
import { newId } from '../../shared/ids.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import { DefinitionsCapability, type DefinitionReads, type DefinitionWrites } from './definitions.capabilities.js';
import { refuseAnalytics } from '../seams.js';

type Row = Record<string, unknown>;
export const ANALYTICS_READ = 'analytics.read';
export const BOUNDARY_MD = 'the metric catalog (B92 §MD): humans approve definitions, scopes and purposes; no person-grained metric; an indeterminate result is cited only qualified. Signed acceptance → R2; a synthetic demonstration never closes a clause that needs the real integration.';
export const CATALOG_NOTE = 'products.catalogue_asset (B90) admits no governed-analytics-definition kind and is a data steward\'s own act: a definition is not catalogued by its approval; a steward may catalogue it as kind external, ref analytics:<metric_key>, and the entry is shown here.';

@Injectable()
export class AnalyticsDefinitionsService {
  constructor(private readonly pipeline: PipelineService) {}

  route(tenantId: string, domainId: string, action: string, objectType: string | null, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  derive(base: Envelope, action: string, objectType: string | null, objectId: string | null): Envelope {
    return { ...base, action, object_type: objectType, object_id: objectId, side_effect_class: action.endsWith('.read') ? 'none' : 'reversible', message_id: newId() } as Envelope;
  }
  read<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, objectType: string | null, objectId: string | null, fn: (cap: DefinitionReads) => Promise<T>) {
    return this.pipeline.consequentialRead(this.derive(env, ANALYTICS_READ, objectType, objectId), p, this.route(t, d, ANALYTICS_READ, objectType, objectId), DefinitionsCapability.read, async (cap) => fn(cap));
  }
  write<T>(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, action: string, objectType: string | null, objectId: string | null,
           fn: (cap: DefinitionWrites) => Promise<{ result: T; targetType?: string | null; targetId?: string | null; targetVersion?: string | null }>) {
    return this.pipeline.write(this.derive(env, action, objectType, objectId), p, this.route(t, d, action, objectType, objectId), DefinitionsCapability.write,
      async (cap) => { const r = await fn(cap); return { result: r.result, targetType: r.targetType ?? objectType, targetId: r.targetId ?? objectId, targetVersion: r.targetVersion ?? null, outboxEvent: null }; });
  }
  static receipt(o: { policyDecisionId: string; auditSeq: number }) { return { policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq }; }

  // ───────────────────────── MD1 purposes ─────────────────────────
  async purposes(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.read(env, p, t, d, 'APU', null, async (cap) => ({ purposes: await cap.purposes(), read_at: await cap.now() }));
    return { ...out.result, boundary: BOUNDARY_MD, receipt: AnalyticsDefinitionsService.receipt(out) };
  }
  async proposePurpose(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { key: string; title: string; kind: string; description: string; retentionDays: number }) {
    const purposeId = newId();
    const out = await this.write(env, p, t, d, 'analytics.purpose.propose', 'APU', purposeId, async (cap) => ({
      result: await cap.proposePurpose({ purposeId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { purpose: out.result, receipt: AnalyticsDefinitionsService.receipt(out) };
  }
  async decidePurpose(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, purposeId: string, b: { decision: string; digest: string; reason: string }) {
    const out = await this.write(env, p, t, d, 'analytics.purpose.decide', 'APU', purposeId, async (cap) => ({
      result: await cap.decidePurpose({ purposeId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { purpose: out.result, receipt: AnalyticsDefinitionsService.receipt(out) };
  }
  async retirePurpose(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, purposeId: string, reason: string) {
    const out = await this.write(env, p, t, d, 'analytics.purpose.retire', 'APU', purposeId, async (cap) => ({
      result: await cap.retirePurpose({ purposeId, tenantId: t, domainId: d, reason, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { purpose: out.result, receipt: AnalyticsDefinitionsService.receipt(out) };
  }

  // ───────────────────────── MD2 scopes ─────────────────────────
  async scopes(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.read(env, p, t, d, 'ASC', null, async (cap) => ({ scopes: await cap.scopes(), read_at: await cap.now() }));
    return { ...out.result, receipt: AnalyticsDefinitionsService.receipt(out) };
  }
  async proposeScope(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { key: string; title: string; entityIds: string[]; objectiveIds: string[]; seriesKeys: string[]; geographies: string[]; description: string }) {
    const scopeId = newId();
    const out = await this.write(env, p, t, d, 'analytics.scope.propose', 'ASC', scopeId, async (cap) => ({
      result: await cap.proposeScope({ scopeId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { scope: out.result, receipt: AnalyticsDefinitionsService.receipt(out) };
  }
  async decideScope(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, scopeId: string, b: { decision: string; digest: string; reason: string }) {
    const out = await this.write(env, p, t, d, 'analytics.scope.decide', 'ASC', scopeId, async (cap) => ({
      result: await cap.decideScope({ scopeId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { scope: out.result, receipt: AnalyticsDefinitionsService.receipt(out) };
  }
  async retireScope(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, scopeId: string, reason: string) {
    const out = await this.write(env, p, t, d, 'analytics.scope.retire', 'ASC', scopeId, async (cap) => ({
      result: await cap.retireScope({ scopeId, tenantId: t, domainId: d, reason, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { scope: out.result, receipt: AnalyticsDefinitionsService.receipt(out) };
  }

  // ───────────────────────── MD3 definitions ─────────────────────────
  async definitions(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.read(env, p, t, d, 'AMD', null, async (cap) => ({ definitions: await cap.definitions(), computations: await cap.computations(), owner_roles: await cap.ownerRoleMap(), read_at: await cap.now() }));
    return { ...out.result, boundary: BOUNDARY_MD, receipt: AnalyticsDefinitionsService.receipt(out) };
  }
  /** One metric key as the catalog's contract card shows it: every version (the contract, its state, who proposed and decided it), the diff
   *  between the latest two versions, its results (newest first; every state), its uses, its ledger and its routed items. */
  async definition(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, metricKey: string) {
    const out = await this.read(env, p, t, d, 'AMD', null, async (cap) => {
      const versions = await cap.versions(metricKey);
      if (versions.length === 0) return null;
      const ids = versions.map((v) => String(v['definition_id']));
      const diff = versions.length >= 2 ? await cap.diff(String(versions[1]!['definition_id']), String(versions[0]!['definition_id'])) : null;
      return { metric_key: metricKey, versions, diff, results: await cap.results(metricKey, 200), uses: await cap.uses({ metricKey, resultId: null, limit: 200 }),
               ledger: await cap.ledger(ids, 200), items: await cap.items(ids), read_at: await cap.now() };
    });
    if (out.result === null) throw refuseAnalytics('metric definition', 'unknown_metric', `${metricKey} has no definition in this domain`, env.correlation_id, 404);
    return { ...out.result, boundary: BOUNDARY_MD, receipt: AnalyticsDefinitionsService.receipt(out) };
  }
  async diff(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, from: string, to: string) {
    const out = await this.read(env, p, t, d, 'AMD', to, async (cap) => ({ diff: await cap.diff(from, to), read_at: await cap.now() }));
    if (out.result.diff === null) throw refuseAnalytics('metric definition', 'unknown_definition', 'both versions are definitions of this domain', env.correlation_id, 404);
    return { ...out.result, receipt: AnalyticsDefinitionsService.receipt(out) };
  }
  async proposeDefinition(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, contract: Row) {
    const definitionId = newId();
    const out = await this.write(env, p, t, d, 'analytics.definition.propose', 'AMD', definitionId, async (cap) => ({
      result: await cap.proposeDefinition({ definitionId, tenantId: t, domainId: d, contract, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { definition: out.result, receipt: AnalyticsDefinitionsService.receipt(out) };
  }
  async decideDefinition(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, definitionId: string, b: { decision: string; digest: string; reason: string }) {
    const out = await this.write(env, p, t, d, 'analytics.definition.decide', 'AMD', definitionId, async (cap) => ({
      result: await cap.decideDefinition({ definitionId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { definition: out.result, receipt: AnalyticsDefinitionsService.receipt(out) };
  }
  async retireDefinition(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, definitionId: string, reason: string) {
    const out = await this.write(env, p, t, d, 'analytics.definition.retire', 'AMD', definitionId, async (cap) => ({
      result: await cap.retireDefinition({ definitionId, tenantId: t, domainId: d, reason, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { definition: out.result, receipt: AnalyticsDefinitionsService.receipt(out) };
  }

  // ───────────────────────── MD4 uses, MD5 serving uses ─────────────────────────
  async recordUse(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { resultId: string; kind: string; usedInId: string; note: string | null; qualified: boolean }) {
    const useId = newId();
    const out = await this.write(env, p, t, d, 'analytics.use.record', 'AMU', useId, async (cap) => ({
      result: await cap.recordUse({ useId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }),
    }));
    return { use: out.result, receipt: AnalyticsDefinitionsService.receipt(out) };
  }
  async uses(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, q: { metricKey: string | null; resultId: string | null; limit: number }) {
    const out = await this.read(env, p, t, d, 'AMU', null, async (cap) => ({ uses: await cap.uses(q), read_at: await cap.now() }));
    return { ...out.result, receipt: AnalyticsDefinitionsService.receipt(out) };
  }
  async recordServingUse(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, b: { servingId: string; kind: string; usedInId: string; note: string | null }) {
    const useId = newId();
    const out = await this.write(env, p, t, d, 'products.metric.use', 'MET', b.servingId, async (cap) => ({
      result: await cap.recordServingUse({ useId, tenantId: t, domainId: d, ...b, actor: p.principalId, correlationId: env.correlation_id }), targetId: useId,
    }));
    return { use: out.result, receipt: AnalyticsDefinitionsService.receipt(out) };
  }
  async servingUses(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string, q: { modelId: string | null; servingId: string | null; limit: number }) {
    const out = await this.read(env, p, t, d, 'MET', null, async (cap) => ({ uses: await cap.servingUses(q), read_at: await cap.now() }));
    return { ...out.result, receipt: AnalyticsDefinitionsService.receipt(out) };
  }

  // ───────────────────────── the catalog (CAP-DL-11) ─────────────────────────
  async catalog(env: Envelope, p: AuthenticatedPrincipal, t: string, d: string) {
    const out = await this.read(env, p, t, d, 'AMD', null, async (cap) => ({ catalog: await cap.catalog(), read_at: await cap.now() }));
    return { ...out.result, service: { name: 'Product analytics and economics service (CAP-DL-11)', owner_role: 'product_analytics_owner', owner_role_note: 'CAP-DL-11 names a Chief Product Officer; this product maps it to the domain role product_analytics_owner' },
             catalog_note: CATALOG_NOTE, boundary: BOUNDARY_MD, receipt: AnalyticsDefinitionsService.receipt(out) };
  }
}
