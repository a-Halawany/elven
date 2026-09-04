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
import { SearchService } from './search/search.service.js';
import { ObservationExceptionFilter } from '../observation/observation.filter.js';

@Module({
  imports: [PipelineModule, ObservationModule, IntelligenceModule],
  controllers: [GraphController],
  providers: [
    GraphOrchestrator,
    ResolverService,
    EntitiesService,
    ResolutionService,
    EdgesService,
    StrategyService,
    ImpactService,
    SearchService,
    // The same filter the observation and intelligence routes use. A deliberate
    // refusal from a graph port is a rule, not a crash, and answers as one.
    { provide: APP_FILTER, useClass: ObservationExceptionFilter },
  ],
  exports: [GraphOrchestrator, ImpactService, EntitiesService, ResolutionService,
            EdgesService, StrategyService, SearchService],
})
export class GraphModule {}
