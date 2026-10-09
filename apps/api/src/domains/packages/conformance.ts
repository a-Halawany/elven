/**
 * B33 §PK (0111) — THE CONFORMANCE SUITE (PK3; PR-31-006, AT-31, UX-36-006 — the software part), THE HEALTH EVALUATION (PK4; PR-31-005,
 * UX-36-005, WS-10) and THE ACCEPTANCE FOCUS of each package kind (PK6; CAP-FW-08..11), as PURE functions over the facts the database
 * answers (domain.package_facts / domain.package_acceptance_facts). Deterministic: the same facts give the same checks. The port records a
 * run and recomputes its verdict (every blocking check passed); certification rests on the last certification run that passed.
 *
 * What a run proves is the SOFTWARE's measurement on the data present. A public feed demonstrates the software and never closes a clause
 * that needs a licensed source; a synthetic record demonstrates the software only; the signed acceptance record is R2's.
 */
import { CLASSIFICATION_RANK, CORE_TYPES, LONG_HORIZONS, calculationDigest, type Manifest, type PackageFunction } from './manifest.js';
import { changeKind, parseSemver, satisfies } from './semver.js';

type Row = Record<string, unknown>;
export interface Check { check: string; passed: boolean; severity: 'blocking' | 'advisory'; findings: string[]; measured?: Row }
export const SUITE_VERSION = 'conformance/1';
export const HEALTH_VERSION = 'health/1';
export const ACCEPTANCE_VERSION = 'acceptance/1';

export interface SourceFact {
  source_key: string; known: boolean; source_id: string | null; contract_version: number | null; lifecycle_state: string | null; rights_state: string | null;
  purposes: string[] | null; data_origin: string | null; publisher: string | null; freshness_threshold_seconds: number | null; classification_ceiling: string | null;
  acquisition_mode: string | null; authority_class: string | null; last_evidence_at: string | null; last_observation_time: string | null; last_observation_recorded_at: string | null;
}
export interface PackageFacts {
  now: string;
  package: { package_id: string; package_key: string; domain_kind: string; title: string; owner: string; state: string };
  version: { version: number; semver: string; state: string; manifest: Manifest; manifest_digest: string; proposed_by: string; disabled_functions: Row; conflict: Row | null };
  active: { version: number; semver: string; manifest: Manifest } | null;
  core: { entity_types: string[]; ontology: { version: number; predicates: string[] } | null };
  namespace_ontology: { version_id: string; version: number; entity_types: string[]; predicates: string[]; activated_at: string } | null;
  sources: SourceFact[];
  methods: Array<{ ref: string; known: boolean; state: string | null; state_reason: string | null; horizons: string[] | null; builtin: boolean | null }>;
  behaviour: Array<{ ref: string; known: boolean; pinned: boolean }>;
  taxonomy: { version: number; keys: string[] } | null;
  packages: Array<{ package_key: string; domain_kind: string; version: number; semver: string; requires: Array<{ package_key: string; range: string }>; conflicts: Array<{ package_key: string; range: string }> }>;
  sections: Record<string, { state: string; digest: string; approver?: string; expires_at?: string }>;
}
export interface AcceptanceFacts {
  indicators: Array<{ key: string; series_key: string; registered: boolean; source_key: string | null; last_observation_at: string | null; breached: boolean | null }>;
  series: string[];
  validations: Array<{ ref: string; series_key: string; horizon: string; validated: boolean; records: number }>;
  assessments: Array<{ assessment_id: string; version: number; state: string; template: string; material: boolean; source_diversity: Row; subjects: string[] }>;
  events: Array<{ event_id: string; kind: string; subjects: string[] }>;
  alerts: Array<{ alert_id: string; state: string; adjudication: string | null }>;
  links: Array<{ link_kind: string; target_id: string }>;
  certification: { run_id: string; passed: boolean; ran_at: string } | null;
}

const arr = <T>(v: T[] | null | undefined): T[] => (Array.isArray(v) ? v : []);
const ms = (s: string | null | undefined): number | null => { if (s === null || s === undefined) return null; const t = Date.parse(s); return Number.isNaN(t) ? null : t; };
const DAY = 86_400_000;
const check = (name: string, severity: Check['severity'], findings: string[], measured?: Row, passedOverride?: boolean): Check =>
  ({ check: name, passed: passedOverride ?? findings.length === 0, severity, findings, ...(measured === undefined ? {} : { measured }) });

/* ───────────────────────────── the manifest's own content, compared with what the core holds ───────────────────────────── */

