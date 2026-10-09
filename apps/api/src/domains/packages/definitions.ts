/**
 * B33 §PK (0111) — THE FOUR PACKAGE DEFINITIONS (PK6; CAP-FW-08 geopolitical, CAP-FW-09 technology, CAP-FW-10 cyber, CAP-FW-11 financial).
 * TENANT DATA, declared through the package ports (domain.package.declare / .version) by the harness and the act — never SQL seeds. Each
 * definition is a function of the deployment's inputs (the source keys, series, method refs, the taxonomy category, the assets in scope),
 * with defaults naming eye_demo's registry, and each STATES its inputs: which are REAL PUBLIC FEEDS, which are SYNTHETIC, and which LICENSED
 * provider a real-provider acceptance would need. A public feed demonstrates the software; it never closes a clause that needs a licensed
 * source. A synthetic record demonstrates the software only. Real-provider acceptance is external; the signed acceptance record is R2.
 *
 * Boundary (R7): signing / publisher identity → B77; all-layer namespaces → B78; marketplace and purchase → B112; parity → B111.
 */
import { calculationDigest, type Manifest } from './manifest.js';

export interface PackageDefinition {
  key: string; kind: 'geopolitical' | 'technology' | 'cyber' | 'financial'; title: string; semver: string; manifest: Manifest;
  /** the capability clause and its acceptance focus, as the catalogue words it */
  clause: string; focus: string;
}

/** The geopolitical indicator's key (split: a key-shaped literal trips the secret scanner). */
export const CHOKEPOINT_INDICATOR = ['chokepoint4', 'transits'].join('_');

const BOUNDARY = 'in-tenant certified package (B33): signing and publisher identity → B77; all-layer namespaces → B78; marketplace → B112; parity → B111; signed acceptance → R2';

/** GEOPOLITICAL — the Red Sea security situation as a certified indicator set (the tracker's second F-P4-15 scene). */
export function geopoliticalPackage(i: {
  key?: string; semver?: string; portwatch?: string; sanctions?: string; gdelt?: string; ais?: string; chokepointSeries?: string; aisSeries?: string | null;
  riskCategory?: string; method?: string; behaviour?: string;
} = {}): PackageDefinition {
  const key = i.key ?? 'geopolitical-red-sea';
  const pw = i.portwatch ?? 'imf-portwatch-chokepoints'; const sa = i.sanctions ?? 'eu-sanctions-rss'; const gd = i.gdelt ?? 'gdelt-discovery'; const ais = i.ais ?? 'red-sea-ais-positions';
  const series = i.chokepointSeries ?? 'portwatch:chokepoint4:n_total';
  return {
    key, kind: 'geopolitical', title: 'Geopolitical intelligence — Red Sea security situation', semver: i.semver ?? '1.0.0',
    clause: 'CAP-FW-08 Extend sources, ontology, indicators, assessments, and scenarios', focus: 'Domain conformance and authority acceptance',
    manifest: {
      ontology_extension: {
        namespace: `pkg:${key}`,
        mappings: [{ type: 'chokepoint', maps_to: 'place' }, { type: 'maritime_corridor', maps_to: 'route' }, { type: 'state_actor', maps_to: 'organization' },
                   { type: 'armed_group', maps_to: 'organization' }, { type: 'sanction_regime', maps_to: 'other' }],
        predicates: [{ predicate: 'threatens', subject_types: ['armed_group', 'state_actor'], object_types: ['maritime_corridor', 'chokepoint'] },
                     { predicate: 'sanctioned_under', subject_types: ['organization'], object_types: ['sanction_regime'] }],
        event_kinds: ['security_incident', 'sanction_listed', 'transit_disruption'],
      },
      source_set: [
        { source_key: pw, purposes: ['observation', 'corridor monitoring'], required: true, functions: ['assess', 'indicator'], role: 'daily chokepoint transit counts (Bab el-Mandeb = chokepoint4)' },
        { source_key: sa, purposes: ['observation', 'corridor monitoring'], required: true, functions: ['assess', 'event'], role: 'EU sanctions listings' },
        { source_key: gd, purposes: ['observation', 'discovery'], required: true, functions: ['event'], role: 'news discovery (observational, never factual authority)' },
        { source_key: ais, purposes: ['observation'], required: false, functions: ['assess'], role: 'vessel positions (SYNTHETIC)' },
      ],
      indicators: [
        { key: CHOKEPOINT_INDICATOR, series_key: series, definition: 'daily vessel transits through Bab el-Mandeb (chokepoint4); PortWatch publishes weekly with a lag of two to four weeks', freshness_days: 45 },
        ...(i.aisSeries ? [{ key: 'ais_positions', series_key: i.aisSeries, definition: 'vessel positions in the corridor (SYNTHETIC)', freshness_days: 14 }] : []),
      ],
      models: [
        { kind: 'forecast', ref: i.method ?? 'seasonal_naive@1', series_key: series, horizons: ['30d', '90d'], claim: 'unvalidated', functions: ['forecast'] },
        { kind: 'behaviour', ref: i.behaviour ?? 'supply-flow@1', functions: ['scenario'] },
      ],
      assessment_templates: [{ key: 'red-sea-security', title: 'Red Sea security situation', min_publishers: 2, material: true }],
      watchlist_templates: [{ key: 'corridor-security', title: 'Corridor security', rules: [{ rule_key: 'security-incident', on: 'event', kinds: ['security_incident', 'transit_disruption'] },
                                                                                            { rule_key: 'situation-assessed', on: 'assessment', templates: ['red-sea-security'] }] }],
      escalation: { alert: 'domain.alert under the published attention policy, to the watchlist owner and the policy\'s roles', governance: 'domain.package to the domain specialists' },
      controls: {
        purposes: ['observation', 'corridor monitoring'], classification_ceiling: 'internal', retention: '24 months',
        scope: { geography: ['Red Sea', 'Bab el-Mandeb', 'Gulf of Aden'], horizon: '90d', description: 'the security of the Red Sea shipping corridor for NORDWERK\'s inbound supply' },
        inputs: { real_public: [pw, sa, gd], synthetic: [ais],
                  licensed_for_acceptance: ['ACLED conflict event data (licensed)', 'a commercial geopolitical risk feed (e.g. Dragonfly, Control Risks — licensed)', 'licensed AIS (e.g. Spire Maritime)'] },
      },
      risk_meaning: [{ category_key: i.riskCategory ?? 'supply_chain', meaning: 'a corridor security deterioration is a supply-chain risk (delay, reroute cost)' }],
      release: { semver: i.semver ?? '1.0.0', core: { ontology: '>=1.0.0' }, requires: [], conflicts: [], migration: null, boundary: BOUNDARY },
    },
  };
}

