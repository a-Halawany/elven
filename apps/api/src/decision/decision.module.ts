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

// CP-6 B6 (0063): the decision CONSUMER registers itself into the graph's dispatcher; the graph module
// imports nothing from here.
@Module({
  imports: [PipelineModule, GraphModule],
  controllers: [DecisionController],
  providers: [PackageService, ApprovalService, ReplayService, MonitoringService, DecisionSubscriptionConsumer],
  exports: [PackageService, ApprovalService, ReplayService, MonitoringService],
})
export class DecisionModule {}