/** Every mapping maps onto a core type; a package type never takes a core type's name for another meaning; no core predicate is redefined. */
export function canonicalMapping(f: PackageFacts): Check {
  const m = f.version.manifest; const out: string[] = [];
  const core = new Set<string>(f.core.entity_types.length > 0 ? f.core.entity_types : CORE_TYPES);
  const pkgTypes = new Set<string>();
  for (const map of arr(m.ontology_extension?.mappings)) {
    pkgTypes.add(map.type);
    if (!core.has(map.maps_to)) out.push(`type ${map.type} maps onto ${map.maps_to}, which is not a core entity type (${[...core].join(', ')})`);
    if (core.has(map.type) && map.type !== map.maps_to) out.push(`type ${map.type} takes the name of a core type for another meaning (maps onto ${map.maps_to})`);
  }
  const corePreds = new Set(arr(f.core.ontology?.predicates));
  for (const p of arr(m.ontology_extension?.predicates)) {
    if (corePreds.has(p.predicate)) out.push(`predicate ${p.predicate} redefines the core's predicate of that name (the core ontology v${f.core.ontology?.version})`);
    for (const t of [...arr(p.subject_types), ...arr(p.object_types)]) {
      if (!pkgTypes.has(t) && !core.has(t)) out.push(`predicate ${p.predicate} names ${t}, neither a mapped package type nor a core type`);
    }
  }
  return check('canonical_mapping', 'blocking', out, { mappings: arr(m.ontology_extension?.mappings).length, predicates: arr(m.ontology_extension?.predicates).length });
}

/** The graph's own gate (the second key): the namespace's ACTIVE ontology version is the manifest's extension (mapped core types, predicates). */
export function namespaceOntology(f: PackageFacts): Check {
  const m = f.version.manifest; const ns = f.namespace_ontology;
  if (ns === null) return check('namespace_ontology', 'blocking', [`namespace ${m.ontology_extension?.namespace} has no active ontology version — the ontology steward decides its proposal first`]);
  const types = [...new Set(arr(m.ontology_extension?.mappings).map((x) => x.maps_to))].sort();
  const preds = [...new Set(arr(m.ontology_extension?.predicates).map((x) => x.predicate))].sort();
  const out: string[] = [];
  const same = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  if (!same(types, [...new Set(ns.entity_types)].sort())) out.push(`the active ontology v${ns.version} admits types ${[...ns.entity_types].sort().join(', ')}; the manifest maps onto ${types.join(', ')}`);
  if (!same(preds, [...new Set(ns.predicates)].sort())) out.push(`the active ontology v${ns.version} holds predicates ${[...ns.predicates].sort().join(', ') || 'none'}; the manifest declares ${preds.join(', ') || 'none'}`);
  return check('namespace_ontology', 'blocking', out, { namespace_version: ns.version });
}

/** What a later version REMOVES from the active one (a breaking change): predicates, mapped types, templates, event kinds, indicators, required sources. */
export function removedSince(active: Manifest, next: Manifest): string[] {
  const out: string[] = [];
  const gone = (what: string, a: string[], b: string[]) => { const s = new Set(b); for (const x of a) if (!s.has(x)) out.push(`${what} ${x}`); };
  gone('predicate', arr(active.ontology_extension?.predicates).map((p) => p.predicate), arr(next.ontology_extension?.predicates).map((p) => p.predicate));
  gone('type', arr(active.ontology_extension?.mappings).map((p) => p.type), arr(next.ontology_extension?.mappings).map((p) => p.type));
  gone('assessment template', arr(active.assessment_templates).map((t) => t.key), arr(next.assessment_templates).map((t) => t.key));
  gone('event kind', arr(active.ontology_extension?.event_kinds), arr(next.ontology_extension?.event_kinds));
  gone('indicator', arr(active.indicators).map((i) => i.key), arr(next.indicators).map((i) => i.key));
  return out;
}

/** Contract compatibility: the semver against the active version (a breaking change is a major one and carries a migration plan), the core
 *  ontology range, and the declared requires/conflicts against every other ACTIVE package of the domain (both directions). */
