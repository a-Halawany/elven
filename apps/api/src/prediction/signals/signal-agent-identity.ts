/**
 * THE WEAK SIGNAL AGENT'S IDENTITY (CP-6 B28, 0088 §S6; AG-031). The agent is registered with the version and the code digest of THIS
 * runtime's scan; a run whose registration names another digest is a DRIFTED agent and its scan is refused — recorded on the run and
 * escalated to the named human, never run under a stale identity (the attention timer's precedent, timer-identity.ts). The detectors'
 * own digests are the database's (prediction.signal_detectors: sha256 over the functions' definitions); this digest covers what the agent
 * does with them. A changed method is a new digest: the agent is registered anew.
 *
 * Kept apart from the agents service so the executive module reads it without depending on the prediction module.
 */
import { createHash } from 'node:crypto';

export const WEAK_SIGNAL_AGENT_VERSION = '1.0.0';
export const WEAK_SIGNAL_AGENT_METHOD = `weak-signal-agent@${WEAK_SIGNAL_AGENT_VERSION}`;
/** What the run does, in words: the digest is taken over this text. */
const METHOD_TEXT = 'one run under the Weak Signal Agent\'s own session, task signal_scan: (1) prediction.scan_signals under prediction.signal.nominate — every available '
  + 'detector (novelty, acceleration, change point over the active, unexpired indicators\' evaluated observations; relationship change and diffusion over the '
  + 'entities\' relationships) read as of the stated day or the subject\'s latest, every reading recorded once, a fired and not held reading nominated (at most '
  + 'the registered max_items); (2) prediction.rank_signals under prediction.signal.rank — the live signals in a lexicographic order with explanations; the '
  + 'agent disposes of nothing (its attempt is refused at the PDP and recorded)';
export const WEAK_SIGNAL_AGENT_DIGEST = createHash('sha256').update(`prediction.weak_signal.agent@${WEAK_SIGNAL_AGENT_VERSION}:${METHOD_TEXT}`, 'utf8').digest('hex');
