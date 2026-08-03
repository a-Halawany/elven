import { defineConfig } from 'vitest/config';

// Integration tests (require running Postgres from docker-compose).
export default defineConfig({
  test: {
    include: ['test/int/**/*.test.ts'],
    passWithNoTests: true,
    testTimeout: 30000,
    // Integration tests share one DB — no parallel files.
    fileParallelism: false,
  },
});
