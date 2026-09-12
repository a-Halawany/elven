/**
 * The executive module — Phase 6 (L9 Executive OS): rooms, briefings, and (P6-M6)
 * the bounded agents. It imports the pipeline; it is imported by none of Phases 0–5
 * nor by the decision module.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { ObservationModule } from '../observation/observation.module.js';
import { DecisionModule } from '../decision/decision.module.js';
import { AgentsService } from './agents/agents.service.js';
import { AgentWorkerService } from './agents/agent-worker.service.js';
import { DecisionAgentSessionService } from './agents/agent-session.service.js';
import { ExecutiveController } from './executive.controller.js';
import { RoomService } from './rooms/room.service.js';
import { BriefingService } from './briefings/briefing.service.js';

@Module({
  imports: [PipelineModule, IdentityModule, ObservationModule, DecisionModule],
  controllers: [ExecutiveController],
  providers: [RoomService, BriefingService, AgentsService, AgentWorkerService, DecisionAgentSessionService],
  exports: [RoomService, BriefingService, AgentsService, AgentWorkerService],
})
export class ExecutiveModule {}
