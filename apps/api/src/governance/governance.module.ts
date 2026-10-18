/**
 * B107 (0115 §0) — THE GOVERNANCE module: registries and traceability, conformance manifests, data governance and ownership, the product-
 * governance workspace, acceptance records, design governance. Each part registers its controllers and providers inside its own marked
 * blocks below. It reads other schemas through SQL only and imports none of their modules (the Nest cycle rule) — except the attention
 * tick registry and the workflow timer registry, reached through ModuleRef (as B94's support part does).
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
/* B107 registries */
import { RegistriesController, RegistriesDomainController } from './registries/registries.controller.js';
import { RegistriesService } from './registries/registries.service.js';
/* end B107 registries */
/* B107 conformance */ import { ConformanceController } from './conformance/conformance.controller.js';
import { ConformanceService } from './conformance/conformance.service.js'; /* end B107 conformance */
/* B107 ownership */
import { OwnershipDomainController, OwnershipPlatformController } from './ownership/ownership.controller.js';
import { OwnershipService } from './ownership/ownership.service.js';
/* end B107 ownership */
/* B107 workspace */
import { WorkspaceController } from './workspace/workspace.controller.js';
import { WorkspaceService } from './workspace/workspace.service.js';
/* end B107 workspace */
/* B107 acceptance */
import { AcceptanceController, AcceptancePlatformController } from './acceptance/acceptance.controller.js';
import { AcceptanceService } from './acceptance/acceptance.service.js';
/* end B107 acceptance */
/* B107 design */
import { DesignDomainController, DesignPlatformController } from './design/design.controller.js';
import { DesignGovernanceService } from './design/design.service.js';
/* end B107 design */

@Module({
  imports: [PipelineModule],
  controllers: [
    /* B107 registries */ RegistriesController, RegistriesDomainController, /* end B107 registries */
    /* B107 conformance */ ConformanceController, /* end B107 conformance */
    /* B107 ownership */ OwnershipDomainController, OwnershipPlatformController, /* end B107 ownership */
    /* B107 workspace */ WorkspaceController, /* end B107 workspace */
    /* B107 acceptance */ AcceptanceController, AcceptancePlatformController, /* end B107 acceptance */
    /* B107 design */ DesignPlatformController, DesignDomainController, /* end B107 design */
  ],
  providers: [
    /* B107 registries */ RegistriesService, /* end B107 registries */
    /* B107 conformance */ ConformanceService, /* end B107 conformance */
    /* B107 ownership */ OwnershipService, /* end B107 ownership */
    /* B107 workspace */ WorkspaceService, /* end B107 workspace */
    /* B107 acceptance */ AcceptanceService, /* end B107 acceptance */
    /* B107 design */ DesignGovernanceService, /* end B107 design */
  ],
})
export class GovernanceModule {}
