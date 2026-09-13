#!/usr/bin/env node
/**
 * CP-6 batch B10 on the demonstration (NORDWERK, eye_demo): the capabilities of migration 0068 and the B10 services
 * exercised by the personas through the REAL HTTP path, each scene stating the effect it produced (rows, events,
 * deliveries) and where nothing happened, saying so.
 *
 *   1. The memory WORKSPACE's routes (what /graph/memory calls): K. Müller records, lists and reads the record
 *      (no content); L. Brandt retrieves under a purpose; R. Adler WITHDRAWS a throwaway item under memory.item.withdraw — the
 *      current retrieval is refused as out of circulation (409) while the version stays replayable as of an instant;
 *      K. Müller's withdrawal (a knowledge owner) is refused.
 *   2. The AGENT's retrieval: three items — one for the briefing purpose, one for the memory purpose only, one for the
 *      briefing purpose but the knowledge owners' audience role; S. Okafor's analysis request runs the briefing agent
 *      under its own session; the briefing carries the first as a memory item and neither of the others; the access
 *      ledger names the agent as the reader under the briefing purpose.
 *   3. B9-F2 on the live graph: A. Hoffmann challenges the asserted "stocks" relationship; L. Ferreira corrects the
 *      PREDICATE to one the active vocabulary does not declare; the relationships subscriber's re-derivation is REFUSED
 *      by the builder's port, the refusal contained (savepoint) so the item's unresolved state is durable — pending
 *      reassessment, no successor; a re-drive (the administrator pauses and resumes the subscription) repeats the refusal
 *      without a second cause; J. Weber proposes the predicate (additive), O. Steiner approves; the next re-drive
 *      re-derives the edge. G2: the builder's own run afterwards reports the corrected version as superseded and
 *      asserts nothing twice.
 *   4. B9-F3: a REVIEW action on the CURRENT NORDWERK evidence — opened by P. Novák, its scope resolved by the review's
 *      preservation contract (0068 §6: current evidence reviewed in place — the rehearsal found it excluded by a deletion
 *      rule), approved by H. Bergmann on the scope digest, executed (nothing removed), VERIFIED against the same contract
 *      (the manifest untouched, its bytes present, the review recorded) — no DeletionVerified for a review.
 *
 * Idempotence: every scene creates its own new objects; scene 3 acts on the one asserted relationship edge and leaves a
 * successor (a second run challenges the successor). The script is an act, not a seed.
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
const X = `/v1/tenants/${T}/domains/${D}`;
const G = `${X}/graph`; const I = `${X}/intelligence`; const R = `${X}/retention`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (id) => `${String(id).slice(0, 8)}…`;
const who = async (login_) => { const s = await login(login_, PW); if (s === null) { bad(`${login_} could not authenticate`); process.exit(1); } return s; };
const P_ = (s, purpose) => (over) => as(s, scope, { purposeId: purpose, ...over });
const read = (path, envOver, token) => call(path, { sideEffect: 'none', ...envOver }, {}, token);
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const show = (label, r) => { note(`${label} → HTTP ${r.status}`); console.log('      ' + JSON.stringify(r.body)); return r; };
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: env.EYE_DB_NAME ?? 'eye_demo', user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const mark = async () => (await q('select clock_timestamp() t'))[0].t.toISOString();

console.log('\n=== CP-6 batch B10 · the memory workspace, the agent\'s retrieval, B9-F2/G2 and B9-F3 on the demonstration ===\n');
console.log('0. the personas (created in B9; each opens its own session)');
const mueller = await who('k.mueller'); const adler = await who('r.adler'); const brandt = await who('l.brandt'); const okafor = await who('s.okafor');
const hoffmann = await who('a.hoffmann'); const ferreira = await who('l.ferreira'); const weber = await who('j.weber'); const steiner = await who('o.steiner');
const novak = await who('p.novak'); const bergmann = await who('h.bergmann');
const km = P_(mueller, 'memory'); const ra = P_(adler, 'memory'); const lb = P_(brandt, 'memory'); const so = P_(okafor, 'briefing');
const ah = P_(hoffmann, 'intelligence'); const lf = P_(ferreira, 'intelligence'); const jw = P_(weber, 'graph'); const os = P_(steiner, 'graph'); const pn = P_(novak, 'retention');
const hb = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D, principalId: `principal:${bergmann.principalId}`, purposeId: 'retention', ...over });
const adm = (over) => as(admin, scope, { purposeId: 'platform.administration', ...over });
ok('k.mueller, r.adler, l.brandt, s.okafor, a.hoffmann, l.ferreira, j.weber, o.steiner, p.novak, h.bergmann authenticated');

const item = (over) => ({ recordClass: 'institutional', title: 'B10 act item', statement: 'B10: the rebooking rule holds for the March shipments.', source: { kind: 'human', ref: 'decision room, March 2024 (B10 act)' },
  audience: { classification: 'internal', roles: [], purposes: ['memory', 'graph'] }, validity: { from: '2024-03-01T00:00:00Z', to: null },
  retention: { profile: 'institutional-record-10y', retainUntil: '2034-03-01T00:00:00Z', basis: 'institutional rules are kept ten years' }, cites: [], related: { decisionId: null, objectiveId: null }, ...over });
const record = (s, p, body) => call(`${G}/memory/record`, as(s, scope, { purposeId: p, action: 'memory.item.record', objectType: 'MEM', consequence: 'C2' }), body, s.token);
const retrieve = (s, id, purpose, asOf = null) => call(`${G}/memory/${id}/retrieve`, as(s, scope, { purposeId: purpose, action: 'memory.item.retrieve', objectType: 'MEM', objectId: id, sideEffect: 'none' }), asOf === null ? {} : { asOf }, s.token);
const withdraw = (s, id, reason) => call(`${G}/memory/${id}/withdraw`, as(s, scope, { purposeId: 'memory', action: 'memory.item.withdraw', objectType: 'MEM', objectId: id, consequence: 'C2' }), { reason }, s.token);

/* ── 1. the workspace's routes ─────────────────────────────────────────── */
console.log('\n1. the memory workspace\'s routes (what /graph/memory calls) — record, list, get, retrieve, withdraw');
{
  const r1 = await record(mueller, 'memory', item({ title: 'March rebooking rule (B10 act, scene 1)' }));
  if (!r1.ok) fail('record (k.mueller)', r1);
  else {
    const id = r1.body.memory.itemId; ok(`K. Müller recorded ${short(id)} v1 (internal; purposes memory, graph)`);
    const list = await read(`${G}/memory/list`, km({ action: 'graph.read', objectType: 'MEM' }), mueller.token);
    const row = (list.body.memory ?? []).find((x) => x.item_id === id);
    if (row === undefined) fail('list (k.mueller)', list);
    else ok(`the workspace's list (K. Müller) shows it: state ${row.state}, version ${row.object_version}, classification ${row.classification}, purposes ${JSON.stringify(row.audience_purposes ?? row.purposes ?? null)}; the row carries no statement: ${JSON.stringify(row).includes('rebooking rule holds') ? 'FALSE (content leaked into the listing)' : 'true'}`);
    const get = await read(`${G}/memory/${id}/get`, km({ action: 'graph.read', objectType: 'MEM', objectId: id }), mueller.token);
    if (!get.ok) fail('get (k.mueller)', get);
    else ok(`the record: ${get.body.events?.length ?? 0} event(s), ${get.body.access?.length ?? 0} access row(s); no content in the record: ${JSON.stringify(get.body).includes('rebooking rule holds') ? 'FALSE' : 'true'}`);
    const rt = await retrieve(brandt, id, 'memory');
    if (!rt.ok) fail('retrieve (l.brandt, purpose memory)', rt);
    else ok(`L. Brandt retrieved under the memory purpose: version ${rt.body.memory.versionServed} served; availability ${JSON.stringify(rt.body.memory.availability)}; access ${short(rt.body.memory.accessId)}`);
    const rtg = await retrieve(brandt, id, 'briefing');
    if (rtg.status === 403 || rtg.status === 404) ok(`the same read under the BRIEFING purpose (not in the item's audience) refused: ${rtg.status} ${rtg.body?.message ?? ''}`); else bad(`a purpose outside the audience was served: ${rtg.status}`);
  }
  // the WITHDRAWAL (memory.item.withdraw): a throwaway item, the record authority's act; the knowledge owner refused
  const r2 = await record(mueller, 'memory', item({ title: 'Throwaway (B10 act, withdrawn)', statement: 'B10: a rule recorded in error — withdrawn in the same act.' }));
  if (!r2.ok) fail('record the throwaway', r2);
  else {
    const id = r2.body.memory.itemId; ok(`K. Müller recorded the throwaway ${short(id)}`);
    const before = await mark();
    const wko = await withdraw(mueller, id, 'the knowledge owner withdrawing their own item');
    if (wko.status === 403) ok(`K. Müller's withdrawal refused (403: ${wko.body?.message ?? ''}) — withdrawal is the record authority's`); else bad(`expected 403 for the knowledge owner's withdrawal, got ${wko.status}`);
    const w = await withdraw(adler, id, 'recorded in error; out of circulation');
    if (!w.ok) fail('withdraw (r.adler)', w);
    else {
      ok(`R. Adler withdrew it under memory.item.withdraw: ${JSON.stringify(w.body.memory)}`);
      const cur = show('the current retrieval after the withdrawal (L. Brandt)', await retrieve(brandt, id, 'memory'));
      if (cur.status === 409 && cur.body?.code === 'EYE-STA-003') ok('refused 409 EYE-STA-003 (truth_state_prohibited): out of circulation, replayable as of an instant'); else bad(`expected 409 EYE-STA-003, got ${cur.status} ${cur.body?.code ?? ''}`);
      const asOf = show(`the same item as of ${before} (before the withdrawal)`, await retrieve(brandt, id, 'memory', before));
      if (asOf.ok && asOf.body.memory.versionServed === 1) ok(`v1 served as of the instant; availability state ${asOf.body.memory.availability.state}`); else bad(`the as-of read did not serve v1: ${asOf.status}`);
      const ev = await q(`select event, details ->> 'reason' reason from memory.item_events where item_id = $1 order by occurred_at`, [id]);
      note(`the item's events: ${ev.map((e) => `${e.event}${e.reason ? ` (${e.reason})` : ''}`).join(' → ')}`);
    }
  }
}

