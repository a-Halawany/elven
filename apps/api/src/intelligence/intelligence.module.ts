/**
 * The intelligence module — Phase 2 (L2 Intelligence Layer).
 *
 * It imports the pipeline and the observation module (for the vault, so extraction
 * can read the preserved bytes it makes claims about) and is imported by neither.
 * The Phase 0 governance spine and the Phase 1 observation layer stay free of any
 * Phase 2 dependency, in the same direction ES-04-003 requires.
 */
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { ObservationModule } from '../observation/observation.module.js';
import { IntelligenceController } from './intelligence.controller.js';
import { MethodsService } from './methods/methods.service.js';
import { ModelGatewayService } from './gateway/model-gateway.service.js';
import { ExtractionService } from './extraction/extraction.service.js';
import { ExtractionOrchestrator } from './extraction/orchestrator.service.js';
import { ReviewService } from './review/review.service.js';
import { ObservationExceptionFilter } from '../observation/observation.filter.js';

@Module({
  imports: [PipelineModule, IdentityModule, ObservationModule],
  controllers: [IntelligenceController],
  providers: [
    MethodsService,
    ModelGatewayService,
    ExtractionService,
    ExtractionOrchestrator,
    ReviewService,
    // The same filter the observation routes use. A deliberate refusal from an
    // intelligence port is a rule, not a crash, and answers as one.
    { provide: APP_FILTER, useClass: ObservationExceptionFilter },
  ],
  exports: [ModelGatewayService, ExtractionOrchestrator],
})
export class IntelligenceModule {}
