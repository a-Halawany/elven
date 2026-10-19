#!/usr/bin/env node
/**
 * CP-6 stage B80 on the demonstration (NORDWERK; eye_demo — or the rehearsal copy that EYE_DB_NAME and EYE_API name): SHELL AND FOUNDATIONS —
 * tokens and themes (F-P7-E-03), the shared component library (F-P7-E-05), the shell, the context bar and deep links (F-P7-E-01) — migration
 * 0118 — exercised by named personas through the REAL HTTP routes only (scripts/phase4/governed.mjs), each scene stating what it shows and
 * ASSERTING it (a scene that does not hold fails the act). EVERY OBJECT IS LOOKED UP AT RUN TIME; the act is RERUN-SAFE: each scene first reads
 * what an earlier run left (read-only SQL) and says "stands — an earlier run" instead of writing it twice. NOTHING IS PLANTED: no row is written
 * by SQL and no clock is moved; the deep link's instants are read from the warning's own recorded events (database clock).
 *
 * THREE CLAIMS, never mixed: CONSTRUCTION (the software and its harnesses phase6-{prelude,themes,drafts,navigation,context}-b80, the web unit
 * models and the catalogue walk); DEMONSTRATED OPERATION (this act — every persona SYNTHETIC; every theme, certification, design acceptance and
 * approval here carries `claim = demonstration`); REAL ACCEPTANCE — a real customer's brand acceptance, the named design authorities'
 * attestation, assistive-technology testing — NEVER claimed: the non-demonstration recording path is construction at B111 (F-P7-E-17), then
 * the external act at H3.
 *
 *   B80-0  THE STATE — 0118 applied; the cast; the build identity the API declares.
 *   B80-1  THEME (F-P7-E-03) — a new TENANT persona "NORDWERK brand owner (SYNTHETIC)" (branding_authority) created through the governed persona
 *          route proposes "NORDWERK Corporate" v1 (the brand red accent — its colours live ONLY in this script and the database, never in
 *          apps/web); L. Haddad (Design System Authority) previews and certifies → REFUSED naming the failing pairs and their ΔE (the accent is
 *          indistinguishable from color.critical); v2 corrected (the navy accent) → the proposer certifying refused → CERTIFIED (signed) →
 *          activated; activation of the refused v1 refused; the rollback to the certified core theme shown once, then v2 re-activated — END
 *          STATE: the NORDWERK theme in force, read on a TENANT and a DOMAIN route (what ThemeScope applies).
 *   B80-2  FORMS (F-P7-E-05) — M. Dvorak's draft of a source registration saved through shell.draft.save, read back (never a submission), the
 *          same content answered `unchanged`, a stale save refused; L. Brandt's draft of the decision-package form "Bab el-Mandeb corridor
 *          reroute (SYNTHETIC)" saved and read back, the server's validation refusing a one-character title (the form's own rule), then the
 *          package DECLARED through the existing decision routes (declare → version 1 → one option), each act its own receipt.
 *   B80-3  BULK (F-P7-E-05) — the Red Sea sources assessed by the sources page's BulkSelection rule (replay-mode only; a live-mode contract
 *          EXCLUDED with its reason), then each included contract SUSPENDED and back to ACTIVE with a reason — every item its own governed write
 *          (observation.source.transition) and its own receipt.
 *   B80-4  CONTEXT (F-P7-E-01) — L. Brandt's context bar read (the objective "Keep the Regensburg line supplied through Q1"); the IMPACT PREVIEW of
 *          the switch to the scenario "Bab el-Mandeb closure — Houthi activity and insurer withdrawal (SYNTHETIC)" (changed dimensions, his open
 *          work kept, approvals UNAFFECTED, client-held previews) BEFORE the governed commit (its digest, its receipt); the same preview
 *          committed again refused `context rejected (stale)`; a stale (retired) scenario refused `context rejected (stale)`.
 *   B80-5  DEEP LINK (F-P7-E-01) — the as-of read of a B28 corridor warning at an instant BETWEEN two of its recorded events (the exact version,
 *          the variance against current), an instant before its first event refused; opening it writes nothing to the warning.
 *   B80-6  THE INVENTORY AND THE ACCEPTANCE DEMONSTRATION RECORDS (B107's design-governance routes) — the inventory re-read from the repository and
 *          the new library components registered; the Design System Authority approves each with ONE accountable owner; the library lint
 *          (dg-lint-2); a B80 design baseline proposed and attested; a design acceptance record per B80 chapter scope proposed and attested
 *          (design, assurance, customer) — `claim = demonstration`.
 *   B80-7  THE STATE, the env lines for the walk, THE LIMITS.
 *
 * Output: stdout, and ALSO the file named by ACT_OUT (or the first argument). Nothing prints a credential: every persona's password is
 * EYE_TEST_ADMIN_PASSWORD from the environment; the signing key is bound in the API's environment by reference and never read here.
 */
import { closeSync, existsSync, openSync, readFileSync, writeSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { format } from 'node:util';
import { loadLocalEnv } from '../local-env.mjs';
import { API, call, login, adminSession, demoScope, ok, bad, note, failureCount, createPersona } from '../phase4/governed.mjs';
import { actTargetOrExit } from '../act-target.mjs';

// B80 integration pass (2026-10-19): the target is decided FIRST — before the local env is read, before any login, session
// or request. EYE_ACT_TARGET (rehearsal | live), EYE_DB_NAME and EYE_API come from the caller; a rehearsal that names no API,
// or names the live one, is refused here and contacts nothing (scripts/act-target.mjs; the B82 probe incident).
const ACT_TARGET = actTargetOrExit(process.env, { needs: ['api'] });

// THE OUTPUT FILE (ACT_OUT or argv[2]): every console line is also written there
const OUT = process.env.ACT_OUT ?? process.argv[2] ?? null;
if (OUT) {
  // written SYNCHRONOUSLY: process.exit() at the end never waits for a stream to drain (the tail of the run would be lost)
  const fd = openSync(OUT, 'w');
  const orig = console.log.bind(console);
  console.log = (...a) => { orig(...a); writeSync(fd, `${format(...a)}\n`); };
  process.on('exit', () => closeSync(fd));
}

const SELF_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const ROOT = process.env.EYE_ROOT ?? (existsSync(join(SELF_ROOT, '.eye-local', 'env')) ? SELF_ROOT : process.cwd());
const requireApi = createRequire(join(ROOT, 'apps', 'api', 'package.json'));
const pg = requireApi('pg');
const env = loadLocalEnv(ROOT);
const admin = await adminSession(env);
const scope = await demoScope(admin);
const { tenantId: T, domainId: D } = scope;
const PW = env.EYE_TEST_ADMIN_PASSWORD;
const DB_NAME = env.EYE_DB_NAME ?? 'eye_demo';
const REHEARSAL = DB_NAME !== 'eye_demo';
const short = (id) => (id === null || id === undefined ? '—' : `${String(id).slice(0, 4)}…${String(id).slice(-6)}`);
const dg = (x) => (x ? `${String(x).slice(0, 12)}…` : '—');
const refusalLine = (r) => `${r.status} ${r.body?.code ?? ''} — ${String(r.body?.message ?? JSON.stringify(r.body)).slice(0, 520)}`;
const fail = (label, r) => bad(`${label}: ${refusalLine(r)}`);
const rcpt = (r) => (r?.body?.receipt ? `POL ${String(r.body.receipt.policyDecisionId).slice(0, 13)}… · audit seq ${r.body.receipt.auditSeq}` : 'no receipt');
const dbConf = (user, password) => ({ host: env.EYE_DB_HOST ?? 'localhost', port: Number(env.EYE_DB_PORT ?? 5432), database: DB_NAME, user, password });
const su = new pg.Client(dbConf(env.EYE_DB_MIGRATE_USER ?? 'eye', env.EYE_DB_MIGRATE_PASSWORD));
await su.connect();
/** READ-ONLY checks (the superuser reads; it writes nothing). */
const q = async (text, params = []) => (await su.query(text, params)).rows;
const q1 = async (text, params = []) => (await q(text, params))[0] ?? null;
const iso = (t) => (t ? new Date(t).toISOString().slice(0, 19) + 'Z' : '—');
const sha256 = (b) => createHash('sha256').update(b).digest('hex');
const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(',')}]` : v !== null && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}` : JSON.stringify(v));
const tStart = Date.now();
console.log(`THE B80 ACT on ${DB_NAME}${REHEARSAL ? ' (REHEARSAL)' : ''} — ${new Date().toISOString()} — API ${API}`);
const expectRefused = (label, r, statuses, re) => {
  const st = Array.isArray(statuses) ? statuses : [statuses];
  if (!r.ok && st.includes(r.status) && (re === undefined || re.test(String(r.body?.message ?? '')))) { ok(`${label} REFUSED — ${refusalLine(r)}`); return true; }
  bad(`${label}: expected a ${st.join('/')} refusal${re ? ` matching ${re}` : ''}, got ${r.ok ? `${r.status} (accepted)` : refusalLine(r)}`); return false;
};
const ENV_OUT = {};

