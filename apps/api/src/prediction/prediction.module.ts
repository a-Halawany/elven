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
import { ForecastSubscriptionConsumer } from './subscriptions/forecast-subscription.consumer.js';
import { ScenarioSubscriptionConsumer } from './subscriptions/scenario-subscription.consumer.js';
import { ObservationExceptionFilter } from '../observation/observation.filter.js';
/* B28 (0088) warnings: the early-warning lifecycle (its tick steps join the attention tick; its consumer the dispatcher) */
import { ExecutiveModule } from '../executive/executive.module.js';
import { WarningLifecycleService } from './warnings/warning-lifecycle.service.js';
import { WarningsSubscriptionConsumer } from './warnings/warning-subscription.consumer.js';
/* end B28 warnings */
/* B28 (0088) signals: the weak-signal workbench — its own controller under the prediction prefix, and its reads */
import { SignalsController } from './signals/signals.controller.js';
import { SignalsService } from './signals/signals.service.js';
/* end B28 signals */
/* B28 (0088) streams */
import { StreamProcessorService } from './streams/stream-processor.service.js';
import { StreamRulesConsumer } from './streams/stream-rules.consumer.js';
/* end B28 streams */
/* B32 (0089) exposures: risk and opportunity intelligence — its own controller under the prediction prefix; the decision module for the
   package a response opens (DecisionModule imports nothing from here) */
import { DecisionModule } from '../decision/decision.module.js';
import { ExposuresController } from './exposures/exposures.controller.js';
/* B36 (0094 §C5) collab: the learn step */ import { ExposureLearningController } from './exposures/exposure-learning.controller.js'; /* end B36 collab */
import { ExposuresService } from './exposures/exposures.service.js';
/* end B32 exposures */
/* B27 anatomy (0097 §A): the scenario's anatomy — its own controller under …/prediction/scenarios/anatomy, and its service (the read's map) */
import { AnatomyController } from './scenarios/anatomy/anatomy.controller.js';
import { AnatomyService } from './scenarios/anatomy/anatomy.service.js';
/* end B27 anatomy */

@Module({
  imports: [PipelineModule, ObservationModule, GraphModule, /* B28 (0088) warnings: the attention tick's registry */ ExecutiveModule /* end B28 warnings */,
            /* B32 (0089) exposures */ DecisionModule /* end B32 exposures */],
  controllers: [PredictionController, /* B28 (0088) signals */ SignalsController /* end B28 signals */, /* B32 (0089) exposures */ ExposuresController /* end B32 exposures */, /* B36 (0094 §C5) collab */ ExposureLearningController /* end B36 collab */,
                /* B27 anatomy */ AnatomyController /* end B27 anatomy */],
  providers: [
    SeriesService,
    ForecastingService,
    ScenariosService,
    // CP-6 B6 (0063): the forecast and scenario CONSUMERS register themselves into the graph's dispatcher.
    ForecastSubscriptionConsumer,
    ScenarioSubscriptionConsumer,
    /* B28 (0088) warnings */ WarningLifecycleService, WarningsSubscriptionConsumer, /* end B28 warnings */
    /* B28 (0088) signals */ SignalsService /* end B28 signals */,
    /* B28 (0088) streams: the event-time stream processors (F-P4-11) — the service (its sweep a step of the attention tick) and the stream-rules consumer */
    StreamProcessorService,
    StreamRulesConsumer,
    /* end B28 streams */
    /* B32 (0089) exposures */ ExposuresService, /* end B32 exposures */
    /* B27 anatomy */ AnatomyService, /* end B27 anatomy */
    { provide: APP_FILTER, useClass: ObservationExceptionFilter },
  ],
  exports: [SeriesService, ForecastingService, ScenariosService],
})
export class PredictionModule {}