/* ── 2. the agent's retrieval ──────────────────────────────────────────── */
console.log('\n2. the AGENT\'s retrieval — S. Okafor\'s analysis request runs the briefing agent; the briefing carries the memory item the agent may read under the briefing purpose, and only that');
{
  const rA = await record(mueller, 'memory', item({ title: 'Rebooking rule for the briefing (B10 act, A)', statement: 'B10-A: rebook within 48 hours of a corridor warning; the premium ceiling is a quarter of the shipment value.', audience: { classification: 'internal', roles: [], purposes: ['memory', 'briefing'] } }));
  const rB = await record(mueller, 'memory', item({ title: 'Memory-purpose only (B10 act, B)', statement: 'B10-B: NOT FOR BRIEFINGS — the broker shortlist is kept for the memory purpose only.', audience: { classification: 'internal', roles: [], purposes: ['memory'] } }));
  const rC = await record(mueller, 'memory', item({ title: 'Knowledge owners only (B10 act, C)', statement: 'B10-C: KNOWLEDGE OWNERS ONLY — the ceiling review of February is theirs to brief.', audience: { classification: 'internal', roles: ['knowledge_owner'], purposes: ['memory', 'briefing'] } }));
  if (!rA.ok || !rB.ok || !rC.ok) { fail('record A', rA); fail('record B', rB); fail('record C', rC); }
  else {
    const A = rA.body.memory.itemId; const B = rB.body.memory.itemId; const C = rC.body.memory.itemId;
    ok(`recorded A ${short(A)} (purposes memory, briefing), B ${short(B)} (memory only), C ${short(C)} (briefing, audience role knowledge_owner)`);
    const rooms = await read(`${X}/rooms/list`, so({ action: 'room.read', objectType: 'DRM', purposeId: 'decision' }), okafor.token);
    const room = (rooms.body.rooms ?? []).find((r) => r.member) ?? (rooms.body.rooms ?? [])[0];
    if (!room) bad('no decision room');
    else {
      const since = await mark();
      const key = `b10-${new Date().toISOString().slice(0, 19)}`;
      const a1 = await call(`${X}/executive/requests`, so({ action: 'executive.request', objectType: 'EXR', consequence: 'C2' }), { kind: 'analysis', request_key: `${key}-brief`, subject: { object_type: 'DRM', object_id: room.room_id, task: 'briefing' }, instruction: 'brief the room on the corridor with what the institution remembers' }, okafor.token);
      if (!a1.ok) fail('analysis request', a1);
      else {
        const run = a1.body.run;
        ok(`analysis request ${short(a1.body.request.request_id)} → the briefing agent ran under its own session: run ${run ? `${short(run.run_id)} ${run.outcome}` : 'none'}; request ${a1.body.request.state}`);
        const runRow = run ? (await q(`select principal_id::text, outputs from executive.agent_runs where run_id = $1`, [run.run_id]))[0] : null;
        const briefingId = runRow?.outputs?.briefing_id ?? runRow?.outputs?.briefingId ?? (await q(`select briefing_id::text from executive.briefings where tenant_id = $1 and domain_id = $2 and composed_via = 'agent' and composed_at >= $3 order by composed_at desc limit 1`, [T, D, since]))[0]?.briefing_id ?? null;
        if (briefingId === null) bad('no agent-composed briefing after the request');
        else {
          const b = await read(`${X}/briefings/${briefingId}/get`, so({ action: 'briefing.read', objectType: 'BRF', objectId: briefingId }), okafor.token);
          if (!b.ok) fail('briefing get (s.okafor)', b);
          else {
            const items = b.body.briefing?.items ?? [];
            const mem = items.filter((i) => i.kind === 'memory');
            const has = (id) => mem.some((i) => i.ref === id || i.item_id === id || i.details?.item_id === id || JSON.stringify(i).includes(id));
            ok(`S. Okafor reads briefing ${short(briefingId)} (composed via ${b.body.briefing?.composed_via}, ${items.length} item(s), ${mem.length} of kind memory)`);
            for (const m of mem) note(`  memory item: ${JSON.stringify({ title: m.title, ref: m.ref ?? m.item_id ?? null, read_under: m.details?.read_under, classification: m.details?.classification, statement: m.details?.statement })}`);
            if (has(A)) ok('A (briefing purpose) is in the briefing with its statement'); else bad('A is missing from the briefing');
            if (!has(B) && !JSON.stringify(b.body).includes('NOT FOR BRIEFINGS')) ok('B (memory purpose only) is NOT in the briefing'); else bad('B leaked into the briefing');
            if (!has(C) && !JSON.stringify(b.body).includes('KNOWLEDGE OWNERS ONLY')) ok('C (knowledge owners\' audience) is NOT in the briefing'); else bad('C leaked into the briefing');
            const access = await q(`select item_id::text, object_version, purpose_id, reader_principal_id::text reader, read_as_of from memory.item_access where item_id in ($1, $2, $3) order by accessed_at`, [A, B, C]);
            const agentReads = access.filter((x) => x.reader === runRow?.principal_id);
            note(`memory.item_access for A/B/C: ${access.length} row(s) — ${access.map((x) => `${x.item_id === A ? 'A' : x.item_id === B ? 'B' : 'C'}@${x.object_version} under ${x.purpose_id} by ${x.reader === runRow?.principal_id ? 'the agent' : short(x.reader)}`).join('; ') || 'none'}`);
            if (agentReads.length === 1 && agentReads[0].item_id === A && agentReads[0].purpose_id === 'briefing') ok(`the agent's read is on the ledger: A@${agentReads[0].object_version} under the briefing purpose, reader ${short(runRow.principal_id)} (the agent's own principal)`); else bad(`expected exactly one agent read of A under briefing, got ${JSON.stringify(agentReads)}`);
          }
        }
      }
    }
  }
}

