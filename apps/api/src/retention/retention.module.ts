/**
 * The retention module — CP-6 B9 (0066 §4): governed retention actions as durable workflows (ES-29-004). It imports the
 * pipeline and the observation module (the vault, for the bytes and their verification); it is imported by none of
 * the phase modules.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { ObservationModule } from '../observation/observation.module.js';
import { RetentionController } from './retention.controller.js';
import { RetentionService } from './retention.service.js';

@Module({
  imports: [PipelineModule, ObservationModule],
  controllers: [RetentionController],
  providers: [RetentionService],
  exports: [RetentionService],
})
export class RetentionModule {}
