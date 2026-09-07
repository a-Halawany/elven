/**
 * PROPOSAL A — EU Financial Sanctions, live. NOT REGISTERED BY ANY SEED.
 *
 * The two Phase 1 contracts for the Commission's Financial Sanctions Files are replay
 * (a frozen set) with reuse rights CONFIRMED under Commission Decision 2011/833/EU
 * (reuse permitted with source acknowledgement). Going live — polling the public feed
 * every hour and collecting each announced republication of the payload — is a change
 * of use, from replay to systematic collection, that the owner's four decisions of
 * 2026-09-05 did not cover. This file is the exact v2 contract that would be registered
 * on a YES, so the decision is about something concrete. Registering, approving (a
 * second operator) and activating it are three governed acts; none happens here.
 *
 * No credential, no purchase, no new connector. Attribution is the condition the
 * Decision imposes, and the contract carries it.
 */
import { SOURCE_CONTRACTS } from '../../phase1/source-contracts.mjs';

const ATTRIBUTION = 'Source: European Commission, Financial Sanctions Files (reuse under Commission Decision 2011/833/EU).';

function live(key, over) {
  const v1 = SOURCE_CONTRACTS.find((c) => c.source_key === key);
  if (v1 === undefined) throw new Error(`no v1 contract for ${key}`);
  return {
    ...v1,
    acquisition_mode: 'live',
    identity: { ...v1.identity, jitter_seconds: 120, ...(over.identity ?? {}) },
    authority_and_rights: { ...v1.authority_and_rights, attribution: ATTRIBUTION, permitted_use: ['internal analysis', 'display with attribution'] },
    security_and_operations: {
      ...v1.security_and_operations,
      ...(over.security_and_operations ?? {}),
      freshness_expectation: over.freshness ?? v1.security_and_operations.freshness_expectation,
      // The replay set stays declared: an unavailable publisher degrades to replay, not to nothing.
    },
    lifecycle: { contract_version: 2, effective_from: '2026-09-08T00:00:00Z', effective_to: null, supersedes_version: 1 },
  };
}

export const EU_SANCTIONS_LIVE = [
  live('eu-sanctions-rss', {
    identity: { cadence_seconds: 3_600 },
    freshness: { threshold_seconds: 604_800, expected_interval: 'daily' },
  }),
  live('eu-sanctions-payload', {
    identity: { cadence_seconds: 21_600 },
    freshness: { threshold_seconds: 2_592_000, expected_interval: 'on republication' },
  }),
];
