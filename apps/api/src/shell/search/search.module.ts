/**
 * B81 §SI (0119_b81_x_si) — THE SEARCH AND INTENT module: the principal's own saved searches and intent records (DOMAIN). It reads other
 * schemas through SQL only (the policy record a leg's receipt names) and imports no other domain module (the Nest cycle rule). Registered
 * inside the shell's unit (api.shell), as §DG and §LY-G are, so the component manifest's units are unchanged.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../../pipeline/pipeline.module.js';
import { SearchController } from './search.controller.js';
import { SearchService } from './search.service.js';

@Module({
  imports: [PipelineModule],
  controllers: [SearchController],
  providers: [SearchService],
})
export class SearchModule {}
