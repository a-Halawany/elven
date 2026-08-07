import { Module } from '@nestjs/common';
import { HealthController } from './health.controller.js';
import { DegradedReconciliationService } from './degraded-reconciliation.service.js';

@Module({ controllers: [HealthController], providers: [DegradedReconciliationService] })
export class HealthModule {}
