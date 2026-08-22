/**
 * C18.1.12 — CONTROL SHARD 4 OF 4: C18.1.9 – C18.1.12.
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
 *   • C18.1.9 — DIFFERENTIAL: the frozen 77489f5 verifier ACCEPTED what C18.1.9 rejects
 *   • C18.1.9 — adjacent single-defect rejections on the genuine archive
 *   • C18.1.10 — DIFFERENTIAL: the frozen 53a4eec verifier ACCEPTED what C18.1.10 rejects
 *   • C18.1.10 — the semantic core and the production CLI agree
 *   • C18.1.11 — DIFFERENTIAL: the frozen a424505 verifier ACCEPTED what C18.1.11 rejects
 *   • C18.1.11 — one finding never suppresses an independent check
 *   • C18.1.12 — DIFFERENTIAL: the frozen 2c3cab3 verifier ACCEPTED what C18.1.12 rejects
 */
import {
  register20, register21, register22, register23, register24, register25, register26,
} from './c18-mutation-controls.suite';

register20();
register21();
register22();
register23();
register24();
register25();
register26();
