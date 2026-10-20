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
import { APP_FILTER } from '@nestjs/core';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { IdentityModule } from '../identity/identity.module.js';
import { ObservationController } from './observation.controller.js';
import { UploadController } from './sources/upload.controller.js';
import { SourcesService } from './sources/sources.service.js';
import { SourceCredentialStore } from './sources/source-credentials.js';
import { VaultService } from './vault/vault.service.js';
import { EvidenceService } from './vault/evidence.service.js';
import { QuarantineService } from './quarantine/quarantine.service.js';
import { CorrectionsService } from './corrections/corrections.service.js';
import { CoverageService } from './coverage/coverage.service.js';
import { CoverageFactsService } from './coverage/facts.service.js';
import { AgentsService } from './agents/agents.service.js';
import { AgentSessionService } from './agents/agent-session.service.js';
import { SchedulerService } from './scheduling/scheduler.service.js';
import { CollectionWorkerService } from './scheduling/collection-worker.service.js';
import { SweeperService } from './sweeper/sweeper.service.js';
import { AcquisitionLifecycle } from './acquisition/lifecycle.service.js';
import { CollectionOrchestrator } from './acquisition/orchestrator.service.js';
import { ObservationExceptionFilter } from './observation.filter.js';
/* B82 ev */ import { EvidenceB82Controller } from './evidence-b82/evidence-b82.controller.js'; /* end B82 ev */
/* B40 §0 */ import { INTAKE_STAGE_PROVIDERS } from './acquisition/intake-stages.js'; /* end B40 §0 */
/* B40 ap */
import { AcquisitionPolicyController } from './acquisition-policy/acquisition-policy.controller.js';
import { AcquisitionPolicyStore } from './acquisition-policy/policy-store.js';
import { RateBucket } from './acquisition-policy/rate-bucket.js';
import { RobotsService } from './acquisition-policy/robots.service.js';
import { RunPolicyCache } from './acquisition-policy/run-policy.js';
import { ContractBackoffAp } from './acquisition-policy/contract-backoff.service.js';
import { IngressPolicyAp } from './acquisition-policy/ingress-ap.js';
/* end B40 ap */

@Module({
  imports: [PipelineModule, IdentityModule],
  controllers: [ObservationController, UploadController, /* B82 ev: the cited evidence segment, the rights terms (0121 §EV) */ EvidenceB82Controller /* end B82 ev */,
    /* B40 ap: the acquisition policy read (0123 §AP.7) */ AcquisitionPolicyController /* end B40 ap */],
  providers: [
    SourcesService,
    SourceCredentialStore,
    VaultService,
    EvidenceService,
    QuarantineService,
    CorrectionsService,
    CoverageService,
    CoverageFactsService,
    AgentsService,
    AgentSessionService,
    SchedulerService,
    CollectionWorkerService,
    SweeperService,
    AcquisitionLifecycle,
    CollectionOrchestrator,
    /* B40 §0: the intake seam — the composition and the four parts' stages (authorize-ap, throttle-ap, inspect-in, authenticate-va) */
    ...INTAKE_STAGE_PROVIDERS,
    /* end B40 §0 */
    /* B40 ap: what §AP's stages and the scheduler's contract backoff use (the policy records' ports, the shared rate bucket, robots, the
       run's cached authorization, the contract's retry, the ingress check the integrator folds into the inspect composition) */
    AcquisitionPolicyStore, RateBucket, RobotsService, RunPolicyCache, ContractBackoffAp, IngressPolicyAp,
    /* end B40 ap */
    // Registered AFTER the Phase 0 filter so it is consulted first for these
    // routes; a refusal a governed port raised deliberately answers as the rule
    // it is, and everything else falls through unchanged.
    { provide: APP_FILTER, useClass: ObservationExceptionFilter },
  ],
  // EvidenceService is exported so LATER PHASES REUSE THE RETRIEVAL PATH rather
  // than growing a second one. Phase 2's extraction reads evidence through this
  // exact implementation — manifest-resolved, digest-verified, custody-writing —
  // under its own observation.evidence.retrieve decision.
  exports: [VaultService, EvidenceService, CollectionOrchestrator, SchedulerService, CollectionWorkerService],
})
export class ObservationModule implements OnModuleInit {
  constructor(private readonly vault: VaultService) {}

  async onModuleInit(): Promise<void> {
    // Construction already refused equal or nested roots; this creates them.
    await this.vault.ensureRoots();
  }
}
