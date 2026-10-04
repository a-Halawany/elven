/**
 * CP-6 B91 §EN (0105) — the entitlement routes (F-P7-F-01: the object model, the contract scope, the availability gate's reads). Same
 * envelope, pipeline and receipts as every governed route.
 *
 * THE VENDOR (PLATFORM, the commercial authority; every write human-gated) — base /v1/commercial:
 *   POST /catalog/read                              commercial.read              (capabilities, packages, SKUs, offers, the ledger, the MATRIX)
 *   POST /capabilities/declare                      commercial.capability.declare
 *   POST /packages/declare                          commercial.offer.package
 *   POST /skus/declare                              commercial.offer.sku
 *   POST /offers/declare                            commercial.offer.declare
 *   POST /tenants/:tenantId/read                    commercial.read              (a tenant's entitlement, licence history, contract, ledger)
 *   POST /tenants/:tenantId/licences/issue          commercial.licence.issue     (v+1; the previous version superseded)
 *   POST /tenants/:tenantId/contracts/declare       commercial.contract.declare  (the contract scope, V10-T-015)
 * THE TENANT (its own entitlement, read-only) — /v1/tenants/:tenantId/commercial (TENANT: the tenant administrator, the auditor) and
 * /v1/tenants/:tenantId/domains/:domainId/commercial (DOMAIN: the domain roles that read an explained refusal):
 *   POST /entitlement/read                          commercial.read
 *   POST /entitlement/availability                  commercial.read              ({actions: [...]} → each action's availability, explained)
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { EntitlementCapability } from './entitlement.capabilities.js';
import { EntitlementService, validateActions, validateCapability, validateContract, validateLicence, validateOffer, validatePackage, validateSku } from './entitlement.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });
function id(v: string, what: string, correlationId: string): string {
  if (!UUID.test(v)) throw new HttpException(errorBody('EYE_REQ_001', correlationId, `${what} must be an id`), 400);
  return v;
}
const platform = (action: string, objectType: string | null, objectId: string | null) => ({ scope: 'PLATFORM' as const, tenantId: null, domainId: null, action, objectType, objectId });

@Controller('/v1/commercial')
export class EntitlementsVendorController {
  constructor(private readonly pipeline: PipelineService, private readonly entitlements: EntitlementService) {}

  @Post('/catalog/read')
  async catalog(@Req() req: EyeRequest) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, platform('commercial.read', 'CAP', null), EntitlementCapability.read,
      async (cap) => this.entitlements.catalogue(cap));
    return { catalog: out.result, receipt: receipt(out) };
  }

  @Post('/capabilities/declare')
  async declareCapability(@Req() req: EyeRequest, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateCapability(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, platform('commercial.capability.declare', 'CAP', null), EntitlementCapability.catalogue,
      async (cap) => {
        const r = await this.entitlements.declareCapability(cap, intake, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'CAP', targetId: null, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { capability: out.result, receipt: receipt(out) };
  }

  @Post('/packages/declare')
  async declarePackage(@Req() req: EyeRequest, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validatePackage(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, platform('commercial.offer.package', 'PKG', null), EntitlementCapability.catalogue,
      async (cap) => {
        const r = await this.entitlements.declarePackage(cap, intake, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'PKG', targetId: null, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { package: out.result, receipt: receipt(out) };
  }

  @Post('/skus/declare')
  async declareSku(@Req() req: EyeRequest, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateSku(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, platform('commercial.offer.sku', 'SKU', null), EntitlementCapability.catalogue,
      async (cap) => {
        const r = await this.entitlements.declareSku(cap, intake, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'SKU', targetId: null, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { sku: out.result, receipt: receipt(out) };
  }

  @Post('/offers/declare')
  async declareOffer(@Req() req: EyeRequest, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const intake = validateOffer(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, platform('commercial.offer.declare', 'OFR', null), EntitlementCapability.catalogue,
      async (cap) => {
        const r = await this.entitlements.declareOffer(cap, intake, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'OFR', targetId: null, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { offer: out.result, receipt: receipt(out) };
  }

  @Post('/tenants/:tenantId/read')
  async readTenant(@Req() req: EyeRequest, @Param('tenantId') tenantIdRaw: string) {
    const { envelope, principal } = ctx(req);
    const tenantId = id(tenantIdRaw, 'tenantId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, platform('commercial.read', 'LIC', tenantId), EntitlementCapability.read,
      async (cap) => this.entitlements.tenant(cap, tenantId));
    return { entitlement: out.result, receipt: receipt(out) };
  }

  @Post('/tenants/:tenantId/licences/issue')
  async issueLicence(@Req() req: EyeRequest, @Param('tenantId') tenantIdRaw: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const tenantId = id(tenantIdRaw, 'tenantId', envelope.correlation_id);
    const intake = validateLicence(body?.payload ?? {}, envelope.correlation_id);
    const licenceId = newId();
    const out = await this.pipeline.write(envelope, principal, platform('commercial.licence.issue', 'LIC', tenantId), EntitlementCapability.licence,
      async (cap) => {
        const r = await this.entitlements.issueLicence(cap, tenantId, licenceId, intake, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'LIC', targetId: tenantId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { licence: out.result, receipt: receipt(out) };
  }

  @Post('/tenants/:tenantId/contracts/declare')
  async declareContract(@Req() req: EyeRequest, @Param('tenantId') tenantIdRaw: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const tenantId = id(tenantIdRaw, 'tenantId', envelope.correlation_id);
    const intake = validateContract(body?.payload ?? {}, envelope.correlation_id);
    const contractId = intake.contractId ?? newId();
    const out = await this.pipeline.write(envelope, principal, platform('commercial.contract.declare', 'CTR', contractId), EntitlementCapability.contract,
      async (cap) => {
        const r = await this.entitlements.declareContract(cap, tenantId, contractId, intake, principal.principalId, envelope.correlation_id);
        return { result: r, targetType: 'CTR', targetId: contractId, targetVersion: String(r['version']), outboxEvent: null };
      });
    return { contract: out.result, receipt: receipt(out) };
  }
}

@Controller('/v1/tenants/:tenantId')
export class EntitlementsTenantController {
  constructor(private readonly pipeline: PipelineService, private readonly entitlements: EntitlementService) {}

  private route(tenantId: string, domainId: string | null, objectId: string | null) {
    return { scope: domainId === null ? ('TENANT' as const) : ('DOMAIN' as const), tenantId, domainId, action: 'commercial.read', objectType: 'LIC', objectId };
  }

  @Post('/commercial/entitlement/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, null, null), EntitlementCapability.read,
      async (cap) => this.entitlements.tenant(cap, tenantId));
    return { entitlement: out.result, receipt: receipt(out) };
  }

  @Post('/commercial/entitlement/availability')
  async availability(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const actions = validateActions(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, null, null), EntitlementCapability.read,
      async (cap) => this.entitlements.availability(cap, tenantId, actions));
    return { availability: out.result, receipt: receipt(out) };
  }

  @Post('/domains/:domainId/commercial/entitlement/read')
  async readInDomain(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, null), EntitlementCapability.read,
      async (cap) => this.entitlements.tenant(cap, tenantId));
    return { entitlement: out.result, receipt: receipt(out) };
  }

  @Post('/domains/:domainId/commercial/entitlement/availability')
  async availabilityInDomain(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: { payload?: Record<string, unknown> }) {
    const { envelope, principal } = ctx(req);
    const actions = validateActions(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, null), EntitlementCapability.read,
      async (cap) => this.entitlements.availability(cap, tenantId, actions));
    return { availability: out.result, receipt: receipt(out) };
  }
}
