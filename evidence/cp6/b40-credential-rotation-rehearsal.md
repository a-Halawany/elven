# Rotation rehearsal — results (2026-10-21, isolated copy only)

Nothing live was changed: `.eye-local/env` was only READ (fingerprints, the old PUBLIC keys, the old bearers held in-process for the
negative checks), eye_demo was only SELECTed (read-only transactions), the live station directory was only copied, and no request went
to :3401, :3411 or :3443–:3446. No credential value was printed: a scan of every file this rehearsal wrote (107 files: logs, driver
output, the API log, station receipts, the recipient's store, the task outputs) for the eight values (four old, four new) found **0 hits**.

## The rig
| Part | Setting |
|---|---|
| Database | `eye_demo_rot`, restored from `eye_demo-pre-0122-20261019T224914Z.dump` (0 restore errors) and migrated through 0122 by main's `migrate.mjs` under `EYE_HEAVY_SLOTS=1 heavy-slot.sh rot` |
| Code | a detached worktree of main `219846f` (`wt/`, `pnpm install --offline`, `@eye/api` built) — not `b40-res`, which another session moved to `78d4d8bc` mid-run |
| API | `:3421`, env = `rehearsal/env` ONLY (a copy of `.eye-local/env` with only the four values replaced — the other 14 lines hash-identical — plus `EYE_DB_NAME=eye_demo_rot`, `EYE_RUNTIME_PORT=3421`, `EYE_REDIS_PORT=6391`, `EYE_SCHEDULER_ENABLED=false`, the vault roots on the copy); readyz ok |
| Redis | `eye-redis-rot` on 127.0.0.1:6391, `redis@sha256:38117873…` (compose's pin), `redis-server --requirepass` as the eye-redis-b* containers |
| Vault / station | `cp -c -R` clones; the copy's two transfer-station rows repointed at the station clone (the runbook's rehearsal-only SQL, trigger disabled for that one statement, on the copy) |
| Recipients | rehearsal https recipient :3463 and synthetic ERP :3464, both from the rehearsal env |
| Scripts | every driver declared `EYE_ACT_TARGET=rehearsal EYE_DB_NAME=eye_demo_rot EYE_API=http://localhost:3421` (`act-target.mjs` refuses otherwise) |

## Fingerprints (names, key ids, fingerprints only)
| Name | Old (live) | New (rehearsal, now destroyed) |
|---|---|---|
| `EYE_EXECUTIVE_SIGNING_KEY_DEMO` | `ed25519:2b6c48b937b0b8d2` | `ed25519:91fa36fe9a114b24` |
| `EYE_EXPORT_SIGNING_KEY_DEMO` | `ed25519:fcd9d6bf234efb3f` | `ed25519:462c07ca72962ad4` |
| `EYE_DST_NORDWERK_DEMO` | 37 chars, sha256 `e758b5f9…` | 43 chars, sha256 `9021c670…` |
| `EYE_DST_NORDWERK_ERP_DEMO` | 32 chars, sha256 `e6fcd1a5…` | 43 chars, sha256 `a39d8f3c…` |

## Before (offline, `verify-offline.mjs`)
- eye_demo (SELECT only): executive 138/0, platform 25/0 under `2b6c48b9…` with the old public key; export packages 7/0 against the recorded key row.
- eye_demo_rot (the pre-0122 copy): executive 138/0, platform **24**/0 (the live 25th is from the 2026-10-20 act, after the backup); export 7/0.

## The plan's operations, executed on the copy (driver output: `drive-run1..4.txt`, `neg-import.txt`)
| # | Operation / check | Result |
|---|---|---|
| E | API restarted on the rotated env | historical approval / decision / health_snapshot / publication signatures read **`unavailable`** (keyOnFile `91fa36fe…`) — **the hazard, confirmed** |
| E | new executive signature (A. Hoffmann computes, M. Dvořák accepts a health snapshot) | signed by `91fa36fe9a114b24`; the API reads it `verified` |
| E | old executive key unused for new signing | 162 rows under `2b6c48b9…` before and after |
| X | export before the governed binding | **409 `signing_key_mismatch`**, nothing built — and the action left `paused` (needed re-resolve + re-approve) |
| X | `signing-keys/declare {EYE_EXPORT_SIGNING_KEY_DEMO, demonstration}` | new row `462c07ca…`, ACTIVE |
| X | `signing-keys/fcd9d6bf…/retire {reason}` | retired, row + public PEM kept and still SERVED by the list route |
| X | un-retire the old row (direct SQL on the copy) | refused by the table ("retired once; nothing else changes") |
| X | the paused export, re-resolved, re-approved (H. Bergmann), executed, verified | package signed by `462c07ca…`, verified |
| X | `verify-export.mjs` on the new package | NEW key: verified; OLD key: not verified |
| X | three historical station packages (`01a0a957…`, `01a0aacd…`, `01a0a737…`) | all verify with the retained OLD public key |
| X | station delivery + recipient run with the NEW public key + collect | receipt verified → **ACKNOWLEDGED** |
| P | mirror: partner `nordwerk-origin` retired, redeclared with the new PEM (same party/purpose/intake contract) | active `462c07ca…`, retired `fcd9d6bf…` |
| P | mirror imports the new package from the station | all checks pass; signature "verified … with the partner's key `462c07ca…`" |
| P | mirror offered two OLD-key packages after the rotation | **refused**: "no exchange partner of this domain holds key `fcd9d6bf…`" (quarantined, not verified) |
| B | delivery to `nordwerk-exports-demo` (product side) | credential gate passed (reference bound); failed `transport/dns_failure` at the egress, as on the live demo — nothing left the process |
| B | https recipient :3463 `GET /_received` | old bearer **401**, new bearer **200**, none 401 |
| R | synthetic ERP :3464 `GET /_received` | old bearer **401**, new bearer **200**, none 401 |
| R | target `nordwerk-purchasing-demo` retired; `nordwerk-purchasing-demo-r2` declared (endpoint :3464, the new cert `D8:F5:86:E0…` as anchor, ref `EYE_DST_NORDWERK_ERP_DEMO`) | both acts accepted; targets/list shows `-r2` active |

Driver tallies: run 1 21 PASS / 7 FAIL (the 7 = the paused export and the ERP cert read, both rig defects fixed in runs 2–4; the
station/https/import fails cascaded from the paused export); run 2 12 PASS (then a driver null-ref); run 3 2 PASS (then a missing
helper); run 4 4 PASS / 1 expected refusal (the duplicate import of run 3's package). Every plan operation and check passed once.

## After (offline, `after-eye_demo_rot.txt`)
- With old + new executive public keys: executive 138 (old) + 1 (new) verified, platform 24 verified, 0 failed.
- With the NEW key only (what the API holds today): executive 0 of 138 and platform 0 of 24 verifiable — the hazard in numbers.
- Export packages: 7 under the retired `fcd9d6bf…` verify against the retained row; 1 under `462c07ca…`.
- Deliveries: `fcd9d6bf…` acknowledged 5 / failed 3 / mismatched 1 (unchanged); `462c07ca…` acknowledged 1, failed 1 (the https egress).
- Keys: `462c07ca…` active, `fcd9d6bf…` retired. Partners: `nordwerk-origin` `462c07ca…` active, `fcd9d6bf…` retired.
  Targets: `nordwerk-purchasing-demo` retired, `nordwerk-purchasing-demo-r2` active.

## What needs software (stopped there; detailed in PLAN.md §3)
- **S1 (required):** historical EXECUTIVE signatures stay verifiable only if the software retains the old public key as a
  verification-only key (`signature.service.ts` `verifyOutcome` + the conformance `PlatformSigner.verify`; no migration). Without it the
  API reads all 162/163 historical signatures `unavailable`. Offline verification with the captured old public key succeeds (138 + 24).
- **S2 (confirmed):** the key list reported the old row `readiness=bound` while its reference derived the NEW key.
- **S3:** `act-b34.mjs`'s hard-coded target key.
- Not exercised: a product-path ERP handoff to `-r2` (needs a commitment item).

## Cleanup
API on :3421 stopped; `eye-redis-rot` removed; `eye_demo_rot` dropped; `rehearsal/env`, the two generated private keys and the two
generated bearers removed with `rm -P`; the vault/station clones and the rehearsal recipient's store removed; the `wt/` worktree removed.
Kept: `PLAN.md`, `REHEARSAL.md`, the tools (`fp.mjs`, `gen-rehearsal.mjs`, `verify-offline.mjs`, `leak-scan.mjs`, the drivers), the
OLD public keys in `old-pub/` (public material), the result files.
