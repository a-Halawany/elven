/**
 * Edge controllers for identity administration and audit inspection.
 * They live in the pipeline module (the request edge) because the pipeline may
 * import identity/audit services while those modules stay import-free of the
 * pipeline (no module cycles; ownership stays with the owning services —
 * controllers are access modes, ES-04-004).
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody, type Scope } from '@eye/contracts';
import { PipelineService } from './pipeline.service.js';
import type { EyeRequest } from './http.js';
import { PrincipalsService } from '../identity/principals.service.js';
import { AuditService } from '../audit/audit.service.js';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) {
    throw new HttpException(errorBody('EYE_REQ_001', req.eyeCorrelationId ?? 'unknown'), 400);
  }
  return { envelope, principal };
}

interface CreatePrincipalPayload {
  kind?: 'human' | 'workload';
  displayName?: string;
  /** Unique login identifier (R6) — required when a password is issued. */
  loginName?: string;
  password?: string;
  roleCode?: string;
  domainId?: string;
}

@Controller('/v1')
export class AdminControllers {
  constructor(
    private readonly pipeline: PipelineService,
    private readonly principals: PrincipalsService,
    private readonly audit: AuditService,
  ) {}

  /** Create a tenant-scoped principal (admin/analyst/auditor) with optional role binding. */
  @Post('/tenants/:tenantId/principals')
  async createTenantPrincipal(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Body() body: { payload?: CreatePrincipalPayload },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    if (typeof p.displayName !== 'string' || p.displayName.length < 2) {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'displayName required'), 400);
    }
    const scope: Scope = p.domainId !== undefined ? 'DOMAIN' : 'TENANT';
    const out = await this.pipeline.write(envelope, principal, {
      scope: 'TENANT', tenantId, domainId: null,
      action: 'identity.principal.create', objectType: 'PRN', objectId: null,
    }, async (tx) => {
      const created = await this.principals.createPrincipal(tx, {
        kind: p.kind ?? 'human',
        scope,
        tenantId,
        domainId: p.domainId ?? null,
        displayName: p.displayName as string,
        ...(p.loginName !== undefined ? { loginName: p.loginName } : {}),
        ...(p.password !== undefined ? { password: p.password } : {}),
        ...(p.roleCode !== undefined ? { roleCode: p.roleCode } : {}),
      });
      return { result: created, targetType: 'PRN', targetId: created.principalId, targetVersion: '1', outboxEvent: null };
    });
    return { principal: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  @Post('/tenants/:tenantId/principals/list')
  async listTenantPrincipals(@Req() req: EyeRequest, @Param('tenantId') tenantId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, {
      scope: 'TENANT', tenantId, domainId: null,
      action: 'identity.principal.list', objectType: 'PRN', objectId: null,
    }, async (tx) => this.principals.listPrincipals(tx));
    return { principals: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /** Audit query — consequential read; obligations are EXECUTED here (mask → sanitized projection). */
  @Post('/tenants/:tenantId/audit/query')
  async auditQueryTenant(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Body() body: { payload?: { limit?: number; correlationId?: string } },
  ) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, {
      scope: 'TENANT', tenantId, domainId: null,
      action: 'audit.read', objectType: 'AUD', objectId: null,
    }, async (tx, _c, obligations) => {
      const mask = obligations.some((o) => o.type === 'mask_secret_metadata');
      const corr = body.payload?.correlationId;
      return this.audit.query(tx, {
        limit: body.payload?.limit ?? 100,
        mask,
        ...(corr !== undefined ? { correlationId: corr } : {}),
      });
    });
    return { events: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq }, obligationsApplied: out.obligations };
  }

  @Post('/platform/audit/query')
  async auditQueryPlatform(@Req() req: EyeRequest, @Body() body: { payload?: { limit?: number; correlationId?: string } }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, {
      scope: 'PLATFORM', tenantId: null, domainId: null,
      action: 'audit.read', objectType: 'AUD', objectId: null,
    }, async (tx, _c, obligations) => {
      const mask = obligations.some((o) => o.type === 'mask_secret_metadata');
      const corr = body.payload?.correlationId;
      return this.audit.query(tx, {
        limit: body.payload?.limit ?? 100,
        mask,
        ...(corr !== undefined ? { correlationId: corr } : {}),
      });
    });
    return { events: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq }, obligationsApplied: out.obligations };
  }

  /** Chain verification (platform authority). Verification results are audited internally. */
  @Post('/platform/audit/verify')
  async auditVerify(@Req() req: EyeRequest, @Body() body: { payload?: { partitionId?: string } }) {
    const { envelope, principal } = ctx(req);
    const partitionId = body.payload?.partitionId;
    if (typeof partitionId !== 'string') {
      throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'partitionId required'), 400);
    }
    const out = await this.pipeline.consequentialRead(envelope, principal, {
      scope: 'PLATFORM', tenantId: null, domainId: null,
      action: 'audit.read', objectType: 'AUD', objectId: null,
    }, async () => null);
    const report = await this.audit.verifyPartition(partitionId);
    return { report, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }
}
