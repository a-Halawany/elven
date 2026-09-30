#!/usr/bin/env node
/**
 * CP-6 B90 §R (f) — THE PLATFORM'S OWN PRODUCTS REGISTERED (App G DPD-01..11 "not registered as a product with owner/SLO"; DZ-16) on the
 * demonstration (NORDWERK; eye_demo — or the rehearsal copy EYE_DB_NAME / EYE_API name), through the REAL routes: the nine platform data
 * products — the typed object API, the observation evidence, the graph query, the twin snapshot, the forecast package, the scenario
 * portfolio, the simulation run, the decision package, the briefing — each REGISTERED by the data steward for a named OWNER (an existing
 * demo persona holding a role of the product), DECLARED by the owner (the contract by the registry's schema rows where one exists — EVD, TWN,
 * FCT, SCN, SIM, DPK, BRF — or by declared fields, the serving modes, the inputs and outputs, an SLO with its floor, a closed policy, a cost
 * basis), REVIEWED for admission by the steward, RELEASED by the owner (the DPR admitted), and OBSERVED once (a SYNTHETIC availability probe,
 * met) so the schedule's first scorecard reads ok. RERUN-SAFE: a product whose key is already registered is read and left ("stands — an
 * earlier run"); a released one is not re-released. A seeding SCRIPT the act runs — not a migration (the registry is a record of acts).
 *
 * Personas: the data steward F. Aydın (`f.aydin`, role data_steward — created through the governed principal route when absent); the
 * owners are the demonstration's own (t.richter, a.hoffmann, l.brandt, t.nakamura, n.eriksen, c.brenner, m.dvorak). Every figure is
 * SYNTHETIC. Nothing here prints a credential.
 */
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount, createPersona } from '../phase4/governed.mjs';

const SELF_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = process.env.EYE_ROOT ?? (existsSync(join(SELF_ROOT, '.eye-local', 'env')) ? SELF_ROOT : process.cwd());
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const PR = `/v1/tenants/${T}/domains/${D}/products`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const env_ = (s) => (over) => as(s, scope, { purposeId: 'executive', consequence: 'C2', ...over });

console.log(`THE B90 PLATFORM PRODUCTS on ${env.EYE_DB_NAME ?? 'eye_demo'} — ${new Date().toISOString()}`);

/* ── the steward ─────────────────────────────────────────────────────────────────────── */
const st = await createPersona(admin, T, { displayName: 'F. Aydın — data steward (SYNTHETIC)', loginName: process.env.EYE_B90_STEWARD ?? 'f.aydin', password: PW, roleCode: 'data_steward', domainId: D });
if (st.session === null) { bad(`the data steward could not be created or opened (${st.status} ${st.message ?? ''})`); process.exit(1); }
if (st.created) ok('the administrator CREATED F. Aydın (data_steward at the domain) through the governed principal route'); else note('F. Aydın is present — an earlier run');
const steward = st.session;
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const owners = {};
for (const l of ['t.richter', 'a.hoffmann', 'l.brandt', 't.nakamura', 'n.eriksen', 'c.brenner', 'm.dvorak']) owners[l] = await who(l);

