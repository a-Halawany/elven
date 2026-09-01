/**
 * C18.1.12 — CONTROL SHARD 4 OF 4.
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
 *   • C18.1.4 — DIFFERENTIAL: the frozen 83d158c verifier ACCEPTED what C18.1.4 rejects
 *   • C18.1 — producer lifecycle and output-directory refusals (real CLI)
 *   • C18.1.9 — DIFFERENTIAL: the frozen 77489f5 verifier ACCEPTED what C18.1.9 rejects
 *   • C18.1.5 — DIFFERENTIAL: the frozen 7be02b8 verifier ACCEPTED what C18.1.5 rejects
 *   • C18.1.1 — DIFFERENTIAL: the frozen 8a23526 verifier ACCEPTED what C18.1.1 rejects
 *   • C18.1 — DIFFERENTIAL: the frozen d5061b8 verifier ACCEPTED what C18.1 rejects
 *   • C18.1.11 — one finding never suppresses an independent check
 */
import {
  register09,
  register19,
  register20,
  register11,
  register04,
  register02,
  register25,
  register32,
} from './c18-mutation-controls.suite';

register09();
register19();
register20();
register11();
register04();
register02();
register25();
register32();
