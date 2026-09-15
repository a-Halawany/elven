#!/usr/bin/env node
/**
 * THE DEMONSTRATION EXPORT SIGNING KEY — a generator for the operator (CP-6 B13; migration 0073 §2; D3 of the batch record).
 *
 *   node scripts/retention/generate-demo-signing-key.mjs --public-out <file> [--ref EYE_EXPORT_SIGNING_KEY_<NAME>] >> .eye-local/env
 *
 * This generates an Ed25519 key pair for the DEMONSTRATION of the key-based export signature (scheme eye-customer-export/2) and
 * nothing else. The product never holds a signing key by value: a tenant's key is declared by REFERENCE — the name of a variable
 * of the process environment, `EYE_EXPORT_SIGNING_KEY_<NAME>`, whose value is the one-line base64 of the PKCS8 DER of the private
 * key — resolved at the moment it is needed (the declaration derives and records the PUBLIC key; the build signs the package
 * digest) and never logged, never recorded, never served (apps/api/src/retention/export-signing.ts; the credential store's
 * discipline of B11). So this script writes exactly two things:
 *
 *   stdout   ONE line, `EYE_EXPORT_SIGNING_KEY_DEMO=<base64 of the PKCS8 DER>` — the private key, for the operator to append
 *            to `.eye-local/env` (mode 0600, never committed; the demonstration's local secret handoff, sourced by
 *            scripts/ops/demo-restart.sh) — the only place it ever exists outside this process's memory. Redirect stdout to
 *            that file and nowhere else; nothing else is printed there.
 *   --public-out <file>   the PUBLIC key as SPKI PEM — the customer-side half: what scripts/retention/verify-export.mjs takes
 *            as --public-key, and what the product records and serves once the key is declared. An existing file is not
 *            overwritten (a public key must stay paired with the private line the operator appended).
 *
 * Everything else — the key id `ed25519:<the first 16 hex of sha256(SPKI DER)>` (the product derives the same id at the
 * declaration), the path written, what to do next — goes to STDERR, so that `>> .eye-local/env` receives the one line alone.
 *
 * THE DEMONSTRATION PURPOSE, AND THE PRODUCTION STEP. The key this script makes is declared with purpose 'demonstration'
 * (`POST …/retention/signing-keys/declare { credentialRef: 'EYE_EXPORT_SIGNING_KEY_DEMO', purpose: 'demonstration' }`, by the
 * tenant's or the platform's administrator, after the API was restarted with the new env line — readiness reads the running
 * process, not the file); every package it signs, every read route and every package.sig beside a delivered package says
 * DEMONSTRATION. Production activation is a separate, named step: a production key generated and held under the owner's key
 * custody (a KMS/HSM binding is a later scheme; the reference discipline is the same — the deployment binds
 * `EYE_EXPORT_SIGNING_KEY_<NAME>` from the custody, the product records only the public key), declared with purpose
 * 'production', and the demonstration key RETIRED with a reason (`POST …/retention/signing-keys/<key id>/retire { reason }`
 * — the row stays; a package signed by the retired key still verifies against its recorded public key, and the read route
 * says the key is retired). A retired key's private line is then removed from `.eye-local/env`.
 *
 * Node 18 or later; no dependency, no network, no database.
 */
import { createHash, generateKeyPairSync } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const REF = /^EYE_EXPORT_SIGNING_KEY_[A-Z0-9_]{1,64}$/;
const USAGE = 'usage: node scripts/retention/generate-demo-signing-key.mjs --public-out <file> [--ref EYE_EXPORT_SIGNING_KEY_<NAME>] >> .eye-local/env';

const args = process.argv.slice(2);
let publicOut = null; let ref = 'EYE_EXPORT_SIGNING_KEY_DEMO';
for (let i = 0; i < args.length; i += 1) {
  const a = args[i];
  if (a === '--public-out') { publicOut = String(args[i + 1] ?? ''); i += 1; }
  else if (a === '--ref') { ref = String(args[i + 1] ?? ''); i += 1; }
  else if (a === '--help' || a === '-h') { console.error(USAGE); process.exit(0); }
  else { console.error(`unexpected argument: ${a}\n${USAGE}`); process.exit(2); }
}
if (publicOut === null || publicOut === '') { console.error(USAGE); process.exit(2); }
if (!REF.test(ref)) { console.error(`the reference ${JSON.stringify(ref)} is not EYE_EXPORT_SIGNING_KEY_<NAME> (upper-case letters, digits and underscores, 1 to 64)`); process.exit(2); }
publicOut = resolve(publicOut);
if (existsSync(publicOut)) { console.error(`${publicOut} exists; the public key of an earlier generation is not overwritten — name a new path, or remove it together with the private line it pairs with`); process.exit(2); }

const { privateKey, publicKey } = generateKeyPairSync('ed25519');
const spkiDer = publicKey.export({ type: 'spki', format: 'der' });
const publicPem = publicKey.export({ type: 'spki', format: 'pem' });
const keyId = `ed25519:${createHash('sha256').update(spkiDer).digest('hex').slice(0, 16)}`;

// The public half first (a failure here leaves no private line behind), then the one line on stdout.
writeFileSync(publicOut, publicPem, { mode: 0o644, flag: 'wx' });
process.stdout.write(`${ref}=${privateKey.export({ type: 'pkcs8', format: 'der' }).toString('base64')}\n`);

console.error(`DEMONSTRATION export signing key generated (Ed25519): key id ${keyId}`);
console.error(`  public key (SPKI PEM) written to ${publicOut} — the verifier's --public-key; the product records it at the declaration`);
console.error(`  private key: the one line ${ref}=… on stdout ONLY — append it to .eye-local/env (mode 0600, never committed); nothing else holds it`);
console.error('  next: restart the API with the env line (readiness reads the running process), then declare the key with purpose \'demonstration\':');
console.error(`        POST …/retention/signing-keys/declare { credentialRef: ${JSON.stringify(ref)}, purpose: 'demonstration' }`);
console.error('  production activation is a separate step: a production key under the owner\'s key custody, declared with purpose \'production\', and this key retired with a reason');
