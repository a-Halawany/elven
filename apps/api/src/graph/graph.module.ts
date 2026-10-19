/**
 * The graph module — Phase 3 (L3–L4 Enterprise Memory + Knowledge Graph).
 *
 * It imports the pipeline, the observation module and the intelligence module —
 * the latter for the Model Gateway, so the ambiguous resolution tail reaches a
 * model through the SAME single egress Phase 2 built rather than a second one of
 * its own. It is imported by neither. The Phase 0 governance spine, the Phase 1
 * observation layer and the Phase 2 intelligence layer stay free of any Phase 3
 * dependency, in the direction ES-04-003 requires.
 */
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { ObservationModule } from '../observation/observation.module.js';
import { IntelligenceModule } from '../intelligence/intelligence.module.js';
import { GraphController } from './graph.controller.js';
import { GraphOrchestrator } from './graph.orchestrator.js';
import { ResolverService } from './entities/resolver.service.js';
import { EntitiesService } from './entities/entities.service.js';
import { ResolutionService } from './entities/resolution.service.js';
import { EdgesService } from './edges/edges.service.js';
import { StrategyService } from './strategy/strategy.service.js';
import { ImpactService } from './strategy/impact.service.js';
/* B32 (0089) graph */ import { StrategyAlignmentService } from './strategy/alignment.service.js'; /* end B32 graph */
/* B36 (0094 §S) strategy */ import { StrategyDetectionsService } from './strategy/detections.service.js'; /* end B36 strategy */
import { SearchService } from './search/search.service.js';
import { PropagationAgentSessionService } from './propagation/propagation-agent-session.service.js';
import { PropagationAgentsService } from './propagation/propagation-agents.service.js';
import { PropagationConsumerService } from './propagation/propagation-consumer.service.js';
import { SubscriptionSessionService } from './subscriptions/subscription-session.service.js';
import { SubscriptionDispatcherService } from './subscriptions/subscription-dispatcher.service.js';
import { SubscriptionsService } from './subscriptions/subscriptions.service.js';
import { RetrievalConsumer } from './subscriptions/consumers/retrieval.consumer.js';
import { MemoryMappingsConsumer } from './subscriptions/consumers/memory-mappings.consumer.js';
import { RelationshipsConsumer } from './subscriptions/consumers/relationships.consumer.js';
import { MemoryService } from './memory/memory.service.js';
import { ProjectionsService } from './projections/projections.service.js';
import { ProjectionsController } from './projections/projections.controller.js';
import { ObservationExceptionFilter } from '../observation/observation.filter.js';
/* B50 pv */ import { ProvenanceController } from './provenance/provenance.controller.js'; import { ProvenanceService } from './provenance/provenance.service.js'; /* end B50 pv */
/* B50 ci */ import { ImpactTriggersService } from './impact/impact-triggers.service.js'; import { ImpactB50Controller } from './impact/impact-b50.controller.js'; /* end B50 ci */
/* B50 cl */ import { ClosureB50Controller } from './closure/closure.controller.js'; import { ClosureService } from './closure/closure.service.js'; /* end B50 cl */
/* B50 tl */ import { TimelineController } from './timeline/timeline.controller.js'; /* end B50 tl */
/* B82 gm */ import { GeoController } from './geo/geo.controller.js'; import { GeoService } from './geo/geo.service.js'; /* end B82 gm */

/*
 * CP-6 B1 (0060): the propagation consumer lives here — it is the graph's walk, run by the
 * graph's agent. It imports the identity module for the agent's principal and session (as
 * the executive module does) and the observation module's scheduler for its queue; the
 * observation layer still imports nothing from Phase 3.
 */
@Module({
  imports: [PipelineModule, IdentityModule, ObservationModule, IntelligenceModule],
  // CP-6 B20 (0080): the projection partitions' two governed acts (withdraw, rebuild) on the same base path as the graph routes.
  controllers: [GraphController, ProjectionsController, /* B50 pv: provenance, explain, unfit, contest (0120_b50_x_pv) */ ProvenanceController /* end B50 pv */, /* B50 ci: the impact triggers and the classed products (0120 §CI) */ ImpactB50Controller /* end B50 ci */, /* B50 cl: correction-propagation closure (0120 §CL) */ ClosureB50Controller /* end B50 cl */, /* B50 tl: the timeline, the as-of explorer, the trace (0120 §TL) */ TimelineController /* end B50 tl */, /* B82 gm: the geographic references the map canvases draw (0121 §GM) */ GeoController /* end B82 gm */],
  providers: [
    GraphOrchestrator,
    ResolverService,
    EntitiesService,
    ResolutionService,
    EdgesService,
    StrategyService,
    ImpactService,
    /* B32 (0089) graph */ StrategyAlignmentService, /* end B32 graph */
    /* B36 (0094 §S) strategy: the revocation, the scheduled detections (a tick step), the plan links */ StrategyDetectionsService, /* end B36 strategy */
    SearchService,
    PropagationAgentSessionService,
    PropagationAgentsService,
    PropagationConsumerService,
    // CP-6 B6 (0063): the subscription registry, the dispatcher and the two graph-side consumers
    // (retrieval, memory mappings). The twin, prediction and decision consumers live in their own
    // modules and register themselves into the dispatcher — the graph imports none of them.
    SubscriptionSessionService,
    SubscriptionDispatcherService,
    SubscriptionsService,
    RetrievalConsumer,
    MemoryMappingsConsumer,
    RelationshipsConsumer,
    MemoryService,
    ProjectionsService,
    /* B50 pv */ ProvenanceService, /* end B50 pv */
    /* B50 ci */ ImpactTriggersService, /* end B50 ci */
    /* B50 cl: the closure sweep's attention-tick step */ ClosureService, /* end B50 cl */
    /* B82 gm */ GeoService, /* end B82 gm */
    // The same filter the observation and intelligence routes use. A deliberate
    // refusal from a graph port is a rule, not a crash, and answers as one.
    { provide: APP_FILTER, useClass: ObservationExceptionFilter },
  ],
  exports: [GraphOrchestrator, ImpactService, EntitiesService, ResolutionService,
            EdgesService, StrategyService, SearchService, PropagationAgentsService, PropagationConsumerService,
            SubscriptionDispatcherService, SubscriptionsService, /* B50 ci */ ImpactTriggersService /* end B50 ci */],
})
export class GraphModule {}
