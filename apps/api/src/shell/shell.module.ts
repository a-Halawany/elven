/**
 * B80 (0118 §CL-F, §SH) — THE SHELL module (unit `api.shell`): the principal's own form drafts (§CL-F) and navigation states with the deep
 * link's as-of read (§SH). One deployable unit for the shell's API so the composition root maps once (the component manifest's UNIT_MAP).
 * The context bar's code (§CB, src/shell/context) is registered by the executive module beside B36's context ports.
 */
import { Module } from '@nestjs/common';
import { DraftsModule } from './drafts/drafts.module.js';
import { NavigationModule } from './navigation/navigation.module.js';
/* B81 dg */ import { DegradedModule } from './degraded/degraded.module.js'; /* end B81 dg */
/* B81 lyg */ import { PreferencesModule } from './preferences/preferences.module.js'; /* end B81 lyg */
/* B81 lym */ import { WindowsModule } from './windows/windows.module.js'; /* end B81 lym */

@Module({ imports: [DraftsModule, NavigationModule, /* B81 dg */ DegradedModule /* end B81 dg */, /* B81 lyg */ PreferencesModule /* end B81 lyg */, /* B81 lym */ WindowsModule /* end B81 lym */] })
export class ShellModule {}
