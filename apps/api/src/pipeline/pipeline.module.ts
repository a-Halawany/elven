import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { IdentityModule } from '../identity/identity.module.js';
import { AuditModule } from '../audit/audit.module.js';
import { PolicyModule } from '../policy/policy.module.js';
import { PipelineService } from './pipeline.service.js';
import { AuthGuard, EnvelopeGuard, EyeExceptionFilter } from './http.js';
import { AuthController } from './auth.controller.js';
import { AdminControllers } from './admin.controllers.js';

@Module({
  imports: [IdentityModule, AuditModule, PolicyModule],
  controllers: [AuthController, AdminControllers],
  providers: [
    PipelineService,
    { provide: APP_GUARD, useClass: EnvelopeGuard }, // step 1 — envelope before payload
    { provide: APP_GUARD, useClass: AuthGuard },     // step 2 — authenticate before scope
    { provide: APP_FILTER, useClass: EyeExceptionFilter },
  ],
  exports: [PipelineService],
})
export class PipelineModule {}
