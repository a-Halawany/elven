/*
 * CP-6 B33 §PK (0111 §PK) — the pure pieces of the domain-package framework: semantic versions and ranges (contract compatibility), the
 * conformance suite, the health evaluation (which function is disabled, when a conflict is exposed), the acceptance focus of each package
 * kind (MEASURED: indicator freshness, evidence diversity, horizon evaluation, security scope, false-positive analysis, entitlement,
 * timing, calculation evidence), the four definitions' inputs statements — and EVERY refusal text the part's migration raises driven
 * through the mapper with its SQLSTATE: the families answer 403 → 404 → 409 → 422 by class, with the port's own sentence.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { asObservationRefusal } from '../../src/observation/observation-errors.js';
import { changeKind, parseSemver, satisfies, validRange } from '../../src/domains/packages/semver.js';
import {
  acceptanceFocus, canonicalMapping, contractCompatibility, cyberFocus, evaluateHealth, financialFocus, geopoliticalFocus, modelApproval, purpose, removedSince, riskMeaning,
  runConformance, sourceApproval, sourceCoverage, technologyFocus, verdict, type AcceptanceFacts, type PackageFacts, type SourceFact,
} from '../../src/domains/packages/conformance.js';
import { calculationDigest, digestOf, stableStringify } from '../../src/domains/packages/manifest.js';
import { CHOKEPOINT_INDICATOR, cyberPackage, financialPackage, geopoliticalPackage, packageDefinitions, technologyPackage } from '../../src/domains/packages/definitions.js';

const NOW = '2026-10-09T12:00:00.000Z';
const src = (key: string, over: Partial<SourceFact> = {}): SourceFact => ({
  source_key: key, known: true, source_id: '00000000-0000-0000-0000-000000000001', contract_version: 1, lifecycle_state: 'active', rights_state: 'confirmed',
  purposes: ['observation', 'corridor monitoring', 'discovery', 'cost exposure', 'structural context'], data_origin: 'synthetic', publisher: `${key} publisher`, freshness_threshold_seconds: 604_800,
  classification_ceiling: 'internal', acquisition_mode: 'replay', authority_class: 'authoritative', last_evidence_at: '2026-10-09T11:00:00.000Z',
  last_observation_time: '2026-10-09T00:00:00.000Z', last_observation_recorded_at: '2026-10-09T11:00:00.000Z', ...over,
});
function factsFor(def: ReturnType<typeof geopoliticalPackage>, over: Partial<PackageFacts> = {}): PackageFacts {
  const m = def.manifest;
  return {
    now: NOW,
    package: { package_id: 'p', package_key: def.key, domain_kind: def.kind, title: def.title, owner: 'o', state: 'declared' },
    version: { version: 1, semver: def.semver, state: 'proposed', manifest: m, manifest_digest: 'd'.repeat(64), proposed_by: 'o', disabled_functions: {}, conflict: null },
    active: null,
    core: { entity_types: ['organization', 'place', 'asset', 'product', 'vessel', 'route', 'person', 'other'], ontology: { version: 3, predicates: ['transits', 'carries'] } },
    namespace_ontology: { version_id: 'n', version: 1, entity_types: [...new Set(m.ontology_extension.mappings.map((x) => x.maps_to))], predicates: m.ontology_extension.predicates.map((x) => x.predicate), activated_at: NOW },
    sources: m.source_set.map((s) => src(s.source_key)),
    methods: m.models.filter((x) => x.kind === 'forecast').map((x) => ({ ref: x.ref, known: true, state: 'approved', state_reason: null, horizons: ['30d', '90d', '1y', '3y'], builtin: true })),
    behaviour: m.models.filter((x) => x.kind === 'behaviour').map((x) => ({ ref: x.ref, known: true, pinned: true })),
    taxonomy: { version: 2, keys: ['supply_chain', 'market', 'sourcing'] },
    packages: [],
    sections: Object.fromEntries(['ontology', 'methodology', 'assessment', 'escalation', 'use_boundary'].map((s) => [s, { state: 'approved', digest: 'x' }])),
    ...over,
  };
}
const acc = (over: Partial<AcceptanceFacts> = {}): AcceptanceFacts => ({
  indicators: [], series: [], validations: [], assessments: [], events: [], alerts: [], links: [], certification: { run_id: 'r', passed: true, ran_at: NOW }, ...over,
});
const byName = (checks: Array<{ check: string }>, name: string) => checks.find((c) => c.check === name) as { check: string; passed: boolean; findings: string[]; measured?: Record<string, unknown>; severity: string };

describe('semver: parse, compare, change kind, ranges', () => {
  it('parses x.y.z only and compares by major, minor, patch', () => {
    expect(parseSemver('1.2.3')).toEqual({ major: 1, minor: 2, patch: 3 });
    expect(parseSemver('1.2')).toBeNull();
    expect(parseSemver('v1.2.3')).toBeNull();
    expect(changeKind(parseSemver('1.2.3')!, parseSemver('2.0.0')!)).toBe('major');
    expect(changeKind(parseSemver('1.2.3')!, parseSemver('1.3.0')!)).toBe('minor');
    expect(changeKind(parseSemver('1.2.3')!, parseSemver('1.2.4')!)).toBe('patch');
    expect(changeKind(parseSemver('1.2.3')!, parseSemver('1.2.3')!)).toBe('same');
    expect(changeKind(parseSemver('1.2.3')!, parseSemver('1.1.9')!)).toBe('downgrade');
  });
  it('ranges: exact, comparators, caret, tilde, any, alternatives; malformed is null', () => {
    expect(satisfies('1.4.0', '^1.2.0')).toBe(true);
    expect(satisfies('2.0.0', '^1.2.0')).toBe(false);
    expect(satisfies('1.2.9', '~1.2.0')).toBe(true);
    expect(satisfies('1.3.0', '~1.2.0')).toBe(false);
    expect(satisfies('1.5.0', '>=1.0.0 <2.0.0')).toBe(true);
    expect(satisfies('2.0.0', '>=1.0.0 <2.0.0')).toBe(false);
    expect(satisfies('3.0.0', '*')).toBe(true);
    expect(satisfies('0.9.0', '^1.0.0 || ^0.9.0')).toBe(true);
    expect(satisfies('1.0.0', '1.0.0')).toBe(true);
    expect(satisfies('1.0.0', 'banana')).toBeNull();
    expect(validRange('>=1.0.0 <2.0.0')).toBe(true);
    expect(validRange('>=one')).toBe(false);
  });
});

describe('the conformance suite (PK3)', () => {
  const geo = geopoliticalPackage();
  it('a conforming manifest passes every blocking check; the verdict is the blocking checks', () => {
    const checks = runConformance(factsFor(geo));
    expect(checks.filter((c) => c.severity === 'blocking').every((c) => c.passed)).toBe(true);
    expect(verdict(checks)).toBe(true);
    expect(checks.map((c) => c.check)).toEqual(['canonical_mapping', 'namespace_ontology', 'contract_compatibility', 'source_approval', 'model_approval', 'risk_meaning', 'purpose', 'source_coverage', 'source_coverage_optional', 'inputs_statement']);
  });
  it('canonical mapping: a type off the core, a core name taken for another meaning, a core predicate redefined, a predicate naming an unknown type', () => {
    const m = structuredClone(geo.manifest);
    m.ontology_extension.mappings.push({ type: 'ship', maps_to: 'boat' }, { type: 'place', maps_to: 'organization' });
    m.ontology_extension.predicates.push({ predicate: 'transits' }, { predicate: 'flies', subject_types: ['aircraft'] });
    const c = canonicalMapping(factsFor({ ...geo, manifest: m }));
    expect(c.passed).toBe(false);
    expect(c.findings).toEqual([
      expect.stringMatching(/type ship maps onto boat, which is not a core entity type/), expect.stringMatching(/type place takes the name of a core type for another meaning/),
      expect.stringMatching(/predicate transits redefines the core's predicate of that name \(the core ontology v3\)/), expect.stringMatching(/predicate flies names aircraft, neither a mapped package type nor a core type/),
    ]);
  });
  it('contract compatibility: a downgrade, a breaking change as a minor version without a plan, the core range, requires and conflicts both ways', () => {
    const active = geo.manifest;
    const next = structuredClone(active); next.release.semver = '1.1.0'; next.ontology_extension.predicates = next.ontology_extension.predicates.slice(1);
    const f = factsFor({ ...geo, semver: '1.1.0', manifest: next }, { active: { version: 1, semver: '1.0.0', manifest: active } });
    expect(removedSince(active, next)).toEqual(['predicate threatens']);
    const c = contractCompatibility(f);
    expect(c.findings).toEqual([expect.stringMatching(/a breaking change \(removes predicate threatens\) is a major version, not a minor one/), expect.stringMatching(/carries no migration plan/)]);
    const major = structuredClone(next); major.release = { ...major.release, semver: '2.0.0', migration: 'the predicate is retired; edges re-derived under sanctioned_under' };
    expect(contractCompatibility(factsFor({ ...geo, semver: '2.0.0', manifest: major }, { active: { version: 1, semver: '1.0.0', manifest: active } })).passed).toBe(true);
    expect(contractCompatibility(factsFor({ ...geo, semver: '0.9.0', manifest: { ...active, release: { ...active.release, semver: '0.9.0' } } }, { active: { version: 1, semver: '1.0.0', manifest: active } })).findings[0]).toMatch(/does not move forward/);
    expect(contractCompatibility(factsFor(geo, { core: { entity_types: [], ontology: null } })).findings).toEqual([expect.stringMatching(/the domain has no active core ontology/)]);
    const req = structuredClone(active); req.release.requires = [{ package_key: 'supply', range: '^2.0.0' }]; req.release.conflicts = [{ package_key: 'cyber', range: '*' }];
    const other = [{ package_key: 'supply', domain_kind: 'supply_chain', version: 1, semver: '1.4.0', requires: [], conflicts: [] }, { package_key: 'cyber', domain_kind: 'cyber', version: 1, semver: '1.0.0', requires: [], conflicts: [{ package_key: geo.key, range: '^1.0.0' }] }];
    expect(contractCompatibility(factsFor({ ...geo, manifest: req }, { packages: other })).findings).toEqual([
      'requires supply ^2.0.0; the active version is 1.4.0', 'conflicts with cyber *, and cyber 1.0.0 is active', `the active cyber 1.0.0 declares a conflict with ${geo.key} ^1.0.0`,
    ]);
  });
  it('sources, models, risk meaning, purpose, coverage', () => {
    const f = factsFor(geo);
    f.sources[0] = src(f.sources[0]!.source_key, { lifecycle_state: 'suspended' }); f.sources[1] = src(f.sources[1]!.source_key, { rights_state: 'withdrawn' });
    expect(sourceApproval(f).findings).toEqual([expect.stringMatching(/contract v1 is suspended, not active/), expect.stringMatching(/rights are withdrawn, not confirmed/)]);
    const g = factsFor(geo, { methods: [{ ref: 'seasonal_naive@1', known: true, state: 'quarantined', state_reason: 'drift', horizons: null, builtin: false }], behaviour: [{ ref: 'supply-flow@1', known: true, pinned: false }] });
    expect(modelApproval(g).findings).toEqual(['forecast method seasonal_naive@1 is quarantined (drift)', 'behaviour model supply-flow@1 has no pinned implementation']);
    expect(riskMeaning(factsFor(geo, { taxonomy: null })).findings).toEqual(['the package maps risk meanings, but the domain has no risk taxonomy in force']);
    const p = factsFor(geo); p.sources[2] = src(p.sources[2]!.source_key, { purposes: ['observation'], classification_ceiling: 'confidential' });
    expect(purpose(p).findings).toEqual([expect.stringMatching(/is used for "discovery", which its contract does not permit/), expect.stringMatching(/is classified confidential, above the package's ceiling internal/)]);
    const cov = factsFor(geo); cov.sources[1] = src(cov.sources[1]!.source_key, { last_evidence_at: '2026-09-01T00:00:00.000Z' }); cov.sources[3] = src(cov.sources[3]!.source_key, { last_evidence_at: null });
    const [req, opt] = sourceCoverage(cov);
    expect(req!.findings).toEqual([expect.stringMatching(/last evidence 2026-09-01.* is older than its freshness \(604800s\)/)]);
    expect(opt).toMatchObject({ severity: 'advisory', findings: [expect.stringMatching(/has no evidence in this domain/)] });
  });
});

describe('health (PK4): the incompatible function disabled, the conflict exposed', () => {
  const geo = geopoliticalPackage();
  it('a sound active version: nothing disabled, no conflict', () => {
    const h = evaluateHealth(factsFor(geo, { version: { ...factsFor(geo).version, state: 'active' } }));
    expect(h.disable).toEqual({}); expect(h.conflict).toBeNull();
  });
  it('a suspended source disables only the functions that use it; a quarantined method disables forecast; a purpose exceeded disables its functions', () => {
    const f = factsFor(geo);
    f.sources[1] = src(f.sources[1]!.source_key, { lifecycle_state: 'suspended' });
    f.methods = [{ ref: 'seasonal_naive@1', known: true, state: 'quarantined', state_reason: 'drift', horizons: null, builtin: false }];
    f.sources[2] = src(f.sources[2]!.source_key, { purposes: ['observation'] });
    const h = evaluateHealth(f);
    expect(Object.keys(h.disable).sort()).toEqual(['assess', 'event', 'forecast']);
    expect(h.disable['assess']!.reason).toMatch(/source eu-sanctions-rss is suspended/);
    expect(h.disable['forecast']!.reason).toMatch(/forecast method seasonal_naive@1 is quarantined \(drift\)/);
    expect(h.conflict).toBeNull();
  });
  it('the namespace superseded or the risk meaning broken: a conflict on its functions; a required package gone: the whole package conflicted', () => {
    const f = factsFor(geo, { namespace_ontology: { version_id: 'n2', version: 2, entity_types: ['place'], predicates: ['threatens'], activated_at: NOW }, taxonomy: { version: 3, keys: ['market'] } });
    const h = evaluateHealth(f);
    expect(h.conflict).toMatchObject({ functions: ['assess', 'event', 'exposure'] });
    expect(h.conflict!.reason).toMatch(/the ontology namespace no longer carries the package's extension.*incompatible risk meaning/);
    const r = structuredClone(geo.manifest); r.release.requires = [{ package_key: 'competitor', range: '^1.0.0' }];
    const w = evaluateHealth(factsFor({ ...geo, manifest: r }));
    expect(w.conflict).toMatchObject({ reason: expect.stringMatching(/the required package competitor is no longer active/) });
    expect(w.conflict!.functions).toBeUndefined();
  });
});

describe('the acceptance focus of each kind (PK6), MEASURED', () => {
  it('geopolitical: the indicator set fresh / stale / unregistered; the scenario link; authority and conformance', () => {
    const geo = geopoliticalPackage({ chokepointSeries: 'pw:c4' });
    const f = factsFor(geo);
    const fresh = geopoliticalFocus(f, acc({ indicators: [{ key: CHOKEPOINT_INDICATOR, series_key: 'pw:c4', registered: true, source_key: 'imf-portwatch-chokepoints', last_observation_at: '2026-09-06', breached: false }], links: [{ link_kind: 'scenario', target_id: 's' }] }));
    expect(verdict(fresh)).toBe(true);
    expect(byName(fresh, 'indicator_set').measured).toMatchObject({ fresh: 1, total: 1, indicators: [expect.objectContaining({ age_days: 33, freshness_days: 45, data_origin: 'synthetic' })] });
    const stale = geopoliticalFocus(f, acc({ indicators: [{ key: CHOKEPOINT_INDICATOR, series_key: 'pw:c4', registered: true, source_key: null, last_observation_at: '2026-07-01', breached: null }] }));
    expect(byName(stale, 'indicator_set').findings).toEqual([expect.stringMatching(/the last observation \(2026-07-01\) is older than 45 days/)]);
    expect(byName(stale, 'scenario_link').passed).toBe(false);
    const noRun = geopoliticalFocus({ ...f, sections: { ...f.sections, ontology: { state: 'expired', digest: 'x' } } }, acc({ certification: null }));
    expect(byName(noRun, 'conformance').findings).toEqual(['no certification run is recorded']);
    expect(byName(noRun, 'authority').findings).toEqual(['section ontology is expired']);
  });
  it('technology: evidence diversity (share against the threshold) and the horizon evaluation — a 3y "validated" claim refused, scenario language accepted, a validated record honoured', () => {
    const t = technologyPackage({ adoptionSeries: 's1', claim: 'validated' });
    const diverse = [{ assessment_id: 'a', version: 1, state: 'approved', template: 'technology-maturity', material: true, source_diversity: { publishers: 2, threshold: 2, meets: true }, subjects: [] },
                     { assessment_id: 'b', version: 1, state: 'limited', template: 'technology-maturity', material: true, source_diversity: { publishers: 1, threshold: 2, meets: false }, subjects: [] }];
    const r = technologyFocus(factsFor(t), acc({ assessments: diverse, validations: [{ ref: 'seasonal_naive@1', series_key: 's1', horizon: '1y', validated: true, records: 3 }, { ref: 'seasonal_naive@1', series_key: 's1', horizon: '3y', validated: false, records: 1 }] }));
    expect(byName(r, 'evidence_diversity')).toMatchObject({ passed: true, measured: expect.objectContaining({ meeting: 1, total: 2, share: 0.5 }) });
    expect(byName(r, 'horizon_evaluation').findings).toEqual([expect.stringMatching(/at 3y claims validation; the B25 registry holds 1 record\(s\) and none passed — a long-horizon claim is refused, or issued in scenario_language/)]);
    const s = technologyFocus(factsFor(technologyPackage({ adoptionSeries: 's1', claim: 'scenario_language' })), acc({ assessments: diverse }));
    expect(byName(s, 'horizon_evaluation').passed).toBe(true);
    const u = technologyFocus(factsFor(technologyPackage({ adoptionSeries: 's1', claim: 'unvalidated' })), acc({ assessments: [] }));
    expect(byName(u, 'horizon_evaluation').findings).toEqual([expect.stringMatching(/at 3y has no passing validation and is not stated in scenario_language/)]);
    expect(byName(u, 'evidence_diversity').findings).toEqual(['no approved assessment of the package to measure']);
  });
  it('cyber: the security scope and the false-positive analysis (n stated; precision against the threshold)', () => {
    const c = cyberPackage({ scopeEntities: ['e1', 'e2'], minN: 5, minPrecision: 0.6 });
    const alerts = (tp: number, fp: number, un = 0) => [...Array(tp).fill('true_positive'), ...Array(fp).fill('false_positive'), ...Array(un).fill(null)].map((a, i) => ({ alert_id: `a${i}`, state: 'raised', adjudication: a as string | null }));
    const ok = cyberFocus(factsFor(c), acc({ events: [{ event_id: 'x', kind: 'campaign_observed', subjects: ['e1'] }], alerts: alerts(4, 1, 2) }));
    expect(byName(ok, 'false_positive').measured).toMatchObject({ true_positive: 4, false_positive: 1, n: 5, precision: 0.8, false_positive_rate: 0.2, unadjudicated: 2 });
    expect(verdict(ok)).toBe(true);
    expect(byName(cyberFocus(factsFor(c), acc({ alerts: alerts(2, 1) })), 'false_positive').findings).toEqual(['3 adjudicated alert(s); the analysis needs at least 5']);
    expect(byName(cyberFocus(factsFor(c), acc({ alerts: alerts(2, 3) })), 'false_positive').findings).toEqual([expect.stringMatching(/precision 0\.4 \(TP 2, FP 3\) is below 0\.6/)]);
    const out = cyberFocus(factsFor(c), acc({ events: [{ event_id: 'y', kind: 'campaign_observed', subjects: ['e9'] }], alerts: alerts(5, 0) }));
    expect(byName(out, 'security_scope')).toMatchObject({ passed: false, findings: ['1 subject(s) outside the declared security scope'] });
    expect(byName(cyberFocus(factsFor(cyberPackage()), acc({ alerts: alerts(5, 0) })), 'security_scope').findings).toEqual(['the use boundary declares no assets in scope', ]);
  });
  it('financial: entitlement per source, timing (as-of and publication lag), the calculation reproduced from its declaration', () => {
    const fin = financialPackage({ eurusdSeries: 'fx' });
    const f = factsFor(fin);
    const ok = financialFocus(f, acc({ series: ['fx'] }));
    expect(verdict(ok)).toBe(true);
    expect((byName(ok, 'timing').measured!['sources'] as Array<Record<string, unknown>>)[0]).toMatchObject({ as_of: '2026-10-09T00:00:00.000Z', publication_lag_days: 0.46 });
    const lag = factsFor(fin); lag.sources[0] = src(lag.sources[0]!.source_key, { last_observation_time: '2026-09-20T00:00:00.000Z' });
    expect(byName(financialFocus(lag, acc({ series: ['fx'] })), 'timing').findings).toEqual([expect.stringMatching(/publication lag 19\.46 days exceeds 5/)]);
    const ent = factsFor(fin); ent.sources[0] = src(ent.sources[0]!.source_key, { purposes: ['observation'] });
    expect(byName(financialFocus(ent, acc({ series: ['fx'] })), 'entitlement').findings).toEqual([expect.stringMatching(/ecb-eurusd: purpose\(s\) cost exposure not permitted/)]);
    const bad = financialFocus(factsFor(financialPackage({ eurusdSeries: 'fx', tamperCalculation: true })), acc({ series: [] }));
    expect(byName(bad, 'calculation').findings).toEqual([expect.stringMatching(/the declared calculation digest does not reproduce/), 'indicator eurusd: input series fx not registered']);
    expect(calculationDigest({ inputs: ['b', 'a'], method: 'm' })).toBe(calculationDigest({ inputs: ['a', 'b'], method: 'm' }));
  });
  it('a kind without its own focus (competitor, supply_chain) answers the common checks only', () => {
    expect(acceptanceFocus('competitor', factsFor(geopoliticalPackage()), acc()).map((c) => c.check)).toEqual(['conformance', 'authority', 'inputs_statement']);
  });
});

describe('the four definitions: real public feeds, synthetic inputs, the licensed provider a real acceptance needs; the digest form', () => {
  it('each definition states its inputs, its clause and focus; none claims a licensed source it does not have', () => {
    const defs = packageDefinitions();
    expect(defs.map((d) => [d.kind, d.clause.slice(0, 9)])).toEqual([['geopolitical', 'CAP-FW-08'], ['technology', 'CAP-FW-09'], ['cyber', 'CAP-FW-10'], ['financial', 'CAP-FW-11']]);
    for (const d of defs) {
      const st = d.manifest.controls.inputs!;
      expect(st.licensed_for_acceptance.length, d.kind).toBeGreaterThan(0);
      expect(d.manifest.ontology_extension.namespace).toBe(`pkg:${d.key}`);
      expect(d.manifest.release.boundary).toMatch(/B77.*B78.*B112.*B111.*R2/);
      for (const k of [...st.real_public, ...st.synthetic]) expect(d.manifest.source_set.map((s) => s.source_key), `${d.kind} ${k}`).toContain(k);
    }
    expect(defs[0]!.manifest.controls.inputs).toMatchObject({ real_public: ['imf-portwatch-chokepoints', 'eu-sanctions-rss', 'gdelt-discovery'], synthetic: ['red-sea-ais-positions'] });
    expect(defs[3]!.manifest.controls.inputs).toMatchObject({ real_public: ['ecb-eurusd', 'worldbank-indicators'], synthetic: ['nordwerk-internal'] });
    expect(defs[1]!.manifest.controls.inputs!.real_public).toEqual([]);
    expect(defs[2]!.manifest.controls.inputs!.real_public).toEqual([]);
  });
  it('the stable digest form sorts keys and drops undefined', () => {
    expect(stableStringify({ b: 1, a: [2, { d: undefined, c: 3 }] })).toBe('{"a":[2,{"c":3}],"b":1}');
    expect(digestOf({ a: 1 })).toBe(digestOf({ a: 1 }));
  });
});

describe('every refusal of the part\'s migration answers by its class (403 → 404 → 409 → 422) with its own sentence', () => {
  // the part-local file was folded into 0111 at integration: §PK is its own section of the one file
  const file = ((readFileSync(fileURLToPath(new URL('../../migrations/0111_b33_supply_chain_intelligence_domain_packages.sql', import.meta.url)), 'utf8')) as string).split('\n-- §PK — ')[1]!.split('-- ── end of the folded §PK ──')[0]!;
  const raised = [...file.matchAll(/RAISE EXCEPTION '((?:[^']|'')*)'[^;]*?USING ERRCODE = '([0-9A-Z]{5})'/g)].map((m) => ({ text: m[1]!.replace(/''/g, "'"), code: m[2]! }));
  const pg = (code: string, message: string) => Object.assign(new Error(message), { code });
  const statusOf = (cls: string) => (['actor', 'ownership', 'authority', 'separation_of_duties'].includes(cls) ? 403 : cls.startsWith('unknown_') ? 404 : ['state', 'stale', 'duplicate'].includes(cls) ? 409 : 422);
  it('the migration raises the five nouns only, in the class form', () => {
    expect(raised.length).toBeGreaterThan(100);
    for (const r of raised) expect(r.text, r.text).toMatch(/^(%|domain package|package conformance|domain assessment|watchlist|domain event) rejected \([a-z_]+\): /);
  });
  it('each text (its % filled) is mapped to its class\'s answer, the port\'s sentence kept', () => {
    const nouns = ['domain package', 'package conformance', 'domain assessment', 'watchlist', 'domain event'];
    let n = 0;
    for (const r of raised) {
      for (const noun of r.text.startsWith('%') ? nouns : [null]) {
        const text = (noun === null ? r.text : r.text.replace(/^%/, noun)).replace(/%/g, 'x');
        const cls = /rejected \(([a-z_]+)\)/.exec(text)![1]!;
        const a = asObservationRefusal(pg(r.code, text), 'corr');
        expect(a, text).not.toBeNull();
        expect(a!.getStatus(), text).toBe(statusOf(cls));
        expect((a!.getResponse() as { message: string }).message, text).toBe(text);
        n += 1;
      }
    }
    expect(n).toBeGreaterThan(100);
  });
  it('the PACKAGE_GATE refusal (TS) and the prelude\'s guard text answer as their rows say', () => {
    expect(asObservationRefusal(pg('22023', 'domain assessment rejected (package): function assess of package geo v1 is disabled: x'), 'c')!.getStatus()).toBe(422);
    expect(asObservationRefusal(pg('2F002', 'domain package rejected (state): a package version moves forward only (active → proposed refused)'), 'c')!.getStatus()).toBe(409);
  });
});
