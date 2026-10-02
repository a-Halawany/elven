/**
 * The twin module — Phase 5 (L5 Digital Twins). It imports the pipeline and
 * the prediction module (series assembly through the known-at path, reused as
 * built). It is imported by none of them: Phases 0–4 stay free of any Phase 5
 * dependency, in the direction ES-04-003 requires.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { PredictionModule } from '../prediction/prediction.module.js';
import { GraphModule } from '../graph/graph.module.js';
import { TwinController } from './twin.controller.js';
import { TwinService } from './twins/twin.service.js';
import { SimulationService } from './simulations/simulation.service.js';
import { TwinSubscriptionConsumer } from './twins/twin-subscription.consumer.js';
/* B29 (0092) */
import { CompositionController } from './composition/composition.controller.js';
import { CompositionService } from './composition/composition.service.js';
import { SupplyNetworkService } from './supply-network/supply-network.service.js';
import { SupplyNetworkController } from './supply-network/supply-network.controller.js';
import { MethodRegistry } from './methods/method-registry.js';
import { ConstraintsController } from './constraints/constraints.controller.js';
import { MethodsController } from './methods/methods.controller.js';
import { ConstraintService } from './constraints/constraint.service.js';
import { CONSTRAINT_GATE } from './methods/types.js';
/* end B29 */
/* B31 impact */
import { ImpactController } from './simulations/impact/impact.controller.js';
import { ImpactService } from './simulations/impact/impact.service.js';
/* end B31 impact */
/* B31 orchestration */
import { OrchestrationController } from './simulations/orchestration/orchestration.controller.js';
import { OrchestrationService } from './simulations/orchestration/orchestration.service.js';
/* end B31 orchestration */
/* B31 validity */
import { ValidityController } from './simulations/validity/validity.controller.js';
/* end B31 validity */
/* B30 branches */
import { BranchesController } from './branches/branches.controller.js';
import { BranchService } from './branches/branch.service.js';
/* end B30 branches */
/* B30 envelope */
import { EnvelopeController } from './envelope/envelope.controller.js';
/* end B30 envelope */

// CP-6 B6 (0063): the twin CONSUMER of GraphChanged/MemoryCorrected registers itself into the graph's
// dispatcher at module init; the graph module imports nothing from here (the direction stays ES-04-003's).
@Module({
  imports: [PipelineModule, PredictionModule, GraphModule],
  controllers: [TwinController, /* B29 (0092) */ CompositionController, ConstraintsController, MethodsController, SupplyNetworkController,
    /* B31 impact */ ImpactController /* end B31 impact */,
    /* B31 orchestration */ OrchestrationController /* end B31 orchestration */,
    /* B31 validity */ ValidityController /* end B31 validity */,
    /* B30 branches */ BranchesController /* end B30 branches */,
    /* B30 envelope */ EnvelopeController /* end B30 envelope */],
  providers: [TwinService, SimulationService, TwinSubscriptionConsumer,
    /* B29 (0092) */ CompositionService, SupplyNetworkService, MethodRegistry, ConstraintService, { provide: CONSTRAINT_GATE, useExisting: ConstraintService },
    /* B31 impact */ ImpactService /* end B31 impact */,
    /* B31 orchestration */ OrchestrationService /* end B31 orchestration */,
    /* B30 branches */ BranchService /* end B30 branches */],
  exports: [TwinService, SimulationService, /* B29 (0092) */ SupplyNetworkService, /* B31 orchestration */ OrchestrationService],
})
export class TwinModule {}