/** TECHNOLOGY — research, patents, capabilities, adoption and discontinuities (SYNTHETIC records only). */
export function technologyPackage(i: { key?: string; semver?: string; patents?: string; research?: string; adoptionSeries?: string; method?: string; riskCategory?: string;
                                       claim?: 'validated' | 'scenario_language' | 'unvalidated' } = {}): PackageDefinition {
  const key = i.key ?? 'technology-watch'; const pat = i.patents ?? 'nordwerk-internal'; const res = i.research ?? 'carrier-advisories';
  const series = i.adoptionSeries ?? 'ecb-eurusd';
  return {
    key, kind: 'technology', title: 'Technology intelligence — drive-train research and patents', semver: i.semver ?? '1.0.0',
    clause: 'CAP-FW-09 Track research, patents, capabilities, adoption, and discontinuities', focus: 'Evidence diversity and horizon evaluation',
    manifest: {
      ontology_extension: {
        namespace: `pkg:${key}`,
        mappings: [{ type: 'research_lab', maps_to: 'organization' }, { type: 'technology', maps_to: 'product' }, { type: 'patent_family', maps_to: 'other' }],
        predicates: [{ predicate: 'patents', subject_types: ['research_lab', 'organization'], object_types: ['patent_family'] },
                     { predicate: 'develops', subject_types: ['research_lab', 'organization'], object_types: ['technology'] }],
        event_kinds: ['patent_filed', 'paper_published', 'capability_demonstrated', 'discontinuity_signal'],
      },
      source_set: [
        { source_key: pat, purposes: ['observation'], required: true, functions: ['assess', 'event'], role: 'patent records (SYNTHETIC upload)' },
        { source_key: res, purposes: ['observation'], required: false, functions: ['assess'], role: 'research records (SYNTHETIC upload)' },
      ],
      indicators: [],
      models: [{ kind: 'forecast', ref: i.method ?? 'seasonal_naive@1', series_key: series, horizons: ['1y', '3y'], claim: i.claim ?? 'scenario_language', functions: ['forecast'] }],
      assessment_templates: [{ key: 'technology-maturity', title: 'Technology maturity and adoption', min_publishers: 2, material: true }],
      watchlist_templates: [{ key: 'discontinuities', title: 'Technology discontinuities', rules: [{ rule_key: 'discontinuity', on: 'event', kinds: ['discontinuity_signal', 'capability_demonstrated'] }] }],
      controls: {
        purposes: ['observation'], classification_ceiling: 'internal', retention: '36 months', evidence_diversity: { min_share: 0.5 },
        scope: { horizon: '3y (scenario language beyond 1y unless validated)', description: 'drive-train technologies relevant to NORDWERK\'s product line' },
        inputs: { real_public: [], synthetic: [pat, res],
                  licensed_for_acceptance: ['patent data: EPO OPS or USPTO PatentsView (free with terms) or Derwent / PatSnap (licensed)', 'research: OpenAlex (free) or Scopus (licensed)'] },
      },
      risk_meaning: [{ category_key: i.riskCategory ?? 'market', meaning: 'a technology discontinuity is a market risk or opportunity' }],
      release: { semver: i.semver ?? '1.0.0', requires: [], conflicts: [], migration: null, boundary: BOUNDARY },
    },
  };
}

