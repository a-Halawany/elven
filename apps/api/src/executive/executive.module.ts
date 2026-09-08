/**
 * The executive module — Phase 6 (L9 Executive OS): rooms, briefings, and (P6-M6)
 * the bounded agents. It imports the pipeline; it is imported by none of Phases 0–5
 * nor by the decision module.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { ExecutiveController } from './executive.controller.js';
import { RoomService } from './rooms/room.service.js';
import { BriefingService } from './briefings/briefing.service.js';

@Module({
  imports: [PipelineModule],
  controllers: [ExecutiveController],
  providers: [RoomService, BriefingService],
  exports: [RoomService, BriefingService],
})
export class ExecutiveModule {}
