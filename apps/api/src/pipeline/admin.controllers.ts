/**
 * Edge controllers for identity administration and audit inspection.
 * They live in the pipeline module (the request edge) because the pipeline may
 * import identity/audit services while those modules stay import-free of the
 * pipeline (no module cycles; ownership stays with the owning services —
 * controllers are access modes, ES-04-004).
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { requireCorrelation } from '../shared/correlation.js';
import { errorBody, type Scope } from '@eye/contracts';
import { PipelineService } from './pipeline.service.js';
import { newId } from '../shared/ids.js';
import { AuditCapability, PrincipalsCapability } from '../shared/capabilities.js';
import type { EyeRequest } from './http.js';
import { PrincipalsService } from '../identity/principals.service.js';
import { AuditService } from '../audit/audit.service.js';

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) {
    throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
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

  /**
   * The caller's OWN identity and scope.
   *
   * The interface has to know which tenant and domain it is operating in, and a
   * domain operator cannot list tenants to find out — nor should they be able to.
   * This returns the authenticated principal's own home scope and its own role
   * bindings, and nothing else: it is not a directory, and it discloses nothing
   * about any other principal.
   *
   * It is a CONSEQUENTIAL READ like every other: the policy decision and audit
   * event are durable before the answer is returned.
   */
  @Post('/me')
  async me(@Req() req: EyeRequest) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(
      envelope, principal,
      {
        scope: principal.homeScope, tenantId: principal.homeTenantId, domainId: principal.homeDomainId,
        action: 'identity.self.read', objectType: 'PRN', objectId: principal.principalId,
        // An identity read runs on the IDENTITY authority. The commit authority
        // is refused an identity capability by the database, and rightly so.
        authority: 'identity',
      },
      PrincipalsCapability.read,
      async () => ({
        principalId: principal.principalId,
        kind: principal.kind,
        assurance: principal.assurance,
        homeScope: principal.homeScope,
        homeTenantId: principal.homeTenantId,
        homeDomainId: principal.homeDomainId,
        bindings: principal.bindings,
      }));
    return { me: out.result, receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq } };
  }

  /** Create a tenant-scoped principal (admin/analyst/auditor) with optional role binding. */
  @Post('/tenants/:tenantId/principals')
  async createTenantPrincipal(
    @Req() req: EyeRequest,
    @Param('tenantId') tenantId: string,
    @Body() body: { payload?: CreatePrincipalPayload },
  ) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    // Gate-2.2 C6: target id generated before the capability is minted.
    const principalIdToCreate = newId();
    const route = {
      scope: 'TENANT' as const, tenantId, domainId: null,
      action: 'identity.principal.create', objectType: 'PRN', objectId: principalIdToCreate,
      authority: 'identity' as const,
    };
    // Gate-2.1 §7: durable sanitized evidence for every authenticated rejection.
    if (typeof p.displayName !== 'string' || p.displayName.length < 2) {
      await this.pipeline.rejectAuthenticatedRequest(
        envelope, principal, route, 'EYE-REQ-001', 'displayName required', 400,
      );
    }
    const scope: Scope = p.domainId !== undefined ? 'DOMAIN' : 'TENANT';
    const out = await this.pipeline.write(envelope, principal, route, PrincipalsCapability.write, async (tx) => {
      const created = await this.principals.createPrincipal(tx, {
        principalId: principalIdToCreate,
        correlationId: envelope.correlation_id,
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
    }, PrincipalsCapability.read, async (tx) => this.principals.listPrincipals(tx));
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
    }, AuditCapability.read, async (tx, _c, obligations) => {
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
    }, AuditCapability.read, async (tx, _c, obligations) => {
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

  /**
   * Chain verification — governed as its OWN action `audit.verify` (Gate-2 §6),
   * not as `audit.read`. The requested partition, the authorization decision,
   * the verification result (or failure) and the resulting evidence are all
   * recorded; a malformed request goes through the centralized durable
   * rejection path rather than throwing without evidence.
   */
  @Post('/platform/audit/verify')
  async auditVerify(@Req() req: EyeRequest, @Body() body: { payload?: { partitionId?: string } }) {
    const { envelope, principal } = ctx(req);
    const route = {
      scope: 'PLATFORM' as const, tenantId: null, domainId: null,
      action: 'audit.verify', objectType: 'AUD', objectId: null,
    };
    const partitionId = body.payload?.partitionId;
    if (typeof partitionId !== 'string' || partitionId.length === 0) {
      await this.pipeline.rejectAuthenticatedRequest(
        envelope, principal, route, 'EYE-REQ-001', 'partitionId required',
      );
    }
    // Gate-2.1 §7: the verification runs INSIDE the governed read and its actual
    // finding becomes the evidence. An unknown or damaged partition is recorded as
    // a failure with the full detail — never as a generic success because the
    // handler returned.
    const out = await this.pipeline.consequentialReadEvidenced(
      envelope, principal, route,
      // audit.verify needs no read capability of its own: verification runs on the
      // dedicated VERIFIER authority inside the audit service, under a
      // partition-bound verify capability (C5).
      AuditCapability.read,
      async () => this.audit.verifyPartition(partitionId as string),
      (report) => ({
        outcome: report.ok ? ('success' as const) : ('failure' as const),
        resultCode: report.ok ? 'OK' : `EYE-AUD-${report.resultClass === 'partition_unknown' ? '404' : '001'}`,
        metadata: {
          requested_partition: partitionId,
          result_class: report.resultClass,
          noncanonical_at_seq: report.noncanonicalAtSeq,
          orphan_row_seqs: report.orphanRowSeqs,
          checked: report.checked,
          ok: report.ok,
          head_matches: report.headMatches,
          verified_head_seq: report.verifiedHeadSeq,
          verified_head_hash: report.verifiedHeadHash,
          expected_head_seq: report.expectedHeadSeq,
          expected_head_hash: report.expectedHeadHash,
          calculated_head_seq: report.calculatedHeadSeq,
          calculated_head_hash: report.calculatedHeadHash,
          broken_at_seq: report.brokenAtSeq,
          incident_id: report.incidentId,
        },
      }),
    );
    return {
      report: out.result,
      receipt: { policyDecisionId: out.policyDecisionId, auditSeq: out.auditSeq },
      obligationsApplied: out.obligations,
    };
  }
}