export function contractCompatibility(f: PackageFacts): Check {
  const m = f.version.manifest; const out: string[] = []; const measured: Row = {};
  const sv = parseSemver(f.version.semver);
  if (sv === null) out.push(`semver ${f.version.semver} is not x.y.z`);
  if (f.active !== null && sv !== null) {
    const prior = parseSemver(f.active.semver);
    const kind = prior === null ? 'major' : changeKind(prior, sv);
    measured['from'] = f.active.semver; measured['change'] = kind;
    if (kind === 'downgrade' || kind === 'same') out.push(`${f.version.semver} does not move forward from the active ${f.active.semver}`);
    const removed = removedSince(f.active.manifest, m);
    measured['removed'] = removed;
    if (removed.length > 0 && kind !== 'major') out.push(`a breaking change (removes ${removed.join(', ')}) is a major version, not a ${kind} one`);
    if ((removed.length > 0 || kind === 'major') && String(m.release?.migration ?? '').trim().length < 8) {
      out.push(`a breaking change from ${f.active.semver} carries no migration plan (release.migration)`);
    }
  }
  const coreRange = m.release?.core?.ontology;
  if (coreRange !== undefined && coreRange !== null && coreRange !== '') {
    const coreVersion = f.core.ontology === null ? null : `${f.core.ontology.version}.0.0`;
    measured['core_ontology'] = coreVersion;
    if (coreVersion === null) out.push(`release.core.ontology requires ${coreRange}, but the domain has no active core ontology`);
    else {
      const ok = satisfies(coreVersion, coreRange);
      if (ok === null) out.push(`release.core.ontology ${coreRange} is not a well-formed range`);
      else if (!ok) out.push(`the domain's core ontology v${f.core.ontology?.version} does not satisfy release.core.ontology ${coreRange}`);
    }
  }
  const others = new Map(f.packages.map((p) => [p.package_key, p]));
  for (const r of arr(m.release?.requires)) {
    const o = others.get(r.package_key);
    if (o === undefined) { out.push(`requires ${r.package_key} ${r.range}, which is not active in this domain`); continue; }
    const ok = satisfies(o.semver, r.range);
    if (ok === null) out.push(`requires ${r.package_key} with a range that is not well-formed (${r.range})`);
    else if (!ok) out.push(`requires ${r.package_key} ${r.range}; the active version is ${o.semver}`);
  }
  for (const c of arr(m.release?.conflicts)) {
    const o = others.get(c.package_key);
    if (o !== undefined && satisfies(o.semver, c.range) === true) out.push(`conflicts with ${c.package_key} ${c.range}, and ${c.package_key} ${o.semver} is active`);
  }
  for (const o of f.packages) {
    for (const c of arr(o.conflicts)) {
      if (c.package_key === f.package.package_key && satisfies(f.version.semver, c.range) === true) out.push(`the active ${o.package_key} ${o.semver} declares a conflict with ${f.package.package_key} ${c.range}`);
    }
  }
  return check('contract_compatibility', 'blocking', out, measured);
}

/** Source approval: each named source has an ACTIVE contract with CONFIRMED rights. */
export function sourceApproval(f: PackageFacts): Check {
  const out: string[] = [];
  for (const s of f.sources) {
    if (!s.known) { out.push(`source ${s.source_key} has no contract in this domain`); continue; }
    if (s.lifecycle_state !== 'active') out.push(`source ${s.source_key} contract v${s.contract_version} is ${s.lifecycle_state}, not active`);
    if (s.rights_state !== 'confirmed') out.push(`source ${s.source_key} rights are ${s.rights_state}, not confirmed`);
  }
  return check('source_approval', 'blocking', out, { sources: f.sources.length });
}

/** Model approval: every forecast method is APPROVED in the domain's effective registry; every behaviour model is known and its implementation pinned. */
export function modelApproval(f: PackageFacts): Check {
  const out: string[] = [];
  for (const m of f.methods) {
    if (!m.known) out.push(`forecast method ${m.ref} is not in this domain's registry`);
    else if (m.state !== 'approved') out.push(`forecast method ${m.ref} is ${m.state}${m.state_reason ? ` (${m.state_reason})` : ''}`);
  }
  for (const b of f.behaviour) {
    if (!b.known) out.push(`behaviour model ${b.ref} is not registered`);
    else if (!b.pinned) out.push(`behaviour model ${b.ref} has no pinned implementation`);
  }
  return check('model_approval', 'blocking', out, { forecast_methods: f.methods.length, behaviour_models: f.behaviour.length });
}

/** Risk-meaning compatibility: each mapped category exists in the taxonomy in force; no category given two meanings. */
export function riskMeaning(f: PackageFacts): Check {
  const out: string[] = []; const rm = arr(f.version.manifest.risk_meaning);
  if (rm.length > 0 && f.taxonomy === null) out.push('the package maps risk meanings, but the domain has no risk taxonomy in force');
  const keys = new Set(arr(f.taxonomy?.keys)); const seen = new Set<string>();
  for (const r of rm) {
    if (f.taxonomy !== null && !keys.has(r.category_key)) out.push(`risk meaning ${r.category_key} is not a category of the taxonomy v${f.taxonomy.version}`);
    if (seen.has(r.category_key)) out.push(`category ${r.category_key} is given two meanings`);
    seen.add(r.category_key);
  }
  return check('risk_meaning', 'blocking', out, { meanings: rm.length, taxonomy_version: f.taxonomy?.version ?? null });
}

