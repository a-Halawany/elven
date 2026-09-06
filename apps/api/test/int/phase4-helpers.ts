/**
 * Phase 4 integration harness — shared by the correction probes.
 *
 * Boots the application context, seeds a Phase 1 domain through the real ports,
 * and offers the same scaffolding the acceptance suite built inline: a live v2+
 * contract with a declared backfill, a transport double, a governed run, and a
 * synthetic daily history published as SDMX-JSON one calendar year per window.
 * Nothing here writes observation or prediction state except through the ports
 * the product uses.
 */
import { sql } from 'kysely';
import { uuidv7 } from 'uuidv7';
import { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { Envelope } from '@eye/contracts';
import { AppModule } from '../../src/app.module.js';
import { EYE_CONFIG } from '../../src/config/config.module.js';
import { COMMIT_DB, IDENTITY_DB } from '../../src/shared/shared.module.js';
import type { Db } from '../../src/shared/db.js';
import type { AuthenticatedPrincipal } from '../../src/shared/auth-types.js';
import { PipelineService } from '../../src/pipeline/pipeline.service.js';
import { AcquisitionLifecycle } from '../../src/observation/acquisition/lifecycle.service.js';
import { AgentSessionService } from '../../src/observation/agents/agent-session.service.js';
import { ObservationCapability } from '../../src/observation/observation.capabilities.js';
import { RestConnector } from '../../src/observation/connectors/rest.connector.js';
import type { EgressResult } from '../../src/observation/connectors/http-client.js';
import { seedPhase1Domain, fixtureContract, type Phase1Fixture } from './phase1-helpers.js';

export const BASE = 'https://backfill.example/series?format=jsondata';
export const SERIES_START = '2021-01-01';
export const SERIES_END = '2024-01-01'; // exclusive
export const DISRUPTION_FROM = '2023-11-20';
export const DISRUPTION_TO = '2023-11-27';

export function syntheticValue(dayIndex: number, date: string): number {
  const base = 60 + 0.004 * dayIndex + 9 * Math.sin((2 * Math.PI * dayIndex) / 7) + 2 * Math.sin((2 * Math.PI * dayIndex) / 365);
  const noise = ((dayIndex * 7919) % 13) / 13 - 0.5;
  const disrupted = date >= DISRUPTION_FROM && date < DISRUPTION_TO ? 0.45 : 1;
  return Number((base * disrupted + noise).toFixed(3));
}

export function sdmxWindow(from: string, toExclusive: string, revise: ((date: string, v: number) => number) | null = null): string {
  const dates: string[] = []; const obs: Record<string, number[]> = {};
  const d = new Date(`${from}T00:00:00Z`);
  const origin = new Date(`${SERIES_START}T00:00:00Z`).getTime();
  let i = 0;
  while (d.toISOString().slice(0, 10) < toExclusive) {
    const date = d.toISOString().slice(0, 10);
    const idx = Math.round((d.getTime() - origin) / 86_400_000);
    let v = syntheticValue(idx, date);
    if (revise !== null) v = revise(date, v);
    dates.push(date); obs[String(i)] = [v];
    i += 1; d.setUTCDate(d.getUTCDate() + 1);
  }
  return JSON.stringify({
    dataSets: [{ series: { '0:0:0:0:0': { observations: obs } } }],
    structure: { dimensions: { observation: [{ id: 'TIME_PERIOD', values: dates.map((x) => ({ id: x })) }] } },
  });
}

/** A transport double answering each backfill window with the synthetic year it asks for. */
export function syntheticEgress(revise: ((start: string) => ((date: string, v: number) => number) | null) | null = null) {
  return fakeEgress((url) => {
    const q = new URL(url).searchParams;
    const start = q.get('startPeriod') as string; const end = q.get('endPeriod') as string;
    const endExclusive = new Date(`${end}T00:00:00Z`); endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    return sdmxWindow(start, endExclusive.toISOString().slice(0, 10), revise === null ? null : revise(start));
  });
}

export function fakeEgress(bodyFor: (url: string) => string, status = 200) {
  const seen: string[] = [];
  const egress = async ({ url }: { url: string }): Promise<EgressResult> => {
    seen.push(url);
    return {
      status, headers: { 'content-type': 'application/json' }, body: Buffer.from(bodyFor(url), 'utf8'),
      finalUrlRedacted: url.split('?')[0] as string, hops: [], tlsVerified: true, originAllowlisted: true,
      pinnedAddress: '203.0.113.9', retryAfterSeconds: null,
    };
  };
  return { egress, seen };
}

export class Phase4Harness {
  app!: INestApplicationContext;
  pipeline!: PipelineService;
  lifecycle!: AcquisitionLifecycle;
  sessions!: AgentSessionService;
  su!: Db;
  fx!: Phase1Fixture;
  registrar!: AuthenticatedPrincipal;
  manager!: AuthenticatedPrincipal;
  /** The highest contract version registered so far for the fixture source. */
  version = 1;

  static async boot(): Promise<Phase4Harness> {
    const h = new Phase4Harness();
    process.env['EYE_RUNTIME_ENV'] = 'test';
    h.app = await NestFactory.createApplicationContext(AppModule, { logger: false });
    h.pipeline = h.app.get(PipelineService);
    h.lifecycle = h.app.get(AcquisitionLifecycle);
    h.sessions = h.app.get(AgentSessionService);
    h.fx = await seedPhase1Domain(h.app.get(EYE_CONFIG), h.app.get(IDENTITY_DB), h.app.get(COMMIT_DB));
    h.su = h.fx.su;
    const base = await h.fx.managerPrincipal();
    h.manager = base;
    const rs = h.fx.registrarSession();
    h.registrar = { ...base, principalId: h.fx.registrarId, sessionId: rs.sessionId, contextKey: rs.contextKey,
      bindings: [{ roleCode: 'domain_analyst', scope: 'DOMAIN', tenantId: h.fx.tenantId, domainId: h.fx.domainId }] };
    return h;
  }

  async close(): Promise<void> {
    await this.fx?.cleanup();
    await this.app?.close();
  }

  env(principal: AuthenticatedPrincipal, action: string, objectType: string, objectId: string | null, purpose = 'observation'): Envelope {
    return {
      message_id: uuidv7(), scope: 'DOMAIN', tenant_id: this.fx.tenantId, domain_id: this.fx.domainId,
      principal_id: `principal:${principal.principalId}`, purpose_id: purpose, action,
      side_effect_class: action.includes('.read') ? 'none' : 'reversible',
      consequence_class: 'C2', object_type: objectType, object_id: objectId,
      schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted',
      correlation_id: uuidv7(), trace_id: 'p4-corrections',
    } as unknown as Envelope;
  }

  req(principal: AuthenticatedPrincipal, action: string, objectType: string, objectId: string | null, purpose = 'prediction') {
    return { eyeEnvelope: this.env(principal, action, objectType, objectId, purpose), eyePrincipal: principal } as never;
  }

  /** A DOMAIN principal with the given roles, created as fixture scaffolding. */
  async principalWith(roles: string[], label: string): Promise<AuthenticatedPrincipal> {
    const id = uuidv7();
    const run = id.slice(-8);
    await sql`insert into identity.principals (id, kind, scope, tenant_id, domain_id, display_name, login_name, status)
              values (${id}::uuid, 'human', 'DOMAIN', ${this.fx.tenantId}::uuid, ${this.fx.domainId}::uuid,
                      ${`fixture-${label}-${run}`}, ${`fx-${label.slice(0, 4)}-${run}`}, 'active')`.execute(this.su);
    for (const role of roles) {
      await sql`insert into identity.role_bindings (id, principal_id, role_code, scope, tenant_id, domain_id)
                values (${uuidv7()}::uuid, ${id}::uuid, ${role}, 'DOMAIN', ${this.fx.tenantId}::uuid, ${this.fx.domainId}::uuid)`.execute(this.su);
    }
    return { ...this.manager, principalId: id,
      bindings: roles.map((roleCode) => ({ roleCode, scope: 'DOMAIN' as const, tenantId: this.fx.tenantId, domainId: this.fx.domainId })) };
  }

  /** The live contract with a declared period-range backfill. */
  contract(sourceKey: string, over: { from: string; to: string | null; windowDays: number; supersedes: number; version: number; budget?: number;
                                       controls?: { data_origin?: string; classification_ceiling?: string; residency?: string; retention?: string; licence?: string } }) {
    const c = fixtureContract(sourceKey) as Record<string, unknown>;
    const so = c['security_and_operations'] as Record<string, unknown>;
    const ar = c['authority_and_rights'] as Record<string, unknown>;
    const { data_origin, ...arControls } = over.controls ?? {};
    return {
      ...c,
      acquisition_mode: 'live',
      ...(data_origin === undefined ? {} : { data_origin }),
      identity: { ...(c['identity'] as Record<string, unknown>), endpoints: [BASE] },
      authority_and_rights: { ...ar, rights_state: 'confirmed', attribution: 'Source: fixture statistics.', ...arControls },
      security_and_operations: {
        ...so,
        expected_schema: { media_types: ['application/json'], required_fields: ['dataSets'], drift_tolerance: 0 },
        budgets: { max_requests_per_run: over.budget ?? 12, max_bytes_per_run: 33_554_432, max_concurrency: 1, timeout_ms: 60_000, max_retries: 0 },
        backfill: { strategy: 'period-range', endpoint: BASE, from: over.from, to: over.to,
                    window_days: over.windowDays, start_param: 'startPeriod', end_param: 'endPeriod' },
      },
      lifecycle: { contract_version: over.version, effective_from: '2026-09-05T00:00:00Z', supersedes_version: over.supersedes },
    };
  }

  async transition(version: number, target: string): Promise<void> {
    await this.pipeline.write(
      this.env(this.manager, 'observation.source.transition', 'SRC', this.fx.sourceId), this.manager,
      { scope: 'DOMAIN', tenantId: this.fx.tenantId, domainId: this.fx.domainId,
        action: 'observation.source.transition', objectType: 'SRC', objectId: this.fx.sourceId },
      ObservationCapability.registry,
      async (cap) => {
        await cap.transitionContract({ sourceId: this.fx.sourceId, contractVersion: version, tenantId: this.fx.tenantId,
          domainId: this.fx.domainId, target, reason: `phase 4 fixture: ${target}`, eventId: uuidv7(), correlationId: uuidv7() });
        return { result: {}, targetType: 'SRC', targetId: this.fx.sourceId, targetVersion: String(version), outboxEvent: null };
      });
  }

  /** Register, approve and activate the next contract version through the real route and ports. */
  async newVersion(over: { from: string; to: string | null; windowDays: number; budget?: number;
                           controls?: { data_origin?: string; classification_ceiling?: string; residency?: string; retention?: string; licence?: string } }): Promise<{ version: number; sourceKey: string }> {
    const sourceKey = (await sql<{ source_key: string }>`select source_key from observation.source_contracts_current
      where source_id = ${this.fx.sourceId}::uuid limit 1`.execute(this.su)).rows[0]?.source_key ?? '';
    const version = this.version + 1;
    const { ObservationController } = await import('../../src/observation/observation.controller.js');
    const controller = this.app.get(ObservationController);
    await controller.registerSource(
      this.req(this.registrar, 'observation.source.register', 'SRC', this.fx.sourceId, 'observation'), this.fx.tenantId, this.fx.domainId,
      { payload: { contract: this.contract(sourceKey, { ...over, supersedes: this.version, version }), sourceId: this.fx.sourceId } });
    await this.pipeline.write(
      this.env(this.manager, 'observation.source.approve', 'SRC', this.fx.sourceId), this.manager,
      { scope: 'DOMAIN', tenantId: this.fx.tenantId, domainId: this.fx.domainId,
        action: 'observation.source.approve', objectType: 'SRC', objectId: this.fx.sourceId },
      ObservationCapability.registry,
      async (cap) => {
        await cap.approveSource({ sourceId: this.fx.sourceId, contractVersion: version, tenantId: this.fx.tenantId, domainId: this.fx.domainId,
          decision: 'approve', reason: 'phase 4 fixture', eventId: uuidv7(), correlationId: uuidv7() });
        return { result: {}, targetType: 'SRC', targetId: this.fx.sourceId, targetVersion: String(version), outboxEvent: null };
      });
    await this.transition(this.version, 'superseded');
    await this.transition(version, 'active');
    this.version = version;
    return { version, sourceKey };
  }

  /** One governed run of the fixture source under the agent's own session. */
  async runOnce(connector: RestConnector, contractVersion = this.version) {
    const principal = await this.sessions.openRunSession({
      agentId: this.fx.agentId, tenantId: this.fx.tenantId, domainId: this.fx.domainId,
      agentVersion: connector.version, codeDigest: connector.codeDigest, correlationId: uuidv7(),
    });
    return this.lifecycle.run({
      sourceId: this.fx.sourceId, contractVersion, agentId: this.fx.agentId, agentVersion: connector.version,
      connector, principal, correlationId: uuidv7(), purposeId: 'observation',
    });
  }

  checkpoint(): Promise<Record<string, unknown> | undefined> {
    return sql<{ checkpoint: Record<string, unknown> }>`select checkpoint from observation.checkpoint_events
      where source_id = ${this.fx.sourceId}::uuid order by occurred_at desc limit 1`.execute(this.su)
      .then((r) => r.rows[0]?.checkpoint);
  }
}