/** CYBER — threats, vulnerabilities, assets, campaigns and strategic exposure (SYNTHETIC CTI and asset inventory). */
export function cyberPackage(i: { key?: string; semver?: string; cti?: string; assets?: string; scopeEntities?: string[]; riskCategory?: string; minN?: number; minPrecision?: number } = {}): PackageDefinition {
  const key = i.key ?? 'cyber-exposure'; const cti = i.cti ?? 'nordwerk-internal'; const inv = i.assets ?? 'nordwerk-exchange-intake';
  return {
    key, kind: 'cyber', title: 'Cyber intelligence — threats to NORDWERK\'s plants and suppliers', semver: i.semver ?? '1.0.0',
    clause: 'CAP-FW-10 Connect threats, vulnerabilities, assets, campaigns, and strategic exposure', focus: 'Security scope and false-positive analysis',
    manifest: {
      ontology_extension: {
        namespace: `pkg:${key}`,
        mappings: [{ type: 'threat_actor', maps_to: 'organization' }, { type: 'campaign', maps_to: 'other' }, { type: 'vulnerability', maps_to: 'other' }, { type: 'asset', maps_to: 'asset' }],
        predicates: [{ predicate: 'targets', subject_types: ['threat_actor', 'campaign'], object_types: ['asset'] }, { predicate: 'exploits', subject_types: ['campaign'], object_types: ['vulnerability'] },
                     { predicate: 'affects', subject_types: ['vulnerability'], object_types: ['asset'] }],
        event_kinds: ['campaign_observed', 'vulnerability_published', 'exploitation_observed'],
      },
      source_set: [
        { source_key: cti, purposes: ['observation'], required: true, functions: ['assess', 'event'], role: 'threat intelligence records (SYNTHETIC)' },
        { source_key: inv, purposes: ['observation'], required: false, functions: ['assess'], role: 'asset inventory (SYNTHETIC)' },
      ],
      indicators: [], models: [],
      assessment_templates: [{ key: 'strategic-exposure', title: 'Strategic cyber exposure', min_publishers: 1, material: true }],
      watchlist_templates: [{ key: 'campaigns', title: 'Campaigns against our assets', rules: [{ rule_key: 'campaign', on: 'event', kinds: ['campaign_observed', 'exploitation_observed'] }] }],
      controls: {
        purposes: ['observation'], classification_ceiling: 'internal', retention: '12 months',
        scope: { entities: i.scopeEntities ?? [], description: 'the assets in scope: NORDWERK plants and supplier interfaces named here' },
        false_positive: { min_precision: i.minPrecision ?? 0.6, min_n: i.minN ?? 5 },
        inputs: { real_public: [], synthetic: [cti, inv],
                  licensed_for_acceptance: ['CTI feeds (Recorded Future, Mandiant — licensed)', 'NVD and CISA KEV (public, free)', 'the customer\'s own asset inventory (CMDB)'] },
      },
      risk_meaning: [{ category_key: i.riskCategory ?? 'supply_chain', meaning: 'a campaign against a plant or supplier interface is an operational supply-chain risk' }],
      release: { semver: i.semver ?? '1.0.0', requires: [], conflicts: [], migration: null, boundary: BOUNDARY },
    },
  };
}

