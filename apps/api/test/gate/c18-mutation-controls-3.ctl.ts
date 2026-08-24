/**
 * C18.1.12 — CONTROL SHARD 3 OF 4.
 *
 * Every control lives in `c18-mutation-controls.suite.ts`; these four shards exist only so vitest
 * can run them in PARALLEL WORKERS. The suite is CPU-bound — each differential control judges a
 * whole evidence archive twice, once with the frozen predecessor's verifier and once with this
 * one — and a single file is a single worker, which left the hosted control suite near two
 * minutes. Nothing is sampled, skipped or relaxed: the same controls run, on more cores.
 *
 * Each shard's worker builds its OWN pristine extraction of the archive, so the shards share no
 * mutable state. The blocks are distributed by MEASURED cost rather than by name, so no single
 * shard sets the wall clock on its own; `c18-mutation-controls.suite.ts` remains the one place any
 * control is edited.
 *
 * This shard registers:
 *   • C18.1.10 — DIFFERENTIAL: the frozen 53a4eec verifier ACCEPTED what C18.1.10 rejects
 *   • C18.1.7 — DIFFERENTIAL: the frozen dccfcf26 verifier ACCEPTED what C18.1.7 rejects
 *   • C18.1 — the genuine archive verifies, then every single-defect mutation is rejected
 *   • C18.1.12 — DIFFERENTIAL: the frozen 2c3cab3 verifier ACCEPTED what C18.1.12 rejects
 *   • C18.1.2 — command-graph, binding and projection controls (new-verifier rejections)
 *   • C18.1.10 — the semantic core and the production CLI agree
 *   • C18.1.4 — adjacent-field rejections on the genuine archive
 */
import {
  register30,
  register22,
  register15,
  register01,
  register26,
  register06,
  register23,
  register10,
} from './c18-mutation-controls.suite';

register22();
register15();
register01();
register26();
register06();
register23();
register10();
register30();
