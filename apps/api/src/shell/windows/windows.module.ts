/**
 * B81 §LY-M (0119_b81_x_lym) — THE WINDOWS module: the person's session handoffs (offer → claim by another of their own signed-in sessions →
 * receipt; PAT-45) and their displays' presentation states (PAT-46, UX-16-002). It reads other schemas through SQL only and imports no other
 * domain module (the Nest cycle rule). Registered inside the shell's unit (api.shell).
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../../pipeline/pipeline.module.js';
import { WindowsDomainController, WindowsPlatformController } from './windows.controller.js';
import { WindowsService } from './windows.service.js';

@Module({
  imports: [PipelineModule],
  controllers: [WindowsDomainController, WindowsPlatformController],
  providers: [WindowsService],
})
export class WindowsModule {}
