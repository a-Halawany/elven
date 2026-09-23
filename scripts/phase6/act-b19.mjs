#!/usr/bin/env node
/**
 * CP-6 batch B19 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): SOURCE-DERIVED
 * MEMORY RECORDS — a MEM version DERIVED from a claim version or a warning by the knowledge owner's human-gated act (memory.item.derive):
 * the statement computed by the method memory-derive@1.0.0 and its digest re-verified by the port, the provenance (the basis version and
 * digest, the evidence versions with their digests and byte spans, the source contract, the series keys), the controls inherited (the most
 * restrictive classification applied and SAID as declared/inherited/applied), the truth state the basis's, the review gate, the basis
 * FOLLOWED (corrected by a walk, withdrawn by the ports), a re-derivation by the record authority, and the deletion of the evidence a derived
 * record copies from PAUSED — migration 0079 — exercised by the personas through the REAL HTTP path, each scene stating the effect it
 * produced in the ledgers and the outbox, and where nothing happened, saying so. EVERY BASIS IS LOOKED UP AT RUN TIME by SQL against the
 * database the act is pointed at: no object id is hard-coded; a candidate the product refuses (queued, corrected, withdrawn, held) is
 * skipped WITH the reason printed and the next one tried.
 *
 *   0. THE STATE: the register through the route (36 bound / 14 partial / 0 unbound; L3-I01's bound_to names B19 (0079)); the memory
 *      items of the origin by source kind BEFORE this run; the seven subscriptions of the origin LISTED AND LEFT — no consumer method
 *      changed in B19, so nothing is revoked or registered anew (said).
 *   1. TELEMETRY — the corridor's transit count as a memory record: the newest active PortWatch EVT claim `daily_transit_count` whose
 *      lineage reaches a contract with a REGISTERED SERIES (imf-portwatch-chokepoints; the series keys printed) is derived by K. Müller as
 *      a telemetry record under the purpose memory; the statement, the basis (extracted, its review state), the source contract, the
 *      evidence version/digest/span, the series keys, the classification declared/inherited/applied and where the retention and the
 *      validity came from are printed VERBATIM from the answer (retention_from is printed, never expected); L. Brandt retrieves it under
 *      memory (availability.basis_state current, truth extracted, the derivation block from the SERVED payload);
 *      GraphChanged/memory_item.recorded with cause memory.item.derive and its deliveries as they settle (retrieval verified; the rest
 *      empty — said). THE QUEUED CLM `transit_change_vs_prior_day` is REFUSED at the review gate (409 EYE-STA-002, the words printed).
 *      THE WARNING: the newest raised or acknowledged warning derived as a telemetry record (inferred; the indicator and the breaching
 *      evidence version in the derivation).
 *   2. DOCUMENT — the supply relationship as a memory record: the newest NORDWERK REL claim on a nordwerk-internal upload (its latest
 *      version not withdrawn, no queued or rejected case, its manifest not held; a HOT manifest preferred) derived by K. Müller as a
 *      document record → DOC (synthetic true inherited from the contract's data origin, the internal ceiling, the retention profile from
 *      the basis — printed); S. Okafor composes a domain briefing that carries DOC with truth_state extracted, synthetic_state true and
 *      details.derivation.basis; the briefing's controls fold synthetic.
 *   3. COMMUNICATION — STATED (option b): the demonstration's communication-class sources carry no extracted claim; the kind is proven on
 *      the harness (phase6-memory-derived M1). ONE line here exercises the kind's rule on the demo: the same REL derived as a
 *      communication record (the kind is the person's declaration; the source line says upload) → COM, withdrawn by R. Adler in the same
 *      act, so the demo keeps one document record per run.
 *   4. THE LIFECYCLE: A. Hoffmann challenges REL@v and L. Ferreira CORRECTS the object value in review (the MemoryCorrected/claim.corrected
 *      row and the relationships subscriber's delivery printed, not asserted); J. Weber propagates claim_correction → DOC marked
 *      basis_corrected with the invalidation named; L. Brandt's retrieval says basis corrected; R. Adler RE-DERIVES DOC on the latest
 *      REL (memory.item.supersede with payload.basis) → version 2, the statement recomputed with the restated value, the basis at v+1
 *      (asserted, review corrected), attention none; L. Brandt replays version 1 as of the instant before the correction. THE MIRROR
 *      (present since B16/B17, else said): S. Roth (strategy_owner, a holder) derives from an IMPORTED claim of the mirror → 409
 *      EYE-STA-002 "an imported claim is derived at its origin and re-imported; it is not derived here" — printed verbatim; K. Vogel
 *      (twin_owner, not a holder) → 403.
 *   5. THE DELETION PAUSE: M. Dvorak submits and applies a CORRECTION on the evidence DOC copies from (the B1 idiom; the corrected object's
 *      latest version makes its manifest deletable) — the propagation agent's automatic walk (registered since B1) marks DOC
 *      basis_corrected, or, where the agent is not live, J. Weber walks evidence_correction and the act says which path marked it;
 *      P. Novák opens a deletion of the evidence's manifest and resolves it → PAUSED, blocking, the failure reason naming
 *      memory_item:DOC, the dependents with their routes printed verbatim, the residual inventory; P. Novák WITHDRAWS the action — the
 *      pause shown, nothing retired by the act. The HUMAN-record control (a person's record citing the evidence stays a residual) is the
 *      harness's (M5), not re-run here.
 *   6. THE STATE: the memory listing's Source column for this run's records (document ← REL:…@v, telemetry ← EVT:…@v, telemetry ←
 *      WRN:…@1); DOC's events (recorded → attention → superseded → attention); the register through the route; what the act leaves; the
 *      stated limits.
 *
 * EACH RUN derives its own records (the telemetry EVT and warning records active, DOC at v2 marked basis_corrected, COM withdrawn),
 * corrects the REL once more in review (v+1 per run) and the evidence once more (a new corrected version per run, its manifest kept), and
 * leaves the deletion action withdrawn; an earlier run's records are never touched. NO new persona; no re-registration of any subscriber.
 * Nothing is cleaned. Nothing here prints a credential.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { loadLocalEnv } from '../local-env.mjs';
import { API, call, login, adminSession, demoScope, as, ok, bad, note, failureCount, domainByName } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const pg = createRequire(join(ROOT, 'apps', 'api', 'package.json'))('pg');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const X = `/v1/tenants/${T}/domains/${D}`; const G = `${X}/graph`; const I = `${X}/intelligence`; const R = `${X}/retention`; const O = `${X}/observation`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 8)}…`);
const iso = (t) => (t === null || t === undefined ? '—' : new Date(t).toISOString());
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const maybe = async (l) => login(l, PW);
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`;
const sha256 = (s) => createHash('sha256').update(s, 'utf8').digest('hex');
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: env.EYE_DB_NAME ?? 'eye_demo', user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
/** An instant from the DATABASE clock (the as-of reads of a replay compare against recorded_at; the act's own clock is not the record's). */
const mark = async () => (await q('select clock_timestamp() t'))[0].t.toISOString();
const TODAY = new Date().toISOString().slice(0, 10);
const tStart = Date.now();
// THE PERSONAS (D15): every one existing; no new persona. The mirror's two are B16/B17's (a missing mirror skips the mirror lines of scene 4, said).
const mueller = await who('k.mueller'); const adler = await who('r.adler'); const brandt = await who('l.brandt'); const okafor = await who('s.okafor');
const hoffmann = await who('a.hoffmann'); const ferreira = await who('l.ferreira'); const weber = await who('j.weber'); const dvorak = await who('m.dvorak'); const novak = await who('p.novak');
const roth = await maybe('s.roth'); const vogel = await maybe('k.vogel');
const P_ = (s, purpose) => (over) => as(s, scope, { purposeId: purpose, ...over });
const km = P_(mueller, 'memory'); const so = P_(okafor, 'briefing'); const ah = P_(hoffmann, 'intelligence'); const lf = P_(ferreira, 'intelligence');
const jw = P_(weber, 'graph'); const md = P_(dvorak, 'observation'); const pn = P_(novak, 'retention');
// The seven subscriber kinds (B6; the relationships subscriber of B9) and the demonstration's selection for the seventh (register-subscriptions.mjs).
const KINDS = ['twins', 'forecasts', 'scenarios', 'decisions', 'retrieval', 'memory-mappings', 'relationships'];
const SELECTION = { relationships: { eventTypes: ['MemoryCorrected'], filter: { change_kinds: ['claim.corrected'] } } };
const BROAD = KINDS.filter((k) => SELECTION[k] === undefined);
let liveBroad = BROAD.length;   // the broad subscriptions found active in scene 0 — what a GraphChanged row is delivered to

