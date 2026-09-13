#!/usr/bin/env node
/**
 * CP-6 batch B9 on the demonstration (NORDWERK, eye_demo): the capabilities of migration 0066 exercised by the personas,
 * each scene stating the REAL effect it produced (rows, events, deliveries) and where nothing happened, saying so.
 *
 *   1. A memory item (K. Müller records; L. Brandt retrieves under a purpose, the access audited; R. Adler supersedes;
 *      the prior version replayed as of an instant).
 *   2. A challenge on an admitted relationship claim (A. Hoffmann) decided by L. Ferreira with a correction — the
 *      relationships subscriber re-derives the inferred edge through the builder's run (or reports why it could not).
 *   3. The NORDWERK records method evaluated by L. Ferreira (TransformationEvaluated) from the ledgers.
 *   4. The domain vocabulary versioned: J. Weber proposes the predicates the graph asserts; O. Steiner (ontology
 *      steward) approves; a breaking proposal removing a predicate in use is refused while the edges stand.
 *   5. Governed retention: a deletion action on the superseded NORDWERK upload versions opened by P. Novák (steward),
 *      its scope resolved (holds honoured), approved by H. Bergmann (retention authority) on the scope digest, executed
 *      by the steward (bytes tombstoned and removed), verified (DeletionVerified with the residual inventory).
 *   6. A scenario reviewed by N. Eriksen: a dissent, a promotion to simulation, a retirement — and T. Nakamura's run
 *      on the retired branch refused.
 *   7. S. Okafor's typed executive requests: analysis (the briefing agent runs under its own session), suppression of
 *      the corridor warning until the booking deadline, a follow-up owned by L. Brandt, a delegation to M. Dvořák, the
 *      same analysis request repeated (exactly once), a scenario request that N. Eriksen's declaration fulfils.
 *
 * Idempotence: the personas are created once (a 409 logs them in); every scene creates its own new objects, so a second
 * run adds a second set — the script is an act, not a seed.
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
const G = `${X}/graph`; const I = `${X}/intelligence`; const R = `${X}/retention`; const P = `${X}/prediction`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const short = (id) => `${String(id).slice(0, 8)}…`;
const adm = (over) => as(admin, scope, { purposeId: 'platform.administration', ...over });
const who = async (login_) => { const s = await login(login_, PW); if (s === null) { bad(`${login_} could not authenticate`); process.exit(1); } return s; };

// Principal listing is not granted to the administrator: create, and on 409 log in — a persona is reused only when its own credential opens its session.
async function ensureHuman(loginName, displayName, roleCode, tenantScoped = false) {
  const r = await call(`/v1/tenants/${T}/principals`, { scope: 'TENANT', tenantId: T, action: 'identity.principal.create', objectType: 'PRN', principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration' },
    { kind: 'human', displayName, loginName, password: PW, roleCode, ...(tenantScoped ? {} : { domainId: D }) }, admin.token);
  if (r.ok) { ok(`${displayName} created (${roleCode}${tenantScoped ? ', tenant scope' : ''})`); return login(loginName, PW); }
  if (r.status !== 409) { bad(`could not create ${displayName}: ${r.status} ${r.body?.message ?? ''}`); return null; }
  const s = await login(loginName, PW);
  if (s === null) { bad(`${loginName} exists but does not open a session with the demonstration credential — a different persona; refusing to reuse it`); return null; }
  ok(`${displayName} present (${roleCode})`); return s;
}

console.log('\n=== CP-6 batch B9 · the 0066 capabilities on the demonstration ===\n');
console.log('0. the personas');
const weber = await who('j.weber'); const eriksen = await who('n.eriksen'); const nakamura = await who('t.nakamura'); const brandt = await who('l.brandt');
const okafor = await who('s.okafor'); const hoffmann = await who('a.hoffmann'); const dvorak = await who('m.dvorak'); const ferreira = await who('l.ferreira');
const mueller = await ensureHuman('k.mueller', 'K. Müller — knowledge owner', 'knowledge_owner');
const adler = await ensureHuman('r.adler', 'R. Adler — record authority', 'record_authority');
const novak = await ensureHuman('p.novak', 'P. Novák — retention steward', 'retention_steward');
const bergmann = await ensureHuman('h.bergmann', 'H. Bergmann — retention authority', 'retention_authority', true);
const steiner = await ensureHuman('o.steiner', 'O. Steiner — ontology steward', 'ontology_steward');
if (!mueller || !adler || !novak || !bergmann || !steiner) process.exit(1);
const P_ = (s, purpose) => (over) => as(s, scope, { purposeId: purpose, ...over });
const km = P_(mueller, 'memory'); const ra = P_(adler, 'memory'); const lb = P_(brandt, 'decision'); const pn = P_(novak, 'retention'); const hb = (over) => ({ scope: 'DOMAIN', tenantId: T, domainId: D, principalId: `principal:${bergmann.principalId}`, purposeId: 'retention', ...over });
const os = P_(steiner, 'graph'); const jw = P_(weber, 'graph'); const ah = P_(hoffmann, 'intelligence'); const lf = P_(ferreira, 'intelligence'); const ne = P_(eriksen, 'prediction'); const tn = P_(nakamura, 'twin'); const so = P_(okafor, 'decision'); const md = P_(dvorak, 'decision');
const read = (path, envOver, token) => call(path, { sideEffect: 'none', ...envOver }, {}, token);
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: env.EYE_DB_NAME ?? 'eye_demo', user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
// The subscription deliveries of an outbox event, through the status route (the strategy owner's read).
const deliveryOf = async (eventId) => (await read(`${G}/subscriptions/deliveries/${eventId}/get`, jw({ action: 'graph.read', objectType: 'SUB', objectId: eventId }), weber.token)).body;
const showDeliveries = (ds) => {
  for (const d of ds) note(`${d.consumer_kind.padEnd(16)} ${d.state.padEnd(10)} items ${JSON.stringify(d.items)} → ${(d.items_applied ?? []).map((x) => `${x.effect}${x.details?.successor_edge_id ? ` (successor ${short(x.details.successor_edge_id)})` : ''}`).join(', ') || '(nothing to do)'}${(d.items_unresolved ?? []).length > 0 ? `; unresolved ${JSON.stringify(d.items_unresolved.map((u) => u.reason ?? u))}` : ''}${d.last_error ? ` — ${d.last_error}` : ''}`);
  const worked = ds.filter((d) => (d.items ?? []).length > 0).map((d) => d.consumer_kind);
  note(`non-empty work: ${worked.length === 0 ? 'none' : worked.join(', ')}; no work (nothing of theirs reached): ${ds.filter((d) => (d.items ?? []).length === 0).map((d) => d.consumer_kind).join(', ') || 'none'}`);
};
async function settled(eventId, seconds = 90) {
  let ds = [];
  for (let i = 0; i < seconds; i += 1) {
    ds = (await deliveryOf(eventId)).deliveries ?? [];
    if (ds.length > 0 && ds.every((d) => ['applied', 'failed', 'refused'].includes(d.state))) { await sleep(1500); const again = (await deliveryOf(eventId)).deliveries ?? []; if (again.length === ds.length) return again; }
    await sleep(1000);
  }
  return ds;
}
const newestOutbox = async (eventType, notBefore, where = () => true, seconds = 60) => {
  for (let i = 0; i < seconds; i += 1) {
    const rows = await q(`select id::text, status, payload, created_at from objects.object_outbox where event_type = $1 and tenant_id = $2 and domain_id = $3 and created_at >= $4 order by created_at desc`, [eventType, T, D, new Date(notBefore)]);
    const hit = rows.find((r) => where(r.payload));
    if (hit !== undefined && hit.status === 'published') return hit;
    await sleep(1000);
  }
  return null;
};
// The inventory record: the evidence the `stocks` relationship claim was derived from (its lineage); the latest version of it.
const inventoryEvd = (await q(`select l.evidence_object_id::text id, (select max(object_version)::int from objects.canonical_objects x where x.object_id = l.evidence_object_id) version
  from intelligence.claim_lineage l join objects.canonical_objects c on c.object_id = l.claim_object_id and c.object_version = l.claim_version
  where c.tenant_id = $1 and c.domain_id = $2 and c.object_type = 'REL' and c.payload ->> 'predicate' = 'stocks' order by c.recorded_at desc limit 1`, [T, D]))[0] ?? null;
const asuCorridor = (await q(`select s.strategy_object_id::text id, s.title from graph.strategy_current s where s.tenant_id = $1 and s.domain_id = $2 and s.object_type = 'ASU' and s.title ilike '%corridor stays open%' limit 1`, [T, D]))[0] ?? null;
note(`the inventory record ${inventoryEvd ? `${short(inventoryEvd.id)}@${inventoryEvd.version}` : 'NOT FOUND'}; the corridor assumption ${asuCorridor ? `${short(asuCorridor.id)} "${asuCorridor.title}"` : 'NOT FOUND'}`);

/* ── 0b. the seventh subscriber (B9's relationships consumer) reconciled, as register-subscriptions.mjs step 1 does ── */
{
  const st = (await read(`${G}/subscriptions/status`, jw({ action: 'graph.read', objectType: 'SUB' }), weber.token)).body.subscriptions;
  const live = (st?.subscriptions ?? []).find((x) => x.consumer_kind === 'relationships' && x.status === 'active');
  if (live !== undefined) ok(`relationships: subscription ${short(live.subscription_id)} already active`);
  else {
    const r = await call(`${G}/subscriptions/register`, adm({ action: 'graph.subscription.register', objectType: 'SUB', consequence: 'C2' }),
      { consumerKind: 'relationships', ownerPrincipalId: weber.principalId, backlog: 'leave', eventTypes: ['MemoryCorrected'], filter: { change_kinds: ['claim.corrected'] } }, admin.token);
    if (!r.ok) fail('register relationships', r); else ok(`relationships: registered subscription ${short(r.body.subscription.subscriptionId)} (role ${r.body.subscription.role}; MemoryCorrected/claim.corrected only); worker running ${r.body.served.workerRunning}`);
  }
  const consumers = (st?.consumers ?? []).filter((c) => c.registeredInThisProcess).map((c) => c.kind);
  note(`consumers registered in this process: ${consumers.join(', ')}`);
}

