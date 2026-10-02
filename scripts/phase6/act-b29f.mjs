#!/usr/bin/env node
/**
 * THE B29-F ACT (2026-09-29) — the owner's bounded B29 review, finding B29-F1: a draft a family's whole-version rule refuses had no recovery.
 * ONE scene on the demonstration, through the REAL HTTP path, by E. Kovács (twin owner): the zero-capacity line refused AT GROUNDING (the
 * accumulated-draft rule, 0093's TypeScript half); a wrong figure grounded; the key refused a second time (one element per key per draft);
 * a second draft refused (one open draft per branch); the draft WITHDRAWN with a reason (twin.version.withdraw, 0093) — its elements kept,
 * the event written; the withdrawn draft closed to grounding; a new draft on the same branch grounded right and ADMITTED; the measures.
 *
 * RERUN-SAFE: the twin is looked up by title; a twin that already has an admitted version says "stands — an earlier run" and reports its
 * versions' states instead of acting twice. Nothing of the B29 act is replayed. Every figure is SYNTHETIC.
 *
 *   EYE_DB_NAME=eye_demo_b29 EYE_API=http://localhost:3411 node scripts/phase6/act-b29f.mjs    (the rehearsal copy)
 *   node scripts/phase6/act-b29f.mjs                                                          (the demonstration)
 */
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadLocalEnv } from '../local-env.mjs';
import { call, login, adminSession, demoScope, as, ok, bad, note, failureCount } from '../phase4/governed.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const requireApi = createRequire(join(ROOT, 'apps', 'api', 'package.json'));
const pg = requireApi('pg');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const DB_NAME = env.EYE_DB_NAME ?? 'eye_demo';
const REHEARSAL = DB_NAME !== 'eye_demo';
const X = `/v1/tenants/${T}/domains/${D}`; const W = `${X}/twins`; const CP = `${X}/twin-composition`;
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const fail = (label, r) => bad(`${label}: ${r.status} ${r.body?.message ?? JSON.stringify(r.body).slice(0, 300)}`);
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 240)}`;
const su = new pg.Client({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user: env.EYE_DB_MIGRATE_USER ?? 'eye', password: env.EYE_DB_MIGRATE_PASSWORD });
await su.connect();
const q = async (text, params = []) => (await su.query(text, params)).rows;
const tStart = Date.now();
console.log(`THE B29-F ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()}`);
const expectRefused = (label, r, status, re) => {
  if (!r.ok && r.status === status && (re === undefined || re.test(String(r.body?.message ?? '')))) ok(`${label} REFUSED — ${refusalLine(r)}`);
  else bad(`${label}: expected a ${status} refusal, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`);
};

/* ── B29F-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB29F-0 THE STATE — 0093, the persona');
{
  const m = (await q(`select filename from public.schema_migrations where filename like '0093%'`))[0];
  if (m) ok(`migration ${m.filename} applied`); else { bad('0093 is not applied'); process.exit(1); }
}
const kovacs = await login('e.kovacs', PW);
if (kovacs === null) { bad('E. Kovács (e.kovacs, the B29 act\'s process-twin owner) could not authenticate — run scripts/phase6/act-b29.mjs first'); process.exit(1); }
ok('E. Kovács (twin_owner; SYNTHETIC) opened a session');
const tw = (over) => as(kovacs, scope, { purposeId: 'twin', ...over });
const read = (path, payload = {}, objectId = null) => call(path, tw({ action: 'twin.read', objectType: 'TWN', objectId, sideEffect: 'none' }), payload, kovacs.token);

// The corridor twin's boundary and the NORDWERK terms record (what the B29 act's assumed elements cite), read as the B29 act reads them.
const CORRIDOR_TITLE = 'NORDWERK — Ningbo → Regensburg chain';
const corridor = (await q(`select twin_id::text id, boundary from twin.twins_current where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, CORRIDOR_TITLE]))[0] ?? null;
if (corridor === null) { bad(`the corridor twin "${CORRIDOR_TITLE}" is not present`); process.exit(1); }
const corridorV = (await q(`select version from twin.twin_versions where twin_id = $1 and branch_id = 'actual' and state = 'admitted' order by version desc limit 1`, [corridor.id]))[0] ?? null;
const termsEl = corridorV === null ? null : (await q(`select citations from twin.state_elements where twin_id = $1 and version = $2 and key = 'route.inland_days'`, [corridor.id, corridorV.version]))[0] ?? null;
const TERMS = (termsEl?.citations ?? []).find((c) => c.kind === 'evidence') ?? null;
if (TERMS === null) { bad('the corridor\'s route.inland_days cites no evidence record'); process.exit(1); }
const assumed = (key, value, unit) => ({ key, kind: 'assumed', value, unit, citations: [{ kind: TERMS.kind, id: TERMS.id, version: Number(TERMS.version) }] });
const BOUNDARY = Array.isArray(corridor.boundary) ? corridor.boundary : [];

