/**
 * RISK AND OPPORTUNITY INTELLIGENCE — CP-6 B32 (0089 §R; F-P4-13: WS-09, UX-35-001..006, PR-27/PR-28, CAP-FW-04/-05, OBJ-22/-23, JRN-08/-09).
 *
 * The intakes (a shape check before the port — the port decides the rules and says so), and the reads the workspace renders. The two
 * polarities are read the SAME way (AI-52-001: symmetric evidence, uncertainty, timing, ownership, monitoring and closure standards):
 *   the register   every exposure with its owner, state, accepted version, residual (with its computation), appetite judgement, the
 *                  GAPS that keep it out of a roll-up (unassessed, only an agent's estimate, contested, stale, closed) and the priority's
 *                  dimensions and words; the taxonomy in force, the appetites, the recent aggregations;
 *   an exposure    its versions (each with its digest and whether a human or an agent assessed it), events, drivers, controls, residuals,
 *                  correlations (declared and estimated, apart), hypotheses, responses (the decision's package state and its OUTCOMES,
 *                  read from the decision module's own record), the warning candidate a breach submitted;
 *   the preview    what accepting a version would do (OBJ-22's consequence preview) — nothing written;
 *   the priority   lexicographic over transparent dimensions, ranked within polarity and unit (a residual in EUR is not compared with one
 *                  in days) — a dimension with no input ranks last; no weighted score.
 * Every rows' classification is the RSK's (internal, the strategy header's): nothing here is withheld by clearance.
 */
import { HttpException, Injectable } from '@nestjs/common';
import { errorBody } from '@eye/contracts';
import type { ExposureReads } from './exposures.capabilities.js';

type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;
const isObj = (v: unknown): v is Row => typeof v === 'object' && v !== null && !Array.isArray(v);
const bad = (c: string, msg: string): never => { throw new HttpException(errorBody('EYE_REQ_001', c, msg), 422); };
const str = (v: unknown, name: string, c: string, min: number, max: number): string => {
  if (typeof v !== 'string' || v.trim().length < min || v.length > max) bad(c, `${name} is ${min}..${max} characters`);
  return (v as string).trim();
};
const int = (v: unknown, name: string, c: string, min: number, max: number): number => {
  if (!Number.isInteger(v) || (v as number) < min || (v as number) > max) bad(c, `${name} is a whole number in [${min}, ${max}]`);
  return v as number;
};
const num = (v: unknown, name: string, c: string): number => {
  if (typeof v !== 'number' || !Number.isFinite(v)) bad(c, `${name} is a number`);
  return v as number;
};
const uuid = (v: unknown, name: string, c: string): string => {
  if (typeof v !== 'string' || !UUID.test(v)) bad(c, `${name} is a uuid`);
  return (v as string).toLowerCase();
};
const optUuid = (v: unknown, name: string, c: string): string | null => (v === undefined || v === null ? null : uuid(v, name, c));

export const POLARITIES = ['risk', 'opportunity'] as const;
export const RESPONSE_KINDS = ['mitigate', 'exploit', 'accept', 'transfer', 'avoid'] as const;
export const CLOSURE_CRITERIA = ['resolved', 'mitigated', 'realized', 'expired', 'pursued', 'abandoned', 'duplicate', 'withdrawn'] as const;

/* ───────────── the intakes ───────────── */
export function validateTaxonomy(p: Row, c: string): { expectedVersion: number; categories: unknown[]; reason: string } {
  const expectedVersion = int(p['expectedVersion'] ?? 0, 'expectedVersion', c, 0, 100_000);
  if (!Array.isArray(p['categories']) || p['categories'].length === 0 || p['categories'].length > 200) bad(c, 'categories is a list of 1..200 {key, label, polarity: risk | opportunity | both, parent?}');
  return { expectedVersion, categories: p['categories'] as unknown[], reason: str(p['reason'], 'reason', c, 8, 2000) };
}

