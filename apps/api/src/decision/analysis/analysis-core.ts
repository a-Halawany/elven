/**
 * DECISION OPTION ANALYSIS — the pure core of CP-6 B35 part `analysis` (migration 0101 §A; F-P6-01, F-P5-07's adversarial-response
 * sensitivity, F-P4-08's reversibility and option value across futures).
 *
 * Two kinds of thing live here, and nothing else: the INTAKE of each route (shape only — the ports decide every rule and answer in the
 * family `analysis rejected (<class>): …`) and a MIRROR of the server's arithmetic (decision.dsa_scores, decision.dsa_sensitivity,
 * decision.dsa_tradeoffs) — the unit tests' and the harness's control. The PORTS compute the record; nothing here is written anywhere.
 */
type Row = Record<string, unknown>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KEY = /^[a-z][a-z0-9_-]{0,40}$/;

export const isUuid = (v: unknown): v is string => typeof v === 'string' && UUID.test(v);
const obj = (v: unknown): Row | null => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Row) : null);
const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/* ───────────── the intake (shape only) ───────────── */
export interface CriterionIntake { key: string; title: string; objectiveId: string; direction: 'max' | 'min'; weight: number; scale: 'ratio' | 'interval' | 'ordinal'; unit: string }
export interface CriteriaIntake { criteria: CriterionIntake[]; valueOwner: string; rationale: string; expectedVersion: number | null }
export interface AssessIntake { option: string; criterion: string; value: number | null; cited: { kind: string; id: string; measure: string } | null; basis: string | null }
export interface ObligationIntake { key: string; kind: string; stakeholder: string | null; stakeholderRef: string | null; statement: string; test: Row; owner: string }
export interface JudgmentIntake { obligation: string; option: string; result: string; basis: string }
export interface AdversarialIntake { option: string; actorElementId: string; response: string; effects: Array<{ criterion: string; op: string; value: number }>; basis: string }

type Checked<T> = { ok: T } | { problem: string };

/** The version named on the route: a whole number ≥ 1. */
export function versionOf(v: string): number | null {
  return /^[1-9][0-9]{0,6}$/.test(v) ? Number(v) : null;
}

export function validateCriteria(p: Row): Checked<CriteriaIntake> {
  const list = p['criteria'];
  if (!Array.isArray(list) || list.length === 0 || list.length > 12) return { problem: 'analysis rejected (criteria): the criteria are a list of 1 to 12 {key, title, objectiveId, direction, weight, scale, unit}' };
  const criteria: CriterionIntake[] = [];
  for (const raw of list) {
    const c = obj(raw);
    if (c === null) return { problem: 'analysis rejected (criteria): each criterion is an object {key, title, objectiveId, direction, weight, scale, unit}' };
    const key = str(c['key']); const title = str(c['title']); const objectiveId = str(c['objectiveId']); const direction = str(c['direction']);
    const weight = num(c['weight']); const scale = str(c['scale']); const unit = str(c['unit']);
    if (key === null || !KEY.test(key) || title === null) return { problem: 'analysis rejected (criteria): each criterion has a key (lower-case, 1-41) and a title' };
    if (objectiveId === null || !UUID.test(objectiveId)) return { problem: `analysis rejected (criteria): criterion ${key} names the objective it measures (objectiveId)` };
    if (direction !== 'max' && direction !== 'min') return { problem: `analysis rejected (criteria): criterion ${key} states its direction (max | min)` };
    if (weight === null) return { problem: `analysis rejected (weight): criterion ${key} carries an exposed numeric weight` };
    if (scale !== 'ratio' && scale !== 'interval' && scale !== 'ordinal') return { problem: `analysis rejected (criteria): criterion ${key} states its scale (ratio | interval | ordinal)` };
    if (unit === null) return { problem: `analysis rejected (criteria): criterion ${key} names its unit` };
    criteria.push({ key, title, objectiveId, direction, weight, scale, unit });
  }
  const valueOwner = str(p['valueOwner']);
  if (valueOwner === null || !UUID.test(valueOwner)) return { problem: 'analysis rejected (value_owner): name the owner of the value judgment (valueOwner — a person)' };
  const rationale = str(p['rationale']);
  if (rationale === null) return { problem: 'analysis rejected (rationale): a weighting states why (rationale)' };
  const ev = p['expectedVersion'];
  if (ev !== undefined && ev !== null && (typeof ev !== 'number' || !Number.isInteger(ev) || ev < 1)) return { problem: 'analysis rejected (stale): expectedVersion is the criteria version read (a whole number), or null for none yet' };
  return { ok: { criteria, valueOwner, rationale, expectedVersion: typeof ev === 'number' ? ev : null } };
}