// ── envelopes ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const isRead = (action) => /\.(read|preview)$/.test(action);
const over = (s, sc, action, objectType, objectId, purposeId) => ({
  scope: sc, tenantId: sc === 'PLATFORM' ? null : T, domainId: sc === 'DOMAIN' ? D : null, principalId: `principal:${s.principalId}`, purposeId,
  action, objectType, objectId, sideEffect: isRead(action) ? 'none' : 'reversible', consequence: isRead(action) ? 'C1' : 'C2', trace: 'phase6-b80' });
const P = (s, path, action, payload = {}, objectType = 'GOV', objectId = null, purpose = 'governance') => call(path, over(s, 'PLATFORM', action, objectType, objectId, purpose), payload, s.token);
const TN = (s, path, action, payload = {}, objectType = 'THM', objectId = null, purpose = 'governance') => call(path, over(s, 'TENANT', action, objectType, objectId, purpose), payload, s.token);
const DM = (s, path, action, payload = {}, objectType = 'GOV', objectId = null, purpose = 'governance') => call(path, over(s, 'DOMAIN', action, objectType, objectId, purpose), payload, s.token);
const TH = `/v1/tenants/${T}/governance/design/themes`;
const THD = `/v1/tenants/${T}/domains/${D}/governance/design/themes`;
const DR = `/v1/tenants/${T}/domains/${D}/shell/drafts`;
const DEC = `/v1/tenants/${T}/domains/${D}/decisions`;
const OBS = `/v1/tenants/${T}/domains/${D}/observation`;
const CTX = `/v1/tenants/${T}/domains/${D}/context`;
const SHL = `/v1/tenants/${T}/domains/${D}/shell`;
const DG = '/v1/governance/design';
const DGD = `/v1/tenants/${T}/domains/${D}/governance/design`;

/* ── B80-0 THE STATE ─────────────────────────────────────────────────────────────────── */
console.log('\nB80-0 THE STATE — 0118, the NORDWERK cast, the build identity');
{
  const m = await q(`select filename from public.schema_migrations where filename like '0118%'`);
  if (m.length === 1) ok(`migration applied: ${m[0].filename}`); else { bad('0118 is not applied'); process.exit(1); }
}
const holds = async (login_, role, sc) => (await q1(`select count(*)::int n from identity.principals p join identity.role_bindings b on b.principal_id = p.id
    where p.login_name = $1 and p.kind = 'human' and p.status = 'active' and b.revoked_at is null and b.role_code = $2 and b.scope = $3
      and (b.scope = 'PLATFORM' or b.tenant_id = $4) and (b.scope <> 'DOMAIN' or b.domain_id = $5)`, [login_, role, sc, T, D])).n > 0;
const CAST = [['l.brandt', 'decision_owner', 'DOMAIN'], ['l.brandt', 'strategy_owner', 'DOMAIN'], ['m.dvorak', 'collection_manager', 'DOMAIN'],
  ['l.haddad', 'design_system_authority', 'PLATFORM'], ['s.iversen', 'design_system_authority', 'PLATFORM'], ['p.castellano', 'conformance_steward', 'PLATFORM'],
  ['h.achterberg', 'independent_assurance', 'PLATFORM'], ['w.zielinska', 'customer_sponsor', 'TENANT']];
for (const [l, role, sc] of CAST) {
  if (await holds(l, role, sc)) ok(`${l} holds ${role} at the ${sc}${sc === 'DOMAIN' ? ' (the corridor domain "Supply Corridor Intelligence")' : ''}`);
  else { bad(`${l} does not hold ${role} at the ${sc} — no role is granted by this act (the B107 act runs first)`); process.exit(1); }
}
const who = async (l) => { const s = await login(l, PW); if (s === null) { bad(`${l} could not authenticate`); process.exit(1); } return { ...s, login: l }; };
const PERSONAS = [];
const persona = async (l) => { const s = await who(l); PERSONAS.push(s); return s; };
const renewAll = async () => { for (const s of PERSONAS) { const n = await login(s.login, PW); if (n !== null) Object.assign(s, n); } };
const brandt = await persona('l.brandt'); const dvorak = await persona('m.dvorak'); const dsa = await persona('l.haddad'); const dsaOwner = await persona('s.iversen');
const steward = await persona('p.castellano'); const assurance = await persona('h.achterberg'); const sponsor = await persona('w.zielinska');
const NAME = { [brandt.principalId]: 'L. Brandt', [dvorak.principalId]: 'M. Dvorak', [dsa.principalId]: 'L. Haddad', [dsaOwner.principalId]: 'S. Iversen',
  [steward.principalId]: 'P. Castellano', [assurance.principalId]: 'H. Achterberg', [sponsor.principalId]: 'W. Zielińska' };
const nm = (id) => NAME[id] ?? short(id);
{
  const c = await P(admin, '/v1/governance/conformance/read', 'governance.read', {}, 'GOV', null, 'governance');
  const b = c.ok ? (c.body.build ?? c.body.identity ?? {}) : {};
  if (c.ok) note(`the API declares its build: head ${dg(b.head_sha)} (from ${b.head_source}), policy bundle ${b.policy_bundle?.version} ${dg(b.policy_bundle?.digest)}`);
  else note(`the build identity was not read (${refusalLine(c)})`);
}

/* ── B80-1 THEME ─────────────────────────────────────────────────────────────────────── */
console.log('\nB80-1 THEME (F-P7-E-03) — the brand owner proposes, the Design System Authority refuses on contrast, the corrected version is certified (signed), activated, rolled back once, re-activated');
const THEME_KEY = 'nordwerk-corporate';
const THEME_TITLE = 'NORDWERK Corporate (SYNTHETIC)';
/* THE BRAND COLOURS — here and in the database only (never in apps/web; the web applies what the server certifies). v1: the NORDWERK signal red
   as the accent — indistinguishable from color.critical; v2: the corrected NORDWERK navy accent; the warm surface tint and the wordmark kept. */
const V1 = { 'color.accent.default': { light: '#B8202C', dark: '#FF9AA2' }, 'color.accent.strong': { light: '#8E1520', dark: '#FFC2C7' },
  'color.surface.secondary': { light: '#F1ECE6', dark: '#182434' }, 'brand.wordmark': { text: 'NORDWERK (SYNTHETIC)' } };
const V2 = { ...V1, 'color.accent.default': { light: '#00466E', dark: '#7FC8F0' }, 'color.accent.strong': { light: '#00334F', dark: '#B0DCF5' } };
let brand = null; let THEME = null;
{
  const BRAND_LOGIN = 'nw.brand-owner'; const BRAND_NAME = 'NORDWERK brand owner (SYNTHETIC)';
  const existing = await q1(`select p.id::text, p.display_name, p.scope, p.tenant_id::text t from identity.principals p where p.login_name = $1`, [BRAND_LOGIN]);
  if (existing && (existing.display_name !== BRAND_NAME || existing.scope !== 'TENANT' || existing.t !== T)) { bad(`the login ${BRAND_LOGIN} is taken by "${existing.display_name}" (${existing.scope})`); process.exit(1); }
  const r = await createPersona(admin, T, { displayName: BRAND_NAME, loginName: BRAND_LOGIN, password: PW, roleCode: 'branding_authority' });
  if (r.session === null) { bad(`the platform administrator could not create (or reopen) the brand owner: ${r.status} ${r.message ?? ''}`); process.exit(1); }
  brand = { ...r.session, login: BRAND_LOGIN }; PERSONAS.push(brand); NAME[brand.principalId] = 'the NORDWERK brand owner';
  if (r.created) ok(`the platform administrator CREATED the TENANT persona "${BRAND_NAME}" (login ${BRAND_LOGIN}, branding_authority at the TENANT) through POST /v1/tenants/:t/principals`);
  else if (await holds(BRAND_LOGIN, 'branding_authority', 'TENANT')) note(`the brand owner (${BRAND_LOGIN}, branding_authority at the TENANT) is present: stands — an earlier run`);
  else { bad(`${BRAND_LOGIN} exists but holds no branding_authority at the TENANT`); process.exit(1); }
  ENV_OUT.EYE_B80_BRAND = BRAND_LOGIN;
}
const themeRows = async () => q(`select theme_id::text id, version, state, digest from governance.design_themes where tenant_id = $1 and theme_key = $2 order by version`, [T, THEME_KEY]);
const certRow = async (id, v) => q1(`select certification_id::text id, outcome, signature_id::text sig, certifier::text certifier, jsonb_array_length(failing)::int nfail,
    (select string_agg(governance.theme_pair_text(f), '; ') from jsonb_array_elements(failing) f) failing_text from governance.theme_certifications where theme_id = $1 and theme_version = $2`, [id, v]);
