/**
 * C18.1.12 — CONTROL SHARD 1 OF 4.
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
 *   • C18.1.3 — DIFFERENTIAL: the frozen 15e8239 verifier ACCEPTED what C18.1.3 rejects
 *   • C18.1.11 — DIFFERENTIAL: the frozen a424505 verifier ACCEPTED what C18.1.11 rejects
 *   • C18.1.8 — adjacent single-defect rejections on the genuine archive
 *   • C18.1.1 — new single-defect mutations against the genuine archive are rejected
 *   • C18.1.3 — direct rejections on the genuine archive
 */
import {
  register28,
  register07,
  register24,
  register18,
  register03,
  register08,
} from './c18-mutation-controls.suite';

register07();
register24();
register18();
register03();
register08();
register28();
