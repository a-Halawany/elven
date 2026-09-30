/**
 * THE HTTP SURFACE OF THE METADATA CATALOG — CP-6 B90 §K (migration 0095 §K; F-P7-F-11). Same envelope, same capabilities, same receipts
 * as the products controller: every write is one governed write whose port asserts the route's own action (an EXACT PDP rule, the B90
 * catalog block); every read is a consequential read under products.catalog.read, the SEARCH under products.catalog.search with the
 * READER's CLEARANCE passed to the port (shared/clearance.ts: the same rule the briefings and the memory read under). The routes live
 * under /products/catalog/… of the domain. Nothing here decides a rule a port decides.
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { newId } from '../../shared/ids.js';
import { requireCorrelation } from '../../shared/correlation.js';
import { assertClearance, clearanceOf } from '../../shared/clearance.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { CatalogCapability } from './catalog.capabilities.js';
import { assertCatalogUuid, limitOf, validateAssetRegistration, validateFlag, validateLineage, validateOwner, validateSearch, validateTerm } from './catalog.service.js';

type Row = Record<string, unknown>;
type Payload = { payload?: Row };

function ctx(req: EyeRequest) {
  const envelope = req.eyeEnvelope;
  const principal = req.eyePrincipal;
  if (envelope === undefined || principal === undefined) throw new HttpException(errorBody('EYE_REQ_001', requireCorrelation(req)), 400);
  return { envelope, principal };
}
const receipt = (o: { policyDecisionId: string; auditSeq: number }) => ({ policyDecisionId: o.policyDecisionId, auditSeq: o.auditSeq });

@Controller('/v1/tenants/:tenantId/domains/:domainId/products/catalog')
export class CatalogController {
  constructor(private readonly pipeline: PipelineService) {}
  private route(tenantId: string, domainId: string, action: string, objectId: string | null) {
    return { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType: 'CAT', objectId };
  }

  /** CATALOGUE an asset (the steward's act, or the owner's for their own): a staging or external asset as declared; a registry kind by reference. */
  @Post('/assets/register')
  async register(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validateAssetRegistration(body.payload ?? {}, envelope.correlation_id);
    const assetId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.catalog.asset.register', assetId), CatalogCapability.write,
      async (cap) => {
        const r = await cap.catalogueAsset({ assetId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'CAT', targetId: assetId, targetVersion: null, outboxEvent: null };
      });
    return { asset: out.result, receipt: receipt(out) };
  }

  /** SET THE OWNER (the steward): a named, active human; clears unowned. */
  @Post('/assets/:assetId/owner')
  async setOwner(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('assetId') assetId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertCatalogUuid(assetId, 'catalog asset', 'asset', envelope.correlation_id);
    const owner = validateOwner(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.catalog.owner.set', assetId), CatalogCapability.write,
      async (cap) => {
        const r = await cap.setOwner({ assetId, tenantId, domainId, owner, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'CAT', targetId: assetId, targetVersion: null, outboxEvent: null };
      });
    return { asset: out.result, receipt: receipt(out) };
  }

  /** RECERTIFY OWNERSHIP (the owner's own act). */
  @Post('/assets/:assetId/recertify')
  async recertify(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('assetId') assetId: string) {
    const { envelope, principal } = ctx(req);
    assertCatalogUuid(assetId, 'catalog asset', 'asset', envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.catalog.recertify', assetId), CatalogCapability.write,
      async (cap) => {
        const r = await cap.recertify({ assetId, tenantId, domainId, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'CAT', targetId: assetId, targetVersion: null, outboxEvent: null };
      });
    return { asset: out.result, receipt: receipt(out) };
  }

  /** FLAG an asset by hand, or clear a flag (the steward's judgement). */
  @Post('/assets/:assetId/flag')
  async flag(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('assetId') assetId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    assertCatalogUuid(assetId, 'catalog asset', 'asset', envelope.correlation_id);
    const p = validateFlag(body.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.catalog.flag', assetId), CatalogCapability.write,
      async (cap) => {
        const r = await cap.flag({ assetId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'CAT', targetId: assetId, targetVersion: null, outboxEvent: null };
      });
    return { asset: out.result, receipt: receipt(out) };
  }

  /** DECLARE LINEAGE between two assets (the steward, or either asset's owner). */
  @Post('/lineage/declare')
  async declareLineage(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validateLineage(body.payload ?? {}, envelope.correlation_id);
    const edgeId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.catalog.lineage.declare', p.from), CatalogCapability.write,
      async (cap) => {
        const r = await cap.declareLineage({ edgeId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'CAT', targetId: p.from, targetVersion: null, outboxEvent: null };
      });
    return { edge: out.result, receipt: receipt(out) };
  }

  /** DEFINE (or redefine) a glossary term (the steward). */
  @Post('/terms/define')
  async defineTerm(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validateTerm(body.payload ?? {}, envelope.correlation_id);
    const termId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.catalog.term.define', termId), CatalogCapability.write,
      async (cap) => {
        const r = await cap.defineTerm({ termId, tenantId, domainId, ...p, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'CAT', targetId: String(r['term_id'] ?? termId), targetVersion: String(r['version'] ?? 1), outboxEvent: null };
      });
    return { term: out.result, receipt: receipt(out) };
  }

  /** RECONCILE the catalog against the authoritative registries on demand (the steward; the tick's step does the same under its own action). */
  @Post('/reconcile')
  async reconcile(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const runId = newId();
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'products.catalog.reconcile', runId), CatalogCapability.write,
      async (cap) => {
        const r = await cap.reconcile({ runId, tenantId, domainId, actor: principal.principalId, correlationId: envelope.correlation_id });
        return { result: r, targetType: 'CAT', targetId: runId, targetVersion: null, outboxEvent: null };
      });
    return { run: out.result, receipt: receipt(out) };
  }

  /** SEARCH (DAT-TR-01): discoverable entries within the reader's clearance; the hidden counted, never served. */
  @Post('/search')
  async search(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = validateSearch(body.payload ?? {}, envelope.correlation_id);
    const clearance = clearanceOf(principal, { tenantId, domainId });
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.catalog.search', null), CatalogCapability.read,
      async (cap) => ({ search: await cap.search({ ...p, clearance }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/coverage')
  async coverage(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.catalog.read', null), CatalogCapability.read,
      async (cap) => ({ coverage: await cap.coverage({ tenantId, domainId }), runs: await cap.runs({ limit: 10 }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/assets/list')
  async list(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.catalog.read', null), CatalogCapability.read,
      async (cap) => ({ at: await cap.now(), assets: await cap.list({ kind: typeof p['kind'] === 'string' ? p['kind'] : null, flag: typeof p['flag'] === 'string' ? p['flag'] : null, limit: limitOf(p) }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/terms/list')
  async terms(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.catalog.read', null), CatalogCapability.read,
      async (cap) => ({ at: await cap.now(), terms: await cap.terms({ limit: limitOf(body.payload ?? {}) }) }));
    return { ...out.result, receipt: receipt(out) };
  }

  /** THE STOP OF NEW CONSUMPTION: trusted, discoverable, the flags of an asset by kind and ref (an unknown asset is not trusted). */
  @Post('/trust')
  async trust(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Body() body: Payload) {
    const { envelope, principal } = ctx(req);
    const p = body.payload ?? {};
    const kind = typeof p['kind'] === 'string' ? p['kind'] : null; const ref = typeof p['ref'] === 'string' ? p['ref'] : null;
    if (kind === null || ref === null) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'catalog rejected (identity): a trust read names a kind and a ref'), 422);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.catalog.read', null), CatalogCapability.read,
      async (cap) => ({ trust: await cap.trust(kind, ref) }));
    return { ...out.result, receipt: receipt(out) };
  }

  @Post('/assets/:assetId/read')
  async read(@Req() req: EyeRequest, @Param('tenantId') tenantId: string, @Param('domainId') domainId: string, @Param('assetId') assetId: string) {
    const { envelope, principal } = ctx(req);
    assertCatalogUuid(assetId, 'catalog asset', 'asset', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'products.catalog.read', assetId), CatalogCapability.read,
      async (cap) => ({ at: await cap.now(), asset: await cap.asset(assetId) }));
    if (out.result.asset === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, `catalog asset rejected (unknown_asset): ${assetId} is not a catalog asset of this domain`), 404);
    // the same rule the search serves under: an entry classified above the reader's clearance is not read by its id either
    assertClearance(principal, { tenantId, domainId }, String(out.result.asset['classification']), 'catalog asset', envelope.correlation_id);
    return { ...out.result, receipt: receipt(out) };
  }
}
