import { Module } from '@nestjs/common';
import { PdpService } from './pdp.service.js';

@Module({
  providers: [PdpService],
  exports: [PdpService],
})
export class PolicyModule {}
