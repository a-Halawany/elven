/**
 * C18.1.12 — CONTROL SHARD 2 OF 4: C18.1.3 – C18.1.6.
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
 *   • C18.1.3 — DIFFERENTIAL: the frozen 15e8239 verifier ACCEPTED what C18.1.3 rejects
 *   • C18.1.3 — direct rejections on the genuine archive
 *   • C18.1.4 — DIFFERENTIAL: the frozen 83d158c verifier ACCEPTED what C18.1.4 rejects
 *   • C18.1.4 — adjacent-field rejections on the genuine archive
 *   • C18.1.5 — DIFFERENTIAL: the frozen 7be02b8 verifier ACCEPTED what C18.1.5 rejects
 *   • C18.1.5 — adjacent-field rejections on the genuine archive
 *   • C18.1.6 — DIFFERENTIAL: the frozen 8362cba verifier ACCEPTED what C18.1.6 rejects
 */
import {
  register07, register08, register09, register10, register11, register12, register13,
} from './c18-mutation-controls.suite';

register07();
register08();
register09();
register10();
register11();
register12();
register13();
