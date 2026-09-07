/**
 * PROPOSAL B — World Bank Indicators, live. NOT REGISTERED BY ANY SEED.
 *
 * The Phase 1 contract is replay with reuse rights CONFIRMED under CC-BY-4.0. The
 * readiness plan judged its annual grain adds nothing at a 30-day forecast horizon, so
 * it is structural context, not a driver — and going live is still a change of use the
 * owner has not decided. This is the exact v2 contract a YES would register: a weekly
 * poll of the same indicator endpoints, with the CC-BY attribution the licence requires.
 * Nothing is registered, approved or activated here.
 */
import { SOURCE_CONTRACTS } from '../../phase1/source-contracts.mjs';

const v1 = SOURCE_CONTRACTS.find((c) => c.source_key === 'worldbank-indicators');
if (v1 === undefined) throw new Error('no v1 contract for worldbank-indicators');

export const WORLDBANK_LIVE = {
  ...v1,
  acquisition_mode: 'live',
  identity: { ...v1.identity, cadence_seconds: 604_800, jitter_seconds: 600 },
  authority_and_rights: {
    ...v1.authority_and_rights,
    attribution: 'Source: The World Bank, World Development Indicators (CC-BY-4.0).',
    permitted_use: ['internal analysis', 'display with attribution', 'redistribution with attribution'],
  },
  security_and_operations: {
    ...v1.security_and_operations,
    freshness_expectation: { threshold_seconds: 7_776_000, expected_interval: 'monthly' },
  },
  lifecycle: { contract_version: 2, effective_from: '2026-09-08T00:00:00Z', effective_to: null, supersedes_version: 1 },
};
