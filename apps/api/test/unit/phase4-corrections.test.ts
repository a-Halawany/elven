/**
 * CODEX REVIEW OF 737ca81a — service-level probes (real implementations, doubles).
 * Database and API evidence for the same groups: test/int/phase4-corrections.test.ts.
 */
import { describe, expect, it } from 'vitest';
import { RestConnector, backfillProgressOf } from '../../src/observation/connectors/rest.connector.js';
import { BudgetMeter, type AcquisitionContext, type SourceBinding, type BackfillDeclaration } from '../../src/observation/connectors/sdk.js';
import type { EgressResult } from '../../src/observation/connectors/http-client.js';

const ECB = 'https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?format=jsondata';
const ARCGIS = 'https://services9.arcgis.com/x/arcgis/rest/services/PortWatch_chokepoints_database/FeatureServer/0/query';

function binding(over: Partial<SourceBinding> & { backfill?: BackfillDeclaration }): SourceBinding {
  return {
    sourceId: 's', sourceKey: 'k', replaySet: 'k', contractVersion: 2, acquisitionMode: 'live',
    authorityClass: 'authoritative', endpoints: [ECB],
    expectedSchema: { mediaTypes: ['application/json'], requiredFields: [], driftTolerance: 0 },
    budgets: { maxRequestsPerRun: 12, maxBytesPerRun: 1 << 24, maxConcurrency: 1, timeoutMs: 60_000, maxRetries: 0 },
    egress: { hostAllowlist: ['data-api.ecb.europa.eu', 'services9.arcgis.com'], schemeAllowlist: ['https'],
              maxRedirects: 0, timeoutMs: 1000, maxResponseBytes: 1 << 24, maxDecompressedBytes: 1 << 24 },
    ...over,
  };
}
const ok = (body: string): EgressResult => ({
  status: 200, headers: { 'content-type': 'application/json' }, body: Buffer.from(body, 'utf8'),
  finalUrlRedacted: 'redacted', hops: [], tlsVerified: true, originAllowlisted: true, pinnedAddress: '203.0.113.1', retryAfterSeconds: null,
});
const ctx = (b: SourceBinding, checkpoint: Record<string, unknown> | null): AcquisitionContext =>
  ({ binding: b, checkpoint, budget: new BudgetMeter(b.budgets), replayRoot: '/nonexistent' });

describe('F7 — an open-ended backfill keeps its resolved upper bound across days', () => {
  const decl: BackfillDeclaration = { strategy: 'period-range', endpoint: ECB, from: '1999-01-04', to: null, windowDays: 366,
                                      startParam: 'startPeriod', endParam: 'endPeriod' };
  it('does not restart when `to` resolves to a later day than the checkpoint recorded', () => {
    const yesterday = { backfill: { strategy: 'period-range', from: '1999-01-04', to: '2026-09-04', contractVersion: 2,
                                    cursor: '2011-01-13', done: false, requests: 12 } };
    const p = backfillProgressOf(yesterday, decl, 2);
    expect(p.cursor, 'an overnight run restarted the backfill from 1999').toBe('2011-01-13');
    expect(p.to).toBe('2026-09-04');
  });
});

describe('F7 — an ArcGIS error envelope is a failed page, not an empty range', () => {
  it('refuses to mark the range complete when the page is an error', async () => {
    const decl: BackfillDeclaration = { strategy: 'arcgis-offset', endpoint: ARCGIS, from: '2019-01-01', to: '2019-02-01',
                                        pageSize: 1000, orderBy: 'date,portid', timeField: 'date', where: "portid='chokepoint4'" };
    const conn = new RestConnector({ egress: async () => ok(JSON.stringify({ error: { code: 400, message: 'Invalid query parameters', details: [] } })) });
    const b = binding({ endpoints: [ARCGIS], backfill: decl });
    let threw = false; let out: Awaited<ReturnType<typeof conn.acquire>> | null = null;
    try { out = await conn.acquire(ctx(b, null)); } catch { threw = true; }
    const done = out === null ? false : (out.checkpoint['backfill'] as { done: boolean }).done;
    expect(threw || !done, 'an HTTP 200 error envelope marked the range complete with zero history').toBe(true);
    expect(out === null || out.items.length === 0, 'the error envelope was emitted as evidence').toBe(true);
  });
});
