#!/usr/bin/env node
/**
 * CP-6 batch B28 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): STREAM PROCESSING,
 * THE WEAK-SIGNAL WORKBENCH, THE EARLY-WARNING LIFECYCLE and the two B24 carryovers (migration 0088), exercised by the personas through
 * the REAL HTTP path, each scene stating the effect it produced in the ledgers — and where nothing happened, saying so. EVERY OBJECT IS
 * LOOKED UP AT RUN TIME by SQL against the database the act is pointed at: no id is hard-coded. No clock is moved, no row is planted and no
 * test hook is used: the act WAITS for the attention agent's real scheduled ticks (60 s) and for the real one-hour response window (about an hour,
 * the act's last scene). REHEARSALS ONLY: ACT_FAST_EXPIRY=1 moves that one warning's window into the past with the superuser (said on the output);
 * the flag is ignored on eye_demo.
 *
 *   B28-0 THE STATE: 0088 applied; the register (50 / 0 / 0 — B28 adds no interface); every live subscription whose consumer identity
 *         changed in 0088 (the attention consumer's METHOD_REF) REVOKED and registered anew by the administrator, the backlog LEFT; the two
 *         new kinds `stream-rules` (ObservationRecorded) and `warnings` (GraphChanged) registered the same way; the WEAK SIGNAL AGENT
 *         registered (the administrator — kind weak_signal, this runtime's scan, accountable M. Dvořák, escalation A. Hoffmann, max_items);
 *         M. Dvořák publishes attention policy VERSION 5 = the active version + `min_novelty` 0.9 on warning.raised and a 90-minute
 *         acknowledgement (longer than the one-hour response window the L scene uses, so the warning's EXPIRY is what escalates it).
 *   B28-W F-P4-10: N. Eriksen nominates "Red Sea war-risk insurers withdrawing cover" from a cluster of low-confidence reports (two SYNTHETIC
 *         carrier advisories and the GDELT discovery record); A. Hoffmann TESTS SOURCE INDEPENDENCE (the pair verdicts from the records)
 *         and marks it MONITOR with a falsify condition; the nominator's own disposition refused, `monitor` without a falsify condition
 *         refused; the maturity untouched (it moves only by corroboration).
 *   B28-L F-P4-12 (part 1): three sources report the same Bab el-Mandeb incident — GDELT (supporting), the NORDWERK shipment record
 *         (supporting), IMF PortWatch's count of the day (contradicting); each nominated by N. Eriksen and ESCALATED by A. Hoffmann with a
 *         one-hour response window against the Regensburg objective → three candidates of ONE key; the attention agent's scheduled tick
 *         decides them and RAISES the owed one right after the tick (its run output `after.warning-raise`); the next tick folds the other
 *         two → ONE warning, three members, one contradicting, routed to J. Weber (the objective's owner); J. Weber sets the context
 *         (contradicting evidence, the affected Regensburg objective, a falsification condition, a SIMULATION playbook).
 *   B28-S F-P4-11: the SYNTHETIC late stream source registered (A. Hoffmann), approved and activated (M. Dvořák), its collection agent
 *         provisioned (the administrator); N. Eriksen registers its series, defines and activates the corridor rule (its owner) and starts
 *         the processor; M. Dvořák acquires the stream (the B23 stream form) — pages arrive LATE and OUT OF ORDER; the stream-rules consumer
 *         feeds the processor; windows fire on the WATERMARK (event time), the late page REVISES its window labelled late_window, the
 *         publisher gap's window is PARTIAL; each holding window's candidate submitted ONCE (a subscription replay re-delivers everything:
 *         repeated no-ops); the tick raises the stream warnings.
 *   B28-A (the B24 carryover (b)) and B28-R (carryover (a)) on ONE suspension of "the Regensburg supplier-portal source" — the demonstration
 *         has no supplier-portal source: the nearest real one is NORDWERK's internal records (the SYNTHETIC supplier / shipment records NORDWERK
 *         uploads), SAID: J. Weber declares an assumption resting on two claims the B24 upload's extraction admitted from that source's
 *         evidence; L. Brandt's act-owned package cites it in its chosen option; S. Okafor approves; M. Dvořák SUSPENDS the source →
 *         markers on the assumption and the package (through the assumption); L. Brandt's commitment REFUSED until they acknowledge the
 *         bearing marker for that version; the coverage-loss item → M. Dvořák opens a REMEDIATION (fallback: the corridor stream;
 *         the re-collection PLANNED — a suspended contract records no run, so the step names none, 0088 §I), shown on the Bab el-Mandeb warning's coverage gap; reactivated → markers cleared,
 *         the remediation CLOSED closed_recovered automatically.
 *   B28-N F-P6-07: M. Dvořák triggers the Weak Signal Agent's scan (as of an observation day in the corridor collapse) — it nominates and
 *         ranks; its attempt to dispose refused at the PDP and recorded; A. Hoffmann escalates its NOVELTY signal; the tick raises it; the
 *         routed warning item carries the novelty dimension FROM THE DETECTOR'S MEASURE and the engine's reason under min_novelty.
 *   B28-L (part 2): the Bab el-Mandeb warning EXPIRES unacknowledged — the tick's `warning-expiry` step — and its attention item is
 *         ESCALATED at once (`warning.escalated`); J. Weber marks it `late`; M. Dvořák runs the warning evaluation — the feedback in it.
 *   B28-9 THE STATE and the LIMITS said.
 *
 * CASTING (the seed's personas; no human persona is created — each one's recorded roles are read from identity.role_bindings before the
 * act): M. Dvořák (executive, collection_manager), N. Eriksen (forecast_owner), J. Weber (strategy_owner), L. Brandt (decision_owner,
 * decision_authority), A. Hoffmann (domain_analyst), S. Okafor (decision_approver); the administrator = the platform-admin session. The
 * agent principals are the product's (created through the governed routes). Nothing here prints a credential.
 */
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';
import { STREAM_SOURCE_CONTRACTS } from '../phase1/source-contracts.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const requireApi = createRequire(join(ROOT, 'apps', 'api', 'package.json'));
const pg = requireApi('pg');
// THE RUNTIME'S IDENTITIES, read from the build the API runs (apps/api/dist): the attention timer's and the Weak Signal Agent's scan.
const { ATTENTION_TIMER_VERSION, ATTENTION_TIMER_DIGEST } = requireApi('./dist/executive/attention/timer-identity.js');
const { WEAK_SIGNAL_AGENT_VERSION, WEAK_SIGNAL_AGENT_DIGEST, WEAK_SIGNAL_AGENT_METHOD } = requireApi('./dist/prediction/signals/signal-agent-identity.js');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const DB_NAME = env.EYE_DB_NAME ?? 'eye_demo';
const REHEARSAL = DB_NAME !== 'eye_demo';
// ACT_FAST_EXPIRY=1 (rehearsals only): the L scene's warning window is moved into the past instead of waited for; refused on eye_demo.
const FAST_EXPIRY = process.env.ACT_FAST_EXPIRY === '1' && REHEARSAL;
if (process.env.ACT_FAST_EXPIRY === '1' && !REHEARSAL) console.log('  · ACT_FAST_EXPIRY is IGNORED on eye_demo: the act waits for the real one-hour response window');
const X = `/v1/tenants/${T}/domains/${D}`; const G = `${X}/graph`; const O = `${X}/observation`; const E = `${X}/executive/attention`; const P = `${X}/prediction`; const DC = `${X}/decisions`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 8)}…`);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (v) => (v === null || v === undefined ? null : v instanceof Date ? v.toISOString() : String(v));
const day = (v) => (v === null || v === undefined ? null : (v instanceof Date ? v.toISOString() : String(v)).slice(0, 10));
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return s; };
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 260)}`;
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const mark = async () => (await q('select clock_timestamp() t'))[0].t;
const tStart = Date.now();
const elapsed = () => `${((Date.now() - tStart) / 60000).toFixed(1)} min`;
console.log(`THE B28 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()}`);

/* ── the casting: each persona's recorded roles read before it acts ─────────────────── */
const CAST = { 'm.dvorak': ['executive', 'collection_manager'], 'n.eriksen': ['forecast_owner'], 'j.weber': ['strategy_owner'], 'l.brandt': ['decision_owner', 'decision_authority'],
  'a.hoffmann': ['domain_analyst'], 's.okafor': ['decision_approver'] };
{
  const rows = await q(`select p.login_name, array_agg(b.role_code order by b.role_code) roles from identity.principals p join identity.role_bindings b on b.principal_id = p.id
                         where b.revoked_at is null and b.tenant_id = $1 and b.domain_id = $2 and p.login_name = any($3::text[]) group by 1`, [T, D, Object.keys(CAST)]);
  const missing = Object.entries(CAST).map(([l, need]) => [l, need.filter((r) => !(rows.find((x) => x.login_name === l)?.roles ?? []).includes(r))]).filter(([, m]) => m.length > 0);
  if (missing.length === 0) ok(`the casting read from identity.role_bindings: ${rows.map((r) => `${r.login_name} (${r.roles.join(', ')})`).join('; ')}`);
  else { bad(`a persona does not hold the role the act casts it in: ${missing.map(([l, m]) => `${l} lacks ${m.join(', ')}`).join('; ')}`); process.exit(1); }
}
const dvorak = await who('m.dvorak'); const eriksen = await who('n.eriksen'); const weber = await who('j.weber'); const brandt = await who('l.brandt');
const hoffmann = await who('a.hoffmann'); const okafor = await who('s.okafor');
const env_ = (s, purpose) => (over) => as(s, scope, { purposeId: purpose, ...over });
const ad = (over) => as(admin, scope, { purposeId: over.purposeId ?? 'platform.administration', ...over });
const NAME = { [dvorak.principalId]: 'M. Dvořák', [eriksen.principalId]: 'N. Eriksen', [weber.principalId]: 'J. Weber', [brandt.principalId]: 'L. Brandt',
  [hoffmann.principalId]: 'A. Hoffmann', [okafor.principalId]: 'S. Okafor', [admin.principalId]: 'the administrator' };
const loginOf = async (principalId) => NAME[principalId] ?? (await q(`select case when kind = 'agent' then 'agent ' || coalesce(display_name, login_name) else coalesce(login_name, display_name) end n from identity.principals where id = $1`, [principalId]))[0]?.n ?? short(principalId);

/* ── the outbox, the deliveries, the ticks ──────────────────────────────────────────── */
const TERMINAL = ['applied', 'failed', 'refused', 'unresolved'];
const deliveriesOf = (eventId) => q(`select d.subscription_id::text, d.consumer_kind, d.state, d.items, d.items_applied, d.last_error from graph.subscription_deliveries d
                                       join graph.subscriptions s on s.subscription_id = d.subscription_id and s.status <> 'revoked' where d.event_id = $1 order by d.consumer_kind`, [eventId]);
async function settled(eventId, kinds, seconds = 150) {
  let ds = [];
  for (let i = 0; i < seconds; i += 1) {
    ds = (await deliveriesOf(eventId)).filter((d) => kinds.includes(d.consumer_kind));
    if (ds.length >= kinds.length && ds.every((d) => TERMINAL.includes(d.state))) return ds;
    await sleep(1000);
  }
  return ds;
}
async function waitOutbox(eventType, pred, notBefore, seconds = 90) {
  for (let i = 0; i < seconds; i += 1) {
    const rows = await q(`select id::text, status, payload, partition_seq::int, created_at from objects.object_outbox where event_type = $1 and tenant_id = $2 and domain_id = $3 and created_at >= $4 order by created_at desc limit 200`, [eventType, T, D, notBefore]);
    const row = rows.find((r) => pred(r.payload ?? {})) ?? null;
    if (row !== null && row.status === 'published') return row;
    await sleep(1000);
  }
  return null;
}
const effects = (d) => { const m = new Map(); for (const x of d?.items_applied ?? []) m.set(x.effect, (m.get(x.effect) ?? 0) + 1); return [...m].map(([k, n]) => `${k} ×${n}`).join(', ') || 'no effect'; };
const tally = (rows, key) => { const m = new Map(); for (const r of rows) m.set(r[key], (m.get(r[key]) ?? 0) + 1); return [...m].map(([k, n]) => `${k} ${n}`).join(', ') || 'none'; };
const activePolicy = async () => (await q(`select policy_id::text, version, rules from executive.attention_policies where tenant_id = $1 and domain_id = $2 and state = 'active'`, [T, D]))[0] ?? null;
/** The attention agent's tick runs recorded since an instant (the run's outputs carry the steps and the after-tick hooks). */
const ticksSince = (t) => q(`select run_id::text, started_at, outputs, trigger_kind, trigger_ref, principal_id::text from executive.agent_runs where tenant_id = $1 and domain_id = $2 and task = 'attention_tick'
                              and agent_kind = 'attention' and started_at >= $3 and outcome = 'finished' order by started_at`, [T, D, t]);
/** The tick run whose after-tick hook `warning-raise` raised the candidate. */
const raisingTick = async (candidateId) => (await q(`select run_id::text, started_at, trigger_kind, trigger_ref, outputs from executive.agent_runs where tenant_id = $1 and domain_id = $2 and task = 'attention_tick'
                              and outputs -> 'after' -> 'warning-raise' -> 'results' @> $3::jsonb order by started_at limit 1`, [T, D, JSON.stringify([{ candidate_id: candidateId }])]))[0] ?? null;
const candidateRow = async (id) => (await q(`select candidate_id::text, origin_kind, origin_key, state, warning_id::text, cause_key, affected, evidence, outcome, response_window_hours, consequence_class, confidence::float8 confidence, title
                                              from prediction.warning_candidates where candidate_id = $1`, [id]))[0] ?? null;
async function waitCandidates(ids, done, seconds = 200) {
  let rows = [];
  for (let i = 0; i < seconds; i += 1) {
    rows = []; for (const id of ids) rows.push(await candidateRow(id));
    if (rows.every((r) => r !== null && done(r))) return rows;
    await sleep(1000);
  }
  return rows;
}
const warningRow = async (id) => (await q(`select warning_id::text, title, state, routed_to::text, origin_kind, origin_ref, cluster_id::text, consequence_class, level, confidence::float8 confidence, raised_at,
                                            response_window_opens_at, response_window_closes_at, expired_as_of, context_version, affected, falsification, playbook, contradicting, closure, forecast_id::text
                                            from prediction.warnings_current where warning_id = $1`, [id]))[0] ?? null;
const warningEvents = (id) => q(`select event, actor_principal_id::text actor, details, occurred_at from prediction.warning_events where warning_id = $1 order by occurred_at, event_id`, [id]);
const itemOfWarning = async (id) => (await q(`select item_id::text, state, outcome, owner_principal_id::text, route_roles, policy_version, evaluation, due_at, escalations, created_at
                                              from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class = 'warning.raised' and subject_id = $3 order by created_at desc limit 1`, [T, D, id]))[0] ?? null;
async function waitItemOfWarning(id, seconds = 150) {
  let it = null;
  for (let i = 0; i < seconds && it === null; i += 1) { it = await itemOfWarning(id); if (it === null) await sleep(1000); }
  return it;
}
const itemEvents = (id) => q(`select event, actor_principal_id::text actor, details, occurred_at from executive.attention_item_events where item_id = $1 order by occurred_at, event_id`, [id]);

