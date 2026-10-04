/**
 * CP-6 B91 §LE (0105 §LE) — THE LEDGER'S ROUTES. Same envelope, capabilities and receipts as every governed route; every read is
 * `commercial.ledger.read` (consequential, audited), every write its own exact action (the B91 ledger PDP rules).
 *
 * THE COMMERCIAL AUTHORITY (PLATFORM) — base /v1/commercial/ledger:
 *   POST /read                                 commercial.ledger.read          (the rate cards, the tenants, the optimisations; a tenant's ledger when named)
 *   POST /rate-cards/set                       commercial.rate.set             (a new version of a dimension × unit's price from an instant; human-gated)
 *   POST /allocation-keys/set                  commercial.allocation.set       (a tenant's allocation of tenant-level usage; human-gated)
 *   POST /invoices/import                      commercial.invoice.import       (SYNTHETIC invoices only — a real billing account is the external prerequisite)
 *   POST /invoices/:invoiceId/reconcile        commercial.invoice.reconcile    (the invoice's lines against the ledger's totals, with the differences)
 *   POST /optimisations/record                 commercial.optimisation.record  (the decision with its trade-offs; a protected control is refused)
 * THE TENANT (TENANT) — base /v1/tenants/:tenantId/commercial/ledger, and a DOMAIN's view — base /v1/tenants/:tenantId/domains/:domainId/commercial/ledger:
 *   POST /read                                 commercial.ledger.read          (the ledger view: budgets + variance + forecast, totals, unpriced, unit cost, energy, invoices)
 *   POST /entries                              commercial.ledger.read          (the cost entries of a window)
 *   POST /budgets/set                          commercial.budget.set           (declare: the tenant administrator; revise: the administrator or the owner; human-gated)
 *   POST /budgets/:budgetId/read               commercial.ledger.read          (the budget's versions, events and variance)
 */
import { Body, Controller, HttpException, Param, Post, Req } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import { requireCorrelation } from '../../shared/correlation.js';
import { PipelineService } from '../../pipeline/pipeline.service.js';
import type { EyeRequest } from '../../pipeline/http.js';
import { LedgerCapability } from './ledger.capabilities.js';
import { decimalOf, LedgerService, validateAllocationIntake, validateBudgetIntake, validateInvoiceIntake, validateOptimisationIntake, validateRateIntake } from './ledger.service.js';

type Row = Record<string, unknown>;
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
const platform = (action: string, objectType: string, objectId: string | null) => ({ scope: 'PLATFORM' as const, tenantId: null, domainId: null, action, objectType, objectId });

@Controller('/v1/commercial/ledger')
export class LedgerPlatformController {
  constructor(private readonly pipeline: PipelineService, private readonly ledger: LedgerService) {}

  @Post('/read')
  async read(@Req() req: EyeRequest, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, platform('commercial.ledger.read', 'CLG', null), LedgerCapability.read,
      async (cap) => this.ledger.platformView(cap, body?.payload ?? {}, envelope.correlation_id));
    return { ledger: out.result, receipt: receipt(out) };
  }

  @Post('/rate-cards/set')
  async setRateCard(@Req() req: EyeRequest, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateRateIntake(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, platform('commercial.rate.set', 'CRC', null), LedgerCapability.rate, async (cap) => {
      const r = await this.ledger.setRateCard(cap, intake, principal.principalId, envelope.correlation_id);
      return { result: r, targetType: 'CRC', targetId: String(r['rate_card_id']), targetVersion: String(r['version']), outboxEvent: null };
    });
    return { rateCard: out.result, receipt: receipt(out) };
  }

  @Post('/allocation-keys/set')
  async setAllocationKey(@Req() req: EyeRequest, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateAllocationIntake(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, platform('commercial.allocation.set', 'CAK', null), LedgerCapability.rate, async (cap) => {
      const r = await this.ledger.setAllocationKey(cap, intake, principal.principalId, envelope.correlation_id);
      return { result: r, targetType: 'CAK', targetId: String(r['allocation_key_id']), targetVersion: String(r['version']), outboxEvent: null };
    });
    return { allocationKey: out.result, receipt: receipt(out) };
  }

  @Post('/invoices/import')
  async importInvoice(@Req() req: EyeRequest, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateInvoiceIntake(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, platform('commercial.invoice.import', 'CIN', null), LedgerCapability.invoice, async (cap) => {
      const r = await this.ledger.importInvoice(cap, intake, principal.principalId, envelope.correlation_id);
      return { result: r, targetType: 'CIN', targetId: String(r['invoice_id']), targetVersion: '1', outboxEvent: null };
    });
    return { invoice: out.result, receipt: receipt(out) };
  }

  @Post('/invoices/:invoiceId/reconcile')
  async reconcile(@Req() req: EyeRequest, @Param('invoiceId') invoiceIdRaw: string, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const invoiceId = id(invoiceIdRaw, 'invoiceId', envelope.correlation_id);
    const tol = body?.payload?.['tolerance'];
    const tolerance = tol === undefined || tol === null ? null : decimalOf(tol);
    if (tolerance === null && tol !== undefined && tol !== null) throw new HttpException(errorBody('EYE_REQ_001', envelope.correlation_id, 'reconciliation rejected (tolerance): the tolerance is a decimal amount'), 422);
    const out = await this.pipeline.write(envelope, principal, platform('commercial.invoice.reconcile', 'CIN', invoiceId), LedgerCapability.invoice, async (cap) => {
      const r = await this.ledger.reconcileInvoice(cap, invoiceId, tolerance, principal.principalId, envelope.correlation_id);
      return { result: r, targetType: 'CRN', targetId: String(r['reconciliation_id']), targetVersion: String(r['version']), outboxEvent: null,
               evidence: { resultCode: `RECONCILIATION_${String(r['outcome']).toUpperCase()}`, metadata: { invoice_id: invoiceId, outcome: r['outcome'] } } };
    });
    return { reconciliation: out.result, receipt: receipt(out) };
  }

  @Post('/optimisations/record')
  async recordOptimisation(@Req() req: EyeRequest, @Body() body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateOptimisationIntake(body?.payload ?? {}, envelope.correlation_id);
    const out = await this.pipeline.write(envelope, principal, platform('commercial.optimisation.record', 'COP', null), LedgerCapability.optimisation, async (cap) => {
      const r = await this.ledger.recordOptimisation(cap, intake, principal.principalId, envelope.correlation_id);
      return { result: r, targetType: 'COP', targetId: String(r['decision_id']), targetVersion: '1', outboxEvent: null };
    });
    return { optimisation: out.result, receipt: receipt(out) };
  }
}

