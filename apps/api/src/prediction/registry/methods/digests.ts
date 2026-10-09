/**
 * CP-6 B25 §MR (0108) — THE PINNED IMPLEMENTATION DIGESTS of the method families: sha256 over the bytes of the family's file followed by the
 * bytes of stats.ts (the kernel every family computes with); `legacy-models` is sha256 over src/prediction/models/models.ts alone (the
 * builtins' digest, pinned in 0108 §MR.3 too). A unit control recomputes every one from the source. A registry entry pins the digest of the
 * implementation it was approved for; a build whose digest differs makes the entry UNAVAILABLE (quarantined at its next routed run) until a
 * steward approves a new version. Change a family, change its entries' versions — never this table alone.
 * B25 completion: regime-judgement (G1 conditions, G6 paths/options), bayesian-conjugate (G3 identifiability), causal-its (G4 transport) and
 * optimisation-lp (G5 robustness) MOVED; event-rate, legacy-models and stats.ts did not. An entry approved for the earlier bytes is unavailable
 * to this build (quarantined at its next routed run; its replay DIVERGES on `implementation`) until its steward approves a new version.
 */
export const IMPLEMENTATION_DIGESTS: Readonly<Record<string, string>> = Object.freeze({
  'legacy-models': '7da8dc6d086417600f198d4da9a14edcab9d498234532d09342bf59c1b29d051',
  'event-rate': 'f20a3a40464142653865122abf778f98e8265e1060f9320bb14babed699e0f42',
  'regime-judgement': 'd5fdd2d93218fffe11dc28f17ad4862e470ef8c0e7a9c78c15316fd16a593de2',
  'bayesian-conjugate': '1df521752fa79a116ea10e77963b554c9426348d857b4cfcb9b1e0d91146848d',
  'causal-its': 'c17a2b53b0ff17912b2836639406d1ff2b5f80c0a6e2f4258b655e9209fa87b5',
  'optimisation-lp': '001c1f5a4031394d09daba32129161ae68e8aed903071d0b78384fef794e1d12',
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
