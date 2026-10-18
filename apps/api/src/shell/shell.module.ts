/**
 * B80 (0118 §CL-F, §SH) — THE SHELL module (unit `api.shell`): the principal's own form drafts (§CL-F) and navigation states with the deep
 * link's as-of read (§SH). One deployable unit for the shell's API so the composition root maps once (the component manifest's UNIT_MAP).
 * The context bar's code (§CB, src/shell/context) is registered by the executive module beside B36's context ports.
 */
import { Module } from '@nestjs/common';
import { DraftsModule } from './drafts/drafts.module.js';
import { NavigationModule } from './navigation/navigation.module.js';
/* B81 dg */ import { DegradedModule } from './degraded/degraded.module.js'; /* end B81 dg */

@Module({ imports: [DraftsModule, NavigationModule, /* B81 dg */ DegradedModule /* end B81 dg */] })
export class ShellModule {}
