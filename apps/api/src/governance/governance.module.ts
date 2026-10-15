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
/* B107 conformance */ /* end B107 conformance */
/* B107 ownership */ /* end B107 ownership */
/* B107 workspace */ /* end B107 workspace */
/* B107 acceptance */ /* end B107 acceptance */
/* B107 design */ /* end B107 design */

@Module({
  imports: [PipelineModule],
  controllers: [
    /* B107 registries */ RegistriesController, RegistriesDomainController, /* end B107 registries */
    /* B107 conformance */ /* end B107 conformance */
    /* B107 ownership */ /* end B107 ownership */
    /* B107 workspace */ /* end B107 workspace */
    /* B107 acceptance */ /* end B107 acceptance */
    /* B107 design */ /* end B107 design */
  ],
  providers: [
    /* B107 registries */ RegistriesService, /* end B107 registries */
    /* B107 conformance */ /* end B107 conformance */
    /* B107 ownership */ /* end B107 ownership */
    /* B107 workspace */ /* end B107 workspace */
    /* B107 acceptance */ /* end B107 acceptance */
    /* B107 design */ /* end B107 design */
  ],
})
export class GovernanceModule {}
