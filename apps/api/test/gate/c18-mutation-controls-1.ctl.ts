/**
 * C18.1.12 — CONTROL SHARD 1 OF 4: C18.1 – C18.1.2.
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
 *   • C18.1 — the genuine archive verifies, then every single-defect mutation is rejected
 *   • C18.1 — DIFFERENTIAL: the frozen d5061b8 verifier ACCEPTED what C18.1 rejects
 *   • C18.1.1 — new single-defect mutations against the genuine archive are rejected
 *   • C18.1.1 — DIFFERENTIAL: the frozen 8a23526 verifier ACCEPTED what C18.1.1 rejects
 *   • C18.1.2 — DIFFERENTIAL: the TEN false passes the frozen 567a70f verifier ACCEPTED
 *   • C18.1.2 — command-graph, binding and projection controls (new-verifier rejections)
 */
import {
  register01, register02, register03, register04, register05, register06,
} from './c18-mutation-controls.suite';

register01();
register02();
register03();
register04();
register05();
register06();
