/**
 * The REST connector's code digest changed (B11: `rest-credential-carriage@1.0.0` enters the digest — the governed
 * credential path is a transport behaviour the connector did not have). An agent is a grant to run ONE identified body
 * of code (SOURCE_INTEGRATION_STATUS §9.11.10): every agent registered against the previous digest stops matching
 * (`authorize_agent_run`: "agent code digest mismatch"), so each REST source gets a new agent through the governed route
 * and its previous agent is revoked — the same act §9.11.10 performed by hand, scripted. Upload and rss agents untouched.
 *
 *   node scripts/integrations/reprovision-rest-agents.mjs
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const hoffmann = await login('a.hoffmann', env.EYE_TEST_ADMIN_PASSWORD);
const dvorak = await login('m.dvorak', env.EYE_TEST_ADMIN_PASSWORD);
if (hoffmann === null || dvorak === null) { console.error('operator authentication failed'); process.exit(1); }
const O = `/v1/tenants/${scope.tenantId}/domains/${scope.domainId}/observation`;
const mgr = (over) => as(dvorak, scope, over);
const short = (id) => `${String(id).slice(0, 8)}…`;
// the running connector's digest, from the built API (what the demonstration process runs)
const { RestConnector } = createRequire(join(ROOT, 'apps', 'api', 'package.json'))(join(ROOT, 'apps', 'api', 'dist', 'observation', 'connectors', 'rest.connector.js'));
const digest = new RestConnector().codeDigest;
console.log(`\n=== REST agents re-provisioned for connector digest ${digest.slice(0, 12)}… (governed routes) ===\n`);
const sources = (await call(`${O}/sources/readiness`, mgr({ action: 'observation.read.sources', objectType: 'SRC', sideEffect: 'none' }), { limit: 100 }, dvorak.token)).body.sources ?? [];
const rest = new Map();
for (const s of sources) if (s.connector_kind === 'rest') rest.set(s.source_id, s.source_key);
let registered = 0; let revoked = 0; let kept = 0;
for (const [sourceId, key] of rest) {
  const src = await call(`${O}/sources/${sourceId}/get`, mgr({ action: 'observation.read.sources', objectType: 'SRC', objectId: sourceId, sideEffect: 'none' }), {}, dvorak.token);
  const active = (src.body.agents ?? []).filter((x) => x.status === 'active');
  const matching = active.filter((x) => x.code_digest === digest);
  if (matching.length > 0) { kept += 1; note(`${key}: agent ${short(matching[0].agent_id)} already on this digest`); continue; }
  const r = await call(`${O}/agents/register`, { scope: 'DOMAIN', tenantId: scope.tenantId, domainId: scope.domainId, action: 'observation.agent.register', objectType: 'AGT', objectId: null, principalId: `principal:${admin.principalId}`, purposeId: 'observation' },
    { sourceId, connector: 'rest', ownerPrincipalId: hoffmann.principalId }, admin.token);
  if (!r.ok) { bad(`${key}: agent registration refused (${r.status}) ${r.body?.message ?? ''}`); continue; }
  registered += 1; ok(`${key}: agent ${short(r.body.agent.agentId)} registered on digest ${digest.slice(0, 12)}… (owner a.hoffmann)`);
  for (const x of active) {
    const rv = await call(`${O}/agents/${x.agent_id}/revoke`, mgr({ action: 'observation.agent.revoke', objectType: 'AGT', objectId: x.agent_id }), { reason: `superseded: the connector's code digest now covers the governed credential path (rest-credential-carriage@1.0.0); this agent was registered against digest ${String(x.code_digest ?? '').slice(0, 12)}` }, dvorak.token);
    if (rv.ok) { revoked += 1; ok(`${key}: agent ${short(x.agent_id)} (digest ${String(x.code_digest ?? '').slice(0, 12)}…) revoked by m.dvorak`); } else bad(`${key}: revoke refused (${rv.status}) ${rv.body?.message ?? ''}`);
  }
}
console.log(`\n=== ${registered} registered, ${revoked} revoked, ${kept} already current — ${failureCount() === 0 ? 'done' : `${failureCount()} problem(s)`} ===\n`);
process.exit(failureCount() === 0 ? 0 : 1);
