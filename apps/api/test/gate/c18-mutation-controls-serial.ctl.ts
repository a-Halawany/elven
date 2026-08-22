/**
 * C18.1.12 — THE SERIAL CONTROL PHASE.
 *
 * One producer refusal has to write an untracked file into the real repository and hide it behind
 * a repo-local git config, because that is the seam it proves is closed. Under parallel shards any
 * other worker that derived a source binding during that window would correctly — and irrelevantly
 * — report an unclean checkout. This shard therefore runs on its own, after the parallel ones.
 */
import { registerSerial } from './c18-mutation-controls.suite';

registerSerial();