/* ── 1. the memory item ─────────────────────────────────────────────────── */
console.log('\n1. a memory item — recorded, retrieved under a purpose, superseded, replayed');
let memId = null;
{
  const cites = [];
  if (asuCorridor) cites.push({ kind: 'strategy', id: asuCorridor.id, rationale: 'the rule rests on the corridor assumption the strategy declares' });
  if (inventoryEvd) cites.push({ kind: 'evidence', id: inventoryEvd.id, version: inventoryEvd.version, rationale: 'the stock level the rebooking threshold was set from was read from this inventory record' });
  const r = await call(`${G}/memory/record`, km({ action: 'memory.item.record', objectType: 'MEM', consequence: 'C2' }), {
    recordClass: 'institutional', title: 'Rebooking rule for the Regensburg magnet line',
    statement: 'When the corridor warning is raised and stock of SYN-PART-MAG covers fewer than 14 days, the third shipment is rebooked via the Cape within 48 hours; the premium is accepted up to a third of the shipment value.',
    source: { kind: 'human', ref: 'decision room, January 2024 (K. Müller)' }, audience: { classification: 'internal', roles: [], purposes: ['memory', 'decision', 'graph'] },
    validity: { from: '2024-01-17T00:00:00Z', to: null }, retention: { profile: 'institutional-record-10y', retainUntil: '2034-01-17T00:00:00Z', basis: 'institutional rules are kept ten years' },
    cites, related: { decisionId: null, objectiveId: null } }, mueller.token);
  if (!r.ok) fail('record', r); else { memId = r.body.memory.itemId; ok(`K. Müller recorded memory item ${short(memId)} v${r.body.memory.version} citing ${r.body.memory.cites} object(s) (MEM@v1 canonical version, retention institutional-record-10y)`); }
  if (memId) {
    const g = await call(`${G}/memory/${memId}/retrieve`, lb({ action: 'memory.item.retrieve', objectType: 'MEM', objectId: memId, sideEffect: 'none' }), {}, brandt.token);
    if (!g.ok) fail('retrieve (l.brandt, purpose decision)', g); else ok(`L. Brandt retrieved v${g.body.memory.versionServed} under purpose decision — access ${short(g.body.memory.accessId)} recorded in the read's own transaction`);
    const denied = await call(`${G}/memory/${memId}/retrieve`, as(brandt, scope, { purposeId: 'observation', action: 'memory.item.retrieve', objectType: 'MEM', objectId: memId, sideEffect: 'none' }), {}, brandt.token);
    if (denied.status === 403) ok(`the same item under purpose observation (not in the audience) refused: ${denied.body?.message ?? denied.status}`); else bad(`purpose refusal expected, got ${denied.status}`);
    const before = new Date().toISOString(); await sleep(50);
    const s2 = await call(`${G}/memory/${memId}/supersede`, ra({ action: 'memory.item.supersede', objectType: 'MEM', objectId: memId, consequence: 'C2' }), {
      recordClass: 'institutional', title: 'Rebooking rule for the Regensburg magnet line',
      statement: 'When the corridor warning is raised and stock of SYN-PART-MAG covers fewer than 21 days, the third shipment is rebooked via the Cape within 48 hours; the premium is accepted up to a third of the shipment value (revised after the January collapse: 14 days proved too late).',
      source: { kind: 'human', ref: 'decision room, February 2024 (R. Adler)' }, audience: { classification: 'internal', roles: [], purposes: ['memory', 'decision', 'graph'] },
      validity: { from: '2024-02-01T00:00:00Z', to: null }, retention: { profile: 'institutional-record-10y', retainUntil: '2034-01-17T00:00:00Z', basis: 'institutional rules are kept ten years' },
      cites, related: { decisionId: null, objectiveId: null }, supersession: { reason: 'the 14-day threshold proved too late in January; the rule is revised to 21 days', effectiveAt: '2024-02-01T00:00:00Z' } }, adler.token);
    if (!s2.ok) fail('supersede (r.adler)', s2); else ok(`R. Adler superseded it: v${s2.body.memory.version} (prior v${s2.body.memory.priorVersion} replayable)`);
    const asOf = await call(`${G}/memory/${memId}/retrieve`, lb({ action: 'memory.item.retrieve', objectType: 'MEM', objectId: memId, sideEffect: 'none' }), { asOf: before }, brandt.token);
    if (asOf.ok && asOf.body.memory.versionServed === 1) ok(`as of ${before} the item reads v1 (statement: "${String(asOf.body.memory.version?.statement ?? '').slice(0, 60)}…")`); else bad(`as-of retrieve served ${asOf.body?.memory?.versionServed ?? asOf.status}`);
    const ev = await newestOutbox('GraphChanged', Date.parse(before) - 1000, (p) => p.change?.kind === 'memory_item.superseded');
    if (ev === null) bad('no GraphChanged/memory_item.superseded row published'); else { ok(`GraphChanged/memory_item.superseded published (${short(ev.id)}); its deliveries:`); showDeliveries(await settled(ev.id)); }
    const acc = await q(`select count(*)::int n, array_agg(distinct purpose_id) purposes from memory.item_access where item_id = $1`, [memId]);
    note(`the access ledger of ${short(memId)}: ${acc[0].n} read(s) under ${JSON.stringify(acc[0].purposes)}`);
  }
}

