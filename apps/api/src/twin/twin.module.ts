/**
 * The twin module — Phase 5 (L5 Digital Twins). It imports the pipeline and
 * the prediction module (series assembly through the known-at path, reused as
 * built). It is imported by none of them: Phases 0–4 stay free of any Phase 5
 * dependency, in the direction ES-04-003 requires.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { PredictionModule } from '../prediction/prediction.module.js';
import { GraphModule } from '../graph/graph.module.js';
import { TwinController } from './twin.controller.js';
import { TwinService } from './twins/twin.service.js';
import { SimulationService } from './simulations/simulation.service.js';
import { TwinSubscriptionConsumer } from './twins/twin-subscription.consumer.js';

// CP-6 B6 (0063): the twin CONSUMER of GraphChanged/MemoryCorrected registers itself into the graph's
// dispatcher at module init; the graph module imports nothing from here (the direction stays ES-04-003's).
@Module({
  imports: [PipelineModule, PredictionModule, GraphModule],
  controllers: [TwinController],
  providers: [TwinService, SimulationService, TwinSubscriptionConsumer],
  exports: [TwinService, SimulationService],
})
export class TwinModule {}
