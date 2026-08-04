/**
 * Tenancy endpoints — governed tenant/domain administration (WS-19 backend).
 * Every route goes through the authoritative pipeline: resolved scope, ABAC
 * policy, POL+AUD evidence, atomic commit, ack after commit.
 * Command/query style: POST with { envelope, payload } (Vol 4 Ch.16 internal profile).
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { PipelineService } from '../pipeline/pipeline.service.js';
import type { EyeRequest } from '../pipeline/http.js';
import { TenancyService } from './tenancy.service.js';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) {
    throw new HttpException(errorBody('EYE_REQ_001', req.eyeCorrelationId ?? 'unknown'), 400);
  }
  return { envelope, principal };
}

@Controller('/v1')
export class TenancyController {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly tenancy: TenancyService,
  ) {}

  @Post('/platform/tenants')
  async createTenant(
    @Req() req: EyeRequest,
    @Body() body: { payload?: { name?: string; residency?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const name = body.payload?.name;
    if (typeof name !== 'string' || name.length < 2) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'tenant name required'), 400);
    }
    const out = await this.pipeline.write(envelope, principal, {
      scope: 'PLATFORM', tenantId: null, domainId: null,
      action: 'tenancy.tenant.create', objectType: 'TEN', objectId: null,
    }, async (tx) => {
      const tenant = await this.tenancy.createTenant(tx, `principal:${principal.principalId}`, name, body.payload?.residency ?? 'local-dev');
      return { result: tenant, targetType: 'TEN', targetId: tenant.id, targetVersion: '1', outboxEvent: null };
    });
    return { tenant: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  @Post('/platform/tenants/list')
  async listTenants(@Req() req: EyeRequest) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, {
      scope: 'PLATFORM', tenantId: null, domainId: null,
      action: 'tenancy.tenant.list', objectType: 'TEN', objectId: null,
    }, async (tx) => this.tenancy.listTenants(tx));
    return { tenants: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  @Post('/tenants/:tenantId/domains')
  async createDomain(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Body() body: { payload?: { name?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const name = body.payload?.name;
    if (typeof name !== 'string' || name.length < 2) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'domain name required'), 400);
    }
    const out = await this.pipeline.write(envelope, principal, {
      scope: 'TENANT', tenantId, domainId: null,
      action: 'tenancy.domain.create', objectType: 'CID', objectId: null,
    }, async (tx) => {
      const domain = await this.tenancy.createDomain(tx, `principal:${principal.principalId}`, tenantId, name);
      return { result: domain, targetType: 'CID', targetId: domain.id, targetVersion: '1', outboxEvent: null };
    });
    return { domain: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  @Post('/tenants/:tenantId/domains/list')
  async listDomains(@Req() req: EyeRequest, @Param('tenantId') tenantId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, {
      scope: 'TENANT', tenantId, domainId: null,
      action: 'tenancy.domain.list', objectType: 'CID', objectId: null,
    }, async (tx) => this.tenancy.listDomains(tx, tenantId));
    return { domains: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }
}