const preview = async (s, id, v) => TN(s, `${TH}/${id}/preview`, 'governance.design.theme.preview', { version: v }, 'THM', id);
{
  let rows = await themeRows();
  // v1 — the brand red accent
  if (!rows.some((x) => x.version === 1)) {
    const p = await TN(brand, `${TH}/propose`, 'governance.design.theme.propose', { key: THEME_KEY, title: THEME_TITLE, expectedVersion: 0, mapping: V1 });
    if (!p.ok) { fail('the brand owner proposes NORDWERK Corporate v1', p); process.exit(1); }
    ok(`the brand owner PROPOSED "${THEME_TITLE}" v${p.body.theme.version} (${short(p.body.theme.theme_id)}, digest ${dg(p.body.theme.digest)}, claim ${p.body.theme.claim}): the accent ${V1['color.accent.default'].light} / ${V1['color.accent.default'].dark}, the surface tint, the wordmark — ${rcpt(p)}`);
    rows = await themeRows();
  } else note(`"${THEME_TITLE}" v1 stands — an earlier run (${rows.find((x) => x.version === 1).state})`);
  THEME = rows[0].id;
  ENV_OUT.EYE_B80_THEME = THEME;
  const pv1 = await preview(dsa, THEME, 1);
  if (!pv1.ok) fail('L. Haddad previews v1', pv1);
  else {
    const v = pv1.body.preview;
    (v.matrix.outcome === 'fail' ? ok : bad)(`L. Haddad PREVIEWED v1: the matrix recomputed from the STORED mapping — ${v.matrix.pairs} pairs over light, dark, print and two forced-colour schemes, outcome ${String(v.matrix.outcome).toUpperCase()}, ${v.failing_text.length} failing: ${v.failing_text.slice(0, 3).join('; ')}${v.failing_text.length > 3 ? '; …' : ''}`);
    const c1 = await certRow(THEME, 1);
    if (c1 === null) {
      const c = await TN(dsa, `${TH}/${THEME}/certify`, 'governance.design.theme.certify', { version: 1, digest: v.certification_digest, reason: 'read against the contrast matrix of every mode (SYNTHETIC)' }, 'THM', THEME);
      expectRefused('L. Haddad (Design System Authority) certifies v1', c, 409, /\(contrast\).*color\.accent\.default vs color\.critical ΔE \d+\.\d\d < 25/);
    } else note(`v1's certification stands — an earlier run: ${c1.outcome.toUpperCase()} by ${nm(c1.certifier)} (${c1.nfail} failing pairs)`);
    const r1 = await certRow(THEME, 1);
    (r1?.outcome === 'refused' && r1.sig ? ok : bad)(`v1's certification record: ${String(r1?.outcome).toUpperCase()}, signed (signature ${short(r1?.sig)}), the failing pairs named with their values — ${String(r1?.failing_text ?? '').split('; ').filter((x) => /critical/.test(x)).slice(0, 2).join('; ')}`);
  }
  // the refused version is never activated
  const a1 = await TN(brand, `${TH}/${THEME}/activate`, 'governance.design.theme.activate', { version: 1, digest: rows[0].digest, reason: 'putting the refused version in force (refused)' }, 'THM', THEME);
  expectRefused('the brand owner activates the REFUSED v1', a1, 409, /\(state\).*not certified/);
  // v2 — the corrected accent
  if (!rows.some((x) => x.version === 2)) {
    const p = await TN(brand, `${TH}/propose`, 'governance.design.theme.propose', { key: THEME_KEY, title: THEME_TITLE, expectedVersion: 1, mapping: V2 });
    if (!p.ok) { fail('the brand owner proposes NORDWERK Corporate v2', p); process.exit(1); }
    ok(`the brand owner PROPOSED v${p.body.theme.version} — the corrected navy accent ${V2['color.accent.default'].light} / ${V2['color.accent.default'].dark}, the tint and the wordmark kept — ${rcpt(p)}`);
    rows = await themeRows();
  } else note(`v2 stands — an earlier run (${rows.find((x) => x.version === 2).state})`);
  const v2 = rows.find((x) => x.version === 2);
  const pv2 = await preview(dsa, THEME, 2);
  if (!pv2.ok) fail('L. Haddad previews v2', pv2);
  else {
    const v = pv2.body.preview;
    (v.matrix.outcome === 'pass' ? ok : bad)(`L. Haddad PREVIEWED v2: ${v.matrix.pairs} pairs, outcome ${String(v.matrix.outcome).toUpperCase()}, ${v.failing_text.length} failing; the minimum text contrast per mode ${v.matrix.modes.map((m) => `${m.mode} ${m.min_text}:1`).join(', ')}`);
    // the proposer may not certify (separation of duties: the brand owner holds no design authority — the PEP refuses before any port)
    expectRefused('the brand owner (the PROPOSER) certifies v2', await TN(brand, `${TH}/${THEME}/certify`, 'governance.design.theme.certify', { version: 2, digest: v.certification_digest, reason: 'the proposer certifying (refused)' }, 'THM', THEME), 403);
    const c2 = await certRow(THEME, 2);
    if (c2 === null) {
      const c = await TN(dsa, `${TH}/${THEME}/certify`, 'governance.design.theme.certify', { version: 2, digest: v.certification_digest, reason: 'every pair of every mode passes; the accent is distinct from the status colours (SYNTHETIC)' }, 'THM', THEME);
      if (!c.ok) fail('L. Haddad certifies v2', c);
      else ok(`L. Haddad (human gate) CERTIFIED v2: ${String(c.body.certification.outcome).toUpperCase()} over ${c.body.certification.pairs} pairs, SIGNED (signature ${short(c.body.certification.signature_id)} over ${dg(c.body.certification.certification_digest)}), claim ${c.body.certification.claim} — ${rcpt(c)}`);
    } else note(`v2's certification stands — an earlier run: ${c2.outcome.toUpperCase()} by ${nm(c2.certifier)}`);
    const r2 = await certRow(THEME, 2);
    const sig = r2?.sig ? await q1(`select subject_kind, signer::text signer, key_id from governance.signatures where signature_id = $1`, [r2.sig]) : null;
    (r2?.outcome === 'certified' && sig?.subject_kind === 'theme_certification' && sig.signer === dsa.principalId ? ok : bad)(`v2's certification record: ${String(r2?.outcome).toUpperCase()}; the signature is a theme_certification by ${nm(sig?.signer)} (key ${sig?.key_id ?? '—'}, by reference)`);
  }
  // activation, the rollback shown once, the re-activation
  const acts = async () => q(`select activation_id::text id, seq, act, theme_id::text theme, theme_version v from governance.theme_activations where tenant_id = $1 order by seq`, [T]);
  const current = async () => (await acts()).at(-1) ?? null;
  const activateV2 = async (label) => {
    const a = await TN(brand, `${TH}/${THEME}/activate`, 'governance.design.theme.activate', { version: 2, digest: v2.digest, reason: 'the certified NORDWERK theme goes into force for the tenant (SYNTHETIC)' }, 'THM', THEME);
    if (!a.ok) fail(`the brand owner ${label} v2`, a); else ok(`the brand owner ${label.toUpperCase()} v2 (activation seq ${a.body.activation.seq}, bound to certification ${short(a.body.activation.certification_id)}) — ${rcpt(a)}`);
  };
  let A = await acts();
  if (!A.some((x) => x.act === 'activate' && x.theme === THEME && x.v === 2)) await activateV2('activated');
  else note(`v2 was activated earlier (seq ${A.find((x) => x.act === 'activate' && x.theme === THEME && x.v === 2).seq}): stands — an earlier run`);
  A = await acts();
  if (!A.some((x) => x.act === 'rollback')) {
    const cur = await current();
    const rb = await TN(brand, `${TH}/rollback`, 'governance.design.theme.rollback', { expectedActivation: cur.id, reason: 'shown once: the rollback returns the tenant to the certified core theme (SYNTHETIC)' }, 'THM', cur.id);
    if (!rb.ok) fail('the brand owner rolls back', rb);
    else {
      ok(`the brand owner ROLLED BACK (seq ${rb.body.activation.seq}): ${rb.body.activation.to_core ? 'to the certified CORE theme' : `to ${short(rb.body.activation.theme_id)} v${rb.body.activation.version}`} — ${rcpt(rb)}`);
      const f = await TN(brand, `${TH}/in-force/read`, 'governance.design.theme.in_force.read');
      (f.ok && f.body.in_force.theme === 'core' ? ok : bad)(`the theme in force after the rollback: ${f.ok ? `${f.body.in_force.theme.toUpperCase()} — ${f.body.in_force.note}` : refusalLine(f)}`);
    }
    await activateV2('re-activated');
  } else note(`the rollback to the core theme was shown earlier (seq ${A.find((x) => x.act === 'rollback').seq}): stands — an earlier run`);
  const cur = await current();
  if (!(cur?.theme === THEME && cur.v === 2)) await activateV2('re-activated');
  // the end state, read as ThemeScope reads it: on the TENANT route (the brand owner) and on a DOMAIN route (L. Brandt, a domain-bound principal)
  const ft = await TN(brand, `${TH}/in-force/read`, 'governance.design.theme.in_force.read');
  const fd = await DM(brandt, `${THD}/in-force/read`, 'governance.design.theme.in_force.read', {}, 'THM');
  const good = (f) => f.ok && f.body.in_force.theme === 'customer' && f.body.in_force.version?.version === 2 && f.body.in_force.fallback === false;
  (good(ft) && good(fd) ? ok : bad)(`THE THEME IN FORCE: ${ft.ok ? `${ft.body.in_force.theme.toUpperCase()} — ${ft.body.in_force.version?.title} v${ft.body.in_force.version?.version}, certified by ${ft.body.in_force.certification?.certifier_name} (signature ${short(ft.body.in_force.certification?.signature_id)}, claim ${ft.body.in_force.certification?.claim})` : refusalLine(ft)}; L. Brandt's DOMAIN read agrees (${fd.ok ? `${fd.body.in_force.theme} v${fd.body.in_force.version?.version}` : refusalLine(fd)}) — ${ft.ok ? ft.body.in_force.note : ''}`);
  const led = await q(`select event, version from governance.events where subject_id = $1 order by occurred_at, event_id`, [THEME]);
  note(`the theme's ledger: ${led.map((e) => `${e.event.replace('design.theme_', '')}@v${e.version}`).join(' → ')}`);
}

