/**
 * SOURCE-IMPACT MARKERS, READ AND ACKNOWLEDGED — CP-6 B24 (0086 §markers; F-P6-07, V03-T-077 "no UI shows markers").
 *
 *   markers       the markers of the domain (active by default), grouped by the SOURCE they carry, each with the PRODUCT it
 *                 sits on named in words (a forecast's series and horizon, a warning's title, a scenario's title, a run's
 *                 kind and component, a package's title) — or, for ONE package version, the markers that BEAR on it
 *                 (on the package or on what the version cites), each with its acknowledgement for that version and the
 *                 commitment gate that follows (blocked while one is outstanding).
 *   acknowledge   a decision authority's acknowledgement, for one version, of the markers that bear on it; the port judges
 *                 the person, the markers and the version, and answers what was recorded, what already was, and what is
 *                 still outstanding.
 *
 * Nothing here decides a health state or a gate: the markers are the source-health subscriber's (0083) and the run gate's
 * (0086 §M5), the bearing and the acknowledgement are the ports'. Every row is the server's, rendered as recorded.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import type { ScopeContext } from '../../shared/scope.js';
import { newId } from '../../shared/ids.js';
import type { Acknowledgement, BearingRow, SourceImpactReads, SourceImpactWrites } from './source-impact.capabilities.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** The health states a marker carries, worst first (a failed or suspended source refuses a run on it; degraded or unknown admits it, declared). */
export const IMPACT_STATES = ['failed', 'suspended', 'degraded', 'unknown'] as const;
export const IMPACT_SUBJECT_KINDS = ['forecast', 'warning', 'scenario', 'run', 'package'] as const;
const worst = (states: string[]): string => IMPACT_STATES.find((s) => states.includes(s)) ?? 'unknown';
const iso = (v: unknown): string | null => (v instanceof Date ? v.toISOString() : typeof v === 'string' ? v : null);
const bad = (correlationId: string, msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', correlationId, msg), 422); };

/** One marker as the list serves it: the product it sits on, named. */
export interface MarkerView {
  marker_id: string; source_id: string; subject_kind: string; subject_id: string; subject_title: string; health_state: string; reason: string | null;
  state: string; set_at: string | null; set_by_event: string; cleared_at: string | null; cleared_state: string | null;
}
/** A source and the markers it carries; `worst_state` is the worst among its ACTIVE markers (`cleared` when none is active). */
export interface SourceGroup { source_id: string; source_name: string | null; source_key: string | null; worst_state: string; markers: MarkerView[]; counts: Record<string, number> }
export interface PackageBearing {
  package_id: string; title: string; state: string; version: number; current_version: number | null; committed_version: number | null;
  markers: Array<BearingRow & { subject_title: string }>; outstanding: number; gate: 'clear' | 'blocked';
}

export interface MarkersFilter { state?: unknown; sourceId?: unknown; packageId?: unknown; version?: unknown; limit?: unknown }

@Injectable()
export class SourceImpactService {
  /** The markers of the domain grouped by source, or the bearing of one package version (payload packageId [+ version]). */
  async markers(cap: SourceImpactReads, ctx: ScopeContext, filter: MarkersFilter, correlationId: string): Promise<{ sources: SourceGroup[]; total: number } | { package: PackageBearing }> {
    if (filter.packageId !== undefined && filter.packageId !== null && filter.packageId !== '') {
      if (typeof filter.packageId !== 'string' || !UUID.test(filter.packageId)) bad(correlationId, 'packageId, when given, is a package id');
      return { package: await this.bearingOf(cap, ctx, filter.packageId as string, filter.version, correlationId) };
    }
    const state = filter.state === undefined || filter.state === null || filter.state === '' ? 'active' : filter.state;
    if (state !== 'active' && state !== 'cleared' && state !== 'all') bad(correlationId, 'state is active, cleared or all');
    if (filter.sourceId !== undefined && filter.sourceId !== null && filter.sourceId !== '' && (typeof filter.sourceId !== 'string' || !UUID.test(filter.sourceId))) bad(correlationId, 'sourceId, when given, is a source id');
    const limit = typeof filter.limit === 'number' && Number.isInteger(filter.limit) && filter.limit >= 1 && filter.limit <= 1000 ? filter.limit : 500;
    let q = cap.readMarkers().selectAll().orderBy('set_at' as never, 'desc').orderBy('marker_id' as never).limit(limit);
    if (state !== 'all') q = q.where('state' as never, '=', state as never);
    if (typeof filter.sourceId === 'string' && filter.sourceId !== '') q = q.where('source_id' as never, '=', filter.sourceId as never);
    const rows = (await q.execute()) as Row[];
    const titles = await this.titles(cap, rows.map((r) => ({ kind: String(r['subject_kind']), id: String(r['subject_id']) })));
    const sourceIds = [...new Set(rows.map((r) => String(r['source_id'])))];
    const contracts = sourceIds.length === 0 ? [] : ((await cap.readSourceContracts().select(['source_id', 'name', 'source_key', 'contract_version'] as never)
      .where('source_id' as never, 'in', sourceIds as never).orderBy('contract_version' as never, 'desc').execute()) as Row[]);
    const groups = new Map<string, SourceGroup>();
    for (const r of rows) {
      const sid = String(r['source_id']);
      let g = groups.get(sid);
      if (g === undefined) {
        const c = contracts.find((x) => String(x['source_id']) === sid);
        g = { source_id: sid, source_name: c === undefined ? null : String(c['name']), source_key: c === undefined ? null : String(c['source_key']), worst_state: 'unknown', markers: [], counts: {} };
        groups.set(sid, g);
      }
      const kind = String(r['subject_kind']);
      g.markers.push({ marker_id: String(r['marker_id']), source_id: sid, subject_kind: kind, subject_id: String(r['subject_id']), subject_title: titles.get(`${kind}:${String(r['subject_id'])}`) ?? `${kind} ${String(r['subject_id'])}`,
                       health_state: String(r['health_state']), reason: (r['reason'] as string | null) ?? null, state: String(r['state']), set_at: iso(r['set_at']), set_by_event: String(r['set_by_event']),
                       cleared_at: iso(r['cleared_at']), cleared_state: (r['cleared_state'] as string | null) ?? null });
      g.counts[kind] = (g.counts[kind] ?? 0) + 1;
    }
    // the worst state among the source's ACTIVE markers; a source whose listed markers are all cleared reads `cleared`
    for (const g of groups.values()) {
      const active = g.markers.filter((m) => m.state === 'active').map((m) => m.health_state);
      g.worst_state = active.length === 0 ? 'cleared' : worst(active);
    }
    return { sources: [...groups.values()], total: rows.length };
  }

  /** The acknowledgement (the decision route; human-gated at the PDP, the person and the markers judged by the port). */
  async acknowledge(cap: SourceImpactWrites, ctx: ScopeContext, packageId: string, intake: { version?: unknown; markerIds?: unknown; reason?: unknown }, actor: string, correlationId: string): Promise<Acknowledgement> {
    if (!UUID.test(packageId)) bad(correlationId, 'the package id is not a package id');
    const version = intake.version;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) bad(correlationId, 'version is the positive integer of the package version the acknowledgement is for');
    return cap.acknowledgeSourceImpact({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version: version as number,
      markerIds: intake.markerIds ?? null, reason: typeof intake.reason === 'string' ? intake.reason : null, actor, eventId: newId(), correlationId });
  }

  private async bearingOf(cap: SourceImpactReads, ctx: ScopeContext, packageId: string, versionIn: unknown, correlationId: string): Promise<PackageBearing> {
    const p = (await cap.readPackages().selectAll().where('package_id' as never, '=', packageId as never).executeTakeFirst()) as Row | undefined;
    if (p === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no authorized package matches'), 404);
    const current = p['current_version'] === null || p['current_version'] === undefined ? null : Number(p['current_version']);
    const version = versionIn === undefined || versionIn === null || versionIn === '' ? current : versionIn;
    if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) bad(correlationId, 'version, when given, is a positive integer (the current version otherwise)');
    const rows = await cap.bearing({ tenantId: ctx.tenantId as string, domainId: ctx.domainId as string, packageId, version: version as number });
    const titles = await this.titles(cap, rows.map((r) => ({ kind: r.subject_kind, id: r.subject_id })));
    const outstanding = rows.filter((r) => !r.acknowledged).length;
    return { package_id: packageId, title: String(p['title']), state: String(p['state']), version: version as number, current_version: current,
             committed_version: p['committed_version'] === null || p['committed_version'] === undefined ? null : Number(p['committed_version']),
             markers: rows.map((r) => ({ ...r, subject_title: titles.get(`${r.subject_kind}:${r.subject_id}`) ?? `${r.subject_kind} ${r.subject_id}` })),
             outstanding, gate: outstanding > 0 ? 'blocked' : 'clear' };
  }

  /** The products the markers sit on, named in words (read under the reader's RLS; one absent from it keeps its id). */
  private async titles(cap: SourceImpactReads, subjects: Array<{ kind: string; id: string }>): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    const ids = (kind: string) => [...new Set(subjects.filter((s) => s.kind === kind).map((s) => s.id))];
    const f = ids('forecast');
    if (f.length > 0) for (const r of (await cap.readForecasts().select(['forecast_id', 'series_key', 'horizon_code', 'label', 'state'] as never).where('forecast_id' as never, 'in', f as never).execute()) as Row[]) {
      out.set(`forecast:${String(r['forecast_id'])}`, `forecast of ${String(r['series_key'])} (${String(r['horizon_code'])}${r['label'] ? `, ${String(r['label'])}` : ''}; ${String(r['state'])})`);
    }
    const w = ids('warning');
    if (w.length > 0) for (const r of (await cap.readWarnings().select(['warning_id', 'title', 'state'] as never).where('warning_id' as never, 'in', w as never).execute()) as Row[]) {
      out.set(`warning:${String(r['warning_id'])}`, `warning: ${String(r['title'])} (${String(r['state'])})`);
    }
    const s = ids('scenario');
    if (s.length > 0) for (const r of (await cap.readScenarios().select(['scenario_id', 'title', 'state'] as never).where('scenario_id' as never, 'in', s as never).execute()) as Row[]) {
      out.set(`scenario:${String(r['scenario_id'])}`, `scenario: ${String(r['title'])} (${String(r['state'])})`);
    }
    const rn = ids('run');
    if (rn.length > 0) for (const r of (await cap.readRuns().select(['run_id', 'run_kind', 'component', 'state', 'validity'] as never).where('run_id' as never, 'in', rn as never).execute()) as Row[]) {
      out.set(`run:${String(r['run_id'])}`, `SYNTHETIC ${String(r['run_kind'])} run on ${String(r['component'])} (${String(r['state'])}${r['validity'] === 'invalidated' ? ', invalidated' : ''})`);
    }
    const pk = ids('package');
    if (pk.length > 0) for (const r of (await cap.readPackages().select(['package_id', 'title', 'state'] as never).where('package_id' as never, 'in', pk as never).execute()) as Row[]) {
      out.set(`package:${String(r['package_id'])}`, `decision package: ${String(r['title'])} (${String(r['state'])})`);
    }
    return out;
  }
}