/* ── 2. the challenge and the re-derivation ─────────────────────────────── */
console.log('\n2. a challenge on the "stocks" relationship claim, decided with a correction — the relationships subscriber re-derives the inferred edge');
{
  const edge = (await q(`select e.edge_id::text, e.claim_object_id::text claim_id, e.claim_version::int, e.predicate, e.state, e.reassessment_state, (select canonical_name from graph.entities_current x where x.entity_id = e.subject_entity_id) subject, (select canonical_name from graph.entities_current x where x.entity_id = e.object_entity_id) object, (select entity_type from graph.entities_current x where x.entity_id = e.object_entity_id) object_type
    from graph.edges_current e join objects.canonical_objects c on c.object_id = e.claim_object_id and c.object_version = e.claim_version and c.object_type = 'REL'
    where e.tenant_id = $1 and e.domain_id = $2 and e.state = 'asserted' order by (e.predicate = 'stocks') desc, e.asserted_at desc limit 1`, [T, D]))[0] ?? null;
  const alternative = edge === null ? null : (await q(`select canonical_name from graph.entities_current where tenant_id = $1 and domain_id = $2 and lifecycle_state = 'active' and entity_type = $3 and canonical_name <> $4 order by canonical_name limit 1`, [T, D, edge.object_type, edge.object]))[0]?.canonical_name ?? null;
  if (edge === null || alternative === null) bad('no asserted relationship edge with an alternative object entity to challenge');
  else {
    note(`edge ${short(edge.edge_id)}: ${edge.subject} ${edge.predicate} ${edge.object} (claim ${short(edge.claim_id)}@${edge.claim_version}, reassessment ${edge.reassessment_state}); the challenge names ${alternative}`);
    const t0 = Date.now();
    const ch = await call(`${I}/review/request`, ah({ action: 'intelligence.review.request', objectType: 'REV' }), { claimObjectId: edge.claim_id, claimVersion: edge.claim_version, reason: `the February stock count names ${alternative}, not ${edge.object}, as the part NORDWERK holds against the corridor; the extracted object is challenged` }, hoffmann.token);
    if (!ch.ok) fail('challenge (a.hoffmann)', ch);
    else {
      ok(`A. Hoffmann challenged the claim: review case ${short(ch.body.review.caseId)} queued (${ch.body.review.reason ?? 'challenged'})`);
      const dec = await call(`${I}/review/${ch.body.review.caseId}/decide`, lf({ action: 'intelligence.review.decide', objectType: 'REV', objectId: ch.body.review.caseId, consequence: 'C2' }),
        { decision: 'correct', reason: `the stock count is the better source: the part held is ${alternative}`, correctedValue: { object_value: alternative } }, ferreira.token);
      if (!dec.ok) fail('decide (l.ferreira)', dec);
      else {
        ok(`L. Ferreira corrected the claim → version ${dec.body.review.newVersion ?? '?'} (${dec.body.review.state})${(dec.body.contradictions ?? []).length > 0 ? `; ${dec.body.contradictions.length} contradiction(s) detected by the correction` : ''}`);
        const ev = await newestOutbox('MemoryCorrected', t0 - 1000, (p) => p.change?.kind === 'claim.corrected');
        if (ev === null) bad('no MemoryCorrected/claim.corrected row published');
        else {
          ok(`MemoryCorrected/claim.corrected published (${short(ev.id)}); its deliveries:`);
          showDeliveries(await settled(ev.id));
          const after = (await q(`select edge_id::text, state, claim_version::int, superseded_by::text, reassessment_state, reassessment_outcome, (select canonical_name from graph.entities_current x where x.entity_id = e.object_entity_id) object from graph.edges_current e where e.edge_id = $1`, [edge.edge_id]))[0];
          const successor = after.superseded_by ? (await q(`select edge_id::text, state, claim_version::int, asserted_by::text, (select canonical_name from graph.entities_current x where x.entity_id = e.object_entity_id) object from graph.edges_current e where e.edge_id = $1`, [after.superseded_by]))[0] : null;
          if (successor) ok(`the edge was RE-DERIVED: ${short(edge.edge_id)} ${after.state} (reassessment ${after.reassessment_state}/${after.reassessment_outcome}) → successor ${short(successor.edge_id)} ${edge.subject} ${edge.predicate} ${successor.object} under claim version ${successor.claim_version}, asserted by the subscription's principal ${short(successor.asserted_by)}`);
          else note(`the edge stands as ${after.state} (reassessment ${after.reassessment_state}${after.reassessment_outcome ? `/${after.reassessment_outcome}` : ''}) — the subscriber reported above why no successor was asserted`);
        }
      }
    }
  }
}

