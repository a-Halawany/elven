/**
 * UN Comtrade — the activation act under the owner's authorization of 2026-09-12 (SOURCE_INTEGRATION_STATUS §10:
 * "Existing UN keys/Comtrade and live PortWatch are authorized within source permissions and existing budgets/cadences";
 * no purchase, no cadence or budget change), through the governed routes only, on the demonstration deployment.
 *
 * What the policy says (read in full on 2026-09-13 — §11 records the quotes): UN Comtrade data are for INTERNAL USE
 * ("only for use by staff members of the institutional unit for the benefit of the unit"; "Internal use, including the
 * use of UN Comtrade data for the AI model" is exempt from a licence fee); citation "UN Comtrade"; re-dissemination "in
 * any form" needs UNSD's permission (an active premium subscription); a for-profit extraction/visualisation application
 * needs a fee-based licence; APIs are to be used directly (no scraping); the free tier is 500 calls/day and 100,000
 * records per call. The contract below is INTERNAL ANALYSIS ONLY, attribution "Source: UN Comtrade.", no redistribution.
 *
 * Acts, in order — each a request an operator could make:
 *   1. `un-comtrade` v1 LIVE (rest) registered by a.hoffmann: the Comtrade Plus API (HS 8505, permanent magnets — the
 *      slice the upload source replays), the credential by REFERENCE (`EYE_SRC_COMTRADE_KEY`, header
 *      `Ocp-Apim-Subscription-Key` — the governed credential path, migration 0070 §1; the value is never in a contract,
 *      a record or a log), the upload contract's cadence and budgets carried verbatim (weekly; 25 requests, 32 MiB).
 *   2. approved by m.dvorak; the rights recorded (confirmed for internal analysis, the policy quoted as evidence).
 *   3. the readiness register read: the deployment binds the key, or it does not. It does not → the act STOPS here,
 *      approved and not active (an active contract whose every run cancels is noise, not collection); the owner binds
 *      `EYE_SRC_COMTRADE_KEY` in `.eye-local/env` on the demonstration host and re-runs this script.
 *   4. (bound) activated; ONE operator-triggered run (m.dvorak), read back.
 *
 * Idempotent: a re-run finds the source where it is and continues. NOTHING HERE PRINTS A CREDENTIAL.
 *
 *   node scripts/integrations/activate-comtrade.mjs
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = loadLocalEnv(ROOT);
const OPERATOR_PASSWORD = env.EYE_TEST_ADMIN_PASSWORD;
const CREDENTIAL_REF = 'EYE_SRC_COMTRADE_KEY';
const CREDENTIAL_HEADER = 'Ocp-Apim-Subscription-Key';
export const COMTRADE_ATTRIBUTION = 'Source: UN Comtrade.';
export const RIGHTS_EVIDENCE = 'UN Comtrade "Policy on use and re-dissemination" (uncomtrade.org/docs/policy-on-use-and-re-dissemination) and "Subscriptions" (uncomtrade.org/docs/subscriptions), read in full 2026-09-13: internal use permitted without permission ("only for use by staff members of the institutional unit for the benefit of the unit"; "Internal use, including the use of UN Comtrade data for the AI model" exempt from a licence fee); citation "UN Comtrade"; re-dissemination "in any form" requires UNSD permission (active premium subscriber); for-profit extraction/visualisation applications need a fee-based licence; "web scraping via bots" restricted — APIs used directly; free tier 500 calls/day, 100,000 records per call. This contract: internal analysis only, no redistribution — SOURCE_INTEGRATION_STATUS §11.';
const LICENCE = 'UN Comtrade Policy on use and re-dissemination (read 2026-09-13): data provided for internal use only; re-dissemination in any form requires UNSD permission; exempt uses include internal use and the use of the data for an AI model; the free tier is 500 API calls/day, 100,000 records per call. Attribution: "UN Comtrade".';

const short = (id) => `${String(id).slice(0, 8)}…`;
const receipt = (r) => { const rc = r.body?.receipt; if (!rc) return ''; const pd = rc.policyDecisionId ?? null; const seq = rc.auditSeq ?? null; return pd || seq ? ` [policy decision ${pd ? short(pd) : '?'} · audit seq ${seq ?? '?'}]` : ''; };

console.log('\n=== UN Comtrade — the activation act under the owner\'s authorization of 2026-09-12 (governed routes only) ===\n');
const admin = await adminSession(env);
const scope = await demoScope(admin);
const hoffmann = await login('a.hoffmann', OPERATOR_PASSWORD);
const dvorak = await login('m.dvorak', OPERATOR_PASSWORD);
if (hoffmann === null || dvorak === null) { console.error('operator authentication failed'); process.exit(1); }
const O = `/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/observation`;
const reg = (over) => as(hoffmann, scope, over);
const mgr = (over) => as(dvorak, scope, over);
const readiness = async () => (await call(`${O}/sources/readiness`, mgr({ action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none' }), { limit: 100 }, dvorak.token)).body.sources ?? [];
const rowsOf = async (key) => (await readiness()).filter((s) => s.source_key === key).sort((a, b) => a.contract_version - b.contract_version);

/* ───────────── 0. what stands ───────────── */
console.log('0. the register as it stands');
const upload = (await rowsOf('un-comtrade-upload'))[0] ?? null;
if (upload === null) { bad('un-comtrade-upload is not registered — the Phase 1 seed first'); process.exit(1); }
const uc = upload.contract;
note(`un-comtrade-upload v${upload.contract_version} ${upload.lifecycle_state} · ${upload.acquisition_mode} · rights ${upload.rights_state} · cadence ${uc.identity.cadence_seconds} s · budgets ${JSON.stringify(uc.security_and_operations.budgets)}`);
let live = (await rowsOf('un-comtrade'))[0] ?? null;
note(`un-comtrade (live, rest): ${live ? `v${live.contract_version} ${live.lifecycle_state}; readiness ${live.readiness?.verdict} — ${live.readiness?.credential}` : 'not registered yet'}`);

