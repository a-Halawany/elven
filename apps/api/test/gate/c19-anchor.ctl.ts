/**
 * The C19 anchor attack matrix. These controls are pure computation over crafted inputs, so they
 * run in the PARALLEL shards alongside the other mutation controls.
 */
import { registerC19Anchor } from './c19-anchor.suite';

registerC19Anchor();
