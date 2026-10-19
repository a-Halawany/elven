/**
 * B92 §MD (0113_b92_x_md) — THE DEFINITIONS CAPABILITIES: thin bindings to the SECURITY DEFINER ports (purposes, scopes, definitions, uses, the
 * B90 serving uses — each asserts the route's own action, the scope and the acting principal) and the reads (plain selects and INVOKER
 * functions under the caller's RLS — N-01). Nothing here decides a rule a port decides.
 */
import { sql } from 'kysely';
import type { Tx } from '../../shared/db.js';
import { REGISTRY_ROW } from '../computation-versions.js';

type Row = Record<string, unknown>;
const j = (v: unknown) => JSON.stringify(v ?? null);

export interface DefinitionReads {
  readonly action: string; readonly tx: Tx;
  now(): Promise<string>;
  purposes(): Promise<Row[]>;
  scopes(): Promise<Row[]>;
  definitions(): Promise<Row[]>;
  versions(metricKey: string): Promise<Row[]>;
  definition(definitionId: string): Promise<Row | null>;
  diff(from: string, to: string): Promise<Row | null>;
  results(metricKey: string, limit: number): Promise<Row[]>;
  uses(q: { metricKey: string | null; resultId: string | null; limit: number }): Promise<Row[]>;
  servingUses(q: { modelId: string | null; servingId: string | null; limit: number }): Promise<Row[]>;
  ledger(subjectIds: string[], limit: number): Promise<Row[]>;
  items(subjectIds: string[]): Promise<Row[]>;
  catalog(): Promise<Row[]>;
  computations(): Promise<Row[]>;
  ownerRoleMap(): Promise<Row>;
}
export interface DefinitionWrites extends DefinitionReads {
  proposePurpose(a: { purposeId: string; tenantId: string; domainId: string; key: string; title: string; kind: string; description: string; retentionDays: number; actor: string; correlationId: string }): Promise<Row>;
  decidePurpose(a: { purposeId: string; tenantId: string; domainId: string; decision: string; digest: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  retirePurpose(a: { purposeId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  proposeScope(a: { scopeId: string; tenantId: string; domainId: string; key: string; title: string; entityIds: string[]; objectiveIds: string[]; seriesKeys: string[]; geographies: string[]; description: string; actor: string; correlationId: string }): Promise<Row>;
  decideScope(a: { scopeId: string; tenantId: string; domainId: string; decision: string; digest: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  retireScope(a: { scopeId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  proposeDefinition(a: { definitionId: string; tenantId: string; domainId: string; contract: Row; actor: string; correlationId: string }): Promise<Row>;
  decideDefinition(a: { definitionId: string; tenantId: string; domainId: string; decision: string; digest: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  retireDefinition(a: { definitionId: string; tenantId: string; domainId: string; reason: string; actor: string; correlationId: string }): Promise<Row>;
  recordUse(a: { useId: string; tenantId: string; domainId: string; resultId: string; kind: string; usedInId: string; note: string | null; qualified: boolean; actor: string; correlationId: string }): Promise<Row>;
  recordServingUse(a: { useId: string; tenantId: string; domainId: string; servingId: string; kind: string; usedInId: string; note: string | null; actor: string; correlationId: string }): Promise<Row>;
}

const NAME = (col: string) => sql.raw(`(select p.display_name from identity.principals p where p.id = ${col})`);

class DefinitionsCapabilityImpl implements DefinitionWrites {
  constructor(readonly tx: Tx, readonly action: string) {}
  private async rows<T = Row>(q: ReturnType<typeof sql>): Promise<T[]> { return (await q.execute(this.tx)).rows as T[]; }
  private async one(q: ReturnType<typeof sql>, what: string): Promise<Row> {
    const row = ((await q.execute(this.tx)).rows as Array<{ r: Row | null }>)[0]?.r;
    if (row === undefined || row === null) throw new Error(`${what} returned no row`);
    return row;
  }
  async now(): Promise<string> { const r = await sql<{ now: Date }>`select clock_timestamp() as now`.execute(this.tx); return (r.rows[0]?.now ?? new Date()).toISOString(); }

  /* ───────────── reads ───────────── */
  async purposes(): Promise<Row[]> {
    return this.rows(sql`select x.purpose_id::text, x.purpose_key, x.version, x.title, x.purpose_kind, x.description, x.retention_days, x.state, x.digest, x.proposed_by::text, x.proposed_at,
        x.decided_by::text, x.decided_at, x.decision_reason, x.retired_at, x.retire_reason, ${NAME('x.proposed_by')} as proposed_by_name, ${NAME('x.decided_by')} as decided_by_name,
        (select count(*)::int from analytics.metric_definitions d where d.purpose_key = x.purpose_key and d.tenant_id = x.tenant_id and d.domain_id = x.domain_id and d.state in ('proposed', 'approved')) as definitions_naming_it
      from analytics.purposes x order by x.purpose_key, x.version desc`);
  }
  async scopes(): Promise<Row[]> {
    return this.rows(sql`select x.scope_id::text, x.scope_key, x.version, x.title, x.entity_ids, x.objective_ids, x.series_keys, x.geographies, x.description, x.state, x.digest,
        x.proposed_by::text, x.proposed_at, x.decided_by::text, x.decided_at, x.decision_reason, x.retired_at, ${NAME('x.proposed_by')} as proposed_by_name, ${NAME('x.decided_by')} as decided_by_name,
        coalesce((select jsonb_agg(jsonb_build_object('entity_id', e.entity_id, 'name', e.canonical_name, 'type', e.entity_type, 'state', e.lifecycle_state) order by e.canonical_name)
                  from graph.entities_current e where e.entity_id = any (x.entity_ids)), '[]'::jsonb) as entities,
        coalesce((select jsonb_agg(jsonb_build_object('objective_id', s.strategy_object_id, 'title', s.title, 'status', s.status) order by s.title)
                  from graph.strategy_current s where s.strategy_object_id = any (x.objective_ids)), '[]'::jsonb) as objectives,
        (select count(*)::int from analytics.metric_results r where r.scope_id = x.scope_id) as results_under_it
      from analytics.scopes x order by x.scope_key, x.version desc`);
  }
  async definitions(): Promise<Row[]> {
    return this.rows(sql`select l.definition_id::text, l.metric_key, l.version, l.title, l.kind, l.unit, l.direction, l.state, l.supported, l.computation_key, l.purpose_key, l.owner_principal_id::text,
        ${NAME('l.owner_principal_id')} as owner_name, l.cadence, l.floor_n, l.k_min, l.privacy_class, l.dimensions, l.threshold, l.serves, l.digest, l.proposed_at, l.decided_at, l.effective_from,
        ${REGISTRY_ROW('l.computation_key')} as computation,   -- B82-F mt: the computation version that computes it now
        (select a.version from analytics.metric_definitions a where a.tenant_id = l.tenant_id and a.domain_id = l.domain_id and a.metric_key = l.metric_key and a.state = 'approved') as approved_version,
        (select count(*)::int from analytics.metric_definitions a where a.tenant_id = l.tenant_id and a.domain_id = l.domain_id and a.metric_key = l.metric_key) as versions,
        (select jsonb_build_object('result_id', r.result_id, 'period_key', r.period_key, 'scope_key', r.scope_key, 'state', r.state, 'value', r.value, 'n', r.n, 'computed_at', r.computed_at,
                  'definition_version', r.definition_version, 'computation_key', r.computation_key, 'computation_version', r.computation_version)
           from analytics.metric_results r where r.tenant_id = l.tenant_id and r.domain_id = l.domain_id and r.metric_key = l.metric_key and r.replay_of is null and not r.preview
           order by r.computed_at desc limit 1) as latest_result
      from (select distinct on (d.tenant_id, d.domain_id, d.metric_key) d.* from analytics.metric_definitions d order by d.tenant_id, d.domain_id, d.metric_key, d.version desc) l
      order by l.metric_key`);
  }
  async versions(metricKey: string): Promise<Row[]> {
    return this.rows(sql`select to_jsonb(d) || jsonb_build_object('contract', analytics.definition_contract(to_jsonb(d)), 'proposed_by_name', ${NAME('d.proposed_by')}, 'decided_by_name', ${NAME('d.decided_by')},
          'owner_name', ${NAME('d.owner_principal_id')}, 'retired_by_name', ${NAME('d.retired_by')}, 'computation', ${REGISTRY_ROW('d.computation_key')}) as r
      from analytics.metric_definitions d where d.metric_key = ${metricKey} order by d.version desc`).then((rs) => rs.map((x) => (x as { r: Row }).r));
  }
  async definition(definitionId: string): Promise<Row | null> {
    const r = await this.rows<{ r: Row }>(sql`select to_jsonb(d) as r from analytics.metric_definitions d where d.definition_id = ${definitionId}::uuid`);
    return r[0]?.r ?? null;
  }
  async diff(from: string, to: string): Promise<Row | null> {
    const r = await this.rows<{ r: Row | null }>(sql`select analytics.definition_diff(${from}::uuid, ${to}::uuid) as r`);
    return r[0]?.r ?? null;
  }
  async results(metricKey: string, limit: number): Promise<Row[]> {
    return this.rows(sql`select r.result_id::text, r.definition_version, r.preview, r.scope_key, r.scope_version, r.period_key, r.period_kind, r.window_from, r.window_to, r.clock, r.cohort, r.as_of,
        r.state, r.kind, r.unit, r.value, r.numerator, r.denominator, r.n, r.distribution, r.uncertainty, r.reasons, r.threshold_eval, r.computation_key, r.computation_version, r.computation_digest,
        r.source_revision, r.records_count, r.replay_of::text, r.replay_verdict, r.computed_at, r.computed_by_kind,
        (select count(*)::int from analytics.metric_uses u where u.result_id = r.result_id) as uses
      from analytics.metric_results r where r.metric_key = ${metricKey} order by r.computed_at desc limit ${Math.min(Math.max(limit, 1), 500)}`);
  }
  async uses(q: { metricKey: string | null; resultId: string | null; limit: number }): Promise<Row[]> {
    return this.rows(sql`select u.use_id::text, u.result_id::text, u.used_in_kind, u.used_in_id::text, u.note, u.used_by::text, u.used_at, ${NAME('u.used_by')} as used_by_name,
        r.metric_key, r.definition_version, r.period_key, r.scope_key, r.state as result_state, r.value, r.preview, r.computation_key, r.computation_version
      from analytics.metric_uses u join analytics.metric_results r on r.result_id = u.result_id
      where (${q.metricKey}::text is null or r.metric_key = ${q.metricKey}) and (${q.resultId}::uuid is null or u.result_id = ${q.resultId}::uuid)
      order by u.used_at desc limit ${Math.min(Math.max(q.limit, 1), 500)}`);
  }
  async servingUses(q: { modelId: string | null; servingId: string | null; limit: number }): Promise<Row[]> {
    return this.rows(sql`select u.use_id::text, u.serving_id::text, u.model_id::text, m.metric_key, u.version, u.view, u.certified, u.used_in_kind, u.used_in_id::text, u.note, u.used_by::text, u.used_at,
        ${NAME('u.used_by')} as used_by_name, s.source_revision, s.served_at
      from products.metric_serving_uses u join products.semantic_models m on m.model_id = u.model_id join products.metric_servings s on s.serving_id = u.serving_id
      where (${q.modelId}::uuid is null or u.model_id = ${q.modelId}::uuid) and (${q.servingId}::uuid is null or u.serving_id = ${q.servingId}::uuid)
      order by u.used_at desc limit ${Math.min(Math.max(q.limit, 1), 500)}`);
  }
  async ledger(subjectIds: string[], limit: number): Promise<Row[]> {
    if (subjectIds.length === 0) return [];
    return this.rows(sql`select e.event_id::text, e.subject_kind, e.subject_id::text, e.subject_key, e.version, e.event, e.details, e.occurred_at, ${NAME('e.actor_principal_id')} as actor_name
      from analytics.definition_events e where e.subject_id = any (${subjectIds}::uuid[]) order by e.occurred_at desc limit ${Math.min(Math.max(limit, 1), 500)}`);
  }
  async items(subjectIds: string[]): Promise<Row[]> {
    if (subjectIds.length === 0) return [];
    return this.rows(sql`select i.item_id::text, i.signal_class, i.subject_kind, i.subject_id::text, i.title, i.state, i.route_roles, i.policy_version, i.created_at, i.closed_at
      from executive.attention_items i where i.subject_id = any (${subjectIds}::uuid[]) order by i.created_at desc`);
  }
  /** THE CATALOG (CAP-DL-11): every metric key — its current definition (the approved one, else the latest), the latest NON-preview, NON-replay
   *  result per (period, scope) of the whole-population cohort, the uses, and the B90 catalog entry when a data steward catalogued it
   *  (kind external, ref analytics:<metric_key>). */
  async catalog(): Promise<Row[]> {
    return this.rows(sql`with cur as (
        select distinct on (d.tenant_id, d.domain_id, d.metric_key) d.* from analytics.metric_definitions d
         order by d.tenant_id, d.domain_id, d.metric_key, (d.state = 'approved') desc, d.version desc)
      select c.definition_id::text, c.metric_key, c.version, c.state, c.title, c.meaning, c.kind, c.unit, c.direction, c.supported, c.unsupported_reason, c.computation_key, c.purpose_key,
        c.serves, c.cadence, c.floor_n, c.k_min, c.privacy_class, c.window_spec, c.owner_principal_id::text, ${NAME('c.owner_principal_id')} as owner_name, c.digest, c.source_refs,
        c.decided_at, ${REGISTRY_ROW('c.computation_key')} as computation,   -- B82-F mt
        coalesce((select jsonb_agg(z order by z ->> 'period_key' desc, z ->> 'scope_key' nulls first) from (
           select distinct on (r.period_key, r.scope_key) jsonb_build_object('result_id', r.result_id, 'period_key', r.period_key, 'scope_key', r.scope_key, 'scope_version', r.scope_version,
             'definition_version', r.definition_version, 'state', r.state, 'value', r.value, 'unit', r.unit, 'n', r.n, 'reasons', r.reasons, 'uncertainty', r.uncertainty, 'clock', r.clock,
             'threshold_eval', r.threshold_eval, 'computed_at', r.computed_at,
             'computation_key', r.computation_key, 'computation_version', r.computation_version, 'computation_digest', r.computation_digest) as z
             from analytics.metric_results r where r.tenant_id = c.tenant_id and r.domain_id = c.domain_id and r.metric_key = c.metric_key and not r.preview and r.replay_of is null and r.cohort = '{}'::jsonb
            order by r.period_key, r.scope_key, r.computed_at desc) q), '[]'::jsonb) as results_by_period,
        (select count(*)::int from analytics.metric_uses u join analytics.metric_results r on r.result_id = u.result_id where r.metric_key = c.metric_key and r.tenant_id = c.tenant_id and r.domain_id = c.domain_id) as uses,
        (select jsonb_build_object('asset_id', a.asset_id, 'kind', a.kind, 'ref', a.ref, 'trusted', a.trusted, 'discoverable', a.discoverable, 'registered_at', a.registered_at)
           from products.catalog_assets a where a.tenant_id = c.tenant_id and a.domain_id = c.domain_id and a.kind = 'external' and a.ref = 'analytics:' || c.metric_key) as b90_catalog_entry
      from cur c order by c.metric_key`);
  }
  async computations(): Promise<Row[]> {
    return this.rows(sql`select computation_key, function_name, version, kind, dimensions, scope_rule, description, body_digest, registered_in, registered_at from analytics.computation_registry order by computation_key`);
  }
  async ownerRoleMap(): Promise<Row> {
    return (await this.rows<{ m: Row }>(sql`select analytics.owner_role_map() as m`))[0]?.m ?? {};
  }

  /* ───────────── the ports ───────────── */
  async proposePurpose(a: Parameters<DefinitionWrites['proposePurpose']>[0]): Promise<Row> {
    return this.one(sql`select analytics.propose_purpose(${a.purposeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.key}, ${a.title}, ${a.kind}, ${a.description}, ${a.retentionDays}::int,
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_purpose');
  }
  async decidePurpose(a: Parameters<DefinitionWrites['decidePurpose']>[0]): Promise<Row> {
    return this.one(sql`select analytics.decide_purpose(${a.purposeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.digest}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_purpose');
  }
  async retirePurpose(a: Parameters<DefinitionWrites['retirePurpose']>[0]): Promise<Row> {
    return this.one(sql`select analytics.retire_purpose(${a.purposeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'retire_purpose');
  }
  async proposeScope(a: Parameters<DefinitionWrites['proposeScope']>[0]): Promise<Row> {
    return this.one(sql`select analytics.propose_scope(${a.scopeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.key}, ${a.title}, ${a.entityIds}::uuid[], ${a.objectiveIds}::uuid[],
      ${a.seriesKeys}::text[], ${a.geographies}::text[], ${a.description}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_scope');
  }
  async decideScope(a: Parameters<DefinitionWrites['decideScope']>[0]): Promise<Row> {
    return this.one(sql`select analytics.decide_scope(${a.scopeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.digest}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_scope');
  }
  async retireScope(a: Parameters<DefinitionWrites['retireScope']>[0]): Promise<Row> {
    return this.one(sql`select analytics.retire_scope(${a.scopeId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'retire_scope');
  }
  async proposeDefinition(a: Parameters<DefinitionWrites['proposeDefinition']>[0]): Promise<Row> {
    return this.one(sql`select analytics.propose_definition(${a.definitionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${j(a.contract)}::jsonb, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'propose_definition');
  }
  async decideDefinition(a: Parameters<DefinitionWrites['decideDefinition']>[0]): Promise<Row> {
    return this.one(sql`select analytics.decide_definition(${a.definitionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.decision}, ${a.digest}, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'decide_definition');
  }
  async retireDefinition(a: Parameters<DefinitionWrites['retireDefinition']>[0]): Promise<Row> {
    return this.one(sql`select analytics.retire_definition(${a.definitionId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.reason}, ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'retire_definition');
  }
  async recordUse(a: Parameters<DefinitionWrites['recordUse']>[0]): Promise<Row> {
    return this.one(sql`select analytics.record_use(${a.useId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.resultId}::uuid, ${a.kind}, ${a.usedInId}::uuid, ${a.note}, ${a.qualified},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_use');
  }
  async recordServingUse(a: Parameters<DefinitionWrites['recordServingUse']>[0]): Promise<Row> {
    return this.one(sql`select products.record_metric_serving_use(${a.useId}::uuid, ${a.tenantId}::uuid, ${a.domainId}::uuid, ${a.servingId}::uuid, ${a.kind}, ${a.usedInId}::uuid, ${a.note},
      ${a.actor}::uuid, ${a.correlationId}::uuid) as r`, 'record_metric_serving_use');
  }
}

export const DefinitionsCapability = {
  read(tx: Tx, action: string): DefinitionReads { return new DefinitionsCapabilityImpl(tx, action); },
  write(tx: Tx, action: string): DefinitionWrites { return new DefinitionsCapabilityImpl(tx, action); },
};