/* ── the outbox, the deliveries, the ledgers ─────────────────────────────── */
/** The newest published GraphChanged row of a kind caused by a target after a mark (the B17 idiom). */
async function waitOutbox(domainId, kind, targetId, notBefore, seconds = 30) {
  for (let i = 0; i < seconds; i += 1) {
    const row = (await q(`select id::text, status, partition_key, partition_seq::int, correlation_id::text, payload from objects.object_outbox
        where event_type = 'GraphChanged' and tenant_id = $1 and domain_id = $2 and payload #>> '{change,kind}' = $3 and payload #>> '{cause,target_id}' = $4 and created_at >= $5
        order by created_at desc limit 1`, [T, domainId, kind, targetId, new Date(notBefore - 1000)]))[0] ?? null;
    if (row !== null && row.status === 'published') return row;
    await sleep(1000);
  }
  return null;
}
/** The newest published row of an event type after a mark whose payload satisfies `where` (the B10 idiom). */
async function newestOutbox(eventType, notBefore, where = () => true, seconds = 60) {
  for (let i = 0; i < seconds; i += 1) {
    const rows = await q(`select id::text, status, payload from objects.object_outbox where event_type = $1 and tenant_id = $2 and domain_id = $3 and created_at >= $4 order by created_at desc`, [eventType, T, D, new Date(notBefore)]);
    const hit = rows.find((r) => where(r.payload)); if (hit !== undefined && hit.status === 'published') return hit; await sleep(1000);
  }
  return null;
}
const deliveriesOf = (eventId) => q(`select consumer_kind, state, items, items_applied, items_unresolved, attempts, deliveries::int deliveries, last_error, failure_class, disposition from graph.subscription_deliveries where event_id = $1 order by consumer_kind`, [eventId]);
/** Wait for every delivery of an event to be terminal (the B16 loop). */
async function settled(eventId, expected = liveBroad, seconds = 90) {
  let ds = [];
  for (let i = 0; i < seconds; i += 1) {
    ds = await deliveriesOf(eventId);
    if (ds.length >= expected && ds.every((d) => ['applied', 'failed', 'refused', 'unresolved'].includes(d.state))) { await sleep(1500); return ds; }
    await sleep(1000);
  }
  return ds;
}
const effectsOf = (d) => [...new Set((d.items_applied ?? []).map((x) => x.effect))].join(', ');
const deliveryLine = (ds) => ds.map((d) => `${d.consumer_kind} ${d.state}${(d.items ?? []).length > 0 ? ` (${(d.items ?? []).length} item(s): ${effectsOf(d) || 'no effect recorded'})` : ' (no items)'}${d.last_error ? ` — ${String(d.last_error).slice(0, 120)}` : ''}`).join('; ');
const byKind = (ds, k) => ds.find((d) => d.consumer_kind === k) ?? null;
const retrievalCheck = async (eventId) => (await q(`select mismatched::int, touched from graph.retrieval_checks where outbox_event_id = $1 order by checked_at desc limit 1`, [eventId]))[0] ?? null;
const itemRow = async (id) => (await q(`select item_id::text, object_version::int, state, attention_state, attention_reason, source_kind, source_ref, classification, retention_profile, superseded_versions::int, recorded_at, derivation from memory.items_current where item_id = $1`, [id]))[0] ?? null;
const itemEvents = (id) => q(`select event, object_version::int, details, occurred_at from memory.item_events where item_id = $1 order by occurred_at`, [id]);
const actionRow = async (id) => (await q(`select state, failure_class, disposition, failure_reason from retention.actions_current where action_id = $1`, [id]))[0] ?? null;

/* ── the memory routes (the B10 shape) ───────────────────────────────────── */
const deriveIn = (s, sc, body) => call(`/v1/tenants/${sc.tenantId}/domains/${sc.domainId}/graph/memory/derive`, as(s, sc, { purposeId: 'memory', action: 'memory.item.derive', objectType: 'MEM', consequence: 'C2' }), body, s.token);
/**
 * A derivation through the route; a 422 naming `validity.from is declared` (the basis carries no event time) is retried ONCE with a
 * declared instant, and the act says so — the demonstration's claims carry the publisher's time, a seeded one may not.
 */
async function derive(s, body) {
  const r = await deriveIn(s, scope, body);
  if (r.status === 422 && /validity\.from is declared/.test(String(r.body?.message ?? ''))) {
    note(`the basis carries no event time (${r.body.message}); retried ONCE with validity.from 2024-01-14T00:00:00Z declared — said`);
    return deriveIn(s, scope, { ...body, validity: { ...(body.validity ?? {}), from: '2024-01-14T00:00:00Z' } });
  }
  return r;
}
const supersede = (s, id, body) => call(`${G}/memory/${id}/supersede`, as(s, scope, { purposeId: 'memory', action: 'memory.item.supersede', objectType: 'MEM', objectId: id, consequence: 'C2' }), body, s.token);
const retrieve = (s, id, purpose, asOf = null) => call(`${G}/memory/${id}/retrieve`, as(s, scope, { purposeId: purpose, action: 'memory.item.retrieve', objectType: 'MEM', objectId: id, sideEffect: 'none' }), asOf === null ? {} : { asOf }, s.token);
const withdraw = (s, id, reason) => call(`${G}/memory/${id}/withdraw`, as(s, scope, { purposeId: 'memory', action: 'memory.item.withdraw', objectType: 'MEM', objectId: id, consequence: 'C2' }), { reason }, s.token);
const listMemory = () => call(`${G}/memory/list`, km({ action: 'graph.read', objectType: 'MEM', sideEffect: 'none' }), { limit: 400 }, mueller.token);
/** The derive payload's declared part — the record form's fields; the statement, the source and the provenance are the server's. */
const declared = (over) => ({ recordClass: 'institutional', title: `B19 act record (${TODAY})`, audience: { classification: 'internal', roles: [], purposes: ['memory', 'graph', 'briefing'] },
  validity: { from: null, to: null }, retention: { profile: null, retainUntil: null, basis: null }, cites: [], related: { decisionId: null, objectiveId: null }, ...over });
/** What a derivation answered, VERBATIM: the record, the basis as read, the source, the evidence, the lift said, where each inherited value came from. */
function showDerived(m, by) {
  const b = m.basis ?? {}; const s = m.source ?? {}; const inh = m.inherited ?? {}; const c = m.classification ?? {};
  ok(`${by} derived ${short(m.itemId)} v${m.version} as ${m.sourceKind} from ${b.object_type}:${short(b.id)}@${b.version} (${b.truth_state}, review ${b.review_state}; event time ${b.event_time ?? 'none'}; the basis's content digest ${String(b.content_digest).slice(0, 12)}…); ${m.cites} cite(s); content digest ${String(m.contentDigest).slice(0, 12)}…`);
  note(`the statement (memory-derive@1.0.0): "${m.statement}" — digest ${m.statementDigest}${sha256(String(m.statement)) === m.statementDigest ? ' (= sha256 of the statement, re-computed here)' : ' (DOES NOT equal sha256 of the statement as answered)'}`);
  note(`the source: ${s.source_key}@${s.contract_version} · ${s.connector_kind} · ${s.media_type ?? '—'} · ${s.authority_class} · ${s.data_origin}${(m.seriesKeys ?? []).length > 0 ? ` · series ${m.seriesKeys.join(', ')}` : ' · no series (not a telemetry record)'}`);
  for (const e of m.evidence ?? []) note(`the evidence: EVD ${short(e.object_id)}@${e.version} · bytes ${String(e.digest).slice(0, 16)}…${e.byte_start !== null && e.byte_start !== undefined ? ` · span ${e.byte_start}–${e.byte_end}` : ' · the whole record'}`);
  note(`classification declared ${c.declared} / inherited ${c.inherited} / applied ${c.applied}; synthetic ${inh.synthetic_state}; rights ${inh.rights_profile ?? 'none'}; residency ${inh.residency_profile ?? 'none'}; retention ${inh.retention_profile} (from the ${inh.retention_from}); holds from ${inh.valid_from} (from the ${inh.valid_from_source})`);
}
/** The served DERIVATION block, from the payload a retrieval answered — not from the projection. */
const derivationLine = (d) => d === null || d === undefined ? 'NO derivation block on the served payload' :
  `basis ${d.basis?.object_type}:${short(d.basis?.id)}@${d.basis?.version} (${d.truth_state_of_basis}, review ${d.review_state_of_basis}) · method ${d.method_ref} · derived ${d.derived_at} · source ${d.source?.source_key}@${d.source?.contract_version} (${d.source?.connector_kind}) · evidence ${(d.evidence ?? []).map((e) => `${short(e.object_id)}@${e.version}`).join(', ')}${Array.isArray(d.series_keys) ? ` · series ${d.series_keys.join(', ')}` : ''}${d.indicator ? ` · indicator ${short(d.indicator.indicator_id)} on ${d.indicator.series_key}${d.indicator.rule ? ` (${d.indicator.rule})` : ''}` : ''} · statement digest ${String(d.statement_digest).slice(0, 16)}…`;

console.log(`THE EYE — CP-6 B19 on the demonstration: source-derived memory records (migration 0079) — a claim version or a warning derived into a memory record with its provenance and inherited controls, the review gate, the basis followed, the re-derivation, the deletion pause`);
console.log(`target ${API} · database ${env.EYE_DB_NAME ?? 'eye_demo'} · tenant ${short(T)} · origin domain ${short(D)} · ${new Date().toISOString()}`);
console.log('each run derives its own records, corrects the supply relationship once more in review and its evidence once more, and leaves the deletion action withdrawn; no earlier run\'s record is touched; no persona is created; no subscriber is re-registered');