/** Purpose: each source is used only for purposes its contract permits; no source is classified above the package's ceiling. */
export function purpose(f: PackageFacts): Check {
  const out: string[] = []; const m = f.version.manifest;
  if (arr(m.controls?.purposes).length === 0) out.push('the use boundary names no purpose');
  const ceiling = CLASSIFICATION_RANK[m.controls?.classification_ceiling ?? 'restricted'] ?? 3;
  for (const e of arr(m.source_set)) {
    const s = f.sources.find((x) => x.source_key === e.source_key);
    if (s === undefined || !s.known) continue;
    const permitted = new Set(arr(s.purposes));
    for (const p of arr(e.purposes)) if (!permitted.has(p)) out.push(`source ${e.source_key} is used for "${p}", which its contract does not permit (${[...permitted].join(', ')})`);
    if ((CLASSIFICATION_RANK[s.classification_ceiling ?? 'restricted'] ?? 3) > ceiling) out.push(`source ${e.source_key} is classified ${s.classification_ceiling}, above the package's ceiling ${m.controls.classification_ceiling}`);
  }
  return check('purpose', 'blocking', out);
}

/** Source coverage: each source has evidence within its freshness; a REQUIRED source out of coverage fails the run, an optional one is a finding. */
export function sourceCoverage(f: PackageFacts): Check[] {
  const now = ms(f.now) ?? Date.now(); const req: string[] = []; const opt: string[] = []; const table: Row[] = [];
  for (const e of arr(f.version.manifest.source_set)) {
    const s = f.sources.find((x) => x.source_key === e.source_key);
    const last = ms(s?.last_evidence_at ?? null); const fresh = s?.freshness_threshold_seconds ?? null;
    const age = last === null ? null : Math.round((now - last) / 1000);
    const ok = last !== null && fresh !== null && age !== null && age <= fresh;
    table.push({ source_key: e.source_key, required: e.required !== false, last_evidence_at: s?.last_evidence_at ?? null, age_seconds: age, freshness_seconds: fresh, covered: ok, data_origin: s?.data_origin ?? null });
    if (!ok) (e.required === false ? opt : req).push(last === null ? `source ${e.source_key} has no evidence in this domain` : `source ${e.source_key} last evidence ${s?.last_evidence_at} is older than its freshness (${fresh}s)`);
  }
  return [check('source_coverage', 'blocking', req, { sources: table }), check('source_coverage_optional', 'advisory', opt)];
}

/** The inputs statement (advisory): what the package DECLARES real, synthetic or licensed-for-acceptance, beside what each contract SAYS. */
export function inputsStatement(f: PackageFacts): Check {
  const st = f.version.manifest.controls?.inputs; const out: string[] = [];
  if (st === undefined) return check('inputs_statement', 'advisory', ['the use boundary does not state which inputs are real public feeds, synthetic, or need a licensed provider']);
  for (const s of f.sources) {
    if (!s.known) continue;
    if (st.real_public.includes(s.source_key) && s.data_origin !== 'real') out.push(`${s.source_key} is declared a real public feed; in this deployment its contract is ${s.data_origin}`);
    if (st.synthetic.includes(s.source_key) && s.data_origin !== 'synthetic') out.push(`${s.source_key} is declared synthetic; its contract says ${s.data_origin}`);
  }
  return check('inputs_statement', 'advisory', out, { declared: st, contracts: f.sources.filter((s) => s.known).map((s) => ({ source_key: s.source_key, data_origin: s.data_origin, publisher: s.publisher })) });
}

/** THE SUITE (PK3): run on a version (certification on a proposed one; diagnostic anywhere). */
export function runConformance(f: PackageFacts): Check[] {
  return [canonicalMapping(f), namespaceOntology(f), contractCompatibility(f), sourceApproval(f), modelApproval(f), riskMeaning(f), purpose(f), ...sourceCoverage(f), inputsStatement(f)];
}

/* ───────────────────────────── health (PK4) ───────────────────────────── */

export interface HealthResult { checks: Check[]; disable: Record<string, { reason: string; cause: Row }>; conflict: { reason: string; functions?: string[]; causes: Row[] } | null }