/* ── 3. the method evaluated ────────────────────────────────────────────── */
console.log('\n3. the NORDWERK records method evaluated (TransformationEvaluated)');
{
  const ms = await read(`${I}/methods/list`, lf({ action: 'intelligence.read', objectType: 'MTH' }), ferreira.token);
  const method = (ms.body.methods ?? []).find((m) => /nordwerk|record|internal/i.test(`${m.method_key ?? ''} ${m.name ?? ''} ${m.title ?? ''}`)) ?? (ms.body.methods ?? [])[0];
  if (!method) bad(`no method to evaluate (${ms.status})`);
  else {
    const t0 = Date.now();
    const ev = await call(`${I}/methods/${method.method_id}/evaluate`, lf({ action: 'intelligence.method.evaluate', objectType: 'MTH', objectId: method.method_id }), { fitness: 'fit', reason: 'the recorded set replays; the review yield and the contradictions entered are within what the corridor work tolerates', window: { from: '2024-01-01T00:00:00Z' } }, ferreira.token);
    if (!ev.ok) fail('evaluate (l.ferreira)', ev);
    else {
      const e = ev.body.evaluation ?? {};
      ok(`method ${method.method_key ?? short(method.method_id)} v${method.method_version ?? e.method_version ?? '?'} evaluated: fitness ${e.fitness}; measures ${JSON.stringify(e.measures ?? {}).slice(0, 400)}`);
      const row = await newestOutbox('TransformationEvaluated', t0 - 1000);
      if (row === null) bad('no TransformationEvaluated row published'); else ok(`TransformationEvaluated published (${short(row.id)}) — schema ${row.payload.schema_version}, fitness ${typeof row.payload.fitness === 'object' ? JSON.stringify(row.payload.fitness).slice(0, 120) : row.payload.fitness}`);
    }
  }
}

