#!/usr/bin/env node
/**
 * THE CUSTOMER'S FETCH of a package of any size (CP-6 B15; DP-47-006 "large-scale export"): the export's STREAM route
 * (`POST …/retention/actions/<action>/export/stream`) answers the archive RAW — one deterministic ustar tar, `application/x-tar`, its
 * length announced, the digests and the signature in headers — assembled from the package's files as it is sent, of any size under
 * the streamed ceiling (64 GiB). This tool streams it to a file, hashing it as it arrives, compares the streamed sha256 with the
 * `x-eye-archive-digest` header, and (unless --no-verify) runs the customer's verifier on the file (`verify-export.mjs --tar`, which
 * scans a tar in constant memory; with `--public-key` when given).
 *
 *   node scripts/retention/fetch-export.mjs --api <base url> --token <bearer> --tenant <uuid> --domain <uuid> --action <uuid> --out <file>
 *        [--principal <principal id>] [--public-key <pem-file>] [--no-verify]
 *
 * The governed envelope is the product's (action retention.export.download, object RTA, purpose retention); the bearer is the
 * caller's session token (never printed). The archive is never held in memory here. Exits 0 when the streamed digest is the header's
 * and the verifier passes (or was not asked for); 1 otherwise; 2 on a refusal (the route's JSON answer is printed).
 *
 * Node 18 or later; no dependency.
 */
import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, existsSync, renameSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const VERIFIER = join(dirname(fileURLToPath(import.meta.url)), 'verify-export.mjs');
const USAGE = 'usage: node scripts/retention/fetch-export.mjs --api <base url> --token <bearer> --tenant <uuid> --domain <uuid> --action <uuid> --out <file> [--principal <id>] [--public-key <pem-file>] [--no-verify]';
const say = (l) => console.log(`[fetch-export] ${l}`);
const fail = (l, code = 2) => { console.error(`[fetch-export] ${l}`); process.exit(code); };
const args = process.argv.slice(2); const opt = {}; let verify = true;
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--no-verify') verify = false;
  else if (a === '--help' || a === '-h') { console.log(USAGE); process.exit(0); }
  else if (a.startsWith('--')) { opt[a.slice(2)] = String(args[i + 1] ?? ''); i += 1; }
  else fail(USAGE);
}
for (const k of ['api', 'token', 'tenant', 'domain', 'action', 'out']) if (!opt[k]) fail(`--${k} is required\n${USAGE}`);
const out = resolve(opt.out);
const canonical = (v) => (Array.isArray(v) ? `[${v.map(canonical).join(',')}]` : v !== null && typeof v === 'object' ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}` : JSON.stringify(v));
const envelope = {
  message_id: randomUUID(), scope: 'DOMAIN', tenant_id: opt.tenant, domain_id: opt.domain, principal_id: opt.principal ?? 'anonymous', purpose_id: 'retention',
  action: 'retention.export.download', side_effect_class: 'reversible', consequence_class: 'C2', object_type: 'RTA', object_id: opt.action,
  schema_version: 'v1', issued_at: new Date().toISOString(), clock_quality: 'trusted', correlation_id: randomUUID(), trace_id: 'fetch-export', payload_digest: createHash('sha256').update(canonical({})).digest('hex'),
};
const url = `${opt.api.replace(/\/$/, '')}/v1/tenants/${opt.tenant}/domains/${opt.domain}/retention/actions/${opt.action}/export/stream`;
say(`POST ${url} (correlation ${envelope.correlation_id})`);
const res = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${opt.token}` }, body: JSON.stringify({ envelope, payload: {} }) });
if (!res.ok) { const body = await res.text().catch(() => ''); fail(`refused: HTTP ${res.status} ${body.slice(0, 600)}`); }
const declared = { length: Number(res.headers.get('content-length') ?? -1), archive: res.headers.get('x-eye-archive-digest'), pkg: res.headers.get('x-eye-package-digest'), manifest: res.headers.get('x-eye-manifest-digest'), scheme: res.headers.get('x-eye-signature-scheme'), keyId: res.headers.get('x-eye-key-id'), expires: res.headers.get('x-eye-expires-at'), decision: res.headers.get('x-eye-policy-decision-id'), auditSeq: res.headers.get('x-eye-audit-seq') };
say(`answered ${res.status} ${res.headers.get('content-type')}: ${declared.length} bytes announced; archive digest ${declared.archive}; package digest ${declared.pkg}; signature ${declared.scheme}${declared.keyId ? ` by ${declared.keyId}` : ''}; expires ${declared.expires ?? '—'}; policy decision ${declared.decision}, audit seq ${declared.auditSeq}`);
const hash = createHash('sha256'); let size = 0;
const tmp = `${out}.part-${randomUUID().slice(0, 8)}`;
try {
  const counting = new (await import('node:stream')).Transform({ transform(chunk, _enc, cb) { hash.update(chunk); size += chunk.length; cb(null, chunk); } });
  await pipeline(Readable.fromWeb(res.body), counting, createWriteStream(tmp, { mode: 0o600 }));
  renameSync(tmp, out);
} catch (e) { rmSync(tmp, { force: true }); fail(`the stream ended early: ${e.message} (${size} of ${declared.length} bytes) — the archive is NOT the record's; nothing kept`, 1); }
const streamed = hash.digest('hex');
const ok = size === declared.length && streamed === declared.archive;
say(`streamed ${size} bytes to ${out}; sha256 ${streamed} — ${ok ? 'the archive digest the product announced' : `NOT the announced digest (${declared.archive}) or length (${declared.length})`}`);
if (!ok) { rmSync(out, { force: true }); fail('the streamed archive does not verify against the headers; the file was removed', 1); }
if (!verify) process.exit(0);
const vArgs = [VERIFIER, '--tar', out, ...(opt['public-key'] ? ['--public-key', resolve(opt['public-key'])] : []), ...(declared.pkg ? ['--expect-package-digest', declared.pkg] : [])];
const r = spawnSync(process.execPath, vArgs, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
console.log(String(r.stdout ?? '').trim().split('\n').map((l) => `  ${l}`).join('\n'));
say(`verifier exit ${r.status}: ${r.status === 0 ? 'PACKAGE OK' : 'PACKAGE FAILED'}`);
process.exit(r.status === 0 ? 0 : 1);
