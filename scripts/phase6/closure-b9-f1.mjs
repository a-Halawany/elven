#!/usr/bin/env node
/**
 * B9-F1 closure on the demonstration through the REAL HTTP path (the demonstration API, its PostgreSQL, the governed
 * routes): a historical retrieval of a memory item serves the authorised version's content and nothing of a version the
 * reader is not authorised for; the access evidence names what was served. The COMPLETE serialized response of every
 * read is printed as the server returned it.
 *
 *   K. Müller (knowledge owner) records v1 — internal, audience purposes memory/graph, no role restriction.
 *   R. Adler (record authority) supersedes: v2 classified RESTRICTED; v3 internal but for the audience role knowledge_owner only.
 *   A. Hoffmann (domain analyst; clearance internal, no audience role): current read refused (v3's audience); as-of before v3
 *   refused (v2's classification); as-of before v2 SERVED v1 — the whole response holds v1 only.
 *   platform-admin (clearance restricted): reads v3 (an administrator is admitted to every audience role), v2 as of before v3, v1 as of before v2.
 *   K. Müller reads v3 (in the audience role).
 *   The access ledger of the item, read from the database: one row per served read, each naming the version served.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pg = createRequire(join(ROOT, 'apps', 'api', 'package.json'))('pg');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const G = `/v1/tenants/${T}/domains/${D}/graph`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const mueller = await who('k.mueller'); const adler = await who('r.adler'); const hoffmann = await who('a.hoffmann');
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: env.EYE_DB_NAME ?? 'eye_demo', user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const V1 = 'F1 CLOSURE V1 (internal, everyone in the audience): the third shipment is rebooked within 48 hours of the corridor warning.';
const V2 = 'F1 CLOSURE V2 (RESTRICTED): the premium ceiling is a third of the shipment value; the broker is named here.';
const V3 = 'F1 CLOSURE V3 (knowledge owners only): the ceiling is revised to a quarter after the February review.';
const base = (over) => ({ recordClass: 'institutional', title: 'Rebooking rule (F1 closure act)', statement: V1, source: { kind: 'human', ref: 'decision room, January 2024 (F1 closure)' },
  audience: { classification: 'internal', roles: [], purposes: ['memory', 'graph'] }, validity: { from: '2024-01-17T00:00:00Z', to: null },
  retention: { profile: 'institutional-record-10y', retainUntil: '2034-01-17T00:00:00Z', basis: 'institutional rules are kept ten years' }, cites: [], related: { decisionId: null, objectiveId: null }, ...over });
const mark = async () => (await su.query('select clock_timestamp() t')).rows[0].t.toISOString();
const show = (label, r) => { note(`${label} → HTTP ${r.status}`); console.log('      ' + JSON.stringify(r.body)); return r; };
const leaks = (r, ...texts) => texts.filter((t) => JSON.stringify(r.body).includes(t));

console.log('\n=== B9-F1 closure on the demonstration (NORDWERK, eye_demo) through the HTTP path ===\n');
console.log('1. the versions');
const rec = await call(`${G}/memory/record`, as(mueller, scope, { purposeId: 'memory', action: 'memory.item.record', objectType: 'MEM', consequence: 'C2' }), base({}), mueller.token);
if (!rec.ok) { bad(`record: ${rec.status} ${rec.body?.message ?? ''}`); process.exit(1); }
const itemId = rec.body.memory.itemId; ok(`K. Müller recorded ${itemId} v1 (internal; purposes memory, graph; no role restriction)`);
await sleep(50); const tBeforeV2 = await mark(); await sleep(50);
const s2 = await call(`${G}/memory/${itemId}/supersede`, as(adler, scope, { purposeId: 'memory', action: 'memory.item.supersede', objectType: 'MEM', objectId: itemId, consequence: 'C2' }),
  base({ statement: V2, source: { kind: 'human', ref: 'F1_V2_SOURCE_RESTRICTED' }, audience: { classification: 'restricted', roles: [], purposes: ['memory', 'graph'] }, supersession: { reason: 'the premium ceiling and the broker are restricted', effectiveAt: '2024-02-01T00:00:00Z' } }), adler.token);
if (!s2.ok) { bad(`supersede v2: ${s2.status} ${s2.body?.message ?? ''}`); process.exit(1); } ok(`R. Adler superseded → v2 (classification RESTRICTED)`);
await sleep(50); const tBeforeV3 = await mark(); await sleep(50);
const s3 = await call(`${G}/memory/${itemId}/supersede`, as(adler, scope, { purposeId: 'memory', action: 'memory.item.supersede', objectType: 'MEM', objectId: itemId, consequence: 'C2' }),
  base({ statement: V3, source: { kind: 'human', ref: 'F1_V3_SOURCE_KNOWLEDGE_OWNERS' }, audience: { classification: 'internal', roles: ['knowledge_owner'], purposes: ['memory', 'graph'] }, supersession: { reason: 'the revised ceiling is the knowledge owners\'', effectiveAt: '2024-03-01T00:00:00Z' } }), adler.token);
if (!s3.ok) { bad(`supersede v3: ${s3.status} ${s3.body?.message ?? ''}`); process.exit(1); } ok(`R. Adler superseded → v3 (audience role knowledge_owner only)`);
const retrieve = (session, asOf, purpose = 'memory') => call(`${G}/memory/${itemId}/retrieve`, as(session, scope, { purposeId: purpose, action: 'memory.item.retrieve', objectType: 'MEM', objectId: itemId, sideEffect: 'none' }), asOf === null ? {} : { asOf }, session.token);

console.log('\n2. the controls — current reads');
const c1 = show('A. Hoffmann, current', await retrieve(hoffmann, null));
if (c1.status === 403) ok('the analyst\'s current read refused (v3 is for the audience role knowledge_owner)'); else bad(`expected 403, got ${c1.status}`);
const c2 = show('platform-admin, current', await retrieve(admin, null));
if (c2.ok && c2.body.memory.versionServed === 3) ok('the administrator reads v3 (0066 §3\'s rule: an administrator is admitted to every audience role; classification still applies to them)'); else bad(`expected the administrator to read v3, got ${c2.status}`);
const c3 = show('K. Müller, current', await retrieve(mueller, null));
if (c3.ok && c3.body.memory.versionServed === 3 && leaks(c3, V3).length === 1) ok('the knowledge owner reads v3'); else bad(`expected v3 for the knowledge owner, got ${c3.status}`);
const c4 = show('A. Hoffmann, as of before v3 (v2 stands)', await retrieve(hoffmann, tBeforeV3));
if (c4.status === 403) ok('the analyst\'s read of v2 refused (RESTRICTED; the served version\'s classification decides)'); else bad(`expected 403, got ${c4.status}`);
const c5 = show('platform-admin, as of before v3 (v2 stands)', await retrieve(admin, tBeforeV3));
if (c5.ok && c5.body.memory.versionServed === 2 && leaks(c5, V2).length === 1 && leaks(c5, V3, 'F1_V3_SOURCE').length === 0) ok('the administrator reads v2 (restricted; cleared) and nothing of v3'); else bad(`v2 read: ${c5.status}, leaks ${JSON.stringify(leaks(c5, V3, 'F1_V3_SOURCE'))}`);

console.log('\n3. THE CLOSURE CASE — the analyst\'s historical read of v1');
const before = (await su.query('select count(*)::int n from memory.item_access where item_id = $1', [itemId])).rows[0].n;
const h1 = show('A. Hoffmann, as of before v2 (v1 stands), purpose graph', await retrieve(hoffmann, tBeforeV2, 'graph'));
const text = JSON.stringify(h1.body);
const bad1 = leaks(h1, V2, V3, 'F1_V2_SOURCE', 'F1_V3_SOURCE', '"restricted"', 'knowledge_owner', 'the premium ceiling', 'the revised ceiling');
if (h1.ok && h1.body.memory.versionServed === 1 && text.includes(V1) && bad1.length === 0) ok(`served v1; the complete serialized response (${text.length} bytes) carries v1's statement and source and NOTHING of v2 or v3 — no statement, no source reference, no classification, no audience role, no supersession reason of theirs`);
else bad(`historical read: ${h1.status}, versionServed ${h1.body?.memory?.versionServed}, leaked ${JSON.stringify(bad1)}`);
note(`availability metadata returned: ${JSON.stringify(h1.body?.memory?.availability)}`);
const rows = (await su.query('select object_version::int v, purpose_id, reader_principal_id::text reader, read_as_of, accessed_at from memory.item_access where item_id = $1 order by accessed_at', [itemId])).rows;
const mine = rows.filter((r) => r.reader === hoffmann.principalId);
if (rows.length === before + 1 && mine.length === 1 && mine[0].v === 1 && mine[0].purpose_id === 'graph') ok(`the access ledger: ${rows.length} row(s) — the analyst's one names version 1 under purpose graph (the refused reads left none)`); else bad(`access ledger: ${JSON.stringify(rows)}`);
const h2 = show('platform-admin, as of before v2 (v1 stands)', await retrieve(admin, tBeforeV2));
if (h2.ok && h2.body.memory.versionServed === 1 && leaks(h2, V2, V3).length === 0) ok('the administrator\'s v1 read holds v1 only as well'); else bad(`admin v1 read: ${h2.status}`);
console.log('\n4. the record without content — the listing and the item\'s record under graph.read');
const list = await call(`${G}/memory/list`, as(hoffmann, scope, { purposeId: 'graph', action: 'graph.read', objectType: 'MEM', sideEffect: 'none' }), {}, hoffmann.token);
const mineRow = (list.body.memory ?? []).find((x) => x.item_id === itemId);
console.log('      ' + JSON.stringify(mineRow ?? null));
if (list.ok && mineRow && leaks({ body: mineRow }, V1, V2, V3).length === 0) ok('the listing carries no statement of any version'); else bad(`listing: ${list.status} ${JSON.stringify(leaks({ body: mineRow ?? {} }, V1, V2, V3))}`);
const get = await call(`${G}/memory/${itemId}/get`, as(hoffmann, scope, { purposeId: 'graph', action: 'graph.read', objectType: 'MEM', objectId: itemId, sideEffect: 'none' }), {}, hoffmann.token);
console.log('      ' + JSON.stringify(get.body).slice(0, 1500));
if (get.ok && leaks(get, V1, V2, V3).length === 0) ok('the item\'s record (events, access history, dependencies) carries no statement of any version'); else bad(`get: ${get.status} ${JSON.stringify(leaks(get, V1, V2, V3))}`);
const all = (await su.query('select object_version::int v, purpose_id, reader_principal_id::text reader from memory.item_access where item_id = $1 order by accessed_at', [itemId])).rows;
note(`the item's access ledger at the end: ${JSON.stringify(all.map((r) => ({ v: r.v, purpose: r.purpose_id, reader: r.reader.slice(0, 8) })))}`);
await su.end();
console.log(`\n=== ${failureCount() === 0 ? 'B9-F1 closure: every case as the closure scope states' : `${failureCount()} case(s) did not hold`} ===`);
process.exit(failureCount() === 0 ? 0 : 1);
