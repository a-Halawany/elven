/**
 * CP-6 B40 §CR (V03-T-440, L1-C02) — THE PUBLISHED CONTRACT HOLDS FOR EVERY CONNECTOR: a TYPE-LEVEL check, compiled with the API, that the
 * first-party connectors (upload, rss, rest) and the cell connector (adapter) each implement the `Connector` contract the SDK publishes
 * (packages/connector-sdk/index.d.ts). A change to either side that breaks the contract fails the API's typecheck, not a run.
 * The first-party connectors are otherwise unchanged: they keep their own module (connectors/sdk.ts carries the same shapes with the API's
 * extensions — the egress policy, the replay root, the budget meter, the stream form).
 */
import type { Connector as PublishedConnector, AcquiredItem as PublishedItem } from '../../../../../packages/connector-sdk/index.js';
import type { RestConnector } from '../connectors/rest.connector.js';
import type { RssConnector } from '../connectors/rss.connector.js';
import type { UploadConnector } from '../connectors/upload.connector.js';
import type { AcquiredItem } from '../connectors/sdk.js';
import type { AdapterCellConnector } from './connector-cell.service.js';

type Implements<T, C> = T extends C ? true : false;
/** Each entry must be `true`; a connector that stops implementing the published contract makes its entry `false` and this file fail. */
export const PUBLISHED_CONTRACT_CONFORMANCE: {
  rest: Implements<RestConnector, PublishedConnector>; rss: Implements<RssConnector, PublishedConnector>;
  upload: Implements<UploadConnector, PublishedConnector>; adapter: Implements<AdapterCellConnector, PublishedConnector>;
  item: Implements<AcquiredItem, PublishedItem>;
} = { rest: true, rss: true, upload: true, adapter: true, item: true };