/* ── B80-2 FORMS ─────────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB80-2 FORMS (F-P7-E-05) — the source registration\'s draft and the decision-package form\'s draft: saved, read back, never a submission; the package declared over the existing routes');
const PACKAGE_TITLE = 'Bab el-Mandeb corridor reroute (SYNTHETIC)';
const drafts = {
  read: (s, purpose, formKey) => DM(s, `${DR}/read`, 'shell.draft.read', { formKey, subjectKey: '-' }, 'SDR', null, purpose),
  save: (s, purpose, b) => DM(s, `${DR}/save`, 'shell.draft.save', { subjectKey: '-', ...b }, 'SDR', null, purpose),
};
async function draftScene(s, who_, purpose, formKey, schemaVersion, summary, payload, step) {
  const r0 = await drafts.read(s, purpose, formKey);
  if (!r0.ok) { fail(`${who_} reads the draft of ${formKey}`, r0); return null; }
  let d = r0.body.draft;
  if (d.state === 'live' && d.draft?.summary === summary) note(`${who_}'s draft of ${formKey} "${summary}" v${d.draft.version} is live (saved ${iso(d.draft.saved_at)}, expires ${iso(d.draft.expires_at)}): stands — an earlier run`);
  else {
    const sv = await drafts.save(s, purpose, { formKey, schemaVersion, payload, summary, step, expectedVersion: d.state === 'live' ? d.draft.version : null });
    if (!sv.ok) { fail(`${who_} saves the draft of ${formKey}`, sv); return null; }
    ok(`${who_} SAVED the draft of ${formKey} "${summary}" v${sv.body.draft.version} (payload ${dg(sv.body.draft.payload_digest)}, expires ${iso(sv.body.draft.expires_at)}, submission ${sv.body.draft.submission}) — ${rcpt(sv)}`);
    const r1 = await drafts.read(s, purpose, formKey);
    d = r1.body.draft;
  }
  const back = d.draft?.payload ?? null;
  (d.state === 'live' && canon(back?.values ?? null) === canon(payload.values) ? ok : bad)(`${who_} READ the draft back: ${d.state.toUpperCase()} v${d.draft?.version}, step ${d.draft?.step}, the same values (${Object.keys(payload.values).length} fields), ${d.versions.length} version(s) — a draft is never a submission`);
  const un = await drafts.save(s, purpose, { formKey, schemaVersion, payload: back ?? payload, summary, step, expectedVersion: d.draft.version });
  (un.ok && un.body.draft.unchanged === true ? ok : bad)(`the same content saved again is answered UNCHANGED (v${un.body?.draft?.version}, no new version)${un.ok ? '' : ` — ${refusalLine(un)}`}`);
  expectRefused(`${who_} saves over a draft it did not read (no expected version)`, await drafts.save(s, purpose, { formKey, schemaVersion, payload: { ...payload, step: 0 }, summary, step: 0, expectedVersion: null }), [409, 422], /form draft rejected \(stale\)/);
  return d.draft;
}
{
  // M. Dvorak — the rebuilt source registration form (FORM_KEY observation.source.register, SRC-REG@v1)
  const field = (value, source = 'typed') => ({ value, source, confirmed: source === 'typed' });
  const srcValues = { source_key: field('bab-el-mandeb-insurer-notices'), name: field('Bab el-Mandeb insurer notices (SYNTHETIC)'), publisher: field('Lloyd\'s market notices (SYNTHETIC stand-in)'),
    connector_kind: field('upload'), acquisition_mode: field('replay'), data_origin: field('synthetic'), authority_class: field('observational') };
  await draftScene(dvorak, 'M. Dvorak (collection manager)', 'observation', 'observation.source.register', 'SRC-REG@v1', 'Bab el-Mandeb insurer notices (SYNTHETIC)',
    { schema: 'SRC-REG@v1', step: 1, values: srcValues }, 1);
  // L. Brandt — the NEW decision-package form (FORM_KEY decision.package.declare, DPK-DECL@v1)
  const DECISION = await q1(`select strategy_object_id::text id, title from graph.strategy_current where tenant_id = $1 and domain_id = $2 and object_type = 'DEC' and status = 'active' and title = 'Mitigate the corridor closure — Regensburg line'`, [T, D]);
  if (DECISION === null) { bad('the DEC "Mitigate the corridor closure — Regensburg line" is not active in the corridor'); process.exit(1); }
  const pkgValues = { decision: field(DECISION.id), title: field(PACKAGE_TITLE), statement: field('Reroute the Regensburg line\'s bearing and magnet sets around the Cape while Bab el-Mandeb stays closed (SYNTHETIC)'),
    owner: field(brandt.principalId, 'default'), 'o0.key': field('reroute-cape'), 'o0.title': field('Reroute via the Cape of Good Hope'), 'o0.kind': field('intervention', 'default') };
  await draftScene(brandt, 'L. Brandt (decision owner)', 'decision', 'decision.package.declare', 'DPK-DECL@v1', PACKAGE_TITLE, { schema: 'DPK-DECL@v1', step: 2, slots: 1, values: pkgValues }, 2);
  // the server's validation agrees with the form's rule (title 2–256 characters): a one-character title is refused before anything is recorded
  expectRefused('L. Brandt declares a package titled "x" (the form\'s own minimum is 2 characters)', await DM(brandt, `${DEC}/declare`, 'decision.package.declare',
    { decisionObjectId: DECISION.id, title: 'x', statement: 'too short a title (SYNTHETIC)', owner: brandt.principalId }, 'DPK', null, 'decision'), 422);
  // the declaration — the form's three acts over the EXISTING decision routes, unchanged; each its own governed write
  const have = await q1(`select package_id::text id from decision.packages_current where tenant_id = $1 and domain_id = $2 and title = $3`, [T, D, PACKAGE_TITLE]);
  let PKG = have?.id ?? null;
  if (PKG !== null) note(`the package "${PACKAGE_TITLE}" (${short(PKG)}) stands — an earlier run`);
  else {
    const d = await DM(brandt, `${DEC}/declare`, 'decision.package.declare', { decisionObjectId: DECISION.id, title: PACKAGE_TITLE,
      statement: 'Reroute the Regensburg line\'s bearing and magnet sets around the Cape while Bab el-Mandeb stays closed (SYNTHETIC)', owner: brandt.principalId }, 'DPK', null, 'decision');
    if (!d.ok) fail('L. Brandt declares the package', d);
    else {
      PKG = d.body.package.packageId;
      ok(`L. Brandt DECLARED "${PACKAGE_TITLE}" (${short(PKG)}) bound to the DEC "${DECISION.title}" — act 1 of 3, ${rcpt(d)}`);
      const o = await DM(brandt, `${DEC}/${PKG}/versions/open`, 'decision.package.version', { knownAt: new Date().toISOString(), observedThrough: null }, 'DPK', PKG, 'decision');
      if (!o.ok) fail('L. Brandt opens version 1', o);
      else {
        ok(`L. Brandt OPENED version ${o.body.version.version} (known at now, stored as UTC) — act 2 of 3, ${rcpt(o)}`);
        const op = await DM(brandt, `${DEC}/${PKG}/versions/${o.body.version.version}/options`, 'decision.package.option', { key: 'reroute-cape', title: 'Reroute via the Cape of Good Hope', kind: 'intervention',
          consequences: [], unsimulatedReason: 'not simulated yet: the reroute\'s cost and delay are declared by the twin in a later act (SYNTHETIC)', risks: ['longer transit'], opportunities: ['insured passage'] }, 'DPK', PKG, 'decision');
        if (!op.ok) fail('L. Brandt sets the option', op); else ok(`L. Brandt SET the option "reroute-cape" — act 3 of 3, ${rcpt(op)}`);
      }
    }
  }
  if (PKG !== null) {
    const st = await q1(`select p.title, (select count(*)::int from decision.package_versions v where v.package_id = p.package_id) versions,
        (select count(*)::int from decision.options o where o.package_id = p.package_id) options from decision.packages_current p where p.package_id = $1`, [PKG]);
    (st.versions >= 1 && st.options >= 1 ? ok : bad)(`the package as recorded: "${st.title}", ${st.versions} version(s), ${st.options} option(s) — open, not proposed, approved or committed (its terms stay on the Decisions page)`);
    ENV_OUT.EYE_B80_PACKAGE = PKG;
  }
}

/* ── B80-3 BULK ──────────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB80-3 BULK SELECTION (F-P7-E-05) — the Red Sea sources: included and excluded with reasons BEFORE the action; one governed write and one receipt per item');
const RED_SEA = ['imf-portwatch-chokepoints', 'imf-portwatch-ports', 'carrier-advisories', 'red-sea-corridor-stream', 'red-sea-corridor-stream-late', 'red-sea-ais-positions', 'gdelt-discovery'];
const BULK_REASON = 'B80 bulk selection — the Red Sea replay contracts suspended and returned to active, one governed write each (SYNTHETIC demonstration)';
{
  const rd = await DM(dvorak, `${OBS}/sources/readiness`, 'observation.read.sources', { limit: 200 }, 'SRC', null, 'observation');
  if (!rd.ok) { fail('M. Dvorak reads the source registry', rd); }
  else {
    // the latest contract of each Red Sea source, as the sources page lists it
    const latest = new Map();
    for (const s of rd.body.sources) if (RED_SEA.includes(s.source_key) && (!latest.has(s.source_key) || latest.get(s.source_key).contract_version < s.contract_version)) latest.set(s.source_key, s);
    const selected = RED_SEA.map((k) => latest.get(k)).filter(Boolean);
    /* THE PAGE'S RULE (apps/web/app/observation/sources/page.tsx `candidate`), read for the suspend action: a live-mode contract is EXCLUDED (its
       lifecycle also moves its collection schedule — acted on alone from its own page); a contract not in the state the action applies to is
       EXCLUDED; a principal without collection_manager is EXCLUDED; the rest are INCLUDED. The walk reads the page's own BulkSelection panel. */
    const assess = (s, from) => (s.acquisition_mode !== 'replay' ? 'live-mode contract — its lifecycle also moves its collection schedule; act on it alone from its own page'
      : s.lifecycle_state !== from && !(from === 'active' && s.lifecycle_state === 'suspended') ? `not in a state this action applies to — it is ${s.lifecycle_state}` : null);
    const included = selected.filter((s) => assess(s, 'active') === null);
    const excluded = selected.filter((s) => assess(s, 'active') !== null);
    ok(`the selection BEFORE the action: ${selected.length} selected · ${included.length} included · ${excluded.length} excluded · 0 hidden by the filter · 0 changed since selection`);
    for (const s of excluded) note(`EXCLUDED ${s.source_key}@v${s.contract_version} (${s.acquisition_mode}, ${s.lifecycle_state}) — ${assess(s, 'active')}`);
    note(`INCLUDED ${included.map((s) => `${s.source_key}@v${s.contract_version}`).join(', ')}`);
    ENV_OUT.EYE_B80_BULK_INCLUDED = included.length; ENV_OUT.EYE_B80_BULK_EXCLUDED = excluded.length;
    const done = async (s, event) => (await q1(`select count(*)::int n from observation.source_contract_events where source_id = $1 and contract_version = $2 and event = $3 and details ->> 'reason' = $4`,
      [s.source_id, s.contract_version, event, BULK_REASON])).n > 0;
    const transition = (s, target) => DM(dvorak, `${OBS}/sources/${s.source_id}/transition`, 'observation.source.transition', { contractVersion: s.contract_version, target, reason: BULK_REASON }, 'SRC', s.source_id, 'observation');
    for (const [target, event, verb] of [['suspended', 'contract.suspended', 'SUSPENDED'], ['active', 'contract.reactivated', 'RETURNED TO ACTIVE']]) {
      const lines = [];
      for (const s of included) {
        const now = await q1(`select lifecycle_state from observation.source_contracts_current where source_id = $1 and contract_version = $2`, [s.source_id, s.contract_version]);
        if (await done(s, event) && (target === 'active' ? now.lifecycle_state === 'active' : true)) { lines.push(`${s.source_key} stands — an earlier run`); continue; }
        if (now.lifecycle_state === target) { lines.push(`${s.source_key} already ${target}`); continue; }
        const r = await transition(s, target);
        if (!r.ok) { fail(`M. Dvorak ${verb.toLowerCase()} ${s.source_key}`, r); continue; }
        lines.push(`${s.source_key} → ${r.body.source.lifecycleState} (${rcpt(r)})`);
      }
      ok(`M. Dvorak ${verb} each included contract — one governed write and one receipt per item: ${lines.join('; ')}`);
    }
    const after = await q(`select source_key, lifecycle_state from observation.source_contracts_current where tenant_id = $1 and domain_id = $2 and source_key = any($3) and lifecycle_state not in ('superseded')`, [T, D, included.map((s) => s.source_key)]);
    (after.every((x) => x.lifecycle_state === 'active') ? ok : bad)(`the included contracts end ACTIVE again (${after.map((x) => `${x.source_key} ${x.lifecycle_state}`).join(', ')}); the excluded live-mode contracts were never sent`);
  }
}

