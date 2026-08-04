import { Module } from '@nestjs/common';
import { IdentityService } from './identity.service.js';
import { PrincipalsService } from './principals.service.js';

@Module({
  providers: [IdentityService, PrincipalsService],
  exports: [IdentityService, PrincipalsService],
})
export class IdentityModule {}