/* ── 3. B9-F2 and G2 on the live graph ─────────────────────────────────── */
console.log('\n3. B9-F2: a correction the builder\'s port refuses — the unresolved state durable, the re-drive without a duplicate cause, the person\'s repair, the re-derivation; G2: the builder\'s run afterwards');
{
  const deliveryOf = async (eventId) => (await read(`${G}/subscriptions/deliveries/${eventId}/get`, jw({ action: 'graph.read', objectType: 'SUB', objectId: eventId }), weber.token)).body;
  const relOf = async (eventId) => ((await deliveryOf(eventId)).deliveries ?? []).find((d) => d.consumer_kind === 'relationships') ?? null;
  const untilRel = async (eventId, pred, seconds = 120) => { for (let i = 0; i < seconds; i += 1) { const d = await relOf(eventId); if (d !== null && pred(d)) { await sleep(1500); return (await relOf(eventId)) ?? d; } await sleep(1000); } return relOf(eventId); };
  const newestOutbox = async (eventType, notBefore, where = () => true, seconds = 60) => {
    for (let i = 0; i < seconds; i += 1) {
      const rows = await q(`select id::text, status, payload from objects.object_outbox where event_type = $1 and tenant_id = $2 and domain_id = $3 and created_at >= $4 order by created_at desc`, [eventType, T, D, new Date(notBefore)]);
      const hit = rows.find((r) => where(r.payload)); if (hit !== undefined && hit.status === 'published') return hit; await sleep(1000);
    }
    return null;
  };
  const edgeRow = async (id) => (await q(`select edge_id::text, predicate, state, claim_version::int, superseded_by::text, reassessment_state, reassessment_outcome, reassessment_cause_id::text, jsonb_array_length(coalesce(reassessment_causes, '[]'::jsonb))::int causes, asserted_by::text from graph.edges_current where edge_id = $1`, [id]))[0];
  const st = (await read(`${G}/subscriptions/status`, jw({ action: 'graph.read', objectType: 'SUB' }), weber.token)).body.subscriptions;
  const relSub = (st?.subscriptions ?? []).find((x) => x.consumer_kind === 'relationships' && x.status === 'active') ?? null;
  const edge = (await q(`select e.edge_id::text, e.claim_object_id::text claim_id, e.claim_version::int, e.predicate, (select canonical_name from graph.entities_current x where x.entity_id = e.subject_entity_id) subject, (select canonical_name from graph.entities_current x where x.entity_id = e.object_entity_id) object
    from graph.edges_current e join objects.canonical_objects c on c.object_id = e.claim_object_id and c.object_version = e.claim_version and c.object_type = 'REL'
    where e.tenant_id = $1 and e.domain_id = $2 and e.state = 'asserted' order by e.asserted_at desc limit 1`, [T, D]))[0] ?? null;
  const active = (await q(`select version_id::text, version, entity_types, predicates from graph.ontology_versions where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]))[0] ?? null;
  const declared = (active?.predicates ?? []).map((p) => p.predicate);
  const NEW_PREDICATE = 'procures';
  if (relSub === null) bad('the relationships subscription is not active');
  else if (edge === null) bad('no asserted relationship edge to challenge');
  else if (declared.includes(NEW_PREDICATE)) bad(`the active vocabulary (version ${active.version}) already declares ${NEW_PREDICATE}; the scene needs an undeclared predicate`);
  else {
    note(`the edge ${short(edge.edge_id)}: ${edge.subject} ${edge.predicate} ${edge.object} (claim ${short(edge.claim_id)}@${edge.claim_version}); the active vocabulary version ${active.version} declares ${declared.join(', ')} — not ${NEW_PREDICATE}; the relationships subscription ${short(relSub.subscription_id)} is active`);
    const since = await mark();
    const ch = await call(`${I}/review/request`, ah({ action: 'intelligence.review.request', objectType: 'REV' }), { claimObjectId: edge.claim_id, claimVersion: edge.claim_version, reason: `the March purchase ledger shows NORDWERK PROCURES ${edge.object} from the bridge supplier; it does not stock it — the predicate is challenged` }, hoffmann.token);
    if (!ch.ok) fail('challenge (a.hoffmann)', ch);
    else {
      ok(`A. Hoffmann challenged claim ${short(edge.claim_id)}@${edge.claim_version}: review case ${short(ch.body.review.caseId)} queued`);
      const dec = await call(`${I}/review/${ch.body.review.caseId}/decide`, lf({ action: 'intelligence.review.decide', objectType: 'REV', objectId: ch.body.review.caseId, consequence: 'C2' }),
        { decision: 'correct', reason: `the purchase ledger is the better source: the relationship is ${NEW_PREDICATE}`, correctedValue: { predicate: NEW_PREDICATE } }, ferreira.token);
      if (!dec.ok) fail('decide (l.ferreira)', dec);
      else {
        const v = dec.body.review.newVersion;
        ok(`L. Ferreira corrected the claim → version ${v} (predicate ${NEW_PREDICATE}); the review case ${dec.body.review.state}`);
        const ev = await newestOutbox('MemoryCorrected', Date.parse(since) - 1000, (p) => p.change?.kind === 'claim.corrected' && (p.claims ?? []).includes(edge.claim_id));
        if (ev === null) bad('no MemoryCorrected/claim.corrected row published');
        else {
          ok(`MemoryCorrected/claim.corrected published (${short(ev.id)})`);
          const d1 = await untilRel(ev.id, (d) => d.state !== 'received' && d.state !== 'started');
          if (d1 === null) bad('no relationships delivery');
          else {
            note(`delivery: state ${d1.state}, failure class ${d1.failure_class}, disposition ${d1.disposition}, deliveries ${d1.deliveries}, last_error ${JSON.stringify(d1.last_error ?? null)}`);
            for (const u of d1.items_unresolved ?? []) note(`  unresolved: ${u.item} ${u.effect} (checks ${u.checks}) — ${u.reason}`);
            const e1 = await edgeRow(edge.edge_id);
            const refused = d1.state === 'unresolved' && d1.failure_class === 'unresolved_dependency' && d1.disposition === 'human_review' && (d1.items_unresolved ?? []).some((u) => /not in the domain's active ontology version/.test(u.reason ?? ''));
            if (refused) ok(`REFUSED and RECORDED: the port refused predicate ${NEW_PREDICATE}; the unresolved checkpoint committed (the refusal under a savepoint — B9-F2)`); else bad(`expected an unresolved delivery with the ontology refusal, got state ${d1.state}`);
            if (e1.state === 'asserted' && e1.reassessment_state === 'pending' && e1.superseded_by === null) ok(`the edge stands ${e1.state}, reassessment ${e1.reassessment_state} (cause ${short(e1.reassessment_cause_id)}), no successor; causes ${e1.causes}`); else bad(`edge state after the refusal: ${JSON.stringify(e1)}`);
            const successors = (await q(`select count(*)::int n from graph.edges_current where claim_object_id = $1 and claim_version = $2`, [edge.claim_id, v]))[0].n;
            if (successors === 0) ok('no edge under the corrected version'); else bad(`${successors} edge(s) under the corrected version`);
            // the re-drive: the administrator pauses and resumes the subscription (graph.subscription.control is an administrator's act; a resume re-drives at once)
            const pause = await call(`${G}/subscriptions/${relSub.subscription_id}/pause`, adm({ action: 'graph.subscription.control', objectType: 'SUB', objectId: relSub.subscription_id, consequence: 'C2' }), { reason: 'B10 act: re-drive the refused re-derivation' }, admin.token);
            const resume = await call(`${G}/subscriptions/${relSub.subscription_id}/resume`, adm({ action: 'graph.subscription.control', objectType: 'SUB', objectId: relSub.subscription_id, consequence: 'C2' }), { reason: 'B10 act: re-drive the refused re-derivation' }, admin.token);
            if (!pause.ok || !resume.ok) { fail('pause', pause); fail('resume', resume); }
            else {
              const d2 = await untilRel(ev.id, (d) => d.deliveries >= 2 && d.state !== 'received' && d.state !== 'started');
              const e2 = await edgeRow(edge.edge_id);
              if (d2.state === 'unresolved' && d2.deliveries === 2 && (d2.items_unresolved?.[0]?.checks ?? 0) === 2 && e2.causes === e1.causes) ok(`the administrator paused and resumed the subscription: the re-drive repeated the refusal (deliveries ${d2.deliveries}, checks ${d2.items_unresolved[0].checks}); the edge's causes still ${e2.causes} — no duplicate cause`); else bad(`re-drive: state ${d2.state}, deliveries ${d2.deliveries}, checks ${d2.items_unresolved?.[0]?.checks}, causes ${e2.causes} (was ${e1.causes})`);
              // the repair: the vocabulary extended (additive), approved by the steward
              const preds = [...(active.predicates ?? []), { predicate: NEW_PREDICATE, subject_types: active.entity_types, object_types: active.entity_types }];
              const prop = await call(`${G}/ontology/propose`, jw({ action: 'graph.ontology.propose', objectType: 'ONT' }), { namespace: 'domain', entityTypes: active.entity_types, predicates: preds, rationale: `the corrected relationship names ${NEW_PREDICATE}, which the vocabulary lacks`, alternatives: ['re-correct the claim to a declared predicate (rejected: the ledger says procures)'] }, weber.token);
              if (!prop.ok) fail('propose (j.weber)', prop);
              else {
                const o = prop.body.ontology;
                ok(`J. Weber proposed version ${o.to_version} (${o.compatibility}) adding ${NEW_PREDICATE}`);
                const ap = await call(`${G}/ontology/${o.version_id}/decide`, os({ action: 'graph.ontology.decide', objectType: 'ONT', objectId: o.version_id, consequence: 'C2' }), { decision: 'approve', reason: 'additive; the procurement predicate is needed by the corrected claim', reviews: { domain: 'passed', governance: 'passed' } }, steiner.token);
                if (!ap.ok) fail('decide (o.steiner)', ap);
                else {
                  ok(`O. Steiner approved: version ${ap.body.ontology.version} ${ap.body.ontology.state}`);
                  const p2 = await call(`${G}/subscriptions/${relSub.subscription_id}/pause`, adm({ action: 'graph.subscription.control', objectType: 'SUB', objectId: relSub.subscription_id, consequence: 'C2' }), { reason: 'B10 act: re-drive after the vocabulary repair' }, admin.token);
                  const r2 = await call(`${G}/subscriptions/${relSub.subscription_id}/resume`, adm({ action: 'graph.subscription.control', objectType: 'SUB', objectId: relSub.subscription_id, consequence: 'C2' }), { reason: 'B10 act: re-drive after the vocabulary repair' }, admin.token);
                  if (!p2.ok || !r2.ok) { fail('pause 2', p2); fail('resume 2', r2); }
                  else {
                    const d3 = await untilRel(ev.id, (d) => d.state === 'applied' || d.deliveries >= 3 && d.state !== 'received' && d.state !== 'started');
                    const applied = (d3.items_applied ?? [])[0];
                    const e3 = await edgeRow(edge.edge_id);
                    const succ = e3.superseded_by ? await edgeRow(e3.superseded_by) : null;
                    if (d3.state === 'applied' && applied?.effect === 'edge.re_derived' && succ && succ.predicate === NEW_PREDICATE && succ.claim_version === v) ok(`REPAIRED: the third delivery re-derived the edge — ${short(edge.edge_id)} ${e3.state} (reassessment ${e3.reassessment_state}/${e3.reassessment_outcome}) → successor ${short(succ.edge_id)} ${edge.subject} ${succ.predicate} ${edge.object} under claim version ${succ.claim_version}, asserted by the subscription's principal ${short(succ.asserted_by)}; deliveries ${d3.deliveries}, unresolved ${(d3.items_unresolved ?? []).length}`);
                    else bad(`after the repair: state ${d3.state}, deliveries ${d3.deliveries}, applied ${JSON.stringify(applied ?? null)}, edge ${JSON.stringify(e3)}`);
                    // G2: the builder's own run consults the review CASE — the corrected version is superseded, the successor's version already built; nothing asserted twice
                    const builder = await login('k.adeyemi', env.EYE_OPERATOR_PASSWORD ?? PW);
                    if (builder === null) note('G2: the builder\'s operator (k.adeyemi) could not authenticate with the shared credential; the run is not exercised here (the harness proves it)');
                    else {
                      const before = (await q(`select count(*)::int n from graph.edges_current where tenant_id = $1 and domain_id = $2`, [T, D]))[0].n;
                      const run = await call(`${G}/edges/build`, as(builder, scope, { purposeId: 'graph', action: 'graph.edge.assert', objectType: 'EDG' }), { limit: 300 }, builder.token);
                      if (!run.ok) fail('edges/build (k.adeyemi)', run);
                      else {
                        const x = run.body.edgeBuild;
                        const after = (await q(`select count(*)::int n from graph.edges_current where tenant_id = $1 and domain_id = $2`, [T, D]))[0].n;
                        const sk = (x.skipped ?? []).filter((k) => k.claimObjectId === edge.claim_id);
                        ok(`G2 — the builder's run (k.adeyemi): ${x.edgesAsserted} edge(s) asserted; ${x.relClaimsRead} claim(s) whose current version still awaited an edge (the successor under version ${v} is already the consumer's); edges ${before} → ${after}; skipped: ${sk.map((k) => `v${k.claimVersion ?? '?'}: ${k.reason}`).join(' | ') || 'none'}`);
                        if (x.edgesAsserted === 0 && after === before) ok('nothing asserted twice — the run is idempotent per claim version, the review case consulted'); else bad(`the run asserted ${x.edgesAsserted}`);
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
}

/* ── 4. B9-F3: the review action verified against its preservation contract ─ */
console.log('\n4. B9-F3: a REVIEW action on the current NORDWERK evidence — executed (nothing removed) and VERIFIED against its preservation contract; no DeletionVerified');
{
  const target = (await q(`select o.object_id::text id, o.object_version::int version, (o.payload ->> 'manifest_id') manifest_id, o.retention_profile, m.byte_length, m.locator, s.source_key
    from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid join observation.source_contracts_current s on s.source_id = m.source_id
    where o.object_type = 'EVD' and o.tenant_id = $1 and o.domain_id = $2 and o.lifecycle_state = 'admitted' and m.legal_hold = false
      and not exists (select 1 from observation.blob_tombstones t where t.manifest_id = m.manifest_id)
      and o.object_version = (select max(x.object_version) from objects.canonical_objects x where x.object_id = o.object_id)
    order by o.recorded_at desc limit 1`, [T, D]))[0] ?? null;
  if (target === null) bad('no current evidence manifest to review');
  else {
    note(`the target: the CURRENT evidence ${short(target.id)}@${target.version} (${target.source_key}, profile "${target.retention_profile}", ${target.byte_length} bytes at manifest ${short(target.manifest_id)}) — to be kept`);
    const since = await mark();
    const o = await call(`${R}/actions/open`, pn({ action: 'retention.action.open', objectType: 'RTA' }), { kind: 'review', targetKind: 'evidence', selector: { manifestId: target.manifest_id }, retentionProfile: target.retention_profile, reason: 'the current PortWatch version is due for its periodic review; it is kept' }, novak.token);
    if (!o.ok) fail('open review (p.novak)', o);
    else {
      const id = o.body.action.actionId; ok(`P. Novák opened review action ${short(id)} (${o.body.action.state})`);
      const rs = await call(`${R}/actions/${id}/resolve`, pn({ action: 'retention.action.resolve', objectType: 'RTA', objectId: id }), {}, novak.token);
      if (!rs.ok) fail('resolve', rs);
      else {
        const sc = rs.body.scope; ok(`scope resolved: ${sc.items} item(s), ${sc.execute} to execute, ${sc.held} held; digest ${String(sc.scope_digest ?? '').slice(0, 12)}…`);
        const ap = await call(`${R}/actions/${id}/approve`, hb({ action: 'retention.action.approve', objectType: 'RTA', objectId: id, consequence: 'C2' }), { scopeDigest: sc.scope_digest, rationale: 'a review keeps the record; approved on the scope digest' }, bergmann.token);
        if (!ap.ok) fail('approve (h.bergmann)', ap);
        else {
          ok('H. Bergmann approved on the scope digest');
          const ex = await call(`${R}/actions/${id}/execute`, pn({ action: 'retention.action.execute', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, novak.token);
          if (!ex.ok) fail('execute (p.novak)', ex);
          else {
            const e = ex.body.execution;
            const execs = await q(`select port, outcome from retention.executions where action_id = $1`, [id]);
            const tomb = (await q(`select count(*)::int n from observation.blob_tombstones where manifest_id = $1`, [target.manifest_id]))[0].n;
            ok(`executed: ${e.executed} reviewed, ${e.refused} refused; executions ${JSON.stringify(execs)}; tombstones on the manifest ${tomb}; bytes removed ${e.bytes?.removed?.length ?? 0}`);
            const vf = await call(`${R}/actions/${id}/verify`, pn({ action: 'retention.action.verify', objectType: 'RTA', objectId: id }), {}, novak.token);
            if (!vf.ok) fail('verify', vf);
            else {
              const v = vf.body.verification;
              const checks = await q(`select check_name, expected, observed, passed from retention.verifications where action_id = $1`, [id]);
              ok(`verified: state ${v.state}, verified ${v.verified}; the check(s) from the ledger:`);
              for (const c of checks) note(`  ${c.passed ? 'PASS' : 'FAIL'} ${c.check_name} — expected ${JSON.stringify(c.expected)}, observed ${JSON.stringify(c.observed)}`);
              const contractual = checks.length === 1 && /reviewed — untouched, its bytes present/.test(checks[0].check_name) && checks[0].passed === true && checks[0].observed?.bytes_present === true && checks[0].observed?.tombstone === false;
              if (contractual) ok('B9-F3: the review was verified against its PRESERVATION contract (untouched, bytes present, reviewed) — not against deletion criteria'); else bad('the review\'s verification did not follow the preservation contract');
              await sleep(1500);
              const dv = (await q(`select count(*)::int n from objects.object_outbox where event_type = 'DeletionVerified' and tenant_id = $1 and domain_id = $2 and created_at >= $3 and payload ->> 'action_id' = $4`, [T, D, since, id]))[0].n;
              if (dv === 0) ok('no DeletionVerified published for the review'); else bad(`${dv} DeletionVerified row(s) for a review action`);
              const st = (await q(`select state from retention.actions_current where action_id = $1`, [id]))[0].state;
              const still = (await q(`select count(*)::int n from observation.blob_manifests where manifest_id = $1 and legal_hold = false`, [target.manifest_id]))[0].n;
              note(`the action reads ${st}; the manifest row stands (${still}); the current evidence version is untouched`);
            }
          }
        }
      }
    }
  }
}

await su.end();
console.log(`\n=== ${failureCount() === 0 ? 'the act completed with every scene producing its effect' : `${failureCount()} scene step(s) did not produce the effect claimed`} ===`);
process.exit(failureCount() === 0 ? 0 : 1);
