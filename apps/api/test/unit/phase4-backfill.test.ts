/**
 * PHASE 4 · P4-M0a — the closed-range backfill, at the connector.
 *
 * Service-level: the real RestConnector driven through an injected transport
 * double. Nothing here touches a publisher. The database evidence — checkpoint
 * persistence across runs, the audited no-op, the revision as a new evidence
 * version — is in `test/int/phase4-acceptance.test.ts`.
 */
import { describe, expect, it } from 'vitest';
import { RestConnector, backfillProgressOf, nextRequest, BACKFILL_METHOD_REF }
  from '../../src/observation/connectors/rest.connector.js';
import { BudgetMeter, type AcquisitionContext, type SourceBinding, type BackfillDeclaration }
  from '../../src/observation/connectors/sdk.js';
import type { EgressResult } from '../../src/observation/connectors/http-client.js';
import { validateSourceContract } from '../../src/observation/sources/source-contract.js';

const ECB = 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=jsondata';
const ARCGIS = 'https://services9.arcgis.com/x/arcgis/rest/services/PortWatch_chokepoints_database/FeatureServer/0/query';

function binding(over: Partial<SourceBinding> & { backfill?: BackfillDeclaration }): SourceBinding {
  return {
    sourceId: 's', sourceKey: 'k', replaySet: 'k', contractVersion: 2, acquisitionMode: 'live',
    authorityClass: 'authoritative', endpoints: [ECB],
    expectedSchema: { mediaTypes: ['application/json'], requiredFields: [], driftTolerance: 0 },
    budgets: { maxRequestsPerRun: 3, maxBytesPerRun: 1 << 24, maxConcurrency: 1, timeoutMs: 60_000, maxRetries: 0 },
    egress: { hostAllowlist: ['data-api.ecb.europa.eu', 'services9.arcgis.com'], schemeAllowlist: ['https'],
              maxRedirects: 0, timeoutMs: 1000, maxResponseBytes: 1 << 24, maxDecompressedBytes: 1 << 24 },
    ...over,
  };
}

function ok(body: string): EgressResult {
  return {
    status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from(body, 'utf8'),
    finalUrlRedacted: 'redacted', hops: [], tlsVerified: true, originAllowlisted: true,
    pinnedAddress: '203.0.113.1', retryAfterSeconds: null,
  };
}

function ctx(b: SourceBinding, checkpoint: Record<string, unknown> | null): AcquisitionContext {
  return { binding: b, checkpoint, budget: new BudgetMeter(b.budgets), replayRoot: '/nonexistent' };
}

const PERIOD: BackfillDeclaration = {
  strategy: 'period-range', endpoint: ECB, from: '2020-01-01', to: '2021-01-01',
  windowDays: 100, startParam: 'startPeriod', endParam: 'endPeriod',
};

