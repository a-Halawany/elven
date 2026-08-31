/**
 * C18.1 mutation-control suite config. These controls verify a GENUINE evidence archive
 * (path supplied via C18_ARCHIVE) and mutated copies of it, so they run inside the C18 gate
 * step — after the producer — never in the hermetic unit phase. The .ctl.ts suffix keeps the
 * file out of every default vitest collection.
 */
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // C18.1.12: the controls are split across four shard files purely so they run in parallel
    // workers. They share no mutable state — each worker extracts its own pristine archive — and
    // the container-provisioning controls are confined to a single shard.
    include: ['test/gate/c18-mutation-controls-[0-9].ctl.ts', 'test/gate/c19-anchor.ctl.ts', 'test/gate/c19-pipeline.ctl.ts'],
    fileParallelism: true,
    // Use every core the runner has. Vitest's default leaves one idle, which on a four-core hosted
    // runner is a quarter of the available throughput for a suite that is entirely CPU-bound.
    maxWorkers: '100%',
    minWorkers: 1,
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
