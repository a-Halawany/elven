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
import { IntelligenceModule } from './intelligence/intelligence.module.js';
import { GraphModule } from './graph/graph.module.js';
import { PredictionModule } from './prediction/prediction.module.js';
import { TwinModule } from './twin/twin.module.js';

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
    IntelligenceModule,
    GraphModule,
    PredictionModule,
    TwinModule,
  ],
})
export class AppModule {}
