/**
 * The observation module — Phase 1 (L1 World Observation Layer).
 *
 * It imports the pipeline and identity modules and is imported by neither, so the
 * Phase 0 governance spine stays free of any Phase 1 dependency (ES-04-003). The
 * vault roots are created at module init and the two-root separation is verified
 * there, so a misconfigured deployment fails at startup rather than at the first
 * admission.
 */
import { Module, type OnModuleInit } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { ObservationController } from './observation.controller.js';
import { UploadController } from './sources/upload.controller.js';
import { SourcesService } from './sources/sources.service.js';
import { VaultService } from './vault/vault.service.js';
import { EvidenceService } from './vault/evidence.service.js';
import { QuarantineService } from './quarantine/quarantine.service.js';
import { CorrectionsService } from './corrections/corrections.service.js';
import { CoverageService } from './coverage/coverage.service.js';
import { CoverageFactsService } from './coverage/facts.service.js';
import { AgentsService } from './agents/agents.service.js';
import { AgentSessionService } from './agents/agent-session.service.js';
import { SchedulerService } from './scheduling/scheduler.service.js';
import { SweeperService } from './sweeper/sweeper.service.js';
import { AcquisitionLifecycle } from './acquisition/lifecycle.service.js';
import { CollectionOrchestrator } from './acquisition/orchestrator.service.js';

@Module({
  imports: [PipelineModule, IdentityModule],
  controllers: [ObservationController, UploadController],
  providers: [
    SourcesService,
    VaultService,
    EvidenceService,
    QuarantineService,
    CorrectionsService,
    CoverageService,
    CoverageFactsService,
    AgentsService,
    AgentSessionService,
    SchedulerService,
    SweeperService,
    AcquisitionLifecycle,
    CollectionOrchestrator,
  ],
  exports: [VaultService, CollectionOrchestrator, SchedulerService],
})
export class ObservationModule implements OnModuleInit {
  constructor(private readonly vault: VaultService) {}

  async onModuleInit(): Promise<void> {
    // Construction already refused equal or nested roots; this creates them.
    await this.vault.ensureRoots();
  }
}