/* ── 4. the ontology ────────────────────────────────────────────────────── */
console.log('\n4. the domain vocabulary versioned: proposed by J. Weber, decided by O. Steiner');
{
  const preds = await q(`select e.predicate, array_agg(distinct s.entity_type) subject_types, array_agg(distinct o.entity_type) object_types, count(*)::int n from graph.edges_current e join graph.entities_current s on s.entity_id = e.subject_entity_id join graph.entities_current o on o.entity_id = e.object_entity_id where e.tenant_id = $1 and e.domain_id = $2 and e.state = 'asserted' group by 1 order by 1`, [T, D]);
  const types = (await q(`select distinct entity_type from graph.entities_current where tenant_id = $1 and domain_id = $2 order by 1`, [T, D])).map((r) => r.entity_type);
  const declared = preds.map((p) => ({ predicate: p.predicate, subject_types: p.subject_types, object_types: p.object_types }));
  for (const extra of ['carries', 'transits', 'ships_through', 'depends_on', 'stocks']) if (!declared.some((d) => d.predicate === extra)) declared.push({ predicate: extra, subject_types: types, object_types: types });
  const active = (await q(`select version, state from graph.ontology_versions where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]))[0] ?? null;
  const r = await call(`${G}/ontology/propose`, jw({ action: 'graph.ontology.propose', objectType: 'ONT' }), { namespace: 'domain', entityTypes: types, predicates: declared, rationale: `the corridor vocabulary the graph asserts today (${preds.map((p) => `${p.predicate}×${p.n}`).join(', ')}), made explicit as a version`, alternatives: ['leave the vocabulary implicit (rejected: an undeclared predicate would be admitted silently)'] }, weber.token);
  if (!r.ok) fail('propose (j.weber)', r);
  else {
    const o = r.body.ontology;
    ok(`J. Weber proposed version ${o.to_version} (${o.compatibility}; from ${o.from_version ?? 'none'}); analysis: ${JSON.stringify(o.analysis?.edges ?? {}).slice(0, 200)}; reviews ${JSON.stringify(o.reviews)}`);
    const self = await call(`${G}/ontology/${o.version_id}/decide`, jw({ action: 'graph.ontology.decide', objectType: 'ONT', objectId: o.version_id, consequence: 'C2' }), { decision: 'approve', reason: 'the proposer approving', reviews: { domain: 'passed', governance: 'passed' } }, weber.token);
    if (self.status === 403 || (!self.ok && /proposer/.test(self.body?.message ?? ''))) ok(`the proposer's own approval refused (${self.status}: ${self.body?.message ?? ''})`); else bad(`expected the proposer's approval to be refused, got ${self.status}`);
    const d = await call(`${G}/ontology/${o.version_id}/decide`, os({ action: 'graph.ontology.decide', objectType: 'ONT', objectId: o.version_id, consequence: 'C2' }), { decision: 'approve', reason: 'the vocabulary matches the corridor graph; domain and governance reviews passed', reviews: { domain: 'passed', governance: 'passed' } }, steiner.token);
    if (!d.ok) fail('decide (o.steiner)', d); else ok(`O. Steiner approved: version ${d.body.ontology.version} ${d.body.ontology.state}${active ? ` (version ${active.version} superseded)` : ''}`);
    const ev = await newestOutbox('OntologyChangeProposed', Date.now() - 120_000, (p) => p.proposal_id === o.version_id);
    if (ev === null) bad('no OntologyChangeProposed row published'); else ok(`OntologyChangeProposed published (${short(ev.id)}), review required ${JSON.stringify(ev.payload.review?.required)}`);
    // a breaking proposal: remove a predicate in use
    const inUse = preds.find((p) => p.n > 0);
    if (inUse) {
      const b = await call(`${G}/ontology/propose`, jw({ action: 'graph.ontology.propose', objectType: 'ONT' }), { namespace: 'domain', entityTypes: types, predicates: declared.filter((x) => x.predicate !== inUse.predicate), rationale: `retire the ${inUse.predicate} predicate: the relationships move to the procurement register`, alternatives: ['keep it and mark it deprecated'] }, weber.token);
      if (!b.ok) fail('breaking proposal', b);
      else {
        const bo = b.body.ontology;
        ok(`a breaking proposal (version ${bo.to_version}, ${bo.compatibility}) analysed: ${bo.analysis?.edges?.count ?? '?'} asserted ${inUse.predicate} edge(s) would be stranded; reviews ${JSON.stringify(bo.reviews)}`);
        const refused = await call(`${G}/ontology/${bo.version_id}/decide`, os({ action: 'graph.ontology.decide', objectType: 'ONT', objectId: bo.version_id, consequence: 'C2' }), { decision: 'approve', reason: 'approving before the migration', reviews: { compatibility: 'passed', migration: 'passed', domain: 'passed', governance: 'passed' } }, steiner.token);
        if (!refused.ok) ok(`the steward's approval refused while the edges stand: ${refused.body?.message ?? refused.status}`); else bad('a breaking proposal was approved with the edges in place');
        const rej = await call(`${G}/ontology/${bo.version_id}/decide`, os({ action: 'graph.ontology.decide', objectType: 'ONT', objectId: bo.version_id, consequence: 'C2' }), { decision: 'reject', reason: 'the edges are live; retire them first, then propose again' }, steiner.token);
        if (rej.ok) ok(`rejected by the steward; the active version stands`); else fail('reject', rej);
      }
    }
  }
}

