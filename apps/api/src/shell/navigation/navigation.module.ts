/**
 * B80 §SH (0118_b80_x_sh) — THE NAVIGATION module: the principal's own navigation states (PLATFORM and DOMAIN) and the deep link's warning
 * as-of read. It reads other schemas through SQL only and imports no other domain module (the Nest cycle rule).
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../../pipeline/pipeline.module.js';
import { NavigationDomainController, NavigationPlatformController } from './navigation.controller.js';
import { NavigationService } from './navigation.service.js';

@Module({
  imports: [PipelineModule],
  controllers: [NavigationDomainController, NavigationPlatformController],
  providers: [NavigationService],
})
export class NavigationModule {}