export function validateAppetite(p: Row, c: string): { category: string; expectedVersion: number; threshold: number; unit: string; statement: string; reason: string } {
  return { category: str(p['category'], 'category', c, 1, 64), expectedVersion: int(p['expectedVersion'] ?? 0, 'expectedVersion', c, 0, 100_000), threshold: num(p['threshold'], 'threshold', c),
           unit: str(p['unit'], 'unit', c, 1, 32), statement: str(p['statement'], 'statement', c, 8, 2000), reason: str(p['reason'], 'reason', c, 8, 2000) };
}

export interface RegisterIntake { exposureId: string; polarity: 'risk' | 'opportunity'; category: string; owner: string; reviewEveryDays: number | null }
export function validateRegister(p: Row, c: string): RegisterIntake {
  const exposureId = uuid(p['strategyObjectId'], 'strategyObjectId (the RSK declared through the Strategy Graph)', c);
  if (!(POLARITIES as readonly unknown[]).includes(p['polarity'])) bad(c, 'polarity is risk or opportunity');
  const reviewEveryDays = p['reviewEveryDays'] === undefined || p['reviewEveryDays'] === null ? null : int(p['reviewEveryDays'], 'reviewEveryDays', c, 1, 366);
  return { exposureId, polarity: p['polarity'] as RegisterIntake['polarity'], category: str(p['category'], 'category', c, 1, 64), owner: uuid(p['owner'], 'owner', c), reviewEveryDays };
}

/** An assessment: the port checks every field; here only that it is an object and the version it was read at. */
export function validateAssess(p: Row, c: string): { expectedVersion: number; assessment: Row } {
  const expectedVersion = int(p['expectedVersion'], 'expectedVersion (the version the assessment was read at)', c, 0, 100_000);
  if (!isObj(p['assessment'])) bad(c, 'assessment is {mechanism, probability {low, high} | plausibility, impact {low, high, unit}, horizon, response_window_hours?, velocity?, reversibility?, controllability?, options?, evidence?, confidence?, basis?}');
  return { expectedVersion, assessment: p['assessment'] as Row };
}

export function validateReason(p: Row, c: string, what: string): string { return str(p['reason'], `${what} states its reason (reason)`, c, 8, 2000); }

export function validateAccept(p: Row, c: string): { digest: string; rationale: string } {
  if (typeof p['digest'] !== 'string' || !HEX64.test(p['digest'])) bad(c, 'digest is the 64-hex digest of the exact version previewed');
  return { digest: p['digest'] as string, rationale: str(p['rationale'], 'rationale', c, 8, 2000) };
}

export function validateControl(p: Row, c: string): { title: string; kind: string; effectivenessLow: number; effectivenessHigh: number; owner: string } {
  const eff = p['effectiveness'];
  if (!isObj(eff)) bad(c, 'effectiveness is a bracket {low, high} in [0, 1]');
  const e = eff as Row;
  if (!['preventive', 'detective', 'corrective'].includes(String(p['kind']))) bad(c, 'kind is preventive, detective or corrective');
  return { title: str(p['title'], 'title', c, 3, 256), kind: String(p['kind']), effectivenessLow: num(e['low'], 'effectiveness.low', c), effectivenessHigh: num(e['high'], 'effectiveness.high', c), owner: uuid(p['owner'], 'owner', c) };
}

export function validateHypothesis(p: Row, c: string): { statement: string; falsifier: string; value: Row; timing: Row; options: unknown[]; capabilities: string[] } {
  if (!isObj(p['value'])) bad(c, 'value is a range {low, high, unit}');
  if (!isObj(p['timing'])) bad(c, 'timing is {window, from?, to?}');
  const options = p['options'] === undefined ? [] : p['options'];
  if (!Array.isArray(options)) bad(c, 'options is a list of {key, label}');
  const caps = p['capabilities'] === undefined ? [] : p['capabilities'];
  if (!Array.isArray(caps) || caps.length > 50) bad(c, 'capabilities is a list of at most 50 CAP ids');
  return { statement: str(p['statement'], 'statement', c, 8, 4096), falsifier: str(p['falsifier'], 'falsifier', c, 8, 2000), value: p['value'] as Row, timing: p['timing'] as Row,
           options: options as unknown[], capabilities: (caps as unknown[]).map((x, i) => uuid(x, `capabilities[${i}]`, c)) };
}

