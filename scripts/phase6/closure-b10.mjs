#!/usr/bin/env node
/**
 * B10-F1/F2/F3 (Codex's bounded review at 48f7bdc) and B10-F4 (author-found) closed on the demonstration through the REAL HTTP
 * path (the demonstration API, its PostgreSQL, the governed routes). Every briefing read is printed WHOLE as the server returned
 * it where the closure turns on the complete response.
 *
 *   F1  K. Müller records an item for the audience role EXECUTIVE (purposes memory, briefing) and an unrestricted one. S. Okafor
 *       (executive) composes the room's briefing (following its latest as the prior): both items read, both accesses on the ledger.
 *       L. Brandt (the room's owner — holds briefing.read, not the audience role) is refused the item directly and reads the briefing: the restricted item WITHHELD
 *       (title, statement, source absent from the whole response), the unrestricted one served, the availability naming why.
 *       Controls: S. Okafor reads it whole; platform-admin (every audience role) reads it whole; the wrong purpose refused.
 *   F4  A. Hoffmann (domain analyst, objects.read) reads the memory item and the briefing through the generic object route:
 *       headers only, the content withheld — every version; an evidence object's payload is served as before.
 *   F2  S. Okafor composes twice at one cutoff: one content digest, two access rows, the accesses reported beside the content.
 *   F3  an item recorded, a cutoff marked, composed (v1); R. Adler supersedes (v2); composed at the same cutoff again — v1 kept and
 *       the digest unchanged; composed now — v2; the earlier briefing's availability reports the supersession apart from its content.
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
const X = `/v1/tenants/${T}/domains/${D}`; const G = `${X}/graph`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (id) => `${String(id).slice(0, 8)}…`;
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const mueller = await who('k.mueller'); const adler = await who('r.adler'); const okafor = await who('s.okafor'); const brandt = await who('l.brandt'); const hoffmann = await who('a.hoffmann');
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: env.EYE_DB_NAME ?? 'eye_demo', user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const mark = async () => (await q('select clock_timestamp() t'))[0].t.toISOString();
const show = (label, r) => { note(`${label} → HTTP ${r.status}`); console.log('      ' + JSON.stringify(r.body)); return r; };
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const item = (over) => ({ recordClass: 'institutional', title: 'B10 closure item', statement: 'UNRESTRICTED-B10: the third shipment is rebooked within 48 hours of the corridor warning.', source: { kind: 'human', ref: 'decision room, March 2024 (B10 closure)' },
  audience: { classification: 'internal', roles: [], purposes: ['memory', 'briefing'] }, validity: { from: '2024-03-01T00:00:00Z', to: null },
  retention: { profile: 'institutional-record-10y', retainUntil: '2034-03-01T00:00:00Z', basis: 'institutional rules are kept ten years' }, cites: [], related: { decisionId: null, objectiveId: null }, ...over });
const record = async (s, body) => { const r = await call(`${G}/memory/record`, as(s, scope, { purposeId: 'memory', action: 'memory.item.record', objectType: 'MEM', consequence: 'C2' }), body, s.token); if (!r.ok) { fail('record', r); process.exit(1); } return r.body.memory.itemId; };
const retrieve = (s, id, purpose = 'memory', asOf = null) => call(`${G}/memory/${id}/retrieve`, as(s, scope, { purposeId: purpose, action: 'memory.item.retrieve', objectType: 'MEM', objectId: id, sideEffect: 'none' }), asOf === null ? {} : { asOf }, s.token);
// The compositions are the ROOM's, following its latest briefing as the prior: a domain-wide (or unwindowed) composition on this
// demonstration folds to RESTRICTED — a branch of a forecast-less scenario was closed in the B9 act, and the fold treats such an
// input as restricted and synthetic (fail-closed) — so a human composer with confidential clearance is refused whole. Windowed
// on the prior, the composition carries what happened since; memory items are not windowed (standing institutional memory).
const rooms = await call(`${X}/rooms/list`, as(okafor, scope, { purposeId: 'decision', action: 'room.read', objectType: 'DRM', sideEffect: 'none' }), {}, okafor.token);
const room = (rooms.body.rooms ?? []).find((r) => r.member) ?? (rooms.body.rooms ?? [])[0];
if (!room) { bad('no decision room'); process.exit(1); }
const priorList = await call(`${X}/briefings/list`, as(okafor, scope, { purposeId: 'briefing', action: 'briefing.read', objectType: 'BRF', sideEffect: 'none' }), { roomId: room.room_id }, okafor.token);
const prior = (priorList.body.briefings ?? [])[0]?.briefing_id ?? null;
note(`the room ${short(room.room_id)} "${room.title}"; the prior briefing ${prior ? short(prior) : 'none'} (the compositions follow it)`);
const compose = (s, knownAt) => call(`${X}/briefings/compose`, as(s, scope, { purposeId: 'briefing', action: 'briefing.compose', objectType: 'BRF', consequence: 'C2' }), { roomId: room.room_id, knownAt, priorBriefingId: prior }, s.token);
const getB = (s, id, purpose = 'briefing') => call(`${X}/briefings/${id}/get`, as(s, scope, { purposeId: purpose, action: 'briefing.read', objectType: 'BRF', objectId: id, sideEffect: 'none' }), {}, s.token);
const objGet = (s, id, payload = {}) => call(`${X}/objects/${id}/get`, as(s, scope, { purposeId: 'observation', action: 'objects.read', objectType: 'MEM', objectId: id, sideEffect: 'none' }), payload, s.token);
const memoryOf = (b) => (b?.items ?? []).filter((i) => i.kind === 'memory');
const accesses = (id) => q(`select access_id::text, object_version::int v, reader_principal_id::text reader, purpose_id, correlation_id::text corr from memory.item_access where item_id = $1 order by accessed_at`, [id]);

console.log('\n=== B10 closure on the demonstration (NORDWERK, eye_demo) through the HTTP path — F1, F4, F2, F3 ===\n');
console.log('1. B10-F1 — a stored briefing serves a memory version within the cited version\'s audience only');
const R = await record(mueller, item({ title: 'Premium ceiling (executives only)', statement: 'EXECUTIVES-ONLY-B10: the premium ceiling is a quarter of the shipment value; the broker is named in the ceiling record.', source: { kind: 'human', ref: 'EXEC-ONLY-SOURCE-REF-B10' }, audience: { classification: 'internal', roles: ['executive'], purposes: ['memory', 'briefing'] } }));
const U = await record(mueller, item({}));
ok(`K. Müller recorded R ${short(R)} (audience role executive; purposes memory, briefing) and U ${short(U)} (unrestricted)`);
const c1 = await compose(okafor, await mark());
if (!c1.ok) { fail('compose (s.okafor)', c1); process.exit(1); }
const b1 = c1.body.briefing; const B1 = b1.briefingId;
const composedMem = memoryOf(b1).map((i) => i.id);
if (composedMem.includes(R) && composedMem.includes(U)) ok(`S. Okafor (executive) composed briefing ${short(B1)}: R and U read (${memoryOf(b1).length} memory item(s)); the composition returned to the composer holds R's statement: ${JSON.stringify(b1).includes('EXECUTIVES-ONLY-B10')}`); else bad(`the composer's briefing lacks R or U: ${JSON.stringify(composedMem)}`);
note(`R's access ledger: ${JSON.stringify((await accesses(R)).map((a) => ({ v: a.v, reader: a.reader === okafor.principalId ? 's.okafor' : short(a.reader), purpose: a.purpose_id })))}`);
const direct = await retrieve(brandt, R, 'briefing');
if (direct.status === 403) ok(`L. Brandt (decision owner) refused R directly: 403 ${direct.body?.message ?? ''}`); else bad(`expected 403 for L. Brandt's direct read, got ${direct.status}`);
const rd = show('L. Brandt reads the briefing (the complete response)', await getB(brandt, B1));
if (!rd.ok) fail('briefing get (l.brandt)', rd);
else {
  const text = JSON.stringify(rd.body);
  const leaks = ['EXECUTIVES-ONLY-B10', 'EXEC-ONLY-SOURCE-REF-B10', 'Premium ceiling (executives only)'].filter((t) => text.includes(t));
  if (leaks.length === 0) ok(`nothing of R in the response (statement, source reference, title absent; ${text.length} bytes)`); else bad(`R leaked through the briefing: ${leaks.join(', ')}`);
  const held = memoryOf(rd.body.briefing).find((i) => i.id === R); const open = memoryOf(rd.body.briefing).find((i) => i.id === U);
  if (held?.title === 'memory: withheld' && held?.details?.withheld === true) ok(`R is WITHHELD: title "${held.title}", reason "${held.details.reason}"`); else bad(`R not withheld: ${JSON.stringify(held)}`);
  if (typeof open?.details?.statement === 'string' && open.details.statement.startsWith('UNRESTRICTED-B10')) ok('U is served with its statement'); else bad('U not served');
  const av = rd.body.briefing.availability;
  ok(`items_withheld ${rd.body.briefing.items_withheld}; availability checked memory ${av?.checked?.memory}; unavailable ${JSON.stringify((av?.unavailable ?? []).filter((u) => u.kind === 'memory').map((u) => [short(u.id), u.version, u.reason]))}`);
  if (rd.body.briefing.content_digest === b1.contentDigest) ok('the content digest is the stored snapshot\'s, unchanged'); else bad('the digest changed on the read');
  const after = await accesses(R);
  if (after.every((a) => a.reader === okafor.principalId)) ok('L. Brandt\'s read left no access row on R (what was not served was not read)'); else bad('an access row was recorded for the withheld read');
}
console.log('\n   the controls');
const own = await getB(okafor, B1);
if (own.ok && JSON.stringify(own.body).includes('EXECUTIVES-ONLY-B10') && own.body.briefing.items_withheld === 0) ok('S. Okafor (in the audience) reads R in the briefing; nothing withheld'); else bad(`the composer's read: ${own.status} withheld ${own.body?.briefing?.items_withheld}`);
const adm = await getB(admin, B1);
if (adm.ok && JSON.stringify(adm.body).includes('EXECUTIVES-ONLY-B10')) ok('platform-admin (admitted to every audience role) reads R'); else note(`platform-admin's read: ${adm.status} ${adm.body?.message ?? ''} (an administrator may be refused the domain briefing by membership/scope rules — recorded, not claimed)`);
const wrong = await getB(brandt, B1, 'decision');
if (wrong.status === 403) ok(`the wrong purpose refused: 403 ${wrong.body?.message ?? ''}`); else bad(`expected 403 for the wrong purpose, got ${wrong.status}`);

console.log('\n2. B10-F4 — the generic object read serves the header of an audience-governed object and withholds its content');
const hd = await retrieve(hoffmann, R, 'memory');
if (hd.status === 403) ok(`A. Hoffmann (domain analyst) refused R directly: 403 ${hd.body?.message ?? ''}`); else bad(`expected 403, got ${hd.status}`);
const og = show('A. Hoffmann reads R through objects/:id/get (the complete response)', await objGet(hoffmann, R));
if (og.ok && og.body.object?.payload === null && og.body.object?.content_withheld && !JSON.stringify(og.body).includes('EXECUTIVES-ONLY-B10')) ok(`the header served (object_type ${og.body.object.object_type}, version ${og.body.object.object_version}, classification ${og.body.object.classification}); the content withheld: "${og.body.object.content_withheld.reason}"`); else bad(`the object read served content or failed: ${og.status}`);
const oh = await objGet(hoffmann, R, { history: true });
if (oh.ok && (oh.body.history ?? []).every((r) => r.payload === null) && !JSON.stringify(oh.body).includes('EXECUTIVES-ONLY-B10')) ok(`the history: ${oh.body.history.length} version(s), every payload withheld`); else bad(`the history served content: ${oh.status}`);
const ob = await objGet(hoffmann, B1);
if (ob.ok && ob.body.object?.payload === null && !JSON.stringify(ob.body).includes('EXECUTIVES-ONLY-B10') && !JSON.stringify(ob.body).includes('UNRESTRICTED-B10')) ok(`the briefing object ${short(B1)}: header served (${ob.body.object.object_type}), content withheld`); else bad(`the briefing object read served content: ${ob.status}`);
const evd = (await q(`select object_id::text id from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type = 'EVD' order by recorded_at desc limit 1`, [T, D]))[0];
const oe = await objGet(hoffmann, evd.id);
if (oe.ok && oe.body.object?.payload !== null && oe.body.object?.content_withheld === undefined) ok(`the control: evidence ${short(evd.id)} served with its payload as before`); else bad(`the evidence read changed: ${oe.status}`);

console.log('\n3. B10-F2 — one content digest for the same inputs; every access recorded');
const cut2 = await mark();
const d1 = await compose(okafor, cut2); const d2 = await compose(okafor, cut2);
if (d1.ok && d2.ok && d1.body.briefing.contentDigest === d2.body.briefing.contentDigest) ok(`two compositions at ${cut2}: one content digest ${d1.body.briefing.contentDigest.slice(0, 16)}…`); else bad(`digests differ or failed: ${d1.status}/${d2.status} ${d1.body?.briefing?.contentDigest?.slice(0, 12)} vs ${d2.body?.briefing?.contentDigest?.slice(0, 12)}`);
if (!JSON.stringify(d1.body.briefing.items).includes('access_id')) ok('no access id in the content'); else bad('an access id is in the content');
const accU = await accesses(U);
const twoNew = accU.filter((a) => a.reader === okafor.principalId);
if (twoNew.length >= 3 && new Set(twoNew.map((a) => a.access_id)).size === twoNew.length) ok(`U's ledger holds ${twoNew.length} distinct accesses by S. Okafor (the F1 composition and these two)`); else bad(`U's accesses: ${JSON.stringify(twoNew)}`);
const rd1 = await getB(okafor, d1.body.briefing.briefingId);
const ma = rd1.body?.briefing?.memory_accesses ?? [];
if (ma.some((a) => a.item_id === U) && ma.every((a) => twoNew.some((x) => x.access_id === a.access_id) || a.item_id !== U)) ok(`the read reports the composition's accesses beside the content: ${JSON.stringify(ma.map((a) => ({ item: short(a.item_id), v: a.version, access: short(a.access_id) })))}`); else bad(`memory_accesses: ${JSON.stringify(ma)}`);

console.log('\n4. B10-F3 — a composition at a cutoff takes its memory from history; present availability apart');
const H = await record(mueller, item({ title: 'Inventory buffer', statement: 'HISTORY-V1-B10: the inventory buffer is six weeks.' }));
await sleep(30); const cut3 = await mark();
const e1 = await compose(okafor, cut3);
const h1 = memoryOf(e1.body?.briefing).find((i) => i.id === H);
if (h1?.version === 1 && h1.details.statement.startsWith('HISTORY-V1-B10')) ok(`at the cutoff ${cut3}: H served as v1`); else bad(`H at the cutoff: ${JSON.stringify(h1)}`);
await sleep(30);
const sup = await call(`${G}/memory/${H}/supersede`, as(adler, scope, { purposeId: 'memory', action: 'memory.item.supersede', objectType: 'MEM', objectId: H, consequence: 'C2' }), item({ title: 'Inventory buffer', statement: 'HISTORY-V2-B10: the inventory buffer is eight weeks.', supersession: { reason: 'the buffer was raised', effectiveAt: '2024-04-01T00:00:00Z' } }), adler.token);
if (sup.ok) ok(`R. Adler superseded H → v2 (after the cutoff)`); else fail('supersede', sup);
const e2 = await compose(okafor, cut3);
const h2 = memoryOf(e2.body?.briefing).find((i) => i.id === H);
if (h2?.version === 1 && h2.details.statement.startsWith('HISTORY-V1-B10') && !JSON.stringify(e2.body.briefing.items).includes('HISTORY-V2-B10')) ok('recomposed at the SAME cutoff after the supersession: H still v1, nothing of v2'); else bad(`H after the supersession at the cutoff: ${JSON.stringify(h2)}`);
if (e2.body?.briefing?.contentDigest === e1.body?.briefing?.contentDigest) ok('the content digest at the cutoff is unchanged by the later supersession'); else bad('the digest at the cutoff changed');
const e3 = await compose(okafor, await mark());
const h3 = memoryOf(e3.body?.briefing).find((i) => i.id === H);
if (h3?.version === 2 && h3.details.statement.startsWith('HISTORY-V2-B10')) ok('composed now: H served as v2'); else bad(`H now: ${JSON.stringify(h3)}`);
const rdE1 = await getB(okafor, e1.body.briefing.briefingId);
const corr = (rdE1.body?.briefing?.availability?.corrected ?? []).filter((x) => x.kind === 'memory' && x.id === H);
if (corr.length === 1 && corr[0].by_version === 2 && JSON.stringify(rdE1.body).includes('HISTORY-V1-B10') && !JSON.stringify(rdE1.body).includes('HISTORY-V2-B10')) ok(`the earlier briefing's availability: H@1 superseded by version 2 (${corr[0].reason}); its content keeps v1`); else bad(`availability of the earlier briefing: ${JSON.stringify(corr)}`);
const asOfDirect = await retrieve(okafor, H, 'briefing', cut3);
if (asOfDirect.ok && asOfDirect.body.memory.versionServed === 1) ok('direct historical retrieval at the cutoff agrees: v1'); else bad(`direct as-of read: ${asOfDirect.status}`);

await su.end();
console.log(`\n=== ${failureCount() === 0 ? 'every closure case holds' : `${failureCount()} case(s) did not hold`} ===`);
process.exit(failureCount() === 0 ? 0 : 1);
