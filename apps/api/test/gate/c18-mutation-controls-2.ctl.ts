/**
 * C18.1.12 — CONTROL SHARD 2 OF 4.
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
 *   • C18.1.2 — DIFFERENTIAL: the TEN false passes the frozen 567a70f verifier ACCEPTED
 *   • C18.1.6 — DIFFERENTIAL: the frozen 8362cba verifier ACCEPTED what C18.1.6 rejects
 *   • C18.1.8 — DIFFERENTIAL: the frozen bfc8695 verifier ACCEPTED what C18.1.8 rejects
 *   • C18.1.6 — inventory and seed-spec adjacent rejections on the genuine archive
 *   • C18.1.7 — adjacent single-defect rejections on the genuine archive
 *   • C18.1.9 — adjacent single-defect rejections on the genuine archive
 *   • C18.1.5 — adjacent-field rejections on the genuine archive
 */
import {
  register29,
  register05,
  register13,
  register17,
  register14,
  register16,
  register21,
  register12,
} from './c18-mutation-controls.suite';

register05();
register13();
register17();
register14();
register16();
register21();
register12();
register29();
