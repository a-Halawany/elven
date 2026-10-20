> **Status (2026-10-21):** PREPARED and REHEARSED on an isolated copy only — NOT executed live; the live rotation waits for the owner's
> authorization. Corrects the earlier count: FOUR demonstration-only values were exposed (two signing keys, two delivery bearers), not three.
> The minimum software work this plan names (retired executive public keys for verification only, `EYE_EXECUTIVE_VERIFY_KEYS_FILE`) is
> built on `b40/res` (49705c8f, unit 2/2). Names, key ids and fingerprints only; no value appears in this file.

# Rotation plan — the four exposed demonstration credentials of The Eye

Status: PREPARED and REHEARSED on an isolated copy (see `REHEARSAL.md` beside this file). **No live change is authorized by this
document.** The live run is the operator's, in one announced window, after the owner's go-ahead.

Rule for every step: no credential VALUE is printed, logged, committed or pasted. Values are compared by fingerprint only:
an Ed25519 private key by its public `key_id` (`ed25519:<first 16 hex of sha256(SPKI DER)>`); a bearer by its length and the first
8 hex of `sha256(value)`. Tools: `fp.mjs` (fingerprints of the four names in an env file; `--pub-out <dir>` writes the PUBLIC keys),
`verify-offline.mjs` (re-verifies every recorded signature outside the API), both in this directory.

Code examined: main `219846f` (worktree `.claude/worktrees/b40-res`), read only.

---

## 1. What each credential is, who reads it, and what refers to it

| Name (in `.eye-local/env`) | Today (fingerprint) | What it is |
|---|---|---|
| `EYE_EXECUTIVE_SIGNING_KEY_DEMO` | `ed25519:2b6c48b937b0b8d2` | Ed25519 private key (base64 PKCS8 DER), the executive/platform signing key |
| `EYE_EXPORT_SIGNING_KEY_DEMO` | `ed25519:fcd9d6bf234efb3f` | Ed25519 private key, the tenant's customer-export signing key (B13) |
| `EYE_DST_NORDWERK_DEMO` | 37 chars, sha256 `e758b5f9…` | bearer of the https destination `nordwerk-exports-demo` (B14) |
| `EYE_DST_NORDWERK_ERP_DEMO` | 32 chars, sha256 `e6fcd1a5…` | bearer of the synthetic ERP target `nordwerk-purchasing-demo` (B34) |

### 1.1 `EYE_EXECUTIVE_SIGNING_KEY_DEMO`
- **Readers (process / code path):** the API on :3401 (`demo-restart.sh` sources `.eye-local/env`). The reference name is
  `process.env.EYE_EXECUTIVE_SIGNING_KEY_REF ?? 'EYE_EXECUTIVE_SIGNING_KEY_DEMO'`, read at the moment of signing by
  `apps/api/src/executive/signatures/signature.service.ts` (`SignatureService.sign/publicKey/verifyOutcome`) and its delegates —
  `governance/workspace/platform-signing.ts`, `governance/ownership/platform-signer.ts`, `governance/design/design-signing.ts`,
  `governance/design/themes/themes-signing.ts` — plus one COPY of the idiom, `governance/conformance/platform-signer.ts`
  (`PlatformSigner`, its own `verify`). `build-identity.ts` records the reference NAME (`EYE_EXECUTIVE_SIGNING_KEY_REF`), never a value.
  The harnesses (`playwright.config.ts`, the int tests) generate their own pair; no act script reads the value.
- **What it signs:** Ed25519 over the ASCII hex of a subject digest — gate approvals/decisions, publications, the queue's
  accept-priority, plan baselines, briefings, health-snapshot acceptances, product releases, metric certifications, B94 records,
  acceptance attestations, design acceptances (`executive.signatures`, via `executive.record_signature`) and the PLATFORM signatures
  (`governance.signatures`, via `governance.record_platform_signature` / `dg_record_signature` / `cm_attest_candidate` /
  `theme_record_signature`).
- **How the database refers to it:** ONLY by `key_id` text on each signature row. **No public key is stored anywhere**, no key
  registry, no `rotated_from`. On eye_demo (read-only SELECT, 2026-10-21): `executive.signatures` 138 rows (2026-09-30 → 10-19) and
  `governance.signatures` 25 rows (10-15 → 10-20), all `ed25519:2b6c48b937b0b8d2`; ~25 tables carry a `signature_id` pointing at them.
