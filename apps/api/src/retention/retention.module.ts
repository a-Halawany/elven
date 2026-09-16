/**
 * The retention module — CP-6 B9 (0066 §4): governed retention actions as durable workflows (ES-29-004). It imports the
 * pipeline and the observation module (the vault, for the bytes and their verification); it is imported by none of
 * the phase modules.
 *
 * CP-6 B13 (0073): the export's delivery — the two credential stores (the signing key's reference `EYE_EXPORT_SIGNING_KEY_*`,
 * the destination's `EYE_DST_*`; values read from the process environment at use, never recorded) and the delivery executors
 * (the transfer station's files, the https egress) are this module's own providers; the observation module exports the vault
 * they and the service read through.
 *
 * CP-6 B16 (0076): the governed IMPORT — the ImportService (the package quarantined as vault blobs, its checks, the plan of
 * minted ids, the admission in batches through the pipeline under retention.import.admit, the quarantine copies' lifecycle)
 * is this module's provider beside the export's; it reads the vault, the delivery service (the transfer station's package)
 * and the pipeline (the admission orchestrates its own writes).
 *
 * CP-6 B17 (0077; D3): the module imports the GRAPH module for the ImpactService — the revocation's one GraphChanged carries the
 * SAME walk the invalidation uses (the walker takes a structural pick of the reads; the retention capability supplies them), never
 * a second walker. No cycle: the graph module imports nothing from retention, exactly as the prediction and twin modules import it.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { ObservationModule } from '../observation/observation.module.js';
import { GraphModule } from '../graph/graph.module.js';
import { RetentionController } from './retention.controller.js';
import { RetentionService } from './retention.service.js';
import { DestinationCredentialStore, ExportSigningKeyStore } from './export-signing.js';
import { DeliveryEgress, ExportDeliveryService } from './export-delivery.service.js';
import { ImportService } from './import.service.js';

@Module({
  imports: [PipelineModule, ObservationModule, GraphModule],
  controllers: [RetentionController],
  providers: [RetentionService, ExportSigningKeyStore, DestinationCredentialStore, DeliveryEgress, ExportDeliveryService, ImportService],
  exports: [RetentionService],
})
export class RetentionModule {}
