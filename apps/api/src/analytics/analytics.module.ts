/**
 * B92 (0113 §0) — THE ANALYTICS module: product analytics, the metric catalog and UX telemetry (F-P7-F-03). The prelude's compute surface
 * (compute, replay, the result reads) is real; each part registers its controllers and providers inside its own marked blocks below. It reads
 * other schemas through SQL only and imports none of their modules (the Nest cycle rule); it imports the pipeline.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
/* B92 §0 */ import { AnalyticsComputeController } from './compute/compute.controller.js'; import { AnalyticsComputeService } from './compute/compute.service.js'; /* end B92 §0 */
/* B92 definitions */ import { AnalyticsDefinitionsController } from './definitions/definitions.controller.js'; import { AnalyticsDefinitionsService } from './definitions/definitions.service.js'; /* end B92 definitions */
/* B92 computations-a */ /* end B92 computations-a */
/* B92 computations-b */ /* end B92 computations-b */
/* B92 comparability */ import { ComparabilityController } from './comparability/comparability.controller.js'; import { ComparabilityService } from './comparability/comparability.service.js'; /* end B92 comparability */
/* B92 experience */ import { ExperienceController } from './experience/experience.controller.js'; import { ExperienceService } from './experience/experience.service.js'; /* end B92 experience */
/* B92 review */ import { AnalyticsReviewController } from './review/review.controller.js'; import { AnalyticsReviewService } from './review/review.service.js'; /* end B92 review */

@Module({
  imports: [PipelineModule],
  controllers: [
    /* B92 §0 */ AnalyticsComputeController, /* end B92 §0 */
    /* B92 definitions */ AnalyticsDefinitionsController, /* end B92 definitions */
    /* B92 computations-a */ /* end B92 computations-a */
    /* B92 computations-b */ /* end B92 computations-b */
    /* B92 comparability */ ComparabilityController, /* end B92 comparability */
    /* B92 experience */ ExperienceController, /* end B92 experience */
    /* B92 review */ AnalyticsReviewController, /* end B92 review */
  ],
  providers: [
    /* B92 §0 */ AnalyticsComputeService, /* end B92 §0 */
    /* B92 definitions */ AnalyticsDefinitionsService, /* end B92 definitions */
    /* B92 computations-a */ /* end B92 computations-a */
    /* B92 computations-b */ /* end B92 computations-b */
    /* B92 comparability */ ComparabilityService, /* end B92 comparability */
    /* B92 experience */ ExperienceService, /* end B92 experience */
    /* B92 review */ AnalyticsReviewService, /* end B92 review */
  ],
  exports: [/* B92 §0 */ AnalyticsComputeService /* end B92 §0 */],
})
export class AnalyticsModule {}