/* ── 5. governed retention ──────────────────────────────────────────────── */
console.log('\n5. governed retention: a superseded evidence version (the oldest without a hold) — its bytes tombstoned, removed and the deletion verified');
{
  // The oldest evidence object whose latest version is corrected (its bytes superseded): one manifest, the source it came from, its retention profile.
  const target = (await q(`select o.object_id::text id, o.object_version::int version, (o.payload ->> 'manifest_id') manifest_id, o.retention_profile, m.source_id::text source_id, s.source_key, m.byte_length
    from objects.canonical_objects o join observation.blob_manifests m on m.manifest_id = (o.payload ->> 'manifest_id')::uuid join observation.source_contracts_current s on s.source_id = m.source_id
    where o.object_type = 'EVD' and o.tenant_id = $1 and o.domain_id = $2 and o.lifecycle_state = 'corrected' and m.legal_hold = false
      and not exists (select 1 from observation.blob_tombstones t where t.manifest_id = m.manifest_id)
      and o.object_version = (select max(x.object_version) from objects.canonical_objects x where x.object_id = o.object_id)
    order by o.recorded_at limit 1`, [T, D]))[0] ?? null;
  const src = target === null ? null : { source_id: target.source_id, source_key: target.source_key };
  if (target === null) bad('no superseded evidence version without a hold to act on');
  else {
    note(`the target: evidence ${short(target.id)}@${target.version} (${target.source_key}, profile "${target.retention_profile}", ${target.byte_length} bytes at manifest ${short(target.manifest_id)})`);
    const sch = await call(`${R}/schedules/declare`, adm({ action: 'retention.schedule.declare', objectType: 'RTS' }), { retentionProfile: target.retention_profile, targetKind: 'evidence', actionKind: 'review', dueAfter: '730 days', selector: { sourceId: src.source_id } }, admin.token);
    if (sch.ok) ok(`the administrator declared a schedule: profile "${target.retention_profile}", evidence of ${src.source_key}, a review action due after 730 days`); else note(`schedule declaration: ${sch.status} ${sch.body?.message ?? ''}`);
    const evl = await call(`${R}/schedules/evaluate`, pn({ action: 'retention.schedule.evaluate', objectType: 'RTS' }), {}, novak.token);
    if (evl.ok) ok(`P. Novák evaluated the schedules: ${(evl.body.evaluation?.opened ?? []).length} action(s) opened (nothing deletes on evaluation)`); else fail('evaluate', evl);
    const t0 = Date.now();
    const o = await call(`${R}/actions/open`, pn({ action: 'retention.action.open', objectType: 'RTA' }), { kind: 'deletion', targetKind: 'evidence', selector: { manifestId: target.manifest_id }, retentionProfile: target.retention_profile, reason: 'the superseded PortWatch version has passed its retention; its current version stays' }, novak.token);
    if (!o.ok) fail('open (p.novak)', o);
    else {
      const id = o.body.action.actionId;
      ok(`P. Novák opened deletion action ${short(id)} (${o.body.action.state})`);
      const due = await newestOutbox('RetentionActionDue', t0 - 1000, (p) => p.action_id === id);
      if (due) ok(`RetentionActionDue published (${short(due.id)})`); else bad('no RetentionActionDue row');
      const rs = await call(`${R}/actions/${id}/resolve`, pn({ action: 'retention.action.resolve', objectType: 'RTA', objectId: id }), {}, novak.token);
      if (!rs.ok) fail('resolve', rs);
      else {
        const sc = rs.body.scope;
        ok(`scope resolved: state ${sc.state}, ${sc.items} item(s) — ${sc.execute} to execute, ${sc.held} held, ${sc.blocking} blocking; residuals ${JSON.stringify(sc.residuals ?? [])}; digest ${String(sc.scope_digest ?? '').slice(0, 12)}…`);
        const items = await q(`select item_kind, disposition, count(*)::int n from retention.scope_items where action_id = $1 group by 1, 2 order by 1, 2`, [id]);
        for (const it of items) note(`  ${it.item_kind}: ${it.n} ${it.disposition}`);
        const digest = sc.scope_digest;
        const selfApprove = await call(`${R}/actions/${id}/approve`, pn({ action: 'retention.action.approve', objectType: 'RTA', objectId: id, consequence: 'C2' }), { scopeDigest: digest, rationale: 'the opener approving' }, novak.token);
        if (!selfApprove.ok) ok(`the opener's own approval refused (${selfApprove.status})`); else bad('the opener approved their own action');
        const ap = await call(`${R}/actions/${id}/approve`, hb({ action: 'retention.action.approve', objectType: 'RTA', objectId: id, consequence: 'C2' }), { scopeDigest: digest, rationale: 'the scope is the superseded versions only; the current versions and the held item stay' }, bergmann.token);
        if (!ap.ok) fail('approve (h.bergmann)', ap);
        else {
          ok(`H. Bergmann approved on the scope digest`);
          const ex = await call(`${R}/actions/${id}/execute`, pn({ action: 'retention.action.execute', objectType: 'RTA', objectId: id, consequence: 'C2' }), {}, novak.token);
          if (!ex.ok) fail('execute (p.novak)', ex);
          else {
            const e = ex.body.execution;
            ok(`executed: ${e.executed} tombstoned, ${e.held} held, ${e.refused} refused; bytes removed ${e.bytes?.removed?.length ?? 0}, failed ${e.bytes?.failed?.length ?? 0}`);
            const vf = await call(`${R}/actions/${id}/verify`, pn({ action: 'retention.action.verify', objectType: 'RTA', objectId: id }), {}, novak.token);
            if (!vf.ok) fail('verify', vf);
            else {
              const v = vf.body.verification;
              ok(`verified: ${v.outcome ?? v.state}; residuals ${JSON.stringify(v.residuals ?? v.residual_summary ?? []).slice(0, 300)}`);
              const dv = await newestOutbox('DeletionVerified', t0 - 1000, (p) => p.action_id === id);
              if (dv) ok(`DeletionVerified published (${short(dv.id)})`); else bad('no DeletionVerified row');
            }
          }
        }
      }
    }
  }
}

