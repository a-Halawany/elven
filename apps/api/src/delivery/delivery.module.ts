/**
 * B94 (0114 §0) — THE PRODUCT DELIVERY module (WS-20): customer onboarding and governed migration (F-P7-F-04), the implementation programme,
 * adoption and enablement (F-P7-F-05), the service portal, governed support access and the customer control center (F-P7-F-06). Each part
 * registers its controllers and providers inside its own marked blocks below. It reads other schemas through SQL only and imports none of
 * their modules (the Nest cycle rule) — except the attention tick registry, which the after-tick hooks register on (as B33's packages do).
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
/* B94 onboarding */ /* end B94 onboarding */
/* B94 migration */ /* end B94 migration */
/* B94 implementation */ import { ImplementationDomainController, ImplementationTenantController } from './implementation/implementation.controller.js';
import { ImplementationService } from './implementation/implementation.service.js'; /* end B94 implementation */
/* B94 service */ /* end B94 service */
/* B94 support */ /* end B94 support */

@Module({
  imports: [PipelineModule],
  controllers: [
    /* B94 onboarding */ /* end B94 onboarding */
    /* B94 migration */ /* end B94 migration */
    /* B94 implementation */ ImplementationTenantController, ImplementationDomainController, /* end B94 implementation */
    /* B94 service */ /* end B94 service */
    /* B94 support */ /* end B94 support */
  ],
  providers: [
    /* B94 onboarding */ /* end B94 onboarding */
    /* B94 migration */ /* end B94 migration */
    /* B94 implementation */ ImplementationService, /* end B94 implementation */
    /* B94 service */ /* end B94 service */
    /* B94 support */ /* end B94 support */
  ],
})
export class DeliveryModule {}
