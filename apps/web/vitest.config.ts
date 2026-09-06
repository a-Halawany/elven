import { defineConfig } from 'vitest/config';

// Pure display logic only; the screens themselves are exercised by the Playwright suites.
export default defineConfig({ test: { include: ['lib/**/*.test.ts'], environment: 'node' } });
