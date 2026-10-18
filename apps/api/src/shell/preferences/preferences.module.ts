/**
 * B81 §LY-G (0119_b81_x_lyg) — THE PREFERENCES module: the principal's own density and saved layouts (PLATFORM and DOMAIN). It reads
 * other schemas through SQL only and imports no other domain module (the Nest cycle rule). Registered inside the shell's unit (api.shell).
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../../pipeline/pipeline.module.js';
import { PreferencesDomainController, PreferencesPlatformController } from './preferences.controller.js';
import { PreferencesService } from './preferences.service.js';

@Module({
  imports: [PipelineModule],
  controllers: [PreferencesDomainController, PreferencesPlatformController],
  providers: [PreferencesService],
})
export class PreferencesModule {}
