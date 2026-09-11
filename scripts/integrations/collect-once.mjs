/**
 * ONE operator-triggered governed collection of a live source on the demonstration
 * deployment (m.dvorak, `observation.run.trigger`), and the run read back. This is an
 * OPERATOR run — it is recorded with `trigger: operator` and is not evidence of
 * scheduled execution; the readiness register keeps the two apart.
 *
 *   node scripts/integrations/collect-once.mjs <source_key>
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as } from '../phase4/governed.mjs';

const key = process.argv[2];
if (!key) { console.error('usage: collect-once.mjs <source_key>'); process.exit(2); }
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const dvorak = await login('m.dvorak', env.EYE_TEST_ADMIN_PASSWORD);
if (dvorak === null) { console.error('operator authentication failed'); process.exit(1); }
const O = `/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/observation`;
const mgr = (over) => as(dvorak, scope, over);
const list = await call(`${O}/sources/list`, mgr({ action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none' }), { limit: 100 }, dvorak.token);
const s = (list.body.sources ?? []).find((x) => x.source_key === key && x.lifecycle_state === 'active');
if (!s) { console.error(`no active contract for ${key}`); process.exit(1); }
const r = await call(`${O}/sources/${s.source_id}/collect`, mgr({ action: 'observation.run.trigger', objectType: 'RUN' }), { contractVersion: s.contract_version }, dvorak.token);
if (!r.ok) { console.error(`collect refused (${r.status}) ${r.body?.message ?? ''}`); process.exit(1); }
const run = r.body.run;
const detail = await call(`${O}/runs/${run.runId}/get`, mgr({ action: 'observation.read.runs', objectType: 'RUN', objectId: run.runId, sideEffect: 'none' }), {}, dvorak.token);
const started = (detail.body.events ?? []).find((e) => e.event === 'run.started');
const finished = (detail.body.events ?? []).find((e) => /^run\.(finished|failed|cancelled|budget_exceeded)$/.test(e.event));
console.log(`${key}@v${s.contract_version} operator run ${run.runId.slice(0, 8)}… ${run.state}: admitted ${run.admitted} · unchanged/noop ${run.noop} · quarantined ${run.quarantined}${run.reason ? ` · ${run.reason}` : ''}`);
console.log(`  trigger: ${JSON.stringify(started?.details?.trigger ?? null)} · ${finished?.event ?? '?'}: bytes transferred ${finished?.details?.bytes_transferred ?? '?'} · bytes stored ${finished?.details?.bytes_stored ?? '?'}`);
process.exit(run.state === 'finished' ? 0 : 1);
