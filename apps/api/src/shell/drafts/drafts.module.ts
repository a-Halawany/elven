/**
 * B80 §CL-F (0118_b80_x_clf) — THE FORM DRAFTS module (PAT-03): a principal's versioned, expiring, personal drafts of a form — never a
 * submission. It reads and writes shell.* through its SQL ports only and imports no other business module.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../../pipeline/pipeline.module.js';
import { DraftsController } from './drafts.controller.js';
import { DraftsService } from './drafts.service.js';

@Module({ imports: [PipelineModule], controllers: [DraftsController], providers: [DraftsService] })
export class DraftsModule {}