/* ───────────── 1. register ───────────── */
// HS 8505 (permanent magnets and electro-magnets), Germany (reporter 276) with the world (partner 0), annual, imports and exports —
// the slice the upload source replays; one request per flow; the free tier's 100,000-record ceiling is far above it.
const BASE = 'https://comtradeapi.un.org/data/v1/get/C/A/HS';
const endpoints = ['M', 'X'].map((flow) => `${BASE}?reporterCode=276&partnerCode=0&cmdCode=8505&flowCode=${flow}&period=2024&includeDesc=true`);
function contractV1() {
  return {
    name: 'UN Comtrade — HS 8505, Germany with the world, annual (Comtrade Plus API)',
    publisher: 'United Nations Statistics Division',
    source_key: 'un-comtrade',
    data_origin: 'real',
    connector_kind: 'rest',
    authority_class: 'authoritative',
    acquisition_mode: 'live',
    identity: {
      source_identity: 'un-comtrade', publisher_identity: 'UN Comtrade',
      endpoints, scheme_allowlist: ['https'],
      // the upload contract's cadence, carried verbatim (weekly); no new value
      cadence_seconds: uc.identity.cadence_seconds, jitter_seconds: uc.identity.jitter_seconds ?? 0, collection_window: null,
    },
    authority_and_rights: {
      owner: 'observation.operations', steward: 'a.hoffmann', authority: 'Official UN trade statistics',
      licence: LICENCE, legal_basis: 'UN Comtrade Policy on use and re-dissemination: internal use by the institutional unit; the owner\'s free-tier subscription key bound by reference',
      rights_state: 'confirmed', permitted_use: ['internal analysis'], purposes: ['observation', 'trade baseline'],
      attribution: COMTRADE_ATTRIBUTION,
      robots_policy: 'the API used directly, as the fair-usage policy asks; no scraping',
      classification_ceiling: 'internal', residency: 'EU', retention: '24 months', deletion_obligation: 'none',
    },
    security_and_operations: {
      credential_ref: CREDENTIAL_REF, credential_header: CREDENTIAL_HEADER,
      authentication_method: 'subscription key in the Ocp-Apim-Subscription-Key header, resolved at egress from the deployment variable EYE_SRC_COMTRADE_KEY (the governed credential path); never in a contract, a record or a log',
      authenticity_method: {
        transport_endpoint: 'TLS to comtradeapi.un.org with the origin pinned to the contract\'s endpoints; redirects off the origin drop the credential',
        byte_integrity: 'SHA-256 digest verified pre-store, post-store and on every read',
        source_origin: 'the publisher\'s API answers the authenticated request; the subscription key names the account, not the publisher',
        content_authenticity: 'unknown — the API response carries no publisher signature',
      },
      // the upload contract's budgets, carried verbatim (25 requests, 32 MiB per run); no new value
      budgets: { ...uc.security_and_operations.budgets },
      expected_schema: {
        media_types: ['application/json'], required_fields: ['data'], drift_tolerance: 0, max_bytes: 16777216,
        item_path: 'data', item_key_field: ['period', 'reporterCode', 'partnerCode', 'cmdCode', 'flowCode'], item_time_field: 'period',
      },
      freshness_expectation: { threshold_seconds: 31536000, expected_interval: 'yearly (annual trade statistics, revised in place by the publisher)' },
      coverage_expectations: { universe_version: 'v1', denominator_derivation: 'one row per reporter × partner × commodity × flow × period; two requests per run (imports, exports)', expected_items_per_window: 2, not_applicable_dimensions: [], not_applicable_reason: null },
      correction_channel: 'the publisher revises annual figures in place and offers no corrections feed; a re-walk compares each response with what is held and records changed rows as revisions (supersessions)',
    },
    lifecycle: { contract_version: 1, effective_from: '2026-09-13T00:00:00Z', effective_to: null, supersedes_version: null },
  };
}