export function validateAssess(p: Row): Checked<AssessIntake> {
  const option = str(p['option']); const criterion = str(p['criterion']);
  if (option === null || criterion === null) return { problem: 'analysis rejected (assessment): name the option and the criterion it is assessed on' };
  const value = p['value'] === undefined || p['value'] === null ? null : num(p['value']);
  if (p['value'] !== undefined && p['value'] !== null && value === null) return { problem: 'analysis rejected (value): the value is a number' };
  let cited: AssessIntake['cited'] = null;
  if (p['cited'] !== undefined && p['cited'] !== null) {
    const c = obj(p['cited']);
    if (c === null || str(c['kind']) === null || !isUuid(c['id']) || str(c['measure']) === null) return { problem: 'analysis rejected (cited): a computed value cites {kind: run | forecast | voi | portfolio_review, id, measure}' };
    cited = { kind: c['kind'] as string, id: c['id'] as string, measure: c['measure'] as string };
  }
  const basis = p['basis'] === undefined || p['basis'] === null ? null : str(p['basis']);
  return { ok: { option, criterion, value, cited, basis } };
}

export function validateObligation(p: Row): Checked<ObligationIntake> {
  const key = str(p['key']); const kind = str(p['kind']); const statement = str(p['statement']); const owner = str(p['owner']); const test = obj(p['test']);
  if (key === null || kind === null || statement === null) return { problem: 'analysis rejected (obligation): an obligation has a key, a kind (constraint | obligation) and a statement' };
  if (owner === null || !UUID.test(owner)) return { problem: 'analysis rejected (owner): name the obligation\'s owner (a person)' };
  if (test === null) return { problem: 'analysis rejected (test): the test is {kind: threshold, criterion, op, value} or {kind: judgment}' };
  const ref = p['stakeholderRef'];
  if (ref !== undefined && ref !== null && !isUuid(ref)) return { problem: 'analysis rejected (stakeholder): stakeholderRef, when given, is a stakeholder (STK) id' };
  return { ok: { key, kind, stakeholder: str(p['stakeholder']), stakeholderRef: isUuid(ref) ? ref : null, statement, test, owner } };
}

export function validateJudgments(p: Row): Checked<JudgmentIntake[]> {
  const list = p['judgments'];
  if (list === undefined || list === null) return { ok: [] };
  if (!Array.isArray(list)) return { problem: 'analysis rejected (judgment): judgments are a list [{obligation, option, result, basis}]' };
  const out: JudgmentIntake[] = [];
  for (const raw of list) {
    const j = obj(raw);
    if (j === null || str(j['obligation']) === null || str(j['option']) === null || str(j['result']) === null || str(j['basis']) === null) {
      return { problem: 'analysis rejected (judgment): each judgment names the obligation, the option, the result (satisfied | violated | unknown) and its basis' };
    }
    out.push({ obligation: j['obligation'] as string, option: j['option'] as string, result: j['result'] as string, basis: j['basis'] as string });
  }
  return { ok: out };
}

export function validateAdversarial(p: Row): Checked<AdversarialIntake> {
  const option = str(p['option']); const response = str(p['response']); const basis = str(p['basis']);
  if (option === null) return { problem: 'analysis rejected (option): name the option the actor responds to' };
  if (!isUuid(p['actorElementId'])) return { problem: 'analysis rejected (actor): name the actor (actorElementId — an actor of the scenario anatomy)' };
  if (response === null || basis === null) return { problem: 'analysis rejected (response): state the actor\'s response and the basis of the response model' };
  const effects = p['effects'];
  if (!Array.isArray(effects) || effects.length === 0) return { problem: 'analysis rejected (effects): the response model is a list of {criterion, op: add | multiply | set, value}' };
  const out: AdversarialIntake['effects'] = [];
  for (const raw of effects) {
    const e = obj(raw);
    const v = e === null ? null : num(e['value']);
    if (e === null || str(e['criterion']) === null || str(e['op']) === null || v === null) return { problem: 'analysis rejected (effects): each effect is {criterion, op: add | multiply | set, value}' };
    out.push({ criterion: e['criterion'] as string, op: e['op'] as string, value: v });
  }
  return { ok: { option, actorElementId: p['actorElementId'] as string, response, effects: out, basis } };
}

/* ───────────── the mirror of the server's arithmetic ───────────── */
export interface MirrorCriterion { key: string; weight: number; direction: 'max' | 'min' }
export interface MirrorScores {
  normalised: Record<string, Record<string, number>>;
  scores: Record<string, number | null>;
  ranking: string[];
}
const r6 = (x: number): number => Math.round(x * 1e6) / 1e6;

