import { Module } from '@nestjs/common';
import { ConfigModule } from './config/config.module.js';
import { SharedModule } from './shared/shared.module.js';
import { HealthModule } from './health/health.module.js';
import { IdentityModule } from './identity/identity.module.js';
import { TenancyModule } from './tenancy/tenancy.module.js';
import { PolicyModule } from './policy/policy.module.js';
import { AuditModule } from './audit/audit.module.js';
import { ObjectsModule } from './objects/objects.module.js';
import { PipelineModule } from './pipeline/pipeline.module.js';
import { ObservationModule } from './observation/observation.module.js';

@Module({
  imports: [
    ConfigModule,
    SharedModule,
    HealthModule,
    IdentityModule,
    TenancyModule,
    PolicyModule,
    AuditModule,
    ObjectsModule,
    PipelineModule,
    ObservationModule,
  ],
})
export class AppModule {}