/* ── the mirror (B16/B17's), read only ──────────────────────────────────── */
const D2_NAME = 'NORDWERK Exchange Mirror (SYNTHETIC)';
let D2 = null;
try { const d = await domainByName(admin, T, D2_NAME); D2 = d === null ? null : d.id; } catch (e) { bad(`the mirror domain: ${e.message}`); }
const mirrorReady = D2 !== null && roth !== null && vogel !== null;
if (!mirrorReady) note(`the mirror is not prepared (domain ${D2 === null ? 'ABSENT' : 'present'}; s.roth ${roth === null ? 'NOT available' : 'ok'}; k.vogel ${vogel === null ? 'NOT available' : 'ok'}) — the imported-claim refusal of scene 4 is the harness's here (phase6-memory-derived M2), said`);

/* ── 0. THE STATE ────────────────────────────────────────────────────────── */
console.log('\n0. THE STATE — the register through the route (L3-I01 names B19); the memory items by source kind before this run; the seven subscriptions of the origin listed and LEFT');
const registerLine = async (label) => {
  const ir = await call(`${G}/interfaces`, jw({ action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, weber.token);
  if (!ir.ok) { fail(`graph/interfaces (j.weber, ${label})`, ir); return; }
  const all = ir.body.interfaces ?? [];
  const count = (s) => all.filter((i) => i.binding_state === s).length;
  const l3 = all.find((i) => i.interface_id === 'L3-I01') ?? null;
  const names = l3 !== null && /B19 \(0079\)/.test(String(l3.bound_to ?? ''));
  if (all.length === 50 && count('bound') === 36 && count('partial') === 14 && count('unbound') === 0 && names) ok(`the interface register (J. Weber, ${label}): ${all.length} rows — ${count('bound')} bound / ${count('partial')} partial / ${count('unbound')} unbound; L3-I01 ${l3.name}@${l3.schema_version} ${l3.binding_state}, its bound_to names B19 (0079) — the derivation clause; no row moved (L3-I02 stays partial: the purpose-bound context query)`);
  else bad(`the register (${label}): ${all.length} rows, ${count('bound')}/${count('partial')}/${count('unbound')}; L3-I01 ${l3 === null ? 'MISSING' : `${l3.binding_state}, bound_to ${names ? 'names' : 'DOES NOT name'} B19 (0079)`}`);
};
await registerLine('before');
{
  const kinds = await q(`select source_kind, count(*)::int n, count(*) filter (where derivation is not null)::int derived from memory.items_current where tenant_id = $1 and domain_id = $2 group by 1 order by 1`, [T, D]);
  note(`memory.items_current in the origin before this run: ${kinds.map((k) => `${k.source_kind} ×${k.n}${k.derived > 0 ? ` (${k.derived} derived)` : ''}`).join(', ') || 'none'} — ${kinds.some((k) => k.derived > 0) ? 'derived records from an earlier run stand' : 'every record a person\'s own (no derived record yet)'}`);
  const st = await call(`${G}/subscriptions/status`, { scope: 'DOMAIN', tenantId: T, domainId: D, principalId: `principal:${admin.principalId}`, purposeId: 'platform.administration', action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }, {}, admin.token);
  if (!st.ok) fail('subscriptions/status (the administrator)', st);
  else {
    const s = st.body.subscriptions ?? {};
    const live = (s.subscriptions ?? []).filter((x) => x.status === 'active');
    const lines = KINDS.map((kind) => {
      const l = live.find((x) => x.consumer_kind === kind) ?? null; const c = (s.consumers ?? []).find((x) => x.kind === kind) ?? null;
      if (l === null) return `${kind} NONE`;
      const same = c !== null && l.code_digest === c.codeDigest && l.consumer_version === c.version;
      return `${kind} ${short(l.subscription_id)} (consumer ${l.consumer_version} ${String(l.code_digest).slice(0, 12)}…${same ? ', this process\'s' : c === null ? ', this process has no such consumer' : `, this process's is ${c.version} ${String(c.codeDigest).slice(0, 12)}… — OUTDATED, left as it is`})`;
    });
    liveBroad = live.filter((x) => BROAD.includes(x.consumer_kind)).length;
    if (live.length === KINDS.length) ok(`the seven subscriptions of the origin: ${lines.join('; ')} — LISTED AND LEFT: no consumer method changed in B19 (the consumer digests are METHOD_REF-based; the B6–B9 pins stand), so nothing is revoked or registered anew`);
    else note(`the subscriptions of the origin: ${lines.join('; ')} — ${KINDS.length - live.length} kind(s) without an active subscription (run scripts/phase6/register-subscriptions.mjs); the deliveries below are counted over the ${liveBroad} live broad subscription(s); nothing is registered by this act`);
  }
}

/* ── 1. TELEMETRY ────────────────────────────────────────────────────────── */
console.log('\n1. TELEMETRY — the corridor\'s transit count: the newest PortWatch EVT claim derived by K. Müller as a telemetry record (the source has a registered series); L. Brandt retrieves; the GraphChanged row and its deliveries; the queued CLM refused; the warning derived');
let TEL = null; let TEL_EVT = null; let WREC = null;
{
  const cands = await q(`select o.object_id::text id, o.object_version::int v, o.payload ->> 'subject' subject, o.payload ->> 'object_value' object_value, o.event_time, o.classification,
        (select r.state from intelligence.review_current r where r.claim_object_id = o.object_id and r.claim_version = o.object_version order by r.opened_at desc limit 1) case_state,
        l.evidence_object_id::text evd_id, l.evidence_digest, l.byte_start::int byte_start, l.byte_end::int byte_end,
        e.object_version::int evd_v, e.lifecycle_state evd_state, e.provenance_ref, s.source_key, s.connector_kind, s.contract_version::int contract_version,
        (select array_agg(r.series_key order by r.series_key) from prediction.series_registry r where r.tenant_id = o.tenant_id and r.domain_id = o.domain_id and r.source_key = s.source_key) series_keys
      from objects.canonical_objects o
      join lateral (select * from intelligence.claim_lineage l where l.claim_object_id = o.object_id and l.claim_version = o.object_version order by l.evidence_object_id limit 1) l on true
      left join lateral (select * from objects.canonical_objects e where e.object_id = l.evidence_object_id and e.object_type = 'EVD' and e.payload ->> 'content_digest' = l.evidence_digest order by e.object_version desc limit 1) e on true
      left join observation.source_contracts_current s on e.provenance_ref = 'SRC:' || s.source_id::text || '@' || s.contract_version::text
      where o.tenant_id = $1 and o.domain_id = $2 and o.object_type = 'EVT' and o.payload ->> 'predicate' = 'daily_transit_count' and o.lifecycle_state = 'active'
        and not exists (select 1 from objects.canonical_objects x where x.object_id = o.object_id and x.object_version > o.object_version)
        and coalesce(o.payload -> 'review' ->> 'state', 'not_required') not in ('queued', 'rejected')
      order by o.recorded_at desc limit 8`, [T, D]);
  const usable = cands.filter((c) => !['queued', 'rejected', 'corrected'].includes(String(c.case_state ?? '')));
  if (cands.length === 0) bad('no active PortWatch EVT claim daily_transit_count with a lineage in the origin — run the Phase 2 extraction seed first');
  else note(`${cands.length} candidate EVT claim(s) daily_transit_count, ${usable.length} without a live review case; the newest first`);
  for (const c of usable) {
    if (TEL !== null) break;
    const series = c.series_keys ?? [];
    note(`the candidate EVT ${short(c.id)}@${c.v}: "${c.subject} daily_transit_count ${c.object_value}" (event time ${iso(c.event_time)}, ${c.classification}); its lineage's evidence ${short(c.evd_id)}@${c.evd_v ?? '?'} (${c.evd_state ?? 'no version carries the lineage digest'}; bytes ${String(c.evidence_digest).slice(0, 12)}… span ${c.byte_start}–${c.byte_end}) → the contract ${c.source_key ?? 'NONE'}@${c.contract_version ?? '?'} (${c.connector_kind ?? '—'}); series registered on the source: ${series.join(', ') || 'NONE'}`);
    if (c.source_key === null || c.evd_v === null) { note('  skipped: the lineage reaches no contract row (the derivation would be refused)'); continue; }
    if (series.length === 0) { note(`  skipped: ${c.source_key} has no registered series — a telemetry record would be refused (422, the kind\'s one verifiable rule); the next candidate`); continue; }
    const t0 = Date.now();
    const r = await derive(mueller, declared({ basis: { kind: 'claim', id: c.id }, sourceKind: 'telemetry', title: `Corridor transit count (B19 act, ${TODAY})`, retention: { profile: 'institutional-record-10y', retainUntil: null, basis: 'the corridor record is kept ten years (B19 act)' } }));
    if (!r.ok) { note(`  the product refused EVT ${short(c.id)}@${c.v}: ${refusalLine(r)} — the next candidate`); continue; }
    const m = r.body.memory; TEL = m.itemId; TEL_EVT = c;
    showDerived(m, 'K. Müller');
    if (m.sourceKind === 'telemetry' && m.basis.truth_state === 'extracted' && m.basis.id === c.id && (m.seriesKeys ?? []).length > 0 && m.source.source_key === c.source_key && (m.evidence ?? []).some((e) => e.object_id === c.evd_id && e.digest === c.evidence_digest)) ok(`a TELEMETRY record whose truth state is the basis's — extracted, never observed (the model read the number; the observed series-window basis is the stated residual); the series keys ${m.seriesKeys.join(', ')} bind the kind to the source ${m.source.source_key} (${m.source.connector_kind}); the evidence named at version ${m.evidence[0].version} with the lineage's bytes digest and span`);
    else bad(`the telemetry derivation's answer: ${JSON.stringify({ sourceKind: m.sourceKind, basis: m.basis, seriesKeys: m.seriesKeys, source: m.source, evidence: m.evidence }).slice(0, 500)}`);
    // L. Brandt retrieves under memory: the served payload carries the derivation; the availability says the basis's state.
    const rt = await retrieve(brandt, TEL, 'memory');
    if (!rt.ok) fail('memory/retrieve (l.brandt, memory)', rt);
    else {
      const mm = rt.body.memory; const p = mm.version?.payload ?? {};
      if (mm.availability?.basis_state === 'current' && mm.availability?.source_kind === 'telemetry' && mm.version?.truth_state === 'extracted' && p.derivation?.basis?.id === c.id && p.derivation?.statement_digest === m.statementDigest && p.statement === m.statement) ok(`L. Brandt retrieved ${short(TEL)} under memory: version ${mm.versionServed} served (${mm.availability.state}, basis_state ${mm.availability.basis_state}, source_kind ${mm.availability.source_kind}); the version: truth ${mm.version.truth_state}, synthetic ${mm.version.synthetic_state}, provenance ${mm.version.provenance_ref}, method ${mm.version.method_ref}, event time ${mm.version.event_time ?? 'none'}; access ${short(mm.accessId)}`);
      else bad(`the retrieval: ${JSON.stringify({ availability: mm.availability, truth: mm.version?.truth_state, derivation: p.derivation?.basis, statement: p.statement }).slice(0, 500)}`);
      note(`the SERVED derivation block: ${derivationLine(p.derivation)}`);
    }
    const gc = await waitOutbox(D, 'memory_item.recorded', TEL, t0);
    if (gc === null) bad('no published GraphChanged/memory_item.recorded for the telemetry record within 30 s');
    else {
      const objs = gc.payload.objects ?? {}; const cause = gc.payload.cause ?? {};
      if (cause.action === 'memory.item.derive' && (objs.memoryItems ?? []).includes(TEL) && (objs.claims ?? []).includes(c.id) && (objs.evidence ?? []).includes(c.evd_id)) ok(`GraphChanged/memory_item.recorded ${short(gc.id)} (partition ${gc.partition_key} seq ${gc.partition_seq}): cause ${cause.action} by ${short(cause.actor)}; objects.memoryItems [${short(TEL)}], objects.claims includes the basis, objects.evidence includes its evidence; ${(gc.payload.relationships?.dependencies ?? []).length} dependency row(s) announced (the basis and the evidence)`);
      else bad(`the GraphChanged row: ${JSON.stringify({ cause, objects: objs }).slice(0, 400)}`);
      const ds = await settled(gc.id);
      const rtv = byKind(ds, 'retrieval'); const check = await retrievalCheck(gc.id);
      const others = ds.filter((d) => d.consumer_kind !== 'retrieval');
      if (ds.length >= liveBroad && rtv !== null && rtv.state === 'applied' && effectsOf(rtv).includes('projections.verified') && check?.mismatched === 0) ok(`deliveries: ${deliveryLine(ds)} — retrieval verified with ${check.mismatched} mismatched${others.every((d) => (d.items ?? []).length === 0) ? '; every other selector empty (no consumer reads a memory record — said)' : '; a consumer selected items (printed above)'}`);
      else bad(`the deliveries of memory_item.recorded: ${deliveryLine(ds) || 'none'}; retrieval check ${JSON.stringify(check)}`);
    }
  }
  if (TEL === null && usable.length > 0) bad('no candidate EVT claim was admitted as a telemetry record (each refusal printed above)');
  // THE QUEUED CLM: the review gate refuses a claim a person has not decided.
  const queued = (await q(`select o.object_id::text id, o.object_version::int v, o.payload ->> 'subject' subject, o.payload ->> 'object_value' object_value, o.payload -> 'review' ->> 'reason' reason, r.queued_reason, r.opened_at
      from objects.canonical_objects o join intelligence.review_current r on r.claim_object_id = o.object_id and r.claim_version = o.object_version and r.state = 'queued'
      where o.tenant_id = $1 and o.domain_id = $2 and o.object_type = 'CLM' and o.payload ->> 'predicate' = 'transit_change_vs_prior_day'
        and not exists (select 1 from objects.canonical_objects x where x.object_id = o.object_id and x.object_version > o.object_version)
      order by r.opened_at desc limit 1`, [T, D]))[0] ?? null;
  if (queued === null) note('no queued CLM transit_change_vs_prior_day stands in the origin (every case decided): the review gate is the harness\'s here (phase6-memory-derived M2), said');
  else {
    const r = await derive(mueller, declared({ basis: { kind: 'claim', id: queued.id }, sourceKind: 'telemetry', title: `Transit change (B19 act — must be refused)` }));
    if (r.status === 409 && r.body?.code === 'EYE-STA-002' && /is queued for review/.test(String(r.body?.message ?? ''))) ok(`the queued CLM ${short(queued.id)}@${queued.v} ("${queued.subject} transit_change_vs_prior_day ${queued.object_value}"; case ${queued.queued_reason}, opened ${iso(queued.opened_at)}) REFUSED as a basis: ${refusalLine(r)}`);
    else bad(`the queued CLM ${short(queued.id)}@${queued.v} as a basis: expected 409 EYE-STA-002 "is queued for review", got ${refusalLine(r)}`);
  }
  // THE WARNING: a warning basis is telemetry only; its record is inferred, its evidence the breaching observation, its indicator named.
  const warnings = await q(`select w.warning_id::text id, w.state, w.title, w.consequence, w.raised_at, w.indicator_id::text indicator_id, w.evidence, i.series_key,
        (select r.source_key from prediction.series_registry r where r.tenant_id = w.tenant_id and r.domain_id = w.domain_id and r.series_key = i.series_key) series_source
      from prediction.warnings_current w left join prediction.indicators_current i on i.indicator_id = w.indicator_id
      where w.tenant_id = $1 and w.domain_id = $2 and w.state in ('raised', 'acknowledged') order by w.raised_at desc limit 6`, [T, D]);
  if (warnings.length === 0) note('no raised or acknowledged warning stands in the origin: the warning basis is the harness\'s here (phase6-memory-derived M3), said');
  for (const w of warnings) {
    if (WREC !== null) break;
    const ev = (Array.isArray(w.evidence) ? w.evidence : []).find((e) => e.kind === 'evidence') ?? null;
    note(`the candidate warning ${short(w.id)} (${w.state}, raised ${iso(w.raised_at)}): "${w.title}" — ${w.consequence}; indicator ${short(w.indicator_id)} on ${w.series_key ?? '?'} (registered under ${w.series_source ?? 'no source'}); breaching evidence ${ev === null ? 'NONE' : `${short(ev.evidence_object_id)}@${ev.evidence_version} (observed ${ev.observation_at}: ${ev.value})`}`);
    const r = await derive(mueller, declared({ basis: { kind: 'warning', id: w.id }, sourceKind: 'telemetry', title: `The corridor warning as a record (B19 act, ${TODAY})`, retention: { profile: 'institutional-record-10y', retainUntil: null, basis: 'the warning record is kept ten years (B19 act)' } }));
    if (!r.ok) { note(`  the product refused the warning ${short(w.id)}: ${refusalLine(r)} — the next candidate`); continue; }
    const m = r.body.memory; WREC = m.itemId;
    showDerived(m, 'K. Müller');
    const dv = (await itemRow(WREC))?.derivation ?? null;
    if (m.sourceKind === 'telemetry' && m.basis.kind === 'warning' && m.basis.object_type === 'WRN' && m.basis.truth_state === 'inferred' && ['raised', 'acknowledged'].includes(m.basis.review_state) && dv?.indicator?.indicator_id === w.indicator_id && (ev === null || (m.evidence ?? []).some((e) => e.object_id === ev.evidence_object_id && Number(e.version) === Number(ev.evidence_version)))) ok(`a warning-based TELEMETRY record: truth ${m.basis.truth_state} (the warning's), review state ${m.basis.review_state} (the warning's state), the indicator ${short(dv.indicator.indicator_id)} on ${dv.indicator.series_key}${dv.indicator.rule ? ` (${dv.indicator.rule})` : ''} in the derivation, the breaching evidence version named`);
    else bad(`the warning derivation's answer: ${JSON.stringify({ sourceKind: m.sourceKind, basis: m.basis, evidence: m.evidence, indicator: dv?.indicator ?? null }).slice(0, 500)}`);
  }
  if (WREC === null && warnings.length > 0) bad('no standing warning was admitted as a telemetry record (each refusal printed above)');
}

/* ── 2. DOCUMENT ─────────────────────────────────────────────────────────── */
console.log('\n2. DOCUMENT — the supply relationship: the newest NORDWERK REL claim on a nordwerk-internal upload derived by K. Müller as a document record; S. Okafor\'s briefing carries it with the basis\'s truth state and the inherited synthetic state');
let DOC = null; let REL = null; let docV1 = null; let docStatement1 = null; let BRIEF = null;
{
  const cands = await q(`select o.object_id::text id, o.object_version::int v, o.lifecycle_state, o.classification, o.event_time, o.payload ->> 'subject' subject, o.payload ->> 'predicate' predicate, o.payload ->> 'object_value' object_value,
        (select r.state from intelligence.review_current r where r.claim_object_id = o.object_id and r.claim_version = o.object_version order by r.opened_at desc limit 1) case_state,
        l.evidence_object_id::text evd_id, l.evidence_digest, e.object_version::int evd_v, e.lifecycle_state evd_state, e.provenance_ref, e.retention_profile evd_retention,
        s.source_key, s.connector_kind, s.source_id::text source_id, s.contract_version::int contract_version, s.data_origin,
        m.manifest_id::text manifest_id, m.legal_hold, exists (select 1 from observation.legal_holds h where h.manifest_id = m.manifest_id and h.lifted_at is null) held_by_row,
        case when m.manifest_id is null then null else observation.manifest_tier(m.manifest_id) end tier, o.recorded_at
      from objects.canonical_objects o
      join lateral (select * from intelligence.claim_lineage l where l.claim_object_id = o.object_id and l.claim_version = o.object_version order by l.evidence_object_id limit 1) l on true
      left join lateral (select * from objects.canonical_objects e where e.object_id = l.evidence_object_id and e.object_type = 'EVD' and e.payload ->> 'content_digest' = l.evidence_digest order by e.object_version desc limit 1) e on true
      left join observation.source_contracts_current s on e.provenance_ref = 'SRC:' || s.source_id::text || '@' || s.contract_version::text
      left join observation.blob_manifests m on m.manifest_id = (e.payload ->> 'manifest_id')::uuid
      where o.tenant_id = $1 and o.domain_id = $2 and o.object_type = 'REL' and o.payload ->> 'subject' like 'NORDWERK%'
        and not exists (select 1 from objects.canonical_objects x where x.object_id = o.object_id and x.object_version > o.object_version)
      order by o.recorded_at desc limit 20`, [T, D]);
  if (cands.length === 0) bad('no NORDWERK REL claim in the origin — run the Phase 3 graph seed first');
  else note(`${cands.length} candidate NORDWERK REL claim(s) (the latest version of each); a hot manifest is preferred, a withdrawn or queued basis, a held manifest and a foreign source are skipped`);
  const ordered = [...cands].sort((a, b) => (b.tier === 'hot') - (a.tier === 'hot'));
  for (const c of ordered) {
    if (DOC !== null) break;
    const why = c.lifecycle_state === 'withdrawn' ? 'its latest version is withdrawn' : ['queued', 'rejected'].includes(String(c.case_state ?? '')) ? `a ${c.case_state} review case stands on it` : c.source_key !== 'nordwerk-internal' ? `its evidence is ${c.source_key ?? 'of no contract row'}, not nordwerk-internal` : c.manifest_id === null ? 'its evidence names no manifest' : (c.legal_hold || c.held_by_row) ? 'its manifest is under a legal hold' : null;
    note(`the candidate REL ${short(c.id)}@${c.v} (${c.lifecycle_state}, ${c.classification}): "${c.subject} ${c.predicate} ${c.object_value}"; evidence ${short(c.evd_id)}@${c.evd_v ?? '?'} (${c.evd_state ?? '?'}) of ${c.source_key ?? 'no contract row'} (${c.connector_kind ?? '—'}, origin ${c.data_origin ?? '—'}); manifest ${short(c.manifest_id)} ${c.tier ?? '—'}${c.legal_hold || c.held_by_row ? ', HELD' : ''}`);
    if (why !== null) { note(`  skipped: ${why}`); continue; }
    if (c.tier !== 'hot') note('  the manifest is in the ARCHIVE tier (B12 re-archived the NORDWERK records; the restore is the B18 idiom, not this act\'s) — the derivation reads no bytes and scene 5 shows the pause without executing anything, so the candidate is taken and said');
    const r = await derive(mueller, declared({ basis: { kind: 'claim', id: c.id }, sourceKind: 'document', title: `NORDWERK supply relationship (B19 act, ${TODAY})`, audience: { classification: 'internal', roles: [], purposes: ['memory', 'briefing'] } }));
    if (!r.ok) { note(`  the product refused REL ${short(c.id)}@${c.v}: ${refusalLine(r)} — the next candidate`); continue; }
    const m = r.body.memory; DOC = m.itemId; REL = c; docV1 = m; docStatement1 = m.statement;
    showDerived(m, 'K. Müller');
    if (m.sourceKind === 'document' && ['extracted', 'asserted'].includes(m.basis.truth_state) && m.basis.id === c.id && m.classification.applied === 'internal' && m.inherited.synthetic_state === (c.data_origin === 'synthetic') && m.source.source_key === 'nordwerk-internal' && (m.seriesKeys ?? []).length === 0) ok(`a DOCUMENT record on the nordwerk-internal upload: synthetic ${m.inherited.synthetic_state} (the contract's data origin ${c.data_origin}, inherited through the evidence), the internal ceiling applied, the retention profile "${m.inherited.retention_profile}" from the ${m.inherited.retention_from}, no series (the kind is the person's declaration; only telemetry is verified against the registry)`);
    else bad(`the document derivation's answer: ${JSON.stringify({ sourceKind: m.sourceKind, basis: m.basis, classification: m.classification, inherited: m.inherited, source: m.source }).slice(0, 500)}`);
  }
  if (DOC === null && cands.length > 0) bad('no candidate REL claim was admitted as a document record (each refusal printed above)');
  // S. Okafor composes a domain briefing: the derived record is carried with the basis's truth state and the inherited synthetic state; the fold says synthetic.
  if (DOC !== null) {
    // The composer folds EVERY flip of its interval; act IV's corridor scenario rests on no forecast and folds restricted (the composer's rule) —
    // so the briefing is composed as a CONTINUATION of the domain's newest briefing (the interval since its known_at), the way the rooms compose.
    // A prior briefing binds its room (a domain briefing continues a domain briefing; a room's continues the room's): the newest briefing
    // of the domain is continued in ITS room (the B18 act's room, or a domain-level one when that is the newest).
    const priorRows = await q(`select briefing_id::text, room_id::text from executive.briefings where tenant_id = $1 and domain_id = $2 order by known_at desc limit 1`, [T, D]);
    const priorBriefingId = priorRows[0]?.briefing_id ?? null; const roomId = priorRows[0]?.room_id ?? null;
    note(priorBriefingId === null ? 'no earlier briefing in the domain: the composition covers the whole history' : `the composition continues the domain's newest briefing ${short(priorBriefingId)}${roomId === null ? ' (a domain briefing)' : ` in its room ${short(roomId)}`} — the interval since its known_at; act IV's forecast-less flip lies before it and would fold the briefing restricted`);
    const b = await call(`${X}/briefings/compose`, so({ action: 'briefing.compose', objectType: 'BRF', consequence: 'C2' }), { roomId, knownAt: new Date().toISOString(), priorBriefingId }, okafor.token);
    if (!b.ok) fail('briefings/compose (s.okafor)', b);
    else {
      const br = b.body.briefing; BRIEF = br.briefingId;
      const item = (br.items ?? []).find((i) => i.kind === 'memory' && i.id === DOC) ?? null;
      const mem = (br.items ?? []).filter((i) => i.kind === 'memory');
      if (item !== null && ['extracted', 'asserted'].includes(item.truth_state) && item.synthetic_state === true && item.details?.derivation?.basis?.id === REL.id && item.details?.derivation?.method_ref === 'memory-derive@1.0.0' && br.controls?.synthetic_state === true) ok(`S. Okafor composed the domain briefing ${short(BRIEF)} (${(br.items ?? []).length} item(s), ${mem.length} of kind memory): DOC carried as { kind memory, version ${item.version}, truth_state ${item.truth_state}, synthetic_state ${item.synthetic_state}, details.derivation.basis ${item.details.derivation.basis.object_type}:${short(item.details.derivation.basis.id)}@${item.details.derivation.basis.version}, method ${item.details.derivation.method_ref}, read_under ${item.details.read_under} }; the briefing's controls fold synthetic_state ${br.controls.synthetic_state} (classification ${br.controls.classification}); the composer's read is on DOC's access ledger`);
      else bad(`the briefing's memory item for DOC: ${JSON.stringify({ item: item === null ? null : { truth_state: item.truth_state, synthetic_state: item.synthetic_state, derivation: item.details?.derivation ?? null }, controls: br.controls ?? null }).slice(0, 500)}`);
      const human = mem.filter((i) => i.id !== DOC && (i.details?.derivation === null || i.details?.derivation === undefined));
      if (human.length > 0) note(`${human.length} human record(s) in the same briefing keep synthetic_state ${[...new Set(human.map((i) => String(i.synthetic_state)))].join('/')} and details.derivation null (the B10 pins hold)`);
    }
  }
}

/* ── 3. COMMUNICATION ────────────────────────────────────────────────────── */
console.log('\n3. COMMUNICATION — stated; one line exercising the kind\'s rule: the same REL derived as a communication record (the kind is the person\'s declaration), withdrawn at once by R. Adler');
note('COMMUNICATION: the demonstration\'s communication-class sources (the eu-sanctions-rss items, the carrier-advisories PDFs) carry no extracted claim; the kind is proven on the harness (phase6-memory-derived M1: a claim on an uploaded record derived as a communication record); no scene here (option b)');
let COM = null;
if (REL !== null) {
  const r = await derive(mueller, declared({ basis: { kind: 'claim', id: REL.id }, sourceKind: 'communication', title: `NORDWERK supply relationship as a communication record (B19 act, ${TODAY})`, audience: { classification: 'internal', roles: [], purposes: ['memory'] } }));
  if (!r.ok) fail('memory/derive as communication (k.mueller)', r);
  else {
    const m = r.body.memory; COM = m.itemId;
    if (m.sourceKind === 'communication' && m.source.connector_kind === 'upload' && (m.seriesKeys ?? []).length === 0) ok(`K. Müller derived ${short(COM)} as a COMMUNICATION record from the same REL — admitted: the kind is the person's declaration (only telemetry is verified against the series registry); the source line still says ${m.source.source_key}@${m.source.contract_version} · ${m.source.connector_kind}; statement digest ${String(m.statementDigest).slice(0, 16)}… (= the document record's: the same basis, the same method)`);
    else bad(`the communication derivation's answer: ${JSON.stringify({ sourceKind: m.sourceKind, source: m.source }).slice(0, 300)}`);
    const w = await withdraw(adler, COM, 'recorded to show the declaration; withdrawn in the same act (B19)');
    if (w.ok && w.body.memory?.state === 'withdrawn') ok(`R. Adler withdrew ${short(COM)} under memory.item.withdraw: ${w.body.memory.state} — the demo keeps one document record per run`); else fail('memory/withdraw (r.adler)', w);
  }
} else note('no document basis: nothing to declare as a communication record');

/* ── 4. THE LIFECYCLE ────────────────────────────────────────────────────── */
console.log('\n4. THE LIFECYCLE — the basis corrected in review (A. Hoffmann challenges, L. Ferreira corrects); J. Weber\'s walk marks DOC basis_corrected; R. Adler re-derives to version 2; L. Brandt replays version 1; the mirror\'s imported claim refused (S. Roth), K. Vogel refused');
let t1 = null; let relNewV = null; let caseId = null;
if (DOC !== null && REL !== null) {
  t1 = await mark();
  const ch = await call(`${I}/review/request`, ah({ action: 'intelligence.review.request', objectType: 'REV' }), { claimObjectId: REL.id, claimVersion: REL.v, reason: 'the purchase ledger restates the object of this relationship; the claim is challenged for review (the B19 demonstration)' }, hoffmann.token);
  if (!ch.ok) fail('review/request (a.hoffmann)', ch);
  else {
    caseId = ch.body.review.caseId;
    ok(`A. Hoffmann challenged REL ${short(REL.id)}@${REL.v}: review case ${short(caseId)} queued (${ch.body.review.reason ?? 'challenged'})`);
    const stripped = String(REL.object_value).replace(/ \(restated [^)]*\)$/, '');
    const dec = await call(`${I}/review/${caseId}/decide`, lf({ action: 'intelligence.review.decide', objectType: 'REV', objectId: caseId, consequence: 'C2' }), { decision: 'correct', reason: 'the purchase ledger is the better source (the B19 demonstration)', correctedValue: { object_value: `${stripped} (restated ${TODAY})` } }, ferreira.token);
    if (!dec.ok) fail('review/decide (l.ferreira)', dec);
    else {
      relNewV = Number(dec.body.review.newVersion);
      ok(`L. Ferreira CORRECTED the claim → REL ${short(REL.id)}@${relNewV} (object value "${stripped} (restated ${TODAY})"; lifecycle corrected, truth asserted); the review case ${dec.body.review.state}`);
      // The MemoryCorrected/claim.corrected row and the relationships subscriber's delivery — printed, not asserted (B10's scene 3 owns that proof).
      const ev = await newestOutbox('MemoryCorrected', Date.parse(t1) - 1000, (p) => p.change?.kind === 'claim.corrected' && (p.claims ?? []).includes(REL.id));
      if (ev === null) note('no MemoryCorrected/claim.corrected row published within 60 s (printed, not asserted)');
      else {
        let d = null;
        for (let i = 0; i < 60; i += 1) { d = byKind(await deliveriesOf(ev.id), 'relationships'); if (d !== null && !['received', 'started'].includes(d.state)) break; await sleep(1000); }
        note(`MemoryCorrected/claim.corrected ${short(ev.id)} published; the relationships subscriber's delivery: ${d === null ? 'none yet' : `${d.state}${d.failure_class ? ` (${d.failure_class} → ${d.disposition})` : ''}, ${(d.items_applied ?? []).length} applied, ${(d.items_unresolved ?? []).length} unresolved${d.last_error ? ` — ${String(d.last_error).slice(0, 120)}` : ''}`} — the edge re-derived under the corrected version or left unresolved (B10's scene; printed, not asserted)`);
      }
      // J. Weber propagates the correction: the walk reaches DOC through its dependency on the claim and marks it for the knowledge owner's attention.
      const pr = await call(`${G}/impact/propagate`, jw({ action: 'graph.impact.propagate', objectType: 'INV', objectId: REL.id }), { triggerKind: 'claim_correction', triggerObjectId: REL.id }, weber.token);
      if (!pr.ok) fail('impact/propagate claim_correction (j.weber)', pr);
      else {
        const im = pr.body.impact; const row = await itemRow(DOC); const last = (await itemEvents(DOC)).at(-1);
        if ((im.memoryItems ?? []).some((x) => (x.strategy_object_id ?? x.item_id) === DOC) && row?.attention_state === 'basis_corrected' && /invalidation/.test(String(row.attention_reason ?? '')) && last?.event === 'memory.attention') ok(`J. Weber propagated claim_correction from REL ${short(REL.id)}: invalidation ${short(im.invalidationId)} — ${im.statement}; DOC ${short(DOC)} reached (${(im.memoryItems ?? []).find((x) => (x.strategy_object_id ?? x.item_id) === DOC).reached_via}) and marked ${row.attention_state}: "${row.attention_reason}"; the ledger's last event memory.attention (invalidation ${short(last.details?.invalidation_id)})`);
        else bad(`the walk's mark on DOC: ${JSON.stringify({ reached: (im.memoryItems ?? []).map((x) => x.strategy_object_id ?? x.item_id), row: row === null ? null : { attention_state: row.attention_state, attention_reason: row.attention_reason }, last: last?.event ?? null }).slice(0, 400)}`);
        const rt = await retrieve(brandt, DOC, 'memory');
        if (rt.ok && rt.body.memory.availability?.basis_state === 'corrected' && rt.body.memory.versionServed === 1) ok(`L. Brandt's retrieval of DOC now says basis_state ${rt.body.memory.availability.basis_state} (attention ${rt.body.memory.availability.attention_state}) — the record is SERVED with the declaration, never refused; version ${rt.body.memory.versionServed} still current`);
        else bad(`the retrieval after the mark: ${rt.status} ${JSON.stringify(rt.body?.memory?.availability ?? rt.body).slice(0, 300)}`);
      }
      // R. Adler RE-DERIVES: memory.item.supersede with payload.basis (the version empty = the latest); the statement recomputed.
      const s = await supersede(adler, DOC, declared({ basis: { kind: 'claim', id: REL.id }, sourceKind: 'document', title: `NORDWERK supply relationship (B19 act, ${TODAY}; re-derived)`, audience: { classification: 'internal', roles: [], purposes: ['memory', 'briefing'] }, supersession: { reason: 'the basis was corrected in review (the B19 demonstration)', effectiveAt: null } }));
      if (!s.ok) fail('memory/supersede with payload.basis (r.adler)', s);
      else {
        const m = s.body.memory; const row = await itemRow(DOC);
        showDerived(m, 'R. Adler');
        if (m.version === 2 && m.priorVersion === 1 && m.basis.version === relNewV && m.basis.truth_state === 'asserted' && m.basis.review_state === 'corrected' && String(m.statement).includes(`(restated ${TODAY})`) && m.statement !== docStatement1 && row?.object_version === 2 && row.attention_state === 'none' && row.superseded_versions === 1) ok(`R. Adler RE-DERIVED DOC under memory.item.supersede → version ${m.version} (prior ${m.priorVersion}) on REL@${m.basis.version} (${m.basis.truth_state}, review ${m.basis.review_state}): the statement RECOMPUTED with the restated value (the digest ${String(m.statementDigest).slice(0, 12)}… ≠ version 1's ${String(docV1.statementDigest).slice(0, 12)}…); the projection at version ${row.object_version}, attention ${row.attention_state}, ${row.superseded_versions} superseded`);
        else bad(`the re-derivation's answer: ${JSON.stringify({ version: m.version, priorVersion: m.priorVersion, basis: m.basis, statement: m.statement, row: row === null ? null : { object_version: row.object_version, attention_state: row.attention_state } }).slice(0, 500)}`);
        const rp = await retrieve(brandt, DOC, 'memory', t1);
        if (rp.ok && rp.body.memory.versionServed === 1 && rp.body.memory.version?.payload?.statement === docStatement1 && rp.body.memory.version?.payload?.derivation?.basis?.version === REL.v) ok(`L. Brandt replayed DOC as of ${t1} (before the correction): version ${rp.body.memory.versionServed} served with VERSION 1's statement and derivation (basis REL@${rp.body.memory.version.payload.derivation.basis.version}) — availability: current_version ${rp.body.memory.availability.current_version}, served_is_current ${rp.body.memory.availability.served_is_current}`);
        else bad(`the as-of replay: ${rp.status} ${JSON.stringify({ served: rp.body?.memory?.versionServed, statement: rp.body?.memory?.version?.payload?.statement, basis: rp.body?.memory?.version?.payload?.derivation?.basis }).slice(0, 400)}`);
      }
    }
  }
} else note('no document record: the lifecycle scene has nothing to correct');
// THE MIRROR: an imported claim is refused as a basis (409); a non-holder is refused by the policy (403).
if (mirrorReady) {
  const imp = (await q(`select o.object_id::text id, o.object_version::int v, o.object_type, o.payload ->> 'subject' subject, o.payload ->> 'predicate' predicate, o.payload -> 'imported_from' ->> 'import_id' import_id
      from objects.canonical_objects o where o.tenant_id = $1 and o.domain_id = $2 and o.object_type in ('ENT', 'EVT', 'CLM', 'REL', 'ASM') and jsonb_typeof(o.payload -> 'imported_from') = 'object' and o.lifecycle_state <> 'withdrawn'
        and not exists (select 1 from objects.canonical_objects x where x.object_id = o.object_id and x.object_version > o.object_version)
      order by o.recorded_at desc limit 1`, [T, D2]))[0] ?? null;
  if (imp === null) note('the mirror holds no imported claim whose latest version stands (B17\'s revocation withdrew them; B16\'s import may have been revoked): the imported-claim refusal is the harness\'s here, said');
  else {
    const mscope = { tenantId: T, domainId: D2 };
    const r = await deriveIn(roth, mscope, declared({ basis: { kind: 'claim', id: imp.id }, sourceKind: 'document', title: `An imported claim as a record (B19 act — must be refused)` }));
    if (r.status === 409 && r.body?.code === 'EYE-STA-002' && /is imported \(import [^)]+\); an imported claim is derived at its origin and re-imported; it is not derived here/.test(String(r.body?.message ?? ''))) ok(`THE MIRROR: S. Roth (strategy_owner, a holder) derived from the imported ${imp.object_type} ${short(imp.id)}@${imp.v} ("${imp.subject} ${imp.predicate}", import ${short(imp.import_id)}) → REFUSED: ${refusalLine(r)} — the honest boundary while the cross-domain reference is missing (B17's "copies destroyed" stays true)`);
    else bad(`the imported claim as a basis in the mirror: expected 409 EYE-STA-002 "is imported", got ${refusalLine(r)}`);
    const v = await deriveIn(vogel, mscope, declared({ basis: { kind: 'claim', id: imp.id }, sourceKind: 'document', title: `A twin owner's derivation (B19 act — must be refused)` }));
    if (v.status === 403) ok(`K. Vogel (twin_owner, not a holder of memory.item.derive) → ${refusalLine(v)}`); else bad(`K. Vogel's derivation: expected 403, got ${refusalLine(v)}`);
  }
}

