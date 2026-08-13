import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Unit + GATE tests: the gate suite drives the real CI supply-chain gates
    // with controlled negative fixtures and needs no database.
    include: ['test/unit/**/*.test.ts', 'test/gate/**/*.test.ts'],
    passWithNoTests: true,

    // ── C16-R3.4: EXPLICIT, BOUNDED CEILINGS ──────────────────────────────────
    // The C15 behavioural controls spawn the real gate, which performs network image scans.
    // With vitest's 5s default they would all fail, so each carried its own 15-minute
    // override — 28 of them — and nothing bounded the suite as a whole. One run could
    // therefore continue for hours and be killed mid-test by the surrounding harness, which
    // is how a governed disposition document was twice left corrupted on disk.
    //
    // These are real ceilings, not aspirations: no gate can wait indefinitely, and a test that
    // exceeds its budget fails by name instead of vanishing with its worker.
    // C16-R3.4.2 §6: the suite is hermetic and measured in seconds, so the global ceilings are
    // short. Nothing here waits on a network.
    testTimeout: 60_000,
    hookTimeout: 60_000,
    teardownTimeout: 60_000,
  },
});
