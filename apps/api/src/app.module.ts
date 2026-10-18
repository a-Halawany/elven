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
import { DecisionModule } from './decision/decision.module.js';
import { ExecutiveModule } from './executive/executive.module.js';
/* B90 (0095): the data product registry, event products, the semantic layer, the catalog */
import { ProductsModule } from './products/products.module.js';
import { CommercialModule } from './commercial/commercial.module.js';
/* end B90 */
import { RetentionModule } from './retention/retention.module.js';
/* B33 (0111 §0.8): the domain-package framework and competitor intelligence (§PK, §CI) */
import { DomainsModule } from './domains/domains.module.js';
import { AnalyticsModule } from './analytics/analytics.module.js';
import { DeliveryModule } from './delivery/delivery.module.js';
import { GovernanceModule } from './governance/governance.module.js';
/* end B33 */
/* B80 (0118 §CL-F, §SH) */ import { ShellModule } from './shell/shell.module.js'; /* end B80 */
/* B81 dg */ import { DegradedModule } from './shell/degraded/degraded.module.js'; /* end B81 dg */

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
    DecisionModule,
    ExecutiveModule,
    /* B90 (0095) */ ProductsModule /* end B90 */,
    /* B91 (0105) */ CommercialModule /* end B91 */,
    /* B33 (0111) */ DomainsModule /* end B33 */,
    /* B92 (0113) */ AnalyticsModule /* end B92 */,
    /* B94 (0114) */ DeliveryModule /* end B94 */,
    /* B107 (0115) */ GovernanceModule /* end B107 */,
    /* B80 (0118) */ ShellModule /* end B80 */,
    /* B81 dg */ DegradedModule /* end B81 dg */,
    RetentionModule,
  ],
})
export class AppModule {}
