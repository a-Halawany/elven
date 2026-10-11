/**
 * B92 (0113 §0) — THE ANALYTICS module: product analytics, the metric catalog and UX telemetry (F-P7-F-03). The prelude's compute surface
 * (compute, replay, the result reads) is real; each part registers its controllers and providers inside its own marked blocks below. It reads
 * other schemas through SQL only and imports none of their modules (the Nest cycle rule); it imports the pipeline.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
/* B92 §0 */ import { AnalyticsComputeController } from './compute/compute.controller.js'; import { AnalyticsComputeService } from './compute/compute.service.js'; /* end B92 §0 */
/* B92 definitions */ /* end B92 definitions */
/* B92 computations-a */ /* end B92 computations-a */
/* B92 computations-b */ /* end B92 computations-b */
/* B92 comparability */ /* end B92 comparability */
/* B92 experience */ /* end B92 experience */
/* B92 review */ /* end B92 review */

@Module({
  imports: [PipelineModule],
  controllers: [
    /* B92 §0 */ AnalyticsComputeController, /* end B92 §0 */
    /* B92 definitions */ /* end B92 definitions */
    /* B92 computations-a */ /* end B92 computations-a */
    /* B92 computations-b */ /* end B92 computations-b */
    /* B92 comparability */ /* end B92 comparability */
    /* B92 experience */ /* end B92 experience */
    /* B92 review */ /* end B92 review */
  ],
  providers: [
    /* B92 §0 */ AnalyticsComputeService, /* end B92 §0 */
    /* B92 definitions */ /* end B92 definitions */
    /* B92 computations-a */ /* end B92 computations-a */
    /* B92 computations-b */ /* end B92 computations-b */
    /* B92 comparability */ /* end B92 comparability */
    /* B92 experience */ /* end B92 experience */
    /* B92 review */ /* end B92 review */
  ],
  exports: [/* B92 §0 */ AnalyticsComputeService /* end B92 §0 */],
})
export class AnalyticsModule {}
