/**
 * THE PRODUCTS MODULE — CP-6 B90 (migration 0095): the data product registry core (§0, the integrator) and, beside it, the parts' own
 * controllers and services (§R consumers / scorecards / lifecycle, §E event products and subscriptions, §M the semantic layer, §K the
 * catalog), each registered inside its own B90 part block (a comment pair naming the part) so the integration is additive.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { ExecutiveModule } from '../executive/executive.module.js';
import { ProductsController } from './products.controller.js';
import { ProductsService } from './products.service.js';
/* B90 events */
import { EventsController } from './events/events.controller.js';
import { EventsService } from './events/events.service.js';
/* end B90 events */

@Module({
  imports: [PipelineModule, ExecutiveModule],
  controllers: [ProductsController, /* B90 events */ EventsController /* end B90 events */],
  providers: [ProductsService, /* B90 events */ EventsService /* end B90 events */],
  exports: [ProductsService, /* B90 events */ EventsService /* end B90 events */],
})
export class ProductsModule {}
