/**
 * B33 (0111 §0.8) — the DOMAINS module: the domain-package framework and its packages (§PK, `domain.package.*`, `domain.assessment.*`,
 * `domain.watchlist.*`, `domain.alert.*`) and competitor intelligence (§CI, `domain.competitor.*`). It reads twin, prediction and graph state
 * through SQL only and imports none of their modules (the Nest cycle rule, B25 §CX); it imports the pipeline. The seams' defaults are the
 * prelude's (`B33 seams`); each part registers its controllers and providers inside its own marked blocks below.
 */
import { Module } from '@nestjs/common';
import { PipelineModule } from '../pipeline/pipeline.module.js';
/* B33 (0111 §0.8) the seams and their defaults */ import { ALERT, PACKAGE_GATE, SqlAlertReads, SqlPackageGate } from './seams.js'; /* end B33 seams */
/* B33 packages */ /* end B33 packages */
/* B33 competitor */ import { CompetitorController } from './competitor/competitor.controller.js'; import { CompetitorService } from './competitor/competitor.service.js'; /* end B33 competitor */

@Module({
  imports: [PipelineModule],
  controllers: [
    /* B33 packages */ /* end B33 packages */
    /* B33 competitor */ CompetitorController, /* end B33 competitor */
  ],
  providers: [
    /* B33 seams — PACKAGE_GATE (the SQL seam) and ALERT (the routed items' reads) are real defaults; a part does not replace them */
    { provide: PACKAGE_GATE, useClass: SqlPackageGate }, { provide: ALERT, useClass: SqlAlertReads },
    /* end B33 seams */
    /* B33 packages */ /* end B33 packages */
    /* B33 competitor */ CompetitorService, /* end B33 competitor */
  ],
  exports: [/* B33 seams */ PACKAGE_GATE, ALERT /* end B33 seams */],
})
export class DomainsModule {}
