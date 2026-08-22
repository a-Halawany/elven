/**
 * The serial half of the C18 control suite: the producer refusals that must temporarily disturb
 * the real checkout. It runs on its own so no parallel shard can observe that disturbance. See
 * `vitest.c18.config.ts` for the parallel shards, which hold every other control.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/gate/c18-mutation-controls-serial.ctl.ts'],
    fileParallelism: false,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
