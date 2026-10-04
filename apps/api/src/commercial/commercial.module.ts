/**
 * THE COMMERCIAL MODULE — CP-6 B91 (migration 0105): usage metering, the cost ledger, entitlements and licensing. The prelude's (§0) module;
 * each part registers its controller and services inside its own B91 part block (a comment pair naming the part) so the integration is
 * additive. THE BOUNDARY (ADR-022): an entitlement, a cap, a budget or an optimisation makes a capability UNAVAILABLE, explained — it never
 * removes a mandatory control, never sells or removes human authority, never weakens isolation, residency or recovery, never destroys work.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { ExecutiveModule } from '../executive/executive.module.js';

@Module({
  imports: [PipelineModule, ExecutiveModule],
  controllers: [],
  providers: [],
})
export class CommercialModule {}