/* ── B29F-1 THE DRAFT RECOVERY ────────────────────────────────────────────────────────── */
console.log('\nB29F-1 THE DRAFT RECOVERY — a zero-capacity line refused at grounding; a wrong figure grounded; the draft withdrawn; the right figure admitted on the same branch');
const TITLE = 'Regensburg plant — line 3 (process twin; the B29-F draft recovery)';
const KEY = 'line.capacity_per_day:l3';
let twinId = (await q(`select twin_id::text id from twin.twins_current where tenant_id = $1 and domain_id = $2 and title = $3 limit 1`, [T, D, TITLE]))[0]?.id ?? null;
if (twinId !== null) note(`"${TITLE}" stands — an earlier run (TWN ${short(twinId)})`);
else {
  const r = await call(`${W}/declare`, tw({ action: 'twin.declare', objectType: 'TWN' }), { kind: 'process', title: TITLE,
    statement: 'the Regensburg plant\'s line 3 — the B29-F draft-recovery scene (SYNTHETIC)', boundary: BOUNDARY, owner: kovacs.principalId, behaviourModelRef: 'supply-flow@1',
    validation: { status: 'unvalidated (synthetic grounding)', limitations: ['line 3 is a demonstration line; its capacity is assumed'] } }, kovacs.token);
  if (!r.ok) { fail(`E. Kovács declares "${TITLE}"`, r); await su.end(); process.exit(1); }
  twinId = r.body.twin.twinId;
  ok(`E. Kovács DECLARED "${TITLE}" (kind process) — TWN ${short(twinId)}`);
}
const versionsOf = async () => q(`select version, branch_id, state, element_count, withdrawal_reason from twin.twin_versions where twin_id = $1 order by version`, [twinId]);
const admittedAlready = (await versionsOf()).find((v) => v.state === 'admitted') ?? null;
if (admittedAlready !== null) {
  note(`v${admittedAlready.version} is admitted — an earlier run's recovery stands; the scene is not replayed`);
} else {
  // The open draft (resumed when an earlier, interrupted run left one).
  let v = (await q(`select version from twin.twin_versions where twin_id = $1 and branch_id = 'actual' and state = 'draft' order by version desc limit 1`, [twinId]))[0]?.version ?? null;
  if (v !== null) note(`E. Kovács resumes the open draft v${v} (an earlier run left it)`);
  else {
    const o = await call(`${W}/${twinId}/versions/open`, tw({ action: 'twin.version', objectType: 'TWN', objectId: twinId }), { branchId: 'actual', knownAt: new Date().toISOString() }, kovacs.token);
    if (!o.ok) { fail('E. Kovács opens a draft', o); await su.end(); process.exit(1); }
    v = o.body.version.version;
    ok(`E. Kovács OPENED draft v${v} on branch actual`);
  }
  const ground = (elements) => call(`${W}/${twinId}/versions/${v}/ground`, tw({ action: 'twin.ground', objectType: 'TWN', objectId: twinId }), { elements }, kovacs.token);
  // 1. The family's version-level rule at GROUNDING (0093's preflight over the accumulated draft): nothing is written.
  expectRefused(`grounding ${KEY} = 0 units/day (a line with no capacity)`, await ground([assumed(KEY, 0, 'units/day')]), 422, /a line with no capacity is not a line.*nothing was grounded/);
  const n0 = (await q(`select count(*)::int n from twin.state_elements where twin_id = $1 and version = $2`, [twinId, v]))[0].n;
  if (n0 === 0) ok('nothing was grounded: the draft holds 0 elements'); else note(`the draft holds ${n0} element(s) — an earlier run's`);
  // 2. A wrong figure grounded (the shift's rate, 500, entered where the day's belongs).
  const g = await ground([assumed(KEY, 500, 'units/day')]);
  if (g.ok) ok(`E. Kovács GROUNDED ${KEY} = 500 units/day — the shift's rate, entered where the day's belongs (the wrong figure)`);
  else if (g.status === 409) note(`${KEY} is already grounded in the resumed draft (${String(g.body?.message ?? '').slice(0, 100)})`);
  else fail(`E. Kovács grounds ${KEY} = 500`, g);
  // 3. The key cannot be grounded again in this draft; 4. no second draft opens on the branch.
  expectRefused(`grounding ${KEY} again (= 1000) in draft v${v}`, await ground([assumed(KEY, 1000, 'units/day')]), 409);
  expectRefused('opening another draft on branch actual while v' + v + ' is open',
    await call(`${W}/${twinId}/versions/open`, tw({ action: 'twin.version', objectType: 'TWN', objectId: twinId }), { branchId: 'actual', knownAt: new Date().toISOString() }, kovacs.token), 409, /already has an open draft/);
  // 5. THE WITHDRAWAL — the owner's act, with a reason.
  const REASON = 'line 3 was entered at the shift\'s rate (500), not the day\'s (1000); the draft is withdrawn and the line re-entered';
  const w = await call(`${W}/${twinId}/versions/${v}/withdraw`, tw({ action: 'twin.version.withdraw', objectType: 'TWN', objectId: twinId }), { reason: REASON }, kovacs.token);
  if (!w.ok) fail(`E. Kovács withdraws draft v${v}`, w);
  else {
    const wd = w.body.withdrawn;
    ok(`E. Kovács WITHDREW draft v${wd.version} (branch ${wd.branchId}) — state ${wd.state}, ${wd.elementCount} element(s) kept, at ${wd.withdrawnAt}; receipt auditSeq ${w.body.receipt?.auditSeq}`);
    const row = (await q(`select state, element_count, withdrawal_reason, (select count(*)::int from twin.state_elements e where e.twin_id = $1 and e.version = $2) kept from twin.twin_versions where twin_id = $1 and version = $2`, [twinId, v]))[0];
    const ev = (await q(`select details from twin.twin_events where twin_id = $1 and event = 'version.withdrawn' and (details ->> 'version')::int = $2`, [twinId, v]))[0] ?? null;
    if (row?.state === 'withdrawn' && row.kept === row.element_count && ev !== null) ok(`the row reads withdrawn with its ${row.kept} element(s) as grounded (history preserved); the event version.withdrawn names the reason: "${ev.details.reason}"`);
    else bad(`the withdrawn row or its event is not as expected: ${JSON.stringify({ row, ev })}`);
  }
  // 6. The withdrawn draft is closed.
  expectRefused(`grounding into the withdrawn draft v${v}`, await ground([assumed(KEY, 1000, 'units/day')]), 409);
  // 7. The branch is free: a new draft, the right figure, admission, the measures.
  const o2 = await call(`${W}/${twinId}/versions/open`, tw({ action: 'twin.version', objectType: 'TWN', objectId: twinId }), { branchId: 'actual', knownAt: new Date().toISOString() }, kovacs.token);
  if (!o2.ok) fail('E. Kovács opens the new draft on branch actual', o2);
  else {
    const v2 = o2.body.version.version;
    ok(`E. Kovács OPENED draft v${v2} on branch actual (the branch is free)`);
    const g2 = await call(`${W}/${twinId}/versions/${v2}/ground`, tw({ action: 'twin.ground', objectType: 'TWN', objectId: twinId }), { elements: [assumed(KEY, 1000, 'units/day')] }, kovacs.token);
    if (!g2.ok) fail(`E. Kovács grounds ${KEY} = 1000 into v${v2}`, g2); else ok(`E. Kovács GROUNDED ${KEY} = 1000 units/day into v${v2}`);
    const a = await call(`${W}/${twinId}/versions/${v2}/admit`, tw({ action: 'twin.version.admit', objectType: 'TWN', objectId: twinId }), { allowIncomplete: true }, kovacs.token);
    if (!a.ok) fail(`E. Kovács admits v${v2}`, a);
    else ok(`E. Kovács ADMITTED v${v2} — completeness ${a.body.admitted.completeness}, supersedes ${a.body.admitted.supersedes ?? 'nothing (the withdrawn draft was never admitted)'}`);
    const m = await read(`${CP}/twins/${twinId}/measures`, {}, twinId);
    if (!m.ok) fail('the family measures', m);
    else note(`the process family's measures on v${m.body.measures?.version}: ${JSON.stringify(m.body.measures?.measures ?? {})}`);
  }
}
{
  const vs = await versionsOf();
  note(`the twin's versions: ${vs.map((x) => `v${x.version} ${x.state}${x.state === 'withdrawn' ? ` ("${x.withdrawal_reason}")` : ''} · ${x.element_count} element(s)`).join('; ')}`);
  const ev = await q(`select event, count(*)::int n from twin.twin_events where twin_id = $1 group by 1 order by 1`, [twinId]);
  note(`the twin's ledger: ${ev.map((r) => `${r.event} × ${r.n}`).join(', ')}`);
  note('LIMITS said: every figure is SYNTHETIC; the refusal at grounding is the product\'s accumulated-draft rule (0093); the admission-time refusal of an element another path wrote '
    + '(a coupling, a carry-forward) and its recovery by the same withdrawal are HARNESS-PROVEN (phase6-composition-b29 C1, on the real database), not staged here; nothing is cleaned.');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 1000).toFixed(1)} s`);
process.exit(Math.min(failureCount(), 255));
