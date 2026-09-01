/**
 * The C19 lifecycle containment controls. They spawn watchdogs, send real signals and terminate
 * real process trees, so they run in the SERIAL phase: a parallel worker that happened to be
 * enumerating processes during one of these controls would observe a tree mid-teardown.
 */
import { registerC19Lifecycle } from './c19-lifecycle.suite';

registerC19Lifecycle();