/* ── the nine platform products (App G DPD-01..11; the object types that EXIST in objects.schema_registry at 0095) ─────────────────── */
const slo = (over) => ({ availability_pct: 99.5, attainment_floor_pct: 95, grace_ticks: 2, ...over });
const PRODUCTS = [
  { key: 'platform.object-api', title: 'The typed object API', kind: 'object', owner: 't.richter', purpose: 'the typed canonical object API — every admitted object served with its header and schema (DPD-01)',
    decl: { contract: { fields: [{ name: 'object_id', type: 'uuid' }, { name: 'object_type', type: 'text' }, { name: 'object_version', type: 'int' }, { name: 'lifecycle_state', type: 'text' }, { name: 'payload', type: 'jsonb' }] },
      serving_modes: ['api'], inputs: [{ kind: 'object_type', ref: 'OBS' }, { kind: 'object_type', ref: 'EVD' }, { kind: 'object_type', ref: 'CLM' }], outputs: [{ kind: 'external', ref: '/v1/objects' }], slo: slo({}) } },
  { key: 'platform.observation-evidence', title: 'The observation evidence', kind: 'evidence', owner: 'a.hoffmann', purpose: 'the evidence objects of every acquisition with their custody and authenticity (DPD-02)',
    decl: { contract: { schema: [{ object_type: 'EVD', schema_version: 'v2' }] }, serving_modes: ['api', 'package'], inputs: [{ kind: 'source', ref: 'observation.sources' }], outputs: [{ kind: 'object_type', ref: 'EVD', authority: true }], slo: slo({ freshness_seconds: 3600 }) } },
  { key: 'platform.graph-query', title: 'The graph query', kind: 'graph', owner: 'l.brandt', purpose: 'the entity graph with its relations and strategy objects, queried as of an instant (DPD-03)',
    decl: { contract: { fields: [{ name: 'entity_id', type: 'uuid' }, { name: 'relation', type: 'text' }, { name: 'as_of', type: 'timestamptz' }] }, serving_modes: ['query', 'api'],
      inputs: [{ kind: 'object_type', ref: 'ENT' }, { kind: 'object_type', ref: 'REL' }, { kind: 'object_type', ref: 'OBJ' }], outputs: [{ kind: 'relation', ref: 'graph.entities' }], slo: slo({ freshness_seconds: 900 }) } },
  { key: 'platform.twin-snapshot', title: 'The twin snapshot', kind: 'twin_snapshot', owner: 't.nakamura', purpose: 'a digital twin version at an instant with its constraints and methods (DPD-04)',
    decl: { contract: { schema: [{ object_type: 'TWN', schema_version: 'v1' }] }, serving_modes: ['api', 'package'], inputs: [{ kind: 'object_type', ref: 'ENT' }, { kind: 'object_type', ref: 'OBS' }], outputs: [{ kind: 'object_type', ref: 'TWN', authority: true }], slo: slo({}) } },
  { key: 'platform.forecast-package', title: 'The forecast package', kind: 'forecast', owner: 'n.eriksen', purpose: 'an issued forecast with its uncertainty, fitness and the series it rests on (DPD-05)',
    decl: { contract: { schema: [{ object_type: 'FCT', schema_version: 'v1' }] }, serving_modes: ['api', 'event'], inputs: [{ kind: 'relation', ref: 'prediction.series' }, { kind: 'object_type', ref: 'OBS' }], outputs: [{ kind: 'object_type', ref: 'FCT', authority: true }], slo: slo({ freshness_seconds: 86400 }) } },
  { key: 'platform.scenario-portfolio', title: 'The scenario portfolio', kind: 'scenario', owner: 'c.brenner', purpose: 'the declared scenarios and their branches with coherence (DPD-06)',
    decl: { contract: { schema: [{ object_type: 'SCN', schema_version: 'v3' }] }, serving_modes: ['api'], inputs: [{ kind: 'object_type', ref: 'FCT' }, { kind: 'object_type', ref: 'WRN' }], outputs: [{ kind: 'object_type', ref: 'SCN', authority: true }], slo: slo({}) } },
  { key: 'platform.simulation-run', title: 'The simulation run', kind: 'simulation', owner: 't.nakamura', purpose: 'a completed simulation run with its outputs digest, reproducible (DPD-07)',
    decl: { contract: { schema: [{ object_type: 'SIM', schema_version: 'v2' }] }, serving_modes: ['api', 'package'], inputs: [{ kind: 'object_type', ref: 'TWN' }, { kind: 'object_type', ref: 'SCN' }], outputs: [{ kind: 'object_type', ref: 'SIM', authority: true }], slo: slo({ reproducible: true }) } },
  { key: 'platform.decision-package', title: 'The decision package', kind: 'decision', owner: 'l.brandt', purpose: 'a decision package with its options, terms, approvals and commitments (DPD-08)',
    decl: { contract: { schema: [{ object_type: 'DPK', schema_version: 'v1' }] }, serving_modes: ['api', 'package'], inputs: [{ kind: 'object_type', ref: 'SCN' }, { kind: 'object_type', ref: 'SIM' }, { kind: 'object_type', ref: 'FCT' }], outputs: [{ kind: 'object_type', ref: 'DPK', authority: true }], slo: slo({}) } },
  { key: 'platform.briefing', title: 'The briefing', kind: 'briefing', owner: 'm.dvorak', purpose: 'the executive briefing editions with their contract, bands and suppressions (DPD-09)',
    decl: { contract: { schema: [{ object_type: 'BRF', schema_version: 'v3' }] }, serving_modes: ['api', 'package'], inputs: [{ kind: 'object_type', ref: 'DPK' }, { kind: 'object_type', ref: 'WRN' }, { kind: 'object_type', ref: 'FCT' }], outputs: [{ kind: 'object_type', ref: 'BRF', authority: true }], slo: slo({ freshness_seconds: 3600 }) } },
];
const DECL = (d) => ({ ...d, policy: { purposes: ['executive', 'observation', 'prediction'], data_classes: ['internal'] }, cost: { basis: 'compute-minutes × the product\'s share of the platform (SYNTHETIC)' }, quality: { completeness: 'declared by the platform' } });

