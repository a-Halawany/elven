/**
 * THE COMMERCIAL MODULE — CP-6 B91 (migration 0105): usage metering, the cost ledger, entitlements and licensing. The prelude's (§0) module;
 * each part registers its controller and services inside its own B91 part block (a comment pair naming the part) so the integration is
 * additive. THE BOUNDARY (ADR-022): an entitlement, a cap, a budget or an optimisation makes a capability UNAVAILABLE, explained — it never
 * removes a mandatory control, never sells or removes human authority, never weakens isolation, residency or recovery, never destroys work.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { ExecutiveModule } from '../executive/executive.module.js';
/* B91 entitlements */
import { EntitlementsTenantController, EntitlementsVendorController } from './entitlements/entitlements.controller.js';
import { EntitlementService } from './entitlements/entitlement.service.js';
/* end B91 entitlements */
/* B91 grace */
import { GraceController } from './grace/grace.controller.js';
import { GraceService } from './grace/grace.service.js';
import { LicenceSigningKeyStore } from './grace/licence-token.js';
/* end B91 grace */
/* B91 ledger */
import { LedgerDomainController, LedgerPlatformController, LedgerTenantController } from './ledger/ledger.controller.js';
import { LedgerService } from './ledger/ledger.service.js';
import { LedgerStepService } from './ledger/ledger-step.js';
/* end B91 ledger */
/* B91 meters */
import { MetersController } from './meters/meters.controller.js';
import { MetersService } from './meters/meters.service.js';
/* end B91 meters */

@Module({
  imports: [PipelineModule, ExecutiveModule],
  controllers: [
    /* B91 entitlements */ EntitlementsVendorController, EntitlementsTenantController, /* end B91 entitlements */
    /* B91 grace */ GraceController, /* end B91 grace */
    /* B91 ledger */ LedgerPlatformController, LedgerTenantController, LedgerDomainController, /* end B91 ledger */
    /* B91 meters */ MetersController, /* end B91 meters */
  ],
  providers: [
    /* B91 entitlements */ EntitlementService, /* end B91 entitlements */
    /* B91 grace */ GraceService, LicenceSigningKeyStore, /* end B91 grace */
    /* B91 ledger */ LedgerService, LedgerStepService, /* end B91 ledger */
    /* B91 meters */ MetersService, /* end B91 meters */
  ],
})
export class CommercialModule {}
