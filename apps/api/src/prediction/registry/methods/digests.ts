/**
 * CP-6 B25 §MR (0108) — THE PINNED IMPLEMENTATION DIGESTS of the method families: sha256 over the bytes of the family's file followed by the
 * bytes of stats.ts (the kernel every family computes with); `legacy-models` is sha256 over src/prediction/models/models.ts alone (the
 * builtins' digest, pinned in 0108 §MR.3 too). A unit control recomputes every one from the source. A registry entry pins the digest of the
 * implementation it was approved for; a build whose digest differs makes the entry UNAVAILABLE (quarantined at its next routed run) until a
 * steward approves a new version. Change a family, change its entries' versions — never this table alone.
 */
export const IMPLEMENTATION_DIGESTS: Readonly<Record<string, string>> = Object.freeze({
  'legacy-models': '7da8dc6d086417600f198d4da9a14edcab9d498234532d09342bf59c1b29d051',
  'event-rate': 'f20a3a40464142653865122abf778f98e8265e1060f9320bb14babed699e0f42',
  'regime-judgement': '41e86f96785dc63b83ab3dcd6f2f6f997682a7fa15b911a061bbb246961c12cc',
  'bayesian-conjugate': '51c114f172c446fd4fb5c175df04d6f691036b992af3834dd1fdbf95402fbd77',
  'causal-its': '14c5496950b727db04c2730ad331a2d19dfe1889cf47a4ee407d4b16e0cee12c',
  'optimisation-lp': '5cd72f6f0d85161a1b21810bbd82e3c5729b41c6099eb9253a181d8a48326c8f',
});

/** The files each digest covers (relative to src/prediction), for the unit control. */
export const IMPLEMENTATION_FILES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  'legacy-models': ['models/models.ts'],
  'event-rate': ['registry/methods/event.ts', 'registry/methods/stats.ts'],
  'regime-judgement': ['registry/methods/regime.ts', 'registry/methods/stats.ts'],
  'bayesian-conjugate': ['registry/methods/bayesian.ts', 'registry/methods/stats.ts'],
  'causal-its': ['registry/methods/causal.ts', 'registry/methods/stats.ts'],
  'optimisation-lp': ['registry/methods/optimisation.ts', 'registry/methods/stats.ts'],
});
