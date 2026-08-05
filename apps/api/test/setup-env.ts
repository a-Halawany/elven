/**
 * Test environment bootstrap (remediation R7): all test credentials are
 * GENERATED per-environment via the 0600 .eye-local/env handoff file — no
 * fixed reusable literals anywhere in the suites. Caller-supplied environment
 * variables always win (CI supplies its own ephemeral values).
 */
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore — plain .mjs utility shared with demo.sh and playwright
import { loadLocalEnv } from '../../../scripts/local-env.mjs';

loadLocalEnv();