/* ── 5. THE DELETION PAUSE ───────────────────────────────────────────────── */
console.log('\n5. THE DELETION PAUSE — M. Dvorak corrects the evidence DOC copies from; the propagation agent (or J. Weber) marks DOC; P. Novák\'s deletion of the evidence\'s manifest resolves PAUSED naming memory_item:DOC with its route; the action withdrawn');
let DEL = null;
if (DOC !== null && REL !== null) {
  const EVD_N = REL.evd_id; const manifest = REL.manifest_id;
  const src = String(REL.provenance_ref ?? '').replace(/^SRC:/, '').split('@')[0];
  const t5 = await mark();
  const sub = await call(`${O}/corrections/submit`, md({ action: 'observation.correction.receive', objectType: 'COR' }), { sourceId: src, kind: 'correction', channel: 'operator re-upload', publisherRef: 'B19 act', reason: 'the shipment record restated by the operator (the B19 demonstration)', affectedEvdIds: [EVD_N] }, dvorak.token);
  if (!sub.ok) fail('corrections/submit (m.dvorak)', sub);
  else {
    const cId = sub.body.correction.caseId;
    const ap = await call(`${O}/corrections/${cId}/apply`, md({ action: 'observation.correction.apply', objectType: 'COR', objectId: cId }), { decision: 'apply', affectedEvdIds: [EVD_N], reason: 'restatement verified against the ledger (the B19 demonstration)' }, dvorak.token);
    if (!ap.ok) fail('corrections/apply (m.dvorak)', ap);
    else {
      const sup = (ap.body.correction?.superseded ?? []).find((x) => x.object_id === EVD_N) ?? null;
      ok(`M. Dvorak submitted and applied correction case ${short(cId)} on the evidence ${short(EVD_N)} (source ${REL.source_key}): ${ap.body.correction?.state}${sup ? `, EVD version ${sup.from} → ${sup.to} (lifecycle corrected; the manifest ${short(manifest)} and its digest kept)` : ''} — the object's latest version is now corrected, so its manifest is deletable by the retention rule`);
      // The mark: the propagation agent's automatic walk (registered since B1), else J. Weber's manual walk — the act says which.
      let row = null; let marked = false;
      for (let i = 0; i < 60; i += 1) { row = await itemRow(DOC); if (row?.attention_state === 'basis_corrected') { marked = true; break; } await sleep(1000); }
      if (marked) ok(`the propagation AGENT walked the correction (registered since B1; ${((Date.now() - Date.parse(t5)) / 1000).toFixed(1)} s after the apply): DOC marked ${row.attention_state} — "${row.attention_reason}" (nobody called /impact/propagate)`);
      else {
        note('the propagation agent did not mark DOC within 60 s (the consumer is not live on this target, or its budget refused the walk): J. Weber walks the correction by hand — the operator route');
        const pr = await call(`${G}/impact/propagate`, jw({ action: 'graph.impact.propagate', objectType: 'INV', objectId: EVD_N }), { triggerKind: 'evidence_correction', triggerObjectId: EVD_N, correctionCaseId: cId }, weber.token);
        row = await itemRow(DOC);
        if (pr.ok && (pr.body.impact.memoryItems ?? []).some((x) => (x.strategy_object_id ?? x.item_id) === DOC) && row?.attention_state === 'basis_corrected') ok(`J. Weber propagated evidence_correction from ${short(EVD_N)} (case ${short(cId)}): invalidation ${short(pr.body.impact.invalidationId)}; DOC marked ${row.attention_state} — "${row.attention_reason}"`);
        else bad(`the manual walk: ${pr.ok ? JSON.stringify({ reached: (pr.body.impact.memoryItems ?? []).map((x) => x.strategy_object_id ?? x.item_id), row: row === null ? null : row.attention_state }).slice(0, 300) : refusalLine(pr)}`);
      }
      const last = (await itemEvents(DOC)).at(-1);
      note(`DOC's last ledger event: ${last?.event} v${last?.object_version} (${JSON.stringify({ invalidation_id: last?.details?.invalidation_id ?? null, trigger_kind: last?.details?.trigger_kind ?? null, attention_state: last?.details?.attention_state ?? null, correction_case_id: last?.details?.correction_case_id ?? null })})`);
      // P. Novák opens the deletion of the corrected evidence's manifest and resolves it: PAUSED, the derived record named with its route.
      const o = await call(`${R}/actions/open`, pn({ action: 'retention.action.open', objectType: 'RTA' }), { kind: 'deletion', targetKind: 'evidence', selector: { manifestId: manifest }, retentionProfile: REL.evd_retention ?? null, reason: 'the corrected shipment record is past its retention (the B19 demonstration: the pause is shown; nothing is retired)' }, novak.token);
      if (!o.ok) fail('actions/open deletion (p.novak)', o);
      else {
        DEL = o.body.action.actionId;
        const rs = await call(`${R}/actions/${DEL}/resolve`, pn({ action: 'retention.action.resolve', objectType: 'RTA', objectId: DEL }), {}, novak.token);
        if (!rs.ok) fail('actions/resolve (p.novak)', rs);
        else {
          const sc = rs.body.scope; const ar = await actionRow(DEL);
          const items = await q(`select disposition, reason, details from retention.scope_items where action_id = $1 order by dependency_order`, [DEL]);
          const blocking = items.find((it) => it.disposition === 'blocking') ?? null;
          const deps = blocking?.details?.dependents ?? [];
          const mine = deps.find((d) => d.kind === 'memory_item' && d.ref === DOC) ?? null;
          if (sc.state === 'paused' && Number(sc.blocking) >= 1 && ar?.failure_class === 'unresolved_dependency' && ar?.disposition === 'human_review' && new RegExp(`memory_item:${DOC}`).test(String(ar.failure_reason ?? '')) && mine !== null && /withdraw the memory record \(memory\.item\.withdraw\) or supersede it on other evidence \(memory\.item\.supersede\); then resolve again/.test(String(mine.route ?? ''))) ok(`P. Novák opened deletion ${short(DEL)} of manifest ${short(manifest)} and resolved it: state ${sc.state}, ${sc.items} item(s), ${sc.execute} to execute, ${sc.blocking} blocking — ${ar.failure_class} → ${ar.disposition}: "${ar.failure_reason}"`);
          else bad(`the deletion's resolution: ${JSON.stringify({ scope: sc, action: ar, dependents: deps.map((d) => `${d.kind}:${d.ref}`) }).slice(0, 600)}`);
          for (const d of deps) note(`  dependent ${d.kind}:${short(d.ref)}${d.kind === 'memory_item' ? ` — record version ${d.record_version}, basis ${d.basis}, attention ${d.attention_state}` : d.claim ? ` — claim ${d.claim}` : ''}; route: ${d.route}`);
          if (mine !== null && Number(mine.record_version) === 2 && String(mine.basis ?? '').startsWith(`REL:${REL.id}@${relNewV}`)) ok(`the derived record named as a dependent: memory_item:${short(DOC)} at record version ${mine.record_version} on ${mine.basis} (attention ${mine.attention_state}) — version-aware (the evidence version DOC copies from is among the manifest's versions, and its basis's lineage names the bytes digest); the route is the record authority's withdrawal or a re-derivation on other evidence`);
          const residuals = await q(`select kind, count::int, status from retention.residual_inventory where action_id = $1 order by kind`, [DEL]);
          note(`the residual inventory (what stays whatever the deletion does): ${residuals.map((r) => `${r.kind} ×${r.count} ${r.status}`).join(', ') || 'none'} — a person's own record citing this evidence would be a dependency residual here, never a block (the harness's M5 control)`);
          const w = await call(`${R}/actions/${DEL}/withdraw`, pn({ action: 'retention.action.withdraw', objectType: 'RTA', objectId: DEL }), { reason: 'the pause shown; nothing is retired by the act (the B19 demonstration)' }, novak.token);
          if (w.ok && (await actionRow(DEL))?.state === 'withdrawn') ok(`P. Novák WITHDREW the deletion ${short(DEL)}: the manifest, its bytes and DOC stand as they were`); else fail('actions/withdraw (p.novak)', w);
        }
      }
    }
  }
} else note('no document record: no deletion pause to show');