describe('P4-M0a · period-range backfill walks a closed window in deterministic steps', () => {
  it('stops at the request budget and leaves a cursor the next run resumes from', async () => {
    const urls: string[] = [];
    const conn = new RestConnector({ egress: async ({ url }) => { urls.push(url); return ok('{"dataSets":[]}'); } });
    const b = binding({ backfill: PERIOD });
    const run1 = await conn.acquire(ctx(b, null));
    expect(run1.requestsMade).toBe(3);
    expect(urls).toEqual([
      `${ECB}&startPeriod=2020-01-01&endPeriod=2020-04-09`,
      `${ECB}&startPeriod=2020-04-10&endPeriod=2020-07-18`,
      `${ECB}&startPeriod=2020-07-19&endPeriod=2020-10-26`,
    ]);
    const p1 = run1.checkpoint['backfill'] as { cursor: string; done: boolean; requests: number };
    expect(p1.done).toBe(false);
    expect(p1.cursor).toBe('2020-10-27');
    expect(run1.items.every((i) => i.deterministic === true)).toBe(true);
    expect(run1.items[0]?.transport.methodRef).toBe(BACKFILL_METHOD_REF);

    // The next run continues from the checkpoint, finishes the window, and does
    // NOT poll the forward endpoint in the same run.
    urls.length = 0;
    const run2 = await conn.acquire(ctx(b, run1.checkpoint));
    expect(urls).toEqual([`${ECB}&startPeriod=2020-10-27&endPeriod=2020-12-31`]);
    const p2 = run2.checkpoint['backfill'] as { cursor: string; done: boolean; finishedAt: string | null };
    expect(p2.done).toBe(true);
    expect(p2.cursor).toBe('2021-01-01');
    expect(p2.finishedAt).not.toBeNull();

    // A finished backfill hands over to the forward poll, checkpoint kept.
    urls.length = 0;
    const run3 = await conn.acquire(ctx(b, run2.checkpoint));
    expect(urls).toEqual([ECB]);
    expect((run3.checkpoint['backfill'] as { done: boolean }).done).toBe(true);
  });

  it('keys a window by what it covers, never by when it was fetched', async () => {
    const conn = new RestConnector({ egress: async () => ok('{}') });
    const b = binding({ backfill: PERIOD });
    const a = await conn.acquire(ctx(b, null));
    const later = await conn.acquire(ctx(b, null));
    expect(a.items.map((i) => i.itemKey)).toEqual(later.items.map((i) => i.itemKey));
    expect(a.items[0]?.itemKey).toMatch(/@backfill:2020-01-01\.\.2020-04-10$/);
  });

  it('restarts from the declaration when the checkpoint belongs to a different window', () => {
    const p = backfillProgressOf(
      { backfill: { strategy: 'period-range', from: '2019-01-01', to: '2021-01-01', contractVersion: 2, cursor: '2020-06-01', done: false } },
      PERIOD, 2);
    expect(p.cursor).toBe('2020-01-01');
    expect(p.done).toBe(false);
  });

  it('a NEW contract version walks the same declaration again — that is how a range is re-collected', () => {
    const done = { backfill: { strategy: 'period-range', from: '2020-01-01', to: '2021-01-01', contractVersion: 2,
                               cursor: '2021-01-01', done: true } };
    expect(backfillProgressOf(done, PERIOD, 2).done).toBe(true);
    const again = backfillProgressOf(done, PERIOD, 3);
    expect(again.done).toBe(false);
    expect(again.cursor).toBe('2020-01-01');
    expect(again.contractVersion).toBe(3);
  });

  it('never exceeds the budget it was given', async () => {
    const conn = new RestConnector({ egress: async () => ok('{}') });
    const b = binding({ backfill: { ...PERIOD, windowDays: 1 } });
    const out = await conn.acquire(ctx(b, null));
    expect(out.requestsMade).toBe(3);
  });
});

