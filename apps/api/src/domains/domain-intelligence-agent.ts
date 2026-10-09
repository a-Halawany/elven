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

/** What a run does, in words: the digest is taken over this text. B33 §CI rewrote it for the scan it built (a new digest — no demo agent was
 *  registered under the prelude's): the reads, the deterministic reading, the bound, the boundary and the session rule, as the scan does them. */
const METHOD_TEXT = 'one run under the Domain Intelligence Agent\'s own session, task domain_scan (competitor package, B33 §CI): one bounded read under '
  + 'domain.competitor.read of the claims (EVT/CLM/REL, latest versions) extracted from evidence one of whose mentions the graph RESOLVED to a WATCHED '
  + 'competitor\'s organization entity (a competitor watched by an active watchlist of its package, the package\'s collect function active through '
  + 'the package gate), recorded after that competitor\'s last scan mark; per evidence item the claims read DETERMINISTICALLY through the package\'s '
  + 'predicate map into events, profile changes and one interpretation (its confidence the lowest extraction confidence cited, never derived from '
  + 'narrative) and PROPOSED to the named analyst under domain.competitor.propose (at most the registered max_items; the rest wait and the scan mark '
  + 'stops before them); the competitors whose head facts rest on a mistaken identity or open conflict, or whose coverage is stale, REVALIDATED '
  + 'under domain.competitor.revalidate (limited, routed — only when something is found); the agent approves no assessment and certifies no package '
  + 'section (its attempt to approve is refused at the PDP and recorded on the run); every read is reserved on the run\'s meter and the session is '
  + 'checked before every write; a run ends inside its session and budget (a lapsed run ends stopped)';
export const DOMAIN_INTELLIGENCE_AGENT_DIGEST = createHash('sha256').update(`domain.intelligence.agent@${DOMAIN_INTELLIGENCE_AGENT_VERSION}:${METHOD_TEXT}`, 'utf8').digest('hex');
