/**
 * The twin module — Phase 5 (L5 Digital Twins). It imports the pipeline and
 * the prediction module (series assembly through the known-at path, reused as
 * built). It is imported by none of them: Phases 0–4 stay free of any Phase 5
 * dependency, in the direction ES-04-003 requires.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { PredictionModule } from '../prediction/prediction.module.js';
import { TwinController } from './twin.controller.js';
import { TwinService } from './twins/twin.service.js';
import { SimulationService } from './simulations/simulation.service.js';

@Module({
  imports: [PipelineModule, PredictionModule],
  controllers: [TwinController],
  providers: [TwinService, SimulationService],
  exports: [TwinService, SimulationService],
})
export class TwinModule {}