/** THE HEALTH EVALUATION of an ACTIVE version: an unapproved source or model DISABLES the functions that use it; the namespace superseded
 *  incompatibly, an incompatible risk meaning or a conflicting / missing package version EXPOSES a conflict. Never the whole package
 *  disabled: reads keep working (preserve accessible state). */
export function evaluateHealth(f: PackageFacts): HealthResult {
  const m = f.version.manifest;
  const disable: HealthResult['disable'] = {};
  const add = (fns: readonly string[], reason: string, cause: Row) => { for (const fn of fns) if (disable[fn] === undefined) disable[fn] = { reason, cause }; };
  const src = sourceApproval(f); const pur = purpose(f);
  for (const e of arr(m.source_set)) {
    const s = f.sources.find((x) => x.source_key === e.source_key);
    const fns = arr(e.functions).length > 0 ? arr(e.functions) : ['assess', 'event'];
    if (s === undefined || !s.known) add(fns, `source ${e.source_key} has no contract in this domain`, { kind: 'source', source_key: e.source_key });
    else if (s.lifecycle_state !== 'active') add(fns, `source ${e.source_key} is ${s.lifecycle_state} (contract v${s.contract_version})`, { kind: 'source', source_key: e.source_key, state: s.lifecycle_state });
    else if (s.rights_state !== 'confirmed') add(fns, `source ${e.source_key} rights are ${s.rights_state}`, { kind: 'source', source_key: e.source_key, rights: s.rights_state });
    else {
      const permitted = new Set(arr(s.purposes)); const over = arr(e.purposes).filter((p) => !permitted.has(p));
      if (over.length > 0) add(fns, `source ${e.source_key} is used beyond its contract's purposes (${over.join(', ')})`, { kind: 'purpose', source_key: e.source_key, exceeded: over });
    }
  }
  const mod = modelApproval(f);
  for (const e of arr(m.models)) {
    if (e.kind === 'forecast') {
      const x = f.methods.find((y) => y.ref === e.ref);
      if (x === undefined || !x.known || x.state !== 'approved') {
        add(arr(e.functions).length > 0 ? arr(e.functions) : ['forecast'], `forecast method ${e.ref} is ${x?.state ?? 'unknown'}${x?.state_reason ? ` (${x.state_reason})` : ''}`, { kind: 'model', ref: e.ref, state: x?.state ?? null });
      }
    } else {
      const b = f.behaviour.find((y) => y.ref === e.ref);
      if (b === undefined || !b.known || !b.pinned) add(arr(e.functions).length > 0 ? arr(e.functions) : ['scenario'], `behaviour model ${e.ref} is ${b?.known ? 'unpinned' : 'unknown'}`, { kind: 'model', ref: e.ref });
    }
  }
  const causes: Row[] = []; const reasons: string[] = []; let whole = false; const fns = new Set<string>();
  const ns = namespaceOntology(f);
  if (!ns.passed) { causes.push({ kind: 'ontology', findings: ns.findings }); reasons.push(`the ontology namespace no longer carries the package's extension: ${ns.findings.join('; ')}`); fns.add('assess'); fns.add('event'); }
  const risk = riskMeaning(f);
  if (!risk.passed) { causes.push({ kind: 'risk_meaning', findings: risk.findings }); reasons.push(`incompatible risk meaning: ${risk.findings.join('; ')}`); fns.add('exposure'); }
  const compat: string[] = [];
  const others = new Map(f.packages.map((p) => [p.package_key, p]));
  for (const r of arr(m.release?.requires)) {
    const o = others.get(r.package_key);
    if (o === undefined) compat.push(`the required package ${r.package_key} is no longer active`);
    else if (satisfies(o.semver, r.range) !== true) compat.push(`the required ${r.package_key} ${r.range} is now ${o.semver}`);
  }
  for (const c of arr(m.release?.conflicts)) { const o = others.get(c.package_key); if (o !== undefined && satisfies(o.semver, c.range) === true) compat.push(`${c.package_key} ${o.semver} is active and conflicts (${c.range})`); }
  for (const o of f.packages) for (const c of arr(o.conflicts)) {
    if (c.package_key === f.package.package_key && satisfies(f.version.semver, c.range) === true) compat.push(`the active ${o.package_key} ${o.semver} declares a conflict with ${f.package.package_key} ${c.range}`);
  }
  if (compat.length > 0) { whole = true; causes.push({ kind: 'package', findings: compat }); reasons.push(`conflicting package versions: ${compat.join('; ')}`); }
  const conflict = reasons.length === 0 ? null : { reason: reasons.join(' | '), ...(whole ? {} : { functions: [...fns].sort() }), causes };
  const checks: Check[] = [
    { ...src, check: 'sources' }, { ...pur, check: 'purpose' }, { ...mod, check: 'models' }, { ...ns, check: 'ontology' }, { ...risk, check: 'risk_meaning' },
    check('package_compatibility', 'blocking', compat),
    ...sourceCoverage(f).map((c) => ({ ...c, severity: 'advisory' as const })),
  ];
  return { checks, disable, conflict };
}