export interface DecisionIntake { title: string; statement: string; decisionObjectId: string | null; packageId: string | null }
const decisionIntake = (v: unknown, c: string, fallbackTitle: string, fallbackStatement: string): DecisionIntake => {
  const d = isObj(v) ? v : {};
  return { title: d['title'] === undefined ? fallbackTitle : str(d['title'], 'decision.title', c, 2, 256),
           statement: d['statement'] === undefined ? fallbackStatement : str(d['statement'], 'decision.statement', c, 2, 4096),
           decisionObjectId: optUuid(d['decisionObjectId'], 'decision.decisionObjectId', c), packageId: optUuid(d['packageId'], 'decision.packageId', c) };
};

export function validateSponsor(p: Row, c: string, title: string): { digest: string; terms: Row; decision: DecisionIntake } {
  if (typeof p['digest'] !== 'string' || !HEX64.test(p['digest'])) bad(c, 'digest is the 64-hex digest of the exact version sponsored');
  if (!isObj(p['terms'])) bad(c, 'terms is {option_key, rationale, conditions, budget?, objective_id?}');
  return { digest: p['digest'] as string, terms: p['terms'] as Row,
           decision: decisionIntake(p['decision'], c, `Evaluate: ${title}`.slice(0, 256), `The sponsored evaluation of the opportunity "${title}" — pursue, defer or abandon`.slice(0, 4096)) };
}

export function validateOpenDecision(p: Row, c: string, title: string): { kind: string; decision: DecisionIntake } {
  if (!(RESPONSE_KINDS as readonly unknown[]).includes(p['kind'])) bad(c, `kind is ${RESPONSE_KINDS.join(', ')}`);
  const kind = String(p['kind']);
  return { kind, decision: decisionIntake(p['decision'] ?? p, c, `${kind[0]!.toUpperCase()}${kind.slice(1)}: ${title}`.slice(0, 256), `The ${kind} decision on the exposure "${title}"`.slice(0, 4096)) };
}

export function validateClose(p: Row, c: string): { criterion: string; reason: string } {
  if (!(CLOSURE_CRITERIA as readonly unknown[]).includes(p['criterion'])) bad(c, `criterion is ${CLOSURE_CRITERIA.join(', ')}`);
  return { criterion: String(p['criterion']), reason: str(p['reason'], 'reason', c, 8, 2000) };
}

export function validateCorrelation(p: Row, c: string): { a: string; b: string; relation: string; coefficient: number | null; basis: string } {
  if (!['independent', 'correlated', 'comonotone'].includes(String(p['relation']))) bad(c, 'relation is independent, correlated or comonotone');
  const coefficient = p['coefficient'] === undefined || p['coefficient'] === null ? null : num(p['coefficient'], 'coefficient', c);
  return { a: uuid(p['a'], 'a', c), b: uuid(p['b'], 'b', c), relation: String(p['relation']), coefficient, basis: str(p['basis'], 'basis', c, 8, 2000) };
}

export function validateAggregate(p: Row, c: string): { members: string[] } {
  if (!Array.isArray(p['members']) || p['members'].length < 2 || p['members'].length > 100) bad(c, 'members is a list of 2..100 exposure ids');
  return { members: (p['members'] as unknown[]).map((x, i) => uuid(x, `members[${i}]`, c)) };
}

