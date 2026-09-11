/**
 * Service-level doubles for the two consequences the database harness cannot
 * stage: a MIX of complete and incomplete historical origins (a tombstone makes
 * every origin incomplete at once on a real database), and a flip whose cited
 * evidence version cannot be resolved at all.
 */
import { describe, expect, it } from 'vitest';
import { HttpException } from '@nestjs/common';
import { ForecastingService, MIN_ORIGINS } from '../../src/prediction/forecasting/forecasting.service.js';
import { ScenariosService } from '../../src/prediction/scenarios/scenarios.service.js';
import type { SeriesService, AssembledSeries } from '../../src/prediction/series/series.service.js';

const day = (i: number) => new Date(Date.UTC(2021, 0, 1) + i * 86_400_000).toISOString().slice(0, 10);
const N = 520;
const points = Array.from({ length: N }, (_, i) => ({
  date: day(i), value: 60 + 9 * Math.sin((2 * Math.PI * i) / 7) + ((i * 7919) % 13) / 13,
  evidence_object_id: 'e', evidence_version: 1, evidence_digest: 'd', recorded_at: '2021-01-01T00:00:00Z',
}));
const series = { series_key: 'k', source_key: 's', parser_ref: 'p@1', value_field: 'v', selector: null, unit: 'u', seasonality_days: 7,
  subject_entity_id: null, attribution: null, description: 'fixture', publication_calendar: null };
const controls = { synthetic_state: false, classification: 'internal', rights_profile: 'r', residency_profile: 'EU', retention_profile: null, access_policy_ref: null, inputs: 1 };

function assembled(cut: string | null, complete: boolean): AssembledSeries {
  const pts = cut === null ? points : points.filter((p) => p.date <= cut);
  return { series, knownAt: 'now', observedThrough: cut, points: pts, evidence: [], versionsRead: 1, freshestRecordedAt: null, attribution: null,
    unreadable: complete ? [] : [{ evidence_object_id: 'e', evidence_version: 1, reason: 'refused (409): governed-deleted' }],
    complete, controls, evidenceRows: [] } as unknown as AssembledSeries;
}

function forecasting(incompleteEvery: number | null, incompleteAll = false) {
  let originCalls = 0;
  const fake = {
    assemble: async (_r: unknown, _k: string, _knownAt: string, observedThrough: string | null) => {
      if (observedThrough === null) return assembled(null, true);
      originCalls += 1;
      const incomplete = incompleteAll || (incompleteEvery !== null && originCalls % incompleteEvery === 0);
      return assembled(observedThrough, !incomplete);
    },
  } as unknown as SeriesService;
  const recorded: Array<Record<string, unknown>> = [];
  const cap = { recordBacktest: async (a: Record<string, unknown>) => { recorded.push(a); } };
  return { svc: new ForecastingService(fake), recorded, cap };
}

describe('F2 — historical origins on incomplete history are excluded, never fitted', () => {
  it('a mix: incomplete origins are counted out and the rest are scored', async () => {
    const { svc, recorded, cap } = forecasting(5);
    const r = await svc.backtest(cap as never, { tenantId: 't', domainId: 'd' } as never, {} as never,
      { seriesKey: 'k', horizonCode: '30d', knownAt: 'now', origins: 30, stride: 7, mode: 'historical' }, 'actor', 'corr');
    expect(r['mode']).toBe('historical');
    expect(Number(r['incomplete'])).toBeGreaterThan(0);
    expect(Number(r['origins'])).toBeGreaterThanOrEqual(MIN_ORIGINS);
    expect(Number(r['origins']) + Number(r['incomplete'])).toBe(30);
    expect(typeof r['t2_met']).toBe('boolean');
    const rec = recorded[0] as Record<string, unknown>;
    expect((rec['details'] as Record<string, unknown>)['incomplete']).toBe(r['incomplete']);
    expect(rec['origins']).toBe(r['origins']);
  });

  it('every origin incomplete with enough remaining history: CANNOT VALIDATE, none fitted, minimum enforced', async () => {
    const { svc, recorded, cap } = forecasting(null, true);
    const r = await svc.backtest(cap as never, { tenantId: 't', domainId: 'd' } as never, {} as never,
      { seriesKey: 'k', horizonCode: '30d', knownAt: 'now', origins: 20, stride: 7, mode: 'historical' }, 'actor', 'corr');
    expect(r['origins']).toBe(0);
    expect(r['incomplete']).toBe(20);
    expect(r['t1_met']).toBeNull();
    expect(r['t2_met']).toBeNull();
    expect(String(r['verdict'])).toMatch(/CANNOT VALIDATE \(historical\).*20 had evidence this reader could not read/);
    expect((recorded[0]?.['details'] as Record<string, unknown>)['reason']).toBe('incomplete history at the origins');
  });
});

describe('F3 — a flip whose cited evidence controls cannot be resolved is not admitted; it stays owed', () => {
  it('warnForFlip refuses before admitting anything', async () => {
    const chain = (row: unknown) => ({ selectAll: () => ({ where: () => ({ executeTakeFirst: async () => row }) }) });
    let admitted = 0; let raised = 0;
    const cap = {
      readBranches: () => chain({ branch_id: 'b', scenario_id: 's', indicator_id: 'i', name: 'Collapse', owner_principal_id: 'o', response_window_hours: 48, consequence: 'rebook now', decision_deadline: null }),
      readScenarios: () => chain({ scenario_id: 's', title: 'T', forecast_id: null, controls }),
      readIndicators: () => chain({ series_key: 'k', comparator: '<', threshold: 40, consecutive_days: 5 }),
      admitObject: async () => { admitted += 1; return { contentDigest: 'x' }; },
      raiseWarning: async () => { raised += 1; },
    };
    const svc = new ScenariosService({} as never);
    await expect(svc.warnForFlip(cap as never, { tenantId: 't', domainId: 'd' } as never,
      { branchId: 'b', flipEventId: 'f', observationAt: '2023-11-24', value: 31, evidenceObjectId: 'e', evidenceVersion: 1, evidenceControls: null },
      0.8, 'actor', 'corr', 'prediction', 'replay')).rejects.toSatisfy((e: unknown) => e instanceof HttpException && e.getStatus() === 409 && /stays owed/.test(String((e.getResponse() as { message?: string }).message)));
    expect(admitted).toBe(0);
    expect(raised).toBe(0);
  });
});
