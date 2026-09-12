/**
 * PROPOSAL B — World Bank Indicators, live.
 *
 * The Phase 1 contract is replay with reuse rights CONFIRMED under CC-BY-4.0. The
 * readiness plan judged its annual grain adds nothing at a 30-day forecast horizon, so
 * it is STRUCTURAL CONTEXT, not a driver — that scope is unchanged, and no forecast
 * promise is made on it. Going live is a change of use decided by the owner on
 * 2026-09-07; this is the exact v2 contract registered on that decision: a weekly poll
 * of the same two indicator endpoints.
 *
 * VERIFIED AT THE SOURCE, 2026-09-07 (before registration):
 *   - both endpoints answer 200 application/json;
 *   - the indicator metadata (api.worldbank.org/v2/indicator/TX.VAL.MRCH.CD.WT) names
 *     the World Trade Organization (WTO) as sourceOrganization for merchandise exports;
 *     NE.IMP.GNFS.ZS names national statistical offices, central banks and World Bank
 *     staff estimates. Both indicator pages show licence CC BY-4.0.
 *   - the World Bank Dataset Terms (worldbank.org/ext/en/legal/terms-conditions/datasets)
 *     require attribution "to The World Bank and its data providers in the following
 *     format: The World Bank: Dataset name: Data source (if known)", and carry an
 *     exception for third-party data that may not be reused without the provider's
 *     consent — which is why the WTO is named on the series it provides, and why the
 *     series is carried under the CC BY-4.0 the Bank's own indicator page shows for it.
 */
import { SOURCE_CONTRACTS } from '../../phase1/source-contracts.mjs';

const v1 = SOURCE_CONTRACTS.find((c) => c.source_key === 'worldbank-indicators');
if (v1 === undefined) throw new Error('no v1 contract for worldbank-indicators');

export const WORLDBANK_ATTRIBUTION = 'The World Bank: World Development Indicators: Merchandise exports, current US$ (TX.VAL.MRCH.CD.WT) — data source World Trade Organization (WTO); Imports of goods and services, % of GDP (NE.IMP.GNFS.ZS) — data source national statistical offices, central banks and World Bank staff estimates. Licence CC BY-4.0.';

export const WORLDBANK_LICENCE = 'CC-BY-4.0 under the World Bank Dataset Terms (worldbank.org/ext/en/legal/terms-conditions/datasets, read 2026-09-07): attribution to The World Bank and its data providers in the format "The World Bank: Dataset name: Data source (if known)"; the third-party exception is honoured by naming the WTO as provider of TX.VAL.MRCH.CD.WT, whose indicator page shows CC BY-4.0.';

export const WORLDBANK_LIVE = {
  ...v1,
  acquisition_mode: 'live',
  identity: { ...v1.identity, cadence_seconds: 604_800, jitter_seconds: 600 },
  authority_and_rights: {
    ...v1.authority_and_rights,
    attribution: WORLDBANK_ATTRIBUTION,
    licence: WORLDBANK_LICENCE,
    permitted_use: ['internal analysis', 'display with attribution', 'redistribution with attribution'],
    purposes: ['observation', 'structural context'],
  },
  security_and_operations: {
    ...v1.security_and_operations,
    freshness_expectation: { threshold_seconds: 7_776_000, expected_interval: 'annual releases; polled weekly' },
  },
  lifecycle: { contract_version: 2, effective_from: '2026-09-08T00:00:00Z', effective_to: null, supersedes_version: 1 },
};
