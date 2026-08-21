/**
 * FIXTURE DEPENDENCY SHIM — required by the frozen c18-legacy-53a4eec predecessor.
 *
 * C18.1.9's `c18-coverage-runner.mjs` imports the production contracts by a RELATIVE path
 * (`../../../packages/contracts/dist/index.js`), which resolves only when the module sits exactly
 * three directories below the repository root. Every other C18 gate module is relocatable — the
 * contract takes its production functions by injection, and the 0012 seeder resolves them from an
 * authenticated `root` — so this was a defect in that runner, not a convention.
 *
 * The frozen predecessor must run byte-verbatim to be a meaningful differential, so rather than
 * edit the frozen bytes this shim supplies the dependency at the exact path they ask for. It
 * re-exports the SAME production package, so the frozen verifier computes production digests.
 * C18.1.10 makes the live runner relocatable; this shim exists solely for the frozen fixture.
 */
export * from '@eye/contracts';
