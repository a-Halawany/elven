/**
 * The executive module — Phase 6 (L9 Executive OS): rooms, briefings, and (P6-M6)
 * the bounded agents. It imports the pipeline; it is imported by none of Phases 0–5
 * nor by the decision module.
 */
import { SignatureService } from './signatures/signature.service.js'; // B36 §0 (0094)
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
/* B24 (0086) §0: the attention tick's steps (the timer host runs them; the sections register them) */
import { AttentionTickRegistry } from './attention/tick.js';
/* end B24 §0 */
/* B24 (0086) timer: the timer host (the escalate step) and the delivery port (the deliveries step, the two channels) */
import { AttentionTimerService } from './attention/attention-timer.service.js';
import { DeliveryService } from './attention/delivery/delivery.service.js';
import { InAppChannel } from './attention/delivery/in-app.channel.js';
import { DemoMailboxChannel } from './attention/delivery/demo-mailbox.channel.js';
/* end B24 timer */
/* B24 (0086) materiality: the rebalance tick step and the deprioritized view */
import { AttentionMaterialityService, AttentionRebalanceStep } from './attention/materiality.js';
/* end B24 materiality */
/* B24 (0086) governance */
import { AttentionGovernanceService } from './attention/governance.service.js';
/* end B24 governance */
/* B32 (0089) health */
import { HealthService } from './health/health.service.js';
/* end B32 health */
/* B34 (0090) workflow: the durable workflow engine, the human tasks' routes, the collaboration workspaces and their external collaborators,
   and the workflow timers' firing (the attention tick's steps workflow-timers 20 and collab-grant-expiry 22) */
import { WorkflowController } from './workflow/workflow.controller.js';
import { WorkflowService } from './workflow/workflow.service.js';
import { CollabService } from './workflow/collab.service.js';
import { WorkflowTimerRegistry, WorkflowTimerSteps } from './workflow/timers.js';
/* end B34 workflow */
/* B34-F1 (0091): the external collaborator's identity, on the identity authority */
import { CollabIdentityService } from './workflow/collab-identity.service.js';
/* end B34-F1 */
/* B34 (0090) attention: the act transition and the SYNTHETIC email / sms / teams adapters (local sinks only) */
import { AttentionActService } from './attention/act.service.js';
import { EmailChannel } from './attention/delivery/email.channel.js';
import { SmsChannel, TeamsChannel } from './attention/delivery/webhook.channel.js';
/* end B34 attention */
/* B36 (0094 §A) attention: the completion — the resume, accept-priority, the hold, the recovery routes, the context on the queue, forums */
import { AttentionB36Controller } from './attention/attention-b36.controller.js';
import { AttentionB36Service } from './attention/attention-b36.service.js';
/* end B36 attention */
@Module({
  imports: [PipelineModule, IdentityModule, ObservationModule, DecisionModule, GraphModule],
  controllers: [ExecutiveController, /* B34 (0090) workflow */ WorkflowController /* end B34 workflow */, /* B36 (0094 §A) attention */ AttentionB36Controller /* end B36 attention */],
  providers: [SignatureService /* B36 §0 (0094) */, RoomService, BriefingService, AgentsService, AgentWorkerService, DecisionAgentSessionService, RequestsService, AttentionService,
    // B22 (0083): the four consumers of L1-I03, L1-I04, L2-I02 and the attention router (the graph module's dispatcher registers them).
    ObservationsConsumer, SourceHealthConsumer, ProposalsConsumer, AttentionConsumer,
    /* B23 (0084) attention: the governed review (L10-I03) */ ReviewsService /* end B23 attention */,
    /* B24 (0086) §0 */ AttentionTickRegistry /* end B24 §0 */,
    /* B24 (0086) timer */ AttentionTimerService, DeliveryService, InAppChannel, DemoMailboxChannel /* end B24 timer */,
    /* B24 (0086) materiality */ AttentionMaterialityService, AttentionRebalanceStep /* end B24 materiality */,
    /* B24 (0086) governance: suppression approval, item delegation, disposition, queue evaluation (0086 §G) */ AttentionGovernanceService /* end B24 governance */,
    /* B32 (0089) health: the decomposable Strategic Health Score (0089 §H) */ HealthService /* end B32 health */,
    /* B34 (0090) workflow */ WorkflowService, CollabService, WorkflowTimerRegistry, WorkflowTimerSteps /* end B34 workflow */,
    /* B34-F1 (0091) */ CollabIdentityService /* end B34-F1 */,
    /* B34 (0090) attention */ AttentionActService, EmailChannel, SmsChannel, TeamsChannel /* end B34 attention */,
    /* B36 (0094 §A) attention */ AttentionB36Service /* end B36 attention */],
  exports: [SignatureService, RoomService, BriefingService, AgentsService, AgentWorkerService, RequestsService, AttentionService, AttentionTickRegistry,
    /* B24 (0086) timer */ AttentionTimerService, DeliveryService /* end B24 timer */,
    /* B34 (0090) workflow: the timer registry (the commitments and gates parts register their kinds' handlers) */ WorkflowTimerRegistry, CollabService /* end B34 workflow */],
})
export class ExecutiveModule {}