/** The tenant's routes and a domain's: one implementation, the route's scope decides (TENANT, or DOMAIN with its domain). */
abstract class LedgerScopedRoutes {
  constructor(protected readonly pipeline: PipelineService, protected readonly ledger: LedgerService) {}
  protected route(tenantId: string, domainId: string | null, action: string, objectType: string, objectId: string | null) {
    return domainId === null ? { scope: 'TENANT' as const, tenantId, domainId: null, action, objectType, objectId }
      : { scope: 'DOMAIN' as const, tenantId, domainId, action, objectType, objectId };
  }
  protected async doRead(req: EyeRequest, tenantId: string, domainId: string | null, body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'commercial.ledger.read', 'CLG', null), LedgerCapability.read,
      async (cap) => this.ledger.view(cap, tenantId, body?.payload ?? {}, envelope.correlation_id));
    return { ledger: out.result, receipt: receipt(out) };
  }
  protected async doEntries(req: EyeRequest, tenantId: string, domainId: string | null, body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'commercial.ledger.read', 'CLG', null), LedgerCapability.read,
      async (cap) => this.ledger.entries(cap, tenantId, body?.payload ?? {}, envelope.correlation_id));
    return { ...out.result, receipt: receipt(out) };
  }
  protected async doSetBudget(req: EyeRequest, tenantId: string, domainId: string | null, body: { payload?: Row }) {
    const { envelope, principal } = ctx(req);
    const intake = validateBudgetIntake(body?.payload ?? {}, envelope.correlation_id);
    // a domain route declares (or revises) its OWN domain's budget; the port refuses a tenant budget from a domain context
    const i = domainId !== null && intake.budgetId === null ? { ...intake, domainId: intake.domainId ?? domainId } : intake;
    const out = await this.pipeline.write(envelope, principal, this.route(tenantId, domainId, 'commercial.budget.set', 'CBG', intake.budgetId), LedgerCapability.budget, async (cap) => {
      const r = await this.ledger.setBudget(cap, tenantId, i, principal.principalId, envelope.correlation_id);
      return { result: r, targetType: 'CBG', targetId: String(r['budget_id']), targetVersion: String(r['version']), outboxEvent: null };
    });
    return { budget: out.result, receipt: receipt(out) };
  }
  protected async doReadBudget(req: EyeRequest, tenantId: string, domainId: string | null, budgetIdRaw: string) {
    const { envelope, principal } = ctx(req);
    const budgetId = id(budgetIdRaw, 'budgetId', envelope.correlation_id);
    const out = await this.pipeline.consequentialRead(envelope, principal, this.route(tenantId, domainId, 'commercial.ledger.read', 'CBG', budgetId), LedgerCapability.read,
      async (cap) => this.ledger.budget(cap, tenantId, budgetId));
    if (out.result === null) throw new HttpException(errorBody('EYE_STA_001', envelope.correlation_id, 'no authorized budget matches'), 404);
    return { budget: out.result, receipt: receipt(out) };
  }
}

@Controller('/v1/tenants/:tenantId/commercial/ledger')
export class LedgerTenantController extends LedgerScopedRoutes {
  constructor(pipeline: PipelineService, ledger: LedgerService) { super(pipeline, ledger); }
  @Post('/read') read(@Req() req: EyeRequest, @Param('tenantId') t: string, @Body() body: { payload?: Row }) { return this.doRead(req, t, null, body); }
  @Post('/entries') entries(@Req() req: EyeRequest, @Param('tenantId') t: string, @Body() body: { payload?: Row }) { return this.doEntries(req, t, null, body); }
  @Post('/budgets/set') setBudget(@Req() req: EyeRequest, @Param('tenantId') t: string, @Body() body: { payload?: Row }) { return this.doSetBudget(req, t, null, body); }
  @Post('/budgets/:budgetId/read') readBudget(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('budgetId') b: string) { return this.doReadBudget(req, t, null, b); }
}

@Controller('/v1/tenants/:tenantId/domains/:domainId/commercial/ledger')
export class LedgerDomainController extends LedgerScopedRoutes {
  constructor(pipeline: PipelineService, ledger: LedgerService) { super(pipeline, ledger); }
  @Post('/read') read(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: { payload?: Row }) { return this.doRead(req, t, d, body); }
  @Post('/entries') entries(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: { payload?: Row }) { return this.doEntries(req, t, d, body); }
  @Post('/budgets/set') setBudget(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Body() body: { payload?: Row }) { return this.doSetBudget(req, t, d, body); }
  @Post('/budgets/:budgetId/read') readBudget(@Req() req: EyeRequest, @Param('tenantId') t: string, @Param('domainId') d: string, @Param('budgetId') b: string) { return this.doReadBudget(req, t, d, b); }
}