- **What verifies its outputs later:** `SignatureService.verifyOutcome` (citations `…/graph/citations/signatures`, trust
  "verify again" `…/graph/trust/verify` which RECORDS the outcome in `graph.trust_verifications`, the gate record, attention view,
  conformance candidates, acceptance/onboarding/support/workspace/ownership reads) and `PlatformSigner.verify`. Offline: anyone with the
  public key the gate record serves (`signing_key` = the CURRENTLY bound key only).

### 1.2 `EYE_EXPORT_SIGNING_KEY_DEMO`
- **Readers:** the API (`apps/api/src/retention/export-signing.ts` `ExportSigningKeyStore`, by the `credential_ref` recorded on the
  key row) at the declaration (derive the public key), at every export build (`retention.service.ts` — refuses
  `signing_key_mismatch` when the bound value derives a key other than the active row's), and for revocation notices
  (`revocation-notice.ts` `signNotice`: the package's key if bound AND deriving that key id, else the active key with
  `signed_with: 'active_key'` inside the signed bytes). Generator: `scripts/retention/generate-demo-signing-key.mjs`.
- **What it signs:** export packages (scheme `eye-customer-export/2`, over the package digest) and revocation notices
  (`eye-revocation-notice/1`).
- **Database:** `retention.export_signing_keys` — TENANT row `ed25519:fcd9d6bf234efb3f`, `credential_ref EYE_EXPORT_SIGNING_KEY_DEMO`,
  purpose `demonstration`, declared 2026-09-15, active, **public key PEM recorded**; retire-once (`rsk_retire_only`); active key =
  newest non-retired (`retention.active_export_signing_key`). `retention.export_packages.signing_key_id`: 7 packages (2 more are
  pre-key `/1`); `retention.export_deliveries.signing_key_id`: 9. The mirror domain's `retention.exchange_partners` row
  `nordwerk-origin` holds the SAME public key (`ed25519:fcd9d6bf234efb3f`) — the importer's trust in the origin.
- **Verifiers:** customer side `scripts/retention/verify-export.mjs --public-key` (one key; `fetch-export.mjs` passes it through);
  `transfer-station-recipient.mjs --public-key` and `https-recipient.mjs --public-key` (both started with
  `.eye-local/export-signing-demo.pub.pem` = `fcd9d6bf…`); the import guard (`import-package.ts` check `signature` against the
  PARTNER's recorded PEM) and the station-notice check (`import.service.ts verifyStationNotice`: the import's partner key, then any
  other partner of the SAME party holding the notice's key — this is the rotation path, recorded as `rotated_from`).

### 1.3 `EYE_DST_NORDWERK_DEMO`
- **Readers:** the API's `DestinationCredentialStore` (`export-signing.ts`) by `retention.export_destinations.credential_ref`, carried
  as `authorization: Bearer` on the first hop of a delivery to `nordwerk-exports-demo` (endpoint
  `https://nordwerk-exports.demo.invalid:3443/receive`, trust anchor = the recipient's certificate, sha256 `16:46:A3:1C…`); and the
  demonstration recipient `scripts/retention/https-recipient.mjs` (pid on :3443, started 2026-09-16 with `--bearer-env
  EYE_DST_NORDWERK_DEMO`; it read the value ONCE at start).
- **Database:** the reference NAME only (the destination row); never the value. Deliveries: 1 (`failed transport`, as designed —
  the `.invalid` name resolves nowhere; the positive exchange is the harness's).
- `EYE_DST_NORDWERK` (production destination) is UNBOUND on this host and is not part of this rotation.

### 1.4 `EYE_DST_NORDWERK_ERP_DEMO`
- **Readers:** the API's commitment execution path (`decision/commitments/commitment.service.ts` — `credentials.has/resolve` by
  `decision.execution_targets.credential_ref`, the synthetic loopback path); the synthetic ERP `scripts/execution/synthetic-erp.mjs`
  (pid on :3444, started 2026-09-28 with `--bearer-env`; read once); `act-b34.mjs` reads it for its `/_control` call.
- **Database:** target `nordwerk-purchasing-demo` (endpoint `https://127.0.0.1:3444`, trust anchor = the ERP's self-signed cert,
  sha256 `FA:98:B6:35…`, the cert generated in a temp dir whose private key no longer exists on disk); 3 handoffs, all `reconciled`
  (none in flight). Targets are retire-only and a target key is NEVER redeclared.

## 2. The verification hazard (as found)

- **Executive key — REAL.** `SignatureService.verifyOutcome` resolves a public key ONLY as "the key the currently bound reference
  derives, if its key id equals the row's" (`publicKeyPem` argument aside, which no production caller passes). `PlatformSigner.verify`
  (conformance copy) is stricter: anything else is `false`. Nothing retains a historical public key — not the database, not a file.
  Replacing the env value alone therefore turns all 163 historical signatures into `unavailable` / `verified: false` in every read,
  and a trust "verify again" would RECORD `unavailable`. Nothing is blocked (no act depends on re-verifying an old row), but the
  evidence is degraded until the old PUBLIC key is retained by the software. **The degradation is reversible only if the old public key
  is captured BEFORE the env value is replaced** (it is derivable only from the private key) — step L2 below.
- **Export key — handled by the software.** Every package names its `signing_key_id`; the key row keeps its PUBLIC key after
  retirement; the read routes serve it; the customer's verifier takes the PEM. The env-only change makes the build refuse
  `signing_key_mismatch` until the new key is declared — safe, and the reason the declaration must follow in the same window.
- **Recipients and importer** hold ONE public key each (the recipients' `--public-key` file, the mirror's partner row): new packages
  and new notices need the new public key on their side in the same window; historical packages need the OLD public key (keep the file).

## 3. Minimum software work

**S1 (required to keep historical EXECUTIVE signatures verifiable after rotation) — verification-only retained public keys.** No migration.
1. `apps/api/src/executive/signatures/signature.service.ts`: add an exported `retainedExecutiveKey(keyId): string | null` that reads
   the file named by `EYE_EXECUTIVE_VERIFY_KEYS_FILE` (a PEM bundle of retired executive PUBLIC keys — public material, not a secret),
   parses each `-----BEGIN PUBLIC KEY-----` block, keeps only Ed25519 keys, computes each key id itself (never trusts a label), caches by
   the file's mtime. In `verifyOutcome`, resolve `pem = publicKeyPem ?? (bound key if keyId matches) ?? retainedExecutiveKey(row.key_id)`;
   the `verified` reason names "the retained verification-only key". `sign()` is unchanged — only the bound PRIVATE key signs, so a
   retired key can never sign again.
2. `apps/api/src/governance/conformance/platform-signer.ts` `verify()`: the same fallback (`retainedExecutiveKey`).
3. A unit test (`apps/api/test/unit/executive-signature-retained-keys.test.ts`): sign with A; bind B and retain A → `verified`; without
   the file → `unavailable`; an unknown key id → `unavailable`; a non-Ed25519 block ignored; `sign()` names B.
4. Runbook: the file `.eye-local/executive-verify-keys.pem` and the variable in `.eye-local/env`.
Residual (stated, not built): the retained key verifies regardless of the row's `signed_at`; signature rows are written only through the
ports, so a forgery needs database write access. A governed `executive.signing_keys` registry (declare/retire like
`retention.export_signing_keys`, with a not-after) is the production design — a later batch, not this rotation.

**S2 (recommended, small; CONFIRMED in the rehearsal) — the export key list's readiness.** `retention.service.ts` reports `readiness: bound` when the reference holds
ANY value, including one that derives another key (rehearsal: the retired-to-be row read `bound` while its reference derived the new
key). Compare `derivePublic(ref).keyId === key_id` and report `mismatch`. Cosmetic for the operator; not a blocker.

**S3 (scripts, needed only to re-run acts after the rotation).** `scripts/phase6/act-b34.mjs` hard-codes `TARGET_KEY =
'nordwerk-purchasing-demo'` (a retired target fails its `state === 'active'` check): read `process.env.ACT_ERP_TARGET_KEY ?? …`.
Optional: `synthetic-erp.mjs --cert/--key` (as `https-recipient.mjs` has) so a later ERP restart keeps its anchor.

## 4. The live run — operations in order (one window; the operator runs them; nothing here is executed by an agent)

Prerequisite decision: deploy S1 first (recommended), OR rotate now and accept that historical executive signatures read `unavailable`
until S1 lands (the captured old public key from L2 restores them then). The export/bearer rotations do not depend on S1.

**L0. Announce and freeze.** No act, walk or gate runs against :3401 during the window.

**L1. Backups (recovery material).**
- `pg_dump -Fc eye_demo` → `.eye-local/backups/eye_demo-pre-rotation-<UTC>.dump` (the runbook's backup form).
- `cp -p .eye-local/env .eye-local/backups/env-pre-rotation-<UTC>` (mode 0600; it contains the EXPOSED values — kept only until the
  window is signed off, then `rm -P`).
- `cp -p .eye-local/export-signing-demo.pub.pem .eye-local/export-signing-demo.fcd9d6bf234efb3f.pub.pem`;
  `cp -p .eye-local/execution-erp-demo/cert.pem .eye-local/execution-erp-demo/cert-pre-rotation.pem`.

**L2. Capture the OLD public keys (before anything changes).** `node fp.mjs .eye-local/env --pub-out .eye-local/` → writes
`EYE_EXECUTIVE_SIGNING_KEY_DEMO.2b6c48b937b0b8d2.pub.pem` and `EYE_EXPORT_SIGNING_KEY_DEMO.fcd9d6bf234efb3f.pub.pem` (public only);
`cp` the executive one to `.eye-local/executive-verify-keys.pem` (S1's bundle). Record the key ids + fingerprints.

**L3. Baseline (before).** `verify-offline.mjs eye_demo .eye-local/EYE_EXECUTIVE_SIGNING_KEY_DEMO.2b6c48b937b0b8d2.pub.pem` (SELECT
only) → expect executive 138/0, platform 25/0, export packages 7/0 verified/failed; record counts per key id (§1); the keys,
partners, destinations, targets lists.

**L4. Generate the new values OUTSIDE the repository** (e.g. `$S/rot-live/`, 0700): two `crypto.generateKeyPairSync('ed25519')`
private keys (base64 PKCS8 DER, written to 0600 files, public PEMs beside them) and two `randomBytes(32).toString('base64url')` bearers
(0600 files) — `gen-rehearsal.mjs` is the template (its env-writing half is replaced by L5).

**L5. Write them into `.eye-local/env`** — the operator replaces exactly the four lines (keep the names), writing to a 0600 temp file in
`.eye-local/` and `mv` over the original; add `EYE_EXECUTIVE_VERIFY_KEYS_FILE=<abs path of .eye-local/executive-verify-keys.pem>` if S1
is deployed. Check: `node fp.mjs .eye-local/env` shows the NEW key ids/fingerprints; `sed 's/=.*/=<set>/' .eye-local/env` shows the
same names; every other line's hash unchanged. Put the new export public PEM at `.eye-local/export-signing-demo.<newid>.pub.pem` and
copy it over `.eye-local/export-signing-demo.pub.pem` (every runbook command keeps working).

**L6. Restart the API** — `scripts/ops/demo-restart.sh` (sources the env; verifies eye_demo and readyz). From here new executive
signatures carry the new key id; the export build refuses `signing_key_mismatch` until L7.

**L7. Bind the new export key through the governed path** (platform administrator, domain route):
`POST …/retention/signing-keys/declare { credentialRef: 'EYE_EXPORT_SIGNING_KEY_DEMO', purpose: 'demonstration' }` → the new row
(the server derives the public key from the bound value; it becomes the ACTIVE key as the newest); then
`POST …/retention/signing-keys/ed25519:fcd9d6bf234efb3f/retire { reason: 'rotated: the private key was printed into an operator
session output (2026-10-21)' }` → retired once, row and public key kept. **Rehearsal-found:** an export executed between L6 and
L7 is refused `signing_key_mismatch` (409) AND left `paused`; it then needs a fresh `resolve` and a second-principal `approve` before it
executes — keep the gap empty (L0's freeze), or re-resolve/re-approve any action caught in it. (Same reference name: the old row now points at a value that
derives another key — it is retired, so nothing signs with it.)

**L8. The importer (mirror domain).** Platform administrator on the mirror domain: `POST …/retention/partners/<old partner id>/retire
{ reason }` then `POST …/retention/partners/declare { partnerKey: 'nordwerk-origin', party: <the same party string>, purpose: <same>,
publicKeyPem: <new export public PEM>, intakeSourceId, intakeContractVersion: <the old row's> }`. (Same `partner_key` so act-b16/b17
keep working; same party so a revocation notice of an import admitted under the old partner verifies through the new row,
`rotated_from`.) No import is mid-flight on eye_demo (1 admitted, 1 revoked, 1 quarantined pre-partner).

**L9. The https recipient (:3443), same window.** Stop the pid on :3443; restart with the runbook §8 command
(`--cert/--key .eye-local/https-recipient-demo/…` — the SAME certificate, so the destination's anchor still matches; `--bearer-env
EYE_DST_NORDWERK_DEMO` now the new value; `--public-key .eye-local/export-signing-demo.pub.pem` now the new key). The destination row is
unchanged (it holds only the reference name).

**L10. The synthetic ERP (:3444), same window.** Stop the pid on :3444; start it as runbook §13 does (new value in the environment);
take the certificate it SERVES (`openssl s_client -connect 127.0.0.1:3444 </dev/null | openssl x509` — public; in the rehearsal the
printed temp path was already gone when read) into `.eye-local/execution-erp-demo/cert.pem`. The old certificate's private key is gone, so the anchor
changes: T. Richter `POST …/commitments/targets/nordwerk-purchasing-demo/retire { reason }` and `POST …/commitments/targets
{ targetKey: 'nordwerk-purchasing-demo-r2', label, endpoint: 'https://127.0.0.1:3444', trustAnchorPem: <new cert>, credentialRef:
'EYE_DST_NORDWERK_ERP_DEMO', synthetic: true }`. Apply S3 before act-b34 is re-run.

**L11. Preservation checks (after)** — each recorded with names, key ids, fingerprints, counts, verdicts only:
1. `verify-offline.mjs eye_demo <old exec pub> <new exec pub>`: executive 138 + platform 25 under the old id still verify (offline),
   new rows verify under the new id; export 7 old packages verify against the RETAINED row; any new package against the new row.
2. Counts per key id: old executive id stays 163 (no new signature under it); export packages under `fcd9d6bf…` stay 7.
3. One new executive signature (e.g. a health-snapshot acceptance) names the new key id and reads `verified` in the API; with S1
   deployed, a historical signature reads `verified` (without S1: `unavailable` — the known hazard).
4. `signing-keys/list`: new key ACTIVE `bound`; old `retired`; its public PEM still served. The old key cannot sign: it is not bound,
   and a retired row cannot be un-retired (the table refuses).
5. One new customer export: built with the new `signing_key_id`, `verify` passes; `verify-export.mjs` passes with the new PEM and FAILS
   with the old; a historical station package still passes with `export-signing-demo.fcd9d6bf234efb3f.pub.pem`; station delivery
   acknowledged by the recipient run with the new PEM; the mirror imports it (partner check passes on the new key).
6. (Not exercised in the rehearsal: a product-path ERP handoff — no handoff is in flight and a new one needs a commitment item; after
   S3, act-b34's handoff scene against `nordwerk-purchasing-demo-r2` is the product-path check.)
7. Bearers: `GET https://127.0.0.1:3443/_received` and `:3444/_received` — old bearer 401, new 200; a delivery to
   `nordwerk-exports-demo` passes the credential gate (fails at the egress as designed, not `credential_unbound`).

**L12. Close.** `rm -P` the generated files in `$S/rot-live/`; after the owner signs off, `rm -P .eye-local/backups/env-pre-rotation-*`
(the DB dump holds no credential value). Record the new key ids/fingerprints and the window in the runbook and PHASE6 records.

## 5. Recovery

- **Before L7 (only env/files changed):** `cp -p .eye-local/backups/env-pre-rotation-<UTC> .eye-local/env`; `demo-restart.sh`;
  restart :3443/:3444 from that env. The database is untouched. (This re-binds the exposed values — a stop-gap, not an end state.)
- **After L7–L10 (rows written):** the rows are append-only/retire-once — they cannot be undone in place. Prefer ROLL-FORWARD: generate
  another value, declare it, retire the faulty one (the same L7–L10 acts). A full rollback = the governed restore of
  `eye_demo-pre-rotation-<UTC>.dump` (docs/ops/BACKUP_RESTORE.md §7: stop the API, restore into a fresh database, rename) + the env
  backup + the old recipient/ERP certificate files — and it re-exposes the leaked values, so it is a last resort.
- The old PUBLIC keys (L2) are kept permanently; losing them is the one irreversible failure for the executive signatures.
