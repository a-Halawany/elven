/**
 * B81 §DG (0119_b81_x_dg) — THE DEGRADED-STATE module (F-P7-E-19): the degraded contracts of the platform's and a domain's dependencies, their
 * live state evaluated from the real signals, and the owner's verified exits. It reads other schemas through SQL only and imports no other
 * business module (the Nest cycle rule). Imported by ShellModule in its B81 dg block — one deployable unit, `api.shell`, so the composition
 * root and the component manifest map it once (the generated manifest is unchanged).
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../../pipeline/pipeline.module.js';
import { DegradedDomainController, DegradedPlatformController } from './degraded.controller.js';
import { DegradedService } from './degraded.service.js';

@Module({ imports: [PipelineModule], controllers: [DegradedDomainController, DegradedPlatformController], providers: [DegradedService] })
export class DegradedModule {}