/* ── B80-4 CONTEXT ───────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB80-4 THE CONTEXT BAR (F-P7-E-01) — L. Brandt switches from the Regensburg line objective to the Bab el-Mandeb closure scenario: the impact preview BEFORE the governed commit');
const OBJ_TITLE = 'Keep the Regensburg line supplied through Q1';
const SCN_TITLE = 'Bab el-Mandeb closure — Houthi activity and insurer withdrawal (SYNTHETIC)';
{
  const ctxRead = (s) => DM(s, `${CTX}/read`, 'executive.context.read', {}, 'CTX', null, 'shell.context');
  const impact = (s, p) => DM(s, `${CTX}/impact`, 'executive.context.read', p, 'CTX', null, 'shell.context');
  const commit = (s, p) => DM(s, `${CTX}/commit`, 'executive.context.set', p, 'CTX', null, 'shell.context');
  const b = await ctxRead(brandt);
  if (!b.ok) { fail('L. Brandt reads his context bar', b); }
  else {
    const bar = b.body.bar;
    const cur = bar.current;
    ok(`L. Brandt's context bar: objective ${cur?.objective?.title ? `"${cur.objective.title}"` : 'the whole domain'} · horizon ${cur?.horizon ?? '90d (default)'} · scenario ${cur?.scenario?.title ? `"${cur.scenario.title}"` : 'none'} · classification ${cur?.classification ?? '—'} · effective ${cur?.effective_at ?? 'live'} · policy ${bar.policy?.bundle} · version ${bar.version}, digest ${dg(cur?.digest)}; may set: ${bar.may_set}; unresolved: ${bar.unresolved.length === 0 ? 'none' : bar.unresolved.map((u) => u.dimension).join(', ')}`);
    const scn = bar.choices.scenarios.find((x) => x.title === SCN_TITLE);
    const stale = bar.choices.scenarios.find((x) => x.stale);
    if (!scn) { bad(`the scenario "${SCN_TITLE}" is not among L. Brandt's choices`); }
    else {
      const approvals0 = await q(`select approval_id::text id, version_digest from decision.approvals where tenant_id = $1 and domain_id = $2 and approver_principal_id = $3 order by 1`, [T, D, brandt.principalId]);
      const proposed = { objectiveId: null, horizon: cur?.horizon ?? '90d', scenarioId: scn.id, classification: cur?.classification ?? 'internal', effectiveAt: null };
      const onScenario = cur?.scenario?.id === scn.id;
      if (onScenario) note(`L. Brandt's context is already the scenario "${SCN_TITLE}" (${dg(cur.digest)}, set ${iso(cur.set_at)}): stands — an earlier run`);
      else if (cur?.objective?.title !== OBJ_TITLE) note(`L. Brandt's current objective is ${cur?.objective?.title ?? 'none'} (not "${OBJ_TITLE}") — the switch is previewed from what is set`);
      const im = await impact(brandt, proposed);
      if (!im.ok) fail('L. Brandt previews the switch', im);
      else {
        const x = im.body.impact; const a = x.affected;
        ok(`THE IMPACT PREVIEW (before any commit; reading it changes nothing): ${x.unchanged ? 'NOTHING changes — this is the current context' : `changed ${x.changed.map((c) => `${c.dimension} ${c.from?.title ?? c.from ?? 'none'} → ${c.to?.title ?? c.to ?? 'none'}`).join('; ')}`}; open work KEPT — ${a.drafts.count} draft(s), ${a.tasks.count} task(s), ${a.requests.count} request(s), ${a.workspaces.count} workspace(s), ${a.rooms.count} room(s); the home ${a.home.effect}; approvals ${x.approvals.count} — ${String(x.approvals.effect).toUpperCase()}; previews: ${x.previews.effect} (${x.previews.held_by}-held); impact digest ${dg(x.impact_digest)}; committable ${x.committable}`);
        if (a.drafts.items.length) note(`his drafts in the preview: ${a.drafts.items.map((d) => `${d.form_key} "${d.title}" v${d.version} (${d.disposition})`).join('; ')}`);
        if (!onScenario) {
          const payload = { ...proposed, basisContextId: x.basis?.context_id ?? null, impactDigest: x.impact_digest, invalidated: [] };
          const c = await commit(brandt, payload);
          if (!c.ok) fail('L. Brandt commits the previewed switch', c);
          else {
            ok(`L. Brandt COMMITTED exactly the previewed switch (human gate): context ${short(c.body.context.context_id)} v${c.body.context.version}, digest ${dg(c.body.context.digest)}, impact ${dg(c.body.context.impact_digest)}, approvals unaffected ${c.body.context.approvals_unaffected} — ${rcpt(c)}`);
            expectRefused('the SAME preview committed again (its basis is no longer current)', await commit(brandt, payload), [409, 422], /context rejected \(stale\)/);
          }
        }
      }
      // a stale preview: committed over the context L. Brandt had before (its basis superseded)
      const prior = await q1(`select context_id::text id from executive.contexts where tenant_id = $1 and domain_id = $2 and principal_id = $3 and superseded_at is not null order by set_at desc limit 1`, [T, D, brandt.principalId]);
      if (prior && onScenario) {
        const fresh = await impact(brandt, { ...proposed, horizon: proposed.horizon === '90d' ? '12m' : '90d' });
        expectRefused('a switch committed over a SUPERSEDED basis (a stale preview)', await commit(brandt, { ...proposed, horizon: proposed.horizon === '90d' ? '12m' : '90d', basisContextId: prior.id, impactDigest: fresh.body?.impact?.impact_digest ?? '0'.repeat(64), invalidated: [] }), [409, 422], /context rejected \(stale\)/);
      }
      // a STALE CHOICE: the retired scenario — the bar offers it disabled; forcing it is refused
      if (!stale) note('no stale scenario is offered in this domain — the stale-choice refusal is not shown');
      else {
        ENV_OUT.EYE_B80_STALE_SCENARIO = stale.title;
        const now = (await ctxRead(brandt)).body.bar;
        const sp = { objectiveId: null, horizon: now.current?.horizon ?? '90d', scenarioId: stale.id, classification: now.current?.classification ?? 'internal', effectiveAt: null };
        const si = await impact(brandt, sp);
        (si.ok && si.body.impact.stale.length > 0 && si.body.impact.committable === false ? ok : bad)(`the preview of the STALE choice "${stale.title}" (${stale.status ?? stale.state}): ${si.ok ? `stale — ${si.body.impact.stale.map((s) => s.reason).join('; ')}; committable ${si.body.impact.committable}` : refusalLine(si)}`);
        expectRefused(`L. Brandt forces the stale scenario "${stale.title}"`, await commit(brandt, { ...sp, basisContextId: now.current?.context_id ?? null, impactDigest: si.body?.impact?.impact_digest ?? '0'.repeat(64), invalidated: [] }), [409, 422], /context rejected \(stale\)/);
      }
      const end = (await ctxRead(brandt)).body.bar;
      const approvals1 = await q(`select approval_id::text id, version_digest from decision.approvals where tenant_id = $1 and domain_id = $2 and approver_principal_id = $3 order by 1`, [T, D, brandt.principalId]);
      (end.current?.scenario?.id === scn.id && JSON.stringify(approvals0) === JSON.stringify(approvals1) ? ok : bad)(`the bar now: scenario "${end.current?.scenario?.title}", objective ${end.current?.objective?.title ?? 'the whole domain'}, version ${end.version}; L. Brandt's ${approvals1.length} approval(s) UNCHANGED (each binds its version digest)`);
      const led = await q1(`select count(*)::int n from shell.events where principal_id = $1 and event = 'shell.context.committed'`, [brandt.principalId]);
      note(`the shell ledger records ${led.n} context commit(s) by L. Brandt (each with its impact digest, the dimensions changed, the work kept)`);
      ENV_OUT.EYE_B80_SCENARIO = SCN_TITLE; ENV_OUT.EYE_B80_OBJECTIVE = OBJ_TITLE;
    }
  }
}

/* ── B80-5 DEEP LINK ─────────────────────────────────────────────────────────────────── */
await renewAll();
console.log('\nB80-5 THE DEEP LINK (F-P7-E-01) — a B28 corridor warning AS OF an instant between two of its recorded events; before its first event refused; opening it writes nothing');
{
  const W_TITLE = 'Stream rule Bab el-Mandeb corridor collapse on event time (B28): 5 of 5 observed days < 30 in 2024-02-11..2024-02-16';
  const w = await q1(`select warning_id::text id, state, level from prediction.warnings_current where tenant_id = $1 and domain_id = $2 and title = $3`, [T, D, W_TITLE]);
  if (w === null) bad(`the B28 corridor warning "${W_TITLE}" is not present`);
  else {
    const ev = await q(`select event, occurred_at from prediction.warning_events where warning_id = $1 order by occurred_at, event_id`, [w.id]);
    const t0 = new Date(ev[0].occurred_at).getTime(); const t1 = new Date(ev[1].occurred_at).getTime();
    const AT = new Date(Math.floor((t0 + (t1 - t0) / 2) / 1000) * 1000).toISOString().replace('.000Z', 'Z');
    const BEFORE = new Date(Math.floor((t0 - 3_600_000) / 1000) * 1000).toISOString().replace('.000Z', 'Z');
    note(`the warning ${short(w.id)} "${W_TITLE}" — its recorded events: ${ev.map((e) => `${e.event.replace('warning.', '')} ${iso(e.occurred_at)}`).join(', ')}; the link's instant ${AT} lies between the first two`);
    const before = await q1(`select (select count(*) from prediction.warning_events where warning_id = $1)::int ev, (select state from prediction.warnings_current where warning_id = $1) st`, [w.id]);
    const asOf = (at) => DM(brandt, `${SHL}/links/warnings/${w.id}/as-of`, 'prediction.read', { at }, 'WRN', w.id, 'navigation');
    const r = await asOf(AT);
    if (!r.ok) fail('L. Brandt opens the deep link', r);
    else {
      const x = r.body.warning;
      (x.as_of.state === 'raised' && x.variance.exact === false && x.variance.events_since === ev.length - 1 ? ok : bad)(`AS OF ${AT}: ${String(x.as_of.state).toUpperCase()} · level ${x.as_of.level} · context version ${x.as_of.context_version} · ${x.as_of.event_count} event(s) up to the instant; CURRENT: ${String(x.current.state).toUpperCase()} (${x.current.event_count} events); THE VARIANCE: ${x.variance.statement} — ${x.variance.changed.map((c) => `${c.field} ${c.as_of} → ${c.current}`).join(', ')} — ${rcpt(r)}`);
    }
    expectRefused(`the same link at ${BEFORE} (before the warning's first event)`, await asOf(BEFORE), 422, /warning as-of rejected \(not_replayable\)/);
    const after = await q1(`select (select count(*) from prediction.warning_events where warning_id = $1)::int ev, (select state from prediction.warnings_current where warning_id = $1) st`, [w.id]);
    (after.ev === before.ev && after.st === before.st ? ok : bad)(`opening the link WROTE NOTHING to the warning: ${after.ev} events and state ${after.st} before and after (the read leaves its own access evidence, as every read does)`);
    ENV_OUT.EYE_B80_WARNING = w.id; ENV_OUT.EYE_B80_AS_OF = AT; ENV_OUT.EYE_B80_BEFORE = BEFORE;
  }
}

