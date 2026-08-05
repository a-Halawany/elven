import { defineConfig } from 'vitest/config';

// Integration tests (require running Postgres from docker-compose).
export default defineConfig({
  test: {
    include: ['test/int/**/*.test.ts'],
    setupFiles: ['./test/setup-env.ts'], // R7: generated ephemeral secrets
    passWithNoTests: true,
    testTimeout: 60000,
    hookTimeout: 60000,
    // Integration tests share one DB — no parallel files.
    fileParallelism: false,
  },
});
