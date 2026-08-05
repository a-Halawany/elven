import { defineConfig } from 'vitest/config';

// Acceptance suite: spawns the built API against Compose Postgres.
export default defineConfig({
  test: {
    include: ['test/acceptance/**/*.test.ts'],
    setupFiles: ['./test/setup-env.ts'], // R7: generated ephemeral secrets
    testTimeout: 60000,
    hookTimeout: 90000,
    fileParallelism: false,
  },
});
