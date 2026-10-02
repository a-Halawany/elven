/**
 * THE RISK AND OPPORTUNITY AGENTS' IDENTITY (CP-6 B32, 0089 §R2; AG-023 Risk Agent, AG-024 Opportunity Agent). Each agent is registered with
 * the version and the code digest of THIS runtime's estimate; a run whose registration names another digest is a DRIFTED agent and its
 * estimate is refused — recorded on the run and escalated to the named human (the Weak Signal Agent's precedent, signal-agent-identity.ts).
 * The estimate rule itself is the database's (prediction.estimate_exposures, rule `exposure-estimate@1`); this digest covers what the agent
 * does with it. A changed method is a new digest: the agent is registered anew.
 *
 * Kept apart from the exposures service so the executive module reads it without depending on the prediction module.
 */
import { createHash } from 'node:crypto';

export const RISK_AGENT_VERSION = '1.0.0';
export const OPPORTUNITY_AGENT_VERSION = '1.0.0';
export const RISK_AGENT_METHOD = `risk-agent@${RISK_AGENT_VERSION}`;
export const OPPORTUNITY_AGENT_METHOD = `opportunity-agent@${OPPORTUNITY_AGENT_VERSION}`;

/** What a run does, in words: the digest is taken over this text. */
const methodText = (polarity: 'risk' | 'opportunity'): string => `one run under the ${polarity === 'risk' ? 'Risk' : 'Opportunity'} Agent's own session, task ${polarity}_assess: `
  + `prediction.estimate_exposures under prediction.exposure.estimate (rule exposure-estimate@1) — every open ${polarity} of the domain with a human-assessed base `
  + 're-estimated when an open warning names an objective it rests on (the likelihood moved up, the warnings cited; at most the registered max_items; the rest wait), '
  + 'every pair sharing a driver given a correlation estimate with its basis — all PROPOSED; the agent '
  + (polarity === 'risk' ? 'accepts no assessment and no residual risk' : 'sponsors nothing and commits no resource')
  + ' (its attempt is refused at the PDP and recorded on the run)';

export const RISK_AGENT_DIGEST = createHash('sha256').update(`prediction.risk.agent@${RISK_AGENT_VERSION}:${methodText('risk')}`, 'utf8').digest('hex');
export const OPPORTUNITY_AGENT_DIGEST = createHash('sha256').update(`prediction.opportunity.agent@${OPPORTUNITY_AGENT_VERSION}:${methodText('opportunity')}`, 'utf8').digest('hex');