/* ───────────── the gaps (what keeps an exposure out of a roll-up — the port's own rules, read for the screen) ───────────── */
export function gapsOf(x: Row, now: Date = new Date()): string[] {
  const g: string[] = [];
  if (x['state'] === 'closed') return ['closed'];
  if (x['accepted_version'] === null || x['accepted_version'] === undefined) {
    g.push(Number(x['current_version'] ?? 0) === 0 ? 'unassessed' : x['has_agent_proposal'] === true ? 'unaccepted (an agent\'s estimate is a recommendation)' : 'unaccepted');
  }
  if (x['state'] === 'contested') g.push('contested');
  const every = x['review_every_days'];
  if (typeof every === 'number' && x['accepted_at'] !== null && x['accepted_at'] !== undefined) {
    const due = new Date(new Date(String(x['accepted_at'])).getTime() + every * 86_400_000);
    if (due < now) g.push(`stale (review due ${due.toISOString().slice(0, 10)})`);
  }
  if (x['breach'] === true && (x['routed_candidate_id'] === null || x['routed_candidate_id'] === undefined)) g.push('outside appetite — not yet routed');
  return g;
}

@Injectable()
export class ExposuresService {
  /** The WS-09 register: both polarities, side by side, with the gaps and the priority. */
  async register(cap: ExposureReads): Promise<Row> {
    const exposures = (await cap.readExposures().selectAll().orderBy('registered_at' as never).execute()) as Row[];
    const ids = exposures.map((x) => String(x['exposure_id']));
    const strategy = ids.length === 0 ? [] : (await cap.readStrategy().select(['strategy_object_id', 'title', 'statement', 'status', 'object_version'] as never).where('strategy_object_id' as never, 'in', ids as never).execute()) as Row[];
    const residuals = ids.length === 0 ? [] : (await cap.readResiduals().selectAll().where('exposure_id' as never, 'in', ids as never).orderBy('computed_at' as never, 'desc').execute()) as Row[];
    const agentProposals = ids.length === 0 ? [] : (await cap.readVersions().select(['exposure_id'] as never).where('exposure_id' as never, 'in', ids as never).where('assessed_kind' as never, '=', 'agent' as never)
      .where('state' as never, '=', 'proposed' as never).execute()) as Row[];
    const pri = await cap.priorities();
    const byId = <T extends Row>(rows: T[], k = 'exposure_id') => new Map(rows.map((r) => [String(r[k]), r]));
    const s = byId(strategy, 'strategy_object_id'); const p = new Map(pri.map((r) => [r.exposure_id, r]));
    const latest = new Map<string, Row>();
    for (const r of residuals) if (!latest.has(String(r['exposure_id']))) latest.set(String(r['exposure_id']), r);
    const proposing = new Set(agentProposals.map((r) => String(r['exposure_id'])));
    const rows: Row[] = exposures.map((x) => {
      const id = String(x['exposure_id']); const r = latest.get(id) ?? null;
      const row: Row = { ...x, title: s.get(id)?.['title'] ?? null, statement: s.get(id)?.['statement'] ?? null, residual: r, breach: r?.['breach'] ?? null, has_agent_proposal: proposing.has(id),
                    dims: p.get(id)?.dims ?? {}, priority: p.get(id)?.priority ?? null };
      return { ...row, gaps: gapsOf(row) };
    });
    const taxonomy = (await cap.readTaxonomy().selectAll().orderBy('version' as never, 'desc').limit(1).executeTakeFirst()) as Row | undefined;
    const appetites = (await cap.readAppetites().selectAll().orderBy('category_key' as never).orderBy('version' as never, 'desc').execute()) as Row[];
    const current = new Map<string, Row>();
    for (const a of appetites) if (!current.has(String(a['category_key']))) current.set(String(a['category_key']), a);
    const aggregations = (await cap.readAggregations().selectAll().orderBy('computed_at' as never, 'desc').limit(20).execute()) as Row[];
    return {
      risks: rows.filter((x) => x['polarity'] === 'risk'), opportunities: rows.filter((x) => x['polarity'] === 'opportunity'),
      taxonomy: taxonomy ?? null, appetites: [...current.values()], aggregations,
      counts: { risks: rows.filter((x) => x['polarity'] === 'risk').length, opportunities: rows.filter((x) => x['polarity'] === 'opportunity').length,
                with_gaps: rows.filter((x) => (x['gaps'] as string[]).length > 0).length, outside_appetite: rows.filter((x) => x['breach'] === true).length },
      rule: 'an exposure with a gap is shown incomplete and is refused by an aggregation until its owner resolves it (PR-27-005, UX-35-005)',
    };
  }

