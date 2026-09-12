/**
 * Read-time authority over a stored snapshot — the helpers moved to shared/clearance.ts in B9 (0066 §3) so that the
 * Enterprise Memory workspace (graph module) reads under the same rule as decisions and briefings; this module keeps
 * the decision/executive imports where they were.
 */
export { CLEARANCE_RANK, bindingReaches, clearanceOf, covers, assertClearance, assertPurpose, denyRead, type TargetContext } from '../shared/clearance.js';