describe('P4-M0a · arcgis-offset backfill pages in a declared order', () => {
  const decl: BackfillDeclaration = {
    strategy: 'arcgis-offset', endpoint: ARCGIS, from: '2019-01-01', to: '2019-01-05',
    pageSize: 2, orderBy: 'date,portid', timeField: 'date', where: "portid='chokepoint4'",
  };
  const page = (rows: Array<[string, number]>, exceeded: boolean) => JSON.stringify({
    exceededTransferLimit: exceeded,
    features: rows.map(([date, n]) => ({ attributes: { portid: 'chokepoint4', date, n_total: n } })),
  });

  it('orders every page, frames rows as deterministic children, and stops when the service says so', async () => {
    const urls: string[] = [];
    const pages = [page([['2019-01-01', 5], ['2019-01-02', 6]], true), page([['2019-01-03', 7], ['2019-01-04', 8]], false)];
    const conn = new RestConnector({ egress: async ({ url }) => { urls.push(url); return ok(pages[urls.length - 1] as string); } });
    const b = binding({
      endpoints: [ARCGIS], backfill: decl,
      expectedSchema: { mediaTypes: ['application/json'], requiredFields: [], driftTolerance: 0,
                        itemPath: 'features', itemKeyField: 'attributes.date', itemTimeField: 'attributes.date' },
      budgets: { maxRequestsPerRun: 12, maxBytesPerRun: 1 << 24, maxConcurrency: 1, timeoutMs: 60_000, maxRetries: 0 },
    });
    const out = await conn.acquire(ctx(b, null));
    expect(urls.length).toBe(2);
    for (const u of urls) {
      const q = new URL(u).searchParams;
      expect(q.get('orderByFields')).toBe('date,portid');
      expect(q.get('resultRecordCount')).toBe('2');
      expect(q.get('where')).toContain("portid='chokepoint4'");
      expect(q.get('where')).toContain("date >= TIMESTAMP '2019-01-01 00:00:00'");
      expect(q.get('where')).toContain("date < TIMESTAMP '2019-01-05 00:00:00'");
    }
    expect(new URL(urls[0] as string).searchParams.get('resultOffset')).toBe('0');
    expect(new URL(urls[1] as string).searchParams.get('resultOffset')).toBe('2');
    const parents = out.items.filter((i) => i.parentItemKey == null);
    const children = out.items.filter((i) => i.parentItemKey != null);
    expect(parents.length).toBe(2);
    expect(children.map((c) => c.publisherTime)).toEqual(['2019-01-01', '2019-01-02', '2019-01-03', '2019-01-04']);
    expect(children.every((c) => c.deterministic === true)).toBe(true);
    const p = out.checkpoint['backfill'] as { done: boolean; cursor: number; items: number };
    expect(p.done).toBe(true);
    expect(p.cursor).toBe(4);
    expect(p.items).toBe(4);
  });

  it('a page cut short by the transfer limit is not the last page', () => {
    const progress = backfillProgressOf({}, decl, 2);
    const step = nextRequest(decl, progress);
    expect(step.itemKey).toMatch(/@backfill:2019-01-01\.\.2019-01-05#0$/);
  });
});

describe('P4-M0a · the contract validator refuses a backfill it could not walk safely', () => {
  const base = () => ({
    source_key: 'ecb-eurusd', name: 'ECB', publisher: 'European Central Bank',
    authority_class: 'authoritative', connector_kind: 'rest', acquisition_mode: 'live', data_origin: 'real',
    identity: { source_identity: 'ecb', publisher_identity: 'ECB', endpoints: [ECB], scheme_allowlist: ['https'], cadence_seconds: 86_400 },
    authority_and_rights: {
      owner: 'o', steward: 's', authority: 'a', legal_basis: 'l', rights_state: 'confirmed', licence: 'ESCB reuse policy',
      attribution: 'Source: ECB statistics.', permitted_use: ['internal analysis'], robots_policy: 'public', purposes: ['observation'],
      classification_ceiling: 'internal', residency: 'EU', retention: '24 months', deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: null, authentication_method: 'anonymous',
      authenticity_method: { transport_endpoint: 't', byte_integrity: 'b', source_origin: 's', content_authenticity: 'c' },
      budgets: { max_requests_per_run: 12, max_bytes_per_run: 1 << 24, max_concurrency: 1, timeout_ms: 60_000, max_retries: 0 },
      expected_schema: { media_types: ['application/json'], required_fields: ['dataSets'], drift_tolerance: 0 },
      freshness_expectation: { threshold_seconds: 259_200, expected_interval: 'daily' },
      coverage_expectations: { universe_version: 'v1', denominator_derivation: 'd' },
      correction_channel: 'republication',
      backfill: { strategy: 'period-range', endpoint: ECB, from: '1999-01-04', to: null, window_days: 366,
                  start_param: 'startPeriod', end_param: 'endPeriod' },
    },
    lifecycle: { contract_version: 2, effective_from: '2026-09-05T00:00:00Z', supersedes_version: 1 },
  });

  it('accepts a complete period-range declaration', () => {
    expect(validateSourceContract(base()).errors).toEqual([]);
  });

  it('refuses a backfill on a host the contract does not name', () => {
    const c = base(); c.security_and_operations.backfill.endpoint = 'https://elsewhere.example/data';
    expect(validateSourceContract(c).errors.join(' ')).toMatch(/host/);
  });

  it('refuses an arcgis walk that declares no ordering', () => {
    const c = base() as unknown as { security_and_operations: { backfill: Record<string, unknown> } };
    c.security_and_operations.backfill = { strategy: 'arcgis-offset', endpoint: ECB, from: '2019-01-01', page_size: 1000, time_field: 'date' };
    expect(validateSourceContract(c).errors.join(' ')).toMatch(/order_by/);
  });

  it('refuses a backfill on a replay contract', () => {
    const c = base(); c.acquisition_mode = 'replay';
    expect(validateSourceContract(c).errors.join(' ')).toMatch(/replay/);
  });
});