if (live === null) {
  console.log('\n1. register un-comtrade v1 (live, rest) as a.hoffmann — the credential by reference, the upload contract\'s cadence and budgets carried');
  const r = await call(`${O}/sources/register`, reg({ action: 'observation.source.register', objectType: 'SRC' }), { contract: contractV1() }, hoffmann.token);
  if (r.ok) ok(`registered ${short(r.body.source.sourceId)} v${r.body.source.contractVersion} (${r.body.source.lifecycleState})${receipt(r)}`);
  else { bad(`registration refused (${r.status}) ${r.body?.message ?? JSON.stringify(r.body)}`); console.log(`\n=== stopped at registration — ${failureCount()} problem(s) ===\n`); process.exit(1); }
  live = (await rowsOf('un-comtrade'))[0];
}
const sourceId = live.source_id;

/* ───────────── 2. approve; rights ───────────── */
if (live.lifecycle_state === 'draft') {
  console.log('\n2. approval by a DIFFERENT operator (m.dvorak); the rights recorded');
  const a = await call(`${O}/sources/${sourceId}/approve`, mgr({ action: 'observation.source.approve', objectType: 'SRC', objectId: sourceId }),
    { contractVersion: 1, decision: 'approve', reason: 'reviewed under the owner\'s authorization of 2026-09-12: the Comtrade policy read in full on 2026-09-13 (internal analysis only; attribution "UN Comtrade"; no redistribution); the credential by reference through the governed credential path; the upload contract\'s cadence and budgets carried verbatim' }, dvorak.token);
  if (a.ok) ok(`approved${receipt(a)}`); else { bad(`approval refused (${a.status}) ${a.body?.message ?? JSON.stringify(a.body)}`); process.exit(1); }
  const rights = await call(`${O}/sources/${sourceId}/rights`, mgr({ action: 'observation.source.rights', objectType: 'SRC', objectId: sourceId }), { contractVersion: 1, rightsState: 'confirmed', evidence: RIGHTS_EVIDENCE }, dvorak.token);
  if (rights.ok) ok(`rights: confirmed (internal analysis; the policy quoted as evidence)${receipt(rights)}`); else bad(`rights refused (${rights.status}) ${rights.body?.message ?? JSON.stringify(rights.body)}`);
  live = (await rowsOf('un-comtrade'))[0];
} else console.log(`\n2. v1 already ${live.lifecycle_state}; continuing`);

/* ───────────── 3. the key: bound here, or not ───────────── */
console.log('\n3. the readiness register: is the credential bound on this deployment?');
note(`un-comtrade v1 ${live.lifecycle_state}: ${live.readiness?.verdict} — ${live.readiness?.reason}; credential ${live.readiness?.credential}`);
const bound = /bound in this deployment; the run carries it/.test(String(live.readiness?.credential ?? ''));
if (!bound) {
  ok(`the act STOPS here, approved and not active: the deployment binds no credential named ${CREDENTIAL_REF}. The owner binds the free-tier key as ${CREDENTIAL_REF} in .eye-local/env on the demonstration host (never in the repository) and re-runs this script; it then activates v1 and triggers one operator run. No cadence, budget or purchase changes; nothing was collected.`);
  console.log(`\n=== stopped before activation — the key is the owner's to bind (${failureCount()} problem(s)) ===\n`);
  process.exit(failureCount() === 0 ? 0 : 1);
}

/* ───────────── 4. activate; one operator run ───────────── */
if (live.lifecycle_state !== 'active') {
  console.log('\n4. activation and one operator-triggered run');
  const t = await call(`${O}/sources/${sourceId}/transition`, mgr({ action: 'observation.source.transition', objectType: 'SRC', objectId: sourceId }), { contractVersion: 1, target: 'active', reason: 'UN Comtrade activated under the owner\'s authorization of 2026-09-12; the key bound by reference on this deployment' }, dvorak.token);
  if (t.ok) ok(`v1 active${receipt(t)}`); else { bad(`activation refused (${t.status}) ${t.body?.message ?? JSON.stringify(t.body)}`); process.exit(1); }
}
const run = await call(`${O}/sources/${sourceId}/collect`, mgr({ action: 'observation.run.trigger', objectType: 'SRC', objectId: sourceId }), {}, dvorak.token);
if (run.ok) ok(`operator run ${short(run.body.run?.runId ?? run.body.runId ?? '?')}: ${run.body.run?.state ?? run.body.state} — ${run.body.run?.reason ?? run.body.reason ?? ''}; admitted ${run.body.run?.admitted ?? run.body.admitted ?? '?'}${receipt(run)}`);
else bad(`operator run refused (${run.status}) ${run.body?.message ?? JSON.stringify(run.body)}`);
const after = (await rowsOf('un-comtrade'))[0];
note(`un-comtrade v1 ${after.lifecycle_state}: ${after.readiness?.verdict} — ${after.readiness?.reason}; last run ${JSON.stringify(after.readiness?.last_run ?? null)}; evidence objects ${after.readiness?.evidence_objects}`);
console.log(`\n=== ${failureCount() === 0 ? 'the act completed' : `${failureCount()} problem(s)`} ===\n`);
process.exit(failureCount() === 0 ? 0 : 1);