  /** One exposure, whole. */
  async get(cap: ExposureReads, exposureId: string, correlationId: string): Promise<Row> {
    const x = (await cap.readExposures().selectAll().where('exposure_id' as never, '=', exposureId as never).executeTakeFirst()) as Row | undefined;
    if (x === undefined) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no such exposure in this domain'), 404);
    const strategy = (await cap.readStrategy().selectAll().where('strategy_object_id' as never, '=', exposureId as never).executeTakeFirst()) as Row | undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const q = async (rel: any, order: string): Promise<Row[]> => (await rel.selectAll().where('exposure_id', '=', exposureId).orderBy(order).execute()) as Row[];
    const versions = (await cap.readVersions().selectAll().where('exposure_id' as never, '=', exposureId as never).orderBy('version' as never).execute()) as Row[];
    const events = (await cap.readEvents().selectAll().where('exposure_id' as never, '=', exposureId as never).orderBy('occurred_at' as never).orderBy('event_id' as never).execute()) as Row[];
    const drivers = await q(cap.readDrivers(), 'declared_at');
    const controls = await q(cap.readControls(), 'declared_at');
    const residuals = await q(cap.readResiduals(), 'computed_at');
    const hypotheses = (await cap.readHypotheses().selectAll().where('exposure_id' as never, '=', exposureId as never).orderBy('version' as never).execute()) as Row[];
    const correlations = [
      ...((await cap.readCorrelations().selectAll().where('exposure_a' as never, '=', exposureId as never).execute()) as Row[]),
      ...((await cap.readCorrelations().selectAll().where('exposure_b' as never, '=', exposureId as never).execute()) as Row[]),
    ].sort((a, b) => String(a['recorded_at']).localeCompare(String(b['recorded_at'])));
    const responses = await q(cap.readResponses(), 'opened_at');
    const pkgIds = responses.map((r) => String(r['package_id']));
    const packages = pkgIds.length === 0 ? [] : (await cap.readPackages().select(['package_id', 'state', 'title', 'owner_principal_id', 'committed_version', 'decided_at'] as never).where('package_id' as never, 'in', pkgIds as never).execute()) as Row[];
    const outcomes = pkgIds.length === 0 ? [] : (await cap.readOutcomes().select(['outcome_id', 'package_id', 'version', 'criterion_key', 'met', 'observed_value', 'target', 'comparator', 'unit', 'recorded_at'] as never)
      .where('package_id' as never, 'in', pkgIds as never).orderBy('recorded_at' as never).execute()) as Row[];
    const candidate = x['routed_candidate_id'] === null ? null : ((await cap.readCandidates().select(['candidate_id', 'state', 'warning_id', 'origin_key', 'submitted_at', 'outcome'] as never)
      .where('candidate_id' as never, '=', String(x['routed_candidate_id']) as never).executeTakeFirst()) as Row | undefined) ?? null;
    const warning = candidate === null || candidate['warning_id'] === null ? null : ((await cap.readWarnings().select(['warning_id', 'state', 'routed_to', 'origin_kind', 'raised_at', 'title'] as never)
      .where('warning_id' as never, '=', String(candidate['warning_id']) as never).executeTakeFirst()) as Row | undefined) ?? null;
    const objectives = await cap.objectives(exposureId);
    const latest = residuals.length === 0 ? null : residuals[residuals.length - 1]!;
    const row = { ...x, title: strategy?.['title'] ?? null, statement: strategy?.['statement'] ?? null, breach: latest?.['breach'] ?? null,
                  has_agent_proposal: versions.some((v) => v['assessed_kind'] === 'agent' && v['state'] === 'proposed') };
    return {
      exposure: { ...row, gaps: gapsOf(row) }, strategy: strategy ?? null, objectives, versions, events, drivers, controls, residuals, hypotheses,
      correlations: { declared: correlations.filter((k) => k['estimated_kind'] === 'human'), estimated: correlations.filter((k) => k['estimated_kind'] === 'agent') },
      responses: responses.map((r) => ({ ...r, package: packages.find((pk) => pk['package_id'] === r['package_id']) ?? null, outcomes: outcomes.filter((o) => o['package_id'] === r['package_id']) })),
      candidate, warning,
    };
  }