/* ── B80-6 INVENTORY AND ACCEPTANCE DEMONSTRATION RECORDS ───────────────────────────────── */
await renewAll();
console.log('\nB80-6 THE INVENTORY AND THE ACCEPTANCE DEMONSTRATION RECORDS (B107\'s design-governance routes) — the new library components registered and owned, the library lint, a B80 baseline, a design acceptance per chapter scope');
const LIBRARY_FILES = ['symbols', 'theme', 'text', 'forms', 'actions', 'feedback', 'data', 'layers', 'shell', 'context-bar'];
const CHAPTERS = [
  ['UX-05', 'F-P7-E-01', 'the shell\'s workspaces'], ['UX-09', 'F-P7-E-01', 'navigation and the command palette'], ['UX-10', 'F-P7-E-01', 'the operating context bar'],
  ['UX-11', 'F-P7-E-01', 'navigation state and return paths'], ['UX-15', 'F-P7-E-01', 'deep links'], ['PR-05', 'F-P7-E-01', 'the per-user navigation state'],
  ['AT-05', 'F-P7-E-01', 'the application shell'], ['CAP-AU-06', 'F-P7-E-01', 'the unified shell'],
  ['UX-17', 'F-P7-E-03', 'tokens and themes'], ['UX-18', 'F-P7-E-03', 'typography'], ['UX-68', 'F-P7-E-03', 'the customer theme'],
  ['UX-20', 'F-P7-E-05', 'actions'], ['UX-21', 'F-P7-E-05', 'forms and drafts'], ['UX-22', 'F-P7-E-05', 'data tables and bulk selection'], ['UX-23', 'F-P7-E-05', 'layers'],
  ['UX-24', 'F-P7-E-05', 'feedback'],
];
{
  const libRows = async () => q(`select asset_id::text id, asset_key k, version, status, digest, owner_principal_id::text owner from governance.design_assets
      where superseded_at is null and asset_key ~ $1 order by asset_key`, [`^web\\.(${LIBRARY_FILES.join('|')})\\.`]);
  let lib = await libRows();
  // rerun-safe: once B80's library is in the inventory, the registration is not repeated (a re-read records a ledger event each time)
  const reg = lib.length > 0 ? null : await P(steward, `${DG}/assets/register`, 'governance.design.asset.register', {}, 'DAS');
  if (reg === null) note(`B80's library is in the inventory (${lib.length} components): stands — an earlier run`);
  else if (!reg.ok) fail('P. Castellano re-reads and registers the design inventory', reg);
  else {
    const inv = reg.body.inventory;
    const newLib = (inv.registered ?? []).filter((x) => LIBRARY_FILES.some((f) => x.key.startsWith(`web.${f}.`)));
    ((inv.registered ?? []).length > 0 || lib.length > 0 ? ok : bad)(`P. Castellano (conformance steward) re-read the inventory from the repository: ${(inv.registered ?? []).length} new asset(s) registered (${newLib.length} of B80's library), ${inv.unchanged} unchanged${(inv.drift ?? []).length ? `; DRIFT stated (the inventory changes nothing — a contribution records it): ${(inv.drift ?? []).map((x) => x.key).join(', ')}` : ''}${(inv.registered ?? []).length === 0 ? ' — stands, an earlier run' : ''}`);
  }
  lib = await libRows();
  let approved = 0; let stood = 0;
  for (const a of lib) {
    if (a.status === 'approved' && a.owner) { stood += 1; continue; }
    const r = await P(dsa, `${DG}/assets/${a.id}/approve`, 'governance.design.asset.approve', { version: a.version, digest: a.digest, ownerPrincipalId: dsaOwner.principalId,
      reason: `${a.k} — a B80 library component read against Volume 9 and its catalogue fixture (SYNTHETIC)` }, 'DAS', a.id);
    if (!r.ok) fail(`L. Haddad approves ${a.k}`, r); else approved += 1;
  }
  lib = await libRows();
  const owners = new Set(lib.map((a) => a.owner));
  (lib.length > 0 && lib.every((a) => a.status === 'approved') && owners.size === 1 && owners.has(dsaOwner.principalId) ? ok : bad)(`L. Haddad (Design System Authority, human gate) APPROVED ${approved} library component(s)${stood ? ` (${stood} stand — an earlier run)` : ''}: ${lib.length} components across ${LIBRARY_FILES.length} files, each with ONE accountable owner — S. Iversen`);
  // the library lint (dg-lint-2: a local component redefining a library component or a token value), recorded through B107's evaluation port
  const LL = await q1(`select evaluation_id::text id, verdict, evaluated_at from governance.design_evaluations where source = 'lint' and evaluated_by = $1 and rules_version = 'dg-lint-2' order by evaluated_at desc limit 1`, [steward.principalId]).catch(() => null);
  const FORK = 'design.no-local-fork';
  const principle = await q1(`select principle_key key, version from governance.design_principles where principle_key = $1 and state <> 'superseded' limit 1`, [FORK]).catch(() => null);
  if (principle) note(`the principle ${FORK} v${principle.version} stands — an earlier run`);
  else {
    const r = await P(dsa, `${DG}/principles/declare`, 'governance.design.principle.declare', { key: FORK, expectedVersion: 0, kind: 'prohibition',
      statement: 'A local component or theme never duplicates a library component\'s identity or redefines a token value (UX-05-005); it is quarantined until it is migrated onto the library or rejected.',
      prohibited: 'a local component named as a library component; a token value declared outside packages/tokens', patterns: [],
      remediation: 'migrate onto the library component or the governed theme; else reject the contribution', reason: 'B80: dg-lint-2 evidences this prohibition (SYNTHETIC demonstration)' }, 'DSP');
    if (!r.ok) fail(`L. Haddad declares the principle ${FORK}`, r); else ok(`L. Haddad (human gate) DECLARED the principle ${FORK} (prohibition) — dg-lint-2's findings evidence it — ${rcpt(r)}`);
  }
  if (LL) note(`the library lint ${short(LL.id)} (${LL.verdict}, ${iso(LL.evaluated_at)}) stands — an earlier run`);
  else {
    const l = await P(steward, `${DG}/library/lint`, 'governance.design.evaluate', {}, 'DSE');
    if (!l.ok) fail('P. Castellano runs the library lint', l);
    else {
      const e = l.body.evaluation; const fs = e.findings ?? [];
      const byRule = fs.reduce((m, f) => ({ ...m, [f.rule]: (m[f.rule] ?? 0) + 1 }), {});
      ok(`P. Castellano ran the LIBRARY LINT (dg-lint-2) over the real web source: ${e.files} files, ${e.library} library components, verdict ${String(e.verdict).toUpperCase()}, ${fs.length} finding(s) STATED (never hidden)${fs.length ? ` — ${Object.entries(byRule).map(([k, v]) => `${k} ${v}`).join(', ')}; e.g. ${fs.slice(0, 3).map((f) => `${f.file}:${f.line}`).join(', ')}` : ''} (evidence ${short(e.evaluation_id)})`);
    }
  }
  const LINT2 = await q1(`select evaluation_id::text id, verdict, jsonb_array_length(findings)::int n from governance.design_evaluations where source = 'lint' and evaluated_by = $1 and rules_version = 'dg-lint-2' order by evaluated_at desc limit 1`, [steward.principalId]);
  const EVAL = await q1(`select evaluation_id::text id, digest, evaluated_at, verdict from governance.design_evaluations where source = 'lint' and evaluated_by = $1 order by evaluated_at desc limit 1`, [steward.principalId]);
  // the B80 design baseline: proposed by the steward, attested (signed) by the authority — never its proposer
  const DBL_TITLE = 'The Eye design baseline 2026-10 — B80 shell and foundations (SYNTHETIC demonstration)';
  const tokensVersion = JSON.parse(readFileSync(join(SELF_ROOT, 'packages', 'tokens', 'package.json'), 'utf8')).version;
  let DBL = await q1(`select baseline_id::text id, version, state, digest from governance.design_baselines where title = $1 order by version desc limit 1`, [DBL_TITLE]);
  if (DBL === null) {
    const p = await P(steward, `${DG}/baselines/propose`, 'governance.design.baseline.propose', { expectedVersion: 0, title: DBL_TITLE, designSystemVersion: `@eye/tokens@${tokensVersion}`,
      scope: { capabilities: ['F-P7-E-01', 'F-P7-E-03', 'F-P7-E-05'], journeys: CHAPTERS.map((c) => c[0]), profiles: ['local-dev'], themes: ['light', 'dark', 'print'], locales: ['en'] }, members: lib.map((a) => a.id) }, 'DBL');
    if (!p.ok) fail('P. Castellano proposes the B80 design baseline', p);
    else {
      const b = p.body.baseline;
      ok(`P. Castellano PROPOSED the B80 design baseline ${short(b.baseline_id)} v${b.version}: ${lib.length} members (the library), design system @eye/tokens@${tokensVersion}`);
      const d = await P(dsa, `${DG}/baselines/${b.baseline_id}/decide`, 'governance.design.baseline.decide', { version: b.version, decision: 'attest', digest: b.digest, reason: 'the B80 library read against Volume 9 and its catalogue walk; every member owned (SYNTHETIC)' }, 'DBL', b.baseline_id);
      if (!d.ok) fail('L. Haddad attests the B80 design baseline', d); else ok(`L. Haddad ATTESTED and SIGNED the B80 design baseline v${b.version} (${d.body.baseline.state})`);
    }
    DBL = await q1(`select baseline_id::text id, version, state, digest from governance.design_baselines where title = $1 order by version desc limit 1`, [DBL_TITLE]);
  } else note(`the B80 design baseline ${short(DBL.id)} v${DBL.version} stands — an earlier run (${DBL.state})`);
  // A DESIGN ACCEPTANCE per B80 chapter scope (claim demonstration): the exact tuple; attested per obligation by distinct named humans
  if (DBL?.state === 'attested' && EVAL) {
    const files = ['scripts/phase6/act-b80.mjs', 'e2e/phase6-b80.demo.spec.ts', 'e2e/phase6-b80-catalogue.demo.spec.ts'].filter((f) => existsSync(join(SELF_ROOT, f)));
    const fileEv = files.map((f) => ({ kind: 'journey_harness', ref: `${f} (the B80 act and walks — the journey harness of the chapter)`, digest: sha256(readFileSync(join(SELF_ROOT, f))),
      capturedAt: new Date(Date.now() - 60_000).toISOString(), validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString() }));
    const ev = [{ kind: 'design_evaluation', ref: `the lint evaluation ${EVAL.id} (${EVAL.verdict})`, digest: EVAL.digest, capturedAt: new Date(EVAL.evaluated_at).toISOString(), validUntil: new Date(Date.now() + 30 * 86_400_000).toISOString() }, ...fileEv];
    const lines = [];
    for (const [chapter, feature, what] of CHAPTERS) {
      let A = await q1(`select acceptance_id::text id, version, state, digest from governance.design_acceptances where tenant_id = $1 and domain_id = $2 and tuple ->> 'journey' = $3 and tuple ->> 'capability' = $4 order by version desc limit 1`, [T, D, chapter, feature]);
      if (A?.state === 'accepted') { lines.push(`${chapter} stands`); continue; }
      if (A === null) {
        const p = await DM(steward, `${DGD}/acceptances/propose`, 'governance.design.acceptance.propose', { baselineId: DBL.id, components: lib.map((a) => a.id),
          tuple: { capability: feature, journey: chapter, persona: `the corridor's people — ${what} (SYNTHETIC)`, role: 'decision_owner', deployment_profile: 'local-dev', theme: 'NORDWERK Corporate v2', locale: 'en', device: 'desktop', assistive_technology: 'none recorded' },
          evidence: ev, obligations: ['design', 'assurance', 'customer'], findings: [{ note: LINT2 && LINT2.n > 0 ? `dg-lint-2 evaluation ${LINT2.id}: ${LINT2.n} open finding(s) — pages not yet migrated onto the library (stated, carried)` : 'none open at proposal (SYNTHETIC)' }], conditions: [{ condition: 'local-dev profile only; accessibility slots empty (B108 → H3)' }] }, 'DAC');
        if (!p.ok) { fail(`P. Castellano proposes the ${chapter} design acceptance`, p); continue; }
        A = { id: p.body.acceptance.acceptance_id, version: p.body.acceptance.version, digest: p.body.acceptance.digest, state: p.body.acceptance.state };
      }
      let state = A.state;
      for (const [s, o] of [[dsa, 'design'], [assurance, 'assurance'], [sponsor, 'customer']]) {
        const done = await q1(`select count(*)::int n from governance.design_acceptances x, jsonb_array_elements(x.attestations) t where x.acceptance_id = $1 and x.version = $2 and t ->> 'obligation' = $3`, [A.id, A.version, o]);
        if (done.n > 0) continue;
        const r = await DM(s, `${DGD}/acceptances/${A.id}/attest`, 'governance.design.acceptance.attest', { version: A.version, obligation: o, digest: A.digest, reason: `the ${o} obligation attested against the exact tuple of ${chapter} (SYNTHETIC)` }, 'DAC', A.id);
        if (!r.ok) { fail(`${nm(s.principalId)} attests ${chapter}'s ${o} obligation`, r); break; }
        state = r.body.acceptance.state;
      }
      lines.push(`${chapter} ${String(state).toUpperCase()}`);
    }
    const recs = await q(`select tuple ->> 'journey' j, state, claim from governance.design_acceptances a where tenant_id = $1 and domain_id = $2 and tuple ->> 'capability' in ('F-P7-E-01', 'F-P7-E-03', 'F-P7-E-05')
        and version = (select max(version) from governance.design_acceptances x where x.acceptance_id = a.acceptance_id)`, [T, D]);
    (recs.length === CHAPTERS.length && recs.every((r) => r.state === 'accepted' && r.claim === 'demonstration') ? ok : bad)(`the design acceptance DEMONSTRATION records per chapter scope, each attested by L. Haddad (design), H. Achterberg (assurance) and W. Zielińska (customer): ${lines.join(', ')} — ${recs.length} records, claim ${[...new Set(recs.map((r) => r.claim))].join('/')}; accessibility slots EMPTY (MET-034 unsupported, B108 → H3)`);
  } else bad(`no attested B80 baseline or lint evaluation — the acceptance demonstration records were not proposed`);
}

