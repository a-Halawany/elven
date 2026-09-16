#!/usr/bin/env node
/**
 * THE CUSTOMER'S IMPORT of a package into a domain of THIS installation (CP-6 B16; migration 0076 §4; DP-47-001/-002/-005, DZ-17,
 * ES-53-004 "signed import packages"): one governed act per invocation against the product's import routes — the same two-person gate
 * the export has, in the other direction:
 *
 *   node scripts/retention/import-package.mjs open     --api <base url> --token <bearer> --principal <id> --tenant <uuid> --domain <uuid>
 *        (--file <package.tar> | --station-key <key> --origin-tenant <uuid> --origin-domain <uuid> --origin-action <uuid>)
 *        [--exchange <delivery.json>] [--body-limit <bytes>] [--json]
 *   node scripts/retention/import-package.mjs approve  … --import <uuid> --package-digest <hex> --rationale <text>
 *   node scripts/retention/import-package.mjs admit    … --import <uuid>
 *   node scripts/retention/import-package.mjs withdraw … --import <uuid> --reason <text>
 *   node scripts/retention/import-package.mjs get      … --import <uuid>
 *
 * ONE TOKEN, ONE ACT (N7 of the B16 record): the opener (a retention steward of the importing domain) opens; the retention authority
 * approves ON THE PACKAGE DIGEST — never the opener; the steward admits — never the approver. Each is a session of its own, so each is
 * an invocation of its own with that person's bearer; the tool never holds two credentials and never prints the one it holds.
 *
 * OPEN quarantines the package as vault blobs and runs the fifteen checks in the same governed write (`retention.import.open`, object RIM):
 * the archive, the manifest, the integrity of every file, the re-import digests, the completeness, the digest chain, the KEY-BASED
 * signature (a /1 chain-only package is quarantined: an import admits key-signed packages only), the EXCHANGE PARTNER holding the key,
 * the signature against the partner's key, the closure named inside the chain and consistent by (object_id, object_version), the
 * intake source's policy ceiling, no live duplicate, revocation and expiry, the origin's own exclusions. The answer is `verified`
 * (exit 0) or `quarantined` (exit 1) with every check printed as the verifier prints them — PASS / FAIL / a note — and the items the
 * plan holds (the ids this installation will mint, the exclusions). Two intakes:
 *   --file <tar>          INLINE: the archive as base64 inside the governed payload. The product's inline ceiling is 64 MiB decoded, but
 *                         the LISTENER's JSON body limit binds first — Nest's express default is 100 KiB unless the deployment configures
 *                         it — so this tool measures the governed body it would send and REFUSES one above --body-limit (default 102400
 *                         bytes), naming the station path to use instead. Nothing is sent that the listener would drop at the edge.
 *   --station-key <key>   STATION: the product reads the package the ORIGIN delivered to a transfer station declared in the importing
 *                         domain — `<endpoint>/<origin tenant>/<origin domain>/<origin action>/package.tar` beside delivery.json (the
 *                         exchange: the delivery id, the attempt, the expiry — the product reads it as the exchange block) and
 *                         package.sig — entry by entry, in constant memory: a package of any size the station holds.
 *   --exchange <file>     the origin's delivery.json presented with an inline package (the expiry and the delivery identity the
 *                         revocation check reads when the origin is not this installation).
 *
 * APPROVE restates the package digest the opener saw (`--package-digest`, the recomputed chain digest the open answer printed) with a
 * rationale of 8+ characters; ADMIT runs the admission (records, then claims, then the graph — new ids minted, the origin identity
 * kept as digest-bound provenance in every payload's imported_from) and prints the batches and the counts; WITHDRAW closes an import
 * that was not admitted (its evidence stays, its quarantine copies are tombstoned); GET prints the import's record — the checks, the
 * items by kind and disposition with the ORIGIN → NEW id map, the events — and with --json prints the route's answer verbatim, which
 * is what scripts/retention/compare-round-trip.mjs takes as --map.
 *
 * The governed envelope is the product's (fetch-export.mjs builds it the same way): `--principal` names the session's principal
 * (`principal:<uuid>`, or the bare uuid — the login answer's principalId; the product refuses an envelope naming another principal),
 * the bearer is the caller's session token (never printed). Exit 0 when the act succeeded (open: verified; admit: admitted), 1 when
 * the product answered with a state that is not the one asked for (open: quarantined), 2 on usage or a refusal (the route's JSON
 * answer is printed).
 *
 * Node 18 or later; no dependency, no database — it talks to the product's routes alone.
 */