/* ── 6. the scenario reviewed ───────────────────────────────────────────── */
console.log('\n6. a scenario reviewed by N. Eriksen — dissent, promotion to simulation, retirement; the retired branch refused by simulation');
{
  const scns = await read(`${P}/scenarios/list`, ne({ action: 'prediction.read', objectType: 'SCN' }), eriksen.token);
  const list = (scns.body.scenarios ?? []).filter((s) => s.state === 'active');
  const target = list.find((s) => /subscription scene|recomputed/i.test(s.title)) ?? list.find((s) => s.forecast_id !== null) ?? list[0];
  if (!target) bad('no active scenario to review');
  else {
    const branches = target.branches ?? [];
    const downside = branches.find((b) => b.kind === 'downside' && b.state !== 'closed') ?? branches.find((b) => b.state === 'open');
    note(`scenario ${short(target.scenario_id)} "${target.title}" (cadence ${target.review_cadence}; ${branches.length} branch(es))`);
    const t0 = Date.now();
    const review = (payload) => call(`${P}/scenarios/${target.scenario_id}/review`, ne({ action: 'prediction.scenario.review', objectType: 'SCN', objectId: target.scenario_id, consequence: 'C2' }), payload, eriksen.token);
    const d1 = await review({ outcome: 'dissent', branch_id: downside?.branch_id ?? null, note: 'dissent recorded on the collapse branch', dissent: { position: 'the collapse branch understates the reroute cost', rationale: 'the carrier notice of 14 January raises the Cape premium by a third; the consequence line should say so' } });
    if (d1.ok) ok(`dissent recorded (review ${d1.body.review.review_ordinal}); next review due ${d1.body.review.next_review_due_at ?? 'per cadence'}`); else fail('dissent', d1);
    if (downside) {
      const d2 = await review({ outcome: 'promote_to_simulation', branch_id: downside.branch_id, note: 'simulate the collapse branch against the magnet chain twin' });
      if (d2.ok) ok(`branch "${downside.name}" promoted to simulation (review ${d2.body.review.review_ordinal})`); else fail('promote', d2);
    }
    const d3 = await review({ outcome: 'retire', note: 'the scenario is superseded by the Suez-return scenario declared this week; its history stays' });
    if (!d3.ok) fail('retire', d3);
    else {
      ok(`retired: ${d3.body.review.branches_closed} open branch(es) closed, state ${d3.body.review.state_after}; links ${JSON.stringify(d3.body.review.links).slice(0, 200)}`);
      const ev = await newestOutbox('ScenarioReviewed', t0 - 1000, (p) => p.scenario_id === target.scenario_id && p.outcome === 'retire');
      if (ev) ok(`ScenarioReviewed published for each review (the retirement: ${short(ev.id)})`); else bad('no ScenarioReviewed row');
      // T. Nakamura's run bound to the retired branch
      const twins = await read(`${X}/twins/list`, tn({ action: 'twin.read', objectType: 'TWN' }), nakamura.token);
      const twin = (twins.body.twins ?? []).find((t) => /nordwerk/i.test(t.title ?? ''));
      const branch = downside ?? branches[0];
      if (twin && branch) {
        const ver = (await q(`select max(version)::int v from twin.twin_versions where twin_id = $1 and state = 'admitted'`, [twin.twin_id]))[0]?.v;
        const run = await call(`${X}/twins/simulations/run`, tn({ action: 'simulation.run', objectType: 'SIM', consequence: 'C2' }), { twinId: twin.twin_id, twinVersion: ver, runKind: 'control', controlRunId: null, scenarioId: target.scenario_id, scenarioBranchId: branch.branch_id, shock: false, component: 'SYN-PART-MAG', interventions: [{ type: 'none' }], horizonDays: 90, stochastic: { mode: 'deterministic' } }, nakamura.token);
        if (!run.ok && /retired by review/.test(run.body?.message ?? '')) ok(`T. Nakamura's run bound to the retired branch refused: ${run.body.message}`); else bad(`expected the retired-branch run to be refused, got ${run.status} ${run.body?.message ?? ''}`);
      } else note('no NORDWERK twin or branch to bind a run to');
    }
  }
}