/* ───────────────────────────── the acceptance focus (PK6) ───────────────────────────── */

const pct = (a: number, b: number): number | null => (b === 0 ? null : Math.round((a / b) * 10_000) / 10_000);

function common(f: PackageFacts, a: AcceptanceFacts): Check[] {
  const sec = Object.entries(f.sections ?? {}).filter(([, s]) => s.state !== 'approved').map(([k, s]) => `section ${k} is ${s.state}`);
  return [
    check('conformance', 'blocking', a.certification === null ? ['no certification run is recorded'] : a.certification.passed ? [] : [`the last certification run ${a.certification.run_id} failed`], { run: a.certification }),
    check('authority', 'blocking', sec, { sections: f.sections, note: 'named domain specialists approved each section in the product; the SIGNED acceptance record (product owner, independent assurance, customer authority) is R2' }),
    inputsStatement(f),
  ];
}

/** GEOPOLITICAL (CAP-FW-08 "extend sources, ontology, indicators, assessments, and scenarios"; "domain conformance and authority acceptance"):
 *  the indicator set measured (each indicator's series registered and FRESH), the scenario link, the assessment template. */
export function geopoliticalFocus(f: PackageFacts, a: AcceptanceFacts): Check[] {
  const now = ms(f.now) ?? Date.now(); const out: string[] = []; const table: Row[] = [];
  const inds = arr(f.version.manifest.indicators);
  if (inds.length === 0) out.push('the package declares no indicator');
  for (const i of inds) {
    const x = a.indicators.find((y) => y.key === i.key);
    const src = f.sources.find((s) => s.source_key === (x?.source_key ?? ''));
    const last = x?.last_observation_at ?? src?.last_observation_time ?? null;
    const lastMs = ms(last); const days = i.freshness_days ?? 14;
    const age = lastMs === null ? null : Math.floor((now - lastMs) / DAY);
    const fresh = age !== null && age <= days;
    table.push({ key: i.key, series_key: i.series_key, registered: x?.registered ?? false, source_key: x?.source_key ?? null, data_origin: src?.data_origin ?? null, last_observation: last, age_days: age, freshness_days: days, fresh, breached: x?.breached ?? null });
    if (!(x?.registered ?? false)) out.push(`indicator ${i.key}: series ${i.series_key} is not registered`);
    else if (!fresh) out.push(`indicator ${i.key}: the last observation (${last ?? 'none'}) is older than ${days} days`);
  }
  const scen = a.links.filter((l) => l.link_kind === 'scenario').length;
  return [
    check('indicator_set', 'blocking', out, { indicators: table, fresh: table.filter((t) => t['fresh'] === true).length, total: table.length }),
    check('scenario_link', 'blocking', scen === 0 ? ['no B27 scenario is linked to the package'] : [], { scenario_links: scen }),
    check('assessment_template', 'blocking', arr(f.version.manifest.assessment_templates).length === 0 ? ['no assessment template'] : [], { templates: arr(f.version.manifest.assessment_templates).map((t) => t.key) }),
    ...common(f, a),
  ];
}

/** TECHNOLOGY (CAP-FW-09 "evidence diversity and horizon evaluation"): the diversity of the evidence behind the package's assessments
 *  (measured: publishers per assessment, the share meeting its template's threshold), and the HORIZON EVALUATION of every forecast claim
 *  through the B25 registry — a 3y/5y claim without a passing validation at that horizon is REFUSED unless it is `scenario_language`. */