/* ── 6. THE STATE ────────────────────────────────────────────────────────── */
console.log('\n6. THE STATE — the listing\'s Source column for this run\'s records; DOC\'s events; the register; what the act leaves; the stated limits');
{
  const mine = [TEL, WREC, DOC, COM].filter((x) => x !== null);
  const l = await listMemory();
  if (!l.ok) fail('memory/list (k.mueller)', l);
  else {
    const rows = (l.body.memory ?? []).filter((r) => mine.includes(r.item_id));
    const line = (r) => { const b = r.derivation?.basis ?? null; return `${short(r.item_id)} ${r.state} v${r.object_version} ${r.source_kind}${b === null ? '' : ` ← ${b.object_type}:${short(b.id)}@${b.version}`} (attention ${r.attention_state}; ${r.classification}; ${r.retention_profile})`; };
    const leak = JSON.stringify(rows).includes(String(docStatement1 ?? ' '));
    if (rows.length === mine.length && rows.every((r) => r.derivation !== null && r.derivation !== undefined && r.derivation.basis !== undefined && r.derivation.evidence === undefined && r.derivation.statement_digest === undefined) && !leak) ok(`the memory listing (K. Müller) names the basis beside the kind for this run's ${rows.length} record(s): ${rows.map(line).join('; ')} — the listing form of the derivation carries the basis, the source key, the method and the series keys, no evidence digest, no statement digest, no content`);
    else bad(`the listing rows of this run: ${JSON.stringify(rows.map((r) => ({ id: short(r.item_id), source_kind: r.source_kind, derivation: r.derivation ?? null }))).slice(0, 500)}${leak ? ' — THE STATEMENT LEAKED INTO THE LISTING' : ''}`);
  }
  if (DOC !== null) {
    const evs = await itemEvents(DOC);
    const life = evs.map((e) => e.event).filter((e) => e !== 'memory.retrieved');
    const expected = ['memory.recorded', 'memory.attention', 'memory.superseded', 'memory.attention'];
    if (JSON.stringify(life) === JSON.stringify(expected)) ok(`DOC's events: ${evs.map((e) => `${e.event}${e.event === 'memory.retrieved' ? ` (${e.details?.purpose})` : ''}`).join(' → ')} — recorded (derived), marked by the claim's correction, re-derived, marked by the evidence's correction`);
    else bad(`DOC's lifecycle events: ${life.join(' → ')} (expected ${expected.join(' → ')})`);
  }
  await registerLine('after');
  const tel = TEL === null ? null : await itemRow(TEL); const wr = WREC === null ? null : await itemRow(WREC); const doc = DOC === null ? null : await itemRow(DOC); const com = COM === null ? null : await itemRow(COM);
  const relRow = REL === null ? null : (await q(`select max(object_version)::int v, (array_agg(lifecycle_state order by object_version desc))[1] state from objects.canonical_objects where object_id = $1`, [REL.id]))[0];
  const evdRow = REL === null ? null : (await q(`select max(object_version)::int v, (array_agg(lifecycle_state order by object_version desc))[1] state from objects.canonical_objects where object_id = $1`, [REL.evd_id]))[0];
  note(`WHAT THE ACT LEAVES: the telemetry record ${short(TEL)} ${tel?.state ?? '?'} v${tel?.object_version ?? '?'} (attention ${tel?.attention_state ?? '?'}); the warning record ${short(WREC)} ${wr?.state ?? '?'} v${wr?.object_version ?? '?'}; DOC ${short(DOC)} ${doc?.state ?? '?'} v${doc?.object_version ?? '?'} (attention ${doc?.attention_state ?? '?'}); COM ${short(COM)} ${com?.state ?? '?'}; REL ${short(REL?.id)} at version ${relRow?.v ?? '?'} (${relRow?.state ?? '?'}; a review correction per run); its evidence ${short(REL?.evd_id)} at version ${evdRow?.v ?? '?'} (${evdRow?.state ?? '?'}; a corrected version per run, the manifest kept); the deletion action ${short(DEL)} ${DEL === null ? '' : (await actionRow(DEL))?.state}; the briefing ${short(BRIEF)}; the review case ${short(caseId)} corrected`);
}
note('STATED: the observed series-window basis (truth_state observed for telemetry) is owed — graph → prediction would be circular, so a telemetry record in B19 is extracted (a claim) or inferred (a warning); the communication kind is exercised on the harness; the source kinds beyond the telemetry rule are the owner\'s declaration (no contract-level source class); a policy change or an ontology change has no recorded cause on a record; retention of memory items is declared, not executed; an imported claim is refused as a basis until the cross-domain reference exists; no consumer reads a derived record beyond the existing memory_item.recorded deliveries; a warning-based record is not marked when its forecast is withdrawn as unfit (the warning stands input_unverified; no caller of mark_basis_withdrawn for a warning); the withdrawn-basis mark (basis_withdrawn) is the harness\'s (a withdrawal by correction, a claim_withdrawal walk, the revocation port\'s unit)');
note('STATED: no consumer method changed in B19 — the seven subscriptions were listed and left; the propagation agent\'s walk of scene 5 is B1\'s consumer, unchanged');