/** decision.dsa_scores: min-max per criterion across the options (direction applied; all equal → 1); Σ w·n / Σ w for a complete option. */
export function scoreOptions(criteria: MirrorCriterion[], values: Record<string, Record<string, number | undefined>>): MirrorScores {
  const options = Object.keys(values).sort();
  const normalised: Record<string, Record<string, number>> = {};
  for (const o of options) normalised[o] = {};
  for (const c of criteria) {
    const present = options.map((o) => values[o]?.[c.key]).filter((v): v is number => typeof v === 'number');
    if (present.length === 0) continue;
    const lo = Math.min(...present); const hi = Math.max(...present);
    for (const o of options) {
      const v = values[o]?.[c.key];
      if (typeof v !== 'number') continue;
      normalised[o]![c.key] = hi === lo ? 1 : c.direction === 'max' ? (v - lo) / (hi - lo) : (hi - v) / (hi - lo);
    }
  }
  const total = criteria.reduce((s, c) => s + c.weight, 0);
  const scores: Record<string, number | null> = {};
  for (const o of options) {
    const complete = criteria.length > 0 && criteria.every((c) => typeof normalised[o]![c.key] === 'number');
    scores[o] = complete ? criteria.reduce((s, c) => s + c.weight * normalised[o]![c.key]!, 0) / total : null;
  }
  const ranking = options.filter((o) => scores[o] !== null).sort((a, b) => (r6(scores[b]!) - r6(scores[a]!)) || (a < b ? -1 : 1));
  return { normalised, scores, ranking };
}

export interface Flip { weight: number; to: string; changePct: number }
export interface CriterionSensitivity { key: string; weight: number; flipUp: Flip | null; flipDown: Flip | null; orderUp: { weight: number; between: [string, string] } | null; orderDown: { weight: number; between: [string, string] } | null }

/** decision.dsa_sensitivity: per criterion, the weight at which another option's line crosses the leader's (and any pair's first swap). */
export function weightSensitivity(criteria: MirrorCriterion[], m: MirrorScores): { leader: string | null; criteria: CriterionSensitivity[]; mostSensitive: string | null } {
  const leader = m.ranking[0] ?? null;
  if (leader === null || m.ranking.length < 2) return { leader, criteria: [], mostSensitive: null };
  const eps = 1e-9;
  const out: CriterionSensitivity[] = [];
  let best: string | null = null; let bestPct = Infinity;
  for (const c of criteria) {
    const w = c.weight;
    const line = (o: string) => ({ s: r6(m.normalised[o]![c.key]!), r: criteria.filter((x) => x.key !== c.key).reduce((acc, x) => acc + x.weight * r6(m.normalised[o]![x.key]!), 0) });
    const A = line(leader);
    let up: Flip | null = null; let down: Flip | null = null;
    for (const o of m.ranking) {
      if (o === leader) continue;
      const B = line(o);
      if (B.s === A.s) continue;
      const wx = (A.r - B.r) / (B.s - A.s);
      if (B.s > A.s && wx > w + eps && (up === null || wx < up.weight || (wx === up.weight && o < up.to))) up = { weight: wx, to: o, changePct: ((wx - w) / w) * 100 };
      if (B.s < A.s && wx < w - eps && wx > 0 && (down === null || wx > down.weight || (wx === down.weight && o < down.to))) down = { weight: wx, to: o, changePct: ((wx - w) / w) * 100 };
    }
    let orderUp: CriterionSensitivity['orderUp'] = null; let orderDown: CriterionSensitivity['orderDown'] = null;
    const keys = [...m.ranking].sort();
    for (let i = 0; i < keys.length; i++) {
      for (let j = i + 1; j < keys.length; j++) {
        const X = line(keys[i]!); const Y = line(keys[j]!);
        if (X.s === Y.s) continue;
        const wx = (Y.r - X.r) / (X.s - Y.s);
        if (wx > w + eps && (orderUp === null || wx < orderUp.weight)) orderUp = { weight: wx, between: [keys[i]!, keys[j]!] };
        if (wx < w - eps && wx > 0 && (orderDown === null || wx > orderDown.weight)) orderDown = { weight: wx, between: [keys[i]!, keys[j]!] };
      }
    }
    for (const f of [up, down]) if (f !== null && Math.abs(f.changePct) < bestPct) { bestPct = Math.abs(f.changePct); best = c.key; }
    out.push({ key: c.key, weight: w, flipUp: up, flipDown: down, orderUp, orderDown });
  }
  return { leader, criteria: out, mostSensitive: best };
}

/** decision.dsa_tradeoffs' dominance: X dominates Y when at least as good on every criterion (normalised) and better on one. */
export function dominance(criteria: MirrorCriterion[], m: MirrorScores): Array<{ dominant: string; dominated: string }> {
  const out: Array<{ dominant: string; dominated: string }> = [];
  const keys = [...m.ranking].sort();
  for (const a of keys) for (const b of keys) {
    if (a === b) continue;
    const na = m.normalised[a]!; const nb = m.normalised[b]!;
    if (criteria.every((c) => r6(na[c.key]!) >= r6(nb[c.key]!)) && criteria.some((c) => r6(na[c.key]!) > r6(nb[c.key]!))) out.push({ dominant: a, dominated: b });
  }
  return out;
}

/** The adversarial response model applied to an option's values (add | multiply | set), as the port applies it. */
export function applyResponse(values: Record<string, number>, effects: Array<{ criterion: string; op: string; value: number }>): Record<string, number> {
  const out = { ...values };
  for (const e of effects) {
    const cur = out[e.criterion] ?? 0;
    out[e.criterion] = r6(e.op === 'add' ? cur + e.value : e.op === 'multiply' ? cur * e.value : e.value);
  }
  return out;
}