export function technologyFocus(f: PackageFacts, a: AcceptanceFacts): Check[] {
  const div: string[] = []; const rows: Row[] = [];
  for (const x of a.assessments) {
    const d = x.source_diversity ?? {};
    rows.push({ assessment_id: x.assessment_id, version: x.version, state: x.state, publishers: d['publishers'] ?? null, threshold: d['threshold'] ?? null, meets: d['meets'] ?? false, correlated: d['correlated_publishers'] ?? [] });
    if (d['meets'] !== true && x.state === 'approved') div.push(`assessment ${x.assessment_id} v${x.version} is approved below its diversity threshold`);
  }
  const meeting = rows.filter((r) => r['meets'] === true).length;
  const minShare = f.version.manifest.controls?.evidence_diversity?.min_share ?? 0.5;
  if (rows.length === 0) div.push('no approved assessment of the package to measure');
  else if ((pct(meeting, rows.length) ?? 0) < minShare) div.push(`${meeting} of ${rows.length} assessments meet their diversity threshold (share ${pct(meeting, rows.length)}, required ${minShare})`);
  const hz: string[] = []; const claims: Row[] = [];
  for (const m of arr(f.version.manifest.models).filter((x) => x.kind === 'forecast')) {
    for (const h of arr(m.horizons)) {
      const v = a.validations.find((y) => y.ref === m.ref && y.series_key === (m.series_key ?? '') && y.horizon === h);
      const validated = v?.validated === true; const claim = m.claim ?? 'unvalidated'; const long = (LONG_HORIZONS as readonly string[]).includes(h);
      let verdict = 'ok';
      if (claim === 'validated' && !validated) { verdict = 'refused'; hz.push(`${m.ref} on ${m.series_key ?? '?'} at ${h} claims validation; the B25 registry holds ${v?.records ?? 0} record(s) and none passed${long ? ' — a long-horizon claim is refused, or issued in scenario_language' : ''}`); }
      else if (long && !validated && claim !== 'scenario_language') { verdict = 'refused'; hz.push(`${m.ref} at ${h} has no passing validation and is not stated in scenario_language`); }
      claims.push({ ref: m.ref, series_key: m.series_key ?? null, horizon: h, claim, validated, records: v?.records ?? 0, verdict });
    }
  }
  return [
    check('evidence_diversity', 'blocking', div, { assessments: rows, meeting, total: rows.length, share: pct(meeting, rows.length), min_share: minShare }),
    check('horizon_evaluation', 'blocking', hz, { claims }),
    ...common(f, a),
  ];
}

/** CYBER (CAP-FW-10 "security scope and false-positive analysis"): every subject of the package's assessments and confirmed events is
 *  within the declared SCOPE (the assets in scope); the FALSE-POSITIVE analysis over ADJUDICATED alerts (precision = TP/(TP+FP), n stated). */
export function cyberFocus(f: PackageFacts, a: AcceptanceFacts): Check[] {
  const scope = new Set(arr(f.version.manifest.controls?.scope?.entities));
  const sc: string[] = []; const outside: Row[] = [];
  if (scope.size === 0) sc.push('the use boundary declares no assets in scope');
  for (const x of a.assessments) for (const s of x.subjects) if (!scope.has(s)) outside.push({ kind: 'assessment', id: x.assessment_id, subject: s });
  for (const e of a.events) for (const s of e.subjects) if (!scope.has(s)) outside.push({ kind: 'event', id: e.event_id, subject: s });
  if (outside.length > 0) sc.push(`${outside.length} subject(s) outside the declared security scope`);
  const tp = a.alerts.filter((x) => x.adjudication === 'true_positive').length; const fp = a.alerts.filter((x) => x.adjudication === 'false_positive').length;
  const n = tp + fp; const precision = pct(tp, n);
  const minN = f.version.manifest.controls?.false_positive?.min_n ?? 5; const minP = f.version.manifest.controls?.false_positive?.min_precision ?? 0.5;
  const fpOut: string[] = [];
  if (n < minN) fpOut.push(`${n} adjudicated alert(s); the analysis needs at least ${minN}`);
  else if ((precision ?? 0) < minP) fpOut.push(`precision ${precision} (TP ${tp}, FP ${fp}) is below ${minP}`);
  return [
    check('security_scope', 'blocking', sc, { in_scope: scope.size, outside }),
    check('false_positive', 'blocking', fpOut, { true_positive: tp, false_positive: fp, n, precision, false_positive_rate: pct(fp, n), unadjudicated: a.alerts.filter((x) => x.adjudication === null && x.state !== 'withheld').length, min_n: minN, min_precision: minP }),
    ...common(f, a),
  ];
}

/** FINANCIAL (CAP-FW-11 "entitlement, timing, and calculation evidence"): each market source's ENTITLEMENT (active, rights confirmed, the
 *  purpose within the contract's), the TIMING (as-of = the last observation's day; publication lag = recorded − observed), the CALCULATION
 *  evidence (each declared calculation's inputs registered, its digest reproduced from the declaration). */