/* ── 7. the executive requests ──────────────────────────────────────────── */
console.log('\n7. S. Okafor\'s typed requests (ExecutiveActionRequested)');
{
  const rooms = await read(`${X}/rooms/list`, so({ action: 'room.read', objectType: 'DRM' }), okafor.token);
  const room = (rooms.body.rooms ?? []).find((r) => r.member) ?? (rooms.body.rooms ?? [])[0];
  if (!room) bad('no decision room');
  else {
    const req = (payload, s = okafor, purpose = 'decision') => call(`${X}/executive/requests`, as(s, scope, { purposeId: purpose, action: 'executive.request', objectType: 'EXR', consequence: 'C2' }), payload, s.token);
    const key = `b9-${new Date().toISOString().slice(0, 16)}`;
    const t0 = Date.now();
    const a1 = await req({ kind: 'analysis', request_key: `${key}-brief`, subject: { object_type: 'DRM', object_id: room.room_id, task: 'briefing' }, instruction: 'brief the room on the corridor before the Friday review' }, okafor, 'briefing');
    if (!a1.ok) fail('analysis request', a1);
    else ok(`analysis request ${short(a1.body.request.request_id)} → ${a1.body.request.routed_to}; the briefing agent ran under its own session: run ${a1.body.run ? `${short(a1.body.run.run_id)} ${a1.body.run.outcome}` : 'none'}; request ${a1.body.request.state}`);
    const a2 = await req({ kind: 'analysis', request_key: `${key}-brief`, subject: { object_type: 'DRM', object_id: room.room_id, task: 'briefing' }, instruction: 'brief the room on the corridor before the Friday review' }, okafor, 'briefing');
    if (a2.ok && a2.body.request.repeated === true && a2.body.run === null) ok(`the same request repeated under the same key returned request ${short(a2.body.request.request_id)} — no second run, no second event (exactly once)`); else bad(`repeat: ${a2.status} repeated=${a2.body?.request?.repeated} run=${a2.body?.run ? 'ran again' : 'none'}`);
    const a3 = await req({ kind: 'analysis', request_key: `${key}-brief`, subject: { object_type: 'DRM', object_id: room.room_id, task: 'briefing' }, instruction: 'brief the room on the corridor AND the premium' }, okafor, 'briefing');
    if (!a3.ok) ok(`the same key with a different request refused: ${a3.body?.message ?? a3.status}`); else bad('a different request under the same key was admitted');
    const warnings = await read(`${P}/warnings/list`, ne({ action: 'prediction.read', objectType: 'WRN' }), eriksen.token);
    const w = (warnings.body.warnings ?? []).find((x) => x.state === 'raised' && !x.suppressed) ?? null;
    if (w) {
      const until = new Date(Date.now() + 7 * 86_400_000).toISOString();
      const s1 = await req({ kind: 'suppression', request_key: `${key}-sup`, subject: { object_type: 'WRN', object_id: w.warning_id }, instruction: 'rebooking decided; keep the record and quiet the alarm until the booking deadline', until });
      if (!s1.ok) fail('suppression', s1);
      else {
        const again = await read(`${P}/warnings/list`, ne({ action: 'prediction.read', objectType: 'WRN' }), eriksen.token);
        const w2 = (again.body.warnings ?? []).find((x) => x.warning_id === w.warning_id);
        ok(`warning "${w.title}" suppressed until ${until}: its state stays ${w2?.state}, the list marks suppressed=${w2?.suppressed} (until ${w2?.suppressed_until})`);
      }
    } else note('no raised, unsuppressed warning to suppress');
    const f1 = await req({ kind: 'follow_up', request_key: `${key}-fu`, subject: { object_type: 'DPK', object_id: room.package_id }, instruction: 'confirm SYN-SHIP-4468 rebooked', owner: brandt.principalId, due_at: '2024-01-22T17:00:00Z' });
    if (!f1.ok) fail('follow-up', f1);
    else {
      const wf = await read(`${X}/workflow/${room.package_id}`, lb({ action: 'decision.read', objectType: 'DPK', objectId: room.package_id }), brandt.token);
      const fu = (wf.body.follow_ups ?? []).find((f) => f.request_id === f1.body.request.request_id);
      ok(`follow-up "${fu?.instruction}" owned by L. Brandt, due ${fu?.due_at}: status ${fu?.status} on the package's workflow`);
      const done = await call(`${X}/executive/follow-ups/${fu.follow_up_id}/complete`, lb({ action: 'executive.follow_up.complete', objectType: 'EXR', objectId: fu.follow_up_id, consequence: 'C2' }), { note: 'rebooked on 21 January; booking reference in the shipment record' }, brandt.token);
      if (done.ok) ok(`L. Brandt completed it (was overdue: ${done.body.follow_up.was_overdue})`); else fail('complete', done);
    }
    const d1 = await req({ kind: 'delegation', request_key: `${key}-del`, subject: { object_type: 'DRM', object_id: room.room_id, action: 'decision.review' }, instruction: 'cover the Friday review while I travel', delegate: dvorak.principalId, until: new Date(Date.now() + 3 * 86_400_000).toISOString() });
    if (!d1.ok) fail('delegation', d1);
    else {
      const rv = await call(`${X}/rooms/${room.room_id}/review`, md({ action: 'decision.review', objectType: 'DRM', objectId: room.room_id }), { note: 'reviewed under S. Okafor\'s delegation' }, dvorak.token);
      const rm = await read(`${X}/rooms/${room.room_id}/get`, so({ action: 'room.read', objectType: 'DRM', objectId: room.room_id }), okafor.token);
      const dl = (rm.body.room?.delegations ?? []).find((d) => d.request_id === d1.body.request.request_id);
      ok(`delegation to M. Dvořák ${dl?.status ?? '?'} (until ${dl?.until_at}); M. Dvořák's review of the room ${rv.ok ? `recorded (next review ${rv.body.review.nextReviewAt})` : `refused: ${rv.body?.message ?? rv.status}`}`);
    }
    const sc = await req({ kind: 'scenario', request_key: `${key}-scn`, subject: {}, instruction: 'declare the Suez-return scenario on the current corridor forecast with a weekly cadence' });
    if (!sc.ok) fail('scenario request', sc);
    else {
      ok(`scenario request ${short(sc.body.request.request_id)} routed to ${sc.body.request.routed_to} (${sc.body.request.state}) — waits on N. Eriksen`);
      const fc = await read(`${P}/forecasts/list`, ne({ action: 'prediction.read', objectType: 'FCT' }), eriksen.token);
      const f = (fc.body.forecasts ?? []).find((x) => x.series_key === 'portwatch:chokepoint4:n_total' && x.state === 'issued') ?? (fc.body.forecasts ?? [])[0];
      const decl = await call(`${P}/scenarios/declare`, ne({ action: 'prediction.scenario.declare', objectType: 'SCN' }), { requestId: sc.body.request.request_id, title: 'Suez return over the next quarter (B9)', statement: 'the corridor reopens and the reroute premium unwinds', forecastId: f?.forecast_id ?? null, subjectEntityId: f?.subject_entity_id ?? null, owner: eriksen.principalId, reviewCadence: 'weekly',
        branches: [{ name: 'Baseline', kind: 'baseline', statement: 'as forecast', owner: eriksen.principalId, reviewCadence: 'weekly', responseWindowHours: 72, consequence: 'keep the booked routing' }] }, eriksen.token);
      if (decl.ok) ok(`N. Eriksen declared scenario ${short(decl.body.scenario.scenarioId)} naming the request → request ${decl.body.scenario.fulfilled_request?.state} (answer ${short(decl.body.scenario.fulfilled_request?.routed_ref)})`); else fail('declare with requestId', decl);
    }
    const evs = await q(`select count(*)::int n from objects.object_outbox where event_type = 'ExecutiveActionRequested' and tenant_id = $1 and domain_id = $2 and created_at >= $3`, [T, D, new Date(t0 - 1000)]);
    note(`ExecutiveActionRequested rows published in this act: ${evs[0].n} (one per new request; none for the repeat)`);
    const reg = (await q(`select binding_state, schema_version from objects.interface_register where interface_id = 'L10-I04'`))[0];
    note(`the register reads L10-I04 ${reg.binding_state} ${reg.schema_version}`);
  }
}

await su.end();
const counts = (await (async () => null)()) ?? null; void counts;
console.log(`\n=== ${failureCount() === 0 ? 'the act completed with every scene producing its effect' : `${failureCount()} scene step(s) did not produce the effect claimed`} ===`);
process.exit(failureCount() === 0 ? 0 : 1);
