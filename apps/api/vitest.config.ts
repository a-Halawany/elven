import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit + GATE tests: the gate suite drives the real CI supply-chain gates
    // with controlled negative fixtures and needs no database.
    include: ['test/unit/**/*.test.ts', 'test/gate/**/*.test.ts'],
    passWithNoTests: true,
  },
});