/* ── the routes ─────────────────────────────────────────────────────────────────────── */
const interfaces = () => call(`${G}/interfaces`, env_(weber, 'graph')({ action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, weber.token);
const subscriptionStatus = async () => {
  const r = await call(`${G}/subscriptions/status`, ad({ action: 'graph.read', objectType: 'SUB', sideEffect: 'none' }), {}, admin.token);
  return r.ok ? r.body.subscriptions : (fail('subscriptions/status', r), null);
};
const registerSub = (kind, owner) => call(`${G}/subscriptions/register`, ad({ action: 'graph.subscription.register', objectType: 'SUB', consequence: 'C2' }), { consumerKind: kind, ownerPrincipalId: owner, backlog: 'leave' }, admin.token);
const replaySub = (id, fromSeq, reason) => call(`${G}/subscriptions/${id}/replay`, ad({ action: 'graph.subscription.replay', objectType: 'SUB', objectId: id, consequence: 'C2' }), { fromSeq, reason }, admin.token);
const publish = (s, rules, reason) => call(`${E}/policy/publish`, env_(s, 'executive')({ action: 'executive.attention.policy.publish', objectType: 'ATP', consequence: 'C2' }), { rules, reason }, s.token);
const registerAgent = (payload) => call(`${X}/agents/decision/register`, ad({ action: 'agent.register', objectType: 'AGT' }), payload, admin.token);
const runAgent = (s, agentId, payload) => call(`${X}/agents/decision/${agentId}/run`, env_(s, 'prediction')({ action: 'agent.trigger', objectType: 'AGT', objectId: agentId }), payload, s.token);
const pr = (s) => env_(s, 'prediction');
const nominate = (s, payload) => call(`${P}/signals/nominate`, pr(s)({ action: 'prediction.signal.nominate', objectType: 'SIG', consequence: 'C2' }), payload, s.token);
const independence = (s, id) => call(`${P}/signals/${id}/independence`, pr(s)({ action: 'prediction.signal.independence.test', objectType: 'SIG', objectId: id, consequence: 'C2' }), {}, s.token);
const dispose = (s, id, payload) => call(`${P}/signals/${id}/disposition`, pr(s)({ action: 'prediction.signal.dispose', objectType: 'SIG', objectId: id, consequence: 'C2' }), payload, s.token);
const escalate = (s, id, payload) => call(`${P}/signals/${id}/escalate`, pr(s)({ action: 'prediction.signal.escalate', objectType: 'SIG', objectId: id, consequence: 'C2' }), payload, s.token);
const getSignal = (s, id) => call(`${P}/signals/${id}/get`, pr(s)({ action: 'prediction.read', objectType: 'SIG', objectId: id, sideEffect: 'none' }), {}, s.token);
const detectors = (s) => call(`${P}/detectors/list`, pr(s)({ action: 'prediction.read', objectType: 'DET', sideEffect: 'none' }), {}, s.token);
const lifecycle = (s, id) => call(`${P}/warnings/${id}/lifecycle`, pr(s)({ action: 'prediction.read', objectType: 'WRN', objectId: id, sideEffect: 'none' }), {}, s.token);
const setContext = (s, id, payload) => call(`${P}/warnings/${id}/context`, pr(s)({ action: 'prediction.warning.context.set', objectType: 'WRN', objectId: id, consequence: 'C2' }), payload, s.token);
const feedback = (s, id, payload) => call(`${P}/warnings/${id}/feedback`, pr(s)({ action: 'prediction.warning.feedback', objectType: 'WRN', objectId: id, consequence: 'C2' }), payload, s.token);
const evaluateWarnings = (s, payload) => call(`${P}/warnings/evaluations/run`, pr(s)({ action: 'prediction.warning.evaluate', objectType: 'WRN', consequence: 'C2' }), payload, s.token);
const listEvaluations = (s) => call(`${P}/warnings/evaluations/list`, pr(s)({ action: 'prediction.warning.evaluations.read', objectType: 'WRN', sideEffect: 'none' }), {}, s.token);
const registerSeries = (s, payload) => call(`${P}/series/register`, pr(s)({ action: 'prediction.series.register', objectType: 'SER' }), payload, s.token);
const defineRule = (s, payload) => call(`${P}/streams/rules/define`, pr(s)({ action: 'prediction.stream.rule.define', objectType: 'SPR', consequence: 'C2' }), payload, s.token);
const activateRule = (s, ruleId, reason) => call(`${P}/streams/rules/activate`, pr(s)({ action: 'prediction.stream.rule.activate', objectType: 'SPR', objectId: ruleId, consequence: 'C2' }), { ruleId, reason }, s.token);
const startProcessor = (s, ruleId) => call(`${P}/streams/processors/start`, pr(s)({ action: 'prediction.stream.processor.start', objectType: 'SPR', consequence: 'C2' }), { ruleId }, s.token);
const getProcessor = (s, id) => call(`${P}/streams/processors/${id}/get`, pr(s)({ action: 'prediction.read', objectType: 'SPR', objectId: id, sideEffect: 'none' }), {}, s.token);
const ob = (s) => env_(s, 'observation');
const transition = (s, sourceId, contractVersion, target, reason) => call(`${O}/sources/${sourceId}/transition`, ob(s)({ action: 'observation.source.transition', objectType: 'SRC', objectId: sourceId, consequence: 'C2' }), { contractVersion, target, reason }, s.token);
const streamOpen = (s, sourceId, payload) => call(`${O}/sources/${sourceId}/streams/open`, ob(s)({ action: 'observation.stream.open', objectType: 'AQS', consequence: 'C2' }), payload, s.token);
const markersRead = (s, payload) => call(`${O}/source-impact/markers`, env_(s, 'decision')({ action: 'observation.source_impact.read', objectType: 'SRC', sideEffect: 'none' }), payload, s.token);
const ackImpact = (s, pkg, payload) => call(`${DC}/${pkg}/source-impact/acknowledge`, env_(s, 'decision')({ action: 'decision.source_impact.acknowledge', objectType: 'DPK', objectId: pkg, consequence: 'C2' }), payload, s.token);
const remOpen = (s, src, payload) => call(`${O}/sources/${src}/remediations/open`, ob(s)({ action: 'observation.coverage_remediation.open', objectType: 'SRC', objectId: src, consequence: 'C2' }), payload, s.token);
const remStep = (s, src, rid, payload) => call(`${O}/sources/${src}/remediations/${rid}/step`, ob(s)({ action: 'observation.coverage_remediation.step', objectType: 'SRC', objectId: src, consequence: 'C2' }), payload, s.token);
const remList = (s, src) => call(`${O}/sources/${src}/remediations/list`, ob(s)({ action: 'observation.coverage_remediation.read', objectType: 'SRC', objectId: src, sideEffect: 'none' }), {}, s.token);
const upload = (s, payload) => call(`${O}/upload`, ob(s)({ action: 'observation.run.trigger', objectType: 'RUN' }), payload, s.token);
const lb = env_(brandt, 'decision'); const so = env_(okafor, 'decision');

/* ── the fixed demonstration facts (looked up) ──────────────────────────────────────── */
const PURPOSE_NOTE = 'B28 demonstration';
const REG = (await q(`select strategy_object_id::text id, title, owner_principal_id::text owner from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'OBJ' and status = 'active' and title ilike '%Regensburg line supplied%' limit 1`, [T, D]))[0] ?? null;
const CORRIDOR_IND = (await q(`select indicator_id::text id, description from prediction.indicators_current where tenant_id = $1 and domain_id = $2 and state = 'active' and series_key = 'portwatch:chokepoint4:n_total'
                                  and description like 'Bab el-Mandeb Strait transits below 41 per day for five consecutive published observations%' order by indicator_id limit 1`, [T, D]))[0] ?? null;
const srcOf = async (key) => (await q(`select distinct on (source_id) source_id::text, contract_version, lifecycle_state, name, source_key, publisher, data_origin from observation.source_contracts_current
                                        where tenant_id = $1 and domain_id = $2 and source_key = $3 order by source_id, contract_version desc`, [T, D, key]))[0] ?? null;
/** An evidence version of a source, by the item key its observation carries (a LIKE pattern), newest first; admitted only. */
const evidenceBy = async (sourceId, itemLike) => (await q(`select e.object_id::text id, e.object_version::int v, o.payload ->> 'item_key' item_key from objects.canonical_objects e
    join objects.canonical_objects o on o.object_type = 'OBS' and o.object_id = (e.payload ->> 'obs_object_id')::uuid
   where e.object_type = 'EVD' and e.tenant_id = $1 and e.domain_id = $2 and e.provenance_ref like 'SRC:' || $3 || '@%' and e.lifecycle_state = 'admitted' and o.payload ->> 'item_key' like $4
   order by e.recorded_at desc limit 1`, [T, D, sourceId, itemLike]))[0] ?? null;
const evidenceByDigest = async (digest) => (await q(`select object_id::text id, object_version::int v from objects.canonical_objects where tenant_id = $1 and domain_id = $2 and object_type = 'EVD'
                                                      and payload ->> 'content_digest' = $3 and lifecycle_state = 'admitted' order by object_version desc limit 1`, [T, D, digest]))[0] ?? null;
if (REG === null || CORRIDOR_IND === null) { bad(`the Regensburg objective (${REG === null ? 'ABSENT' : 'found'}) or the corridor indicator (${CORRIDOR_IND === null ? 'ABSENT' : 'found'}) is missing — the act needs both`); process.exit(1); }
note(`the Regensburg objective "${REG.title}" ${short(REG.id)} (owner ${await loginOf(REG.owner)}); the corridor indicator "${CORRIDOR_IND.description.slice(0, 90)}" ${short(CORRIDOR_IND.id)}`);

/* ── B28-0 THE STATE ───────────────────────────────────────────────────────────────── */
console.log('\nB28-0 THE STATE — 0088 applied; the register (50 / 0 / 0); the changed consumers re-registered and the two new kinds registered; the Weak Signal Agent; policy version 5 (min_novelty)');
{
  const m = await q(`select filename, applied_at from public.schema_migrations where filename like '0088%' order by filename`);
  if (m.length === 1) ok(`migration applied (public.schema_migrations): ${m[0].filename} at ${iso(m[0].applied_at)}`); else bad(`0088 applied ${m.length} time(s): ${m.map((r) => r.filename).join(', ') || 'none'}`);
  const ir = await interfaces();
  if (!ir.ok) fail('graph/interfaces', ir);
  else {
    const all = ir.body.interfaces ?? []; const count = (s) => all.filter((i) => i.binding_state === s).length;
    if (all.length === 50 && count('bound') === 50) ok(`the interface register (J. Weber): 50 rows — 50 bound / 0 partial / 0 unbound (B28 adds no interface: the candidates are an internal intake, the warnings keep EarlyWarningRaised@v1)`);
    else bad(`the register: ${all.length} rows, ${count('bound')}/${count('partial')}/${count('unbound')}`);
  }
}
const subs = {};
{
  const st = await subscriptionStatus();
  const consumers = st?.consumers ?? [];
  const live = (st?.subscriptions ?? []).filter((s) => s.status !== 'revoked');
  const changed = live.filter((s) => { const c = consumers.find((x) => x.kind === s.consumer_kind); return c !== undefined && (c.codeDigest !== s.code_digest || c.version !== s.consumer_version); });
  note(`the origin's ${live.length} live subscriptions: ${changed.length === 0 ? 'every one carries this process\'s consumer identity (an earlier run re-registered them)' : `${changed.map((s) => s.consumer_kind).join(', ')} registered for a consumer whose method has since changed`}`);
  for (const s of changed) {
    const c = consumers.find((x) => x.kind === s.consumer_kind);
    const row = (await q('select owner_principal_id::text, checkpoint_seq::text from graph.subscriptions where subscription_id = $1', [s.subscription_id]))[0];
    const rv = await call(`${G}/subscriptions/${s.subscription_id}/revoke`, ad({ action: 'graph.subscription.control', objectType: 'SUB', objectId: s.subscription_id, consequence: 'C2' }),
      { reason: `B28: the ${s.consumer_kind} consumer's method changed (${String(s.code_digest).slice(0, 12)}… → ${String(c.codeDigest).slice(0, 12)}…); a changed method is a new consumer` }, admin.token);
    if (!rv.ok) { fail(`revoke the outdated ${s.consumer_kind} subscription`, rv); continue; }
    const r = await registerSub(s.consumer_kind, row.owner_principal_id);
    if (!r.ok) { fail(`register ${s.consumer_kind}`, r); continue; }
    const n = r.body.subscription;
    ok(`${s.consumer_kind}: subscription ${short(s.subscription_id)} (consumer ${String(s.code_digest).slice(0, 12)}…, cursor ${row.checkpoint_seq ?? 'none'}) REVOKED; registered anew as ${short(n.subscriptionId)} (role ${n.role}, consumer ${n.consumer.version} ${String(n.consumer.codeDigest).slice(0, 12)}…, owner ${await loginOf(row.owner_principal_id)}), the backlog LEFT`);
  }
  // THE TWO NEW KINDS (0088 §0): stream-rules (owner N. Eriksen, who owns the corridor rule) and warnings (owner J. Weber, the objective's owner).
  const liveKinds = new Set((await q(`select consumer_kind from graph.subscriptions where tenant_id = $1 and domain_id = $2 and status <> 'revoked'`, [T, D])).map((r) => r.consumer_kind));
  for (const [kind, owner] of [['stream-rules', eriksen], ['warnings', weber]]) {
    if (liveKinds.has(kind)) { note(`the ${kind} subscription is live — an earlier run registered it`); continue; }
    const r = await registerSub(kind, owner.principalId);
    if (!r.ok) fail(`the administrator registers the ${kind} subscription`, r);
    else { const n = r.body.subscription; ok(`the administrator REGISTERED the NEW kind ${kind}: subscription ${short(n.subscriptionId)} — role ${n.role}, consumer ${n.consumer.version} ${String(n.consumer.codeDigest).slice(0, 12)}…, event types ${n.eventTypes.join(' | ')}, owner ${NAME[owner.principalId]}, the backlog LEFT (worker running ${r.body.served?.workerRunning})`); }
  }
  for (const r of await q(`select subscription_id::text, consumer_kind from graph.subscriptions where tenant_id = $1 and domain_id = $2 and status <> 'revoked'`, [T, D])) subs[r.consumer_kind] = r.subscription_id;
  const after = await subscriptionStatus();
  const stale = (after?.subscriptions ?? []).filter((s) => s.status !== 'revoked' && (after.consumers ?? []).some((c) => c.kind === s.consumer_kind && (c.codeDigest !== s.code_digest || c.version !== s.consumer_version)));
  if (stale.length === 0 && subs['stream-rules'] && subs.warnings && subs.attention && subs['source-health']) ok(`every live subscription of the origin carries this process's consumer identity (${Object.keys(subs).length} kinds, stream-rules and warnings among them)`);
  else bad(`subscriptions: stale ${stale.map((s) => s.consumer_kind).join(', ') || 'none'}; present ${Object.keys(subs).join(', ')}`);
}
// THE ATTENTION AGENT (B24): its timer must be this runtime's — the ticks the act waits for are its.
const AGENT = (await q(`select agent_id::text, principal_id::text, agent_version, code_digest, budgets from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = 'attention' and status = 'active' order by created_at desc limit 1`, [T, D]))[0] ?? null;
if (AGENT !== null && AGENT.code_digest === ATTENTION_TIMER_DIGEST && AGENT.agent_version === ATTENTION_TIMER_VERSION) {
  const last = (await q(`select max(started_at) t, count(*)::int n from executive.agent_runs where agent_id = $1 and task = 'attention_tick' and started_at > clock_timestamp() - interval '10 minutes'`, [AGENT.agent_id]))[0];
  ok(`the attention agent ${short(AGENT.agent_id)} (registered in B24) carries this runtime's timer ${ATTENTION_TIMER_VERSION} ${ATTENTION_TIMER_DIGEST.slice(0, 12)}… — cadence ${AGENT.budgets?.tick_every_seconds ?? 300} s; ${last.n} tick run(s) in the last ten minutes (the latest at ${iso(last.t)}) — the steps B28 adds (warning-candidates, warning-expiry, stream-sweep) and the after-tick hook warning-raise run inside it`);
} else { bad(`the attention agent is ${AGENT === null ? 'ABSENT' : `drifted (${AGENT.agent_version} ${String(AGENT.code_digest).slice(0, 12)}…)`} — the ticks this act waits for would not come; register it as act-b24 does`); process.exit(1); }
let WSA = null;
{
  const cur = (await q(`select agent_id::text, principal_id::text, agent_version, code_digest, budgets, stop_conditions from executive.agents where tenant_id = $1 and domain_id = $2 and agent_kind = 'weak_signal' and status = 'active' order by created_at desc limit 1`, [T, D]))[0] ?? null;
  if (cur !== null && cur.code_digest === WEAK_SIGNAL_AGENT_DIGEST) { WSA = cur; note(`the Weak Signal Agent ${short(cur.agent_id)} is registered (principal ${short(cur.principal_id)}) — an earlier run`); }
  else {
    const r = await registerAgent({ kind: 'weak_signal', version: WEAK_SIGNAL_AGENT_VERSION, codeDigest: WEAK_SIGNAL_AGENT_DIGEST, ownerPrincipalId: dvorak.principalId, escalationPrincipalId: hoffmann.principalId,
      budgets: { max_reads: 200, max_gateway_calls: 0, max_elapsed_ms: 120000 }, stopConditions: [{ kind: 'max_items', value: 5 }] });
    if (!r.ok) fail('the administrator registers the Weak Signal Agent', r);
    else {
      WSA = (await q(`select agent_id::text, principal_id::text, agent_version, code_digest, budgets, stop_conditions from executive.agents where agent_id = $1`, [r.body.agent.agentId]))[0];
      const roles = (await q(`select array_agg(role_code) r from identity.role_bindings where principal_id = $1 and revoked_at is null`, [WSA.principal_id]))[0].r ?? [];
      ok(`the administrator REGISTERED the Weak Signal Agent ${short(WSA.agent_id)} — kind ${r.body.agent.kind}, principal ${short(WSA.principal_id)} (kind agent, roles ${roles.join(', ')}), ${WEAK_SIGNAL_AGENT_METHOD} ${WEAK_SIGNAL_AGENT_VERSION} digest ${WEAK_SIGNAL_AGENT_DIGEST.slice(0, 12)}…, accountable M. Dvořák, escalation A. Hoffmann, stop conditions ${JSON.stringify(WSA.stop_conditions)} — its only authorities: nominate and rank`);
    }
  }
}
let POLICY = null;
{
  const active = await activePolicy();
  const wr = active?.rules?.classes?.['warning.raised'] ?? null;
  if (active === null || wr === null) bad('no active attention policy with a warning.raised class (act-b22…b24 publish versions 1–4)');
  else if (wr.materiality?.min_novelty === 0.9) { POLICY = active; note(`the active policy (version ${active.version}) already sets min_novelty on warning.raised — an earlier run published it`); }
  else {
    const rules = JSON.parse(JSON.stringify(active.rules));
    rules.classes['warning.raised'] = { ...wr, materiality: { ...wr.materiality, min_novelty: 0.9 }, ack_within_minutes: 90, max_escalations: 2 };
    const t0 = await mark();
    const r = await publish(dvorak, rules, 'B28: warnings are judged on their novelty where the detector measured one (min_novelty 0.9 — no input, not judged, otherwise); a warning is acknowledged within 90 minutes, so a warning whose own response window closes first is escalated by its expiry.');
    if (!r.ok) fail('M. Dvořák publishes version 5', r);
    else {
      const p = r.body.policy; POLICY = await activePolicy();
      ok(`M. Dvořák published attention policy VERSION ${p.version} (supersedes ${p.supersedes}; changed classes ${p.changed_classes.join(', ')}): warning.raised materiality ${JSON.stringify(rules.classes['warning.raised'].materiality)}, acknowledged within ${rules.classes['warning.raised'].ack_within_minutes} min (was ${wr.ack_within_minutes}), max escalations ${rules.classes['warning.raised'].max_escalations}, escalated to ${rules.classes['warning.raised'].escalate_to_roles.join('+')}`);
      const ev = await waitOutbox('AttentionPolicyChanged', (x) => x.policy_id === p.policy_id, t0);
      const d = ev === null ? null : (await settled(ev.id, ['attention'], 240)).find((x) => x.consumer_kind === 'attention') ?? null;
      if (d?.state === 'applied') ok(`AttentionPolicyChanged (${short(ev.id)}) applied by the RE-REGISTERED attention subscription: ${effects(d)}`);
      else bad(`AttentionPolicyChanged: ${ev === null ? 'not published' : `delivery ${d?.state ?? 'NONE'} ${d?.last_error ?? ''}`}`);
    }
  }
}

/* ── the sources and evidence the scenes read ───────────────────────────────────────── */
const SRC_CARRIER = await srcOf('carrier-advisories'); const SRC_GDELT = await srcOf('gdelt-discovery'); const SRC_PW = await srcOf('imf-portwatch-chokepoints'); const SRC_NW = await srcOf('nordwerk-internal');
const EV_REROUTE = SRC_CARRIER && await evidenceBy(SRC_CARRIER.source_id, 'upload:carrier-reroute-notice-2024-01-14.pdf@%');
const EV_CONGEST = SRC_CARRIER && await evidenceBy(SRC_CARRIER.source_id, 'upload:port-congestion-2024-01-15.pdf@%');
const EV_GDELT = SRC_GDELT && await evidenceBy(SRC_GDELT.source_id, '%');
const EV_PW = SRC_PW && (await evidenceBy(SRC_PW.source_id, '%#features:2024-01-14|chokepoint4') ?? await evidenceBy(SRC_PW.source_id, '%|chokepoint4'));
// the NORDWERK shipment record the B24 act uploaded (its bytes, by digest): "MV Hanse Meridian … Approaching Bab el-Mandeb … at risk"
const B24_CSV = ['synthetic,shipment_id,component_id,qty,vessel,position_at_window_open,eta_rotterdam,status',
  'true,SYN-SHIP-4481,SYN-PART-BRG,22000,MV Hanse Meridian,Approaching Bab el-Mandeb,2024-02-02,at risk',
  'true,SYN-SHIP-4482,SYN-PART-HSG,9600,not yet loaded,Ningbo,2024-02-26,bookable', ''].join('\n');
const EV_NW = await evidenceByDigest(createHash('sha256').update(Buffer.from(B24_CSV, 'utf8')).digest('hex'));
note(`the evidence read: carrier advisories ${short(EV_REROUTE?.id)} (reroute notice) and ${short(EV_CONGEST?.id)} (congestion notice) — SYNTHETIC, their text a label; GDELT discovery ${short(EV_GDELT?.id)}@${EV_GDELT?.v ?? '—'} (the "Bab el-Mandeb" article list); IMF PortWatch ${short(EV_PW?.id)} (${String(EV_PW?.item_key ?? '').split('#').pop()}); the NORDWERK shipment record the B24 act uploaded ${short(EV_NW?.id)}`);

/* ── B28-W WEAK SIGNAL ─────────────────────────────────────────────────────────────── */
console.log('\nB28-W F-P4-10 — a cluster of low-confidence reports on Red Sea insurer withdrawals nominated as a weak signal; A. Hoffmann tests source independence and marks it `monitor` with a falsify condition');
const W_TITLE = 'Red Sea war-risk insurers withdrawing cover (a cluster of low-confidence reports)';
let WSIG = null;
{
  const prior = (await q(`select signal_id::text from prediction.signals_current where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, W_TITLE]))[0] ?? null;
  if (prior !== null) { WSIG = prior.signal_id; note(`the insurer-withdrawal signal ${short(WSIG)} is nominated — an earlier run`); }
  else if (!EV_REROUTE || !EV_CONGEST || !EV_GDELT) bad('the reports are missing (the carrier advisories or the GDELT record) — the nomination is not staged');
  else {
    const r = await nominate(eriksen, { title: W_TITLE, statement: 'Two carrier advisories (13–15 January) and a trade-press item report carriers rerouting and war-risk cover being pulled for Red Sea transits; each report is thin — together they may be the start of insurer withdrawals from the corridor. (The advisories are SYNTHETIC; their text is a label — this reading is the analyst\'s.)',
      subjectKind: 'none', evidence: [{ object_id: EV_REROUTE.id, version: EV_REROUTE.v }, { object_id: EV_CONGEST.id, version: EV_CONGEST.v }, { object_id: EV_GDELT.id, version: EV_GDELT.v }],
      observation: { reports: 3, window: '2024-01-14..2024-01-15' }, baseline: { reports_per_quarter: 0 }, noveltyBasis: { basis: 'no insurer withdrawal was reported for the corridor in the prior quarter' }, confidence: 0.3 });
    if (!r.ok) fail('N. Eriksen nominates the signal', r);
    else {
      const s = r.body.signal; WSIG = s.signal_id;
      ok(`N. Eriksen NOMINATED signal ${short(WSIG)} "${W_TITLE}" (nominator ${s.nominator_kind}, version ${s.version}): maturity ${s.maturity}, ${s.independent_sources} independent source(s) counted — the basis rows ${(s.basis ?? []).map((b) => `${b.source_key ?? '?'} ${b.independence}`).join(', ')}; "${s.note}"`);
    }
  }
  if (WSIG !== null) {
    const t = await independence(hoffmann, WSIG);
    if (!t.ok) fail('A. Hoffmann tests source independence', t);
    else {
      const x = t.body.independence;
      ok(`A. Hoffmann TESTED SOURCE INDEPENDENCE (every pair judged afresh from the records): ${JSON.stringify(x.summary)} — ${x.pairs.map((p) => `${p.verdict} (${(p.reasons ?? []).join('; ').slice(0, 150)})`).join(' | ')}; the rule: "${x.rule}"`);
    }
    const own = await dispose(eriksen, WSIG, { disposition: 'monitor', note: 'I nominated it and would like to monitor it myself', falsify: [{ text: 'no insurer confirms a withdrawal within 30 days', kind: 'observation' }] });
    if (own.status === 403) ok(`N. Eriksen (the nominator) disposing of it refused: ${refusalLine(own)}`); else bad(`the nominator's disposition: ${refusalLine(own)}`);
    const noF = await dispose(hoffmann, WSIG, { disposition: 'monitor', note: 'watching for an independent confirmation' });
    const before = (await q(`select disposition, falsify_conditions from prediction.signals_current where signal_id = $1`, [WSIG]))[0];
    if (before.disposition === 'monitor') note(`the signal is monitored already — an earlier run (the 422 below is then not asked)`);
    else if (noF.status === 422) ok(`\`monitor\` without a falsify condition refused: ${refusalLine(noF)}`); else bad(`monitor without falsify: ${refusalLine(noF)}`);
    const falsify = [{ text: 'no insurer or broker confirms a withdrawal of Red Sea war-risk cover within 30 days', kind: 'observation', by: '2024-02-15' }];
    const m = await dispose(hoffmann, WSIG, { disposition: 'monitor', note: 'Low confidence and not independent, but material if confirmed: watch for an independent insurer or broker confirmation.', falsify: before.disposition === 'monitor' ? undefined : falsify });
    if (!m.ok) fail('A. Hoffmann marks it monitor', m);
    else {
      const s = m.body.signal;
      if (s.disposition === 'monitor' && s.maturity === 'tentative' && (s.falsify_conditions ?? []).length >= 1)
        ok(`A. Hoffmann marked it MONITOR${s.repeated ? ' (REPEATED — the same disposition recorded by an earlier run)' : ''} (version ${s.version}): falsify ${JSON.stringify(s.falsify_conditions)}; the maturity stays ${s.maturity} — a disposition never moves it (only corroboration by an independent source does)`);
      else bad(`the disposition: ${JSON.stringify(s).slice(0, 300)}`);
    }
  }
}

/* ── B28-L (part 1) THREE REPORTS, ONE WARNING ─────────────────────────────────────── */
console.log('\nB28-L F-P4-12 (part 1) — three sources report the same Bab el-Mandeb incident; one deduplicated warning, raised by the attention agent after its tick, carries all three with the contradicting report');
const L_REPORTS = [
  { key: 'gdelt', title: 'Bab el-Mandeb incident — reported by the GDELT trade-press list', ev: EV_GDELT, stance: 'supporting', statement: 'The GDELT discovery list for "Bab el-Mandeb" carries a report that transits through the strait fell sharply after an attack near Perim.' },
  { key: 'nordwerk', title: 'Bab el-Mandeb incident — the NORDWERK shipment record flags SYN-SHIP-4481 at risk', ev: EV_NW, stance: 'supporting', statement: 'NORDWERK\'s own shipment record (SYNTHETIC) has MV Hanse Meridian, carrying SYN-SHIP-4481 (bearing sets), approaching Bab el-Mandeb and marked "at risk".' },
  { key: 'portwatch', title: 'Bab el-Mandeb incident — IMF PortWatch still counts transits that day', ev: EV_PW, stance: 'contradicting', statement: 'IMF PortWatch counts vessels transiting Bab el-Mandeb on 2024-01-14: ships still passed — read as contradicting a closure of the strait by the incident.' },
];
const L_AFFECTED = { objectives: [REG.id], geographies: ['BAB-EL-MANDEB'], horizon: '30d' };
const L_SIGNALS = []; const L_CANDIDATES = []; let BAB = null; let BAB_ITEM = null;
{
  const tL = await mark();
  for (const rp of L_REPORTS) {
    const title = `${rp.title} (B28)`;
    let sid = (await q(`select signal_id::text from prediction.signals_current where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, title]))[0]?.signal_id ?? null;
    if (sid !== null) note(`"${title}" is nominated — an earlier run`);
    else if (!rp.ev) { bad(`the ${rp.key} evidence is missing — the report is not nominated`); continue; }
    else {
      const r = await nominate(eriksen, { title, statement: rp.statement, subjectKind: 'indicator', subjectId: CORRIDOR_IND.id, evidence: [{ object_id: rp.ev.id, version: rp.ev.v, stance: rp.stance }],
        observation: { reports: 1, incident: 'Bab el-Mandeb, 2024-01-14' }, baseline: { incidents_per_quarter: 0 }, noveltyBasis: { basis: 'no attack on a vessel in the strait had been reported in the prior quarter' }, confidence: 0.4 });
      if (!r.ok) { fail(`N. Eriksen nominates the ${rp.key} report`, r); continue; }
      sid = r.body.signal.signal_id;
      ok(`N. Eriksen NOMINATED "${title}" ${short(sid)} — subject the corridor indicator (the demonstration holds no Bab el-Mandeb place entity: said), evidence ${rp.key} ${rp.stance} (${(r.body.signal.basis ?? []).map((b) => `${b.source_key} ${b.data_origin}, ${b.independence}`).join('; ')})`);
    }
    L_SIGNALS.push({ ...rp, signal_id: sid });
    const e = await escalate(hoffmann, sid, { note: `Three sources report one incident at Bab el-Mandeb; the Regensburg line is exposed — escalated with a one-hour response window (${PURPOSE_NOTE}).`, consequence: 'C3', confidence: 0.6, windowHours: 1, affected: L_AFFECTED });
    if (!e.ok) { fail(`A. Hoffmann escalates the ${rp.key} report`, e); continue; }
    const c = e.body.escalation.candidate;
    L_CANDIDATES.push(c.candidate_id);
    const row = await candidateRow(c.candidate_id);
    ok(`A. Hoffmann ESCALATED it${e.body.escalation.repeated ? ' (REPEATED — an earlier run)' : ''} → candidate ${short(c.candidate_id)} ${row.state} (origin ${row.origin_kind}, key ${row.origin_key.replace(/[0-9a-f-]{36}/g, (m) => short(m))}, cause ${row.cause_key.replace(/[0-9a-f-]{36}/g, (m) => short(m))}, ${row.consequence_class}, confidence ${row.confidence}, window ${row.response_window_hours} h, stance ${(row.evidence ?? []).map((x) => x.stance).join('+')})`);
  }
  const keys = await q(`select distinct prediction.warning_dedup_key(cause_key, affected) k from prediction.warning_candidates where candidate_id = any($1::uuid[])`, [L_CANDIDATES]);
  if (L_CANDIDATES.length === 3 && keys.length === 1) ok(`the three candidates share ONE deduplication key — ${keys[0].k.replace(/[0-9a-f-]{36}/g, (m) => short(m))} (cause | objectives | geographies | horizon)`);
  else bad(`the candidates: ${L_CANDIDATES.length}, keys ${keys.map((k) => k.k).join(' ; ')}`);
  // THE ATTENTION AGENT decides them on its next scheduled tick (step warning-candidates, order 5) and RAISES the owed one right after it.
  note(`waiting for the attention agent's scheduled ticks (cadence ${AGENT.budgets?.tick_every_seconds ?? 300} s) — no processing route is called, no hook is used`);
  const rows = await waitCandidates(L_CANDIDATES, (r) => r.state !== 'pending', 300);
  const raised = rows.filter((r) => r?.state === 'raised'); const clustered = rows.filter((r) => r?.state === 'clustered');
  BAB = raised[0]?.warning_id ?? clustered[0]?.warning_id ?? null;
  if (raised.length === 1 && clustered.length === 2 && clustered.every((c) => c.warning_id === BAB)) ok(`the intake decided: ${short(raised[0].candidate_id)} RAISED warning ${short(BAB)}; ${clustered.map((c) => `${short(c.candidate_id)} clustered (${c.outcome?.member_kind}, ${c.outcome?.stance})`).join(', ')} into it`);
  else bad(`the candidates: ${rows.map((r) => `${short(r?.candidate_id)} ${r?.state} → ${short(r?.warning_id)}`).join('; ')}`);
  if (raised.length === 1) {
    const tk = await raisingTick(raised[0].candidate_id);
    const step = tk?.outputs?.steps?.['warning-candidates']; const after = tk?.outputs?.after?.['warning-raise'];
    const res = (after?.results ?? []).find((x) => x.candidate_id === raised[0].candidate_id);
    if (tk !== null && res?.decision === 'raised' && res.warning_id === BAB)
      ok(`RAISED BY THE ATTENTION AGENT after its tick: run ${short(tk.run_id)} (trigger ${tk.trigger_kind}, ${String(tk.trigger_ref).slice(0, 40)}, at ${iso(tk.started_at)}) — step warning-candidates ${JSON.stringify({ seen: step?.seen, raise_owed: step?.raise_owed, deferred: step?.deferred, clustered: step?.clustered })}; after.warning-raise ${JSON.stringify({ owed: after.owed, raised: after.raised, results: after.results.map((x) => ({ candidate_id: short(x.candidate_id), decision: x.decision, warning_id: short(x.warning_id) })) })}`);
    else bad(`the raising tick: ${tk === null ? 'NO tick run raised it' : JSON.stringify(tk.outputs?.after ?? null).slice(0, 300)}`);
    const folds = (await warningEvents(BAB)).filter((e) => e.event === 'warning.clustered');
    if (folds.length === 2 && folds.every((f) => f.actor === AGENT.principal_id)) ok(`the next tick FOLDED the two deferred reports: warning.clustered ×2 by the attention agent's principal (${folds.map((f) => `${f.details.member_kind}/${f.details.stance} at ${iso(f.occurred_at)}`).join(', ')}) — no second warning, no second EarlyWarningRaised`);
    else bad(`the folds: ${folds.map((f) => `${f.details?.member_kind} by ${short(f.actor)}`).join(', ') || 'none'}`);
  }
  if (BAB !== null) {
    const w = await warningRow(BAB);
    const raisedEv = await q(`select count(*)::int n from objects.object_outbox where event_type = 'EarlyWarningRaised' and payload ->> 'warning_id' = $1`, [BAB]);
    const lc = await lifecycle(weber, BAB);
    if (!lc.ok) fail('the lifecycle read (J. Weber)', lc);
    else {
      const L = lc.body.lifecycle; const mem = L.members ?? [];
      const srcName = async (id) => (await q(`select source_key from observation.source_contracts_current where source_id = $1 limit 1`, [id]))[0]?.source_key ?? short(id);
      const lines = []; for (const m of mem) lines.push(`${m.member_kind}/${m.stance} from ${m.source_id === null ? 'no source' : await srcName(m.source_id)}`);
      if (mem.length === 3 && mem.filter((m) => m.stance === 'contradicting').length === 1 && w.routed_to === REG.owner && raisedEv[0].n === 1)
        ok(`ONE warning ${short(BAB)} "${w.title.slice(0, 80)}" — ${w.state}, ${w.consequence_class} level ${w.level}, origin ${w.origin_kind}, routed to ${await loginOf(w.routed_to)} (the Regensburg objective's owner), window ${iso(w.response_window_opens_at)} → ${iso(w.response_window_closes_at)}; THREE members: ${lines.join('; ')}; the contradicting block counts ${L.contradicting.count}; ONE EarlyWarningRaised`);
      else bad(`the warning: members ${lines.join('; ')}, routed ${await loginOf(w.routed_to)}, EarlyWarningRaised ×${raisedEv[0].n}`);
    }
    BAB_ITEM = await waitItemOfWarning(BAB);
    if (BAB_ITEM === null) bad('the warning\'s attention item was not routed');
    else {
      const ev = BAB_ITEM.evaluation ?? {};
      ok(`the attention subscriber ROUTED item ${short(BAB_ITEM.item_id)} (warning.raised, ${BAB_ITEM.outcome}/${BAB_ITEM.state}, owner ${await loginOf(BAB_ITEM.owner_principal_id)}, roles ${BAB_ITEM.route_roles.join('+')}, policy version ${BAB_ITEM.policy_version}, due ${iso(BAB_ITEM.due_at)} — after the warning's own window); novelty ${JSON.stringify(ev.dimensions?.novelty ?? null)} — ${JSON.stringify(ev.dimensions?.dimension_basis?.novelty ?? null)}; the last reason "${(ev.reasons ?? []).at(-1)}"`);
    }
    // THE CONTEXT, by the warning's owner (J. Weber): the contradicting report, the affected Regensburg objective, a falsification condition, a SIMULATION playbook.
    const scn = (await q(`select s.scenario_id::text, s.title, b.branch_id::text, (select r.run_id::text from simulation.runs_current r where r.scenario_branch_id = b.branch_id and r.state = 'completed' and r.validity = 'valid' order by r.opened_at desc limit 1) run_id
                            from prediction.scenarios_current s join prediction.branches_current b using (scenario_id) where s.tenant_id = $1 and s.domain_id = $2 and s.state = 'active' and s.title like 'Bab el-Mandeb over the next quarter%'
                             and b.kind = 'downside' order by (select count(*) from simulation.runs_current r where r.scenario_branch_id = b.branch_id and r.validity = 'valid') desc, s.declared_at desc limit 1`, [T, D]))[0] ?? null;
    if (w.context_version > 0) note(`the context stands at version ${w.context_version} — an earlier run`);
    else if (scn === null) bad('no active Bab el-Mandeb scenario for the playbook');
    else {
      const pw = L_SIGNALS.find((s) => s.key === 'portwatch');
      const c = await setContext(weber, BAB, { expected_version: 0,
        contradicting: pw?.ev ? [{ object_id: pw.ev.id, version: pw.ev.v, source_id: SRC_PW.source_id, note: 'IMF PortWatch still counts transits through the strait on 2024-01-14' }] : [],
        affected: { objectives: [REG.id], assets: ['SYN-SHIP-4481', 'MV Hanse Meridian'], actors: [], geographies: ['BAB-EL-MANDEB'], horizon: '30d' },
        falsification: [{ condition: 'transits through Bab el-Mandeb recover above 40 a day for three consecutive days', indicator_id: CORRIDOR_IND.id }],
        playbook: { kind: 'simulation', scenario_id: scn.scenario_id, branch_id: scn.branch_id, ...(scn.run_id ? { run_id: scn.run_id } : {}), note: 'run the downside branch against the Regensburg line before the window closes' } });
      if (!c.ok) fail('J. Weber sets the context', c);
      else {
        const lc2 = await lifecycle(weber, BAB); const L = lc2.body?.lifecycle ?? {};
        ok(`J. Weber (the owner) SET THE CONTEXT (version ${c.body.context.context_version}): contradicting ${L.contradicting?.count} (the context's item and the member's report); affected objectives ${(L.affected?.objectives ?? []).map((o) => `"${o.title}" (${o.status}, owner ${NAME[o.owner] ?? short(o.owner)})`).join(', ')}, assets ${(L.affected?.assets ?? []).join(', ')}; falsification "${L.falsification?.[0]?.condition}"; the playbook ${L.playbook?.kind} → "${scn.title.slice(0, 70)}" branch downside${scn.run_id ? `, run ${short(scn.run_id)}` : ''}`);
      }
    }
  }
}

/* ── B28-S STREAM ──────────────────────────────────────────────────────────────────── */
console.log('\nB28-S F-P4-11 — AIS/PortWatch transit events arrive late and out of order; the corridor rule fires on event time and labels the late window instead of hiding it');
const STREAM = STREAM_SOURCE_CONTRACTS.find((c) => c.source_key === 'red-sea-corridor-stream-late');
const PK = `${STREAM.source_key}:chokepoint4`;
const SERIES = 'red-sea-corridor-stream-late:chokepoint4:n_total';
const RULE_KEY = 'b28-' + 'corridor-collapse'; // built, not one literal (the gitleaks generic-api-key false positive)
let LSRC = null; let PROC = null; let RULE = null;
{
  LSRC = await srcOf(STREAM.source_key);
  if (LSRC === null) {
    const r = await call(`${O}/sources/register`, ob(hoffmann)({ action: 'observation.source.register', objectType: 'SRC' }), { contract: STREAM }, hoffmann.token);
    if (!r.ok) fail('A. Hoffmann registers the late stream source', r);
    else { LSRC = { source_id: r.body.source.sourceId, contract_version: r.body.source.contractVersion, lifecycle_state: 'draft', name: STREAM.name }; ok(`A. Hoffmann REGISTERED "${STREAM.name}" (source ${short(LSRC.source_id)}, contract v${LSRC.contract_version}) — SYNTHETIC, labelled at row level; kept out of the seed`); }
  } else note(`the late stream source is registered (${short(LSRC.source_id)} v${LSRC.contract_version}, ${LSRC.lifecycle_state}) — an earlier run`);
  if (LSRC?.lifecycle_state === 'draft') {
    const a = await call(`${O}/sources/${LSRC.source_id}/approve`, ob(dvorak)({ action: 'observation.source.approve', objectType: 'SRC', objectId: LSRC.source_id }), { contractVersion: LSRC.contract_version, decision: 'approve', reason: 'B28: the synthetic late corridor stream reviewed — replay only, synthetic at row level, internal analysis' }, dvorak.token);
    if (a.ok) { LSRC.lifecycle_state = 'approved'; ok('M. Dvořák APPROVED it (a different operator from the registrar)'); } else fail('M. Dvořák approves', a);
  }
  if (LSRC?.lifecycle_state === 'approved') {
    const t = await transition(dvorak, LSRC.source_id, LSRC.contract_version, 'active', 'B28: the event-time stream processor demonstrated on the synthetic late corridor stream');
    if (t.ok) { LSRC.lifecycle_state = 'active'; ok('M. Dvořák ACTIVATED it'); } else fail('M. Dvořák activates', t);
  }
  if (LSRC?.lifecycle_state === 'active') {
    const agent = (await q(`select agent_id::text from observation.agents where source_id = $1 and status = 'active' limit 1`, [LSRC.source_id]))[0] ?? null;
    if (agent === null) {
      const r = await call(`${O}/agents/register`, ad({ action: 'observation.agent.register', objectType: 'AGT', purposeId: 'observation' }), { sourceId: LSRC.source_id, connector: STREAM.connector_kind, ownerPrincipalId: hoffmann.principalId }, admin.token);
      if (r.ok) ok(`the administrator PROVISIONED its collection agent ${short(r.body.agent.agentId)} (owner A. Hoffmann)`); else fail('the administrator provisions the agent', r);
    } else note(`its collection agent ${short(agent.agent_id)} is active — an earlier run`);
    // THE AGENT'S SCHEDULE fires its first command-form collection at once (the BullMQ scheduler's first iteration). It is let finish, and its
    // ObservationRecorded delivered, BEFORE the processor starts: the processor reads the STREAM from its start, not that snapshot.
    const tA = new Date(Date.now() - 60_000);
    let runs = [];
    for (let i = 0; i < 20; i += 1) { runs = await q(`select run_id::text, state, items_admitted, items_noop, started_at from observation.collection_runs_current where source_id = $1 order by started_at`, [LSRC.source_id]); if (runs.length > 0) break; await sleep(1000); }
    for (let i = 0; i < 120 && runs.some((r) => r.state === 'running'); i += 1) { await sleep(1000); runs = await q(`select run_id::text, state, items_admitted, items_noop, started_at from observation.collection_runs_current where source_id = $1 order by started_at`, [LSRC.source_id]); }
    // the first iteration races the agent's grant (a refused attempt records no run): when it ran nothing, M. Dvořák runs the same command-form
    // collection now — either way the snapshot is collected once, BEFORE the processor, and the daily schedule after it finds it unchanged.
    let byOperator = null;
    if (!runs.some((r) => r.state === 'finished')) {
      const c = await call(`${O}/sources/${LSRC.source_id}/collect`, ob(dvorak)({ action: 'observation.run.trigger', objectType: 'RUN' }), { contractVersion: Number(LSRC.contract_version) }, dvorak.token);
      if (c.ok) byOperator = c.body.run; else fail('M. Dvořák collects the snapshot (the command form)', c);
      runs = await q(`select run_id::text, state, items_admitted, items_noop, started_at from observation.collection_runs_current where source_id = $1 order by started_at`, [LSRC.source_id]);
    }
    for (let i = 0; i < 120; i += 1) {
      const evs = await q(`select id::text, status from objects.object_outbox where event_type = 'ObservationRecorded' and tenant_id = $1 and domain_id = $2 and payload ->> 'source_id' = $3 and created_at >= $4`, [T, D, LSRC.source_id, tA]);
      const ds = evs.length === 0 ? [] : await q(`select state from graph.subscription_deliveries where subscription_id = $1 and event_id = any($2::uuid[])`, [subs['stream-rules'], evs.map((e) => e.id)]);
      if (evs.every((e) => e.status === 'published') && ds.length === evs.length && ds.every((d) => TERMINAL.includes(d.state))) break;
      await sleep(1000);
    }
    const att = (await q(`select outcome, reason from observation.scheduled_attempts where source_id = $1 order by started_at limit 1`, [LSRC.source_id]))[0] ?? null;
    note(`the agent's schedule fired its first iteration at once: ${att === null ? 'no attempt recorded within 20 s' : `${att.outcome}${att.reason ? ` — "${att.reason}"` : ''}`}; ${byOperator !== null ? `so M. Dvořák COLLECTED the snapshot (the command form): run ${short(byOperator.runId)} ${byOperator.state}, ${byOperator.admitted} admitted` : `its run collected the snapshot`} — ${runs.map((r) => `run ${short(r.run_id)} ${r.state} (${r.items_admitted} admitted, ${r.items_noop} unchanged)`).join('; ')}; finished and delivered BEFORE the processor starts: no processor reads the snapshot, and the next daily iteration finds it unchanged`);
  }
  // THE SERIES (N. Eriksen): the late set's daily transits, the PortWatch framing (n_total of portid chokepoint4) — synthetic, labelled.
  const ser = (await q(`select series_key from prediction.series_registry where tenant_id = $1 and domain_id = $2 and series_key = $3`, [T, D, SERIES]))[0] ?? null;
  if (ser !== null) note(`the series ${SERIES} is registered — an earlier run`);
  else {
    const r = await registerSeries(eriksen, { seriesKey: SERIES, sourceKey: STREAM.source_key, parserRef: 'arcgis-feature-attribute@1', valueField: 'n_total', selector: 'chokepoint4', unit: 'transits/day', seasonalityDays: 7,
      attribution: 'SYNTHETIC stream fixture — not PortWatch figures.', description: 'Bab el-Mandeb daily transits, the SYNTHETIC late / out-of-order corridor stream (B28)' });
    if (r.ok) ok(`N. Eriksen REGISTERED the series ${SERIES} (parser arcgis-feature-attribute@1, n_total of chokepoint4) on the late stream source`); else fail('N. Eriksen registers the series', r);
  }
  // THE RULE, defined and activated by its owner N. Eriksen: five-day tumbling windows from 2024-02-01, the watermark a day behind the latest
  // event, ten days' allowance for late data, at least three days below 30 transits — a C3 corridor collapse; a candidate's window 48 h.
  RULE = (await q(`select rule_id::text, version, state, rule_digest from prediction.stream_rules where tenant_id = $1 and domain_id = $2 and rule_key = $3 and state = 'active' limit 1`, [T, D, RULE_KEY]))[0] ?? null;
  if (RULE !== null) note(`the rule ${RULE_KEY} v${RULE.version} is active — an earlier run`);
  else {
    const d = await defineRule(eriksen, { ruleKey: RULE_KEY, title: 'Bab el-Mandeb corridor collapse on event time (B28)', seriesKey: SERIES, windowKind: 'tumbling', windowDays: 5, windowOrigin: '2024-02-01',
      allowedLatenessHours: 240, watermarkLagHours: 24, stallAfterSeconds: 30 * 86400, predicate: { comparator: 'lt', threshold: 30, min_hits: 3 }, consequenceClass: 'C3', responseWindowHours: 48, checkpointEvery: 3, ownerPrincipalId: eriksen.principalId });
    if (!d.ok) fail('N. Eriksen defines the rule', d);
    else {
      const rr = d.body.rule;
      ok(`N. Eriksen DEFINED stream rule ${RULE_KEY} v${rr.version} (${rr.state}; series ${rr.series_key}, partition ${rr.partition}, ${rr.window_days}-day ${rr.window_kind} windows from ${day(rr.window_origin)}, lag ${rr.watermark_lag}, allowance ${rr.allowed_lateness}, predicate ${JSON.stringify(rr.predicate)}, digest ${String(rr.rule_digest).slice(0, 12)}…)`);
      const a = await activateRule(eriksen, rr.rule_id, 'B28: the corridor collapse is watched on event time, late data labelled — the owner activates it');
      if (!a.ok) fail('N. Eriksen activates the rule', a); else { RULE = { rule_id: rr.rule_id, version: rr.version, state: a.body.rule.state, rule_digest: rr.rule_digest }; ok(`N. Eriksen (its owner) ACTIVATED it: ${a.body.rule.state}`); }
    }
  }
  if (RULE !== null) {
    PROC = (await q(`select processor_id::text from prediction.stream_processors where rule_id = $1 and state <> 'retired' limit 1`, [RULE.rule_id]))[0]?.processor_id ?? null;
    if (PROC !== null) note(`the processor ${short(PROC)} runs — an earlier run`);
    else {
      const s = await startProcessor(eriksen, RULE.rule_id);
      if (!s.ok) fail('N. Eriksen starts the processor', s);
      else { const p = s.body.processor; PROC = p.processor_id; ok(`N. Eriksen STARTED processor ${short(PROC)} (${p.processor_identity?.replace(/[0-9a-f-]{36}/g, (m) => short(m))}, ${p.state}, topology ${p.topology_version}, partition ${p.partition_key}, watermark ${p.watermark ?? 'none yet'}, the start checkpoint taken)`); }
    }
  }
}
let STREAM_CANDS = [];
if (LSRC?.lifecycle_state === 'active' && PROC !== null) {
  const done = (await q(`select stream_id::text, state from observation.acquisition_streams where source_id = $1 and partition_key = $2 order by opened_at limit 1`, [LSRC.source_id, PK]))[0] ?? null;
  const tS = await mark();
  if (done !== null) note(`the stream ${short(done.stream_id)} on ${PK} was acquired (${done.state}) — an earlier run; not acquired again`);
  else {
    const o = await streamOpen(dvorak, LSRC.source_id, { contractVersion: Number(LSRC.contract_version), partitionKey: PK, credit: 2, range: { from: '2024-02-01', to: '2024-03-11' }, maxSegments: 8 });
    if (!o.ok) fail('M. Dvořák opens the stream', o);
    else {
      const s = o.body.stream; const r = o.body.run;
      const gap = await q(`select range_from::text, range_to::text, reason_class from observation.acquisition_incomplete_ranges where stream_id = $1`, [s.stream_id]);
      const segs = await q(`select seq, admitted, noop, incomplete from observation.acquisition_segments where stream_id = $1 order by seq`, [s.stream_id]);
      ok(`M. Dvořák ACQUIRED the stream ${short(s.stream_id)} on ${PK} (the B23 stream form, credit 2, eight pages): run ${short(r.runId)} ${r.state} — ${r.segments} segment(s) in the order the publisher served them (${segs.map((x) => `${x.seq}${x.incomplete ? ' gap' : `:${x.admitted}+${x.noop}`}`).join(' · ')} admitted+unchanged), ${r.admitted} admitted, ${r.noop} unchanged; the explicit incomplete range ${gap.map((g) => `[${g.range_from}, ${g.range_to}) ${g.reason_class}`).join(', ') || 'none'}; the stream ${s.state} at seq ${s.next_seq}`);
    }
  }
  // the stream-rules consumer feeds the processor: every ObservationRecorded of the source since the opening, applied
  let evs = []; let ds = [];
  for (let i = 0; i < 300; i += 1) {
    evs = await q(`select id::text, status, partition_seq::int from objects.object_outbox where event_type = 'ObservationRecorded' and tenant_id = $1 and domain_id = $2 and payload ->> 'source_id' = $3 and created_at >= $4`, [T, D, LSRC.source_id, tS]);
    ds = evs.length === 0 ? [] : await q(`select event_id::text, state from graph.subscription_deliveries where subscription_id = $1 and event_id = any($2::uuid[])`, [subs['stream-rules'], evs.map((e) => e.id)]);
    if (evs.length > 0 && evs.every((e) => e.status === 'published') && ds.length === evs.length && ds.every((d) => TERMINAL.includes(d.state))) break;
    await sleep(1000);
  }
  if (done === null) {
    if (evs.length > 0 && ds.length === evs.length && ds.every((d) => d.state === 'applied')) ok(`the stream-rules subscription APPLIED ${ds.length} ObservationRecorded event(s) of the stream (the pages and their framed rows) into the processor`);
    else bad(`the stream-rules deliveries: ${evs.length} event(s), ${ds.length} deliveries (${tally(ds, 'state')})`);
  }
  const ins = await q(`select to_char(event_time at time zone 'UTC', 'YYYY-MM-DD') d, value::float8 v, lateness, lateness_by::text by, disposition, prior_value::float8 prior from prediction.stream_inputs where processor_id = $1 order by input_seq`, [PROC]);
  const late = ins.filter((i) => i.lateness !== 'on_time');
  ok(`EVERY INPUT STORED AND LABELLED, none dropped: ${ins.length} input(s) — lateness {${tally(ins, 'lateness')}}, disposition {${tally(ins, 'disposition')}}; the late ones: ${late.slice(0, 8).map((i) => `${i.d} ${i.lateness}${i.by ? ` by ${i.by}` : ''}${i.disposition !== 'new' ? ` (${i.disposition}${i.prior !== null ? ` ${i.prior}→${i.v}` : ''})` : ''}`).join('; ')}${late.length > 8 ? ` … ${late.length - 8} more` : ''}`);
  const sig = await q(`select signal_id::text, to_char(window_start at time zone 'UTC', 'YYYY-MM-DD') ws, revision, emission, label, holds, completeness, (value ->> 'n')::int n, (value ->> 'hits')::int hits, lateness, watermark from prediction.stream_signals where processor_id = $1 order by signal_seq`, [PROC]);
  const pw = (await q(`select watermark, max_event_time, state, state_digest = prediction.stream_state_digest(processor_id) digest_ok from prediction.stream_processors where processor_id = $1`, [PROC]))[0];
  if (sig.length > 0) ok(`the windows FIRED ON THE WATERMARK (event time; the watermark ${day(pw.watermark)} = the latest event ${day(pw.max_event_time)} − one day — never the wall clock; the state digest verifies: ${pw.digest_ok}): ${sig.map((s) => `${s.ws} ${s.emission}${s.revision ? ` r${s.revision}` : ''} [${s.label}] ${s.hits ?? 0}/${s.n ?? 0} holds ${s.holds}`).join(' · ')}`);
  else bad('no window fired');
  const lw = sig.find((s) => s.label === 'late_window');
  if (lw) ok(`THE LATE WINDOW LABELLED, NOT HIDDEN: ${lw.ws} REVISED (revision ${lw.revision}) labelled ${lw.label}, completeness ${lw.completeness} — ${lw.lateness?.late_inputs} late input(s), the latest ${lw.lateness?.max_lateness} after the watermark had passed; ${lw.hits}/${lw.n} days below 30 → holds ${lw.holds}`);
  else bad('no window was revised labelled late_window');
  const pwin = sig.find((s) => s.label === 'partial_window' && s.completeness === 'partial_incomplete_range');
  if (pwin) ok(`the publisher gap's window ${pwin.ws} fired PARTIAL (completeness ${pwin.completeness}) over the explicit incomplete range — never presented as complete`); else bad('no partial window over the incomplete range');
  const early = sig.filter((s) => s.label === 'partial_window' && s.completeness !== 'partial_incomplete_range');
  if (early.length > 0) note(`a due window with no observation yet fired as the gap it is (${early.map((s) => `${s.ws} ${s.completeness} ${s.n ?? 0} day(s)`).join(', ')}) — the late page then revised it`);
  const dup = await q(`select details from prediction.stream_processor_events where processor_id = $1 and event = 'output.duplicate_suppressed'`, [PROC]);
  note(`the duplicate row (DEF-L4) emitted nothing: output.duplicate_suppressed ×${dup.length}${dup.length ? ` (${dup.map((x) => String(x.details?.window_start).slice(0, 10)).join(', ')})` : ''}`);
  STREAM_CANDS = await q(`select candidate_id::text, origin_key, state, title, warning_id::text, cause_key from prediction.warning_candidates where origin_kind = 'stream_rule' and origin_key like $1 order by submitted_at`, [`${PROC}:%`]);
  const holding = sig.filter((s) => s.holds === true && s.emission !== 'retracted');
  if (STREAM_CANDS.length > 0 && STREAM_CANDS.length === new Set(STREAM_CANDS.map((c) => c.origin_key)).size) ok(`each holding emission SUBMITTED ONE candidate through the intake (${holding.length} holding emission(s)): ${STREAM_CANDS.map((c) => `"${c.title.slice(0, 110)}" [${c.state}]`).join(' | ')}`);
  else bad(`the stream candidates: ${STREAM_CANDS.length}`);
  // AT-LEAST-ONCE: the administrator replays the stream-rules subscription over every event of the stream — repeated, audited no-ops.
  const first = Math.min(...evs.map((e) => e.partition_seq));
  if (done === null && Number.isFinite(first)) {
    const before = { inputs: ins.length, signals: sig.length, candidates: STREAM_CANDS.length, ingested: (await q(`select count(*)::int n from prediction.stream_processor_events where processor_id = $1 and event = 'evidence.ingested'`, [PROC]))[0].n };
    const rp = await replaySub(subs['stream-rules'], Math.max(0, first - 1), 'B28: at-least-once — every event of the late stream delivered again');
    if (!rp.ok) fail('the administrator replays the stream-rules subscription', rp);
    else {
      let ingested = before.ingested;
      for (let i = 0; i < 240 && ingested < before.ingested * 2; i += 1) { await sleep(1000); ingested = (await q(`select count(*)::int n from prediction.stream_processor_events where processor_id = $1 and event = 'evidence.ingested'`, [PROC]))[0].n; }
      const rep = (await q(`select count(*)::int n from prediction.stream_processor_events where processor_id = $1 and event = 'input.repeated'`, [PROC]))[0].n;
      const now = { inputs: (await q(`select count(*)::int n from prediction.stream_inputs where processor_id = $1`, [PROC]))[0].n, signals: (await q(`select count(*)::int n from prediction.stream_signals where processor_id = $1`, [PROC]))[0].n,
        candidates: (await q(`select count(*)::int n from prediction.warning_candidates where origin_kind = 'stream_rule' and origin_key like $1`, [`${PROC}:%`]))[0].n };
      if (ingested >= before.ingested * 2 && rep > 0 && now.inputs === before.inputs && now.signals === before.signals && now.candidates === before.candidates)
        ok(`AT-LEAST-ONCE: the administrator REPLAYED the subscription (${rp.body.replayed ?? '?'} event(s) re-delivered): evidence.ingested ${before.ingested} → ${ingested}, input.repeated ×${rep}; inputs ${now.inputs}, signals ${now.signals}, candidates ${now.candidates} — unchanged: the candidate of each holding window submitted ONCE`);
      else bad(`the replay: ingested ${before.ingested} → ${ingested}, repeated ${rep}, ${JSON.stringify(before)} → ${JSON.stringify(now)}`);
    }
  }
  // THE STREAM WARNINGS: the attention agent's tick decides the candidates; the after-tick hook raises them.
  const sc = await waitCandidates(STREAM_CANDS.map((c) => c.candidate_id), (r) => r.state !== 'pending', 300);
  const lines = [];
  for (const c of sc) { const w = c?.warning_id ? await warningRow(c.warning_id) : null; const tk = c?.state === 'raised' ? await raisingTick(c.candidate_id) : null;
    lines.push({ c, w, tk, text: `${short(c?.candidate_id)} ${c?.state}${w ? ` → warning ${short(w.warning_id)} ${w.state}, routed to ${await loginOf(w.routed_to)}${tk ? ` (raised after tick run ${short(tk.run_id)})` : ''}` : ''}` }); }
  if (sc.every((c) => c?.state === 'raised' || c?.state === 'clustered')) ok(`the stream candidates decided by the attention agent's ticks: ${lines.map((l) => l.text).join('; ')}`);
  else bad(`the stream candidates: ${lines.map((l) => l.text).join('; ')}`);
  const toAgent = lines.filter((l) => l.w !== null && l.w.routed_to === AGENT.principal_id);
  // 0088 §I (found by this act's rehearsals, corrected): a warning the agent raised is routed to a NAMED, ACTIVE HUMAN (the rule's owner here)
  if (toAgent.length === 0 && lines.every((l) => l.w === null || l.w.routed_to !== AGENT.principal_id)) ok(`every stream warning routed to a person (the stream rule's owner — none to the attention agent)`);
  else bad(`${toAgent.length} stream warning(s) routed to the attention agent's principal`);
} else note('the late stream source or the processor is missing — the stream scene is not staged');

/* ── B28-A / B28-R ONE SUSPENSION ──────────────────────────────────────────────────── */
console.log('\nB28-A (the B24 carryover (b)) — a package option\'s assumption rests on claims extracted from the supplier-portal source\'s evidence; suspended, the package is marked through the assumption; the commitment refused until acknowledged');
note(`"the Regensburg supplier-portal source": the demonstration has none — the nearest real source is "${SRC_NW?.name}" (${SRC_NW?.source_key}, ${SRC_NW?.data_origin}: the supplier and shipment records NORDWERK uploads); it stands in, SAID`);
const ASU_TITLE = 'SYN-SHIP-4481 (the bearing sets) keeps its booked Bab el-Mandeb routing through Q1 (B28)';
const PKG_TITLE = 'B28 — keep the bearing sets on the booked Bab el-Mandeb routing (SYNTHETIC)';
let ASU = null; let PKG = null; let PKGV = null; let SUSP = null; let LOSS = null;
{
  // (a) THE CLAIMS the B24 upload's extraction admitted from the source's evidence (the shipment record): the vessel's transit and its cargo.
  const claims = SRC_NW === null ? [] : await q(`select distinct on (l.claim_object_id) l.claim_object_id::text id, o.payload ->> 'subject' s, o.payload ->> 'predicate' p, o.payload ->> 'object_value' v, l.evidence_object_id::text evd
      from intelligence.claim_lineage l join objects.canonical_objects e on e.object_id = l.evidence_object_id and e.object_type = 'EVD' and e.provenance_ref like 'SRC:' || $3 || '@%'
      join objects.canonical_objects o on o.object_id = l.claim_object_id and o.lifecycle_state = 'active'
     where l.tenant_id = $1 and l.domain_id = $2 and ((o.payload ->> 'subject' = 'MV Hanse Meridian' and o.payload ->> 'object_value' = 'Bab el-Mandeb') or (o.payload ->> 'subject' = 'SYN-SHIP-4481' and o.payload ->> 'predicate' = 'carries'))
     order by l.claim_object_id, o.object_version desc`, [T, D, SRC_NW.source_id]);
  ASU = (await q(`select strategy_object_id::text id from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'ASU' and status = 'active' and title = $3 limit 1`, [T, D, ASU_TITLE]))[0]?.id ?? null;
  if (ASU !== null) note(`the assumption ${short(ASU)} is declared — an earlier run`);
  else if (claims.length === 0) bad('no claim extracted from the source\'s evidence (the B24 upload\'s) — the assumption is not declared');
  else {
    const r = await call(`${G}/strategy/declare`, env_(weber, 'graph')({ action: 'graph.strategy.declare', objectType: 'ASU' }), { objectType: 'ASU', title: ASU_TITLE,
      statement: 'The bearing sets on SYN-SHIP-4481 arrive on the booked routing through Bab el-Mandeb, as the supplier records give it; the keep-routing option rests on it.',
      restsOn: claims.map((c) => ({ kind: 'claim', id: c.id, rationale: `the supplier records say ${c.s} ${c.p} ${c.v}` })) }, weber.token);
    if (!r.ok) fail('J. Weber declares the assumption', r);
    else { ASU = r.body.strategy.objectId; ok(`J. Weber DECLARED assumption ${short(ASU)} "${ASU_TITLE}" resting on ${claims.length} claim(s) extracted from the source's evidence (${short(claims[0].evd)}): ${claims.map((c) => `"${c.s} ${c.p} ${c.v}" ${short(c.id)}`).join(', ')}`); }
  }
  // (b) THE PACKAGE (L. Brandt): the keep-routing option cites a run AND the assumption; S. Okafor approves. Declared BEFORE the suspension.
  const pair = (await q(`select c.run_id::text control, i.run_id::text intervention, c.twin_id::text twin from simulation.runs_current c join simulation.runs_current i on i.control_run_id = c.run_id and i.run_kind = 'intervention' and i.state = 'completed' and i.validity = 'valid'
                          where c.tenant_id = $1 and c.domain_id = $2 and c.run_kind = 'control' and c.state = 'completed' and c.validity = 'valid'
                            -- citable as the option port judges it (0078): no run resting on a forecast withdrawn as unfit
                            and not exists (select 1 from simulation.runs_current x, jsonb_array_elements(coalesce(x.initial_state, '[]'::jsonb)) el, jsonb_array_elements(coalesce(el -> 'citations', '[]'::jsonb)) fc
                                             join prediction.forecasts_current f on f.forecast_id = (fc ->> 'id')::uuid where x.run_id in (c.run_id, i.run_id) and fc ->> 'kind' = 'forecast' and f.state = 'withdrawn')
                          order by c.opened_at desc, i.opened_at limit 1`, [T, D]))[0] ?? null;
  const dec = (await q(`select decision_object_id::text from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = 'January corridor collapse — Regensburg line' limit 1`, [T, D]))[0]?.decision_object_id ?? null;
  PKG = (await q(`select package_id::text, state, current_version, committed_version from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = $3`, [T, D, PKG_TITLE]))[0] ?? null;
  if (PKG !== null) { PKGV = Number(PKG.committed_version ?? PKG.current_version); note(`the act-owned package ${short(PKG.package_id)} stands (${PKG.state}, version ${PKG.current_version}) — an earlier run`); }
  else if (ASU === null || pair === null || dec === null) note(`the assumption (${ASU === null ? 'absent' : 'found'}), a valid control/intervention pair (${pair === null ? 'absent' : 'found'}) or the demo DEC (${dec === null ? 'absent' : 'found'}) is missing — the package is not declared`);
  else {
    const d = await call(`${DC}/declare`, lb({ action: 'decision.package.declare', objectType: 'DPK' }), { decisionObjectId: dec, title: PKG_TITLE, statement: 'whether to keep the bearing sets on the booked routing through the strait, on the supplier records (the B28 demonstration; synthetic)', owner: brandt.principalId }, brandt.token);
    if (!d.ok) fail('L. Brandt declares the package', d);
    else {
      const id = d.body.package.packageId;
      const o = await call(`${DC}/${id}/versions/open`, lb({ action: 'decision.package.version', objectType: 'DPK', objectId: id }), { knownAt: new Date().toISOString(), observedThrough: null }, brandt.token);
      const v1 = o.ok ? o.body.version.version : null;
      const steps = v1 === null ? [o] : [
        await call(`${DC}/${id}/versions/${v1}/options`, lb({ action: 'decision.package.option', objectType: 'DPK', objectId: id }), { key: 'status-quo', title: 'Do nothing', kind: 'status_quo', consequences: [{ kind: 'run', id: pair.control, version: 1 }], risks: [], opportunities: [] }, brandt.token),
        await call(`${DC}/${id}/versions/${v1}/options`, lb({ action: 'decision.package.option', objectType: 'DPK', objectId: id }), { key: 'keep-routing', title: 'Keep the booked routing', kind: 'intervention', consequences: [{ kind: 'run', id: pair.intervention, version: 1 }, { kind: 'assumption', id: ASU, version: 1 }], risks: ['the strait closes before SYN-SHIP-4481 passes'], opportunities: [] }, brandt.token),
        await call(`${DC}/${id}/versions/${v1}/terms`, lb({ action: 'decision.package.terms', objectType: 'DPK', objectId: id }), { objectives: [REG.id], constraints: ['no air freight above 60 t/week'], approverPolicy: { quorum: 1, principals: [okafor.principalId], expires_after_days: 14 },
          monitoringConditions: [{ kind: 'review', every_days: 7, owner: brandt.principalId }], reversibility: 'reversible until the vessel enters the strait', informationValue: 'a week of observation would not change the ranking of the options' }, brandt.token),
        await call(`${DC}/${id}/versions/${v1}/choice`, lb({ action: 'decision.package.choice', objectType: 'DPK', objectId: id }), { option_key: 'keep-routing', rationale: 'The supplier records keep SYN-SHIP-4481 on the booked routing; rerouting now costs more than it saves.', decision_deadline: '2024-01-26',
          accepted_trade_offs: ['exposure to the strait for one more sailing'], action_owner: brandt.principalId,
          outcome_criteria: [{ key: 'line_stop_days', quantity: 'line-stop days at SYN-LINE-A1 over the decision window', unit: 'days', target: 0, comparator: '<=', by: '2024-04-10', observed_on: 'twin:outcome.line_stop_days:SYN-LINE-A1', twin_id: pair.twin, period: { from: '2024-01-11', to: '2024-04-10' } }] }, brandt.token),
      ];
      const bad1 = steps.find((x) => !x.ok);
      if (bad1) fail('the draft (L. Brandt)', bad1);
      else {
        const pp = await call(`${DC}/${id}/versions/${v1}/propose`, lb({ action: 'decision.package.propose', objectType: 'DPK', objectId: id }), {}, brandt.token);
        if (!pp.ok) fail('L. Brandt proposes', pp);
        else {
          const digest = pp.body.proposal.versionDigest;
          const ap = await call(`${DC}/${id}/versions/${v1}/approve`, so({ action: 'decision.approve', objectType: 'APR' }), { decision: 'approve', versionDigest: digest, rationale: 'The records support the booked routing for one more sailing.' }, okafor.token);
          if (!ap.ok) fail('S. Okafor approves', ap);
          else ok(`L. Brandt DECLARED the act-owned package ${short(id)} on the demo DEC (status-quo: the control ${short(pair.control)}; keep-routing — CHOSEN: the run ${short(pair.intervention)} + the assumption ${short(ASU)}), PROPOSED version ${v1} (digest ${digest.slice(0, 12)}…); S. Okafor APPROVED it (${ap.body.approval.state})`);
        }
      }
      PKG = (await q(`select package_id::text, state, current_version, committed_version from decision.packages_current where package_id = $1`, [id]))[0]; PKGV = Number(PKG.current_version);
    }
  }
  // (c) THE SUSPENSION (M. Dvořák) → SourceHealthChanged → the source-health subscriber: the markers, through the assumption; the coverage loss.
  if (SRC_NW === null || SRC_NW.lifecycle_state !== 'active') note(`the source is ${SRC_NW?.lifecycle_state ?? 'absent'} — the suspension is not staged`);
  else {
    const t6 = await mark();
    const s = await transition(dvorak, SRC_NW.source_id, Number(SRC_NW.contract_version), 'suspended', `${PURPOSE_NOTE}: the supplier records stop (the portal is down) — suspended to show what rests on it constrained, remediated, and reactivated.`);
    if (!s.ok) fail('M. Dvořák suspends the source', s);
    else {
      ok(`M. Dvořák SUSPENDED "${SRC_NW.name}" (contract version ${SRC_NW.contract_version})`);
      const ev = await waitOutbox('SourceHealthChanged', (x) => x.source_id === SRC_NW.source_id && x.state === 'suspended', t6);
      SUSP = ev;
      const d = ev === null ? null : (await settled(ev.id, ['source-health'])).find((x) => x.consumer_kind === 'source-health') ?? null;
      const marks = ev === null ? [] : await q(`select marker_id::text, subject_kind, subject_id::text, health_state, reason from observation.source_impact_markers where source_id = $1 and set_by_event = $2 order by subject_kind`, [SRC_NW.source_id, ev.id]);
      const onAsu = marks.find((m) => m.subject_kind === 'assumption' && m.subject_id === ASU); const onPkg = marks.find((m) => m.subject_kind === 'package' && m.subject_id === PKG?.package_id);
      if (d?.state === 'applied' && onAsu && onPkg) ok(`SourceHealthChanged (${short(ev.id)}) → the source-health subscriber (${effects(d)}): ${marks.length} MARKER(S) — ${tally(marks, 'subject_kind')}: the assumption ${short(ASU)} and the package ${short(PKG.package_id)} — reached THROUGH the assumption its option cites`);
      else bad(`the markers: delivery ${d?.state ?? 'NONE'} ${d?.last_error ?? ''}; set ${tally(marks, 'subject_kind')}; assumption ${onAsu ? 'marked' : 'NOT marked'}, package ${onPkg ? 'marked' : 'NOT marked'}`);
      LOSS = (await q(`select item_id::text, state, owner_principal_id::text, route_roles, title, created_at, cause_event_id::text from executive.attention_items where tenant_id = $1 and domain_id = $2 and signal_class = 'source.coverage_loss' and subject_id = $3 and cause_event_id = $4 limit 1`, [T, D, SRC_NW.source_id, ev?.id ?? null]))[0] ?? null;
      if (PKG !== null && PKGV !== null) {
        const br = await markersRead(brandt, { packageId: PKG.package_id, version: PKGV });
        const bearing = br.ok ? (br.body.package?.markers ?? []) : [];
        if (br.ok && bearing.some((b) => b.subject_kind === 'assumption')) ok(`the markers BEARING on version ${PKGV} (L. Brandt's read): ${bearing.map((b) => `${b.subject_kind} ${short(b.subject_id)} ${b.health_state}${b.acknowledged ? ' (acknowledged)' : ''}`).join(', ')}`);
        else bad(`the bearing read: ${br.ok ? JSON.stringify(bearing).slice(0, 300) : refusalLine(br)}`);
        if (PKG.committed_version !== null) note(`the package was committed by an earlier run (version ${PKG.committed_version}) — the commitment is not attempted again`);
        else {
          const vr = (await q(`select version_digest from decision.package_versions where package_id = $1 and version = $2`, [PKG.package_id, PKGV]))[0];
          const c1 = await call(`${DC}/${PKG.package_id}/versions/${PKGV}/commit`, lb({ action: 'decision.commit', objectType: 'CMT' }), { versionDigest: vr.version_digest }, brandt.token);
          if (!c1.ok && /source_impact/.test(String(c1.body?.message))) ok(`L. Brandt's COMMITMENT of version ${PKGV} REFUSED while the bearing marker stands unacknowledged: ${refusalLine(c1)}`);
          else bad(`the commitment on a suspended source: ${c1.ok ? 'COMMITTED' : refusalLine(c1)}`);
          const ids = bearing.filter((b) => !b.acknowledged).map((b) => b.marker_id);
          const a = await ackImpact(brandt, PKG.package_id, { version: PKGV, markerIds: ids, reason: 'B28: the supplier records are suspended; the booked routing stands on what they said before — accepted for this version.' });
          if (!a.ok) fail('L. Brandt acknowledges the source impact', a);
          else {
            const k = a.body.acknowledgement;
            ok(`L. Brandt (decision_authority) ACKNOWLEDGED ${k.acknowledged.length} bearing marker(s) for version ${k.version} (outstanding ${k.outstanding.length}) — "${k.reason}"`);
            const c2 = await call(`${DC}/${PKG.package_id}/versions/${PKGV}/commit`, lb({ action: 'decision.commit', objectType: 'CMT' }), { versionDigest: vr.version_digest }, brandt.token);
            if (c2.ok) ok(`the same commitment NOW admitted: L. Brandt COMMITTED version ${PKGV} (commitment ${short(c2.body.commitment.commitmentId)}, ${c2.body.commitment.opClass}) — the record says who answered for the suspended source`);
            else fail('L. Brandt commits after the acknowledgement', c2);
          }
        }
      }
    }
  }
}
console.log('\nB28-R (the B24 carryover (a)) — the supplier-portal source loses coverage; the coverage-loss item opens a remediation owned by M. Dvořák (fallback: the corridor stream; re-collection), shown on the corridor warning\'s coverage gap, closed when the source recovers');
let REM = null;
{
  if (SUSP === null) note('no suspension — the remediation is not staged');
  else if (LOSS === null) bad('the suspension routed no source.coverage_loss item');
  else {
    ok(`the coverage-loss item ${short(LOSS.item_id)} "${String(LOSS.title).slice(0, 100)}" — ${LOSS.state}, owner ${await loginOf(LOSS.owner_principal_id)}, roles ${LOSS.route_roles.join('+')}`);
    const o = await remOpen(dvorak, SRC_NW.source_id, { itemId: LOSS.item_id, owner: dvorak.principalId, reason: 'the supplier portal stopped; fall back to the corridor stream and re-collect the supplier records (B28)' });
    if (!o.ok) fail('M. Dvořák opens the remediation', o);
    else {
      const r = o.body.remediation; REM = r.remediation_id;
      const row = (await q(`select gap, gap_from, health_at_opening from observation.coverage_remediations where remediation_id = $1`, [REM]))[0];
      ok(`M. Dvořák OPENED remediation ${short(REM)} from the item (owner ${await loginOf(r.owner)}, ${r.state}): the health at opening ${r.health?.state} (${r.health?.basis}); the gap from ${iso(row.gap_from)} (the item's arrival), measurements ${Object.entries(row.gap?.measurements ?? {}).map(([k, v]) => `${k} ${v.state}${v.reason ? ` — ${v.reason}` : ''}`).join('; ')}`);
      const again = await remOpen(dvorak, SRC_NW.source_id, { itemId: LOSS.item_id, owner: dvorak.principalId, reason: 'a second opening of the same loss (B28)' });
      if (again.status === 409) ok(`a second opening refused (one open remediation per source): ${refusalLine(again)}`); else bad(`the second opening: ${refusalLine(again)}`);
      const fb = LSRC?.source_id ?? (await srcOf('red-sea-corridor-stream'))?.source_id ?? null;
      const s1 = fb === null ? null : await remStep(dvorak, SRC_NW.source_id, REM, { kind: 'fallback_source', fallbackSourceId: fb, reason: 'the corridor stream carries the Bab el-Mandeb transits while the supplier portal is down' });
      if (s1?.ok) ok(`step 1 — FALLBACK: the corridor stream ${short(fb)} (health ${s1.body.remediation.step?.fallback_health?.state}); the remediation ${s1.body.remediation.from_state} → ${s1.body.remediation.state}`);
      else if (s1 !== null) fail('M. Dvořák names the fallback', s1);
      // THE RE-COLLECTION through the existing collection path (the upload of the supplier records): the remediation never starts a run itself —
      // its step NAMES a collection run of the source started after the opening (0088 §R3).
      const up = await upload(hoffmann, { sourceId: SRC_NW.source_id, contractVersion: Number(SRC_NW.contract_version), files: [{ filename: 'supplier-portal-recollect-2024Q1-b28.csv', mediaType: 'text/csv; charset=utf-8', base64: Buffer.from(B24_CSV, 'utf8').toString('base64'), documentTime: null }] });
      const answered = up.body?.run?.runId ?? null;
      const recorded = (await q(`select run_id::text, state from observation.collection_runs_current where source_id = $1 and started_at >= (select opened_at from observation.coverage_remediations where remediation_id = $2) order by started_at desc limit 1`, [SRC_NW.source_id, REM]))[0] ?? null;
      note(`A. Hoffmann triggered the RE-COLLECTION through the upload path while the contract is suspended: ${up.ok ? `answered run ${short(answered)} ${up.body.run?.state}${up.body.run?.reason ? ` — "${up.body.run.reason}"` : ''}` : refusalLine(up)}; a collection run of the source recorded since the opening: ${recorded === null ? 'NONE' : `${short(recorded.run_id)} ${recorded.state}`}`);
      if (recorded !== null) {
        const s2 = await remStep(dvorak, SRC_NW.source_id, REM, { kind: 'recollect', runId: recorded.run_id, reason: 're-collect the supplier records for the gap window once the portal answers' });
        if (s2.ok) ok(`step 2 — RE-COLLECTION: run ${short(recorded.run_id)} recorded with its state ${s2.body.remediation.step?.run_state}`); else fail('M. Dvořák names the re-collection run', s2);
      } else {
        // 0088 §I (found by this act's rehearsals, corrected): a suspended source records no run — the re-collection is recorded PLANNED
        const s2 = await remStep(dvorak, SRC_NW.source_id, REM, { kind: 'recollect', reason: 're-collect the supplier records for the gap window once the portal answers' });
        if (s2.ok && s2.body.remediation.step?.planned === true) ok(`step 2 — RE-COLLECTION PLANNED (the suspended source records no run; a later step names the run): ${s2.body.remediation.step?.note}`);
        else fail('M. Dvořák plans the re-collection', s2);
      }
      if (BAB !== null) {
        const lc = await lifecycle(weber, BAB);
        const gaps = lc.ok ? lc.body.lifecycle.coverage_gaps : null;
        const g = (gaps?.markers ?? []).find((m) => m.source_id === SRC_NW.source_id) ?? null;
        if (g !== null && g.remediation?.remediation_id === REM) ok(`THE CORRIDOR WARNING's COVERAGE GAP (J. Weber's lifecycle read of the Bab el-Mandeb warning ${short(BAB)}): ${gaps.count} gap(s) — the ${g.subject_kind} marker of "${SRC_NW.source_key}" (${g.health_state}, via ${g.via}) carries its REMEDIATION ${short(g.remediation.remediation_id)} (${g.remediation.state}, owner ${await loginOf(g.remediation.owner_principal_id)}, steps ${(g.remediation.steps ?? []).map((x) => x.kind).join(' → ')})`);
        else bad(`the warning's coverage gaps: ${lc.ok ? JSON.stringify(gaps).slice(0, 400) : refusalLine(lc)}`);
      }
    }
    // RECOVERY: reactivated → SourceHealthChanged active → the markers cleared and the remediation CLOSED closed_recovered, automatically.
    const t7 = await mark();
    const r = await transition(dvorak, SRC_NW.source_id, Number(SRC_NW.contract_version), 'active', `${PURPOSE_NOTE}: the supplier portal answers again — reactivated.`);
    if (!r.ok) fail('M. Dvořák reactivates the source', r);
    else {
      const ev2 = await waitOutbox('SourceHealthChanged', (x) => x.source_id === SRC_NW.source_id && x.state === 'active', t7);
      const d2 = ev2 === null ? null : (await settled(ev2.id, ['source-health'])).find((x) => x.consumer_kind === 'source-health') ?? null;
      const still = (await q(`select count(*)::int n from observation.source_impact_markers where source_id = $1 and state = 'active'`, [SRC_NW.source_id]))[0].n;
      if (d2?.state === 'applied' && still === 0) ok(`M. Dvořák REACTIVATED the source → SourceHealthChanged (${short(ev2.id)}) applied (${effects(d2)}): no marker of the source active any more — the assumption's and the package's cleared`);
      else bad(`the reactivation: delivery ${d2?.state ?? 'NONE'}, still active ${still}`);
      if (REM !== null) {
        const rr = (await q(`select state, closure, gap_to from observation.coverage_remediations where remediation_id = $1`, [REM]))[0];
        const evs = await q(`select event from observation.coverage_remediation_events where remediation_id = $1 order by occurred_at`, [REM]);
        if (rr.state === 'closed_recovered' && rr.closure?.automatic === true && rr.closure?.health_event === ev2?.id) ok(`the remediation CLOSED ${rr.state} AUTOMATICALLY on the recovery (the closure names the health event ${short(rr.closure.health_event)}; the gap to ${iso(rr.gap_to)}); its ledger ${evs.map((e) => e.event).join(' → ')}`);
        else bad(`the remediation after the recovery: ${rr.state} ${JSON.stringify(rr.closure ?? null).slice(0, 200)}`);
        const ls = await remList(dvorak, SRC_NW.source_id);
        if (ls.ok) note(`the source's remediations (M. Dvořák's read): health now ${ls.body.health_now?.state} (${ls.body.health_now?.basis}); ${ls.body.remediations.map((x) => `${short(x.remediation_id)} ${x.state}`).join(', ')}`);
        if (BAB !== null) { const lc = await lifecycle(weber, BAB); if (lc.ok) note(`the corridor warning's coverage gaps after the recovery: ${lc.body.lifecycle.coverage_gaps.count} — "${lc.body.lifecycle.coverage_gaps.note}"`); }
      }
    }
  }
}

/* ── B28-N NOVELTY ─────────────────────────────────────────────────────────────────── */
console.log('\nB28-N F-P6-07 — the Weak Signal Agent nominates and ranks; a routed corridor item shows its novelty dimension from the detector\'s measure');
let NOV_WARNING = null;
if (WSA !== null) {
  const AS_OF = '2023-12-20';
  const prior = (await q(`select signal_id::text, novelty::float8 novelty, title, candidate_id::text from prediction.signals_current where tenant_id = $1 and domain_id = $2 and nominator_kind = 'agent' and detector_key = 'novelty' and as_of = $3 order by created_at limit 1`, [T, D, AS_OF]))[0] ?? null;
  let NSIG = prior;
  if (prior !== null) note(`the agent's novelty signal ${short(prior.signal_id)} as of ${AS_OF} is nominated — an earlier run`);
  else {
    const r = await runAgent(dvorak, WSA.agent_id, { task: 'signal_scan', asOf: AS_OF });
    if (!r.ok) fail('M. Dvořák triggers the Weak Signal Agent', r);
    else {
      const run = r.body.run; const out = { ...(run.outputs ?? {}), ...((await q(`select outputs from executive.agent_runs where run_id = $1`, [run.runId]))[0]?.outputs ?? {}) };
      const nominated = out.nominated ?? [];
      if (run.outcome === 'finished' && nominated.length > 0 && out.nominator_kind === 'agent')
        ok(`M. Dvořák TRIGGERED the Weak Signal Agent's scan as of ${AS_OF} (an observation day — event time): run ${short(run.runId)} ${run.outcome} under the agent's own session — ${Array.isArray(out.detections) ? out.detections.length : out.detections} reading(s) recorded, ${nominated.length} NOMINATED (nominator agent, max_items ${out.max_items}): ${nominated.map((n) => `${n.detector} "${String(n.title).slice(0, 70)}" measure ${n.measure}`).join('; ')}; held ${(out.held ?? []).length}, waiting ${(out.waiting ?? []).length}; absent detectors ${(out.absent ?? []).map((a) => `${a.detector} — ${a.reason}`).join('; ') || 'none'}`);
      else bad(`the agent's run: ${run.outcome} ${run.stopReason ?? ''} ${JSON.stringify(out).slice(0, 300)}`);
      const refused = (run.refusals ?? []).find((x) => x.action === 'prediction.signal.dispose');
      if (refused) ok(`the agent's attempt to DISPOSE of its top signal refused at the PDP and recorded on the run: ${refused.code} — ${String(refused.reason).slice(0, 160)}`); else bad(`no recorded disposal refusal on the run: ${JSON.stringify(run.refusals ?? []).slice(0, 200)}`);
      const rk = out.ranking?.ranking_id ? (await q(`select ranker_kind, ordering from prediction.signal_rankings where ranking_id = $1`, [out.ranking.ranking_id]))[0] ?? null : null;
      if (rk !== null) ok(`the agent RANKED the live signals (ranker ${rk.ranker_kind}, ${rk.ordering.length} place(s), no weighted score): ${rk.ordering.slice(0, 3).map((x) => `${x.position}. "${String(x.title).slice(0, 55)}" — ${x.explanation}`).join(' | ')}`);
      else bad(`the agent's ranking: ${JSON.stringify(out.ranking ?? null).slice(0, 200)}`);
      NSIG = (await q(`select signal_id::text, novelty::float8 novelty, title, candidate_id::text from prediction.signals_current where tenant_id = $1 and domain_id = $2 and nominator_kind = 'agent' and detector_key = 'novelty' and nominated_run_id = $3 order by created_at limit 1`, [T, D, run.runId]))[0] ?? null;
    }
  }
  if (NSIG === null) bad('the agent nominated no novelty signal — the novelty scene is not staged');
  else {
    const e = await escalate(hoffmann, NSIG.signal_id, { note: 'The novelty detector reads the corridor collapse; the Regensburg line is exposed (B28 demonstration).', consequence: 'C3', confidence: 0.7, windowHours: 48,
      affected: { objectives: [REG.id], geographies: ['BAB-EL-MANDEB'], horizon: `as of ${AS_OF}` } });
    if (!e.ok) fail('A. Hoffmann escalates the agent\'s novelty signal', e);
    else {
      const cid = e.body.escalation.candidate.candidate_id;
      ok(`A. Hoffmann ESCALATED the agent's novelty signal ${short(NSIG.signal_id)} "${NSIG.title.slice(0, 80)}" (novelty ${NSIG.novelty}) → candidate ${short(cid)}${e.body.escalation.repeated ? ' (REPEATED)' : ''} — the agent never disposes: a person does`);
      const [c] = await waitCandidates([cid], (r) => r.state !== 'pending', 300);
      NOV_WARNING = c?.warning_id ?? null;
      const tk = c?.state === 'raised' ? await raisingTick(cid) : null;
      if (NOV_WARNING === null) bad(`the novelty candidate: ${c?.state}`);
      else {
        note(`the candidate ${c.state}${tk ? ` — raised by the attention agent after tick run ${short(tk.run_id)}` : ''} → warning ${short(NOV_WARNING)}`);
        const it = await waitItemOfWarning(NOV_WARNING);
        const ev = it?.evaluation ?? {}; const dim = ev.dimensions ?? {};
        const basis = dim.dimension_basis?.novelty ?? null;
        if (it !== null && typeof dim.novelty === 'number' && basis?.detector === 'novelty' && (ev.reasons ?? []).some((x) => /^novelty .* at or above 0\.9$/.test(x)))
          ok(`the routed corridor item ${short(it.item_id)} (warning.raised, ${it.outcome}/${it.state}, owner ${await loginOf(it.owner_principal_id)}) carries NOVELTY ${dim.novelty} FROM THE DETECTOR'S MEASURE — basis ${JSON.stringify({ source: basis.source, detector: basis.detector, signal_id: short(basis.signal_id), detection_id: short(basis.detection_id), as_of: basis.as_of })}; the engine's reason under min_novelty 0.9: "${(ev.reasons ?? []).find((x) => /^novelty/.test(x))}"`);
        else bad(`the novelty item: ${it === null ? 'NOT routed' : JSON.stringify({ novelty: dim.novelty, basis, reasons: ev.reasons }).slice(0, 400)}`);
        if (BAB_ITEM !== null) note(`beside it, the Bab el-Mandeb warning's item: "${(BAB_ITEM.evaluation?.reasons ?? []).find((x) => /novelty/.test(x)) ?? 'no novelty reason'}" — its signals are analysts' nominations: no measure, no judgement`);
      }
    }
  }
} else note('no Weak Signal Agent — the novelty scene is not staged');

/* ── B28-L (part 2) EXPIRY, ESCALATION, FEEDBACK, EVALUATION ───────────────────────── */
console.log('\nB28-L F-P4-12 (part 2) — the warning expires unacknowledged and escalates; later J. Weber marks it `late` and the feedback appears in the warning evaluation');
if (BAB !== null) {
  let w = await warningRow(BAB);
  if (w.state === 'raised' && FAST_EXPIRY) {
    // REHEARSAL ONLY: this ONE warning's window moved into the past on the database clock, just before the next tick (never on eye_demo).
    const moved = (await q(`update prediction.warnings_current set response_window_closes_at = clock_timestamp() - interval '1 second' where warning_id = $1 and state = 'raised' returning response_window_closes_at`, [BAB]))[0] ?? null;
    note(`REHEARSAL SHORTCUT (ACT_FAST_EXPIRY): the window of warning ${short(BAB)} moved into the past by the superuser (closes ${iso(w.response_window_closes_at)} → ${iso(moved?.response_window_closes_at)}, the database clock) — on eye_demo the act waits for the real one-hour window`);
    w = await warningRow(BAB);
  }
  if (w.state === 'raised') {
    const wait = Math.max(0, new Date(w.response_window_closes_at).getTime() - (await mark()).getTime());
    note(`[${elapsed()}] waiting ${Math.round(wait / 1000)} s for the warning's response window to close on the database clock (${iso(w.response_window_closes_at)}), then for the next scheduled tick — no clock is moved; nobody acknowledges it`);
    await sleep(wait + 1000);
    for (let i = 0; i < 240 && w.state === 'raised'; i += 1) { await sleep(1000); w = await warningRow(BAB); }
  }
  // the hour outlived the access tokens: every persona signs in again through the real login route (nothing printed)
  for (const [s, l] of [[dvorak, 'm.dvorak'], [eriksen, 'n.eriksen'], [weber, 'j.weber'], [brandt, 'l.brandt'], [hoffmann, 'a.hoffmann'], [okafor, 's.okafor']]) s.token = (await who(l)).token;
  admin.token = (await adminSession(env)).token;
  const evs = await warningEvents(BAB);
  const exp = evs.find((e) => e.event === 'warning.expired'); const esc = evs.find((e) => e.event === 'warning.escalated');
  const tk = exp === null || exp === undefined ? null : (await q(`select run_id::text, started_at, trigger_kind, outputs -> 'steps' -> 'warning-expiry' st from executive.agent_runs where tenant_id = $1 and domain_id = $2 and task = 'attention_tick' and principal_id = $3
                                                                    and started_at <= $4 order by started_at desc limit 1`, [T, D, exp.actor, exp.occurred_at]))[0] ?? null;
  if (w.state === 'expired' && exp && exp.actor === AGENT.principal_id) ok(`[${elapsed()}] the warning EXPIRED unacknowledged: warning.expired at ${iso(exp.occurred_at)} ("${exp.details.reason}"), by the attention agent's tick${tk ? ` — run ${short(tk.run_id)} (trigger ${tk.trigger_kind}), step warning-expiry ${JSON.stringify(tk.st)}` : ''}`);
  else bad(`the expiry: state ${w.state}, event ${exp ? `by ${await loginOf(exp.actor)}` : 'NONE'}`);
  const it = BAB_ITEM === null ? null : (await q(`select item_id::text, state, escalations, route_roles, due_at from executive.attention_items where item_id = $1`, [BAB_ITEM.item_id]))[0];
  const iev = it === null ? [] : (await itemEvents(it.item_id)).filter((e) => e.event === 'item.escalated');
  const viaExpiry = iev.find((e) => e.details?.via === 'warning.expired');
  if (esc && viaExpiry && it.state === 'escalated') ok(`and ESCALATED AT ONCE: warning.escalated ${JSON.stringify((esc.details.items ?? []).map((x) => ({ item_id: short(x.item_id), from: x.from_state, to: x.to_state, escalation: x.escalation, roles: x.route_roles })))}; the item ${short(it.item_id)} is ${it.state} (escalation ${it.escalations}, roles ${it.route_roles.join('+')}, due ${iso(it.due_at)}) — item.escalated via ${viaExpiry.details.via}, the missed deadline ${viaExpiry.details.missed_deadline}`);
  else bad(`the escalation on expiry: warning.escalated ${esc ? 'present' : 'ABSENT'}; item ${it === null ? 'none' : `${it.state}, ${iev.map((e) => e.details?.via ?? 'deadline').join(', ') || 'no escalation'}`}`);
  // FEEDBACK (J. Weber) and THE EVALUATION (M. Dvořák).
  const f = await feedback(weber, BAB, { kind: 'late', note: 'The escalation came after the rerouting window for SYN-SHIP-4481 had closed.' });
  if (!f.ok) fail('J. Weber gives feedback', f);
  else ok(`J. Weber marked the warning LATE${f.body.feedback.repeated ? ' (REPEATED — an earlier run)' : ''}: feedback ${short(f.body.feedback.feedback_id)} on the warning (state ${f.body.feedback.warning_state}) — "${f.body.feedback.note ?? 'The escalation came after the rerouting window…'}"`);
  const f2 = await feedback(weber, BAB, { kind: 'late', note: 'said again' });
  if (f2.ok && f2.body.feedback.repeated === true) ok(`the same feedback again → the recorded one (repeated true); no second warning.feedback event`); else bad(`the repeat: ${f2.ok ? JSON.stringify(f2.body.feedback) : refusalLine(f2)}`);
  const ev = await evaluateWarnings(dvorak, { min_sample: 1 });
  if (!ev.ok) fail('M. Dvořák evaluates the warnings', ev);
  else {
    const e = ev.body.evaluation; const ws = e.by_origin?.weak_signal ?? {};
    if ((ws.counts?.late ?? 0) >= 1) ok(`M. Dvořák EVALUATED the warnings (evaluation ${short(e.evaluation_id)}, min_sample 1): verdict ${e.verdict} — "${String(e.reason ?? '').slice(0, 160)}"; weak_signal: ${ws.with_feedback} with feedback, counts ${JSON.stringify(ws.counts)}, late rate ${JSON.stringify(ws.late_rate)}`);
    else bad(`the evaluation: ${JSON.stringify(e).slice(0, 400)}`);
    note(`  by origin: ${Object.entries(e.by_origin ?? {}).map(([k, v]) => `${k} ${v.raised} raised, ${v.with_feedback} with feedback`).join('; ')}`);
    note(`  T3 (raised before the decision deadline): ${JSON.stringify(e.t3)}; the acknowledgement: ${JSON.stringify(e.acknowledgement)}; clusters ${JSON.stringify(e.clusters)}`);
    const ls = await listEvaluations(weber);
    if (ls.ok) note(`the evaluations (J. Weber's read): ${ls.body.evaluations.map((x) => `${short(x.evaluation_id)} ${x.verdict}`).join(', ')}`); else fail('the evaluations list', ls);
  }
} else note('no Bab el-Mandeb warning — the expiry scene is not staged');

/* ── B28-9 THE STATE ──────────────────────────────────────────────────────────────── */
console.log('\nB28-9 THE STATE — what the act leaves');
{
  const wc = await q(`select origin_kind, state, count(*)::int n from prediction.warnings_current where tenant_id = $1 and domain_id = $2 group by 1, 2 order by 1, 2`, [T, D]);
  note(`the warnings: ${wc.map((x) => `${x.origin_kind} ${x.state} ${x.n}`).join(', ')}`);
  const cc = await q(`select origin_kind, state, count(*)::int n from prediction.warning_candidates where tenant_id = $1 and domain_id = $2 group by 1, 2 order by 1, 2`, [T, D]);
  note(`the candidate intake: ${cc.map((x) => `${x.origin_kind} ${x.state} ${x.n}`).join(', ') || 'empty'}`);
  const sg = await q(`select nominator_kind, maturity, coalesce(disposition, 'undisposed') disposition, count(*)::int n from prediction.signals_current where tenant_id = $1 and domain_id = $2 group by 1, 2, 3 order by 1, 2, 3`, [T, D]);
  note(`the weak signals: ${sg.map((x) => `${x.nominator_kind}/${x.maturity}/${x.disposition} ${x.n}`).join(', ')}`);
  const det = await detectors(hoffmann);
  if (det.ok) note(`the detectors (A. Hoffmann's read): ${(det.body.detectors ?? []).map((d) => `${d.detector_key} ${d.status}${d.absent_reason ? ` — ${d.absent_reason}` : ''}`).join('; ')}`);
  const sp = await q(`select p.processor_id::text, r.rule_key, p.state, p.watermark, (select count(*)::int from prediction.stream_inputs i where i.processor_id = p.processor_id) inputs, (select count(*)::int from prediction.stream_signals s where s.processor_id = p.processor_id) signals from prediction.stream_processors p join prediction.stream_rules r using (rule_id) where p.tenant_id = $1 and p.domain_id = $2`, [T, D]);
  note(`the stream processors: ${sp.map((x) => `${x.rule_key} ${short(x.processor_id)} ${x.state}, watermark ${day(x.watermark)}, ${x.inputs} input(s), ${x.signals} signal(s)`).join('; ') || 'none'}`);
  const rm = await q(`select state, count(*)::int n from observation.coverage_remediations where tenant_id = $1 and domain_id = $2 group by 1`, [T, D]);
  const mk = await q(`select state, subject_kind, count(*)::int n from observation.source_impact_markers where tenant_id = $1 and domain_id = $2 group by 1, 2 order by 1, 2`, [T, D]);
  note(`the remediations: ${tally(rm.flatMap((x) => Array(x.n).fill(x)), 'state')}; the markers: ${mk.map((x) => `${x.state} ${x.subject_kind} ${x.n}`).join(', ') || 'none'}`);
  const it = await q(`select signal_class, state from executive.attention_items where tenant_id = $1 and domain_id = $2 and created_at >= to_timestamp($3 / 1000.0)`, [T, D, tStart]);
  note(`the attention items this act routed: ${tally(it.map((x) => ({ k: `${x.signal_class} ${x.state}` })), 'k')}`);
  const tk = (await q(`select count(*)::int n from executive.agent_runs where tenant_id = $1 and domain_id = $2 and task = 'attention_tick' and started_at >= to_timestamp($3 / 1000.0)`, [T, D, tStart]))[0].n;
  note(`the attention agent ticked ${tk} time(s) during the act`);
  const ir = await interfaces();
  if (ir.ok) { const all = ir.body.interfaces ?? []; note(`the register: ${all.filter((i) => i.binding_state === 'bound').length} bound / ${all.filter((i) => i.binding_state === 'partial').length} partial / ${all.filter((i) => i.binding_state === 'unbound').length} unbound`); }
  note('LIMITS said: no real delivery provider (email / SMS / Teams — owner decision D6): the warning items are in_app only; "the Regensburg supplier-portal source" is NORDWERK\'s internal records (the demonstration has no supplier portal) and the assumption rests on the claims its B24 upload\'s extraction admitted, not on a 90-day forecast of it (the demonstration holds none from that source); the RE-COLLECTION step is not recorded on a suspension (a suspended contract records no collection run, and the recovery closes the remediation) — it is the harness\'s on a degraded source; the remediation never starts or schedules a run; the reports behind the weak signals are SYNTHETIC advisories whose text is a label and the GDELT article list, and the readings ("insurer withdrawals", "an attack near Perim") are the analysts\' statements; the three incident reports name the corridor indicator as their subject (no Bab el-Mandeb place entity exists); a stream processor\'s STALL, CORRUPT STATE and OFFSETS-DIVERGENCE recoveries, a person\'s retraction, the storm rule, the closure criteria and the warnings consumer\'s graph-impact / forecast-revision / twin-degradation origins are the harnesses\' (phase6-streams-b28, phase6-warnings-b28), not staged here; cross-domain convergence is ABSENT (no cross-domain read under RLS); the indicator retire / renew governance is the harness\'s (phase6-signals-b28); the Weak Signal Agent has no scheduled cadence (an operator triggers it); nothing is cleaned: the signals, the candidates, the warnings, the stream source, its rule and processor, the assumption, the committed package and the remediation stand as demonstration facts.');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
process.exit(Math.min(failureCount(), 255));
