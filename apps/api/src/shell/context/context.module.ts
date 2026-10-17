/**
 * B80 §CB (0118 §CB) — THE OPERATING CONTEXT BAR module: the bar's read, the impact preview and the deliberate commit
 * (ContextBarController). It reads and writes through SQL ports only and imports no feature module (the Nest cycle rule).
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../../pipeline/pipeline.module.js';
import { PolicyModule } from '../../policy/policy.module.js';
import { ContextBarController } from './context.controller.js';
import { ContextBarService } from './context.service.js';

@Module({
  imports: [PipelineModule, PolicyModule],
  controllers: [ContextBarController],
  providers: [ContextBarService],
})
export class ContextBarModule {}