  /** OBJ-22's consequence preview. */
  async preview(cap: ExposureReads, exposureId: string, version: number, correlationId: string): Promise<Row> {
    const p = await cap.preview(exposureId, version);
    if (p === null) throw new HttpException(errorBody('EYE_STA_001', correlationId, 'no such exposure version in this domain'), 404);
    return p;
  }

  /** The priority: lexicographic within polarity and unit; an exposure with no accepted assessment shows its dimensions as no input. */
  async priority(cap: ExposureReads): Promise<Row> {
    const exposures = (await cap.readExposures().select(['exposure_id', 'polarity', 'state', 'owner_principal_id'] as never).where('state' as never, '<>', 'closed' as never).execute()) as Row[];
    const strategy = exposures.length === 0 ? [] : (await cap.readStrategy().select(['strategy_object_id', 'title'] as never).where('strategy_object_id' as never, 'in', exposures.map((x) => String(x['exposure_id'])) as never).execute()) as Row[];
    const pri = new Map((await cap.priorities()).map((r) => [r.exposure_id, r]));
    const cmp = (a: unknown[], b: unknown[]): number => {
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const x = a[i] ?? null; const y = b[i] ?? null;
        if (x === y) continue;
        if (x === null) return 1;          // no input ranks after an input
        if (y === null) return -1;
        const d = Number(x) - Number(y);
        if (d !== 0) return d;
      }
      return 0;
    };
    const groups = new Map<string, Row[]>();
    for (const x of exposures) {
      const p = pri.get(String(x['exposure_id']));
      const unit = String((p?.dims as Row | undefined)?.['unit'] ?? 'no unit');
      const key = `${String(x['polarity'])} · ${unit}`;
      const title = strategy.find((s) => s['strategy_object_id'] === x['exposure_id'])?.['title'] ?? null;
      groups.set(key, [...(groups.get(key) ?? []), { ...x, title, dims: p?.dims ?? {}, priority: p?.priority ?? null }]);
    }
    return {
      rule: 'lexicographic over transparent dimensions, ranked within polarity and unit; a dimension with no input ranks after one with; no weighted score (ES-47-002)',
      groups: [...groups.entries()].map(([group, items]) => ({
        group, items: items.sort((a, b) => cmp(((a['priority'] as Row | null)?.['key'] ?? []) as unknown[], ((b['priority'] as Row | null)?.['key'] ?? []) as unknown[]) || String(a['exposure_id']).localeCompare(String(b['exposure_id'])))
          .map((it, i) => ({ position: i + 1, ...it })),
      })),
    };
  }

  async taxonomy(cap: ExposureReads): Promise<Row> {
    const versions = (await cap.readTaxonomy().selectAll().orderBy('version' as never, 'desc').execute()) as Row[];
    const appetites = (await cap.readAppetites().selectAll().orderBy('category_key' as never).orderBy('version' as never, 'desc').execute()) as Row[];
    return { current: versions[0] ?? null, versions, appetites };
  }

  async health(cap: ExposureReads, tenantId: string, domainId: string, at: string): Promise<Row> {
    return { at, inputs: await cap.healthInputs(tenantId, domainId, at), contract: 'executive.health_measure_inputs (0089 §0): the risk and opportunity branch' };
  }
}