console.log(`\nWHAT THE DEMONSTRATION SHOWED: a memory record DERIVED by a person from what the product already holds — the corridor's transit count from the PortWatch claim as a telemetry record (the series registered on the source, the evidence version and bytes named, extracted never observed), the corridor warning as an inferred telemetry record with its indicator, the NORDWERK supply relationship as a document record carrying the synthetic state and the internal ceiling of the upload it copies from, S. Okafor's briefing carrying it with the basis's truth state; the queued claim and the mirror's imported claim REFUSED with the words, a non-holder refused; the basis corrected in review → the record marked and RE-DERIVED to version 2 with the statement recomputed while version 1 replays as of its instant; the evidence corrected → the record marked again and the deletion of the evidence's manifest PAUSED naming the record with the route; the register at 36 bound with L3-I01's clause.`);
console.log(`WHAT THE HARNESS ALONE PROVES (phase6-memory-derived on a fresh database): the lift of a confidential basis said and enforced on the deriver (a knowledge owner refused, the domain administrator admitted); a withdrawn basis and withdrawn evidence refused; the port's own digest re-verification and kind-class rule; the basis_withdrawn mark by the corrections path, a claim_withdrawal walk and the revocation port's unit, the record SERVED with basis_state withdrawn; a person's record citing the evidence a residual, never a block; the version-aware clause probed on the function; the communication kind; MEM@v2 validated against the registry.`);
const failures = failureCount();
console.log(`\n${failures === 0 ? 'ALL SCENES HELD' : `${failures} FAILURE(S)`}`);
await su.end();
process.exit(failures === 0 ? 0 : 1);
