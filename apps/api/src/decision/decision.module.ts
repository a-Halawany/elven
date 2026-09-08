/**
 * The decision module — Phase 6 (L9 Decision Intelligence & Executive OS). It
 * imports the pipeline; it is imported by none of Phases 0–5, in the direction
 * ES-04-003 requires. Runs, twins, forecasts and the strategy graph are READ through
 * its own capability under RLS; nothing here writes into them.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { DecisionController } from './decision.controller.js';
import { PackageService } from './packages/package.service.js';
import { ApprovalService } from './approvals/approval.service.js';

@Module({
  imports: [PipelineModule],
  controllers: [DecisionController],
  providers: [PackageService, ApprovalService],
  exports: [PackageService, ApprovalService],
})
export class DecisionModule {}
