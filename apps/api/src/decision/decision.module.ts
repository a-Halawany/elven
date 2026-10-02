/**
 * The decision module — Phase 6 (L9 Decision Intelligence & Executive OS). It
 * imports the pipeline; it is imported by none of Phases 0–5, in the direction
 * ES-04-003 requires. Runs, twins, forecasts and the strategy graph are READ through
 * its own capability under RLS; nothing here writes into them.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { GraphModule } from '../graph/graph.module.js';
import { DecisionController } from './decision.controller.js';
import { PackageService } from './packages/package.service.js';
import { ApprovalService } from './approvals/approval.service.js';
import { ReplayService } from './replay/replay.service.js';
import { MonitoringService } from './monitoring/monitoring.service.js';
import { DecisionSubscriptionConsumer } from './subscriptions/decision-subscription.consumer.js';
/* B34 (0090) commitments */
import { CommitmentController } from './commitments/commitment.controller.js';
/* B36 (0094 §C4) collab: the enforced activation of a real execution target */ import { ExecutionActivationController } from './commitments/execution-activation.controller.js'; /* end B36 collab */
import { CommitmentService, ExecutionEgress } from './commitments/commitment.service.js';
import { CommitmentsSubscriptionConsumer } from './subscriptions/commitments.consumer.js';
/* end B34 commitments */
/* B36 (0094) gates: the gate completed — the signer by key reference (§0), the SYNTHETIC delivery adapters (B34's local sinks) for the distribution */
import { GateCompletionService } from './gates/gate-completion.service.js';
import { SignatureService } from '../executive/signatures/signature.service.js';
import { EmailChannel } from '../executive/attention/delivery/email.channel.js';
import { SmsChannel, TeamsChannel } from '../executive/attention/delivery/webhook.channel.js';
/* end B36 gates */

// CP-6 B6 (0063): the decision CONSUMER registers itself into the graph's dispatcher; the graph module
// imports nothing from here.
@Module({
  imports: [PipelineModule, GraphModule],
  controllers: [DecisionController, /* B34 (0090) commitments */ CommitmentController /* end B34 commitments */, /* B36 (0094 §C4) collab */ ExecutionActivationController /* end B36 collab */],
  providers: [PackageService, ApprovalService, ReplayService, MonitoringService, DecisionSubscriptionConsumer,
    /* B34 (0090) commitments */ CommitmentService, ExecutionEgress, CommitmentsSubscriptionConsumer /* end B34 commitments */,
    /* B36 (0094) gates */ GateCompletionService, SignatureService, EmailChannel, SmsChannel, TeamsChannel /* end B36 gates */],
  exports: [PackageService, ApprovalService, ReplayService, MonitoringService, /* B34 (0090) commitments */ CommitmentService, ExecutionEgress /* end B34 commitments */],
})
export class DecisionModule {}