const listed = await call(`${PR}/list`, env_(steward)({ action: 'products.product.read', objectType: 'DPR', sideEffect: 'none' }), { limit: 500 }, steward.token);
if (!listed.ok) { fail('the registry list', listed); process.exit(1); }
const byKey = new Map((listed.body.products ?? []).map((p) => [p.product_key, p]));
const ENV_OUT = { EYE_B90_STEWARD: process.env.EYE_B90_STEWARD ?? 'f.aydin', EYE_B90_PRODUCTS_OWNER: 'n.eriksen' };

for (const P of PRODUCTS) {
  const ownerSession = owners[P.owner];
  const O = env_(ownerSession); const S = env_(steward);
  let product = byKey.get(P.key) ?? null;
  if (product === null) {
    const r = await call(`${PR}/register`, S({ action: 'products.product.register', objectType: 'DPR' }), { key: P.key, title: `${P.title} (SYNTHETIC registration)`, kind: P.kind, purpose: P.purpose, ownerPrincipalId: ownerSession.principalId }, steward.token);
    if (!r.ok) { fail(`register ${P.key}`, r); continue; }
    product = r.body.product;
    ok(`F. Aydın REGISTERED ${P.key} (${P.kind}) for its owner ${P.owner} — ${short(product.product_id)}`);
  } else note(`${P.key} stands — an earlier run (${product.state}${product.released_version ? `, v${product.released_version} released` : ''})`);
  const id = product.product_id;
  if (product.state === 'released' || product.state === 'degraded' || product.state === 'withdrawn' || product.state === 'retired') { ENV_OUT[`EYE_B90_P_${P.key.replace(/[^a-z0-9]/g, '_').toUpperCase()}`] = id; continue; }
  const d = await call(`${PR}/${id}/declare`, O({ action: 'products.product.declare', objectType: 'DPR', objectId: id }), { declaration: DECL(P.decl) }, ownerSession.token);
  if (!d.ok) { fail(`declare ${P.key}`, d); continue; }
  const version = d.body.product.version;
  ok(`${P.owner} DECLARED ${P.key} v${version} (digest ${String(d.body.product.digest).slice(0, 12)}…)`);
  const rv = await call(`${PR}/${id}/reviews`, S({ action: 'products.product.review', objectType: 'DPR', objectId: id }), { version, kind: 'admission', outcome: 'accepted', notes: `admission of ${P.key} v${version} reviewed by the data steward: the contract, the SLO floor and the closed policy stand (SYNTHETIC)`, evidence: { checklist: 'DP-41-006' } }, steward.token);
  if (!rv.ok) { fail(`review ${P.key}`, rv); continue; }
  ok(`F. Aydın recorded the ACCEPTED admission review of ${P.key} v${version}`);
  const rl = await call(`${PR}/${id}/release`, O({ action: 'products.product.release', objectType: 'DPR', objectId: id }), { version }, ownerSession.token);
  if (!rl.ok) { fail(`release ${P.key}`, rl); continue; }
  ok(`${P.owner} RELEASED ${P.key} v${version} — the DPR admitted at object_version ${rl.body.product.dpr.object_version}`);
  const ob = await call(`${PR}/${id}/slo`, O({ action: 'products.slo.observe', objectType: 'DPR', objectId: id }), { measure: 'availability_pct', value: 99.9, threshold: 99.5, met: true, source: 'synthetic availability probe (the B90 act)', details: { synthetic: true } }, ownerSession.token);
  if (!ob.ok) fail(`observe ${P.key}`, ob); else ok(`availability_pct 99.9 OBSERVED on ${P.key} (SYNTHETIC; the schedule's first scorecard reads it)`);
  ENV_OUT[`EYE_B90_P_${P.key.replace(/[^a-z0-9]/g, '_').toUpperCase()}`] = id;
}

console.log('\nENV for the walks:');
for (const [k, v] of Object.entries(ENV_OUT)) console.log(`  ${k}=${v}`);
note('LIMITS said: every figure is SYNTHETIC (the availability probe is the act\'s own observation, not a measurement of the platform); the products DESCRIBE the platform\'s own surfaces and mutate nothing; the scorecards are the schedule\'s (the attention tick step product-scorecards), not this script\'s.');
process.exit(failureCount() > 0 ? 1 : 0);
