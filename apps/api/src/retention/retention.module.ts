/**
 * The retention module — CP-6 B9 (0066 §4): governed retention actions as durable workflows (ES-29-004). It imports the
 * pipeline and the observation module (the vault, for the bytes and their verification); it is imported by none of
 * the phase modules.
 *
 * CP-6 B13 (0073): the export's delivery — the two credential stores (the signing key's reference `EYE_EXPORT_SIGNING_KEY_*`,
 * the destination's `EYE_DST_*`; values read from the process environment at use, never recorded) and the delivery executors
 * (the transfer station's files, the https egress) are this module's own providers; the observation module exports the vault
 * they and the service read through.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
import { ObservationModule } from '../observation/observation.module.js';
import { RetentionController } from './retention.controller.js';
import { RetentionService } from './retention.service.js';
import { DestinationCredentialStore, ExportSigningKeyStore } from './export-signing.js';
import { ExportDeliveryService } from './export-delivery.service.js';

@Module({
  imports: [PipelineModule, ObservationModule],
  controllers: [RetentionController],
  providers: [RetentionService, ExportSigningKeyStore, DestinationCredentialStore, ExportDeliveryService],
  exports: [RetentionService],
})
export class RetentionModule {}
