import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { TenancyService } from './tenancy.service.js';
import { TenancyController } from './tenancy.controller.js';

@Module({
  imports: [PipelineModule],
  controllers: [TenancyController],
  providers: [TenancyService],
  exports: [TenancyService],
})
export class TenancyModule {}
