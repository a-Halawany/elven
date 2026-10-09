/**
 * B33 (0111 §0.3) — THE DOMAIN INTELLIGENCE AGENT's IDENTITY (kind domain_intelligence, role domain_intelligence_agent, task domain_scan).
 * Written by the prelude; OWNED BY §CI from here on (the only file of the prelude a part edits): §CI implements the scan
 * (apps/api/src/domains/competitor/…), offers it through DomainScanBridge (seams.ts) and, if the scan's contract changes, rewrites METHOD_TEXT
 * below — a changed text is a new digest, and an agent registered under the old one is DRIFTED (its scan refused, recorded, escalated) until
 * registered anew (the agent identity rule; the Supply Chain and Reconciliation Agents' precedent).
 *
 * The agent READS new claims and evidence on WATCHED subjects and PROPOSES events, profile updates and interpretations (domain.competitor.propose,
 * §CI); it never approves a material assessment, never certifies a package section (its role holds no such PDP rule; the ports refuse an agent).
 */
import { createHash } from 'node:crypto';

export const DOMAIN_INTELLIGENCE_AGENT_VERSION = '1.0.0';
export const DOMAIN_INTELLIGENCE_AGENT_METHOD = `domain-intelligence-agent@${DOMAIN_INTELLIGENCE_AGENT_VERSION}`;

/** What a run does, in words: the digest is taken over this text. */
const METHOD_TEXT = 'one run under the Domain Intelligence Agent\'s own session, task domain_scan: the new claims and evidence on the domain\'s WATCHED '
  + 'subjects (watchlists and competitors of active certified packages, each package function consulted through the package gate) read under '
  + 'the agent\'s read rules; per subject the events, profile updates and interpretations the evidence supports PROPOSED to the named analyst '
  + '(at most the registered max_items; the rest wait); the agent approves no assessment and certifies no package section (its attempt is '
  + 'refused at the PDP and recorded on the run); a run ends inside its session and budget (a lapsed run ends stopped)';
export const DOMAIN_INTELLIGENCE_AGENT_DIGEST = createHash('sha256').update(`domain.intelligence.agent@${DOMAIN_INTELLIGENCE_AGENT_VERSION}:${METHOD_TEXT}`, 'utf8').digest('hex');