import { createHash, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ACTS = ['open', 'approve', 'admit', 'withdraw', 'get'];
const ACTIONS = { open: 'retention.import.open', approve: 'retention.import.approve', admit: 'retention.import.admit', withdraw: 'retention.import.withdraw', get: 'retention.read' };
/** The listener's JSON body limit, as Nest's express default states it ('100kb' = 100 × 1024 bytes); a configured listener is named with --body-limit. */
const DEFAULT_BODY_LIMIT = 100 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX64 = /^[0-9a-f]{64}$/;
const USAGE = [
  'usage: node scripts/retention/import-package.mjs <open|approve|admit|withdraw|get> --api <base url> --token <bearer> --principal <id> --tenant <uuid> --domain <uuid> [--json] …',
  '  open      (--file <package.tar> | --station-key <key> --origin-tenant <uuid> --origin-domain <uuid> --origin-action <uuid>) [--exchange <delivery.json>] [--body-limit <bytes>]',
  '  approve   --import <uuid> --package-digest <hex> --rationale <text>',
  '  admit     --import <uuid>',
  '  withdraw  --import <uuid> --reason <text>',
  '  get       --import <uuid>',
].join('\n');
const say = (l) => console.log(`[import-package] ${l}`);
const fail = (l, code = 2) => { console.error(`[import-package] ${l}`); process.exit(code); };

/* ── arguments ─────────────────────────────────────────────────────────────── */
const args = process.argv.slice(2);
const act = args[0];
if (act === '--help' || act === '-h' || act === undefined) { console.log(USAGE); process.exit(act === undefined ? 2 : 0); }
if (!ACTS.includes(act)) fail(`the act is one of ${ACTS.join(', ')}\n${USAGE}`);
const opt = {}; let asJson = false;
for (let i = 1; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--json') asJson = true;
  else if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
  else if (a.startsWith('--')) { opt[a.slice(2)] = String(args[i + 1] ?? ''); i += 1; }
  else fail(`unexpected argument: ${a}\n${USAGE}`);
}
for (const k of ['api', 'token', 'principal', 'tenant', 'domain']) if (!opt[k]) fail(`--${k} is required\n${USAGE}`);
for (const k of ['tenant', 'domain']) if (!UUID.test(opt[k])) fail(`--${k} ${JSON.stringify(opt[k])} is not a uuid`);
const principalId = /^principal:/.test(opt.principal) ? opt.principal : `principal:${opt.principal}`;
if (!UUID.test(principalId.slice('principal:'.length))) fail(`--principal ${JSON.stringify(opt.principal)} is not the session's principal (principal:<uuid>, or the uuid the login answer carries as principalId)`);
if (act !== 'open') {
  if (!opt.import) fail(`--import <uuid> is required for ${act}\n${USAGE}`);
  if (!UUID.test(opt.import)) fail(`--import ${JSON.stringify(opt.import)} is not a uuid`);
}
const short = (id) => `${String(id).slice(0, 8)}…`;
const iso = (t) => (t === null || t === undefined ? '—' : new Date(t).toISOString());

/* ── the governed envelope (as fetch-export.mjs builds it) ─────────────────── */
const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v !== null && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v));
const envelopeOf = (action, objectId, payload, sideEffect) => ({
  message_id: randomUUID(), scope: 'DOMAIN', tenant_id: opt.tenant, domain_id: opt.domain, principal_id: principalId, purpose_id: 'retention',
  action, side_effect_class: sideEffect, consequence_class: 'C2', object_type: 'RIM', object_id: objectId,
  schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: randomUUID(), trace_id: 'import-package', payload_digest: createHash('sha256').update(canonical(payload)).digest('hex'),
});
const base = `${opt.api.replace(/\/$/, '')}/v1/tenants/${opt.tenant}/domains/${opt.domain}/retention/imports`;
async function post(path, envelope, payload) {
  const body = JSON.stringify({ envelope, payload });
  say(`POST ${path} (${envelope.action}; correlation ${envelope.correlation_id}; ${Buffer.byteLength(body)} bytes)`);
  let res;
  try { res = await fetch(path, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${opt.token}` }, body }); } catch (e) { fail(`the product could not be reached: ${e.message}`); }
  const text = await res.text().catch(() => '');
  let answer = null; try { answer = JSON.parse(text); } catch { answer = null; }
  if (!res.ok) fail(`refused: HTTP ${res.status} ${answer?.message ?? text.slice(0, 600)}`);
  if (answer === null || typeof answer !== 'object') fail(`the route answered HTTP ${res.status} without a JSON object: ${text.slice(0, 300)}`);
  return answer;
}

/* ── what is printed ───────────────────────────────────────────────────────── */
const printChecks = (checks) => {
  for (const c of Array.isArray(checks) ? checks : []) console.log(c.ok === null || c.ok === undefined ? `  note  ${c.name}${c.detail ? ` — ${c.detail}` : ''}` : `  ${c.ok ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ` — ${c.detail}` : ''}`);
};
const admittedIdOf = (item) => {
  const a = item.admitted ?? item.planned ?? {};
  return a.object_id ?? a.entity_id ?? a.edge_id ?? a.identifier_id ?? null;
};
const printItems = (items, withMap) => {
  const rows = Array.isArray(items) ? items : [];
  const groups = new Map();
  for (const it of rows) { const k = `${it.kind}/${it.disposition}${it.gate ? ` (${it.gate})` : ''}`; groups.set(k, (groups.get(k) ?? 0) + 1); }
  console.log(`  items: ${rows.length === 0 ? 'none' : [...groups.entries()].map(([k, n]) => `${n} ${k}`).join(', ')}`);
  if (withMap) {
    for (const it of rows.filter((x) => x.kind === 'record' || x.kind === 'claim')) {
      const to = admittedIdOf(it);
      console.log(`    ${it.kind.padEnd(6)} ${it.origin_ref} → ${to === null ? '(no id)' : `${to}${it.admitted?.object_version !== undefined ? `@${it.admitted.object_version}` : ''}`}  ${it.disposition}${it.gate ? ` (${it.gate}: ${it.reason ?? ''})` : ''}`);
    }
    for (const it of rows.filter((x) => x.kind === 'entity' || x.kind === 'edge' || x.kind === 'identifier' || x.kind === 'identifier_system')) {
      const to = admittedIdOf(it);
      console.log(`    ${it.kind.padEnd(6)} ${it.origin_ref} → ${to ?? (it.admitted?.outcome ?? it.disposition)}  ${it.disposition}${it.gate ? ` (${it.gate}: ${it.reason ?? ''})` : ''}`);
    }
    for (const it of rows.filter((x) => x.kind === 'exclusion')) console.log(`    exclusion ${it.origin_ref}: ${it.gate ?? 'origin_excluded'}${it.reason ? ` — ${it.reason}` : ''}`);
  }
};
const printImport = (row) => {
  if (row === null || typeof row !== 'object') { console.log('  import: (no row in the answer)'); return; }
  const o = row.origin ?? {};
  console.log(`  import ${row.import_id} — state ${row.state}; verified ${row.verified}; partner ${row.partner_id ?? 'none'}; intake ${JSON.stringify(row.intake ?? null)}`);
  console.log(`  origin: tenant ${o.tenant_id ?? '?'} domain ${o.domain_id ?? '?'} action ${o.action_id ?? '?'}; format ${o.format ?? '?'}; scheme ${o.scheme ?? '?'}${o.key_id ? ` by ${o.key_id}` : ''}; ${o.object_count ?? '?'} object(s), ${o.excluded_count ?? '?'} excluded by the origin${o.links ? `; closure ${o.links.format ?? '?'} (${o.links.claims ?? '?'} claim version(s), ${o.links.edges ?? '?'} edge(s), ${o.links.entities ?? '?'} entit(ies), ${o.links.excluded ?? '?'} excluded)` : ''}`);
  console.log(`  archive ${row.archive_digest} (${row.archive_size} bytes); package digest ${row.package_digest ?? '(not recomputed)'}${row.exchange ? `; exchange ${JSON.stringify({ delivery_id: row.exchange.delivery_id, attempt: row.exchange.attempt, expires_at: row.exchange.expires_at })}` : '; no exchange block'}`);
  console.log(`  opened by ${row.opened_by} at ${iso(row.opened_at)}${row.approved_at ? `; approved by ${row.approved_by} at ${iso(row.approved_at)} (${row.approval_rationale ?? ''})` : ''}${row.admitted_at ? `; admitted by ${row.admitted_by} at ${iso(row.admitted_at)} after ${row.attempts} attempt(s)` : ''}${row.withdrawn_at ? `; withdrawn by ${row.withdrawn_by} at ${iso(row.withdrawn_at)} (${row.withdraw_reason ?? ''})` : ''}`);
  if (row.counts && Object.keys(row.counts).length > 0) console.log(`  counts ${JSON.stringify(row.counts)}`);
};

/* ── the acts ──────────────────────────────────────────────────────────────── */
let answer = null; let exitCode = 0;
if (act === 'open') {
  const inline = opt.file !== undefined; const station = opt['station-key'] !== undefined;
  if (inline === station) fail(`open takes --file <package.tar> or --station-key <key> (one of the two)\n${USAGE}`);
  let exchange = null;
  if (opt.exchange !== undefined) {
    const p = resolve(opt.exchange);
    if (!existsSync(p)) fail(`--exchange ${p} does not exist`);
    try { exchange = JSON.parse(readFileSync(p, 'utf8')); } catch (e) { fail(`--exchange ${p} does not parse: ${e.message}`); }
    if (exchange === null || typeof exchange !== 'object' || Array.isArray(exchange)) fail(`--exchange ${p} is not a JSON object (the origin's delivery.json)`);
  }
  let source;
  if (inline) {
    const file = resolve(opt.file);
    if (!existsSync(file) || !statSync(file).isFile()) fail(`--file ${file} is not a file`);
    const limit = opt['body-limit'] === undefined ? DEFAULT_BODY_LIMIT : Number(opt['body-limit']);
    if (!Number.isInteger(limit) || limit < 1024) fail('--body-limit is the listener\'s JSON body limit in bytes (an integer of 1024 or more)');
    const bytes = readFileSync(file);
    source = { kind: 'inline', base64: bytes.toString('base64'), exchange };
    const probe = JSON.stringify({ envelope: envelopeOf(ACTIONS.open, null, { source }, 'reversible'), payload: { source } });
    const bodyBytes = Buffer.byteLength(probe);
    if (bodyBytes > limit) {
      fail(`the archive ${file} is ${bytes.byteLength} bytes; its governed body would be ${bodyBytes} bytes, above the listener's JSON body limit of ${limit} bytes (Nest's express default is 100 KiB unless the deployment configures it; pass --body-limit <bytes> for a configured listener). `
        + `A package of this size is opened from a TRANSFER STATION: the origin delivers it there (POST …/retention/actions/<action>/export/deliver { destinationKey }) and the importing domain opens it with `
        + `--station-key <key> --origin-tenant <origin tenant> --origin-domain <origin domain> --origin-action <origin action> — the product reads <station endpoint>/<origin tenant>/<origin domain>/<origin action>/package.tar entry by entry, with delivery.json beside it as the exchange.`);
    }
    say(`inline intake: ${file} (${bytes.byteLength} bytes; sha256 ${createHash('sha256').update(bytes).digest('hex')}); the governed body ${bodyBytes} bytes within the listener's limit of ${limit}${exchange === null ? '; no exchange block' : `; exchange ${exchange.delivery_id ?? '?'} attempt ${exchange.attempt ?? '?'}`}`);
  } else {
    for (const k of ['origin-tenant', 'origin-domain', 'origin-action']) { if (!opt[k]) fail(`--${k} is required with --station-key\n${USAGE}`); if (!UUID.test(opt[k])) fail(`--${k} ${JSON.stringify(opt[k])} is not a uuid`); }
    if (exchange !== null) say('NOTE --exchange is ignored for a station intake: the product reads delivery.json beside the package at the station');
    source = { kind: 'station', destinationKey: opt['station-key'], origin: { tenantId: opt['origin-tenant'], domainId: opt['origin-domain'], actionId: opt['origin-action'] } };
    say(`station intake: destination ${opt['station-key']}, the package the origin ${opt['origin-tenant']}/${opt['origin-domain']} delivered for action ${opt['origin-action']} (<endpoint>/${opt['origin-tenant']}/${opt['origin-domain']}/${opt['origin-action']}/package.tar)`);
  }
  answer = await post(`${base}/open`, envelopeOf(ACTIONS.open, null, { source }, 'reversible'), { source });
  const row = answer.import ?? null;
  if (!asJson) {
    printImport(row);
    console.log('  the checks:');
    printChecks(answer.checks ?? row?.checks);
    printItems(answer.items, false);
    const r = answer.importReceipt ?? null;
    if (r !== null) console.log(`  the import's receipt: ${JSON.stringify({ receipt_id: r.receipt_id, verified: r.verified, package_digest: r.package_digest, archive_digest: r.archive_digest, state: r.state })}`);
    console.log(`  policy decision ${answer.receipt?.policyDecisionId ?? '?'}, audit seq ${answer.receipt?.auditSeq ?? '?'}`);
    const state = String(row?.state ?? '');
    const failed = (answer.checks ?? row?.checks ?? []).filter((c) => c.ok === false);
    console.log(state === 'verified' ? `IMPORT VERIFIED: ${row.import_id} — the retention authority approves on package digest ${row.package_digest}; the steward admits`
      : `IMPORT ${state.toUpperCase() || 'NOT VERIFIED'}: ${row?.import_id ?? '?'} — ${failed.length} check(s) failed${failed.length > 0 ? ` (${failed.map((c) => c.name.split(':')[0]).join(', ')})` : ''}; the request and the evidence are kept`);
  }
  exitCode = String(row?.state ?? '') === 'verified' ? 0 : 1;
} else if (act === 'approve') {
  if (!opt['package-digest'] || !HEX64.test(String(opt['package-digest']).toLowerCase())) fail('--package-digest <hex> is the package digest the open answer printed (64 hex characters)');
  if (!opt.rationale || String(opt.rationale).trim().length < 8) fail('--rationale is at least 8 characters');
  const payload = { packageDigest: String(opt['package-digest']).toLowerCase(), rationale: String(opt.rationale) };
  answer = await post(`${base}/${opt.import}/approve`, envelopeOf(ACTIONS.approve, opt.import, payload, 'approval-required'), payload);
  if (!asJson) { printImport(answer.import ?? null); console.log(`  policy decision ${answer.receipt?.policyDecisionId ?? '?'}, audit seq ${answer.receipt?.auditSeq ?? '?'}`); console.log(String(answer.import?.state) === 'approved' ? `IMPORT APPROVED: ${opt.import} on package digest ${payload.packageDigest} — the steward admits` : `IMPORT ${String(answer.import?.state ?? '?').toUpperCase()}: ${opt.import}`); }
  exitCode = String(answer.import?.state ?? '') === 'approved' ? 0 : 1;
} else if (act === 'admit') {
  answer = await post(`${base}/${opt.import}/admit`, envelopeOf(ACTIONS.admit, opt.import, {}, 'approval-required'), {});
  if (!asJson) {
    printImport(answer.import ?? null);
    for (const b of Array.isArray(answer.batches) ? answer.batches : []) console.log(`  batch ${b.kind}: ${b.count} item(s) — policy decision ${b.policyDecisionId ?? '?'}, audit seq ${b.auditSeq ?? '?'}`);
    console.log(`  policy decision ${answer.receipt?.policyDecisionId ?? '?'}, audit seq ${answer.receipt?.auditSeq ?? '?'}`);
    console.log(String(answer.import?.state) === 'admitted' ? `IMPORT ADMITTED: ${opt.import} — counts ${JSON.stringify(answer.import?.counts ?? {})}; the map is in \`get\` (origin id@version → the id this installation minted)` : `IMPORT ${String(answer.import?.state ?? '?').toUpperCase()}: ${opt.import} — the admission did not finish; a later admit resumes from the staged items`);
  }
  exitCode = String(answer.import?.state ?? '') === 'admitted' ? 0 : 1;
} else if (act === 'withdraw') {
  if (!opt.reason || String(opt.reason).trim().length < 8) fail('--reason is at least 8 characters');
  const payload = { reason: String(opt.reason) };
  answer = await post(`${base}/${opt.import}/withdraw`, envelopeOf(ACTIONS.withdraw, opt.import, payload, 'reversible'), payload);
  if (!asJson) { printImport(answer.import ?? null); console.log(String(answer.import?.state) === 'withdrawn' ? `IMPORT WITHDRAWN: ${opt.import} — its evidence stays in the ledger; its quarantine copies are tombstoned` : `IMPORT ${String(answer.import?.state ?? '?').toUpperCase()}: ${opt.import}`); }
  exitCode = String(answer.import?.state ?? '') === 'withdrawn' ? 0 : 1;
} else {
  answer = await post(`${base}/${opt.import}/get`, envelopeOf(ACTIONS.get, opt.import, {}, 'none'), {});
  if (!asJson) {
    printImport(answer.import ?? null);
    if (answer.partner) console.log(`  partner ${answer.partner.partner_key ?? '?'} (${answer.partner.party ?? '?'}; key ${answer.partner.key_id ?? '?'}; intake ${answer.partner.intake_source_id ?? '?'}@${answer.partner.intake_contract_version ?? '?'}${answer.partner.retired_at ? `; RETIRED ${iso(answer.partner.retired_at)}` : ''})`);
    console.log('  the checks:');
    printChecks(answer.checks ?? answer.import?.checks);
    printItems(answer.items, true);
    for (const e of Array.isArray(answer.events) ? answer.events : []) console.log(`  event ${String(e.event).padEnd(26)} ${iso(e.occurred_at)}  ${JSON.stringify(e.details ?? {}).slice(0, 200)}`);
    const r = answer.receipt ?? null;
    if (r !== null && r.receipt_id !== undefined) console.log(`  the import's receipt: ${JSON.stringify({ receipt_id: r.receipt_id, verified: r.verified, package_digest: r.package_digest, archive_digest: r.archive_digest, state: r.state, counts: r.counts })}`);
  }
  exitCode = 0;
}
if (asJson) console.log(JSON.stringify(answer, null, 2));
process.exit(exitCode);