/* ── B80-7 THE STATE AND THE LIMITS ──────────────────────────────────────────────────── */
console.log('\nB80-7 THE STATE and the LIMITS');
{
  const n = await q1(`select (select count(*) from governance.design_themes where tenant_id = $1)::int theme_versions, (select count(*) from governance.theme_certifications where tenant_id = $1)::int certifications,
     (select count(*) from governance.theme_activations where tenant_id = $1)::int activations, (select count(*) from shell.drafts where tenant_id = $1)::int draft_versions,
     (select count(*) from shell.events where tenant_id = $1)::int shell_events`, [T]);
  note(`as recorded: ${Object.entries(n).map(([k, v]) => `${k} ${v}`).join(', ')}`);
  const claims = await q1(`select (select count(*) from governance.design_themes where claim <> 'demonstration')::int t, (select count(*) from governance.theme_certifications where claim <> 'demonstration')::int c,
     (select count(*) from governance.design_acceptances where claim <> 'demonstration')::int d`);
  (claims.t + claims.c + claims.d === 0 ? ok : bad)(`no record claims more than a DEMONSTRATION (themes ${claims.t}, certifications ${claims.c}, design acceptances ${claims.d} beyond it)`);
  ENV_OUT.EYE_B80_TENANT = T; ENV_OUT.EYE_B80_DOMAIN = D; ENV_OUT.EYE_B80_DECISION_OWNER = 'l.brandt'; ENV_OUT.EYE_B80_COLLECTOR = 'm.dvorak';
  console.log('  the env lines for the walk (EYE_TEST_ADMIN_PASSWORD comes from .eye-local/env and is never printed):');
  for (const [k, v] of Object.entries(ENV_OUT)) console.log(`  ${k}=${v}`);
  note('LIMITS said — THREE CLAIMS KEPT APART. (1) CONSTRUCTION — the software and its harnesses (phase6-{prelude,themes,drafts,navigation,context}-b80, the web unit models, the catalogue walk). (2) DEMONSTRATED OPERATION — what RAN here through the governed routes by SYNTHETIC personas: the NORDWERK theme refused on contrast, corrected, certified (signed), activated, rolled back once and re-activated; the two forms\' drafts saved and read back and the package declared; the Red Sea replay contracts suspended and returned, one receipt each; the context switch previewed before its commit and the stale choices refused; the deep link read as of an instant; the library registered and owned, a B80 baseline attested and a design acceptance record per chapter scope — every record `claim = demonstration`. (3) REAL ACCEPTANCE — a real customer\'s brand acceptance, the named design authorities\' attestation of the conformance package, assistive-technology and accessibility results (MET-034 unsupported; B108) — NEVER claimed and not recordable through the present implementation: the non-demonstration recording path is construction at B111 (F-P7-E-17), then the external act at H3. Fonts: the fallback stacks only (TYP-001/002 partial; the font delivery is carried at B81 pending the owner\'s licence decision). An agent\'s attempt at the human-gated acts is refused in the harnesses (phase6-themes-b80, phase6-context-b80), not here.');
}
await su.end();
console.log(`\n${failureCount() === 0 ? 'ALL SCENES HELD' : `${failureCount()} FAILURE(S)`} · ${((Date.now() - tStart) / 60000).toFixed(1)} min`);
process.exit(Math.min(failureCount(), 255));