export function financialFocus(f: PackageFacts, a: AcceptanceFacts): Check[] {
  const now = ms(f.now) ?? Date.now(); const ent: string[] = []; const entRows: Row[] = [];
  for (const e of arr(f.version.manifest.source_set)) {
    const s = f.sources.find((x) => x.source_key === e.source_key);
    const permitted = new Set(arr(s?.purposes)); const over = arr(e.purposes).filter((p) => !permitted.has(p));
    const ok = s !== undefined && s.known && s.lifecycle_state === 'active' && s.rights_state === 'confirmed' && over.length === 0;
    entRows.push({ source_key: e.source_key, publisher: s?.publisher ?? null, data_origin: s?.data_origin ?? null, contract_version: s?.contract_version ?? null, state: s?.lifecycle_state ?? null, rights: s?.rights_state ?? null, purposes: e.purposes, permitted: [...permitted], entitled: ok });
    if (!ok) ent.push(`source ${e.source_key}: ${s === undefined || !s.known ? 'no contract' : s.lifecycle_state !== 'active' ? `contract ${s.lifecycle_state}` : s.rights_state !== 'confirmed' ? `rights ${s.rights_state}` : `purpose(s) ${over.join(', ')} not permitted`}`);
  }
  const maxLag = f.version.manifest.controls?.timing?.max_lag_days ?? 7; const tim: string[] = []; const timRows: Row[] = [];
  for (const s of f.sources.filter((x) => x.known)) {
    const obs = ms(s.last_observation_time); const rec = ms(s.last_observation_recorded_at);
    const lag = obs === null || rec === null ? null : Math.round(((rec - obs) / DAY) * 100) / 100;
    const age = rec === null ? null : Math.round((now - rec) / 1000);
    timRows.push({ source_key: s.source_key, as_of: s.last_observation_time, recorded_at: s.last_observation_recorded_at, publication_lag_days: lag, age_seconds: age, freshness_seconds: s.freshness_threshold_seconds });
    if (obs === null) tim.push(`source ${s.source_key} has no observation to time`);
    else if (lag !== null && lag > maxLag) tim.push(`source ${s.source_key}: publication lag ${lag} days exceeds ${maxLag}`);
    else if (age !== null && s.freshness_threshold_seconds !== null && age > s.freshness_threshold_seconds) tim.push(`source ${s.source_key}: the last observation was recorded ${age}s ago, beyond its freshness (${s.freshness_threshold_seconds}s)`);
  }
  const calc: string[] = []; const calcRows: Row[] = []; const series = new Set(a.series);
  const withCalc = arr(f.version.manifest.indicators).filter((i) => i.calculation !== undefined);
  if (withCalc.length === 0) calc.push('no indicator declares its calculation evidence');
  for (const i of withCalc) {
    const c = i.calculation as { inputs: string[]; method: string; digest: string };
    const recomputed = calculationDigest(c); const missing = arr(c.inputs).filter((x) => !series.has(x));
    calcRows.push({ indicator: i.key, inputs: c.inputs, method: c.method, declared_digest: c.digest, recomputed_digest: recomputed, reproducible: recomputed === c.digest, missing_inputs: missing });
    if (recomputed !== c.digest) calc.push(`indicator ${i.key}: the declared calculation digest does not reproduce (${c.digest.slice(0, 12)}… ≠ ${recomputed.slice(0, 12)}…)`);
    if (missing.length > 0) calc.push(`indicator ${i.key}: input series ${missing.join(', ')} not registered`);
  }
  return [
    check('entitlement', 'blocking', ent, { sources: entRows }),
    check('timing', 'blocking', tim, { sources: timRows, max_lag_days: maxLag }),
    check('calculation', 'blocking', calc, { calculations: calcRows }),
    ...common(f, a),
  ];
}

/** The acceptance focus of the package's kind (PK6). Competitor and supply-chain packages carry their own (§CI, §SC); here: common checks only. */
export function acceptanceFocus(kind: string, f: PackageFacts, a: AcceptanceFacts): Check[] {
  switch (kind) {
    case 'geopolitical': return geopoliticalFocus(f, a);
    case 'technology': return technologyFocus(f, a);
    case 'cyber': return cyberFocus(f, a);
    case 'financial': return financialFocus(f, a);
    default: return common(f, a);
  }
}

/** The verdict a port recomputes: every blocking check passed. */
export const verdict = (checks: Check[]): boolean => checks.filter((c) => c.severity === 'blocking').every((c) => c.passed);

/** The functions a health result disables (for display). */
export const disabledFunctions = (h: HealthResult): PackageFunction[] => Object.keys(h.disable).sort() as PackageFunction[];
