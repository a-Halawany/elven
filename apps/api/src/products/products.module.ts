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

@Module({
  imports: [PipelineModule, ExecutiveModule],
  controllers: [ProductsController],
  providers: [ProductsService],
  exports: [ProductsService],
})
export class ProductsModule {}
