/**
 * PROPOSAL A — EU Financial Sanctions, live.
 *
 * The two Phase 1 contracts for the Commission's Financial Sanctions Files are replay
 * (a frozen set) with reuse rights CONFIRMED. Going live is a change of use — replay
 * to systematic collection — decided by the owner on 2026-09-07. These are the exact
 * v2 contracts registered on that decision; registering, approving (a second
 * operator) and activating them are three governed acts performed by
 * `scripts/integrations/activate-proposals.mjs`, each with its receipt.
 *
 * TWO INDEPENDENT POLLERS, NOT A TRIGGER. The RSS contract polls the feed hourly; the
 * payload contract polls the consolidated CSV every six hours. The RSS connector frames
 * feed entries and follows no link, and the scheduler schedules each source on its own,
 * so the feed does NOT trigger payload collection. A republication announced on the
 * feed is therefore observed by the payload contract within six hours, and the feed
 * entry (guid + pubDate) is the publisher's own correction signal.
 *
 * VERIFIED AT THE SOURCE, 2026-09-07 (before registration):
 *   - the feed answers 200 text/xml and lists the CSV 1.1 payload as an item
 *     (`csvFullSanctionsList_1_1/content?token=…`) — the same URL v1 declares;
 *   - the payload answers 200, media type text/plain (NOT text/csv), 25,166,172 bytes;
 *   - the v1 second endpoint (`…&version=2`) returns BYTE-IDENTICAL content
 *     (sha256 049cb95c…f015 for both), so v2 declares the one endpoint and does not
 *     spend a second 25 MB on a duplicate;
 *   - the dataset record on data.europa.eu (consolidated-list-of-persons-groups-and-
 *     entities-subject-to-eu-financial-sanctions, publisher DG FISMA, accrual daily)
 *     records the RSS distribution "Sanctions List" and the CSV distribution
 *     "Consolidated Financial Sanctions File 1.1" under licence COM_REUSE — the
 *     European Commission reuse notice, Commission Decision 2011/833/EU — with access
 *     right PUBLIC. (The CSV 1.0 distribution is recorded under CC-BY-4.0; it is not
 *     the file collected here.)
 *
 * No credential, no purchase, no new connector. The `token=` query parameter is
 * published in the dataset record and in the feed's own <link> elements; it is not a
 * secret, and §8.1 redaction strips the query string from logs and audit regardless.
 */
import { SOURCE_CONTRACTS } from '../../phase1/source-contracts.mjs';

export const EU_ATTRIBUTION = 'Source: European Commission, Financial Sanctions Files — consolidated list of persons, groups and entities subject to EU financial sanctions (reuse under Commission Decision 2011/833/EU).';

export const EU_LICENCE = 'European Commission reuse notice — Commission Decision 2011/833/EU (reuse permitted, source acknowledged; exceptions for third-party material). Dataset record: data.europa.eu, "Consolidated list of persons, groups and entities subject to EU financial sanctions" (publisher DG FISMA), distributions "Sanctions List" (RSS) and "Consolidated Financial Sanctions File 1.1" (CSV) recorded under licence COM_REUSE, access right PUBLIC. Read at the source 2026-09-07.';

function live(key, over) {
  const v1 = SOURCE_CONTRACTS.find((c) => c.source_key === key);
  if (v1 === undefined) throw new Error(`no v1 contract for ${key}`);
  return {
    ...v1,
    acquisition_mode: 'live',
    identity: { ...v1.identity, jitter_seconds: 120, ...(over.identity ?? {}) },
    authority_and_rights: {
      ...v1.authority_and_rights,
      attribution: EU_ATTRIBUTION,
      licence: EU_LICENCE,
      permitted_use: ['internal analysis', 'display with attribution'],
    },
    security_and_operations: {
      ...v1.security_and_operations,
      ...(over.security_and_operations ?? {}),
      freshness_expectation: over.freshness ?? v1.security_and_operations.freshness_expectation,
      // The replay set stays declared: an unavailable publisher degrades to replay, not to nothing.
    },
    lifecycle: { contract_version: 2, effective_from: '2026-09-08T00:00:00Z', effective_to: null, supersedes_version: 1 },
  };
}

const payloadV1 = SOURCE_CONTRACTS.find((c) => c.source_key === 'eu-sanctions-payload');
/** The one payload endpoint the feed announces; `&version=2` was verified byte-identical and is dropped. */
export const EU_PAYLOAD_ENDPOINT = payloadV1.identity.endpoints[0];

export const EU_SANCTIONS_LIVE = [
  live('eu-sanctions-rss', {
    identity: { cadence_seconds: 3_600 },
    freshness: { threshold_seconds: 604_800, expected_interval: 'the feed publishes on change; polled hourly' },
  }),
  live('eu-sanctions-payload', {
    identity: { cadence_seconds: 21_600, endpoints: [EU_PAYLOAD_ENDPOINT] },
    freshness: { threshold_seconds: 2_592_000, expected_interval: 'on republication; polled every six hours' },
    security_and_operations: {
      expected_schema: {
        // Observed at the source 2026-09-07: text/plain, 25,166,172 bytes.
        media_types: ['text/plain', 'text/csv', 'application/xml'],
        required_fields: [],
        drift_tolerance: 0,
        max_bytes: 33_554_432,
      },
      correction_channel: 'republication of the payload, announced on the RSS feed; this contract polls the payload independently every six hours — the feed does not trigger it',
    },
  }),
];
