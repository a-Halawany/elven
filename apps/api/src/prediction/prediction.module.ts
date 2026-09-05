/**
 * The prediction module — Phase 4 (L6–L7 Prediction + Scenario Intelligence).
 *
 * It imports the pipeline, the observation module (evidence retrieval, reused
 * as built) and the graph module (the Strategy Graph it joins). It is imported
 * by none of them: Phases 0–3 stay free of any Phase 4 dependency, in the
 * direction ES-04-003 requires.
 */
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { ObservationModule } from '../observation/observation.module.js';
import { GraphModule } from '../graph/graph.module.js';
import { PredictionController } from './prediction.controller.js';
import { SeriesService } from './series/series.service.js';
import { ForecastingService } from './forecasting/forecasting.service.js';
import { ScenariosService } from './scenarios/scenarios.service.js';
import { ObservationExceptionFilter } from '../observation/observation.filter.js';

@Module({
  imports: [PipelineModule, ObservationModule, GraphModule],
  controllers: [PredictionController],
  providers: [
    SeriesService,
    ForecastingService,
    ScenariosService,
    { provide: APP_FILTER, useClass: ObservationExceptionFilter },
  ],
  exports: [SeriesService, ForecastingService, ScenariosService],
})
export class PredictionModule {}
