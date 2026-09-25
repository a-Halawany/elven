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

import { RequestsService } from './requests/requests.service.js';
import { GraphModule } from '../graph/graph.module.js';
import { AttentionService } from './attention/attention.service.js';
import { AttentionConsumer, ObservationsConsumer, ProposalsConsumer, SourceHealthConsumer } from './attention/attention.consumers.js';
/* B23 (0084) attention */
import { ReviewsService } from './reviews/reviews.service.js';
/* end B23 attention */
@Module({
  imports: [PipelineModule, IdentityModule, ObservationModule, DecisionModule, GraphModule],
  controllers: [ExecutiveController],
  providers: [RoomService, BriefingService, AgentsService, AgentWorkerService, DecisionAgentSessionService, RequestsService, AttentionService,
    // B22 (0083): the four consumers of L1-I03, L1-I04, L2-I02 and the attention router (the graph module's dispatcher registers them).
    ObservationsConsumer, SourceHealthConsumer, ProposalsConsumer, AttentionConsumer,
    /* B23 (0084) attention: the governed review (L10-I03) */ ReviewsService /* end B23 attention */],
  exports: [RoomService, BriefingService, AgentsService, AgentWorkerService, RequestsService, AttentionService],
})
export class ExecutiveModule {}
