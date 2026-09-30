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
/* B90 metrics */
import { MetricsController } from './metrics/metrics.controller.js';
import { MetricsService } from './metrics/metrics.service.js';
/* end B90 metrics */

@Module({
  imports: [PipelineModule, ExecutiveModule],
  controllers: [ProductsController, /* B90 metrics */ MetricsController /* end B90 metrics */],
  providers: [ProductsService, /* B90 metrics */ MetricsService /* end B90 metrics */],
  exports: [ProductsService, /* B90 metrics */ MetricsService /* end B90 metrics */],
})
export class ProductsModule {}