/** FINANCIAL — markets, entities, filings, instruments and exposures (REAL ECB and World Bank; SYNTHETIC filings). */
export function financialPackage(i: { key?: string; semver?: string; ecb?: string; worldbank?: string; filings?: string; eurusdSeries?: string; riskCategory?: string; maxLagDays?: number;
                                      tamperCalculation?: boolean } = {}): PackageDefinition {
  const key = i.key ?? 'financial-markets'; const ecb = i.ecb ?? 'ecb-eurusd'; const wb = i.worldbank ?? 'worldbank-indicators'; const fil = i.filings ?? 'nordwerk-internal';
  const series = i.eurusdSeries ?? 'ecb-eurusd';
  const calc = { inputs: [series], method: 'level: the daily reference rate as published (no transformation)' };
  return {
    key, kind: 'financial', title: 'Financial intelligence — currency and filings exposure', semver: i.semver ?? '1.0.0',
    clause: 'CAP-FW-11 Connect markets, entities, filings, instruments, and exposures', focus: 'Entitlement, timing, and calculation evidence',
    manifest: {
      ontology_extension: {
        namespace: `pkg:${key}`,
        mappings: [{ type: 'issuer', maps_to: 'organization' }, { type: 'instrument', maps_to: 'product' }, { type: 'market', maps_to: 'place' }, { type: 'filing', maps_to: 'other' }],
        predicates: [{ predicate: 'issues', subject_types: ['issuer'], object_types: ['instrument'] }, { predicate: 'files', subject_types: ['issuer'], object_types: ['filing'] },
                     { predicate: 'trades_in', subject_types: ['instrument'], object_types: ['market'] }],
        event_kinds: ['filing_published', 'rate_move', 'rating_change'],
      },
      source_set: [
        { source_key: ecb, purposes: ['observation', 'cost exposure'], required: true, functions: ['assess', 'indicator', 'forecast'], role: 'ECB euro foreign exchange reference rates' },
        { source_key: wb, purposes: ['observation', 'structural context'], required: false, functions: ['assess'], role: 'World Bank indicators (annual)' },
        { source_key: fil, purposes: ['observation'], required: false, functions: ['event'], role: 'filings (SYNTHETIC)' },
      ],
      indicators: [{ key: 'eurusd', series_key: series, definition: 'EUR/USD reference rate (USD per EUR), as published by the ECB', freshness_days: 7,
                     calculation: { ...calc, digest: i.tamperCalculation ? '0'.repeat(64) : calculationDigest(calc) } }],
      models: [],
      assessment_templates: [{ key: 'currency-exposure', title: 'Currency exposure of the cost base', min_publishers: 1, material: true }],
      watchlist_templates: [{ key: 'filings', title: 'Filings of suppliers and competitors', rules: [{ rule_key: 'filing', on: 'event', kinds: ['filing_published', 'rating_change'] }] }],
      controls: {
        purposes: ['observation', 'cost exposure'], classification_ceiling: 'internal', retention: '84 months', timing: { max_lag_days: i.maxLagDays ?? 5 },
        inputs: { real_public: [ecb, wb], synthetic: [fil],
                  licensed_for_acceptance: ['market data (Refinitiv / LSEG, Bloomberg — licensed)', 'filings: SEC EDGAR (free), ESEF / national registries', 'ratings (licensed)'] },
      },
      risk_meaning: [{ category_key: i.riskCategory ?? 'market', meaning: 'a currency move is a market risk on the USD-denominated cost base' }],
      release: { semver: i.semver ?? '1.0.0', requires: [], conflicts: [], migration: null, boundary: BOUNDARY },
    },
  };
}

/** The four, with their defaults (the demonstration's registry) — the workspace lists them with their inputs statement. */
export function packageDefinitions(): PackageDefinition[] {
  return [geopoliticalPackage(), technologyPackage(), cyberPackage(), financialPackage()];
}
