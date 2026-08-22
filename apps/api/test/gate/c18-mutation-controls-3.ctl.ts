/**
 * C18.1.12 — CONTROL SHARD 3 OF 4: C18.1.7 – producer lifecycle.
 *
 * Every control in the suite lives in `c18-mutation-controls.suite.ts`; these four shards exist
 * only so vitest can run them in PARALLEL WORKERS. A single file is a single worker, and the suite
 * is CPU-bound — each control judges a whole evidence archive twice, once with the frozen
 * predecessor's verifier and once with this one — so one worker left the hosted control suite at
 * about 110 seconds. Nothing is sampled, skipped or relaxed: the same controls run, on more cores.
 *
 * Each shard's worker builds its OWN pristine extraction of the archive, so the shards share no
 * mutable state. The producer-lifecycle controls, which provision real containers, are confined to
 * one shard so they never run beside a copy of themselves.
 *
 * This shard registers:
 *   • C18.1.6 — inventory and seed-spec adjacent rejections on the genuine archive
 *   • C18.1.7 — DIFFERENTIAL: the frozen dccfcf26 verifier ACCEPTED what C18.1.7 rejects
 *   • C18.1.7 — adjacent single-defect rejections on the genuine archive
 *   • C18.1.8 — DIFFERENTIAL: the frozen bfc8695 verifier ACCEPTED what C18.1.8 rejects
 *   • C18.1.8 — adjacent single-defect rejections on the genuine archive
 *   • C18.1 — producer lifecycle and output-directory refusals (real CLI)
 */
import {
  register14, register15, register16, register17, register18, register19,
} from './c18-mutation-controls.suite';

register14();
register15();
register16();
register17();
register18();
register19();
